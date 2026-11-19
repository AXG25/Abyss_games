// 🎲 Parqués — el clásico colombiano. Reglas (sin interfaz), las aplica el anfitrión.
//
// Tablero en cruz de 19×19: 4 cárceles en las esquinas, 4 brazos de 3 columnas
// y el cielo en el centro. Recorrido exterior de 68 casillas (17 por lado),
// en contra de las manecillas del reloj.
//
// Reglas de esta versión:
//  - 4 fichas por jugador, todas empiezan en la cárcel. 2 a 4 jugadores.
//  - Se lanzan 2 dados. Cada dado mueve una ficha (pueden ser la misma o distintas).
//  - Para salir de la cárcel hay que sacar PARES: sale UNA ficha a la casilla de
//    salida. Con DOBLE 1 o DOBLE 6 salen TODAS las fichas que estén en la cárcel.
//    Si todas tus fichas están en la cárcel tienes 3 intentos por turno.
//  - Al salir de la cárcel se "come" a las fichas rivales que estén en tu salida.
//  - BLOQUEOS: dos (o más) fichas del mismo color en una casilla del recorrido la
//    cierran. Las fichas de otro color no pueden pasar por ahí ni caer ahí; las
//    del mismo color sí pasan.
//  - Pares = vuelves a lanzar. TRES PARES seguidos (sin contar los de salir de la
//    cárcel): eliges una ficha y se corona directo en el cielo.
//  - Caer en una casilla con fichas rivales las manda a la cárcel, salvo en los
//    seguros y las salidas.
//  - Al final de la vuelta cada ficha entra a su llegada (7 casillas) y al
//    cielo; para entrar al cielo se necesita el número exacto.
//  - Si un dado no se puede usar, se pierde. Gana quien corone sus 4 fichas.
import { mulberry32 } from '../util.js';

export const TRACK = 68;
export const LAST_TRACK = 64;   // progreso de la última casilla del recorrido (antes de la llegada)
export const HOME = 72;         // progreso del cielo (64 + 7 de llegada + 1)
export const SALIDA = 12;       // casilla de salida del jugador 0 en el recorrido
export const SEGUROS = new Set([4, 12, 21, 29, 38, 46, 55, 63]);   // 2 por lado: seguro y salida
export const TURN_MS = 30000;
export const OFF_TURN_MS = 6000;
// los bots lanzan y mueven rápido (el parqués tiene muchas jugadas), pero después
// de que los dados caen (la animación de los dados dura ~0,75 s)
export const BOT_MS = [850, 1250];

// asientos: con 2 jugadores, enfrentados
const SEATS = { 1: [0], 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] };

export function init(ids, seed, prevWins = {}) {
  const r = mulberry32(seed);
  const order = ids.slice(0, 4);
  const seat = {}, pcs = {}, wins = {};
  order.forEach((id, i) => { seat[id] = SEATS[order.length][i]; pcs[id] = [-1, -1, -1, -1]; wins[id] = prevWins[id] || 0; });
  return {
    order, seat, pcs,
    turn: Math.floor(r() * order.length),
    phase: 'roll',     // 'roll' lanzar · 'move' mover con los dados · 'crown' elegir ficha a coronar
    dice: null, used: [false, false],
    tries: 0,          // intentos de sacar pares con todo en la cárcel
    pairs: 0,          // pares seguidos
    canExit: false,    // sacó pares con fichas en la cárcel: puede sacarlas
    tn: 1, ev: null, win: null, rank: null, wins,
  };
}

export const current = (lg) => lg.order[lg.turn];
// casilla del recorrido (0..67) de una ficha con progreso p del asiento s
export const absOf = (s, p) => (s * 17 + SALIDA + p) % TRACK;
export const onTrack = (p) => p >= 0 && p <= LAST_TRACK;

// ---- salir de la cárcel
// Doble 1 o doble 6: salen todas las fichas de la cárcel. Otros pares: sale una.
export const allOut = (d) => !!d && d[0] === d[1] && (d[0] === 1 || d[0] === 6);
export const jailedOf = (lg, pid) => lg.pcs[pid].filter((p) => p === -1).length;
// cuántas fichas saca de la cárcel el par `d`
export const exitCount = (lg, pid, d = lg.dice) => (allOut(d) ? jailedOf(lg, pid) : Math.min(1, jailedOf(lg, pid)));

