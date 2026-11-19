// Cuenta rápida 3D: llueven objetos 3D sobre un carrusel que gira.
// Cuenta cuántos hay del objeto pedido antes de que desaparezcan y elige la
// respuesta correcta lo más rápido posible.
import { mulberry32, shuffle, buzz } from '../util.js';
import { icon, rich } from '../icons.js';
import { sfx } from '../audio.js';
import { USE_2D } from '../rt.js';

const VIEW = 5000;
const ANSWER = 6000;
const TOTAL = 24;
// objetivo + objetos para distraer (de colores parecidos para que cueste)
const SETS = [
  ['mushroom', ['apple', 'heart', 'bomb']],
  ['star', ['coin', 'diamond', 'apple']],
  ['fish', ['coin', 'star', 'diamond']],
  ['apple', ['heart', 'mushroom', 'coin']],
  ['ghost', ['diamond', 'bomb', 'mushroom']],
  ['coin', ['star', 'fish', 'apple']],
  ['heart', ['apple', 'mushroom', 'star']],
  ['diamond', ['ghost', 'coin', 'fish']],
];
const NAMES = { mushroom: 'hongos', star: 'estrellas', fish: 'peces', apple: 'manzanas', ghost: 'fantasmas', coin: 'monedas', heart: 'corazones', diamond: 'diamantes', bomb: 'bombas' };

// Tablero a partir de la semilla (igual en todos los teléfonos).
function board(seed) {
  const r = mulberry32(seed);
  const [target, others] = SETS[Math.floor(r() * SETS.length)];
  const n = 6 + Math.floor(r() * 9); // 6..14
  const items = [];
  for (let i = 0; i < TOTAL; i++) items.push(i < n ? target : others[Math.floor(r() * others.length)]);
  // posiciones en el disco sin que se pisen mucho
  const pos = [];
  for (let i = 0; i < TOTAL; i++) {
    let best = null, bestD = -1;
    for (let tr = 0; tr < 14; tr++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.86;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const md = pos.reduce((m, p) => Math.min(m, Math.hypot(p.x - x, p.z - z)), 9);
      if (md > bestD) { bestD = md; best = { x, z }; }
      if (md > 0.24) break;
    }
    pos.push(best);
  }
  const placed = shuffle(items, r).map((e, i) => ({
    e, x: pos[i].x, z: pos[i].z, rot: r() * Math.PI * 2, s: 0.9 + r() * 0.3, delay: r() * 900,
  }));
  const opts = new Set([n]);
  for (const d of shuffle([-2, -1, 1, 2, 3, -3], r)) { if (opts.size >= 4) break; if (n + d > 0) opts.add(n + d); }
  return { target, n, placed, opts: shuffle([...opts], r) };
}

