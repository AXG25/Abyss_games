// Juegos largos: aparte de la fiesta de mini juegos. El anfitrión crea la sala,
// los demás se unen y él elige el juego en la sección "Juegos largos".
// Cada juego tiene sus reglas (`rules`, puras y en el anfitrión) y su pantalla (`mount`).
//   rules: init(ids, seed, prevWins) → lg, act(lg, pid, a) → bool, autoMove(lg, pid) → a,
//          current(lg) → pid, TURN_MS, OFF_TURN_MS
import * as ocho from './ocho.js';
import { mountOcho } from './ocho-ui.js';

export const LONG_GAMES = [
  {
    id: 'ocho',
    name: 'Ocho loco',
    desc: 'El clásico juego de cartas: tira del mismo palo o número, el 8 cambia el palo, el 2 hace robar y la J salta. Gana quien se quede sin cartas.',
    min: 2, max: 4, mins: '5–15 min',
    rules: ocho,
    mount: mountOcho,
  },
];
export const LONG_BY_ID = Object.fromEntries(LONG_GAMES.map((g) => [g.id, g]));
