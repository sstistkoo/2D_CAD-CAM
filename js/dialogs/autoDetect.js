// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Auto-detekce R, zkosení, zápichů                 ║
// ║  Analyzuje výkres a najde zaoblení, zkosení a zápichy      ║
// ╚══════════════════════════════════════════════════════════════╝

import { COLORS } from '../constants.js';
import { makeInputOverlay } from '../dialogFactory.js';
import { state, showToast, coordHelpers } from '../state.js';
import { renderAll } from '../render.js';
import { addDimensionForObject } from './dimension.js';
import { intersectInfiniteLines } from '../geometry.js';
import { bulgeToArc } from '../utils.js';
import { drawCanvas } from '../canvas.js';

const EPS = 1e-4;      // tolerance pro shodu bodů
const TANGENT_TOL = 0.05; // tolerance tečnosti (rad, ~3°)

// ── Pomocné funkce ──

/** Test shody dvou bodů */
function ptEq(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by) < EPS;
}

/** Koncové body úsečky */
function lineEndpoints(obj) {
  return [
    { x: obj.x1, y: obj.y1 },
    { x: obj.x2, y: obj.y2 },
  ];
}

/** Koncové body oblouku */
function arcEndpoints(obj) {
  return [
    { x: obj.cx + obj.r * Math.cos(obj.startAngle), y: obj.cy + obj.r * Math.sin(obj.startAngle) },
    { x: obj.cx + obj.r * Math.cos(obj.endAngle),   y: obj.cy + obj.r * Math.sin(obj.endAngle) },
  ];
}

/** Tečný vektor oblouku v daném úhlu */
function arcTangentAt(obj, angle) {
  // Tečna ke kružnici v bodě je kolmá na poloměr; směr závisí na orientaci
  // Pro CCW: tangent = (-sin(angle), cos(angle))
  return { x: -Math.sin(angle), y: Math.cos(angle) };
}

/** Test, zda jsou dva vektory (téměř) rovnoběžné */
function isParallel(dx1, dy1, dx2, dy2) {
  const len1 = Math.hypot(dx1, dy1), len2 = Math.hypot(dx2, dy2);
  if (len1 < 1e-10 || len2 < 1e-10) return false;
  const cross = Math.abs(dx1 * dy2 - dy1 * dx2) / (len1 * len2);
  return cross < TANGENT_TOL;
}

/** Test, zda jsou dva vektory (téměř) kolmé */
function isPerpendicular(dx1, dy1, dx2, dy2) {
  const len1 = Math.hypot(dx1, dy1), len2 = Math.hypot(dx2, dy2);
  if (len1 < 1e-10 || len2 < 1e-10) return false;
  const dot = Math.abs(dx1 * dx2 + dy1 * dy2) / (len1 * len2);
  return dot < TANGENT_TOL;
}

// ══════════════════════════════════════════════════════════════
// Extrakce virtuálních segmentů z polyline + standalone objektů
// ══════════════════════════════════════════════════════════════

/**
 * Rozloží všechny viditelné objekty na jednotné segmenty (line / arc).
 * Polyline se rozloží na virtuální segmenty se stejným formátem jako
 * standalone objekty, takže detekce funguje pro obojí.
 *
 * Každý segment má:
 *  - obj: virtuální objekt {type, x1,y1,x2,y2} nebo {type, cx,cy,r,startAngle,endAngle}
 *  - srcIdx: index zdrojového objektu ve state.objects
 *  - segIdx: index segmentu v polyline (nebo null pro standalone)
 */
