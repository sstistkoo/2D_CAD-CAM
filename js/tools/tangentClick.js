// ╔══════════════════════════════════════════════════════════════╗
// ║  Tečna – click logika                                      ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, pushUndo, showToast } from '../state.js';
import { renderAll } from '../render.js';
import { addObject } from '../objects.js';
import { setHint, resetHint } from '../ui.js';
import {
  findObjectAt, findSegmentAt, calculateAllIntersections,
  tangentsFromPointToCircle, tangentsTwoCircles,
  circlePositionsTangentToLine, circlePositionsTangentToTwoLines,
  circlePositionsTangentToLineAndPoint, getPolylineSegmentAsLine,
  circleThrough3Points, circleTangentToLineAndTwoPoints,
  circleTangentToTwoLinesAndPoint, circleTangentToThreeLines,
  circleTangentToCircleAndTwoPoints
} from '../geometry.js';
import { showTangentChoiceDialog, showTangentPositionDialog } from '../dialogs.js';
import { hasAnchoredPoint } from './anchorClick.js';

// ── Pomocné funkce pro extrakci dat z výběru ──

/**
 * Získá úsečkové data z objektu nebo polyline segmentu.
 */
function getLineData(objIdx, segIdx) {
  const obj = state.objects[objIdx];
  if (!obj) return null;
  if (obj.type === 'line' || obj.type === 'constr') {
    return { x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 };
  }
  if (obj.type === 'polyline' && segIdx !== null && segIdx !== undefined) {
    return getPolylineSegmentAsLine(obj, segIdx);
  }
  return null;
}

/**
 * Získá kružnici z objektu.
 */
function getCircleData(objIdx) {
  const obj = state.objects[objIdx];
  if (!obj) return null;
  if (obj.type === 'circle' || obj.type === 'arc') {
    return { idx: objIdx, cx: obj.cx, cy: obj.cy, r: obj.r };
  }
  return null;
}

/**
 * Analyzuje výběr a vrátí kategorizované objekty.
 */
function analyzeSelection() {
  const circles = [];
  const lines = [];
  const points = state.selectedPoint ? [...state.selectedPoint] : [];

  const allSelected = new Set();
  if (state.selected !== null) allSelected.add(state.selected);
  for (const idx of state.multiSelected) allSelected.add(idx);

  for (const idx of allSelected) {
    const obj = state.objects[idx];
    if (!obj) continue;

    if (obj.type === 'circle' || obj.type === 'arc') {
      circles.push({ idx, cx: obj.cx, cy: obj.cy, r: obj.r });
    } else if (obj.type === 'line' || obj.type === 'constr') {
      lines.push({ idx, x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 });
    } else if (obj.type === 'polyline') {
      // Pokud má vybraný segment, použít ten jako úsečku
      if (state.selectedSegment !== null && state._selectedSegmentObjIdx === idx) {
        const seg = getPolylineSegmentAsLine(obj, state.selectedSegment);
        if (seg) {
          lines.push({ idx, segIdx: state.selectedSegment, ...seg });
        }
      }
    }
  }

  return { circles, lines, points };
}

/**
 * Zpracuje výběr a provede tečnou operaci na základě vybraných objektů.
 * Vrací true pokud se operace provedla, false pokud ne.
 */
