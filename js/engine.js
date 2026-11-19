// Motor del anfitrión: el teléfono que crea la sala decide las fases, los
// turnos y los puntos, y lo publica en su `presence` como `st`. Los demás
// teléfonos solo leen `st` y envían sus resultados en su propia `presence.in`.
import { GAMES, GAME_BY_ID } from './games/index.js';
import { LONG_BY_ID } from './long/index.js';
import { mulberry32, shuffle, BOT_NAMES, BOT_AVATARS } from './util.js';
import { validAvatar } from './icons.js';

export const MAX_PLAYERS = 4;
// Id del jugador: el `uid` que cada teléfono pone en su presence (estable si se
// reconecta); si no hay, el `peer`.
const pid = (p) => (typeof p.presence?.uid === 'string' ? p.presence.uid.slice(0, 40) : p.peer);
const INTRO_MS = 4500;
const GRACE_MS = 1500;
const RESULTS_MS = 6000;
const POINTS = [3, 2, 1, 0];

export class Host {
  constructor(nr, prev, onChange) {
    this.nr = nr;
    this.onChange = onChange;
    this.hs = Date.now();
    this.timer = null;
    this.last = '';
    if (prev && prev.pl && prev.ph === 'long' && prev.lg && LONG_BY_ID[prev.lgId]) {
      // el anfitrión anterior se fue a mitad de un juego largo: seguimos la partida
      this.st = { ...prev, k: (prev.k || 0) + 1 };
      this.startLongLoop();
    } else if (prev && prev.pl) {
      this.st = { ...prev, ph: 'lobby', k: (prev.k || 0) + 1, rk: [], lg: null };
    } else {
      this.st = { ph: 'lobby', k: 1, R: 5, r: 0, g: null, seed: 0, pl: [], bots: 0, rk: [], seq: [] };
    }
    this.iv = setInterval(() => this.tick(), 300);
    this.tick();
  }

  destroy() {
    clearInterval(this.iv);
    clearInterval(this.liv);
    clearTimeout(this.timer);
  }

  humans() {
    // Un mismo jugador puede aparecer dos veces un momento si se reconecta: nos quedamos con el más reciente.
    const byId = new Map();
    for (const p of this.nr.peers()) {
      if (p.kind !== 'viewer' || !p.presence || typeof p.presence.name !== 'string') continue;
      const prev = byId.get(pid(p));
      if (!prev || p.isMe || (!prev.isMe && p.updatedAt > prev.updatedAt)) byId.set(pid(p), p);
    }
    return [...byId.values()]
      .sort((a, b) => (Number(a.presence.jt) || 0) - (Number(b.presence.jt) || 0) || (a.peer < b.peer ? -1 : 1));
  }

  tick() {
    const st = this.st;
    const hs = this.humans();
    if (st.ph === 'lobby') {
      const old = Object.fromEntries(st.pl.map((p) => [p.id, p]));
      const pl = [];
      for (const h of hs) {
        if (pl.length >= MAX_PLAYERS) break;
        pl.push({
          id: pid(h),
          n: String(h.presence.name).slice(0, 14),
          a: validAvatar(h.presence.av),
          s: old[h.peer]?.s || 0,
        });
      }
      const nb = Math.min(st.bots, MAX_PLAYERS - pl.length);
      for (let i = 0; i < nb; i++) {
        const id = 'bot' + i;
        pl.push({ id, n: BOT_NAMES[i], a: BOT_AVATARS[i], s: old[id]?.s || 0, b: 1 });
      }
      st.pl = pl;
    } else {
      const here = new Set(hs.map(pid));
      st.pl.forEach((p) => { if (!p.b) p.off = here.has(p.id) ? 0 : 1; });
    }
    this.publish();
  }

  publish() {
    const json = JSON.stringify(this.st);
    if (json === this.last) return;
    this.last = json;
    this.nr.presence({ st: this.st, hs: this.hs }).catch(() => {});
    this.onChange && this.onChange();
  }

  // ---- acciones del anfitrión ----
  setRounds(R) { this.st.R = R; this.publish(); }
  setBots(n) { this.st.bots = Math.max(0, Math.min(MAX_PLAYERS - 1, n)); this.tick(); }

