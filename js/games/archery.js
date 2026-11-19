// Tiro con arco — 3 rondas en 3D. Mantén el dedo para tensar el arco,
// arrastra para apuntar y suelta para disparar. El viento cambia (y en las
// rondas 2 y 3 hasta de dirección): compénsalo apuntando hacia el otro lado.
// Cada ronda la diana está más lejos y hay menos tiempo para disparar.
import { mulberry32, buzz } from '../util.js';
import { sfx, say } from '../audio.js';
import { rich } from '../icons.js';
import { USE_2D } from '../rt.js';

const TAU = Math.PI * 2;
const TR = 0.61;          // radio de la diana (m)
const CY = 1.4;           // altura del centro de la diana
const EYE = 1.55;         // altura de los ojos del arquero
const INTRO = 2600;
const REVEAL = 5200;
const DRAW_MS = 900;      // tiempo para tensar del todo
const DRIFT = 0.0042;     // desvío por viento: m por (m/s · m de distancia)
const RCFG = [
  { d: 18, frac: 0.34, lo: 0.6, hi: 1.8, flip: false, shot: 10000 },
  { d: 30, frac: 0.26, lo: 2.0, hi: 3.6, flip: true, shot: 9000 },
  { d: 45, frac: 0.19, lo: 3.0, hi: 5.5, flip: true, shot: 8000 },
];
const hash = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const r3 = (v) => Math.round(v * 1000) / 1000;

function plan(seed) {
  const r = mulberry32(seed ^ 0xa4c4);
  let t = 0;
  return RCFG.map((C, k) => {
    const R = { ...C, k, s: r() < 0.5 ? -1 : 1, B: C.lo + r() * (C.hi - C.lo), w: 0.45 + r() * 0.5, ph: r() * TAU, start: t };
    R.aim = t + INTRO;
    R.dead = R.aim + C.shot;
    R.end = R.dead + REVEAL;
    t = R.end;
    return R;
  });
}
// viento horizontal (m/s, + = hacia la derecha) a los ms de empezar a apuntar
function windAt(R, ms) {
  const tt = Math.max(0, ms) / 1000;
  return R.flip ? R.B * (0.3 * R.s + 0.85 * Math.sin(R.w * tt + R.ph)) : R.s * R.B * (0.82 + 0.18 * Math.sin(R.w * 1.7 * tt + R.ph));
}
function ringOf(x, y) {
  const d = Math.hypot(x, y);
  if (d > TR) return 0;
  return Math.max(1, Math.min(10, 10 - Math.floor(d / (TR / 10))));
}
const isX = (x, y) => Math.hypot(x, y) < TR / 20;

function botShot(seed, id, k, R) {
  const rr = mulberry32((seed ^ hash(id) ^ Math.imul(k + 3, 0x9e3779b1)) >>> 0);
  const skill = 0.7 + rr() * 0.6;
  const sig = TR * (0.16 + 0.09 * k) * skill;
  const gx = (rr() + rr() + rr() - 1.5) * 2 * sig, gy = (rr() + rr() + rr() - 1.5) * 2 * sig;
  const drift = windAt(R, rr() * R.shot) * R.d * DRIFT;
  const x = gx + drift * (rr() - 0.5), y = gy;
  return { x: r3(x), y: r3(y), s: ringOf(x, y) };
}

