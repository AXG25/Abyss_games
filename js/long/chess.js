// ♟ Ajedrez — reglas completas (sin interfaz), solo para 2 jugadores.
// Todo lo decide el anfitrión con estas funciones puras sobre `lg`.
//
//  - Enroque, captura al paso, coronación (eliges la pieza), jaque y jaque mate.
//  - Tablas: rey ahogado, triple repetición, 50 movimientos, material
//    insuficiente y por acuerdo (ofrecer tablas).
//  - Reloj: 10 min por jugador + 3 s por jugada. Empieza a correr cuando los
//    dos ya movieron una vez. Si se te acaba, pierdes. Si te desconectas más
//    de 1 min en tu turno, pierdes por abandono.
//
// El tablero es un texto de 64 letras (como FEN): índice 0 = a8 … 63 = h1.
//   Mayúsculas blancas, minúsculas negras, '.' vacío. P peón, N caballo,
//   B alfil, R torre, Q dama, K rey.
import { mulberry32 } from '../util.js';

export const START = 'rnbqkbnrpppppppp' + '.'.repeat(32) + 'PPPPPPPPRNBQKBNR';
export const CLOCK_MS = 10 * 60000;
export const INC_MS = 3000;
export const ABANDON_MS = 60000;
// sin tiempo por turno: el ajedrez usa reloj (onTime) en vez de jugar solo
export const TURN_MS = 0;
export const OFF_TURN_MS = 0;

const FILES = 'abcdefgh';
export const sqName = (i) => FILES[i & 7] + (8 - (i >> 3));
export const colorOf = (p) => (p === '.' || !p ? null : p === p.toUpperCase() ? 'w' : 'b');
const opp = (c) => (c === 'w' ? 'b' : 'w');

const N_OFF = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const K_OFF = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const B_DIR = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const R_DIR = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// ¿La casilla `sq` está atacada por el color `by`?
export function attacked(b, sq, by) {
  const r = sq >> 3, c = sq & 7;
  const w = by === 'w';
  const pr = w ? r + 1 : r - 1;
  const P = w ? 'P' : 'p';
  if (pr >= 0 && pr < 8) {
    if (c > 0 && b[pr * 8 + c - 1] === P) return true;
    if (c < 7 && b[pr * 8 + c + 1] === P) return true;
  }
  const N = w ? 'N' : 'n', K = w ? 'K' : 'k';
  for (const [dr, dc] of N_OFF) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === N) return true; }
  for (const [dr, dc] of K_OFF) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr * 8 + cc] === K) return true; }
  const B = w ? 'B' : 'b', R = w ? 'R' : 'r', Q = w ? 'Q' : 'q';
  for (const [dr, dc] of B_DIR) {
    for (let rr = r + dr, cc = c + dc; rr >= 0 && rr < 8 && cc >= 0 && cc < 8; rr += dr, cc += dc) {
      const p = b[rr * 8 + cc];
      if (p === '.') continue;
      if (p === B || p === Q) return true;
      break;
    }
  }
  for (const [dr, dc] of R_DIR) {
    for (let rr = r + dr, cc = c + dc; rr >= 0 && rr < 8 && cc >= 0 && cc < 8; rr += dr, cc += dc) {
      const p = b[rr * 8 + cc];
      if (p === '.') continue;
      if (p === R || p === Q) return true;
      break;
    }
  }
  return false;
}

