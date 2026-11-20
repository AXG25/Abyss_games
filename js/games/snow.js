// 🏂 Bajada nevada — tiempo real (3D). Todos bajan una montaña en snowboard:
// el joystick mueve de lado a lado (arriba acelera, abajo frena) y SALTA pasa
// por encima de rocas y troncos. Los árboles hay que esquivarlos. Las rampas te
// mandan a volar con impulso. Quien choca queda eliminado. La ronda termina
// cuando queda uno solo o cuando todos los que siguen en pie llegan a la meta.
//
// La pista sale de la semilla (todos bajan la misma). No hay choques entre
// jugadores: cada teléfono simula a su jugador contra la pista.
import { mulberry32, COLORS } from '../util.js';
import { DT, TAU, mountRT, simulateBot, newPlayerBase, drawPlayer } from '../rt.js';

const TOTAL = 55;
const LEN = 34;         // largo de la pista (la meta está en y = -LEN)
const HW = 0.85;        // medio ancho de la pista
const PR = 0.05;
const V0 = 0.78, VMAX = 1.4, ACC = 0.016;   // velocidad de bajada
const LAT = 1.25;       // velocidad de lado a lado
const JUMP_V = 2.7, GRAV = 8, JUMP_CD = 0.9;
const RAMP_V = 3.3;
const CLEAR = 0.22;     // altura para pasar por encima de rocas y troncos
const M = 10;           // metros por unidad (para mostrar)
// Cámara de espectador: si ya me eliminaron, sigue al que va primero en pie.
let ME = null;
const SPEC = { on: false, x: 0, y: 0 };
function spectate(ents) {
  const me = ents.find((e) => e.id === ME);
  SPEC.on = false;
  if (!me || !me.out) return me;
  const lead = ents.filter((e) => !e.out).sort((a, b) => a.y - b.y)[0];
  if (!lead) return me;
  SPEC.on = true; SPEC.x = lead.x; SPEC.y = lead.y;
  return lead;
}

// (en la red va como `fn`: `f` y `d` ya los usa la vista 3D para la escala y el impulso)
const finOf = (e) => (typeof e.fin === 'number' ? e.fin : e.e && typeof e.e.fn === 'number' ? e.e.fn : null);

// ---------------------------------------------------------------- pista
function buildCourse(seed) {
  const r = mulberry32(seed ^ 0x5a0b);
  const obs = [];
  let y = -2.6;
  let safeX = 0, prevY = 0.2;
  const path = []; // el camino libre garantizado (y, x) — también lo usan los bots
  while (y > -LEN + 1.2) {
    const k = -y / LEN; // 0 arriba → 1 abajo
    const n = 1 + Math.floor(r() * (1.6 + k * 2.2));
    const row = [];
    for (let i = 0; i < n; i++) {
      const roll = r();
      let o;
      if (roll < 0.1 && k > 0.12) o = { t: 'ramp', hw: 0.12, hd: 0.09 };
      else if (roll < 0.24 && k > 0.12 && !row.some((q) => q.t === 'log')) o = { t: 'log', hw: 0.16 + r() * 0.14, hd: 0.035 };
      else if (roll < 0.52) o = { t: 'rock', r: 0.06 + r() * 0.025 };
      else o = { t: 'tree', r: 0.065 };
      const w = o.hw || o.r;
      o.x = -HW + w + 0.04 + r() * (HW * 2 - w * 2 - 0.08);
      o.y = y + (r() - 0.5) * 0.25;
      o.rot = r() * TAU;
      // que no se encime con otro de la misma fila
      if (row.some((q) => Math.abs(q.x - o.x) < (q.hw || q.r) + w + 0.12)) continue;
      row.push(o);
    }
    // Siempre debe haber un camino libre (sin saltar) que se alcance desde el hueco
    // de la fila anterior: si no lo hay, se quitan los obstáculos más cercanos a ese
    // camino hasta que aparezca. Así ninguna bajada es imposible.
    const reach = (LAT * 0.75 * (prevY - y)) / VMAX;
    let lane = null;
    while (true) {
      lane = freeLane(row, safeX, reach);
      if (lane !== null || !row.length) break;
      row.sort((a, b) => Math.abs(b.x - safeX) - Math.abs(a.x - safeX));
      row.pop();
    }
    safeX = lane ?? safeX;
    prevY = y;
    path.push([y, safeX]);
    obs.push(...row);
    y -= 0.62 - k * 0.12 + r() * 0.2;
  }
  obs.sort((a, b) => b.y - a.y); // de arriba hacia abajo
  // árboles de adorno fuera de la pista
  const deco = [];
  for (let yy = 3; yy > -LEN - 6; yy -= 0.22) {
    for (const s of [-1, 1]) {
      if (r() < 0.75) deco.push({ x: s * (HW + 0.25 + r() * 1.8), y: yy + r() * 0.2, s: 0.8 + r() * 0.9 });
    }
  }
  return { obs, deco, path };
}

