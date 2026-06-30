// ╔══════════════════════════════════════════════════════════════╗
// ║  Zaoblení / Zkosení (Fillet / Chamfer) – sdružený nástroj  ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, pushUndo, showToast } from '../state.js';
import { renderAll } from '../render.js';
import { addObject } from '../objects.js';
import { setHint } from '../ui.js';
import { drawCanvas, screenToWorld, snapPt } from '../canvas.js';
import { findObjectAt, calculateAllIntersections, filletTwoLines, chamferTwoLines } from '../geometry.js';
import { showFilletChamferDialog } from '../dialogs.js';
import { getLineSegment, analyzeSelection } from './helpers.js';
import { isAnchored } from './anchorClick.js';
import { updateAssociativeDimensions } from '../dialogs/dimension.js';
import { SELECT_THRESHOLD } from '../constants.js';

// ── Interní pomocné funkce ──

/**
 * Najde roh: dva různé úsečkové segmenty sdílející endpoint blízko (wx, wy).
 * Vrátí { ls1, ls2 } nebo null.
 */
function findCornerAt(wx, wy) {
  const threshold = SELECT_THRESHOLD / state.zoom;
  const candidates = [];

  for (let i = 0; i < state.objects.length; i++) {
    const obj = state.objects[i];

    if (obj.type === 'line') {
      const mkLs = () => ({
        seg: { x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 },
        setP1: (x, y) => { obj.x1 = x; obj.y1 = y; },
        setP2: (x, y) => { obj.x2 = x; obj.y2 = y; },
        segIdx: null,
      });
      const d1 = Math.hypot(obj.x1 - wx, obj.y1 - wy);
      if (d1 < threshold) candidates.push({ idx: i, ls: mkLs(), ep: { x: obj.x1, y: obj.y1 }, dist: d1 });
      const d2 = Math.hypot(obj.x2 - wx, obj.y2 - wy);
      if (d2 < threshold) candidates.push({ idx: i, ls: mkLs(), ep: { x: obj.x2, y: obj.y2 }, dist: d2 });

    } else if (obj.type === 'polyline') {
      const v = obj.vertices, n = v.length;
      const segs = obj.closed ? n : n - 1;
      for (let si = 0; si < segs; si++) {
        const pa = v[si], pb = v[(si + 1) % n];
        if ((obj.bulges?.[si] || 0) !== 0) continue;
        const mkLs = () => ({
          seg: { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y },
          setP1: (x, y) => { pa.x = x; pa.y = y; },
          setP2: (x, y) => { pb.x = x; pb.y = y; },
          segIdx: si,
        });
        const da = Math.hypot(pa.x - wx, pa.y - wy);
        if (da < threshold) candidates.push({ idx: i, ls: mkLs(), ep: { x: pa.x, y: pa.y }, dist: da });
        const db = Math.hypot(pb.x - wx, pb.y - wy);
        if (db < threshold) candidates.push({ idx: i, ls: mkLs(), ep: { x: pb.x, y: pb.y }, dist: db });
      }
    }
  }

  if (candidates.length < 2) return null;

  // Hledáme pár se sdíleným endpointem (geometrická tolerance 1 mm)
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i], b = candidates[j];
      if (a.idx === b.idx && (a.ls.segIdx === null || a.ls.segIdx === b.ls.segIdx)) continue;
      if (Math.hypot(a.ep.x - b.ep.x, a.ep.y - b.ep.y) < 1e-3) {
        return { ls1: a.ls, ls2: b.ls };
      }
    }
  }
  return null;
}

