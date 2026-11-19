// 🎲 Parqués — pantalla. Tablero en SVG (cruz de 19×19 casillas), girado para
// que tu cárcel quede abajo. Dibuja el estado del anfitrión y envía las jugadas.
//
// Sin parpadeo: el tablero fijo es un <svg> aparte que se dibuja una sola vez y
// en cada actualización solo se toca lo que cambió (nada se vuelve a crear, así
// ninguna animación vuelve a empezar). Las fichas son peones que saltan casilla
// por casilla (requestAnimationFrame) y los dados son cubos 3D de CSS.
import { HOME, LAST_TRACK, TURN_MS, OFF_TURN_MS, current, absOf, onTrack, canMove, whyNot, allOut, exitCount } from './parques.js';
import { avatarSVG, validAvatar, icon } from '../icons.js';
import { endPanel, endPanelHide } from './endpanel.js';
import { esc, buzz } from '../util.js';
import { sfx, isMuted, setMuted } from '../audio.js';

const NS = 'http://www.w3.org/2000/svg';
const f = (n) => Math.round(n * 1000) / 1000;

// ---- geometría (unidades = casillas; centro del tablero en 9.5, 9.5)
// rotP gira k cuartos de vuelta alrededor del centro (en pantalla, contra las manecillas)
const rotP = (x, y, k) => { k = ((k % 4) + 4) % 4; for (let i = 0; i < k; i++) [x, y] = [y, 19 - x]; return [x, y]; };
// lado del asiento 0 (brazo de abajo): baja por la izquierda, cruza y sube por la derecha
const baseTrack = (i) => (i < 8 ? [8.5, 11.5 + i] : i === 8 ? [9.5, 18.5] : [10.5, 18.5 - (i - 9)]);
const JC = 15;   // centro de la cárcel del asiento 0 (esquina de abajo a la derecha)

// ---- colores
const hex = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#6c5f96');
const mix = (c, d, a) => {
  const A = [1, 3, 5].map((k) => parseInt(hex(c).slice(k, k + 2), 16)), B = [1, 3, 5].map((k) => parseInt(d.slice(k, k + 2), 16));
  return '#' + A.map((v, k) => Math.round(v * (1 - a) + B[k] * a).toString(16).padStart(2, '0')).join('');
};
const tint = (c, a) => mix(c, '#ffffff', a);
const shade = (c, a) => mix(c, '#000000', a);
const GREY = '#6c5f96';

// ---- formas
const STAR = (() => { let d = ''; for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 0.45 : 1; d += (k ? 'L' : 'M') + f(Math.cos(a) * r) + ' ' + f(Math.sin(a) * r); } return d + 'Z'; })();
const star = (x, y, r, fill, stroke) => `<path d="${STAR}" transform="translate(${f(x)} ${f(y)}) scale(${r})" fill="${fill}" stroke="${stroke}" stroke-width="${f(0.05 / r)}" stroke-linejoin="round"/>`;
const chevron = (x, y, k, color) => `<path d="M-.2 .1L0-.1L.2 .1" transform="translate(${f(x)} ${f(y)}) rotate(${-90 * k})" fill="none" stroke="${color}" stroke-width=".09" stroke-linecap="round" stroke-linejoin="round"/>`;
// casilla con relieve: sombra corrida hacia abajo + cara
const cell = (x, y, fill) => `<rect x="${f(x - 0.46)}" y="${f(y - 0.39)}" width=".92" height=".92" rx=".17" fill="#0b0520" opacity=".6"/>`
  + `<rect x="${f(x - 0.46)}" y="${f(y - 0.47)}" width=".92" height=".92" rx=".17" fill="${fill}" stroke="rgba(23,12,51,.32)" stroke-width=".035"/>`;
// peón (de lado, con la base en y≈.3 y la cabeza en y≈-.43)
const PAWN = 'M-.3 .2L-.3 .23C-.3 .33 .3 .33 .3 .23L.3 .2C.3 .15 .24 .13 .19 .12C.12 .08 .08 0 .085-.09L-.085-.09C-.08 0-.12 .08-.19 .12C-.24 .13-.3 .15-.3 .2Z';
const LOCK = '<rect x="-.085" y="-.02" width=".17" height=".13" rx=".025" fill="#fff"/><path d="M-.052-.02v-.04a.052 .052 0 0 1 .104 0v.04" fill="none" stroke="#fff" stroke-width=".035"/>';

// ---- dados
const PIPS = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] };
// giro del cubo (rotateX, rotateY) para que la cara n quede de frente
const FACE = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
const TOSS_MS = 760;
const dieHTML = (d) => `<button class="pq-die idle" data-d="${d}" aria-label="Dado ${d + 1}"><span class="pq-dsh"></span><span class="pq-dwrap"><span class="pq-cube">${
  [1, 2, 3, 4, 5, 6].map((n) => `<span class="pq-face f${n}">${PIPS[n].map(([x, y]) => `<i style="grid-area:${y + 1}/${x + 1}"></i>`).join('')}</span>`).join('')
}<b class="pq-core"></b><b class="pq-core c2"></b><b class="pq-core c3"></b></span></span></button>`;

// fichas que comparten casilla: posición y tamaño
const OFFS = {
  1: [[0, 0]],
  2: [[-0.2, 0.03], [0.2, -0.03]],
  3: [[0, -0.13], [-0.21, 0.12], [0.21, 0.12]],
  4: [[-0.2, -0.13], [0.2, -0.13], [-0.2, 0.15], [0.2, 0.15]],
};
const offsOf = (n) => OFFS[n] || Array.from({ length: n }, (_, k) => [((k % 3) - 1) * 0.28, (Math.floor(k / 3) - (Math.ceil(n / 3) - 1) / 2) * 0.26]);
const scaleOf = (n) => (n <= 1 ? 1 : n === 2 ? 0.8 : n <= 4 ? 0.66 : 0.52);

const RULES = `
  <h3>Cómo se juega</h3>
  <ul>
    <li>Todas tus fichas empiezan en la <b>cárcel</b>. Con <b>pares</b> sale <b>una</b> ficha; con <b>doble 1</b> o <b>doble 6</b> salen <b>todas</b>. Si todas están en la cárcel tienes <b>3 intentos</b>.</li>
    <li>Cada <b>dado</b> mueve una ficha: puedes mover dos fichas o la misma dos veces. Toca un dado para elegirlo y luego la ficha.</li>
    <li><b>Bloqueo</b>: dos fichas del mismo color en una casilla la cierran (se marca con un candado). Las fichas de otro color no pueden pasar ni caer ahí; las del mismo color sí pasan.</li>
    <li>Si caes donde hay una ficha rival, <b>te la comes</b>: vuelve a su cárcel. En los <b>seguros</b> (★) y las salidas nadie se come… salvo quien sale de la cárcel, que se come a los que estén en su salida.</li>
    <li><b>Pares</b> = vuelves a lanzar. <b>Tres pares seguidos</b>: eliges una ficha y se corona directo en el cielo.</li>
    <li>Al dar la vuelta entras a tu <b>llegada</b> (tu color) y al <b>cielo</b>. Para coronar necesitas el número exacto.</li>
    <li>Si un dado no se puede usar, se pierde. Gana quien corone sus <b>4 fichas</b>.</li>
    <li>Tienes 30 s por jugada; si se acaban, la máquina juega por ti.</li>
  </ul>`;

