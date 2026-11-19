// 🐙 Kraken en cubierta — mini juego en TIEMPO REAL.
// Todos están en la cubierta de un barco (vista desde arriba). Del centro salen
// tentáculos que giran: los largos cruzan todo el barco (hay que SALTAR) y los
// cortos solo llegan a la mitad (aléjate hacia el borde). 3 vidas.
//
// Sincronización: cada teléfono simula su propio jugador y los tentáculos (que
// dependen solo de la semilla y del tiempo) y publica su posición en
// `ctx.live()`. Los bots solo los simula el anfitrión y los publica también.
import { mulberry32, beep, buzz } from "../util.js";

const TOTAL = 45;            // segundos
const DT = 1 / 60;
const DECK = 0.9;            // radio caminable
const HOLE = 0.17;           // agujero central
const LONG = 1.0;
const SHORT = 0.56;
const HW = 0.055;            // medio ancho del tentáculo
const PR = 0.055;            // radio del jugador
const SPEED = 0.75;          // unidades/seg
const JUMP = 0.62;           // duración del salto
const LIVES = 3;
const TAU = Math.PI * 2;
const wrap = (a) => ((a % TAU) + TAU + Math.PI) % TAU - Math.PI;

// Tabla de ángulos de rotación (determinista con la semilla).
export function makeArms(seed) {
  const r = mulberry32(seed ^ 0x9e3779b9);
  const n = Math.ceil(TOTAL / DT) + 2;
  const ang = new Float64Array(n);
  const om = new Float64Array(n);
  let dir = r() < 0.5 ? 1 : -1;
  let nextFlip = 5 + r() * 5;
  let a = r() * TAU;
  for (let i = 0; i < n; i++) {
    const t = i * DT;
    if (t > nextFlip) { dir = -dir; nextFlip = t + 4 + r() * 5; }
    const w = dir * (1.1 + 0.032 * t);
    a += w * DT;
    ang[i] = a;
    om[i] = w;
  }
  const grow = (t, t0) => Math.max(0, Math.min(1, (t - t0) / 1.2));
  return (t) => {
    const i = Math.max(0, Math.min(n - 1, Math.floor(t / DT)));
    const a0 = ang[i];
    const w = om[i];
    const arms = [{ a: a0, L: LONG, long: true, w }];
    if (t > 12 && t <= 26) arms.push({ a: a0 + Math.PI, L: SHORT * grow(t, 12), long: false, w });
    if (t > 26) {
      arms.push({ a: a0 + Math.PI, L: Math.max(SHORT, LONG * grow(t, 26)), long: true, w });
      arms.push({ a: a0 + Math.PI / 2, L: SHORT * grow(t, 26), long: false, w });
      arms.push({ a: a0 - Math.PI / 2, L: SHORT * grow(t, 26), long: false, w });
    }
    return arms;
  };
}

export function newPlayer(i) {
  const a = -Math.PI / 2 + (i * TAU) / 4 + 0.4;
  return { x: Math.cos(a) * 0.7, y: Math.sin(a) * 0.7, z: 0, jt: 0, cd: 0, h: LIVES, inv: 0, out: false, tOut: 0, jq: false };
}

function hitBy(p, arm) {
  const pr = Math.hypot(p.x, p.y);
  if (pr > arm.L + PR) return false;
  const d = wrap(Math.atan2(p.y, p.x) - arm.a);
  return Math.cos(d) > 0 && pr * Math.abs(Math.sin(d)) < HW + PR;
}