/** Provede zaoblení nebo zkosení dvou segmentů a aktualizuje canvas. */
function applyFilletChamfer(mode, p1, p2, ls1, ls2) {
  const proxy1 = { x1: ls1.seg.x1, y1: ls1.seg.y1, x2: ls1.seg.x2, y2: ls1.seg.y2 };
  const proxy2 = { x1: ls2.seg.x1, y1: ls2.seg.y1, x2: ls2.seg.x2, y2: ls2.seg.y2 };

  pushUndo();

  if (mode === 'fillet') {
    const result = filletTwoLines(proxy1, proxy2, p1);
    if (!result.ok) { showToast(result.msg); return; }
    if (!isAnchored(ls1.seg.x1, ls1.seg.y1)) ls1.setP1(proxy1.x1, proxy1.y1);
    if (!isAnchored(ls1.seg.x2, ls1.seg.y2)) ls1.setP2(proxy1.x2, proxy1.y2);
    if (!isAnchored(ls2.seg.x1, ls2.seg.y1)) ls2.setP1(proxy2.x1, proxy2.y1);
    if (!isAnchored(ls2.seg.x2, ls2.seg.y2)) ls2.setP2(proxy2.x2, proxy2.y2);
    result.arc.name = `Zaoblení R${p1}`;
    addObject(result.arc);
    showToast(`Zaoblení R${p1} vytvořeno ✓`);
  } else {
    const result = chamferTwoLines(proxy1, proxy2, p1, p2);
    if (!result.ok) { showToast(result.msg); return; }
    if (!isAnchored(ls1.seg.x1, ls1.seg.y1)) ls1.setP1(proxy1.x1, proxy1.y1);
    if (!isAnchored(ls1.seg.x2, ls1.seg.y2)) ls1.setP2(proxy1.x2, proxy1.y2);
    if (!isAnchored(ls2.seg.x1, ls2.seg.y1)) ls2.setP1(proxy2.x1, proxy2.y1);
    if (!isAnchored(ls2.seg.x2, ls2.seg.y2)) ls2.setP2(proxy2.x2, proxy2.y2);
    result.line.color = state.currentColor;
    result.line.name = `Zkosení ${p1}×${p2}`;
    addObject(result.line);
    showToast(`Zkosení ${p1}×${p2} vytvořeno ✓`);
  }

  calculateAllIntersections();
  updateAssociativeDimensions();
  renderAll();
}

// ── Veřejné funkce ──

/**
 * Klik při aktivním nástroji filletChamfer.
 * Parametry jsou předem uloženy v state._fcMode / _fcP1 / _fcP2 (nastavuje activateFilletChamfer v ui.js).
 *
 * Logika:
 *  1. Rohový klik: pokud jsou blízko (wx,wy) dva segmenty se sdíleným vrcholem → provede rovnou.
 *  2. Klik na 1. úsečku → čeká na klik na 2. úsečku.
 * Nástroj zůstane aktivní, dokud uživatel nepřepne jiný nástroj.
 */
export function handleFilletChamferClick(wx, wy) {
  const mode = state._fcMode || 'fillet';
  const p1   = state._fcP1   ?? 2;
  const p2   = state._fcP2   ?? 2;

  // 1. Pokus: rohový klik
  const corner = findCornerAt(wx, wy);
  if (corner) {
    applyFilletChamfer(mode, p1, p2, corner.ls1, corner.ls2);
    return;
  }

  // 2. Záloha: klik na první úsečku, pak čekání na druhou
  const idx = findObjectAt(wx, wy);
  if (idx === null) { showToast("Klepněte na roh nebo na první úsečku"); return; }
  const obj1 = state.objects[idx];
  const ls1  = getLineSegment(obj1, wx, wy);
  if (!ls1) { showToast("Funguje pouze pro úsečky a rovné segmenty kontur"); return; }

  state.selected = idx;
  renderAll();
  setHint("Klepněte na druhou úsečku");
  showToast("Klepněte na druhou úsečku");

  function onSecondClick(e) {
    const rect = drawCanvas.getBoundingClientRect();
    const sx = (e.clientX ?? e.changedTouches?.[0]?.clientX) - rect.left;
    const sy = (e.clientY ?? e.changedTouches?.[0]?.clientY) - rect.top;
    let [wx2, wy2] = screenToWorld(sx, sy);
    if (state.snapToPoints) [wx2, wy2] = snapPt(wx2, wy2);

    const idx2 = findObjectAt(wx2, wy2);
    if (idx2 === null) { showToast("Klepněte na úsečku"); return; }
    if (idx2 === idx && ls1.segIdx === null) { showToast("Klepněte na jinou úsečku"); return; }
    const obj2 = state.objects[idx2];
    const ls2  = getLineSegment(obj2, wx2, wy2);
    if (!ls2) { showToast("Funguje pouze pro úsečky a rovné segmenty kontur"); return; }
    if (idx2 === idx && ls1.segIdx !== null && ls2.segIdx === ls1.segIdx) { showToast("Klepněte na jiný segment"); return; }

    cleanup();
    applyFilletChamfer(mode, p1, p2, ls1, ls2);

    // Obnovit hint pro další operaci (nástroj zůstává aktivní)
    setHint(mode === 'fillet'
      ? `Klikněte na roh nebo 1. úsečku (R${p1})`
      : `Klikněte na roh nebo 1. úsečku (${p1}×${p2})`);
  }

  function onSecondTouch(e) {
    if (e.changedTouches.length === 1) { e.preventDefault(); onSecondClick(e); }
  }

  function cleanup() {
    drawCanvas.removeEventListener('click', onSecondClick);
    drawCanvas.removeEventListener('touchend', onSecondTouch);
  }

  drawCanvas.addEventListener('click', onSecondClick);
  drawCanvas.addEventListener('touchend', onSecondTouch);
  state._toolCleanup = cleanup;
}

