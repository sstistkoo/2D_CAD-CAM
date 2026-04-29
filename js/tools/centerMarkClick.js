// ╔══════════════════════════════════════════════════════════════╗
// ║  Středová značka (Center Mark) – click logika               ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, pushUndo, showToast } from '../state.js';
import { renderAll } from '../render.js';
import { findObjectAt } from '../geometry.js';

/** Přepne středovou značku na kružnici/oblouku. */
export function handleCenterMarkClick(wx, wy) {
  const idx = findObjectAt(wx, wy);
  if (idx === null) { showToast("Klepněte na kružnici nebo oblouk"); return; }
  const obj = state.objects[idx];

  if (obj.type !== 'circle' && obj.type !== 'arc') {
    showToast("Středová značka funguje pouze pro kružnice a oblouky");
    return;
  }

  pushUndo();
  obj.showCenterMark = !obj.showCenterMark;
  renderAll();
  showToast(obj.showCenterMark ? "Středová značka zobrazena ✓" : "Středová značka skryta");
}

/** Přepne značku z předvybraných kružnic/oblouků. */
export function centerMarkFromSelection() {
  const indices = state.multiSelected.size > 0
    ? [...state.multiSelected]
    : (state.selected !== null ? [state.selected] : []);

  const targets = indices.filter(i => {
    const o = state.objects[i];
    return o && (o.type === 'circle' || o.type === 'arc');
  });

  if (targets.length === 0) return false;

  pushUndo();
  for (const i of targets) {
    state.objects[i].showCenterMark = !state.objects[i].showCenterMark;
  }
  renderAll();
  showToast("Středové značky přepnuty ✓");
  return true;
}
