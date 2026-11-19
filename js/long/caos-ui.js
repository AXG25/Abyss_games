// 🌪️ Caos — pantalla. Cartas propias de 4 elementos; dibuja el estado del
// anfitrión y envía las jugadas. Las reglas están en caos.js.
import { ELEMS, ELEM_NAME, TURN_MS, OFF_TURN_MS, elemOf, kindOf, canPlay, top, current, ranking } from './caos.js';
import { avatarSVG, validAvatar, icon } from '../icons.js';
import { endPanel, endPanelHide } from './endpanel.js';
import { esc, buzz } from '../util.js';
import { sfx, isMuted, setMuted } from '../audio.js';

export const ELEM_COLOR = { f: '#ff6b2c', a: '#1e9bff', p: '#3fbf4f', r: '#9b4dff' };
const ELEM_ICON = {
  f: '<path d="M12 2.5c1.2 3.6 5.5 5.8 5.5 10.6a5.5 5.5 0 0 1-11 0c0-2.8 1.8-4.2 2.3-6.6 1 1 1.8 2.3 1.9 3.9 1.3-2.3 1.6-5 1.3-7.9z"/>',
  a: '<path d="M12 2.5s6.8 7.6 6.8 12.3a6.8 6.8 0 0 1-13.6 0C5.2 10.1 12 2.5 12 2.5z"/>',
  p: '<path d="M4.5 19.5C4.5 10 10.5 4.5 20 4.5c0 9.5-5.5 15-15.5 15z"/><path d="M5 19L13.5 10.5" class="cut"/>',
  r: '<path d="M13.5 2L4.5 13.6h6.6L9.8 22l9.7-12.3h-6.8z"/>',
};
const elemIcon = (e, cls = 'ce-i') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ELEM_ICON[e] || ''}</svg>`;
const wheel = () => `<svg class="ca-wheel" viewBox="0 0 40 40">${ELEMS.map((e, i) => {
  const a0 = (i * Math.PI) / 2 - Math.PI / 2, a1 = a0 + Math.PI / 2;
  const p = (a) => `${20 + Math.cos(a) * 17} ${20 + Math.sin(a) * 17}`;
  return `<path d="M20 20L${p(a0)}A17 17 0 0 1 ${p(a1)}z" fill="${ELEM_COLOR[e]}"/>`;
}).join('')}<circle cx="20" cy="20" r="17" fill="none" stroke="#fff" stroke-width="2.5"/></svg>`;
const ICON_S = '<circle cx="12" cy="12" r="8.2"/><path d="M6.4 17.6L17.6 6.4"/>';
const ICON_G = '<path d="M4.5 9h12.5l-3.5-3.5M19.5 15H7l3.5 3.5"/>';
const ACTION_SVG = {
  S: `<svg class="ca-act" viewBox="0 0 24 24">${ICON_S}</svg>`,
  G: `<svg class="ca-act" viewBox="0 0 24 24">${ICON_G}</svg>`,
};
// nombre corto que va escrito en la carta
const LABEL = { S: 'Bloqueo', G: 'Dirección', X: 'Elemento', D: 'Roba 2', Y: 'Roba 4' };
// esquinas: el número o un mini icono de la acción
const cornerTxt = (k) => (/^[0-9]$/.test(k) ? k
  : k === 'S' ? `<svg class="ca-ci" viewBox="0 0 24 24">${ICON_S}</svg>`
    : k === 'G' ? `<svg class="ca-ci" viewBox="0 0 24 24">${ICON_G}</svg>`
      : k === 'X' ? '<i class="ca-cw"></i>' : k === 'D' ? '+2' : '+4');

export function cardHTML(c, extra = '') {
  const e = elemOf(c), k = kindOf(c);
  const wild = !e;
  const mid = /^[0-9]$/.test(k) ? `<b class="ca-num">${k}</b>`
    : ACTION_SVG[k] || (k === 'D' ? '<b class="ca-num sm">+2</b>' : k === 'Y' ? `${wheel()}<b class="ca-num sm over">+4</b>` : wheel());
  return `<div class="ca ${wild ? 'wild' : ''} ${extra}" data-c="${c}" style="--e:${wild ? '#2a1d52' : ELEM_COLOR[e]}">
      <span class="ca-tl">${cornerTxt(k)}</span>
      ${e ? elemIcon(e, 'ce-i ca-el') : ''}
      <span class="ca-mid">${mid}</span>
      ${LABEL[k] ? `<span class="ca-lbl">${LABEL[k]}</span>` : ''}
      <span class="ca-br">${cornerTxt(k)}</span>
    </div>`;
}
const backHTML = (extra = '') => `<div class="ca back ${extra}"><span>CAOS</span></div>`;
const KIND_NAME = { S: 'bloqueo', G: 'cambio de dirección', D: '+2', X: 'cambio de elemento', Y: '+4' };
const cardName = (c) => {
  const e = elemOf(c), k = kindOf(c);
  if (!e) return KIND_NAME[k];
  return `${/^[0-9]$/.test(k) ? k : KIND_NAME[k]} de ${ELEM_NAME[e].toLowerCase()}`;
};

const RULES = `
  <h3>Cómo se juega</h3>
  <ul>
    <li>Cartas de 4 elementos: <b>fuego</b>, <b>agua</b>, <b>planta</b> y <b>rayo</b>. Cada uno recibe <b>7</b>.</li>
    <li>Juega una carta del mismo <b>elemento</b> o del mismo <b>número/acción</b> que la del centro.</li>
    <li><b>Bloqueo</b> (⊘): el siguiente jugador pierde su turno.</li>
    <li><b>Dirección</b> (⇄): cambia el sentido del juego (con 2 jugadores funciona como bloqueo).</li>
    <li><b>Elemento</b> (rueda de colores) y <b>+4</b>: van sobre cualquier carta y eliges el elemento que sigue.</li>
    <li><b>¡Los +2 y +4 se suman!</b> Si te tiran uno, responde con otro +2 o +4 (de cualquier elemento) y el castigo crece. Quien no pueda responder <b>se come todo lo acumulado</b> y pierde el turno.</li>
    <li>Si no tienes jugada, robas 1: si sirve la puedes tirar, si no pasas.</li>
    <li>Gana quien se quede <b>sin cartas</b>. Tienes 30 s por turno.</li>
  </ul>`;

export function mountCaos(el, ctx) {
  el.innerHTML = `
    <section class="screen ocho caos">
      <header class="oc-top">
        <button class="btn ghost sm" id="ca-leave">${icon('back')} Salir</button>
        <b class="oc-title">Caos</b>
        <span class="oc-tools">
          <button class="btn ghost sm oc-end-btn" id="ca-stop" hidden>Terminar</button>
          <button class="mute" id="ca-help" aria-label="Reglas">?</button>
          <button class="mute" id="ca-mute">${icon(isMuted() ? 'soundOff' : 'soundOn')}</button>
        </span>
      </header>
      <div class="oc-opps"></div>
      <div class="oc-table ca-table">
        <div class="oc-dir"></div>
        <button class="oc-deck ca-deck" aria-label="Robar carta">${backHTML()}${backHTML('b2')}${backHTML('b3')}<small class="oc-deck-n"></small><em class="oc-deck-lbl"></em></button>
        <div class="oc-disc ca-disc"></div>
        <div class="oc-suit ca-elem"></div>
        <div class="oc-stack ca-stack" hidden></div>
      </div>
      <div class="oc-log"></div>
      <div class="oc-msg"></div>
      <div class="oc-mebar"></div>
      <div class="oc-hand ca-hand"></div>
      <div class="oc-actions"><button class="btn primary" id="ca-pass" hidden>Pasar turno</button></div>
      <div class="oc-pick ca-pick" hidden>
        <div class="oc-pick-box">
          <p>Elige el <b>elemento</b> que sigue</p>
          <div class="oc-pick-row">${ELEMS.map((e) => `<button data-s="${e}" style="--e:${ELEM_COLOR[e]}">${elemIcon(e)}<small>${ELEM_NAME[e]}</small></button>`).join('')}</div>
          <button class="btn ghost sm" id="ca-pick-x">Cancelar</button>
        </div>
      </div>
      <div class="oc-pick ca-help" hidden><div class="oc-pick-box pq-rules">${RULES}<button class="btn primary" id="ca-help-x">¡Entendido!</button></div></div>
      <div class="oc-end" hidden></div>
    </section>`;
  const $ = (s) => el.querySelector(s);
  const oppsEl = $('.oc-opps'), deckEl = $('.ca-deck'), discEl = $('.ca-disc'), elemEl = $('.ca-elem');
  const stackEl = $('.ca-stack'), dirEl = $('.oc-dir'), logEl = $('.oc-log'), msgEl = $('.oc-msg');
  const handEl = $('.ca-hand'), passBtn = $('#ca-pass'), pickEl = $('.ca-pick'), endEl = $('.oc-end'), meBar = $('.oc-mebar'), helpEl = $('.ca-help');

  let st = null, lg = null;
  let pending = 0, pendingAt = 0;
  let pickCard = null;
  let seenTn = 0, tnAt = 0;
  let lastEvKey = '';
  let lastTick = 0;
  let dead = false;

  $('#ca-leave').onclick = () => ctx.leave();
  $('#ca-mute').onclick = () => { setMuted(!isMuted()); $('#ca-mute').innerHTML = icon(isMuted() ? 'soundOff' : 'soundOn'); };
  $('#ca-stop').onclick = () => { if (confirm('¿Terminar la partida y volver a la sala?')) ctx.lobby(); };
  $('#ca-help').onclick = () => { helpEl.hidden = false; };
  helpEl.onclick = (e) => { if (e.target === helpEl || e.target.closest('#ca-help-x')) helpEl.hidden = true; };

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
    if (lg.stack && myHand().some((c) => canPlay(lg, c)) && !confirm(`¿Comerte las ${lg.stack} cartas? Todavía puedes responder con un +2 o +4.`)) return;
    sfx.click();
    send({ t: 'draw' });
  };
  passBtn.onclick = () => { if (myTurn() && lg.drawn) send({ t: 'pass' }); };
  handEl.onclick = (e) => {
    const b = e.target.closest('.ca[data-c]');
    if (!b || !myTurn() || busy()) return;
    const c = b.dataset.c;
    if (!canPlay(lg, c)) { b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); buzz(60); return; }
    if (!elemOf(c)) { pickCard = c; pickEl.hidden = false; return; }
    send({ t: 'play', c });
  };
  pickEl.onclick = (e) => {
    const b = e.target.closest('[data-s]');
    if (b && pickCard) { const c = pickCard; pickCard = null; pickEl.hidden = true; send({ t: 'play', c, s: b.dataset.s }); return; }
    if (e.target.closest('#ca-pick-x') || e.target === pickEl) { pickCard = null; pickEl.hidden = true; }
  };

  function paintOpps() {
    const order = lg.order;
    const mi = order.indexOf(me());
    const ids = mi >= 0 ? [...order.slice(mi + 1), ...order.slice(0, mi)] : order.slice();
    const cur = current(lg);
    oppsEl.innerHTML = ids.map((id) => {
      const p = player(id);
      const n = (lg.hands[id] || []).length;
      return `<div class="oc-opp ${id === cur && !lg.win ? 'turn' : ''} ${p.off ? 'off' : ''}" style="--c:${ctx.colorOf(id)}">
          <span class="oc-av">${avatarSVG(validAvatar(p.a))}</span>
          <span class="oc-name">${esc(p.n)}${p.b ? ' <i>bot</i>' : ''}</span>
          <span class="oc-backs ca-backs">${'<i></i>'.repeat(Math.min(n, 8))}</span>
          <span class="oc-n">${n} carta${n === 1 ? '' : 's'}${n === 1 && !lg.win ? ' <em>¡Última!</em>' : ''}</span>
          ${lg.wins[id] ? `<span class="oc-w">${icon('trophy')}${lg.wins[id]}</span>` : ''}
          <span class="oc-timer"><i></i></span>
        </div>`;
    }).join('');
  }

  function paintTable() {
    const t = top(lg);
    const ev = lg.ev;
    const fresh = ev && ev.t === 'play' && JSON.stringify(ev) !== lastEvKey;
    discEl.innerHTML = (lg.disc.length > 1 ? cardHTML(lg.disc[lg.disc.length - 2], 'under') : '') + cardHTML(t, fresh ? (ev.p === me() ? 'in-up' : 'in-down') : '');
    elemEl.innerHTML = `<span style="background:${ELEM_COLOR[lg.elem]}">${elemIcon(lg.elem)}</span><small>${!elemOf(t) ? 'Elegido' : 'Elemento'}: ${ELEM_NAME[lg.elem]}</small>`;
    elemEl.classList.toggle('hot', !elemOf(t));
    stackEl.hidden = !lg.stack;
    stackEl.textContent = `+${lg.stack}`;
    dirEl.innerHTML = lg.dir === 1 ? '↻' : '↺';
    $('.oc-deck-n').textContent = lg.draw.length;
    const can = myTurn() && !busy() && (!lg.drawn || lg.stack);
    deckEl.classList.toggle('ok', can);
    $('.oc-deck-lbl').textContent = can ? (lg.stack ? `Comer ${lg.stack}` : 'Robar') : '';
  }

  function paintHand() {
    const hand = myHand();
    if (!hand) { handEl.innerHTML = '<p class="hint">Estás mirando la partida</p>'; return; }
    const mine = myTurn() && !busy();
    const ord = (c) => { const e = elemOf(c); const k = kindOf(c); return (e ? ELEMS.indexOf(e) : 4) * 20 + (/^[0-9]$/.test(k) ? +k : 10 + 'SGDXY'.indexOf(k)); };
    const cards = hand.slice().sort((a, b) => ord(a) - ord(b));
    const W = Math.max(240, handEl.clientWidth || 340);
    const n = cards.length;
    const gap = n > 1 ? Math.max(-46, Math.min(6, (W - 8 - 64 * n) / (n - 1))) : 0;
    handEl.style.setProperty('--gap', gap + 'px');
    handEl.innerHTML = cards.map((c) => cardHTML(c, `${mine ? (canPlay(lg, c) ? 'ok' : 'dim') : ''} ${c === lg.drawn ? 'new' : ''}`)).join('');
  }

  function evText(ev) {
    if (!ev) return '';
    const mine = ev.p === me();
    const who = mine ? 'Tú' : esc(player(ev.p).n);
    if (ev.t === 'play') {
      const k = kindOf(ev.c);
      const blk = ev.skip ? ` · ¡${ev.skip === me() ? 'te bloqueó el turno' : `bloqueó a ${esc(player(ev.skip).n)}`}!` : '';
      const extra = k === 'D' || k === 'Y' ? ` · ¡van +${ev.stack}!` : k === 'G' && !ev.skip ? ' · ¡cambia la dirección!' : blk;
      const choose = !elemOf(ev.c) ? ` y ${mine ? 'elegiste' : 'eligió'} ${ELEM_NAME[ev.s].toLowerCase()}` : '';
      return `${who} ${mine ? 'jugaste' : 'jugó'} ${cardName(ev.c)}${choose}${extra}`;
    }
    if (ev.t === 'take') return `¡${who} ${mine ? 'te comiste' : 'se comió'} ${ev.k} cartas!`;
    if (ev.t === 'draw') return `${who} ${mine ? 'robaste' : 'robó'} una carta`;
    if (ev.t === 'pass') return `${who} ${mine ? 'pasaste' : 'pasó'}`;
    return '';
  }

  function paintMsg() {
    if (lg.win) { msgEl.innerHTML = ''; meBar.innerHTML = ''; passBtn.hidden = true; return; }
    const cur = current(lg);
    if (myTurn()) {
      msgEl.className = 'oc-msg mine';
      const canStack = lg.stack && myHand().some((c) => canPlay(lg, c));
      msgEl.innerHTML = lg.stack
        ? (canStack ? `¡Te tiran <b>+${lg.stack}</b>! Responde con un <b>+2</b> o <b>+4</b>, o cómete todo` : `¡Te tiran <b>+${lg.stack}</b>! No tienes con qué responder: toca el mazo`)
        : lg.drawn ? 'Puedes jugar la carta que robaste o pasar'
          : 'Tu turno: mismo <b>elemento</b> o mismo <b>número</b>';
    } else {
      msgEl.className = 'oc-msg';
      msgEl.innerHTML = `Turno de <b style="color:${ctx.colorOf(cur)}">${esc(player(cur).n)}</b>${lg.stack ? ` · <b class="ca-warn">van +${lg.stack}</b>` : ''}`;
    }
    passBtn.hidden = !(myTurn() && lg.drawn && !lg.stack);
    const hand = myHand();
    meBar.innerHTML = hand
      ? `<span class="oc-mechip ${myTurn() ? 'turn' : ''}" style="--c:${ctx.colorOf(me())}"><span class="oc-av">${avatarSVG(validAvatar(player(me()).a))}</span><b>Tú</b> · ${hand.length} carta${hand.length === 1 ? '' : 's'}${lg.wins[me()] ? ` · ${icon('trophy')}${lg.wins[me()]}` : ''}</span><span class="oc-timer mine"><i></i></span>`
      : '';
  }

  function paintEnd() {
    if (!lg.win) { endPanelHide(endEl); return; }
    const won = lg.win === me();
    
    endEl.innerHTML = `
      <div class="oc-end-box">
        <div class="oc-end-av" style="--c:${ctx.colorOf(lg.win)}">${avatarSVG(validAvatar(player(lg.win).a))}</div>
        <h2>${icon('trophy')} ${won ? '¡Ganaste!' : `¡Ganó ${esc(player(lg.win).n)}!`}</h2>
        <ol class="oc-rank">${ranking(lg).map((id, i) => {
          const n = (lg.hands[id] || []).length;
          return `<li style="--c:${ctx.colorOf(id)}"><b>${i + 1}</b><span>${esc(player(id).n)}${id === me() ? ' (tú)' : ''}</span><small>${i === 0 ? 'sin cartas' : `${n} carta${n === 1 ? '' : 's'}`}</small><em>${icon('trophy')} ${lg.wins[id] || 0}</em></li>`;
        }).join('')}</ol>
        ${ctx.isHost()
          ? `<button class="btn big primary" id="ca-again">${icon('repeat')} Otra partida</button><button class="btn ghost" id="ca-lobby">Volver a la sala</button>`
          : '<p class="hint">Esperando al anfitrión para otra partida…</p>'}
      </div>`;
    if (ctx.isHost()) { $('#ca-again').onclick = () => ctx.again(); $('#ca-lobby').onclick = () => ctx.lobby(); }
    endPanel(endEl, `${lg.tn}:${lg.win}`, 1800);
  }

  function sounds() {
    const ev = lg.ev;
    if (!ev) return;
    const k = kindOf(ev.c || '');
    if (ev.t === 'play') {
      if (k === 'Y' || k === 'D') { sfx.hit(0.6 + Math.min(1, ev.stack / 12)); if (ev.stack >= 6) sfx.warn(); }
      else if (k === 'X') sfx.coin();
      else if (k === 'S' || k === 'G') sfx.whoosh();
      else sfx.click();
    } else if (ev.t === 'take') { sfx.boom(Math.min(1, 0.3 + ev.k / 16)); if (ev.p === me()) buzz(300); }
    else if (ev.t === 'draw') sfx.land(1.5);
  }

  function paint() {
    if (!lg) return;
    paintOpps();
    paintTable();
    paintHand();
    paintMsg();
    paintEnd();
    logEl.innerHTML = evText(lg.ev);
    $('#ca-stop').hidden = !ctx.isHost() || !!lg.win;
  }

  const iv = setInterval(() => {
    if (dead || !lg || lg.win) return;
    const p = player(current(lg));
    const total = p.off ? OFF_TURN_MS : TURN_MS;
    const f = Math.max(0, total - (Date.now() - tnAt)) / total;
    el.querySelectorAll('.oc-opp.turn .oc-timer i, .oc-mechip.turn + .oc-timer i').forEach((i) => { i.style.transform = `scaleX(${f})`; i.classList.toggle('low', f < 0.2); });
    if (myTurn() && f < 0.2 && Date.now() - lastTick > 1000) { lastTick = Date.now(); sfx.tick(); }
    if (pending && Date.now() - pendingAt > 3000) { pending = 0; paint(); }
  }, 100);

  return {
    update(nst) {
      const prevTurn = lg ? current(lg) : null;
      st = nst;
      lg = nst.lg;
      if (!lg) return;
      if (lg.tn !== seenTn) { seenTn = lg.tn; tnAt = Date.now(); }
      if (pending && lg.tn !== pending) pending = 0;
      const key = JSON.stringify(lg.ev);
      const isNew = key !== lastEvKey;
      if (isNew && lastEvKey !== '') sounds();
      if (lg.win && isNew && lastEvKey !== '') setTimeout(() => { if (lg.win === me()) sfx.win(); else sfx.out(0.6); }, 400);
      if (myTurn() && prevTurn !== me()) { sfx.ready(); buzz(lg.stack ? 120 : 40); }
      paint();
      lastEvKey = key;
    },
    destroy() { dead = true; clearInterval(iv); },
  };
}
