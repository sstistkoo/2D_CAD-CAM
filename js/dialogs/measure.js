// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Dialogy / Měření                                 ║
// ║  (showMeasureResult, showIntersectionInfo, showMeasureObj) ║
// ╚══════════════════════════════════════════════════════════════╝

import { COLORS } from '../constants.js';
import { makeInputOverlay } from '../dialogFactory.js';
import { state, showToast, toDisplayCoords, toDisplayAngle, axisLabels, displayX, xPrefix, coordHelpers, pushUndo } from '../state.js';
import { addObject } from '../objects.js';
import { renderAll } from '../render.js';
import { typeLabel, bulgeToArc, safeEvalMath } from '../utils.js';
import { updateObjectList } from '../ui.js';
import { addDimensionForObject, addAngleDimensionForLines, updateAssociativeDimensions } from './dimension.js';
import { showEditObjectDialog, wireExprInputs } from './mobileEdit.js';
import { projectPointToLine, distPointToInfiniteLine, angleBetweenLines, intersectInfiniteLines, calculateAllIntersections } from '../geometry.js';
import { removeAnchorsForObject, cleanupOrphanAnchors } from '../tools/index.js';

// ── Měření – dialog výsledku ──
/**
 * @param {import('../types.js').Point2D} p1
 * @param {import('../types.js').Point2D} p2
 * @param {number} d
 * @param {number} angle
 */
export function showMeasureResult(p1, p2, d, angle) {
  const dp1 = toDisplayCoords(p1.x, p1.y);
  const dp2 = toDisplayCoords(p2.x, p2.y);
  const pf = state.coordMode === 'inc' ? 'Δ' : '';
  const { H, V, Hp, Vp, fH, fV } = coordHelpers();
  const incRow = state.coordMode === 'inc' ? `
        <tr><td colspan="2" style="color:${COLORS.border};font-size:11px;padding-top:6px">── Inkrementální (od reference) ──</td></tr>
        <tr><td style="color:${COLORS.label}">${pf}Bod 1:</td><td style="color:${COLORS.preview}">${pf}${Hp}${H}${fH(dp1.x).toFixed(3)} ${pf}${Vp}${V}${fV(dp1.y).toFixed(3)}</td></tr>
        <tr><td style="color:${COLORS.label}">${pf}Bod 2:</td><td style="color:${COLORS.preview}">${pf}${Hp}${H}${fH(dp2.x).toFixed(3)} ${pf}${Vp}${V}${fV(dp2.y).toFixed(3)}</td></tr>
  ` : '';
  const overlay = makeInputOverlay(`
    <div class="input-dialog">
      <h3>📏 Výsledek měření</h3>
      <table style="width:100%;font-family:Consolas;font-size:13px;">
        <tr><td style="color:${COLORS.label}">Vzdálenost:</td><td style="color:${COLORS.selected}">${d.toFixed(3)} mm</td></tr>
        <tr><td style="color:${COLORS.label}">Úhel:</td><td style="color:${COLORS.selected}">${angle.toFixed(2)}°</td></tr>
        <tr><td style="color:${COLORS.label}">Δ${Hp}${H}:</td><td style="color:${COLORS.preview}">${fH(p2.x - p1.x).toFixed(3)}</td></tr>
        <tr><td style="color:${COLORS.label}">Δ${Vp}${V}:</td><td style="color:${COLORS.preview}">${fV(p2.y - p1.y).toFixed(3)}</td></tr>
        <tr><td style="color:${COLORS.label}">Bod 1:</td><td style="color:${COLORS.primary}">${Hp}${H}${fH(p1.x).toFixed(3)} ${Vp}${V}${fV(p1.y).toFixed(3)}</td></tr>
        <tr><td style="color:${COLORS.label}">Bod 2:</td><td style="color:${COLORS.primary}">${Hp}${H}${fH(p2.x).toFixed(3)} ${Vp}${V}${fV(p2.y).toFixed(3)}</td></tr>
        ${incRow}
      </table>
      <div class="btn-row">
        <button class="btn-cancel" id="measureAddDim">📐 Přidat kótu</button>
        <button class="btn-ok btn-cancel-overlay">OK</button>
      </div>
    </div>`);
  overlay
    .querySelector("#measureAddDim")
    .addEventListener("click", () => {
      // Přidat kótovací úsečku jako objekt
      addObject({
        type: "line",
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        name: `Kóta ${d.toFixed(2)}mm`,
        isDimension: true,
        color: COLORS.textSecondary,
      });
      showToast(`Kóta ${d.toFixed(2)}mm přidána`);
      overlay.remove();
    });
  overlay.querySelector(".btn-ok").focus();
}

// ── Měření – info o průsečíku ──
/**
 * Zobrazí info o průsečíkovém bodu.
 * @param {import('../types.js').Point2D} pt
 */
export function showIntersectionInfo(pt) {
  const { H, V, Hp, Vp, fH, fV } = coordHelpers();
  const hv = fH(pt.x);
  const vv = fV(pt.y);
  const overlay = makeInputOverlay(`
    <div class="input-dialog">
      <h3>⨯ Průsečík</h3>
      <table style="width:100%;font-family:Consolas;font-size:14px;">
        <tr><td style="color:${COLORS.label}">${Hp}${H}:</td><td style="color:${COLORS.selected};font-size:16px">${hv.toFixed(3)}</td></tr>
        <tr><td style="color:${COLORS.label}">${Vp}${V}:</td><td style="color:${COLORS.selected};font-size:16px">${vv.toFixed(3)}</td></tr>
      </table>
      <div class="btn-row">
        <button class="btn-cancel" id="intCopy">📋 Kopírovat</button>
        <button class="btn-cancel" id="intAddPoint">📍 Vytvořit bod</button>
        <button class="btn-cancel" id="intAddDim">📐 Přidat kótu</button>
        <button class="btn-ok btn-cancel-overlay">OK</button>
      </div>
    </div>`);

  overlay.querySelector("#intCopy").addEventListener("click", () => {
    const text = `${Hp}${H}${hv.toFixed(3)} ${Vp}${V}${vv.toFixed(3)}`;
    navigator.clipboard.writeText(text).then(() => showToast(`Zkopírováno: ${text}`));
  });
  overlay.querySelector("#intAddPoint").addEventListener("click", () => {
    addObject({ type: "point", x: pt.x, y: pt.y, name: `Bod ${state.nextId}` });
    showToast(`Bod ${Hp}${H}${hv.toFixed(2)} ${Vp}${V}${vv.toFixed(2)} vytvořen`);
    overlay.remove();
  });
  overlay.querySelector("#intAddDim").addEventListener("click", () => {
    addDimensionForObject({ type: 'point', x: pt.x, y: pt.y });
    calculateAllIntersections();
    renderAll();
    overlay.remove();
  });
  overlay.querySelector(".btn-ok").focus();
}

// ── Měření – info o existujícím objektu ──
/**
 * @param {import('../types.js').DrawObject} obj
 * @param {number} wx
 * @param {number} wy
 */
export function showMeasureObjectInfo(obj, wx, wy, objIdx) {
  const html = buildObjectInfoDialog(obj, objIdx);
  const overlay = makeInputOverlay(html);
  overlay.querySelector(".btn-ok").focus();
}

