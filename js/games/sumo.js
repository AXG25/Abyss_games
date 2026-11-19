// 🥊 Empujones — tiempo real. Todos en una plataforma que se va encogiendo.
// Choca con los demás y usa EMPUJA para lanzarlos al vacío. Si te caes,
// pierdes una vida y vuelves al centro. 3 vidas.
//
// Cada teléfono calcula los empujones que recibe SU jugador a partir de las
// posiciones de los demás (que incluyen si vienen empujando).
import { mulberry32 } from '../util.js';
import { DT, TAU, mountRT, simulateBot, newPlayerBase, drawPlayer, evalSurvival } from '../rt.js';

const TOTAL = 40;
const LIVES = 3;
const PR = 0.075;
const radiusAt = (t) => Math.max(0.5, 0.9 - Math.max(0, t - 8) * 0.0135);

const G = {
  TOTAL, LIVES, lives: LIVES,
  action: 'EMPUJA',
  fallText: '¡Al vacío! 😵',

  world() { return {}; },

  spawn(i) {
    const a = -Math.PI / 2 + (i * TAU) / 4 + Math.PI / 4;
    const p = newPlayerBase(Math.cos(a) * 0.45, Math.sin(a) * 0.45, LIVES);
    Object.assign(p, { vx: 0, vy: 0, fall: 0, push: 0, pcd: 0, scale: 1 });
    return p;
  },

  step(p, inp, t, W, ext) {
    if (p.out) return null;
    let ev = null;
    if (p.fall > 0) {
      p.fall -= DT;
      p.scale = Math.max(0, p.fall / 0.8);
      if (p.fall <= 0) {
        if (p.h <= 0) { p.out = true; p.tOut = t; return 'out'; }
        p.x = 0; p.y = 0; p.vx = 0; p.vy = 0; p.scale = 1; p.inv = 1.5;
      }
      return null;
    }
    // empujón (dash)
    if (p.act && p.pcd <= 0) {
      let dx = inp.x, dy = inp.y;
      if (Math.hypot(dx, dy) < 0.2) { dx = p.ldx || 0; dy = p.ldy || 1; }
      const l = Math.hypot(dx, dy) || 1;
      p.vx += (dx / l) * 1.6; p.vy += (dy / l) * 1.6;
      p.push = 0.3; p.pcd = 1.1;
      ev = 'act';
    }
    p.act = false;
    if (p.push > 0) p.push -= DT;
    if (p.pcd > 0) p.pcd -= DT;
    if (p.inv > 0) p.inv -= DT;
    const il = Math.hypot(inp.x, inp.y);
    if (il > 0.2) { p.ldx = inp.x / il; p.ldy = inp.y / il; }
    // aceleración + fricción (resbaloso)
    p.vx += inp.x * 3.2 * DT;
    p.vy += inp.y * 3.2 * DT;
    const fr = Math.pow(0.12, DT);
    p.vx *= fr; p.vy *= fr;
    const sp = Math.hypot(p.vx, p.vy), max = p.push > 0 ? 2.2 : 0.75;
    if (sp > max) { p.vx *= max / sp; p.vy *= max / sp; }
    // choques con los demás (yo solo me muevo a mí)
    if (ext && ext.all && p.inv <= 0) {
      for (const o of ext.all) {
        if (!o || o === p || o.id === p.id || o.out) continue;
        const of = o.fall > 0 || (o.e && o.e.f !== undefined);
        if (of || o.inv > 0) continue;
        const dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy);
        if (d >= PR * 2 || d < 1e-4) continue;
        const nx = dx / d, ny = dy / d;
        const theyPush = o.push > 0 || (o.e && o.e.p);
        const k = theyPush ? 2.3 : 0.9;
        p.vx += nx * k * (theyPush ? 1 : DT * 30);
        p.vy += ny * k * (theyPush ? 1 : DT * 30);
        const over = PR * 2 - d;
        p.x += nx * over * 0.5; p.y += ny * over * 0.5;
        if (theyPush && !p._hitBy) { p._hitBy = 0.3; ev = ev || 'hit'; }
      }
    }
    if (p._hitBy > 0) p._hitBy -= DT;
    p.x += p.vx * DT;
    p.y += p.vy * DT;
    if (Math.hypot(p.x, p.y) > radiusAt(t) + PR * 0.2 && p.inv <= 0) {
      p.h--;
      p.fall = 0.8;
      return 'fall';
    }
    if (p.inv > 0) {
      const r = Math.hypot(p.x, p.y), m = radiusAt(t) - PR;
      if (r > m) { p.x *= m / r; p.y *= m / r; }
    }
    return ev;
  },

  brain(seed, idx) {
    const r = mulberry32((seed ^ (0x2545f491 * (idx + 1))) >>> 0);
    const aggro = 0.4 + r() * 0.4;
    let wob = r() * TAU;
    return (p, t, ext) => {
      wob += DT * (0.8 + r() * 0.4);
      const R = radiusAt(t);
      const pr = Math.hypot(p.x, p.y);
      // demasiado cerca del borde: volver al centro
      if (pr > R - 0.2) return { x: -p.x / pr, y: -p.y / pr };
      let best = null, bd = 9;
      if (ext && ext.all) {
        for (const o of ext.all) {
          if (!o || o.id === p.id || o.out) continue;
          const d = Math.hypot(o.x - p.x, o.y - p.y);
          if (d < bd) { bd = d; best = o; }
        }
      }
      if (!best) return { x: Math.cos(wob) * 0.4, y: Math.sin(wob) * 0.4 };
      const dx = best.x - p.x, dy = best.y - p.y, l = Math.hypot(dx, dy) || 1;
      if (l < 0.32 && p.pcd <= 0 && r() < aggro * 0.08) p.act = true;
      // acercarse en ángulo para empujar hacia afuera
      return { x: (dx / l) * 0.8 * aggro + Math.cos(wob) * 0.25, y: (dy / l) * 0.8 * aggro + Math.sin(wob) * 0.25 };
    };
  },

  result: (p) => ({ h: Math.max(0, p.h), t: p.out ? Math.round(p.tOut * 1000) : TOTAL * 1000 }),
  pack: (p) => {
    const o = {};
    if (p.push > 0) o.p = 1;
    if (p.fall > 0) o.f = Math.round(p.scale * 100) / 100;
    return o;
  },

  draw(g, v, t, W, ents, meId) {
    const { size, c, R } = v;
    const sky = g.createLinearGradient(0, 0, 0, size);
    sky.addColorStop(0, '#4cc9f0'); sky.addColorStop(1, '#3a0ca3');
    g.fillStyle = sky; g.fillRect(0, 0, size, size);
    // nubes
    g.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 5; i++) {
      const x = ((i * 97 + t * 12) % (size + 80)) - 40, y = (i * 61) % size;
      g.beginPath(); g.ellipse(x, y, 40, 14, 0, 0, TAU); g.fill();
    }
    const pr = radiusAt(t) * R;
    g.beginPath(); g.arc(c, c + 10, pr, 0, TAU); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill();
    const sg = g.createRadialGradient(c, c - pr * 0.3, pr * 0.1, c, c, pr);
    sg.addColorStop(0, '#ffe5ec'); sg.addColorStop(1, '#ff8fab');
    g.beginPath(); g.arc(c, c, pr, 0, TAU); g.fillStyle = sg; g.fill();
    g.lineWidth = 6; g.strokeStyle = '#fb6f92'; g.stroke();
    g.beginPath(); g.arc(c, c, pr * 0.5, 0, TAU); g.lineWidth = 2; g.strokeStyle = 'rgba(251,111,146,0.5)'; g.stroke();
    for (const e of ents) {
      if (e.out) continue;
      const scale = e.e && typeof e.e.f === 'number' ? e.e.f : (e.scale ?? 1);
      const pushing = e.push > 0 || (e.e && e.e.p);
      if (pushing) {
        g.beginPath(); g.arc(v.X(e.x), v.Y(e.y), PR * R * 1.6, 0, TAU);
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.fill();
      }
      drawPlayer(g, v, { ...e, pr: PR, scale }, meId, t);
    }
  },
};

export default {
  id: 'sumo',
  name: 'Empujones',
  emoji: '🥊',
  realtime: true,
  desc: '¡Todos en una plataforma que se encoge! Choca con los demás y usa EMPUJA para tirarlos al vacío. Si caes, pierdes una vida. 3 vidas.',
  dur: () => TOTAL * 1000,
  mount: (el, ctx) => mountRT(el, ctx, { ...G, endWhenOneLeft: true }),
  evaluate: (v) => evalSurvival(v, TOTAL, LIVES),
  bot: (r, seed, p) => simulateBot(G, seed, Number(String(p?.id || 'bot0').slice(3)) || 0),
};
