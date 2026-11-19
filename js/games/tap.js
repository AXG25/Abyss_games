// 👊 Machaca el botón — carrera de torres (3D).
// Cada toque agrega un bloque a tu torre y tu personaje va subiendo encima.
// Se ven las torres de todos en vivo; gana la más alta a los 8 segundos.
import { mulberry32, beep, buzz } from '../util.js';
import { sfx } from '../audio.js';
import { USE_2D } from '../rt.js';

const DUR = 8000;
const hash = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
// bots deterministas: todos los teléfonos ven crecer igual sus torres
function botFinal(seed, id) { return Math.floor(25 + mulberry32((seed ^ hash(id)) >>> 0)() * 35); }
function botAt(seed, id, ms) {
  const f = botFinal(seed, id);
  const k = Math.max(0, Math.min(1, ms / DUR));
  return Math.min(f, Math.floor(f * k + Math.sin(ms / 170 + hash(id)) * 0.8));
}

export default {
  id: 'tap',
  name: 'Machaca el botón',
  uses3d: true,
  desc: '¡Carrera de torres! Cada toque al botón agrega un bloque a tu torre. Toca lo más rápido que puedas durante 8 segundos: gana la torre más alta.',
  dur: () => DUR,

  mount(el, ctx) {
    let webgl = false;
    try { const c = document.createElement('canvas'); webgl = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { /* nada */ }
    if (USE_2D() || !webgl || !ctx.players) return mount2D(el, ctx);
    return mount3D(el, ctx);
  },

  evaluate(v) {
    if (!v || typeof v.n !== 'number') return null;
    const n = Math.max(0, Math.min(200, Math.floor(v.n)));
    return { score: n, label: `${n} bloques` };
  },

  bot: (r, seed, p) => ({ n: botFinal(seed, p?.id || 'bot0') }),
};

// ---------------------------------------------------------------- 3D
function mount3D(el, ctx) {
  el.innerHTML = `
    <div class="g-tower">
      <div class="g-bar"><i></i></div>
      <div class="tw-stage"></div>
      <button class="g-tapbtn tw-btn" style="--c:${ctx.color}">¡TOCA!</button>
    </div>`;
  const stage = el.querySelector('.tw-stage');
  const bar = el.querySelector('.g-bar i');
  const btn = el.querySelector('.tw-btn');
  let n = 0;
  let over = false;
  let view = null;
  let dead = false;
  const t0 = performance.now();

  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (over) return;
    n++;
    ctx.submit({ n });
    sfx.tick(0.6);
    beep(300 + Math.min(n, 120) * 6, 0.03, 'square', 0.03);
    btn.classList.remove('pop');
    void btn.offsetWidth;
    btn.classList.add('pop');
  });

  import('../rt3d.js').then((m) => {
    if (!dead) { try { view = buildTowers(m, stage, ctx, () => n, t0); } catch (e) { console.warn(e); } }
  });

  const iv = setInterval(() => {
    const p = (performance.now() - t0) / DUR;
    bar.style.width = Math.max(0, 100 - p * 100) + '%';
    if (p >= 1 && !over) {
      over = true;
      btn.disabled = true;
      btn.textContent = '¡Tiempo!';
      buzz(80);
      if (view) view.finish();
      clearInterval(iv);
    }
  }, 50);

  return () => {
    dead = true;
    clearInterval(iv);
    if (view) view.dispose();
  };
}

