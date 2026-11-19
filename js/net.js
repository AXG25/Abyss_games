// Conexión en tiempo real con tres transportes y la misma interfaz
// (peers, presence, onPeers, join, connected, onConnection):
//
//  - 'claude': página alojada en Claude → capacidad `room`.
//  - 'p2p':    cualquier hosting gratis (GitHub Pages) → PeerJS (WebRTC).
//              El primer teléfono de la sala es el "hub": recibe la presence
//              de todos y reenvía la lista completa. Sin servidor propio.
//  - 'local':  sin red → BroadcastChannel entre pestañas del mismo navegador.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function connectLobby() {
  const start = Date.now();
  while (!(window.claude && typeof window.claude.use === 'function')) {
    if (Date.now() - start > 1500) break;
    await sleep(100);
  }
  if (window.claude && typeof window.claude.use === 'function') {
    try {
      const room = await window.claude.use('room');
      if (room) {
        return {
          kind: 'claude',
          connected: () => room.connected(),
          onConnection: (fn, err) => room.onConnection(fn, err),
          peers: () => room.peers(),
          presence: (patch) => room.presence(patch),
          onPeers: (fn, err) => room.onPeers(fn, err),
          join: (name) => room.join(name),
        };
      }
    } catch { /* seguimos */ }
  }
  if (typeof window.Peer === 'function') return new PeerLobby();
  return new LocalRoom('lobby');
}

const mkPeer = (peer, presence, isMe, updatedAt = Date.now()) => Object.freeze({
  peer, by: null, isMe, sameTab: isMe, kind: 'viewer', guest: false,
  presence: Object.freeze({ ...(presence || {}) }), updatedAt,
});

// ---------------------------------------------------------------- PeerJS
const PREFIX = 'abyssgames-axg25-';
const PEER_OPTS = { debug: 0 };

class PeerLobby {
  constructor() {
    this.kind = 'p2p';
    this._snap = Object.freeze([mkPeer('me', {}, true)]);
  }
  connected() { return navigator.onLine !== false; }
  onConnection(fn) {
    setTimeout(() => fn(this.connected()), 0);
    const h = () => fn(this.connected());
    addEventListener('online', h);
    addEventListener('offline', h);
    return () => { removeEventListener('online', h); removeEventListener('offline', h); };
  }
  peers() { return this._snap; }
  async presence() {}
  onPeers() { return () => {}; }
  async join(name) {
    const r = new PeerRoom(name);
    await r._connect();
    return r;
  }
}

class PeerRoom {
  constructor(name) {
    this.name = name;
    this.kind = 'p2p';
    this.hubId = PREFIX + name;
    this.role = null;          // 'hub' | 'client'
    this.myId = 'yo';
    this._pres = {};
    this._subs = new Set();
    this._conSubs = new Set();
    this._members = new Map(); // hub: peerId -> {presence, seen, conn}
    this._list = [];           // client: última lista recibida del hub
    this._closed = false;
    this._snap = Object.freeze([mkPeer(this.myId, {}, true)]);
    this._nt = 0;
    this._st = 0;
  }

  // Intenta ser el hub; si ya existe, se conecta a él.
  async _connect() {
    let lastErr = null;
    for (let attempt = 0; attempt < 4 && !this._closed; attempt++) {
      try { await this._tryHub(); return; } catch (e) {
        lastErr = e;
        if (e && e.type !== 'unavailable-id') { await sleep(700); continue; }
      }
      try { await this._tryClient(); return; } catch (e) { lastErr = e; await sleep(700); }
    }
    throw lastErr || new Error('sin conexión');
  }

  _tryHub() {
    return new Promise((resolve, reject) => {
      const p = new window.Peer(this.hubId, PEER_OPTS);
      let opened = false;
      const to = setTimeout(() => { if (!opened) { p.destroy(); reject({ type: 'timeout' }); } }, 10000);
      p.on('open', () => { opened = true; clearTimeout(to); this._becomeHub(p); resolve(); });
      p.on('error', (e) => {
        if (!opened) { clearTimeout(to); p.destroy(); reject(e); }
      });
    });
  }

  _tryClient() {
    return new Promise((resolve, reject) => {
      const p = new window.Peer(PEER_OPTS);
      let done = false;
      const fail = (e) => { if (done) return; done = true; clearTimeout(to); p.destroy(); reject(e || { type: 'timeout' }); };
      const to = setTimeout(() => fail(), 12000);
      p.on('open', () => {
        const conn = p.connect(this.hubId, { reliable: true });
        conn.on('open', () => {
          if (done) return;
          done = true;
          clearTimeout(to);
          this._becomeClient(p, conn);
          resolve();
        });
        conn.on('error', fail);
      });
      p.on('error', (e) => { if (!done) fail(e); else if (this.role === 'client') this._lost(); });
    });
  }

  _becomeHub(p) {
    this.role = 'hub';
    this.peer = p;
    this.myId = this.hubId;
    this._members.clear();
    p.on('connection', (conn) => {
      conn.on('data', (d) => {
        if (!d || d.t !== 'p' || typeof d.presence !== 'object') return;
        const prev = this._members.get(conn.peer);
        this._members.set(conn.peer, { presence: d.presence || {}, seen: Date.now(), conn, updatedAt: Date.now() });
        if (!prev || JSON.stringify(prev.presence) !== JSON.stringify(d.presence)) this._changed();
      });
      const drop = () => { if (this._members.delete(conn.peer)) this._changed(); };
      conn.on('close', drop);
      conn.on('error', drop);
    });
    p.on('disconnected', () => { try { if (!p.destroyed) p.reconnect(); } catch { /* nada */ } });
    p.on('error', () => {});
    clearInterval(this._hb);
    this._hb = setInterval(() => {
      for (const [id, m] of this._members) {
        if (Date.now() - m.seen > 6000) { try { m.conn.close(); } catch { /* nada */ } this._members.delete(id); this._changed(); }
      }
      this._broadcast();
    }, 1000);
    this._setConnected(true);
    this._changed();
  }

