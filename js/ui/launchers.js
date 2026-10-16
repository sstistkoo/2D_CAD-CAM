// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Tlačítka, která otevírají okna jiných modulů        ║
// ╚══════════════════════════════════════════════════════════════╝

// Vyňato z js/ui.js beze změny (16. 10. 2026, docs/plan-refaktoringu-ui.md,
// Fáze 1b): CNC kalkulačky, Trigonometrie, ✏️ CNC editor nad výkresem,
// VK / číselné zadání, CAM, AI, 📝 poznámky. Listenery se věší při načtení —
// initLauncherButtons() volá js/ui.js na původním místě (pořadí listenerů).
// Kód aplikace importuje jen z js/ui.js, nikdy z js/ui/* napřímo.

import { state } from '../state.js';
import { bridge } from '../bridge.js';
import { openCuttingCalc, openTaperCalc, openThreadCalc, openConvertCalc, openWeightCalc, openToleranceCalc, openRoughnessCalc, openDrillCalc, openNoseRadiusCalc, openBoltCircleCalc, openWireMeasureCalc, openCornerCalc, openInsertCalc, openSinumerikHub, openCamSimulator, openCncEditor } from '../cnc-calcs.js';
import { showCombinedModal } from '../dialogs/combinedModal.js';
import { openAIPanel } from '../ai/aiPanel.js';
import { openNotesDialog } from './notesDialog.js';
import { openTrigCalc } from './trigCalc.js';

/** Listenery spouštěcích tlačítek (při načtení, z js/ui.js). */
export function initLauncherButtons() {
  document.getElementById("btnOpenTrig").addEventListener("click", () => { openTrigCalc(); bridge.extendTrigCalc?.(); }); // záložka Obecný: calculators/trigGeneral.js
  document.getElementById("btnOpenCutting").addEventListener("click", openCuttingCalc);
  document.getElementById("btnOpenTaper").addEventListener("click", openTaperCalc);
  document.getElementById("btnOpenThread").addEventListener("click", openThreadCalc);
  document.getElementById("btnOpenConvert").addEventListener("click", openConvertCalc);
  document.getElementById("btnOpenWeight").addEventListener("click", openWeightCalc);
  document.getElementById("btnOpenTolerance").addEventListener("click", openToleranceCalc);
  document.getElementById("btnOpenRoughness").addEventListener("click", openRoughnessCalc);
  document.getElementById("btnOpenDrill").addEventListener("click", openDrillCalc);
  document.getElementById("btnOpenNoseRadius").addEventListener("click", openNoseRadiusCalc);
  document.getElementById("btnOpenBoltCircle").addEventListener("click", openBoltCircleCalc);
  document.getElementById("btnOpenWireMeasure").addEventListener("click", openWireMeasureCalc);
  document.getElementById("btnOpenCorner").addEventListener("click", openCornerCalc);
  document.getElementById("btnOpenInserts").addEventListener("click", openInsertCalc);
  document.getElementById("btnOpenSinumerik").addEventListener("click", openSinumerikHub);
  // CNC Editor (kreslení) – z plátna: mobilní spodní lišta (✏️ mezi VK a měřením)
  // a na desktopu stavová lišta (✏️ Editor). Z Kalkulaček byl odebrán 5. 10. 2026.
  function openDrawCncEditor() {
    const code = bridge.exportCncAsDrawn();       // celé plátno; označené objekty → zvýraznit řádky
    openCncEditor(code, { drawOnClose: true, highlight: bridge.cncAsDrawnSelection?.() || [] });
  }
  document.getElementById("desktopCncEditor")?.addEventListener("click", openDrawCncEditor);
  document.getElementById("mobileCncEditor")?.addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("topbar")?.classList.remove("mobile-open");
    document.body.classList.remove("toolbar-open");
    openDrawCncEditor();
  });
  // VK i číselné zadání sdílí jedno okno – VK je druhá záložka okna „Zadání objektu" (z pravého panelu se už nespouští).
  document.getElementById("btnNumInput")?.addEventListener("click", () => showCombinedModal('num'));
  document.getElementById("desktopNumInput")?.addEventListener("click", () => showCombinedModal('num'));
  document.getElementById("btnOpenCam").addEventListener("click", () => {
    // Pokud je něco nakresleno, vždy přegenerovat G-kód z aktuálního výkresu
    // (jinak by se po smazání objektů načetl starý cache cncOutput). Do CAM jde
    // jen hlavní profil – zdvojené čáry a kusy mimo profil řeší dialog předem
    // (dialogs/contourCheck.js).
    if (state.objects && state.objects.length > 0 && bridge.openCamFromDrawing) {
      bridge.openCamFromDrawing(code => openCamSimulator(code || undefined));
    } else if (state.objects && state.objects.length > 0 && bridge.runCncExport) {
      bridge.runCncExport();
      const code = document.getElementById("cncOutput")?.value;
      openCamSimulator(code || undefined);
    } else {
      openCamSimulator();
    }
  });
  document.getElementById("btnOpenAI")?.addEventListener("click", openAIPanel);

  // ── Poznámkový blok (profesionální verze) → js/ui/notesDialog.js ──
  document.getElementById("btnOpenNotes").addEventListener("click", openNotesDialog);
}