// Movimientos posibles sin mirar si dejan al rey en jaque.
function pseudo(pos) {
  const { b, turn, castle, ep } = pos;
  const out = [];
  const white = turn === 'w';
  const mine = (p) => p !== '.' && colorOf(p) === turn;
  const theirs = (p) => p !== '.' && colorOf(p) !== turn;
  for (let f = 0; f < 64; f++) {
    const p = b[f];
    if (!mine(p)) continue;
    const r = f >> 3, c = f & 7;
    const t = p.toLowerCase();
    if (t === 'p') {
      const dir = white ? -1 : 1;
      const last = white ? 0 : 7;
      const push = (to, extra = {}) => {
        if ((to >> 3) === last) for (const q of ['q', 'r', 'b', 'n']) out.push({ f, t: to, p: q, ...extra });
        else out.push({ f, t: to, ...extra });
      };
      const one = f + dir * 8;
      if (one >= 0 && one < 64 && b[one] === '.') {
        push(one);
        const two = f + dir * 16;
        if (r === (white ? 6 : 1) && b[two] === '.') out.push({ f, t: two, dbl: 1 });
      }
      for (const dc of [-1, 1]) {
        const cc = c + dc, rr = r + dir;
        if (cc < 0 || cc > 7 || rr < 0 || rr > 7) continue;
        const to = rr * 8 + cc;
        if (theirs(b[to])) push(to);
        else if (to === ep) out.push({ f, t: to, ep: 1 });
      }
    } else if (t === 'n' || t === 'k') {
      for (const [dr, dc] of t === 'n' ? N_OFF : K_OFF) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
        const to = rr * 8 + cc;
        if (!mine(b[to])) out.push({ f, t: to });
      }
      if (t === 'k') {
        const by = opp(turn);
        if (white && f === 60) {
          if (castle.includes('K') && b[61] === '.' && b[62] === '.' && b[63] === 'R' && !attacked(b, 60, by) && !attacked(b, 61, by) && !attacked(b, 62, by)) out.push({ f, t: 62, c: 1 });
          if (castle.includes('Q') && b[59] === '.' && b[58] === '.' && b[57] === '.' && b[56] === 'R' && !attacked(b, 60, by) && !attacked(b, 59, by) && !attacked(b, 58, by)) out.push({ f, t: 58, c: 1 });
        }
        if (!white && f === 4) {
          if (castle.includes('k') && b[5] === '.' && b[6] === '.' && b[7] === 'r' && !attacked(b, 4, by) && !attacked(b, 5, by) && !attacked(b, 6, by)) out.push({ f, t: 6, c: 1 });
          if (castle.includes('q') && b[3] === '.' && b[2] === '.' && b[1] === '.' && b[0] === 'r' && !attacked(b, 4, by) && !attacked(b, 3, by) && !attacked(b, 2, by)) out.push({ f, t: 2, c: 1 });
        }
      }
    } else {
      const dirs = t === 'b' ? B_DIR : t === 'r' ? R_DIR : [...B_DIR, ...R_DIR];
      for (const [dr, dc] of dirs) {
        for (let rr = r + dr, cc = c + dc; rr >= 0 && rr < 8 && cc >= 0 && cc < 8; rr += dr, cc += dc) {
          const to = rr * 8 + cc;
          if (mine(b[to])) break;
          out.push({ f, t: to });
          if (b[to] !== '.') break;
        }
      }
    }
  }
  return out;
}

// Aplica un movimiento: devuelve la posición nueva (no cambia la original).
export function play(pos, m) {
  const b = pos.b.slice();
  const p = b[m.f];
  let capt = b[m.t] !== '.' ? b[m.t] : null;
  b[m.t] = m.p ? (pos.turn === 'w' ? m.p.toUpperCase() : m.p.toLowerCase()) : p;
  b[m.f] = '.';
  if (m.ep) { const s = m.t + (pos.turn === 'w' ? 8 : -8); capt = b[s]; b[s] = '.'; }
  if (m.c) {
    if (m.t === 62) { b[61] = b[63]; b[63] = '.'; } else if (m.t === 58) { b[59] = b[56]; b[56] = '.'; } else if (m.t === 6) { b[5] = b[7]; b[7] = '.'; } else if (m.t === 2) { b[3] = b[0]; b[0] = '.'; }
  }
  let castle = pos.castle;
  const strip = (ch) => { castle = castle.replace(ch, ''); };
  if (p === 'K') { strip('K'); strip('Q'); }
  if (p === 'k') { strip('k'); strip('q'); }
  if (m.f === 63 || m.t === 63) strip('K');
  if (m.f === 56 || m.t === 56) strip('Q');
  if (m.f === 7 || m.t === 7) strip('k');
  if (m.f === 0 || m.t === 0) strip('q');
  return {
    b, turn: opp(pos.turn), castle,
    ep: m.dbl ? (m.f + m.t) / 2 : -1,
    half: p === 'P' || p === 'p' || capt ? 0 : (pos.half || 0) + 1,
    capt,
  };
}

const kingSq = (b, c) => b.indexOf(c === 'w' ? 'K' : 'k');
export const inCheck = (pos) => attacked(pos.b, kingSq(pos.b, pos.turn), opp(pos.turn));

export function legalMoves(pos) {
  return pseudo(pos).filter((m) => {
    const n = play(pos, m);
    return !attacked(n.b, kingSq(n.b, pos.turn), n.turn);
  });
}

export const posOf = (lg) => ({ b: lg.b.split(''), turn: lg.turn, castle: lg.castle, ep: lg.ep, half: lg.half });

