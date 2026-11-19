// 🃏 Ocho loco — pantalla del juego. Solo dibuja el estado `st.lg` que publica
// el anfitrión y envía las jugadas con ctx.act(); las reglas están en ocho.js.
//
// Cada parte (rivales, mesa, mano, mensajes) se vuelve a dibujar solo cuando
// cambia algo que se ve. Antes los rivales se redibujaban con cada actualización
// de la sala (varias por segundo) y la barra de tiempo del que jugaba volvía a
// llenarse: parecía que repetía el turno.
import { SUITS, SUIT_NAME, TURN_MS, OFF_TURN_MS, suitOf, rankOf, canPlay, top, current, ranking } from './ocho.js';
import { avatarSVG, validAvatar, icon } from '../icons.js';
import { endPanel, endPanelHide } from './endpanel.js';
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
const RANK_ORD = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// lo que hace cada carta especial (para la etiqueta de la mano y las reglas)
const power = (c, players) => {
  const k = rankOf(c);
  if (k === '2') return '+2';
  if (k === '8') return 'Comodín';
  if (k === 'J') return 'Salta';
  if (k === 'Q') return players === 2 ? 'Salta' : 'Reversa';
  return '';
};

export function cardHTML(c, extra = '', pow = '') {
  const s = suitOf(c), k = rankOf(c);
  return `<div class="pc ${red(s) ? 'red' : 'blk'} ${extra}" data-c="${c}">
      <span class="pc-tl"><b>${RANK_TXT[k] || k}</b>${suitIcon(s)}</span>
      <span class="pc-mid">${k === '8' ? '<b class="pc-8">8</b>' : suitIcon(s, 'sv big')}</span>
      <span class="pc-br"><b>${RANK_TXT[k] || k}</b>${suitIcon(s)}</span>
      ${pow ? `<span class="pc-pow">${pow}</span>` : ''}
    </div>`;
}
const backHTML = (extra = '') => `<div class="pc back ${extra}"><span></span></div>`;

const RANK_NAME = { A: 'As', J: 'J', Q: 'Q', K: 'K' };
const cardName = (c) => `${RANK_NAME[rankOf(c)] || rankOf(c)} de ${SUIT_NAME[suitOf(c)].toLowerCase()}`;
const mini = (c) => `<span class="oc-mini">${cardHTML(c)}</span>`;

const RULES = `
  <h3>Cómo se juega</h3>
  <p class="oc-goal">Gana quien se quede <b>sin cartas</b> primero.</p>
  <ul>
    <li>Se reparten <b>7 cartas</b> (6 si son 4 jugadores) y se voltea una al centro.</li>
    <li>En tu turno juega una carta del mismo <b>palo</b> o del mismo <b>número</b> que la del centro.</li>
    <li>Si no puedes (o no quieres), <b>roba 1</b> tocando el mazo. Si te sirve, puedes jugarla en ese turno; si no, pasa el turno.</li>
    <li>Cuando se acaba el mazo, se barajan las cartas jugadas.</li>
    <li>Tienes <b>30 s</b> por turno; si se acaban, la máquina juega por ti.</li>
  </ul>
  <h4>Cartas especiales</h4>
  <div class="oc-pow">
    <div>${mini('H8')}<p><b>8 · Comodín</b>Va sobre cualquier carta y tú eliges el palo que sigue.</p></div>
    <div>${mini('S2')}<p><b>2 · Roba 2</b>El siguiente roba 2… o responde con otro 2 y se suman (+4, +6…). Quien no tenga un 2 se come todo y pierde el turno.</p></div>
    <div>${mini('DJ')}<p><b>J · Salta</b>El siguiente jugador pierde su turno. Con 2 jugadores, vuelves a jugar.</p></div>
    <div>${mini('CQ')}<p><b>Q · Reversa</b>Cambia el sentido del juego. Con 2 jugadores funciona como la J: vuelves a jugar.</p></div>
  </div>
  <p class="oc-why"><b>¿Por qué alguien juega dos veces seguidas?</b> Porque robó una carta que le sirvió y la jugó, o porque salió una J (o una Q con 2 jugadores) y se saltó al siguiente. Abajo de la mesa se ven las últimas jugadas.</p>`;