function buildObjectInfoDialog(obj, objIdx) {
  const { H, V, Hp, Vp, fH, fV } = coordHelpers();
  let rows = "";
  rows += `<tr><td style="color:${COLORS.label}">Typ:</td><td style="color:${COLORS.text}">${typeLabel(obj.type)}</td></tr>`;
  if (obj.name) {
    const safeName = obj.name.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    rows += `<tr><td style="color:${COLORS.label}">Název:</td><td style="color:${COLORS.text}">${safeName}</td></tr>`;
  }

  switch (obj.type) {
    case "point":
      rows += `<tr><td style="color:${COLORS.label}">${Hp}${H}:</td><td style="color:${COLORS.selected}">${fH(obj.x).toFixed(3)}</td></tr>`;
      rows += `<tr><td style="color:${COLORS.label}">${Vp}${V}:</td><td style="color:${COLORS.selected}">${fV(obj.y).toFixed(3)}</td></tr>`;
      break;
    case "line":
    case "constr": {
      // Úhlová kóta – speciální info
      if (obj.isDimension && obj.dimType === 'angular' && obj.dimCenterX != null) {
        const sweepDeg = (obj.dimAngle || 0) * 180 / Math.PI;
        rows += `<tr><td style="color:${COLORS.label}">Úhel:</td><td style="color:${COLORS.selected};font-size:16px">${sweepDeg.toFixed(1)}°</td></tr>`;
        rows += `<tr><td style="color:${COLORS.label}">Doplněk:</td><td style="color:${COLORS.selected}">${(180 - sweepDeg).toFixed(1)}°</td></tr>`;
        rows += `<tr><td style="color:${COLORS.label}">Průsečík:</td><td style="color:${COLORS.primary}">${Hp}${H}${fH(obj.dimCenterX).toFixed(3)} ${Vp}${V}${fV(obj.dimCenterY).toFixed(3)}</td></tr>`;
        break;
      }
      const len = Math.hypot(obj.x2 - obj.x1, obj.y2 - obj.y1);
      const angle = toDisplayAngle(
        (Math.atan2(obj.y2 - obj.y1, obj.x2 - obj.x1) * 180) / Math.PI);
      rows += `<tr><td style="color:${COLORS.label}">Bod 1:</td><td style="color:${COLORS.primary}">${Hp}${H}${fH(obj.x1).toFixed(3)} ${Vp}${V}${fV(obj.y1).toFixed(3)}</td></tr>`;
      rows += `<tr><td style="color:${COLORS.label}">Bod 2:</td><td style="color:${COLORS.primary}">${Hp}${H}${fH(obj.x2).toFixed(3)} ${Vp}${V}${fV(obj.y2).toFixed(3)}</td></tr>`;
      rows += `<tr><td style="color:${COLORS.label}">Délka:</td><td style="color:${COLORS.selected}">${len.toFixed(3)} mm</td></tr>`;
      rows += `<tr><td style="color:${COLORS.label}">Úhel:</td><td style="color:${COLORS.selected}">${angle.toFixed(2)}°</td></tr>`;
      rows += `<tr><td style="color:${COLORS.label}">Δ${Hp}${H}:</td><td style="color:${COLORS.preview}">${fH(obj.x2 - obj.x1).toFixed(3)}</td></tr>`;
      rows += `<tr><td style="color:${COLORS.label}">Δ${Vp}${V}:</td><td style="color:${COLORS.preview}">${fV(obj.y2 - obj.y1).toFixed(3)}</td></tr>`;
      break;
    }
    case "circle":
      rows += `<tr><td style="color:${COLORS.label}">Střed:</td><td style="color:${COLORS.primary}">${Hp}${H}${fH(obj.cx).toFixed(3)} ${Vp}${V}${fV(obj.cy).toFixed(3)}</td></tr>`;
      rows += `<tr><td style="color:${COLORS.label}">Poloměr:</td><td style="color:${COLORS.selected}">${obj.r.toFixed(3)} mm</td></tr>`;
      rows += `<tr><td style="color:${COLORS.label}">Průměr:</td><td style="color:${COLORS.selected}">${(obj.r * 2).toFixed(3)} mm</td></tr>`;
      rows += `<tr><td style="color:${COLORS.label}">Obvod:</td><td style="color:${COLORS.preview}">${(2 * Math.PI * obj.r).toFixed(3)} mm</td></tr>`;
      break;
    case "arc":
      rows += `<tr><td style="color:${COLORS.label}">Střed:</td><td style="color:${COLORS.primary}">${Hp}${H}${fH(obj.cx).toFixed(3)} ${Vp}${V}${fV(obj.cy).toFixed(3)}</td></tr>`;
      rows += `<tr><td style="color:${COLORS.label}">Poloměr:</td><td style="color:${COLORS.selected}">${obj.r.toFixed(3)} mm</td></tr>`;
      rows += `<tr><td style="color:${COLORS.label}">Start:</td><td style="color:${COLORS.preview}">${((obj.startAngle * 180) / Math.PI).toFixed(2)}°</td></tr>`;
      rows += `<tr><td style="color:${COLORS.label}">Konec:</td><td style="color:${COLORS.preview}">${((obj.endAngle * 180) / Math.PI).toFixed(2)}°</td></tr>`;
      break;
    case "rect": {
      const w = Math.abs(obj.x2 - obj.x1);
      const h = Math.abs(obj.y2 - obj.y1);
      rows += `<tr><td style="color:${COLORS.label}">Roh 1:</td><td style="color:${COLORS.primary}">${Hp}${H}${fH(obj.x1).toFixed(3)} ${Vp}${V}${fV(obj.y1).toFixed(3)}</td></tr>`;
      rows += `<tr><td style="color:${COLORS.label}">Roh 2:</td><td style="color:${COLORS.primary}">${Hp}${H}${fH(obj.x2).toFixed(3)} ${Vp}${V}${fV(obj.y2).toFixed(3)}</td></tr>`;
      rows += `<tr><td style="color:${COLORS.label}">Šířka:</td><td style="color:${COLORS.selected}">${w.toFixed(3)} mm</td></tr>`;
      rows += `<tr><td style="color:${COLORS.label}">Výška:</td><td style="color:${COLORS.selected}">${h.toFixed(3)} mm</td></tr>`;
      rows += `<tr><td style="color:${COLORS.label}">Obvod:</td><td style="color:${COLORS.preview}">${(2 * (w + h)).toFixed(3)} mm</td></tr>`;
      rows += `<tr><td style="color:${COLORS.label}">Plocha:</td><td style="color:${COLORS.preview}">${(w * h).toFixed(3)} mm²</td></tr>`;
      break;
    }
    case "polyline": {
      const pn = obj.vertices.length;
      const pSegCnt = obj.closed ? pn : pn - 1;
      let pTotalLen = 0;
      let pArcCnt = 0;
      for (let i = 0; i < pSegCnt; i++) {
        const pp1 = obj.vertices[i];
        const pp2 = obj.vertices[(i + 1) % pn];
        const pb = obj.bulges[i] || 0;
        if (pb === 0) {
          pTotalLen += Math.hypot(pp2.x - pp1.x, pp2.y - pp1.y);
        } else {
          pArcCnt++;
          const parc = bulgeToArc(pp1, pp2, pb);
          if (parc) {
            const theta = 4 * Math.atan(Math.abs(pb));
            pTotalLen += parc.r * theta;
          }
        }
      }
      rows += `<tr><td style="color:${COLORS.label}">Vrcholů:</td><td style="color:${COLORS.selected}">${pn}</td></tr>`;
      rows += `<tr><td style="color:${COLORS.label}">Segmentů:</td><td style="color:${COLORS.selected}">${pSegCnt} (${pArcCnt} oblouků)</td></tr>`;
      rows += `<tr><td style="color:${COLORS.label}">Uzavřená:</td><td style="color:${COLORS.selected}">${obj.closed ? 'Ano' : 'Ne'}</td></tr>`;
      rows += `<tr><td style="color:${COLORS.label}">Celk. délka:</td><td style="color:${COLORS.selected}">${pTotalLen.toFixed(3)} mm</td></tr>`;
      for (let i = 0; i < pn; i++) {
        rows += `<tr><td style="color:${COLORS.label}">V${i + 1}:</td><td style="color:${COLORS.primary}">${Hp}${H}${fH(obj.vertices[i].x).toFixed(3)} ${Vp}${V}${fV(obj.vertices[i].y).toFixed(3)}</td></tr>`;
      }
      break;
    }
  }

  let addDimBtn = "";
  let deleteDimBtn = "";
  let angularIntersectBtn = "";
  if (obj.isDimension || obj.isCoordLabel) {
    deleteDimBtn = objIdx !== undefined ? `<button class="btn-cancel" id="objDeleteDim" style="color:#e64553;border-color:#e6455355">🗑 Smazat kótu</button>` : '';
    // Úhlová kóta → tlačítko pro vytvoření průsečíku
    if (obj.dimType === 'angular' && obj.dimCenterX != null) {
      angularIntersectBtn = `<button class="btn-cancel" id="objAddIntersect">📍 Vytvořit průsečík</button>`;
    }
  } else if (obj.type === "line" || obj.type === "constr") {
    addDimBtn = `<button class="btn-cancel" id="objAddDim">📐 Přidat kótu</button>`;
  } else if (obj.type === "circle" || obj.type === "arc") {
    addDimBtn = `<button class="btn-cancel" id="objAddDim">📐 Přidat kótu R</button>`;
  } else if (obj.type === "rect") {
    addDimBtn = `<button class="btn-cancel" id="objAddDim">📐 Přidat kóty</button>`;
  } else if (obj.type === "point") {
    addDimBtn = `<button class="btn-cancel" id="objAddDim">📐 Přidat kótu souřadnic</button>`;
  } else if (obj.type === "polyline") {
    addDimBtn = `<button class="btn-cancel" id="objAddDim">📐 Přidat kóty</button>`;
  }

  let html = `
    <div class="input-dialog">
      <h3>${obj.isDimension || obj.isCoordLabel ? '⌗ Info o kótě' : '📏 Info o objektu'}</h3>
      <table style="width:100%;font-family:Consolas;font-size:13px;">
        ${rows}
      </table>
      <div class="btn-row">
        ${addDimBtn}
        ${angularIntersectBtn}
        ${deleteDimBtn}
        <button class="btn-cancel" id="objCopy">📋 Kopírovat</button>
        ${objIdx !== undefined && !obj.isDimension && !obj.isCoordLabel ? `<button class="btn-cancel" id="objEdit" style="color:${COLORS.dimension};border-color:${COLORS.dimension}55">✏️ Upravit</button>` : ''}
        <button class="btn-ok btn-cancel-overlay">OK</button>
      </div>
    </div>`;

  // Přidat event listenery po připojení ke DOM (musí být přes setTimeout)
  setTimeout(() => {
    const overlay = document.querySelector(".input-overlay:last-child");
    if (!overlay) return;

    const copyBtn = overlay.querySelector("#objCopy");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        const table = overlay.querySelector("table");
        const text = table.innerText;
        navigator.clipboard
          .writeText(text)
          .then(() => showToast("Info zkopírováno"));
      });
    }

    const dimBtn = overlay.querySelector("#objAddDim");
    if (dimBtn) {
      dimBtn.addEventListener("click", () => {
        addDimensionForObject(obj);
        overlay.remove();
      });
    }

    const editBtn = overlay.querySelector("#objEdit");
    if (editBtn && objIdx !== undefined) {
      editBtn.addEventListener("click", () => {
        state.selected = objIdx;
        updateObjectList();
        renderAll();
        overlay.remove();
        showEditObjectDialog(objIdx);
      });
    }

    const delDimBtn = overlay.querySelector("#objDeleteDim");
    if (delDimBtn && objIdx !== undefined) {
      delDimBtn.addEventListener("click", () => {
        pushUndo();
        removeAnchorsForObject(state.objects[objIdx]);
        state.objects.splice(objIdx, 1);
        if (state.selected === objIdx) state.selected = null;
        else if (state.selected > objIdx) state.selected--;
        const newMulti = new Set();
        for (const mi of state.multiSelected) {
          if (mi < objIdx) newMulti.add(mi);
          else if (mi > objIdx) newMulti.add(mi - 1);
        }
        state.multiSelected = newMulti;
        updateObjectList();
        calculateAllIntersections();
        cleanupOrphanAnchors();
        renderAll();
        overlay.remove();
        showToast("Kóta smazána ✓");
      });
    }

    const intersectBtn = overlay.querySelector("#objAddIntersect");
    if (intersectBtn && obj.dimCenterX != null && obj.dimCenterY != null) {
      intersectBtn.addEventListener("click", () => {
        addObject({ type: "point", x: obj.dimCenterX, y: obj.dimCenterY, name: `Průsečík ${state.nextId}` });
        calculateAllIntersections();
        renderAll();
        overlay.remove();
        showToast("Průsečík vytvořen ✓");
      });
    }
  }, 0);

  return html;
}

