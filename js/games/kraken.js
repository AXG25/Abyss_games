// 🐙 Kraken en cubierta — tiempo real (3D).
// Todos en la cubierta de un barco en altamar. El kraken rompe la cubierta y
// saca tentáculos que giran: los largos (morados) barren todo el barco → SALTA;
// los cortos (rosados) solo llegan cerca del centro → aléjate. 3 vidas.
import { mulberry32 } from '../util.js';
import { DT, TAU, mountRT, simulateBot, newPlayerBase, drawPlayer, evalSurvival } from '../rt.js';

const TOTAL = 45;
const HOLE = 0.17;
const LONG = 1.42;     // los largos alcanzan de proa a popa
const SHORT = 0.56;
const HW = 0.055;
const PR = 0.055;
const SPEED = 0.75;
const JUMP = 0.62;
const LIVES = 3;
const wrap = (a) => ((a % TAU) + TAU + Math.PI) % TAU - Math.PI;

// ---- forma del barco (vista de arriba): proa hacia -z, popa hacia +z
const BEAM = 0.82;     // media manga (ancho)
const BOW = -1.38;     // punta de la proa
const STERN = 1.12;    // espejo de popa
export function halfWidth(z) {
  if (z <= BOW || z >= STERN) return 0;
  if (z >= 0) return BEAM * Math.sqrt(Math.max(0, 1 - (z / 1.28) ** 2));
  return BEAM * Math.pow(Math.max(0, 1 - Math.pow(z / BOW, 1.8)), 0.62);
}
// ¿cabe un jugador aquí? (con un margen para la baranda)
const M = PR + 0.05;
const inside = (x, z) => z > BOW + 0.34 && z < STERN - 0.22 && Math.abs(x) < halfWidth(z) - M;
// si se sale, lo acerca al centro hasta que quepa (el barco "rodea" el centro)
function clampShip(p) {
  if (inside(p.x, p.y)) return;
  let lo = 0, hi = 1;
  for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (inside(p.x * m, p.y * m)) lo = m; else hi = m; }
  p.x *= lo; p.y *= lo;
}

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
    // al principio el tentáculo sale despacio
    const w = dir * (t < 2 ? 0.4 + t * 0.35 : 1.1 + 0.03 * t);
    a += w * DT;
    ang[i] = a;
    om[i] = w;
  }
  const grow = (t, t0, d = 1.2) => Math.max(0, Math.min(1, (t - t0) / d));
  return (t) => {
    const i = Math.max(0, Math.min(n - 1, Math.floor(t / DT)));
    const a0 = ang[i];
    const w = om[i];
    // el primer tentáculo emerge del agujero en los primeros 2 segundos
    const arms = [{ a: a0, L: LONG * (0.12 + 0.88 * grow(t, 0, 2)), long: true, w }];
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
  actionIcon: 'jump',
  cd1: (p) => (p.jt > 0 ? Math.min(1, (p.jt + 0.1) / (JUMP + 0.1)) : p.cd > 0 ? p.cd / (JUMP + 0.1) : 0),
  music: 'pirate',

  world(seed) { return { armsAt: makeArms(seed) }; },

  spawn(i) {
    const spots = [[-0.42, 0.55], [0.42, 0.55], [-0.42, -0.6], [0.42, -0.6], [0, 0.8]];
    const [x, y] = spots[i % spots.length];
    const p = newPlayerBase(x, y, LIVES);
    p.jt = 0; p.cd = 0;
    return p;
  },

  step(p, inp, t, W, ext) {
    if (p.out) return null;
    const arms = W.armsAt(t);
    let ev = null;
    p.x += inp.x * SPEED * DT;
    p.y += inp.y * SPEED * DT;
    // choques entre jugadores: se empujan (si uno va saltando, pasa por encima)
    if (ext && ext.all && !((p.z || 0) > 0.3)) {
      for (const o of ext.all) {
        if (!o || o === p || o.id === p.id || o.out || (o.z || 0) > 0.3) continue;
        const dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy);
        if (d > 1e-4 && d < PR * 2.1) {
          const over = PR * 2.1 - d;
          p.x += (dx / d) * over * 0.55;
          p.y += (dy / d) * over * 0.55;
        }
      }
    }
    clampShip(p);
    const r = Math.hypot(p.x, p.y) || 1e-6;
    if (r < HOLE + PR) { p.x *= (HOLE + PR) / r; p.y *= (HOLE + PR) / r; }
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
        clampShip(p);
        if (p.h <= 0) { p.out = true; p.tOut = t; return 'out'; }
        return 'hit';
      }
    }
    return ev;
  },

  brain(seed, idx, W) {
    const r = mulberry32((seed ^ (0x51ed27 * (idx + 1))) >>> 0);
    const skill = 0.8 + r() * 0.15;
    let gx = 0, gy = 0.6;
    let nextGoal = 0;
    const decided = new Map();
    return (p, t) => {
      const arms = W.armsAt(t);
      if (t > nextGoal) {
        // un punto del barco lejos del centro (sobre todo cuando hay tentáculos cortos)
        for (let k = 0; k < 8; k++) {
          const a = Math.atan2(p.y, p.x) + (r() - 0.5) * 2;
          const d = (t > 11 ? 0.68 : 0.5) + r() * 0.5;
          const x = Math.cos(a) * d, y = Math.sin(a) * d;
          if (inside(x, y)) { gx = x; gy = y; break; }
        }
        nextGoal = t + 1.5 + r() * 2.5;
      }
      const dx = gx - p.x, dy = gy - p.y, gl = Math.hypot(dx, dy);
      const inp = gl > 0.04 ? { x: (dx / gl) * 0.8, y: (dy / gl) * 0.8 } : { x: 0, y: 0 };
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
    if (t > 12 && t < 13.8) return { text: '{warn} ¡Tentáculo corto! Aléjate del centro', color: '#ff4d6d' };
    if (t > 26 && t < 27.8) return { text: '{warn} ¡El kraken se enoja!', color: '#7b2cbf' };
    return null;
  },

  events(t0, t1, W, ext, ents, fx) {
    const st = fx.st;
    if (!st.r0 && t1 > 0) { st.r0 = 1; fx.sfx.roar(0.9); fx.shake(0.04); fx.burst(0, 0.05, 0, { n: 40, color: ['#caf0f8', '#ffffff', '#7b2cbf'], speed: 0.6, up: 1.8, size: 0.05, life: 1, gravity: 3 }); }
    for (const T of [12, 26]) {
      if (t0 < T && t1 >= T) {
        fx.sfx.roar(1);
        fx.shake(0.07);
        fx.burst(0, 0.05, 0, { n: 50, color: ['#7b2cbf', '#f15bb5', '#caf0f8', '#ffffff'], speed: 0.9, up: 1.8, size: 0.06, life: 1.1, gravity: 3 });
      }
    }
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
    if (Math.floor(t1 * 3) !== Math.floor(t0 * 3)) fx.burst(0, 0.02, 0, { n: 5, color: ['#caf0f8', '#90e0ef'], speed: 0.22, up: 0.9, size: 0.04, life: 0.7, gravity: 2.5 });
    // salpicaduras donde el tentáculo largo toca el agua por los costados
    if (Math.floor(t1 * 6) !== Math.floor(t0 * 6)) {
      for (const arm of W.armsAt(t1)) {
        if (!arm.long) continue;
        const x = Math.cos(arm.a) * arm.L, z = Math.sin(arm.a) * arm.L;
        if (Math.abs(x) > halfWidth(z) - 0.02) fx.burst(x, 0, z, { n: 4, color: ['#ffffff', '#caf0f8'], speed: 0.3, up: 1, size: 0.05, life: 0.6, gravity: 3 });
      }
    }
  },

  // ---------------- 3D: barco en altamar
  scene3d: {
    sky: '#9fd3f5',
    hemiGround: '#1d3557',
    camElev: 62,
    camFit: 0.98,
    camFitZ: 1.5,
    camLookZ: 0.0,
    setup(S) {
      const { THREE, scene } = S;
      scene.fog = new THREE.Fog('#9fd3f5', 6, 16);
      const water = S.makeWater({ foam: [BEAM * 1.04, (STERN - BOW) / 2 + 0.03], foamZ: (STERN + BOW) / 2, deep: '#03335a', shallow: '#1a8ab0', sky: '#c9ecff' });
      water.position.set(0, -0.28, 0);
      scene.add(water);
      S.objs.water = water;

      // contorno del casco
      const pts = [];
      for (let i = 0; i <= 40; i++) { const z = BOW + ((STERN - BOW) * i) / 40; pts.push([halfWidth(z), z]); }
      const shape = new THREE.Shape();
      shape.moveTo(0, BOW);
      pts.forEach(([x, z]) => shape.lineTo(x, z));
      shape.lineTo(-pts[pts.length - 1][0], STERN);
      [...pts].reverse().forEach(([x, z]) => shape.lineTo(-x, z));
      // casco (sólido de madera oscura) y cubierta de tablas encima
      const hullGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.36, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 4 });
      hullGeo.rotateX(Math.PI / 2);
      const hull = new THREE.Mesh(hullGeo, new THREE.MeshStandardMaterial({ color: '#5a2e12', roughness: 0.8 }));
      hull.position.y = -0.06;
      hull.castShadow = true;
      hull.receiveShadow = true;
      scene.add(hull);
      // franja de color en el casco
      const stripe = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: '#c1121f', roughness: 0.6 }));
      stripe.geometry.rotateX(Math.PI / 2);
      stripe.scale.set(1.035, 1, 1.02);
      stripe.position.y = -0.12;
      scene.add(stripe);

      // cubierta con tablas
      const c = document.createElement('canvas');
      c.width = 512; c.height = 1024;
      const g = c.getContext('2d');
      for (let i = 0; i < 14; i++) {
        g.fillStyle = i % 2 ? '#c98b4f' : '#ba7c43';
        g.fillRect((i * 512) / 14, 0, 512 / 14 + 1, 1024);
        g.fillStyle = 'rgba(70,35,10,0.45)';
        g.fillRect((i * 512) / 14, 0, 2, 1024);
        for (let k = 0; k < 5; k++) g.fillRect((i * 512) / 14 + 4, (i * 131 + k * 211) % 1024, 512 / 14 - 8, 2);
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const deckGeo = new THREE.ShapeGeometry(shape, 8);
      deckGeo.rotateX(Math.PI / 2);
      // coordenadas de textura según la posición
      const uv = deckGeo.attributes.uv, pos = deckGeo.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / (2 * BEAM) + 0.5, (pos.getZ(i) - BOW) / (STERN - BOW));
      const deck = new THREE.Mesh(deckGeo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, side: THREE.DoubleSide }));
      deck.position.y = 0.004;
      deck.receiveShadow = true;
      scene.add(deck);

      // baranda: postes y pasamanos por todo el borde
      const railMat = new THREE.MeshStandardMaterial({ color: '#6b3b1f', roughness: 0.7 });
      const outline = [...pts, ...[...pts].reverse().map(([x, z]) => [-x, z])];
      for (let i = 0; i < outline.length - 1; i += 2) {
        const [x, z] = outline[i];
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 6), railMat);
        post.position.set(x * 0.985, 0.045, z);
        post.castShadow = true;
        scene.add(post);
      }
      const railCurve = new THREE.CatmullRomCurve3(outline.map(([x, z]) => new THREE.Vector3(x * 0.985, 0.09, z)), true);
      const rail = new THREE.Mesh(new THREE.TubeGeometry(railCurve, 160, 0.014, 6, true), railMat);
      rail.castShadow = true;
      scene.add(rail);

      // cañones a los costados
      const cannonMat = new THREE.MeshStandardMaterial({ color: '#2b2d42', metalness: 0.6, roughness: 0.4 });
      [-0.25, 0.35].forEach((z) => [-1, 1].forEach((s) => {
        const can = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.18, 10), cannonMat);
        can.rotation.z = Math.PI / 2;
        can.position.set(s * (halfWidth(z) + 0.04), -0.05, z);
        scene.add(can);
      }));

      // mástil en la proa con vela y bandera
      const mastZ = BOW + 0.22;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.3, 10), railMat);
      mast.position.set(0, 0.65, mastZ);
      mast.castShadow = true;
      scene.add(mast);
      const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.8, 8), railMat);
      yard.rotation.z = Math.PI / 2;
      yard.position.set(0, 1.12, mastZ);
      scene.add(yard);
      const sailGeo = new THREE.PlaneGeometry(0.74, 0.55, 10, 6);
      const sail = new THREE.Mesh(sailGeo, new THREE.MeshStandardMaterial({ color: '#f1e3c6', roughness: 0.9, side: THREE.DoubleSide }));
      sail.position.set(0, 0.82, mastZ + 0.02);
      sail.castShadow = true;
      scene.add(sail);
      S.objs.sail = sail;
      S.objs.sailBase = Float32Array.from(sailGeo.attributes.position.array);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.12, 6, 2), new THREE.MeshStandardMaterial({ color: '#1b1035', side: THREE.DoubleSide }));
      flag.position.set(0.1, 1.27, mastZ);
      scene.add(flag);
      S.objs.flag = flag;
      S.objs.flagBase = Float32Array.from(flag.geometry.attributes.position.array);
      // calavera de la bandera
      const skull = new THREE.Mesh(new THREE.CircleGeometry(0.025, 12), new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }));
      skull.position.set(0.1, 1.27, mastZ + 0.002);
      scene.add(skull);
      S.objs.skull = skull;
      // bauprés
      const sprit = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.5, 8), railMat);
      sprit.rotation.x = Math.PI / 2 - 0.35;
      sprit.position.set(0, 0.1, BOW - 0.12);
      scene.add(sprit);

      // popa: timón y cabina baja
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.16), new THREE.MeshStandardMaterial({ color: '#7f4a1f', roughness: 0.8 }));
      cabin.position.set(0, 0.07, STERN - 0.06);
      cabin.castShadow = true;
      scene.add(cabin);
      const wheel = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 20), railMat);
      wheel.add(ring);
      for (let i = 0; i < 8; i++) {
        const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.16, 4), railMat);
        sp.rotation.z = (i * Math.PI) / 4;
        wheel.add(sp);
      }
      wheel.position.set(0, 0.22, STERN - 0.08);
      scene.add(wheel);
      S.objs.wheel = wheel;

      // agujero del kraken con tablas rotas
      const hole = new THREE.Mesh(new THREE.CircleGeometry(HOLE, 32), new THREE.MeshBasicMaterial({ color: '#05020c' }));
      hole.rotation.x = -Math.PI / 2;
      hole.position.y = 0.004;
      scene.add(hole);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU + 0.2;
        const plank = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 0.09 + (i % 3) * 0.03), new THREE.MeshStandardMaterial({ color: '#9c6635' }));
        plank.position.set(Math.cos(a) * (HOLE + 0.01), 0.012, Math.sin(a) * (HOLE + 0.01));
        plank.rotation.set(0.3 + (i % 2) * 0.3, -a, 0.4 * (i % 2 ? 1 : -1));
        plank.castShadow = true;
        scene.add(plank);
      }
      // zona de tentáculos cortos
      const zone = new THREE.Mesh(new THREE.RingGeometry(HOLE + 0.02, SHORT, 64), new THREE.MeshBasicMaterial({ color: '#ff4d6d', transparent: true, opacity: 0, depthWrite: false }));
      zone.rotation.x = -Math.PI / 2;
      zone.position.y = 0.006;
      scene.add(zone);
      S.objs.zone = zone;

      // tentáculos: esferas encadenadas con ventosas
      const segs = 20;
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
            const s2 = new THREE.Mesh(sph, matSuck);
            s2.scale.setScalar(0.3);
            m.add(s2);
            s2.position.set(0, 0.75, 0);
          }
          return m;
        });
        scene.add(grp);
        return { grp, balls };
      });
      S.objs.mats = { matLong, matShort };
      S.objs.segs = segs;
      S.objs.ship = [hull, stripe, deck, rail];
    },
    update(S, t, W, ext, ents, dt) {
      const o = S.objs;
      S.clock = (S.clock || 0) + (dt || 0.016);
      o.water.update(S.clock);
      // vela y bandera ondeando
      const sp = o.sail.geometry.attributes.position;
      for (let i = 0; i < sp.count; i++) sp.array[i * 3 + 2] = o.sailBase[i * 3 + 2] + Math.sin(o.sailBase[i * 3] * 6 + S.clock * 3) * 0.02 + (0.28 - Math.abs(o.sailBase[i * 3 + 1])) * 0.12;
      sp.needsUpdate = true;
      const fp = o.flag.geometry.attributes.position;
      for (let i = 0; i < fp.count; i++) fp.array[i * 3 + 2] = o.flagBase[i * 3 + 2] + Math.sin(o.flagBase[i * 3] * 25 + S.clock * 9) * 0.015 * (o.flagBase[i * 3] + 0.1) * 5;
      fp.needsUpdate = true;
      o.wheel.rotation.z = Math.sin(S.clock * 0.7) * 0.6;
      // el barco se mece con las olas (solo la cámara lo nota: movemos la escena entera)
      S.scene.rotation.z = Math.sin(S.clock * 0.8) * 0.012;
      S.scene.rotation.x = Math.sin(S.clock * 0.6 + 1) * 0.01;
      o.zone.material.opacity = t > 11 ? 0.12 + 0.06 * Math.sin(t * 6) : 0;
      const list = W.armsAt(t);
      o.arms.forEach((A, i) => {
        const arm = list[i];
        A.grp.visible = !!arm && arm.L > 0.05;
        if (!A.grp.visible) return;
        const pts = armPoints(arm, t, o.segs);
        A.balls.forEach((b, k) => {
          const p = pts[k];
          b.material = arm.long ? o.mats.matLong : o.mats.matShort;
          const r = p.w * 1.05;
          b.scale.setScalar(r);
          const arch = Math.pow(1 - p.f, 3) * 0.16;
          // fuera del barco, el tentáculo baja hacia el agua
          const outside = Math.max(0, Math.abs(p.x) - halfWidth(p.y));
          b.position.set(p.x, r * 0.7 + arch + Math.sin(t * 8 + k) * 0.004 - outside * 1.5, p.y);
        });
      });
    },
  },

  draw(g, v0, t, W, ents, meId) {
    // 2D: se encoge para que quepa todo el barco
    const k = 0.68;
    const v = { ...v0, R: v0.R * k, X: (x) => v0.c + x * v0.R * k, Y: (y) => v0.c + y * v0.R * k };
    const { size } = v0;
    g.fillStyle = '#0b5d8a'; g.fillRect(0, 0, size, size);
    g.beginPath();
    for (let i = 0; i <= 40; i++) { const z = BOW + ((STERN - BOW) * i) / 40; g.lineTo(v.X(halfWidth(z)), v.Y(z)); }
    for (let i = 40; i >= 0; i--) { const z = BOW + ((STERN - BOW) * i) / 40; g.lineTo(v.X(-halfWidth(z)), v.Y(z)); }
    g.closePath();
    g.fillStyle = '#c98b4f'; g.fill();
    g.lineWidth = 6; g.strokeStyle = '#5a2e12'; g.stroke();
    if (t > 11) { g.beginPath(); g.arc(v.X(0), v.Y(0), SHORT * v.R, 0, TAU); g.fillStyle = 'rgba(255,77,109,0.12)'; g.fill(); }
    g.beginPath(); g.arc(v.X(0), v.Y(0), HOLE * v.R, 0, TAU); g.fillStyle = '#000'; g.fill();
    for (const arm of W.armsAt(t)) {
      if (arm.L < 0.05) continue;
      for (const p of armPoints(arm, t, 20).reverse()) {
        g.beginPath(); g.arc(v.X(p.x), v.Y(p.y), p.w * v.R, 0, TAU);
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
  desc: '¡El kraken atacó el barco! Muévete con el joystick y SALTA los tentáculos morados. Los rosados solo llegan cerca del centro: aléjate. Tienes 3 vidas.',
  dur: () => TOTAL * 1000,
  mount: (el, ctx) => mountRT(el, ctx, G),
  evaluate: (v) => evalSurvival(v, TOTAL, LIVES),
  bot: (r, seed, p) => simulateBot(G, seed, Number(String(p?.id || 'bot0').slice(3)) || 0),
};
