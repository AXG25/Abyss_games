// Ventana de resultado de los juegos largos: aparece unos segundos después del
// final (para ver la última jugada, p. ej. el jaque mate) y se puede cerrar con
// "Ver el tablero" y volver a abrir con "Ver resultado".
//   endPanel(endEl, key, delay): llamar después de llenar endEl con .oc-end-box
//   endPanelHide(endEl): cuando la partida no ha terminado

function pillOf(endEl) {
  let pill = endEl.parentElement.querySelector('.end-pill');
  if (!pill) {
    pill = document.createElement('button');
    pill.className = 'btn primary end-pill';
    pill.textContent = 'Ver resultado';
    pill.hidden = true;
    pill.onclick = () => { endEl.dataset.min = ''; endEl.hidden = false; pill.hidden = true; };
    endEl.parentElement.appendChild(pill);
  }
  return pill;
}

export function endPanel(endEl, key, delay = 2000) {
  const pill = pillOf(endEl);
  const box = endEl.querySelector('.oc-end-box');
  if (box && !box.querySelector('.end-peek')) {
    box.insertAdjacentHTML('beforeend', '<button class="btn ghost sm end-peek">Ver el tablero</button>');
    box.querySelector('.end-peek').onclick = () => { endEl.dataset.min = '1'; endEl.hidden = true; pill.hidden = false; };
  }
  if (endEl.dataset.key !== key) {
    endEl.dataset.key = key;
    endEl.dataset.min = '';
    endEl.dataset.at = String(Date.now() + delay);
  }
  const wait = Number(endEl.dataset.at) - Date.now();
  if (endEl.dataset.min) { endEl.hidden = true; pill.hidden = false; return; }
  if (wait > 0) {
    // todavía mostrando la jugada final
    endEl.hidden = true;
    pill.hidden = true;
    clearTimeout(endEl._t);
    endEl._t = setTimeout(() => { if (endEl.dataset.key === key && !endEl.dataset.min) endEl.hidden = false; }, wait);
    return;
  }
  endEl.hidden = false;
  pill.hidden = true;
}

export function endPanelHide(endEl) {
  endEl.hidden = true;
  endEl.dataset.key = '';
  clearTimeout(endEl._t);
  const pill = endEl.parentElement && endEl.parentElement.querySelector('.end-pill');
  if (pill) pill.hidden = true;
}
