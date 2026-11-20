// 🔍 ¿Dónde está? — 5 rondas (3D). Se muestra un juguete (por ejemplo, "el
// patito amarillo") y luego una mesa llena de juguetes: hay patitos de otros
// colores y otras cosas amarillas para confundir. Tócalo lo más rápido posible;
// si tocas uno equivocado quedas bloqueado 1,5 s. Cada ronda trae más
// juguetes (de 24 a 64), hay colores parecidos (rosado/rojo, celeste/azul) y
// desde la ronda 3 la mesa gira. Gana el que menos tiempo sume.
//
// La mesa sale de la semilla (todos ven la misma). Cada jugador envía cuánto
// tardó en cada ronda y se ve en vivo quién ya lo encontró.
import { mulberry32, buzz, esc } from '../util.js';
import { sfx } from '../audio.js';
import { rich, avatarSVG, validAvatar } from '../icons.js';
import { USE_2D } from '../rt.js';

const ROUNDS = 5;
const INTRO = 2400;    // se muestra qué hay que buscar
const FIND = 10000;    // tiempo para encontrarlo
const REVEAL = 2600;   // se muestra dónde estaba
const MISS = FIND + 3000; // tiempo que cuenta si no lo encontraste
const LOCK = 1500;     // castigo por tocar uno equivocado
const COUNTS = [24, 34, 44, 54, 64];
const SPIN = [0, 0, 0.2, 0.3, 0.42];   // vueltas de la mesa (rad/s) en cada ronda
const HINT_ROUNDS = 3;  // solo hay pista en las primeras rondas
export const TR = 1.42; // radio de la mesa (redonda)
const AREA = TR - 0.2;  // radio donde caen los juguetes
const hash = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

export const KINDS = {
  duck: { n: 'patito', f: 0 },
  ball: { n: 'pelota', f: 1 },
  cube: { n: 'bloque', f: 0 },
  star: { n: 'estrella', f: 1 },
  car: { n: 'carrito', f: 0 },
  cone: { n: 'cono', f: 0 },
  donut: { n: 'dona', f: 1 },
  heart: { n: 'corazón', f: 0 },
  mush: { n: 'hongo', f: 0 },
  bear: { n: 'osito', f: 0 },
  rocket: { n: 'cohete', f: 0 },
};
export const COLS = [
  { c: '#ef233c', m: 'rojo', f: 'roja' },
  { c: '#3a86ff', m: 'azul', f: 'azul' },
  { c: '#ffd60a', m: 'amarillo', f: 'amarilla' },
  { c: '#06d6a0', m: 'verde', f: 'verde' },
  { c: '#9d4edd', m: 'morado', f: 'morada' },
  { c: '#fb8500', m: 'naranja', f: 'naranja' },
  { c: '#ff70a6', m: 'rosado', f: 'rosada' },
  { c: '#4cc9f0', m: 'celeste', f: 'celeste' },
];
// colores que se confunden fácil (para las trampas)
const NEAR = [[6, 5], [7, 4], [5], [7], [1, 6], [0, 2], [0, 4], [1, 3]];
const KIND_IDS = Object.keys(KINDS);
export const nameOf = (kind, col) => { const k = KINDS[kind], c = COLS[col]; return `${k.f ? 'la' : 'el'} ${k.n} ${k.f ? c.f : c.m}`; };

// Las 5 mesas: juguetes, posiciones y cuál es el que hay que buscar.
function plan(seed) {
  const r = mulberry32(seed ^ 0xf1d1);
  const out = [];
  let t = 0;
  const usedKinds = new Set();
  for (let k = 0; k < ROUNDS; k++) {
    let tk;
    do { tk = KIND_IDS[Math.floor(r() * KIND_IDS.length)]; } while (usedKinds.has(tk) && usedKinds.size < KIND_IDS.length);
    usedKinds.add(tk);
    const tc = Math.floor(r() * COLS.length);
    const n = COUNTS[k];
    const items = [{ kind: tk, col: tc }];
    // trampas: el mismo juguete de otro color (sobre todo de un color parecido)
    // y otros juguetes del mismo color
    const sameKind = Math.round(n * 0.26), sameCol = Math.round(n * 0.24);
    for (let i = 0; i < sameKind; i++) {
      let c;
      if (r() < 0.5) c = NEAR[tc][Math.floor(r() * NEAR[tc].length)];
      else do { c = Math.floor(r() * COLS.length); } while (c === tc);
      items.push({ kind: tk, col: c });
    }
    for (let i = 0; i < sameCol; i++) { let kd; do { kd = KIND_IDS[Math.floor(r() * KIND_IDS.length)]; } while (kd === tk); items.push({ kind: kd, col: tc }); }
    while (items.length < n) {
      const kd = KIND_IDS[Math.floor(r() * KIND_IDS.length)], c = Math.floor(r() * COLS.length);
      if (kd === tk && c === tc) continue;
      items.push({ kind: kd, col: c });
    }
    // posiciones dentro de la mesa redonda, sin encimarse mucho
    const minD = Math.sqrt((Math.PI * AREA * AREA) / n) * 0.78;
    const pos = [];
    for (const it of items) {
      let x = 0, z = 0;
      for (let tries = 0; tries < 80; tries++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * AREA;
        x = Math.cos(a) * d; z = Math.sin(a) * d;
        if (pos.every(([a2, b2]) => Math.hypot(a2 - x, b2 - z) > minD)) break;
      }
      pos.push([x, z]);
      Object.assign(it, { x, z, rot: r() * Math.PI * 2, s: 0.9 + r() * 0.2 });
    }
    // el buscado no va siempre primero en la lista
    for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
    const target = items.findIndex((it) => it.kind === tk && it.col === tc);
    const run = t + INTRO;
    out.push({ start: t, run, end: run + FIND + REVEAL, items, target, size: Math.min(1.55, 7.6 / Math.sqrt(n)), spin: SPIN[k] * (r() < 0.5 ? -1 : 1) });
    t = run + FIND + REVEAL;
  }
  return out;
}
function botMs(seed, id, k) {
  const r = mulberry32((seed ^ hash(id) ^ Math.imul(k + 5, 0x27d4eb2d)) >>> 0);
  if (r() < 0.15 + k * 0.03) return null;
  return Math.round(Math.min(FIND - 200, 1500 + Math.pow(r(), 1.3) * 6500 + k * 500));
}
const valid = (ms) => typeof ms === 'number' && isFinite(ms) && ms >= 0 && ms < FIND;
const totalOf = (arr) => Array.from({ length: ROUNDS }, (_, k) => (valid(arr && arr[k]) ? arr[k] : MISS)).reduce((a, b) => a + b, 0);

