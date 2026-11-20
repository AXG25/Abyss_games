// 🎈 Gallina — 3 rondas (3D). Un globo se infla y su premio sube cada vez más
// rápido. Toca ¡ME PLANTO! para quedarte con lo que vale en ese momento… pero
// si explota antes, te quedas sin nada. El ÚLTIMO en plantarse antes de que
// explote gana el doble. Nadie sabe cuándo va a explotar.
//
// Todo el reloj sale de la semilla (cuándo explota cada globo, los sustos y las
// jugadas de los bots); cada jugador envía en qué momento se plantó y se ve en
// vivo en los teléfonos de los demás.
import { mulberry32, buzz, esc } from '../util.js';
import { sfx } from '../audio.js';
import { rich, avatarSVG, validAvatar } from '../icons.js';
import { USE_2D } from '../rt.js';

const ROUNDS = 3;
const INTRO = 2200;    // anuncio de la ronda
const REVEAL = 3600;   // ver quién se salvó
const hash = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

// premio según el tiempo inflando (crece cada vez más rápido)
export const value = (ms) => { const s = Math.max(0, ms) / 1000; return Math.round(5 + 4 * s + 0.6 * s * s); };

function plan(seed) {
  const r = mulberry32(seed ^ 0xc41c);
  const out = [];
  let t = 0;
  for (let k = 0; k < ROUNDS; k++) {
    const pop = Math.round((3.5 + 9.5 * Math.pow(r(), 1.25)) * 1000);
    // sustos: el globo cruje y tiembla aunque no vaya a explotar
    const scares = [];
    for (let s = 1500 + r() * 2000; s < pop - 600; s += 1800 + r() * 2600) scares.push(Math.round(s));
    const run = t + INTRO;
    out.push({ start: t, run, pop, popAt: run + pop, end: run + pop + REVEAL, scares });
    t = run + pop + REVEAL;
  }
  return out;
}
function botMs(seed, id, k, pop) {
  const r = mulberry32((seed ^ hash(id) ^ Math.imul(k + 3, 0x9e3779b1)) >>> 0);
  const brave = 0.62 + r() * 0.5;      // > 1: se arriesga de más y explota
  const indep = 2200 + r() * 9000;     // lo que haría sin saber nada
  return Math.round(Math.max(900, Math.min(indep, pop * brave)));
}
const validMs = (ms, pop) => typeof ms === 'number' && isFinite(ms) && ms >= 0 && ms < pop;

// Puntos de una ronda: lo que valía al plantarse; el último en plantarse, el doble.
function roundScores(msById, pop) {
  const pts = {};
  let lastId = null, lastMs = -1;
  for (const [id, ms] of Object.entries(msById)) {
    if (!validMs(ms, pop)) { pts[id] = 0; continue; }
    pts[id] = value(ms);
    if (ms > lastMs) { lastMs = ms; lastId = id; }
  }
  if (lastId) pts[lastId] *= 2;
  return { pts, lastId };
}