/** Zaoblení/zkosení z 2 předvybraných úseček (volá vlastní dialog). */
export function filletChamferFromSelection() {
  const { lines } = analyzeSelection();
  if (lines.length !== 2) return false;

  const info1 = lines[0], info2 = lines[1];
  const obj1  = state.objects[info1.idx];
  const obj2  = state.objects[info2.idx];
  if (!obj1 || !obj2) return false;

  let ls1, ls2;
  if (obj1.type === 'polyline' && info1.segIdx !== null) {
    const v = obj1.vertices, si = info1.segIdx, n = v.length;
    const pa = v[si], pb = v[(si + 1) % n];
    if ((obj1.bulges?.[si] || 0) !== 0) { showToast("Obloukový segment není podporován"); return true; }
    ls1 = { seg: { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y }, setP1: (x, y) => { pa.x = x; pa.y = y; }, setP2: (x, y) => { pb.x = x; pb.y = y; }, segIdx: si };
  } else {
    ls1 = getLineSegment(obj1, (obj1.x1 + obj1.x2) / 2, (obj1.y1 + obj1.y2) / 2);
  }
  if (obj2.type === 'polyline' && info2.segIdx !== null) {
    const v = obj2.vertices, si = info2.segIdx, n = v.length;
    const pa = v[si], pb = v[(si + 1) % n];
    if ((obj2.bulges?.[si] || 0) !== 0) { showToast("Obloukový segment není podporován"); return true; }
    ls2 = { seg: { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y }, setP1: (x, y) => { pa.x = x; pa.y = y; }, setP2: (x, y) => { pb.x = x; pb.y = y; }, segIdx: si };
  } else {
    ls2 = getLineSegment(obj2, (obj2.x1 + obj2.x2) / 2, (obj2.y1 + obj2.y2) / 2);
  }
  if (!ls1 || !ls2) return false;

  showFilletChamferDialog((mode, p1, p2) => {
    const proxy1 = { x1: ls1.seg.x1, y1: ls1.seg.y1, x2: ls1.seg.x2, y2: ls1.seg.y2 };
    const proxy2 = { x1: ls2.seg.x1, y1: ls2.seg.y1, x2: ls2.seg.x2, y2: ls2.seg.y2 };

    pushUndo();

    if (mode === 'fillet') {
      const result = filletTwoLines(proxy1, proxy2, p1);
      if (!result.ok) { showToast(result.msg); return; }
      if (!isAnchored(ls1.seg.x1, ls1.seg.y1)) ls1.setP1(proxy1.x1, proxy1.y1);
      if (!isAnchored(ls1.seg.x2, ls1.seg.y2)) ls1.setP2(proxy1.x2, proxy1.y2);
      if (!isAnchored(ls2.seg.x1, ls2.seg.y1)) ls2.setP1(proxy2.x1, proxy2.y1);
      if (!isAnchored(ls2.seg.x2, ls2.seg.y2)) ls2.setP2(proxy2.x2, proxy2.y2);
      result.arc.name = `Zaoblení R${p1}`;
      addObject(result.arc);
      showToast(`Zaoblení R${p1} vytvořeno ✓`);
    } else {
      const result = chamferTwoLines(proxy1, proxy2, p1, p2);
      if (!result.ok) { showToast(result.msg); return; }
      if (!isAnchored(ls1.seg.x1, ls1.seg.y1)) ls1.setP1(proxy1.x1, proxy1.y1);
      if (!isAnchored(ls1.seg.x2, ls1.seg.y2)) ls1.setP2(proxy1.x2, proxy1.y2);
      if (!isAnchored(ls2.seg.x1, ls2.seg.y1)) ls2.setP1(proxy2.x1, proxy2.y1);
      if (!isAnchored(ls2.seg.x2, ls2.seg.y2)) ls2.setP2(proxy2.x2, proxy2.y2);
      result.line.color = state.currentColor;
      result.line.name = `Zkosení ${p1}×${p2}`;
      addObject(result.line);
      showToast(`Zkosení ${p1}×${p2} vytvořeno ✓`);
    }

    calculateAllIntersections();
    updateAssociativeDimensions();
    renderAll();
  });
  return true;
}
