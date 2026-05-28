// ╔══════════════════════════════════════════════════════════════╗
// ║  Zaoblení (Fillet) – click logika                          ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, pushUndo, showToast } from '../state.js';
import { renderAll } from '../render.js';
import { addObject } from '../objects.js';
import { setHint, resetHint } from '../ui.js';
import { drawCanvas, screenToWorld, snapPt } from '../canvas.js';
import { findObjectAt, calculateAllIntersections, filletTwoLines } from '../geometry.js';
import { showFilletDialog } from '../dialogs.js';
import { getLineSegment, analyzeSelection } from './helpers.js';
import { isAnchored } from './anchorClick.js';
import { updateAssociativeDimensions } from '../dialogs/dimension.js';

/** Klik na první úsečku → dialog → klik na druhou → zaoblení. */
export function handleFilletClick(wx, wy) {
  const idx = findObjectAt(wx, wy);
  if (idx === null) { showToast("Klepněte na první úsečku pro zaoblení"); return; }
  const obj1 = state.objects[idx];
  const ls1 = getLineSegment(obj1, wx, wy);
  if (!ls1) {
    showToast("Zaoblení funguje pouze pro úsečky a rovné segmenty kontur");
    return;
  }

  state.selected = idx;
  renderAll();
  setHint("Zadejte poloměr zaoblení");

  showFilletDialog((radius) => {
    setHint("Klepněte na druhou úsečku");
    showToast("Klepněte na druhou úsečku");

    function onSecondClick(e) {
      const rect = drawCanvas.getBoundingClientRect();
      const sx = (e.clientX || e.changedTouches?.[0]?.clientX) - rect.left;
      const sy = (e.clientY || e.changedTouches?.[0]?.clientY) - rect.top;
      let [wx2, wy2] = screenToWorld(sx, sy);
      if (state.snapToPoints) [wx2, wy2] = snapPt(wx2, wy2);

      const idx2 = findObjectAt(wx2, wy2);
      if (idx2 === null) { showToast("Klepněte na úsečku"); return; }
      if (idx2 === idx && ls1.segIdx === null) { showToast("Klepněte na jinou úsečku"); return; }
      const obj2 = state.objects[idx2];
      const ls2 = getLineSegment(obj2, wx2, wy2);
      if (!ls2) { showToast("Zaoblení funguje pouze pro úsečky a rovné segmenty kontur"); return; }
      // Same polyline, same segment?
      if (idx2 === idx && ls1.segIdx !== null && ls2.segIdx === ls1.segIdx) { showToast("Klepněte na jiný segment"); return; }

      drawCanvas.removeEventListener("click", onSecondClick);
      drawCanvas.removeEventListener("touchend", onSecondTouch);

      // Create proxy objects for filletTwoLines
      const proxy1 = { x1: ls1.seg.x1, y1: ls1.seg.y1, x2: ls1.seg.x2, y2: ls1.seg.y2 };
      const proxy2 = { x1: ls2.seg.x1, y1: ls2.seg.y1, x2: ls2.seg.x2, y2: ls2.seg.y2 };

      pushUndo();
      const result = filletTwoLines(proxy1, proxy2, radius);
      if (!result.ok) { showToast(result.msg); return; }

      // Write back trimmed endpoints (respektovat kotvy)
      if (!isAnchored(ls1.seg.x1, ls1.seg.y1)) ls1.setP1(proxy1.x1, proxy1.y1);
      if (!isAnchored(ls1.seg.x2, ls1.seg.y2)) ls1.setP2(proxy1.x2, proxy1.y2);
      if (!isAnchored(ls2.seg.x1, ls2.seg.y1)) ls2.setP1(proxy2.x1, proxy2.y1);
      if (!isAnchored(ls2.seg.x2, ls2.seg.y2)) ls2.setP2(proxy2.x2, proxy2.y2);

      result.arc.name = `Zaoblení R${radius}`;
      addObject(result.arc);
      calculateAllIntersections();
      updateAssociativeDimensions();
      renderAll();
      resetHint();
      showToast(`Zaoblení R${radius} vytvořeno ✓`);
    }

    function onSecondTouch(e) {
      if (e.changedTouches.length === 1) { e.preventDefault(); onSecondClick(e); }
    }

    drawCanvas.addEventListener("click", onSecondClick);
    drawCanvas.addEventListener("touchend", onSecondTouch);
    state._toolCleanup = () => {
      drawCanvas.removeEventListener("click", onSecondClick);
      drawCanvas.removeEventListener("touchend", onSecondTouch);
    };
  });
}