export function tangentFromSelection() {
  const hasSelection = state.selected !== null || state.multiSelected.size > 0;
  const hasPoints = state.selectedPoint && state.selectedPoint.length > 0;
  if (!hasSelection && !hasPoints) return false;

  const { circles, lines, points } = analyzeSelection();
  const totalConstraints = lines.length + points.length + Math.max(0, circles.length - 1);

  // Kontrola kotvení – pokud se má měnit kružnice, která je zakotvená, zabránit
  if (circles.length >= 1 && totalConstraints >= 1) {
    const circObj = state.objects[circles[0].idx];
    if (circObj && hasAnchoredPoint(circObj)) {
      showToast("Kružnice je zakotvena – nelze přesunout tečně");
      return true;
    }
  }

  // ════════════════════════════════════════════════════════════════
  // 3 vazby → změní se poloměr i pozice kružnice
  // ════════════════════════════════════════════════════════════════

  if (circles.length >= 1 && totalConstraints >= 3) {
    const circ = circles[0]; // kružnice, která se změní
    const otherCircles = circles.slice(1);
    let positions = [];

    if (lines.length >= 3) {
      // 1 kružnice + 3 úsečky → tečná ke třem přímkám
      positions = circleTangentToThreeLines(lines[0], lines[1], lines[2]);
    } else if (lines.length === 2 && points.length >= 1) {
      // 1 kružnice + 2 úsečky + 1 bod → tečná ke dvěma přímkám přes bod
      positions = circleTangentToTwoLinesAndPoint(lines[0], lines[1], points[0].x, points[0].y);
    } else if (lines.length === 1 && points.length >= 2) {
      // 1 kružnice + 1 úsečka + 2 body → tečná k přímce přes 2 body
      positions = circleTangentToLineAndTwoPoints(
        lines[0].x1, lines[0].y1, lines[0].x2, lines[0].y2,
        points[0].x, points[0].y, points[1].x, points[1].y
      );
    } else if (lines.length === 0 && points.length >= 3) {
      // 1 kružnice + 3 body → opsaná kružnice
      positions = circleThrough3Points(
        points[0].x, points[0].y, points[1].x, points[1].y, points[2].x, points[2].y
      );
    } else if (otherCircles.length >= 1 && points.length >= 2) {
      // 1 kružnice + 1 jiná kružnice + 2 body → tečná ke kružnici přes 2 body
      const oc = otherCircles[0];
      positions = circleTangentToCircleAndTwoPoints(
        oc.cx, oc.cy, oc.r, points[0].x, points[0].y, points[1].x, points[1].y
      );
    }

    if (positions.length > 0) {
      showTangentPositionDialog(positions, state.objects[circ.idx], (chosenIdx) => {
        pushUndo();
        const obj = state.objects[circ.idx];
        obj.cx = positions[chosenIdx].cx;
        obj.cy = positions[chosenIdx].cy;
        obj.r = positions[chosenIdx].r;
        calculateAllIntersections();
        renderAll();
        showToast("Kružnice upravena tečně ke třem objektům ✓");
      });
      return true;
    }
    if (totalConstraints >= 3 && positions.length === 0) {
      showToast("Tečnou kružnici ke třem objektům nelze najít");
      return true;
    }
  }

  // ════════════════════════════════════════════════════════════════
  // 3 body bez kružnice → vytvořit opsanou kružnici
  // ════════════════════════════════════════════════════════════════
  if (circles.length === 0 && lines.length === 0 && points.length >= 3) {
    const positions = circleThrough3Points(
      points[0].x, points[0].y, points[1].x, points[1].y, points[2].x, points[2].y
    );
    if (positions.length === 0) {
      showToast("Body jsou kolineární, kružnice neexistuje");
      return true;
    }
    pushUndo();
    const p = positions[0];
    addObject({
      type: 'circle', cx: p.cx, cy: p.cy, r: p.r,
      name: `Kružnice ${state.nextId}`,
    });
    calculateAllIntersections();
    renderAll();
    showToast("Vytvořena opsaná kružnice přes 3 body ✓");
    return true;
  }

  // ════════════════════════════════════════════════════════════════
  // 2 vazby → stávající logika (přesun bez změny poloměru)
  // ════════════════════════════════════════════════════════════════

  // ── Kružnice + Úsečka + Bod → přesun kružnice tečně k úsečce a přes bod ──
  if (circles.length === 1 && lines.length >= 1 && points.length >= 1) {
    const circ = circles[0];
    const line = lines[0];
    const pt = points[0];
    const positions = circlePositionsTangentToLineAndPoint(
      circ.r, line.x1, line.y1, line.x2, line.y2, pt.x, pt.y
    );
    if (positions.length === 0) {
      showToast("Tečná pozice s bodem neexistuje");
      return true;
    }
    showTangentPositionDialog(positions, state.objects[circ.idx], (chosenIdx) => {
      pushUndo();
      const obj = state.objects[circ.idx];
      obj.cx = positions[chosenIdx].cx;
      obj.cy = positions[chosenIdx].cy;
      calculateAllIntersections();
      renderAll();
      showToast("Kružnice přesunuta tečně k úsečce přes bod ✓");
    });
    return true;
  }

  // ── Kružnice + Úsečka → přesun kružnice tečně k úsečce ──
  if (circles.length === 1 && lines.length >= 1) {
    const circ = circles[0];
    const line = lines[0];
    const circObj = state.objects[circ.idx];
    const positions = circlePositionsTangentToLine(
      circ.cx, circ.cy, circ.r, line.x1, line.y1, line.x2, line.y2
    );
    if (positions.length === 0) {
      showToast("Tečnou pozici nelze vypočítat");
      return true;
    }
    if (lines.length >= 2) {
      // Dvě úsečky → tečnost k oběma
      const line2 = lines[1];
      const positions2 = circlePositionsTangentToTwoLines(circ.r,
        { x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2 },
        { x1: line2.x1, y1: line2.y1, x2: line2.x2, y2: line2.y2 }
      );
      if (positions2.length === 0) {
        showToast("Tečnou pozici ke dvěma úsečkám nelze najít");
        return true;
      }
      showTangentPositionDialog(positions2, circObj, (chosenIdx) => {
        pushUndo();
        circObj.cx = positions2[chosenIdx].cx;
        circObj.cy = positions2[chosenIdx].cy;
        calculateAllIntersections();
        renderAll();
        showToast("Kružnice přesunuta tečně ke dvěma úsečkám ✓");
      });
      return true;
    }
    showTangentPositionDialog(positions, circObj, (chosenIdx) => {
      pushUndo();
      circObj.cx = positions[chosenIdx].cx;
      circObj.cy = positions[chosenIdx].cy;
      calculateAllIntersections();
      renderAll();
      showToast("Kružnice přesunuta tečně k úsečce ✓");
    });
    return true;
  }

  // ── Kružnice + Kružnice → tečné úsečky ──
  if (circles.length === 2 && lines.length === 0) {
    const c1 = circles[0], c2 = circles[1];
    const tangents = tangentsTwoCircles(c1.cx, c1.cy, c1.r, c2.cx, c2.cy, c2.r);
    if (tangents.length === 0) {
      showToast("Tečny mezi kružnicemi neexistují");
      return true;
    }
    showTangentChoiceDialog(tangents, (indices) => {
      for (const i of indices) {
        const t = tangents[i];
        addObject({
          type: 'line',
          x1: t.x1, y1: t.y1, x2: t.x2, y2: t.y2,
          name: `Tečna ${state.nextId}`,
        });
      }
      showToast(`Vytvořeno ${indices.length} tečen ✓`);
    });
    return true;
  }

  // ── Kružnice + 2 body → přesun kružnice přes oba body (zachovat poloměr) ──
  if (circles.length === 1 && lines.length === 0 && points.length >= 2) {
    const circ = circles[0];
    const p1 = points[0], p2 = points[1];
    const r = circ.r;
    // Střed kružnice procházející dvěma body leží na kolmici k úsečce p1-p2 ve středu
    const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const halfDist = Math.hypot(dx, dy) / 2;
    if (halfDist > r + 1e-9) {
      showToast("Body jsou příliš daleko – kružnice jimi nemůže procházet");
      return true;
    }
    const h = Math.sqrt(Math.max(0, r * r - halfDist * halfDist));
    const nx = -dy / (halfDist * 2), ny = dx / (halfDist * 2);
    const positions = [
      { cx: mx + nx * h, cy: my + ny * h },
      { cx: mx - nx * h, cy: my - ny * h }
    ];
    // Seřadit: bližší k aktuální pozici kružnice první
    positions.sort((a, b) => {
      const da = Math.hypot(a.cx - circ.cx, a.cy - circ.cy);
      const db = Math.hypot(b.cx - circ.cx, b.cy - circ.cy);
      return da - db;
    });
    // Deduplikace (body na průměru → jedna pozice)
    if (positions.length === 2 &&
        Math.hypot(positions[0].cx - positions[1].cx, positions[0].cy - positions[1].cy) < 1e-4) {
      positions.pop();
    }
    showTangentPositionDialog(positions, state.objects[circ.idx], (chosenIdx) => {
      pushUndo();
      const obj = state.objects[circ.idx];
      obj.cx = positions[chosenIdx].cx;
      obj.cy = positions[chosenIdx].cy;
      calculateAllIntersections();
      renderAll();
      showToast("Kružnice přesunuta přes 2 body ✓");
    });
    return true;
  }

  // ── Bod + Kružnice → tečné úsečky z bodu ──
  if (circles.length === 1 && lines.length === 0 && points.length >= 1) {
    const circ = circles[0];
    const pt = points[0];
    const tangents = tangentsFromPointToCircle(pt.x, pt.y, circ.cx, circ.cy, circ.r);
    if (tangents.length === 0) {
      showToast("Tečna neexistuje (bod uvnitř kružnice)");
      return true;
    }
    showTangentChoiceDialog(tangents, (indices) => {
      for (const i of indices) {
        const t = tangents[i];
        addObject({
          type: 'line',
          x1: t.x1, y1: t.y1, x2: t.x2, y2: t.y2,
          name: `Tečna ${state.nextId}`,
        });
      }
      showToast(`Vytvořeno ${indices.length} tečn ✓`);
    });
    return true;
  }

  // ── Kružnice + Bod (bez úsečky) → přesun kružnice přes bod ──
  // (Zachovat poloměr, přesunout střed tak aby procházela bodem – ale to je triviální
  //  a není tečná operace, takže to vynecháme)

  return false; // Nebyl rozpoznán žádný pattern
}

