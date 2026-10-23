// OBRÁBĚNÍ VNĚJŠÍ / VNITŘNÍ (uživatel 22. 10. 2026: „zrušíš vyvrtávání
// a přidáš do obrábění pod zleva a zprava další dvě možnosti — vnější
// a vnitřní … ať je vždy logické, co chci vlastně dělat").
//
// Přepínač pod Zleva / Zprava patří OPERACI záložky — nemá vlastní stav,
// čte a přepíná přímo její parametr, takže nemůže tvrdit něco jiného, než
// co program dělá (i když závit načte z výkresu jako vnitřní):
//   Hrub.  vnitřní = vyvrtávání vyvrtávací tyčí (`boreActive`, ops/bore.js,
//          pravidlo 13 — zrcadlo vnějšího hrubování),
//   Hot.   vnitřní = jen dokončení v díře (`boreActive` + `finishOnly`,
//          doplnění pravidla 13 z 22. 10. 2026 — díra vyhrubovaná
//          s přídavky, ops/boreFinish.js),
//   Upich  vnitřní = zápich v díře vnitřní zapichovací tyčí (`partOffInner`,
//          doplnění pravidla 13 z 22. 10. 2026, ops/grooveInner.js),
//   Závit  vnitřní = vnitřní závit (`threadExternal: false`).
//   Upich  ⊚ Čelní = čelní (axiální) zápich do čela (`partOffFace`,
//          pravidlo 19 z 23. 10. 2026, ops/grooveFace.js).
// Vrtání a Frézování jsou z podstaty „do materiálu" — přepínač nemají.
import { showToast } from '../../../state.js';
import { threadProfileDepth } from '../threadHelpers.js';
import { isoBoringBarDiameter } from '../../isoInternalTools.js';
import { partHoleDiameter } from './grooveSim.js';
import { faceGroovesFromDrawing } from './grooveCad.js';

// Nože, se kterými se vně nesoustruží (vlastní operace / poháněné nástroje).
const SPECIAL = new Set(['drill', 'threading', 'parting', 'mill', 'tap']);
/** Vnější soustružnický nůž (ne vyvrtávací tyč ani nástroj jiné operace). */
const outerKnife = s => !!s && !SPECIAL.has(s.shape) && isoBoringBarDiameter(s.name) === null;

/** Záložky, u kterých má přepínač smysl (a je vidět). */
export const SURFACE_TABS = new Set(['hrub', 'hot', 'upich', 'zavit']);

/** Je operace záložky `tab` vnitřní? (čte jen její parametr) */
export function surfaceInner(prms, tab) {
  if (tab === 'zavit') return prms.threadExternal === false;
  if (tab === 'hrub' || tab === 'hot') return !!prms.boreActive;
  if (tab === 'upich') return !!prms.partOffInner && !prms.partOffFace;
  return false;
}

/** Plocha operace záložky: 'outer' | 'inner' | 'face' (čelní jen Upich). */
export function surfaceMode(prms, tab) {
  if (tab === 'upich' && prms.partOffFace) return 'face';
  return surfaceInner(prms, tab) ? 'inner' : 'outer';
}

/** Obrábí program uvnitř díry? (čip souhrnu Obrábění) */
export function programInner(prms) {
  const partOff = prms.partOffZ != null && isFinite(parseFloat(prms.partOffZ));
  return !!prms.boreActive || (!!prms.threadActive && prms.threadExternal === false) || (partOff && !!prms.partOffInner && !prms.partOffFace);
}

/**
 * Klik na ◯ Vnější / ◎ Vnitřní.
 * @param ctx { tabBody, S, applyChange, pushHistory, autoPickToolFor,
 *   boreHoleSolid, boreEnsurePreDrill, boreTakePreHoleFromDrill, boreEnsureBar,
 *   _applyMagSlot }
 */
