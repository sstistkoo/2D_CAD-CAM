// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Lišta nástrojů: [data-tool], setTool, hinty         ║
// ╚══════════════════════════════════════════════════════════════╝

// Vyňato z js/ui.js beze změny (16. 10. 2026, docs/plan-refaktoringu-ui.md,
// Fáze 3); jediné úpravy jsou cesty dynamických importů a typu v JSDoc
// (o složku výš). Kód, který běžel při načtení (Přídavek, [data-tool],
// obnovení Typu čáry), je v initToolbar() — volá ji js/ui.js na původním
// místě (pořadí listenerů). Kód aplikace importuje jen z js/ui.js (setTool,
// setHint, resetHint, …), nikdy z js/ui/* napřímo.

import { state, showToast, pushUndo, resetDrawingState } from '../state.js';
import { toolLabel } from '../utils.js';
import { renderAll } from '../render.js';
import { drawCanvas } from '../canvas.js';
import { bridge } from '../bridge.js';
import { addObject } from '../objects.js';
import { showFilletChamferDialog } from '../dialogs/objectDialogs.js';
import { openLineStyleDialog } from '../dialogs/lineStyleDialog.js';
import { loadLineStylePref, refreshLineStyleBtn, activeLineStyle } from '../lineStyles.js';

/** Listenery Přídavku (př/pl) a tlačítek [data-tool] + obnovení Typu čáry (při načtení — volá js/ui.js na původním místě). */
export function initToolbar() {
  // ── Přídavek na plochu (př/pl) – modal pro offset / válec ──
  const btnAllowance = document.getElementById("btnAllowance");
  if (btnAllowance) {
    btnAllowance.addEventListener("click", async () => {
      const [{ showStockDialog }, stockTools] = await Promise.all([
        import('../dialogs/stockDialog.js'),
        import('../stockTools.js'),
      ]);
      let defaults = {};
      try {
        const raw = localStorage.getItem('skica-stock-dialog');
        if (raw) defaults = JSON.parse(raw) || {};
      } catch (_) { /* ignore */ }

      showStockDialog((result) => {
        if (!result) return;
        try {
          const persist = { ...defaults };
          if (result.mode === 'auto') {
            persist.allowance = result.allowance;
            persist.chamfer = result.chamfer;
            persist.fillet = result.fillet;
          } else if (result.mode === 'cylinder') {
            persist.allowanceX = result.allowanceX;
            persist.allowanceZ = result.allowanceZ;
          }
          persist.target = result.target;
          localStorage.setItem('skica-stock-dialog', JSON.stringify(persist));
        } catch (_) { /* ignore */ }

        // result.target: 'stock' (polotovar – po peci, isStock=true)
        //              | 'contour' (kontura – před peci, normální vrstva)
        const asContour = result.target === 'contour';
        if (result.mode === 'auto') {
          stockTools.generateStockFromAllowance({
            allowance: result.allowance,
            chamfer: result.chamfer,
            fillet: result.fillet,
            asContour,
          });
        } else if (result.mode === 'cylinder') {
          stockTools.generateCylinderStock({
            allowanceX: result.allowanceX,
            allowanceZ: result.allowanceZ,
            asContour,
          });
        }
      }, defaults);
    });
  }

  // ── Toolbar ──
  document.querySelectorAll("[data-tool]").forEach((btn) => {
    btn.addEventListener("click", () => {
      // Typ čáry: klik vždy otevře dialog s výběrem typu čáry a barvy –
      // i když nástroj právě kreslí (pak dialog nabídne i „Vypnout").
      // Volba pak platí pro VŠECHNO další kreslení (úsečka, kružnice, oblouk,
      // obdélník, kontura) – dokud se nevypne tlačítkem „Vypnout".
      if (btn.dataset.tool === 'constr') {
        const prevTool = state.tool;
        const drawTools = ['line', 'circle', 'arc', 'rect', 'polyline', 'pencil'];
        openLineStyleDialog({
          active: state.lineStyleActive,
          onApply: () => {
            state.lineStyleActive = true;
            setTool(drawTools.includes(prevTool) ? prevTool : 'constr');
          },
          onDeactivate: () => {
            state.lineStyleActive = false;
            setTool('select');
          },
        });
        return;
      }
      // Opětovný klik na již aktivní (modální) nástroj → deaktivovat, zpět na Výběr.
      // Netýká se Výběru (má vlastní chování) ani dialogových/akčních tlačítek,
      // protože ta nenechávají state.tool nastavený na svou hodnotu.
      if (btn.dataset.tool === state.tool && state.tool !== 'select') {
        setTool('select');
        return;
      }
      // Deaktivovat všechna tool-tlačítka – setTool() nebo bridge funkce je znovu aktivují
      document.querySelectorAll("[data-tool]").forEach(b => b.classList.remove("active"));
      // Měření: pokud je výběr → okamžitě změřit
      if (btn.dataset.tool === 'measure' && bridge.measureSelection && bridge.measureSelection()) return;
      // Kóta: pokud je výběr → okamžitě přidat kóty
      if (btn.dataset.tool === 'dimension' && bridge.dimensionFromSelection && bridge.dimensionFromSelection()) return;
      // Tečna: pokud je výběr → okamžitě provést
      if (btn.dataset.tool === 'tangent' && bridge.tangentFromSelection && bridge.tangentFromSelection()) return;
      // Offset: pokud je výběr → okamžitě provést
      if (btn.dataset.tool === 'offset' && bridge.offsetFromSelection && bridge.offsetFromSelection()) return;
      // Oříznutí: pokud je výběr → okamžitě provést
      if (btn.dataset.tool === 'trim' && bridge.trimFromSelection && bridge.trimFromSelection()) return;
      // Prodloužení: pokud je výběr → okamžitě provést
      if (btn.dataset.tool === 'extend' && bridge.extendFromSelection && bridge.extendFromSelection()) return;
      // Závit: pokud je vybraná vodorovná úsečka → rovnou otevřít dialog
      if (btn.dataset.tool === 'thread' && bridge.threadFromSelection && bridge.threadFromSelection()) return;
      // Kolmost: pokud je výběr → okamžitě provést
      if (btn.dataset.tool === 'perp' && bridge.perpFromSelection && bridge.perpFromSelection()) return;
      // Vodorovnost: pokud je výběr → okamžitě provést
      if (btn.dataset.tool === 'horizontal' && bridge.horizontalFromSelection && bridge.horizontalFromSelection()) return;
      // Rovnoběžka: pokud je výběr → okamžitě provést
      if (btn.dataset.tool === 'parallel' && bridge.parallelFromSelection && bridge.parallelFromSelection()) return;
      // Středová značka: pokud je výběr → okamžitě provést
      if (btn.dataset.tool === 'centerMark' && bridge.centerMarkFromSelection && bridge.centerMarkFromSelection()) return;
      // Škálování: pokud je výběr → okamžitě provést
      if (btn.dataset.tool === 'scale' && bridge.scaleFromSelection && bridge.scaleFromSelection()) return;
      // Zaoblení/Zkosení sdružené: pokud je výběr → okamžitě provést, jinak dialog hned při kliku
      if (btn.dataset.tool === 'filletChamfer') {
        if (bridge.filletChamferFromSelection && bridge.filletChamferFromSelection()) return;
        activateFilletChamfer();
        return;
      }
      // Zrcadlení: pokud je výběr → okamžitě provést
      if (btn.dataset.tool === 'mirror' && bridge.mirrorFromSelection && bridge.mirrorFromSelection()) return;
      // Otočení: pokud je výběr → okamžitě přepnout na rotate s výběrem
      if (btn.dataset.tool === 'rotate' && bridge.rotateFromSelection && bridge.rotateFromSelection()) return;
      // Lineární pole: pokud je výběr → okamžitě otevřít dialog
      if (btn.dataset.tool === 'linearArray' && bridge.linearArrayFromSelection && bridge.linearArrayFromSelection()) return;
      // Kruhové pole: pokud je výběr → okamžitě otevřít dialog
      if (btn.dataset.tool === 'circularArray' && bridge.circularArrayFromSelection && bridge.circularArrayFromSelection()) return;
      // Kopírovat & umístit: pokud je výběr → přepnout do copyPlace módu
      if (btn.dataset.tool === 'copyPlace' && bridge.copyPlaceFromSelection && bridge.copyPlaceFromSelection()) return;
      setTool(btn.dataset.tool);
    });
  });

  // Obnovit poslední volbu typu čáry (popisek/ikona tlačítka „Typ čáry")
  loadLineStylePref();
  refreshLineStyleBtn();
}

