// 🁫 Dominó — pantalla. La línea de fichas se dibuja en SVG como una serpiente:
// desde la primera ficha, el brazo derecho va a la derecha y baja, el izquierdo
// va a la izquierda y sube; los dobles van atravesados. Se ajusta sola al espacio.
import { TURN_MS, OFF_TURN_MS, current, sidesFor, playable, pips, sideOf, sides, membersOf } from './domino.js';
import { avatarSVG, validAvatar, icon } from '../icons.js';
import { esc, buzz } from '../util.js';
import { sfx, isMuted, setMuted } from '../audio.js';

// ---- pepas (en un cuadrado de 1×1)
const PIP = {
  0: [], 1: [[0.5, 0.5]], 2: [[0.27, 0.27], [0.73, 0.73]], 3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]], 5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
  6: [[0.27, 0.22], [0.27, 0.5], [0.27, 0.78], [0.73, 0.22], [0.73, 0.5], [0.73, 0.78]],
};
// pepas de la mitad con centro (cx, cy); `rot` = la ficha está acostada
const pipsAt = (v, cx, cy, rot) => PIP[v].map(([x, y]) => {
  const [px, py] = rot ? [y, x] : [x, y];
  return `<circle cx="${(cx - 0.5 + px).toFixed(3)}" cy="${(cy - 0.5 + py).toFixed(3)}" r="0.085"/>`;
}).join('');

// ficha suelta (mano), vertical: arriba a, abajo b
export function tileSVG(t, cls = '') {
  return `<svg class="dm-t ${cls}" viewBox="-0.06 -0.06 1.12 2.12" data-t="${t}"><rect x="0" y="0" width="1" height="2" rx="0.14" class="dm-face"/><path d="M0.12 1h0.76" class="dm-mid"/><g class="dm-pips">${pipsAt(+t[0], 0.5, 0.5, false)}${pipsAt(+t[1], 0.5, 1.5, false)}</g></svg>`;
}
const backSVG = () => '<svg class="dm-t back" viewBox="-0.06 -0.06 1.12 2.12"><rect x="0" y="0" width="1" height="2" rx="0.14"/></svg>';

// ---- serpiente
const LIMIT = 6.2;
function walk(list, start, dir, turn) {
  // list: [{ n, f }] de la primera ficha hacia afuera (n = valor que toca)
  const out = [];
  let P = { ...start }, d = dir, mode = 'row', rowDir = dir;
  for (const { n, f } of list) {
    const dbl = n === f;
    if (mode === 'row') {
      const len = dbl ? 1 : 2;
      if (Math.abs(P.x + d[0] * len) > LIMIT) {
        // esquina: la ficha dobla hacia `turn`
        const c1 = { x: P.x + d[0] * 0.5, y: P.y + d[1] * 0.5 };
        const c2 = { x: c1.x + turn[0], y: c1.y + turn[1] };
        out.push({ c1, c2, n, f });
        P = { x: c2.x + turn[0] * 0.5, y: c2.y + turn[1] * 0.5 };
        rowDir = d;
        d = turn;
        mode = 'corner';
        continue;
      }
      if (dbl) {
        const cx = P.x + d[0] * 0.5, cy = P.y + d[1] * 0.5;
        const perp = [Math.abs(d[1]), Math.abs(d[0])];
        out.push({ c1: { x: cx - perp[0] * 0.5, y: cy - perp[1] * 0.5 }, c2: { x: cx + perp[0] * 0.5, y: cy + perp[1] * 0.5 }, n, f, dbl: 1 });
        P = { x: P.x + d[0], y: P.y + d[1] };
      } else {
        const c1 = { x: P.x + d[0] * 0.5, y: P.y + d[1] * 0.5 };
        out.push({ c1, c2: { x: c1.x + d[0], y: c1.y + d[1] }, n, f });
        P = { x: P.x + d[0] * 2, y: P.y + d[1] * 2 };
      }
    } else {
      // segunda esquina: vuelve en sentido contrario a la fila anterior
      const nd = [-rowDir[0], -rowDir[1]];
      const c1 = { x: P.x + d[0] * 0.5, y: P.y + d[1] * 0.5 };
      const c2 = { x: c1.x + nd[0], y: c1.y + nd[1] };
      out.push({ c1, c2, n, f });
      P = { x: c2.x + nd[0] * 0.5, y: c2.y + nd[1] * 0.5 };
      d = nd;
      mode = 'row';
    }
  }
  return { out, next: { x: P.x + d[0] * 0.55, y: P.y + d[1] * 0.55 } };
}

