// ╔══════════════════════════════════════════════════════════════╗
// ║  STRMÝ NEBO ZASYPANÝ NÁJEZD → ŘETĚZ RAMP Z MĚLČÍ VRSTVY        ║
// ╚══════════════════════════════════════════════════════════════╝
// Klíč plátku `leadInSteepToChain` (dnes jen kulatá, viz inserts/round.js).
//
// „Kapsa po kontuře" jede do vrstvy nájezdem po offsetové dráze od konce
// předchozího intervalu. Dráha ale nehlídá úhel zanoření — vede, kudy vede
// kontura. Nález uživatele 29. 9. 2026 (kulatá R 10, zleva, „✂ Po úsecích",
// úsek 2, díl projekt_2026-09-29):
//  • vrstvy X 13,095 … 0 u čela konce dílu sjížděly po offsetu čela 84°
//    (`G1 X13.095 Z355.532`, `G1 X5.595 Z356.333` …) — pravidlo 6 dovoluje
//    kulaté 45°; klín pod mezní čarou čela má zůstat stát,
//  • vrstva X 5,595 začínala nájezdem přes celý díl: `G1 X19.243` kolmo
//    (13 mm² do klínu u stěny drážky), pak 23 + 21 + 58 mm posuvem po hotovém.
//    Zkrácení na ocas pod mělčí vrstvou (`leadInTailBelowPrev`) tu nepomohlo —
//    i ocas začínal pod klínem, který nechala rampa vrstvy X 8,095.
//
// Vrstva X 8,095 přitom ukazuje, jak to má být: rampa pod úhlem zanoření ze
// ZAČÁTKU vrstvy o ap výš (řetěz ramp, jako `chainFromPrev` v pocketPass.js).
// Tady se tentýž vjezd použije i pro vrstvu, jejíž nájezd:
//  (a) začíná pod materiálem — sjet k němu jde jen kolmo (zápich), nebo
//  (b) obsahuje úsečku, která klesá strměji než úhel zanoření a řeže.
// Rampa na konci vrstvy o ap výš by zasypala začátek dalšího průchodu
// v řetězu — proto (c) i rampa, jejíž začátek leží pod materiálem, se
// přestaví na řetěz (jinak by se o vrstvu níž zapichovalo znovu).
//
// Měří se proti PODLAZE průchodů PŘED tím průchodem v pořadí obrábění
// (`notePassInto`, týž model jako `alreadyCut.js`), ne proti plánovacímu
// stavu z doby, kdy se vrstva plánovala — ten je u otevřených intervalů
// o celé dojezdy a zkrácené nájezdy jinde (u X 5,595 hlásil 0 mm² místo 13).
//
// Když řetěz nejde (držák, kontura, mělčí vrstva tam nejela), zůstane nájezd,
// jak byl — materiál navíc se neubírá za cenu kolize.
//
// VODOROVNÝ ZAČÁTEK U KONCE POLOTOVARU SE NEJDŘÍV PRODLOUŽÍ. Nájezd po
// plošině levého konce dílu začínal jen o Vůli Z před polotovarem (`G0 Z-9 /
// G1 X41.066`, úsek 1 téhož dílu) — kružnice nosu R 10 tam bokem zapichovala
// do rohu. Řetěz by tu vzal dno vrstvy (0,55 mm nad přídavkem by zůstalo),
// takže se začátek nejdřív posune dozadu po téže výšce do vzduchu (nejvýš
// R + Vůle Z + 1 mm) — jako běžný nájezd posuvem ostatních vrstev.

import { HOLDER_FIT_TOL } from '../shared.js';

const CUT_TOL = 0.05;        // mm² — pod tím je to dotyk, ne zápich
const MIN_BODY = 0.05;       // mm — tolik musí z vrstvy za rampou zůstat