/**
 * Zvýrazní tlačítko odpovídající aktuálnímu nástroji v liště a vypne
 * zvýraznění ostatních. Volá se ze `setTool()`, ale i z dialogů, které
 * nemění `state.tool` (např. Polární/Úhel), aby toolbar odpovídal tomu,
 * co se zrovna reálně děje na plátně.
 * @param {string} [tool] výchozí `state.tool`
 */
export function refreshToolbarActive(tool = state.tool) {
  document
    .querySelectorAll("[data-tool]")
    .forEach((b) =>
      b.classList.toggle("active", b.dataset.tool === tool),
    );
  // Tlačítko „Typ čáry" zůstává zvýrazněné, dokud je volba aktivní – i když
  // se mezitím kreslí jiným nástrojem (kružnice, oblouk, obdélník, kontura).
  const constrBtn = document.querySelector('[data-tool="constr"]');
  if (constrBtn) constrBtn.classList.toggle("active", tool === "constr" || state.lineStyleActive);
}

/** @param {import('../types.js').ToolType} tool */
export function setTool(tool) {
  // Klik na jiný kreslicí nástroj zatímco běží tiché „Tečnost" klikání
  // dialogu Polární/Úhel (viz polarDrawing.js) – dialog zrušit a `state.tool`
  // synchronně vrátit na hodnotu před „Tečnost", ať následující auto-uložení
  // rozkreslené kontury (níž) i zbytek přepnutí vidí správný stav.
  if (bridge.cancelPolarPicking) bridge.cancelPolarPicking();
  // Auto-uložit rozpracovanou konturu při přepnutí nástroje
  if (state.tool === 'polyline' && state.drawing && state.tempPoints.length >= 2) {
    const bulges = state._polylineBulges || [];
    while (bulges.length < state.tempPoints.length - 1) bulges.push(0);
    pushUndo();
    addObject({
      type: 'polyline',
      vertices: state.tempPoints.slice(),
      bulges: bulges.slice(0, state.tempPoints.length - 1),
      closed: false,
      name: `Kontura ${state.nextId}`,
    });
    showToast(`Kontura uložena (${state.tempPoints.length} bodů)`);
  }
  // Auto-uložit rozkreslený tah tužkou při přepnutí nástroje
  if (state.tool === 'pencil' && state.drawing && state.tempPoints.length >= 2) {
    addObject({
      type: 'polyline',
      vertices: state.tempPoints.slice(),
      bulges: new Array(state.tempPoints.length - 1).fill(0),
      closed: false,
      name: `Tužka ${state.nextId}`,
    });
    showToast(`Náčrt tužkou uložen (${state.tempPoints.length} bodů)`);
  }
  // Auto-dokončit rozpracované trasování profilu
  if (state.tool === 'profileTrace' && state.drawing && state.tempPoints.length >= 2) {
    if (bridge.finishProfileTrace) bridge.finishProfileTrace();
  }
  // Auto-dokončit řetězcové kótování při přepnutí nástroje
  if (state.tool === 'chainDimension' && state.drawing) {
    if (bridge.finishChainDimension) bridge.finishChainDimension();
  }
  // Pokud už jsme v select módu a klikne se znovu na Výběr → zrušit výběr
  if (tool === 'select' && state.tool === 'select') {
    state.selected = null;
    state.selectedSegment = null;
    state._selectedSegmentObjIdx = null;
    state.multiSelected.clear();
    state.multiSelectedSegments.clear();
    state.selectedPoint = null;
    if (bridge.updateProperties) bridge.updateProperties();
  }
  // Uložit multiSelected před resetem – move a rotate zachovává výběr
  const savedMulti = (tool === 'move' || tool === 'rotate') ? new Set(state.multiSelected) : null;
  const savedSelected = (tool === 'move' || tool === 'rotate') ? state.selected : null;
  state.tool = tool;
  resetDrawingState();
  if (savedMulti && savedMulti.size > 0) {
    state.multiSelected = savedMulti;
    state.selected = savedSelected;
  }
  // Rozdělané tažení vrátit – i hromadné (dřív se vrátil jen jednotlivý
  // objekt a hromadně tažené objekty zůstaly napůl přesunuté)
  if (bridge.cancelDrag) bridge.cancelDrag();
  drawCanvas.style.cursor = tool === "move" ? "move" : "crosshair";
  refreshToolbarActive(tool);
  // Toggle btnDelete active state for deleteObj mode
  const btnDel = document.getElementById("btnDelete");
  if (btnDel) btnDel.classList.toggle("active", tool === "deleteObj");
  document.getElementById("statusTool").textContent =
    "Nástroj: " + (tool === "constr" ? activeLineStyle().label : toolLabel(tool))
    + (state.lineStyleActive && tool !== "constr" ? ` (${activeLineStyle().label})` : "");
  // Sync mobile measure button
  const mmBtn = document.getElementById("mobileMeasure");
  if (mmBtn) mmBtn.classList.toggle("active", tool === "measure");
  // Sync desktop measure button
  const dmBtn = document.getElementById("desktopMeasure");
  if (dmBtn) dmBtn.classList.toggle("active", tool === "measure");
  // Sync mobile "Dvoj klik" tlačítko (jen viditelné v nástroji Výběr)
  if (bridge.updateMobileRectArmBtn) bridge.updateMobileRectArmBtn();
  // Aktualizovat mobilní coord bar s novým nástrojem
  if (bridge.updateMobileCoords) {
    bridge.updateMobileCoords(state.mouse.x, state.mouse.y);
  }
  resetHint();
  renderAll();
}