// Centro de un hueco de al menos 0.3 entre los obstáculos de una fila que quede a
// menos de `reach` de x0 (o null). Las rampas no tapan.
function freeLane(row, x0, reach) {
  const blocks = row.filter((q) => q.t !== 'ramp').map((q) => [q.x - (q.hw || q.r) - 0.05, q.x + (q.hw || q.r) + 0.05]).sort((a, b) => a[0] - b[0]);
  const gaps = [];
  let last = -HW + PR;
  for (const [a, b] of blocks) { if (a > last) gaps.push([last, a]); last = Math.max(last, b); }
  if (HW - PR > last) gaps.push([last, HW - PR]);
  let best = null, bd = Infinity;
  for (const [a, b] of gaps) {
    if (b - a < 0.3) continue;
    const c = Math.max(a + 0.15, Math.min(b - 0.15, x0));
    const d = Math.abs(c - x0);
    if (d <= reach && d < bd) { bd = d; best = c; }
  }
  return best;
}

// primer obstáculo con y <= y0 (están ordenados de arriba hacia abajo)
function firstBelow(obs, y0) {
  let lo = 0, hi = obs.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (obs[m].y > y0) lo = m + 1; else hi = m; }
  return lo;
}

export const G = {
  TOTAL, LIVES: 1, lives: 1,
  action: 'SALTA',
  actionIcon: 'jump',
  fallText: '{splash} ¡Al suelo!',
  snapDist: 0.8,
  cd1: (p) => (p.dcd > 0 ? p.dcd / JUMP_CD : 0),

  world(seed) { return buildCourse(seed); },

  spawn(i) {
    const p = newPlayerBase(-0.45 + (i % 4) * 0.3, 0.2, 1);
    Object.assign(p, { vx: 0, vz: 0, boost: 0, fin: null, rampT: -9, bumpT: -9 });
    return p;
  },

  step(p, inp, t, W) {
    p._ev = null;
    if (p.out) return null;
    // después de la meta: frenar suave
    if (p.fin != null) {
      const v = Math.max(0, 1 - (t - p.fin) * 0.8);
      p.y -= v * DT;
      p.x *= 1 - DT * 2;
      p.z = Math.max(0, p.z - DT * 2);
      return null;
    }
    // velocidad de bajada (sube con el tiempo); arriba acelera, abajo frena
    const base = Math.min(VMAX, V0 + ACC * t);
    const pedal = inp.y < -0.3 ? 1.22 : inp.y > 0.3 ? 0.68 : 1;
    p.boost = Math.max(0, p.boost - DT * 0.45);
    const v = base * pedal + p.boost;
    // de lado a lado, con un poco de inercia (como tallar la nieve)
    const want = Math.max(-1, Math.min(1, inp.x)) * LAT;
    p.vx += (want - p.vx) * Math.min(1, DT * 7);
    p.x += p.vx * DT;
    p.y -= v * DT;
    // salto
    if (p.dcd > 0) p.dcd -= DT;
    if (p.act && p.dcd <= 0 && p.z <= 0.001) { p.vz = JUMP_V; p.dcd = JUMP_CD; p._ev = 'act'; }
    p.act = false;
    if (p.z > 0 || p.vz > 0) {
      p.vz -= GRAV * DT;
      p.z = Math.max(0, p.z + p.vz * DT);
      if (p.z === 0) p.vz = 0;
    }
    // bordes de la pista: rebote (no elimina)
    if (Math.abs(p.x) > HW - PR) {
      p.x = Math.sign(p.x) * (HW - PR);
      p.vx = -p.vx * 0.4;
      if (t - p.bumpT > 0.4) { p.bumpT = t; p._ev = 'bump'; }
    }
    // obstáculos cercanos
    const obs = W.obs;
    for (let i = firstBelow(obs, p.y + 0.25); i < obs.length && obs[i].y > p.y - 0.25; i++) {
      const o = obs[i];
      if (o.t === 'tree' || o.t === 'rock') {
        if (Math.hypot(p.x - o.x, p.y - o.y) < o.r + PR * 0.7) {
          if (o.t === 'rock' && p.z > CLEAR) continue;
          if (o.t === 'tree' && p.z > 0.55) continue;
          p.out = true; p.tOut = t; p.hit = o.t;
          return 'out';
        }
      } else if (Math.abs(p.x - o.x) < o.hw + PR * 0.6 && Math.abs(p.y - o.y) < o.hd + PR * 0.5) {
        if (o.t === 'log') {
          if (p.z > CLEAR * 0.8) continue;
          p.out = true; p.tOut = t; p.hit = 'log';
          return 'out';
        }
        if (o.t === 'ramp' && p.z < 0.08 && t - p.rampT > 0.5) {
          p.rampT = t; p.vz = RAMP_V; p.boost = 0.45; p._ev = 'ramp';
        }
      }
    }
    // ¡meta!
    if (p.y <= -LEN) { p.fin = t; return 'finish'; }
    return p._ev;
  },

  brain(seed, idx, W) {
    const r = mulberry32((seed ^ (0x51ed27 * (idx + 1))) >>> 0);
    const skill = 0.5 + r() * 0.45;
    const look = 0.35 + skill * 0.75;
    let tx = 0, next = 0, noise = 0, rush = false;
    return (p, t) => {
      if (t >= next) {
        next = t + 0.12 + (1 - skill) * 0.15;
        noise = (r() - 0.5) * (1 - skill) * 0.25;
        rush = r() < skill * 0.5;
        // elegir el carril más despejado de lo que viene
        const obs = W.obs;
        const i0 = firstBelow(obs, p.y - 0.02);
        let best = p.x, bc = Infinity;
        for (let x = -HW + 0.1; x <= HW - 0.1; x += 0.05) {
          let c = Math.abs(x - p.x) * 0.35;
          for (let i = i0; i < obs.length && obs[i].y > p.y - look; i++) {
            const o = obs[i];
            const near = 1 - (p.y - o.y) / look;
            const w = (o.hw || o.r) + 0.1;
            if (Math.abs(x - o.x) < w) c += o.t === 'ramp' ? -0.6 * skill : o.t === 'tree' ? 4 * (0.5 + near) : 2.5 * (0.5 + near);
          }
          if (c < bc) { bc = c; best = x; }
        }
        tx = best + noise;
      }
      // saltar rocas y troncos que vienen justo en frente
      if (p.dcd <= 0 && p.z <= 0) {
        const obs = W.obs;
        for (let i = firstBelow(obs, p.y - 0.02); i < obs.length && obs[i].y > p.y - 0.3; i++) {
          const o = obs[i];
          if ((o.t === 'rock' || o.t === 'log') && Math.abs(o.x - p.x) < (o.hw || o.r) + 0.06 && p.y - o.y < 0.12 + skill * 0.12 && r() < 0.35 + skill * 0.5) { p.act = true; break; }
        }
      }
      return { x: Math.max(-1, Math.min(1, (tx - p.x) * 7)), y: rush ? -0.6 : 0 };
    };
  },

  // termina cuando queda uno solo, o cuando todos los que siguen en pie ya llegaron
  over(all, t) {
    if (!all.length) return false;
    const alive = all.filter((e) => !e.out);
    if (!alive.length) return true;
    if (all.length > 1 && alive.length <= 1 && finOf(alive[0]) == null) return true;
    return alive.every((e) => finOf(e) != null);
  },

  result: (p) => ({ fin: p.fin, d: Math.round(Math.max(0, -p.y) * 100) / 100, out: p.out ? 1 : 0, t: p.out ? Math.round(p.tOut * 1000) : null }),
  pack: (p) => ({ vx: Math.round(p.vx * 100) / 100, fn: p.fin }),
  hud(p) {
    if (p.fin != null) return `{flag} ${p.fin.toFixed(1)} s`;
    if (p.out) return '{ghost}';
    return `{flag} ${Math.max(0, Math.round((LEN + p.y) * M))} m`;
  },
  hudRight(ents) {
    const alive = ents.filter((e) => !e.out).length;
    return `{people} ${alive}`;
  },
  endText: (p) => (p.fin != null ? '{flag} ¡Llegaste a la meta!' : '{trophy} ¡Sigues en pie!'),
  won: (p) => !p.out,

  music: 'race',
  events(t0, t1, W, ext, ents, fx) {
    const st = fx.st;
    const me = fx.me;
    if (!st.seen) { st.seen = new Set(); st.fin = new Set(); st.ramp = me.rampT; st.bump = me.bumpT; }
    // nieve que cae alrededor
    for (let i = 0; i < 2; i++) fx.burst(me.x + (Math.random() - 0.5) * 3, 1.3, me.y - Math.random() * 2.5, { n: 1, color: ['#ffffff'], speed: 0.05, up: 0, size: 0.025, life: 2.4, gravity: 0.35, drag: 0.2 });
    // polvo de nieve al tallar
    if (!me.out && me.fin == null && me.z <= 0 && Math.abs(me.vx) > 0.6 && Math.random() < 0.5) fx.burst(me.x, 0.02, me.y + 0.04, { n: 2, color: ['#ffffff', '#e0f2ff'], speed: 0.25, up: 0.3, size: 0.03, life: 0.4, gravity: 1.5 });
    if (me.rampT !== st.ramp) { st.ramp = me.rampT; fx.sfx.launch(); fx.msg('{rocket} ¡A volar!', 800); fx.burst(me.x, 0.05, me.y, { n: 24, color: ['#ffffff', '#caf0f8'], speed: 0.6, up: 0.9, size: 0.04, life: 0.6, gravity: 2 }); }
    if (me.bumpT !== st.bump) { st.bump = me.bumpT; fx.sfx.thud(0.6); fx.shake(0.02); }
    if (me.out && !st.specMsg && ents.some((e) => !e.out)) { st.specMsg = 1; setTimeout(() => fx.msg('{eye} Mirando al que va primero', 1800), 1300); }
    for (const e of ents) {
      // alguien chocó
      if (e.out && !st.seen.has(e.id)) {
        st.seen.add(e.id);
        fx.sfx.thud(e.id === me.id ? 1 : 0.5);
        fx.sfx.crack(0.5);
        if (e.id === me.id) fx.shake(0.06);
        fx.burst(e.x, 0.1, e.y, { n: 40, color: ['#ffffff', '#e0f2ff', '#adb5bd'], speed: 0.9, up: 1.2, size: 0.05, life: 0.9, gravity: 2.5 });
      }
      // alguien llegó a la meta
      const f = finOf(e);
      if (f != null && !st.fin.has(e.id)) {
        st.fin.add(e.id);
        const place = st.fin.size;
        if (e.id === me.id) {
          fx.sfx.win();
          fx.msg(`{flag} ¡Llegaste ${place}º!`, 0);
          fx.burst(e.x, 0.3, e.y, { n: 70, color: ['#ffd60a', '#ff4d6d', '#3a86ff', '#06d6a0', '#ffffff'], speed: 1, up: 2, size: 0.05, life: 1.6, gravity: 2.5 });
        } else fx.sfx.whistle(0.5);
      }
    }
    for (let k = 1; k <= 5; k++) { const tt = TOTAL - k; if (tt > t0 && tt <= t1) fx.sfx.count(); }
  },

  PR,
  scene3d: {
    sky: '#9bd3f5',
    hemiSky: '#ffffff',
    hemiGround: '#9fb7d0',
    follow: true,
    camElev: 30,
    camFit: 1.05,
    camFitZ: 1.0,
    jumpH: 0.6,
    lookAhead: (e) => (SPEC.on ? { x: SPEC.x * 0.4 - e.x, y: SPEC.y - e.y - 0.9 } : { x: -e.x * 0.6, y: -0.9 }),
    trailColor: ['#ffffff', '#caf0f8'],
    splashColor: ['#ffffff', '#e0f2ff'],
    setup(S, W) { buildScene(S, W); },
    update(S, t, W, ext, ents) {
      const o = S.objs;
      for (const f of o.flags) f.rotation.y = Math.sin(t * 3 + f.userData.ph) * 0.4;
      o.banner.position.y = 0.62 + Math.sin(t * 2) * 0.01;
      spectate(ents);
    },
    makeAvatar: (S, e, U) => makeRider(S, e, U),
  },

  // vista 2D (sin 3D): la pista vista desde arriba, siguiendo a mi jugador
  draw(g, v, t, W, ents, meId) {
    const size = v.size, c = size / 2;
    const me = spectate(ents) || ents[0];
    const s = size / (2 * (HW + 0.25));
    const cy = (me ? me.y : 0) - 0.55;
    const X = (x) => c + x * s, Y = (y) => c + (y - cy) * s;
    g.fillStyle = '#dbeafe'; g.fillRect(0, 0, size, size);
    g.fillStyle = '#ffffff'; g.fillRect(X(-HW), 0, HW * 2 * s, size);
    g.strokeStyle = '#ef233c'; g.lineWidth = 3; g.setLineDash([8, 8]);
    g.beginPath(); g.moveTo(X(-HW), 0); g.lineTo(X(-HW), size); g.moveTo(X(HW), 0); g.lineTo(X(HW), size); g.stroke(); g.setLineDash([]);
    // meta
    const fy = Y(-LEN);
    if (fy > -20 && fy < size + 20) for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#1b1035' : '#fff'; g.fillRect(X(-HW) + (i * HW * 2 * s) / 12, fy - 5, (HW * 2 * s) / 12, 10); }
    const yTop = cy - c / s - 0.3, yBot = cy + c / s + 0.3;
    for (const o of W.obs) {
      if (o.y > yBot || o.y < yTop) continue;
      const x = X(o.x), y = Y(o.y);
      if (o.t === 'tree') { g.fillStyle = '#2d6a4f'; g.beginPath(); g.arc(x, y, o.r * s * 1.3, 0, TAU); g.fill(); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x - 2, y - 2, o.r * s * 0.5, 0, TAU); g.fill(); }
      else if (o.t === 'rock') { g.fillStyle = '#6c757d'; g.beginPath(); g.arc(x, y, o.r * s, 0, TAU); g.fill(); }
      else if (o.t === 'log') { g.fillStyle = '#8d5a3b'; g.fillRect(x - o.hw * s, y - o.hd * s, o.hw * 2 * s, o.hd * 2 * s); }
      else { g.fillStyle = '#4cc9f0'; g.fillRect(x - o.hw * s, y - o.hd * s, o.hw * 2 * s, o.hd * 2 * s); g.fillStyle = '#fff'; g.font = `bold ${Math.round(o.hd * s * 1.6)}px system-ui`; g.textAlign = 'center'; g.fillText('▲', x, y + o.hd * s * 0.6); }
    }
    const view = { ...v, R: s, X, Y };
    for (const e of ents) drawPlayer(g, view, { ...e, pr: PR * 1.3 }, meId, t);
  },
};

