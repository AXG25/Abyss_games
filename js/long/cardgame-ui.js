// Pantalla común de los juegos de cartas "de descarte" (Ocho loco y Caos): juegas
// una carta que combine con la del centro, robas si no puedes, hay cartas que
// hacen robar (+2…), saltan turnos o cambian el sentido, y gana quien se quede
// sin cartas. Cada juego describe sus cartas y sus poderes en un objeto `G`
// (ver ocho-ui.js y caos-ui.js); aquí está todo lo demás:
//
//  - Se repinta solo lo que cambió (antes la barra de tiempo del que jugaba volvía
//    a llenarse con cada actualización de la sala y parecía que repetía el turno).
//  - Reparto animado al empezar, cartas que vuelan del mazo a quien roba y de la
//    mano a la mesa, avisos grandes de los poderes y avisos pequeños.
//  - Flechas entre los jugadores con el sentido del turno y la etiqueta "Sigue".
//  - Historial con las últimas 3 jugadas (lg.hist) y reglas con el botón "?".
//
// Lo que debe dar el juego (G):
//   title, cls (clases de la pantalla), css {table, deck, disc, ind, stack, hand, pick}
//   R: reglas (current, top, canPlay, ranking, TURN_MS, OFF_TURN_MS)
//   cardHTML(c, extra, hand) (con data-c) · backHTML(extra) · sortKey(c) · cardName(c)
//   rulesHTML · pick {needs(c), title, buttons} · indicator(lg) → {key, html, hot}
//   stackWord ("Roba"/"Come") · confirmTake(lg, hand) · myMsg(lg, hand) · waitExtra(lg)
//   playExtra(ev, F) → texto del historial · onPlay(ev, F) → avisos y sonidos · takeSub
import { avatarSVG, validAvatar, icon } from '../icons.js';
import { endPanel, endPanelHide } from './endpanel.js';
import { esc, buzz } from '../util.js';
import { sfx, isMuted, setMuted } from '../audio.js';
import { makeFx, oppRowHTML, rectOf, restartClass, EASE, ARROW_SVG } from './fx.js';

export { ARROW_SVG };
export const SKIP_SVG = '<svg class="oc-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>';
export const REV_SVG = '<svg class="oc-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 11a7.5 7.5 0 0 1 13-4.6l1.8 1.8"/><path d="M19.5 3.5v4.9h-4.9"/><path d="M19.5 13a7.5 7.5 0 0 1-13 4.6l-1.8-1.8"/><path d="M4.5 20.5v-4.9h4.9"/></svg>';

