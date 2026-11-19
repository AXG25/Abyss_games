// 🎲 Parqués — pantalla. Tablero en SVG (cruz de 19×19 casillas), girado para
// que tu cárcel quede abajo. Dibuja el estado del anfitrión y envía las jugadas.
import { HOME, LAST_TRACK, SEGUROS, TURN_MS, OFF_TURN_MS, current, absOf, canMove, options } from './parques.js';
import { avatarSVG, validAvatar, icon } from '../icons.js';
import { endPanel, endPanelHide } from './endpanel.js';
import { esc, buzz } from '../util.js';
import { sfx, isMuted, setMuted } from '../audio.js';

// ---- geometría (unidades = casillas; centro del tablero en 9.5, 9.5)
const rotP = (x, y, k) => { for (let i = 0; i < k; i++) [x, y] = [y, 19 - x]; return [x, y]; };
const baseTrack = (i) => (i < 8 ? [8.5, 11.5 + i] : i === 8 ? [9.5, 18.5] : [10.5, 18.5 - (i - 9)]);
const trackXY = (abs) => rotP(...baseTrack(abs % 17), Math.floor(abs / 17));
const homeXY = (s, j) => rotP(9.5, 17.5 - j, s);
const cieloXY = (s, i) => rotP(8.8 + i * 0.47, 10.45, s);
const jailXY = (s, i) => rotP(14.5 + (i % 2 ? 1.3 : -1.3), 14.5 + (i < 2 ? -1.3 : 1.3), s);
function pieceXY(s, p, i) {
  if (p < 0) return jailXY(s, i);
  if (p <= LAST_TRACK) return trackXY(absOf(s, p));
  if (p < HOME) return homeXY(s, p - LAST_TRACK - 1);
  return cieloXY(s, i);
}
const GREY = '#4a3f6b';
// mezcla un color con el blanco lila del tablero (a = cuánto del color)
const light = (c, a = 0.35) => {
  const h = (x) => [1, 3, 5].map((k) => parseInt(x.slice(k, k + 2), 16));
  const A = h(/^#[0-9a-f]{6}$/i.test(c) ? c : '#4a3f6b'), B = h('#f4efff');
  return '#' + A.map((v, k) => Math.round(v * a + B[k] * (1 - a)).toString(16).padStart(2, '0')).join('');
};

const PIPS = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] };
const dieSVG = (n) => `<svg viewBox="0 0 30 30" class="pq-die-svg"><rect x="1.5" y="1.5" width="27" height="27" rx="6"/>${(PIPS[n] || []).map(([x, y]) => `<circle cx="${7.5 + x * 7.5}" cy="${7.5 + y * 7.5}" r="2.7"/>`).join('')}</svg>`;