// ── Zaoblení / Zkosení – aktivace s dialogem ──
/**
 * Zobrazí dialog Zaoblení/Zkosení a po potvrzení aktivuje nástroj.
 * Volá se z tlačítka i z klávesové zkratky F/Y.
 */
export function activateFilletChamfer() {
  showFilletChamferDialog((mode, p1, p2) => {
    state._fcMode = mode;
    state._fcP1   = p1;
    state._fcP2   = p2;
    setTool('filletChamfer');
    setHint(mode === 'fillet'
      ? `Klikněte na roh nebo 1. úsečku (R${p1})`
      : `Klikněte na roh nebo 1. úsečku (${p1}×${p2})`);
  });
}

// ── Hinty ──
/** @param {string} text */
export function setHint(text) {
  const el = document.getElementById("statusHint");
  if (el) el.textContent = text;
}

/** Obnoví nápovědu pro aktuální nástroj. */
export function resetHint() {
  const hints = {
    select: "Klikněte pro výběr (další klik = přidat, znovu = odebrat)",
    move: "Klikněte na objekt pro přesun",
    point: "Klikněte pro umístění bodu",
    line: "Klikněte na počáteční bod úsečky",
    constr: `Klikněte na počáteční bod – ${activeLineStyle().label.toLowerCase()}`,
    circle: "Klikněte na střed kružnice",
    arc: "Klikněte na střed oblouku",
    rect: "Klikněte na první roh obdélníku",    polyline: "Klepněte na první bod kontury",    measure: "Klepněte na objekt pro info, nebo na prázdné místo pro měření",
    tangent: "Klepněte na bod nebo na první kružnici",
    offset: "Klepněte na objekt pro offset",
    snapPoint: "Klepněte na koncový bod objektu pro přichycení",
    horizontal: "Klepněte na úsečku/segment – vyrovná se vodorovně",
    perp: "Klepněte na úsečku/segment – vyrovná se svisle (kolmo)",
    parallel: "Klepněte na úsečku kterou chcete otočit → pak na referenční úsečku pro rovnoběžnost",
    text: "Klepněte na místo, kam chcete umístit textovou anotaci",
    deleteObj: "Klepněte na objekt pro smazání",
    anchor: "Klepněte na snap bod pro zakotvení/uvolnění",
    break: "Klepněte na objekt – rozdělí se v daném místě",
    join: "Klepněte na bod, kde se spojují dvě stejnosměrné úsečky",
    centerMark: "Klepněte na kružnici/oblouk – přepne středovou značku",
    scale: "Klepněte na objekt – otevře dialog změny měřítka",
    filletChamfer: "Klikněte na roh nebo na první úsečku – zaoblení nebo zkosení",
    mirror: "Vyberte objekty pro zrcadlení (Shift+M)",
    boolean: "Klikněte na první uzavřenou konturu",
    circularArray: "Klepněte na objekt pro kruhové pole",
    profileTrace: "Klepněte na první bod kontury (R = radius, Enter = dokončit)",
    fill: "Klikněte do plochy, kterou chcete vybarvit",
    vkDraw: "Klepněte do výkresu – bod se zapíše do VK kontury (typ prvku VL/VKr volíte v okně)",
  };
  setHint(hints[state.tool] || "");
}
