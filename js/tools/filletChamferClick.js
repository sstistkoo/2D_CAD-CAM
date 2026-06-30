// ╔══════════════════════════════════════════════════════════════╗
// ║  Zaoblení / Zkosení (Fillet / Chamfer) – sdružený nástroj  ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, pushUndo, showToast } from '../state.js';
import { renderAll } from '../render.js';
import { addObject } from '../objects.js';
import { setHint } from '../ui.js';
import { drawCanvas, screenToWorld, snapPt } from '../canvas.js';
import {
  findObjectAt, calculateAllIntersections,
  filletTwoLines, chamferTwoLines,
  filletLineAndArc, chamferLineAndArc,
} from '../geometry.js';
import { showFilletChamferDialog } from '../dialogs.js';
import { getLineSegment, analyzeSelection } from './helpers.js';
import { isAnchored } from './anchorClick.js';
import { updateAssociativeDimensions } from '../dialogs/dimension.js';
import { SELECT_THRESHOLD } from '../constants.js';

// ── Deskriptory segmentů ──
// Deskriptor přímkového segmentu: { kind:'line', seg, setP1, setP2, segIdx }
// Deskriptor oblouku:             { kind:'arc',  arc, setStartAngle, setEndAngle, segIdx:null }

/** Vytvoří arc deskriptor z arc objektu v state.objects[i]. */
function mkArcDesc(obj) {
  return {
    kind: 'arc',
    arc: {
      cx: obj.cx, cy: obj.cy, r: obj.r,
      startAngle: obj.startAngle, endAngle: obj.endAngle,
      ccw: obj.ccw,
    },
    setStartAngle: (a) => { obj.startAngle = a; },
    setEndAngle:   (a) => { obj.endAngle   = a; },
    segIdx: null,
  };
}

// ── Detekce rohu ──

/**
 * Hledá roh: dva různé segmenty (úsečka nebo oblouk) sdílející endpoint blízko (wx, wy).
 * Vrátí { s1, s2, cornerPt } nebo null.
 */
function findCornerAt(wx, wy) {
  const threshold = SELECT_THRESHOLD / state.zoom;
  const candidates = []; // { idx, desc, ep, dist }

  for (let i = 0; i < state.objects.length; i++) {
    const obj = state.objects[i];

    if (obj.type === 'line') {
      const mkLs = () => ({
        kind: 'line',
        seg: { x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 },
        setP1: (x, y) => { obj.x1 = x; obj.y1 = y; },
        setP2: (x, y) => { obj.x2 = x; obj.y2 = y; },
        segIdx: null,
      });
      const d1 = Math.hypot(obj.x1 - wx, obj.y1 - wy);
      if (d1 < threshold) candidates.push({ idx: i, desc: mkLs(), ep: { x: obj.x1, y: obj.y1 }, dist: d1 });
      const d2 = Math.hypot(obj.x2 - wx, obj.y2 - wy);
      if (d2 < threshold) candidates.push({ idx: i, desc: mkLs(), ep: { x: obj.x2, y: obj.y2 }, dist: d2 });

    } else if (obj.type === 'arc') {
      const mkArc = () => mkArcDesc(obj);
      const sx = obj.cx + obj.r * Math.cos(obj.startAngle);
      const sy = obj.cy + obj.r * Math.sin(obj.startAngle);
      const ex = obj.cx + obj.r * Math.cos(obj.endAngle);
      const ey = obj.cy + obj.r * Math.sin(obj.endAngle);
      const ds = Math.hypot(sx - wx, sy - wy);
      if (ds < threshold) candidates.push({ idx: i, desc: mkArc(), ep: { x: sx, y: sy }, dist: ds });
      const de = Math.hypot(ex - wx, ey - wy);
      if (de < threshold) candidates.push({ idx: i, desc: mkArc(), ep: { x: ex, y: ey }, dist: de });

    } else if (obj.type === 'polyline') {
      const v = obj.vertices, n = v.length;
      const segs = obj.closed ? n : n - 1;
      for (let si = 0; si < segs; si++) {
        const pa = v[si], pb = v[(si + 1) % n];
        if ((obj.bulges?.[si] || 0) !== 0) continue;
        const mkLs = () => ({
          kind: 'line',
          seg: { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y },
          setP1: (x, y) => { pa.x = x; pa.y = y; },
          setP2: (x, y) => { pb.x = x; pb.y = y; },
          segIdx: si,
        });
        const da = Math.hypot(pa.x - wx, pa.y - wy);
        if (da < threshold) candidates.push({ idx: i, desc: mkLs(), ep: { x: pa.x, y: pa.y }, dist: da });
        const db = Math.hypot(pb.x - wx, pb.y - wy);
        if (db < threshold) candidates.push({ idx: i, desc: mkLs(), ep: { x: pb.x, y: pb.y }, dist: db });
      }
    }
  }

  if (candidates.length < 2) return null;

  // Hledáme pár sdílející endpoint (geometrická tolerance 1 mm)
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i], b = candidates[j];
      // Přeskočit stejný objekt/segment
      if (a.idx === b.idx) {
        const aIsPoly = a.desc.segIdx !== null;
        const bIsPoly = b.desc.segIdx !== null;
        if (!aIsPoly || !bIsPoly || a.desc.segIdx === b.desc.segIdx) continue;
      }
      if (Math.hypot(a.ep.x - b.ep.x, a.ep.y - b.ep.y) < 1e-3) {
        return { s1: a.desc, s2: b.desc, cornerPt: { x: (a.ep.x + b.ep.x) / 2, y: (a.ep.y + b.ep.y) / 2 } };
      }
    }
  }
  return null;
}

