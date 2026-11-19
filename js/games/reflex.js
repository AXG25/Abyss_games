import { mulberry32, beep, buzz } from '../util.js';

const waitFor = (seed) => 1500 + mulberry32(seed)() * 3500;

export default {
  id: 'reflex',
  name: 'Reflejos de vaquero',
  emoji: '🤠',
  desc: 'Espera a que la pantalla se ponga VERDE y toca lo más rápido posible. ¡Si tocas antes, pierdes!',
  dur: (seed) => waitFor(seed) + 2500,

  mount(el, ctx) {
    const wait = waitFor(ctx.seed);
    const t0 = performance.now();
    let goAt = 0;
    let done = false;
    el.innerHTML = `<button class="g-reflex wait"><span class="g-reflex-txt">Espera…</span><small>no toques todavía</small></button>`;
    const pad = el.querySelector('.g-reflex');
    const txt = el.querySelector('.g-reflex-txt');
    const sub = el.querySelector('small');

    const to = setTimeout(() => {
      if (done) return;
      goAt = performance.now();
      pad.className = 'g-reflex go';
      txt.textContent = '¡YA!';
      sub.textContent = '¡toca!';
      beep(880, 0.15, 'square', 0.08);
    }, wait);

    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (done) return;
      done = true;
      clearTimeout(to);
      if (!goAt) {
        pad.className = 'g-reflex fail';
        txt.textContent = '¡Muy pronto!';
        sub.textContent = 'falta 🚫';
        ctx.submit({ f: 1 });
        beep(140, 0.3, 'sawtooth');
        buzz(200);
      } else {
        const ms = Math.round(performance.now() - goAt);
        pad.className = 'g-reflex done';
        txt.textContent = `${ms} ms`;
        sub.textContent = ms < 300 ? '¡rapidísimo!' : ms < 450 ? '¡bien!' : 'uff…';
        ctx.submit({ ms });
        buzz(30);
      }
    });
    void t0;
    return () => clearTimeout(to);
  },

  evaluate(v) {
    if (!v) return null;
    if (v.f) return { score: null, label: 'Falta 🚫' };
    if (typeof v.ms !== 'number' || v.ms < 80) return { score: null, label: 'Falta 🚫' };
    return { score: -v.ms, label: `${Math.round(v.ms)} ms` };
  },

  bot: (r) => (r() < 0.1 ? { f: 1 } : { ms: Math.round(230 + r() * 260) }),
};
