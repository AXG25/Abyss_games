// Vista 3D (Three.js) para los juegos en tiempo real.
//
// La simulación es en el plano (x, y) con salto en z; aquí se dibuja en 3D:
// x → X, y → Z, z (salto) → altura. Cada juego aporta su escenario con
// G.scene3d = { sky, setup(S, W), update(S, t, W, ext, ents), makeAvatar? }.
// Este módulo pone cámara (con entrada épica y sacudidas), luces, sombras,
// partículas y los personajes animados (caminar, saltar, golpe, impulso, caída).
import * as THREE from '../vendor/three.module.min.js';
import { avatarImage } from './icons.js';
import { makeHead, makeGhost } from './head3d.js';

export { THREE };

export function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

// ---------------------------------------------------------------- texturas
const texCache = new Map();
export function emojiTexture(txt, opts = {}) {
  const key = txt + '|' + (opts.font || '');
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (opts.font) {
    g.font = opts.font;
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(0,0,0,0.7)';
    g.strokeText(txt, 64, 68);
    g.fillStyle = '#fff';
    g.fillText(txt, 64, 68);
  } else {
    g.font = "100px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'";
    g.fillText(txt, 64, 74);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
}

 // Textura de la cara de un personaje (dibujado en SVG).
const avTex = new Map();
export function avatarTexture(id) {
  if (avTex.has(id)) return avTex.get(id);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const img = avatarImage(id);
  const draw = () => { c.getContext('2d').drawImage(img, 0, 0, 256, 256); tex.needsUpdate = true; };
  if (img.complete && img.naturalWidth) draw(); else img.addEventListener('load', draw, { once: true });
  avTex.set(id, tex);
  return tex;
}

export const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, ...extra });

// ---------------------------------------------------------------- partículas
// Un solo sistema de puntos con tamaño, color y transparencia por partícula.
export class Particles {
  constructor(scene, max = 900) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.siz = new Float32Array(max);
    this.alp = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.age = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grow = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.siz, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alp, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 color;
        varying float vA; varying vec3 vC; uniform float uScale;
        void main() {
          vA = alpha; vC = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA; varying vec3 vC;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float a = vA * smoothstep(0.5, 0.15, d);
          gl_FragColor = vec4(vC * (1.0 + 0.6 * smoothstep(0.3, 0.0, d)), a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.tmp = new THREE.Color();
  }
  burst(x, y, z, o = {}) {
    const n = o.n ?? 12;
    const cols = Array.isArray(o.color) ? o.color : [o.color || '#ffffff'];
    for (let k = 0; k < n; k++) {
      if (this.n >= this.max) this.n = 0;
      const i = this.n++;
      const a = Math.random() * Math.PI * 2;
      const sp = (o.speed ?? 0.6) * (0.4 + Math.random() * 0.8);
      const up = (o.up ?? 0.6) * (0.5 + Math.random());
      const sx = (o.spread ?? 0) * (Math.random() - 0.5);
      const sz = (o.spread ?? 0) * (Math.random() - 0.5);
      this.pos.set([x + sx, y, z + sz], i * 3);
      const dir = o.dir;
      if (dir) this.vel.set([dir[0] * sp + (Math.random() - 0.5) * 0.2, up, dir[1] * sp + (Math.random() - 0.5) * 0.2], i * 3);
      else this.vel.set([Math.cos(a) * sp, up, Math.sin(a) * sp], i * 3);
      this.tmp.set(cols[k % cols.length]);
      this.col.set([this.tmp.r, this.tmp.g, this.tmp.b], i * 3);
      this.siz[i] = (o.size ?? 0.04) * (0.6 + Math.random() * 0.8);
      this.life[i] = (o.life ?? 0.7) * (0.6 + Math.random() * 0.7);
      this.age[i] = 0;
      this.alp[i] = 1;
      this.grav[i] = o.gravity ?? 2.2;
      this.drag[i] = o.drag ?? 1.5;
      this.grow[i] = o.grow ?? 0;
    }
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.alp[i] <= 0) continue;
      this.age[i] += dt;
      const k = this.age[i] / this.life[i];
      if (k >= 1) { this.alp[i] = 0; this.siz[i] = 0; continue; }
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 2] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] = Math.max(-0.5, this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt);
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.siz[i] *= 1 + this.grow[i] * dt;
      this.alp[i] = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
    g.attributes.alpha.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- personaje
