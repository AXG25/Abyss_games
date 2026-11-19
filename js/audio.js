// Motor de sonido: efectos sintetizados con WebAudio (sin archivos) y música
// de fondo generada por juego. Todo pasa por un volumen maestro que respeta
// el botón de silencio.

let ac = null;
let master = null;
let sfxBus = null;
let musicBus = null;
let noiseBuf = null;

export function isMuted() {
  try { return localStorage.getItem('pp_mute') === '1'; } catch { return false; }
}
export function setMuted(m) {
  try { localStorage.setItem('pp_mute', m ? '1' : '0'); } catch { /* nada */ }
  if (master) master.gain.setTargetAtTime(m ? 0 : 1, ac.currentTime, 0.02);
}

export function ctx() {
  if (!ac) {
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      master.gain.value = isMuted() ? 0 : 1;
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      master.connect(comp);
      comp.connect(ac.destination);
      sfxBus = ac.createGain();
      sfxBus.gain.value = 0.9;
      sfxBus.connect(master);
      musicBus = ac.createGain();
      musicBus.gain.value = 0.32;
      musicBus.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch { ac = null; }
  }
  if (ac && ac.state === 'suspended') ac.resume().catch(() => {});
  return ac;
}
export const bus = () => (ctx() ? sfxBus : null);

