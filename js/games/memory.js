// 🧠 Simón dice — 3 rondas en 3D, cada vez más difícil.
// Ronda 1: 4 botones, 4 pasos. Ronda 2: 6 botones, 6 pasos, más rápido.
// Ronda 3: 6 botones, 7 pasos, más rápido y la plataforma GIRA (despacio).
// Mira la secuencia y repítela tocando los botones. Cada uno tiene su color,
// su figura y su sonido.
import { mulberry32, buzz } from '../util.js';
import { sfx } from '../audio.js';
import { ctx as actx, bus } from '../audio.js';
import { rich } from '../icons.js';
import { USE_2D } from '../rt.js';

// Dificultad: secuencias ~20 % más cortas, se muestran ~20 % más lento y la
// plataforma gira ~20 % más despacio que en la versión original.
const ROUNDS = [
  { n: 4, len: 4, step: 745, input: 6500, spin: 0 },
  { n: 6, len: 6, step: 575, input: 8000, spin: 0 },
  { n: 6, len: 7, step: 480, input: 9500, spin: 0.44 },
];
const INTRO = 1600;
const LEAD = 700;
const AFTER = 1300;
const PADS = [
  { c: '#ffd000', sym: 'star', f: 523 },
  { c: '#ff5a00', sym: 'tri', f: 587 },
  { c: '#0047ff', sym: 'circle', f: 659 },
  { c: '#2fe0ff', sym: 'square', f: 784 },
  { c: '#ff2d95', sym: 'heart', f: 880 },
  { c: '#7ae000', sym: 'diamond', f: 988 },
];
const hash = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

function plan(seed) {
  const r = mulberry32(seed ^ 0x51a0);
  let t = 0;
  return ROUNDS.map((R) => {
    const seq = [];
    for (let i = 0; i < R.len; i++) {
      let x;
      do { x = Math.floor(r() * R.n); } while (seq.length && x === seq[seq.length - 1] && r() < 0.7);
      seq.push(x);
    }
    const p = { ...R, seq, start: t, show: t + INTRO, input: t + INTRO + LEAD + R.len * R.step };
    p.inputEnd = p.input + R.input;
    p.end = p.inputEnd + AFTER;
    t = p.end;
    return p;
  });
}
const TOTAL_STEPS = ROUNDS.reduce((a, R) => a + R.len, 0);

function tone(f, dur = 0.25) {
  const c = actx(); const out = bus();
  if (!c || !out) return;
  const t = c.currentTime;
  [1, 2].forEach((m, i) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = i ? 'sine' : 'triangle';
    o.frequency.value = f * m;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(i ? 0.03 : 0.1, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
  });
}