export default {
  id: 'findit',
  name: '¿Dónde está?',
  uses3d: true,
  desc: 'Se muestra un juguete (por ejemplo, el patito amarillo) y luego una mesa llena de juguetes. ¡Tócalo lo más rápido que puedas! Ojo con las trampas: si tocas uno equivocado quedas bloqueado. Cada ronda hay más juguetes, colores parecidos y desde la 3.ª la mesa gira. 5 rondas; gana el que menos tiempo sume.',
  dur: (seed) => plan(seed)[ROUNDS - 1].end,

  mount(el, ctx) {
    let webgl = false;
    try { const c = document.createElement('canvas'); webgl = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { /* nada */ }
    return run(el, ctx, !USE_2D() && webgl);
  },

  evaluate(v) {
    if (!v || !Array.isArray(v.r)) return null;
    const found = v.r.filter(valid).length;
    const tot = totalOf(v.r);
    return { score: -tot, label: `${found}/${ROUNDS} · ${(tot / 1000).toFixed(1)} s` };
  },
  bot: (r, seed, p) => ({ r: Array.from({ length: ROUNDS }, (_, k) => botMs(seed, p?.id || 'bot0', k)) }),
};

function run(el, ctx, use3d) {
  const P = plan(ctx.seed);
  const players = ctx.players || [{ id: ctx.me, n: 'Tú', c: ctx.color, a: 'frog' }];
  el.innerHTML = `
    <div class="sw gl fi">
      <div class="sw-top fi-top"></div>
      <div class="sw-stage fi-stage">
        ${use3d ? '' : '<canvas class="fi-2d"></canvas>'}
        <div class="fi-clock" hidden></div>
        <div class="gl-msg fi-msg" hidden></div>
      </div>
      <div class="gl-row">${players.map((p) => `
        <div class="gl-chip" data-id="${esc(p.id)}" style="--c:${p.c}">
          <span class="gl-av">${avatarSVG(validAvatar(p.a))}</span>
          <span class="gl-nm">${p.id === ctx.me ? 'Tú' : esc(p.n)}</span>
          <b class="gl-st">…</b>
        </div>`).join('')}</div>
      <div class="sw-res"></div>
    </div>`;
  const top = el.querySelector('.fi-top');
  const stage = el.querySelector('.fi-stage');
  const clockEl = el.querySelector('.fi-clock');
  const msgEl = el.querySelector('.fi-msg');
  const resEl = el.querySelector('.sw-res');
  const chips = Object.fromEntries([...el.querySelectorAll('.gl-chip')].map((c) => [c.dataset.id, c]));
  const my = Array(ROUNDS).fill(null);
  let k = -1;
  let view = null;
  let dead = false;
  let lockUntil = 0;
  const shown = {};

  const msOf = (p, kk, live) => {
    if (p.b) return botMs(ctx.seed, p.id, kk);
    if (p.id === ctx.me) return my[kk];
    const v = live[p.id];
    return v && Array.isArray(v.r) && typeof v.r[kk] === 'number' ? v.r[kk] : null;
  };
  const showMsg = (txt, ms = 1300) => {
    msgEl.innerHTML = rich(txt);
    msgEl.hidden = false;
    msgEl.classList.remove('pop'); void msgEl.offsetWidth; msgEl.classList.add('pop');
    clearTimeout(showMsg.t);
    if (ms) showMsg.t = setTimeout(() => { msgEl.hidden = true; }, ms);
  };

  // Reloj del juego: si todos ya lo encontraron, salta directo a mostrar dónde estaba
  // (los tiempos son de cada uno dentro de su ronda, así que saltar no cambia nada).
  let vt = 0, lastReal = performance.now();
  const clock = () => vt + (performance.now() - lastReal);

  // ---- tocar la mesa
  const tap = (e) => {
    e.preventDefault();
    if (k < 0 || my[k] !== null || !view) return;
    const R = P[k];
    const el2 = clock() - R.run;
    if (el2 < 0 || el2 >= FIND) return;
    if (clock() < lockUntil) { buzz(20); return; }
    const hit = view.pick(e.clientX, e.clientY);
    if (hit === R.target) {
      my[k] = Math.round(el2);
      ctx.submit({ r: my });
      sfx.big();
      buzz(60);
      view.found(R.target, true);
      showMsg(`{check} ¡Lo encontraste! ${(my[k] / 1000).toFixed(2)} s`, 1500);
      const c = chips[ctx.me];
      if (c) { c.classList.add('safe'); c.querySelector('.gl-st').textContent = `${(my[k] / 1000).toFixed(1)} s`; }
      stage.classList.remove('fi-lock');
      resEl.innerHTML = rich('{check} ¡Listo! Esperando a los demás…');
    } else if (hit !== null) {
      lockUntil = clock() + LOCK;
      sfx.hit(0.7);
      buzz(150);
      view.wrong(hit);
      const it = R.items[hit];
      showMsg(`{cross} Ese es ${esc(nameOf(it.kind, it.col))}`, LOCK);
      stage.classList.remove('fi-bad'); void stage.offsetWidth; stage.classList.add('fi-bad', 'fi-lock');
      clearTimeout(tap.lt);
      tap.lt = setTimeout(() => stage.classList.remove('fi-lock'), LOCK);
    }
  };
  stage.addEventListener('pointerdown', tap);

  if (use3d) {
    import('../rt3d.js').then((m) => { if (!dead) { try { view = build3D(m, stage); if (k >= 0) view.newRound(P[k], clock() >= P[k].run); } catch (e) { console.warn(e); } } });
  } else {
    view = build2D(stage.querySelector('.fi-2d'), stage);
  }

  ctx.submit({ r: my });
  let ended = false;
  const iv = setInterval(() => {
    const nowR = performance.now();
    vt += nowR - lastReal;
    lastReal = nowR;
    const t = vt;
    const nk = P.findIndex((R) => t >= R.start && t < R.end);
    if (nk !== -1 && nk !== k) {
      k = nk;
      const R = P[k];
      for (const id in shown) delete shown[id];
      const tg = R.items[R.target];
      top.innerHTML = `Ronda ${k + 1} de ${ROUNDS} · Busca <b style="--c:${COLS[tg.col].c}">${esc(nameOf(tg.kind, tg.col))}</b>`;
      resEl.textContent = '';
      clockEl.hidden = true;
      lockUntil = 0;
      for (const c of Object.values(chips)) { c.className = 'gl-chip'; c.querySelector('.gl-st').textContent = '…'; }
      showMsg(`¡Busca ${esc(nameOf(tg.kind, tg.col))}!`, INTRO - 300);
      sfx.warn();
      if (view) view.newRound(R, false);
    }
    if (k < 0) return;
    const R = P[k];
    const el2 = t - R.run;
    const live = ctx.results ? ctx.results() : {};
    if (el2 >= 0 && !R._go) { R._go = 1; sfx.go(); if (view) view.go(); clockEl.hidden = false; }
    const finding = el2 >= 0 && el2 < FIND;
    if (finding) {
      clockEl.textContent = my[k] !== null ? (my[k] / 1000).toFixed(2) : (el2 / 1000).toFixed(1);
      clockEl.classList.toggle('hot', FIND - el2 < 3000 && my[k] === null);
      // los demás que lo encuentran (en vivo)
      for (const p of players) {
        if (p.id === ctx.me) continue;
        const ms = msOf(p, k, live);
        if (!valid(ms) || ms > el2 || shown[p.id] !== undefined) continue;
        shown[p.id] = ms;
        const c = chips[p.id];
        if (c) { c.classList.add('safe'); c.querySelector('.gl-st').textContent = `${(ms / 1000).toFixed(1)} s`; }
        sfx.pass(0.5);
        if (my[k] === null) showMsg(`${esc(p.n)} ya lo encontró`, 1000);
      }
      if (k < HINT_ROUNDS && el2 >= FIND - 3000 && my[k] === null && !R._hint) { R._hint = 1; if (view) view.hint(R.target, ctx.seed + k * 977); showMsg('{sparkle} Pista: está por aquí', 1400); }
      if (FIND - el2 < 3000 && my[k] === null && Math.floor(el2 / 1000) !== R._tk) { R._tk = Math.floor(el2 / 1000); sfx.tick(1.2); }
      // ¿ya lo encontraron todos? saltar a la respuesta
      if (players.every((p) => { const ms = msOf(p, k, live); return valid(ms) && ms <= el2; })) {
        vt = R.run + FIND;
      }
    }
    if (el2 >= FIND && !R._rev) {
      R._rev = 1;
      clockEl.hidden = true;
      if (view) view.reveal(R.target);
      for (const p of players) {
        const ms = msOf(p, k, live);
        const c = chips[p.id];
        if (!c) continue;
        c.classList.toggle('safe', valid(ms));
        c.classList.toggle('boom', !valid(ms));
        c.querySelector('.gl-st').textContent = valid(ms) ? `${(ms / 1000).toFixed(1)} s` : '✖';
      }
      // el más rápido de la ronda
      let best = null, bm = Infinity;
      for (const p of players) { const ms = msOf(p, k, live); if (valid(ms) && ms < bm) { bm = ms; best = p.id; } }
      for (const [id, c] of Object.entries(chips)) c.classList.toggle('last', id === best);
      if (my[k] === null) { resEl.innerHTML = rich('{cross} ¡Se acabó el tiempo! Aquí estaba'); sfx.out(0.5); }
      else if (best === ctx.me) { resEl.innerHTML = rich(`{crown} ¡El más rápido! <b>${(my[k] / 1000).toFixed(2)} s</b>`); sfx.win(); }
      else resEl.innerHTML = rich(`{check} Lo encontraste en <b>${(my[k] / 1000).toFixed(2)} s</b>`);
    }
    if (k === ROUNDS - 1 && R._rev && el2 >= FIND + REVEAL - 500 && !ended) {
      ended = true;
      const everyone = players.every((p) => P.every((_, kk) => typeof msOf(p, kk, live) === 'number'));
      if (everyone && ctx.endEarly) ctx.endEarly();
      else resEl.innerHTML += '<br><small>Esperando a los demás…</small>';
    }
    if (view) view.tick(Math.max(0, el2));
  }, 30);

  return () => {
    dead = true;
    clearInterval(iv);
    clearTimeout(showMsg.t);
    clearTimeout(tap.lt);
    stage.removeEventListener('pointerdown', tap);
    if (view) view.dispose();
  };
}

// ---------------------------------------------------------------- 3D
// Juguetes de plástico brillante: cada uno se arma con piezas simples.
function makeToy(THREE, kind, color) {
  const g = new THREE.Group();
  const plastic = (c, extra = {}) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.2, ...extra });
  const mat = plastic(color);
  const dark = plastic('#1b1035', { roughness: 0.4 });
  const white = plastic('#ffffff');
  const light = plastic(new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.55));
  const glass = plastic('#caf0f8', { roughness: 0.1, metalness: 0.1 });
  const add = (geo, m, x = 0, y = 0, z = 0, parent = g) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = true; parent.add(me); return me; };
  const eyes = (x, y, z, gap, r, parent = g) => {
    for (const s of [-1, 1]) {
      add(new THREE.SphereGeometry(r, 10, 8), white, x, y, z + s * gap, parent);
      add(new THREE.SphereGeometry(r * 0.55, 8, 6), dark, x + r * 0.55, y + r * 0.1, z + s * gap, parent);
    }
  };
  const R = 0.1;
  if (kind === 'duck') {
    add(new THREE.SphereGeometry(R, 20, 14), mat, 0, R * 0.85, 0).scale.set(1.25, 0.85, 1);
    add(new THREE.ConeGeometry(R * 0.35, R * 0.6, 10), mat, -R * 1.15, R * 1.2, 0).rotation.z = 0.9;   // colita
    for (const s of [-1, 1]) add(new THREE.SphereGeometry(R * 0.45, 12, 8), mat, -R * 0.1, R * 0.95, s * R * 0.82).scale.set(1.4, 0.55, 0.45); // alas
    add(new THREE.SphereGeometry(R * 0.62, 18, 12), mat, R * 0.7, R * 1.8, 0);
    const beak = add(new THREE.SphereGeometry(R * 0.3, 12, 8), plastic('#fb8500'), R * 1.3, R * 1.68, 0);
    beak.scale.set(1.3, 0.45, 0.9);
    eyes(R * 1.05, R * 2.0, 0, R * 0.3, R * 0.14);
  } else if (kind === 'ball') {
    add(new THREE.SphereGeometry(R * 1.05, 24, 16), mat, 0, R * 1.05, 0);
    add(new THREE.TorusGeometry(R * 1.055, R * 0.11, 8, 32), white, 0, R * 1.05, 0).rotation.x = Math.PI / 2;
    add(new THREE.TorusGeometry(R * 1.055, R * 0.11, 8, 32), white, 0, R * 1.05, 0);
    add(new THREE.SphereGeometry(R * 0.25, 10, 8), white, 0, R * 2.07, 0).scale.set(1, 0.3, 1);
  } else if (kind === 'cube') {
    // bloque de construcción con 4 botones arriba
    const sh = new THREE.Shape();
    const h = R * 0.85, rr = R * 0.25;
    sh.moveTo(-h + rr, -h); sh.lineTo(h - rr, -h); sh.quadraticCurveTo(h, -h, h, -h + rr); sh.lineTo(h, h - rr); sh.quadraticCurveTo(h, h, h - rr, h);
    sh.lineTo(-h + rr, h); sh.quadraticCurveTo(-h, h, -h, h - rr); sh.lineTo(-h, -h + rr); sh.quadraticCurveTo(-h, -h, -h + rr, -h);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: R * 1.1, bevelEnabled: true, bevelThickness: R * 0.12, bevelSize: R * 0.1, bevelSegments: 3 });
    geo.center();
    add(geo, mat, 0, R * 0.75, 0).rotation.x = -Math.PI / 2;
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) add(new THREE.CylinderGeometry(R * 0.26, R * 0.26, R * 0.22, 16), mat, x * R * 0.45, R * 1.45, z * R * 0.45);
  } else if (kind === 'star' || kind === 'heart') {
    const sh = new THREE.Shape();
    if (kind === 'star') {
      for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? R * 0.6 : R * 1.3; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; if (i) sh.lineTo(x, y); else sh.moveTo(x, y); }
    } else {
      const s = R * 0.13;
      sh.moveTo(0, -7 * s); sh.bezierCurveTo(-11 * s, 0, -6 * s, 8 * s, 0, 4 * s); sh.bezierCurveTo(6 * s, 8 * s, 11 * s, 0, 0, -7 * s);
    }
    const geo = new THREE.ExtrudeGeometry(sh, { depth: R * 0.45, bevelEnabled: true, bevelThickness: R * 0.18, bevelSize: R * 0.14, bevelSegments: 4 });
    geo.center();
    const m = add(geo, mat, 0, R * 0.42, 0);
    m.rotation.x = -Math.PI / 2;
    // carita
    const face = new THREE.Group();
    face.position.set(0, R * 0.8, kind === 'star' ? R * 0.05 : R * 0.1);
    g.add(face);
    for (const s of [-1, 1]) {
      add(new THREE.SphereGeometry(R * 0.13, 10, 8), dark, s * R * 0.25, 0, 0, face).scale.set(1, 0.5, 1.2);
      add(new THREE.SphereGeometry(R * 0.04, 6, 6), white, s * R * 0.25 + R * 0.03, R * 0.05, -R * 0.04, face);
      add(new THREE.SphereGeometry(R * 0.1, 8, 6), plastic('#ff8fab'), s * R * 0.5, -R * 0.02, R * 0.2, face).scale.set(1, 0.3, 0.7);
    }
  } else if (kind === 'car') {
    const body = add(new THREE.BoxGeometry(R * 2.3, R * 0.65, R * 1.25), mat, 0, R * 0.62, 0);
    body.geometry = new THREE.CapsuleGeometry(R * 0.32, R * 1.6, 6, 12);
    body.rotation.z = Math.PI / 2;
    body.scale.set(1, 1, 1.9);
    add(new THREE.SphereGeometry(R * 0.62, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat, -R * 0.15, R * 0.85, 0).scale.set(1.35, 1, 0.95);
    add(new THREE.SphereGeometry(R * 0.58, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass, -R * 0.15, R * 0.9, 0).scale.set(1.3, 0.95, 0.88);
    const metal = new THREE.MeshStandardMaterial({ color: '#dee2e6', metalness: 0.8, roughness: 0.25 });
    for (const [x, z] of [[0.75, 0.62], [-0.75, 0.62], [0.75, -0.62], [-0.75, -0.62]]) {
      add(new THREE.CylinderGeometry(R * 0.34, R * 0.34, R * 0.26, 16), dark, x * R, R * 0.34, z * R).rotation.x = Math.PI / 2;
      add(new THREE.CylinderGeometry(R * 0.16, R * 0.16, R * 0.28, 12), metal, x * R, R * 0.34, z * R).rotation.x = Math.PI / 2;
    }
    for (const s of [-1, 1]) add(new THREE.SphereGeometry(R * 0.1, 8, 6), plastic('#fff3b0', { emissive: '#ffd60a', emissiveIntensity: 0.4 }), R * 1.12, R * 0.68, s * R * 0.35);
  } else if (kind === 'cone') {
    add(new THREE.BoxGeometry(R * 1.7, R * 0.16, R * 1.7), mat, 0, R * 0.08, 0);
    add(new THREE.ConeGeometry(R * 0.72, R * 2.1, 24), mat, 0, R * 1.2, 0);
    add(new THREE.CylinderGeometry(R * 0.5, R * 0.6, R * 0.32, 24), white, 0, R * 0.95, 0);
    add(new THREE.CylinderGeometry(R * 0.29, R * 0.38, R * 0.26, 24), white, 0, R * 1.55, 0);
  } else if (kind === 'donut') {
    const dough = add(new THREE.TorusGeometry(R * 0.8, R * 0.42, 16, 32), plastic('#e9b872', { clearcoat: 0.2, roughness: 0.6 }), 0, R * 0.42, 0);
    dough.rotation.x = Math.PI / 2;
    dough.scale.z = 0.85;
    const icing = add(new THREE.TorusGeometry(R * 0.8, R * 0.4, 16, 32, Math.PI * 2), mat, 0, R * 0.55, 0);
    icing.rotation.x = Math.PI / 2;
    icing.scale.set(1.02, 1.02, 0.6);
    const spr = ['#ffffff', '#ffd60a', '#4cc9f0', '#ff70a6', '#06d6a0'].map((c) => plastic(c));
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + (i % 3) * 0.2, d = R * (0.62 + (i % 4) * 0.12);
      const sp = add(new THREE.CapsuleGeometry(R * 0.04, R * 0.14, 2, 6), spr[i % spr.length], Math.cos(a) * d, R * 0.82, Math.sin(a) * d);
      sp.rotation.set(Math.PI / 2, 0, a * 3);
    }
  } else if (kind === 'mush') {
    add(new THREE.CylinderGeometry(R * 0.38, R * 0.5, R * 0.95, 16), plastic('#fff1e6'), 0, R * 0.48, 0);
    const cap = add(new THREE.SphereGeometry(R * 1.05, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat, 0, R * 0.85, 0);
    cap.scale.y = 0.85;
    for (const [x, z, y, rr] of [[0.45, 0.3, 1.5, 0.2], [-0.4, 0.45, 1.45, 0.17], [0.05, -0.55, 1.45, 0.19], [-0.15, 0, 1.72, 0.14], [0.6, -0.35, 1.25, 0.12], [-0.7, -0.2, 1.25, 0.13]]) {
      add(new THREE.SphereGeometry(R * rr, 10, 8), white, x * R, y * R, z * R).scale.y = 0.45;
    }
  } else if (kind === 'bear') {
    add(new THREE.SphereGeometry(R * 0.78, 18, 14), mat, 0, R * 0.72, 0).scale.set(1, 0.95, 0.9);
    add(new THREE.SphereGeometry(R * 0.45, 12, 10), light, R * 0.32, R * 0.7, 0).scale.set(0.6, 1, 1.1);   // panza
    add(new THREE.SphereGeometry(R * 0.6, 18, 14), mat, R * 0.1, R * 1.65, 0);
    for (const s of [-1, 1]) {
      add(new THREE.SphereGeometry(R * 0.22, 12, 10), mat, 0, R * 2.15, s * R * 0.42);
      add(new THREE.SphereGeometry(R * 0.12, 10, 8), light, R * 0.06, R * 2.15, s * R * 0.42);
      add(new THREE.SphereGeometry(R * 0.24, 12, 10), mat, R * 0.25, R * 0.25, s * R * 0.42);   // patitas
      add(new THREE.SphereGeometry(R * 0.2, 12, 10), mat, R * 0.1, R * 0.95, s * R * 0.75);    // bracitos
    }
    add(new THREE.SphereGeometry(R * 0.26, 12, 10), light, R * 0.58, R * 1.58, 0).scale.set(0.7, 0.8, 1);   // hocico
    add(new THREE.SphereGeometry(R * 0.08, 8, 6), dark, R * 0.76, R * 1.66, 0);
    for (const s of [-1, 1]) add(new THREE.SphereGeometry(R * 0.07, 8, 6), dark, R * 0.6, R * 1.82, s * R * 0.2);
  } else if (kind === 'rocket') {
    // acostado, para que se vea desde arriba
    const rk = new THREE.Group();
    rk.rotation.z = -Math.PI / 2;
    rk.position.y = R * 0.5;
    g.add(rk);
    add(new THREE.CylinderGeometry(R * 0.45, R * 0.4, R * 1.4, 20), white, 0, 0, 0, rk);
    add(new THREE.ConeGeometry(R * 0.45, R * 0.8, 20), mat, 0, R * 1.1, 0, rk);
    add(new THREE.CylinderGeometry(R * 0.42, R * 0.3, R * 0.25, 20), mat, 0, -R * 0.82, 0, rk);
    add(new THREE.CylinderGeometry(R * 0.2, R * 0.2, R * 0.06, 16), glass, 0, R * 0.25, R * 0.43, rk).rotation.x = Math.PI / 2;
    add(new THREE.TorusGeometry(R * 0.2, R * 0.05, 6, 16), mat, 0, R * 0.25, R * 0.44, rk);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
      const fin = add(new THREE.BoxGeometry(R * 0.08, R * 0.55, R * 0.45), mat, Math.cos(a) * R * 0.5, -R * 0.55, Math.sin(a) * R * 0.5, rk);
      fin.rotation.y = -a;
    }
    add(new THREE.ConeGeometry(R * 0.25, R * 0.4, 12), plastic('#ffd60a', { emissive: '#fb8500', emissiveIntensity: 0.6 }), 0, -R * 1.1, 0, rk).rotation.x = Math.PI;
  }
  return g;
}

