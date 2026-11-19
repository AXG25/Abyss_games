// Base para mini juegos en TIEMPO REAL (joystick + botón de acción).
//
// Cada juego describe su mundo y su física con funciones puras y deterministas
// (misma semilla → mismo resultado), y este módulo se encarga de:
//  - el bucle a 60 pasos por segundo, controles táctiles y teclado,
//  - publicar mi estado ~15 veces/s y dibujar a los demás interpolados,
//  - simular los bots SOLO en el anfitrión (y publicarlos),
//  - enviar el resultado final.
//
// Un juego G define:
//   TOTAL (s), action (texto del botón o null), lives
//   world(seed) → W                       mundo determinista
//   spawn(i, W) → p                       jugador nuevo en el puesto i
//   step(p, inp, t, W, ext) → evento      física (inp = {x, y}; p.act = acción pedida)
//   brain(seed, idx, W) → (p, t) => inp   IA de bot
//   result(p) → v                         lo que se envía al anfitrión
//   draw(g, view, t, W, ents, meId)       dibuja el escenario y las entidades
//   opcionales: pack(p) → datos extra en red, hud(p), banner(t, W), sounds
import { beep, buzz } from './util.js';
import { sfx, say, music, stopMusic, musicTempo } from './audio.js';
import { avatarImage, rich, icon } from './icons.js';

export const DT = 1 / 60;
// Cuenta regresiva antes de empezar (también la suma el anfitrión a la duración).
export const PRESTART = 3000;
export const TAU = Math.PI * 2;

export function newPlayerBase(x, y, lives) {
  return { x, y, z: 0, h: lives, inv: 0, out: false, tOut: 0, act: false, dash: 0, dcd: 0 };
}

// Movimiento estándar con "dash" opcional.
export function moveBasic(p, inp, speed, dashable = true) {
  if (dashable && p.act && p.dcd <= 0) { p.dash = 0.22; p.dcd = 1.3; p.act = false; p._ev = 'act'; }
  p.act = false;
  const k = p.dash > 0 ? 2.6 : 1;
  if (p.dash > 0) p.dash -= DT;
  if (p.dcd > 0) p.dcd -= DT;
  let ix = inp.x, iy = inp.y;
  const l = Math.hypot(ix, iy);
  if (l > 1) { ix /= l; iy /= l; }
  if (p.dash > 0 && l < 0.2 && p.ldx !== undefined) { ix = p.ldx; iy = p.ldy; }
  if (l > 0.2) { p.ldx = ix / Math.max(l, 1e-6); p.ldy = iy / Math.max(l, 1e-6); }
  p.x += ix * speed * k * DT;
  p.y += iy * speed * k * DT;
  if (p.inv > 0) p.inv -= DT;
}

export function clampCircle(p, rMax) {
  const r = Math.hypot(p.x, p.y);
  if (r > rMax) { p.x *= rMax / r; p.y *= rMax / r; }
}

export function clampBox(p, m) {
  p.x = Math.max(-m, Math.min(m, p.x));
  p.y = Math.max(-m, Math.min(m, p.y));
}

// Resultados de bots calculados en vivo por el anfitrión (cuando los bots
// interactúan con humanos, la simulación aislada no basta).
const LIVE_BOT = new Map();

export function simulateBot(G, seed, idx) {
  const live = LIVE_BOT.get(seed + ':' + idx);
  if (live) return live;
  const W = G.world(seed);
  const p = G.spawn(idx + 1, W);
  const brain = G.brain(seed, idx, W);
  const n = Math.floor(G.TOTAL / DT);
  const ext = G.newExt ? G.newExt() : { taken: new Set() };
  p.id = 'bot' + idx;
  for (let i = 0; i < n && !p.out; i++) {
    const t = i * DT;
    ext.t = t;
    ext.all = [p];
    G.step(p, brain(p, t, ext), t, W, ext);
  }
  return G.result(p);
}

