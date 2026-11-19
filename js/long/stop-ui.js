// ✍️ Stop — pantalla. Cada fase se dibuja una vez y luego solo se actualiza lo
// que cambia, para no borrar lo que estás escribiendo.
import { CATS, MAX_CATS, LETTERS, SPIN_MS, STOP_MS, VOTE_MS, SCORE_MS, norm, startsOk, status, votesAgainst, isBot } from './stop.js';
import { avatarSVG, validAvatar, icon } from '../icons.js';
import { endPanel, endPanelHide } from './endpanel.js';
import { esc, buzz } from '../util.js';
import { sfx, isMuted, setMuted } from '../audio.js';

const RULES = `
  <h3>Cómo se juega</h3>
  <ul>
    <li>Sale una <b>letra</b> y cada uno escribe una palabra por categoría que empiece con esa letra.</li>
    <li>Cuando llenes todo puedes gritar <b>¡STOP!</b> y se acaba la ronda para todos. Si se acaba el tiempo, también.</li>
    <li>Luego se <b>vota</b>: toca las respuestas de los demás que no valen. Se anula si la marca más de la mitad de los otros.</li>
    <li><b>100</b> puntos si nadie más puso lo mismo, <b>50</b> si se repite, <b>0</b> si está vacía, no empieza con la letra o la anularon.</li>
    <li>Gana quien tenga más puntos al final de las rondas.</li>
  </ul>`;

