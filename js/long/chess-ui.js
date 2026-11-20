// ♟ Ajedrez — pantalla. Dibuja el estado `st.lg` del anfitrión, calcula aquí
// mismo las jugadas legales para marcarlas y envía la jugada con ctx.act().
//
// Solo se repinta lo que cambió (antes los relojes se volvían a crear con cada
// actualización de la sala y saltaban). Avisos de jaque, jaque mate, enroque,
// coronación y captura al paso; la pieza comida vuela a la barra de quien la
// comió. Contra el bot: nivel (fácil, normal, difícil) y botón de pista.
import { posOf, legalMoves, inCheck, colorFor, current, colorOf, WHY, LEVELS, bestMove } from './chess.js';
import { avatarSVG, validAvatar, icon } from '../icons.js';
import { endPanel, endPanelHide } from './endpanel.js';
import { esc, buzz } from '../util.js';
import { sfx, isMuted, setMuted } from '../audio.js';
import { makeFx, rectOf } from './fx.js';

// Piezas propias (viewBox 50×50): base común + figura.
const BASE = '<path d="M11 45.5h28a2 2 0 0 0 2-2v-1.5a3 3 0 0 0-3-3H12a3 3 0 0 0-3 3v1.5a2 2 0 0 0 2 2z"/>';
const SHAPES = {
  p: BASE + '<path d="M16 39c0-6 3.5-10 6-12h6c2.5 2 6 6 6 12z"/><ellipse cx="25" cy="26" rx="7.5" ry="2.6"/><circle cx="25" cy="16.5" r="7"/>',
  r: BASE + '<path d="M15 39l2-17h16l2 17z"/><path d="M13 22.5h24v-11h-5.5v4.5h-4v-4.5h-5v4.5h-4v-4.5H13z"/><path class="ln" d="M17.5 30h15"/>',
  n: BASE + '<path d="M15 39c0-6 2.5-9.5 6.5-13-3.5.4-6 1.6-8 3.6-2.6-.6-4.2-2.6-3.6-5 1.6-4.6 6.2-9.6 10.6-12.4l.8-4.2 3.4 3c7.2.8 12.3 7.2 12.3 17.4 0 4.4-.6 7.8-1.4 10.6z"/><circle class="eye" cx="20" cy="16.5" r="1.7"/><path class="ln" d="M27.5 10.5c3.5 2 6.2 6.5 6.2 13"/>',
  b: BASE + '<path d="M16.5 39c0-6 2.5-9 4.5-11-4.5-3-5.5-8.5-1.5-13.5 1.6-2 3.6-3.8 5.5-5.4 1.9 1.6 3.9 3.4 5.5 5.4 4 5 3 10.5-1.5 13.5 2 2 4.5 5 4.5 11z"/><circle cx="25" cy="6.5" r="3"/><path class="ln" d="M28.5 13l-6 7.5"/><ellipse cx="25" cy="28.5" rx="6.5" ry="2.2"/>',
  q: BASE + '<path d="M15 39l3-16h14l3 16z"/><path d="M14 24.5h22l3.5-13-7.5 6.5-7-10-7 10-7.5-6.5z"/><circle cx="10.5" cy="11" r="2.8"/><circle cx="25" cy="6.5" r="2.8"/><circle cx="39.5" cy="11" r="2.8"/><path class="ln" d="M17.5 31.5h15"/>',
  k: BASE + '<path d="M15 39l3-14h14l3 14z"/><path d="M14.5 25.5c-3.5-6.5 1.5-12 10.5-8.5 9-3.5 14 2 10.5 8.5z"/><path d="M22.8 3h4.4v4.4h4.3v4.2h-4.3v5.6h-4.4v-5.6h-4.3V7.4h4.3z"/><path class="ln" d="M17.5 31.5h15"/>',
};
export function pieceSVG(p) {
  const w = p === p.toUpperCase();
  return `<svg class="cz-p ${w ? 'w' : 'b'}" viewBox="0 0 50 50" aria-hidden="true">${SHAPES[p.toLowerCase()]}</svg>`;
}
const NAME = { p: 'peón', n: 'caballo', b: 'alfil', r: 'torre', q: 'dama', k: 'rey' };
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const LEVEL_NAME = { easy: 'Fácil', normal: 'Normal', hard: 'Difícil' };
const mini = (p) => `<span class="cz-rp">${pieceSVG(p)}</span>`;
const RULES = `
  <h3>Cómo se juega</h3>
  <p class="oc-goal">Gana quien le da <b>jaque mate</b> al rey rival: lo ataca y el rey no tiene cómo escapar.</p>
  <h4>Cómo se mueve cada pieza</h4>
  <div class="oc-pow cz-pow">
    <div>${mini('K')}<p><b>Rey</b>Una casilla en cualquier dirección. Nunca puede quedar atacado.</p></div>
    <div>${mini('Q')}<p><b>Dama</b>En línea recta o en diagonal, todas las casillas que quiera.</p></div>
    <div>${mini('R')}<p><b>Torre</b>En línea recta (horizontal o vertical), todas las casillas que quiera.</p></div>
    <div>${mini('B')}<p><b>Alfil</b>En diagonal, todas las casillas que quiera.</p></div>
    <div>${mini('N')}<p><b>Caballo</b>En "L": dos casillas y una de lado. Es la única pieza que salta.</p></div>
    <div>${mini('P')}<p><b>Peón</b>Avanza una casilla (dos en su primera jugada) y come en diagonal.</p></div>
  </div>
  <h4>Jugadas especiales</h4>
  <ul>
    <li><b>Enroque</b>: el rey se mueve dos casillas hacia una torre y la torre salta al otro lado. Solo si ninguno se ha movido, no hay piezas en medio y el rey no está ni pasa por jaque.</li>
    <li><b>Coronación</b>: el peón que llega al final se convierte en dama, torre, alfil o caballo.</li>
    <li><b>Captura al paso</b>: si un peón rival avanza dos casillas y queda al lado del tuyo, puedes comerlo como si hubiera avanzado una (solo en la jugada siguiente).</li>
  </ul>
  <h4>Tablas (empate)</h4>
  <ul>
    <li><b>Rey ahogado</b>: no tienes jugadas y tu rey no está en jaque.</li>
    <li>Misma posición <b>tres veces</b>, <b>50 jugadas</b> sin comer ni mover peones, <b>material insuficiente</b> o <b>por acuerdo</b> (½ Ofrecer tablas).</li>
  </ul>
  <p class="oc-why"><b>Reloj</b>: 10 minutos por jugador y 3 s más por cada jugada. Pierde quien se queda sin tiempo o se desconecta más de 1 minuto en su turno. Toca una pieza para ver a dónde puede ir.</p>`;