// ══════════════════════════════════════════════════════════════
// Nové dialogy pro měření vybraných objektů / snap bodů
// ══════════════════════════════════════════════════════════════

// ── Pomocný builder pro kóta tlačítko + kopírování ──
function _addCopyAndDimListeners(overlay, dimCallback) {
  const copyBtn = overlay.querySelector("#msCopy");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const table = overlay.querySelector("table");
      navigator.clipboard.writeText(table.innerText).then(() => showToast("Info zkopírováno"));
    });
  }
  const dimBtn = overlay.querySelector("#msAddDim");
  if (dimBtn && dimCallback) {
    dimBtn.addEventListener("click", () => { dimCallback(); overlay.remove(); });
  }
}

/**
 * Měření vzdálenosti mezi dvěma snap body.
 */
export function showMeasureTwoPointsResult(p1, p2) {
  const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const angle = toDisplayAngle(Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI);
  const { H, V, Hp, Vp, fH, fV } = coordHelpers();
  const overlay = makeInputOverlay(`
    <div class="input-dialog">
      <h3>📏 Měření – 2 body</h3>
      <table style="width:100%;font-family:Consolas;font-size:13px;">
        <tr><td style="color:${COLORS.label}">Vzdálenost:</td><td style="color:${COLORS.selected}">${d.toFixed(3)} mm</td></tr>
        <tr><td style="color:${COLORS.label}">Úhel:</td><td style="color:${COLORS.selected}">${angle.toFixed(2)}°</td></tr>
        <tr><td style="color:${COLORS.label}">Δ${Hp}${H}:</td><td style="color:${COLORS.preview}">${fH(p2.x - p1.x).toFixed(3)}</td></tr>
        <tr><td style="color:${COLORS.label}">Δ${Vp}${V}:</td><td style="color:${COLORS.preview}">${fV(p2.y - p1.y).toFixed(3)}</td></tr>
        <tr><td style="color:${COLORS.label}">Bod 1:</td><td style="color:${COLORS.primary}">${Hp}${H}${fH(p1.x).toFixed(3)} ${Vp}${V}${fV(p1.y).toFixed(3)}</td></tr>
        <tr><td style="color:${COLORS.label}">Bod 2:</td><td style="color:${COLORS.primary}">${Hp}${H}${fH(p2.x).toFixed(3)} ${Vp}${V}${fV(p2.y).toFixed(3)}</td></tr>
      </table>
      <div class="btn-row">
        <button class="btn-cancel" id="msAddDim">📐 Přidat kótu</button>
        <button class="btn-cancel" id="msCopy">📋 Kopírovat</button>
        <button class="btn-ok btn-cancel-overlay">OK</button>
      </div>
    </div>`);
  _addCopyAndDimListeners(overlay, () => {
    addObject({
      type: "line", x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
      name: `Kóta ${d.toFixed(2)}mm`, isDimension: true,
      dimSrcX1: p1.x, dimSrcY1: p1.y, dimSrcX2: p2.x, dimSrcY2: p2.y,
      color: COLORS.textSecondary,
    });
    showToast(`Kóta ${d.toFixed(2)}mm přidána`);
  });
}

