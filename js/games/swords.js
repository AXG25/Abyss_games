// Ruleta de espadas — 3D, 3 rondas. En el centro gira una "pizza" con
// porciones de puntos (+2, +4, ×2, ÷2, −3…). Cada jugador está en una esquina
// y tiene 5 espadas por ronda: con un solo botón las lanza al centro y la
// porción donde se clava cambia su puntaje (en orden: ¡no es lo mismo ×2
// antes que +4!). La ruleta acelera durante la ronda. Si tu espada choca
// con otra ya clavada, rebota y se pierde. Gana cada ronda quien termine
// con más puntos; gana el juego quien gane más rondas.
import { mulberry32, buzz } from '../util.js';
import { sfx, say, music, stopMusic } from '../audio.js';
import { rich, icon } from '../icons.js';
import { USE_2D } from '../rt.js';

const TAU = Math.PI * 2;
const SWORDS = 5;
const INTRO = 2400;
const PLAY = 12000;
const REVEAL = 3400;
const FLIGHT = 300;        // ms que tarda la espada en llegar
const COOLDOWN = 330;      // ms entre espada y espada
const COL = 0.17;          // radianes: choque con otra espada
const NS = 8;              // porciones
const SL = TAU / NS;
const WR = 0.6;            // radio de la ruleta
const CORNER = 1.35;
const SLICES = [
  ['+2', '+4', '×2', '÷2', '+3', '+1', '×2', '−2'],
  ['+3', '+5', '×2', '÷2', '+2', '×3', '−3', '+1'],
  ['+5', '×3', '÷2', '+4', '×2', '÷3', '−5', '+2'],
];
const SPEED = [[0.9, 2.4, 1], [1.2, 3.2, -1], [1.5, 4.2, 1]];
const hash = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const cornerAng = (i) => Math.PI / 4 + (i % 4) * (Math.PI / 2); // ángulo (atan2(z, x)) de cada esquina

function plan(seed) {
  const r = mulberry32(seed ^ 0x5e0d);
  let t = 0;
  return SLICES.map((base, k) => {
    const ops = [...base];
    for (let i = ops.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ops[i], ops[j]] = [ops[j], ops[i]]; }
    const [w0, w1, dir] = SPEED[k];
    const R = { k, ops, w0, w1, dir, th0: r() * TAU, start: t };
    R.play = t + INTRO;
    R.end = R.play + PLAY + REVEAL;
    t = R.end;
    return R;
  });
}
// ángulo de la ruleta a los ms de empezar la ronda (acelera)
function wheelAng(R, ms) {
  const s = Math.max(0, ms) / 1000, D = PLAY / 1000;
  const tt = Math.min(s, D);
  let a = R.w0 * tt + ((R.w1 - R.w0) * tt * tt) / (2 * D);
  if (s > D) a += R.w1 * (s - D);
  return R.th0 + R.dir * a;
}
const localAng = (R, ci, ms) => ((cornerAng(ci) - wheelAng(R, ms)) % TAU + TAU) % TAU;
const sliceAt = (R, ci, ms) => Math.floor(localAng(R, ci, ms) / SL) % NS;
function applyOp(v, op) {
  const n = Number(op.slice(1));
  switch (op[0]) {
    case '+': return v + n;
    case '−': return Math.max(0, v - n);
    case '×': return v * n;
    case '÷': return Math.floor(v / n);
    default: return v;
  }
}
const angDist = (a, b) => { const d = Math.abs(a - b) % TAU; return Math.min(d, TAU - d); };
function clean(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const t of list.map(Number).filter((x) => Number.isFinite(x) && x >= 0 && x <= PLAY).sort((a, b) => a - b)) {
    if (out.length >= SWORDS) break;
    if (!out.length || t - out[out.length - 1] >= COOLDOWN - 40) out.push(Math.round(t));
  }
  return out;
}