const fmt = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function mountChess(el, ctx) {
  el.innerHTML = `
    <section class="screen chess">
      <header class="oc-top">
        <button class="btn ghost sm" id="cz-leave">${icon('back')} Salir</button>
        <b class="oc-title">Ajedrez</b>
        <span class="oc-tools">
          <button class="btn ghost sm oc-end-btn" id="cz-stop" hidden>Terminar</button>
          <button class="mute oc-help-btn" id="cz-help" aria-label="Reglas">?</button>
          <button class="mute" id="cz-mute">${icon(isMuted() ? 'soundOff' : 'soundOn')}</button>
        </span>
      </header>
      <div class="cz-bar" id="cz-top"></div>
      <div class="cz-wrap"><div class="cz-board"></div><div class="oc-toasts"></div></div>
      <div class="cz-bar" id="cz-bot"></div>
      <div class="cz-msg"></div>
      <div class="cz-offer" hidden></div>
      <div class="cz-moves"></div>
      <div class="cz-actions">
        <button class="btn ghost sm" id="cz-hint" hidden>💡 Pista</button>
        <button class="btn ghost sm" id="cz-draw">½ Ofrecer tablas</button>
        <button class="btn ghost sm" id="cz-resign">${icon('flag')} Rendirse</button>
      </div>
      <div class="cz-level" hidden><span>Bot:</span>${LEVELS.map((v) => `<button data-lv="${v}">${LEVEL_NAME[v]}</button>`).join('')}</div>
      <div class="oc-fly"></div>
      <div class="oc-pick cz-help" hidden><div class="oc-pick-box oc-rules">${RULES}<button class="btn primary" id="cz-help-x">¡Entendido!</button></div></div>
      <div class="oc-pick cz-promo" hidden>
        <div class="oc-pick-box">
          <p>¿En qué se convierte tu peón?</p>
          <div class="oc-pick-row cz-promo-row"></div>
          <button class="btn ghost sm" id="cz-promo-x">Cancelar</button>
        </div>
      </div>
      <div class="oc-end" hidden></div>
    </section>`;
  const $ = (s) => el.querySelector(s);
  const boardEl = $('.cz-board'), topEl = $('#cz-top'), botEl = $('#cz-bot'), msgEl = $('.cz-msg');
  const offerEl = $('.cz-offer'), movesEl = $('.cz-moves'), promoEl = $('.cz-promo'), endEl = $('.oc-end');
  const drawBtn = $('#cz-draw'), resignBtn = $('#cz-resign'), hintBtn = $('#cz-hint'), levelEl = $('.cz-level'), helpEl = $('.cz-help');
  const wrapEl = $('.cz-wrap'), toastsEl = $('.oc-toasts');

  let st = null, lg = null, pos = null, legal = [];
  let sel = -1;               // casilla elegida
  let promo = null;           // { f, to } esperando la pieza
  let pending = 0, pendingAt = 0;
  let seenTn = 0, tnAt = Date.now();
  let lastEvKey = '';
  let lastLast = '';
  let lastSig = '', sBars = '', sMoves = '', sOffer = '', msgCur = '', endKey = '';
  let hint = null;            // jugada sugerida { f, t } (se ve unos segundos)
  let dead = false;
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (!dead) fn(); }, ms); timers.add(t); };
  const FX = makeFx($('.oc-fly'), later);

  $('#cz-leave').onclick = () => ctx.leave();
  $('#cz-mute').onclick = () => { setMuted(!isMuted()); $('#cz-mute').innerHTML = icon(isMuted() ? 'soundOff' : 'soundOn'); };
  $('#cz-stop').onclick = () => { if (confirm('¿Terminar la partida y volver a la sala?')) ctx.lobby(); };
  $('#cz-help').onclick = () => { helpEl.hidden = false; };
  helpEl.onclick = (e) => { if (e.target === helpEl || e.target.closest('#cz-help-x')) helpEl.hidden = true; };

  const me = () => ctx.me;
  const myCol = () => (lg ? colorFor(lg, me()) : null);
  const player = (id) => (st.pl || []).find((p) => p.id === id) || { id, n: '¿?', a: 'frog' };
  const rival = () => (lg ? lg.order.find((id) => id !== me()) : null);
  const myTurn = () => lg && !lg.end && myCol() === lg.turn;
  const busy = () => pending && pending === lg.tn && Date.now() - pendingAt < 3000;
  const flip = () => myCol() === 'b';   // negras abajo si juego con negras
  const send = (a, needTurn = true) => {
    if (!lg || lg.end || (needTurn && (!myTurn() || busy()))) return;
    if (needTurn) { pending = lg.tn; pendingAt = Date.now(); }
    ctx.act({ ...a, tn: lg.tn });
  };

  drawBtn.onclick = () => { if (confirm('¿Ofrecer tablas a tu rival?')) send({ t: 'offer' }, false); };
  levelEl.onclick = (e) => { const b = e.target.closest('[data-lv]'); if (b && lg && b.dataset.lv !== lg.lvl) { sfx.click(); send({ t: 'level', v: b.dataset.lv }, false); } };
  // pista: la mejor jugada que encuentra el mismo motor del bot (pensando poco)
  hintBtn.onclick = () => {
    // la pista es solo para jugar contra el bot
    if (!myTurn() || busy() || !player(rival()).b) return;
    const m = bestMove(pos, 2, () => 0, 400);
    if (!m) return;
    hint = { f: m.f, t: m.t };
    sfx.ready();
    paintBoard();
    const seen = hint;
    later(() => { if (hint === seen) { hint = null; paintBoard(); } }, 4000);
  };
  resignBtn.onclick = () => { if (confirm('¿Seguro que te rindes?')) send({ t: 'resign' }, false); };
  offerEl.onclick = (e) => {
    const b = e.target.closest('[data-a]');
    if (b) send({ t: b.dataset.a }, false);
  };

  // ---- tablero
  const sqEl = [];
  const buildBoard = () => {
    boardEl.innerHTML = '';
    sqEl.length = 0;
    for (let v = 0; v < 64; v++) {
      const i = flip() ? 63 - v : v;
      const d = document.createElement('div');
      d.className = 'cz-sq ' + (((i >> 3) + (i & 7)) % 2 ? 'dk' : 'lt');
      d.dataset.i = i;
      const r = i >> 3, c = i & 7;
      // coordenadas en el borde
      if (v % 8 === 0) d.insertAdjacentHTML('beforeend', `<span class="cz-rk">${8 - r}</span>`);
      if (v >= 56) d.insertAdjacentHTML('beforeend', `<span class="cz-fl">${'abcdefgh'[c]}</span>`);
      boardEl.appendChild(d);
      sqEl[i] = d;
    }
    boardEl.dataset.flip = flip() ? '1' : '0';
  };

  boardEl.onclick = (e) => {
    const d = e.target.closest('.cz-sq');
    if (!d || !myTurn() || busy()) return;
    const i = Number(d.dataset.i);
    const p = pos.b[i];
    if (sel >= 0) {
      const ms = legal.filter((m) => m.f === sel && m.t === i);
      if (ms.length) {
        if (ms.some((m) => m.p)) { promo = { f: sel, to: i }; showPromo(); return; }
        send({ t: 'move', f: sel, to: i });
        sel = -1;
        paintBoard();
        return;
      }
    }
    if (p !== '.' && colorOf(p) === myCol() && legal.some((m) => m.f === i)) { sel = i === sel ? -1 : i; sfx.tick(); }
    else sel = -1;
    paintBoard();
  };

  function showPromo() {
    const w = myCol() === 'w';
    $('.cz-promo-row').innerHTML = ['q', 'r', 'b', 'n'].map((t) => `<button data-p="${t}">${pieceSVG(w ? t.toUpperCase() : t)}<small>${NAME[t]}</small></button>`).join('');
    promoEl.hidden = false;
  }
  promoEl.onclick = (e) => {
    const b = e.target.closest('[data-p]');
    if (b && promo) { send({ t: 'move', f: promo.f, to: promo.to, p: b.dataset.p }); promo = null; sel = -1; promoEl.hidden = true; paintBoard(); return; }
    if (e.target.closest('#cz-promo-x') || e.target === promoEl) { promo = null; promoEl.hidden = true; }
  };

  function paintBoard() {
    if ((boardEl.dataset.flip === '1') !== flip() || !sqEl.length) buildBoard();
    const check = inCheck(pos) ? pos.b.indexOf(lg.turn === 'w' ? 'K' : 'k') : -1;
    const dests = new Set(sel >= 0 ? legal.filter((m) => m.f === sel).map((m) => m.t) : []);
    const movable = new Set(myTurn() && !busy() ? legal.map((m) => m.f) : []);
    for (let i = 0; i < 64; i++) {
      const d = sqEl[i];
      const p = pos.b[i];
      d.classList.toggle('last', !!lg.last && (lg.last.f === i || lg.last.t === i));
      d.classList.toggle('sel', i === sel);
      d.classList.toggle('chk', i === check);
      d.classList.toggle('dot', dests.has(i) && p === '.');
      d.classList.toggle('hit', dests.has(i) && p !== '.');
      d.classList.toggle('can', movable.has(i));
      // (no se llama 'hint': esa clase ya existe para textos y movía las casillas)
      d.classList.toggle('cz-tip', !!hint && myTurn() && (hint.f === i || hint.t === i));
      let pc = d.querySelector('.cz-p');
      const want = p === '.' ? '' : p;
      if ((pc ? pc.dataset.k : '') !== want) {
        if (pc) pc.remove();
        if (want) { d.insertAdjacentHTML('beforeend', pieceSVG(want)); pc = d.querySelector('.cz-p'); pc.dataset.k = want; }
      }
    }
    // animación de la última jugada: la pieza viaja de su casilla de origen
    const lk = lg.last ? `${lg.last.f}-${lg.last.t}-${lg.moves.length}` : '';
    if (lk && lk !== lastLast && lastLast !== 'init') {
      const to = sqEl[lg.last.t], from = sqEl[lg.last.f];
      const pc = to && to.querySelector('.cz-p');
      if (pc && from) {
        const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
        pc.style.transition = 'none';
        pc.style.transform = `translate(${a.left - b.left}px, ${a.top - b.top}px)`;
        pc.style.zIndex = 3;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          pc.style.transition = 'transform .22s ease-out';
          pc.style.transform = '';
          setTimeout(() => { pc.style.zIndex = ''; }, 260);
        }));
      }
    }
    lastLast = lk;
  }

  function capturedHTML(col) {
    // piezas que capturó `col` y la ventaja en material
    const caps = (lg.capt[col] || '').split('').sort((a, b) => VAL[b] - VAL[a]);
    const mat = (c) => (lg.capt[c] || '').split('').reduce((s, t) => s + VAL[t], 0);
    const adv = mat(col) - mat(col === 'w' ? 'b' : 'w');
    const enemy = (t) => (col === 'w' ? t : t.toUpperCase());
    return `<span class="cz-caps">${caps.map((t) => pieceSVG(enemy(t))).join('')}${adv > 0 ? `<b>+${adv}</b>` : ''}</span>`;
  }

  function barHTML(id) {
    if (!id) return '';
    const p = player(id);
    const col = colorFor(lg, id);
    const turn = !lg.end && lg.turn === col;
    return `<span class="cz-who ${turn ? 'turn' : ''} ${p.off ? 'off' : ''}" style="--c:${ctx.colorOf(id)}">
        <span class="oc-av">${avatarSVG(validAvatar(p.a))}</span>
        <span class="cz-nm"><b>${id === me() ? 'Tú' : esc(p.n)}${p.b ? ' <i>bot</i>' : ''}</b><small><i class="cz-dotc ${col}"></i>${col === 'w' ? 'Blancas' : 'Negras'}${lg.wins[id] ? ` · ${icon('trophy')}${lg.wins[id]}` : ''}</small></span>
      </span>
      ${capturedHTML(col)}
      <span class="cz-clk ${turn ? 'run' : ''}" data-c="${col}">${fmt(clockLeft(col))}</span>`;
  }
  // tiempo que le queda a un color ahora mismo (cada teléfono cuenta desde que vio el turno)
  const clockLeft = (col) => lg.clk[col] - (!lg.end && lg.moves.length >= 2 && col === lg.turn ? Date.now() - tnAt : 0);

  // las barras se rehacen solo si cambia algo que se ve (no los segundos del reloj)
  function paintBars() {
    const mine = myCol();
    const bottom = mine ? me() : lg.order[0];
    const topId = lg.order.find((id) => id !== bottom);
    const sig = JSON.stringify([lg.order.map((id) => { const p = player(id); return [id, p.n, p.a, p.b, p.off, ctx.colorOf(id), lg.wins[id]]; }), lg.turn, lg.end, lg.capt, lg.clk, bottom]);
    if (sig === sBars) return;
    sBars = sig;
    topEl.innerHTML = barHTML(topId);
    botEl.innerHTML = barHTML(bottom);
  }

  function paintMsg() {
    const ck = inCheck(pos);
    let h;
    if (lg.end) h = `<b class="warn">${lg.why === 'mate' ? '¡Jaque mate!' : WHY[lg.why] || 'Fin'}</b> · ${lg.win ? (lg.win === me() ? '¡Ganaste!' : `Ganó ${esc(player(lg.win).n)}`) : 'Tablas'}`;
    else if (myTurn()) h = ck ? '<b class="warn">¡Jaque! Protege a tu rey</b>' : '<b>Tu turno</b>: toca una pieza y luego a dónde va';
    else if (myCol()) h = `${ck ? '<b class="warn">¡Jaque!</b> ' : ''}Turno de <b style="color:${ctx.colorOf(current(lg))}">${esc(player(current(lg)).n)}</b>${player(current(lg)).b ? ' (pensando…)' : ''}`;
    else h = `Mueven las ${lg.turn === 'w' ? 'blancas' : 'negras'}${ck ? ' · <b class="warn">¡Jaque!</b>' : ''}`;
    if (h !== msgCur) { msgCur = h; msgEl.innerHTML = h; }
    msgEl.classList.toggle('mine', myTurn());
    // jugadas en parejas: 1. e4 e5 2. Cf3 …
    if (sMoves !== String(lg.moves.length)) {
      sMoves = String(lg.moves.length);
      const rows = [];
      for (let i = 0; i < lg.moves.length; i += 2) rows.push(`<span><i>${i / 2 + 1}.</i> ${esc(lg.moves[i])} ${esc(lg.moves[i + 1] || '')}</span>`);
      movesEl.innerHTML = rows.length ? rows.join('') : '<span class="hint">Las blancas empiezan</span>';
      movesEl.scrollLeft = movesEl.scrollWidth;
    }
    // oferta de tablas
    const col = myCol();
    const ok = !lg.end && lg.offer && col ? (lg.offer !== col ? 'them' : 'me') : '';
    if (ok !== sOffer) {
      sOffer = ok;
      offerEl.hidden = !ok;
      if (ok === 'them') offerEl.innerHTML = `<span>${esc(player(rival()).n)} ofrece <b>tablas</b></span><button class="btn sm primary" data-a="draw-yes">Aceptar</button><button class="btn sm ghost" data-a="draw-no">Rechazar</button>`;
      else if (ok === 'me') offerEl.innerHTML = '<span>Ofreciste tablas: esperando respuesta…</span>';
    }
    const playing = !lg.end && !!col;
    $('.cz-actions').hidden = !playing;
    const vsBot = !!player(rival()).b;
    drawBtn.disabled = !playing || !!lg.offer || lg.offerPly === lg.moves.length || vsBot;
    drawBtn.hidden = vsBot;
    // contra el bot: pista y nivel
    hintBtn.hidden = !vsBot || !playing;
    hintBtn.disabled = !myTurn() || !!busy();
    levelEl.hidden = !vsBot || !playing;
    levelEl.querySelectorAll('[data-lv]').forEach((b) => b.classList.toggle('on', b.dataset.lv === (lg.lvl || 'normal')));
    $('#cz-stop').hidden = !ctx.isHost() || lg.end;
  }

  function paintEnd() {
    if (!lg.end) { endKey = ''; endPanelHide(endEl); return; }
    const key = `${lg.tn}:${lg.why}`;
    if (key === endKey) { endPanel(endEl, key, 2800); return; }
    endKey = key;
    const won = lg.win === me();
    const title = lg.win ? (won ? '¡Ganaste!' : `¡Ganó ${esc(player(lg.win).n)}!`) : 'Tablas';
    
    endEl.innerHTML = `
      <div class="oc-end-box">
        <div class="oc-end-av" style="--c:${lg.win ? ctx.colorOf(lg.win) : '#9d8df1'}">${lg.win ? avatarSVG(validAvatar(player(lg.win).a)) : pieceSVG('K') }</div>
        <h2>${lg.win ? icon('trophy') : ''} ${title}</h2>
        <p class="cz-why">${WHY[lg.why] || ''}${lg.moves.length ? ` · ${Math.ceil(lg.moves.length / 2)} jugadas` : ''}</p>
        <ol class="oc-rank">${lg.order.map((id) => `<li style="--c:${ctx.colorOf(id)}"><b class="cz-rkp">${pieceSVG(colorFor(lg, id) === 'w' ? 'K' : 'k')}</b><span>${esc(player(id).n)}${id === me() ? ' (tú)' : ''}</span><em>${icon('trophy')} ${lg.wins[id] || 0}</em></li>`).join('')}</ol>
        ${lg.draws ? `<p class="hint">Tablas: ${lg.draws}</p>` : ''}
        ${ctx.isHost()
          ? `<button class="btn big primary" id="cz-again">${icon('repeat')} Revancha (cambian colores)</button><button class="btn ghost" id="cz-lobby">Volver a la sala</button>`
          : '<p class="hint">Esperando al anfitrión para la revancha…</p>'}
      </div>`;
    if (ctx.isHost()) {
      $('#cz-again').onclick = () => ctx.again();
      $('#cz-lobby').onclick = () => ctx.lobby();
    }
    endPanel(endEl, `${lg.tn}:${lg.why}`, 2800);
  }

  const splash = (spec) => FX.splash(wrapEl, spec);
  const toast = (html, color, cls = '') => FX.toast(toastsEl, html, color, cls);
  const PNAME = { q: 'dama', r: 'torre', b: 'alfil', n: 'caballo', p: 'peón' };

  // jugada nueva: sonidos, avisos y la pieza comida vuela a la barra de quien la comió
  function onEvent(ev, capFrom) {
    const mine = ev.p === me();
    const col = ctx.colorOf(ev.p);
    const who = mine ? 'Tú' : esc(player(ev.p).n);
    if (lg.end) {
      later(() => {
        if (lg.why === 'mate') splash({ cls: 'mate', art: `<span class="cz-sp">${pieceSVG(colorFor(lg, lg.win) === 'w' ? 'k' : 'K')}</span>`, title: '¡Jaque mate!', sub: lg.win === me() ? '¡Ganaste!' : `Ganó <b>${esc(player(lg.win).n)}</b>`, color: ctx.colorOf(lg.win) });
        else if (!lg.win) splash({ art: '<span class="num">½</span>', title: 'Tablas', sub: WHY[lg.why] || '', color: '#9d8df1' });
        else splash({ art: icon('trophy'), title: lg.win === me() ? '¡Ganaste!' : `Ganó ${esc(player(lg.win).n)}`, sub: WHY[lg.why] || '', color: ctx.colorOf(lg.win) });
      }, ev.t === 'move' ? 300 : 0);
      if (lg.win === me()) sfx.win(); else if (lg.win) sfx.out(0.6); else sfx.bell();
    }
    if (ev.t === 'move') {
      if (ev.castle) { sfx.click(1.2); later(() => sfx.click(1), 120); toast(`${who} ${mine ? 'te enrocaste' : 'se enrocó'} (${ev.s === 'O-O' ? 'corto' : 'largo'})`, col); }
      else if (ev.promo) { sfx.big(); if (!lg.end) splash({ cls: 'suit', who: `${who} ${mine ? 'coronaste' : 'coronó'} un peón`, art: `<span class="cz-sp">${pieceSVG(colorFor(lg, ev.p) === 'w' ? 'P' : 'p')}</span><span class="arr">→</span><span class="cz-sp new">${pieceSVG(colorFor(lg, ev.p) === 'w' ? ev.promo.toUpperCase() : ev.promo)}</span>`, title: '¡Coronación!', sub: `El peón ahora es <b>${PNAME[ev.promo]}</b>`, color: col }); }
      else if (ev.cap) sfx.thud(1.2);
      else sfx.click(1.4);
      if (ev.ep) toast('¡Captura <b>al paso</b>!', col);
      if (ev.cap && ev.capP && capFrom) {
        // la pieza comida vuela a la barra de quien la comió
        const bar = colorFor(lg, ev.p) === colorFor(lg, me()) || (!myCol() && colorFor(lg, ev.p) === 'w') ? botEl : topEl;
        const capCol = colorFor(lg, ev.p) === 'w' ? ev.capP : ev.capP.toUpperCase();
        FX.fly(capFrom, rectOf(bar.querySelector('.cz-caps') || bar), { html: pieceSVG(capCol), w: 40, h: 40, s1: 0.45, dur: 520 });
      }
      if (ev.check && !lg.end) {
        sfx.warn();
        splash({ cls: 'skip', art: `<span class="cz-sp">${pieceSVG(lg.turn === 'w' ? 'K' : 'k')}</span>`, title: '¡Jaque!', sub: lg.turn === colorFor(lg, me()) ? 'Protege a tu rey' : `${who} ${mine ? 'diste' : 'dio'} jaque`, color: col });
        if (myTurn()) buzz(120);
      }
      if (myTurn()) buzz(30);
    } else if (ev.t === 'offer' && ev.p !== me()) { sfx.bell(); buzz(60); toast(`<b>${esc(player(ev.p).n)}</b> ofrece tablas`, col); }
    else if (ev.t === 'decline' && ev.p !== me()) toast(`<b>${esc(player(ev.p).n)}</b> rechazó las tablas`, col);
    else if (ev.t === 'level') toast(`Bot: <b>${LEVEL_NAME[ev.v]}</b>`, '#9d8df1');
  }

  // relojes: cada teléfono cuenta desde que vio el turno nuevo (el anfitrión manda)
  const iv = setInterval(() => {
    if (dead || !lg || lg.end) return;
    el.querySelectorAll('.cz-clk').forEach((c) => {
      const ms = clockLeft(c.dataset.c);
      const t = fmt(ms);
      if (c.textContent !== t) c.textContent = t;
      c.classList.toggle('low', ms < 30000);
    });
    if (pending && Date.now() - pendingAt > 3000) { pending = 0; paintBoard(); }
  }, 250);

  return {
    update(nst) {
      st = nst;
      if (!nst.lg) return;
      // nada cambió (llega muy seguido: cada vez que alguien de la sala actualiza su presencia)
      const sig = JSON.stringify([nst.lg, nst.pl]);
      if (sig === lastSig) return;
      lastSig = sig;
      lg = nst.lg;
      if (lg.tn !== seenTn) { seenTn = lg.tn; tnAt = Date.now(); sel = -1; hint = null; }
      if (pending && lg.tn !== pending) pending = 0;
      pos = posOf(lg);
      legal = lg.end ? [] : legalMoves(pos);
      if (lastLast === '') lastLast = 'init';
      const evKey = JSON.stringify([lg.ev, lg.end, lg.win]);
      const fresh = evKey !== lastEvKey && lastEvKey !== '' ? lg.ev : null;
      lastEvKey = evKey;
      // casilla de la pieza comida (antes de repintar), para que vuele a la barra
      const capFrom = fresh && fresh.t === 'move' && fresh.cap && sqEl.length ? rectOf(sqEl[fresh.ep ? (fresh.f & ~7) | (fresh.to & 7) : fresh.to]) : null;
      paintBoard();
      paintBars();
      paintMsg();
      paintEnd();
      if (fresh) onEvent(fresh, capFrom);
    },
    destroy() { dead = true; clearInterval(iv); timers.forEach((t) => clearTimeout(t)); },
  };
}

