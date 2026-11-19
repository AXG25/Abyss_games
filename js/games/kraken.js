// 🐙 Kraken en cubierta — tiempo real (3D).
// Todos en la cubierta de un barco. Del centro salen tentáculos que giran: los
// largos (morados) cruzan todo el barco → SALTA; los cortos (rosados) solo
// llegan a la mitad → aléjate hacia el borde. 3 vidas.
import { mulberry32 } from '../util.js';
import { DT, TAU, mountRT, simulateBot, newPlayerBase, drawPlayer, evalSurvival } from '../rt.js';

const TOTAL = 45;
const DECK = 0.9;
const HOLE = 0.17;
const LONG = 1.0;
const SHORT = 0.56;
const HW = 0.055;
const PR = 0.055;
const SPEED = 0.75;
const JUMP = 0.62;
const LIVES = 3;
const wrap = (a) => ((a % TAU) + TAU + Math.PI) % TAU - Math.PI;

export function makeArms(seed) {
  const r = mulberry32(seed ^ 0x9e3779b9);
  const n = Math.ceil(TOTAL / DT) + 2;
  const ang = new Float64Array(n);
  const om = new Float64Array(n);
  let dir = r() < 0.5 ? 1 : -1;
  let nextFlip = 5 + r() * 5;
  let a = r() * TAU;
  for (let i = 0; i < n; i++) {
    const t = i * DT;
    if (t > nextFlip) { dir = -dir; nextFlip = t + 4 + r() * 5; }
    const w = dir * (1.1 + 0.032 * t);
    a += w * DT;
    ang[i] = a;
    om[i] = w;
  }
  const grow = (t, t0) => Math.max(0, Math.min(1, (t - t0) / 1.2));
  return (t) => {
    const i = Math.max(0, Math.min(n - 1, Math.floor(t / DT)));
    const a0 = ang[i];
    const w = om[i];
    const arms = [{ a: a0, L: LONG, long: true, w }];
    if (t > 12 && t <= 26) arms.push({ a: a0 + Math.PI, L: SHORT * grow(t, 12), long: false, w });
    if (t > 26) {
      arms.push({ a: a0 + Math.PI, L: Math.max(SHORT, LONG * grow(t, 26)), long: true, w });
      arms.push({ a: a0 + Math.PI / 2, L: SHORT * grow(t, 26), long: false, w });
      arms.push({ a: a0 - Math.PI / 2, L: SHORT * grow(t, 26), long: false, w });
    }
    return arms;
  };
}

function hitBy(p, arm) {
  const pr = Math.hypot(p.x, p.y);
  if (pr > arm.L + PR) return false;
  const d = wrap(Math.atan2(p.y, p.x) - arm.a);
  return Math.cos(d) > 0 && pr * Math.abs(Math.sin(d)) < HW + PR;
}

// Puntos a lo largo de un tentáculo (para dibujarlo en 2D y 3D).
function armPoints(arm, t, segs) {
  const pts = [];
  for (let s = 0; s <= segs; s++) {
    const f = s / segs;
    const rr = HOLE * 0.5 + f * (arm.L - HOLE * 0.5);
    const wig = Math.sin(f * 7 - t * 9) * 0.035 * f;
    const a = arm.a + wig / Math.max(rr, 0.1);
    pts.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr, f, w: HW * (1.25 - f * 0.55) });
  }
  return pts;
}

