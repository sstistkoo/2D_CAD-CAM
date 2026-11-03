// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Číselné zadání: vlastní číselník (dotykové displeje) ║
// ║  1 2 3 4 5 6 7 8 / 9 0 . − ⌫ ⌨ Další OK                      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Píše do posledního pole, do kterého uživatel klepl (X1, Z1, Délka…, nebo do
// zápisu G-kódu). Systémová klávesnice se pak nevysouvá (inputmode="none") a
// nezakrývá plátno; ⌨ ji pro pole vrátí (třeba na výraz 50/2). Volba se pamatuje.

const KEY_SYS = 'skica-numpad-syskb';
const isTouch = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

/**
 * Vloží text na místo kurzoru / výběru pole a ohlásí změnu (input event).
 * @param {HTMLInputElement|HTMLTextAreaElement} el
 * @param {string} text  '' = smazat výběr, nebo znak před kurzorem (backspace)
 */
export function typeInto(el, text) {
  let s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? s;
  if (!text && s === e) { if (s === 0) return; s -= 1; }
  el.setRangeText(text, s, e, 'end');
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * @param {HTMLElement} container  obsah záložky Číselné zadání
 */
export function attachNumPad(container) {
  const fields = container.querySelector('#numFields');
  if (!fields || !isTouch() || container.querySelector('.num-pad')) return;
  const gcode = container.querySelector('[data-id="num-gcode"]');
  let sysKb = false;
  try { sysKb = localStorage.getItem(KEY_SYS) === '1'; } catch { /* bez úložiště */ }
  let target = null;

  // Pořadí jako na obrazovce (řádky shora, v řádku zleva) – v DOM může být Z před X.
  const inputs = () => [...fields.querySelectorAll('input[type="text"]')]
    .filter(i => i.offsetParent !== null && !i.disabled)
    .map(i => ({ i, r: i.getBoundingClientRect() }))
    .sort((a, b) => (Math.abs(a.r.top - b.r.top) > 8 ? a.r.top - b.r.top : a.r.left - b.r.left))
    .map(o => o.i);
  const applyMode = () => fields.querySelectorAll('input[type="text"]')
    .forEach(i => i.setAttribute('inputmode', sysKb ? 'decimal' : 'none'));

  const pad = document.createElement('div');
  pad.className = 'num-pad';
  const keys = [..."12345678", '9', '0', '.', '-', 'bs', 'kb', 'next', 'ok'];   // číslice postupně 1…0
  const label = { '-': '−', bs: '⌫', kb: '⌨', next: 'Další', ok: 'OK' };
  const title = { '-': 'Mínus', '.': 'Desetinná tečka', bs: 'Smazat znak', kb: 'Systémová klávesnice zap / vyp', next: 'Další pole', ok: 'OK – vloží objekt (jako tlačítko OK nahoře)' };
  pad.innerHTML = keys.map(k =>
    `<button type="button" class="num-pad-key${k === 'next' ? ' num-pad-next' : ''}${k === 'ok' ? ' num-pad-ok' : ''}${k === 'bs' ? ' num-pad-bs' : ''}" data-pad="${k}" title="${title[k] || 'Číslice ' + k}">${label[k] || k}</button>`).join('');
  fields.after(pad);

  const syncKbBtn = () => pad.querySelector('[data-pad="kb"]').classList.toggle('on', sysKb);
  syncKbBtn();
  applyMode();
  // Formulář se přepisuje při změně typu i po každém OK → nová pole znovu nastavit.
  new MutationObserver(applyMode).observe(fields, { childList: true, subtree: true });

  container.addEventListener('focusin', (e) => {
    const t = e.target;
    if ((t.matches?.('input[type="text"]') && fields.contains(t)) || t === gcode) target = t;
  });

  // Klávesy nesmí brát fokus poli (blur by vyhodnotil výraz a zrušil výběr).
  pad.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  pad.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  pad.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pad]');
    if (!b) return;
    const k = b.dataset.pad;
    if (k === 'ok') { container.querySelector('#numOk')?.click(); return; }
    if (!target || !container.contains(target)) target = inputs()[0] || null;
    if (!target) return;
    if (k === 'kb') {
      sysKb = !sysKb;
      try { localStorage.setItem(KEY_SYS, sysKb ? '1' : '0'); } catch { /* bez úložiště */ }
      applyMode(); syncKbBtn();
      target.blur(); target.focus();   // nový inputmode platí až od dalšího fokusu
      return;
    }
    if (k === 'next') {
      const list = inputs();
      const nx = list[(list.indexOf(target) + 1) % list.length];
      if (nx) { nx.focus(); nx.select?.(); }
      return;
    }
    if (document.activeElement !== target) target.focus();
    typeInto(target, k === 'bs' ? '' : k);
  });
}
