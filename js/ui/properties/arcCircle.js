// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Panel vlastností: kružnice a oblouk                 ║
// ╚══════════════════════════════════════════════════════════════╝

// Vyňato z js/ui.js (16. 10. 2026, docs/plan-refaktoringu-ui.md, Fáze 4).
// Tělo větve switch(obj.type) z updateProperties doslova (jen o 4 mezery
// méně odsazené a bez závěrečného `break`); sdílené proměnné kostry
// (obj, tbody, H, V, pomocníci řádků) dostává parametrem.
// Kód aplikace importuje jen z js/ui.js, nikdy z js/ui/* napřímo.

import { pushUndo } from '../../state.js';
import { safeEvalMath } from '../../utils.js';
import { _afterGeomEdit } from './index.js';

/** Řádky panelu vlastností kružnice (case "circle") — tělo větve doslova. */
export function circleProps({ obj, tbody, H, V }) {
  // Grid: Střed Z+X vedle sebe, Poloměr+Průměr vedle sebe
  const cGridTr = document.createElement("tr");
  const cGridTd = document.createElement("td"); cGridTd.colSpan = 2;
  const cGrid = document.createElement("div"); cGrid.className = "prop-grid-2x2";

  const cLblH = document.createElement("span"); cLblH.className = "coord-label"; cLblH.textContent = "S." + H;
  cGrid.appendChild(cLblH);
  const cInpH = document.createElement("input"); cInpH.type = "text"; cInpH.inputMode = "decimal"; cInpH.className = "prop-input";
  cInpH.value = obj.cx.toFixed(3);
  cInpH.addEventListener("keydown", (e) => { if (e.key === "Enter") cInpH.blur(); e.stopPropagation(); });
  cInpH.addEventListener("focus", () => cInpH.select());
  cInpH.addEventListener("change", () => { const v = safeEvalMath(cInpH.value); if (!isNaN(v)) { pushUndo(); obj.cx = v; _afterGeomEdit(); } });
  cGrid.appendChild(cInpH);
  const cLblV = document.createElement("span"); cLblV.className = "coord-label"; cLblV.textContent = "S." + V;
  cGrid.appendChild(cLblV);
  const cInpV = document.createElement("input"); cInpV.type = "text"; cInpV.inputMode = "decimal"; cInpV.className = "prop-input";
  cInpV.value = obj.cy.toFixed(3);
  cInpV.addEventListener("keydown", (e) => { if (e.key === "Enter") cInpV.blur(); e.stopPropagation(); });
  cInpV.addEventListener("focus", () => cInpV.select());
  cInpV.addEventListener("change", () => { const v = safeEvalMath(cInpV.value); if (!isNaN(v)) { pushUndo(); obj.cy = v; _afterGeomEdit(); } });
  cGrid.appendChild(cInpV);

  const cLblR = document.createElement("span"); cLblR.className = "coord-label"; cLblR.textContent = "r";
  cGrid.appendChild(cLblR);
  const cInpR = document.createElement("input"); cInpR.type = "text"; cInpR.inputMode = "decimal"; cInpR.className = "prop-input";
  cInpR.value = obj.r.toFixed(3);
  cInpR.addEventListener("keydown", (e) => { if (e.key === "Enter") cInpR.blur(); e.stopPropagation(); });
  cInpR.addEventListener("focus", () => cInpR.select());
  cInpR.addEventListener("change", () => { const v = safeEvalMath(cInpR.value); if (!isNaN(v) && v > 0) { pushUndo(); obj.r = v; _afterGeomEdit(); cInpD.value = (obj.r * 2).toFixed(3); cInpO.value = (2 * Math.PI * obj.r).toFixed(3); } });
  cGrid.appendChild(cInpR);
  const cLblD = document.createElement("span"); cLblD.className = "coord-label"; cLblD.textContent = "⌀";
  cGrid.appendChild(cLblD);
  const cInpD = document.createElement("span"); cInpD.className = "prop-readonly"; cInpD.textContent = (obj.r * 2).toFixed(3);
  cGrid.appendChild(cInpD);

  const cLblO = document.createElement("span"); cLblO.className = "coord-label"; cLblO.textContent = "Obvod";
  cGrid.appendChild(cLblO);
  const cInpO = document.createElement("span"); cInpO.className = "prop-readonly"; cInpO.textContent = (2 * Math.PI * obj.r).toFixed(3);
  cGrid.appendChild(cInpO);
  // empty cells to fill grid
  cGrid.appendChild(document.createElement("span"));
  cGrid.appendChild(document.createElement("span"));

  cGridTd.appendChild(cGrid);
  cGridTr.appendChild(cGridTd);
  tbody.appendChild(cGridTr);
}

