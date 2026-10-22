// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Díry v plášti: zápis do výkresu                      ║
// ╚══════════════════════════════════════════════════════════════╝
// Okno Díra do pláště (calculators/shellHole.js) sem jde přes bridge
// (faceView.js), ať nevzniká cyklický import. Vrstva „Díry v plášti" se
// založí s první dírou. Úprava díry = nahrazení objektu (jedním ↩).
import { state, showToast, withUndoBatch } from '../state.js';
import { addObject } from '../objects.js';
import { calculateAllIntersections } from '../geometry.js';
import { updateObjectList, updateProperties, updateLayerList } from '../ui.js';
import { renderAll } from '../render.js';
import { getShellLayer, SHELL_LAYER_NAME } from './faceLayer.js';
import { shellHoleObject, resolveShellHole, shellHoles, shellHoleZ, shellDepthLabel, shellAngles } from './shellHoles.js';
import { shellSlotObject, resolveShellSlot, shellSlots, slotDepthLabel } from './shellSlots.js';

const fmtC = v => String(+(+v).toFixed(3)).replace('.', ',');

/** Vrstva děr v plášti (založí ji, když chybí). */
export function ensureShellLayer() {
  let l = getShellLayer();
  if (l) {
    if (!l.visible) l.visible = true;
    return l;
  }
  l = { id: state.nextLayerId++, name: SHELL_LAYER_NAME, color: '#94e2d5', visible: true, locked: false, isShell: true };
  state.layers.push(l);
  // Díry bez vrstvy (↩ po smazání vrstvy) patří do ní.
  const ids = new Set(state.layers.map(x => x.id));
  state.objects.forEach(o => { if ((o.shellHole || o.shellSlot) && !ids.has(o.layer)) o.layer = l.id; });
  updateLayerList();
  return l;
}

/**
 * Nakreslí díru v plášti (nebo nahradí `replace`).
 * @param spec { d, depth: { mode, value }, count, angle, ref? }
 * @param z poloha díry podél osy vřetena
 * @returns true = nakresleno
 */
export function drawShellHole(spec, z, replace = null) {
  const res = resolveShellHole(spec, z);
  if (res.error) { showToast(`Díra nenakreslena: ${res.error}.`, 6000); return false; }
  const layer = ensureShellLayer();
  const obj = shellHoleObject(spec, z, layer.id);
  withUndoBatch(() => {
    if (replace) {
      const i = state.objects.indexOf(replace);
      if (i >= 0) state.objects.splice(i, 1);
    }
    const added = addObject(obj);
    if (added !== null && obj.isStock) delete obj.isStock;   // režim polotovaru díru neoznačí
  });
  state.selected = null; state.multiSelected.clear();
  calculateAllIntersections();
  updateObjectList();
  updateProperties();
  renderAll();
  const angs = shellAngles(spec);
  showToast(`Díra v plášti Ø${fmtC(spec.d)} ${shellDepthLabel(spec.depth)} (hl. ${fmtC(res.depth)} mm od Ø${fmtC(res.xTop)}) · `
    + `${angs.length > 1 ? `${angs.length}× po obvodu, ` : ''}C ${angs.map(fmtC).join(' / ')}° · Z${fmtC(z)}`
    + (replace ? ' — upraveno' : '. Víc děr podél osy: Lin.pole'), 6000);
  return true;
}

/**
 * Nakreslí drážku pro pero z1…z2 (nebo nahradí `replace`).
 * @param spec { w, depth: { mode, value }, count, angle, ref? }
 */
export function drawShellSlot(spec, z1, z2, replace = null) {
  const res = resolveShellSlot(spec, z1, z2);
  if (res.error) { showToast(`Drážka nenakreslena: ${res.error}.`, 6000); return false; }
  const layer = ensureShellLayer();
  const obj = shellSlotObject(spec, z1, z2, layer.id);
  withUndoBatch(() => {
    if (replace) {
      const i = state.objects.indexOf(replace);
      if (i >= 0) state.objects.splice(i, 1);
    }
    const added = addObject(obj);
    if (added !== null && obj.isStock) delete obj.isStock;
  });
  state.selected = null; state.multiSelected.clear();
  calculateAllIntersections();
  updateObjectList();
  updateProperties();
  renderAll();
  const angs = shellAngles(spec);
  showToast(`Drážka pro pero ${fmtC(spec.w)}×${fmtC(Math.abs(z1 - z2))} ${slotDepthLabel(spec.depth)} (hl. ${fmtC(res.depth)} mm od Ø${fmtC(res.xTop)}) · `
    + `${angs.length > 1 ? `${angs.length}× po obvodu, ` : ''}C ${angs.map(fmtC).join(' / ')}° · Z${fmtC(Math.max(z1, z2))}…${fmtC(Math.min(z1, z2))}`
    + (replace ? ' — upraveno' : ''), 6000);
  return true;
}

/**
 * Díra v plášti pod kurzorem (osa v toleranci `tolPx` pixelů), nebo null.
 * Klepnutí nástrojem Díra na ni otevře její úpravu.
 */
export function shellHoleAt(wx, wy, tolPx = 10, list = shellHoles()) {
  const tol = tolPx / (state.zoom || 1);
  let best = null, bd = tol;
  list.forEach(o => {
    const dx = o.x2 - o.x1, dy = o.y2 - o.y1, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((wx - o.x1) * dx + (wy - o.y1) * dy) / L2)) : 0;
    const d = Math.hypot(o.x1 + t * dx - wx, o.y1 + t * dy - wy);
    if (d < bd) { bd = d; best = o; }
  });
  return best;
}

/** Drážka pro pero pod kurzorem (úsečka na plášti), nebo null. */
export function shellSlotAt(wx, wy, tolPx = 10) { return shellHoleAt(wx, wy, tolPx, shellSlots()); }

export { shellHoleZ };
