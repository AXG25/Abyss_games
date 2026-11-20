// 🎨 Pinta el piso — tiempo real. Cada casilla que pisas queda de tu color;
// pasar por encima del color de otro lo repinta. Las bombas de pintura
// salpican tu color alrededor, y con CORRE puedes embestir a otro y dejarlo
// mareado un momento. A los 45 s gana quien tenga más piso pintado.
//
// El anfitrión es el árbitro: decide de quién es cada casilla (lo publica en
// `hs.g`, un carácter por casilla) y quién agarra cada bomba. Cada teléfono
// pinta al instante lo que pisa su jugador (predicción) mientras llega la
// decisión del anfitrión.
import { mulberry32, COLORS } from '../util.js';
import { DT, TAU, mountRT, simulateBot, newPlayerBase, moveBasic, clampBox, drawPlayer } from '../rt.js';

const TOTAL = 45;
const HALF = 0.9;
const N = 14;
const TS = (HALF * 2) / N;
const PR = 0.06;
const SPEED = 0.62;
const BOMB_R = 2.3;     // radio de la salpicadura (en casillas)
const STUN = 0.9;       // segundos mareado tras un embiste
const PRED = 0.6;       // cuánto dura mi pintura "predicha" sin confirmar
const EMPTY = '#efeaf8';
// última posición pintada de cada jugador (solo el anfitrión; no se publica)
const LAST = new WeakMap();

const idxAt = (x, y) => {
  const i = Math.floor((x + HALF) / TS), j = Math.floor((y + HALF) / TS);
  if (i < 0 || j < 0 || i >= N || j >= N) return -1;
  return j * N + i;
};
const center = (k) => [-HALF + ((k % N) + 0.5) * TS, -HALF + (Math.floor(k / N) + 0.5) * TS];
const ownerAt = (hs, k) => {
  const c = hs && typeof hs.g === 'string' ? hs.g.charCodeAt(k) - 48 : -1;
  return c >= 0 && c < 4 ? c : -1;
};
// Dueño que se ve en pantalla: lo del anfitrión, salvo lo que acabo de pintar.
const shownOwner = (ext, k, now) => {
  const p = ext && ext.pred && ext.pred.get(k);
  if (p && now - p.t < PRED) return p.i;
  return ownerAt(ext && ext.hs, k);
};
const countsOf = (g, n) => {
  const c = new Array(n).fill(0);
  if (typeof g !== 'string') return c;
  for (let k = 0; k < g.length; k++) { const o = g.charCodeAt(k) - 48; if (o >= 0 && o < n) c[o]++; }
  return c;
};
const pct = (n) => Math.round((100 * (n || 0)) / (N * N));

// Casillas dentro del radio de una salpicadura.
function splashTiles(k0) {
  const i0 = k0 % N, j0 = Math.floor(k0 / N);
  const out = [];
  const r = Math.ceil(BOMB_R);
  for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    const i = i0 + di, j = j0 + dj;
    if (i < 0 || j < 0 || i >= N || j >= N || Math.hypot(di, dj) > BOMB_R) continue;
    out.push(j * N + i);
  }
  return out;
}

