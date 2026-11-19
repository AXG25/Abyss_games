// Registro de mini juegos. Para agregar uno nuevo: crea el archivo en esta
// carpeta siguiendo la misma forma (id, name, emoji, desc, dur, mount,
// evaluate, bot) e impórtalo aquí.
import tap from './tap.js';
import reflex from './reflex.js';
import count from './count.js';
import memory from './memory.js';
import stopwatch from './stopwatch.js';

export const GAMES = [tap, reflex, count, memory, stopwatch];
export const GAME_BY_ID = Object.fromEntries(GAMES.map((g) => [g.id, g]));
