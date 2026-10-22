// ZÁLOŽKA OBRÁBĚNÍ → NÁSTROJ (uživatel 20. 10. 2026: „mám Vrtání, ale pořád
// nastavený polygonální plátek … ať se to přepíná: u vrtání vrták, u závitu
// závitový nůž, u upichování upichovák").
//
// Opačný směr k paramChanges.syncMachTabToTool (nástroj → záložka): klik na
// záložku vybere nástroj její operace ze 🔧 Zásobníku a operaci zapne —
//   Vrtání → vrták (díry z výkresu: vrták na Ø první vybrané skupiny,
//            chybějící Ø se doplní z 📚 katalogu, operace dostanou vrtáky
//            a řezné podmínky — cam/live/liveDrillTools.js),
//   Frézování → blok poháněných nástrojů JEN s frézami (`liveKind: 'mill'`,
//            liveModel.liveRunOps; uživatel 22. 10. 2026: oddělit od vrtání).
//            Nosič části je vrták jako u vrtání (fréza aktivním nožem být
//            nemůže — knifeSlots), frézy volí blok sám podle kapsy / drážky,
//   Závit  → závitový nůž + závitování zapnuto,
//   Upich  → upichovák (kulatý nůž zůstane jen bez upichováku v zásobníku),
//   Hrub./Hot. z cizí operace → v programu po částech PŘEPNOUT na část se
//            soustružením (část s vrtáním zůstane); jinak soustružnický nůž.
// Jedna část programu = jedna operace: má-li část už program jiné operace,
// vrtání / závit / upich se přidá jako NOVÁ část za ni (➕ Operace) — jinak
// by přepnutí nástroje její program přegenerovalo na jinou operaci.
// Vyvrtávání = Hrub. + ◎ Vnitřní (sim/machSurface.js) — tyč si volí přepínač.
// Vyňato do modulu — camSimulator.js (obří soubor) jen předá funkce v ctx.
import { showToast } from '../../../state.js';
import { camConfirm } from '../camSimulatorDialogs.js';
import { getLiveOps, liveOpOn, liveKindOf, liveDrillFromCad } from '../live/liveModel.js';
import { autoDrillTools, addCatalogDrills } from '../live/liveDrillTools.js';
import { addCatalogTapsSpots } from '../live/liveTapTools.js';
import { addCatalogMills } from '../live/liveMillTools.js';

const OWN = { vrt: 'drill', frez: 'drill', zavit: 'threading', upich: 'parting' };
const NAME = { vrt: 'Vrtání', frez: 'Frézování', zavit: 'Závitování', upich: 'Upichnutí' };
// Vrtání a Frézování mají týž nosič (vrták) — liší je druh operací části.
const LIVE = { vrt: 'drill', frez: 'mill' };
/** Druh poháněných operací části s vrtákem (bez `liveKind` = starší část Vrtání). */
const partLive = p => (p.liveKind === 'mill' ? 'mill' : 'drill');
const SPECIAL = new Set(['drill', 'threading', 'parting', 'mill', 'tap']);   // mill = fréza (poháněný nástroj), soustružit s ní nejde

/**
 * Co klik na záložku udělá s nástrojem (čistá funkce, test machtab-tool):
 *   'keep' — nástroj už odpovídá, jen přepnout záložku,
 *   'tool' — vybrat nástroj operace v téže části,
 *   'part' — nová část programu (dosavadní program zůstane) a v ní nástroj.
 * @param S { params: { toolShape }, manualGCode }
 */
export function machTabPlan(tab, S) {
  const shape = S.params.toolShape;
  const own = OWN[tab];
  if (!own) return (tab === 'hrub' || tab === 'hot') && SPECIAL.has(shape) ? 'tool' : 'keep';
  if (shape === own && (!LIVE[tab] || partLive(S.params) === LIVE[tab])) return 'keep';
  return String(S.manualGCode || '').trim() ? 'part' : 'tool';
}

/**
 * Klik na záložku obrábění.
 * @param ctx funkce simulátoru z attachParamsEvents (S, setMachiningSubTab,
 *   applyChange, pushHistory, autoPickToolFor, _applyMagSlot, handleAddOperation,
 *   partsActive, _isoMagSlot)
 */