export function mountStop(el, ctx) {
  el.innerHTML = `
    <section class="screen stop">
      <header class="oc-top">
        <button class="btn ghost sm" id="sp-leave">${icon('back')} Salir</button>
        <b class="oc-title">Stop</b>
        <span class="oc-tools">
          <button class="btn ghost sm oc-end-btn" id="sp-stop" hidden>Terminar</button>
          <button class="mute" id="sp-help" aria-label="Reglas">?</button>
          <button class="mute" id="sp-mute">${icon(isMuted() ? 'soundOff' : 'soundOn')}</button>
        </span>
      </header>
      <div class="sp-body"></div>
      <div class="oc-pick sp-helpbox" hidden><div class="oc-pick-box pq-rules">${RULES}<button class="btn primary" id="sp-help-x">¡Entendido!</button></div></div>
      <div class="sp-flash" hidden></div>
      <div class="oc-end" hidden></div>
    </section>`;
  const $ = (s) => el.querySelector(s);
  const body = $('.sp-body'), endEl = $('.oc-end'), flash = $('.sp-flash'), helpEl = $('.sp-helpbox');

  let st = null, lg = null;
  let key = '';
  let seenTn = 0, tnAt = Date.now();
  let lastEvKey = '';
  let myVotes = {};            // votos que he marcado en esta ronda
  let sendT = 0;
  let spinIv = 0;
  let dead = false;

  $('#sp-leave').onclick = () => ctx.leave();
  $('#sp-mute').onclick = () => { setMuted(!isMuted()); $('#sp-mute').innerHTML = icon(isMuted() ? 'soundOff' : 'soundOn'); };
  $('#sp-stop').onclick = () => { if (confirm('¿Terminar la partida y volver a la sala?')) ctx.lobby(); };
  $('#sp-help').onclick = () => { helpEl.hidden = false; };
  helpEl.onclick = (e) => { if (e.target === helpEl || e.target.closest('#sp-help-x')) helpEl.hidden = true; };

  const me = () => ctx.me;
  const playing = () => lg && lg.order.includes(me());
  const player = (id) => (st.pl || []).find((p) => p.id === id) || { id, n: '¿?', a: 'frog' };
  const name = (id) => (id === me() ? 'Tú' : esc(player(id).n));
  const send = (a) => ctx.act({ ...a, tn: lg.tn });
  const left = (ms) => Math.max(0, ms - (Date.now() - tnAt));
  const chip = (id, extra = '') => `<span class="sp-chip" style="--c:${ctx.colorOf(id)}"><span class="oc-av">${avatarSVG(validAvatar(player(id).a))}</span>${name(id)}${extra}</span>`;

  // ---------------------------------------------------------------- setup
  function renderSetup() {
    const host = ctx.isHost();
    const cats = lg.cfg.cats;
    const all = [...CATS, ...cats.filter((c) => !CATS.includes(c))];
    body.innerHTML = host ? `
      <div class="card sp-setup">
        <p class="sp-h">Elige las categorías <small class="sp-ncat"></small></p>
        <div class="sp-cats"></div>
        <form class="sp-add"><input id="sp-new" maxlength="24" placeholder="Agregar otra categoría…" autocomplete="off"><button class="btn sm primary">Agregar</button></form>
        <div class="row"><span class="lbl">Rondas</span><div class="seg" id="sp-rounds">${[3, 5, 8].map((n) => `<button data-n="${n}">${n}</button>`).join('')}</div></div>
        <div class="row"><span class="lbl">Tiempo</span><div class="seg" id="sp-time">${[60, 90, 120, 180].map((n) => `<button data-n="${n}">${n < 120 ? n + ' s' : n / 60 + ' min'}</button>`).join('')}</div></div>
        <button class="btn big primary" id="sp-go">${icon('rocket')} ¡Empezar!</button>
      </div>` : `
      <div class="card sp-setup">
        <p class="sp-h">El anfitrión ${icon('crown')} está eligiendo las categorías…</p>
        <div class="sp-cats ro"></div>
        <p class="hint sp-conf"></p>
        <div class="dots"><i></i><i></i><i></i></div>
      </div>`;
    body.dataset.all = JSON.stringify(all);
    if (host) {
      const sendCfg = (cfg) => send({ t: 'cfg', cfg: { ...lg.cfg, ...cfg } });
      $('.sp-cats').onclick = (e) => {
        const b = e.target.closest('[data-c]');
        if (!b) return;
        const c = b.dataset.c;
        const on = lg.cfg.cats.includes(c);
        if (on && lg.cfg.cats.length <= 3) { sfx.click(); return; }
        if (!on && lg.cfg.cats.length >= MAX_CATS) { sfx.click(); return; }
        sendCfg({ cats: on ? lg.cfg.cats.filter((x) => x !== c) : [...lg.cfg.cats, c] });
        sfx.tick();
      };
      $('.sp-add').onsubmit = (e) => {
        e.preventDefault();
        const v = $('#sp-new').value.replace(/\s+/g, ' ').trim();
        if (!v || lg.cfg.cats.length >= MAX_CATS) return;
        const all2 = JSON.parse(body.dataset.all);
        if (!all2.includes(v)) body.dataset.all = JSON.stringify([...all2, v]);
        if (!lg.cfg.cats.includes(v)) sendCfg({ cats: [...lg.cfg.cats, v] });
        $('#sp-new').value = '';
      };
      $('#sp-rounds').onclick = (e) => { const b = e.target.closest('[data-n]'); if (b) sendCfg({ rounds: +b.dataset.n }); };
      $('#sp-time').onclick = (e) => { const b = e.target.closest('[data-n]'); if (b) sendCfg({ time: +b.dataset.n }); };
      $('#sp-go').onclick = () => send({ t: 'start' });
    }
    updateSetup();
  }
  function updateSetup() {
    const cats = lg.cfg.cats;
    const all = JSON.parse(body.dataset.all || '[]');
    for (const c of cats) if (!all.includes(c)) all.push(c);
    body.dataset.all = JSON.stringify(all);
    const box = $('.sp-cats');
    if (!box) return;
    box.innerHTML = (box.classList.contains('ro') ? cats : all).map((c) => `<button data-c="${esc(c)}" class="${cats.includes(c) ? 'on' : ''}">${esc(c)}</button>`).join('');
    const n = $('.sp-ncat'); if (n) n.textContent = `(${cats.length}/${MAX_CATS})`;
    el.querySelectorAll('#sp-rounds [data-n]').forEach((b) => b.classList.toggle('sel', +b.dataset.n === lg.cfg.rounds));
    el.querySelectorAll('#sp-time [data-n]').forEach((b) => b.classList.toggle('sel', +b.dataset.n === lg.cfg.time));
    const conf = $('.sp-conf'); if (conf) conf.textContent = `${lg.cfg.rounds} rondas · ${lg.cfg.time} s por ronda`;
  }

  // ---------------------------------------------------------------- letra
  function renderSpin() {
    body.innerHTML = `<div class="sp-spin"><small>Ronda ${lg.rn} de ${lg.cfg.rounds}</small><div class="sp-letter big">?</div><p>La letra es…</p></div>`;
    const L = $('.sp-letter');
    clearInterval(spinIv);
    const t0 = Date.now();
    spinIv = setInterval(() => {
      if (dead) { clearInterval(spinIv); return; }
      if (Date.now() - t0 > SPIN_MS - 700) { clearInterval(spinIv); L.textContent = lg.letter; L.classList.add('land'); sfx.big(); buzz(60); return; }
      L.textContent = LETTERS[Math.floor(Math.random() * LETTERS.length)];
      sfx.tick(0.5);
    }, 90);
  }

  // ---------------------------------------------------------------- escribir
  const myAnswers = () => [...el.querySelectorAll('.sp-in input')].map((i) => i.value);
  const flushAnswers = () => { clearTimeout(sendT); if (playing() && lg.rn && $('.sp-in')) send({ t: 'ans', r: lg.rn, a: myAnswers() }); };
  function renderWrite() {
    const L = lg.letter;
    const prev = (lg.ans[me()] || []);
    body.innerHTML = `
      <div class="sp-top">
        <div class="sp-letter">${L}</div>
        <div class="sp-topr">
          <small>Ronda ${lg.rn} de ${lg.cfg.rounds} · palabras con <b>${L}</b></small>
          <div class="sp-time"><i></i><span></span></div>
          <div class="sp-prog"></div>
        </div>
      </div>
      ${playing() ? `<form class="sp-form" autocomplete="off">${lg.cfg.cats.map((c, i) => `
        <label class="sp-in"><span>${esc(c)}</span><input data-i="${i}" maxlength="32" autocapitalize="words" autocorrect="off" spellcheck="false" placeholder="${L}…" value="${esc(prev[i] || '')}"></label>`).join('')}
      </form>
      <button class="btn big sp-stopbtn" id="sp-go" disabled>¡STOP!</button>` : '<p class="hint">Estás mirando la ronda</p>'}`;
    const form = $('.sp-form');
    if (!form) return;
    const check = () => {
      let full = true;
      el.querySelectorAll('.sp-in input').forEach((inp) => {
        const v = inp.value;
        const has = !!norm(v);
        if (!has) full = false;
        inp.parentElement.classList.toggle('good', has && startsOk(v, L));
        inp.parentElement.classList.toggle('bad', has && !startsOk(v, L));
      });
      const b = $('#sp-go');
      if (b) { b.disabled = !full || lg.phase !== 'write'; b.textContent = full ? '¡STOP!' : 'Llena todo para gritar ¡STOP!'; }
    };
    form.addEventListener('input', () => { check(); clearTimeout(sendT); sendT = setTimeout(flushAnswers, 700); });
    form.addEventListener('focusout', flushAnswers);
    form.addEventListener('submit', (e) => e.preventDefault());
    // Enter pasa a la siguiente casilla
    form.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const i = +e.target.dataset.i;
      const nx = el.querySelector(`.sp-in input[data-i="${i + 1}"]`);
      if (nx) nx.focus(); else e.target.blur();
    });
    $('#sp-go').onclick = () => { if (lg.phase === 'write') { clearTimeout(sendT); send({ t: 'stop', r: lg.rn, a: myAnswers() }); } };
    check();
    updateWrite();
  }
  function updateWrite() {
    const prog = $('.sp-prog');
    if (prog) {
      prog.innerHTML = lg.order.filter((id) => id !== me()).map((id) => {
        const n = (lg.ans[id] || []).filter((x) => norm(x)).length;
        return chip(id, ` <b>${isBot(id) ? '…' : `${n}/${lg.cfg.cats.length}`}</b>`);
      }).join('');
    }
    const stopped = lg.phase !== 'write';
    el.querySelectorAll('.sp-in input').forEach((i) => { i.disabled = stopped; });
    const b = $('#sp-go'); if (b && stopped) b.disabled = true;
  }

  // ---------------------------------------------------------------- votar
  function renderVote() {
    const L = lg.letter;
    myVotes = { ...((lg.votes || {})[me()] || {}) };
    body.innerHTML = `
      <div class="sp-top">
        <div class="sp-letter">${L}</div>
        <div class="sp-topr">
          <small>Ronda ${lg.rn}: <b>revisen las respuestas</b></small>
          <div class="sp-time"><i></i><span></span></div>
          <div class="sp-prog sp-ready"></div>
        </div>
      </div>
      <p class="hint">${playing() ? 'Toca las respuestas de los demás que <b>no valen</b>. Se anulan si la mayoría está de acuerdo.' : 'Los jugadores están votando…'}</p>
      <div class="sp-vote">${lg.cfg.cats.map((c, i) => `
        <div class="card sp-vc"><b class="sp-vt">${esc(c)}</b>${lg.order.map((id) => `
          <button class="sp-row" data-k="${i}|${id}" ${id === me() || !playing() ? 'disabled' : ''} style="--c:${ctx.colorOf(id)}">
            <i class="sp-dot"></i><span class="sp-who">${name(id)}</span><span class="sp-a"></span><span class="sp-tag"></span>
          </button>`).join('')}
        </div>`).join('')}
      </div>
      ${playing() ? '<button class="btn big primary" id="sp-ready">Listo</button>' : ''}`;
    const voteBox = $('.sp-vote');
    voteBox.onclick = (e) => {
      const b = e.target.closest('.sp-row');
      if (!b || b.disabled || lg.phase !== 'vote') return;
      const k = b.dataset.k;
      if (myVotes[k]) delete myVotes[k]; else myVotes[k] = true;
      sfx.tick();
      send({ t: 'votes', r: lg.rn, v: myVotes, ready: !!lg.ready[me()] });
      updateVote();
    };
    const rb = $('#sp-ready');
    if (rb) rb.onclick = () => { send({ t: 'votes', r: lg.rn, v: myVotes, ready: true }); sfx.pass(); };
    updateVote();
  }
  function updateVote() {
    const ok = {};
    lg.cfg.cats.forEach((_, i) => { ok[i] = lg.order.filter((id) => status(lg, i, id) === 'ok').map((id) => norm(lg.ans[id][i])); });
    el.querySelectorAll('.sp-row').forEach((b) => {
      const [i, id] = b.dataset.k.split('|');
      const ans = (lg.ans[id] || [])[+i] || '';
      const s = status(lg, +i, id);
      const v = votesAgainst(lg, +i, id);
      const rep = s === 'ok' && ok[i].filter((x) => x === norm(ans)).length > 1;
      b.querySelector('.sp-a').textContent = ans || '—';
      b.querySelector('.sp-tag').innerHTML = s === 'empty' ? '' : s === 'letter' ? `<em>no empieza con ${lg.letter}</em>` : s === 'voted' ? `<em>anulada ✕${v}</em>` : `${rep ? '<small>repetida</small>' : ''}${v ? `<em class="soft">✕${v}</em>` : ''}`;
      b.classList.toggle('mine', !!myVotes[b.dataset.k]);
      b.classList.toggle('dead', s !== 'ok');
    });
    const rd = $('.sp-ready');
    if (rd) rd.innerHTML = lg.order.filter((id) => !isBot(id)).map((id) => chip(id, lg.ready[id] ? ` ${icon('check')}` : ' …')).join('');
    const rb = $('#sp-ready');
    if (rb) { const r = !!lg.ready[me()]; rb.textContent = r ? 'Listo ✓ — esperando a los demás' : 'Listo'; rb.classList.toggle('ghost', r); }
  }

  // ---------------------------------------------------------------- puntos
  function renderScore() {
    const res = lg.res;
    const last = lg.rn >= lg.cfg.rounds;
    const rank = lg.order.slice().sort((a, b) => lg.total[b] - lg.total[a]);
    body.innerHTML = `
      <div class="sp-top"><div class="sp-letter">${res.letter}</div><div class="sp-topr"><small>Ronda ${lg.rn} de ${lg.cfg.rounds}</small><b class="sp-h">Puntos de la ronda</b></div></div>
      <div class="card sp-board">${rank.map((id, i) => `
        <div class="sp-sc" style="--c:${ctx.colorOf(id)}"><b>${i + 1}</b>${chip(id)}<span class="sp-plus">+${res.sum[id]}</span><span class="sp-tot">${lg.total[id]}</span></div>`).join('')}
      </div>
      <div class="card sp-table">
        <table><thead><tr><th></th>${lg.order.map((id) => `<th style="color:${ctx.colorOf(id)}">${name(id)}</th>`).join('')}</tr></thead>
        <tbody>${lg.cfg.cats.map((c, i) => `<tr><td>${esc(c)}</td>${lg.order.map((id) => {
          const p = res.pts[id][i];
          const a = (lg.ans[id] || [])[i] || '';
          return `<td class="p${p}"><span>${esc(a) || '—'}</span><b>${p}</b></td>`;
        }).join('')}</tr>`).join('')}</tbody></table>
      </div>
      <div class="sp-next">${ctx.isHost() ? `<button class="btn big primary" id="sp-next">${last ? 'Ver resultados' : 'Siguiente ronda'} <span class="sp-cd"></span></button>` : `<p class="hint">${last ? 'Resultados' : 'Siguiente ronda'} en <span class="sp-cd"></span></p>`}</div>`;
    const nb = $('#sp-next');
    if (nb) nb.onclick = () => send({ t: 'next' });
  }

  // ---------------------------------------------------------------- final
  function paintEnd() {
    if (!lg.win) { endPanelHide(endEl); return; }
    
    const rank = lg.order.slice().sort((a, b) => lg.total[b] - lg.total[a]);
    const won = lg.total[me()] === lg.total[lg.win] && playing();
    endEl.innerHTML = `
      <div class="oc-end-box">
        <div class="oc-end-av" style="--c:${ctx.colorOf(lg.win)}">${avatarSVG(validAvatar(player(lg.win).a))}</div>
        <h2>${icon('trophy')} ${lg.tie ? (won ? '¡Empate y ganas!' : '¡Empate!') : won ? '¡Ganaste!' : `¡Ganó ${esc(player(lg.win).n)}!`}</h2>
        <p class="cz-why">${lg.cfg.rounds} rondas · letras ${lg.history.map((h) => h.letter).join(' ')}</p>
        <ol class="oc-rank">${rank.map((id, i) => `<li style="--c:${ctx.colorOf(id)}"><b>${i + 1}</b><span>${esc(player(id).n)}${id === me() ? ' (tú)' : ''}</span><small>${lg.total[id]} pts</small><em>${icon('trophy')} ${lg.wins[id] || 0}</em></li>`).join('')}</ol>
        ${ctx.isHost()
          ? `<button class="btn big primary" id="sp-again">${icon('repeat')} Otra partida</button><button class="btn ghost" id="sp-lobby">Volver a la sala</button>`
          : '<p class="hint">Esperando al anfitrión para otra partida…</p>'}
      </div>`;
    if (ctx.isHost()) { $('#sp-again').onclick = () => ctx.again(); $('#sp-lobby').onclick = () => ctx.lobby(); }
    endPanel(endEl, `${lg.tn}:${lg.win}`, 1500);
  }

  function showFlash(html, ms = 1600) {
    flash.innerHTML = html;
    flash.hidden = false;
    flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
    setTimeout(() => { flash.hidden = true; }, ms);
  }

  function onEvent() {
    const k = JSON.stringify([lg.ev, lg.phase]);
    if (k === lastEvKey) return;
    const first = lastEvKey === '';
    lastEvKey = k;
    if (first) return;
    if (lg.phase === 'stop') {
      flushAnswers();
      if (lg.stopBy) { showFlash(`¡STOP!<small>${lg.stopBy === me() ? 'lo gritaste tú' : `lo gritó ${esc(player(lg.stopBy).n)}`}</small>`, STOP_MS); sfx.warn(); buzz(300); }
      else { showFlash('¡Se acabó el tiempo!', STOP_MS); sfx.bell(); buzz(200); }
    }
    if (lg.phase === 'write') { sfx.go(); }
    if (lg.phase === 'vote') sfx.pass();
    if (lg.phase === 'score') sfx.coin();
    if (lg.phase === 'end') setTimeout(() => { if (lg.total[me()] === lg.total[lg.win]) sfx.win(); else sfx.out(0.6); }, 300);
  }

  function render() {
    const k = `${lg.phase === 'stop' ? 'write' : lg.phase}:${lg.rn}`;
    if (k !== key) {
      // al salir de escribir, mandar lo último
      if (key.startsWith('write') && lg.phase !== 'write' && lg.phase !== 'stop') flushAnswers();
      key = k;
      if (lg.phase === 'setup') renderSetup();
      else if (lg.phase === 'spin') renderSpin();
      else if (lg.phase === 'write' || lg.phase === 'stop') renderWrite();
      else if (lg.phase === 'vote') renderVote();
      else if (lg.phase === 'score' || lg.phase === 'end') { if (lg.res) renderScore(); }
      window.scrollTo(0, 0);
    } else if (lg.phase === 'setup') updateSetup();
    else if (lg.phase === 'write' || lg.phase === 'stop') updateWrite();
    else if (lg.phase === 'vote') updateVote();
    paintEnd();
    $('#sp-stop').hidden = !ctx.isHost() || !!lg.win;
  }

  // relojes
  const iv = setInterval(() => {
    if (dead || !lg) return;
    const total = lg.phase === 'write' ? lg.cfg.time * 1000 : lg.phase === 'vote' ? VOTE_MS : 0;
    const t = $('.sp-time');
    if (t && total) {
      const ms = left(total);
      t.querySelector('i').style.transform = `scaleX(${ms / total})`;
      t.querySelector('span').textContent = `${Math.ceil(ms / 1000)} s`;
      t.classList.toggle('low', ms < 10000);
      if (lg.phase === 'write' && ms < 10000 && ms > 0 && Math.floor(ms / 1000) !== Math.floor((ms + 250) / 1000)) sfx.tick();
    }
    const cd = $('.sp-cd');
    if (cd && lg.phase === 'score') cd.textContent = `(${Math.ceil(left(SCORE_MS) / 1000)})`;
  }, 250);

  return {
    update(nst) {
      st = nst;
      lg = nst.lg;
      if (!lg) return;
      if (lg.tn !== seenTn) { seenTn = lg.tn; tnAt = Date.now(); }
      onEvent();
      render();
    },
    destroy() { dead = true; clearInterval(iv); clearInterval(spinIv); clearTimeout(sendT); },
  };
}
