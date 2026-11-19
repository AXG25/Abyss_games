// 🁫 Dominó — reglas (sin interfaz), las aplica el anfitrión. Estilo latino:
//
//  - Fichas doble seis (28). Cada jugador recibe 7.
//  - 2 o 3 jugadores: cada uno por su cuenta y las fichas que sobran son el POZO
//    (si no tienes jugada robas del pozo hasta poder jugar).
//  - 4 jugadores: POR PAREJAS (los que se sientan enfrente son compañeros) y sin pozo.
//  - La primera mano la abre quien tenga el doble seis (si nadie lo tiene, el
//    doble más alto). Las siguientes las abre quien ganó la mano anterior.
//  - Se juega una ficha que coincida con una de las dos puntas. Si no puedes y no
//    hay pozo, pasas.
//  - La mano termina cuando alguien se queda sin fichas (¡dominó!) o cuando nadie
//    puede jugar (TRANQUE): ahí gana quien tenga menos puntos en la mano.
//  - El ganador de la mano suma los puntos de las fichas de sus rivales.
//    Gana la partida quien llegue primero a 100.
import { mulberry32, shuffle } from '../util.js';

export const TARGET = 100;
export const TURN_MS = 30000;
export const OFF_TURN_MS = 6000;
export const BOT_MS = [800, 1500];
const FORCED_MS = 1300;     // pasar o robar cuando no hay jugada: lo hace solo
const HAND_MS = 8000;       // tiempo mostrando el resultado de la mano

export const ALL = [];
for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) ALL.push(`${a}${b}`);
export const pips = (t) => +t[0] + +t[1];
const has = (t, v) => +t[0] === v || +t[1] === v;
const other = (t, v) => (+t[0] === v ? +t[1] : +t[0]);
const isDouble = (t) => t[0] === t[1];

// lado (puntaje) de un jugador: su pareja o él mismo
export const sideOf = (lg, id) => (lg.teams ? 't' + (lg.order.indexOf(id) % 2) : id);
export const sides = (lg) => (lg.teams ? ['t0', 't1'] : lg.order.slice());
export const membersOf = (lg, side) => lg.order.filter((id) => sideOf(lg, id) === side);

function deal(lg, seed) {
  const r = mulberry32(seed);
  const deck = shuffle(ALL.slice(), r);
  lg.hands = {};
  for (const id of lg.order) lg.hands[id] = deck.splice(0, 7);
  lg.pozo = deck;
  lg.line = [];           // fichas en la mesa, de izquierda a derecha: { a, b } (a toca con la anterior)
  lg.c = 0;               // índice de la primera ficha jugada dentro de `line`
  lg.ends = null;         // [punta izquierda, punta derecha]
  lg.passes = 0;
  lg.phase = 'play';
  lg.must = null;
}

export function init(ids, seed, prevWins = {}) {
  const order = ids.slice(0, 4);
  const wins = {};
  for (const id of order) wins[id] = prevWins[id] || 0;
  const lg = {
    order, teams: order.length === 4, target: TARGET,
    score: {}, wins, hn: 1, seed: seed >>> 0,
    turn: 0, tn: 1, ev: null, win: null, last: null, hand: null,
  };
  for (const s of sides(lg)) lg.score[s] = 0;
  deal(lg, seed);
  // primera mano: el doble seis (o el doble más alto; si no hay dobles, la ficha más alta)
  const holders = [];
  for (const id of order) for (const t of lg.hands[id]) holders.push([id, t]);
  holders.sort(([, a], [, b]) => (isDouble(b) - isDouble(a)) || (pips(b) - pips(a)));
  const [first, tile] = holders[0];
  lg.turn = order.indexOf(first);
  lg.must = tile;
  return lg;
}

export const current = (lg) => lg.order[lg.turn];

// ¿Dónde puede ir esta ficha? → lista de lados 'L' / 'R'
export function sidesFor(lg, t) {
  if (!lg.line.length) return lg.must && lg.must !== t ? [] : ['R'];
  const [l, r] = lg.ends;
  const out = [];
  if (has(t, l)) out.push('L');
  if (has(t, r) && (l !== r || !out.length)) out.push('R');
  return out;
}
export const playable = (lg, id) => (lg.hands[id] || []).filter((t) => sidesFor(lg, t).length);

function nextTurn(lg) {
  lg.turn = (lg.turn + 1) % lg.order.length;
}

