import { mulberry32, shuffle, beep, buzz } from '../util.js';
import { icon } from '../icons.js';

const VIEW = 4500;
const ANSWER = 6000;
// figura objetivo y figuras para distraer (iconos propios)
const SETS = [
  ['mushroom', ['flower', 'apple', 'leaf', 'heart']],
  ['star', ['moon', 'cloud', 'sparkle', 'diamond']],
  ['fish', ['drop', 'leaf', 'cloud', 'diamond']],
  ['apple', ['heart', 'flower', 'mushroom', 'coin']],
  ['ghost', ['cloud', 'moon', 'bomb', 'drop']],
];

// Genera el tablero a partir de la semilla (igual en todos los teléfonos).
function board(seed) {
  const r = mulberry32(seed);
  const [target, others] = SETS[Math.floor(r() * SETS.length)];
  const n = 6 + Math.floor(r() * 9); // 6..14
  const total = 26;
  const items = [];
  for (let i = 0; i < total; i++) items.push(i < n ? target : others[Math.floor(r() * others.length)]);
  const placed = shuffle(items, r).map((e) => ({
    e, x: 4 + r() * 84, y: 4 + r() * 84, rot: Math.floor(r() * 50 - 25), s: 0.85 + r() * 0.5,
  }));
  const opts = new Set([n]);
  const deltas = shuffle([-2, -1, 1, 2, 3, -3], r);
  for (const d of deltas) { if (opts.size >= 4) break; if (n + d > 0) opts.add(n + d); }
  return { target, n, placed, opts: shuffle([...opts], r) };
}

export default {
  id: 'count',
  name: 'Cuenta rápida',
  desc: 'Mira el tablero y cuenta el emoji objetivo. Luego elige la respuesta correcta lo más rápido posible.',
  dur: () => VIEW + ANSWER,

  mount(el, ctx) {
    const b = board(ctx.seed);
    el.innerHTML = `
      <div class="g-count">
        <div class="g-bar"><i></i></div>
        <div class="g-count-q">¿Cuántos <span>${icon(b.target)}</span> hay?</div>
        <div class="g-field">${b.placed.map((p) => `<span style="left:${p.x}%;top:${p.y}%;transform:rotate(${p.rot}deg) scale(${p.s})">${icon(p.e)}</span>`).join('')}</div>
        <div class="g-opts" hidden>${b.opts.map((o) => `<button data-v="${o}">${o}</button>`).join('')}</div>
      </div>`;
    const field = el.querySelector('.g-field');
    const optsEl = el.querySelector('.g-opts');
    const bar = el.querySelector('.g-bar i');
    const t0 = performance.now();
    let qAt = 0;
    let done = false;

    const to = setTimeout(() => {
      field.classList.add('gone');
      optsEl.hidden = false;
      qAt = performance.now();
      beep(700, 0.1, 'triangle');
    }, VIEW);

    optsEl.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest('button');
      if (!btn || done || !qAt) return;
      e.preventDefault();
      done = true;
      const a = Number(btn.dataset.v);
      const t = Math.round(performance.now() - qAt);
      ctx.submit({ a, t });
      const ok = a === b.n;
      btn.classList.add(ok ? 'ok' : 'bad');
      if (!ok) optsEl.querySelector(`[data-v="${b.n}"]`)?.classList.add('ok');
      beep(ok ? 990 : 160, 0.15, ok ? 'triangle' : 'sawtooth');
      buzz(ok ? 20 : 150);
      optsEl.classList.add('locked');
    });

    const iv = setInterval(() => {
      const el2 = performance.now() - t0;
      const p = el2 < VIEW ? 1 - el2 / VIEW : 1 - (el2 - VIEW) / ANSWER;
      bar.style.width = Math.max(0, p * 100) + '%';
    }, 60);
    return () => { clearTimeout(to); clearInterval(iv); };
  },

  evaluate(v, seed) {
    if (!v || typeof v.a !== 'number') return null;
    const n = board(seed).n;
    const t = Math.max(0, Math.min(ANSWER, Number(v.t) || ANSWER));
    if (v.a === n) return { score: 100000 - t, label: `{check} ${(t / 1000).toFixed(1)} s` };
    return { score: -Math.abs(v.a - n) * 10000 - t, label: `{cross} dijo ${v.a}` };
  },

  bot(r, seed) {
    const n = board(seed).n;
    const ok = r() < 0.7;
    return { a: ok ? n : n + (r() < 0.5 ? -1 : 1), t: Math.round(1300 + r() * 2500) };
  },
};