export async function machTabClick(tab, ctx) {
  const { S } = ctx;
  const rootEl = ctx.tabBody && ctx.tabBody.closest('.cam-sim-root');
  // Frézování bez vybraného frézování z výkresu: jen ukázat záložku (návod,
  // jak kapsy / drážky přidat) — nezakládat prázdnou část ani neměnit nástroj.
  if (tab === 'frez' && machTabPlan(tab, S) !== 'keep' && !getLiveOps(S.params).some(o => liveOpOn(o) && liveKindOf(o) === 'mill')) {
    if (ctx.setMachiningSubTab(tab)) ctx.applyChange();
    return true;
  }
  // V náhledu „Celý program" patří panel celku — nástroj se mění v části.
  if (S.opView === 'all' && ctx.partsActive() && machTabPlan(tab, S) !== 'keep') {
    const partBtn = rootEl && rootEl.querySelector('.cam-sim-parts-bar [data-op-view="part"]');
    if (partBtn) partBtn.click();
  }
  const plan = machTabPlan(tab, S);
  // Závitový nůž už je, jen závitování vypnuté → záložka = operace, zapnout.
  if (plan === 'keep' && tab === 'zavit' && !S.params.threadActive) {
    ctx.pushHistory();
    S.params.threadActive = true; S.params.drillActive = false; S.params.boreActive = false;
    ctx.setMachiningSubTab('zavit');
    showToast(`Závitování ${S.params.threadName || ''} aktivní`, 3000);
    ctx.applyChange({ cycle: true });
    return true;
  }
  // Vrták už je, ale díry z výkresu mají jiný Ø (např. přidaný Ø10 vs aktivní
  // Ø20 — uživatel 21. 10. 2026) → vybrat vrták jejich operace.
  if (plan === 'keep' && tab === 'vrt' && S.params.drillSource !== 'axis' && getLiveOps(S.params).some(liveOpOn)) return pickDrill(ctx);
  if (plan === 'keep' && tab === 'frez') return pickDrill(ctx, 'mill');
  if (plan === 'keep') { if (ctx.setMachiningSubTab(tab)) ctx.applyChange(); return true; }
  const goPart = i => {
    const chip = i >= 0 && rootEl && rootEl.querySelector(`.cam-sim-parts-bar [data-op="${i}"]`);
    if (!chip) return false;
    chip.click();
    if (ctx.setMachiningSubTab(tab)) ctx.applyChange();
    showToast(`${OWN[tab] ? NAME[tab] : 'Soustružení'} je v části ${i + 1} — přepnuto na ni`, 3000);
    return true;
  };
  // Operace už má svou část → přepnout na ni (nezakládat další ani
  // nepřepisovat tuhle část — např. upich na vrtání).
  if (OWN[tab] && ctx.partsActive() && goPart(opPartIndex(S, tab))) return true;
  // Prázdná poslední část (vznikla, ale nemá dráhy) → použít ji, nezakládat.
  const parts = S.opParts || [];
  const lastEmpty = ctx.partsActive() && parts.length && !String(parts[parts.length - 1].gcode || '').trim()
    && S.activePart !== parts.length - 1;
  if (plan === 'part' && lastEmpty) {
    const chip = rootEl && rootEl.querySelector(`.cam-sim-parts-bar [data-op="${parts.length - 1}"]`);
    if (chip) {
      chip.click();
      parts[parts.length - 1].name = `Část ${parts.length} – ${NAME[tab]}`;
    }
  } else if (plan === 'part') {
    const ok = await camConfirm(`${NAME[tab]} bude samostatná operace: dosavadní program této části (${partOpName(S)}) zůstane a ${NAME[tab].toLowerCase()} se přidá jako nová část na konec programu (➕ Operace). Pokračovat?`);
    if (!ok) return false;
    const before = ctx.partsActive() ? S.opParts.length : 0;
    await ctx.handleAddOperation({ noConfirm: true });
    if ((ctx.partsActive() ? S.opParts.length : 0) <= before) return false;   // nevznikla (hláška už byla)
    // Část se jmenuje podle operace, ne podle nože, se kterým vznikla.
    const part = S.opParts[S.activePart];
    if (part) part.name = `Část ${S.activePart + 1} – ${NAME[tab]}`;
  }
  // Soustružnický nůž si zapamatovat — Hrub./Hot. ho pak vrátí.
  if (!SPECIAL.has(S.params.toolShape) && Number.isInteger(S.activeMagazineSlot)) S._turnSlot = S.activeMagazineSlot;
  if (tab === 'vrt') return pickDrill(ctx);
  if (tab === 'frez') return pickDrill(ctx, 'mill');
  if (tab === 'zavit') {
    ctx.pushHistory();
    S.params.threadActive = true; S.params.drillActive = false; S.params.boreActive = false;
    const picked = ctx.autoPickToolFor('thread').msg;
    ctx.setMachiningSubTab('zavit');
    showToast(`Závitování ${S.params.threadName || ''} aktivní${picked}`, 4000);
    ctx.applyChange({ cycle: true });
    return true;
  }
  if (tab === 'upich') {
    ctx.pushHistory();
    S.params.threadActive = false; S.params.boreActive = false;
    // ◎ Vnitřní (zápich v díře) = zapichovací tyč, jinak upichovák.
    const inner = !!S.params.partOffInner;
    const picked = ctx.autoPickToolFor(inner ? 'groovein' : 'partoff');
    ctx.setMachiningSubTab('upich');
    showToast(inner
      ? `Zápich v díře${picked.msg || ' — zapichovací tyč'} · bok zápichu u ústí naklikněte v záložce`
      : `Upichnutí${picked.msg || ' — upichovák'} · bod upichnutí naklikněte v záložce`, 4000);
    ctx.applyChange({ cycle: true });
    return true;
  }
  // Hrub. / Hot. z vrtání, závitu nebo upichu: v programu po částech přepnout
  // na (poslední) část se soustružením — část s vrtáním se nepřepisuje.
  if (ctx.partsActive() && goPart(turningPartIndex(S))) return true;
  // Hrub. / Hot. z vrtání, závitu nebo upichu → soustružnický nůž.
  const mag = S.toolMagazine;
  let idx = Number.isInteger(S._turnSlot) && mag[S._turnSlot] && !SPECIAL.has(mag[S._turnSlot].shape) ? S._turnSlot : -1;
  if (idx < 0) idx = mag.findIndex(s => s && !SPECIAL.has(s.shape));
  if (idx < 0) { showToast('⚠ V 🔧 Zásobníku není soustružnický nůž'); return false; }
  const was = S.params.toolShape;
  ctx.pushHistory();
  S.params.threadActive = false;
  ctx.setMachiningSubTab(tab);
  ctx._applyMagSlot(idx);   // z vrtáku přegeneruje samo (afterToolChange)
  if (was !== 'drill') ctx.applyChange({ cycle: true });   // ze závitu / upichu
  showToast(`Soustružení — nůž T${mag[idx].slot} ${mag[idx].name}`, 3000);
  return true;
}

