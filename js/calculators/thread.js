import { showToast } from '../state.js';
import { safeEvalMath } from '../utils.js';
import { makeOverlay } from '../dialogFactory.js';
import { mCoarse, mFine, gThreads, trThreads, uncThreads, unfThreads, bswThreads, nptThreads, acmeThreads, bsptThreads } from './threadData.js';

export function openThreadCalc() {
  // ── DATA ──────────────────────────────────────────────────

  // ── BUILD ROWS ────────────────────────────────────────────
  function buildMetricRows(arr, prefix) {
    var html = '';
    for (var i = 0; i < arr.length; i++) {
      var t = arr[i];
      var lbl = prefix + t.D + (prefix === 'M' && arr === mFine ? '\u00D7' + t.P : '');
      html += '<tr data-type="' + prefix + '" data-d="' + t.D + '" data-p="' + t.P + '">' +
        '<td>' + lbl + '</td><td>' + t.P + '</td><td>' + t.D + '</td></tr>';
    }
    return html;
  }

  function buildGRows() {
    var html = '';
    for (var i = 0; i < gThreads.length; i++) {
      var g = gThreads[i];
      var P = (25.4 / g.tpi);
      html += '<tr data-type="G" data-d="' + g.D + '" data-p="' + P.toFixed(4) + '" data-tpi="' + g.tpi + '" data-n="' + g.n + '">' +
        '<td>' + g.n + '</td><td>' + g.tpi + '</td><td>' + g.D.toFixed(3) + '</td></tr>';
    }
    return html;
  }

  function buildTrRows() {
    var html = '';
    for (var i = 0; i < trThreads.length; i++) {
      var t = trThreads[i];
      html += '<tr data-type="Tr" data-d="' + t.D + '" data-p="' + t.P + '">' +
        '<td>Tr' + t.D + '\u00D7' + t.P + '</td><td>' + t.P + '</td><td>' + t.D + '</td></tr>';
    }
    return html;
  }

  function buildImperialRows(arr, prefix) {
    var html = '';
    for (var i = 0; i < arr.length; i++) {
      var t = arr[i];
      var P = (25.4 / t.tpi);
      html += '<tr data-type="' + prefix + '" data-d="' + t.D + '" data-p="' + P.toFixed(4) + '" data-tpi="' + t.tpi + '" data-n="' + t.n + '">' +
        '<td>' + prefix + ' ' + t.n + '</td><td>' + t.tpi + '</td><td>' + t.D.toFixed(3) + '</td></tr>';
    }
    return html;
  }

  // ── THREAD PASSES (průchody soustružení závitu) ─────────
  function threadPassesRows(totalDepth, nPasses, infeedType) {
    var html = '';
    var cos30 = 0.866025;
    var sin30 = 0.5;
    var cumDepth = 0;
    for (var i = 1; i <= nPasses; i++) {
      var target = totalDepth * Math.sqrt(i / nPasses);
      var cut = target - cumDepth;
      if (i === nPasses) { target = totalDepth; cut = totalDepth - cumDepth; }
      if (infeedType === 'flank') {
        var xInf = cut * cos30;
        var zOff = cut * sin30;
        html += '<tr class="thr-pass-row"><td style="color:#6c7086">' + i + '.</td>' +
          '<td>ap=' + cut.toFixed(3) + '  X=' + xInf.toFixed(3) + '  Z=' + zOff.toFixed(3) + '  \u2211=' + target.toFixed(3) + ' mm</td></tr>';
      } else if (infeedType === 'modified') {
        var xInf = cut * cos30;
        var zOff = cut * sin30;
        var sign = (i % 2 === 1) ? '+' : '\u2212';
        html += '<tr class="thr-pass-row"><td style="color:#6c7086">' + i + '.</td>' +
          '<td>ap=' + cut.toFixed(3) + '  X=' + xInf.toFixed(3) + '  Z=' + sign + zOff.toFixed(3) + '  \u2211=' + target.toFixed(3) + ' mm</td></tr>';
      } else {
        html += '<tr class="thr-pass-row"><td style="color:#6c7086">' + i + '.</td>' +
          '<td>ap=' + cut.toFixed(3) + '  \u2211=' + target.toFixed(3) + ' mm</td></tr>';
      }
      cumDepth = target;
    }
    html += '<tr class="thr-pass-row"><td style="color:#6c7086">' + (nPasses + 1) + '.</td>' +
      '<td style="color:#a6e3a1">jisk\u0159iv\u00FD (ap=0, spring pass)</td></tr>';
    return html;
  }

  function getMaterial() {
    return selMaterial ? selMaterial.value : 'steel';
  }

  function threadPassesHTML(totalDepth, label, material) {
    if (totalDepth <= 0) return '';
    material = material || 'steel';
    var nPasses;
    if (totalDepth <= 0.5) nPasses = 3;
    else if (totalDepth <= 1.0) nPasses = 5;
    else if (totalDepth <= 1.5) nPasses = 7;
    else if (totalDepth <= 2.0) nPasses = 9;
    else if (totalDepth <= 3.0) nPasses = 11;
    else nPasses = Math.ceil(totalDepth / 0.25);

    var maxFirstCut = 0.15;
    var materialNote = '';
    if (material === 'stainless') {
      nPasses = Math.ceil(nPasses * 1.3);
      maxFirstCut = 0.10;
      materialNote = '<tr><td colspan="2" style="color:#fab387">\u26A0 Nerez: n\u00EDzk\u00E9 ot\u00E1\u010Dky, \u0159ezn\u00FD olej</td></tr>';
    } else if (material === 'aluminum') {
      nPasses = Math.max(2, Math.ceil(nPasses * 0.8));
      maxFirstCut = 0.20;
      materialNote = '<tr><td colspan="2" style="color:#a6e3a1">\uD83D\uDCA1 Hlin\u00EDk: petroleum/IPA</td></tr>';
    } else if (material === 'cast') {
      materialNote = '<tr><td colspan="2" style="color:#89b4fa">\uD83D\uDCA1 Litina: nasucho nebo emulze</td></tr>';
    }
    var firstCut = totalDepth * Math.sqrt(1 / nPasses);
    while (firstCut > maxFirstCut && nPasses < 50) {
      nPasses++;
      firstCut = totalDepth * Math.sqrt(1 / nPasses);
    }

    var vcData = {steel:{vbd:'80\u2013120',hss:'15\u201325'},stainless:{vbd:'40\u201380',hss:'8\u201315'},aluminum:{vbd:'150\u2013300',hss:'30\u201360'},cast:{vbd:'60\u2013100',hss:'12\u201320'}};
    var vc = vcData[material] || vcData.steel;
    var vcHTML = '<tr class="thr-sep"><td colspan="2"></td></tr>' +
      '<tr><td colspan="2" style="color:#cba6f7;font-weight:600">\uD83D\uDD04 \u0158ezn\u00E1 rychlost z\u00E1vitov\u00E1n\u00ED</td></tr>' +
      '<tr><td>VBD (pl\u00E1tky)</td><td>Vc = <strong>' + vc.vbd + '</strong> m/min</td></tr>' +
      '<tr><td>HSS (no\u017Ee)</td><td>Vc = <strong>' + vc.hss + '</strong> m/min</td></tr>';

    var html = '</tbody><tbody class="thr-passes-group" data-depth="' + totalDepth + '" data-npasses="' + nPasses + '">' +
      '<tr class="thr-sep"><td colspan="2"></td></tr>' +
      '<tr><td colspan="2" style="color:#89b4fa;font-weight:600">\uD83D\uDD27 Pr\u016Fchody ' + label + ' (' + nPasses + '\u00D7)</td></tr>' +
      materialNote +
      '<tr><td colspan="2"><div class="tol-toggle-row" style="margin:4px 0">' +
        '<button class="tol-toggle tol-active" data-infeed="radial">Radi\u00E1ln\u00ED</button>' +
        '<button class="tol-toggle" data-infeed="flank">Bo\u010Dn\u00ED 30\u00B0</button>' +
        '<button class="tol-toggle" data-infeed="modified">Mod. bo\u010Dn\u00ED</button>' +
      '</div></td></tr>' +
      threadPassesRows(totalDepth, nPasses, 'radial') +
      vcHTML +
    '</tbody><tbody>';

    return html;
  }

  // ── STANDARD DRILL SIZES (ISO 235) ─────────────────────
  var stdDrills = [1,1.1,1.2,1.3,1.4,1.5,1.6,1.7,1.8,1.9,2,2.1,2.2,2.3,2.4,2.5,2.6,2.7,2.8,2.9,3,3.1,3.2,3.3,3.4,3.5,3.6,3.7,3.8,3.9,4,4.1,4.2,4.5,4.8,5,5.1,5.2,5.3,5.5,5.8,6,6.2,6.5,6.8,7,7.5,8,8.2,8.5,8.8,9,9.5,10,10.2,10.5,10.8,11,11.5,12,12.5,13,13.5,14,14.5,15,15.5,16,16.5,17,17.5,18,18.5,19,19.5,20,20.5,21,21.5,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,42,44,45,46,48,50,52,55,56,58,60,62,63,65,68,70];

  function drillRecommendHTML(D, D1, hInt) {
    // Find closest standard drills to theoretical drill diameter D1
    // Filter: drill must be smaller than D (otherwise no thread)
    var candidates = [];
    for (var i = 0; i < stdDrills.length; i++) {
      if (stdDrills[i] < D) {
        candidates.push({ dia: stdDrills[i], diff: Math.abs(stdDrills[i] - D1) });
      }
    }
    candidates.sort(function(a, b) { return a.diff - b.diff; });
    // Take up to 3 closest, then sort by diameter
    var picked = candidates.slice(0, 3);
    picked.sort(function(a, b) { return a.dia - b.dia; });

    var html = '<tr class="thr-sep"><td colspan="2"></td></tr>' +
      '<tr><td colspan="2" style="color:#89b4fa;font-weight:600">\uD83D\uDD29 Doporu\u010Den\u00E9 vrt\u00E1ky pro p\u0159edvrt\u00E1n\u00ED</td></tr>' +
      '<tr><td style="color:#6c7086">Teoretick\u00E9 D\u2081</td><td>' + D1.toFixed(3) + ' mm</td></tr>';
    if (picked.length === 0) {
      html += '<tr><td colspan="2" style="color:#6c7086">\u017D\u00E1dn\u00FD standardn\u00ED vrt\u00E1k \u2013 pou\u017Eijte \u00D8 ' + D1.toFixed(3) + ' mm</td></tr>';
      return html;
    }
    for (var j = 0; j < picked.length; j++) {
      var dia = picked[j].dia;
      var pct = ((D - dia) / (2 * hInt)) * 100;
      var label = '';
      var style = '';
      if (pct >= 70 && pct <= 80) {
        label = ' \u2713 (doporu\u010Deno)';
        style = 'color:#a6e3a1;font-weight:600';
      } else if (pct > 85) {
        label = ' (t\u011B\u017E\u0161\u00ED \u0159ez\u00E1n\u00ED)';
        style = 'color:#fab387';
      } else {
        style = '';
      }
      html += '<tr><td style="' + style + '">\u00D8 ' + dia.toFixed(1) + ' mm</td>' +
        '<td style="' + style + '">' + pct.toFixed(0) + '% z\u00E1vitu' + label + '</td></tr>';
    }
    return html;
  }

  // ── ISO 965-1 TOLERANCE ─────────────────────────────────
  function calcISO965(D, P, extClass, intClass) {
    var extGrade = parseInt(extClass);
    var extPos = extClass.replace(/\d/g, '');
    var intGrade = parseInt(intClass);
    var gradeK = {3:0.50, 4:0.63, 5:0.80, 6:1.00, 7:1.25, 8:1.60, 9:2.00};
    // Fundamental deviation (µm)
    var es = 0;
    if (extPos === 'g') es = -Math.round(15 + 11 * P);
    else if (extPos === 'e') es = -Math.round(50 + 11 * P);
    var EI = 0; // H position
    // Tolerances at grade 6 (µm)
    var Td2_6 = 90 * Math.pow(P, 0.4) * Math.pow(D, 0.1);
    var Td_6  = 180 * Math.pow(P, 2/3) - 3.15 * Math.sqrt(P);
    if (Td_6 < 1.32 * Td2_6) Td_6 = 1.32 * Td2_6;
    var TD1_6 = P <= 1
      ? 433 * P - 190 * Math.pow(P, 1.22)
      : 230 * Math.pow(P, 0.7);
    var kExt = gradeK[extGrade] || 1;
    var kInt = gradeK[intGrade] || 1;
    var Td2 = Td2_6 * kExt;
    var Td  = Td_6  * kExt;
    var TD2 = Td2_6 * kInt;
    var TD1 = TD1_6 * kInt;
    // Nominal diameters
    var d2  = D - 0.6495 * P;
    var d3  = D - 1.2269 * P;
    var D1  = D - 1.0825 * P;
    // Convert µm → mm
    var es_mm  = es  / 1000;
    var Td2_mm = Td2 / 1000;
    var Td_mm  = Td  / 1000;
    var TD2_mm = TD2 / 1000;
    var TD1_mm = TD1 / 1000;
    return {
      es: es,
      d_max:  D  + es_mm,
      d_min:  D  + es_mm - Td_mm,
      d2_max: d2 + es_mm,
      d2_min: d2 + es_mm - Td2_mm,
      D1_min: D1 + EI / 1000,
      D1_max: D1 + EI / 1000 + TD1_mm,
      D2_min: d2 + EI / 1000,
      D2_max: d2 + EI / 1000 + TD2_mm
    };
  }

  // ── ENGAGEMENT LENGTH (délka záběru závitu) ────────────
  function engagementLengthHTML(D) {
    var steelMin = (0.5 * D).toFixed(1);
    var steelOpt = (0.8 * D).toFixed(1);
    var alMin    = (1.0 * D).toFixed(1);
    var alOpt    = (1.5 * D).toFixed(1);
    var maxUse   = (1.5 * D).toFixed(1);
    return '<tr class="thr-sep"><td colspan="2"></td></tr>' +
      '<tr><td colspan="2" style="color:#89b4fa;font-weight:600">\uD83D\uDD29 D\u00E9lka z\u00E1b\u011Bru z\u00E1vitu</td></tr>' +
      '<tr><td>Ocel min/opt</td><td><strong>' + steelMin + ' / ' + steelOpt + '</strong> mm</td></tr>' +
      '<tr><td>Hlin\u00EDk min/opt</td><td><strong>' + alMin + ' / ' + alOpt + '</strong> mm</td></tr>' +
      '<tr><td>Max u\u017Eite\u010Dn\u00E1</td><td><strong>' + maxUse + '</strong> mm</td></tr>';
  }

  function engagementLengthCopy(D) {
    return '\n\u2500\u2500 D\u00E9lka z\u00E1b\u011Bru \u2500\u2500\n' +
      fmtCopy('Ocel min/opt', (0.5 * D).toFixed(1) + ' / ' + (0.8 * D).toFixed(1) + ' mm') + '\n' +
      fmtCopy('Hlin\u00EDk min/opt', (1.0 * D).toFixed(1) + ' / ' + (1.5 * D).toFixed(1) + ' mm') + '\n' +
      fmtCopy('Max u\u017Eite\u010Dn\u00E1', (1.5 * D).toFixed(1) + ' mm');
  }

  // ── DETAIL FUNCTIONS ──────────────────────────────────────
  function fmtCopy(lbl, val) {
    while (lbl.length < 16) lbl += ' ';
    return '  ' + lbl + '= ' + val;
  }

  function buildDetailTable(title, rows, passesConfig, copyHeader) {
    var html = '<div class="thr-detail-title">' + title + '</div>' +
      '<table class="thr-detail-tbl">';
    var copyText = copyHeader;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.sep) {
        html += '<tr class="thr-sep"><td colspan="2"></td></tr>';
      } else if (r.rawHtml !== undefined) {
        html += r.rawHtml;
        if (r.rawCopy) copyText += r.rawCopy;
      } else {
        html += '<tr><td>' + r.label + '</td><td>' + r.value + '</td></tr>';
        if (r.copyValue !== undefined) {
          copyText += '\n' + fmtCopy(r.copyLabel || r.label, r.copyValue);
        }
      }
    }
    if (passesConfig) {
      for (var j = 0; j < passesConfig.length; j++) {
        html += threadPassesHTML(passesConfig[j].depth, passesConfig[j].label, getMaterial());
      }
    }
    html += '</table>';
    return { html: html, copyText: copyText };
  }

  function detailMetric(D, P, label, extClass, intClass) {
    var H    = 0.866025 * P;
    var d2   = D - 0.6495 * P;
    var d3   = D - 1.2269 * P;
    var D1   = D - 1.0825 * P;
    var drill = D1;
    var hExt = 0.6134 * P;
    var hInt = 0.5413 * P;
    var As   = (Math.PI / 4) * Math.pow((d2 + d3) / 2, 2);
    var tolHTML = '';
    var tolCopy = '';
    if (extClass && intClass) {
      var tol = calcISO965(D, P, extClass, intClass);
      tolHTML = '<tr class="thr-sep"><td colspan="2"></td></tr>' +
        '<tr><td colspan="2" style="color:#89b4fa;font-weight:600">\uD83D\uDCCF Tolerance ' + extClass + '/' + intClass + ' (ISO 965)</td></tr>' +
        '<tr><td>\u0160roub d</td><td>' + D.toFixed(3) + ' \u2192 <strong>' + tol.d_min.toFixed(3) + ' \u2026 ' + tol.d_max.toFixed(3) + '</strong> mm</td></tr>' +
        '<tr><td>\u0160roub d\u2082</td><td>' + d2.toFixed(3) + ' \u2192 <strong>' + tol.d2_min.toFixed(3) + ' \u2026 ' + tol.d2_max.toFixed(3) + '</strong> mm</td></tr>' +
        '<tr><td>Matice D\u2081</td><td>' + D1.toFixed(3) + ' \u2192 <strong>' + tol.D1_min.toFixed(3) + ' \u2026 ' + tol.D1_max.toFixed(3) + '</strong> mm</td></tr>' +
        '<tr><td>Matice D\u2082</td><td>' + d2.toFixed(3) + ' \u2192 <strong>' + tol.D2_min.toFixed(3) + ' \u2026 ' + tol.D2_max.toFixed(3) + '</strong> mm</td></tr>';
      tolCopy = '\n\u2500\u2500 Tolerance ' + extClass + '/' + intClass + ' \u2500\u2500\n' +
        fmtCopy('\u0160roub d', tol.d_min.toFixed(3) + ' \u2026 ' + tol.d_max.toFixed(3) + ' mm') + '\n' +
        fmtCopy('\u0160roub d\u2082', tol.d2_min.toFixed(3) + ' \u2026 ' + tol.d2_max.toFixed(3) + ' mm') + '\n' +
        fmtCopy('Matice D\u2081', tol.D1_min.toFixed(3) + ' \u2026 ' + tol.D1_max.toFixed(3) + ' mm') + '\n' +
        fmtCopy('Matice D\u2082', tol.D2_min.toFixed(3) + ' \u2026 ' + tol.D2_max.toFixed(3) + ' mm');
    }
    return buildDetailTable(label, [
      {label: 'Stoup\u00E1n\u00ED P', value: '<strong>' + P + '</strong> mm', copyValue: P.toFixed(3) + ' mm'},
      {label: 'Vrcholov\u00FD \u00FAhel', value: '<strong>60\u00B0</strong>'},
      {label: 'V\u00FD\u0161ka troj. H', value: H.toFixed(3) + ' mm'},
      {sep: true},
      {label: 'Vn\u011Bj\u0161\u00ED \u00F8 D', value: '<strong>' + D.toFixed(3) + '</strong> mm', copyLabel: 'Vn\u011Bj\u0161\u00ED \u00D8 D', copyValue: D.toFixed(3) + ' mm'},
      {label: 'St\u0159edn\u00ED \u00F8 d\u2082', value: '<strong>' + d2.toFixed(3) + '</strong> mm', copyLabel: 'St\u0159edn\u00ED \u00D8 d\u2082', copyValue: d2.toFixed(3) + ' mm'},
      {label: 'Mal\u00FD \u00F8 \u0161roub d\u2083', value: '<strong>' + d3.toFixed(3) + '</strong> mm', copyLabel: 'Mal\u00FD \u00D8 \u0161roub d\u2083', copyValue: d3.toFixed(3) + ' mm'},
      {label: 'Mal\u00FD \u00F8 matice D\u2081', value: '<strong>' + D1.toFixed(3) + '</strong> mm', copyLabel: 'Mal\u00FD \u00D8 matice D\u2081', copyValue: D1.toFixed(3) + ' mm'},
      {sep: true},
      {label: 'Hloubka vn\u011Bj\u0161\u00ED', value: '<strong>' + hExt.toFixed(3) + '</strong> mm', copyValue: hExt.toFixed(3) + ' mm'},
      {label: 'Hloubka vnit\u0159n\u00ED', value: '<strong>' + hInt.toFixed(3) + '</strong> mm', copyValue: hInt.toFixed(3) + ' mm'},
      {label: 'Ta\u017En\u00FD pr\u016F\u0159ez A\u209B', value: '<strong>' + As.toFixed(2) + '</strong> mm\u00B2', copyValue: As.toFixed(2) + ' mm\u00B2'},
      {sep: true},
      {label: 'P\u0159edvrt\u00E1n\u00ED', value: '<strong>' + drill.toFixed(1) + '</strong> mm', copyLabel: 'P\u0159edvrt\u00E1n\u00ED', copyValue: drill.toFixed(1) + ' mm'},
      {rawHtml: tolHTML, rawCopy: tolCopy},
      {rawHtml: drillRecommendHTML(D, D1, hInt)},
      {rawHtml: engagementLengthHTML(D), rawCopy: engagementLengthCopy(D)}
    ], [
      {depth: hExt, label: 'vn\u011Bj\u0161\u00ED'},
      {depth: hInt, label: 'vnit\u0159n\u00ED'}
    ], label + ' (ISO 261, 60\u00B0)');
  }

  function detailG(D, P, tpi, name) {
    var H    = 0.960491 * P;
    var d2   = D - 0.6403 * P;
    var d1   = D - 1.2806 * P;
    var hExt = 0.6403 * P;
    var drill = d1;
    return buildDetailTable(name + ' \u2013 ISO 228', [
      {label: 'Z\u00E1vit\u016F/palec (TPI)', value: '<strong>' + tpi + '</strong>', copyLabel: 'TPI', copyValue: tpi},
      {label: 'Stoup\u00E1n\u00ED P', value: '<strong>' + P.toFixed(4) + '</strong> mm', copyValue: P.toFixed(4) + ' mm'},
      {label: 'Vrcholov\u00FD \u00FAhel', value: '<strong>55\u00B0</strong>'},
      {label: 'V\u00FD\u0161ka troj. H', value: H.toFixed(3) + ' mm'},
      {sep: true},
      {label: 'Vn\u011Bj\u0161\u00ED \u00F8 D', value: '<strong>' + D.toFixed(3) + '</strong> mm', copyLabel: 'Vn\u011Bj\u0161\u00ED \u00D8 D', copyValue: D.toFixed(3) + ' mm'},
      {label: 'St\u0159edn\u00ED \u00F8 d\u2082', value: '<strong>' + d2.toFixed(3) + '</strong> mm', copyLabel: 'St\u0159edn\u00ED \u00D8 d\u2082', copyValue: d2.toFixed(3) + ' mm'},
      {label: 'Mal\u00FD \u00F8 d\u2081', value: '<strong>' + d1.toFixed(3) + '</strong> mm', copyLabel: 'Mal\u00FD \u00D8 d\u2081', copyValue: d1.toFixed(3) + ' mm'},
      {sep: true},
      {label: 'Hloubka profilu', value: '<strong>' + hExt.toFixed(3) + '</strong> mm', copyValue: hExt.toFixed(3) + ' mm'},
      {sep: true},
      {label: 'P\u0159edvrtan\u00ED', value: '<strong>' + drill.toFixed(3) + '</strong> mm', copyLabel: 'P\u0159edvrt\u00E1n\u00ED', copyValue: drill.toFixed(3) + ' mm'},
    ], [
      {depth: hExt, label: 'profil'}
    ], name + ' (ISO 228, 55\u00B0)');
  }

  function detailTr(D, P, label, starts) {
    starts = starts || 1;
    var H1   = 0.5 * P;
    var ac   = 0.25;
    var d2   = D - 0.5 * P;
    var d3   = D - P - 2 * ac;
    var D4   = D - 2 * ac;
    var D1   = D - P;
    var hExt = H1 + ac;
    var drill = D - P - 0.5;
    var lead  = P * starts;
    var lambda = Math.atan(lead / (Math.PI * d2)) * (180 / Math.PI);
    var startsNote = starts === 1 ? ' <span style="color:#6c7086">(jednochod\u00FD)</span>' : '';
    var leadLabel  = starts === 1 ? P.toFixed(3) : lead.toFixed(3);
    return buildDetailTable(label + ' \u2013 ISO 2904', [
      {label: 'Stoup\u00E1n\u00ED P', value: '<strong>' + P + '</strong> mm', copyValue: P + ' mm'},
      {label: 'Vrcholov\u00FD \u00FAhel', value: '<strong>30\u00B0</strong>'},
      {label: 'V\u00FD\u0161ka profilu H\u2081', value: H1.toFixed(3) + ' mm'},
      {sep: true},
      {label: 'Po\u010Det chod\u016F', value: '<strong>' + starts + '</strong>' + startsNote, copyValue: starts + (starts === 1 ? ' (jednochod\u00FD)' : '')},
      {label: 'Lead (zdvih)', value: '<strong>' + leadLabel + '</strong> mm', copyValue: leadLabel + ' mm'},
      {label: '\u00DAhel stoup\u00E1n\u00ED \u03BB', value: '<strong>' + lambda.toFixed(2) + '\u00B0</strong>', copyLabel: '\u00DAhel stoup. \u03BB', copyValue: lambda.toFixed(2) + '\u00B0'},
      {sep: true},
      {label: 'Vn\u011Bj\u0161\u00ED \u00F8 D', value: '<strong>' + D.toFixed(3) + '</strong> mm', copyLabel: 'Vn\u011Bj\u0161\u00ED \u00D8 D', copyValue: D.toFixed(3) + ' mm'},
      {label: 'St\u0159edn\u00ED \u00F8 d\u2082', value: '<strong>' + d2.toFixed(3) + '</strong> mm', copyLabel: 'St\u0159edn\u00ED \u00D8 d\u2082', copyValue: d2.toFixed(3) + ' mm'},
      {label: 'Mal\u00FD \u00F8 \u0161roub d\u2083', value: '<strong>' + d3.toFixed(3) + '</strong> mm', copyLabel: 'Mal\u00FD \u00D8 \u0161roub d\u2083', copyValue: d3.toFixed(3) + ' mm'},
      {label: 'Vn\u011Bj\u0161\u00ED \u00F8 matice D\u2084', value: '<strong>' + D4.toFixed(3) + '</strong> mm', copyLabel: 'Vn\u011Bj. \u00D8 mat. D\u2084', copyValue: D4.toFixed(3) + ' mm'},
      {label: 'Vnit\u0159n\u00ED \u00F8 matice D\u2081', value: '<strong>' + D1.toFixed(3) + '</strong> mm', copyLabel: 'Vnit\u0159. \u00D8 mat. D\u2081', copyValue: D1.toFixed(3) + ' mm'},
      {sep: true},
      {label: 'Hloubka profilu', value: '<strong>' + hExt.toFixed(3) + '</strong> mm', copyValue: hExt.toFixed(3) + ' mm'},
      {sep: true},
      {label: 'P\u0159edvrtan\u00ED (\u0161roub)', value: '<strong>' + d3.toFixed(2) + '</strong> mm', copyLabel: 'P\u0159edvrt. \u0161roub', copyValue: d3.toFixed(2) + ' mm'},
      {label: 'P\u0159edvrtan\u00ED (matice)', value: '<strong>' + D1.toFixed(2) + '</strong> mm', copyLabel: 'P\u0159edvrt. matice', copyValue: D1.toFixed(2) + ' mm'},
    ], [
      {depth: hExt, label: 'profil'}
    ], label + ' (ISO 2904, 30\u00B0)');
  }

  // UNC/UNF – 60° profil, stejné vzorce jako metrický
  function detailUN(D, P, tpi, name, std) {
    var H    = 0.866025 * P;
    var d2   = D - 0.6495 * P;
    var d3   = D - 1.2269 * P;
    var D1   = D - 1.0825 * P;
    var drill = D1;
    var hExt = 0.6134 * P;
    var hInt = 0.5413 * P;
    var As   = (Math.PI / 4) * Math.pow((d2 + d3) / 2, 2);
    return buildDetailTable(name + ' \u2013 ' + std, [
      {label: 'Z\u00E1vit\u016F/palec (TPI)', value: '<strong>' + tpi + '</strong>', copyLabel: 'TPI', copyValue: tpi},
      {label: 'Stoup\u00E1n\u00ED P', value: '<strong>' + P.toFixed(4) + '</strong> mm', copyValue: P.toFixed(4) + ' mm'},
      {label: 'Vrcholov\u00FD \u00FAhel', value: '<strong>60\u00B0</strong>'},
      {label: 'V\u00FD\u0161ka troj. H', value: H.toFixed(3) + ' mm'},
      {sep: true},
      {label: 'Vn\u011Bj\u0161\u00ED \u00F8 D', value: '<strong>' + D.toFixed(3) + '</strong> mm', copyLabel: 'Vn\u011Bj\u0161\u00ED \u00D8 D', copyValue: D.toFixed(3) + ' mm'},
      {label: 'St\u0159edn\u00ED \u00F8 d\u2082', value: '<strong>' + d2.toFixed(3) + '</strong> mm', copyLabel: 'St\u0159edn\u00ED \u00D8 d\u2082', copyValue: d2.toFixed(3) + ' mm'},
      {label: 'Mal\u00FD \u00F8 \u0161roub d\u2083', value: '<strong>' + d3.toFixed(3) + '</strong> mm', copyLabel: 'Mal\u00FD \u00D8 \u0161roub d\u2083', copyValue: d3.toFixed(3) + ' mm'},
      {label: 'Mal\u00FD \u00F8 matice D\u2081', value: '<strong>' + D1.toFixed(3) + '</strong> mm', copyLabel: 'Mal\u00FD \u00D8 matice D\u2081', copyValue: D1.toFixed(3) + ' mm'},
      {sep: true},
      {label: 'Hloubka vn\u011Bj\u0161\u00ED', value: '<strong>' + hExt.toFixed(3) + '</strong> mm', copyValue: hExt.toFixed(3) + ' mm'},
      {label: 'Hloubka vnit\u0159n\u00ED', value: '<strong>' + hInt.toFixed(3) + '</strong> mm', copyValue: hInt.toFixed(3) + ' mm'},
      {label: 'Ta\u017En\u00FD pr\u016F\u0159ez A\u209B', value: '<strong>' + As.toFixed(2) + '</strong> mm\u00B2', copyValue: As.toFixed(2) + ' mm\u00B2'},
      {sep: true},
      {label: 'P\u0159edvrt\u00E1n\u00ED', value: '<strong>' + drill.toFixed(1) + '</strong> mm', copyLabel: 'P\u0159edvrt\u00E1n\u00ED', copyValue: drill.toFixed(1) + ' mm'},
      {rawHtml: drillRecommendHTML(D, D1, hInt)},
      {rawHtml: engagementLengthHTML(D), rawCopy: engagementLengthCopy(D)}
    ], [
      {depth: hExt, label: 'vn\u011Bj\u0161\u00ED'},
      {depth: hInt, label: 'vnit\u0159n\u00ED'}
    ], name + ' (' + std + ', 60\u00B0)');
  }

  // BSW – Whitworth 55° profil
  function detailBSW(D, P, tpi, name) {
    var H    = 0.960491 * P;
    var d2   = D - 0.6403 * P;
    var d1   = D - 1.2806 * P;
    var hExt = 0.6403 * P;
    var drill = d1;
    return buildDetailTable(name + ' \u2013 BS 84 (Whitworth)', [
      {label: 'Z\u00E1vit\u016F/palec (TPI)', value: '<strong>' + tpi + '</strong>', copyLabel: 'TPI', copyValue: tpi},
      {label: 'Stoup\u00E1n\u00ED P', value: '<strong>' + P.toFixed(4) + '</strong> mm', copyValue: P.toFixed(4) + ' mm'},
      {label: 'Vrcholov\u00FD \u00FAhel', value: '<strong>55\u00B0</strong>'},
      {label: 'V\u00FD\u0161ka troj. H', value: H.toFixed(3) + ' mm'},
      {sep: true},
      {label: 'Vn\u011Bj\u0161\u00ED \u00F8 D', value: '<strong>' + D.toFixed(3) + '</strong> mm', copyLabel: 'Vn\u011Bj\u0161\u00ED \u00D8 D', copyValue: D.toFixed(3) + ' mm'},
      {label: 'St\u0159edn\u00ED \u00F8 d\u2082', value: '<strong>' + d2.toFixed(3) + '</strong> mm', copyLabel: 'St\u0159edn\u00ED \u00D8 d\u2082', copyValue: d2.toFixed(3) + ' mm'},
      {label: 'Mal\u00FD \u00F8 d\u2081', value: '<strong>' + d1.toFixed(3) + '</strong> mm', copyLabel: 'Mal\u00FD \u00D8 d\u2081', copyValue: d1.toFixed(3) + ' mm'},
      {sep: true},
      {label: 'Hloubka profilu', value: '<strong>' + hExt.toFixed(3) + '</strong> mm', copyValue: hExt.toFixed(3) + ' mm'},
      {sep: true},
      {label: 'P\u0159edvrtan\u00ED', value: '<strong>' + drill.toFixed(3) + '</strong> mm', copyLabel: 'P\u0159edvrt\u00E1n\u00ED', copyValue: drill.toFixed(3) + ' mm'},
    ], [
      {depth: hExt, label: 'profil'}
    ], name + ' (BS 84 Whitworth, 55\u00B0)');
  }

  // BSPT (R) – 55° profil, kuželový 1:16
  function detailBSPT(D, P, tpi, name) {
    var H    = 0.960491 * P;
    var d2   = D - 0.6403 * P;
    var d1   = D - 1.2806 * P;
    var hExt = 0.6403 * P;
    var drill = d1;
    var taperAngle = '1\u00B047\u203224"';
    var taperRate = '1:16 (6,25 %)';
    return buildDetailTable(name + ' \u2013 ISO 7 / DIN 2999', [
      {label: 'Z\u00E1vit\u016F/palec (TPI)', value: '<strong>' + tpi + '</strong>', copyLabel: 'TPI', copyValue: tpi},
      {label: 'Stoup\u00E1n\u00ED P', value: '<strong>' + P.toFixed(4) + '</strong> mm', copyValue: P.toFixed(4) + ' mm'},
      {label: 'Vrcholov\u00FD \u00FAhel', value: '<strong>55\u00B0</strong>'},
      {label: 'V\u00FD\u0161ka troj. H', value: H.toFixed(3) + ' mm'},
      {sep: true},
      {label: '\u26A0 Ku\u017Eelovitost', value: '<strong>' + taperRate + '</strong>', copyLabel: 'Ku\u017Eelovitost', copyValue: taperRate},
      {label: '\u00DAhel ku\u017Eele', value: '<strong>' + taperAngle + '</strong>'},
      {label: 'Pozn.', value: 'T\u011Bsn\u00ED z\u00E1vitem, vnit\u0159n\u00ED z\u00E1vit (Rp) je v\u00E1lcov\u00FD.', copyValue: 'T\u011Bsn\u00ED z\u00E1vitem, Rp v\u00E1lcov\u00FD'},
      {sep: true},
      {label: 'Vn\u011Bj\u0161\u00ED \u00F8 D', value: '<strong>' + D.toFixed(3) + '</strong> mm', copyLabel: 'Vn\u011Bj\u0161\u00ED \u00D8 D', copyValue: D.toFixed(3) + ' mm'},
      {label: 'St\u0159edn\u00ED \u00F8 d\u2082', value: '<strong>' + d2.toFixed(3) + '</strong> mm', copyLabel: 'St\u0159edn\u00ED \u00D8 d\u2082', copyValue: d2.toFixed(3) + ' mm'},
      {label: 'Mal\u00FD \u00F8 d\u2081', value: '<strong>' + d1.toFixed(3) + '</strong> mm', copyLabel: 'Mal\u00FD \u00D8 d\u2081', copyValue: d1.toFixed(3) + ' mm'},
      {sep: true},
      {label: 'Hloubka profilu', value: '<strong>' + hExt.toFixed(3) + '</strong> mm', copyValue: hExt.toFixed(3) + ' mm'},
      {sep: true},
      {label: 'P\u0159edvrt\u00E1n\u00ED', value: '<strong>' + drill.toFixed(1) + '</strong> mm', copyLabel: 'P\u0159edvrt\u00E1n\u00ED', copyValue: drill.toFixed(1) + ' mm'},
    ], [
      {depth: hExt, label: 'profil'}
    ], name + ' (ISO 7 / DIN 2999, 55\u00B0, ku\u017Eel 1:16)');
  }

  // NPT – 60° profil, kuželový 1:16
  function detailNPT(D, P, tpi, name) {
    var H    = 0.866025 * P;
    var d2   = D - 0.6495 * P;
    var d3   = D - 1.2269 * P;
    var hExt = 0.6134 * P;
    var taperAngle = '1\u00B047\u203224"';
    var taperRate = '1:16 (6,25 %)';
    return buildDetailTable(name + ' \u2013 ASME B1.20.1', [
      {label: 'Z\u00E1vit\u016F/palec (TPI)', value: '<strong>' + tpi + '</strong>', copyLabel: 'TPI', copyValue: tpi},
      {label: 'Stoup\u00E1n\u00ED P', value: '<strong>' + P.toFixed(4) + '</strong> mm', copyValue: P.toFixed(4) + ' mm'},
      {label: 'Vrcholov\u00FD \u00FAhel', value: '<strong>60\u00B0</strong>'},
      {label: 'V\u00FD\u0161ka troj. H', value: H.toFixed(3) + ' mm'},
      {sep: true},
      {label: '\u26A0 Ku\u017Eelovitost', value: '<strong>' + taperRate + '</strong>', copyLabel: 'Ku\u017Eelovitost', copyValue: taperRate},
      {label: '\u00DAhel ku\u017Eele', value: '<strong>' + taperAngle + '</strong>'},
      {sep: true},
      {label: 'Vn\u011Bj\u0161\u00ED \u00F8 D', value: '<strong>' + D.toFixed(3) + '</strong> mm', copyLabel: 'Vn\u011Bj\u0161\u00ED \u00D8 D', copyValue: D.toFixed(3) + ' mm'},
      {label: 'St\u0159edn\u00ED \u00F8 d\u2082', value: '<strong>' + d2.toFixed(3) + '</strong> mm', copyLabel: 'St\u0159edn\u00ED \u00D8 d\u2082', copyValue: d2.toFixed(3) + ' mm'},
      {label: 'Mal\u00FD \u00F8 d\u2083', value: '<strong>' + d3.toFixed(3) + '</strong> mm', copyLabel: 'Mal\u00FD \u00D8 d\u2083', copyValue: d3.toFixed(3) + ' mm'},
      {sep: true},
      {label: 'Hloubka profilu', value: '<strong>' + hExt.toFixed(3) + '</strong> mm', copyValue: hExt.toFixed(3) + ' mm'},
    ], [
      {depth: hExt, label: 'profil'}
    ], name + ' (ASME B1.20.1, 60\u00B0, ku\u017Eel 1:16)');
  }

  // Acme – 29° profil
  function detailAcme(D, P, tpi, name, starts) {
    starts = starts || 1;
    var H1   = 0.5 * P;
    var ac   = 0.25;
    var d2   = D - 0.5 * P;
    var d3   = D - P - 2 * ac;
    var D1   = D - P;
    var hExt = H1 + ac;
    var lead  = P * starts;
    var lambda = Math.atan(lead / (Math.PI * d2)) * (180 / Math.PI);
    var startsNote = starts === 1 ? ' <span style="color:#6c7086">(jednochod\u00FD)</span>' : '';
    var leadLabel  = starts === 1 ? P.toFixed(4) : lead.toFixed(4);
    return buildDetailTable(name + ' \u2013 ASME B1.5 (Acme)', [
      {label: 'Z\u00E1vit\u016F/palec (TPI)', value: '<strong>' + tpi + '</strong>', copyLabel: 'TPI', copyValue: tpi},
      {label: 'Stoup\u00E1n\u00ED P', value: '<strong>' + P.toFixed(4) + '</strong> mm', copyValue: P.toFixed(4) + ' mm'},
      {label: 'Vrcholov\u00FD \u00FAhel', value: '<strong>29\u00B0</strong>'},
      {label: 'V\u00FD\u0161ka profilu H\u2081', value: H1.toFixed(3) + ' mm'},
      {sep: true},
      {label: 'Po\u010Det chod\u016F', value: '<strong>' + starts + '</strong>' + startsNote, copyValue: starts + (starts === 1 ? ' (jednochod\u00FD)' : '')},
      {label: 'Lead (zdvih)', value: '<strong>' + leadLabel + '</strong> mm', copyValue: leadLabel + ' mm'},
      {label: '\u00DAhel stoup\u00E1n\u00ED \u03BB', value: '<strong>' + lambda.toFixed(2) + '\u00B0</strong>', copyLabel: '\u00DAhel stoup. \u03BB', copyValue: lambda.toFixed(2) + '\u00B0'},
      {sep: true},
      {label: 'Vn\u011Bj\u0161\u00ED \u00F8 D', value: '<strong>' + D.toFixed(3) + '</strong> mm', copyLabel: 'Vn\u011Bj\u0161\u00ED \u00D8 D', copyValue: D.toFixed(3) + ' mm'},
      {label: 'St\u0159edn\u00ED \u00F8 d\u2082', value: '<strong>' + d2.toFixed(3) + '</strong> mm', copyLabel: 'St\u0159edn\u00ED \u00D8 d\u2082', copyValue: d2.toFixed(3) + ' mm'},
      {label: 'Mal\u00FD \u00F8 d\u2083', value: '<strong>' + d3.toFixed(3) + '</strong> mm', copyLabel: 'Mal\u00FD \u00D8 d\u2083', copyValue: d3.toFixed(3) + ' mm'},
      {label: 'Vnit\u0159n\u00ED \u00F8 matice D\u2081', value: '<strong>' + D1.toFixed(3) + '</strong> mm', copyLabel: 'Vnit\u0159. \u00D8 mat. D\u2081', copyValue: D1.toFixed(3) + ' mm'},
      {sep: true},
      {label: 'Hloubka profilu', value: '<strong>' + hExt.toFixed(3) + '</strong> mm', copyValue: hExt.toFixed(3) + ' mm'},
      {sep: true},
      {label: 'P\u0159edvrtan\u00ED (\u0161roub)', value: '<strong>' + d3.toFixed(2) + '</strong> mm', copyLabel: 'P\u0159edvrt. \u0161roub', copyValue: d3.toFixed(2) + ' mm'},
      {label: 'P\u0159edvrtan\u00ED (matice)', value: '<strong>' + D1.toFixed(2) + '</strong> mm', copyLabel: 'P\u0159edvrt. matice', copyValue: D1.toFixed(2) + ' mm'},
    ], [
      {depth: hExt, label: 'profil'}
    ], name + ' (ASME B1.5 Acme, 29\u00B0)');
  }

  // ── HEADERS per type ──
  var headerM   = '<tr><th>Z\u00E1vit</th><th>P <small>mm</small></th><th>D <small>mm</small></th></tr>';
  var headerTPI = '<tr><th>Z\u00E1vit</th><th>TPI</th><th>D <small>mm</small></th></tr>';
  var headerTr  = '<tr><th>Z\u00E1vit</th><th>P <small>mm</small></th><th>D <small>mm</small></th></tr>';

  // ── THREAD HELP ──
  var helpHTML =
    '<div class="thr-help-section">' +
      '<div class="thr-help-title">\uD83D\uDCD6 P\u0159ehled typ\u016F z\u00E1vit\u016F</div>' +

      '<div class="thr-help-group">' +
        '<div class="thr-help-cat">\u2500\u2500 METRICK\u00C9 Z\u00C1VITY \u2500\u2500</div>' +
        '<div class="thr-help-item"><strong>M hrub\u00E9</strong> \u2013 ISO 261 / DIN 13<br>' +
          '\u00DAhel profilu 60\u00B0. Nejroz\u0161\u00ED\u0159en\u011Bj\u0161\u00ED z\u00E1vit v Evrop\u011B. ' +
          'Ozna\u010Den\u00ED: M12 (pr\u016Fm\u011Br \u00D7 hrub\u00E9 stoup\u00E1n\u00ED). ' +
          'Pou\u017Eit\u00ED: \u0161rouby, matice, v\u0161eobecn\u00E9 stroj\u00EDrenstv\u00ED.</div>' +
        '<div class="thr-help-item"><strong>M jemn\u00E9</strong> \u2013 ISO 261 / DIN 13<br>' +
          '\u00DAhel 60\u00B0, men\u0161\u00ED stoup\u00E1n\u00ED ne\u017E hrub\u00E9. ' +
          'Ozna\u010Den\u00ED: M12\u00D71.25. ' +
          'V\u00FDhody: v\u011Bt\u0161\u00ED p\u0159edp\u011Bt\u00ED, lep\u0161\u00ED t\u011Bsnost, men\u0161\u00ED tendence k samovoln\u00E9mu povolen\u00ED. ' +
          'Pou\u017Eit\u00ED: automobilov\u00FD pr\u016Fmysl, p\u0159esn\u00E9 stav\u011B\u010D\u00ED \u0161rouby, tenkost\u011Bnn\u00E9 d\u00EDly.</div>' +
        '<div class="thr-help-item"><strong>Tr trap\u00E9zov\u00FD</strong> \u2013 ISO 2904 / DIN 103<br>' +
          '\u00DAhel 30\u00B0, lichob\u011B\u017En\u00EDkov\u00FD profil. Ozna\u010Den\u00ED: Tr20\u00D74. ' +
          'Ur\u010Den pro p\u0159enos pohybu a s\u00EDly. ' +
          'Pou\u017Eit\u00ED: vod\u00EDc\u00ED \u0161rouby soustruh\u016F, lisy, sv\u011Br\u00E1ky, stav\u011B\u010D\u00ED mechanismy.</div>' +
      '</div>' +

      '<div class="thr-help-group">' +
        '<div class="thr-help-cat">\u2500\u2500 TRUBKOV\u00C9 Z\u00C1VITY \u2500\u2500</div>' +
        '<div class="thr-help-item"><strong>G (BSP) v\u00E1lcov\u00FD</strong> \u2013 ISO 228 / DIN 259<br>' +
          '\u00DAhel 55\u00B0 (Whitworthov profil). Vn\u011Bj\u0161\u00ED \u00F8 neodpov\u00EDd\u00E1 jmenovit\u00E9 velikosti\u00A0\u2013 ' +
          'nap\u0159. G 1/2 m\u00E1 D\u00A0=\u00A020,955\u00A0mm. ' +
          'Pou\u017Eit\u00ED: t\u011Bsn\u011Bn\u00E9 spoje s O-krou\u017Ekem, hydraulika, pneumatika. ' +
          'T\u011Bsn\u00ED: p\u0159\u00EDtla\u010Dn\u00FD povrch nebo O-krou\u017Eek (ne z\u00E1vitem).</div>' +
        '<div class="thr-help-item"><strong>BSPT (R) ku\u017Eelov\u00FD</strong> \u2013 ISO 7 / DIN 2999<br>' +
          '\u00DAhel 55\u00B0 (Whitworthov profil), ku\u017Eelovitost 1:16 (1\u00B047\u203224"). ' +
          'Vn\u011Bj\u0161\u00ED z\u00E1vit (R) je ku\u017Eelov\u00FD, vnit\u0159n\u00ED (Rp) je v\u00E1lcov\u00FD. ' +
          'T\u011Bsn\u00ED se z\u00E1vitem. ' +
          'Pou\u017Eit\u00ED: potrub\u00ED, plynov\u00E9 rozvody, hydraulika (Evropa, Asie). ' +
          '<em>Kompatibiln\u00ED s G vnit\u0159n\u00EDm z\u00E1vitem (Rp).</em></div>' +
        '<div class="thr-help-item"><strong>NPT ku\u017Eelov\u00FD</strong> \u2013 ASME B1.20.1<br>' +
          '\u00DAhel 60\u00B0, ku\u017Eelovitost 1:16 (1\u00B047\u203224"). Am. standard. ' +
          'T\u011Bsn\u00ED se s\u00E1m z\u00E1vitem p\u0159i dota\u017Een\u00ED (+ teflon p\u00E1ska). ' +
          'Pou\u017Eit\u00ED: potrub\u00ED, plynov\u00E9 rozvody, hydraulika (USA). ' +
          '<em>Pozor: nepou\u017E\u00EDvat s G z\u00E1vitem \u2013 nejsou kompatibiln\u00ED!</em></div>' +
      '</div>' +

      '<div class="thr-help-group">' +
        '<div class="thr-help-cat">\u2500\u2500 PALCOV\u00C9 Z\u00C1VITY \u2500\u2500</div>' +
        '<div class="thr-help-item"><strong>UNC (Unified Coarse)</strong> \u2013 ASME B1.1<br>' +
          '\u00DAhel 60\u00B0, hrub\u00E9 stoup\u00E1n\u00ED. Americk\u00FD/kanadsk\u00FD standard. ' +
          'Ozna\u010Den\u00ED: 1/4"-20 UNC (pr\u016Fm\u011Br-TPI). ' +
          'Ekvivalent ISO metrick\u00E9ho hrub\u00E9ho z\u00E1vitu. ' +
          'Pou\u017Eit\u00ED: v\u0161eobecn\u00E9 strojn\u00ED spoje v USA.</div>' +
        '<div class="thr-help-item"><strong>UNF (Unified Fine)</strong> \u2013 ASME B1.1<br>' +
          '\u00DAhel 60\u00B0, jemn\u00E9 stoup\u00E1n\u00ED. ' +
          'Ozna\u010Den\u00ED: 1/4"-28 UNF. ' +
          'V\u011Bt\u0161\u00ED tahov\u00E1 pevnost ne\u017E UNC p\u0159i stejn\u00E9m \u00F8. ' +
          'Pou\u017Eit\u00ED: leteck\u00FD pr\u016Fmysl, automobilov\u00FD pr\u016Fmysl, p\u0159esn\u00E9 spoje.</div>' +
        '<div class="thr-help-item"><strong>BSW (Whitworth)</strong> \u2013 BS 84<br>' +
          '\u00DAhel 55\u00B0, zaoblen\u00FD vrch i \u00FAdol\u00ED profilu. Britsk\u00FD standard (hist.). ' +
          'Ozna\u010Den\u00ED: 1/2" BSW (pr\u016Fm\u011Br). ' +
          'Dnes nahrazen UNC/ISO, ale st\u00E1le se vyskytuje na star\u0161\u00EDch stroj\u00EDch. ' +
          'Pou\u017Eit\u00ED: \u00FAdr\u017Eba star\u00FDch stroj\u016F, GB stroje, n\u011Bkter\u00E9 australsk\u00E9 normy.</div>' +
      '</div>' +

      '<div class="thr-help-group">' +
        '<div class="thr-help-cat">\u2500\u2500 POHYBOV\u00C9 Z\u00C1VITY \u2500\u2500</div>' +
        '<div class="thr-help-item"><strong>Acme (pilov\u00FD)</strong> \u2013 ASME B1.5<br>' +
          '\u00DAhel 29\u00B0, lichob\u011B\u017En\u00EDkov\u00FD profil. Americk\u00FD ekvivalent Tr z\u00E1vitu. ' +
          'Ozna\u010Den\u00ED: 1"-5 Acme. ' +
          'Jednodu\u0161\u0161\u00ED v\u00FDroba ne\u017E \u010Dtvercov\u00FD z\u00E1vit, lep\u0161\u00ED \u00FA\u010Dinnost ne\u017E trojheln\u00EDkov\u00FD. ' +
          'Pou\u017Eit\u00ED: vod\u00EDc\u00ED \u0161rouby, sv\u011Br\u00E1ky, ventily, pohybov\u00E9 mechanismy.</div>' +
      '</div>' +

      '<div class="thr-help-group">' +
        '<div class="thr-help-cat">\u2500\u2500 PRAKTICK\u00C9 TIPY \u2500\u2500</div>' +
        '<div class="thr-help-item">' +
          '\u2022 <strong>Identifikace:</strong> Zm\u011B\u0159te stoup\u00E1n\u00ED (m\u011B\u0159\u00EDtkem nebo z\u00E1vitov\u00FDmi \u0161ablonami) a vn\u011Bj\u0161\u00ED \u00F8 \u2013 ' +
          'z toho ur\u010D\u00EDte typ a velikost.<br>' +
          '\u2022 <strong>60\u00B0 vs 55\u00B0:</strong> Metrick\u00E9 (M) a americk\u00E9 (UN) maj\u00ED 60\u00B0. ' +
          'Whitworth (BSW, G) m\u00E1 55\u00B0. Nen\u00ED zam\u011Bniteln\u00E9!<br>' +
          '\u2022 <strong>TPI \u2192 P:</strong> Stoup\u00E1n\u00ED v mm = 25,4 / TPI.<br>' +
          '\u2022 <strong>P\u0159edvrtan\u00ED:</strong> Pro vnit\u0159n\u00ED z\u00E1vit = D \u2212 P (p\u0159ibli\u017En\u011B).<br>' +
          '\u2022 <strong>Mazivo:</strong> P\u0159i \u0159ez\u00E1n\u00ED z\u00E1vit\u016F pou\u017Eijte \u0159ezn\u00FD olej, ' +
          'u hlin\u00EDku petroleum, u litiny nasu\u010Dno.<br>' +
          '\u2022 <strong>Jisk\u0159iv\u00FD pr\u016Fchod:</strong> V\u017Edy dokon\u010Dete 1\u20132 pr\u016Fchody s ap=0 ' +
          'pro vyhlaze\u0159n\u00ED povrchu z\u00E1vitu.' +
        '</div>' +
      '</div>' +
    '</div>';

  var body =
    '<div class="thr-category-row">' +
      '<div class="thr-cat-label">Metrick\u00E9</div>' +
      '<div class="tol-toggle-row thr-type-row">' +
        '<button class="tol-toggle tol-active" data-thr="mc">M hrub\u00E9</button>' +
        '<button class="tol-toggle" data-thr="mf">M jemn\u00E9</button>' +
        '<button class="tol-toggle" data-thr="tr">Tr trap.</button>' +
      '</div>' +
      '<div class="thr-cat-label">Trubkov\u00E9</div>' +
      '<div class="tol-toggle-row thr-type-row">' +
        '<button class="tol-toggle" data-thr="g">G (BSP)</button>' +
        '<button class="tol-toggle" data-thr="bspt">BSPT ku\u017E.</button>' +
        '<button class="tol-toggle" data-thr="npt">NPT ku\u017E.</button>' +
      '</div>' +
      '<div class="thr-cat-label">Palcov\u00E9 / pohybov\u00E9</div>' +
      '<div class="tol-toggle-row thr-type-row">' +
        '<button class="tol-toggle" data-thr="unc">UNC</button>' +
        '<button class="tol-toggle" data-thr="unf">UNF</button>' +
        '<button class="tol-toggle" data-thr="bsw">BSW</button>' +
        '<button class="tol-toggle" data-thr="acme">Acme</button>' +
      '</div>' +
    '</div>' +
    '<input type="text" class="cnc-filter" placeholder="Filtr..." id="threadFilter">' +
    '<div class="cnc-fields" id="thrTolClasses" style="margin-top:6px">' +
      '<label class="cnc-field"><span>T\u0159\u00EDda vn\u011Bj\u0161\u00ED</span>' +
        '<select data-id="tExtClass">' +
          '<option value="6g" selected>6g</option>' +
          '<option value="4g">4g</option>' +
          '<option value="8g">8g</option>' +
        '</select></label>' +
      '<label class="cnc-field"><span>T\u0159\u00EDda vnit\u0159n\u00ED</span>' +
        '<select data-id="tIntClass">' +
          '<option value="6H" selected>6H</option>' +
          '<option value="4H">4H</option>' +
          '<option value="5H">5H</option>' +
          '<option value="7H">7H</option>' +
        '</select></label>' +
    '</div>' +
    '<div class="cnc-table-wrap cnc-table-tall">' +
      '<table class="cnc-table" id="threadTable">' +
        '<thead id="thrHead">' + headerM + '</thead>' +
        '<tbody id="thrBody">' + buildMetricRows(mCoarse, 'M') + '</tbody>' +
      '</table>' +
    '</div>' +
    '<div class="thr-detail" id="thrDetail">' +
      '<div class="thr-detail-hint">Klikn\u011Bte na z\u00E1vit pro zobrazen\u00ED detailu\u2026</div>' +
    '</div>' +
    '<div class="cnc-table-label" style="margin-top:10px">\uD83D\uDD0D Identifikace z\u00E1vitu</div>' +
    '<div class="cnc-fields">' +
      '<label class="cnc-field"><span>Zm\u011B\u0159en\u00FD \u00D8 <small>mm</small></span>' +
        '<input type="number" data-id="tIdentD" step="any" placeholder="Nam\u011B\u0159en\u00FD pr\u016Fm\u011Br"></label>' +
      '<label class="cnc-field"><span>Tolerance <small>mm</small></span>' +
        '<input type="number" data-id="tIdentTol" step="any" value="0.3" placeholder="\u00B1"></label>' +
    '</div>' +
    '<div class="thr-ident-results" id="thrIdentResults"></div>' +
    '<div class="cnc-table-label" style="margin-top:10px">\uD83D\uDD04 Reverzn\u00ED lookup z\u00E1vitu</div>' +
    '<div class="cnc-fields">' +
      '<label class="cnc-field"><span>Stoup\u00E1n\u00ED P <small>mm</small></span>' +
        '<input type="number" data-id="tRevP" step="any" placeholder="P v mm"></label>' +
      '<label class="cnc-field"><span>nebo TPI</span>' +
        '<input type="number" data-id="tRevTPI" step="any" placeholder="z\u00E1vit\u016F/palec"></label>' +
    '</div>' +
    '<div class="cnc-fields">' +
      '<label class="cnc-field"><span>Vn\u011Bj\u0161\u00ED \u00D8 <small>mm</small></span>' +
        '<input type="number" data-id="tRevD" step="any" placeholder="vn\u011Bj\u0161\u00ED pr\u016Fm\u011Br"></label>' +
      '<label class="cnc-field"><span>Vnit\u0159n\u00ED \u00D8 <small>mm</small></span>' +
        '<input type="number" data-id="tRevD1" step="any" placeholder="d\u00EDra / matice"></label>' +
      '<label class="cnc-field"><span>St\u0159edn\u00ED \u00D8 <small>mm</small></span>' +
        '<input type="number" data-id="tRevD2" step="any" placeholder="z\u00E1vitov\u00FD mikrometr"></label>' +
    '</div>' +
    '<div class="cnc-fields">' +
      '<label class="cnc-field"><span>Tolerance <small>mm</small></span>' +
        '<input type="number" data-id="tRevTol" step="any" value="0.2" placeholder="\u00B1"></label>' +
    '</div>' +
    '<div class="thr-ident-results" id="thrRevResults"></div>' +
    '<div class="cnc-fields" style="margin-top:6px">' +
      '<label class="cnc-field"><span>Materi\u00E1l</span>' +
        '<select data-id="tMaterial">' +
          '<option value="steel">Ocel</option>' +
          '<option value="stainless">Nerez</option>' +
          '<option value="aluminum">Hlin\u00EDk</option>' +
          '<option value="cast">Litina</option>' +
        '</select></label>' +
    '</div>' +
    '<div class="cnc-table-label" style="margin-top:10px">Vlastn\u00ED z\u00E1vit</div>' +
    '<div class="cnc-fields">' +
      '<label class="cnc-field"><span>D <small>mm</small></span>' +
        '<input type="number" data-id="tD" step="any" placeholder="Vn\u011Bj\u0161\u00ED \u00F8"></label>' +
      '<label class="cnc-field"><span>P <small>mm</small></span>' +
        '<input type="number" data-id="tP" step="any" placeholder="Stoup\u00E1n\u00ED"></label>' +
      '<label class="cnc-field" id="thrStartsField" style="display:none"><span>Chod\u016F <small>n</small></span>' +
        '<input type="number" data-id="tStarts" step="1" min="1" value="1" placeholder="1"></label>' +
    '</div>' +
    '<div class="cnc-actions">' +
      '<button class="cnc-btn cnc-btn-copy" id="thrCopy">\uD83D\uDCCB Kop\u00EDrovat</button>' +
      '<button class="cnc-btn cnc-btn-help" id="thrHelp">\u2753 N\u00E1pov\u011Bda</button>' +
    '</div>' +
    '<div class="thr-help-panel" id="thrHelpPanel" style="display:none">' + helpHTML + '</div>';

  var overlay = makeOverlay("thread", "\uD83D\uDD29 Z\u00E1vity", body);
  if (!overlay) return;

  var filter   = overlay.querySelector("#threadFilter");
  var thead    = overlay.querySelector("#thrHead");
  var tbody    = overlay.querySelector("#thrBody");
  var detail   = overlay.querySelector("#thrDetail");
  var inpD     = overlay.querySelector('[data-id="tD"]');
  var inpP     = overlay.querySelector('[data-id="tP"]');
  var inpStarts = overlay.querySelector('[data-id="tStarts"]');
  var startsField = overlay.querySelector('#thrStartsField');
  var typeBtns = overlay.querySelectorAll('[data-thr]');
  var helpPanel= overlay.querySelector("#thrHelpPanel");
  var lastActiveRow = null;
  var currentType = 'mc';
  var tolClassPanel = overlay.querySelector('#thrTolClasses');
  var selExtClass = overlay.querySelector('[data-id="tExtClass"]');
  var selIntClass = overlay.querySelector('[data-id="tIntClass"]');
  var selMaterial = overlay.querySelector('[data-id="tMaterial"]');
  var lastMetricD = null, lastMetricP = null, lastMetricLabel = null;

  function setDetail(result) {
    detail.innerHTML = result.html;
    detail.dataset.copyText = result.copyText;
  }

  // ── Toggle nápověda ──
  overlay.querySelector("#thrHelp").addEventListener("click", function() {
    var vis = helpPanel.style.display !== 'none';
    helpPanel.style.display = vis ? 'none' : 'block';
    this.textContent = vis ? '\u2753 N\u00E1pov\u011Bda' : '\u2716 Zav\u0159\u00EDt n\u00E1pov\u011Bdu';
  });

  // ── Infeed strategy toggle (event delegation) ──
  detail.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-infeed]');
    if (!btn) return;
    var group = btn.closest('.thr-passes-group');
    if (!group) return;
    var infeedType = btn.dataset.infeed;
    var totalDepth = parseFloat(group.dataset.depth);
    var nPasses = parseInt(group.dataset.npasses);
    var toggles = group.querySelectorAll('[data-infeed]');
    for (var i = 0; i < toggles.length; i++) {
      toggles[i].classList.toggle('tol-active', toggles[i] === btn);
    }
    var oldRows = group.querySelectorAll('.thr-pass-row');
    for (var i = 0; i < oldRows.length; i++) oldRows[i].remove();
    // Insert new rows before VC data (after toggle row)
    var toggleTr = group.querySelector('.tol-toggle-row');
    var refNode = toggleTr ? toggleTr.closest('tr').nextElementSibling : null;
    var temp = document.createElement('tbody');
    temp.innerHTML = threadPassesRows(totalDepth, nPasses, infeedType);
    while (temp.firstChild) group.insertBefore(temp.firstChild, refNode);
  });

  // ── Switch thread type ──
  function switchType(type) {
    currentType = type;
    var isMetric = (type === 'mc' || type === 'mf');
    tolClassPanel.style.display = isMetric ? '' : 'none';
    var showStarts = (type === 'tr' || type === 'acme');
    startsField.style.display = showStarts ? '' : 'none';
    if (!showStarts) inpStarts.value = '1';
    if (!isMetric) { lastMetricD = null; lastMetricP = null; lastMetricLabel = null; }
    for (var i = 0; i < typeBtns.length; i++) {
      typeBtns[i].classList.toggle('tol-active', typeBtns[i].dataset.thr === type);
    }
    if (lastActiveRow) { lastActiveRow.classList.remove("thr-row-active"); lastActiveRow = null; }
    detail.innerHTML = '<div class="thr-detail-hint">Klikn\u011Bte na z\u00E1vit pro zobrazen\u00ED detailu\u2026</div>';
    delete detail.dataset.copyText;
    filter.value = '';

    if (type === 'mc') {
      thead.innerHTML = headerM;
      tbody.innerHTML = buildMetricRows(mCoarse, 'M');
    } else if (type === 'mf') {
      thead.innerHTML = headerM;
      tbody.innerHTML = buildMetricRows(mFine, 'M');
    } else if (type === 'g') {
      thead.innerHTML = headerTPI;
      tbody.innerHTML = buildGRows();
    } else if (type === 'tr') {
      thead.innerHTML = headerTr;
      tbody.innerHTML = buildTrRows();
    } else if (type === 'unc') {
      thead.innerHTML = headerTPI;
      tbody.innerHTML = buildImperialRows(uncThreads, 'UNC');
    } else if (type === 'unf') {
      thead.innerHTML = headerTPI;
      tbody.innerHTML = buildImperialRows(unfThreads, 'UNF');
    } else if (type === 'bsw') {
      thead.innerHTML = headerTPI;
      tbody.innerHTML = buildImperialRows(bswThreads, 'BSW');
    } else if (type === 'bspt') {
      thead.innerHTML = headerTPI;
      tbody.innerHTML = buildImperialRows(bsptThreads, 'BSPT');
    } else if (type === 'npt') {
      thead.innerHTML = headerTPI;
      tbody.innerHTML = buildImperialRows(nptThreads, 'NPT');
    } else if (type === 'acme') {
      thead.innerHTML = headerTPI;
      tbody.innerHTML = buildImperialRows(acmeThreads, 'Acme');
    }
  }

  for (var bi = 0; bi < typeBtns.length; bi++) {
    typeBtns[bi].addEventListener("click", function() { switchType(this.dataset.thr); });
  }

  // ── Filtr ──
  filter.addEventListener("input", function() {
    var q = filter.value.toLowerCase();
    var trs = tbody.querySelectorAll("tr");
    for (var i = 0; i < trs.length; i++) {
      var tr = trs[i];
      var txt = '';
      for (var c = 0; c < tr.children.length; c++) txt += tr.children[c].textContent.toLowerCase() + ' ';
      tr.style.display = txt.indexOf(q) >= 0 ? "" : "none";
    }
  });

  // ── Klik na řádek → detail ──
  tbody.addEventListener("click", function(e) {
    var tr = e.target.closest("tr");
    if (!tr) return;
    if (lastActiveRow) lastActiveRow.classList.remove("thr-row-active");
    tr.classList.add("thr-row-active");
    lastActiveRow = tr;

    var D = parseFloat(tr.dataset.d);
    var P = parseFloat(tr.dataset.p);
    var type = tr.dataset.type;

    if (type === 'M') {
      var isFine = (currentType === 'mf');
      var lbl = 'M' + D + (isFine ? '\u00D7' + P + ' jemn\u00E9' : ' hrub\u00E9');
      lastMetricD = D; lastMetricP = P; lastMetricLabel = lbl;
      setDetail(detailMetric(D, P, lbl, selExtClass.value, selIntClass.value));
    } else if (type === 'G') {
      var tpi = parseFloat(tr.dataset.tpi);
      setDetail(detailG(D, P, tpi, tr.dataset.n));
    } else if (type === 'Tr') {
      var starts = parseInt(inpStarts.value) || 1;
      setDetail(detailTr(D, P, 'Tr' + D + '\u00D7' + P, starts));
    } else if (type === 'UNC') {
      setDetail(detailUN(D, P, parseFloat(tr.dataset.tpi), tr.dataset.n, 'UNC \u2013 ASME B1.1'));
    } else if (type === 'UNF') {
      setDetail(detailUN(D, P, parseFloat(tr.dataset.tpi), tr.dataset.n, 'UNF \u2013 ASME B1.1'));
    } else if (type === 'BSW') {
      setDetail(detailBSW(D, P, parseFloat(tr.dataset.tpi), tr.dataset.n));
    } else if (type === 'BSPT') {
      setDetail(detailBSPT(D, P, parseFloat(tr.dataset.tpi), tr.dataset.n));
    } else if (type === 'NPT') {
      setDetail(detailNPT(D, P, parseFloat(tr.dataset.tpi), tr.dataset.n));
    } else if (type === 'Acme') {
      var starts = parseInt(inpStarts.value) || 1;
      setDetail(detailAcme(D, P, parseFloat(tr.dataset.tpi), tr.dataset.n, starts));
    }
  });

  // ── Vlastní závit ──
  function calcCustom() {
    var D = inpD.value !== "" ? safeEvalMath(inpD.value) : null;
    var P = inpP.value !== "" ? safeEvalMath(inpP.value) : null;
    if (D !== null && P !== null && P > 0 && D > 0) {
      if (lastActiveRow) { lastActiveRow.classList.remove("thr-row-active"); lastActiveRow = null; }
      var starts = parseInt(inpStarts.value) || 1;
      if (currentType === 'tr') {
        setDetail(detailTr(D, P, 'Tr' + D + '\u00D7' + P + ' (vlastn\u00ED)', starts));
      } else if (currentType === 'g') {
        var tpi = Math.round(25.4 / P);
        setDetail(detailG(D, P, tpi, 'G vlastn\u00ED'));
      } else if (currentType === 'unc' || currentType === 'unf') {
        var tpi = Math.round(25.4 / P);
        setDetail(detailUN(D, P, tpi, 'Vlastn\u00ED ' + currentType.toUpperCase(), currentType.toUpperCase()));
      } else if (currentType === 'bsw') {
        var tpi = Math.round(25.4 / P);
        setDetail(detailBSW(D, P, tpi, 'BSW vlastn\u00ED'));
      } else if (currentType === 'bspt') {
        var tpi = Math.round(25.4 / P);
        setDetail(detailBSPT(D, P, tpi, 'BSPT vlastn\u00ED'));
      } else if (currentType === 'npt') {
        var tpi = Math.round(25.4 / P);
        setDetail(detailNPT(D, P, tpi, 'NPT vlastn\u00ED'));
      } else if (currentType === 'acme') {
        var tpi = Math.round(25.4 / P);
        setDetail(detailAcme(D, P, tpi, 'Acme vlastn\u00ED', starts));
      } else {
        lastMetricD = D; lastMetricP = P; lastMetricLabel = 'M' + D + '\u00D7' + P + ' (vlastn\u00ED)';
        setDetail(detailMetric(D, P, lastMetricLabel, selExtClass.value, selIntClass.value));
      }
    }
  }
  inpD.addEventListener("input", calcCustom);
  inpP.addEventListener("input", calcCustom);
  inpStarts.addEventListener("input", calcCustom);

  // ── Identifikace závitu ──────────────────────────────────
  var identD   = overlay.querySelector('[data-id="tIdentD"]');
  var identTol = overlay.querySelector('[data-id="tIdentTol"]');
  var identRes = overlay.querySelector('#thrIdentResults');
  var identHits = [];

  function identifyThread() {
    var dVal = identD.value !== '' ? parseFloat(identD.value) : null;
    var tol  = identTol.value !== '' ? parseFloat(identTol.value) : 0.3;
    if (dVal === null || isNaN(dVal) || dVal <= 0) { identRes.innerHTML = ''; identHits = []; return; }
    if (isNaN(tol) || tol < 0) tol = 0;
    var lo = dVal - tol, hi = dVal + tol;
    var hits = [];

    // M hrubé
    for (var i = 0; i < mCoarse.length; i++) {
      var t = mCoarse[i];
      if (t.D >= lo && t.D <= hi)
        hits.push({ label: 'M' + t.D + ' hrub\u00E9', info: 'D=' + t.D.toFixed(3) + ', P=' + t.P, tab: 'mc', D: t.D, P: t.P, type: 'M' });
    }
    // M jemné
    for (var i = 0; i < mFine.length; i++) {
      var t = mFine[i];
      if (t.D >= lo && t.D <= hi)
        hits.push({ label: 'M' + t.D + '\u00D7' + t.P + ' jemn\u00E9', info: 'D=' + t.D.toFixed(3) + ', P=' + t.P, tab: 'mf', D: t.D, P: t.P, type: 'M' });
    }
    // G (BSP)
    for (var i = 0; i < gThreads.length; i++) {
      var g = gThreads[i];
      if (g.D >= lo && g.D <= hi)
        hits.push({ label: g.n, info: 'D=' + g.D.toFixed(3) + ', TPI=' + g.tpi, tab: 'g', D: g.D, P: 25.4 / g.tpi, tpi: g.tpi, n: g.n, type: 'G' });
    }
    // Tr trapézový
    for (var i = 0; i < trThreads.length; i++) {
      var t = trThreads[i];
      if (t.D >= lo && t.D <= hi)
        hits.push({ label: 'Tr' + t.D + '\u00D7' + t.P, info: 'D=' + t.D.toFixed(3) + ', P=' + t.P, tab: 'tr', D: t.D, P: t.P, type: 'Tr' });
    }
    // UNC
    for (var i = 0; i < uncThreads.length; i++) {
      var t = uncThreads[i];
      if (t.D >= lo && t.D <= hi)
        hits.push({ label: 'UNC ' + t.n, info: 'D=' + t.D.toFixed(3) + ', TPI=' + t.tpi, tab: 'unc', D: t.D, P: 25.4 / t.tpi, tpi: t.tpi, n: t.n, type: 'UNC' });
    }
    // UNF
    for (var i = 0; i < unfThreads.length; i++) {
      var t = unfThreads[i];
      if (t.D >= lo && t.D <= hi)
        hits.push({ label: 'UNF ' + t.n, info: 'D=' + t.D.toFixed(3) + ', TPI=' + t.tpi, tab: 'unf', D: t.D, P: 25.4 / t.tpi, tpi: t.tpi, n: t.n, type: 'UNF' });
    }
    // BSW
    for (var i = 0; i < bswThreads.length; i++) {
      var t = bswThreads[i];
      if (t.D >= lo && t.D <= hi)
        hits.push({ label: 'BSW ' + t.n, info: 'D=' + t.D.toFixed(3) + ', TPI=' + t.tpi, tab: 'bsw', D: t.D, P: 25.4 / t.tpi, tpi: t.tpi, n: t.n, type: 'BSW' });
    }
    // BSPT
    for (var i = 0; i < bsptThreads.length; i++) {
      var t = bsptThreads[i];
      if (t.D >= lo && t.D <= hi)
        hits.push({ label: 'BSPT ' + t.n, info: 'D=' + t.D.toFixed(3) + ', TPI=' + t.tpi, tab: 'bspt', D: t.D, P: 25.4 / t.tpi, tpi: t.tpi, n: t.n, type: 'BSPT' });
    }
    // NPT
    for (var i = 0; i < nptThreads.length; i++) {
      var t = nptThreads[i];
      if (t.D >= lo && t.D <= hi)
        hits.push({ label: 'NPT ' + t.n, info: 'D=' + t.D.toFixed(3) + ', TPI=' + t.tpi, tab: 'npt', D: t.D, P: 25.4 / t.tpi, tpi: t.tpi, n: t.n, type: 'NPT' });
    }
    // Acme
    for (var i = 0; i < acmeThreads.length; i++) {
      var t = acmeThreads[i];
      if (t.D >= lo && t.D <= hi)
        hits.push({ label: 'Acme ' + t.n, info: 'D=' + t.D.toFixed(3) + ', TPI=' + t.tpi, tab: 'acme', D: t.D, P: 25.4 / t.tpi, tpi: t.tpi, n: t.n, type: 'Acme' });
    }

    identHits = hits;
    if (hits.length === 0) {
      identRes.innerHTML = '<div class="thr-ident-empty">\u017D\u00E1dn\u00FD z\u00E1vit nenalezen</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < hits.length; i++) {
      var h = hits[i];
      html += '<div class="thr-ident-item" data-idx="' + i + '">' +
        '<strong>' + h.label + '</strong> <span class="thr-ident-info">(' + h.info + ')</span></div>';
    }
    identRes.innerHTML = html;
  }
  identD.addEventListener("input", identifyThread);
  identTol.addEventListener("input", identifyThread);

  // ── Reverzní lookup závitu ──────────────────────────────
  var revP    = overlay.querySelector('[data-id="tRevP"]');
  var revTPI  = overlay.querySelector('[data-id="tRevTPI"]');
  var revD    = overlay.querySelector('[data-id="tRevD"]');
  var revD1   = overlay.querySelector('[data-id="tRevD1"]');
  var revD2   = overlay.querySelector('[data-id="tRevD2"]');
  var revTol  = overlay.querySelector('[data-id="tRevTol"]');
  var revRes  = overlay.querySelector('#thrRevResults');
  var revHits = [];

  // Výpočet d2 a D1 z D a P pro různé typy
  function calcDiameters(D, P, angle) {
    if (angle === 55) {
      return { d2: D - 0.6403 * P, d1: D - 1.2806 * P };
    } else if (angle === 30 || angle === 29) {
      return { d2: D - 0.5 * P, d1: D - P };
    } else {
      // 60° (metric, UNC, UNF, NPT)
      return { d2: D - 0.6495 * P, d1: D - 1.0825 * P };
    }
  }

  function reverseMatch(entry, angle) {
    var tol = revTol.value !== '' ? parseFloat(revTol.value) : 0.2;
    if (isNaN(tol) || tol < 0) tol = 0;
    var pVal  = revP.value !== '' ? parseFloat(revP.value) : null;
    var tpiVal = revTPI.value !== '' ? parseFloat(revTPI.value) : null;
    var dVal  = revD.value !== '' ? parseFloat(revD.value) : null;
    var d1Val = revD1.value !== '' ? parseFloat(revD1.value) : null;
    var d2Val = revD2.value !== '' ? parseFloat(revD2.value) : null;

    var entryP = entry.P;
    var entryD = entry.D;
    var dims = calcDiameters(entryD, entryP, angle);
    var score = 0;
    var checks = 0;

    // Kontrola stoupání (P a TPI jsou synced – počítáme jen jednou)
    if (pVal !== null && !isNaN(pVal) && pVal > 0) {
      checks++;
      if (Math.abs(entryP - pVal) <= tol) score++;
      else return null;
    } else if (tpiVal !== null && !isNaN(tpiVal) && tpiVal > 0) {
      checks++;
      var entryTPI = 25.4 / entryP;
      // Přepočítat toleranci z mm na TPI: dTPI/dP = -25.4/P², přibližně
      var tpiTol = (25.4 / (entryP * entryP)) * tol;
      if (tpiTol < 0.5) tpiTol = 0.5;
      if (Math.abs(entryTPI - tpiVal) <= tpiTol) score++;
      else return null;
    }
    // Kontrola vnějšího průměru
    if (dVal !== null && !isNaN(dVal)) {
      checks++;
      if (Math.abs(entryD - dVal) <= tol) score++;
      else return null;
    }
    // Kontrola vnitřního průměru
    if (d1Val !== null && !isNaN(d1Val)) {
      checks++;
      if (Math.abs(dims.d1 - d1Val) <= tol) score++;
      else return null;
    }
    // Kontrola středního průměru
    if (d2Val !== null && !isNaN(d2Val)) {
      checks++;
      if (Math.abs(dims.d2 - d2Val) <= tol) score++;
      else return null;
    }
    if (checks === 0) return null;
    return score;
  }

  function reverseLookup() {
    var pVal  = revP.value !== '' ? parseFloat(revP.value) : null;
    var tpiVal = revTPI.value !== '' ? parseFloat(revTPI.value) : null;
    var dVal  = revD.value !== '' ? parseFloat(revD.value) : null;
    var d1Val = revD1.value !== '' ? parseFloat(revD1.value) : null;
    var d2Val = revD2.value !== '' ? parseFloat(revD2.value) : null;
    var hasInput = (pVal !== null && !isNaN(pVal)) || (tpiVal !== null && !isNaN(tpiVal)) ||
                   (dVal !== null && !isNaN(dVal)) || (d1Val !== null && !isNaN(d1Val)) || (d2Val !== null && !isNaN(d2Val));
    if (!hasInput) { revRes.innerHTML = ''; revHits = []; return; }

    var hits = [];
    // M hrubé (60°)
    for (var i = 0; i < mCoarse.length; i++) {
      var t = mCoarse[i];
      var s = reverseMatch({ D: t.D, P: t.P }, 60);
      if (s !== null) {
        var dims = calcDiameters(t.D, t.P, 60);
        hits.push({ label: 'M' + t.D + ' hrub\u00E9', info: 'D=' + t.D.toFixed(3) + ' d\u2082=' + dims.d2.toFixed(3) + ' D\u2081=' + dims.d1.toFixed(3) + ' P=' + t.P,
          tab: 'mc', D: t.D, P: t.P, type: 'M', score: s });
      }
    }
    // M jemné (60°)
    for (var i = 0; i < mFine.length; i++) {
      var t = mFine[i];
      var s = reverseMatch({ D: t.D, P: t.P }, 60);
      if (s !== null) {
        var dims = calcDiameters(t.D, t.P, 60);
        hits.push({ label: 'M' + t.D + '\u00D7' + t.P + ' jemn\u00E9', info: 'D=' + t.D.toFixed(3) + ' d\u2082=' + dims.d2.toFixed(3) + ' D\u2081=' + dims.d1.toFixed(3) + ' P=' + t.P,
          tab: 'mf', D: t.D, P: t.P, type: 'M', score: s });
      }
    }
    // G (55°)
    for (var i = 0; i < gThreads.length; i++) {
      var g = gThreads[i]; var gP = 25.4 / g.tpi;
      var s = reverseMatch({ D: g.D, P: gP }, 55);
      if (s !== null) {
        var dims = calcDiameters(g.D, gP, 55);
        hits.push({ label: g.n, info: 'D=' + g.D.toFixed(3) + ' d\u2082=' + dims.d2.toFixed(3) + ' d\u2081=' + dims.d1.toFixed(3) + ' TPI=' + g.tpi,
          tab: 'g', D: g.D, P: gP, tpi: g.tpi, n: g.n, type: 'G', score: s });
      }
    }
    // Tr (30°)
    for (var i = 0; i < trThreads.length; i++) {
      var t = trThreads[i];
      var s = reverseMatch({ D: t.D, P: t.P }, 30);
      if (s !== null) {
        var dims = calcDiameters(t.D, t.P, 30);
        hits.push({ label: 'Tr' + t.D + '\u00D7' + t.P, info: 'D=' + t.D.toFixed(3) + ' d\u2082=' + dims.d2.toFixed(3) + ' D\u2081=' + dims.d1.toFixed(3) + ' P=' + t.P,
          tab: 'tr', D: t.D, P: t.P, type: 'Tr', score: s });
      }
    }
    // UNC (60°)
    for (var i = 0; i < uncThreads.length; i++) {
      var t = uncThreads[i]; var uP = 25.4 / t.tpi;
      var s = reverseMatch({ D: t.D, P: uP }, 60);
      if (s !== null) {
        var dims = calcDiameters(t.D, uP, 60);
        hits.push({ label: 'UNC ' + t.n, info: 'D=' + t.D.toFixed(3) + ' d\u2082=' + dims.d2.toFixed(3) + ' D\u2081=' + dims.d1.toFixed(3) + ' TPI=' + t.tpi,
          tab: 'unc', D: t.D, P: uP, tpi: t.tpi, n: t.n, type: 'UNC', score: s });
      }
    }
    // UNF (60°)
    for (var i = 0; i < unfThreads.length; i++) {
      var t = unfThreads[i]; var uP = 25.4 / t.tpi;
      var s = reverseMatch({ D: t.D, P: uP }, 60);
      if (s !== null) {
        var dims = calcDiameters(t.D, uP, 60);
        hits.push({ label: 'UNF ' + t.n, info: 'D=' + t.D.toFixed(3) + ' d\u2082=' + dims.d2.toFixed(3) + ' D\u2081=' + dims.d1.toFixed(3) + ' TPI=' + t.tpi,
          tab: 'unf', D: t.D, P: uP, tpi: t.tpi, n: t.n, type: 'UNF', score: s });
      }
    }
    // BSW (55°)
    for (var i = 0; i < bswThreads.length; i++) {
      var t = bswThreads[i]; var bP = 25.4 / t.tpi;
      var s = reverseMatch({ D: t.D, P: bP }, 55);
      if (s !== null) {
        var dims = calcDiameters(t.D, bP, 55);
        hits.push({ label: 'BSW ' + t.n, info: 'D=' + t.D.toFixed(3) + ' d\u2082=' + dims.d2.toFixed(3) + ' d\u2081=' + dims.d1.toFixed(3) + ' TPI=' + t.tpi,
          tab: 'bsw', D: t.D, P: bP, tpi: t.tpi, n: t.n, type: 'BSW', score: s });
      }
    }
    // BSPT (55°)
    for (var i = 0; i < bsptThreads.length; i++) {
      var t = bsptThreads[i]; var bP = 25.4 / t.tpi;
      var s = reverseMatch({ D: t.D, P: bP }, 55);
      if (s !== null) {
        var dims = calcDiameters(t.D, bP, 55);
        hits.push({ label: 'BSPT ' + t.n, info: 'D=' + t.D.toFixed(3) + ' d\u2082=' + dims.d2.toFixed(3) + ' d\u2081=' + dims.d1.toFixed(3) + ' TPI=' + t.tpi,
          tab: 'bspt', D: t.D, P: bP, tpi: t.tpi, n: t.n, type: 'BSPT', score: s });
      }
    }
    // NPT (60°)
    for (var i = 0; i < nptThreads.length; i++) {
      var t = nptThreads[i]; var nP = 25.4 / t.tpi;
      var s = reverseMatch({ D: t.D, P: nP }, 60);
      if (s !== null) {
        var dims = calcDiameters(t.D, nP, 60);
        hits.push({ label: 'NPT ' + t.n, info: 'D=' + t.D.toFixed(3) + ' d\u2082=' + dims.d2.toFixed(3) + ' D\u2081=' + dims.d1.toFixed(3) + ' TPI=' + t.tpi,
          tab: 'npt', D: t.D, P: nP, tpi: t.tpi, n: t.n, type: 'NPT', score: s });
      }
    }
    // Acme (29°)
    for (var i = 0; i < acmeThreads.length; i++) {
      var t = acmeThreads[i]; var aP = 25.4 / t.tpi;
      var s = reverseMatch({ D: t.D, P: aP }, 29);
      if (s !== null) {
        var dims = calcDiameters(t.D, aP, 29);
        hits.push({ label: 'Acme ' + t.n, info: 'D=' + t.D.toFixed(3) + ' d\u2082=' + dims.d2.toFixed(3) + ' D\u2081=' + dims.d1.toFixed(3) + ' TPI=' + t.tpi,
          tab: 'acme', D: t.D, P: aP, tpi: t.tpi, n: t.n, type: 'Acme', score: s });
      }
    }

    // Seřadit: více shod = lepší, pak podle D
    hits.sort(function(a, b) { return b.score - a.score || a.D - b.D; });
    revHits = hits;
    if (hits.length === 0) {
      revRes.innerHTML = '<div class="thr-ident-empty">\u017D\u00E1dn\u00FD z\u00E1vit nenalezen</div>';
      return;
    }
    var html = '';
    var maxShow = Math.min(hits.length, 30);
    for (var i = 0; i < maxShow; i++) {
      var h = hits[i];
      var stars = '';
      for (var s = 0; s < h.score; s++) stars += '\u2605';
      html += '<div class="thr-ident-item" data-revidx="' + i + '">' +
        '<strong>' + h.label + '</strong> ' +
        '<span class="thr-rev-score">' + stars + '</span> ' +
        '<span class="thr-ident-info">(' + h.info + ')</span></div>';
    }
    if (hits.length > maxShow) {
      html += '<div class="thr-ident-empty">\u2026 a dal\u0161\u00EDch ' + (hits.length - maxShow) + ' v\u00FDsledk\u016F</div>';
    }
    revRes.innerHTML = html;
  }

  revP.addEventListener("input", function() {
    if (revP.value !== '') {
      var pv = parseFloat(revP.value);
      if (!isNaN(pv) && pv > 0) { revTPI.value = (25.4 / pv).toFixed(2); }
      else { revTPI.value = ''; }
    } else {
      revTPI.value = '';
    }
    reverseLookup();
  });
  revTPI.addEventListener("input", function() {
    if (revTPI.value !== '') {
      var tv = parseFloat(revTPI.value);
      if (!isNaN(tv) && tv > 0) { revP.value = (25.4 / tv).toFixed(4); }
      else { revP.value = ''; }
    } else {
      revP.value = '';
    }
    reverseLookup();
  });
  revD.addEventListener("input", reverseLookup);
  revD1.addEventListener("input", reverseLookup);
  revD2.addEventListener("input", reverseLookup);
  revTol.addEventListener("input", reverseLookup);

  // Klik na výsledek reverzního lookup → zobraz detail
  revRes.addEventListener("click", function(e) {
    var item = e.target.closest('[data-revidx]');
    if (!item) return;
    var idx = parseInt(item.dataset.revidx);
    var h = revHits[idx];
    if (!h) return;
    switchType(h.tab);
    if (h.type === 'M') {
      var isFine = (h.tab === 'mf');
      var lbl = 'M' + h.D + (isFine ? '\u00D7' + h.P + ' jemn\u00E9' : ' hrub\u00E9');
      lastMetricD = h.D; lastMetricP = h.P; lastMetricLabel = lbl;
      setDetail(detailMetric(h.D, h.P, lbl, selExtClass.value, selIntClass.value));
    } else if (h.type === 'G') {
      setDetail(detailG(h.D, h.P, h.tpi, h.n));
    } else if (h.type === 'Tr') {
      setDetail(detailTr(h.D, h.P, 'Tr' + h.D + '\u00D7' + h.P));
    } else if (h.type === 'UNC') {
      setDetail(detailUN(h.D, h.P, h.tpi, h.n, 'UNC \u2013 ASME B1.1'));
    } else if (h.type === 'UNF') {
      setDetail(detailUN(h.D, h.P, h.tpi, h.n, 'UNF \u2013 ASME B1.1'));
    } else if (h.type === 'BSW') {
      setDetail(detailBSW(h.D, h.P, h.tpi, h.n));
    } else if (h.type === 'BSPT') {
      setDetail(detailBSPT(h.D, h.P, h.tpi, h.n));
    } else if (h.type === 'NPT') {
      setDetail(detailNPT(h.D, h.P, h.tpi, h.n));
    } else if (h.type === 'Acme') {
      setDetail(detailAcme(h.D, h.P, h.tpi, h.n));
    }
    // Zvýrazni odpovídající řádek v tabulce
    if (lastActiveRow) lastActiveRow.classList.remove("thr-row-active");
    var rows = tbody.querySelectorAll('tr');
    for (var r = 0; r < rows.length; r++) {
      var rd = parseFloat(rows[r].dataset.d);
      var rp = parseFloat(rows[r].dataset.p);
      if (Math.abs(rd - h.D) < 0.001 && Math.abs(rp - h.P) < 0.001) {
        rows[r].classList.add("thr-row-active");
        lastActiveRow = rows[r];
        rows[r].scrollIntoView({ block: 'center', behavior: 'smooth' });
        break;
      }
    }
  });

  // Klik na výsledek identifikace → přepni záložku + zobraz detail
  identRes.addEventListener("click", function(e) {
    var item = e.target.closest('.thr-ident-item');
    if (!item) return;
    var idx = parseInt(item.dataset.idx);
    var h = identHits[idx];
    if (!h) return;
    switchType(h.tab);
    if (h.type === 'M') {
      var isFine = (h.tab === 'mf');
      var lbl = 'M' + h.D + (isFine ? '\u00D7' + h.P + ' jemn\u00E9' : ' hrub\u00E9');
      lastMetricD = h.D; lastMetricP = h.P; lastMetricLabel = lbl;
      setDetail(detailMetric(h.D, h.P, lbl, selExtClass.value, selIntClass.value));
    } else if (h.type === 'G') {
      setDetail(detailG(h.D, h.P, h.tpi, h.n));
    } else if (h.type === 'Tr') {
      setDetail(detailTr(h.D, h.P, 'Tr' + h.D + '\u00D7' + h.P));
    } else if (h.type === 'UNC') {
      setDetail(detailUN(h.D, h.P, h.tpi, h.n, 'UNC \u2013 ASME B1.1'));
    } else if (h.type === 'UNF') {
      setDetail(detailUN(h.D, h.P, h.tpi, h.n, 'UNF \u2013 ASME B1.1'));
    } else if (h.type === 'BSW') {
      setDetail(detailBSW(h.D, h.P, h.tpi, h.n));
    } else if (h.type === 'BSPT') {
      setDetail(detailBSPT(h.D, h.P, h.tpi, h.n));
    } else if (h.type === 'NPT') {
      setDetail(detailNPT(h.D, h.P, h.tpi, h.n));
    } else if (h.type === 'Acme') {
      setDetail(detailAcme(h.D, h.P, h.tpi, h.n));
    }
    // Zvýrazni odpovídající řádek v tabulce
    if (lastActiveRow) lastActiveRow.classList.remove("thr-row-active");
    var rows = tbody.querySelectorAll('tr');
    for (var r = 0; r < rows.length; r++) {
      var rd = parseFloat(rows[r].dataset.d);
      var rp = parseFloat(rows[r].dataset.p);
      if (Math.abs(rd - h.D) < 0.001 && Math.abs(rp - h.P) < 0.001) {
        rows[r].classList.add("thr-row-active");
        lastActiveRow = rows[r];
        rows[r].scrollIntoView({ block: 'center', behavior: 'smooth' });
        break;
      }
    }
  });

  // ── Změna třídy tolerance → přepočítat ──
  function onTolClassChange() {
    if (lastMetricD !== null && lastMetricP !== null && (currentType === 'mc' || currentType === 'mf')) {
      setDetail(detailMetric(lastMetricD, lastMetricP, lastMetricLabel, selExtClass.value, selIntClass.value));
    }
  }
  selExtClass.addEventListener('change', onTolClassChange);
  selIntClass.addEventListener('change', onTolClassChange);

  // ── Zm\u011Bna materi\u00E1lu \u2192 p\u0159epo\u010D\u00EDtat ──
  selMaterial.addEventListener('change', function() {
    if (lastActiveRow) {
      lastActiveRow.click();
    } else {
      calcCustom();
    }
  });

  // ── Kop\u00EDrovat detail ──
  overlay.querySelector("#thrCopy").addEventListener("click", function() {
    var txt = detail.dataset.copyText;
    if (txt) {
      navigator.clipboard.writeText(txt).then(function() { showToast("Zkop\u00EDrov\u00E1no"); });
    }
  });
}

// ══════════════════════════════════════════════════════════════
// ► Převodník
// ══════════════════════════════════════════════════════════════