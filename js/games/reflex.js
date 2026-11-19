// 🤠 Reflejos de vaquero — duelo del viejo oeste (3D).
// Todos con el revólver en la mano, frente a frente. Cuando suena la campana y
// aparece ¡FUEGO!, toca la pantalla: el más rápido desenfunda y tumba a los
// demás. Si disparas antes de tiempo, se te cae el revólver.
//
// Cada teléfono mide su propio tiempo de reacción. Los resultados de los demás
// llegan por la red; los bots son deterministas (misma semilla → mismo tiempo),
// así que todos ven el mismo duelo.
import { mulberry32, beep, buzz } from '../util.js';
import { icon, rich } from '../icons.js';
import { sfx, say } from '../audio.js';
import { USE_2D } from '../rt.js';

const ROUNDS = 3;
const R_INTRO = 1500;  // ms de "Ronda N" antes de cada duelo
const WINDOW = 1400;   // ms después del ¡FUEGO! para decidir al ganador
const SHOW = 2800;     // ms de animación del duelo
// horario de las rondas (igual en todos los teléfonos)
function schedule(seed) {
  const r = mulberry32(seed);
  const out = [];
  let t = 0;
  for (let k = 0; k < ROUNDS; k++) {
    const wait = 1500 + r() * 2600;
    const go = t + R_INTRO + wait;
    out.push({ start: t, go, resolve: go + WINDOW, end: go + WINDOW + SHOW });
    t = go + WINDOW + SHOW;
  }
  return out;
}

const hash = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
function botResult(seed, id, k = 0) {
  const r = mulberry32((seed ^ hash(id) ^ Math.imul(k + 1, 0x9e3779b9)) >>> 0);
  return r() < 0.1 ? { f: 1 } : { ms: Math.round(230 + r() * 260) };
}
const valid = (v) => v && !v.f && typeof v.ms === 'number' && v.ms >= 80;