// simula una ronda con los lanzamientos de todos (en orden de llegada)
function simulate(R, throws) {
  // throws: [{id, ci, t}]
  const hits = [...throws].map((x) => ({ ...x, at: x.t + FLIGHT })).sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
  const stuck = [];
  const per = {};
  for (const h of hits) {
    const L = localAng(R, h.ci, h.at);
    const p = per[h.id] || (per[h.id] = { v: 0, ops: [] });
    if (stuck.some((s) => angDist(s.L, L) < COL)) { h.bounce = true; p.ops.push('✕'); continue; }
    h.L = L;
    h.op = R.ops[Math.floor(L / SL) % NS];
    p.v = applyOp(p.v, h.op);
    p.ops.push(h.op);
    stuck.push(h);
  }
  return { hits, per };
}

function botThrows(seed, id, k, ci, R) {
  const rr = mulberry32((seed ^ hash(id) ^ Math.imul(k + 11, 0x27d4eb2d)) >>> 0);
  const skill = 0.45 + rr() * 0.4;
  let t = 500 + rr() * 900, v = 0;
  const out = [];
  for (let n = 0; n < SWORDS && t < PLAY - 150; n++) {
    let best = t, bv = -1;
    if (rr() < skill) {
      for (let c = t; c < Math.min(PLAY - 100, t + 1600); c += 30) {
        const nv = applyOp(v, R.ops[sliceAt(R, ci, c + FLIGHT)]);
        if (nv > bv) { bv = nv; best = c; }
      }
      best += (rr() - 0.5) * 140; // reflejos imperfectos
    } else best = t + rr() * 900;
    best = Math.max(t, Math.min(PLAY - 100, best));
    out.push(Math.round(best));
    v = applyOp(v, R.ops[sliceAt(R, ci, best + FLIGHT)]);
    t = best + COOLDOWN + 150 + rr() * 700;
  }
  return out;
}

function roundThrows(seed, R, k, pl, vals) {
  const all = [];
  pl.forEach((p, ci) => {
    const ts = p.b ? botThrows(seed, p.id, k, ci, R) : clean(vals[p.id] && Array.isArray(vals[p.id].r) ? vals[p.id].r[k] : null);
    for (const t of ts) all.push({ id: p.id, ci, t });
  });
  return all;
}

