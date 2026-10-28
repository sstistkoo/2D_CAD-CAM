import { showToast } from '../state.js';
import { safeEvalMath } from '../utils.js';
import { makeOverlay, onOverlayRemoved } from '../dialogFactory.js';
import { taperBoreHTML, initTaperBore } from './taperBore.js';
import { tabsHtml, wireTabs } from './calcKit.js';
import { drawBasicTaper } from './taperBasicSketch.js';
import { openInlineEdit, closeInlineEdit, wireSvgEditing, setField } from './svgInlineEdit.js';

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

  const fld = (id, label, unit, ph) =>
    '<label class="cnc-field"><span>' + label + ' <small>' + unit + '</small></span><input type="text" inputmode="decimal" autocomplete="off" data-id="' + id + '" placeholder="' + ph + '"></label>';
  const body =
    tabsHtml([['basic', 'Kužel'], ['tol', 'S tolerancí'], ['tab', 'Morse / ISO']]) +
    '<div class="tp-pane" data-pane="basic">' +
      '<div class="tp-hint">Klikni na kótu v náčrtu nebo vyplň pole – stačí 3 údaje (úhel lze zadat i jako 1:x nebo 2α).</div>' +
      '<svg class="calc-svg tp-svg" viewBox="0 0 340 238" role="img" aria-label="Náčrt kužele – klikací kóty"></svg>' +
      '<div class="cnc-fields cnc-fields-3">' +
        fld('D', 'D', 'velký Ø mm', 'např. 40') + fld('d', 'd', 'malý Ø mm', 'např. 37') + fld('L', 'L', 'délka mm', 'např. 60') +
        fld('a', 'α', 'úhel ke ose °', 'např. 1.43') + fld('K', '1 : x', 'kuželovitost', 'např. 20') + fld('a2', '2α', 'vrcholový °', 'např. 2.86') +
      '</div>' +
      '<div class="cnc-info" id="taperInfo"></div>' +
      '<div class="tb-err" id="taperWarn"></div>' +
      '<div class="cnc-result" id="taperSlide"></div>' +
      '<div class="cnc-actions">' +
        '<button class="cnc-btn cnc-btn-clear tp-clear">🗑 Vymazat</button>' +
        '<button class="cnc-btn cnc-btn-copy tp-copy">📋 Kopírovat</button>' +
      '</div>' +
    '</div>' +
    '<div class="tp-pane" data-pane="tol" hidden>' + taperBoreHTML() + '</div>' +
    '<div class="tp-pane" data-pane="tab" hidden>' +
      '<div class="cnc-table-label">Morse kužely <small>(klikni pro vyplnění)</small></div>' +
      '<div class="cnc-table-wrap cnc-table-tall">' +
        '<table class="cnc-table"><thead><tr><th></th><th>D</th><th>d</th><th>L</th><th>α</th></tr></thead>' +
        '<tbody>' + morseRows + '</tbody></table>' +
      '</div>' +
      '<div class="cnc-table-label">Metrické a ISO kužely <small>(klikni)</small></div>' +
      '<div class="cnc-table-wrap cnc-table-tall">' +
        '<table class="cnc-table" id="metricTaperTbl"><thead><tr><th>Kužel</th><th>Poměr</th><th>α</th></tr></thead>' +
        '<tbody>' + metricRows + '</tbody></table>' +
      '</div>' +
    '</div>';

  const overlay = makeOverlay("taper", "\uD83D\uDD3A Kužel", body, "cnc-window taper-window");
  if (!overlay) return;

  const inpD = overlay.querySelector('[data-id="D"]');
  const inpd = overlay.querySelector('[data-id="d"]');
  const inpL = overlay.querySelector('[data-id="L"]');
  const inpA = overlay.querySelector('[data-id="a"]');
  const inpK = overlay.querySelector('[data-id="K"]');
  const inpA2 = overlay.querySelector('[data-id="a2"]');
  const allInp = [inpD, inpd, inpL, inpA, inpK, inpA2];
  const edited = new Set();
  const infoEl = overlay.querySelector("#taperInfo");
  const slideEl = overlay.querySelector("#taperSlide");
  const sketch = overlay.querySelector(".tp-svg");
  const warnEl = overlay.querySelector("#taperWarn");

  // 🔢 Kalkulačka v liště okna – výsledek „↓" vloží do posledního aktivního pole
  const calcBtn = document.createElement("button");
  calcBtn.type = "button";
  calcBtn.className = "calc-title-tool";
  calcBtn.title = "Kalkulačka – klepni nejdřív do pole, výsledek tlačítkem ↓ se vloží do něj";
  calcBtn.textContent = "\uD83D\uDD22 Kalkulačka";
  calcBtn.addEventListener("click", e => { e.stopPropagation(); import("../ui.js").then(m => m.openCalculator()); });
  overlay.querySelector(".calc-titlebar .calc-close-btn").before(calcBtn);

  // Záložky (pamatuje poslední)
  const TAB_KEY = "skica.taperTab";
  function showTab(id) {
    overlay.querySelectorAll(".tp-pane").forEach(p => { p.hidden = p.dataset.pane !== id; });
    overlay.querySelectorAll(".calc-tab").forEach(b => b.classList.toggle("calc-tab-active", b.dataset.tab === id));
    closeInlineEdit();
    try { localStorage.setItem(TAB_KEY, id); } catch (e) { /* nedostupné */ }
  }
  wireTabs(overlay, showTab);
  let lastTab = null;
  try { lastTab = localStorage.getItem(TAB_KEY); } catch (e) { /* nedostupné */ }
  if (lastTab && overlay.querySelector('.tp-pane[data-pane="' + lastTab + '"]')) showTab(lastTab);
  onOverlayRemoved(overlay, closeInlineEdit);

  // Kliknutí na kótu v náčrtu → zadání hodnoty
  const LABELS = { D: ["Velký průměr D", "mm"], d: ["Malý průměr d", "mm"], L: ["Délka kužele L", "mm"],
    a: ["Polovrcholový úhel \u03B1", "\u00B0"], K: ["Kuželovitost 1 : x", ""], a2: ["Vrcholový úhel 2\u03B1", "\u00B0"] };
  wireSvgEditing(sketch, (key, e) => {
    const inp = overlay.querySelector('[data-id="' + key + '"]');
    if (!inp || !LABELS[key]) return;
    openInlineEdit(e, {
      label: LABELS[key][0], unit: LABELS[key][1], value: inp.value,
      hint: edited.has(key) ? "Prázdné = smazat zadání" : (inp.value ? "Dopočítáno – zadáním hodnotu zafixuješ" : ""),
      onCommit: val => setField(inp, val === null ? "" : parseFloat(val.toFixed(6))),
    });
  });

  // Prázdné nebo neplatné pole = null (neplatné se zvýrazní červeně v listeneru)
  function v(inp) {
    if (inp.value.trim() === "") return null;
    const x = safeEvalMath(inp.value);
    return Number.isFinite(x) ? x : null;
  }
  function sc(inp, val) { inp.value = parseFloat(val.toFixed(4)); inp.classList.add("computed"); }

  function solve() {
    allInp.forEach(inp => { if (!edited.has(inp.dataset.id)) inp.classList.remove("computed"); });
    // 1:x nebo vrcholový úhel → polovrcholový α
    if (!edited.has("a")) {
      const K0 = v(inpK), A20 = v(inpA2);
      if (edited.has("K") && K0 > 0) sc(inpA, Math.atan(1 / (2 * K0)) * 180 / Math.PI);
      else if (edited.has("a2") && A20 > 0) sc(inpA, A20 / 2);
    }
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

    const aK = v(inpA);
    if (aK > 0) {
      if (!edited.has("K")) sc(inpK, 1 / (2 * Math.tan(aK * Math.PI / 180)));
      if (!edited.has("a2")) sc(inpA2, 2 * aK);
    }

    const parts = [];
    const slideParts = [];
    if (v(inpD) !== null && v(inpd) !== null && v(inpL) !== null && v(inpL) > 0) {
      const taper = (v(inpD) - v(inpd)) / v(inpL);
      parts.push("Změna Ø na 1 mm: " + taper.toFixed(6));
      if (taper > 0) parts.push("1:" + (1 / taper).toFixed(2));
    }
    infoEl.textContent = parts.join("  \u2502  ");
    const warn = [];
    if (v(inpD) !== null && v(inpd) !== null && v(inpD) < v(inpd)) warn.push("D má být VĚTŠÍ průměr než d – prohoď hodnoty.");
    if ((v(inpL) !== null && v(inpL) <= 0) || (edited.has("a") && v(inpA) !== null && (v(inpA) <= 0 || v(inpA) >= 90))) warn.push("Délka musí být kladná a úhel α mezi 0° a 90°.");
    allInp.forEach(i => { if (i.value.trim() !== "" && !Number.isFinite(safeEvalMath(i.value))) warn.push("Neplatný zápis v poli " + i.dataset.id + "."); });
    warnEl.textContent = warn.join(" ");

    // Náklon příčného suportu / koníku
    const aFinal = v(inpA);
    const LFinal = v(inpL);
    const DFinal = v(inpD);
    const dFinal = v(inpd);
    if (aFinal !== null && aFinal > 0) {
      var tanA = Math.tan(aFinal * Math.PI / 180);
      slideParts.push("\uD83D\uDD27 <strong>Náklon suportu:</strong> " + aFinal.toFixed(4) + "°");
      if (LFinal) {
        // Posun koníku = L·tan(α/2) = (D − d)/2, když je kužel přes celou délku obrobku;
        // u delšího obrobku (mezi hroty) úměrně víc: (D − d)/2 · délka obrobku / L.
        var slideOffset = tanA * LFinal;
        slideParts.push("Příčný posun koníku: <strong>" + slideOffset.toFixed(3) + " mm</strong> (obrobek délky " + LFinal +
          " mm; delší obrobek: × délka obrobku / " + LFinal + ")");
      }
      if (DFinal !== null && dFinal !== null) {
        slideParts.push("Příčný přísuv na stranu: <strong>" + ((DFinal - dFinal) / 2).toFixed(3) + " mm</strong>");
      }
    }
    slideEl.innerHTML = slideParts.length ? slideParts.join("<br>") : "";
    const vals = {};
    allInp.forEach(i => { vals[i.dataset.id] = v(i); });
    drawBasicTaper(sketch, vals, edited);
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
  overlay.querySelectorAll('[data-pane="tab"] .cnc-table tbody tr').forEach(tr => {
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
        inpd.value = ""; inpL.value = ""; inpK.value = ""; inpA2.value = "";
        edited.delete("d"); edited.delete("L"); edited.delete("K"); edited.delete("a2");
        edited.add("a");
        allInp.forEach(i => i.classList.remove("computed"));
        showTab("basic");
        solve();
        return;
      }
      inpD.value = tr.dataset.mD;
      inpd.value = tr.dataset.md;
      inpL.value = tr.dataset.mL;
      inpA.value = ""; inpK.value = ""; inpA2.value = "";
      edited.clear(); edited.add("D"); edited.add("d"); edited.add("L");
      allInp.forEach(i => i.classList.remove("computed"));
      showTab("basic");
      solve();
    });
  });

  initTaperBore(overlay);
  solve();

  overlay.querySelector(".tp-clear").addEventListener("click", () => {
    allInp.forEach(i => { i.value = ""; i.classList.remove("computed"); });
    edited.clear(); solve();
  });
  overlay.querySelector(".tp-copy").addEventListener("click", () => {
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