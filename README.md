# 🎉 Abyss Games

Mini juegos tipo *party game* (al estilo Mario Party) pensados 100 % para celular.
Una persona crea una sala, comparte el código de 4 letras y hasta 4 jugadores
compiten ronda tras ronda por estrellas ⭐.

## Mini juegos

| | Juego | Cómo se gana |
|---|---|---|
| 🏎️ | Gran Premio *(3D, tiempo real)* | Carrera de karts isométrica a 3 vueltas: turbo, flechas de impulso, aceite y minimapa |
| 🏹 | Tiro con arco *(3D)* | 3 rondas de precisión (18, 30 y 45 m): tensa, apunta y suelta compensando el viento antes de que se acabe el tiempo |
| 👊 | Machaca el botón *(3D)* | Carrera de torres: cada toque hace crecer tu torre |
| 🤠 | Reflejos de vaquero *(3D)* | Duelo del oeste a 3 rondas: el más rápido en disparar tras la campana tumba a todos |
| 🔢 | Cuenta rápida *(3D)* | Llueven objetos 3D sobre un carrusel: cuenta los pedidos y responde rápido |
| 🧠 | Simón dice *(3D)* | 3 rondas cada vez más difíciles (4→6 botones, 5→9 pasos, la última gira) |
| ⏱️ | Para en… *(3D)* | 3 rondas: detén el cronómetro gigante en el segundo pedido (1–10) |
| 🐙 | Kraken en cubierta *(tiempo real)* | Saltar los tentáculos que giran en el barco; sobrevivir más |
| 💣 | Lluvia de bombas *(tiempo real)* | Esquivar bombas, cajas que caen y barriles que ruedan (se saltan); 3 vidas |
| 🟩 | Pisa el color *(tiempo real)* | Pararse en el color anunciado antes de que el piso se caiga |
| 🪙 | Fiebre de monedas *(tiempo real)* | Recoger más monedas en 30 s |
| 🌀 | Trompos de batalla *(tiempo real)* | Embestir con tu trompo a los demás para sacarlos del estadio |
| 💥 | Bomba caliente *(tiempo real)* | Pasar la bomba antes de que explote; gana el último en pie |
| 🧊 | Hielo frágil *(tiempo real)* | El hielo que pisas se hunde; gana el último en pie |

Puntos por ronda: 1.º 3⭐ · 2.º 2⭐ · 3.º 1⭐ · 4.º 0⭐.

## Cómo funciona

- **Sin servidor propio.** Se despliega como página alojada en Claude, que trae
  salas en tiempo real (`room`). Cada sala es un *named room* `pg-<código>`.
- **Anfitrión autoritativo.** El teléfono que crea la sala corre `Host`
  (`js/engine.js`): decide fases (`lobby → intro → play → res → final`),
  la semilla de cada ronda y los puntos, y lo publica en su `presence.st`.
- **Jugadores.** Cada teléfono lee `st`, juega localmente con la misma semilla
  y envía su resultado en `presence.in = { k, v }`.
- **Si el anfitrión se va**, el jugador más antiguo toma el control.
- **Bots** para probar solo (el anfitrión los agrega con +/−).
- **Modo local**: fuera de Claude se usa `BroadcastChannel`, así que varias
  pestañas del mismo navegador pueden jugar entre sí.

## Sonido

`js/audio.js` sintetiza todos los efectos con WebAudio (explosiones, choques
metálicos, salpicaduras, rugidos…) y genera música de fondo distinta para cada
juego (`G.music`). Los eventos del mundo de cada juego (`G.events`) disparan
sonidos, partículas y sacudidas de cámara.

## 3D

Los juegos en tiempo real se dibujan en 3D con Three.js (`vendor/three.module.min.js`,
r160) a través de `js/rt3d.js`. Cada juego define su escenario en `G.scene3d`
(`setup` y `update`); los personajes, la cámara, las luces y las sombras los
pone `rt3d.js`. Si el celular no soporta WebGL (o el jugador elige "Gráficos:
2D" en el inicio), se usa la versión 2D (`G.draw`).

## Juegos en tiempo real

`js/rt.js` es la base: joystick, botón de acción, bucle a 60 pasos/s, envío de
la posición ~15 veces/s y bots simulados por el anfitrión. Un juego nuevo solo
describe su mundo (`world`), su física (`step`), su IA de bot (`brain`) y cómo
se dibuja (`draw`). Mira `js/games/bombs.js` como ejemplo.

Para juegos con interacción entre jugadores: `ext.all` trae a todos los
jugadores; `hostInit`/`hostTick`/`applyHost` permiten que el anfitrión haga de
árbitro (ver `hotbomb.js`); `endWhenOneLeft` termina la ronda cuando queda uno.

## Agregar un mini juego

Crea `js/games/mijuego.js`:

```js
export default {
  id: 'mijuego', name: 'Mi juego', emoji: '🎯', desc: 'Instrucciones…',
  dur: (seed) => 8000,                 // duración de la fase de juego (ms)
  mount(el, ctx) {                      // dibuja el juego en `el`
    // ctx.seed, ctx.color, ctx.submit(resultado)
    return () => {};                    // limpieza
  },
  evaluate: (v, seed) => ({ score: 0, label: '…' }), // mayor score = mejor; null = 0 pts
  bot: (rng, seed) => ({}),             // resultado simulado de un bot
};
```

y regístralo en `js/games/index.js`.

## Correr en local

```bash
python3 -m http.server 8765
# abre http://localhost:8765 en dos pestañas
```
