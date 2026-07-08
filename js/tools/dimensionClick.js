// ╔══════════════════════════════════════════════════════════════╗
// ║  Kóta – click logika                                       ║
// ╚══════════════════════════════════════════════════════════════╝

import { COLORS } from '../constants.js';
import { state, pushUndo, showToast, axisLabels } from '../state.js';
import { renderAll } from '../render.js';
import { addObject } from '../objects.js';
import { setHint, resetHint } from '../ui.js';
import { findObjectAt, calculateAllIntersections } from '../geometry.js';
import { addDimensionForObject, addAngleDimensionForLines, addLinearDimForLine, addAngleDimForPlacement, buildZAxisRefLine, addArcAngleDim, addArcRadiusLeader } from '../dialogs.js';

// Tolerance pro shodu bodu s existující kótou souřadnic (snap body jsou přesné).
const COORD_MATCH_TOL = 1e-3;

export function handleDimensionClick(wx, wy) {
  // Umísťování kóty R oblouku (vytažení odkazu) → tento klik ji umístí
  if (state._dimArcRadius) {
    finalizeArcRadius(wx, wy);
    return;
  }
  // Umísťování kóty vzdálenosti mezi dvěma snap body → tento klik ji umístí
  if (state._dimPointSeg) {
    finalizePointSegDim(wx, wy);
    return;
  }
  // Umísťování úhlové kóty (2. úsečka už vybrána) → tento klik ji umístí
  if (state._dimAnglePlacing) {
    finalizeAnglePlacement(wx, wy);
    return;
  }
  // Vytahování kóty souřadnic bodu – druhá akce určí záměr
  if (state._dimCoordStart) {
    const A = state._dimCoordStart;
    // Klik na JINÝ snap (bod NEBO bod na hraně úsečky) → kóta vzdálenosti mezi body
    const onSnap = state.mouse.snapType === 'point' || state.mouse.snapType === 'edge';
    if (onSnap && Math.hypot(wx - A.x, wy - A.y) > COORD_MATCH_TOL) {
      state._dimPointSeg = { a: { x: A.x, y: A.y }, b: { x: wx, y: wy } };
      state._dimCoordStart = null;
      setHint("Pohybem vyberte délku / Z / X, klepnutím umístěte kótu mezi body");
      renderAll();
      return;
    }
    // Jinam → umístit kótu souřadnic s odkazovou čarou na tuto pozici
    placeCoordLabel(A.x, A.y, wx, wy);
    state._dimCoordStart = null;
    resetHint();
    return;
  }
  // Pokud je výběr → okamžitě přidat kóty
  if (!state.drawing && !state._dimFirstLine && dimensionFromSelection()) return;
  // Režim: první úsečka vybraná – druhá akce určí záměr
  if (state._dimFirstLine) {
    const idx = findObjectAt(wx, wy);
    if (idx !== null) {
      const obj = state.objects[idx];
      // Klik na JINOU úsečku → vstoupit do umístění kóty úhlu (výběr strany)
      if ((obj.type === 'line' || obj.type === 'constr') && !obj.isDimension && obj.id !== state._dimFirstLine.id) {
        state._dimSecondLine = obj;
        state._dimAnglePlacing = true;
        state._dimPlacing = false;
        setHint("Pohybem vyberte úhel a stranu, klepnutím umístěte kótu úhlu");
        renderAll();
        return;
      }
    }
    // Klik na osu Z (snap na středovém kříži) → kóta polárního úhlu od osy Z
    if (idx === null && state.mouse.onZAxis) {
      state._dimSecondLine = buildZAxisRefLine(state._dimFirstLine);
      state._dimAnglePlacing = true;
      state._dimAxisRef = 'Z';
      state._dimPlacing = false;
      setHint("Pohybem vyberte stranu, klepnutím umístěte kótu polárního úhlu od osy Z");
      renderAll();
      return;
    }
    // Prázdné plátno → začít přesné umístění kóty délky tažením;
    // dokončí se až uvolněním myši (mouseup → finalizeDimPlacement).
    state._dimPlacing = true;
    setHint("Táhněte a uvolněte pro přesné umístění kóty (nahoru = Z, do strany = X)");
    return;
  }

  if (!state.drawing) {
    // Snap k bodu (endpoint/midpoint/průsečík) → kóta souřadnic bodu.
    if (state.mouse.snapType === 'point') {
      // Toggle: pokud na tomto bodě kóta souřadnic už je, klik ji odebere.
      const existingIdx = state.objects.findIndex(o =>
        o.isCoordLabel && Math.hypot(o.x - wx, o.y - wy) < COORD_MATCH_TOL);
      if (existingIdx !== -1) {
        pushUndo();
        state.objects.splice(existingIdx, 1);
        showToast('Kóta odebrána');
        calculateAllIntersections();
        renderAll();
        return;
      }
      // Jinak → začít vytahování kóty souřadnic (umístí se druhým klikem)
      state._dimCoordStart = { x: wx, y: wy };
      setHint("Táhněte a klepnutím umístěte kótu souřadnic; klepnutí na jiný bod změří vzdálenost");
      renderAll();
      return;
    }
    // Režim B: klik na existující objekt → přidá kótu
    const idx = findObjectAt(wx, wy);
    if (idx !== null) {
      const obj = state.objects[idx];
      // Úsečka/konstr. → nabídnout úhlovou kótu (kliknout na druhou)
      if ((obj.type === 'line' || obj.type === 'constr') && !obj.isDimension) {
        // 1. klik = pouze výběr úsečky (bez tažení)
        state._dimFirstLine = obj;
        state._dimPlacing = false;
        setHint("Klepněte na druhou úsečku pro úhel, nebo na plátno a tažením umístěte kótu délky");
        return;
      }
      // Oblouk → hned úhlová kóta rozevření + interaktivní vytažení kóty R
      if (obj.type === 'arc' && !obj.isDimension) {
        pushUndo();
        addArcAngleDim(obj);
        state._dimArcRadius = { arc: obj, anchorAngle: Math.atan2(wy - obj.cy, wx - obj.cx) };
        setHint("Táhněte a klepnutím umístěte kótu R");
        calculateAllIntersections();
        renderAll();
        return;
      }
      pushUndo();
      addDimensionForObject(obj);
      calculateAllIntersections();
      renderAll();
      return;
    }
    // Režim A: 2 body – 1. klik
    state.drawing = true;
    state.tempPoints = [{ x: wx, y: wy }];
    setHint("Klepněte na druhý bod pro kótu");
  } else {
    // 2. klik – dokončit kótu mezi body
    const p1 = state.tempPoints[0];
    const d = Math.hypot(wx - p1.x, wy - p1.y);
    if (d < 1e-6) { showToast("Body jsou totožné"); return; }
    pushUndo();
    addObject({
      type: 'line',
      x1: p1.x, y1: p1.y,
      x2: wx, y2: wy,
      name: `Kóta ${d.toFixed(2)}mm`,
      isDimension: true,
      color: COLORS.textSecondary,
      layer: 2,
    });
    showToast(`Kóta ${d.toFixed(2)}mm přidána ✓`);
    state.drawing = false;
    state.tempPoints = [];
    calculateAllIntersections();
    renderAll();
    resetHint();
  }
}