export default {
  id: 'reflex',
  name: 'Reflejos de vaquero',
  uses3d: true,
  desc: '¡Duelo en el viejo oeste, a 3 rondas! Espera la campana y el ¡FUEGO!, y toca la pantalla lo más rápido posible: el más rápido tumba a todos. Si disparas antes, se te cae el revólver. Gana quien gane más duelos.',
  dur: (seed) => schedule(seed)[ROUNDS - 1].end,

  mount(el, ctx) {
    let webgl = false;
    try { const c = document.createElement('canvas'); webgl = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { /* nada */ }
    if (USE_2D() || !webgl || !ctx.players) return mount2D(el, ctx);
    return mount3D(el, ctx);
  },

  // gana quien gane más duelos; si empatan, el que sumó menos tiempo
  evaluateAll(vals, seed, pl) {
    const wins = {}, total = {}, any = {};
    for (const p of pl) { wins[p.id] = 0; total[p.id] = 0; any[p.id] = false; }
    for (let k = 0; k < ROUNDS; k++) {
      const res = pl.map((p) => {
        const v = vals[p.id] && Array.isArray(vals[p.id].r) ? vals[p.id].r[k] : null;
        if (v) any[p.id] = true;
        return [p.id, v];
      });
      let best = Infinity;
      for (const [, v] of res) if (valid(v)) best = Math.min(best, v.ms);
      for (const [id, v] of res) {
        if (valid(v) && v.ms === best) wins[id]++;
        total[id] += valid(v) ? v.ms : 1500;
      }
    }
    const out = {};
    for (const p of pl) {
      out[p.id] = any[p.id]
        ? { score: wins[p.id] * 1e6 - total[p.id], label: `${wins[p.id]} de ${ROUNDS} duelos · ${Math.round(total[p.id] / ROUNDS)} ms prom.` }
        : null;
    }
    return out;
  },
  evaluate(v) {
    if (!v || !Array.isArray(v.r)) return null;
    const t = v.r.reduce((a, x) => a + (valid(x) ? x.ms : 1500), 0);
    return { score: -t, label: `${Math.round(t / ROUNDS)} ms prom.` };
  },

  bot: (r, seed, p) => ({ r: [0, 1, 2].map((k) => botResult(seed, p?.id || 'bot0', k)) }),
};

// ---------------------------------------------------------------- 3D
function mount3D(el, ctx) {
  const plan = schedule(ctx.seed);
  el.innerHTML = `
    <div class="duel">
      <div class="duel-stage"></div>
      <div class="duel-top">Ronda 1 de ${ROUNDS}</div>
      <div class="duel-flash" hidden>¡FUEGO!</div>
      <div class="duel-score"></div>
      <div class="duel-me"></div>
      <button class="duel-tap" aria-label="Disparar"></button>
    </div>`;
  const stage = el.querySelector('.duel-stage');
  const top = el.querySelector('.duel-top');
  const flash = el.querySelector('.duel-flash');
  const meEl = el.querySelector('.duel-me');
  const scoreEl = el.querySelector('.duel-score');
  const tapBtn = el.querySelector('.duel-tap');
  let dead = false;
  const t0 = performance.now();
  let k = -1;            // ronda actual
  let goAt = 0;          // momento del ¡FUEGO! de esta ronda
  let resolved = false;
  const myRes = [null, null, null];
  const wins = Object.fromEntries(ctx.players.map((p) => [p.id, 0]));
  let scene = null;

  const paintScore = () => {
    scoreEl.innerHTML = ctx.players.map((p) => `<span style="--c:${p.c}">${escapeHTML(p.n)} <b>${'●'.repeat(wins[p.id])}${'○'.repeat(Math.max(0, ROUNDS - wins[p.id]))}</b></span>`).join('');
  };
  paintScore();

  const tap = (e) => {
    e.preventDefault();
    if (k < 0 || myRes[k] || resolved) return;
    const now = performance.now();
    if (now < t0 + plan[k].start + R_INTRO * 0.6) return; // aún no empieza la ronda
    if (!goAt || now < goAt) {
      myRes[k] = { f: 1 };
      top.innerHTML = rich('{cross} ¡Muy pronto! Se te cayó el revólver');
      sfx.click();
      buzz(200);
    } else {
      myRes[k] = { ms: Math.round(now - goAt) };
      meEl.textContent = `${myRes[k].ms} ms`;
      buzz(40);
    }
    ctx.submit({ r: myRes });
    if (scene) scene.onTap(myRes[k]);
  };
  tapBtn.addEventListener('pointerdown', tap);

  import('../rt3d.js').then((m) => {
    if (dead) return;
    try { scene = buildDuel(m, stage, ctx, t0); if (k >= 0) scene.newRound(k, plan[k].go); } catch (e) { console.warn(e); }
  });

  let lastBeat = 0;
  const iv = setInterval(() => {
    const t = performance.now() - t0;
    // ¿empieza una ronda nueva?
    const nk = plan.findIndex((r) => t >= r.start && t < r.end);
    if (nk !== -1 && nk !== k) {
      k = nk;
      goAt = 0;
      resolved = false;
      meEl.textContent = '';
      top.textContent = `Ronda ${k + 1} de ${ROUNDS}: espera la campana…`;
      sfx.wind(0.8);
      sfx.warn();
      if (scene) scene.newRound(k, plan[k].go);
    }
    if (k < 0) return;
    const R = plan[k];
    if (!goAt && t >= R.start + R_INTRO * 0.6 && t - lastBeat > Math.max(380, 900 - (t - R.start) * 0.12) && t < R.go) { lastBeat = t; sfx.heart(0.8); }
    if (!goAt && t >= R.go) {
      goAt = t0 + R.go;
      sfx.bell();
      flash.hidden = false;
      top.textContent = '¡Toca para disparar!';
      setTimeout(() => { flash.hidden = true; }, 700);
    }
    if (goAt && !resolved) {
      const res = collect(k);
      const all = ctx.players.every((p) => res[p.id]);
      if (t >= R.resolve || (all && t >= R.go + 250)) {
        resolved = true;
        showdown(k, res);
      }
    }
  }, 30);

  function collect(kk) {
    const res = {};
    const live = ctx.results ? ctx.results() : {};
    for (const p of ctx.players) {
      if (p.b) res[p.id] = botResult(ctx.seed, p.id, kk);
      else if (p.id === ctx.me) { if (myRes[kk]) res[p.id] = myRes[kk]; }
      else if (live[p.id] && Array.isArray(live[p.id].r) && live[p.id].r[kk]) res[p.id] = live[p.id].r[kk];
    }
    return res;
  }

  function showdown(kk, res) {
    let win = null;
    for (const p of ctx.players) {
      const v = res[p.id];
      if (valid(v) && (!win || v.ms < res[win].ms)) win = p.id;
    }
    const wp = ctx.players.find((p) => p.id === win);
    if (wp) {
      wins[wp.id]++;
      paintScore();
      top.innerHTML = rich(`${wp.id === ctx.me ? '{trophy} ¡Ganaste el duelo!' : `¡${escapeHTML(wp.n)} es el más rápido!`} (${res[win].ms} ms)`);
      if (wp.id === ctx.me) setTimeout(() => sfx.win(), 1500);
    } else {
      top.textContent = 'Nadie disparó a tiempo…';
    }
    if (kk === ROUNDS - 1) {
      setTimeout(() => {
        if (dead) return;
        const best = Math.max(...Object.values(wins));
        const champs = ctx.players.filter((p) => wins[p.id] === best && best > 0);
        top.innerHTML = rich(champs.length ? `{trophy} ${champs.map((p) => escapeHTML(p.n)).join(' y ')}: ${best} de ${ROUNDS} duelos` : 'Fin del duelo');
      }, 2200);
    }
    if (scene) scene.showdown(win, res);
  }

  return () => {
    dead = true;
    clearInterval(iv);
    if (scene) scene.dispose();
  };
}

const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function buildDuel(m, stage, ctx, t0) {
  const { THREE, makeCharacter, Particles } = m;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  stage.appendChild(renderer.domElement);
  renderer.domElement.className = 'k-3d';

  const scene = new THREE.Scene();
  // cielo de atardecer
  const skyC = document.createElement('canvas');
  skyC.width = 4; skyC.height = 256;
  const sg = skyC.getContext('2d');
  const grad = sg.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#3a1c71'); grad.addColorStop(0.45, '#d76d77'); grad.addColorStop(0.75, '#ffaf7b'); grad.addColorStop(1, '#ffd89b');
  sg.fillStyle = grad; sg.fillRect(0, 0, 4, 256);
  const skyTex = new THREE.CanvasTexture(skyC);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;
  scene.fog = new THREE.Fog('#f4a261', 5, 13);

  scene.add(new THREE.HemisphereLight('#ffe8c8', '#8a4b2a', 1.1));
  const sun = new THREE.DirectionalLight('#ffd0a0', 2.4);
  sun.position.set(-2, 2.2, -1.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.5, far: 8 });
  sun.shadow.bias = -0.0015;
  scene.add(sun);

  // suelo de arena
  const sc = document.createElement('canvas');
  sc.width = sc.height = 256;
  const g2 = sc.getContext('2d');
  g2.fillStyle = '#e9c46a'; g2.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 500; i++) { g2.fillStyle = i % 2 ? 'rgba(180,120,50,0.18)' : 'rgba(255,255,255,0.12)'; g2.fillRect((i * 97) % 256, (i * 57) % 256, 3, 2); }
  const sandTex = new THREE.CanvasTexture(sc);
  sandTex.colorSpace = THREE.SRGBColorSpace;
  sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping;
  sandTex.repeat.set(8, 8);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  // círculo del duelo
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.66, 48), new THREE.MeshBasicMaterial({ color: '#b5651d', transparent: true, opacity: 0.5 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.003;
  scene.add(ring);

  // saloon al fondo
  const wood = new THREE.MeshStandardMaterial({ color: '#8b5a2b', roughness: 0.9 });
  const woodD = new THREE.MeshStandardMaterial({ color: '#5a3416', roughness: 0.9 });
  const saloon = new THREE.Group();
  const front = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 0.4), wood);
  front.position.y = 0.55;
  front.castShadow = true;
  saloon.add(front);
  const signC = document.createElement('canvas');
  signC.width = 512; signC.height = 128;
  const sgc = signC.getContext('2d');
  sgc.fillStyle = '#3d2314'; sgc.fillRect(0, 0, 512, 128);
  sgc.fillStyle = '#ffd23f'; sgc.font = 'bold 84px Georgia, serif'; sgc.textAlign = 'center'; sgc.textBaseline = 'middle';
  sgc.fillText('SALOON', 256, 68);
  const signTex = new THREE.CanvasTexture(signC);
  signTex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshStandardMaterial({ map: signTex }));
  sign.position.set(0, 1.0, 0.21);
  saloon.add(sign);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.05), woodD);
  door.position.set(0, 0.32, 0.21);
  saloon.add(door);
  [-0.7, 0.7].forEach((x) => { const w = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.05), new THREE.MeshStandardMaterial({ color: '#ffd89b', emissive: '#ff9f1c', emissiveIntensity: 0.3 })); w.position.set(x, 0.55, 0.21); saloon.add(w); });
  const porch = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 0.5), woodD);
  porch.position.set(0, 0.03, 0.4);
  saloon.add(porch);
  saloon.position.set(0, 0, -2.4);
  scene.add(saloon);

  // cactus y rocas
  const cactusMat = new THREE.MeshStandardMaterial({ color: '#2d6a4f', roughness: 0.7 });
  const cactus = (x, z, s) => {
    const c = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.5, 4, 10), cactusMat);
    trunk.position.y = 0.33;
    c.add(trunk);
    [-1, 1].forEach((k) => {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.18, 4, 8), cactusMat);
      arm.position.set(k * 0.14, 0.4 + k * 0.05, 0);
      c.add(arm);
      const join = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.08, 4, 8), cactusMat);
      join.position.set(k * 0.09, 0.3 + k * 0.05, 0);
      join.rotation.z = Math.PI / 2;
      c.add(join);
    });
    c.traverse((o) => { o.castShadow = true; });
    c.position.set(x, 0, z);
    c.scale.setScalar(s);
    scene.add(c);
  };
  cactus(-1.7, -1.2, 1.3); cactus(1.8, -1.5, 1.1); cactus(-2.4, 0.6, 1.0); cactus(2.3, 0.3, 1.2);
  const rockMat = new THREE.MeshStandardMaterial({ color: '#b5651d', roughness: 1, flatShading: true });
  [[-3.5, -4, 1.6], [3.8, -4.5, 2], [0.5, -6, 2.4]].forEach(([x, z, s]) => {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * s, 0.7 * s, 1.2 * s, 7), rockMat);
    r.position.set(x, 0.6 * s, z);
    scene.add(r);
  });

  // bola de paja que rueda
  const tumble = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), new THREE.MeshStandardMaterial({ color: '#c9a66b', wireframe: true }));
  tumble.position.set(-3, 0.11, 0.9);
  scene.add(tumble);

  const particles = new Particles(scene, 400);

  // ---- vaqueros en círculo; yo quedo al frente, mirando al centro
  const N = ctx.players.length;
  const myIdx = Math.max(0, ctx.players.findIndex((p) => p.id === ctx.me));
  const U = 0.085;
  const R = 0.62;
  const cowboys = ctx.players.map((p, i) => {
    const ang = Math.PI / 2 + ((i - myIdx) * Math.PI * 2) / Math.max(2, N);
    const x = Math.cos(ang) * R, z = Math.sin(ang) * R;
    const ch = makeCharacter({ c: p.c, a: p.a, id: p.id }, U);
    ch.root.position.set(x, 0, z);
    ch.rig.rotation.y = Math.atan2(-x, -z);
    scene.add(ch.root);
    // sombrero de vaquero
    const hat = new THREE.Group();
    const hatMat = new THREE.MeshStandardMaterial({ color: ['#7f5539', '#3d2314', '#a0522d', '#5e3a1f'][i % 4], roughness: 0.8 });
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(U * 1.15, U * 1.15, U * 0.1, 20), hatMat);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(U * 0.5, U * 0.6, U * 0.6, 16), hatMat);
    crown.position.y = U * 0.33;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(U * 0.61, U * 0.61, U * 0.12, 16), new THREE.MeshStandardMaterial({ color: p.c }));
    band.position.y = U * 0.1;
    hat.add(brim, crown, band);
    hat.traverse((o) => { o.castShadow = true; });
    hat.position.y = ch.headY + U * 0.62;
    ch.rig.add(hat);
    // revólver en la mano derecha (arms[0]), apuntando por el brazo
    const gun = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: '#4a4e69', metalness: 0.8, roughness: 0.3 });
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(U * 0.07, U * 0.07, U * 0.6, 8), metal);
    barrel.position.y = -U * 0.32;
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(U * 0.13, U * 0.13, U * 0.18, 8), metal);
    drum.position.y = -U * 0.02;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(U * 0.12, U * 0.28, U * 0.12), new THREE.MeshStandardMaterial({ color: '#6b3b1f' }));
    grip.position.set(0, U * 0.1, -U * 0.12);
    grip.rotation.x = 0.5;
    gun.add(barrel, drum, grip);
    gun.traverse((o) => { o.castShadow = true; });
    gun.position.y = -0.68 * U;
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(U * 0.25, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0 }));
    muzzle.position.y = -U * 0.7;
    gun.add(muzzle);
    ch.arms[0].add(gun);
    return { p, ch, hat, gun, muzzle, x, z, state: 'ready', t: 0, aimAt: null, fall: 0, hatV: null };
  });
  const byId = Object.fromEntries(cowboys.map((c) => [c.p.id, c]));

  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 40);
  let camDist = 3;
  const fit = () => {
    const w = Math.max(50, stage.clientWidth), h = Math.max(50, stage.clientHeight);
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px';
    renderer.domElement.style.height = h + 'px';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // distancia para que quepa todo el círculo de vaqueros (también en vertical)
    const vf = Math.tan((camera.fov * Math.PI) / 360);
    camDist = Math.max(0.92 / (vf * camera.aspect), 1.25 / vf * 0.62);
    particles.mat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
  };
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(stage);

  // ---- acciones
  let shake = 0;
  let round = 0;
  let goT = 99;          // segundos (desde t0) del ¡FUEGO! de la ronda actual
  let roundT = 0;        // segundos (desde t0) en que empezó la ronda
  const draw = (c) => { if (c.state === 'ready') { c.state = 'draw'; c.t = 0; } };
  const fire = (c, target) => {
    c.state = 'shoot'; c.t = 0;
    c.aimAt = target;
    c.muzzle.material.opacity = 1;
    sfx.gun(c.p.id === ctx.me || target?.p.id === ctx.me ? 1 : 0.6);
    // humo y chispas en la boca del cañón
    const wp = new THREE.Vector3();
    c.muzzle.getWorldPosition(wp);
    particles.burst(wp.x, wp.y, wp.z, { n: 14, color: ['#fff3b0', '#ffbe0b', '#ff7b00'], speed: 0.5, up: 0.3, size: 0.04, life: 0.25, gravity: 0 });
    particles.burst(wp.x, wp.y, wp.z, { n: 8, color: ['#dddddd', '#bbbbbb'], speed: 0.12, up: 0.2, size: 0.07, life: 1.0, gravity: -0.2, grow: 1 });
    shake = Math.max(shake, c.p.id === ctx.me ? 0.035 : 0.015);
  };
  const knock = (c, from) => {
    if (c.state === 'down') return;
    c.state = 'down'; c.t = 0;
    sfx.thud(0.8);
    // el sombrero sale volando
    const dx = c.x - from.x, dz = c.z - from.z, l = Math.hypot(dx, dz) || 1;
    c.hatV = { vx: (dx / l) * 1.1, vy: 1.6, vz: (dz / l) * 1.1, spin: 10 };
    const wp = new THREE.Vector3();
    c.ch.head.getWorldPosition(wp);
    particles.burst(wp.x, wp.y + U, wp.z, { n: 16, color: ['#ffd23f', '#ffffff'], speed: 0.4, up: 0.6, size: 0.04, life: 0.9, gravity: 0.5 });
    particles.burst(c.x, 0.02, c.z, { n: 14, color: ['#e9c46a', '#d4a373'], speed: 0.5, up: 0.4, size: 0.06, life: 0.8, gravity: 0.6 });
    if (c.p.id === ctx.me) buzz(250);
  };

  // los demás desenfundan en cuanto llega su tiempo; los bots según su tiempo
  const shown = new Set();
  const onTap = (res) => {
    const me = byId[ctx.me];
    if (!me) return;
    if (res.f) { me.state = 'drop'; me.t = 0; sfx.click(); }
    else { draw(me); fire(me, null); shown.add(ctx.me); }
  };

  const showdown = (win, res) => {
    const w = byId[win];
    // los que se adelantaron sueltan el revólver
    for (const c of cowboys) {
      const v = res[c.p.id];
      if (v && v.f && c.state === 'ready') { c.state = 'drop'; c.t = 0; }
    }
    if (!w) {
      tumble.position.set(-2.5, 0.11, 0.2);
      tumbleOn = true;
      return;
    }
    const losers = cowboys.filter((c) => c !== w);
    draw(w);
    const rid = round;
    losers.forEach((c, i) => {
      setTimeout(() => {
        if (disposed || rid !== round) return;
        fire(w, c);
        setTimeout(() => { if (!disposed && rid === round) { knock(c, w); sfx.ricochet(0.4); } }, 70);
      }, 350 + i * 420);
    });
    // al final, el ganador sopla el humo del cañón y gira el revólver
    setTimeout(() => { if (!disposed && rid === round) { w.state = 'spin'; w.t = 0; } }, 450 + losers.length * 420 + 400);
  };

  let tumbleOn = true;
  let disposed = false;
  let last = performance.now();
  let raf = 0;
  const v3 = new THREE.Vector3();
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = (now - t0) / 1000;

    // ¿alguien más ya disparó? (llega por la red)
    if (t > goT) {
      const live = ctx.results ? ctx.results() : {};
      for (const c of cowboys) {
        if (shown.has(c.p.id) || c.p.id === ctx.me) continue;
        const v = c.p.b ? botResult(ctx.seed, c.p.id, round) : live[c.p.id] && Array.isArray(live[c.p.id].r) ? live[c.p.id].r[round] : null;
        if (!v) continue;
        if (valid(v) && t > goT + v.ms / 1000) { shown.add(c.p.id); draw(c); fire(c, null); }
        else if (v.f) { shown.add(c.p.id); c.state = 'drop'; c.t = 0; }
      }
    }

    // cámara: acercamiento lento durante la espera, sacudida en los disparos
    const zoom = t < goT ? Math.min(1, Math.max(0, (t - roundT) / Math.max(0.5, goT - roundT))) : 1;
    const dist = camDist * (1.12 - zoom * 0.12);
    const elev = 0.62 - zoom * 0.08;
    camera.position.set(Math.sin(t * 0.15) * 0.12, Math.sin(elev) * dist, Math.cos(elev) * dist);
    camera.lookAt(0, 0.1, -0.05);
    if (shake > 0.0005) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; shake *= Math.pow(0.02, dt); }

    for (const c of cowboys) {
      c.t += dt;
      const [armR, armL] = c.ch.arms;
      const baseYaw = Math.atan2(-c.x, -c.z);
      if (c.state === 'ready') {
        // mano sobre el revólver, temblando de tensión
        armR.rotation.x = 0.15 + Math.sin(t * 25 + c.x * 9) * 0.03;
        armR.rotation.z = -0.35;
        armL.rotation.x = 0.1;
        c.ch.rig.rotation.y = baseYaw;
        c.ch.rig.rotation.x = 0;
      } else if (c.state === 'draw' || c.state === 'shoot') {
        const k = Math.min(1, c.t / 0.12);
        armR.rotation.x = -Math.PI / 2 * k + (c.state === 'shoot' ? Math.max(0, 0.4 - c.t * 2) * -1 : 0);
        armR.rotation.z = -0.35 * (1 - k);
        if (c.aimAt) {
          const yaw = Math.atan2(c.aimAt.x - c.x, c.aimAt.z - c.z);
          c.ch.rig.rotation.y += (yaw - c.ch.rig.rotation.y) * Math.min(1, dt * 30);
        }
        c.muzzle.material.opacity = Math.max(0, c.muzzle.material.opacity - dt * 8);
      } else if (c.state === 'down') {
        // cae de espaldas, con estrellitas
        const k = Math.min(1, c.t / 0.45);
        c.ch.rig.rotation.x = -k * 1.45;
        armR.rotation.x = -2.4 * k;
        armL.rotation.x = -2.2 * k;
        if (c.hatV) {
          c.hat.parent !== scene && (c.hat.getWorldPosition(v3), scene.attach(c.hat));
          c.hatV.vy -= 5 * dt;
          c.hat.position.x += c.hatV.vx * dt;
          c.hat.position.y = Math.max(U * 0.05, c.hat.position.y + c.hatV.vy * dt);
          c.hat.position.z += c.hatV.vz * dt;
          if (c.hat.position.y > U * 0.06) c.hat.rotation.x += c.hatV.spin * dt;
          else { c.hatV.vx *= 0.8; c.hatV.vz *= 0.8; }
        }
      } else if (c.state === 'drop') {
        // se le cae el revólver
        armR.rotation.x = 0.4;
        if (c.gun.parent !== scene) { scene.attach(c.gun); c.gunV = 0; }
        c.gunV = (c.gunV || 0) - 4 * dt;
        c.gun.position.y = Math.max(0.02, c.gun.position.y + c.gunV * dt);
        c.gun.rotation.z += dt * 6 * (c.gun.position.y > 0.03 ? 1 : 0);
        c.ch.rig.rotation.z = Math.sin(t * 8) * 0.08;
      } else if (c.state === 'spin') {
        armR.rotation.x = -1.2;
        c.gun.rotation.x += dt * 25;
        c.ch.rig.rotation.y += (Math.atan2(-c.x, camera.position.z - c.z) - c.ch.rig.rotation.y) * Math.min(1, dt * 5);
        if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) {
          const wp = new THREE.Vector3();
          c.muzzle.getWorldPosition(wp);
          particles.burst(wp.x, wp.y, wp.z, { n: 3, color: ['#dddddd'], speed: 0.05, up: 0.25, size: 0.05, life: 1, gravity: -0.1, grow: 1 });
        }
      }
      c.ch.headObj.blink(t + c.x * 3);
    }
    // bola de paja
    if (tumbleOn) {
      tumble.position.x += dt * 0.6;
      tumble.position.y = 0.11 + Math.abs(Math.sin(t * 5)) * 0.06;
      tumble.rotation.z -= dt * 5;
      if (tumble.position.x > 3) { tumble.position.x = -3; tumbleOn = t < goT; }
    }
    particles.update(dt);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  // nueva ronda: todos de pie, sombreros y revólveres en su lugar
  const newRound = (k, goMs) => {
    round = k;
    roundT = (performance.now() - t0) / 1000;
    goT = goMs / 1000;
    shown.clear();
    tumbleOn = true;
    for (const c of cowboys) {
      c.state = 'ready'; c.t = 0; c.aimAt = null; c.hatV = null; c.gunV = 0;
      c.ch.rig.rotation.set(0, Math.atan2(-c.x, -c.z), 0);
      if (c.hat.parent !== c.ch.rig) { c.ch.rig.add(c.hat); }
      c.hat.position.set(0, c.ch.headY + U * 0.62, 0);
      c.hat.rotation.set(0, 0, 0);
      if (c.gun.parent !== c.ch.arms[0]) { c.ch.arms[0].add(c.gun); }
      c.gun.position.set(0, -0.68 * U, 0);
      c.gun.rotation.set(0, 0, 0);
      c.muzzle.material.opacity = 0;
    }
  };

  return {
    onTap,
    showdown,
    newRound,
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

// ---------------------------------------------------------------- 2D (respaldo)
function mount2D(el, ctx) {
  const plan = schedule(ctx.seed);
  const myRes = [null, null, null];
  const t0 = performance.now();
  let k = -1;
  let goAt = 0;
  el.innerHTML = `<button class="g-reflex wait"><span class="g-reflex-txt">Ronda 1</span><small>espera…</small></button>`;
  const pad = el.querySelector('.g-reflex');
  const txt = el.querySelector('.g-reflex-txt');
  const sub = el.querySelector('small');
  const iv = setInterval(() => {
    const t = performance.now() - t0;
    const nk = plan.findIndex((r) => t >= r.start && t < r.end);
    if (nk !== -1 && nk !== k) {
      k = nk; goAt = 0;
      pad.className = 'g-reflex wait';
      txt.textContent = `Ronda ${k + 1} de ${ROUNDS}`;
      sub.textContent = 'no toques todavía';
    }
    if (k >= 0 && !goAt && t >= plan[k].go) {
      goAt = t0 + plan[k].go;
      if (!myRes[k]) { pad.className = 'g-reflex go'; txt.textContent = '¡FUEGO!'; sub.textContent = '¡toca!'; }
      sfx.bell();
    }
  }, 30);
  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (k < 0 || myRes[k]) return;
    const now = performance.now();
    if (!goAt) {
      myRes[k] = { f: 1 };
      pad.className = 'g-reflex fail';
      txt.textContent = '¡Muy pronto!';
      sub.textContent = 'falta';
      sfx.click();
      buzz(200);
    } else {
      const ms = Math.round(now - goAt);
      myRes[k] = { ms };
      pad.className = 'g-reflex done';
      txt.textContent = `${ms} ms`;
      sub.textContent = ms < 300 ? '¡rapidísimo!' : ms < 450 ? '¡bien!' : 'uff…';
      sfx.gun(0.7);
      buzz(30);
    }
    ctx.submit({ r: myRes });
  });
  return () => clearInterval(iv);
}
