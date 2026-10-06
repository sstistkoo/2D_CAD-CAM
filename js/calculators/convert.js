import { safeEvalMath } from '../utils.js';
import { makeOverlay } from '../dialogFactory.js';

export function openConvertCalc() {
  // HRC ↔ HB přibližná konverze (ASTM E140, zjednodušeno)
  // Tabulka HRC → HB (Brinell, kulička 10/3000)
  var hrcHbTable = [
    [20,226],[21,231],[22,237],[23,243],[24,247],[25,253],[26,258],[27,264],
    [28,271],[29,279],[30,286],[31,294],[32,301],[33,311],[34,319],[35,328],
    [36,336],[37,344],[38,353],[39,362],[40,371],[41,381],[42,390],[43,400],
    [44,409],[45,421],[46,432],[47,442],[48,453],[49,465],[50,477],[51,488],
    [52,500],[53,513],[54,525],[55,539],[56,553],[57,567],[58,582],[59,597],
    [60,613],[61,627],[62,640],[63,653],[64,667],[65,682],[66,697],[67,712],[68,728]
  ];

  // HRC → HV (ASTM E140, ocel); HV ≈ 1,05·HB platí jen pro měkké oceli (pod 20 HRC)
  var hrcHvTable = [
    [20,238],[21,243],[22,248],[23,254],[24,260],[25,266],[26,272],[27,279],[28,286],[29,294],
    [30,302],[31,310],[32,318],[33,327],[34,336],[35,345],[36,354],[37,363],[38,372],[39,382],
    [40,392],[41,402],[42,412],[43,423],[44,434],[45,446],[46,458],[47,471],[48,484],[49,498],
    [50,513],[51,528],[52,544],[53,560],[54,577],[55,595],[56,613],[57,633],[58,653],[59,674],
    [60,697],[61,720],[62,746],[63,772],[64,800],[65,832],[66,865],[67,900],[68,940]
  ];
  function interp(tbl, x, from, to) {
    for (var i = 0; i < tbl.length - 1; i++) {
      var a = tbl[i][from], b = tbl[i + 1][from];
      if (x >= a && x <= b) return tbl[i][to] + (x - a) / (b - a) * (tbl[i + 1][to] - tbl[i][to]);
    }
    return null;
  }

  const body =
    '<div class="conv-section">' +
      '<div class="conv-label">D\u00E9lka</div>' +
      '<div class="conv-row">' +
        '<label class="conv-inp"><input type="number" data-conv="mm" step="any" placeholder="0"><small>mm</small></label>' +
        '<span class="conv-arrow">\u2194</span>' +
        '<label class="conv-inp"><input type="number" data-conv="inch" step="any" placeholder="0"><small>inch</small></label>' +
      '</div>' +
    '</div>' +
    '<div class="conv-section">' +
      '<div class="conv-label">\u00DAhly</div>' +
      '<div class="conv-row">' +
        '<label class="conv-inp"><input type="number" data-conv="deg" step="any" placeholder="0"><small>\u00B0</small></label>' +
        '<span class="conv-arrow">\u2194</span>' +
        '<label class="conv-inp"><input type="number" data-conv="rad" step="any" placeholder="0"><small>rad</small></label>' +
      '</div>' +
    '</div>' +
    '<div class="conv-section">' +
      '<div class="conv-label">Drsnost <small>(soustružení ~×6, broušení ~×4)</small></div>' +
      '<div class="conv-row">' +
        '<label class="conv-inp"><input type="number" data-conv="ra" step="any" placeholder="0"><small>Ra</small></label>' +
        '<span class="conv-arrow">\u2194</span>' +
        '<label class="conv-inp"><input type="number" data-conv="rz" step="any" placeholder="0"><small>Rz</small></label>' +
      '</div>' +
      '<div class="conv-row" style="margin-top:4px;gap:6px">' +
        '<button class="conv-ratio-btn tol-g-btn tol-g-active" data-ratio="4">×4 brus</button>' +
        '<button class="conv-ratio-btn tol-g-btn" data-ratio="6">×6 soustř.</button>' +
        '<button class="conv-ratio-btn tol-g-btn" data-ratio="5">×5 fréz.</button>' +
      '</div>' +
    '</div>' +
    '<div class="conv-section">' +
      '<div class="conv-label">Závity TPI \u2194 stoupání</div>' +
      '<div class="conv-row">' +
        '<label class="conv-inp"><input type="number" data-conv="tpi" step="any" placeholder="0"><small>TPI</small></label>' +
        '<span class="conv-arrow">\u2194</span>' +
        '<label class="conv-inp"><input type="number" data-conv="pitch" step="any" placeholder="0"><small>mm</small></label>' +
      '</div>' +
    '</div>' +
    '<div class="conv-section">' +
      '<div class="conv-label">Tvrdost <small>(přibližně ASTM E140)</small></div>' +
      '<div class="conv-row">' +
        '<label class="conv-inp"><input type="number" data-conv="hrc" step="any" placeholder="20-68"><small>HRC</small></label>' +
        '<span class="conv-arrow">\u2194</span>' +
        '<label class="conv-inp"><input type="number" data-conv="hb" step="any" placeholder="226-728"><small>HB</small></label>' +
      '</div>' +
      '<div class="conv-row">' +
        '<label class="conv-inp"><input type="number" data-conv="hv" step="any" placeholder="0"><small>HV</small></label>' +
      '</div>' +
    '</div>' +
    '<div class="conv-section">' +
      '<div class="conv-label">Moment / Síla</div>' +
      '<div class="conv-row">' +
        '<label class="conv-inp"><input type="number" data-conv="nm" step="any" placeholder="0"><small>Nm</small></label>' +
        '<span class="conv-arrow">\u2194</span>' +
        '<label class="conv-inp"><input type="number" data-conv="kgm" step="any" placeholder="0"><small>kgm</small></label>' +
      '</div>' +
    '</div>';

  const overlay = makeOverlay("convert", "\uD83D\uDD04 P\u0159evodn\u00EDk", body);
  if (!overlay) return;

  const gc = id => overlay.querySelector('[data-conv="' + id + '"]');

  // Ra/Rz ratio buttons
  var raRzRatio = 4;
  var ratioButtons = overlay.querySelectorAll('.conv-ratio-btn');
  ratioButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      ratioButtons.forEach(function(b) { b.classList.remove('tol-g-active'); });
      btn.classList.add('tol-g-active');
      raRzRatio = parseFloat(btn.dataset.ratio);
      // Re-trigger conversion
      var raInp = gc("ra");
      if (raInp.value !== "") {
        gc("rz").value = parseFloat((safeEvalMath(raInp.value) * raRzRatio).toFixed(6));
      }
    });
  });

  const pairs = [
    { a: gc("mm"), b: gc("inch"), aToB: v => v / 25.4, bToA: v => v * 25.4 },
    { a: gc("deg"), b: gc("rad"), aToB: v => v * Math.PI / 180, bToA: v => v * 180 / Math.PI },
    { a: gc("tpi"), b: gc("pitch"), aToB: v => 25.4 / v, bToA: v => 25.4 / v },
    { a: gc("nm"), b: gc("kgm"), aToB: v => v / 9.80665, bToA: v => v * 9.80665 },
  ];
  pairs.forEach(function(pair) {
    pair.a.addEventListener("input", () => {
      if (pair.a.value === "") { pair.b.value = ""; return; }
      pair.b.value = parseFloat(pair.aToB(safeEvalMath(pair.a.value)).toFixed(6));
    });
    pair.b.addEventListener("input", () => {
      if (pair.b.value === "") { pair.a.value = ""; return; }
      pair.a.value = parseFloat(pair.bToA(safeEvalMath(pair.b.value)).toFixed(6));
    });
  });

  // Ra/Rz with dynamic ratio
  var raInp = gc("ra"), rzInp = gc("rz");
  raInp.addEventListener("input", () => {
    if (raInp.value === "") { rzInp.value = ""; return; }
    rzInp.value = parseFloat((safeEvalMath(raInp.value) * raRzRatio).toFixed(6));
  });
  rzInp.addEventListener("input", () => {
    if (rzInp.value === "") { raInp.value = ""; return; }
    raInp.value = parseFloat((safeEvalMath(rzInp.value) / raRzRatio).toFixed(6));
  });

  // Hardness: HRC ↔ HB (interpolated), HV ≈ HB × 1.05 (approximate)
  var hrcInp = gc("hrc"), hbInp = gc("hb"), hvInp = gc("hv");

  function hrcToHb(hrc) {
    if (hrc < 20) return hrcHbTable[0][1];
    if (hrc > 68) return hrcHbTable[hrcHbTable.length-1][1];
    for (var i = 0; i < hrcHbTable.length - 1; i++) {
      if (hrc >= hrcHbTable[i][0] && hrc <= hrcHbTable[i+1][0]) {
        var t = (hrc - hrcHbTable[i][0]) / (hrcHbTable[i+1][0] - hrcHbTable[i][0]);
        return hrcHbTable[i][1] + t * (hrcHbTable[i+1][1] - hrcHbTable[i][1]);
      }
    }
    return 0;
  }
  function hbToHrc(hb) {
    if (hb < 226) return 20;
    if (hb > 728) return 68;
    for (var i = 0; i < hrcHbTable.length - 1; i++) {
      if (hb >= hrcHbTable[i][1] && hb <= hrcHbTable[i+1][1]) {
        var t = (hb - hrcHbTable[i][1]) / (hrcHbTable[i+1][1] - hrcHbTable[i][1]);
        return hrcHbTable[i][0] + t * (hrcHbTable[i+1][0] - hrcHbTable[i][0]);
      }
    }
    return 0;
  }

  // Stupnice HRC platí jen 20–68: mimo ni se HRC nezobrazí (dřív se „přilepila" na 20/68)
  hrcInp.addEventListener("input", () => {
    if (hrcInp.value === "") { hbInp.value = ""; hvInp.value = ""; return; }
    var hrc = safeEvalMath(hrcInp.value);
    if (!(hrc >= 20 && hrc <= 68)) { hbInp.value = ""; hvInp.value = ""; return; }
    hbInp.value = Math.round(hrcToHb(hrc));
    hvInp.value = Math.round(interp(hrcHvTable, hrc, 0, 1));
  });
  hbInp.addEventListener("input", () => {
    if (hbInp.value === "") { hrcInp.value = ""; hvInp.value = ""; return; }
    var hb = safeEvalMath(hbInp.value);
    if (!(hb > 0)) { hrcInp.value = ""; hvInp.value = ""; return; }
    if (hb < 226 || hb > 728) { hrcInp.value = ""; hvInp.value = hb < 226 ? Math.round(hb * 1.05) : ""; return; }
    var hrc = hbToHrc(hb);
    hrcInp.value = parseFloat(hrc.toFixed(1));
    hvInp.value = Math.round(interp(hrcHvTable, hrc, 0, 1));
  });
  hvInp.addEventListener("input", () => {
    if (hvInp.value === "") { hrcInp.value = ""; hbInp.value = ""; return; }
    var hv = safeEvalMath(hvInp.value);
    if (!(hv > 0)) { hrcInp.value = ""; hbInp.value = ""; return; }
    if (hv < 238) { hrcInp.value = ""; hbInp.value = Math.round(hv / 1.05); return; }   // měkké: HB ≈ HV / 1,05
    if (hv > 940) { hrcInp.value = ""; hbInp.value = ""; return; }
    var hrc = interp(hrcHvTable, hv, 1, 0);
    hrcInp.value = parseFloat(hrc.toFixed(1));
    hbInp.value = Math.round(hrcToHb(hrc));
  });
}

// ══════════════════════════════════════════════════════════════
// ► Hmotnost
// ══════════════════════════════════════════════════════════════