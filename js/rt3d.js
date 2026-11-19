// Vista 3D (Three.js) para los juegos en tiempo real.
//
// La simulación sigue siendo en el plano (x, y) con salto en z; aquí se dibuja
// en 3D: x → X, y → Z, z (salto) → altura. Cada juego aporta su escenario con
// G.scene3d = { sky, setup(S, W), update(S, t, W, ext, ents) } y este módulo
// pone cámara, luces, sombras y los personajes de los jugadores.
import * as THREE from '../vendor/three.module.min.js';

export { THREE };

export function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

// ---- texturas de emoji / texto (con caché)
const texCache = new Map();
export function emojiTexture(txt, opts = {}) {
  const key = txt + '|' + (opts.bg || '') + '|' + (opts.font || '');
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (opts.bg) {
    g.fillStyle = opts.bg;
    g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
  }
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
    g.font = "92px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'";
    g.fillText(txt, 64, 72);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
}

export function stripeTexture(colors, n = 8, size = 256, horizontal = false) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[i % colors.length];
    if (horizontal) g.fillRect(0, (i * size) / n, size, size / n + 1);
    else g.fillRect((i * size) / n, 0, size / n + 1, size);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function checkerTexture(a, b, n = 8, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    g.fillStyle = (i + j) % 2 ? a : b;
    g.fillRect((i * size) / n, (j * size) / n, size / n + 1, size / n + 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...extra });

export function createView3D(board, G, W) {
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
  if (cfg.fog) scene.fog = new THREE.Fog(cfg.fog, 4, 12);
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

  const S = { THREE, scene, camera, renderer, W, objs: {}, t: 0 };
  cfg.setup(S, W);

  // ---- personajes
  const PR = (G.PR || 0.06) * 1.3; // un poco más grandes que su colisión: se ven mejor
  const avatars = new Map();
  const bodyGeo = new THREE.CapsuleGeometry(PR * 0.78, PR * 0.8, 4, 14);
  const ringGeo = new THREE.RingGeometry(PR * 1.15, PR * 1.45, 32);
  const shadowFix = (m) => { m.castShadow = true; m.receiveShadow = false; return m; };
  const makeAvatar = (e) => {
    const grp = new THREE.Group();
    const body = shadowFix(new THREE.Mesh(bodyGeo, std(e.c || '#ffffff', { roughness: 0.45 })));
    body.position.y = PR * 0.78 + PR * 0.4;
    grp.add(body);
    const face = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(e.a || '🙂'), depthWrite: false }));
    face.scale.set(PR * 2.3, PR * 2.3, 1);
    face.position.y = PR * 2.9;
    face.renderOrder = 2;
    grp.add(face);
    let ring = null;
    if (e.isMe) {
      ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.004;
      scene.add(ring);
    }
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ depthWrite: false, depthTest: false }));
    tag.scale.set(PR * 2.4, PR * 2.4, 1);
    tag.position.y = PR * 4.6;
    tag.visible = false;
    tag.renderOrder = 3;
    grp.add(tag);
    scene.add(grp);
    return { grp, body, face, ring, tag, emoji: e.a, tagTxt: null, ghost: false, x: e.x, y: e.y };
  };

  const fit = () => {
    const w = Math.max(50, board.clientWidth), h = Math.max(50, board.clientHeight);
    renderer.setSize(w, h, false);
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    camera.aspect = w / h;
    const elev = (cfg.camElev ?? 58) * Math.PI / 180;
    const vf = (camera.fov * Math.PI) / 360;
    const hf = Math.atan(Math.tan(vf) * camera.aspect);
    const need = cfg.camFit ?? 1.06;
    const dist = Math.max(need / Math.tan(hf), (need * 0.95) / Math.tan(vf)) * 1.05;
    camera.position.set(0, Math.sin(elev) * dist, Math.cos(elev) * dist + (cfg.camShift ?? 0.12));
    camera.lookAt(0, 0, cfg.camLookZ ?? 0.12);
    camera.updateProjectionMatrix();
  };
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(board);

  const render = (t, ents, ext, meId) => {
    S.t = t;
    cfg.update(S, t, W, ext, ents);
    const seen = new Set();
    for (const e of ents) {
      seen.add(e.id);
      let a = avatars.get(e.id);
      if (!a) { a = makeAvatar({ ...e, isMe: e.id === meId }); avatars.set(e.id, a); }
      const scale = e.e && typeof e.e.f === 'number' ? e.e.f : (e.scale ?? 1);
      const ghost = !!e.out;
      if (ghost !== a.ghost) {
        a.ghost = ghost;
        a.face.material.map = emojiTexture(ghost ? '👻' : e.a || '🙂');
        a.face.material.opacity = ghost ? 0.45 : 1;
        a.face.material.transparent = true;
        a.face.material.needsUpdate = true;
        a.body.visible = !ghost;
      }
      // movimiento de los demás suavizado; el mío directo
      a.x = e.x; a.y = e.y;
      const hide = cfg.hideOut && ghost;
      a.grp.visible = !hide && scale > 0.02;
      const jump = (e.z || 0) * (cfg.jumpH ?? 0.22);
      const sink = (1 - Math.max(0, Math.min(1, scale))) * (cfg.sinkDepth ?? 0.35);
      a.grp.position.set(e.x, (ghost ? 0.15 + Math.sin(t * 2 + e.x * 5) * 0.03 : jump - sink), e.y);
      a.grp.scale.setScalar(Math.max(0.02, Math.min(1, scale)) * (1 + (e.z || 0) * 0.15));
      // inclinación al moverse
      if (a.px !== undefined) {
        const vx = (e.x - a.px), vy = (e.y - a.py);
        const cl = (v) => Math.max(-0.3, Math.min(0.3, v));
        a.body.rotation.z = THREE.MathUtils.lerp(a.body.rotation.z, cl(-vx * 25), 0.2);
        a.body.rotation.x = THREE.MathUtils.lerp(a.body.rotation.x, cl(vy * 25), 0.2);
      }
      a.px = e.x; a.py = e.y;
      const blink = e.inv > 0 && !ghost && Math.floor(t * 12) % 2;
      a.body.visible = !ghost && !blink;
      if (a.ring) { a.ring.visible = a.grp.visible && !ghost; a.ring.position.x = e.x; a.ring.position.z = e.y; }
      const tagTxt = cfg.tag ? cfg.tag(e) : null;
      if (tagTxt !== a.tagTxt) {
        a.tagTxt = tagTxt;
        a.tag.visible = tagTxt != null;
        if (tagTxt != null) { a.tag.material.map = emojiTexture(String(tagTxt), { font: 'bold 64px system-ui' }); a.tag.material.needsUpdate = true; }
      }
    }
    for (const [id, a] of avatars) if (!seen.has(id)) { a.grp.visible = false; if (a.ring) a.ring.visible = false; }
    renderer.render(scene, camera);
  };

  const dispose = () => {
    ro.disconnect();
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    renderer.dispose();
    el.remove();
  };

  return { render, dispose, S };
}
