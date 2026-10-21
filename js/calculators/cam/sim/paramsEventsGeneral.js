// Záložka ⚙ Parametry CAM simulátoru — události: sbalení sekcí, stroj, řídicí systém, pole data-p, materiál, strategie a strana hrubování, meze Z/X a držák.
// Vyňato z camSimulator.js (attachParamsEvents, docs/plan-rozdeleni-cam-
// simulatoru.md) — stav simulátoru a jeho funkce se předávají parametrem
// (ctx se sestaví při každém vykreslení záložky).
import { state, showToast } from '../../../state.js';
import { persistSettings } from '../../../ui.js';
import { MATERIALS } from './materials.js';
import { holderInflateAll } from '../collisionValidator.js';
import { xBoundOn } from '../rangeX.js';
import { wireAllAngleCompasses } from '../insertPreview.js';
import { machTabClick, syncLiveDrillTool } from './machTabTool.js';

export function attachParamsEventsGeneral(ctx) {
  const { tabBody, S, renderTab, recalcNow, draw, saveState, gcodeStale, convertGCodeControlSystem, pathInputsKey, fullUpdate, applyParamChange, _polygonForStrategy, toolbar, dropInsertGuides, applyChange } = ctx;
  const mcToggleBtn = tabBody.querySelector('[data-act="machine-config-toggle"]');
  if (mcToggleBtn) mcToggleBtn.addEventListener('click', () => {
    S.machineConfigOpen = !S.machineConfigOpen;
    renderTab();
  });
  const scToggleBtn = tabBody.querySelector('[data-act="safety-config-toggle"]');
  if (scToggleBtn) scToggleBtn.addEventListener('click', () => {
    S.safetyConfigOpen = !S.safetyConfigOpen;
    renderTab();
  });
  const machToggleBtn = tabBody.querySelector('[data-act="machining-config-toggle"]');
  if (machToggleBtn) machToggleBtn.addEventListener('click', () => {
    S.machiningConfigOpen = !S.machiningConfigOpen;
    renderTab();
  });
  // Záložka obrábění vybere i nástroj své operace (machTabTool.js). Panel ◎
  // (🔩 Vyvrtat) ji volá přes S._machTabClick — cam/live nesmí do cam/sim.
  S._machTabClick = tab => machTabClick(tab, ctx);
  S._syncLiveDrill = () => syncLiveDrillTool(ctx);
  tabBody.querySelectorAll('[data-machtab]').forEach(btn => {
    btn.addEventListener('click', () => {
      machTabClick(btn.dataset.machtab, ctx).catch(e => { console.error(e); showToast(`⚠ Přepnutí operace selhalo: ${e.message}`, 5000); });
    });
  });
  const flipxParamBtn = tabBody.querySelector('[data-act="flipx-param"]');
  if (flipxParamBtn) flipxParamBtn.addEventListener('click', () => {
    S.flipX = !S.flipX;
    state.flipX = S.flipX;
    persistSettings();
    if (!S._cachedCalc) recalcNow();
    draw(); saveState();
    showToast(S.flipX ? 'Osa X otočena – X+ dolů (ruční kód – G2/G3 nepřepisuji)' : 'Osa X – X+ nahoru');
    renderTab();
  });
  const flipzParamBtn = tabBody.querySelector('[data-act="flipz-param"]');
  if (flipzParamBtn) flipzParamBtn.addEventListener('click', () => {
    S.flipZ = !S.flipZ;
    state.flipZ = S.flipZ;
    persistSettings();
    if (!S._cachedCalc) recalcNow();
    draw(); saveState();
    showToast(S.flipZ ? 'Osa Z otočena – Z+ vlevo (ruční kód – G2/G3 nepřepisuji)' : 'Osa Z – Z+ vpravo');
    renderTab();
  });
  tabBody.querySelectorAll('[data-struct]').forEach(btn => {
    btn.addEventListener('click', () => { S.params.machineStructure = btn.dataset.struct; applyChange(); });
  });
  tabBody.querySelectorAll('[data-ctrl]').forEach(btn => {
    btn.addEventListener('click', () => {
      const oldCtrl = S.params.controlSystem;
      const newCtrl = btn.dataset.ctrl;
      if (newCtrl === oldCtrl) return;
      // Existující program (i ruční úpravy drah/posuvů) se převede na
      // syntaxi nového systému — hlavička/závěr se přegenerují, tělo se
      // jen převede (komentáře, CR=/R). Regenerace od nuly z kontury
      // zůstává na tlačítku "🔄 Dráhy".
      const wasCurrent = !gcodeStale();
      if (S.manualGCode && S.manualGCode.trim()) {
        S.manualGCode = convertGCodeControlSystem(S.manualGCode, oldCtrl, newCtrl, S.params, S.flipX, S.flipZ);
      }
      S.params.controlSystem = newCtrl;
      // Program se převedl NA MÍSTĚ (i s ručními úpravami), takže dráhám dál
      // odpovídá — přerazit otisk, jinak by převod sám hlásil „neaktuální".
      // Byl-li neaktuální už předtím, ať to hlásí dál.
      if (wasCurrent) S.gcodeKey = pathInputsKey();
      fullUpdate();
      const ctrlLabel = newCtrl === 'sinumerik' ? 'Sinumerik' : newCtrl === 'fanuc' ? 'Fanuc' : 'Heidenhain';
      showToast(`Program převeden na ${ctrlLabel}`);
    });
  });
  tabBody.querySelectorAll('[data-pmode]').forEach(btn => {
    btn.addEventListener('click', () => { S.params.mode = btn.dataset.pmode; applyChange(); });
  });
  tabBody.querySelectorAll('[data-p]').forEach(inp => {
    inp.addEventListener('change', () => applyParamChange(inp.dataset.p, inp));
  });
  wireAllAngleCompasses(tabBody);
  const matToggleBtn = tabBody.querySelector('[data-act="material-config-toggle"]');
  if (matToggleBtn) matToggleBtn.addEventListener('click', () => {
    S.materialConfigOpen = !S.materialConfigOpen;
    renderTab();
  });
  const toolToggleBtn = tabBody.querySelector('[data-act="tool-config-toggle"]');
  if (toolToggleBtn) toolToggleBtn.addEventListener('click', () => {
    S.toolConfigOpen = !S.toolConfigOpen;
    renderTab();
  });
  tabBody.querySelectorAll('[data-mat]').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = MATERIALS[btn.dataset.mat];
      if (m) {
        S.selectedMaterial = btn.dataset.mat;
        S.params.speed = m.speed; S.params.feed = m.feed; S.params.depthOfCut = m.depth;
        applyChange();
      }
    });
  });
  tabBody.querySelectorAll('[data-rough]').forEach(btn => {
    btn.addEventListener('click', () => {
      S.params.roughingStrategy = btn.dataset.rough;
      // Znaménko natočení + držák (PSKNR ↔ PSBNR, uživatel 12. 10. 2026) jen
      // u polygonu — upichovák musí mít natočení 0 (nález 20. 8. 2026);
      // velikost natočení se zachovává (kdo má 25°, nedostane 15°).
      if (S.params.toolShape === 'polygon') _polygonForStrategy();
      applyChange();
    });
  });
  tabBody.querySelectorAll('[data-side]').forEach(btn => {
    btn.addEventListener('click', () => {
      S.params.roughingSide = btn.dataset.side;
      applyChange();
    });
  });
  // Z-limity – numerické vstupy a tlačítka
  tabBody.querySelectorAll('[data-zlim]').forEach(inp => {
    inp.addEventListener('change', () => {
      const key = inp.dataset.zlim;
      const v = inp.value.trim();
      S.zLimits[key] = v === '' ? null : (parseFloat(v) || 0);
      // Čelisti/koník i rozsah 📐 ovlivňují generování drah (rozsah od
      // 25. 8. 2026 ořezává hrubování i dokončování) → vždy přepočítat.
      applyChange();
    });
  });
  const zlToggle = tabBody.querySelector('[data-act="zlimits-toggle"]');
  if (zlToggle) zlToggle.addEventListener('click', () => {
    // Stejné chování jako tlačítko v toolbaru.
    const tbBtn = toolbar.querySelector('[data-act="zlimits"]');
    if (tbBtn) tbBtn.click();
  });
  // Checkboxy aktivace čelistí / koníku / rozsahů
  const chuckChk = tabBody.querySelector('[data-act="chuck-active"]');
  if (chuckChk) chuckChk.addEventListener('change', () => { S.zLimits.chuckActive = chuckChk.checked; applyChange(); });
  const tailChk = tabBody.querySelector('[data-act="tail-active"]');
  if (tailChk) tailChk.addEventListener('change', () => { S.zLimits.tailActive = tailChk.checked; applyChange(); });
  const zRangeChk = tabBody.querySelector('[data-act="zrange-active"]');
  if (zRangeChk) zRangeChk.addEventListener('change', () => {
    S.zLimits.rangeActive = zRangeChk.checked;
    applyChange();
  });
  // Kam nafouknout virtuálně zvětšený držák: kolem celého vs. jen k obráběné
  // straně. Bylo to zaškrtávátko, ale v úzkém sloupci se název zalamoval do tří
  // řádků a nebylo poznát, co je zapnuté (nález uživatele 24. 8. 2026) — teď je to
  // tlačítko, které rovnou píše stav: ▶ zprava / ◀ zleva / ⭘ dokola.
  // Mění geometrii držáku stejně jako `holderInflate`, takže prochází týmž
  // úklidem promovaných mezních čar; `fullUpdate` překreslí i panel.
  const inflModeBtn = tabBody.querySelector('[data-act="holder-inflate-mode"]');
  if (inflModeBtn) inflModeBtn.addEventListener('click', () => {
    S.params.holderInflateAll = !holderInflateAll(S.params);
    dropInsertGuides();
    applyChange();
  });
  // Každá mez rozsahu X má vlastní přepínač (cam/rangeX.js). Společné
  // `active` se drží jako „aspoň jedna zapnutá" pro starší čtenáře.
  for (const [act, which] of [['xmin-active', 'min'], ['xmax-active', 'max']]) {
    const chk = tabBody.querySelector(`[data-act="${act}"]`);
    if (chk) chk.addEventListener('change', () => {
      S.xLimits.minActive = xBoundOn(S.xLimits, 'min');
      S.xLimits.maxActive = xBoundOn(S.xLimits, 'max');
      S.xLimits[which === 'min' ? 'minActive' : 'maxActive'] = chk.checked;
      S.xLimits.active = S.xLimits.minActive || S.xLimits.maxActive;
      applyChange();
    });
  }
  // X-rozsah – numerické vstupy
  tabBody.querySelectorAll('[data-xlim]').forEach(inp => {
    inp.addEventListener('change', () => {
      const key = inp.dataset.xlim;
      const v = inp.value.trim();
      S.xLimits[key] = v === '' ? null : parseFloat(v);
      applyChange();
    });
  });
  const zlClear = tabBody.querySelector('[data-act="zlimits-clear"]');
  if (zlClear) zlClear.addEventListener('click', () => {
    S.zLimits = { chuck: null, tail: null, chuckActive: false, tailActive: false, rangeStart: null, rangeEnd: null, rangeActive: false };
    S.xLimits = { rangeXMin: null, rangeXMax: null, active: false, minActive: false, maxActive: false };
    // Meze ořezávají dráhy — bez přepočtu zůstával náhled ořezaný podle
    // smazaných mezí (a ⚠ panel s jejich hlášením), dokud se nesáhlo jinam.
    applyChange();
  });
}
