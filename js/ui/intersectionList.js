// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Seznam průsečíků a rozbalování panelů               ║
// ╚══════════════════════════════════════════════════════════════╝

// Vyňato z js/ui.js beze změny (16. 10. 2026, docs/plan-refaktoringu-ui.md,
// Fáze 2c). Kód aplikace importuje jen z js/ui.js (updateIntersectionList,
// togglePanel — volá ho app.js), nikdy z js/ui/* napřímo.

import { COLORS, MOBILE_BREAKPOINT } from '../constants.js';
import { state, showToast, coordHelpers, fmtNum } from '../state.js';
import { renderAll } from '../render.js';
import { autoCenterView } from '../canvas.js';
import { bridge } from '../bridge.js';

export function updateIntersectionList() {
  const ul = document.getElementById("intersectionList");
  if (!ul) return;
  ul.innerHTML = "";
  if (state.intersections.length === 0) {
    ul.innerHTML =
      `<li style="color:${COLORS.textMuted};cursor:default">Žádné průsečíky</li>`;
    return;
  }

  const SEL_PT_TOL = 1e-4;
  const _isPtSel = (px, py) => state.selectedPoint && state.selectedPoint.some(p => Math.hypot(p.x - px, p.y - py) < SEL_PT_TOL);
  const _togglePt = (px, py, add) => {
    if (!state.selectedPoint) state.selectedPoint = [];
    if (add) {
      if (!_isPtSel(px, py)) state.selectedPoint.push({ x: px, y: py });
    } else {
      const i = state.selectedPoint.findIndex(p => Math.hypot(p.x - px, p.y - py) < SEL_PT_TOL);
      if (i >= 0) state.selectedPoint.splice(i, 1);
      if (state.selectedPoint.length === 0) state.selectedPoint = null;
    }
  };

  // ── Select-all + Číslovat řádek ──
  const selectAllLi = document.createElement("li");
  selectAllLi.className = "select-all-row";

  const selectAllCb = document.createElement("input");
  selectAllCb.type = "checkbox";
  selectAllCb.className = "int-checkbox";
  selectAllCb.title = "Vybrat vše";
  const allChecked = state.intersections.every(pt => _isPtSel(pt.x, pt.y));
  selectAllCb.checked = allChecked;
  selectAllCb.addEventListener("change", () => {
    if (selectAllCb.checked) {
      state.intersections.forEach(pt => {
        if (!_isPtSel(pt.x, pt.y)) {
          if (!state.selectedPoint) state.selectedPoint = [];
          state.selectedPoint.push({ x: pt.x, y: pt.y });
        }
      });
    } else {
      state.intersections.forEach(pt => {
        _togglePt(pt.x, pt.y, false);
      });
    }
    updateIntersectionList();
    renderAll();
  });
  const selLabel = document.createElement("span");
  selLabel.textContent = "Vše";
  selLabel.style.opacity = "0.7";
  selectAllLi.appendChild(selectAllCb);
  selectAllLi.appendChild(selLabel);

  // Checkbox pro číslování průsečíků
  const numCb = document.createElement("input");
  numCb.type = "checkbox";
  numCb.className = "int-checkbox";
  numCb.style.marginLeft = "auto";
  numCb.title = "Zobrazit čísla průsečíků na výkrese";
  numCb.checked = !!state.showIntersectionNumbers;
  numCb.addEventListener("change", () => {
    state.showIntersectionNumbers = numCb.checked;
    renderAll();
    if (numCb.checked && window.innerWidth <= MOBILE_BREAKPOINT) {
      const sidebar = document.getElementById("sidebar");
      const sidebarOverlay = document.getElementById("sidebarOverlay");
      sidebar.classList.remove("mobile-open");
      sidebarOverlay.classList.remove("active");
      setTimeout(() => autoCenterView(), 260);
    }
  });
  const numLabel = document.createElement("span");
  numLabel.textContent = "Číslovat";
  numLabel.style.opacity = "0.7";
  selectAllLi.appendChild(numCb);
  selectAllLi.appendChild(numLabel);

  ul.appendChild(selectAllLi);

  // ── Jednotlivé průsečíky ──
  const { H: _iH, V: _iV, Hp: _Hp, Vp: _Vp, fH, fV } = coordHelpers();
  state.intersections.forEach((pt, i) => {
    const li = document.createElement("li");
    const isSel = _isPtSel(pt.x, pt.y);
    li.className = isSel ? "selected" : "";

    // Checkbox pro výběr
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "int-checkbox";
    cb.checked = isSel;
    cb.addEventListener("change", (e) => {
      e.stopPropagation();
      _togglePt(pt.x, pt.y, cb.checked);
      updateIntersectionList();
      renderAll();
    });
    li.appendChild(cb);

    // Souřadnice + číslo
    const _hv = fH(pt.x);
    const _vv = fV(pt.y);
    const coordSpan = document.createElement("span");
    coordSpan.style.flex = "1";
    coordSpan.textContent = `${_Hp}${_iH}=${fmtNum(_hv)}  ${_Vp}${_iV}=${fmtNum(_vv)}`;
    li.appendChild(coordSpan);

    // Číslo průsečíku
    const numSpan = document.createElement("span");
    numSpan.style.cssText = "font-size:10px;opacity:0.5;margin-left:4px";
    numSpan.textContent = `P${i + 1}`;
    li.appendChild(numSpan);

    // Klik na text = kopírovat souřadnice
    coordSpan.addEventListener("click", () => {
      const text = `${_Hp}${_iH}${fmtNum(_hv)} ${_Vp}${_iV}${fmtNum(_vv)}`;
      navigator.clipboard
        .writeText(text)
        .then(() => showToast(`Zkopírováno: ${text}`));
    });
    coordSpan.title = "Klikněte pro zkopírování souřadnic";

    ul.appendChild(li);
  });
}

// ── Panely ──
/** @param {string} id  ID kontejneru panelu */
export function togglePanel(id) {
  const el = document.getElementById(id);
  const computed = getComputedStyle(el).display;
  const opening = computed === "none";
  el.style.display = opening ? "block" : "none";
  // Update header arrow
  const header = el.previousElementSibling;
  if (header && header.classList.contains('panel-header')) {
    const textNode = header.childNodes;
    for (const n of textNode) {
      if (n.nodeType === 3) {
        n.textContent = n.textContent.replace(/[▾▸]/, opening ? '▾' : '▸');
        break;
      }
    }
  }
  if (opening && id === 'cncPanel' && bridge.runCncExport) {
    bridge.runCncExport();
  }
  if (opening && id === 'intPanel' && bridge.calculateAllIntersections) {
    bridge.calculateAllIntersections();
  }
}
