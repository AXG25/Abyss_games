import { connectLobby } from './net.js';
import { Host, findHost, MAX_PLAYERS } from './engine.js';
import { GAMES, GAME_BY_ID } from './games/index.js';
import { esc, $, $$, beep, buzz, fanfare, store, toast, COLORS, AVATARS } from './util.js';

const app = document.getElementById('app');
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const S = {
  lobby: null,          // sala general (lista de salas abiertas)
  online: false,
  name: store('pp_name') || '',
  av: store('pp_av') || AVATARS[Math.floor(Math.random() * AVATARS.length)],
  code: null,
  nr: null,             // sala de juego (named room)
  host: null,           // instancia Host si este teléfono es anfitrión
  creating: false,
  jt: 0,
  me: null,             // mi `peer`
  lastSt: null,
  lastHostSeen: 0,
  screenKey: '',
  lobbySig: '',
  unmountGame: null,
  timers: [],
  unsubs: [],
};

// ---------------------------------------------------------------- arranque
boot();
async function boot() {
  renderHome();
  S.lobby = await connectLobby();
  S.online = !!S.lobby.__real;
  S.lobby.onPeers(() => { if (!S.nr) renderOpenRooms(); });
  if (S.lobby.onConnection) S.lobby.onConnection(() => updateNetPill());
  updateNetPill();
  renderOpenRooms();
}

function updateNetPill() {
  const pill = $('.net');
  if (!pill) return;
  const real = S.lobby && S.lobby.__real;
  const on = real && S.lobby.connected();
  pill.className = 'net ' + (on ? 'on' : real ? 'wait' : 'off');
  pill.textContent = on ? '● En línea' : real ? '● Conectando…' : '● Modo práctica';
}