export default {
  id: 'swords',
  name: 'Ruleta de espadas',
  uses3d: true,
  desc: 'Lanza tus 5 espadas a la ruleta que gira: cada porción cambia tu puntaje (+2, ×2, ÷2…) en el orden en que las clavas. ¡Ojo! Acelera y si chocas con otra espada, rebota. Gana quien gane más de las 3 rondas.',
  dur: (seed) => plan(seed)[2].end,

  mount(el, ctx) {
    let webgl = false;
    try { const c = document.createElement('canvas'); webgl = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { /* nada */ }
    return run(el, ctx, !USE_2D() && webgl);
  },

  evaluateAll(vals, seed, pl) {
    const P = plan(seed);
    const wins = {}, tot = {}, any = {};
    for (const p of pl) { wins[p.id] = 0; tot[p.id] = 0; any[p.id] = !!p.b || !!(vals[p.id] && Array.isArray(vals[p.id].r)); }
    P.forEach((R, k) => {
      const { per } = simulate(R, roundThrows(seed, R, k, pl, vals));
      const sc = pl.map((p) => (per[p.id] ? per[p.id].v : 0));
      const best = Math.max(...sc);
      pl.forEach((p, i) => { tot[p.id] += sc[i]; if (best > 0 && sc[i] === best) wins[p.id]++; });
    });
    const out = {};
    for (const p of pl) out[p.id] = any[p.id] ? { score: wins[p.id] * 1e6 + tot[p.id], label: `${wins[p.id]} ${wins[p.id] === 1 ? 'ronda' : 'rondas'} · ${tot[p.id]} pts` } : null;
    return out;
  },
  evaluate(v) { return v && Array.isArray(v.r) ? { score: 0, label: '' } : null; },
  bot: () => ({ b: 1 }),
};

// ------------------------------------------------------------------ juego
function run(el, ctx, use3d) {
  const P = plan(ctx.seed);
  const pl = ctx.players || [{ id: ctx.me, n: 'Tú', c: ctx.color, a: 'frog' }];
  const myCi = Math.max(0, pl.findIndex((p) => p.id === ctx.me));
  el.innerHTML = `
    <div class="swr">
      <div class="swr-top">
        <span class="swr-round"></span>
        <span class="swr-left"></span>
        <span class="swr-score">0</span>
      </div>
      <div class="swr-stage">
        <div class="swr-msg"></div>
        <div class="swr-ops"></div>
      </div>
      <div class="swr-bar"><i></i></div>
      <div class="swr-bottom">
        <div class="swr-board"></div>
        <button class="swr-btn" style="--c:${ctx.color}">${icon('sword')}<b>LANZAR</b></button>
      </div>
    </div>`;
  const $ = (s) => el.querySelector(s);
  const stage = $('.swr-stage'), msgEl = $('.swr-msg'), opsEl = $('.swr-ops'), btn = $('.swr-btn');
  const roundEl = $('.swr-round'), leftEl = $('.swr-left'), scoreEl = $('.swr-score'), bar = $('.swr-bar i'), board = $('.swr-board');
  const t0 = performance.now();
  const my = [[], [], []];
  const wins = Object.fromEntries(pl.map((p) => [p.id, 0]));
  const st = { k: -1, R: null, phase: 'intro', ms: 0, sim: null, myCi, pl, me: ctx.me, lastThrow: -1e9, t0 };
  let view = null, dead = false, lastSig = '', lastTick = -1;

  const say1 = (html, ms = 1400) => { msgEl.innerHTML = rich(html); msgEl.classList.add('on'); clearTimeout(say1.t); if (ms) say1.t = setTimeout(() => msgEl.classList.remove('on'), ms); };
  const throwsNow = () => {
    const live = ctx.results ? ctx.results() : {};
    const all = [];
    pl.forEach((p, ci) => {
      let ts;
      if (p.id === ctx.me) ts = my[st.k];
      else if (p.b) ts = (st.botT[p.id] || (st.botT[p.id] = botThrows(ctx.seed, p.id, st.k, ci, st.R))).filter((t) => t <= st.ms);
      else ts = clean(live[p.id] && Array.isArray(live[p.id].r) ? live[p.id].r[st.k] : []);
      for (const t of ts) all.push({ id: p.id, ci, t, c: p.c });
    });
    return all;
  };
  const leftIcons = () => {
    const used = my[st.k] ? my[st.k].length : 0;
    leftEl.innerHTML = Array.from({ length: SWORDS }, (_, i) => `<i class="${i < used ? 'used' : ''}">${icon('sword')}</i>`).join('');
  };

  const throwSword = () => {
    if (st.phase !== 'play') return;
    const ms = Math.round(performance.now() - t0 - st.R.play);
    if (my[st.k].length >= SWORDS || ms - st.lastThrow < COOLDOWN || ms > PLAY) return;
    st.lastThrow = ms;
    my[st.k].push(ms);
    ctx.submit({ r: my });
    sfx.whoosh();
    buzz(15);
    btn.classList.remove('cool'); void btn.offsetWidth; btn.classList.add('cool');
    leftIcons();
  };
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); throwSword(); });
  const kd = (e) => { if (e.key === ' ' || e.key === 'Enter') throwSword(); };
  addEventListener('keydown', kd);

  if (use3d) import('../rt3d.js').then((m) => { if (!dead) { try { view = build3D(m, stage, st); } catch (e) { console.warn(e); view = build2D(stage, st); } } });
  else view = build2D(stage, st);

  const seen = new Set();
  const iv = setInterval(() => {
    const t = performance.now() - t0;
    const nk = P.findIndex((R) => t >= R.start && t < R.end);
    if (nk !== -1 && nk !== st.k) {
      st.k = nk;
      st.R = P[nk];
      st.phase = 'intro';
      st.botT = {};
      st.lastThrow = -1e9;
      seen.clear();
      roundEl.textContent = `Ronda ${nk + 1}/3`;
      say1(`Ronda ${nk + 1}${nk === 1 ? ' · ¡gira al revés!' : nk === 2 ? ' · ¡más rápido!' : ''}`, INTRO - 300);
      sfx.warn();
      leftIcons();
      opsEl.innerHTML = '';
      if (view) view.newRound(st.R);
    }
    if (st.k < 0) return;
    const R = st.R;
    st.ms = t - R.play;
    if (st.phase === 'intro' && st.ms >= 0) { st.phase = 'play'; say1('¡Lanza!', 800); sfx.go(); music('battle'); }
    if (st.phase === 'play') {
      bar.style.width = Math.max(0, 100 - (st.ms / PLAY) * 100) + '%';
      bar.parentElement.classList.toggle('hurry', st.ms > PLAY - 3000);
      const sec = Math.ceil((PLAY - st.ms) / 1000);
      if (st.ms > PLAY - 3000 && sec !== lastTick) { lastTick = sec; sfx.tick(); }
      if (st.ms >= PLAY + FLIGHT + 100) { st.phase = 'reveal'; stopMusic(); }
    }
    btn.classList.toggle('off', st.phase !== 'play' || my[st.k].length >= SWORDS);
    // estado de la ronda con todo lo que sabemos
    const sim = simulate(R, throwsNow());
    st.sim = sim;
    for (const h of sim.hits) {
      if (h.t > st.ms) continue;
      const key = h.id + ':' + h.t;
      if (seen.has(key)) continue;
      seen.add(key);
      const mine = h.id === ctx.me;
      const late = st.ms - h.t;
      const arrive = () => {
        if (dead || late > FLIGHT + 400) return;
        if (h.bounce) { sfx.clang(mine ? 1 : 0.4); if (mine) { sfx.ricochet(); say1('{cross} ¡Choque! Rebotó', 900); buzz(120); } }
        else if (mine) { if (h.op[0] === '+' || h.op[0] === '×') sfx.coin(); else sfx.hit(0.6); }
        else sfx.thunk(0.35);
      };
      if (view) view.land(h, mine, late, arrive); else arrive();
    }
    const meP = sim.per[ctx.me] || { v: 0, ops: [] };
    const landed = meP.ops.length;
    const sig = meP.ops.join(',') + '|' + meP.v;
    if (sig !== lastSig) {
      lastSig = sig;
      scoreEl.textContent = meP.v;
      scoreEl.classList.remove('bump'); void scoreEl.offsetWidth; scoreEl.classList.add('bump');
      opsEl.innerHTML = meP.ops.map((o) => `<span class="${o === '✕' ? 'x' : o[0] === '+' ? 'p' : o[0] === '×' ? 'm' : 'n'}">${o}</span>`).join('<i>›</i>');
    }
    void landed;
    board.innerHTML = pl.map((p) => `<span style="--c:${p.c}">${String(p.n).slice(0, 7).replace(/[<>&]/g, '')}<b>${sim.per[p.id] ? sim.per[p.id].v : 0}</b>${wins[p.id] ? `<em>${'★'.repeat(wins[p.id])}</em>` : ''}</span>`).join('');
    if (st.phase === 'reveal' && !st.done) {
      st.done = true;
      const sc = pl.map((p) => (sim.per[p.id] ? sim.per[p.id].v : 0));
      const best = Math.max(...sc);
      const winners = pl.filter((p, i) => best > 0 && sc[i] === best);
      winners.forEach((p) => { wins[p.id]++; });
      if (winners.some((p) => p.id === ctx.me)) { say1(`{trophy} ¡Ganaste la ronda con ${best}!`, 0); sfx.win(); say('¡Ronda ganada!'); }
      else if (winners.length) say1(`{trophy} ${winners.map((p) => String(p.n).slice(0, 10).replace(/[<>&]/g, '')).join(' y ')} gana con ${best}`, 0);
      else say1('Nadie sumó puntos', 0);
      if (view) view.reveal(winners.map((p) => pl.indexOf(p)));
    }
    if (st.phase !== 'reveal') st.done = false;
  }, 33);

  return () => {
    dead = true;
    clearInterval(iv);
    clearTimeout(say1.t);
    removeEventListener('keydown', kd);
    stopMusic();
    if (view) view.dispose();
  };
}

