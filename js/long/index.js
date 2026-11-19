// Juegos largos: aparte de la fiesta de mini juegos. El anfitrión crea la sala,
// los demás se unen y él elige el juego en la sección "Juegos largos".
// Cada juego tiene sus reglas (`rules`, puras y en el anfitrión) y su pantalla (`mount`).
//   rules: init(ids, seed, prevWins) → lg, act(lg, pid, a) → bool, autoMove(lg, pid) → a,
//          current(lg) → pid, TURN_MS, OFF_TURN_MS
import * as ocho from './ocho.js';
import { mountOcho } from './ocho-ui.js';
import * as caos from './caos.js';
import { mountCaos } from './caos-ui.js';
import * as chess from './chess.js';
import { mountChess } from './chess-ui.js';
import * as parques from './parques.js';
import { mountParques } from './parques-ui.js';
import * as domino from './domino.js';
import { mountDomino } from './domino-ui.js';
import * as stop from './stop.js';
import { mountStop } from './stop-ui.js';

export const LONG_GAMES = [
  {
    id: 'ocho',
    name: 'Ocho loco',
    desc: 'El clásico juego de cartas: tira del mismo palo o número, el 8 cambia el palo, el 2 hace robar y la J salta. Gana quien se quede sin cartas.',
    min: 2, max: 4, mins: '5–15 min',
    rules: ocho,
    mount: mountOcho,
  },
  {
    id: 'caos',
    name: 'Caos',
    desc: 'Cartas de 4 elementos con bloqueo de turno, cambio de dirección, cambio de elemento, +2 y +4. ¡Los +2 y +4 se suman! Quien no pueda responder se come todo lo acumulado.',
    min: 2, max: 4, mins: '5–15 min',
    rules: caos,
    mount: mountCaos,
  },
  {
    id: 'chess',
    name: 'Ajedrez',
    desc: 'Partida completa con todas las reglas: enroque, captura al paso, coronación y tablas. Reloj de 10 min por jugador (+3 s por jugada).',
    min: 2, max: 2, mins: '10–30 min',
    rules: chess,
    mount: mountChess,
  },
  {
    id: 'parques',
    name: 'Parqués',
    desc: 'El clásico colombiano: saca tus fichas de la cárcel con pares (doble 1 o doble 6 sacan todas), arma bloqueos, cómete a los rivales y corona tus 4 fichas en el cielo.',
    min: 2, max: 4, mins: '20–45 min',
    rules: parques,
    mount: mountParques,
  },
  {
    id: 'domino',
    name: 'Dominó',
    desc: 'Doble seis, a 100 puntos. Con 4 jugadores es por parejas; con 2 o 3, cada uno por su cuenta con pozo. ¡Dominó o tranque!',
    min: 2, max: 4, mins: '15–40 min',
    rules: domino,
    mount: mountDomino,
  },
  {
    id: 'stop',
    name: 'Stop',
    desc: 'Sale una letra y todos escriben a la vez: nombre, animal, fruta, ciudad… El primero que termine grita ¡STOP! Luego se vota qué vale. Categorías a tu gusto.',
    min: 2, max: 4, mins: '10–25 min',
    rules: stop,
    mount: mountStop,
  },
];
export const LONG_BY_ID = Object.fromEntries(LONG_GAMES.map((g) => [g.id, g]));