const G = {
  TOTAL, LIVES: 0, lives: 0,
  action: 'CORRE',
  actionIcon: 'bolt',

  world(seed) {
    const r = mulberry32(seed ^ 0x9a1e7);
    // bombas de pintura: cuándo y dónde aparecen
    const bombs = [];
    for (let t = 5; t < TOTAL - 3; t += 5.5 + r() * 1.5) {
      const i = 2 + Math.floor(r() * (N - 4)), j = 2 + Math.floor(r() * (N - 4));
      bombs.push({ t, k: j * N + i });
    }
    return { bombs };
  },
  newExt: () => ({ taken: new Set(), pred: new Map() }),

  spawn(i) {
    const a = -Math.PI / 2 + (i * TAU) / 4 + Math.PI / 4;
    const p = newPlayerBase(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0);
    p.n = 0;
    p.stun = 0;
    p.imm = 0;
    return p;
  },

  // ---- árbitro (solo el anfitrión)
  hostInit(W, players) {
    return { g: '.'.repeat(N * N), ids: players.map((p) => p.id), b: -1, bn: 0, ev: null };
  },
  hostTick(hs, t, W, all) {
    const g = hs.g.split('');
    let changed = false;
    const paint = (k, i) => { if (k >= 0 && g[k] !== String(i)) { g[k] = String(i); changed = true; } };
    if (!LAST.has(hs)) LAST.set(hs, {});
    const lastPos = LAST.get(hs);
    for (const e of all) {
      if (!e || e.out) continue;
      const i = hs.ids.indexOf(e.id);
      if (i < 0) continue;
      // las posiciones de los demás llegan a saltos: pintar todo el tramo recorrido
      const lp = lastPos[e.id];
      const steps = lp ? Math.min(12, Math.ceil(Math.hypot(e.x - lp[0], e.y - lp[1]) / (TS * 0.4))) : 0;
      for (let s = 1; s <= steps; s++) {
        const f = s / steps;
        paint(idxAt(lp[0] + (e.x - lp[0]) * f, lp[1] + (e.y - lp[1]) * f), i);
      }
      paint(idxAt(e.x, e.y), i);
      lastPos[e.id] = [e.x, e.y];
    }
    // bombas de pintura: aparece la siguiente (la anterior, si nadie la tomó, se va)
    while (hs.bn < W.bombs.length && t >= W.bombs[hs.bn].t) { hs.b = W.bombs[hs.bn].k; hs.bn++; }
    if (hs.b >= 0) {
      const [bx, by] = center(hs.b);
      const who = all.find((e) => e && !e.out && hs.ids.includes(e.id) && Math.hypot(e.x - bx, e.y - by) < PR + TS * 0.45);
      if (who) {
        const i = hs.ids.indexOf(who.id);
        for (const k of splashTiles(hs.b)) paint(k, i);
        hs.ev = [hs.b, i, (hs.ev ? hs.ev[2] : 0) + 1];
        hs.b = -1;
      }
    }
    if (changed) hs.g = g.join('');
  },
  // Lo que decidió el árbitro: cuántas casillas tiene cada uno.
  applyHost(p, hs) {
    if (typeof hs.g !== 'string' || !Array.isArray(hs.ids)) return null;
    const c = countsOf(hs.g, hs.ids.length);
    const i = hs.ids.indexOf(p.id);
    p.n = i >= 0 ? c[i] : 0;
    p.all = Object.fromEntries(hs.ids.map((id, k) => [id, c[k]]));
    return null;
  },

  step(p, inp, t, W, ext) {
    p._ev = null;
    if (p.imm > 0) p.imm -= DT;
    if (p.stun > 0) {
      p.stun -= DT;
      p.inv = Math.max(0, p.stun);
      if (p.dcd > 0) p.dcd -= DT;
      p.act = false;
    } else {
      moveBasic(p, inp, SPEED);
    }
    // choques: los cuerpos no se enciman; si alguien llega corriendo, te marea
    if (ext && ext.all) {
      for (const o of ext.all) {
        if (!o || o === p || o.id === p.id || o.out) continue;
        const dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy);
        if (d > 0 && d < PR * 2) {
          const over = PR * 2 - d;
          p.x += (dx / d) * over * 0.5;
          p.y += (dy / d) * over * 0.5;
          const rushing = o.dash > 0 || o.d;
          const meRushing = p.dash > 0;
          if (rushing && !meRushing && p.stun <= 0 && p.imm <= 0) {
            p.stun = STUN;
            p.imm = STUN + 1;
            p.dash = 0;
            p.kx = (dx / d) * 1.4;
            p.ky = (dy / d) * 1.4;
            p._ev = 'hit';
          }
        }
      }
    }
    if (p.kx || p.ky) {
      p.x += p.kx * DT; p.y += p.ky * DT;
      const f = Math.pow(0.02, DT);
      p.kx *= f; p.ky *= f;
      if (Math.abs(p.kx) + Math.abs(p.ky) < 0.02) { p.kx = 0; p.ky = 0; }
    }
    clampBox(p, HALF - PR);
    // pintar al instante lo que piso (el anfitrión lo confirma después)
    const hs = ext && ext.hs;
    if (hs && Array.isArray(hs.ids) && ext.pred) {
      const i = hs.ids.indexOf(p.id);
      const k = idxAt(p.x, p.y);
      if (i >= 0 && k >= 0 && shownOwner(ext, k, t) !== i) ext.pred.set(k, { i, t });
    }
    return p._ev;
  },

  brain(seed, idx) {
    const r = mulberry32((seed ^ (0x5f356495 * (idx + 1))) >>> 0);
    const skill = 0.55 + r() * 0.4;
    let target = -1, until = 0, lastB = -1, seenAt = 0;
    return (p, t, ext) => {
      const hs = ext && ext.hs;
      const me = hs && Array.isArray(hs.ids) ? hs.ids.indexOf(p.id) : -1;
      // ir por la bomba si está cerca (tardan un momento en reaccionar, para dar chance a los humanos)
      if (hs && hs.b !== lastB) { lastB = hs.b; seenAt = t + 0.7 + r() * 1.2; }
      if (hs && hs.b >= 0 && t >= seenAt) {
        const [bx, by] = center(hs.b);
        const d = Math.hypot(bx - p.x, by - p.y);
        if (d < 0.3 + skill * 0.35) {
          if (d > 0.25 && p.dcd <= 0 && r() < 0.02 * skill) p.act = true;
          return { x: (bx - p.x) / (d || 1), y: (by - p.y) / (d || 1) };
        }
      }
      const [tx, ty] = target >= 0 ? center(target) : [p.x, p.y];
      if (target < 0 || t > until || Math.hypot(tx - p.x, ty - p.y) < TS * 0.4 || ownerAt(hs, target) === me) {
        let best = -1, bs = -1;
        for (let n = 0; n < 14; n++) {
          const k = Math.floor(r() * N * N);
          const o = ownerAt(hs, k);
          if (o === me) continue;
          const [cx, cy] = center(k);
          const s = (o < 0 ? 1 : 1 + skill * 0.6) / (Math.hypot(cx - p.x, cy - p.y) + 0.15) + r() * 0.5;
          if (s > bs) { bs = s; best = k; }
        }
        target = best;
        until = t + 1.2 + r();
      }
      if (target < 0) return { x: Math.cos(t + idx), y: Math.sin(t + idx) };
      // embestir a un rival que esté justo enfrente
      if (ext && ext.all && p.dcd <= 0 && r() < 0.03 * skill) {
        const near = ext.all.find((o) => o && o.id !== p.id && Math.hypot(o.x - p.x, o.y - p.y) < 0.18);
        if (near) { const dx = near.x - p.x, dy = near.y - p.y, l = Math.hypot(dx, dy) || 1; p.act = true; return { x: dx / l, y: dy / l }; }
      }
      const [gx, gy] = center(target);
      const dx = gx - p.x, dy = gy - p.y, l = Math.hypot(dx, dy) || 1;
      return { x: (dx / l) * (0.75 + skill * 0.25), y: (dy / l) * (0.75 + skill * 0.25) };
    };
  },

  result: (p) => ({ n: p.n || 0, a: p.all || null }),
  hud: (p) => `<span class="pt-me" style="--c:${p._c || '#fff'}"></span>${pct(p.n)}%`,
  hudRight: (ents) => {
    const e = ents.find((x) => x.all);
    const best = e ? Math.max(0, ...Object.values(e.all)) : 0;
    return `{crown} ${pct(best)}%`;
  },
  endText: (p) => `{sparkle} ¡Pintaste el ${pct(p.n)}%!`,
  won: (p) => !p.all || (p.n || 0) >= Math.max(0, ...Object.values(p.all)),
  // barra con la parte del piso de cada color
  topText(t, W, ext) {
    const hs = ext && ext.hs;
    if (!hs || !Array.isArray(hs.ids)) return null;
    const c = countsOf(hs.g, hs.ids.length);
    const tot = c.reduce((a, b) => a + b, 0);
    if (!tot) return null;
    return `<span class="pt-bar">${c.map((n, i) => (n ? `<i style="flex:${n};background:${COLORS[i]}"></i>` : '')).join('')}<i style="flex:${N * N - tot};background:rgba(255,255,255,0.18)"></i></span>`;
  },
  banner(t) {
    if (t >= TOTAL - 10 && t < TOTAL - 8) return { text: '{timer} ¡Últimos 10 segundos!', color: '#ff4d6d' };
    return null;
  },

  music: 'disco',
  events(t0, t1, W, ext, ents, fx) {
    const st = fx.st;
    for (let k = 1; k <= 5; k++) { const tt = TOTAL - k; if (tt > t0 && tt <= t1) fx.sfx.count(); }
    const hs = ext.hs;
    if (!hs) return;
    // mis pinceladas: un "plop" suave por cada casilla nueva
    const myK = idxAt(fx.me.x, fx.me.y);
    if (myK !== st.k) {
      st.k = myK;
      const p = ext.pred.get(myK);
      if (p && t1 - p.t < 0.1 && t1 - (st.lp || 0) > 0.07) {
        st.lp = t1;
        fx.sfx.splat(0.35);
        const [x, y] = center(myK);
        fx.burst(x, 0.03, y, { n: 5, color: [COLORS[p.i], '#ffffff'], speed: 0.25, up: 0.5, size: 0.03, life: 0.35, gravity: 3 });
      }
    }
    // aparece una bomba
    if (hs.b !== st.b) {
      if (hs.b >= 0) { const [x, y] = center(hs.b); fx.sfx.pass(0.6); fx.burst(x, 0.2, y, { n: 20, color: COLORS, speed: 0.4, up: 0.9, size: 0.04, life: 0.6, gravity: 1.5 }); }
      st.b = hs.b;
    }
    // ¡salpicadura!
    if (hs.ev && hs.ev[2] !== st.ev) {
      if (st.ev !== undefined || t1 > 0.5) {
        const [x, y] = center(hs.ev[0]);
        const col = COLORS[hs.ev[1]] || '#fff';
        fx.sfx.splash(0.9);
        fx.sfx.big(0.5);
        fx.shake(0.035);
        fx.burst(x, 0.1, y, { n: 60, color: [col, col, '#ffffff'], speed: 1.3, up: 1.6, size: 0.06, life: 0.9, gravity: 3 });
        if (hs.ids && hs.ids[hs.ev[1]] === fx.me.id) fx.msg('{sparkle} ¡Splash!', 800);
      }
      st.ev = hs.ev[2];
    }
  },

  PR,
  scene3d: {
    sky: '#ffd6e8',
    camFit: 1.2,
    camElev: 64,
    hemiGround: '#7b2cbf',
    trailColor: ['#ffffff', '#ffd6e8'],
    setup(S) {
      const { THREE, scene } = S;
      const base = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 0.08, 0.2, HALF * 2 + 0.08), new THREE.MeshStandardMaterial({ color: '#5a189a', roughness: 0.6 }));
      base.position.y = -0.11;
      base.receiveShadow = true;
      scene.add(base);
      const wallMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 });
      for (const [w, d, x, z] of [[HALF * 2 + 0.12, 0.05, 0, -HALF - 0.035], [HALF * 2 + 0.12, 0.05, 0, HALF + 0.035], [0.05, HALF * 2, -HALF - 0.035, 0], [0.05, HALF * 2, HALF + 0.035, 0]]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), wallMat);
        m.position.set(x, 0.03, z);
        m.castShadow = true;
        scene.add(m);
      }
      // casillas: una sola malla con color por casilla
      const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(TS * 0.93, 0.03, TS * 0.93), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35 }), N * N);
      tiles.receiveShadow = true;
      const m4 = new THREE.Matrix4();
      const col = new THREE.Color(EMPTY);
      for (let k = 0; k < N * N; k++) {
        const [x, y] = center(k);
        m4.makeTranslation(x, -0.005, y);
        tiles.setMatrixAt(k, m4);
        tiles.setColorAt(k, col);
      }
      scene.add(tiles);
      // bomba de pintura
      const bomb = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.055, 20, 14), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.25, emissive: '#000000' }));
      ball.castShadow = true;
      bomb.add(ball);
      const spots = COLORS.map((c, i) => {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), new THREE.MeshStandardMaterial({ color: c, roughness: 0.3 }));
        const a = (i * TAU) / 4;
        s.position.set(Math.cos(a) * 0.045, 0.012, Math.sin(a) * 0.045);
        bomb.add(s);
        return s;
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.085, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      bomb.visible = false;
      ring.visible = false;
      scene.add(bomb);
      scene.add(ring);
      Object.assign(S.objs, { tiles, m4, col, own: new Int8Array(N * N).fill(-1), pop: new Map(), bomb, ball, spots, ring });
    },
    update(S, t, W, ext) {
      const o = S.objs;
      const now = ext && ext.t !== undefined ? ext.t : t;
      let colorDirty = false, mDirty = false;
      for (let k = 0; k < N * N; k++) {
        const w = shownOwner(ext, k, now);
        if (w !== o.own[k]) {
          o.own[k] = w;
          o.col.set(w >= 0 ? COLORS[w] : EMPTY);
          o.tiles.setColorAt(k, o.col);
          colorDirty = true;
          if (w >= 0) o.pop.set(k, S.t);
        }
      }
      // las casillas recién pintadas saltan un poquito
      for (const [k, t0] of o.pop) {
        const a = S.t - t0;
        const [x, y] = center(k);
        if (a > 0.3 || a < 0) { o.m4.makeTranslation(x, -0.005, y); o.pop.delete(k); }
        else { const h = Math.sin((a / 0.3) * Math.PI); o.m4.makeScale(1 - h * 0.12, 1 + h * 2, 1 - h * 0.12); o.m4.setPosition(x, -0.005 + h * 0.03, y); }
        o.tiles.setMatrixAt(k, o.m4);
        mDirty = true;
      }
      if (colorDirty) o.tiles.instanceColor.needsUpdate = true;
      if (mDirty) o.tiles.instanceMatrix.needsUpdate = true;
      const hs = ext && ext.hs;
      const b = hs && hs.b >= 0 ? hs.b : -1;
      o.bomb.visible = o.ring.visible = b >= 0;
      if (b >= 0) {
        const [x, y] = center(b);
        o.bomb.position.set(x, 0.13 + Math.sin(t * 4) * 0.025, y);
        o.bomb.scale.setScalar(1.7);
        o.bomb.rotation.y = t * 2;
        o.ball.material.emissive.setHSL((t * 0.5) % 1, 0.8, 0.12);
        o.ring.position.set(x, 0.02, y);
        const s = 1.5 + (t * 1.5 % 1) * 1.2;
        o.ring.scale.setScalar(s);
        o.ring.material.opacity = 0.9 * (1 - (t * 1.5 % 1));
      }
    },
  },

  draw(g, v, t, W, ents, meId, ext) {
    const { size } = v;
    const now = ext && ext.t !== undefined ? ext.t : t;
    g.fillStyle = '#5a189a'; g.fillRect(0, 0, size, size);
    const ts = TS * v.R;
    for (let k = 0; k < N * N; k++) {
      const [cx, cy] = center(k);
      const w = shownOwner(ext, k, now);
      g.fillStyle = w >= 0 ? COLORS[w] : EMPTY;
      g.fillRect(v.X(cx) - ts / 2 + 1, v.Y(cy) - ts / 2 + 1, ts - 2, ts - 2);
    }
    g.lineWidth = 4; g.strokeStyle = '#fff';
    g.strokeRect(v.X(-HALF), v.Y(-HALF), HALF * 2 * v.R, HALF * 2 * v.R);
    const hs = ext && ext.hs;
    if (hs && hs.b >= 0) {
      const [bx, by] = center(hs.b);
      const r = TS * v.R * 0.45 * (1 + Math.sin(t * 6) * 0.08);
      g.beginPath(); g.arc(v.X(bx), v.Y(by), r, 0, TAU); g.fillStyle = '#fff'; g.fill();
      g.lineWidth = 3; g.strokeStyle = '#1b1035'; g.stroke();
      COLORS.forEach((c, i) => { const a = t * 2 + (i * TAU) / 4; g.beginPath(); g.arc(v.X(bx) + Math.cos(a) * r * 0.5, v.Y(by) + Math.sin(a) * r * 0.5, r * 0.28, 0, TAU); g.fillStyle = c; g.fill(); });
    }
    for (const e of ents) drawPlayer(g, v, { ...e, pr: PR }, meId, t);
  },
};

