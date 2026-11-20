// 🌪️ Caos — pantalla. Cartas propias de 4 elementos. La parte común (reparto,
// animaciones, flechas de turno, historial, avisos) está en cardgame-ui.js; aquí
// van las cartas y lo que hace cada una. Las reglas están en caos.js.
import * as R from './caos.js';
import { ELEMS, ELEM_NAME, elemOf, kindOf } from './caos.js';
import { mountCardGame, SKIP_SVG, REV_SVG, ARROW_SVG } from './cardgame-ui.js';

export const ELEM_COLOR = { f: '#ff6b2c', a: '#1e9bff', p: '#3fbf4f', r: '#9b4dff' };
const ELEM_ICON = {
  f: '<path d="M12 2.5c1.2 3.6 5.5 5.8 5.5 10.6a5.5 5.5 0 0 1-11 0c0-2.8 1.8-4.2 2.3-6.6 1 1 1.8 2.3 1.9 3.9 1.3-2.3 1.6-5 1.3-7.9z"/>',
  a: '<path d="M12 2.5s6.8 7.6 6.8 12.3a6.8 6.8 0 0 1-13.6 0C5.2 10.1 12 2.5 12 2.5z"/>',
  p: '<path d="M4.5 19.5C4.5 10 10.5 4.5 20 4.5c0 9.5-5.5 15-15.5 15z"/><path d="M5 19L13.5 10.5" class="cut"/>',
  r: '<path d="M13.5 2L4.5 13.6h6.6L9.8 22l9.7-12.3h-6.8z"/>',
};
const elemIcon = (e, cls = 'ce-i') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ELEM_ICON[e] || ''}</svg>`;
const wheel = () => `<svg class="ca-wheel" viewBox="0 0 40 40">${ELEMS.map((e, i) => {
  const a0 = (i * Math.PI) / 2 - Math.PI / 2, a1 = a0 + Math.PI / 2;
  const p = (a) => `${20 + Math.cos(a) * 17} ${20 + Math.sin(a) * 17}`;
  return `<path d="M20 20L${p(a0)}A17 17 0 0 1 ${p(a1)}z" fill="${ELEM_COLOR[e]}"/>`;
}).join('')}<circle cx="20" cy="20" r="17" fill="none" stroke="#fff" stroke-width="2.5"/></svg>`;
const ICON_S = '<circle cx="12" cy="12" r="8.2"/><path d="M6.4 17.6L17.6 6.4"/>';
const ICON_G = '<path d="M4.5 9h12.5l-3.5-3.5M19.5 15H7l3.5 3.5"/>';
const ACTION_SVG = {
  S: `<svg class="ca-act" viewBox="0 0 24 24">${ICON_S}</svg>`,
  G: `<svg class="ca-act" viewBox="0 0 24 24">${ICON_G}</svg>`,
};
// nombre corto que va escrito en la carta
const LABEL = { S: 'Bloqueo', G: 'Dirección', X: 'Elemento', D: 'Roba 2', Y: 'Roba 4' };
// esquinas: el número o un mini icono de la acción
const cornerTxt = (k) => (/^[0-9]$/.test(k) ? k
  : k === 'S' ? `<svg class="ca-ci" viewBox="0 0 24 24">${ICON_S}</svg>`
    : k === 'G' ? `<svg class="ca-ci" viewBox="0 0 24 24">${ICON_G}</svg>`
      : k === 'X' ? '<i class="ca-cw"></i>' : k === 'D' ? '+2' : '+4');

export function cardHTML(c, extra = '') {
  const e = elemOf(c), k = kindOf(c);
  const wild = !e;
  const mid = /^[0-9]$/.test(k) ? `<b class="ca-num">${k}</b>`
    : ACTION_SVG[k] || (k === 'D' ? '<b class="ca-num sm">+2</b>' : k === 'Y' ? `${wheel()}<b class="ca-num sm over">+4</b>` : wheel());
  return `<div class="ca ${wild ? 'wild' : ''} ${extra}" data-c="${c}" style="--e:${wild ? '#2a1d52' : ELEM_COLOR[e]}">
      <span class="ca-tl">${cornerTxt(k)}</span>
      ${e ? elemIcon(e, 'ce-i ca-el') : ''}
      <span class="ca-mid">${mid}</span>
      ${LABEL[k] ? `<span class="ca-lbl">${LABEL[k]}</span>` : ''}
      <span class="ca-br">${cornerTxt(k)}</span>
    </div>`;
}
const backHTML = (extra = '') => `<div class="ca back ${extra}"><span>CAOS</span></div>`;
const KIND_NAME = { S: 'bloqueo', G: 'cambio de dirección', D: '+2', X: 'cambio de elemento', Y: '+4' };
const cardName = (c) => {
  const e = elemOf(c), k = kindOf(c);
  if (!e) return KIND_NAME[k];
  return `${/^[0-9]$/.test(k) ? k : KIND_NAME[k]} de ${ELEM_NAME[e].toLowerCase()}`;
};
const mini = (c) => `<span class="oc-mini">${cardHTML(c)}</span>`;
const elemArt = (e, cls) => `<span class="${cls}" style="color:${ELEM_COLOR[e]};--e:#1b1035">${elemIcon(e, 'sv ce-i')}</span>`;

const RULES = `
  <h3>Cómo se juega</h3>
  <p class="oc-goal">Gana quien se quede <b>sin cartas</b> primero.</p>
  <ul>
    <li>Cartas de 4 elementos: <b>fuego</b>, <b>agua</b>, <b>planta</b> y <b>rayo</b>. Cada uno recibe <b>7</b>.</li>
    <li>Juega una carta del mismo <b>elemento</b> o del mismo <b>número/acción</b> que la del centro.</li>
    <li>Si no tienes jugada, <b>roba 1</b> tocando el mazo: si sirve la puedes tirar, si no pasas.</li>
    <li>Las <b>flechas</b> entre los jugadores muestran hacia dónde va el turno; <b>Sigue</b> marca a quien juega después.</li>
    <li>Tienes <b>30 s</b> por turno; si se acaban, la máquina juega por ti.</li>
  </ul>
  <h4>Cartas especiales</h4>
  <div class="oc-pow">
    <div>${mini('fS#0')}<p><b>Bloqueo</b>El siguiente jugador pierde su turno. Con 2 jugadores, vuelves a jugar.</p></div>
    <div>${mini('aG#0')}<p><b>Dirección</b>Cambia el sentido del juego. Con 2 jugadores funciona como bloqueo.</p></div>
    <div>${mini('pD#0')}<p><b>+2</b>El siguiente roba 2… o responde con otro +2 o +4 (de cualquier elemento).</p></div>
    <div>${mini('X#0')}<p><b>Elemento</b>Va sobre cualquier carta y eliges el elemento que sigue.</p></div>
    <div>${mini('Y#0')}<p><b>+4</b>Va sobre cualquier carta, eliges el elemento y el siguiente roba 4… o responde con otro +2 o +4.</p></div>
  </div>
  <p class="oc-why"><b>¡Los +2 y +4 se suman!</b> Quien no pueda (o no quiera) responder <b>se come todo lo acumulado</b> y pierde el turno.</p>`;

const CAOS = {
  title: 'Caos',
  cls: 'ocho caos',
  css: { table: 'ca-table', deck: 'ca-deck', disc: 'ca-disc', ind: 'ca-elem', stack: 'ca-stack', hand: 'ca-hand', pick: 'ca-pick', backs: 'ca-backs' },
  R,
  cardHTML,
  backHTML,
  cardName,
  rulesHTML: RULES,
  sortKey: (c) => { const e = elemOf(c); const k = kindOf(c); return (e ? ELEMS.indexOf(e) : 4) * 20 + (/^[0-9]$/.test(k) ? +k : 10 + 'SGDXY'.indexOf(k)); },
  isPower: (c) => !/^[0-9]$/.test(kindOf(c)),
  pick: {
    needs: (c) => !elemOf(c),
    title: 'Elige el <b>elemento</b> que sigue',
    buttons: ELEMS.map((e) => `<button data-s="${e}" style="--e:${ELEM_COLOR[e]}">${elemIcon(e)}<small>${ELEM_NAME[e]}</small></button>`).join(''),
  },
  indicator: (lg) => {
    const chosen = !elemOf(R.top(lg));
    return {
      key: `${lg.elem}|${chosen}`,
      html: `<span style="background:${ELEM_COLOR[lg.elem]}">${elemIcon(lg.elem)}</span><small>${chosen ? 'Elegido' : 'Elemento'}: ${ELEM_NAME[lg.elem]}</small>`,
      hot: chosen,
    };
  },
  stackWord: 'Comer',
  takeSub: 'Por los +2 y +4 acumulados',
  // si todavía puede responder, preguntar antes de comerse todo
  confirmTake: (lg, hand) => !(lg.stack && hand.some((c) => R.canPlay(lg, c))) || confirm(`¿Comerte las ${lg.stack} cartas? Todavía puedes responder con un +2 o +4.`),
  myMsg: (lg, hand) => {
    if (lg.stack) {
      return hand.some((c) => R.canPlay(lg, c))
        ? `¡Te tiran <b>+${lg.stack}</b>! Responde con un <b>+2</b> o <b>+4</b>, o cómete todo`
        : `¡Te tiran <b>+${lg.stack}</b>! No tienes con qué responder: toca el mazo`;
    }
    return lg.drawn ? 'Puedes jugar la carta que robaste o pasar' : 'Tu turno: mismo <b>elemento</b> o mismo <b>número</b>';
  },
  waitExtra: (lg) => (lg.stack ? ` · <b class="ca-warn">van +${lg.stack}</b>` : ''),
  playExtra: (ev, F) => {
    const k = kindOf(ev.c);
    const choose = !elemOf(ev.c) ? ` y ${F.mine ? 'elegiste' : 'eligió'} ${ELEM_NAME[ev.s].toLowerCase()}` : '';
    if (k === 'D' || k === 'Y') return `${choose} · <b>van +${ev.stack}</b>${ev.to ? ` ${ev.to === F.me ? 'para ti' : `para ${F.name(ev.to)}`}` : ''}`;
    if (ev.skip) return F.two ? `${choose} · <b>${k === 'S' ? 'bloqueo' : 'dirección'}</b>: ${F.mine ? 'vuelves' : 'vuelve'} a jugar` : `${choose} · <b>bloquea</b> a ${ev.skip === F.me ? 'ti' : F.name(ev.skip)}`;
    if (ev.rev) return `${choose} · <b>cambia la dirección</b>`;
    return choose;
  },
  onPlay: (ev, F) => {
    const { who, mine, two, col, name, me, splash, sfx, buzz } = F;
    const k = kindOf(ev.c);
    const played = `${who} ${mine ? 'jugaste' : 'jugó'} ${cardName(ev.c)}`;
    const change = () => (ev.was && ev.was !== ev.s
      ? `${elemArt(ev.was, 'old')}<span class="arr">${ARROW_SVG}</span>${elemArt(ev.s, 'new')}`
      : elemArt(ev.s, 'new'));
    if (k === 'D' || k === 'Y') {
      sfx.hit(0.6 + Math.min(1, ev.stack / 12));
      if (ev.stack >= 6) sfx.warn();
      splash({
        cls: 'plus',
        who: played,
        art: `<span class="num">+${ev.stack}</span>${k === 'Y' ? elemArt(ev.s, 'new') : ''}`,
        title: ev.stack > (k === 'Y' ? 4 : 2) ? '¡Se acumula!' : k === 'Y' ? '¡Roba 4!' : '¡Roba 2!',
        sub: `${k === 'Y' ? `Ahora es <b>${ELEM_NAME[ev.s]}</b> · ` : ''}${ev.to === me ? `te comes ${ev.stack}… o responde con +2 o +4` : `${name(ev.to)} se come ${ev.stack}… o responde`}`,
        color: col,
      });
      if (ev.to === me) buzz(120);
      F.stackBump();
      if (k === 'Y') F.suitFlash();
    } else if (k === 'X') {
      sfx.coin();
      splash({
        cls: 'suit',
        who: played,
        art: change(),
        title: '¡Cambio de elemento!',
        sub: ev.was && ev.was !== ev.s ? `Ya no es <b>${ELEM_NAME[ev.was]}</b>: ahora es <b>${ELEM_NAME[ev.s]}</b>` : `Sigue siendo <b>${ELEM_NAME[ev.s]}</b>`,
        color: col,
      });
      F.suitFlash();
    } else if (ev.skip) {
      sfx.whoosh();
      splash({
        cls: 'skip',
        who: played,
        art: SKIP_SVG,
        title: k === 'S' ? '¡Bloqueo!' : '¡Dirección!',
        sub: two ? (mine ? 'Vuelves a jugar' : `${name(ev.p)} juega otra vez`) : ev.skip === me ? 'Pierdes tu turno' : `${name(ev.skip)} pierde el turno`,
        color: col,
      });
      if (ev.skip === me) buzz(80); else F.skipShake(ev.skip);
    } else if (ev.rev) {
      sfx.whoosh();
      splash({ cls: 'rev', who: played, art: REV_SVG, title: '¡Cambio de dirección!', sub: `Ahora sigue <b>${ev.next === me ? 'tú' : name(ev.next)}</b>`, color: col });
      F.revSpin();
    } else sfx.click();
  },
  onTake: (ev, F) => { F.sfx.boom(Math.min(1, 0.3 + ev.k / 16)); },
};

export function mountCaos(el, ctx) {
  return mountCardGame(el, ctx, CAOS);
}
