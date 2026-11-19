// Conexión en tiempo real. Usa la capacidad `room` de la página alojada en Claude.
// Si no hay conexión (por ejemplo, abriendo el proyecto en local), usa una sala
// local que conecta pestañas del mismo navegador (BroadcastChannel). Así se
// puede probar con varias pestañas o jugar en "modo práctica" con bots.

export async function connectLobby() {
  const start = Date.now();
  while (!(window.claude && typeof window.claude.use === 'function')) {
    if (Date.now() - start > 2500) return new LocalRoom('lobby');
    await new Promise((r) => setTimeout(r, 100));
  }
  try {
    const room = await window.claude.use('room');
    if (!room) return new LocalRoom('lobby');
    return {
      __real: true,
      connected: () => room.connected(),
      onConnection: (fn, err) => room.onConnection(fn, err),
      peers: () => room.peers(),
      presence: (patch) => room.presence(patch),
      onPeers: (fn, err) => room.onPeers(fn, err),
      join: (name) => room.join(name),
    };
  } catch {
    return new LocalRoom('lobby');
  }
}

const PEER = 'local-' + Math.random().toString(36).slice(2, 10);

// Sala local con la misma interfaz que `room`.
export class LocalRoom {
  constructor(name) {
    this.name = name;
    this.__real = false;
    this._pres = {};
    this._others = new Map(); // peer -> {presence, seen, updatedAt}
    this._subs = new Set();
    this._snap = Object.freeze([]);
    this._raf = 0;
    try {
      this._bc = new BroadcastChannel('pp-' + name);
      this._bc.onmessage = (e) => this._onMsg(e.data);
    } catch { this._bc = null; }
    this._hb = setInterval(() => { this._send(); this._prune(); }, 800);
    this._send();
    this._rebuild();
  }
  _send(type = 'p') { try { this._bc && this._bc.postMessage({ type, peer: PEER, presence: this._pres }); } catch { /* nada */ } }
  _onMsg(m) {
    if (!m || m.peer === PEER) return;
    if (m.type === 'bye') { this._others.delete(m.peer); this._changed(); return; }
    const prev = this._others.get(m.peer);
    const same = prev && JSON.stringify(prev.presence) === JSON.stringify(m.presence);
    this._others.set(m.peer, { presence: m.presence, seen: Date.now(), updatedAt: same ? prev.updatedAt : Date.now() });
    if (!prev) this._send();
    if (!same) this._changed();
  }
  _prune() {
    let ch = false;
    for (const [k, v] of this._others) if (Date.now() - v.seen > 3000) { this._others.delete(k); ch = true; }
    if (ch) this._changed();
  }
  _rebuild() {
    const mk = (peer, presence, isMe, updatedAt) => Object.freeze({
      peer, by: null, isMe, sameTab: isMe, kind: 'viewer', guest: false, presence: Object.freeze({ ...presence }), updatedAt,
    });
    this._snap = Object.freeze([
      mk(PEER, this._pres, true, Date.now()),
      ...[...this._others].map(([p, v]) => mk(p, v.presence, false, v.updatedAt)),
    ]);
  }
  _changed() {
    this._rebuild();
    if (this._raf) return;
    this._raf = setTimeout(() => {
      this._raf = 0;
      this._subs.forEach((fn) => fn({ peers: this._snap, joined: [], left: [], updated: this._snap }));
    }, 16);
  }
  connected() { return true; }
  onConnection(fn) { setTimeout(() => fn(true), 0); return () => {}; }
  peers() { return this._snap; }
  async presence(patch) {
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete this._pres[k]; else this._pres[k] = JSON.parse(JSON.stringify(v));
    }
    this._send();
    this._changed();
  }
  onPeers(fn) {
    this._subs.add(fn);
    queueMicrotask(() => fn({ peers: this._snap, joined: this._snap, left: [], updated: [] }));
    return () => this._subs.delete(fn);
  }
  on() { return () => {}; }
  async emit() {}
  async join(name) { return new LocalRoom(name); }
  async leave() {
    this._send('bye');
    clearInterval(this._hb);
    this._subs.clear();
    try { this._bc && this._bc.close(); } catch { /* nada */ }
  }
}
