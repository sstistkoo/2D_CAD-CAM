// ╔══════════════════════════════════════════════════════════════╗
// ║  Rovnoběžka – click logika                                 ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, pushUndo, showToast } from '../state.js';
import { renderAll } from '../render.js';
import { addObject } from '../objects.js';
import { setHint, resetHint } from '../ui.js';
import { findObjectAt, calculateAllIntersections } from '../geometry.js';
import { getLineSegment, setConstraint, propagateConstraints, analyzeSelection } from './helpers.js';

export function handleParallelClick(wx, wy) {
  if (!state.drawing) {
    // 1. klik: vyber úsečku nebo segment kontury
    const idx = findObjectAt(wx, wy);
    if (idx === null) { showToast("Klepněte na úsečku"); return; }
    const obj = state.objects[idx];
    const ls = getLineSegment(obj, wx, wy);
    if (!ls) {
      showToast("Rovnoběžka funguje pouze pro úsečky a rovné segmenty kontur");
      return;
    }
    state.drawing = true;
    state._parallelRefIdx = idx;
    state._parallelRefSeg = ls;
    state._parallelClickX = wx;
    state._parallelClickY = wy;
    state.selected = idx;
    state.selectedSegment = ls.segIdx;  // zvýrazní jen kliknutý segment kontury
    renderAll();
    setHint("Klepněte na úsečku → otočí první do rovnoběžnosti, nebo na bod → nová rovnoběžka");
  } else {
    const refSeg = state._parallelRefSeg;
    if (!refSeg) { state.drawing = false; resetHint(); return; }

    // Podívat se, zda 2. klik je na jinou úsečku/segment
    const idx2 = findObjectAt(wx, wy);
    if (idx2 !== null) {
      const obj2 = state.objects[idx2];
      const ls2 = getLineSegment(obj2, wx, wy);
      if (ls2 && !(idx2 === state._parallelRefIdx && ls2.segIdx === refSeg.segIdx)) {
        // Režim: otočit první segment do rovnoběžnosti s druhým
        const refAngle = Math.atan2(ls2.seg.y2 - ls2.seg.y1, ls2.seg.x2 - ls2.seg.x1);
        const curAngle = Math.atan2(refSeg.seg.y2 - refSeg.seg.y1, refSeg.seg.x2 - refSeg.seg.x1);
        // Vybrat bližší z refAngle a refAngle+π (obojí je rovnoběžné)
        let targetAngle = refAngle;
        const diff1 = Math.abs(Math.atan2(Math.sin(refAngle - curAngle), Math.cos(refAngle - curAngle)));
        const alt = refAngle + Math.PI;
        const diff2 = Math.abs(Math.atan2(Math.sin(alt - curAngle), Math.cos(alt - curAngle)));
        if (diff2 < diff1) targetAngle = alt;

        const len = Math.hypot(refSeg.seg.x2 - refSeg.seg.x1, refSeg.seg.y2 - refSeg.seg.y1);
        // Kotevní bod = konec bližší k prvnímu kliknutí (zachová propojení kontury)
        const cx = state._parallelClickX, cy = state._parallelClickY;
        const d1 = Math.hypot(cx - refSeg.seg.x1, cy - refSeg.seg.y1);
        const d2 = Math.hypot(cx - refSeg.seg.x2, cy - refSeg.seg.y2);

        pushUndo();
        let movedEnd;
        if (d1 <= d2) {
          // P1 je kotva
          refSeg.setP2(refSeg.seg.x1 + len * Math.cos(targetAngle), refSeg.seg.y1 + len * Math.sin(targetAngle));
          movedEnd = 'p2';
        } else {
          // P2 je kotva
          refSeg.setP1(refSeg.seg.x2 - len * Math.cos(targetAngle), refSeg.seg.y2 - len * Math.sin(targetAngle));
          movedEnd = 'p1';
        }
        // Uložit vazbu na objekt
        setConstraint(state.objects[state._parallelRefIdx], refSeg.segIdx, 'parallel');
        // Propagovat na sousední segmenty polyline
        propagateConstraints(state.objects[state._parallelRefIdx], refSeg.segIdx, movedEnd);

        showToast("Otočeno do rovnoběžnosti ✓");
        state.drawing = false;
        state._parallelRefIdx = null;
        state._parallelRefSeg = null;
        state.selectedSegment = null;
        state.multiSelectedSegments.clear();
        calculateAllIntersections();
        renderAll();
        resetHint();
        return;
      }
    }

    // Režim: nová rovnoběžka procházející bodem (původní chování)
    const dx = refSeg.seg.x2 - refSeg.seg.x1;
    const dy = refSeg.seg.y2 - refSeg.seg.y1;
    pushUndo();
    addObject({
      type: 'line',
      x1: wx - dx / 2, y1: wy - dy / 2,
      x2: wx + dx / 2, y2: wy + dy / 2,
      name: `Rovnoběžka ${state.nextId}`,
    });
    showToast("Rovnoběžka vytvořena ✓");
    state.drawing = false;
    state._parallelRefIdx = null;
    state._parallelRefSeg = null;
    state.selectedSegment = null;
    state.multiSelectedSegments.clear();
    calculateAllIntersections();
    renderAll();
    resetHint();
  }
}