// ---- bloqueos: 2 o más fichas del mismo color en una casilla del recorrido
const countAt = (lg, o, abs) => lg.pcs[o].reduce((n, p) => n + (onTrack(p) && absOf(lg.seat[o], p) === abs ? 1 : 0), 0);
// ¿Hay en la casilla `abs` un bloqueo de otro color que le cierra el paso a `pid`?
export function rivalBlock(lg, pid, abs) {
  for (const o of lg.order) if (o !== pid && countAt(lg, o, abs) >= 2) return o;
  return null;
}
// Todos los bloqueos del tablero: [{ abs, p (dueño), n (fichas) }]
export function blockades(lg) {
  const out = [];
  for (const o of lg.order) {
    const cnt = new Map();
    for (const p of lg.pcs[o]) if (onTrack(p)) { const a = absOf(lg.seat[o], p); cnt.set(a, (cnt.get(a) || 0) + 1); }
    for (const [abs, n] of cnt) if (n >= 2) out.push({ abs, p: o, n });
  }
  return out;
}
// Primera casilla con un bloqueo rival entre `from` (sin contarla) y `to` (contándola), o -1.
// La llegada es privada de cada color: ahí no hay bloqueos.
export function blockedAt(lg, pid, from, to) {
  const s = lg.seat[pid];
  for (let q = Math.max(0, from + 1); q <= Math.min(to, LAST_TRACK); q++) {
    const abs = absOf(s, q);
    if (rivalBlock(lg, pid, abs)) return abs;
  }
  return -1;
}

// ¿Puede la ficha i moverse `d` casillas?
export function canMove(lg, pid, i, d) {
  const p = lg.pcs[pid][i];
  return p >= 0 && p < HOME && p + d <= HOME && blockedAt(lg, pid, p, p + d) < 0;
}
// Por qué la ficha i no se puede mover `d`: 'jail' · 'home' · 'exact' · 'block' · null (sí puede)
export function whyNot(lg, pid, i, d) {
  const p = lg.pcs[pid][i];
  if (p === -1) return 'jail';
  if (p >= HOME) return 'home';
  if (p + d > HOME) return 'exact';
  if (blockedAt(lg, pid, p, p + d) >= 0) return 'block';
  return null;
}

// Opciones de jugada en la fase 'move': [{ d, i }] (+ salir de la cárcel)
export function options(lg, pid) {
  const out = [];
  if (lg.phase !== 'move' || current(lg) !== pid) return out;
  for (let d = 0; d < 2; d++) {
    if (lg.used[d]) continue;
    for (let i = 0; i < 4; i++) if (canMove(lg, pid, i, lg.dice[d])) out.push({ d, i });
  }
  return out;
}

// manda a la cárcel a los rivales que estén en la casilla `abs` (si no es seguro)
function capture(lg, pid, abs, force = false) {
  if (!force && SEGUROS.has(abs)) return [];
  const hit = [];
  for (const o of lg.order) {
    if (o === pid) continue;
    const ps = lg.pcs[o];
    for (let i = 0; i < 4; i++) if (onTrack(ps[i]) && absOf(lg.seat[o], ps[i]) === abs) { ps[i] = -1; hit.push(o); }
  }
  return hit;
}

// saca de la cárcel una ficha (o todas con doble 1 / doble 6)
function exitJail(lg, pid) {
  const ps = lg.pcs[pid];
  const all = allOut(lg.dice);
  let n = 0;
  for (let i = 0; i < 4; i++) if (ps[i] === -1 && (all || n === 0)) { ps[i] = 0; n++; }
  // la salida es seguro para los demás, pero quien sale de la cárcel se los come
  const hit = capture(lg, pid, absOf(lg.seat[pid], 0), true);
  return { n, hit, all: all ? 1 : 0 };
}

function nextTurn(lg) {
  lg.turn = (lg.turn + 1) % lg.order.length;
  lg.phase = 'roll';
  lg.dice = null;
  lg.used = [false, false];
  lg.tries = 0;
  lg.pairs = 0;
  lg.canExit = false;
}

const done = (lg, pid) => lg.pcs[pid].every((p) => p === HOME);
const progress = (lg, pid) => lg.pcs[pid].reduce((s, p) => s + Math.max(0, p) + (p === HOME ? 20 : 0), 0);