// ---------------------------------------------------------------- inicio
function renderHome() {
  clearScreen();
  const hashCode = (location.hash.match(/^#([A-Za-z]{4})$/) || [])[1] || '';
  app.innerHTML = `
    <section class="screen home">
      <header class="top"><span class="net wait">● Conectando…</span></header>
      <div class="logo"><span>PARTY</span><span>PLAY</span><small>mini juegos para 4</small></div>
      <div class="card">
        <label class="lbl">Tu nombre</label>
        <input id="name" maxlength="14" placeholder="¿Cómo te llamas?" value="${esc(S.name)}" autocomplete="off">
        <label class="lbl">Tu personaje</label>
        <div class="avatars">${AVATARS.map((a) => `<button class="av ${a === S.av ? 'sel' : ''}" data-av="${a}">${a}</button>`).join('')}</div>
      </div>
      <button class="btn big primary" id="create">🎉 Crear sala</button>
      <div class="join-row">
        <input id="code" maxlength="4" placeholder="CÓDIGO" value="${esc(hashCode.toUpperCase())}" autocomplete="off" autocapitalize="characters">
        <button class="btn" id="join">Unirse</button>
      </div>
      <div class="open-rooms"></div>
      <p class="hint" id="hint"></p>
    </section>`;
  updateNetPill();
  $('#name').addEventListener('input', (e) => { S.name = e.target.value.trim(); store('pp_name', S.name); });
  $('.avatars').addEventListener('click', (e) => {
    const b = e.target.closest('.av');
    if (!b) return;
    S.av = b.dataset.av;
    store('pp_av', S.av);
    $$('.av').forEach((x) => x.classList.toggle('sel', x === b));
    beep(600, 0.05, 'triangle');
  });
  $('#code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); });
  $('#create').addEventListener('click', () => {
    if (!checkName()) return;
    let code = '';
    for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    enterRoom(code, true);
  });
  $('#join').addEventListener('click', () => {
    if (!checkName()) return;
    const code = $('#code').value.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) return toast('El código tiene 4 letras');
    enterRoom(code, false);
  });
  $('.open-rooms').addEventListener('click', (e) => {
    const b = e.target.closest('[data-code]');
    if (!b || !checkName()) return;
    enterRoom(b.dataset.code, false);
  });
  renderOpenRooms();
}

function checkName() {
  if (!S.name) { toast('Escribe tu nombre primero ✍️'); $('#name')?.focus(); return false; }
  beep(520, 0.06, 'triangle');
  return true;
}

function renderOpenRooms() {
  const box = $('.open-rooms');
  if (!box || !S.lobby) return;
  const hint = $('#hint');
  if (!S.lobby.__real) {
    if (hint) hint.textContent = 'Sin conexión en tiempo real: puedes crear una sala y probar los juegos con bots.';
    box.innerHTML = '';
    return;
  }
  if (hint) hint.textContent = 'Comparte el código de la sala con tus amigos para que se unan desde su celular.';
  const rooms = S.lobby.peers()
    .filter((p) => !p.isMe && p.presence && p.presence.open && /^[A-Z]{4}$/.test(p.presence.open.c))
    .map((p) => p.presence.open);
  box.innerHTML = rooms.length
    ? `<div class="lbl">Salas abiertas</div>${rooms.map((r) => `
        <button class="room-item" data-code="${r.c}">
          <b>${esc(r.c)}</b><span>de ${esc(String(r.h || '').slice(0, 14))}</span>
          <em>${Math.min(4, Number(r.n) || 0)}/4 ${r.ph === 'lobby' ? '' : '· jugando'}</em>
        </button>`).join('')}`
    : '';
}

// ---------------------------------------------------------------- sala
async function enterRoom(code, creating) {
  clearScreen();
  S.code = code;
  S.creating = creating;
  S.jt = Date.now();
  S.lastSt = null;
  S.lastHostSeen = Date.now();
  S.screenKey = '';
  S.lobbySig = '';
  app.innerHTML = `<section class="screen center"><div class="spinner"></div><p>Entrando a la sala <b>${esc(code)}</b>…</p></section>`;
  try {
    S.nr = await S.lobby.join('pg-' + code.toLowerCase());
  } catch (e) {
    toast('No se pudo entrar a la sala');
    return renderHome();
  }
  try { history.replaceState(null, '', '#' + code); } catch { /* sin hash */ }
  await S.nr.presence({ name: S.name, av: S.av, jt: S.jt }).catch(() => {});
  S.unsubs.push(S.nr.onPeers(() => onRoomChange()));
  if (creating) becomeHost(null);
  S.watch = setInterval(checkHost, 1000);
}

function myPeer() {
  const me = S.nr && S.nr.peers().find((p) => p.sameTab);
  if (me) S.me = me.peer;
  return S.me;
}

function becomeHost(prev) {
  if (S.host) return;
  S.host = new Host(S.nr, prev, () => { if (S.host) { onRoomChange(); advertise(); } });
  onRoomChange();
  advertise();
}

function dropHost() {
  if (!S.host) return;
  S.host.destroy();
  S.host = null;
  S.nr.presence({ st: null, hs: null }).catch(() => {});
  S.lobby.presence({ open: null }).catch(() => {});
}

function advertise() {
  if (!S.host || !S.lobby.__real) return;
  const st = S.host.st;
  S.lobby.presence({ open: { c: S.code, n: st.pl.filter((p) => !p.b).length, h: S.name, ph: st.ph } }).catch(() => {});
}

// Vigila que siempre haya un anfitrión; si se va, otro toma el control.
function checkHost() {
  if (!S.nr) return;
  const peers = S.nr.peers();
  const h = findHost(peers);
  const me = myPeer();
  if (h) {
    S.lastHostSeen = Date.now();
    if (S.host && me && h.peer !== me) dropHost(); // había dos anfitriones: gana el más antiguo
    return;
  }
  if (S.host) return;
  if (Date.now() - S.lastHostSeen < 3500) return;
  const named = peers.filter((p) => p.presence && typeof p.presence.name === 'string')
    .sort((a, b) => (Number(a.presence.jt) || 0) - (Number(b.presence.jt) || 0) || (a.peer < b.peer ? -1 : 1));
  if (named[0] && named[0].peer === me) {
    becomeHost(S.lastSt);
    toast('👑 Ahora eres el anfitrión');
  }
}

function currentState() {
  if (S.host) return S.host.st;
  const h = findHost(S.nr.peers());
  return h ? h.presence.st : null;
}

function onRoomChange() {
  if (!S.nr) return;
  myPeer();
  const st = currentState();
  if (!st || !Array.isArray(st.pl)) {
    if (!S.screenKey.startsWith('wait')) {
      S.screenKey = 'wait';
      app.innerHTML = `<section class="screen center"><div class="spinner"></div><p>Buscando al anfitrión de <b>${esc(S.code)}</b>…</p><button class="btn ghost" id="leave">Salir</button></section>`;
      $('#leave').onclick = leaveRoom;
    }
    return;
  }
  S.lastSt = st;
  S.lastHostSeen = Date.now();
  render(st);
}

function render(st) {
  if (st.ph === 'lobby') return renderRoomLobby(st);
  const key = st.k + ':' + st.ph;
  if (key === S.screenKey) {
    if (st.ph === 'final') renderFinalControls(st);
    return;
  }
  S.screenKey = key;
  S.lobbySig = '';
  stopGame();
  if (st.ph === 'intro') renderIntro(st);
  else if (st.ph === 'play') renderPlay(st);
  else if (st.ph === 'res') renderResults(st);
  else if (st.ph === 'final') renderFinal(st);
}

const colorOf = (st, id) => COLORS[Math.max(0, st.pl.findIndex((p) => p.id === id)) % COLORS.length];

function playerChip(st, p, extra = '') {
  const c = colorOf(st, p.id);
  const you = p.id === S.me;
  return `<div class="chip ${you ? 'you' : ''} ${p.off ? 'off' : ''}" style="--c:${c}">
      <span class="chip-av">${esc(p.a)}</span>
      <span class="chip-name">${esc(p.n)}${you ? ' <i>(tú)</i>' : ''}${p.b ? ' <i>bot</i>' : ''}</span>
      ${extra}
    </div>`;
}

// ---------------------------------------------------------------- lobby de sala
function renderRoomLobby(st) {
  const isHost = !!S.host;
  const sig = JSON.stringify([st.pl, st.R, st.bots, isHost, S.me]);
  if (S.screenKey === 'lobby' && sig === S.lobbySig) return;
  const firstTime = S.screenKey !== 'lobby';
  S.screenKey = 'lobby';
  S.lobbySig = sig;
  stopGame();
  const hostId = isHost ? S.me : findHost(S.nr.peers())?.peer;
  const inGame = st.pl.some((p) => p.id === S.me);
  const slots = [];
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const p = st.pl[i];
    slots.push(p
      ? `<div class="slot filled" style="--c:${COLORS[i]}">
           <span class="slot-av">${esc(p.a)}</span>
           <span class="slot-name">${esc(p.n)}</span>
           <span class="slot-tag">${p.id === hostId ? '👑' : ''}${p.id === S.me ? 'tú' : p.b ? 'bot' : ''}</span>
           ${p.s ? `<span class="slot-score">⭐ ${p.s}</span>` : ''}
         </div>`
      : `<div class="slot empty"><span>Esperando…</span></div>`);
  }
  app.innerHTML = `
    <section class="screen room ${firstTime ? 'enter' : ''}">
      <header class="top">
        <button class="btn ghost sm" id="leave">← Salir</button>
        <span class="net"></span>
      </header>
      <div class="code-box">
        <small>Código de la sala</small>
        <button class="code" id="copy">${esc(S.code)}</button>
        <small>Toca para copiar y compártelo</small>
      </div>
      <div class="slots">${slots.join('')}</div>
      ${!inGame ? '<p class="hint">La sala está llena: estás mirando 👀</p>' : ''}
      ${isHost ? `
        <div class="card host-panel">
          <div class="row">
            <span class="lbl">Rondas</span>
            <div class="seg" id="rounds">${[3, 5, 8].map((n) => `<button class="${st.R === n ? 'sel' : ''}" data-n="${n}">${n}</button>`).join('')}</div>
          </div>
          <div class="row">
            <span class="lbl">Bots</span>
            <div class="seg">
              <button id="botminus">−</button><b class="seg-val">${st.bots}</b><button id="botplus">+</button>
            </div>
          </div>
          <button class="btn big primary" id="start">🚀 ¡Empezar la fiesta!</button>
        </div>
        <div class="lbl center">o prueba un solo juego</div>
        <div class="games-grid">${GAMES.map((g) => `<button class="game-card" data-g="${g.id}"><span>${g.emoji}</span><b>${esc(g.name)}</b></button>`).join('')}</div>
      ` : `<div class="card waiting"><div class="dots"><i></i><i></i><i></i></div><p>Esperando a que el anfitrión 👑 empiece…</p></div>`}
    </section>`;
  updateNetPill();
  $('#leave').onclick = leaveRoom;
  $('#copy').onclick = () => {
    try { navigator.clipboard.writeText(S.code).then(() => toast('Código copiado 📋'), () => toast('Código: ' + S.code)); } catch { toast('Código: ' + S.code); }
  };
  if (isHost) {
    $('#rounds').onclick = (e) => { const b = e.target.closest('button'); if (b) { S.host.setRounds(Number(b.dataset.n)); beep(500, 0.05); } };
    $('#botplus').onclick = () => { S.host.setBots(st.bots + 1); beep(600, 0.05); };
    $('#botminus').onclick = () => { S.host.setBots(st.bots - 1); beep(400, 0.05); };
    $('#start').onclick = () => { fanfare(); S.host.start(); };
    $('.games-grid').onclick = (e) => { const b = e.target.closest('[data-g]'); if (b) { fanfare(); S.host.start(b.dataset.g); } };
  }
}

// ---------------------------------------------------------------- intro
function renderIntro(st) {
  const g = GAME_BY_ID[st.g];
  if (!g) return;
  const total = st.seq.length;
  app.innerHTML = `
    <section class="screen intro">
      <div class="round-tag">${total > 1 ? `Ronda ${st.r} de ${total}` : 'Juego de prueba'}</div>
      <div class="intro-emoji">${g.emoji}</div>
      <h1>${esc(g.name)}</h1>
      <p class="intro-desc">${esc(g.desc)}</p>
      <div class="count-down">3</div>
      <div class="intro-players">${st.pl.map((p) => playerChip(st, p)).join('')}</div>
    </section>`;
  beep(440, 0.1, 'triangle');
  const cd = $('.count-down');
  const start = Date.now();
  const t = setInterval(() => {
    const left = Math.ceil((4000 - (Date.now() - start)) / 1000);
    if (left <= 0) { cd.textContent = '¡YA!'; clearInterval(t); beep(880, 0.15, 'square'); buzz(40); return; }
    if (cd.textContent !== String(left)) { cd.textContent = left; cd.classList.remove('pulse'); void cd.offsetWidth; cd.classList.add('pulse'); beep(520, 0.07, 'triangle'); }
  }, 100);
  S.timers.push(t);
}

// ---------------------------------------------------------------- juego
function renderPlay(st) {
  const g = GAME_BY_ID[st.g];
  if (!g) return;
  const meP = st.pl.find((p) => p.id === S.me);
  app.innerHTML = `
    <section class="screen play">
      <header class="play-top"><span>${g.emoji} ${esc(g.name)}</span>${meP ? playerChip(st, meP) : ''}</header>
      <div id="stage"></div>
    </section>`;
  const stage = $('#stage');
  if (!meP) {
    stage.innerHTML = `<div class="spectate"><div class="intro-emoji">👀</div><p>Estás mirando esta ronda</p></div>`;
    return;
  }
  const k = st.k;
  const ctx = {
    seed: st.seed,
    color: colorOf(st, S.me),
    submit: (v) => { S.nr && S.nr.presence({ in: { k, v } }).catch(() => {}); },
  };
  try {
    S.unmountGame = g.mount(stage, ctx) || null;
  } catch (e) {
    stage.textContent = 'Error en el juego: ' + e.message;
  }
}

function stopGame() {
  if (S.unmountGame) { try { S.unmountGame(); } catch { /* nada */ } S.unmountGame = null; }
  S.timers.forEach((t) => { clearInterval(t); clearTimeout(t); });
  S.timers = [];
}

// ---------------------------------------------------------------- resultados
function renderResults(st) {
  const g = GAME_BY_ID[st.g];
  const byId = Object.fromEntries(st.pl.map((p) => [p.id, p]));
  const medal = ['', '🥇', '🥈', '🥉', '4️⃣'];
  const total = [...st.pl].sort((a, b) => b.s - a.s);
  const max = Math.max(1, ...st.pl.map((p) => p.s));
  const mine = st.rk.find((x) => x.id === S.me);
  app.innerHTML = `
    <section class="screen results">
      <div class="round-tag">${g ? g.emoji + ' ' + esc(g.name) : ''}</div>
      <h1>${mine ? (mine.pl === 1 ? '¡Ganaste! 🎉' : mine.pl ? `Quedaste #${mine.pl}` : 'Sin puntos 😅') : 'Resultados'}</h1>
      <ol class="rank">${st.rk.map((x, i) => {
        const p = byId[x.id];
        if (!p) return '';
        return `<li style="--c:${colorOf(st, x.id)};animation-delay:${i * 0.12}s" class="${x.id === S.me ? 'you' : ''}">
            <span class="medal">${medal[x.pl] || '·'}</span>
            <span class="r-av">${esc(p.a)}</span>
            <span class="r-name">${esc(p.n)}<small>${esc(x.l)}</small></span>
            <span class="r-pts">+${x.p}⭐</span>
          </li>`;
      }).join('')}</ol>
      <div class="lbl">Marcador ${st.seq.length > 1 ? `· ronda ${st.r}/${st.seq.length}` : ''}</div>
      <div class="bars">${total.map((p) => `
        <div class="bar-row" style="--c:${colorOf(st, p.id)}">
          <span>${esc(p.a)}</span><div class="bar"><i style="width:${(p.s / max) * 100}%"></i></div><b>${p.s}</b>
        </div>`).join('')}</div>
    </section>`;
  if (mine && mine.pl === 1) { fanfare(); buzz(60); } else beep(500, 0.1, 'triangle');
}

// ---------------------------------------------------------------- final
function renderFinal(st) {
  const sorted = [...st.pl].sort((a, b) => b.s - a.s);
  const order = [sorted[1], sorted[0], sorted[2]].filter(Boolean);
  const heights = { 0: 150, 1: 110, 2: 80 };
  app.innerHTML = `
    <section class="screen final">
      <div class="confetti">${Array.from({ length: 40 }, (_, i) => `<i style="left:${(i * 37) % 100}%;animation-delay:${(i % 10) * 0.25}s;background:${COLORS[i % 4]}"></i>`).join('')}</div>
      <h1>🏆 ${esc(sorted[0]?.n || '')} gana la fiesta</h1>
      <div class="podium">${order.map((p) => {
        const place = sorted.indexOf(p);
        return `<div class="pod" style="--c:${colorOf(st, p.id)}">
            <span class="pod-av">${esc(p.a)}</span>
            <span class="pod-name">${esc(p.n)}</span>
            <div class="pod-block" style="height:${heights[place]}px"><b>${place + 1}</b><small>${p.s}⭐</small></div>
          </div>`;
      }).join('')}</div>
      ${sorted[3] ? `<p class="hint">4. ${esc(sorted[3].a)} ${esc(sorted[3].n)} · ${sorted[3].s}⭐</p>` : ''}
      <div id="final-ctl"></div>
    </section>`;
  fanfare();
  setTimeout(fanfare, 700);
  renderFinalControls(st);
}

function renderFinalControls() {
  const box = $('#final-ctl');
  if (!box) return;
  const want = S.host ? 'host' : 'guest';
  if (box.dataset.m === want) return;
  box.dataset.m = want;
  box.innerHTML = S.host
    ? `<button class="btn big primary" id="again">🔁 Volver a la sala</button>`
    : `<p class="hint">El anfitrión 👑 puede volver a la sala para otra partida.</p>`;
  if (S.host) $('#again').onclick = () => S.host.toLobby();
}

// ---------------------------------------------------------------- salir
async function leaveRoom() {
  clearScreen();
  clearInterval(S.watch);
  S.unsubs.forEach((u) => { try { u(); } catch { /* nada */ } });
  S.unsubs = [];
  dropHost();
  const nr = S.nr;
  S.nr = null;
  S.code = null;
  S.screenKey = '';
  try { await nr?.leave(); } catch { /* nada */ }
  try { history.replaceState(null, '', location.pathname); } catch { /* nada */ }
  renderHome();
}

function clearScreen() {
  stopGame();
}

// Sonido en iOS: hay que "despertar" el audio con el primer toque.
document.addEventListener('pointerdown', () => beep(1, 0.001, 'sine', 0.0001), { once: true });