function layout(line, c) {
  if (!line.length) return { tiles: [], ends: null };
  const t0 = line[c];
  const dbl0 = t0.a === t0.b;
  const tiles = [dbl0
    ? { c1: { x: 0, y: -0.5 }, c2: { x: 0, y: 0.5 }, n: t0.a, f: t0.b, dbl: 1, first: 1 }
    : { c1: { x: -0.5, y: 0 }, c2: { x: 0.5, y: 0 }, n: t0.a, f: t0.b, first: 1 }];
  const half = dbl0 ? 0.5 : 1;
  const right = walk(line.slice(c + 1).map((x) => ({ n: x.a, f: x.b })), { x: half, y: 0 }, [1, 0], [0, 1]);
  const left = walk(line.slice(0, c).reverse().map((x) => ({ n: x.b, f: x.a })), { x: -half, y: 0 }, [-1, 0], [0, -1]);
  return { tiles: [...left.out.reverse(), ...tiles, ...right.out], ends: { L: left.next, R: right.next } };
}

const RULES = `
  <h3>Cómo se juega</h3>
  <ul>
    <li>Fichas doble seis. Cada uno recibe <b>7</b>. Con <b>4 jugadores</b> se juega <b>por parejas</b> (tu compañero es el de enfrente) y no hay pozo; con 2 o 3 cada uno por su cuenta y lo que sobra es el <b>pozo</b>.</li>
    <li>La primera mano la abre quien tenga el <b>doble seis</b> (o el doble más alto). Las demás, quien ganó la mano anterior.</li>
    <li>Juega una ficha que coincida con una de las <b>dos puntas</b>. Si no tienes, robas del pozo hasta poder; si no hay pozo, <b>pasas</b> (se hace solo).</li>
    <li>La mano termina con <b>¡dominó!</b> (alguien pone su última ficha) o en <b>tranque</b> (nadie puede jugar): ahí gana quien tenga menos puntos en la mano.</li>
    <li>El ganador suma los puntos de las fichas de sus rivales. Gana la partida quien llegue a <b>100</b>.</li>
  </ul>`;

