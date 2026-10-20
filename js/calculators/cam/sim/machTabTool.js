// ZÁLOŽKA OBRÁBĚNÍ → NÁSTROJ (uživatel 20. 10. 2026: „mám Vrtání, ale pořád
// nastavený polygonální plátek … ať se to přepíná: u vrtání vrták, u závitu
// závitový nůž, u upichování upichovák").
//
// Opačný směr k paramChanges.syncMachTabToTool (nástroj → záložka): klik na
// záložku vybere nástroj její operace ze 🔧 Zásobníku a operaci zapne —
//   Vrtání → vrták (díry z výkresu: vrták na Ø první vybrané skupiny,
//            chybějící Ø se doplní z 📚 katalogu, operace dostanou vrtáky
//            a řezné podmínky — cam/live/liveDrillTools.js),
//   Závit  → závitový nůž + závitování zapnuto,
//   Upich  → upichovák (kulatý nůž zůstane jen bez upichováku v zásobníku),
//   Hrub./Hot. z cizí operace → v programu po částech PŘEPNOUT na část se
//            soustružením (část s vrtáním zůstane); jinak soustružnický nůž.
// Jedna část programu = jedna operace: má-li část už program jiné operace,
// vrtání / závit / upich se přidá jako NOVÁ část za ni (➕ Operace) — jinak
// by přepnutí nástroje její program přegenerovalo na jinou operaci. Vyvrt.
// (vnitřní hrubování) si nástroj volí sám tlačítkem v záložce.
// Vyňato do modulu — camSimulator.js (obří soubor) jen předá funkce v ctx.
import { showToast } from '../../../state.js';
import { camConfirm } from '../camSimulatorDialogs.js';
import { getLiveOps, liveOpOn } from '../live/liveModel.js';
import { autoDrillTools, addCatalogDrills } from '../live/liveDrillTools.js';

const OWN = { vrt: 'drill', zavit: 'threading', upich: 'parting' };
const NAME = { vrt: 'Vrtání', zavit: 'Závitování', upich: 'Upichnutí' };
const SPECIAL = new Set(['drill', 'threading', 'parting']);

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
  if (shape === own) return 'keep';
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
    const picked = ctx.autoPickToolFor('partoff');
    ctx.setMachiningSubTab('upich');
    showToast(`Upichnutí${picked.msg || ' — upichovák'} · bod upichnutí naklikněte v záložce`, 4000);
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
  if (p.toolShape === 'drill') return 'vrtání';
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
    if (i !== S.activePart && own && (pp.toolShape === own || (tab === 'zavit' && pp.threadActive))) return i;
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

/** Vrtání: vrták podle děr z výkresu (nebo první v zásobníku) a přegenerovat. */
function pickDrill(ctx) {
  const { S } = ctx;
  let idx = -1, note = '';
  ctx.pushHistory();   // před změnou operací i zásobníku — ↩ vrátí obojí
  if (getLiveOps(S.params).some(liveOpOn)) {
    const pre = autoDrillTools(getLiveOps(S.params), S.toolMagazine, S.params);
    if (pre.missing.length && ctx._isoMagSlot) {
      const added = addCatalogDrills(S.toolMagazine, pre.missing.map(m => m.D), ctx._isoMagSlot);
      if (added.length) note = ` · do 🔧 Zásobníku přidán ${added.map(s => `T${s.slot} ${s.name}`).join(', ')}`;
    }
    const auto = autoDrillTools(getLiveOps(S.params), S.toolMagazine, S.params);
    S.params.liveOps = auto.ops;
    const first = auto.ops.find(o => liveOpOn(o) && o.kind === 'drill');
    if (first) idx = S.toolMagazine.findIndex(s => s.shape === 'drill' && s.slot === first.toolNo);
  }
  if (idx < 0) idx = S.toolMagazine.findIndex(s => s.shape === 'drill');
  if (idx < 0) {
    showToast('⚠ V 🔧 Zásobníku není vrták — přidej ho z 🧰 Knihovna → 📚 ISO katalog → Vrtáky', 5000);
    if (ctx.setMachiningSubTab('vrt')) ctx.applyChange();
    return false;
  }
  S.params.threadActive = false; S.params.boreActive = false;
  if (S.params.partOffZ != null) S.params.partOffZ = null;
  S.params.drillActive = true;
  ctx.setMachiningSubTab('vrt');
  ctx._applyMagSlot(idx);   // vrták ↔ nůž = jiná operace → přegeneruje (afterToolChange)
  const slot = S.toolMagazine[idx];
  showToast(`Vrtání — vrták T${slot.slot} ${slot.name}${note}`, 4500);
  return true;
}
