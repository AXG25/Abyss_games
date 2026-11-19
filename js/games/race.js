// Gran Premio Abyss — carrera de karts en 3D con cámara isométrica.
// 3 vueltas a un circuito que cambia en cada partida. Apunta el joystick hacia
// donde quieres ir; TURBO da un acelerón (se recarga). Las flechas del piso
// impulsan, las manchas de aceite te hacen girar y el pasto te frena.
import { mulberry32 } from '../util.js';
import { DT, TAU, mountRT, simulateBot, drawPlayer } from '../rt.js';

const LAPS = 3;
const TOTAL = 80;
const N = 480;          // puntos del trazado
const HW = 0.22;        // medio ancho del asfalto
const LIM = HW + 0.17;  // muro de llantas
const KR = 0.075;       // radio de choque de un kart
const VMAX = 1.45;
const TURN = 3.6;
const TURBO_CD = 4.5;
const PR = 0.06;
const CAM_YAW = 45;
let ME = null;

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------------------------------------------------------------- circuito
function buildTrack(seed) {
  const r = mulberry32(seed ^ 0x7ace);
  const a1 = 0.12 + r() * 0.13, a2 = 0.05 + r() * 0.09, a3 = r() * 0.04;
  const p1 = r() * TAU, p2 = r() * TAU, p3 = r() * TAU;
  const sx = 1.2 + r() * 0.3, R0 = 2.1;
  const xs = new Float32Array(N), ys = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const th = (i / N) * TAU;
    const rr = R0 * (1 + a1 * Math.sin(2 * th + p1) + a2 * Math.sin(3 * th + p2) + a3 * Math.sin(5 * th + p3));
    xs[i] = Math.cos(th) * rr * sx;
    ys[i] = Math.sin(th) * rr;
  }
  const seg = new Float32Array(N), cum = new Float32Array(N + 1);
  const tx = new Float32Array(N), ty = new Float32Array(N), nx = new Float32Array(N), ny = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    seg[i] = Math.hypot(xs[j] - xs[i], ys[j] - ys[i]);
    cum[i + 1] = cum[i] + seg[i];
    const a = (i + N - 1) % N;
    const dx = xs[j] - xs[a], dy = ys[j] - ys[a], l = Math.hypot(dx, dy) || 1;
    tx[i] = dx / l; ty[i] = dy / l;
    nx[i] = -ty[i]; ny[i] = tx[i];
  }
  const L = cum[N];
  // ¿la normal "izquierda" apunta hacia adentro del circuito?
  const inSign = nx[0] * -xs[0] + ny[0] * -ys[0] > 0 ? 1 : -1;
  let ext = 0, rmax = 0;
  for (let i = 0; i < N; i++) { ext = Math.max(ext, Math.abs(xs[i]), Math.abs(ys[i])); rmax = Math.max(rmax, Math.hypot(xs[i], ys[i])); }
  return { xs, ys, seg, cum, tx, ty, nx, ny, L, inSign, ext: ext + LIM, rmax: rmax + LIM };
}

// punto del trazado a distancia s (con desplazamiento lateral d)
function pointAt(T, s, d = 0) {
  s = ((s % T.L) + T.L) % T.L;
  let lo = 0, hi = N;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T.cum[m] <= s) lo = m; else hi = m; }
  const i = lo, j = (i + 1) % N, f = (s - T.cum[i]) / (T.seg[i] || 1);
  const nxv = T.nx[i] + (T.nx[j] - T.nx[i]) * f, nyv = T.ny[i] + (T.ny[j] - T.ny[i]) * f;
  return {
    x: T.xs[i] + (T.xs[j] - T.xs[i]) * f + nxv * d,
    y: T.ys[i] + (T.ys[j] - T.ys[i]) * f + nyv * d,
    ang: Math.atan2(T.ty[i], T.tx[i]), nx: nxv, ny: nyv, i,
  };
}

// proyección sobre el trazado buscando cerca del último índice conocido
function query(T, x, y, ci) {
  let best = 1e9, bj = ci, bf = 0;
  for (let k = -14; k <= 14; k++) {
    const i = (ci + k + N) % N, j = (i + 1) % N;
    const ex = T.xs[j] - T.xs[i], ey = T.ys[j] - T.ys[i];
    const l2 = ex * ex + ey * ey || 1;
    const f = Math.max(0, Math.min(1, ((x - T.xs[i]) * ex + (y - T.ys[i]) * ey) / l2));
    const px = T.xs[i] + ex * f, py = T.ys[i] + ey * f;
    const dd = (x - px) ** 2 + (y - py) ** 2;
    if (dd < best) { best = dd; bj = i; bf = f; }
  }
  const i = bj, j = (i + 1) % N;
  const px = T.xs[i] + (T.xs[j] - T.xs[i]) * bf, py = T.ys[i] + (T.ys[j] - T.ys[i]) * bf;
  const nxv = T.nx[i], nyv = T.ny[i];
  return { j: i, s: T.cum[i] + T.seg[i] * bf, d: (x - px) * nxv + (y - py) * nyv, nx: nxv, ny: nyv };
}

