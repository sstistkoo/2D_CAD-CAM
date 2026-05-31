// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Boolean operace přes Maker.js                      ║
// ║  Union / Subtract / Intersect na uzavřených konturách       ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, pushUndo, showToast } from '../state.js';
import { findObjectAt, calculateAllIntersections } from '../geometry.js';
import { setHint, updateObjectList, updateProperties } from '../ui.js';
import { renderAll } from '../render.js';
import { showBooleanDialog } from '../dialogs/booleanDialog.js';
import { updateAssociativeDimensions } from '../dialogs/dimension.js';
import { booleanCombine } from './booleanMaker.js';

let boolFirstIdx = null;

export function resetBooleanState() {
  boolFirstIdx = null;
}

/**
 * Handler kliknutí pro booleovský nástroj.
 * Fáze 1: klik na první uzavřenou konturu → uloží index.
 * Fáze 2: klik na druhou → dialog → provede operaci.
 */
export function handleBooleanClick(wx, wy) {
  const idx = findObjectAt(wx, wy);
  if (idx === null) {
    showToast('Klikněte na uzavřený objekt');
    return;
  }

  const obj = state.objects[idx];
  if (!_isClosedShape(obj)) {
    showToast('Objekt není uzavřená kontura (kružnice, obdélník nebo uzavřená polyline)');
    return;
  }

  if (boolFirstIdx === null) {
    boolFirstIdx = idx;
    state.selected = idx;
    renderAll();
    setHint('Klikněte na druhou uzavřenou konturu');
    return;
  }

  if (idx === boolFirstIdx) {
    showToast('Vyberte jiný objekt');
    return;
  }

  const idxA = boolFirstIdx;
  const idxB = idx;
  const objA = state.objects[idxA];
  const objB = obj;
  boolFirstIdx = null;

  showBooleanDialog((operation) => {
    _executeBooleanOp(idxA, idxB, objA, objB, operation);
  });
}

function _executeBooleanOp(idxA, idxB, objA, objB, operation) {
  const results = booleanCombine(objA, objB, operation);

  if (!results) {
    showToast('Maker.js není dostupný – boolean nelze provést');
    return;
  }
  if (results.length === 0) {
    showToast('Výsledek operace je prázdný (objekty se neprotínají?)');
    return;
  }

  pushUndo();
  const toRemove = [idxA, idxB].sort((a, b) => b - a);
  for (const ri of toRemove) state.objects.splice(ri, 1);

  const opLabels = { union: 'Sjednocení', subtract: 'Odečtení', intersect: 'Průnik' };
  for (const part of results) {
    part.id = state.nextId++;
    part.name = `${opLabels[operation]} ${part.id}`;
    state.objects.push(part);
  }

  calculateAllIntersections();
  updateAssociativeDimensions();
  updateObjectList();
  updateProperties();
  renderAll();
  showToast(`${opLabels[operation]} ✓ (${results.length} kontur${results.length === 1 ? 'a' : 'y'})`);
  setHint('Klikněte na první uzavřenou konturu');
}

function _isClosedShape(obj) {
  if (!obj) return false;
  if (obj.type === 'circle') return true;
  if (obj.type === 'rect') return true;
  if (obj.type === 'polyline' && obj.closed) return true;
  return false;
}
