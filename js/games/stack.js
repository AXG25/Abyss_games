// ⚖️ Equilibrio — 3D con física. Una grúa pasa de lado a lado con la pieza
// siguiente: toca la pantalla para soltarla y GIRAR para voltearla. Las piezas
// caen con física real, así que la torre tiembla y se puede derrumbar.
// A los 40 s gana la torre más alta que siga en pie.
//
// Todos reciben las mismas piezas en el mismo orden (salen de la semilla).
// Cada torre es independiente: cada teléfono simula la suya y envía su altura;
// la de los demás se ve en vivo como líneas de color.
import { mulberry32, buzz, esc } from '../util.js';
import { sfx } from '../audio.js';
import { rich } from '../icons.js';
import { USE_2D } from '../rt.js';
import { World, box, polygon } from '../physics2d.js';

const COUNT = 3000;     // cuenta regresiva
const PLAY = 40000;     // tiempo para construir
const SETTLE = 2500;    // la torre se asienta antes de medir
const TOTAL = COUNT + PLAY + SETTLE;
const BASE_HW = 1.6;    // media anchura de la plataforma
const SWING = 2.1;      // la grúa va de -SWING a +SWING
const LIFT = 3.0;       // altura de la grúa sobre la torre
const COOLDOWN = 900;   // ms hasta la siguiente pieza
const DT = 1 / 60;

// Piezas: forma (vértices), color y frecuencia.
const KINDS = {
  cube: { pts: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]], c: '#ff4d6d', w: 3 },
  small: { pts: [[-0.35, -0.35], [0.35, -0.35], [0.35, 0.35], [-0.35, 0.35]], c: '#ffbe0b', w: 2 },
  plank: { pts: [[-1, -0.2], [1, -0.2], [1, 0.2], [-1, 0.2]], c: '#3a86ff', w: 3 },
  long: { pts: [[-1.4, -0.17], [1.4, -0.17], [1.4, 0.17], [-1.4, 0.17]], c: '#8338ec', w: 1 },
  pillar: { pts: [[-0.25, -0.7], [0.25, -0.7], [0.25, 0.7], [-0.25, 0.7]], c: '#06d6a0', w: 2 },
  trap: { pts: [[-0.75, -0.3], [0.75, -0.3], [0.4, 0.3], [-0.4, 0.3]], c: '#ff006e', w: 2 },
};
const SHAPES = Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, polygon(v.pts)]));

function pieces(seed) {
  const r = mulberry32(seed ^ 0x57ac);
  const bag = Object.entries(KINDS).flatMap(([k, v]) => Array(v.w).fill(k));
  const out = ['cube'];
  while (out.length < 80) {
    let k;
    do { k = bag[Math.floor(r() * bag.length)]; } while (k === out[out.length - 1] && r() < 0.6);
    out.push(k);
  }
  return out;
}
const hash = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
// altura final de un bot y cómo va creciendo
function botFinal(seed, id) { const r = mulberry32((seed ^ hash(id) ^ 0x7a11) >>> 0); return 3 + r() * 9; }
function botLive(seed, id, ms) {
  const f = botFinal(seed, id);
  const k = Math.max(0, Math.min(1, (ms - COUNT) / PLAY));
  const r = mulberry32((seed ^ hash(id) ^ Math.floor(ms / 4000)) >>> 0);
  return Math.max(0, f * Math.pow(k, 0.85) + (k < 1 ? (r() - 0.5) * 0.6 : 0));
}
const fmt = (h) => `${(Math.max(0, h) || 0).toFixed(1)} m`;