function extractSegments(objects) {
  const lines = [];
  const arcs = [];

  objects.forEach((obj, idx) => {
    if (obj.isDimension || obj.isCoordLabel) return;
    const layer = state.layers.find(l => l.id === obj.layer);
    if (layer && !layer.visible) return;

    if (obj.type === 'line') {
      lines.push({ obj, idx, segIdx: null });
    } else if (obj.type === 'arc') {
      arcs.push({ obj, idx, segIdx: null });
    } else if (obj.type === 'rect') {
      // Obdélník → 4 úsečky
      const x1 = Math.min(obj.x1, obj.x2), x2 = Math.max(obj.x1, obj.x2);
      const y1 = Math.min(obj.y1, obj.y2), y2 = Math.max(obj.y1, obj.y2);
      const rectSegs = [
        { x1: x1, y1: y1, x2: x2, y2: y1 }, // spodní
        { x1: x2, y1: y1, x2: x2, y2: y2 }, // pravá
        { x1: x2, y1: y2, x2: x1, y2: y2 }, // horní
        { x1: x1, y1: y2, x2: x1, y2: y1 }, // levá
      ];
      rectSegs.forEach((seg, si) => {
        lines.push({ obj: { type: 'line', ...seg }, idx, segIdx: si });
      });
    } else if (obj.type === 'polyline' && obj.vertices && obj.vertices.length >= 2) {
      const n = obj.vertices.length;
      const segCnt = obj.closed ? n : n - 1;
      for (let si = 0; si < segCnt; si++) {
        const p1 = obj.vertices[si];
        const p2 = obj.vertices[(si + 1) % n];
        const b = (obj.bulges && obj.bulges[si]) || 0;

        if (b !== 0) {
          const arc = bulgeToArc(p1, p2, b);
          if (arc) {
            arcs.push({
              obj: { type: 'arc', cx: arc.cx, cy: arc.cy, r: arc.r, startAngle: arc.startAngle, endAngle: arc.endAngle },
              idx,
              segIdx: si,
            });
          }
        } else {
          lines.push({
            obj: { type: 'line', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y },
            idx,
            segIdx: si,
          });
        }
      }
    }
  });

  return { lines, arcs };
}

/** Unikátní klíč segmentu (objekt idx + segment idx v polyline) */
function segKey(seg) {
  return seg.segIdx !== null ? `${seg.idx}:${seg.segIdx}` : `${seg.idx}`;
}

// ══════════════════════════════════════════════════════════════
// 1) Detekce zaoblení (R) – oblouky tečně navazující na úsečky
// ══════════════════════════════════════════════════════════════

function detectFillets(segments) {
  const fillets = [];
  const { arcs, lines } = segments;

  for (const arc of arcs) {
    const aEps = arcEndpoints(arc.obj);
    const connectedLines = [];

    // Pro každý koncový bod oblouku hledáme navazující úsečku
    for (let aei = 0; aei < 2; aei++) {
      const aep = aEps[aei];
      const arcAngle = aei === 0 ? arc.obj.startAngle : arc.obj.endAngle;

      for (const line of lines) {
        const lEps = lineEndpoints(line.obj);
        for (let lei = 0; lei < 2; lei++) {
          if (!ptEq(aep.x, aep.y, lEps[lei].x, lEps[lei].y)) continue;

          // Bod se shoduje – kontrola tečnosti
          const arcTan = arcTangentAt(arc.obj, arcAngle);
          const lineDx = line.obj.x2 - line.obj.x1;
          const lineDy = line.obj.y2 - line.obj.y1;

          if (isParallel(arcTan.x, arcTan.y, lineDx, lineDy)) {
            connectedLines.push({
              line: line,
              endpointIdx: lei,
              arcEndpointIdx: aei,
            });
          }
        }
      }
    }

    if (connectedLines.length >= 2) {
      fillets.push({
        type: 'fillet',
        arc: arc,
        radius: arc.obj.r,
        lines: connectedLines.slice(0, 2),
        center: { x: arc.obj.cx, y: arc.obj.cy },
      });
    } else if (connectedLines.length === 1) {
      fillets.push({
        type: 'fillet',
        arc: arc,
        radius: arc.obj.r,
        lines: connectedLines,
        center: { x: arc.obj.cx, y: arc.obj.cy },
        partial: true,
      });
    }
  }
  return fillets;
}

// ══════════════════════════════════════════════════════════════
// 2) Detekce zkosení (chamfer) – krátké úsečky mezi dvěma delšími
// ══════════════════════════════════════════════════════════════

