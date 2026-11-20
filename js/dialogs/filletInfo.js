// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Body přechodu R po zaoblení (jako kalkulačka Kužel)    ║
// ╚══════════════════════════════════════════════════════════════╝
// Po zaoblení nástrojem Zaoblení (nebo z info o oblouku) ukáže plovoucí panel:
// začátek a konec R (tečné body od Z+), střed a ★ největší / nejmenší Ø na
// oblouku – místo, kde jde Ø změřit posuvkou, když je ostrá hrana jen
// teoretická. 📐 Označit ★ přidá přes bod vodorovnou a svislou čáru s kótou.

import { state, coordHelpers, showToast } from '../state.js';
import { makeOverlay } from '../dialogFactory.js';
import { arcTransitionPoints, objectExtremes } from '../geometry/extremePoints.js';
import { markPoint } from './extremePoints.js';
import { writeClipboard } from '../clipboard.js';

const LS_KEY = 'skica.filletInfo.auto';

/** Ukazovat panel po každém zaoblení? (vypínač v panelu) */
export function filletInfoAuto() {
  try { return localStorage.getItem(LS_KEY) !== '0'; } catch { return true; }
}

/**
 * @param {{cx:number, cy:number, r:number, startAngle:number, endAngle:number, ccw?:boolean}} arc
 * @param {{auto?: boolean}} [opt]  auto = po zaoblení (respektuje vypínač)
 */
export function showFilletInfo(arc, opt = {}) {
  if (!arc || !(arc.r > 0)) return;
  if (opt.auto && !filletInfoAuto()) return;
  const isK = state.machineType === 'karusel';
  const t = arcTransitionPoints(arc, isK);
  const { H, V, Hp, Vp, fH, fV } = coordHelpers();
  const fmt = p => `${Hp}${H}${fH(p.x).toFixed(3)}  ${Vp}${V}${fV(p.y).toFixed(3)}`;
  const rows = [
    ['Začátek R', t.start, ''], ['Konec R', t.end, ''], ['Střed R', t.center, 'fi-muted'],
    ...t.extremes.map(e => [e.kind === 'max' ? '★ Největší Ø na R (posuvka)' : '★ Nejmenší Ø na R', e, 'fi-star']),
  ];
  const body = `
    <div class="fi-panel">
      <table class="fi-tbl">${rows.map(([n, p, c], i) =>
        `<tr class="${c}"><td>${n}</td><td>${fmt(p)}</td><td>${c === 'fi-star' ? `<button class="calc-btn fi-mark" data-i="${i}" title="Přidat přes bod vodorovnou a svislou čáru s kótou">📐</button>` : ''}</td></tr>`).join('')}
      </table>
      ${t.extremes.length ? '' : '<div class="fi-note">Krajní Ø leží na tečném bodě (oblouk se v průměru neotáčí).</div>'}
      <div class="fi-note">Pořadí od Z+ (${isK ? 'shora dolů' : 'zprava doleva'}).</div>
      <div class="fi-row">
        <button class="calc-btn" id="fiCopy">📋 Kopírovat</button>
        <label class="fi-auto"><input type="checkbox" id="fiAuto" ${filletInfoAuto() ? 'checked' : ''}> ukazovat po zaoblení</label>
      </div>
    </div>`;
  document.querySelector('.calc-overlay[data-type="filletInfo"]')?.remove();
  const ov = makeOverlay('filletInfo', `◜ Přechod R${+arc.r.toFixed(3)} – body`, body, 'fi-window', { float: true, closeOnEsc: false });
  if (!ov) return;
  ov.querySelectorAll('.fi-mark').forEach(b => b.addEventListener('click', () => {
    const [n, p] = rows[+b.getAttribute('data-i')];
    const ext = objectExtremes({ type: 'arc', ...arc });
    if (ext) markPoint(p, ext, n.replace(/^★ /, ''));
  }));
  ov.querySelector('#fiCopy').addEventListener('click', () => {
    const text = `R${+arc.r.toFixed(3)}\n` + rows.map(([n, p]) => `${n.replace(/^★ /, '')}: ${fmt(p)}`).join('\n');
    writeClipboard(text).then(() => showToast('Zkopírováno')).catch(() => showToast('Kopírování se nepovedlo'));
  });
  ov.querySelector('#fiAuto').addEventListener('change', e => {
    try { localStorage.setItem(LS_KEY, /** @type {HTMLInputElement} */ (e.target).checked ? '1' : '0'); } catch { /* bez úložiště */ }
  });
}