export default {
  id: 'count',
  name: 'Cuenta rápida',
  uses3d: true,
  desc: 'Llueven objetos sobre un carrusel que gira. Cuenta los que te piden antes de que desaparezcan y elige la respuesta correcta lo más rápido posible.',
  dur: () => VIEW + ANSWER,

  mount(el, ctx) {
    const b = board(ctx.seed);
    let webgl = false;
    try { const c = document.createElement('canvas'); webgl = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { /* nada */ }
    const use3d = !USE_2D() && webgl;
    el.innerHTML = `
      <div class="cq">
        <div class="cq-q">¿Cuántos <span>${icon(b.target)}</span> hay?<small>${NAMES[b.target]}</small></div>
        <div class="cq-bar"><i></i></div>
        <div class="cq-stage">${use3d ? '' : `<div class="g-field">${b.placed.map((p) => `<span style="left:${45 + p.x * 46}%;top:${45 + p.z * 46}%;transform:rotate(${p.rot}rad) scale(${p.s})">${icon(p.e)}</span>`).join('')}</div>`}
          <div class="cq-opts" hidden>${b.opts.map((o) => `<button data-v="${o}">${o}</button>`).join('')}</div>
          <div class="cq-msg"></div>
        </div>
      </div>`;
    const optsEl = el.querySelector('.cq-opts');
    const msg = el.querySelector('.cq-msg');
    const bar = el.querySelector('.cq-bar i');
    const stage = el.querySelector('.cq-stage');
    const t0 = performance.now();
    let qAt = 0, done = false, view = null, dead = false;

    if (use3d) {
      import('../rt3d.js').then((m) => { if (!dead) { try { view = build(m, stage, b, t0); } catch (e) { console.warn(e); } } });
    }

    const to = setTimeout(() => {
      el.querySelector('.g-field')?.classList.add('gone');
      if (view) view.vanish();
      optsEl.hidden = false;
      qAt = performance.now();
      sfx.go();
    }, VIEW);

    const finish = (a) => {
      done = true;
      optsEl.classList.add('locked');
      setTimeout(() => optsEl.classList.add('min'), 500);
      if (view) setTimeout(() => view && view.reveal(), 350);
      else msg.innerHTML = rich(`Eran <b>${b.n}</b>`);
      if (a === undefined) return;
    };

    optsEl.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest('button');
      if (!btn || done || !qAt) return;
      e.preventDefault();
      const a = Number(btn.dataset.v);
      const t = Math.round(performance.now() - qAt);
      ctx.submit({ a, t });
      const ok = a === b.n;
      btn.classList.add(ok ? 'ok' : 'bad');
      if (!ok) optsEl.querySelector(`[data-v="${b.n}"]`)?.classList.add('ok');
      if (ok) sfx.coin(); else sfx.out(0.6);
      buzz(ok ? 20 : 150);
      msg.innerHTML = rich(ok ? `{check} ¡Correcto! ${(t / 1000).toFixed(2)} s` : `{cross} Eran ${b.n}`);
      finish(a);
    });

    let tick = -1;
    const iv = setInterval(() => {
      const e2 = performance.now() - t0;
      const p = e2 < VIEW ? 1 - e2 / VIEW : 1 - (e2 - VIEW) / ANSWER;
      bar.style.width = Math.max(0, p * 100) + '%';
      bar.parentElement.classList.toggle('ans', e2 >= VIEW);
      // tic-tac los últimos 3 segundos de mirar
      const s = Math.ceil((VIEW - e2) / 1000);
      if (e2 < VIEW && s <= 3 && s !== tick) { tick = s; sfx.tick(); }
      if (e2 > VIEW + ANSWER - 200 && !done) { msg.innerHTML = rich(`{timer} ¡Tiempo! Eran ${b.n}`); finish(); }
    }, 60);
    return () => { dead = true; clearTimeout(to); clearInterval(iv); if (view) view.dispose(); };
  },

  evaluate(v, seed) {
    if (!v || typeof v.a !== 'number') return null;
    const n = board(seed).n;
    const t = Math.max(0, Math.min(ANSWER, Number(v.t) || ANSWER));
    if (v.a === n) return { score: 100000 - t, label: `{check} ${(t / 1000).toFixed(1)} s` };
    return { score: -Math.abs(v.a - n) * 10000 - t, label: `{cross} dijo ${v.a}` };
  },

  bot(r, seed) {
    const n = board(seed).n;
    const ok = r() < 0.65;
    return { a: ok ? n : n + (r() < 0.5 ? -1 : 1), t: Math.round(1300 + r() * 2500) };
  },
};

