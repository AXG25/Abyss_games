// ♟ Ajedrez — pantalla. Dibuja el estado `st.lg` del anfitrión, calcula aquí
// mismo las jugadas legales para marcarlas y envía la jugada con ctx.act().
import { posOf, legalMoves, inCheck, colorFor, current, colorOf, WHY } from './chess.js';
import { avatarSVG, validAvatar, icon } from '../icons.js';
import { esc, buzz } from '../util.js';
import { sfx, isMuted, setMuted } from '../audio.js';

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
          <button class="mute" id="cz-mute">${icon(isMuted() ? 'soundOff' : 'soundOn')}</button>
        </span>
      </header>
      <div class="cz-bar" id="cz-top"></div>
      <div class="cz-wrap"><div class="cz-board"></div></div>
      <div class="cz-bar" id="cz-bot"></div>
      <div class="cz-msg"></div>
      <div class="cz-offer" hidden></div>
      <div class="cz-moves"></div>
      <div class="cz-actions">
        <button class="btn ghost sm" id="cz-draw">½ Ofrecer tablas</button>
        <button class="btn ghost sm" id="cz-resign">${icon('flag')} Rendirse</button>
      </div>
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
  const drawBtn = $('#cz-draw'), resignBtn = $('#cz-resign');

  let st = null, lg = null, pos = null, legal = [];
  let sel = -1;               // casilla elegida
  let promo = null;           // { f, to } esperando la pieza
  let pending = 0, pendingAt = 0;
  let seenTn = 0, tnAt = Date.now();
  let lastEvKey = '';
  let lastLast = '';
  let dead = false;

  $('#cz-leave').onclick = () => ctx.leave();
  $('#cz-mute').onclick = () => { setMuted(!isMuted()); $('#cz-mute').innerHTML = icon(isMuted() ? 'soundOff' : 'soundOn'); };
  $('#cz-stop').onclick = () => { if (confirm('¿Terminar la partida y volver a la sala?')) ctx.lobby(); };

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
      <span class="cz-clk ${turn ? 'run' : ''}" data-c="${col}">${fmt(lg.clk[col])}</span>`;
  }

  function paintBars() {
    const mine = myCol();
    const bottom = mine ? me() : lg.order[0];
    const topId = lg.order.find((id) => id !== bottom);
    topEl.innerHTML = barHTML(topId);
    botEl.innerHTML = barHTML(bottom);
  }

  function paintMsg() {
    const ck = inCheck(pos);
    if (lg.end) msgEl.innerHTML = '';
    else if (myTurn()) msgEl.innerHTML = ck ? '<b class="warn">¡Jaque! Protege a tu rey</b>' : '<b>Tu turno</b>: toca una pieza y luego a dónde va';
    else if (myCol()) msgEl.innerHTML = `${ck ? '<b class="warn">¡Jaque!</b> ' : ''}Turno de <b style="color:${ctx.colorOf(current(lg))}">${esc(player(current(lg)).n)}</b>`;
    else msgEl.innerHTML = `Mueven las ${lg.turn === 'w' ? 'blancas' : 'negras'}${ck ? ' · <b class="warn">¡Jaque!</b>' : ''}`;
    msgEl.classList.toggle('mine', myTurn());
    // jugadas en parejas: 1. e4 e5 2. Cf3 …
    const rows = [];
    for (let i = 0; i < lg.moves.length; i += 2) rows.push(`<span><i>${i / 2 + 1}.</i> ${esc(lg.moves[i])} ${esc(lg.moves[i + 1] || '')}</span>`);
    movesEl.innerHTML = rows.length ? rows.join('') : '<span class="hint">Las blancas empiezan</span>';
    movesEl.scrollLeft = movesEl.scrollWidth;
    // oferta de tablas
    const col = myCol();
    if (!lg.end && lg.offer && col && lg.offer !== col) {
      offerEl.hidden = false;
      offerEl.innerHTML = `<span>${esc(player(rival()).n)} ofrece <b>tablas</b></span><button class="btn sm primary" data-a="draw-yes">Aceptar</button><button class="btn sm ghost" data-a="draw-no">Rechazar</button>`;
    } else if (!lg.end && lg.offer && lg.offer === col) {
      offerEl.hidden = false;
      offerEl.innerHTML = '<span>Ofreciste tablas: esperando respuesta…</span>';
    } else offerEl.hidden = true;
    const playing = !lg.end && !!col;
    $('.cz-actions').hidden = !playing;
    const vsBot = player(rival()).b;
    drawBtn.disabled = !playing || !!lg.offer || lg.offerPly === lg.moves.length || vsBot;
    drawBtn.hidden = vsBot;
    $('#cz-stop').hidden = !ctx.isHost() || lg.end;
  }

  function paintEnd() {
    if (!lg.end) { endEl.hidden = true; return; }
    const won = lg.win === me();
    const title = lg.win ? (won ? '¡Ganaste!' : `¡Ganó ${esc(player(lg.win).n)}!`) : 'Tablas';
    endEl.hidden = false;
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
  }

  function sounds() {
    const ev = lg.ev;
    const key = JSON.stringify([ev, lg.end, lg.win]);
    if (key === lastEvKey) return;
    const first = lastEvKey === '';
    lastEvKey = key;
    if (first) return;
    if (lg.end) {
      if (lg.win === me()) sfx.win(); else if (lg.win) sfx.out(0.6); else sfx.bell();
      return;
    }
    if (!ev) return;
    if (ev.t === 'move') {
      if (ev.s.includes('+')) { sfx.warn(); if (myTurn()) buzz(120); }
      else if (ev.cap) sfx.thud(1.2);
      else sfx.click(1.4);
      if (myTurn()) buzz(30);
    } else if (ev.t === 'offer' && ev.p !== me()) { sfx.bell(); buzz(60); }
  }

  // relojes: cada teléfono cuenta desde que vio el turno nuevo (el anfitrión manda)
  const iv = setInterval(() => {
    if (dead || !lg || lg.end) return;
    const on = lg.moves.length >= 2;
    el.querySelectorAll('.cz-clk').forEach((c) => {
      const col = c.dataset.c;
      const ms = lg.clk[col] - (on && col === lg.turn ? Date.now() - tnAt : 0);
      c.textContent = fmt(ms);
      c.classList.toggle('low', ms < 30000);
    });
    if (pending && Date.now() - pendingAt > 3000) { pending = 0; paintBoard(); }
  }, 250);

  return {
    update(nst) {
      st = nst;
      lg = nst.lg;
      if (!lg) return;
      if (lg.tn !== seenTn) { seenTn = lg.tn; tnAt = Date.now(); sel = -1; }
      if (pending && lg.tn !== pending) pending = 0;
      pos = posOf(lg);
      legal = lg.end ? [] : legalMoves(pos);
      if (lastLast === '') lastLast = 'init';
      sounds();
      paintBoard();
      paintBars();
      paintMsg();
      paintEnd();
    },
    destroy() { dead = true; clearInterval(iv); },
  };
}