// Textura de la mesa: tablones de madera con vetas, vista desde arriba.
function woodTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const tones = ['#b5794a', '#a86b3d', '#bb8152', '#a5683a', '#b07446', '#ad7143'];
  const pw = 512 / 6;
  for (let i = 0; i < 6; i++) {
    g.fillStyle = tones[i]; g.fillRect(i * pw, 0, pw, 512);
    for (let j = 0; j < 14; j++) {
      g.strokeStyle = `rgba(110,60,25,${0.07 + Math.random() * 0.1})`;
      g.lineWidth = 1 + Math.random() * 2.5;
      const x = i * pw + Math.random() * pw;
      g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 8, 170, x - 8, 340, x + 4, 512); g.stroke();
    }
    // nudo
    if (i % 2 === 0) { const y = 80 + Math.random() * 350, x = i * pw + pw / 2; g.strokeStyle = 'rgba(110,60,25,0.25)'; g.lineWidth = 2; for (let k = 1; k < 4; k++) { g.beginPath(); g.ellipse(x, y, k * 4, k * 9, 0, 0, Math.PI * 2); g.stroke(); } }
    g.fillStyle = 'rgba(70,35,10,0.45)'; g.fillRect(i * pw - 1, 0, 2.5, 512);
  }
  // brillo suave en el centro y bordes más oscuros
  const gr = g.createRadialGradient(256, 230, 40, 256, 256, 300);
  gr.addColorStop(0, 'rgba(255,240,215,0.18)'); gr.addColorStop(0.7, 'rgba(255,240,215,0)'); gr.addColorStop(1, 'rgba(60,25,5,0.3)');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function build3D(m, stage) {
  const { THREE, miniStage } = m;
  const S = miniStage(stage, { skyTop: '#240046', skyBottom: '#7b2cbf', hemiSky: '#fff4e6', hemiGround: '#5a189a', hemi: 0.9, sun: 2.1, fov: 36 });
  const { scene, camera, particles } = S;
  // luz cálida de lámpara sobre la mesa
  const lamp = new THREE.PointLight('#ffe8c2', 0.7, 6, 1.5);
  lamp.position.set(0, 2.2, 0.3);
  scene.add(lamp);
  // la mesa (gira en las últimas rondas) con borde y sombra en el piso
  const board = new THREE.Group();
  scene.add(board);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(TR, TR, 0.1, 72), [
    new THREE.MeshStandardMaterial({ color: '#8d5524', roughness: 0.6 }),
    new THREE.MeshStandardMaterial({ map: woodTexture(THREE), roughness: 0.55 }),
    new THREE.MeshStandardMaterial({ color: '#8d5524' }),
  ]);
  top.position.y = -0.05;
  top.receiveShadow = true;
  board.add(top);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(TR, 0.045, 12, 96), new THREE.MeshStandardMaterial({ color: '#7f4f24', roughness: 0.35, metalness: 0.1 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.0;
  board.add(rim);
  // aro dorado decorativo
  const inlay = new THREE.Mesh(new THREE.RingGeometry(TR - 0.1, TR - 0.08, 96), new THREE.MeshStandardMaterial({ color: '#ffd166', metalness: 0.6, roughness: 0.3 }));
  inlay.rotation.x = -Math.PI / 2;
  inlay.position.y = 0.002;
  board.add(inlay);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(TR * 1.12, 64), new THREE.MeshBasicMaterial({ color: '#10002b', transparent: true, opacity: 0.45, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.35;
  scene.add(shadow);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.22, 32), new THREE.MeshBasicMaterial({ color: '#ffd60a', transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  board.add(ring);
  // vitrina: el juguete buscado sobre un pedestal, inclinado hacia la cámara para verlo de lado
  const showcase = new THREE.Group();
  // la cámara mira desde arriba: se inclina hacia atrás para ver el juguete de 3/4
  showcase.rotation.x = -0.9;
  showcase.position.set(0, 0.25, -0.05);
  scene.add(showcase);
  const ped = new THREE.Group();
  showcase.add(ped);
  const pedM = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.3, clearcoat: 0.8 });
  const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.12, 48), pedM);
  p1.position.y = 0.06; p1.castShadow = true; p1.receiveShadow = true;
  ped.add(p1);
  const p2 = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.025, 10, 64), new THREE.MeshStandardMaterial({ color: '#ffd166', metalness: 0.7, roughness: 0.25 }));
  p2.rotation.x = Math.PI / 2; p2.position.y = 0.12;
  ped.add(p2);
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 64), new THREE.MeshBasicMaterial({ color: '#ffd60a', transparent: true, opacity: 0.25, depthWrite: false }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.005;
  showcase.add(halo);
  const holder = new THREE.Group();
  holder.position.y = 0.12;
  showcase.add(holder);
  const spinner = new THREE.Group();
  holder.add(spinner);

  // Cada juguete (tipo + color) se arma una sola vez y luego se clona: las copias
  // comparten geometría y materiales, así no se acumula memoria ronda tras ronda.
  const tmpl = new Map();
  const toyOf = (kind, col) => {
    const key = kind + col;
    if (!tmpl.has(key)) tmpl.set(key, makeToy(THREE, kind, COLS[col].c));
    return tmpl.get(key).clone();
  };
  const dimMats = new Map();
  const dimOf = (m) => {
    if (!dimMats.has(m)) { const d = m.clone(); d.transparent = true; d.opacity = 0.22; d.depthWrite = false; dimMats.set(m, d); }
    return dimMats.get(m);
  };
  // pista: un círculo que marca la zona (no el lugar exacto) cuando quedan 3 s
  const hint = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 48), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  hint.rotation.x = -Math.PI / 2;
  hint.position.y = 0.012;
  hint.visible = false;
  board.add(hint);

  let toys = [];
  let R = null, started = false, spin = 0, revealT = -1, hintT = -1;
  const wrongT = new Map();

  // Cámara: la más cercana con la que la mesa ENTERA (con el borde) cabe en
  // pantalla, centrada. Se recalcula solo cuando cambia el tamaño.
  const edge = [];
  for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; edge.push(new THREE.Vector3(Math.cos(a) * (TR + 0.06), 0.03, Math.sin(a) * (TR + 0.06))); }
  const pv = new THREE.Vector3();
  const cam = { a: 0, d: 5, oz: 0 };
  const place = (d, oz) => { camera.position.set(0, d * 0.94, d * 0.36 + oz); camera.lookAt(0, 0, oz); camera.updateMatrixWorld(); };
  const extent = () => { let mx = 0, lo = 9, hi = -9; for (const p of edge) { pv.copy(p).project(camera); mx = Math.max(mx, Math.abs(pv.x)); lo = Math.min(lo, pv.y); hi = Math.max(hi, pv.y); } return { mx, lo, hi }; };
  const fitCam = () => {
    if (cam.a !== S.aspect) {
      cam.a = S.aspect;
      let lo = 1, hi = 30, oz = 0;
      for (let it = 0; it < 22; it++) {
        const d = (lo + hi) / 2;
        for (let j = 0; j < 5; j++) { place(d, oz); const e = extent(); oz -= ((e.lo + e.hi) / 2) * d * 0.18; }
        place(d, oz);
        const e = extent();
        if (e.mx <= 0.96 && e.lo >= -0.9 && e.hi <= 0.9) hi = d; else lo = d;
      }
      cam.d = hi;
      for (let j = 0; j < 5; j++) { place(hi, oz); const e = extent(); oz -= ((e.lo + e.hi) / 2) * hi * 0.18; }
      cam.oz = oz;
    }
    place(cam.d, cam.oz);
  };
  fitCam();

  const clear = () => { for (const t of toys) board.remove(t); toys = []; spinner.clear(); };
  S.start((dt, now) => {
    fitCam();
    if (!R) return;
    if (started && R.spin) { spin += R.spin * dt; board.rotation.y = spin; }
    // aparición de los juguetes
    toys.forEach((t, i) => {
      const a = started ? Math.min(1, Math.max(0, (t.userData.age += dt) * 4 - i * 0.012)) : 0;
      const base = t.userData.s;
      let sc = base * (a < 1 ? 1 - Math.pow(1 - a, 3) + Math.sin(a * Math.PI) * 0.25 : 1);
      if (i === R.target && revealT >= 0) sc = base * (1.3 + Math.sin((now - revealT) / 120) * 0.25);
      const w = wrongT.get(i);
      if (w !== undefined) { const k = (now - w) / 400; if (k < 1) t.rotation.z = Math.sin(k * 30) * 0.3 * (1 - k); else { t.rotation.z = 0; wrongT.delete(i); } }
      t.scale.setScalar(Math.max(0.001, sc));
      t.visible = started;
    });
    showcase.visible = !started;
    if (!started) {
      spinner.rotation.y += dt * 1.4;
      spinner.position.y = 0.06 + Math.sin(now / 300) * 0.03;
      halo.material.opacity = 0.2 + Math.sin(now / 250) * 0.08;
    }
    if (ring.visible) { ring.scale.setScalar(1 + Math.sin(now / 150) * 0.15); }
    hint.visible = hintT >= 0 && revealT < 0;
    if (hint.visible) { const a = Math.min(1, (now - hintT) / 600); hint.material.opacity = a * (0.45 + Math.sin(now / 200) * 0.25); hint.scale.setScalar(1.6 - a * 0.6); }
  });

  // posición en pantalla de un juguete (para perdonar toques un poco afuera)
  const v3 = new THREE.Vector3();
  const screenOf = (i) => {
    const t = toys[i];
    t.getWorldPosition(v3);
    v3.y += 0.08;
    v3.project(camera);
    const r = S.renderer.domElement.getBoundingClientRect();
    return [r.left + ((v3.x + 1) / 2) * r.width, r.top + ((1 - v3.y) / 2) * r.height];
  };

  return {
    newRound(round, go) {
      clear();
      R = round;
      started = !!go;
      spin = 0; board.rotation.y = 0; ring.visible = false; revealT = -1; hintT = -1;
      wrongT.clear();
      toys = R.items.map((it, i) => {
        const t = toyOf(it.kind, it.col);
        t.position.set(it.x, 0, it.z);
        t.rotation.y = it.rot;
        // más grandes cuando hay pocos, más chicos cuando la mesa está llena
        t.userData = { idx: i, s: it.s * R.size, age: 0 };
        board.add(t);
        return t;
      });
      const tg = R.items[R.target];
      const big = toyOf(tg.kind, tg.col);
      big.scale.setScalar(3.4);
      spinner.add(big);
    },
    go() { started = true; toys.forEach((t) => { t.userData.age = 0; }); particles.burst(0, 0.3, 0, { n: 30, color: ['#ffffff', '#ffd60a'], speed: 1, up: 0.8, size: 0.04, life: 0.6, gravity: 1 }); },
    tick() {},
    pick(x, y) {
      if (!started || !toys.length) return null;
      const hit = S.pick(x, y, toys);
      let o = hit;
      while (o && o.userData.idx === undefined) o = o.parent;
      const idx = o ? o.userData.idx : null;
      // perdonar un toque muy cerca del buscado (en el celular los juguetes son chicos)
      const [sx, sy] = screenOf(R.target);
      if (Math.hypot(sx - x, sy - y) < 18) return R.target;
      return idx;
    },
    found(i) {
      const t = toys[i];
      t.getWorldPosition(v3);
      particles.burst(v3.x, 0.2, v3.z, { n: 40, color: ['#ffd60a', '#06d6a0', '#ffffff'], speed: 0.9, up: 1.2, size: 0.04, life: 0.8, gravity: 2 });
      ring.position.set(R.items[i].x, 0.01, R.items[i].z);
      ring.visible = true;
    },
    wrong(i) { wrongT.set(i, performance.now()); S.shake = 0.02; },
    hint(i, seed) {
      if (hintT >= 0 || !R) return;
      hintT = performance.now();
      // el centro de la pista se corre un poco al azar (pero el juguete siempre queda adentro)
      const a = (seed % 628) / 100, d = 0.12 + (seed % 7) * 0.025;
      hint.position.x = R.items[i].x + Math.cos(a) * d;
      hint.position.z = R.items[i].z + Math.sin(a) * d;
    },
    reveal(i) {
      revealT = performance.now();
      // los demás juguetes se apagan para que se vea dónde estaba
      toys.forEach((t, j) => { if (j !== i) t.traverse((o) => { if (o.isMesh) { o.material = dimOf(o.material); o.castShadow = false; } }); });
      ring.position.set(R.items[i].x, 0.01, R.items[i].z);
      ring.visible = true;
      const t = toys[i];
      t.getWorldPosition(v3);
      particles.burst(v3.x, 0.25, v3.z, { n: 24, color: ['#ffd60a', '#ffffff'], speed: 0.6, up: 1, size: 0.035, life: 0.7, gravity: 1.5 });
    },
    dispose: () => {
      for (const t of tmpl.values()) t.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      for (const m of dimMats.values()) m.dispose();
      S.dispose();
    },
  };
}

