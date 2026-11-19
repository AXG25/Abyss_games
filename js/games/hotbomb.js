// 💥 Bomba caliente — tiempo real. Alguien tiene una bomba con mecha: tócale a
// otro jugador para pasársela. Cuando la mecha se acaba, ¡BUM!: quien la tenga
// queda eliminado. Gana el último en pie.
//
// El anfitrión es el árbitro: decide quién tiene la bomba y quién explota
// (lo publica en `hs`); cada teléfono solo mueve a su jugador.
import { mulberry32 } from '../util.js';
import { DT, TAU, mountRT, simulateBot, newPlayerBase, moveBasic, clampBox, drawPlayer } from '../rt.js';

const TOTAL = 60;
const PR = 0.065;
const HALF = 0.9;

const G = {
  TOTAL, LIVES: 1, lives: 1,
  action: 'ACELERA',

  world(seed) {
    const r = mulberry32(seed ^ 0xb055);
    return { fuses: Array.from({ length: 6 }, () => 7 + r() * 5), r0: r() };
  },

  spawn(i) {
    const a = -Math.PI / 2 + (i * TAU) / 4 + Math.PI / 4;
    return newPlayerBase(Math.cos(a) * 0.6, Math.sin(a) * 0.6, 1);
  },

  // ---- árbitro (solo el anfitrión)
  hostInit(W, players) {
    return { h: players[Math.floor(W.r0 * players.length)]?.id || null, fx: W.fuses[0] + 1.5, n: 0, outs: {}, lt: 0, st: 1.5 };
  },
  hostTick(hs, t, W, all) {
    if (hs.done) return;
    const alive = all.filter((e) => e && !e.out && !hs.outs[e.id]);
    if (t < hs.st) return; // pausa entre rondas
    const holder = alive.find((e) => e.id === hs.h);
    if (!holder) {
      // el que la tenía ya no está: se la damos al más cercano al centro
      const pick = alive.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0];
      hs.h = pick ? pick.id : null;
      hs.lt = t;
      return;
    }
    if (t >= hs.fx) {
      hs.outs[holder.id] = Math.round(t * 1000);
      hs.n++;
      const rest = alive.filter((e) => e.id !== holder.id);
      if (rest.length <= 1) { hs.done = 1; hs.h = null; return; }
      const far = rest.sort((a, b) => Math.hypot(b.x - holder.x, b.y - holder.y) - Math.hypot(a.x - holder.x, a.y - holder.y))[0];
      hs.h = far.id;
      hs.st = t + 1.5;
      hs.fx = t + 1.5 + W.fuses[hs.n % W.fuses.length] * Math.max(0.6, 1 - hs.n * 0.12);
      hs.lt = t;
      return;
    }
    if (t - hs.lt < 0.7) return; // no se puede devolver al instante
    for (const o of alive) {
      if (o.id === holder.id) continue;
      if (Math.hypot(o.x - holder.x, o.y - holder.y) < PR * 2.1) {
        hs.h = o.id;
        hs.lt = t;
        hs.from = holder.id;
        break;
      }
    }
  },
  // Aplica lo que decidió el árbitro a un jugador local.
  applyHost(p, hs, t) {
    if (!p.out && hs.outs && hs.outs[p.id] !== undefined) {
      p.out = true;
      p.tOut = hs.outs[p.id] / 1000;
      return 'out';
    }
    return null;
  },

  step(p, inp, t, W, ext) {
    if (p.out) return null;
    p._ev = null;
    const hs = ext && ext.hs;
    const has = hs && hs.h === p.id;
    moveBasic(p, inp, has ? 0.72 : 0.64);
    clampBox(p, HALF - PR);
    if (has && !p._had) { p._had = true; return 'got'; }
    if (!has) p._had = false;
    return p._ev;
  },

  brain(seed, idx) {
    const r = mulberry32((seed ^ (0x68e31da4 * (idx + 1))) >>> 0);
    const smart = 0.6 + r() * 0.3;
    let wob = r() * TAU;
    return (p, t, ext) => {
      wob += DT * 1.3;
      const hs = ext && ext.hs;
      if (!hs || !ext.all) return { x: Math.cos(wob) * 0.5, y: Math.sin(wob) * 0.5 };
      const alive = ext.all.filter((e) => e && !e.out && e.id !== p.id && !(hs.outs && hs.outs[e.id] !== undefined));
      if (!alive.length) return { x: 0, y: 0 };
      if (hs.h === p.id) {
        // perseguir al más cercano
        const tg = alive.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
        const dx = tg.x - p.x, dy = tg.y - p.y, l = Math.hypot(dx, dy) || 1;
        if (l < 0.35 && r() < 0.03) p.act = true;
        return { x: dx / l, y: dy / l };
      }
      const hd = alive.find((e) => e.id === hs.h);
      if (!hd) return { x: Math.cos(wob) * 0.3, y: Math.sin(wob) * 0.3 };
      // huir del que tiene la bomba, sin quedar atrapado en una esquina
      let dx = p.x - hd.x, dy = p.y - hd.y;
      const l = Math.hypot(dx, dy) || 1;
      dx = dx / l - p.x * 0.9 + Math.cos(wob) * 0.4;
      dy = dy / l - p.y * 0.9 + Math.sin(wob) * 0.4;
      const m = Math.hypot(dx, dy) || 1;
      if (l < 0.25 && r() < smart * 0.05) p.act = true;
      return { x: (dx / m) * smart, y: (dy / m) * smart };
    };
  },

  result: (p) => ({ h: p.out ? 0 : 1, t: p.out ? Math.round(p.tOut * 1000) : TOTAL * 1000 }),
  hud: (p) => (p.out ? '👻' : '🙂'),
  hudRight: (ents) => `🧍 ${ents.filter((e) => !e.out).length}`,

  draw(g, v, t, W, ents, meId, ext) {
    const { size } = v;
    const hs = (ext && ext.hs) || {};
    g.fillStyle = '#3c1642'; g.fillRect(0, 0, size, size);
    const x0 = v.X(-HALF), w = HALF * 2 * v.R;
    // piso de baldosas tipo ajedrez
    const n = 8;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.fillStyle = (i + j) % 2 ? '#ffd6a5' : '#ffadad';
      g.fillRect(x0 + (i * w) / n, x0 + (j * w) / n, w / n + 1, w / n + 1);
    }
    g.lineWidth = 6; g.strokeStyle = '#9d4edd'; g.strokeRect(x0, x0, w, w);
    const rem = hs.fx !== undefined ? Math.max(0, hs.fx - (ext.t || t)) : 0;
    for (const e of ents) {
      const out = e.out || (hs.outs && hs.outs[e.id] !== undefined);
      drawPlayer(g, v, { ...e, out, pr: PR }, meId, t);
      if (!out && hs.h === e.id && !hs.done) {
        const px = v.X(e.x), py = v.Y(e.y) - PR * v.R * 2.1;
        const wob = Math.sin(t * (6 + (12 - Math.min(12, rem)) * 2)) * 4;
        g.font = `${Math.round(PR * v.R * 1.9)}px system-ui, 'Apple Color Emoji'`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('💣', px + wob, py);
        // chispa de la mecha
        g.beginPath(); g.arc(px + wob + PR * v.R * 0.55, py - PR * v.R * 0.7, 3 + Math.random() * 3, 0, TAU);
        g.fillStyle = rem < 3 ? '#ff006e' : '#ffbe0b'; g.fill();
      }
    }
    // explosión reciente
    if (hs.outs) {
      for (const [id, ms] of Object.entries(hs.outs)) {
        const dt = (ext.t || t) - ms / 1000;
        if (dt < 0 || dt > 0.6) continue;
        const e = ents.find((x) => x.id === id);
        if (!e) continue;
        const rr = PR * v.R * (2 + dt * 8);
        const gr = g.createRadialGradient(v.X(e.x), v.Y(e.y), 0, v.X(e.x), v.Y(e.y), rr);
        gr.addColorStop(0, `rgba(255,255,200,${1 - dt / 0.6})`); gr.addColorStop(1, 'rgba(255,0,110,0)');
        g.beginPath(); g.arc(v.X(e.x), v.Y(e.y), rr, 0, TAU); g.fillStyle = gr; g.fill();
      }
    }
    // mecha
    if (hs.fx !== undefined && !hs.done) {
      const pausa = (ext.t || t) < hs.st;
      g.font = `bold ${Math.round(size * 0.07)}px system-ui`;
      g.textAlign = 'center'; g.textBaseline = 'top';
      g.fillStyle = rem < 3 ? '#ff006e' : '#fff';
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 4;
      const txt = pausa ? '¡Prepárate!' : `💣 ${rem.toFixed(1)}`;
      g.strokeText(txt, size / 2, 6); g.fillText(txt, size / 2, 6);
    }
  },
};

const GM = { ...G, endWhenOneLeft: true };

export default {
  id: 'hotbomb',
  name: 'Bomba caliente',
  emoji: '💥',
  realtime: true,
  desc: '¡Alguien tiene una bomba encendida! Si la tienes, tócale a otro para pasársela. Cuando la mecha se acaba, quien la tenga queda fuera. Gana el último en pie.',
  dur: () => TOTAL * 1000,
  mount: (el, ctx) => mountRT(el, ctx, GM),
  evaluate(v) {
    if (!v || typeof v.t !== 'number') return null;
    const t = Math.max(0, Math.min(TOTAL * 1000, v.t));
    if (v.h > 0) return { score: 1e6, label: '🏆 ¡último en pie!' };
    return { score: t, label: `explotó a los ${(t / 1000).toFixed(1)} s` };
  },
  bot: (r, seed, p) => simulateBot(G, seed, Number(String(p?.id || 'bot0').slice(3)) || 0),
};
