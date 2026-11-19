// 🎲 Parqués — el clásico colombiano. Reglas (sin interfaz), las aplica el anfitrión.
//
// Tablero en cruz de 19×19: 4 cárceles en las esquinas, 4 brazos de 3 columnas
// y el cielo en el centro. Recorrido exterior de 68 casillas (17 por lado),
// en contra de las manecillas del reloj.
//
// Reglas de esta versión:
//  - 4 fichas por jugador, todas empiezan en la cárcel. 2 a 4 jugadores.
//  - Se lanzan 2 dados. Cada dado mueve una ficha (pueden ser la misma o distintas).
//  - Para salir de la cárcel hay que sacar PARES: salen todas las fichas que
//    estén en la cárcel a la casilla de salida. Si todas tus fichas están en la
//    cárcel tienes 3 intentos por turno.
//  - Al salir de la cárcel se "come" a las fichas rivales que estén en tu salida.
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
export const BOT_MS = [650, 1100];   // los bots lanzan y mueven rápido (el parqués tiene muchas jugadas)

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
const onTrack = (p) => p >= 0 && p <= LAST_TRACK;

// ¿Puede la ficha i moverse `d` casillas?
export function canMove(lg, pid, i, d) {
  const p = lg.pcs[pid][i];
  return p >= 0 && p < HOME && p + d <= HOME;
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

function exitJail(lg, pid) {
  const ps = lg.pcs[pid];
  let n = 0;
  for (let i = 0; i < 4; i++) if (ps[i] === -1) { ps[i] = 0; n++; }
  // la salida es seguro para los demás, pero quien sale de la cárcel se los come
  const hit = capture(lg, pid, absOf(lg.seat[pid], 0), true);
  return { n, hit };
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
        const { n, hit } = exitJail(lg, pid);
        lg.ev = { t: 'exit', p: pid, d, k: n, hit, n: lg.tn };
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
      if (pair) { lg.phase = 'roll'; lg.used = [true, true]; } else { nextTurn(lg); lg.dice = d; lg.used = [true, true]; }
    }
    return true;
  }
  if (a.t === 'exit') {
    if (lg.phase !== 'move' || !lg.canExit || lg.used[0] || lg.used[1]) return false;
    const d = lg.dice;
    const { n, hit } = exitJail(lg, pid);
    lg.pairs = Math.max(0, lg.pairs - 1);   // los pares de salir de la cárcel no cuentan
    lg.ev = { t: 'exit', p: pid, d, k: n, hit, n: lg.tn };
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
// ¿Qué tan peligrosa es la casilla `abs` para mí? (rivales detrás a 1..12 casillas)
function danger(lg, pid, abs) {
  if (SEGUROS.has(abs)) return 0;
  let n = 0;
  for (const o of lg.order) {
    if (o === pid) continue;
    for (const p of lg.pcs[o]) {
      if (!onTrack(p)) continue;
      const dist = (abs - absOf(lg.seat[o], p) + TRACK) % TRACK;
      if (dist >= 1 && dist <= 12) n++;
    }
  }
  return n;
}

function scoreMove(lg, pid, { d, i }) {
  const s = lg.seat[pid];
  const from = lg.pcs[pid][i];
  const to = from + lg.dice[d];
  let v = to / 8;
  if (to === HOME) v += 80;
  else if (to > LAST_TRACK) v += 25;
  else {
    const abs = absOf(s, to);
    if (!SEGUROS.has(abs)) {
      for (const o of lg.order) if (o !== pid) for (const p of lg.pcs[o]) if (onTrack(p) && absOf(lg.seat[o], p) === abs) v += 100;
    } else v += 18;
    v -= danger(lg, pid, abs) * 12;
  }
  if (onTrack(from)) v += danger(lg, pid, absOf(s, from)) * 10;   // escapar de un peligro
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
    const jailed = lg.pcs[pid].filter((p) => p === -1).length;
    if (40 + jailed * 15 > bs) return { t: 'exit' };
  }
  return best ? { t: 'move', d: best.d, i: best.i } : { t: 'roll' };
}