// ---- piezas básicas
function env(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

function tone({ type = 'square', f0 = 440, f1 = null, dur = 0.15, vol = 0.08, at = 0, attack = 0.005, out = null, vib = 0 }) {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  if (vib) {
    const l = c.createOscillator();
    const lg = c.createGain();
    l.frequency.value = 6;
    lg.gain.value = vib;
    l.connect(lg);
    lg.connect(o.frequency);
    l.start(t);
    l.stop(t + dur + 0.05);
  }
  env(g, t, attack, vol, dur);
  o.connect(g);
  g.connect(out || sfxBus);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise({ dur = 0.3, vol = 0.1, type = 'lowpass', f0 = 1000, f1 = null, q = 1, at = 0, attack = 0.005, out = null }) {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + at;
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = c.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = c.createGain();
  env(g, t, attack, vol, dur);
  s.connect(f);
  f.connect(g);
  g.connect(out || sfxBus);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}

// ---- efectos (v = volumen relativo 0..1, para sonidos lejanos o de otros)
export const sfx = {
  jump: (v = 1) => tone({ type: 'square', f0: 260, f1: 720, dur: 0.16, vol: 0.06 * v }),
  land: (v = 1) => noise({ dur: 0.08, vol: 0.05 * v, f0: 500 }),
  dash: (v = 1) => { noise({ dur: 0.28, vol: 0.12 * v, type: 'bandpass', f0: 500, f1: 3000, q: 1.5 }); tone({ type: 'sawtooth', f0: 180, f1: 420, dur: 0.18, vol: 0.03 * v }); },
  whoosh: (v = 1) => noise({ dur: 0.35, vol: 0.09 * v, type: 'bandpass', f0: 300, f1: 1400, q: 2, attack: 0.08 }),
  hit: (v = 1) => { tone({ type: 'sawtooth', f0: 320, f1: 70, dur: 0.25, vol: 0.09 * v }); noise({ dur: 0.12, vol: 0.12 * v, f0: 2500, f1: 300 }); },
  out: (v = 1) => { [392, 370, 349, 294].forEach((f, i) => tone({ type: 'sawtooth', f0: f, dur: i === 3 ? 0.7 : 0.22, vol: 0.06 * v, at: i * 0.22, vib: i === 3 ? 8 : 0 })); },
  coin: (v = 1) => { tone({ type: 'square', f0: 988, dur: 0.07, vol: 0.05 * v }); tone({ type: 'square', f0: 1319, dur: 0.2, vol: 0.05 * v, at: 0.07 }); },
  big: (v = 1) => [784, 988, 1175, 1568].forEach((f, i) => tone({ type: 'square', f0: f, dur: 0.12, vol: 0.05 * v, at: i * 0.06 })),
  fall: (v = 1) => { tone({ type: 'sine', f0: 900, f1: 120, dur: 0.9, vol: 0.08 * v }); sfx.splash(v * 0.8, 0.8); },
  splash: (v = 1, at = 0) => { noise({ dur: 0.6, vol: 0.16 * v, type: 'lowpass', f0: 4000, f1: 300, at }); noise({ dur: 0.25, vol: 0.08 * v, type: 'highpass', f0: 2500, at }); },
  boom: (v = 1) => {
    noise({ dur: 1.1, vol: 0.45 * v, type: 'lowpass', f0: 2200, f1: 60 });
    tone({ type: 'sine', f0: 110, f1: 32, dur: 0.7, vol: 0.4 * v });
    noise({ dur: 0.08, vol: 0.25 * v, type: 'highpass', f0: 3000 });
  },
  clang: (v = 1) => {
    const base = 520 + Math.random() * 260;
    [1, 2.76, 5.4, 8.9].forEach((r, i) => tone({ type: i ? 'sine' : 'triangle', f0: base * r, dur: 0.5 - i * 0.08, vol: (0.07 / (i + 1)) * v }));
    noise({ dur: 0.06, vol: 0.2 * v, type: 'highpass', f0: 4000 });
  },
  crack: (v = 1) => { for (let i = 0; i < 4; i++) noise({ dur: 0.03, vol: 0.12 * v, type: 'highpass', f0: 2000 + Math.random() * 3000, at: i * (0.02 + Math.random() * 0.04) }); },
  roar: (v = 1) => {
    tone({ type: 'sawtooth', f0: 85, f1: 55, dur: 1.4, vol: 0.14 * v, attack: 0.15, vib: 10 });
    tone({ type: 'sawtooth', f0: 128, f1: 80, dur: 1.2, vol: 0.06 * v, attack: 0.2, vib: 14 });
    noise({ dur: 1.3, vol: 0.12 * v, type: 'lowpass', f0: 700, f1: 200, attack: 0.2 });
  },
  rumble: (v = 1) => { noise({ dur: 0.9, vol: 0.18 * v, type: 'lowpass', f0: 180, attack: 0.1 }); tone({ type: 'sine', f0: 50, dur: 0.8, vol: 0.12 * v }); },
  whistle: (v = 1) => tone({ type: 'sine', f0: 1500, f1: 420, dur: 1.25, vol: 0.035 * v, vib: 20 }),
  gun: (v = 1) => {
    noise({ dur: 0.05, vol: 0.5 * v, type: 'highpass', f0: 1500 });
    noise({ dur: 0.45, vol: 0.35 * v, type: 'lowpass', f0: 3000, f1: 200 });
    tone({ type: 'sine', f0: 160, f1: 45, dur: 0.25, vol: 0.3 * v });
  },
  ricochet: (v = 1) => tone({ type: 'sine', f0: 2600, f1: 900, dur: 0.35, vol: 0.05 * v, vib: 40 }),
  click: (v = 1) => { noise({ dur: 0.02, vol: 0.15 * v, type: 'highpass', f0: 4000 }); noise({ dur: 0.03, vol: 0.12 * v, type: 'bandpass', f0: 1800, q: 4, at: 0.06 }); },
  bell: () => { [880, 1320, 1760].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 1.4 - i * 0.3, vol: 0.09 / (i + 1) })); },
  heart: (v = 1) => { tone({ type: 'sine', f0: 70, f1: 45, dur: 0.12, vol: 0.25 * v }); tone({ type: 'sine', f0: 65, f1: 40, dur: 0.14, vol: 0.18 * v, at: 0.18 }); },
  wind: (v = 1) => noise({ dur: 2.5, vol: 0.05 * v, type: 'bandpass', f0: 400, f1: 900, q: 0.8, attack: 0.8 }),
  thud: (v = 1) => { tone({ type: 'sine', f0: 120, f1: 50, dur: 0.2, vol: 0.2 * v }); noise({ dur: 0.15, vol: 0.1 * v, f0: 600 }); },
  ready: () => tone({ type: 'sine', f0: 1320, f1: 1760, dur: 0.09, vol: 0.035 }),
  tick: (v = 1) => tone({ type: 'square', f0: 1800, dur: 0.03, vol: 0.04 * v }),
  pass: (v = 1) => { tone({ type: 'square', f0: 520, f1: 1040, dur: 0.12, vol: 0.06 * v }); noise({ dur: 0.15, vol: 0.06 * v, type: 'bandpass', f0: 1500, q: 3 }); },
  fuse: (v = 1) => noise({ dur: 0.12, vol: 0.05 * v, type: 'bandpass', f0: 5000, q: 2 }),
  count: () => tone({ type: 'triangle', f0: 660, dur: 0.12, vol: 0.08 }),
  go: () => { tone({ type: 'square', f0: 880, dur: 0.3, vol: 0.07 }); tone({ type: 'square', f0: 1320, dur: 0.3, vol: 0.04 }); },
  launch: () => { noise({ dur: 0.7, vol: 0.18, type: 'bandpass', f0: 200, f1: 4000, q: 1.2, attack: 0.3 }); tone({ type: 'sawtooth', f0: 110, f1: 880, dur: 0.6, vol: 0.05, attack: 0.3 }); },
  spark: (v = 1) => noise({ dur: 0.05, vol: 0.06 * v, type: 'highpass', f0: 6000 }),
  win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone({ type: 'square', f0: f, dur: i === 5 ? 0.6 : 0.14, vol: 0.06, at: i * 0.13 })),
  warn: () => [0, 0.18, 0.36].forEach((a) => tone({ type: 'square', f0: 740, dur: 0.12, vol: 0.06, at: a })),
};

// Hablar (por ejemplo, anunciar un color). Usa la voz del celular si existe.
export function say(text) {
  if (isMuted()) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-ES';
    u.rate = 1.15;
    u.pitch = 1.1;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch { /* sin voz */ }
}

