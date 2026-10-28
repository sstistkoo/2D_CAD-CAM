// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Kalkulačka Kužel (okno se záložkami)                ║
// ╚══════════════════════════════════════════════════════════════╝
// Záložka „Kužel" = taperBore.js (čep i díra, tolerance, hloubky, náčrt),
// záložka „Morse / ISO" = tabulky, klepnutím vyplní kužel.

import { makeOverlay, onOverlayRemoved } from '../dialogFactory.js';
import { taperBoreHTML, initTaperBore } from './taperBore.js';
import { tabsHtml, wireTabs } from './calcKit.js';
import { closeInlineEdit } from './svgInlineEdit.js';

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
    morseRows += '<tr data-big="' + m.D + '" data-small="' + m.d + '" data-len="' + m.L + '">' +
      '<td>' + m.name + '</td><td>' + m.D + '</td><td>' + m.d + '</td><td>' + m.L + '</td><td>' + ang.toFixed(4) + '°</td></tr>';
  }
  var metricRows = "";
  for (var mti = 0; mti < metricData.length; mti++) {
    var mt = metricData[mti];
    var mAng = Math.atan(1 / (2 * mt.ratio)) * 180 / Math.PI;
    metricRows += '<tr data-ratio="' + mt.ratio + '" data-big="' + mt.D + '">' +
      '<td>' + mt.name + '</td><td>1:' + mt.ratio + '</td><td>' + mAng.toFixed(4) + '°</td></tr>';
  }

  const body =
    tabsHtml([['kuzel', 'Kužel'], ['tab', 'Morse / ISO']]) +
    '<div class="tp-pane" data-pane="kuzel">' + taperBoreHTML() + '</div>' +
    '<div class="tp-pane" data-pane="tab" hidden>' +
      '<div class="cnc-table-label">Morse kužely <small>(klepni pro vyplnění)</small></div>' +
      '<div class="cnc-table-wrap cnc-table-tall">' +
        '<table class="cnc-table"><thead><tr><th></th><th>D</th><th>d</th><th>L</th><th>α</th></tr></thead>' +
        '<tbody>' + morseRows + '</tbody></table>' +
      '</div>' +
      '<div class="cnc-table-label">Metrické a ISO kužely <small>(klepni)</small></div>' +
      '<div class="cnc-table-wrap cnc-table-tall">' +
        '<table class="cnc-table" id="metricTaperTbl"><thead><tr><th>Kužel</th><th>Poměr</th><th>α</th></tr></thead>' +
        '<tbody>' + metricRows + '</tbody></table>' +
      '</div>' +
    '</div>';

  const overlay = makeOverlay("taper", "🔺 Kužel", body, "cnc-window taper-window");
  if (!overlay) return;

  // 🔢 Kalkulačka v liště okna – výsledek „↓" vloží do posledního aktivního pole
  const calcBtn = document.createElement("button");
  calcBtn.type = "button";
  calcBtn.className = "calc-title-tool";
  calcBtn.title = "Kalkulačka – klepni nejdřív do pole, výsledek tlačítkem ↓ se vloží do něj";
  calcBtn.textContent = "🔢 Kalkulačka";
  calcBtn.addEventListener("click", e => { e.stopPropagation(); import("../ui.js").then(mod => mod.openCalculator()); });
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

  const api = initTaperBore(overlay);

  // Tabulky Morse / ISO → vyplnit kužel (data-* bez velkých písmen – HTML je
  // převádí na malá, dřívější data-mD/data-md se tak přepisovaly)
  overlay.querySelectorAll('[data-pane="tab"] .cnc-table tbody tr').forEach(tr => {
    tr.addEventListener("click", () => {
      if (!api) return;
      if (tr.dataset.ratio) api.setRatio(parseFloat(tr.dataset.ratio), parseFloat(tr.dataset.big));
      else api.setDdL(tr.dataset.big, tr.dataset.small, tr.dataset.len);
      showTab("kuzel");
    });
  });
}


// ══════════════════════════════════════════════════════════════
// ► Závity – M, G, Tr, UNC, UNF, BSW, NPT, Acme
// ══════════════════════════════════════════════════════════════