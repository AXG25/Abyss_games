// 🧊 Hielo frágil — tiempo real. El lago congelado está hecho de bloques de
// hielo: cada bloque que alguien pisa se agrieta y al poco tiempo se hunde.
// ¡No te quedes quieto! Gana el último que siga sobre el hielo.
//
// Cada teléfono publica los bloques que pisó su jugador; todos los teléfonos
// juntan esa información para saber qué bloques se están rompiendo.
import { mulberry32 } from '../util.js';
import { DT, TAU, mountRT, simulateBot, newPlayerBase, moveBasic, drawPlayer, evalSurvival } from '../rt.js';

const TOTAL = 50;
const N = 9;
const HALF = 0.9;
const TS = (HALF * 2) / N;
const PR = 0.05;
const CRACK = 1.3;    // segundos desde que se pisa hasta que se hunde

const idxAt = (x, y) => {
  const i = Math.floor((x + HALF) / TS), j = Math.floor((y + HALF) / TS);
  if (i < 0 || j < 0 || i >= N || j >= N) return -1;
  return j * N + i;
};
const center = (k) => [-HALF + ((k % N) + 0.5) * TS, -HALF + (Math.floor(k / N) + 0.5) * TS];
// forma redonda del lago
const VALID = Array.from({ length: N * N }, (_, k) => { const [x, y] = center(k); return Math.hypot(x, y) < 0.95; });

