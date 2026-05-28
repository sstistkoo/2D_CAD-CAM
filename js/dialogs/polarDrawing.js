// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Dialogy / Polární kreslení z bodu                ║
// ╚══════════════════════════════════════════════════════════════╝

import { COLORS } from '../constants.js';
import { makeInputOverlay } from '../dialogFactory.js';
import { state, showToast, axisLabels } from '../state.js';
import { addObject } from '../objects.js';
import { screenToWorld, snapPt, drawCanvas } from '../canvas.js';
import { safeEvalMath } from '../utils.js';

// ── Polární kreslení z referenčního bodu ──
document
  .getElementById("btnPolar")
  .addEventListener("click", showPolarDrawingDialog);

/** Otevře dialog pro polární kreslení (délka + úhel). */
export function showPolarDrawingDialog() {
  let refX = 0,
    refZ = 0;
  // V INC režimu použít incReference jako výchozí referenční bod
  if (state.coordMode === 'inc') {
    refX = state.incReference.x;
    refZ = state.incReference.y;
  }
  if (state.selected !== null) {
    const sel = state.objects[state.selected];
    if (sel.type === "point") {
      refX = sel.x;
      refZ = sel.y;
    } else if (sel.type === "line" || sel.type === "constr") {
      refX = sel.x2;
      refZ = sel.y2;
    } else if (sel.type === "circle" || sel.type === "arc") {
      refX = sel.cx;
      refZ = sel.cy;
    }
  }

  const overlay = makeInputOverlay(`
    <div class="input-dialog" style="min-width:460px">
      <h3>📐 Polární kreslení z bodu</h3>
      <p style="font-size:12px;color:${COLORS.textMuted};margin-bottom:10px">
        Zadejte referenční bod a pak přidávejte segmenty pomocí délky a úhlu.<br>
        Vhodné pro překreslování z výkresů se zadanými hodnotami.
      </p>
      <label>Referenční bod:</label>
      <div class="input-row">
        <div><label>${axisLabels()[0]}:</label><input type="text" id="polRefX" value="${refX}"></div>
        <div><label>${axisLabels()[1]}:</label><input type="text" id="polRefZ" value="${refZ}"></div>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">
        <button class="btn-ok" id="polMarkRef" style="font-size:11px;padding:3px 8px">📍 Označit ref. bod</button>
        <button class="btn-ok" id="polFromSelected" style="font-size:11px;padding:3px 8px;background:${COLORS.dimension};border-color:${COLORS.dimension}">📌 Z vybraného objektu</button>
        <button class="btn-ok" id="polPickFromMap" style="font-size:11px;padding:3px 8px;background:${COLORS.selected};border-color:${COLORS.selected};color:${COLORS.bgDark}">🎯 Kliknout z výkresu</button>
      </div>
      <hr style="border-color:${COLORS.surfaceHover};margin:8px 0">
      <label>Segment (polární souřadnice od ref. bodu):</label>
      <div class="input-row">
        <div><label>Délka:</label><input type="text" id="polLen" value="10"></div>
        <div><label>Úhel (°):</label><input type="text" id="polAng" value="0"></div>
      </div>
      <div class="input-row">
        <div><label>Typ:</label>
          <select id="polType" style="width:100%">
            <option value="line" selected>Úsečka</option>
            <option value="constr">Konstrukční čára</option>
            <option value="point">Bod (na konci)</option>
          </select>
        </div>
        <div style="display:flex;align-items:end">
          <label style="font-size:11px;display:flex;align-items:center;gap:4px;cursor:pointer;white-space:nowrap">
            <input type="checkbox" id="polChain" checked> Řetězit (konec → nový ref.)
          </label>
        </div>
      </div>
      <div id="polHistory" style="max-height:120px;overflow-y:auto;font-size:11px;font-family:Consolas;color:${COLORS.label};margin:8px 0;padding:4px;background:${COLORS.bgDarker};border-radius:4px;display:none"></div>
      <div class="btn-row">
        <button class="btn-cancel" id="polClose">Zavřít</button>
        <button class="btn-ok" id="polAdd">➕ Přidat segment</button>
      </div>
    </div>`);

  const polRefX = overlay.querySelector("#polRefX");
  const polRefZ = overlay.querySelector("#polRefZ");
  const polLen = overlay.querySelector("#polLen");
  const polAng = overlay.querySelector("#polAng");
  const polType = overlay.querySelector("#polType");
  const polChain = overlay.querySelector("#polChain");
  const polHistory = overlay.querySelector("#polHistory");
  let segCount = 0;

  overlay.querySelector("#polMarkRef").addEventListener("click", () => {
    const rx = safeEvalMath(polRefX.value);
    const rz = safeEvalMath(polRefZ.value);
    if (isNaN(rx) || isNaN(rz)) return;
    addObject({
      type: "point",
      x: rx,
      y: rz,
      name: `Ref ${state.nextId}`,
    });
    showToast(`Referenční bod ${axisLabels()[0]}${rx} ${axisLabels()[1]}${rz} vytvořen`);
  });

  overlay
    .querySelector("#polFromSelected")
    .addEventListener("click", () => {
      if (state.selected === null) {
        showToast("Žádný vybraný objekt");
        return;
      }
      const sel = state.objects[state.selected];
      if (sel.type === "point") {
        polRefX.value = sel.x;
        polRefZ.value = sel.y;
      } else if (sel.type === "line" || sel.type === "constr") {
        polRefX.value = sel.x2;
        polRefZ.value = sel.y2;
      } else if (sel.type === "circle" || sel.type === "arc") {
        polRefX.value = sel.cx;
        polRefZ.value = sel.cy;
      } else if (sel.type === "rect") {
        polRefX.value = sel.x1;
        polRefZ.value = sel.y1;
      }
      showToast("Ref. bod načten z vybraného objektu");
    });

  // Pick referenčního bodu kliknutím na výkres
  let _polPickCleanup = null;
  overlay.querySelector("#polPickFromMap").addEventListener("click", () => {
    overlay.style.display = "none";
    showToast("Klikněte na výkres pro výběr ref. bodu...");

    function cleanup() {
      drawCanvas.removeEventListener("click", onPick);
      drawCanvas.removeEventListener("touchend", onTouch);
      _polPickCleanup = null;
    }

    function onPick(e) {
      const rect = drawCanvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      let [wx, wy] = screenToWorld(sx, sy);
      if (state.snapToPoints) [wx, wy] = snapPt(wx, wy);
      cleanup();
      polRefX.value = parseFloat(wx.toFixed(3));
      polRefZ.value = parseFloat(wy.toFixed(3));
      overlay.style.display = "flex";
      showToast(`Ref. bod nastaven: ${axisLabels()[0]}${polRefX.value} ${axisLabels()[1]}${polRefZ.value}`);
    }

    function onTouch(e) {
      if (e.changedTouches.length === 1) {
        const t = e.changedTouches[0];
        const rect = drawCanvas.getBoundingClientRect();
        const sx = t.clientX - rect.left;
        const sy = t.clientY - rect.top;
        let [wx, wy] = screenToWorld(sx, sy);
        if (state.snapToPoints) [wx, wy] = snapPt(wx, wy);
        cleanup();
        polRefX.value = parseFloat(wx.toFixed(3));
        polRefZ.value = parseFloat(wy.toFixed(3));
        overlay.style.display = "flex";
        e.preventDefault();
        showToast(`Ref. bod nastaven: ${axisLabels()[0]}${polRefX.value} ${axisLabels()[1]}${polRefZ.value}`);
      }
    }

    drawCanvas.addEventListener("click", onPick);
    drawCanvas.addEventListener("touchend", onTouch);
    _polPickCleanup = cleanup;
  });

  overlay.querySelector("#polAdd").addEventListener("click", () => {
    const rx = safeEvalMath(polRefX.value);
    const rz = safeEvalMath(polRefZ.value);
    const len = safeEvalMath(polLen.value);
    const angDeg = safeEvalMath(polAng.value);
    if (
      isNaN(rx) ||
      isNaN(rz) ||
      isNaN(len) ||
      isNaN(angDeg) ||
      len <= 0
    ) {
      showToast("Zkontrolujte hodnoty (délka musí být > 0)");
      return;
    }

    // Úhel s offsetem od natočeného nulového bodu
    const angleOffset = (state.nullPointActive && state.nullPointAngle !== 0)
      ? (state.nullPointAngle * Math.PI / 180) : 0;
    const rad = (angDeg * Math.PI) / 180 + angleOffset;
    const endX = rx + len * Math.cos(rad);
    const endZ = rz + len * Math.sin(rad);
    const typ = polType.value;

    if (typ === "point") {
      addObject({
        type: "point",
        x: endX,
        y: endZ,
        name: `Bod ${state.nextId}`,
      });
    } else {
      addObject({
        type: typ === "constr" ? "constr" : "line",
        x1: rx,
        y1: rz,
        x2: endX,
        y2: endZ,
        name: `${typ === "constr" ? "Konstr" : "Úsečka"} ${state.nextId}`,
        dashed: typ === "constr",
      });
    }

    segCount++;
    polHistory.style.display = "";
    polHistory.innerHTML += `<div>#${segCount}: ${axisLabels()[0]}${rx.toFixed(2)} ${axisLabels()[1]}${rz.toFixed(2)} → d=${len} ∠${angDeg}° → ${axisLabels()[0]}${endX.toFixed(2)} ${axisLabels()[1]}${endZ.toFixed(2)}</div>`;
    polHistory.scrollTop = polHistory.scrollHeight;

    if (polChain.checked) {
      polRefX.value = endX.toFixed(3);
      polRefZ.value = endZ.toFixed(3);
    }

    polLen.focus();
    polLen.select();
    showToast(`Segment #${segCount} přidán`);
  });

  overlay
    .querySelector("#polClose")
    .addEventListener("click", () => { if (_polPickCleanup) _polPickCleanup(); overlay.remove(); });

  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName === "INPUT")
      overlay.querySelector("#polAdd").click();
    if (e.key === "Escape") { if (_polPickCleanup) _polPickCleanup(); overlay.remove(); }
  });

  polLen.focus();
}
