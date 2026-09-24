// ╔══════════════════════════════════════════════════════╗
// ║  Polygonový model ZBYTKU pro hlídání držáku (order-aware)        ║
// ╚══════════════════════════════════════════════════════╝
// Vyňato z `ops/roughLong.js` (rozdělení generátoru, plán §3.A) BEZE ZMĚNY
// CHOVÁNÍ — otisk G-kódu 26 fixtures zůstal bajt po bajtu stejný.
//
// Protějšek výškových tabulek (`depthTabs.js`): ty neumí TUNEL, tenhle model
// ano. Celý stšev je za příznakem `orderAwareHolder` — bez něj se funkce
// ptají statické obálky a vrací 0/false.
//
// `residTracker` i `residNoted` zůstávají UVNITŘ — generátor na ně zvenku
// nesáhá, ptá se jen přes vrácené funkce. Plán `docs/cam-order-aware-holder.md`.

import { toolFootprint } from '../../materialRemoval.js';
import { ResidualTracker } from '../../residualTracker.js';
import { residualHolderLoop, holderAreaAlongResidual } from '../../residualHolder.js';
import { ENTRY_FIT_TOL } from '../shared.js';

/**
 * @param prms                 parametry CAM
 * @param stockPathSegments    segmenty polotovaru
 * @param stockLoopOffsetFullL vůlí-posunutá silueta CELÉHO polotovaru
 * @param holderLoopL          obrys držáku, nebo null (hlídání vypnuté)
 * @param passes               živé pole průchodů (líný prefix `syncResidual`)
 * @param offsetStockTopXAtZ   výška offsetové čáry na Z
 * @param step                 hloubka záběru (ap)
 */
