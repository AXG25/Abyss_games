import { beep, buzz } from '../util.js';

const DUR = 8000;

export default {
  id: 'tap',
  name: 'Machaca el botón',
  emoji: '👊',
  desc: '¡Toca el botón lo más rápido que puedas durante 8 segundos!',
  dur: () => DUR,

  mount(el, ctx) {
    let n = 0;
    let over = false;
    const t0 = performance.now();
    el.innerHTML = `
      <div class="g-tap">
        <div class="g-bar"><i></i></div>
        <div class="g-big-num">0</div>
        <button class="g-tapbtn" style="--c:${ctx.color}">¡TOCA!</button>
      </div>`;
    const num = el.querySelector('.g-big-num');
    const bar = el.querySelector('.g-bar i');
    const btn = el.querySelector('.g-tapbtn');
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (over) return;
      n++;
      num.textContent = n;
      ctx.submit({ n });
      beep(300 + Math.min(n, 120) * 5, 0.03);
      btn.classList.remove('pop');
      void btn.offsetWidth;
      btn.classList.add('pop');
    });
    const iv = setInterval(() => {
      const p = (performance.now() - t0) / DUR;
      bar.style.width = Math.max(0, 100 - p * 100) + '%';
      if (p >= 1 && !over) {
        over = true;
        btn.disabled = true;
        btn.textContent = '¡Tiempo!';
        buzz(80);
        clearInterval(iv);
      }
    }, 50);
    return () => clearInterval(iv);
  },

  evaluate(v) {
    if (!v || typeof v.n !== 'number') return null;
    const n = Math.max(0, Math.min(200, Math.floor(v.n)));
    return { score: n, label: `${n} toques` };
  },

  bot: (r) => ({ n: Math.floor(25 + r() * 35) }),
};
