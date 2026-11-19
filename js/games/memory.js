import { mulberry32, beep, buzz } from '../util.js';

const LEN = 6;
const STEP = 650;
const LEAD = 700;
const SHOW = LEAD + LEN * STEP;
const INPUT = 9000;
const PADS = [
  { c: '#ff4d6d', f: 330 },
  { c: '#3a86ff', f: 392 },
  { c: '#ffbe0b', f: 494 },
  { c: '#06d6a0', f: 587 },
];

const seqFor = (seed) => {
  const r = mulberry32(seed);
  return Array.from({ length: LEN }, () => Math.floor(r() * 4));
};

export default {
  id: 'memory',
  name: 'Simón dice',
  desc: `Memoriza la secuencia de ${LEN} colores y repítela tocando los botones. ¡Gana quien acierte más y más rápido!`,
  dur: () => SHOW + INPUT,

  mount(el, ctx) {
    const seq = seqFor(ctx.seed);
    el.innerHTML = `
      <div class="g-mem">
        <div class="g-mem-msg">Mira bien…</div>
        <div class="g-mem-pads">${PADS.map((p, i) => `<button data-i="${i}" style="--c:${p.c}"></button>`).join('')}</div>
        <div class="g-mem-dots">${seq.map(() => '<i></i>').join('')}</div>
      </div>`;
    const msg = el.querySelector('.g-mem-msg');
    const pads = [...el.querySelectorAll('.g-mem-pads button')];
    const dots = [...el.querySelectorAll('.g-mem-dots i')];
    const timers = [];
    let inputAt = 0;
    let pos = 0;
    let done = false;

    const flash = (i, ms = STEP - 180) => {
      pads[i].classList.add('lit');
      beep(PADS[i].f, ms / 1000, 'sine', 0.08);
      timers.push(setTimeout(() => pads[i].classList.remove('lit'), ms));
    };
    seq.forEach((i, k) => timers.push(setTimeout(() => flash(i), LEAD + k * STEP)));
    timers.push(setTimeout(() => {
      inputAt = performance.now();
      msg.textContent = '¡Tu turno!';
      el.querySelector('.g-mem').classList.add('input');
    }, SHOW));
    timers.push(setTimeout(() => {
      if (!done) { done = true; msg.textContent = '¡Tiempo!'; }
    }, SHOW + INPUT));

    el.querySelector('.g-mem-pads').addEventListener('pointerdown', (e) => {
      const btn = e.target.closest('button');
      if (!btn || !inputAt || done) return;
      e.preventDefault();
      const i = Number(btn.dataset.i);
      const t = Math.round(performance.now() - inputAt);
      if (i === seq[pos]) {
        flash(i, 200);
        dots[pos].className = 'ok';
        pos++;
        ctx.submit({ ok: pos, t });
        if (pos === LEN) { done = true; msg.textContent = '¡Perfecto!'; buzz(40); }
      } else {
        done = true;
        dots[pos].className = 'bad';
        msg.textContent = `Fallaste en el ${pos + 1}`;
        beep(140, 0.3, 'sawtooth');
        buzz(200);
        ctx.submit({ ok: pos, t });
      }
    });
    return () => timers.forEach(clearTimeout);
  },

  evaluate(v) {
    if (!v || typeof v.ok !== 'number') return null;
    const ok = Math.max(0, Math.min(LEN, Math.floor(v.ok)));
    const t = Math.max(0, Math.min(INPUT, Number(v.t) || INPUT));
    return { score: ok * 100000 - t, label: `${ok}/${LEN}${ok === LEN ? ` · ${(t / 1000).toFixed(1)} s` : ''}` };
  },

  bot: (r) => {
    const ok = r() < 0.5 ? LEN : Math.floor(2 + r() * 4);
    return { ok, t: Math.round(2500 + r() * 3500) };
  },
};