export function mountOcho(el, ctx) {
  el.innerHTML = `
    <section class="screen ocho">
      <header class="oc-top">
        <button class="btn ghost sm" id="oc-leave">${icon('back')} Salir</button>
        <b class="oc-title">Ocho loco</b>
        <span class="oc-tools">
          <button class="btn ghost sm oc-end-btn" id="oc-stop" hidden>Terminar</button>
          <button class="mute oc-help-btn" id="oc-help" aria-label="Reglas">?</button>
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
      <div class="oc-hist"></div>
      <div class="oc-msg"></div>
      <div class="oc-mebar"></div>
      <div class="oc-hand"></div>
      <div class="oc-actions"><button class="btn primary" id="oc-pass" hidden>Pasar turno</button></div>
      <div class="oc-pick oc-8" hidden>
        <div class="oc-pick-box">
          <p>Jugaste un <b>8</b>: elige el palo que sigue</p>
          <div class="oc-pick-row">${SUITS.map((s) => `<button data-s="${s}" class="${red(s) ? 'red' : 'blk'}">${suitIcon(s)}<small>${SUIT_NAME[s]}</small></button>`).join('')}</div>
          <button class="btn ghost sm" id="oc-pick-x">Cancelar</button>
        </div>
      </div>
      <div class="oc-pick oc-help" hidden><div class="oc-pick-box oc-rules">${RULES}<button class="btn primary" id="oc-help-x">¡Entendido!</button></div></div>
      <div class="oc-end" hidden></div>
    </section>`;
  const $ = (s) => el.querySelector(s);
  const oppsEl = $('.oc-opps'), tableEl = $('.oc-table'), deckEl = $('.oc-deck'), discEl = $('.oc-disc'), suitEl = $('.oc-suit');
  const stackEl = $('.oc-stack'), dirEl = $('.oc-dir'), histEl = $('.oc-hist'), msgEl = $('.oc-msg');
  const handEl = $('.oc-hand'), passBtn = $('#oc-pass'), pickEl = $('.oc-8'), helpEl = $('.oc-help'), endEl = $('.oc-end'), meBar = $('.oc-mebar');
  const deckN = $('.oc-deck-n'), deckLbl = $('.oc-deck-lbl'), stopBtn = $('#oc-stop');

  let st = null;
  let lg = null;
  let pending = 0;          // tn de la jugada que envié y aún no se aplica
  let pendingAt = 0;
  let pick8 = null;         // carta 8 esperando que elija palo
  let seenTn = 0, tnAt = 0; // para el reloj del turno (cada teléfono mide desde que lo vio)
  let lastSig = '', lastEvKey = '', lastTurn = null;
  let sOpps = '', sDisc = '', sSuit = '', sHand = '', sMe = '', sHist = '', endKey = '', msgCur = '';
  let shownDrawn = null;    // carta robada que ya se animó
  let fresh = null;         // jugada nueva en esta actualización (para animar)
  let lastTick = 0;
  let dead = false;
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (!dead) fn(); }, ms); timers.add(t); };

  $('#oc-leave').onclick = () => ctx.leave();
  $('#oc-mute').onclick = () => { setMuted(!isMuted()); $('#oc-mute').innerHTML = icon(isMuted() ? 'soundOff' : 'soundOn'); };
  stopBtn.onclick = () => { if (confirm('¿Terminar la partida y volver a la sala?')) ctx.lobby(); };
  $('#oc-help').onclick = () => { helpEl.hidden = false; };
  helpEl.onclick = (e) => { if (e.target === helpEl || e.target.closest('#oc-help-x')) helpEl.hidden = true; };

  const me = () => ctx.me;
  const myHand = () => (lg && lg.hands[me()]) || null;
  const myTurn = () => lg && !lg.win && current(lg) === me() && !!myHand();
  const busy = () => pending && pending === lg.tn && Date.now() - pendingAt < 3000;
  const player = (id) => ((st && st.pl) || []).find((p) => p.id === id) || { id, n: '¿?', a: 'frog' };
  const name = (id) => (id === me() ? 'Tú' : esc(player(id).n));
  const send = (a) => {
    if (!myTurn() || busy()) return;
    pending = lg.tn;
    pendingAt = Date.now();
    ctx.act({ ...a, tn: lg.tn });
    paintTurn();
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
    if (!lg || lg.win) return 1;
    const p = player(current(lg));
    const total = p.off ? OFF_TURN_MS : TURN_MS;
    return Math.max(0, total - (Date.now() - tnAt)) / total;
  }
  const timerHTML = (cls = '') => { const f = turnLeft(); return `<span class="oc-timer ${cls}"><i style="transform:scaleX(${f.toFixed(3)})" class="${f < 0.2 ? 'low' : ''}"></i></span>`; };

  function paintOpps() {
    const order = lg.order;
    const mi = order.indexOf(me());
    // en orden de turno empezando por el que va después de mí
    const ids = mi >= 0 ? [...order.slice(mi + 1), ...order.slice(0, mi)] : order.slice();
    const cur = lg.win ? '' : current(lg);
    const sig = JSON.stringify([cur, ids.map((id) => { const p = player(id); return [id, p.n, p.a, p.b, p.off, (lg.hands[id] || []).length, lg.wins[id], ctx.colorOf(id)]; })]);
    if (sig === sOpps) return;
    sOpps = sig;
    oppsEl.innerHTML = ids.map((id) => {
      const p = player(id);
      const n = (lg.hands[id] || []).length;
      const backs = Array.from({ length: Math.min(n, 8) }, () => '<i></i>').join('');
      return `<div class="oc-opp ${id === cur ? 'turn' : ''} ${p.off ? 'off' : ''}" data-id="${esc(id)}" style="--c:${ctx.colorOf(id)}">
          <span class="oc-av">${avatarSVG(validAvatar(p.a))}</span>
          <span class="oc-name">${esc(p.n)}${p.b ? ' <i>bot</i>' : ''}</span>
          <span class="oc-backs">${backs}</span>
          <span class="oc-n">${n} carta${n === 1 ? '' : 's'}${n === 1 && !lg.win ? ' <em>¡Última!</em>' : ''}</span>
          ${lg.wins[id] ? `<span class="oc-w">${icon('trophy')}${lg.wins[id]}</span>` : ''}
          ${timerHTML()}
        </div>`;
    }).join('');
  }

  function paintHand() {
    const hand = myHand();
    if (!hand) {
      if (sHand !== 'x') { sHand = 'x'; handEl.innerHTML = '<p class="hint">Estás mirando la partida</p>'; }
      return;
    }
    const mine = myTurn() && !busy();
    // ordenadas por palo y número para encontrarlas fácil
    const ord = (c) => SUITS.indexOf(suitOf(c)) * 20 + RANK_ORD.indexOf(rankOf(c));
    const cards = hand.slice().sort((a, b) => ord(a) - ord(b));
    const W = Math.max(240, handEl.clientWidth || 340);
    const players = lg.order.length;
    const fresh2 = lg.drawn && lg.drawn !== shownDrawn ? lg.drawn : null;
    const sig = JSON.stringify([cards, mine && cards.map((c) => canPlay(lg, c)), lg.drawn, W, players]);
    if (sig === sHand && !fresh2) return;
    sHand = sig;
    shownDrawn = lg.drawn;
    const cw = 64;
    const n = cards.length;
    const gap = n > 1 ? Math.max(-44, Math.min(6, (W - 8 - cw * n) / (n - 1))) : 0;
    handEl.style.setProperty('--gap', gap + 'px');
    handEl.innerHTML = cards.map((c) => cardHTML(c, `${mine ? (canPlay(lg, c) ? 'ok' : 'dim') : ''} ${c === fresh2 ? 'new' : ''}`, power(c, players))).join('');
  }

  function paintTable() {
    const t = top(lg);
    const under = lg.disc.length > 1 ? lg.disc[lg.disc.length - 2] : '';
    if (`${under}|${t}` !== sDisc) {
      sDisc = `${under}|${t}`;
      const anim = fresh && fresh.t === 'play' && fresh.c === t ? (fresh.p === me() ? 'in-up' : 'in-down') : '';
      discEl.innerHTML = (under ? cardHTML(under, 'under') : '') + cardHTML(t, anim);
    }
    const changed = rankOf(t) === '8';
    if (`${lg.suit}|${changed}` !== sSuit) {
      sSuit = `${lg.suit}|${changed}`;
      suitEl.innerHTML = `<span class="${red(lg.suit) ? 'red' : 'blk'}">${suitIcon(lg.suit)}</span><small>${changed ? 'Palo elegido' : 'Palo'}: ${SUIT_NAME[lg.suit]}</small>`;
      suitEl.classList.toggle('hot', changed);
    }
    stackEl.hidden = !lg.stack;
    if (lg.stack && stackEl.textContent !== `+${lg.stack}`) stackEl.textContent = `+${lg.stack}`;
    const dir = lg.dir === 1 ? '↻' : '↺';
    if (dirEl.textContent !== dir) { dirEl.textContent = dir; dirEl.title = 'Sentido del juego'; }
    const nd = String(lg.draw.length);
    if (deckN.textContent !== nd) deckN.textContent = nd;
    const can = myTurn() && !busy() && (!lg.drawn || !!lg.stack);
    deckEl.classList.toggle('ok', can);
    const lbl = can ? (lg.stack ? `Roba ${lg.stack}` : 'Robar') : '';
    if (deckLbl.textContent !== lbl) deckLbl.textContent = lbl;
  }

  // texto de una jugada para el historial
  function evText(ev) {
    if (!ev) return '';
    const mine = ev.p === me();
    const who = name(ev.p);
    const two = lg.order.length === 2;
    if (ev.t === 'play') {
      const k = rankOf(ev.c);
      let extra = '';
      if (k === '8') extra = ` y pidió ${SUIT_NAME[ev.s].toLowerCase()}`;
      else if (k === '2' && ev.to) extra = ` · <b>+${ev.sum || 2}</b> ${ev.to === me() ? 'para ti' : `para ${name(ev.to)}`}`;
      else if (ev.skip) extra = two ? ` · <b>salta</b>: ${mine ? 'vuelves' : 'vuelve'} a jugar` : ` · <b>salta</b> a ${ev.skip === me() ? 'ti' : name(ev.skip)}`;
      else if (ev.rev) extra = ' · <b>cambia el sentido</b>';
      return `${who} ${mine ? 'jugaste' : 'jugó'} ${cardName(ev.c)}${extra}`;
    }
    if (ev.t === 'take') return `${who} ${mine ? 'te comiste' : 'se comió'} <b>${ev.k}</b> carta${ev.k === 1 ? '' : 's'}`;
    if (ev.t === 'draw') {
      if (!ev.k) return `${who} no ${mine ? 'pudiste' : 'pudo'} robar: no quedan cartas`;
      return ev.keep ? `${who} ${mine ? 'robaste' : 'robó'} una carta que sirve: ${mine ? 'sigues' : 'sigue'}` : `${who} ${mine ? 'robaste' : 'robó'} una carta y ${mine ? 'pasas' : 'pasa'}`;
    }
    if (ev.t === 'pass') return `${who} ${mine ? 'pasaste' : 'pasó'}`;
    return '';
  }

  function paintHist() {
    const list = (lg.hist && lg.hist.length ? lg.hist : lg.ev ? [lg.ev] : []).slice(-3);
    const sig = JSON.stringify([list, lg.order.length]);
    if (sig === sHist) return;
    sHist = sig;
    histEl.innerHTML = list.map((ev) => `<p><i style="--c:${ctx.colorOf(ev.p)}"></i><span>${evText(ev)}</span></p>`).join('');
  }

  function setMsg(html, mine) {
    const k = (mine ? '1' : '0') + html;
    if (k === msgCur) return;
    msgCur = k;
    msgEl.className = `oc-msg${mine ? ' mine' : ''}`;
    msgEl.innerHTML = html;
  }

  function paintMsg() {
    if (lg.win) setMsg('', false);
    else if (myTurn()) {
      setMsg(lg.stack
        ? `¡Te toca robar ${lg.stack}! O responde con un <b>2</b>`
        : lg.drawn
          ? 'Puedes jugar la carta que robaste o pasar'
          : 'Tu turno: mismo <b>palo</b> o mismo <b>número</b>. El <b>8</b> sirve siempre', true);
    } else {
      const cur = current(lg);
      setMsg(`Turno de <b style="color:${ctx.colorOf(cur)}">${esc(player(cur).n)}</b>`, false);
    }
    passBtn.hidden = !(myTurn() && lg.drawn && !lg.stack);
    if (!myTurn() && pick8) { pick8 = null; pickEl.hidden = true; }   // se le acabó el tiempo eligiendo palo
    const hand = myHand();
    const sig = JSON.stringify([hand ? hand.length : -1, myTurn(), lg.wins[me()], player(me()).a, ctx.colorOf(me())]);
    if (sig === sMe) return;
    sMe = sig;
    meBar.innerHTML = hand
      ? `<span class="oc-mechip ${myTurn() ? 'turn' : ''}" style="--c:${ctx.colorOf(me())}"><span class="oc-av">${avatarSVG(validAvatar(player(me()).a))}</span><b>Tú</b> · ${hand.length} carta${hand.length === 1 ? '' : 's'}${lg.wins[me()] ? ` · ${icon('trophy')}${lg.wins[me()]}` : ''}</span>${timerHTML('mine')}`
      : '';
  }

  function paintEnd() {
    if (!lg.win) { endKey = ''; endPanelHide(endEl); return; }
    const key = `${lg.tn}:${lg.win}`;
    if (key !== endKey) {
      endKey = key;
      const won = lg.win === me();
      const rk = ranking(lg);
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
    endPanel(endEl, key, 1800);
  }

  // aviso grande sobre la mesa (se crea una vez y se borra solo)
  let bannerEl = null;
  function banner(html, color) {
    if (bannerEl) bannerEl.remove();
    const b = document.createElement('div');
    b.className = 'oc-banner';
    b.style.setProperty('--c', color || '#fff');
    b.innerHTML = html;
    tableEl.appendChild(b);
    bannerEl = b;
    later(() => { b.remove(); if (bannerEl === b) bannerEl = null; }, 1700);
  }

  // jugada nueva: sonidos y avisos de lo que hizo la carta
  function onEvent(ev) {
    const two = lg.order.length === 2;
    const col = ctx.colorOf(ev.p);
    if (ev.t === 'play') {
      const k = rankOf(ev.c);
      if (k === '8') { sfx.coin(); banner(`<span class="${red(ev.s) ? 'red' : 'blk'}">${suitIcon(ev.s)}</span> ${SUIT_NAME[ev.s]}`, col); }
      else if (k === '2') {
        sfx.hit(0.7);
        if (ev.to) banner(ev.to === me() ? `¡+${ev.sum} para ti!` : `+${ev.sum} para ${name(ev.to)}`, col);
        if (ev.to === me()) buzz(120);
      } else if (ev.skip) {
        sfx.whoosh();
        banner(two ? (ev.p === me() ? '¡Salta! Vuelves a jugar' : `¡Salta! ${name(ev.p)} juega otra vez`) : ev.skip === me() ? '¡Te saltaron!' : `¡Salta a ${name(ev.skip)}!`, col);
        if (ev.skip === me()) buzz(80);
      } else if (ev.rev) {
        sfx.whoosh();
        banner('¡Cambio de sentido!', col);
        dirEl.classList.remove('spin'); void dirEl.offsetWidth; dirEl.classList.add('spin');
      } else sfx.click();
    } else if (ev.t === 'take') {
      sfx.warn();
      banner(ev.p === me() ? `¡Te comiste ${ev.k}!` : `${name(ev.p)} se come ${ev.k}`, col);
      if (ev.p === me()) buzz(200);
    } else if (ev.t === 'draw') sfx.land(1.5);
  }

  // lo que cambia con el turno (también al vencer una espera)
  function paintTurn() {
    if (!lg) return;
    paintOpps();
    paintTable();
    paintHand();
    paintMsg();
    stopBtn.hidden = !ctx.isHost() || !!lg.win;
  }

  function paintTimers() {
    const f = turnLeft();
    el.querySelectorAll('.oc-opp.turn .oc-timer i, .oc-mechip.turn + .oc-timer i').forEach((i) => { i.style.transform = `scaleX(${f.toFixed(3)})`; i.classList.toggle('low', f < 0.2); });
    return f;
  }

  // reloj del turno
  const iv = setInterval(() => {
    if (dead || !lg || lg.win) return;
    const f = paintTimers();
    if (myTurn() && f < 0.2 && Date.now() - lastTick > 1000) { lastTick = Date.now(); sfx.tick(); }
    if (pending && Date.now() - pendingAt > 3000) { pending = 0; paintTurn(); }
  }, 100);

  // la mano se acomoda al ancho de la pantalla (p. ej. al girar el teléfono)
  const onResize = () => { if (lg) paintHand(); };
  addEventListener('resize', onResize);

  return {
    update(nst) {
      st = nst;
      const nlg = nst.lg;
      if (!nlg) return;
      // nada cambió (llega muy seguido: cada vez que alguien de la sala actualiza su presencia)
      const sig = JSON.stringify([nlg, nst.pl]);
      if (sig === lastSig) return;
      lastSig = sig;
      lg = nlg;
      if (lg.tn !== seenTn) { seenTn = lg.tn; tnAt = Date.now(); }
      if (pending && lg.tn !== pending) pending = 0;
      const evKey = JSON.stringify([lg.ev, lg.win]);
      fresh = evKey !== lastEvKey && lastEvKey !== '' ? lg.ev : null;
      lastEvKey = evKey;
      if (fresh) onEvent(fresh);
      paintTurn();
      paintHist();
      paintEnd();
      fresh = null;
      // (en el anfitrión `nst.lg` es el mismo objeto que cambia: se guarda una copia del turno)
      const turnNow = lg.win ? null : current(lg);
      if (myTurn() && lastTurn !== me()) { sfx.ready(); buzz(40); }
      if (lg.win && lastTurn !== null) { if (lg.win === me()) sfx.win(); else sfx.out(0.6); }
      lastTurn = turnNow;
    },
    destroy() {
      dead = true;
      clearInterval(iv);
      removeEventListener('resize', onResize);
      timers.forEach((t) => clearTimeout(t));
    },
  };
}