function detectChamfers(segments) {
  const chamfers = [];
  const lines = segments.lines;
  const usedChamferSegs = new Set();

  // Pro každou úsečku zkontroluj, zda je "krátká" a spojuje dva delší segmenty
  for (let ci = 0; ci < lines.length; ci++) {
    if (usedChamferSegs.has(segKey(lines[ci]))) continue;
    const cand = lines[ci];
    const cLen = Math.hypot(cand.obj.x2 - cand.obj.x1, cand.obj.y2 - cand.obj.y1);
    const cEps = lineEndpoints(cand.obj);

    // Hledáme úsečky připojené k oběma koncům kandidáta
    const conn1 = []; // připojené k cEps[0]
    const conn2 = []; // připojené k cEps[1]

    for (let li = 0; li < lines.length; li++) {
      if (li === ci) continue;
      const line = lines[li];
      const lLen = Math.hypot(line.obj.x2 - line.obj.x1, line.obj.y2 - line.obj.y1);
      const lEps = lineEndpoints(line.obj);

      // Hledáme shodu koncových bodů
      for (let lei = 0; lei < 2; lei++) {
        if (ptEq(cEps[0].x, cEps[0].y, lEps[lei].x, lEps[lei].y)) {
          conn1.push({ line, endpointIdx: lei, len: lLen });
        }
        if (ptEq(cEps[1].x, cEps[1].y, lEps[lei].x, lEps[lei].y)) {
          conn2.push({ line, endpointIdx: lei, len: lLen });
        }
      }
    }

    // Zkosení: krátká úsečka spojuje dvě delší úsečky, které by se protínaly
    if (conn1.length >= 1 && conn2.length >= 1) {
      for (const c1 of conn1) {
        for (const c2 of conn2) {
          if (segKey(c1.line) === segKey(c2.line)) continue;

          // Kandidátní zkosení musí být kratší než obě připojené úsečky
          if (cLen >= c1.len || cLen >= c2.len) continue;

          // Oba delší segmenty nesmí být rovnoběžné (musí tvořit roh)
          const d1x = c1.line.obj.x2 - c1.line.obj.x1;
          const d1y = c1.line.obj.y2 - c1.line.obj.y1;
          const d2x = c2.line.obj.x2 - c2.line.obj.x1;
          const d2y = c2.line.obj.y2 - c2.line.obj.y1;
          if (isParallel(d1x, d1y, d2x, d2y)) continue;

          // Spočítej vzdálenosti od virtuálního průsečíku
          const intPt = intersectInfiniteLines(c1.line.obj, c2.line.obj);
          if (!intPt) continue;

          const dist1 = Math.hypot(cEps[0].x - intPt.x, cEps[0].y - intPt.y);
          const dist2 = Math.hypot(cEps[1].x - intPt.x, cEps[1].y - intPt.y);

          usedChamferSegs.add(segKey(cand));
          chamfers.push({
            type: 'chamfer',
            chamferLine: cand,
            length: cLen,
            dist1,
            dist2,
            line1: c1.line,
            line2: c2.line,
            intersection: intPt,
          });
          break;
        }
        if (chamfers.length > 0 && chamfers[chamfers.length - 1].chamferLine === cand) break;
      }
    }
  }
  return chamfers;
}

// ══════════════════════════════════════════════════════════════
// 3) Detekce zápichů (grooves) – U-tvar z 3 spojených úseček
// ══════════════════════════════════════════════════════════════