// distancia a lo largo del circuito entre a y b (con vuelta)
const sDiff = (T, a, b) => { let d = a - b; if (d > T.L / 2) d -= T.L; if (d < -T.L / 2) d += T.L; return d; };

const finOf = (e) => (e.fin ?? (e.e && e.e.fin) ?? null);
const progOf = (e) => (typeof e.prog === 'number' ? e.prog : e.e && typeof e.e.pg === 'number' ? e.e.pg : -99);
function ranking(ents) {
  return [...ents].sort((a, b) => {
    const fa = finOf(a), fb = finOf(b);
    if (fa != null || fb != null) return fa == null ? 1 : fb == null ? -1 : fa - fb;
    return progOf(b) - progOf(a);
  });
}

const G = {
  TOTAL, LIVES: 0, lives: 0,
  action: 'TURBO',
  actionIcon: 'bolt',
  inputYaw: (CAM_YAW * Math.PI) / 180,
  cd1: (p) => (p.dcd > 0 ? p.dcd / TURBO_CD : 0),

  world(seed) {
    const T = buildTrack(seed);
    const r = mulberry32(seed ^ 0xb00c);
    const pads = [], oils = [];
    const free = (s, list) => list.every((o) => Math.abs(sDiff(T, s, o.s)) > 1.2);
    for (let k = 0; k < 40 && pads.length < 5; k++) {
      const s = 1.5 + r() * (T.L - 3);
      if (free(s, pads)) pads.push({ id: pads.length, s, d: (r() * 2 - 1) * 0.1 });
    }
    for (let k = 0; k < 40 && oils.length < 5; k++) {
      const s = 2 + r() * (T.L - 3.5);
      if (free(s, oils) && free(s, pads)) oils.push({ id: oils.length, s, d: (r() < 0.5 ? -1 : 1) * (0.05 + r() * 0.09) });
    }
    for (const o of [...pads, ...oils]) { const q = pointAt(T, o.s, o.d); o.x = q.x; o.y = q.y; o.ang = q.ang; }
    return { T, pads, oils };
  },

  spawn(i, W) {
    const T = W.T;
    const row = Math.floor(i / 2), lane = i % 2 ? -0.1 : 0.1;
    const s = T.L - 0.35 - row * 0.32 - (i % 2) * 0.12;
    const q = pointAt(T, s, lane);
    return {
      x: q.x, y: q.y, z: 0, h: 0, inv: 0, out: false, act: false, dash: 0, dcd: 0,
      ang: q.ang, v: 0, spin: 0, ci: q.i, ls: s, prog: s - T.L, fin: null, wallT: 0, padT: -9, padId: -1, oilT: -9,
    };
  },

  step(p, inp, t, W, ext) {
    const T = W.T;
    let ev = null;
    if (p.dcd > 0) p.dcd -= DT;
    if (p.dash > 0) p.dash -= DT;
    if (p.inv > 0) p.inv -= DT;
    const done = p.fin != null;
    if (p.act && p.dcd <= 0 && !done && p.spin <= 0) { p.dash = 1.1; p.dcd = TURBO_CD; ev = 'act'; }
    p.act = false;
    let q = query(T, p.x, p.y, p.ci);
    const off = Math.abs(q.d) > HW;
    let throttle = 0;
    if (p.spin > 0) {
      p.spin -= DT;
      p.ang += 11 * DT;
      p.v *= 1 - 2.2 * DT;
    } else if (!done) {
      const m = Math.min(1, Math.hypot(inp.x, inp.y));
      if (m > 0.25) {
        const d = wrap(Math.atan2(inp.y, inp.x) - p.ang);
        const turn = TURN * DT;
        p.ang += Math.max(-turn, Math.min(turn, d));
        throttle = m * (Math.abs(d) > 1.7 ? 0.35 : 1);
      }
    }
    const vmax = VMAX * (off ? 0.5 : 1) * (p.dash > 0 ? 1.65 : 1);
    if (p.dash > 0 && p.spin <= 0) throttle = Math.max(throttle, done ? 0 : 1);
    const target = vmax * throttle;
    if (target > p.v) p.v += (target - p.v) * Math.min(1, (p.dash > 0 ? 5 : 1.9) * DT);
    else p.v += (target - p.v) * Math.min(1, (off ? 4 : throttle > 0 ? 2.5 : 1.6) * DT);
    p.x += Math.cos(p.ang) * p.v * DT;
    p.y += Math.sin(p.ang) * p.v * DT;
    // choques con los demás karts
    for (const o of ext.all || []) {
      if (o === p || o.id === p.id) continue;
      const dx = p.x - o.x, dy = p.y - o.y, dd = Math.hypot(dx, dy);
      if (dd < KR * 2 && dd > 1e-5) {
        const push = (KR * 2 - dd) * 0.6;
        p.x += (dx / dd) * push;
        p.y += (dy / dd) * push;
        p.v *= 0.985;
      }
    }
    // muro de llantas
    q = query(T, p.x, p.y, q.j);
    const lim = LIM - KR;
    if (Math.abs(q.d) > lim) {
      const over = Math.abs(q.d) - lim, sg = Math.sign(q.d);
      p.x -= q.nx * over * sg;
      p.y -= q.ny * over * sg;
      // rebote: quita la velocidad hacia el muro
      const into = (Math.cos(p.ang) * q.nx + Math.sin(p.ang) * q.ny) * sg;
      if (into > 0.2) {
        if (p.v > 0.6 && t - p.wallT > 0.5) { p.wallT = t; ev = ev || 'wall'; }
        p.v *= 1 - into * 0.5;
        // girar hacia la pista
        const ta = Math.atan2(T.ty[q.j], T.tx[q.j]);
        const fw = Math.cos(wrap(p.ang - ta)) >= 0 ? ta : ta + Math.PI;
        p.ang += wrap(fw - p.ang) * 0.15;
      }
    }
    // flechas de impulso
    for (const pd of W.pads) {
      if (Math.abs(sDiff(T, q.s, pd.s)) < 0.12 && Math.abs(q.d - pd.d) < 0.11 && (p.padId !== pd.id || t - p.padT > 1.5)) {
        p.padId = pd.id; p.padT = t;
        p.dash = Math.max(p.dash, 0.9);
        ev = ev || 'pad';
      }
    }
    // aceite
    if (p.spin <= 0 && t - p.oilT > 1.5) {
      for (const o of W.oils) {
        if (Math.abs(sDiff(T, q.s, o.s)) < 0.085 && Math.abs(q.d - o.d) < 0.085) {
          p.oilT = t; p.spin = 0.85; p.v *= 0.55; p.inv = 0.5; p.dash = 0;
          ev = 'hit';
        }
      }
    }
    // progreso y vueltas
    p.prog += sDiff(T, q.s, p.ls);
    p.ls = q.s;
    p.ci = q.j;
    if (!done && p.prog >= LAPS * T.L) { p.fin = Math.round(t * 1000) / 1000; ev = 'fin'; }
    return ev;
  },

  brain(seed, idx, W) {
    const T = W.T;
    const r = mulberry32((seed ^ (0x51ed * (idx + 7))) >>> 0);
    const skill = 0.8 + r() * 0.13;
    const look = 0.42 + r() * 0.18;
    let lane = (r() * 2 - 1) * 0.1, laneT = 0;
    return (p, t) => {
      if (t > laneT) { lane = (r() * 2 - 1) * 0.12; laneT = t + 1.5 + r() * 2.5; }
      // esquivar aceite que viene
      for (const o of W.oils) {
        const ahead = sDiff(T, o.s, p.ls);
        if (ahead > 0 && ahead < 1.1 && Math.abs(lane - o.d) < 0.12 && r() < 0.85) lane = Math.max(-0.16, Math.min(0.16, o.d + (o.d > 0 ? -0.18 : 0.18)));
      }
      const tg = pointAt(T, p.ls + look, lane);
      const dx = tg.x - p.x, dy = tg.y - p.y, l = Math.hypot(dx, dy) || 1;
      // turbo en rectas
      if (p.dcd <= 0 && t > 1) {
        const far = pointAt(T, p.ls + 1.2);
        const bend = Math.abs(wrap(far.ang - pointAt(T, p.ls).ang));
        if (bend < 0.35 && r() < 0.03) p.act = true;
      }
      return { x: (dx / l) * skill, y: (dy / l) * skill };
    };
  },

  over(all, t) {
    if (!all.length) return false;
    const fins = all.map(finOf);
    if (fins.every((f) => f != null)) return true;
    const first = Math.min(...fins.filter((f) => f != null));
    return Number.isFinite(first) && t > first + 12;
  },

  result: (p) => ({ fin: p.fin, pg: Math.round(p.prog * 1000) / 1000 }),
  pack: (p) => ({ a: Math.round(p.ang * 100) / 100, pg: Math.round(p.prog * 100) / 100, fin: p.fin, s: p.spin > 0 ? 1 : 0 }),
  hud(p) {
    if (p.fin != null) return `{flag} ${p.fin.toFixed(1)} s`;
    return `{flag} Vuelta ${Math.max(1, Math.min(LAPS, Math.floor(p.prog / G._L) + 1))}/${LAPS}`;
  },
  hudRight(ents) {
    const rk = ranking(ents);
    const i = rk.findIndex((e) => e.id === ME);
    return i < 0 ? '' : `{trophy} ${i + 1}º de ${rk.length}`;
  },
  endText: (p) => (p.fin != null ? '{flag} ¡Carrera terminada!' : '{timer} ¡Se acabó el tiempo!'),

  music: 'race',
  events(t0, t1, W, ext, ents, fx) {
    const me = fx.me;
    const st = fx.st;
    if (st.lap === undefined) { st.lap = 1; st.pad = me.padT; st.fin = false; st.wall = me.wallT; }
    const lap = Math.max(1, Math.min(LAPS, Math.floor(me.prog / W.T.L) + 1));
    if (lap > st.lap && me.fin == null) {
      st.lap = lap;
      if (lap === LAPS) { fx.msg('{flag} ¡ÚLTIMA VUELTA!', 1600); fx.say('¡Última vuelta!'); fx.sfx.bell(); }
      else { fx.msg(`{flag} Vuelta ${lap}/${LAPS}`, 1200); fx.sfx.bell(); }
    }
    if (me.padT !== st.pad) { st.pad = me.padT; fx.sfx.launch(); fx.burst(me.x, 0.08, me.y, { n: 18, color: ['#ffd60a', '#ff9f1c', '#ffffff'], speed: 0.5, up: 0.6, size: 0.04, life: 0.5, gravity: 1 }); }
    if (me.wallT !== st.wall) { st.wall = me.wallT; fx.sfx.thud(); fx.shake(0.03); }
    if (me.fin != null && !st.fin) {
      st.fin = true;
      const place = ranking(ents).findIndex((e) => e.id === ME) + 1;
      fx.msg(`{trophy} ¡Llegaste ${place}º!`, 0);
      fx.sfx.win();
      if (place === 1) fx.say('¡Primer lugar!');
      fx.burst(me.x, 0.3, me.y, { n: 70, color: ['#ffd60a', '#ff4d6d', '#3a86ff', '#06d6a0', '#ffffff'], speed: 1, up: 2, size: 0.05, life: 1.6, gravity: 2.5 });
    }
    // otro cruzó la meta
    for (const e of ents) {
      const f = finOf(e);
      if (e.id !== ME && f != null && !(st.done || (st.done = new Set())).has(e.id)) { st.done.add(e.id); fx.sfx.whistle(0.5); }
    }
    for (let k = 1; k <= 5; k++) { const tt = TOTAL - k; if (tt > t0 && tt <= t1) fx.sfx.count(); }
  },

  PR,
  scene3d: {
    sky: '#8ecae6',
    hemiGround: '#386641',
    follow: true,
    camYaw: CAM_YAW,
    camElev: 50,
    camFit: 0.82,
    camFitZ: 0.78,
    lookAhead(e) {
      const a = typeof e.ang === 'number' ? e.ang : (e.e && e.e.a) || 0;
      return { x: Math.cos(a) * 0.28, y: Math.sin(a) * 0.28 };
    },
    trailColor: ['#ffd60a', '#ff9f1c', '#ffffff'],
    setup(S, W) { buildScene(S, W); },
    update(S, t, W, ext, ents) {
      const o = S.objs;
      for (const m of o.padMeshes) m.material.emissiveIntensity = 0.6 + Math.sin(t * 8 + m.userData.k) * 0.4;
      for (const f of o.fans) f.position.y = f.userData.y0 + Math.max(0, Math.sin(t * 9 + f.userData.ph)) * 0.025;
      o.rank = new Map(ranking(ents).map((e, i) => [e.id, i + 1]));
      drawMini(o.mini, W, ents);
    },
    tag: (e) => null,
    makeAvatar: (S, e, U) => makeKart(S, e, U),
  },

  // vista 2D (si el celular no tiene 3D): todo el circuito a escala
  draw(g, v, t, W, ents, meId) {
    const T = W.T;
    const sc = (v.size * 0.48) / T.ext, c = v.size / 2;
    const X = (x) => c + x * sc, Y = (y) => c + y * sc;
    g.fillStyle = '#6a994e';
    g.fillRect(0, 0, v.size, v.size);
    const path = () => { g.beginPath(); for (let i = 0; i <= N; i++) { const k = i % N; if (i) g.lineTo(X(T.xs[k]), Y(T.ys[k])); else g.moveTo(X(T.xs[k]), Y(T.ys[k])); } };
    g.lineJoin = 'round';
    path(); g.strokeStyle = '#e63946'; g.lineWidth = LIM * 2 * sc; g.stroke();
    path(); g.strokeStyle = '#6a994e'; g.lineWidth = (LIM * 2 - 0.03) * sc; g.stroke();
    path(); g.strokeStyle = '#ffffff'; g.lineWidth = (HW * 2 + 0.06) * sc; g.stroke();
    path(); g.strokeStyle = '#5c5f66'; g.lineWidth = HW * 2 * sc; g.stroke();
    const st = pointAt(T, 0);
    g.strokeStyle = '#fff'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(X(st.x + st.nx * HW), Y(st.y + st.ny * HW)); g.lineTo(X(st.x - st.nx * HW), Y(st.y - st.ny * HW)); g.stroke();
    for (const pd of W.pads) { g.fillStyle = '#ffd60a'; g.beginPath(); g.arc(X(pd.x), Y(pd.y), 0.07 * sc, 0, TAU); g.fill(); }
    for (const o of W.oils) { g.fillStyle = '#111'; g.beginPath(); g.arc(X(o.x), Y(o.y), 0.075 * sc, 0, TAU); g.fill(); }
    const v2 = { ...v, R: sc, X, Y };
    for (const e of ents) drawPlayer(g, v2, { ...e, pr: KR * 1.2 }, meId, t);
  },
};