export const G = {
  TOTAL, LIVES: 1, lives: 1,
  action: null,
  fallText: '{splash} ¡Al agua helada!',

  world() { return {}; },
  newExt: () => ({ taken: new Set(), tiles: new Map() }), // tile → instante en que se pisó

  spawn(i) {
    const [x, y] = center([20, 24, 56, 60][i % 4]);
    const p = newPlayerBase(x, y, 1);
    p.steps = [];
    p.fall = 0;
    p.scale = 1;
    return p;
  },

  // Bloques pisados por los demás (llegan por la red).
  sync(ext, others, t) {
    for (const o of others) {
      if (!o.e || !Array.isArray(o.e.s)) continue;
      for (const k of o.e.s) if (Number.isInteger(k) && !ext.tiles.has(k)) ext.tiles.set(k, t);
    }
  },

  step(p, inp, t, W, ext) {
    if (p.out) return null;
    if (p.fall > 0) {
      p.fall -= DT;
      p.scale = Math.max(0, p.fall / 0.7);
      if (p.fall <= 0) { p.out = true; p.tOut = t; return 'out'; }
      return null;
    }
    moveBasic(p, inp, 0.55, false);
    p.x = Math.max(-HALF + PR, Math.min(HALF - PR, p.x));
    p.y = Math.max(-HALF + PR, Math.min(HALF - PR, p.y));
    const k = idxAt(p.x, p.y);
    const tiles = ext ? ext.tiles : null;
    if (k < 0 || !VALID[k]) { p.fall = 0.7; return 'fall'; }
    if (tiles) {
      if (!tiles.has(k)) { tiles.set(k, t); p.steps.push(k); }
      else if (!p.steps.includes(k)) p.steps.push(k);
      if (t - tiles.get(k) > CRACK) { p.fall = 0.7; return 'fall'; }
    }
    return null;
  },

  brain(seed, idx) {
    const r = mulberry32((seed ^ (0x85ebca6b * (idx + 1))) >>> 0);
    const skill = 0.5 + r() * 0.4;
    let target = -1;
    return (p, t, ext) => {
      const tiles = ext ? ext.tiles : new Map();
      const ok = (k) => k >= 0 && VALID[k] && !tiles.has(k);
      const cur = idxAt(p.x, p.y);
      const [tx, ty] = target >= 0 ? center(target) : [p.x, p.y];
      const arrived = Math.hypot(tx - p.x, ty - p.y) < 0.04;
      if (target < 0 || !ok(target) && target !== cur || arrived) {
        // elegir un bloque vecino sano, preferir los que tienen más vecinos sanos
        const ci = cur % N, cj = Math.floor(cur / N);
        let best = -1, bs = -1;
        // tamaño de la zona de hielo sano alcanzable desde k (sin pasar por el actual)
        const region = (k0) => {
          const seen = new Set([cur, k0]);
          const q = [k0];
          while (q.length && seen.size < 40) {
            const k = q.pop();
            const i = k % N, j = Math.floor(k / N);
            for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const ii = i + a, jj = j + b;
              if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
              const kk = jj * N + ii;
              if (!seen.has(kk) && ok(kk)) { seen.add(kk); q.push(kk); }
            }
          }
          return seen.size;
        };
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= N || j >= N) continue;
          const k = j * N + i;
          if (!ok(k)) continue;
          const s = (r() < skill ? region(k) : 0) + r() * 3;
          if (s > bs) { bs = s; best = k; }
        }
        target = best;
      }
      if (target < 0) return { x: 0, y: 0 };
      const [gx, gy] = center(target);
      const dx = gx - p.x, dy = gy - p.y, l = Math.hypot(dx, dy) || 1;
      return { x: dx / l, y: dy / l };
    };
  },

  result: (p) => ({ h: p.out ? 0 : 1, t: p.out ? Math.round(p.tOut * 1000) : TOTAL * 1000 }),
  pack: (p) => {
    const o = { s: p.steps.slice(-60) };
    if (p.fall > 0 || p.out) o.f = Math.round((p.out ? 0 : p.scale) * 100) / 100;
    return o;
  },
  hud: (p) => (p.out ? '{ghost}' : '{heart}'),

  music: 'ice',
  events(t0, t1, W, ext, ents, fx) {
    const tiles = ext.tiles;
    if (!tiles) return;
    const st = fx.st;
    st.seen = st.seen || new Set();
    st.sunk = st.sunk || new Set();
    for (const [k, ts] of tiles) {
      const [x, y] = center(k);
      if (!st.seen.has(k)) {
        st.seen.add(k);
        if (t1 - (st.lc || 0) > 0.12) { st.lc = t1; fx.sfx.crack(fx.near(x, y) * 0.7); }
        fx.burst(x, 0.02, y, { n: 6, color: ['#ffffff', '#caf0f8'], speed: 0.3, up: 0.4, size: 0.03, life: 0.4, gravity: 2 });
      }
      if (!st.sunk.has(k) && t1 - ts > CRACK) {
        st.sunk.add(k);
        if (t1 - (st.ls || 0) > 0.15) { st.ls = t1; fx.sfx.splash(0.3 * fx.near(x, y)); }
        fx.burst(x, -0.05, y, { n: 8, color: ['#caf0f8', '#90e0ef', '#ffffff'], speed: 0.3, up: 1, size: 0.045, life: 0.6, gravity: 3, spread: TS * 0.5 });
      }
    }
  },

  PR,
  scene3d: {
    sky: '#cdeffd',
    camFit: 1.15,
    hemiGround: '#03045e',
    hideOut: true,
    sinkDepth: 0.5,
    setup(S) {
      const { THREE, scene } = S;
      const water = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ color: '#023e8a', roughness: 0.2, metalness: 0.2 }));
      water.rotation.x = -Math.PI / 2;
      water.position.y = -0.18;
      water.receiveShadow = true;
      scene.add(water);
      const geo = new THREE.BoxGeometry(TS * 0.94, 0.1, TS * 0.94);
      S.objs.blocks = [];
      for (let k = 0; k < N * N; k++) {
        if (!VALID[k]) { S.objs.blocks.push(null); continue; }
        const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#caf0f8', roughness: 0.15, metalness: 0.05, transparent: true, opacity: 0.95 }));
        const [x, y] = center(k);
        m.position.set(x, -0.05, y);
        m.receiveShadow = true;
        m.castShadow = true;
        scene.add(m);
        S.objs.blocks.push(m);
      }
    },
    update(S, t, W, ext) {
      const tiles = (ext && ext.tiles) || new Map();
      const now = ext && ext.t !== undefined ? ext.t : t;
      S.objs.blocks.forEach((m, k) => {
        if (!m) return;
        const st = tiles.get(k);
        const age = st === undefined ? -1 : now - st;
        const [x, y] = center(k);
        if (age < 0) { m.position.set(x, -0.05, y); m.material.color.set('#caf0f8'); m.material.opacity = 0.95; m.visible = true; return; }
        if (age > CRACK + 0.6) { m.visible = false; return; }
        const sh = age < CRACK ? Math.sin(t * 60 + k) * 0.006 * (age / CRACK) : 0;
        const sink = age > CRACK ? (age - CRACK) * 0.6 : 0;
        m.position.set(x + sh, -0.05 - sink, y);
        const k2 = Math.min(1, age / CRACK);
        m.material.color.setRGB(0.79 - 0.35 * k2, 0.94 - 0.25 * k2, 0.97 - 0.1 * k2);
        m.material.opacity = age > CRACK ? Math.max(0, 0.95 - (age - CRACK) * 1.6) : 0.95;
      });
    },
  },

  draw(g, v, t, W, ents, meId, ext) {
    const { size } = v;
    const tiles = (ext && ext.tiles) || new Map();
    const now = ext && ext.t !== undefined ? ext.t : t;
    // agua helada
    g.fillStyle = '#03045e'; g.fillRect(0, 0, size, size);
    g.strokeStyle = 'rgba(144,224,239,0.15)'; g.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const y = ((i * size) / 7 + t * 10) % (size + 20) - 10;
      g.beginPath();
      for (let x = 0; x <= size; x += 10) g.lineTo(x, y + Math.sin(x / 25 + t + i) * 3);
      g.stroke();
    }
    const ts = TS * v.R;
    for (let k = 0; k < N * N; k++) {
      if (!VALID[k]) continue;
      const [cx, cy] = center(k);
      const st = tiles.get(k);
      const age = st === undefined ? -1 : now - st;
      if (age > CRACK + 0.4) continue;
      let sink = 0;
      if (age > CRACK) sink = (age - CRACK) / 0.4;
      const sh = age >= 0 && age < CRACK ? Math.sin(t * 50 + k) * age * 2 : 0;
      const x = v.X(cx) - ts / 2 + sh, y = v.Y(cy) - ts / 2;
      const inset = 2 + sink * ts * 0.3;
      g.globalAlpha = 1 - sink;
      g.fillStyle = age < 0 ? '#caf0f8' : age < CRACK * 0.5 ? '#ade8f4' : '#90e0ef';
      g.beginPath();
      if (g.roundRect) g.roundRect(x + inset, y + inset, ts - inset * 2, ts - inset * 2, 6); else g.rect(x + inset, y + inset, ts - inset * 2, ts - inset * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillRect(x + inset + 4, y + inset + 4, (ts - inset * 2) * 0.35, 3);
      if (age >= 0) {
        // grietas
        g.strokeStyle = `rgba(2,62,138,${Math.min(1, 0.3 + age)})`;
        g.lineWidth = 1.5;
        g.beginPath();
        const mx = x + ts / 2, my = y + ts / 2;
        for (let a = 0; a < 4; a++) {
          const an = k * 1.7 + a * 1.6;
          g.moveTo(mx, my);
          g.lineTo(mx + Math.cos(an) * ts * 0.4 * Math.min(1, age / CRACK + 0.3), my + Math.sin(an) * ts * 0.4 * Math.min(1, age / CRACK + 0.3));
        }
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    for (const e of ents) {
      if (e.out && !(e.fall > 0)) continue;
      const scale = e.e && typeof e.e.f === 'number' ? e.e.f : (e.scale ?? 1);
      if (scale <= 0.02) continue;
      drawPlayer(g, v, { ...e, out: false, pr: PR, scale }, meId, t);
    }
  },
};

export default {
  id: 'ice',
  name: 'Hielo frágil',
  realtime: true,
  desc: 'Cada bloque de hielo que pisas se agrieta y se hunde al segundo. ¡No te quedes quieto y no te encierres! Gana el último que siga sobre el hielo.',
  dur: () => TOTAL * 1000,
  mount: (el, ctx) => mountRT(el, ctx, { ...G, endWhenOneLeft: true }),
  evaluate(v) {
    const ev = evalSurvival(v, TOTAL, 1);
    if (ev && ev.score >= 1e6) ev.label = '{trophy} ¡último en pie!';
    return ev;
  },
  bot: (r, seed, p) => simulateBot(G, seed, Number(String(p?.id || 'bot0').slice(3)) || 0),
};
