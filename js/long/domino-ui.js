// 🁫 Dominó — pantalla. La línea de fichas se dibuja en SVG como una serpiente:
// desde la primera ficha, el brazo derecho va a la derecha y baja, el izquierdo
// va a la izquierda y sube; los dobles van atravesados. Se ajusta sola al espacio.
//
// Como en el Ocho loco: solo se repinta lo que cambió, las fichas se reparten y
// vuelan de la mano a la mesa, hay flechas de turno con "Sigue", historial con
// las últimas jugadas y avisos (pasó, robó del pozo, ¡dominó!, ¡tranque!).
import { TURN_MS, OFF_TURN_MS, current, sidesFor, playable, pips, sideOf, sides, membersOf } from './domino.js';
import { avatarSVG, validAvatar, icon } from '../icons.js';
import { endPanel, endPanelHide } from './endpanel.js';
import { esc, buzz } from '../util.js';
import { sfx, isMuted, setMuted } from '../audio.js';
import { makeFx, oppRowHTML, rectOf } from './fx.js';

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
    <li>Las <b>flechas</b> entre los jugadores muestran hacia dónde va el turno; <b>Sigue</b> marca a quien juega después.</li>
    <li>Tienes <b>30 s</b> por turno; si se acaban, la máquina juega por ti.</li>
  </ul>`;


export function mountDomino(el, ctx) {
  el.innerHTML = `
    <section class="screen domino">
      <header class="oc-top">
        <button class="btn ghost sm" id="dm-leave">${icon('back')} Salir</button>
        <b class="oc-title">Dominó</b>
        <span class="oc-tools">
          <button class="btn ghost sm oc-end-btn" id="dm-stop" hidden>Terminar</button>
          <button class="mute oc-help-btn" id="dm-help" aria-label="Reglas">?</button>
          <button class="mute" id="dm-mute">${icon(isMuted() ? 'soundOff' : 'soundOn')}</button>
        </span>
      </header>
      <div class="dm-score"></div>
      <div class="oc-opps dm-opps"></div>
      <div class="dm-table">
        <svg class="dm-line" preserveAspectRatio="xMidYMid meet"></svg>
        <span class="dm-pozo" hidden></span>
        <div class="oc-toasts"></div>
      </div>
      <div class="oc-hist dm-hist"></div>
      <div class="oc-msg dm-msg"></div>
      <div class="oc-mebar dm-mebar"></div>
      <div class="dm-hand"></div>
      <div class="dm-choose" hidden></div>
      <div class="oc-fly"></div>
      <div class="oc-pick dm-help" hidden><div class="oc-pick-box oc-rules">${RULES}<button class="btn primary" id="dm-help-x">¡Entendido!</button></div></div>
      <div class="oc-end dm-handend" hidden></div>
      <div class="oc-end dm-end" hidden></div>
    </section>`;
  const $ = (s) => el.querySelector(s);
  const lineSvg = $('.dm-line'), handEl = $('.dm-hand'), chooseEl = $('.dm-choose'), scoreEl = $('.dm-score'), tableEl = $('.dm-table');
  const oppsEl = $('.dm-opps'), histEl = $('.dm-hist'), msgEl = $('.dm-msg'), meBar = $('.dm-mebar'), pozoEl = $('.dm-pozo'), toastsEl = $('.oc-toasts');
  const handEndEl = $('.dm-handend'), endEl = $('.dm-end'), helpEl = $('.dm-help'), stopBtn = $('#dm-stop');

  let st = null, lg = null;
  let sel = null;               // ficha elegida que va en las dos puntas
  let pending = 0, pendingAt = 0;
  let seenTn = 0, tnAt = Date.now();
  let lastSig = '', lastEvKey = '', lastTurn = null, oppTurn = null;
  let sScore = '', sOpps = '', sLine = '', sHand = '', sMe = '', sHist = '', handKey = '', endKey = '', msgCur = '';
  let prevHand = [];            // mi mano antes de esta actualización (para saber qué fichas llegaron)
  let dealing = null;           // reparto en curso: { shown, mine, opp: {id: n} }
  let handShowAt = 0;           // el resultado de la mano sale después de ver la última jugada
  let lastPhase = null;         // fase en la actualización anterior (copia: en el anfitrión lg es el mismo objeto)
  let dead = false;
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (!dead) fn(); }, ms); timers.add(t); };
  const FX = makeFx($('.oc-fly'), later);

  $('#dm-leave').onclick = () => ctx.leave();
  $('#dm-mute').onclick = () => { setMuted(!isMuted()); $('#dm-mute').innerHTML = icon(isMuted() ? 'soundOff' : 'soundOn'); };
  stopBtn.onclick = () => { if (confirm('¿Terminar la partida y volver a la sala?')) ctx.lobby(); };
  $('#dm-help').onclick = () => { helpEl.hidden = false; };
  helpEl.onclick = (e) => { if (e.target === helpEl || e.target.closest('#dm-help-x')) helpEl.hidden = true; };

  const me = () => ctx.me;
  const player = (id) => ((st && st.pl) || []).find((p) => p.id === id) || { id, n: '¿?', a: 'frog' };
  const name = (id) => (id === me() ? 'Tú' : esc(player(id).n));
  const myTurn = () => lg && !lg.win && lg.phase === 'play' && current(lg) === me() && !!lg.hands[me()];
  const canAct = () => myTurn() && !dealing;
  const busy = () => pending && pending === lg.tn && Date.now() - pendingAt < 3000;
  const sideName = (s) => (lg.teams ? membersOf(lg, s).map((id) => (id === me() ? 'Tú' : esc(player(id).n))).join(' y ') : s === me() ? 'Tú' : esc(player(s).n));
  const sideColor = (s) => ctx.colorOf(lg.teams ? membersOf(lg, s)[0] : s);
  const nextOf = () => lg.order[(lg.turn + 1) % lg.order.length];
  const send = (a) => {
    if (!lg || (a.t !== 'next' && (!canAct() || busy()))) return;
    if (a.t !== 'next') { pending = lg.tn; pendingAt = Date.now(); }
    ctx.act({ ...a, tn: lg.tn });
  };

  // ---- jugar
  function playTile(t, side) {
    sel = null;
    chooseEl.hidden = true;
    sfx.click(0.6);
    send({ t: 'play', tile: t, side });
    paintTurn();
  }
  handEl.addEventListener('click', (e) => {
    const b = e.target.closest('.dm-t[data-t]');
    if (!b || !canAct() || busy()) return;
    const t = b.dataset.t;
    const ok = sidesFor(lg, t);
    if (!ok.length) { b.classList.remove('nope'); void b.getBoundingClientRect(); b.classList.add('nope'); buzz(60); return; }
    if (ok.length === 1) { playTile(t, ok[0]); return; }
    sel = sel === t ? null : t;
    sfx.tick();
    paintTurn();
  });
  chooseEl.addEventListener('click', (e) => { const b = e.target.closest('[data-side]'); if (b && sel) playTile(sel, b.dataset.side); });
  lineSvg.addEventListener('click', (e) => { const m = e.target.closest('[data-side]'); if (m && sel) playTile(sel, m.dataset.side); });

  // ---------------------------------------------------------------- dibujo
  function paintLine() {
    const sig = JSON.stringify([lg.line, lg.c, lg.last, sel && sidesFor(lg, sel), lg.teams, lg.pozo.length]);
    if (sig === sLine) return;
    sLine = sig;
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
      h += `<g class="dm-lt ${isLast ? 'last' : ''}" data-lying="${lying ? 1 : 0}"><rect x="${x0 + 0.03}" y="${y0 + 0.03}" width="${w - 0.06}" height="${ht - 0.06}" rx="0.13" class="dm-face"/><path d="${mid}" class="dm-mid"/><g class="dm-pips">${pipsAt(t.n, t.c1.x, t.c1.y, lying)}${pipsAt(t.f, t.c2.x, t.c2.y, lying)}</g></g>`;
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
    const sig = JSON.stringify([lg.score, lg.order.map((id) => [player(id).n, ctx.colorOf(id)])]);
    if (sig === sScore) return;
    sScore = sig;
    scoreEl.innerHTML = sides(lg).map((s) => `<span class="dm-sc" style="--c:${sideColor(s)}"><b>${lg.score[s]}</b><small>${sideName(s)}</small></span>`).join('<i>·</i>') + `<em>a ${lg.target}</em>`;
  }

  // reloj del turno
  function turnLeft() {
    if (!lg || lg.win || lg.phase !== 'play') return 1;
    const p = player(current(lg));
    const total = p.off ? OFF_TURN_MS : TURN_MS;
    return Math.max(0, total - (Date.now() - tnAt)) / total;
  }
  const timerHTML = (cls = '') => { const f = turnLeft(); return `<span class="oc-timer ${cls}"><i style="transform:scaleX(${f.toFixed(3)})" class="${f < 0.2 ? 'low' : ''}"></i></span>`; };
  const countOf = (id) => (dealing ? dealing.opp[id] || 0 : (lg.hands[id] || []).length);

  // rivales en orden de turno, con flechas del sentido y "Sigue"
  function paintOpps() {
    const playing = lg.phase === 'play' && !lg.win;
    const cur = playing ? current(lg) : '';
    const nxt = playing && !dealing ? nextOf() : '';
    const mi = lg.order.indexOf(me());
    const sig = JSON.stringify([cur, nxt, lg.order.map((id) => { const p = player(id); return [id, p.n, p.a, p.b, p.off, countOf(id), ctx.colorOf(id)]; })]);
    if (sig === sOpps) return;
    sOpps = sig;
    const go = cur !== oppTurn;
    oppTurn = cur;
    oppsEl.innerHTML = oppRowHTML({
      order: lg.order, me: me(), cur, next: nxt, fwd: true, go, colorOf: ctx.colorOf, timer: timerHTML(),
      opp: (id) => {
        const p = player(id);
        const mate = lg.teams && mi >= 0 && sideOf(lg, id) === sideOf(lg, me());
        return { name: p.n, a: p.a, b: p.b, off: p.off, n: countOf(id), what: 'ficha', backsCls: 'dm-backs', maxBacks: 7, extra: mate ? ' · <b class="dm-mate">pareja</b>' : '' };
      },
    });
  }

  function paintHand() {
    const hand = lg.hands[me()];
    if (!hand) {
      if (sHand !== 'x') { sHand = 'x'; handEl.innerHTML = '<p class="hint">Estás mirando la partida</p>'; chooseEl.hidden = true; }
      return;
    }
    const mine = canAct() && !busy();
    if (sel && (!mine || !hand.includes(sel))) sel = null;
    const sig = JSON.stringify([hand, mine && hand.map((t) => sidesFor(lg, t).length), sel, !!dealing, lg.ends]);
    if (sig === sHand) return;
    sHand = sig;
    handEl.innerHTML = hand.map((t) => tileSVG(t, mine ? (sidesFor(lg, t).length ? 'ok' : 'dim') : '')).join('');
    if (sel) handEl.querySelector(`[data-t="${sel}"]`)?.classList.add('sel');
    if (dealing) revealHand();
    if (sel) {
      const [l, r] = lg.ends;
      chooseEl.hidden = false;
      chooseEl.innerHTML = `<span>¿Dónde la pones?</span><button class="btn sm primary" data-side="L">Junto al ${l}</button><button class="btn sm primary" data-side="R">Junto al ${r}</button>`;
    } else chooseEl.hidden = true;
  }
  function revealHand() {
    handEl.querySelectorAll('.dm-t').forEach((c, i) => c.classList.toggle('wait', !!dealing && i >= dealing.shown));
  }

  function evText(ev) {
    if (!ev) return '';
    const mine = ev.p === me();
    const who = name(ev.p);
    if (ev.t === 'play') return `${who} ${mine ? 'jugaste' : 'jugó'} el <b>${ev.tile[0]}-${ev.tile[1]}</b>${ev.tile[0] === ev.tile[1] ? ' (doble)' : ''}`;
    if (ev.t === 'draw') return `${who} ${mine ? 'robaste' : 'robó'} <b>${ev.k}</b> ficha${ev.k === 1 ? '' : 's'} del pozo`;
    if (ev.t === 'pass') return `${who} ${mine ? 'pasaste' : 'pasó'}: no ${mine ? 'tenías' : 'tenía'} ficha`;
    if (ev.t === 'deal') return `Mano ${ev.n}: ${mine ? 'abres tú' : `abre ${who}`}`;
    return '';
  }

  function paintHist() {
    const list = (lg.hist && lg.hist.length ? lg.hist : lg.ev ? [lg.ev] : []).slice(-3);
    const sig = JSON.stringify(list);
    if (sig === sHist) return;
    sHist = sig;
    histEl.innerHTML = list.map((ev) => `<p><i style="--c:${ctx.colorOf(ev.p)}"></i><span>${evText(ev)}</span></p>`).join('');
  }

  function setMsg(html, mine) {
    const k = (mine ? '1' : '0') + html;
    if (k === msgCur) return;
    msgCur = k;
    msgEl.className = `oc-msg dm-msg${mine ? ' mine' : ''}`;
    msgEl.innerHTML = html;
  }

  function paintMsg() {
    if (lg.phase !== 'play') setMsg('', false);
    else if (dealing) setMsg('Repartiendo las fichas…', false);
    else if (myTurn()) {
      const can = playable(lg, me()).length;
      setMsg(!lg.line.length && lg.must ? `Abres tú: juega el <b>${lg.must[0]}-${lg.must[1]}</b>`
        : !lg.line.length ? 'Abres tú: juega la ficha que quieras'
          : can ? `Tu turno: juega una ficha con <b>${lg.ends[0]}</b> o <b>${lg.ends[1]}</b>`
            : lg.pozo.length ? 'No tienes jugada: robando del pozo…' : 'No tienes jugada: pasas…', true);
    } else {
      const cur = current(lg);
      setMsg(`Turno de <b style="color:${ctx.colorOf(cur)}">${esc(player(cur).n)}</b>`, false);
    }
    const hand = lg.hands[me()];
    const playing = lg.phase === 'play' && !lg.win;
    const nextMe = playing && !dealing && nextOf() === me() && !myTurn();
    const sig = JSON.stringify([playing, hand ? hand.length : -1, hand ? hand.reduce((s, t) => s + pips(t), 0) : 0, myTurn(), nextMe, player(me()).a, ctx.colorOf(me()), !!dealing]);
    if (sig === sMe) return;
    sMe = sig;
    meBar.innerHTML = hand && playing
      ? `<span class="oc-mechip ${myTurn() ? 'turn' : ''}" style="--c:${ctx.colorOf(me())}">${nextMe ? '<span class="oc-nexttag">Sigues tú</span>' : ''}<span class="oc-av">${avatarSVG(validAvatar(player(me()).a))}</span><b>Tú</b> · ${dealing ? '…' : `${hand.length} ficha${hand.length === 1 ? '' : 's'} · ${hand.reduce((s, t) => s + pips(t), 0)} puntos`}</span>${timerHTML('mine')}`
      : '';
  }

  // resultado de la mano (sale un momento después de la última jugada)
  function paintHandEnd() {
    const h = lg.hand;
    if (lg.phase !== 'hand' || !h) { handKey = ''; handEndEl.hidden = true; return; }
    const wait = handShowAt - Date.now();
    if (wait > 0) { handEndEl.hidden = true; later(paintHandEnd, wait + 20); return; }
    if (handKey === `${h.n}`) { handEndEl.hidden = false; return; }
    handKey = `${h.n}`;
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
    if (!lg.win) { endKey = ''; endPanelHide(endEl); return; }
    const key = `${lg.tn}:${lg.win}`;
    if (key !== endKey) {
      endKey = key;
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
    endPanel(endEl, key, 2600);
  }

  // ---------------------------------------------------------------- animaciones
  const oppBox = (id) => oppsEl.querySelector(`.oc-opp[data-id="${CSS.escape(id)}"]`);
  const oppSpot = (id) => { const o = oppBox(id); return o ? rectOf(o.querySelector('.oc-backs') || o) : rectOf(oppsEl); };
  const tableSpot = () => rectOf(tableEl);
  const pozoSpot = () => (lg.teams ? tableSpot() : rectOf(pozoEl));
  const toast = (html, color, cls = '') => FX.toast(toastsEl, html, color, cls);
  const backTile = () => '<svg class="dm-t back" viewBox="-0.06 -0.06 1.12 2.12" style="width:40px;height:80px"><rect x="0" y="0" width="1" height="2" rx="0.14"/></svg>';

  // reparto al empezar cada mano: las fichas vuelan del centro a cada jugador
  function startDeal() {
    const n = lg.order.length;
    const start = lg.order.indexOf(lg.order[lg.turn]);
    const seq = [];
    for (let k = 0; k < 7; k++) for (let j = 0; j < n; j++) { const id = lg.order[(start + j) % n]; if ((lg.hands[id] || []).length > k) seq.push(id); }
    dealing = { shown: 0, mine: 0, opp: Object.fromEntries(lg.order.map((id) => [id, 0])) };
    sHand = ''; sOpps = ''; sMe = '';
    paintTurn();
    const step = Math.min(80, 1300 / Math.max(1, seq.length));
    seq.forEach((id, k) => later(() => dealOne(id), 250 + k * step));
    later(endDeal, 250 + seq.length * step + 450);
  }
  function dealOne(id) {
    if (!dealing) return;
    sfx.tick(0.3);
    const from = tableSpot();
    if (id === me()) {
      const idx = dealing.mine++;
      const target = handEl.querySelectorAll('.dm-t')[idx];
      FX.fly(from, rectOf(target) || rectOf(handEl), { html: backTile(), w: 40, h: 80, dur: 360, done: () => { if (!dealing) return; dealing.shown++; revealHand(); } });
    } else {
      FX.fly(from, oppSpot(id), { html: backTile(), w: 40, h: 80, s1: 0.3, dur: 360, done: () => { if (!dealing) return; dealing.opp[id]++; paintOpps(); } });
    }
  }
  function endDeal() {
    if (!dealing) return;
    dealing = null;
    sHand = ''; sOpps = ''; sMe = '';
    paintTurn();
    if (lg.phase !== 'play') return;
    const cur = current(lg);
    const opener = !lg.line.length && lg.must ? ` con el <b>${lg.must[0]}-${lg.must[1]}</b>` : '';
    toast(cur === me() ? `¡Abres tú${opener}!` : `Abre <b>${name(cur)}</b>${opener}`, ctx.colorOf(cur));
  }

  // jugada nueva: la ficha vuela a la mesa, avisos y sonidos
  function onEvent(ev, src) {
    const mine = ev.p === me();
    const col = ctx.colorOf(ev.p);
    if (ev.t === 'play') {
      const lt = lineSvg.querySelector('.dm-lt.last') || lineSvg.querySelector('.dm-lt');
      const to = rectOf(lt);
      const from = src || (mine ? rectOf(handEl) : oppSpot(ev.p));
      const lying = lt && lt.dataset.lying === '1';
      if (lt && to && from) {
        // la ficha de la mesa aparece cuando llega la que vuela
        lt.style.opacity = '0';
        const long = Math.max(to.w, to.h);
        FX.fly(from, to, { html: tileSVG(ev.tile), w: 40, h: 80, s0: mine ? 1 : 0.4, s1: long / 80, r1: lying ? 90 : 0, dur: 450, done: () => { lt.style.opacity = ''; sfx.thunk(0.9); if (ev.tile[0] === ev.tile[1]) later(() => sfx.click(), 90); } });
      } else sfx.thunk(0.9);
      const left = (lg.hands[ev.p] || []).length;
      if (left === 1 && lg.phase === 'play') later(() => toast(mine ? '¡Te queda <b>una</b> ficha!' : `¡A <b>${name(ev.p)}</b> le queda una ficha!`, col), 500);
    } else if (ev.t === 'draw') {
      const from = pozoSpot();
      if (mine) {
        const got = (lg.hands[me()] || []).slice();
        for (const t of prevHand) { const i = got.indexOf(t); if (i >= 0) got.splice(i, 1); }
        got.forEach((t, i) => FX.arrive(handEl.querySelector(`[data-t="${t}"]`), from, { s0: 0.6, delay: i * 110, rot: 12 }));
      } else {
        for (let i = 0; i < Math.min(ev.k, 8); i++) FX.fly(from, oppSpot(ev.p), { html: backTile(), w: 40, h: 80, s1: 0.3, delay: i * 110, dur: 400 });
        later(() => FX.bubble(oppBox(ev.p), `+${ev.k}`), 300 + (Math.min(ev.k, 8) - 1) * 110);
      }
      toast(mine ? `Robaste <b>${ev.k}</b> del pozo` : `<b>${name(ev.p)}</b> robó ${ev.k} del pozo`, col);
      sfx.land(1.4);
    } else if (ev.t === 'pass') {
      sfx.tick(1.4);
      if (mine) toast('No tenías ficha: <b>pasas</b>', col);
      else { FX.bubble(oppBox(ev.p), '¡Paso!'); toast(`<b>${name(ev.p)}</b> pasó`, col); }
    } else if (ev.t === 'deal') {
      sfx.whoosh();
      startDeal();
    }
  }

  // fin de la mano: aviso grande sobre la mesa antes de ver el resultado
  function onHandEnd() {
    const h = lg.hand;
    if (!h) return;
    handShowAt = Date.now() + 1600;
    const who = h.winner ? (lg.teams ? sideName(h.side) : name(h.winner)) : '';
    FX.splash(tableEl, {
      cls: 'plus',
      art: `<span class="num">${h.why === 'domino' ? '🁫' : '✋'}</span>`,
      title: h.why === 'domino' ? '¡Dominó!' : '¡Tranque!',
      sub: who ? `${who} ${who === 'Tú' ? 'ganas' : lg.teams && h.side ? 'ganan' : 'gana'} la mano: <b>+${h.pts}</b>` : 'Nadie suma puntos',
      color: h.winner ? ctx.colorOf(h.winner) : '#fff',
    });
    const mineSide = sideOf(lg, me()) === h.side && lg.order.includes(me());
    if (lg.win) later(() => { if (sideOf(lg, me()) === lg.winSide) sfx.win(); else sfx.out(0.6); }, 700);
    else if (mineSide) sfx.big(); else sfx.bell();
  }

  function paintTurn() {
    if (!lg) return;
    paintScore();
    paintOpps();
    paintLine();
    paintHand();
    paintMsg();
    stopBtn.hidden = !ctx.isHost() || !!lg.win;
  }

  const iv = setInterval(() => {
    if (dead || !lg || lg.win) return;
    if (lg.phase === 'hand') {
      const cd = $('.dm-cd');
      if (cd) cd.textContent = `(${Math.max(0, Math.ceil((8000 - (Date.now() - tnAt)) / 1000))})`;
      return;
    }
    const f = turnLeft();
    el.querySelectorAll('.dm-opps .oc-opp.turn .oc-timer i, .dm-mebar .oc-mechip.turn + .oc-timer i').forEach((i) => { i.style.transform = `scaleX(${f.toFixed(3)})`; i.classList.toggle('low', f < 0.2); });
    if (pending && Date.now() - pendingAt > 3000) { pending = 0; paintTurn(); }
  }, 150);

  return {
    update(nst) {
      st = nst;
      const nlg = nst.lg;
      if (!nlg) return;
      // nada cambió (llega muy seguido: cada vez que alguien de la sala actualiza su presencia)
      const sig = JSON.stringify([nlg, nst.pl]);
      if (sig === lastSig) return;
      lastSig = sig;
      const first = !lg;
      const prevPhase = lastPhase;
      lg = nlg;
      lastPhase = lg.phase;
      if (lg.tn !== seenTn) { seenTn = lg.tn; tnAt = Date.now(); }
      if (pending && lg.tn !== pending) pending = 0;
      const evKey = JSON.stringify([lg.ev, lg.hn, lg.phase]);
      const fresh = evKey !== lastEvKey && lastEvKey !== '' ? lg.ev : null;
      lastEvKey = evKey;
      if (fresh && dealing && fresh.t !== 'deal') { dealing = null; sHand = ''; sOpps = ''; sMe = ''; }   // ya empezaron: se acaba el reparto
      // dónde estaba la ficha que jugué (antes de repintar la mano)
      const src = fresh && fresh.t === 'play' && fresh.p === me() ? rectOf(handEl.querySelector(`[data-t="${fresh.tile}"]`)) : null;
      if (first && lg.phase === 'play' && !lg.line.length && lg.hn === 1 && !(lg.hist || []).length) startDeal();
      else paintTurn();
      paintHist();
      if (fresh) onEvent(fresh, src);
      if (!first && (lg.phase === 'hand' || lg.phase === 'end') && prevPhase === 'play') onHandEnd();
      paintHandEnd();
      paintEnd();
      prevHand = (lg.hands[me()] || []).slice();
      const turnNow = lg.phase === 'play' && !lg.win ? current(lg) : null;
      if (myTurn() && lastTurn !== me() && !first) {
        sfx.ready(); buzz(40);
        if (!dealing && playable(lg, me()).length) later(() => { if (myTurn()) toast('¡Es tu turno!', ctx.colorOf(me()), 'myturn'); }, 450);
      }
      if (lastTurn === me() && !myTurn()) toastsEl.querySelectorAll('.myturn').forEach((t) => t.remove());
      lastTurn = turnNow;
    },
    destroy() {
      dead = true;
      clearInterval(iv);
      timers.forEach((t) => clearTimeout(t));
    },
  };
}