function insufficient(b) {
  const rest = [];
  for (let i = 0; i < 64; i++) { const p = b[i]; if (p !== '.' && p !== 'K' && p !== 'k') rest.push([p.toLowerCase(), i]); }
  if (!rest.length) return true;
  if (rest.length === 1 && (rest[0][0] === 'b' || rest[0][0] === 'n')) return true;
  if (rest.every(([t]) => t === 'b')) {
    const shade = (i) => ((i >> 3) + (i & 7)) % 2;
    return rest.every(([, i]) => shade(i) === shade(rest[0][1]));
  }
  return false;
}

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(36); };
const keyOf = (pos) => hash(pos.b.join('') + pos.turn + pos.castle + pos.ep);

// Notación en español: R rey, D dama, T torre, A alfil, C caballo.
const LETTER = { k: 'R', q: 'D', r: 'T', b: 'A', n: 'C' };
export function san(pos, m, all = legalMoves(pos)) {
  const p = pos.b[m.f].toLowerCase();
  let s;
  if (m.c) s = (m.t & 7) === 6 ? 'O-O' : 'O-O-O';
  else {
    const cap = pos.b[m.t] !== '.' || m.ep;
    if (p === 'p') s = (cap ? FILES[m.f & 7] + 'x' : '') + sqName(m.t) + (m.p ? '=' + LETTER[m.p] : '');
    else {
      const twins = all.filter((o) => o.t === m.t && o.f !== m.f && pos.b[o.f].toLowerCase() === p);
      let dis = '';
      if (twins.length) {
        if (!twins.some((o) => (o.f & 7) === (m.f & 7))) dis = FILES[m.f & 7];
        else if (!twins.some((o) => (o.f >> 3) === (m.f >> 3))) dis = String(8 - (m.f >> 3));
        else dis = sqName(m.f);
      }
      s = LETTER[p] + dis + (cap ? 'x' : '') + sqName(m.t);
    }
  }
  const n = play(pos, m);
  if (inCheck(n)) s += legalMoves(n).length ? '+' : '#';
  return s;
}

// ---------------------------------------------------------------- partida
export function init(ids, seed, prevWins = {}, prev = null) {
  const r = mulberry32(seed);
  // revancha: se cambian los colores; primera partida: al azar
  let order = ids.slice(0, 2);
  if (prev && prev.order && prev.order.length === 2 && order.includes(prev.order[0]) && order.includes(prev.order[1])) order = [prev.order[1], prev.order[0]];
  else if (r() < 0.5) order.reverse();
  const wins = {};
  for (const id of order) wins[id] = prevWins[id] || 0;
  const pos = { b: START.split(''), turn: 'w', castle: 'KQkq', ep: -1 };
  return {
    order,            // [blancas, negras]
    b: START, turn: 'w', castle: 'KQkq', ep: -1, half: 0,
    moves: [],        // jugadas en notación (para la lista)
    last: null,       // { f, t } última jugada (para resaltarla)
    capt: { w: '', b: '' },   // piezas que capturó cada color
    hist: [keyOf(pos)],
    clk: { w: CLOCK_MS, b: CLOCK_MS },
    offer: null, offerPly: -9,
    tn: 1,
    ev: null,
    win: null, end: false, why: null,
    wins, draws: (prev && prev.draws) || 0,
    lvl: (prev && prev.lvl) || 'normal',   // nivel del bot: easy · normal · hard (se queda para la revancha)
  };
}

export const current = (lg) => (lg.turn === 'w' ? lg.order[0] : lg.order[1]);
export const colorFor = (lg, id) => (lg.order[0] === id ? 'w' : lg.order[1] === id ? 'b' : null);
const clocksOn = (lg) => lg.moves.length >= 2;

function finish(lg, winner, why) {
  lg.end = true;
  lg.win = winner;
  lg.why = why;
  lg.offer = null;
  if (winner) lg.wins[winner] = (lg.wins[winner] || 0) + 1;
  else lg.draws = (lg.draws || 0) + 1;
  lg.tn++;
}

