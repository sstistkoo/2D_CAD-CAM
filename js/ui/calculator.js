// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Kalkulačka 🔢 a její schránka 📋                    ║
// ╚══════════════════════════════════════════════════════════════╝

// Vyňato z js/ui.js beze změny (16. 10. 2026, docs/plan-refaktoringu-ui.md,
// Fáze 1d). Kód, který v ui.js běžel při načtení (tlačítka 🔢/📋, sledování
// posledního pole, observer), je v initCalcButtons() — volá ji js/ui.js na
// původním místě, aby se nezměnilo pořadí listenerů. Kód aplikace importuje
// jen z js/ui.js (openCalculator, get/setCalcClipboardValue), nikdy odsud.

import { showToast } from '../state.js';
import { _parseMathExpr } from '../utils.js';
import { makeOverlay } from '../dialogFactory.js';
import { getMeta, setMeta } from '../idb.js';

// ── Kalkulačka – clipboard schránka ──
let _calcClipboardValue = null;
// Poslední výsledek kalkulačky („=" / funkce) – přežije zavření okna,
// používá ho ANS a tlačítko „Vložit výsledek" v Trigonometrii.
let _calcLastResult = null;
export function getCalcClipboardValue() { return _calcClipboardValue; }
export function setCalcClipboardValue(v) {
  _calcClipboardValue = v;
  const btn = document.getElementById("canvasClipBtn");
  if (btn) {
    btn.textContent = v != null ? v : "—";
    btn.title = v != null ? `Schránka: ${v} (klik = vložit)` : "Schránka kalkulačky (prázdná)";
    // Skrýt tlažítko, dokud není nic zkopírováno (prázdný řetězec nebo null).
    // display:"" nechá platit CSS (mobil → flex, desktop → none).
    const empty = v == null || v === "";
    btn.style.display = empty ? "none" : "";
  }
}

