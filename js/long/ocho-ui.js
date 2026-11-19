// 🃏 Ocho loco — pantalla del juego. Solo dibuja el estado `st.lg` que publica
// el anfitrión y envía las jugadas con ctx.act(); las reglas están en ocho.js.
//
// Cada parte (rivales, mesa, mano, mensajes) se vuelve a dibujar solo cuando
// cambia algo que se ve (antes la barra de tiempo del que jugaba volvía a
// llenarse con cada actualización de la sala y parecía que repetía el turno).
//
// Animaciones: reparto de cartas al empezar, cartas que vuelan del mazo a quien
// roba y de la mano a la mesa, avisos grandes de los poderes (cambio de palo,
// salta, reversa, +2, "robó N cartas") y flechas entre los jugadores que
// muestran hacia dónde va el turno.
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
const SKIP_SVG = '<svg class="oc-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>';
const REV_SVG = '<svg class="oc-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 11a7.5 7.5 0 0 1 13-4.6l1.8 1.8"/><path d="M19.5 3.5v4.9h-4.9"/><path d="M19.5 13a7.5 7.5 0 0 1-13 4.6l-1.8-1.8"/><path d="M4.5 20.5v-4.9h4.9"/></svg>';
const ARROW_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h14M12 5l7 7-7 7"/></svg>';

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
    <li>Las <b>flechas</b> entre los jugadores muestran hacia dónde va el turno; <b>Sigue</b> marca a quien juega después.</li>
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