/**
 * Vytvoří kótu souřadnic bodu (A) s odkazovou čarou vedoucí na umístěnou
 * pozici (lx,ly). Offset se uloží jako dimLeadDX/DY (svět) a drží se relativně
 * i po přesunu bodu.
 */
function placeCoordLabel(ax, ay, lx, ly) {
  pushUndo();
  addObject({
    type: 'point', x: ax, y: ay,
    name: `Kóta [${ax.toFixed(2)}, ${ay.toFixed(2)}]`,
    isDimension: true, isCoordLabel: true, dimType: 'coord',
    dimLeadDX: lx - ax, dimLeadDY: ly - ay,
    color: COLORS.textSecondary,
  });
  showToast(`Kóta ${axisLabels()[0]}${ax.toFixed(2)} ${axisLabels()[1]}${ay.toFixed(2)} přidána`);
  calculateAllIntersections();
  renderAll();
}

/**
 * Dokončí kótu vzdálenosti mezi dvěma snap body – jako by mezi nimi byla
 * úsečka; režim (aligned / Z / X) dle pozice kurzoru (computeLinearDimPlacement).
 */
export function finalizePointSegDim(wx, wy) {
  const seg = state._dimPointSeg;
  if (!seg) return;
  pushUndo();
  addLinearDimForLine({ type: 'line', x1: seg.a.x, y1: seg.a.y, x2: seg.b.x, y2: seg.b.y }, wx, wy);
  state._dimPointSeg = null;
  calculateAllIntersections();
  renderAll();
  resetHint();
}

