// Utilidades compartidas: RNG con semilla, DOM, sonido y vibración.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, r = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

let ac = null;
export function beep(freq = 660, dur = 0.08, type = 'square', vol = 0.05) {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g);
    g.connect(ac.destination);
    const t = ac.currentTime;
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch { /* sin audio */ }
}

export function fanfare() {
  [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.14, 'triangle', 0.07), i * 110));
}

export function buzz(ms = 15) {
  try { navigator.vibrate && navigator.vibrate(ms); } catch { /* nada */ }
}

export function store(key, val) {
  try {
    if (val === undefined) return JSON.parse(localStorage.getItem(key));
    localStorage.setItem(key, JSON.stringify(val));
  } catch { return null; }
}

export function toast(msg, ms = 2200) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, ms);
}

export const COLORS = ['#ff4d6d', '#3a86ff', '#ffbe0b', '#06d6a0'];
export const AVATARS = ['🐸', '🐱', '🐶', '🦊', '🐼', '🐵', '🐧', '🦄', '🐯', '🐙', '🦖', '🐷'];
export const BOT_NAMES = ['Robotín', 'Chispa', 'Tuerca', 'Bip-Bop'];
export const BOT_AVATARS = ['🤖', '👾', '🛸', '🎃'];