// ── Zjistit deskriptor z kliknutého objektu ──

/**
 * Vrátí deskriptor (line nebo arc) z objektu.
 * Vrátí null pokud typ není podporován.
 */
function getSegDesc(obj, wx, wy) {
  // Úsečka / polyline segment
  const ls = getLineSegment(obj, wx, wy);
  if (ls) return { kind: 'line', ...ls };

  // Oblouk
  if (obj.type === 'arc') return mkArcDesc(obj);

  return null;
}

// ── Aplikace operace ──

/**
 * Provede zaoblení nebo zkosení dvou deskriptorů (každý může být 'line' nebo 'arc').
 * Při line+arc: dist1 vždy pro úsečku, dist2 vždy pro oblouk.
 */
function applyFilletChamfer(mode, p1, p2, s1, s2) {
  const isArc1 = s1.kind === 'arc';
  const isArc2 = s2.kind === 'arc';

  if (isArc1 && isArc2) {
    showToast("Zaoblení dvou oblouků není podporováno");
    return;
  }

  if (!isArc1 && !isArc2) {
    _applyTwoLines(mode, p1, p2, s1, s2);
  } else {
    // Normalizujeme: line je vždy první, arc druhý
    const sLine = isArc1 ? s2 : s1;
    const sArc  = isArc1 ? s1 : s2;
    // Pro chamfer: dist1=úsečka, dist2=oblouk (swap pokud arc byl s1)
    const d1 = isArc1 ? p2 : p1;
    const d2 = isArc1 ? p1 : p2;
    _applyLineAndArc(mode, d1, d2, sLine, sArc);
  }
}

/** Zaoblení/zkosení dvou úseček (původní logika). */
function _applyTwoLines(mode, p1, p2, s1, s2) {
  const proxy1 = { x1: s1.seg.x1, y1: s1.seg.y1, x2: s1.seg.x2, y2: s1.seg.y2 };
  const proxy2 = { x1: s2.seg.x1, y1: s2.seg.y1, x2: s2.seg.x2, y2: s2.seg.y2 };

  pushUndo();

  if (mode === 'fillet') {
    const result = filletTwoLines(proxy1, proxy2, p1);
    if (!result.ok) { showToast(result.msg); return; }
    if (!isAnchored(s1.seg.x1, s1.seg.y1)) s1.setP1(proxy1.x1, proxy1.y1);
    if (!isAnchored(s1.seg.x2, s1.seg.y2)) s1.setP2(proxy1.x2, proxy1.y2);
    if (!isAnchored(s2.seg.x1, s2.seg.y1)) s2.setP1(proxy2.x1, proxy2.y1);
    if (!isAnchored(s2.seg.x2, s2.seg.y2)) s2.setP2(proxy2.x2, proxy2.y2);
    result.arc.name = `Zaoblení R${p1}`;
    addObject(result.arc);
    showToast(`Zaoblení R${p1} vytvořeno ✓`);
  } else {
    const result = chamferTwoLines(proxy1, proxy2, p1, p2);
    if (!result.ok) { showToast(result.msg); return; }
    if (!isAnchored(s1.seg.x1, s1.seg.y1)) s1.setP1(proxy1.x1, proxy1.y1);
    if (!isAnchored(s1.seg.x2, s1.seg.y2)) s1.setP2(proxy1.x2, proxy1.y2);
    if (!isAnchored(s2.seg.x1, s2.seg.y1)) s2.setP1(proxy2.x1, proxy2.y1);
    if (!isAnchored(s2.seg.x2, s2.seg.y2)) s2.setP2(proxy2.x2, proxy2.y2);
    result.line.color = state.currentColor;
    result.line.name = `Zkosení ${p1}×${p2}`;
    addObject(result.line);
    showToast(`Zkosení ${p1}×${p2} vytvořeno ✓`);
  }

  calculateAllIntersections();
  updateAssociativeDimensions();
  renderAll();
}