const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height });
const EASE = 'cubic-bezier(.2,.7,.3,1)';

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
        <div class="oc-dir" title="Sentido del juego"></div>
        <button class="oc-deck" aria-label="Robar carta">${backHTML()}${backHTML('b2')}${backHTML('b3')}<small class="oc-deck-n"></small><em class="oc-deck-lbl"></em></button>
        <div class="oc-disc"></div>
        <div class="oc-suit"></div>
        <div class="oc-stack" hidden></div>
        <div class="oc-toasts"></div>
      </div>
      <div class="oc-hist"></div>
      <div class="oc-msg"></div>
      <div class="oc-mebar"></div>
      <div class="oc-hand"></div>
      <div class="oc-actions"><button class="btn primary" id="oc-pass" hidden>Pasar turno</button></div>
      <div class="oc-fly"></div>
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
  const stackEl = $('.oc-stack'), dirEl = $('.oc-dir'), histEl = $('.oc-hist'), msgEl = $('.oc-msg'), toastsEl = $('.oc-toasts');
  const handEl = $('.oc-hand'), passBtn = $('#oc-pass'), pickEl = $('.oc-8'), helpEl = $('.oc-help'), endEl = $('.oc-end'), meBar = $('.oc-mebar');
  const deckN = $('.oc-deck-n'), deckLbl = $('.oc-deck-lbl'), stopBtn = $('#oc-stop'), flyEl = $('.oc-fly');

  let st = null;
  let lg = null;
  let pending = 0;          // tn de la jugada que envié y aún no se aplica
  let pendingAt = 0;
  let pick8 = null;         // carta 8 esperando que elija palo
  let seenTn = 0, tnAt = 0; // para el reloj del turno (cada teléfono mide desde que lo vio)
  let lastSig = '', lastEvKey = '', lastTurn = null, oppTurn = null;
  let sOpps = '', sDisc = '', sSuit = '', sHand = '', sMe = '', sHist = '', endKey = '', msgCur = '';
  let prevHand = [];        // mi mano antes de esta actualización (para saber qué cartas llegaron)
  let dealing = null;       // reparto en curso: { shown (mis cartas ya llegadas), opp: {id: n}, deck }
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
  const canAct = () => myTurn() && !dealing;
  const busy = () => pending && pending === lg.tn && Date.now() - pendingAt < 3000;
  const player = (id) => ((st && st.pl) || []).find((p) => p.id === id) || { id, n: '¿?', a: 'frog' };
  const name = (id) => (id === me() ? 'Tú' : esc(player(id).n));
  const nextOf = (l) => l.order[(((l.turn + l.dir) % l.order.length) + l.order.length) % l.order.length];
  const send = (a) => {
    if (!canAct() || busy()) return;
    pending = lg.tn;
    pendingAt = Date.now();
    ctx.act({ ...a, tn: lg.tn });
    paintTurn();
  };

  deckEl.onclick = () => {
    if (!canAct() || busy() || (lg.drawn && !lg.stack)) return;
    sfx.click();
    send({ t: 'draw' });
  };
  passBtn.onclick = () => { if (canAct() && lg.drawn) send({ t: 'pass' }); };
  handEl.onclick = (e) => {
    const b = e.target.closest('.pc[data-c]');
    if (!b || !canAct() || busy()) return;
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

  // ---------------------------------------------------------------- animaciones
  // carta (reverso o cara) que vuela de un punto de la pantalla a otro
  function fly(from, to, { face = null, s0 = 1, s1 = 1, delay = 0, dur = 420, done = null } = {}) {
    const c = document.createElement('div');
    c.className = 'oc-flyc';
    c.innerHTML = face ? cardHTML(face) : backHTML();
    c.style.left = `${from.x - 32}px`;
    c.style.top = `${from.y - 45}px`;
    flyEl.appendChild(c);
    const rot = (Math.random() * 2 - 1) * 24;
    const a = c.animate([
      { transform: `translate(0,0) scale(${s0}) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${(to.x - from.x) / 2}px, ${(to.y - from.y) / 2 - 30}px) scale(${(s0 + s1) / 2 * 1.08}) rotate(${rot}deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(${s1}) rotate(0deg)`, opacity: 1 },
    ], { duration: dur, delay, easing: EASE, fill: 'both' });
    a.onfinish = () => { c.remove(); if (done && !dead) done(); };
  }
  // un elemento que ya está en su sitio "llega" desde otro punto (FLIP)
  function arrive(elx, from, { s0 = 1, delay = 0, dur = 420, rot = -10 } = {}) {
    if (!elx) return;
    const to = center(elx.getBoundingClientRect());
    const end = getComputedStyle(elx).transform;
    elx.animate([
      { transform: `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${s0}) rotate(${rot}deg)`, opacity: 0.7 },
      { transform: end === 'none' ? 'none' : end, opacity: 1 },
    ], { duration: dur, delay, easing: EASE, fill: 'backwards' });
  }
  const rectOf = (x) => (x ? center(x.getBoundingClientRect()) : null);
  const oppBox = (id) => oppsEl.querySelector(`.oc-opp[data-id="${CSS.escape(id)}"]`);
  const oppSpot = (id) => { const o = oppBox(id); return o ? rectOf(o.querySelector('.oc-backs') || o) : rectOf(oppsEl); };
  const deckSpot = () => rectOf(deckEl.querySelector('.b3') || deckEl);

  // globito "+N" sobre la tarjeta de un rival
  function bubble(id, text) {
    const o = oppBox(id);
    if (!o) return;
    const b = document.createElement('span');
    b.className = 'oc-bubble';
    b.textContent = text;
    o.appendChild(b);
    later(() => b.remove(), 1300);
  }

  // aviso grande sobre la mesa (para los poderes); se crea una vez y se borra solo
  let splashEl = null;
  function splash({ who = '', art = '', title = '', sub = '', color = '#fff', cls = '' }) {
    if (splashEl) splashEl.remove();
    const s = document.createElement('div');
    s.className = `oc-splash ${cls}`;
    s.style.setProperty('--c', color);
    s.innerHTML = `${who ? `<small class="who">${who}</small>` : ''}<div class="oc-sp-art">${art}</div><b class="t">${title}</b>${sub ? `<small>${sub}</small>` : ''}`;
    tableEl.appendChild(s);
    splashEl = s;
    later(() => { s.remove(); if (splashEl === s) splashEl = null; }, 1750);
  }
  // avisos pequeños (tu turno, última carta)
  function toast(html, color, cls = '') {
    const t = document.createElement('div');
    t.className = `oc-toast ${cls}`;
    t.style.setProperty('--c', color || '#fff');
    t.innerHTML = html;
    toastsEl.appendChild(t);
    while (toastsEl.children.length > 2) toastsEl.firstChild.remove();
    later(() => t.remove(), 2300);
  }

  // ---- reparto al empezar la partida
  function startDeal() {
    const n = lg.order.length;
    const per = Math.max(...lg.order.map((id) => (lg.hands[id] || []).length));
    const seq = [];
    for (let k = 0; k < per; k++) for (let j = 0; j < n; j++) { const id = lg.order[(lg.turn + j) % n]; if ((lg.hands[id] || []).length > k) seq.push(id); }
    dealing = { shown: 0, mine: 0, opp: Object.fromEntries(lg.order.map((id) => [id, 0])), deck: lg.draw.length + seq.length + 1 };
    const step = Math.min(85, 1500 / Math.max(1, seq.length));
    seq.forEach((id, k) => later(() => dealOne(id), 300 + k * step));
    later(endDeal, 300 + seq.length * step + 480);
  }
  function dealOne(id) {
    if (!dealing) return;
    dealing.deck--;
    deckN.textContent = String(dealing.deck);
    const from = deckSpot();
    sfx.tick(0.3);
    if (id === me()) {
      // mis cartas llegan en orden de izquierda a derecha
      const idx = dealing.mine++;
      const target = handEl.querySelectorAll('.pc')[idx];
      fly(from, rectOf(target) || rectOf(handEl), { dur: 380, done: () => { if (!dealing) return; dealing.shown++; revealHand(); } });
    } else {
      fly(from, oppSpot(id), { s1: 0.3, dur: 380, done: () => { if (!dealing) return; dealing.opp[id]++; paintOpps(); } });
    }
  }
  function revealHand() {
    handEl.querySelectorAll('.pc').forEach((c, i) => c.classList.toggle('wait', !!dealing && i >= dealing.shown));
  }
  function endDeal() {
    if (!dealing) return;
    dealing = null;
    sDisc = ''; sHand = ''; sOpps = '';
    paintTurn();
    const topCard = discEl.querySelector('.pc:last-child');
    if (topCard) topCard.animate([{ transform: 'rotateY(90deg) scale(1.2)' }, { transform: 'none' }], { duration: 380, easing: EASE });
    sfx.click();
    if (!lg.win) {
      const cur = current(lg);
      toast(cur === me() ? '¡Empiezas tú!' : `Empieza <b>${name(cur)}</b>`, ctx.colorOf(cur));
    }
  }

  // ---------------------------------------------------------------- dibujo
  function turnLeft() {
    if (!lg || lg.win) return 1;
    const p = player(current(lg));
    const total = p.off ? OFF_TURN_MS : TURN_MS;
    return Math.max(0, total - (Date.now() - tnAt)) / total;
  }
  const timerHTML = (cls = '') => { const f = turnLeft(); return `<span class="oc-timer ${cls}"><i style="transform:scaleX(${f.toFixed(3)})" class="${f < 0.2 ? 'low' : ''}"></i></span>`; };
  const countOf = (id) => (dealing ? dealing.opp[id] || 0 : (lg.hands[id] || []).length);

  // rivales en orden de turno (empezando por el que va después de mí), con flechas
  // que muestran hacia dónde va el turno: de mí (abajo) al primero, entre ellos y
  // del último de vuelta a mí. Al revés si una Q cambió el sentido.
  function paintOpps() {
    const order = lg.order;
    const mi = order.indexOf(me());
    const ids = mi >= 0 ? [...order.slice(mi + 1), ...order.slice(0, mi)] : order.slice();
    const cur = lg.win ? '' : current(lg);
    const nxt = lg.win || dealing ? '' : nextOf(lg);
    const fwd = lg.dir === 1;
    const sig = JSON.stringify([cur, nxt, lg.dir, ids.map((id) => { const p = player(id); return [id, p.n, p.a, p.b, p.off, countOf(id), lg.wins[id], ctx.colorOf(id)]; })]);
    if (sig === sOpps) return;
    sOpps = sig;
    const go = cur !== oppTurn;
    oppTurn = cur;
    const m = ids.length;
    // flecha k: 0 = de mí al primero, k = entre ids[k-1] e ids[k], m = del último a mí
    // la flecha que llega a quien juega ahora se ilumina con su color
    const into = !cur ? -1 : fwd ? (cur === me() ? m : ids.indexOf(cur)) : (cur === me() ? 0 : ids.indexOf(cur) + 1);
    const arrow = (k) => {
      const rot = k === 0 ? (fwd ? -90 : 90) : k === m ? (fwd ? 90 : -90) : (fwd ? 0 : 180);
      const on = k === into;
      return `<span class="oc-flow ${on ? 'on' : ''} ${on && go ? 'go' : ''}" style="--r:${rot}deg${on ? `;--c:${ctx.colorOf(cur)}` : ''}">${ARROW_SVG}</span>`;
    };
    const cards = ids.map((id) => {
      const p = player(id);
      const n = countOf(id);
      const backs = Array.from({ length: Math.min(n, 8) }, () => '<i></i>').join('');
      return `<div class="oc-opp ${id === cur ? 'turn' : ''} ${p.off ? 'off' : ''}" data-id="${esc(id)}" style="--c:${ctx.colorOf(id)}">
          ${id === nxt ? '<span class="oc-nexttag">Sigue</span>' : ''}
          <span class="oc-av">${avatarSVG(validAvatar(p.a))}</span>
          <span class="oc-name">${esc(p.n)}${p.b ? ' <i>bot</i>' : ''}</span>
          <span class="oc-backs">${backs}</span>
          <span class="oc-n">${n} carta${n === 1 ? '' : 's'}${n === 1 && !lg.win && !dealing ? ' <em>¡Última!</em>' : ''}</span>
          ${lg.wins[id] ? `<span class="oc-w">${icon('trophy')}${lg.wins[id]}</span>` : ''}
          ${timerHTML()}
        </div>`;
    });
    let h = arrow(0);
    cards.forEach((c, k) => { h += c + (k < m - 1 ? arrow(k + 1) : ''); });
    h += arrow(m);
    oppsEl.innerHTML = h;
  }

  function paintHand() {
    const hand = myHand();
    if (!hand) {
      if (sHand !== 'x') { sHand = 'x'; handEl.innerHTML = '<p class="hint">Estás mirando la partida</p>'; }
      return;
    }
    const mine = canAct() && !busy();
    // ordenadas por palo y número para encontrarlas fácil
    const ord = (c) => SUITS.indexOf(suitOf(c)) * 20 + RANK_ORD.indexOf(rankOf(c));
    const cards = hand.slice().sort((a, b) => ord(a) - ord(b));
    const W = Math.max(240, handEl.clientWidth || 340);
    const players = lg.order.length;
    const sig = JSON.stringify([cards, mine && cards.map((c) => canPlay(lg, c)), lg.drawn, W, players, !!dealing]);
    if (sig === sHand) return;
    sHand = sig;
    const cw = 64;
    const n = cards.length;
    const gap = n > 1 ? Math.max(-44, Math.min(6, (W - 8 - cw * n) / (n - 1))) : 0;
    handEl.style.setProperty('--gap', gap + 'px');
    handEl.innerHTML = cards.map((c) => cardHTML(c, mine ? (canPlay(lg, c) ? 'ok' : 'dim') : '', power(c, players))).join('');
    if (dealing) revealHand();
  }

  function paintTable() {
    const t = top(lg);
    const under = lg.disc.length > 1 ? lg.disc[lg.disc.length - 2] : '';
    const dk = dealing ? '·' : `${under}|${t}`;
    if (dk !== sDisc) {
      sDisc = dk;
      discEl.innerHTML = dealing ? '' : (under ? cardHTML(under, 'under') : '') + cardHTML(t);
    }
    const changed = rankOf(t) === '8';
    const sk = dealing ? '·' : `${lg.suit}|${changed}`;
    if (sk !== sSuit) {
      sSuit = sk;
      suitEl.innerHTML = dealing ? '<small>Repartiendo…</small>' : `<span class="${red(lg.suit) ? 'red' : 'blk'}">${suitIcon(lg.suit)}</span><small>${changed ? 'Palo elegido' : 'Palo'}: ${SUIT_NAME[lg.suit]}</small>`;
      suitEl.classList.toggle('hot', changed && !dealing);
    }
    stackEl.hidden = !lg.stack;
    if (lg.stack && stackEl.textContent !== `+${lg.stack}`) stackEl.textContent = `+${lg.stack}`;
    const dir = `${lg.dir === 1 ? '↻' : '↺'}`;
    if (dirEl.textContent !== dir) dirEl.textContent = dir;
    const nd = String(dealing ? dealing.deck : lg.draw.length);
    if (deckN.textContent !== nd) deckN.textContent = nd;
    const can = canAct() && !busy() && (!lg.drawn || !!lg.stack);
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
    if (ev.t === 'take') return `${who} ${mine ? 'robaste' : 'robó'} <b>${ev.k}</b> carta${ev.k === 1 ? '' : 's'}`;
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
    else if (dealing) setMsg('Repartiendo las cartas…', false);
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
    passBtn.hidden = !(canAct() && lg.drawn && !lg.stack);
    if (!myTurn() && pick8) { pick8 = null; pickEl.hidden = true; }   // se le acabó el tiempo eligiendo palo
    const hand = myHand();
    const nextMe = !lg.win && !dealing && nextOf(lg) === me() && !myTurn();
    const sig = JSON.stringify([hand ? hand.length : -1, myTurn(), nextMe, lg.wins[me()], player(me()).a, ctx.colorOf(me()), !!dealing]);
    if (sig === sMe) return;
    sMe = sig;
    meBar.innerHTML = hand
      ? `<span class="oc-mechip ${myTurn() ? 'turn' : ''}" style="--c:${ctx.colorOf(me())}">${nextMe ? '<span class="oc-nexttag">Sigues tú</span>' : ''}<span class="oc-av">${avatarSVG(validAvatar(player(me()).a))}</span><b>Tú</b> · ${dealing ? '…' : `${hand.length} carta${hand.length === 1 ? '' : 's'}`}${lg.wins[me()] ? ` · ${icon('trophy')}${lg.wins[me()]}` : ''}</span>${timerHTML('mine')}`
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

  // ---- jugada nueva: animaciones, avisos y sonidos.
  //   src: dónde estaba la carta jugada antes de repintar (si fui yo, en mi mano)
  function onEvent(ev, src) {
    const two = lg.order.length === 2;
    const col = ctx.colorOf(ev.p);
    const mine = ev.p === me();
    const who = mine ? 'Tú' : name(ev.p);
    if (ev.t === 'play') {
      // la carta vuela de quien la jugó a la mesa
      const topCard = discEl.querySelector('.pc:last-child');
      const from = src || (mine ? rectOf(handEl) : oppSpot(ev.p));
      if (from) arrive(topCard, from, { s0: mine ? 1 : 0.35, rot: mine ? -14 : 14 });
      const k = rankOf(ev.c);
      if (k === '8') {
        sfx.coin();
        const was = ev.was || ev.s;
        splash({
          cls: 'suit',
          who: `${who} ${mine ? 'jugaste' : 'jugó'} un 8`,
          art: was !== ev.s
            ? `<span class="old ${red(was) ? 'red' : 'blk'}">${suitIcon(was)}</span><span class="arr">${ARROW_SVG}</span><span class="new ${red(ev.s) ? 'red' : 'blk'}">${suitIcon(ev.s)}</span>`
            : `<span class="new ${red(ev.s) ? 'red' : 'blk'}">${suitIcon(ev.s)}</span>`,
          title: '¡Cambio de palo!',
          sub: was !== ev.s ? `Ya no es <b>${SUIT_NAME[was]}</b>: ahora es <b>${SUIT_NAME[ev.s]}</b>` : `Sigue siendo <b>${SUIT_NAME[ev.s]}</b>`,
          color: col,
        });
        later(() => { suitEl.classList.remove('flash'); void suitEl.offsetWidth; suitEl.classList.add('flash'); }, 350);
        later(() => suitEl.classList.remove('flash'), 1400);   // vuelve el latido normal del palo elegido
      } else if (k === '2') {
        sfx.hit(0.7);
        splash({
          cls: 'plus',
          who: `${who} ${mine ? 'jugaste' : 'jugó'} un 2`,
          art: `<span class="num">+${ev.sum || 2}</span>`,
          title: (ev.sum || 2) > 2 ? '¡Se acumula!' : '¡Roba 2!',
          sub: ev.to === me() ? `Te toca robar ${ev.sum}… o responde con un <b>2</b>` : `${name(ev.to)} roba ${ev.sum}… o responde con un <b>2</b>`,
          color: col,
        });
        if (ev.to === me()) buzz(120);
        stackEl.classList.remove('bump'); void stackEl.offsetWidth; stackEl.classList.add('bump');
        later(() => stackEl.classList.remove('bump'), 600);
      } else if (ev.skip) {
        sfx.whoosh();
        splash({
          cls: 'skip',
          who: `${who} ${mine ? 'jugaste' : 'jugó'} ${k === 'J' ? 'una J' : 'una Q'}`,
          art: SKIP_SVG,
          title: k === 'J' ? '¡Salta!' : '¡Reversa!',
          sub: two ? (mine ? 'Vuelves a jugar' : `${name(ev.p)} juega otra vez`) : ev.skip === me() ? 'Pierdes tu turno' : `${name(ev.skip)} pierde el turno`,
          color: col,
        });
        if (ev.skip === me()) buzz(80);
        else { const o = oppBox(ev.skip); if (o) { o.classList.remove('skipped'); void o.offsetWidth; o.classList.add('skipped'); } }
      } else if (ev.rev) {
        sfx.whoosh();
        splash({
          cls: 'rev',
          who: `${who} ${mine ? 'jugaste' : 'jugó'} una Q`,
          art: REV_SVG,
          title: '¡Cambio de sentido!',
          sub: `Ahora sigue <b>${ev.next === me() ? 'tú' : name(ev.next)}</b>`,
          color: col,
        });
        dirEl.classList.remove('spin'); void dirEl.offsetWidth; dirEl.classList.add('spin');
        // las flechas entre jugadores dan la vuelta (y se quita la clase para que no se repita)
        oppsEl.classList.remove('rev'); void oppsEl.offsetWidth; oppsEl.classList.add('rev');
        later(() => oppsEl.classList.remove('rev'), 800);
      } else sfx.click();
      // ¿le queda una sola carta?
      const left = (lg.hands[ev.p] || []).length;
      if (left === 1 && !lg.win) later(() => toast(mine ? '¡Te queda <b>una</b> carta!' : `¡A <b>${name(ev.p)}</b> le queda una carta!`, col), 500);
    } else if (ev.t === 'draw' || ev.t === 'take') {
      const k = ev.t === 'take' ? ev.k : ev.k ? 1 : 0;
      const from = deckSpot();
      if (k && mine) {
        // mis cartas nuevas llegan del mazo a su lugar en la mano
        const got = (lg.hands[me()] || []).slice();
        for (const c of prevHand) { const i = got.indexOf(c); if (i >= 0) got.splice(i, 1); }
        got.forEach((c, i) => arrive(handEl.querySelector(`.pc[data-c="${c}"]`), from, { s0: 0.8, delay: i * 110, rot: 12 }));
      } else if (k) {
        for (let i = 0; i < k; i++) fly(from, oppSpot(ev.p), { s1: 0.3, delay: i * 110, dur: 400 });
        later(() => bubble(ev.p, `+${k}`), 300 + (k - 1) * 110);
      }
      if (ev.t === 'take') {
        sfx.warn();
        splash({
          cls: 'take',
          art: `<span class="fan">${backHTML()}${backHTML()}${backHTML()}</span><span class="num">+${k}</span>`,
          title: mine ? `¡Robaste ${k} cartas!` : `¡${name(ev.p)} robó ${k} cartas!`,
          sub: 'Por los +2 acumulados',
          color: col,
        });
        if (mine) buzz(200);
      } else if (k) sfx.land(1.5);
    }
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
      const first = !lg;
      lg = nlg;
      if (lg.tn !== seenTn) { seenTn = lg.tn; tnAt = Date.now(); }
      if (pending && lg.tn !== pending) pending = 0;
      const evKey = JSON.stringify([lg.ev, lg.win]);
      const fresh = evKey !== lastEvKey && lastEvKey !== '' ? lg.ev : null;
      lastEvKey = evKey;
      // partida nueva (nadie ha jugado): se ve el reparto
      if (first && !lg.ev && !(lg.hist || []).length && !lg.win) startDeal();
      else if (fresh && dealing) { dealing = null; sDisc = ''; sHand = ''; sOpps = ''; }   // ya empezaron: se acaba el reparto
      // dónde estaba la carta que jugué (antes de repintar la mano)
      const src = fresh && fresh.t === 'play' && fresh.p === me() ? rectOf(handEl.querySelector(`.pc[data-c="${fresh.c}"]`)) : null;
      paintTurn();
      paintHist();
      paintEnd();
      if (fresh) onEvent(fresh, src);
      prevHand = (myHand() || []).slice();
      // (en el anfitrión `nst.lg` es el mismo objeto que cambia: se guarda una copia del turno)
      const turnNow = lg.win ? null : current(lg);
      if (myTurn() && lastTurn !== me() && !first) {
        sfx.ready(); buzz(40);
        // si hay un aviso grande en la mesa, el de "tu turno" sale después
        const big = fresh && (fresh.t === 'take' || (fresh.t === 'play' && ['2', '8', 'J', 'Q'].includes(rankOf(fresh.c))));
        if (!dealing) later(() => { if (myTurn()) toast('¡Es tu turno!', ctx.colorOf(me()), 'myturn'); }, big ? 1100 : 250);
      }
      if (lastTurn === me() && !myTurn()) toastsEl.querySelectorAll('.myturn').forEach((t) => t.remove());   // ya jugué
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
