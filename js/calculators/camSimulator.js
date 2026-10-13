// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – CAM Simulátor (soustružení)                      ║
// ║  Konverze SimDraha.html → vanilla JS ES module            ║
// ╚══════════════════════════════════════════════════════════════╝

import { makeOverlay } from '../dialogFactory.js';
import { openCamEditor } from './camEditor.js';
import { state, showToast } from '../state.js';
import { applyAngleSnap } from '../canvas.js';
import { persistSettings, setCalcClipboardValue, getCalcClipboardValue } from '../ui.js';
import { bridge } from '../bridge.js';
import { bulgeToArc } from '../utils.js';
import { openInsertCalc } from './insert.js';
import { isAngleBetween, intersectVerticalLineSegment, intersectVerticalLineArc, samplePartingEnvelope, fitArcsToPolyline, stockClearanceIsZero, stockOuterXAtZ, getNormal, vecAngle, normalizeAngle, getArcParams, intersectLineCircle, intersectHorizontalLineSegment, _locateOnContour, arcSteps, intersectLines, intersectLinesInfinite, intersectCircleCircle, getSegEnd, getSegStart, intersectHorizontalLineArc, intersectSegAtZ, findSegIntersection, setSegEnd, setSegStart, isOnSegBounds, isWithinSegStrict, segEndPoint, segStartPoint, syncArcEndpoints, reverseSeg, dropTinyArcs, pointOnSegInterior, TRIM_TOL, LOOP_INTERIOR_MIN } from './cam/camMath.js';
import { ROUGHING_STRATEGIES } from './cam/roughingStrategies.js';
import { MaterialRemoval, buildStockLoopRaw, stockPlanLoop, toolFootprint } from './cam/materialRemoval.js';
import { makeHolderClamp } from './cam/toolEnvelope.js';
import { drawSectionPlan } from './cam/ops/sections/drawSections.js';
import { sectionLeftover } from './cam/ops/sections/sectionLeftover.js';
import { sectionRanges } from './cam/ops/sections/sectionRanges.js';
import { genButtonsHidden, regenWholeProgram } from './cam/genButtons.js';
import { computeInterferenceGuides, camRayIntersection, guidePolyPoints, guideBridgePts, mkBridgeSegs } from './cam/interferenceGuides.js';
import { StockModel, toolSweep, polyArea, polySimplify, polyOffset, polyDifference, polyUnion } from '../geom/geomCore.js';
import { boreGeom, boreMirrorSim, boreRemovedLoops, boreHoleLoop } from './cam/ops/bore.js';
import { preDrillPlan, preDrillParams, preDrillSplitIndex } from './cam/ops/borePreDrill.js';
import { boreFloorSim, boreFloorSplitIndex } from './cam/ops/boreFloor.js';
import { boreRealCollisions, partLoopOf } from './cam/boreRealCollision.js';
import { boreChainFromState } from './cam/boreContour.js';
import { ContourGouge } from './cam/contourGouge.js';
import { camConfirm, camCloseConfirm, camOffsetDialog, camAddMoveDialog } from './cam/camSimulatorDialogs.js';
import { injectCSS } from './cam/camSimulatorStyles.js';
import { _defaultCamParams, stripCodeOwnedParams } from './cam/camDefaults.js';
import { advanceAlongPath, spindleRpmAt, moveRateMmMin, buildTimeProfile, elapsedAtProgress, fmtClock, fmtDuration } from './cam/feedRates.js';
import { partOffGeom } from './cam/threadHelpers.js';
import { drillGeom, drillAutoFaceZ, drillHoleLoop } from './cam/ops/drill.js';
import { parseManualGCodeToPath, buildStockPointsFromCanvas, _parseGCodeRange, parseContourGCode, parseContourAndStockGCode } from './cam/gcodeParser.js';
import { getToolClearanceRange, segInterferesWithTool, segmentHitsPath, mergePocketGuides, markDominatedGuides, bridgeBetweenContourPoints, bridgeFromContourToStock, buildMachinableContour, normalizeContourDirection, spliceBridgeSegments, resolveOuterProfile, removeContourSelfIntersections, trimAndRemoveLoops, extendOffsetStartToAxis, resolvePointsToAbsolute, foldContourToMachiningSide } from './cam/contourBuild.js';
import { PARTING_BODY_MIN_H_MM, drawPolygonInsert, drawThreadingInsert, drawDrillTool, drawInsertAndHolderPreview, getInsertAnchorPoints, holderRectProfile, drawHolderProfileLocal, holderBottomHandles, translateHolderProfile, holderProfileSegCount, holderShapeInfoHTML, chamferProfileCorner, _polarAngleFieldHTML, wireAngleCompass, wireAllAngleCompasses, _renderInsertShapeFieldsHTML } from './cam/insertPreview.js';
import { CAM_TOOL_KEYS, getCamToolGeometry, applyCamToolGeometry, setActiveCamParams, setSavedCamTool, getSavedCamTool, DEFAULT_TOOL_MAGAZINE } from './cam/camToolPicker.js';
import { migrateLegacyMagazine, isoDefaultsAddedSince, MAGAZINE_DEFAULTS_REV } from './magazineDefaults.js';
import { computeCalculation, computeSimPath, roughingKey as _roughingKey } from './cam/calculatePipeline.js';
import { xBoundOn, xBoundValue, xRangeAnyOn } from './cam/rangeX.js';
import { pathInputsKey as _pathInputsKey, markGCodeGenerated as _markGCodeGenerated, markGCodeEdited as _markGCodeEdited, gcodeStale as _gcodeStale, cycleModeActive as _cycleModeActive, decideChange } from './cam/gcodeSync.js';
import { generateAutoGCode as _generateAutoGCode, generateGCode as _generateGCode, convertGCodeControlSystem as _convertGCodeControlSystem } from './cam/gcodeEmit.js';
import { applyPartToState, buildCombinedProgram, machinedStockPoints, makePart, partsAsMergeItems, partToolLabel, syncPartFromState, STOCK_PARAM_KEYS } from './cam/opParts.js';
import { setEditorMergeQueue } from './camEditor.js';
import { handleAutoStock as _handleAutoStock, generateDefaultStock as _generateDefaultStock } from './cam/sim/autoStock.js';
import { handleSendToCanvas as _handleSendToCanvas } from './cam/sim/sendToCanvas.js';
import { openTangentLineModal as _openTangentLineModal } from './cam/sim/tangentLineModal.js';
import { openInsertSegmentModal as _openInsertSegmentModal } from './cam/sim/insertSegmentModal.js';
import { createCollisionValidation, createHolderGougeView } from './cam/sim/collisionWarnings.js';
import { createSnap } from './cam/sim/snap.js';
import { dropInsaneSavedProgram } from './cam/sim/programSanity.js';
import { paramsPanelsHtml } from './cam/sim/paramsPanelsHtml.js';
import { paramsMachiningHtml } from './cam/sim/paramsMachiningHtml.js';
import { _defaultMagSlot, _slotNameFromFilename, _buildMagSlotFromTool, _isoMagSlot, _isoDefaultMagSlots, _setMagSlotShape } from './cam/sim/magSlots.js';
import { createKnives } from './cam/sim/knives.js';
import { createThreadPicker } from './cam/sim/threadPicker.js';
import { upgradeIsoHolders } from './cam/sim/magSlots.js';
import { createToolFiles } from './cam/sim/toolFiles.js';
import { createMagazineDialog } from './cam/sim/magazineDialog.js';
import { createToolGeometryDialog } from './cam/sim/toolGeometryDialog.js';
import { attachParamsEventsGeneral } from './cam/sim/paramsEventsGeneral.js';
import { attachParamsEventsMachining } from './cam/sim/paramsEventsMachining.js';
import { createGcodeNodes } from './cam/sim/gcodeNodes.js';
import { createHitTest } from './cam/sim/hitTest.js';
import { createGuideLines } from './cam/sim/guideLines.js';


// Verze logiky generování drah. ZVYŠ při každé změně, která mění vygenerovaný
// G-kód (hrubování/dokončování/hlídání/…). Uložený manualGCode s jinou verzí se
// při otevření CAM zahodí a dráhy se přegenerují automaticky — jinak by uživatel
// viděl staré cachované dráhy z localStorage/projektu (manualGCode se jinak
// nepřepočítává, dokud není prázdný nebo se neklikne „🔄 Dráhy"). Ruční úpravy
// G-kódu ve STEJNÉ verzi zůstávají zachované.
const PATH_LOGIC_VERSION = 3;

// ── MATH HELPERS ───────────────────────────────────────────────
// arcSteps, dist, EPSILON, TRIM_TOL, LOOP_INTERIOR_MIN, getNormal, vecAngle, normalizeAngle → přesunuto do cam/camMath.js
// getToolClearanceRange, segInterferesWithTool, segmentHitsPath, mergePocketGuides,
// markDominatedGuides, bridgeBetweenContourPoints, bridgeFromContourToStock, buildMachinableContour,
// normalizeContourDirection, spliceBridgeSegments, resolveOuterProfile, removeContourSelfIntersections,
// trimAndRemoveLoops, extendOffsetStartToAxis, resolvePointsToAbsolute, foldContourToMachiningSide
// → přesunuto do cam/contourBuild.js

// drawInsertAndHolderPreview, getInsertAnchorPoints, holderRectProfile, drawHolderProfileLocal,
// holderBottomHandles, translateHolderProfile, holderProfileSegCount, holderShapeInfoHTML,
// chamferProfileCorner, _polarAngleFieldHTML, wireAngleCompass, wireAllAngleCompasses,
// _renderInsertShapeFieldsHTML → přesunuto do cam/insertPreview.js

// CAM_TOOL_KEYS, getCamToolGeometry, applyCamToolGeometry, DEFAULT_TOOL_MAGAZINE
// → přesunuto do cam/camToolPicker.js

export function openCamSimulator(initialContour, initialGCode) {
  // Během kreslení držáku na CAD plátně je CAM overlay schovaný a plátno
  // patří CAD kreslení — nedovolit otevřít/přepnout do CAM (návrat jen přes
  // dolní lištu ✓ Potvrdit / ✕ Zrušit).
  if (state.holderDrawMode) {
    showToast('Nelze přepnout do CAM během kreslení držáku');
    return;
  }
  // Mobil: zavřít pravý panel CAD – ať je po návratu z CAM (✕ i ✓) zavřený
  // a nemusí se zavírat ručně.
  document.getElementById('sidebar')?.classList.remove('mobile-open');
  document.getElementById('sidebarOverlay')?.classList.remove('active');
  injectCSS();

  // ── Build HTML ──
  const bodyHTML = `
<div class="cam-sim-root">
  <div class="cam-sim-canvas-area">
    <div class="cam-sim-toolbar">
      <button data-act="addpt" title="Vložit za bod" style="display:none">➕</button>
      <button data-act="gextend" title="Prodloužit: klik na koncový bod úsečky (G0/G1) nebo konstrukční čáry → protáhne k nejbližšímu průsečíku s konturou / offsetem / konstrukční čarou (zapněte ✥ Dráhy)" style="display:none">⊢ Prodl</button>
      <button data-act="gtrim" title="Oříznout: klik na koncový bod úsečky (G0/G1) nebo konstrukční čáry → zkrátí k nejbližšímu průsečíku zpět (zapněte ✥ Dráhy)" style="display:none">⊣ Ořez</button>
      <button data-act="delpt" title="Odebrat bod" style="display:none">➖</button>
      <button data-act="edit-contour" title="Kontura: táhněte body kontury pro změnu jejich polohy. Vylučuje se s úpravou drah.">◆ Kontura</button>
      <button data-act="edit-paths" title="Dráhy: úprava G-kódu – táhněte uzly/úsečky dráhy; ➕/➖ na dráze přidá/smaže pohyb. Vylučuje se s úpravou kontury.">✥ Dráhy</button>
      <button data-act="fit" title="Centrovat">🎯</button>

      <button data-act="simpath" title="Cyklus: 👁 vše → ✂️ jen řezné (bez rychloposuvů) → 🙈 nic" class="cam-sim-active">👁</button>
      <button data-act="zlimits" title="Z-limity: čelisti, koník + rozsah obrábění (klikněte a táhněte čáry). Podržet = otevřít nastavení rozsahů v pravém panelu.">📏</button>
      <button data-act="snap" title="SNAP: přichytávání k bodům a hranám (jako v CAD) – kontura, polotovar i jeho offsetová čára, KONCE DRAH, středy, oblouky, úsečky" class="cam-sim-active">🧲</button>
      <button data-act="profile" title="Trasovat profil po kontuře (klikejte na body, Enter = dokončit, Esc = zrušit)">📈</button>
      <button data-act="profile-apply" title="Použít trasovaný profil jako novou konturu" class="cam-sim-preview-btn" style="display:none">✅</button>
      <button data-act="profile-cancel" title="Zrušit náhled profilu" class="cam-sim-preview-btn" style="display:none">❌</button>
      <button data-act="toggle-controls" title="Skrýt / zobrazit hlavní ovládací tlačítka" style="font-size:11px;padding:4px 8px">«»</button>
    </div>
    <div class="cam-sim-canvas-wrap"><canvas></canvas><div class="cam-sim-time-overlay"></div><div class="cam-sim-motion-overlay"></div>
      <div class="cam-sim-trace-options">
        <label class="cam-sim-trace-freeclick" title="Když je zapnuto, klik na plátně přidá bod trasy KDEKOLIV (ne jen na bod kontury/polotovaru) — s úhlovým snapem jako v CAD.">
          <input type="checkbox" class="cam-sim-trace-freeclick-cb" />
          Mimo SNAP
        </label>
        <label class="cam-sim-trace-stock" title="Spojovací úsek přes stín geometrie destičky (kudy se nejede řezem, jen přejíždí) se do potvrzené kontury zapíše jako viditelná čára (G1) místo neviditelného přejezdu (G0) — celá trasa tak vyjde jako jedna souvislá čára. Zapni jen když víš, že tudy nepovedou dráhy (např. strana držáku) — jinak riziko falešného řezu při přímém odeslání G-kódu z trasy.">
          <input type="checkbox" class="cam-sim-trace-stock-cb" />
          Souvislá trasa
        </label>
      </div>
      <div class="cam-sim-trace-bar">
        <button class="cam-sim-trace-auto" data-act="trace-auto" title="Auto profil: od posledního bodu trasy (nebo od začátku) vyznačí vyřešený profil až do konce — jen náhled, nepotvrzuje"><span class="tb-icon">⊙ </span><span class="tb-label">Auto</span></button>
        <button class="cam-sim-trace-stepfwd" data-act="trace-stepfwd" title="Přidá další úsek profilu na konec trasy">Přidat ▶</button>
        <button class="cam-sim-trace-stepback" data-act="trace-stepback" title="Ubere poslední přidaný úsek profilu / bod trasy">◀ Ubrat</button>
        <button class="cam-sim-trace-cancel" data-act="trace-cancel" title="Zrušit poslední bod / vypnout trasování (Esc)"><span class="tb-icon">✗ </span><span class="tb-label">Zrušit</span></button>
        <button class="cam-sim-trace-confirm" data-act="trace-confirm" title="Dokončit trasování profilu (Enter)"><span class="tb-icon">✓ </span><span class="tb-label">Dokončit</span></button>
      </div>
    </div>
    <div class="cam-sim-progress-bar">
      <div class="cam-sim-progress-track"><div class="cam-sim-progress-fill"></div></div>
      <span class="cam-sim-progress-pct">0%</span>
    </div>
    <div class="cam-sim-player-bar">
      <button class="cam-sim-code-toggle" data-act="toggle-code" title="Zmenšit G-kód panel na 2 řádky (běžící a následující blok)">▼</button>
      <button data-act="step-back" title="Krok zpět – předchozí pohyb">⏮</button>
      <button data-act="play" title="Spustit/Pauza">▶</button>
      <button data-act="stop" title="Zastavit a vrátit na začátek">⏹</button>
      <button data-act="step-fwd" title="Krok vpřed – další pohyb">⏭</button>
      <div class="cam-sim-speed-group">
        <button data-act="speed-down" title="Zpomalit">▼</button>
        <span class="cam-sim-speed-label">1×</span>
        <button data-act="speed-up" title="Zrychlit">▲</button>
      </div>
      <button data-act="sbl" title="Single block – krok po blocích G-kódu" style="font-size:11px;font-weight:bold;letter-spacing:0.5px">SBL</button>
    </div>
    <div class="cam-sim-code-mini">
      <div class="cam-sim-code-mini-line cam-sim-code-mini-cur" title="Běžící blok"></div>
      <div class="cam-sim-code-mini-line cam-sim-code-mini-next" title="Následující blok"></div>
    </div>
    <div class="cam-sim-code-area">
      <div class="cam-sim-code-bar">
        <span style="font-weight:bold">G-CODE</span>
        <div class="cam-sim-code-btns">
          <!-- Na desktopu jedna řada (řádky jsou display: contents), na mobilu
               dva řádky a ⚙ Nast. přes oba vpravo — otvírá pravý panel. -->
          <div class="cam-sim-code-rows">
            <div class="cam-sim-code-row">
              <button data-code="refresh" title="Přegenerovat dráhy z aktuální kontury a parametrů.">🔄 Dráhy</button>
              <button data-code="section-paths" title="Dráhy po úsecích: pro každý úsek (fialové čáry) se nastaví rozsah 📐 na jeho hranice, vygenerují se dráhy a obrobený polotovar se předá dalšímu úseku — výsledek jsou části programu Úsek 1, 2, … v pořadí podle pravidla 8">✂ <span class="cam-sim-op-full">Po úsecích</span><span class="cam-sim-op-short">Úseky</span></button>
              <button data-code="add-op" title="Nová část programu: aktuální dráhy se uzavřou jako hotová operace, spočítá se obrobený polotovar a plátno se vyčistí pro další operaci (jiný nůž, jiné parametry, jiný rozsah) na stejné kontuře">➕ <span class="cam-sim-op-full">Operace</span><span class="cam-sim-op-short">Ope.</span></button>
              <button data-code="editor" title="Otevřít v CAM Editoru pro úpravu">🔧 Editor</button>
            </div>
            <div class="cam-sim-code-row">
              <button data-code="reset-parts" title="Reset: zrušit rozdělení programu na části (Po úsecích / ➕ Operace) — vrátí se původní polotovar a rozsah, dráhy částí se smažou (jde vzít zpět přes ↩ Zpět)">↺ Reset</button>
              <button data-code="save-prog" title="Uložit celý projekt (kontura + parametry + G-kód) do souboru .camprog">💾 Uložit</button>
              <button data-code="load-prog" title="Načíst projekt ze souboru .camprog">📂 Načíst</button>
            </div>
          </div>
          <button data-code="show-sidebar" title="Zobrazit/skrýt boční panel — editor kontury, parametry stroje/nástroje/hrubování a import"><span class="cam-sim-nast-ico">⚙</span> <span class="cam-sim-nast-txt">Nast.</span></button>
        </div>
      </div>
      <div class="cam-sim-parts-bar" style="display:none"></div>
      <div class="cam-sim-code-wrap">
        <div class="cam-sim-code-backdrop"></div>
        <textarea class="cam-sim-manual-ta" spellcheck="false"
          placeholder="Zde můžete psát vlastní G-kód..."></textarea>
      </div>
    </div>
  </div>
  <div class="cam-sim-sidebar" style="display:none">
    <div class="cam-sim-header">
      <h2>🔄 CAM Simulátor</h2>
      <div class="cam-sim-undo-btns">
        <button data-act="undo" title="Zpět">↩</button>
        <button data-act="redo" title="Vpřed">↪</button>
        <button data-act="hide-sidebar" title="Zpět na G-kód">◀</button>
      </div>
    </div>
    <div class="cam-sim-errors" style="display:none"></div>
    <div class="cam-sim-tabs">
      <button data-tab="params" class="cam-sim-active">⚙ Parametry</button>
      <button data-tab="editor">✏ Editor</button>
      <button data-tab="import">📥 Import</button>
    </div>
    <div class="cam-sim-tab-body"></div>
  </div>
  <div class="cam-sim-busy" hidden role="status" aria-live="polite">
    <div class="cam-sim-busy-box">
      <span class="cam-sim-busy-icon" aria-hidden="true">⏳</span>
      <span class="cam-sim-busy-text">Generuji dráhy a G-kód…</span>
    </div>
  </div>
</div>`;

  const overlay = makeOverlay('cam-simulator', '🔄', bodyHTML, 'cam-sim-window');
  if (!overlay) return;

  // Místo nápisu „CAM Simulátor" tlačítka Zpět/Vpřed (historie úprav)
  // a tlačítko kalkulačky do titlebaru
  let undoTitleBtn = null, redoTitleBtn = null;
  const camToolbar = overlay.querySelector('.cam-sim-toolbar');
  const titlebar = overlay.querySelector('.calc-titlebar');
  if (camToolbar) {
    undoTitleBtn = document.createElement('button');
    undoTitleBtn.title = 'Zpět';
    undoTitleBtn.textContent = '↩';
    undoTitleBtn.addEventListener('click', (e) => { e.stopPropagation(); undo(); });

    redoTitleBtn = document.createElement('button');
    redoTitleBtn.title = 'Vpřed';
    redoTitleBtn.textContent = '↪';
    redoTitleBtn.addEventListener('click', (e) => { e.stopPropagation(); redo(); });

    const calcBtn = document.createElement('button');
    calcBtn.title = 'Kalkulačka';
    calcBtn.textContent = '🔢';
    calcBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      import('../ui.js').then(m => m.openCalculator());
    });

    const sep = document.createElement('span');
    sep.className = 'cam-sim-toolbar-sep';

    const origClose = titlebar?.querySelector('.calc-close-btn');
    let safeClose = null;
    if (origClose) {
      safeClose = origClose.cloneNode(true);
      origClose.replaceWith(safeClose);
      safeClose.addEventListener('click', async (e) => {
        e.stopPropagation();
        const dirty = S.past.length > 0 || S.manualGCode !== _initialGCode;
        if (!dirty) { overlay.remove(); return; }
        const choice = await camCloseConfirm();
        if (choice === 'discard') overlay.remove();
        else if (choice === 'save') {
          await handleSendToCanvas();
          // handleSendToCanvas calls overlay.remove() on success; if it returned
          // early (e.g. < 2 contour points), the overlay stays open intentionally
          // so the user can fix the contour and try again.
        }
      });
    }

    camToolbar.appendChild(sep);
    camToolbar.appendChild(undoTitleBtn);
    camToolbar.appendChild(redoTitleBtn);
    camToolbar.appendChild(calcBtn);
    if (safeClose) camToolbar.appendChild(safeClose);
  }

  // Hide floating calculators, canvas buttons and sidebar when CAM is open
  document.querySelectorAll('.calc-overlay-float').forEach(el => { el.style.display = 'none'; });
  const sidebarEl = document.getElementById('sidebar');
  if (sidebarEl) sidebarEl.style.display = 'none';
  const calcBtn = document.getElementById('canvasCalcBtn');
  const clipBtn = document.getElementById('canvasClipBtn');
  if (calcBtn) calcBtn.style.display = 'none';
  if (clipBtn) clipBtn.style.display = 'none';
  const restoreOnClose = () => {
    document.querySelectorAll('.calc-overlay-float').forEach(el => { el.style.display = ''; });
    if (sidebarEl) sidebarEl.style.display = '';
    if (calcBtn) calcBtn.style.display = '';
    // Obnovit viditelnost schránky podle jejího obsahu (skrytá, když je prázdná)
    if (clipBtn) setCalcClipboardValue(getCalcClipboardValue());
    // Uchovat geometrii nástroje pro knihovnu nožů i po zavření CAM.
    setSavedCamTool(S.params);
    setActiveCamParams(null);
  };
  const camCleanupObs = new MutationObserver(() => {
    if (!document.body.contains(overlay)) { restoreOnClose(); document.removeEventListener('keydown', traceKeyHandler, true); camCleanupObs.disconnect(); }
  });
  camCleanupObs.observe(document.body, { childList: true });

  // Enter = dokončit trasování profilu, Esc = zrušit body / vypnout režim.
  // Zachycuje se v capture fázi a stopImmediatePropagation, aby Esc nezavřel celý overlay.
  const traceKeyHandler = (e) => {
    if (!S.profileTraceMode) return;
    if (e.key === 'Escape') {
      e.stopImmediatePropagation(); e.preventDefault();
      _cancelTraceStep();
    } else if (e.key === 'Enter') {
      e.stopImmediatePropagation(); e.preventDefault();
      _finishProfileTrace();
    }
  };
  document.addEventListener('keydown', traceKeyHandler, true);

  // ── STATE ──
  const S = {
    editMode: 'contour',
    contourPoints: [
      { id: 1, type: 'G0', x: 0, z: 0, r: 0, mode: 'ABS' },
      { id: 2, type: 'G1', x: 20, z: 0, r: 0, mode: 'ABS' },
      { id: 3, type: 'G1', x: 20, z: -15, r: 0, mode: 'ABS' },
      { id: 4, type: 'G1', x: 30, z: -15, r: 0, mode: 'ABS' },
      { id: 5, type: 'G1', x: 35, z: -25, r: 0, mode: 'ABS' },
      { id: 6, type: 'G1', x: 35, z: -40, r: 0, mode: 'ABS' },
      { id: 7, type: 'G2', x: 55, z: -50, r: 10, mode: 'ABS' },
      { id: 8, type: 'G1', x: 55, z: -55, r: 0, mode: 'ABS' },
      { id: 81, type: 'G1', x: 45, z: -55, r: 0, mode: 'ABS' },
      { id: 82, type: 'G1', x: 45, z: -60, r: 0, mode: 'ABS' },
      { id: 83, type: 'G1', x: 55, z: -60, r: 0, mode: 'ABS' },
      { id: 9, type: 'G1', x: 55, z: -65, r: 0, mode: 'ABS' },
      { id: 10, type: 'G3', x: 65, z: -75, r: 12, mode: 'ABS' },
      { id: 11, type: 'G1', x: 80, z: -100, r: 0, mode: 'ABS' }
    ],
    // Díra pro vyvrtávání nakreslená v CAD jako samostatný řetěz (sekce
    // DIRA_START…DIRA_END přenosu, cam/boreContour.js). Prázdné = žádná.
    borePoints: [],
    stockPoints: [
      { id: 101, type: 'G0', x: 85, z: 2, r: 0, mode: 'ABS' },
      { id: 102, type: 'G1', x: 85, z: -105, r: 0, mode: 'ABS' },
      { id: 103, type: 'G1', x: 0, z: -105, r: 0, mode: 'ABS' }
    ],
    params: _defaultCamParams(),
    view: { scale: 3, panX: 600, panY: 350 },
    flipX: state.flipX,
    flipZ: state.flipZ,
    // Z-osa limity (čelisti/koník) a rozsah obrábění – hodnoty v Z (null = vypnuto)
    zLimits: { chuck: null, tail: null, chuckActive: false, tailActive: false, rangeStart: null, rangeEnd: null, rangeActive: false },
    // 'off' = skryto, 'fixtures' = čelisti + koník, 'range' = rozsah obrábění,
    // 'both' = vše. Cyklus: off → fixtures → range → both → off.
    showZLimits: 'off',
    // X-osa rozsah obrábění – poloměry v mm (null = neomezeno).
    xLimits: { rangeXMin: null, rangeXMax: null, active: false },
    // 'all' = vše, 'cut' = jen řezné (G1/G2/G3, skryje G0 rychloposuvy),
    // 'none' = nic. Cyklus: all → cut → none → all.
    showSimPath: 'all',
    // Vizuální úběr materiálu při simulaci (Clipper2) — zbývající polotovar
    // ořezává vybarvení, takže je vidět, co už nástroj odebral.
    showRemoval: true,
    // Referenční čáry, po kterých se NEJEDE (jen náhled): hotovní offset
    // (finishRefPath, jen rádius plátku) a plánovací obrys polotovaru
    // (Vůle X/Z, kam končí rychloposuv). Výchozí VYPNUTO — u velkého
    // rádiusu plátku leží finishRefPath jen 0,4 mm od skutečné hrubovací
    // dráhy a při běžném zoomu s ní splývá v "dvojčáru" (rozhodnutí
    // uživatele 15. 9. 2026, docs/cam-plan-2026-09-15.md bod 5).
    showRefGuides: false,
    // POZN.: obě kolizní vybarvení — oranžová stopa vnoření držáku
    // (HolderGouge) i červené zajetí do hotové kontury (ContourGouge) —
    // jsou natvrdo ZAPNUTÁ a přepínač nemají. Do 1. 9. 2026 měl držák
    // tlačítko 🟧 se stavem `showHolderCollision`; uživatel je nechal
    // odstranit, protože hlídání kolizí se nemá dát omylem vypnout.
    draggedLimit: null, // 'chuck' | 'tail' | 'rangeStart' | 'rangeEnd' | 'rangeXMin' | 'rangeXMax' nebo null
    _limitDragRaw: null, // nezaokrouhlená poloha tažené mezní čáry (kvůli snapu)
    simRunning: false, simProgress: 0,
    manualGCode: '',
    // Do programu někdo ručně sáhl (textarea, CAM Editor, tažení uzlů dráhy,
    // Prodl/Ořez, poznámka z CAD). Takový program NIKDY nepřepíše automatika —
    // jen vědomé „🔄 Dráhy", a to se předtím zeptá. Viz markGCodeEdited.
    gcodeDirty: false,
    // Otisk vstupů (parametry + kontura + polotovar + meze), ze kterých byl
    // program naposled vygenerován. Nesedí-li s aktuálním, jsou dráhy
    // v programu NEAKTUÁLNÍ — náhled na plátně ukazuje něco jiného než
    // program v editoru. Viz pathInputsKey/gcodeStale.
    gcodeKey: null,
    generatedCode: [], errors: [],
    past: [], future: [],
    draggedPointId: null, hoverPointId: null,
    isDragging: false, addPointMode: false, pointDragEnabled: false,
    gcodeEditEnabled: false,   // úprava drah (G-kód) – nezávislá na pointDragEnabled
    snapEnabled: true,   // SNAP přichytávání zapnuté hned po načtení
    controlsHidden: false,
    // Upichnutí: klikací režim pro určení Z roviny řezu (part-off).
    partOffPickMode: false,
    // Zapamatovaná geometrie destičky zvlášť pro každý tvar (délka hrany/šířka,
    // natočení, vrchol, hřbet) — aby přepnutí tvaru nepřepsalo hodnoty jiného.
    _shapeGeomMem: {},
    // Trasování profilu (klikací nástroj) — body, segmenty a náhled výsledné kontury
    profileTraceMode: false,
    _tracePoints: [],   // [{x, z}] absolutní world souřadnice (rádius, Z)
    _traceSegs: [],     // [{type:'G1'|'G2'|'G3', dist, r, cx, cz}] – segment od _tracePoints[i] do [i+1]
    _traceFreeClick: false, // "Mimo body" — dovolí přidat bod kdekoliv na plátně, ne jen na snap
    _traceCursor: null,     // {x,z} poslední pozice kurzoru v režimu "Mimo body" (náhledová čára)
    _traceThroughStock: false, // "Přes polotovar" — spojovací úsek přes stín se zapíše jako G1 (viditelný), ne G0 (neviditelný, bezpečný pro export)
    _previewContour: null, // číslovaná náhledová kontura čekající na potvrzení
    _refContour: null,      // záloha původní S.contourPoints po dobu náhledu
    // Záloha původní (před-profilové) kontury — drží se i po použití profilu,
    // aby šel profil smazat (❌) a vrátit původní konturu. null = profil není.
    _profileOriginal: null,
    // true od chvíle, kdy byla poprvé potvrzena trasa profilu (✓ Dokončit /
    // ✅ Potvrdit) — teprve pak se čára polotovaru smí ořezávat o konturu.
    _traceConfirmedOnce: false,
    activeTab: 'params', simSpeed: 1,
    singleBlock: false, simBlockTarget: null,
    _animId: null, _simLastTs: null, _simTimeSrc: null, _simTimeProf: null,
    _lastMouse: { x: 0, y: 0 }, _lastPinch: null,
    _cachedCalc: null, _hoverIsStock: false, _hoverPartOff: null,
    selectedPoints: new Set(),
    rectSelecting: false,
    rectStart: null,
    rectEnd: null,
    snapLines: [],
    // Pomocné (konstrukční) čáry — např. tečny z nástroje Úhel. Reálné
    // souřadnice (X = rádius), nejsou součástí kontury ani G-kódu.
    guideLines: [],
    _lastTapTime: 0,
    machineConfigOpen: false,
    safetyConfigOpen: false,
    materialConfigOpen: false,
    selectedMaterial: 'Ocel 11 373 (S235)',
    toolConfigOpen: false,
    machiningConfigOpen: false,
    machiningSubTab: 'hrub',
    errorsOpen: false,
    // Zásobník nástrojů — revolverový stroj. Doplní se výchozími ISO noži
    // T1–T6 (magazineDefaults.js) níž po načtení ze savu — podle jména, ať se
    // nezdvojí a nepřepíšou vlastní nože.
    toolMagazine: [],
    // Revize výchozí sady, kterou zásobník už dostal (magazineDefaults.js) —
    // nože přidané v novější revizi se přidají jednou, smazané se nevrací.
    magazineDefaultsRev: 0,
    // Poslední nůž KAŽDÉHO TVARU destičky ({ round: slot, polygon: slot, … },
    // tvar slotu zásobníku) — tlačítko tvaru ho vrátí i s držákem (uživatel
    // 7. 10. 2026: „ať si to pamatuje, co tam nastavím"). Ukládá se se stavem.
    shapeKnives: {},
    activeMagazineSlot: null,  // index aktivního slotu (null = zásobník nepoužit)
    editingMagazineSlot: null, // index právě editovaného slotu (rozbalená karta)
    // ── Skládání programu z více operací (cam/opParts.js) ──────
    // Prázdné pole = klasický jednooperační režim (vše jako dřív). Po
    // prvním „➕ Operace" se sem uloží dosavadní program jako Část 1 a
    // živý stav (params/zLimits/manualGCode/stockPoints) patří té části,
    // na kterou ukazuje activePart. Kontura je společná všem částem.
    opParts: [],
    activePart: 0,
    // 'part' = editace aktivní části (na plátně jen její dráhy nad
    // obrobeným polotovarem z předchozí části), 'all' = náhled celého
    // složeného programu od původního polotovaru (G-kód jen ke čtení).
    opView: 'part',
    // Otisk kontury, ke které části patří (viz contourKey) — null = neznámý.
    opContourKey: null
  };

  // Model vizuálního úběru materiálu (viz getRemovalModel níž). Deklarovaný
  // takhle brzo, protože ho invaliduje i applyView() při přepnutí části —
  // a to běží ještě při inicializaci, dávno před sekcí s getRemovalModel().
  let _removal = null;
  // Zbytek materiálu po úsecích (sectionLeftover.js) — jednou na výpočet.
  let _secLeft = null, _secLeftCalc = null;
  function getSectionLeftover(calc) {
    if (_secLeftCalc !== calc) {
      _secLeftCalc = calc;
      try {
        _secLeft = calc && calc.sectionPlan
          ? sectionLeftover(S.params, calc)
          : null;
      } catch (err) { console.warn('CAM: zbytek po úsecích:', err); _secLeft = null; }
    }
    return _secLeft;
  }
  let _removalCalcRef = null;
  // Druhý model nad OFFSETOVOU (vůlí-posunutou) čarou — jen pro vybarvení
  // pásu mezi oběma čarami, viz getRemovalOuterModel().
  let _removalOuter = null;
  // Záznam zajetí do hotové kontury (ContourGouge) a jeho vlastní model úběru
  // pro případ, že je vizuální úběr (⛏) vypnutý — viz getContourGouge() níž.
  let _contourGouge = null;
  let _contourGougeCalcRef = null;
  let _gougeRemoval = null;
  let _gougeRemovalRef = null;

  // Otisk kontury, se kterou byly části programu vytvořené — podle něj se
  // pozná, že kontura z CAD je mezitím jiná (polotovary částí pak nemusí
  // sedět). Zaokrouhleno na setiny mm, ať otisk nerozhodí šum ze zápisu.
  function contourKey(pts) {
    return (pts || []).map(p =>
      `${p.type}:${(+p.x || 0).toFixed(2)},${(+p.z || 0).toFixed(2)},${(+p.r || 0).toFixed(2)}`
    ).join('|');
  }

  // Otisk vstupů uložený spolu s programem (viz pathInputsKey). Drží se stranou,
  // dokud se nedoloží celý načítaný stav — teprve pak se zapíše do S.gcodeKey.
  // null = neznámý (program přišel odjinud) → dopočítá se z aktuálních vstupů.
  let _savedGcodeKey = null;

  // Load from localStorage
  const STORAGE_KEY = 'skica-cam-simulator';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const p = JSON.parse(saved);
      // `stripCodeOwnedParams`: interní příznaky (orderAwareHolder) se z uloženého
      // stavu NEBEROU — jejich výchozí hodnotu vlastní kód, viz camDefaults.js.
      if (p.params) Object.assign(S.params, stripCodeOwnedParams(p.params));
      if (Array.isArray(p.toolMagazine)) S.toolMagazine = p.toolMagazine;
      if (p.activeMagazineSlot !== undefined) S.activeMagazineSlot = p.activeMagazineSlot;
      if (typeof p.magazineDefaultsRev === 'number') S.magazineDefaultsRev = p.magazineDefaultsRev;
      if (p.shapeKnives && typeof p.shapeKnives === 'object') S.shapeKnives = p.shapeKnives;
      // Migrace: dřívější roughingStrategy 'backside' → podélně + směr zleva.
      if (S.params.roughingStrategy === 'backside') {
        S.params.roughingStrategy = 'longitudinal';
        S.params.roughingSide = 'left';
      }
      if (p.contourPoints && p.contourPoints.length > 0) S.contourPoints = p.contourPoints;
      if (p.stockPoints && p.stockPoints.length > 0) S.stockPoints = p.stockPoints;
      if (Array.isArray(p.borePoints)) S.borePoints = p.borePoints;
      // Uložené dráhy použij jen když odpovídají AKTUÁLNÍ verzi logiky
      // generování (jinak jsou zastaralé) — prázdný manualGCode se níž
      // (řádek ~3270) automaticky přegeneruje z kontury/parametrů.
      if (p.manualGCode && p.pathLogicVersion === PATH_LOGIC_VERSION && !dropInsaneSavedProgram(p.manualGCode, p.gcodeDirty)) {
        S.manualGCode = p.manualGCode;
        // Ruční zásah v uloženém programu přežije zavření appky — jinak by ho
        // po dalším otevření beze slova přepsala první auto-regenerace.
        // Stejně tak otisk: kdo zavřel appku s neaktuálními dráhami, musí
        // puntík u „🔄 Dráhy" vidět i po jejím dalším otevření.
        S.gcodeDirty = !!p.gcodeDirty;
        _savedGcodeKey = typeof p.gcodeKey === 'string' ? p.gcodeKey : null;
      }
      // flipX/flipZ se načítají výhradně ze state.flipX/flipZ (sdílený stav s CAD); ignorujeme localStorage
      if (Array.isArray(p.profileOriginal)) S._profileOriginal = p.profileOriginal;
      if (Array.isArray(p.guideLines)) S.guideLines = p.guideLines;
      if (p.zLimits) Object.assign(S.zLimits, p.zLimits);
      if (p.xLimits) Object.assign(S.xLimits, p.xLimits);
      if (p.showZLimits !== undefined) {
        // Zpětná kompatibilita: boolean → on/off, staré 'fixtures'/'range'/'both' → 'on'.
        if (typeof p.showZLimits === 'boolean') S.showZLimits = p.showZLimits ? 'on' : 'off';
        else if (p.showZLimits === 'off') S.showZLimits = 'off';
        else {
          S.showZLimits = 'on';
          // Starý formát neměl active flagy — odvodit z tri-state hodnoty.
          if (p.zLimits && !('chuckActive' in p.zLimits)) {
            S.zLimits.chuckActive = p.showZLimits === 'fixtures' || p.showZLimits === 'both';
            S.zLimits.tailActive  = p.showZLimits === 'fixtures' || p.showZLimits === 'both';
            S.zLimits.rangeActive = p.showZLimits === 'range'    || p.showZLimits === 'both';
          }
        }
      }
      if (p.showSimPath !== undefined) {
        // Zpětná kompatibilita: dříve byl boolean, teď string.
        if (typeof p.showSimPath === 'boolean') S.showSimPath = p.showSimPath ? 'all' : 'none';
        else if (['all', 'cut', 'none'].includes(p.showSimPath)) S.showSimPath = p.showSimPath;
      }
      // Úběr materiálu se zobrazuje VŽDY (tlačítko ⛏ zrušeno 25. 9. 2026) —
      // uložené `showRemoval: false` se ignoruje.
      if (typeof p.showRefGuides === 'boolean') S.showRefGuides = p.showRefGuides;
      // Části programu (operace) — jen když sedí verze logiky drah, stejně
      // jako u manualGCode; jinak by se skládaly zastaralé dráhy.
      if (Array.isArray(p.opParts) && p.opParts.length > 0 && p.pathLogicVersion === PATH_LOGIC_VERSION) {
        S.opParts = p.opParts;
        S.activePart = Math.min(Math.max(0, p.activePart | 0), S.opParts.length - 1);
        S.opContourKey = p.opContourKey || null;
      }
    }
  } catch (_) { /* ignore */ }

  // Výchozí nože zásobníku = ISO nože z katalogu (magazineDefaults.js,
  // uživatel 6. 10. 2026). Staré provizorní výchozí nože (DEFAULT_TOOL_MAGAZINE),
  // které uživatel nezměnil, se nahradí NA MÍSTĚ (stejné T); odkazy indexem
  // (aktivní slot, dokončovací nůž, části programu) jdou za nimi. Aktivní
  // slot se při náhradě zruší — S.params pořád drží starý nůž, dokud ho
  // uživatel nevymění (✅ Použít), a zelené „Aktivní" by lhalo.
  {
    const mig = migrateLegacyMagazine(S.toolMagazine, _isoMagSlot);
    if (mig.replaced.length || mig.dropped) {
      const remap = (obj, key) => { if (obj && typeof obj[key] === 'number') obj[key] = mig.map[obj[key]] ?? null; };
      const wasActive = S.activeMagazineSlot;
      S.toolMagazine = mig.magazine;
      remap(S, 'activeMagazineSlot');
      remap(S, 'editingMagazineSlot');
      remap(S.params, 'finishingSlot');
      remap(S.params, 'borePreDrillSlot');
      for (const part of S.opParts || []) { remap(part, 'activeMagazineSlot'); remap(part.params, 'finishingSlot'); remap(part.params, 'borePreDrillSlot'); }
      if (typeof wasActive === 'number' && mig.replaced.includes(S.activeMagazineSlot)) S.activeMagazineSlot = null;
      if (mig.replaced.length) {
        setTimeout(() => showToast(`Zásobník: ${mig.replaced.length} provizorních výchozích nožů nahrazeno ISO noži (PSKNR, PCLNR, PDJNR…)`), 0);
      }
    }
    // Výchozí nože jen do PRÁZDNÉHO zásobníku (první spuštění) — smazaný nůž
    // se už sám nevrací (uživatel 6. 10. 2026). Zásobník nesmí zůstat prázdný:
    // poslední nůž nejde smazat (🗑 se u něj nekreslí) a reset ho naplní.
    if (S.toolMagazine.length === 0) {
      S.toolMagazine.push(..._isoDefaultMagSlots());
    } else if ((S.magazineDefaultsRev || 0) < MAGAZINE_DEFAULTS_REV) {
      // Nože, které výchozí sada dostala v novější revizi (např. PSBNR jako
      // hrubovací, 6. 10. 2026) → JEDNOU na konec, pokud tam ještě nejsou.
      const have = new Set(S.toolMagazine.map(s => s.name));
      let next = Math.max(0, ...S.toolMagazine.map(s => s.slot)) + 1;
      const added = isoDefaultsAddedSince(S.magazineDefaultsRev || 0).filter(r => !have.has(r.name));
      for (const rec of added) S.toolMagazine.push(_isoMagSlot(rec, next++));
      if (added.length) setTimeout(() => showToast(`Do zásobníku přidán ${added.map(r => r.name).join(', ')} (od T${next - added.length}) — nový výchozí nůž, ▲▼ ho přeřadíš`), 0);
    }
    S.magazineDefaultsRev = MAGAZINE_DEFAULTS_REV;
    // Nože z 📚 katalogu se STARÝM obrysem držáku (hlava končila na břitu —
    // čelní hrubování pak nechávalo schodky, 6. 10. 2026) → opravený obrys.
    const fixed = _upgradeIsoHolders(S.toolMagazine);
    if (fixed) setTimeout(() => showToast(`Opraven obrys držáku u ${fixed} nožů z 📚 ISO katalogu (hlava teď končí 1 mm za břitem) — přegeneruj dráhy`), 0);
  }

  // Závit nakreslený v CAD (nástroj Závit ukládá metadata threadInfo na
  // úsečku hřbetu) → předvyplnit parametry záložky Závit. Aktivace
  // (threadActive) zůstává na uživateli.
  try {
    const _thObj = (state.objects || []).find(o => o && o.threadInfo && !o.isStock);
    if (_thObj) {
      const ti = _thObj.threadInfo;
      S.params.threadName = ti.name;
      S.params.threadType = ti.type || 'mc';
      S.params.threadDiameter = ti.D;
      S.params.threadPitch = ti.P;
      S.params.threadAngle = ti.angle || 60;
      S.params.threadDepth = ti.H;
      S.params.threadExternal = ti.external !== false;
      S.params.threadZStart = ti.zStart;
      S.params.threadZEnd = ti.zEnd;
      // Konec v zápichu DIN 76 → výběh do zápichu ≈ polovina jeho šířky;
      // bez zápichu nech výchozí/naposledy zadaný výběh.
      if (ti.undercut && ti.undercut.f) S.params.threadRunOut = Math.round(ti.undercut.f / 2 * 10) / 10;
      // Spodní strana závitového plátku dle typu (Tr/Acme = dno profilu).
      S.params.toolTipFlat = (ti.type === 'tr' || ti.type === 'acme')
        ? Math.round(0.366 * ti.P * 100) / 100 : 0.1;
      // CAD nástroj Závit kreslí válcové závity — případný dřívější kužel zrušit.
      S.params.threadTaperRatio = 0;
      setTimeout(() => showToast(`🧵 Z výkresu načten závit ${ti.name} — parametry v záložce Závit`), 600);
    }
  } catch (_) { /* ignore */ }

  // Synchronizace s módem canvasu — bez toho se G-kód vyexportovaný v RADIUS
  // módu interpretuje v CAMu v DIAMON (default) a kontura se vykreslí na
  // poloviční pozici. Mód v CAMu by neměl měnit fyzické umístění kontury.
  if (state.xDisplayMode === 'radius') S.params.mode = 'RADIUS';
  else if (state.xDisplayMode === 'diameter') S.params.mode = 'DIAMON';

  // Parse initial contour (+ volitelně polotovar) z G-kódu pokud byl předán.
  // CNC export v CAD obaluje polotovar značkami STOCK_START/END, takže ho
  // umíme přečíst rovnou z G-kódu bez druhého kanálu.
  let _importedContour = false;
  let _importedStockFromGCode = false;
  // Kontura, ke které patří program uložený z minulé session (localStorage) —
  // podle ní se níž pozná, že z CAD přišel JINÝ výkres (viz _staleProgramDropped).
  const _prevContourKey = contourKey(S.contourPoints);
  if (initialContour && typeof initialContour === 'string' && initialContour.trim()) {
    const parsed = parseContourAndStockGCode(initialContour);
    if (parsed.contour.length > 0) {
      S.contourPoints = parsed.contour; _importedContour = true;
      // CAD je zdroj pravdy i pro díru: přenos bez ní = díra už ve výkresu není.
      S.borePoints = parsed.bore || [];
    }
    if (parsed.stock.length >= 2) {
      S.stockPoints = parsed.stock;
      S.params.stockMode = 'casting';
      _importedStockFromGCode = true;
    }
  }

  // Fallback: pokud G-kód polotovar neobsahoval, zkus přímý canvas import
  // (isStock objekty na plátně). Pomáhá ve scénářích, kdy CAM byl otevřen
  // jinak než přes "Otevřít v CAM" (např. uložený projekt s polotovarem).
  let _stockFromCanvas = false;
  if (!_importedStockFromGCode) {
    try {
      const importedStock = buildStockPointsFromCanvas(S.params);
      if (importedStock.length >= 2) {
        S.stockPoints = importedStock;
        S.params.stockMode = 'casting';
        _stockFromCanvas = true;
      }
    } catch (e) { console.warn('buildStockPointsFromCanvas:', e); }
  }

  // Kontura přišla z CAD, ale polotovar žádný (ani v G-kódu, ani na plátně)
  // → CAD je zdroj pravdy: zahodit STARÝ tvarový polotovar z minulé CAM
  // session (přežíval v localStorage a zobrazoval se u nové kontury).
  // Rozměry náhradního válce dopočítá auto-fit v INITIAL SETUP níže.
  if (_importedContour && !_importedStockFromGCode && !_stockFromCanvas
      && (S.stockPoints.length > 0 || S.params.stockMode === 'casting')) {
    S.stockPoints = [];
    if (S.params.stockMode === 'casting') S.params.stockMode = 'cylinder';
  }

  // Kontura přišla z CAD a části programu z minulé session k ní nemusí sedět.
  // ZAHOZENÍ by ale znamenalo, že rozdělení na operace nepřežije obnovení
  // stránky (do CAM se chodí právě přes CAD) — proto se části zachovají a
  // uživatel dostane jen upozornění, když se kontura oproti nim změnila.
  let _partsContourChanged = false;
  if (_importedContour && S.opParts.length > 0 && S.opContourKey
      && S.opContourKey !== contourKey(S.contourPoints)) {
    _partsContourChanged = true;
  }
  // Polotovar překreslený v CAD patří PRVNÍ části — ostatní se odvozují
  // z předchozí operace, ne z výkresu.
  if (S.opParts.length > 0 && (_importedStockFromGCode || _stockFromCanvas) && S.stockPoints.length >= 2) {
    S.opParts[0].stockPoints = JSON.parse(JSON.stringify(S.stockPoints));
    S.opParts[0].params.stockMode = 'casting';
    S.opParts[0].baseStockLoop = null;   // původní obrys se přepočítá
  }

  // Obnovit ručně upravený G-kód uložený při ✕ → „📐 Zachovat a přenést" (CAM → CAD) jako
  // skrytá poznámka na výkrese — má přednost před localStorage/auto kódem,
  // takže ruční úpravy drah přežijí cestu tam a zpět přes CAD.
  const camNoteIdx = state.objects.findIndex(o => o.isCamPathNote);
  let _gcodeFromNote = null;
  if (camNoteIdx !== -1) {
    if (state.objects[camNoteIdx].gcode) {
      _gcodeFromNote = state.objects[camNoteIdx].gcode;
      S.manualGCode = _gcodeFromNote;
      // Poznámka nese i to, jestli v programu byl ruční zásah (starší
      // poznámky ten údaj nemají → false, jako dřív).
      S.gcodeDirty = !!state.objects[camNoteIdx].gcodeDirty;
      _savedGcodeKey = typeof state.objects[camNoteIdx].gcodeKey === 'string'
        ? state.objects[camNoteIdx].gcodeKey : null;
    }
    state.objects.splice(camNoteIdx, 1);
  }

  // Z CAD přišel JINÝ výkres, než ke kterému patří uložený program (části,
  // dráhy z localStorage nebo ze skryté poznámky na výkrese). Staré dráhy —
  // a u částí i jejich polotovar a rozsahy — patří smazané kontuře a v CAM
  // se pak kreslily přes novou (nález uživatele 29. 9. 2026: „smazal jsem
  // v CAD úsečky s rádiusem, nakreslil nový výkres a v CAM je i ten původní").
  // Program bez ručního zásahu se proto zahodí a vygeneruje znovu z nové
  // kontury; ručně upravený se nechá (hlásí se toastem, přegenerování je na
  // uživateli přes „🔄 Dráhy").
  let _staleProgramDropped = false;
  let _staleProgramKeptEdited = false;
  {
    const progKey = S.opParts.length > 0 && S.opContourKey ? S.opContourKey : _prevContourKey;
    if (_importedContour && progKey && progKey !== contourKey(S.contourPoints)
        && (S.opParts.length > 0 || (S.manualGCode && S.manualGCode.trim()))) {
      const edited = !!S.gcodeDirty || S.opParts.some(p => p && p.gcodeDirty);
      if (!edited) {
        // Rozsahy před rozdělením „✂ Po úsecích" — live rozsahy patří úseku.
        const base = S.opParts[0] && S.opParts[0].baseLimits;
        if (base) {
          S.zLimits = JSON.parse(JSON.stringify(base.z));
          S.xLimits = JSON.parse(JSON.stringify(base.x));
        }
        S.opParts = [];
        S.activePart = 0;
        S.opContourKey = null;
        S.manualGCode = '';
        S.gcodeDirty = false;
        _savedGcodeKey = null;
        _gcodeFromNote = null;
        _partsContourChanged = false;
        _staleProgramDropped = true;
      } else if (S.opParts.length === 0) {
        _staleProgramKeptEdited = true;   // u částí hlásí _partsContourChanged
      }
    }
  }

  // Kód přenesený z CAM editoru (tlačítko 🔄) je upravená dráha (manualGCode) –
  // má přednost před localStorage i auto-generací, aby se úpravy z editoru
  // vrátily zpět do simulátoru, odkud se kód původně bral.
  let _partsCollapsedByEditor = false;
  if (initialGCode && typeof initialGCode === 'string' && initialGCode.trim()) {
    // Program se vrací z CAM Editoru jako JEDEN celek. Byl-li rozdělený na
    // části a v editoru se změnil, části dál nesedí (editor spojuje i maže) —
    // vrátíme se k jednooperačnímu režimu s tím, co přišlo z editoru.
    if (S.opParts.length > 0 && initialGCode.trim() !== buildCombinedProgram(S.opParts).trim()) {
      S.opParts = [];
      S.activePart = 0;
      _partsCollapsedByEditor = true;
    }
    if (S.opParts.length === 0) {
      S.manualGCode = initialGCode;
      // Z CAM Editoru se vrací program, do kterého se dalo libovolně zasáhnout
      // → od teď je chráněný před automatickým přegenerováním.
      markGCodeEdited();
      _savedGcodeKey = null;
    }
  }

  // Části: živý stav (parametry/polotovar/G-kód) vždy dorovnat podle aktivní
  // části — v localStorage mohl zůstat náhled celého programu.
  S.opView = 'part';
  if (S.opParts.length > 0) {
    S.activePart = Math.min(Math.max(0, S.activePart), S.opParts.length - 1);
    applyPartToState(S.opParts[S.activePart], S);
    // Program z „✂ Po úsecích" se otevře v náhledu CELÉHO programu s rozsahy
    // uživatele — v zobrazení části by se rozsah vždy „přestěhoval" na
    // hranice úseku 1 (nález 25. 9. 2026).
    if (S.opParts[0].baseLimits && !_gcodeFromNote) { S.opView = 'all'; applyView(); }
    // Dráhy upravené během výletu přes CAD (✕ → „Zachovat a přenést" → poznámka na
    // výkrese) patří té části, ze které se odcházelo — applyPartToState je
    // právě přepsal uloženou verzí, tak je vrátit zpět (i do záznamu části).
    if (_gcodeFromNote) {
      S.manualGCode = _gcodeFromNote;
      S.opParts[S.activePart].gcode = _gcodeFromNote;
    }
  }

  // Pokud zatím není žádný G-kód (nová kontura, nic uloženo), počáteční
  // obsah editoru vygenerujeme automaticky z kontury/parametrů. Prázdná
  // rozpracovaná ČÁST se ale negeneruje sama — uživatel k ní teprve vybírá
  // nůž a parametry, dráhy si vyžádá tlačítkem „🔄 Dráhy".
  if ((!S.manualGCode || !S.manualGCode.trim()) && S.opParts.length === 0) {
    S.manualGCode = generateAutoGCode(calculate()).map(l => l.text).join('\n');
  }
  // Otisk vstupů, ze kterých program pochází — teprve od téhle chvíle má smysl
  // hlásit „dráhy neaktuální". Program se sem dostal spolu se svými parametry
  // (localStorage / část / poznámka z CAD), takže k nim ze své podstaty sedí;
  // rozejde se až první změnou v panelu. Změněná KONTURA z CAD má vlastní
  // hlášení (viz _partsContourChanged).
  S.gcodeKey = _savedGcodeKey || pathInputsKey();

  // ── DOM refs ──
  const root = overlay.querySelector('.cam-sim-root');
  const canvasWrap = root.querySelector('.cam-sim-canvas-wrap');
  const canvas = canvasWrap.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const codeBackdrop = root.querySelector('.cam-sim-code-backdrop');
  const manualTa = root.querySelector('.cam-sim-manual-ta');
  const codeArea = root.querySelector('.cam-sim-code-area');
  const codeMini = root.querySelector('.cam-sim-code-mini');
  const toggleCodeBtn = root.querySelector('[data-act="toggle-code"]');
  // Spodní panel G-kódu: 'open' (celý) → 'mini' (2 řádky) → 'closed' → 'open'
  // tlačítkem ▼ (setCodePanelMode).
  let codePanelMode = 'open';
  const timeOverlay = root.querySelector('.cam-sim-time-overlay');
  const motionOverlay = root.querySelector('.cam-sim-motion-overlay');
  const progressBar = root.querySelector('.cam-sim-progress-bar');
  const progressFill = root.querySelector('.cam-sim-progress-fill');
  const progressPct = root.querySelector('.cam-sim-progress-pct');
  const speedLabel = root.querySelector('.cam-sim-speed-label');
  const errorsDiv = root.querySelector('.cam-sim-errors');
  const tabBody = root.querySelector('.cam-sim-tab-body');
  const partsBar = root.querySelector('.cam-sim-parts-bar');
  const refreshBtn = root.querySelector('[data-code="refresh"]');
  const sectionBtn = root.querySelector('[data-code="section-paths"]');
  const resetPartsBtn = root.querySelector('[data-code="reset-parts"]');
  const busyEl = root.querySelector('.cam-sim-busy');
  const busyText = root.querySelector('.cam-sim-busy-text');
  // Sdílený stav oken nožů (⚙️ Geometrie × 🔧 Zásobník) — objekt, ať ho mohou
  // měnit i okna vyňatá do cam/sim/ (modul nepřepíše cizí `let`).
  const toolUi = { toolGeomModalRefresh: null, magazineDialogRefresh: null, magEditSlotRef: null, magEditHandTouched: false };
  // Refresh callback modalu "⚙️ Geometrie", pokud je otevřený — viz fullUpdate().
  // Záměrně NE na S (S.params se snapshotuje/serializuje, funkce tam nepatří).
  // Refresh seznamu otevřeného zásobníku (viz showMagazineDialog) a slot, který
  // se právě edituje přes ✏️ Upravit — po zavření Geometrie se do něj vrátí
  // upravená geometrie z S.params (drží se REFERENCE na slot, ne index: ten se
  // posune smazáním nebo 🔄 Seřazením).
  // Ruka držáku se při OTEVŘENÍ Geometrie odvozuje ze směru hrubování, takže
  // po ✏️ Upravit je v S.params odvozená hodnota, ne ta ze slotu. Zpátky se
  // smí zapsat, jen když ji uživatel v dialogu opravdu přepnul (⇄ Ruka) —
  // jinak by pouhé otevření a zavření změnilo uloženému noži ruku.
  // Zpřístupnit živé parametry nástroje modulu (knihovna nožů / projekt) a
  // převzít naposledy uložený/načtený nůž, aby přežil zavření a otevření CAM
  // i načtení projektu (viz getCamToolGeometry/applyCamToolGeometry).
  setActiveCamParams(S.params);
  const savedCamTool = getSavedCamTool();
  if (savedCamTool) {
    for (const k of CAM_TOOL_KEYS) if (savedCamTool[k] !== undefined) S.params[k] = savedCamTool[k];
  }
  bridge.refreshCamToolGeometry = () => { if (toolUi.toolGeomModalRefresh) toolUi.toolGeomModalRefresh(); };
  const toolbar = root.querySelector('.cam-sim-toolbar');
  const playerBar = root.querySelector('.cam-sim-player-bar');
  const playBtn = playerBar.querySelector('[data-act="play"]');
  const sidebar = root.querySelector('.cam-sim-sidebar');
  const _initialGCode = S.manualGCode ?? '';

  // Sync Z-limits button — prostý on/off; co se zobrazuje řídí checkboxy v parametrech
  const zlimBtn = toolbar.querySelector('[data-act="zlimits"]');
  const ZLIM_CFG = {
    off: { icon: '📏', active: false, toast: 'Limity skryty' },
    on:  { icon: '📏', active: true,  toast: 'Limity zobrazeny (dle zaškrtnutých v parametrech)' },
  };
  if (zlimBtn) {
    const cfg = ZLIM_CFG[S.showZLimits] || ZLIM_CFG.off;
    zlimBtn.classList.toggle('cam-sim-active', cfg.active);
    zlimBtn.textContent = cfg.icon;
  }
  // Sync removal toggle button to persisted state
  // Sync reference-guides toggle button to persisted state
  // Sync sim-path toggle button to persisted state (all/cut/none)
  const simPathBtn = toolbar.querySelector('[data-act="simpath"]');
  if (simPathBtn) {
    const cfg = {
      all:  { icon: '👁',  active: true },
      cut:  { icon: '✂️',  active: true },
      none: { icon: '🙈', active: false },
    }[S.showSimPath] || { icon: '👁', active: true };
    simPathBtn.classList.toggle('cam-sim-active', cfg.active);
    simPathBtn.textContent = cfg.icon;
  }

  // ── HISTORY ──
  function _snapshot() {
    return {
      contour: JSON.parse(JSON.stringify(S.contourPoints)),
      stock: JSON.parse(JSON.stringify(S.stockPoints)),
      bore: JSON.parse(JSON.stringify(S.borePoints || [])),
      guides: JSON.parse(JSON.stringify(S.guideLines || [])),
      gcode: S.manualGCode,
      gcodeDirty: S.gcodeDirty,
      gcodeKey: S.gcodeKey,
      // Parametry + zásobník/limity — zejména kvůli "🔄 Resetovat vše",
      // ať jde vzít zpět tlačítkem ↩ Zpět.
      params: JSON.parse(JSON.stringify(S.params)),
      toolMagazine: JSON.parse(JSON.stringify(S.toolMagazine || [])),
      activeMagazineSlot: S.activeMagazineSlot,
      zLimits: JSON.parse(JSON.stringify(S.zLimits)),
      xLimits: JSON.parse(JSON.stringify(S.xLimits)),
      showZLimits: S.showZLimits,
      selectedMaterial: S.selectedMaterial,
      // Části programu (operace) — aby šlo vzít zpět „➕ Operace" i smazání
      // celé části. Aktivní část se předtím sesynchronizuje ze živého stavu.
      opParts: JSON.parse(JSON.stringify(S.opParts || [])),
      activePart: S.activePart,
      opView: S.opView
    };
  }
  function _restore(s) {
    S.contourPoints = s.contour;
    S.stockPoints = s.stock;
    if (s.bore) S.borePoints = s.bore;
    if (s.guides) S.guideLines = s.guides;
    if (typeof s.gcode === 'string') S.manualGCode = s.gcode;
    // Program se vrací i se svými stavy — jinak by Zpět vrátilo ručně upravené
    // dráhy, ale příznak ochrany už ne (a otisk by hlásil cizí neaktuálnost).
    if ('gcodeDirty' in s) S.gcodeDirty = !!s.gcodeDirty;
    if ('gcodeKey' in s) S.gcodeKey = s.gcodeKey;
    if (s.params) S.params = s.params;
    if (Array.isArray(s.toolMagazine)) {
      // ✏️ Upravit drží REFERENCI na slot a obnovené pole je nová kopie ze
      // snímku — bez přenosu na slot na stejném místě by se po ↩ v Geometrii
      // úpravy do slotu při zavření už nezapsaly (flushMagSlotEdit by ho nenašel).
      const refIdx = toolUi.magEditSlotRef ? S.toolMagazine.indexOf(toolUi.magEditSlotRef) : -1;
      S.toolMagazine = s.toolMagazine;
      if (toolUi.magEditSlotRef) toolUi.magEditSlotRef = S.toolMagazine[refIdx] || null;
    }
    if ('activeMagazineSlot' in s) S.activeMagazineSlot = s.activeMagazineSlot;
    if (s.zLimits) S.zLimits = s.zLimits;
    if (s.xLimits) S.xLimits = s.xLimits;
    if (s.showZLimits) S.showZLimits = s.showZLimits;
    if (s.selectedMaterial) S.selectedMaterial = s.selectedMaterial;
    if (Array.isArray(s.opParts)) {
      S.opParts = s.opParts;
      S.activePart = Math.min(Math.max(0, s.activePart | 0), Math.max(0, S.opParts.length - 1));
      S.opView = s.opView || 'part';
    }
  }
  function pushHistory() {
    syncActivePart();
    S.past.push(_snapshot());
    S.future = [];
    updateUndoRedoBtns();
  }
  function undo() {
    if (S.past.length === 0) return;
    const prev = S.past.pop();
    S.future.unshift(_snapshot());
    _restore(prev);
    updateUndoRedoBtns();
    fullUpdate();
    if (toolUi.magazineDialogRefresh) toolUi.magazineDialogRefresh();
  }
  function redo() {
    if (S.future.length === 0) return;
    const next = S.future.shift();
    S.past.push(_snapshot());
    _restore(next);
    updateUndoRedoBtns();
    fullUpdate();
    if (toolUi.magazineDialogRefresh) toolUi.magazineDialogRefresh();
  }
  function updateUndoRedoBtns() {
    const uBtn = root.querySelector('[data-act="undo"]');
    const rBtn = root.querySelector('[data-act="redo"]');
    if (uBtn) uBtn.disabled = S.past.length === 0;
    if (rBtn) rBtn.disabled = S.future.length === 0;
    if (undoTitleBtn) undoTitleBtn.disabled = S.past.length === 0;
    if (redoTitleBtn) redoTitleBtn.disabled = S.future.length === 0;
    // ↩/↪ v hlavičce otevřeného 🔧 Zásobníku (sdílí tuhle historii).
    const magDlg = document.querySelector('.cam-mag-overlay');
    if (magDlg) {
      magDlg.querySelector('[data-act="mag-undo"]').disabled = S.past.length === 0;
      magDlg.querySelector('[data-act="mag-redo"]').disabled = S.future.length === 0;
    }
  }

  // ── SAVE ──
  function saveState() {
    syncActivePart();
    // Rozsahy nastavené v náhledu CELÉHO programu jsou uživatelovy (po „✂ Po
    // úsecích" se tam zobrazuje rozsah před rozdělením) — uložit je k první
    // části, jinak by je obnovení stránky zahodilo.
    if (partsActive() && S.opView === 'all' && S.opParts[0].baseLimits) {
      S.opParts[0].baseLimits = { z: JSON.parse(JSON.stringify(S.zLimits)), x: JSON.parse(JSON.stringify(S.xLimits)) };
    }
    // Otisk kontury drží krok s úpravami provedenými v CAM — porovnává se až
    // s konturou, která příště přijde z CAD (viz _partsContourChanged).
    if (partsActive()) S.opContourKey = contourKey(S.contourPoints);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        pathLogicVersion: PATH_LOGIC_VERSION,
        params: S.params, contourPoints: S.contourPoints,
        stockPoints: S.stockPoints, borePoints: S.borePoints, manualGCode: S.manualGCode,
        flipX: S.flipX, flipZ: S.flipZ, guideLines: S.guideLines, profileOriginal: S._profileOriginal,
        zLimits: S.zLimits, showZLimits: S.showZLimits, xLimits: S.xLimits, showSimPath: S.showSimPath,
        showRemoval: S.showRemoval, showRefGuides: S.showRefGuides,
        toolMagazine: S.toolMagazine, activeMagazineSlot: S.activeMagazineSlot,
        magazineDefaultsRev: S.magazineDefaultsRev, shapeKnives: S.shapeKnives,
        opParts: S.opParts, activePart: S.activePart, opContourKey: S.opContourKey,
        gcodeDirty: S.gcodeDirty, gcodeKey: S.gcodeKey,
      }));
    } catch (_) { /* quota */ }
  }

  // ── STAV PROGRAMU: ručně upravený × neaktuální ─────────────────
  // Pravidlo i otisk vstupů žijí v cam/gcodeSync.js (čisté funkce nad S) —
  // tady jsou jen obálky, aby se v panelu volalo bez opakovaného předávání S.
  function pathInputsKey() { return _pathInputsKey(S); }
  function markGCodeGenerated() { _markGCodeGenerated(S); }
  function markGCodeEdited() { _markGCodeEdited(S); }
  function gcodeStale() { return _gcodeStale(S); }

  /**
   * Otisk vstupů NÁHLEDU (`S._cachedCalc`). Není to `pathInputsKey()`:
   * ten popsává vstupy PROGRAMU (pod něj patnáctý puntik „neaktuální“) a
   * dvě věci v něm schází schválně, ačkoli výsledek `calculate()` ovlivňují:
   * explicitní seznam operací — v otisku programu by hlásil program
   * neaktuální sám proti sobě. Text programu v klíči NENÍ schválně: plán
   * na něm nezávisí, vzniká z něj jen simulovaná stopa (`computeSimPath`).
   *
   * Slouží JEN k tomu, aby se náhled nepočítal znovu, když se žádný z jeho
   * vstupů nezměnil: `fullUpdate()` volá čtyřicítka míst v panelu (přepnutí
   * části, návrat z CAD, obnova UI…) a plán stojí na reálném dílu sekundy.
   */
  function calcCacheKey() {
    return _pathInputsKey(S) + '\u0000' + JSON.stringify(S.operations || null);
  }

  /**
   * Přepočítat náhled TEď a zapsat ho do keše i s otiskem vstupů — následný
   * `fullUpdate()` už ho jen použije místo druhého běhu téhož výpočtu.
   * Každý zápis do `S._cachedCalc` vede sem, jinak by keš neseděla na obsah.
   */
  function recalcNow() {
    S._cachedCalc = calculate();
    S._calcCacheKey = calcCacheKey();
    S._calcErrors = S.errors.slice();
    return S._cachedCalc;
  }

  /**
   * Čeká se s plánem na „🔄 Dráhy“?
   *
   * Změna v panelu program NEPŘEPÍŠE (viz `decideChange`) — jen ho označí
   * puntikem „neaktuální“. Počítat k tomu ještě celý nový plán je práce
   * navíc: na reálném díle přes sekundu za každý klik v panelu, a výsledek
   * stejně není to, co pojede — to je pořád starý program. Dokud uživatel
   * dráhy nepřepočítá, kreslí se proto jen kontura, polotovar a stopa
   * programu; šrafování průchodů se schová (lživé by bylo horší než žádné).
   *
   * Cyklový režim (závit/upichnutí) sem nepatří: ten se přegeneruje sám,
   * a bez programu (čerstvá část) se plán počítá dál — není co jiného ukázat.
   */
  function previewDeferred() {
    return gcodeStale() && !_cycleModeActive(S.params)
      && !!(S.manualGCode && S.manualGCode.trim());
  }

  /** Obnova po změně nastavení — JEDINÉ pravidlo pro všechny ovládací prvky
   *  panelu (viz decideChange v cam/gcodeSync.js). */
  function applyChange(opts) {
    if (decideChange(S, opts) === 'regen') _regenGCode();
    else fullUpdate();
  }

  // ── ⏳ PŘESÝPACÍ HODINY při generování drah ─────────────────────
  // Výpočet běží synchronně v hlavním vlákně (na reálném díle ~1 s plán
  // + emise), okno do té doby nereaguje. Hodiny se proto musí NEJDŘÍV
  // vykreslit (nextPaint) a teprve pak se počítá; přes celé okno zároveň
  // blokují klikání. Ikona se točí CSS animací transformace — ta běží
  // v kompozitoru i při plně vytíženém hlavním vlákně.
  let _busy = false;
  function isBusy() { return _busy; }
  function setBusyText(text) { busyText.textContent = text; }
  // Počká, až prohlížeč vykreslí snímek: rAF běží PŘED vykreslením, timeout
  // až PO něm. Záložní timeout pro prostředí bez rAF (skrytá karta; Browser
  // pane aplikace rAF nevolá) — jinak by se čekalo věčně.
  function nextPaint() {
    return new Promise(resolve => {
      let done = false;
      const go = () => { if (!done) { done = true; resolve(); } };
      requestAnimationFrame(() => setTimeout(go, 0));
      setTimeout(go, 100);
    });
  }
  async function withBusy(text, fn) {
    if (_busy) return;
    _busy = true;
    setBusyText(text);
    busyEl.hidden = false;
    try {
      await nextPaint();
      await fn();
    } finally {
      _busy = false;
      busyEl.hidden = true;
    }
  }

  // ── ČÁSTI PROGRAMU (operace) ───────────────────────────────────
  // Viz cam/opParts.js. Živý stav S vždy patří části S.opParts[S.activePart];
  // syncActivePart() ho do záznamu zapíše, applyPart() naopak nahraje.
  // Prázdné S.opParts = klasický jednooperační režim (nic se neděje).
  function partsActive() { return S.opParts.length > 0; }
  function activePartRec() { return partsActive() ? S.opParts[S.activePart] : null; }
  function syncActivePart() {
    if (S.opView !== 'part') return;   // v náhledu celého programu se nezapisuje
    const p = activePartRec();
    if (p) syncPartFromState(p, S);
  }

  // Program všech částí za sebou (hlavička se opakuje jen tam, kde se něco
  // mění; při výměně nože se vypíše nájezd do ref. bodu — viz gcodeMerge.js).
  function combinedProgram() {
    if (!partsActive()) return S.manualGCode;
    syncActivePart();
    return buildCombinedProgram(S.opParts);
  }
  // Kód, který jde „ven" (export, editor, schránka): celý program, ne jen část.
  function outputGCode() { return partsActive() ? combinedProgram() : S.manualGCode; }

  // Nahraje do živého stavu buď aktivní část, nebo (opView='all') celý
  // program nad PŮVODNÍM polotovarem z první části.
  function applyView() {
    if (!partsActive()) return;
    const part = S.opParts[S.activePart];
    if (!part) return;
    if (S.opView === 'all') {
      applyPartToState(part, S);
      const first = S.opParts[0];
      S.stockPoints = JSON.parse(JSON.stringify(first.stockPoints || []));
      STOCK_PARAM_KEYS.forEach(k => { if (k in first.params) S.params[k] = first.params[k]; });
      // Po „✂ Po úsecích" ukazuje celý program uživatelův rozsah, ne rozsah
      // aktivního úseku (jinak se čáry rozsahu „přemístily" na hranici úseku).
      if (first.baseLimits) {
        S.zLimits = JSON.parse(JSON.stringify(first.baseLimits.z));
        S.xLimits = JSON.parse(JSON.stringify(first.baseLimits.x));
      }
      S.manualGCode = buildCombinedProgram(S.opParts);
    } else {
      applyPartToState(part, S);
    }
    // Program části přišel i se svými parametry, takže k nim sedí — otisk se
    // musí přenastavit, jinak by se po přepnutí části hlásily cizí dráhy jako
    // neaktuální (a naopak by se skryla neaktuálnost té nově nahrané).
    S.gcodeKey = pathInputsKey();
    S.simRunning = false; S.simProgress = 0;
    _removal = null; _removalCalcRef = null; _removalOuter = null;
    _contourGouge = null; _contourGougeCalcRef = null;
    _gougeRemoval = null; _gougeRemovalRef = null;
  }

  function setOpView(view) {
    if (S.opView === view) return;
    syncActivePart();       // ještě ve starém režimu
    S.opView = view;
    applyView();
    fullUpdate();
  }

  function switchToPart(idx) {
    if (!partsActive() || idx < 0 || idx >= S.opParts.length) return;
    syncActivePart();
    S.activePart = idx;
    if (S.opView !== 'part') S.opView = 'part';
    applyView();
    fullUpdate();
  }

  // „➕ Operace" — uzavře aktuální dráhy jako hotovou část, spočítá obrobený
  // polotovar a připraví prázdnou další část nad ním (stejná kontura).
  async function handleAddOperation() {
    if (S.opView !== 'part') { setOpView('part'); }
    // Nová část se zakládá vždy na KONCI řetězu (polotovar se odvozuje
    // z části, na které stojíme) — u starší části by přepsala následující.
    if (partsActive() && S.activePart !== S.opParts.length - 1) {
      const ok = await camConfirm('Nová část se přidá až za poslední část programu. Pokračovat?');
      if (!ok) return;
      switchToPart(S.opParts.length - 1);
    }
    if (!S.manualGCode || !S.manualGCode.trim()) {
      alert('Poslední část nemá žádné dráhy — nejdřív je vygenerujte tlačítkem „🔄 Dráhy".');
      return;
    }
    const ok = await camConfirm(
      'Uzavřít aktuální dráhy jako hotovou část programu a začít novou operaci?\n\n' +
      'Dráhy zmizí z plátna a zůstane kontura + polotovar obrobený předchozími ' +
      'částmi. Pak si nastavte nůž, parametry i rozsah a klikněte na „🔄 Dráhy".');
    if (!ok) return;

    pushHistory();
    // 1) Dosavadní stav se stane částí (v klasickém režimu vzniká Část 1).
    if (!partsActive()) {
      S.opParts = [makePart(S, { name: `Část 1 – ${partToolLabel(S)}` })];
      S.activePart = 0;
    } else {
      syncActivePart();
    }
    const prev = S.opParts[S.activePart];

    // 2) Obrobený polotovar = polotovar části − vše, co její dráha odebrala.
    const calc = S._cachedCalc || calculate();
    const machined = machinedStockPoints(S.params, calc.stockPathSegments, calc.simPath);
    if (!machined.points || machined.points.length < 2) {
      showToast(machined.noAxis
        ? 'Obrobený polotovar nejde zapsat profilem (nedotýká se osy) — další část začne na stejném polotovaru.'
        : 'Obrobený polotovar se nepodařilo spočítat — další část začne na stejném polotovaru.', 5000);
    }
    // Obrys PŮVODNÍHO polotovaru si drží první část — podle něj se vybarvení
    // (CAD „Vybarvit") ořezává i v dalších operacích, kde už je polotovar
    // obrobený: co jednou odjelo do třísek, se nemá vrátit (viz draw()).
    if (!S.opParts[0].baseStockLoop && machined.baseLoop) {
      S.opParts[0].baseStockLoop = machined.baseLoop.map(p => ({
        x: Math.round(p.x * 1000) / 1000, z: Math.round(p.z * 1000) / 1000,
      }));
    }

    // 3) Nová (prázdná) část nad obrobeným polotovarem, stejný nůž/parametry
    //    jako výchozí bod — uživatel je teď přenastaví.
    const next = makePart(S, { name: `Část ${S.opParts.length + 1} – ${partToolLabel(S)}`, gcode: '' });
    if (machined.points && machined.points.length >= 2) {
      next.stockPoints = machined.points;
      next.params.stockMode = 'casting';
    } else {
      next.stockPoints = JSON.parse(JSON.stringify(prev.stockPoints));
    }
    S.opParts.push(next);
    S.activePart = S.opParts.length - 1;
    applyView();
    fullUpdate();
    const dropped = machined.dropped ? ` (${machined.dropped} oddělených zbytků zahozeno)` : '';
    showToast(`Nová část ${S.opParts.length} — nastavte nůž a parametry, pak „🔄 Dráhy"${dropped}`, 4000);
  }

  // „✂ Po úsecích" — generátor po úsecích (ops/sections/sectionRanges.js):
  // totéž, co uživatel dělal ručně přes „➕ Operace", jen automaticky.
  // Každý úsek = jedna část programu; její rozsah 📐 = hranice úseku, její
  // polotovar = to, co zbylo po předchozích úsecích (hlídání držáku tak vidí,
  // co opravdu stojí a kde je už obrobeno).
  // Základ pro nové rozdělení / reset: nastavení, které má uživatel PRÁVĚ
  // v panelu (parametry i rozsahy), a jen POLOTOVAR z první části. Dřív se
  // nahrávala celá první část — úpravy z panelu a vypnuté rozsahy se tím
  // tiše vrátily (nález uživatele 25. 9. 2026). Rozsah ČÁSTI (v zobrazení
  // jedné části) ale není uživatelův rozsah: tam platí rozsah uložený před
  // rozdělením, u ručních částí celý díl.
  function restoreBaseFromLive() {
    const clone = (v) => JSON.parse(JSON.stringify(v));
    const wasAll = S.opView === 'all';
    syncActivePart();
    const live = { params: clone(S.params), z: clone(S.zLimits), x: clone(S.xLimits) };
    const first = S.opParts[0];
    S.opView = 'part';
    applyPartToState(first, S);                 // polotovar první části
    S.params = live.params;
    STOCK_PARAM_KEYS.forEach(k => { if (k in first.params) S.params[k] = first.params[k]; });
    if (wasAll) {
      S.zLimits = live.z; S.xLimits = live.x;
    } else if (first.baseLimits) {
      S.zLimits = clone(first.baseLimits.z); S.xLimits = clone(first.baseLimits.x);
    } else {
      S.zLimits = { ...live.z, rangeActive: false };
      S.xLimits = { ...live.x, active: false };
    }
  }

  // Kroky „✂ Po úsecích" nad výpočtem `calc`: { steps }, nebo { error } =
  // proč to nejde. Tutéž podmínku čte viditelnost tlačítka (updateGenButtons),
  // takže je tlačítko vidět přesně tehdy, když funguje.
  function sectionSteps(calc) {
    const plan = calc && calc.sectionPlan;
    if (!plan || !plan.sections || plan.sections.length === 0)
      return { error: 'Úseky nejsou — dráhy po úsecích jen pro podélné hrubování kulatou/polygonem.' };
    const zs = (calc.stockWorldPoints || []).map(p => p.zReal).filter(Number.isFinite);
    if (zs.length === 0) return { error: 'Chybí polotovar.' };
    const zl = S.zLimits;
    const userRange = zl.rangeActive && Number.isFinite(zl.rangeStart) && Number.isFinite(zl.rangeEnd)
      ? { zLo: Math.min(zl.rangeStart, zl.rangeEnd), zHi: Math.max(zl.rangeStart, zl.rangeEnd) } : null;
    const steps = sectionRanges(plan, { lo: Math.min(...zs), hi: Math.max(...zs) }, userRange);
    return steps.length ? { steps } : { error: 'Žádný úsek neleží v rozsahu obrábění.' };
  }

  async function handleSectionPaths() {
    if (isBusy()) return;
    if (partsActive()) {
      const ok = await camConfirm('Dráhy po úsecích nahradí stávající části programu. Začne se na polotovaru první části. Pokračovat?');
      if (!ok) return;
    }
    await withBusy('Generuji dráhy po úsecích…', () => sectionPathsNow());
  }

  async function sectionPathsNow() {
    if (partsActive()) restoreBaseFromLive();
    recalcNow();
    const r = sectionSteps(S._cachedCalc);
    if (r.error) { showToast(r.error, 4000); return; }
    const steps = r.steps;

    pushHistory();
    const baseStock = JSON.parse(JSON.stringify(S.stockPoints));
    const baseLimits = { z: JSON.parse(JSON.stringify(S.zLimits)), x: JSON.parse(JSON.stringify(S.xLimits)) };
    const parts = [];
    let baseLoop = null, warned = '';
    for (const [i, st] of steps.entries()) {
      // Průběh v přesýpacích hodinách — před každým úsekem se nechá
      // prohlížeč vykreslit (úsek sám blokuje hlavní vlákno ~sekundu).
      if (steps.length > 1) {
        setBusyText(`Generuji dráhy po úsecích — ${st.name} (${i + 1}/${steps.length})…`);
        await nextPaint();
      }
      S.zLimits = { ...baseLimits.z, rangeStart: st.zHi, rangeEnd: st.zLo, rangeActive: true };
      // Dno úseku (`xTo`) se SKLÁDÁ s rozsahem X uživatele — platí vyšší
      // z obou den, strop X max zůstává jeho. Do 30. 9. 2026 se tu X max
      // přepsal na 1e4, takže se v úsecích se dnem tiše ztratil.
      if (st.xTo !== null) {
        const bx = baseLimits.x, uMin = xBoundValue(bx, 'min');
        S.xLimits = { ...bx, rangeXMin: uMin !== null ? Math.max(uMin, st.xTo) : st.xTo,
          minActive: true, maxActive: xBoundOn(bx, 'max'), active: true };
      } else {
        S.xLimits = { ...baseLimits.x };
      }
      _regenGCode();
      const calc = S._cachedCalc;
      parts.push(makePart(S, { name: st.name, gcode: S.manualGCode }));
      const machined = machinedStockPoints(S.params, calc.stockPathSegments, calc.simPath);
      if (!baseLoop && machined.baseLoop) baseLoop = machined.baseLoop;
      if (machined.points && machined.points.length >= 2) {
        S.stockPoints = machined.points;
        S.params.stockMode = 'casting';
      } else {
        warned = ` — po „${st.name}" se obrobený polotovar nepodařilo spočítat, další úsek začal na stejném`;
      }
    }
    S.opParts = parts;
    // Rozsahy PŘED rozdělením — ↺ Reset se k nim vrátí.
    S.opParts[0].baseLimits = baseLimits;
    if (baseLoop) S.opParts[0].baseStockLoop = baseLoop.map(p => ({ x: Math.round(p.x * 1000) / 1000, z: Math.round(p.z * 1000) / 1000 }));
    S.opParts[0].stockPoints = baseStock;
    S.activePart = 0;
    S.opView = 'all';
    applyView();
    fullUpdate();
    showToast(`Dráhy po úsecích: ${parts.length} ${parts.length === 1 ? 'část' : 'částí'} (${steps.map(s => s.name).join(', ')})${warned}`, 5000);
  }

  // „↺ Reset" — zruší rozdělení na části: zpět k jednooperačnímu režimu na
  // POLOTOVARU PRVNÍ ČÁSTI (původním) a rozsazích před „✂ Po úsecích".
  async function handleResetParts() {
    if (!partsActive()) { showToast('Program nemá části — není co resetovat.', 3000); return; }
    const ok = await camConfirm('Zrušit rozdělení na části? Vrátí se původní polotovar a rozsah, dráhy všech částí se smažou (jde vzít zpět přes ↩ Zpět).');
    if (!ok) return;
    pushHistory();
    restoreBaseFromLive();
    S.opParts = [];
    S.activePart = 0;
    S.manualGCode = '';
    markGCodeGenerated();
    fullUpdate();
    showToast('Části zrušeny — původní polotovar a rozsah. Dráhy vygeneruj přes 🔄 Dráhy nebo ✂ Po úsecích.', 4000);
  }

  async function handleDeletePart(idx) {
    if (!partsActive() || idx < 0 || idx >= S.opParts.length) return;
    const name = S.opParts[idx].name;
    const ok = await camConfirm(`Smazat celou část programu „${escHTML(name)}"? Dráhy i její parametry se ztratí.`);
    if (!ok) return;
    pushHistory();
    S.opParts.splice(idx, 1);
    if (S.opParts.length === 0) {
      // Poslední část smazána → zpět do klasického jednooperačního režimu.
      S.activePart = 0;
      S.opView = 'part';
      S.manualGCode = '';
      markGCodeGenerated();   // prázdný program: není co chránit ani co hlásit
    } else {
      S.activePart = Math.min(S.activePart >= idx ? S.activePart - 1 : S.activePart, S.opParts.length - 1);
      if (S.activePart < 0) S.activePart = 0;
      if (S.opParts.length === 1) S.opView = 'part';
      applyView();
    }
    fullUpdate();
    showToast(`Část „${name}" smazána`);
  }

  // Automatický název části („Část N – NŮŽ") drží krok s vybraným nožem;
  // ručně přejmenovanou část (jiný tvar názvu) nechá být.
  function refreshAutoPartName() {
    const p = activePartRec();
    if (!p) return;
    if (/^Část \d+\s*[–-]\s*/.test(p.name)) p.name = `Část ${S.activePart + 1} – ${partToolLabel(S)}`;
  }

  function handleRenamePart(idx) {
    const p = S.opParts[idx];
    if (!p) return;
    const nm = prompt('Název části programu:', p.name);
    if (nm === null) return;
    const t = nm.trim();
    if (!t) return;
    pushHistory();
    p.name = t;
    fullUpdate();
  }

  // Všechny části do fronty „SPOJ G-KÓD" v CAM Editoru + otevřít spojený
  // program — tam se dá část ještě upravit nebo z fronty vyhodit.
  function handlePartsToEditor() {
    if (!partsActive()) { handleSendToEditor(); return; }
    const merged = combinedProgram();
    if (!merged.trim()) { alert('Žádná část nemá vygenerované dráhy.'); return; }
    setEditorMergeQueue(partsAsMergeItems(S.opParts));
    openCamEditor(merged, 0);
    showToast('Části vloženy do fronty „SPOJ G-KÓD" v CAM Editoru', 4000);
  }

  // ── Výpočetní jádro (calculate) a emise G-kódu jsou v modulech
  //    cam/calculatePipeline.js a cam/gcodeEmit.js. Zde zůstávají tenké
  //    wrappery pod původními jmény, aby všechna volající místa i headless
  //    test-capture ({ S, calculate, generateAutoGCode }) fungovaly beze změny.
  function roughingKey() { return _roughingKey(S); }
  // JE NÁSTROJ ZRCADLENÝ? Držák fyzicky sedí na OBROBENÉ straně, takže se celá
  // geometrie (destička + držák) překlopí podél Z tehdy, když se obrábí ZLEVA —
  // bez ohledu na strategii.
  //
  // POZOR: `roughingKey()` na to NENÍ — vrací 'backside' jen pro PODÉLNÉ zleva
  // (u Čelního zleva vrátí 'face'), protože slouží k výběru algoritmu, ne
  // k orientaci nástroje (zrcadlený svět řídí `mirrorsWorldZ` — táž podmínka
  // jako tady, od 30. 9. 2026 i pro čelně). Když se používal jako test zrcadlení,
  // u Čelního ZLEVA se půlka kreslení nástroje překlopila a půlka ne — plátek
  // odskočil mimo držák (nález uživatele 20. 8. 2026) — a hlavně validátor
  // i oranžové hlídání úběru dostaly držák na ŠPATNÉ straně, takže kolize
  // hlídaly proti zrcadlovému obrazu. `tests/cam-collision-free` už správně
  // používá `roughingSide === 'left'`.
  const toolMirrored = () => (S.params.roughingSide || 'right') === 'left';
  // POZNÁMKA K VÝKONU (27. 8. 2026): `calculate()` volá dvacítka míst v UI
  // a každé spustí CELÝ výpočet (na reálném díle ~2,3 s). Memoizace přes
  // `pathInputsKey` byla ZKOUŠENA a ZAMÍTNUTA: sama o sobě rozbila 9 souborů
  // testů, protože diagnostické seamy (`globalThis.__…`) se plní až při běhu
  // výpočtu; po jejich vyjmutí zůstalo 6 dalších, kde dvě varianty téhož dílu
  // vyšly shodně, ačkoli se jejich otisky liší — příčina nedohledána. Cache,
  // která může vrátit zastaralé dráhy, je horší než pomalý výpočet.
  // Správné řešení je nepočítat při každé akci v UI, ale až na „Dráhy“.
  function calculate(lightOnly = false, skipRoughing = false) {
    return computeCalculation(S, lightOnly, skipRoughing);
  }
  function generateGCode(calc) { return _generateGCode(S, calc); }
  function generateAutoGCode(calc) { return _generateAutoGCode(S, calc); }
  function convertGCodeControlSystem(code, oldCtrl, newCtrl, prms, flipX, flipZ) {
    return _convertGCodeControlSystem(code, oldCtrl, newCtrl, prms, flipX, flipZ);
  }

  // ── Vykreslení kontury z bodů {x, z, type, r} (trasování profilu) ──
  function _drawPointsContour(pts, toScreen, color, withNumbers) {
    if (!pts || pts.length === 0) return;
    ctx.beginPath();
    const start = toScreen(pts[0].x, pts[0].z);
    ctx.moveTo(start.x, start.y);
    for (let i = 1; i < pts.length; i++) {
      const p1 = pts[i - 1], p2 = pts[i];
      if (p2.type === 'G2' || p2.type === 'G3') {
        const arc = getArcParams({ x: p1.x, z: p1.z }, { x: p2.x, z: p2.z }, p2.r, p2.type);
        if (!arc.error) {
          const steps = arcSteps(arc.r, S.view.scale);
          let sA = Math.atan2(p1.x - arc.cx, p1.z - arc.cz);
          let eA = Math.atan2(p2.x - arc.cx, p2.z - arc.cz);
          if (p2.type === 'G2' && eA > sA) eA -= 2 * Math.PI;
          if (p2.type === 'G3' && eA < sA) eA += 2 * Math.PI;
          for (let j = 1; j <= steps; j++) {
            const a = sA + (eA - sA) * (j / steps);
            const pt = toScreen(arc.cx + Math.sin(a) * arc.r, arc.cz + Math.cos(a) * arc.r);
            ctx.lineTo(pt.x, pt.y);
          }
          continue;
        }
      }
      const pe = toScreen(p2.x, p2.z);
      ctx.lineTo(pe.x, pe.y);
    }
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();

    if (withNumbers) {
      pts.forEach((p, i) => {
        const pt = toScreen(p.x, p.z);
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill();
        ctx.fillStyle = '#1e1e2e'; ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), pt.x, pt.y + 0.5);
      });
    }
  }

  // ── rAF SLUČOVAČ ──────────────────────────────────────────────
  // Při tažení/posunu generuje myš 100+ událostí za sekundu a každá by jinak
  // spustila celý přepočet + překreslení. scheduleFrame() sloučí práci do max.
  // JEDNOHO běhu za snímek (~60 fps) — provede se jen poslední naplánovaná
  // funkce. flushFrame() vynutí okamžité dokončení (na konci tažení).
  let _rafId = null, _rafFn = null;
  // ── Validace kolizí držáku/destičky (Fáze 2 migrace na Clipper2) ── → cam/sim/collisionWarnings.js
  // (showSidebar je const až v EVENT WIRING → předává se líně)
  const { scheduleCollisionValidation } = createCollisionValidation({
    S, showSidebar: () => showSidebar(), renderTab, sidebar, showErrors, roughingKey, toolMirrored,
    boreSimFor, preDrillPhase, boreRealIssues, borePhases,
  });

  // ── Vizuální úběr materiálu (Fáze 1 migrace na Clipper2) ──────
  // Instance se váže na konkrétní výsledek calculate() (identita objektu);
  // po přepočtu drah se založí čerstvá nad novým polotovarem.
  // (_removal/_removalCalcRef jsou deklarované nahoře u stavu — invalidují
  // se i při přepnutí části programu, ještě před touto sekcí.)
  function getRemovalModel(calc) {
    if (!S.showRemoval || !calc || !calc.simPath || calc.simPath.length < 2) {
      _removal = null; _removalCalcRef = null; _removalOuter = null;
      return null;
    }
    const bs = boreSimFor(calc);
    if (bs) return inPreDrill(calc) ? preDrillRemoval(calc) : boreRemovalView(bs, calc);
    if (!_removal || _removalCalcRef !== calc) {
      _removal = new MaterialRemoval(S.params, S.params.drillActive ? bodyStockSegments(calc) : calc.stockPathSegments);
      _removalCalcRef = calc;
      _removalOuter = null;
    }
    if (!_removal.valid) return null;
    const fIdx = S.simProgress * (calc.simPath.length - 1);
    _removal.advanceTo(calc.simPath, fIdx);
    return _removal;
  }

  // ── PÁS MEZI POLOTOVAREM A OFFSETOVOU ČÁROU ─────────────────
  // Přídavek X/Z (polo.) je v zadání právě proto, že odlitek MŮŽE být větší —
  // materiál až k offsetové čáře tedy reálně existovat může a dráhy se podle
  // toho plánují (`planLoopRef` v gcodeEmit.js). Náhled to ale kreslil jen
  // tečkovanou čarou, takže rychloposuv, který za ni skočí, vypadal neškodně
  // (nález uživatele 19. 8. 2026: „odskok mi skočí za tu offsetovou čáru“).
  // Pás se proto vybarvuje světlejším odstínem a ubírá se stejně jako polotovar.
  //
  // Je to SAMOSTATNÝ model, ne základ toho hlavního: `_removal.baseLoop`
  // slouží i jako parita pro mazání VYBARVENÍ (`fillClipPath`) a jako obrys
  // pro části programu — kdyby zahrnoval pás, začalo by mazání žrát i výplně
  // NAD syrovým polotovarem (obrobek, anotace), které tam mají zůstat.
  function getRemovalOuterModel(calc, rm) {
    if (!rm || stockClearanceIsZero(S.params)) return null;   // čáry splývají
    if (S.params.boreActive) return null;   // vyvrtávání: pás patří vnějšímu polotovaru
    if (!_removalOuter) {
      _removalOuter = new MaterialRemoval(S.params, calc.stockPathSegments, { planningOutline: true });
    }
    if (!_removalOuter.valid) return null;
    _removalOuter.advanceTo(calc.simPath, S.simProgress * (calc.simPath.length - 1));
    return _removalOuter;
  }

  // ── Kolize držáku s materiálem (oranžové varování) ── → cam/sim/collisionWarnings.js
  const { getHolderGouge } = createHolderGougeView({ S, boreSimFor, inPreDrill, borePhases, boreLocalIdx, toolMirrored });

  // ── Zajetí do HOTOVÉ KONTURY (červené varování) ────────────────
  // Simulace ubrala materiál i tam, kde má stát hotový díl. Do 1. 9. 2026 to
  // na plátně vypadalo úplně stejně jako legitimní řez — materiál prostě
  // zmizel (nález uživatele: „simulace odebere materiál, ale není zobrazeno,
  // že to zajelo do hotovní kontury"). ContourGouge odpovídá ze STEJNÉHO
  // modelu, jaký úběr kreslí: hotový díl MÍNUS zbývající materiál.
  //
  // Model úběru se sdílí s vybarvením (`_removal`), ale hlídání nesmí zmizet
  // jen proto, že si uživatel vypnul ⛏ — v tom případě si ContourGouge vede
  // vlastní, jinak identický model.
  function getContourGouge(calc) {
    if (S.simProgress <= 0 || !calc || !calc.simPath || calc.simPath.length < 2) {
      return null;
    }
    const bs = boreSimFor(calc);
    if (bs) {
      // Během vrtání se zajetí neukazuje: vnější kontura díru nemá (vyjmula ji
      // pro vyvrtávání), vrtání do díry by svítilo jako zajetí do dílu.
      if (inPreDrill(calc)) return null;
      const out = [];
      // Zajetí tyče do dílu mimo díru (skutečný svět) — červeně, postupně podle polohy simulace.
      const pos = S.simProgress * (calc.simPath.length - 1);
      for (const it of boreRealIssues(bs, calc)) if (it.endIdx <= pos + 1e-9) out.push(...it.loops);
      for (const b of borePhases(bs)) {
        const rmB = boreRemoval(b);
        if (!rmB || !rmB.model) continue;
        if (!b.contourGouge) b.contourGouge = new ContourGouge(b.params, b.calcM.contourSegments, b.calcM.stockPathSegments);
        if (!b.contourGouge.valid) continue;
        const loopsB = b.contourGouge.update(rmB.model.loops);
        if (loopsB.length) out.push(...b.un(loopsB));
      }
      return out.length ? out : null;
    }
    let rm = (_removal && _removalCalcRef === calc && _removal.valid) ? _removal : null;
    if (!rm) {
      if (!_gougeRemoval || _gougeRemovalRef !== calc) {
        _gougeRemoval = new MaterialRemoval(S.params, calc.stockPathSegments);
        _gougeRemovalRef = calc;
      }
      if (!_gougeRemoval.valid) return null;
      rm = _gougeRemoval;
    }
    // Idempotentní i pro sdílený model (getRemovalModel ho posunul o kus výš
    // v draw()) — advanceTo se na už zpracovaném indexu hned vrátí. Bez toho
    // by hlídání záviselo na pořadí volání uvnitř draw().
    rm.advanceTo(calc.simPath, S.simProgress * (calc.simPath.length - 1));
    if (!_contourGouge || _contourGougeCalcRef !== calc) {
      _contourGouge = new ContourGouge(S.params, calc.contourSegments, calc.stockPathSegments);
      _contourGougeCalcRef = calc;
    }
    if (!_contourGouge.valid || !rm.model) return null;
    const loops = _contourGouge.update(rm.model.loops);
    return loops.length ? loops : null;
  }

  // ── VYVRTÁVÁNÍ: simulace v ZRCADLE (pravidlo 13, cam/ops/bore.js) ──────
  // Úběr, ⛔ validátor, kolize držáku i zajetí do kontury počítají s vnějším
  // nožem nad vnějším polotovarem bez díry — u vyvrtávání by rychloposuvy
  // v předvrtání hlásily kolizi a tyč by „trčela" ven ze stěny. Počítají se
  // proto ve STEJNÉM zrcadle, ve kterém vznikly dráhy (díra = hřídel,
  // předvrtání = válec, vnější nůž zprava), a výsledky se pro kreslení
  // překlopí zpátky (X = R_ref − X'). Model se váže na calc (identita).
  let _boreSim = null;
  // ── VYVRTÁVÁNÍ Z PLNÉHO (ops/borePreDrill.js) ──────────────────────────
  // Program = vrtání vrtákem + vyvrtávání tyčí. Úsek vrtání (do `iSplit`)
  // se simuluje ve SKUTEČNÉM světě vrtákem (úběr, ⛔), úsek tyče v zrcadle
  // jen ze své části dráhy — zrcadlo by vrták v ose bralo jako tyč u stěny.
  let _preDrill = null;
  function preDrillPhase(calc) {
    if (!S.params.boreActive || !S.params.borePreDrill || !calc || !calc.simPath) return null;
    if (_preDrill && _preDrill.calc === calc) return _preDrill.v;
    const iSplit = preDrillSplitIndex(calc.simPath, S.manualGCode);
    const plan = iSplit ? preDrillPlan(S) : null;
    const v = iSplit && plan && plan.ok ? { iSplit, params: preDrillParams(S.params, plan), removal: null } : null;
    _preDrill = { calc, v };
    return v;
  }
  /** Probíhá právě vrtání (simulace stojí před úsekem tyče)? */
  function inPreDrill(calc) {
    const pre = preDrillPhase(calc);
    return !!pre && S.simProgress * (calc.simPath.length - 1) < pre.iSplit;
  }
  function boreSimFor(calc) {
    if (!S.params.boreActive || !calc || !calc.simPath || calc.simPath.length < 2) return null;
    if (_boreSim && _boreSim.calc === calc) return _boreSim.ok ? _boreSim : null;
    const pre = preDrillPhase(calc);
    const i0 = pre ? pre.iSplit : 0;
    // Čelní dobrání dna (ops/boreFloor.js) má vlastní zrcadlový svět: dráha
    // od značky fáze se simuluje v něm, podélná fáze končí před ní.
    const fi = boreFloorSplitIndex(calc.simPath, S.manualGCode);
    const fl = fi && fi > i0 + 1 ? boreFloorSim(S, calc.simPath.slice(fi - 1), computeCalculation) : null;
    const sim = boreMirrorSim(S, fl ? calc.simPath.slice(i0, fi) : calc.simPath.slice(i0), computeCalculation);
    const phase = (m, iSplit) => ({ ...m, calc, ok: true, iSplit, removal: null, holderGouge: null, contourGouge: null });
    _boreSim = sim
      ? { ...phase(sim, i0), floor: fl ? phase(fl, fi - 1) : null }
      : { calc, ok: false };
    return sim ? _boreSim : null;
  }
  /**
   * Kolize tyče s hotovým dílem ve SKUTEČNÉM světě (zrcadlo nezná nic mimo díru —
   * viz cam/boreRealCollision.js). Počítá se jednou na dráhu; `endIdx` je index
   * v celé dráze simulace.
   */
  function boreRealIssues(bs, calc) {
    if (!bs.real) {
      const i0 = bs.iSplit || 0;
      let list = [];
      try {
        list = boreRealCollisions(S.params, calc.simPath.slice(i0), partLoopOf(calc))
          .map(it => ({ ...it, endIdx: it.endIdx + i0 }));
      } catch (err) { console.warn('CAM: kolize tyče s dílem selhaly:', err); }
      bs.real = list;
    }
    return bs.real;
  }
  /** Fáze vyvrtávání, každá ve svém zrcadlovém světě: podélná, případně čelní dno. */
  function borePhases(bs) { return bs.floor ? [bs, bs.floor] : [bs]; }
  /** Poloha simulace v dráze tyče (zrcadlo bere jen část za vrtáním). */
  function boreLocalIdx(bs) {
    const f = S.simProgress * (bs.calc.simPath.length - 1) - (bs.iSplit || 0);
    return Math.max(0, Math.min(bs.calcM.simPath.length - 1, f));
  }
  function boreRemoval(bs) {
    if (!bs.removal) bs.removal = new MaterialRemoval(bs.params, bs.calcM.stockPathSegments);
    if (!bs.removal.valid) return null;
    bs.removal.advanceTo(bs.calcM.simPath, boreLocalIdx(bs));
    return bs.removal;
  }
  // Největší smyčka sjednocení (díl ∪ dutina bývá jedna; při nespojitosti vyhrává největší).
  const unionLargest = (loopsA, loopsB, fallback) => {
    const u = polyUnion(loopsA, loopsB);
    return u.slice().sort((x, y) => Math.abs(polyArea([y])) - Math.abs(polyArea([x])))[0] || fallback;
  };
  /**
   * Materiál obrobku, který se vrtá / vyvrtává z plného: odlitek nakreslený jen čárou
   * (bez plochy) nemá co ubírat — pak je materiál nakreslený DÍL ∪ DUTINA (hotový kalíšek
   * díru jako materiál nemá). Dutina = díra z výkresu (uživatel 10. 10. 2026: „ať vím,
   * co se odvrtá a co tam zůstane"), bez ní vrtaný válec vrtáku.
   * @returns segmenty obrysu pro MaterialRemoval; s plošným polotovarem beze změny
   */
  function bodyStockSegments(calc) {
    let stock = null;
    try { stock = buildStockLoopRaw(S.params, calc.stockPathSegments); } catch { stock = null; }
    if (stock && stock.length >= 3 && Math.abs(polyArea([stock])) > 1) return calc.stockPathSegments;
    const part = partLoopOf(calc);
    if (!part) return calc.stockPathSegments;
    let loop = part;
    try {
      let hole = null;
      const src = boreChainFromState({ ...S, params: { ...S.params, boreSource: 'cad' } });
      const bg = src ? boreGeom({ ...S.params, boreSource: 'cad' }, src.segs) : null;
      if (bg && bg.chain) hole = boreHoleLoop(bg);
      if (!hole) hole = drillHoleLoop(S.params, drillGeom(S.params, { faceZ: drillAutoFaceZ(S), stockLoop: stock }));
      // Vyvrtávání s dírou zadanou válcem (ne z výkresu).
      if (!hole && S.params.boreActive) { const cg = boreGeom(S.params, null); if (cg.ok) hole = boreHoleLoop(cg); }
      if (hole) loop = unionLargest([hole], [part], part);
    } catch { loop = part; }
    return loop.map((p, i) => ({ type: 'line', p1: p, p2: loop[(i + 1) % loop.length] }));
  }
  /** Úběr během vrtání: skutečný polotovar, stopa vrtáku. */
  function preDrillRemoval(calc) {
    const pre = preDrillPhase(calc);
    if (!pre) return null;
    if (!pre.removal) pre.removal = new MaterialRemoval(pre.params, bodyStockSegments(calc));
    if (!pre.removal.valid) return null;
    pre.removal.advanceTo(calc.simPath, S.simProgress * (calc.simPath.length - 1));
    return pre.removal;
  }
  // Úběr pro kreslení ve SKUTEČNÉM světě: základ = celý vnější polotovar,
  // zbytek = polotovar − (předvrtání ∪ vyvrtané) — výplň i ořez vybarvení
  // pak jdou beze změny jako u vnějšího obrábění.
  function boreRemovalView(bs, calc) {
    const rm = boreRemoval(bs);
    // Základ = polotovar ∪ nakreslený díl: odlitek nakreslený jen čárou (bez plochy)
    // dává degenerovanou smyčku a celý obrobek by byl bez výplně i úběru
    // (nález uživatele 9. 10. 2026: „celej obrobek černej bez simulace úběru").
    const stockL = rm ? buildStockLoopRaw(S.params, calc.stockPathSegments) : null;
    const partL = rm ? partLoopOf(calc) : null;
    let base = stockL;
    if (rm && partL) {
      try {
        // + díra: hotový díl ji nemá jako materiál, ale obrábí se z plného.
        base = unionLargest(stockL && stockL.length >= 3 ? [stockL, boreHoleLoop(bs.g)] : [boreHoleLoop(bs.g)], [partL], stockL);
      } catch { base = stockL || partL; }
    }
    if (!base) return null;
    const removed = boreRemovedLoops(bs.g, bs.un(rm.model.loops));
    let loops = polyDifference([base], removed);
    // Čelní dobrání dna (ops/boreFloor.js): ubrané = polotovar fáze MÍNUS zbytek.
    if (bs.floor) {
      const rf = boreRemoval(bs.floor);
      const fl = rf ? buildStockLoopRaw(bs.floor.params, bs.floor.calcM.stockPathSegments) : null;
      if (fl) loops = polyDifference(loops, bs.floor.un(polyDifference([fl], rf.model.loops)));
    }
    return { valid: true, model: { loops }, baseLoop: base };
  }

  function scheduleFrame(fn) {
    _rafFn = fn;                       // ponech jen poslední požadavek
    if (_rafId !== null) return;
    _rafId = requestAnimationFrame(() => {
      _rafId = null;
      const f = _rafFn; _rafFn = null;
      if (f) f();
    });
  }
  function flushFrame() {
    if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null; }
    const f = _rafFn; _rafFn = null;
    if (f) f();
  }

  // Vzorkuje obrys polotovaru (odlitku) na světové body v pořadí — čáry
  // rozdělené na kroky (pro přesné hledání průniku s konturou materiálu),
  // oblouky po arcSteps() jako jinde. Nekonečné/NaN body (degenerované
  // segmenty bez p1/p2 nebo s neplatným poloměrem) se přeskočí, jinak by
  // canvas vykreslil čáru "od nikud nikam".
  function _sampleStockOutlineWorld(stockPathSegments) {
    const pts = [];
    const push = (x, z) => { if (Number.isFinite(x) && Number.isFinite(z)) pts.push({ x, z }); };
    stockPathSegments.forEach(seg => {
      if (seg.isDegenerate) return;
      if (seg.type === 'line') {
        if (!seg.p1 || !seg.p2) return;
        const N = 24;
        for (let j = 0; j <= N; j++) {
          const t = j / N;
          push(seg.p1.x + (seg.p2.x - seg.p1.x) * t, seg.p1.z + (seg.p2.z - seg.p1.z) * t);
        }
      } else if (seg.type === 'arc') {
        if (!Number.isFinite(seg.r) || seg.r <= 0) return;
        const steps = arcSteps(seg.r, S.view.scale);
        let sA = seg.startAngle, eA = seg.endAngle;
        if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
        if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
        for (let j = 0; j <= steps; j++) {
          const a = sA + (eA - sA) * (j / steps);
          push(seg.cx + Math.sin(a) * seg.r, seg.cz + Math.cos(a) * seg.r);
        }
      }
    });
    return pts;
  }

  // Největší X (vnější povrch) libovolného segmentového obrysu (line/arc) na
  // zadaném Z — stejná logika jako stockOuterXAtZ(), ale bez vazby na
  // prms.stockMode, aby šla použít i nad konturou materiálu.
  function _outlineMaxXAtZ(segs, z) {
    let maxX = null;
    for (const seg of segs) {
      if (seg.isDegenerate) continue;
      if (seg.type === 'line') {
        if (!seg.p1 || !seg.p2) continue;
        const x = intersectVerticalLineSegment(z, seg.p1, seg.p2);
        if (x !== null && (maxX === null || x > maxX)) maxX = x;
      } else if (seg.type === 'arc') {
        if (!Number.isFinite(seg.r) || seg.r <= 0) continue;
        for (const x of intersectVerticalLineArc(z, { x: seg.cx, z: seg.cz }, seg.r)) {
          const angle = Math.atan2(x - seg.cx, z - seg.cz);
          if (isAngleBetween(angle, seg.startAngle, seg.endAngle, seg.dir === 'G2')
            && (maxX === null || x > maxX)) maxX = x;
        }
      }
    }
    return maxX;
  }

  // Ořízne body obrysu polotovaru na úseky ležící MIMO konturu materiálu
  // (stock musí obalovat hotový díl — pokud na nějakém Z kontura vyčnívá
  // před polotovar, jde o nekonzistenci ve vykreslení a čára polotovaru se
  // tam zkrátí přesně na průsečík s konturou, místo aby do ní zasahovala).
  function _clipOutlineOutsideContour(pts, contourSegs) {
    if (!pts.length || !contourSegs || contourSegs.length === 0) return [pts];
    const eps = 0.01;
    const diffs = pts.map(p => {
      const cx = _outlineMaxXAtZ(contourSegs, p.z);
      // Velké KONEČNÉ číslo místo Infinity — Infinity-Infinity při interpolaci
      // hranice dávalo NaN a canvas pak kreslil "čáru odnikud nikam" (bod 0,0).
      return cx === null ? 1e7 : p.x - cx;
    });
    const runs = [];
    let cur = [];
    for (let i = 0; i < pts.length; i++) {
      const outside = diffs[i] > -eps;
      if (i > 0 && ((diffs[i - 1] > -eps) !== outside)) {
        const d0 = diffs[i - 1], d1 = diffs[i];
        const t = d0 / (d0 - d1);
        const bx = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t;
        const bz = pts[i - 1].z + (pts[i].z - pts[i - 1].z) * t;
        if (outside) { cur = [{ x: bx, z: bz }]; }
        else { cur.push({ x: bx, z: bz }); runs.push(cur); cur = []; }
      }
      if (outside) cur.push(pts[i]);
    }
    if (cur.length > 1) runs.push(cur);
    return runs;
  }

  // ── CANVAS DRAWING ────────────────────────────────────────────
  function draw() {
    const calc = S._cachedCalc;
    if (!calc) return;
    const prms = S.params;
    const w = canvas.width, h = canvas.height;
    if (w <= 0 || h <= 0) return;

    const C = {
      bg: '#1e1e2e', grid: '#313244', axis: '#f38ba8', stock: '#6c7086',
      contour: '#89b4fa', offset: '#cba6f7', pass: '#a6e3a1', finish: '#f5c2e7',
      error: '#f38ba8', text: '#6c7086', tool: '#f9e2af', insert: 'rgba(186,194,222,0.7)',
      // Nedokončené trasování profilu (ruční i Auto/Krok náhled) — bílá, ať je
      // vidět i na modré konturové čáře (stejně jako v CAD, viz profileTraceClick.js).
      trace: '#ffffff'
    };

    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);
    const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
    const toScreen = (x, z) => {
      if (isNaN(x) || isNaN(z)) return { x: 0, y: 0 };
      if (prms.machineStructure === 'carousel')
        return { x: S.view.panX + hS * x * S.view.scale, y: S.view.panY + vS * z * S.view.scale };
      return { x: S.view.panX + hS * z * S.view.scale, y: S.view.panY + vS * x * S.view.scale };
    };

    // grid — dynamically cover entire visible canvas
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.beginPath();
    // Convert canvas corners to world coords to find visible range
    const toWorld = (sx, sy) => {
      if (prms.machineStructure === 'carousel')
        return { x: hS * (sx - S.view.panX) / S.view.scale, z: vS * (sy - S.view.panY) / S.view.scale };
      return { x: vS * (sy - S.view.panY) / S.view.scale, z: hS * (sx - S.view.panX) / S.view.scale };
    };
    const wTL = toWorld(0, 0), wBR = toWorld(w, h);
    const wMinX = Math.min(wTL.x, wBR.x), wMaxX = Math.max(wTL.x, wBR.x);
    const wMinZ = Math.min(wTL.z, wBR.z), wMaxZ = Math.max(wTL.z, wBR.z);
    // Choose grid step based on zoom
    const rawStep = Math.max(wMaxX - wMinX, wMaxZ - wMinZ) / 15;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const gridStep = [1, 2, 5, 10].map(m => m * mag).find(s => s >= rawStep) || (10 * mag);
    const gx0 = Math.floor(wMinX / gridStep) * gridStep, gx1 = Math.ceil(wMaxX / gridStep) * gridStep;
    const gz0 = Math.floor(wMinZ / gridStep) * gridStep, gz1 = Math.ceil(wMaxZ / gridStep) * gridStep;
    for (let v = gx0; v <= gx1; v += gridStep) {
      const p1 = toScreen(v, gz0), p2 = toScreen(v, gz1);
      ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
    }
    for (let v = gz0; v <= gz1; v += gridStep) {
      const p1 = toScreen(gx0, v), p2 = toScreen(gx1, v);
      ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
    }
    ctx.stroke();

    // grid labels
    // #585b70 (Catppuccin surface2) na tomhle pozadí padá pod 3:1 kontrastu
    // – prakticky nečitelné (viz stejná oprava v css/style.css). subtext0
    // (#a6adc8) dává ~7:1 a čísla jsou i o něco větší, ať jsou srovnatelná s CAD.
    ctx.fillStyle = '#a6adc8'; ctx.font = '12px sans-serif';
    for (let v = gx0; v <= gx1; v += gridStep) {
      if (Math.abs(v) < gridStep * 0.01) continue;
      const label = Number.isInteger(v) ? v.toString() : v.toFixed(1);
      if (prms.machineStructure === 'carousel') {
        const pt = toScreen(v, 0); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(label, pt.x, pt.y + 2);
      } else {
        const pt = toScreen(v, 0); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(label, pt.x - 4, pt.y);
      }
    }
    for (let v = gz0; v <= gz1; v += gridStep) {
      if (Math.abs(v) < gridStep * 0.01) continue;
      const label = Number.isInteger(v) ? v.toString() : v.toFixed(1);
      if (prms.machineStructure === 'carousel') {
        const pt = toScreen(0, v); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(label, pt.x - 4, pt.y);
      } else {
        const pt = toScreen(0, v); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(label, pt.x, pt.y + 2);
      }
    }

    // axes
    const zero = toScreen(0, 0);
    ctx.strokeStyle = C.axis; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(0, zero.y); ctx.lineTo(w, zero.y);
    ctx.moveTo(zero.x, 0); ctx.lineTo(zero.x, h);
    ctx.stroke();
    ctx.fillStyle = C.axis; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const vLabelY = S.flipX ? h - 8 : 15;
    const hLabelX = S.flipZ ? 20 : w - 20;
    if (prms.machineStructure === 'carousel') {
      ctx.fillText('X+', hLabelX, zero.y + 15); ctx.fillText('Z+', zero.x + 10, vLabelY);
    } else {
      ctx.fillText('Z+', hLabelX, zero.y + 15); ctx.fillText('X+', zero.x + 10, vLabelY);
    }
    ctx.fillText('X0 Z0', zero.x + 4, zero.y - 4);

    // Zbývající polotovar po úběru (Fáze 1 – Clipper2): Path2D ve screen
    // souřadnicích. Když je aktivní, ořezává vybarvení i výplň polotovaru,
    // takže projetý materiál vizuálně mizí.
    let remainPath = null;   // čistý zbytek materiálu (pro výplň polotovaru)
    let fillClipPath = null; // clip pro vybarvení: vše MIMO původní polotovar + zbytek
    let stockPath = null;    // zbytek AŽ po offsetovou čáru — TO je celý polotovar
    if (S.showRemoval) {
      const addLoop = (path, loop) => {
        if (!loop || loop.length < 3) return;
        const p0 = toScreen(loop[0].x, loop[0].z);
        path.moveTo(p0.x, p0.y);
        for (let i = 1; i < loop.length; i++) {
          const p = toScreen(loop[i].x, loop[i].z);
          path.lineTo(p.x, p.y);
        }
        path.closePath();
      };
      const rm = S.simProgress > 0 ? getRemovalModel(calc) : null;
      if (rm) {
        remainPath = new Path2D();
        for (const loop of rm.model.loops) addLoop(remainPath, loop);
        // POLOTOVAR KONČÍ AŽ NA OFFSETOVÉ ČÁŘE, takže se vybarví JEDNÍM
        // odstínem až po ni — pás nad nakresleným odlitkem není zvláštní
        // zóna, je to prostě polotovar (zadání uživatele 20. 8. 2026:
        // „obrobek je celý i s tou offsetovou čarou“). Dřív se kreslil zvlášť
        // světlejším tónem přes clip „mimo syrový obrys“, takže díl vypadal
        // jako dva materiály.
        // Offsetový zbytek OBSAHUJE syrový (obě smyčky řeže tatáž dráha, jen
        // začínají na jiném základu — hlídá tests/cam-removal-offset-band),
        // takže jedna výplň pokryje obojí.
        const rmOut = getRemovalOuterModel(calc, rm);
        if (rmOut) {
          stockPath = new Path2D();
          for (const loop of rmOut.model.loops) addLoop(stockPath, loop);
        }
      }
      // Materiál odebraný PŘEDCHOZÍMI operacemi je pryč nastálo — vybarvení se
      // tam proto nemá vracet ani při simProgress = 0 (čerstvě založená část
      // ještě nemá dráhy). Základ ořezu je pak obrys PŮVODNÍHO polotovaru
      // (uložený u první části) a zbytek = polotovar aktuální části.
      const partBase = partsActive() && S.opParts[0] ? S.opParts[0].baseStockLoop : null;
      const clipBase = partBase || (rm ? rm.baseLoop : null);
      const remainLoops = rm ? rm.model.loops
        : (partBase ? [buildStockLoopRaw(prms, calc.stockPathSegments)].filter(Boolean) : null);
      if (clipBase && remainLoops) {
        // Parity trik (evenodd): celé plátno + původní obrys polotovaru +
        // zbylé smyčky → vyplněná oblast = mimo polotovar ∪ zbytek. Vybarvení
        // se tedy maže jen tam, kde nástroj skutečně odebral materiál —
        // výplně mimo polotovar (obrobek, anotace) zůstávají netknuté.
        fillClipPath = new Path2D();
        fillClipPath.rect(-10, -10, w + 20, h + 20);
        addLoop(fillClipPath, clipBase);
        for (const loop of remainLoops) addLoop(fillClipPath, loop);
      }
    }

    // Vybarvení (fill objekty z CAD nástroje "Vybarvit") — CAM čte state.objects
    // přímo (na rozdíl od kontury/polotovaru CAM nemá vlastní kopii těchto
    // objektů, protože jde jen o vizuální anotaci, ne obráběnou geometrii).
    // Stejné pořadí jako v CAD (js/render.js drawFills) — kreslí se pod vším.
    const camXZ = (cx, cy) => prms.machineStructure === 'carousel' ? [cx, cy] : [cy, cx];
    if (fillClipPath) { ctx.save(); ctx.clip(fillClipPath, 'evenodd'); }
    state.objects.forEach((obj) => {
      if (obj.type !== 'fill' || !obj.loops || obj.loops.length === 0) return;
      const layer = state.layers.find(l => l.id === obj.layer);
      if (layer && !layer.visible) return;
      const path = new Path2D();
      for (const loop of obj.loops) {
        if (loop.length < 3) continue;
        const p0 = toScreen(...camXZ(loop[0].x, loop[0].y));
        path.moveTo(p0.x, p0.y);
        for (let i = 1; i < loop.length; i++) {
          const p = toScreen(...camXZ(loop[i].x, loop[i].y));
          path.lineTo(p.x, p.y);
        }
        path.closePath();
      }
      ctx.save();
      ctx.globalAlpha = obj.alpha ?? 0.35;
      ctx.fillStyle = obj.color || '#60a5fa';
      ctx.fill(path, 'evenodd');
      ctx.restore();
    });
    if (fillClipPath) ctx.restore();

    // stock
    if (prms.stockMode === 'cylinder') {
      const sRad = (parseFloat(prms.stockDiameter) || 0) / 2;
      const sLen = parseFloat(prms.stockLength) || 0;
      const sFace = parseFloat(prms.stockFace) || 0;
      const s1 = toScreen(sRad, sFace), s2 = toScreen(sRad, -sLen), s3 = toScreen(0, -sLen), sStart = toScreen(0, sFace);
      // filled area — při aktivním úběru se kreslí jen ZBÝVAJÍCÍ materiál
      ctx.fillStyle = 'rgba(108,112,134,0.12)';
      if (remainPath) {
        ctx.fill(stockPath || remainPath, 'evenodd');
      } else {
        ctx.beginPath(); ctx.moveTo(sStart.x, sStart.y); ctx.lineTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.lineTo(s3.x, s3.y); ctx.closePath(); ctx.fill();
      }
      // outline — all 4 sides visible (tlustá červená čára)
      ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 3; ctx.beginPath();
      ctx.moveTo(sStart.x, sStart.y); ctx.lineTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.lineTo(s3.x, s3.y); ctx.closePath();
      ctx.stroke();
      // label with stock dimensions
      const labelPt = toScreen(sRad, sFace);
      const stockDiaLabel = `∅${parseFloat(prms.stockDiameter)} × ${sLen}`;
      ctx.fillStyle = '#fab387'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      if (prms.machineStructure === 'carousel') ctx.fillText(stockDiaLabel, labelPt.x + 4, labelPt.y - 4);
      else ctx.fillText(stockDiaLabel, labelPt.x + 4, labelPt.y - 4);
    } else if (calc.stockPathSegments.length > 0) {
      // Ořez čáry polotovaru o konturu materiálu se dělá JEN PO potvrzení
      // trasování profilu (S._traceConfirmedOnce) — dokud trasa neexistuje
      // (čerstvě otevřený projekt) ani během jejího kreslení (nevíme, kudy
      // povede), musí být vidět CELÝ polotovar beze změny.
      const _clipStockToContour = !!S._traceConfirmedOnce;
      ctx.beginPath();
      if (_clipStockToContour) {
        const _pts = _sampleStockOutlineWorld(calc.stockPathSegments);
        const _runs = _clipOutlineOutsideContour(_pts, calc.contourSegments);
        _runs.forEach(run => {
          run.forEach((p, j) => {
            const sp = toScreen(p.x, p.z);
            if (j === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y);
          });
        });
      } else {
        calc.stockPathSegments.forEach((seg, i) => {
          if (seg.type === 'line') {
            const p1 = toScreen(seg.p1.x, seg.p1.z), p2 = toScreen(seg.p2.x, seg.p2.z);
            if (i === 0) ctx.moveTo(p1.x, p1.y); else ctx.lineTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
          } else if (seg.type === 'arc') {
            const steps = arcSteps(seg.r, S.view.scale);
            let sA = seg.startAngle, eA = seg.endAngle;
            if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
            if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
            for (let j = 0; j <= steps; j++) {
              const a = sA + (eA - sA) * (j / steps);
              const pt = toScreen(seg.cx + Math.sin(a) * seg.r, seg.cz + Math.cos(a) * seg.r);
              if (j === 0 && i === 0) ctx.moveTo(pt.x, pt.y);
              else if (j === 0) ctx.moveTo(pt.x, pt.y);
              else ctx.lineTo(pt.x, pt.y);
            }
          }
        });
      }
      ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 3; ctx.stroke();
      // Odlitek: při aktivním úběru vyplnit zbývající materiál (válec má
      // výplň výš — tady se jinak kreslí jen obrys).
      if (remainPath) {
        ctx.fillStyle = 'rgba(108,112,134,0.12)';
        ctx.fill(stockPath || remainPath, 'evenodd');
      }
    }

    // ── Vrtání: obrys vrtané díry (čárkovaně) — co se odvrtá a co zůstane ──
    if (prms.drillActive && !prms.boreActive) {
      try {
        const dg = drillGeom(prms, { faceZ: drillAutoFaceZ(S) });
        const hole = drillHoleLoop(prms, dg);
        if (hole) {
          ctx.save(); ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fab387';
          ctx.beginPath();
          hole.forEach((p, i) => { const q = toScreen(p.x, p.z); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
          ctx.stroke();
          ctx.restore();
        }
      } catch (_) { /* neúplné zadání — bez náhledu */ }
    }
    // ── Vyvrtávání: obrys díry a předvrtání (čárkovaně, ops/bore.js) ──
    if (prms.boreActive) {
      const bsrc = prms.boreSource === 'cad' ? boreChainFromState(S) : null;
      const bg = boreGeom(prms, bsrc ? bsrc.segs : null);
      if (bg.D > 0 && bg.L > 0) {
        const line = (pts) => {
          ctx.beginPath();
          pts.forEach(([x, z], i) => { const q = toScreen(x, z); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
          ctx.stroke();
        };
        ctx.save(); ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#fab387';
        if (bg.chain) {
          // Díra z výkresu: řetěz od ústí dovnitř, oblouky navzorkované.
          const pts = [[bg.chain[0].p1.x, bg.chain[0].p1.z]];
          for (const s of bg.chain) {
            if (s.type === 'arc') {
              let d = s.endAngle - s.startAngle;
              if (s.dir === 'G2' && d > 0) d -= 2 * Math.PI;
              if (s.dir === 'G3' && d < 0) d += 2 * Math.PI;
              for (let j = 1; j <= 12; j++) { const a = s.startAngle + d * j / 12; pts.push([s.cx + s.r * Math.sin(a), s.cz + s.r * Math.cos(a)]); }
            } else pts.push([s.p2.x, s.p2.z]);
          }
          line(pts);
        } else {
          line([[bg.r, bg.zF], [bg.r, bg.zF - bg.s * bg.L], [Math.min(bg.r0, bg.r), bg.zF - bg.s * bg.L]]);
        }
        if (bg.r0 > 0 && bg.L0 > 0) { ctx.strokeStyle = '#f9e2af'; line([[bg.r0, bg.zF], [bg.r0, bg.zF - bg.s * bg.L0], [0, bg.zF - bg.s * bg.L0]]); }
        ctx.restore();
      }
    }

    // Tečkovaná hranice pracovního posuvu kolem polotovaru: offset povrchu
    // o Vůli X (radiálně) a Vůli Z (axiálně). Sem končí rychloposuv (G0) a
    // začíná pracovní posuv (G1); zároveň bezpečná zóna pro držák.
    // Po téhle čáře se nejede, dráhy jedou po `offsetPath` níž.
    // KRESLÍ SE VŽDY (uživatel 25. 9. 2026: *„chybí mi tam offsetová čára
    // kolem polotovaru jako přídavek, který tam mám"*) — do té doby byla
    // schovaná pod přepínačem REF (výchozí vypnuto), který tím zanikl.
    {
      ctx.save();
      ctx.strokeStyle = 'rgba(250,179,135,0.75)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      // Kreslí se PŘESNĚ ta smyčka, se kterou plánuje hrubování i emise
      // (`stockPlanLoop`), a na kterou se chytá SNAP — jeden zdroj, viz
      // getStockPlanOutline() níž.
      //
      // DŘÍV se offset dopočítával ZVLÁŠŤ: obrys se navzorkoval a každý bod
      // se posunul po své vlastní normále. To ale NENÍ offset polygonu a
      // v rozích i na koncích se čára přitahovala k polotovaru — normála
      // v rohu půlí úhel (chybí prodloužení hrany) a v prvním/posledním
      // vzorku se počítala jen z poloviny intervalu. Reálný nález uživatele:
      // u konce polotovaru se „offsetová čára ke konci zužuje místo aby
      // držela stejnou vzdálenost“.
      const planOutline = getStockPlanOutline(calc);
      if (planOutline.length > 1) {
        planOutline.forEach((q, i) => {
          const p = toScreen(q.x, q.z);
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        });
        // Válec = otevřená polylinie od osy k ose; odlitek = uzavřená smyčka.
        if (prms.stockMode !== 'cylinder') ctx.closePath();
      }
      ctx.stroke();
      ctx.restore();
    }

    // contour
    if (calc.worldPoints.length > 0 && !calc.profileViewActive) {
      ctx.beginPath();
      const start = toScreen(calc.worldPoints[0].xReal, calc.worldPoints[0].zReal);
      ctx.moveTo(start.x, start.y);
      for (let i = 0; i < calc.worldPoints.length - 1; i++) {
        const p1 = calc.worldPoints[i], p2 = calc.worldPoints[i + 1];
        const ptEnd = toScreen(p2.xReal, p2.zReal);
        if (p2.type === 'G0') {
          // G0 = mezera mezi nesouvisejícími entitami — nic nevykreslovat,
          // jen přesunout "pero" na začátek dalšího úseku.
          ctx.moveTo(ptEnd.x, ptEnd.y);
        } else if (p2.type === 'G1') {
          ctx.lineTo(ptEnd.x, ptEnd.y);
        } else if (p2.type === 'G2' || p2.type === 'G3') {
          const arc = getArcParams({ x: p1.xReal, z: p1.zReal }, { x: p2.xReal, z: p2.zReal }, p2.rVal, p2.type);
          if (!arc.error) {
            const steps = arcSteps(arc.r, S.view.scale);
            let sA = Math.atan2(p1.xReal - arc.cx, p1.zReal - arc.cz);
            let eA = Math.atan2(p2.xReal - arc.cx, p2.zReal - arc.cz);
            if (p2.type === 'G2' && eA > sA) eA -= 2 * Math.PI;
            if (p2.type === 'G3' && eA < sA) eA += 2 * Math.PI;
            for (let j = 1; j <= steps; j++) {
              const a = sA + (eA - sA) * (j / steps);
              const pt = toScreen(arc.cx + Math.sin(a) * arc.r, arc.cz + Math.cos(a) * arc.r);
              ctx.lineTo(pt.x, pt.y);
            }
          } else ctx.lineTo(ptEnd.x, ptEnd.y);
        }
      }
      ctx.strokeStyle = (S._previewContour || calc.profileViewActive) ? 'rgba(137,180,250,0.2)' : C.contour; ctx.lineWidth = calc.profileViewActive ? 1.5 : 3; ctx.stroke();

      // Úseky kontury vzniklé z geometrie destičky (profilování po mezní
      // čáře) — odlišná barva, ať je poznat. Berou se ale jako normální
      // kontura (G1). Při náhledu profilu se nekreslí (kontura je ztlumená).
      if (!S._previewContour) {
        ctx.beginPath();
        let anyIns = false;
        for (let i = 0; i < calc.worldPoints.length - 1; i++) {
          const p2 = calc.worldPoints[i + 1];
          if (!p2.fromInsert || p2.type === 'G0') continue;
          const a = toScreen(calc.worldPoints[i].xReal, calc.worldPoints[i].zReal);
          const b = toScreen(p2.xReal, p2.zReal);
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); anyIns = true;
        }
        if (anyIns) { ctx.strokeStyle = '#fab387'; ctx.lineWidth = 3; ctx.stroke(); }
      }
    }

    // Auto-profil (Hlídat geometrii): mostové úseky z geometrie destičky,
    // které automaticky nahradily nedosažitelnou část kontury — oranžově,
    // ať je profil vidět (offsety/CNC jedou po této obrobitelné kontuře).
    if (calc.machinableContour && !S._previewContour) {
      ctx.beginPath();
      let anyM = false;
      for (const s of calc.machinableContour) {
        if (!s.fromInsert || s.type !== 'line' || s.isDegenerate) continue;
        const a = toScreen(s.p1.x, s.p1.z), b = toScreen(s.p2.x, s.p2.z);
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); anyM = true;
      }
      if (anyM) { ctx.strokeStyle = '#fab387'; ctx.lineWidth = 3; ctx.stroke(); }
    }

    // Náhled trasovaného profilu (číslovaná kontura čekající na potvrzení)
    if (S._previewContour) {
      _drawPointsContour(S._previewContour, toScreen, C.pass, true);
    }

    // Body trasování v průběhu (před dokončením)
    if (S.profileTraceMode && S._tracePoints.length > 0) {
      const tracePts = [{ ...S._tracePoints[0], type: 'G0' }];
      for (let i = 0; i < S._traceSegs.length; i++) {
        const seg = S._traceSegs[i];
        tracePts.push({ ...S._tracePoints[i + 1], type: seg.type, r: seg.r || 0 });
      }
      _drawPointsContour(tracePts, toScreen, C.trace, true);
    }

    // Náhledová čára k pozici kurzoru — jen v režimu „Mimo body" (jinak by
    // překážela); úhlový snap se aplikuje už na S._traceCursor (mousemove).
    if (S.profileTraceMode && S._traceFreeClick && S._traceCursor && S._tracePoints.length > 0) {
      const last = S._tracePoints[S._tracePoints.length - 1];
      const a = toScreen(last.x, last.z), b = toScreen(S._traceCursor.x, S._traceCursor.z);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = C.trace; ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // zvýraznění úseků kontury, kam destička dle svého tvaru/natočení
    // nedosáhne beze zbytku materiálu (kolize bočním ostřím)
    if (calc.interferenceSegments && calc.interferenceSegments.length > 0) {
      ctx.beginPath();
      calc.interferenceSegments.forEach(seg => {
        if (seg.type === 'line') {
          const p1 = toScreen(seg.p1.x, seg.p1.z), p2 = toScreen(seg.p2.x, seg.p2.z);
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        } else if (seg.type === 'arc') {
          const steps = arcSteps(seg.r, S.view.scale);
          let sA = Math.atan2(seg.p1.x - seg.cx, seg.p1.z - seg.cz);
          let eA = Math.atan2(seg.p2.x - seg.cx, seg.p2.z - seg.cz);
          if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
          if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
          for (let j = 0; j <= steps; j++) {
            const a = sA + (eA - sA) * (j / steps);
            const pt = toScreen(seg.cx + Math.sin(a) * seg.r, seg.cz + Math.cos(a) * seg.r);
            if (j === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
          }
        }
      });
      ctx.strokeStyle = C.error; ctx.lineWidth = 5; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
    }

    // oranžové zvýraznění: hřbet destičky koliduje s materiálem (α příliš malý)
    if (calc.flankSegments && calc.flankSegments.length > 0) {
      ctx.beginPath();
      calc.flankSegments.forEach(seg => {
        if (seg.type === 'line') {
          const p1 = toScreen(seg.p1.x, seg.p1.z), p2 = toScreen(seg.p2.x, seg.p2.z);
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        } else if (seg.type === 'arc') {
          const steps = arcSteps(seg.r, S.view.scale);
          let sA = Math.atan2(seg.p1.x - seg.cx, seg.p1.z - seg.cz);
          let eA = Math.atan2(seg.p2.x - seg.cx, seg.p2.z - seg.cz);
          if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
          if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
          for (let j = 0; j <= steps; j++) {
            const a = sA + (eA - sA) * (j / steps);
            const pt = toScreen(seg.cx + Math.sin(a) * seg.r, seg.cz + Math.cos(a) * seg.r);
            if (j === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
          }
        }
      });
      ctx.strokeStyle = '#fab387'; ctx.lineWidth = 4; ctx.setLineDash([6, 3]); ctx.stroke(); ctx.setLineDash([]);
    }

    // pomocné (konstrukční) čáry — ruční tečny z nástroje Úhel (žluté)
    // + automatické mezní čáry hran destičky (tyrkysové). Ke každé se
    // kreslí i offset o rádius plátku (kam dojede STŘED plátku) a malé
    // kroužky na koncových bodech (tečné body / průsečíky) pro klikání.
    {
      const allGuides = [
        ...(S.guideLines || []).map(g => ({ ...g, auto: false })),
        ...((calc.interferenceGuides || []).map(g => ({ ...g, auto: true })))
      ];
      if (allGuides.length > 0) {
        const tipROff = parseFloat(prms.toolRadius) || 0;
        allGuides.forEach(g => {
          const col = g.auto ? '#94e2d5' : C.tool;
          // Uživatelské konstrukční čáry jsou NEKONEČNÉ jen v režimu úpravy
          // (odemčeno) – slouží jako reference pro prodloužení/snap. Po zamčení
          // se zkrátí ke svým skutečným koncovým bodům.
          // Lomená čára (hlídání držáku, g.via) se kreslí po vrcholech; přímá
          // jako dřív. Uživatelská čára v režimu úprav je nekonečná.
          let poly = guidePolyPoints(g);
          if (!g.auto && S.gcodeEditEnabled && (!g.via || !g.via.length)) {
            let dx = g.x2 - g.x1, dz = g.z2 - g.z1; const L = Math.hypot(dx, dz);
            if (L > 1e-9) {
              dx /= L; dz /= L;
              poly = [{ x: g.x2 + dx * 1e4, z: g.z2 + dz * 1e4 }, { x: g.x1 - dx * 1e4, z: g.z1 - dz * 1e4 }];
            }
          }
          ctx.beginPath();
          poly.forEach((q, qi) => {
            const p = toScreen(q.x, q.z);
            if (qi === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
          });
          // Čelní mezní čára končící na polotovaru (downOnStock) = PLNÁ (mění
          // obrobitelnou konturu); ostatní mezní čáry čárkovaně.
          // PLNÁ je i mez ZANOŘENÍ kulaté destičky (`plungeLimit`): konturu
          // sice nemění, ale je to stejně platná mez jako u polygonu a
          // uživatel ji chce vidět stejně (rozhodnutí 8. 9. 2026).
          ctx.strokeStyle = col; ctx.lineWidth = 1.5;
          ctx.setLineDash((g.downOnStock || g.plungeLimit) ? [] : [8, 4]); ctx.stroke(); ctx.setLineDash([]);
          // Offset dráhy středu plátku (korekce R) na stranu vzduchu (+X).
          // DVĚ ČÁRY: hrubovací (R + Přídavek X/Z + Přídavek na hotovo) a
          // HOTOVNÍ (jen R). Obě, i když se dokončování nejede — uživatel je
          // chce vidět obě (17. 9. 2026: *„přidej tam i tu hotovní"*), protože
          // jsou to hranice, ne dráhy. Bez přídavků obě splývají a zůstává
          // jediná.
          // (Mezitím byla hotovní schovaná pod přepínač REF. To bylo špatné
          // čtení dřívější připomínky: uživateli vadilo, že obě visely KOLMO
          // od čáry s konci ve vzduchu, ne že jsou dvě.)
          // Napojenou (oříznutou) podobu si mezní čára nese z výpočtu
          // (`offRough`/`offFinish`, guideOffsetJoin.js) — pak se kreslí
          // přesně ta, kterou má v sobě offsetový řetěz.
          if (tipROff > 0) {
            const aX = parseFloat(prms.allowanceX) || 0;
            const aZ = parseFloat(prms.allowanceZ) || 0;
            const fin = parseFloat(prms.finishAllowance) || 0;
            const hasRough = aX > 1e-9 || aZ > 1e-9 || fin > 1e-9;
            const drawOff = (rOff, aXo, aZo, joined) => {
              ctx.beginPath();
              if (joined) {
                const o1 = toScreen(joined.p1.x, joined.p1.z);
                const o2 = toScreen(joined.p2.x, joined.p2.z);
                ctx.moveTo(o1.x, o1.y); ctx.lineTo(o2.x, o2.y);
              } else {
                for (let k = 0; k + 1 < poly.length; k++) {
                  let n = getNormal(poly[k], poly[k + 1]);
                  if (n.x < 0 || (Math.abs(n.x) < 1e-9 && n.z < 0)) n = { x: -n.x, z: -n.z };
                  const ox = n.x * (rOff + aXo), oz = n.z * (rOff + aZo);
                  const o1 = toScreen(poly[k].x + ox, poly[k].z + oz);
                  const o2 = toScreen(poly[k + 1].x + ox, poly[k + 1].z + oz);
                  ctx.moveTo(o1.x, o1.y); ctx.lineTo(o2.x, o2.y);
                }
              }
              ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.stroke(); ctx.setLineDash([]);
            };
            // Bez přídavků je hrubovací offset zároveň ten hotovní — kreslí
            // se jednou a napojenou podobu si nese pod `offRough`.
            if (hasRough) drawOff(tipROff + fin, aX, aZ, g.offRough);
            else drawOff(tipROff, 0, 0, g.offRough);
            if (hasRough) drawOff(tipROff, 0, 0, g.offFinish);
          }
          // koncové body (PŮVODNÍ konce) — viditelné a uchopitelné (tažení po
          // čáře = prodloužit/zkrátit; "+" vloží bod kontury v tečném bodě)
          const c1 = toScreen(g.x1, g.z1), c2 = toScreen(g.x2, g.z2);
          ctx.fillStyle = col;
          for (const q of [c1, c2]) { ctx.beginPath(); ctx.arc(q.x, q.y, 4, 0, Math.PI * 2); ctx.fill(); }
        });
      }
    }

    // offset path — v 🙈 stavu (none) skryjeme všechny drahy
    if (S.showSimPath !== 'none' && calc.offsetPath.length > 0) {
      ctx.beginPath();
      calc.offsetPath.forEach((seg, i) => {
        if (seg.isDegenerate) return;
        if (seg.type === 'line') {
          const p1 = toScreen(seg.p1.x, seg.p1.z), p2 = toScreen(seg.p2.x, seg.p2.z);
          if (i === 0 || seg.chainBreak) ctx.moveTo(p1.x, p1.y); else ctx.lineTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
        } else if (seg.type === 'arc') {
          const steps = arcSteps(seg.r, S.view.scale);
          let sA = seg.startAngle, eA = seg.endAngle;
          if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
          if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
          for (let j = 0; j <= steps; j++) {
            const a = sA + (eA - sA) * (j / steps);
            const pt = toScreen(seg.cx + Math.sin(a) * seg.r, seg.cz + Math.cos(a) * seg.r);
            if (j === 0 && (i === 0 || seg.chainBreak)) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          }
        }
      });
      ctx.strokeStyle = C.offset; ctx.lineWidth = 1; ctx.setLineDash([2, 2]); ctx.stroke(); ctx.setLineDash([]);
    }

    // HOTOVNÍ offset kontury (jen rádius plátku, bez přídavků) — druhá
    // tečkovaná čára vedle hrubovacího offsetu, stejně jako u mezních čar
    // hlídání destičky. Čistá GEOMETRIE „kam dojede střed plátku na hotovo",
    // ne dráha — kreslí se i s vypnutým Dokončováním. Prázdné pole, když
    // žádný přídavek není (pak by splynula s hrubovacím offsetem).
    //
    // KRESLÍ SE VŽDY (rozhodnutí uživatele 17. 9. 2026: *„ať jsou tam ty dvě
    // offsetové čáry, jedna od přídavku na hotovo a další na hotovo — je tam
    // většinou jenom jedna"*). Přepínač REF, pod který spadla 15. 9., řídí od
    // teď už jen tečkovanou PLÁNOVACÍ hranici polotovaru — ta zůstává
    // referencí, po které se opravdu nejezdí.
    if (S.showSimPath !== 'none' && (calc.finishRefPath || []).length > 0) {
      ctx.beginPath();
      calc.finishRefPath.forEach((seg, i) => {
        if (seg.isDegenerate) return;
        if (seg.type === 'line') {
          const p1 = toScreen(seg.p1.x, seg.p1.z), p2 = toScreen(seg.p2.x, seg.p2.z);
          if (i === 0 || seg.chainBreak) ctx.moveTo(p1.x, p1.y); else ctx.lineTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
        } else if (seg.type === 'arc') {
          const steps = arcSteps(seg.r, S.view.scale);
          let sA = seg.startAngle, eA = seg.endAngle;
          if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
          if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
          for (let j = 0; j <= steps; j++) {
            const a = sA + (eA - sA) * (j / steps);
            const pt = toScreen(seg.cx + Math.sin(a) * seg.r, seg.cz + Math.cos(a) * seg.r);
            if (j === 0 && (i === 0 || seg.chainBreak)) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          }
        }
      });
      ctx.strokeStyle = C.finish; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.stroke(); ctx.setLineDash([]);
    }

    // finish path — kreslí simPath (zelená), finishOffsetPath overlay odstraněn

    // Nedosažitelný dokončovací offset (Hlídat geometrii destičky) —
    // tečkovaně: úseky, kam destička bočním ostřím nedosáhne, takže se
    // neobrobí, ale je vidět, že tam kontura nebude objeta.
    if (S.showSimPath !== 'none' && (prms.doFinishing || prms.finishOnly) && (calc.finishUnreachablePath || []).length > 0) {
      ctx.beginPath();
      calc.finishUnreachablePath.forEach(seg => {
        // Kus pod mezní čarou zanoření (pravidlo 15, ops/finishSteep.js) se
        // nekreslí — zůstávají jen dráhy podél mezní čáry (uživatel 7. 10. 2026).
        if (seg.isDegenerate || seg.belowPlunge) return;
        if (seg.type === 'line') {
          const p1 = toScreen(seg.p1.x, seg.p1.z), p2 = toScreen(seg.p2.x, seg.p2.z);
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        } else if (seg.type === 'arc') {
          const steps = arcSteps(seg.r, S.view.scale);
          let sA = seg.startAngle, eA = seg.endAngle;
          if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
          if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
          for (let j = 0; j <= steps; j++) {
            const a = sA + (eA - sA) * (j / steps);
            const pt = toScreen(seg.cx + Math.sin(a) * seg.r, seg.cz + Math.cos(a) * seg.r);
            if (j === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
          }
        }
      });
      ctx.strokeStyle = C.finish; ctx.lineWidth = 1.5; ctx.setLineDash([2, 4]); ctx.stroke(); ctx.setLineDash([]);
    }

    // Vykreslí trasování kontury (G1/G2/G3 segmenty s x1/z1/x2/z2) do
    // aktuální cesty — sdíleno pro contourLeadIn i contourLeadOut.
    const drawContourTrace = (segs) => {
      for (const seg of segs) {
        if (seg.type === 'line') {
          const p1 = toScreen(seg.x1, seg.z1), p2 = toScreen(seg.x2, seg.z2);
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        } else {
          const steps = arcSteps(seg.r, S.view.scale);
          let sA = seg.startAngle, eA = seg.endAngle;
          if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
          if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
          for (let j = 0; j <= steps; j++) {
            const a = sA + (eA - sA) * (j / steps);
            const pt = toScreen(seg.cx + Math.sin(a) * seg.r, seg.cz + Math.cos(a) * seg.r);
            if (j === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
          }
        }
      }
    };

    // roughing passes — v 🙈 stavu skryjeme všechny drahy. Při úpravě drah
    // (✥ Dráhy) se skryjí taky: jsou počítané z kontury (needitují se podle
    // ručního G-kódu), takže by zůstaly viset na staré pozici a překrývaly
    // by skutečnou editovanou dráhu (simPath).
    // Průchody z calc.passes jsou jen PŘED-emisní odhad: skutečnou dráhu
    // (segmentace podle siluety odlitku, ořez konců na hranici materiálu,
    // zkrácené rampy) zná až emise, a ta se kreslí ze simPath níž. Jakmile
    // simPath existuje, tyhle čáry by kreslily ducha neexistující dráhy —
    // uživatel je viděl viset za konci ořezaných dojezdů.
    const passesArePreview = calc.simPath.length === 0;
    if (S.showSimPath !== 'none' && !S.gcodeEditEnabled && passesArePreview) {
      ctx.beginPath();
      calc.passes.forEach(pass => {
        if (pass.type === 'long') {
          if (pass.contourLeadIn) {
            // sledování kontury (G1/G2/G3) přes kapsu místo odskoku
            drawContourTrace(pass.contourLeadIn);
          }
          if (pass.ramp) {
            // rampa zanoření z "rohu" kontury (tečný bod pod úhlem zanoření)
            const pr = toScreen(pass.ramp.x0, pass.ramp.z0);
            const pe = toScreen(pass.x, pass.zStart);
            ctx.moveTo(pr.x, pr.y); ctx.lineTo(pe.x, pe.y);
          }
          const p1 = toScreen(pass.x, pass.zStart), p2 = toScreen(pass.x, pass.zEnd);
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
          if (pass.contourLeadOut) drawContourTrace(pass.contourLeadOut);
        } else {
          const p1 = toScreen(pass.xStart, pass.z), p2 = toScreen(pass.xEnd, pass.z);
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
          if (pass.contourLeadOut) drawContourTrace(pass.contourLeadOut);
        }
      });
      ctx.strokeStyle = C.pass; ctx.lineWidth = 1.5; ctx.stroke();
    }

    // sim path — 'all' = vše, 'cut' = jen řezné, 'none' = nic.
    // Posuvy (G1/G2/G3) plnou čarou (zelená = řez), rychloposuvy (G0)
    // čárkovaně (růžová) — aby G1 nevypadal jako rychloposuv.
    if (S.showSimPath !== 'none' && calc.simPath.length > 0) {
      const strokeSub = (wantRapid) => {
        ctx.beginPath();
        let any = false;
        for (let i = 0; i < calc.simPath.length - 1; i++) {
          const p2 = calc.simPath[i + 1];
          const isRapid = p2.type === 'G0';
          if (isRapid !== wantRapid) continue;
          if (S.showSimPath === 'cut' && isRapid) continue;
          if (p2.arcParams) {
            const ap = p2.arcParams;
            const drawSteps = arcSteps(ap.r, S.view.scale);
            const sA = ap.startAngle, eA = ap.endAngle;
            for (let j = 0; j <= drawSteps; j++) {
              const a = sA + (eA - sA) * (j / drawSteps);
              const pt = toScreen(ap.cx + Math.sin(a) * ap.r, ap.cz + Math.cos(a) * ap.r);
              if (j === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
            }
            i += ap.tessSteps - 1;
            any = true;
          } else {
            const s = toScreen(calc.simPath[i].x, calc.simPath[i].z), e = toScreen(p2.x, p2.z);
            if (Math.abs(s.x - e.x) > 0.1 || Math.abs(s.y - e.y) > 0.1) {
              ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); any = true;
            }
          }
        }
        if (!any) return;
        ctx.lineWidth = 1.5;
        if (wantRapid) { ctx.strokeStyle = '#f38ba8'; ctx.setLineDash([6, 6]); }
        else { ctx.strokeStyle = '#a6e3a1'; ctx.setLineDash([]); }
        ctx.stroke(); ctx.setLineDash([]);
      };
      strokeSub(false);   // posuvy – plně
      strokeSub(true);    // rychloposuvy – čárkovaně
    }

    // úchopové body / úsečky pro úpravu drah (✥ Dráhy)
    if (S.gcodeEditEnabled && !S.simRunning && calc.simPath.length > 0) {
      const hlSeg = S._draggedGSeg || S.hoverGSeg;
      if (hlSeg) {
        const a = toScreen(hlSeg.p1.x, hlSeg.p1.z), b = toScreen(hlSeg.p2.x, hlSeg.p2.z);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = '#f9e2af'; ctx.lineWidth = 3; ctx.stroke();
      }
      const nodes = getGNodes();
      const dragLi = S.draggedGNode ? S.draggedGNode.lineIdx : null;
      const hovLi = S.hoverGNode ? S.hoverGNode.lineIdx : null;
      for (const n of nodes) {
        const pt = toScreen(n.x, n.z);
        const active = n.lineIdx === dragLi || n.lineIdx === hovLi;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, active ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle = active ? '#f9e2af' : (n.type === 'G0' ? '#89b4fa' : '#a6e3a1');
        ctx.fill();
        ctx.strokeStyle = '#1e1e2e'; ctx.lineWidth = 1; ctx.stroke();
      }
    }

    // Rovina upichnutí (part-off) — SVISLÁ ÚSEČKA kontury v Z=partOffZ.
    // Plná čára = upichovací plocha od dojezdu (spodní hrana plátku) po vršek
    // polotovaru; celá rovina řezu navíc čárkovaně (reference od osy nahoru).
    if (prms.partOffZ != null && isFinite(parseFloat(prms.partOffZ))) {
      const g = partOffGeom(prms, calc);
      const pz = g.pz;
      const xTopRef = Math.max(g.xStockTop, (parseFloat(prms.toolRadius) || 1) * 3);
      ctx.save();
      // Reference celé roviny řezu (čárkovaně, od osy nahoru).
      const a0 = toScreen(0, pz), bRef = toScreen(xTopRef * 1.05, pz);
      ctx.strokeStyle = '#f38ba8'; ctx.lineWidth = 1.5; ctx.setLineDash([7, 5]);
      ctx.beginPath(); ctx.moveTo(a0.x, a0.y); ctx.lineTo(bRef.x, bRef.y); ctx.stroke();
      ctx.setLineDash([]);
      // Obrobená úsečka (plná) od spodní hrany (dojezd) po vršek polotovaru
      // + dva úchopové body: spodní = Dojezd X, horní = Start X. V režimu
      // ◆ Kontura je lze chytit a táhnout v ose X (nastaví Dojezd X / Start X).
      if (g.canCut) {
        const eBot = toScreen(g.xBottomEdge, pz), eTop = toScreen(g.xStockTop, pz);
        ctx.strokeStyle = '#f38ba8'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(eBot.x, eBot.y); ctx.lineTo(eTop.x, eTop.y); ctx.stroke();
        const interactive = S.pointDragEnabled && !S.simRunning;
        const drawHandle = (p, color, which, label) => {
          const active = (interactive && S._hoverPartOff === which) || _draggingPartOff === which;
          const r = active ? 6.5 : (interactive ? 5 : 3.5);
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fillStyle = active ? '#f9e2af' : color;
          ctx.fill(); ctx.strokeStyle = '#1e1e2e'; ctx.lineWidth = 1.5; ctx.stroke();
          if (interactive) {
            ctx.fillStyle = color; ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillText(label, p.x + 9, p.y);
          }
        };
        drawHandle(toScreen(g.startEdgeX, pz), '#89b4fa', 'start', 'Start X');   // horní (modrý)
        drawHandle(toScreen(g.xBottomEdge, pz), '#f38ba8', 'dojezd', 'Dojezd X'); // spodní (růžový)
      }
      ctx.fillStyle = '#f38ba8'; ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(`✂ upich Z=${pz.toFixed(2)}`, bRef.x, bRef.y - 4);
      ctx.restore();
    }

    // tool position during sim
    motionOverlay.textContent = '';   // naplní showMotionInfo, když sim běží/stojí na dráze
    if ((S.simRunning || S.simProgress > 0) && calc.simPath.length > 0) {
      const totalPoints = calc.simPath.length;
      const floatIndex = S.simProgress * (totalPoints - 1);
      const idx = Math.floor(floatIndex);
      const t = floatIndex - idx;
      // Vyvrtávání z plného (ops/borePreDrill.js): do konce vrtání se kreslí
      // vrták, potom vyvrtávací tyč (otočená k ose).
      const preTool = preDrillPhase(calc);
      const drillNow = !!preTool && floatIndex < preTool.iSplit;
      const tp = drillNow ? preTool.params : prms;
      const boreView = !drillNow && !!S.params.boreActive;
      const pCurrent = calc.simPath[idx];
      if (pCurrent) {
        const pNext = calc.simPath[Math.min(idx + 1, totalPoints - 1)] || pCurrent;
        const curX = pCurrent.x + (pNext.x - pCurrent.x) * t;
        const curZ = pCurrent.z + (pNext.z - pCurrent.z) * t;
        // Ubíhající čas + živé otáčky a posuv v aktuálním místě dráhy.
        showMotionInfo(pNext, curX, elapsedAtProgress(simTimeProfile(calc.simPath), S.simProgress));
        const pt = toScreen(curX, curZ);
        const tRad = parseFloat(tp.toolRadius) || 0.8;
        // −0.75px = polovina šířky konturové čáry (lineWidth 1.5), aby okraj
        // plátku nepřekrýval vykreslenou čáru kontury.
        // ŽÁDNÉ pixelové podlahy: plátek drží velikost i tvar v měřítku výkresu
        // (a tím i poměr k držáku, který se kreslí v pravém měřítku). Dřív měl
        // R podlahu 6 px a šířka/délka 20 px, každá se zapínala při jiném zoomu,
        // takže se plátek při oddálení nafoukl a deformoval (nález uživatele
        // 27. 8. 2026). Polohu nástroje drží křížek níž, který má minimální
        // pixelovou velikost.
        const rPix = Math.max(tRad * S.view.scale - 0.75, 0.1);
        // Držák (za destičkou) — stejné zrcadlení jako destička (strana
        // obrábění/flipZ vodorovně, flipX svisle), ale BEZ natočení
        // specifického pro tvar destičky (toolAngle), stejně jako v dialogu
        // "⚙️ Geometrie" (tam drží orientaci držáku jen knifeAngle).
        ctx.save(); ctx.translate(pt.x, pt.y);
        if ((toolMirrored()) !== !!S.flipZ) ctx.scale(-1, 1);
        if (S.flipX !== boreView) ctx.scale(1, -1);   // vyvrtávání: nůž k ose
        drawHolderProfileLocal(ctx, tp, S.view.scale);
        ctx.restore();
        // Vybarvení AKUMULOVANÝCH oblastí kolizí (držák v materiálu, zajetí do
        // hotové kontury). Smyčky jsou v SIM souřadnicích, kreslí se přímo přes
        // toScreen (mimo výše zrcadlený kontext — ten řeší toScreen sám).
        const paint = (loops, fill, stroke) => {
          if (!loops) return;
          ctx.fillStyle = fill; ctx.strokeStyle = stroke;
          for (const loop of loops) {
            if (loop.length < 3) continue;
            ctx.beginPath();
            const p0 = toScreen(loop[0].x, loop[0].z);
            ctx.moveTo(p0.x, p0.y);
            for (let i = 1; i < loop.length; i++) {
              const p = toScreen(loop[i].x, loop[i].z);
              ctx.lineTo(p.x, p.y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
        };
        // Oranžové varování: AKUMULOVANÁ oblast, kudy se držák vnořil do
        // materiálu (zůstává i po přejetí).
        const holderHit = getHolderGouge(calc);
        if (holderHit) {
          ctx.save();
          ctx.lineWidth = 1.5;
          // ČERVENĚ pás k offsetové čáře (kreslí se PRVNÍ, tvrdé vnoření do
          // materiálu je nad ním), ORANŽOVĚ vnoření do materiálu — jako dosud.
          paint(holderHit.band, 'rgba(231,76,60,0.55)', '#c0392b');
          paint(holderHit.hard, 'rgba(250,140,50,0.55)', '#e8590c');
          ctx.restore();
        }
        // ZAJETÍ DO HOTOVÉ KONTURY: části dílu, které simulace odebrala.
        // Kreslí se NAD stopou držáku — je to vada na samotném kusu, ne
        // varování o cestě nástroje.
        const partHit = getContourGouge(calc);
        if (partHit) {
          ctx.save();
          ctx.lineWidth = 1.5;
          paint(partHit, 'rgba(255,45,45,0.6)', '#ff2d2d');
          ctx.restore();
        }
        ctx.fillStyle = C.insert; ctx.strokeStyle = C.text; ctx.lineWidth = 1;
        if (tp.toolShape === 'round') {
          ctx.beginPath(); ctx.arc(pt.x, pt.y, rPix, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        } else if (tp.toolShape === 'threading') {
          // Závitový plátek: pracovní zub (lichoběžník) — rovná SPODNÍ STRANA
          // (šířka toolTipFlat) leží přímo na dráze (X průchodu = ⌀ řezu),
          // boky stoupají symetricky ±ε/2 od svislice. Rádius se nepoužívá.
          // Nad ním světle celá destička (trojúhelník se zuby v rozích),
          // sdílené s ⚙️ Geometrie — drawThreadingInsert. Spodní strana
          // min. 1,5 px, ať je vidět i při oddálení.
          const scl = S.view.scale;
          ctx.save(); ctx.translate(pt.x, pt.y);
          if (S.flipX !== boreView) ctx.scale(1, -1);   // vyvrtávání: nůž k ose
          drawThreadingInsert(ctx, { ...tp, toolTipFlat: Math.max(parseFloat(tp.toolTipFlat) || 0, 1.5 / scl) }, scl);
          ctx.restore();
        } else if (tp.toolShape === 'polygon') {
          ctx.save(); ctx.translate(pt.x, pt.y);
          // Zrcadlení destičky musí odpovídat globálnímu pohledu (viz vS/hS
          // v toScreen). Horizontálně (osa Z): backside a flipZ se vzájemně
          // ruší (XOR). Vertikálně (osa X): flipX zrcadlí pohled svisle.
          if ((toolMirrored()) !== !!S.flipZ) ctx.scale(-1, 1);
          if (S.flipX !== boreView) ctx.scale(1, -1);   // vyvrtávání: nůž k ose
          // Celá destička + řezná část ze SDÍLENÝCH segmentů (tentýž obrys
          // počítá úběr a kolize). Vlastní kopie vzorců tu dřív ignorovala
          // ⇄ Přehodit stranu (toolTipMirror) — simulace ukazovala destičku
          // jinak, než se s ní počítalo. R o −0,75 px menší, viz rPix výš.
          const scl = S.view.scale;
          const cut = drawPolygonInsert(ctx, { ...tp, toolRadius: rPix / scl }, scl);
          // Vizualizace úhlu hřbetu (α) — tečkované čáry na hranách plátku.
          // Hrany z obrysu: t1→farA (hlavní ostří), farB→t2 (vedlejší).
          const clearDeg = parseFloat(tp.toolClearanceAngle) || 0;
          if (clearDeg > 0 && cut.length >= 3) {
            const clearRad = clearDeg * Math.PI / 180;
            // Na kterou stranu leží tělo destičky, určuje ⇄ (toolTipMirror).
            const sgn = tp.toolTipMirror ? -1 : 1;
            const clLen = Math.min((parseFloat(tp.toolLength) || 10) * scl * 0.65, 30);
            const px = p => ({ x: p.x * scl, y: -p.z * scl });
            const edgeA = cut[0], edgeB = cut[cut.length - 2];
            const hair = (from, to, rot) => {
              const f = px(from), t = px(to);
              const a = Math.atan2(t.y - f.y, t.x - f.x) + rot;
              ctx.beginPath(); ctx.moveTo(f.x, f.y);
              ctx.lineTo(f.x + Math.cos(a) * clLen, f.y + Math.sin(a) * clLen);
              ctx.stroke();
            };
            ctx.save();
            ctx.strokeStyle = 'rgba(166,173,200,0.7)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
            hair(edgeA.from, edgeA.to, -sgn * clearRad);   // hřbet na hlavním ostří
            hair(edgeB.to, edgeB.from, sgn * clearRad);    // hřbet na vedlejším ostří
            ctx.setLineDash([]);
            ctx.restore();
          }
          ctx.restore();
        } else if (tp.toolShape === 'parting') {
          // Upichovací / zapichovací plátek: šířka = toolLength, dva spodní
          // rádiusy R. Referenční bod (0,0) = STŘED RÁDIUSU PRACOVNÍ STRANY
          // (jako u polygonu): zprava = levý roh plátku, zleva = pravý roh.
          // Lokálně kreslíme vždy levý roh v počátku s tělem doprava (do už
          // obrobené zóny); stranu obrábění řeší zrcadlení níže.
          const wPix = (parseFloat(tp.toolLength) || 10) * S.view.scale;
          const rotRad = -(parseFloat(tp.toolAngle) || 0) * (Math.PI / 180);
          const r = Math.min(rPix, wPix / 2);        // rádius nesmí být širší než půl plátku
          const w2 = wPix - 2 * r;                   // rovná část spodního ostří
          // Stejná mm-výška jako v dialogu "⚙️ Geometrie" (PARTING_BODY_MIN_H_MM),
          // aby plátek vypadal stejně vysoký v simulaci i v náhledu geometrie.
          const bodyH = Math.max(wPix * 0.6, r + PARTING_BODY_MIN_H_MM * S.view.scale);
          ctx.save(); ctx.translate(pt.x, pt.y);
          // Zrcadlení: strana obrábění (zleva = otočený plátek) XOR flipZ
          // vodorovně; flipX svisle — ladí s vS/hS v toScreen.
          if (((tp.roughingSide || 'right') === 'left') !== !!S.flipZ) ctx.scale(-1, 1);
          if (S.flipX !== boreView) ctx.scale(1, -1);   // vyvrtávání: nůž k ose
          ctx.rotate(rotRad);
          // Lokální souřadnice: y roste dolů (k ose). Střed aktivního rádiusu
          // = (0,0), spodní ostří na y=+r, tělo nahoru (−y), šířka doprava.
          ctx.beginPath();
          ctx.moveTo(-r, r - bodyH);                        // levý horní roh
          ctx.lineTo(-r, 0);                                // levá strana k tečně rádiusu
          ctx.arc(0, 0, r, Math.PI, Math.PI / 2, true);    // aktivní rádius (střed = ref. bod)
          ctx.lineTo(w2, r);                                // spodní ostří (rovná část)
          ctx.arc(w2, 0, r, Math.PI / 2, 0, true);         // druhý rádius
          ctx.lineTo(w2 + r, r - bodyH);                    // pravá strana nahoru
          ctx.closePath();
          ctx.fill(); ctx.stroke();
          // Malý kontrolní křížek ve středu DRUHÉHO (neaktivního) rádiusu —
          // při obrábění z druhé strany má ležet na offsetové čáře.
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(w2 - 5, 0); ctx.lineTo(w2 + 5, 0);
          ctx.moveTo(w2, -5); ctx.lineTo(w2, 5);
          ctx.stroke();
          ctx.restore();
        } else if (tp.toolShape === 'drill') {
          // Vrták v ose: špička na bodu dráhy, tělo k vyložení (od díry ven).
          // Zrcadlení jako u držáku — strana obrábění XOR flipZ, flipX svisle.
          ctx.save(); ctx.translate(pt.x, pt.y);
          if ((toolMirrored()) !== !!S.flipZ) ctx.scale(-1, 1);
          if (S.flipX !== boreView) ctx.scale(1, -1);   // vyvrtávání: nůž k ose
          drawDrillTool(ctx, tp, S.view.scale);
          ctx.restore();
        }
        // crosshair at tool center
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
        const crossPix = tp.toolShape === 'drill' ? 7 : Math.max(rPix + 4, 7);   // poloha nástroje zůstane vidět i při oddálení (u vrtáku ⌀/2 nedává smysl)
        ctx.beginPath(); ctx.moveTo(pt.x - crossPix, pt.y); ctx.lineTo(pt.x + crossPix, pt.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(pt.x, pt.y - crossPix); ctx.lineTo(pt.x, pt.y + crossPix); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    }

    // draw points
    if (!S.simRunning) {
      // Always show cylinder stock handles
      if (prms.stockMode === 'cylinder') {
        const sRad = (parseFloat(prms.stockDiameter) || 0) / 2;
        const sLen = parseFloat(prms.stockLength) || 0;
        const sFace = parseFloat(prms.stockFace) || 0;
        const handles = [toScreen(sRad, sFace), toScreen(sRad, -sLen)];
        const labels = ['⌀/Čelo', '⌀/Délka'];
        ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        handles.forEach((pt, i) => {
          const isHovered = (S._hoverIsStock && i === S.hoverPointId);
          const isDragged = (_draggingStock && i === S.draggedPointId);
          const radius = (isHovered || isDragged) ? 9 : 6;
          ctx.fillStyle = (isHovered || isDragged) ? '#f9e2af' : '#fab387';
          ctx.strokeStyle = '#1e1e2e'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          if (!isDragged) {
            ctx.fillStyle = '#fab387';
            ctx.fillText(labels[i], pt.x + 12, pt.y - 10);
          }
        });
      }
      // Body kontury — VŽDY zobrazené s čísly (pro referenci při popisu bodu).
      // V contour edit módu jsou interaktivní; v stock módu jen reference (menší).
      ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const contourActive = S.editMode === 'contour';
      const pointPickActive = S.addPointMode || S.delPointMode;
      // Hover zvýraznění segmentu kontury/polotovaru (pod body, aby body byly navrchu)
      if (_hoverContourSeg && !S.simRunning) {
        const hs = _hoverContourSeg;
        const pts = hs.isStock ? calc.stockWorldPoints : calc.worldPoints;
        if (pts && pts[hs.idx1] && pts[hs.idx2]) {
          const a = toScreen(pts[hs.idx1].xReal, pts[hs.idx1].zReal);
          const b = toScreen(pts[hs.idx2].xReal, pts[hs.idx2].zReal);
          ctx.save();
          ctx.strokeStyle = '#f9e2af'; ctx.lineWidth = 4; ctx.globalAlpha = 0.5;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          ctx.restore();
        }
      }
      // Drag zvýraznění segmentu kontury/polotovaru (během tažení)
      if (_draggedContourSeg && !S.simRunning) {
        const ds = _draggedContourSeg;
        const pts = ds.isStock ? calc.stockWorldPoints : calc.worldPoints;
        if (pts && pts[ds.idx1] && pts[ds.idx2]) {
          const a = toScreen(pts[ds.idx1].xReal, pts[ds.idx1].zReal);
          const b = toScreen(pts[ds.idx2].xReal, pts[ds.idx2].zReal);
          ctx.save();
          ctx.strokeStyle = '#f9e2af'; ctx.lineWidth = 4; ctx.globalAlpha = 0.7;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          ctx.restore();
        }
      }
      if (calc.worldPoints) {
        calc.worldPoints.forEach((p, i) => {
          if (!p) return;
          const pt = toScreen(p.xReal, p.zReal);
          const isHovered = (S.pointDragEnabled || contourActive || pointPickActive) && !S._hoverIsStock && i === S.hoverPointId;
          const isDragged = !_draggingStockPt && !_draggingStock && i === S.draggedPointId;
          const isSelected = contourActive && S.selectedPoints.has(i);
          // V profil módu: body původní kontury se nezobrazují (jen hover/drag/sel pro editaci)
          if (calc.profileViewActive && !isHovered && !isDragged && !isSelected) return;
          const radius = (isHovered || isDragged) ? 8 : (isSelected ? 6 : (contourActive ? 4 : 3));
          ctx.fillStyle = (isHovered || isDragged) ? '#f9e2af' : (isSelected ? '#f9e2af' : C.contour);
          ctx.beginPath(); ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2); ctx.fill();
          if (isSelected) {
            ctx.strokeStyle = '#f9e2af'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(pt.x, pt.y, radius + 3, 0, Math.PI * 2); ctx.stroke();
          }
          if (!isHovered && !isDragged && !calc.profileViewActive) {
            ctx.fillStyle = contourActive ? '#f9e2af' : C.contour;
            ctx.fillText(`${i + 1}`, pt.x + 8, pt.y - 8);
          }
        });
      }
      // Body polotovaru — VŽDY zobrazené s čísly (S1, S2...), jen pro
      // casting (ne pro cylinder — ten má své vlastní handle nahoře).
      // V stock edit módu jsou interaktivní; v contour módu jen reference.
      if (calc.stockWorldPoints && prms.stockMode !== 'cylinder') {
        const stockActive = S.editMode === 'stock';
        calc.stockWorldPoints.forEach((p, i) => {
          if (!p) return;
          const pt = toScreen(p.xReal, p.zReal);
          const isHovered = (S.pointDragEnabled || stockActive || pointPickActive) && S._hoverIsStock && i === S.hoverPointId;
          const isDragged = _draggingStockPt && i === S.draggedPointId;
          const isSelected = stockActive && S.selectedPoints.has(i);
          const radius = (isHovered || isDragged) ? 8 : (isSelected ? 6 : (stockActive ? 4 : 3));
          ctx.fillStyle = (isHovered || isDragged) ? '#f9e2af' : (isSelected ? '#f9e2af' : C.pass);
          ctx.beginPath(); ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2); ctx.fill();
          if (isSelected) {
            ctx.strokeStyle = '#f9e2af'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(pt.x, pt.y, radius + 3, 0, Math.PI * 2); ctx.stroke();
          }
          if (!isHovered && !isDragged) {
            ctx.fillStyle = stockActive ? '#f9e2af' : C.pass;
            ctx.fillText(`S${i + 1}`, pt.x + 8, pt.y - 8);
          }
        });
      }
    }

    // Profil mód: profilová dráha se kreslí MIMO if(!simRunning) blok
    // → viditelná i při spuštěné simulaci (jako overlay nad nástrojem).
    // Auto/Krok náhled (⊙ Auto, ◀ Ubrat, Přidat ▶) kreslí STEJNOU logikou, jen
    // ze segmentů _camAutoSegs (odkrytá část, revealCount) a jinou barvou,
    // ať je zřejmé, že jde o nepotvrzený náhled.
    const _autoPreviewActive = !!(_camAutoSegs && _camAutoRevealCount > 0);
    if (calc.profileViewActive || _autoPreviewActive) {
      const profSegs = _autoPreviewActive
        ? _camAutoSegs.slice(0, _camAutoRevealCount).filter(s => !s.isDegenerate)
        : (calc.machinableContour || calc.contourSegments || []).filter(s => !s.isDegenerate);
      if (profSegs.length > 0) {
        ctx.beginPath();
        let _fp = true;
        for (const s of profSegs) {
          if (s.type === 'line') {
            const a = toScreen(s.p1.x, s.p1.z), b = toScreen(s.p2.x, s.p2.z);
            // chainBreak (rychloposuv přes mezeru — viz _camBuildFinalTracePts)
            // se v NÁHLEDU trasování kreslí VIDITELNĚ (lineTo), na rozdíl od
            // drah G-kódu (offsetPath) o kousek výš — tady se ukazuje uživateli
            // rozpracovaná trasa, ne skutečná dráha nástroje, takže neviditelná
            // mezera jen matla ("kde mi zmizela čára").
            if (_fp) { ctx.moveTo(a.x, a.y); _fp = false; } else ctx.lineTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
          } else if (s.type === 'arc') {
            const p1 = toScreen(s.cx + Math.sin(s.startAngle)*s.r, s.cz + Math.cos(s.startAngle)*s.r);
            if (_fp) { ctx.moveTo(p1.x, p1.y); _fp = false; } else ctx.lineTo(p1.x, p1.y);
            const steps = Math.max(6, Math.round(Math.abs(s.endAngle - s.startAngle) * s.r / 0.5));
            for (let j = 1; j <= steps; j++) {
              const a2 = s.startAngle + (s.endAngle - s.startAngle) * (j / steps);
              const pt2 = toScreen(s.cx + Math.sin(a2)*s.r, s.cz + Math.cos(a2)*s.r);
              ctx.lineTo(pt2.x, pt2.y);
            }
          }
        }
        ctx.strokeStyle = _autoPreviewActive ? C.trace : C.contour; ctx.lineWidth = 3; ctx.stroke();
        // Číslování jen krajních bodů (ne interpolace oblouku)
        const nPts = [];
        for (const s of profSegs) {
          const p1 = s.type === 'line' ? s.p1 : { x: s.cx + Math.sin(s.startAngle)*s.r, z: s.cz + Math.cos(s.startAngle)*s.r };
          const last = nPts[nPts.length - 1];
          if (!last || Math.hypot(p1.x - last.x, p1.z - last.z) > 0.1) nPts.push(p1);
        }
        const lSeg = profSegs[profSegs.length - 1];
        const lPt = lSeg.type === 'line' ? lSeg.p2 : { x: lSeg.cx + Math.sin(lSeg.endAngle)*lSeg.r, z: lSeg.cz + Math.cos(lSeg.endAngle)*lSeg.r };
        if (!nPts.length || Math.hypot(lPt.x - nPts[nPts.length-1].x, lPt.z - nPts[nPts.length-1].z) > 0.1) nPts.push(lPt);
        nPts.forEach((p, i) => {
          const pt = toScreen(p.x, p.z);
          ctx.fillStyle = _autoPreviewActive ? C.trace : C.contour;
          ctx.beginPath(); ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2); ctx.fill();
          ctx.fillText(`${i + 1}`, pt.x + 7, pt.y - 7);
        });
      }
    }

    // Úseky podélného hrubování (pravidla 1 a 8) — čáry hranic a pořadí.
    if (S.showSections !== false) drawSectionPlan(ctx, calc.sectionPlan, toScreen, getSectionLeftover(calc));

    // Z-limity (čelisti, koník, rozsah obrábění)
    if (S.showZLimits && S.showZLimits !== 'off') {
      const drawZLine = (zVal, color, label, isRange) => {
        if (zVal === null || zVal === undefined || isNaN(zVal)) return;
        // Vodorovná (karusel) nebo svislá (soustruh) čára na pozici Z
        const isKarusel = prms.machineStructure === 'carousel';
        ctx.strokeStyle = color;
        ctx.lineWidth = (S.draggedLimit && S.zLimits[S.draggedLimit] === zVal) ? 2.5 : 1.8;
        ctx.setLineDash(isRange ? [10, 4] : [3, 5]);
        ctx.beginPath();
        if (isKarusel) {
          const py = toScreen(0, zVal).y;
          ctx.moveTo(0, py); ctx.lineTo(w, py);
        } else {
          const px = toScreen(0, zVal).x;
          ctx.moveTo(px, 0); ctx.lineTo(px, h);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        // Popisek
        ctx.fillStyle = color;
        ctx.font = 'bold 11px sans-serif';
        if (isKarusel) {
          const py = toScreen(0, zVal).y;
          ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
          ctx.fillText(`${label} Z=${zVal}`, 6, py - 3);
        } else {
          const px = toScreen(0, zVal).x;
          ctx.save();
          ctx.translate(px - 4, 8);
          ctx.rotate(-Math.PI / 2);
          ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
          ctx.fillText(`${label} Z=${zVal}`, 0, 0);
          ctx.restore();
        }
      };
      // Zobrazí jen čáry jejichž checkbox je zaškrtnutý v parametrech
      if (S.zLimits.chuckActive)  drawZLine(S.zLimits.chuck, '#f38ba8', '⛔ Čelisti', false);
      if (S.zLimits.tailActive)   drawZLine(S.zLimits.tail,  '#f38ba8', '⛔ Koník',   false);
      if (S.zLimits.rangeActive) {
        drawZLine(S.zLimits.rangeStart, '#f9e2af', '◀ Start rozsahu', true);
        drawZLine(S.zLimits.rangeEnd,   '#f9e2af', 'Konec rozsahu ▶', true);
      }
    }

    // X-rozsah obrábění (horizontální čáry pro poloměr)
    if (S.showZLimits && S.showZLimits !== 'off') {
      const drawXLine = (xVal, color, label) => {
        if (xVal === null || xVal === undefined || isNaN(xVal)) return;
        const isKarusel = prms.machineStructure === 'carousel';
        ctx.strokeStyle = color;
        ctx.lineWidth = (S.draggedLimit && S.xLimits[S.draggedLimit] === xVal) ? 2.5 : 1.8;
        ctx.setLineDash([10, 4]);
        ctx.beginPath();
        if (isKarusel) {
          const px = toScreen(xVal, 0).x;
          ctx.moveTo(px, 0); ctx.lineTo(px, h);
        } else {
          const py = toScreen(xVal, 0).y;
          ctx.moveTo(0, py); ctx.lineTo(w, py);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = 'bold 11px sans-serif';
        if (isKarusel) {
          const px = toScreen(xVal, 0).x;
          ctx.save();
          ctx.translate(px - 4, 8);
          ctx.rotate(-Math.PI / 2);
          ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
          ctx.fillText(`${label} X=${xVal}`, 0, 0);
          ctx.restore();
        } else {
          const py = toScreen(xVal, 0).y;
          ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
          ctx.fillText(`${label} X=${xVal}`, w - 6, py - 3);
        }
      };
      if (xBoundOn(S.xLimits, 'min')) drawXLine(S.xLimits.rangeXMin, '#a6e3a1', '▼ X min');
      if (xBoundOn(S.xLimits, 'max')) drawXLine(S.xLimits.rangeXMax, '#a6e3a1', 'X max ▲');
    }

    // Selection rectangle
    if (S.rectSelecting && S.rectStart && S.rectEnd) {
      const rx = Math.min(S.rectStart.x, S.rectEnd.x);
      const ry = Math.min(S.rectStart.y, S.rectEnd.y);
      const rw = Math.abs(S.rectEnd.x - S.rectStart.x);
      const rh = Math.abs(S.rectEnd.y - S.rectStart.y);
      ctx.fillStyle = 'rgba(137,180,250,0.15)';
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = '#89b4fa'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.setLineDash([]);
    }

    // Snap guide lines
    if (S.snapLines.length > 0) {
      ctx.save();
      ctx.strokeStyle = '#f9e2af'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      S.snapLines.forEach(snap => {
        ctx.beginPath();
        if (snap.type === 'x') {
          const p1 = toScreen(snap.val, snap.from - 5);
          const p2 = toScreen(snap.val, snap.to + 5);
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        } else {
          const p1 = toScreen(snap.from - 5, snap.val);
          const p2 = toScreen(snap.to + 5, snap.val);
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        }
        ctx.stroke();
      });
      ctx.restore();
    }

    // Rect select mode indicator
    if (S.rectSelecting && !S.rectStart) {
      ctx.fillStyle = 'rgba(137,180,250,0.8)'; ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⬚ Tažením vyberte body', w / 2, 20);
    }

    // Úhlový snap – vodicí čára (vodorovně/kolmo) od ref bodu k bodu.
    if (S.snapEnabled && S._angleSnapLine && !S.simRunning) {
      const a = toScreen(S._angleSnapLine.from.x, S._angleSnapLine.from.z);
      const b = toScreen(S._angleSnapLine.to.x, S._angleSnapLine.to.z);
      ctx.strokeStyle = 'rgba(249,226,175,0.7)'; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
    }

    // SNAP indikátor (navrch): čtvereček = bod, kolečko = hrana, + souřadnice.
    if (S.snapEnabled && S._snap && !S.simRunning) {
      const sp = toScreen(S._snap.x, S._snap.z);
      if (S._snap.type === 'point') {
        ctx.strokeStyle = '#f9e2af'; ctx.lineWidth = 2;
        ctx.strokeRect(sp.x - 6, sp.y - 6, 12, 12);
        ctx.font = '11px Consolas'; ctx.fillStyle = '#f9e2af';
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText('SNAP', sp.x + 9, sp.y - 3);
      } else {
        ctx.strokeStyle = '#94e2d5'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sp.x, sp.y, 5, 0, Math.PI * 2); ctx.stroke();
      }
      const xDisp = prms.mode === 'DIAMON' ? S._snap.x * 2 : S._snap.x;
      const label = `X: ${xDisp.toFixed(3)}  Z: ${S._snap.z.toFixed(3)}`;
      ctx.font = '11px Consolas';
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(30,30,46,0.9)';
      ctx.fillRect(sp.x - tw / 2 - 5, sp.y - 36, tw + 10, 17);
      ctx.fillStyle = '#cdd6f4';
      ctx.fillText(label, sp.x, sp.y - 24);
      ctx.textAlign = 'left';
    }

    // Označený bod/uzel pro dvoukrokové uchopení (mobil) – výrazný kroužek.
    if (S._camMarked && !S.simRunning) {
      const mp = toScreen(S._camMarked.x, S._camMarked.z);
      ctx.strokeStyle = '#f5c2e7'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mp.x, mp.y, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(mp.x, mp.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#f5c2e7'; ctx.fill();
    }
  }

  // ── fitView ──
  // Měřítko podle obrysu + polotovaru (+ bezpečné polohy), ale volné místo se
  // NEdělí rovnoměrně: víc ho dostane strana, odkud jede nůž — radiálně od osy
  // ven (podle kvadrantu, ve kterém díl leží), axiálně podle strany obrábění
  // (▶ zprava / ◀ zleva). Plocha pod tlačítky nahoře a údajem času dole se
  // nepočítá. Přání uživatele 1. 10. 2026: nahoře, kudy při simulaci jede nůž,
  // nebylo vidět, a pod dílem zůstávalo zbytečné místo.
  function fitView() {
    const points = resolvePointsToAbsolute(S.contourPoints);
    if (points.length === 0) return;
    const prms = S.params;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    points.forEach(p => {
      const x = prms.mode === 'DIAMON' ? p.xAbs / 2 : p.xAbs;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (p.zAbs < minZ) minZ = p.zAbs; if (p.zAbs > maxZ) maxZ = p.zAbs;
    });
    // Include stock bounds
    if (prms.stockMode === 'cylinder') {
      const sRad = (parseFloat(prms.stockDiameter) || 0) / 2;
      const sLen = parseFloat(prms.stockLength) || 0;
      const sFace = parseFloat(prms.stockFace) || 0;
      if (sRad > maxX) maxX = sRad;
      if (-sLen < minZ) minZ = -sLen;
      if (sFace > maxZ) maxZ = sFace;
    } else {
      const stockPts = resolvePointsToAbsolute(S.stockPoints);
      stockPts.forEach(p => {
        const x = prms.mode === 'DIAMON' ? p.xAbs / 2 : p.xAbs;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (p.zAbs < minZ) minZ = p.zAbs; if (p.zAbs > maxZ) maxZ = p.zAbs;
      });
    }
    // Strana nože: radiálně ven od osy (díl pod osou → dolů), axiálně podle
    // strany obrábění (svět, ne obrazovka — flipZ řeší znaménko hS níž).
    const dirX = (minX + maxX) / 2 >= 0 ? 1 : -1;
    const dirZ = (prms.roughingSide || 'right') === 'left' ? -1 : 1;
    // Bezpečná poloha = odkud nůž přijíždí a kam se vrací. Rámeček rozšíří
    // nejvýš o velikost dílu v té ose, ať vzdálený bod díl nezmenší na tečku.
    const safeX = (parseFloat(prms.safeX) || 0) / (prms.mode === 'DIAMON' ? 2 : 1);
    const safeZ = parseFloat(prms.safeZ);
    const sizeX = maxX - minX, sizeZ = maxZ - minZ;
    if (Number.isFinite(safeX)) { minX = Math.min(minX, Math.max(safeX, minX - sizeX)); maxX = Math.max(maxX, Math.min(safeX, maxX + sizeX)); }
    if (Number.isFinite(safeZ)) { minZ = Math.min(minZ, Math.max(safeZ, minZ - sizeZ)); maxZ = Math.max(maxZ, Math.min(safeZ, maxZ + sizeZ)); }
    const pad = 20;
    const isCar = prms.machineStructure === 'carousel';
    const visW = isCar ? (maxX - minX) : (maxZ - minZ);
    const visH = isCar ? (maxZ - minZ) : (maxX - minX);
    const ww = visW + pad * 2, hh = visH + pad * 2;
    if (ww <= 0 || hh <= 0) return;
    const cW = canvasWrap.clientWidth, cH = canvasWrap.clientHeight;
    if (cW === 0 || cH === 0) return;
    // Tlačítka nahoře (na mobilu dvě řady) a čas dole překrývají plátno.
    const wrapTop = canvasWrap.getBoundingClientRect().top;
    const tbRect = camToolbar && camToolbar.offsetParent ? camToolbar.getBoundingClientRect() : null;
    const insetTop = tbRect ? Math.max(0, Math.min(cH / 3, tbRect.bottom - wrapTop + 4)) : 0;
    const timeEl = canvasWrap.querySelector('.cam-sim-time-overlay');
    const insetBottom = timeEl && timeEl.textContent.trim() ? Math.max(0, cH - timeEl.offsetTop) : 0;
    const uH = Math.max(1, cH - insetTop - insetBottom);
    let ns = Math.min(cW / ww, uH / hh) * 0.8;
    if (ns > 10) ns = 10; if (ns < 0.1) ns = 0.1;
    const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
    // Posun v jedné ose obrazovky: díl (lo..hi světa, znaménko sgn) dostane
    // na straně bez nože podíl `nonShare` volného místa, zbytek jde k noži.
    const place = (lo, hi, sgn, dir, u0, u1, nonShare) => {
      const sMin = Math.min(sgn * lo, sgn * hi) * ns;
      const ext = (hi - lo) * ns;
      const slack = (u1 - u0) - ext;
      const gap = slack > 0 ? slack * nonShare : slack / 2;
      const lowEdge = sgn * dir > 0 ? u0 + gap : u1 - gap - ext;
      return lowEdge - sMin;
    };
    // Radiálně sedí nad řezem celý držák → nůž dostane ¾ místa; axiálně
    // přečnívá jen kousek za čelo → mírnější posun.
    const RAD = 0.25, AX = 0.35;
    if (isCar) S.view = { scale: ns, panX: place(minX, maxX, hS, dirX, 0, cW, RAD), panY: place(minZ, maxZ, vS, dirZ, insetTop, cH - insetBottom, AX) };
    else S.view = { scale: ns, panX: place(minZ, maxZ, hS, dirZ, 0, cW, AX), panY: place(minX, maxX, vS, dirX, insetTop, cH - insetBottom, RAD) };
    draw();
  }

  // ── getPointAt (hit testing) ──
  function getStockHandleAt(clientX, clientY) {
    if (S.simRunning || S.params.stockMode !== 'cylinder') return null;
    const calc = S._cachedCalc; if (!calc) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    const prms = S.params;
    const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
    const toScreen = (x, z) => {
      if (prms.machineStructure === 'carousel') return { x: S.view.panX + hS * x * S.view.scale, y: S.view.panY + vS * z * S.view.scale };
      return { x: S.view.panX + hS * z * S.view.scale, y: S.view.panY + vS * x * S.view.scale };
    };
    const sRad = (parseFloat(prms.stockDiameter) || 0) / 2;
    const sLen = parseFloat(prms.stockLength) || 0;
    const sFace = parseFloat(prms.stockFace) || 0;
    const handles = [
      { x: sRad, z: sFace },
      { x: sRad, z: -sLen },
    ];
    let closest = null, minD = Infinity;
    for (let i = 0; i < handles.length; i++) {
      const pt = toScreen(handles[i].x, handles[i].z);
      const d = Math.hypot(pt.x - mx, pt.y - my);
      if (d < 18 && d < minD) { minD = d; closest = i; }
    }
    return closest;
  }

  function getPointAt(clientX, clientY) {
    if (S.simRunning) return null;
    const calc = S._cachedCalc; if (!calc) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    const prms = S.params;
    const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
    const toScreen = (x, z) => {
      if (prms.machineStructure === 'carousel') return { x: S.view.panX + hS * x * S.view.scale, y: S.view.panY + vS * z * S.view.scale };
      return { x: S.view.panX + hS * z * S.view.scale, y: S.view.panY + vS * x * S.view.scale };
    };
    const pts = S.editMode === 'contour' ? calc.worldPoints : calc.stockWorldPoints;
    if (!pts) return null;
    let closest = null, minD = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const pt = toScreen(pts[i].xReal, pts[i].zReal);
      const d = Math.hypot(pt.x - mx, pt.y - my);
      if (d < 15 && d < minD) { minD = d; closest = i; }
    }
    return closest;
  }

  // ── Úprava drah přímo v G-kódu (tažení v canvasu) ──
  // Společná projekce svět→obrazovka (shodná s draw()).
  function _gToScreen(x, z) {
    const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
    if (S.params.machineStructure === 'carousel')
      return { x: S.view.panX + hS * x * S.view.scale, y: S.view.panY + vS * z * S.view.scale };
    return { x: S.view.panX + hS * z * S.view.scale, y: S.view.panY + vS * x * S.view.scale };
  }
  function _gToWorld(sx, sy) {
    const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
    if (S.params.machineStructure === 'carousel')
      return { x: hS * (sx - S.view.panX) / S.view.scale, z: vS * (sy - S.view.panY) / S.view.scale };
    return { z: hS * (sx - S.view.panX) / S.view.scale, x: vS * (sy - S.view.panY) / S.view.scale };
  }

  // ── Úprava drah v G-kódu: uzly, úsečky, zápis řádků ── → cam/sim/gcodeNodes.js
  const { getGNodes, getGNodeAt, getGSegmentAt, writeGLines, writeGLine, deleteGLine, insertGMove } = createGcodeNodes({
    S, canvas, _gToScreen, markGCodeEdited, recalcNow, generateGCode, renderCodeArea, draw, scheduleFrame, saveState,
  });

  // ── Hit-testy (body, úsečky, oblouky, upichnutí, mezní čáry) ── → cam/sim/hitTest.js
  const { getAnyPointAt, getPartOffHandleAt, _partOffRadiusFromClient, _applyPartOffHandle,
    getContourSegmentAt, clientToWorldCam, getArcSegmentAt, getZLimitAt, getXLimitAt } = createHitTest({ S, canvas });

  // ── Konstrukční čáry: pomocné + automatické mezní, prodloužit/oříznout ── → cam/sim/guideLines.js
  const { getAllGuideLines, getGuideOffsetLines, extendTrimNode, extendTrimGuideClick, getUserGuideAt,
    getGuideEndpointAt, getUserGuideEndAt, findAutoGuideForAction, lineGeometryHits, insertPointOnSegmentAt } = createGuideLines({
    S, pushHistory, writeGLine, saveState, renderTab, updateUndoRedoBtns, draw, clientToWorldCam, fullUpdate,
  });

  // ── SNAP (jako v CAD) + SNAP MEZNÍCH ČAR ── → cam/sim/snap.js
  const { getStockPlanOutline, camSnap, snapLimitValue, snapWorld } = createSnap({ S, canvas, _gToWorld, getGNodes, getAllGuideLines, getGuideOffsetLines });

  // ── SIMULATION ──
  // 1× = REÁLNÝ čas stroje: dráha se ujíždí skutečnými rychlostmi
  // (rychloposuv z parametrů, řezný posuv F × otáčky v daném průměru,
  // viz cam/feedRates.js). Vyšší násobky jen zrychlují přehrávání.
  const SIM_SPEEDS = [0.1, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64];
  // Strop kroku jednoho snímku [s] — po přepnutí záložky prohlížeče
  // requestAnimationFrame stojí a nahromaděný čas by dráhu „přeskočil".
  const SIM_MAX_FRAME_SEC = 0.25;

  function updateProgressBar() {
    const pct = Math.round(S.simProgress * 100);
    progressFill.style.width = pct + '%';
    progressPct.textContent = pct + '%';
  }

  // Kumulativní časy dráhy (ubíhající čas v overlayi) — počítají se jednou
  // na dráhu, ne při každém snímku. Každý calculate() vrací nové pole
  // simPath, takže reference stačí jako klíč cache.
  function simTimeProfile(simPath) {
    if (S._simTimeSrc !== simPath) {
      S._simTimeSrc = simPath;
      S._simTimeProf = buildTimeProfile(simPath, S.params);
    }
    return S._simTimeProf;
  }

  // Živý údaj nad časem: ubíhající čas programu + skutečné otáčky vřetene
  // a posuv v místě, kde nástroj právě je (⌀ v daném bodě → n = Vc·1000/π⌀
  // omezené LIMS, posuv F [mm/ot] × n = mm/min). U rychloposuvu jen G0.
  function showMotionInfo(pt, xRadius, elapsedSec) {
    const prms = S.params;
    const rapid = !pt || pt.type === 'G0';
    motionOverlay.classList.toggle('cam-sim-motion-rapid', rapid);
    const rate = moveRateMmMin(pt, xRadius, prms);
    const clock = `⏱ ${fmtClock(elapsedSec)}`;
    if (rapid) {
      motionOverlay.textContent = `${clock} · G0 rychloposuv ${Math.round(rate)} mm/min`;
      return;
    }
    const rpm = spindleRpmAt(xRadius, prms, pt);
    const perRev = pt.feedMode === 'G94' ? null : ((Number.isFinite(pt.feed) && pt.feed > 0) ? pt.feed : (parseFloat(prms.feed) || 0.1));
    motionOverlay.textContent =
      `${clock} · ${Math.round(rpm)} ot/min · F ${Math.round(rate)} mm/min` +
      (perRev ? ` (${perRev} mm/ot)` : '');
  }

  function updateSpeedLabel() {
    const v = S.simSpeed;
    const txt = v < 1 ? v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '') : v;
    speedLabel.textContent = txt + '×';
  }

  // Posun simulace o jeden G-kód blok vpřed (+1) nebo zpět (-1).
  function seekToAdjacentBlock(direction) {
    if (!S._cachedCalc) recalcNow();
    const calc = S._cachedCalc;
    const total = calc.simPath.length - 1;
    if (total <= 0) return;
    S.simRunning = false; S.simBlockTarget = null; playBtn.textContent = '▶';
    S._gcodeFocusLine = null;   // ovládání simulace přebíjí kliknutý řádek
    const currentSimIdx = Math.max(0, Math.min(total, Math.floor(S.simProgress * total)));
    const currentLineIdx = calc.simPath[currentSimIdx]?.originalLineIdx ?? -1;
    let targetIdx;
    if (direction > 0) {
      targetIdx = total;
      for (let i = currentSimIdx + 1; i <= total; i++) {
        const li = calc.simPath[i].originalLineIdx;
        if (li != null && li > currentLineIdx) { targetIdx = i; break; }
      }
    } else {
      // Najít začátek aktuálního bloku; pokud už na něm jsme, skočit na začátek předchozího.
      let blockStart = currentSimIdx;
      while (blockStart > 0 && calc.simPath[blockStart - 1].originalLineIdx === currentLineIdx) blockStart--;
      if (blockStart < currentSimIdx) {
        targetIdx = blockStart;
      } else {
        const prevLineIdx = blockStart > 0 ? calc.simPath[blockStart - 1].originalLineIdx : null;
        let i = blockStart - 1;
        while (i > 0 && calc.simPath[i - 1].originalLineIdx === prevLineIdx) i--;
        targetIdx = Math.max(0, i);
      }
    }
    S.simProgress = targetIdx / total;
    draw(); updateCodeHighlight(); updateProgressBar();
  }

  /**
   * Postavit simulaci na KONEC bloku na řádku `li` (klik do G-kódu).
   *
   * Konec, ne začátek: krok po blocích (`seekToAdjacentBlock`) parkuje taky na
   * konci, takže klik i šipky nechají nástroj na stejném místě a zvýrazní
   * stejný řádek. Řádky BEZ pohybu (komentář, M-kód, `G96`…) v `simPath`
   * žádný bod nemají — na ty se simulace nehne, jen se do nich postaví kurzor.
   *
   * @returns {boolean} povedlo se najet
   */
  function seekToLine(li) {
    if (!S._cachedCalc) recalcNow();
    const calc = S._cachedCalc;
    const total = (calc.simPath || []).length - 1;
    if (total <= 0 || li == null) return false;
    let targetIdx = -1;
    for (let i = total; i >= 0; i--) {
      if (calc.simPath[i].originalLineIdx === li) { targetIdx = i; break; }
    }
    if (targetIdx < 0) return false;
    S.simRunning = false; S.simBlockTarget = null; playBtn.textContent = '▶';
    S._gcodeFocusLine = null;   // zvýraznění řídí poloha simulace, ne klik
    S.simProgress = targetIdx / total;
    draw(); updateCodeHighlight(); updateProgressBar();
    return true;
  }

  function startSimLoop() {
    if (S._animId) return;
    S._simLastTs = null;
    const animate = (ts) => {
      if (!S.simRunning) { S._animId = null; S._simLastTs = null; return; }
      const now = typeof ts === 'number' ? ts : performance.now();
      const dtSec = S._simLastTs == null ? 1 / 60 : Math.min((now - S._simLastTs) / 1000, SIM_MAX_FRAME_SEC);
      S._simLastTs = now;
      const calc = S._cachedCalc;
      if (calc && calc.simPath && calc.simPath.length > 1) {
        // Reálný čas stroje: každý segment se ujíždí svojí skutečnou
        // rychlostí (G0 rychloposuvem, řezné pohyby posuvem F přes otáčky
        // v daném průměru); simSpeed jen násobí plynutí času.
        S.simProgress = advanceAlongPath(calc.simPath, S.simProgress, dtSec * S.simSpeed, S.params);
      } else {
        S.simProgress = 1;
      }
      // Single-block: zastavit po dosažení konce aktuálního G-kód bloku.
      if (S.simBlockTarget !== null && S.simProgress >= S.simBlockTarget) {
        S.simProgress = S.simBlockTarget;
        S.simBlockTarget = null;
        S.simRunning = false;
      }
      if (S.simProgress >= 1) {
        S.simProgress = 1; S.simRunning = false;
        S.simBlockTarget = null;
      }
      if (!S.simRunning) {
        playBtn.textContent = '▶';
      }
      draw();
      updateCodeHighlight();
      updateProgressBar();
      if (S.simRunning) S._animId = requestAnimationFrame(animate);
      else { S._animId = null; S._simLastTs = null; }
    };
    S._animId = requestAnimationFrame(animate);
  }

  // ── UI: errors ──
  function showErrors() {
    if (S.errors.length === 0) { errorsDiv.style.display = 'none'; return; }
    errorsDiv.style.display = '';
    const n = S.errors.length;
    const open = S.errorsOpen;
    errorsDiv.innerHTML =
      `<button class="cam-sim-errors-toggle" data-act="errors-toggle">
        <span>⚠ Nalezeny problémy: ${n}</span>
        <span class="cam-sim-err-chevron">${open ? '▲' : '▼'}</span>
      </button>
      <div class="cam-sim-errors-body${open ? '' : ' cam-sim-collapsed'}">
        <ul>${S.errors.map(e => '<li>' + (e.msg || e) + '</li>').join('')}</ul>
      </div>`;
    errorsDiv.querySelector('[data-act="errors-toggle"]').addEventListener('click', () => {
      S.errorsOpen = !S.errorsOpen;
      showErrors();
    });
  }

  // ── UI: code area ──
  function renderCodeArea() {
    const calc = S._cachedCalc; if (!calc) return;
    // time info on canvas
    if (calc.estimatedTimeSeconds > 0)
      timeOverlay.textContent = `⏱ ${fmtDuration(calc.estimatedTimeSeconds)} | ${(calc.totalPathLength / 1000).toFixed(2)}m`;
    else timeOverlay.textContent = '';

    if (manualTa.value !== S.manualGCode) manualTa.value = S.manualGCode;
    manualTa.readOnly = S.opView === 'all';
    manualTa.placeholder = S.opView === 'all'
      ? 'Náhled celého programu (jen ke čtení) — pro úpravy přepněte na „Část"'
      : 'Zde můžete psát vlastní G-kód...';
    renderCodeBackdrop();
    updateCodeHighlight();
    updateRefreshBtn();
    renderPartsBar();
  }

  // Stav tlačítka „🔄 Dráhy": puntík = program v editoru pochází z jiných
  // parametrů, než jaké jsou teď v panelu (náhled na plátně už ukazuje něco
  // jiného). Bez téhle značky by změna nastavení vypadala jako hotová věc,
  // ačkoli program čeká na přegenerování. Zámek 🔒 = v programu jsou ruční
  // úpravy, takže se před přepsáním zeptáme.
  function updateRefreshBtn() {
    if (!refreshBtn) return;
    const stale = gcodeStale();
    const locked = S.gcodeDirty;
    refreshBtn.classList.toggle('cam-sim-btn-stale', stale);
    refreshBtn.textContent = `🔄 Dráhy${stale ? ' ●' : ''}${locked ? ' 🔒' : ''}`;
    refreshBtn.title = [
      'Přegenerovat dráhy z aktuální kontury a parametrů.',
      stale ? '● Dráhy v programu jsou NEAKTUÁLNÍ — nastavení se od jejich vygenerování změnilo.' : '',
      locked ? '🔒 Program má ruční úpravy — před přepsáním se zeptám.' : '',
    ].filter(Boolean).join('\n');
    updateGenButtons();
  }

  // Vidět jsou jen tlačítka, která teď opravdu jdou použít — pravidla v cam/genButtons.js.
  function updateGenButtons() {
    const h = genButtonsHidden({ hasParts: partsActive(), allView: S.opView === 'all',
      fromSections: partsActive() && !!S.opParts[0].baseLimits, face: roughingKey() === 'face',
      sectionsOk: !sectionSteps(S._cachedCalc).error });
    refreshBtn.hidden = h.refresh; sectionBtn.hidden = h.section; resetPartsBtn.hidden = h.reset;
  }

  // ── UI: lišta částí programu (operací) ──
  // Skrytá, dokud je program jednooperační. Chip = jedna část (klik = přepnout,
  // dvojklik = přejmenovat, ✕ = smazat celou část), vpravo přepínač náhledu
  // Část / Celý program a odeslání všech částí do CAM Editoru.
  // Na mobilu (CSS @media ≤ 768 px) jsou místo chipů rozbalovací pole
  // + ✎/✕ pro aktivní část — chipy tam zabíraly několik řádků (1. 10. 2026).
  function renderPartsBar() {
    if (!partsBar) return;
    if (!partsActive()) { partsBar.style.display = 'none'; partsBar.innerHTML = ''; return; }
    partsBar.style.display = 'flex';
    const allView = S.opView === 'all';
    const shortName = p => p.name.replace(/^Část \d+\s*[–-]\s*/, '');
    const chips = S.opParts.map((p, i) => {
      const active = !allView && i === S.activePart;
      const empty = !p.gcode || !p.gcode.trim();
      const lines = empty ? 0 : p.gcode.split('\n').length;
      // Název části zadává uživatel (dvojklik) — do title= patří i escapované
      // uvozovky, jinak by jimi šlo rozbít atribut.
      const title = escAttr(`${p.name} — ${empty ? 'bez drah' : `${lines} řádků`}\nKlik = přepnout, dvojklik = přejmenovat`);
      return `<span class="cam-op-chip${active ? ' cam-op-active' : ''}${empty ? ' cam-op-empty' : ''}" data-op="${i}" title="${title}">
        <span class="cam-op-num">${i + 1}</span>${escHTML(shortName(p))}
        <button class="cam-op-del" data-op-del="${i}" title="Smazat celou část programu">✕</button>
      </span>`;
    }).join('');
    const options = (allView ? '<option value="" selected disabled>Celý program</option>' : '')
      + S.opParts.map((p, i) => {
        const empty = !p.gcode || !p.gcode.trim();
        const sel = !allView && i === S.activePart ? ' selected' : '';
        return `<option value="${i}"${sel}>${i + 1} · ${escHTML(shortName(p))}${empty ? ' (bez drah)' : ''}</option>`;
      }).join('');
    // ✎/✕ míří na aktivní část — v náhledu celého programu žádná není.
    const activeBtns = allView ? '' : `
        <button class="cam-op-mbtn" data-op-rename="${S.activePart}" title="Přejmenovat část">✎</button>
        <button class="cam-op-mbtn cam-op-mdel" data-op-del="${S.activePart}" title="Smazat celou část programu">✕</button>`;
    partsBar.innerHTML = `
      <span class="cam-op-label">Části:</span>
      <div class="cam-op-chips">${chips}</div>
      <div class="cam-op-pick${allView ? '' : ' cam-op-active'}">
        <select class="cam-op-select" title="Přepnout část programu">${options}</select>${activeBtns}
      </div>
      <div class="cam-op-views">
        <button data-op-view="part" class="${allView ? '' : 'cam-sim-active'}" title="Editace aktivní části — na plátně jen její dráhy nad polotovarem obrobeným předchozími částmi">Část</button>
        <button data-op-view="all" class="${allView ? 'cam-sim-active' : ''}" title="Náhled celého složeného programu od původního polotovaru (G-kód jen ke čtení)">Celý program</button>
        <button data-op-act="to-editor" title="Vložit všechny části do fronty „SPOJ G-KÓD" v CAM Editoru a otevřít spojený program (tam lze část upravit i vyhodit)">⛓ Spojit</button>
      </div>`;
  }
  // Vykreslí podkladové řádky pod textarea (1:1 se řádky G-kódu), aby šlo
  // zvýraznit aktivní řádek simulace pod editovatelným textem.
  function renderCodeBackdrop() {
    codeBackdrop.innerHTML = S.manualGCode.split('\n').map(line =>
      `<div class="cam-sim-code-bd-line">${escHTML(line) || '&nbsp;'}</div>`
    ).join('');
    codeBackdrop.scrollTop = manualTa.scrollTop;
    codeBackdrop.scrollLeft = manualTa.scrollLeft;
  }
  // Index řádku G-kódu odpovídající aktuální pozici simulace — najde
  // nejbližší následující bod simPath s originalLineIdx (viz
  // parseManualGCodeToPath). Používá se pro zvýraznění i skok kurzoru
  // v CAM Editoru na stejný řádek.
  //
  // ZAOKROUHLUJE SE NAHORU, ne dolů. Bod `simPath` nese číslo řádku, který ho
  // VYROBIL, takže bod pod aktuální pozicí patří bloku, který už DOJEL — právě
  // jedoucí blok končí až v bodě NAD ní. Se zaokrouhlením dolů šlo zvýraznění
  // o blok pozadu za nástrojem i za údajem v pruhu pod plátnem (ten bere
  // `pNext`, viz `showMotionInfo`) — nález uživatele 27. 8. 2026: svítilo
  // `N130 G0 X150 Z5`, když nástroj už jel `N140 G0 Z258.386`.
  //
  // Stojí-li simulace PŘESNĚ na uzlu (krok po blocích, klik na řádek), vyjde
  // ceil na ten uzel a zvýrazní se blok, který tam dojel — což je přesně to,
  // co uživatel odkrokoval. Epsilon jen kryje dělení a násobné `idx / total`.
  function getActiveCodeLineIdx() {
    const calc = S._cachedCalc;
    if (!calc || calc.simPath.length < 2) return null;
    const total = calc.simPath.length - 1;
    const currentSimIdx = Math.max(0, Math.min(total, Math.ceil(S.simProgress * total - 1e-9)));
    for (let i = currentSimIdx; i < calc.simPath.length; i++) {
      if (calc.simPath[i].originalLineIdx != null) return calc.simPath[i].originalLineIdx;
    }
    return findLastIdx(calc.simPath, p => p.originalLineIdx != null) === -1
      ? null
      : calc.simPath[findLastIdx(calc.simPath, p => p.originalLineIdx != null)].originalLineIdx;
  }
  // ── Spodní panel G-kódu: ▼ = celý → 2 řádky → skrytý → celý ──
  // „2 řádky" = jen běžící blok a ten, který bude následovat (přání uživatele
  // 1. 10. 2026 — hlavně mobil na šířku, kde se celý panel nevejde).
  // Na mobilu (i na šířku = nízký displej) se díl po přepnutí vycentruje;
  // `refit` jen z tlačítka — automatické otevření po kliku na dráhu pohled
  // nemění (uživatel se dívá na místo, kam klikl).
  function setCodePanelMode(mode, refit = false) {
    codePanelMode = mode;
    codeArea.style.display = mode === 'open' ? '' : 'none';
    codeMini.classList.toggle('cam-sim-mini-on', mode === 'mini');
    toggleCodeBtn.textContent = mode === 'closed' ? '▲' : '▼';
    toggleCodeBtn.title = mode === 'open' ? 'Zmenšit G-kód panel na 2 řádky (běžící a následující blok)'
      : mode === 'mini' ? 'Skrýt i řádky G-kódu' : 'Zobrazit G-kód panel';
    toggleCodeBtn.classList.toggle('cam-sim-active', mode !== 'open');
    if (mode === 'mini') updateCodeMini(!S.simRunning && S._gcodeFocusLine != null ? S._gcodeFocusLine : getActiveCodeLineIdx());
    if (refit && isMobileView()) fitView();
  }
  // Mobil = úzký displej (@media v camSimulatorStyles.js) nebo nízký (na šířku).
  function isMobileView() {
    return window.matchMedia('(max-width: 768px), (max-height: 520px)').matches;
  }
  // Řádky bez pohybu (prázdné, komentáře) se jako „následující" přeskakují.
  let _miniSrc = null, _miniLines = [];
  function updateCodeMini(hlIdx) {
    if (codePanelMode !== 'mini') return;
    if (_miniSrc !== S.manualGCode) { _miniSrc = S.manualGCode; _miniLines = _miniSrc.split('\n'); }
    const ls = _miniLines;
    const isBlock = l => { const t = l.trim(); return t !== '' && !/^[;(%]/.test(t); };
    const cur = hlIdx != null && hlIdx < ls.length ? hlIdx : ls.findIndex(isBlock);
    let next = -1;
    if (cur >= 0) for (let i = cur + 1; i < ls.length; i++) if (isBlock(ls[i])) { next = i; break; }
    codeMini.children[0].textContent = cur >= 0 ? ls[cur] : ' ';
    codeMini.children[1].textContent = next >= 0 ? ls[next] : ' ';
  }

  function updateCodeHighlight() {
    const focusEdit = !S.simRunning && S._gcodeFocusLine != null;

    // Klik na dráhu → auto-zobrazit G-kód panel pokud je schovaný (odloženo
    // na mouseup). Ve 2 řádcích ne — kliknutý řádek se ukáže tam.
    if (focusEdit && codePanelMode === 'closed') _panelPending = true;
    const hlIdx = focusEdit ? S._gcodeFocusLine : getActiveCodeLineIdx();
    updateCodeMini(hlIdx);
    const lineEls = codeBackdrop.querySelectorAll('.cam-sim-code-bd-line');
    lineEls.forEach((el, i) => el.classList.toggle('cam-sim-code-active', i === hlIdx));
    if (hlIdx != null && lineEls[hlIdx]) {
      const lineEl = lineEls[hlIdx];
      const top = lineEl.offsetTop, bottom = top + lineEl.offsetHeight;
      const skipScroll = !focusEdit && document.activeElement === manualTa;
      if (!skipScroll && (top < manualTa.scrollTop || bottom > manualTa.scrollTop + manualTa.clientHeight)) {
        manualTa.scrollTop = Math.max(0, top - manualTa.clientHeight / 2);
        codeBackdrop.scrollTop = manualTa.scrollTop;
      }
    }
    // Skok kurzoru v editoru na editovaný řádek (ověření změny hodnot).
    if (focusEdit) {
      const ls = S.manualGCode.split('\n');
      let off = 0;
      for (let i = 0; i < S._gcodeFocusLine && i < ls.length; i++) off += ls[i].length + 1;
      const end = off + ((ls[S._gcodeFocusLine] || '').length);
      try { manualTa.setSelectionRange(off, end); } catch (_) { /* mimo rozsah */ }
    }
  }
  function findLastIdx(arr, fn) {
    for (let i = arr.length - 1; i >= 0; i--) if (fn(arr[i])) return i;
    return -1;
  }
  function escHTML(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  // Text do HTML atributu (title=…) — navíc uvozovky, kterými by šel atribut ukončit.
  function escAttr(s) { return escHTML(s).replace(/"/g, '&quot;'); }

  // ── UI: sidebar tabs ──
  function renderTab() {
    const prms = S.params;
    tabBody.innerHTML = '';
    if (S.activeTab === 'editor') renderEditorTab();
    else if (S.activeTab === 'params') renderParamsTab();
    else if (S.activeTab === 'import') renderImportTab();
    root.querySelectorAll('.cam-sim-tabs button').forEach(btn => {
      btn.classList.toggle('cam-sim-active', btn.dataset.tab === S.activeTab);
    });
  }

  // ── editor tab ──
  function renderEditorTab() {
    const pts = S.editMode === 'contour' ? S.contourPoints : S.stockPoints;
    const isStock = S.editMode === 'stock';
    const isCylStock = isStock && S.params.stockMode === 'cylinder';
    let html = `<div class="cam-sim-toggle-row">
      <button data-edit="contour" class="${!isStock ? 'cam-sim-active' : ''}">✏ Kontura</button>
      <button data-edit="stock" class="${isStock ? 'cam-sim-active' : ''}">📦 Polotovar</button>
    </div>`;
    if (isStock) {
      html += `<div class="cam-sim-toggle-row">
        <button data-smode="cylinder" class="${S.params.stockMode === 'cylinder' ? 'cam-sim-active' : ''}">Válec</button>
        <button data-smode="casting" class="${S.params.stockMode === 'casting' ? 'cam-sim-active' : ''}">Vlastní tvar</button>
      </div>`;
    }
    if (isCylStock) {
      html += `<div class="cam-sim-info-box">Potáhněte úchopy na canvasu pro změnu rozměrů válce. Zapněte tlačítko ◆ Kontura.</div>
      <div class="cam-sim-row"><div class="cam-sim-field"><label>Průměr (D)</label><input type="number" data-cylp="stockDiameter" value="${S.params.stockDiameter}"></div>
      <div class="cam-sim-field"><label>Délka</label><input type="number" data-cylp="stockLength" value="${S.params.stockLength}"></div></div>
      <div class="cam-sim-row"><div class="cam-sim-field"><label>Přídavek čelo</label><input type="number" data-cylp="stockFace" value="${S.params.stockFace}"></div>
      <div class="cam-sim-field"><label>Přídavek (Auto)</label><input type="number" data-cylp="stockMargin" value="${S.params.stockMargin}"></div></div>
      <button class="cam-sim-btn cam-sim-btn-indigo" data-act="auto-stock">🎯 Auto-rozměr</button>`;
    } else {
    html += `<div class="cam-sim-point-header"><div style="width:18px">#</div><div style="width:48px">Typ</div><div style="width:32px">Mód</div><div style="width:56px">X/U</div><div style="width:56px">Z/W</div><div style="width:40px">R</div></div>`;
    pts.forEach((p, i) => {
      const cls = isStock ? 'cam-sim-stock' : '';
      html += `<div class="cam-sim-point-row ${cls}" data-ptid="${p.id}">
        <div class="cam-sim-pt-num">${i + 1}</div>
        <select data-field="type" data-id="${p.id}"><option ${p.type === 'G0' ? 'selected' : ''}>G0</option><option ${p.type === 'G1' ? 'selected' : ''}>G1</option><option ${p.type === 'G2' ? 'selected' : ''}>G2</option><option ${p.type === 'G3' ? 'selected' : ''}>G3</option></select>
        <button class="cam-sim-mode-btn ${p.mode === 'INC' ? 'cam-sim-inc' : ''}" data-modeid="${p.id}">${p.mode === 'INC' ? 'INC' : 'ABS'}</button>
        <input type="number" data-field="x" data-id="${p.id}" value="${p.x}" placeholder="${p.mode === 'INC' ? 'U' : 'X'}">
        <input type="number" data-field="z" data-id="${p.id}" value="${p.z}" placeholder="${p.mode === 'INC' ? 'W' : 'Z'}">
        ${(p.type === 'G2' || p.type === 'G3') ? `<input type="number" data-field="r" data-id="${p.id}" value="${p.r}" placeholder="R" style="width:40px">` : ''}
        <div class="cam-sim-pt-actions">
          <button data-insertid="${p.id}" title="Vložit za">➕</button>
          <button data-deleteid="${p.id}" title="Smazat">🗑</button>
        </div>
      </div>`;
    });
    html += `<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
      <button class="cam-sim-btn ${isStock ? 'cam-sim-btn-green' : 'cam-sim-btn-blue'}" data-act="addpt-list">➕ Přidat bod</button>
    </div>`;
    if (isStock && typeof S.zLimits.chuck === 'number' && isFinite(S.zLimits.chuck)) {
      html += `<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
      <button class="cam-sim-btn cam-sim-btn-gray" data-act="addpt-chuck-limit">⛔ Bod na limitu čelistí</button>
    </div>`;
    }
    }
    html += `<div style="display:flex;gap:4px;margin-top:6px">
      <button class="cam-sim-btn cam-sim-btn-half cam-sim-btn-gray" data-act="copy-code">📋 Kopírovat</button>
      <button class="cam-sim-btn cam-sim-btn-half cam-sim-btn-purple" data-act="download">📥 Uložit</button>
    </div>
    <div style="display:flex;gap:4px;margin-top:4px">
      <button class="cam-sim-btn cam-sim-btn-half cam-sim-btn-indigo" data-act="export-pdf">📄 Export PDF</button>
      <button class="cam-sim-btn cam-sim-btn-half cam-sim-btn-green" data-act="send-editor">🔧 Otevřít v CAM Editoru</button>
    </div>`;
    tabBody.innerHTML = html;
    attachEditorEvents();
  }

  function attachEditorEvents() {
    tabBody.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        S.editMode = btn.dataset.edit;
        if (S.editMode === 'stock' && S.params.stockMode === 'casting' && S.stockPoints.length === 0) generateDefaultStock();
        renderTab(); draw();
      });
    });
    tabBody.querySelectorAll('[data-smode]').forEach(btn => {
      btn.addEventListener('click', () => {
        S.params.stockMode = btn.dataset.smode;
        if (btn.dataset.smode === 'casting' && S.stockPoints.length === 0) generateDefaultStock();
        renderTab(); draw();
      });
    });
    // Když uživatel mění/přidává/maže body polotovaru v editoru, znamená to,
    // že chce vlastní tvar — switchneme stockMode na 'casting', jinak by
    // jeho úpravy byly zakryty válcovým renderingem.
    const ensureStockModeCasting = () => {
      if (S.editMode === 'stock' && S.params.stockMode !== 'casting') S.params.stockMode = 'casting';
    };
    tabBody.querySelectorAll('[data-field]').forEach(el => {
      const id = parseInt(el.dataset.id);
      const field = el.dataset.field;
      el.addEventListener('change', () => {
        pushHistory();
        const list = S.editMode === 'contour' ? S.contourPoints : S.stockPoints;
        const pt = list.find(p => p.id === id);
        if (pt) {
          pt[field] = el.value;
          ensureStockModeCasting();
          fullUpdate();
        }
      });
    });
    tabBody.querySelectorAll('[data-modeid]').forEach(btn => {
      btn.addEventListener('click', () => {
        pushHistory();
        const id = parseInt(btn.dataset.modeid);
        const list = S.editMode === 'contour' ? S.contourPoints : S.stockPoints;
        const pt = list.find(p => p.id === id);
        if (pt) { pt.mode = pt.mode === 'ABS' ? 'INC' : 'ABS'; ensureStockModeCasting(); fullUpdate(); }
      });
    });
    tabBody.querySelectorAll('[data-insertid]').forEach(btn => {
      btn.addEventListener('click', () => {
        pushHistory();
        const id = parseInt(btn.dataset.insertid);
        const list = S.editMode === 'contour' ? S.contourPoints : S.stockPoints;
        const idx = list.findIndex(p => p.id === id);
        if (idx >= 0) {
          const prev = list[idx];
          list.splice(idx + 1, 0, { ...prev, id: Date.now(), z: parseFloat(prev.z) - 5 });
          ensureStockModeCasting();
          fullUpdate();
        }
      });
    });
    tabBody.querySelectorAll('[data-deleteid]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.deleteid);
        const list = S.editMode === 'contour' ? S.contourPoints : S.stockPoints;
        if (list.length > 1) {
          pushHistory();
          const idx = list.findIndex(p => p.id === id);
          if (idx >= 0) list.splice(idx, 1);
          ensureStockModeCasting();
          fullUpdate();
        }
      });
    });
    const addBtn = tabBody.querySelector('[data-act="addpt-list"]');
    if (addBtn) addBtn.addEventListener('click', () => {
      pushHistory();
      const list = S.editMode === 'contour' ? S.contourPoints : S.stockPoints;
      const last = list.length > 0 ? list[list.length - 1] : { x: 100, z: 0 };
      list.push({ id: Date.now(), type: 'G1', x: last.x, z: parseFloat(last.z) - 10, r: 0, mode: 'ABS' });
      ensureStockModeCasting();
      fullUpdate();
    });
    const addChuckPtBtn = tabBody.querySelector('[data-act="addpt-chuck-limit"]');
    if (addChuckPtBtn) addChuckPtBtn.addEventListener('click', handleAddStockChuckPoint);
    const copyBtn = tabBody.querySelector('[data-act="copy-code"]');
    if (copyBtn) copyBtn.addEventListener('click', handleCopyGCode);
    const dlBtn = tabBody.querySelector('[data-act="download"]');
    if (dlBtn) dlBtn.addEventListener('click', handleDownload);
    const pdfBtn = tabBody.querySelector('[data-act="export-pdf"]');
    if (pdfBtn) pdfBtn.addEventListener('click', handleExportPDF);
    const editorBtn = tabBody.querySelector('[data-act="send-editor"]');
    if (editorBtn) editorBtn.addEventListener('click', handleSendToEditor);
    // Cylinder stock param inputs
    tabBody.querySelectorAll('[data-cylp]').forEach(el => {
      el.addEventListener('change', () => {
        pushHistory();
        S.params[el.dataset.cylp] = parseFloat(el.value) || 0;
        fullUpdate();
      });
    });
    const autoStockEdBtn = tabBody.querySelector('[data-act="auto-stock"]');
    if (autoStockEdBtn) autoStockEdBtn.addEventListener('click', () => { pushHistory(); handleAutoStock(); fullUpdate(); });
  }

  // ── params tab ──
  function renderParamsTab() {
    // HTML → cam/sim/paramsPanelsHtml.js + paramsMachiningHtml.js
    const ctx = { S, escHTML, escAttr };
    tabBody.innerHTML = paramsPanelsHtml(ctx) + paramsMachiningHtml(ctx);
    attachParamsEvents();
  }

  // ── Nože: změny parametrů nástroje + sloty zásobníku ── → cam/sim/knives.js
  const {
    dropInsertGuides, applyParamChange, applyShapeChange, setMachiningSubTab, afterToolChange,
    applyAfterToolChange, applyTipMirrorToggle, _resortToolMagazineToDefaults, _reorderMagazine, _polygonForStrategy,
    _applyMagSlot, _loadMagSlot, _rememberShapeKnife, _loadShapeKnife, _loadPresetKnife,
    _slotToParams, autoPickToolFor, boreEnsureBar, boreHoleSolid, boreEnsurePreDrill,
    boreTakePreHoleFromDrill, _syncParamsToSlot, _paramsIntoSlot, flushMagSlotEdit, saveCurrentToolToMagazine,
  } = createKnives({ S, toolUi, applyChange, renderTab, withBusy, gcodeStale, pathInputsKey, fullUpdate, saveState, pushHistory });

  function attachParamsEvents() {
    // → cam/sim/paramsEventsGeneral.js + paramsEventsMachining.js
    const ctx = {
      tabBody, S, renderTab, setMachiningSubTab, applyChange, recalcNow, draw, saveState, gcodeStale, convertGCodeControlSystem, pathInputsKey, fullUpdate, applyParamChange, _polygonForStrategy, toolbar, dropInsertGuides, applyShapeChange, applyTipMirrorToggle, canvas, showMagazineDialog, showThreadPickerDialog, pushHistory, autoPickToolFor, boreHoleSolid, boreEnsurePreDrill, boreTakePreHoleFromDrill, boreEnsureBar, partsActive, _isoDefaultMagSlots, markGCodeGenerated,
    };
    attachParamsEventsGeneral(ctx);
    attachParamsEventsMachining(ctx);
  }

  // ── thread picker dialog (🧵 Závity) ──
  // Výběr závitu z databáze (threadData.js — stejná data jako kalkulačka
  // Závity v CAD). Klik na řádek vyplní parametry operace Závit (⌀D, P,
  // hloubku H, úhel profilu) a přepne na záložku Závit.
  // THREAD_PICKER_TYPES → cam/sim/threadPicker.js

  // Sdílené otevření VBD dekodéru s importem do S.params — volané z hlavního
  // panelu i z modalu Geometrie.
  function openVbdImportDialog() {
    openInsertCalc({
      onCamImport: (data) => {
        // Tvar se MUSÍ měnit přes applyShapeChange — s ním jde i pravidlo
        // „obrys držáku patří k tvaru destičky" (viz tam). Přímý zápis
        // S.params.toolShape nechával u nového plátku viset držák nakreslený
        // pro ten předchozí, a to bez jediného slova (stejná vada jako
        // 27. 8. 2026 u tlačítek tvaru).
        if (data.isRound) {
          applyShapeChange('round', { defer: true });
        } else if (data.tipAngle !== null) {
          applyShapeChange('polygon', { defer: true });
          S.params.toolTipAngle = data.tipAngle;
        }
        // Kód destičky AŽ po změně tvaru — ta nasadí výchozí nůž i s jeho kódem.
        if (data.vbdCode) S.params.toolVbdCode = data.vbdCode;
        if (data.clearanceAngle !== null) S.params.toolClearanceAngle = data.clearanceAngle;
        if (data.tipRadius !== null && data.tipRadius > 0) S.params.toolRadius = data.tipRadius;
        dropInsertGuides();
        // applyChange (ne fullUpdate) — dekodér mění TOTÉŽ co pole Rádius/ε
        // v panelu, takže se musí chovat stejně (v cyklu přegenerovat program).
        applyChange();
      },
    });
    // VBD overlay (.calc-overlay, z-index 200) se otevírá pod modalem
    // Geometrie (z-index 300) → zvednout nad něj hned po vytvoření.
    setTimeout(() => {
      const vbdOvr = document.querySelector('.calc-overlay[data-type="inserts"]');
      if (vbdOvr) vbdOvr.style.zIndex = '400';
    }, 0);
  }

  // ── Modal "⚙️ Geometrie" — náhled + geometrie destičky (VBD) a držáku
  // (ISO 5608/5610). Nezávislý na hlavním panelu (může být otevřený souběžně);
  // jediný zdroj pravdy zůstává S.params, synchronizace viz toolUi.toolGeomModalRefresh.
  // → cam/sim/toolGeometryDialog.js (ctx se sestaví při otevření okna — okno
  // a Zásobník se volají navzájem, továrny vznikají až za běhu)
  function showToolGeometryDialog() {
    createToolGeometryDialog({
      S, toolUi, overlay, escAttr, pushHistory, applyChange, undo, redo, flushMagSlotEdit, applyParamChange, applyTipMirrorToggle, applyShapeChange, openVbdImportDialog, showMagazineMenu, showMagazineDialog, showSaveCurrentToolDialog, exportToolGeometryFile, importToolGeometryFile,
    }).showToolGeometryDialog();
  }

  // ── 🧵 výběr závitu ── → cam/sim/threadPicker.js
  function showThreadPickerDialog() {
    createThreadPicker({ S, pushHistory, autoPickToolFor, applyChange }).showThreadPickerDialog();
  }

  // ── magazine dialog ──
  // _defaultMagSlot, _slotNameFromFilename, _buildMagSlotFromTool, _isoMagSlot,
  // _isoDefaultMagSlots, _setMagSlotShape → cam/sim/magSlots.js

  // (nože ⇄ sloty zásobníku → cam/sim/knives.js, viz createKnives výš)

  // ── Nůž jako soubor / knihovna / menu ── → cam/sim/toolFiles.js
  const { exportToolGeometryFile, importToolGeometryFile, currentToolLibraryRecord, _libraryKnife, openToolLibraryForActive, openOrRaiseToolGeometry, showMagazineMenu, showSaveCurrentToolDialog } = createToolFiles({
    S, toolUi, pushHistory, saveState, fullUpdate, dropInsertGuides, afterToolChange, applyAfterToolChange, saveCurrentToolToMagazine, showToolGeometryDialog, escAttr,
  });

  // Volá se i synchronně při načítání stavu (migrace zásobníku) → hoisted obal.
  function _upgradeIsoHolders(slots) { return upgradeIsoHolders(S, slots); }

  // ── Okno 🔧 Zásobník ── → cam/sim/magazineDialog.js
  const { showMagazineDialog } = createMagazineDialog({
    S, toolUi, escHTML, escAttr, saveState, pushHistory, undo, redo, updateUndoRedoBtns, _applyMagSlot, flushMagSlotEdit, _reorderMagazine, _resortToolMagazineToDefaults, _libraryKnife, openOrRaiseToolGeometry, showSaveCurrentToolDialog, openToolLibraryForActive, showMagazineMenu,
  });

  // ── import tab ──
  function renderImportTab() {
    // Kam se importuje, určuje přepínač Kontura / Polotovar v záložce Editor —
    // tady ho dřív nebylo vidět a import tiše přepsal to, co bylo v Editoru
    // zrovna zvolené.
    const toStock = S.editMode === 'stock';
    tabBody.innerHTML = `
      <div class="cam-sim-section-title">Import G-kódu → ${toStock ? '📦 polotovar' : '✏ kontura'}</div>
      <small class="cam-sim-info-box" style="display:block;margin-bottom:4px">Body přepíšou ${toStock ? 'polotovar' : 'konturu'}. Cíl se přepíná v záložce ✏ Editor (Kontura / Polotovar).</small>
      <textarea class="cam-sim-import-ta" placeholder="G1 X... Z..."></textarea>
      <button class="cam-sim-btn cam-sim-btn-green" style="margin-top:6px" data-act="import-gcode">📥 Import</button>`;
    const importBtn = tabBody.querySelector('[data-act="import-gcode"]');
    const ta = tabBody.querySelector('.cam-sim-import-ta');
    if (importBtn) importBtn.addEventListener('click', () => {
      const text = ta.value;
      if (!text.trim()) return;
      const pts = parseContourGCode(text);
      if (pts.length > 0) {
        pushHistory();
        if (S.editMode === 'contour') S.contourPoints = pts;
        else {
          S.stockPoints = pts;
          // Jako úpravy v Editoru: body polotovaru = vlastní tvar. U válce by
          // se importovaný obrys vůbec nepoužil.
          S.params.stockMode = 'casting';
        }
        fullUpdate();
        fitView();
      } else {
        alert('Nepodařilo se rozpoznat žádné body v G-kódu.');
      }
    });
  }

  // ── auto stock ── → cam/sim/autoStock.js
  function handleAutoStock() { _handleAutoStock({ S, fullUpdate, fitView }); }
  function generateDefaultStock() { _generateDefaultStock(S); }

  // ── copy / download / PDF ──
  // Ven (schránka/soubor/editor) jde vždy CELÝ program — u víc částí tedy
  // všechny operace za sebou (viz outputGCode/combinedProgram).
  function handleCopyGCode() {
    const text = outputGCode();
    navigator.clipboard.writeText(text).then(() => {
      const btn = tabBody.querySelector('[data-act="copy-code"]');
      if (btn) { const orig = btn.textContent; btn.textContent = '✅ Zkopírováno'; setTimeout(() => { btn.textContent = orig; }, 1500); }
    }).catch(() => alert('Nepodařilo se zkopírovat kód do schránky.'));
  }
  function handleDownload() {
    const text = outputGCode();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    let ext = 'mpf';
    if (S.params.controlSystem === 'heidenhain') ext = 'h';
    else if (S.params.controlSystem === 'fanuc') ext = 'nc';
    a.download = `program_${new Date().toISOString().slice(0, 10)}.${ext}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  // ── Uložit / načíst celý projekt (.camprog) ──
  // Stejná sada polí jako saveState() — umožní 1:1 přenést stav simulátoru
  // mezi instancemi (např. z Live Serveru do preview pro reprodukci chyb).
  function handleSaveProject() {
    syncActivePart();
    const payload = {
      __camprog: 1,
      pathLogicVersion: PATH_LOGIC_VERSION,
      savedAt: new Date().toISOString(),
      params: S.params,
      contourPoints: S.contourPoints,
      stockPoints: S.stockPoints,
      borePoints: S.borePoints || [],
      // manualGCode = CELÝ program (i pro starší verze appky a pro frontu
      // „SPOJ G-KÓD" v editoru, která z .camprog čte právě tohle pole);
      // opParts drží jednotlivé části pro další editaci.
      manualGCode: outputGCode(),
      gcodeDirty: S.gcodeDirty,
      gcodeKey: S.gcodeKey,
      opParts: S.opParts,
      activePart: S.activePart,
      opContourKey: S.opContourKey,
      flipX: S.flipX,
      flipZ: S.flipZ,
      guideLines: S.guideLines,
      zLimits: S.zLimits,
      showZLimits: S.showZLimits,
      xLimits: S.xLimits,
      showSimPath: S.showSimPath,
      showRemoval: S.showRemoval,
      showRefGuides: S.showRefGuides,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `projekt_${new Date().toISOString().slice(0, 10)}.camprog`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Projekt uložen do souboru .camprog');
  }
  function handleLoadProject() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.camprog,.json,application/json';
    inp.addEventListener('change', () => {
      const file = inp.files && inp.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        let data;
        try { data = JSON.parse(reader.result); }
        catch (_) { alert('Soubor se nepodařilo načíst (neplatný JSON).'); return; }
        if (!data || !data.params || !data.contourPoints) {
          alert('Soubor neobsahuje platný projekt (.camprog).'); return;
        }
        if (data.params) S.params = Object.assign(_defaultCamParams(), stripCodeOwnedParams(data.params));
        if (data.contourPoints) S.contourPoints = data.contourPoints;
        if (data.stockPoints) S.stockPoints = data.stockPoints;
        S.borePoints = Array.isArray(data.borePoints) ? data.borePoints : [];
        // Části programu (operace) — jen s odpovídající verzí logiky drah,
        // jinak by se skládaly zastaralé dráhy (stejné pravidlo jako u
        // manualGCode níž). Projekt bez opParts = klasický jednooperační.
        S.opParts = [];
        S.activePart = 0;
        S.opView = 'part';
        S.opContourKey = null;
        if (Array.isArray(data.opParts) && data.opParts.length > 0
            && data.pathLogicVersion === PATH_LOGIC_VERSION) {
          S.opParts = data.opParts;
          S.activePart = Math.min(Math.max(0, data.activePart | 0), S.opParts.length - 1);
          S.opContourKey = data.opContourKey || contourKey(S.contourPoints);
        }
        // Projekt uložený s nožem z 📚 katalogu se starým obrysem držáku.
        const fixedHolders = _upgradeIsoHolders([]);
        if (fixedHolders) setTimeout(() => showToast('Opraven obrys držáku nože z 📚 ISO katalogu (hlava teď končí 1 mm za břitem) — přegeneruj dráhy'), 0);
        // Nový projekt = nová kontura/polotovar — starý ořez i záloha
        // před-profilové kontury už k ničemu nesedí (jinak by ❌ po
        // otevření jiného souboru vracelo konturu z PŘEDCHOZÍHO projektu).
        S._traceConfirmedOnce = false;
        S._profileOriginal = null;
        // Uložené dráhy jen když odpovídají aktuální verzi logiky generování;
        // jinak přegenerovat z kontury/parametrů (fullUpdate níž to zajistí,
        // protože prázdný manualGCode → generateAutoGCode).
        if (typeof data.manualGCode === 'string' && data.pathLogicVersion === PATH_LOGIC_VERSION && !dropInsaneSavedProgram(data.manualGCode, data.gcodeDirty)) {
          S.manualGCode = data.manualGCode;
          // Ruční úpravy uložené v projektu zůstávají chráněné i po načtení;
          // otisk vstupů taky, ať se nečerstvé dráhy hlásí i po otevření souboru.
          S.gcodeDirty = !!data.gcodeDirty;
          _savedGcodeKey = typeof data.gcodeKey === 'string' ? data.gcodeKey : null;
        } else {
          recalcNow();
          S.manualGCode = generateAutoGCode(S._cachedCalc).map(l => l.text).join('\n');
          S.gcodeDirty = false;
          _savedGcodeKey = null;   // dráhy právě vznikly z aktuálních vstupů
        }
        if (typeof data.flipX === 'boolean') { S.flipX = data.flipX; state.flipX = S.flipX; persistSettings(); }
        if (typeof data.flipZ === 'boolean') { S.flipZ = data.flipZ; state.flipZ = S.flipZ; persistSettings(); }
        if (data.guideLines) {
          S.guideLines = data.guideLines;
          // Upozornění na případně zastaralé čáry z hlídání destičky
          if (S.guideLines.length > 0 && data.params && data.params.respectInsertGeometry)
            showToast(`Projekt obsahuje ${S.guideLines.length} konstrukční čar — pokud jsou zastaralé po změně destičky, použijte 🧹 vedle „Hlídat geometrii".`, 5000);
        }
        if (data.zLimits) S.zLimits = Object.assign(
          { chuck: null, tail: null, chuckActive: false, tailActive: false, rangeStart: null, rangeEnd: null, rangeActive: false },
          data.zLimits
        );
        if (data.showZLimits) {
          if (data.showZLimits === 'off') {
            S.showZLimits = 'off';
          } else {
            S.showZLimits = 'on';
            // Backward compat: starý formát neměl active flagy — odvodit ze showZLimits.
            if (data.zLimits && !('chuckActive' in data.zLimits)) {
              S.zLimits.chuckActive = data.showZLimits === 'fixtures' || data.showZLimits === 'both';
              S.zLimits.tailActive  = data.showZLimits === 'fixtures' || data.showZLimits === 'both';
              S.zLimits.rangeActive = data.showZLimits === 'range'    || data.showZLimits === 'both';
            }
          }
        }
        if (data.xLimits) S.xLimits = Object.assign({ rangeXMin: null, rangeXMax: null, active: false }, data.xLimits);
        if (data.showSimPath) S.showSimPath = data.showSimPath;
        if (typeof data.showRefGuides === 'boolean') S.showRefGuides = data.showRefGuides;
        S.simRunning = false; S.simProgress = 0;
        // Části: živý stav přepsat záznamem aktivní části (manualGCode v
        // souboru je CELÝ složený program — ten by jako „část" nesedělo).
        if (partsActive()) applyView();
        // Program přišel se svými parametry (applyView si u částí otisk přerazí
        // sám) — od načtení se hlásí až rozdíl proti tomu, co je v souboru.
        else S.gcodeKey = _savedGcodeKey || pathInputsKey();
        fullUpdate();
        showToast(partsActive()
          ? `Projekt načten — ${S.opParts.length} částí programu`
          : 'Projekt načten ze souboru');
      };
      reader.readAsText(file);
    });
    inp.click();
  }
  async function handleExportPDF() {
    try {
      // Načíst jsPDF lokálně (UMD) pokud ještě není
      if (!window.jspdf) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'js/lib/jspdf.umd.min.js';
          s.onload = resolve;
          s.onerror = () => reject(new Error('jsPDF load failed'));
          document.head.appendChild(s);
        });
      }
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      const noAccents = (str) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      doc.setFontSize(20); doc.text(noAccents('Technologicky list - CAM'), 15, 20);
      doc.setFontSize(10);
      doc.text(`Datum: ${new Date().toLocaleDateString()}`, 15, 30);
      doc.text(noAccents(`System: ${S.params.controlSystem.toUpperCase()}`), 15, 35);
      doc.setFontSize(12); doc.text(noAccents('Parametry obrabeni:'), 15, 50);
      doc.setFontSize(10);
      let y = 60;
      const addP = (l, v) => { doc.text(noAccents(`${l}: ${v}`), 20, y); y += 6; };
      addP('Stroj', S.params.machineType); addP('Nastroj', S.params.toolName);
      addP('Rezna rychlost', S.params.speed + ' m/min'); addP('Posuv', S.params.feed + ' mm/ot');
      addP('Hloubka trisky', S.params.depthOfCut + ' mm');
      if (canvas) {
        const imgData = canvas.toDataURL('image/png');
        const imgProps = doc.getImageProperties(imgData);
        const pdfW = 100, pdfH = (imgProps.height * pdfW) / imgProps.width;
        doc.text(noAccents('Nahled drahy:'), 100, 50);
        doc.addImage(imgData, 'PNG', 100, 55, pdfW, pdfH);
      }
      y = 120; doc.setFontSize(12); doc.text('G-Code:', 15, y); y += 10;
      doc.setFont('courier', 'normal'); doc.setFontSize(9);
      S.generatedCode.forEach(lineObj => {
        if (y > 280) { doc.addPage(); y = 20; }
        doc.text(noAccents(lineObj.text), 15, y); y += 5;
      });
      doc.save('CAM_Export.pdf');
    } catch (err) {
      alert('Knihovna pro PDF se nepodařila načíst. Zkuste to znovu.');
      console.error(err);
    }
  }

  // ── Send to CAM Editor ──
  function handleSendToEditor() {
    const text = S.manualGCode;
    if (!text.trim()) { alert('Není žádný G-kód k odeslání.'); return; }
    openCamEditor(text, getActiveCodeLineIdx());
  }

  // ── Vrátit konturu zpět na plátno (✕ → 📐 Zachovat a přenést) ── → cam/sim/sendToCanvas.js
  function handleSendToCanvas() {
    return _handleSendToCanvas({ S, setOpView, getAllGuideLines, overlay });
  }

  // ── TRASOVÁNÍ PROFILU ──────────────────────────────────────────

  /**
   * Najde všechny možné segmenty (přímka + oblouky existující kontury/polotovaru),
   * po kterých lze trasovat z p1 do p2. První kandidát je vždy přímka (G1).
   */
  function _findTraceCandidates(p1, p2) {
    const dist = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    const candidates = [{ type: 'G1', dist, r: 0, cx: null, cz: null }];
    const tol = Math.max(0.05, 10 / S.view.scale);

    for (const arr of [S.contourPoints, S.stockPoints]) {
      const abs = resolvePointsToAbsolute(arr);
      for (let i = 1; i < abs.length; i++) {
        const seg = abs[i];
        if (seg.type !== 'G2' && seg.type !== 'G3') continue;
        const a = abs[i - 1];
        const ap = getArcParams({ x: a.xAbs, z: a.zAbs }, { x: seg.xAbs, z: seg.zAbs }, seg.rVal, seg.type);
        if (ap.error) continue;
        const d1 = Math.abs(Math.hypot(p1.x - ap.cx, p1.z - ap.cz) - ap.r);
        const d2 = Math.abs(Math.hypot(p2.x - ap.cx, p2.z - ap.cz) - ap.r);
        if (d1 < tol && d2 < tol) {
          const dup = candidates.some(c =>
            c.cx != null &&
            Math.abs(c.cx - ap.cx) < 1e-6 &&
            Math.abs(c.cz - ap.cz) < 1e-6 &&
            Math.abs(c.r - ap.r) < 1e-6
          );
          if (!dup) {
            // Směr (G2/G3) pro pořadí p1→p2 určíme tak, že vyzkoušíme,
            // která varianta dá stejný střed jako nalezený oblouk.
            const test2 = getArcParams(p1, p2, ap.r, 'G2');
            const matches2 = !test2.error && Math.abs(test2.cx - ap.cx) < 1e-3 && Math.abs(test2.cz - ap.cz) < 1e-3;
            candidates.push({ type: matches2 ? 'G2' : 'G3', dist, r: ap.r, cx: ap.cx, cz: ap.cz });
          }
        }
      }
    }
    return candidates;
  }

  /**
   * Zobrazí modal s možnostmi segmentu (přímka / oblouk(y)) a vrátí Promise,
   * která se vyřeší vybraným kandidátem. Při zavření bez výběru se vrátí první (přímka).
   */
  function _chooseTraceSegment(candidates) {
    return new Promise((resolve) => {
      let bodyHTML = '<div style="display:flex;flex-direction:column;gap:6px;">';
      candidates.forEach((c, i) => {
        const label = c.type === 'G1'
          ? `Přímka (G1) — délka ${c.dist.toFixed(2)} mm`
          : `Oblouk (${c.type}) — R${c.r.toFixed(2)}`;
        bodyHTML += `<button class="calc-btn cam-seg-choice-btn" data-idx="${i}" style="text-align:left">${label}</button>`;
      });
      bodyHTML += '</div>';

      const overlay = makeOverlay('camSegmentChoice', 'Výběr segmentu profilu', bodyHTML);
      if (!overlay) { resolve(candidates[0]); return; }

      let resolved = false;
      const finish = (val) => {
        if (resolved) return;
        resolved = true;
        if (document.body.contains(overlay)) overlay.remove();
        resolve(val);
      };

      overlay.querySelectorAll('.cam-seg-choice-btn').forEach(btn => {
        btn.addEventListener('click', () => finish(candidates[parseInt(btn.dataset.idx, 10)]));
      });

      new MutationObserver((_, obs) => {
        if (!document.body.contains(overlay)) { obs.disconnect(); finish(candidates[0]); }
      }).observe(document.body, { childList: true });
    });
  }

  let _choosingTraceSeg = false;

  // ── Auto profil / krokování (⊙ Auto, ◀ Ubrat, Přidat ▶) ──
  // Znovupoužívá VÝHRADNĚ už vyřešenou konturu z pipeline (S._cachedCalc.contourSegments —
  // ta prošla resolveOuterProfile, který vždy běží v calculate() a vybírá vnější větev/
  // Hlídání geometrie destičky, viz contourBuild.js). Nic se tu znovu nepočítá ani
  // neimplementuje — jen se ukáže (revealCount) a případně převede na nové contourPoints.
  let _camAutoSegs = null;      // pole segmentů (od zvoleného startu do konce)
  let _camAutoRevealCount = 0;  // kolik segmentů z _camAutoSegs je aktuálně "odkrytých"
  // Fixní prefix = S._tracePoints/_traceSegs v okamžiku, kdy byla naposledy
  // zahájena auto/krok session — díky tomu Auto/Přidat/Ubrat NEPŘEPISUJÍ
  // ručně dokreslenou část trasy, jen na ni navazují (viz _camAutoStartIdx
  // a _camBuildFinalTracePts, který obojí spojí při potvrzení).
  let _camTraceFixedPoints = null;
  let _camTraceFixedSegs = null;

  /**
   * Určí, kterými segmenty vyřešené kontury (segs) má Auto/Krok pokračovat —
   * podle POSLEDNÍHO bodu rozpracované trasy (S._tracePoints, konec), aby
   * navazovaly tam, kde trasa aktuálně končí (i po ručním doplnění jiné
   * dráhy), ne od úplného začátku kontury.
   *
   * Bod může ležet přímo NA kontuře (i uprostřed segmentu, ne jen na jeho
   * začátku — viz _locateOnContour) → segment pod bodem se zkrátí, ať trasa
   * nenaskočí zpátky na jeho už projetý začátek.
   *
   * Nebo bod leží MIMO konturu — typicky konec ruční zanořovací/úhlové čáry
   * vedené až na polotovar, který NENÍ koncem kontury. V tom případě se z něj
   * vystřelí paprsek svisle dolů (-X, směrem k ose) na skutečnou konturu
   * materiálu a vrátí i spojovací segment (bridgeSeg) k ní.
   *
   * Bez rozpracovaného bodu = od začátku kontury (contSegs = segs beze změny).
   */
  function _camResolveContinuation(segs) {
    if (!S._tracePoints || S._tracePoints.length === 0) return { contSegs: segs, bridgeSeg: null };
    const p0 = S._tracePoints[S._tracePoints.length - 1];

    const fromLocation = (pt) => {
      const loc = _locateOnContour(segs, pt);
      if (!loc) return null;
      const t = loc.key - loc.segIdx;
      // t≈0: out[0] START je pt → chainBreak (mezera vůči PŮVODNÍMU předchozímu
      // segmentu) je vůči nám bezpředmětná, naše trasa na pt už reálně stojí.
      if (t < 0.02) {
        const out = segs.slice(loc.segIdx);
        if (out.length && out[0].chainBreak) out[0] = { ...out[0], chainBreak: false };
        return out;
      }
      // t≈1 (konec segmentu = start dalšího, typicky vrchol kontury): další
      // segment může mít chainBreak PRÁVĚ vůči TOMUTO bodu — to je reálná
      // mezera (viz _camBuildFinalTracePts), zachovat beze změny.
      if (t > 0.98) return segs.slice(loc.segIdx + 1);
      // Uprostřed segmentu: zkrátit od pt dál — nový start segmentu JE pt,
      // takže jeho chainBreak (vůči původnímu předchůdci) se zase neuplatní.
      const seg = { ...segs[loc.segIdx], chainBreak: false };
      setSegStart(seg, { x: pt.x, z: pt.z });
      syncArcEndpoints(seg);
      return [seg, ...segs.slice(loc.segIdx + 1)];
    };

    const direct = fromLocation(p0);
    if (direct) return { contSegs: direct, bridgeSeg: null };

    const calc = S._cachedCalc;
    if (calc) {
      const hit = camRayIntersection(p0.x, p0.z, -1, 0, null, calc);
      if (hit && Math.hypot(hit.x - p0.x, hit.z - p0.z) > 1e-3) {
        const cont = fromLocation(hit);
        if (cont) {
          return { contSegs: cont, bridgeSeg: { type: 'line', p1: { x: p0.x, z: p0.z }, p2: { x: hit.x, z: hit.z } } };
        }
      }
    }
    return { contSegs: segs, bridgeSeg: null };
  }

  /** Zruší náhled auto-profilu (bez dopadu na S.contourPoints). */
  function _camAutoClear() {
    _camAutoSegs = null;
    _camAutoRevealCount = 0;
    _camTraceFixedPoints = null;
    _camTraceFixedSegs = null;
  }

  /**
   * Natrvalo sloučí aktuálně odkrytý Auto/Krok náhled (_camAutoSegs) do
   * S._tracePoints/_traceSegs — jako by ty body byly přidané ručně — a
   * ukončí auto session. Volá se PŘED jakýmkoliv dalším ručním pokračováním
   * (klik na snap i „Mimo body"), aby nový bod navázal na to, co je vidět
   * (odkrytý náhled), a ne na starý konec ruční trasy před spuštěním Auto —
   * bez tohoto by se náhled při ručním kliku tiše zahodil (_camAutoClear) a
   * trasa by měla „přeskok"/mezeru mezi náhledem a novým bodem.
   */
  function _camCommitAutoPreview() {
    if (!_camAutoSegs || _camAutoRevealCount <= 0) return;
    const extra = _camAutoSegs.slice(0, _camAutoRevealCount);
    if (S._tracePoints.length === 0) {
      const st = segStartPoint(extra[0]);
      S._tracePoints.push({ x: st.x, z: st.z, gIdx: -1 });
    }
    for (const s of extra) {
      // chainBreak (skutečná mezera — viz _camBuildFinalTracePts) se i tady
      // zapíše jako samostatný bod, ať se natrvalo neztratí. Typ (G0/G1) řídí
      // checkbox „Přes polotovar" — G1 = viditelné i po potvrzení, ale reálný
      // řez v datech; G0 = neviditelné po potvrzení, ale bezpečné pro export.
      if (s.chainBreak && S._tracePoints.length > 0) {
        const st = segStartPoint(s);
        S._tracePoints.push({ x: st.x, z: st.z, gIdx: -1 });
        S._traceSegs.push({ type: S._traceThroughStock ? 'G1' : 'G0', dist: 0, r: 0, cx: null, cz: null });
      }
      const e = segEndPoint(s);
      S._tracePoints.push({ x: e.x, z: e.z, gIdx: -1 });
      S._traceSegs.push(s.type === 'arc'
        ? { type: s.dir === 'G2' ? 'G2' : 'G3', dist: 0, r: s.r, cx: s.cx, cz: s.cz }
        : { type: 'G1', dist: 0, r: 0, cx: null, cz: null });
    }
    _camAutoClear();
  }

  /** Zajistí aktivní auto/krok session: pokud ještě neběží, zafixuje aktuální
   *  trasu jako prefix a dopočítá navazující segmenty od jejího posledního
   *  bodu (viz _camResolveContinuation, včetně případného mostu na konturu
   *  materiálu). Vrací false, pokud není co profilovat (žádná kontura). */
  function _camEnsureAutoSession() {
    if (_camAutoSegs) return true;
    const segs = (S._cachedCalc && S._cachedCalc.contourSegments) || [];
    if (!segs.length) return false;
    const { contSegs, bridgeSeg } = _camResolveContinuation(segs);
    _camTraceFixedPoints = S._tracePoints.slice();
    _camTraceFixedSegs = S._traceSegs.slice();
    _camAutoSegs = bridgeSeg ? [bridgeSeg, ...contSegs] : contSegs;
    _camAutoRevealCount = 0;
    return true;
  }

  /** ⊙ Auto: od posledního bodu trasy (nebo od začátku, pokud žádná není)
   *  odkryje CELÝ zbývající vyřešený profil — jen náhled, nepotvrzuje
   *  (potvrzení = ✅ / ✓ Dokončit). */
  function _camAutoRun() {
    if (!_camEnsureAutoSession()) { showToast('Žádná kontura k profilování'); return; }
    _camAutoRevealCount = _camAutoSegs.length;
    _updateProfileButtons();
    _showTraceButtons();
    draw();
    showToast('Auto profil (náhled) – uprav ◀ Ubrat/Přidat ▶ nebo potvrď ✅ / ✓ Dokončit');
  }

  /**
   * Přidat ▶ / ◀ Ubrat: přidá/ubere jeden úsek už vyřešeného profilu (bez
   * potvrzení). Ubrat navíc funguje jako obecné undo — když už není co ubrat
   * z auto/krok session (revealCount 0), ubere místo toho poslední ručně
   * přidaný bod trasy (fixní prefix zůstává netknutý, dokud existuje).
   */
  function _camAutoStep(forward) {
    if (forward) {
      if (!_camEnsureAutoSession()) { showToast('Žádná kontura k profilování'); return; }
      if (_camAutoRevealCount >= _camAutoSegs.length) { showToast('Konec kontury'); return; }
      _camAutoRevealCount++;
      _updateProfileButtons();
      _showTraceButtons();
      draw();
      return;
    }
    if (_camAutoSegs && _camAutoRevealCount > 0) {
      _camAutoRevealCount--;
      _updateProfileButtons();
      _showTraceButtons();
      draw();
      return;
    }
    if (!S._tracePoints || S._tracePoints.length <= 1) { showToast('Začátek profilu'); return; }
    _camAutoClear();
    S._tracePoints.pop();
    S._traceSegs.pop();
    _updateProfileButtons();
    _showTraceButtons();
    draw();
  }

  /**
   * Sestaví finální trasovací body pro potvrzení (✅ / ✓ Dokončit): fixní
   * ručně dokreslený prefix (nebo aktuální S._tracePoints, pokud žádná auto
   * session neběží) + navazující odkryté auto segmenty (_camAutoSegs). Bez
   * tohoto sloučení by potvrzení po Auto/Krok zahodilo ruční část trasy
   * nakreslenou před spuštěním auto náhledu.
   */
  function _camBuildFinalTracePts() {
    const hasAuto = !!(_camAutoSegs && _camAutoRevealCount > 0);
    const prefixPts = hasAuto && _camTraceFixedPoints ? _camTraceFixedPoints : S._tracePoints;
    const prefixSegs = hasAuto && _camTraceFixedSegs ? _camTraceFixedSegs : S._traceSegs;
    const extra = hasAuto ? _camAutoSegs.slice(0, _camAutoRevealCount) : [];
    if (!prefixPts.length && !extra.length) return null;

    const isDiam = S.params.mode === 'DIAMON';
    const toX = (realX) => isDiam ? realX * 2 : realX;
    const pts = [];
    let id = 1;

    if (prefixPts.length > 0) {
      pts.push({ id: id++, type: 'G0', x: prefixPts[0].x, z: prefixPts[0].z, r: 0, mode: 'ABS' });
      for (let i = 0; i < prefixSegs.length; i++) {
        const seg = prefixSegs[i];
        const p = prefixPts[i + 1];
        const pt = { id: id++, type: seg.type, x: p.x, z: p.z, r: seg.r || 0, mode: 'ABS' };
        if (seg.fromInsert) pt.fromInsert = true;
        pts.push(pt);
      }
    } else {
      const start = segStartPoint(extra[0]);
      pts.push({ id: id++, type: 'G0', x: toX(start.x), z: start.z, r: 0, mode: 'ABS' });
    }

    for (const s of extra) {
      // chainBreak = mezi předchozím bodem a startem TOHOTO segmentu je
      // reálná mezera (nedosažitelný úsek uvnitř kapsy/podřezu) — spojit je
      // rovnou G1 by nakreslilo šikmou čáru přes prázdno místo skutečné
      // dráhy. Vložit start segmentu jako zvláštní bod: G0 (rychloposuv,
      // bezpečné pro přímý export, ale po potvrzení neviditelné — viz
      // hlavní vykreslení kontury, které G0 body úmyslně nespojuje) nebo G1
      // (viditelné i po potvrzení, ale reálný řez v datech) podle checkboxu
      // „Přes polotovar".
      if (s.chainBreak) {
        const st = segStartPoint(s);
        pts.push({ id: id++, type: S._traceThroughStock ? 'G1' : 'G0', x: toX(st.x), z: st.z, r: 0, mode: 'ABS' });
      }
      const e = segEndPoint(s);
      if (s.type === 'arc') {
        pts.push({ id: id++, type: s.dir === 'G2' ? 'G2' : 'G3', x: toX(e.x), z: e.z, r: s.r, mode: 'ABS' });
      } else {
        pts.push({ id: id++, type: 'G1', x: toX(e.x), z: e.z, r: 0, mode: 'ABS' });
      }
    }
    return pts;
  }

  /** Převede klientské souřadnice na světové (rádius, Z) a přichytí k nejbližšímu bodu kontury/polotovaru. */
  function _traceWorldFromClient(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
    const prms = S.params || {};
    let wx, wz;
    if (prms.machineStructure === 'carousel') {
      wx = hS * (sx - S.view.panX) / S.view.scale;
      wz = vS * (sy - S.view.panY) / S.view.scale;
    } else {
      wz = hS * (sx - S.view.panX) / S.view.scale;
      wx = vS * (sy - S.view.panY) / S.view.scale;
    }
    // Trasování pracuje v surových souřadnicích (DIAMON = průměr) —
    // world z plátna je v rádiusu, proto převod.
    if (prms.mode === 'DIAMON') wx *= 2;
    // snap na nejbližší bod kontury/polotovaru + koncové body pomocných
    // čar (ruční tečny i automatické mezní čáry hran destičky)
    const allPts = [...resolvePointsToAbsolute(S.contourPoints), ...resolvePointsToAbsolute(S.stockPoints)];
    // Ruční konstrukční čáry — bez příznaku. Automatické mezní čáry z geometrie
    // destičky (interferenceGuides) — koncům dáme index, ať profilování pozná,
    // že úsek vedený mezi dvěma konci TÉŽE čáry je "kontura z geometrie destičky".
    (S.guideLines || []).forEach(g => {
      for (const q of [{ x: g.x1, z: g.z1 }, { x: g.x2, z: g.z2 }])
        allPts.push({ xAbs: prms.mode === 'DIAMON' ? q.x * 2 : q.x, zAbs: q.z, _insertIdx: -1 });
    });
    const insertGuides = (S._cachedCalc && S._cachedCalc.interferenceGuides) || [];
    insertGuides.forEach((g, gi) => {
      // Včetně lomových (via) vrcholů — trasování po lomené čáře jde po úsecích.
      for (const q of guidePolyPoints(g))
        allPts.push({ xAbs: prms.mode === 'DIAMON' ? q.x * 2 : q.x, zAbs: q.z, _insertIdx: gi });
    });
    // Vrcholy VYŘEŠENÉ kontury (S._cachedCalc.contourSegments) — po hlídání
    // geometrie destičky/držáku obsahuje i mosty přes stín (viz
    // bridgeFromContourToStock v contourBuild.js), takže je tu i bod, kde se
    // stín láme na skutečnou konturu materiálu. Bez tohoto by na něj ruční
    // trasování nikdy nešlo snapnout (raw S.contourPoints ho neobsahuje —
    // je to čistě dopočtený bod, ne bod nakreslený v CADu).
    const resolvedSegs = (S._cachedCalc && S._cachedCalc.contourSegments) || [];
    resolvedSegs.forEach(s => {
      const sp = segStartPoint(s), ep = segEndPoint(s);
      allPts.push({ xAbs: prms.mode === 'DIAMON' ? sp.x * 2 : sp.x, zAbs: sp.z });
      allPts.push({ xAbs: prms.mode === 'DIAMON' ? ep.x * 2 : ep.x, zAbs: ep.z });
    });
    let best = null, bestD = Infinity;
    for (const p of allPts) {
      const d = Math.hypot(p.xAbs - wx, p.zAbs - wz);
      if (d < bestD) { bestD = d; best = p; }
    }
    const snapped = !!(best && bestD < 20 / S.view.scale * (prms.mode === 'DIAMON' ? 2 : 1));
    if (snapped) { wx = best.xAbs; wz = best.zAbs; }
    const insertGuideIdx = (snapped && best && typeof best._insertIdx === 'number') ? best._insertIdx : -1;
    return { wx, wz, snapped, insertGuideIdx };
  }

  /** Přidá další bod do trasování; pokud existuje víc možností segmentu, zobrazí volbu. */
  async function _addTracePoint(wx, wz, insertGuideIdx = -1) {
    // Ruční klik navazuje na případný Auto náhled — nejdřív se natrvalo
    // sloučí do trasy (viz _camCommitAutoPreview), ať nový bod pokračuje od
    // toho, co je vidět, ne od staré ruční trasy před spuštěním Auto.
    if (_camAutoSegs) { _camCommitAutoPreview(); _updateProfileButtons(); }
    const p2 = { x: wx, z: wz, gIdx: insertGuideIdx };
    if (S._tracePoints.length === 0) {
      S._tracePoints = [p2];
      S._traceSegs = [];
      draw();
      return;
    }
    if (_choosingTraceSeg) return;
    const p1 = S._tracePoints[S._tracePoints.length - 1];
    const candidates = _findTraceCandidates(p1, p2);

    let seg;
    if (candidates.length > 1) {
      _choosingTraceSeg = true;
      seg = await _chooseTraceSegment(candidates);
      _choosingTraceSeg = false;
      if (!S.profileTraceMode) return; // mezitím zrušeno
    } else {
      seg = candidates[0];
    }

    // Úsek vedený mezi dvěma konci TÉŽE čáry z geometrie destičky =
    // "kontura podle geometrie destičky" (vykreslí se odlišnou barvou,
    // jinak normální úsečka kontury).
    if (insertGuideIdx >= 0 && p1.gIdx === insertGuideIdx) seg.fromInsert = true;

    S._tracePoints.push(p2);
    S._traceSegs.push(seg);
    _showTraceButtons();
    draw();
  }

  /** Sjednocená logika tlačítek profilu: ✅ jen při náhledu, ❌ při náhledu
   *  NEBO když je profil použitý (pak ❌ = smazat profil a vrátit konturu). */
  function _updateProfileButtons() {
    const a = toolbar.querySelector('[data-act="profile-apply"]');
    const c = toolbar.querySelector('[data-act="profile-cancel"]');
    const previewing = !!S._previewContour || (!!_camAutoSegs && _camAutoRevealCount > 0);
    const hasProfile = !!S._profileOriginal;
    if (a) a.style.display = previewing ? '' : 'none';
    if (c) {
      c.style.display = (previewing || hasProfile) ? '' : 'none';
      c.title = previewing ? 'Zrušit náhled profilu' : 'Smazat profil a vrátit původní konturu';
    }
  }
  // Zpětná kompatibilita — staré volání; teď řídí vše _updateProfileButtons.
  /** Zobrazí/skryje plovoucí tlačítka trasování (Zrušit/Auto/Krok/Dokončit) + checkboxy „Mimo body"/„Přes polotovar". */
  function _showTraceButtons() {
    const confirmBtn = canvasWrap.querySelector('.cam-sim-trace-confirm');
    const cancelBtn = canvasWrap.querySelector('.cam-sim-trace-cancel');
    const autoBtn = canvasWrap.querySelector('.cam-sim-trace-auto');
    const stepFwdBtn = canvasWrap.querySelector('.cam-sim-trace-stepfwd');
    const stepBackBtn = canvasWrap.querySelector('.cam-sim-trace-stepback');
    const optionsRow = canvasWrap.querySelector('.cam-sim-trace-options');
    // Dokončit je dostupné i u čistě Auto/Krok náhledu bez jediného ručního
    // bodu (S._tracePoints může mít < 2 body, dokud se náhled nesloučí —
    // viz _camCommitAutoPreview) — jinak by tlačítko dole nikdy nešlo
    // stisknout a jediná cesta k potvrzení by byla ✅ nahoře v toolbaru.
    const hasAutoPreview = !!(_camAutoSegs && _camAutoRevealCount > 0);
    if (confirmBtn) confirmBtn.style.display = (S.profileTraceMode && (S._tracePoints.length >= 2 || hasAutoPreview)) ? 'block' : 'none';
    if (cancelBtn) cancelBtn.style.display = S.profileTraceMode ? 'block' : 'none';
    if (autoBtn) autoBtn.style.display = S.profileTraceMode ? 'block' : 'none';
    if (stepFwdBtn) stepFwdBtn.style.display = S.profileTraceMode ? 'block' : 'none';
    if (stepBackBtn) stepBackBtn.style.display = S.profileTraceMode ? 'block' : 'none';
    if (optionsRow) optionsRow.style.display = S.profileTraceMode ? 'flex' : 'none';
  }

  /** Esc/✗: zruší poslední rozpracované body trasování, nebo vypne celý režim. */
  function _cancelTraceStep() {
    if (_camAutoSegs) {
      _camAutoClear();
      _updateProfileButtons();
      draw();
      showToast('Auto profil (náhled) zrušen');
    } else if (S._tracePoints.length > 0) {
      S._tracePoints = []; S._traceSegs = [];
      _showTraceButtons();
      draw();
      showToast('Trasování zrušeno');
    } else {
      _exitProfileTraceMode();
    }
  }

  /** Vypne režim trasování profilu (volitelně zachová rozpracované body). */
  function _exitProfileTraceMode(clearTrace = true) {
    S.profileTraceMode = false;
    S._traceCursor = null;
    _camAutoClear();
    if (clearTrace) { S._tracePoints = []; S._traceSegs = []; }
    const pbtn = toolbar.querySelector('[data-act="profile"]');
    if (pbtn) pbtn.classList.remove('cam-sim-active');
    canvas.style.cursor = 'crosshair';
    _showTraceButtons();
    draw();
  }

  /** Dokončí trasování (ruční body + případný navazující Auto/Krok náhled,
   *  viz _camBuildFinalTracePts) a připraví číslovaný náhled nové kontury. */
  function _finishProfileTrace() {
    const pts = _camBuildFinalTracePts();
    if (!pts || pts.length < 2) { showToast('Je potřeba alespoň 2 body'); return; }
    S._refContour = S.contourPoints;
    S._previewContour = pts;
    _exitProfileTraceMode();
    // „✓ Dokončit" rovnou použije profil — bez mezikroku náhledu/fajfky.
    _applyPreviewContour();
  }

  /** Nahradí konturu trasovaným profilem. Zachová zálohu původní kontury,
   *  ať jde profil smazat (❌) a vrátit původní konturu. */
  function _applyPreviewContour() {
    if (!S._previewContour) return;
    pushHistory();
    // Záloha PŮVODNÍ (před-profilové) kontury — drž tu nejstarší.
    if (!S._profileOriginal) S._profileOriginal = S._refContour || S.contourPoints;
    S.contourPoints = S._previewContour;
    // Teprve TEĎ (po potvrzení trasy) je jasné, kudy trasa vede — čáru
    // polotovaru zasahující do (nově) potvrzené kontury lze ořezat.
    // Před potvrzením se neořezává nic (nevíme, kam uživatel trasu povede).
    S._traceConfirmedOnce = true;
    S._previewContour = null;
    S._refContour = null;
    _updateProfileButtons();
    recalcNow();
    S.manualGCode = generateAutoGCode(S._cachedCalc).map(l => l.text).join('\n');
    markGCodeGenerated();
    fullUpdate();
    showToast('Profil použit ✓ — ❌ ho smaže a vrátí původní konturu');
  }

  /** Zahodí náhled trasovaného profilu, kontura zůstává nezměněná. */
  function _cancelPreviewContour() {
    S._previewContour = null;
    S._refContour = null;
    _updateProfileButtons();
    draw();
    showToast('Náhled profilu zrušen');
  }

  /** Smaže použitý profil a vrátí původní (před-profilovou) konturu. */
  function _deleteProfile() {
    if (!S._profileOriginal) return;
    pushHistory();
    S.contourPoints = S._profileOriginal;
    S._profileOriginal = null;
    // Potvrzená trasa je zrušená — polotovar se zase kreslí celý, dokud se
    // neprofiluje/potvrdí znovu (viz _applyPreviewContour).
    S._traceConfirmedOnce = false;
    _updateProfileButtons();
    recalcNow();
    S.manualGCode = generateAutoGCode(S._cachedCalc).map(l => l.text).join('\n');
    markGCodeGenerated();
    fullUpdate();
    showToast('Profil smazán — obnovena původní kontura');
  }

  // ── FULL UPDATE (recalc + redraw + re-render UI) ──
  function fullUpdate() {
    const _ck = calcCacheKey();
    if (S._cachedCalc && S._calcCacheKey === _ck) {
      // Vstupy náhledu se nezměnily — plán zůstává platný. `S.errors` se
      // obnoví z kopie pořízené při výpočtu: `calculate()` je normálně přepíše
      // od nuly a bez toho by se hlášení emise i validátoru vrstvila.
      S.errors = S._calcErrors ? S._calcErrors.slice() : [];
      // Program se mohl mezitím přegenerovat nebo ručně upravit — z něj vzniká
      // simulovaná stopa, takže ta se obnoví vždy (je to jen parser, ne plán).
      Object.assign(S._cachedCalc, computeSimPath(S));
    } else if (previewDeferred()) {
      // Plán čeká na „🔄 Dráhy“ — spočítá se všechno KROMĚ hrubovacích
      // průchodů: kontura, offsety, mezní čáry i stopa programu se kreslí dál
      // (a hlídání kolize toho, co je opravdu v poli, běží taky) — jen šrafování
      // průchodů zmizí, dokud si uživatel dráhy nepřepočítá.
      S._cachedCalc = calculate(false, true);
      S._calcCacheKey = null;
    } else {
      recalcNow();
    }
    // Aktivní upichnutí (part-off) = reálný program je JEN zapichovací cyklus
    // (viz partOffActive v generateAutoGCode). Teoretický náhled hrubování
    // (offsetPath/passes) se ale počítá vždy nezávisle na tom, z aktuálních
    // parametrů (roughingStrategy…) — bez potlačení by se přes skutečnou
    // dráhu upichnutí kreslilo i cizí čelní/podélné hrubovací šrafování.
    const _partOffActive = S.params.partOffZ != null && isFinite(parseFloat(S.params.partOffZ));
    // Aktivní ZÁVITOVÁNÍ nahrazuje hrubování stejně jako upichnutí — bez
    // potlačení by se přes závitovací cyklus kreslilo hrubovací šrafování
    // z parametrů a vypadalo by to, že se hrubuje, i když program obsahuje
    // jen závit (uživatel: „proč mi generuje dráhy závitu v hrubování").
    const _threadCycleActive = !!S.params.threadActive || !!S.params.drillActive;
    // Prázdný manualGCode (např. po "🔄 Resetovat vše") = žádné dráhy k
    // zobrazení — potlačit i teoretický náhled (hrubovací šrafování/pasy),
    // který se jinak počítá vždy nezávisle na manualGCode přímo z parametrů.
    if (!S.manualGCode || !S.manualGCode.trim() || _partOffActive || _threadCycleActive) {
      S._cachedCalc.offsetPath = [];
      S._cachedCalc.finishOffsetPath = [];
      S._cachedCalc.finishRefPath = [];
      S._cachedCalc.finishUnreachablePath = [];
      S._cachedCalc.passes = [];
      S._cachedCalc.interferenceSegments = [];
      S._cachedCalc.flankSegments = [];
      S._cachedCalc.interferenceGuides = [];
      S._cachedCalc.totalPathLength = 0;
      S._cachedCalc.estimatedTimeSeconds = 0;
      // Náhled se vyprázdnil PŘÍMO v keši. Upich a závit jsou v otisku
      // (`partOffZ`, `threadActive`), prázdný program ne — bez zneplatnění by
      // se po jeho návratu (↪ Znovu po Resetu a 🔄 Dráhy) vzal z keše tenhle
      // prázdný náhled a dráhy by chyběly, dokud se nezmění parametr.
      if (!S.manualGCode || !S.manualGCode.trim()) S._calcCacheKey = null;
    } else if (S.genNotes && S.genNotes.length) {
      // Hlášení z poslední EMISE G-kódu (zbytkový polotovar / pořadí obrábění,
      // což calculate() neví). calculate() přepisuje S.errors od nuly, takže
      // se musí připojit znovu — stejný princip jako u kolizních hlášení
      // validátoru (collision: true). Bez programu v poli se nepřipojují:
      // popisují program, který tam už není.
      S.errors.push(...S.genNotes);
    }
    S.generatedCode = generateGCode(S._cachedCalc);
    showErrors();
    scheduleCollisionValidation();
    renderCodeArea();
    renderTab();
    draw();
    saveState();
    updateUndoRedoBtns();
    _updateProfileButtons();   // ❌ smazat profil zůstane, dokud profil existuje
    // Modal "⚙️ Geometrie" (pokud otevřený) se přerenderuje ze stejného
    // S.params — obousměrná synchronizace s hlavním panelem.
    if (toolUi.toolGeomModalRefresh) toolUi.toolGeomModalRefresh();
  }

  // Přegeneruje S.manualGCode z aktuální kontury+parametrů. Volat JEN přes
  // applyChange() (nebo z „🔄 Dráhy" po potvrzení) — ruční zásah v programu
  // má přednost a tahle funkce ho zahazuje.
  function _regenGCode() {
    recalcNow();
    // Do historie se tady ZÁMĚRNĚ nepíše: applyChange() sem pustí jen program
    // BEZ ručních úprav (auto-vygenerovaný), takže není co zachraňovat — a
    // tažení úchopu upichnutí by jinak sypalo do neomezeného undo stacku
    // plnou kopii stavu na každé puštění. Ruční program chrání dirty gate,
    // jeho vědomý přepis přes „🔄 Dráhy" pushHistory() má.
    S.manualGCode = generateAutoGCode(S._cachedCalc).map(l => l.text).join('\n');
    markGCodeGenerated();
    fullUpdate();
  }

  // ── EVENT WIRING ──

  // Sync flipX/flipZ z CAD nastavení → CAM (obousměrná synchronizace)
  const _flipXAC = new AbortController();
  document.addEventListener('flipx-cad', (e) => {
    S.flipX = e.detail;
    draw(); saveState(); renderTab();
  }, { signal: _flipXAC.signal });
  document.addEventListener('flipz-cad', (e) => {
    S.flipZ = e.detail;
    draw(); saveState(); renderTab();
  }, { signal: _flipXAC.signal });
  new MutationObserver(() => {
    if (!document.contains(overlay)) _flipXAC.abort();
  }).observe(document.body, { childList: true });

  // toolbar
  toolbar.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const act = btn.dataset.act;
    const clearExtendTrim = () => {
      if (!S.gExtendMode && !S.gTrimMode) return;
      S.gExtendMode = false; S.gTrimMode = false;
      toolbar.querySelector('[data-act="gextend"]')?.classList.remove('cam-sim-active');
      toolbar.querySelector('[data-act="gtrim"]')?.classList.remove('cam-sim-active');
    };
    if (act === 'addpt') {
      S.addPointMode = !S.addPointMode;
      if (S.addPointMode) {
        S.delPointMode = false; toolbar.querySelector('[data-act="delpt"]').classList.remove('cam-sim-active');
        clearExtendTrim();
        showToast('Klikněte na bod (vložit segment) nebo na oblouk (tečna pod úhlem)');
      }
      btn.classList.toggle('cam-sim-active', S.addPointMode);
      canvas.style.cursor = S.addPointMode ? 'copy' : 'crosshair';
    } else if (act === 'delpt') {
      S.delPointMode = !S.delPointMode;
      if (S.delPointMode) { S.addPointMode = false; toolbar.querySelector('[data-act="addpt"]').classList.remove('cam-sim-active'); clearExtendTrim(); }
      btn.classList.toggle('cam-sim-active', S.delPointMode);
      canvas.style.cursor = S.delPointMode ? 'no-drop' : 'crosshair';
    } else if (act === 'profile') {
      if (S._previewContour) { showToast('Nejprve potvrďte (✅) nebo zrušte (❌) náhled profilu'); return; }
      if (S.profileTraceMode) {
        _exitProfileTraceMode();
      } else {
        S.addPointMode = false; S.delPointMode = false;
        toolbar.querySelector('[data-act="addpt"]')?.classList.remove('cam-sim-active');
        toolbar.querySelector('[data-act="delpt"]')?.classList.remove('cam-sim-active');
        S.profileTraceMode = true;
        S._tracePoints = []; S._traceSegs = [];
        btn.classList.add('cam-sim-active');
        canvas.style.cursor = 'crosshair';
        showToast('Trasování profilu: klikejte na body (Enter/✓ = dokončit, Esc/✗ = zrušit)');
        _showTraceButtons();
        draw();
      }
    } else if (act === 'profile-apply') {
      const pts = _camBuildFinalTracePts();
      if (pts && pts.length >= 2) {
        S._refContour = S.contourPoints;
        S._previewContour = pts;
        _camAutoClear();
        _applyPreviewContour();
      } else {
        _applyPreviewContour();
      }
    } else if (act === 'profile-cancel') {
      // Auto náhled > ruční náhled > profil už použitý (smazat a vrátit konturu).
      if (_camAutoSegs) {
        _camAutoClear();
        _updateProfileButtons();
        draw();
        showToast('Náhled profilu zrušen');
      } else if (S._previewContour) _cancelPreviewContour();
      else _deleteProfile();
    } else if (act === 'edit-contour') {
      // Kontura: tažení bodů kontury. Vzájemně se vylučuje s úpravou drah.
      S.pointDragEnabled = !S.pointDragEnabled;
      if (S.pointDragEnabled) {
        S.gcodeEditEnabled = false;
        S.hoverGNode = null; S.hoverGSeg = null;
        S.gExtendMode = false; S.gTrimMode = false;
        toolbar.querySelector('[data-act="edit-paths"]')?.classList.remove('cam-sim-active');
        toolbar.querySelector('[data-act="gextend"]')?.classList.remove('cam-sim-active');
        toolbar.querySelector('[data-act="gtrim"]')?.classList.remove('cam-sim-active');
        showToast('Kontura: táhněte body kontury pro změnu jejich polohy');
      }
      btn.classList.toggle('cam-sim-active', S.pointDragEnabled);
      { const v = S.pointDragEnabled || S.gcodeEditEnabled; toolbar.querySelector('[data-act="addpt"]').style.display = v ? '' : 'none'; toolbar.querySelector('[data-act="delpt"]').style.display = v ? '' : 'none'; }
      { const ve = S.gcodeEditEnabled; toolbar.querySelector('[data-act="gextend"]').style.display = ve ? '' : 'none'; toolbar.querySelector('[data-act="gtrim"]').style.display = ve ? '' : 'none'; }
      draw();
    } else if (act === 'edit-paths') {
      // Dráhy: úprava G-kódu. Vzájemně se vylučuje s úpravou kontury.
      S.gcodeEditEnabled = !S.gcodeEditEnabled;
      if (S.gcodeEditEnabled) {
        S.pointDragEnabled = false;
        toolbar.querySelector('[data-act="edit-contour"]')?.classList.remove('cam-sim-active');
        if (S.showSimPath === 'none') S.showSimPath = 'all';   // ať jdou dráhy uchopit
        showToast('Dráhy: táhněte uzly/úsečky dráhy; ➕/➖ na dráze přidá/smaže pohyb');
      } else {
        S.hoverGNode = null; S.hoverGSeg = null; S._gcodeFocusLine = null;
        // při vypnutí vypnout i režimy prodloužit/oříznout
        S.gExtendMode = false; S.gTrimMode = false;
        toolbar.querySelector('[data-act="gextend"]')?.classList.remove('cam-sim-active');
        toolbar.querySelector('[data-act="gtrim"]')?.classList.remove('cam-sim-active');
      }
      btn.classList.toggle('cam-sim-active', S.gcodeEditEnabled);
      { const v = S.pointDragEnabled || S.gcodeEditEnabled; toolbar.querySelector('[data-act="addpt"]').style.display = v ? '' : 'none'; toolbar.querySelector('[data-act="delpt"]').style.display = v ? '' : 'none'; }
      { const ve = S.gcodeEditEnabled; toolbar.querySelector('[data-act="gextend"]').style.display = ve ? '' : 'none'; toolbar.querySelector('[data-act="gtrim"]').style.display = ve ? '' : 'none'; }
      draw();
    } else if (act === 'fit') {
      fitView();
    } else if (act === 'simpath') {
      // Cyklus: all → cut (skryté rychloposuvy) → none → all
      const next = { all: 'cut', cut: 'none', none: 'all' };
      S.showSimPath = next[S.showSimPath] || 'all';
      const cfg = {
        all:  { icon: '👁',  active: true,  toast: 'Simulační trajektorie zobrazena' },
        cut:  { icon: '✂️',  active: true,  toast: 'Skryté rychloposuvy (jen řezné drahy)' },
        none: { icon: '🙈', active: false, toast: 'Simulační trajektorie skryta' },
      }[S.showSimPath];
      btn.classList.toggle('cam-sim-active', cfg.active);
      btn.textContent = cfg.icon;
      draw();
      saveState();
      showToast(cfg.toast);
    } else if (act === 'zlimits') {
      // Prostý on/off – co se zobrazuje řídí checkboxy v parametrech.
      S.showZLimits = S.showZLimits === 'on' ? 'off' : 'on';
      // Při prvním zapnutí: pokud nejsou žádné hodnoty, auto-inicializovat
      // čelisti/koník z kontury a zaškrtnout je (rozsah nechme na uživateli).
      if (S.showZLimits === 'on') {
        const allNull = S.zLimits.chuck === null && S.zLimits.tail === null
          && S.zLimits.rangeStart === null && S.zLimits.rangeEnd === null;
        if (allNull) {
          const absPts = resolvePointsToAbsolute(S.contourPoints);
          if (absPts.length > 0) {
            let minZ = Infinity, maxZ = -Infinity;
            absPts.forEach(p => { if (p.zAbs < minZ) minZ = p.zAbs; if (p.zAbs > maxZ) maxZ = p.zAbs; });
            const span = Math.max(10, maxZ - minZ);
            S.zLimits.chuck = Math.round((minZ - span * 0.15) * 100) / 100;
            S.zLimits.tail  = Math.round((maxZ + span * 0.15) * 100) / 100;
            S.zLimits.rangeStart = Math.round((minZ + span * 0.2) * 100) / 100;
            S.zLimits.rangeEnd   = Math.round((maxZ - span * 0.2) * 100) / 100;
          } else {
            S.zLimits.chuck = -110; S.zLimits.tail = 10;
            S.zLimits.rangeStart = -90; S.zLimits.rangeEnd = -10;
          }
          // Auto-zaškrtnout čelisti/koník, rozsah ponechat na uživateli.
          S.zLimits.chuckActive = true;
          S.zLimits.tailActive  = true;
        }
      }
      const cfg = ZLIM_CFG[S.showZLimits] || ZLIM_CFG.off;
      btn.classList.toggle('cam-sim-active', cfg.active);
      btn.textContent = cfg.icon;
      fullUpdate();
      showToast(cfg.toast);
    } else if (act === 'snap') {
      S.snapEnabled = !S.snapEnabled;
      btn.classList.toggle('cam-sim-active', S.snapEnabled);
      if (!S.snapEnabled) S._snap = null;
      showToast(S.snapEnabled
        ? 'SNAP zapnut: přichytávání k bodům a hranám kontury/polotovaru'
        : 'SNAP vypnut');
      draw();
    } else if (act === 'gextend' || act === 'gtrim') {
      const on = act === 'gextend' ? !S.gExtendMode : !S.gTrimMode;
      S.gExtendMode = act === 'gextend' ? on : false;
      S.gTrimMode = act === 'gtrim' ? on : false;
      // vzájemně vylučující s vkládáním/mazáním bodů
      if (on) {
        S.addPointMode = false; S.delPointMode = false;
        toolbar.querySelector('[data-act="addpt"]')?.classList.remove('cam-sim-active');
        toolbar.querySelector('[data-act="delpt"]')?.classList.remove('cam-sim-active');
      }
      toolbar.querySelector('[data-act="gextend"]').classList.toggle('cam-sim-active', S.gExtendMode);
      toolbar.querySelector('[data-act="gtrim"]').classList.toggle('cam-sim-active', S.gTrimMode);
      if (on && !S.gcodeEditEnabled) {
        // Pro úpravu drah je potřeba odemčeno (= editace drah zapnutá).
        showToast('Nejdřív zapněte ✥ Dráhy, pak klikněte na koncový bod');
      } else if (on) {
        showToast(act === 'gextend'
          ? 'Prodloužit: klikněte na koncový bod úsečky (protáhne se k průsečíku)'
          : 'Oříznout: klikněte na koncový bod úsečky (zkrátí se k průsečíku)');
      }
      canvas.style.cursor = on ? 'crosshair' : 'crosshair';
      draw();
    } else if (act === 'toggle-controls') {
      S.controlsHidden = !S.controlsHidden;
      const hidden = S.controlsHidden;
      const acts = ['edit-contour', 'edit-paths', 'fit', 'simpath', 'zlimits', 'removal', 'snap', 'profile'];
      acts.forEach(a => {
        const el = toolbar.querySelector(`[data-act="${a}"]`);
        if (el) el.style.display = hidden ? 'none' : '';
      });
      btn.textContent = hidden ? '»«' : '«»';
      btn.title = hidden ? 'Zobrazit hlavní ovládací tlačítka' : 'Skrýt hlavní ovládací tlačítka';
    }
  });

  // player bar (play/stop, krokování, rychlost, single-block)
  playerBar.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'play') {
      if (S.simRunning) {
        // Pauza – zastavit, ale zachovat pozici.
        S.simRunning = false; S.simBlockTarget = null;
        playBtn.textContent = '▶';
      } else {
        if (S.simProgress >= 1) S.simProgress = 0;
        // V single-block módu: spočítat cíl = konec dalšího G-kód bloku.
        if (S.singleBlock) {
          if (!S._cachedCalc) recalcNow();
          const calc = S._cachedCalc;
          const total = calc.simPath.length - 1;
          const currentSimIdx = Math.floor(S.simProgress * total);
          const currentLineIdx = calc.simPath[currentSimIdx]?.originalLineIdx ?? -1;
          let targetIdx = total;
          for (let i = currentSimIdx + 1; i <= total; i++) {
            const li = calc.simPath[i].originalLineIdx;
            if (li != null && li > currentLineIdx) { targetIdx = i; break; }
          }
          S.simBlockTarget = total > 0 ? targetIdx / total : 1;
        } else {
          S.simBlockTarget = null;
        }
        S._gcodeFocusLine = null;   // přehrávání přebíjí kliknutý řádek
        S.simRunning = true; playBtn.textContent = '⏸'; startSimLoop();
      }
    } else if (act === 'stop') {
      S.simRunning = false; S.simProgress = 0; S.simBlockTarget = null;
      S._gcodeFocusLine = null;   // stop přebíjí kliknutý řádek
      playBtn.textContent = '▶';
      draw(); updateCodeHighlight(); updateProgressBar();
    } else if (act === 'step-back') {
      seekToAdjacentBlock(-1);
    } else if (act === 'step-fwd') {
      seekToAdjacentBlock(1);
    } else if (act === 'sbl') {
      S.singleBlock = !S.singleBlock;
      btn.classList.toggle('cam-sim-active', S.singleBlock);
      if (!S.singleBlock) S.simBlockTarget = null;
      showToast(S.singleBlock ? 'Single block ZAP – přehrávání po blocích' : 'Single block VYP');
    } else if (act === 'speed-down') {
      const idx = SIM_SPEEDS.indexOf(S.simSpeed);
      if (idx > 0) S.simSpeed = SIM_SPEEDS[idx - 1];
      else if (idx === -1) S.simSpeed = SIM_SPEEDS[0];
      updateSpeedLabel();
    } else if (act === 'speed-up') {
      const idx = SIM_SPEEDS.indexOf(S.simSpeed);
      if (idx < SIM_SPEEDS.length - 1) S.simSpeed = SIM_SPEEDS[idx + 1];
      else if (idx === -1) S.simSpeed = SIM_SPEEDS[SIM_SPEEDS.length - 1];
      updateSpeedLabel();
    }
  });

  // undo / redo
  root.querySelector('[data-act="undo"]').addEventListener('click', undo);
  root.querySelector('[data-act="redo"]').addEventListener('click', redo);

  // Plátno po přepnutí přepočte až ResizeObserver, fitView ale počítá
  // z clientWidth/Height, které už platí.
  toggleCodeBtn.addEventListener('click', () => {
    const next = { open: 'mini', mini: 'closed', closed: 'open' };
    setCodePanelMode(next[codePanelMode], true);
  });

  // progress bar scrubbing
  function scrubProgress(e) {
    const track = progressBar.querySelector('.cam-sim-progress-track');
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    S.simProgress = ratio;
    S._gcodeFocusLine = null;   // scrub přebíjí kliknutý řádek
    draw(); updateCodeHighlight(); updateProgressBar();
  }
  let _scrubbing = false;
  progressBar.addEventListener('mousedown', e => {
    _scrubbing = true; scrubProgress(e);
  });
  document.addEventListener('mousemove', e => {
    if (_scrubbing) scrubProgress(e);
  });
  document.addEventListener('mouseup', () => { _scrubbing = false; });
  progressBar.addEventListener('touchstart', e => {
    if (e.touches.length === 1) { _scrubbing = true; scrubProgress(e.touches[0]); }
  }, { passive: true });
  progressBar.addEventListener('touchmove', e => {
    if (_scrubbing && e.touches.length === 1) scrubProgress(e.touches[0]);
  }, { passive: true });
  progressBar.addEventListener('touchend', () => { _scrubbing = false; });

  // keyboard shortcuts
  const handleKeyDown = (e) => {
    if (!document.body.contains(overlay)) return;
    // Mezi úseky „✂ Po úsecích" se čeká na vykreslení — Zpět by tam sáhlo
    // do rozpracovaného stavu.
    if (isBusy()) { e.preventDefault(); return; }
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
    if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
    if (e.key === 'Escape') {
      if (S.partOffPickMode) {
        S.partOffPickMode = false;
        showToast('Výběr upichnutí zrušen');
        renderTab(); draw();
      } else if (S.rectSelecting) {
        S.rectSelecting = false;
        S.rectStart = null;
        S.rectEnd = null;
        S.selectedPoints.clear();
        canvas.style.cursor = 'crosshair';
        draw();
      } else if (S.selectedPoints.size > 0) {
        S.selectedPoints.clear();
        draw();
      }
    }
  };
  document.addEventListener('keydown', handleKeyDown);

  // tabs
  root.querySelectorAll('.cam-sim-tabs button').forEach(btn => {
    btn.addEventListener('click', () => { S.activeTab = btn.dataset.tab; renderTab(); });
  });

  // code area buttons
  root.querySelector('[data-code="refresh"]').addEventListener('click', async () => {
    if (isBusy()) return;
    // Celý program: části nahradí jeden program s nastavením z panelu (cam/genButtons.js).
    if (S.opView === 'all') return regenWholeProgram(S, { confirm: camConfirm, busy: withBusy,
      pushHistory, restoreBaseFromLive, regen: _regenGCode, toast: showToast });
    const what = partsActive() ? `části „${S.opParts[S.activePart].name}"` : 'aktuální kontury';
    // Ptát se jen tehdy, když je co ztratit. V automaticky vygenerovaném
    // programu ruční úpravy nejsou, tak neotravovat dialogem při každém kliku.
    const ok = !S.gcodeDirty
      || await camConfirm(`Přegenerovat dráhy ${what} z kontury a parametrů? Ruční úpravy G-kódu budou přepsány.`);
    if (!ok) return;
    await withBusy(partsActive() ? `Generuji dráhy ${what}…` : 'Generuji dráhy a G-kód…', () => {
      recalcNow();
      const next = generateAutoGCode(S._cachedCalc).map(l => l.text).join('\n');
      if (next !== S.manualGCode) pushHistory();   // přepis jde vzít Zpět
      S.manualGCode = next;
      markGCodeGenerated();
      syncActivePart();
      refreshAutoPartName();
      fullUpdate();
      showToast(partsActive()
        ? `Dráhy části ${S.activePart + 1}/${S.opParts.length} přegenerovány`
        : 'Dráhy přegenerovány z kontury a parametrů');
    });
  });
  root.querySelector('[data-code="add-op"]').addEventListener('click', handleAddOperation);
  root.querySelector('[data-code="section-paths"]').addEventListener('click', handleSectionPaths);
  root.querySelector('[data-code="reset-parts"]').addEventListener('click', handleResetParts);
  root.querySelector('[data-code="editor"]').addEventListener('click', handlePartsToEditor);

  // Lišta částí programu (chipy + přepínač náhledu)
  partsBar.addEventListener('click', (e) => {
    const del = e.target.closest('[data-op-del]');
    if (del) { e.stopPropagation(); handleDeletePart(parseInt(del.dataset.opDel, 10)); return; }
    const view = e.target.closest('[data-op-view]');
    if (view) { setOpView(view.dataset.opView); return; }
    if (e.target.closest('[data-op-act="to-editor"]')) { handlePartsToEditor(); return; }
    const ren = e.target.closest('[data-op-rename]');
    if (ren) { handleRenamePart(parseInt(ren.dataset.opRename, 10)); return; }
    const chip = e.target.closest('[data-op]');
    if (chip) switchToPart(parseInt(chip.dataset.op, 10));
  });
  // Mobilní rozbalovací pole místo chipů (renderPartsBar)
  partsBar.addEventListener('change', (e) => {
    if (e.target.matches('.cam-op-select') && e.target.value !== '') switchToPart(parseInt(e.target.value, 10));
  });
  partsBar.addEventListener('dblclick', (e) => {
    const chip = e.target.closest('[data-op]');
    if (chip && !e.target.closest('[data-op-del]')) handleRenamePart(parseInt(chip.dataset.op, 10));
  });
  root.querySelector('[data-code="save-prog"]').addEventListener('click', handleSaveProject);
  root.querySelector('[data-code="load-prog"]').addEventListener('click', handleLoadProject);
  const showSidebar = () => {
    if (root.offsetWidth < 700) sidebar.classList.add('cam-sim-sidebar-overlay');
    else sidebar.classList.remove('cam-sim-sidebar-overlay');
    sidebar.style.display = 'flex';
    renderTab(); draw();
  };
  const hideSidebar = () => {
    sidebar.style.display = 'none';
    sidebar.classList.remove('cam-sim-sidebar-overlay');
    draw();
  };
  root.querySelector('[data-code="show-sidebar"]').addEventListener('click', () => {
    if (sidebar.style.display === 'flex') hideSidebar(); else showSidebar();
  });
  root.querySelector('[data-act="hide-sidebar"]').addEventListener('click', hideSidebar);

  // DLOUHÉ PODRŽENÍ 📏 → pravý panel rovnou u Z-limitů / rozsahu (uživatel
  // 25. 9. 2026: rozsah byl vypnutý a nebylo vidět, kde se zapíná). Krátký
  // klik dál jen zapíná/vypíná zobrazení limitů (handler `act === 'zlimits'`).
  {
    const zlBtn = toolbar.querySelector('[data-act="zlimits"]');
    let holdTimer = null, held = false;
    const openRangeSettings = () => {
      S.activeTab = 'params';
      S.safetyConfigOpen = true;
      showSidebar();
      const target = sidebar.querySelector('[data-act="zrange-active"]');
      if (target) {
        const box = target.closest('label') || target;
        box.scrollIntoView({ block: 'center', behavior: 'smooth' });
        box.style.transition = 'background-color .6s';
        box.style.backgroundColor = 'rgba(249,226,175,0.25)';
        setTimeout(() => { box.style.backgroundColor = ''; }, 1200);
      }
    };
    if (zlBtn) {
      zlBtn.addEventListener('pointerdown', () => {
        held = false;
        clearTimeout(holdTimer);
        holdTimer = setTimeout(() => { held = true; openRangeSettings(); }, 550);
      });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) {
        zlBtn.addEventListener(ev, () => clearTimeout(holdTimer));
      }
      // Po podržení se klik nesmí propsat jako přepnutí zobrazení limitů.
      zlBtn.addEventListener('click', (e) => {
        if (held) { held = false; e.stopImmediatePropagation(); e.preventDefault(); }
      }, true);
      zlBtn.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  // manual textarea
  manualTa.addEventListener('mousedown', () => { S._gcodeFocusLine = null; });
  // Klik na řádek programu přesune simulaci na ten blok (přání uživatele
  // 27. 8. 2026). Až na `click`, ne `mousedown` — dřív textarea ještě nemá
  // přesunutý kurzor, takže by se četl řádek z minulého kliknutí.
  manualTa.addEventListener('click', () => {
    const caret = manualTa.selectionStart;
    if (caret == null) return;
    let li = 0;
    for (let i = 0; i < caret && i < manualTa.value.length; i++) {
      if (manualTa.value.charCodeAt(i) === 10) li++;
    }
    seekToLine(li);
  });
  manualTa.addEventListener('input', () => {
    // Náhled celého programu je jen ke čtení — složený kód se generuje z částí,
    // ruční úprava by se při dalším přepnutí ztratila (textarea má readonly,
    // tohle je pojistka pro programové změny hodnoty).
    if (S.opView === 'all') { manualTa.value = S.manualGCode; return; }
    S._gcodeFocusLine = null;
    S.manualGCode = manualTa.value;
    markGCodeEdited();   // od teď program chráněný před auto-přegenerováním
    recalcNow();
    S.generatedCode = generateGCode(S._cachedCalc);
    renderCodeBackdrop();
    updateCodeHighlight();
    updateRefreshBtn();
    draw();
    saveState();
  });
  manualTa.addEventListener('scroll', () => {
    codeBackdrop.scrollTop = manualTa.scrollTop;
    codeBackdrop.scrollLeft = manualTa.scrollLeft;
  });

  // Vloží do polotovaru nový bod tam, kde jeho obrys protíná svislou
  // čáru limitu čelistí (Z = S.zLimits.chuck) — vznikne reálný vrchol
  // polotovaru, který lze tahat/označit i použít jako bod pro kreslení
  // (po přenosu do CAD je vidět jako koncový bod úsečky polotovaru).
  function handleAddStockChuckPoint() {
    const chuckLim = S.zLimits.chuck;
    if (typeof chuckLim !== 'number' || !isFinite(chuckLim)) return;
    const calc = S._cachedCalc || calculate();
    const prms = S.params;
    const inserts = [];
    calc.stockPathSegments.forEach((seg, i) => {
      intersectSegAtZ(seg, chuckLim).forEach(x => inserts.push({ afterIndex: i, x }));
    });
    if (inserts.length === 0) {
      alert('Obrys polotovaru neprotíná limit čelistí.');
      return;
    }
    pushHistory();
    // Vkládat od konce, ať se nemění indexy dříve nalezených průsečíků.
    inserts.sort((a, b) => b.afterIndex - a.afterIndex);
    inserts.forEach(({ afterIndex, x }) => {
      const rawX = prms.mode === 'DIAMON' ? x * 2 : x;
      S.stockPoints.splice(afterIndex + 1, 0, {
        id: Date.now() + Math.floor(Math.random() * 1000),
        type: 'G1', mode: 'ABS',
        x: Math.round(rawX * 1000) / 1000,
        z: Math.round(chuckLim * 1000) / 1000,
        r: 0
      });
    });
    fullUpdate();
  }

  // ── CANVAS INTERACTION ──
  function handleInsertAfter(index, isStock) {
    const stock = isStock !== undefined ? isStock : S.editMode === 'stock';
    const list = stock ? S.stockPoints : S.contourPoints;
    const prev = list[index];
    // Absolutní souřadnice výchozího bodu — pro dopočet X/Z z úhlu+délky.
    const fromAbs = resolvePointsToAbsolute(list)[index];
    openInsertSegmentModal(prev, (newPt, tgt) => {
      pushHistory();
      const targetList = tgt === 'stock' ? S.stockPoints : S.contourPoints;
      // vložit za index jen pokud jde o stejný list, jinak na konec
      if (targetList === list) {
        list.splice(index + 1, 0, { ...newPt, id: Date.now() });
      } else {
        targetList.push({ ...newPt, id: Date.now() });
      }
      fullUpdate();
    }, stock ? 'stock' : 'contour', fromAbs);
  }

  // ── Modal: tečná úsečka pod úhlem z oblouku ── → cam/sim/tangentLineModal.js
  function openTangentLineModal(found) {
    _openTangentLineModal({ S, saveState, draw, pushHistory, fullUpdate }, found);
  }

  // ── Modal pro vložení segmentu ── → cam/sim/insertSegmentModal.js
  function openInsertSegmentModal(fromPt, onConfirm, defaultTarget, fromAbs) {
    _openInsertSegmentModal({ S, canvas, canvasPick }, fromPt, onConfirm, defaultTarget, fromAbs);
  }

  // ── Modal pro přidání G-kód pohybu – bohatá verze (úhel, délka, pick) ──
  function openAddGMoveModal(gn, afterLabel, onConfirm) {
    const isDia = S.params.mode === 'DIAMON';
    const fromX = gn.x;   // world radius
    const fromZ = gn.z;

    let pickMode = false;
    const ov = document.createElement('div');
    ov.className = 'cam-confirm-overlay';
    ov.style.zIndex = '200000';

    const hint = document.createElement('div');
    hint.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:200001;background:#f9e2af;color:#1e1e2e;font-weight:700;font-size:13px;padding:8px 20px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.4);pointer-events:none;display:none';
    hint.textContent = '🎯 Klikněte na bod dráhy nebo kontury…  (Esc = zpět)';
    document.body.appendChild(hint);

    const ms = { type: 'G1', x: +(isDia ? fromX * 2 : fromX).toFixed(3), z: +fromZ.toFixed(3), cr: 0, ang: 45, angLen: 10, angMode: 'length' };

    const syncValues = () => {
      const xEl = ov.querySelector('#agm-x'); if (xEl) ms.x = parseFloat(xEl.value) || 0;
      const zEl = ov.querySelector('#agm-z'); if (zEl) ms.z = parseFloat(zEl.value) || 0;
      const crEl = ov.querySelector('#agm-cr'); if (crEl) ms.cr = parseFloat(crEl.value) || 0;
      const aEl = ov.querySelector('#agm-ang'); if (aEl) ms.ang = parseFloat(aEl.value);
      const alEl = ov.querySelector('#agm-anglen'); if (alEl) ms.angLen = parseFloat(alEl.value);
      const amEl = ov.querySelector('#agm-angmode'); if (amEl) ms.angMode = amEl.value;
    };

    // Handler a Esc nastražit při KAŽDÉM vstupu (po převzetí se mažou).
    const enterPickMode = () => { syncValues(); pickMode = true; canvasPick.handler = onPick; document.addEventListener('keydown', handlePickEsc); ov.style.display = 'none'; hint.style.display = 'block'; canvas.style.cursor = 'crosshair'; };
    const exitPickMode = () => { pickMode = false; ov.style.display = ''; hint.style.display = 'none'; canvas.style.cursor = 'crosshair'; renderModal(); setTimeout(() => { const el = ov.querySelector('#agm-x'); if (el) { el.focus(); el.select(); } }, 30); };

    const inp = 'background:#1e1e2e;border:1px solid #45475a;color:#cdd6f4;border-radius:4px;padding:6px;font-size:14px;width:100%;box-sizing:border-box';
    const selStyle = 'background:#1e1e2e;border:1px solid #45475a;color:#cdd6f4;border-radius:4px;padding:7px 4px;font-size:13px;width:100%;box-sizing:border-box';

    const renderModal = () => {
      const isArc = ms.type === 'G2' || ms.type === 'G3';
      ov.innerHTML = `
        <div class="cam-confirm-box" style="min-width:340px;max-width:95vw">
          <div style="font-weight:bold;font-size:14px;margin-bottom:14px;color:#89b4fa">➕ Přidat pohyb za řádek ${afterLabel}</div>
          <div style="display:flex;gap:6px;margin-bottom:14px">
            ${['G0','G1','G2','G3'].map(t => `<button data-type="${t}" style="flex:1;padding:6px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;border:2px solid ${t===ms.type?'#89b4fa':'#45475a'};background:${t===ms.type?'#89b4fa':'#313244'};color:${t===ms.type?'#1e1e2e':'#cdd6f4'}">${t}</button>`).join('')}
          </div>
          <div style="display:flex;gap:10px;margin-bottom:${isArc?'10px':'14px'}">
            <label style="flex:1;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">X${isDia?' (⌀)':''}<input id="agm-x" type="number" value="${ms.x}" step="0.1" style="${inp}"></label>
            <label style="flex:1;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">Z<input id="agm-z" type="number" value="${ms.z}" step="0.1" style="${inp}"></label>
          </div>
          ${isArc ? `<div style="margin-bottom:14px"><label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">CR (poloměr)<input id="agm-cr" type="number" value="${ms.cr}" step="0.1" min="0" style="${inp}"></label></div>` : ''}
          <div style="display:flex;gap:10px;margin-bottom:14px;align-items:flex-end;flex-wrap:wrap">
            <label style="flex:1;min-width:70px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">📐 Úhel (°)<input id="agm-ang" type="number" value="${!isNaN(ms.ang)?ms.ang:45}" step="1" style="${inp}"></label>
            <label style="flex:1;min-width:100px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">Ukončení<select id="agm-angmode" style="${selStyle}"><option value="length" ${ms.angMode!=='intersect'?'selected':''}>Zadaná délka</option><option value="intersect" ${ms.angMode==='intersect'?'selected':''}>Do průsečíku</option></select></label>
            <label id="agm-anglen-wrap" style="flex:1;min-width:60px;display:${ms.angMode==='intersect'?'none':'flex'};flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">Délka<input id="agm-anglen" type="number" value="${!isNaN(ms.angLen)?ms.angLen:10}" step="0.5" min="0.001" style="${inp}"></label>
            <button id="agm-angcalc" title="Dopočítat X/Z od výchozího bodu pod úhlem (0°=+Z vodorovně, 90°=+X nahoru)" style="padding:7px 12px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;border:2px solid #45475a;background:#313244;color:#cdd6f4;white-space:nowrap">↘ X/Z</button>
          </div>
          <div style="margin-bottom:14px">
            <button id="agm-pick" style="width:100%;padding:7px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;border:2px solid #45475a;background:#313244;color:#cdd6f4">🎯 Přebrat souřadnice z bodu</button>
          </div>
          <div class="cam-confirm-btns">
            <button id="agm-ok" style="padding:7px 22px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;border:none;background:#89b4fa;color:#1e1e2e">Přidat</button>
            <button id="agm-cancel" style="padding:7px 22px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;border:none;background:#45475a;color:#cdd6f4">Zrušit</button>
          </div>
        </div>`;

      ov.querySelectorAll('[data-type]').forEach(btn => btn.addEventListener('click', () => { syncValues(); ms.type = btn.dataset.type; renderModal(); }));
      ov.querySelector('#agm-pick').addEventListener('click', enterPickMode);

      const angModeSel = ov.querySelector('#agm-angmode');
      angModeSel.addEventListener('change', () => {
        ms.angMode = angModeSel.value;
        ov.querySelector('#agm-anglen-wrap').style.display = ms.angMode === 'intersect' ? 'none' : 'flex';
      });

      ov.querySelector('#agm-angcalc').addEventListener('click', () => {
        syncValues();
        const a = ms.ang, l = ms.angLen, toIntersect = ms.angMode === 'intersect';
        if (isNaN(a) || (!toIntersect && (isNaN(l) || l <= 0))) { showToast('Zkontrolujte úhel a délku.'); return; }
        const rad = a * Math.PI / 180;
        let ex, ez;
        if (toIntersect) {
          const hit = camRayIntersection(fromX, fromZ, Math.sin(rad), Math.cos(rad), null, S._cachedCalc);
          if (!hit) { showToast('Žádný průsečík ve směru úhlu nenalezen.'); return; }
          ex = hit.x; ez = hit.z;
        } else {
          ex = fromX + Math.sin(rad) * l;
          ez = fromZ + Math.cos(rad) * l;
        }
        ms.x = Math.round((isDia ? ex * 2 : ex) * 1000) / 1000;
        ms.z = Math.round(ez * 1000) / 1000;
        renderModal();
      });

      const doConfirm = () => {
        syncValues();
        document.removeEventListener('keydown', handlePickEsc);
        ov.remove(); hint.remove();
        canvasPick.handler = null; canvas.style.cursor = 'crosshair';
        onConfirm({ type: ms.type, x: isDia ? ms.x / 2 : ms.x, z: ms.z, cr: ms.cr });
      };
      const doCancel = () => {
        document.removeEventListener('keydown', handlePickEsc);
        ov.remove(); hint.remove(); canvasPick.handler = null; canvas.style.cursor = 'crosshair';
      };
      ov.querySelector('#agm-ok').addEventListener('click', doConfirm);
      ov.querySelector('#agm-cancel').addEventListener('click', doCancel);
      ov.addEventListener('keydown', e => { if (e.key === 'Enter') doConfirm(); else if (e.key === 'Escape') doCancel(); });
      setTimeout(() => { const el = ov.querySelector('#agm-x'); if (el) { el.focus(); el.select(); } }, 30);
    };

    const handlePickEsc = (e) => { if (e.key === 'Escape' && pickMode) exitPickMode(); };
    document.addEventListener('keydown', handlePickEsc);

    renderModal();
    document.body.appendChild(ov);

    const onPick = (wx, wz) => {
      if (!pickMode) { canvasPick.handler = null; return; }
      ms.x = Math.round((isDia ? wx * 2 : wx) * 1000) / 1000;
      ms.z = Math.round(wz * 1000) / 1000;
      document.removeEventListener('keydown', handlePickEsc);
      canvasPick.handler = null;
      exitPickMode();
    };
  }

  // Klik na plátno pro modaly (🎯 Přebrat souřadnice) — objekt, ať handler
  // mohou nastavit i modaly vyňaté do cam/sim/ (modul nepřepíše cizí `let`).
  const canvasPick = { handler: null };

  canvasWrap.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const oldScale = S.view.scale;
    const newScale = Math.max(0.2, Math.min(oldScale * (1 - Math.sign(e.deltaY) * 0.15), 200));
    S.view.panX = mx - (mx - S.view.panX) * (newScale / oldScale);
    S.view.panY = my - (my - S.view.panY) * (newScale / oldScale);
    S.view.scale = newScale;
    scheduleFrame(draw);   // zoom kolečkem: sloučit překreslení do snímku
  }, { passive: false });

  let lastMousePos = { x: 0, y: 0 };
  let lastPinchDist = null;
  let _draggingStock = false;
  let _draggingStockPt = false;   // tažení bodu stock polyline (ne válcový handle)
  let _draggingPartOff = null;    // 'dojezd' | 'start' — tažení úchopu upichnutí (jen v ose X)
  let _draggedContourSeg = null;  // {idx1,idx2,isStock,lockAxis} – tažení celé úsečky
  let _hoverContourSeg = null;    // {idx1,idx2,isStock} – hover zvýraznění segmentu
  let _mdX = 0, _mdY = 0, _panelPending = false;

  // ── Double-click to enter rect selection mode ──
  canvasWrap.addEventListener('dblclick', e => {
    // Dvě rychlá kliknutí na plovoucí tlačítko trasování (Auto/Přidat/Ubrat/
    // Zrušit/Dokončit) prohlížeč vyhodnotí i jako nativní dblclick, který
    // bubluje až sem — bez téhle výjimky by to při rychlém krokování rovnou
    // dokončilo (a tím i vypnulo) rozpracované trasování.
    if (e.target.closest('.cam-sim-trace-confirm, .cam-sim-trace-cancel, .cam-sim-trace-auto, .cam-sim-trace-stepfwd, .cam-sim-trace-stepback, .cam-sim-trace-freeclick, .cam-sim-trace-stock')) return;
    if (S.profileTraceMode) { e.preventDefault(); _finishProfileTrace(); return; }
    if (!S.pointDragEnabled || S.simRunning) return;
    e.preventDefault();
    S.rectSelecting = true;
    S.selectedPoints.clear();
    S.snapLines = [];
    canvas.style.cursor = 'crosshair';
    draw();
  });

  // Plovoucí tlačítka trasování profilu (mobil bez klávesnice): Zrušit/Auto/Krok/Dokončit
  canvasWrap.querySelector('.cam-sim-trace-confirm').addEventListener('click', e => {
    e.stopPropagation();
    _finishProfileTrace();
  });
  canvasWrap.querySelector('.cam-sim-trace-cancel').addEventListener('click', e => {
    e.stopPropagation();
    _cancelTraceStep();
  });
  canvasWrap.querySelector('.cam-sim-trace-auto').addEventListener('click', e => {
    e.stopPropagation();
    _camAutoRun();
  });
  canvasWrap.querySelector('.cam-sim-trace-stepfwd').addEventListener('click', e => {
    e.stopPropagation();
    _camAutoStep(true);
  });
  canvasWrap.querySelector('.cam-sim-trace-stepback').addEventListener('click', e => {
    e.stopPropagation();
    _camAutoStep(false);
  });
  canvasWrap.querySelector('.cam-sim-trace-freeclick-cb').addEventListener('change', e => {
    S._traceFreeClick = e.target.checked;
    S._traceCursor = null;
    draw();
  });
  canvasWrap.querySelector('.cam-sim-trace-freeclick').addEventListener('click', e => {
    e.stopPropagation();
  });
  canvasWrap.querySelector('.cam-sim-trace-stock-cb').addEventListener('change', e => {
    S._traceThroughStock = e.target.checked;
    draw();
  });
  canvasWrap.querySelector('.cam-sim-trace-stock').addEventListener('click', e => {
    e.stopPropagation();
  });

  canvasWrap.addEventListener('mousedown', e => {
    _mdX = e.clientX; _mdY = e.clientY; _panelPending = false;
    // Ignoruj „ghost" myší události, které prohlížeč generuje po dotyku
    // (skutečné dotykové akce jdou přes _camDispatchMouse = _camDispatching).
    if (!S._camDispatching && S._camGhostUntil && Date.now() < S._camGhostUntil) return;
    // Klik na plovoucí tlačítka trasování – neinterpretovat jako bod kontury
    if (e.target.closest('.cam-sim-trace-confirm, .cam-sim-trace-cancel, .cam-sim-trace-auto, .cam-sim-trace-stepfwd, .cam-sim-trace-stepback, .cam-sim-trace-freeclick, .cam-sim-trace-stock')) return;
    // Upichnutí – klik určí Z rovinu řezu (snap na bod/hranu má přednost).
    if (S.partOffPickMode) {
      const { wz } = _traceWorldFromClient(e.clientX, e.clientY);
      if (isFinite(wz)) {
        pushHistory();   // zapnutí upichu může vyměnit i nůž (autoPickToolFor) — jeden krok ↩
        S.params.partOffZ = Math.round(wz * 1000) / 1000;
        S.partOffPickMode = false;
        S.params.drillActive = false; S.params.boreActive = false;   // jeden cyklus na program (vrtání/vyvrtávání by upich schovalo)
        const picked = autoPickToolFor('partoff').msg;
        // Horní bod úsečky (Start X) předvyplnit povrchem polotovaru — jen když
        // ještě není nastavený (uživatel ho pak může přetáhnout níž do kapsy).
        if (!(parseFloat(S.params.partOffStartX) > 0)) {
          const stTop = (S._cachedCalc && parseFloat(S._cachedCalc.stockTopX)) || (parseFloat(S.params.stockDiameter) || 0) / 2;
          if (stTop > 0) S.params.partOffStartX = Math.round(stTop * 100) / 100;
        }
        showToast(`Upichnutí v Z=${S.params.partOffZ.toFixed(2)}${picked}${S.gcodeDirty ? ' — program má ruční úpravy, cyklus vygeneruj přes 🔄 Dráhy' : ''}`);
        // Zapnutí režimu → cyklus se projeví hned (pokud v programu nejsou
        // ruční úpravy, které mají přednost).
        applyChange({ cycle: true });
      }
      e.stopPropagation();
      return;
    }
    // Trasování profilu – bod se přidá JEN když klik trefí snapovatelný
    // bod (vrchol kontury/polotovaru) nebo průsečík/koncový bod pomocné
    // čáry. Mimo snap se nic nepřidá a klik/tažení jen posune pohled (pan) —
    // POKUD není zapnuté „Mimo body": pak se bod přidá kamkoliv na klik
    // (s úhlovým snapem od posledního bodu, viz S._traceCursor v mousemove).
    if (S.profileTraceMode) {
      const { wx, wz, snapped, insertGuideIdx } = _traceWorldFromClient(e.clientX, e.clientY);
      if (snapped) {
        _addTracePoint(wx, wz, insertGuideIdx);
        e.stopPropagation();
        return;
      }
      if (S._traceFreeClick) {
        const last = S._tracePoints.length ? S._tracePoints[S._tracePoints.length - 1] : null;
        const [fx, fz] = last ? applyAngleSnap(wx, wz, { x: last.x, y: last.z }) : [wx, wz];
        _addTracePoint(fx, fz, -1);
        e.stopPropagation();
        return;
      }
      // mimo snap → jen posun pohledu
      S.isDragging = true;
      lastMousePos = { x: e.clientX, y: e.clientY };
      e.stopPropagation();
      return;
    }
    // Pick handler pro modal vložení segmentu
    if (canvasPick.handler) {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
      const prms = S.params || {};
      let wx, wz;
      if (prms.machineStructure === 'carousel') {
        wx = hS * (sx - S.view.panX) / S.view.scale;
        wz = vS * (sy - S.view.panY) / S.view.scale;
      } else {
        wz = hS * (sx - S.view.panX) / S.view.scale;
        wx = vS * (sy - S.view.panY) / S.view.scale;
      }
      // snap na nejbližší bod kontury/polotovaru — ve SVĚTĚ (poloměr, absolutně):
      // v Ø režimu je X bodu průměr, u INC bodů přírůstek. Handler dostane poloměr.
      const k = prms.mode === 'DIAMON' ? 0.5 : 1;
      const allPts = [...resolvePointsToAbsolute(S.contourPoints), ...resolvePointsToAbsolute(S.stockPoints)];
      let best = null, bestD = Infinity;
      for (const p of allPts) {
        const d = Math.hypot(p.xAbs * k - wx, p.zAbs - wz);
        if (d < bestD) { bestD = d; best = p; }
      }
      if (best && bestD < 20 / S.view.scale) { wx = best.xAbs * k; wz = best.zAbs; }
      canvasPick.handler(wx, wz);
      e.stopPropagation();
      return;
    }
    // Rect selection start
    if (S.rectSelecting) {
      const rect = canvas.getBoundingClientRect();
      S.rectStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      S.rectEnd = null;
      S.isDragging = true;
      lastMousePos = { x: e.clientX, y: e.clientY };
      return;
    }
    // Úprava drah (odemčený zámek): mazání (−), přidání (+), tažení bodu/úsečky.
    // Při add/del se nejdřív zkusí dráha; když klik dráhu netrefí, propadne
    // dál na úpravu bodů kontury (sjednocené odemčení tvar + dráhy).
    if (S.gcodeEditEnabled) {
      // Prodloužit / oříznout: klik na koncový bod úsečky → k průsečíku.
      if (S.gExtendMode || S.gTrimMode) {
        const gn = getGNodeAt(e.clientX, e.clientY);
        if (gn) { extendTrimNode(gn, S.gExtendMode ? 1 : -1); return; }
        // Konstrukční / mezní čára — klik na konec nebo kamkoli na čáru.
        // Auto mezní čára se přitom převede na trvalou uživatelskou.
        extendTrimGuideClick(e.clientX, e.clientY, S.gExtendMode ? 1 : -1);
        return;
      }
      // − aktivní: klik na koncový bod smaže příslušný pohyb z G-kódu.
      if (S.delPointMode) {
        const gn = getGNodeAt(e.clientX, e.clientY);
        if (gn) { pushHistory(); deleteGLine(gn.lineIdx); return; }
      } else if (S.addPointMode) {
        // + aktivní: klik na koncový bod → dialog pro nový pohyb (G0/G1/G2/G3).
        const gn = getGNodeAt(e.clientX, e.clientY);
        if (gn) {
          const lns = S.manualGCode.split('\n');
          const nm = ((lns[gn.lineIdx] || '').match(/^\s*(N\d+)/) || [])[1] || `řádek ${gn.lineIdx + 1}`;
          openAddGMoveModal(gn, nm, mv => {
            pushHistory();
            insertGMove(gn.lineIdx, { type: mv.type, x: mv.x, z: mv.z, cr: mv.cr });
          });
          return;
        }
      } else {
        // Konstrukční (nekonečná) čára: uchopení koncového bodu → posun PO
        // čáře (prodloužit/zkrátit) se snapem k průsečíkům.
        const gEnd = getUserGuideEndAt(e.clientX, e.clientY);
        if (gEnd) {
          pushHistory();
          S._draggedGuideEnd = gEnd; S.isDragging = true;
          lastMousePos = { x: e.clientX, y: e.clientY };
          return;
        }
        // Uchopení konce AUTOMATICKÉ mezní čáry → převést na trvalou
        // uživatelskou (nekonečnou) čáru a táhnout její konec.
        const autoEnd = getGuideEndpointAt(e.clientX, e.clientY) ? findAutoGuideForAction(e.clientX, e.clientY) : null;
        if (autoEnd) {
          pushHistory();
          if (!S.guideLines) S.guideLines = [];
          S.guideLines.push({ x1: autoEnd.x1, z1: autoEnd.z1, x2: autoEnd.x2, z2: autoEnd.z2 });
          S._draggedGuideEnd = { guideIdx: S.guideLines.length - 1, endIdx: autoEnd.endIdx };
          S.isDragging = true;
          lastMousePos = { x: e.clientX, y: e.clientY };
          showToast('Mezní čára převedena na konstrukční (nekonečnou) čáru ✓');
          return;
        }
        // Priorita: bod kontury (vrchol = tvar) → uzel dráhy → úsečka dráhy.
        // Vrcholy kontury mají přednost (zámek je primárně na tvar; navíc na
        // nich leží uzly dokončovací dráhy). Uzly/úsečky mimo vrcholy
        // (hrubování, rychloposuvy) ovládají dráhu.
        const cptHit = S.pointDragEnabled && getPointAt(e.clientX, e.clientY) !== null;
        if (!cptHit) {
          const gnode = getGNodeAt(e.clientX, e.clientY);
          if (gnode) {
            // refPoint = předchozí bod (start pohybu) pro úhlový snap
            const sp = S._cachedCalc && S._cachedCalc.simPath;
            const prev = (sp && gnode.simIdx > 0) ? sp[gnode.simIdx - 1] : null;
            gnode.refPoint = prev ? { x: prev.x, z: prev.z } : null;
            S.draggedGNode = gnode; S.isDragging = true; S._gdragNeedHistory = true;
            // Už při kliknutí (bez tažení) skoč kurzorem na odpovídající
            // řádek G-kódu a zvýrazni ho.
            S._gcodeFocusLine = gnode.lineIdx; updateCodeHighlight();
            lastMousePos = { x: e.clientX, y: e.clientY };
            return;
          }
          const gseg = getGSegmentAt(e.clientX, e.clientY);
          if (gseg) {
            const rect = canvas.getBoundingClientRect();
            gseg.startW = _gToWorld(e.clientX - rect.left, e.clientY - rect.top);
            gseg.orig1 = { x: gseg.p1.x, z: gseg.p1.z };
            gseg.orig2 = { x: gseg.p2.x, z: gseg.p2.z };
            gseg.lockAxis = null;
            S._draggedGSeg = gseg; S.isDragging = true; S._gdragNeedHistory = true;
            // Skok kurzoru na řádek G-kódu už při kliknutí (bez tažení).
            S._gcodeFocusLine = gseg.lineIdx; updateCodeHighlight();
            lastMousePos = { x: e.clientX, y: e.clientY };
            return;
          }
          // Oblouk (G2/G3): tažení neumíme (musel by se s ním přepočítat
          // i poloměr), ale klik má aspoň označit jeho řádek — stejně jako
          // u úseček. Bez `return`, ať klik dál propadne na tažení bodu
          // kontury pod obloukem.
          const garc = getGSegmentAt(e.clientX, e.clientY, false, true);
          if (garc) { S._gcodeFocusLine = garc.lineIdx; updateCodeHighlight(); }
        }
        // jinak (vrchol kontury) spadne na tažení bodu kontury níže
      }
    }
    // Zamčené body (mimo režim úprav drah): klik na dráhu nehýbe tvarem,
    // jen označí + skočí kurzorem na odpovídající řádek G-kódu. Nevrací se,
    // takže tažením lze dál posouvat pohled (pan).
    if (!S.gcodeEditEnabled && !S.simRunning) {
      const gn = getGNodeAt(e.clientX, e.clientY, true);
      const gs = gn ? null : getGSegmentAt(e.clientX, e.clientY, true, true);
      if (gn || gs) { S._gcodeFocusLine = (gn || gs).lineIdx; updateCodeHighlight(); }
    }
    // Z/X-limity – mají přednost před ostatními body, lze tahat i bez odemčení.
    const zKey = getZLimitAt(e.clientX, e.clientY);
    if (zKey !== null) {
      pushHistory();
      S.draggedLimit = zKey; S.isDragging = true; S._limitDragRaw = null;
      lastMousePos = { x: e.clientX, y: e.clientY };
      return;
    }
    const xKey = getXLimitAt(e.clientX, e.clientY);
    if (xKey !== null) {
      pushHistory();
      S.draggedLimit = xKey; S.isDragging = true; S._limitDragRaw = null;
      lastMousePos = { x: e.clientX, y: e.clientY };
      return;
    }
    const stockIdx = getStockHandleAt(e.clientX, e.clientY);
    if (S.pointDragEnabled && stockIdx !== null) {
      pushHistory(); S.draggedPointId = stockIdx; S.isDragging = true; _draggingStock = true;
      lastMousePos = { x: e.clientX, y: e.clientY };
      return;
    }
    if (S.addPointMode) {
      const exitAddMode = () => { S.addPointMode = false; toolbar.querySelector('[data-act="addpt"]').classList.remove('cam-sim-active'); canvas.style.cursor = 'crosshair'; };
      // Klik na koncový bod pomocné čáry → vložit bod kontury přesně
      // v tečném bodě / průsečíku (rozdělí úsečku či oblouk na místě).
      const gp = getGuideEndpointAt(e.clientX, e.clientY);
      if (gp && insertPointOnSegmentAt(gp.x, gp.z)) {
        exitAddMode();
        showToast('Bod vložen na konturu v místě pomocné čáry ✓');
        return;
      }
      const found = getAnyPointAt(e.clientX, e.clientY);
      if (found) { handleInsertAfter(found.idx, found.isStock); exitAddMode(); return; }
      // Klik na oblouk → tečná úsečka pod úhlem (CAD nástroj „Úhel").
      const arcFound = getArcSegmentAt(e.clientX, e.clientY);
      if (arcFound) { openTangentLineModal(arcFound); exitAddMode(); }
      return;
    }
    if (S.delPointMode) {
      const found = getAnyPointAt(e.clientX, e.clientY);
      if (found) {
        const list = found.isStock ? S.stockPoints : S.contourPoints;
        if (list.length > 1) {
          pushHistory();
          list.splice(found.idx, 1);
          fullUpdate();
        } else {
          showToast('Nelze odebrat poslední bod.');
        }
        return;
      }
      // Klik mimo body: smazat ruční pomocnou čáru pod kurzorem.
      const gIdx = getUserGuideAt(e.clientX, e.clientY);
      if (gIdx !== null) {
        S.guideLines.splice(gIdx, 1);
        saveState();
        draw();
        showToast('Pomocná čára smazána ✓');
      }
      return;
    }
    // Úchopy upichnutí (Dojezd X / Start X) mají přednost před body kontury.
    const poHandle = S.pointDragEnabled ? getPartOffHandleAt(e.clientX, e.clientY) : null;
    if (poHandle) {
      pushHistory();
      _draggingPartOff = poHandle; S.isDragging = true;
      lastMousePos = { x: e.clientX, y: e.clientY };
      return;
    }
    const pointHit = S.pointDragEnabled ? getAnyPointAt(e.clientX, e.clientY) : null;
    if (S.pointDragEnabled && pointHit !== null) {
      pushHistory();
      S.draggedPointId = pointHit.idx; S.isDragging = true;
      _draggingStockPt = pointHit.isStock;
    } else if (S.pointDragEnabled) {
      const seg = getContourSegmentAt(e.clientX, e.clientY);
      if (seg) {
        pushHistory();
        _draggedContourSeg = { ...seg, lockAxis: null };
        S.isDragging = true;
      } else { S.isDragging = true; }
    } else { S.isDragging = true; }
    lastMousePos = { x: e.clientX, y: e.clientY };
  });

  canvasWrap.addEventListener('mousemove', e => {
    // Trasování „Mimo body": sledovat kurzor pro náhledovou čáru — jen mimo
    // tažení (panování atd. ať funguje dál beze změny). Blízko snapovatelného
    // bodu se náhled (i budoucí klik) přichytí přesně na něj — přednost před
    // úhlovým snapem, stejně jako mimo tento režim; SNAP indikátor (kroužek)
    // se dál aktualizuje normálně, ať zůstává vizuální zpětná vazba.
    if (S.profileTraceMode && S._traceFreeClick && !S.isDragging) {
      const { wx, wz, snapped } = _traceWorldFromClient(e.clientX, e.clientY);
      let cx = wx, cz = wz;
      if (!snapped) {
        const last = S._tracePoints.length ? S._tracePoints[S._tracePoints.length - 1] : null;
        [cx, cz] = last ? applyAngleSnap(wx, wz, { x: last.x, y: last.z }) : [wx, wz];
      }
      S._traceCursor = { x: cx, z: cz };
      if (S.snapEnabled) S._snap = camSnap(e.clientX, e.clientY);
      draw();
      return;
    }
    // Rect selection drag
    if (S.rectSelecting && S.isDragging && S.rectStart) {
      const rect = canvas.getBoundingClientRect();
      S.rectEnd = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      draw();
      return;
    }

    // SNAP indikátor – sledování pod kurzorem (i bez tažení).
    if (S.snapEnabled && !S.isDragging) {
      const prev = S._snap;
      const next = camSnap(e.clientX, e.clientY);
      const changed = (!!prev !== !!next) || (prev && next && (Math.abs(prev.x - next.x) > 1e-6 || Math.abs(prev.z - next.z) > 1e-6 || prev.type !== next.type));
      S._snap = next;
      if (changed) draw();
    }

    // Tažení koncového bodu konstrukční (nekonečné) čáry PO čáře — posun
    // se omezí na směr čáry, druhý konec drží směr; snap k průsečíkům.
    if (S.gcodeEditEnabled && S.isDragging && S._draggedGuideEnd) {
      const ge = S._draggedGuideEnd;
      const g = S.guideLines[ge.guideIdx];
      if (g) {
        const rect = canvas.getBoundingClientRect();
        const w = _gToWorld(e.clientX - rect.left, e.clientY - rect.top);
        const ax = ge.endIdx === 0 ? g.x2 : g.x1, az = ge.endIdx === 0 ? g.z2 : g.z1; // kotva = druhý konec
        let dx = (ge.endIdx === 0 ? g.x1 : g.x2) - ax, dz = (ge.endIdx === 0 ? g.z1 : g.z2) - az;
        const L = Math.hypot(dx, dz);
        if (L > 1e-9) {
          dx /= L; dz /= L;
          // projekce kurzoru na nekonečnou čáru
          const tproj = (w.x - ax) * dx + (w.z - az) * dz;
          let px = ax + tproj * dx, pz = az + tproj * dz;
          // snap na nejbližší průsečík čáry s geometrií (v dosahu)
          S._snap = null;
          if (S.snapEnabled) {
            const tolW = 12 / S.view.scale;
            let bestD = tolW, bestP = null;
            for (const h of lineGeometryHits(ax, az, dx, dz)) {
              const d = Math.hypot(h.x - px, h.z - pz);
              if (d < bestD) { bestD = d; bestP = h; }
            }
            if (bestP) { px = bestP.x; pz = bestP.z; S._snap = { x: px, z: pz, type: 'edge' }; }
          }
          if (ge.endIdx === 0) { g.x1 = px; g.z1 = pz; } else { g.x2 = px; g.z2 = pz; }
          draw();
        }
      }
      return;
    }

    // Úprava drah (✥ Dráhy) – tažení koncového bodu / úsečky + hover.
    if (S.gcodeEditEnabled) {
      const rect = canvas.getBoundingClientRect();
      const ensureHistory = () => {
        if (S._gdragNeedHistory) { pushHistory(); S._gdragNeedHistory = false; }
      };
      if (S.isDragging && S.draggedGNode) {
        ensureHistory();
        S._gcodeFocusLine = S.draggedGNode.lineIdx;   // skok kurzoru na řádek
        // snap k bodu/hraně; jinak úhlový snap (vodorovně/kolmo) vůči ref bodu
        const w = snapWorld(e.clientX, e.clientY, S.draggedGNode.refPoint);
        writeGLine(S.draggedGNode.lineIdx, w.x, w.z);
        return;
      }
      if (S.isDragging && S._draggedGSeg) {
        const seg = S._draggedGSeg;
        const w = _gToWorld(e.clientX - rect.left, e.clientY - rect.top);
        let dX = w.x - seg.startW.x, dZ = w.z - seg.startW.z;
        // Zamknutí na jednu osu (podle převažujícího směru tažení) — posun
        // úsečky jen v X nebo jen v Z, druhá souřadnice se nemění.
        if (!seg.lockAxis && Math.hypot(dX, dZ) > 0.15)
          seg.lockAxis = Math.abs(dX) >= Math.abs(dZ) ? 'x' : 'z';
        if (!seg.lockAxis) return;       // dokud se nerozhodne osa, nehýbej
        ensureHistory();
        S._gcodeFocusLine = seg.lineIdx;  // skok kurzoru na řádek
        if (seg.lockAxis === 'x') dZ = 0; else dX = 0;
        // Zapiš jen zamčenou osu (druhá = null → na řádku zůstává beze změny).
        const edits = [{ lineIdx: seg.lineIdx,
          wx: seg.lockAxis === 'x' ? seg.orig2.x + dX : null,
          wz: seg.lockAxis === 'z' ? seg.orig2.z + dZ : null }];
        if (seg.startIdx != null) edits.push({ lineIdx: seg.startIdx,
          wx: seg.lockAxis === 'x' ? seg.orig1.x + dX : null,
          wz: seg.lockAxis === 'z' ? seg.orig1.z + dZ : null });
        writeGLines(edits);
        return;
      }
      if (!S.isDragging) {
        const hn = getGNodeAt(e.clientX, e.clientY);
        // bod kontury má přednost před úsečkou dráhy (viz mousedown)
        const cptHover = !hn && S.pointDragEnabled && getAnyPointAt(e.clientX, e.clientY) !== null;
        const hs = (hn || cptHover) ? null : getGSegmentAt(e.clientX, e.clientY);
        const changed = ((S.hoverGNode && S.hoverGNode.lineIdx) || null) !== ((hn && hn.lineIdx) || null)
          || ((S.hoverGSeg && S.hoverGSeg.simIdx) || null) !== ((hs && hs.simIdx) || null);
        S.hoverGNode = hn; S.hoverGSeg = hs;
        if (hn || hs) {                    // dráha pod kurzorem → tažení dráhy
          canvas.style.cursor = 'move';
          if (changed) draw();
          return;
        }
        // žádná dráha pod kurzorem → spadne na hover bodů kontury níže
        if (changed) draw();
      }
    }

    // Hit-testing (hover/kurzor) JEN když netáhneme — během tažení se nad
    // ničím nepřejíždí, tak veškeré hledání bodů/úchopů/limitů přeskočíme.
    if (!S.isDragging) {
      const zHover = getZLimitAt(e.clientX, e.clientY);
      const stockHover = S.pointDragEnabled ? getStockHandleAt(e.clientX, e.clientY) : null;
      const pointHit = S.pointDragEnabled ? getAnyPointAt(e.clientX, e.clientY) : null;
      if (S.addPointMode) {
        const found = getAnyPointAt(e.clientX, e.clientY);
        canvas.style.cursor = found ? 'pointer'
          : (getGuideEndpointAt(e.clientX, e.clientY) || getArcSegmentAt(e.clientX, e.clientY)) ? 'pointer' : 'copy';
        const newId = found ? found.idx : null, newIsStock = !!(found && found.isStock);
        if (S.hoverPointId !== newId || S._hoverIsStock !== newIsStock) { S.hoverPointId = newId; S._hoverIsStock = newIsStock; draw(); }
        return;
      }
      if (zHover !== null) {
        canvas.style.cursor = S.params.machineStructure === 'carousel' ? 'ns-resize' : 'ew-resize';
        return;
      }
      const xHover = getXLimitAt(e.clientX, e.clientY);
      if (xHover !== null) {
        canvas.style.cursor = S.params.machineStructure === 'carousel' ? 'ew-resize' : 'ns-resize';
        return;
      }
      // Úchopy upichnutí (Dojezd X / Start X) — přednost, tažení jen v ose X.
      const poHover = S.pointDragEnabled ? getPartOffHandleAt(e.clientX, e.clientY) : null;
      if (poHover !== null) {
        canvas.style.cursor = S.params.machineStructure === 'carousel' ? 'ew-resize' : 'ns-resize';
        if (S._hoverPartOff !== poHover) { S._hoverPartOff = poHover; S.hoverPointId = null; S._hoverIsStock = false; _hoverContourSeg = null; draw(); }
        return;
      }
      if (S._hoverPartOff !== null) { S._hoverPartOff = null; draw(); }
      if (stockHover !== null) {
        canvas.style.cursor = 'move';
        if (S.hoverPointId !== stockHover || !S._hoverIsStock) { S.hoverPointId = stockHover; S._hoverIsStock = true; _hoverContourSeg = null; draw(); }
      } else if (pointHit !== null) {
        canvas.style.cursor = 'move';
        if (S.hoverPointId !== pointHit.idx || S._hoverIsStock !== pointHit.isStock) {
          S.hoverPointId = pointHit.idx; S._hoverIsStock = pointHit.isStock; _hoverContourSeg = null; draw();
        }
      } else {
        const segHit = S.pointDragEnabled ? getContourSegmentAt(e.clientX, e.clientY) : null;
        const prevSeg = _hoverContourSeg;
        const changed = (S.hoverPointId !== null) || (S._hoverIsStock)
          || (!!prevSeg !== !!segHit)
          || (prevSeg && segHit && (prevSeg.idx1 !== segHit.idx1 || prevSeg.idx2 !== segHit.idx2 || prevSeg.isStock !== segHit.isStock));
        S.hoverPointId = null; S._hoverIsStock = false; _hoverContourSeg = segHit;
        canvas.style.cursor = (S.pointDragEnabled && segHit !== null) ? 'move' : 'crosshair';
        if (changed) draw();
      }
      return;
    }
    const dx = e.clientX - lastMousePos.x;
    const dy = e.clientY - lastMousePos.y;
    lastMousePos = { x: e.clientX, y: e.clientY };
    if (S.draggedLimit) {
      const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
      const isX = S.draggedLimit in S.xLimits;
      const store = isX ? S.xLimits : S.zLimits;
      // Tažení se sčítá do NEZAOKROUHLENÉ hodnoty: jinak by se snap nedal
      // zase pustit (čára by se po přichycení posouvala od snapnuté polohy,
      // ne od místa, kam kurzor doopravdy odjel).
      if (S._limitDragRaw === null) S._limitDragRaw = parseFloat(store[S.draggedLimit]) || 0;
      S._limitDragRaw += isX
        // X-rozsah: tažení v ose X — soustruh dy, karusel dx
        ? (S.params.machineStructure === 'carousel' ? (hS * dx / S.view.scale) : (dy / (vS * S.view.scale)))
        // Z-rozsah: tažení v ose Z — soustruh dx, karusel vS*dy
        : (S.params.machineStructure === 'carousel' ? (vS * dy / S.view.scale) : (hS * dx / S.view.scale));
      const snapped = snapLimitValue(isX ? 'x' : 'z', S._limitDragRaw, e.clientX, e.clientY);
      store[S.draggedLimit] = snapped !== null ? snapped : Math.round(S._limitDragRaw * 100) / 100;
      scheduleFrame(draw);
      return;
    }
    if (_draggingPartOff) {
      // Tažení úchopu upichnutí — jen v ose X, nastaví Dojezd X / Start X.
      _applyPartOffHandle(_draggingPartOff, _partOffRadiusFromClient(e.clientX, e.clientY));
      lastMousePos = { x: e.clientX, y: e.clientY };
      scheduleFrame(draw);   // úsečka + úchopy sledují kurzor; dráhy se přegenerují po puštění
      return;
    }
    if (_draggingStock && S.draggedPointId !== null) {
      let rawDX, rawDZ;
      const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
      if (S.params.machineStructure === 'carousel') { rawDX = hS * dx / S.view.scale; rawDZ = vS * dy / S.view.scale; }
      else { rawDZ = hS * dx / S.view.scale; rawDX = vS * dy / S.view.scale; }
      if (S.draggedPointId === 0) {
        S.params.stockDiameter = Math.max(1, parseFloat(S.params.stockDiameter) + rawDX * 2);
        S.params.stockFace = Math.round((parseFloat(S.params.stockFace) + rawDZ) * 100) / 100;
      } else {
        S.params.stockDiameter = Math.max(1, parseFloat(S.params.stockDiameter) + rawDX * 2);
        S.params.stockLength = Math.max(1, Math.round((parseFloat(S.params.stockLength) - rawDZ) * 100) / 100);
      }
      S.params.stockDiameter = Math.round(S.params.stockDiameter * 100) / 100;
      // Během tažení jen lehký náhled (body + kontura) — plynulé i u složité
      // kontury. Plný přepočet drah proběhne po puštění (handleMouseUp); dráhy
      // se po dobu tažení skryjí a po puštění se zase ukážou.
      scheduleFrame(() => { S._cachedCalc = calculate(true); S._calcCacheKey = null; draw(); });
    } else if (S.draggedPointId !== null) {
      let dX_unit = 0, dZ_unit = 0;
      const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
      if (S.params.machineStructure === 'carousel') {
        dX_unit = hS * dx / S.view.scale; dZ_unit = vS * dy / S.view.scale;
      } else {
        dZ_unit = hS * dx / S.view.scale; dX_unit = vS * dy / S.view.scale;
      }
      if (S.params.mode === 'DIAMON') dX_unit *= 2;
      const list = _draggingStockPt ? S.stockPoints : S.contourPoints;

      // Multi-drag: if dragging a selected point, move all selected
      if (S.selectedPoints.size > 1 && S.selectedPoints.has(S.draggedPointId)) {
        S.snapLines = [];
        S.selectedPoints.forEach(idx => {
          const p = list[idx];
          if (p) { p.x = parseFloat(p.x) + dX_unit; p.z = parseFloat(p.z) + dZ_unit; }
        });
      } else {
        const pt = list[S.draggedPointId];
        pt.x = parseFloat(pt.x) + dX_unit;
        pt.z = parseFloat(pt.z) + dZ_unit;

        // Snap guides
        S.snapLines = [];
        const allAbs = resolvePointsToAbsolute(list);
        const dragAbs = allAbs[S.draggedPointId];
        if (dragAbs) {
          const isDia = S.params.mode === 'DIAMON';
          const dragWX = isDia ? dragAbs.xAbs / 2 : dragAbs.xAbs;
          const dragWZ = dragAbs.zAbs;
          const snapTol = 3 / S.view.scale;
          for (let i = 0; i < allAbs.length; i++) {
            if (i === S.draggedPointId) continue;
            const otherWX = isDia ? allAbs[i].xAbs / 2 : allAbs[i].xAbs;
            const otherWZ = allAbs[i].zAbs;
            if (Math.abs(dragWX - otherWX) < snapTol) {
              S.snapLines.push({ type: 'x', val: otherWX, from: Math.min(dragWZ, otherWZ), to: Math.max(dragWZ, otherWZ) });
              if (pt.mode === 'ABS') pt.x = isDia ? otherWX * 2 : otherWX;
            }
            if (Math.abs(dragWZ - otherWZ) < snapTol) {
              S.snapLines.push({ type: 'z', val: otherWZ, from: Math.min(dragWX, otherWX), to: Math.max(dragWX, otherWX) });
              if (pt.mode === 'ABS') pt.z = otherWZ;
            }
          }
        }
      }

      // Během tažení jen lehký náhled (body + kontura) — plynulé i u složité
      // kontury. Plný přepočet drah proběhne po puštění (handleMouseUp); dráhy
      // se po dobu tažení skryjí a po puštění se zase ukážou.
      scheduleFrame(() => { S._cachedCalc = calculate(true); S._calcCacheKey = null; draw(); });
    } else if (_draggedContourSeg !== null) {
      // Tažení celé úsečky: oba krajní body se posunou spolu, s zamčením na osu.
      const seg = _draggedContourSeg;
      let dX_unit = 0, dZ_unit = 0;
      const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
      if (S.params.machineStructure === 'carousel') { dX_unit = hS * dx / S.view.scale; dZ_unit = vS * dy / S.view.scale; }
      else { dZ_unit = hS * dx / S.view.scale; dX_unit = vS * dy / S.view.scale; }
      if (S.params.mode === 'DIAMON') dX_unit *= 2;
      // Zamknout na převažující osu po překročení prahu
      if (!seg.lockAxis && (Math.abs(dX_unit) + Math.abs(dZ_unit)) > 0.05) {
        seg.lockAxis = Math.abs(dX_unit) >= Math.abs(dZ_unit) ? 'x' : 'z';
      }
      if (seg.lockAxis === 'x') dZ_unit = 0; else if (seg.lockAxis === 'z') dX_unit = 0;
      const segList = seg.isStock ? S.stockPoints : S.contourPoints;
      const pt1 = segList[seg.idx1], pt2 = segList[seg.idx2];
      if (pt1) { pt1.x = parseFloat(pt1.x) + dX_unit; pt1.z = parseFloat(pt1.z) + dZ_unit; }
      // INC bod: pt1 se posunulo, pt2 sleduje automaticky (je relativní k pt1)
      if (pt2 && pt2.mode !== 'INC') { pt2.x = parseFloat(pt2.x) + dX_unit; pt2.z = parseFloat(pt2.z) + dZ_unit; }
      scheduleFrame(() => { S._cachedCalc = calculate(true); S._calcCacheKey = null; draw(); });
    } else {
      S.view.panX += dx; S.view.panY += dy;
      scheduleFrame(draw);   // posun pohledu: sloučit překreslení do snímku
    }
  });

  const handleMouseUp = (e) => {
    if (_panelPending) {
      _panelPending = false;
      const dist = e ? Math.hypot(e.clientX - _mdX, e.clientY - _mdY) : 999;
      if (dist < 6 && codePanelMode === 'closed') setCodePanelMode('open');
    }
    // Dokončit případný odložený snímek z tažení SYNCHRONNĚ, aby níže navazující
    // přepočet/saveState/render pracovaly s finálním stavem.
    flushFrame();
    // Rect selection completion
    if (S.rectSelecting) {
      if (S.rectStart && S.rectEnd) {
        S.rectSelecting = false;
        const calc = S._cachedCalc;
        if (calc) {
          const pts = S.editMode === 'contour' ? calc.worldPoints : calc.stockWorldPoints;
          const prms = S.params;
          const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
          const _toScreen = (x, z) => {
            if (prms.machineStructure === 'carousel') return { x: S.view.panX + hS * x * S.view.scale, y: S.view.panY + vS * z * S.view.scale };
            return { x: S.view.panX + hS * z * S.view.scale, y: S.view.panY + vS * x * S.view.scale };
          };
          const minX = Math.min(S.rectStart.x, S.rectEnd.x);
          const maxX = Math.max(S.rectStart.x, S.rectEnd.x);
          const minY = Math.min(S.rectStart.y, S.rectEnd.y);
          const maxY = Math.max(S.rectStart.y, S.rectEnd.y);
          S.selectedPoints.clear();
          if (pts) {
            pts.forEach((p, i) => {
              const sp = _toScreen(p.xReal, p.zReal);
              if (sp.x >= minX && sp.x <= maxX && sp.y >= minY && sp.y <= maxY) {
                S.selectedPoints.add(i);
              }
            });
          }
        }
        S.rectStart = null;
        S.rectEnd = null;
        canvas.style.cursor = 'crosshair';
        S.isDragging = false;
        draw();
        // Open offset dialog if points selected
        if (S.selectedPoints.size > 0) {
          camOffsetDialog(S.selectedPoints.size).then(result => {
            if (result && (result.dx !== 0 || result.dz !== 0)) {
              pushHistory();
              const list = S.editMode === 'contour' ? S.contourPoints : S.stockPoints;
              S.selectedPoints.forEach(idx => {
                const pt = list[idx];
                if (pt) {
                  pt.x = parseFloat(pt.x) + result.dx;
                  pt.z = parseFloat(pt.z) + result.dz;
                }
              });
              S.selectedPoints.clear();
              fullUpdate();
            } else {
              S.selectedPoints.clear();
              draw();
            }
          });
        }
      } else {
        // Incomplete rect selection (mouseleave/cancel) — reset
        S.rectSelecting = false;
        S.rectStart = null;
        S.rectEnd = null;
        S.selectedPoints.clear();
        S.isDragging = false;
        canvas.style.cursor = 'crosshair';
        draw();
      }
      return;
    }
    // Clear snap lines on release
    S.snapLines = [];
    if (_draggingPartOff) {
      // Puštění úchopu upichnutí → přegenerovat dráhy z nového Dojezd X / Start X
      // (a obnovit panel s hodnotami polí).
      _draggingPartOff = null; S.isDragging = false;
      applyChange();
      return;
    }
    if (S.isDragging && (S.draggedPointId !== null || _draggingStock || _draggedContourSeg !== null)) {
      // Po puštění TEĎ jednou přepočítat kompletní dráhy z nové polohy bodů
      // (během tažení běžel jen lehký náhled) → dráhy se zase ukážou.
      recalcNow();
      S.generatedCode = generateGCode(S._cachedCalc);
      saveState(); renderCodeArea(); renderTab();
    }
    if (S.draggedLimit) {
      // Po přetažení čelisti/koníka přepočítat dráhy (chuck/tail ořezává cuts).
      // Aktivní rozsah 📐 ořezává dráhy stejně, takže i on musí přepočítat —
      // jinak čára skočí jinam, ale dráhy zůstanou podle staré polohy.
      const k = S.draggedLimit;
      const needRecalc = k === 'chuck' || k === 'tail'
        || ((k === 'rangeStart' || k === 'rangeEnd') && S.zLimits.rangeActive)
        || ((k === 'rangeXMin' || k === 'rangeXMax') && xRangeAnyOn(S.xLimits));
      saveState(); renderTab();
      if (needRecalc) fullUpdate();
    }
    // Dokončení úpravy drahy / konstrukční čáry – uložit a obnovit panely.
    if (S.draggedGNode || S._draggedGSeg || S._draggedGuideEnd) {
      // Po dotažení dráhy obnovit G-kód panel (během tažení se kvůli výkonu
      // nepřekresloval). flushFrame() výše už přepočítal _cachedCalc/manualGCode.
      renderCodeArea();
      saveState(); renderTab(); updateUndoRedoBtns();
    }
    S.isDragging = false; S.draggedPointId = null; _draggingStock = false; _draggingStockPt = false;
    _draggingPartOff = null;
    _draggedContourSeg = null; S.draggedLimit = null; S._limitDragRaw = null;
    S.draggedGNode = null; S._draggedGSeg = null; S._gdragNeedHistory = false;
    S._draggedGuideEnd = null; S._snap = null;
    S._angleSnapLine = null;
    draw();
  };
  canvasWrap.addEventListener('mouseup', handleMouseUp);
  canvasWrap.addEventListener('mouseleave', handleMouseUp);

  // ── TOUCH ──
  // ── Precision crosshair (mobil) ──
  // Long-press → křížek s offsetem NAD prstem + souřadnice (jako v CAD).
  // Jednoprstý touch se posílá přes SYNTETICKÉ myší události na (precision =
  // offsetnuté) pozici, takže funguje veškerá myší logika (tažení uzlů, drah,
  // konstrukčních čar, prodloužit/oříznout) a dá se přesně mířit bez posunu
  // pozadí. Pinch (2 prsty) a trasování/výběr zůstávají beze změny.
  const CAM_CH_OFFSET = -60;        // px – křížek nad prstem (blíž ke kolečku/prstu)
  const CAM_LONGPRESS_MS = 320;
  const CAM_MOVE_THRESH = 10;
  const precisionEl = document.getElementById('precisionCrosshair');
  const precisionLabel = precisionEl ? precisionEl.querySelector('.ch-label') : null;
  let camTouch = null;              // {x0,y0,lastX,lastY,started,moved}
  let camPressTimer = null;
  const _camDispatchMouse = (type, cx, cy) => {
    S._camDispatching = true;
    canvasWrap.dispatchEvent(new MouseEvent(type, { clientX: cx, clientY: cy, bubbles: true }));
    S._camDispatching = false;
  };
  // Křížek nad prstem. allowSnap=true (polohovací režim) → přichytí se k
  // bodům/hranám kontury/offsetu/konstr. čar (jako v CAD): křížek skočí na
  // snap bod, ukáže snapnuté souřadnice a uloží cílovou pozici pro akci.
  const _camShowCrosshair = (fingerX, fingerY, allowSnap) => {
    if (!precisionEl) return;
    const rect = canvas.getBoundingClientRect();
    const chX = fingerX, chY = fingerY + CAM_CH_OFFSET;   // poloha křížku (client)
    let tx = chX, ty = chY, snap = null;
    if (allowSnap && S.snapEnabled && !S.simRunning) {
      snap = camSnap(chX, chY);                            // snap k bodu/hraně
    }
    if (allowSnap) {
      // Aktualizovat snap indikátor + překreslit canvas (jako desktop hover).
      const prev = S._snap;
      S._snap = snap;
      if (snap) { const ss = _gToScreen(snap.x, snap.z); tx = rect.left + ss.x; ty = rect.top + ss.y; }
      const changed = (!!prev !== !!snap)
        || (prev && snap && (Math.abs(prev.x - snap.x) > 1e-6 || Math.abs(prev.z - snap.z) > 1e-6 || prev.type !== snap.type));
      if (changed) draw();
    }
    S._camTargetClient = { x: tx, y: ty };                 // sem se provede akce při puštění
    precisionEl.style.left = tx + 'px';
    precisionEl.style.top = ty + 'px';
    precisionEl.style.display = 'block';
    if (precisionLabel) {
      let wx, wz;
      if (S._snap) { wx = S._snap.x; wz = S._snap.z; }
      else { const w = _gToWorld(tx - rect.left, ty - rect.top); wx = w.x; wz = w.z; }
      const xDisp = S.params.mode === 'DIAMON' ? wx * 2 : wx;
      precisionLabel.textContent = `X${xDisp.toFixed(2)} Z${wz.toFixed(2)}`;
    }
  };
  const _camHideCrosshair = () => { if (precisionEl) precisionEl.style.display = 'none'; };
  const _camActionMode = () => S.addPointMode || S.delPointMode || S.gExtendMode || S.gTrimMode;
  // Je na (client) pozici tažitelný prvek? (bod kontury / uzel dráhy)
  const _camDraggableAt = (cx, cy) =>
    (S.pointDragEnabled && getPointAt(cx, cy) !== null) ||
    (S.gcodeEditEnabled && getGNodeAt(cx, cy) !== null);
  const _camStartPrecision = () => {
    if (!camTouch) return;
    S._camPrecision = true;
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch (_) { /* ignore */ } }
    const fx = camTouch.lastX, fy = camTouch.lastY;
    // Dvoukrokové uchopení: pokud byl minulým křížkem označen bod/uzel
    // (S._camMarked, ve světě → přežije zoom/pan), uchop ho teď a táhni
    // dalším pohybem prstu.
    if (S._camMarked && !_camActionMode()) {
      const rect = canvas.getBoundingClientRect();
      const ss = _gToScreen(S._camMarked.x, S._camMarked.z);
      _camDispatchMouse('mousedown', rect.left + ss.x, rect.top + ss.y);
      const got = !!(S.draggedGNode || S.draggedPointId !== null || S._draggedGSeg || S._draggedGuideEnd || _draggingStock);
      S._camMarked = null;
      if (got) {
        // Uchopený prvek se PŘESUNE na křížek a dál ho sleduje (absolutně),
        // ne relativní posun. lastMousePos zůstává na bodu (z grab mousedownu),
        // takže iniciální mousemove na pozici křížku ho tam rovnou přitáhne
        // (delta = křížek − bod); další pohyb prstu už ho jen veze.
        camTouch.posMode = false;
        _camShowCrosshair(fx, fy, false);
        _camDispatchMouse('mousemove', fx, fy + CAM_CH_OFFSET);
        draw();
        return;
      }
      // Označený prvek už neexistuje (přepočet) → pokračuj normálně.
    }
    if (_camActionMode()) {
      // Akční režim (+/−/Prodl/Ořez): křížek je jen polohovací kurzor,
      // akce se provede až při puštění na přesné pozici.
      camTouch.posMode = true;
    } else {
      // Zkus uchopit prvek pod křížkem (uzel/úsečka/konstr. čára/bod).
      _camDispatchMouse('mousedown', fx, fy + CAM_CH_OFFSET);
      const grabbed = !!(S.draggedGNode || S._draggedGSeg || S._draggedGuideEnd || S.draggedPointId !== null || _draggingStock);
      if (!grabbed) { S.isDragging = false; camTouch.posMode = true; }  // nic pod křížkem → NEpanovat
      else camTouch.posMode = false;
    }
    _camShowCrosshair(fx, fy, camTouch.posMode);   // polohovací režim → snap
  };
  canvasWrap.addEventListener('touchstart', e => {
    if (e.target.closest('.cam-sim-trace-confirm, .cam-sim-trace-cancel, .cam-sim-trace-auto, .cam-sim-trace-stepfwd, .cam-sim-trace-stepback, .cam-sim-trace-freeclick, .cam-sim-trace-stock')) return;
    if (e.touches.length === 1) {
      // Trasování profilu – tap přidá bod JEN při snapu na bod/průsečík;
      // mimo snap propadne na jednoprstou logiku níže (posun pohledu).
      if (S.profileTraceMode) {
        const tt = e.touches[0];
        const { wx, wz, snapped, insertGuideIdx } = _traceWorldFromClient(tt.clientX, tt.clientY);
        if (snapped) {
          _addTracePoint(wx, wz, insertGuideIdx);
          return;
        }
      }
      // Double-tap detection for rect selection
      const now = Date.now();
      if (now - S._lastTapTime < 350 && S.pointDragEnabled && !S.simRunning) {
        S.rectSelecting = true;
        S.selectedPoints.clear();
        S.snapLines = [];
        draw();
        S._lastTapTime = 0;
        return;
      }
      S._lastTapTime = now;

      // Rect selection on touch
      if (S.rectSelecting) {
        const rect = canvas.getBoundingClientRect();
        S.rectStart = { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
        S.rectEnd = null;
        S.isDragging = true;
        lastMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        return;
      }

      // Jednoprstý touch: odložíme rozhodnutí (tap / tažení / long-press
      // precision) a vše poženeme přes syntetické myší události — viz
      // touchmove/touchend. Long-press → precision křížek nad prstem.
      const t = e.touches[0];
      camTouch = { x0: t.clientX, y0: t.clientY, lastX: t.clientX, lastY: t.clientY, started: false, moved: false };
      S._camPrecision = false;
      clearTimeout(camPressTimer);
      camPressTimer = setTimeout(() => { camPressTimer = null; if (camTouch && !camTouch.moved) _camStartPrecision(); }, CAM_LONGPRESS_MS);
    } else if (e.touches.length === 2) {
      // Druhý prst → zrušit jednoprstou interakci/precision, jen pinch.
      clearTimeout(camPressTimer); camPressTimer = null;
      if (camTouch && camTouch.started) _camDispatchMouse('mouseup', camTouch.lastX, camTouch.lastY);
      if (S._camPrecision) _camHideCrosshair();
      S._camPrecision = false; camTouch = null;
      lastPinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    }
  }, { passive: true });

  canvasWrap.addEventListener('touchmove', e => {
    // Precision / odložená jednoprstá interakce → syntetické myší události.
    if (camTouch && e.touches.length === 1) {
      const t = e.touches[0];
      camTouch.lastX = t.clientX; camTouch.lastY = t.clientY;
      if (S._camPrecision) {
        // posMode = jen polohovací kurzor (žádný pan); jinak táhne uchopený prvek
        if (!camTouch.posMode) _camDispatchMouse('mousemove', t.clientX, t.clientY + CAM_CH_OFFSET);
        _camShowCrosshair(t.clientX, t.clientY, camTouch.posMode);   // polohovací režim → snap
        return;
      }
      if (!camTouch.started) {
        if (Math.hypot(t.clientX - camTouch.x0, t.clientY - camTouch.y0) > CAM_MOVE_THRESH) {
          clearTimeout(camPressTimer); camPressTimer = null;
          camTouch.moved = true; camTouch.started = true;
          _camDispatchMouse('mousedown', camTouch.x0, camTouch.y0);   // začátek tažení/posunu
          _camDispatchMouse('mousemove', t.clientX, t.clientY);
        }
        return;
      }
      _camDispatchMouse('mousemove', t.clientX, t.clientY);
      return;
    }
    if (S.addPointMode) return;

    // Rect selection drag on touch
    if (S.rectSelecting && S.isDragging && S.rectStart && e.touches.length === 1) {
      const rect = canvas.getBoundingClientRect();
      S.rectEnd = { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
      draw();
      return;
    }

    if (S.isDragging && e.touches.length === 1) {
      const t = e.touches[0];
      const dx = t.clientX - lastMousePos.x;
      const dy = t.clientY - lastMousePos.y;
      lastMousePos = { x: t.clientX, y: t.clientY };
      if (_draggingStock && S.draggedPointId !== null) {
        let rawDX, rawDZ;
        const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
        if (S.params.machineStructure === 'carousel') { rawDX = hS * dx / S.view.scale; rawDZ = vS * dy / S.view.scale; }
        else { rawDZ = hS * dx / S.view.scale; rawDX = vS * dy / S.view.scale; }
        if (S.draggedPointId === 0) {
          S.params.stockDiameter = Math.max(1, parseFloat(S.params.stockDiameter) + rawDX * 2);
          S.params.stockFace = Math.round((parseFloat(S.params.stockFace) + rawDZ) * 100) / 100;
        } else {
          S.params.stockDiameter = Math.max(1, parseFloat(S.params.stockDiameter) + rawDX * 2);
          S.params.stockLength = Math.max(1, Math.round((parseFloat(S.params.stockLength) - rawDZ) * 100) / 100);
        }
        S.params.stockDiameter = Math.round(S.params.stockDiameter * 100) / 100;
        // Tažení (touch): jen lehký náhled, plný přepočet až po puštění.
        scheduleFrame(() => { S._cachedCalc = calculate(true); S._calcCacheKey = null; draw(); });
      } else if (S.draggedPointId !== null) {
        let dX_unit = 0, dZ_unit = 0;
        const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
        if (S.params.machineStructure === 'carousel') {
          dX_unit = hS * dx / S.view.scale; dZ_unit = vS * dy / S.view.scale;
        } else {
          dZ_unit = hS * dx / S.view.scale; dX_unit = vS * dy / S.view.scale;
        }
        if (S.params.mode === 'DIAMON') dX_unit *= 2;
        const list = S.editMode === 'contour' ? S.contourPoints : S.stockPoints;

        // Multi-drag on touch
        if (S.selectedPoints.size > 1 && S.selectedPoints.has(S.draggedPointId)) {
          S.snapLines = [];
          S.selectedPoints.forEach(idx => {
            const p = list[idx];
            if (p) { p.x = parseFloat(p.x) + dX_unit; p.z = parseFloat(p.z) + dZ_unit; }
          });
        } else {
          const pt = list[S.draggedPointId];
          pt.x = parseFloat(pt.x) + dX_unit;
          pt.z = parseFloat(pt.z) + dZ_unit;

          // Snap guides on touch
          S.snapLines = [];
          const allAbs = resolvePointsToAbsolute(list);
          const dragAbs = allAbs[S.draggedPointId];
          if (dragAbs) {
            const isDia = S.params.mode === 'DIAMON';
            const dragWX = isDia ? dragAbs.xAbs / 2 : dragAbs.xAbs;
            const dragWZ = dragAbs.zAbs;
            const snapTol = 3 / S.view.scale;
            for (let i = 0; i < allAbs.length; i++) {
              if (i === S.draggedPointId) continue;
              const otherWX = isDia ? allAbs[i].xAbs / 2 : allAbs[i].xAbs;
              const otherWZ = allAbs[i].zAbs;
              if (Math.abs(dragWX - otherWX) < snapTol) {
                S.snapLines.push({ type: 'x', val: otherWX, from: Math.min(dragWZ, otherWZ), to: Math.max(dragWZ, otherWZ) });
                if (pt.mode === 'ABS') pt.x = isDia ? otherWX * 2 : otherWX;
              }
              if (Math.abs(dragWZ - otherWZ) < snapTol) {
                S.snapLines.push({ type: 'z', val: otherWZ, from: Math.min(dragWX, otherWX), to: Math.max(dragWX, otherWX) });
                if (pt.mode === 'ABS') pt.z = otherWZ;
              }
            }
          }
        }

        // Tažení (touch): jen lehký náhled, plný přepočet až po puštění.
        scheduleFrame(() => { S._cachedCalc = calculate(true); S._calcCacheKey = null; draw(); });
      } else {
        S.view.panX += dx; S.view.panY += dy;
        scheduleFrame(draw);   // posun pohledu (touch): sloučit do snímku
      }
    }
    if (e.touches.length === 2 && lastPinchDist) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const zoomFactor = dist / lastPinchDist;
      const rect = canvas.getBoundingClientRect();
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
      const oldScale = S.view.scale;
      const newScale = Math.max(0.2, Math.min(oldScale * zoomFactor, 200));
      S.view.panX = mx - (mx - S.view.panX) * (newScale / oldScale);
      S.view.panY = my - (my - S.view.panY) * (newScale / oldScale);
      S.view.scale = newScale;
      lastPinchDist = dist;
      scheduleFrame(draw);   // pinch zoom: sloučit překreslení do snímku
    }
  }, { passive: true });

  canvasWrap.addEventListener('touchend', () => {
    // Rect selection completion on touch
    if (S.rectSelecting && S.rectStart && S.rectEnd) {
      handleMouseUp();
      lastPinchDist = null; camTouch = null;
      return;
    }
    // Jednoprstá interakce přes syntetické myší události (tap / tažení /
    // precision). Po dokončení blokujeme „ghost" myší události z prohlížeče.
    if (camTouch) {
      clearTimeout(camPressTimer); camPressTimer = null;
      const fx = camTouch.lastX, fy = camTouch.lastY;
      if (S._camPrecision) {
        if (camTouch.posMode) {
          // Polohovací kurzor: akci provedeme až teď, na PŘESNÉ pozici křížku
          // – tj. na snapnutém bodě/hraně, pokud snap chytil (S._camTargetClient).
          const tc = S._camTargetClient || { x: fx, y: fy + CAM_CH_OFFSET };
          if (!_camActionMode() && S._snap && _camDraggableAt(tc.x, tc.y)) {
            // Dvoukrokové uchopení: snapnutý bod/uzel jen OZNAČ (ve světě);
            // dalším podržením se uchopí a táhne (viz _camStartPrecision).
            S._camMarked = { x: S._snap.x, z: S._snap.z };
            showToast('Označeno – podrž znovu a táhni');
            draw();
          } else {
            _camDispatchMouse('mousedown', tc.x, tc.y);
            _camDispatchMouse('mouseup', tc.x, tc.y);
          }
        } else {
          _camDispatchMouse('mouseup', fx, fy + CAM_CH_OFFSET);   // dokonči tažení prvku
        }
        _camHideCrosshair(); S._camPrecision = false;
      } else if (camTouch.started) {
        _camDispatchMouse('mouseup', fx, fy);
      } else if (S._camMarked) {
        // Čekalo se na uchopení označeného bodu, ale přišel krátký tap →
        // zrušit označení (uživatel si to rozmyslel).
        S._camMarked = null; draw();
      } else {
        // Krátký tap (bez pohybu, bez long-pressu) → klik na (raw) pozici:
        // tap akce (přidat/smazat/prodloužit/oříznout) + uchopení/uvolnění.
        _camDispatchMouse('mousedown', camTouch.x0, camTouch.y0);
        _camDispatchMouse('mouseup', camTouch.x0, camTouch.y0);
      }
      S._camGhostUntil = Date.now() + 700;
      camTouch = null; lastPinchDist = null;
      return;
    }
    flushFrame();   // dokončit odložený snímek z tažení před uložením stavu
    S.snapLines = [];
    if (S.isDragging && (S.draggedPointId !== null || _draggingStock)) {
      // Po puštění TEĎ jednou přepočítat kompletní dráhy z nové polohy bodů
      // (během tažení běžel jen lehký náhled) → dráhy se zase ukážou.
      recalcNow();
      S.generatedCode = generateGCode(S._cachedCalc);
      saveState(); renderCodeArea(); renderTab();
    }
    if (S.draggedLimit) {
      // Po přetažení čelisti/koníka přepočítat dráhy (chuck/tail ořezává cuts).
      // Aktivní rozsah 📐 ořezává dráhy stejně, takže i on musí přepočítat —
      // jinak čára skočí jinam, ale dráhy zůstanou podle staré polohy.
      const k = S.draggedLimit;
      const needRecalc = k === 'chuck' || k === 'tail'
        || ((k === 'rangeStart' || k === 'rangeEnd') && S.zLimits.rangeActive)
        || ((k === 'rangeXMin' || k === 'rangeXMax') && xRangeAnyOn(S.xLimits));
      saveState(); renderTab();
      if (needRecalc) fullUpdate();
    }
    S.isDragging = false; S.draggedPointId = null; _draggingStock = false; S.draggedLimit = null; lastPinchDist = null;
    S._limitDragRaw = null; S._snap = null;
    draw();
  });

  // ── RESIZE OBSERVER ──
  // Otočení mobilu (výška ↔ šířka) → díl znovu vycentrovat (přání uživatele
  // 1. 10. 2026). Hned + ještě chvíli při dalších změnách velikosti plátna:
  // prohlížeč po otočení dorovnává lištu adresy a dvh až o snímek později.
  let _refitUntil = 0;
  const orientMq = window.matchMedia('(orientation: portrait)');
  const onOrientation = () => {
    if (!isMobileView()) return;
    _refitUntil = performance.now() + 600;
    fitView();
  };
  orientMq.addEventListener('change', onOrientation);
  const resizeObs = new ResizeObserver(() => {
    const cw = canvasWrap.clientWidth, ch = canvasWrap.clientHeight;
    if (cw > 0 && ch > 0 && (canvas.width !== cw || canvas.height !== ch)) {
      canvas.width = cw; canvas.height = ch;
    }
    if (performance.now() < _refitUntil) fitView();
    else draw();
  });
  resizeObs.observe(canvasWrap);

  // ── CLEANUP on overlay removal ──
  const cleanupObs = new MutationObserver((_, obs) => {
    if (!document.body.contains(overlay)) {
      resizeObs.disconnect(); obs.disconnect();
      orientMq.removeEventListener('change', onOrientation);
      document.removeEventListener('keydown', handleKeyDown);
      if (S._animId) cancelAnimationFrame(S._animId);
      S.simRunning = false;
    }
  });
  cleanupObs.observe(document.body, { childList: true });

  // ── INITIAL SETUP ──
  canvas.width = canvasWrap.clientWidth;
  canvas.height = canvasWrap.clientHeight;
  if (_importedContour) {
    // Auto-fit cylinder-stock parametrů k importované kontuře (Diameter/Length/Face).
    // Tyto hodnoty pouze nastavují velikost defaultního válcového polotovaru —
    // pokud už máme tvarový polotovar (z G-kódu nebo z canvas), nepřepisujeme ho.
    const absPts = resolvePointsToAbsolute(S.contourPoints);
    if (absPts.length > 0) {
      let minZ = Infinity, maxZ = -Infinity, maxD = 0;
      absPts.forEach(p => {
        const x = S.params.mode === 'DIAMON' ? p.xAbs : p.xAbs * 2;
        if (Math.abs(x) > maxD) maxD = Math.abs(x);
        if (p.zAbs < minZ) minZ = p.zAbs;
        if (p.zAbs > maxZ) maxZ = p.zAbs;
      });
      const margin = parseFloat(S.params.stockMargin) || 5;
      S.params.stockDiameter = Math.ceil(maxD + margin * 2);
      S.params.stockLength = Math.ceil(Math.abs(minZ) + margin);
      // Čelo válce musí pokrýt i konturu kreslenou v +Z (čelo dílu na
      // Z=maxZ, ne na Z0) — jinak by polotovar ležel mimo součást.
      S.params.stockFace = Math.max(2, Math.ceil(maxZ) + 2);
    }
    // Defaultní casting-stock vygeneruj jen pokud žádný (ani G-kódový, ani canvas) není.
    if (!_importedStockFromGCode && S.stockPoints.length === 0) {
      generateDefaultStock();
    }
  }
  fullUpdate();
  requestAnimationFrame(() => fitView());
  if (_partsCollapsedByEditor) {
    showToast('Program upravený v CAM Editoru se převzal jako celek — rozdělení na části se zrušilo.', 6000);
  } else if (_staleProgramDropped) {
    showToast('Výkres z CAD se změnil — dráhy původního výkresu se zahodily a vygenerovaly se nové.', 5000);
  } else if (_staleProgramKeptEdited) {
    showToast('Výkres z CAD se změnil, ale dráhy byly ručně upravené — zůstaly původní. Nové vygenerujete tlačítkem „🔄 Dráhy".', 8000);
  } else if (_partsContourChanged) {
    showToast(`Kontura se od vytvoření částí (${S.opParts.length}) změnila — polotovary jednotlivých operací nemusí sedět, přegenerujte dráhy tlačítkem „🔄 Dráhy".`, 8000);
  } else if (partsActive()) {
    showToast(`Program má ${S.opParts.length} částí — aktivní je ${S.activePart + 1}. „${S.opParts[S.activePart].name}"`, 4000);
  }
  if (typeof window !== 'undefined') window.__camDebug = { S, calculate, camRayIntersection, fullUpdate, getArcParams, getNormal, vecAngle, normalizeAngle, getToolClearanceRange, segInterferesWithTool, isAngleBetween, intersectLineCircle };
  // Háček pro testy UI (tests/helpers/simUi.mjs): stav + zavření bez lovení v DOM.
  return { S, close: () => overlay.remove(), draw };
}
