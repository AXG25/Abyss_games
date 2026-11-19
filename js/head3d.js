// Cabezas 3D de los personajes (modelos de verdad, no imágenes).
// makeHead(THREE, id, r) → { group, blink(t) } con el frente hacia +Z.
// r = radio de la cabeza.

const mats = new Map();
function M(THREE, color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0, ...opts }));
  return mats.get(key);
}

const OUT = '#1b1035';

// Configuración de cada personaje (colores iguales a sus dibujos).
const HEADS = {
  frog: { c: '#5bd16a', scale: [1.15, 0.85, 1], eyes: 'bulge', mouth: 'wide', cheeks: true },
  cat: { c: '#ffb347', ears: 'pointy', inner: '#ff8fab', muzzle: '#fff3e0', nose: '#ff6b8b', stripes: '#e08a2a', whiskers: true, cheeks: true },
  dog: { c: '#d9a066', ears: 'floppy', earC: '#8d5a3b', muzzle: '#fff3e0', nose: OUT, tongue: true, patch: '#b07a48' },
  fox: { c: '#ff7b25', ears: 'pointy', inner: '#fff7ee', earTip: OUT, snout: '#fff7ee', nose: OUT, cheeksC: '#fff7ee' },
  panda: { c: '#ffffff', ears: 'round', earC: OUT, patches: OUT, nose: OUT, muzzle: '#ffffff', cheeks: true },
  monkey: { c: '#8d6e63', ears: 'side', inner: '#e7c8a0', face: '#e7c8a0', nostrils: true },
  penguin: { c: '#2b2d42', face: '#ffffff', beak: '#ff9f1c', cheeks: true },
  bunny: { c: '#f4f4f8', ears: 'long', inner: '#ffb3c6', nose: '#ff6b8b', teeth: true, cheeks: true },
  tiger: { c: '#ffa62b', ears: 'round', inner: '#ffffff', muzzle: '#ffffff', nose: '#5a2a0a', stripes: OUT },
  octopus: { c: '#c77dff', scale: [1.05, 1.1, 1.05], tentacles: '#b05ee6', spots: '#e0aaff', cheeks: true, mouth: 'o' },
  dino: { c: '#4cc9a0', spikes: '#ffbe0b', snoutBig: '#8ce0c4', nostrils: true, fangs: true },
  pig: { c: '#ffadc6', ears: 'pig', earC: '#ff8fab', pigNose: '#ff8fab', cheeks: true },
  robot: { c: '#b8c4d6', box: true, eyes: 'visor', antenna: '#ff4d6d', bolts: true, mouth: 'grill' },
  alien: { c: '#9ef01a', scale: [0.9, 1.18, 0.95], eyes: 'alien', antennas: '#ffd23f', mouth: 'small' },
  cyclops: { c: '#7b2cbf', eyes: 'one', horns: '#ffd23f', mouth: 'teeth' },
  pumpkin: { c: '#ff8c1a', scale: [1.15, 0.92, 1.1], ribs: '#c45a00', stem: '#2d6a4f', eyes: 'carved', mouth: 'jagged' },
};

