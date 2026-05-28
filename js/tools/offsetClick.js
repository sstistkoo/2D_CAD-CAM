// ╔══════════════════════════════════════════════════════════════╗
// ║  Offset – click logika                                     ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, showToast } from '../state.js';
import { renderAll } from '../render.js';
import { addObject } from '../objects.js';
import { findObjectAt } from '../geometry.js';
import { showOffsetAngleDialog } from '../dialogs.js';
import { analyzeSelection } from './helpers.js';
import { deepClone, typeLabel } from '../utils.js';

export function handleOffsetClick(wx, wy) {
  const idx = findObjectAt(wx, wy);
  if (idx === null) { showToast("Klepněte na objekt pro offset"); return; }
  const obj = state.objects[idx];
  if (obj.type === 'point') { showToast("Offset nelze použít na bod"); return; }

  const name = obj.name || typeLabel(obj.type);
  showOffsetAngleDialog(name, (dist, angleDeg) => {
    const angleRad = angleDeg * Math.PI / 180;
    const dx = dist * Math.cos(angleRad);
    const dy = dist * Math.sin(angleRad);
    const clone = deepClone(obj);
    delete clone.id;
    clone.name = `${clone.name || clone.type} (offset)`;
    _shiftObject(clone, dx, dy);
    addObject(clone);
    showToast(`Offset ${dist}mm / ${angleDeg}° vytvořen`);
    renderAll();
  });
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

  // Polární offset dialog (vzdálenost + úhel) pro 1 i více objektů
  const names = validIndices.length === 1
    ? (state.objects[validIndices[0]].name || typeLabel(state.objects[validIndices[0]].type))
    : `${validIndices.length} objektů vybráno`;
  showOffsetAngleDialog(names, (dist, angleDeg) => {
    const angleRad = angleDeg * Math.PI / 180;
    const dx = dist * Math.cos(angleRad);
    const dy = dist * Math.sin(angleRad);
    let count = 0;
    for (const idx of validIndices) {
      const obj = state.objects[idx];
      if (!obj) continue;
      const clone = deepClone(obj);
      delete clone.id;
      clone.name = `${clone.name || clone.type} (offset)`;
      _shiftObject(clone, dx, dy);
      addObject(clone);
      count++;
    }
    showToast(`Offset ${count} obj. o ${dist}mm / ${angleDeg}° vytvořen`);
    renderAll();
  });
  return true;
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