// Muñequito con piernas, brazos, torso y la cabeza con su emoji.
export function makeCharacter(e, PR) {
  const U = PR; // unidad de tamaño
  const color = new THREE.Color(e.c || '#ffffff');
  const light = color.clone().lerp(new THREE.Color('#ffffff'), 0.45);
  const dark = color.clone().lerp(new THREE.Color('#000000'), 0.45);
  const mBody = std(color, { roughness: 0.45 });
  const mLight = std(light, { roughness: 0.5 });
  const mDark = std(dark, { roughness: 0.6 });
  const mShoe = std('#2b2d42', { roughness: 0.5 });
  const mHand = std('#fff1e6', { roughness: 0.6 });
  const cast = (m) => { m.castShadow = true; return m; };

  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  const hipY = 0.95 * U;
  // piernas
  const legGeo = new THREE.CapsuleGeometry(0.2 * U, 0.42 * U, 3, 8);
  const footGeo = new THREE.SphereGeometry(0.26 * U, 10, 8);
  const legs = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.32 * U, hipY, 0);
    const leg = cast(new THREE.Mesh(legGeo, mDark));
    leg.position.y = -0.38 * U;
    pivot.add(leg);
    const foot = cast(new THREE.Mesh(footGeo, mShoe));
    foot.scale.set(1, 0.6, 1.35);
    foot.position.set(0, -0.78 * U, 0.08 * U);
    pivot.add(foot);
    rig.add(pivot);
    return pivot;
  });
  // torso
  const torso = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.55 * U, 0.45 * U, 4, 14), mBody));
  torso.position.y = hipY + 0.6 * U;
  rig.add(torso);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.42 * U, 14, 10), mLight);
  belly.scale.set(1, 1.1, 0.5);
  belly.position.set(0, -0.05 * U, 0.36 * U);
  torso.add(belly);
  // cinturón
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.55 * U, 0.07 * U, 6, 20), mDark);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = -0.32 * U;
  torso.add(belt);
  // brazos
  const armGeo = new THREE.CapsuleGeometry(0.15 * U, 0.42 * U, 3, 8);
  const handGeo = new THREE.SphereGeometry(0.19 * U, 10, 8);
  const arms = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.68 * U, hipY + 1.0 * U, 0);
    const arm = cast(new THREE.Mesh(armGeo, mBody));
    arm.position.y = -0.33 * U;
    pivot.add(arm);
    const hand = cast(new THREE.Mesh(handGeo, mHand));
    hand.position.y = -0.68 * U;
    pivot.add(hand);
    pivot.rotation.z = s * 0.18;
    rig.add(pivot);
    return pivot;
  });
  // cabeza: modelo 3D del personaje (gira con el cuerpo)
  const headY = hipY + 1.85 * U;
  const head = makeHead(THREE, e.a || 'frog', 0.78 * U);
  head.group.position.y = headY;
  rig.add(head.group);
  // fantasma (cuando lo eliminan)
  const ghostM = makeGhost(THREE, 0.9 * U);
  ghostM.position.y = 1.6 * U;
  ghostM.visible = false;
  root.add(ghostM);
  return { root, rig, legs, arms, torso, head: head.group, headObj: head, ghostM, headY, U, height: headY + 1.1 * U };
}