  _becomeClient(p, conn) {
    this.role = 'client';
    this.peer = p;
    this.conn = conn;
    this.myId = p.id;
    this._lastHub = Date.now();
    conn.on('data', (d) => {
      if (!d || d.t !== 's' || !Array.isArray(d.list)) return;
      this._lastHub = Date.now();
      const s = JSON.stringify(d.list);
      if (s === this._lastListJson) return;
      this._lastListJson = s;
      this._list = d.list;
      this._changed();
    });
    conn.on('close', () => this._lost());
    p.on('disconnected', () => { try { if (!p.destroyed) p.reconnect(); } catch { /* nada */ } });
    clearInterval(this._hb);
    this._hb = setInterval(() => {
      this._sendPresence();
      if (Date.now() - this._lastHub > 6000) this._lost();
    }, 1000);
    this._setConnected(true);
    this._sendPresence();
    this._changed();
  }

  // Se perdió el hub (o la conexión): reintentar; quizá ahora seamos el hub.
  _lost() {
    if (this._closed || this._reconnecting) return;
    this._reconnecting = true;
    clearInterval(this._hb);
    try { this.peer && this.peer.destroy(); } catch { /* nada */ }
    this.role = null;
    this._list = [];
    this._lastListJson = '';
    this._members.clear();
    this._setConnected(false);
    this._changed();
    const retry = async () => {
      if (this._closed) return;
      try { await this._connect(); this._reconnecting = false; } catch { setTimeout(retry, 2000); }
    };
    setTimeout(retry, 300 + Math.random() * 700);
  }

  _sendPresence() {
    if (this.role !== 'client' || !this.conn || !this.conn.open) return;
    try { this.conn.send({ t: 'p', presence: this._pres }); } catch { /* nada */ }
  }

  _broadcast() {
    if (this.role !== 'hub') return;
    const list = [{ peer: this.myId, presence: this._pres }];
    for (const [id, m] of this._members) list.push({ peer: id, presence: m.presence });
    for (const m of this._members.values()) {
      try { if (m.conn.open) m.conn.send({ t: 's', list }); } catch { /* nada */ }
    }
  }

  _rebuild() {
    const out = [mkPeer(this.myId, this._pres, true)];
    if (this.role === 'hub') {
      for (const [id, m] of this._members) out.push(mkPeer(id, m.presence, false, m.updatedAt));
    } else if (this.role === 'client') {
      for (const e of this._list) {
        if (!e || typeof e.peer !== 'string' || e.peer === this.myId) continue;
        out.push(mkPeer(e.peer, e.presence, false));
      }
    }
    this._snap = Object.freeze(out);
  }

  _changed() {
    this._rebuild();
    if (!this._nt) {
      this._nt = setTimeout(() => {
        this._nt = 0;
        this._subs.forEach((fn) => { try { fn({ peers: this._snap, joined: [], left: [], updated: this._snap }); } catch (e) { console.error(e); } });
      }, 30);
    }
    if (this.role === 'hub' && !this._bt) {
      this._bt = setTimeout(() => { this._bt = 0; this._broadcast(); }, 40);
    }
  }

  _setConnected(v) {
    if (this._conn === v) return;
    this._conn = v;
    this._conSubs.forEach((fn) => fn(v));
  }

  connected() { return !!this._conn; }
  onConnection(fn) { this._conSubs.add(fn); setTimeout(() => fn(this.connected()), 0); return () => this._conSubs.delete(fn); }
  peers() { return this._snap; }
  async presence(patch) {
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete this._pres[k]; else this._pres[k] = JSON.parse(JSON.stringify(v));
    }
    this._changed();
    if (this.role === 'client' && !this._st) {
      this._st = setTimeout(() => { this._st = 0; this._sendPresence(); }, 40);
    }
  }
  onPeers(fn) {
    this._subs.add(fn);
    queueMicrotask(() => fn({ peers: this._snap, joined: this._snap, left: [], updated: [] }));
    return () => this._subs.delete(fn);
  }
  async leave() {
    this._closed = true;
    clearInterval(this._hb);
    this._subs.clear();
    this._conSubs.clear();
    try { this.peer && this.peer.destroy(); } catch { /* nada */ }
  }
}

// ---------------------------------------------------------------- local
const LOCAL_PEER = 'local-' + Math.random().toString(36).slice(2, 10);

export class LocalRoom {
  constructor(name) {
    this.name = name;
    this.kind = 'local';
    this._pres = {};
    this._others = new Map();
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
  _send(type = 'p') { try { this._bc && this._bc.postMessage({ type, peer: LOCAL_PEER, presence: this._pres }); } catch { /* nada */ } }
  _onMsg(m) {
    if (!m || m.peer === LOCAL_PEER) return;
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
    this._snap = Object.freeze([
      mkPeer(LOCAL_PEER, this._pres, true),
      ...[...this._others].map(([p, v]) => mkPeer(p, v.presence, false, v.updatedAt)),
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
