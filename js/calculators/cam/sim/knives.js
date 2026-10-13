// Nože v CAM simulátoru: změny parametrů nástroje (pole panelu i Geometrie,
// tlačítka tvaru, záložka obrábění podle nástroje, přepočet po výměně) a sloty
// 🔧 Zásobníku (nůž ⇄ S.params, nůž tvaru, automatická volba nože pro operaci,
// vyvrtávací tyč a předvrtání, zpětný zápis ✏️ Upravit). Obě skupiny se
// navzájem volají, proto jedna továrna. Vyňato z camSimulator.js (bloky
// „params tab" a „magazine dialog", docs/plan-rozdeleni-cam-simulatoru.md).
import { showToast } from '../../../state.js';
import { pointInLoop } from '../../../geom/geomCore.js';
import { defaultMagazineKnives, presetKnifeForShape, presetSlotIndex, sameKnifeGeometry } from '../../magazineDefaults.js';
import { isoThreadInsertByCode, isoThreadInsertHint, threadInsertFitsPitch, threadInsertFitsSide } from '../../isoThreadInserts.js';
import { isoInternalThreadHint, isoBarFitsHole, isoBoringBarDiameter, buildIsoInternalKnife, isoInternalBars, isoInternalTypeById } from '../../isoInternalTools.js';
import { getInsert } from '../inserts/index.js';
import { enforceInsertOperation } from '../calculatePipeline.js';
import { decideChange } from '../gcodeSync.js';
import { buildStockLoopRaw } from '../materialRemoval.js';
import { holderInflate, holderInflateAll } from '../collisionValidator.js';
import { HOLDER_SIZE_PARAMS, insertOfParams, holderForResizedInsert } from '../holderFollowsInsert.js';
import { applyCatalogSize } from '../catalogInsertSize.js';
import { strategyKnifeSlot } from '../strategyKnife.js';
import { threadProfileDepth } from '../threadHelpers.js';
import { drillGeom, drillAutoFaceZ } from '../ops/drill.js';
import { preDrillPlan, catalogDrillFor, applyPreDrillPlan } from '../ops/borePreDrill.js';
import { _defaultMagSlot, _isoMagSlot } from './magSlots.js';

/**
 * @param ctx { S, toolUi, applyChange, renderTab, withBusy, gcodeStale, pathInputsKey, fullUpdate, saveState, pushHistory }
 */