/** Rovnoběžka z předvybraných objektů. Vrací true pokud se operace provedla. */
export function parallelFromSelection() {
  const { lines, points } = analyzeSelection();
  if (lines.length === 0) return false;

  // Vzor A: 2 úsečky → otočit první do rovnoběžnosti s druhou
  if (lines.length >= 2) {
    const info1 = lines[0], info2 = lines[1];
    const obj1 = state.objects[info1.idx];
    if (!obj1) return false;

    let ls1;
    if (obj1.type === 'polyline' && info1.segIdx !== null) {
      const v = obj1.vertices, si = info1.segIdx, n = v.length;
      const p1 = v[si], p2 = v[(si + 1) % n];
      if ((obj1.bulges?.[si] || 0) !== 0) { showToast("Rovnoběžka obloukového segmentu není podporována"); return true; }
      ls1 = { seg: { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }, setP1: (x, y) => { p1.x = x; p1.y = y; }, setP2: (x, y) => { p2.x = x; p2.y = y; }, segIdx: si };
    } else {
      ls1 = getLineSegment(obj1, (obj1.x1 + obj1.x2) / 2, (obj1.y1 + obj1.y2) / 2);
    }
    if (!ls1) return false;

    const refAngle = Math.atan2(info2.y2 - info2.y1, info2.x2 - info2.x1);
    const curAngle = Math.atan2(ls1.seg.y2 - ls1.seg.y1, ls1.seg.x2 - ls1.seg.x1);
    let targetAngle = refAngle;
    const diff1 = Math.abs(Math.atan2(Math.sin(refAngle - curAngle), Math.cos(refAngle - curAngle)));
    const alt = refAngle + Math.PI;
    const diff2 = Math.abs(Math.atan2(Math.sin(alt - curAngle), Math.cos(alt - curAngle)));
    if (diff2 < diff1) targetAngle = alt;

    const len = Math.hypot(ls1.seg.x2 - ls1.seg.x1, ls1.seg.y2 - ls1.seg.y1);

    pushUndo();
    // Kotva je P1
    ls1.setP2(ls1.seg.x1 + len * Math.cos(targetAngle), ls1.seg.y1 + len * Math.sin(targetAngle));
    setConstraint(obj1, ls1.segIdx, 'parallel');
    propagateConstraints(obj1, ls1.segIdx, 'p2');
    calculateAllIntersections();
    renderAll();
    showToast("Otočeno do rovnoběžnosti ✓");
    return true;
  }

  // Vzor B: 1 úsečka + bod(y) → nová rovnoběžka přes bod
  if (lines.length === 1 && points.length >= 1) {
    const info = lines[0];
    const dx = info.x2 - info.x1, dy = info.y2 - info.y1;
    const pt = points[0];
    pushUndo();
    addObject({
      type: 'line',
      x1: pt.x - dx / 2, y1: pt.y - dy / 2,
      x2: pt.x + dx / 2, y2: pt.y + dy / 2,
      name: `Rovnoběžka ${state.nextId}`,
    });
    calculateAllIntersections();
    renderAll();
    showToast("Rovnoběžka vytvořena ✓");
    return true;
  }

  return false;
}
