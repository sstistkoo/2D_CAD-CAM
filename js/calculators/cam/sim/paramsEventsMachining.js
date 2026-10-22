// Záložka ⚙ Parametry CAM simulátoru — události: nůž (tvar), dokončení, hlídání geometrie, zanoření, upichnutí, závit, vrtání, vyvrtávání (zapíná ho přepínač ◎ Vnitřní, sim/machSurface.js), 🔄 Resetovat vše.
// Vyňato z camSimulator.js (attachParamsEvents, docs/plan-rozdeleni-cam-
// simulatoru.md) — stav simulátoru a jeho funkce se předávají parametrem
// (ctx se sestaví při každém vykreslení záložky).
import { showToast } from '../../../state.js';
import { MAGAZINE_DEFAULTS_REV } from '../../magazineDefaults.js';
import { _defaultCamParams } from '../camDefaults.js';
import { getEffectivePlungeAngle } from '../camMath.js';
import { getInsert } from '../inserts/index.js';
import { applyPreDrillPlan } from '../ops/borePreDrill.js';
import { camConfirm } from '../camSimulatorDialogs.js';
import { attachSurfaceEvents } from './machSurface.js';

export function attachParamsEventsMachining({ tabBody, S, renderTab, applyChange, draw, saveState, fullUpdate, applyShapeChange, applyTipMirrorToggle, canvas, showMagazineDialog, showThreadPickerDialog, pushHistory, autoPickToolFor, boreHoleSolid, boreEnsurePreDrill, boreTakePreHoleFromDrill, boreEnsureBar, partsActive, _isoDefaultMagSlots, markGCodeGenerated, _applyMagSlot }) {
  attachSurfaceEvents({ tabBody, S, applyChange, pushHistory, autoPickToolFor, boreHoleSolid, boreEnsurePreDrill, boreTakePreHoleFromDrill, boreEnsureBar, _applyMagSlot });
  tabBody.querySelectorAll('[data-tshape]').forEach(btn => {
    btn.addEventListener('click', () => applyShapeChange(btn.dataset.tshape));
  });
  const tipMirrorBtn = tabBody.querySelector('[data-act="toggle-tip-mirror"]');
  if (tipMirrorBtn) tipMirrorBtn.addEventListener('click', () => applyTipMirrorToggle());
  const finCb = tabBody.querySelector('#cam-sim-fin');
  if (finCb) finCb.addEventListener('change', () => {
    S.params.doFinishing = finCb.checked;
    applyChange();
  });
  const finOnlyCb = tabBody.querySelector('#cam-sim-finonly');
  if (finOnlyCb) finOnlyCb.addEventListener('change', () => {
    S.params.finishOnly = finOnlyCb.checked;
    applyChange();
  });
  const partOffSmoothCb = tabBody.querySelector('#cam-sim-partoff-smooth');
  if (partOffSmoothCb) partOffSmoothCb.addEventListener('change', () => {
    S.params.partOffSmooth = partOffSmoothCb.checked;
    applyChange();
  });
  const finSlotSel = tabBody.querySelector('#cam-sim-fin-slot');
  if (finSlotSel) finSlotSel.addEventListener('change', () => {
    S.params.finishingSlot = finSlotSel.value === '' ? null : parseInt(finSlotSel.value);
    applyChange();
  });
  const respCb = tabBody.querySelector('#cam-sim-respect-insert');
  if (respCb) respCb.addEventListener('change', () => { S.params.respectInsertGeometry = respCb.checked; applyChange(); });
  const clearInsertGuidesBtn = tabBody.querySelector('[data-act="clear-insert-guides"]');
  if (clearInsertGuidesBtn) clearInsertGuidesBtn.addEventListener('click', () => {
    const count = S.guideLines.length;
    S.guideLines = [];
    showToast(`Smazáno ${count} konstrukční čar ✓`);
    saveState(); applyChange();
  });
  const plungeCb = tabBody.querySelector('#cam-sim-plunge');
  if (plungeCb) plungeCb.addEventListener('change', () => { S.params.plungeRoughing = plungeCb.checked; applyChange(); });
  const noStepCb = tabBody.querySelector('#cam-sim-nostep');
  if (noStepCb) noStepCb.addEventListener('change', () => { S.params.noStepRoughing = noStepCb.checked; applyChange(); });
  const noStepFaceCb = tabBody.querySelector('#cam-sim-nostep-face');
  if (noStepFaceCb) noStepFaceCb.addEventListener('change', () => { S.params.noStepRoughingFace = noStepFaceCb.checked; applyChange(); });
  const plungeAutoBtn = tabBody.querySelector('[data-act="plunge-auto"]');
  if (plungeAutoBtn) plungeAutoBtn.addEventListener('click', () => {
    S.params.entryAngleAuto = !S.params.entryAngleAuto;
    // Při vypnutí auta převezme pole aktuálně dopočtenou hodnotu,
    // aby šla ručně doladit od smysluplného výchozího čísla.
    if (!S.params.entryAngleAuto)
      S.params.entryAngle = getEffectivePlungeAngle({ ...S.params, entryAngleAuto: true });
    applyChange();
  });
  const partOffPickBtn = tabBody.querySelector('[data-act="partoff-pick"]');
  if (partOffPickBtn) partOffPickBtn.addEventListener('click', () => {
    S.partOffPickMode = !S.partOffPickMode;
    // Vzájemně se vylučuje s ostatními klikacími režimy.
    if (S.partOffPickMode) { S.profileTraceMode = false; S.addPointMode = false; S.delPointMode = false; }
    canvas.style.cursor = S.partOffPickMode ? 'crosshair' : 'crosshair';
    showToast(S.partOffPickMode ? 'Upichnutí: klikni na canvas pro Z rovinu řezu (Esc = zrušit)' : 'Výběr upichnutí zrušen');
    renderTab(); draw();
  });
  const partOffClearBtn = tabBody.querySelector('[data-act="partoff-clear"]');
  if (partOffClearBtn) partOffClearBtn.addEventListener('click', () => {
    const wasActive = S.params.partOffZ != null;
    S.params.partOffZ = null; S.partOffPickMode = false;
    showToast('Upichnutí zrušeno — zpět na zapichování/hrubování tvaru');
    // Zrušení je změna REŽIMU (`cycle`) — program pořád obsahuje upichovací
    // cyklus, i když už upichnutí neběží, takže se musí přepsat.
    if (wasActive) applyChange({ cycle: true }); else { renderTab(); draw(); }
  });
  const magazineBtn = tabBody.querySelector('[data-act="open-magazine"]');
  if (magazineBtn) magazineBtn.addEventListener('click', () => showMagazineDialog());
  tabBody.querySelectorAll('[data-act="open-threads"], [data-act="thread-pick"]').forEach(btn => {
    btn.addEventListener('click', () => showThreadPickerDialog());
  });
  const threadToggleBtn = tabBody.querySelector('[data-act="thread-toggle"]');
  if (threadToggleBtn) threadToggleBtn.addEventListener('click', () => {
    pushHistory();   // zapnutí může vyměnit i nůž (autoPickToolFor) — jeden krok ↩
    S.params.threadActive = !S.params.threadActive;
    // Jeden cyklus na program — aktivní vrtání by závit jinak jen schovalo.
    if (S.params.threadActive) { S.params.drillActive = false; S.params.boreActive = false; }
    const picked = S.params.threadActive ? autoPickToolFor('thread').msg : '';
    // Ruční zásah v programu má přednost — pak se dráhy nepřegenerují samy
    // a čekají na „🔄 Dráhy" (tlačítko svítí jako neaktuální).
    const regen = !S.gcodeDirty;
    showToast(S.params.threadActive
      ? `Závitování ${S.params.threadName || ''} aktivní${picked}${regen ? ' — dráhy přegenerovány' : ' — program má ruční úpravy, dráhy vygeneruj přes 🔄 Dráhy'}`
      : `Závitování vypnuto — zpět na hrubování${regen ? '' : ' (dráhy vygeneruj přes 🔄 Dráhy)'}`);
    applyChange({ cycle: true });
  });
  // Rychlé vypnutí závitování z varování v záložkách Hrub./Hot./Upich.
  const threadOffBtn = tabBody.querySelector('[data-act="thread-deactivate"]');
  if (threadOffBtn) threadOffBtn.addEventListener('click', () => {
    S.params.threadActive = false;
    showToast(`Závitování vypnuto — zpět na hrubování${S.gcodeDirty ? ' (dráhy vygeneruj přes 🔄 Dráhy)' : ''}`);
    applyChange({ cycle: true });
  });
  // ── Vrtání ──
  const drillToggleBtn = tabBody.querySelector('[data-act="drill-toggle"]');
  if (drillToggleBtn) drillToggleBtn.addEventListener('click', () => {
    // Vrtání určuje nástroj (enforceInsertOperation) — „Zapnout" = vybrat
    // vrták. Bez vrtáku v zásobníku se nic nemění, jen se řekne, kde ho vzít.
    if (!getInsert(S.params).canDrill && !S.toolMagazine.some(s => s.shape === 'drill')) {
      showToast(`⚠ ${autoPickToolFor('drill').msg.replace(/^ ⚠ /, '')}`);
      return;
    }
    pushHistory();   // zapnutí vymění nůž (autoPickToolFor) — jeden krok ↩
    S.params.drillActive = true;
    const picked = autoPickToolFor('drill').msg;
    // Program je vždy JEN JEDEN cyklus — závit/upich by vrtání přebily
    // (pořadí early-returnů v generateAutoGCode), takže je vypnout.
    let off = '';
    if (S.params.threadActive) { S.params.threadActive = false; off += ', závit vypnut'; }
    if (S.params.partOffZ != null) { S.params.partOffZ = null; S.partOffPickMode = false; off += ', upich zrušen'; }
    if (S.params.boreActive) { S.params.boreActive = false; off += ', vyvrtávání vypnuto'; }
    showToast(`Vrtání aktivní${picked}${off}${!S.gcodeDirty ? ' — dráhy přegenerovány' : ' — program má ruční úpravy, dráhy vygeneruj přes 🔄 Dráhy'}`);
    applyChange({ cycle: true });
  });
  const drillPickToolBtn = tabBody.querySelector('[data-act="drill-pick-tool"]');
  if (drillPickToolBtn) drillPickToolBtn.addEventListener('click', () => showMagazineDialog());
  // ── Vyvrtávání ── (zapnutí / vypnutí = přepínač ◎ Vnitřní / ◯ Vnější
  // i „Vypnout vyvrtávání" z varování, machSurface.js)
  const borePickToolBtn = tabBody.querySelector('[data-act="bore-pick-tool"]');
  if (borePickToolBtn) borePickToolBtn.addEventListener('click', () => showMagazineDialog());
  const boreFinishCb = tabBody.querySelector('#cam-sim-bore-finish');
  if (boreFinishCb) boreFinishCb.addEventListener('change', () => {
    S.params.boreFinish = boreFinishCb.checked;
    applyChange();
  });
  tabBody.querySelectorAll('[data-boresrc]').forEach(btn => {
    btn.addEventListener('click', () => {
      if ((S.params.boreSource === 'cad') === (btn.dataset.boresrc === 'cad')) return;
      pushHistory();
      S.params.boreSource = btn.dataset.boresrc;
      applyChange();
    });
  });
  const borePreDrillCb = tabBody.querySelector('#cam-sim-bore-predrill');
  if (borePreDrillCb) borePreDrillCb.addEventListener('change', () => {
    pushHistory();
    S.params.borePreDrill = borePreDrillCb.checked;
    let msg = '';
    if (S.params.borePreDrill) msg = boreEnsurePreDrill() + boreEnsureBar();
    else applyPreDrillPlan(S);
    showToast(S.params.borePreDrill ? `Předvrtání vrtákem zapnuto${msg}` : 'Předvrtání vrtákem vypnuto — předvrtání zadej ručně');
    applyChange({ cycle: true });
  });
  const boreDrillSel = tabBody.querySelector('#cam-sim-bore-drill');
  if (boreDrillSel) boreDrillSel.addEventListener('change', () => {
    pushHistory();
    S.params.borePreDrillSlot = boreDrillSel.value === '' ? null : parseInt(boreDrillSel.value, 10);
    applyPreDrillPlan(S);
    const picked = boreEnsureBar();
    if (picked) showToast(`Vyvrtávací tyč${picked}`);
    applyChange({ cycle: true });
  });
  const borePreDrillCatBtn = tabBody.querySelector('[data-act="bore-predrill-catalog"]');
  if (borePreDrillCatBtn) borePreDrillCatBtn.addEventListener('click', () => {
    pushHistory();
    const msg = boreEnsurePreDrill() + boreEnsureBar();
    showToast(`Předvrtání${msg.replace(/^ — /, ': ')}`);
    applyChange({ cycle: true });
  });
  const boreFromDrillBtn = tabBody.querySelector('[data-act="bore-from-drill"]');
  if (boreFromDrillBtn) boreFromDrillBtn.addEventListener('click', () => {
    pushHistory();
    const msg = boreTakePreHoleFromDrill();
    showToast(msg ? `Předvrtání${msg.replace(/^ — /, ': ')}` : 'V 🔧 Zásobníku není vrták — předvrtání zadej ručně');
    applyChange();
  });
  tabBody.querySelectorAll('[data-drillmode]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (S.params.drillChipMode === btn.dataset.drillmode) return;
      S.params.drillChipMode = btn.dataset.drillmode;
      applyChange();
    });
  });
  const drillFullDiaCb = tabBody.querySelector('#cam-sim-drill-fulldia');
  if (drillFullDiaCb) drillFullDiaCb.addEventListener('change', () => {
    S.params.drillDepthFullDia = drillFullDiaCb.checked;
    applyChange();
  });
  // Rychlé vypnutí „jen dokončení" z varování v ostatních záložkách.
  const finOnlyOffBtn = tabBody.querySelector('[data-act="finishonly-off"]');
  if (finOnlyOffBtn) finOnlyOffBtn.addEventListener('click', () => {
    S.params.finishOnly = false;
    showToast('Jen dokončení vypnuto — hrubování se zase generuje');
    applyChange();
  });
  tabBody.querySelectorAll('[data-thinfeed]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (S.params.threadInfeed === btn.dataset.thinfeed) return;
      S.params.threadInfeed = btn.dataset.thinfeed;
      applyChange();
    });
  });
  const resetBtn = tabBody.querySelector('[data-act="reset"]');
  if (resetBtn) resetBtn.addEventListener('click', async () => {
    const ok = await camConfirm(partsActive()
      ? `Opravdu chcete resetovat CAM parametry a vymazat vygenerované dráhy? Zruší se i rozdělení programu na části (${S.opParts.length}). Kontura a polotovar zůstanou zachovány (lze vzít zpět tlačítkem ↩ Zpět).`
      : 'Opravdu chcete resetovat CAM parametry a vymazat vygenerované dráhy? Kontura a polotovar zůstanou zachovány (lze vzít zpět tlačítkem ↩ Zpět).');
    if (ok) {
      pushHistory();
      // Parametry popisující GEOMETRII/stroj (jednotky ⌀/R, tvar a rozměry
      // polotovaru, struktura stroje) se nesmí resetovat na výchozí — jinak
      // by se stávající kontura/polotovar vykreslily špatně (např. přepnutí
      // R↔⌀ změní měřítko X, přepnutí stockMode ztratí vlastní tvar polotovaru).
      const _preserveKeys = ['mode', 'stockMode', 'stockMargin', 'stockDiameter', 'stockLength', 'stockFace', 'machineStructure', 'controlSystem'];
      const _defaults = _defaultCamParams();
      _preserveKeys.forEach(k => { _defaults[k] = S.params[k]; });
      S.params = _defaults;
      S.selectedMaterial = 'Ocel 11 373 (S235)';
      // Zásobník nesmí zůstat prázdný → zpět na výchozí ISO nože.
      S.toolMagazine = _isoDefaultMagSlots();
      S.magazineDefaultsRev = MAGAZINE_DEFAULTS_REV;
      S.activeMagazineSlot = null;
      S.guideLines = [];
      S.zLimits = { chuck: null, tail: null, chuckActive: false, tailActive: false, rangeStart: null, rangeEnd: null, rangeActive: false };
      S.showZLimits = 'off';
      S.xLimits = { rangeXMin: null, rangeXMax: null, active: false, minActive: false, maxActive: false };
      S.machineConfigOpen = false;
      S.safetyConfigOpen = false;
      S.materialConfigOpen = false;
      S.toolConfigOpen = false;
      S.machiningConfigOpen = false;
      S.manualGCode = '';
      markGCodeGenerated();   // reset = žádné ruční úpravy, co chránit
      // Části programu drží vlastní kopie parametrů — po resetu by
      // neodpovídaly ničemu; zpět do jednooperačního režimu.
      S.opParts = [];
      S.activePart = 0;
      S.opView = 'part';
      fullUpdate();
      showToast('CAM parametry resetovány — kontura a polotovar zachovány');
    }
  });
}