// ---------------------------------------------------------------- 3D
function buildScene(S, W) {
  const { THREE, scene } = S;
  scene.fog = new THREE.Fog('#cfe8fb', 4, 12);
  // nieve
  const snowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#f4f9ff'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${170 + Math.random() * 60},${200 + Math.random() * 40},255,${Math.random() * 0.25})`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
    // surcos de las tablas
    g.strokeStyle = 'rgba(160,190,230,0.35)'; g.lineWidth = 2;
    for (let i = 0; i < 6; i++) { g.beginPath(); const x0 = Math.random() * 256; g.moveTo(x0, 0); g.bezierCurveTo(x0 + 40, 90, x0 - 40, 170, x0 + 10, 256); g.stroke(); }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  })();
  snowTex.repeat.set(2, (LEN + 12) / 1.6);
  const track = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, LEN + 12), new THREE.MeshStandardMaterial({ map: snowTex, roughness: 0.85 }));
  track.rotation.x = -Math.PI / 2;
  track.position.set(0, 0, -(LEN + 12) / 2 + 4);
  track.receiveShadow = true;
  scene.add(track);
  const field = new THREE.Mesh(new THREE.PlaneGeometry(14, LEN + 24), new THREE.MeshStandardMaterial({ color: '#e6f1fb', roughness: 1 }));
  field.rotation.x = -Math.PI / 2;
  field.position.set(0, -0.01, -(LEN + 24) / 2 + 8);
  field.receiveShadow = true;
  scene.add(field);
  // montañas al fondo
  for (let i = 0; i < 9; i++) {
    const h = 3 + (i * 53 % 4);
    const m = new THREE.Mesh(new THREE.ConeGeometry(2.4 + (i % 3), h, 6), new THREE.MeshStandardMaterial({ color: i % 2 ? '#8fb3d9' : '#a9c6e8', flatShading: true, roughness: 1 }));
    m.position.set(-10 + i * 2.5, h / 2 - 0.5, -LEN - 9 - (i % 3) * 2);
    scene.add(m);
    const cap = new THREE.Mesh(new THREE.ConeGeometry((2.4 + (i % 3)) * 0.4, h * 0.4, 6), new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true }));
    cap.position.set(m.position.x, h - 0.5 - h * 0.2, m.position.z);
    scene.add(cap);
  }
  // árboles: tronco + dos conos + nieve arriba (una sola malla por pieza para todos)
  const trunkG = new THREE.CylinderGeometry(0.018, 0.024, 0.09, 6);
  const leafG1 = new THREE.ConeGeometry(0.09, 0.16, 8);
  const leafG2 = new THREE.ConeGeometry(0.065, 0.13, 8);
  const capG = new THREE.ConeGeometry(0.035, 0.05, 8);
  const trunkM = new THREE.MeshStandardMaterial({ color: '#7f5539' });
  const leafM = new THREE.MeshStandardMaterial({ color: '#2d6a4f', roughness: 0.8, flatShading: true });
  const capM = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 });
  const trees = [...W.obs.filter((o) => o.t === 'tree').map((o) => ({ x: o.x, y: o.y, s: 1.15 })), ...W.deco];
  const inst = (geo, mat, y) => {
    const im = new THREE.InstancedMesh(geo, mat, trees.length);
    const m4 = new THREE.Matrix4();
    trees.forEach((tr, i) => { m4.makeScale(tr.s, tr.s, tr.s); m4.setPosition(tr.x, y * tr.s, tr.y); im.setMatrixAt(i, m4); });
    im.castShadow = true;
    scene.add(im);
  };
  inst(trunkG, trunkM, 0.045);
  inst(leafG1, leafM, 0.16);
  inst(leafG2, leafM, 0.26);
  inst(capG, capM, 0.32);
  // rocas, troncos y rampas
  const rockM = new THREE.MeshStandardMaterial({ color: '#6c757d', roughness: 0.9, flatShading: true });
  const logM = new THREE.MeshStandardMaterial({ color: '#8d5a3b', roughness: 0.8 });
  // rampa: lados en triángulo más oscuros para que se note hacia dónde sube
  const rampM = [new THREE.MeshStandardMaterial({ color: '#0077b6', roughness: 0.5 }), new THREE.MeshStandardMaterial({ color: '#4cc9f0', roughness: 0.4 })];
  const arrowM = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  for (const o of W.obs) {
    if (o.t === 'rock') {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(o.r, 0), rockM);
      m.scale.set(1.1, 0.75, 1);
      m.position.set(o.x, o.r * 0.45, o.y);
      m.rotation.y = o.rot;
      m.castShadow = true;
      scene.add(m);
      const snow = new THREE.Mesh(new THREE.SphereGeometry(o.r * 0.7, 8, 6, 0, TAU, 0, Math.PI / 2), capM);
      snow.scale.set(1.1, 0.5, 1);
      snow.position.set(o.x, o.r * 0.85, o.y);
      scene.add(snow);
    } else if (o.t === 'log') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(o.hd, o.hd, o.hw * 2, 10), logM);
      m.rotation.z = Math.PI / 2;
      m.position.set(o.x, o.hd, o.y);
      m.castShadow = true;
      scene.add(m);
      for (const s of [-1, 1]) {
        const end = new THREE.Mesh(new THREE.CircleGeometry(o.hd * 0.95, 10), new THREE.MeshStandardMaterial({ color: '#e9c46a' }));
        end.rotation.y = (s * Math.PI) / 2;
        end.position.set(o.x + s * (o.hw + 0.001), o.hd, o.y);
        scene.add(end);
      }
    } else if (o.t === 'ramp') {
      // de perfil: sube desde arriba de la montaña hacia la meta (lo alto queda hacia abajo)
      const sh = new THREE.Shape([new THREE.Vector2(-o.hd, 0), new THREE.Vector2(o.hd, 0), new THREE.Vector2(o.hd, 0.08)]);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: o.hw * 2, bevelEnabled: false });
      geo.translate(0, 0, -o.hw);
      const m = new THREE.Mesh(geo, rampM);
      m.rotation.y = Math.PI / 2;
      m.position.set(o.x, 0, o.y);
      m.castShadow = true;
      scene.add(m);
      const ar = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 3), arrowM);
      ar.rotation.x = -Math.PI / 2 + 0.42;
      ar.position.set(o.x, 0.05, o.y - 0.01);
      scene.add(ar);
    }
  }
  // bordes: banderines rojos y azules
  const flags = [];
  const poleG = new THREE.CylinderGeometry(0.006, 0.006, 0.2, 5);
  const poleM = new THREE.MeshStandardMaterial({ color: '#ffffff' });
  const flagM = ['#3a86ff', '#ef233c'].map((c) => new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide }));
  const flagG = new THREE.PlaneGeometry(0.07, 0.05);
  for (let y = 1; y > -LEN - 2; y -= 0.9) {
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(poleG, poleM);
      p.position.set(s * (HW + 0.02), 0.1, y);
      scene.add(p);
      const f = new THREE.Mesh(flagG, flagM[Math.abs(Math.round(y / 0.9)) % 2]);
      f.position.set(0.035, 0.07, 0);
      const holder = new THREE.Group();
      holder.position.copy(p.position);
      holder.add(f);
      holder.userData.ph = y * 3 + s;
      scene.add(holder);
      flags.push(holder);
    }
  }
  // salida y meta
  const gate = (y, label, colors) => {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8), new THREE.MeshStandardMaterial({ color: colors[0] }));
      pole.position.set(s * (HW + 0.05), 0.35, 0);
      pole.castShadow = true;
      g.add(pole);
    }
    const c = document.createElement('canvas');
    c.width = 512; c.height = 64;
    const cg = c.getContext('2d');
    for (let i = 0; i < 32; i++) for (let j = 0; j < 4; j++) { cg.fillStyle = (i + j) % 2 ? colors[1] : '#ffffff'; cg.fillRect(i * 16, j * 16, 16, 16); }
    cg.fillStyle = 'rgba(0,0,0,0.55)'; cg.fillRect(160, 8, 192, 48);
    cg.fillStyle = '#ffffff'; cg.font = 'bold 40px system-ui'; cg.textAlign = 'center'; cg.textBaseline = 'middle'; cg.fillText(label, 256, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2 + 0.1, 0.14), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide }));
    banner.position.y = 0.62;
    g.add(banner);
    g.position.z = y;
    scene.add(g);
    return banner;
  };
  gate(0.6, 'SALIDA', ['#ef233c', '#ef233c']);
  const banner = gate(-LEN, 'META', ['#ffd60a', '#1b1035']);
  // línea de meta en el piso
  const line = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, 0.08), new THREE.MeshBasicMaterial({ color: '#ef233c' }));
  line.rotation.x = -Math.PI / 2;
  line.position.set(0, 0.003, -LEN);
  scene.add(line);
  Object.assign(S.objs, { flags, banner });
}