  start(onlyGame = null) {
    this.tick();
    const st = this.st;
    if (!st.pl.length) return;
    const r = mulberry32(Date.now());
    if (onlyGame) {
      st.seq = [onlyGame];
    } else {
      let seq = [];
      while (seq.length < st.R) seq = seq.concat(shuffle(GAMES.map((g) => g.id), r));
      st.seq = seq.slice(0, st.R);
    }
    st.r = 0;
    st.pl.forEach((p) => { p.s = 0; });
    this.nextRound();
  }

  nextRound() {
    const st = this.st;
    st.r++;
    st.g = st.seq[st.r - 1];
    st.seed = Math.floor(Math.random() * 2 ** 31);
    st.rk = [];
    const game = GAME_BY_ID[st.g];
    this.go('intro', INTRO_MS, () => this.go('play', game.dur(st.seed) + (game.realtime ? 3000 : 0) + GRACE_MS, () => this.collect()));
  }

  go(ph, ms, next) {
    clearTimeout(this.timer);
    this.st.ph = ph;
    this.st.k++;
    this.publish();
    if (next) this.timer = setTimeout(next, ms);
  }

  collect() {
    const st = this.st;
    const game = GAME_BY_ID[st.g];
    const byPeer = Object.fromEntries(this.nr.peers().map((p) => [pid(p), p]));
    const playKey = st.k;
    const r = mulberry32(st.seed ^ 0x5bd1e995);
    const vals = {};
    for (const p of st.pl) {
      let v = null;
      if (p.b) v = game.bot(r, st.seed, p);
      else {
        const inp = byPeer[p.id]?.presence?.in;
        if (inp && inp.k === playKey) v = inp.v;
      }
      vals[p.id] = v;
    }
    // juegos de varias rondas comparan a todos juntos (evaluateAll)
    let all = null;
    if (game.evaluateAll) { try { all = game.evaluateAll(vals, st.seed, st.pl); } catch { all = null; } }
    const res = st.pl.map((p) => {
      const v = vals[p.id];
      let ev = null;
      try { ev = all ? all[p.id] : game.evaluate(v, st.seed); } catch { ev = null; }
      return { id: p.id, score: ev && typeof ev.score === 'number' && isFinite(ev.score) ? ev.score : null, label: ev ? ev.label : 'Sin jugar' };
    });
    const scored = res.filter((x) => x.score !== null);
    for (const x of res) {
      if (x.score === null) { x.pts = 0; x.place = 0; continue; }
      const better = scored.filter((y) => y.score > x.score).length;
      x.place = better + 1;
      x.pts = POINTS[better] ?? 0;
    }
    res.sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
    const plById = Object.fromEntries(st.pl.map((p) => [p.id, p]));
    for (const x of res) plById[x.id].s += x.pts;
    st.rk = res.map((x) => ({ id: x.id, l: String(x.label).slice(0, 24), p: x.pts, pl: x.place }));
    const last = st.r >= st.seq.length;
    this.go('res', RESULTS_MS, last ? () => this.go('final') : () => this.nextRound());
  }

  // Un juego en tiempo real puede terminar antes (por ejemplo, queda uno solo).
  endPlayEarly() {
    if (this.st.ph !== 'play' || this._early === this.st.k) return;
    this._early = this.st.k;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.collect(), 1500);
  }

  toLobby() {
    clearTimeout(this.timer);
    clearInterval(this.liv);
    this.st.lg = null;
    this.st.rk = [];
    this.go('lobby');
    this.tick();
  }
}

// ---- juegos largos (cartas, etc.): por turnos, el anfitrión aplica las reglas
// y publica el estado en st.lg. Los demás mandan sus jugadas en presence.la.
Host.prototype.startLong = function (id, keepScore = false) {
  const L = LONG_BY_ID[id];
  if (!L) return false;
  this.tick();
  const st = this.st;
  if (st.pl.length < L.min || st.pl.length > L.max) return false;
  const prev = keepScore && st.lg && st.lgId === id ? st.lg : null;
  st.lgId = id;
  st.lk = Math.floor(Math.random() * 2 ** 31);
  st.lg = L.rules.init(st.pl.map((p) => p.id), Math.floor(Math.random() * 2 ** 31), prev ? prev.wins : {}, prev);
  st.rk = [];
  this.go('long');
  this.startLongLoop();
  return true;
};

