// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Měření / Krajní body objektu                         ║
// ║  Nejvzdálenější bod od osy + vodorovná a svislá značka         ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Typický případ: rádius tečně napojený na úsečku – krajní bod oblouku
// (kvadrant) nemá v kresbě vlastní bod a ručně by se musel dopočítávat
// od středu. Tady se spočítají krajní body v ±vodorovném a ±svislém
// směru a jedním klepnutím se přes vybraný bod přidá vodorovná a svislá
// pomocná úsečka + kóta souřadnic.

import { COLORS } from '../constants.js';
import { makeInputOverlay } from '../dialogFactory.js';
import { state, showToast, coordHelpers, withUndoBatch } from '../state.js';
import { addObject } from '../objects.js';
import { renderAll } from '../render.js';
import { objectExtremes, supportsExtremes, EPS } from '../geometry/extremePoints.js';
import { addDimensionForObject } from './dimension.js';
import { calculateAllIntersections } from '../geometry.js';
import { writeClipboard } from '../clipboard.js';

export { supportsExtremes };

/**
 * Přidá přes bod vodorovnou a svislou pomocnou úsečku (přes celý objekt
 * s přesahem) a kótu souřadnic bodu. Jeden krok Zpět.
 */
export function markPoint(p, ext, label) {
  const w = ext.maxX.x - ext.minX.x;
  const h = ext.maxY.y - ext.minY.y;
  const m = Math.max(5, 0.25 * Math.max(w, h));
  withUndoBatch(() => {
    addObject({
      type: 'constr', finite: true,
      x1: ext.minX.x - m, y1: p.y, x2: ext.maxX.x + m, y2: p.y,
      name: `${label} – vodorovná`,
    });
    addObject({
      type: 'constr', finite: true,
      x1: p.x, y1: ext.minY.y - m, x2: p.x, y2: ext.maxY.y + m,
      name: `${label} – svislá`,
    });
    addDimensionForObject({ type: 'point', x: p.x, y: p.y });
  });
  calculateAllIntersections();
  renderAll();
}

/**
 * Dialog krajních bodů objektu. Zvýrazní bod nejdál od osy rotace
 * (soustruh: osa vodorovná → rozhoduje |svislá|; karusel: osa svislá →
 * rozhoduje |vodorovná|).
 * @param {any} obj  objekt nebo pole objektů
 */
export function showExtremePointsDialog(obj) {
  const ext = objectExtremes(obj);
  if (!ext) { showToast('Pro tento objekt nelze krajní body určit'); return; }
  const { H, V, Hp, Vp, fH, fV } = coordHelpers();
  const isK = state.machineType === 'karusel';

  const rows = [
    { key: 'maxX', label: `Max ${Hp}${H}`, p: ext.maxX },
    { key: 'minX', label: `Min ${Hp}${H}`, p: ext.minX },
    { key: 'maxY', label: `Max ${Vp}${V}`, p: ext.maxY },
    { key: 'minY', label: `Min ${Vp}${V}`, p: ext.minY },
  ];
  // Nejdál od osy: soustruh = |y|, karusel = |x|
  const radial = (p) => Math.abs(isK ? p.x : p.y);
  let far = rows[0];
  for (const r of rows) if (radial(r.p) > radial(far.p) + EPS) far = r;

  const fmt = (p) => `${Hp}${H}${fH(p.x).toFixed(3)} ${Vp}${V}${fV(p.y).toFixed(3)}`;
  const tr = rows.map(r => {
    const hi = r === far;
    return `<tr>
      <td style="color:${COLORS.label}">${r.label}${hi ? ' ★' : ''}</td>
      <td style="color:${hi ? COLORS.selected : COLORS.primary}">${fmt(r.p)}</td>
      <td><button class="btn-cancel" data-ext="${r.key}" title="Přidat vodorovnou a svislou úsečku přes bod" style="padding:2px 8px;min-width:0">➕</button></td>
    </tr>`;
  }).join('');
  const radVal = isK ? fH(far.p.x) : fV(far.p.y);

  const overlay = makeInputOverlay(`
    <div class="input-dialog">
      <h3>⊹ Krajní body</h3>
      <table style="width:100%;font-family:Consolas;font-size:13px;">
        ${tr}
        <tr><td colspan="3" style="color:${COLORS.border};font-size:11px;padding-top:6px">★ nejdál od osy: ${isK ? Hp + H : Vp + V}${Math.abs(radVal).toFixed(3)}</td></tr>
      </table>
      <div class="btn-row">
        <button class="btn-cancel" id="extMarkFar">📐 Označit ★</button>
        <button class="btn-cancel" id="extCopy">📋 Kopírovat</button>
        <button class="btn-ok btn-cancel-overlay">OK</button>
      </div>
    </div>`);

  for (const btn of overlay.querySelectorAll('[data-ext]')) {
    btn.addEventListener('click', () => {
      const r = rows.find(x => x.key === btn.getAttribute('data-ext'));
      if (!r) return;
      markPoint(r.p, ext, r.label);
      overlay.remove();
    });
  }
  overlay.querySelector('#extMarkFar').addEventListener('click', () => {
    markPoint(far.p, ext, 'Nejdál od osy');
    overlay.remove();
  });
  overlay.querySelector('#extCopy').addEventListener('click', () => {
    const text = rows.map(r => `${r.label}: ${fmt(r.p)}`).join('\n');
    writeClipboard(text).then(() => showToast('Zkopírováno')).catch(() => showToast('Kopírování se nepovedlo'));
  });
  overlay.querySelector('.btn-ok').focus();
}