export default {
  id: 'paint',
  name: 'Pinta el piso',
  realtime: true,
  desc: 'Cada casilla que pisas queda de tu color, y puedes repintar las de los demás. Agarra las bombas de pintura para salpicar todo alrededor y usa CORRE para embestir y marear a los rivales. A los 45 s gana quien tenga más piso pintado.',
  dur: () => TOTAL * 1000,
  mount: (el, ctx) => mountRT(el, ctx, { ...G, hud: (p) => G.hud({ ...p, _c: ctx.color }) }),
  // El anfitrión manda el conteo de todos (`a`); se usa el más completo
  // (el piso pintado solo crece, así que el de más casillas es el más reciente).
  evaluateAll(vals) {
    let best = null, bestTot = -1;
    for (const v of Object.values(vals)) {
      if (!v || !v.a || typeof v.a !== 'object') continue;
      const tot = Object.values(v.a).reduce((s, n) => s + (Number(n) || 0), 0);
      if (tot > bestTot) { bestTot = tot; best = v.a; }
    }
    const out = {};
    for (const [id, v] of Object.entries(vals)) {
      if (!v && !(best && id in best)) { out[id] = null; continue; }
      const n = Math.max(0, Math.min(N * N, Math.floor(Number(best && id in best ? best[id] : v.n) || 0)));
      out[id] = { score: n, label: `{sparkle} ${pct(n)}% del piso` };
    }
    return out;
  },
  evaluate(v) {
    if (!v || typeof v.n !== 'number') return null;
    const n = Math.max(0, Math.min(N * N, Math.floor(v.n)));
    return { score: n, label: `${pct(n)}% del piso` };
  },
  bot: (r, seed, p) => simulateBot(G, seed, Number(String(p?.id || 'bot0').slice(3)) || 0),
};
