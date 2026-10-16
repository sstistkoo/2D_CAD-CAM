// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Trigonometrie: pravý trojúhelník (📐)               ║
// ╚══════════════════════════════════════════════════════════════╝

// Vyňato z js/ui.js beze změny (16. 10. 2026, docs/plan-refaktoringu-ui.md,
// Fáze 1c). Listener #btnOpenTrig věší dál js/ui.js (spolu se záložkou
// Obecný přes bridge.extendTrigCalc z calculators/trigGeneral.js). Kód
// aplikace importuje jen z js/ui.js, nikdy z js/ui/* napřímo.

import { COLORS } from '../constants.js';
import { showToast } from '../state.js';
import { solveRightTriangle } from '../trigSolver.js';
import { safeEvalMath } from '../utils.js';
import { makeOverlay, onOverlayRemoved } from '../dialogFactory.js';
import { getCalcClipboardValue, getCalcLastResult, openCalculator } from './calculator.js';

// ── Trigonometrie – popup ──
/** Otevře Trigonometrii – pravý trojúhelník (2 zadané hodnoty → zbytek). */
export function openTrigCalc() {
  const bodyHTML = `
        <div class="trig-svg-wrap">
          <svg viewBox="0 0 300 220" xmlns="http://www.w3.org/2000/svg">
            <!-- Triangle -->
            <polygon points="40,190 260,190 260,40" fill="none" stroke="${COLORS.border}" stroke-width="2"/>
            <!-- Right angle marker -->
            <polyline points="240,190 240,170 260,170" fill="none" stroke="${COLORS.textMuted}" stroke-width="1.5"/>
            <!-- Side labels -->
            <text x="150" y="210" text-anchor="middle" fill="${COLORS.dimension}" font-size="16" font-weight="bold" font-family="Consolas">b</text>
            <text x="275" y="120" text-anchor="start" fill="${COLORS.delete}" font-size="16" font-weight="bold" font-family="Consolas">a</text>
            <text x="140" y="105" text-anchor="end" fill="${COLORS.primary}" font-size="16" font-weight="bold" font-family="Consolas">c</text>
            <!-- Angle arcs -->
            <path d="M 70,190 A 30,30 0 0,0 64.8,173.1" fill="none" stroke="${COLORS.delete}" stroke-width="1.5"/>
            <text x="78" y="178" fill="${COLORS.delete}" font-size="13" font-family="Consolas">α</text>
            <path d="M 260,65 A 25,25 0 0,1 239.3,54.1" fill="none" stroke="${COLORS.dimension}" stroke-width="1.5"/>
            <text x="244" y="75" fill="${COLORS.dimension}" font-size="13" font-family="Consolas">β</text>
            <text x="248" y="195" fill="${COLORS.primary}" font-size="12" font-family="Consolas">90°</text>
          </svg>
        </div>
        <div class="trig-fields">
          <div class="trig-col">
            <h4>Strany</h4>
            <div class="trig-field">
              <label class="label-a">a</label>
              <input type="text" id="trigA" inputmode="decimal" enterkeyhint="next" autocomplete="off" placeholder="protilehlá">
              <span class="trig-unit">mm</span>
            </div>
            <div class="trig-field">
              <label class="label-b">b</label>
              <input type="text" id="trigB" inputmode="decimal" enterkeyhint="next" autocomplete="off" placeholder="přilehlá">
              <span class="trig-unit">mm</span>
            </div>
            <div class="trig-field">
              <label class="label-c">c</label>
              <input type="text" id="trigC" inputmode="decimal" enterkeyhint="next" autocomplete="off" placeholder="přepona">
              <span class="trig-unit">mm</span>
            </div>
          </div>
          <div class="trig-col">
            <h4>Úhly</h4>
            <div class="trig-field">
              <label class="label-alpha">α</label>
              <input type="text" id="trigAlpha" inputmode="decimal" enterkeyhint="next" autocomplete="off" placeholder="úhel u a">
              <span class="trig-unit">°</span>
            </div>
            <div class="trig-field">
              <label class="label-beta">β</label>
              <input type="text" id="trigBeta" inputmode="decimal" enterkeyhint="next" autocomplete="off" placeholder="úhel u b">
              <span class="trig-unit">°</span>
            </div>
            <div class="trig-field">
              <label class="label-gamma">γ</label>
              <input type="text" id="trigGamma" value="90" disabled>
              <span class="trig-unit">° ✓</span>
            </div>
          </div>
        </div>
        <div class="trig-actions">
          <button class="trig-btn-solve">✅ Vypočítat</button>
          <button class="trig-btn-clear">🗑 Vymazat</button>
          <button class="trig-btn-copy">📋 Kopírovat</button>
        </div>
        <div class="trig-actions trig-actions-2">
          <button class="trig-btn-calc" title="Otevřít kalkulačku">🔢 Kalkulačka</button>
          <button class="trig-btn-paste" title="Vložit poslední výsledek kalkulačky do vybraného pole">⤓ Vložit výsledek</button>
          <button class="trig-btn-kbd" title="Přepnout klávesnici (čísla / písmena pro funkce sqrt, sin…)">⌨ abc</button>
        </div>
        <div class="trig-info"><span class="trig-status">Zadejte 2 hodnoty – výpočet proběhne automaticky</span><br><small>Funkce: sin, cos, tan, sqrt, abs, log · Příklad: sqrt(2)*50, atan(1)</small></div>
        <div class="trig-history" id="trigHistory"></div>`;
  const overlay = makeOverlay("trig", "📐 Trigonometrie – pravý trojúhelník", bodyHTML, "trig-window");
  if (!overlay) return;

  const inpA = overlay.querySelector("#trigA");
  const inpB = overlay.querySelector("#trigB");
  const inpC = overlay.querySelector("#trigC");
  const inpAlpha = overlay.querySelector("#trigAlpha");
  const inpBeta  = overlay.querySelector("#trigBeta");
  const inputs = [inpA, inpB, inpC, inpAlpha, inpBeta];
  const deg = Math.PI / 180;

  const statusEl = overlay.querySelector(".trig-status");
  const STATUS_DEFAULT = statusEl.textContent;
  function setStatus(msg, isError) {
    statusEl.textContent = msg || STATUS_DEFAULT;
    statusEl.classList.toggle("trig-status-error", !!isError);
  }

  function val(inp) {
    const v = safeEvalMath(inp.value);
    return (isFinite(v) && v > 0) ? v : null;
  }

  function setComputed(inp, v) {
    inp.value = parseFloat(v.toFixed(4));
    inp.classList.add("computed");
  }

  // Výpočet bere jen hodnoty ZADANÉ uživatelem; dopočtená pole (.computed)
  // se před každým výpočtem vyprázdní – jinak by se po změně jedné strany
  // míchaly staré dopočty s novým zadáním.
  // auto = volání při psaní → nedokončený výraz („sqrt(") nehlásí jako chybu.
  function solve(auto = false) {
    const keys = ["a", "b", "c", "alpha", "beta"];
    const known = {};
    for (let i = 0; i < inputs.length; i++) {
      const inp = inputs[i];
      if (inp.classList.contains("computed")) { inp.value = ""; inp.classList.remove("computed"); }
      const raw = inp.value.trim();
      if (raw === "") { known[keys[i]] = null; continue; }
      const v = safeEvalMath(raw);
      if (!isFinite(v)) {
        if (auto) { setStatus(); return false; }
        setStatus("Neplatný výraz v poli " + ["a", "b", "c", "α", "β"][i], true);
        return false;
      }
      known[keys[i]] = v;
    }
    const filled = Object.values(known).filter(v => v !== null).length;
    if (filled === 0) { setStatus(); return false; }
    const r = solveRightTriangle(known);
    if (!r.ok) { setStatus(r.error, filled >= 2 || !auto); return false; }
    for (let i = 0; i < inputs.length; i++) {
      if (known[keys[i]] === null) setComputed(inputs[i], r[keys[i]]);
    }
    setStatus("✓ Vypočteno");
    return true;
  }

  // Automatický výpočet při psaní (s krátkou prodlevou)
  let _autoTimer = null;
  let _lastTrigInput = null;
  for (const inp of inputs) {
    inp.addEventListener("focus", () => { _lastTrigInput = inp; });
    inp.addEventListener("input", () => {
      inp.classList.remove("computed"); // přepsané pole je teď zadání
      clearTimeout(_autoTimer);
      _autoTimer = setTimeout(() => solve(true), 400);
    });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); clearTimeout(_autoTimer); solve(); }
    });
  }
  onOverlayRemoved(overlay, () => clearTimeout(_autoTimer));

  overlay.querySelector(".trig-btn-solve").addEventListener("click", () => { clearTimeout(_autoTimer); solve(); });

  // Otevřít kalkulačku (na mobilu přes celou obrazovku; její ⤓ vloží
  // výsledek rovnou do naposledy vybraného pole a zavře se)
  overlay.querySelector(".trig-btn-calc").addEventListener("click", () => openCalculator());

  // Vložit poslední výsledek kalkulačky do vybraného (nebo prvního prázdného) pole
  const pasteBtn = overlay.querySelector(".trig-btn-paste");
  pasteBtn.addEventListener("mousedown", (e) => e.preventDefault()); // nebrat fokus poli
  pasteBtn.addEventListener("click", () => {
    const v = getCalcLastResult() ?? getCalcClipboardValue();
    if (v === null || v === undefined || v === "") { showToast("Kalkulačka zatím nemá výsledek"); return; }
    const target = (_lastTrigInput && inputs.includes(_lastTrigInput))
      ? _lastTrigInput
      : inputs.find(i => i.value.trim() === "" || i.classList.contains("computed"));
    if (!target) { showToast("Vyberte pole, kam vložit"); return; }
    target.value = String(v);
    target.dispatchEvent(new Event("input", { bubbles: true }));
    showToast("Vloženo: " + v);
  });

  // Přepínač mobilní klávesnice: čísla (výchozí) ↔ písmena (pro výrazy sqrt(), sin()…)
  const kbdBtn = overlay.querySelector(".trig-btn-kbd");
  kbdBtn.addEventListener("mousedown", (e) => e.preventDefault());
  kbdBtn.addEventListener("click", () => {
    const toText = inpA.inputMode !== "text";
    for (const inp of [inpA, inpB, inpC, inpAlpha, inpBeta]) inp.inputMode = toText ? "text" : "decimal";
    kbdBtn.textContent = toText ? "⌨ 123" : "⌨ abc";
    const act = document.activeElement;
    if (act && [inpA, inpB, inpC, inpAlpha, inpBeta].includes(act)) { act.blur(); act.focus(); }
  });

  const trigHistoryEl = overlay.querySelector("#trigHistory");
  const trigHistory = [];

  function addTrigHistory() {
    const a = val(inpA), b = val(inpB), c = val(inpC);
    const alpha = val(inpAlpha), beta = val(inpBeta);
    if (!a || !b || !c || !alpha || !beta) return;
    const entry = `a=${inpA.value}  b=${inpB.value}  c=${inpC.value}  α=${inpAlpha.value}°  β=${inpBeta.value}°  γ=90°`;
    if (trigHistory[0] === entry) return; // Kopírovat + Vymazat → jen jeden záznam
    trigHistory.unshift(entry);
    if (trigHistory.length > 10) trigHistory.pop();
    trigHistoryEl.innerHTML = "";
    for (const item of trigHistory) {
      const row = document.createElement("div");
      row.className = "calc-history-item";
      row.textContent = item;
      row.addEventListener("click", () => {
        navigator.clipboard.writeText(item).then(() => showToast("Zkopírováno"), () => showToast("Kopírování se nepovedlo"));
      });
      trigHistoryEl.appendChild(row);
    }
  }

  overlay.querySelector(".trig-btn-clear").addEventListener("click", () => {
    // Save current result to history before clearing
    addTrigHistory();
    clearTimeout(_autoTimer);
    inputs.forEach(i => { i.value = ""; i.classList.remove("computed"); });
    setStatus();
  });

  overlay.querySelector(".trig-btn-copy").addEventListener("click", () => {
    const parts = [];
    if (val(inpA)) parts.push("a=" + inpA.value);
    if (val(inpB)) parts.push("b=" + inpB.value);
    if (val(inpC)) parts.push("c=" + inpC.value);
    if (val(inpAlpha)) parts.push("α=" + inpAlpha.value + "°");
    if (val(inpBeta)) parts.push("β=" + inpBeta.value + "°");
    parts.push("γ=90°");
    const text = parts.join("  ");
    navigator.clipboard.writeText(text).then(() => showToast("Zkopírováno"), () => showToast("Kopírování se nepovedlo"));
    addTrigHistory();
  });
}
