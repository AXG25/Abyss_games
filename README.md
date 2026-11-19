# 🎉 Party Play

Mini juegos tipo *party game* (al estilo Mario Party) pensados 100 % para celular.
Una persona crea una sala, comparte el código de 4 letras y hasta 4 jugadores
compiten ronda tras ronda por estrellas ⭐.

## Mini juegos

| | Juego | Cómo se gana |
|---|---|---|
| 👊 | Machaca el botón | Más toques en 8 s |
| 🤠 | Reflejos de vaquero | Tocar primero cuando se pone verde (tocar antes = falta) |
| 🔢 | Cuenta rápida | Contar el emoji objetivo y responder bien y rápido |
| 🧠 | Simón dice | Repetir la secuencia de 6 colores |
| ⏱️ | Para en 5.00 | Detener el cronómetro oculto lo más cerca de 5.00 s |

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