// Acciones:
//   { t: 'move', f, to, p? }  mover de f a to (p = pieza al coronar: q r b n)
//   { t: 'resign' }           rendirse
//   { t: 'offer' }            ofrecer tablas
//   { t: 'draw-yes' } / { t: 'draw-no' }  responder a la oferta
//   { t: 'level', v }         nivel del bot (easy · normal · hard)
export function act(lg, pid, a, info = {}) {
  if (!a || lg.end) return false;
  const col = colorFor(lg, pid);
  if (!col) return false;
  if (a.t === 'resign') { finish(lg, lg.order[col === 'w' ? 1 : 0], 'resign'); return true; }
  if (a.t === 'level') {
    if (!LEVELS.includes(a.v) || a.v === lg.lvl) return false;
    lg.lvl = a.v;
    lg.ev = { t: 'level', p: pid, v: a.v, n: lg.moves.length };
    return true;
  }
  if (a.t === 'offer') {
    if (lg.offer || lg.offerPly === lg.moves.length) return false;
    lg.offer = col;
    lg.offerPly = lg.moves.length;
    lg.ev = { t: 'offer', p: pid, n: lg.moves.length };
    return true;
  }
  if (a.t === 'draw-yes' || a.t === 'draw-no') {
    if (!lg.offer || lg.offer === col) return false;
    if (a.t === 'draw-yes') finish(lg, null, 'agreement');
    else { lg.offer = null; lg.ev = { t: 'decline', p: pid, n: lg.moves.length }; }
    return true;
  }
  if (a.t !== 'move' || col !== lg.turn) return false;
  const pos = posOf(lg);
  const all = legalMoves(pos);
  const m = all.find((x) => x.f === a.f && x.t === a.to && (x.p || null) === (a.p || null));
  if (!m) return false;
  // reloj
  if (clocksOn(lg)) {
    const left = lg.clk[col] - Math.max(0, info.elapsed || 0);
    if (left <= 0) { lg.clk[col] = 0; finish(lg, lg.order[col === 'w' ? 1 : 0], 'time'); return true; }
    lg.clk[col] = Math.min(CLOCK_MS * 3, left + INC_MS);
  }
  const s = san(pos, m, all);
  const n = play(pos, m);
  lg.b = n.b.join('');
  lg.turn = n.turn;
  lg.castle = n.castle;
  lg.ep = n.ep;
  lg.half = n.half;
  lg.moves.push(s);
  lg.last = { f: m.f, t: m.t };
  if (n.capt) lg.capt[col] += n.capt.toLowerCase();
  if (n.half === 0) lg.hist = [];
  const key = keyOf(n);
  lg.hist.push(key);
  lg.offer = null;
  // para los avisos: pieza comida, enroque, coronación, captura al paso y jaque
  lg.ev = { t: 'move', p: pid, s, cap: n.capt ? 1 : 0, capP: n.capt ? n.capt.toLowerCase() : null, castle: m.c ? 1 : 0, promo: m.p || null, ep: m.ep ? 1 : 0, check: inCheck(n) ? 1 : 0, f: m.f, to: m.t, n: lg.moves.length };
  lg.tn++;
  // ¿se terminó?
  const replies = legalMoves(n);
  if (!replies.length) {
    if (inCheck(n)) finish(lg, pid, 'mate');
    else finish(lg, null, 'stalemate');
  } else if (insufficient(n.b)) finish(lg, null, 'material');
  else if (lg.hist.filter((k) => k === key).length >= 3) finish(lg, null, 'repetition');
  else if (n.half >= 100) finish(lg, null, 'fifty');
  return true;
}

// El anfitrión lo llama seguido: pierde quien se queda sin tiempo o abandona.
export function onTime(lg, elapsed, offMs) {
  if (lg.end) return false;
  const col = lg.turn;
  const loser = col === 'w' ? 0 : 1;
  if (clocksOn(lg) && lg.clk[col] - elapsed <= 0) { lg.clk[col] = 0; finish(lg, lg.order[1 - loser], 'time'); return true; }
  if (offMs > ABANDON_MS) { finish(lg, lg.order[1 - loser], 'abandon'); return true; }
  return false;
}

export const WHY = {
  mate: 'Jaque mate',
  resign: 'Por rendición',
  time: 'Se acabó el tiempo',
  abandon: 'Por abandono',
  stalemate: 'Tablas: rey ahogado',
  material: 'Tablas: material insuficiente',
  repetition: 'Tablas: triple repetición',
  fifty: 'Tablas: 50 movimientos',
  agreement: 'Tablas por acuerdo',
};

// ---------------------------------------------------------------- bot
// Busca 2 jugadas (más capturas) con poda alfa-beta y una evaluación sencilla
// (material + posición). Juega bien para principiantes, con un poco de azar.
const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const center = (i) => 7 - (Math.abs((i >> 3) - 3.5) + Math.abs((i & 7) - 3.5));