const WHY = {
  jail: 'Está en la cárcel: sale con <b>pares</b>',
  home: 'Esa ficha ya llegó al cielo',
  exact: 'Al cielo se entra con el <b>número exacto</b>',
  block: '¡<b>Bloqueo</b>! Por ahí no puede pasar',
};

export function mountParques(el, ctx) {
  el.innerHTML = `
    <section class="screen parques">
      <header class="oc-top">
        <button class="btn ghost sm" id="pq-leave">${icon('back')} Salir</button>
        <b class="oc-title">Parqués</b>
        <span class="oc-tools">
          <button class="btn ghost sm oc-end-btn" id="pq-stop" hidden>Terminar</button>
          <button class="mute" id="pq-help" aria-label="Reglas">?</button>
          <button class="mute" id="pq-mute">${icon(isMuted() ? 'soundOff' : 'soundOn')}</button>
        </span>
      </header>
      <div class="pq-players"></div>
      <div class="pq-wrap">
        <svg class="pq-bg" viewBox="-0.5 -0.5 20 20" aria-hidden="true"></svg>
        <svg class="pq-fg" viewBox="-0.5 -0.5 20 20"><defs></defs><g class="pq-marks"></g><g class="pq-pcs"></g><g class="pq-walls"></g><g class="pq-fx"></g></svg>
      </div>
      <div class="oc-log pq-log"></div>
      <div class="oc-msg pq-msg"></div>
      <div class="pq-ctrl">
        <div class="pq-tray">${dieHTML(0)}${dieHTML(1)}</div>
        <div class="pq-btns">
          <button class="btn big primary" id="pq-roll" hidden>Lanzar dados</button>
          <button class="btn primary" id="pq-exit" hidden></button>
        </div>
      </div>
      <div class="oc-timer mine pq-mytimer"><i></i></div>
      <div class="oc-pick pq-help" hidden><div class="oc-pick-box pq-rules">${RULES}<button class="btn primary" id="pq-help-x">¡Entendido!</button></div></div>
      <div class="oc-end" hidden></div>
    </section>`;
  const $ = (s) => el.querySelector(s);
  const bgSvg = $('.pq-bg'), fgDefs = $('.pq-fg defs'), marksG = $('.pq-marks'), pcsG = $('.pq-pcs'), wallsG = $('.pq-walls'), fxG = $('.pq-fx');
  const wrapEl = $('.pq-wrap'), playersEl = $('.pq-players'), logEl = $('.pq-log'), msgEl = $('.pq-msg'), trayEl = $('.pq-tray');
  const rollBtn = $('#pq-roll'), exitBtn = $('#pq-exit'), endEl = $('.oc-end'), helpEl = $('.pq-help'), myTimer = $('.pq-mytimer'), stopBtn = $('#pq-stop');

  let st = null, lg = null;
  let mySeat = 0;
  let selD = 0;                 // dado elegido
  let pending = 0, pendingAt = 0;
  let seenTn = 0, tnAt = Date.now();
  let built = '', lastSig = '', lastEvKey = '', plSig = '', endKey = '', msgCur = '', logCur = '';
  let rolling = false, rollTok = 0;   // los dados están en el aire
  let lastTurn = null;          // de quién era el turno en la actualización anterior
  let flashing = false, flashT = 0;
  let raf = 0;
  let dead = false;
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (!dead) fn(); }, ms); timers.add(t); return t; };
  const cancel = (t) => { clearTimeout(t); timers.delete(t); };

  $('#pq-leave').onclick = () => ctx.leave();
  $('#pq-mute').onclick = () => { setMuted(!isMuted()); $('#pq-mute').innerHTML = icon(isMuted() ? 'soundOff' : 'soundOn'); };
  stopBtn.onclick = () => { if (confirm('¿Terminar la partida y volver a la sala?')) ctx.lobby(); };
  $('#pq-help').onclick = () => { helpEl.hidden = false; };
  helpEl.onclick = (e) => { if (e.target === helpEl || e.target.closest('#pq-help-x')) helpEl.hidden = true; };

  const me = () => ctx.me;
  const player = (id) => ((st && st.pl) || []).find((p) => p.id === id) || { id, n: '¿?', a: 'frog' };
  const myTurn = () => lg && !lg.win && current(lg) === me() && !!lg.pcs[me()];
  const busy = () => pending && pending === lg.tn && Date.now() - pendingAt < 3000;
  const seatPlayer = (s) => lg.order.find((o) => lg.seat[o] === s) || null;
  const seatColor = (s) => { const id = seatPlayer(s); return id ? hex(ctx.colorOf(id)) : GREY; };
  // ¿con el dado d se puede mover alguna ficha mía?
  const dieOk = (d) => !!lg.dice && !lg.used[d] && [0, 1, 2, 3].some((i) => canMove(lg, me(), i, lg.dice[d]));
  // el dado que se usa al tocar una ficha: el elegido, o el otro si el elegido ya no sirve
  const activeDie = () => {
    if (!lg.dice) return selD;
    if (lg.used[selD] && !lg.used[1 - selD]) return 1 - selD;
    if (lg.phase === 'move' && lg.pcs[me()] && !dieOk(selD) && dieOk(1 - selD)) return 1 - selD;
    return selD;
  };
  const send = (a) => {
    if (!myTurn() || busy()) return;
    pending = lg.tn;
    pendingAt = Date.now();
    ctx.act({ ...a, tn: lg.tn });
    paintTurn();
  };

  // ---- geometría en pantalla (ya girada para que mi cárcel quede abajo)
  const q = (s) => s - mySeat;
  const trackV = (abs) => rotP(...baseTrack(abs % 17), Math.floor(abs / 17) - mySeat);
  const homeV = (s, j) => rotP(9.5, 17.5 - j, q(s));
  const cieloV = (s, i) => rotP(8.75 + i * 0.5, 10.5, q(s));
  const jailAt = (k, i) => rotP(JC + (i % 2 ? 1.2 : -1.2), JC + (i < 2 ? -1.2 : 1.2), k);
  function pieceV(s, p, i) {
    if (p < 0) return jailAt(q(s), i);
    if (p <= LAST_TRACK) return trackV(absOf(s, p));
    if (p < HOME) return homeV(s, p - LAST_TRACK - 1);
    return cieloV(s, i);
  }

  // ---------------------------------------------------------------- tablero fijo
  function buildBoard() {
    const key = JSON.stringify([lg.order, lg.seat, lg.order.map((id) => ctx.colorOf(id)), lg.order.map((id) => player(id).a), me()]);
    if (key === built) return;
    built = key;
    const seatWas = mySeat;
    mySeat = lg.seat[me()] ?? 0;
    let defs = `
      <linearGradient id="pqFrame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4d3394"/><stop offset="1" stop-color="#24154d"/></linearGradient>
      <radialGradient id="pqFelt" cx=".5" cy=".42" r=".62"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <linearGradient id="pqCell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e4ddf4"/></linearGradient>
      <linearGradient id="pqSafe" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff8dc"/><stop offset="1" stop-color="#ffd86b"/></linearGradient>
      <radialGradient id="pqGold" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#fff4b8"/><stop offset=".5" stop-color="#ffd23f"/><stop offset="1" stop-color="#c88600"/></radialGradient>
      <radialGradient id="pqSky" cx=".5" cy=".5" r=".55"><stop offset="0" stop-color="#fff" stop-opacity=".8"/><stop offset=".5" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <radialGradient id="pqYard" cx=".5" cy=".4" r=".62"><stop offset="0" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".4"/></radialGradient>`;
    for (let s = 0; s < 4; s++) {
      const c = seatColor(s);
      defs += `<linearGradient id="pqJ${s}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${tint(c, 0.3)}"/><stop offset=".55" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, 0.32)}"/></linearGradient>`
        + `<linearGradient id="pqH${s}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tint(c, 0.52)}"/><stop offset="1" stop-color="${tint(c, 0.22)}"/></linearGradient>`
        + `<linearGradient id="pqS${s}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tint(c, 0.28)}"/><stop offset="1" stop-color="${shade(c, 0.1)}"/></linearGradient>`;
    }
    let h = `<defs>${defs}</defs>`
      + '<rect x="-.5" y="-.5" width="20" height="20" rx="1" fill="url(#pqFrame)"/><rect x="-.5" y="-.5" width="20" height="20" rx="1" fill="url(#pqFelt)"/>'
      + '<rect x="-.27" y="-.27" width="19.54" height="19.54" rx=".8" fill="none" stroke="rgba(255,255,255,.16)" stroke-width=".06"/>'
      // la cruz: base oscura que se ve como ranuras entre las casillas
      + '<rect x="7.88" y="-.12" width="3.24" height="19.24" rx=".35" fill="#170c33"/><rect x="-.12" y="7.88" width="19.24" height="3.24" rx=".35" fill="#170c33"/>';
    // cárceles: patio con rejas y el personaje del dueño en la esquina
    for (let s = 0; s < 4; s++) {
      const k = q(s), id = seatPlayer(s);
      const [cx, cy] = rotP(JC, JC, k);
      h += `<g opacity="${id ? 1 : 0.5}">`
        + `<rect x="${cx - 3.7}" y="${cy - 3.7}" width="7.4" height="7.4" rx="1" fill="url(#pqJ${s})" stroke="#170c33" stroke-width=".1"/>`
        + `<rect x="${cx - 3.42}" y="${cy - 3.42}" width="6.84" height="6.84" rx=".78" fill="none" stroke="rgba(255,255,255,.38)" stroke-width=".06"/>`
        + `<clipPath id="pqClip${s}"><circle cx="${cx}" cy="${cy}" r="2.55"/></clipPath>`
        + `<circle cx="${cx}" cy="${cy}" r="2.55" fill="url(#pqYard)"/>`
        + `<g clip-path="url(#pqClip${s})" stroke="rgba(255,255,255,.17)" stroke-width=".11">${[-3, -2, -1, 0, 1, 2, 3].map((b) => `<line x1="${f(cx + b * 0.72)}" y1="${cy - 2.6}" x2="${f(cx + b * 0.72)}" y2="${cy + 2.6}"/>`).join('')}</g>`
        + `<circle cx="${cx}" cy="${cy}" r="2.55" fill="none" stroke="rgba(255,255,255,.65)" stroke-width=".09"/>`;
      for (let i = 0; i < 4; i++) { const [jx, jy] = jailAt(k, i); h += `<ellipse cx="${f(jx)}" cy="${f(jy + 0.42)}" rx=".5" ry=".17" fill="rgba(0,0,0,.28)"/>`; }
      if (id) {
        const ax = cx + Math.sign(cx - 9.5) * 2.78, ay = cy + Math.sign(cy - 9.5) * 2.78;
        h += `<circle cx="${ax}" cy="${ay}" r=".78" fill="rgba(255,255,255,.94)" stroke="#170c33" stroke-width=".07"/>`
          // sin la clase .avatar: su CSS (width: 100%) lo haría gigante dentro del tablero
          + avatarSVG(validAvatar(player(id).a)).replace('width="100" height="100" class="avatar"', `x="${f(ax - 0.62)}" y="${f(ay - 0.62)}" width="1.24" height="1.24"`);
      }
      h += '</g>';
    }
    // recorrido: salidas (color del dueño), seguros (dorados) y entradas a la llegada
    for (let a = 0; a < 68; a++) {
      const side = Math.floor(a / 17), i = a % 17, k = side - mySeat;
      const [x, y] = rotP(...baseTrack(i), k);
      if (i === 12) h += cell(x, y, `url(#pqS${side})`) + star(x, y, 0.3, '#fff', 'rgba(0,0,0,.3)');
      else if (i === 4) h += cell(x, y, 'url(#pqSafe)') + star(x, y, 0.3, '#f5a300', '#a35f00');
      else if (i === 8) h += cell(x, y, `url(#pqH${side})`) + chevron(x, y, k, '#fff');
      else h += cell(x, y, 'url(#pqCell)');
    }
    // llegadas
    for (let s = 0; s < 4; s++) {
      for (let j = 0; j < 7; j++) { const [x, y] = homeV(s, j); h += cell(x, y, `url(#pqH${s})`) + chevron(x, y, q(s), 'rgba(255,255,255,.65)'); }
    }
    // cielo
    for (let s = 0; s < 4; s++) {
      const pts = [[8, 11], [11, 11], [9.5, 9.5]].map(([x, y]) => rotP(x, y, q(s)).join(',')).join(' ');
      h += `<polygon points="${pts}" fill="${seatColor(s)}" stroke="#170c33" stroke-width=".07" stroke-linejoin="round"/>`;
    }
    h += '<rect x="8" y="8" width="3" height="3" fill="url(#pqSky)"/><rect x="8" y="8" width="3" height="3" rx=".1" fill="none" stroke="#170c33" stroke-width=".1"/>'
      + '<circle cx="9.5" cy="9.5" r=".6" fill="url(#pqGold)" stroke="#170c33" stroke-width=".07"/>' + star(9.5, 9.5, 0.36, '#fff', 'rgba(150,90,0,.7)');
    bgSvg.innerHTML = h;
    // degradados de los peones (uno por color) y la sombra
    let pd = '<radialGradient id="pqShadow"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset=".6" stop-color="#000" stop-opacity=".25"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>';
    for (let s = 0; s < 4; s++) {
      const c = seatColor(s);
      pd += `<linearGradient id="pqP${s}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${tint(c, 0.6)}"/><stop offset=".42" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, 0.45)}"/></linearGradient>`;
    }
    fgDefs.innerHTML = pd;
    if (seatWas !== mySeat && P.size) {
      // cambió el giro del tablero: todo a su sitio sin animar
      markEls.forEach((e) => e.remove()); markEls.clear();
      wallEls.forEach((e) => e.remove()); wallEls.clear();
      for (const r of P.values()) { stopWalk(r); r.hold = false; r.top = 0; r.show = r.actual; }
      relayout(true);
    }
  }

  // ---------------------------------------------------------------- fichas
  // Cada ficha guarda dónde está de verdad (actual) y qué progreso se muestra
  // (show): al moverse, show avanza casilla por casilla con un salto.
  const P = new Map();
  const pawnHTML = (s, c) => '<ellipse class="pq-sh" rx=".34" ry=".11" fill="url(#pqShadow)"/>'
    + `<ellipse class="pq-ring" cy=".27" rx=".45" ry=".18" stroke="${c}"/>`
    + `<g class="pq-bob"><path class="pq-pawn" d="${PAWN}" fill="url(#pqP${s})"/>`
    + '<path d="M-.3 .2C-.3 .275 .3 .275 .3 .2" fill="none" stroke="rgba(27,16,53,.45)" stroke-width=".03"/>'
    + `<ellipse class="pq-pawn" cy="-.095" rx=".16" ry=".05" fill="url(#pqP${s})"/>`
    + `<circle class="pq-pawn" cy="-.265" r=".16" fill="url(#pqP${s})"/>`
    + '<ellipse cx="-.06" cy="-.315" rx=".055" ry=".035" fill="#fff" opacity=".9"/>'
    + '<path d="M-.17 .14C-.11 .09-.08 .01-.075-.06" fill="none" stroke="#fff" stroke-opacity=".42" stroke-width=".04" stroke-linecap="round"/></g>'
    + '<circle class="pq-hit" cy="-.05" r=".5"/>';

  function newPiece(id, i, a) {
    const r = {
      key: `${id}:${i}`, id, i, s: lg.seat[id], actual: a, show: a,
      x: null, y: 0, sc: 1, tx: 0, ty: 0, tsc: 1, tw: null,
      path: [], walking: false, hold: false, top: 0, can: 0, mine: 0, mode: null, fly: null, stepMs: 150, onStep: new Map(),
      chain: 0, lift: 0,
    };
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'pq-pc');
    g.dataset.k = r.key;
    g.innerHTML = pawnHTML(r.s, ctx.colorOf(id));
    pcsG.appendChild(g);
    r.el = g;
    r.sh = g.querySelector('.pq-sh');
    P.set(r.key, r);
    return r;
  }

  // dónde va cada ficha según lo que se muestra (las que comparten casilla se acomodan)
  function targets() {
    const groups = new Map();
    for (const r of P.values()) {
      const p = r.show;
      // la que va de paso por una casilla no empuja a las que están ahí: salta por encima
      const passing = r.walking && r.path.length > 0;
      const gk = p < 0 ? 'j' + r.key : p >= HOME ? 'c' + r.key : passing ? `w${r.key}:${p}` : p <= LAST_TRACK ? 't' + absOf(r.s, p) : `h${r.s}:${p}`;
      if (!groups.has(gk)) groups.set(gk, []);
      groups.get(gk).push(r);
    }
    const out = new Map();
    for (const [gk, list] of groups) {
      list.sort((a, b) => a.s - b.s || a.i - b.i);
      const [bx, by] = pieceV(list[0].s, list[0].show, list[0].i);
      const solo = gk[0] === 'j' || gk[0] === 'c' || gk[0] === 'w';
      const offs = solo ? OFFS[1] : offsOf(list.length);
      const sc = gk[0] === 'j' ? 1.45 : gk[0] === 'c' ? 0.62 : scaleOf(list.length);
      list.forEach((r, k) => out.set(r.key, { x: bx + offs[k][0], y: by + offs[k][1], sc }));
    }
    return out;
  }

  function place(r, lift) {
    r.lift = lift;
    const s = r.sc * (1 + lift * 0.16);
    r.el.setAttribute('transform', `translate(${f(r.x)} ${f(r.y - lift)}) scale(${f(s)})`);
    r.sh.setAttribute('transform', `translate(0 ${f(0.29 + lift / s)}) scale(${f(Math.max(0.45, 1 - lift * 0.35))})`);
  }

  // lleva cada ficha a su sitio: salto (al caminar), vuelo (cárcel, cielo) o deslizarse
  function relayout(instant = false) {
    const T = targets();
    const now = performance.now();
    let moved = false;
    for (const r of P.values()) {
      const t = T.get(r.key);
      if (instant || r.x == null) {
        Object.assign(r, { x: t.x, y: t.y, sc: t.sc, tx: t.x, ty: t.y, tsc: t.sc, tw: null });
        place(r, 0);
        continue;
      }
      if (Math.abs(t.x - r.tx) + Math.abs(t.y - r.ty) + Math.abs(t.sc - r.tsc) < 1e-3) continue;
      r.tx = t.x; r.ty = t.y; r.tsc = t.sc;
      const prev = r.tw;
      let dur = 220, hop = 0, delay = 0, walk = 0, chain = 0;
      if (r.mode === 'hop') { dur = r.stepMs; hop = 0.34; walk = r.show; chain = r.chain; }
      else if (r.fly) { dur = r.fly.dur; hop = r.fly.hop; delay = r.fly.delay || 0; r.top = 1; }
      else if (prev && prev.walk) { dur = Math.max(80, prev.t0 + prev.dur - now); walk = prev.walk; chain = prev.chain; }
      r.mode = null;
      r.fly = null;
      r.tw = { x0: r.x, y0: r.y, s0: r.sc, l0: r.lift, x1: t.x, y1: t.y, s1: t.sc, t0: now + delay, dur, hop, walk, chain };
      moved = true;
    }
    reorder();
    paintWalls();
    if (moved) kick();
  }

  const kick = () => { if (!raf && !dead) raf = requestAnimationFrame(frame); };
  function frame(now) {
    raf = 0;
    let active = false, settled = false;
    for (const r of P.values()) {
      const tw = r.tw;
      if (!tw) continue;
      active = true;
      let k = (now - tw.t0) / tw.dur;
      if (k <= 0) continue;
      if (k > 1) k = 1;
      const e = tw.hop ? k * k * (3 - 2 * k) : 1 - (1 - k) ** 3;
      const lift = (tw.hop ? tw.hop * 4 * k * (1 - k) : 0) + tw.l0 * (1 - e);
      r.x = tw.x0 + (tw.x1 - tw.x0) * e;
      r.y = tw.y0 + (tw.y1 - tw.y0) * e;
      r.sc = tw.s0 + (tw.s1 - tw.s0) * e;
      place(r, lift);
      if (k === 1) {
        r.tw = null;
        if (tw.walk) land(r, tw.walk, tw.chain);
        else if (r.top && !r.walking) { r.top = 0; settled = true; }
      }
    }
    if (settled) { reorder(); paintWalls(); }
    if (active) kick();
  }

  // orden de dibujo: las de atrás primero; las que se pueden tocar y las que vuelan, encima.
  // Solo se mueven en el DOM las que quedaron fuera de orden (mover un nodo reinicia sus animaciones).
  function reorder() {
    const list = [...P.values()].sort((a, b) => a.top - b.top || a.can - b.can || a.ty - b.ty || a.tx - b.tx);
    let node = pcsG.firstChild;
    for (const r of list) {
      if (r.el === node) node = node.nextSibling;
      else pcsG.insertBefore(r.el, node);
    }
  }

  // camina de `from` a `to` casilla por casilla
  function walk(r, from, to) {
    r.hold = false;
    for (let p = from + 1; p <= to; p++) r.path.push(p);
    // si se juntaron muchas jugadas (p. ej. la pantalla estuvo apagada), no repetirlas todas
    if (r.path.length > 10) {
      for (const p of r.path.splice(0, r.path.length - 10)) {
        const fns = r.onStep.get(p);
        if (fns) { r.onStep.delete(p); fns.forEach((fn) => fn()); }
      }
    }
    if (!r.walking) { r.walking = true; r.top = 1; const c = ++r.chain; later(() => stepWalk(r, c), 30); }
  }
  function stepWalk(r, c) {
    if (c !== r.chain) return;
    if (!r.path.length) { r.walking = false; r.top = 0; relayout(); return; }
    const p = r.path.shift();
    r.show = p;
    r.mode = 'hop';
    r.stepMs = r.path.length >= 5 ? 125 : 150;
    relayout();
    r.mode = null;
    if (!r.tw || r.tw.walk !== p) later(() => land(r, p, c), r.stepMs);   // no tuvo que moverse: sigue igual
  }
  function land(r, p, c) {
    if (c !== r.chain) return;
    sfx.tick(0.45);
    const fns = r.onStep.get(p);
    if (fns) { r.onStep.delete(p); fns.forEach((fn) => fn()); }
    stepWalk(r, c);
  }
  const onLand = (r, p, fn) => { if (!r.onStep.has(p)) r.onStep.set(p, []); r.onStep.get(p).push(fn); };
  // todo a su sitio ya, sin animar (al volver a la pantalla después de un rato)
  let snapping = false;
  function snapAll() {
    snapping = true;
    for (const r of P.values()) { stopWalk(r); r.hold = false; r.top = 0; r.fly = null; r.mode = null; r.show = r.actual; }
    relayout(true);
    snapping = false;
  }
  const onVis = () => { if (document.visibilityState === 'visible' && lg && P.size) snapAll(); };
  document.addEventListener('visibilitychange', onVis);
  // la ficha deja de caminar (se la comieron, sale de la cárcel o vuela): lo que
  // esperaba a que llegara a una casilla (p. ej. la ficha que se iba a comer) pasa ya
  function stopWalk(r) {
    r.chain++;
    r.path = [];
    r.walking = false;
    const fns = [...r.onStep.values()].flat();
    r.onStep.clear();
    fns.forEach((fn) => fn());
  }

  // Compara lo que se muestra con el estado nuevo y anima las diferencias.
  //   delay: si los dados están en el aire, las fichas esperan a que caigan.
  function syncPieces(ev, delay) {
    const changes = [];
    for (const id of lg.order) {
      for (let i = 0; i < 4; i++) {
        const a = lg.pcs[id][i];
        const r = P.get(`${id}:${i}`);
        if (!r) { newPiece(id, i, a); continue; }
        if (r.actual !== a) { changes.push({ r, from: r.actual, to: a }); r.actual = a; }
      }
    }
    if (!changes.length) { relayout(); return; }
    const lands = [];   // a dónde llega cada ficha que camina (para las que se come)
    let exits = 0;
    for (const c of changes) {
      const { r, from, to } = c;
      if (from >= 0 && to > from && to - from <= 14) {
        walk(r, from, to);
        if (onTrack(to)) lands.push({ r, p: to, abs: absOf(r.s, to) });
        if (ev && ev.t === 'move' && ev.p === r.id && ev.i === r.i) {
          onLand(r, to, () => {
            if (snapping) return;
            if (ev.home) { fxBurst(...cieloV(r.s, r.i), '#ffd23f', 12); sfx.big(); if (ev.p === me()) banner('¡Al cielo!', '#ffd23f'); }
            if (ev.wall) sfx.thunk(0.6);
          });
        }
        c.done = true;
      } else if (from === -1 && to === 0) {
        // sale de la cárcel
        stopWalk(r);
        r.hold = false;
        r.show = 0;
        r.fly = { dur: 520, hop: 1.5, delay: delay + exits * 120 };
        exits++;
        c.done = true;
      }
    }
    for (const c of changes) {
      if (c.done) continue;
      const { r, from, to } = c;
      if (to === -1 && onTrack(from)) {
        // se la comieron: se queda en su casilla hasta que llega quien se la come
        const abs = absOf(r.s, from);
        stopWalk(r);
        r.hold = true;
        r.show = from;
        const release = () => {
          if (!r.hold) return;
          r.hold = false;
          r.show = r.actual;
          r.fly = { dur: 720, hop: 2.4 };
          if (!snapping) {
            fxBurst(...trackV(abs), hex(ctx.colorOf(r.id)), 9);
            sfx.hit();
            if (r.id === me()) buzz(250);
          }
          relayout();
        };
        const w = lands.find((l) => l.abs === abs);
        if (w) onLand(w.r, w.p, release);
        else later(release, exits ? delay + 560 : 60);
        later(release, 4000);   // por si acaso: nunca se queda esperando
        c.done = true;
      }
    }
    for (const c of changes) {
      if (c.done) continue;
      // coronada por tres pares, o un cambio que no vimos completo: vuela directo
      const { r, to } = c;
      stopWalk(r);
      r.hold = false;
      r.show = to;
      r.fly = to === HOME ? { dur: 760, hop: 2.4 } : to === -1 ? { dur: 650, hop: 2 } : { dur: 380, hop: 0.6 };
      if (to === HOME && ev && ev.t === 'crown') later(() => { fxBurst(...cieloV(r.s, r.i), '#ffd23f', 12); sfx.big(); }, 760);
    }
    relayout();
  }

  // ---- efectos (se crean una vez y se borran solos)
  function fxBurst(x, y, color, n = 8) {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('transform', `translate(${f(x)} ${f(y)})`);
    let h = `<circle class="pq-fx-ring" r=".5" stroke="${color}"/>`;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.4;
      h += `<circle class="pq-fx-dot" r=".1" fill="${color}" stroke="#fff" stroke-width=".03" style="--dx:${f(Math.cos(a) * 0.95)}px;--dy:${f(Math.sin(a) * 0.95)}px"/>`;
    }
    g.innerHTML = h;
    fxG.appendChild(g);
    later(() => g.remove(), 800);
  }
  let bannerEl = null;
  function banner(text, color) {
    if (bannerEl) bannerEl.remove();
    const b = document.createElement('div');
    b.className = 'pq-banner';
    b.style.setProperty('--c', color || '#fff');
    b.textContent = text;
    wrapEl.appendChild(b);
    bannerEl = b;
    later(() => { b.remove(); if (bannerEl === b) bannerEl = null; }, 1500);
  }

  // ---- bloqueos: casillas con 2 o más fichas del mismo color (las que caminan no cuentan)
  const wallEls = new Map();
  function paintWalls() {
    const cnt = new Map();
    for (const r of P.values()) {
      if (r.walking || r.hold || (r.top && r.tw) || !onTrack(r.show)) continue;
      const k = `${absOf(r.s, r.show)}:${r.id}`;
      cnt.set(k, (cnt.get(k) || 0) + 1);
    }
    const want = new Set([...cnt].filter(([, n]) => n >= 2).map(([k]) => k));
    for (const [k, e] of wallEls) if (!want.has(k)) { e.remove(); wallEls.delete(k); }
    for (const k of want) {
      if (wallEls.has(k)) continue;
      const cut = k.indexOf(':');
      const [x, y] = trackV(Number(k.slice(0, cut)));
      const c = hex(ctx.colorOf(k.slice(cut + 1)));
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('transform', `translate(${f(x)} ${f(y)})`);
      g.innerHTML = `<g class="pq-wall-in"><rect class="pq-wall-glow" x="-.52" y="-.52" width="1.04" height="1.04" rx=".22" stroke="${c}"/><rect class="pq-wall-line" x="-.52" y="-.52" width="1.04" height="1.04" rx=".22" stroke="${c}"/>`
        + `<g transform="translate(.46 -.46)"><circle r=".19" fill="${c}" stroke="#fff" stroke-width=".05"/>${LOCK}</g></g>`;
      wallsG.appendChild(g);
      wallEls.set(k, g);
    }
  }

  // ---- destinos posibles con el dado elegido y marco de la cárcel de quien juega
  const markEls = new Map();
  function paintMarks() {
    const want = new Map();
    if (myTurn() && !busy() && !rolling && lg.phase === 'move') {
      const d = activeDie();
      for (let i = 0; i < 4; i++) {
        if (!canMove(lg, me(), i, lg.dice[d])) continue;
        const [x, y] = pieceV(lg.seat[me()], lg.pcs[me()][i] + lg.dice[d], i);
        want.set(`d${f(x)},${f(y)}`, `<g transform="translate(${f(x)} ${f(y)})"><circle class="pq-dest" r=".36" stroke="${ctx.colorOf(me())}"/></g>`);
      }
    }
    if (!lg.win) {
      const cur = current(lg);
      const [cx, cy] = rotP(JC, JC, q(lg.seat[cur]));
      // marco quieto (una animación aquí repintaría el tablero todo el tiempo)
      want.set(`t${cur}`, `<rect class="pq-turn-glow" x="${cx - 3.84}" y="${cy - 3.84}" width="7.68" height="7.68" rx="1.12" stroke="${ctx.colorOf(cur)}"/><rect class="pq-turn" x="${cx - 3.84}" y="${cy - 3.84}" width="7.68" height="7.68" rx="1.12" stroke="${ctx.colorOf(cur)}"/>`);
    }
    for (const [k, e] of markEls) if (!want.has(k)) { e.remove(); markEls.delete(k); }
    for (const [k, h] of want) {
      if (markEls.has(k)) continue;
      const g = document.createElementNS(NS, 'g');
      g.innerHTML = h;
      marksG.appendChild(g);
      markEls.set(k, g);
    }
  }

  // ---- qué fichas mías se pueden tocar
  function movable() {
    const out = new Set();
    if (!myTurn() || busy() || rolling) return out;
    if (lg.phase === 'crown') lg.pcs[me()].forEach((p, i) => { if (p !== HOME) out.add(i); });
    else if (lg.phase === 'move') for (let i = 0; i < 4; i++) if ([0, 1].some((d) => !lg.used[d] && canMove(lg, me(), i, lg.dice[d]))) out.add(i);
    return out;
  }
  function paintPieceFlags() {
    const mv = movable();
    const tapAny = myTurn() && !rolling && lg.phase === 'move';
    let reo = false;
    for (const r of P.values()) {
      const can = r.id === me() && mv.has(r.i) ? 1 : 0;
      const mine = !can && r.id === me() && tapAny ? 1 : 0;
      if (can !== r.can) { r.can = can; r.el.classList.toggle('can', !!can); reo = true; }
      if (mine !== r.mine) { r.mine = mine; r.el.classList.toggle('mine', !!mine); }
    }
    if (reo) reorder();
  }

  // ---------------------------------------------------------------- dados
  const dice = [0, 1].map((d) => {
    const b = trayEl.children[d];
    return { el: b, cube: b.querySelector('.pq-cube'), rx: 0, ry: 0, rz: 0, n: 0, norm: 0, tilt: d ? -16 : 16 };
  });
  const cubeT = (D) => `rotateX(-20deg) rotateY(${D.tilt}deg) rotateZ(${f(D.rz)}deg) rotateX(${f(D.rx)}deg) rotateY(${f(D.ry)}deg)`;
  function setDie(D, n, toss, delay = 0) {
    const [bx, by] = FACE[n] || FACE[1];
    cancel(D.norm);
    if (!toss) {
      if (D.n === n) return;
      D.rx = bx; D.ry = by; D.rz = 0; D.n = n;
      D.cube.style.transition = 'none';
      D.cube.style.transform = cubeT(D);
      return;
    }
    // da al menos vuelta y media en X y una en Y antes de caer en la cara n
    D.rx = bx + 360 * Math.ceil((D.rx + 540 + Math.floor(Math.random() * 2) * 360 - bx) / 360);
    D.ry = by + 360 * Math.ceil((D.ry + 360 + Math.floor(Math.random() * 2) * 360 - by) / 360);
    D.rz = (Math.random() * 2 - 1) * 14;
    D.n = n;
    D.cube.style.transition = `transform ${TOSS_MS - 80}ms cubic-bezier(.2,.62,.3,1) ${delay}ms`;
    D.cube.style.transform = cubeT(D);
    D.el.classList.remove('toss', 'shake');
    D.el.style.setProperty('--dl', `${delay}ms`);
    void D.el.offsetWidth;   // para que la animación del lanzamiento empiece de nuevo
    D.el.classList.add('toss');
    // al terminar deja los ángulos entre -360 y 360 (se ve igual) para la próxima vez
    D.norm = later(() => {
      D.el.classList.remove('toss');
      D.rx %= 360; D.ry %= 360;
      D.cube.style.transition = 'none';
      D.cube.style.transform = cubeT(D);
    }, TOSS_MS + delay + 120);
  }
  function tossDice(d) {
    const tok = ++rollTok;
    rolling = true;
    setDie(dice[0], d[0], true, 0);
    setDie(dice[1], d[1], true, 70);
    sfx.crack(1.1);
    later(() => sfx.thud(0.45), 470);
    later(() => sfx.click(0.35), 680);
    later(() => { if (tok === rollTok) { rolling = false; paintTurn(); } }, TOSS_MS + 70);
  }
  const unshake = () => dice.forEach((D) => D.el.classList.remove('shake'));

  // ---------------------------------------------------------------- toques
  pcsG.addEventListener('click', (e) => {
    const g = e.target.closest('.pq-pc');
    if (!g || !lg || !myTurn() || busy() || rolling) return;
    const r = P.get(g.dataset.k);
    if (!r || r.id !== me()) return;
    const i = r.i;
    if (lg.phase === 'crown') { if (r.can && confirm('¿Coronar esta ficha en el cielo?')) send({ t: 'crown', i }); return; }
    if (lg.phase !== 'move') return;
    let d = activeDie();
    if (lg.used[d] || !canMove(lg, me(), i, lg.dice[d])) d = 1 - d;
    if (lg.used[d] || !canMove(lg, me(), i, lg.dice[d])) {
      // no se puede: decir por qué
      const why = whyNot(lg, me(), i, lg.dice[activeDie()]) || whyNot(lg, me(), i, lg.dice[1 - activeDie()]);
      flash(WHY[why] || 'Esa ficha no se puede mover');
      r.el.classList.remove('nope');
      void r.el.getBoundingClientRect();   // para que la animación vuelva a empezar
      r.el.classList.add('nope');
      later(() => r.el.classList.remove('nope'), 340);
      sfx.tick(0.3);
      return;
    }
    send({ t: 'move', d, i });
  });
  function roll() {
    if (!myTurn() || lg.phase !== 'roll' || busy() || rolling) return;
    dice.forEach((D) => { D.el.classList.remove('toss'); D.el.classList.add('shake'); });
    send({ t: 'roll' });
  }
  trayEl.addEventListener('click', (e) => {
    if (!lg || !myTurn()) return;
    if (lg.phase === 'roll') { roll(); return; }
    const b = e.target.closest('.pq-die');
    if (!b || lg.phase !== 'move' || rolling) return;
    const d = Number(b.dataset.d);
    if (lg.used[d]) return;
    if (!dieOk(d)) { flash(`Con el <b>${lg.dice[d]}</b> no puedes mover ninguna ficha`); sfx.tick(0.3); return; }
    selD = d;
    sfx.tick();
    paintTurn();
  });
  rollBtn.onclick = roll;
  exitBtn.onclick = () => { if (myTurn() && lg.canExit && !rolling) send({ t: 'exit' }); };

  // ---------------------------------------------------------------- panel
  function paintPlayers() {
    const cur = lg.win ? '' : current(lg);
    // solo cuando cambia algo que se ve (no con cada jugada)
    const sig = JSON.stringify([cur, lg.order.map((id) => {
      const p = player(id), ps = lg.pcs[id];
      return [id, p.n, p.a, p.b, p.off, ps.filter((x) => x === HOME).length, ps.filter((x) => x === -1).length, lg.wins[id], ctx.colorOf(id)];
    })]);
    if (sig === plSig) return;
    plSig = sig;
    const fr = timeLeft();
    playersEl.innerHTML = lg.order.map((id) => {
      const p = player(id);
      const ps = lg.pcs[id];
      const home = ps.filter((x) => x === HOME).length;
      const jail = ps.filter((x) => x === -1).length;
      return `<div class="oc-opp pq-pl ${id === cur ? 'turn' : ''} ${p.off ? 'off' : ''}" style="--c:${ctx.colorOf(id)}">
          <span class="oc-av">${avatarSVG(validAvatar(p.a))}</span>
          <span class="oc-name">${id === me() ? 'Tú' : esc(p.n)}${p.b ? ' <i>bot</i>' : ''}</span>
          <span class="pq-cnt">${[0, 1, 2, 3].map((k) => `<i class="${k < home ? 'in' : ''}"></i>`).join('')}</span>
          <span class="oc-n">${home ? `${home} en el cielo` : jail === 4 ? 'en la cárcel' : `${4 - jail - home} en juego`}</span>
          ${lg.wins[id] ? `<span class="oc-w">${icon('trophy')}${lg.wins[id]}</span>` : ''}
          <span class="oc-timer"><i style="transform:scaleX(${f(fr)})" class="${fr < 0.2 ? 'low' : ''}"></i></span>
        </div>`;
    }).join('');
  }

  function timeLeft() {
    if (!lg || lg.win) return 1;
    const p = player(current(lg));
    const total = p.off ? OFF_TURN_MS : TURN_MS;
    return Math.max(0, total - (Date.now() - tnAt)) / total;
  }
  function paintTimers() {
    const fr = timeLeft();
    el.querySelectorAll('.pq-pl.turn .oc-timer i').forEach((i) => { i.style.transform = `scaleX(${f(fr)})`; i.classList.toggle('low', fr < 0.2); });
    const show = myTurn() ? 'visible' : 'hidden';
    if (myTimer.style.visibility !== show) myTimer.style.visibility = show;
    const mi = myTimer.firstElementChild;
    mi.style.transform = `scaleX(${f(fr)})`;
    mi.classList.toggle('low', fr < 0.2);
  }

  function evText(ev) {
    if (!ev) return '';
    const mine = ev.p === me();
    const who = mine ? 'Tú' : esc(player(ev.p).n);
    const dice2 = ev.d ? `${ev.d[0]} y ${ev.d[1]}` : '';
    const vic = ev.hit ? [...new Set(ev.hit)] : [];
    const names = vic.filter((h) => h !== me()).map((h) => esc(player(h).n));
    const hit = !vic.length ? ''
      : mine ? ` y te comiste a ${names.join(' y ')}`
        : vic.includes(me()) ? ` y ¡te comió${names.length ? ` (y a ${names.join(' y ')})` : ''}!`
          : ` y se comió a ${names.join(' y ')}`;
    if (ev.t === 'roll') return `${who} ${mine ? 'sacaste' : 'sacó'} ${dice2}${ev.tries ? ` · sin pares (${ev.tries}/3)` : ''}${ev.lost ? (ev.block ? ' · un bloqueo no deja mover' : ' · no hay jugada') : ''}`;
    if (ev.t === 'fail') return `${who} no ${mine ? 'sacaste' : 'sacó'} pares en 3 intentos`;
    if (ev.t === 'exit') {
      if (ev.all) return `¡Doble ${ev.d[0]}! ${mine ? `Sacaste ${ev.k === 1 ? 'tu última ficha' : `todas tus fichas (${ev.k})`}` : `${who} sacó ${ev.k === 1 ? 'su última ficha' : `todas sus fichas (${ev.k})`}`} de la cárcel${hit}`;
      return `¡Pares ${dice2}! ${mine ? 'Sacaste' : `${who} sacó`} una ficha de la cárcel${hit}`;
    }
    if (ev.t === 'move') {
      if (ev.home) return `¡${who} ${mine ? 'coronaste' : 'coronó'} una ficha en el cielo!`;
      return `${who} ${mine ? 'moviste' : 'movió'} ${ev.to - ev.from}${hit}${ev.wall ? (mine ? ' y armaste un bloqueo' : ' y armó un bloqueo') : ''}`;
    }
    if (ev.t === 'three') return `¡Tres pares seguidos! ${mine ? 'Elige' : `${who} elige`} una ficha para coronar`;
    if (ev.t === 'crown') return `¡${who} ${mine ? 'coronaste' : 'coronó'} una ficha por los tres pares!`;
    return '';
  }

  function setMsg(html, mine) {
    const k = (mine ? '1' : '0') + html;
    if (k === msgCur) return;
    msgCur = k;
    msgEl.className = `oc-msg pq-msg${mine ? ' mine' : ''}`;
    msgEl.innerHTML = html;
  }
  // aviso corto (p. ej. por qué esa ficha no se puede mover)
  function flash(html) {
    flashing = true;
    msgCur = '';
    msgEl.className = 'oc-msg pq-msg warn';
    msgEl.innerHTML = html;
    cancel(flashT);
    flashT = later(() => { flashing = false; paintMsg(); }, 2200);
  }
  function paintMsg() {
    if (flashing || !lg) return;
    if (lg.win) { setMsg('', false); return; }
    const cur = current(lg);
    if (!myTurn()) { setMsg(`Turno de <b style="color:${ctx.colorOf(cur)}">${esc(player(cur).n)}</b>`, false); return; }
    if (rolling) { setMsg('Lanzando los dados…', true); return; }
    const allJail = lg.pcs[me()].every((p) => p === -1 || p === HOME);
    let h;
    if (lg.phase === 'roll') h = allJail ? (lg.tries ? `Necesitas <b>pares</b> · intento ${lg.tries + 1} de 3` : 'Necesitas <b>pares</b> para salir de la cárcel') : lg.dice && lg.dice[0] === lg.dice[1] ? '¡Pares! Vuelve a lanzar' : 'Tu turno: lanza los dados';
    else if (lg.phase === 'crown') h = '¡Tres pares! Toca la ficha que quieres <b>coronar</b>';
    else if (lg.canExit && !lg.used[0] && !lg.used[1]) h = allOut(lg.dice) ? `¡Doble ${lg.dice[0]}! Saca <b>todas</b> tus fichas o mueve` : '¡Pares! Saca <b>una ficha</b> de la cárcel o mueve';
    else h = lg.dice[0] !== lg.dice[1] && dieOk(0) && dieOk(1) ? `Elige dado y ficha: mueve <b>${lg.dice[activeDie()]}</b>` : `Toca una ficha que brilla: mueve <b>${lg.dice[activeDie()]}</b>`;
    setMsg(h, true);
  }

  let trayCol = '';
  function paintControls() {
    const mt = myTurn();
    const showing = !!lg.dice;
    // los dados que se ven pueden ser del jugador anterior (p. ej. no sacó pares): se ven apagados
    const cur = current(lg);
    const owner = showing && lg.ev && lg.ev.d ? lg.ev.p : cur;
    const fresh = showing && (owner === cur || !!lg.win);
    const col = ctx.colorOf(lg.win ? owner : cur);
    if (col !== trayCol) { trayCol = col; trayEl.style.setProperty('--c', col); }
    for (let d = 0; d < 2; d++) {
      const D = dice[d];
      if (showing && D.n !== lg.dice[d] && !rolling) setDie(D, lg.dice[d], false);
      D.el.classList.toggle('idle', !fresh && !rolling);
      D.el.classList.toggle('used', showing && !rolling && lg.phase === 'move' && !!lg.used[d]);
      D.el.classList.toggle('sel', mt && !rolling && lg.phase === 'move' && d === activeDie() && !lg.used[d]);
    }
    trayEl.classList.toggle('go', !!(mt && lg.phase === 'roll' && !busy() && !rolling));
    rollBtn.hidden = !(mt && lg.phase === 'roll');
    rollBtn.disabled = !!busy() || rolling;
    const ex = mt && !rolling && lg.phase === 'move' && lg.canExit && !lg.used[0] && !lg.used[1];
    exitBtn.hidden = !ex;
    if (ex) {
      const t = allOut(lg.dice) ? `Sacar todas (${exitCount(lg, me())})` : 'Sacar 1 ficha';
      if (exitBtn.textContent !== t) exitBtn.textContent = t;
    }
    exitBtn.disabled = !!busy();
    stopBtn.hidden = !ctx.isHost() || !!lg.win;
  }

  // lo que depende del turno (se repinta también cuando caen los dados o vence una espera)
  function paintTurn() {
    if (!lg) return;
    paintControls();
    paintPieceFlags();
    paintMarks();
    paintMsg();
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
          <ol class="oc-rank">${(lg.rank || lg.order).map((id, i) => {
            const home = lg.pcs[id].filter((x) => x === HOME).length;
            return `<li style="--c:${ctx.colorOf(id)}"><b>${i + 1}</b><span>${esc(player(id).n)}${id === me() ? ' (tú)' : ''}</span><small>${home}/4 en el cielo</small><em>${icon('trophy')} ${lg.wins[id] || 0}</em></li>`;
          }).join('')}</ol>
          ${ctx.isHost()
            ? `<button class="btn big primary" id="pq-again">${icon('repeat')} Otra partida</button><button class="btn ghost" id="pq-lobby">Volver a la sala</button>`
            : '<p class="hint">Esperando al anfitrión para otra partida…</p>'}
        </div>`;
      if (ctx.isHost()) { $('#pq-again').onclick = () => ctx.again(); $('#pq-lobby').onclick = () => ctx.lobby(); }
    }
    endPanel(endEl, key, 2200);
  }

  // Evento nuevo: dados, sonidos y avisos. Devuelve cuánto deben esperar las fichas.
  function onEvent() {
    const ev = lg.ev;
    const key = JSON.stringify([ev, lg.win]);
    if (key === lastEvKey) return { ev: null, delay: 0 };
    const first = lastEvKey === '';
    lastEvKey = key;
    if (first || !ev) {
      if (lg.dice) lg.dice.forEach((n, d) => setDie(dice[d], n, false));
      else { setDie(dice[0], 5, false); setDie(dice[1], 2, false); }
      return { ev: null, delay: 0 };
    }
    const mine = ev.p === me();
    const rolled = ev.d && (ev.t === 'roll' || ev.t === 'fail' || ev.t === 'three' || (ev.t === 'exit' && ev.r));
    const T = rolled ? TOSS_MS : 0;
    if (rolled) tossDice(ev.d);
    const pair = ev.d && ev.d[0] === ev.d[1];
    later(() => {
      if (ev.t === 'exit') {
        sfx.go();
        if (ev.all) { sfx.big(); banner(`¡Doble ${ev.d[0]}! Salen todas`, ctx.colorOf(ev.p)); }
        if (rolled) { trayEl.classList.remove('pair'); void trayEl.offsetWidth; trayEl.classList.add('pair'); }
      } else if (ev.t === 'three') {
        sfx.big();
        banner('¡Tres pares!', '#ffd23f');
      } else if (rolled && pair) {
        sfx.coin();
        trayEl.classList.remove('pair'); void trayEl.offsetWidth; trayEl.classList.add('pair');
      }
      if (ev.t === 'roll' && ev.lost && mine) {
        if (ev.block) banner('¡Bloqueado!', ctx.colorOf(me()));
        sfx.thunk(0.5);
      }
      if (ev.t === 'fail' && mine) sfx.out(0.4);
    }, T);
    if (ev.hit && ev.hit.length && (mine || ev.hit.includes(me()))) {
      const wait = ev.t === 'move' ? Math.min(14, ev.to - ev.from) * 150 + 60 : T + 600;
      later(() => banner(mine ? '¡Comiste!' : '¡Te comieron!', ctx.colorOf(ev.p)), wait);
    }
    if (lg.win) later(() => { if (lg.win === me()) sfx.win(); else sfx.out(0.6); }, 900);
    return { ev, delay: T };
  }

  const iv = setInterval(() => {
    if (dead || !lg) return;
    paintTimers();
    if (pending && Date.now() - pendingAt > 3000) { pending = 0; unshake(); paintTurn(); }
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
      // (en el anfitrión `nst.lg` es el mismo objeto que cambia: se compara con copias)
      const prevDice = lg ? JSON.stringify(lg.dice) : '';
      lg = nlg;
      if (lg.tn !== seenTn) { seenTn = lg.tn; tnAt = Date.now(); }
      if (pending && lg.tn !== pending) { pending = 0; unshake(); }
      if (lg.phase !== 'move' || JSON.stringify(lg.dice) !== prevDice) selD = 0;
      buildBoard();
      const { ev, delay } = onEvent();
      syncPieces(ev, delay);
      paintPlayers();
      paintTimers();
      paintTurn();
      const log = evText(lg.ev);
      if (log !== logCur) { logCur = log; logEl.innerHTML = log; }
      paintEnd();
      const turnNow = lg.win ? null : current(lg);
      if (myTurn() && lastTurn !== me()) { sfx.ready(); buzz(40); }
      lastTurn = turnNow;
    },
    destroy() {
      dead = true;
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(iv);
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      if (raf) cancelAnimationFrame(raf);
    },
  };
}
