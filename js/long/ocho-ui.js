// 🃏 Ocho loco — pantalla del juego. Solo dibuja el estado `st.lg` que publica
// el anfitrión y envía las jugadas con ctx.act(); las reglas están en ocho.js.
import { SUITS, SUIT_NAME, TURN_MS, OFF_TURN_MS, suitOf, rankOf, canPlay, top, current, ranking } from './ocho.js';
import { avatarSVG, validAvatar, icon } from '../icons.js';
import { esc, buzz } from '../util.js';
import { sfx, isMuted, setMuted } from '../audio.js';

const SUIT_SVG = {
  H: '<path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.9 4.5 6.6 4.5c2.2 0 3.6 1.2 4.4 2.5.8-1.3 2.2-2.5 4.4-2.5 3.7 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z"/>',
  D: '<path d="M12 2l8 10-8 10-8-10z"/>',
  C: '<circle cx="12" cy="7" r="4.3"/><circle cx="6.8" cy="13.4" r="4.3"/><circle cx="17.2" cy="13.4" r="4.3"/><path d="M11 13h2l1.6 9h-5.2z"/>',
  S: '<path d="M12 2s8 6.5 8 11.5c0 2.6-2 4.5-4.4 4.5-1.4 0-2.6-.6-3.2-1.6l1.4 5.6h-3.6l1.4-5.6c-.6 1-1.8 1.6-3.2 1.6C6 18 4 16.1 4 13.5 4 8.5 12 2 12 2z"/>',
};
const suitIcon = (s, cls = 'sv') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${SUIT_SVG[s] || ''}</svg>`;
const red = (s) => s === 'H' || s === 'D';
const RANK_TXT = { A: 'A', J: 'J', Q: 'Q', K: 'K' };

export function cardHTML(c, extra = '') {
  const s = suitOf(c), k = rankOf(c);
  return `<div class="pc ${red(s) ? 'red' : 'blk'} ${extra}" data-c="${c}">
      <span class="pc-tl"><b>${RANK_TXT[k] || k}</b>${suitIcon(s)}</span>
      <span class="pc-mid">${k === '8' ? '<b class="pc-8">8</b>' : suitIcon(s, 'sv big')}</span>
      <span class="pc-br"><b>${RANK_TXT[k] || k}</b>${suitIcon(s)}</span>
    </div>`;
}
const backHTML = (extra = '') => `<div class="pc back ${extra}"><span></span></div>`;

const RANK_NAME = { A: 'As', J: 'J', Q: 'Q', K: 'K' };
const cardName = (c) => `${RANK_NAME[rankOf(c)] || rankOf(c)} de ${SUIT_NAME[suitOf(c)].toLowerCase()}`;

export function mountOcho(el, ctx) {
  el.innerHTML = `
    <section class="screen ocho">
      <header class="oc-top">
        <button class="btn ghost sm" id="oc-leave">${icon('back')} Salir</button>
        <b class="oc-title">Ocho loco</b>
        <span class="oc-tools">
          <button class="btn ghost sm oc-end-btn" id="oc-stop" hidden>Terminar</button>
          <button class="mute" id="oc-mute">${icon(isMuted() ? 'soundOff' : 'soundOn')}</button>
        </span>
      </header>
      <div class="oc-opps"></div>
      <div class="oc-table">
        <div class="oc-dir"></div>
        <button class="oc-deck" aria-label="Robar carta">${backHTML()}${backHTML('b2')}${backHTML('b3')}<small class="oc-deck-n"></small><em class="oc-deck-lbl"></em></button>
        <div class="oc-disc"></div>
        <div class="oc-suit"></div>
        <div class="oc-stack" hidden></div>
      </div>
      <div class="oc-log"></div>
      <div class="oc-msg"></div>
      <div class="oc-mebar"></div>
      <div class="oc-hand"></div>
      <div class="oc-actions"><button class="btn primary" id="oc-pass" hidden>Pasar turno</button></div>
      <div class="oc-pick" hidden>
        <div class="oc-pick-box">
          <p>Jugaste un <b>8</b>: elige el palo que sigue</p>
          <div class="oc-pick-row">${SUITS.map((s) => `<button data-s="${s}" class="${red(s) ? 'red' : 'blk'}">${suitIcon(s)}<small>${SUIT_NAME[s]}</small></button>`).join('')}</div>
          <button class="btn ghost sm" id="oc-pick-x">Cancelar</button>
        </div>
      </div>
      <div class="oc-end" hidden></div>
    </section>`;
  const $ = (s) => el.querySelector(s);
  const oppsEl = $('.oc-opps'), deckEl = $('.oc-deck'), discEl = $('.oc-disc'), suitEl = $('.oc-suit');
  const stackEl = $('.oc-stack'), dirEl = $('.oc-dir'), logEl = $('.oc-log'), msgEl = $('.oc-msg');
  const handEl = $('.oc-hand'), passBtn = $('#oc-pass'), pickEl = $('.oc-pick'), endEl = $('.oc-end'), meBar = $('.oc-mebar');

  let st = null;
  let lg = null;
  let pending = 0;          // tn de la jugada que envié y aún no se aplica
  let pendingAt = 0;
  let pick8 = null;         // carta 8 esperando que elija palo
  let seenTn = 0, tnAt = 0; // para el reloj del turno (cada teléfono mide desde que lo vio)
  let lastEv = null;
  let lastWin = null;
  let lastTick = 0;
  let dead = false;

  $('#oc-leave').onclick = () => ctx.leave();
  $('#oc-mute').onclick = () => { setMuted(!isMuted()); $('#oc-mute').innerHTML = icon(isMuted() ? 'soundOff' : 'soundOn'); };
  $('#oc-stop').onclick = () => { if (confirm('¿Terminar la partida y volver a la sala?')) ctx.lobby(); };

  const me = () => ctx.me;
  const myHand = () => (lg && lg.hands[me()]) || null;
  const myTurn = () => lg && !lg.win && current(lg) === me() && !!myHand();
  const busy = () => pending && pending === lg.tn && Date.now() - pendingAt < 3000;
  const player = (id) => (st.pl || []).find((p) => p.id === id) || { id, n: '¿?', a: 'frog' };
  const send = (a) => {
    if (!myTurn() || busy()) return;
    pending = lg.tn;
    pendingAt = Date.now();
    ctx.act({ ...a, tn: lg.tn });
    paint();
  };

  deckEl.onclick = () => {
    if (!myTurn() || busy() || (lg.drawn && !lg.stack)) return;
    sfx.click();
    send({ t: 'draw' });
  };
  passBtn.onclick = () => { if (myTurn() && lg.drawn) send({ t: 'pass' }); };
  handEl.onclick = (e) => {
    const b = e.target.closest('.pc[data-c]');
    if (!b || !myTurn() || busy()) return;
    const c = b.dataset.c;
    if (!canPlay(lg, c)) { b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); buzz(60); return; }
    if (rankOf(c) === '8') { pick8 = c; pickEl.hidden = false; return; }
    send({ t: 'play', c });
  };
  pickEl.onclick = (e) => {
    const b = e.target.closest('[data-s]');
    if (b && pick8) { const c = pick8; pick8 = null; pickEl.hidden = true; send({ t: 'play', c, s: b.dataset.s }); return; }
    if (e.target.closest('#oc-pick-x') || e.target === pickEl) { pick8 = null; pickEl.hidden = true; }
  };

  // ---- dibujo
  function turnLeft() {
    const pid = current(lg);
    const p = player(pid);
    const total = p.off ? OFF_TURN_MS : TURN_MS;
    return Math.max(0, total - (Date.now() - tnAt)) / total;
  }

  function paintOpps() {
    const order = lg.order;
    const mi = order.indexOf(me());
    // en orden de turno empezando por el que va después de mí
    const ids = mi >= 0 ? [...order.slice(mi + 1), ...order.slice(0, mi)] : order.slice();
    const cur = current(lg);
    oppsEl.innerHTML = ids.map((id) => {
      const p = player(id);
      const n = (lg.hands[id] || []).length;
      const backs = Array.from({ length: Math.min(n, 8) }, () => '<i></i>').join('');
      return `<div class="oc-opp ${id === cur && !lg.win ? 'turn' : ''} ${p.off ? 'off' : ''}" style="--c:${ctx.colorOf(id)}">
          <span class="oc-av">${avatarSVG(validAvatar(p.a))}</span>
          <span class="oc-name">${esc(p.n)}${p.b ? ' <i>bot</i>' : ''}</span>
          <span class="oc-backs">${backs}</span>
          <span class="oc-n">${n} carta${n === 1 ? '' : 's'}${n === 1 && !lg.win ? ' <em>¡Última!</em>' : ''}</span>
          ${lg.wins[id] ? `<span class="oc-w">${icon('trophy')}${lg.wins[id]}</span>` : ''}
          <span class="oc-timer"><i></i></span>
        </div>`;
    }).join('');
  }

  function paintHand() {
    const hand = myHand();
    if (!hand) { handEl.innerHTML = '<p class="hint">Estás mirando la partida</p>'; return; }
    const mine = myTurn() && !busy();
    // ordenadas por palo y número para encontrarlas fácil
    const ord = (c) => SUITS.indexOf(suitOf(c)) * 20 + ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].indexOf(rankOf(c));
    const cards = hand.slice().sort((a, b) => ord(a) - ord(b));
    const W = Math.max(240, handEl.clientWidth || 340);
    const cw = 64;
    const n = cards.length;
    const gap = n > 1 ? Math.max(-44, Math.min(6, (W - 8 - cw * n) / (n - 1))) : 0;
    handEl.style.setProperty('--gap', gap + 'px');
    handEl.innerHTML = cards.map((c) => cardHTML(c, `${mine ? (canPlay(lg, c) ? 'ok' : 'dim') : ''} ${c === lg.drawn ? 'new' : ''}`)).join('');
  }

  function paintTable() {
    const t = top(lg);
    const ev = lg.ev;
    const fresh = ev && ev.t === 'play' && JSON.stringify(ev) !== JSON.stringify(lastEv);
    const fromMe = ev && ev.p === me();
    discEl.innerHTML = (lg.disc.length > 1 ? cardHTML(lg.disc[lg.disc.length - 2], 'under') : '') + cardHTML(t, fresh ? (fromMe ? 'in-up' : 'in-down') : '');
    const changed = rankOf(t) === '8';
    suitEl.innerHTML = `<span class="${red(lg.suit) ? 'red' : 'blk'}">${suitIcon(lg.suit)}</span><small>${changed ? 'Palo elegido' : 'Palo'}: ${SUIT_NAME[lg.suit]}</small>`;
    suitEl.classList.toggle('hot', changed);
    stackEl.hidden = !lg.stack;
    stackEl.textContent = `+${lg.stack}`;
    dirEl.innerHTML = lg.dir === 1 ? '↻' : '↺';
    dirEl.title = 'Sentido del juego';
    $('.oc-deck-n').textContent = lg.draw.length;
    const can = myTurn() && !busy() && (!lg.drawn || lg.stack);
    deckEl.classList.toggle('ok', can);
    $('.oc-deck-lbl').textContent = can ? (lg.stack ? `Roba ${lg.stack}` : 'Robar') : '';
  }

  function evText(ev) {
    if (!ev) return '';
    const who = ev.p === me() ? 'Tú' : esc(player(ev.p).n);
    if (ev.t === 'play') {
      const k = rankOf(ev.c);
      const extra = k === '8' ? ` y cambió a ${SUIT_NAME[ev.s].toLowerCase()}` : k === '2' ? ': ¡roba 2!' : k === 'J' ? ': ¡salta turno!' : k === 'Q' ? (lg.order.length === 2 ? ': ¡salta turno!' : ': ¡cambia el sentido!') : '';
      return `${who} ${ev.p === me() ? 'jugaste' : 'jugó'} ${cardName(ev.c)}${extra}`;
    }
    if (ev.t === 'take') return `${who} ${ev.p === me() ? 'robaste' : 'robó'} ${ev.k} cartas`;
    if (ev.t === 'draw') return `${who} ${ev.p === me() ? 'robaste' : 'robó'} una carta`;
    if (ev.t === 'pass') return `${who} ${ev.p === me() ? 'pasaste' : 'pasó'}`;
    return '';
  }

  function paintMsg() {
    if (lg.win) { msgEl.innerHTML = ''; return; }
    const cur = current(lg);
    if (myTurn()) {
      msgEl.className = 'oc-msg mine';
      msgEl.innerHTML = lg.stack
        ? `¡Te toca robar ${lg.stack}! O responde con un <b>2</b>`
        : lg.drawn
          ? 'Puedes jugar la carta que robaste o pasar'
          : 'Tu turno: mismo <b>palo</b> o mismo <b>número</b>. El <b>8</b> sirve siempre';
    } else {
      msgEl.className = 'oc-msg';
      msgEl.innerHTML = `Turno de <b style="color:${ctx.colorOf(cur)}">${esc(player(cur).n)}</b>`;
    }
    passBtn.hidden = !(myTurn() && lg.drawn && !lg.stack);
    const hand = myHand();
    meBar.innerHTML = hand
      ? `<span class="oc-mechip ${myTurn() ? 'turn' : ''}" style="--c:${ctx.colorOf(me())}"><span class="oc-av">${avatarSVG(validAvatar(player(me()).a))}</span><b>Tú</b> · ${hand.length} carta${hand.length === 1 ? '' : 's'}${lg.wins[me()] ? ` · ${icon('trophy')}${lg.wins[me()]}` : ''}</span><span class="oc-timer mine"><i></i></span>`
      : '';
  }

  function paintEnd() {
    if (!lg.win) { endEl.hidden = true; return; }
    const won = lg.win === me();
    const rk = ranking(lg);
    endEl.hidden = false;
    endEl.innerHTML = `
      <div class="oc-end-box">
        <div class="oc-end-av" style="--c:${ctx.colorOf(lg.win)}">${avatarSVG(validAvatar(player(lg.win).a))}</div>
        <h2>${icon('trophy')} ${won ? '¡Ganaste!' : `¡Ganó ${esc(player(lg.win).n)}!`}</h2>
        <ol class="oc-rank">${rk.map((id, i) => {
          const n = (lg.hands[id] || []).length;
          return `<li style="--c:${ctx.colorOf(id)}"><b>${i + 1}</b><span>${esc(player(id).n)}${id === me() ? ' (tú)' : ''}</span><small>${i === 0 ? 'sin cartas' : `${n} carta${n === 1 ? '' : 's'}`}</small><em>${icon('trophy')} ${lg.wins[id] || 0}</em></li>`;
        }).join('')}</ol>
        ${ctx.isHost()
          ? `<button class="btn big primary" id="oc-again">${icon('repeat')} Otra partida</button><button class="btn ghost" id="oc-lobby">Volver a la sala</button>`
          : '<p class="hint">Esperando al anfitrión para otra partida…</p>'}
      </div>`;
    if (ctx.isHost()) {
      $('#oc-again').onclick = () => ctx.again();
      $('#oc-lobby').onclick = () => ctx.lobby();
    }
  }

  function sounds() {
    const ev = lg.ev;
    if (ev && JSON.stringify(ev) !== JSON.stringify(lastEv)) {
      if (ev.t === 'play') {
        const k = rankOf(ev.c);
        if (k === '8') sfx.coin();
        else if (k === '2') sfx.hit(0.7);
        else if (k === 'J' || k === 'Q') sfx.whoosh();
        else sfx.click();
      } else if (ev.t === 'take') { sfx.warn(); if (ev.p === me()) buzz(200); } else if (ev.t === 'draw') sfx.land(1.5);
    }
    if (lg.win && lg.win !== lastWin) {
      if (lg.win === me()) sfx.win(); else sfx.out(0.6);
    }
  }

  function paint() {
    if (!lg) return;
    paintOpps();
    paintTable();
    paintHand();
    paintMsg();
    paintEnd();
    $('#oc-stop').hidden = !ctx.isHost() || !!lg.win;
    lastEv = lg.ev;
    lastWin = lg.win;
  }

  // reloj del turno y animación de "es tu turno"
  const iv = setInterval(() => {
    if (dead || !lg || lg.win) return;
    const f = turnLeft();
    el.querySelectorAll('.oc-opp.turn .oc-timer i, .oc-mechip.turn + .oc-timer i').forEach((i) => { i.style.transform = `scaleX(${f})`; i.classList.toggle('low', f < 0.2); });
    if (myTurn() && f < 0.2 && Date.now() - lastTick > 1000) { lastTick = Date.now(); sfx.tick(); }
    if (pending && Date.now() - pendingAt > 3000) { pending = 0; paint(); }
  }, 100);

  return {
    update(nst) {
      st = nst;
      const prevTurn = lg ? current(lg) : null;
      const prevTn = lg ? lg.tn : 0;
      lg = nst.lg;
      if (!lg) return;
      if (lg.tn !== seenTn) { seenTn = lg.tn; tnAt = Date.now(); }
      if (pending && lg.tn !== pending) pending = 0;
      if (lg.tn === prevTn && lastEv && JSON.stringify(lg.ev) === JSON.stringify(lastEv) && lg.win === lastWin && !pending) {
        // nada nuevo en el juego (p. ej. alguien se reconectó): solo los jugadores
        paintOpps();
        return;
      }
      sounds();
      if (myTurn() && prevTurn !== me()) { sfx.ready(); buzz(40); }
      paint();
    },
    destroy() { dead = true; clearInterval(iv); },
  };
}
