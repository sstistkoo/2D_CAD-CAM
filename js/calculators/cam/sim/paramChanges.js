// Změny parametrů nástroje v CAM simulátoru: pole panelu i okna Geometrie,
// tlačítka tvaru (nůž tvaru ze zásobníku), záložka obrábění podle nástroje,
// přepočet po výměně nástroje, ⇄ strana vrcholového úhlu. Vyňato
// z camSimulator.js (docs/plan-rozdeleni-cam-simulatoru.md); se sloty
// zásobníku (knifeSlots.js) se volají navzájem — skládá je knives.js.
import { showToast } from '../../../state.js';
import { getInsert } from '../inserts/index.js';
import { enforceInsertOperation } from '../calculatePipeline.js';
import { decideChange } from '../gcodeSync.js';
import { HOLDER_SIZE_PARAMS, insertOfParams, holderForResizedInsert } from '../holderFollowsInsert.js';
import { applyCatalogSize } from '../catalogInsertSize.js';
import { threadProfileDepth } from '../threadHelpers.js';

/** @param ctx { S, applyChange, renderTab, withBusy, _rememberShapeKnife, _loadShapeKnife, _polygonForStrategy } */
export function createParamChanges({ S, applyChange, renderTab, withBusy, _rememberShapeKnife, _loadShapeKnife, _polygonForStrategy }) {
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
  return { dropInsertGuides, applyParamChange, applyShapeChange, setMachiningSubTab, afterToolChange, applyAfterToolChange, applyTipMirrorToggle };
}