function buildTowers(m, stage, ctx, myCount, t0) {
  const { THREE, makeCharacter, Particles, emojiTexture } = m;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.className = 'k-3d';
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const skyC = document.createElement('canvas');
  skyC.width = 4; skyC.height = 256;
  const sg = skyC.getContext('2d');
  const gr = sg.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#4361ee'); gr.addColorStop(0.6, '#7cc6fe'); gr.addColorStop(1, '#d6f0ff');
  sg.fillStyle = gr; sg.fillRect(0, 0, 4, 256);
  const skyTex = new THREE.CanvasTexture(skyC);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;

  scene.add(new THREE.HemisphereLight('#ffffff', '#4f772d', 1.2));
  const sun = new THREE.DirectionalLight('#ffffff', 2.2);
  sun.position.set(1.5, 4, 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 4, bottom: -1, near: 0.5, far: 12 });
  sun.shadow.bias = -0.002;
  scene.add(sun);

  // pasto y nubes
  const ground = new THREE.Mesh(new THREE.CircleGeometry(8, 48), new THREE.MeshStandardMaterial({ color: '#80b918', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 });
  const clouds = [];
  for (let i = 0; i < 8; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.18 + (k % 2) * 0.06, 12, 10), cloudMat);
      s.position.set(k * 0.18 - 0.27, (k % 2) * 0.06, 0);
      c.add(s);
    }
    c.position.set(-3 + (i % 4) * 1.8, 1.2 + i * 0.6, -3.5 - (i % 3) * 0.6);
    scene.add(c);
    clouds.push(c);
  }

  const particles = new Particles(scene, 500);

  // ---- una torre por jugador
  const N = ctx.players.length;
  const GAP = 0.5;
  const BH = 0.034;          // alto de cada bloque
  const BW = 0.3;
  const MAXB = 220;
  const blockGeo = new THREE.BoxGeometry(BW, BH * 0.96, BW);
  const U = 0.07;
  const towers = ctx.players.map((p, i) => {
    const x = (i - (N - 1) / 2) * GAP;
    const col = new THREE.Color(p.c);
    const mesh = new THREE.InstancedMesh(blockGeo, new THREE.MeshStandardMaterial({ roughness: 0.5 }), MAXB);
    mesh.count = 0;
    mesh.frustumCulled = false; // sus bloques cambian todo el tiempo: siempre dibujar
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    // base de piedra
    const base = new THREE.Mesh(new THREE.CylinderGeometry(BW * 0.8, BW * 0.9, 0.05, 20), new THREE.MeshStandardMaterial({ color: '#8d99ae' }));
    base.position.set(x, 0.025, 0);
    base.receiveShadow = true;
    scene.add(base);
    const ch = makeCharacter({ c: p.c, a: p.a, id: p.id }, U);
    ch.rig.rotation.y = 0;
    scene.add(ch.root);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture('0', { font: 'bold 70px system-ui' }), depthTest: false, transparent: true }));
    label.scale.set(0.22, 0.22, 1);
    label.renderOrder = 10;
    scene.add(label);
    return { p, x, col, mesh, ch, label, n: 0, shown: 0, hop: 0, labelN: -1, isMe: p.id === ctx.me };
  });
  const tmpM = new THREE.Matrix4();
  const tmpC = new THREE.Color();

  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 40);
  let aspect = 1;
  const fit = () => {
    const w = Math.max(50, stage.clientWidth), h = Math.max(50, stage.clientHeight);
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px';
    renderer.domElement.style.height = h + 'px';
    aspect = w / h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    particles.mat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
  };
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(stage);

  let finished = false;
  let winner = null;
  let crown = null;
  let camH = 0.6;
  let last = performance.now();
  let raf = 0;
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const ms = Math.min(DUR, now - t0);
    const live = ctx.results ? ctx.results() : {};
    let maxN = 1;
    for (const tw of towers) {
      // cuántos bloques tiene cada uno
      if (!finished) {
        if (tw.isMe) tw.n = myCount();
        else if (tw.p.b) tw.n = botAt(ctx.seed, tw.p.id, ms);
        else if (live[tw.p.id] && typeof live[tw.p.id].n === 'number') tw.n = Math.min(MAXB, Math.max(tw.n, Math.floor(live[tw.p.id].n)));
      }
      maxN = Math.max(maxN, tw.n);
      // agregar bloques nuevos (con "pop")
      while (tw.shown < Math.min(tw.n, MAXB)) {
        const i = tw.shown++;
        const shade = i % 10 === 9 ? 1.25 : i % 2 ? 0.88 : 1;
        tmpC.copy(tw.col).multiplyScalar(shade);
        tw.mesh.setColorAt(i, tmpC);
        tw.mesh.count = tw.shown;
        tw.hop = 1;
        tw.pop = 1;
        if (i % 10 === 9) particles.burst(tw.x, (i + 1) * BH, 0, { n: 10, color: ['#ffffff', '#ffd23f', tw.p.c], speed: 0.6, up: 0.6, size: 0.04, life: 0.6, gravity: 1.5 });
        else if (tw.isMe || Math.random() < 0.3) particles.burst(tw.x, (i + 1) * BH, 0, { n: 3, color: ['#ffffff', tw.p.c], speed: 0.4, up: 0.3, size: 0.03, life: 0.35, gravity: 1 });
      }
      for (let i = Math.max(0, tw.shown - 3); i < tw.shown; i++) {
        const k = i === tw.shown - 1 ? tw.pop : 0;
        const sc = 1 + k * 0.35;
        tmpM.makeScale(sc, 1, sc);
        tmpM.setPosition(tw.x, BH * (i + 0.5) + 0.05, 0);
        tw.mesh.setMatrixAt(i, tmpM);
      }
      for (let i = 0; i < Math.max(0, tw.shown - 3); i++) {
        if (tw._placed > i) continue;
        tmpM.makeScale(1, 1, 1);
        tmpM.setPosition(tw.x, BH * (i + 0.5) + 0.05, 0);
        tw.mesh.setMatrixAt(i, tmpM);
        tw._placed = i + 1;
      }
      tw.mesh.instanceMatrix.needsUpdate = true;
      if (tw.mesh.instanceColor) tw.mesh.instanceColor.needsUpdate = true;
      tw.pop = Math.max(0, (tw.pop || 0) - dt * 8);
      // personaje arriba: salta un poquito con cada bloque
      tw.hop = Math.max(0, tw.hop - dt * 7);
      const topY = tw.shown * BH + 0.05;
      tw.ch.root.position.set(tw.x, topY + Math.sin(tw.hop * Math.PI) * 0.05, 0);
      const [armR, armL] = tw.ch.arms;
      const pump = Math.sin(now / 60) * 0.5 * (tw.hop > 0 ? 1 : 0.2);
      armR.rotation.x = -2.4 + pump; armL.rotation.x = -2.4 - pump;
      if (finished && tw === winner) { armR.rotation.x = -3 + Math.sin(now / 120) * 0.3; armL.rotation.x = -3 - Math.sin(now / 120) * 0.3; tw.ch.rig.rotation.y += dt * 4; }
      tw.ch.headObj.blink(now / 1000 + tw.x * 3);
      // número arriba
      if (tw.labelN !== tw.n) { tw.labelN = tw.n; tw.label.material.map = emojiTexture(String(tw.n), { font: 'bold 70px system-ui' }); tw.label.material.needsUpdate = true; }
      tw.label.position.set(tw.x, topY + U * 5.2, 0);
    }
    // la cámara sube y se aleja para que quepan todas las torres
    const topH = maxN * BH + 0.45;
    camH += (topH - camH) * Math.min(1, dt * 3);
    const vf = Math.tan((camera.fov * Math.PI) / 360);
    const needW = (N * GAP) / 2 + 0.25;
    const dist = Math.max(needW / (vf * aspect), (camH * 0.62) / vf, 1.4);
    camera.position.set(0, camH * 0.55 + 0.25, dist);
    camera.lookAt(0, camH * 0.5, 0);
    clouds.forEach((c, i) => { c.position.x = ((-3 + (i % 4) * 1.8 + now / 6000) % 7.5) - 3.2; });
    particles.update(dt);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    finish() {
      finished = true;
      winner = towers.reduce((a, b) => (b.n > a.n ? b : a), towers[0]);
      if (winner && winner.n > 0) {
        // corona y confeti para la torre más alta
        crown = new THREE.Group();
        const gold = new THREE.MeshStandardMaterial({ color: '#ffd23f', metalness: 0.6, roughness: 0.3, emissive: '#ffb703', emissiveIntensity: 0.3 });
        const ringM = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.05, 16, 1, true), gold);
        crown.add(ringM);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const sp = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 6), gold);
          sp.position.set(Math.cos(a) * 0.07, 0.05, Math.sin(a) * 0.07);
          crown.add(sp);
        }
        crown.position.y = winner.ch.headY + 0.1;
        winner.ch.root.add(crown);
        particles.burst(winner.x, winner.shown * BH + 0.3, 0, { n: 70, color: ['#ffd60a', '#ff4d6d', '#3a86ff', '#06d6a0', '#ffffff'], speed: 1, up: 1.8, size: 0.05, life: 1.6, gravity: 2 });
        if (winner.isMe) sfx.win(); else sfx.go();
      }
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

// ---------------------------------------------------------------- 2D (respaldo)
function mount2D(el, ctx) {
  let n = 0;
  let over = false;
  const t0 = performance.now();
  el.innerHTML = `
    <div class="g-tap">
      <div class="g-bar"><i></i></div>
      <div class="g-big-num">0</div>
      <button class="g-tapbtn" style="--c:${ctx.color}">¡TOCA!</button>
    </div>`;
  const num = el.querySelector('.g-big-num');
  const bar = el.querySelector('.g-bar i');
  const btn = el.querySelector('.g-tapbtn');
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (over) return;
    n++;
    num.textContent = n;
    ctx.submit({ n });
    beep(300 + Math.min(n, 120) * 5, 0.03);
    btn.classList.remove('pop');
    void btn.offsetWidth;
    btn.classList.add('pop');
  });
  const iv = setInterval(() => {
    const p = (performance.now() - t0) / DUR;
    bar.style.width = Math.max(0, 100 - p * 100) + '%';
    if (p >= 1 && !over) {
      over = true;
      btn.disabled = true;
      btn.textContent = '¡Tiempo!';
      buzz(80);
      clearInterval(iv);
    }
  }, 50);
  return () => clearInterval(iv);
}