/**
 * Měření cesty přes 3+ snap bodů.
 */
export function showMeasureMultiPointResult(points) {
  const { H, V, Hp, Vp, fH, fV } = coordHelpers();
  let rows = '';
  let totalLen = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    totalLen += d;
    rows += `<tr><td style="color:${COLORS.label}">Bod ${i + 1}→${i + 2}:</td><td style="color:${COLORS.preview}">${d.toFixed(3)} mm</td></tr>`;
  }
  // první -> poslední
  const first = points[0], last = points[points.length - 1];
  const directDist = Math.hypot(last.x - first.x, last.y - first.y);
  rows += `<tr><td colspan="2" style="border-top:1px solid ${COLORS.border};padding-top:4px"></td></tr>`;
  rows += `<tr><td style="color:${COLORS.label}">Celková cesta:</td><td style="color:${COLORS.selected}">${totalLen.toFixed(3)} mm</td></tr>`;
  rows += `<tr><td style="color:${COLORS.label}">Přímá vzd.:</td><td style="color:${COLORS.selected}">${directDist.toFixed(3)} mm</td></tr>`;
  rows += `<tr><td colspan="2" style="border-top:1px solid ${COLORS.border};padding-top:4px"></td></tr>`;
  points.forEach((p, i) => {
    rows += `<tr><td style="color:${COLORS.label}">Bod ${i + 1}:</td><td style="color:${COLORS.primary}">${Hp}${H}${fH(p.x).toFixed(3)} ${Vp}${V}${fV(p.y).toFixed(3)}</td></tr>`;
  });
  const overlay = makeInputOverlay(`
    <div class="input-dialog">
      <h3>📏 Měření – ${points.length} bodů</h3>
      <table style="width:100%;font-family:Consolas;font-size:13px;">
        ${rows}
      </table>
      <div class="btn-row">
        <button class="btn-cancel" id="msCopy">📋 Kopírovat</button>
        <button class="btn-ok btn-cancel-overlay">OK</button>
      </div>
    </div>`);
  _addCopyAndDimListeners(overlay);
}

/**
 * Měření mezi dvěma úsečkami (line/constr).
 * @param {object} obj1
 * @param {object} obj2
 * @param {number} [idx1] – index obj1 v state.objects
 * @param {number} [idx2] – index obj2 v state.objects
 */