export function mountDomino(el, ctx) {
  el.innerHTML = `
    <section class="screen domino">
      <header class="oc-top">
        <button class="btn ghost sm" id="dm-leave">${icon('back')} Salir</button>
        <b class="oc-title">Dominó</b>
        <span class="oc-tools">
          <button class="btn ghost sm oc-end-btn" id="dm-stop" hidden>Terminar</button>
          <button class="mute" id="dm-help" aria-label="Reglas">?</button>
          <button class="mute" id="dm-mute">${icon(isMuted() ? 'soundOff' : 'soundOn')}</button>
        </span>
      </header>
      <div class="dm-score"></div>
      <div class="oc-opps dm-opps"></div>
      <div class="dm-table">
        <svg class="dm-line" preserveAspectRatio="xMidYMid meet"></svg>
        <span class="dm-pozo" hidden></span>
      </div>
      <div class="oc-log dm-log"></div>
      <div class="oc-msg dm-msg"></div>
      <div class="oc-mebar dm-mebar"></div>
      <div class="dm-hand"></div>
      <div class="dm-choose" hidden></div>
      <div class="oc-pick dm-help" hidden><div class="oc-pick-box pq-rules">${RULES}<button class="btn primary" id="dm-help-x">¡Entendido!</button></div></div>
      <div class="oc-end dm-handend" hidden></div>
      <div class="oc-end dm-end" hidden></div>
    </section>`;
  const $ = (s) => el.querySelector(s);
  const lineSvg = $('.dm-line'), handEl = $('.dm-hand'), chooseEl = $('.dm-choose'), scoreEl = $('.dm-score');
  const oppsEl = $('.dm-opps'), logEl = $('.dm-log'), msgEl = $('.dm-msg'), meBar = $('.dm-mebar'), pozoEl = $('.dm-pozo');
  const handEndEl = $('.dm-handend'), endEl = $('.dm-end'), helpEl = $('.dm-help');

  let st = null, lg = null;
  let sel = null;               // ficha elegida que va en las dos puntas
  let pending = 0, pendingAt = 0;
  let seenTn = 0, tnAt = Date.now();
  let lastEvKey = '';
  let dead = false;

  $('#dm-leave').onclick = () => ctx.leave();
  $('#dm-mute').onclick = () => { setMuted(!isMuted()); $('#dm-mute').innerHTML = icon(isMuted() ? 'soundOff' : 'soundOn'); };
  $('#dm-stop').onclick = () => { if (confirm('¿Terminar la partida y volver a la sala?')) ctx.lobby(); };
  $('#dm-help').onclick = () => { helpEl.hidden = false; };
  helpEl.onclick = (e) => { if (e.target === helpEl || e.target.closest('#dm-help-x')) helpEl.hidden = true; };

  const me = () => ctx.me;
  const player = (id) => (st.pl || []).find((p) => p.id === id) || { id, n: '¿?', a: 'frog' };
  const myTurn = () => lg && !lg.win && lg.phase === 'play' && current(lg) === me() && !!lg.hands[me()];
  const busy = () => pending && pending === lg.tn && Date.now() - pendingAt < 3000;
  const sideName = (s) => (lg.teams ? membersOf(lg, s).map((id) => (id === me() ? 'Tú' : esc(player(id).n))).join(' y ') : s === me() ? 'Tú' : esc(player(s).n));
  const sideColor = (s) => ctx.colorOf(lg.teams ? membersOf(lg, s)[0] : s);
  const send = (a) => {
    if (!lg || (a.t !== 'next' && (!myTurn() || busy()))) return;
    if (a.t !== 'next') { pending = lg.tn; pendingAt = Date.now(); }
    ctx.act({ ...a, tn: lg.tn });
  };

  // ---- jugar
  function playTile(t, side) {
    sel = null;
    chooseEl.hidden = true;
    send({ t: 'play', tile: t, side });
    paint();
  }
  handEl.addEventListener('click', (e) => {
    const b = e.target.closest('.dm-t[data-t]');
    if (!b || !myTurn() || busy()) return;
    const t = b.dataset.t;
    const ok = sidesFor(lg, t);
    if (!ok.length) { b.classList.remove('nope'); void b.getBoundingClientRect(); b.classList.add('nope'); buzz(60); return; }
    if (ok.length === 1) { playTile(t, ok[0]); return; }
    sel = sel === t ? null : t;
    sfx.tick();
    paint();
  });
  chooseEl.addEventListener('click', (e) => { const b = e.target.closest('[data-side]'); if (b && sel) playTile(sel, b.dataset.side); });
  lineSvg.addEventListener('click', (e) => { const m = e.target.closest('[data-side]'); if (m && sel) playTile(sel, m.dataset.side); });

  // ---- dibujo
  function paintLine() {
    const L = layout(lg.line, lg.c);
    const xs = [], ys = [];
    let h = '';
    for (const t of L.tiles) {
      const x0 = Math.min(t.c1.x, t.c2.x) - 0.5, y0 = Math.min(t.c1.y, t.c2.y) - 0.5;
      const w = Math.abs(t.c1.x - t.c2.x) + 1, ht = Math.abs(t.c1.y - t.c2.y) + 1;
      xs.push(x0, x0 + w); ys.push(y0, y0 + ht);
      const lying = w > ht;   // acostada
      const isLast = lg.last && lg.line.length && ((lg.last.side === 'R' && t === L.tiles[L.tiles.length - 1]) || (lg.last.side === 'L' && t === L.tiles[0]));
      const mid = lying ? `M${x0 + 1} ${y0 + 0.12}V${y0 + 0.88}` : `M${x0 + 0.12} ${y0 + 1}H${x0 + 0.88}`;
      h += `<g class="dm-lt ${isLast ? 'last' : ''}"><rect x="${x0 + 0.03}" y="${y0 + 0.03}" width="${w - 0.06}" height="${ht - 0.06}" rx="0.13" class="dm-face"/><path d="${mid}" class="dm-mid"/><g class="dm-pips">${pipsAt(t.n, t.c1.x, t.c1.y, lying)}${pipsAt(t.f, t.c2.x, t.c2.y, lying)}</g></g>`;
    }
    // marcas de las puntas cuando la ficha elegida va en las dos
    if (sel && L.ends) {
      for (const side of sidesFor(lg, sel)) {
        const p = L.ends[side];
        xs.push(p.x - 0.7, p.x + 0.7); ys.push(p.y - 0.7, p.y + 0.7);
        h += `<g class="dm-end-mark" data-side="${side}"><circle cx="${p.x}" cy="${p.y}" r="0.62"/><text x="${p.x}" y="${p.y + 0.22}">${lg.ends[side === 'L' ? 0 : 1]}</text></g>`;
      }
    }
    if (!xs.length) { xs.push(-3, 3); ys.push(-1.5, 1.5); }
    let x0 = Math.min(...xs) - 0.4, x1 = Math.max(...xs) + 0.4, y0 = Math.min(...ys) - 0.4, y1 = Math.max(...ys) + 0.4;
    // tamaño mínimo para que las primeras fichas no salgan gigantes
    const minW = 14, minH = 7;
    if (x1 - x0 < minW) { const c = (x0 + x1) / 2; x0 = c - minW / 2; x1 = c + minW / 2; }
    if (y1 - y0 < minH) { const c = (y0 + y1) / 2; y0 = c - minH / 2; y1 = c + minH / 2; }
    lineSvg.setAttribute('viewBox', `${x0} ${y0} ${x1 - x0} ${y1 - y0}`);
    lineSvg.innerHTML = h || '';
    pozoEl.hidden = lg.teams;
    pozoEl.textContent = `Pozo: ${lg.pozo.length}`;
  }

  function paintScore() {
    scoreEl.innerHTML = sides(lg).map((s) => `<span class="dm-sc" style="--c:${sideColor(s)}"><b>${lg.score[s]}</b><small>${sideName(s)}</small></span>`).join('<i>·</i>') + `<em>a ${lg.target}</em>`;
  }

  function paintOpps() {
    const order = lg.order;
    const mi = order.indexOf(me());
    const ids = mi >= 0 ? [...order.slice(mi + 1), ...order.slice(0, mi)] : order.slice();
    const cur = current(lg);
    const passed = lg.ev && lg.ev.t === 'pass' ? lg.ev.p : null;
    oppsEl.innerHTML = ids.map((id) => {
      const p = player(id);
      const n = (lg.hands[id] || []).length;
      const mate = lg.teams && mi >= 0 && sideOf(lg, id) === sideOf(lg, me());
      return `<div class="oc-opp ${id === cur && lg.phase === 'play' ? 'turn' : ''} ${p.off ? 'off' : ''}" style="--c:${ctx.colorOf(id)}">
          <span class="oc-av">${avatarSVG(validAvatar(p.a))}</span>
          <span class="oc-name">${esc(p.n)}${p.b ? ' <i>bot</i>' : ''}</span>
          <span class="dm-backs">${'<i></i>'.repeat(Math.min(n, 7))}</span>
          <span class="oc-n">${n} ficha${n === 1 ? '' : 's'}${mate ? ' · <b class="dm-mate">pareja</b>' : ''}</span>
          ${passed === id ? '<span class="dm-pass">¡Paso!</span>' : ''}
          <span class="oc-timer"><i></i></span>
        </div>`;
    }).join('');
  }

  function paintHand() {
    const hand = lg.hands[me()];
    if (!hand) { handEl.innerHTML = '<p class="hint">Estás mirando la partida</p>'; chooseEl.hidden = true; return; }
    const mine = myTurn() && !busy();
    if (sel && (!mine || !hand.includes(sel))) sel = null;
    handEl.innerHTML = hand.map((t) => tileSVG(t, mine ? (sidesFor(lg, t).length ? 'ok' : 'dim') : '')).join('');
    if (sel) handEl.querySelector(`[data-t="${sel}"]`)?.classList.add('sel');
    if (sel) {
      const [l, r] = lg.ends;
      chooseEl.hidden = false;
      chooseEl.innerHTML = `<span>¿Dónde la pones?</span><button class="btn sm primary" data-side="L">Junto al ${l}</button><button class="btn sm primary" data-side="R">Junto al ${r}</button>`;
    } else chooseEl.hidden = true;
  }

  function evText(ev) {
    if (!ev) return '';
    const mine = ev.p === me();
    const who = mine ? 'Tú' : esc(player(ev.p).n);
    if (ev.t === 'play') return `${who} ${mine ? 'jugaste' : 'jugó'} el ${ev.tile[0]}-${ev.tile[1]}`;
    if (ev.t === 'draw') return `${who} ${mine ? 'robaste' : 'robó'} ${ev.k} ficha${ev.k === 1 ? '' : 's'} del pozo`;
    if (ev.t === 'pass') return `${who} ${mine ? 'pasaste' : 'pasó'}`;
    if (ev.t === 'deal') return `Mano ${lg.hn}: ${mine ? 'abres tú' : `abre ${who}`}`;
    return '';
  }

  function paintMsg() {
    if (lg.phase !== 'play') { msgEl.innerHTML = ''; meBar.innerHTML = ''; return; }
    const cur = current(lg);
    if (myTurn()) {
      msgEl.className = 'oc-msg dm-msg mine';
      const can = playable(lg, me()).length;
      msgEl.innerHTML = !lg.line.length && lg.must ? `Abres tú: juega el <b>${lg.must[0]}-${lg.must[1]}</b>`
        : !lg.line.length ? 'Abres tú: juega la ficha que quieras'
          : can ? `Tu turno: juega una ficha con <b>${lg.ends[0]}</b> o <b>${lg.ends[1]}</b>`
            : lg.pozo.length ? 'No tienes jugada: robando del pozo…' : 'No tienes jugada: pasas…';
    } else {
      msgEl.className = 'oc-msg dm-msg';
      msgEl.innerHTML = `Turno de <b style="color:${ctx.colorOf(cur)}">${esc(player(cur).n)}</b>`;
    }
    const hand = lg.hands[me()];
    meBar.innerHTML = hand
      ? `<span class="oc-mechip ${myTurn() ? 'turn' : ''}" style="--c:${ctx.colorOf(me())}"><span class="oc-av">${avatarSVG(validAvatar(player(me()).a))}</span><b>Tú</b> · ${hand.length} ficha${hand.length === 1 ? '' : 's'} · ${hand.reduce((s, t) => s + pips(t), 0)} puntos</span><span class="oc-timer mine"><i></i></span>`
      : '';
  }

  function paintHandEnd() {
    const h = lg.hand;
    if (lg.phase !== 'hand' || !h) { handEndEl.hidden = true; return; }
    handEndEl.hidden = false;
    const title = h.why === 'domino' ? '¡Dominó!' : '¡Tranque!';
    const who = h.winner ? (lg.teams ? sideName(h.side) : h.winner === me() ? 'Tú' : esc(player(h.winner).n)) : null;
    handEndEl.innerHTML = `
      <div class="oc-end-box dm-hb">
        <h2>${title}</h2>
        <p class="cz-why">${who ? `${who} ${who === 'Tú' ? 'ganas' : lg.teams ? 'ganan' : 'gana'} la mano y ${who === 'Tú' ? 'sumas' : lg.teams ? 'suman' : 'suma'} <b>${h.pts}</b> puntos` : 'Empate: nadie suma puntos'}</p>
        <div class="dm-reveal">${lg.order.map((id) => `<div class="dm-rv" style="--c:${ctx.colorOf(id)}"><span>${id === me() ? 'Tú' : esc(player(id).n)}<small>${h.left[id]} pts</small></span><span class="dm-rv-t">${(h.reveal[id] || []).map((t) => tileSVG(t, 'mini')).join('') || '<em>sin fichas</em>'}</span></div>`).join('')}</div>
        <div class="dm-score dm-score-end">${scoreEl.innerHTML}</div>
        <button class="btn primary" id="dm-next">Siguiente mano <span class="dm-cd"></span></button>
      </div>`;
    $('#dm-next').onclick = () => send({ t: 'next' });
  }

  function paintEnd() {
    if (!lg.win) { endEl.hidden = true; return; }
    endEl.hidden = false;
    const s = lg.winSide;
    const mineWon = sideOf(lg, me()) === s && lg.order.includes(me());
    endEl.innerHTML = `
      <div class="oc-end-box">
        <div class="oc-end-av" style="--c:${sideColor(s)}">${avatarSVG(validAvatar(player(lg.win).a))}</div>
        <h2>${icon('trophy')} ${mineWon ? '¡Ganaste!' : `¡${lg.teams ? 'Ganaron' : 'Ganó'} ${sideName(s)}!`}</h2>
        <p class="cz-why">Llegó${lg.teams ? 'aron' : ''} a ${lg.score[s]} puntos en ${lg.hn} mano${lg.hn === 1 ? '' : 's'}</p>
        <ol class="oc-rank">${sides(lg).slice().sort((a, b) => lg.score[b] - lg.score[a]).map((x, i) => `<li style="--c:${sideColor(x)}"><b>${i + 1}</b><span>${sideName(x)}</span><small>${lg.score[x]} pts</small><em>${icon('trophy')} ${lg.wins[membersOf(lg, x)[0]] || 0}</em></li>`).join('')}</ol>
        ${ctx.isHost()
          ? `<button class="btn big primary" id="dm-again">${icon('repeat')} Otra partida</button><button class="btn ghost" id="dm-lobby">Volver a la sala</button>`
          : '<p class="hint">Esperando al anfitrión para otra partida…</p>'}
      </div>`;
    if (ctx.isHost()) { $('#dm-again').onclick = () => ctx.again(); $('#dm-lobby').onclick = () => ctx.lobby(); }
  }

  function sounds() {
    const key = JSON.stringify([lg.ev, lg.phase, lg.hn]);
    if (key === lastEvKey) return;
    const first = lastEvKey === '';
    lastEvKey = key;
    if (first) return;
    const ev = lg.ev;
    if (lg.phase === 'hand' || lg.phase === 'end') {
      const h = lg.hand;
      if (lg.win) { if (sideOf(lg, me()) === lg.winSide) sfx.win(); else sfx.out(0.6); }
      else if (h && h.winner && sideOf(lg, h.winner) === sideOf(lg, me())) sfx.big();
      else sfx.bell();
      return;
    }
    if (!ev) return;
    if (ev.t === 'play') { sfx.thunk(0.9); if (ev.tile[0] === ev.tile[1]) setTimeout(() => sfx.click(), 90); }
    else if (ev.t === 'draw') sfx.land(1.4);
    else if (ev.t === 'pass') sfx.tick(1.4);
    else if (ev.t === 'deal') sfx.whoosh();
  }

  function paint() {
    paintScore();
    paintOpps();
    paintLine();
    paintHand();
    paintMsg();
    logEl.innerHTML = evText(lg.ev);
    paintHandEnd();
    paintEnd();
    $('#dm-stop').hidden = !ctx.isHost() || !!lg.win;
  }

  const iv = setInterval(() => {
    if (dead || !lg || lg.win) return;
    if (lg.phase === 'hand') {
      const cd = $('.dm-cd');
      if (cd) cd.textContent = `(${Math.max(0, Math.ceil((8000 - (Date.now() - tnAt)) / 1000))})`;
      return;
    }
    const p = player(current(lg));
    const total = p.off ? OFF_TURN_MS : TURN_MS;
    const f = Math.max(0, total - (Date.now() - tnAt)) / total;
    el.querySelectorAll('.dm-opps .oc-opp.turn .oc-timer i, .dm-mebar .oc-mechip.turn + .oc-timer i').forEach((i) => { i.style.transform = `scaleX(${f})`; i.classList.toggle('low', f < 0.2); });
    if (pending && Date.now() - pendingAt > 3000) { pending = 0; paint(); }
  }, 200);

  return {
    update(nst) {
      const prevTurn = lg ? current(lg) : null;
      const prevPhase = lg ? lg.phase : null;
      st = nst;
      lg = nst.lg;
      if (!lg) return;
      if (lg.tn !== seenTn) { seenTn = lg.tn; tnAt = Date.now(); }
      if (pending && lg.tn !== pending) pending = 0;
      sounds();
      if (myTurn() && (prevTurn !== me() || prevPhase !== 'play')) { sfx.ready(); buzz(40); }
      paint();
    },
    destroy() { dead = true; clearInterval(iv); },
  };
}
