// 🟩 Pisa el color — tiempo real. El piso es una cuadrícula de colores. Se
// anuncia un color y, al acabar la cuenta, TODAS las demás baldosas se caen.
// Párate a tiempo en una baldosa del color anunciado. 2 vidas.
import { mulberry32 } from '../util.js';
import { DT, TAU, mountRT, simulateBot, newPlayerBase, moveBasic, clampBox, drawPlayer, evalSurvival } from '../rt.js';

const TOTAL = 42;
const LIVES = 2;
const N = 4;              // 4x4
const HALF = 0.9;
const TS = (HALF * 2) / N;
const PR = 0.055;
const DROP = 1.3;
const COLORS = [
  { n: 'ROJO', c: '#ef476f' },
  { n: 'AZUL', c: '#118ab2' },
  { n: 'AMARILLO', c: '#ffd166' },
  { n: 'VERDE', c: '#06d6a0' },
];

const tileAt = (x, y) => {
  const i = Math.floor((x + HALF) / TS), j = Math.floor((y + HALF) / TS);
  if (i < 0 || j < 0 || i >= N || j >= N) return -1;
  return j * N + i;
};
const center = (k) => [-HALF + (k % N + 0.5) * TS, -HALF + (Math.floor(k / N) + 0.5) * TS];

function roundAt(W, t) {
  for (const rd of W.rounds) if (t >= rd.s && t < rd.end) return rd;
  return null;
}