export function attachSurfaceEvents(ctx) {
  const { tabBody, S } = ctx;
  tabBody.querySelectorAll('[data-surface]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = S.machiningSubTab || 'hrub';
      const mode = btn.dataset.surface;
      const inner = mode === 'inner';
      if (!SURFACE_TABS.has(tab) || surfaceMode(S.params, tab) === mode) return;
      if (tab === 'zavit') setThreadInner(inner, ctx);
      else if (tab === 'upich') setGrooveMode(mode, ctx);
      else setBore(inner, ctx, tab === 'hot');
    });
  });
  // „Vypnout vyvrtávání" z varování v ostatních záložkách = ◯ Vnější u Hrub.
  const boreOffBtn = tabBody.querySelector('[data-act="bore-deactivate"]');
  if (boreOffBtn) boreOffBtn.addEventListener('click', () => setBore(false, ctx));
}

/**
 * Hrub. / Hot. vnitřní ↔ vnější = vyvrtávání zap / vyp (dřív ✅ Aktivní
 * v záložce Vyvrt.). `finish` (Hot.): zapnout jen dokončení v díře —
 * záložka říká, co uživatel chce, takže ◎ v Hrub. jen dokončení vypne.
 */
function setBore(on, ctx, finish = false) {
  const { S, applyChange, pushHistory } = ctx;
  pushHistory();   // zapnutí může vyměnit nůž i převzít předvrtání — jeden krok ↩
  S.params.boreActive = on;
  if (on) S.params.finishOnly = finish;
  let picked = '', off = '', pre = '';
  const mag = S.toolMagazine || [];
  if (on && outerKnife(mag[S.activeMagazineSlot])) S._turnSlot = S.activeMagazineSlot;   // ◯ Vnější ho vrátí
  if (!on && isoBoringBarDiameter(S.params.toolName) !== null) {
    // Vyvrtávací tyč zvenku nesoustruží — zpět naposledy použitý vnější nůž.
    let idx = outerKnife(mag[S._turnSlot]) ? S._turnSlot : -1;
    if (idx < 0) idx = mag.findIndex(outerKnife);
    if (idx >= 0 && ctx._applyMagSlot) {
      ctx._applyMagSlot(idx);
      picked = ` — nůž T${mag[idx].slot} ${mag[idx].name}`;
    }
  }
  if (on) {
    // Jeden cyklus na program (pořadí early-returnů v generateAutoGCode).
    if (S.params.threadActive) { S.params.threadActive = false; off += ', závit vypnut'; }
    if (S.params.drillActive) { S.params.drillActive = false; off += ', vrtání vypnuto'; }
    if (S.params.partOffZ != null) { S.params.partOffZ = null; S.partOffPickMode = false; off += ', upich zrušen'; }
    // Díra v polotovaru plná → nejdřív vrták, pak tyč (ops/borePreDrill.js).
    // Jen dokončení díru nevrtá (je vyhrubovaná) — předvrtání jen převezme.
    if (finish) pre = S.params.borePreDrill ? '' : ctx.boreTakePreHoleFromDrill();
    else pre = (S.params.borePreDrill || ctx.boreHoleSolid()) ? ctx.boreEnsurePreDrill() : ctx.boreTakePreHoleFromDrill();
    picked = ctx.boreEnsureBar();
  }
  const regen = !S.gcodeDirty;
  showToast(on
    ? `◎ Vnitřní — ${finish ? 'jen dokončení v díře (vyhrubované s přídavky)' : 'vyvrtávání'}${pre}${picked}${off}${regen ? ' — dráhy přegenerovány' : ' — program má ruční úpravy, dráhy vygeneruj přes 🔄 Dráhy'}`
    : `◯ Vnější — vyvrtávání vypnuto, zpět na hrubování${picked}${regen ? '' : ' (dráhy vygeneruj přes 🔄 Dráhy)'}`);
  applyChange({ cycle: true });
}

/**
 * Upich vnitřní ↔ vnější = zápich v díře ↔ upichnutí. Vnitřní vybere
 * zapichovací tyč (zásobník, jinak katalog) a předvyplní dno zápichu kousek
 * za stěnou díry; vnější vrátí upichovák (ne tyč).
 */
