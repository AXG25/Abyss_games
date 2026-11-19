// 🃏 Ocho loco — reglas (sin interfaz). Juego de cartas tradicional con la
// baraja francesa de 52 cartas. Todo lo decide el anfitrión: estas funciones
// son puras sobre el estado `lg`, que el anfitrión publica a todos.
//
// Reglas:
//  - Se reparten 7 cartas (6 si son 4 jugadores). Se voltea una carta al centro.
//  - En tu turno juegas una carta del mismo PALO o del mismo NÚMERO que la del centro.
//  - El 8 es comodín: se juega sobre cualquier carta y eliges el palo que sigue.
//  - El 2 hace robar 2 al siguiente. Se puede responder con otro 2 y se acumula (+4, +6…).
//  - La J salta al siguiente jugador. La Q cambia el sentido (con 2 jugadores, salta).
//  - Si no puedes o no quieres jugar, robas 1. Si esa carta sirve, puedes jugarla; si no, pasas.
//  - Gana quien se quede sin cartas.
//
// Cada jugada queda en `lg.ev` (y las últimas 3 en `lg.hist`) con lo que hace falta
// para explicarla: a quién saltó la J (skip), si la Q cambió el sentido (rev),
// a quién le toca responder el +2 (to, sum), si la carta robada sirve (keep),
// el palo que había antes de un 8 (was) y quién juega después (next).
//
// Cartas: texto de 2-3 letras, palo + número: 'H8', 'S10', 'DQ', 'CA'.
//   Palos: H corazones, D diamantes, C tréboles, S picas.
import { mulberry32, shuffle } from '../util.js';

export const SUITS = ['H', 'D', 'C', 'S'];
export const SUIT_NAME = { H: 'Corazones', D: 'Diamantes', C: 'Tréboles', S: 'Picas' };
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const TURN_MS = 30000;      // tiempo por turno (si se acaba, juega solo)
export const OFF_TURN_MS = 6000;   // tiempo por turno de alguien desconectado
export const START_MS = 2600;      // los bots esperan a que se vea el reparto de cartas

export const suitOf = (c) => c[0];
export const rankOf = (c) => c.slice(1);
const SPECIAL = new Set(['2', '8', 'J', 'Q']);

function newDeck(r) {
  const d = [];
  for (const s of SUITS) for (const k of RANKS) d.push(s + k);
  return shuffle(d, r);
}

export function init(ids, seed, prevWins = {}) {
  const r = mulberry32(seed);
  const draw = newDeck(r);
  const per = ids.length >= 4 ? 6 : 7;
  const hands = {};
  for (const id of ids) hands[id] = draw.splice(0, per);
  // la primera carta del centro es un número normal (sin efectos)
  let i = draw.findIndex((c) => !SPECIAL.has(rankOf(c)));
  if (i < 0) i = 0;
  const top = draw.splice(i, 1)[0];
  const wins = {};
  for (const id of ids) wins[id] = prevWins[id] || 0;
  return {
    order: ids.slice(),
    hands,
    draw,
    disc: [top],
    suit: suitOf(top),
    turn: Math.floor(r() * ids.length),
    dir: 1,
    stack: 0,          // cartas que debe robar el jugador en turno (por los 2)
    drawn: null,       // carta que acaba de robar el jugador en turno
    tn: 1,             // número de turno (cada acción válida lo cambia)
    ev: null,          // última jugada (para animaciones y sonidos)
    hist: [],          // últimas jugadas (para el historial de la pantalla)
    win: null,
    wins,
    seed: (seed * 7 + 13) >>> 0,
  };
}

export const top = (lg) => lg.disc[lg.disc.length - 1];
export const current = (lg) => lg.order[lg.turn];

// ¿Puede jugarse esta carta ahora?
export function canPlay(lg, c) {
  if (lg.win) return false;
  if (lg.stack > 0) return rankOf(c) === '2';
  if (lg.drawn && c !== lg.drawn) return false;
  if (rankOf(c) === '8') return true;
  return suitOf(c) === lg.suit || rankOf(c) === rankOf(top(lg));
}

const nextIdx = (lg, steps = 1) => {
  const n = lg.order.length;
  return (((lg.turn + lg.dir * steps) % n) + n) % n;
};

// Roba una carta (rebaraja el descarte si se acabó el mazo). null si no hay ninguna.
function takeCard(lg) {
  if (!lg.draw.length && lg.disc.length > 1) {
    const keep = lg.disc.pop();
    lg.seed = (Math.imul(lg.seed, 1103515245) + 12345) >>> 0;
    lg.draw = shuffle(lg.disc, mulberry32(lg.seed));
    lg.disc = [keep];
  }
  return lg.draw.length ? lg.draw.pop() : null;
}

function endTurn(lg, steps = 1) {
  lg.turn = nextIdx(lg, steps);
  lg.drawn = null;
  lg.tn++;
}