export function showMeasureTwoLinesResult(obj1, obj2, idx1, idx2) {
  const { H, V, Hp, Vp, fH, fV } = coordHelpers();
  const dx1 = obj1.x2 - obj1.x1, dy1 = obj1.y2 - obj1.y1;
  const dx2 = obj2.x2 - obj2.x1, dy2 = obj2.y2 - obj2.y1;
  const len1 = Math.hypot(dx1, dy1), len2 = Math.hypot(dx2, dy2);
  const cross = (len1 > 1e-9 && len2 > 1e-9) ? Math.abs(dx1 * dy2 - dy1 * dx2) / (len1 * len2) : 1;
  const isParallel = cross < 0.01;
  const canEdit = idx1 !== undefined && idx2 !== undefined;

  let rows = '';
  if (isParallel) {
    const perpDist = distPointToInfiniteLine(obj2.x1, obj2.y1, obj1.x1, obj1.y1, obj1.x2, obj1.y2);
    rows += `<tr><td style="color:${COLORS.label}">Typ:</td><td style="color:${COLORS.text}">Rovnoběžné úsečky</td></tr>`;
    rows += `<tr><td style="color:${COLORS.label}">Kolmá vzd.:</td><td style="color:${COLORS.selected}">${perpDist.toFixed(3)} mm</td></tr>`;
    rows += `<tr><td style="color:${COLORS.label}">Délka 1:</td><td style="color:${COLORS.preview}">${len1.toFixed(3)} mm</td></tr>`;
    rows += `<tr><td style="color:${COLORS.label}">Délka 2:</td><td style="color:${COLORS.preview}">${len2.toFixed(3)} mm</td></tr>`;
    const overlay = makeInputOverlay(`
      <div class="input-dialog">
        <h3>📏 Měření – 2 úsečky ∥</h3>
        <table style="width:100%;font-family:Consolas;font-size:13px;">${rows}</table>
        ${canEdit ? `
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid ${COLORS.border}">
          <div style="margin-bottom:6px;color:${COLORS.label};font-size:12px">✏️ Upravit kolmou vzdálenost:</div>
          <div class="anchor-radio-row" style="margin-bottom:6px">
            <span>📌 Fixní:</span>
            <label><input type="radio" name="msFixLine" value="1" checked> Úsečka 1</label>
            <label><input type="radio" name="msFixLine" value="2"> Úsečka 2</label>
          </div>
          <div class="input-row">
            <div><label>Nová vzdálenost (mm):</label><input type="text" id="msNewDist" value="${perpDist.toFixed(3)}" style="width:120px"></div>
          </div>
          <div class="btn-row" style="margin-top:6px">
            <button class="btn-ok" id="msApplyDist" style="font-size:13px">✅ Použít</button>
          </div>
        </div>` : ''}
        <div class="btn-row">
          <button class="btn-cancel" id="msAddDim">📐 Přidat kótu</button>
          <button class="btn-cancel" id="msCopy">📋 Kopírovat</button>
          <button class="btn-ok btn-cancel-overlay">OK</button>
        </div>
      </div>`);
    if (canEdit) {
      wireExprInputs(overlay);
      const applyBtn = overlay.querySelector("#msApplyDist");
      if (applyBtn) applyBtn.addEventListener("click", () => {
        const raw = overlay.querySelector("#msNewDist").value.trim();
        const newDist = safeEvalMath(raw);
        if (!isFinite(newDist) || newDist < 0) { showToast("Neplatná vzdálenost"); return; }
        const fixLine = overlay.querySelector('input[name="msFixLine"]:checked').value;
        const fixObj = fixLine === '1' ? obj1 : obj2;
        const moveObj = fixLine === '1' ? obj2 : obj1;
        pushUndo();
        // Compute perpendicular direction from fixObj
        const fdx = fixObj.x2 - fixObj.x1, fdy = fixObj.y2 - fixObj.y1;
        const flen = Math.hypot(fdx, fdy);
        if (flen < 1e-10) { showToast("Úsečka je příliš krátká"); return; }
        const nx = -fdy / flen, ny = fdx / flen;
        // Current perpendicular distance (signed)
        const curSignedDist = (moveObj.x1 - fixObj.x1) * nx + (moveObj.y1 - fixObj.y1) * ny;
        const sign = curSignedDist >= 0 ? 1 : -1;
        const shift = sign * newDist - curSignedDist;
        moveObj.x1 += nx * shift; moveObj.y1 += ny * shift;
        moveObj.x2 += nx * shift; moveObj.y2 += ny * shift;
        updateAssociativeDimensions();
        calculateAllIntersections();
        renderAll();
        overlay.remove();
        showToast(`Vzdálenost změněna na ${newDist.toFixed(3)} mm`);
      });
    }
    _addCopyAndDimListeners(overlay, () => {
      const foot = projectPointToLine(obj2.x1, obj2.y1, obj1.x1, obj1.y1, obj1.x2, obj1.y2);
      addObject({
        type: "line", x1: obj2.x1, y1: obj2.y1, x2: foot.x, y2: foot.y,
        name: `Kóta ${perpDist.toFixed(2)}mm`, isDimension: true,
        dimSrcX1: obj2.x1, dimSrcY1: obj2.y1, dimSrcX2: foot.x, dimSrcY2: foot.y,
        color: COLORS.textSecondary,
      });
      showToast(`Kóta ${perpDist.toFixed(2)}mm přidána`);
    });
  } else {
    const angle = angleBetweenLines(obj1, obj2);
    const intPt = intersectInfiniteLines(obj1, obj2);
    rows += `<tr><td style="color:${COLORS.label}">Typ:</td><td style="color:${COLORS.text}">Různoběžné úsečky</td></tr>`;
    rows += `<tr><td style="color:${COLORS.label}">Úhel:</td><td style="color:${COLORS.selected}">${angle.toFixed(2)}°</td></tr>`;
    rows += `<tr><td style="color:${COLORS.label}">Doplněk:</td><td style="color:${COLORS.selected}">${(180 - angle).toFixed(2)}°</td></tr>`;
    if (intPt) {
      rows += `<tr><td style="color:${COLORS.label}">Průsečík:</td><td style="color:${COLORS.primary}">${Hp}${H}${fH(intPt.x).toFixed(3)} ${Vp}${V}${fV(intPt.y).toFixed(3)}</td></tr>`;
    }
    rows += `<tr><td style="color:${COLORS.label}">Délka 1:</td><td style="color:${COLORS.preview}">${len1.toFixed(3)} mm</td></tr>`;
    rows += `<tr><td style="color:${COLORS.label}">Délka 2:</td><td style="color:${COLORS.preview}">${len2.toFixed(3)} mm</td></tr>`;
    const overlay = makeInputOverlay(`
      <div class="input-dialog">
        <h3>📏 Měření – 2 úsečky ∠</h3>
        <table style="width:100%;font-family:Consolas;font-size:13px;">${rows}</table>
        ${canEdit ? `
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid ${COLORS.border}">
          <div style="margin-bottom:6px;color:${COLORS.label};font-size:12px">✏️ Upravit úhel mezi úsečkami:</div>
          <div class="anchor-radio-row" style="margin-bottom:6px">
            <span>📌 Fixní:</span>
            <label><input type="radio" name="msFixAngle" value="1" checked> Úsečka 1</label>
            <label><input type="radio" name="msFixAngle" value="2"> Úsečka 2</label>
          </div>
          <div class="input-row">
            <div><label>Nový úhel (°):</label><input type="text" id="msNewAngle" value="${angle.toFixed(2)}" style="width:120px"></div>
          </div>
          <div class="btn-row" style="margin-top:6px">
            <button class="btn-ok" id="msApplyAngle" style="font-size:13px">✅ Použít</button>
          </div>
        </div>` : ''}
        <div class="btn-row">
          ${intPt ? `<button class="btn-cancel" id="msAddPt">📍 Vytvořit průsečík</button>` : ''}
          <button class="btn-cancel" id="msAddAngleDim">📐 Přidat kótu ∠</button>
          <button class="btn-cancel" id="msCopy">📋 Kopírovat</button>
          <button class="btn-ok btn-cancel-overlay">OK</button>
        </div>
      </div>`);
    _addCopyAndDimListeners(overlay);
    if (canEdit) {
      wireExprInputs(overlay);
      const applyAngleBtn = overlay.querySelector("#msApplyAngle");
      if (applyAngleBtn) applyAngleBtn.addEventListener("click", () => {
        const raw = overlay.querySelector("#msNewAngle").value.trim();
        const newAngleDeg = safeEvalMath(raw);
        if (!isFinite(newAngleDeg) || newAngleDeg <= 0 || newAngleDeg >= 180) {
          showToast("Neplatný úhel (0–180°)"); return;
        }
        const fixChoice = overlay.querySelector('input[name="msFixAngle"]:checked').value;
        const fixObj = fixChoice === '1' ? obj1 : obj2;
        const moveObj = fixChoice === '1' ? obj2 : obj1;
        const pivot = intersectInfiniteLines(fixObj, moveObj);
        if (!pivot) { showToast("Nelze najít průsečík"); return; }
        pushUndo();
        // Direction of the fixed line
        const fDx = fixObj.x2 - fixObj.x1, fDy = fixObj.y2 - fixObj.y1;
        const fixAngleRad = Math.atan2(fDy, fDx);
        // Direction of the moving line
        const mDx = moveObj.x2 - moveObj.x1, mDy = moveObj.y2 - moveObj.y1;
        const movAngleRad = Math.atan2(mDy, mDx);
        // Cross product to determine which side the moving line is
        const crossVal = fDx * mDy - fDy * mDx;
        const side = crossVal >= 0 ? 1 : -1;
        // New direction angle for the moving line
        const newAngleRad = newAngleDeg * Math.PI / 180;
        const newMovAngleRad = fixAngleRad + side * newAngleRad;
        // Rotation to apply
        const rotationRad = newMovAngleRad - movAngleRad;
        const cosR = Math.cos(rotationRad), sinR = Math.sin(rotationRad);
        // Rotate both endpoints of the moving line around the pivot
        const rx1 = moveObj.x1 - pivot.x, ry1 = moveObj.y1 - pivot.y;
        moveObj.x1 = pivot.x + rx1 * cosR - ry1 * sinR;
        moveObj.y1 = pivot.y + rx1 * sinR + ry1 * cosR;
        const rx2 = moveObj.x2 - pivot.x, ry2 = moveObj.y2 - pivot.y;
        moveObj.x2 = pivot.x + rx2 * cosR - ry2 * sinR;
        moveObj.y2 = pivot.y + rx2 * sinR + ry2 * cosR;
        updateAssociativeDimensions();
        calculateAllIntersections();
        renderAll();
        overlay.remove();
        showToast(`Úhel změněn na ${newAngleDeg.toFixed(2)}°`);
      });
    }
    if (intPt) {
      const ptBtn = overlay.querySelector("#msAddPt");
      if (ptBtn) ptBtn.addEventListener("click", () => {
        addObject({ type: "point", x: intPt.x, y: intPt.y, name: `Průsečík ${state.nextId}` });
        showToast("Průsečík vytvořen");
        overlay.remove();
      });
    }
    const angleDimBtn = overlay.querySelector("#msAddAngleDim");
    if (angleDimBtn) {
      angleDimBtn.addEventListener("click", () => {
        pushUndo();
        addAngleDimensionForLines(obj1, obj2);
        calculateAllIntersections();
        renderAll();
        overlay.remove();
      });
    }
  }
}

/**
 * Měření mezi dvěma kružnicemi/oblouky.
 * @param {object} obj1
 * @param {object} obj2
 * @param {number} [idx1]
 * @param {number} [idx2]
 */
