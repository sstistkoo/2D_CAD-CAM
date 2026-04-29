// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Dialogy / Tečny (choice, pozice)                 ║
// ╚══════════════════════════════════════════════════════════════╝

import { COLORS } from '../constants.js';
import { makeInputOverlay } from '../dialogFactory.js';
import { showToast } from '../state.js';

// ── Dialog pro výběr tečny ──
/**
 * @param {import('../types.js').TangentLine[]} tangentLines
 * @param {function(number[]): void} callback  indexy vybraných tečen
 */
export function showTangentChoiceDialog(tangentLines, callback) {
  if (tangentLines.length === 0) { showToast("Tečna neexistuje"); return; }
  if (tangentLines.length === 1) { callback([0]); return; }

  const btns = tangentLines.map((_, i) =>
    `<button class="btn-ok tangent-choice" data-idx="${i}" style="width:100%">Tečna ${i + 1}</button>`
  ).join("");
  const overlay = makeInputOverlay(`
    <div class="input-dialog">
      <h3>Tečny – výběr</h3>
      <label>Nalezeno ${tangentLines.length} tečen. Vyberte:</label>
      <div class="btn-row" style="flex-direction:column;gap:6px">
        ${btns}
        <button class="btn-ok tangent-all" style="width:100%;background:${COLORS.dimension};color:${COLORS.bgDark}">✓ Vytvořit všechny</button>
      </div>
      <div class="btn-row">
        <button class="btn-cancel btn-cancel-overlay">Zrušit</button>
      </div>
    </div>`);

  overlay.querySelectorAll(".tangent-choice").forEach(btn => {
    btn.addEventListener("click", () => {
      overlay.remove();
      callback([parseInt(btn.dataset.idx)]);
    });
  });
  overlay.querySelector(".tangent-all").addEventListener("click", () => {
    overlay.remove();
    callback(tangentLines.map((_, i) => i));
  });

  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") overlay.remove();
  });
  overlay.setAttribute("tabindex", "-1");
  overlay.focus();
}

// ── Dialog pro výběr tečné pozice kružnice ──
export function showTangentPositionDialog(positions, circle, callback) {
  if (positions.length === 0) { showToast("Žádná tečná pozice"); return; }
  if (positions.length === 1) { callback(0); return; }

  // Seřadit podle vzdálenosti od aktuální pozice kružnice
  const sorted = positions.map((p, i) => ({
    idx: i,
    dist: Math.hypot(p.cx - circle.cx, p.cy - circle.cy)
  })).sort((a, b) => a.dist - b.dist);

  const btns = sorted.map((s, i) => {
    const p = positions[s.idx];
    const label = i === 0 ? "Nejbližší pozice" : `Pozice ${i + 1}`;
    const rInfo = p.r !== undefined ? ` r=${p.r.toFixed(2)}` : '';
    return `<button class="btn-ok tangent-pos" data-idx="${s.idx}" style="width:100%">${label} (${p.cx.toFixed(1)}, ${p.cy.toFixed(1)}${rInfo})</button>`;
  }).join("");
  const overlay = makeInputOverlay(`
    <div class="input-dialog">
      <h3>Tečné napojení – pozice</h3>
      <label>Vyberte pozici kružnice:</label>
      <div class="btn-row" style="flex-direction:column;gap:6px">
        ${btns}
      </div>
      <div class="btn-row">
        <button class="btn-cancel btn-cancel-overlay">Zrušit</button>
      </div>
    </div>`);

  overlay.querySelectorAll(".tangent-pos").forEach(btn => {
    btn.addEventListener("click", () => {
      overlay.remove();
      callback(parseInt(btn.dataset.idx));
    });
  });

  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") overlay.remove();
  });
  overlay.setAttribute("tabindex", "-1");
  overlay.focus();
}
