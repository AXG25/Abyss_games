# 🎉 Abyss Games

Mini juegos tipo *party game* (al estilo Mario Party) pensados 100 % para celular.
Una persona crea una sala, comparte el código de 4 letras y hasta 4 jugadores
compiten ronda tras ronda por estrellas ⭐.

## Mini juegos

| | Juego | Cómo se gana |
|---|---|---|
| 🗡️ | Ruleta de espadas *(3D)* | 5 espadas por ronda a una ruleta que acelera: +2, ×2, ÷2… en orden. Gana quien gane más de las 3 rondas |
| 🏎️ | Gran Premio *(3D, tiempo real)* | Carrera de karts isométrica a 3 vueltas en una pista de 4 carriles: turbo, flechas de impulso, aceite y minimapa |
| 🏹 | Tiro con arco *(3D)* | 3 rondas de precisión (18, 30 y 45 m): tensa, apunta y suelta compensando el viento antes de que se acabe el tiempo |
| 👊 | Machaca el botón *(3D)* | Carrera de torres: cada toque hace crecer tu torre |
| 🤠 | Reflejos de vaquero *(3D)* | Duelo del oeste: el más rápido en disparar tras la campana tumba a todos. El primero en ganar 3 duelos gana |
| 🔢 | Cuenta rápida *(3D)* | Llueven objetos 3D sobre un carrusel: cuenta los pedidos y responde rápido |
| 🧠 | Simón dice *(3D)* | 3 rondas cada vez más difíciles (4→6 botones, 4→7 pasos, la última gira) |
| ⏱️ | Para en… *(3D)* | 3 rondas: detén el cronómetro gigante en el segundo pedido (1–10) |
| 🐙 | Kraken en cubierta *(tiempo real)* | Saltar los tentáculos que giran en el barco; sobrevivir más |
| 💣 | Lluvia de bombas *(tiempo real)* | Esquivar bombas, cajas que caen y barriles que ruedan (se saltan); 3 vidas |
| 🟩 | Pisa el color *(tiempo real)* | Pararse en el color anunciado antes de que el piso se caiga |
| 🪙 | Fiebre de monedas *(tiempo real)* | Recoger más monedas en 30 s |
| 🌀 | Trompos de batalla *(tiempo real)* | Por rondas: embiste a los demás para sacarlos del estadio; la ronda la gana el último en pie y el primero en ganar 3 rondas gana |
| 💥 | Bomba caliente *(tiempo real)* | Pasar la bomba antes de que explote; gana el último en pie |
| 🧊 | Hielo frágil *(tiempo real)* | El hielo que pisas se hunde; gana el último en pie |

Puntos por ronda: 1.º 3⭐ · 2.º 2⭐ · 3.º 1⭐ · 4.º 0⭐.

## Juegos largos

Aparte de la fiesta de mini juegos, en la sala hay una sección **Juegos largos**:
el anfitrión crea la sala, los amigos se unen y él toca el juego para empezar.