export function createKnives({ S, toolUi, applyChange, renderTab, withBusy, gcodeStale, pathInputsKey, fullUpdate, saveState, pushHistory }) {
  // Parametry destičky ovlivňující interferenční čáry — při změně se smažou
  // čáry označené fromInsert:true (byly automaticky povýšeny z hlídání destičky).
  const INSERT_PARAMS = new Set(['toolAngle', 'toolTipAngle', 'toolShape', 'toolClearanceAngle',
    'toolLength', 'holderWidth', 'holderLength', 'holderInflate', 'holderInflateAll']);

  // Smaže konstrukční čáry povýšené z hlídání destičky (`fromInsert`) — po
  // změně geometrie destičky/držáku už neplatí. JEDINÉ místo pro všechny
  // cesty, které tu geometrii mění: pole panelu, tlačítka tvaru, ⇄ strana,
  // strategie (znaménko natočení), 🧰 Knihovna, VBD dekodér. Dřív to dělala
  // jen pole panelu, takže po výměně tvaru nebo nože z knihovny zůstávaly
  // viset čáry spočítané pro předchozí destičku a dál omezovaly dráhy.
  function dropInsertGuides() {
    if (!S.params.respectInsertGeometry) return;
    const before = S.guideLines.length;
    S.guideLines = S.guideLines.filter(g => !g.fromInsert);
    if (S.guideLines.length < before)
      showToast('Konstrukční čáry z hlídání destičky aktualizovány 🔄');
  }

  // Sdílený handler pro data-p pole — volaný z hlavního panelu (tabBody) i
  // z modalu Geometrie nástroje, aby obě UI zapisovaly do S.params stejně.
  function applyParamChange(key, inp) {
    const v = inp.value;
    if (key === 'isoSize') {          // výběr velikosti z katalogu (cam/catalogInsertSize.js)
      if (applyCatalogSize(S.params, v)) { dropInsertGuides(); applyChange(); } else renderTab();
      return;
    }
    const _was = HOLDER_SIZE_PARAMS.has(key) ? insertOfParams(S.params) : null;
    // Vymazané pole „Z upich" = zrušit upichnutí (jako ✖ Zrušit), ne upich
    // na Z0 — prázdné číselné pole by jinak níž spadlo na `|| 0`.
    // Vymazané „Z čelo" vrtání = automaticky čelo dílu (drillAutoFaceZ), ne Z0.
    if (key === 'drillZStart' && String(v).trim() === '') {
      S.params.drillZStart = null;
      applyChange();
      return;
    }
    // Vymazané „Dno Z" = vrtá se do zadané hloubky.
    if (key === 'drillZEnd' && String(v).trim() === '') {
      S.params.drillZEnd = null;
      applyChange();
      return;
    }
    if (key === 'partOffZ' && String(v).trim() === '') {
      const wasActive = S.params.partOffZ != null;
      S.params.partOffZ = null;
      if (wasActive) applyChange({ cycle: true }); else renderTab();
      return;
    }
    if (key === 'lims') {
      S.params.machineType = `LIMS=${parseInt(v) || 2000}`;
    } else if (key === 'drillDiameter') {
      // ⌀ vrtáku se ukládá jako toolRadius (⌀/2) — viz inserts/drill.js.
      S.params.toolRadius = Math.max(0.05, (parseFloat(v) || 0) / 2);
    } else {
      if (key === 'entryAngle') S.params.entryAngleAuto = false;
      S.params[key] = inp.type === 'number' ? (parseFloat(v) || 0) : v;
      // Změna stoupání → přepočet hloubky profilu podle typu závitu
      // (ruční úpravu H tím uživatel dělá až PO nastavení P).
      if (key === 'threadPitch') {
        S.params.threadDepth = Math.round(threadProfileDepth(S.params.threadType, parseFloat(v) || 0, S.params.threadExternal !== false) * 1000) / 1000;
      }
    }
    // Katalogový držák sleduje velikost plátku (cam/holderFollowsInsert.js).
    const _hp = _was && holderForResizedInsert(_was, insertOfParams(S.params));
    if (_hp) S.params.holderProfile = _hp;
    // Změna tvaru/úhlu destičky → smazat zastaralé promované interferenční čáry
    if (INSERT_PARAMS.has(key)) dropInsertGuides();
    applyChange();
  }

  // Sdílený handler pro přepnutí tvaru destičky — volaný z hlavního panelu
  // i z modalu Geometrie nástroje. `opts.defer` = nepřepočítávat hned (volající
  // ještě dosazuje další pole a přepočet si zavolá sám) — jinak by import z VBD
  // dekodéru pustil celý pipeline dvakrát.
  function applyShapeChange(next, opts) {
    const prev = S.params.toolShape;
    if (prev !== next) {
      // Poslední VOLBA hrubování (u plátku, který umí obojí) — dostane ji tvar,
      // který v sezení ještě nebyl; vynucené čelní z upichováku se tak nepřenese.
      if (getInsert(S.params).longRoughing !== false) S._lastFreeStrategy = S.params.roughingStrategy;
      // HRUBOVÁNÍ PATŘÍ K PLÁTKU (uživatel 1. 10. 2026): kulatá podélně →
      // upichovák (umí jen čelně) → zpět na kulatou má vrátit PODÉLNĚ, ne
      // nechat čelní z upichováku.
      S._shapeGeomMem[prev] = { roughingStrategy: S.params.roughingStrategy };
      _rememberShapeKnife();
      // ── NŮŽ TVARU (uživatel 7. 10. 2026) ────────────────────────────────────
      // Tlačítko tvaru nasadí celý nůž — destičku i DRŽÁK s obrysem: ten, který
      // byl u tvaru nastavený naposled (S.shapeKnives, „ať si to pamatuje, co
      // tam nastavím"), jinak výchozí: kulatá SRSCR2525M20, polygon
      // PSBNR2525M12, upichovák MGEHR2525-5, závit SER2525M16, vrtání Vrtak D20
      // (magazineDefaults.js) — ze 🔧 Zásobníku jako ✅ Použít, a když tam
      // chybí, přidá se tam. Dřív se měnil jen tvar a geometrie se doplnila z paměti
      // sezení nebo z předvolby — kulatá předvolbu neměla, takže po vrtáku
      // zdědila jeho vyložení 145 mm (náhradní držák pak seděl 145 mm nad
      // destičkou a nehlídal se), úhel 118° a pouzdro 40 × 80 bez obrysu
      // (díl uživatele 7. 10. 2026: „nemám u toho plátku vůbec držák").
      if (!_loadShapeKnife(next)) S.params.toolShape = next;
      dropInsertGuides();
      // ÚHEL ZANOŘENÍ PATŘÍ K TVARU: nový plátek začne na svém Auto (polygon =
      // natočení PU, tj. spodní hrana; kulatá 45°; upichovák kolmo). Ruční
      // úhel odcházejícího tvaru se dřív nesl dál — uživatel 25. 9. 2026 měl
      // u upichováku 15° zbylých z polygonu: „zachovává si to někde úhel".
      S.params.entryAngleAuto = true;
      const mem = S._shapeGeomMem[next];
      if (mem && mem.roughingStrategy) S.params.roughingStrategy = mem.roughingStrategy;
      else if (S._lastFreeStrategy) S.params.roughingStrategy = S._lastFreeStrategy;
      // Plátek, který podélně neumí (upichovák), jede vždy čelně — i když si
      // z paměti nese něco jiného (stejná pojistka je v pipeline).
      if (getInsert(S.params).longRoughing === false) S.params.roughingStrategy = 'face';
      // Natočení polygonu + držák PSKNR ↔ PSBNR patří ke strategii (jako tlačítka).
      if (S.params.toolShape === 'polygon') _polygonForStrategy();
    }
    // Vrták = vrtání (enforceInsertOperation): přechod na vrták / z vrtáku
    // mění OPERACI, ne jen nástroj — program se přegeneruje jako po přepnutí
    // cyklu (dřív zůstalo hrubování a s vrtákem se hrubovalo dál).
    if (prev !== next && (prev === 'drill' || next === 'drill')) {
      showToast(next === 'drill'
        ? 'Nástroj je vrták — program bude vrtací cyklus (záložka Vrtání)'
        : 'Nástroj už není vrták — vrtání vypnuto');
    }
    const changeOpts = prev !== next ? afterToolChange(prev === 'drill') : undefined;
    if (!(opts && opts.defer)) applyAfterToolChange(changeOpts);
  }

  // Přepne záložku obrábění (Hrub./Hot./Upich/Závit/Vrtání…) — sdílí klik na
  // záložku i výměna nástroje. Upichnutí se dělá čelně: při vstupu do Upich se
  // strategie přepne na čelní a předchozí se zapamatuje, při odchodu vrátí.
  // @returns {boolean} true = záložka se změnila
  function setMachiningSubTab(nextTab) {
    const prevTab = S.machiningSubTab;
    if (nextTab === prevTab) return false;
    if (nextTab === 'upich') {
      if (S.params.roughingStrategy !== 'face') {
        S._preUpichStrategy = S.params.roughingStrategy;
        S.params.roughingStrategy = 'face';
      } else {
        S._preUpichStrategy = null;
      }
    } else if (prevTab === 'upich' && S._preUpichStrategy != null) {
      S.params.roughingStrategy = S._preUpichStrategy;
      S._preUpichStrategy = null;
    }
    S.machiningSubTab = nextTab;
    return true;
  }

  // ZÁLOŽKA OBRÁBĚNÍ PODLE NÁSTROJE (uživatel 7. 10. 2026: „když dám vrták,
  // ať se nastaví vrtání, když upichovák, upichování… dal jsem závitový nůž
  // a mám tam vrtání"). Nástroj své operace → její záložka; soustružnický nůž
  // vrátí z cizí operace na Hrub. (Hot./vlastní volbu nechá). Záložka jen
  // ukazuje — operaci zapíná vrták sám (enforceInsertOperation), závit
  // a upich tlačítkem v záložce (potřebují závit / bod upichnutí).
  const TOOL_MACH_TAB = { drill: 'vrt', threading: 'zavit', parting: 'upich' };
  function syncMachTabToTool() {
    const cur = S.machiningSubTab || 'hrub';
    const own = TOOL_MACH_TAB[S.params.toolShape];
    setMachiningSubTab(own || (Object.values(TOOL_MACH_TAB).includes(cur) ? 'hrub' : cur));
  }

  // Po výměně NÁSTROJE (tvar v panelu, slot zásobníku, 🧰 knihovna): vrták ↔
  // nůž mění operaci (enforceInsertOperation) → přegenerovat jako po přepnutí
  // cyklu; záložka obrábění se přepne na operaci nástroje.
  // @returns opts pro applyChange ({cycle:true} při změně vrták ↔ nůž)
  function afterToolChange(wasDrill) {
    const drillSwitch = wasDrill !== !!getInsert(S.params).canDrill;
    if (drillSwitch) enforceInsertOperation(S.params);
    syncMachTabToTool();
    return drillSwitch ? { cycle: true } : undefined;
  }

  // Přepočet po výměně nástroje. Odchod z vrtání přegeneruje CELÝ hrubovací
  // program (na dílu uživatele ~1,3 s, okno mezitím nereaguje) — uživatel
  // 7. 10. 2026: „sekne se mi to, když chci přehodit plátky". Takové
  // přegenerování jede s ⏳ hodinami jako 🔄 Dráhy; náhled bez přegenerování
  // (desetiny sekundy) zůstává jako dřív.
  function applyAfterToolChange(changeOpts) {
    if (changeOpts && decideChange(S, changeOpts) === 'regen')
      return withBusy('Generuji dráhy…', () => applyChange(changeOpts));
    applyChange(changeOpts);
  }

  // Přehodí, na kterou stranu od Natočení se otevírá vrcholový úhel destičky.
  function applyTipMirrorToggle() {
    // NENÍ to kosmetika náhledu (jak tu stálo dřív): přehozenou stranu čte
    // buildInsertProfileSegments → insertWorldLoop, tedy úběr materiálu,
    // validátor, hlídání držáku i mezní čáry. Změřeno na fixture
    // part-19-face-tilted-insert (řezy o 0,2 mm jinde, 7 → 13 vynechaných
    // průchodů), proto stejné zacházení jako s ostatními poli destičky.
    S.params.toolTipMirror = !S.params.toolTipMirror;
    dropInsertGuides();
    applyChange();
  }

  // Přeřadí nože shodné jménem s výchozími ISO noži (magazineDefaults.js) na
  // začátek (T1–T6, v pořadí obrábění) a přečísluje je — pro případ, že
  // v zásobníku dřív zabraly jiná čísla (např. po smazání starších vlastních
  // nožů). Vlastní nože (jiné jméno) jdou za ně se navazujícím číslováním.
  function _resortToolMagazineToDefaults() {
    const order = defaultMagazineKnives().map(d => d.name);
    const defaults = S.toolMagazine.filter(s => order.includes(s.name))
      .sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
    const custom = S.toolMagazine.filter(s => !order.includes(s.name));
    const merged = [...defaults, ...custom];
    merged.forEach((s, i) => { s.slot = i + 1; });
    // Mutovat POLE NA MÍSTĚ (ne S.toolMagazine = merged) — obsluhy karet
    // otevřeného zásobníku drží pole z posledního překreslení. Odkazy indexem
    // (aktivní slot, dokončovací nůž…) přenáší volající přes _reorderMagazine.
    S.toolMagazine.length = 0;
    S.toolMagazine.push(...merged);
  }

  /** Změna POŘADÍ v zásobníku (posun ▲▼, smazání, seřazení): `mutate()`
   *  přeskládá S.toolMagazine NA MÍSTĚ (smí i přečíslovat T). Všechno, co
   *  na slot odkazuje INDEXEM, se pak přenese na týž nůž — aktivní slot,
   *  rozbalená karta a dokončovací nůž (finishingSlot), živě i v každé části
   *  programu. (Dřív smazání posouvalo jen aktivní a rozbalený slot, takže
   *  dokončování pak ukazovalo na jiný nůž.) Program na zásobníku závisí jen
   *  přes dokončovací nůž (T, jméno, Vc/f): zůstal-li týž i s číslem, dráhy
   *  dál odpovídají a otisk se přerazí jako u převodu řídicího systému —
   *  jinak „🔄 Dráhy ●" ukáže, že program je neaktuální. */
  function _reorderMagazine(mutate) {
    const mag = S.toolMagazine;
    const before = mag.slice();
    const finTool = () => {
      const i = S.params.finishingSlot;
      return typeof i === 'number' ? mag[i] || null : null;
    };
    const fin = finTool(), finT = fin && fin.slot;
    const wasCurrent = !gcodeStale();
    mutate();
    const map = (i) => { const j = mag.indexOf(before[i]); return j >= 0 ? j : null; };
    const remap = (obj, key) => { if (obj && typeof obj[key] === 'number') obj[key] = map(obj[key]); };
    remap(S, 'activeMagazineSlot');
    remap(S, 'editingMagazineSlot');
    remap(S.params, 'finishingSlot');
    remap(S.params, 'borePreDrillSlot');
    for (const part of S.opParts || []) {
      remap(part, 'activeMagazineSlot');
      remap(part.params, 'finishingSlot');
      remap(part.params, 'borePreDrillSlot');
    }
    if (wasCurrent && finTool() === fin && (!fin || fin.slot === finT)) S.gcodeKey = pathInputsKey();
    fullUpdate();
  }


  /** Polygon po změně strategie: nůž PSKNR ↔ PSBNR ze zásobníku (strategyKnife.js)
   *  a natočení se znaménkem strategie (čelně −, podélně +). */
  function _polygonForStrategy() {
    const i = strategyKnifeSlot(S.toolMagazine, S.params, S.params.roughingStrategy);
    const prev = parseFloat(S.params.toolAngle);
    if (i >= 0) _loadMagSlot(i);
    const mag = Math.abs(parseFloat(S.params.toolAngle) || 0) || 15;
    S.params.toolAngle = S.params.roughingStrategy === 'face' ? -mag : mag;
    if (i >= 0 || S.params.toolAngle !== prev) dropInsertGuides();
  }

  function _applyMagSlot(idx) {
    const wasDrill = !!getInsert(S.params).canDrill;
    if (!_loadMagSlot(idx)) return;
    // Výměna vrták ↔ nůž mění operaci — přegenerovat jako po přepnutí cyklu,
    // jinak by v programu zůstala stará operace (viz afterToolChange).
    const changeOpts = afterToolChange(wasDrill);
    if (changeOpts) applyAfterToolChange(changeOpts); else fullUpdate();
  }

  /** Nůž ze slotu do S.params (jako ✅ Použít), bez překreslení — volající
   *  sám rozhodne, jestli fullUpdate, nebo applyChange (přegenerování). */
  function _loadMagSlot(idx) {
    const slot = S.toolMagazine[idx];
    if (!slot) return false;
    _rememberShapeKnife();
    S.activeMagazineSlot = idx;
    _slotToParams(slot);
    return true;
  }

  /** Zapamatuje AKTUÁLNÍ nůž u jeho tvaru (S.shapeKnives) — před každou
   *  výměnou nože, ať ho tlačítko tvaru příště vrátí (applyShapeChange). */
  function _rememberShapeKnife() {
    const shape = S.params.toolShape;
    if (!shape) return;
    // Nůž BEZ nakresleného obrysu držáku (náhradní obdélník) se nepamatuje —
    // tlačítko pak vrátí výchozí nůž s držákem (uživatel: „nemám tam pořád
    // ten obdélník místo držáku“). Vrták má držák pouzdro bez obrysu z podstaty.
    if (shape !== 'drill' && !S.params.holderProfile) return;
    if (!S.shapeKnives || typeof S.shapeKnives !== 'object') S.shapeKnives = {};
    const snap = _defaultMagSlot(0);
    _paramsIntoSlot(snap);
    S.shapeKnives[shape] = snap;
  }

  /** Nůž pro tvar (tlačítka tvaru): naposled nastavený u toho tvaru, jinak
   *  výchozí (_loadPresetKnife). Slot zásobníku se označí, jen když je to
   *  týž nůž (jméno i geometrie). */
  function _loadShapeKnife(shape) {
    const mem = S.shapeKnives && S.shapeKnives[shape];
    if (!mem || mem.shape !== shape) return _loadPresetKnife(shape);
    _slotToParams(mem);
    const idx = (S.toolMagazine || []).findIndex(s => s && s.name === mem.name && sameKnifeGeometry(s, mem));
    S.activeMagazineSlot = idx >= 0 ? idx : null;
    return true;
  }

  /** Výchozí nůž tvaru do S.params — slot 🔧 Zásobníku se stejným jménem
   *  a tvarem; když tam chybí, PŘIDÁ se tam z 📚 katalogu i s držákem
   *  (uživatel 7. 10. 2026: „ty nože dej do Zásobníku"). */
  function _loadPresetKnife(shape) {
    const idx = presetSlotIndex(S.toolMagazine, shape);
    if (idx >= 0) return _loadMagSlot(idx);
    const rec = presetKnifeForShape(shape);
    if (!rec) return false;
    if (!Array.isArray(S.toolMagazine)) S.toolMagazine = [];
    const num = S.toolMagazine.length > 0 ? Math.max(...S.toolMagazine.map(s => s.slot || 0)) + 1 : 1;
    S.toolMagazine.push(_isoMagSlot(rec, num));
    showToast(`${rec.name} přidán do 🔧 Zásobníku jako T${num}`);
    return _loadMagSlot(S.toolMagazine.length - 1);
  }

  /** Geometrie, držák a řezné podmínky slotu do S.params (bez výběru slotu). */
  function _slotToParams(slot) {
    S.params.toolName        = slot.name;
    S.params.toolVbdCode     = slot.vbdCode;
    S.params.toolShape       = slot.shape;
    S.params.toolRadius      = slot.radius;
    S.params.toolTipAngle    = slot.tipAngle;
    S.params.toolAngle       = slot.toolAngle;
    S.params.toolClearanceAngle = slot.clearanceAngle;
    S.params.toolLength      = slot.toolLength;
    if (slot.shape === 'threading') S.params.toolTipFlat = slot.tipFlat ?? 0.1;
    S.params.toolTipMirror   = slot.tipMirror === true;
    S.params.speed           = slot.vc;
    S.params.feed            = slot.f;
    S.params.depthOfCut      = slot.ap;
    // Držák
    if (slot.holderLength !== undefined) S.params.holderLength = slot.holderLength;
    if (slot.holderWidth !== undefined) S.params.holderWidth = slot.holderWidth;
    if (slot.holderHand !== undefined) S.params.holderHand = slot.holderHand;
    if (slot.knifeAngle !== undefined) S.params.knifeAngle = slot.knifeAngle;
    S.params.holderInflate = slot.holderInflate ?? 0;
    S.params.holderInflateAll = slot.holderInflateAll === true;
    S.params.toolInternal = typeof slot.internal === 'boolean' ? slot.internal : undefined;
    S.params.holderProfile = slot.holderProfile ? JSON.parse(JSON.stringify(slot.holderProfile)) : null;
  }

  /**
   * Automatický výběr nože ze zásobníku podle operace (uživatel 6. 10. 2026:
   * „když závit, ať se vybere vhodný závitový nůž, když upichovat, tak
   * upichovák — zbytek si vybírá uživatel"). Volá se při ZAPNUTÍ operace
   * (Závit → Aktivní / jiný závit při aktivním; Upich → bod upichnutí), ne
   * při pouhém přepnutí záložky. Nůž, který už sedí, se nemění; když
   * vhodný v zásobníku není, nic se nemění a vrátí se upozornění.
   *  'thread'  → závitový (▽) s úhlem profilu závitu (±0,5°), první v pořadí T
   *  'partoff' → upichovací (▮), první v pořadí T; kulatý se nechá (upichnutí umí)
   *  'drill'   → vrták (⌀), první v pořadí T (Vrtání → Aktivní)
   * @returns {{changed:boolean, msg:string}} msg = doplněk toastu ('' = nic k hlášení)
   */
  function autoPickToolFor(op) {
    const mag = S.toolMagazine;
    const same = { changed: false, msg: '' };
    let idx = -1, missing = '';
    if (op === 'thread') {
      const ang = parseFloat(S.params.threadAngle) || 60;
      const P = parseFloat(S.params.threadPitch) || 0;
      // Destička z ISO katalogu zná svůj rozsah stoupání (plný profil Tr/Acme
      // jen jedno); vlastní ▽ nůž se bere jako dřív jen podle úhlu.
      // …a stranu: vnější závit = destička ER, vnitřní = IR (tyč SNR), která
      // se vejde do předvrtané díry ⌀(D − 2H) (viz ops/thread.js; ⌀ tyče =
      // holderWidth, Dmin z katalogu).
      const ext = S.params.threadExternal !== false;
      const hole = (parseFloat(S.params.threadDiameter) || 0) - 2 * (parseFloat(S.params.threadDepth) || 0);
      const fits = (shape, tip, code, barD) => shape === 'threading' && Math.abs((parseFloat(tip) || 0) - ang) < 0.5
        && threadInsertFitsPitch(code, P) && threadInsertFitsSide(code, ext)
        && (ext || !isoThreadInsertByCode(code) || isoBarFitsHole(barD, hole));
      if (fits(S.params.toolShape, S.params.toolTipAngle, S.params.toolVbdCode, S.params.holderWidth)) return same;
      idx = mag.findIndex(s => fits(s.shape, s.tipAngle, s.vbdCode, s.holderWidth));
      const what = `${ext ? '' : 'vnitřní '}závitový nůž ${ang}°${P > 0 ? ` na P ${String(P).replace('.', ',')}` : ''}`;
      const r = ext ? { hint: isoThreadInsertHint(ang, P) } : isoInternalThreadHint(ang, P, hole > 0 ? hole : Infinity);
      const cz = (v) => String(Math.round(v * 100) / 100).replace('.', ',');
      missing = r && r.hint
        ? `v zásobníku není ${what} — přidej ${r.hint} z 🧰 Knihovna → 📚 ISO katalog → ${ext ? 'Závitové' : 'Vnitřní (do díry)'}`
        : r && r.holeMin
          ? `v zásobníku není ${what} a do díry ⌀${cz(hole)} se tyč z 📚 ISO katalogu nevejde (nejmenší potřebuje ⌀${r.holeMin})`
          : `v zásobníku není ${what} a 📚 ISO katalog ho nemá — nakresli vlastní ▽ nůž`;
    } else if (op === 'partoff') {
      if (S.params.toolShape === 'parting') return same;
      idx = mag.findIndex(s => s.shape === 'parting');
      if (idx < 0 && S.params.toolShape === 'round') return same;
      missing = 'v zásobníku není upichovák — přidej ho z 🧰 Knihovna → 📚 ISO katalog';
    } else if (op === 'drill') {
      if (getInsert(S.params).canDrill) return same;
      idx = mag.findIndex(s => s.shape === 'drill');
      missing = 'v zásobníku není vrták — přidej ho z 🧰 Knihovna → 📚 ISO katalog → Vrtáky';
    } else if (op === 'bore') {
      // Vyvrtávací tyč z 📚 katalogu (S20S-…), která se vejde do předvrtání
      // (Dmin, pravidlo 13); z vhodných nejtlustší — nejtužší.
      const d0 = parseFloat(S.params.borePreDiameter) || 0;
      const barOk = (name) => { const d = isoBoringBarDiameter(name); return d !== null && isoBarFitsHole(d, d0); };
      if (barOk(S.params.toolName)) return same;
      mag.forEach((s, i) => {
        if (barOk(s.name) && (idx < 0 || isoBoringBarDiameter(s.name) > isoBoringBarDiameter(mag[idx].name))) idx = i;
      });
      missing = `v zásobníku není vyvrtávací tyč do předvrtání ⌀${d0} — přidej ji z 🧰 Knihovna → 📚 ISO katalog → Vnitřní (do díry)`;
    }
    if (idx < 0) return { changed: false, msg: missing ? ` ⚠ ${missing}` : '' };
    _loadMagSlot(idx);
    return { changed: true, msg: ` — nůž T${mag[idx].slot} ${mag[idx].name}${mag[idx].vbdCode ? ' (' + mag[idx].vbdCode + ')' : ''}` };
  }

  /** Vyvrtávací tyč do předvrtání: ze 🔧 Zásobníku (autoPickToolFor), a když
   *  tam žádná není, z 📚 katalogu nejtlustší tyč 95° (BCL), která se do
   *  předvrtání vejde — přidá se do zásobníku a vybere (uživatel 9. 10. 2026:
   *  „ať je to automatizované"). @returns doplněk toastu */
  function boreEnsureBar() {
    const r = autoPickToolFor('bore');
    if (r.changed || !/⚠/.test(r.msg)) return r.msg;
    const d0 = parseFloat(S.params.borePreDiameter) || 0;
    const bars = isoInternalBars(isoInternalTypeById('BCL')).filter(b => isoBarFitsHole(b.d, d0)).sort((a, b) => b.d - a.d);
    const rec = bars.length ? buildIsoInternalKnife('BCL', { bar: bars[0].d }) : null;
    if (!rec) return r.msg;
    if (!Array.isArray(S.toolMagazine)) S.toolMagazine = [];
    const num = S.toolMagazine.length > 0 ? Math.max(...S.toolMagazine.map(t => t.slot || 0)) + 1 : 1;
    S.toolMagazine.push(_isoMagSlot(rec, num));
    _loadMagSlot(S.toolMagazine.length - 1);
    return ` — tyč ${rec.name} přidána z 📚 katalogu do 🔧 Zásobníku jako T${num}`;
  }

  /** Je díra v polotovaru plná? Bod u osy 1 mm pod ústím díry leží v polotovaru. */
  function boreHoleSolid() {
    const calc = S._cachedCalc;
    const loop = calc ? buildStockLoopRaw(S.params, calc.stockPathSegments) : null;
    if (!loop) return false;
    const pl = preDrillPlan(S);
    if (!Number.isFinite(pl.zF)) return false;
    return pointInLoop({ x: 0.5, z: pl.zF - pl.s * 1 }, loop) === 'inside';
  }

  /** Vyvrtávání z plného (ops/borePreDrill.js): zapne předvrtání vrtákem;
   *  když v 🔧 Zásobníku žádný vhodný vrták není, přidá ho z 📚 katalogu
   *  (uživatel 9. 10. 2026: „Zásobník, jinak katalog"). Předvrtání se hned
   *  přepočítá, ať si tyč vybere podle ⌀ vrtáku. @returns doplněk toastu */
  function boreEnsurePreDrill() {
    S.params.borePreDrill = true;
    let plan = preDrillPlan(S);
    let added = '';
    if (!plan.ok && plan.idx < 0 && plan.dMax > 0) {
      const rec = catalogDrillFor(plan.dMax, plan.L - Math.max(0, parseFloat(S.params.allowanceZ) || 0));
      if (rec) {
        if (!Array.isArray(S.toolMagazine)) S.toolMagazine = [];
        const num = S.toolMagazine.length > 0 ? Math.max(...S.toolMagazine.map(t => t.slot || 0)) + 1 : 1;
        S.toolMagazine.push(_isoMagSlot(rec, num));
        added = `, ${rec.name} přidán z 📚 katalogu do 🔧 Zásobníku jako T${num}`;
        plan = preDrillPlan(S);
      }
    }
    applyPreDrillPlan(S);
    return plan.ok ? ` — předvrtání ${plan.slot.name}${added}` : ` — předvrtání: ${plan.reason}`;
  }

  // Předvrtání pro vyvrtávání z operace Vrtání: ⌀ prvního vrtáku v zásobníku
  // (ten si vrtání samo vybere), hloubka NA PLNÝ ⌀ (bez špičky), Z čela.
  // Vrací text do hlášky, nebo '' (žádný vrták).
  function boreTakePreHoleFromDrill() {
    const slot = S.toolMagazine.find(s => s.shape === 'drill');
    if (!slot || !(parseFloat(slot.radius) > 0)) return '';
    const d = Math.round(parseFloat(slot.radius) * 2 * 1000) / 1000;
    const sigma = parseFloat(slot.tipAngle) || 118;
    // „Dno Z" (drillZEnd) má přednost před hloubkou — stejně jako ve vrtání samotném.
    const zEndSet = S.params.drillZEnd !== null && S.params.drillZEnd !== undefined && S.params.drillZEnd !== '' && Number.isFinite(parseFloat(S.params.drillZEnd));
    const depth = zEndSet
      ? Math.abs(parseFloat(S.params.drillZEnd) - drillGeom(S.params, { faceZ: drillAutoFaceZ(S) }).zFace)
      : (parseFloat(S.params.drillDepth) || 0);
    const full = S.params.drillDepthFullDia ? depth : depth - (d / 2) / Math.tan(sigma / 2 * Math.PI / 180);
    if (!(full > 0)) return '';
    S.params.borePreDiameter = d;
    S.params.borePreDepth = Math.round(full * 1000) / 1000;
    // Z čela tak, jak ho bere vrtání: prázdné Z čelo = čelo dílu
    // (drillAutoFaceZ), ne Z0 — u dílu nakresleného od Z0 doprava by
    // vyvrtávání jinak začalo na levém konci (stejná chyba jako u vrtání 7. 10.).
    S.params.boreZStart = drillGeom(S.params, { faceZ: drillAutoFaceZ(S) }).zFace;
    return ` — předvrtání ⌀${d} × ${S.params.borePreDepth} z Vrtání`;
  }

  function _syncParamsToSlot(idx) {
    const slot = S.toolMagazine[idx];
    if (!slot) return;
    _paramsIntoSlot(slot);
  }

  /** Aktuální nůž (S.params) do objektu slotu — zásobník i paměť tvaru. */
  function _paramsIntoSlot(slot) {
    // Prázdné jméno nesmí slot přejmenovat na nic — název slotu (T1, „Šlicht")
    // je jediné, podle čeho se v seznamu pozná.
    if (S.params.toolName) slot.name = S.params.toolName;
    slot.vbdCode       = S.params.toolVbdCode || '';
    slot.shape         = S.params.toolShape;
    slot.radius        = S.params.toolRadius;
    slot.tipAngle      = S.params.toolTipAngle;
    slot.toolAngle     = S.params.toolAngle;
    slot.clearanceAngle = S.params.toolClearanceAngle || 0;
    slot.toolLength    = S.params.toolLength;
    slot.tipFlat       = S.params.toolTipFlat ?? 0.1;
    slot.tipMirror     = S.params.toolTipMirror === true;
    slot.vc            = S.params.speed;
    slot.f             = S.params.feed;
    slot.ap            = S.params.depthOfCut;
    // Držák
    slot.holderLength  = S.params.holderLength;
    slot.holderWidth   = S.params.holderWidth;
    slot.holderHand    = S.params.holderHand;
    slot.knifeAngle    = S.params.knifeAngle;
    slot.holderInflate = holderInflate(S.params);
    slot.holderInflateAll = holderInflateAll(S.params);
    if (typeof S.params.toolInternal === 'boolean') slot.internal = S.params.toolInternal; else delete slot.internal;
    slot.holderProfile = S.params.holderProfile ? JSON.parse(JSON.stringify(S.params.holderProfile)) : null;
  }

  /** Po zavření ⚙️ Geometrie vrátí upravenou geometrii zpět do slotu, který se
   *  otevřel přes ✏️ Upravit. Zapisuje jen dokud je ten slot aktivní — pokud si
   *  uživatel mezitím načetl jiný nůž, patří S.params jemu a slot zůstane. */
  function flushMagSlotEdit() {
    const ref = toolUi.magEditSlotRef;
    toolUi.magEditSlotRef = null;
    if (!ref) return;
    const idx = S.toolMagazine.indexOf(ref);
    if (idx >= 0 && S.activeMagazineSlot === idx) {
      const handBefore = ref.holderHand;
      _syncParamsToSlot(idx);
      if (!toolUi.magEditHandTouched && handBefore !== undefined) ref.holderHand = handBefore;
      saveState();
    }
    toolUi.magEditHandTouched = false;
    if (toolUi.magazineDialogRefresh) toolUi.magazineDialogRefresh();
  }

  /** Uloží AKTUÁLNĚ nastavený nůž (destička i držák z Geometrie nástroje) jako
   * nový slot v zásobníku — pro pozdější použití (✅ Použít jako aktivní). */
  function saveCurrentToolToMagazine(name) {
    pushHistory();
    // Nový slot je hned aktivní, takže jméno zadané při uložení (💾 Uložit
    // nástroj) patří i aktuálnímu nástroji — jinak by ho první zpětný zápis
    // (_syncParamsToSlot po ✏️ Upravit) přepsal starým Názvem nástroje.
    const renamed = !!name && name !== S.params.toolName;
    if (renamed) S.params.toolName = name;
    const nextSlot = S.toolMagazine.length > 0 ? Math.max(...S.toolMagazine.map(s => s.slot)) + 1 : 1;
    const slot = _defaultMagSlot(nextSlot);
    slot.name = S.params.toolName || `T${nextSlot}`;
    S.toolMagazine.push(slot);
    _syncParamsToSlot(S.toolMagazine.length - 1);
    S.activeMagazineSlot = S.toolMagazine.length - 1;
    S.editingMagazineSlot = S.toolMagazine.length - 1;
    if (renamed) fullUpdate(); else saveState();
    showToast(`Nůž (destička + držák) uložen do zásobníku jako T${slot.slot}`);
  }
  return {
    dropInsertGuides, applyParamChange, applyShapeChange, setMachiningSubTab, afterToolChange,
    applyAfterToolChange, applyTipMirrorToggle, _resortToolMagazineToDefaults, _reorderMagazine, _polygonForStrategy,
    _applyMagSlot, _loadMagSlot, _rememberShapeKnife, _loadShapeKnife, _loadPresetKnife,
    _slotToParams, autoPickToolFor, boreEnsureBar, boreHoleSolid, boreEnsurePreDrill,
    boreTakePreHoleFromDrill, _syncParamsToSlot, _paramsIntoSlot, flushMagSlotEdit, saveCurrentToolToMagazine,
  };
}
