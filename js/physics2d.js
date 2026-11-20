// Motor de física 2D pequeño, solo para polígonos convexos (bloques, tablones,
// cuñas). Sigue la receta de Box2D Lite: choque por ejes separadores (SAT) con
// recorte de la cara incidente, impulsos acumulados con arranque en caliente
// (warm starting), fricción de Coulomb y bodies que se duermen cuando quedan
// quietos. Suficiente para apilar una torre que tiembla y se cae de verdad.

const SLOP = 0.008;       // penetración permitida (evita temblores)
const BETA = 0.2;         // corrección de penetración por paso
const SLEEP_V = 0.06;     // velocidad bajo la cual un bloque se considera quieto
const SLEEP_T = 0.7;      // segundos quieto antes de dormirse

let nextId = 1;

// Polígono convexo (vértices en sentido antihorario, en cualquier posición: se
// recentran en su centroide). Devuelve la forma con masa e inercia por densidad 1.
export function polygon(points) {
  // centroide y área
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i], [x2, y2] = points[(i + 1) % points.length];
    const cr = x1 * y2 - x2 * y1;
    A += cr; cx += (x1 + x2) * cr; cy += (y1 + y2) * cr;
  }
  A /= 2; cx /= 6 * A; cy /= 6 * A;
  const v = points.map(([x, y]) => [x - cx, y - cy]);
  // inercia respecto al centroide (densidad 1)
  let I = 0;
  for (let i = 0; i < v.length; i++) {
    const [x1, y1] = v[i], [x2, y2] = v[(i + 1) % v.length];
    const cr = Math.abs(x1 * y2 - x2 * y1);
    I += cr * (x1 * x1 + x1 * x2 + x2 * x2 + y1 * y1 + y1 * y2 + y2 * y2);
  }
  I /= 12;
  const n = v.map((p, i) => {
    const q = v[(i + 1) % v.length];
    const ex = q[0] - p[0], ey = q[1] - p[1], l = Math.hypot(ex, ey) || 1;
    return [ey / l, -ex / l];
  });
  return { v, n, area: Math.abs(A), I: Math.abs(I) };
}
export const box = (hw, hh) => polygon([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]);

export class World {
  constructor(gravity = -10) {
    this.g = gravity;
    this.bodies = [];
    this.arbiters = new Map();
    this.iterations = 12;
    this.onContact = null; // (A, B, normalImpulse) la primera vez que se tocan
  }

  add(shape, o = {}) {
    const dyn = !o.static;
    const m = dyn ? shape.area * (o.density ?? 1) : 0;
    const b = {
      id: nextId++, shape,
      x: o.x || 0, y: o.y || 0, a: o.angle || 0,
      vx: 0, vy: 0, w: 0,
      im: dyn ? 1 / m : 0, iI: dyn ? 1 / (shape.I * (o.density ?? 1)) : 0,
      fric: o.friction ?? 0.7,
      dyn, sleep: false, calm: 0,
      wv: shape.v.map(() => [0, 0]), wn: shape.n.map(() => [0, 0]),
      data: o.data || null,
    };
    this.sync(b);
    this.bodies.push(b);
    return b;
  }

  remove(b) {
    this.bodies = this.bodies.filter((x) => x !== b);
    for (const k of [...this.arbiters.keys()]) { const ar = this.arbiters.get(k); if (ar.A === b || ar.B === b) this.arbiters.delete(k); }
  }

  wakeAll() { for (const b of this.bodies) if (b.dyn) { b.sleep = false; b.calm = 0; } }

  // vértices y normales en el mundo + caja envolvente
  sync(b) {
    const c = Math.cos(b.a), s = Math.sin(b.a);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    b.shape.v.forEach(([lx, ly], i) => {
      const wx = b.x + c * lx - s * ly, wy = b.y + s * lx + c * ly;
      b.wv[i][0] = wx; b.wv[i][1] = wy;
      if (wx < x0) x0 = wx; if (wx > x1) x1 = wx; if (wy < y0) y0 = wy; if (wy > y1) y1 = wy;
    });
    b.shape.n.forEach(([nx, ny], i) => { b.wn[i][0] = c * nx - s * ny; b.wn[i][1] = s * nx + c * ny; });
    b.box = [x0, y0, x1, y1];
  }