export default {
  id: 'archery',
  name: 'Tiro con arco',
  uses3d: true,
  desc: '3 rondas de precisión. Mantén el dedo para tensar, arrastra para apuntar y suelta para disparar. Ojo con el viento: cambia de fuerza y de dirección. ¡Y tienes poco tiempo para disparar!',
  dur: (seed) => plan(seed)[2].end,

  mount(el, ctx) {
    let webgl = false;
    try { const c = document.createElement('canvas'); webgl = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { /* nada */ }
    return run(el, ctx, !USE_2D() && webgl);
  },

  evaluate(v) {
    if (!v || !Array.isArray(v.r)) return null;
    let tot = 0, dsum = 0, xs = 0;
    for (let k = 0; k < 3; k++) {
      const e = v.r[k];
      if (e && typeof e.x === 'number' && typeof e.y === 'number') {
        tot += ringOf(e.x, e.y);
        dsum += Math.min(Math.hypot(e.x, e.y), TR * 2);
        if (isX(e.x, e.y)) xs++;
      } else dsum += TR * 2;
    }
    return { score: tot * 10000 - Math.round(dsum * 1000), label: `${tot} puntos${xs ? ` · ${xs} al centro` : ''}` };
  },

  bot: (r, seed, p) => { const P = plan(seed); return { r: P.map((R, k) => botShot(seed, p?.id || 'bot0', k, R)) }; },
};

// ------------------------------------------------------------------ juego
function run(el, ctx, use3d) {
  const P = plan(ctx.seed);
  el.innerHTML = `
    <div class="ar">
      <div class="ar-top">
        <span class="ar-round"><small>Ronda</small><b>1/3</b></span>
        <span class="ar-wind"><small>Viento</small><span><svg class="ar-warrow" viewBox="0 0 40 20"><path d="M2 10h28M22 3l9 7-9 7" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg><b>0</b><i>km/h</i></span></span>
        <span class="ar-score"><small>Tus puntos</small><span class="ar-slots"><i>–</i><i>–</i><i>–</i></span><b>0</b></span>
      </div>
      <div class="ar-stage">
        <div class="ar-dist"></div>
        <div class="ar-msg"></div>
        <div class="ar-pop"></div>
        <div class="ar-res"></div>
        <div class="ar-hint">Mantén el dedo para <b>tensar</b>, arrástralo para <b>apuntar</b> y suéltalo para <b>disparar</b></div>
      </div>
      <div class="ar-time"><i></i></div>
      <div class="ar-board"></div>
    </div>`;
  const $ = (s) => el.querySelector(s);
  const stage = $('.ar-stage'), msgEl = $('.ar-msg'), pop = $('.ar-pop'), hint = $('.ar-hint');
  const windEl = $('.ar-wind'), windB = $('.ar-wind b'), roundEl = $('.ar-round b'), scoreEl = $('.ar-score b'), slotsEl = $('.ar-slots');
  const timeBar = $('.ar-time i'), board = $('.ar-board'), resEl = $('.ar-res'), distEl = $('.ar-dist');
  const t0 = performance.now();
  const my = [null, null, null];
  // estado compartido con la vista
  const st = { k: -1, R: null, phase: 'intro', aim: { x: 0, y: 0 }, holding: false, holdAt: 0, power: 0, wind: 0, shots: [], reveal: [], fired: false };
  st.powerAt = (now) => (st.holding ? Math.min(1, (now - st.holdAt) / DRAW_MS) : 0);
  const ringClass = (s) => (s >= 9 ? 'gold' : s >= 7 ? 'red' : s >= 5 ? 'blue' : s >= 3 ? 'black' : s >= 1 ? 'white' : 'miss');
  const paintSlots = () => {
    slotsEl.innerHTML = my.map((e, k) => {
      if (!e) return `<i class="${k === st.k ? 'cur' : ''}">–</i>`;
      const v = typeof e.x === 'number' ? ringOf(e.x, e.y) : 0;
      return `<i class="${ringClass(v)}">${v}</i>`;
    }).join('');
    scoreEl.textContent = total();
  };
  let view = null, dead = false, lastTick = -1;
  let ptr = null;

  const fatigue = (now) => (st.holding ? 1 + Math.min(1.6, Math.max(0, (now - st.holdAt) / 1000 - 4) * 0.55) : 1);
  st.sway = (now) => {
    if (!st.R) return { x: 0, y: 0 };
    const A = TR * (0.035 + 0.022 * st.k) * (st.holding ? 1 : 0.55) * fatigue(now);
    const q = now / 1000;
    return { x: A * (Math.sin(q * 1.31) + 0.45 * Math.sin(q * 3.7 + 1)), y: A * (Math.cos(q * 1.07) * 0.8 + 0.4 * Math.sin(q * 2.9)) };
  };
  st.fov = (R) => 2 * Math.atan(TR / (R.d * R.frac)); // radianes

  const say1 = (html, ms = 1400) => { msgEl.innerHTML = rich(html); msgEl.classList.add('on'); clearTimeout(say1.t); if (ms) say1.t = setTimeout(() => msgEl.classList.remove('on'), ms); };
  const total = () => my.reduce((a, e) => a + (e && typeof e.x === 'number' ? ringOf(e.x, e.y) : 0), 0);

  const fire = (now) => {
    if (st.fired || !st.R) return;
    const R = st.R;
    st.fired = true;
    st.holding = false;
    const power = Math.min(1, (now - st.holdAt) / DRAW_MS);
    const sw = st.sway(now);
    const w = windAt(R, now - t0 - R.aim);
    const drift = w * R.d * DRIFT;
    const drop = Math.pow(1 - power, 1.6) * 1.6 * (R.d / 30);
    const x = st.aim.x + sw.x + drift, y = st.aim.y + sw.y - drop;
    const s = ringOf(x, y);
    my[st.k] = { x: r3(x), y: r3(y), s };
    ctx.submit({ r: my });
    sfx.twang();
    buzz(30);
    const fl = 0.45 + R.d / 80;
    if (view) view.shoot(x, y, ctx.color, fl);
    setTimeout(() => {
      if (dead) return;
      if (s === 0) { sfx.whoosh(); pop.innerHTML = '<b>0</b><small>¡Fallaste!</small>'; pop.className = 'ar-pop on miss'; }
      else {
        sfx.thunk();
        const X = isX(x, y);
        pop.innerHTML = `<b>${s}</b><small>${X ? '¡CENTRO!' : s === 1 ? 'punto' : 'puntos'}</small>`;
        pop.className = `ar-pop on ${ringClass(s)}${X ? ' x' : ''}`;
        if (X || s >= 9) { setTimeout(() => sfx.big(), 120); if (X) say('¡Al centro!'); }
        if (view) view.impact(x, y, s, X);
      }
      paintSlots();
      if (power < 0.6) setTimeout(() => !dead && say1('Tensa más el arco: la flecha cayó', 1600), 600);
    }, fl * 1000);
  };

  // controles: mantener, arrastrar y soltar
  const sens = () => ((2 * TR) / st.R.frac / Math.max(100, stage.clientHeight)) * 0.55;
  stage.addEventListener('pointerdown', (e) => {
    if (st.phase !== 'aim' || st.fired || ptr !== null) return;
    e.preventDefault();
    ptr = e.pointerId;
    try { stage.setPointerCapture(e.pointerId); } catch { /* nada */ }
    st.holding = true;
    st.holdAt = performance.now();
    st.px = e.clientX; st.py = e.clientY;
    hint.classList.add('gone');
    sfx.draw();
  });
  stage.addEventListener('pointermove', (e) => {
    if (e.pointerId !== ptr || !st.holding) return;
    const k = sens();
    st.aim.x = Math.max(-3, Math.min(3, st.aim.x + (e.clientX - st.px) * k));
    st.aim.y = Math.max(-3, Math.min(3, st.aim.y - (e.clientY - st.py) * k));
    st.px = e.clientX; st.py = e.clientY;
  });
  const up = (e) => { if (e.pointerId !== ptr) return; ptr = null; if (st.holding) fire(performance.now()); };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);

  const results = () => {
    const live = ctx.results ? ctx.results() : {};
    return (ctx.players || []).map((p) => {
      let e = null;
      if (p.id === ctx.me) e = my[st.k];
      else if (p.b) e = botShot(ctx.seed, p.id, st.k, st.R);
      else if (live[p.id] && Array.isArray(live[p.id].r)) e = live[p.id].r[st.k];
      return { p, e };
    });
  };
  const totals = {};
  const paintBoard = () => {
    const ps = [...(ctx.players || [])].sort((a, b) => (totals[b.id] || 0) - (totals[a.id] || 0));
    board.innerHTML = ps.map((p) => `<span style="--c:${p.c}">${String(p.n).slice(0, 8).replace(/[<>&]/g, '')}<b>${totals[p.id] || 0}</b></span>`).join('');
  };
  paintBoard();

  if (use3d) {
    import('../rt3d.js').then((m) => { if (!dead) { try { view = build3D(m, stage, st, ctx); } catch (e) { console.warn(e); view = build2D(stage, st); } } });
  } else view = build2D(stage, st);

  const iv = setInterval(() => {
    const now = performance.now();
    const t = now - t0;
    const nk = P.findIndex((R) => t >= R.start && t < R.end);
    if (nk !== -1 && nk !== st.k) {
      st.k = nk;
      st.R = P[nk];
      st.phase = 'intro';
      st.aim = { x: 0, y: 0 };
      st.fired = false;
      st.holding = false;
      st.revealed = false;
      pop.className = 'ar-pop';
      resEl.classList.remove('on');
      roundEl.textContent = `${nk + 1}/3`;
      distEl.textContent = `${st.R.d} m`;
      paintSlots();
      say1(`Ronda ${nk + 1} · diana a ${st.R.d} m${st.R.flip ? '<br><small>¡El viento cambia de dirección!</small>' : ''}`, INTRO - 300);
      sfx.warn();
      if (view) view.newRound(st.R);
      if (nk === 0) hint.classList.remove('gone');
    }
    if (st.k < 0) return;
    const R = st.R;
    // viento en vivo
    st.wind = windAt(R, t - R.aim);
    const kmh = Math.round(Math.abs(st.wind) * 3.6);
    windB.textContent = kmh;
    windEl.classList.toggle('left', st.wind < 0);
    windEl.dataset.lvl = kmh < 6 ? 0 : kmh < 13 ? 1 : 2;
    if (t >= R.aim && st.phase === 'intro') {
      st.phase = 'aim';
      say1('¡A disparar!', 900);
      sfx.go();
    }
    if (st.phase === 'aim') {
      const left = R.dead - t;
      timeBar.style.width = Math.max(0, (left / R.shot) * 100) + '%';
      timeBar.parentElement.classList.toggle('hurry', left < 3000);
      const sec = Math.ceil(left / 1000);
      if (left < 3000 && sec !== lastTick && !st.fired) { lastTick = sec; sfx.tick(); }
      if (left <= 0) {
        st.phase = 'wait';
        if (st.holding) { ptr = null; fire(now); }
        else if (!st.fired) {
          st.fired = true;
          my[st.k] = { s: 0, m: 1 };
          ctx.submit({ r: my });
          say1('{timer} ¡Se acabó el tiempo!', 1600);
          pop.innerHTML = '<b>0</b><small>Sin disparar</small>';
          pop.className = 'ar-pop on miss';
          paintSlots();
          sfx.out(0.6);
        }
      }
    }
    // resultados de la ronda: todas las flechas
    if (t >= R.dead + 700 && !st.revealed) {
      st.revealed = true;
      st.phase = 'reveal';
      const res = results();
      for (const { p, e } of res) totals[p.id] = (totals[p.id] || 0) + (e && typeof e.x === 'number' ? ringOf(e.x, e.y) : 0);
      paintBoard();
      if (view) view.reveal(res.filter(({ p, e }) => p.id !== ctx.me && e && typeof e.x === 'number').map(({ p, e }) => ({ x: e.x, y: e.y, c: p.c })));
      const best = res.reduce((m, { e }) => Math.max(m, e && typeof e.x === 'number' ? ringOf(e.x, e.y) : 0), 0);
      if (best) sfx.bell();
      // tarjeta de resultados de la ronda
      const rows = res.map(({ p, e }) => ({ p, v: e && typeof e.x === 'number' ? ringOf(e.x, e.y) : 0, X: !!(e && typeof e.x === 'number' && isX(e.x, e.y)) }))
        .sort((a, b) => b.v - a.v || (totals[b.p.id] || 0) - (totals[a.p.id] || 0));
      const esc2 = (t) => String(t).replace(/[<>&]/g, '');
      resEl.innerHTML = `<h4>${st.k === 2 ? 'Última ronda' : `Ronda ${st.k + 1}`} · ${R.d} m</h4>` + rows.map((r) => `
        <div class="ar-row${r.p.id === ctx.me ? ' me' : ''}"><i style="background:${r.p.c}"></i><span>${esc2(r.p.n).slice(0, 10)}</span>
          <b class="${ringClass(r.v)}">${r.v}${r.X ? '<small>★</small>' : ''}</b><em>${totals[r.p.id] || 0}</em></div>`).join('') + '<div class="ar-row head"><span></span><span></span><small>ronda</small><small>total</small></div>';
      setTimeout(() => { if (!dead && st.revealed) { resEl.classList.add('on'); pop.className = 'ar-pop'; } }, 1200);
    }
  }, 30);

  return () => {
    dead = true;
    clearInterval(iv);
    clearTimeout(say1.t);
    if (view) view.dispose();
  };
}