/** Řádky panelu vlastností oblouku (case "arc") — tělo větve doslova. */
export function arcProps({ obj, tbody, H, V }) {
  // Grid: Střed Z+X, Poloměr + empty, Start° + Konec°
  const aGridTr = document.createElement("tr");
  const aGridTd = document.createElement("td"); aGridTd.colSpan = 2;
  const aGrid = document.createElement("div"); aGrid.className = "prop-grid-2x2";

  const aLblH = document.createElement("span"); aLblH.className = "coord-label"; aLblH.textContent = "S." + H;
  aGrid.appendChild(aLblH);
  const aInpH = document.createElement("input"); aInpH.type = "text"; aInpH.inputMode = "decimal"; aInpH.className = "prop-input";
  aInpH.value = obj.cx.toFixed(3);
  aInpH.addEventListener("keydown", (e) => { if (e.key === "Enter") aInpH.blur(); e.stopPropagation(); });
  aInpH.addEventListener("focus", () => aInpH.select());
  aInpH.addEventListener("change", () => { const v = safeEvalMath(aInpH.value); if (!isNaN(v)) { pushUndo(); obj.cx = v; _afterGeomEdit(); } });
  aGrid.appendChild(aInpH);
  const aLblV = document.createElement("span"); aLblV.className = "coord-label"; aLblV.textContent = "S." + V;
  aGrid.appendChild(aLblV);
  const aInpV = document.createElement("input"); aInpV.type = "text"; aInpV.inputMode = "decimal"; aInpV.className = "prop-input";
  aInpV.value = obj.cy.toFixed(3);
  aInpV.addEventListener("keydown", (e) => { if (e.key === "Enter") aInpV.blur(); e.stopPropagation(); });
  aInpV.addEventListener("focus", () => aInpV.select());
  aInpV.addEventListener("change", () => { const v = safeEvalMath(aInpV.value); if (!isNaN(v)) { pushUndo(); obj.cy = v; _afterGeomEdit(); } });
  aGrid.appendChild(aInpV);

  const aLblR = document.createElement("span"); aLblR.className = "coord-label"; aLblR.textContent = "r";
  aGrid.appendChild(aLblR);
  const aInpR = document.createElement("input"); aInpR.type = "text"; aInpR.inputMode = "decimal"; aInpR.className = "prop-input";
  aInpR.value = obj.r.toFixed(3);
  aInpR.addEventListener("keydown", (e) => { if (e.key === "Enter") aInpR.blur(); e.stopPropagation(); });
  aInpR.addEventListener("focus", () => aInpR.select());
  aInpR.addEventListener("change", () => { const v = safeEvalMath(aInpR.value); if (!isNaN(v) && v > 0) { pushUndo(); obj.r = v; _afterGeomEdit(); } });
  aGrid.appendChild(aInpR);
  aGrid.appendChild(document.createElement("span")); // empty
  aGrid.appendChild(document.createElement("span")); // empty

  const aLblS = document.createElement("span"); aLblS.className = "coord-label"; aLblS.textContent = "Start°";
  aGrid.appendChild(aLblS);
  const aInpS = document.createElement("input"); aInpS.type = "text"; aInpS.inputMode = "decimal"; aInpS.className = "prop-input";
  aInpS.value = (obj.startAngle * 180 / Math.PI).toFixed(2);
  aInpS.addEventListener("keydown", (e) => { if (e.key === "Enter") aInpS.blur(); e.stopPropagation(); });
  aInpS.addEventListener("focus", () => aInpS.select());
  aInpS.addEventListener("change", () => { const v = safeEvalMath(aInpS.value); if (!isNaN(v)) { pushUndo(); obj.startAngle = v * Math.PI / 180; _afterGeomEdit(); } });
  aGrid.appendChild(aInpS);
  const aLblE = document.createElement("span"); aLblE.className = "coord-label"; aLblE.textContent = "Konec°";
  aGrid.appendChild(aLblE);
  const aInpE = document.createElement("input"); aInpE.type = "text"; aInpE.inputMode = "decimal"; aInpE.className = "prop-input";
  aInpE.value = (obj.endAngle * 180 / Math.PI).toFixed(2);
  aInpE.addEventListener("keydown", (e) => { if (e.key === "Enter") aInpE.blur(); e.stopPropagation(); });
  aInpE.addEventListener("focus", () => aInpE.select());
  aInpE.addEventListener("change", () => { const v = safeEvalMath(aInpE.value); if (!isNaN(v)) { pushUndo(); obj.endAngle = v * Math.PI / 180; _afterGeomEdit(); } });
  aGrid.appendChild(aInpE);

  aGridTd.appendChild(aGrid);
  aGridTr.appendChild(aGridTd);
  tbody.appendChild(aGridTr);
}