export function showMeasureTwoCirclesResult(obj1, obj2, idx1, idx2) {
  const { H, V, Hp, Vp, fH, fV } = coordHelpers();
  const centerDist = Math.hypot(obj2.cx - obj1.cx, obj2.cy - obj1.cy);
  const edgeDist = centerDist - obj1.r - obj2.r;
  const canEdit = idx1 !== undefined && idx2 !== undefined;
  let rows = '';
  rows += `<tr><td style="color:${COLORS.label}">Střed 1:</td><td style="color:${COLORS.primary}">${Hp}${H}${fH(obj1.cx).toFixed(3)} ${Vp}${V}${fV(obj1.cy).toFixed(3)}</td></tr>`;
  rows += `<tr><td style="color:${COLORS.label}">Střed 2:</td><td style="color:${COLORS.primary}">${Hp}${H}${fH(obj2.cx).toFixed(3)} ${Vp}${V}${fV(obj2.cy).toFixed(3)}</td></tr>`;
  rows += `<tr><td style="color:${COLORS.label}">Vzd. středů:</td><td style="color:${COLORS.selected}">${centerDist.toFixed(3)} mm</td></tr>`;
  rows += `<tr><td style="color:${COLORS.label}">Mezera okrajů:</td><td style="color:${COLORS.selected}">${edgeDist.toFixed(3)} mm</td></tr>`;
  rows += `<tr><td style="color:${COLORS.label}">R₁:</td><td style="color:${COLORS.preview}">${obj1.r.toFixed(3)} mm</td></tr>`;
  rows += `<tr><td style="color:${COLORS.label}">R₂:</td><td style="color:${COLORS.preview}">${obj2.r.toFixed(3)} mm</td></tr>`;
  const overlay = makeInputOverlay(`
    <div class="input-dialog">
      <h3>📏 Měření – 2 kružnice</h3>
      <table style="width:100%;font-family:Consolas;font-size:13px;">${rows}</table>
      ${canEdit ? `
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid ${COLORS.border}">
        <div style="margin-bottom:6px;color:${COLORS.label};font-size:12px">✏️ Upravit vzdálenost středů:</div>
        <div class="anchor-radio-row" style="margin-bottom:6px">
          <span>📌 Fixní:</span>
          <label><input type="radio" name="msFixCirc" value="1" checked> Kružnice 1</label>
          <label><input type="radio" name="msFixCirc" value="2"> Kružnice 2</label>
        </div>
        <div class="input-row">
          <div><label>Nová vzd. středů (mm):</label><input type="text" id="msNewCDist" value="${centerDist.toFixed(3)}" style="width:120px"></div>
        </div>
        <div class="btn-row" style="margin-top:6px">
          <button class="btn-ok" id="msApplyCDist" style="font-size:13px">✅ Použít</button>
        </div>
      </div>` : ''}
      <div class="btn-row">
        <button class="btn-cancel" id="msAddDim">📐 Přidat kótu</button>
        <button class="btn-cancel" id="msCopy">📋 Kopírovat</button>
        <button class="btn-ok btn-cancel-overlay">OK</button>
      </div>
    </div>`);
  if (canEdit) {
    wireExprInputs(overlay);
    const applyBtn = overlay.querySelector("#msApplyCDist");
    if (applyBtn) applyBtn.addEventListener("click", () => {
      const raw = overlay.querySelector("#msNewCDist").value.trim();
      const newDist = safeEvalMath(raw);
      if (!isFinite(newDist) || newDist < 0) { showToast("Neplatná vzdálenost"); return; }
      const fixChoice = overlay.querySelector('input[name="msFixCirc"]:checked').value;
      const fixObj = fixChoice === '1' ? obj1 : obj2;
      const moveObj = fixChoice === '1' ? obj2 : obj1;
      pushUndo();
      const dirX = moveObj.cx - fixObj.cx, dirY = moveObj.cy - fixObj.cy;
      const curDist = Math.hypot(dirX, dirY);
      if (curDist < 1e-10) { showToast("Středy jsou totožné"); return; }
      const ux = dirX / curDist, uy = dirY / curDist;
      moveObj.cx = fixObj.cx + ux * newDist;
      moveObj.cy = fixObj.cy + uy * newDist;
      updateAssociativeDimensions();
      calculateAllIntersections();
      renderAll();
      overlay.remove();
      showToast(`Vzdálenost středů změněna na ${newDist.toFixed(3)} mm`);
    });
  }
  _addCopyAndDimListeners(overlay, () => {
    addObject({
      type: "line", x1: obj1.cx, y1: obj1.cy, x2: obj2.cx, y2: obj2.cy,
      name: `Kóta ${centerDist.toFixed(2)}mm`, isDimension: true,
      dimSrcX1: obj1.cx, dimSrcY1: obj1.cy, dimSrcX2: obj2.cx, dimSrcY2: obj2.cy,
      color: COLORS.textSecondary,
    });
    showToast(`Kóta ${centerDist.toFixed(2)}mm přidána`);
  });
}

/**
 * Měření bod → úsečka (kolmá vzdálenost).
 * @param {object} pt – snap bod {x,y}
 * @param {object} lineObj
 * @param {number} [ptIdx] – index bodu v state.objects (pokud je to objekt)
 * @param {number} [lineIdx] – index úsečky v state.objects
 */