export function handleTangentClick(wx, wy) {
  // ── Pokud nejsme v drawing režimu, zkusit selection-based operaci ──
  if (!state.drawing) {
    // Zkontrolovat předvybrané objekty
    const hasSelection = state.selected !== null || state.multiSelected.size > 0;
    const hasPoints = state.selectedPoint && state.selectedPoint.length > 0;

    if (hasSelection || hasPoints) {
      // Analyzovat výběr a zkusit provést operaci
      if (tangentFromSelection()) {
        return; // Operace se provedla z výběru
      }
    }

    // Fallback na klasický click-based režim
    const idx = findObjectAt(wx, wy);
    if (idx !== null) {
      const obj = state.objects[idx];
      if (obj.type === 'circle' || obj.type === 'arc') {
        // Režim B: první kružnice
        state.drawing = true;
        state._tangentMode = 'circle-first';
        state._tangentFirstCircle = idx;
        setHint("Klepněte na kružnici pro tečny, nebo úsečku pro tečné napojení");
        return;
      }
    }
    // Režim A: bod
    state.drawing = true;
    state._tangentMode = 'point-circle';
    state.tempPoints = [{ x: wx, y: wy }];
    setHint("Klepněte na kružnici/oblouk pro tečnu z bodu");
  } else {
    if (state._tangentMode === 'point-circle') {
      // Druhý klik: musí být na kružnici/oblouk
      const idx = findObjectAt(wx, wy);
      if (idx === null) { showToast("Klepněte na kružnici nebo oblouk"); return; }
      const obj = state.objects[idx];
      if (obj.type !== 'circle' && obj.type !== 'arc') {
        showToast("Vyberte kružnici nebo oblouk");
        return;
      }
      const p = state.tempPoints[0];
      const tangents = tangentsFromPointToCircle(p.x, p.y, obj.cx, obj.cy, obj.r);
      if (tangents.length === 0) {
        showToast("Tečna neexistuje (bod uvnitř kružnice)");
      } else {
        showTangentChoiceDialog(tangents, (indices) => {
          for (const i of indices) {
            const t = tangents[i];
            addObject({
              type: 'line',
              x1: t.x1, y1: t.y1, x2: t.x2, y2: t.y2,
              name: `Tečna ${state.nextId}`,
            });
          }
          showToast(`Vytvořeno ${indices.length} tečn${indices.length === 1 ? 'a' : indices.length < 5 ? 'y' : ''}`);
        });
      }
    } else if (state._tangentMode === 'circle-first') {
      const idx = findObjectAt(wx, wy);
      if (idx === null) { showToast("Klepněte na kružnici, oblouk nebo úsečku"); return; }
      const obj = state.objects[idx];

      if (obj.type === 'circle' || obj.type === 'arc') {
        // Režim B1: kružnice → kružnice (tečné úsečky)
        if (idx === state._tangentFirstCircle) {
          showToast("Vyberte jinou kružnici nebo úsečku");
          return;
        }
        const c1 = state.objects[state._tangentFirstCircle];
        const tangents = tangentsTwoCircles(c1.cx, c1.cy, c1.r, obj.cx, obj.cy, obj.r);
        if (tangents.length === 0) {
          showToast("Tečny neexistují");
        } else {
          showTangentChoiceDialog(tangents, (indices) => {
            for (const i of indices) {
              const t = tangents[i];
              addObject({
                type: 'line',
                x1: t.x1, y1: t.y1, x2: t.x2, y2: t.y2,
                name: `Tečna ${state.nextId}`,
              });
            }
            showToast(`Vytvořeno ${indices.length} tečen`);
          });
        }
      } else if (obj.type === 'line' || obj.type === 'constr') {
        // Režim B2: kružnice → úsečka (přesun kružnice tečně k úsečce)
        const circIdx = state._tangentFirstCircle;
        const circ = state.objects[circIdx];
        const lineIdx = idx;
        const positions = circlePositionsTangentToLine(circ.cx, circ.cy, circ.r, obj.x1, obj.y1, obj.x2, obj.y2);
        if (positions.length === 0) {
          showToast("Tečnou pozici nelze vypočítat");
        } else {
          showTangentPositionDialog(positions, circ, (chosenIdx) => {
            pushUndo();
            circ.cx = positions[chosenIdx].cx;
            circ.cy = positions[chosenIdx].cy;
            calculateAllIntersections();
            renderAll();
            showToast("Kružnice přesunuta tečně k úsečce");
            // Nabídnout druhou úsečku
            state.drawing = true;
            state._tangentMode = 'circle-line-2';
            state._tangentFirstCircle = circIdx;
            state._tangentFirstLine = lineIdx;
            setHint("Klepněte na druhou úsečku pro tečnost s oběma, nebo Esc/zrušit");
          });
          return;
        }
      } else if (obj.type === 'polyline') {
        // Polyline → najít nejbližší segment a použít jako úsečku
        const segIdx = findSegmentAt(obj, wx, wy);
        if (segIdx !== null) {
          const seg = getPolylineSegmentAsLine(obj, segIdx);
          if (seg && (obj.bulges[segIdx] || 0) === 0) {
            const circIdx = state._tangentFirstCircle;
            const circ = state.objects[circIdx];
            const positions = circlePositionsTangentToLine(circ.cx, circ.cy, circ.r, seg.x1, seg.y1, seg.x2, seg.y2);
            if (positions.length === 0) {
              showToast("Tečnou pozici nelze vypočítat");
            } else {
              showTangentPositionDialog(positions, circ, (chosenIdx) => {
                pushUndo();
                circ.cx = positions[chosenIdx].cx;
                circ.cy = positions[chosenIdx].cy;
                calculateAllIntersections();
                renderAll();
                showToast("Kružnice přesunuta tečně k segmentu kontury");
              });
              return;
            }
          } else {
            showToast("Tečnost k obloukovému segmentu není podporována");
            return;
          }
        }
      } else {
        showToast("Vyberte kružnici, oblouk nebo úsečku");
        // Neukončovat drawing – uživatel může kliknout znovu
        return;
      }
    } else if (state._tangentMode === 'circle-line-2') {
      // Třetí klik: druhá úsečka pro tečnost se dvěma úsečkami
      const idx = findObjectAt(wx, wy);
      if (idx === null) { showToast("Klepněte na úsečku"); return; }
      const obj = state.objects[idx];
      if (obj.type !== 'line' && obj.type !== 'constr') {
        showToast("Vyberte úsečku");
        return;
      }
      if (idx === state._tangentFirstLine) {
        showToast("Vyberte jinou úsečku");
        return;
      }
      const circ = state.objects[state._tangentFirstCircle];
      const line1 = state.objects[state._tangentFirstLine];
      const positions = circlePositionsTangentToTwoLines(circ.r, line1, obj);
      if (positions.length === 0) {
        showToast("Tečnou pozici ke dvěma úsečkám nelze najít");
      } else {
        showTangentPositionDialog(positions, circ, (chosenIdx) => {
          pushUndo();
          circ.cx = positions[chosenIdx].cx;
          circ.cy = positions[chosenIdx].cy;
          calculateAllIntersections();
          renderAll();
          showToast("Kružnice přesunuta tečně ke dvěma úsečkám");
        });
      }
    }
    // Reset stavu
    state.drawing = false;
    state.tempPoints = [];
    state._tangentMode = null;
    state._tangentFirstCircle = null;
    state._tangentFirstLine = null;
    resetHint();
  }
}
