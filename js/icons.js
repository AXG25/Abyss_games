// Iconos y personajes propios dibujados en SVG (nada de emojis).
//   avatarSVG(id)   → cara del personaje (100×100)
//   icon(name)      → icono de interfaz (24×24)
//   gameIcon(id)    → icono de cada mini juego (64×64)
//   rich(text)      → reemplaza {nombre} por el icono en un texto ya escapado
//   avatarImage(id) → <img> en caché (para dibujar en canvas)

const O = '#1b1035'; // contorno
const SW = 3.5;

const c = (cx, cy, r, f, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${f}" ${extra}/>`;
const el = (cx, cy, rx, ry, f, rot = 0, extra = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${f}" ${rot ? `transform="rotate(${rot} ${cx} ${cy})"` : ''} ${extra}/>`;
const p = (d, f, extra = '') => `<path d="${d}" fill="${f}" ${extra}/>`;
const ol = `stroke="${O}" stroke-width="${SW}" stroke-linejoin="round"`;
const line = (d, w = 3, col = O) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

// ojos lindos: blanco, pupila y brillo
function eyes(y = 50, dx = 13, r = 8, look = 0) {
  return [-1, 1].map((s) => {
    const x = 50 + s * dx;
    return el(x, y, r, r * 1.1, '#fff', 0, ol) + c(x + look, y + 1, r * 0.55, O) + c(x + look + r * 0.22, y - r * 0.25, r * 0.2, '#fff');
  }).join('');
}
const cheeks = (y = 64, dx = 26, col = '#ff8fab') => c(50 - dx, y, 5.5, col, 'opacity=".75"') + c(50 + dx, y, 5.5, col, 'opacity=".75"');
const smile = (y = 70, w = 9) => line(`M${50 - w} ${y} Q50 ${y + w * 0.9} ${50 + w} ${y}`, 3);

const AV = {
  frog: () =>
    c(30, 30, 15, '#5bd16a', ol) + c(70, 30, 15, '#5bd16a', ol) +
    el(50, 60, 41, 31, '#5bd16a', 0, ol) +
    el(30, 29, 9, 9.5, '#fff', 0, ol) + c(31, 30, 5, O) + c(33, 27.5, 1.8, '#fff') +
    el(70, 29, 9, 9.5, '#fff', 0, ol) + c(69, 30, 5, O) + c(71, 27.5, 1.8, '#fff') +
    line('M26 64 Q50 86 74 64', 3.5) + cheeks(62, 30) + c(44, 52, 1.6, O) + c(56, 52, 1.6, O),
  cat: () =>
    p('M17 44 L22 8 L46 26 Z', '#ffb347', ol) + p('M83 44 L78 8 L54 26 Z', '#ffb347', ol) +
    p('M23 34 L25 17 L37 27 Z', '#ff8fab') + p('M77 34 L75 17 L63 27 Z', '#ff8fab') +
    c(50, 56, 36, '#ffb347', ol) + p('M38 26 L42 36 M50 22 L50 34 M62 26 L58 36', 'none', 'stroke="#e08a2a" stroke-width="4" stroke-linecap="round"') +
    el(50, 70, 16, 11, '#fff3e0') + eyes(52) + p('M45 64 L55 64 L50 70 Z', '#ff6b8b', ol.replace(SW, 2)) +
    line('M44 74 Q47 77 50 73 Q53 77 56 74', 2.5) + line('M14 66 L32 68 M14 74 L32 72 M86 66 L68 68 M86 74 L68 72', 2) + cheeks(66, 26),
  dog: () =>
    el(18, 52, 12, 25, '#8d5a3b', 18, ol) + el(82, 52, 12, 25, '#8d5a3b', -18, ol) +
    c(50, 52, 35, '#d9a066', ol) + el(36, 46, 13, 12, '#b07a48') +
    el(50, 70, 19, 14, '#fff3e0', 0, ol) + eyes(48) + el(50, 63, 7.5, 5.5, O) + c(48, 61.5, 1.6, '#fff') +
    line('M42 72 Q50 78 58 72', 2.5) + el(50, 80, 6, 7, '#ff6b8b', 0, ol.replace(SW, 2)),
  fox: () =>
    p('M14 46 L20 6 L46 28 Z', '#ff7b25', ol) + p('M86 46 L80 6 L54 28 Z', '#ff7b25', ol) +
    p('M20 6 L26 22 L16 26 Z', O) + p('M80 6 L74 22 L84 26 Z', O) +
    c(50, 54, 36, '#ff7b25', ol) +
    p('M16 58 Q50 102 84 58 Q68 70 50 66 Q32 70 16 58 Z', '#fff7ee') +
    eyes(50, 14, 7.5) + el(50, 70, 6, 4.5, O) + line('M44 77 Q50 82 56 77', 2.5),
  panda: () =>
    c(22, 26, 13, O) + c(78, 26, 13, O) +
    c(50, 55, 37, '#fff', ol) +
    el(36, 52, 11, 14, O, 30) + el(64, 52, 11, 14, O, -30) +
    c(37, 51, 6.5, '#fff') + c(38, 52, 3.5, O) + c(63, 51, 6.5, '#fff') + c(62, 52, 3.5, O) +
    el(50, 66, 6, 4.5, O) + line('M44 73 Q50 78 56 73', 2.5) + cheeks(68, 28),
  monkey: () =>
    c(14, 54, 13, '#8d6e63', ol) + c(86, 54, 13, '#8d6e63', ol) + c(14, 54, 7.5, '#e7c8a0') + c(86, 54, 7.5, '#e7c8a0') +
    c(50, 52, 35, '#8d6e63', ol) +
    c(40, 52, 15, '#e7c8a0') + c(60, 52, 15, '#e7c8a0') + el(50, 68, 22, 15, '#e7c8a0') +
    eyes(50, 10, 6.5) + c(46, 64, 1.8, O) + c(54, 64, 1.8, O) + line('M40 71 Q50 80 60 71', 3),
  penguin: () =>
    c(50, 52, 38, '#2b2d42', ol) +
    c(39, 54, 18, '#fff') + c(61, 54, 18, '#fff') + el(50, 68, 22, 15, '#fff') +
    eyes(50, 11, 6.5) + p('M42 64 L58 64 L50 74 Z', '#ff9f1c', ol.replace(SW, 2.5)) + cheeks(66, 24),
  bunny: () =>
    el(36, 22, 9, 25, '#f4f4f8', -8, ol) + el(64, 22, 9, 25, '#f4f4f8', 8, ol) +
    el(36, 22, 4.5, 17, '#ffb3c6', -8) + el(64, 22, 4.5, 17, '#ffb3c6', 8) +
    c(50, 62, 33, '#f4f4f8', ol) + eyes(58, 12, 6.5) +
    el(50, 70, 4.5, 3.5, '#ff6b8b') + line('M44 74 Q50 78 56 74', 2.5) +
    `<rect x="46" y="76" width="8" height="8" rx="2" fill="#fff" ${ol.replace(SW, 2)}/>` + cheeks(70, 22),
  tiger: () =>
    c(22, 24, 11, '#ffa62b', ol) + c(78, 24, 11, '#ffa62b', ol) + c(22, 24, 5.5, '#fff') + c(78, 24, 5.5, '#fff') +
    c(50, 54, 36, '#ffa62b', ol) +
    line('M42 22 L46 32 M50 20 L50 30 M58 22 L54 32 M16 50 L28 52 M16 60 L27 58 M84 50 L72 52 M84 60 L73 58', 4) +
    el(50, 70, 18, 12, '#fff') + eyes(50) + p('M45 63 L55 63 L50 69 Z', '#5a2a0a') + line('M43 73 Q47 77 50 72 Q53 77 57 73', 2.5),
  octopus: () =>
    [22, 38, 62, 78].map((x) => el(x, 84, 7, 11, '#b05ee6', 0, ol)).join('') +
    el(50, 50, 39, 38, '#c77dff', 0, ol) + c(30, 30, 5, '#e0aaff') + c(66, 24, 4, '#e0aaff') + c(72, 40, 3, '#e0aaff') +
    eyes(52, 14, 9) + el(50, 70, 5, 4, O) + cheeks(66, 26),
  dino: () =>
    p('M28 22 L34 6 L42 20 Z', '#ffbe0b', ol) + p('M44 16 L52 0 L58 16 Z', '#ffbe0b', ol) + p('M60 20 L68 6 L72 22 Z', '#ffbe0b', ol) +
    el(50, 52, 38, 34, '#4cc9a0', 0, ol) + el(50, 70, 30, 17, '#8ce0c4') +
    eyes(44, 15, 7.5) + c(42, 64, 2, O) + c(58, 64, 2, O) + line('M30 74 Q50 84 70 74', 3) +
    p('M38 76 L41 82 L44 77 Z M56 77 L59 82 L62 76 Z', '#fff'),
  pig: () =>
    p('M14 30 L22 6 L40 22 Z', '#ff8fab', ol) + p('M86 30 L78 6 L60 22 Z', '#ff8fab', ol) +
    c(50, 54, 37, '#ffadc6', ol) + eyes(46, 14, 7) +
    el(50, 66, 15, 11, '#ff8fab', 0, ol) + el(45, 66, 3, 4.5, '#a8325e') + el(55, 66, 3, 4.5, '#a8325e') +
    line('M42 82 Q50 86 58 82', 2.5) + cheeks(68, 30),
  // bots
  robot: () =>
    line('M50 18 L50 6', 3.5) + c(50, 6, 5, '#ff4d6d', ol.replace(SW, 2.5)) +
    `<rect x="12" y="18" width="76" height="66" rx="16" fill="#b8c4d6" ${ol}/>` +
    c(10, 50, 6, '#8d99ae', ol.replace(SW, 2.5)) + c(90, 50, 6, '#8d99ae', ol.replace(SW, 2.5)) +
    `<rect x="22" y="32" width="56" height="24" rx="10" fill="${O}"/>` +
    `<rect x="31" y="38" width="12" height="12" rx="3" fill="#4cc9f0"/><rect x="57" y="38" width="12" height="12" rx="3" fill="#4cc9f0"/>` +
    line('M32 68 L68 68 M38 64 L38 72 M46 64 L46 72 M54 64 L54 72 M62 64 L62 72', 2.5),
  alien: () =>
    line('M34 18 L26 4 M66 18 L74 4', 3) + c(26, 4, 4.5, '#ffd23f', ol.replace(SW, 2.5)) + c(74, 4, 4.5, '#ffd23f', ol.replace(SW, 2.5)) +
    p('M50 12 C82 12 90 38 86 54 C82 74 64 92 50 92 C36 92 18 74 14 54 C10 38 18 12 50 12 Z', '#9ef01a', ol) +
    el(34, 52, 12, 7.5, O, 30) + el(66, 52, 12, 7.5, O, -30) + c(30, 49, 2.5, '#fff') + c(62, 49, 2.5, '#fff') +
    line('M44 74 Q50 78 56 74', 2.5),
  cyclops: () =>
    p('M24 26 L18 6 L36 18 Z', '#ffd23f', ol) + p('M76 26 L82 6 L64 18 Z', '#ffd23f', ol) +
    p('M50 14 C84 14 90 44 88 60 C86 80 70 90 50 90 C30 90 14 80 12 60 C10 44 16 14 50 14 Z', '#7b2cbf', ol) +
    c(50, 46, 17, '#fff', ol) + c(50, 48, 9, '#06d6a0') + c(50, 48, 5, O) + c(53, 44, 2.2, '#fff') +
    p('M32 70 Q50 84 68 70 Z', O) + p('M38 71 L42 77 L46 72 Z M54 72 L58 77 L62 71 Z', '#fff'),
  pumpkin: () =>
    p('M46 18 Q48 4 58 2 L60 8 Q54 10 54 18 Z', '#2d6a4f', ol.replace(SW, 2.5)) +
    el(50, 56, 42, 36, '#ff8c1a', 0, ol) + line('M50 20 Q36 56 50 92 M50 20 Q64 56 50 92 M30 26 Q18 56 30 88 M70 26 Q82 56 70 88', 2.5, '#c45a00') +
    p('M30 48 L40 36 L46 50 Z', '#2b0f00') + p('M70 48 L60 36 L54 50 Z', '#2b0f00') +
    p('M26 64 L34 72 L40 66 L46 74 L52 66 L58 74 L64 66 L74 64 Q62 84 50 84 Q36 84 26 64 Z', '#2b0f00') + p('M36 50 L40 44 L42 50 Z', '#ffd23f'),
  ghost: () =>
    p('M50 8 C76 8 86 28 86 50 L86 88 L76 80 L66 90 L56 80 L50 88 L44 80 L34 90 L24 80 L14 88 L14 50 C14 28 24 8 50 8 Z', '#f4f1ff', ol) +
    el(38, 44, 6, 9, O) + el(62, 44, 6, 9, O) + c(40, 40, 2, '#fff') + c(64, 40, 2, '#fff') + el(50, 64, 6, 7, O) + cheeks(56, 22),
};

export const AVATARS = ['frog', 'cat', 'dog', 'fox', 'panda', 'monkey', 'penguin', 'bunny', 'tiger', 'octopus', 'dino', 'pig'];
export const BOT_AVATARS = ['robot', 'alien', 'cyclops', 'pumpkin'];
export const validAvatar = (id) => (typeof id === 'string' && AV[id] ? id : 'frog');

export function avatarSVG(id) {
  const f = AV[id] || AV.frog;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 108 108" width="100" height="100" class="avatar">${f()}</svg>`;
}

// <img> en caché para dibujar en canvas (2D y texturas 3D)
const imgCache = new Map();
export function avatarImage(id) {
  id = validAvatar(id);
  if (imgCache.has(id)) return imgCache.get(id);
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(avatarSVG(id).replace('width="100" height="100"', 'width="256" height="256"'));
  imgCache.set(id, img);
  return img;
}

// ---------------------------------------------------------------- interfaz
const I = {
  star: '<path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z" fill="#ffd23f" stroke="#1b1035" stroke-width="1.6" stroke-linejoin="round"/>',
  heart: '<path d="M12 21s-8.5-5.3-8.5-11.2C3.5 6.6 5.8 4.5 8.4 4.5c1.6 0 2.9.8 3.6 2 .7-1.2 2-2 3.6-2 2.6 0 4.9 2.1 4.9 5.3C20.5 15.7 12 21 12 21z" fill="#ff4d6d" stroke="#1b1035" stroke-width="1.6" stroke-linejoin="round"/><circle cx="8" cy="9" r="1.6" fill="#fff" opacity=".8"/>',
  heartEmpty: '<path d="M12 21s-8.5-5.3-8.5-11.2C3.5 6.6 5.8 4.5 8.4 4.5c1.6 0 2.9.8 3.6 2 .7-1.2 2-2 3.6-2 2.6 0 4.9 2.1 4.9 5.3C20.5 15.7 12 21 12 21z" fill="#3d2c5e" stroke="#1b1035" stroke-width="1.6" stroke-linejoin="round"/>',
  crown: '<path d="M3 18l1.5-10 4.5 4 3-6 3 6 4.5-4L21 18z" fill="#ffd23f" stroke="#1b1035" stroke-width="1.6" stroke-linejoin="round"/><rect x="3" y="18" width="18" height="3" rx="1" fill="#ffb703" stroke="#1b1035" stroke-width="1.4"/><circle cx="12" cy="14" r="1.5" fill="#ff4d6d"/>',
  trophy: '<path d="M7 3h10v5a5 5 0 01-10 0z" fill="#ffd23f" stroke="#1b1035" stroke-width="1.6"/><path d="M7 5H4a3 3 0 003 4M17 5h3a3 3 0 01-3 4" fill="none" stroke="#1b1035" stroke-width="1.6"/><path d="M10.5 13h3v4h-3z" fill="#ffb703" stroke="#1b1035" stroke-width="1.4"/><rect x="7" y="17" width="10" height="4" rx="1.2" fill="#8d5a3b" stroke="#1b1035" stroke-width="1.4"/>',
  coin: '<circle cx="12" cy="12" r="9" fill="#ffd60a" stroke="#1b1035" stroke-width="1.6"/><circle cx="12" cy="12" r="5.8" fill="none" stroke="#e0a800" stroke-width="1.8"/><path d="M12 8.5v7" stroke="#e0a800" stroke-width="2" stroke-linecap="round"/>',
  bomb: '<circle cx="11" cy="14" r="7.5" fill="#2b2d42" stroke="#1b1035" stroke-width="1.6"/><circle cx="8.5" cy="11.5" r="2" fill="#fff" opacity=".35"/><path d="M15.5 8.5l2-2" stroke="#8d6e63" stroke-width="2.4" stroke-linecap="round"/><circle cx="19" cy="5" r="2.2" fill="#ffbe0b"/><circle cx="19" cy="5" r="1" fill="#fff"/>',
  timer: '<circle cx="12" cy="13.5" r="8" fill="#fff" stroke="#1b1035" stroke-width="1.6"/><path d="M12 13.5V9M12 13.5l3 2" stroke="#ff4d6d" stroke-width="2" stroke-linecap="round"/><rect x="10" y="2.5" width="4" height="3" rx="1" fill="#1b1035"/>',
  people: '<circle cx="12" cy="7.5" r="4" fill="#4cc9f0" stroke="#1b1035" stroke-width="1.6"/><path d="M4.5 21c.5-4.5 3.5-7 7.5-7s7 2.5 7.5 7z" fill="#4cc9f0" stroke="#1b1035" stroke-width="1.6" stroke-linejoin="round"/>',
  soundOn: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="#fff" stroke="#1b1035" stroke-width="1.5" stroke-linejoin="round"/><path d="M15 9a4 4 0 010 6M17.5 6.5a7.5 7.5 0 010 11" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
  soundOff: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="#fff" stroke="#1b1035" stroke-width="1.5" stroke-linejoin="round"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5" stroke="#ff4d6d" stroke-width="2.2" stroke-linecap="round"/>',
  back: '<path d="M14.5 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  rocket: '<path d="M12 2.5c4 2.5 5.5 6.5 5 11l-2.5 3h-5L7 13.5c-.5-4.5 1-8.5 5-11z" fill="#fff" stroke="#1b1035" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.2" fill="#4cc9f0" stroke="#1b1035" stroke-width="1.3"/><path d="M7.5 12.5L4.5 16l3 .5M16.5 12.5l3 3.5-3 .5" fill="#ff4d6d" stroke="#1b1035" stroke-width="1.3" stroke-linejoin="round"/><path d="M10 17.5l2 4 2-4z" fill="#ff9f1c"/>',
  party: '<path d="M3 21l5-14 9 9z" fill="#ff4d6d" stroke="#1b1035" stroke-width="1.5" stroke-linejoin="round"/><path d="M5.5 14l4.5 4.5M7 10l7 7" stroke="#ffd23f" stroke-width="1.6"/><circle cx="17" cy="4.5" r="1.5" fill="#4cc9f0"/><circle cx="20.5" cy="9" r="1.3" fill="#06d6a0"/><path d="M13 3.5l1 2.5M19 13l2.5.5M15.5 7.5l3-3" stroke="#ffd23f" stroke-width="1.6" stroke-linecap="round"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5" fill="#fff" stroke="#1b1035" stroke-width="1.6"/><path d="M16 8V5.5A1.5 1.5 0 0014.5 4h-9A1.5 1.5 0 004 5.5v9A1.5 1.5 0 005.5 16H8" fill="none" stroke="#fff" stroke-width="1.6"/>',
  eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="#fff" stroke="#1b1035" stroke-width="1.5"/><circle cx="12" cy="12" r="3.6" fill="#3a86ff" stroke="#1b1035" stroke-width="1.3"/><circle cx="12" cy="12" r="1.6" fill="#1b1035"/>',
  check: '<circle cx="12" cy="12" r="9.5" fill="#06d6a0" stroke="#1b1035" stroke-width="1.5"/><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  cross: '<circle cx="12" cy="12" r="9.5" fill="#ff4d6d" stroke="#1b1035" stroke-width="1.5"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>',
  warn: '<path d="M12 3l10 17.5H2z" fill="#ffd23f" stroke="#1b1035" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 9.5v5" stroke="#1b1035" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="17.3" r="1.4" fill="#1b1035"/>',
  gamepad: '<path d="M6.5 7.5h11a4.5 4.5 0 014.3 5.8l-1.2 4a2.6 2.6 0 01-4.5.8L14.5 16h-5l-1.6 2.1a2.6 2.6 0 01-4.5-.8l-1.2-4A4.5 4.5 0 016.5 7.5z" fill="#7b2cbf" stroke="#1b1035" stroke-width="1.5" stroke-linejoin="round"/><path d="M7.5 10.5v4M5.5 12.5h4" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><circle cx="16" cy="11" r="1.3" fill="#ffd23f"/><circle cx="18" cy="13.5" r="1.3" fill="#06d6a0"/>',
  bot: '<rect x="4" y="7" width="16" height="13" rx="4" fill="#b8c4d6" stroke="#1b1035" stroke-width="1.5"/><path d="M12 7V3.5" stroke="#1b1035" stroke-width="1.5"/><circle cx="12" cy="3" r="1.6" fill="#ff4d6d"/><rect x="7" y="10.5" width="10" height="5" rx="2" fill="#1b1035"/><rect x="8.5" y="12" width="2.5" height="2" fill="#4cc9f0"/><rect x="13" y="12" width="2.5" height="2" fill="#4cc9f0"/>',
  ghost: '<path d="M12 2.5c4.5 0 7 3.3 7 7.5v10.5l-2.3-1.6-2.4 1.8-2.3-1.8-2.3 1.8-2.4-1.8L5 20.5V10c0-4.2 2.5-7.5 7-7.5z" fill="#f4f1ff" stroke="#1b1035" stroke-width="1.5" stroke-linejoin="round"/><ellipse cx="9.5" cy="10" rx="1.3" ry="2" fill="#1b1035"/><ellipse cx="14.5" cy="10" rx="1.3" ry="2" fill="#1b1035"/>',
  sparkle: '<path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill="#ffd23f" stroke="#1b1035" stroke-width="1.4" stroke-linejoin="round"/>',
  splash: '<path d="M12 3c3 4.5 5.5 7.5 5.5 11a5.5 5.5 0 01-11 0C6.5 10.5 9 7.5 12 3z" fill="#4cc9f0" stroke="#1b1035" stroke-width="1.5"/><path d="M9.5 14a2.5 2.5 0 002.5 2.5" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>',
  bolt: '<path d="M13.5 2L5 13.5h6L9.5 22 19 9.5h-6z" fill="#ffd23f" stroke="#1b1035" stroke-width="1.5" stroke-linejoin="round"/>',
  repeat: '<path d="M4.5 11a7.5 7.5 0 0113-4.5M19.5 13a7.5 7.5 0 01-13 4.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M17.5 2.5v4h-4M6.5 21.5v-4h4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  medal1: '<path d="M7 2h4l2 6H9zM13 2h4l-2 6h-4z" fill="#3a86ff" stroke="#1b1035" stroke-width="1.2"/><circle cx="12" cy="15" r="7" fill="#ffd23f" stroke="#1b1035" stroke-width="1.5"/><text x="12" y="19" font-size="9.5" font-weight="900" text-anchor="middle" fill="#8a5a00" font-family="system-ui">1</text>',
  medal2: '<path d="M7 2h4l2 6H9zM13 2h4l-2 6h-4z" fill="#ff4d6d" stroke="#1b1035" stroke-width="1.2"/><circle cx="12" cy="15" r="7" fill="#d9dde3" stroke="#1b1035" stroke-width="1.5"/><text x="12" y="19" font-size="9.5" font-weight="900" text-anchor="middle" fill="#5c677d" font-family="system-ui">2</text>',
  medal3: '<path d="M7 2h4l2 6H9zM13 2h4l-2 6h-4z" fill="#06d6a0" stroke="#1b1035" stroke-width="1.2"/><circle cx="12" cy="15" r="7" fill="#e09f5a" stroke="#1b1035" stroke-width="1.5"/><text x="12" y="19" font-size="9.5" font-weight="900" text-anchor="middle" fill="#7a4410" font-family="system-ui">3</text>',
  medal4: '<circle cx="12" cy="13" r="8" fill="#5a4a7a" stroke="#1b1035" stroke-width="1.5"/><text x="12" y="17.2" font-size="10" font-weight="900" text-anchor="middle" fill="#fff" font-family="system-ui">4</text>',
  jump: '<path d="M12 3l6.5 7H14.5v5h-5v-5H5.5z" fill="#fff" stroke="#1b1035" stroke-width="1.5" stroke-linejoin="round"/><path d="M5 19.5h3M10.5 19.5h3M16 19.5h3" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>',
  attack: '<path d="M12 2l1.8 5.2L19 5l-2.2 5.2L22 12l-5.2 1.8L19 19l-5.2-2.2L12 22l-1.8-5.2L5 19l2.2-5.2L2 12l5.2-1.8L5 5l5.2 2.2z" fill="#ffd23f" stroke="#1b1035" stroke-width="1.4" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" fill="#ff4d6d"/>',
  // figuras para "Cuenta rápida"
  drop: '<path d="M12 3c3 4.5 5.5 7.5 5.5 11a5.5 5.5 0 01-11 0C6.5 10.5 9 7.5 12 3z" fill="#3a86ff" stroke="#1b1035" stroke-width="1.5"/>',
  leaf: '<path d="M4 20C4 9 10 4 20 4c0 10-5 16-16 16z" fill="#06d6a0" stroke="#1b1035" stroke-width="1.5" stroke-linejoin="round"/><path d="M5 19L15 9" stroke="#1b1035" stroke-width="1.3"/>',
  moon: '<path d="M14 3a9 9 0 107 14.5A7.5 7.5 0 0114 3z" fill="#ffe066" stroke="#1b1035" stroke-width="1.5" stroke-linejoin="round"/>',
  flower: '<g stroke="#1b1035" stroke-width="1.3">' + [0, 72, 144, 216, 288].map((a) => `<ellipse cx="12" cy="6.5" rx="3.6" ry="4.6" fill="#ff8fab" transform="rotate(${a} 12 12)"/>`).join('') + '<circle cx="12" cy="12" r="3" fill="#ffd23f"/></g>',
  apple: '<path d="M12 7c-3-2-8-1-8 5 0 5 3.5 9 6 9 1 0 1.5-.5 2-.5s1 .5 2 .5c2.5 0 6-4 6-9 0-6-5-7-8-5z" fill="#ff4d6d" stroke="#1b1035" stroke-width="1.5"/><path d="M12 7c0-2 1-3.5 3-4" fill="none" stroke="#1b1035" stroke-width="1.5"/>',
  fish: '<path d="M3 12c3-5 9-6 13-3l5-3v12l-5-3c-4 3-10 2-13-3z" fill="#ff9f1c" stroke="#1b1035" stroke-width="1.5" stroke-linejoin="round"/><circle cx="8" cy="11" r="1.3" fill="#1b1035"/>',
  mushroom: '<path d="M3 12a9 8 0 0118 0z" fill="#ff4d6d" stroke="#1b1035" stroke-width="1.5"/><circle cx="8" cy="9" r="1.6" fill="#fff"/><circle cx="14" cy="7.5" r="1.4" fill="#fff"/><circle cx="17" cy="10.5" r="1.1" fill="#fff"/><path d="M9 12h6v6a3 3 0 01-6 0z" fill="#fff3e0" stroke="#1b1035" stroke-width="1.5"/>',
  diamond: '<path d="M12 3l8 9-8 9-8-9z" fill="#c77dff" stroke="#1b1035" stroke-width="1.5" stroke-linejoin="round"/>',
  cloud: '<path d="M7 18a4 4 0 010-8 5.5 5.5 0 0110.5 1.5A3.3 3.3 0 0117 18z" fill="#fff" stroke="#1b1035" stroke-width="1.5" stroke-linejoin="round"/>',
};

export function icon(name, cls = 'ic') {
  return `<svg class="${cls}" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">${I[name] || ''}</svg>`;
}

// Reemplaza {nombre} por su icono. El texto debe venir ya escapado.
export function rich(text) {
  return String(text ?? '').replace(/\{([a-zA-Z0-9]+)\}/g, (m, n) => (I[n] ? icon(n) : m));
}

// ---------------------------------------------------------------- juegos
const GI = {
  tap: '<circle cx="32" cy="40" r="20" fill="#ff4d6d" stroke="#1b1035" stroke-width="3"/><ellipse cx="32" cy="36" rx="20" ry="16" fill="#ff7b95" stroke="#1b1035" stroke-width="3"/><path d="M28 30V8a4 4 0 018 0v18l8 2a4 4 0 013 5l-2 9H26l-6-8a3.5 3.5 0 015-5z" fill="#fff3e0" stroke="#1b1035" stroke-width="3" stroke-linejoin="round"/><path d="M12 14l5 4M52 14l-5 4M32 2v0" stroke="#ffd23f" stroke-width="3.5" stroke-linecap="round"/>',
  reflex: '<ellipse cx="32" cy="44" rx="28" ry="9" fill="#a0522d" stroke="#1b1035" stroke-width="3"/><path d="M16 42c0-16 4-26 10-26 3 0 4 3 6 3s3-3 6-3c6 0 10 10 10 26z" fill="#c68b59" stroke="#1b1035" stroke-width="3" stroke-linejoin="round"/><path d="M17 36h30" stroke="#ff4d6d" stroke-width="5"/><path d="M48 8l4 6 6-2-3 6" fill="none" stroke="#ffd23f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  count: '<rect x="6" y="10" width="52" height="44" rx="10" fill="#3a86ff" stroke="#1b1035" stroke-width="3"/><text x="32" y="44" font-size="26" font-weight="900" text-anchor="middle" fill="#fff" font-family="system-ui">123</text>',
  memory: '<rect x="6" y="6" width="24" height="24" rx="6" fill="#ff4d6d" stroke="#1b1035" stroke-width="3"/><rect x="34" y="6" width="24" height="24" rx="6" fill="#3a86ff" stroke="#1b1035" stroke-width="3" opacity=".55"/><rect x="6" y="34" width="24" height="24" rx="6" fill="#ffbe0b" stroke="#1b1035" stroke-width="3" opacity=".55"/><rect x="34" y="34" width="24" height="24" rx="6" fill="#06d6a0" stroke="#1b1035" stroke-width="3"/><circle cx="18" cy="18" r="5" fill="#fff" opacity=".8"/>',
  stopwatch: '<circle cx="32" cy="36" r="22" fill="#fff" stroke="#1b1035" stroke-width="3"/><circle cx="32" cy="36" r="17" fill="#e0f7ff"/><path d="M32 36V22M32 36l9 6" stroke="#ff4d6d" stroke-width="4" stroke-linecap="round"/><rect x="26" y="4" width="12" height="7" rx="2" fill="#1b1035"/><path d="M50 14l4-4" stroke="#1b1035" stroke-width="4" stroke-linecap="round"/>',
  kraken: '<path d="M10 58c0-12 8-14 8-24S12 18 20 12s10 6 8 14-6 14 2 20 16-4 18-12-6-14 0-18 14 4 10 16-12 18-10 26z" fill="#7b2cbf" stroke="#1b1035" stroke-width="3" stroke-linejoin="round"/><circle cx="22" cy="40" r="3" fill="#e0aaff"/><circle cx="30" cy="48" r="3" fill="#e0aaff"/><circle cx="44" cy="36" r="3" fill="#e0aaff"/><path d="M2 60c8-4 14 0 20-2s12-4 20 0 14 2 20-2" fill="none" stroke="#4cc9f0" stroke-width="4" stroke-linecap="round"/>',
  bombs: '<circle cx="30" cy="40" r="18" fill="#2b2d42" stroke="#1b1035" stroke-width="3"/><circle cx="24" cy="34" r="5" fill="#fff" opacity=".3"/><path d="M42 26l6-6" stroke="#8d6e63" stroke-width="5" stroke-linecap="round"/><path d="M50 10l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#ffbe0b" stroke="#1b1035" stroke-width="2" stroke-linejoin="round"/><path d="M8 8v10M16 4v8" stroke="#ff7b00" stroke-width="3" stroke-linecap="round"/>',
  tiles: '<rect x="4" y="4" width="26" height="26" rx="5" fill="#ef476f" stroke="#1b1035" stroke-width="3"/><rect x="34" y="4" width="26" height="26" rx="5" fill="#118ab2" stroke="#fff" stroke-width="4"/><rect x="4" y="34" width="26" height="26" rx="5" fill="#ffd166" stroke="#1b1035" stroke-width="3"/><rect x="34" y="34" width="26" height="26" rx="5" fill="#06d6a0" stroke="#1b1035" stroke-width="3"/>',
  coins: '<ellipse cx="32" cy="50" rx="20" ry="7" fill="#e0a800" stroke="#1b1035" stroke-width="3"/><rect x="12" y="38" width="40" height="12" fill="#e0a800"/><ellipse cx="32" cy="38" rx="20" ry="7" fill="#ffd60a" stroke="#1b1035" stroke-width="3"/><path d="M12 38v12M52 38v12" stroke="#1b1035" stroke-width="3"/><circle cx="40" cy="20" r="13" fill="#ffd60a" stroke="#1b1035" stroke-width="3"/><circle cx="40" cy="20" r="8" fill="none" stroke="#e0a800" stroke-width="3"/>',
  sumo: '<path d="M32 60L22 44h20z" fill="#d9dde3" stroke="#1b1035" stroke-width="3" stroke-linejoin="round"/><ellipse cx="32" cy="38" rx="27" ry="10" fill="#f72585" stroke="#1b1035" stroke-width="3"/><path d="M6 36l10-6M58 36l-10-6M26 48l-6 6" stroke="#1b1035" stroke-width="3" stroke-linecap="round"/><ellipse cx="32" cy="30" rx="12" ry="6" fill="#7209b7" stroke="#1b1035" stroke-width="3"/><circle cx="32" cy="26" r="4" fill="#fff"/><path d="M4 22c6-6 14-8 20-6M60 22c-6-6-14-8-20-6" fill="none" stroke="#ffd23f" stroke-width="3" stroke-linecap="round"/>',
  hotbomb: '<circle cx="30" cy="40" r="18" fill="#2b2d42" stroke="#1b1035" stroke-width="3"/><path d="M42 26l6-6" stroke="#8d6e63" stroke-width="5" stroke-linecap="round"/><path d="M48 18c4-6 10-6 10-12 4 6 2 12-2 16-3 2-6 0-8-4z" fill="#ff4d6d" stroke="#1b1035" stroke-width="2.5" stroke-linejoin="round"/><path d="M50 18c2-3 5-3 6-6 1 3 0 6-2 7z" fill="#ffd23f"/><path d="M20 44h20M30 34v20" stroke="#ff4d6d" stroke-width="0"/><text x="30" y="47" font-size="14" font-weight="900" text-anchor="middle" fill="#ff4d6d" font-family="system-ui">3</text>',
  ice: '<path d="M10 22l22-12 22 12v22L32 56 10 44z" fill="#caf0f8" stroke="#1b1035" stroke-width="3" stroke-linejoin="round"/><path d="M10 22l22 12 22-12M32 34v22" fill="none" stroke="#1b1035" stroke-width="3" stroke-linejoin="round"/><path d="M18 20l10 5M42 40l-5 4 3 4" fill="none" stroke="#3a86ff" stroke-width="2.5" stroke-linecap="round"/><path d="M14 28l6 3" stroke="#fff" stroke-width="3" stroke-linecap="round"/>',
};

export function gameIcon(id, cls = 'gi') {
  return `<svg class="${cls}" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">${GI[id] || ''}</svg>`;
}