/** Název operace aktivní části pro hlášky. */
function partOpName(S) {
  const p = S.params;
  if (p.toolShape === 'drill') return partLive(p) === 'mill' ? 'frézování' : 'vrtání';
  if (p.threadActive || p.toolShape === 'threading') return 'závitování';
  if (p.partOffZ != null || p.toolShape === 'parting') return 'upichnutí';
  return 'soustružení';
}

/** Index poslední (jiné než aktivní) části s operací záložky `tab`, nebo −1. */
export function opPartIndex(S, tab) {
  const own = OWN[tab];
  const parts = S.opParts || [];
  for (let i = parts.length - 1; i >= 0; i--) {
    const pp = parts[i].params || {};
    if (i === S.activePart || !own) continue;
    if (LIVE[tab] ? pp.toolShape === own && partLive(pp) === LIVE[tab] : (pp.toolShape === own || (tab === 'zavit' && pp.threadActive))) return i;
  }
  return -1;
}

/** Index poslední části programu se soustružnickým nožem, nebo −1. */
export function turningPartIndex(S) {
  const parts = S.opParts || [];
  for (let i = parts.length - 1; i >= 0; i--) {
    const pp = parts[i].params || {};
    if (i !== S.activePart && !SPECIAL.has(pp.toolShape) && !pp.threadActive && pp.partOffZ == null) return i;
  }
  return -1;
}

/**
 * Operace Vrtání děr z výkresu: nástroj části = vrták PRVNÍ vybrané skupiny
 * (operace má T8 Ø10, nahoře zůstal dřív vybraný Ø20 — uživatel 21. 10.
 * 2026). Volá ho úprava operací v ◎ (livePanel.commit přes S._syncLiveDrill
 * — cam/live nesmí importovat cam/sim).
 * @returns true = nástroj přepnut (_applyMagSlot přegeneroval program)
 */
export function syncLiveDrillTool(ctx) {
  const { S } = ctx;
  if (!S.params.drillActive || partLive(S.params) === 'mill' || !liveDrillFromCad(S.params)) return false;
  const first = getLiveOps(S.params).find(o => liveOpOn(o) && o.kind === 'drill' && !o.role);
  const idx = first ? S.toolMagazine.findIndex(s => s.shape === 'drill' && s.slot === first.toolNo) : -1;
  if (idx < 0 || idx === S.activeMagazineSlot) return false;
  ctx._applyMagSlot(idx);
  return true;
}

/**
 * Vrtání: vrták podle děr z výkresu (nebo první v zásobníku) a přegenerovat.
 * Frézování (`kind` 'mill'): týž blok poháněných nástrojů, jen s frézami —
 * chybějící frézy z 📚, nosič části = vrták (aktivní, jinak první v zásobníku).
 */