/** Zaoblení/zkosení úsečky a oblouku. */
function _applyLineAndArc(mode, distLine, distArc, sLine, sArc) {
  const lineProxy = { x1: sLine.seg.x1, y1: sLine.seg.y1, x2: sLine.seg.x2, y2: sLine.seg.y2 };
  const arcProxy  = { ...sArc.arc };

  // Pro anchor check: původní body oblouku PŘED ořezem
  const origStartPt = {
    x: arcProxy.cx + arcProxy.r * Math.cos(arcProxy.startAngle),
    y: arcProxy.cy + arcProxy.r * Math.sin(arcProxy.startAngle),
  };
  const origEndPt = {
    x: arcProxy.cx + arcProxy.r * Math.cos(arcProxy.endAngle),
    y: arcProxy.cy + arcProxy.r * Math.sin(arcProxy.endAngle),
  };

  pushUndo();

  if (mode === 'fillet') {
    const result = filletLineAndArc(lineProxy, arcProxy, distLine); // distLine = radius
    if (!result.ok) { showToast(result.msg); return; }

    // Zapsat ořez úsečky
    if (!isAnchored(sLine.seg.x1, sLine.seg.y1)) sLine.setP1(lineProxy.x1, lineProxy.y1);
    if (!isAnchored(sLine.seg.x2, sLine.seg.y2)) sLine.setP2(lineProxy.x2, lineProxy.y2);

    // Zapsat ořez oblouku (jen pokud se úhel změnil a bod není ukotvený)
    if (!isAnchored(origStartPt.x, origStartPt.y)) sArc.setStartAngle(arcProxy.startAngle);
    if (!isAnchored(origEndPt.x,   origEndPt.y))   sArc.setEndAngle(arcProxy.endAngle);

    result.arc.name = `Zaoblení R${distLine}`;
    addObject(result.arc);
    showToast(`Zaoblení R${distLine} vytvořeno ✓`);
  } else {
    const result = chamferLineAndArc(lineProxy, arcProxy, distLine, distArc);
    if (!result.ok) { showToast(result.msg); return; }

    if (!isAnchored(sLine.seg.x1, sLine.seg.y1)) sLine.setP1(lineProxy.x1, lineProxy.y1);
    if (!isAnchored(sLine.seg.x2, sLine.seg.y2)) sLine.setP2(lineProxy.x2, lineProxy.y2);
    if (!isAnchored(origStartPt.x, origStartPt.y)) sArc.setStartAngle(arcProxy.startAngle);
    if (!isAnchored(origEndPt.x,   origEndPt.y))   sArc.setEndAngle(arcProxy.endAngle);

    result.line.color = state.currentColor;
    result.line.name  = `Zkosení ${distLine}×${distArc}`;
    addObject(result.line);
    showToast(`Zkosení ${distLine}×${distArc} vytvořeno ✓`);
  }

  calculateAllIntersections();
  updateAssociativeDimensions();
  renderAll();
}

// ── Veřejné funkce ──

/**
 * Klik při aktivním nástroji filletChamfer.
 * Parametry jsou předem uloženy v state._fcMode / _fcP1 / _fcP2.
 *
 * Logika:
 *  1. Rohový klik: sdílený endpoint dvou segmentů (úsečka nebo oblouk) → rovnou provede.
 *  2. Klik na 1. segment → čeká na klik na 2. segment.
 * Nástroj zůstane aktivní, dokud uživatel nepřepne jiný nástroj.
 */