export function mountCardGame(el, ctx, G) {
  const { R } = G;
  const css = G.css || {};
  el.innerHTML = `
    <section class="screen ${G.cls}">
      <header class="oc-top">
        <button class="btn ghost sm" id="oc-leave">${icon('back')} Salir</button>
        <b class="oc-title">${G.title}</b>
        <span class="oc-tools">
          <button class="btn ghost sm oc-end-btn" id="oc-stop" hidden>Terminar</button>
          <button class="mute oc-help-btn" id="oc-help" aria-label="Reglas">?</button>
          <button class="mute" id="oc-mute">${icon(isMuted() ? 'soundOff' : 'soundOn')}</button>
        </span>
      </header>
      <div class="oc-opps"></div>
      <div class="oc-table ${css.table || ''}">
        <div class="oc-dir" title="Sentido del juego"></div>
        <button class="oc-deck ${css.deck || ''}" aria-label="Robar carta">${G.backHTML()}${G.backHTML('b2')}${G.backHTML('b3')}<small class="oc-deck-n"></small><em class="oc-deck-lbl"></em></button>
        <div class="oc-disc ${css.disc || ''}"></div>
        <div class="oc-suit ${css.ind || ''}"></div>
        <div class="oc-stack ${css.stack || ''}" hidden></div>
        <div class="oc-toasts"></div>
      </div>
      <div class="oc-hist"></div>
      <div class="oc-msg"></div>
      <div class="oc-mebar"></div>
      <div class="oc-hand ${css.hand || ''}"></div>
      <div class="oc-actions"><button class="btn primary" id="oc-pass" hidden>Pasar turno</button></div>
      <div class="oc-fly"></div>
      <div class="oc-pick oc-choose ${css.pick || ''}" hidden>
        <div class="oc-pick-box">
          <p>${G.pick.title}</p>
          <div class="oc-pick-row">${G.pick.buttons}</div>
          <button class="btn ghost sm" id="oc-pick-x">Cancelar</button>
        </div>
      </div>
      <div class="oc-pick oc-help" hidden><div class="oc-pick-box oc-rules">${G.rulesHTML}<button class="btn primary" id="oc-help-x">¡Entendido!</button></div></div>
      <div class="oc-end" hidden></div>
    </section>`;
  const $ = (s) => el.querySelector(s);
  const oppsEl = $('.oc-opps'), tableEl = $('.oc-table'), deckEl = $('.oc-deck'), discEl = $('.oc-disc'), suitEl = $('.oc-suit');
  const stackEl = $('.oc-stack'), dirEl = $('.oc-dir'), histEl = $('.oc-hist'), msgEl = $('.oc-msg'), toastsEl = $('.oc-toasts');
  const handEl = $('.oc-hand'), passBtn = $('#oc-pass'), pickEl = $('.oc-choose'), helpEl = $('.oc-help'), endEl = $('.oc-end'), meBar = $('.oc-mebar');
  const deckN = $('.oc-deck-n'), deckLbl = $('.oc-deck-lbl'), stopBtn = $('#oc-stop'), flyEl = $('.oc-fly');

  let st = null;
  let lg = null;
  let pending = 0;          // tn de la jugada que envié y aún no se aplica
  let pendingAt = 0;
  let pickCard = null;      // comodín esperando que elija palo / elemento
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
  const myTurn = () => lg && !lg.win && R.current(lg) === me() && !!myHand();
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
    if (G.confirmTake && !G.confirmTake(lg, myHand())) return;
    sfx.click();
    send({ t: 'draw' });
  };
  passBtn.onclick = () => { if (canAct() && lg.drawn) send({ t: 'pass' }); };
  handEl.onclick = (e) => {
    const b = e.target.closest('[data-c]');
    if (!b || !canAct() || busy()) return;
    const c = b.dataset.c;
    if (!R.canPlay(lg, c)) { b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); buzz(60); return; }
    sfx.click(0.6);
    if (G.pick.needs(c)) { pickCard = c; pickEl.hidden = false; return; }
    send({ t: 'play', c });
  };
  pickEl.onclick = (e) => {
    const b = e.target.closest('[data-s]');
    if (b && pickCard) { const c = pickCard; pickCard = null; pickEl.hidden = true; send({ t: 'play', c, s: b.dataset.s }); return; }
    if (e.target.closest('#oc-pick-x') || e.target === pickEl) { pickCard = null; pickEl.hidden = true; }
  };

  // ---------------------------------------------------------------- animaciones
  const FX = makeFx(flyEl, later);
  // carta (reverso o cara) que vuela de un punto de la pantalla a otro
  const fly = (from, to, o = {}) => FX.fly(from, to, { ...o, html: o.face ? G.cardHTML(o.face, '', false) : G.backHTML() });
  const arrive = FX.arrive;
  const oppBox = (id) => oppsEl.querySelector(`.oc-opp[data-id="${CSS.escape(id)}"]`);
  const oppSpot = (id) => { const o = oppBox(id); return o ? rectOf(o.querySelector('.oc-backs') || o) : rectOf(oppsEl); };
  const deckSpot = () => rectOf(deckEl.querySelector('.b3') || deckEl);
  const handCards = () => handEl.querySelectorAll('[data-c]');

  const bubble = (id, text) => FX.bubble(oppBox(id), text);                 // globito "+N" sobre un rival
  const splash = (spec) => FX.splash(tableEl, spec);                        // aviso grande (poderes)
  const toast = (html, color, cls = '') => FX.toast(toastsEl, html, color, cls);   // avisos pequeños
  const restart = (x, cls, ms) => { restartClass(x, cls); later(() => x.classList.remove(cls), ms); };

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
      const target = handCards()[idx];
      fly(from, rectOf(target) || rectOf(handEl), { dur: 380, done: () => { if (!dealing) return; dealing.shown++; revealHand(); } });
    } else {
      fly(from, oppSpot(id), { s1: 0.3, dur: 380, done: () => { if (!dealing) return; dealing.opp[id]++; paintOpps(); } });
    }
  }
  function revealHand() {
    handCards().forEach((c, i) => c.classList.toggle('wait', !!dealing && i >= dealing.shown));
  }
  function endDeal() {
    if (!dealing) return;
    dealing = null;
    sDisc = ''; sHand = ''; sOpps = '';
    paintTurn();
    const topCard = discEl.querySelector('[data-c]:last-child');
    if (topCard) topCard.animate([{ transform: 'rotateY(90deg) scale(1.2)' }, { transform: 'none' }], { duration: 380, easing: EASE });
    sfx.click();
    if (!lg.win) {
      const cur = R.current(lg);
      toast(cur === me() ? '¡Empiezas tú!' : `Empieza <b>${name(cur)}</b>`, ctx.colorOf(cur));
    }
  }

  // ---------------------------------------------------------------- dibujo
  function turnLeft() {
    if (!lg || lg.win) return 1;
    const p = player(R.current(lg));
    const total = p.off ? R.OFF_TURN_MS : R.TURN_MS;
    return Math.max(0, total - (Date.now() - tnAt)) / total;
  }
  const timerHTML = (cls = '') => { const f = turnLeft(); return `<span class="oc-timer ${cls}"><i style="transform:scaleX(${f.toFixed(3)})" class="${f < 0.2 ? 'low' : ''}"></i></span>`; };
  const countOf = (id) => (dealing ? dealing.opp[id] || 0 : (lg.hands[id] || []).length);

  // rivales en orden de turno (empezando por el que va después de mí), con flechas
  // que muestran hacia dónde va el turno: de mí (abajo) al primero, entre ellos y
  // del último de vuelta a mí. Al revés si se cambió el sentido.
  function paintOpps() {
    const order = lg.order;
    const mi = order.indexOf(me());
    const ids = mi >= 0 ? [...order.slice(mi + 1), ...order.slice(0, mi)] : order.slice();
    const cur = lg.win ? '' : R.current(lg);
    const nxt = lg.win || dealing ? '' : nextOf(lg);
    const fwd = lg.dir === 1;
    const sig = JSON.stringify([cur, nxt, lg.dir, ids.map((id) => { const p = player(id); return [id, p.n, p.a, p.b, p.off, countOf(id), lg.wins[id], ctx.colorOf(id)]; })]);
    if (sig === sOpps) return;
    sOpps = sig;
    const go = cur !== oppTurn;
    oppTurn = cur;
    oppsEl.innerHTML = oppRowHTML({
      order, me: me(), cur, next: nxt, fwd, go, colorOf: ctx.colorOf, timer: timerHTML(),
      opp: (id) => {
        const p = player(id), n = countOf(id);
        return { name: p.n, a: p.a, b: p.b, off: p.off, n, backsCls: css.backs, wins: lg.wins[id], extra: n === 1 && !lg.win && !dealing ? ' <em>¡Última!</em>' : '' };
      },
    });
  }

  function paintHand() {
    const hand = myHand();
    if (!hand) {
      if (sHand !== 'x') { sHand = 'x'; handEl.innerHTML = '<p class="hint">Estás mirando la partida</p>'; }
      return;
    }
    const mine = canAct() && !busy();
    const cards = hand.slice().sort((a, b) => G.sortKey(a) - G.sortKey(b));
    const W = Math.max(240, handEl.clientWidth || 340);
    const sig = JSON.stringify([cards, mine && cards.map((c) => R.canPlay(lg, c)), lg.drawn, W, lg.order.length, !!dealing]);
    if (sig === sHand) return;
    sHand = sig;
    const n = cards.length;
    const gap = n > 1 ? Math.max(-46, Math.min(6, (W - 8 - 64 * n) / (n - 1))) : 0;
    handEl.style.setProperty('--gap', gap + 'px');
    handEl.innerHTML = cards.map((c) => G.cardHTML(c, mine ? (R.canPlay(lg, c) ? 'ok' : 'dim') : '', true, lg.order.length)).join('');
    if (dealing) revealHand();
  }

  function paintTable() {
    const t = R.top(lg);
    const under = lg.disc.length > 1 ? lg.disc[lg.disc.length - 2] : '';
    const dk = dealing ? '·' : `${under}|${t}`;
    if (dk !== sDisc) {
      sDisc = dk;
      discEl.innerHTML = dealing ? '' : (under ? G.cardHTML(under, 'under', false) : '') + G.cardHTML(t, '', false);
    }
    const ind = dealing ? { key: '·', html: '<small>Repartiendo…</small>', hot: false } : G.indicator(lg);
    if (ind.key !== sSuit) {
      sSuit = ind.key;
      suitEl.innerHTML = ind.html;
      suitEl.classList.toggle('hot', !!ind.hot);
    }
    stackEl.hidden = !lg.stack;
    if (lg.stack && stackEl.textContent !== `+${lg.stack}`) stackEl.textContent = `+${lg.stack}`;
    const dir = `${lg.dir === 1 ? '↻' : '↺'}`;
    if (dirEl.textContent !== dir) dirEl.textContent = dir;
    const nd = String(dealing ? dealing.deck : lg.draw.length);
    if (deckN.textContent !== nd) deckN.textContent = nd;
    const can = canAct() && !busy() && (!lg.drawn || !!lg.stack);
    deckEl.classList.toggle('ok', can);
    const lbl = can ? (lg.stack ? `${G.stackWord} ${lg.stack}` : 'Robar') : '';
    if (deckLbl.textContent !== lbl) deckLbl.textContent = lbl;
  }

  // lo que se le pasa al juego para sus textos y avisos
  const helpers = (ev) => {
    const mine = ev.p === me();
    return {
      mine, two: lg.order.length === 2, me: me(), name, who: mine ? 'Tú' : name(ev.p), col: ctx.colorOf(ev.p),
      splash, toast, sfx, buzz,
      suitFlash: () => later(() => restart(suitEl, 'flash', 1050), 350),
      stackBump: () => restart(stackEl, 'bump', 600),
      skipShake: (id) => { const o = oppBox(id); if (o) restart(o, 'skipped', 900); },
      revSpin: () => { restart(dirEl, 'spin', 700); restart(oppsEl, 'rev', 800); },   // las flechas dan la vuelta
    };
  };

  // texto de una jugada para el historial
  function evText(ev) {
    if (!ev) return '';
    const F = helpers(ev);
    const { mine, who } = F;
    if (ev.t === 'play') return `${who} ${mine ? 'jugaste' : 'jugó'} ${G.cardName(ev.c)}${G.playExtra(ev, F)}`;
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
    else if (myTurn()) setMsg(G.myMsg(lg, myHand()), true);
    else {
      const cur = R.current(lg);
      setMsg(`Turno de <b style="color:${ctx.colorOf(cur)}">${esc(player(cur).n)}</b>${G.waitExtra ? G.waitExtra(lg) : ''}`, false);
    }
    passBtn.hidden = !(canAct() && lg.drawn && !lg.stack);
    if (!myTurn() && pickCard) { pickCard = null; pickEl.hidden = true; }   // se le acabó el tiempo eligiendo
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
      endEl.innerHTML = `
        <div class="oc-end-box">
          <div class="oc-end-av" style="--c:${ctx.colorOf(lg.win)}">${avatarSVG(validAvatar(player(lg.win).a))}</div>
          <h2>${icon('trophy')} ${won ? '¡Ganaste!' : `¡Ganó ${esc(player(lg.win).n)}!`}</h2>
          <ol class="oc-rank">${R.ranking(lg).map((id, i) => {
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
    const F = helpers(ev);
    const { mine, col } = F;
    if (ev.t === 'play') {
      // la carta vuela de quien la jugó a la mesa
      const topCard = discEl.querySelector('[data-c]:last-child');
      const from = src || (mine ? rectOf(handEl) : oppSpot(ev.p));
      if (from) arrive(topCard, from, { s0: mine ? 1 : 0.35, rot: mine ? -14 : 14 });
      G.onPlay(ev, F);
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
        got.forEach((c, i) => arrive(handEl.querySelector(`[data-c="${CSS.escape(c)}"]`), from, { s0: 0.8, delay: i * 110, rot: 12 }));
      } else if (k) {
        for (let i = 0; i < k; i++) fly(from, oppSpot(ev.p), { s1: 0.3, delay: i * 110, dur: 400 });
        later(() => bubble(ev.p, `+${k}`), 300 + (k - 1) * 110);
      }
      if (ev.t === 'take') {
        if (G.onTake) G.onTake(ev, F); else sfx.warn();
        splash({
          cls: 'take',
          art: `<span class="fan">${G.backHTML()}${G.backHTML()}${G.backHTML()}</span><span class="num">+${k}</span>`,
          title: mine ? `¡Robaste ${k} cartas!` : `¡${name(ev.p)} robó ${k} cartas!`,
          sub: G.takeSub,
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
      const src = fresh && fresh.t === 'play' && fresh.p === me() ? rectOf(handEl.querySelector(`[data-c="${CSS.escape(fresh.c)}"]`)) : null;
      paintTurn();
      paintHist();
      paintEnd();
      if (fresh) onEvent(fresh, src);
      prevHand = (myHand() || []).slice();
      // (en el anfitrión `nst.lg` es el mismo objeto que cambia: se guarda una copia del turno)
      const turnNow = lg.win ? null : R.current(lg);
      if (myTurn() && lastTurn !== me() && !first) {
        sfx.ready(); buzz(40);
        // si hay un aviso grande en la mesa, el de "tu turno" sale después
        const big = fresh && (fresh.t === 'take' || (fresh.t === 'play' && G.isPower(fresh.c)));
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