export function makeLeadInChain({ T, newCutArea, step, plungeTan, offsetXAt,
  holderFitArea, ownCutOf, rampDipTol, backReach, noseReach }) {
  const floor = T.newFloorTab();
  let prev = null;
  // Podlaha roste průchod po průchodu: předchozí se zapíše až tady, kdy už
  // prošel všemi úpravami své iterace (ořez nájezdu, dojezdu…).
  const advance = (p) => {
    if (floor && prev) T.notePassInto(floor, prev);
    prev = p;
  };

  const withFloor = (fn) => {
    const saved = T.activeFloorTab;
    T.activeFloorTab = floor;
    try { return fn(); } finally { T.activeFloorTab = saved; }
  };

  // Sjezd ze sloupce o vrstvu výš na bod (x, z) — řeže?
  const buried = (x, z) => newCutArea([{ type: 'line', x1: x + step, z1: z, x2: x, z2: z }]) > CUT_TOL;

  const steepCut = (li) => li.some(s => {
    if (s.type !== 'line' || !(s.x1 - s.x2 > 0.05)) return false;
    const dz = Math.abs(s.z2 - s.z1);
    if ((s.x1 - s.x2) <= plungeTan * dz * 1.02) return false;
    return newCutArea([s]) > CUT_TOL;
  });

  // Proč vjezd nesedí (null = v pořádku). Má-li průchod nájezd, jede se
  // nájezdem (i k rampě, která za ním následuje) — posuzuje se tedy ten.
  const badEntry = (p) => {
    const li = p.contourLeadIn;
    if (Array.isArray(li) && li.length > 0) {
      if (buried(li[0].x1, li[0].z1)) return 'buried';
      if (steepCut(li)) return 'steep';
      return null;
    }
    if (p.ramp && Number.isFinite(p.ramp.x0) && Number.isFinite(p.ramp.z0)
        && buried(p.ramp.x0, p.ramp.z0)) return 'rampBuried';
    return null;
  };

  // Vodorovný začátek nájezdu posunout dozadu do vzduchu (viz hlavička).
  const extendBack = (p) => {
    const li = p.contourLeadIn, s0 = li[0];
    if (!s0 || s0.type !== 'line' || Math.abs(s0.x2 - s0.x1) > 1e-6) return false;
    const d0 = Math.sign(s0.z2 - s0.z1);
    if (!d0) return false;
    // Nejbližší místo, kam se dá sjet bez zápichu — a pak ještě tak daleko,
    // aby na polotovar nedosáhla celá kružnice nosu (`noseReach`): jinak
    // emise nesmí sjet rychloposuvem a jede svisle posuvem vzduchem.
    let dSel = null;
    for (let d = 0.5; d <= backReach + 1e-9; d += 0.5) {
      const z = s0.z1 - d0 * d;
      const off = offsetXAt(z);
      if (off !== null && Number.isFinite(off) && off - s0.x1 > rampDipTol) break;
      if (buried(s0.x1, z)) { dSel = null; continue; }
      if (dSel === null) dSel = d;
      if (d >= noseReach - 1e-9) { dSel = d; break; }
    }
    if (dSel === null) return false;
    li.unshift({ type: 'line', x1: s0.x1, z1: s0.z1 - d0 * dSel, x2: s0.x1, z2: s0.z1 });
    return true;
  };

  // Rampa ze začátku průchodu o vrstvu výš, která dosedne uvnitř vrstvy `p`.
  const chainRamp = (p, passes) => {
    const dir = Math.sign(p.zEnd - p.zStart);
    if (!dir) return null;
    let best = null;
    for (const q of passes) {
      if (q === p) break;
      if (!q || q.type !== 'long' || !Number.isFinite(q.x)
          || !Number.isFinite(q.zStart) || !Number.isFinite(q.zEnd)) continue;
      if (!(q.x > p.x + 0.05 && q.x - p.x <= step + 0.05)) continue;
      if (Math.sign(q.zEnd - q.zStart) !== dir) continue;
      const run = (q.x - p.x) / plungeTan;
      let z0 = q.zStart, zC = z0 + dir * run;
      // Dosedla by před začátkem vrstvy → rampa začne dál po podlaze mělčí
      // vrstvy, ať dosedne přesně na začátek (jako `chainFromPrev`).
      if (dir * (zC - p.zStart) < 0) { z0 = p.zStart - dir * run; zC = p.zStart; }
      if (dir * (z0 - q.zStart) < -1e-6 || dir * (q.zEnd - zC) < 0) continue;   // mimo podlahu q
      if (dir * (p.zEnd - zC) < MIN_BODY) continue;
      if (!best || q.x < best.ramp.x0 - 1e-9
          || (Math.abs(q.x - best.ramp.x0) < 1e-9 && dir * (zC - best.zStart) < 0))
        best = { zStart: zC, ramp: { x0: q.x, z0 } };
    }
    if (!best) return null;
    // Rampa nesmí podjet offset dílu (kontura + přídavek).
    const r = best.ramp;
    for (let t = 0.1; t < 1; t += 0.1) {
      const z = r.z0 + (best.zStart - r.z0) * t, x = r.x0 + (p.x - r.x0) * t;
      const off = offsetXAt(z);
      if (off !== null && Number.isFinite(off) && off - x > rampDipTol) return null;
    }
    // Držák na konci rampy i podél ní — táž měřítka jako `chainFromPrev`.
    const cand = { type: 'long', x: p.x, zStart: best.zStart, zEnd: p.zEnd, ramp: r };
    if (holderFitArea(best.zStart, p.x, 0, ownCutOf(cand)) > HOLDER_FIT_TOL) return null;
    const len = Math.hypot(best.zStart - r.z0, p.x - r.x0);
    const n = Math.max(1, Math.min(64, Math.ceil(len)));
    for (let k = 1; k <= n; k++) {
      const t = k / n, zi = r.z0 + (best.zStart - r.z0) * t, xi = r.x0 + (p.x - r.x0) * t;
      if (holderFitArea(zi, xi, 0, [{ z1: r.z0, x1: r.x0, z2: zi, x2: xi }]) > 0.05) return null;
    }
    return best;
  };

  /**
   * Přestaví vjezd průchodu `p` na řetěz ramp, když jeho nájezd/rampa
   * vede do materiálu strměji, než smí. Vrací důvod, nebo null.
   */
  const fix = (p, passes) => {
    if (!floor || !p || p.type !== 'long' || !Number.isFinite(p.x)) return null;
    if (p.pocketClean || p.humpCrossing) return null;
    return withFloor(() => {
      const why = badEntry(p);
      if (!why) return null;
      if (why === 'buried' && extendBack(p)) {
        p.leadInExtended = true;
        // Prodloužený nájezd už nezačíná pod materiálem, ale strmý kus
        // dál po něm by pořád řezal — ten rozhoduje znovu.
        if (!steepCut(p.contourLeadIn)) return 'extended';
      }
      const c = chainRamp(p, passes);
      if (!c) return null;
      if (Array.isArray(p.contourLeadIn)) p.contourLeadIn.length = 0;
      delete p.contourLeadIn;
      p.zStart = c.zStart;
      p.ramp = c.ramp;
      // Začátek rampy leží na podlaze mělčí vrstvy — sjet k němu smí
      // rychloposuv až na odstup nad plánovacím zbytkem (jako pocketPass).
      p.rampEntryClear = true;
      p.leadInChained = why;
      // Vrstva, která po přestavbě nic neubere (u osy za čelem vzala
      // všechno kružnice nosu vrstvy nad ní, pod řetězem je klín, který má
      // zůstat), je jen posuv vzduchem (pravidlo 5) — značka pro vyřazení
      // (`dropIdle`). Měřítko jako kontrola P5: pod 0,01 mm² na mm dráhy.
      const path = [{ type: 'line', x1: c.ramp.x0, z1: c.ramp.z0, x2: p.x, z2: p.zStart },
        { type: 'line', x1: p.x, z1: p.zStart, x2: p.x, z2: p.zEnd }, ...(p.contourLeadOut || [])];
      const len = path.reduce((a, s) => a + Math.hypot(s.x2 - s.x1, s.z2 - s.z1), 0);
      if (newCutArea(path) <= 0.01 * len) p.chainIdle = true;
      return why;
    });
  };

  /** Vyřadí přestavěné vrstvy, které nic neuberou (viz `chainIdle`). */
  const dropIdle = (passes) => {
    let n = 0;
    for (let i = passes.length - 1; i >= 0; i--) {
      const p = passes[i];
      if (!p || !p.chainIdle) continue;
      // Předchůdce, který na tenhle průchod navazuje bez odskoku, by pak
      // navázal na další — takový průchod zůstane.
      if (i > 0 && passes[i - 1] && passes[i - 1].noRetract) continue;
      passes.splice(i, 1);
      n++;
    }
    return n;
  };

  return { advance, fix, dropIdle };
}
