// 💥 Bomba caliente — tiempo real. Alguien tiene una bomba con mecha: tócale a
// otro jugador para pasársela. Cuando la mecha se acaba, ¡BUM!: quien la tenga
// queda eliminado. Gana el último en pie.
//
// El anfitrión es el árbitro: decide quién tiene la bomba y quién explota
// (lo publica en `hs`); cada teléfono solo mueve a su jugador.
import { mulberry32 } from '../util.js';
import { DT, TAU, mountRT, simulateBot, newPlayerBase, moveBasic, clampBox, drawPlayer } from '../rt.js';

const TOTAL = 60;
const PR = 0.065;
const HALF = 0.9;

const G = {
  TOTAL, LIVES: 1, lives: 1,
  action: 'ACELERA',

  world(seed) {
    const r = mulberry32(seed ^ 0xb055);
    return { fuses: Array.from({ length: 6 }, () => 7 + r() * 5), r0: r() };
  },

  spawn(i) {
    const a = -Math.PI / 2 + (i * TAU) / 4 + Math.PI / 4;
    return newPlayerBase(Math.cos(a) * 0.6, Math.sin(a) * 0.6, 1);
  },

  // ---- árbitro (solo el anfitrión)
  hostInit(W, players) {
    return { h: players[Math.floor(W.r0 * players.length)]?.id || null, fx: W.fuses[0] + 1.5, n: 0, outs: {}, lt: 0, st: 1.5 };
  },
  hostTick(hs, t, W, all) {
    if (hs.done) return;
    const alive = all.filter((e) => e && !e.out && !hs.outs[e.id]);
    if (t < hs.st) return; // pausa entre rondas
    const holder = alive.find((e) => e.id === hs.h);
    if (!holder) {
      // el que la tenía ya no está: se la damos al más cercano al centro
      const pick = alive.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0];
      hs.h = pick ? pick.id : null;
      hs.lt = t;
      return;
    }
    if (t >= hs.fx) {
      hs.outs[holder.id] = Math.round(t * 1000);
      hs.n++;
      const rest = alive.filter((e) => e.id !== holder.id);
      if (rest.length <= 1) { hs.done = 1; hs.h = null; return; }
      const far = rest.sort((a, b) => Math.hypot(b.x - holder.x, b.y - holder.y) - Math.hypot(a.x - holder.x, a.y - holder.y))[0];
      hs.h = far.id;
      hs.st = t + 1.5;
      hs.fx = t + 1.5 + W.fuses[hs.n % W.fuses.length] * Math.max(0.6, 1 - hs.n * 0.12);
      hs.lt = t;
      return;
    }
    if (t - hs.lt < 0.5) return; // medio segundo de gracia tras cada pase
    for (const o of alive) {
      if (o.id === holder.id) continue;
      // no se le puede devolver al que te la acaba de pasar (hasta 1.8 s después)
      if (o.id === hs.from && t - hs.lt < 1.8) continue;
      if (Math.hypot(o.x - holder.x, o.y - holder.y) < PR * 2.3) {
        hs.h = o.id;
        hs.lt = t;
        hs.from = holder.id;
        break;
      }
    }
  },
  // Aplica lo que decidió el árbitro a un jugador local.
  applyHost(p, hs, t) {
    if (!p.out && hs.outs && hs.outs[p.id] !== undefined) {
      p.out = true;
      p.tOut = hs.outs[p.id] / 1000;
      return 'out';
    }
    return null;
  },

  step(p, inp, t, W, ext) {
    if (p.out) return null;
    p._ev = null;
    const hs = ext && ext.hs;
    const has = hs && hs.h === p.id;
    moveBasic(p, inp, has ? 0.72 : 0.64);
    // empujón al pasar la bomba: los dos salen despedidos en direcciones opuestas
    if (hs && hs.lt !== p._lt) {
      p._lt = hs.lt;
      const other = hs.h === p.id ? hs.from : hs.from === p.id ? hs.h : null;
      const o = other && ext.all ? ext.all.find((e) => e && e.id === other) : null;
      if (o) {
        let dx = p.x - o.x, dy = p.y - o.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 0.01) { dx = Math.cos(t * 7); dy = Math.sin(t * 7); }
        p.kx = (dx / Math.max(d, 0.01)) * 1.6;
        p.ky = (dy / Math.max(d, 0.01)) * 1.6;
      }
    }
    if (p.kx || p.ky) {
      p.x += p.kx * DT; p.y += p.ky * DT;
      const f = Math.pow(0.02, DT);
      p.kx *= f; p.ky *= f;
      if (Math.abs(p.kx) + Math.abs(p.ky) < 0.02) { p.kx = 0; p.ky = 0; }
    }
    // los cuerpos no se enciman
    if (ext && ext.all) {
      for (const o of ext.all) {
        if (!o || o === p || o.id === p.id || o.out || (hs && hs.outs && hs.outs[o.id] !== undefined)) continue;
        const dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy);
        if (d > 0 && d < PR * 2) { const over = PR * 2 - d; p.x += (dx / d) * over * 0.5; p.y += (dy / d) * over * 0.5; }
      }
    }
    clampBox(p, HALF - PR);
    if (has && !p._had) { p._had = true; return 'got'; }
    if (!has) p._had = false;
    return p._ev;
  },

  brain(seed, idx) {
    const r = mulberry32((seed ^ (0x68e31da4 * (idx + 1))) >>> 0);
    const smart = 0.6 + r() * 0.3;
    let wob = r() * TAU;
    return (p, t, ext) => {
      wob += DT * 1.3;
      const hs = ext && ext.hs;
      if (!hs || !ext.all) return { x: Math.cos(wob) * 0.5, y: Math.sin(wob) * 0.5 };
      const alive = ext.all.filter((e) => e && !e.out && e.id !== p.id && !(hs.outs && hs.outs[e.id] !== undefined));
      if (!alive.length) return { x: 0, y: 0 };
      if (hs.h === p.id) {
        // perseguir al más cercano (menos al que me la acaba de pasar)
        const can = alive.filter((e) => e.id !== hs.from || (ext.t ?? t) - hs.lt > 1.8);
        if (!can.length) return { x: Math.cos(wob) * 0.4, y: Math.sin(wob) * 0.4 };
        const tg = can.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
        const dx = tg.x - p.x, dy = tg.y - p.y, l = Math.hypot(dx, dy) || 1;
        if (l < 0.35 && r() < 0.03) p.act = true;
        return { x: dx / l, y: dy / l };
      }
      const hd = alive.find((e) => e.id === hs.h);
      if (!hd) return { x: Math.cos(wob) * 0.3, y: Math.sin(wob) * 0.3 };
      // huir del que tiene la bomba, sin quedar atrapado en una esquina
      let dx = p.x - hd.x, dy = p.y - hd.y;
      const l = Math.hypot(dx, dy) || 1;
      dx = dx / l - p.x * 0.9 + Math.cos(wob) * 0.4;
      dy = dy / l - p.y * 0.9 + Math.sin(wob) * 0.4;
      const m = Math.hypot(dx, dy) || 1;
      if (l < 0.25 && r() < smart * 0.05) p.act = true;
      return { x: (dx / m) * smart, y: (dy / m) * smart };
    };
  },

  result: (p) => ({ h: p.out ? 0 : 1, t: p.out ? Math.round(p.tOut * 1000) : TOTAL * 1000 }),
  hud: (p) => (p.out ? '{ghost}' : '{heart}'),
  hudRight: (ents) => `{people} ${ents.filter((e) => !e.out).length}`,

  music: 'tense',
  events(t0, t1, W, ext, ents, fx) {
    const hs = ext.hs;
    if (!hs) return;
    const st = fx.st;
    if (hs.h !== st.h) {
      if (st.h !== undefined && hs.h) {
        const e = ents.find((x) => x.id === hs.h);
        if (e) {
          if (e !== fx.me) fx.sfx.pass(0.6);
          fx.burst(e.x, 0.25, e.y, { n: 18, color: ['#ffbe0b', '#ff006e', '#ffffff'], speed: 0.6, up: 0.8, size: 0.04, life: 0.5 });
        }
      }
      st.h = hs.h;
    }
    if (!hs.done && t1 >= hs.st) {
      const rem = hs.fx - t1;
      const iv = Math.max(0.09, Math.min(0.6, rem / 8));
      if (t1 - (st.lt || 0) >= iv) { st.lt = t1; fx.sfx.tick(rem < 3 ? 1.5 : 0.9); if (rem < 3) fx.sfx.fuse(0.8); }
    }
    if (!hs.done && hs.st > t0 && hs.st <= t1) fx.sfx.go();
    for (const id of Object.keys(hs.outs || {})) {
      if (st['o' + id]) continue;
      st['o' + id] = 1;
      const e = ents.find((x) => x.id === id);
      const x = e ? e.x : 0, y = e ? e.y : 0;
      fx.sfx.boom(1);
      fx.shake(0.08);
      fx.burst(x, 0.1, y, { n: 55, color: ['#fff3b0', '#ffbe0b', '#ff7b00', '#ff006e'], speed: 1.3, up: 1.5, size: 0.07, life: 0.8, gravity: 1.5, grow: 1.2 });
      fx.burst(x, 0.15, y, { n: 16, color: ['#555555', '#333333'], speed: 0.6, up: 0.8, size: 0.1, life: 1.2, gravity: -0.2, grow: 1 });
    }
  },

  PR,
  topText(t, W, ext) {
    const hs = ext && ext.hs;
    if (!hs || hs.fx === undefined || hs.done) return null;
    const now = ext.t ?? t;
    if (now < hs.st) return '¡Prepárate!';
    return `{bomb} ${Math.max(0, hs.fx - now).toFixed(1)}`;
  },
  scene3d: {
    sky: '#3c1642',
    camFit: 1.3,
    camElev: 62,
    hemiGround: '#240046',
    setup(S) {
      const { THREE, scene } = S;
      const tex = (() => {
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        const g = c.getContext('2d');
        for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#ffd6a5' : '#ffadad'; g.fillRect(i * 32, j * 32, 32, 32); }
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      })();
      const side = new THREE.MeshStandardMaterial({ color: '#9d4edd' });
      const floor = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 0.2, HALF * 2), [side, side, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }), side, side, side]);
      floor.position.y = -0.1;
      floor.receiveShadow = true;
      scene.add(floor);
      const wallMat = new THREE.MeshStandardMaterial({ color: '#7b2cbf' });
      for (const [w, d, x, z] of [[HALF * 2 + 0.1, 0.05, 0, -HALF - 0.025], [HALF * 2 + 0.1, 0.05, 0, HALF + 0.025], [0.05, HALF * 2, -HALF - 0.025, 0], [0.05, HALF * 2, HALF + 0.025, 0]]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), wallMat);
        m.position.set(x, 0.05, z);
        m.castShadow = true;
        scene.add(m);
      }
      // la bomba
      const bomb = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 16), new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.3, metalness: 0.5 }));
      body.castShadow = true;
      bomb.add(body);
      const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.04, 6), new THREE.MeshStandardMaterial({ color: '#8d6e63' }));
      fuse.position.set(0.02, 0.065, 0);
      fuse.rotation.z = -0.5;
      bomb.add(fuse);
      const spark = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffbe0b' }));
      spark.position.set(0.035, 0.09, 0);
      bomb.add(spark);
      bomb.visible = false;
      scene.add(bomb);
      const boom = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: '#ffbe0b', transparent: true, depthWrite: false }));
      boom.visible = false;
      scene.add(boom);
      Object.assign(S.objs, { bomb, body, spark, boom });
    },
    update(S, t, W, ext, ents) {
      const o = S.objs;
      const hs = (ext && ext.hs) || {};
      const now = ext && ext.t !== undefined ? ext.t : t;
      const holder = !hs.done && ents.find((e) => e.id === hs.h && !e.out);
      o.bomb.visible = !!holder && now >= (hs.st || 0) - 1.5;
      if (holder) {
        const rem = Math.max(0, (hs.fx || 0) - now);
        const shake = Math.sin(t * (10 + (12 - Math.min(12, rem)) * 3)) * 0.012;
        o.bomb.position.set(holder.x + shake, PR * 1.3 * 5.2 + (holder.z || 0) * 0.22, holder.y);
        o.spark.visible = Math.floor(t * 20) % 2 === 0;
        o.spark.material.color.set(rem < 3 ? '#ff006e' : '#ffbe0b');
        o.body.material.emissive.set(rem < 3 && Math.floor(t * 8) % 2 ? '#550000' : '#000000');
      }
      o.boom.visible = false;
      if (hs.outs) {
        for (const [id, ms] of Object.entries(hs.outs)) {
          const dt = now - ms / 1000;
          if (dt < 0 || dt > 0.6) continue;
          const e = ents.find((x) => x.id === id);
          if (!e) continue;
          o.boom.visible = true;
          o.boom.position.set(e.x, 0.1, e.y);
          o.boom.scale.setScalar(0.1 + dt * 0.7);
          o.boom.material.opacity = 1 - dt / 0.6;
          o.boom.material.color.set(dt < 0.15 ? '#fff3b0' : '#ff7b00');
        }
      }
    },
  },

  draw(g, v, t, W, ents, meId, ext) {
    const { size } = v;
    const hs = (ext && ext.hs) || {};
    g.fillStyle = '#3c1642'; g.fillRect(0, 0, size, size);
    const x0 = v.X(-HALF), w = HALF * 2 * v.R;
    // piso de baldosas tipo ajedrez
    const n = 8;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.fillStyle = (i + j) % 2 ? '#ffd6a5' : '#ffadad';
      g.fillRect(x0 + (i * w) / n, x0 + (j * w) / n, w / n + 1, w / n + 1);
    }
    g.lineWidth = 6; g.strokeStyle = '#9d4edd'; g.strokeRect(x0, x0, w, w);
    const rem = hs.fx !== undefined ? Math.max(0, hs.fx - (ext.t || t)) : 0;
    for (const e of ents) {
      const out = e.out || (hs.outs && hs.outs[e.id] !== undefined);
      drawPlayer(g, v, { ...e, out, pr: PR }, meId, t);
      if (!out && hs.h === e.id && !hs.done) {
        const px = v.X(e.x), py = v.Y(e.y) - PR * v.R * 2.1;
        const wob = Math.sin(t * (6 + (12 - Math.min(12, rem)) * 2)) * 4;
        g.beginPath(); g.arc(px + wob, py, PR * v.R * 0.8, 0, TAU); g.fillStyle = '#1b1b1b'; g.fill();
        // chispa de la mecha
        g.beginPath(); g.arc(px + wob + PR * v.R * 0.55, py - PR * v.R * 0.7, 3 + Math.random() * 3, 0, TAU);
        g.fillStyle = rem < 3 ? '#ff006e' : '#ffbe0b'; g.fill();
      }
    }
    // explosión reciente
    if (hs.outs) {
      for (const [id, ms] of Object.entries(hs.outs)) {
        const dt = (ext.t || t) - ms / 1000;
        if (dt < 0 || dt > 0.6) continue;
        const e = ents.find((x) => x.id === id);
        if (!e) continue;
        const rr = PR * v.R * (2 + dt * 8);
        const gr = g.createRadialGradient(v.X(e.x), v.Y(e.y), 0, v.X(e.x), v.Y(e.y), rr);
        gr.addColorStop(0, `rgba(255,255,200,${1 - dt / 0.6})`); gr.addColorStop(1, 'rgba(255,0,110,0)');
        g.beginPath(); g.arc(v.X(e.x), v.Y(e.y), rr, 0, TAU); g.fillStyle = gr; g.fill();
      }
    }
  },
};

const GM = { ...G, endWhenOneLeft: true };

export default {
  id: 'hotbomb',
  name: 'Bomba caliente',
  realtime: true,
  desc: '¡Alguien tiene una bomba encendida! Si la tienes, tócale a otro para pasársela. Cuando la mecha se acaba, quien la tenga queda fuera. Gana el último en pie.',
  dur: () => TOTAL * 1000,
  mount: (el, ctx) => mountRT(el, ctx, GM),
  evaluate(v) {
    if (!v || typeof v.t !== 'number') return null;
    const t = Math.max(0, Math.min(TOTAL * 1000, v.t));
    if (v.h > 0) return { score: 1e6, label: '{trophy} ¡último en pie!' };
    return { score: t, label: `explotó a los ${(t / 1000).toFixed(1)} s` };
  },
  bot: (r, seed, p) => simulateBot(G, seed, Number(String(p?.id || 'bot0').slice(3)) || 0),
};
