// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Panel vlastností: kontura                           ║
// ╚══════════════════════════════════════════════════════════════╝

// Vyňato z js/ui.js (16. 10. 2026, docs/plan-refaktoringu-ui.md, Fáze 4).
// Tělo větve switch(obj.type) z updateProperties doslova (jen o 4 mezery
// méně odsazené a bez závěrečného `break`); sdílené proměnné kostry
// (obj, tbody, H, V, pomocníci řádků) dostává parametrem.
// Kód aplikace importuje jen z js/ui.js, nikdy z js/ui/* napřímo.

import { COLORS } from '../../constants.js';
import { state, toDisplayAngle } from '../../state.js';
import { bulgeToArc } from '../../utils.js';
import { renderAll } from '../../render.js';
import { _toggleSegmentSelection } from '../objectList.js';
import { updateProperties } from './index.js';

/** Řádky panelu vlastností kontury (case "polyline") — tělo větve doslova. */
export function polylineProps({ obj, tbody, H, V, addEditRow, addInfoRow }) {
  const pn = obj.vertices.length;
  const pSegCnt = obj.closed ? pn : pn - 1;
  const selSeg = state.selectedSegment;
  // Detail mode jen pokud selectedSegment je nastaven a NEjsme v multi-seg checkbox mode
  const objSegsForDetail = state.multiSelectedSegments.get(state.selected);
  const inCheckboxMode = objSegsForDetail && objSegsForDetail.size > 0;
  const hasSelSeg = selSeg !== null && selSeg >= 0 && selSeg < pSegCnt && !inCheckboxMode;

  if (hasSelSeg) {
    // ── Segment detail mode ──
    const si = selSeg;
    const p1 = obj.vertices[si];
    const p2 = obj.vertices[(si + 1) % pn];
    const b = obj.bulges[si] || 0;

    addInfoRow("Režim", "Editace segmentu");
    addInfoRow("Segment", `${si + 1} / ${pSegCnt}`);
    addInfoRow("Typ", b === 0 ? "Úsečka" : "Oblouk");

    // Editable start vertex
    addEditRow(`Start ${H}`, p1.x, (val) => { p1.x = val; });
    addEditRow(`Start ${V}`, p1.y, (val) => { p1.y = val; });
    // Editable end vertex
    addEditRow(`Konec ${H}`, p2.x, (val) => { p2.x = val; });
    addEditRow(`Konec ${V}`, p2.y, (val) => { p2.y = val; });

    if (b === 0) {
      // Straight segment info
      const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const segAngle = toDisplayAngle((Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI);
      addInfoRow("Délka", segLen.toFixed(3));
      addInfoRow("Úhel", segAngle.toFixed(2) + "°");
    } else {
      // Arc segment info
      const parc = bulgeToArc(p1, p2, b);
      if (parc) {
        const theta = 4 * Math.atan(Math.abs(b));
        addInfoRow("Poloměr", parc.r.toFixed(3));
        addInfoRow("Délka oblouku", (parc.r * theta).toFixed(3));
        addInfoRow("Střed X", parc.cx.toFixed(3));
        addInfoRow("Střed Z", parc.cy.toFixed(3));
      }
    }
    addEditRow("Bulge", b, (val) => { obj.bulges[si] = val; }, "0.01");

    // Button: back to polyline overview
    {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 2;
      td.style.paddingTop = "8px";
      const btn = document.createElement("button");
      btn.textContent = "← Zpět na konturu";
      btn.className = "prop-input";
      btn.style.cssText = `cursor:pointer;background:${COLORS.surfaceHover};color:${COLORS.text};border:1px solid ${COLORS.border};border-radius:4px;padding:4px 8px;width:100%`;
      btn.addEventListener("click", () => {
        state.selectedSegment = null;
        state._selectedSegmentObjIdx = null;
        state.multiSelectedSegments.clear();
        updateProperties();
        renderAll();
      });
      td.appendChild(btn);
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  } else {
    // ── Polyline overview mode ──
    addInfoRow("Vrcholů", pn);
    addInfoRow("Uzavřená", obj.closed ? "Ano" : "Ne");
    // Total length
    let polyLen = 0;
    let arcCount = 0;
    for (let i = 0; i < pSegCnt; i++) {
      const pp1 = obj.vertices[i];
      const pp2 = obj.vertices[(i + 1) % pn];
      const pb = obj.bulges[i] || 0;
      if (pb === 0) {
        polyLen += Math.hypot(pp2.x - pp1.x, pp2.y - pp1.y);
      } else {
        arcCount++;
        const parc = bulgeToArc(pp1, pp2, pb);
        if (parc) {
          const theta = 4 * Math.atan(Math.abs(pb));
          polyLen += parc.r * theta;
        }
      }
    }
    addInfoRow("Celková délka", polyLen.toFixed(3));
    addInfoRow("Segmentů", pSegCnt + " (" + arcCount + " oblouků)");

    // Clickable segment list with checkboxes
    for (let i = 0; i < pSegCnt; i++) {
      const sp1 = obj.vertices[i];
      const sp2 = obj.vertices[(i + 1) % pn];
      const sb = obj.bulges[i] || 0;
      const segType = sb === 0 ? "úsečka" : "oblouk";
      const segLen = sb === 0
        ? Math.hypot(sp2.x - sp1.x, sp2.y - sp1.y)
        : (() => { const a = bulgeToArc(sp1, sp2, sb); return a ? a.r * 4 * Math.atan(Math.abs(sb)) : 0; })();

      const objIdx = state.selected;
      const objSegs = state.multiSelectedSegments.get(objIdx);
      const isSegSel = objSegs ? objSegs.has(i) : false;

      const tr = document.createElement("tr");
      tr.style.cursor = "pointer";
      tr.title = "Klikněte pro detail / checkbox pro výběr";
      const tdLabel = document.createElement("td");
      tdLabel.style.cssText = "display:flex;align-items:center;gap:4px";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = isSegSel;
      cb.style.cssText = "accent-color:#89b4fa;margin:0;cursor:pointer";
      cb.title = "Přidat/odebrat segment z výběru";
      cb.addEventListener("click", (e) => {
        e.stopPropagation();
        _toggleSegmentSelection(objIdx, i);
      });
      tdLabel.appendChild(cb);
      const labelSpan = document.createElement("span");
      labelSpan.textContent = `S${i + 1}`;
      labelSpan.style.color = isSegSel ? COLORS.selected : COLORS.primary;
      tdLabel.appendChild(labelSpan);
      const tdVal = document.createElement("td");
      tdVal.textContent = `${segType}, ${segLen.toFixed(2)} mm`;
      tdVal.className = "prop-readonly";
      if (isSegSel) tdVal.style.color = COLORS.selected;
      tr.appendChild(tdLabel);
      tr.appendChild(tdVal);
      tr.addEventListener("click", () => {
        state.selectedSegment = i;
        state._selectedSegmentObjIdx = state.selected;
        updateProperties();
        renderAll();
      });
      tr.addEventListener("mouseenter", () => { tr.style.background = COLORS.surfaceHover; });
      tr.addEventListener("mouseleave", () => { tr.style.background = ""; });
      tbody.appendChild(tr);
    }

    // Show vertices
    obj.vertices.forEach((v, vi) => {
      addEditRow(`V${vi + 1} X`, v.x, (val) => { v.x = val; });
      addEditRow(`V${vi + 1} Z`, v.y, (val) => { v.y = val; });
    });
  }
}