export function showMeasurePointToLineResult(pt, lineObj, ptIdx, lineIdx) {
  const { H, V, Hp, Vp, fH, fV } = coordHelpers();
  const foot = projectPointToLine(pt.x, pt.y, lineObj.x1, lineObj.y1, lineObj.x2, lineObj.y2);
  const perpDist = Math.hypot(pt.x - foot.x, pt.y - foot.y);
  const angle = toDisplayAngle(Math.atan2(pt.y - foot.y, pt.x - foot.x) * 180 / Math.PI);
  const canEdit = lineIdx !== undefined;
  let rows = '';
  rows += `<tr><td style="color:${COLORS.label}">Kolmá vzd.:</td><td style="color:${COLORS.selected}">${perpDist.toFixed(3)} mm</td></tr>`;
  rows += `<tr><td style="color:${COLORS.label}">Úhel:</td><td style="color:${COLORS.selected}">${angle.toFixed(2)}°</td></tr>`;
  rows += `<tr><td style="color:${COLORS.label}">Bod:</td><td style="color:${COLORS.primary}">${Hp}${H}${fH(pt.x).toFixed(3)} ${Vp}${V}${fV(pt.y).toFixed(3)}</td></tr>`;
  rows += `<tr><td style="color:${COLORS.label}">Pata kolmice:</td><td style="color:${COLORS.primary}">${Hp}${H}${fH(foot.x).toFixed(3)} ${Vp}${V}${fV(foot.y).toFixed(3)}</td></tr>`;
  const overlay = makeInputOverlay(`
    <div class="input-dialog">
      <h3>📏 Měření – bod ↔ úsečka</h3>
      <table style="width:100%;font-family:Consolas;font-size:13px;">${rows}</table>
      ${canEdit ? `
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid ${COLORS.border}">
        <div style="margin-bottom:6px;color:${COLORS.label};font-size:12px">✏️ Upravit kolmou vzdálenost:</div>
        <div class="anchor-radio-row" style="margin-bottom:6px">
          <span>📌 Co posunout:</span>
          <label><input type="radio" name="msMovePtL" value="pt" checked> Bod</label>
          <label><input type="radio" name="msMovePtL" value="line"> Úsečku</label>
        </div>
        <div class="input-row">
          <div><label>Nová vzdálenost (mm):</label><input type="text" id="msNewPLDist" value="${perpDist.toFixed(3)}" style="width:120px"></div>
        </div>
        <div class="btn-row" style="margin-top:6px">
          <button class="btn-ok" id="msApplyPLDist" style="font-size:13px">✅ Použít</button>
        </div>
      </div>` : ''}
      <div class="btn-row">
        <button class="btn-cancel" id="msAddDim">📐 Přidat kótu</button>
        <button class="btn-cancel" id="msCopy">📋 Kopírovat</button>
        <button class="btn-ok btn-cancel-overlay">OK</button>
      </div>
    </div>`);
  if (canEdit) {
    wireExprInputs(overlay);
    const applyBtn = overlay.querySelector("#msApplyPLDist");
    if (applyBtn) applyBtn.addEventListener("click", () => {
      const raw = overlay.querySelector("#msNewPLDist").value.trim();
      const newDist = safeEvalMath(raw);
      if (!isFinite(newDist) || newDist < 0) { showToast("Neplatná vzdálenost"); return; }
      const moveWhat = overlay.querySelector('input[name="msMovePtL"]:checked').value;
      pushUndo();
      // Perpendicular direction from line
      const ldx = lineObj.x2 - lineObj.x1, ldy = lineObj.y2 - lineObj.y1;
      const llen = Math.hypot(ldx, ldy);
      if (llen < 1e-10) { showToast("Úsečka je příliš krátká"); return; }
      const nx = -ldy / llen, ny = ldx / llen;
      // Current signed distance from line to point
      const curSigned = (pt.x - lineObj.x1) * nx + (pt.y - lineObj.y1) * ny;
      const sign = curSigned >= 0 ? 1 : -1;
      if (moveWhat === 'pt' && ptIdx !== undefined) {
        // Move the point object
        const ptObj = state.objects[ptIdx];
        if (ptObj && ptObj.type === 'point') {
          const footP = projectPointToLine(ptObj.x, ptObj.y, lineObj.x1, lineObj.y1, lineObj.x2, lineObj.y2);
          ptObj.x = footP.x + nx * sign * newDist;
          ptObj.y = footP.y + ny * sign * newDist;
        }
      } else {
        // Move the line
        const shift = sign * newDist - curSigned;
        // Move line in opposite direction (away from point → towards desired dist)
        lineObj.x1 -= nx * shift; lineObj.y1 -= ny * shift;
        lineObj.x2 -= nx * shift; lineObj.y2 -= ny * shift;
      }
      updateAssociativeDimensions();
      calculateAllIntersections();
      renderAll();
      overlay.remove();
      showToast(`Vzdálenost změněna na ${newDist.toFixed(3)} mm`);
    });
  }
  _addCopyAndDimListeners(overlay, () => {
    addObject({
      type: "line", x1: pt.x, y1: pt.y, x2: foot.x, y2: foot.y,
      name: `Kóta ${perpDist.toFixed(2)}mm`, isDimension: true,
      dimSrcX1: pt.x, dimSrcY1: pt.y, dimSrcX2: foot.x, dimSrcY2: foot.y,
      color: COLORS.textSecondary,
    });
    showToast(`Kóta ${perpDist.toFixed(2)}mm přidána`);
  });
}

/**
 * Měření bod → kružnice/oblouk.
 */
export function showMeasurePointToCircleResult(pt, circObj) {
  const { H, V, Hp, Vp, fH, fV } = coordHelpers();
  const centerDist = Math.hypot(pt.x - circObj.cx, pt.y - circObj.cy);
  const edgeDist = Math.abs(centerDist - circObj.r);
  let rows = '';
  rows += `<tr><td style="color:${COLORS.label}">Vzd. od středu:</td><td style="color:${COLORS.selected}">${centerDist.toFixed(3)} mm</td></tr>`;
  rows += `<tr><td style="color:${COLORS.label}">Vzd. od okraje:</td><td style="color:${COLORS.selected}">${edgeDist.toFixed(3)} mm</td></tr>`;
  rows += `<tr><td style="color:${COLORS.label}">Bod:</td><td style="color:${COLORS.primary}">${Hp}${H}${fH(pt.x).toFixed(3)} ${Vp}${V}${fV(pt.y).toFixed(3)}</td></tr>`;
  rows += `<tr><td style="color:${COLORS.label}">Střed:</td><td style="color:${COLORS.primary}">${Hp}${H}${fH(circObj.cx).toFixed(3)} ${Vp}${V}${fV(circObj.cy).toFixed(3)}</td></tr>`;
  rows += `<tr><td style="color:${COLORS.label}">Poloměr:</td><td style="color:${COLORS.preview}">${circObj.r.toFixed(3)} mm</td></tr>`;
  const overlay = makeInputOverlay(`
    <div class="input-dialog">
      <h3>📏 Měření – bod ↔ kružnice</h3>
      <table style="width:100%;font-family:Consolas;font-size:13px;">${rows}</table>
      <div class="btn-row">
        <button class="btn-cancel" id="msAddDim">📐 Přidat kótu</button>
        <button class="btn-cancel" id="msCopy">📋 Kopírovat</button>
        <button class="btn-ok btn-cancel-overlay">OK</button>
      </div>
    </div>`);
  _addCopyAndDimListeners(overlay, () => {
    addObject({
      type: "line", x1: pt.x, y1: pt.y, x2: circObj.cx, y2: circObj.cy,
      name: `Kóta ${centerDist.toFixed(2)}mm`, isDimension: true,
      dimSrcX1: pt.x, dimSrcY1: pt.y, dimSrcX2: circObj.cx, dimSrcY2: circObj.cy,
      color: COLORS.textSecondary,
    });
    showToast(`Kóta ${centerDist.toFixed(2)}mm přidána`);
  });
}

/**
 * Generický fallback: měření mezi dvěma libovolnými objekty.
 * Zobrazí vzdálenosti klíčových bodů.
 */
export function showMeasureTwoObjectsResult(obj1, obj2) {
  const { H, V, Hp, Vp, fH, fV } = coordHelpers();

  function _getCenter(o) {
    switch (o.type) {
      case 'point': return { x: o.x, y: o.y };
      case 'line': case 'constr': return { x: (o.x1 + o.x2) / 2, y: (o.y1 + o.y2) / 2 };
      case 'circle': case 'arc': return { x: o.cx, y: o.cy };
      case 'rect': return { x: (o.x1 + o.x2) / 2, y: (o.y1 + o.y2) / 2 };
      default: return { x: 0, y: 0 };
    }
  }
  const c1 = _getCenter(obj1), c2 = _getCenter(obj2);
  const d = Math.hypot(c2.x - c1.x, c2.y - c1.y);
  const angle = toDisplayAngle(Math.atan2(c2.y - c1.y, c2.x - c1.x) * 180 / Math.PI);
  let rows = '';
  rows += `<tr><td style="color:${COLORS.label}">Typ 1:</td><td style="color:${COLORS.text}">${typeLabel(obj1.type)}</td></tr>`;
  rows += `<tr><td style="color:${COLORS.label}">Typ 2:</td><td style="color:${COLORS.text}">${typeLabel(obj2.type)}</td></tr>`;
  rows += `<tr><td style="color:${COLORS.label}">Vzd. středů:</td><td style="color:${COLORS.selected}">${d.toFixed(3)} mm</td></tr>`;
  rows += `<tr><td style="color:${COLORS.label}">Úhel:</td><td style="color:${COLORS.selected}">${angle.toFixed(2)}°</td></tr>`;
  rows += `<tr><td style="color:${COLORS.label}">Δ${Hp}${H}:</td><td style="color:${COLORS.preview}">${fH(c2.x - c1.x).toFixed(3)}</td></tr>`;
  rows += `<tr><td style="color:${COLORS.label}">Δ${Vp}${V}:</td><td style="color:${COLORS.preview}">${fV(c2.y - c1.y).toFixed(3)}</td></tr>`;
  rows += `<tr><td style="color:${COLORS.label}">Střed 1:</td><td style="color:${COLORS.primary}">${Hp}${H}${fH(c1.x).toFixed(3)} ${Vp}${V}${fV(c1.y).toFixed(3)}</td></tr>`;
  rows += `<tr><td style="color:${COLORS.label}">Střed 2:</td><td style="color:${COLORS.primary}">${Hp}${H}${fH(c2.x).toFixed(3)} ${Vp}${V}${fV(c2.y).toFixed(3)}</td></tr>`;
  const overlay = makeInputOverlay(`
    <div class="input-dialog">
      <h3>📏 Měření – 2 objekty</h3>
      <table style="width:100%;font-family:Consolas;font-size:13px;">${rows}</table>
      <div class="btn-row">
        <button class="btn-cancel" id="msAddDim">📐 Přidat kótu</button>
        <button class="btn-cancel" id="msCopy">📋 Kopírovat</button>
        <button class="btn-ok btn-cancel-overlay">OK</button>
      </div>
    </div>`);
  _addCopyAndDimListeners(overlay, () => {
    addObject({
      type: "line", x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y,
      name: `Kóta ${d.toFixed(2)}mm`, isDimension: true,
      dimSrcX1: c1.x, dimSrcY1: c1.y, dimSrcX2: c2.x, dimSrcY2: c2.y,
      color: COLORS.textSecondary,
    });
    showToast(`Kóta ${d.toFixed(2)}mm přidána`);
  });
}