function setGrooveMode(mode, ctx) {
  const { S, applyChange, pushHistory, autoPickToolFor } = ctx;
  const inner = mode === 'inner', face = mode === 'face';
  pushHistory();   // může vyměnit nůž a vypnout jiný cyklus — jeden krok ↩
  S.params.partOffInner = inner;
  S.params.partOffFace = face;
  let off = '', picked = '';
  const active = S.params.partOffZ != null && isFinite(parseFloat(S.params.partOffZ));
  if (face) {
    // Jeden cyklus na program; zápich z výkresu předvyplní Z čela, ⌀d1/⌀d2 a hloubku.
    if (S.params.boreActive) { S.params.boreActive = false; off += ', vyvrtávání vypnuto'; }
    if (S.params.threadActive) { S.params.threadActive = false; off += ', závit vypnut'; }
    if (S.params.drillActive) { S.params.drillActive = false; off += ', vrtání vypnuto'; }
    const g = faceGroovesFromDrawing(S)[0];
    if (g && !(parseFloat(S.params.faceGrooveD2) > 0)) {
      Object.assign(S.params, { partOffZ: g.zFace, faceGrooveD1: g.d1, faceGrooveD2: g.d2, faceGrooveDepth: g.t, grooveChamfer: g.s || 0 });
      off += `, zápich ⌀${g.d1}–${g.d2} × ${g.t} z výkresu`;
    }
    picked = autoPickToolFor('grooveface').msg;
    const regen = !S.gcodeDirty;
    const on = S.params.partOffZ != null && isFinite(parseFloat(S.params.partOffZ));
    showToast(`⊚ Čelní — zápich do čela${on ? '' : ' (Z čela naklikej ✂️ Ukázat bod)'}${picked}${off}${regen ? '' : ' — dráhy vygeneruj přes 🔄 Dráhy'}`);
    applyChange({ cycle: true });
    return;
  }
  if (inner) {
    const mag = S.toolMagazine || [];
    if (outerKnife(mag[S.activeMagazineSlot])) S._turnSlot = S.activeMagazineSlot;
    // Jeden cyklus na program; díra (⌀ vyvrtávání / předvrtání) v parametrech zůstává.
    if (S.params.boreActive) { S.params.boreActive = false; off += ', vyvrtávání vypnuto'; }
    if (S.params.threadActive) { S.params.threadActive = false; off += ', závit vypnut'; }
    if (S.params.drillActive) { S.params.drillActive = false; off += ', vrtání vypnuto'; }
    picked = ctx.grooveEnsureBar ? ctx.grooveEnsureBar() : autoPickToolFor('groovein').msg;
    const D = partHoleDiameter(S);   // ruční ⌀ / díra v polotovaru části / vyvrtávání
    if (D > 0 && !(parseFloat(S.params.grooveBottomX) > D / 2)) S.params.grooveBottomX = Math.round((D / 2 + 1) * 1000) / 1000;
  } else {
    picked = autoPickToolFor('partoff').msg;
  }
  const regen = !S.gcodeDirty;
  showToast(inner
    ? `◎ Vnitřní — zápich v díře${active ? '' : ' (bok u ústí naklikej ✂️ Ukázat bod)'}${picked}${off}${regen ? '' : ' — dráhy vygeneruj přes 🔄 Dráhy'}`
    : `◯ Vnější — upichnutí${picked}${regen ? '' : ' (dráhy vygeneruj přes 🔄 Dráhy)'}`);
  applyChange({ cycle: true });
}

/** Závit vnitřní ↔ vnější (dřív přepínač v záložce Závit). */
function setThreadInner(inner, ctx) {
  const { S, applyChange, pushHistory, autoPickToolFor } = ctx;
  const ext = !inner;
  // Při aktivním závitu se vymění i nůž (vnější ER / vnitřní IR destička) — jeden krok ↩.
  if (S.params.threadActive) pushHistory();
  S.params.threadExternal = ext;
  // Vnější/vnitřní mění hloubku profilu (60°: 0,6134P vs 0,5413P).
  S.params.threadDepth = Math.round(threadProfileDepth(S.params.threadType, parseFloat(S.params.threadPitch) || 0, ext) * 1000) / 1000;
  const pick = S.params.threadActive ? autoPickToolFor('thread') : { msg: '' };
  if (pick.msg) showToast(`Závit ${ext ? 'vnější' : 'vnitřní'}${pick.msg}`);
  applyChange();
}