// ------------------------------------------------------------------ modelos 3D
function models(THREE) {
  const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, ...o });
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };
  const shapeGeo = (pts, depth, bevel = 0.012) => {
    const sh = new THREE.Shape();
    pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
    g.center();
    return g;
  };
  const starPts = [];
  for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? 0.045 : 0.1; starPts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
  const starGeo = shapeGeo(starPts, 0.035);
  const heartShape = new THREE.Shape();
  heartShape.moveTo(0, -0.08);
  heartShape.bezierCurveTo(-0.14, 0.01, -0.07, 0.11, 0, 0.045);
  heartShape.bezierCurveTo(0.07, 0.11, 0.14, 0.01, 0, -0.08);
  const heartGeo = new THREE.ExtrudeGeometry(heartShape, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 3, curveSegments: 14 });
  heartGeo.center();
  const white = M('#ffffff'), black = M('#1b1035', { roughness: 0.3 });
  const eye = (x, y, z, s = 0.012) => mesh(new THREE.SphereGeometry(s, 10, 8), black, x, y, z);

  return {
    mushroom() {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.08, 14), M('#fff1d6'), 0, 0.04, 0));
      const cap = mesh(new THREE.SphereGeometry(0.085, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), M('#e5383b'), 0, 0.075, 0);
      cap.scale.y = 0.85;
      g.add(cap);
      [[0, 0.15, 0.0], [0.05, 0.12, 0.04], [-0.05, 0.12, 0.03], [0.02, 0.11, -0.06], [-0.04, 0.115, -0.045]].forEach(([x, y, z]) => {
        const d = mesh(new THREE.SphereGeometry(0.016, 8, 6), white, x, y - 0.005, z);
        d.scale.y = 0.5;
        g.add(d);
      });
      return g;
    },
    star() {
      const g = new THREE.Group();
      const s = mesh(starGeo, M('#ffd000', { emissive: '#ffb000', emissiveIntensity: 0.25, metalness: 0.3 }), 0, 0, 0);
      const h = new THREE.Group();
      h.add(s, eye(-0.022, 0.01, 0.032, 0.01), eye(0.022, 0.01, 0.032, 0.01));
      h.position.y = 0.075; h.rotation.x = -1.0;
      g.add(h);
      return g;
    },
    fish() {
      const g = new THREE.Group();
      const mat = M('#ff7b00');
      const body = mesh(new THREE.SphereGeometry(0.07, 18, 12), mat, 0, 0.07, 0);
      body.scale.set(1.3, 0.85, 0.6);
      g.add(body);
      const tail = mesh(new THREE.ConeGeometry(0.05, 0.07, 4), mat, -0.105, 0.07, 0);
      tail.rotation.z = Math.PI / 2;
      tail.scale.z = 0.35;
      g.add(tail);
      const fin = mesh(new THREE.ConeGeometry(0.025, 0.04, 3), M('#ffd000'), 0, 0.125, 0);
      fin.scale.z = 0.4;
      g.add(fin);
      g.add(mesh(new THREE.SphereGeometry(0.016, 10, 8), white, 0.05, 0.085, 0.032), eye(0.055, 0.085, 0.043, 0.008));
      g.add(mesh(new THREE.SphereGeometry(0.016, 10, 8), white, 0.05, 0.085, -0.032), eye(0.055, 0.085, -0.043, 0.008));
      return g;
    },
    apple() {
      const g = new THREE.Group();
      const a = mesh(new THREE.SphereGeometry(0.075, 20, 14), M('#d00000', { roughness: 0.25 }), 0, 0.075, 0);
      a.scale.y = 0.92;
      g.add(a);
      g.add(mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.045, 6), M('#6f4518'), 0, 0.155, 0));
      const leaf = mesh(new THREE.SphereGeometry(0.025, 10, 6), M('#38b000'), 0.025, 0.155, 0);
      leaf.scale.set(1.2, 0.3, 0.6);
      leaf.rotation.z = 0.5;
      g.add(leaf);
      return g;
    },
    ghost() {
      const g = new THREE.Group();
      const mat = M('#f1f0ff', { emissive: '#b8b5ff', emissiveIntensity: 0.25 });
      g.add(mesh(new THREE.SphereGeometry(0.065, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat, 0, 0.1, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.08, 18, 1, true), mat, 0, 0.06, 0));
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.add(mesh(new THREE.SphereGeometry(0.022, 8, 6), mat, Math.cos(a) * 0.058, 0.022, Math.sin(a) * 0.058)); }
      g.add(eye(-0.022, 0.11, 0.058, 0.013), eye(0.022, 0.11, 0.058, 0.013));
      return g;
    },
    coin() {
      const g = new THREE.Group();
      const gold = M('#ffc300', { metalness: 0.3, roughness: 0.3, emissive: '#b07800', emissiveIntensity: 0.35 });
      const h = new THREE.Group();
      const c = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.022, 28), gold);
      c.rotation.x = Math.PI / 2;
      h.add(c, mesh(new THREE.TorusGeometry(0.068, 0.009, 8, 28), M('#ffdd55', { metalness: 0.3, roughness: 0.25, emissive: '#b07800', emissiveIntensity: 0.3 })), mesh(new THREE.BoxGeometry(0.018, 0.07, 0.03), M('#e09f00', { metalness: 0.6 })));
      h.position.y = 0.07; h.rotation.x = -1.0;
      g.add(h);
      return g;
    },
    heart() {
      const g = new THREE.Group();
      const h = mesh(heartGeo, M('#ff2d75', { roughness: 0.3, emissive: '#ff006e', emissiveIntensity: 0.15 }), 0, 0.07, 0);
      h.rotation.x = -1.0;
      g.add(h);
      return g;
    },
    diamond() {
      const g = new THREE.Group();
      const d = mesh(new THREE.OctahedronGeometry(0.075, 0), M('#2fe0ff', { metalness: 0.2, roughness: 0.05, emissive: '#00b4d8', emissiveIntensity: 0.35, flatShading: true }), 0, 0.09, 0);
      d.scale.y = 1.3;
      g.add(d);
      return g;
    },
    bomb() {
      const g = new THREE.Group();
      g.add(mesh(new THREE.SphereGeometry(0.07, 18, 12), M('#2b2d42', { metalness: 0.4, roughness: 0.3 }), 0, 0.07, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.025, 10), M('#8d99ae', { metalness: 0.6 }), 0, 0.14, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.04, 6), M('#d4a373'), 0.01, 0.165, 0));
      g.add(mesh(new THREE.SphereGeometry(0.012, 8, 6), M('#ffbe0b', { emissive: '#ff9500', emissiveIntensity: 2 }), 0.015, 0.19, 0));
      return g;
    },
  };
}

