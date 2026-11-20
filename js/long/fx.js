// Efectos comunes de los juegos largos: piezas que vuelan de un lugar a otro de la
// pantalla, avisos grandes y pequeños, globitos "+N" y la fila de rivales con las
// flechas del sentido del turno. Lo usan cardgame-ui.js (Ocho loco, Caos) y el Dominó.
import { avatarSVG, validAvatar, icon } from '../icons.js';
import { esc } from '../util.js';

export const ARROW_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h14M12 5l7 7-7 7"/></svg>';
export const EASE = 'cubic-bezier(.2,.7,.3,1)';
export const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height });
export const rectOf = (x) => (x ? center(x.getBoundingClientRect()) : null);
export const restartClass = (x, cls) => { x.classList.remove(cls); void x.offsetWidth; x.classList.add(cls); };

//   flyEl: capa fija (.oc-fly) donde vuelan las piezas · later(fn, ms): setTimeout que se cancela al salir
export function makeFx(flyEl, later) {
  // pieza (html) que vuela de un punto de la pantalla a otro con un pequeño arco
  function fly(from, to, { html, w = 64, h = 90, s0 = 1, s1 = 1, r1 = 0, delay = 0, dur = 420, done = null } = {}) {
    if (!from || !to) { if (done) done(); return; }
    const c = document.createElement('div');
    c.className = 'oc-flyc';
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    c.innerHTML = html;
    c.style.left = `${from.x - w / 2}px`;
    c.style.top = `${from.y - h / 2}px`;
    flyEl.appendChild(c);
    const rot = (Math.random() * 2 - 1) * 24;
    const a = c.animate([
      { transform: `translate(0,0) scale(${s0}) rotate(0deg)` },
      { transform: `translate(${(to.x - from.x) / 2}px, ${(to.y - from.y) / 2 - 30}px) scale(${((s0 + s1) / 2) * 1.08}) rotate(${(rot + r1) / 2}deg)`, offset: 0.5 },
      { transform: `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(${s1}) rotate(${r1}deg)` },
    ], { duration: dur, delay, easing: EASE, fill: 'both' });
    a.onfinish = () => { c.remove(); if (done) later(done, 0); };
  }
  // un elemento que ya está en su sitio "llega" desde otro punto (FLIP)
  function arrive(elx, from, { s0 = 1, delay = 0, dur = 420, rot = -10 } = {}) {
    if (!elx || !from) return;
    const to = center(elx.getBoundingClientRect());
    const end = getComputedStyle(elx).transform;
    elx.animate([
      { transform: `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${s0}) rotate(${rot}deg)`, opacity: 0.7 },
      { transform: end === 'none' ? 'none' : end, opacity: 1 },
    ], { duration: dur, delay, easing: EASE, fill: 'backwards' });
  }
  // globito "+N" sobre una tarjeta
  function bubble(host, text) {
    if (!host) return;
    const b = document.createElement('span');
    b.className = 'oc-bubble';
    b.textContent = text;
    host.appendChild(b);
    later(() => b.remove(), 1300);
  }
  // aviso grande (uno a la vez por contenedor)
  function splash(host, { who = '', art = '', title = '', sub = '', color = '#fff', cls = '' }) {
    if (host._splash) host._splash.remove();
    const s = document.createElement('div');
    s.className = `oc-splash ${cls}`;
    s.style.setProperty('--c', color);
    s.innerHTML = `${who ? `<small class="who">${who}</small>` : ''}<div class="oc-sp-art">${art}</div><b class="t">${title}</b>${sub ? `<small>${sub}</small>` : ''}`;
    host.appendChild(s);
    host._splash = s;
    later(() => { s.remove(); if (host._splash === s) host._splash = null; }, 1750);
  }
  // aviso pequeño (máximo 2 a la vez)
  function toast(host, html, color, cls = '') {
    const t = document.createElement('div');
    t.className = `oc-toast ${cls}`;
    t.style.setProperty('--c', color || '#fff');
    t.innerHTML = html;
    host.appendChild(t);
    while (host.children.length > 2) host.firstChild.remove();
    later(() => t.remove(), 2300);
  }
  return { fly, arrive, bubble, splash, toast };
}

// Fila de rivales en orden de turno (empezando por el que va después de mí) con
// flechas: de mí (abajo) al primero, entre ellos y del último de vuelta a mí; al
// revés si el sentido cambió. La flecha que llega a quien juega se ilumina con su
// color (y salta si el turno acaba de llegarle: go) y "Sigue" marca al siguiente.
//   opp(id) → { name, a (avatar), b (bot), off, n (piezas), what ('carta'/'ficha'), extra (html), backsCls, wins }
export function oppRowHTML({ order, me, cur, next, fwd = true, go = false, colorOf, opp, timer }) {
  const mi = order.indexOf(me);
  const ids = mi >= 0 ? [...order.slice(mi + 1), ...order.slice(0, mi)] : order.slice();
  const m = ids.length;
  const into = !cur ? -1 : fwd ? (cur === me ? m : ids.indexOf(cur)) : (cur === me ? 0 : ids.indexOf(cur) + 1);
  const arrow = (k) => {
    const rot = k === 0 ? (fwd ? -90 : 90) : k === m ? (fwd ? 90 : -90) : (fwd ? 0 : 180);
    const on = k === into;
    return `<span class="oc-flow ${on ? 'on' : ''} ${on && go ? 'go' : ''}" style="--r:${rot}deg${on ? `;--c:${colorOf(cur)}` : ''}">${ARROW_SVG}</span>`;
  };
  const cards = ids.map((id) => {
    const o = opp(id);
    const n = o.n;
    return `<div class="oc-opp ${id === cur ? 'turn' : ''} ${o.off ? 'off' : ''}" data-id="${esc(id)}" style="--c:${colorOf(id)}">
        ${id === next ? '<span class="oc-nexttag">Sigue</span>' : ''}
        <span class="oc-av">${avatarSVG(validAvatar(o.a))}</span>
        <span class="oc-name">${esc(o.name)}${o.b ? ' <i>bot</i>' : ''}</span>
        <span class="oc-backs ${o.backsCls || ''}">${'<i></i>'.repeat(Math.min(n, o.maxBacks || 8))}</span>
        <span class="oc-n">${n} ${o.what || 'carta'}${n === 1 ? '' : 's'}${o.extra || ''}</span>
        ${o.wins ? `<span class="oc-w">${icon('trophy')}${o.wins}</span>` : ''}
        ${timer}
      </div>`;
  });
  let h = arrow(0);
  cards.forEach((c, k) => { h += c + (k < m - 1 ? arrow(k + 1) : ''); });
  return h + arrow(m);
}