// Dibuja a un jugador (sombra, cuerpo de color, emoji).
export function drawPlayer(g, v, e, meId, t) {
  const px = v.X(e.x), py = v.Y(e.y) - (e.z || 0) * v.R * 0.12;
  const pr = (e.pr || 0.06) * v.R * (1 + (e.z || 0) * 0.4) * (e.scale ?? 1);
  if (pr <= 0.5) return;
  g.beginPath();
  g.ellipse(v.X(e.x), v.Y(e.y) + 3, pr, pr * 0.6, 0, 0, TAU);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fill();
  if (e.out) g.globalAlpha = 0.25;
  else if (e.inv > 0 && Math.floor(t * 12) % 2) g.globalAlpha = 0.4;
  g.beginPath();
  g.arc(px, py, pr * 1.15, 0, TAU);
  g.fillStyle = e.c;
  g.fill();
  if (e.id === meId) { g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke(); }
  const img = avatarImage(e.out ? 'ghost' : e.a);
  if (img.complete && img.naturalWidth) g.drawImage(img, px - pr * 1.1, py - pr * 1.1, pr * 2.2, pr * 2.2);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (e.tag !== undefined) {
    g.font = `bold ${Math.round(pr * 0.9)}px system-ui`;
    g.fillStyle = '#fff';
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 3;
    g.strokeText(e.tag, px, py - pr * 1.8);
    g.fillText(e.tag, px, py - pr * 1.8);
  }
  g.globalAlpha = 1;
}

// Preferencia del jugador: forzar 2D (por si su celular va lento en 3D).
export const USE_2D = () => { try { return localStorage.getItem('pp_2d') === '1'; } catch { return false; } };

// Precarga el motor 3D (se llama en la pantalla de instrucciones).
export function preload3D() { if (!USE_2D()) import('./rt3d.js').catch(() => {}); }

const SOUNDS = {
  act: (G) => (G.action === 'SALTA' ? sfx.jump() : sfx.dash()),
  hit: () => { sfx.hit(); buzz(150); },
  out: () => { sfx.out(); buzz(400); },
  coin: () => sfx.coin(),
  big: () => sfx.big(),
  fall: () => { sfx.fall(); buzz(200); },
  got: () => { sfx.pass(); buzz(120); },
};
// Efectos visuales de mis eventos (los demás los detecta la vista 3D).
const FX_ME = {
  coin: (v, p) => v.burst(p.x, 0.12, p.y, { n: 14, color: ['#ffd60a', '#fff3b0', '#ffffff'], speed: 0.5, up: 1, size: 0.04, life: 0.6, gravity: 2 }),
  big: (v, p) => { v.burst(p.x, 0.12, p.y, { n: 40, color: ['#ffb703', '#ffd60a', '#ffffff'], speed: 0.9, up: 1.6, size: 0.05, life: 0.9, gravity: 2 }); v.shake(0.02); },
};
// Sonidos (más bajitos) de lo que les pasa a los demás jugadores.
const OTHER = { jump: (v) => sfx.jump(v), hit: (v) => sfx.hit(v), out: (v) => sfx.hit(v), fall: (v) => sfx.splash(v), dash: (v) => sfx.dash(v) };