// ------------------------------------------------------------------ 3D
const OP_COLOR = { '+': '#06d6a0', '×': '#ffd60a', '÷': '#9d4edd', '−': '#ef233c' };
function labelTex(THREE, txt, bg) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = '900 72px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 12; g.strokeStyle = '#1b1035'; g.lineJoin = 'round';
  g.strokeText(txt, 64, 68);
  g.fillStyle = bg === '#ffd60a' ? '#ffffff' : '#ffffff';
  g.fillText(txt, 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeSword(THREE, color) {
  // hoja hacia -z (la punta), empuñadura hacia +z
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: '#e9ecef', metalness: 0.85, roughness: 0.2 });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.012, 0.3), steel);
  blade.position.z = -0.12;
  blade.castShadow = true;
  g.add(blade);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.07, 4), steel);
  tip.rotation.x = -Math.PI / 2;
  tip.rotation.y = Math.PI / 4;
  tip.scale.set(1, 1, 0.3);
  tip.position.z = -0.305;
  g.add(tip);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.03, 0.03), new THREE.MeshStandardMaterial({ color: '#ffb703', metalness: 0.7, roughness: 0.3 }));
  guard.position.z = 0.04;
  guard.castShadow = true;
  g.add(guard);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.1, 8), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
  grip.rotation.x = Math.PI / 2;
  grip.position.z = 0.1;
  g.add(grip);
  const pom = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), new THREE.MeshStandardMaterial({ color: '#ffb703', metalness: 0.7, roughness: 0.3 }));
  pom.position.z = 0.16;
  g.add(pom);
  return g;
}