export default {
  id: 'chicken',
  name: 'Gallina',
  uses3d: true,
  desc: 'Un globo se infla y su premio sube cada vez más rápido. Toca ¡ME PLANTO! para quedarte con lo que vale… pero si explota antes, te quedas sin nada. El último en plantarse antes de que explote gana el DOBLE. 3 rondas.',
  dur: (seed) => plan(seed)[ROUNDS - 1].end,

  mount(el, ctx) {
    let webgl = false;
    try { const c = document.createElement('canvas'); webgl = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { /* nada */ }
    return run(el, ctx, !USE_2D() && webgl);
  },

  evaluateAll(vals, seed) {
    const P = plan(seed);
    const tot = Object.fromEntries(Object.keys(vals).map((id) => [id, 0]));
    P.forEach((R, k) => {
      const ms = {};
      for (const [id, v] of Object.entries(vals)) ms[id] = v && Array.isArray(v.r) ? v.r[k] : null;
      const { pts } = roundScores(ms, R.pop);
      for (const id of Object.keys(tot)) tot[id] += pts[id] || 0;
    });
    const out = {};
    for (const [id, v] of Object.entries(vals)) out[id] = v ? { score: tot[id], label: `{star} ${tot[id]} puntos` } : null;
    return out;
  },
  evaluate(v, seed) {
    if (!v || !Array.isArray(v.r)) return null;
    const P = plan(seed);
    const s = P.reduce((a, R, k) => a + (validMs(v.r[k], R.pop) ? value(v.r[k]) : 0), 0);
    return { score: s, label: `{star} ${s} puntos` };
  },
  bot: (r, seed, p) => ({ r: plan(seed).map((R, k) => botMs(seed, p?.id || 'bot0', k, R.pop)) }),
};

function run(el, ctx, use3d) {
  const P = plan(ctx.seed);
  const players = ctx.players || [{ id: ctx.me, n: 'Tú', c: ctx.color, a: 'frog' }];
  el.innerHTML = `
    <div class="sw gl">
      <div class="sw-top"></div>
      <div class="sw-stage gl-stage">
        <div class="gl-val"><small>Premio</small><b>0</b></div>
        ${use3d ? '' : '<div class="gl-balloon2d"></div>'}
        <div class="gl-msg" hidden></div>
      </div>
      <div class="gl-row">${players.map((p) => `
        <div class="gl-chip" data-id="${esc(p.id)}" style="--c:${p.c}">
          <span class="gl-av">${avatarSVG(validAvatar(p.a))}</span>
          <span class="gl-nm">${p.id === ctx.me ? 'Tú' : esc(p.n)}</span>
          <b class="gl-st">…</b>
        </div>`).join('')}</div>
      <div class="sw-res"></div>
      <button class="g-stop-btn sw-btn gl-btn" style="--c:${ctx.color}">¡ME<br>PLANTO!</button>
    </div>`;
  const top = el.querySelector('.sw-top');
  const stage = el.querySelector('.gl-stage');
  const valEl = el.querySelector('.gl-val b');
  const valBox = el.querySelector('.gl-val');
  const msgEl = el.querySelector('.gl-msg');
  const resEl = el.querySelector('.sw-res');
  const btn = el.querySelector('.gl-btn');
  const b2d = el.querySelector('.gl-balloon2d');
  const chips = Object.fromEntries([...el.querySelectorAll('.gl-chip')].map((c) => [c.dataset.id, c]));
  const t0 = performance.now();
  const my = [null, null, null];
  let k = -1;
  let view = null;
  let dead = false;
  const shown = {}; // id → ms ya mostrado en esta ronda

  const msOf = (p, kk, live) => {
    if (p.b) return botMs(ctx.seed, p.id, kk, P[kk].pop);
    if (p.id === ctx.me) return my[kk];
    const v = live[p.id];
    return v && Array.isArray(v.r) && typeof v.r[kk] === 'number' ? v.r[kk] : null;
  };
  const showMsg = (txt, ms = 1400) => {
    msgEl.innerHTML = rich(txt);
    msgEl.hidden = false;
    msgEl.classList.remove('pop'); void msgEl.offsetWidth; msgEl.classList.add('pop');
    clearTimeout(showMsg.t);
    if (ms) showMsg.t = setTimeout(() => { msgEl.hidden = true; }, ms);
  };

  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (k < 0 || my[k] !== null) return;
    const R = P[k];
    const el2 = performance.now() - t0 - R.run;
    if (el2 < 0 || el2 >= R.pop) return;
    my[k] = Math.round(el2);
    ctx.submit({ r: my });
    sfx.coin();
    buzz(60);
    btn.disabled = true;
    btn.innerHTML = `✋ ${value(my[k])}`;
    if (view) view.plant(players.findIndex((p) => p.id === ctx.me));
  });

  if (use3d) {
    import('../rt3d.js').then((m) => { if (!dead) { try { view = build(m, stage, players); } catch (e) { console.warn(e); } } });
  }

  // quien nunca se planta también participa (con 0 puntos), no "sin jugar"
  ctx.submit({ r: my });
  let lastCreak = 0;
  const iv = setInterval(() => {
    const t = performance.now() - t0;
    const nk = P.findIndex((R) => t >= R.start && t < R.end);
    if (nk !== -1 && nk !== k) {
      k = nk;
      for (const id in shown) delete shown[id];
      top.innerHTML = rich(`Ronda ${k + 1} de ${ROUNDS} · el último en plantarse gana <b>×2</b>`);
      resEl.textContent = '';
      btn.disabled = true;
      btn.innerHTML = '¡ME<br>PLANTO!';
      valBox.classList.remove('dead', 'hot');
      valEl.textContent = value(0);
      for (const c of Object.values(chips)) { c.className = 'gl-chip'; c.querySelector('.gl-st').textContent = '…'; }
      showMsg(`Ronda ${k + 1}`, 1600);
      sfx.warn();
      if (view) view.newRound();
    }
    if (k < 0) return;
    const R = P[k];
    const el2 = t - R.run;
    const live = ctx.results ? ctx.results() : {};
    // ¡a inflar!
    if (el2 >= 0 && !R._go) { R._go = 1; sfx.go(); if (my[k] === null) btn.disabled = false; showMsg('¡Infla!', 700); }
    const inflating = el2 >= 0 && el2 < R.pop;
    if (inflating) {
      const v = value(el2);
      valEl.textContent = v;
      valBox.classList.toggle('hot', el2 > 7000);
      // sonido de inflado cada vez más seguido
      if (t - lastCreak > Math.max(180, 700 - el2 / 20)) { lastCreak = t; sfx.tick(0.5 + Math.min(1, el2 / 10000)); }
      for (const s of R.scares) if (el2 >= s && !R['s' + s]) { R['s' + s] = 1; sfx.crack(0.8); buzz(30); if (view) view.scare(); }
      // los demás que se plantan (en vivo)
      let lastId = null, lastMs = -1;
      for (const p of players) {
        const ms = msOf(p, k, live);
        if (typeof ms !== 'number' || ms > el2) continue;
        if (ms > lastMs) { lastMs = ms; lastId = p.id; }
        if (shown[p.id] === undefined) {
          shown[p.id] = ms;
          const c = chips[p.id];
          if (c) { c.classList.add('safe'); c.querySelector('.gl-st').textContent = `✋ ${value(ms)}`; }
          if (p.id !== ctx.me) { sfx.pass(0.5); showMsg(`${esc(p.n)} se plantó con ${value(ms)}`, 1300); if (view) view.plant(players.indexOf(p)); }
        }
      }
      for (const [id, c] of Object.entries(chips)) c.classList.toggle('last', id === lastId);
    }
    if (view) view.tick(Math.max(0, Math.min(el2, R.pop)), el2 >= R.pop);
    if (b2d) b2d.style.setProperty('--s', String(0.35 + Math.min(1, Math.max(0, el2) / 13000) * 0.85));
    // ¡BUM!
    if (el2 >= R.pop && !R._pop) {
      R._pop = 1;
      btn.disabled = true;
      sfx.boom(1);
      buzz(300);
      valBox.classList.add('dead');
      valEl.textContent = '¡BUM!';
      if (b2d) b2d.classList.add('popped');
      if (view) view.pop();
      if (my[k] === null) btn.innerHTML = '💥';
    }
    // resultados de la ronda
    if (el2 >= R.pop + 500 && !R._rev) {
      R._rev = 1;
      const ms = {};
      for (const p of players) ms[p.id] = msOf(p, k, live);
      const { pts, lastId } = roundScores(ms, R.pop);
      for (const p of players) {
        const c = chips[p.id];
        if (!c) continue;
        const ok = validMs(ms[p.id], R.pop);
        c.classList.toggle('safe', ok);
        c.classList.toggle('boom', !ok);
        c.classList.toggle('last', p.id === lastId);
        c.querySelector('.gl-st').textContent = ok ? `+${pts[p.id]}${p.id === lastId ? ' ×2' : ''}` : '💥 0';
      }
      const mine = pts[ctx.me] || 0;
      if (!validMs(my[k], R.pop)) { resEl.innerHTML = rich('{bomb} ¡Te explotó en la cara! 0 puntos'); sfx.out(0.6); }
      else if (lastId === ctx.me) { resEl.innerHTML = rich(`{crown} ¡El más valiente! <b>${mine}</b> puntos (×2)`); sfx.big(); }
      else resEl.innerHTML = rich(`{check} Te salvaste con <b>${mine}</b> puntos`);
    }
  }, 30);

  return () => {
    dead = true;
    clearInterval(iv);
    clearTimeout(showMsg.t);
    if (view) view.dispose();
  };
}