function evaluate(pos) {
  const b = pos.b;
  let s = 0;
  let queens = 0;
  for (let i = 0; i < 64; i++) if (b[i] === 'q' || b[i] === 'Q') queens++;
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (p === '.') continue;
    const w = p === p.toUpperCase();
    const t = p.toLowerCase();
    const r = i >> 3;
    let v = VAL[t];
    if (t === 'n' || t === 'b') v += center(i) * 5;
    else if (t === 'p') v += (w ? 6 - r : r - 1) * (queens ? 6 : 14) + (center(i) > 4 ? 6 : 0);
    else if (t === 'q') v += center(i) * 1.5;
    else if (t === 'k') v += queens ? (r === (w ? 7 : 0) ? 12 : -10) - center(i) * 3 : center(i) * 4;
    s += w ? v : -v;
  }
  return pos.turn === 'w' ? s : -s;
}

const MATE = 100000;
const order = (pos, ms) => ms
  .map((m) => ({ m, k: (pos.b[m.t] !== '.' ? VAL[pos.b[m.t].toLowerCase()] * 10 - VAL[pos.b[m.f].toLowerCase()] : 0) + (m.p === 'q' ? 800 : 0) }))
  .sort((a, b) => b.k - a.k)
  .map((x) => x.m);

// Tiempo máximo para pensar: se corta la búsqueda y se usa la última profundidad completa.
let stopAt = Infinity, nodes = 0;
const STOP = { stop: true };
const tick = () => { if ((++nodes & 511) === 0 && Date.now() > stopAt) throw STOP; };

function quiesce(pos, alpha, beta, d) {
  tick();
  const stand = evaluate(pos);
  if (stand >= beta || d <= 0) return stand;
  if (stand > alpha) alpha = stand;
  const caps = order(pos, legalMoves(pos).filter((m) => pos.b[m.t] !== '.' || m.ep || m.p === 'q'));
  for (const m of caps) {
    const sc = -quiesce(play(pos, m), -beta, -alpha, d - 1);
    if (sc >= beta) return sc;
    if (sc > alpha) alpha = sc;
  }
  return alpha;
}

function search(pos, depth, alpha, beta, ply) {
  tick();
  const ms = legalMoves(pos);
  if (!ms.length) return inCheck(pos) ? -MATE + ply : 0;
  if (depth <= 0) return quiesce(pos, alpha, beta, 4);
  let best = -Infinity;
  for (const m of order(pos, ms)) {
    const sc = -search(play(pos, m), depth - 1, -beta, -alpha, ply + 1);
    if (sc > best) best = sc;
    if (sc > alpha) alpha = sc;
    if (alpha >= beta) break;
  }
  return best;
}

// Mejor jugada: piensa 1, 2, … hasta `depth` jugadas y se queda con la última
// profundidad que alcanzó a terminar dentro de `budget` ms (así nunca se demora).
export function bestMove(pos, depth = 2, rnd = Math.random, budget = 700) {
  const ms = legalMoves(pos);
  if (!ms.length) return null;
  const sorted = order(pos, ms);
  let done = sorted[0];
  stopAt = Date.now() + budget;
  nodes = 0;
  try {
    for (let d = 1; d <= depth; d++) {
      let best = null, bs = -Infinity;
      for (const m of sorted) {
        const sc = -search(play(pos, m), d - 1, -Infinity, Infinity, 1) + rnd() * 18;
        if (sc > bs) { bs = sc; best = m; }
      }
      done = best;
    }
  } catch (e) {
    if (e !== STOP) throw e;
  } finally {
    stopAt = Infinity;
  }
  return done;
}

export const LEVELS = ['easy', 'normal', 'hard'];
// nivel del bot: fácil (mira 1 jugada y se equivoca seguido), normal (2; 3 con
// pocas piezas) y difícil (siempre 3, sin errores al azar)
export function autoMove(lg) {
  const pos = posOf(lg);
  const pieces = lg.b.replace(/\./g, '').length;
  const lvl = lg.lvl || 'normal';
  const m = lvl === 'easy' ? bestMove(pos, 1, () => Math.random() * 9)
    : lvl === 'hard' ? bestMove(pos, 3, () => Math.random() * 0.4)
      : bestMove(pos, pieces <= 10 ? 3 : 2);
  return m ? { t: 'move', f: m.f, to: m.t, p: m.p } : { t: 'resign' };
}
