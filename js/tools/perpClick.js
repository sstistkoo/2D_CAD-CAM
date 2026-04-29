// ╔══════════════════════════════════════════════════════════════╗
// ║  Kolmost (svislost) – click logika                         ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, pushUndo, showToast } from '../state.js';
import { renderAll } from '../render.js';
import { findObjectAt, calculateAllIntersections } from '../geometry.js';
import { getLineSegment, setConstraint, propagateConstraints, analyzeSelection } from './helpers.js';
import { showEndpointChoiceDialog } from '../dialogs.js';
import { isAnchored } from './anchorClick.js';
import { updateAssociativeDimensions } from '../dialogs/dimension.js';

/** Vyrovná úsečku/segment kontury do svislé polohy.
 *  Kotevní bod = koncový bod bližší ke kliknutí (zůstane na místě),
 *  druhý koncový bod se posune svisle ve stejném směru. */
export function handlePerpClick(wx, wy) {
  const idx = findObjectAt(wx, wy);
  if (idx === null) { showToast("Klepněte na úsečku nebo segment kontury"); return; }
  const obj = state.objects[idx];
  const ls = getLineSegment(obj, wx, wy);
  if (!ls) {
    showToast("Kolmost funguje pouze pro úsečky a rovné segmenty kontur");
    return;
  }

  const len = Math.hypot(ls.seg.x2 - ls.seg.x1, ls.seg.y2 - ls.seg.y1);
  if (len < 1e-9) { showToast("Segment má nulovou délku"); return; }

  // Kontrola kotev – zakotvený konec musí zůstat fixní
  const a1 = isAnchored(ls.seg.x1, ls.seg.y1);
  const a2 = isAnchored(ls.seg.x2, ls.seg.y2);
  if (a1 && a2) { showToast("Oba konce jsou zakotveny – nelze vyrovnat"); return; }

  let fixP1;
  if (a1) { fixP1 = true; }
  else if (a2) { fixP1 = false; }
  else {
    const d1 = Math.hypot(wx - ls.seg.x1, wy - ls.seg.y1);
    const d2 = Math.hypot(wx - ls.seg.x2, wy - ls.seg.y2);
    fixP1 = d1 <= d2;
  }

  // Úhel "svislého" směru – respektuje natočení nulového bodu (H + 90°)
  const vAngle = (state.nullPointActive && state.nullPointAngle)
    ? (state.nullPointAngle * Math.PI / 180 + Math.PI / 2) : (Math.PI / 2);
  const cosV = Math.cos(vAngle);
  const sinV = Math.sin(vAngle);
  // Zachovat původní směr podél svislé osy
  const projDir = (ls.seg.x2 - ls.seg.x1) * cosV + (ls.seg.y2 - ls.seg.y1) * sinV;
  const sign = projDir >= 0 ? 1 : -1;

  pushUndo();
  let movedEnd;
  if (fixP1) {
    // P1 je kotva, P2 se posune podél svislé osy
    ls.setP2(ls.seg.x1 + sign * len * cosV, ls.seg.y1 + sign * len * sinV);
    movedEnd = 'p2';
  } else {
    // P2 je kotva, P1 se posune
    ls.setP1(ls.seg.x2 - sign * len * cosV, ls.seg.y2 - sign * len * sinV);
    movedEnd = 'p1';
  }

  // Uložit vazbu na objekt
  setConstraint(obj, ls.segIdx, 'vertical');
  // Propagovat na sousední segmenty polyline
  propagateConstraints(obj, ls.segIdx, movedEnd);

  calculateAllIntersections();
  updateAssociativeDimensions();
  renderAll();
  showToast("Vyrovnáno svisle ✓");
}

/** Kolmost z předvybraného objektu. Vrací true pokud se operace provedla. */
export function perpFromSelection() {
  const { lines } = analyzeSelection();
  if (lines.length !== 1) return false;

  const lineInfo = lines[0];
  const idx = lineInfo.idx;
  const obj = state.objects[idx];
  if (!obj) return false;

  let ls;
  if (obj.type === 'polyline' && lineInfo.segIdx !== null) {
    const v = obj.vertices, si = lineInfo.segIdx, n = v.length;
    const p1 = v[si], p2 = v[(si + 1) % n];
    if ((obj.bulges?.[si] || 0) !== 0) { showToast("Kolmost obloukového segmentu není podporována"); return true; }
    ls = { seg: { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }, setP1: (x, y) => { p1.x = x; p1.y = y; }, setP2: (x, y) => { p2.x = x; p2.y = y; }, segIdx: si };
  } else {
    ls = getLineSegment(obj, (obj.x1 + obj.x2) / 2, (obj.y1 + obj.y2) / 2);
  }
  if (!ls) return false;

  const len = Math.hypot(ls.seg.x2 - ls.seg.x1, ls.seg.y2 - ls.seg.y1);
  if (len < 1e-9) { showToast("Segment má nulovou délku"); return true; }

  // Kontrola kotev
  const a1 = isAnchored(ls.seg.x1, ls.seg.y1);
  const a2 = isAnchored(ls.seg.x2, ls.seg.y2);
  if (a1 && a2) { showToast("Oba konce jsou zakotveny – nelze vyrovnat"); return true; }

  const vAngle2 = (state.nullPointActive && state.nullPointAngle)
    ? (state.nullPointAngle * Math.PI / 180 + Math.PI / 2) : (Math.PI / 2);
  const cosV2 = Math.cos(vAngle2);
  const sinV2 = Math.sin(vAngle2);
  const projDir2 = (ls.seg.x2 - ls.seg.x1) * cosV2 + (ls.seg.y2 - ls.seg.y1) * sinV2;
  const sign = projDir2 >= 0 ? 1 : -1;

  // Pokud je jeden konec zakotvený, automaticky fixovat ten
  if (a1) {
    pushUndo();
    ls.setP2(ls.seg.x1 + sign * len * cosV2, ls.seg.y1 + sign * len * sinV2);
    setConstraint(obj, ls.segIdx, 'vertical');
    propagateConstraints(obj, ls.segIdx, 'p2');
    calculateAllIntersections();
    updateAssociativeDimensions();
    renderAll();
    showToast("Vyrovnáno svisle ✓");
    return true;
  }
  if (a2) {
    pushUndo();
    ls.setP1(ls.seg.x2 - sign * len * cosV2, ls.seg.y2 - sign * len * sinV2);
    setConstraint(obj, ls.segIdx, 'vertical');
    propagateConstraints(obj, ls.segIdx, 'p1');
    calculateAllIntersections();
    updateAssociativeDimensions();
    renderAll();
    showToast("Vyrovnáno svisle ✓");
    return true;
  }

  showEndpointChoiceDialog("Kolmost – výběr kotvy", ls.seg,
    "Kotva P1 (fixní)", "Kotva P2 (fixní)",
    (end) => {
      pushUndo();
      let movedEnd;
      if (end === 1) {
        ls.setP2(ls.seg.x1 + sign * len * cosV2, ls.seg.y1 + sign * len * sinV2);
        movedEnd = 'p2';
      } else {
        ls.setP1(ls.seg.x2 - sign * len * cosV2, ls.seg.y2 - sign * len * sinV2);
        movedEnd = 'p1';
      }
      setConstraint(obj, ls.segIdx, 'vertical');
      propagateConstraints(obj, ls.segIdx, movedEnd);
      calculateAllIntersections();
      updateAssociativeDimensions();
      renderAll();
      showToast("Vyrovnáno svisle ✓");
    }
  );
  return true;
}