export function makeResidualGuard({
  prms, stockPathSegments, stockLoopOffsetFullL, holderLoopL, passes,
  offsetStockTopXAtZ, step,
}) {
  // ── POLYGONOVÝ zbytek pro hlídání držáku (příznak orderAwareHolder) ─────
  // Krok 3 plánu `docs/cam-order-aware-holder.md`. Výškové pole výš neumí
  // TUNEL (zanoření/dojezd podjede pod stojícím materiálem a sloupec se
  // celý srazí na hloubku tunelu — na part-8 to dělalo 11,2 mm, na
  // holder-casting 13,6 mm). Pro ořez HLOUBKOVÝCH intervalů se proto ptáme
  // polygonového modelu.
  //
  // Plní se LÍNĚ z prefixu `passes` — týmž vzorem jako `syncCutFloor` a ze
  // stejného důvodu: průchod se musí posuzovat proti zbytku ve SVÉM
  // okamžiku, ne proti stavu na konci. (Známá mez obou: co se vloží
  // `passes.splice` PŘED značku, se do modelu nedostane. Směr je bezpečný —
  // model pak tvrdí, že materiál stojí.)
  const orderAware = !!prms.orderAwareHolder;
  let residTracker = null, residHolderL = null;
  let residNoted = [];   // průchody, které už jsou v modelu (reference, v pořadí)
  if (orderAware && stockLoopOffsetFullL) {
    residHolderL = holderLoopL ? residualHolderLoop(prms, false) : null;
    if (residHolderL) {
      residTracker = new ResidualTracker(prms, stockPathSegments, {
        seedLoop: stockLoopOffsetFullL, footprint: toolFootprint(prms),
      });
      if (!residTracker.valid) residTracker = null;
    }
  }
  // Dosynchronizuje model na aktuální `passes` a vrátí ho (nebo null).
  const syncResidual = () => {
    if (!residTracker) return null;
    // `passes` se za běhu nejen PLNÍ. Dobírací řetězy se vkládají
    // `passes.splice(at, …)` DOPROSTŘED, konec regionu pořadí přeskládá
    // (`__deferEntry`) a odložené zákroky se usekávají (`tail.length =
    // dropFrom`, `passes.splice(pi, 1)` u rampy). Model umí jen ubírat, ne
    // vracet materiál zpátky, takže jakmile se prefix ROZEJDE s tím, co je
    // zapsané, musí se postavit znovu — jinak si nese řezy zákroků, které
    // nakonec nikdo neudělá, a hlídání pustí držák do materiálu, co tam
    // pořád stojí.
    //
    // Porovnává se IDENTITA objektů, ne jen délka pole: `passes.length`
    // sama o sobě neodhalí zkrácení, po kterém pole zase naroste, ani
    // vložení doprostřed. Je to O(n) porovnání referencí u hrstky volání,
    // tedy nic proti jednomu `polyDifference`.
    let inSync = residNoted.length <= passes.length;
    if (inSync) {
      for (let i = 0; i < residNoted.length; i++) {
        if (passes[i] !== residNoted[i]) { inSync = false; break; }
      }
    }
    if (!inSync) { residTracker.noteAll([]); residNoted = []; }
    for (let i = residNoted.length; i < passes.length; i++) {
      residTracker.notePass(passes[i]);
      residNoted.push(passes[i]);
    }
    return residTracker;
  };
  // Nejhorší vnoření držáku PODÉL VJEZDU zákroku (rampa + nájezd po kontuře),
  // měřené polygonově proti zbytku. Protějšek `holderFitAreaAlong`, který
  // čte výškové pole — a to o tunelech nic neví: krok 1 změřil, že je na
  // `part-8` až 11,2 mm pod realitou právě v pásu Z 117,5–183, kde ten
  // problémový vjezd je.
  const residEntryArea = (p, leadIn, abortAbove = Infinity) => {
    if (!residHolderL) return 0;
    const t = syncResidual();
    if (!t) return 0;
    const pts = [];
    if (p.ramp && Number.isFinite(p.ramp.x0) && Number.isFinite(p.ramp.z0)) {
      pts.push({ x: p.ramp.x0, z: p.ramp.z0 });
    }
    if (Number.isFinite(p.x) && Number.isFinite(p.zStart)) pts.push({ x: p.x, z: p.zStart });
    for (const sg of (leadIn || p.contourLeadIn || [])) {
      if (Number.isFinite(sg.x2) && Number.isFinite(sg.z2)) pts.push({ x: sg.x2, z: sg.z2 });
    }
    if (pts.length < 2) return 0;
    // Krok 2 mm, ne 1 jako u `holderFitAreaAlong`: držák je v ose Z přes
    // 20 mm široký, takže sousední polohy se překrývají z 90 %. Ověřeno —
    // se `step: 0,5` a stropem 256 vyjde na všech 25 fixtures TENTÝŽ
    // výsledek, a jedničku to stojí dvojnásobek režie (part-13 +17 %
    // proti +6 %).
    //
    // Strop 128 (ne 24) proto, aby DLOUHÝ nájezd po kontuře nezředil vzorky
    // RAMPY, na které to celé stojí: `n = min(strop, délka/krok)`, takže
    // s nízkým stropem se u 70mm dráhy krok protáhne na 3 mm. Se 128 je plné
    // rozlišení až do dráhy 256 mm, tedy prakticky vždy.
    return holderAreaAlongResidual(t.loops, residHolderL, pts,
      { ownFoot: toolFootprint(prms), step: 2, maxSamples: 128, abortAbove });
  };
  /**
   * Projde DRŽÁK podél SVISLÉHO zanoření na `z` až na hloubku `X`?
   * Týž dotaz jako `residEntryArea`, jen pro vjezd, který ještě nemá `pass` —
   * sjezd se popíše jako rampa z povrchu (offsetová čára) svisle dolů.
   * Bez order-aware modelu vrací false: statická obálka na tuhle otázku
   * odpovědět neumí (viz komentář u `plungeEntryOk` v hloubkové smyčce).
   */
  const plungeHolderFitsAt = (X, zStart, zEnd) => {
    if (!orderAware || !residHolderL) return false;
    const surfX = offsetStockTopXAtZ(zStart);
    if (surfX === null || !(surfX > X + 0.05)) return false;
    return residEntryArea({ x: X, zStart, zEnd, ramp: { x0: surfX, z0: zStart } }, [], ENTRY_FIT_TOL)
      <= ENTRY_FIT_TOL;
  };
  /**
   * Vnoření DRŽÁKU při SJEZDU na hloubku `X` v ose `z` (mm²), proti zbytku se
   * znalostí pořadí. Na rozdíl od `plungeHolderFitsAt` nepotřebuje, aby nad
   * bodem stál materiál — sjezd se popíše jako svislice z povrchu (je-li nad
   * ním) nebo aspoň o jeden zákrok výš. Bez order-aware modelu vrací 0
   * (statická obálka tuhle otázku spolehlivě nezodpoví — viz krok 6 plánu).
   */
  const entryHolderArea = (X, z) => {
    if (!orderAware || !residHolderL) return 0;
    const surfX = offsetStockTopXAtZ(z);
    const x0 = Math.max(surfX === null ? -Infinity : surfX, X + step);
    return residEntryArea({ x: X, zStart: z, zEnd: z, ramp: { x0, z0: z } }, [], ENTRY_FIT_TOL);
  };

  return { orderAware, residHolderL, residEntryArea, plungeHolderFitsAt, entryHolderArea };
}