Host.prototype.startLongLoop = function () {
  clearInterval(this.liv);
  this.lastN = {};
  this.turnSeen = -1;
  this.offSince = {};
  this.liv = setInterval(() => this.longTick(), 200);
};

// Jugada de este teléfono (el anfitrión).
Host.prototype.longAct = function (id, a) {
  const st = this.st;
  const L = LONG_BY_ID[st.lgId];
  // LOOSE: juegos donde todos juegan a la vez (Stop): no se exige el número de turno
  if (st.ph !== 'long' || !st.lg || !L || !a || (!L.rules.LOOSE && a.tn !== st.lg.tn)) return;
  this.syncTurn(st.lg);
  if (L.rules.act(st.lg, id, a, { elapsed: Date.now() - this.turnAt, host: true })) { this.syncTurn(st.lg); this.publish(); }
};

// Anota cuándo empezó el turno actual (para el reloj, los bots y el tiempo de turno).
Host.prototype.syncTurn = function (lg) {
  if (lg.tn === this.turnSeen) return;
  const now = Date.now();
  this.turnSeen = lg.tn;
  this.turnAt = now;
  const L = LONG_BY_ID[this.st.lgId];
  const [b0, b1] = (L && L.rules.BOT_MS) || [900, 1800];
  this.botAt = now + b0 + Math.random() * (b1 - b0);
};

Host.prototype.longTick = function () {
  const st = this.st;
  const L = LONG_BY_ID[st.lgId];
  if (st.ph !== 'long' || !st.lg || !L) return;
  const lg = st.lg;
  let changed = false;
  this.syncTurn(lg);
  // jugadas de los demás (cada una dice para qué turno era: no se aplica dos veces)
  for (const peer of this.nr.peers()) {
    if (peer.isMe) continue;
    const la = peer.presence && peer.presence.la;
    if (!la || la.lk !== st.lk || typeof la.n !== 'number') continue;
    const id = pid(peer);
    if (la.n <= (this.lastN[id] || 0)) continue;
    this.lastN[id] = la.n;
    if (la.a && (L.rules.LOOSE || la.a.tn === lg.tn) && L.rules.act(lg, id, la.a, { elapsed: Date.now() - this.turnAt })) { changed = true; this.syncTurn(lg); }
  }
  const now = Date.now();
  // cuánto lleva desconectado cada jugador
  for (const p of st.pl) {
    if (p.off) { if (!this.offSince[p.id]) this.offSince[p.id] = now; } else delete this.offSince[p.id];
  }
  if (!(lg.win || lg.end)) {
    const who = L.rules.current(lg);
    const p = st.pl.find((x) => x.id === who);
    // jugadas sin opción (pasar, robar) o pausas del juego: las hace solo tras `delay`
    const delay = L.rules.autoDelay ? L.rules.autoDelay(lg) : null;
    if (delay != null) {
      if (now - this.turnAt >= delay && L.rules.act(lg, who, L.rules.autoMove(lg, who), { elapsed: now - this.turnAt })) { changed = true; this.syncTurn(lg); }
    } else if (p && p.b) {
      // bots: piensan un momento y juegan
      if (now >= this.botAt && L.rules.act(lg, who, L.rules.autoMove(lg, who), { elapsed: now - this.turnAt })) { changed = true; this.syncTurn(lg); }
    } else if (L.rules.onTime) {
      // juegos con reloj (ajedrez): pierde quien se queda sin tiempo o abandona
      const offMs = !p ? Infinity : this.offSince[who] ? now - this.offSince[who] : 0;
      if (L.rules.onTime(lg, now - this.turnAt, offMs)) changed = true;
    } else if (!p || now - this.turnAt > (p.off ? L.rules.OFF_TURN_MS : L.rules.TURN_MS)) {
      // humanos: si se les acaba el tiempo del turno, juega solo
      if (L.rules.act(lg, who, L.rules.autoMove(lg, who), { elapsed: now - this.turnAt })) { changed = true; this.syncTurn(lg); }
    }
  }
  if (changed) this.publish();
};

// Busca al anfitrión vigente entre los pares de una sala.
export function findHost(peers) {
  const hs = peers.filter((p) => p.presence && p.presence.st && typeof p.presence.hs === 'number');
  hs.sort((a, b) => a.presence.hs - b.presence.hs || (a.peer < b.peer ? -1 : 1));
  return hs[0] || null;
}