function build3D(m, stage, st) {
  const { THREE, miniStage, makeCharacter } = m;
  const S = miniStage(stage, { skyTop: '#240046', skyBottom: '#7b2cbf', hemiGround: '#3c096c', fov: 40 });
  const { scene, camera, particles, sun } = S;
  sun.position.set(1.5, 4, 2);
  // arena cuadrada con baldosas
  const tileTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#e0aaff' : '#c77dff'; g.fillRect(i * 32, j * 32, 32, 32); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.2, 3.4), [
    new THREE.MeshStandardMaterial({ color: '#5a189a' }), new THREE.MeshStandardMaterial({ color: '#5a189a' }),
    new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.6 }), new THREE.MeshStandardMaterial({ color: '#5a189a' }),
    new THREE.MeshStandardMaterial({ color: '#5a189a' }), new THREE.MeshStandardMaterial({ color: '#5a189a' }),
  ]);
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  scene.add(floor);
  const neon = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.02, 8, 64), new THREE.MeshStandardMaterial({ color: '#ff70a6', emissive: '#ff70a6', emissiveIntensity: 1.4 }));
  neon.rotation.x = Math.PI / 2;
  neon.position.y = 0.01;
  scene.add(neon);
  // pedestal
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 0.42, 24), new THREE.MeshStandardMaterial({ color: '#3c096c', metalness: 0.4, roughness: 0.4 }));
  ped.position.y = 0.21;
  ped.castShadow = ped.receiveShadow = true;
  scene.add(ped);
  // la ruleta (pizza)
  const wheel = new THREE.Group();
  wheel.position.y = 0.5;
  scene.add(wheel);
  const sliceMeshes = [];
  const labels = [];
  const lgs = [];
  for (let j = 0; j < NS; j++) {
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45, emissive: '#ffffff', emissiveIntensity: 0 });
    const geo = new THREE.CylinderGeometry(WR, WR, 0.14, 12, 1, false, Math.PI / 2 - (j + 1) * SL, SL);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    wheel.add(mesh);
    sliceMeshes.push(mesh);
    const a = (j + 0.5) * SL;
    const lg = new THREE.Group();
    lg.position.set(Math.cos(a) * WR * 0.66, 0.072, Math.sin(a) * WR * 0.66);
    lg.rotation.y = Math.PI / 2 - a;
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    lbl.rotation.x = -Math.PI / 2;
    lg.add(lbl);
    wheel.add(lg);
    labels.push(lbl);
    lgs.push(lg);
    // separadores
    const sep = new THREE.Mesh(new THREE.BoxGeometry(WR, 0.02, 0.012), new THREE.MeshStandardMaterial({ color: '#1b1035' }));
    const b = j * SL;
    sep.position.set(Math.cos(b) * WR / 2, 0.075, Math.sin(b) * WR / 2);
    sep.rotation.y = -b;
    wheel.add(sep);
  }
  const rim = new THREE.Mesh(new THREE.TorusGeometry(WR, 0.025, 8, 64), new THREE.MeshStandardMaterial({ color: '#ffb703', metalness: 0.7, roughness: 0.3 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.07;
  wheel.add(rim);
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 12), new THREE.MeshStandardMaterial({ color: '#ffb703', metalness: 0.7, roughness: 0.25 }));
  hub.position.y = 0.08;
  hub.scale.y = 0.6;
  wheel.add(hub);
  // jugadores en las esquinas
  const chars = st.pl.map((p, i) => {
    const a = cornerAng(i);
    const x = Math.cos(a) * CORNER, z = Math.sin(a) * CORNER;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.04, 28), new THREE.MeshStandardMaterial({ color: p.c, emissive: p.c, emissiveIntensity: 0.35 }));
    pad.position.set(x, 0.02, z);
    pad.receiveShadow = true;
    scene.add(pad);
    const ch = makeCharacter({ c: p.c, a: p.a }, 0.11);
    ch.root.position.set(x, 0.04, z);
    ch.root.rotation.y = Math.atan2(-x, -z);
    scene.add(ch.root);
    // espada en la mano lista para lanzar
    const held = makeSword(THREE, p.c);
    held.scale.setScalar(0.8);
    held.rotation.x = -Math.PI / 2;
    held.position.set(0, -0.08, 0.02);
    ch.arms[1].add(held);
    return { ...ch, a, x, z, held, throwT: -9 };
  });
  // línea de tiro (la mía)
  const me = chars[st.myCi];
  const aim = new THREE.Mesh(new THREE.PlaneGeometry(0.05, CORNER - WR - 0.25), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false }));
  aim.rotation.x = -Math.PI / 2;
  const aimG = new THREE.Group();
  aimG.add(aim);
  const midR = (CORNER + WR) / 2 - 0.05;
  aimG.position.set(Math.cos(me.a) * midR, 0.012, Math.sin(me.a) * midR);
  aimG.rotation.y = Math.PI / 2 - me.a;
  scene.add(aimG);
  // cámara detrás de mi esquina
  const fit = () => {
    const back = 3.0 + Math.max(0, 0.75 - S.aspect) * 3.2;
    camera.position.set(Math.cos(me.a) * back, 2.9 + Math.max(0, 0.75 - S.aspect) * 1.5, Math.sin(me.a) * back);
    camera.lookAt(0, 0.2, 0);
  };

  const flying = [];
  const stuck = [];
  let flashSlice = -1, flashT = 0;
  S.start((dt, now) => {
    fit();
    const R = st.R;
    if (!R) return;
    const ms = performance.now() - st.t0 - R.play; // suave (no a saltos del reloj del juego)
    wheel.rotation.y = -wheelAng(R, ms);
    // los números siempre se leen derechos desde mi cámara
    const ly = Math.atan2(Math.cos(me.a), Math.sin(me.a)) - wheel.rotation.y;
    for (const lg of lgs) lg.rotation.y = ly;
    // porción que tocarías si lanzas ahora
    const aimSlice = st.phase === 'play' ? sliceAt(R, st.myCi, ms + FLIGHT) : -1;
    sliceMeshes.forEach((sm, j) => {
      const glow = j === aimSlice ? 0.45 + Math.sin(now / 90) * 0.12 : 0;
      sm.material.emissiveIntensity = glow + (j === flashSlice ? flashT : 0);
    });
    flashT = Math.max(0, flashT - dt * 2);
    neon.material.emissiveIntensity = 1.1 + Math.sin(now / 200) * 0.4;
    // personajes: animación de lanzar
    for (const c of chars) {
      const f = (now - c.throwT) / 260;
      if (f >= 0 && f < 1) c.arms[1].rotation.x = -2.8 + f * 3.6;
      else c.arms[1].rotation.x += (-0.4 - c.arms[1].rotation.x) * Math.min(1, dt * 8);
      c.held.visible = !(f >= 0 && f < 1.6);
      c.rig.position.y = Math.abs(Math.sin(now / 300 + c.a)) * 0.01;
      c.headObj.blink(now / 1000 + c.a);
    }
    // espadas volando
    for (let i = flying.length - 1; i >= 0; i--) {
      const fl = flying[i];
      const f = (ms - fl.t) / FLIGHT;
      if (f >= 1) { scene.remove(fl.obj); flying.splice(i, 1); fl.done(); continue; }
      const k = Math.max(0, f);
      const p = fl.from.clone().lerp(fl.to, k);
      p.y += Math.sin(k * Math.PI) * 0.12;
      fl.obj.position.copy(p);
      fl.obj.lookAt(fl.from.clone().multiplyScalar(2).sub(fl.to).setY(p.y));
      fl.obj.visible = f >= 0;
    }
    // espadas que rebotaron caen girando
    for (const s of stuck) if (s.fall) {
      s.vy -= 6 * dt;
      s.obj.position.x += s.vx * dt; s.obj.position.z += s.vz * dt; s.obj.position.y = Math.max(0.03, s.obj.position.y + s.vy * dt);
      s.obj.rotation.x += dt * 14;
      if (s.obj.position.y <= 0.03) { s.vx *= 0.9; s.vz *= 0.9; s.vy = Math.abs(s.vy) * 0.3; }
    }
  });

  return {
    newRound(R) {
      R.ops.forEach((op, j) => {
        sliceMeshes[j].material.color.set(OP_COLOR[op[0]]).lerp(new THREE.Color('#ffffff'), (j % 2) * 0.18);
        sliceMeshes[j].material.emissive.set(OP_COLOR[op[0]]);
        labels[j].material.map = labelTex(THREE, op, OP_COLOR[op[0]]);
        labels[j].material.needsUpdate = true;
      });
      for (const s of stuck) (s.parent || scene).remove(s.obj);
      stuck.length = 0;
      for (const f of flying) scene.remove(f.obj);
      flying.length = 0;
      particles.burst(0, 0.6, 0, { n: 40, color: ['#ffd60a', '#ff70a6', '#ffffff'], speed: 1, up: 1.4, size: 0.04, life: 0.8, gravity: 2 });
    },
    // una espada llega (ya calculado si rebota o dónde se clava)
    land(h, mine, late, arrive) {
      const c = chars[h.ci];
      const p = st.pl[h.ci];
      const obj = makeSword(THREE, p.c);
      const finish = () => {
        if (arrive) arrive();
        if (h.bounce) {
          scene.add(obj);
          const dx = Math.cos(c.a), dz = Math.sin(c.a);
          obj.position.set(dx * (WR + 0.15), 0.55, dz * (WR + 0.15));
          stuck.push({ obj, fall: true, vx: dx * 1.4 + (Math.random() - 0.5), vz: dz * 1.4 + (Math.random() - 0.5), vy: 1.6 });
          particles.burst(dx * WR, 0.57, dz * WR, { n: 22, color: ['#ffffff', '#ffd60a', '#ffb703'], speed: 0.9, up: 0.6, size: 0.04, life: 0.4, gravity: 1 });
          if (mine) S.shake = 0.04;
          return;
        }
        // se clava en el borde de la ruleta, apuntando al centro
        const L = h.L;
        obj.position.set(Math.cos(L) * (WR + 0.13), 0.0, Math.sin(L) * (WR + 0.13));
        obj.rotation.y = Math.PI / 2 - L;
        wheel.add(obj);
        stuck.push({ obj, parent: wheel });
        const wp = new THREE.Vector3(); obj.getWorldPosition(wp);
        particles.burst(wp.x, 0.55, wp.z, { n: mine ? 18 : 8, color: [OP_COLOR[h.op[0]], '#ffffff'], speed: 0.5, up: 0.7, size: 0.04, life: 0.5, gravity: 1.5 });
        const j = Math.floor(L / SL) % NS;
        if (mine) { flashSlice = j; flashT = 1; S.shake = 0.015; }
      };
      if (late > FLIGHT + 200) { finish(); return; }
      c.throwT = performance.now() - Math.max(0, late);
      const from = new THREE.Vector3(c.x * 0.86, 0.45, c.z * 0.86);
      const to = new THREE.Vector3(Math.cos(c.a) * (WR + 0.13), 0.5, Math.sin(c.a) * (WR + 0.13));
      scene.add(obj);
      obj.visible = false;
      flying.push({ obj, from, to, t: h.t, done: () => { const o2 = obj; scene.remove(o2); finish(); } });
    },
    reveal(winIdx) {
      for (const i of winIdx) {
        const c = chars[i];
        particles.burst(c.x, 0.6, c.z, { n: 60, color: ['#ffd60a', '#ff4d6d', '#3a86ff', '#06d6a0', '#ffffff'], speed: 1, up: 2, size: 0.05, life: 1.4, gravity: 2.5 });
      }
    },
    dispose: () => S.dispose(),
  };
}