function endHand(lg, why, winner) {
  const left = {};
  for (const id of lg.order) left[id] = lg.hands[id].reduce((s, t) => s + pips(t), 0);
  let winSide = null;
  if (why === 'domino') winSide = sideOf(lg, winner);
  else {
    // tranque: gana el lado con menos puntos en la mano (empate: nadie)
    const tot = {};
    for (const s of sides(lg)) tot[s] = membersOf(lg, s).reduce((a, id) => a + left[id], 0);
    const best = Math.min(...Object.values(tot));
    const low = sides(lg).filter((s) => tot[s] === best);
    if (low.length === 1) winSide = low[0];
    // en tranque, entre los de ese lado "gana" el que tenga menos
    if (winSide) winner = membersOf(lg, winSide).sort((a, b) => left[a] - left[b])[0];
  }
  let pts = 0;
  if (winSide) {
    for (const id of lg.order) if (sideOf(lg, id) !== winSide) pts += left[id];
    lg.score[winSide] += pts;
  }
  lg.hand = { n: lg.hn, why, winner: winSide ? winner : null, side: winSide, pts, left, reveal: JSON.parse(JSON.stringify(lg.hands)) };
  lg.phase = 'hand';
  lg.tn++;
  if (winSide && lg.score[winSide] >= lg.target) {
    lg.win = winner;
    lg.winSide = winSide;
    for (const id of membersOf(lg, winSide)) lg.wins[id] = (lg.wins[id] || 0) + 1;
    lg.phase = 'end';
  }
}

// Acciones: { t: 'play', tile, side } · { t: 'draw' } · { t: 'pass' } · { t: 'next' }
export function act(lg, pid, a) {
  if (!a || lg.win || !lg.order.includes(pid)) return false;
  if (a.t === 'next') {
    // siguiente mano (cualquiera puede darle; el anfitrión lo hace solo al rato)
    if (lg.phase !== 'hand') return false;
    const h = lg.hand;
    const starter = h && h.winner ? h.winner : lg.order[(lg.order.indexOf(lg.starter || lg.order[0]) + 1) % lg.order.length];
    lg.hn++;
    lg.seed = (Math.imul(lg.seed, 1103515245) + 12345) >>> 0;
    deal(lg, lg.seed);
    lg.turn = lg.order.indexOf(starter);
    lg.starter = starter;
    lg.ev = { t: 'deal', p: starter, n: lg.hn };
    lg.tn++;
    return true;
  }
  if (lg.phase !== 'play' || current(lg) !== pid) return false;
  const hand = lg.hands[pid];
  if (a.t === 'play') {
    const t = a.tile;
    const i = hand.indexOf(t);
    if (i < 0) return false;
    const ok = sidesFor(lg, t);
    const side = ok.includes(a.side) ? a.side : ok.length === 1 ? ok[0] : null;
    if (!side) return false;
    hand.splice(i, 1);
    if (!lg.line.length) {
      lg.line.push({ a: +t[0], b: +t[1] });
      lg.c = 0;
      lg.ends = [+t[0], +t[1]];
      if (!lg.starter) lg.starter = pid;
    } else if (side === 'L') {
      const v = lg.ends[0];
      lg.line.unshift({ a: other(t, v), b: v });
      lg.c++;
      lg.ends[0] = other(t, v);
    } else {
      const v = lg.ends[1];
      lg.line.push({ a: v, b: other(t, v) });
      lg.ends[1] = other(t, v);
    }
    lg.must = null;
    lg.passes = 0;
    lg.last = { p: pid, tile: t, side };
    lg.ev = { t: 'play', p: pid, tile: t, side, n: lg.tn };
    lg.tn++;
    if (!hand.length) { endHand(lg, 'domino', pid); return true; }
    nextTurn(lg);
    return true;
  }
  if (a.t === 'draw') {
    if (playable(lg, pid).length || !lg.pozo.length) return false;
    let k = 0;
    while (lg.pozo.length) {
      const t = lg.pozo.pop();
      hand.push(t);
      k++;
      if (sidesFor(lg, t).length) break;
    }
    lg.ev = { t: 'draw', p: pid, k, n: lg.tn };
    lg.tn++;
    return true;
  }
  if (a.t === 'pass') {
    if (playable(lg, pid).length || lg.pozo.length) return false;
    lg.passes++;
    lg.ev = { t: 'pass', p: pid, n: lg.tn };
    lg.tn++;
    if (lg.passes >= lg.order.length) { endHand(lg, 'tranque', null); return true; }
    nextTurn(lg);
    return true;
  }
  return false;
}

// El anfitrión hace solo lo que no tiene opción (pasar, robar) y la siguiente mano.
export function autoDelay(lg) {
  if (lg.phase === 'hand') return HAND_MS;
  if (lg.phase === 'play' && !playable(lg, current(lg)).length) return FORCED_MS;
  return null;
}

// ---------------------------------------------------------------- bot
export function autoMove(lg, pid) {
  if (lg.phase === 'hand') return { t: 'next' };
  const hand = lg.hands[pid] || [];
  const ok = playable(lg, pid);
  if (!ok.length) return lg.pozo.length ? { t: 'draw' } : { t: 'pass' };
  let best = null, bs = -Infinity;
  for (const t of ok) {
    for (const side of sidesFor(lg, t)) {
      const rest = hand.filter((x) => x !== t);
      // punta que queda abierta después de jugar
      const open = !lg.line.length ? null : other(t, lg.ends[side === 'L' ? 0 : 1]);
      const keep = open === null ? 0 : rest.filter((x) => has(x, open)).length;
      const v = pips(t) + (isDouble(t) ? 6 : 0) + keep * 3 + Math.random() * 2;
      if (v > bs) { bs = v; best = { t: 'play', tile: t, side }; }
    }
  }
  return best;
}
