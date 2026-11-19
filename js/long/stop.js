// ✍️ Stop (Basta / Tutti Frutti) — reglas (sin interfaz), las aplica el anfitrión.
// Todos juegan AL MISMO TIEMPO (no por turnos):
//
//  setup  → el anfitrión elige categorías, rondas y tiempo.
//  spin   → sale una letra al azar.
//  write  → todos escriben una palabra por categoría que empiece con esa letra.
//           Quien llene todo puede gritar ¡STOP!; si se acaba el tiempo, se para solo.
//  stop   → unos segundos para que lleguen las últimas respuestas.
//  vote   → cada uno marca las respuestas de los demás que no valen. Una respuesta
//           se anula si la marca más de la mitad de los otros jugadores.
//  score  → 100 puntos por respuesta única, 50 si alguien más puso la misma,
//           0 si está vacía, no empieza con la letra o la anularon.
//  Al final gana quien tenga más puntos.
//
// Las jugadas no cambian el número de turno (`tn`); solo los cambios de fase.
// Como cada teléfono guarda solo su última jugada, las respuestas y los votos se
// mandan completos cada vez (la última gana).
import { mulberry32, shuffle } from '../util.js';

export const LOOSE = true;
export const TURN_MS = 0;
export const OFF_TURN_MS = 0;
export const LETTERS = 'ABCDEFGHIJLMNOPRSTUV'.split('');
export const SPIN_MS = 2800;
export const STOP_MS = 2500;
export const VOTE_MS = 60000;
export const SCORE_MS = 12000;
export const MAX_CATS = 12;

export const CATS = [
  'Nombre', 'Apellido', 'Ciudad o país', 'Animal', 'Fruta o verdura', 'Color', 'Cosa', 'Profesión',
  'Comida', 'Deporte', 'Parte del cuerpo', 'Marca', 'Película o serie', 'Cantante o banda',
];
export const DEFAULT_CATS = ['Nombre', 'Apellido', 'Ciudad o país', 'Animal', 'Fruta o verdura', 'Color', 'Cosa', 'Profesión'];

