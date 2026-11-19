// 🪙 Fiebre de monedas — tiempo real. Aparecen monedas por todo el escenario:
// recoge todas las que puedas en 30 segundos. Las grandes valen 5. El botón
// ACELERA da un impulso. Si otro la agarra primero, desaparece.
import { mulberry32 } from '../util.js';
import { DT, TAU, mountRT, simulateBot, newPlayerBase, moveBasic, clampBox, drawPlayer } from '../rt.js';

const TOTAL = 30;
const HALF = 0.9;
const PR = 0.06;
const CR = 0.045;
const LIFE = 6;

const G = {
  TOTAL, LIVES: 0, lives: 0,
  action: 'ACELERA',

  world(seed) {
    const r = mulberry32(seed ^ 0xc01c);
    const coins = [];
    let t = 0.2;
    let id = 0;
    // al inicio, unas cuantas monedas a la vez
    for (let i = 0; i < 6; i++) coins.push({ id: id++, t0: 0, x: (r() * 2 - 1) * 0.8, y: (r() * 2 - 1) * 0.8, v: 1 });
    while (t < TOTAL - 0.5) {
      const big = r() < 0.08;
      coins.push({ id: id++, t0: t, x: (r() * 2 - 1) * 0.82, y: (r() * 2 - 1) * 0.82, v: big ? 5 : 1 });
      t += 0.42;
    }
    return { coins };
  },

  spawn(i) {
    const a = -Math.PI / 2 + (i * TAU) / 4 + Math.PI / 4;
    const p = newPlayerBase(Math.cos(a) * 0.6, Math.sin(a) * 0.6, 0);
    p.got = [];
    p.gs = new Set();
    p.s = 0;
    return p;
  },

  step(p, inp, t, W, ext) {
    p._ev = null;
    moveBasic(p, inp, 0.66);
    clampBox(p, HALF - PR);
    for (const c of W.coins) {
      if (c.t0 > t) break;
      if (t > c.t0 + LIFE || p.gs.has(c.id) || (ext && ext.taken.has(c.id))) continue;
      if (Math.hypot(p.x - c.x, p.y - c.y) < PR + CR * (c.v > 1 ? 1.6 : 1)) {
        p.gs.add(c.id);
        p.got.push(c.id);
        p.s += c.v;
        return c.v > 1 ? 'big' : 'coin';
      }
    }
    return p._ev;
  },

  // Monedas que ya agarraron los demás (llegan en la red).
  collectTaken(ext, others) {
    for (const o of others) if (o.e && Array.isArray(o.e.g)) for (const id of o.e.g) ext.taken.add(id);
  },

  brain(seed, idx, W) {
    const r = mulberry32((seed ^ (0x27d4eb2d * (idx + 1))) >>> 0);
    const spd = 0.3 + r() * 0.12;
    let target = null, until = 0;
    return (p, t) => {
      if (!target || t > until || p.gs.has(target.id) || t > target.t0 + LIFE) {
        target = null;
        let best = 1e9;
        for (const c of W.coins) {
          if (c.t0 > t) break;
          if (t > c.t0 + LIFE - 0.5 || p.gs.has(c.id)) continue;
          const d = Math.hypot(c.x - p.x, c.y - p.y) / c.v ** 0.5 + r() * 0.25;
          if (d < best) { best = d; target = c; }
        }
        until = t + 0.9 + r() * 0.9;
      }
      if (!target) return { x: 0, y: 0 };
      const dx = target.x - p.x, dy = target.y - p.y, l = Math.hypot(dx, dy) || 1;
      if (target.v > 1 && l > 0.3 && r() < 0.005) p.act = true;
      return { x: (dx / l) * spd, y: (dy / l) * spd };
    };
  },

  result: (p) => ({ s: p.s }),
  pack: (p) => ({ g: p.got.slice(-40), s: p.s }),
  hud: (p) => `{coin} ${p.s}`,
  hudRight: (ents) => {
    const best = ents.reduce((m, e) => Math.max(m, (e.e && e.e.s) || e.s || 0), 0);
    return `{crown} ${best}`;
  },
  endText: (p) => `{coin} ¡${p.s} monedas!`,

  music: 'happy',
  events(t0, t1, W, ext, ents, fx) {
    for (let k = 1; k <= 5; k++) { const tt = TOTAL - k; if (tt > t0 && tt <= t1) fx.sfx.count(); }
    for (const c of W.coins) {
      if (c.t0 > t1) break;
      if (c.v > 1 && c.t0 > t0) { fx.sfx.big(0.5); fx.burst(c.x, 0.1, c.y, { n: 24, color: ['#ffd60a', '#ffffff'], speed: 0.45, up: 1, size: 0.04, life: 0.8, gravity: 1 }); }
    }
    const n = ext.taken ? ext.taken.size : 0;
    if (n > (fx.st.tk || 0)) fx.sfx.coin(0.25);
    fx.st.tk = n;
  },

  PR,
  scene3d: {
    sky: '#a8e6cf',
    camFit: 1.3,
    camElev: 62,
    hemiGround: '#2d6a4f',
    setup(S) {
      const { THREE, scene } = S;
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d');
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#52b788' : '#5fc495'; g.fillRect(i * 32, j * 32, 32, 32); }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const ground = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 0.2, HALF * 2), [
        new THREE.MeshStandardMaterial({ color: '#40916c' }), new THREE.MeshStandardMaterial({ color: '#40916c' }),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: '#40916c' }),
        new THREE.MeshStandardMaterial({ color: '#40916c' }), new THREE.MeshStandardMaterial({ color: '#40916c' }),
      ]);
      ground.position.y = -0.1;
      ground.receiveShadow = true;
      scene.add(ground);
      const wallMat = new THREE.MeshStandardMaterial({ color: '#1b4332' });
      for (const [w, d, x, z] of [[HALF * 2 + 0.08, 0.04, 0, -HALF - 0.02], [HALF * 2 + 0.08, 0.04, 0, HALF + 0.02], [0.04, HALF * 2, -HALF - 0.02, 0], [0.04, HALF * 2, HALF + 0.02, 0]]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), wallMat);
        m.position.set(x, 0.04, z);
        m.castShadow = true;
        scene.add(m);
      }
      const island = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.1, 48), new THREE.MeshStandardMaterial({ color: '#95d5b2' }));
      island.position.y = -0.25;
      scene.add(island);
      S.objs.coinGeo = new THREE.CylinderGeometry(CR * 1.35, CR * 1.35, 0.02, 24);
      S.objs.coinGeo.rotateX(Math.PI / 2);
      S.objs.coinMat = new THREE.MeshStandardMaterial({ color: '#ffd60a', metalness: 0.15, roughness: 0.3, emissive: '#c99700', emissiveIntensity: 0.55 });
      S.objs.bigMat = new THREE.MeshStandardMaterial({ color: '#ffb703', metalness: 0.15, roughness: 0.3, emissive: '#d17a00', emissiveIntensity: 0.6 });
      S.objs.live = new Map();
    },
    update(S, t, W, ext, ents) {
      const { THREE, scene } = S;
      const o = S.objs;
      const keep = new Set();
      for (const c of W.coins) {
        if (c.t0 > t) break;
        const age = t - c.t0;
        if (age > LIFE) continue;
        let gone = ext && ext.taken.has(c.id);
        if (!gone) for (const e of ents) if (e.gs && e.gs.has(c.id)) { gone = true; break; }
        if (gone) continue;
        keep.add(c.id);
        let m = o.live.get(c.id);
        if (!m) {
          m = new THREE.Mesh(o.coinGeo, c.v > 1 ? o.bigMat : o.coinMat);
          m.castShadow = true;
          if (c.v > 1) m.scale.setScalar(1.7);
          scene.add(m);
          o.live.set(c.id, m);
        }
        const pop = Math.min(1, age / 0.25) * (c.v > 1 ? 1.7 : 1);
        m.scale.setScalar(pop);
        m.position.set(c.x, CR * 1.35 * pop + 0.02 + Math.sin(t * 3 + c.id) * 0.01, c.y);
        m.rotation.y = t * 3 + c.id;
        m.visible = !(age > LIFE - 1.2 && Math.floor(t * 10) % 2);
      }
      for (const [id, m] of o.live) if (!keep.has(id)) { scene.remove(m); o.live.delete(id); }
    },
    tag: (e) => String((e.e && e.e.s) ?? e.s ?? 0),
  },

  draw(g, v, t, W, ents, meId, ext) {
    const { size } = v;
    g.fillStyle = '#2d6a4f';
    g.fillRect(0, 0, size, size);
    const x0 = v.X(-HALF), w = HALF * 2 * v.R;
    g.fillStyle = '#52b788';
    g.fillRect(x0, x0, w, w);
    g.strokeStyle = 'rgba(255,255,255,0.15)';
    g.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      g.beginPath(); g.moveTo(x0 + (i * w) / 8, x0); g.lineTo(x0 + (i * w) / 8, x0 + w); g.stroke();
      g.beginPath(); g.moveTo(x0, x0 + (i * w) / 8); g.lineTo(x0 + w, x0 + (i * w) / 8); g.stroke();
    }
    g.lineWidth = 6; g.strokeStyle = '#1b4332'; g.strokeRect(x0, x0, w, w);
    const mine = ents.find((e) => e.id === meId);
    const myGot = mine && mine.gs ? mine.gs : new Set();
    for (const c of W.coins) {
      if (c.t0 > t) break;
      const age = t - c.t0;
      if (age > LIFE || myGot.has(c.id) || (ext && ext.taken.has(c.id))) continue;
      const blink = age > LIFE - 1.2 && Math.floor(t * 10) % 2;
      if (blink) continue;
      const pop = Math.min(1, age / 0.25);
      const rr = CR * v.R * (c.v > 1 ? 1.7 : 1) * pop;
      const sx = Math.abs(Math.cos(t * 4 + c.id));
      g.beginPath();
      g.ellipse(v.X(c.x), v.Y(c.y), rr * Math.max(0.25, sx), rr, 0, 0, TAU);
      g.fillStyle = c.v > 1 ? '#ffb703' : '#ffd60a';
      g.fill();
      g.lineWidth = 2; g.strokeStyle = '#b5838d'; g.stroke();
      if (c.v > 1) { g.fillStyle = '#7f5539'; g.font = `bold ${Math.round(rr)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; if (sx > 0.5) g.fillText('5', v.X(c.x), v.Y(c.y)); }
    }
    for (const e of ents) drawPlayer(g, v, { ...e, pr: PR, tag: String((e.e && e.e.s) ?? e.s ?? 0) }, meId, t);
  },
};

export default {
  id: 'coins',
  name: 'Fiebre de monedas',
  realtime: true,
  desc: '¡Llueven monedas! Recoge todas las que puedas en 30 segundos. Las grandes valen 5. Usa ACELERA para ganarle a los demás.',
  dur: () => TOTAL * 1000,
  mount: (el, ctx) => mountRT(el, ctx, G),
  evaluate(v) {
    if (!v || typeof v.s !== 'number') return null;
    const s = Math.max(0, Math.min(400, Math.floor(v.s)));
    return { score: s, label: `${s} monedas` };
  },
  bot: (r, seed, p) => simulateBot(G, seed, Number(String(p?.id || 'bot0').slice(3)) || 0),
};