export function mountRT(el, ctx, G) {
  el.innerHTML = `
    <div class="g-kraken">
      <div class="k-hud"><span class="k-lives"></span><span class="k-time">${G.TOTAL}</span><span class="k-alive"></span></div>
      <div class="k-board"><canvas></canvas><div class="k-top" hidden></div><div class="k-msg" hidden></div><div class="k-banner" hidden></div></div>
      <div class="k-ctrl">
        <div class="k-joy"><div class="k-knob"></div></div>
        ${G.action ? `<div class="k-btns">
          ${G.action2 ? `<button class="k-act k-act2" data-a="2" style="--c:${ctx.color}"><span class="k-ico">${icon(G.actionIcon2 || 'bolt')}</span><b>${G.action2}</b></button>` : ''}
          <button class="k-act k-act1" data-a="1" style="--c:${ctx.color}"><span class="k-ico">${icon(G.actionIcon || 'bolt')}</span><b>${G.action}</b></button>
        </div>` : '<div class="k-tip">Muévete con el joystick</div>'}
      </div>
    </div>`;
  const canvas = el.querySelector('canvas');
  const g = canvas.getContext('2d');
  const board = el.querySelector('.k-board');
  const livesEl = el.querySelector('.k-lives');
  const timeEl = el.querySelector('.k-time');
  const aliveEl = el.querySelector('.k-alive');
  const msg = el.querySelector('.k-msg');
  const banner = el.querySelector('.k-banner');
  const topEl = el.querySelector('.k-top');
  const joy = el.querySelector('.k-joy');
  const knob = el.querySelector('.k-knob');
  const actBtns = [...el.querySelectorAll('.k-act')];
  const view = { size: 300, R: 138, X: (v) => v, Y: (v) => v };

  const resize = () => {
    const size = Math.max(200, Math.min(board.clientWidth, board.clientHeight));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const c = size / 2;
    const R = size * 0.47;
    Object.assign(view, { size, R, c, X: (v) => c + v * R, Y: (v) => c + v * R });
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(board);

  const W = G.world(ctx.seed);

  // Vista 3D (si el juego la tiene y el celular soporta WebGL); si no, 2D.
  let v3 = null;
  let dead = false;
  if (G.scene3d && !USE_2D()) {
    import('./rt3d.js').then((m) => {
      if (dead || !m.webglOK()) return;
      try {
        v3 = m.createView3D(board, G, W, { meId: ctx.me, onEvent: (type, e, isMe) => { if (!isMe && OTHER[type]) OTHER[type](0.35); } });
        canvas.style.display = 'none';
      } catch (e) { console.warn('3D no disponible', e); v3 = null; }
    }).catch((e) => console.warn('3D no disponible', e));
  }
  const players = ctx.players;
  const myIdx = Math.max(0, players.findIndex((p) => p.id === ctx.me));
  const me = G.spawn(myIdx, W);
  me.id = ctx.me;
  const bots = ctx.isHost
    ? players.filter((p) => p.b).map((p) => {
      const bi = Number(String(p.id).slice(3)) || 0;
      const bp = G.spawn(bi + 1, W);
      bp.id = p.id;
      return { id: p.id, bi, p: bp, brain: G.brain(ctx.seed, bi, W) };
    })
    : [];

  // --- controles
  const inp = { x: 0, y: 0 };
  let joyId = null;
  let jc = { x: 0, y: 0 };
  const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx}px, ${dy}px)`; };
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
  joy.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    joyId = e.pointerId;
    try { joy.setPointerCapture(e.pointerId); } catch { /* nada */ }
    const r = joy.getBoundingClientRect();
    jc = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    moveJoy(e);
  });
  joy.addEventListener('pointermove', moveJoy);
  const endJoy = (e) => { if (e.pointerId !== joyId) return; joyId = null; inp.x = inp.y = 0; setKnob(0, 0); };
  joy.addEventListener('pointerup', endJoy);
  joy.addEventListener('pointercancel', endJoy);
  for (const b of actBtns) {
    const two = b.dataset.a === '2';
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (two) me.act2 = true; else me.act = true; b.classList.add('down'); });
    const up = () => b.classList.remove('down');
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
  }
  // recarga de los botones: 1 = recién usado (oscuro), 0 = listo (color real)
  const cdOf = [(p) => (G.cd1 ? G.cd1(p) : (p.dcd > 0 ? p.dcd / 1.3 : 0)), (p) => (G.cd2 ? G.cd2(p) : (p.dcd > 0 ? p.dcd / 1.3 : 0))];
  const cdPrev = [0, 0];
  const paintButtons = () => {
    for (const b of actBtns) {
      const i = b.dataset.a === '2' ? 1 : 0;
      const f = me.out ? 1 : Math.max(0, Math.min(1, cdOf[i](me) || 0));
      if (Math.abs(f - cdPrev[i]) > 0.004 || (f === 0 && cdPrev[i] !== 0)) {
        b.style.setProperty('--cd', f.toFixed(3));
        b.classList.toggle('cooling', f > 0);
        if (f === 0 && cdPrev[i] > 0 && !me.out) {
          b.classList.remove('ready');
          void b.offsetWidth;
          b.classList.add('ready');
          sfx.ready();
        }
        cdPrev[i] = f;
      }
      b.classList.toggle('off', !!me.out);
    }
  };
  const keys = new Set();
  const kd = (e) => { keys.add(e.key); if (e.key === ' ') me.act = true; if (e.key === 'Shift') me.act2 = true; };
  const ku = (e) => keys.delete(e.key);
  addEventListener('keydown', kd);
  addEventListener('keyup', ku);

  // --- otros jugadores
  const smooth = new Map();
  const colorOf = Object.fromEntries(players.map((p) => [p.id, p.c]));
  const avOf = Object.fromEntries(players.map((p) => [p.id, p.a]));
  const remote = () => {
    const out = [];
    for (const { id, lv } of ctx.others()) {
      if (!lv || !colorOf[id]) continue;
      if (lv.hs && typeof lv.hs === 'object' && !ctx.isHost) ext.hs = lv.hs;
      if (lv.over) ext.over = true;
      out.push({ id, x: +lv.x || 0, y: +lv.y || 0, z: +lv.z || 0, h: lv.h, out: !!lv.out, inv: lv.inv, e: lv.e, d: lv.d });
      if (Array.isArray(lv.b)) {
        for (const b of lv.b) {
          if (Array.isArray(b) && colorOf[b[0]]) out.push({ id: b[0], x: +b[1] || 0, y: +b[2] || 0, z: +b[3] || 0, h: b[4], out: !!b[5], inv: b[6], e: b[7], d: b[8] });
        }
      }
    }
    return out;
  };

  const showMsg = (txt, ms = 1200) => {
    msg.innerHTML = rich(txt);
    msg.hidden = false;
    clearTimeout(showMsg.t);
    if (ms) showMsg.t = setTimeout(() => { msg.hidden = true; }, ms);
  };


  let acc = 0;
  let simT = 0;
  let last = performance.now();
  const startAt = last + PRESTART;
  let lastCount = -1;
  let prevT = 0;
  let tempoUp = false;
  const ents0 = () => [me, ...bots.map((b) => b.p), ...ext.remote || []];
  const fx = {
    sfx, say, me, msg: (t, ms) => showMsg(t, ms),
    burst: (x, y, z, o) => v3 && v3.burst(x, y, z, o),
    shake: (a) => v3 && v3.shake(a),
    // volumen según la distancia a mi jugador
    near: (x, y) => Math.max(0.25, Math.min(1, 1.2 - Math.hypot(x - me.x, y - me.y) * 0.8)),
    st: {},
  };
  // (la música arranca con el ¡YA!)
  let lastPub = 0;
  let raf = 0;
  let finished = false;
  let submitted = false;
  let lastBanner = '';
  const ext = G.newExt ? G.newExt() : { taken: new Set() };
  ext.all = [];
  if (ctx.isHost && G.hostInit) ext.hs = G.hostInit(W, players);
  let overSent = false;
  const saveBot = (b) => { LIVE_BOT.set(ctx.seed + ':' + b.bi, G.result(b.p)); };
  const submit = () => {
    if (submitted) return;
    submitted = true;
    ctx.submit(G.result(me));
  };
  const r3 = (v) => Math.round(v * 1000) / 1000;

  const frame = (now) => {
    const dt = Math.min(0.5, (now - last) / 1000); // si el celular va lento, la simulación se pone al día
    last = now;
    // cuenta regresiva: nadie se mueve hasta el ¡YA!
    const pre = now < startAt;
    if (pre) {
      acc = 0;
      const n = Math.ceil((startAt - now) / 1000);
      if (n !== lastCount) { lastCount = n; showMsg(String(n), 0); msg.classList.add('count'); sfx.count(); }
    } else if (lastCount !== 0) {
      lastCount = 0;
      msg.classList.remove('count');
      showMsg('¡YA!', 700);
      sfx.go();
      if (G.music) music(G.music);
    }
    if (!pre) acc += dt;
    // Si el reloj real ya llegó al final (celular muy lento), adelantar todo para no llegar tarde.
    const wall = (now - startAt) / 1000;
    if (!pre && wall > simT + acc + 0.25) acc = wall - simT;
    const others = remote();
    ext.remote = others;
    if (G.collectTaken) G.collectTaken(ext, others);
    if (G.sync) G.sync(ext, others, simT);
    ext.all = [me, ...bots.map((b) => b.p), ...others];
    while (acc >= DT && simT < G.TOTAL && !finished) {
      ext.t = simT;
      if (ctx.isHost && G.hostTick) G.hostTick(ext.hs, simT, W, ext.all, players);
      let ix = inp.x, iy = inp.y;
      if (keys.size) {
        ix = (keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0);
        iy = (keys.has('ArrowDown') || keys.has('s') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('w') ? 1 : 0);
      }
      if (G.inputYaw) { const c = Math.cos(G.inputYaw), sn = Math.sin(G.inputYaw); [ix, iy] = [ix * c + iy * sn, -ix * sn + iy * c]; }
      const ev = G.step(me, { x: ix, y: iy }, simT, W, ext);
      if (ev && SOUNDS[ev]) SOUNDS[ev](G);
      if (ev && v3 && FX_ME[ev]) FX_ME[ev](v3, me);
      if (ev === 'hit') showMsg('{bolt} ¡Auch!', 700);
      if (ev === 'fall') showMsg(G.fallText || '{splash} ¡Al agua!', 900);
      if (ev === 'got') showMsg('{bomb} ¡Tienes la bomba!', 900);
      if (ev === 'out') { showMsg('{ghost} ¡Eliminado!', 0); submit(); }
      for (const b of bots) {
        const wasOut = b.p.out;
        G.step(b.p, b.brain(b.p, simT, ext), simT, W, ext);
        if (b.p.out && !wasOut) saveBot(b);
      }
      if (G.applyHost && ext.hs) {
        const e2 = G.applyHost(me, ext.hs, simT);
        if (e2 === 'out') { SOUNDS.out(); showMsg('{ghost} ¡Eliminado!', 0); submit(); }
        for (const b of bots) { const w = b.p.out; G.applyHost(b.p, ext.hs, simT); if (b.p.out && !w) saveBot(b); }
      }
      // fin anticipado: queda uno solo (lo decide el anfitrión)
      if (ctx.isHost && !overSent) {
        const alive = ext.all.filter((e) => !e.out).length;
        // termina si cayeron todos, o si queda uno solo (con 2+ jugadores); o la regla del juego
        if (G.over ? G.over(ext.all, simT) : (alive === 0 || (players.length > 1 && alive <= 1))) { overSent = true; ext.over = true; setTimeout(() => ctx.endEarly && ctx.endEarly(), 300); }
      }
      if (ext.over) break;
      simT += DT;
      acc -= DT;
    }
    // eventos del mundo (explosiones, choques, rugidos…): sonido y efectos
    if (G.events) {
      try { G.events(prevT, simT, W, ext, ents0(), fx); } catch (e) { console.warn(e); }
    }
    prevT = simT;
    if (!tempoUp && simT > G.TOTAL * 0.7) { tempoUp = true; musicTempo(1.18); }
    if ((simT >= G.TOTAL || ext.over) && !finished) {
      finished = true;
      stopMusic();
      if (!me.out) { showMsg(G.endText ? G.endText(me) : ext.over ? '{trophy} ¡Quedaste en pie!' : '{trophy} ¡Sobreviviste!', 0); sfx.win(); if (v3) v3.burst(me.x, 0.3, me.y, { n: 60, color: ['#ffd60a', '#ff4d6d', '#3a86ff', '#06d6a0', '#ffffff'], speed: 1, up: 2, size: 0.05, life: 1.6, gravity: 2.5 }); }
      for (const b of bots) saveBot(b);
      submit();
    }
    if (now - lastPub > 66) {
      lastPub = now;
      const lv = { x: r3(me.x), y: r3(me.y), z: r3(me.z || 0), h: me.h, out: me.out ? 1 : 0, inv: me.inv > 0 ? 1 : 0, d: me.dash > 0 || me.push > 0 ? 1 : 0 };
      if (G.pack) lv.e = G.pack(me);
      if (ctx.isHost && ext.hs) lv.hs = ext.hs;
      if (ctx.isHost && ext.over) lv.over = 1;
      if (bots.length) lv.b = bots.map((b) => [b.id, r3(b.p.x), r3(b.p.y), r3(b.p.z || 0), b.p.h, b.p.out ? 1 : 0, b.p.inv > 0 ? 1 : 0, G.pack ? G.pack(b.p) : null, b.p.dash > 0 || b.p.push > 0 ? 1 : 0]);
      ctx.live(lv);
    }
    const ents = [];
    for (const e of others) {
      let s = smooth.get(e.id);
      if (!s) { s = { x: e.x, y: e.y, z: e.z }; smooth.set(e.id, s); }
      s.x += (e.x - s.x) * 0.35;
      s.y += (e.y - s.y) * 0.35;
      s.z += (e.z - s.z) * 0.5;
      ents.push({ ...e, x: s.x, y: s.y, z: s.z, c: colorOf[e.id], a: avOf[e.id] });
    }
    for (const b of bots) ents.push({ id: b.id, ...b.p, e: G.pack ? G.pack(b.p) : null, c: colorOf[b.id], a: avOf[b.id] });
    ents.push({ id: ctx.me, ...me, e: G.pack ? G.pack(me) : null, c: ctx.color, a: avOf[ctx.me] || 'frog' });
    ents.sort((a, b) => (a.z || 0) - (b.z || 0));
    const tDraw = Math.min(simT, G.TOTAL - DT);
    if (v3) v3.render(tDraw, ents, ext, ctx.me);
    else G.draw(g, view, tDraw, W, ents, ctx.me, ext);
    const top = G.topText ? G.topText(tDraw, W, ext) : null;
    if ((top || '') !== (topEl.dataset.t || '') || !!top === topEl.hidden) { topEl.hidden = !top; topEl.innerHTML = rich(top || ''); topEl.dataset.t = top || ''; topEl.classList.toggle('danger', !!(top && top.danger)); }
    paintButtons();
    const hudL = G.hud ? G.hud(me) : me.out ? '{ghost}' : '{heart}'.repeat(Math.max(0, me.h)) + '{heartEmpty}'.repeat(Math.max(0, G.lives - me.h));
    if (hudL !== livesEl.dataset.t) { livesEl.dataset.t = hudL; livesEl.innerHTML = rich(hudL); }
    timeEl.textContent = Math.max(0, Math.ceil(G.TOTAL - simT));
    const hudR = G.hudRight ? G.hudRight(ents) : `{people} ${ents.filter((e) => !e.out).length}`;
    if (hudR !== aliveEl.dataset.t) { aliveEl.dataset.t = hudR; aliveEl.innerHTML = rich(hudR); }
    const bn = G.banner ? G.banner(tDraw, W) : null;
    const key = bn ? bn.text + bn.color : '';
    if (key !== lastBanner) {
      lastBanner = key;
      banner.hidden = !bn;
      if (bn) { banner.innerHTML = rich(bn.text); banner.style.background = bn.color; banner.style.color = bn.fg || '#fff'; banner.style.textShadow = bn.fg && bn.fg !== '#fff' && bn.fg !== '#ffffff' ? 'none' : ''; beep(660, 0.1, 'triangle'); }
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return () => {
    dead = true;
    stopMusic();
    if (v3) { try { v3.dispose(); } catch { /* nada */ } }
    cancelAnimationFrame(raf);
    ro.disconnect();
    removeEventListener('keydown', kd);
    removeEventListener('keyup', ku);
    clearTimeout(showMsg.t);
  };
}

// Evaluación típica de supervivencia: sobrevivir > durar más.
export function evalSurvival(v, TOTAL, LIVES) {
  if (!v || typeof v.t !== 'number') return null;
  const h = Math.max(0, Math.min(LIVES, Math.floor(v.h) || 0));
  const t = Math.max(0, Math.min(TOTAL * 1000, v.t));
  if (t >= TOTAL * 1000 && h > 0) return { score: 1e6 + h * 1e5, label: `${'{heart}'.repeat(h)} ¡sobrevivió!` };
  return { score: t, label: `cayó a los ${(t / 1000).toFixed(1)} s` };
}