// Banco de palabras para los bots: categoría → "Letra:palabra,palabra|…"
const BANK_TXT = {
  'Nombre': 'A:Ana,Andrés|B:Beatriz,Bruno|C:Carlos,Camila|D:Daniel,Diana|E:Elena,Esteban|F:Felipe,Fernanda|G:Gabriel,Gloria|H:Héctor,Helena|I:Isabel,Iván|J:Juan,Julia|L:Laura,Luis|M:María,Mateo|N:Natalia,Nicolás|O:Óscar,Olga|P:Pedro,Paula|R:Rosa,Ricardo|S:Sofía,Santiago|T:Tomás,Teresa|U:Úrsula,Ulises|V:Valentina,Víctor',
  'Apellido': 'A:Álvarez,Arango|B:Bernal,Botero|C:Castro,Cárdenas|D:Díaz,Duque|E:Escobar,Echeverri|F:Fernández,Franco|G:Gómez,García|H:Hernández,Herrera|I:Ibáñez,Iglesias|J:Jiménez,Jaramillo|L:López,Londoño|M:Martínez,Mejía|N:Naranjo,Núñez|O:Ortiz,Ospina|P:Pérez,Pardo|R:Rodríguez,Restrepo|S:Suárez,Salazar|T:Torres,Trujillo|U:Uribe,Urrutia|V:Vargas,Vélez',
  'Ciudad o país': 'A:Argentina,Armenia|B:Bogotá,Brasil|C:Cali,Chile|D:Dinamarca,Duitama|E:Ecuador,España|F:Francia,Florencia|G:Grecia,Girardot|H:Honduras,Honda|I:Italia,Ibagué|J:Japón,Jamaica|L:Lima,Londres|M:Medellín,México|N:Neiva,Noruega|O:Oslo,Ocaña|P:Perú,Pasto|R:Roma,Rusia|S:Santa Marta,Suecia|T:Tunja,Turquía|U:Uruguay,Ucrania|V:Venezuela,Valledupar',
  'Animal': 'A:Águila,Ardilla|B:Ballena,Búho|C:Caballo,Cocodrilo|D:Delfín,Danta|E:Elefante,Erizo|F:Foca,Flamenco|G:Gato,Gallina|H:Hormiga,Hipopótamo|I:Iguana,Impala|J:Jirafa,Jaguar|L:León,Lobo|M:Mono,Mariposa|N:Nutria,Narval|O:Oso,Oveja|P:Perro,Pato|R:Ratón,Rana|S:Serpiente,Sapo|T:Tigre,Tortuga|U:Urraca,Urogallo|V:Vaca,Venado',
  'Fruta o verdura': 'A:Aguacate,Arándano|B:Banano,Brócoli|C:Cereza,Coco|D:Durazno,Dátil|E:Espinaca,Espárrago|F:Fresa,Frambuesa|G:Guayaba,Granadilla|H:Higo,Habichuela|I:Icaco|J:Jengibre,Jícama|L:Limón,Lulo|M:Mango,Mandarina|N:Naranja,Níspero|O:Oliva|P:Papaya,Pera|R:Rábano,Remolacha|S:Sandía,Soya|T:Tomate,Toronja|U:Uva,Uchuva|V:Vainilla',
  'Color': 'A:Amarillo,Azul|B:Blanco,Beige|C:Café,Celeste|D:Dorado|E:Esmeralda|F:Fucsia|G:Gris,Granate|H:Hueso|I:Índigo|J:Jade|L:Lila,Lavanda|M:Morado,Marrón|N:Negro,Naranja|O:Ocre,Oro|P:Plateado,Púrpura|R:Rojo,Rosado|S:Salmón,Sepia|T:Turquesa,Terracota|U:Ultramar|V:Verde,Violeta',
  'Cosa': 'A:Anillo,Almohada|B:Botella,Balón|C:Cama,Cuchara|D:Dado,Disco|E:Escoba,Espejo|F:Foco,Florero|G:Gafas,Guitarra|H:Hilo,Hamaca|I:Imán,Impresora|J:Jarra,Jabón|L:Lápiz,Libro|M:Mesa,Martillo|N:Nevera,Navaja|O:Olla,Ordenador|P:Peine,Pelota|R:Reloj,Regla|S:Silla,Sombrero|T:Taza,Tijeras|U:Uniforme,Urna|V:Vaso,Ventana',
  'Profesión': 'A:Abogado,Arquitecto|B:Bombero,Biólogo|C:Carpintero,Cocinero|D:Doctor,Dentista|E:Enfermero,Electricista|F:Fotógrafo,Farmaceuta|G:Granjero,Geólogo|H:Herrero,Historiador|I:Ingeniero,Ilustrador|J:Juez,Jardinero|L:Locutor,Lechero|M:Médico,Músico|N:Notario,Nutricionista|O:Odontólogo,Obrero|P:Profesor,Piloto|R:Reportero,Recepcionista|S:Sastre,Secretario|T:Taxista,Traductor|U:Urólogo|V:Veterinario,Vendedor',
  'Comida': 'A:Arepa,Arroz|B:Buñuelo,Bandeja paisa|C:Ceviche,Chicharrón|D:Dona|E:Empanada,Ensalada|F:Fríjoles,Flan|G:Galleta,Gelatina|H:Hamburguesa,Huevo|J:Jamón,Jalea|L:Lasaña,Lentejas|M:Mazamorra,Mondongo|N:Natilla,Nachos|O:Obleas|P:Pizza,Pandebono|R:Ravioles,Rellena|S:Sancocho,Sushi|T:Tamal,Tostadas',
  'Deporte': 'A:Atletismo,Ajedrez|B:Béisbol,Baloncesto|C:Ciclismo,Canotaje|E:Esgrima,Equitación|F:Fútbol|G:Golf,Gimnasia|H:Hockey,Halterofilia|J:Judo|L:Lucha|M:Microfútbol,Motociclismo|N:Natación|P:Patinaje,Polo|R:Rugby,Remo|S:Surf,Squash|T:Tenis,Tejo|V:Voleibol,Vela',
  'Parte del cuerpo': 'A:Axila,Antebrazo|B:Brazo,Boca|C:Cabeza,Codo|D:Dedo,Diente|E:Espalda,Estómago|F:Frente|G:Garganta|H:Hombro,Hígado|I:Intestino|L:Labio,Lengua|M:Mano,Muñeca|N:Nariz,Nuca|O:Ojo,Oreja|P:Pie,Pierna|R:Rodilla,Riñón|S:Sien|T:Tobillo,Talón|U:Uña|V:Vena,Vientre',
};
const BANK = {};
for (const [cat, txt] of Object.entries(BANK_TXT)) {
  BANK[cat] = {};
  for (const part of txt.split('|')) { const [l, ws] = part.split(':'); BANK[cat][l] = ws.split(','); }
}