  step(dt) {
    const B = this.bodies;
    // fuerzas
    for (const b of B) {
      if (!b.dyn || b.sleep) continue;
      b.vy += this.g * dt;
      b.vx *= 1 - 0.05 * dt; b.vy *= 1 - 0.05 * dt; b.w *= 1 - 0.3 * dt;
    }
    // choques
    const seen = new Set();
    for (let i = 0; i < B.length; i++) {
      for (let j = i + 1; j < B.length; j++) {
        let A = B[i], C = B[j];
        if (!A.dyn && !C.dyn) continue;
        if ((A.sleep || !A.dyn) && (C.sleep || !C.dyn)) {
          // los dos quietos: conservar el contacto tal cual
          const k = A.id < C.id ? A.id + ':' + C.id : C.id + ':' + A.id;
          if (this.arbiters.has(k)) seen.add(k);
          continue;
        }
        if (A.box[2] < C.box[0] || C.box[2] < A.box[0] || A.box[3] < C.box[1] || C.box[3] < A.box[1]) continue;
        if (A.id > C.id) [A, C] = [C, A];
        const key = A.id + ':' + C.id;
        const pts = collide(A, C);
        if (!pts) continue;
        seen.add(key);
        const old = this.arbiters.get(key);
        if (old) {
          // arranque en caliente: conservar los impulsos de los puntos que siguen
          for (const p of pts) { const o = old.c.find((q) => q.id === p.id); if (o) { p.Pn = o.Pn; p.Pt = o.Pt; } }
          old.c = pts;
        } else {
          this.arbiters.set(key, { A, B: C, c: pts, fresh: true });
        }
        // un bloque despierto que choca rápido despierta al dormido
        const ar = this.arbiters.get(key);
        for (const [s, o] of [[A, C], [C, A]]) {
          if (s.sleep && !o.sleep && o.dyn && Math.hypot(o.vx, o.vy) + Math.abs(o.w) > 0.4) { s.sleep = false; s.calm = 0; }
        }
        void ar;
      }
    }
    for (const k of [...this.arbiters.keys()]) if (!seen.has(k)) this.arbiters.delete(k);

    const inv = (b) => (b.dyn && !b.sleep ? [b.im, b.iI] : [0, 0]);
    const active = [...this.arbiters.values()].filter((ar) => (ar.A.dyn && !ar.A.sleep) || (ar.B.dyn && !ar.B.sleep));
    // preparación
    for (const ar of active) {
      const { A, B: C } = ar;
      const [imA, iIA] = inv(A), [imB, iIB] = inv(C);
      const mu = Math.sqrt(A.fric * C.fric);
      ar.mu = mu;
      for (const p of ar.c) {
        p.rax = p.x - A.x; p.ray = p.y - A.y; p.rbx = p.x - C.x; p.rby = p.y - C.y;
        const rnA = p.rax * p.ny - p.ray * p.nx, rnB = p.rbx * p.ny - p.rby * p.nx;
        p.mn = 1 / (imA + imB + iIA * rnA * rnA + iIB * rnB * rnB);
        const tx = p.ny, ty = -p.nx;
        const rtA = p.rax * ty - p.ray * tx, rtB = p.rbx * ty - p.rby * tx;
        p.mt = 1 / (imA + imB + iIA * rtA * rtA + iIB * rtB * rtB);
        p.bias = (BETA / dt) * Math.max(0, -p.sep - SLOP);
        p.Pn = p.Pn || 0; p.Pt = p.Pt || 0;
        // arranque en caliente
        const px = p.Pn * p.nx + p.Pt * tx, py = p.Pn * p.ny + p.Pt * ty;
        applyImp(A, imA, iIA, p.rax, p.ray, -px, -py);
        applyImp(C, imB, iIB, p.rbx, p.rby, px, py);
      }
    }
    // impulsos
    for (let it = 0; it < this.iterations; it++) {
      for (const ar of active) {
        const { A, B: C } = ar;
        const [imA, iIA] = inv(A), [imB, iIB] = inv(C);
        for (const p of ar.c) {
          const tx = p.ny, ty = -p.nx;
          // normal
          let dvx = C.vx - C.w * p.rby - A.vx + A.w * p.ray;
          let dvy = C.vy + C.w * p.rbx - A.vy - A.w * p.rax;
          const vn = dvx * p.nx + dvy * p.ny;
          let dPn = p.mn * (-vn + p.bias);
          const Pn0 = p.Pn;
          p.Pn = Math.max(Pn0 + dPn, 0);
          dPn = p.Pn - Pn0;
          applyImp(A, imA, iIA, p.rax, p.ray, -dPn * p.nx, -dPn * p.ny);
          applyImp(C, imB, iIB, p.rbx, p.rby, dPn * p.nx, dPn * p.ny);
          // fricción
          dvx = C.vx - C.w * p.rby - A.vx + A.w * p.ray;
          dvy = C.vy + C.w * p.rbx - A.vy - A.w * p.rax;
          const vt = dvx * tx + dvy * ty;
          let dPt = -p.mt * vt;
          const max = ar.mu * p.Pn;
          const Pt0 = p.Pt;
          p.Pt = Math.max(-max, Math.min(max, Pt0 + dPt));
          dPt = p.Pt - Pt0;
          applyImp(A, imA, iIA, p.rax, p.ray, -dPt * tx, -dPt * ty);
          applyImp(C, imB, iIB, p.rbx, p.rby, dPt * tx, dPt * ty);
        }
      }
    }
    // aviso del primer toque (para sonidos)
    if (this.onContact) {
      for (const ar of active) {
        if (!ar.fresh) continue;
        ar.fresh = false;
        this.onContact(ar.A, ar.B, ar.c.reduce((s, p) => s + p.Pn, 0));
      }
    }
    // mover y dormir
    for (const b of B) {
      if (!b.dyn || b.sleep) continue;
      b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.w * dt;
      this.sync(b);
      if (Math.hypot(b.vx, b.vy) < SLEEP_V && Math.abs(b.w) < SLEEP_V * 2) {
        b.calm += dt;
        if (b.calm > SLEEP_T) { b.sleep = true; b.vx = b.vy = b.w = 0; }
      } else b.calm = 0;
    }
  }
}