const RULES = `
  <h3>Cómo se juega</h3>
  <ul>
    <li>Todas tus fichas empiezan en la <b>cárcel</b>. Para sacarlas necesitas <b>pares</b>: salen todas a tu salida. Si todas están en la cárcel tienes <b>3 intentos</b>.</li>
    <li>Cada <b>dado</b> mueve una ficha: puedes mover dos fichas o la misma dos veces. Toca un dado para elegirlo y luego la ficha.</li>
    <li>Si caes donde hay una ficha rival, <b>te la comes</b>: vuelve a su cárcel. En los <b>seguros</b> (★) y las salidas nadie se come… salvo quien sale de la cárcel, que se come a los que estén en su salida.</li>
    <li><b>Pares</b> = vuelves a lanzar. <b>Tres pares seguidos</b>: eliges una ficha y se corona directo en el cielo.</li>
    <li>Al dar la vuelta entras a tu <b>llegada</b> (tu color) y al <b>cielo</b>. Para coronar necesitas el número exacto.</li>
    <li>Si un dado no se puede usar, se pierde. Gana quien corone sus <b>4 fichas</b>.</li>
    <li>Tienes 30 s por jugada; si se acaban, la máquina juega por ti.</li>
  </ul>`;

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
      <div class="pq-wrap"><svg class="pq-board" viewBox="-0.3 -0.3 19.6 19.6"><g class="pq-rot"><g class="pq-bg"></g><g class="pq-marks"></g><g class="pq-pcs"></g></g></svg></div>
      <div class="oc-log pq-log"></div>
      <div class="oc-msg pq-msg"></div>
      <div class="pq-ctrl">
        <div class="pq-dice"></div>
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
  const svg = $('.pq-board'), rot = $('.pq-rot'), bgG = $('.pq-bg'), marksG = $('.pq-marks'), pcsG = $('.pq-pcs');
  const playersEl = $('.pq-players'), logEl = $('.pq-log'), msgEl = $('.pq-msg'), diceEl = $('.pq-dice');
  const rollBtn = $('#pq-roll'), exitBtn = $('#pq-exit'), endEl = $('.oc-end'), helpEl = $('.pq-help');

  let st = null, lg = null;
  let selD = 0;                 // dado elegido
  let pending = 0, pendingAt = 0;
  let seenTn = 0, tnAt = Date.now();
  let built = '';
  let lastEvKey = '';
  let rolling = 0;              // animación de los dados
  let dead = false;
  const shown = new Map();      // ficha → progreso que se está mostrando
  const anims = new Map();      // ficha → timeout de su animación

  $('#pq-leave').onclick = () => ctx.leave();
  $('#pq-mute').onclick = () => { setMuted(!isMuted()); $('#pq-mute').innerHTML = icon(isMuted() ? 'soundOff' : 'soundOn'); };
  $('#pq-stop').onclick = () => { if (confirm('¿Terminar la partida y volver a la sala?')) ctx.lobby(); };
  $('#pq-help').onclick = () => { helpEl.hidden = false; };
  helpEl.onclick = (e) => { if (e.target === helpEl || e.target.closest('#pq-help-x')) helpEl.hidden = true; };

  const me = () => ctx.me;
  const player = (id) => (st.pl || []).find((p) => p.id === id) || { id, n: '¿?', a: 'frog' };
  const myTurn = () => lg && !lg.win && current(lg) === me() && !!lg.pcs[me()];
  const busy = () => pending && pending === lg.tn && Date.now() - pendingAt < 3000;
  const seatColor = (s) => { const id = lg.order.find((o) => lg.seat[o] === s); return id ? ctx.colorOf(id) : null; };
  const send = (a) => {
    if (!myTurn() || busy()) return;
    pending = lg.tn;
    pendingAt = Date.now();
    ctx.act({ ...a, tn: lg.tn });
    paintControls();
  };

  // ---- tablero fijo (depende de los asientos y colores)
  function buildBoard() {
    const key = JSON.stringify([lg.order, lg.seat, lg.order.map((id) => ctx.colorOf(id)), me()]);
    if (key === built) return;
    built = key;
    const mySeat = lg.seat[me()] ?? 0;
    rot.setAttribute('transform', `rotate(${mySeat * 90} 9.5 9.5)`);
    let h = '<rect x="-0.2" y="-0.2" width="19.4" height="19.4" rx="0.8" class="pq-frame"/>';
    // cárceles
    for (let s = 0; s < 4; s++) {
      const c = seatColor(s) || GREY;
      const [x, y] = rotP(14.5, 14.5, s);
      h += `<rect x="${x - 3.85}" y="${y - 3.85}" width="7.7" height="7.7" rx="1.2" fill="${c}" class="pq-jail"/>`;
      h += `<circle cx="${x}" cy="${y}" r="2.75" fill="rgba(255,255,255,.22)" stroke="rgba(255,255,255,.55)" stroke-width="0.08"/>`;
      for (let i = 0; i < 4; i++) { const [jx, jy] = jailXY(s, i); h += `<circle cx="${jx}" cy="${jy}" r="0.55" fill="rgba(0,0,0,.18)"/>`; }
    }
    // recorrido
    for (let a = 0; a < 68; a++) {
      const [x, y] = trackXY(a);
      const s = Math.floor(a / 17), i = a % 17;
      const salida = i === 12;
      const c = seatColor(s);
      const fill = salida && c ? light(c, 0.75) : SEGUROS.has(a) ? '#fff6c9' : '#fbf8ff';
      h += `<rect x="${x - 0.48}" y="${y - 0.48}" width="0.96" height="0.96" rx="0.12" fill="${fill}" class="pq-cell"/>`;
      if (SEGUROS.has(a)) h += `<path d="M${x} ${y - 0.33}l.1 .2.22 .03-.16 .16.04 .22-.2-.1-.2 .1.04-.22-.16-.16.22-.03z" fill="${salida && c ? '#fff' : '#e0a800'}" opacity=".9"/>`;
    }
    // llegadas
    for (let s = 0; s < 4; s++) {
      const c = seatColor(s) || GREY;
      for (let j = 0; j < 7; j++) { const [x, y] = homeXY(s, j); h += `<rect x="${x - 0.48}" y="${y - 0.48}" width="0.96" height="0.96" rx="0.12" fill="${light(c, 0.55)}" class="pq-cell"/>`; }
      // flecha de entrada a la llegada
      const [ax, ay] = rotP(9.5, 18.5, s);
      h += `<rect x="${ax - 0.48}" y="${ay - 0.48}" width="0.96" height="0.96" rx="0.12" fill="${light(c, 0.3)}" class="pq-cell"/>`;
    }
    // cielo: 4 triángulos
    for (let s = 0; s < 4; s++) {
      const c = seatColor(s) || GREY;
      const p = [[8, 11], [11, 11], [9.5, 9.5]].map(([x, y]) => rotP(x, y, s).join(',')).join(' ');
      h += `<polygon points="${p}" fill="${c}" stroke="#1b1035" stroke-width="0.08"/>`;
    }
    h += '<circle cx="9.5" cy="9.5" r="0.45" fill="#fff" stroke="#1b1035" stroke-width="0.08"/>';
    bgG.innerHTML = h;
  }

  // ---- fichas
  const pieceKey = (id, i) => `${id}:${i}`;
  function slotOffsets(n) {
    if (n <= 1) return [[0, 0]];
    if (n === 2) return [[-0.2, -0.2], [0.2, 0.2]];
    if (n === 3) return [[-0.22, -0.18], [0.22, -0.18], [0, 0.22]];
    return Array.from({ length: n }, (_, k) => [((k % 2) - 0.5) * 0.42, (Math.floor(k / 2) - (Math.ceil(n / 2) - 1) / 2) * 0.36]);
  }

  function paintPieces() {
    // fichas que comparten casilla se acomodan
    const groups = new Map();
    for (const id of lg.order) {
      const s = lg.seat[id];
      for (let i = 0; i < 4; i++) {
        const p = shown.has(pieceKey(id, i)) ? shown.get(pieceKey(id, i)) : lg.pcs[id][i];
        const [x, y] = pieceXY(s, p, i);
        const g = p < 0 || p === HOME ? `${id}:${i}:solo` : `${x.toFixed(2)},${y.toFixed(2)}`;
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push({ id, i, x, y, p });
      }
    }
    const movable = new Set();
    const dests = [];
    if (myTurn() && !busy()) {
      if (lg.phase === 'crown') lg.pcs[me()].forEach((p, i) => { if (p !== HOME) movable.add(i); });
      else if (lg.phase === 'move') {
        const d = !lg.used[selD] ? selD : 1 - selD;
        for (let i = 0; i < 4; i++) {
          if (canMove(lg, me(), i, lg.dice[d])) {
            movable.add(i);
            const to = lg.pcs[me()][i] + lg.dice[d];
            dests.push(pieceXY(lg.seat[me()], to, i));
          } else if (!lg.used[1 - d] && canMove(lg, me(), i, lg.dice[1 - d])) movable.add(i);
        }
      }
    }
    marksG.innerHTML = dests.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.36" class="pq-dest" stroke="${ctx.colorOf(me())}"/>`).join('');
    const want = new Set();
    for (const list of groups.values()) {
      const offs = slotOffsets(list.length);
      const r = list.length > 2 ? 0.27 : list.length === 2 ? 0.32 : 0.38;
      list.forEach((q, k) => {
        const key = pieceKey(q.id, q.i);
        want.add(key);
        let g = pcsG.querySelector(`[data-k="${key}"]`);
        if (!g) {
          g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          g.dataset.k = key;
          g.classList.add('pq-pc');
          pcsG.appendChild(g);
        }
        const can = q.id === me() && movable.has(q.i);
        const col = ctx.colorOf(q.id);
        const html = `${can ? `<circle r="${r + 0.17}" class="pq-ring" stroke="${col}"/><circle r="0.95" class="pq-hit"/>` : ''}<circle r="${r}" fill="${col}" class="pq-body"/><circle r="${r * 0.45}" cy="${-r * 0.15}" fill="rgba(255,255,255,.55)"/>`;
        if (g.dataset.h !== html) { g.innerHTML = html; g.dataset.h = html; }
        g.dataset.i = q.i;
        g.classList.toggle('can', can);
        g.style.transform = `translate(${q.x + offs[k][0]}px, ${q.y + offs[k][1]}px)`;
      });
    }
    pcsG.querySelectorAll('.pq-pc').forEach((g) => { if (!want.has(g.dataset.k)) g.remove(); });
    // las fichas que se pueden mover van arriba para poder tocarlas
    pcsG.querySelectorAll('.pq-pc.can').forEach((g) => pcsG.appendChild(g));
  }

  // anima una ficha casilla por casilla
  function animate(id, i, from, to) {
    const key = pieceKey(id, i);
    clearTimeout(anims.get(key));
    if (from < 0 || to < from || to - from > 14) { shown.delete(key); paintPieces(); return; }
    let p = from;
    const stepFn = () => {
      if (dead) return;
      p++;
      shown.set(key, p);
      paintPieces();
      sfx.tick(0.6);
      if (p < to) anims.set(key, setTimeout(stepFn, 110));
      else { shown.delete(key); anims.delete(key); paintPieces(); }
    };
    shown.set(key, from);
    anims.set(key, setTimeout(stepFn, 60));
  }

  pcsG.addEventListener('click', (e) => {
    const g = e.target.closest('.pq-pc.can');
    if (!g || !myTurn() || busy()) return;
    const i = Number(g.dataset.i);
    if (lg.phase === 'crown') { if (confirm('¿Coronar esta ficha en el cielo?')) send({ t: 'crown', i }); return; }
    if (lg.phase !== 'move') return;
    let d = !lg.used[selD] ? selD : 1 - selD;
    if (!canMove(lg, me(), i, lg.dice[d])) d = 1 - d;
    if (lg.used[d] || !canMove(lg, me(), i, lg.dice[d])) return;
    send({ t: 'move', d, i });
  });
  diceEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-d]');
    if (!b || !myTurn() || lg.phase !== 'move') return;
    const d = Number(b.dataset.d);
    if (lg.used[d]) return;
    selD = d;
    sfx.tick();
    paintControls();
    paintPieces();
  });
  rollBtn.onclick = () => { if (myTurn() && lg.phase === 'roll') { sfx.crack(); send({ t: 'roll' }); } };
  exitBtn.onclick = () => { if (myTurn() && lg.canExit) send({ t: 'exit' }); };

  // ---- panel
  function paintPlayers() {
    const cur = current(lg);
    playersEl.innerHTML = lg.order.map((id) => {
      const p = player(id);
      const ps = lg.pcs[id];
      const home = ps.filter((x) => x === HOME).length;
      const jail = ps.filter((x) => x === -1).length;
      return `<div class="oc-opp pq-pl ${id === cur && !lg.win ? 'turn' : ''} ${p.off ? 'off' : ''}" style="--c:${ctx.colorOf(id)}">
          <span class="oc-av">${avatarSVG(validAvatar(p.a))}</span>
          <span class="oc-name">${id === me() ? 'Tú' : esc(p.n)}${p.b ? ' <i>bot</i>' : ''}</span>
          <span class="pq-cnt"><i class="pq-dotc"></i>${'●'.repeat(home)}${'○'.repeat(4 - home)}</span>
          <span class="oc-n">${home ? `${home} en el cielo` : jail === 4 ? 'en la cárcel' : `${4 - jail - home} en juego`}</span>
          ${lg.wins[id] ? `<span class="oc-w">${icon('trophy')}${lg.wins[id]}</span>` : ''}
          <span class="oc-timer"><i></i></span>
        </div>`;
    }).join('');
  }

  function evText(ev) {
    if (!ev) return '';
    const mine = ev.p === me();
    const who = mine ? 'Tú' : esc(player(ev.p).n);
    const dice = ev.d ? `${ev.d[0]} y ${ev.d[1]}` : '';
    const vic = ev.hit ? [...new Set(ev.hit)] : [];
    const names = vic.filter((h) => h !== me()).map((h) => esc(player(h).n));
    const hit = !vic.length ? ''
      : mine ? ` y te comiste a ${names.join(' y ')}`
        : vic.includes(me()) ? ` y ¡te comió${names.length ? ` (y a ${names.join(' y ')})` : ''}!`
          : ` y se comió a ${names.join(' y ')}`;
    if (ev.t === 'roll') return `${who} ${mine ? 'sacaste' : 'sacó'} ${dice}${ev.tries ? ` · sin pares (${ev.tries}/3)` : ''}${ev.lost ? ' · no hay jugada' : ''}`;
    if (ev.t === 'fail') return `${who} no ${mine ? 'sacaste' : 'sacó'} pares en 3 intentos`;
    if (ev.t === 'exit') return `¡Pares ${dice}! ${mine ? 'Sacaste' : `${who} sacó`} ${ev.k} ficha${ev.k === 1 ? '' : 's'} de la cárcel${hit}`;
    if (ev.t === 'move') return ev.home ? `¡${who} ${mine ? 'coronaste' : 'coronó'} una ficha en el cielo!` : `${who} ${mine ? 'moviste' : 'movió'} ${ev.to - ev.from}${hit}`;
    if (ev.t === 'three') return `¡Tres pares seguidos! ${mine ? 'Elige' : `${who} elige`} una ficha para coronar`;
    if (ev.t === 'crown') return `¡${who} ${mine ? 'coronaste' : 'coronó'} una ficha por los tres pares!`;
    return '';
  }

  function paintControls() {
    const mt = myTurn();
    const cur = current(lg);
    const showDice = lg.dice && (rolling ? [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)] : lg.dice);
    if (mt && lg.phase === 'move' && lg.used[selD] && !lg.used[1 - selD]) selD = 1 - selD;
    diceEl.innerHTML = showDice
      ? showDice.map((n, d) => `<button class="pq-die ${lg.used[d] && !rolling ? 'used' : ''} ${mt && lg.phase === 'move' && d === selD && !lg.used[d] ? 'sel' : ''} ${rolling ? 'roll' : ''}" data-d="${d}" style="--c:${ctx.colorOf(lg.ev && lg.ev.p ? lg.ev.p : cur)}">${dieSVG(n)}</button>`).join('')
      : '<span class="pq-nodice"></span>';
    rollBtn.hidden = !(mt && lg.phase === 'roll');
    rollBtn.disabled = busy();
    exitBtn.hidden = !(mt && lg.phase === 'move' && lg.canExit && !lg.used[0] && !lg.used[1]);
    exitBtn.textContent = `Sacar de la cárcel (${lg.pcs[me()] ? lg.pcs[me()].filter((p) => p === -1).length : 0})`;
    exitBtn.disabled = busy();
    if (lg.win) { msgEl.innerHTML = ''; return; }
    if (mt) {
      msgEl.className = 'oc-msg pq-msg mine';
      const allJail = lg.pcs[me()].every((p) => p === -1 || p === HOME);
      msgEl.innerHTML = lg.phase === 'roll'
        ? (allJail ? `Necesitas <b>pares</b> para salir de la cárcel${lg.tries ? ` · intento ${lg.tries + 1} de 3` : ''}` : lg.dice && lg.dice[0] === lg.dice[1] ? '¡Pares! Vuelve a lanzar' : 'Tu turno: lanza los dados')
        : lg.phase === 'crown' ? '¡Tres pares! Toca la ficha que quieres <b>coronar</b>'
          : lg.canExit && !lg.used[0] && !lg.used[1] ? 'Sacaste pares: <b>saca tus fichas</b> de la cárcel o mueve'
            : `Elige un dado y toca la ficha que brilla (mueve <b>${lg.dice[!lg.used[selD] ? selD : 1 - selD]}</b>)`;
    } else {
      msgEl.className = 'oc-msg pq-msg';
      msgEl.innerHTML = `Turno de <b style="color:${ctx.colorOf(cur)}">${esc(player(cur).n)}</b>`;
    }
  }

  function paintEnd() {
    if (!lg.win) { endPanelHide(endEl); return; }
    
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
    endPanel(endEl, `${lg.tn}:${lg.win}`, 2200);
  }

  function onEvent(prevLg) {
    const ev = lg.ev;
    const key = JSON.stringify([ev, lg.win]);
    if (key === lastEvKey) return;
    const first = lastEvKey === '';
    lastEvKey = key;
    if (first || !ev) return;
    if (ev.t === 'roll' || ev.t === 'exit' || ev.t === 'fail' || ev.t === 'three') {
      rolling = Date.now();
      sfx.crack(1.2);
      const spin = setInterval(() => { if (dead || Date.now() - rolling > 420) { clearInterval(spin); rolling = 0; paintControls(); if (ev.d && ev.d[0] === ev.d[1]) sfx.coin(); return; } paintControls(); }, 70);
    }
    if (ev.t === 'move' && prevLg) animate(ev.p, ev.i, ev.from, ev.to);
    if (ev.hit && ev.hit.length) {
      setTimeout(() => { if (!dead) { sfx.hit(); if (ev.hit.includes(me())) buzz(250); } }, ev.t === 'move' ? (ev.to - ev.from) * 110 + 80 : 300);
    }
    if (ev.t === 'exit') setTimeout(() => sfx.go(), 350);
    if (ev.home || ev.t === 'crown') setTimeout(() => sfx.big(), 300);
    if (lg.win) setTimeout(() => { if (lg.win === me()) sfx.win(); else sfx.out(0.6); }, 500);
  }

  function paint() {
    buildBoard();
    paintPlayers();
    paintPieces();
    paintControls();
    logEl.innerHTML = evText(lg.ev);
    paintEnd();
    $('#pq-stop').hidden = !ctx.isHost() || !!lg.win;
  }

  const iv = setInterval(() => {
    if (dead || !lg || lg.win) return;
    const p = player(current(lg));
    const total = p.off ? OFF_TURN_MS : TURN_MS;
    const f = Math.max(0, total - (Date.now() - tnAt)) / total;
    el.querySelectorAll('.pq-pl.turn .oc-timer i').forEach((i) => { i.style.transform = `scaleX(${f})`; i.classList.toggle('low', f < 0.2); });
    const mine = $('.pq-mytimer');
    mine.style.visibility = myTurn() ? 'visible' : 'hidden';
    mine.querySelector('i').style.transform = `scaleX(${f})`;
    mine.querySelector('i').classList.toggle('low', f < 0.2);
    if (pending && Date.now() - pendingAt > 3000) { pending = 0; paint(); }
  }, 150);

  return {
    update(nst) {
      const prevLg = lg;
      const prevTurn = lg ? current(lg) : null;
      st = nst;
      lg = nst.lg;
      if (!lg) return;
      if (lg.tn !== seenTn) { seenTn = lg.tn; tnAt = Date.now(); }
      if (pending && lg.tn !== pending) pending = 0;
      if (lg.phase !== 'move' || (prevLg && prevLg.dice !== lg.dice && JSON.stringify(prevLg.dice) !== JSON.stringify(lg.dice))) selD = 0;
      onEvent(prevLg);
      if (myTurn() && prevTurn !== me()) { sfx.ready(); buzz(40); }
      paint();
    },
    destroy() { dead = true; clearInterval(iv); anims.forEach((t) => clearTimeout(t)); },
  };
}
