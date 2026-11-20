// 🌪️ Caos — juego de cartas original de Abyss Games (reglas, sin interfaz).
// Cartas de 4 elementos: fuego (f), agua (a), planta (p) y rayo (r).
//
//  - Por elemento: números 0 a 9 (el 0 una vez, el resto dos), y dos de cada
//    acción: BLOQUEO (S, el siguiente pierde su turno), DIRECCIÓN (G, cambia el
//    sentido) y +2 (D). Además 4 cartas de ELEMENTO (X, cambias el elemento) y 4 +4 (Y).
//  - Se reparten 7. Juegas una carta del mismo ELEMENTO o del mismo NÚMERO/ACCIÓN
//    que la del centro. Los comodines y el +4 se juegan sobre cualquiera y eliges elemento.
//  - Regla de la casa: los +2 y +4 SE SUMAN. Si te tiran un +2 o un +4 puedes
//    responder con otro +2 o +4 (de cualquier elemento) y el castigo crece.
//    Quien no pueda (o no quiera) responder se come TODO lo acumulado y pierde el turno.
//  - Si no tienes jugada robas 1; si sirve la puedes tirar, si no pasas.
//  - Gana quien se quede sin cartas.
//
// Cada carta tiene un id único: código + '#' + copia, p. ej. 'f7#1', 'rD#0', 'Y#3'.
//
// Cada jugada queda en `lg.ev` (y las últimas 3 en `lg.hist`) con lo que hace falta
// para explicarla: el elemento que había antes de un comodín (was), a quién le
// toca responder el +2/+4 (to) y cuánto va (stack), a quién se bloqueó (skip), si
// cambió la dirección (rev), si la carta robada sirve (keep) y quién sigue (next).
import { mulberry32, shuffle } from '../util.js';

export const ELEMS = ['f', 'a', 'p', 'r'];
export const ELEM_NAME = { f: 'Fuego', a: 'Agua', p: 'Planta', r: 'Rayo' };
export const TURN_MS = 30000;
export const OFF_TURN_MS = 6000;
export const BOT_MS = [800, 1500];
export const START_MS = 2600;      // los bots esperan a que se vea el reparto de cartas

export const codeOf = (c) => c.split('#')[0];
export const elemOf = (c) => { const k = codeOf(c); return ELEMS.includes(k[0]) ? k[0] : null; };
export const kindOf = (c) => { const k = codeOf(c); return ELEMS.includes(k[0]) ? k.slice(1) : k; };
const isWild = (c) => elemOf(c) === null;
const isDraw = (c) => { const k = kindOf(c); return k === 'D' || k === 'Y'; };
const drawValue = (c) => (kindOf(c) === 'Y' ? 4 : kindOf(c) === 'D' ? 2 : 0);

function newDeck(r) {
  const d = [];
  for (const e of ELEMS) {
    d.push(`${e}0#0`);
    for (let n = 1; n <= 9; n++) for (let k = 0; k < 2; k++) d.push(`${e}${n}#${k}`);
    for (const a of ['S', 'G', 'D']) for (let k = 0; k < 2; k++) d.push(`${e}${a}#${k}`);
  }
  for (let k = 0; k < 4; k++) { d.push(`X#${k}`); d.push(`Y#${k}`); }
  return shuffle(d, r);
}

export function init(ids, seed, prevWins = {}) {
  const r = mulberry32(seed);
  const draw = newDeck(r);
  const hands = {};
  for (const id of ids) hands[id] = draw.splice(0, 7);
  // la primera carta del centro es un número
  let i = draw.findIndex((c) => /^[0-9]$/.test(kindOf(c)));
  if (i < 0) i = 0;
  const top = draw.splice(i, 1)[0];
  const wins = {};
  for (const id of ids) wins[id] = prevWins[id] || 0;
  return {
    order: ids.slice(), hands, draw, disc: [top], elem: elemOf(top),
    turn: Math.floor(r() * ids.length), dir: 1,
    stack: 0,          // cartas acumuladas por +2 / +4 que debe comerse el siguiente
    drawn: null, tn: 1, ev: null, hist: [], win: null, wins,
    seed: (seed * 31 + 7) >>> 0,
  };
}

export const top = (lg) => lg.disc[lg.disc.length - 1];
export const current = (lg) => lg.order[lg.turn];