// Un paso de física. `inp` = {x, y} dirección (-1..1); p.jq = salto pedido.
export function step(p, inp, t, arms) {
  if (p.out) return null;
  let ev = null;
  p.x += inp.x * SPEED * DT;
  p.y += inp.y * SPEED * DT;
  const r = Math.hypot(p.x, p.y) || 1e-6;
  const cl = Math.max(HOLE + PR, Math.min(DECK, r));
  if (cl !== r) { p.x *= cl / r; p.y *= cl / r; }
  if (p.jq && p.jt <= 0 && p.cd <= 0) { p.jt = JUMP; ev = 'jump'; }
  p.jq = false;
  if (p.jt > 0) {
    p.jt -= DT;
    p.z = p.jt > 0 ? Math.sin(Math.PI * (1 - p.jt / JUMP)) : 0;
    if (p.jt <= 0) { p.cd = 0.1; p.z = 0; }
  } else if (p.cd > 0) p.cd -= DT;
  if (p.inv > 0) p.inv -= DT;
  const air = p.jt > 0.05 && p.jt < JUMP - 0.04;
  if (!air && p.inv <= 0) {
    for (const arm of arms) {
      if (!hitBy(p, arm)) continue;
      p.h--;
      p.inv = 1.4;
      // empujón en la dirección en que gira el tentáculo
      const a = Math.atan2(p.y, p.x) + Math.sign(arm.w || 1) * 0.35;
      const rr = Math.hypot(p.x, p.y);
      p.x = Math.cos(a) * rr;
      p.y = Math.sin(a) * rr;
      ev = 'hit';
      if (p.h <= 0) { p.out = true; p.tOut = t; ev = 'out'; }
      break;
    }
  }
  return ev;
}

// IA de bot determinista (misma semilla → mismo resultado).
export function botBrain(seed, idx) {
  const r = mulberry32((seed ^ (0x51ed27 * (idx + 1))) >>> 0);
  const skill = 0.8 + r() * 0.15;
  let goalA = r() * TAU;
  let goalR = 0.75;
  let nextGoal = 0;
  const decided = new Map();
  return (p, t, arms) => {
    if (t > nextGoal) { goalA = Math.atan2(p.y, p.x) + (r() - 0.5) * 2; goalR = (t > 11 ? 0.72 : 0.58) + r() * 0.15; nextGoal = t + 1.5 + r() * 2.5; }
    const gx = Math.cos(goalA) * goalR - p.x;
    const gy = Math.sin(goalA) * goalR - p.y;
    const gl = Math.hypot(gx, gy);
    const inp = gl > 0.04 ? { x: (gx / gl) * 0.8, y: (gy / gl) * 0.8 } : { x: 0, y: 0 };
    const pa = Math.atan2(p.y, p.x);
    const pr = Math.hypot(p.x, p.y);
    arms.forEach((arm, k) => {
      if (pr > arm.L + 0.05) return;
      const ahead = wrap((pa - arm.a) * Math.sign(arm.w));
      const angW = Math.asin(Math.min(1, (HW + PR) / Math.max(pr, 0.01)));
      const tc = (ahead - angW) / Math.abs(arm.w); // segundos hasta el contacto
      if (ahead > -angW && tc < 0.12) {
        if (!decided.get(k)) { decided.set(k, true); if (r() < skill) p.jq = true; }
      } else if (ahead < -angW - 0.1 || tc > 0.8) decided.set(k, false);
    });
    return inp;
  };
}

function simulateBot(seed, idx) {
  const armsAt = makeArms(seed);
  const p = newPlayer(idx + 1);
  const brain = botBrain(seed, idx);
  const n = Math.floor(TOTAL / DT);
  for (let i = 0; i < n && !p.out; i++) {
    const t = i * DT;
    const arms = armsAt(t);
    step(p, brain(p, t, arms), t, arms);
  }
  return { h: Math.max(0, p.h), t: p.out ? Math.round(p.tOut * 1000) : TOTAL * 1000 };
}