export default {
  id: 'stack',
  name: 'Equilibrio',
  uses3d: true,
  desc: 'Una grúa pasa de lado a lado con la siguiente pieza: toca la pantalla para soltarla y GIRAR para voltearla. Las piezas caen con física real, ¡cuidado que la torre se cae! A los 40 s gana la torre más alta que siga en pie.',
  dur: () => TOTAL,

  mount(el, ctx) {
    let webgl = false;
    try { const c = document.createElement('canvas'); webgl = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { /* nada */ }
    return run(el, ctx, !USE_2D() && webgl);
  },

  evaluate(v) {
    if (!v || typeof v.h !== 'number' || !isFinite(v.h)) return null;
    const h = Math.max(0, Math.min(80, v.h));
    return { score: Math.round(h * 100), label: `torre de ${fmt(h)}` };
  },
  bot: (r, seed, p) => ({ h: Math.round(botFinal(seed, p?.id || 'bot0') * 100) / 100, done: 1 }),
};

function run(el, ctx, use3d) {
  const seq = pieces(ctx.seed);
  const players = ctx.players || [{ id: ctx.me, n: 'Tú', c: ctx.color }];
  el.innerHTML = `
    <div class="sw st">
      <div class="st-hud"><span class="st-h">0.0 m</span><span class="st-time">40</span><span class="st-next"></span></div>
      <div class="sw-stage st-stage">
        ${use3d ? '' : '<canvas class="st-2d"></canvas>'}
        <div class="st-legend">${players.map((p) => `<span data-id="${esc(p.id)}" style="--c:${p.c}"><i></i>${p.id === ctx.me ? 'Tú' : esc(p.n)} <b>0.0</b></span>`).join('')}</div>
        <div class="gl-msg st-msg" hidden></div>
      </div>
      <div class="st-ctl">
        <button class="btn st-rot" style="--c:${ctx.color}">↻ GIRAR</button>
        <button class="btn primary st-drop" style="--c:${ctx.color}">SOLTAR</button>
      </div>
    </div>`;
  const stage = el.querySelector('.st-stage');
  const hEl = el.querySelector('.st-h');
  const timeEl = el.querySelector('.st-time');
  const nextEl = el.querySelector('.st-next');
  const msgEl = el.querySelector('.st-msg');
  const legend = Object.fromEntries([...el.querySelectorAll('.st-legend span')].map((s) => [s.dataset.id, s]));
  const btnRot = el.querySelector('.st-rot');
  const btnDrop = el.querySelector('.st-drop');

  // ---- mundo
  const world = new World(-11);
  world.add(box(BASE_HW, 0.4), { static: true, y: -0.4, friction: 0.9 });
  const blocks = [];            // { b, kind, mesh?, gone }
  let idx = 0;                  // pieza que sigue
  let held = { kind: seq[0], rot: 0 };
  let readyAt = COUNT;          // cuándo aparece la siguiente pieza
  let phase = 0;
  let towerH = 0, shownH = 0, bestH = 0;
  let craneY = LIFT;
  let lost = 0;
  let view = null;
  let dead = false;
  const t0 = performance.now();
  let simMs = 0;
  let finished = false;
  let lastSend = 0, lastSentH = -1;

  world.onContact = (A, B, imp) => {
    const blk = (A.data && A.data.blk) || (B.data && B.data.blk);
    if (!blk) return;
    const v = Math.min(1, imp / 3);
    if (v > 0.08) { sfx.thud(0.25 + v * 0.6); if (view) view.dust(blk); }
  };

  const showMsg = (txt, ms = 1200) => {
    msgEl.innerHTML = rich(txt);
    msgEl.hidden = false;
    msgEl.classList.remove('pop'); void msgEl.offsetWidth; msgEl.classList.add('pop');
    clearTimeout(showMsg.t);
    if (ms) showMsg.t = setTimeout(() => { msgEl.hidden = true; }, ms);
  };
  const craneX = () => Math.sin(phase) * SWING;
  const canDrop = () => !finished && held && simMs >= readyAt && simMs < COUNT + PLAY;

  const drop = () => {
    if (!canDrop()) return;
    const kind = held.kind;
    const b = world.add(SHAPES[kind], { x: craneX(), y: craneY, angle: held.rot, friction: 0.75, density: 1 });
    const blk = { b, kind, born: simMs, landed: false };
    b.data = { blk };
    blocks.push(blk);
    world.wakeAbove(towerH - 2.2);
    sfx.whoosh(0.5);
    buzz(25);
    if (view) view.add(blk);
    idx++;
    held = null;
    readyAt = simMs + COOLDOWN;
  };
  const rotate = () => {
    if (!held || finished) return;
    held.rot += Math.PI / 2;
    sfx.click(0.6);
  };
  btnDrop.addEventListener('pointerdown', (e) => { e.preventDefault(); drop(); });
  btnRot.addEventListener('pointerdown', (e) => { e.preventDefault(); rotate(); });
  stage.addEventListener('pointerdown', (e) => { e.preventDefault(); drop(); });
  const kd = (e) => { if (e.key === ' ' || e.key === 'ArrowDown') drop(); if (e.key === 'r' || e.key === 'ArrowUp') rotate(); };
  addEventListener('keydown', kd);

  // altura de la torre: lo más alto de las piezas que ya están quietas sobre ella
  const measure = (final) => {
    let h = 0;
    for (const blk of blocks) {
      if (blk.gone) continue;
      const b = blk.b;
      const sp = Math.hypot(b.vx, b.vy);
      if (!final && !b.sleep && sp > 0.35) continue;
      if (final && sp > 1.2) continue;
      if (b.box[1] < -0.5) continue; // colgando por fuera de la plataforma
      h = Math.max(h, b.box[3]);
    }
    return h;
  };

  if (use3d) {
    import('../rt3d.js').then((m) => { if (!dead) { try { view = build3D(m, stage, players, ctx.me); for (const b of blocks) view.add(b); } catch (e) { console.warn(e); } } });
  } else {
    view = build2D(stage.querySelector('.st-2d'), stage);
  }

  let last = performance.now();
  let acc = 0;
  let lastCount = -1;
  let raf = 0;
  const frame = (now) => {
    if (dead) return;
    const wall = now - t0;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    // cuenta regresiva
    if (wall < COUNT) {
      const n = Math.ceil((COUNT - wall) / 1000);
      if (n !== lastCount) { lastCount = n; showMsg(String(n), 0); sfx.count(); }
    } else if (lastCount !== 0) { lastCount = 0; showMsg('¡A construir!', 900); sfx.go(); }
    // física a paso fijo (se pone al día si el celular va lento)
    acc += dt;
    while (acc >= DT) {
      acc -= DT;
      simMs += DT * 1000;
      if (simMs < COUNT) continue;
      if (held) phase += DT * (1.5 + Math.min(idx, 25) * 0.035);
      world.step(DT);
    }
    if (simMs < wall - 200) simMs = wall; // no quedarse atrás del reloj real
    // piezas que se cayeron de la plataforma
    for (const blk of blocks) {
      if (blk.gone || blk.b.y > -2.5) continue;
      blk.gone = true;
      world.remove(blk.b);
      if (view) view.remove(blk);
      lost++;
      sfx.splash(0.4);
      showMsg('{splash} ¡Se cayó una pieza!', 900);
    }
    towerH = measure(simMs >= COUNT + PLAY);
    shownH += (towerH - shownH) * Math.min(1, dt * 6);
    if (towerH > bestH + 0.05 && simMs > COUNT) {
      if (Math.floor(towerH) > Math.floor(bestH) && towerH >= 2) { sfx.ready(); if (view) view.record(towerH); }
      bestH = towerH;
    }
    // la grúa sube con la torre
    const want = Math.max(towerH, 0) + LIFT;
    craneY += (want - craneY) * Math.min(1, dt * 3);
    if (!held && simMs >= readyAt && simMs < COUNT + PLAY) held = { kind: seq[idx % seq.length], rot: 0 };
    // HUD
    hEl.textContent = fmt(shownH);
    const left = Math.max(0, Math.ceil((COUNT + PLAY - Math.max(simMs, COUNT)) / 1000));
    timeEl.textContent = left;
    timeEl.classList.toggle('hot', left <= 5 && simMs < COUNT + PLAY);
    nextEl.innerHTML = `Sigue: <i style="background:${KINDS[seq[(idx + (held ? 1 : 0)) % seq.length]].c}"></i>`;
    btnDrop.disabled = !canDrop();
    btnRot.disabled = !held || finished;
    // últimos segundos
    if (simMs >= COUNT + PLAY - 5000 && simMs < COUNT + PLAY) {
      const s = Math.ceil((COUNT + PLAY - simMs) / 1000);
      if (s !== frame.lastS) { frame.lastS = s; sfx.tick(1.2); }
    }
    if (simMs >= COUNT + PLAY && !frame.stopped) {
      frame.stopped = true;
      held = null;
      sfx.whistle();
      showMsg('{timer} ¡Tiempo! Que no se caiga…', 0);
    }
    // altura de todos (en vivo)
    const live = ctx.results ? ctx.results() : {};
    const hs = {};
    for (const p of players) {
      if (p.id === ctx.me) hs[p.id] = towerH;
      else if (p.b) hs[p.id] = botLive(ctx.seed, p.id, simMs);
      else hs[p.id] = live[p.id] && typeof live[p.id].h === 'number' ? live[p.id].h : 0;
      const s = legend[p.id];
      if (s) { const t = (hs[p.id] || 0).toFixed(1); const bb = s.querySelector('b'); if (bb.textContent !== t) bb.textContent = t; }
    }
    const order = [...players].sort((a, b) => (hs[b.id] || 0) - (hs[a.id] || 0));
    order.forEach((p, i) => { const s = legend[p.id]; if (s) { s.style.order = i; s.classList.toggle('lead', i === 0 && (hs[p.id] || 0) > 0.2); } });
    // enviar mi altura de vez en cuando (la última que llega es la que cuenta)
    if (!finished && now - lastSend > 600 && Math.abs(towerH - lastSentH) > 0.05) {
      lastSend = now; lastSentH = towerH;
      ctx.submit({ h: Math.round(towerH * 100) / 100 });
    }
    if (simMs >= TOTAL - 150 && !finished) {
      finished = true;
      const h = measure(true);
      ctx.submit({ h: Math.round(h * 100) / 100, done: 1 });
      const best = Math.max(...players.filter((p) => p.id !== ctx.me).map((p) => hs[p.id] || 0), 0);
      if (h > 0 && h >= best) { sfx.win(); showMsg(`{trophy} ¡Torre de ${fmt(h)}!`, 0); }
      else showMsg(`Tu torre: ${fmt(h)}`, 0);
      if (view) view.finish(h);
    }
    if (view) view.render({ blocks, held, x: craneX(), craneY, towerH, simMs, hs, players, me: ctx.me, canDrop: canDrop() });
    raf = requestAnimationFrame(frame);
  };
  ctx.submit({ h: 0 });
  raf = requestAnimationFrame(frame);

  return () => {
    dead = true;
    cancelAnimationFrame(raf);
    removeEventListener('keydown', kd);
    clearTimeout(showMsg.t);
    if (view) view.dispose();
  };
}

// ---------------------------------------------------------------- 3D
function build3D(m, stage, players, meId) {
  const { THREE, miniStage } = m;
  const S = miniStage(stage, { skyTop: '#4cc9f0', skyBottom: '#caf0f8', hemiGround: '#6a4c93', fov: 40 });
  const { scene, camera, particles, sun } = S;
  scene.add(sun.target);
  const DEPTH = 0.9;
  // suelo, montañas y la plataforma de piedra
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshStandardMaterial({ color: '#80ed99', roughness: 0.9 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -2.6, -6);
  ground.receiveShadow = true;
  scene.add(ground);
  for (let i = 0; i < 7; i++) {
    const h = 4 + (i * 37 % 5);
    const mt = new THREE.Mesh(new THREE.ConeGeometry(3 + (i % 3), h, 5), new THREE.MeshStandardMaterial({ color: i % 2 ? '#5390d9' : '#6930c3', roughness: 1, flatShading: true }));
    mt.position.set(-15 + i * 5, -2.6 + h / 2, -16 - (i % 3) * 3);
    scene.add(mt);
  }
  const stone = new THREE.MeshStandardMaterial({ color: '#adb5bd', roughness: 0.8 });
  const plat = new THREE.Mesh(new THREE.BoxGeometry(BASE_HW * 2, 0.8, DEPTH + 0.5), new THREE.MeshStandardMaterial({ color: '#ffd166', roughness: 0.6 }));
  plat.position.y = -0.4;
  plat.receiveShadow = true;
  plat.castShadow = true;
  scene.add(plat);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 2.2, 8), stone);
  col.position.y = -1.9;
  col.castShadow = true;
  scene.add(col);
  // grúa: barra y gancho
  const steel = new THREE.MeshStandardMaterial({ color: '#2b2d42', metalness: 0.6, roughness: 0.35 });
  const rail = new THREE.Mesh(new THREE.BoxGeometry(SWING * 2 + 1.4, 0.08, 0.08), steel);
  scene.add(rail);
  const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), steel);
  scene.add(hook);
  // guía: hacia dónde va a caer
  const guide = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 1), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false }));
  scene.add(guide);
  // mi récord y las alturas de los demás
  const lines = players.map((p) => {
    const ln = new THREE.Mesh(new THREE.PlaneGeometry(BASE_HW * 2 + 1.6, 0.05), new THREE.MeshBasicMaterial({ color: p.c, transparent: true, opacity: 0.85, depthWrite: false }));
    ln.position.z = DEPTH / 2 + 0.05;
    ln.visible = false;
    scene.add(ln);
    const flag = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), new THREE.MeshBasicMaterial({ color: p.c }));
    flag.position.set(BASE_HW + 0.85, 0, DEPTH / 2 + 0.06);
    ln.add(flag);
    flag.position.set((BASE_HW * 2 + 1.6) / 2, 0, 0);
    return { p, ln };
  });

  const geoCache = {};
  const geoOf = (kind) => {
    if (geoCache[kind]) return geoCache[kind];
    const sh = new THREE.Shape(SHAPES[kind].v.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: DEPTH, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 2 });
    g.translate(0, 0, -DEPTH / 2);
    geoCache[kind] = g;
    return g;
  };
  const matOf = {};
  const material = (kind) => (matOf[kind] = matOf[kind] || new THREE.MeshStandardMaterial({ color: KINDS[kind].c, roughness: 0.45 }));
  const heldMesh = { kind: null, mesh: null };
  const ghostMat = {};

  let camY = 2;
  let finishAt = -1;
  const fitCam = (towerTop) => {
    const vf = Math.tan((camera.fov * Math.PI) / 360);
    const halfW = SWING + 1.3;
    const halfH = 4.4;
    const dist = Math.max(halfW / (vf * S.aspect), halfH / vf);
    camY += (Math.max(1.6, towerTop + 0.8) - camY) * 0.05;
    camera.position.set(0, camY + 0.9, dist);
    camera.lookAt(0, camY, 0);
    sun.position.set(1.5, camY + 4, 3);
    sun.target.position.set(0, camY - 1, 0);
    Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 5, bottom: -5 });
    sun.shadow.camera.updateProjectionMatrix();
  };

  let state = null;
  S.start(() => {
    if (!state) return;
    const st = state;
    fitCam(st.finished ? st.towerH : Math.max(st.towerH, st.craneY - LIFT));
    for (const blk of st.blocks) {
      if (!blk.mesh) continue;
      blk.mesh.position.set(blk.b.x, blk.b.y, 0);
      blk.mesh.rotation.z = blk.b.a;
    }
    rail.position.set(0, st.craneY + 0.75, -0.2);
    hook.position.set(st.x, st.craneY + 0.45, 0);
    if (st.held) {
      if (heldMesh.kind !== st.held.kind) {
        if (heldMesh.mesh) scene.remove(heldMesh.mesh);
        heldMesh.kind = st.held.kind;
        ghostMat[st.held.kind] = ghostMat[st.held.kind] || new THREE.MeshStandardMaterial({ color: KINDS[st.held.kind].c, roughness: 0.45, transparent: true, opacity: 0.85 });
        heldMesh.mesh = new THREE.Mesh(geoOf(st.held.kind), ghostMat[st.held.kind]);
        heldMesh.mesh.castShadow = true;
        heldMesh.mesh.scale.setScalar(0.2);
        scene.add(heldMesh.mesh);
      }
      const hm = heldMesh.mesh;
      hm.visible = true;
      hm.scale.setScalar(Math.min(1, hm.scale.x + 0.12));
      hm.position.set(st.x, st.craneY, 0);
      hm.rotation.z += (st.held.rot - hm.rotation.z) * 0.35;
      guide.visible = true;
      const gTop = st.craneY - 0.5, gBot = Math.max(0, st.towerH);
      guide.scale.y = Math.max(0.01, gTop - gBot);
      guide.position.set(st.x, (gTop + gBot) / 2, DEPTH / 2 + 0.02);
      hook.visible = true;
    } else {
      if (heldMesh.mesh) heldMesh.mesh.visible = false;
      heldMesh.kind = null;
      if (heldMesh.mesh) { scene.remove(heldMesh.mesh); heldMesh.mesh = null; }
      guide.visible = false;
    }
    for (const { p, ln } of lines) {
      const h = st.hs[p.id] || 0;
      ln.visible = h > 0.2;
      ln.position.y += (h - ln.position.y) * 0.15;
      ln.material.opacity = p.id === meId ? 0.35 : 0.85;
    }
  });

  return {
    add(blk) {
      const mesh = new THREE.Mesh(geoOf(blk.kind), material(blk.kind));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.set(blk.b.x, blk.b.y, 0);
      mesh.rotation.z = blk.b.a;
      scene.add(mesh);
      blk.mesh = mesh;
    },
    remove(blk) { if (blk.mesh) { particles.burst(blk.b.x, -2.4, 0.3, { n: 16, color: ['#ffffff', KINDS[blk.kind].c], speed: 0.8, up: 1.2, size: 0.08, life: 0.7, gravity: 3 }); scene.remove(blk.mesh); blk.mesh = null; } },
    dust(blk) { particles.burst(blk.b.x, blk.b.box[1], 0.4, { n: 8, color: ['#ffffff', '#e9ecef'], speed: 0.5, up: 0.3, size: 0.06, life: 0.5, gravity: 0.5 }); },
    record(h) { particles.burst(0, h + 0.2, 0.5, { n: 30, color: ['#ffd60a', '#ffffff', '#06d6a0'], speed: 1, up: 1.2, size: 0.06, life: 0.9, gravity: 1.5 }); },
    finish(h) { finishAt = performance.now(); particles.burst(0, h + 0.3, 0.5, { n: 70, color: ['#ffd60a', '#ff4d6d', '#3a86ff', '#06d6a0', '#ffffff'], speed: 1.6, up: 2, size: 0.07, life: 1.5, gravity: 2 }); },
    render(st) { state = { ...st, finished: finishAt > 0 }; },
    dispose: () => S.dispose(),
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
  let camY = 2;
  const poly = (kind, x, y, a, sc) => {
    const c = Math.cos(a), s = Math.sin(a);
    g.beginPath();
    SHAPES[kind].v.forEach(([lx, ly], i) => { const px = x + c * lx - s * ly, py = y + s * lx + c * ly; const X = W / 2 + px * sc, Y = H / 2 - (py - camY) * sc; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); });
    g.closePath();
    g.fillStyle = KINDS[kind].c; g.fill();
    g.lineWidth = 2; g.strokeStyle = '#1b1035'; g.stroke();
  };
  return {
    add() {}, remove() {}, dust() {}, record() {}, finish() {},
    render(st) {
      const sc = Math.min(W / ((SWING + 1.3) * 2), H / 9);
      camY += (Math.max(1.6, Math.max(st.towerH, st.craneY - LIFT) + 0.8) - camY) * 0.05;
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#4cc9f0'); gr.addColorStop(1, '#caf0f8');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      const Y = (y) => H / 2 - (y - camY) * sc;
      g.fillStyle = '#ffd166'; g.fillRect(W / 2 - BASE_HW * sc, Y(0), BASE_HW * 2 * sc, 0.8 * sc);
      for (const p of st.players) {
        const h = st.hs[p.id] || 0;
        if (h < 0.2) continue;
        g.fillStyle = p.c; g.globalAlpha = p.id === st.me ? 0.4 : 0.9; g.fillRect(W / 2 - (BASE_HW + 0.8) * sc, Y(h) - 1, (BASE_HW + 0.8) * 2 * sc, 3); g.globalAlpha = 1;
      }
      for (const blk of st.blocks) if (!blk.gone) poly(blk.kind, blk.b.x, blk.b.y, blk.b.a, sc);
      g.fillStyle = '#2b2d42'; g.fillRect(W / 2 - (SWING + 0.7) * sc, Y(st.craneY + 0.75), (SWING + 0.7) * 2 * sc, 4);
      if (st.held) {
        g.globalAlpha = 0.9; poly(st.held.kind, st.x, st.craneY, st.held.rot, sc); g.globalAlpha = 1;
        g.setLineDash([4, 6]); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.moveTo(W / 2 + st.x * sc, Y(st.craneY - 0.5)); g.lineTo(W / 2 + st.x * sc, Y(Math.max(0, st.towerH))); g.stroke(); g.setLineDash([]);
      }
    },
    dispose() { ro.disconnect(); },
  };
}
