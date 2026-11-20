// Registro de mini juegos. Para agregar uno nuevo: crea el archivo en esta
// carpeta siguiendo la misma forma (id, name, emoji, desc, dur, mount,
// evaluate, bot) e impórtalo aquí.
import tap from './tap.js';
import reflex from './reflex.js';
import count from './count.js';
import memory from './memory.js';
import stopwatch from './stopwatch.js';
import kraken from './kraken.js';
import bombs from './bombs.js';
import tiles from './tiles.js';
import coins from './coins.js';
import sumo from './sumo.js';
import hotbomb from './hotbomb.js';
import ice from './ice.js';
import race from './race.js';
import archery from './archery.js';
import swords from './swords.js';
import paint from './paint.js';
import chicken from './chicken.js';
import stack from './stack.js';

export const GAMES = [swords, race, archery, kraken, bombs, tiles, coins, sumo, hotbomb, ice, paint, tap, reflex, count, memory, stopwatch, chicken, stack];
export const GAME_BY_ID = Object.fromEntries(GAMES.map((g) => [g.id, g]));