// ---------------------------------------------------------------- vista
export function createView3D(board, G, W, opts = {}) {
  const cfg = G.scene3d;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const el = renderer.domElement;
  el.className = 'k-3d';
  board.appendChild(el);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(cfg.sky || '#87ceeb');
  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 60);

  scene.add(new THREE.HemisphereLight(cfg.hemiSky || '#ffffff', cfg.hemiGround || '#556070', 1.1));
  const sun = new THREE.DirectionalLight('#ffffff', 2.2);
  sun.position.set(1.4, 3.2, 1.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -1.6, right: 1.6, top: 1.6, bottom: -1.6, near: 0.5, far: 8 });
  sun.shadow.bias = -0.0015;
  sun.shadow.normalBias = 0.01;
  scene.add(sun);

  const particles = new Particles(scene);
  scene.add(sun.target);
  const S = { THREE, scene, camera, renderer, board, sun, W, objs: {}, t: 0, particles, makeWater, emojiTexture, avatarTexture, std, makeHead: (id, r) => makeHead(THREE, id, r), makeGhost: (r) => makeGhost(THREE, r), makeCharacter };
  let shakeAmt = 0;
  S.shake = (a) => { shakeAmt = Math.min(0.08, Math.max(shakeAmt, a)); };
  S.burst = (x, y, z, o) => particles.burst(x, y, z, o);
  cfg.setup(S, W);

  const PR = (G.PR || 0.06) * (cfg.charScale ?? 1.6);
  const avatars = new Map();
  const ringGeo = new THREE.RingGeometry(PR * 1.0, PR * 1.3, 32);

  const makeAvatar = (e) => {
    const isMe = e.id === opts.meId;
    const ch = cfg.makeAvatar ? cfg.makeAvatar(S, e, PR) : makeCharacter(e, PR);
    scene.add(ch.root);
    let ring = null;
    if (isMe) {
      ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.006;
      scene.add(ring);
    }
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ depthWrite: false, depthTest: false, transparent: true }));
    tag.scale.set(PR * 2.2, PR * 2.2, 1);
    tag.position.y = (ch.height || PR * 3.4) + PR * 1.2;
    tag.visible = false;
    tag.renderOrder = 6;
    ch.root.add(tag);
    return { ...ch, ring, tag, isMe, tagTxt: null, ghost: false, yaw: 0, phase: 0, spd: 0, px: e.x, py: e.y, pz: 0, pinv: 0, pscale: 1, spin: 0, dashT: 0 };
  };

  // ---- cámara: entrada en barrido y luego fija, con sacudidas
  const camBase = new THREE.Vector3();
  const look = new THREE.Vector3(0, 0, cfg.camLookZ ?? 0.12);
  const fit = () => {
    const w = Math.max(50, board.clientWidth), h = Math.max(50, board.clientHeight);
    renderer.setSize(w, h, false);
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    camera.aspect = w / h;
    const elev = ((cfg.camElev ?? 58) * Math.PI) / 180;
    const vf = (camera.fov * Math.PI) / 360;
    const hf = Math.atan(Math.tan(vf) * camera.aspect);
    const need = cfg.camFit ?? 1.06;
    const needZ = cfg.camFitZ ?? need * 0.95;
    const dist = Math.max(need / Math.tan(hf), needZ / Math.tan(vf)) * 1.05;
    const yaw = ((cfg.camYaw ?? 0) * Math.PI) / 180;
    const back = Math.cos(elev) * dist + (cfg.follow ? 0 : (cfg.camShift ?? 0.12));
    camBase.set(Math.sin(yaw) * back, Math.sin(elev) * dist, Math.cos(yaw) * back);
    camera.updateProjectionMatrix();
    particles.mat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(vf));
  };
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(board);

  let lastT = null;
  let introClock = 0;
  const camDir = new THREE.Vector3();
  let wallLast = performance.now();
  const render = (t, ents, ext) => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - wallLast) / 1000);
    wallLast = now;
    S.t = t;
    cfg.update(S, t, W, ext, ents, dt);
    // cámara
    introClock += dt;
    const intro = Math.min(1, introClock / 2.6);
    const ease = 1 - Math.pow(1 - intro, 3);
    const ang = (1 - ease) * 0.9;
    const zoom = 1 + (1 - ease) * 0.6;
    camera.position.set(
      camBase.x * zoom * Math.cos(ang) + camBase.z * zoom * Math.sin(ang),
      camBase.y * zoom,
      camBase.z * zoom * Math.cos(ang) - camBase.x * zoom * Math.sin(ang),
    );
    if (shakeAmt > 0.0005) {
      camera.position.x += (Math.random() - 0.5) * shakeAmt;
      camera.position.y += (Math.random() - 0.5) * shakeAmt;
      shakeAmt *= Math.pow(0.02, dt);
    }
    // cámara que sigue a mi jugador (carreras): mira un poco hacia adelante
    if (cfg.follow) {
      const me = ents.find((e) => e.id === opts.meId);
      if (me) {
        const ah = cfg.lookAhead ? cfg.lookAhead(me) : { x: 0, y: 0 };
        const tx = me.x + ah.x, tz = me.y + ah.y;
        if (!S.fol) S.fol = { x: tx, z: tz };
        const k = 1 - Math.pow(0.004, dt);
        S.fol.x += (tx - S.fol.x) * k;
        S.fol.z += (tz - S.fol.z) * k;
      }
      if (S.fol) {
        camera.position.x += S.fol.x;
        camera.position.z += S.fol.z;
        look.set(S.fol.x, 0, S.fol.z);
        sun.position.set(S.fol.x + 1.4, 3.2, S.fol.z + 1.2);
        sun.target.position.set(S.fol.x, 0, S.fol.z);
      }
    }
    camera.lookAt(look);

    const seen = new Set();
    for (const e of ents) {
      seen.add(e.id);
      let a = avatars.get(e.id);
      if (!a) { a = makeAvatar(e); avatars.set(e.id, a); }
      const scale = e.e && typeof e.e.f === 'number' ? e.e.f : (e.scale ?? 1);
      const ghost = !!e.out;
      const z = e.z || 0;
      const inv = e.inv > 0 ? 1 : 0;
      const dashing = !!(e.dash > 0 || e.d);

      // ---- eventos visuales (y sonido para los demás jugadores)
      const ev = (type) => opts.onEvent && opts.onEvent(type, e, a.isMe);
      if (ghost && !a.ghost) {
        particles.burst(e.x, 0.15, e.y, { n: 26, color: ['#ffffff', '#d0d0ff', e.c], speed: 0.7, up: 0.9, size: 0.07, life: 0.9, gravity: 0.3, grow: 1 });
        ev('out');
      }
      if (inv && !a.pinv && !ghost) {
        particles.burst(e.x, a.height * 0.9, e.y, { n: 14, color: ['#ffd60a', '#ffffff', '#ff4d6d'], speed: 0.8, up: 0.8, size: 0.05, life: 0.6, gravity: 2 });
        a.spin = 1;
        if (a.isMe) S.shake(0.05);
        ev('hit');
      }
      if (z > 0.05 && a.pz <= 0.05) { particles.burst(e.x, 0.01, e.y, { n: 8, color: ['#e9e2d0', '#cfc6b0'], speed: 0.35, up: 0.15, size: 0.05, life: 0.4, gravity: 0.3 }); ev('jump'); }
      if (z <= 0.02 && a.pz > 0.2) particles.burst(e.x, 0.01, e.y, { n: 10, color: ['#e9e2d0', '#cfc6b0'], speed: 0.45, up: 0.1, size: 0.05, life: 0.4, gravity: 0.2 });
      if (scale < 0.98 && a.pscale >= 0.98 && !ghost) { particles.burst(e.x, 0.02, e.y, { n: 30, color: cfg.splashColor || ['#caf0f8', '#90e0ef', '#ffffff'], speed: 0.6, up: 1.4, size: 0.05, life: 0.8, gravity: 3.5 }); if (a.isMe) S.shake(0.04); ev('fall'); }
      if (dashing && !a.dashing) ev('dash');
      if (dashing) particles.burst(e.x, 0.12, e.y, { n: 2, color: cfg.trailColor || ['#ffffff', e.c], speed: 0.05, up: 0.05, size: 0.06, life: 0.35, gravity: 0, grow: -1 });
      a.dashing = dashing;
      a.pinv = inv;
      a.pz = z;
      a.pscale = scale;

      // ---- fantasma
      if (ghost !== a.ghost) {
        a.ghost = ghost;
        a.rig.visible = !ghost;
        if (a.ghostM) a.ghostM.visible = ghost;
      }
      const hide = cfg.hideOut && ghost;
      a.root.visible = !hide && scale > 0.02;

      // ---- movimiento y animación
      const vx = (e.x - a.px) / Math.max(dt, 1e-3), vy = (e.y - a.py) / Math.max(dt, 1e-3);
      a.px = e.x; a.py = e.y;
      const sp = Math.min(3, Math.hypot(vx, vy));
      a.spd += (sp - a.spd) * 0.25;
      if (a.update) {
        a.update(e, dt, t, a, { scale, ghost, z, inv, dashing });
      } else {
        if (sp > 0.08) {
          const target = Math.atan2(vx, vy);
          let d = target - a.yaw;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          a.yaw += d * Math.min(1, dt * 12);
        }
        a.phase += dt * (4 + a.spd * 14);
        const walk = Math.min(1, a.spd / 0.5);
        const swing = Math.sin(a.phase) * 0.8 * walk;
        if (z > 0.05) {
          a.legs[0].rotation.x = -0.9; a.legs[1].rotation.x = -0.5;
          a.arms[0].rotation.x = -2.6; a.arms[1].rotation.x = -2.6;
        } else if (scale < 0.98) {
          a.arms[0].rotation.x = -2.8 + Math.sin(t * 30) * 0.6; a.arms[1].rotation.x = -2.8 + Math.cos(t * 30) * 0.6;
          a.legs[0].rotation.x = Math.sin(t * 25) * 0.8; a.legs[1].rotation.x = -Math.sin(t * 25) * 0.8;
        } else {
          a.legs[0].rotation.x = swing; a.legs[1].rotation.x = -swing;
          a.arms[0].rotation.x = -swing * 0.9; a.arms[1].rotation.x = swing * 0.9;
        }
        const bob = Math.abs(Math.sin(a.phase)) * 0.12 * a.U * walk + Math.sin(t * 3) * 0.02 * a.U;
        a.rig.position.y = bob;
        a.rig.rotation.x = dashing ? 0.45 : walk * 0.12;
        if (a.spin > 0) { a.spin -= dt * 2; }
        a.rig.rotation.y = a.yaw + (a.spin > 0 ? (1 - a.spin) * Math.PI * 4 : 0);
        if (scale < 0.98) a.rig.rotation.y += t * 12;
        const blink = inv && !ghost && Math.floor(t * 12) % 2;
        a.rig.visible = !ghost && !blink;
        // estirarse y aplastarse al saltar
        const sq = z > 0.05 ? 1 + z * 0.12 : 1;
        a.rig.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      }
      const jump = z * (cfg.jumpH ?? 0.24);
      const sink = (1 - Math.max(0, Math.min(1, scale))) * (cfg.sinkDepth ?? 0.35);
      a.root.position.set(e.x, ghost ? 0.12 + Math.sin(t * 2 + e.x * 5) * 0.04 : jump - sink, e.y);
      a.root.scale.setScalar(Math.max(0.02, Math.min(1, scale)));
      if (a.headObj) a.headObj.blink(t + (a.blinkOff || (a.blinkOff = Math.random() * 5)));
      // el fantasma mira hacia la cámara
      if (ghost && a.ghostM) a.ghostM.rotation.y = Math.atan2(camera.position.x - e.x, camera.position.z - e.y);
      // cabeza: mira un poco hacia la cámara cuando está quieto, y se ladea al correr
      if (a.head && !a.update) {
        a.head.rotation.z = Math.sin(a.phase * 0.5) * 0.06 * Math.min(1, a.spd / 0.5);
        a.head.rotation.x = -0.15;
      }
      if (a.ring) { a.ring.visible = a.root.visible && !ghost; a.ring.position.set(e.x, 0.006, e.y); }
      const tagTxt = cfg.tag ? cfg.tag(e) : null;
      if (tagTxt !== a.tagTxt) {
        a.tagTxt = tagTxt;
        a.tag.visible = tagTxt != null;
        if (tagTxt != null) { a.tag.material.map = emojiTexture(String(tagTxt), { font: 'bold 64px system-ui' }); a.tag.material.needsUpdate = true; }
      }
    }
    for (const [id, a] of avatars) if (!seen.has(id)) { a.root.visible = false; if (a.ring) a.ring.visible = false; }
    particles.update(dt);
    lastT = t;
    renderer.render(scene, camera);
  };

  const dispose = () => {
    ro.disconnect();
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (!texCache.has(m.map)) m.dispose(); });
    });
    renderer.dispose();
    el.remove();
  };

  return { render, dispose, S, burst: S.burst, shake: S.shake };
}