// ------------------------------------------------------------------ 3D
function canvasTex(THREE, w, h, paint, rep) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeArrow(THREE, color, k = 1) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.011 * k, 0.011 * k, 0.75, 8), new THREE.MeshStandardMaterial({ color: '#c9a227', roughness: 0.6 }));
  shaft.rotation.x = Math.PI / 2;
  g.add(shaft);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.022 * k, 0.07, 8), new THREE.MeshStandardMaterial({ color: '#adb5bd', metalness: 0.8, roughness: 0.25 }));
  tip.rotation.x = -Math.PI / 2;
  tip.position.z = -0.41;
  g.add(tip);
  const fm = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.6, emissive: color, emissiveIntensity: 0.25 });
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.05 * k, 0.13), fm);
    f.rotation.x = Math.PI / 2;
    const holder = new THREE.Group();
    f.position.x = 0.03 * k;
    holder.add(f);
    holder.rotation.z = (i / 3) * TAU;
    holder.position.z = 0.29;
    g.add(holder);
  }
  const nock = new THREE.Mesh(new THREE.SphereGeometry(0.016 * k, 8, 6), fm);
  nock.position.z = 0.38;
  g.add(nock);
  return g;
}

function build3D(m, stage, st, ctx) {
  const { THREE, miniStage } = m;
  const S = miniStage(stage, { skyTop: '#4ea8de', skyBottom: '#caf0f8', hemiGround: '#4f772d', fov: 40, far: 140 });
  const { scene, camera, particles, sun } = S;
  scene.fog = new THREE.Fog('#caf0f8', 60, 130);
  scene.add(sun.target);
  // pasto
  const grassTex = canvasTex(THREE, 128, 128, (g) => {
    g.fillStyle = '#6a994e'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#76a85a'; g.fillRect(0, 0, 64, 128);
    for (let i = 0; i < 300; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'; g.fillRect(Math.random() * 128, Math.random() * 128, 2, 3); }
  }, true);
  grassTex.repeat.set(30, 60);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 160), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -60;
  ground.receiveShadow = true;
  scene.add(ground);
  // colinas y árboles al fondo
  const hillMat = new THREE.MeshStandardMaterial({ color: '#52b788', roughness: 1 });
  for (let i = 0; i < 7; i++) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(14 + (i % 3) * 5, 20, 10), hillMat);
    h.scale.y = 0.35;
    h.position.set(-45 + i * 15, -2, -105 - (i % 2) * 10);
    scene.add(h);
  }
  const r = mulberry32(ctx.seed ^ 0x7ee5);
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#7f5539', roughness: 0.9 });
  const leafMats = ['#2d6a4f', '#40916c', '#1b4332'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true }));
  for (let i = 0; i < 70; i++) {
    const z = -55 - r() * 35, x = (r() * 2 - 1) * 30;
    const s = 1.5 + r() * 2.2;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.2, 6), trunkMat);
    trunk.position.y = 0.6;
    tree.add(trunk);
    const lm = leafMats[Math.floor(r() * 3)];
    for (let j = 0; j < 3; j++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(1.1 - j * 0.28, 1.5, 7), lm);
      c.position.y = 1.5 + j * 0.8;
      tree.add(c);
    }
    tree.scale.setScalar(s);
    tree.position.set(x, 0, z);
    scene.add(tree);
  }
  // carril de tiro y marcas de distancia
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 50), new THREE.MeshStandardMaterial({ color: '#a7c957', roughness: 1 }));
  lane.rotation.x = -Math.PI / 2;
  lane.position.set(0, 0.005, -25);
  lane.receiveShadow = true;
  scene.add(lane);
  const markMat = new THREE.MeshStandardMaterial({ color: '#ffffff' });
  for (let z = 5; z <= 45; z += 5) {
    const mk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.02, 0.08), markMat);
    mk.position.set(0, 0.01, -z);
    scene.add(mk);
  }
  // diana: paja + cara de anillos + caballete
  const faceTex = canvasTex(THREE, 512, 512, (g) => {
    const cols = ['#f8f9fa', '#f8f9fa', '#212529', '#212529', '#1e90ff', '#1e90ff', '#e63946', '#e63946', '#ffd60a', '#ffd60a'];
    for (let i = 0; i < 10; i++) {
      const rr = 256 * (1 - i / 10);
      g.beginPath(); g.arc(256, 256, rr, 0, TAU);
      g.fillStyle = cols[i]; g.fill();
      g.lineWidth = 2; g.strokeStyle = i === 2 || i === 3 ? '#f8f9fa' : '#212529'; g.stroke();
    }
    g.beginPath(); g.arc(256, 256, 12.8, 0, TAU); g.lineWidth = 1.5; g.strokeStyle = '#212529'; g.stroke();
    g.beginPath(); g.moveTo(250, 256); g.lineTo(262, 256); g.moveTo(256, 250); g.lineTo(256, 262); g.stroke();
  });
  const strawTex = canvasTex(THREE, 128, 128, (g) => {
    g.fillStyle = '#d4a373'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 400; i++) { g.strokeStyle = Math.random() < 0.5 ? '#e9c46a' : '#b5835a'; g.lineWidth = 1; const x = Math.random() * 128, y = Math.random() * 128; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 14, y + (Math.random() - 0.5) * 4); g.stroke(); }
  });
  const target = new THREE.Group();
  const boss = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 0.45), new THREE.MeshStandardMaterial({ map: strawTex, roughness: 1 }));
  boss.position.z = -0.225;
  boss.castShadow = boss.receiveShadow = true;
  target.add(boss);
  const face = new THREE.Mesh(new THREE.CircleGeometry(TR, 64), new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.8 }));
  face.position.z = 0.004;
  target.add(face);
  const legMat = new THREE.MeshStandardMaterial({ color: '#6f4518', roughness: 0.9 });
  for (const [x, z, rx] of [[-0.6, -0.1, 0.22], [0.6, -0.1, 0.22], [0, -0.8, -0.5]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.0, 6), legMat);
    leg.position.set(x, -CY + 0.9, z);
    leg.rotation.x = rx;
    leg.castShadow = true;
    target.add(leg);
  }
  scene.add(target);
  // dianas vecinas (decoración)
  const deco = [];
  for (const x of [-3.2, 3.2]) { const c = target.clone(); c.userData.x = x; scene.add(c); deco.push(c); }
  // banderas de viento
  const flagGeo = new THREE.PlaneGeometry(0.75, 0.48, 16, 6);
  flagGeo.translate(0.375, 0, 0);
  const base = flagGeo.attributes.position.array.slice();
  const flags = [];
  const flagMat = new THREE.MeshStandardMaterial({ color: '#ffd60a', side: THREE.DoubleSide, roughness: 0.7 });
  const flagMat2 = new THREE.MeshStandardMaterial({ color: '#ff4d6d', side: THREE.DoubleSide, roughness: 0.7 });
  for (const [x, dz, mat] of [[1.25, 0.6, flagMat], [-1.55, -3.5, flagMat2]]) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 2.8, 8), new THREE.MeshStandardMaterial({ color: '#e9ecef', metalness: 0.5, roughness: 0.3 }));
    pole.position.y = 1.4;
    pole.castShadow = true;
    g.add(pole);
    const cloth = new THREE.Mesh(flagGeo.clone(), mat);
    const piv = new THREE.Group();
    piv.position.y = 2.5;
    piv.add(cloth);
    g.add(piv);
    scene.add(g);
    flags.push({ g, piv, cloth, dz, x });
  }
  // ---- arco en primera persona (capa aparte)
  const oScene = new THREE.Scene();
  const oCam = new THREE.PerspectiveCamera(50, 1, 0.01, 10);
  oScene.add(new THREE.HemisphereLight('#ffffff', '#4f772d', 1.4));
  const ol = new THREE.DirectionalLight('#ffffff', 1.6);
  ol.position.set(1, 2, 1);
  oScene.add(ol);
  // mira (dentro del juego, siempre en el centro exacto de la vista)
  const crossG = new THREE.Group();
  crossG.position.z = -0.5;
  const ui = (geo, color, op = 1) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthTest: false, depthWrite: false })); m.renderOrder = 10; crossG.add(m); return m; };
  ui(new THREE.RingGeometry(0.0110, 0.0140, 64), '#1b1035', 0.45);
  ui(new THREE.RingGeometry(0.0118, 0.0132, 64), '#ffffff');
  for (const [x, y, w, h] of [[0, 0.021, 0.0014, 0.011], [0, -0.021, 0.0014, 0.011], [0.021, 0, 0.011, 0.0014], [-0.021, 0, 0.011, 0.0014]]) {
    ui(new THREE.PlaneGeometry(w + 0.0014, h + 0.0014), '#1b1035', 0.45).position.set(x, y, 0);
    ui(new THREE.PlaneGeometry(w, h), '#ffffff').position.set(x, y, 0.0001);
  }
  ui(new THREE.CircleGeometry(0.0016, 16), '#ff4d6d');
  const SEG = 64;
  const powerRing = ui(new THREE.RingGeometry(0.0192, 0.0212, SEG, 1, Math.PI / 2, Math.PI * 2), '#ffd60a');
  const powerBg = ui(new THREE.RingGeometry(0.0192, 0.0212, SEG), '#ffffff', 0.2);
  oScene.add(crossG);
  const bow = new THREE.Group();
  const bowBody = new THREE.Group();
  bow.add(bowBody);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.46, 0.02), new THREE.Vector3(0, 0.3, -0.07), new THREE.Vector3(0, 0.12, -0.13),
    new THREE.Vector3(0, 0, -0.14), new THREE.Vector3(0, -0.12, -0.13), new THREE.Vector3(0, -0.3, -0.07), new THREE.Vector3(0, -0.46, 0.02),
  ]);
  const limb = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.017, 8), new THREE.MeshStandardMaterial({ color: '#8b4513', roughness: 0.45, metalness: 0.1 }));
  bowBody.add(limb);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.11, 12), new THREE.MeshStandardMaterial({ color: ctx.color, roughness: 0.6 }));
  grip.position.set(0, 0, -0.14);
  bowBody.add(grip);
  const strGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.46, 0.02), new THREE.Vector3(0, 0, 0.02), new THREE.Vector3(0, -0.46, 0.02)]);
  const string = new THREE.Line(strGeo, new THREE.LineBasicMaterial({ color: '#ffffff' }));
  bowBody.add(string);
  const nocked = makeArrow(THREE, ctx.color, 0.5);
  bow.add(nocked);
  // el arco a la izquierda; la flecha justo debajo de la mira apuntando al centro
  const BX = -0.024, CANT = 0.45;  // agarre pegado a la flecha; arco inclinado hacia la izquierda
  bowBody.position.x = BX;
  bowBody.rotation.z = CANT;
  bow.position.set(0, -0.1, -0.5);
  nocked.scale.setScalar(0.62);
  oScene.add(bow);
  S.overlay = { scene: oScene, camera: oCam };

  let pull = 0, twang = 0;
  const arrows = [];
  let flight = null;
  let fovNow = 40, camZoom = 1;
  const addStuck = (x, y, color, k) => {
    const a = makeArrow(THREE, color, 1.4);
    const tilt = (Math.random() - 0.5) * 0.08;
    a.position.set(x, y, 0.3);
    a.rotation.set(tilt, tilt * 0.7, 0);
    target.add(a);
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.034, 12, 8), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 }));
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.036, 0.05, 24), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    halo.position.set(x, y, 0.008);
    target.add(halo);
    arrows.push(halo);
    pin.position.set(x, y, 0.012);
    target.add(pin);
    arrows.push(a, pin);
    return a;
  };

  S.start((dt, now) => {
    const R = st.R;
    if (!R) { camera.position.set(0, EYE, 0); camera.lookAt(0, CY, -18); return; }
    const sw = st.sway(now);
    // cámara: entra abierta y se cierra en la diana; al final de la ronda hace zoom
    const goalFov = (st.fov(R) * 180) / Math.PI / (st.phase === 'reveal' ? 2.1 : 1);
    const k = 1 - Math.pow(st.phase === 'intro' ? 0.25 : 0.02, dt);
    fovNow += (goalFov - fovNow) * k;
    if (Math.abs(camera.fov - fovNow) > 0.01) { camera.fov = fovNow; camera.updateProjectionMatrix(); particles.mat.uniforms.uScale.value = S.renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360)); }
    camera.position.set(0, EYE, 0);
    const lookAim = st.phase === 'reveal' || st.phase === 'intro' ? { x: 0, y: 0 } : { x: st.aim.x + sw.x, y: st.aim.y + sw.y };
    camZoom += ((st.phase === 'reveal' ? 0 : 1) - camZoom) * Math.min(1, dt * 4);
    camera.lookAt(lookAim.x * camZoom, CY + lookAim.y * camZoom, -R.d);
    // banderas
    for (const f of flags) {
      const w = st.wind;
      const sg = w < 0 ? -1 : 1, a = Math.min(1, Math.abs(w) / 4.5);
      f.piv.scale.x = sg;
      f.piv.rotation.z = -sg * (1 - a) * 1.25;
      const pos = f.cloth.geometry.attributes.position;
      const spd = 3 + Math.abs(w) * 2.2;
      for (let i = 0; i < pos.count; i++) {
        const x0 = base[i * 3], y0 = base[i * 3 + 1];
        pos.setXYZ(i, x0, y0 - x0 * 0.06 * (1 - a), Math.sin(x0 * 9 - (now / 1000) * spd) * 0.07 * (x0 / 0.75) * (0.4 + a));
      }
      pos.needsUpdate = true;
      f.cloth.geometry.computeVertexNormals();
    }
    // arco: tensar, temblar y soltar
    const goalPull = st.holding ? Math.min(1, (now - st.holdAt) / DRAW_MS) : 0;
    pull += (goalPull - pull) * Math.min(1, dt * (st.holding ? 10 : 30));
    twang = Math.max(0, twang - dt * 3);
    const zN = 0.02 + pull * 0.17 + Math.sin(now / 18) * twang * 0.03;
    const sp = strGeo.attributes.position;
    sp.setXYZ(1, -BX * Math.cos(CANT), BX * Math.sin(CANT), zN);
    sp.needsUpdate = true;
    limb.scale.set(1, 1 - pull * 0.04, 1 + pull * 0.35);
    nocked.position.set(0, 0, zN - 0.38 * 0.62);
    nocked.visible = !st.fired && st.phase !== 'reveal';
    const shake = st.holding ? 0.004 + (fatigueOf(now) - 1) * 0.006 : 0;
    bow.position.set((Math.random() - 0.5) * shake, -0.1 - pull * 0.008 + (Math.random() - 0.5) * shake, -0.5 + pull * 0.05);
    bow.visible = st.phase !== 'reveal';
    // mira y anillo de tensión
    crossG.visible = st.phase === 'aim' || st.phase === 'wait';
    const pw = st.powerAt(now);
    powerRing.geometry.setDrawRange(0, Math.round(pw * SEG) * 6);
    powerRing.material.color.set(pw >= 1 ? '#06d6a0' : '#ffd60a');
    powerBg.visible = powerRing.visible = st.holding;
    const cs = (st.holding && pw >= 1 ? 1.08 : 1);
    crossG.scale.set(cs, cs, 1);
    oCam.aspect = S.aspect;
    oCam.updateProjectionMatrix();
    // flecha en vuelo
    if (flight) {
      const f = Math.min(1, (now - flight.t0) / (flight.dur * 1000));
      const p = flight.from.clone().lerp(flight.to, f);
      p.y += Math.sin(f * Math.PI) * flight.arc;
      const p2 = flight.from.clone().lerp(flight.to, Math.min(1, f + 0.02));
      p2.y += Math.sin(Math.min(1, f + 0.02) * Math.PI) * flight.arc;
      flight.a.position.copy(p);
      flight.a.lookAt(p.clone().multiplyScalar(2).sub(p2));
      if (f >= 1) {
        scene.remove(flight.a);
        if (flight.stick) addStuck(flight.x, flight.y, flight.c);
        flight = null;
      }
    }
    sun.position.set(3, 9, -R.d + 6);
    sun.target.position.set(0, 0, -R.d);
  });
  const fatigueOf = (now) => (st.holding ? 1 + Math.min(1.6, Math.max(0, (now - st.holdAt) / 1000 - 4) * 0.55) : 1);

  return {
    newRound(R) {
      for (const a of arrows) target.remove(a);
      arrows.length = 0;
      target.position.set(0, CY, -R.d);
      for (const c of deco) c.position.set(c.userData.x, CY, -R.d);
      flags[0].g.position.set(flags[0].x, 0, -R.d + flags[0].dz);
      flags[1].g.position.set(flags[1].x, 0, -R.d + flags[1].dz);
      fovNow = 32;
      camZoom = 0;
    },
    shoot(x, y, color, dur) {
      twang = 1;
      const a = makeArrow(THREE, color, 1.4);
      scene.add(a);
      const stick = Math.abs(x) < 0.78 && Math.abs(y) < 0.78;
      const R = st.R;
      flight = {
        a, x, y, c: color, dur, stick, t0: performance.now(),
        from: new THREE.Vector3(0.05, EYE - 0.1, -0.6),
        to: stick ? new THREE.Vector3(x, CY + y, -R.d + 0.3) : new THREE.Vector3(x * 1.4, CY + y - 0.6, -R.d - 6),
        arc: R.d * 0.012,
      };
    },
    impact(x, y, s, X) {
      const p = new THREE.Vector3(x, CY + y, -st.R.d + 0.05);
      particles.burst(p.x, p.y, p.z, { n: X ? 50 : 18, color: X ? ['#ffd60a', '#ffffff', '#ff4d6d'] : ['#e9c46a', '#d4a373', '#ffffff'], speed: 0.6, up: 0.6, size: 0.05, life: 0.7, gravity: 2 });
      S.shake = 0.02;
    },
    reveal(list) {
      list.forEach((o, i) => setTimeout(() => {
        if (!st.R) return;
        addStuck(o.x, o.y, o.c);
        sfx.thunk(0.5);
      }, 250 + i * 260));
    },
    dispose: () => S.dispose(),
  };
}

