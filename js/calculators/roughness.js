import { showToast } from '../state.js';
import { safeEvalMath } from '../utils.js';
import { makeOverlay } from '../dialogFactory.js';

export function openRoughnessCalc() {
  // ── DATA ──────────────────────────────────────────────────
  // Korekční faktor materiálu obrobku k_mat
  var workMaterials = [
    {n:"Ocel 11 523 (S355)",      k:1.0},
    {n:"Ocel 12 050 (C45)",       k:1.0},
    {n:"Ocel 14 220 (16MnCr5)",   k:0.95},
    {n:"Ocel 15 142 (42CrMo4)",   k:0.9},
    {n:"Nerez 17 240 (X5CrNi)",   k:1.6},
    {n:"Nerez 17 346 (X2CrNiMo)", k:1.7},
    {n:"Litina 42 2420 (GG25)",   k:1.1},
    {n:"Hlin\u00EDk (AlCu4Mg)",   k:0.9},
    {n:"Hlin\u00EDk (slitiny Si)", k:1.4},
    {n:"Mosaz (CuZn39Pb3)",       k:0.85},
    {n:"M\u011B\u010F (Cu-ETP)",  k:1.3},
    {n:"Bronz (CuSn8)",           k:1.0},
    {n:"POM (ertacetal)",          k:0.9},
    {n:"PA6 (nylon)",              k:1.2},
  ];

  // Korekční faktor materiálu nástroje k_tool
  var toolMaterials = [
    {n:"SK (karbid)",   k:1.0},
    {n:"HSS",           k:1.3},
    {n:"Keramika",      k:0.85},
    {n:"CBN",           k:0.75},
    {n:"PCD (diamant)", k:0.7},
  ];

  // Třídy drsnosti ISO 1302
  var raClasses = [
    {cls:"N1", ra:0.025}, {cls:"N2", ra:0.05}, {cls:"N3", ra:0.1},
    {cls:"N4", ra:0.2},   {cls:"N5", ra:0.4},  {cls:"N6", ra:0.8},
    {cls:"N7", ra:1.6},   {cls:"N8", ra:3.2},  {cls:"N9", ra:6.3},
    {cls:"N10",ra:12.5},  {cls:"N11",ra:25},   {cls:"N12",ra:50},
  ];

  // Běžné radiusy špičky plátku [mm]
  var commonRadii = [0.2, 0.4, 0.8, 1.2, 1.6, 2.4];

  // k_vc (vliv řezné rychlosti)
  function getKvc(vc) {
    if (vc <= 0) return 1.0;
    if (vc < 30) return 1.6;
    if (vc < 80) return 1.2;
    if (vc < 150) return 1.0;
    if (vc < 300) return 0.95;
    return 0.9;
  }

  // Najdi třídu drsnosti pro danou Ra
  function getRaClass(ra) {
    for (var i = 0; i < raClasses.length; i++) {
      if (ra <= raClasses[i].ra) return raClasses[i].cls;
    }
    return ">N12";
  }

  // ── BUILD HTML ────────────────────────────────────────────
  var matOptions = '';
  for (var i = 0; i < workMaterials.length; i++) {
    matOptions += '<option value="' + i + '">' + workMaterials[i].n + '</option>';
  }
  var toolOptions = '';
  for (var i = 0; i < toolMaterials.length; i++) {
    toolOptions += '<option value="' + i + '">' + toolMaterials[i].n + '</option>';
  }

  // Radiusová tlačítka
  var radiusBtns = '';
  for (var i = 0; i < commonRadii.length; i++) {
    radiusBtns += '<button class="rough-r-btn tol-g-btn" data-r="' + commonRadii[i] + '">' + commonRadii[i] + '</button>';
  }

  // Třída drsnosti bar
  var classBar = '';
  for (var i = 0; i < raClasses.length; i++) {
    classBar += '<div class="rough-class-cell" data-idx="' + i + '">' +
      '<div class="rough-class-lbl">' + raClasses[i].cls + '</div>' +
      '<div class="rough-class-val">' + raClasses[i].ra + '</div>' +
    '</div>';
  }

  var body =
    // Materiál obrobku
    '<div class="cnc-table-label">Materi\u00E1l obrobku</div>' +
    '<select class="cnc-filter" data-id="rMat">' + matOptions + '</select>' +
    // Materiál nástroje
    '<div class="cnc-table-label">Materi\u00E1l n\u00E1stroje</div>' +
    '<select class="cnc-filter" data-id="rTool">' + toolOptions + '</select>' +
    // Vstupní pole
    '<div class="cnc-fields" style="margin-top:10px">' +
      '<label class="cnc-field"><span>f <small>mm/ot</small></span>' +
        '<input type="number" data-id="rF" step="any" placeholder="Posuv"></label>' +
      '<label class="cnc-field"><span>r\u03B5 <small>mm</small></span>' +
        '<input type="number" data-id="rRe" step="any" placeholder="Radius"></label>' +
      '<label class="cnc-field"><span>Vc <small>m/min</small></span>' +
        '<input type="number" data-id="rVc" step="any" placeholder="\u0158ezn\u00E1 rychl."></label>' +
    '</div>' +
    // Radiusy tlačítka
    '<div class="cnc-table-label">B\u011B\u017En\u00E9 radiusy r\u03B5 <small>mm</small></div>' +
    '<div class="rough-radius-row">' + radiusBtns + '</div>' +
    // Korekční faktory info
    '<div class="cnc-mat-hint" id="roughFactors"></div>' +
    // Přepínač Ra / Rz
    '<div class="rough-mode-row">' +
      '<button class="rough-mode-btn rough-mode-active" data-mode="Ra">Ra</button>' +
      '<button class="rough-mode-btn" data-mode="Rz">Rz</button>' +
    '</div>' +
    // Výsledek
    '<div class="rough-result" id="roughResult">' +
      '<div class="rough-result-hint">Zadejte posuv a radius\u2026</div>' +
    '</div>' +
    // Třída drsnosti
    '<div class="cnc-table-label">T\u0159\u00EDda drsnosti <small>ISO 1302 (Ra \u00B5m)</small></div>' +
    '<div class="rough-class-bar" id="roughClassBar">' + classBar + '</div>' +
    // Zpětný výpočet
    '<div class="rough-reverse">' +
      '<div class="cnc-table-label" style="margin-top:10px" id="roughRevLabel">\u2B05 Zp\u011Btn\u00FD v\u00FDpo\u010Det: max posuv pro danou Ra</div>' +
      '<div class="cnc-fields">' +
        '<label class="cnc-field" id="roughRevFieldLbl"><span>Ra c\u00EDl <small>\u00B5m</small></span>' +
          '<input type="number" data-id="rRaTarget" step="any" placeholder="Po\u017Eadovan\u00E1 Ra"></label>' +
        '<label class="cnc-field"><span>f max <small>mm/ot</small></span>' +
          '<input type="number" data-id="rFmax" readonly tabindex="-1" class="computed"></label>' +
      '</div>' +
    '</div>' +
    // Tlačítka
    '<div class="cnc-actions">' +
      '<button class="cnc-btn cnc-btn-clear">\uD83D\uDDD1 Vy\u010Distit</button>' +
      '<button class="cnc-btn cnc-btn-copy">\uD83D\uDCCB Kop\u00EDrovat</button>' +
    '</div>';

  var overlay = makeOverlay("roughness", "\uD83D\uDD2C Drsnost povrchu", body);
  if (!overlay) return;

  var inpF       = overlay.querySelector('[data-id="rF"]');
  var inpRe      = overlay.querySelector('[data-id="rRe"]');
  var inpVc      = overlay.querySelector('[data-id="rVc"]');
  var selMat     = overlay.querySelector('[data-id="rMat"]');
  var selTool    = overlay.querySelector('[data-id="rTool"]');
  var resultEl   = overlay.querySelector('#roughResult');
  var factorsEl  = overlay.querySelector('#roughFactors');
  var classBarEl = overlay.querySelector('#roughClassBar');
  var inpRaTarget= overlay.querySelector('[data-id="rRaTarget"]');
  var inpFmax    = overlay.querySelector('[data-id="rFmax"]');
  var revLabel   = overlay.querySelector('#roughRevLabel');
  var revFieldLbl= overlay.querySelector('#roughRevFieldLbl');
  var roughMode  = 'Ra'; // aktuální režim: 'Ra' nebo 'Rz'

  // ── Přepínač Ra / Rz ──
  var modeBtns = overlay.querySelectorAll('.rough-mode-btn');
  for (var mi = 0; mi < modeBtns.length; mi++) {
    modeBtns[mi].addEventListener('click', function() {
      roughMode = this.dataset.mode;
      for (var mj = 0; mj < modeBtns.length; mj++) modeBtns[mj].classList.remove('rough-mode-active');
      this.classList.add('rough-mode-active');
      // Aktualizace labelu zpětného výpočtu
      if (roughMode === 'Rz') {
        revLabel.textContent = '\u2B05 Zpětný výpočet: max posuv pro danou Rz';
        revFieldLbl.querySelector('span').innerHTML = 'Rz cíl <small>µm</small>';
        inpRaTarget.placeholder = 'Požadovaná Rz';
      } else {
        revLabel.textContent = '\u2B05 Zpětný výpočet: max posuv pro danou Ra';
        revFieldLbl.querySelector('span').innerHTML = 'Ra cíl <small>µm</small>';
        inpRaTarget.placeholder = 'Požadovaná Ra';
      }
      calc();
    });
  }

  // ── Radius tlačítka ──
  var rBtns = overlay.querySelectorAll('.rough-r-btn');
  for (var bi = 0; bi < rBtns.length; bi++) {
    rBtns[bi].addEventListener('click', function() {
      inpRe.value = this.dataset.r;
      // Zvýraznění aktivního
      for (var j = 0; j < rBtns.length; j++) rBtns[j].classList.remove('tol-g-active');
      this.classList.add('tol-g-active');
      calc();
    });
  }

  // ── Hlavní výpočet ──
  function calc() {
    var f  = inpF.value !== '' ? safeEvalMath(inpF.value) : null;
    var re = inpRe.value !== '' ? safeEvalMath(inpRe.value) : null;
    var vc = inpVc.value !== '' ? safeEvalMath(inpVc.value) : null;
    var kMat  = workMaterials[parseInt(selMat.value)].k;
    var kTool = toolMaterials[parseInt(selTool.value)].k;
    var kVc   = vc !== null && vc > 0 ? getKvc(vc) : 1.0;

    // Zobrazit korekční faktory
    factorsEl.innerHTML =
      '<span>k<sub>mat</sub> = ' + kMat.toFixed(2) + '</span>' +
      '<span>k<sub>tool</sub> = ' + kTool.toFixed(2) + '</span>' +
      '<span>k<sub>Vc</sub> = ' + kVc.toFixed(2) + '</span>' +
      '<span>\u03A3k = ' + (kMat * kTool * kVc).toFixed(2) + '</span>';

    // Zvýraznění třídy resetovat
    var cells = classBarEl.querySelectorAll('.rough-class-cell');
    for (var i = 0; i < cells.length; i++) cells[i].classList.remove('rough-class-active');

    if (f === null || re === null || f <= 0 || re <= 0) {
      resultEl.innerHTML = '<div class="rough-result-hint">Zadejte posuv a radius\u2026</div>';
      return;
    }

    // Teoretická drsnost
    var rz_theo = (f * f) / (8 * re) * 1000; // µm
    var ra_theo = rz_theo / 4;

    // Praktická drsnost
    var kTotal = kMat * kTool * kVc;
    var ra_pract = ra_theo * kTotal;
    var rz_pract = rz_theo * kTotal;

    // Třída drsnosti
    var clsTheo  = getRaClass(ra_theo);
    var clsPract = getRaClass(ra_pract);

    var isRz = roughMode === 'Rz';
    resultEl.innerHTML =
      '<table class="rough-result-tbl">' +
        '<tr><td></td><td class="rough-col-h">Ra <small>\u00B5m</small></td>' +
          '<td class="rough-col-h">Rz <small>\u00B5m</small></td>' +
          '<td class="rough-col-h">T\u0159\u00EDda</td></tr>' +
        '<tr class="rough-row-theo"><td>Teoretick\u00E1</td>' +
          '<td>' + (isRz ? '' : '<strong>') + ra_theo.toFixed(3) + (isRz ? '' : '</strong>') + '</td>' +
          '<td>' + (isRz ? '<strong>' : '') + rz_theo.toFixed(3) + (isRz ? '</strong>' : '') + '</td>' +
          '<td>' + clsTheo + '</td></tr>' +
        '<tr class="rough-row-pract"><td>Praktick\u00E1</td>' +
          '<td>' + (isRz ? '' : '<strong>') + ra_pract.toFixed(3) + (isRz ? '' : '</strong>') + '</td>' +
          '<td>' + (isRz ? '<strong>' : '') + rz_pract.toFixed(3) + (isRz ? '</strong>' : '') + '</td>' +
          '<td>' + clsPract + '</td></tr>' +
      '</table>' +
      '<div class="rough-formula">' + (isRz
        ? 'Rz<sub>theo</sub> = f\u00B2 / (8\u00B7r\u03B5) \u00D7 1000 = ' +
          f.toFixed(3) + '\u00B2 / (8\u00B7' + re.toFixed(2) + ') \u00D7 1000 = <strong>' + rz_theo.toFixed(3) + '</strong> \u00B5m'
        : 'Ra<sub>theo</sub> = f\u00B2 / (32\u00B7r\u03B5) \u00D7 1000 = ' +
          f.toFixed(3) + '\u00B2 / (32\u00B7' + re.toFixed(2) + ') \u00D7 1000 = <strong>' + ra_theo.toFixed(3) + '</strong> \u00B5m'
      ) + '</div>';

    // Zvýraznit praktickou třídu v baru
    for (var i = 0; i < raClasses.length; i++) {
      if (raClasses[i].cls === clsPract) {
        cells[i].classList.add('rough-class-active');
        break;
      }
    }

    // Zpětný výpočet aktualizace pokud je cílová Ra zadaná
    calcReverse();
  }

  // ── Zpětný výpočet ──
  function calcReverse() {
    var raTarget = inpRaTarget.value !== '' ? safeEvalMath(inpRaTarget.value) : null;
    var re       = inpRe.value !== '' ? safeEvalMath(inpRe.value) : null;
    if (raTarget === null || re === null || raTarget <= 0 || re <= 0) {
      inpFmax.value = '';
      return;
    }
    var kMat  = workMaterials[parseInt(selMat.value)].k;
    var kTool = toolMaterials[parseInt(selTool.value)].k;
    var vc    = inpVc.value !== '' ? safeEvalMath(inpVc.value) : null;
    var kVc   = vc !== null && vc > 0 ? getKvc(vc) : 1.0;
    var kTotal = kMat * kTool * kVc;

    // Ra: f = √(Ra * 32 * rε / (1000 * k))   Rz: f = √(Rz * 8 * rε / (1000 * k))
    var divisor = roughMode === 'Rz' ? 8 : 32;
    var fMax = Math.sqrt(raTarget * divisor * re / (1000 * kTotal));
    inpFmax.value = fMax.toFixed(4);
  }

  // ── Event listenery ──
  inpF.addEventListener('input', calc);
  inpRe.addEventListener('input', function() {
    // Reset radio tlačítek
    for (var j = 0; j < rBtns.length; j++) {
      rBtns[j].classList.toggle('tol-g-active', rBtns[j].dataset.r === inpRe.value);
    }
    calc();
  });
  inpVc.addEventListener('input', calc);
  selMat.addEventListener('change', calc);
  selTool.addEventListener('change', calc);
  inpRaTarget.addEventListener('input', calcReverse);

  // ── Vyčistit ──
  overlay.querySelector('.cnc-btn-clear').addEventListener('click', function() {
    inpF.value = ''; inpRe.value = ''; inpVc.value = ''; inpRaTarget.value = ''; inpFmax.value = '';
    selMat.selectedIndex = 0; selTool.selectedIndex = 0;
    roughMode = 'Ra';
    for (var mi = 0; mi < modeBtns.length; mi++) modeBtns[mi].classList.toggle('rough-mode-active', modeBtns[mi].dataset.mode === 'Ra');
    revLabel.textContent = '\u2B05 Zpětný výpočet: max posuv pro danou Ra';
    revFieldLbl.querySelector('span').innerHTML = 'Ra cíl <small>µm</small>';
    inpRaTarget.placeholder = 'Požadovaná Ra';
    for (var j = 0; j < rBtns.length; j++) rBtns[j].classList.remove('tol-g-active');
    resultEl.innerHTML = '<div class="rough-result-hint">Zadejte posuv a radius\u2026</div>';
    factorsEl.innerHTML = '';
    var cells = classBarEl.querySelectorAll('.rough-class-cell');
    for (var i = 0; i < cells.length; i++) cells[i].classList.remove('rough-class-active');
  });

  // ── Kopírovat ──
  overlay.querySelector('.cnc-btn-copy').addEventListener('click', function() {
    var txt = resultEl.textContent;
    if (txt && txt.indexOf('Zadejte') < 0) {
      var parts = ['Drsnost povrchu'];
      if (inpF.value) parts.push('f=' + inpF.value + ' mm/ot');
      if (inpRe.value) parts.push('r\u03B5=' + inpRe.value + ' mm');
      if (inpVc.value) parts.push('Vc=' + inpVc.value + ' m/min');
      parts.push(workMaterials[parseInt(selMat.value)].n);
      parts.push(toolMaterials[parseInt(selTool.value)].n);
      parts.push(txt);
      navigator.clipboard.writeText(parts.join(' | ')).then(function() { showToast("Zkop\u00EDrov\u00E1no"); });
    }
  });

  // Počáteční výpočet faktorů
  calc();
}

// ══════════════════════════════════════════════════════════════
// ► VBD & Držáky – dekodér ISO značení obráběcích plátků
// ══════════════════════════════════════════════════════════════