export function handleFilletChamferClick(wx, wy) {
  const mode = state._fcMode || 'fillet';
  const p1   = state._fcP1   ?? 2;
  const p2   = state._fcP2   ?? 2;

  // 1. Pokus: rohový klik (sdílený endpoint)
  const corner = findCornerAt(wx, wy);
  if (corner) {
    applyFilletChamfer(mode, p1, p2, corner.s1, corner.s2);
    return;
  }

  // 2. Záloha: klik na první segment (úsečka nebo oblouk)
  const idx = findObjectAt(wx, wy);
  if (idx === null) { showToast("Klepněte na roh nebo na první úsečku/oblouk"); return; }

  const obj1 = state.objects[idx];
  const s1   = getSegDesc(obj1, wx, wy);
  if (!s1) { showToast("Funguje pro úsečky, oblouky a rovné segmenty kontur"); return; }

  state.selected = idx;
  renderAll();

  const hintSecond = s1.kind === 'arc'
    ? "Klepněte na úsečku"
    : "Klepněte na druhou úsečku nebo oblouk";
  setHint(hintSecond);
  showToast(hintSecond);

  function onSecondClick(e) {
    const rect = drawCanvas.getBoundingClientRect();
    const sx = (e.clientX ?? e.changedTouches?.[0]?.clientX) - rect.left;
    const sy = (e.clientY ?? e.changedTouches?.[0]?.clientY) - rect.top;
    let [wx2, wy2] = screenToWorld(sx, sy);
    if (state.snapToPoints) [wx2, wy2] = snapPt(wx2, wy2);

    const idx2 = findObjectAt(wx2, wy2);
    if (idx2 === null) { showToast("Klepněte na úsečku nebo oblouk"); return; }

    // Nelze kombinovat oblouk+oblouk ani stejný objekt bez jiného segmentu
    const obj2 = state.objects[idx2];
    const s2   = getSegDesc(obj2, wx2, wy2);
    if (!s2) { showToast("Funguje pro úsečky, oblouky a rovné segmenty kontur"); return; }

    if (s1.kind === 'arc' && s2.kind === 'arc') { showToast("Zaoblení dvou oblouků není podporováno"); return; }

    if (idx2 === idx) {
      // Stejný objekt je OK jen pro polyline (různé segmenty)
      if (s1.segIdx === null || s2.segIdx === null || s1.segIdx === s2.segIdx) {
        showToast("Klepněte na jiný objekt"); return;
      }
    }

    cleanup();
    applyFilletChamfer(mode, p1, p2, s1, s2);

    // Hint pro další operaci (nástroj zůstává aktivní)
    setHint(mode === 'fillet'
      ? `Klikněte na roh nebo 1. úsečku/oblouk (R${p1})`
      : `Klikněte na roh nebo 1. úsečku/oblouk (${p1}×${p2})`);
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
    ls1 = { kind: 'line', seg: { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y }, setP1: (x, y) => { pa.x = x; pa.y = y; }, setP2: (x, y) => { pb.x = x; pb.y = y; }, segIdx: si };
  } else {
    const raw = getLineSegment(obj1, (obj1.x1 + obj1.x2) / 2, (obj1.y1 + obj1.y2) / 2);
    ls1 = raw ? { kind: 'line', ...raw } : null;
  }
  if (obj2.type === 'polyline' && info2.segIdx !== null) {
    const v = obj2.vertices, si = info2.segIdx, n = v.length;
    const pa = v[si], pb = v[(si + 1) % n];
    if ((obj2.bulges?.[si] || 0) !== 0) { showToast("Obloukový segment není podporován"); return true; }
    ls2 = { kind: 'line', seg: { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y }, setP1: (x, y) => { pa.x = x; pa.y = y; }, setP2: (x, y) => { pb.x = x; pb.y = y; }, segIdx: si };
  } else {
    const raw = getLineSegment(obj2, (obj2.x1 + obj2.x2) / 2, (obj2.y1 + obj2.y2) / 2);
    ls2 = raw ? { kind: 'line', ...raw } : null;
  }
  if (!ls1 || !ls2) return false;

  showFilletChamferDialog((mode, p1, p2) => {
    _applyTwoLines(mode, p1, p2, ls1, ls2);
  });
  return true;
}