// ------------------------------------------------------------------ 2D (sin WebGL)
function build2D(stage, st) {
  const cv = document.createElement('canvas');
  cv.className = 'k-3d';
  stage.prepend(cv);
  const g = cv.getContext('2d');
  const hits = [];
  let raf = 0, dead = false;
  const frame = (now) => {
    if (dead) return;
    const w = stage.clientWidth, h = stage.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#6a994e'; g.fillRect(0, 0, w, h);
    if (st.R) {
      const sc = (h / 2) / (TR / st.R.frac) / (st.phase === 'reveal' ? 0.5 : 1);
      const sw = st.sway(now);
      const ax = st.phase === 'aim' || st.phase === 'wait' ? st.aim.x + sw.x : 0, ay = st.phase === 'aim' || st.phase === 'wait' ? st.aim.y + sw.y : 0;
      const cx = w / 2 - ax * sc, cy = h / 2 + ay * sc;
      g.fillStyle = '#d4a373'; g.fillRect(cx - 0.8 * sc, cy - 0.8 * sc, 1.6 * sc, 1.6 * sc);
      const cols = ['#f8f9fa', '#f8f9fa', '#212529', '#212529', '#1e90ff', '#1e90ff', '#e63946', '#e63946', '#ffd60a', '#ffd60a'];
      for (let i = 0; i < 10; i++) { g.beginPath(); g.arc(cx, cy, TR * sc * (1 - i / 10), 0, TAU); g.fillStyle = cols[i]; g.fill(); g.strokeStyle = '#212529'; g.lineWidth = 1; g.stroke(); }
      for (const o of hits) { g.beginPath(); g.arc(cx + o.x * sc, cy - o.y * sc, Math.max(5, 0.035 * sc), 0, TAU); g.fillStyle = o.c; g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke(); }
      if (st.phase === 'aim' || st.phase === 'wait') {
        const m = w / 2, n = h / 2, rr = Math.min(w, h) * 0.032;
        g.lineWidth = 1.5; g.strokeStyle = '#fff';
        g.beginPath(); g.arc(m, n, rr, 0, TAU); g.stroke();
        g.beginPath(); g.moveTo(m, n - rr * 1.9); g.lineTo(m, n - rr * 1.1); g.moveTo(m, n + rr * 1.1); g.lineTo(m, n + rr * 1.9); g.moveTo(m - rr * 1.9, n); g.lineTo(m - rr * 1.1, n); g.moveTo(m + rr * 1.1, n); g.lineTo(m + rr * 1.9, n); g.stroke();
        const pw = st.powerAt(now);
        if (st.holding) { g.lineWidth = 5; g.strokeStyle = pw >= 1 ? '#06d6a0' : '#ffd60a'; g.beginPath(); g.arc(m, n, rr * 1.45, -Math.PI / 2, -Math.PI / 2 + pw * TAU); g.stroke(); }
      }
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return {
    newRound() { hits.length = 0; },
    shoot(x, y, c, dur) { setTimeout(() => { if (Math.abs(x) < 0.8 && Math.abs(y) < 0.8) hits.push({ x, y, c }); }, dur * 1000); },
    impact() {},
    reveal(list) { for (const o of list) hits.push(o); },
    dispose() { dead = true; cancelAnimationFrame(raf); cv.remove(); },
  };
}