function detectGrooves(segments) {
  const grooves = [];
  const lines = segments.lines;

  // Adjacency: pro každou úsečku najdeme sousedy na obou koncích
  const adjacency = lines.map((line) => {
    const eps = lineEndpoints(line.obj);
    const neighbors = [[], []]; // [koncBod0, koncBod1]
    for (const other of lines) {
      if (segKey(other) === segKey(line)) continue;
      const oEps = lineEndpoints(other.obj);
      for (let oi = 0; oi < 2; oi++) {
        if (ptEq(eps[0].x, eps[0].y, oEps[oi].x, oEps[oi].y)) {
          neighbors[0].push({ line: other, endpointIdx: oi });
        }
        if (ptEq(eps[1].x, eps[1].y, oEps[oi].x, oEps[oi].y)) {
          neighbors[1].push({ line: other, endpointIdx: oi });
        }
      }
    }
    return neighbors;
  });

  const usedLines = new Set();

  // Hledáme trojici: stěna1 → dno → stěna2, kde stěny jsou ~rovnoběžné a dno ~kolmé
  for (let bi = 0; bi < lines.length; bi++) {
    if (usedLines.has(segKey(lines[bi]))) continue;
    const bottom = lines[bi];
    const bAdj = adjacency[bi];
    const bDx = bottom.obj.x2 - bottom.obj.x1;
    const bDy = bottom.obj.y2 - bottom.obj.y1;

    // Pro každou kombinaci sousedů na koncích dna
    for (const side1 of bAdj[0]) {
      for (const side2 of bAdj[1]) {
        if (segKey(side1.line) === segKey(side2.line)) continue;
        if (usedLines.has(segKey(side1.line)) || usedLines.has(segKey(side2.line))) continue;

        const s1Dx = side1.line.obj.x2 - side1.line.obj.x1;
        const s1Dy = side1.line.obj.y2 - side1.line.obj.y1;
        const s2Dx = side2.line.obj.x2 - side2.line.obj.x1;
        const s2Dy = side2.line.obj.y2 - side2.line.obj.y1;

        // Stěny zápichu musí být přibližně rovnoběžné
        if (!isParallel(s1Dx, s1Dy, s2Dx, s2Dy)) continue;

        // Dno musí být přibližně kolmé na stěny
        if (!isPerpendicular(bDx, bDy, s1Dx, s1Dy)) continue;

        const width = Math.hypot(bDx, bDy);
        const depth1 = Math.hypot(s1Dx, s1Dy);
        const depth2 = Math.hypot(s2Dx, s2Dy);
        const depth = Math.min(depth1, depth2);

        // Zápichy mají typicky hloubku > 0 a šířku > 0
        if (width < EPS || depth < EPS) continue;

        // Stěny by měly směřovat stejným směrem (obě "dolů" do zápichu)
        const dot = s1Dx * s2Dx + s1Dy * s2Dy;
        // Pokud dot < 0, stěny směřují proti sobě → potenciální zápich
        // Pokud dot > 0, stěny směřují stejným směrem → potenciální zápich
        // Obojí může být platné podle orientace koncových bodů

        usedLines.add(segKey(bottom));
        usedLines.add(segKey(side1.line));
        usedLines.add(segKey(side2.line));

        grooves.push({
          type: 'groove',
          bottom,
          side1: side1.line,
          side2: side2.line,
          width,
          depth,
          depth1,
          depth2,
        });
      }
    }
  }
  return grooves;
}

// ══════════════════════════════════════════════════════════════
// 4) Detekce rohů/spojů – místa kde se 2 segmenty potkávají pod úhlem
// ══════════════════════════════════════════════════════════════