export function makeHead(THREE, id, r) {
  const cfg = HEADS[id] || HEADS.frog;
  const g = new THREE.Group();
  const add = (geo, mat, pos, scale, rot) => {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(pos[0] * r, pos[1] * r, pos[2] * r);
    if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const S = (k = 1, seg = 18) => new THREE.SphereGeometry(r * k, seg, Math.max(8, seg - 6));
  const skin = M(THREE, cfg.c);
  const dark = M(THREE, OUT, { roughness: 0.3 });
  const white = M(THREE, '#ffffff', { roughness: 0.25 });

  // cabeza
  if (cfg.box) {
    add(new THREE.BoxGeometry(r * 1.8, r * 1.6, r * 1.6), skin);
  } else {
    const h = add(S(1, 24), skin);
    if (cfg.scale) h.scale.set(...cfg.scale);
  }

  // ---- orejas
  const pair = (fn) => [-1, 1].forEach(fn);
  if (cfg.ears === 'pointy') pair((s) => {
    add(new THREE.ConeGeometry(r * 0.32, r * 0.65, 4), skin, [s * 0.52, 0.82, -0.05], null, [0, Math.PI / 4, -s * 0.38]);
    add(new THREE.ConeGeometry(r * 0.18, r * 0.42, 4), M(THREE, cfg.inner), [s * 0.5, 0.78, 0.08], null, [0, Math.PI / 4, -s * 0.38]);
    if (cfg.earTip) add(new THREE.ConeGeometry(r * 0.13, r * 0.22, 4), M(THREE, cfg.earTip), [s * 0.62, 1.07, -0.05], null, [0, Math.PI / 4, -s * 0.38]);
  });
  if (cfg.ears === 'round') pair((s) => {
    add(S(0.3), M(THREE, cfg.earC || cfg.c), [s * 0.62, 0.72, -0.05]);
    if (cfg.inner) add(S(0.16), M(THREE, cfg.inner), [s * 0.62, 0.72, 0.12], [1, 1, 0.5]);
  });
  if (cfg.ears === 'floppy') pair((s) => add(S(0.32), M(THREE, cfg.earC), [s * 0.9, -0.05, -0.05], [0.65, 1.6, 0.9], [0, 0, s * 0.3]));
  if (cfg.ears === 'side') pair((s) => {
    add(S(0.3), skin, [s * 0.98, 0.05, 0]);
    add(S(0.18), M(THREE, cfg.inner), [s * 1.06, 0.05, 0.08], [0.6, 1, 1]);
  });
  if (cfg.ears === 'long') pair((s) => {
    add(new THREE.CapsuleGeometry(r * 0.17, r * 0.85, 4, 10), skin, [s * 0.32, 1.2, -0.05], null, [0, 0, -s * 0.12]);
    add(new THREE.CapsuleGeometry(r * 0.08, r * 0.6, 4, 8), M(THREE, cfg.inner), [s * 0.33, 1.2, 0.08], null, [0, 0, -s * 0.12]);
  });
  if (cfg.ears === 'pig') pair((s) => add(new THREE.ConeGeometry(r * 0.25, r * 0.45, 3), M(THREE, cfg.earC), [s * 0.55, 0.8, 0.15], null, [0.5, 0, -s * 0.5]));

  // ---- detalles de la cara
  if (cfg.face) add(S(0.75), M(THREE, cfg.face), [0, -0.1, 0.38], [1.05, 0.95, 0.8]);
  if (cfg.patches) pair((s) => add(S(0.24), M(THREE, cfg.patches), [s * 0.36, 0.12, 0.8], [1, 1.25, 0.5], [0, 0, s * 0.5]));
  if (cfg.patch) add(S(0.26), M(THREE, cfg.patch), [-0.36, 0.14, 0.8], [1.1, 1.1, 0.45]);
  if (cfg.muzzle) add(S(0.42), M(THREE, cfg.muzzle), [0, -0.3, 0.72], [1.25, 0.85, 0.75]);
  if (cfg.snout) add(new THREE.ConeGeometry(r * 0.38, r * 0.6, 16), M(THREE, cfg.snout), [0, -0.25, 0.95], null, [Math.PI / 2, 0, 0]);
  if (cfg.cheeksC) pair((s) => add(S(0.3), M(THREE, cfg.cheeksC), [s * 0.5, -0.35, 0.62], [1, 0.8, 0.7]));
  if (cfg.snoutBig) add(S(0.6), M(THREE, cfg.snoutBig), [0, -0.3, 0.62], [1.2, 0.7, 0.85]);
  if (cfg.nose) add(S(cfg.snout ? 0.1 : 0.13), M(THREE, cfg.nose, { roughness: 0.25 }), cfg.snout ? [0, -0.25, 1.25] : [0, -0.14, 1.0], [1.2, 0.85, 0.8]);
  if (cfg.pigNose) {
    add(new THREE.CylinderGeometry(r * 0.3, r * 0.3, r * 0.22, 20), M(THREE, cfg.pigNose), [0, -0.22, 0.98], null, [Math.PI / 2, 0, 0]);
    pair((s) => add(S(0.07), M(THREE, '#a8325e'), [s * 0.11, -0.22, 1.09], [1, 1.4, 0.6]));
  }
  if (cfg.beak) add(new THREE.ConeGeometry(r * 0.2, r * 0.45, 12), M(THREE, cfg.beak), [0, -0.18, 1.08], null, [Math.PI / 2, 0, 0]);
  if (cfg.nostrils) pair((s) => add(S(0.05), dark, [s * 0.12, -0.2, cfg.snoutBig ? 1.12 : 0.95]));
  if (cfg.tongue) add(S(0.12), M(THREE, '#ff6b8b'), [0, -0.58, 0.82], [1, 1.2, 0.6]);
  if (cfg.teeth) add(new THREE.BoxGeometry(r * 0.2, r * 0.18, r * 0.06), white, [0, -0.42, 0.95]);
  if (cfg.fangs) pair((s) => add(new THREE.ConeGeometry(r * 0.06, r * 0.14, 6), white, [s * 0.25, -0.62, 0.95], null, [Math.PI, 0, 0]));
  if (cfg.cheeks) pair((s) => add(S(0.13), M(THREE, '#ff8fab'), [s * 0.58, -0.22, 0.72], [1, 0.7, 0.4]));
  if (cfg.whiskers) pair((s) => [0, 1].forEach((k) => add(new THREE.CylinderGeometry(r * 0.012, r * 0.012, r * 0.5, 4), dark, [s * 0.72, -0.3 - k * 0.1, 0.78], null, [0, 0, Math.PI / 2 + s * (k ? -0.15 : 0.15)])));
  if (cfg.stripes) {
    const sm = M(THREE, cfg.stripes);
    [-0.2, 0, 0.2].forEach((x) => add(new THREE.BoxGeometry(r * 0.08, r * 0.28, r * 0.08), sm, [x, 0.78, 0.55], null, [-0.6, 0, 0]));
    if (id === 'tiger') pair((s) => [0, 1].forEach((k) => add(new THREE.BoxGeometry(r * 0.3, r * 0.07, r * 0.08), sm, [s * 0.9, 0.05 - k * 0.2, 0.35], null, [0, s * 0.6, 0])));
  }
  if (cfg.spots) [[-0.5, 0.55, 0.55], [0.35, 0.75, 0.45], [0.7, 0.3, 0.55]].forEach((p) => add(S(0.11), M(THREE, cfg.spots), p, [1, 1, 0.5]));
  if (cfg.tentacles) for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    add(new THREE.CapsuleGeometry(r * 0.13, r * 0.35, 4, 8), M(THREE, cfg.tentacles), [Math.cos(a) * 0.62, -0.95, Math.sin(a) * 0.62], null, [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4]);
  }
  if (cfg.spikes) [-0.3, 0.1, 0.5].forEach((z, i) => add(new THREE.ConeGeometry(r * 0.16, r * 0.4, 6), M(THREE, cfg.spikes), [0, 0.95 - i * 0.05, -z], null, [-0.3 * (i - 1), 0, 0]));
  if (cfg.antenna) {
    add(new THREE.CylinderGeometry(r * 0.04, r * 0.04, r * 0.5, 6), dark, [0, 1.05, 0]);
    add(S(0.13), M(THREE, cfg.antenna, { emissive: cfg.antenna, emissiveIntensity: 0.6 }), [0, 1.33, 0]);
  }
  if (cfg.antennas) pair((s) => {
    add(new THREE.CylinderGeometry(r * 0.035, r * 0.035, r * 0.6, 6), dark, [s * 0.35, 1.25, 0], null, [0, 0, -s * 0.4]);
    add(S(0.12), M(THREE, cfg.antennas, { emissive: cfg.antennas, emissiveIntensity: 0.5 }), [s * 0.48, 1.52, 0]);
  });
  if (cfg.horns) pair((s) => add(new THREE.ConeGeometry(r * 0.16, r * 0.45, 10), M(THREE, cfg.horns), [s * 0.55, 0.88, 0], null, [0, 0, -s * 0.5]));
  if (cfg.bolts) pair((s) => add(new THREE.CylinderGeometry(r * 0.16, r * 0.16, r * 0.14, 10), M(THREE, '#8d99ae', { metalness: 0.6 }), [s * 0.95, 0, 0], null, [0, 0, Math.PI / 2]));
  if (cfg.stem) add(new THREE.CylinderGeometry(r * 0.08, r * 0.12, r * 0.35, 8), M(THREE, cfg.stem), [0.05, 0.95, 0], null, [0, 0, -0.3]);
  if (cfg.ribs) [-0.55, 0, 0.55].forEach((x) => add(new THREE.TorusGeometry(r * 0.95, r * 0.025, 6, 30), M(THREE, cfg.ribs), [x * 0.3, 0, 0], [1.1, 0.95, 1.1], [0, Math.PI / 2 + x, 0]));

  // ---- ojos (grupo aparte para parpadear)
  const eyes = new THREE.Group();
  g.add(eyes);
  const eye = (x, y, z, k = 1) => {
    const w = new THREE.Mesh(S(0.22 * k), white);
    w.position.set(x * r, y * r, z * r);
    w.scale.set(1, 1.1, 0.6);
    eyes.add(w);
    const p = new THREE.Mesh(S(0.12 * k), dark);
    p.position.set(x * r, y * r, z * r + r * 0.11 * k);
    p.scale.set(1, 1.1, 0.6);
    eyes.add(p);
    const h = new THREE.Mesh(S(0.04 * k, 8), white);
    h.position.set(x * r + r * 0.04 * k, y * r + r * 0.06 * k, z * r + r * 0.17 * k);
    eyes.add(h);
  };
  const style = cfg.eyes || 'normal';
  if (style === 'normal') { eye(-0.34, 0.14, 0.86); eye(0.34, 0.14, 0.86); }
  if (style === 'bulge') pair((s) => {
    add(S(0.32), skin, [s * 0.42, 0.62, 0.3]);
    eye(s * 0.42, 0.66, 0.6, 1.15);
  });
  if (style === 'one') eye(0, 0.2, 0.85, 1.8);
  if (style === 'alien') pair((s) => {
    const m = new THREE.Mesh(S(0.27), dark);
    m.position.set(s * 0.36 * r, 0.05 * r, 0.82 * r);
    m.scale.set(1.3, 0.7, 0.5);
    m.rotation.z = -s * 0.5;
    eyes.add(m);
    const h = new THREE.Mesh(S(0.05, 8), white);
    h.position.set(s * 0.3 * r, 0.12 * r, 0.96 * r);
    eyes.add(h);
  });
  if (style === 'visor') {
    add(new THREE.BoxGeometry(r * 1.3, r * 0.5, r * 0.1), dark, [0, 0.15, 0.82]);
    pair((s) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(r * 0.28, r * 0.24, r * 0.06), M(THREE, '#4cc9f0', { emissive: '#4cc9f0', emissiveIntensity: 1.2 }));
      m.position.set(s * 0.3 * r, 0.15 * r, 0.88 * r);
      eyes.add(m);
    });
  }
  if (style === 'carved') pair((s) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r * 0.2, r * 0.3, 3), M(THREE, '#2b0f00', { emissive: '#ff9f1c', emissiveIntensity: 0.35 }));
    m.position.set(s * 0.35 * r, 0.2 * r, 0.9 * r);
    m.scale.set(1, 1, 0.3);
    eyes.add(m);
  });

  // ---- boca
  const mouth = cfg.mouth || 'smile';
  if (mouth === 'smile' || mouth === 'wide') {
    const w = mouth === 'wide' ? 0.45 : 0.16;
    const m = add(new THREE.TorusGeometry(r * w, r * 0.035, 6, 16, Math.PI), dark, [0, mouth === 'wide' ? -0.15 : -0.42, mouth === 'wide' ? 0.9 : 0.97], null, [0.2, 0, Math.PI]);
    if (cfg.muzzle || cfg.snoutBig || cfg.face) m.position.z += r * 0.08;
  }
  if (mouth === 'o') add(S(0.09), dark, [0, -0.35, 0.95], [1, 1.2, 0.5]);
  if (mouth === 'small') add(new THREE.TorusGeometry(r * 0.1, r * 0.03, 6, 12, Math.PI), dark, [0, -0.5, 0.88], null, [0, 0, Math.PI]);
  if (mouth === 'grill') [-0.2, 0, 0.2].forEach((x) => add(new THREE.BoxGeometry(r * 0.06, r * 0.22, r * 0.05), dark, [x, -0.45, 0.81]));
  if (mouth === 'teeth' || mouth === 'jagged') {
    add(S(0.3), M(THREE, '#2b0f00'), [0, -0.45, 0.82], [1.4, 0.5, 0.4]);
    pair((s) => add(new THREE.ConeGeometry(r * 0.07, r * 0.14, 6), white, [s * 0.15, -0.36, 0.95], null, [Math.PI, 0, 0]));
  }

  // parpadeo: los ojos se cierran un instante de vez en cuando
  let next = 1 + Math.random() * 3;
  const blink = (t) => {
    if (style === 'visor' || style === 'carved') return;
    const k = t > next && t < next + 0.12 ? 0.1 : 1;
    if (t > next + 0.12) next = t + 2 + Math.random() * 3;
    eyes.scale.y = k;
  };
  return { group: g, eyes, blink };
}

// Fantasma 3D (para los eliminados)
export function makeGhost(THREE, r) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#f4f1ff', transparent: true, opacity: 0.7, roughness: 0.4, emissive: '#ffffff', emissiveIntensity: 0.15 });
  const top = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  g.add(top);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, r * 1.1, 20, 1, true), mat);
  skirt.position.y = -r * 0.55;
  g.add(skirt);
  const dark = new THREE.MeshBasicMaterial({ color: OUT });
  [-1, 1].forEach((s) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(r * 0.15, 10, 8), dark);
    e.position.set(s * r * 0.35, r * 0.2, r * 0.88);
    e.scale.set(0.8, 1.2, 0.5);
    g.add(e);
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(r * 0.13, 10, 8), dark);
  m.position.set(0, -r * 0.15, r * 0.95);
  m.scale.set(1, 1.2, 0.5);
  g.add(m);
  return g;
}