// guarda la jugada en el historial (las 3 últimas) y anota quién sigue
function logEv(lg) {
  if (!lg.win) lg.ev.next = current(lg);
  lg.hist = [...(lg.hist || []), lg.ev].slice(-3);
}

// Aplica la acción de un jugador. Devuelve true si cambió algo.
//   { t: 'play', c, s? }  jugar carta (s = palo elegido si es un 8)
//   { t: 'draw' }         robar (o robar el castigo acumulado de los 2)
//   { t: 'pass' }         pasar después de robar
export function act(lg, pid, a) {
  if (!a || lg.win || current(lg) !== pid) return false;
  const hand = lg.hands[pid];
  if (!hand) return false;
  if (a.t === 'play') {
    const c = a.c;
    const i = hand.indexOf(c);
    if (i < 0 || !canPlay(lg, c)) return false;
    hand.splice(i, 1);
    lg.disc.push(c);
    const k = rankOf(c);
    const was = lg.suit;
    lg.suit = k === '8' ? (SUITS.includes(a.s) ? a.s : bestSuit(hand)) : suitOf(c);
    lg.ev = { p: pid, t: 'play', c, s: lg.suit, n: lg.tn };
    if (k === '8') lg.ev.was = was;   // palo que había antes del 8 (para el aviso de cambio)
    if (!hand.length) {
      lg.win = pid;
      lg.wins[pid] = (lg.wins[pid] || 0) + 1;
      lg.drawn = null;
      lg.tn++;
      logEv(lg);
      return true;
    }
    let steps = 1;
    const after = lg.order[nextIdx(lg, 1)];   // el que iba después
    if (k === '2') { lg.stack += 2; lg.ev.to = after; lg.ev.sum = lg.stack; }
    else if (k === 'J') { steps = 2; lg.ev.skip = after; }
    else if (k === 'Q') { if (lg.order.length === 2) { steps = 2; lg.ev.skip = after; } else { lg.dir *= -1; lg.ev.rev = 1; } }
    endTurn(lg, steps);
    logEv(lg);
    return true;
  }
  if (a.t === 'draw') {
    if (lg.stack > 0) {
      const n = lg.stack;
      let got = 0;
      for (let j = 0; j < n; j++) { const c = takeCard(lg); if (c) { hand.push(c); got++; } }
      lg.stack = 0;
      lg.ev = { p: pid, t: 'take', n: lg.tn, k: got };
      endTurn(lg);
      logEv(lg);
      return true;
    }
    if (lg.drawn) return false;
    const c = takeCard(lg);
    lg.ev = { p: pid, t: 'draw', n: lg.tn, k: c ? 1 : 0 };
    if (!c) { endTurn(lg); logEv(lg); return true; }
    hand.push(c);
    lg.drawn = c;
    // si la carta robada no sirve, el turno pasa solo; si sirve, puede jugarla
    if (!canPlay(lg, c)) endTurn(lg);
    else { lg.tn++; lg.ev.keep = 1; }
    logEv(lg);
    return true;
  }
  if (a.t === 'pass') {
    if (!lg.drawn) return false;
    lg.ev = { p: pid, t: 'pass', n: lg.tn };
    endTurn(lg);
    logEv(lg);
    return true;
  }
  return false;
}

// El palo del que más cartas tengo (para elegir con un 8).
export function bestSuit(hand) {
  const n = { H: 0, D: 0, C: 0, S: 0 };
  for (const c of hand) if (rankOf(c) !== '8') n[suitOf(c)]++;
  return SUITS.reduce((b, s) => (n[s] > n[b] ? s : b), SUITS[0]);
}

// Jugada automática: la usan los bots y el jugador al que se le acaba el tiempo.
export function autoMove(lg, pid) {
  const hand = lg.hands[pid] || [];
  const ok = hand.filter((c) => canPlay(lg, c));
  if (!ok.length) return lg.drawn ? { t: 'pass' } : { t: 'draw' };
  const nextHand = lg.hands[lg.order[nextIdx(lg)]] || [];
  const score = (c) => {
    const k = rankOf(c);
    let v = 0;
    if (k === '8') v -= 10;                                  // el 8 se guarda para el final
    if (k === '2' || k === 'J') v += nextHand.length <= 2 ? 6 : 1;   // castiga al que va a ganar
    v += hand.filter((x) => suitOf(x) === suitOf(c)).length; // juega el palo que más tengo
    return v;
  };
  ok.sort((a, b) => score(b) - score(a));
  const c = ok[0];
  const rest = hand.filter((x) => x !== c);
  return { t: 'play', c, s: rankOf(c) === '8' ? bestSuit(rest) : undefined };
}

// Clasificación al terminar: el ganador y luego quien tenga menos cartas.
export function ranking(lg) {
  return lg.order.slice().sort((a, b) => {
    if (a === lg.win) return -1;
    if (b === lg.win) return 1;
    return (lg.hands[a]?.length || 0) - (lg.hands[b]?.length || 0);
  });
}