function build(m, stage, b, t0) {
  const { THREE, miniStage } = m;
  const S = miniStage(stage, { skyTop: '#48cae4', skyBottom: '#caf0f8', hemiGround: '#5a7d9a', fov: 40 });
  const { scene, camera, particles } = S;
  const MK = models(THREE);
  // suelo de césped y carrusel de feria
  const grass = new THREE.Mesh(new THREE.CircleGeometry(6, 40), new THREE.MeshStandardMaterial({ color: '#80b918', roughness: 0.9 }));
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.14;
  grass.receiveShadow = true;
  scene.add(grass);
  const rd = mulberry32(b.n * 977 + 13);
  for (let i = 0; i < 26; i++) {
    const a = rd() * Math.PI * 2, d = 1.25 + rd() * 1.6;
    const bush = new THREE.Mesh(new THREE.SphereGeometry(0.08 + rd() * 0.08, 10, 8), new THREE.MeshStandardMaterial({ color: rd() < 0.5 ? '#55a630' : '#2b9348', roughness: 0.8 }));
    bush.position.set(Math.cos(a) * d, -0.1, Math.sin(a) * d);
    bush.scale.y = 0.7;
    bush.castShadow = true;
    scene.add(bush);
    if (rd() < 0.6) {
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshStandardMaterial({ color: ['#ffd60a', '#ff4d6d', '#ffffff', '#c77dff'][Math.floor(rd() * 4)] }));
      fl.position.set(bush.position.x + 0.03, bush.position.y + bush.geometry.parameters.radius * 0.6, bush.position.z + 0.03);
      scene.add(fl);
    }
  }
  const car = new THREE.Group();
  scene.add(car);
  const segs = 16;
  for (let i = 0; i < segs; i++) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.02, 0.1, 6, 1, false, (i / segs) * Math.PI * 2, (Math.PI * 2) / segs), new THREE.MeshStandardMaterial({ color: i % 2 ? '#ffffff' : '#ff4d6d', roughness: 0.5 }));
    w.position.y = -0.07;
    w.receiveShadow = true;
    car.add(w);
  }
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.94, 0.94, 0.02, 48), new THREE.MeshStandardMaterial({ color: '#fff3d6', roughness: 0.7 }));
  top.position.y = -0.01;
  top.receiveShadow = true;
  car.add(top);
  const bulbs = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const bl = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), new THREE.MeshStandardMaterial({ color: '#ffd60a', emissive: '#ffd60a', emissiveIntensity: 1 }));
    bl.position.set(Math.cos(a) * 1.03, -0.02, Math.sin(a) * 1.03);
    car.add(bl);
    bulbs.push(bl);
  }
  // los objetos
  const objs = b.placed.map((p) => {
    const g = MK[p.e]();
    g.scale.setScalar(p.s);
    g.rotation.y = p.rot;
    g.position.set(p.x, 3, p.z);
    car.add(g);
    return { g, p, landed: false, gone: false, pop: 0 };
  });

  let spin = 0.5, vanishAt = 0, revealAt = 0, revealIdx = 0;
  const targets = objs.filter((o) => o.p.e === b.target);
  const counter = document.createElement('div');
  counter.className = 'cq-count';
  stage.appendChild(counter);

  const fitCam = () => {
    const vf = Math.tan((camera.fov * Math.PI) / 360);
    const dist = Math.max(1.25 / (vf * S.aspect), 1.05 / vf);
    camera.position.set(0, dist * 0.82, dist * 0.6);
    camera.lookAt(0, -0.08, 0.06);
  };

  S.start((dt, now) => {
    fitCam();
    const t = now - t0;
    car.rotation.y += spin * dt;
    bulbs.forEach((bl, i) => { bl.material.emissiveIntensity = (Math.floor(now / 250) + i) % 3 === 0 ? 2 : 0.4; });
    for (const o of objs) {
      if (o.gone && !revealAt) continue;
      // caer con rebote
      const f = (t - o.p.delay) / 600;
      if (f < 0) { o.g.visible = false; continue; }
      if (o.gone) continue;
      o.g.visible = true;
      let y;
      if (f < 1) y = 2.6 * (1 - f * f);
      else { const k = f - 1; y = Math.abs(Math.sin(k * Math.PI * 1.6)) * 0.18 * Math.exp(-k * 3.5); }
      if (f >= 1 && !o.landed) { o.landed = true; if (Math.random() < 0.3) S.shake = Math.max(S.shake, 0.004); }
      o.g.position.y = y;
      o.g.rotation.y = o.p.rot + Math.sin(now / 500 + o.p.rot) * 0.25;
    }
    // revelado: van saliendo uno por uno los objetos correctos
    if (revealAt && revealIdx < targets.length && now >= revealAt + revealIdx * 260) {
      const o = targets[revealIdx++];
      o.gone = false; o.g.visible = true; o.pop = 1; o.g.position.y = 0;
      const wp = new THREE.Vector3(); o.g.getWorldPosition(wp);
      particles.burst(wp.x, 0.15, wp.z, { n: 14, color: ['#ffffff', '#ffd60a'], speed: 0.6, up: 1.2, size: 0.04, life: 0.5, gravity: 2 });
      counter.textContent = revealIdx;
      counter.classList.remove('bump'); void counter.offsetWidth; counter.classList.add('bump');
      sfx.count();
      if (revealIdx === targets.length) setTimeout(() => sfx.win && sfx.win(), 200);
    }
    for (const o of targets) if (o.pop > 0) { o.pop = Math.max(0, o.pop - dt * 3); o.g.scale.setScalar(o.p.s * (1.25 + o.pop * 0.5)); o.g.position.y = Math.sin(now / 200 + o.p.rot) * 0.03 + 0.04; }
  });

  return {
    vanish() {
      vanishAt = performance.now();
      spin = 0.15;
      for (const o of objs) {
        o.gone = true; o.g.visible = false;
        const wp = new THREE.Vector3(); o.g.getWorldPosition(wp);
        particles.burst(wp.x, 0.1, wp.z, { n: 6, color: ['#ffffff', '#e0e0ff'], speed: 0.5, up: 0.8, size: 0.06, life: 0.6, gravity: 0.2, grow: 1 });
      }
      sfx.wind && sfx.wind();
    },
    reveal() {
      if (revealAt) return;
      revealAt = performance.now();
      spin = 0;
      counter.classList.add('on');
    },
    dispose: () => { counter.remove(); S.dispose(); },
  };
}
