import { showToast } from '../state.js';
import { safeEvalMath } from '../utils.js';
import { makeOverlay } from '../dialogFactory.js';

export function openTaperCalc() {
  const morseData = [
    { name: "MT0", D: 9.045, d: 6.401, L: 49.8 },
    { name: "MT1", D: 12.065, d: 9.371, L: 53.5 },
    { name: "MT2", D: 17.780, d: 14.533, L: 64.0 },
    { name: "MT3", D: 23.825, d: 19.761, L: 80.5 },
    { name: "MT4", D: 31.267, d: 25.908, L: 102.5 },
    { name: "MT5", D: 44.399, d: 37.468, L: 129.5 },
  ];
  const metricData = [
    { name: "4 (1:20)", D: 4, ratio: 20 },
    { name: "6 (1:20)", D: 6, ratio: 20 },
    { name: "80 (1:20)", D: 80, ratio: 20 },
    { name: "100 (1:20)", D: 100, ratio: 20 },
    { name: "120 (1:20)", D: 120, ratio: 20 },
    { name: "160 (1:20)", D: 160, ratio: 20 },
    { name: "200 (1:20)", D: 200, ratio: 20 },
    { name: "7:24 ISO 30", D: 31.75, ratio: 3.4286 },
    { name: "7:24 ISO 40", D: 44.45, ratio: 3.4286 },
    { name: "7:24 ISO 50", D: 69.85, ratio: 3.4286 },
    { name: "1:10", D: 0, ratio: 10 },
    { name: "1:5",  D: 0, ratio: 5 },
    { name: "1:50", D: 0, ratio: 50 },
  ];

  var morseRows = "";
  for (var mi = 0; mi < morseData.length; mi++) {
    var m = morseData[mi];
    var ang = Math.atan((m.D - m.d) / (2 * m.L)) * 180 / Math.PI;
    morseRows += '<tr data-mD="' + m.D + '" data-md="' + m.d + '" data-mL="' + m.L + '">' +
      '<td>' + m.name + '</td><td>' + m.D + '</td><td>' + m.d + '</td><td>' + m.L + '</td><td>' + ang.toFixed(4) + '\u00B0</td></tr>';
  }
  var metricRows = "";
  for (var mti = 0; mti < metricData.length; mti++) {
    var mt = metricData[mti];
    var mAng = Math.atan(1 / (2 * mt.ratio)) * 180 / Math.PI;
    metricRows += '<tr data-ratio="' + mt.ratio + '" data-mD="' + mt.D + '">' +
      '<td>' + mt.name + '</td><td>1:' + mt.ratio + '</td><td>' + mAng.toFixed(4) + '\u00B0</td></tr>';
  }

  const body =
    '<div class="cnc-fields">' +
      '<label class="cnc-field"><span>D <small>mm</small></span><input type="number" data-id="D" step="any" placeholder="Velký \u00D8"></label>' +
      '<label class="cnc-field"><span>d <small>mm</small></span><input type="number" data-id="d" step="any" placeholder="Malý \u00D8"></label>' +
      '<label class="cnc-field"><span>L <small>mm</small></span><input type="number" data-id="L" step="any" placeholder="Délka"></label>' +
      '<label class="cnc-field"><span>\u03B1 <small>\u00B0</small></span><input type="number" data-id="a" step="any" placeholder="Polo. úhel"></label>' +
    '</div>' +
    '<div class="cnc-info" id="taperInfo"></div>' +
    '<div class="cnc-result" id="taperSlide"></div>' +
    '<div class="cnc-actions">' +
      '<button class="cnc-btn cnc-btn-clear">\uD83D\uDDD1 Vymazat</button>' +
      '<button class="cnc-btn cnc-btn-copy">\uD83D\uDCCB Kopírovat</button>' +
    '</div>' +
    '<div class="cnc-table-label">Morse kužely <small>(klikni pro vyplnění)</small></div>' +
    '<div class="cnc-table-wrap">' +
      '<table class="cnc-table"><thead><tr><th></th><th>D</th><th>d</th><th>L</th><th>\u03B1</th></tr></thead>' +
      '<tbody>' + morseRows + '</tbody></table>' +
    '</div>' +
    '<div class="cnc-table-label" style="margin-top:8px">Metrické a ISO kužely <small>(klikni)</small></div>' +
    '<div class="cnc-table-wrap">' +
      '<table class="cnc-table" id="metricTaperTbl"><thead><tr><th>Kužel</th><th>Poměr</th><th>\u03B1</th></tr></thead>' +
      '<tbody>' + metricRows + '</tbody></table>' +
    '</div>';

  const overlay = makeOverlay("taper", "\uD83D\uDD3A Kužel", body);
  if (!overlay) return;

  const inpD = overlay.querySelector('[data-id="D"]');
  const inpd = overlay.querySelector('[data-id="d"]');
  const inpL = overlay.querySelector('[data-id="L"]');
  const inpA = overlay.querySelector('[data-id="a"]');
  const allInp = [inpD, inpd, inpL, inpA];
  const edited = new Set();
  const infoEl = overlay.querySelector("#taperInfo");
  const slideEl = overlay.querySelector("#taperSlide");

  function v(inp) { return inp.value !== "" ? safeEvalMath(inp.value) : null; }
  function sc(inp, val) { inp.value = parseFloat(val.toFixed(4)); inp.classList.add("computed"); }

  function solve() {
    allInp.forEach(inp => { if (!edited.has(inp.dataset.id)) inp.classList.remove("computed"); });
    const D = v(inpD), d = v(inpd), L = v(inpL), a = v(inpA);
    const aRad = a !== null ? a * Math.PI / 180 : null;

    if (D !== null && d !== null && L !== null && !edited.has("a"))
      sc(inpA, Math.atan((D - d) / (2 * L)) * 180 / Math.PI);
    if (d !== null && L !== null && aRad !== null && !edited.has("D"))
      sc(inpD, d + 2 * L * Math.tan(aRad));
    if (D !== null && L !== null && aRad !== null && !edited.has("d"))
      sc(inpd, D - 2 * L * Math.tan(aRad));
    if (D !== null && d !== null && aRad !== null && !edited.has("L"))
      sc(inpL, (D - d) / (2 * Math.tan(aRad)));

    const D2 = v(inpD), d2 = v(inpd), L2 = v(inpL);
    if (D2 !== null && d2 !== null && L2 !== null && !edited.has("a") && v(inpA) === null)
      sc(inpA, Math.atan((D2 - d2) / (2 * L2)) * 180 / Math.PI);

    const parts = [];
    const slideParts = [];
    if (v(inpD) !== null && v(inpd) !== null && v(inpL) !== null) {
      const taper = (v(inpD) - v(inpd)) / v(inpL);
      parts.push("Kuželovitost: " + taper.toFixed(6));
      parts.push("1:" + (1 / taper).toFixed(2));
    }
    infoEl.textContent = parts.join("  \u2502  ");

    // Náklon příčného suportu / koníku
    const aFinal = v(inpA);
    const LFinal = v(inpL);
    const DFinal = v(inpD);
    const dFinal = v(inpd);
    if (aFinal !== null && aFinal > 0) {
      var tanA = Math.tan(aFinal * Math.PI / 180);
      slideParts.push("\uD83D\uDD27 <strong>Náklon suportu:</strong> " + aFinal.toFixed(4) + "°");
      if (LFinal) {
        var slideOffset = tanA * LFinal;
        slideParts.push("Příčný posun koníku: <strong>" + (slideOffset / 2).toFixed(3) + " mm</strong> (na délku " + LFinal + " mm)");
      }
      if (DFinal !== null && dFinal !== null) {
        slideParts.push("Příčný přísuv na stranu: <strong>" + ((DFinal - dFinal) / 2).toFixed(3) + " mm</strong>");
      }
    }
    slideEl.innerHTML = slideParts.length ? slideParts.join("<br>") : "";
  }

  allInp.forEach(inp => {
    inp.addEventListener("input", () => {
      const id = inp.dataset.id;
      if (inp.value !== "") { edited.add(id); inp.classList.remove("computed"); }
      else { edited.delete(id); }
      allInp.forEach(i => { if (!edited.has(i.dataset.id)) i.value = ""; });
      solve();
    });
  });

  // Morse table click
  overlay.querySelectorAll(".cnc-table tbody tr").forEach(tr => {
    if (!tr.dataset.mD && !tr.dataset.ratio) return;
    tr.addEventListener("click", () => {
      if (tr.dataset.ratio) {
        // Metrický kužel – vyplnit poměr
        var ratio = parseFloat(tr.dataset.ratio);
        var mD = parseFloat(tr.dataset.mD);
        var halfAngle = Math.atan(1 / (2 * ratio)) * 180 / Math.PI;
        inpA.value = halfAngle.toFixed(4);
        if (mD > 0) { inpD.value = mD; edited.add("D"); }
        else { inpD.value = ""; edited.delete("D"); }
        inpd.value = ""; inpL.value = "";
        edited.delete("d"); edited.delete("L");
        edited.add("a");
        allInp.forEach(i => i.classList.remove("computed"));
        solve();
        return;
      }
      inpD.value = tr.dataset.mD;
      inpd.value = tr.dataset.md;
      inpL.value = tr.dataset.mL;
      inpA.value = "";
      edited.clear(); edited.add("D"); edited.add("d"); edited.add("L");
      allInp.forEach(i => i.classList.remove("computed"));
      solve();
    });
  });

  overlay.querySelector(".cnc-btn-clear").addEventListener("click", () => {
    allInp.forEach(i => { i.value = ""; i.classList.remove("computed"); });
    edited.clear(); infoEl.textContent = ""; slideEl.innerHTML = "";
  });
  overlay.querySelector(".cnc-btn-copy").addEventListener("click", () => {
    const p = [];
    if (v(inpD) !== null) p.push("D=" + inpD.value);
    if (v(inpd) !== null) p.push("d=" + inpd.value);
    if (v(inpL) !== null) p.push("L=" + inpL.value);
    if (v(inpA) !== null) p.push("\u03B1=" + inpA.value + "\u00B0");
    if (slideEl.textContent) p.push(slideEl.textContent);
    if (p.length) navigator.clipboard.writeText(p.join("  ")).then(() => showToast("Zkopírováno"));
  });
}

// ══════════════════════════════════════════════════════════════
// ► Závity – M, G, Tr, UNC, UNF, BSW, NPT, Acme
// ══════════════════════════════════════════════════════════════