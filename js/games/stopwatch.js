// ⏱️ Para en… — 3 rondas (3D). En cada ronda toca una meta distinta (de 1 a 10
// segundos). El cronómetro arranca, se tapa y tienes que tocar PARAR cuando
// creas que pasó justo ese tiempo. Gana el que menos se aleje en total.
import { mulberry32, buzz } from '../util.js';
import { sfx } from '../audio.js';
import { rich } from '../icons.js';
import { USE_2D } from '../rt.js';

const ROUNDS = 3;
const INTRO = 1900;    // anuncio de la meta
const EXTRA = 3000;    // tiempo de más después de la meta para poder parar
const REVEAL = 2600;   // ver los resultados de la ronda
const hash = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

function plan(seed) {
  const r = mulberry32(seed ^ 0x5709);
  const used = new Set();
  const out = [];
  let t = 0;
  for (let k = 0; k < ROUNDS; k++) {
    let tg;
    do { tg = 1 + Math.floor(r() * 10); } while (used.has(tg) && used.size < 10);
    used.add(tg);
    const run = t + INTRO;
    const visible = Math.min(1500, tg * 1000 * 0.35); // se ve un ratito y se tapa
    out.push({ target: tg, start: t, run, hideAt: run + visible, stopBy: run + tg * 1000 + EXTRA, end: run + tg * 1000 + EXTRA + REVEAL });
    t = run + tg * 1000 + EXTRA + REVEAL;
  }
  return out;
}
function botMs(seed, id, k, target) {
  const r = mulberry32((seed ^ hash(id) ^ Math.imul(k + 7, 0x85ebca6b)) >>> 0);
  return Math.round(target * 1000 + (r() + r() + r() - 1.5) * (500 + target * 90));
}
const diffOf = (ms, target) => (typeof ms === 'number' ? Math.abs(ms - target * 1000) : 5000);

export default {
  id: 'stopwatch',
  name: 'Para en…',
  uses3d: true,
  desc: '3 rondas: en cada una te toca un tiempo distinto (de 1 a 10 segundos). El cronómetro arranca y se tapa: toca PARAR cuando creas que pasó justo ese tiempo. Gana el más preciso.',
  dur: (seed) => plan(seed)[ROUNDS - 1].end,

  mount(el, ctx) {
    let webgl = false;
    try { const c = document.createElement('canvas'); webgl = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { /* nada */ }
    return run(el, ctx, !USE_2D() && webgl && !!ctx.players);
  },

  evaluate(v, seed) {
    if (!v || !Array.isArray(v.r)) return null;
    const P = plan(seed);
    const tot = P.reduce((a, R, k) => a + diffOf(v.r[k], R.target), 0);
    return { score: -tot, label: `±${(tot / ROUNDS / 1000).toFixed(2)} s promedio` };
  },

  bot: (r, seed, p) => ({ r: plan(seed).map((R, k) => botMs(seed, p?.id || 'bot0', k, R.target)) }),
};

function run(el, ctx, use3d) {
  const P = plan(ctx.seed);
  el.innerHTML = `
    <div class="sw">
      <div class="sw-top"></div>
      <div class="sw-stage">${use3d ? '' : '<div class="g-stop-clock">0.00</div>'}</div>
      <div class="sw-res"></div>
      <button class="g-stop-btn sw-btn" style="--c:${ctx.color}">PARAR</button>
    </div>`;
  const top = el.querySelector('.sw-top');
  const stage = el.querySelector('.sw-stage');
  const resEl = el.querySelector('.sw-res');
  const btn = el.querySelector('.sw-btn');
  const clock2d = el.querySelector('.g-stop-clock');
  const t0 = performance.now();
  const my = [null, null, null];
  let k = -1;
  let view = null;
  let dead = false;

  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (k < 0 || my[k] !== null) return;
    const t = performance.now() - t0;
    const R = P[k];
    if (t < R.run || t > R.stopBy) return;
    my[k] = Math.round(t - R.run);
    ctx.submit({ r: my });
    sfx.click();
    buzz(40);
    btn.disabled = true;
    btn.textContent = '¡Listo!';
    if (view) view.stopMine(my[k]);
  });

  if (use3d) {
    import('../rt3d.js').then((m) => { if (!dead) { try { view = build(m, stage, ctx); } catch (e) { console.warn(e); } } });
  }

  let lastTick = 0;
  const iv = setInterval(() => {
    const t = performance.now() - t0;
    const nk = P.findIndex((R) => t >= R.start && t < R.end);
    if (nk !== -1 && nk !== k) {
      k = nk;
      const R = P[k];
      top.innerHTML = rich(`Ronda ${k + 1} de ${ROUNDS}: ¡para en <b>${R.target} ${R.target === 1 ? 'segundo' : 'segundos'}</b>!`);
      resEl.textContent = '';
      btn.disabled = false;
      btn.textContent = 'PARAR';
      sfx.warn();
      if (view) view.newRound(R);
    }
    if (k < 0) return;
    const R = P[k];
    const el2 = t - R.run;
    if (el2 >= 0 && el2 < 60 && !R._go) { R._go = 1; sfx.go(); }
    if (el2 >= 0 && t < R.stopBy && my[k] === null && t - lastTick > 1000 && t < R.hideAt) { lastTick = t; sfx.tick(0.8); }
    if (t >= R.hideAt && !R._hid) { R._hid = 1; sfx.whoosh(0.6); }
    if (clock2d) {
      if (el2 < 0) clock2d.textContent = '0.00';
      else if (my[k] !== null) clock2d.textContent = (my[k] / 1000).toFixed(2);
      else clock2d.textContent = t < R.hideAt ? (el2 / 1000).toFixed(2) : '?.??';
    }
    if (view) view.tick(el2, t >= R.hideAt && t < R.stopBy && my[k] === null);
    // fin de la ronda: mostrar a todos
    if (t >= R.stopBy && !R._rev) {
      R._rev = 1;
      const res = {};
      const live = ctx.results ? ctx.results() : {};
      for (const p of ctx.players || []) {
        if (p.b) res[p.id] = botMs(ctx.seed, p.id, k, R.target);
        else if (p.id === ctx.me) res[p.id] = my[k];
        else res[p.id] = live[p.id] && Array.isArray(live[p.id].r) ? live[p.id].r[k] : null;
      }
      if (!ctx.players) res.me = my[k];
      const d = diffOf(my[k], R.target);
      resEl.innerHTML = my[k] === null ? 'No paraste a tiempo' : rich(`Paraste en <b>${(my[k] / 1000).toFixed(2)} s</b> · ${d < 150 ? '{star} ¡Clavado!' : `te alejaste ${(d / 1000).toFixed(2)} s`}`);
      if (d < 150) sfx.big(); else sfx.ready();
      btn.disabled = true;
      if (view) view.reveal(res, R);
    }
  }, 30);

  return () => {
    dead = true;
    clearInterval(iv);
    if (view) view.dispose();
  };
}