// ---------------------------------------------------------------- dibujo
function drawScene(g, S, t, arms, ents, meId) {
  const { size } = S;
  const c = size / 2;
  const R = size * 0.46;
  const X = (v) => c + v * R;
  g.clearRect(0, 0, size, size);
  // agua
  g.fillStyle = '#0b3b66';
  g.fillRect(0, 0, size, size);
  g.strokeStyle = 'rgba(255,255,255,0.12)';
  g.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    const y = ((i * size) / 8 + t * 18) % (size + 20) - 10;
    g.beginPath();
    for (let x = 0; x <= size; x += 10) g.lineTo(x, y + Math.sin(x / 22 + t * 2 + i) * 4);
    g.stroke();
  }
  // casco y cubierta
  g.beginPath(); g.arc(c, c + 6, R * 1.04, 0, TAU); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill();
  g.beginPath(); g.arc(c, c, R * 1.04, 0, TAU); g.fillStyle = '#6b3b1f'; g.fill();
  g.save();
  g.beginPath(); g.arc(c, c, R * 0.98, 0, TAU); g.clip();
  g.fillStyle = '#c98b4f'; g.fillRect(0, 0, size, size);
  g.strokeStyle = 'rgba(90,50,20,0.35)'; g.lineWidth = 2;
  for (let x = c - R; x < c + R; x += R / 6) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, size); g.stroke(); }
  // zona peligrosa de tentáculos cortos
  if (t > 11) {
    g.beginPath(); g.arc(c, c, SHORT * R, 0, TAU);
    g.fillStyle = `rgba(255,77,109,${0.1 + 0.05 * Math.sin(t * 6)})`; g.fill();
  }
  g.restore();
  // agujero
  const hg = g.createRadialGradient(c, c, 2, c, c, HOLE * R * 1.1);
  hg.addColorStop(0, '#000'); hg.addColorStop(1, '#1a0f2e');
  g.beginPath(); g.arc(c, c, HOLE * R, 0, TAU); g.fillStyle = hg; g.fill();
  // tentáculos
  for (const arm of arms) {
    if (arm.L < 0.05) continue;
    const segs = 18;
    const base = arm.long ? [120, 40, 160] : [230, 90, 160];
    for (let s = segs; s >= 0; s--) {
      const f = s / segs;
      const rr = HOLE * 0.5 + f * (arm.L - HOLE * 0.5);
      const wig = Math.sin(f * 7 - t * 9) * 0.035 * f;
      const a = arm.a + wig / Math.max(rr, 0.1);
      const px = X(Math.cos(a) * rr), py = X(Math.sin(a) * rr);
      const w = (HW * R) * (1.25 - f * 0.55);
      g.beginPath(); g.arc(px, py, w, 0, TAU);
      g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; g.fill();
      if (s % 2 === 0 && s > 1) { g.beginPath(); g.arc(px, py, w * 0.35, 0, TAU); g.fillStyle = 'rgba(255,200,220,0.7)'; g.fill(); }
    }
  }
  // jugadores (sombra y luego cuerpo)
  for (const e of ents) {
    if (e.out) continue;
    const px = X(e.x), py = X(e.y), pr = PR * R;
    g.beginPath(); g.ellipse(px, py + 3, pr * (1 - e.z * 0.3), pr * 0.6 * (1 - e.z * 0.3), 0, 0, TAU);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill();
  }
  for (const e of ents) {
    const px = X(e.x), py = X(e.y) - e.z * R * 0.12, pr = PR * R * (1 + e.z * 0.45);
    if (e.out) { g.globalAlpha = 0.25; }
    else if (e.inv > 0 && Math.floor(t * 12) % 2) g.globalAlpha = 0.4;
    g.beginPath(); g.arc(px, py, pr * 1.15, 0, TAU); g.fillStyle = e.c; g.fill();
    if (e.id === meId) { g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke(); }
    g.font = `${Math.round(pr * 1.5)}px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji'`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(e.out ? '👻' : e.a, px, py + 1);
    g.globalAlpha = 1;
  }
}

