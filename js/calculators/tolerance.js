import { showToast } from '../state.js';
import { safeEvalMath } from '../utils.js';
import { makeOverlay } from '../dialogFactory.js';
import { deviations, fit, SHAFT_LETTERS, HOLE_LETTERS } from './iso286.js';

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
  var freeHTML = '<table class="cnc-table"><thead><tr>' +
    '<th>Rozm\u011Br (mm)</th><th>f</th><th>m</th><th>c</th><th>v</th></tr></thead><tbody>';
  var prevMax = 0.5;
  for (var fi = 0; fi < freeRows.length; fi++) {
    var r = freeRows[fi];
    freeHTML += '<tr><td>' + prevMax + ' \u2013 ' + r[0] + '</td>';
    for (var ci = 1; ci <= 4; ci++) {
      freeHTML += '<td>' + (r[ci] !== null ? '\u00B1' + r[ci] : '\u2014') + '</td>';
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
    '<div class="cnc-table-label">Voln\u00E9 m\u00EDry \u2013 \u010CSN EN ISO 2768-1</div>' +
    '<div class="cnc-table-wrap">' + freeHTML + '</div>' +
    '<div class="cnc-table-label" style="margin-top:12px">Tolerovan\u00E9 rozm\u011Bry \u2013 \u010CSN EN ISO 286-1</div>' +
    '<div class="cnc-fields">' +
      '<label class="cnc-field cnc-field-full"><span>Jmenovit\u00FD rozm\u011Br <small>mm</small></span>' +
        '<input type="number" data-id="tolDim" step="any" placeholder="nap\u0159. 25"></label>' +
    '</div>' +
    '<div class="tol-toggle-row">' +
      '<button class="tol-toggle tol-active" data-mode="hole">D\u00EDra</button>' +
      '<button class="tol-toggle" data-mode="shaft">H\u0159\u00EDdel</button>' +
    '</div>' +
    '<div class="cnc-field cnc-field-full"><span>T\u0159\u00EDda</span>' +
      '<div class="tol-grid tol-class-grid" data-id="tolClass">' + holeBtns + '</div></div>' +
    '<div class="cnc-field cnc-field-full"><span>Stupe\u0148</span>' +
      '<div class="tol-grid tol-it-grid" data-id="tolIT">' + itBtns + '</div></div>' +
    '<div class="cnc-result" id="tolResult">Zadejte rozm\u011Br\u2026</div>' +
    '<div class="cnc-table-label" style="margin-top:12px">\uD83D\uDD27 Ulo\u017Een\u00ED (l\u00EDcov\u00E1n\u00ED d\u00EDra + h\u0159\u00EDdel)</div>' +
    '<div class="cnc-fields">' +
      '<label class="cnc-field"><span>D\u00EDra <small>nap\u0159. H7</small></span>' +
        '<input type="text" data-id="fitHole" inputmode="text" placeholder="H7" value="H7" style="text-transform:uppercase"></label>' +
      '<label class="cnc-field"><span>H\u0159\u00EDdel <small>nap\u0159. g6</small></span>' +
        '<input type="text" data-id="fitShaft" inputmode="text" placeholder="g6" value="g6" style="text-transform:lowercase"></label>' +
    '</div>' +
    '<div class="cnc-result" id="fitResult"></div>' +
    '<div class="cnc-actions"><button class="cnc-btn cnc-btn-copy">\uD83D\uDCCB Kopírovat</button></div>';

  var overlay = makeOverlay("tolerance", "\uD83D\uDCCF Tolerance", body);
  if (!overlay) return;

  var inpDim = overlay.querySelector('[data-id="tolDim"]');
  var gridClass = overlay.querySelector('[data-id="tolClass"]');
  var gridIT = overlay.querySelector('[data-id="tolIT"]');
  var resultEl = overlay.querySelector("#tolResult");
  var btnHole = overlay.querySelector('[data-mode="hole"]');
  var btnShaft = overlay.querySelector('[data-mode="shaft"]');
  var isHole = true;

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

  // Úchylky s desetinnou částí (js/JS u lichého IT) bez zbytečných nul
  function sign(v) { var r = Math.round(v * 10) / 10; return r > 0 ? "+" + r : "" + r; }

  function calc() {
    var dim = inpDim.value !== "" ? safeEvalMath(inpDim.value) : null;
    if (dim === null || !(dim > 0 && dim <= 500)) {
      resultEl.textContent = dim !== null ? "Rozměr mimo rozsah (0–500 mm)" : "Zadejte rozměr…";
      return;
    }
    var itGrade = parseInt(getGridVal(gridIT), 10); // 1..18
    var letter = getGridVal(gridClass);
    var r = deviations(letter, itGrade, dim);
    if (r.error) { resultEl.textContent = r.error; return; }

    var dimMax = dim + r.upper / 1000;
    var dimMin = dim + r.lower / 1000;
    var tolLabel = dim + " " + letter + itGrade;

    resultEl.innerHTML =
      '<strong>' + tolLabel + '</strong><br>' +
      'Horní úchylka: ' + sign(r.upper) + ' µm │ Dolní: ' + sign(r.lower) + ' µm<br>' +
      'Ø max: <strong>' + dimMax.toFixed(4).replace(/0$/, '') + '</strong> mm │ Ø min: <strong>' + dimMin.toFixed(4).replace(/0$/, '') + '</strong> mm<br>' +
      'Tolerance: ' + r.tol + ' µm (' + (r.tol / 1000).toFixed(4).replace(/0$/, '') + ' mm)' +
      (r.note ? '<br><small style="color:#a6adc8">' + r.note + '</small>' : '');
  }

  inpDim.addEventListener("input", calc);

  // ── Fit (uložení) calculation ──
  var fitHoleInp = overlay.querySelector('[data-id="fitHole"]');
  var fitShaftInp = overlay.querySelector('[data-id="fitShaft"]');
  var fitResult = overlay.querySelector("#fitResult");

  function parseFitSpec(spec, forHole) {
    // „H7" → {letter: "H", grade: 7}, „g6" → {letter: "g", grade: 6}, „js6" → {letter: "js", grade: 6}
    var match = spec.trim().match(/^([A-Za-z]{1,2})(\d{1,2})$/);
    if (!match) return null;
    var grade = parseInt(match[2], 10);
    if (grade < 1 || grade > 18) return null;
    var letter = forHole ? match[1].toUpperCase() : match[1].toLowerCase();
    var list = forHole ? holeLetters : shaftLetters;
    if (list.indexOf(letter) < 0) return null;
    return { letter: letter, grade: grade };
  }

  function calcFit() {
    var dim = inpDim.value !== "" ? safeEvalMath(inpDim.value) : null;
    if (dim === null || !(dim > 0 && dim <= 500)) {
      fitResult.innerHTML = dim !== null ? "Zadejte rozměr 0–500 mm" : "";
      return;
    }
    var holeSpec = parseFitSpec(fitHoleInp.value, true);
    var shaftSpec = parseFitSpec(fitShaftInp.value, false);
    if (!holeSpec || !shaftSpec) {
      fitResult.innerHTML = '<span style="color:#f38ba8">Zadejte platné uložení (např. H7/g6)</span>';
      return;
    }
    var f = fit(holeSpec.letter, holeSpec.grade, shaftSpec.letter, shaftSpec.grade, dim);
    if (f.error) { fitResult.innerHTML = '<span style="color:#f38ba8">' + f.error + '</span>'; return; }
    var hDev = f.hole, sDev = f.shaft;
    var mm = function(v) { return (v / 1000).toFixed(4).replace(/0$/, ''); };
    var fitType = f.type === 'vůle' ? "Uložení s VŮLÍ (volné)" : f.type === 'přesah' ? "Uložení s PŘESAHEM" : "PŘECHODNÉ uložení";
    var fitColor = f.type === 'vůle' ? "#a6e3a1" : f.type === 'přesah' ? "#f38ba8" : "#f9e2af";
    var fitLabel = dim + " " + holeSpec.letter + holeSpec.grade + "/" + shaftSpec.letter + shaftSpec.grade;

    fitResult.innerHTML =
      '<strong style="color:' + fitColor + '">' + fitType + '</strong><br>' +
      '<strong>' + fitLabel + '</strong><br>' +
      '<span style="color:#89b4fa">Díra ' + holeSpec.letter + holeSpec.grade + ':</span> ' +
        sign(hDev.upper) + '/' + sign(hDev.lower) + ' µm → ' +
        (dim + hDev.upper / 1000).toFixed(3) + '/' + (dim + hDev.lower / 1000).toFixed(3) + ' mm<br>' +
      '<span style="color:#cba6f7">Hřídel ' + shaftSpec.letter + shaftSpec.grade + ':</span> ' +
        sign(sDev.upper) + '/' + sign(sDev.lower) + ' µm → ' +
        (dim + sDev.upper / 1000).toFixed(3) + '/' + (dim + sDev.lower / 1000).toFixed(3) + ' mm<br>' +
      (f.type === 'vůle'
        ? 'Vůle: <strong>' + mm(f.minClearance) + '</strong> – <strong>' + mm(f.maxClearance) + '</strong> mm'
        : (f.type === 'přesah'
          ? 'Přesah: <strong>' + mm(-f.maxClearance) + '</strong> – <strong>' + mm(-f.minClearance) + '</strong> mm'
          : 'Vůle max: <strong>' + mm(f.maxClearance) + '</strong> mm │ Přesah max: <strong>' + mm(-f.minClearance) + '</strong> mm')) +
      [hDev.note, sDev.note].filter(Boolean).map(function(n) { return '<br><small style="color:#a6adc8">' + n + '</small>'; }).join('');
  }

  fitHoleInp.addEventListener("input", calcFit);
  fitShaftInp.addEventListener("input", calcFit);
  inpDim.addEventListener("input", calcFit);
  // Initial calculation
  calcFit();

  overlay.querySelector(".cnc-btn-copy").addEventListener("click", function() {
    if (resultEl.textContent && resultEl.textContent !== "Zadejte rozm\u011Br\u2026") {
      navigator.clipboard.writeText(resultEl.textContent).then(function() { showToast("Zkop\u00EDrov\u00E1no"); });
    }
  });
}