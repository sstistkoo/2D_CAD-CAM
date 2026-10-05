// ╔══════════════════════════════════════════════════════════════╗
// ║  Kopírovat & umístit – interaktivní kopie s ref. bodem     ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, pushUndo, showToast } from '../state.js';
import { translateObject } from '../objects.js';
import { setHint, setTool, updateProperties, updateObjectList } from '../ui.js';
import { renderAll } from '../render.js';
import { deepClone } from '../utils.js';
import { calculateAllIntersections } from '../geometry.js';
import { updateAssociativeDimensions } from '../dialogs/dimension.js';

/**
 * Aktivuje nástroj copyPlace a nastaví vybrané objekty pro kopírování.
 * Volá se z toolbaru, context menu nebo Shift+C.
 */
export function copyPlaceFromSelection() {
  const indices = getSelectedIndices();
  if (indices.length === 0) return false;

  // setTool volá resetDrawingState, který čistí _copyPlaceObjects,
  // proto nastavujeme stav AŽ PO setTool
  setTool('copyPlace');
  state._copyPlaceObjects = indices;
  state._copyPlaceRef = null;
  setHint('Klikněte referenční bod (odkud)');
  showToast('Klikněte referenční bod (odkud)', 3000);
  return true;
}

/**
 * Handler kliknutí pro nástroj copyPlace.
 * Fáze 1: Pokud nejsou vybrané objekty, vybere objekt pod kurzorem.
 * Fáze 2: Klik = referenční bod (odkud).
 * Fáze 3: Klik = cílový bod (kam) → vytvoří kopie.
 */
export function handleCopyPlaceClick(wx, wy) {
  // Fáze 1: Žádné objekty ke kopírování → uživatel musí nejdřív vybrat
  if (!state._copyPlaceObjects || state._copyPlaceObjects.length === 0) {
    const indices = getSelectedIndices();
    if (indices.length === 0) {
      showToast('Nejdříve vyberte objekty ke kopírování');
      return;
    }
    state._copyPlaceObjects = indices;
    state._copyPlaceRef = null;
    setHint('Klikněte referenční bod (odkud)');
    return;
  }

  // Fáze 2: Referenční bod (odkud)
  if (!state._copyPlaceRef) {
    state._copyPlaceRef = { x: wx, y: wy };
    setHint('Klikněte cílový bod pro umístění kopie');
    renderAll();
    return;
  }

  // Fáze 3: Cílový bod (kam) → vytvoření kopií
  const dx = wx - state._copyPlaceRef.x;
  const dy = wy - state._copyPlaceRef.y;

  // Jeden pushUndo pro celou dávku
  pushUndo();

  let count = 0;
  for (const idx of state._copyPlaceObjects) {
    const orig = state.objects[idx];
    if (!orig) continue;
    const copy = deepClone(orig);
    delete copy.id;
    copy.name = (copy.name || copy.type) + ' (kopie)';
    // Posun kopie bez kontroly kotev (moveObject by kopii zakotveného
    // originálu odmítl – leží na jeho kotvě)
    translateObject(copy, dx, dy);
    // Přiřadit ID a vrstvu, přidat do objektů
    copy.id = state.nextId++;
    if (copy.layer === undefined) {
      copy.layer = (copy.type === 'constr') ? 1 : state.activeLayer;
    }
    state.objects.push(copy);
    count++;
  }

  if (count > 0) {
    updateObjectList();
    calculateAllIntersections();
    updateAssociativeDimensions();
    updateProperties();
    renderAll();
    showToast(`Zkopírováno ${count} objekt${count === 1 ? '' : count < 5 ? 'y' : 'ů'}`);
  }

  // Reset ref bodu pro další kopii, objekty zůstávají
  state._copyPlaceRef = null;
  setHint('Klikněte referenční bod (odkud) nebo Escape pro ukončení');
}

/**
 * Resetuje stav nástroje copyPlace.
 */
export function resetCopyPlaceState() {
  state._copyPlaceObjects = null;
  state._copyPlaceRef = null;
}

/**
 * Vrátí pole indexů vybraných objektů (multiSelected + selected).
 */
function getSelectedIndices() {
  const indices = [];
  if (state.multiSelected.size > 0) {
    for (const i of state.multiSelected) indices.push(i);
    if (state.selected !== null && !state.multiSelected.has(state.selected)) {
      indices.push(state.selected);
    }
  } else if (state.selected !== null) {
    indices.push(state.selected);
  }
  return indices;
}