/** Zaoblení z 2 předvybraných úseček. Vrací true pokud se operace provedla. */
export function filletFromSelection() {
  const { lines } = analyzeSelection();
  if (lines.length !== 2) return false;

  const info1 = lines[0], info2 = lines[1];
  const obj1 = state.objects[info1.idx];
  const obj2 = state.objects[info2.idx];
  if (!obj1 || !obj2) return false;

  // Získat segmenty
  let ls1, ls2;
  if (obj1.type === 'polyline' && info1.segIdx !== null) {
    const v = obj1.vertices, si = info1.segIdx, n = v.length;
    const p1 = v[si], p2 = v[(si + 1) % n];
    if ((obj1.bulges?.[si] || 0) !== 0) { showToast("Zaoblení obloukového segmentu není podporováno"); return true; }
    ls1 = { seg: { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }, setP1: (x, y) => { p1.x = x; p1.y = y; }, setP2: (x, y) => { p2.x = x; p2.y = y; }, segIdx: si };
  } else {
    ls1 = getLineSegment(obj1, (obj1.x1 + obj1.x2) / 2, (obj1.y1 + obj1.y2) / 2);
  }
  if (obj2.type === 'polyline' && info2.segIdx !== null) {
    const v = obj2.vertices, si = info2.segIdx, n = v.length;
    const p1 = v[si], p2 = v[(si + 1) % n];
    if ((obj2.bulges?.[si] || 0) !== 0) { showToast("Zaoblení obloukového segmentu není podporováno"); return true; }
    ls2 = { seg: { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }, setP1: (x, y) => { p1.x = x; p1.y = y; }, setP2: (x, y) => { p2.x = x; p2.y = y; }, segIdx: si };
  } else {
    ls2 = getLineSegment(obj2, (obj2.x1 + obj2.x2) / 2, (obj2.y1 + obj2.y2) / 2);
  }
  if (!ls1 || !ls2) return false;

  showFilletDialog((radius) => {
    const proxy1 = { x1: ls1.seg.x1, y1: ls1.seg.y1, x2: ls1.seg.x2, y2: ls1.seg.y2 };
    const proxy2 = { x1: ls2.seg.x1, y1: ls2.seg.y1, x2: ls2.seg.x2, y2: ls2.seg.y2 };

    pushUndo();
    const result = filletTwoLines(proxy1, proxy2, radius);
    if (!result.ok) { showToast(result.msg); return; }

    if (!isAnchored(ls1.seg.x1, ls1.seg.y1)) ls1.setP1(proxy1.x1, proxy1.y1);
    if (!isAnchored(ls1.seg.x2, ls1.seg.y2)) ls1.setP2(proxy1.x2, proxy1.y2);
    if (!isAnchored(ls2.seg.x1, ls2.seg.y1)) ls2.setP1(proxy2.x1, proxy2.y1);
    if (!isAnchored(ls2.seg.x2, ls2.seg.y2)) ls2.setP2(proxy2.x2, proxy2.y2);

    result.arc.name = `Zaoblení R${radius}`;
    addObject(result.arc);
    calculateAllIntersections();
    updateAssociativeDimensions();
    renderAll();
    showToast(`Zaoblení R${radius} vytvořeno ✓`);
  });
  return true;
}