function pickDrill(ctx, kind = 'drill') {
  const { S } = ctx;
  const mill = kind === 'mill', tab = mill ? 'frez' : 'vrt';
  let idx = -1, note = '';
  const wasOn = !!S.params.drillActive && partLive(S.params) === kind;
  const before = JSON.stringify([S.params.liveOps, S.toolMagazine.length]);
  ctx.pushHistory();   // před změnou operací i zásobníku — ↩ vrátí obojí
  // „Středová díra v ose" (drillSource 'axis'): vrták děr z výkresu nevnucovat.
  if ((mill || S.params.drillSource !== 'axis') && getLiveOps(S.params).some(o => liveOpOn(o) && liveKindOf(o) === kind)) {
    const pre = autoDrillTools(getLiveOps(S.params), S.toolMagazine, S.params);
    const miss = pre.missing.filter(m => (m.kind === 'mill') === mill);
    if (miss.length && ctx._isoMagSlot) {
      const added = mill
        // Chybějící frézy (kapsa, drážka, pero) z 📚 katalogu fréz.
        ? addCatalogMills(S.toolMagazine, miss.filter(m => m.D).map(m => m.D), ctx._isoMagSlot)
        : [
          ...addCatalogDrills(S.toolMagazine, miss.filter(m => !m.kind).map(m => m.D), ctx._isoMagSlot),
          // Navrtávák a závitník k dírám z výkresu (navrtání / závit).
          ...addCatalogTapsSpots(S.toolMagazine, miss, ctx._isoMagSlot),
        ];
      if (added.length) note = ` · do 🔧 Zásobníku přidán ${added.map(s => `T${s.slot} ${s.name}`).join(', ')}`;
    }
    const auto = autoDrillTools(getLiveOps(S.params), S.toolMagazine, S.params);
    S.params.liveOps = auto.ops;
    const first = mill ? null : (auto.ops.find(o => liveOpOn(o) && o.kind === 'drill' && !o.role) || auto.ops.find(o => liveOpOn(o) && o.kind === 'drill'));
    if (first) idx = S.toolMagazine.findIndex(s => s.shape === 'drill' && s.slot === first.toolNo);
  } else if (mill) {
    showToast('Žádné vybrané frézování z výkresu — kapsy a drážky nakreslete v CAD (◎ Čelo) nebo je přidejte v ◎ pohledu na čelo → 🛠 Operace', 5000);
  }
  // Frézování: nosič části = vrták, který už je aktivní, jinak první v zásobníku.
  if (idx < 0 && mill && S.params.toolShape === 'drill' && (S.toolMagazine[S.activeMagazineSlot] || {}).shape === 'drill') idx = S.activeMagazineSlot;
  if (idx < 0) idx = S.toolMagazine.findIndex(s => s.shape === 'drill');
  if (idx < 0) {
    showToast(mill
      ? '⚠ Frézování z výkresu je blok poháněných nástrojů a jeho část nese vrták — v 🔧 Zásobníku žádný není, přidej ho z 🧰 Knihovna → 📚 ISO katalog → Vrtáky'
      : '⚠ V 🔧 Zásobníku není vrták — přidej ho z 🧰 Knihovna → 📚 ISO katalog → Vrtáky', 5000);
    if (ctx.setMachiningSubTab(tab)) ctx.applyChange();
    return false;
  }
  S.params.threadActive = false; S.params.boreActive = false;
  if (S.params.partOffZ != null) S.params.partOffZ = null;
  S.params.drillActive = true;
  const kindChanged = S.params.liveKind !== kind;
  S.params.liveKind = kind;
  const tabChanged = ctx.setMachiningSubTab(tab);
  if (wasOn && idx === S.activeMagazineSlot) {
    // Vrták už sedí — přegenerovat jen po změně operací / zásobníku. Jinak
    // aspoň překreslit panel: setMachiningSubTab jen přepne stav, a bez
    // applyChange zůstala vidět stará záložka (Hrub.) a „Co vrtat" se
    // ukázalo až po kliku na nástroj (uživatel z mobilu 22. 10. 2026).
    if (kindChanged || JSON.stringify([S.params.liveOps, S.toolMagazine.length]) !== before) ctx.applyChange({ cycle: true });
    else if (tabChanged) ctx.applyChange();
    return true;
  }
  // Týž vrták, jen jiný druh operací (část Vrtání ↔ Frézování) — přegenerovat.
  if (idx === S.activeMagazineSlot && S.params.toolShape === 'drill') ctx.applyChange({ cycle: true });
  else ctx._applyMagSlot(idx);   // vrták ↔ nůž = jiná operace → přegeneruje (afterToolChange)
  const slot = S.toolMagazine[idx];
  showToast(mill ? `Frézování z výkresu${note}` : `Vrtání — vrták T${slot.slot} ${slot.name}${note}`, 4500);
  return true;
}