const G = {
  TOTAL, LIVES, lives: LIVES,
  action: null,

  world(seed) {
    const r = mulberry32(seed ^ 0x7e57);
    const rounds = [];
    let t = 0.8, k = 0;
    while (t < TOTAL - 1) {
      const show = Math.max(1.15, 3.2 - k * 0.25);
      const c = Math.floor(r() * 4);
      const cols = Array.from({ length: N * N }, () => Math.floor(r() * 4));
      // al menos 2 baldosas del color (y menos conforme avanza)
      const want = Math.max(1, 4 - Math.floor(k / 3));
      let have = cols.filter((x) => x === c).length;
      while (have < want) { const i = Math.floor(r() * N * N); if (cols[i] !== c) { cols[i] = c; have++; } }
      const drop = t + show;
      rounds.push({ s: t, drop, end: drop + DROP + 0.4, c, cols });
      t = drop + DROP + 0.4;
      k++;
    }
    return { rounds };
  },

  spawn(i) {
    const [x, y] = center([5, 6, 9, 10][i % 4]);
    const p = newPlayerBase(x, y, LIVES);
    p.fall = 0;
    return p;
  },

  step(p, inp, t, W) {
    if (p.out) return null;
    const rd = roundAt(W, t);
    if (p.fall > 0) {
      p.fall -= DT;
      p.scale = Math.max(0, p.fall / 0.8);
      if (p.fall <= 0) {
        p.scale = 0;
        if (p.h <= 0) { p.out = true; p.tOut = t; return 'out'; }
        // reaparece en el centro cuando el piso vuelve
        p.respawn = true;
      }
      return null;
    }
    if (p.respawn) {
      if (rd && t >= rd.drop) return null; // espera a que vuelva el piso
      p.respawn = false;
      p.scale = 1;
      p.x = 0; p.y = 0;
      p.inv = 1;
    }
    moveBasic(p, inp, 0.7, false);
    clampBox(p, HALF - 0.01);
    if (rd && t >= rd.drop && t < rd.drop + DROP && p.inv <= 0) {
      const k = tileAt(p.x, p.y);
      if (k < 0 || rd.cols[k] !== rd.c) {
        p.h--;
        p.fall = 0.8;
        return 'fall';
      }
    }
    return null;
  },

  brain(seed, idx, W) {
    const r = mulberry32((seed ^ (0x1b873593 * (idx + 1))) >>> 0);
    const skill = 0.82 + r() * 0.14;
    let cur = null, target = null, delay = 0;
    return (p, t) => {
      const rd = roundAt(W, t);
      if (rd !== cur) {
        cur = rd;
        target = null;
        delay = rd ? rd.s + 0.25 + r() * 0.6 : 0;
        if (rd) {
          const good = rd.cols.map((c, k) => (c === rd.c ? k : -1)).filter((k) => k >= 0);
          let best = good[0], bd = 9;
          for (const k of good) { const [x, y] = center(k); const d = Math.hypot(x - p.x, y - p.y); if (d < bd) { bd = d; best = k; } }
          if (r() > skill) best = Math.floor(r() * N * N); // se equivoca
          target = center(best);
        }
      }
      if (!target || t < delay) return { x: 0, y: 0 };
      const dx = target[0] - p.x, dy = target[1] - p.y, l = Math.hypot(dx, dy);
      return l > 0.03 ? { x: dx / l, y: dy / l } : { x: 0, y: 0 };
    };
  },

  result: (p) => ({ h: Math.max(0, p.h), t: p.out ? Math.round(p.tOut * 1000) : TOTAL * 1000 }),

  banner(t, W) {
    const rd = roundAt(W, t);
    if (!rd || t >= rd.drop + DROP) return null;
    const col = COLORS[rd.c];
    return { text: t < rd.drop ? `¡${col.n}! ${Math.ceil(rd.drop - t)}` : `¡${col.n}!`, color: col.c };
  },

  PR,
  scene3d: {
    sky: '#90e0ef',
    camFit: 1.25,
    camElev: 62,
    hemiGround: '#023e8a',
    setup(S) {
      const { THREE, scene } = S;
      const water = new THREE.Mesh(new THREE.PlaneGeometry(14, 14, 40, 40), new THREE.MeshStandardMaterial({ color: '#0077b6', roughness: 0.25, flatShading: true }));
      water.geometry.rotateX(-Math.PI / 2);
      water.position.y = -0.45;
      water.receiveShadow = true;
      scene.add(water);
      S.objs.water = water;
      S.objs.wBase = Float32Array.from(water.geometry.attributes.position.array);
      const geo = new THREE.BoxGeometry(TS * 0.93, 0.14, TS * 0.93);
      S.objs.mats = COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c.c, roughness: 0.4 }));
      S.objs.tiles = Array.from({ length: N * N }, (_, k) => {
        const m = new THREE.Mesh(geo, S.objs.mats[0]);
        const [x, y] = center(k);
        m.position.set(x, -0.07, y);
        m.receiveShadow = true;
        m.castShadow = true;
        scene.add(m);
        return m;
      });
      // marco para los buenos
      const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(TS * 0.95, 0.15, TS * 0.95));
      S.objs.glow = Array.from({ length: N * N }, (_, k) => {
        const l = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: '#ffffff' }));
        l.position.copy(S.objs.tiles[k].position);
        scene.add(l);
        return l;
      });
    },
    update(S, t, W) {
      const o = S.objs;
      const pos = o.water.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = o.wBase[i * 3], z = o.wBase[i * 3 + 2];
        pos.array[i * 3 + 1] = Math.sin(x * 2 + t * 1.5) * 0.035 + Math.cos(z * 2.4 + t) * 0.035;
      }
      pos.needsUpdate = true;
      const rd = roundAt(W, t) || W.rounds[0];
      const dropT = t - rd.drop;
      for (let k = 0; k < N * N; k++) {
        const m = o.tiles[k];
        const good = rd.cols[k] === rd.c;
        m.material = o.mats[rd.cols[k]];
        const [x, y] = center(k);
        let yy = -0.07, dx = 0, dz = 0;
        if (!good && dropT < 0 && dropT > -1) { dx = Math.sin(t * 60 + k) * 0.01; dz = Math.cos(t * 50 + k) * 0.01; }
        if (!good && dropT >= 0 && dropT < DROP) yy = -0.07 - Math.min(1.5, dropT * dropT * 6);
        if (!good && dropT >= DROP) yy = -0.07 - Math.max(0, 1.5 - (dropT - DROP) * 6);
        m.position.set(x + dx, yy, y + dz);
        o.glow[k].visible = good && dropT < DROP;
        o.glow[k].position.copy(m.position);
        o.glow[k].scale.setScalar(1 + 0.03 * Math.sin(t * 10));
      }
    },
  },

  draw(g, v, t, W, ents, meId) {
    const { size } = v;
    // agua abajo
    g.fillStyle = '#023e8a';
    g.fillRect(0, 0, size, size);
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const y = ((i * size) / 7 + t * 15) % (size + 20) - 10;
      g.beginPath();
      for (let x = 0; x <= size; x += 10) g.lineTo(x, y + Math.sin(x / 20 + t * 2 + i) * 4);
      g.stroke();
    }
    const rd = roundAt(W, t) || W.rounds[0];
    const dropping = t >= rd.drop && t < rd.drop + DROP;
    const warn = t < rd.drop && rd.drop - t < 1;
    const ts = TS * v.R;
    for (let k = 0; k < N * N; k++) {
      const ci = rd.cols[k];
      const isGood = ci === rd.c;
      if (dropping && !isGood) continue;
      const [cx, cy] = center(k);
      let x = v.X(cx) - ts / 2, y = v.Y(cy) - ts / 2;
      if (warn && !isGood) { x += Math.sin(t * 60 + k) * 2; y += Math.cos(t * 50 + k) * 2; }
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(x + 3, y + 6, ts - 4, ts - 4);
      g.fillStyle = COLORS[ci].c;
      g.globalAlpha = !isGood && t < rd.drop ? 0.75 : 1;
      g.beginPath();
      if (g.roundRect) g.roundRect(x + 2, y + 2, ts - 4, ts - 4, 8); else g.rect(x + 2, y + 2, ts - 4, ts - 4);
      g.fill();
      g.globalAlpha = 1;
      if (isGood && t < rd.drop + DROP) {
        g.lineWidth = 3 + 2 * Math.sin(t * 10);
        g.strokeStyle = '#fff';
        g.stroke();
      }
    }
    for (const e of ents) {
      if (e.out) continue;
      drawPlayer(g, v, { ...e, pr: PR, scale: e.e && typeof e.e.f === 'number' ? e.e.f : (e.scale ?? 1) }, meId, t);
    }
  },

  pack: (p) => (p.fall > 0 || p.respawn ? { f: Math.round((p.scale || 0) * 100) / 100 } : null),
};

export default {
  id: 'tiles',
  name: 'Pisa el color',
  emoji: '🟩',
  realtime: true,
  desc: 'Se anuncia un color y empieza la cuenta: corre a una baldosa de ese color antes de que las demás se caigan al agua. Cada vez hay menos tiempo. 2 vidas.',
  dur: () => TOTAL * 1000,
  mount: (el, ctx) => mountRT(el, ctx, G),
  evaluate: (v) => evalSurvival(v, TOTAL, LIVES),
  bot: (r, seed, p) => simulateBot(G, seed, Number(String(p?.id || 'bot0').slice(3)) || 0),
};