function build(m, stage, ctx) {
  const { THREE, miniStage, emojiTexture } = m;
  const S = miniStage(stage, { skyTop: '#240046', skyBottom: '#5a189a', hemiGround: '#3c096c', fov: 40 });
  const { scene, camera, particles } = S;
  // piso con reflejo suave y focos
  const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 48), new THREE.MeshStandardMaterial({ color: '#3c096c', roughness: 0.4, metalness: 0.3 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.9;
  floor.receiveShadow = true;
  scene.add(floor);
  const spot = new THREE.PointLight('#ffd6ff', 6, 5);
  spot.position.set(0, 1.4, 1.2);
  scene.add(spot);

  // el cronómetro gigante
  const sw = new THREE.Group();
  scene.add(sw);
  const metal = new THREE.MeshStandardMaterial({ color: '#d9dde3', metalness: 0.85, roughness: 0.25 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.16, 64), metal);
  body.rotation.x = Math.PI / 2;
  body.castShadow = true;
  sw.add(body);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.035, 12, 64), new THREE.MeshStandardMaterial({ color: '#ff4d6d', metalness: 0.4, roughness: 0.3 }));
  bezel.position.z = 0.08;
  sw.add(bezel);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 16), metal);
  crown.position.y = 0.7;
  sw.add(crown);
  const crownTop = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 20), new THREE.MeshStandardMaterial({ color: '#ff4d6d' }));
  crownTop.position.y = 0.78;
  sw.add(crownTop);
  // esfera: 0 a 10 segundos en una vuelta
  const fc = document.createElement('canvas');
  fc.width = fc.height = 512;
  const fg = fc.getContext('2d');
  fg.fillStyle = '#fffaf0'; fg.beginPath(); fg.arc(256, 256, 256, 0, Math.PI * 2); fg.fill();
  for (let i = 0; i < 50; i++) {
    const a = (i / 50) * Math.PI * 2 - Math.PI / 2, big = i % 5 === 0;
    fg.strokeStyle = big ? '#1b1035' : '#8d99ae'; fg.lineWidth = big ? 8 : 3;
    fg.beginPath(); fg.moveTo(256 + Math.cos(a) * (big ? 200 : 218), 256 + Math.sin(a) * (big ? 200 : 218)); fg.lineTo(256 + Math.cos(a) * 236, 256 + Math.sin(a) * 236); fg.stroke();
  }
  fg.fillStyle = '#1b1035'; fg.font = 'bold 52px system-ui'; fg.textAlign = 'center'; fg.textBaseline = 'middle';
  for (let s = 1; s <= 10; s++) { const a = (s / 10) * Math.PI * 2 - Math.PI / 2; fg.fillText(String(s), 256 + Math.cos(a) * 160, 256 + Math.sin(a) * 160); }
  const faceTex = new THREE.CanvasTexture(fc);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.56, 64), new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.5 }));
  face.position.z = 0.081;
  sw.add(face);
  // marca de la meta (cuña verde)
  const goal = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.55, 24, 1, 0, 0.12), new THREE.MeshBasicMaterial({ color: '#06d6a0', transparent: true, opacity: 0.85 }));
  goal.position.z = 0.083;
  sw.add(goal);
  // aguja
  const hand = new THREE.Group();
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.015), new THREE.MeshStandardMaterial({ color: '#e63946' }));
  needle.position.y = 0.21;
  hand.add(needle);
  hand.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 16).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#1b1035' })));
  hand.position.z = 0.095;
  sw.add(hand);
  // agujas de los demás (se muestran al final de la ronda)
  const others = (ctx.players || []).map((p) => {
    const h = new THREE.Group();
    const n = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.46, 0.01), new THREE.MeshStandardMaterial({ color: p.c, emissive: p.c, emissiveIntensity: 0.3 }));
    n.position.y = 0.2;
    h.add(n);
    h.position.z = 0.092;
    h.visible = false;
    sw.add(h);
    return { p, h };
  });
  // tapa tipo diafragma que oculta el tiempo
  const lid = new THREE.Group();
  const lidMat = new THREE.MeshStandardMaterial({ color: '#1b1035', roughness: 0.4, metalness: 0.3 });
  const blades = Array.from({ length: 8 }, (_, i) => {
    const b = new THREE.Mesh(new THREE.CircleGeometry(0.58, 24, (i * Math.PI) / 4, Math.PI / 4 + 0.02), lidMat);
    lid.add(b);
    return b;
  });
  lid.position.z = 0.11;
  sw.add(lid);
  const q = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture('?', { font: 'bold 110px system-ui' }), transparent: true, depthTest: false }));
  q.scale.set(0.45, 0.45, 1);
  q.position.z = 0.2;
  q.visible = false;
  sw.add(q);

  const fitCam = () => {
    const vf = Math.tan((camera.fov * Math.PI) / 360);
    const dist = Math.max(0.95 / (vf * S.aspect), 1.0 / vf);
    camera.position.set(0, 0.25, dist);
    camera.lookAt(0, 0.05, 0);
  };
  fitCam();

  let elapsed = -1, hidden = false, mine = null, lidK = 0, revealed = false;
  S.start((dt, now) => {
    fitCam();
    sw.rotation.y = Math.sin(now / 1800) * 0.12;
    sw.position.y = Math.sin(now / 900) * 0.02;
    const ms = mine !== null ? mine : Math.max(0, elapsed);
    hand.rotation.z = -(ms / 10000) * Math.PI * 2;
    lidK += ((hidden ? 1 : 0) - lidK) * Math.min(1, dt * 10);
    blades.forEach((b) => { b.scale.setScalar(Math.max(0.001, lidK)); });
    lid.visible = lidK > 0.01;
    q.visible = lidK > 0.6;
    q.material.rotation = Math.sin(now / 300) * 0.1;
  });

  return {
    newRound(R) {
      elapsed = -1; hidden = false; mine = null; revealed = false;
      goal.rotation.z = -(R.target / 10) * Math.PI * 2 + Math.PI / 2 + 0.06;
      // marca centrada en la meta
      goal.geometry.dispose();
      goal.geometry = new THREE.RingGeometry(0.4, 0.55, 24, 1, -0.06, 0.12);
      goal.rotation.z = Math.PI / 2 - (R.target / 10) * Math.PI * 2;
      others.forEach((o) => { o.h.visible = false; });
      particles.burst(0, 0.75, 0.1, { n: 20, color: ['#ffd23f', '#ffffff'], speed: 0.6, up: 0.6, size: 0.04, life: 0.6, gravity: 1 });
    },
    tick(el2, hide) { elapsed = el2; hidden = hide; },
    stopMine(ms) {
      mine = ms;
      hidden = false;
      particles.burst(0, 0, 0.2, { n: 18, color: ['#ffffff', '#ff4d6d'], speed: 0.5, up: 0.3, size: 0.035, life: 0.5, gravity: 0.5 });
    },
    reveal(res, R) {
      revealed = true;
      hidden = false;
      for (const o of others) {
        const ms = res[o.p.id];
        if (typeof ms !== 'number' || o.p.id === ctx.me) continue;
        o.h.visible = true;
        o.h.rotation.z = -(ms / 10000) * Math.PI * 2;
      }
      const d = diffOf(mine, R.target);
      if (d < 150) { particles.burst(0, 0.2, 0.3, { n: 60, color: ['#ffd60a', '#06d6a0', '#ffffff'], speed: 1.1, up: 1.4, size: 0.045, life: 1.2, gravity: 1.5 }); S.shake = 0.03; }
    },
    dispose: () => S.dispose(),
  };
}