// ---------------------------------------------------------------- 3D
function canvasTex(THREE, w, h, paint, rep) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (rep) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; }
  return tex;
}

// cinta a lo largo del circuito entre los desplazamientos d0 y d1 (o pared vertical)
function ribbon(THREE, T, d0, d1, y0, y1, vLen, wall = false) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const k = i % N;
    const ax = T.xs[k] + T.nx[k] * d0, az = T.ys[k] + T.ny[k] * d0;
    const bx = T.xs[k] + T.nx[k] * d1, bz = T.ys[k] + T.ny[k] * d1;
    if (wall) pos.push(ax, y0, az, ax, y1, az);
    else pos.push(ax, y0, az, bx, y1, bz);
    const v = (i === N ? T.L : T.cum[k]) / vLen;
    uv.push(0, v, 1, v);
    if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildScene(S, W) {
  const { THREE, scene } = S;
  const T = W.T;
  scene.fog = new THREE.Fog('#8ecae6', 3.2, 7.5);
  // pasto con franjas de podadora
  const grassTex = canvasTex(THREE, 128, 128, (g) => {
    g.fillStyle = '#6a994e'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#73a557'; g.fillRect(0, 0, 128, 64);
    for (let i = 0; i < 260; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'; g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
  }, true);
  grassTex.repeat.set(14, 14);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  // asfalto con línea central
  const roadTex = canvasTex(THREE, 128, 128, (g) => {
    g.fillStyle = '#5a5d66'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 500; i++) { const v = 70 + Math.random() * 40; g.fillStyle = `rgb(${v},${v},${v + 6})`; g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
    g.fillStyle = '#f1f1f1'; g.fillRect(61, 0, 6, 64);
  }, true);
  const road = new THREE.Mesh(ribbon(THREE, T, HW, -HW, 0.004, 0.004, 0.55), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.85 }));
  road.receiveShadow = true;
  scene.add(road);
  // bordillos rojo y blanco
  const curbTex = canvasTex(THREE, 8, 64, (g) => { g.fillStyle = '#e63946'; g.fillRect(0, 0, 8, 32); g.fillStyle = '#ffffff'; g.fillRect(0, 32, 8, 32); }, true);
  const curbMat = new THREE.MeshStandardMaterial({ map: curbTex, roughness: 0.7 });
  for (const sg of [1, -1]) {
    const m = new THREE.Mesh(ribbon(THREE, T, sg * HW, sg * (HW + 0.05), 0.008, 0.008, 0.22), curbMat);
    m.receiveShadow = true;
    scene.add(m);
  }
  // muro de llantas
  const wallTex = canvasTex(THREE, 8, 64, (g) => { g.fillStyle = '#d62828'; g.fillRect(0, 0, 8, 32); g.fillStyle = '#f8f9fa'; g.fillRect(0, 32, 8, 32); }, true);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.6, side: THREE.DoubleSide });
  for (const sg of [1, -1]) {
    const m = new THREE.Mesh(ribbon(THREE, T, sg * LIM, sg * LIM, 0, 0.07, 0.3, true), wallMat);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    const cap = new THREE.Mesh(ribbon(THREE, T, sg * (LIM - 0.012), sg * (LIM + 0.012), 0.07, 0.07, 0.3), new THREE.MeshStandardMaterial({ color: '#2b2d42', roughness: 0.8 }));
    scene.add(cap);
  }
  // meta: cuadros + arco con letrero
  const st = pointAt(T, 0);
  const yaw = Math.atan2(st.nx, st.ny); // el eje X local apunta a lo ancho
  const checker = canvasTex(THREE, 128, 32, (g) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#fff'; g.fillRect(i * 8, j * 8, 8, 8); } });
  const line = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, 0.08), new THREE.MeshStandardMaterial({ map: checker, roughness: 0.6 }));
  line.rotation.x = -Math.PI / 2;
  const lineG = new THREE.Group();
  lineG.add(line);
  lineG.position.set(st.x, 0.009, st.y);
  lineG.rotation.y = yaw - Math.PI / 2;
  scene.add(lineG);
  const arch = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: '#2b2d42', metalness: 0.4, roughness: 0.4 });
  for (const sg of [1, -1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.5, 10), postMat);
    post.position.set(sg * (HW + 0.07), 0.25, 0);
    post.castShadow = true;
    arch.add(post);
  }
  const signTex = canvasTex(THREE, 512, 96, (g) => {
    for (let i = 0; i < 64; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#fff'; g.fillRect(i * 8, j * 8 + (j ? 80 : 0) - (j ? 8 : 0), 8, 8); }
    g.fillStyle = '#7b2cbf'; g.fillRect(0, 16, 512, 64);
    g.font = '900 52px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffd60a'; g.fillText('ABYSS GRAN PREMIO', 256, 50);
  });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(HW * 2 + 0.2, 0.09, 0.025), [postMat, postMat, postMat, postMat, new THREE.MeshStandardMaterial({ map: signTex, emissive: '#ffffff', emissiveIntensity: 0.15, emissiveMap: signTex }), new THREE.MeshStandardMaterial({ map: signTex })]);
  sign.position.y = 0.48;
  sign.castShadow = true;
  arch.add(sign);
  arch.position.set(st.x, 0, st.y);
  arch.rotation.y = yaw - Math.PI / 2;
  scene.add(arch);
  // tribuna con público junto a la meta (por fuera)
  // del lado contrario a la cámara, para que no tape la pista
  const n0 = pointAt(T, 0.1);
  const cy = (CAM_YAW * Math.PI) / 180;
  const out = n0.nx * Math.sin(cy) + n0.ny * Math.cos(cy) > 0 ? -1 : 1;
  const gs = pointAt(T, 0.1, out * (LIM + 0.4));
  const stand = new THREE.Group();
  const bleach = new THREE.MeshStandardMaterial({ color: '#adb5bd', roughness: 0.7 });
  const crowdCols = ['#ff4d6d', '#ffd60a', '#3a86ff', '#06d6a0', '#ffffff', '#f77f00', '#c77dff'];
  const rr = mulberry32(W.T.L * 1000 | 0);
  for (let row = 0; row < 3; row++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06 + row * 0.07, 0.12), bleach);
    step.position.set(0, (0.06 + row * 0.07) / 2, row * 0.12);
    step.castShadow = step.receiveShadow = true;
    stand.add(step);
    for (let k = 0; k < 9; k++) {
      const fan = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshStandardMaterial({ color: crowdCols[Math.floor(rr() * crowdCols.length)] }));
      fan.position.set(-0.4 + k * 0.1 + (rr() - 0.5) * 0.02, 0.09 + row * 0.07, row * 0.12);
      fan.userData.ph = rr() * TAU;
      fan.userData.y0 = fan.position.y;
      stand.add(fan);
    }
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.02, 0.45), new THREE.MeshStandardMaterial({ color: '#e63946' }));
  roof.position.set(0, 0.42, 0.12);
  roof.castShadow = true;
  stand.add(roof);
  stand.position.set(gs.x, 0, gs.y);
  stand.rotation.y = Math.atan2(gs.nx * out, gs.ny * out);
  scene.add(stand);
  S.objs.fans = stand.children.filter((c) => c.userData.ph !== undefined);
  // árboles y rocas lejos de la pista
  const tr = mulberry32((T.L * 7919) | 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#7f5539', roughness: 0.9 });
  const leafMats = ['#2d6a4f', '#40916c', '#52b788'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true }));
  const rockMat = new THREE.MeshStandardMaterial({ color: '#8d99ae', roughness: 0.9, flatShading: true });
  const far = (x, y, m) => { for (let i = 0; i < N; i += 4) if (Math.hypot(T.xs[i] - x, T.ys[i] - y) < LIM + m) return false; return Math.hypot(x - gs.x, y - gs.y) > 0.7; };
  let placed = 0;
  for (let k = 0; k < 400 && placed < 90; k++) {
    const x = (tr() * 2 - 1) * (T.ext + 1.6), y = (tr() * 2 - 1) * (T.ext + 1.2);
    if (!far(x, y, 0.16)) continue;
    placed++;
    if (tr() < 0.2) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.05 + tr() * 0.05, 0), rockMat);
      rock.position.set(x, 0.03, y);
      rock.rotation.set(tr() * 3, tr() * 3, 0);
      rock.castShadow = true;
      scene.add(rock);
      continue;
    }
    const s = 0.7 + tr() * 0.6;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.12, 6), trunkMat);
    trunk.position.y = 0.06;
    tree.add(trunk);
    const lm = leafMats[Math.floor(tr() * 3)];
    for (let j = 0; j < 2; j++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.11 - j * 0.03, 0.18, 7), lm);
      cone.position.y = 0.17 + j * 0.1;
      cone.castShadow = true;
      tree.add(cone);
    }
    tree.scale.setScalar(s);
    tree.position.set(x, 0, y);
    tree.rotation.y = tr() * TAU;
    scene.add(tree);
  }
  // flechas de impulso
  const padTex = canvasTex(THREE, 64, 96, (g) => {
    g.fillStyle = '#ff7b00'; g.fillRect(0, 0, 64, 96);
    g.strokeStyle = '#ffd60a'; g.lineWidth = 11; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const y of [22, 52, 82]) { g.beginPath(); g.moveTo(12, y); g.lineTo(32, y - 16); g.lineTo(52, y); g.stroke(); }
  });
  S.objs.padMeshes = W.pads.map((pd, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.22), new THREE.MeshStandardMaterial({ map: padTex, emissive: '#ffb703', emissiveMap: padTex, emissiveIntensity: 1 }));
    m.rotation.x = -Math.PI / 2;
    const g = new THREE.Group();
    g.add(m);
    g.position.set(pd.x, 0.01, pd.y);
    // la textura apunta hacia -Y del plano → girarla hacia la dirección de la pista
    g.rotation.y = -pd.ang - Math.PI / 2;
    scene.add(g);
    m.userData.k = k;
    return m;
  });
  // manchas de aceite
  const oilMat = new THREE.MeshStandardMaterial({ color: '#111118', roughness: 0.05, metalness: 0.6 });
  for (const o of W.oils) {
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const blob = new THREE.Mesh(new THREE.CircleGeometry(0.045 + (k ? 0.02 : 0.03), 18), oilMat);
      blob.rotation.x = -Math.PI / 2;
      const a = k * 2.1;
      blob.position.set(k ? Math.cos(a) * 0.04 : 0, 0.009 + k * 0.0004, k ? Math.sin(a) * 0.04 : 0);
      g.add(blob);
    }
    g.position.set(o.x, 0, o.y);
    scene.add(g);
  }
  // minimapa
  const mini = document.createElement('canvas');
  mini.className = 'race-mini';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  mini.width = mini.height = 108 * dpr;
  S.board.appendChild(mini);
  const bg = document.createElement('canvas');
  bg.width = bg.height = mini.width;
  const g = bg.getContext('2d');
  const sc = (mini.width * 0.46) / T.rmax, c = mini.width / 2;
  g.lineJoin = 'round';
  g.beginPath();
  for (let i = 0; i <= N; i++) { const k = i % N; const X = c + T.xs[k] * sc, Y = c + T.ys[k] * sc; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 8 * dpr; g.stroke();
  g.strokeStyle = '#5a5d66'; g.lineWidth = 5 * dpr; g.stroke();
  g.strokeStyle = '#fff'; g.lineWidth = 2 * dpr;
  g.beginPath(); g.moveTo(c + (st.x + st.nx * 0.3) * sc, c + (st.y + st.ny * 0.3) * sc); g.lineTo(c + (st.x - st.nx * 0.3) * sc, c + (st.y - st.ny * 0.3) * sc); g.stroke();
  // el minimapa gira igual que la cámara isométrica
  S.objs.mini = { el: mini, g: mini.getContext('2d'), bg, sc, c, dpr };
  S.objs.miniRot = (CAM_YAW * Math.PI) / 180;
}

