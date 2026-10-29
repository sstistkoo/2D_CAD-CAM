// Lišta ŘEZU v panelu Pohled na čelo (CAM): Z roviny pohledu (políčko +
// posuvník s přichycením k osazením a k čelům operací) a strana pohledu
// ◀ zprava / ▶ zleva (šipka = směr pohledu) — jako lišta čela v CAD, ale
// uvnitř panelu (nezakrývá G-kód). Schovává se tlačítkem v hlavičce.
// ⇥ Vrtat odsud: Z čela operace do čela = rovina řezu (api.startHere).
import { safeEvalMath } from '../../../utils.js';
import { snapZ } from './liveCut.js';

let _uid = 0;

/**
 * @param host element, do kterého se lišta vloží
 * @param api { get(): {z, side, min, max, ticks[]}, setZ(z, {manualSide}), toggleSide(), toast(msg), startHere() }
 * @returns {{ el, update() }}
 */
export function createCutBar(host, api) {
  const id = `camLiveTicks${++_uid}`;
  const el = document.createElement('div');
  el.className = 'cam-live-bar';
  el.innerHTML = `
    <label title="Z roviny řezu (lze zadat i výraz)">Z <input data-cut="z" type="text" inputmode="decimal" autocomplete="off"></label>
    <input data-cut="range" type="range" list="${id}" title="Posun roviny řezu po dílu — přichytí se k osazením a čelům operací">
    <datalist id="${id}"></datalist>
    <button data-cut="side" title="Odkud se na řez dívá: ◀ zprava (k −Z) / ▶ zleva (k +Z). Šipka = směr pohledu"></button>
    <button data-cut="start" title="Vrtat odsud: Z čela operace do čela = tahle rovina řezu, strana podle směru pohledu (vybraná operace v 🛠 Operace, jinak zaškrtnuté díry)">⇥ Vrtat odsud</button>`;
  host.appendChild(el);
  const zIn = el.querySelector('[data-cut="z"]');
  const range = el.querySelector('[data-cut="range"]');
  const ticks = el.querySelector('datalist');
  const sideBtn = el.querySelector('[data-cut="side"]');

  range.addEventListener('input', () => {
    const s = api.get();
    // Přichycení do 1,5 % rozsahu (min. 0,2 mm) jako posuvník čela v CAD.
    const tol = Math.max(0.2, (s.max - s.min) * 0.015);
    api.setZ(snapZ(parseFloat(range.value), s.ticks, tol));
  });
  zIn.addEventListener('change', () => {
    const v = safeEvalMath(zIn.value);
    if (!Number.isFinite(v)) { api.toast('Neplatné číslo'); update(); return; }
    api.setZ(v, { resetSide: true });
  });
  sideBtn.addEventListener('click', () => api.toggleSide());
  el.querySelector('[data-cut="start"]').addEventListener('click', () => api.startHere && api.startHere());

  function update() {
    const s = api.get();
    if (document.activeElement !== zIn) zIn.value = String(+s.z.toFixed(3));
    range.min = String(Math.min(s.min, s.z));
    range.max = String(Math.max(s.max, s.z));
    range.step = 'any';
    if (document.activeElement !== range) range.value = String(s.z);
    const html = s.ticks.map(z => `<option value="${z}"></option>`).join('');
    if (ticks.innerHTML !== html) ticks.innerHTML = html;
    sideBtn.textContent = s.side === 'left' ? '▶ zleva' : '◀ zprava';
  }
  return { el, update };
}