export default {
  id: 'kraken',
  name: 'Kraken en cubierta',
  emoji: '🐙',
  realtime: true,
  desc: '¡El kraken atacó el barco! Muévete con el joystick y SALTA los tentáculos largos. Los cortos (rosados) solo llegan a la mitad: aléjate hacia el borde. Tienes 3 vidas.',
  dur: () => TOTAL * 1000,

  mount(el, ctx) {
    el.innerHTML = `
      <div class="g-kraken">
        <div class="k-hud"><span class="k-lives"></span><span class="k-time">45</span><span class="k-alive"></span></div>
        <div class="k-board"><canvas></canvas><div class="k-msg" hidden></div></div>
        <div class="k-ctrl">
          <div class="k-joy"><div class="k-knob"></div></div>
          <button class="k-jump" style="--c:${ctx.color}">SALTA</button>
        </div>
      </div>`;
    const canvas = el.querySelector('canvas');
    const g = canvas.getContext('2d');
    const board = el.querySelector('.k-board');
    const livesEl = el.querySelector('.k-lives');
    const timeEl = el.querySelector('.k-time');
    const aliveEl = el.querySelector('.k-alive');
    const msg = el.querySelector('.k-msg');
    const joy = el.querySelector('.k-joy');
    const knob = el.querySelector('.k-knob');
    const jumpBtn = el.querySelector('.k-jump');
    const S = { size: 300 };

    const resize = () => {
      const w = board.clientWidth;
      const h = board.clientHeight;
      S.size = Math.max(200, Math.min(w, h));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = S.size * dpr;
      canvas.height = S.size * dpr;
      canvas.style.width = S.size + 'px';
      canvas.style.height = S.size + 'px';
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(board);

    const armsAt = makeArms(ctx.seed);
    const players = ctx.players;
    const myIdx = Math.max(0, players.findIndex((p) => p.id === ctx.me));
    const me = newPlayer(myIdx);
    const bots = ctx.isHost
      ? players.map((p, i) => (p.b ? { id: p.id, p: newPlayer(i), brain: botBrain(ctx.seed, Number(String(p.id).slice(3)) || 0), idx: i } : null)).filter(Boolean)
      : [];
    // Los bots corren con la misma física que simulateBot (empiezan en su puesto de bot).
    bots.forEach((b) => { b.p = newPlayer((Number(String(b.id).slice(3)) || 0) + 1); });

    // --- controles
    const inp = { x: 0, y: 0 };
    let joyId = null;
    let jc = { x: 0, y: 0 };
    const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx}px, ${dy}px)`; };
    joy.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      joyId = e.pointerId;
      joy.setPointerCapture(e.pointerId);
      const r = joy.getBoundingClientRect();
      jc = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      moveJoy(e);
    });
    const moveJoy = (e) => {
      if (e.pointerId !== joyId) return;
      const max = joy.clientWidth * 0.32;
      let dx = e.clientX - jc.x;
      let dy = e.clientY - jc.y;
      const l = Math.hypot(dx, dy);
      if (l > max) { dx *= max / l; dy *= max / l; }
      setKnob(dx, dy);
      const n = Math.hypot(dx, dy) / max;
      inp.x = n > 0.15 ? dx / max : 0;
      inp.y = n > 0.15 ? dy / max : 0;
    };
    joy.addEventListener('pointermove', moveJoy);
    const endJoy = (e) => { if (e.pointerId !== joyId) return; joyId = null; inp.x = inp.y = 0; setKnob(0, 0); };
    joy.addEventListener('pointerup', endJoy);
    joy.addEventListener('pointercancel', endJoy);
    jumpBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); me.jq = true; jumpBtn.classList.add('down'); });
    jumpBtn.addEventListener('pointerup', () => jumpBtn.classList.remove('down'));
    const keys = new Set();
    const kd = (e) => { keys.add(e.key); if (e.key === ' ') me.jq = true; };
    const ku = (e) => keys.delete(e.key);
    addEventListener('keydown', kd);
    addEventListener('keyup', ku);

    // --- otros jugadores (interpolados)
    const view = new Map();
    const colorOf = Object.fromEntries(players.map((p, i) => [p.id, p.c]));
    const avOf = Object.fromEntries(players.map((p) => [p.id, p.a]));
    const remote = () => {
      const out = [];
      const live = ctx.others();
      for (const { id, lv } of live) {
        if (!lv || !colorOf[id]) continue;
        out.push({ id, ...lv });
        if (Array.isArray(lv.b)) for (const b of lv.b) if (Array.isArray(b) && colorOf[b[0]]) out.push({ id: b[0], x: b[1], y: b[2], z: b[3], h: b[4], out: !!b[5], inv: b[6] });
      }
      return out;
    };

    const t0 = performance.now();
    let acc = 0;
    let simT = 0;
    let last = t0;
    let lastPub = 0;
    let raf = 0;
    let finished = false;
    let submitted = false;

    const submit = () => {
      if (submitted) return;
      submitted = true;
      ctx.submit({ h: Math.max(0, me.h), t: me.out ? Math.round(me.tOut * 1000) : TOTAL * 1000 });
    };
    const showMsg = (txt, ms = 1200) => {
      msg.textContent = txt; msg.hidden = false;
      clearTimeout(showMsg.t);
      if (ms) showMsg.t = setTimeout(() => { msg.hidden = true; }, ms);
    };
    showMsg('¡A esquivar!', 1000);

    const frame = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      acc += dt;
      while (acc >= DT && simT < TOTAL) {
        const arms = armsAt(simT);
        let ix = inp.x, iy = inp.y;
        if (keys.size) {
          ix = (keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0);
          iy = (keys.has('ArrowDown') || keys.has('s') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('w') ? 1 : 0);
        }
        const ev = step(me, { x: ix, y: iy }, simT, arms);
        if (ev === 'jump') beep(520, 0.08, 'triangle');
        if (ev === 'hit') { beep(150, 0.25, 'sawtooth', 0.08); buzz(150); showMsg('¡Ay! 💥', 700); }
        if (ev === 'out') { beep(110, 0.5, 'sawtooth', 0.08); buzz(400); showMsg('👻 ¡Te atrapó el kraken!', 0); submit(); }
        for (const b of bots) step(b.p, b.brain(b.p, simT, arms), simT, arms);
        if (simT > 11.9 && simT < 11.9 + DT * 1.5) showMsg('⚠️ ¡Tentáculo corto! Ve al borde', 1600);
        if (simT > 25.9 && simT < 25.9 + DT * 1.5) showMsg('⚠️ ¡El kraken se enoja!', 1600);
        simT += DT;
        acc -= DT;
      }
      if (simT >= TOTAL && !finished) {
        finished = true;
        if (!me.out) { showMsg('🎉 ¡Sobreviviste!', 0); beep(880, 0.2, 'triangle'); }
        submit();
      }
      // publicar posición ~15 veces por segundo
      if (now - lastPub > 66) {
        lastPub = now;
        const r3 = (v) => Math.round(v * 1000) / 1000;
        const lv = { x: r3(me.x), y: r3(me.y), z: r3(me.z), h: me.h, out: me.out ? 1 : 0, inv: me.inv > 0 ? 1 : 0 };
        if (bots.length) lv.b = bots.map((b) => [b.id, r3(b.p.x), r3(b.p.y), r3(b.p.z), b.p.h, b.p.out ? 1 : 0, b.p.inv > 0 ? 1 : 0]);
        ctx.live(lv);
      }
      // entidades a dibujar
      const ents = [];
      for (const e of remote()) {
        let v = view.get(e.id);
        if (!v) { v = { x: e.x, y: e.y, z: e.z }; view.set(e.id, v); }
        v.x += (e.x - v.x) * 0.35; v.y += (e.y - v.y) * 0.35; v.z += (e.z - v.z) * 0.5;
        ents.push({ id: e.id, x: v.x, y: v.y, z: v.z, out: !!e.out, inv: e.inv ? 1 : 0, c: colorOf[e.id], a: avOf[e.id], h: e.h });
      }
      for (const b of bots) ents.push({ id: b.id, x: b.p.x, y: b.p.y, z: b.p.z, out: b.p.out, inv: b.p.inv, c: colorOf[b.id], a: avOf[b.id], h: b.p.h });
      ents.push({ id: ctx.me, x: me.x, y: me.y, z: me.z, out: me.out, inv: me.inv, c: ctx.color, a: avOf[ctx.me] || '🙂', h: me.h });
      ents.sort((a, b) => a.z - b.z);
      drawScene(g, S, simT, armsAt(Math.min(simT, TOTAL - DT)), ents, ctx.me);
      livesEl.textContent = me.out ? '👻' : '❤️'.repeat(me.h) + '🖤'.repeat(LIVES - me.h);
      timeEl.textContent = Math.max(0, Math.ceil(TOTAL - simT));
      aliveEl.textContent = `🧍 ${ents.filter((e) => !e.out).length}`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      removeEventListener('keydown', kd);
      removeEventListener('keyup', ku);
      clearTimeout(showMsg.t);
    };
  },

  evaluate(v) {
    if (!v || typeof v.t !== 'number') return null;
    const h = Math.max(0, Math.min(LIVES, Math.floor(v.h) || 0));
    const t = Math.max(0, Math.min(TOTAL * 1000, v.t));
    if (t >= TOTAL * 1000 && h > 0) return { score: 1e6 + h * 1e5, label: `${'❤️'.repeat(h)} ¡sobrevivió!` };
    return { score: t, label: `cayó a los ${(t / 1000).toFixed(1)} s` };
  },

  bot: (r, seed, p) => simulateBot(seed, Number(String(p?.id || 'bot0').slice(3)) || 0),
};
