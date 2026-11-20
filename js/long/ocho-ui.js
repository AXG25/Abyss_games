// 🃏 Ocho loco — pantalla. La parte común (reparto, animaciones, flechas de turno,
// historial, avisos) está en cardgame-ui.js; aquí van las cartas francesas y lo
// que hace cada carta especial. Las reglas están en ocho.js.
import * as R from './ocho.js';
import { SUITS, SUIT_NAME, suitOf, rankOf } from './ocho.js';
import { mountCardGame, SKIP_SVG, REV_SVG, ARROW_SVG } from './cardgame-ui.js';

const SUIT_SVG = {
  H: '<path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.9 4.5 6.6 4.5c2.2 0 3.6 1.2 4.4 2.5.8-1.3 2.2-2.5 4.4-2.5 3.7 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z"/>',
  D: '<path d="M12 2l8 10-8 10-8-10z"/>',
  C: '<circle cx="12" cy="7" r="4.3"/><circle cx="6.8" cy="13.4" r="4.3"/><circle cx="17.2" cy="13.4" r="4.3"/><path d="M11 13h2l1.6 9h-5.2z"/>',
  S: '<path d="M12 2s8 6.5 8 11.5c0 2.6-2 4.5-4.4 4.5-1.4 0-2.6-.6-3.2-1.6l1.4 5.6h-3.6l1.4-5.6c-.6 1-1.8 1.6-3.2 1.6C6 18 4 16.1 4 13.5 4 8.5 12 2 12 2z"/>',
};
const suitIcon = (s, cls = 'sv') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${SUIT_SVG[s] || ''}</svg>`;
const red = (s) => s === 'H' || s === 'D';
const RANK_TXT = { A: 'A', J: 'J', Q: 'Q', K: 'K' };
const RANK_ORD = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_NAME = { A: 'As', J: 'J', Q: 'Q', K: 'K' };

// lo que hace cada carta especial (etiqueta en las cartas de la mano)
const power = (c, players) => {
  const k = rankOf(c);
  if (k === '2') return '+2';
  if (k === '8') return 'Comodín';
  if (k === 'J') return 'Salta';
  if (k === 'Q') return players === 2 ? 'Salta' : 'Reversa';
  return '';
};

export function cardHTML(c, extra = '', hand = false, players = 3) {
  const s = suitOf(c), k = rankOf(c);
  const pow = hand ? power(c, players) : '';
  return `<div class="pc ${red(s) ? 'red' : 'blk'} ${extra}" data-c="${c}">
      <span class="pc-tl"><b>${RANK_TXT[k] || k}</b>${suitIcon(s)}</span>
      <span class="pc-mid">${k === '8' ? '<b class="pc-8">8</b>' : suitIcon(s, 'sv big')}</span>
      <span class="pc-br"><b>${RANK_TXT[k] || k}</b>${suitIcon(s)}</span>
      ${pow ? `<span class="pc-pow">${pow}</span>` : ''}
    </div>`;
}
const backHTML = (extra = '') => `<div class="pc back ${extra}"><span></span></div>`;
const cardName = (c) => `${RANK_NAME[rankOf(c)] || rankOf(c)} de ${SUIT_NAME[suitOf(c)].toLowerCase()}`;
const mini = (c) => `<span class="oc-mini">${cardHTML(c)}</span>`;

const RULES = `
  <h3>Cómo se juega</h3>
  <p class="oc-goal">Gana quien se quede <b>sin cartas</b> primero.</p>
  <ul>
    <li>Se reparten <b>7 cartas</b> (6 si son 4 jugadores) y se voltea una al centro.</li>
    <li>En tu turno juega una carta del mismo <b>palo</b> o del mismo <b>número</b> que la del centro.</li>
    <li>Si no puedes (o no quieres), <b>roba 1</b> tocando el mazo. Si te sirve, puedes jugarla en ese turno; si no, pasa el turno.</li>
    <li>Las <b>flechas</b> entre los jugadores muestran hacia dónde va el turno; <b>Sigue</b> marca a quien juega después.</li>
    <li>Cuando se acaba el mazo, se barajan las cartas jugadas.</li>
    <li>Tienes <b>30 s</b> por turno; si se acaban, la máquina juega por ti.</li>
  </ul>
  <h4>Cartas especiales</h4>
  <div class="oc-pow">
    <div>${mini('H8')}<p><b>8 · Comodín</b>Va sobre cualquier carta y tú eliges el palo que sigue.</p></div>
    <div>${mini('S2')}<p><b>2 · Roba 2</b>El siguiente roba 2… o responde con otro 2 y se suman (+4, +6…). Quien no tenga un 2 se come todo y pierde el turno.</p></div>
    <div>${mini('DJ')}<p><b>J · Salta</b>El siguiente jugador pierde su turno. Con 2 jugadores, vuelves a jugar.</p></div>
    <div>${mini('CQ')}<p><b>Q · Reversa</b>Cambia el sentido del juego. Con 2 jugadores funciona como la J: vuelves a jugar.</p></div>
  </div>
  <p class="oc-why"><b>¿Por qué alguien juega dos veces seguidas?</b> Porque robó una carta que le sirvió y la jugó, o porque salió una J (o una Q con 2 jugadores) y se saltó al siguiente. Abajo de la mesa se ven las últimas jugadas.</p>`;

const OCHO = {
  title: 'Ocho loco',
  cls: 'ocho',
  R,
  cardHTML,
  backHTML,
  cardName,
  rulesHTML: RULES,
  sortKey: (c) => SUITS.indexOf(suitOf(c)) * 20 + RANK_ORD.indexOf(rankOf(c)),
  isPower: (c) => ['2', '8', 'J', 'Q'].includes(rankOf(c)),
  pick: {
    needs: (c) => rankOf(c) === '8',
    title: 'Jugaste un <b>8</b>: elige el palo que sigue',
    buttons: SUITS.map((s) => `<button data-s="${s}" class="${red(s) ? 'red' : 'blk'}">${suitIcon(s)}<small>${SUIT_NAME[s]}</small></button>`).join(''),
  },
  indicator: (lg) => {
    const changed = rankOf(R.top(lg)) === '8';
    return {
      key: `${lg.suit}|${changed}`,
      html: `<span class="${red(lg.suit) ? 'red' : 'blk'}">${suitIcon(lg.suit)}</span><small>${changed ? 'Palo elegido' : 'Palo'}: ${SUIT_NAME[lg.suit]}</small>`,
      hot: changed,
    };
  },
  stackWord: 'Roba',
  takeSub: 'Por los +2 acumulados',
  myMsg: (lg) => (lg.stack
    ? `¡Te toca robar ${lg.stack}! O responde con un <b>2</b>`
    : lg.drawn ? 'Puedes jugar la carta que robaste o pasar'
      : 'Tu turno: mismo <b>palo</b> o mismo <b>número</b>. El <b>8</b> sirve siempre'),
  // lo que se agrega al historial después de "jugó …"
  playExtra: (ev, F) => {
    const k = rankOf(ev.c);
    if (k === '8') return ` y pidió ${SUIT_NAME[ev.s].toLowerCase()}`;
    if (k === '2' && ev.to) return ` · <b>+${ev.sum || 2}</b> ${ev.to === F.me ? 'para ti' : `para ${F.name(ev.to)}`}`;
    if (ev.skip) return F.two ? ` · <b>salta</b>: ${F.mine ? 'vuelves' : 'vuelve'} a jugar` : ` · <b>salta</b> a ${ev.skip === F.me ? 'ti' : F.name(ev.skip)}`;
    if (ev.rev) return ' · <b>cambia el sentido</b>';
    return '';
  },
  // avisos grandes y sonidos de cada carta especial
  onPlay: (ev, F) => {
    const { who, mine, two, col, name, me, splash, sfx, buzz } = F;
    const k = rankOf(ev.c);
    const played = (art) => `${who} ${mine ? 'jugaste' : 'jugó'} ${art}`;
    if (k === '8') {
      sfx.coin();
      const was = ev.was || ev.s;
      splash({
        cls: 'suit',
        who: played('un 8'),
        art: was !== ev.s ? `<span class="old ${red(was) ? 'red' : 'blk'}">${suitIcon(was)}</span><span class="arr">${ARROW_SVG}</span><span class="new ${red(ev.s) ? 'red' : 'blk'}">${suitIcon(ev.s)}</span>` : `<span class="new ${red(ev.s) ? 'red' : 'blk'}">${suitIcon(ev.s)}</span>`,
        title: '¡Cambio de palo!',
        sub: was !== ev.s ? `Ya no es <b>${SUIT_NAME[was]}</b>: ahora es <b>${SUIT_NAME[ev.s]}</b>` : `Sigue siendo <b>${SUIT_NAME[ev.s]}</b>`,
        color: col,
      });
      F.suitFlash();
    } else if (k === '2') {
      sfx.hit(0.7);
      splash({
        cls: 'plus',
        who: played('un 2'),
        art: `<span class="num">+${ev.sum || 2}</span>`,
        title: (ev.sum || 2) > 2 ? '¡Se acumula!' : '¡Roba 2!',
        sub: ev.to === me ? `Te toca robar ${ev.sum}… o responde con un <b>2</b>` : `${name(ev.to)} roba ${ev.sum}… o responde con un <b>2</b>`,
        color: col,
      });
      if (ev.to === me) buzz(120);
      F.stackBump();
    } else if (ev.skip) {
      sfx.whoosh();
      splash({
        cls: 'skip',
        who: played(k === 'J' ? 'una J' : 'una Q'),
        art: SKIP_SVG,
        title: k === 'J' ? '¡Salta!' : '¡Reversa!',
        sub: two ? (mine ? 'Vuelves a jugar' : `${name(ev.p)} juega otra vez`) : ev.skip === me ? 'Pierdes tu turno' : `${name(ev.skip)} pierde el turno`,
        color: col,
      });
      if (ev.skip === me) buzz(80); else F.skipShake(ev.skip);
    } else if (ev.rev) {
      sfx.whoosh();
      splash({ cls: 'rev', who: played('una Q'), art: REV_SVG, title: '¡Cambio de sentido!', sub: `Ahora sigue <b>${ev.next === me ? 'tú' : name(ev.next)}</b>`, color: col });
      F.revSpin();
    } else sfx.click();
  },
};

export function mountOcho(el, ctx) {
  return mountCardGame(el, ctx, OCHO);
}