function detectCorners(segments, fillets, chamfers, grooves) {
  const corners = [];
  const lines = segments.lines;
  const arcs = segments.arcs;

  // Seber koncové body, které už jsou součástí filletů, chamferů a zápichů → přeskoč
  const usedPoints = new Set();
  for (const f of fillets) {
    const aEps = arcEndpoints(f.arc.obj);
    for (const ep of aEps) usedPoints.add(`${ep.x.toFixed(4)},${ep.y.toFixed(4)}`);
  }
  for (const c of chamfers) {
    const cEps = lineEndpoints(c.chamferLine.obj);
    for (const ep of cEps) usedPoints.add(`${ep.x.toFixed(4)},${ep.y.toFixed(4)}`);
  }
  for (const g of grooves) {
    // Vyloučit spoje uvnitř zápichu (dno-stěna)
    for (const seg of [g.bottom, g.side1, g.side2]) {
      const eps = lineEndpoints(seg.obj);
      for (const ep of eps) usedPoints.add(`${ep.x.toFixed(4)},${ep.y.toFixed(4)}`);
    }
  }

  // Najdi všechny páry segmentů (úseček), které sdílejí koncový bod
  for (let i = 0; i < lines.length; i++) {
    const l1 = lines[i];
    const eps1 = lineEndpoints(l1.obj);
    for (let j = i + 1; j < lines.length; j++) {
      const l2 = lines[j];
      const eps2 = lineEndpoints(l2.obj);

      for (let ei = 0; ei < 2; ei++) {
        for (let ej = 0; ej < 2; ej++) {
          if (!ptEq(eps1[ei].x, eps1[ei].y, eps2[ej].x, eps2[ej].y)) continue;

          const sharedPt = eps1[ei];
          const ptKey = `${sharedPt.x.toFixed(4)},${sharedPt.y.toFixed(4)}`;
          if (usedPoints.has(ptKey)) continue;

          // Vektory směřující OD sdíleného bodu
          const d1x = ei === 0 ? (l1.obj.x2 - l1.obj.x1) : (l1.obj.x1 - l1.obj.x2);
          const d1y = ei === 0 ? (l1.obj.y2 - l1.obj.y1) : (l1.obj.y1 - l1.obj.y2);
          const d2x = ej === 0 ? (l2.obj.x2 - l2.obj.x1) : (l2.obj.x1 - l2.obj.x2);
          const d2y = ej === 0 ? (l2.obj.y2 - l2.obj.y1) : (l2.obj.y1 - l2.obj.y2);

          const len1 = Math.hypot(d1x, d1y);
          const len2 = Math.hypot(d2x, d2y);
          if (len1 < 1e-10 || len2 < 1e-10) continue;

          // Úhel mezi vektory
          const dot = d1x * d2x + d1y * d2y;
          const cosA = Math.max(-1, Math.min(1, dot / (len1 * len2)));
          const angleBetween = Math.acos(cosA); // úhel mezi segmenty (0..π)
          const angleDeg = angleBetween * (180 / Math.PI);

          // Přeskoč kolineární spoje (180°) a téměř kolineární (>175°)
          if (angleDeg > 175) continue;

          // Doplňkový úhel = úhel "materiálu" / vnitřní roh
          const innerDeg = 180 - angleDeg;

          usedPoints.add(ptKey); // neukazuj stejný roh dvakrát

          corners.push({
            type: 'corner',
            point: { x: sharedPt.x, y: sharedPt.y },
            angleDeg: angleDeg,
            innerDeg: innerDeg,
            line1: l1,
            line2: l2,
            len1: len1,
            len2: len2,
          });
        }
      }
    }
  }

  // Také najdi spoje úsečka-oblouk (pokud nebyl detekován jako fillet)
  for (const line of lines) {
    const lEps = lineEndpoints(line.obj);
    for (const arc of arcs) {
      const aEps = arcEndpoints(arc.obj);
      for (let li = 0; li < 2; li++) {
        for (let ai = 0; ai < 2; ai++) {
          if (!ptEq(lEps[li].x, lEps[li].y, aEps[ai].x, aEps[ai].y)) continue;
          const ptKey = `${lEps[li].x.toFixed(4)},${lEps[li].y.toFixed(4)}`;
          if (usedPoints.has(ptKey)) continue;
          usedPoints.add(ptKey);

          corners.push({
            type: 'corner',
            point: { x: lEps[li].x, y: lEps[li].y },
            angleDeg: NaN, // úhel nelze snadno určit pro arc-line bez tečny
            innerDeg: NaN,
            line1: line,
            line2: null,
            arc: arc,
            len1: Math.hypot(line.obj.x2 - line.obj.x1, line.obj.y2 - line.obj.y1),
            len2: arc.obj.r,
            label: `R${arc.obj.r.toFixed(2)} navazuje`,
          });
        }
      }
    }
  }

  return corners;
}

// ══════════════════════════════════════════════════════════════
// Hlavní analýza a dialog
// ══════════════════════════════════════════════════════════════

export function autoDetectFeatures() {
  const objects = state.objects;
  if (objects.length === 0) {
    showToast('Výkres je prázdný');
    return;
  }

  const segments = extractSegments(objects);
  if (segments.lines.length === 0 && segments.arcs.length === 0) {
    showToast('Výkres neobsahuje úsečky ani oblouky k analýze');
    return;
  }

  const fillets = detectFillets(segments);
  const chamfers = detectChamfers(segments);
  const grooves = detectGrooves(segments);
  const corners = detectCorners(segments, fillets, chamfers, grooves);

  const totalCount = fillets.length + chamfers.length + grooves.length + corners.length;
  if (totalCount === 0) {
    showToast(`Analyzováno ${segments.lines.length} úseček a ${segments.arcs.length} oblouků – žádné prvky nenalezeny`);
    return;
  }

  showAutoDetectDialog(fillets, chamfers, grooves, corners);
}

