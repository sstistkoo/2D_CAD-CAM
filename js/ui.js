// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – UI panely, toolbar, hinty                          ║
// ╚══════════════════════════════════════════════════════════════╝

// Rozcestník: kód žije v js/ui/*.js (rozděleno 16. 10. 2026 podle
// docs/plan-refaktoringu-ui.md). Seznam exportů je stejný jako dřív — kód
// zvenku importuje jen odsud, nikdy z js/ui/* (12 testů mockuje ../js/ui.js).
// Kód, který běží při načtení (bridge, listenery), zůstal tady v PŮVODNÍM
// POŘADÍ: moduly v js/ui/ ho nemají, mají initXxx() a ui.js je volá. Nový
// kód patří do modulu svého tématu; sem jen import / export / initXxx().
// Hlídá tests/ui-api.test.js (exporty, bridge, pořadí listenerů, stráže).
// Bez vlastního řádku tady: js/ui/cncJump.js (skok v CNC kódu, volá ho panel
// vlastností), js/ui/trigCalc.js (Trigonometrie, otevírá ji launchers.js).

import { undo, redo } from './state.js';
import { renderAll } from './render.js';
import { bridge } from './bridge.js';
import { saveSettings } from './storage/settingsStore.js';
import { getCalcClipboardValue, setCalcClipboardValue, openCalculator, initCalcButtons } from './ui/calculator.js';
import { initLauncherButtons } from './ui/launchers.js';
import { openFillColorPicker } from './ui/colorPicker.js';
import { showGridSizeDialog, showAngleSnapDialog } from './ui/gridAngleDialogs.js';
import { updateNullPointUI, clearNullPoint, initNullPointButtons } from './ui/nullPoint.js';
import { initClearAllButton, showHistoryDialog } from './ui/drawingHistory.js';
import { showSettingsDialog } from './ui/settingsDialog.js';
import { updateIntersectionList, togglePanel } from './ui/intersectionList.js';
import { updateLayerList, initLayerButtons } from './ui/layerList.js';
import { deleteObjectsByIndices, updateObjectList } from './ui/objectList.js';
import { updateProperties } from './ui/properties/index.js';
import { initToolbar, refreshToolbarActive, setTool, activateFilletChamfer, setHint, resetHint } from './ui/toolbar.js';
import {
  updateSnapPtsBtn, updateSnapGridBtn, toggleSnapGrid, updateAngleSnapBtn, toggleAngleSnap,
  updateDimsBtn, cycleDimsMode, updateCoordModeBtn, toggleCoordMode, updateXDisplayBtn,
  toggleXDisplay, updateMachineTypeBtn, toggleMachineType,
  initStatusButtons,
} from './ui/statusButtons.js';
import { updateStatusProject, showHelp, hideHelp, toggleHelp, checkFirstRunHelp, applyTheme, initHelpButtons } from './ui/helpTheme.js';

// ── Bridge registrace (rozbíjí cyklickou závislost geometry ↔ ui) ──
bridge.updateProperties = () => updateProperties();
bridge.updateObjectList = () => updateObjectList();
bridge.updateIntersectionList = () => updateIntersectionList();
bridge.updateLayerList = () => updateLayerList();
bridge.renderAll = () => renderAll();
bridge.resetHint = () => resetHint();
// Přepnutí nástroje z modulů, které ui.js importovat nemůžou (cyklus
// ui.js → combinedModal.js → vkContour.js).
bridge.setTool = (tool) => setTool(tool);
bridge.applyTheme = () => applyTheme();

// ── Uložení nastavení (zvlášť od výkresu, js/storage/settingsStore.js) ──
export function persistSettings() {
  saveSettings();
}

// ── Scroll input do viditelné oblasti na mobilu (nad klávesnici) ──
document.getElementById("sidebar").addEventListener("focus", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") {
    setTimeout(() => {
      e.target.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 300);
  }
}, true);

// ── Seznam objektů (mazání, seznam, výběr segmentu) → js/ui/objectList.js ──
export { deleteObjectsByIndices, updateObjectList };

// ── Panel vlastností → js/ui/properties/ (kostra index.js + větve podle typu) ──
export { updateProperties };

// ── Seznam průsečíků, rozbalování panelů → js/ui/intersectionList.js ──
export { updateIntersectionList, togglePanel };

// ── Výběr barvy (duha, vlastní, kapátko) → js/ui/colorPicker.js ──
bridge.openFillColorPicker = openFillColorPicker;

// ── Vrstvy (seznam, ➕ / 🗑) → js/ui/layerList.js ──
export { updateLayerList };
initLayerButtons();

// ── Přídavek (př/pl), lišta [data-tool], setTool, hinty → js/ui/toolbar.js ──
initToolbar();
export { refreshToolbarActive, setTool, activateFilletChamfer, setHint, resetHint };

// ── Přepínače stavového řádku a indikátory → js/ui/statusButtons.js ──
export {
  updateSnapPtsBtn, updateSnapGridBtn, toggleSnapGrid, updateAngleSnapBtn, toggleAngleSnap,
  updateDimsBtn, cycleDimsMode, updateCoordModeBtn, toggleCoordMode, updateXDisplayBtn,
  toggleXDisplay, updateMachineTypeBtn, toggleMachineType,
};
initStatusButtons();

// ── Nulový bod (📍, indikátor, dialog) → js/ui/nullPoint.js ──
export { updateNullPointUI, clearNullPoint };
initNullPointButtons();

// ── Undo/Redo tlačítka ──
document.getElementById("btnUndo").addEventListener("click", undo);
document.getElementById("btnRedo").addEventListener("click", redo);

// ── Průsečíky (automaticky při rozbalení panelu) ──
const _btnCalcInt = document.getElementById("btnCalcInt");
if (_btnCalcInt) _btnCalcInt.addEventListener("click", () => { if (bridge.calculateAllIntersections) bridge.calculateAllIntersections(); });

// ── Smazat vše → js/ui/drawingHistory.js ──
initClearAllButton();

// ── Historie smazaných výkresů → js/ui/drawingHistory.js ──
document.getElementById("btnHistory")?.addEventListener("click", showHistoryDialog);

// ── Kalkulačka (schránka, popup, 🔢/📋) → js/ui/calculator.js ──
export { getCalcClipboardValue, setCalcClipboardValue, openCalculator };

initCalcButtons();   // 🔢, 📋, sledování posledního pole (js/ui/calculator.js)
initLauncherButtons();   // CNC kalkulačky, Trigonometrie, ✏️ Editor, VK, CAM, AI, 📝 (js/ui/launchers.js)

// ── Dialogy mřížky a kroku úhlového snapu → js/ui/gridAngleDialogs.js ──
export { showGridSizeDialog, showAngleSnapDialog };

// ── Název projektu, nápověda, motiv → js/ui/helpTheme.js ──
export { updateStatusProject, showHelp, hideHelp, toggleHelp, checkFirstRunHelp, applyTheme };
initHelpButtons();

// ── Dialog ⚙️ Nastavení → js/ui/settingsDialog.js ──
document.getElementById('btnSettings')?.addEventListener('click', showSettingsDialog);
document.getElementById('mobileSettings')?.addEventListener('click', showSettingsDialog);
document.getElementById('desktopSettings')?.addEventListener('click', showSettingsDialog);