// ------------------------------------------------------------------ 2D
function build2D(stage, st) {
  const cv = document.createElement('canvas');
  cv.className = 'k-3d';
  stage.prepend(cv);
  const g = cv.getContext('2d');
  let raf = 0, dead = false, ops = null;
  const marks = [];
  const frame = () => {
    if (dead) return;
    const w = stage.clientWidth, h = stage.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr)) { cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#5a189a'; g.fillRect(0, 0, w, h);
    const R = st.R;
    if (R) {
      const cx = w / 2, cy = h / 2, rad = Math.min(w, h) * 0.26;
      // girar la vista para que mi esquina quede abajo
      const rot = Math.PI / 2 - cornerAng(st.myCi);
      const th = wheelAng(R, st.ms) + rot;
      R.ops.forEach((op, j) => {
        g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, rad, j * SL + th, (j + 1) * SL + th); g.closePath();
        g.fillStyle = OP_COLOR[op[0]]; g.fill(); g.strokeStyle = '#1b1035'; g.lineWidth = 2; g.stroke();
        const a = (j + 0.5) * SL + th;
        g.fillStyle = '#fff'; g.font = `900 ${Math.round(rad * 0.28)}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(op, cx + Math.cos(a) * rad * 0.65, cy + Math.sin(a) * rad * 0.65);
      });
      for (const mk of marks) {
        const a = mk.L + th;
        g.strokeStyle = mk.c; g.lineWidth = 5;
        g.beginPath(); g.moveTo(cx + Math.cos(a) * rad * 0.9, cy + Math.sin(a) * rad * 0.9); g.lineTo(cx + Math.cos(a) * rad * 1.25, cy + Math.sin(a) * rad * 1.25); g.stroke();
      }
      st.pl.forEach((p, i) => {
        const a = cornerAng(i) + rot;
        g.beginPath(); g.arc(cx + Math.cos(a) * rad * 1.75, cy + Math.sin(a) * rad * 1.75, rad * 0.2, 0, TAU);
        g.fillStyle = p.c; g.fill(); g.lineWidth = i === st.myCi ? 4 : 2; g.strokeStyle = '#fff'; g.stroke();
      });
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  void ops;
  return {
    newRound() { marks.length = 0; },
    land(h, mine, late, arrive) { setTimeout(() => { if (!h.bounce) marks.push({ L: h.L, c: st.pl[h.ci].c }); if (arrive) arrive(); }, Math.max(0, FLIGHT - late)); },
    reveal() {},
    dispose() { dead = true; cancelAnimationFrame(raf); cv.remove(); },
  };
}
