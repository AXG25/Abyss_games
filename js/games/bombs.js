// 💣 Lluvia de bombas — tiempo real. Caen bombas sobre la plataforma: su
// sombra roja avisa dónde van a explotar. Además hay cajas que estorban (y
// otras que caen del cielo) y barriles que ruedan: SALTA para pasarlos por
// encima y ACELERA para escapar rápido. 3 vidas.
import { mulberry32 } from '../util.js';
import { DT, TAU, mountRT, simulateBot, newPlayerBase, moveBasic, clampCircle, drawPlayer, evalSurvival } from '../rt.js';

const TOTAL = 35;
const LIVES = 3;
const ARENA = 0.9;
const PR = 0.06;
const FUSE = 1.3;
const BOOM = 0.35;
const JUMP = 0.6;
const BR = 0.065;      // radio de los barriles
const AIR = (p) => p.jt > 0.06 && p.jt < JUMP - 0.05;

// caja en (x, y) con medio lado h: empuja al jugador hacia afuera
function pushOutBox(p, c) {
  const qx = Math.max(c.x - c.h, Math.min(c.x + c.h, p.x));
  const qy = Math.max(c.y - c.h, Math.min(c.y + c.h, p.y));
  let dx = p.x - qx, dy = p.y - qy;
  const d = Math.hypot(dx, dy);
  if (d >= PR) return false;
  if (d < 1e-5) { // adentro: salir por el lado más cercano
    const ox = c.h - Math.abs(p.x - c.x), oy = c.h - Math.abs(p.y - c.y);
    if (ox < oy) p.x = c.x + Math.sign(p.x - c.x || 1) * (c.h + PR);
    else p.y = c.y + Math.sign(p.y - c.y || 1) * (c.h + PR);
    return true;
  }
  p.x = qx + (dx / d) * PR;
  p.y = qy + (dy / d) * PR;
  return true;
}
const crateOn = (c, t) => t >= c.t0 && t < c.gone;
const barrelAt = (b, t) => {
  const k = (t - b.t0) * b.v;
  if (k < 0 || k > b.len) return null;
  return { x: b.x0 + b.dx * k, y: b.y0 + b.dy * k, k };
};