export default {
  id: 'memory',
  name: 'Simón dice',
  uses3d: true,
  desc: '3 rondas cada vez más difíciles: mira la secuencia de botones y repítela. En la última ronda la plataforma gira. Gana quien acierte más pasos (y más rápido).',
  dur: (seed) => plan(seed)[ROUNDS.length - 1].end,

  mount(el, ctx) {
    let webgl = false;
    try { const c = document.createElement('canvas'); webgl = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { /* nada */ }
    return run(el, ctx, !USE_2D() && webgl);
  },

  evaluate(v) {
    if (!v || !Array.isArray(v.r)) return null;
    let ok = 0, t = 0;
    v.r.forEach((x, k) => { if (x) { ok += Math.max(0, Math.min(ROUNDS[k].len, x.ok | 0)); t += Math.min(ROUNDS[k].input, x.t || ROUNDS[k].input); } else t += ROUNDS[k]?.input || 0; });
    return { score: ok * 100000 - t, label: `${ok}/${TOTAL_STEPS} pasos` };
  },

  bot: (r, seed, p) => {
    const rr = mulberry32((seed ^ hash(p?.id || 'bot0')) >>> 0);
    return { r: ROUNDS.map((R, k) => {
      const perfect = rr() < [0.8, 0.6, 0.4][k];
      return { ok: perfect ? R.len : Math.floor(rr() * R.len), t: Math.round(R.len * (450 + rr() * 300)) };
    }) };
  },
};

function run(el, ctx, use3d) {
  const P = plan(ctx.seed);
  el.innerHTML = `
    <div class="sim">
      <div class="sim-top"></div>
      <div class="sim-stage"></div>
      <div class="sim-dots"></div>
      <div class="sim-board"></div>
    </div>`;
  const top = el.querySelector('.sim-top');
  const stage = el.querySelector('.sim-stage');
  const dotsEl = el.querySelector('.sim-dots');
  const board = el.querySelector('.sim-board');
  const t0 = performance.now();
  const my = [null, null, null];
  let k = -1, pos = 0, done = false, view = null, dead = false;

  const paintDots = () => {
    if (k < 0) return;
    const R = P[k];
    dotsEl.innerHTML = R.seq.map((_, i) => `<i class="${i < pos ? 'ok' : i === pos && done && my[k] && my[k].ok < R.len ? 'bad' : ''}"></i>`).join('');
  };
  const paintBoard = () => {
    if (!ctx.players) return;
    const live = ctx.results ? ctx.results() : {};
    board.innerHTML = ctx.players.map((p) => {
      let v = null;
      if (p.id === ctx.me) v = my[k];
      else if (live[p.id] && Array.isArray(live[p.id].r)) v = live[p.id].r[k];
      const n = v ? v.ok : '–';
      return `<span style="--c:${p.c}">${p.n.slice(0, 8).replace(/[<>&]/g, '')}<b>${n}</b></span>`;
    }).join('');
  };

  // tocar un botón (en 3D llega desde el raycast; en 2D desde el botón HTML)
  const press = (i) => {
    if (k < 0 || done) return;
    const t = performance.now() - t0;
    const R = P[k];
    if (t < R.input || t > R.inputEnd) return;
    const ms = Math.round(t - R.input);
    if (i === R.seq[pos]) {
      tone(PADS[i].f, 0.22);
      pos++;
      my[k] = { ok: pos, t: ms };
      if (view) view.flash(i, true);
      if (pos === R.len) {
        done = true;
        top.innerHTML = rich(`{star} ¡Perfecto! ${(ms / 1000).toFixed(1)} s`);
        sfx.big();
        if (view) view.party();
      }
    } else {
      done = true;
      my[k] = { ok: pos, t: ROUNDS[k].input };
      top.innerHTML = rich(`{cross} ¡Fallaste en el paso ${pos + 1}!`);
      sfx.out(0.6);
      buzz(200);
      if (view) view.flash(i, false);
    }
    ctx.submit({ r: my });
    paintDots();
  };

  if (use3d) {
    import('../rt3d.js').then((m) => { if (!dead) { try { view = build(m, stage, press, P); } catch (e) { console.warn(e); } } });
  } else {
    stage.innerHTML = `<div class="sim-2d"></div>`;
  }

  let shownStep = -1;
  const iv = setInterval(() => {
    const t = performance.now() - t0;
    const nk = P.findIndex((R) => t >= R.start && t < R.end);
    if (nk !== -1 && nk !== k) {
      k = nk; pos = 0; done = false; shownStep = -1;
      const R = P[k];
      top.innerHTML = `Ronda ${k + 1} de 3 · ${R.n} botones · ${R.len} pasos${R.spin ? ' · ¡gira!' : ''}`;
      sfx.warn();
      window.__simSeq = R.seq; window.__simPress = press; // ganchos para pruebas
      paintDots();
      if (view) view.newRound(R);
      else {
        const box = stage.querySelector('.sim-2d');
        box.innerHTML = Array.from({ length: R.n }, (_, i) => `<button data-i="${i}" style="--c:${PADS[i].c}"></button>`).join('');
        box.onpointerdown = (e) => { const b = e.target.closest('button'); if (b) { e.preventDefault(); press(+b.dataset.i); } };
      }
    }
    if (k < 0) return;
    const R = P[k];
    // mostrar la secuencia
    if (t >= R.show && t < R.input) {
      if (shownStep === -1) top.textContent = 'Mira bien…';
      const s = Math.floor((t - R.show - LEAD) / R.step);
      if (s >= 0 && s < R.len && s !== shownStep) {
        shownStep = s;
        tone(PADS[R.seq[s]].f, R.step / 1000 * 0.8);
        if (view) view.light(R.seq[s], R.step * 0.75);
        else { const b = stage.querySelector(`[data-i="${R.seq[s]}"]`); if (b) { b.classList.add('lit'); setTimeout(() => b.classList.remove('lit'), R.step * 0.75); } }
      }
    }
    if (t >= R.input && !R._in) { R._in = 1; top.textContent = '¡Tu turno! Repite la secuencia'; sfx.go(); }
    if (t >= R.inputEnd && !R._end) {
      R._end = 1;
      if (!done) { done = true; if (!my[k]) my[k] = { ok: pos, t: R.input }; ctx.submit({ r: my }); top.textContent = '¡Tiempo!'; }
    }
    paintBoard();
  }, 30);

  return () => {
    dead = true;
    clearInterval(iv);
    if (view) view.dispose();
  };
}

function build(m, stage, press, P) {
  const { THREE, miniStage, symbolTexture } = m;
  const S = miniStage(stage, { skyTop: '#03045e', skyBottom: '#3c096c', hemiGround: '#240046', fov: 42 });
  const { scene, camera, particles } = S;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(5, 48), new THREE.MeshStandardMaterial({ color: '#3c1a78', roughness: 0.6, metalness: 0.2 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.2;
  floor.receiveShadow = true;
  scene.add(floor);
  // plataforma
  const plat = new THREE.Group();
  scene.add(plat);
  const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.0, 0.16, 64), new THREE.MeshStandardMaterial({ color: '#240046', metalness: 0.5, roughness: 0.35 }));
  disk.position.y = -0.1;
  disk.receiveShadow = true;
  plat.add(disk);
  const neon = new THREE.Mesh(new THREE.TorusGeometry(0.97, 0.018, 8, 80), new THREE.MeshStandardMaterial({ color: '#c77dff', emissive: '#c77dff', emissiveIntensity: 1.5 }));
  neon.rotation.x = Math.PI / 2;
  neon.position.y = -0.02;
  plat.add(neon);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.4, metalness: 0.2, roughness: 0.2 }));
  core.position.y = 0.08;
  plat.add(core);
  const glow = new THREE.PointLight('#ffffff', 0, 2.5);
  glow.position.y = 0.6;
  scene.add(glow);

  const pads = PADS.map((pd, i) => {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.23, 0.06, 32), new THREE.MeshStandardMaterial({ color: '#3c096c', metalness: 0.6, roughness: 0.3 }));
    base.position.y = -0.0;
    g.add(base);
    const col = new THREE.Color(pd.c);
    const side = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.6), emissive: col, emissiveIntensity: 0.05 });
    const topM = new THREE.MeshStandardMaterial({ map: symbolTexture(pd.c, pd.sym, pd.c === '#ffd000' || pd.c === '#2fe0ff' || pd.c === '#7ae000' ? '#1b1035' : '#ffffff'), emissive: col, emissiveIntensity: 0.05, emissiveMap: null });
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.19, 0.09, 32), [side, topM, side]);
    btn.position.y = 0.06;
    btn.castShadow = true;
    btn.userData.idx = i;
    g.add(btn);
    // haz de luz cuando se ilumina
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 1.2, 24, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    beam.position.y = 0.66;
    g.add(beam);
    plat.add(g);
    return { g, btn, side, topM, beam, col, lit: 0 };
  });

  let n = 4, spin = 0;
  const layout = () => {
    pads.forEach((p, i) => {
      p.g.visible = i < n;
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      p.g.position.set(Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62);
    });
  };
  layout();

  const fitCam = () => {
    const vf = Math.tan((camera.fov * Math.PI) / 360);
    const dist = Math.max(1.06 / (vf * S.aspect), 0.95 / vf);
    camera.position.set(0, dist * 0.78, dist * 0.68);
    camera.lookAt(0, -0.05, 0.05);
  };

  // tocar la pantalla: ¿qué botón 3D tocó?
  const onDown = (e) => {
    e.preventDefault();
    const hit = S.pick(e.clientX, e.clientY, pads.slice(0, n).map((p) => p.btn));
    if (hit && hit.userData.idx !== undefined) press(hit.userData.idx);
  };
  S.renderer.domElement.addEventListener('pointerdown', onDown);
  S.renderer.domElement.style.touchAction = 'none';

  S.start((dt, now) => {
    fitCam();
    plat.rotation.y += spin * dt;
    core.rotation.y += dt;
    let maxLit = 0, litPad = null;
    pads.forEach((p) => {
      p.lit = Math.max(0, p.lit - dt / (p.dur || 0.4));
      const k = p.lit;
      p.btn.position.y = 0.06 - (p.press || 0) * 0.03 + k * 0.03;
      p.press = Math.max(0, (p.press || 0) - dt * 6);
      p.topM.emissiveIntensity = 0.05 + k * 1.3;
      p.side.emissiveIntensity = 0.05 + k * 1.0;
      p.beam.material.opacity = k * 0.35;
      if (k > maxLit) { maxLit = k; litPad = p; }
    });
    if (litPad) {
      const wp = new THREE.Vector3();
      litPad.g.getWorldPosition(wp);
      glow.position.set(wp.x, 0.5, wp.z);
      glow.color.copy(litPad.col);
    }
    glow.intensity = maxLit * 4;
    neon.material.emissiveIntensity = 1.2 + Math.sin(now / 300) * 0.4;
  });

  const burstAt = (p, colors, nn = 16) => {
    const wp = new THREE.Vector3();
    p.g.getWorldPosition(wp);
    particles.burst(wp.x, 0.15, wp.z, { n: nn, color: colors, speed: 0.6, up: 1.2, size: 0.04, life: 0.6, gravity: 2 });
  };

  return {
    newRound(R) {
      n = R.n;
      spin = R.spin;
      plat.rotation.y = 0;
      layout();
      particles.burst(0, 0.2, 0, { n: 30, color: ['#c77dff', '#ffffff'], speed: 0.9, up: 1, size: 0.04, life: 0.7, gravity: 1.5 });
    },
    light(i, ms) { const p = pads[i]; p.lit = 1; p.dur = ms / 1000; burstAt(p, ['#ffffff', p.col.getStyle()], 8); },
    flash(i, ok) {
      const p = pads[i];
      p.lit = 1; p.dur = 0.25; p.press = 1;
      if (ok) burstAt(p, ['#ffffff', p.col.getStyle()], 12);
      else { burstAt(p, ['#ff006e', '#1b1035'], 26); S.shake = 0.04; }
    },
    party() { particles.burst(0, 0.3, 0, { n: 70, color: ['#ffd60a', '#ff4d6d', '#3a86ff', '#06d6a0', '#ffffff'], speed: 1.2, up: 1.8, size: 0.045, life: 1.3, gravity: 2 }); },
    dispose: () => { S.renderer.domElement.removeEventListener('pointerdown', onDown); S.dispose(); },
  };
}