// ---------------------------------------------------------------- agua
// Océano con olas animadas, reflejo del cielo, brillo del sol y espuma.
// opts.foam = [rx, rz]: espuma alrededor de una forma ovalada (un barco).
export function makeWater(opts = {}) {
  const size = opts.size ?? 16;
  const geo = new THREE.PlaneGeometry(size, size, 160, 160);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(opts.deep || '#04365c') },
      uShallow: { value: new THREE.Color(opts.shallow || '#1b8fb5') },
      uSky: { value: new THREE.Color(opts.sky || '#bfe6ff') },
      uSun: { value: new THREE.Vector3(1.4, 3.2, 1.2).normalize() },
      uFoam: { value: new THREE.Vector2(...(opts.foam || [0, 0])) },
      uFoamZ: { value: opts.foamZ ?? 0 },
      uAmp: { value: opts.amp ?? 1 },
    },
    vertexShader: `
      uniform float uTime; uniform float uAmp;
      varying vec3 vW; varying vec3 vN; varying float vH;
      // olas: suma de senos en varias direcciones (con su derivada para la normal)
      vec3 wave(vec2 p, vec2 d, float k, float a, float s) {
        float f = dot(normalize(d), p) * k + uTime * s;
        return vec3(a * sin(f), a * k * cos(f) * normalize(d));
      }
      void main() {
        vec3 p = position;
        vec2 q = p.xz;
        vec3 w = wave(q, vec2(1.0, 0.3), 2.2, 0.035, 1.3)
               + wave(q, vec2(-0.4, 1.0), 3.1, 0.022, 1.7)
               + wave(q, vec2(0.7, -0.8), 5.3, 0.012, 2.3)
               + wave(q, vec2(-1.0, -0.2), 8.0, 0.006, 3.1);
        w *= uAmp;
        p.y += w.x;
        vH = w.x;
        vN = normalize(vec3(-w.y, 1.0, -w.z));
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky; uniform vec3 uSun; uniform vec2 uFoam; uniform float uFoamZ; uniform float uAmp;
      varying vec3 vW; varying vec3 vN; varying float vH;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        // ondulaciones finas en la normal
        vec2 r = vW.xz * 9.0;
        vec3 n = normalize(vN + 0.12 * vec3(noise(r + uTime * 0.8) - 0.5, 0.0, noise(r.yx - uTime * 0.7) - 0.5));
        vec3 v = normalize(cameraPosition - vW);
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 4.0);
        vec3 base = mix(uDeep, uShallow, clamp(vH * 12.0 + 0.45, 0.0, 1.0));
        vec3 col = mix(base, uSky, fres * 0.8);
        // brillo del sol
        vec3 h = normalize(uSun + v);
        col += vec3(1.0, 0.95, 0.85) * pow(max(dot(n, h), 0.0), 180.0) * 1.6;
        // espuma en las crestas (suave)
        float fn = noise(vW.xz * 6.0 + uTime * 0.5) * 0.6 + noise(vW.xz * 13.0 - uTime * 0.3) * 0.4;
        float crest = smoothstep(0.04 * uAmp, 0.07 * uAmp, vH) * smoothstep(0.35, 0.8, fn);
        // espuma alrededor del barco
        float foam = 0.0;
        if (uFoam.x > 0.0) {
          float d = length(vec2(vW.x / uFoam.x, (vW.z - uFoamZ) / uFoam.y));
          float band = smoothstep(1.22, 1.0, d) * smoothstep(0.94, 0.99, d);
          float fn2 = noise(vW.xz * 7.0 + vec2(uTime * 0.6, -uTime * 0.4)) * 0.6 + noise(vW.xz * 15.0 - uTime * 0.5) * 0.4;
          foam = band * smoothstep(0.3, 0.7, fn2) * 0.85;
          foam += smoothstep(1.06, 1.0, d) * smoothstep(0.94, 0.99, d) * 0.5;
        }
        col = mix(col, vec3(0.95, 0.98, 1.0), clamp(crest * 0.7 + foam, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.update = (t) => { mat.uniforms.uTime.value = t; };
  return mesh;
}

// ---------------------------------------------------------------- escenario simple
// Para mini juegos 3D que no son de movimiento (Simón, Cuenta, Para en…):
// renderer, cielo, luces, sombras, partículas, cámara, bucle y toques (raycast).
export function miniStage(stageEl, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.className = 'k-3d';
  stageEl.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  if (opts.skyTop) {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, opts.skyTop); gr.addColorStop(1, opts.skyBottom || opts.skyTop);
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
  } else scene.background = new THREE.Color(opts.sky || '#1b1035');
  scene.add(new THREE.HemisphereLight(opts.hemiSky || '#ffffff', opts.hemiGround || '#444466', opts.hemi ?? 1.1));
  const sun = new THREE.DirectionalLight('#ffffff', opts.sun ?? 2);
  sun.position.set(1.2, 3, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.5, far: 10 });
  sun.shadow.bias = -0.002;
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(opts.fov || 42, 1, 0.05, opts.far || 50);
  const particles = new Particles(scene, 600);
  const S = { THREE, scene, camera, renderer, particles, sun, aspect: 1, shake: 0 };
  const fit = () => {
    const w = Math.max(50, stageEl.clientWidth), h = Math.max(50, stageEl.clientHeight);
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px';
    renderer.domElement.style.height = h + 'px';
    S.aspect = camera.aspect = w / h;
    camera.updateProjectionMatrix();
    particles.mat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    if (opts.onResize) opts.onResize(S);
  };
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(stageEl);
  // toque → objetos 3D tocados
  const ray = new THREE.Raycaster();
  const v2 = new THREE.Vector2();
  S.pick = (clientX, clientY, objects) => {
    const r = renderer.domElement.getBoundingClientRect();
    v2.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(v2, camera);
    const hit = ray.intersectObjects(objects, true)[0];
    return hit ? hit.object : null;
  };
  let raf = 0, last = performance.now(), dead = false;
  S.start = (update) => {
    const frame = (now) => {
      if (dead) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      update(dt, now);
      if (S.shake > 0.0005) { camera.position.x += (Math.random() - 0.5) * S.shake; camera.position.y += (Math.random() - 0.5) * S.shake; S.shake *= Math.pow(0.02, dt); }
      particles.update(dt);
      renderer.render(scene, camera);
      // capa encima (p. ej. el arco en primera persona, con su propia cámara)
      if (S.overlay) {
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.render(S.overlay.scene, S.overlay.camera);
        renderer.autoClear = true;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  };
  S.dispose = () => {
    dead = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    renderer.dispose();
    renderer.domElement.remove();
  };
  return S;
}

// figura dibujada en un canvas (para texturas de botones/baldosas)
export function symbolTexture(color, sym, fg = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 256, 256);
  const cx = 128, cy = 132, r = 74;
  g.beginPath();
  if (sym === 'circle') g.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
  else if (sym === 'square') g.rect(cx - r * 0.7, cy - r * 0.7, r * 1.4, r * 1.4);
  else if (sym === 'tri') { g.moveTo(cx, cy - r * 0.9); g.lineTo(cx + r * 0.95, cy + r * 0.7); g.lineTo(cx - r * 0.95, cy + r * 0.7); g.closePath(); }
  else if (sym === 'diamond') { g.moveTo(cx, cy - r); g.lineTo(cx + r * 0.75, cy); g.lineTo(cx, cy + r); g.lineTo(cx - r * 0.75, cy); g.closePath(); }
  else if (sym === 'heart') { g.moveTo(cx, cy + r * 0.8); g.bezierCurveTo(cx - r * 1.3, cy - r * 0.1, cx - r * 0.6, cy - r * 1.1, cx, cy - r * 0.35); g.bezierCurveTo(cx + r * 0.6, cy - r * 1.1, cx + r * 1.3, cy - r * 0.1, cx, cy + r * 0.8); }
  else { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.42 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); }
  g.fillStyle = fg; g.fill();
  g.lineWidth = 8; g.strokeStyle = 'rgba(27,16,53,0.8)'; g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