function checkWin(lg, pid) {
  if (!done(lg, pid)) return false;
  lg.win = pid;
  lg.wins[pid] = (lg.wins[pid] || 0) + 1;
  lg.rank = lg.order.slice().sort((a, b) => (a === pid ? -1 : b === pid ? 1 : progress(lg, b) - progress(lg, a)));
  lg.phase = 'end';
  return true;
}

// después de usar un dado: ¿sigue moviendo, vuelve a lanzar o pasa el turno?
function afterMove(lg, pid) {
  if (lg.win) return;
  const left = [0, 1].some((d) => !lg.used[d] && [0, 1, 2, 3].some((i) => canMove(lg, pid, i, lg.dice[d])));
  if (left) return;
  const pair = lg.dice[0] === lg.dice[1];
  if (pair) { lg.phase = 'roll'; lg.dice = null; lg.used = [false, false]; lg.canExit = false; lg.tries = 0; }
  else nextTurn(lg);
}

// Acciones: { t: 'roll' } · { t: 'move', d, i } · { t: 'exit' } · { t: 'crown', i }
//   `rnd` (solo el anfitrión) da los números de los dados.
export function act(lg, pid, a, info = {}) {
  if (!a || lg.win || current(lg) !== pid) return false;
  const ps = lg.pcs[pid];
  const rnd = info.rnd || Math.random;
  if (a.t === 'roll') {
    if (lg.phase !== 'roll') return false;
    const d = [1 + Math.floor(rnd() * 6), 1 + Math.floor(rnd() * 6)];
    const pair = d[0] === d[1];
    lg.dice = d;
    lg.used = [false, false];
    lg.tn++;
    const onBoard = ps.some((p) => p >= 0 && p < HOME);
    const jailed = ps.filter((p) => p === -1).length;
    lg.ev = { t: 'roll', p: pid, d, n: lg.tn };
    if (!onBoard) {
      // todo en la cárcel (o coronado): 3 intentos de sacar pares
      if (pair) {
        const { n, hit, all } = exitJail(lg, pid);
        lg.ev = { t: 'exit', p: pid, d, k: n, all, hit, r: 1, n: lg.tn };   // r: salió con este lanzamiento
        lg.tries = 0;
        lg.dice = d;
        lg.used = [true, true];
        lg.phase = 'roll';          // con los pares de salir no se mueve: vuelve a lanzar
        return true;
      }
      lg.tries++;
      if (lg.tries >= 3) { lg.ev = { t: 'fail', p: pid, d, n: lg.tn }; nextTurn(lg); lg.dice = d; lg.used = [true, true]; }
      else { lg.ev.tries = lg.tries; lg.used = [true, true]; }
      return true;
    }
    if (pair) {
      lg.pairs++;
      if (lg.pairs >= 3) { lg.phase = 'crown'; lg.ev = { t: 'three', p: pid, d, n: lg.tn }; return true; }
    }
    lg.phase = 'move';
    lg.canExit = pair && jailed > 0;
    if (!options(lg, pid).length && !lg.canExit) {
      lg.ev.lost = 1;              // ningún dado sirve
      if ([0, 1, 2, 3].some((i) => d.some((n) => whyNot(lg, pid, i, n) === 'block'))) lg.ev.block = 1;   // por un bloqueo
      if (pair) { lg.phase = 'roll'; lg.used = [true, true]; } else { nextTurn(lg); lg.dice = d; lg.used = [true, true]; }
    }
    return true;
  }
  if (a.t === 'exit') {
    if (lg.phase !== 'move' || !lg.canExit || lg.used[0] || lg.used[1]) return false;
    const d = lg.dice;
    const { n, hit, all } = exitJail(lg, pid);
    lg.pairs = Math.max(0, lg.pairs - 1);   // los pares de salir de la cárcel no cuentan
    lg.ev = { t: 'exit', p: pid, d, k: n, all, hit, n: lg.tn };
    lg.used = [true, true];
    lg.canExit = false;
    lg.phase = 'roll';
    lg.tn++;
    return true;
  }
  if (a.t === 'move') {
    const d = a.d, i = a.i;
    if (lg.phase !== 'move' || (d !== 0 && d !== 1) || lg.used[d] || !(i >= 0 && i < 4) || !canMove(lg, pid, i, lg.dice[d])) return false;
    const from = ps[i];
    const to = from + lg.dice[d];
    ps[i] = to;
    lg.used[d] = true;
    lg.canExit = false;
    let hit = [];
    if (onTrack(to)) hit = capture(lg, pid, absOf(lg.seat[pid], to));
    lg.ev = { t: 'move', p: pid, i, from, to, hit, home: to === HOME ? 1 : 0, n: lg.tn };
    if (onTrack(to) && countAt(lg, pid, absOf(lg.seat[pid], to)) === 2) lg.ev.wall = 1;   // armó un bloqueo
    lg.tn++;
    if (!checkWin(lg, pid)) afterMove(lg, pid);
    return true;
  }
  if (a.t === 'crown') {
    if (lg.phase !== 'crown' || !(a.i >= 0 && a.i < 4) || ps[a.i] === HOME) return false;
    const from = ps[a.i];
    ps[a.i] = HOME;
    lg.ev = { t: 'crown', p: pid, i: a.i, from, to: HOME, n: lg.tn };
    lg.tn++;
    if (!checkWin(lg, pid)) nextTurn(lg);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- bot
// ¿Qué tan peligrosa es la casilla `abs` para mí? Rivales detrás a 1..12 casillas
// que de verdad pueden llegar (sin entrar antes a su llegada ni chocar con un bloqueo).
function danger(lg, pid, abs) {
  if (SEGUROS.has(abs)) return 0;
  let n = 0;
  for (const o of lg.order) {
    if (o === pid) continue;
    const s = lg.seat[o];
    for (const p of lg.pcs[o]) {
      if (!onTrack(p)) continue;
      const dist = (abs - absOf(s, p) + TRACK) % TRACK;
      if (dist < 1 || dist > 12 || p + dist > LAST_TRACK) continue;
      if (blockedAt(lg, o, p, p + dist) >= 0) continue;
      n++;
    }
  }
  return n;
}

function scoreMove(lg, pid, { d, i }) {
  const s = lg.seat[pid];
  const from = lg.pcs[pid][i];
  const to = from + lg.dice[d];
  // el tablero después de la jugada (para ver bloqueos y peligros)
  const sim = { ...lg, pcs: { ...lg.pcs, [pid]: lg.pcs[pid].slice() } };
  sim.pcs[pid][i] = to;
  let v = to / 8;
  if (to === HOME) v += 80;
  else if (to > LAST_TRACK) v += 25;
  else {
    const abs = absOf(s, to);
    if (!SEGUROS.has(abs)) {
      for (const o of lg.order) if (o !== pid) for (const p of lg.pcs[o]) if (onTrack(p) && absOf(lg.seat[o], p) === abs) v += 100;
    } else v += 18;
    if (countAt(sim, pid, abs) === 2) v += 14;      // arma un bloqueo
    v -= danger(sim, pid, abs) * 12;
  }
  if (onTrack(from)) {
    const fa = absOf(s, from);
    v += danger(lg, pid, fa) * 10;                  // escapar de un peligro
    if (countAt(lg, pid, fa) === 2) v -= 8;          // deshace su bloqueo
  }
  return v;
}

export function autoMove(lg, pid) {
  if (lg.phase === 'roll') return { t: 'roll' };
  if (lg.phase === 'crown') {
    // corona la ficha más atrasada (la que más le falta)
    const ps = lg.pcs[pid];
    let best = -1;
    for (let i = 0; i < 4; i++) if (ps[i] !== HOME && (best < 0 || ps[i] < ps[best])) best = i;
    return { t: 'crown', i: best };
  }
  const opts = options(lg, pid);
  let best = null, bs = -Infinity;
  for (const o of opts) {
    const v = scoreMove(lg, pid, o) + Math.random() * 3;
    if (v > bs) { bs = v; best = o; }
  }
  if (lg.canExit) {
    const onBoard = lg.pcs[pid].filter((p) => p >= 0 && p < HOME).length;
    if (30 + exitCount(lg, pid) * 22 + (onBoard <= 1 ? 30 : 0) > bs) return { t: 'exit' };
  }
  return best ? { t: 'move', d: best.d, i: best.i } : { t: 'roll' };
}