function drawMini(m, W, ents) {
  if (!m) return;
  const { g, bg, sc, c, dpr, el } = m;
  g.clearRect(0, 0, el.width, el.height);
  g.save();
  g.translate(c, c);
  g.rotate((CAM_YAW * Math.PI) / 180);
  g.translate(-c, -c);
  g.drawImage(bg, 0, 0);
  const sorted = [...ents].sort((a, b) => (a.id === ME) - (b.id === ME));
  for (const e of sorted) {
    const mine = e.id === ME;
    g.beginPath();
    g.arc(c + e.x * sc, c + e.y * sc, (mine ? 5 : 4) * dpr, 0, TAU);
    g.fillStyle = e.c || '#fff';
    g.fill();
    g.lineWidth = (mine ? 2.5 : 1.5) * dpr;
    g.strokeStyle = mine ? '#fff' : '#1b1035';
    g.stroke();
  }
  g.restore();
}

// kart con el personaje manejando
function makeKart(S, e, U) {
  const { THREE } = S;
  const color = new THREE.Color(e.c || '#ffffff');
  const mBody = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.25 });
  const mDark = new THREE.MeshStandardMaterial({ color: '#2b2d42', roughness: 0.5 });
  const mLight = new THREE.MeshStandardMaterial({ color: color.clone().lerp(new THREE.Color('#ffffff'), 0.5), roughness: 0.5 });
  const mTire = new THREE.MeshStandardMaterial({ color: '#1b1b1f', roughness: 0.9 });
  const mRim = new THREE.MeshStandardMaterial({ color: '#d9dde3', metalness: 0.7, roughness: 0.3 });
  const cast = (m) => { m.castShadow = true; return m; };
  const root = new THREE.Group();
  const kart = new THREE.Group();
  root.add(kart);
  const box = (w, h, d, mat, x, y, z) => { const m = cast(new THREE.Mesh(new THREE.BoxGeometry(w * U, h * U, d * U), mat)); m.position.set(x * U, y * U, z * U); kart.add(m); return m; };
  box(1.5, 0.32, 2.1, mBody, 0, 0.42, 0);          // chasis
  box(1.0, 0.3, 0.7, mBody, 0, 0.5, 1.1);          // trompa
  box(1.7, 0.16, 0.22, mDark, 0, 0.3, 1.5);        // parachoques
  box(0.9, 0.12, 0.5, mLight, 0, 0.66, 1.05);      // franja
  box(0.8, 0.6, 0.18, mDark, 0, 0.82, -0.6);       // respaldo
  box(0.12, 0.45, 0.12, mDark, -0.55, 0.85, -0.95);
  box(0.12, 0.45, 0.12, mDark, 0.55, 0.85, -0.95);
  box(1.7, 0.1, 0.42, mBody, 0, 1.1, -1.0);        // alerón
  box(0.5, 0.2, 0.25, mDark, 0, 0.45, -1.15);      // motor
  // volante
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.22 * U, 0.05 * U, 6, 16), mDark);
  wheel.position.set(0, 0.95 * U, 0.42 * U);
  wheel.rotation.x = -0.9;
  kart.add(wheel);
  // ruedas
  const wheels = [];
  for (const [x, z, r] of [[-0.86, 0.75, 0.3], [0.86, 0.75, 0.3], [-0.9, -0.7, 0.38], [0.9, -0.7, 0.38]]) {
    const w = new THREE.Group();
    const tire = cast(new THREE.Mesh(new THREE.CylinderGeometry(r * U, r * U, 0.32 * U, 14), mTire));
    tire.rotation.z = Math.PI / 2;
    w.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5 * U, r * 0.5 * U, 0.34 * U, 8), mRim);
    rim.rotation.z = Math.PI / 2;
    w.add(rim);
    w.position.set(x * U, r * U, z * U);
    kart.add(w);
    wheels.push(w);
  }
  // piloto: cuerpo y cabeza 3D del personaje
  const torso = cast(new THREE.Mesh(new THREE.SphereGeometry(0.42 * U, 14, 10), mLight));
  torso.position.set(0, 0.95 * U, -0.2 * U);
  torso.scale.set(1, 1.1, 0.85);
  kart.add(torso);
  const headObj = S.makeHead(e.a || 'frog', 0.6 * U);
  const headY = 1.75 * U;
  headObj.group.position.set(0, headY, -0.15 * U);
  kart.add(headObj.group);
  // fuego del turbo
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16 * U, 0.7 * U, 10), new THREE.MeshBasicMaterial({ color: '#ffb703', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  flame.rotation.x = -Math.PI / 2;
  flame.position.set(0, 0.45 * U, -1.6 * U);
  flame.visible = false;
  kart.add(flame);
  const flame2 = new THREE.Mesh(new THREE.ConeGeometry(0.09 * U, 0.45 * U, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  flame2.rotation.x = -Math.PI / 2;
  flame2.position.set(0, 0.45 * U, -1.45 * U);
  kart.add(flame2);
  return {
    root, rig: kart, headObj, ghostM: null, headY, height: headY + 0.8 * U, U, legs: [], arms: [],
    update(en, dt, t, a, s) {
      const ang = typeof en.ang === 'number' ? en.ang : (en.e && en.e.a) || 0;
      const target = Math.atan2(Math.cos(ang), Math.sin(ang));
      if (a.kyaw === undefined) a.kyaw = target;
      const d = Math.atan2(Math.sin(target - a.kyaw), Math.cos(target - a.kyaw));
      a.kyaw += d * Math.min(1, dt * 18);
      const spinning = en.spin > 0 || (en.e && en.e.s);
      if (spinning) a.ksp = (a.ksp || 0) + dt * 16;
      else if (a.ksp) { const goal = Math.round(a.ksp / TAU) * TAU; a.ksp += (goal - a.ksp) * Math.min(1, dt * 10); if (Math.abs(goal - a.ksp) < 0.01) a.ksp = 0; }
      kart.rotation.y = a.kyaw + (a.ksp || 0);
      // se inclina en las curvas y rebota un poco
      const lean = Math.max(-0.18, Math.min(0.18, -d * 2.2));
      a.klean = (a.klean || 0) + (lean - (a.klean || 0)) * Math.min(1, dt * 8);
      kart.rotation.z = a.klean;
      kart.rotation.x = s.dashing ? -0.06 : 0;
      kart.position.y = Math.abs(Math.sin(t * 28 + a.U * 100)) * 0.004 * Math.min(1, a.spd);
      for (const w of wheels) w.rotation.x += (a.spd * dt) / (0.32 * U);
      wheels[0].rotation.y = wheels[1].rotation.y = Math.max(-0.5, Math.min(0.5, d * 4));
      flame.visible = flame2.visible = !!s.dashing;
      if (s.dashing) { const f = 0.8 + Math.random() * 0.5; flame.scale.set(1, f, 1); flame2.scale.set(1, f, 1); }
      headObj.group.rotation.z = -a.klean * 0.8;
      a.rig.visible = !(s.inv && Math.floor(t * 14) % 2);
    },
  };
}

export default {
  id: 'race',
  name: 'Gran Premio',
  realtime: true,
  desc: 'Carrera de karts a 3 vueltas. Apunta el joystick hacia donde quieres ir y usa TURBO en las rectas. Las flechas naranjas te impulsan, el aceite te hace girar y el pasto te frena.',
  dur: () => TOTAL * 1000,
  mount: (el, ctx) => { ME = ctx.me; G._L = G.world(ctx.seed).T.L; return mountRT(el, ctx, G); },
  evaluate(v) {
    if (!v) return null;
    if (typeof v.fin === 'number' && v.fin > 5 && v.fin <= TOTAL) return { score: 1e6 - Math.round(v.fin * 1000), label: `{flag} ${v.fin.toFixed(1)} s` };
    if (typeof v.pg !== 'number') return null;
    return { score: Math.max(0, Math.min(9e5, Math.round(v.pg * 1000))), label: 'no llegó a la meta' };
  },
  bot: (r, seed, p) => simulateBot(G, seed, Number(String(p?.id || 'bot0').slice(3)) || 0),
};