// Muñeco sobre una tabla de snowboard: de lado, con los pies abiertos a lo largo
// de la tabla, rodillas un poco dobladas y los brazos abiertos para equilibrar.
export function makeRider(S, e, U) {
  const { THREE } = S;
  const ch = S.makeCharacter(e, U);
  const board = new THREE.Group();
  const deckM = new THREE.MeshStandardMaterial({ color: e.c || '#ffffff', roughness: 0.4 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(U * 0.95, U * 0.14, U * 3.4), deckM);
  deck.castShadow = true;
  board.add(deck);
  for (const s of [-1, 1]) {
    // puntas redondeadas y un poco levantadas
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(U * 0.475, U * 0.475, U * 0.14, 16, 1, false, 0, Math.PI), deckM);
    tip.position.set(0, U * 0.05, s * U * 1.7);
    tip.rotation.set(s * 0.25, s > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
    board.add(tip);
  }
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(U * 0.3, U * 0.15, U * 3.0), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
  board.add(stripe);
  // fijaciones (donde van los pies)
  const bindM = new THREE.MeshStandardMaterial({ color: '#2b2d42' });
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(U * 0.8, U * 0.12, U * 0.5), bindM);
    b.position.set(0, U * 0.12, s * U * 0.62);
    board.add(b);
  }
  board.position.y = U * 0.07;
  // el muñeco va en su propio grupo, para girarlo junto con la tabla en los trucos
  const body = new THREE.Group();
  body.add(ch.rig);
  ch.root.add(board);
  ch.root.add(body);
  // pies abiertos (a lo largo de la tabla una vez que el cuerpo queda de lado)
  ch.legs.forEach((l, i) => { const s = i ? 1 : -1; l.position.x = s * U * 0.5; l.rotation.z = s * 0.22; });
  return {
    ...ch,
    update(en, dt, t, a, s) {
      const vx = typeof en.vx === 'number' ? en.vx : (en.e && en.e.vx) || 0;
      // la tabla apunta hacia la meta y gira un poco al tallar
      const yawT = Math.PI + Math.atan2(vx, 1.2) * 0.8;
      a.byaw = a.byaw === undefined ? yawT : a.byaw + (yawT - a.byaw) * Math.min(1, dt * 10);
      board.rotation.y = a.byaw;
      board.rotation.z = -vx * 0.12;
      board.visible = !s.ghost;
      // el cuerpo de lado sobre la tabla, girado un poco hacia la cámara
      body.rotation.y = a.byaw - Math.PI / 2 - 0.4;
      ch.rig.rotation.set(0, 0, 0);
      ch.rig.position.y = U * 0.2;
      // se inclina hacia la curva (todo: tabla y muñeco)
      ch.root.rotation.z = -vx * 0.16;
      const air = s.z > 0.05;
      if (air) {
        // en el aire: rodillas arriba, brazos arriba y un giro de 360° si salta alto
        a.air = (a.air || 0) + dt;
        ch.legs[0].rotation.x = ch.legs[1].rotation.x = -0.5;
        ch.arms[0].rotation.set(0, 0, -2.3);
        ch.arms[1].rotation.set(0, 0, 2.3);
        ch.root.rotation.y = s.z > 0.28 ? Math.min(1, a.air / 0.55) * TAU : 0;
      } else {
        a.air = 0;
        ch.root.rotation.y = 0;
        // rodillas dobladas que rebotan un poco y brazos abiertos para equilibrar
        const k = Math.sin(t * 7 + a.U * 50) * 0.06;
        ch.legs[0].rotation.x = -0.18 + k;
        ch.legs[1].rotation.x = -0.18 - k;
        ch.arms[0].rotation.set(0.2, 0, -1.15 + k);
        ch.arms[1].rotation.set(-0.2, 0, 1.15 - k);
      }
      ch.torso.rotation.x = air ? 0 : 0.18; // un poco agachado
      const blink = s.inv && !s.ghost && Math.floor(t * 12) % 2;
      ch.rig.visible = !s.ghost && !blink;
    },
  };
}

