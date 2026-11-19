// 💣 Lluvia de bombas — tiempo real. Caen bombas sobre la plataforma: su
// sombra roja avisa dónde van a explotar. Esquívalas; el botón ACELERA da un
// impulso corto. 3 vidas.
import { mulberry32 } from '../util.js';
import { DT, TAU, mountRT, simulateBot, newPlayerBase, moveBasic, clampCircle, drawPlayer, evalSurvival } from '../rt.js';

const TOTAL = 35;
const LIVES = 3;
const ARENA = 0.9;
const PR = 0.06;
const FUSE = 1.35;
const BOOM = 0.35;

const G = {
  TOTAL, LIVES, lives: LIVES,
  action: 'ACELERA',

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
        t += Math.max(0.28, 0.95 - t * 0.02);
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
    return { bombs };
  },

  spawn(i) {
    const a = -Math.PI / 2 + (i * TAU) / 4 + 0.4;
    const p = newPlayerBase(Math.cos(a) * 0.55, Math.sin(a) * 0.55, LIVES);
    p.bi = 0;
    return p;
  },

  step(p, inp, t, W) {
    if (p.out) return null;
    p._ev = null;
    moveBasic(p, inp, 0.62);
    clampCircle(p, ARENA - PR);
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
        if (left < 0.45 && d < b.r && r() < 0.06) p.act = true;
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
    for (const b of W.bombs) {
      if (b.t0 > t1) break;
      if (b.t0 > t0 && fx.near(b.x, b.y) > 0.75) fx.sfx.whistle(0.6);
      if (b.te > t0 && b.te <= t1) {
        const v = fx.near(b.x, b.y);
        fx.sfx.boom(v);
        fx.shake(0.07 * v);
        fx.burst(b.x, 0.05, b.y, { n: 34, color: ['#fff3b0', '#ffbe0b', '#ff7b00', '#e63946'], speed: b.r * 4.5, up: 1.3, size: 0.06, life: 0.6, gravity: 1.5, grow: 1.5 });
        fx.burst(b.x, 0.1, b.y, { n: 12, color: ['#555555', '#777777', '#333333'], speed: b.r * 2, up: 0.8, size: 0.09, life: 1.1, gravity: -0.2, grow: 1.2, drag: 2 });
        fx.burst(b.x, 0.03, b.y, { n: 10, color: ['#8d99ae', '#5c677d'], speed: b.r * 5, up: 1.6, size: 0.03, life: 0.8, gravity: 4 });
      }
    }
  },

  PR,
  scene3d: {
    sky: '#3d0c11',
    hemiSky: '#ffd0a0',
    hemiGround: '#5a0a0a',
    setup(S) {
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
    },
    update(S, t, W) {
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
  desc: '¡Caen bombas! La sombra roja muestra dónde van a explotar: sal de ahí. El botón ACELERA te da un impulso. 3 vidas.',
  dur: () => TOTAL * 1000,
  mount: (el, ctx) => mountRT(el, ctx, G),
  evaluate: (v) => evalSurvival(v, TOTAL, LIVES),
  bot: (r, seed, p) => simulateBot(G, seed, Number(String(p?.id || 'bot0').slice(3)) || 0),
};