// sin tildes, en minúscula y sin espacios de más (para comparar)
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]/g, '').replace(/\s+/g, ' ').trim();
export const startsOk = (s, letter) => norm(s).startsWith(letter.toLowerCase());
export const isBot = (id) => /^bot\d+$/.test(id);
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 32);

export function init(ids, seed, prevWins = {}, prev = null) {
  const wins = {};
  for (const id of ids) wins[id] = prevWins[id] || 0;
  return {
    order: ids.slice(0, 4),
    cfg: prev && prev.cfg ? prev.cfg : { cats: DEFAULT_CATS.slice(), rounds: 5, time: 90 },
    phase: 'setup', rn: 0, letter: null, used: [],
    ans: {}, votes: {}, ready: {}, stopBy: null,
    res: null, total: Object.fromEntries(ids.map((id) => [id, 0])), history: [],
    tn: 1, ev: null, win: null, tie: false, wins,
    seed: seed >>> 0,
  };
}

// el anfitrión es quien hace avanzar las fases; para el motor, "el del turno" es el primero
export const current = (lg) => lg.order[0];
const humans = (lg) => lg.order.filter((id) => !isBot(id));

function phase(lg, ph) { lg.phase = ph; lg.tn++; }

function newRound(lg) {
  lg.rn++;
  lg.seed = (Math.imul(lg.seed, 1103515245) + 12345) >>> 0;
  const r = mulberry32(lg.seed);
  let pool = LETTERS.filter((l) => !lg.used.includes(l));
  if (!pool.length) { lg.used = []; pool = LETTERS.slice(); }
  lg.letter = pool[Math.floor(r() * pool.length)];
  lg.used.push(lg.letter);
  lg.ans = {};
  lg.votes = {};
  lg.ready = {};
  lg.stopBy = null;
  lg.res = null;
  lg.ev = { t: 'letter', l: lg.letter, n: lg.rn };
  phase(lg, 'spin');
}

// respuestas de los bots: palabras del banco (no siempre aciertan todas)
function botAnswers(lg) {
  const r = mulberry32((lg.seed ^ 0x9e37) >>> 0);
  for (const id of lg.order) {
    if (!isBot(id)) continue;
    lg.ans[id] = lg.cfg.cats.map((c) => {
      const ws = BANK[c] && BANK[c][lg.letter];
      if (!ws || r() < 0.25) return '';
      return ws[Math.floor(r() * ws.length)];
    });
  }
}

// ¿la respuesta (cat i, jugador id) vale? (vacía, letra equivocada o anulada por votos)
export function status(lg, i, id) {
  const a = (lg.ans[id] || [])[i] || '';
  if (!norm(a)) return 'empty';
  if (!startsOk(a, lg.letter)) return 'letter';
  const judges = humans(lg).filter((h) => h !== id);
  const against = judges.filter((h) => lg.votes[h] && lg.votes[h][`${i}|${id}`]).length;
  if (judges.length && against > judges.length / 2) return 'voted';
  return 'ok';
}
export const votesAgainst = (lg, i, id) => humans(lg).filter((h) => h !== id && lg.votes[h] && lg.votes[h][`${i}|${id}`]).length;

function score(lg) {
  const pts = {}, sum = {};
  for (const id of lg.order) { pts[id] = []; sum[id] = 0; }
  lg.cfg.cats.forEach((_, i) => {
    const ok = lg.order.filter((id) => status(lg, i, id) === 'ok');
    for (const id of lg.order) {
      let p = 0;
      if (ok.includes(id)) {
        const mine = norm(lg.ans[id][i]);
        p = ok.some((o) => o !== id && norm(lg.ans[o][i]) === mine) ? 50 : 100;
      }
      pts[id].push(p);
      sum[id] += p;
    }
  });
  for (const id of lg.order) lg.total[id] = (lg.total[id] || 0) + sum[id];
  lg.res = { letter: lg.letter, pts, sum };
  lg.history.push({ letter: lg.letter, sum });
}