// barra de avance: dónde va cada uno entre la salida y la meta
function topBar(ext, players) {
  const all = (ext && ext.all) || [];
  const dots = players.map((p, i) => {
    const e = all.find((x) => x && x.id === p.id);
    if (!e) return '';
    const k = Math.max(0, Math.min(1, -e.y / LEN));
    return `<i style="left:${Math.round(k * 100)}%;background:${p.c || COLORS[i]};${e.out ? 'opacity:.35' : ''}"></i>`;
  }).join('');
  return `<span class="sn-bar">${dots}<b>🏁</b></span>`;
}

export default {
  id: 'snow',
  name: 'Bajada nevada',
  realtime: true,
  desc: '¡Baja la montaña en snowboard! Muévete de lado a lado (arriba acelera, abajo frena) y usa SALTA para pasar sobre rocas y troncos. Los árboles hay que esquivarlos; las rampas te mandan a volar. Si chocas quedas fuera. Gana quien llegue primero a la meta o el último en pie.',
  dur: () => TOTAL * 1000,
  mount: (el, ctx) => { ME = ctx.me; SPEC.on = false; return mountRT(el, ctx, { ...G, topText: (t, W, ext) => topBar(ext, ctx.players || []) }); },
  evaluate(v) {
    if (!v || typeof v.d !== 'number') return null;
    const d = Math.max(0, Math.min(LEN + 3, v.d));
    if (typeof v.fin === 'number' && v.fin > 3 && v.fin <= TOTAL) return { score: 2e6 - Math.round(v.fin * 1000), label: `{flag} meta en ${v.fin.toFixed(1)} s` };
    if (!v.out) return { score: 1e6 + Math.round(d * 1000), label: `{trophy} en pie · ${Math.round(d * M)} m` };
    return { score: Math.round(d * 1000), label: `chocó a los ${Math.round(d * M)} m` };
  },
  bot: (r, seed, p) => simulateBot(G, seed, Number(String(p?.id || 'bot0').slice(3)) || 0),
};