// ---------------------------------------------------------------- 2D (sin WebGL)
function build2D(canvas, stage) {
  const g = canvas.getContext('2d');
  let W = 300, H = 400;
  const fit = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = stage.clientWidth; H = stage.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(stage);
  let R = null, started = false, el = 0, revealIdx = -1, foundIdx = -1, hintIdx = -1, raf = 0;
  const sc = () => Math.min(W, H) / (2 * (TR + 0.12));
  const P = (x, z) => [W / 2 + x * sc(), H / 2 + z * sc()];
  const shape = (kind, color, x, y, r) => {
    g.fillStyle = color; g.strokeStyle = '#1b1035'; g.lineWidth = 2;
    g.beginPath();
    if (kind === 'ball' || kind === 'duck') g.arc(x, y, r, 0, Math.PI * 2);
    else if (kind === 'cube' || kind === 'car') g.rect(x - r, y - r * (kind === 'car' ? 0.6 : 1), r * 2, r * (kind === 'car' ? 1.2 : 2));
    else if (kind === 'cone') { g.moveTo(x, y - r * 1.2); g.lineTo(x + r, y + r); g.lineTo(x - r, y + r); g.closePath(); }
    else if (kind === 'star') { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r * 1.15; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); }
    else if (kind === 'heart') { g.moveTo(x, y + r); g.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.3, x, y - r * 0.4); g.bezierCurveTo(x + r * 0.6, y - r * 1.3, x + r * 1.6, y - r * 0.2, x, y + r); }
    else if (kind === 'donut') { g.arc(x, y, r, 0, Math.PI * 2); g.moveTo(x + r * 0.45, y); g.arc(x, y, r * 0.45, 0, Math.PI * 2, true); }
    else if (kind === 'mush') { g.arc(x, y, r, Math.PI, 0); g.closePath(); }
    else if (kind === 'bear') { g.arc(x, y + r * 0.3, r * 0.75, 0, Math.PI * 2); g.moveTo(x + r * 0.6, y - r * 0.5); g.arc(x, y - r * 0.5, r * 0.6, 0, Math.PI * 2); g.moveTo(x - r * 0.3, y - r * 1.05); g.arc(x - r * 0.5, y - r * 1.05, r * 0.22, 0, Math.PI * 2); g.moveTo(x + r * 0.72, y - r * 1.05); g.arc(x + r * 0.5, y - r * 1.05, r * 0.22, 0, Math.PI * 2); }
    else if (kind === 'rocket') { g.moveTo(x + r * 1.3, y); g.lineTo(x + r * 0.5, y - r * 0.5); g.lineTo(x - r, y - r * 0.5); g.lineTo(x - r * 1.3, y - r * 0.9); g.lineTo(x - r * 1.1, y); g.lineTo(x - r * 1.3, y + r * 0.9); g.lineTo(x - r, y + r * 0.5); g.lineTo(x + r * 0.5, y + r * 0.5); g.closePath(); }
    g.fill(kind === 'donut' ? 'evenodd' : 'nonzero'); g.stroke();
    if (kind === 'rocket') { g.fillStyle = '#caf0f8'; g.beginPath(); g.arc(x + r * 0.1, y, r * 0.25, 0, Math.PI * 2); g.fill(); g.stroke(); }
    if (kind === 'cube') { g.fillStyle = color; for (const [dx, dy] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) { g.beginPath(); g.arc(x + dx * r, y + dy * r, r * 0.25, 0, Math.PI * 2); g.fill(); g.stroke(); } }
    if (kind === 'duck') { g.beginPath(); g.arc(x + r * 0.6, y - r * 0.6, r * 0.55, 0, Math.PI * 2); g.fill(); g.stroke(); g.fillStyle = '#fb8500'; g.fillRect(x + r * 1.05, y - r * 0.7, r * 0.5, r * 0.25); }
    if (kind === 'mush') { g.fillStyle = '#fff'; g.fillRect(x - r * 0.3, y, r * 0.6, r * 0.7); g.strokeRect(x - r * 0.3, y, r * 0.6, r * 0.7); }
    if (kind === 'car') { g.fillStyle = '#2b2d42'; g.beginPath(); g.arc(x - r * 0.6, y + r * 0.6, r * 0.3, 0, Math.PI * 2); g.arc(x + r * 0.6, y + r * 0.6, r * 0.3, 0, Math.PI * 2); g.fill(); }
  };
  const draw = (now) => {
    g.fillStyle = '#5a189a'; g.fillRect(0, 0, W, H);
    if (R) {
      g.fillStyle = '#7f4f24'; g.beginPath(); g.arc(W / 2, H / 2, (TR + 0.05) * sc(), 0, Math.PI * 2); g.fill();
      g.fillStyle = '#b07446'; g.beginPath(); g.arc(W / 2, H / 2, TR * sc(), 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ffd166'; g.lineWidth = 2; g.beginPath(); g.arc(W / 2, H / 2, (TR - 0.09) * sc(), 0, Math.PI * 2); g.stroke();
      const r = sc() * 0.075 * R.size;
      if (!started) { const t = R.items[R.target]; shape(t.kind, COLS[t.col].c, W / 2, H / 2, r * 3.5); }
      else R.items.forEach((it, i) => {
        const [x, y] = P(it.x, it.z);
        g.globalAlpha = revealIdx >= 0 && i !== revealIdx ? 0.25 : 1;
        if (i === hintIdx && revealIdx < 0) { g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 3; g.beginPath(); g.arc(x + r * 1.2, y - r, r * 5, 0, Math.PI * 2); g.stroke(); }
        if ((i === revealIdx || i === foundIdx)) { g.strokeStyle = '#ffd60a'; g.lineWidth = 4; g.beginPath(); g.arc(x, y, r * (1.8 + Math.sin(now / 150) * 0.2), 0, Math.PI * 2); g.stroke(); }
        shape(it.kind, COLS[it.col].c, x, y, r * it.s);
        g.globalAlpha = 1;
      });
    }
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
  return {
    newRound(round, go) { R = round; started = !!go; revealIdx = foundIdx = hintIdx = -1; },
    hint(i) { hintIdx = i; },
    go() { started = true; },
    tick(e) { el = e; void el; },
    pick(cx, cy) {
      if (!started || !R) return null;
      const rc = canvas.getBoundingClientRect();
      const x = cx - rc.left, y = cy - rc.top;
      let best = null, bd = sc() * 0.13 * R.size;
      R.items.forEach((it, i) => { const [px, py] = P(it.x, it.z); const d = Math.hypot(px - x, py - y) - (i === R.target ? 8 : 0); if (d < bd) { bd = d; best = i; } });
      return best;
    },
    found(i) { foundIdx = i; },
    wrong() {},
    reveal(i) { revealIdx = i; },
    dispose() { cancelAnimationFrame(raf); ro.disconnect(); },
  };
}