// ── Kalkulačka – popup ──
/** Otevře vestavnou kalkulačku. */
export function openCalculator() {
  const bodyHTML = `
        <div class="calc-hist-header">
          <button class="calc-hist-clear-btn" title="Vymazat historii">🗑</button>
          <span class="calc-hist-title">Historie</span>
          <button class="calc-close-inner-btn" title="Zavřít">✕</button>
        </div>
        <div class="calc-history" id="calcHistory"></div>
        <div class="calc-expr" id="calcExpr">&nbsp;</div>
        <input type="text" id="calcDisplay" placeholder="0">
        <div class="calc-buttons">
          <div class="calc-fn-row">
            <button class="calc-btn calc-fn" data-val="sqrt">√</button>
            <button class="calc-btn calc-fn" data-val="pi">π</button>
            <button class="calc-btn calc-fn" data-val="pow">x²</button>
            <button class="calc-btn calc-fn" data-val="%">%</button>
          </div>
          <div class="calc-fn-row">
            <button class="calc-btn calc-fn" data-val="(">(</button>
            <button class="calc-btn calc-fn" data-val=")">)</button>
            <button class="calc-btn calc-fn" data-val="ans">ANS</button>
            <div class="calc-trig-wrap">
              <button class="calc-btn calc-fn calc-trig-toggle" data-val="_trig">f(x) ▾</button>
              <div class="calc-trig-dropdown" id="calcTrigDropdown">
                <button class="calc-btn calc-fn" data-val="sin">sin</button>
                <button class="calc-btn calc-fn" data-val="cos">cos</button>
                <button class="calc-btn calc-fn" data-val="tan">tan</button>
                <button class="calc-btn calc-fn" data-val="asin">asin</button>
                <button class="calc-btn calc-fn" data-val="acos">acos</button>
                <button class="calc-btn calc-fn" data-val="atan">atan</button>
              </div>
            </div>
          </div>
          <div class="calc-fn-row calc-fn-row-3">
            <button class="calc-btn calc-clear" data-val="C">C</button>
            <button class="calc-btn calc-clear" data-val="CE">←</button>
            <button class="calc-btn calc-copy" data-val="copy">📋</button>
            <button class="calc-btn calc-paste" data-val="paste" title="Vložit výsledek na pozici kurzoru">⤓</button>
          </div>
          <div class="calc-num-grid">
            <button class="calc-btn" data-val="7">7</button>
            <button class="calc-btn" data-val="8">8</button>
            <button class="calc-btn" data-val="9">9</button>
            <button class="calc-btn calc-op" data-val="/">÷</button>
            <button class="calc-btn" data-val="4">4</button>
            <button class="calc-btn" data-val="5">5</button>
            <button class="calc-btn" data-val="6">6</button>
            <button class="calc-btn calc-op" data-val="*">×</button>
            <button class="calc-btn" data-val="1">1</button>
            <button class="calc-btn" data-val="2">2</button>
            <button class="calc-btn" data-val="3">3</button>
            <button class="calc-btn calc-op" data-val="-">−</button>
            <button class="calc-btn" data-val=".">.</button>
            <button class="calc-btn" data-val="0">0</button>
            <button class="calc-btn calc-eq" data-val="=">=</button>
            <button class="calc-btn calc-op" data-val="+">+</button>
          </div>
        </div>`;
  const overlay = makeOverlay("calc", "🔢 Kalkulačka", bodyHTML, "calc-window");
  if (!overlay) return;

  // Make calculator non-blocking: no fullscreen backdrop, draggable, stays above other dialogs
  overlay.classList.add("calc-overlay-float");

  // Hide default titlebar – we use compact history header instead
  const defaultTitlebar = overlay.querySelector(".calc-titlebar");
  defaultTitlebar.style.display = "none";

  // Wire close & clear history buttons in the compact header
  const calcWin = overlay.querySelector(".calc-window");
  calcWin.classList.add("calc-basic-window");
  overlay.querySelector(".calc-close-inner-btn").addEventListener("click", () => overlay.remove());
  overlay.querySelector(".calc-hist-clear-btn").addEventListener("click", () => {
    history = [];
    saveHistory();
    renderHistory();
    showToast("Historie vymazána");
  });

  // ── Drag via history header ──
  const dragHandle = overlay.querySelector(".calc-hist-header");
  let _dragOfs = null;
  // Na mobilu (šířka ≤ 600 px, stejná hranice jako CSS) je okno pevně
  // ukotvené přes celou obrazovku – přetahovat nejde.
  const _calcFixedMq = window.matchMedia("(max-width: 600px)");
  const isCalcFixed = () => _calcFixedMq.matches;
  dragHandle.style.cursor = isCalcFixed() ? "" : "move";
  // Začátek tažení: zafixovat aktuální pozici a zrušit CSS translateX(-50%),
  // jinak okno při prvním pohybu poskočí o půl své šířky doleva.
  function startDrag(clientX, clientY) {
    if (isCalcFixed()) return;
    const rect = calcWin.getBoundingClientRect();
    calcWin.style.transform = "none";
    calcWin.style.left = rect.left + "px";
    calcWin.style.top = rect.top + "px";
    _dragOfs = { x: clientX - rect.left, y: clientY - rect.top };
  }
  // Posun okna – omezený na viditelnou plochu (hlavička musí zůstat dosažitelná)
  function moveDrag(clientX, clientY) {
    const w = calcWin.offsetWidth;
    const maxX = Math.max(0, window.innerWidth - w);
    const maxY = Math.max(0, window.innerHeight - 40);
    const x = Math.min(Math.max(0, clientX - _dragOfs.x), maxX);
    const y = Math.min(Math.max(0, clientY - _dragOfs.y), maxY);
    calcWin.style.left = x + "px";
    calcWin.style.top = y + "px";
  }
  dragHandle.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) return;
    startDrag(e.clientX, e.clientY);
    e.preventDefault();
  });
  const onMouseMove = (e) => {
    if (!_dragOfs) return;
    moveDrag(e.clientX, e.clientY);
  };
  const onMouseUp = () => { _dragOfs = null; };
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
  // Touch drag
  dragHandle.addEventListener("touchstart", (e) => {
    if (e.target.closest("button")) return;
    const t = e.touches[0];
    startDrag(t.clientX, t.clientY);
  }, { passive: true });
  const onTouchMove = (e) => {
    if (!_dragOfs) return;
    const t = e.touches[0];
    moveDrag(t.clientX, t.clientY);
  };
  const onTouchEnd = () => { _dragOfs = null; };
  document.addEventListener("touchmove", onTouchMove, { passive: true });
  document.addEventListener("touchend", onTouchEnd);
  // Cleanup drag listeners when calculator is removed
  // Klepnutí mimo rozbalovací f(x) ho zavře
  const onDocPointerDown = (e) => {
    if (e.target.closest(".calc-trig-wrap")) return;
    overlay.querySelector("#calcTrigDropdown")?.classList.remove("open");
  };
  document.addEventListener("pointerdown", onDocPointerDown, true);
  const dragCleanup = () => {
    document.removeEventListener("pointerdown", onDocPointerDown, true);
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.removeEventListener("touchmove", onTouchMove);
    document.removeEventListener("touchend", onTouchEnd);
  };
  const origRemove = overlay.remove.bind(overlay);
  overlay.remove = () => { dragCleanup(); origRemove(); };

  const display = overlay.querySelector("#calcDisplay");
  const exprDisplay = overlay.querySelector("#calcExpr");
  const historyEl = overlay.querySelector("#calcHistory");
  let expr = "";
  let lastAnswer = _calcLastResult ?? 0;
  let justEvaluated = false; // po „=" začne další číslice nový výpočet
  let history = [];
  getMeta('calcHistory').then(h => {
    // Okno se mohlo mezitím zavřít — do zavřeného už nic nevykreslovat.
    if (!overlay.isConnected) return;
    if (Array.isArray(h)) { history = h; renderHistory(); }
  });

  function updateDisplay(text) {
    display.value = text || "0";
    display.classList.remove("calc-display-error");
    fitDisplayFont();
    // Kurzor/pohled na konec – u dlouhých výrazů je vidět to, co se právě píše
    display.scrollLeft = display.scrollWidth;
  }
  function updateExprDisplay(text) { exprDisplay.textContent = text || "\u00a0"; }
  function showError(msg) {
    // Výraz zůstává v displeji (dá se opravit), chyba se ukáže v řádku nad ním
    updateExprDisplay("⚠ " + msg);
    display.classList.add("calc-display-error");
  }
  // Dlouhý obsah → menší písmo, ať se vejde celý (měří skutečnou šířku textu)
  const _measureCtx = document.createElement("canvas").getContext("2d");
  function fitDisplayFont() {
    display.style.fontSize = "";
    const cs = getComputedStyle(display);
    const base = parseFloat(cs.fontSize) || 28;
    const avail = display.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2;
    if (!_measureCtx || avail <= 0) return;
    _measureCtx.font = `${cs.fontWeight} ${base}px ${cs.fontFamily}`;
    const w = _measureCtx.measureText(display.value).width;
    if (w > avail) display.style.fontSize = Math.max(14, Math.floor(base * avail / w)) + "px";
  }
  // Zaokrouhlení výsledku: 12 platných číslic (odstraní šum 0.1+0.2 a nesmaže
  // malá čísla jako dříve toFixed(8)); -0 → 0.
  function roundResult(r) {
    const v = Math.abs(r) >= 1e12 ? r : parseFloat(r.toPrecision(12));
    return v === 0 ? 0 : v;
  }
  // Na dotykových zařízeních neotvírat systémovou klávesnici (zakryla by
  // kalkulačku); kurzor a označování v poli fungují dál.
  if (window.matchMedia?.("(pointer: coarse)").matches) display.setAttribute("inputmode", "none");

  function saveHistory() {
    setMeta('calcHistory', history);
  }

  function addHistory(expression, result) {
    history.push({ expr: expression, result });
    if (history.length > 50) history.shift();
    saveHistory();
    renderHistory();
  }

  function removeHistoryItem(index) {
    history.splice(index, 1);
    saveHistory();
    renderHistory();
  }

  function renderHistory() {
    historyEl.innerHTML = "";
    history.forEach((item, i) => {
      const row = document.createElement("div");
      row.className = "calc-history-item";
      const fullExpr = document.createElement("span");
      fullExpr.className = "calc-hist-full";
      fullExpr.textContent = item.expr + " = " + item.result;
      row.appendChild(fullExpr);
      const copyBtn = document.createElement("button");
      copyBtn.className = "calc-hist-copy";
      copyBtn.textContent = "📋";
      copyBtn.title = "Kopírovat výsledek";
      copyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const v = String(item.result);
        navigator.clipboard.writeText(v).then(() => showToast("Zkopírováno: " + v));
        setCalcClipboardValue(v);
      });
      row.appendChild(copyBtn);
      const delBtn = document.createElement("button");
      delBtn.className = "calc-hist-del";
      delBtn.textContent = "✕";
      delBtn.title = "Smazat";
      delBtn.addEventListener("click", (e) => { e.stopPropagation(); removeHistoryItem(i); });
      row.appendChild(delBtn);
      row.addEventListener("click", () => {
        expr = String(item.result);
        updateDisplay(expr);
        updateExprDisplay("← " + item.result);
        justEvaluated = true;
      });
      historyEl.appendChild(row);
    });
    // Auto-scroll dolů k nejnovějšímu
    historyEl.scrollTop = historyEl.scrollHeight;
  }

  // Načíst historii při otevření
  renderHistory();

  function formatExpr(e) {
    // „e-5" (vědecký zápis) nepřevádět na znak mínus
    return e.replace(/\*/g, "×").replace(/\//g, "÷").replace(/(?<![eE])-/g, "−");
  }

  // Poslední znak výrazu je konec čísla/závorky → hodnota za ním potřebuje „*"
  function endsWithValue(e) { return /[\d.)%π]$/.test(e); }

  // Vložit hodnotu (π, ANS) nebo „(" – s implicitním násobením,
  // aby „2" + „π" nedalo „23.14159…"
  function appendValue(v) {
    if (justEvaluated) { expr = ""; justEvaluated = false; }
    if (endsWithValue(expr)) expr += "*";
    expr += v;
    updateDisplay(expr);
  }

  function safeEval(expression) {
    let e = String(expression)
      .replace(/,/g, ".")
      .replace(/π/g, "(" + Math.PI + ")")
      .replace(/×/g, "*").replace(/−/g, "-").replace(/÷/g, "/");
    if (!e.trim() || !/^[\d+\-*/().eE\s%]*$/.test(e)) return null;
    // % = /100 (funguje i za závorkou: „(2+3)%")
    e = e.replace(/%/g, "/100");
    try {
      const r = _parseMathExpr(e);
      return (typeof r === "number" && isFinite(r)) ? r : null;
    } catch (_) { return null; }
  }

  function handleFn(fn) {
    const cur = safeEval(expr);
    if (cur === null) { if (expr) showError("Neplatný výraz"); return; }
    let r;
    const fnExpr = fn + "(" + formatExpr(expr) + ")";
    switch (fn) {
      case "sqrt": r = Math.sqrt(cur); break;
      case "sin":  r = Math.sin(cur * Math.PI / 180); break;
      case "cos":  r = Math.cos(cur * Math.PI / 180); break;
      case "tan":  r = Math.tan(cur * Math.PI / 180); break;
      case "atan": r = Math.atan(cur) * 180 / Math.PI; break;
      case "asin": r = (cur >= -1 && cur <= 1) ? Math.asin(cur) * 180 / Math.PI : NaN; break;
      case "acos": r = (cur >= -1 && cur <= 1) ? Math.acos(cur) * 180 / Math.PI : NaN; break;
      case "pow":  r = cur * cur; break;
      default: return;
    }
    if (typeof r !== "number" || !isFinite(r)) { showError("Mimo definiční obor"); return; }
    const result = roundResult(r);
    addHistory(fnExpr, result);
    lastAnswer = _calcLastResult = result;
    expr = String(result);
    updateDisplay(expr);
    updateExprDisplay(fnExpr + " = " + result);
    justEvaluated = true;
  }

  function doEval() {
    if (!expr.trim()) return;
    const displayExpr = formatExpr(expr);
    const r = safeEval(expr);
    if (r === null) { showError("Chyba ve výrazu"); return; }
    const result = roundResult(r);
    addHistory(displayExpr, result);
    lastAnswer = _calcLastResult = result;
    expr = String(result);
    updateDisplay(expr);
    // Zobrazit celý zápis: výraz = výsledek
    updateExprDisplay(displayExpr + " = " + result);
    justEvaluated = true;
  }

  overlay.querySelectorAll(".calc-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const val = btn.dataset.val;
      switch (val) {
        case "C":    expr = ""; justEvaluated = false; updateDisplay("0"); updateExprDisplay(""); break;
        case "CE":   expr = expr.slice(0, -1); justEvaluated = false; updateDisplay(expr); break;
        case "=":    doEval(); break;
        case "copy": {
          const v = display.value;
          navigator.clipboard.writeText(v).then(() => showToast("Zkopírováno: " + v));
          setCalcClipboardValue(v);
          break;
        }
        case "paste": {
          const v = display.value;
          if (v === null || v === undefined || v === "") { showToast("Není co vložit"); break; }
          const target = _lastFocusedInput;
          if (target && document.body.contains(target) && !target.disabled && !target.readOnly
              && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
              && !overlay.contains(target)) {
            const start = target.selectionStart || 0;
            const end = target.selectionEnd || 0;
            const before = target.value.substring(0, start);
            const after = target.value.substring(end);
            target.value = before + v + after;
            target.selectionStart = target.selectionEnd = start + String(v).length;
            target.dispatchEvent(new Event("input", { bubbles: true }));
            target.focus();
            showToast("Vloženo: " + v);
            overlay.remove();
          } else {
            setCalcClipboardValue(v);
            navigator.clipboard.writeText(v).then(() => showToast("Zkopírováno do schránky: " + v));
          }
          break;
        }
        case "_trig": {
          const dd = overlay.querySelector("#calcTrigDropdown");
          dd.classList.toggle("open");
          break;
        }
        case "pi":    appendValue("π"); break;
        // Záporné ANS do závorky, ať za mínusem nevznikne „5--3"
        case "ans":   appendValue(lastAnswer < 0 ? "(" + lastAnswer + ")" : String(lastAnswer)); break;
        case "(":     appendValue("("); break;
        case "%":
          if (endsWithValue(expr) && !expr.endsWith("%")) { expr += "%"; justEvaluated = false; updateDisplay(expr); }
          break;
        case "+": case "-": case "*": case "/": {
          justEvaluated = false; // operátor pokračuje s výsledkem
          const last = expr.slice(-1);
          if ("+-*/".includes(last) && last !== "") {
            // Dva operátory za sebou → nahradit; výjimka „*-" / „/-" (záporné číslo)
            if (val === "-" && (last === "*" || last === "/")) expr += val;
            else expr = expr.replace(/[+\-*/]+$/, "") + val;
          } else if (expr === "" && val !== "-") {
            expr = String(lastAnswer) + val; // operátor na prázdném displeji → navázat na ANS
          } else {
            expr += val;
          }
          updateDisplay(expr);
          break;
        }
        case "sqrt": case "sin": case "cos": case "tan": case "atan": case "asin": case "acos": case "pow":
          handleFn(val);
          // Close trig dropdown after selecting function
          { const dd = overlay.querySelector("#calcTrigDropdown"); if (dd) dd.classList.remove("open"); }
          break;
        default: {
          // Číslice / tečka / „)" – po „=" číslice začíná nový výpočet
          if (justEvaluated && /[\d.]/.test(val)) expr = "";
          justEvaluated = false;
          if (/[\d.]/.test(val) && /[)%π]$/.test(expr)) expr += "*";
          if (val === ".") {
            const lastNum = expr.match(/[\d.]*$/)[0];
            if (lastNum.includes(".")) break; // druhá tečka v čísle
            if (lastNum === "") expr += "0";
          }
          expr += val;
          updateDisplay(expr);
        }
      }
    });
  });

  // Keyboard input
  display.removeAttribute("readonly");
  display.addEventListener("input", () => {
    expr = display.value.replace(/,/g, ".");
    justEvaluated = false;
    display.classList.remove("calc-display-error");
    fitDisplayFont();
  });
  display.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); doEval(); }
    if (e.key === "Escape") { expr = ""; justEvaluated = false; updateDisplay("0"); updateExprDisplay(""); }
    e.stopPropagation();
  });
}