/**
 * Souhrnné měření N vybraných objektů (3+).
 * Zobrazí info o každém objektu + vzájemné vztahy.
 * @param {Array<object>} objs - vybrané objekty
 * @param {Array<number>} indices - indexy v state.objects
 */
export function showMeasureMultiObjectResult(objs, indices) {
  const { H, V, Hp, Vp, fH, fV } = coordHelpers();

  function _isLine(o) { return o.type === 'line' || o.type === 'constr'; }
  function _isCircle(o) { return o.type === 'circle' || o.type === 'arc'; }

  let rows = '';
  // --- Souhrn každého objektu ---
  for (let i = 0; i < objs.length; i++) {
    const o = objs[i];
    const label = o.name || typeLabel(o.type);
    const safeLabel = label.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    rows += `<tr><td colspan="2" style="border-top:1px solid ${COLORS.border};padding-top:4px;color:${COLORS.dimension};font-weight:bold">${i + 1}. ${safeLabel}</td></tr>`;
    switch (o.type) {
      case 'point':
        rows += `<tr><td style="color:${COLORS.label};padding-left:12px">${Hp}${H}:</td><td style="color:${COLORS.selected}">${fH(o.x).toFixed(3)}</td></tr>`;
        rows += `<tr><td style="color:${COLORS.label};padding-left:12px">${Vp}${V}:</td><td style="color:${COLORS.selected}">${fV(o.y).toFixed(3)}</td></tr>`;
        break;
      case 'line': case 'constr': {
        const len = Math.hypot(o.x2 - o.x1, o.y2 - o.y1);
        const ang = toDisplayAngle(Math.atan2(o.y2 - o.y1, o.x2 - o.x1) * 180 / Math.PI);
        rows += `<tr><td style="color:${COLORS.label};padding-left:12px">Délka:</td><td style="color:${COLORS.selected}">${len.toFixed(3)} mm</td></tr>`;
        rows += `<tr><td style="color:${COLORS.label};padding-left:12px">Úhel:</td><td style="color:${COLORS.selected}">${ang.toFixed(2)}°</td></tr>`;
        break;
      }
      case 'circle':
        rows += `<tr><td style="color:${COLORS.label};padding-left:12px">Poloměr:</td><td style="color:${COLORS.selected}">${o.r.toFixed(3)} mm</td></tr>`;
        rows += `<tr><td style="color:${COLORS.label};padding-left:12px">Průměr:</td><td style="color:${COLORS.selected}">${(o.r * 2).toFixed(3)} mm</td></tr>`;
        break;
      case 'arc':
        rows += `<tr><td style="color:${COLORS.label};padding-left:12px">Poloměr:</td><td style="color:${COLORS.selected}">${o.r.toFixed(3)} mm</td></tr>`;
        break;
      case 'rect': {
        const w = Math.abs(o.x2 - o.x1), h = Math.abs(o.y2 - o.y1);
        rows += `<tr><td style="color:${COLORS.label};padding-left:12px">Šířka×Výška:</td><td style="color:${COLORS.selected}">${w.toFixed(3)} × ${h.toFixed(3)} mm</td></tr>`;
        break;
      }
      case 'polyline': {
        let pLen = 0;
        const pn = o.vertices.length;
        const pSeg = o.closed ? pn : pn - 1;
        for (let si = 0; si < pSeg; si++) {
          const a = o.vertices[si], b = o.vertices[(si + 1) % pn];
          const bg = o.bulges[si] || 0;
          if (bg === 0) pLen += Math.hypot(b.x - a.x, b.y - a.y);
          else { const arc = bulgeToArc(a, b, bg); if (arc) pLen += arc.r * 4 * Math.atan(Math.abs(bg)); }
        }
        rows += `<tr><td style="color:${COLORS.label};padding-left:12px">Délka:</td><td style="color:${COLORS.selected}">${pLen.toFixed(3)} mm</td></tr>`;
        break;
      }
    }
  }

  // --- Vzájemné vztahy (úhly mezi úsečkami, vzdálenosti) ---
  const lines = objs.filter(_isLine);
  const circles = objs.filter(_isCircle);
  if (lines.length >= 2) {
    rows += `<tr><td colspan="2" style="border-top:1px solid ${COLORS.border};padding-top:6px;color:${COLORS.dimension};font-weight:bold">Úhly mezi úsečkami</td></tr>`;
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        const a = angleBetweenLines(lines[i], lines[j]);
        const n1 = lines[i].name || `Ú${i + 1}`;
        const n2 = lines[j].name || `Ú${j + 1}`;
        rows += `<tr><td style="color:${COLORS.label};padding-left:12px">${n1} ↔ ${n2}:</td><td style="color:${COLORS.selected}">${a.toFixed(2)}°</td></tr>`;
      }
    }
  }

  const overlay = makeInputOverlay(`
    <div class="input-dialog" style="max-height:80vh;overflow-y:auto">
      <h3>📏 Měření – ${objs.length} objektů</h3>
      <table style="width:100%;font-family:Consolas;font-size:13px;">${rows}</table>
      <div class="btn-row">
        <button class="btn-cancel" id="msAddAllDims">📐 Přidat kóty ke všem</button>
        <button class="btn-cancel" id="msCopy">📋 Kopírovat</button>
        <button class="btn-ok btn-cancel-overlay">OK</button>
      </div>
    </div>`);
  _addCopyAndDimListeners(overlay);
  const addAllBtn = overlay.querySelector("#msAddAllDims");
  if (addAllBtn) {
    addAllBtn.addEventListener("click", () => {
      pushUndo();
      let count = 0;
      for (const o of objs) {
        if (o.isDimension || o.isCoordLabel) continue;
        addDimensionForObject(o);
        count++;
      }
      // Úhlové kóty mezi páry úseček
      if (lines.length >= 2) {
        for (let i = 0; i < lines.length; i++) {
          for (let j = i + 1; j < lines.length; j++) {
            if (lines[i].isDimension || lines[j].isDimension) continue;
            addAngleDimensionForLines(lines[i], lines[j]);
            count++;
          }
        }
      }
      calculateAllIntersections();
      renderAll();
      overlay.remove();
      showToast(`Přidáno ${count} kót ✓`);
    });
  }
}