export const G = {
  TOTAL, LIVES, lives: LIVES, PR,
  action: 'SALTA',

  world(seed) { return { armsAt: makeArms(seed) }; },

  spawn(i) {
    const a = -Math.PI / 2 + (i * TAU) / 4 + 0.4;
    const p = newPlayerBase(Math.cos(a) * 0.7, Math.sin(a) * 0.7, LIVES);
    p.jt = 0; p.cd = 0;
    return p;
  },

  step(p, inp, t, W) {
    if (p.out) return null;
    const arms = W.armsAt(t);
    let ev = null;
    p.x += inp.x * SPEED * DT;
    p.y += inp.y * SPEED * DT;
    const r = Math.hypot(p.x, p.y) || 1e-6;
    const cl = Math.max(HOLE + PR, Math.min(DECK, r));
    if (cl !== r) { p.x *= cl / r; p.y *= cl / r; }
    if (p.act && p.jt <= 0 && p.cd <= 0) { p.jt = JUMP; ev = 'act'; }
    p.act = false;
    if (p.jt > 0) {
      p.jt -= DT;
      p.z = p.jt > 0 ? Math.sin(Math.PI * (1 - p.jt / JUMP)) : 0;
      if (p.jt <= 0) { p.cd = 0.1; p.z = 0; }
    } else if (p.cd > 0) p.cd -= DT;
    if (p.inv > 0) p.inv -= DT;
    const air = p.jt > 0.05 && p.jt < JUMP - 0.04;
    if (!air && p.inv <= 0) {
      for (const arm of arms) {
        if (!hitBy(p, arm)) continue;
        p.h--;
        p.inv = 1.4;
        const a = Math.atan2(p.y, p.x) + Math.sign(arm.w || 1) * 0.35;
        const rr = Math.hypot(p.x, p.y);
        p.x = Math.cos(a) * rr;
        p.y = Math.sin(a) * rr;
        if (p.h <= 0) { p.out = true; p.tOut = t; return 'out'; }
        return 'hit';
      }
    }
    return ev;
  },

  brain(seed, idx, W) {
    const r = mulberry32((seed ^ (0x51ed27 * (idx + 1))) >>> 0);
    const skill = 0.8 + r() * 0.15;
    let goalA = r() * TAU;
    let goalR = 0.75;
    let nextGoal = 0;
    const decided = new Map();
    return (p, t) => {
      const arms = W.armsAt(t);
      if (t > nextGoal) { goalA = Math.atan2(p.y, p.x) + (r() - 0.5) * 2; goalR = (t > 11 ? 0.72 : 0.58) + r() * 0.15; nextGoal = t + 1.5 + r() * 2.5; }
      const gx = Math.cos(goalA) * goalR - p.x;
      const gy = Math.sin(goalA) * goalR - p.y;
      const gl = Math.hypot(gx, gy);
      const inp = gl > 0.04 ? { x: (gx / gl) * 0.8, y: (gy / gl) * 0.8 } : { x: 0, y: 0 };
      const pa = Math.atan2(p.y, p.x);
      const pr = Math.hypot(p.x, p.y);
      arms.forEach((arm, k) => {
        if (pr > arm.L + 0.05) return;
        const ahead = wrap((pa - arm.a) * Math.sign(arm.w));
        const angW = Math.asin(Math.min(1, (HW + PR) / Math.max(pr, 0.01)));
        const tc = (ahead - angW) / Math.abs(arm.w);
        if (ahead > -angW && tc < 0.12) {
          if (!decided.get(k)) { decided.set(k, true); if (r() < skill) p.act = true; }
        } else if (ahead < -angW - 0.1 || tc > 0.8) decided.set(k, false);
      });
      return inp;
    };
  },

  result: (p) => ({ h: Math.max(0, p.h), t: p.out ? Math.round(p.tOut * 1000) : TOTAL * 1000 }),

  banner(t) {
    if (t > 12 && t < 13.8) return { text: '{warn} ¡Tentáculo corto! Ve al borde', color: '#ff4d6d' };
    if (t > 26 && t < 27.8) return { text: '{warn} ¡El kraken se enoja!', color: '#7b2cbf' };
    return null;
  },

  music: 'pirate',
  events(t0, t1, W, ext, ents, fx) {
    const st = fx.st;
    if (!st.r0) { st.r0 = 1; fx.sfx.roar(0.9); fx.shake(0.03); }
    for (const T of [12, 26]) {
      if (t0 < T && t1 >= T) {
        fx.sfx.roar(1);
        fx.shake(0.07);
        fx.burst(0, 0.05, 0, { n: 50, color: ['#7b2cbf', '#f15bb5', '#caf0f8', '#ffffff'], speed: 0.9, up: 1.8, size: 0.06, life: 1.1, gravity: 3 });
      }
    }
    // silbido cuando un tentáculo se te acerca
    const me = fx.me;
    if (!me.out) {
      const pa = Math.atan2(me.y, me.x), pr = Math.hypot(me.x, me.y);
      W.armsAt(t1).forEach((arm, k) => {
        if (pr > arm.L) return;
        const ahead = wrap((pa - arm.a) * Math.sign(arm.w));
        const key = 'w' + k;
        if (ahead > 0 && ahead < 0.55) { if (!st[key]) { st[key] = 1; fx.sfx.whoosh(0.9); } }
        else if (ahead < 0 || ahead > 1.2) st[key] = 0;
      });
    }
    // agua saliendo del agujero
    if (Math.floor(t1 * 3) !== Math.floor(t0 * 3)) fx.burst(0, 0.02, 0, { n: 5, color: ['#caf0f8', '#90e0ef'], speed: 0.22, up: 0.9, size: 0.04, life: 0.7, gravity: 2.5 });
  },

  // ---------------- 3D
  scene3d: {
    sky: '#8ecae6',
    hemiGround: '#1d3557',
    camElev: 60,
    setup(S) {
      const { THREE, scene } = S;
      // mar con olas
      const seaGeo = new THREE.PlaneGeometry(14, 14, 48, 48);
      seaGeo.rotateX(-Math.PI / 2);
      const sea = new THREE.Mesh(seaGeo, new THREE.MeshStandardMaterial({ color: '#1e6fb8', roughness: 0.3, metalness: 0.1, flatShading: true }));
      sea.position.y = -0.32;
      sea.receiveShadow = true;
      scene.add(sea);
      S.objs.sea = sea;
      S.objs.seaBase = Float32Array.from(seaGeo.attributes.position.array);
      // casco
      const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.06, 0.82, 0.34, 48), new THREE.MeshStandardMaterial({ color: '#6b3b1f', roughness: 0.8 }));
      hull.position.y = -0.2;
      hull.castShadow = true;
      scene.add(hull);
      // cubierta de tablas
      const c = document.createElement('canvas');
      c.width = c.height = 512;
      const g = c.getContext('2d');
      for (let i = 0; i < 12; i++) {
        g.fillStyle = i % 2 ? '#c98b4f' : '#bf7f45';
        g.fillRect((i * 512) / 12, 0, 512 / 12 + 1, 512);
        g.fillStyle = 'rgba(80,40,10,0.35)';
        g.fillRect((i * 512) / 12, 0, 2, 512);
        for (let k = 0; k < 3; k++) g.fillRect((i * 512) / 12 + 6, ((i * 97 + k * 173) % 512), 512 / 12 - 12, 2);
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const deck = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.06, 64), [
        new THREE.MeshStandardMaterial({ color: '#8b5a2b' }),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 }),
        new THREE.MeshStandardMaterial({ color: '#8b5a2b' }),
      ]);
      deck.position.y = -0.03;
      deck.receiveShadow = true;
      scene.add(deck);
      // borda
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.035, 10, 64), new THREE.MeshStandardMaterial({ color: '#5a2e12', roughness: 0.7 }));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.02;
      rim.castShadow = true;
      scene.add(rim);
      // agujero del kraken
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(HOLE, HOLE * 0.9, 0.02, 32), new THREE.MeshBasicMaterial({ color: '#0b0614' }));
      hole.position.y = 0.002;
      scene.add(hole);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(HOLE, 0.014, 8, 32), new THREE.MeshStandardMaterial({ color: '#3d2314' }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.01;
      scene.add(ring);
      // zona de tentáculos cortos
      const zone = new THREE.Mesh(new THREE.RingGeometry(HOLE + 0.02, SHORT, 64), new THREE.MeshBasicMaterial({ color: '#ff4d6d', transparent: true, opacity: 0, depthWrite: false }));
      zone.rotation.x = -Math.PI / 2;
      zone.position.y = 0.003;
      scene.add(zone);
      S.objs.zone = zone;
      // tentáculos: esferas encadenadas
      const segs = 16;
      const sph = new THREE.SphereGeometry(1, 16, 12);
      const matLong = new THREE.MeshStandardMaterial({ color: '#7b2cbf', roughness: 0.35 });
      const matShort = new THREE.MeshStandardMaterial({ color: '#f15bb5', roughness: 0.35 });
      const matSuck = new THREE.MeshStandardMaterial({ color: '#ffd6ec', roughness: 0.5 });
      S.objs.arms = Array.from({ length: 4 }, () => {
        const grp = new THREE.Group();
        const balls = Array.from({ length: segs + 1 }, (_, i) => {
          const m = new THREE.Mesh(sph, matLong);
          m.castShadow = true;
          grp.add(m);
          if (i % 2 === 0 && i > 1) {
            const s = new THREE.Mesh(sph, matSuck);
            s.scale.setScalar(0.3);
            m.add(s);
            s.position.set(0, 0.75, 0);
          }
          return m;
        });
        scene.add(grp);
        return { grp, balls };
      });
      S.objs.mats = { matLong, matShort };
      S.objs.segs = segs;
    },
    update(S, t, W) {
      const { sea, seaBase, arms, mats, segs, zone } = S.objs;
      // olas
      const pos = sea.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = seaBase[i * 3], z = seaBase[i * 3 + 2];
        pos.array[i * 3 + 1] = Math.sin(x * 2.2 + t * 1.6) * 0.04 + Math.cos(z * 2.6 + t * 1.3) * 0.04;
      }
      pos.needsUpdate = true;
      zone.material.opacity = t > 11 ? 0.12 + 0.06 * Math.sin(t * 6) : 0;
      const list = W.armsAt(t);
      arms.forEach((A, i) => {
        const arm = list[i];
        A.grp.visible = !!arm && arm.L > 0.05;
        if (!A.grp.visible) return;
        const pts = armPoints(arm, t, segs);
        A.balls.forEach((b, k) => {
          const p = pts[k];
          b.material = arm.long ? mats.matLong : mats.matShort;
          const r = p.w * 1.05;
          b.scale.setScalar(r);
          // sale del agujero arqueado y luego se arrastra por la cubierta
          const arch = Math.pow(1 - p.f, 3) * 0.16;
          b.position.set(p.x, r * 0.7 + arch + Math.sin(t * 8 + k) * 0.004, p.y);
        });
      });
    },
  },

  draw(g, v, t, W, ents, meId) {
    const { size, c, R } = v;
    g.fillStyle = '#0b3b66'; g.fillRect(0, 0, size, size);
    g.beginPath(); g.arc(c, c, R * 1.04, 0, TAU); g.fillStyle = '#6b3b1f'; g.fill();
    g.beginPath(); g.arc(c, c, R * 0.98, 0, TAU); g.fillStyle = '#c98b4f'; g.fill();
    if (t > 11) { g.beginPath(); g.arc(c, c, SHORT * R, 0, TAU); g.fillStyle = 'rgba(255,77,109,0.12)'; g.fill(); }
    g.beginPath(); g.arc(c, c, HOLE * R, 0, TAU); g.fillStyle = '#000'; g.fill();
    for (const arm of W.armsAt(t)) {
      if (arm.L < 0.05) continue;
      for (const p of armPoints(arm, t, 18).reverse()) {
        g.beginPath(); g.arc(v.X(p.x), v.Y(p.y), p.w * R, 0, TAU);
        g.fillStyle = arm.long ? '#7b2cbf' : '#f15bb5'; g.fill();
      }
    }
    for (const e of ents) drawPlayer(g, v, { ...e, pr: PR }, meId, t);
  },
};

export default {
  id: 'kraken',
  name: 'Kraken en cubierta',
  realtime: true,
  desc: '¡El kraken atacó el barco! Muévete con el joystick y SALTA los tentáculos morados. Los rosados solo llegan a la mitad: aléjate hacia el borde. Tienes 3 vidas.',
  dur: () => TOTAL * 1000,
  mount: (el, ctx) => mountRT(el, ctx, G),
  evaluate: (v) => evalSurvival(v, TOTAL, LIVES),
  bot: (r, seed, p) => simulateBot(G, seed, Number(String(p?.id || 'bot0').slice(3)) || 0),
};