function applyImp(b, im, iI, rx, ry, px, py) {
  if (!im) return;
  b.vx += px * im; b.vy += py * im;
  b.w += iI * (rx * py - ry * px);
}

// mayor separación de B respecto a las caras de A
function maxSep(A, B) {
  let best = -Infinity, idx = 0;
  for (let i = 0; i < A.wn.length; i++) {
    const [nx, ny] = A.wn[i], [vx, vy] = A.wv[i];
    let m = Infinity;
    for (const [wx, wy] of B.wv) { const d = nx * (wx - vx) + ny * (wy - vy); if (d < m) m = d; }
    if (m > best) { best = m; idx = i; }
  }
  return [best, idx];
}

// Puntos de contacto entre dos polígonos (normal de A hacia B), o null.
function collide(A, B) {
  const [sA, eA] = maxSep(A, B);
  if (sA > 0) return null;
  const [sB, eB] = maxSep(B, A);
  if (sB > 0) return null;
  const flip = sB > sA * 0.98 + 0.001;
  const ref = flip ? B : A, inc = flip ? A : B, edge = flip ? eB : eA;
  const [nx, ny] = ref.wn[edge];
  // cara incidente: la más opuesta a la normal de referencia
  let ie = 0, md = Infinity;
  for (let i = 0; i < inc.wn.length; i++) { const d = nx * inc.wn[i][0] + ny * inc.wn[i][1]; if (d < md) { md = d; ie = i; } }
  const i2 = (ie + 1) % inc.wv.length;
  let seg = [
    { x: inc.wv[ie][0], y: inc.wv[ie][1], id: ie },
    { x: inc.wv[i2][0], y: inc.wv[i2][1], id: i2 },
  ];
  const v1 = ref.wv[edge], v2 = ref.wv[(edge + 1) % ref.wv.length];
  let tx = v2[0] - v1[0], ty = v2[1] - v1[1];
  const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
  seg = clip(seg, -tx, -ty, -(tx * v1[0] + ty * v1[1]), 16);
  if (seg.length < 2) return null;
  seg = clip(seg, tx, ty, tx * v2[0] + ty * v2[1], 32);
  if (seg.length < 2) return null;
  const off = nx * v1[0] + ny * v1[1];
  const out = [];
  for (const p of seg) {
    const sep = nx * p.x + ny * p.y - off;
    if (sep <= 0.002) {
      out.push({ x: p.x, y: p.y, sep, nx: flip ? -nx : nx, ny: flip ? -ny : ny, id: (flip ? 1000 : 0) + edge * 64 + p.id, Pn: 0, Pt: 0 });
    }
  }
  return out.length ? out : null;
}

function clip(seg, nx, ny, o, tag) {
  const [a, b] = seg;
  const da = nx * a.x + ny * a.y - o, db = nx * b.x + ny * b.y - o;
  const out = [];
  if (da <= 0) out.push(a);
  if (db <= 0) out.push(b);
  if (da * db < 0) {
    const k = da / (da - db);
    out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, id: (da > 0 ? a.id : b.id) + tag });
  }
  return out;
}