// ---- música de fondo: secuenciador simple (bajo, arpegio y batería)
const NOTES = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const freq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const STYLES = {
  // tono, escala, progresión (grados), tempo, timbre del arpegio
  pirate: { root: 'D', minor: true, prog: [0, 5, 3, 4], bpm: 132, lead: 'square', pattern: [0, 2, 4, 2, 0, 2, 4, 7] },
  volcano: { root: 'E', minor: true, prog: [0, 0, 5, 6], bpm: 150, lead: 'sawtooth', pattern: [0, 4, 7, 4, 0, 4, 7, 9] },
  disco: { root: 'F', minor: false, prog: [0, 3, 4, 3], bpm: 124, lead: 'square', pattern: [0, 4, 7, 9, 7, 4, 0, 4] },
  happy: { root: 'G', minor: false, prog: [0, 5, 3, 4], bpm: 140, lead: 'triangle', pattern: [0, 2, 4, 7, 4, 2, 0, 4] },
  battle: { root: 'A', minor: true, prog: [0, 5, 6, 4], bpm: 160, lead: 'sawtooth', pattern: [0, 7, 3, 7, 0, 7, 5, 7] },
  tense: { root: 'C', minor: true, prog: [0, 1, 0, 6], bpm: 120, lead: 'square', pattern: [0, 3, 6, 3, 0, 3, 6, 9] },
  race: { root: 'E', minor: false, prog: [0, 4, 5, 3], bpm: 172, lead: 'sawtooth', pattern: [0, 4, 7, 4, 9, 7, 4, 7] },
  ice: { root: 'B', minor: true, prog: [0, 5, 3, 6], bpm: 128, lead: 'triangle', pattern: [0, 4, 7, 11, 7, 4, 0, 7] },
};
const MAJ = [0, 2, 4, 5, 7, 9, 11];
const MIN = [0, 2, 3, 5, 7, 8, 10];

let seq = null;
export function music(style) {
  stopMusic();
  const c = ctx();
  if (!c) return;
  const S = STYLES[style] || STYLES.happy;
  const scale = S.minor ? MIN : MAJ;
  const root = 45 + NOTES[S.root];
  const st = { bpm: S.bpm, step: 0, next: c.currentTime + 0.1, alive: true };
  const deg = (d, oct = 0) => root + 12 * oct + scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
  const play = (time) => {
    const bar = Math.floor(st.step / 8) % S.prog.length;
    const ch = S.prog[bar];
    const i = st.step % 8;
    const beat = 60 / st.bpm / 2;
    // bajo
    if (i % 2 === 0) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle';
      o.frequency.value = freq(deg(ch, -1) + (i === 6 ? 12 : 0));
      g.gain.setValueAtTime(0.22, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + beat * 1.8);
      o.connect(g); g.connect(musicBus); o.start(time); o.stop(time + beat * 2);
    }
    // arpegio
    const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = S.lead;
    const n = deg(ch + Math.floor(S.pattern[i] * 0.6), 1);
    o.frequency.value = freq(n);
    f.type = 'lowpass';
    f.frequency.value = 2400;
    g.gain.setValueAtTime(0.06, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + beat * 0.9);
    o.connect(f); f.connect(g); g.connect(musicBus); o.start(time); o.stop(time + beat);
    // batería: bombo en 0 y 4, caja en 2 y 6, platillo en todos
    const drum = (type, vol, dur, fq) => {
      const s = c.createBufferSource(), fl = c.createBiquadFilter(), gg = c.createGain();
      s.buffer = noiseBuf;
      fl.type = type; fl.frequency.value = fq;
      gg.gain.setValueAtTime(vol, time);
      gg.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      s.connect(fl); fl.connect(gg); gg.connect(musicBus);
      s.start(time, Math.random()); s.stop(time + dur + 0.02);
    };
    if (i === 0 || i === 4) {
      const k = c.createOscillator(), kg = c.createGain();
      k.frequency.setValueAtTime(140, time);
      k.frequency.exponentialRampToValueAtTime(40, time + 0.12);
      kg.gain.setValueAtTime(0.5, time);
      kg.gain.exponentialRampToValueAtTime(0.0001, time + 0.15);
      k.connect(kg); kg.connect(musicBus); k.start(time); k.stop(time + 0.16);
    }
    if (i === 2 || i === 6) drum('bandpass', 0.22, 0.12, 1800);
    drum('highpass', 0.06, 0.03, 7000);
  };
  const tick = () => {
    if (!st.alive) return;
    while (st.next < c.currentTime + 0.12) {
      play(st.next);
      st.next += 60 / st.bpm / 2;
      st.step++;
    }
  };
  st.iv = setInterval(tick, 25);
  seq = st;
}
export function musicTempo(mult) {
  if (!seq) return;
  seq.base = seq.base || seq.bpm;
  seq.bpm = Math.min(220, seq.base * mult);
}
export function stopMusic() {
  if (!seq) return;
  seq.alive = false;
  clearInterval(seq.iv);
  seq = null;
}
