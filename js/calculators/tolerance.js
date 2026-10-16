import { showToast } from '../state.js';
import { safeEvalMath } from '../utils.js';
import { makeOverlay, isTouchDevice, onOverlayRemoved } from '../dialogFactory.js';
import { deviations, SHAFT_LETTERS, HOLE_LETTERS } from './iso286.js';

export function openToleranceCalc() {
  // ── ISO 2768-1 : volné míry ──
  // [maxDim, f, m, c, v]  (±mm)
  var freeRows = [
    [3,    0.05, 0.1,  0.2,  null],
    [6,    0.05, 0.1,  0.3,  0.5],
    [30,   0.1,  0.2,  0.5,  1.0],
    [120,  0.15, 0.3,  0.8,  1.5],
    [400,  0.2,  0.5,  1.2,  2.5],
    [1000, 0.3,  0.8,  2.0,  4.0],
    [2000, 0.5,  1.2,  3.0,  6.0],
    [4000, null, 2.0,  4.0,  8.0],
  ];
  // Sloupec m (střední třída) je zvýrazněný rámečkem – běžná výchozí třída výkresů
  var freeHTML = '<table class="cnc-table"><thead><tr>' +
    '<th>Rozměr (mm)</th><th>f</th><th class="tol-m tol-m-top">m</th><th>c</th><th>v</th></tr></thead><tbody>';
  var prevMax = 0.5;
  for (var fi = 0; fi < freeRows.length; fi++) {
    var r = freeRows[fi];
    freeHTML += '<tr><td>' + prevMax + ' – ' + r[0] + '</td>';
    for (var ci = 1; ci <= 4; ci++) {
      var mCls = ci === 2 ? ' class="tol-m' + (fi === freeRows.length - 1 ? ' tol-m-bot' : '') + '"' : '';
      freeHTML += '<td' + mCls + '>' + (r[ci] !== null ? '±' + r[ci] : '—') + '</td>';
    }
    freeHTML += '</tr>';
    prevMax = r[0];
  }
  freeHTML += '</tbody></table>';

  // ── ISO 286: data a pravidla v iso286.js (hodnoty z tabulek ISO 286-2) ──
  var holeLetters = HOLE_LETTERS;
  var shaftLetters = SHAFT_LETTERS;

  // Build grid buttons instead of selects
  var shaftBtns = '', holeBtns = '';
  for (var si = 0; si < shaftLetters.length; si++) {
    var act = shaftLetters[si] === 'h' ? ' tol-g-active' : '';
    shaftBtns += '<button class="tol-g-btn' + act + '" data-val="' + shaftLetters[si] + '">' + shaftLetters[si] + '</button>';
  }
  for (var hi2 = 0; hi2 < holeLetters.length; hi2++) {
    var act2 = holeLetters[hi2] === 'H' ? ' tol-g-active' : '';
    holeBtns += '<button class="tol-g-btn' + act2 + '" data-val="' + holeLetters[hi2] + '">' + holeLetters[hi2] + '</button>';
  }

  var itBtns = '';
  for (var it = 1; it <= 18; it++) {
    var act3 = (it === 7) ? ' tol-g-active' : '';
    itBtns += '<button class="tol-g-btn' + act3 + '" data-val="' + it + '">' + it + '</button>';
  }

  var body =
    '<details class="tol-free"><summary>Volné míry – ČSN EN ISO 2768-1 <small>(■ m = střední třída)</small></summary>' +
    '<div class="cnc-table-wrap">' + freeHTML + '</div></details>' +
    '<div class="cnc-table-label" style="margin-top:12px">Tolerované rozměry – ČSN EN ISO 286-1</div>' +
    '<div class="tol-toggle-row">' +
      '<button class="tol-toggle tol-active" data-src="iso">Třída a stupeň ISO</button>' +
      '<button class="tol-toggle" data-src="custom">Vlastní úchylky</button>' +
    '</div>' +
    '<div class="tol-main-row">' +
      '<button class="tol-toggle tol-active" data-mode="hole">Díra</button>' +
      '<label class="tol-dim" aria-label="Jmenovitý průměr v mm"><span class="tol-dim-sym">Ø</span>' +
        '<input type="text" inputmode="decimal" data-id="tolDim" placeholder="Rozměr mm"></label>' +
      '<button class="tol-toggle" data-mode="shaft">Hřídel</button>' +
    '</div>' +
    '<div class="tol-custom-row" data-id="tolCustom" hidden>' +
      '<span class="tol-range-lbl">Rozmezí</span>' +
      '<label class="tol-dev"><button type="button" class="tol-sign" tabindex="-1" title="Přepnout znaménko">±</button><input type="text" inputmode="decimal" data-id="tolUp" placeholder="např. -0,255"></label>' +
      '<label class="tol-dev"><button type="button" class="tol-sign" tabindex="-1" title="Přepnout znaménko">±</button><input type="text" inputmode="decimal" data-id="tolLo" placeholder="např. -0,304"></label>' +
    '</div>' +
    '<div class="cnc-field cnc-field-full" data-id="tolIsoClass"><span>Třída</span>' +
      '<div class="tol-grid tol-class-grid" data-id="tolClass">' + holeBtns + '</div></div>' +
    '<div class="cnc-field cnc-field-full" data-id="tolIsoIT"><span>Stupeň</span>' +
      '<div class="tol-grid tol-it-grid" data-id="tolIT">' + itBtns + '</div></div>' +
    '<div class="cnc-result tol-res" id="tolResult">Zadejte rozměr…</div>' +
    '<div class="cnc-actions"><button class="cnc-btn cnc-btn-copy">📋 Kopírovat</button></div>';

  // Nezavírat klepnutím mimo okno (jen křížkem / Esc) – rozdělané zadání by se snadno ztratilo
  var overlay = makeOverlay("tolerance", "📏 Tolerance", body, null, { closeOnBackdrop: false });
  if (!overlay) return;

  // Mobil: okno se drží nad softwarovou klávesnicí (visualViewport) a zadávané pole
  // se po vysunutí klávesnice odroluje do viditelné části
  var vv = window.visualViewport;
  if (vv && isTouchDevice()) {
    var baseH = Math.max(vv.height, window.innerHeight);
    var fitWin = function() {
      overlay.style.top = vv.offsetTop + "px";
      overlay.style.height = vv.height + "px";
      // Klávesnice nahoře → okno úplně nahoru (překryje i pravý panel), ať je vidět výsledek
      var kbOpen = vv.height < baseH - 120;
      overlay.style.paddingTop = kbOpen ? "4px" : "";
      var w = overlay.querySelector(".calc-window");
      if (w) w.style.maxHeight = Math.max(200, vv.height - (kbOpen ? 8 : 48)) + "px";
    };
    vv.addEventListener("resize", fitWin);
    vv.addEventListener("scroll", fitWin);
    onOverlayRemoved(overlay, function() {
      vv.removeEventListener("resize", fitWin);
      vv.removeEventListener("scroll", fitWin);
    });
    fitWin();
    overlay.addEventListener("focusin", function(e) {
      var t = e.target;
      if (t && t.tagName === "INPUT") setTimeout(function() { t.scrollIntoView({ block: "center", behavior: "smooth" }); }, 300);
    });
  }

  // 🔢 Kalkulačka na kontrolu výpočtu – plovoucí tlačítko z plátna je pod tímto oknem skryté
  var calcBtn = document.createElement("button");
  calcBtn.type = "button";
  calcBtn.className = "calc-titlebar-btn tol-calc-btn";
  calcBtn.title = "Kalkulačka";
  calcBtn.setAttribute("aria-label", "Kalkulačka");
  calcBtn.textContent = "🔢";
  calcBtn.addEventListener("click", function() {
    import('../ui.js').then(function(m) { m.openCalculator(); });
  });
  var closeBtn = overlay.querySelector(".calc-close-btn");
  closeBtn.parentNode.insertBefore(calcBtn, closeBtn);

  var inpDim = overlay.querySelector('[data-id="tolDim"]');
  var gridClass = overlay.querySelector('[data-id="tolClass"]');
  var gridIT = overlay.querySelector('[data-id="tolIT"]');
  var resultEl = overlay.querySelector("#tolResult");
  var btnHole = overlay.querySelector('[data-mode="hole"]');
  var btnShaft = overlay.querySelector('[data-mode="shaft"]');
  var inpUp = overlay.querySelector('[data-id="tolUp"]');
  var inpLo = overlay.querySelector('[data-id="tolLo"]');
  var customRow = overlay.querySelector('[data-id="tolCustom"]');
  var isoBlocks = overlay.querySelectorAll('[data-id="tolIsoClass"],[data-id="tolIsoIT"]');
  var isCustom = false;
  var isHole = true;
  var copyText = ""; // prostý text posledního platného výsledku pro Kopírovat

  function getGridVal(grid) {
    var a = grid.querySelector('.tol-g-active');
    return a ? a.dataset.val : null;
  }

  function initGrid(grid, onChange) {
    grid.addEventListener('click', function(e) {
      var btn = e.target.closest('.tol-g-btn');
      if (!btn) return;
      var prev = grid.querySelector('.tol-g-active');
      if (prev) prev.classList.remove('tol-g-active');
      btn.classList.add('tol-g-active');
      if (document.activeElement && document.activeElement.tagName === "INPUT") document.activeElement.blur(); // schová klávesnici
      if (onChange) onChange();
    });
  }

  initGrid(gridClass, calc);
  initGrid(gridIT, calc);

  function setMode(hole) {
    isHole = hole;
    btnHole.classList.toggle("tol-active", hole);
    btnShaft.classList.toggle("tol-active", !hole);
    gridClass.innerHTML = hole ? holeBtns : shaftBtns;
    calc();
  }
  btnHole.addEventListener("click", function() { setMode(true); });
  btnShaft.addEventListener("click", function() { setMode(false); });

  // Přepínač: třída + stupeň ISO × vlastní horní/dolní úchylka (mm)
  overlay.querySelectorAll('[data-src]').forEach(function(b) {
    b.addEventListener("click", function() {
      isCustom = b.dataset.src === "custom";
      overlay.querySelectorAll('[data-src]').forEach(function(o) { o.classList.toggle("tol-active", o === b); });
      customRow.hidden = !isCustom;
      isoBlocks.forEach(function(el) { el.hidden = isCustom; });
      calc();
    });
  });

  // Úchylky s desetinnou částí (js/JS u lichého IT) bez zbytečných nul
  function sign(v) { var r = Math.round(v * 10) / 10; return r > 0 ? "+" + r : "" + r; }
  function mm(v) { return String(parseFloat(v.toFixed(4))); }

  var LS_KEY = "skica_tolerance";
  function saveState() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        custom: isCustom, hole: isHole, dim: inpDim.value, up: inpUp.value, lo: inpLo.value,
        cls: { hole: getGridVal(gridClass) && isHole ? getGridVal(gridClass) : savedCls.hole,
               shaft: getGridVal(gridClass) && !isHole ? getGridVal(gridClass) : savedCls.shaft },
        it: getGridVal(gridIT)
      }));
    } catch (e) { /* localStorage nedostupné */ }
  }
  var savedCls = { hole: null, shaft: null };

  function calc() {
    copyText = "";
    saveState();
    var dim = inpDim.value !== "" ? safeEvalMath(inpDim.value) : null;
    if (dim === null) { resultEl.textContent = "Zadejte rozměr…"; return; }
    if (!isFinite(dim) || dim <= 0) { resultEl.textContent = "Neplatný rozměr"; return; }
    if (!isCustom && dim > 500) { resultEl.textContent = "Rozměr mimo rozsah ISO 286 (0–500 mm)"; return; }
    var r, tolLabel;
    if (isCustom) {
      if (inpUp.value === "" || inpLo.value === "") { resultEl.textContent = "Zadejte horní i dolní úchylku…"; return; }
      var up = safeEvalMath(inpUp.value), lo = safeEvalMath(inpLo.value);
      if (!isFinite(up) || !isFinite(lo)) { resultEl.textContent = "Neplatná úchylka"; return; }
      if (up < lo) { var tmp = up; up = lo; lo = tmp; } // zadáno naopak → přizpůsobit
      var f3 = function(v) { return (v > 0 ? "+" : "") + String(parseFloat(v.toFixed(4))); };
      r = { upper: up * 1000, lower: lo * 1000, tol: Math.round((up - lo) * 1e6) / 1000 };
      tolLabel = "Ø" + dim + " " + f3(up) + " / " + f3(lo);
    } else {
      var itGrade = parseInt(getGridVal(gridIT), 10); // 1..18
      var letter = getGridVal(gridClass);
      r = deviations(letter, itGrade, dim);
      if (r.error) { resultEl.textContent = r.error; return; }
      tolLabel = "Ø" + dim + " " + letter + itGrade;
    }

    var dimMax = dim + r.upper / 1000;
    var dimMin = dim + r.lower / 1000;
    var kind = isHole ? "Díra" : "Hřídel";
    var tolMm = (r.tol / 1000).toFixed(4).replace(/0$/, '');

    // Rozhodující rozměr: díra = menší průměr (úchylka +), hřídel = větší průměr (úchylka −)
    var keyLbl = isHole ? "Ø min" : "Ø max";
    var keyVal = isHole ? dimMin : dimMax;
    var tolSgn = isHole ? "+" : "−";
    var tolTxt = tolSgn + r.tol + " µm (" + tolSgn + tolMm + " mm)";

    copyText = kind + " " + tolLabel + " │ " + sign(r.upper) + " / " + sign(r.lower) + " µm │ max " +
      mm(dimMax) + " / min " + mm(dimMin) + " mm │ " + keyLbl + " " + mm(keyVal) + " mm " + tolTxt;

    resultEl.innerHTML =
      '<div class="tol-res-head"><span class="tol-res-kind ' + (isHole ? 'tol-kind-hole' : 'tol-kind-shaft') + '">' +
        kind + '</span> <strong>' + tolLabel + '</strong></div>' +
      '<div class="tol-res-cols">' +
        '<div class="tol-res-col">' +
          '<div><span>Horní</span><b>' + sign(r.upper) + ' µm</b></div>' +
          '<div><span>Dolní</span><b>' + sign(r.lower) + ' µm</b></div>' +
        '</div>' +
        '<div class="tol-res-col">' +
          '<div' + (isHole ? '' : ' class="tol-res-key"') + '><span>Ø max</span><b>' + mm(dimMax) + ' mm</b></div>' +
          '<div' + (isHole ? ' class="tol-res-key"' : '') + '><span>Ø min</span><b>' + mm(dimMin) + ' mm</b></div>' +
        '</div>' +
      '</div>' +
      '<div class="tol-res-tol"><span>' + keyLbl + '</span><br><b>' + mm(keyVal) + ' mm</b> ' + tolTxt + '</div>' +
      (r.note ? '<div class="tol-res-note">' + r.note + '</div>' : '');
  }

  inpDim.addEventListener("input", calc);
  // Číselná klávesnice (hlavně iOS) nemá minus → tlačítko ± přepne znaménko
  overlay.querySelectorAll(".tol-sign").forEach(function(b) {
    b.addEventListener("mousedown", function(e) { e.preventDefault(); }); // nesebrat focus poli
    b.addEventListener("click", function() {
      var inp = b.parentNode.querySelector("input");
      var v = inp.value.trim();
      inp.value = v.charAt(0) === "-" ? v.slice(1) : "-" + v.replace(/^\+/, "");
      inp.dispatchEvent(new Event("input"));
    });
  });
  inpUp.addEventListener("input", calc);
  inpLo.addEventListener("input", calc);

  // Obnovení posledního nastavení
  (function restoreState() {
    var st = null;
    try { st = JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch (e) { /* ignorovat */ }
    if (!st) return;
    savedCls = st.cls || savedCls;
    function pick(grid, val) {
      var b = val != null && grid.querySelector('.tol-g-btn[data-val="' + val + '"]');
      if (!b) return;
      var prev = grid.querySelector('.tol-g-active');
      if (prev) prev.classList.remove('tol-g-active');
      b.classList.add('tol-g-active');
    }
    inpDim.value = st.dim || ""; inpUp.value = st.up || ""; inpLo.value = st.lo || "";
    isHole = st.hole !== false;
    btnHole.classList.toggle("tol-active", isHole);
    btnShaft.classList.toggle("tol-active", !isHole);
    gridClass.innerHTML = isHole ? holeBtns : shaftBtns;
    pick(gridClass, isHole ? savedCls.hole : savedCls.shaft);
    pick(gridIT, st.it);
    if (st.custom) overlay.querySelector('[data-src="custom"]').click(); else calc();
  })();

  overlay.querySelector(".cnc-btn-copy").addEventListener("click", function() {
    if (copyText) {
      navigator.clipboard.writeText(copyText).then(function() { showToast("Zkopírováno"); });
    }
  });
}