// ---------------------------------------------------------------- 3D
function build(m, stage, players) {
  const { THREE, miniStage } = m;
  const S = miniStage(stage, { skyTop: '#ff9e00', skyBottom: '#ff006e', hemiGround: '#7b2cbf', fov: 40 });
  const { scene, camera, particles } = S;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(5, 48), new THREE.MeshStandardMaterial({ color: '#9d4edd', roughness: 0.6 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.9;
  floor.receiveShadow = true;
  scene.add(floor);
  // pedestal con inflador
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.3, 32), new THREE.MeshStandardMaterial({ color: '#ffd60a', roughness: 0.4 }));
  ped.position.y = -0.75;
  ped.castShadow = true;
  ped.receiveShadow = true;
  scene.add(ped);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.28, 12), new THREE.MeshStandardMaterial({ color: '#2b2d42', metalness: 0.5, roughness: 0.3 }));
  nozzle.position.y = -0.5;
  scene.add(nozzle);
  // el globo
  const bal = new THREE.Group();
  scene.add(bal);
  const mat = new THREE.MeshStandardMaterial({ color: '#4cc9f0', roughness: 0.18, metalness: 0.05, emissive: '#000000' });
  const skin = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), mat);
  skin.scale.set(1, 1.15, 1);
  skin.castShadow = true;
  bal.add(skin);
  const shine = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55 }));
  shine.position.set(-0.4, 0.55, 0.72);
  shine.scale.set(1, 1.5, 0.4);
  bal.add(shine);
  const knot = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 12), mat);
  knot.position.y = -1.2;
  bal.add(knot);
  // fichas de los jugadores alrededor (saltan al plantarse)
  const tokens = players.map((p, i) => {
    const g = new THREE.Group();
    g.position.set((i - (players.length - 1) / 2) * 0.38, -0.9, 0.65);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.08, 4, 10), new THREE.MeshStandardMaterial({ color: p.c, roughness: 0.4 }));
    body.position.y = 0.12;
    body.castShadow = true;
    g.add(body);
    scene.add(g);
    return { g, body, jump: 0 };
  });
  const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
  scene.add(flash);

  const fitCam = () => {
    const vf = Math.tan((camera.fov * Math.PI) / 360);
    const dist = Math.max(1.25 / (vf * S.aspect), 1.25 / vf);
    camera.position.set(0, 0.15, dist);
    camera.lookAt(0, -0.05, 0);
  };
  fitCam();

  let el = 0, popped = false, scareT = 0, flashT = 1, rad = 0.2;
  S.start((dt, now) => {
    fitCam();
    const s = el / 1000;
    const target = 0.2 + Math.min(1, s / 13) * 0.52;
    rad += (target - rad) * Math.min(1, dt * 8);
    scareT = Math.max(0, scareT - dt);
    const wob = 0.004 + Math.min(1, s / 12) * 0.02 + scareT * 0.08;
    bal.visible = !popped;
    bal.scale.setScalar(rad);
    bal.position.set(Math.sin(now / 37) * wob, -0.36 + rad * 1.38 + Math.sin(now / 600) * 0.015, 0);
    bal.rotation.z = Math.sin(now / 900) * 0.06 + Math.sin(now / 41) * scareT * 0.15;
    // de celeste a amarillo y luego a rojo, a medida que se pone peligroso
    const kcol = Math.min(1, s / 12);
    mat.color.setHSL((0.53 - kcol * 0.53 + 1) % 1, 0.9, 0.55 - kcol * 0.05);
    mat.emissive.setRGB(scareT * 0.6, 0, 0);
    flashT += dt;
    flash.material.opacity = Math.max(0, 0.85 - flashT * 3);
    flash.scale.setScalar(0.3 + flashT * 3);
    flash.position.copy(bal.position);
    for (const tk of tokens) {
      tk.jump = Math.max(0, tk.jump - dt * 2.2);
      tk.body.position.y = 0.12 + Math.sin(tk.jump * Math.PI) * 0.18;
    }
  });

  return {
    newRound() { popped = false; el = 0; rad = 0.2; },
    tick(e) { el = e; },
    scare() { scareT = 0.5; particles.burst(bal.position.x, bal.position.y - rad, 0.2, { n: 6, color: ['#ffffff'], speed: 0.3, up: 0.2, size: 0.03, life: 0.4, gravity: 0 }); },
    plant(i) {
      const tk = tokens[i];
      if (!tk) return;
      tk.jump = 1;
      particles.burst(tk.g.position.x, -0.6, tk.g.position.z, { n: 14, color: [players[i].c, '#ffffff', '#ffd60a'], speed: 0.4, up: 0.9, size: 0.04, life: 0.6, gravity: 2 });
    },
    pop() {
      popped = true;
      flashT = 0;
      S.shake = 0.06;
      const p = bal.position;
      particles.burst(p.x, p.y, p.z, { n: 70, color: [mat.color.getStyle(), mat.color.getStyle(), '#ffffff'], speed: 2.2, up: 1.2, size: 0.07, life: 1, gravity: 2.5 });
      particles.burst(p.x, p.y, p.z, { n: 50, color: ['#ffd60a', '#06d6a0', '#3a86ff', '#ff4d6d'], speed: 1.4, up: 1.6, size: 0.045, life: 1.6, gravity: 1.2 });
    },
    dispose: () => S.dispose(),
  };
}
