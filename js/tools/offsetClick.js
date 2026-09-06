// ╔══════════════════════════════════════════════════════════════╗
// ║  Offset – click logika                                     ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Dva režimy (volí se v dialogu):
//  • 'parallel' – SKUTEČNÁ paralelní kopie (obrys ve stejné vzdálenosti).
//    Vzdálenost se zadá v dialogu, stranu určí až následný klik do plátna
//    (`pickOffsetSide` porovná, ke které z obou variant je klik blíž).
//  • 'polar' – posun kopie o vzdálenost pod úhlem (původní chování).

import { state, showToast, withUndoBatch } from '../state.js';
import { renderAll } from '../render.js';
import { addObject } from '../objects.js';
import { findObjectAt, offsetObject, pickOffsetSide } from '../geometry.js';
import { showOffsetDialog } from '../dialogs.js';
import { setHint, resetHint, setTool } from '../ui.js';
import { analyzeSelection } from './helpers.js';
import { deepClone, typeLabel } from '../utils.js';

// Čeká se na klik určující stranu paralelního offsetu:
// `state._offsetPendingSide = { ids, dist }`. Drží se ve `state`, aby ho
// `resetDrawingState()` uklidil i při přepnutí nástroje, ne jen při Escape.

/** Zruší rozdělaný výběr strany (Escape). */
export function resetOffsetState() {
  if (state._offsetPendingSide) {
    state._offsetPendingSide = null;
    resetHint();
  }
}

export function handleOffsetClick(wx, wy) {
  // 2. klik: strana paralelního offsetu
  if (state._offsetPendingSide) {
    const { ids, dist } = state._offsetPendingSide;
    state._offsetPendingSide = null;
    resetHint();
    _applyParallel(ids, dist, wx, wy);
    return;
  }

  const idx = findObjectAt(wx, wy);
  if (idx === null) { showToast("Klepněte na objekt pro offset"); return; }
  const obj = state.objects[idx];
  if (obj.type === 'point') { showToast("Offset nelze použít na bod"); return; }

  _openDialog([idx], obj.name || typeLabel(obj.type));
}

/** Offset z předvybraného objektu/objektů. Vrací true pokud se operace provedla. */
export function offsetFromSelection() {
  const { allIndices } = analyzeSelection();
  if (allIndices.size === 0) return false;

  // Filtrovat jen ne-kótové, ne-bodové objekty
  const validIndices = [...allIndices].filter(i => {
    const o = state.objects[i];
    return o && o.type !== 'point' && !o.isDimension && !o.isCoordLabel;
  });
  if (validIndices.length === 0) return false;

  const names = validIndices.length === 1
    ? (state.objects[validIndices[0]].name || typeLabel(state.objects[validIndices[0]].type))
    : `${validIndices.length} objektů vybráno`;
  _openDialog(validIndices, names);
  return true;
}

// ── Interní ──

function _openDialog(indices, label) {
  // Držet objekty přes id, ne přes index do state.objects – mezi otevřením
  // dialogu a klikem na stranu může uživatel dát Zpět (tlačítko v liště) a
  // pole se přeskládá; index by pak ukazoval na jiný objekt.
  const ids = indices.map(i => state.objects[i]?.id).filter(id => id != null);
  showOffsetDialog(label, (mode, dist, angleDeg) => {
    if (mode === 'parallel') {
      // Spuštění z výběru (offsetFromSelection) tlačítko v liště obchází
      // setTool, takže by druhý klik neobsloužil nikdo. Přepnout MUSÍ jít
      // před uložením stavu – setTool volá resetDrawingState(), který
      // `_offsetPendingSide` maže (stejný vzor jako startRotateFromSelection).
      setTool('offset');
      state._offsetPendingSide = { ids, dist };
      setHint(`Klepněte na stranu, kam má jít offset ${dist} mm`);
      showToast("Klepněte na stranu offsetu");
      return;
    }
    _applyPolar(ids, dist, angleDeg);
  });
}

/** Paralelní kopie – stranu určí kliknutý bod. */
function _applyParallel(ids, dist, wx, wy) {
  const created = [];
  withUndoBatch(() => {
    for (const id of ids) {
      const obj = state.objects.find(o => o.id === id);
      if (!obj) continue;
      const side = pickOffsetSide(obj, dist, wx, wy);
      if (side === null) continue;
      const res = offsetObject(obj, dist, side);
      if (!res) continue;
      res.name = `${obj.name || typeLabel(obj.type)} (offset)`;
      if (obj.isStock) res.isStock = true;
      if (obj.layer !== undefined) res.layer = obj.layer;
      addObject(res);
      created.push(res);
    }
  });
  if (created.length === 0) {
    showToast("Offset se pro tuto vzdálenost nepodařilo vytvořit");
    return;
  }
  showToast(created.length === 1
    ? `Paralelní offset ${dist} mm vytvořen ✓`
    : `Paralelní offset ${created.length} obj. o ${dist} mm ✓`);
  renderAll();
}

/** Posun kopie o vzdálenost pod úhlem (původní chování). */
function _applyPolar(ids, dist, angleDeg) {
  const angleRad = angleDeg * Math.PI / 180;
  const dx = dist * Math.cos(angleRad);
  const dy = dist * Math.sin(angleRad);
  let count = 0;
  withUndoBatch(() => {
    for (const id of ids) {
      const obj = state.objects.find(o => o.id === id);
      if (!obj) continue;
      const clone = deepClone(obj);
      delete clone.id;
      clone.name = `${clone.name || clone.type} (offset)`;
      _shiftObject(clone, dx, dy);
      addObject(clone);
      count++;
    }
  });
  showToast(count === 1
    ? `Offset ${dist}mm / ${angleDeg}° vytvořen`
    : `Offset ${count} obj. o ${dist}mm / ${angleDeg}° vytvořen`);
  renderAll();
}

/** Posune souřadnice objektu o dx,dy (bez vedlejších efektů). */
function _shiftObject(obj, dx, dy) {
  switch (obj.type) {
    case 'point':
      obj.x += dx; obj.y += dy; break;
    case 'line': case 'constr':
      obj.x1 += dx; obj.y1 += dy; obj.x2 += dx; obj.y2 += dy; break;
    case 'circle': case 'arc':
      obj.cx += dx; obj.cy += dy; break;
    case 'rect':
      obj.x1 += dx; obj.y1 += dy; obj.x2 += dx; obj.y2 += dy; break;
    case 'polyline':
      if (obj.vertices) for (const v of obj.vertices) { v.x += dx; v.y += dy; }
      break;
    case 'text':
      obj.x += dx; obj.y += dy; break;
  }
}
