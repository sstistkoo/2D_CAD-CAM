import { showToast } from '../state.js';
import { safeEvalMath } from '../utils.js';
import { makeOverlay } from '../dialogFactory.js';

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

  // ── ISO 286 data ──
  // Dimension ranges [min, max] in mm
  var dimRanges = [
    [1,3],[3,6],[6,10],[10,18],[18,30],[30,50],[50,80],[80,120],
    [120,180],[180,250],[250,315],[315,400],[400,500]
  ];

  // IT grade tolerances in µm, indexed by dimRange then IT grade (IT1..IT18)
  var itTable = [
    /*1-3*/    [0.8,1.2,2,3,4,6,10,14,25,40,60,100,140,250,400,600,1000,1400],
    /*3-6*/    [1,1.5,2.5,4,5,8,12,18,30,48,75,120,180,300,480,750,1200,1800],
    /*6-10*/   [1,1.5,2.5,4,6,9,15,22,36,58,90,150,220,360,580,900,1500,2200],
    /*10-18*/  [1.2,2,3,5,8,11,18,27,43,70,110,180,270,430,700,1100,1800,2700],
    /*18-30*/  [1.5,2.5,4,6,9,13,21,33,52,84,130,210,330,520,840,1300,2100,3300],
    /*30-50*/  [1.5,2.5,4,7,11,16,25,39,62,100,160,250,390,620,1000,1600,2500,3900],
    /*50-80*/  [2,3,5,8,13,19,30,46,74,120,190,300,460,740,1200,1900,3000,4600],
    /*80-120*/ [2.5,4,6,10,15,22,35,54,87,140,220,350,540,870,1400,2200,3500,5400],
    /*120-180*/[3.5,5,8,12,18,25,40,63,100,160,250,400,630,1000,1600,2500,4000,6300],
    /*180-250*/[4.5,7,10,14,20,29,46,72,115,185,290,460,720,1150,1850,2900,4600,7200],
    /*250-315*/[6,8,12,16,23,32,52,81,130,210,320,520,810,1300,2100,3200,5200,8100],
    /*315-400*/[7,9,13,18,25,36,57,89,140,230,360,570,890,1400,2300,3600,5700,8900],
    /*400-500*/[8,10,15,20,27,40,63,97,155,250,400,630,970,1550,2500,4000,6300,9700],
  ];

  // Fundamental deviations in µm (shaft lowercase, hole uppercase)
  // Shaft: deviation is upper deviation (negative for a-h)
  // Key: letter -> array of values per dimRange
  var shaftDev = {
    a:  [-270,-270,-280,-290,-300,-310,-320,-340,-360,-380,-410,-440,-480],
    b:  [-140,-140,-150,-150,-160,-170,-180,-190,-200,-210,-230,-240,-260],
    c:  [-60,-70,-80,-95,-110,-120,-130,-140,-150,-170,-180,-190,-200],
    d:  [-20,-30,-40,-50,-65,-80,-100,-120,-145,-170,-190,-210,-230],
    e:  [-14,-20,-25,-32,-40,-50,-60,-72,-85,-100,-110,-125,-135],
    f:  [-6,-10,-13,-16,-20,-25,-30,-36,-43,-50,-56,-62,-68],
    g:  [-2,-4,-5,-6,-7,-9,-10,-12,-14,-15,-17,-18,-20],
    h:  [0,0,0,0,0,0,0,0,0,0,0,0,0],
    js: [0,0,0,0,0,0,0,0,0,0,0,0,0], // special: ±IT/2
    j:  [2,5,5,5,5,6,6,6,6,7,7,7,7],  // approximate j5-j8
    k:  [4,6,7,8,9,11,13,15,18,20,22,24,27],
    m:  [6,9,12,15,17,20,24,28,33,37,41,45,50],
    n:  [10,16,19,23,28,33,39,45,52,60,66,73,80],
    p:  [12,20,24,29,35,42,51,59,68,79,88,98,108],
    r:  [16,23,28,34,41,50,60,71,83,96,108,119,131],
    s:  [20,27,32,39,48,59,72,85,100,117,133,148,165],
  };

  // Hole: lower deviation (positive for A-H... actually A-G negative from zero, H=0)
  // For holes, deviation is LOWER deviation. H=0 always.
  // A-G have negative upper dev (hole is shifted up = positive lower dev)
  // Wait: For HOLES the fundamental deviation IS the lower deviation for A-H,
  // and upper deviation for J-Z.
  // Actually: Hole A = large clearance (positive lower deviation, big)
  // H = lower deviation = 0
  // K,M,N,P = transition/interference (negative lower deviation)
  // The hole deviation = -shaft deviation for same letter (approximately)
  var holeDev = {};
  var holeLetters = ["A","B","C","D","E","F","G","H","JS","J","K","M","N","P","R","S"];
  var shaftLetters = ["a","b","c","d","e","f","g","h","js","j","k","m","n","p","r","s"];
  // For holes A-H: lower deviation = positive of |shaft upper deviation|
  // For holes K-ZC: lower deviation = negative of shaft deviation
  for (var hi = 0; hi < holeLetters.length; hi++) {
    var sl = shaftLetters[hi];
    var hl = holeLetters[hi];
    var sVals = shaftDev[sl];
    if (sl === "js") {
      holeDev[hl] = [0,0,0,0,0,0,0,0,0,0,0,0,0]; // special
    } else if (sl <= "h") {
      // a-h: shaft has negative upper dev, hole gets positive lower dev
      holeDev[hl] = sVals.map(function(v) { return -v; });
    } else {
      // j-z: shaft has positive lower dev, hole gets negative lower dev
      holeDev[hl] = sVals.map(function(v) { return -v; });
    }
  }

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
        '<input type="text" data-id="fitHole" placeholder="H7" value="H7" style="text-transform:uppercase"></label>' +
      '<label class="cnc-field"><span>H\u0159\u00EDdel <small>nap\u0159. g6</small></span>' +
        '<input type="text" data-id="fitShaft" placeholder="g6" value="g6" style="text-transform:lowercase"></label>' +
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

  function calc() {
    var dim = inpDim.value !== "" ? safeEvalMath(inpDim.value) : null;
    if (dim === null || dim < 1 || dim > 500) {
      resultEl.textContent = dim !== null ? "Rozm\u011Br mimo rozsah (1\u2013500 mm)" : "Zadejte rozm\u011Br\u2026";
      return;
    }

    // find dimension range index
    var ri = -1;
    for (var i = 0; i < dimRanges.length; i++) {
      if (dim > dimRanges[i][0] && dim <= dimRanges[i][1]) { ri = i; break; }
    }
    // edge case: dim == 1 fits first range
    if (dim === 1) ri = 0;
    if (ri < 0) { resultEl.textContent = "Rozm\u011Br mimo rozsah"; return; }

    var itGrade = parseInt(getGridVal(gridIT)); // 1..18
    var tol = itTable[ri][itGrade - 1]; // µm

    var letter = getGridVal(gridClass);
    var devTable = isHole ? holeDev : shaftDev;
    var dev = devTable[letter];
    if (!dev) { resultEl.textContent = "Neplatn\u00E1 t\u0159\u00EDda"; return; }

    var fundDev = dev[ri]; // µm

    var upper, lower; // in µm
    if (isHole) {
      // Hole: for A-H fundamental deviation is lower deviation
      if (letter === "JS") {
        lower = -Math.round(tol / 2);
        upper = Math.round(tol / 2);
      } else if (letter <= "H") {
        // A-H: lower dev is positive (or zero for H), upper = lower + tol
        lower = fundDev;
        upper = fundDev + tol;
      } else {
        // J-ZC: fund dev is upper deviation (negative)
        upper = fundDev;
        lower = fundDev - tol;
      }
    } else {
      // Shaft: for a-h fundamental deviation is upper deviation
      if (letter === "js") {
        upper = Math.round(tol / 2);
        lower = -Math.round(tol / 2);
      } else if (letter <= "h") {
        // a-h: upper dev is negative (or zero for h), lower = upper - tol
        upper = fundDev;
        lower = fundDev - tol;
      } else {
        // j-z: fund dev is lower deviation (positive)
        lower = fundDev;
        upper = fundDev + tol;
      }
    }

    var dimMax = dim + upper / 1000;
    var dimMin = dim + lower / 1000;
    var sign = function(v) { return v > 0 ? "+" + v : "" + v; };

    var label = isHole ? letter.toUpperCase() : letter;
    var tolLabel = dim + " " + label + itGrade;

    resultEl.innerHTML =
      '<strong>' + tolLabel + '</strong><br>' +
      'Horn\u00ED \u00FAdchylka: ' + sign(upper) + ' \u00B5m \u2502 Doln\u00ED: ' + sign(lower) + ' \u00B5m<br>' +
      '\u00D8 max: <strong>' + dimMax.toFixed(3) + '</strong> mm \u2502 \u00D8 min: <strong>' + dimMin.toFixed(3) + '</strong> mm<br>' +
      'Tolerance: ' + tol + ' \u00B5m (' + (tol / 1000).toFixed(3) + ' mm)';
  }

  inpDim.addEventListener("input", calc);

  // ── Fit (uložení) calculation ──
  var fitHoleInp = overlay.querySelector('[data-id="fitHole"]');
  var fitShaftInp = overlay.querySelector('[data-id="fitShaft"]');
  var fitResult = overlay.querySelector("#fitResult");

  function parseFitSpec(spec, forHole) {
    // Parse e.g. "H7" -> {letter: "H", grade: 7} or "g6" -> {letter: "g", grade: 6}
    var match = spec.trim().match(/^([A-Za-z]{1,2})(\d{1,2})$/);
    if (!match) return null;
    var letter = match[1];
    var grade = parseInt(match[2]);
    if (grade < 1 || grade > 18) return null;
    // Validate letter exists
    var devTable = forHole ? holeDev : shaftDev;
    var key = forHole ? letter.toUpperCase() : letter.toLowerCase();
    if (!devTable[key]) return null;
    return { letter: key, grade: grade };
  }

  function calcDeviation(letter, grade, ri, forHole) {
    var devTable = forHole ? holeDev : shaftDev;
    var dev = devTable[letter];
    if (!dev) return null;
    var fundDev = dev[ri];
    var tol = itTable[ri][grade - 1];
    var upper, lower;
    if (forHole) {
      if (letter === "JS") { lower = -Math.round(tol/2); upper = Math.round(tol/2); }
      else if (letter <= "H") { lower = fundDev; upper = fundDev + tol; }
      else { upper = fundDev; lower = fundDev - tol; }
    } else {
      if (letter === "js") { upper = Math.round(tol/2); lower = -Math.round(tol/2); }
      else if (letter <= "h") { upper = fundDev; lower = fundDev - tol; }
      else { lower = fundDev; upper = fundDev + tol; }
    }
    return { upper: upper, lower: lower, tol: tol };
  }

  function calcFit() {
    var dim = inpDim.value !== "" ? safeEvalMath(inpDim.value) : null;
    if (dim === null || dim < 1 || dim > 500) {
      fitResult.innerHTML = dim !== null ? "Zadejte rozměr 1–500 mm" : "";
      return;
    }
    var ri = -1;
    for (var i = 0; i < dimRanges.length; i++) {
      if (dim > dimRanges[i][0] && dim <= dimRanges[i][1]) { ri = i; break; }
    }
    if (dim === 1) ri = 0;
    if (ri < 0) { fitResult.innerHTML = "Rozměr mimo rozsah"; return; }

    var holeSpec = parseFitSpec(fitHoleInp.value, true);
    var shaftSpec = parseFitSpec(fitShaftInp.value, false);
    if (!holeSpec || !shaftSpec) {
      fitResult.innerHTML = '<span style="color:#f38ba8">Zadejte platné uložení (např. H7/g6)</span>';
      return;
    }

    var hDev = calcDeviation(holeSpec.letter, holeSpec.grade, ri, true);
    var sDev = calcDeviation(shaftSpec.letter, shaftSpec.grade, ri, false);
    if (!hDev || !sDev) { fitResult.innerHTML = "Chyba výpočtu"; return; }

    var sign = function(v) { return v > 0 ? "+" + v : "" + v; };

    // Clearance = hole_size - shaft_size
    // Max clearance = hole_max - shaft_min = (dim + hDev.upper/1000) - (dim + sDev.lower/1000)
    var maxClearance = hDev.upper - sDev.lower; // µm
    var minClearance = hDev.lower - sDev.upper; // µm

    var fitType, fitColor;
    if (minClearance > 0) {
      fitType = "Uložení s VŮLÍ (volné)";
      fitColor = "#a6e3a1";
    } else if (maxClearance < 0) {
      fitType = "Uložení s PŘESAHEM";
      fitColor = "#f38ba8";
    } else {
      fitType = "PŘECHODNÉ uložení";
      fitColor = "#f9e2af";
    }

    var fitLabel = dim + " " + holeSpec.letter + holeSpec.grade + "/" + shaftSpec.letter + shaftSpec.grade;

    fitResult.innerHTML =
      '<strong style="color:' + fitColor + '">' + fitType + '</strong><br>' +
      '<strong>' + fitLabel + '</strong><br>' +
      '<span style="color:#89b4fa">Díra ' + holeSpec.letter + holeSpec.grade + ':</span> ' +
        sign(hDev.upper) + '/' + sign(hDev.lower) + ' µm → ' +
        (dim + hDev.upper/1000).toFixed(3) + '/' + (dim + hDev.lower/1000).toFixed(3) + ' mm<br>' +
      '<span style="color:#cba6f7">Hřídel ' + shaftSpec.letter + shaftSpec.grade + ':</span> ' +
        sign(sDev.upper) + '/' + sign(sDev.lower) + ' µm → ' +
        (dim + sDev.upper/1000).toFixed(3) + '/' + (dim + sDev.lower/1000).toFixed(3) + ' mm<br>' +
      (minClearance >= 0
        ? 'Vůle: <strong>' + (minClearance/1000).toFixed(3) + '</strong> – <strong>' + (maxClearance/1000).toFixed(3) + '</strong> mm'
        : (maxClearance <= 0
          ? 'Přesah: <strong>' + (Math.abs(maxClearance)/1000).toFixed(3) + '</strong> – <strong>' + (Math.abs(minClearance)/1000).toFixed(3) + '</strong> mm'
          : 'Vůle max: <strong>' + (maxClearance/1000).toFixed(3) + '</strong> mm │ Přesah max: <strong>' + (Math.abs(minClearance)/1000).toFixed(3) + '</strong> mm'));
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