const G = {
  TOTAL, LIVES, lives: LIVES,
  action: 'SALTA',
  actionIcon: 'jump',
  action2: 'ACELERA',
  actionIcon2: 'bolt',
  cd1: (p) => (p.jt > 0 ? Math.min(1, (p.jt + 0.1) / (JUMP + 0.1)) : p.jcd > 0 ? p.jcd / (JUMP + 0.1) : 0),
  cd2: (p) => (p.dcd > 0 ? p.dcd / 1.3 : 0),

  world(seed) {
    const r = mulberry32(seed ^ 0xb0b0);
    const bombs = [];
    const rndPos = (maxR) => { const a = r() * TAU, d = Math.sqrt(r()) * maxR; return [Math.cos(a) * d, Math.sin(a) * d]; };
    let t = 1;
    while (t < TOTAL - 1) {
      const rad = 0.19 + t * 0.0035;
      const k = r();
      if (k < 0.65 || t < 6) {
        const [x, y] = rndPos(0.85);
        bombs.push({ t0: t, x, y, r: rad });
        t += Math.max(0.2, 0.8 - t * 0.022);
      } else if (k < 0.82) {
        // anillo de bombas
        const [cx, cy] = rndPos(0.35);
        const n = 7, rr = 0.55;
        const a0 = r() * TAU;
        for (let i = 0; i < n; i++) bombs.push({ t0: t, x: cx + Math.cos(a0 + (i * TAU) / n) * rr, y: cy + Math.sin(a0 + (i * TAU) / n) * rr, r: rad * 0.9 });
        t += 1.6;
      } else {
        // línea que barre la plataforma
        const a = r() * TAU;
        const dx = Math.cos(a), dy = Math.sin(a);
        for (let i = -3; i <= 3; i++) bombs.push({ t0: t + (i + 3) * 0.12, x: dx * i * 0.27, y: dy * i * 0.27, r: rad * 0.85 });
        t += 1.8;
      }
    }
    bombs.forEach((b, i) => { b.te = b.t0 + FUSE; b.id = i; });

    // ---- cajas: unas desde el inicio y otras que caen del cielo
    const spawns = [0, 1, 2, 3, 4].map((i) => { const a = -Math.PI / 2 + (i * TAU) / 4 + 0.4; return [Math.cos(a) * 0.55, Math.sin(a) * 0.55]; });
    const crates = [];
    const freeSpot = (minD) => {
      for (let k = 0; k < 40; k++) {
        const a = r() * TAU, d = 0.15 + Math.sqrt(r()) * 0.6;
        const x = Math.cos(a) * d, y = Math.sin(a) * d;
        if (spawns.some(([sx, sy]) => Math.hypot(sx - x, sy - y) < minD)) continue;
        if (crates.some((c) => Math.hypot(c.x - x, c.y - y) < 0.26)) continue;
        return [x, y];
      }
      return null;
    };
    for (let i = 0; i < 5; i++) { const s0 = freeSpot(0.24); if (s0) crates.push({ x: s0[0], y: s0[1], h: 0.06 + r() * 0.025, t0: 0, rot: r() * 0.5 }); }
    for (const td of [9, 16, 22, 28]) { const s0 = freeSpot(0); if (s0) crates.push({ x: s0[0], y: s0[1], h: 0.065 + r() * 0.02, t0: td, drop: true, rot: r() * 0.5 }); }
    crates.forEach((c, i) => { c.id = i; c.gone = Infinity; });

    // ---- barriles que ruedan cruzando la plataforma
    const barrels = [];
    let tb = 5;
    while (tb < TOTAL - 1) {
      const a = r() * TAU;
      const x0 = Math.cos(a) * (ARENA + 0.1), y0 = Math.sin(a) * (ARENA + 0.1);
      const ta = r() * TAU, td = r() * 0.35;
      const tx = Math.cos(ta) * td - x0, ty = Math.sin(ta) * td - y0;
      const l = Math.hypot(tx, ty);
      const dx = tx / l, dy = ty / l;
      barrels.push({ t0: tb, x0, y0, dx, dy, v: 0.7 + r() * 0.35 + tb * 0.008, len: 2 * (ARENA + 0.1) });
      if (tb > 18 && r() < 0.5) { // a veces vienen en pareja
        const a2 = a + Math.PI * (0.6 + r() * 0.8);
        const x2 = Math.cos(a2) * (ARENA + 0.1), y2 = Math.sin(a2) * (ARENA + 0.1);
        const l2 = Math.hypot(x2, y2);
        barrels.push({ t0: tb + 0.6, x0: x2, y0: y2, dx: -x2 / l2, dy: -y2 / l2, v: 0.8 + r() * 0.3, len: 2 * (ARENA + 0.1) });
      }
      tb += Math.max(2.2, 5 - tb * 0.08) + r() * 1.5;
    }
    barrels.forEach((b, i) => { b.id = i; });
    // un barril rompe la primera caja que toca
    for (const c of crates) {
      for (const b of barrels) {
        for (let k = 0; k <= b.len; k += 0.02) {
          const x = b.x0 + b.dx * k, y = b.y0 + b.dy * k, tt = b.t0 + k / b.v;
          if (tt < c.t0 + 0.8 || tt >= c.gone) continue;
          if (Math.abs(x - c.x) < c.h + BR && Math.abs(y - c.y) < c.h + BR) { c.gone = tt; c.by = b.id; break; }
        }
      }
    }
    return { bombs, crates, barrels };
  },

  spawn(i) {
    const a = -Math.PI / 2 + (i * TAU) / 4 + 0.4;
    const p = newPlayerBase(Math.cos(a) * 0.55, Math.sin(a) * 0.55, LIVES);
    p.bi = 0;
    p.jt = 0;
    p.jcd = 0;
    return p;
  },

  step(p, inp, t, W) {
    if (p.out) return null;
    p._ev = null;
    // botón 1 = saltar; botón 2 = acelerar (moveBasic usa p.act para el impulso)
    const wantJump = p.act;
    p.act = !!p.act2;
    p.act2 = false;
    moveBasic(p, inp, 0.62);
    if (wantJump && p.jt <= 0 && p.jcd <= 0) { p.jt = JUMP; p._ev = 'jump'; }
    if (p.jt > 0) {
      p.jt -= DT;
      p.z = p.jt > 0 ? Math.sin(Math.PI * (1 - p.jt / JUMP)) : 0;
      if (p.jt <= 0) { p.jcd = 0.1; p.z = 0; }
    } else if (p.jcd > 0) p.jcd -= DT;
    // cajas: estorban (saltando se pasan por encima)
    if (!AIR(p)) for (const c of W.crates) if (crateOn(c, t)) pushOutBox(p, c);
    clampCircle(p, ARENA - PR);
    if (p.inv <= 0) {
      // caja que te cae encima
      for (const c of W.crates) {
        if (c.drop && t >= c.t0 && t < c.t0 + DT && Math.abs(p.x - c.x) < c.h + PR * 0.6 && Math.abs(p.y - c.y) < c.h + PR * 0.6) {
          p.h--; p.inv = 1.1; pushOutBox(p, c);
          if (p.h <= 0) { p.out = true; p.tOut = t; return 'out'; }
          return 'hit';
        }
      }
      // barril que te atropella (si no lo saltas)
      if (!AIR(p)) {
        for (const b of W.barrels) {
          if (b.t0 > t) break;
          const q = barrelAt(b, t);
          if (!q) continue;
          if (Math.hypot(p.x - q.x, p.y - q.y) < PR + BR) {
            p.h--; p.inv = 1.1;
            p.x += b.dx * 0.12 - b.dy * 0.1; p.y += b.dy * 0.12 + b.dx * 0.1;
            clampCircle(p, ARENA - PR);
            if (p.h <= 0) { p.out = true; p.tOut = t; return 'out'; }
            return 'hit';
          }
        }
      }
    }
    const B = W.bombs;
    while (p.bi < B.length && B[p.bi].te < t - 0.2) p.bi++;
    for (let i = p.bi; i < B.length && B[i].t0 <= t; i++) {
      const b = B[i];
      if (t >= b.te && t < b.te + DT && p.inv <= 0 && Math.hypot(p.x - b.x, p.y - b.y) < b.r + PR * 0.7) {
        p.h--;
        p.inv = 1.1;
        if (p.h <= 0) { p.out = true; p.tOut = t; return 'out'; }
        return 'hit';
      }
    }
    return p._ev;
  },

  brain(seed, idx, W) {
    const r = mulberry32((seed ^ (0x3c6ef372 * (idx + 1))) >>> 0);
    const skill = 0.6 + r() * 0.22;
    let gx = 0, gy = 0, next = 0;
    const seen = new Map();
    return (p, t) => {
      if (t > next) { const a = r() * TAU, d = r() * 0.6; gx = Math.cos(a) * d; gy = Math.sin(a) * d; next = t + 1 + r() * 2; }
      let vx = 0, vy = 0, danger = false;
      const B = W.bombs;
      for (let i = p.bi; i < B.length && B[i].t0 <= t; i++) {
        const b = B[i];
        const left = b.te - t;
        if (left < 0 || left > 1.1) continue;
        const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1e-3;
        if (d > b.r + PR + 0.08) continue;
        if (!seen.has(b.id)) seen.set(b.id, r() < skill);
        if (!seen.get(b.id)) continue; // no la vio
        danger = true;
        vx += dx / d; vy += dy / d;
        if (left < 0.45 && d < b.r && r() < 0.06) p.act2 = true;
      }
      // barril que viene: saltar en el momento justo
      for (const br of W.barrels) {
        if (br.t0 > t) break;
        const q = barrelAt(br, t);
        if (!q) continue;
        const dx2 = p.x - q.x, dy2 = p.y - q.y;
        const ahead = dx2 * br.dx + dy2 * br.dy;
        const side = Math.abs(dx2 * br.dy - dy2 * br.dx);
        if (ahead > 0 && side < PR + BR + 0.02) {
          const tti = (ahead - PR - BR) / br.v;
          const key = 'b' + br.id;
          if (tti < 0.16 && !seen.has(key)) { seen.set(key, 1); if (r() < skill + 0.15) p.act = true; }
        }
      }
      // rodear cajas: empujón lateral si hay una enfrente
      for (const c of W.crates) {
        if (!crateOn(c, t)) continue;
        const dx2 = c.x - p.x, dy2 = c.y - p.y, d2 = Math.hypot(dx2, dy2);
        if (d2 < c.h + PR + 0.1) { vx -= dy2 / d2 * 0.8; vy += dx2 / d2 * 0.8; danger = danger || d2 < c.h + PR + 0.03; }
      }
      if (danger) {
        // alejarse, pero sin salirse
        vx -= p.x * 0.6; vy -= p.y * 0.6;
        const l = Math.hypot(vx, vy) || 1;
        return { x: vx / l, y: vy / l };
      }
      const dx = gx - p.x, dy = gy - p.y, l = Math.hypot(dx, dy);
      return l > 0.05 ? { x: (dx / l) * 0.7, y: (dy / l) * 0.7 } : { x: 0, y: 0 };
    };
  },

  result: (p) => ({ h: Math.max(0, p.h), t: p.out ? Math.round(p.tOut * 1000) : TOTAL * 1000 }),

  music: 'volcano',
  events(t0, t1, W, ext, ents, fx) {
    for (const c of W.crates) {
      // caja que cae: silbido antes y golpe al aterrizar
      if (c.drop && c.t0 - 1 > t0 && c.t0 - 1 <= t1) fx.sfx.whistle(0.5);
      if (c.drop && c.t0 > t0 && c.t0 <= t1) {
        fx.sfx.thud(1); fx.shake(0.03);
        fx.burst(c.x, 0.02, c.y, { n: 16, color: ['#c9a66b', '#8d99ae', '#ffffff'], speed: 0.6, up: 0.4, size: 0.05, life: 0.6, gravity: 1 });
      }
      // un barril la rompe
      if (c.gone > t0 && c.gone <= t1) {
        fx.sfx.crack(1); fx.sfx.thud(0.7);
        fx.burst(c.x, 0.06, c.y, { n: 26, color: ['#a0522d', '#c9a66b', '#7f5539'], speed: 0.9, up: 1.4, size: 0.04, life: 0.9, gravity: 4 });
      }
    }
    for (const br of W.barrels) {
      if (br.t0 - 1 > t1) break;
      if (br.t0 - 0.9 > t0 && br.t0 - 0.9 <= t1) fx.sfx.rumble(0.5);
    }
    for (const b of W.bombs) {
      if (b.t0 > t1) break;
      if (b.t0 > t0 && fx.near(b.x, b.y) > 0.75) fx.sfx.whistle(0.6);
      if (b.te > t0 && b.te <= t1) {
        const v = fx.near(b.x, b.y);
        fx.sfx.boom(v);
        fx.shake(0.07 * v);
        fx.burst(b.x, 0.05, b.y, { n: 34, color: ['#fff3b0', '#ffbe0b', '#ff7b00', '#e63946'], speed: b.r * 4.5, up: 1.3, size: 0.06, life: 0.6, gravity: 1.5, grow: 1.5 });
        fx.burst(b.x, 0.1, b.y, { n: 6, color: ['#8a8a8a', '#a0a0a0', '#6e6e6e'], speed: b.r * 2, up: 0.8, size: 0.07, life: 0.8, gravity: -0.2, grow: 1, drag: 2 });
        fx.burst(b.x, 0.03, b.y, { n: 10, color: ['#8d99ae', '#5c677d'], speed: b.r * 5, up: 1.6, size: 0.03, life: 0.8, gravity: 4 });
      }
    }
  },

  PR,
  scene3d: {
    sky: '#3d0c11',
    hemiSky: '#ffd0a0',
    hemiGround: '#5a0a0a',
    setup(S, W) {
      const { THREE, scene } = S;
      const lc = document.createElement('canvas');
      lc.width = lc.height = 256;
      const lg = lc.getContext('2d');
      lg.fillStyle = '#b22a00'; lg.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 70; i++) {
        const x = (i * 97) % 256, y = (i * 61) % 256, r = 10 + (i * 13) % 30;
        const gr = lg.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, i % 3 ? '#ffb703' : '#ff7b00'); gr.addColorStop(1, 'rgba(178,42,0,0)');
        lg.fillStyle = gr; lg.beginPath(); lg.arc(x, y, r, 0, Math.PI * 2); lg.fill();
      }
      const ltex = new THREE.CanvasTexture(lc);
      ltex.colorSpace = THREE.SRGBColorSpace;
      ltex.wrapS = ltex.wrapT = THREE.RepeatWrapping;
      ltex.repeat.set(4, 4);
      S.objs.ltex = ltex;
      const lava = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ map: ltex, emissive: '#ff3c00', emissiveMap: ltex, emissiveIntensity: 0.9, roughness: 0.9 }));
      lava.rotation.x = -Math.PI / 2;
      lava.position.y = -0.55;
      scene.add(lava);
      S.objs.lava = lava;
      const plat = new THREE.Mesh(new THREE.CylinderGeometry(ARENA, ARENA * 0.8, 0.5, 64), [
        new THREE.MeshStandardMaterial({ color: '#5c677d', roughness: 0.9 }),
        new THREE.MeshStandardMaterial({ color: '#8d99ae', roughness: 0.85 }),
        new THREE.MeshStandardMaterial({ color: '#5c677d' }),
      ]);
      plat.position.y = -0.25;
      plat.receiveShadow = true;
      scene.add(plat);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(ARENA, 0.03, 8, 64), new THREE.MeshStandardMaterial({ color: '#4a4e69' }));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.005;
      scene.add(rim);
      S.objs.bombGeo = new THREE.SphereGeometry(0.055, 18, 14);
      S.objs.bombMat = new THREE.MeshStandardMaterial({ color: '#1b1b1b', roughness: 0.3, metalness: 0.4 });
      S.objs.fuseMat = new THREE.MeshBasicMaterial({ color: '#ffbe0b' });
      S.objs.warnGeo = new THREE.CircleGeometry(1, 40);
      S.objs.boomGeo = new THREE.SphereGeometry(1, 20, 14);
      S.objs.live = new Map();
      // cajas de madera
      const cc = document.createElement('canvas');
      cc.width = cc.height = 128;
      const cg = cc.getContext('2d');
      cg.fillStyle = '#b07a48'; cg.fillRect(0, 0, 128, 128);
      cg.fillStyle = '#8d5a3b';
      for (let i = 0; i < 4; i++) cg.fillRect(0, i * 32 + 30, 128, 3);
      cg.strokeStyle = '#6b3b1f'; cg.lineWidth = 12; cg.strokeRect(6, 6, 116, 116);
      cg.beginPath(); cg.moveTo(10, 10); cg.lineTo(118, 118); cg.stroke();
      const ctex = new THREE.CanvasTexture(cc);
      ctex.colorSpace = THREE.SRGBColorSpace;
      const crateMat = new THREE.MeshStandardMaterial({ map: ctex, roughness: 0.8 });
      S.objs.crates = W.crates.map((c) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(c.h * 2, c.h * 2, c.h * 2), crateMat);
        m.rotation.y = c.rot;
        m.castShadow = true;
        m.receiveShadow = true;
        scene.add(m);
        const shadow = new THREE.Mesh(new THREE.CircleGeometry(c.h * 1.4, 24), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0, depthWrite: false }));
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.set(c.x, 0.004, c.y);
        scene.add(shadow);
        return { m, shadow };
      });
      // barriles
      const bc = document.createElement('canvas');
      bc.width = 128; bc.height = 64;
      const bg = bc.getContext('2d');
      bg.fillStyle = '#9c6635'; bg.fillRect(0, 0, 128, 64);
      bg.fillStyle = '#7f4a1f'; for (let i = 0; i < 128; i += 16) bg.fillRect(i, 0, 2, 64);
      bg.fillStyle = '#4a4e69'; bg.fillRect(0, 8, 128, 7); bg.fillRect(0, 49, 128, 7);
      const btex = new THREE.CanvasTexture(bc);
      btex.colorSpace = THREE.SRGBColorSpace;
      const barrelGeo = new THREE.CylinderGeometry(BR, BR, BR * 2.4, 20);
      barrelGeo.rotateZ(Math.PI / 2);
      const barrelMat = new THREE.MeshStandardMaterial({ map: btex, roughness: 0.7 });
      S.objs.barrels = W.barrels.map(() => {
        const g = new THREE.Group();
        const m = new THREE.Mesh(barrelGeo, barrelMat);
        m.castShadow = true;
        g.add(m);
        g.visible = false;
        scene.add(g);
        return { g, m };
      });
      // flecha de aviso en el borde por donde va a entrar un barril
      S.objs.arrowGeo = new THREE.ConeGeometry(0.06, 0.14, 3);
      S.objs.arrows = W.barrels.map(() => {
        const a = new THREE.Mesh(S.objs.arrowGeo, new THREE.MeshBasicMaterial({ color: '#ffbe0b', transparent: true, opacity: 0.9 }));
        a.visible = false;
        scene.add(a);
        return a;
      });
    },
    update(S, t, W) {
      // cajas: caen del cielo y desaparecen cuando un barril las rompe
      W.crates.forEach((c, i) => {
        const o = S.objs.crates[i];
        const fall = c.drop ? c.t0 - t : -1;
        o.m.visible = t < c.gone && fall < 1.2;
        o.shadow.material.opacity = c.drop && fall > 0 && fall < 1.2 ? 0.45 * (1 - fall / 1.2) : 0;
        const y = c.h + (fall > 0 ? fall * fall * 2.2 : 0);
        o.m.position.set(c.x, y, c.y);
      });
      W.barrels.forEach((b, i) => {
        const o = S.objs.barrels[i];
        const q = barrelAt(b, t);
        o.g.visible = !!q;
        if (q) {
          o.g.position.set(q.x, BR, q.y);
          // el eje del barril queda de lado y rueda hacia donde va
          o.g.rotation.y = Math.atan2(b.dx, b.dy);
          o.m.rotation.x = q.k / BR;
        }
        const ar = S.objs.arrows[i];
        const warn = t > b.t0 - 1 && t < b.t0 + 0.2;
        ar.visible = warn && Math.floor(t * 8) % 2 === 0;
        if (warn) {
          ar.position.set(b.x0 * 0.92, 0.04, b.y0 * 0.92);
          ar.rotation.set(-Math.PI / 2, 0, Math.atan2(b.dx, -b.dy));
        }
      });
      const { THREE, scene } = S;
      const o = S.objs;
      o.lava.material.emissiveIntensity = 0.8 + Math.sin(t * 2) * 0.15;
      o.ltex.offset.set(t * 0.02, t * 0.013);
      const keep = new Set();
      for (const b of W.bombs) {
        if (b.t0 > t) break;
        if (t > b.te + BOOM) continue;
        keep.add(b.id);
        let m = o.live.get(b.id);
        if (!m) {
          const bomb = new THREE.Group();
          const body = new THREE.Mesh(o.bombGeo, o.bombMat);
          body.castShadow = true;
          bomb.add(body);
          const spark = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 6), o.fuseMat);
          spark.position.set(0.02, 0.065, 0);
          bomb.add(spark);
          const warn = new THREE.Mesh(o.warnGeo, new THREE.MeshBasicMaterial({ color: '#e63946', transparent: true, opacity: 0.2, depthWrite: false }));
          warn.rotation.x = -Math.PI / 2;
          warn.position.set(b.x, 0.004, b.y);
          warn.scale.setScalar(b.r);
          const boom = new THREE.Mesh(o.boomGeo, new THREE.MeshBasicMaterial({ color: '#ffbe0b', transparent: true, opacity: 0.9, depthWrite: false }));
          boom.visible = false;
          boom.position.set(b.x, 0.02, b.y);
          scene.add(bomb, warn, boom);
          m = { bomb, warn, boom, spark };
          o.live.set(b.id, m);
        }
        if (t < b.te) {
          const k = (t - b.t0) / FUSE;
          m.bomb.visible = true;
          m.bomb.position.set(b.x, 0.055 + (1 - k) * (1 - k) * 2.6, b.y);
          m.bomb.rotation.z = t * 3;
          m.spark.visible = Math.floor(t * 20) % 2 === 0;
          m.warn.material.opacity = 0.15 + 0.4 * k;
          m.boom.visible = false;
        } else {
          const k = (t - b.te) / BOOM;
          m.bomb.visible = false;
          m.warn.visible = false;
          m.boom.visible = true;
          m.boom.scale.setScalar(b.r * (0.6 + k * 0.6));
          m.boom.material.color.set(k < 0.3 ? '#fff3b0' : '#ff7b00');
          m.boom.material.opacity = 0.9 * (1 - k);
        }
      }
      for (const [id, m] of o.live) {
        if (keep.has(id)) continue;
        scene.remove(m.bomb, m.warn, m.boom);
        m.warn.material.dispose(); m.boom.material.dispose();
        m.spark.geometry.dispose();
        o.live.delete(id);
      }
    },
  },

  draw(g, v, t, W, ents, meId) {
    const { size, c, R } = v;
    g.fillStyle = '#1d3557';
    g.fillRect(0, 0, size, size);
    // lava/abismo con brillo
    const lg = g.createRadialGradient(c, c, R * 0.9, c, c, size * 0.75);
    lg.addColorStop(0, '#ff7b00'); lg.addColorStop(1, '#6a040f');
    g.fillStyle = lg;
    g.fillRect(0, 0, size, size);
    g.beginPath(); g.arc(c, c + 6, ARENA * R, 0, TAU); g.fillStyle = 'rgba(0,0,0,0.4)'; g.fill();
    g.beginPath(); g.arc(c, c, ARENA * R, 0, TAU); g.fillStyle = '#8d99ae'; g.fill();
    g.save(); g.clip();
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 2;
    for (let i = -6; i <= 6; i++) { g.beginPath(); g.moveTo(0, c + i * R * 0.18); g.lineTo(size, c + i * R * 0.18); g.stroke(); }
    g.restore();
    g.lineWidth = 6; g.strokeStyle = '#5c677d'; g.beginPath(); g.arc(c, c, ARENA * R, 0, TAU); g.stroke();
    // avisos
    const B = W.bombs;
    for (const b of B) {
      if (b.t0 > t || t > b.te + BOOM) continue;
      const bx = v.X(b.x), by = v.Y(b.y), br = b.r * R;
      if (t < b.te) {
        const k = (t - b.t0) / FUSE;
        g.beginPath(); g.arc(bx, by, br, 0, TAU);
        g.fillStyle = `rgba(230,57,70,${0.15 + 0.35 * k})`; g.fill();
        g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.6)';
        g.beginPath(); g.arc(bx, by, br * (1 - k), 0, TAU); g.stroke();
      }
    }
    for (const c of W.crates) {
      if (!crateOn(c, t)) continue;
      g.fillStyle = '#b07a48'; g.strokeStyle = '#6b3b1f'; g.lineWidth = 3;
      g.fillRect(v.X(c.x - c.h), v.Y(c.y - c.h), c.h * 2 * R, c.h * 2 * R);
      g.strokeRect(v.X(c.x - c.h), v.Y(c.y - c.h), c.h * 2 * R, c.h * 2 * R);
    }
    for (const b of W.barrels) {
      const q = barrelAt(b, t);
      if (!q) continue;
      g.beginPath(); g.arc(v.X(q.x), v.Y(q.y), BR * R, 0, TAU); g.fillStyle = '#9c6635'; g.fill();
      g.lineWidth = 3; g.strokeStyle = '#4a4e69'; g.stroke();
    }
    for (const e of ents) drawPlayer(g, v, { ...e, pr: PR }, meId, t);
    // bombas cayendo y explosiones (encima de todo)
    for (const b of B) {
      if (b.t0 > t || t > b.te + BOOM) continue;
      const bx = v.X(b.x), by = v.Y(b.y), br = b.r * R;
      if (t < b.te) {
        const k = (t - b.t0) / FUSE;
        const yOff = (1 - k) * (1 - k) * size * 0.6;
        g.beginPath(); g.arc(bx, by - yOff, R * 0.05, 0, TAU); g.fillStyle = '#1b1b1b'; g.fill();
        g.beginPath(); g.arc(bx + R * 0.03, by - yOff - R * 0.05, R * 0.015, 0, TAU); g.fillStyle = '#ffbe0b'; g.fill();
      } else {
        const k = (t - b.te) / BOOM;
        const gr = g.createRadialGradient(bx, by, 0, bx, by, br * (0.8 + k * 0.4));
        gr.addColorStop(0, `rgba(255,255,200,${1 - k})`);
        gr.addColorStop(0.5, `rgba(255,190,11,${0.9 - k * 0.8})`);
        gr.addColorStop(1, 'rgba(230,57,70,0)');
        g.beginPath(); g.arc(bx, by, br * (0.8 + k * 0.4), 0, TAU); g.fillStyle = gr; g.fill();
      }
    }
  },
};

export default {
  id: 'bombs',
  name: 'Lluvia de bombas',
  realtime: true,
  desc: '¡Caen bombas! La sombra roja muestra dónde van a explotar. Cuidado con las cajas y los barriles que ruedan: SALTA para pasarlos y ACELERA para escapar. 3 vidas.',
  dur: () => TOTAL * 1000,
  mount: (el, ctx) => mountRT(el, ctx, G),
  evaluate: (v) => evalSurvival(v, TOTAL, LIVES),
  bot: (r, seed, p) => simulateBot(G, seed, Number(String(p?.id || 'bot0').slice(3)) || 0),
};