// Poslední výsledek pro „Vložit výsledek" v Trigonometrii (js/ui/trigCalc.js).
export function getCalcLastResult() { return _calcLastResult; }

// Track last focused input so clipboard/calc paste can target it
let _lastFocusedInput = null;

/** Tlačítka kalkulačky a schránky na plátně + sledování posledního pole (při načtení). */
export function initCalcButtons() {
  document.getElementById("btnOpenCalc").addEventListener("click", openCalculator);
  const calcBtn = document.getElementById("canvasCalcBtn");
  calcBtn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  calcBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openCalculator();
  });
  // Tlačítko kalkulačky má být vidět jen na CAD plátně – schovat ho,
  // kdykoli je otevřené jakékoli BLOKUJÍCÍ overlay okno (jinak prosakuje
  // přes něj), nebo kalkulačka sama (druhé kliknutí by stejně jen narazilo
  // na pojistku proti duplicitě v makeOverlay()). Ostatní plovoucí okna
  // (`.calc-overlay-float`, např. VK/Číselné zadání) nechávají plátno pod
  // sebou klikatelné, takže se s nimi dá kreslit i počítat zároveň –
  // tlačítko tam zůstává použitelné.
  function updateCalcBtnVisibility() {
    const overlayOpen = document.querySelector(
      '.calc-overlay:not(.calc-overlay-float), .calc-overlay[data-type="calc"], .input-overlay'
    );
    calcBtn.style.display = overlayOpen ? "none" : "";
  }
  updateCalcBtnVisibility();
  if (typeof MutationObserver !== "undefined") {
    new MutationObserver(updateCalcBtnVisibility).observe(document.body, { childList: true });
  }
  document.addEventListener('focusin', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') && !e.target.disabled && !e.target.readOnly) {
      // Don't track calculator's own display as a paste target
      if (!e.target.closest('.calc-overlay[data-type="calc"]')) {
        _lastFocusedInput = e.target;
      }
    }
  });

  const clipBtn = document.getElementById("canvasClipBtn");
  // Počáteční stav: schovat schránku, dokud není nic zkopírováno (na mobilu je jinak defaultně viditelná)
  setCalcClipboardValue(_calcClipboardValue);
  clipBtn.addEventListener("mousedown", (e) => {
    // Prevent focus steal and overlay close
    e.preventDefault();
    e.stopPropagation();
  });
  clipBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const v = getCalcClipboardValue();
    if (v == null) { showToast("Schránka kalkulačky je prázdná"); return; }
    // Use tracked input – activeElement may have shifted
    const target = _lastFocusedInput;
    if (target && document.body.contains(target) && !target.disabled && !target.readOnly
        && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      const start = target.selectionStart || 0;
      const end = target.selectionEnd || 0;
      const before = target.value.substring(0, start);
      const after = target.value.substring(end);
      target.value = before + v + after;
      target.selectionStart = target.selectionEnd = start + String(v).length;
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.focus();
      showToast("Vloženo: " + v);
    } else {
      navigator.clipboard.writeText(String(v)).then(() => showToast("Zkopírováno do schránky: " + v));
    }
  });
}