/**
 * Dokončí umístění kóty R oblouku – odkaz (leader) se šipkou na oblouku a
 * popiskem R vytaženým na pozici kurzoru (viz addArcRadiusLeader).
 */
export function finalizeArcRadius(wx, wy) {
  const ar = state._dimArcRadius;
  if (!ar) return;
  pushUndo();
  addArcRadiusLeader(ar.arc, ar.anchorAngle, wx, wy);
  state._dimArcRadius = null;
  calculateAllIntersections();
  renderAll();
  resetHint();
}

/** Vyčistí stav interaktivního umísťování kóty. */
export function clearDimPlacing() {
  state._dimFirstLine = null;
  state._dimSecondLine = null;
  state._dimPlacing = false;
  state._dimAnglePlacing = false;
  state._dimAxisRef = null;
  state._dimCoordStart = null;
  state._dimPointSeg = null;
  state._dimArcRadius = null;
}

/**
 * Dokončí umístění úhlové kóty na pozici kurzoru – vybere sektor (stranu)
 * a poloměr dle kurzoru (viz computeAngleDimPlacement). Volá se z kliknutí
 * po výběru druhé úsečky.
 */
export function finalizeAnglePlacement(wx, wy) {
  const l1 = state._dimFirstLine, l2 = state._dimSecondLine;
  if (!l1 || !l2) { clearDimPlacing(); return; }
  pushUndo();
  addAngleDimForPlacement(l1, l2, wx, wy, state._dimAxisRef === 'Z' ? { vsAxis: 'Z' } : {});
  clearDimPlacing();
  calculateAllIntersections();
  renderAll();
  resetHint();
}

/**
 * Dokončí umístění lineární kóty délky na pozici kurzoru (aligned /
 * vodorovná Z / svislá X – viz computeLinearDimPlacement). Volá se z uvolnění
 * myši (mouseup) po druhé akci na prázdném plátně. Úhlová kóta se řeší už
 * v handleDimensionClick při stisku na druhou úsečku.
 */
export function finalizeDimPlacement(wx, wy) {
  const first = state._dimFirstLine;
  if (!first || !state._dimPlacing) return;
  pushUndo();
  addLinearDimForLine(first, wx, wy);
  clearDimPlacing();
  calculateAllIntersections();
  renderAll();
  resetHint();
}

/**
 * Přidá kóty k aktuálně vybraným objektům / snap bodům.
 * @returns {boolean} true pokud byla akce provedena
 */
export function dimensionFromSelection() {
  const pts = state.selectedPoint ? state.selectedPoint.slice() : [];
  const objIndices = state.multiSelected.size > 0
    ? [...state.multiSelected]
    : (state.selected !== null ? [state.selected] : []);
  const objs = objIndices.map(i => state.objects[i]).filter(Boolean);

  if (pts.length === 0 && objs.length === 0) return false;

  pushUndo();
  let count = 0;

  // Snap body → kóty souřadnic
  for (const pt of pts) {
    addDimensionForObject({ type: 'point', x: pt.x, y: pt.y });
    count++;
  }

  // Úhlové kóty mezi páry úseček
  const lines = objs.filter(o => (o.type === 'line' || o.type === 'constr') && !o.isDimension);
  if (lines.length >= 2) {
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        addAngleDimensionForLines(lines[i], lines[j]);
        count++;
      }
    }
  }

  // Kóty pro jednotlivé objekty (ne-kóty)
  for (const o of objs) {
    if (o.isDimension || o.isCoordLabel) continue;
    addDimensionForObject(o);
    count++;
  }

  if (count > 0) {
    calculateAllIntersections();
    renderAll();
    showToast(`Přidáno ${count} kót ✓`);
  }

  // Vyčistit výběr
  state.multiSelected.clear();
  state.selected = null;
  state.selectedPoint = null;
  renderAll();
  return true;
}