export function canPlay(lg, c) {
  if (lg.win) return false;
  if (lg.stack > 0) return isDraw(c);          // solo se responde con +2 o +4
  if (lg.drawn && c !== lg.drawn) return false;
  if (isWild(c)) return true;
  return elemOf(c) === lg.elem || kindOf(c) === kindOf(top(lg));
}

const nextIdx = (lg, steps = 1) => {
  const n = lg.order.length;
  return (((lg.turn + lg.dir * steps) % n) + n) % n;
};

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

export function bestElem(hand) {
  const n = { f: 0, a: 0, p: 0, r: 0 };
  for (const c of hand) { const e = elemOf(c); if (e) n[e]++; }
  return ELEMS.reduce((b, e) => (n[e] > n[b] ? e : b), ELEMS[0]);
}

// Acciones: { t: 'play', c, s? } (s = elemento elegido con comodín o +4) · { t: 'draw' } · { t: 'pass' }
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
    const was = lg.elem;
    lg.elem = isWild(c) ? (ELEMS.includes(a.s) ? a.s : bestElem(hand)) : elemOf(c);
    lg.stack += drawValue(c);
    lg.ev = { p: pid, t: 'play', c, s: lg.elem, stack: lg.stack, n: lg.tn };
    if (isWild(c)) lg.ev.was = was;
    if (!hand.length) {
      // gana aunque haya quedado un castigo pendiente
      lg.win = pid;
      lg.wins[pid] = (lg.wins[pid] || 0) + 1;
      lg.drawn = null;
      lg.tn++;
      logEv(lg);
      return true;
    }
    const k = kindOf(c);
    let steps = 1;
    if (k === 'S') steps = 2;
    else if (k === 'G') { if (lg.order.length === 2) steps = 2; else { lg.dir *= -1; lg.ev.rev = 1; } }
    if (steps === 2) lg.ev.skip = lg.order[nextIdx(lg, 1)];   // a quién se le bloqueó el turno
    if (isDraw(c)) lg.ev.to = lg.order[nextIdx(lg, 1)];        // quién debe responder o comerse todo
    endTurn(lg, steps);
    logEv(lg);
    return true;
  }
  if (a.t === 'draw') {
    if (lg.stack > 0) {
      // se come todo lo acumulado y pierde el turno
      const n = lg.stack;
      let got = 0;
      for (let j = 0; j < n; j++) { const c = takeCard(lg); if (c) { hand.push(c); got++; } }
      lg.stack = 0;
      lg.ev = { p: pid, t: 'take', k: got, n: lg.tn };
      endTurn(lg);
      logEv(lg);
      return true;
    }
    if (lg.drawn) return false;
    const c = takeCard(lg);
    lg.ev = { p: pid, t: 'draw', k: c ? 1 : 0, n: lg.tn };
    if (!c) { endTurn(lg); logEv(lg); return true; }
    hand.push(c);
    lg.drawn = c;
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

// Jugada automática: bots y quien se queda sin tiempo.
export function autoMove(lg, pid) {
  const hand = lg.hands[pid] || [];
  const ok = hand.filter((c) => canPlay(lg, c));
  if (!ok.length) return lg.drawn ? { t: 'pass' } : { t: 'draw' };
  const nextHand = lg.hands[lg.order[nextIdx(lg)]] || [];
  const score = (c) => {
    const k = kindOf(c);
    if (lg.stack > 0) return k === 'D' ? 5 : 3;                  // responde primero con +2 y guarda el +4
    let v = 0;
    if (isWild(c)) v -= 8;                                          // los comodines se guardan
    if (k === 'D' || k === 'S') v += nextHand.length <= 2 ? 8 : 1;
    if (k === 'Y') v += nextHand.length <= 2 ? 6 : -4;
    v += hand.filter((x) => elemOf(x) === elemOf(c)).length;
    if (/^[0-9]$/.test(k)) v += +k / 10;
    return v;
  };
  ok.sort((a, b) => score(b) - score(a));
  const c = ok[0];
  return { t: 'play', c, s: isWild(c) ? bestElem(hand.filter((x) => x !== c)) : undefined };
}

export function ranking(lg) {
  return lg.order.slice().sort((a, b) => {
    if (a === lg.win) return -1;
    if (b === lg.win) return 1;
    return (lg.hands[a]?.length || 0) - (lg.hands[b]?.length || 0);
  });
}