function finish(lg) {
  const best = Math.max(...lg.order.map((id) => lg.total[id]));
  const top = lg.order.filter((id) => lg.total[id] === best);
  lg.win = top[0];
  lg.tie = top.length > 1;
  for (const id of top) lg.wins[id] = (lg.wins[id] || 0) + 1;
  lg.ev = { t: 'end', n: lg.rn };
  phase(lg, 'end');
}

// Acciones:
//   anfitrión: { t: 'cfg', cfg } · { t: 'start' } · { t: 'next' }
//   todos:     { t: 'ans', r, a: [...] } · { t: 'stop', r, a } · { t: 'votes', r, v: {...}, ready }
//   motor:     { t: 'tick' } (pasa de fase cuando se acaba el tiempo)
export function act(lg, pid, a, info = {}) {
  if (!a || lg.win || !lg.order.includes(pid)) return false;
  if (a.t === 'cfg') {
    if (!info.host || lg.phase !== 'setup' || !a.cfg) return false;
    const cats = [...new Set((a.cfg.cats || []).map(clean).filter(Boolean))].slice(0, MAX_CATS);
    if (cats.length < 3) return false;
    lg.cfg = { cats, rounds: [3, 5, 8].includes(a.cfg.rounds) ? a.cfg.rounds : 5, time: [60, 90, 120, 180].includes(a.cfg.time) ? a.cfg.time : 90 };
    return true;
  }
  if (a.t === 'start') {
    if (!info.host || lg.phase !== 'setup') return false;
    newRound(lg);
    return true;
  }
  if (a.t === 'ans' || a.t === 'stop') {
    if (a.r !== lg.rn || (lg.phase !== 'write' && lg.phase !== 'stop')) return false;
    if (Array.isArray(a.a)) lg.ans[pid] = lg.cfg.cats.map((_, i) => clean(a.a[i]));
    if (a.t === 'stop') {
      if (lg.phase !== 'write') return true;
      const mine = lg.ans[pid] || [];
      if (lg.cfg.cats.some((_, i) => !norm(mine[i]))) return true;   // hay que llenar todo
      lg.stopBy = pid;
      lg.ev = { t: 'stop', p: pid, n: lg.rn };
      phase(lg, 'stop');
    }
    return true;
  }
  if (a.t === 'votes') {
    if (a.r !== lg.rn || lg.phase !== 'vote' || isBot(pid)) return false;
    const v = {};
    if (a.v && typeof a.v === 'object') for (const k of Object.keys(a.v)) if (a.v[k] && /^\d+\|[\w-]+$/.test(k) && !k.endsWith('|' + pid)) v[k] = true;
    lg.votes[pid] = v;
    if (a.ready) lg.ready[pid] = true;
    if (humans(lg).every((h) => lg.ready[h])) { score(lg); lg.ev = { t: 'score', n: lg.rn }; phase(lg, 'score'); }
    return true;
  }
  if (a.t === 'next' || a.t === 'tick') {
    if (a.t === 'next' && !info.host) return false;
    if (lg.phase === 'spin') { phase(lg, 'write'); return true; }
    if (lg.phase === 'write') { lg.ev = { t: 'time', n: lg.rn }; phase(lg, 'stop'); return true; }
    if (lg.phase === 'stop') { botAnswers(lg); phase(lg, 'vote'); return true; }
    if (lg.phase === 'vote') { score(lg); lg.ev = { t: 'score', n: lg.rn }; phase(lg, 'score'); return true; }
    if (lg.phase === 'score') { if (lg.rn >= lg.cfg.rounds) finish(lg); else newRound(lg); return true; }
    return false;
  }
  return false;
}

// tiempos de cada fase (el anfitrión pasa de fase solo)
export function autoDelay(lg) {
  if (lg.phase === 'spin') return SPIN_MS;
  if (lg.phase === 'write') return lg.cfg.time * 1000;
  if (lg.phase === 'stop') return STOP_MS;
  if (lg.phase === 'vote') return VOTE_MS;
  if (lg.phase === 'score') return SCORE_MS;
  return null;   // setup: espera al anfitrión
}
export const autoMove = () => ({ t: 'tick' });