function showAutoDetectDialog(fillets, chamfers, grooves, corners) {
  const { H, V, Hp, Vp, fH, fV } = coordHelpers();
  let rows = '';

  // ── Zaoblení (R) ──
  if (fillets.length > 0) {
    rows += `<tr><td colspan="4" style="color:${COLORS.primary};font-weight:bold;padding-top:8px;font-size:14px">
      ⌒ Zaoblení (R) — ${fillets.length}×</td></tr>`;
    rows += `<tr style="color:${COLORS.textMuted};font-size:11px">
      <td>#</td><td>R (mm)</td><td>Střed</td><td>Napojení</td></tr>`;
    fillets.forEach((f, i) => {
      const partial = f.partial ? ' ½' : '';
      const connCount = f.lines.length;
      rows += `<tr>
        <td style="color:${COLORS.label}">${i + 1}</td>
        <td style="color:${COLORS.selected};font-weight:bold">R${f.radius.toFixed(2)}</td>
        <td style="color:${COLORS.primary};font-size:12px">${Hp}${H}${fH(f.center.x).toFixed(2)} ${Vp}${V}${fV(f.center.y).toFixed(2)}</td>
        <td style="color:${COLORS.preview}">${connCount} úsečk${connCount === 1 ? 'a' : 'y'}${partial}</td>
      </tr>`;
    });
  }

  // ── Zkosení ──
  if (chamfers.length > 0) {
    rows += `<tr><td colspan="4" style="color:${COLORS.yellow};font-weight:bold;padding-top:12px;font-size:14px">
      ⟋ Zkosení — ${chamfers.length}×</td></tr>`;
    rows += `<tr style="color:${COLORS.textMuted};font-size:11px">
      <td>#</td><td>Rozměr</td><td>Délka</td><td>Průsečík</td></tr>`;
    chamfers.forEach((c, i) => {
      const d1 = c.dist1.toFixed(2);
      const d2 = c.dist2.toFixed(2);
      const sizeLabel = Math.abs(c.dist1 - c.dist2) < 0.01
        ? `${d1}×45°`
        : `${d1}×${d2}`;
      rows += `<tr>
        <td style="color:${COLORS.label}">${i + 1}</td>
        <td style="color:${COLORS.selected};font-weight:bold">${sizeLabel}</td>
        <td style="color:${COLORS.preview}">${c.length.toFixed(2)} mm</td>
        <td style="color:${COLORS.primary};font-size:12px">${Hp}${H}${fH(c.intersection.x).toFixed(2)} ${Vp}${V}${fV(c.intersection.y).toFixed(2)}</td>
      </tr>`;
    });
  }

  // ── Zápichy ──
  if (grooves.length > 0) {
    rows += `<tr><td colspan="4" style="color:${COLORS.dimension};font-weight:bold;padding-top:12px;font-size:14px">
      ▭ Zápichy — ${grooves.length}×</td></tr>`;
    rows += `<tr style="color:${COLORS.textMuted};font-size:11px">
      <td>#</td><td>Šířka</td><td>Hloubka</td><td>Info</td></tr>`;
    grooves.forEach((g, i) => {
      const symLabel = Math.abs(g.depth1 - g.depth2) < 0.1 ? 'sym.' : 'asym.';
      rows += `<tr>
        <td style="color:${COLORS.label}">${i + 1}</td>
        <td style="color:${COLORS.selected};font-weight:bold">${g.width.toFixed(2)} mm</td>
        <td style="color:${COLORS.selected}">${g.depth.toFixed(2)} mm</td>
        <td style="color:${COLORS.preview}">${symLabel}</td>
      </tr>`;
    });
  }

  // ── Rohy / spoje ──
  if (corners.length > 0) {
    rows += `<tr><td colspan="3" style="color:${COLORS.dimension};font-weight:bold;padding-top:12px;font-size:13px">
      ∠ Rohy / spoje — ${corners.length}×</td></tr>`;
    rows += `<tr style="color:${COLORS.textMuted};font-size:11px">
      <td>#</td><td>Úhel</td><td>Pozice</td></tr>`;
    corners.forEach((c, i) => {
      const angleLabel = isNaN(c.angleDeg)
        ? (c.label || '—')
        : `${c.angleDeg.toFixed(1)}°`;
      const typeLabel = !isNaN(c.angleDeg)
        ? (Math.abs(c.angleDeg - 90) < 2 ? ' ⊾'
          : c.angleDeg < 90 ? ' ◁' : ' △')
        : '';
      rows += `<tr class="ad-corner-row" data-corner-idx="${i}" style="cursor:pointer">
        <td style="color:${COLORS.label}">${i + 1}</td>
        <td style="color:${COLORS.selected};font-weight:bold;white-space:nowrap">${angleLabel}${typeLabel}</td>
        <td style="color:${COLORS.primary};font-size:11px">${fH(c.point.x).toFixed(1)}, ${fV(c.point.y).toFixed(1)}</td>
      </tr>`;
    });
  }

  // ── Souhrn ──
  const totalCount = fillets.length + chamfers.length + grooves.length + corners.length;
  const summaryParts = [];
  if (fillets.length > 0) summaryParts.push(`${fillets.length}× R`);
  if (chamfers.length > 0) summaryParts.push(`${chamfers.length}× zkosení`);
  if (grooves.length > 0) summaryParts.push(`${grooves.length}× zápich`);
  if (corners.length > 0) summaryParts.push(`${corners.length}× roh`);

  // Statistika unikátních R
  let rStats = '';
  if (fillets.length > 0) {
    const rValues = {};
    for (const f of fillets) {
      const rKey = f.radius.toFixed(2);
      rValues[rKey] = (rValues[rKey] || 0) + 1;
    }
    const rParts = Object.entries(rValues)
      .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
      .map(([r, cnt]) => cnt > 1 ? `R${r} (${cnt}×)` : `R${r}`);
    rStats = `<tr><td colspan="4" style="color:${COLORS.textSecondary};font-size:11px;padding-top:6px">
      Hodnoty R: ${rParts.join(', ')}</td></tr>`;
  }

  // Statistika unikátních zkosení
  let chamferStats = '';
  if (chamfers.length > 0) {
    const cValues = {};
    for (const c of chamfers) {
      const key = Math.abs(c.dist1 - c.dist2) < 0.01
        ? `${c.dist1.toFixed(2)}×45°`
        : `${c.dist1.toFixed(2)}×${c.dist2.toFixed(2)}`;
      cValues[key] = (cValues[key] || 0) + 1;
    }
    const cParts = Object.entries(cValues)
      .map(([k, cnt]) => cnt > 1 ? `${k} (${cnt}×)` : k);
    chamferStats = `<tr><td colspan="4" style="color:${COLORS.textSecondary};font-size:11px;padding-top:2px">
      Zkosení: ${cParts.join(', ')}</td></tr>`;
  }

  const overlay = makeInputOverlay(`
    <div class="input-dialog" style="max-width:min(520px,92vw);box-sizing:border-box;overflow:hidden">
      <h3 style="font-size:15px;margin:0 0 6px">🔍 Auto-detekce prvků</h3>
      <div style="color:${COLORS.text};font-size:12px;margin-bottom:6px">
        Nalezeno <strong>${totalCount}</strong> prvků: ${summaryParts.join(', ')}
      </div>
      <div style="max-height:55vh;overflow-y:auto;overflow-x:hidden">
        <table style="width:100%;font-size:12px;border-collapse:collapse;table-layout:auto;word-break:break-word">
          ${rows}
          ${rStats}
          ${chamferStats}
        </table>
      </div>
      <div class="btn-row" style="margin-top:8px;flex-wrap:wrap;gap:4px">
        <button class="btn-cancel" id="adAddDims" style="font-size:12px">📐 Kóty R</button>
        <button class="btn-cancel" id="adHighlight" style="font-size:12px">💡 Zvýraznit</button>
        <button class="btn-cancel" id="adCopy" style="font-size:12px">📋 Kopírovat</button>
        <button class="btn-ok btn-cancel-overlay" style="font-size:12px">OK</button>
      </div>
    </div>`);

  // ── Přidat kóty pro nalezená R ──
  const addDimsBtn = overlay.querySelector('#adAddDims');
  if (addDimsBtn) {
    addDimsBtn.addEventListener('click', () => {
      let added = 0;
      for (const f of fillets) {
        addDimensionForObject(f.arc.obj);
        added++;
      }
      showToast(`Přidáno ${added} kót R`);
      overlay.remove();
    });
  }

  // ── Zvýraznit nalezené prvky ──
  const highlightBtn = overlay.querySelector('#adHighlight');
  if (highlightBtn) {
    highlightBtn.addEventListener('click', () => {
      state.multiSelected.clear();
      for (const f of fillets) state.multiSelected.add(f.arc.idx);
      for (const c of chamfers) state.multiSelected.add(c.chamferLine.idx);
      for (const g of grooves) {
        state.multiSelected.add(g.bottom.idx);
        state.multiSelected.add(g.side1.idx);
        state.multiSelected.add(g.side2.idx);
      }
      for (const co of corners) {
        state.multiSelected.add(co.line1.idx);
        if (co.line2) state.multiSelected.add(co.line2.idx);
        if (co.arc) state.multiSelected.add(co.arc.idx);
      }
      renderAll();
      showToast(`${state.multiSelected.size} objektů zvýrazněno`);
      overlay.remove();
    });
  }

  // ── Kopírovat výsledky ──
  const copyBtn = overlay.querySelector('#adCopy');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      let text = '=== Auto-detekce prvků ===\n\n';
      if (fillets.length > 0) {
        text += `ZAOBLENÍ (R): ${fillets.length}×\n`;
        fillets.forEach((f, i) => {
          text += `  ${i + 1}. R${f.radius.toFixed(3)} mm  střed: [${f.center.x.toFixed(3)}, ${f.center.y.toFixed(3)}]\n`;
        });
        text += '\n';
      }
      if (chamfers.length > 0) {
        text += `ZKOSENÍ: ${chamfers.length}×\n`;
        chamfers.forEach((c, i) => {
          const sizeLabel = Math.abs(c.dist1 - c.dist2) < 0.01
            ? `${c.dist1.toFixed(3)}×45°`
            : `${c.dist1.toFixed(3)}×${c.dist2.toFixed(3)}`;
          text += `  ${i + 1}. ${sizeLabel}  délka: ${c.length.toFixed(3)} mm\n`;
        });
        text += '\n';
      }
      if (grooves.length > 0) {
        text += `ZÁPICHY: ${grooves.length}×\n`;
        grooves.forEach((g, i) => {
          text += `  ${i + 1}. šířka: ${g.width.toFixed(3)} mm  hloubka: ${g.depth.toFixed(3)} mm\n`;
        });
        text += '\n';
      }
      if (corners.length > 0) {
        text += `ROHY / SPOJE: ${corners.length}×\n`;
        corners.forEach((co, i) => {
          const angle = isNaN(co.angleDeg) ? (co.label || '—') : `${co.angleDeg.toFixed(1)}°`;
          text += `  ${i + 1}. ${angle}  pozice: [${co.point.x.toFixed(3)}, ${co.point.y.toFixed(3)}]\n`;
        });
      }
      navigator.clipboard.writeText(text)
        .then(() => showToast('Výsledky zkopírovány'))
        .catch(() => showToast('Kopírování se nezdařilo'));
    });
  }

  // ── Klik na řádek rohu → vybrat a vycentrovat na bod ──
  overlay.querySelectorAll('.ad-corner-row').forEach(row => {
    row.addEventListener('click', () => {
      const idx = parseInt(row.dataset.cornerIdx, 10);
      const corner = corners[idx];
      if (!corner) return;

      // Vybrat připojené objekty
      state.multiSelected.clear();
      state.multiSelected.add(corner.line1.idx);
      if (corner.line2) state.multiSelected.add(corner.line2.idx);
      if (corner.arc) state.multiSelected.add(corner.arc.idx);

      // Vycentrovat pohled na roh
      const pt = corner.point;
      const canvasW = drawCanvas.width;
      const canvasH = drawCanvas.height;
      state.panX = canvasW / 2 - pt.x * state.zoom;
      state.panY = canvasH / 2 + pt.y * state.zoom;

      overlay.remove();
      renderAll();
      showToast(`Roh ${idx + 1}: ${isNaN(corner.angleDeg) ? '' : corner.angleDeg.toFixed(1) + '°'}`);
    });
  });

  overlay.querySelector('.btn-ok').focus();
}
