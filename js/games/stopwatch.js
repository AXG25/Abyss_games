import { beep, buzz } from '../util.js';

const TARGET = 5000;
const VISIBLE = 1500;
const MAX = 10000;

export default {
  id: 'stopwatch',
  name: 'Para en 5.00',
  desc: 'El cronómetro arranca y se esconde. Toca PARAR cuando creas que van exactamente 5.00 segundos.',
  dur: () => MAX,

  mount(el, ctx) {
    el.innerHTML = `
      <div class="g-stop">
        <div class="g-stop-goal">Meta: <b>5.00 s</b></div>
        <div class="g-stop-clock">0.00</div>
        <button class="g-stop-btn" style="--c:${ctx.color}">PARAR</button>
      </div>`;
    const clock = el.querySelector('.g-stop-clock');
    const btn = el.querySelector('.g-stop-btn');
    const t0 = performance.now();
    let done = false;
    let raf = 0;
    const loop = () => {
      const ms = performance.now() - t0;
      if (ms < VISIBLE) clock.textContent = (ms / 1000).toFixed(2);
      else if (!clock.classList.contains('hide')) { clock.classList.add('hide'); clock.textContent = '?.??'; }
      if (ms >= MAX && !done) { done = true; btn.disabled = true; btn.textContent = 'Tiempo'; return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      const ms = Math.round(performance.now() - t0);
      clock.classList.remove('hide');
      clock.textContent = (ms / 1000).toFixed(2);
      const d = Math.abs(ms - TARGET);
      clock.classList.add(d < 150 ? 'great' : d < 500 ? 'ok' : 'meh');
      btn.disabled = true;
      btn.textContent = d < 150 ? '¡Clavado!' : `${d > 0 && ms < TARGET ? '-' : '+'}${(d / 1000).toFixed(2)} s`;
      ctx.submit({ ms });
      beep(d < 150 ? 990 : 520, 0.15, 'triangle');
      buzz(40);
    });
    return () => cancelAnimationFrame(raf);
  },

  evaluate(v) {
    if (!v || typeof v.ms !== 'number') return null;
    const d = Math.abs(v.ms - TARGET);
    return { score: -d, label: `${(v.ms / 1000).toFixed(2)} s` };
  },

  bot: (r) => ({ ms: Math.round(TARGET + (r() + r() + r() - 1.5) * 900) }),
};