| | Juego | Reglas |
|---|---|---|
| 🃏 | Ocho loco *(2–4)* | Baraja francesa. Tira del mismo palo o número; el 8 es comodín y cambia el palo; el 2 hace robar 2 (se acumula); la J salta; la Q cambia el sentido. Gana quien se quede sin cartas |
| 🌪️ | Caos *(2–4)* | Juego de cartas propio con 4 elementos (fuego, agua, planta, rayo): mismo elemento o mismo número. Cartas de bloqueo (el siguiente pierde el turno), dirección, elemento (comodín), +2 y +4. Regla de la casa: los +2 y +4 se suman y quien no pueda responder se come todo lo acumulado |
| ♟️ | Ajedrez *(solo 2)* | Reglas completas: enroque, captura al paso, coronación, jaque mate y tablas (ahogado, triple repetición, 50 movimientos, material insuficiente, por acuerdo). Reloj 10 min + 3 s por jugada; pierde quien se queda sin tiempo o se desconecta más de 1 min en su turno. Con 3 o más jugadores en la sala se deshabilita |
| 🎲 | Parqués *(2–4)* | El clásico colombiano: se sale de la cárcel con pares (sale una ficha; con doble 1 o doble 6 salen todas; 3 intentos si todas están presas), cada dado mueve una ficha, **bloqueos**: dos fichas del mismo color en una casilla la cierran (las de otro color no pueden pasar ni caer ahí; las del mismo color sí pasan), comer manda a la cárcel (no en seguros ni salidas, salvo al salir de la cárcel), pares = otro lanzamiento, tres pares seguidos coronan la ficha que elijas, número exacto para el cielo. Gana quien corone sus 4 fichas |
| 🁫 | Dominó *(2–4)* | Doble seis, 7 fichas cada uno. Con 4 jugadores, por parejas y sin pozo; con 2 o 3, individual con pozo. Abre el doble seis (luego quien ganó la mano). La mano termina en dominó o tranque (gana quien tenga menos puntos); el ganador suma los puntos de sus rivales. Partida a 100 |
| ✍️ | Stop *(2–4)* | Basta / Tutti Frutti: el anfitrión elige categorías (o agrega las suyas), rondas y tiempo. Sale una letra, todos escriben a la vez y quien llene todo grita ¡STOP!. Luego se vota: una respuesta se anula si la marca más de la mitad de los demás. 100 puntos si es única, 50 si se repite |

- Por turnos: el anfitrión aplica las reglas (`js/long/ocho.js`) y publica el
  estado en `st.lg`; los demás envían sus jugadas en `presence.la`. Cada jugada
  dice para qué turno era (`tn`), así nunca se aplica dos veces.
- Ocho loco: 30 s por turno; si se acaba, juega solo (6 s si el jugador se desconectó).
  El botón **?** muestra las reglas y el poder de cada carta especial (las de la
  mano llevan su etiqueta: +2, Comodín, Salta, Reversa). Debajo de la mesa se ven
  las últimas 3 jugadas (`lg.hist`), así queda claro por qué alguien juega dos
  veces seguidas: robó una carta que le sirvió, o salió una J (o una Q con 2
  jugadores). La pantalla solo repinta lo que cambió (antes la barra de tiempo
  del que jugaba volvía a llenarse con cada actualización de la sala).
- Ajedrez: reloj por jugador (`onTime`). Revancha con colores cambiados. Las
  reglas se comprueban con *perft* (conteo de jugadas en posiciones de prueba).
- Parqués (`js/long/parques-ui.js`): el tablero fijo es un `<svg>` que se dibuja
  una sola vez; encima va otro con los peones, que saltan casilla por casilla
  (`requestAnimationFrame`). Con cada actualización de la sala solo se toca lo
  que cambió (antes se volvía a crear todo y el tablero parpadeaba). Los dados
  son cubos 3D de CSS que se lanzan y caen en el número.
- Cada juego dice cuántos jugadores admite (`min`/`max`); fuera de ese rango
  aparece deshabilitado en la sala con el motivo.
- Los bots también juegan. Si el anfitrión se va, otro sigue la partida.
- `LOOSE` (opcional): juegos donde todos juegan a la vez (Stop); las jugadas no
  exigen el número de turno y se mandan completas (la última gana).
- `autoDelay(lg)` (opcional): jugadas sin opción (pasar, robar del pozo) o
  pausas (resultado de la mano en el dominó) que el anfitrión hace solo.
- Para agregar otro juego largo: reglas + pantalla en `js/long/` y regístralo en
  `js/long/index.js`.

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

## Publicar una versión nueva

Antes de cada `git push`, ejecuta:

```
node tools/version.mjs
```

Esto sella la versión en `index.html`: el CSS y todos los módulos JS se piden con `?v=<versión>`. Así el celular nunca mezcla archivos viejos de la caché con los nuevos. Si alguien abre una versión vieja, la página detecta la nueva (`version.json`) y se recarga sola.
