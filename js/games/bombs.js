// 💣 Lluvia de bombas — tiempo real. Caen bombas sobre la plataforma: su
// sombra roja avisa dónde van a explotar. Esquívalas; el botón ACELERA da un
// impulso corto. 3 vidas.
import { mulberry32 } from '../util.js';
import { DT, TAU, mountRT, simulateBot, newPlayerBase, moveBasic, clampCircle, drawPlayer, evalSurvival } from '../rt.js';

const TOTAL = 35;
const LIVES = 3;
const ARENA = 0.9;
const PR = 0.06;
const FUSE = 1.35;
const BOOM = 0.35;

const G = {
  TOTAL, LIVES, lives: LIVES,
  action: 'ACELERA',

  world(seed) {
    const r = mulberry32(seed ^ 0xb0b0);
    const bombs = [];
    const rndPos = (maxR) => { const a = r() * TAU, d = Math.sqrt(r()) * maxR; return [Math.cos(a) * d, Math.sin(a) * d]; };
    let t = 1;
    while (t < TOTAL - 1) {
      const rad = 0.19 + t * 0.0035;
      const k = r();
      if (k < 0.65 || t < 6) {
        const [x, y] = rndPos(0.85);
        bombs.push({ t0: t, x, y, r: rad });
        t += Math.max(0.28, 0.95 - t * 0.02);
      } else if (k < 0.82) {
        // anillo de bombas
        const [cx, cy] = rndPos(0.35);
        const n = 7, rr = 0.55;
        const a0 = r() * TAU;
        for (let i = 0; i < n; i++) bombs.push({ t0: t, x: cx + Math.cos(a0 + (i * TAU) / n) * rr, y: cy + Math.sin(a0 + (i * TAU) / n) * rr, r: rad * 0.9 });
        t += 1.6;
      } else {
        // línea que barre la plataforma
        const a = r() * TAU;
        const dx = Math.cos(a), dy = Math.sin(a);
        for (let i = -3; i <= 3; i++) bombs.push({ t0: t + (i + 3) * 0.12, x: dx * i * 0.27, y: dy * i * 0.27, r: rad * 0.85 });
        t += 1.8;
      }
    }
    bombs.forEach((b, i) => { b.te = b.t0 + FUSE; b.id = i; });
    return { bombs };
  },

  spawn(i) {
    const a = -Math.PI / 2 + (i * TAU) / 4 + 0.4;
    const p = newPlayerBase(Math.cos(a) * 0.55, Math.sin(a) * 0.55, LIVES);
    p.bi = 0;
    return p;
  },

  step(p, inp, t, W) {
    if (p.out) return null;
    p._ev = null;
    moveBasic(p, inp, 0.62);
    clampCircle(p, ARENA - PR);
    const B = W.bombs;
    while (p.bi < B.length && B[p.bi].te < t - 0.2) p.bi++;
    for (let i = p.bi; i < B.length && B[i].t0 <= t; i++) {
      const b = B[i];
      if (t >= b.te && t < b.te + DT && p.inv <= 0 && Math.hypot(p.x - b.x, p.y - b.y) < b.r + PR * 0.7) {
        p.h--;
        p.inv = 1.1;
        if (p.h <= 0) { p.out = true; p.tOut = t; return 'out'; }
        return 'hit';
      }
    }
    return p._ev;
  },

  brain(seed, idx, W) {
    const r = mulberry32((seed ^ (0x3c6ef372 * (idx + 1))) >>> 0);
    const skill = 0.6 + r() * 0.22;
    let gx = 0, gy = 0, next = 0;
    const seen = new Map();
    return (p, t) => {
      if (t > next) { const a = r() * TAU, d = r() * 0.6; gx = Math.cos(a) * d; gy = Math.sin(a) * d; next = t + 1 + r() * 2; }
      let vx = 0, vy = 0, danger = false;
      const B = W.bombs;
      for (let i = p.bi; i < B.length && B[i].t0 <= t; i++) {
        const b = B[i];
        const left = b.te - t;
        if (left < 0 || left > 1.1) continue;
        const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1e-3;
        if (d > b.r + PR + 0.08) continue;
        if (!seen.has(b.id)) seen.set(b.id, r() < skill);
        if (!seen.get(b.id)) continue; // no la vio
        danger = true;
        vx += dx / d; vy += dy / d;
        if (left < 0.45 && d < b.r && r() < 0.06) p.act = true;
      }
      if (danger) {
        // alejarse, pero sin salirse
        vx -= p.x * 0.6; vy -= p.y * 0.6;
        const l = Math.hypot(vx, vy) || 1;
        return { x: vx / l, y: vy / l };
      }
      const dx = gx - p.x, dy = gy - p.y, l = Math.hypot(dx, dy);
      return l > 0.05 ? { x: (dx / l) * 0.7, y: (dy / l) * 0.7 } : { x: 0, y: 0 };
    };
  },

  result: (p) => ({ h: Math.max(0, p.h), t: p.out ? Math.round(p.tOut * 1000) : TOTAL * 1000 }),

  draw(g, v, t, W, ents, meId) {
    const { size, c, R } = v;
    g.fillStyle = '#1d3557';
    g.fillRect(0, 0, size, size);
    // lava/abismo con brillo
    const lg = g.createRadialGradient(c, c, R * 0.9, c, c, size * 0.75);
    lg.addColorStop(0, '#ff7b00'); lg.addColorStop(1, '#6a040f');
    g.fillStyle = lg;
    g.fillRect(0, 0, size, size);
    g.beginPath(); g.arc(c, c + 6, ARENA * R, 0, TAU); g.fillStyle = 'rgba(0,0,0,0.4)'; g.fill();
    g.beginPath(); g.arc(c, c, ARENA * R, 0, TAU); g.fillStyle = '#8d99ae'; g.fill();
    g.save(); g.clip();
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 2;
    for (let i = -6; i <= 6; i++) { g.beginPath(); g.moveTo(0, c + i * R * 0.18); g.lineTo(size, c + i * R * 0.18); g.stroke(); }
    g.restore();
    g.lineWidth = 6; g.strokeStyle = '#5c677d'; g.beginPath(); g.arc(c, c, ARENA * R, 0, TAU); g.stroke();
    // avisos
    const B = W.bombs;
    for (const b of B) {
      if (b.t0 > t || t > b.te + BOOM) continue;
      const bx = v.X(b.x), by = v.Y(b.y), br = b.r * R;
      if (t < b.te) {
        const k = (t - b.t0) / FUSE;
        g.beginPath(); g.arc(bx, by, br, 0, TAU);
        g.fillStyle = `rgba(230,57,70,${0.15 + 0.35 * k})`; g.fill();
        g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.6)';
        g.beginPath(); g.arc(bx, by, br * (1 - k), 0, TAU); g.stroke();
      }
    }
    for (const e of ents) drawPlayer(g, v, { ...e, pr: PR }, meId, t);
    // bombas cayendo y explosiones (encima de todo)
    for (const b of B) {
      if (b.t0 > t || t > b.te + BOOM) continue;
      const bx = v.X(b.x), by = v.Y(b.y), br = b.r * R;
      if (t < b.te) {
        const k = (t - b.t0) / FUSE;
        const yOff = (1 - k) * (1 - k) * size * 0.6;
        g.font = `${Math.round(R * 0.13)}px system-ui, 'Apple Color Emoji'`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('💣', bx, by - yOff);
      } else {
        const k = (t - b.te) / BOOM;
        const gr = g.createRadialGradient(bx, by, 0, bx, by, br * (0.8 + k * 0.4));
        gr.addColorStop(0, `rgba(255,255,200,${1 - k})`);
        gr.addColorStop(0.5, `rgba(255,190,11,${0.9 - k * 0.8})`);
        gr.addColorStop(1, 'rgba(230,57,70,0)');
        g.beginPath(); g.arc(bx, by, br * (0.8 + k * 0.4), 0, TAU); g.fillStyle = gr; g.fill();
      }
    }
  },
};

export default {
  id: 'bombs',
  name: 'Lluvia de bombas',
  emoji: '💣',
  realtime: true,
  desc: '¡Caen bombas! La sombra roja muestra dónde van a explotar: sal de ahí. El botón ACELERA te da un impulso. 3 vidas.',
  dur: () => TOTAL * 1000,
  mount: (el, ctx) => mountRT(el, ctx, G),
  evaluate: (v) => evalSurvival(v, TOTAL, LIVES),
  bot: (r, seed, p) => simulateBot(G, seed, Number(String(p?.id || 'bot0').slice(3)) || 0),
};
