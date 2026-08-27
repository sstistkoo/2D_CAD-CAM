// ╔════════════════════════════════════════════════════════╗
// ║  Vrstva pokračuje přes nízký hrb (post-proces podélného hrubování) ║
// ╚════════════════════════════════════════════════════════╝
// Vrstva rozdělená hrbem se dosud vždycky přerušila: průchod dojel k hrbu,
// odskočil a ZA hrbem se znovu zapíchl. Když ale dojezd „bez schodků“ na
// vrchol hrbu stejně vyjede, nemá se otáčet: sjede po obrysu na druhou stranu
// a pokračuje v téže vrstvě dál (přání uživatele: „napřed se dojede to, co je
// ve směru dráhy“; jeho příklad `N500 G1 X51.281 Z218.418` má pokračovat).
//
// TŘI VĚCI, KTERÉ SE MUSÍ DRŽET (všechny vzešly z měření):
//  1. Sjezd jde PO OBRYSU, ne kolmo — kolmý sjezd udělá schod tam, kde je
//     stěna šikmá nebo oblouková.
//  2. U upichováku se jede po OBÁLCE plátku (maximum předlohy přes rozpětí
//     jeho těla, z −R za špičkou po b−R před ní) — po holem offsetu by tělo
//     vjelo do stěny nad šikminou (naměřeno 19 mm² zajezdu do hotového dílu).
//  3. Řez od dosednutí dolů musí být celý otevřený — bez té kontroly rovná
//     dráha na hloubce vrstvy projela stojícím dílem (428 vzorků zajezdu).
//
// POST‑PROCES AŽ TADY: dojezdy se dodělávají výš (doběh na konec profilu,
// obálka upichováku, ořez držákem) — dřív tenhle blok viděl dojezd nehotový.
// ZATÍM JEN UPICHOVÁK. Pravidlo platí obecně, ale změřené je na upichováku;
// u ostatních tvarů se spouštělo na drobných rozdílech hranic intervalů, a to
// rozvedlo obe cesty hledání intervalů: na `part-1` (polygon) se sloučilo jen
// v booleovské větvi a úběr se rošel o 22 mm² (hlídá `boolean-roughing-wiring`).
// Rozšíření na další tvary patří do jejich vlastních pravidel, ne sem.

import { fitArcsToPolyline } from '../../camMath.js';

/**
 * Sloučí sousední průchody téže hloubky, mezi kterými je hrb, přes který
 * dojezd stejně přejede. Vrací počet sloučení; `passes` mění na místě.
 *
 * @param passes    pole průchodů (mutácia na místě)
 * @param ins       pravidla plátku (cam/inserts) — `mergesOverHump`, `bodyZ`
 * @param offsetXAt dráha středu špičky na daném z (max přes segmenty)
 * @param dzScan    krok skenu intervalů
 * @param dzCap     jemný krok vzorkování obrysu
 */
export function mergeLayersOverHump(passes, ins, offsetXAt, dzScan, dzCap) {
  let hummockMerges = 0;
  for (let i = ins.mergesOverHump ? passes.length - 2 : -1; i >= 0; i--) {
    const p1 = passes[i], p2 = passes[i + 1];
    if (!p1 || !p2 || p1.type !== 'long' || p2.type !== 'long') continue;
    if (Math.abs(p1.x - p2.x) > 1e-6) continue;
    if (p2.contourLeadIn || p2.pocketReposition || p2.pocketEntry) continue;
    const lo = p1.contourLeadOut;
    if (!lo || lo.length === 0) continue;
    if (!Number.isFinite(p2.zStart) || !Number.isFinite(p2.zEnd)) continue;
    const end = lo[lo.length - 1];
    const zTop = end.z2, xTop = end.x2, runStartZ = end.z1;
    if (![zTop, xTop, runStartZ].every(Number.isFinite)) continue;
    if (!(xTop > p1.x + 0.01)) continue;              // dojezd nevyjel nad vrstvu
    if (!(zTop > p2.zStart - 1e-9)) continue;          // druhý kus leží ZA ním
    // Obálka plátku: dráha ŠPIČKY musí být nad maximem předlohy přes celé tělo.
    const bodyLo = ins.bodyZ.lo;
    const bodyHi = ins.bodyZ.hi;
    const envAtZ = (z) => {
      let m = offsetXAt(z);
      for (let d = bodyLo; d <= bodyHi + 1e-9 && bodyHi > bodyLo; d += 0.2) {
        const o = offsetXAt(z + d);
        if (o !== null && (m === null || o > m)) m = o;
      }
      return m;
    };
    // Kde OBÁLKA klesne na hloubku vrstvy — tam dráha dosedne a začne řez.
    let zMeet = null;
    for (let z = runStartZ; z >= p2.zEnd + dzScan; z -= dzCap) {
      const e = envAtZ(z);
      if (e === null || e <= p1.x + 0.01) { zMeet = z; break; }
    }
    if (zMeet === null || !(zMeet > p2.zEnd + dzScan)) continue;
    // Řez od dosednutí dolů musí být otevřený (bod 3 výše).
    let clear = true;
    for (let z = p2.zEnd; z <= zMeet + 1e-9 && clear; z += dzCap) {
      const o = offsetXAt(z);
      if (o !== null && o > p1.x + 0.01) clear = false;
    }
    if (!clear) continue;
    // A NIKDE po cestě nesmí obálka vyčnívat nad výšku dojezdu: kde vyčnívá,
    // tam se nad hrb prostě nedostane a přejezd by se o něj ořízl DOLŮ, tedy
    // do materiálu (naměřeno bez téhle pojistky: 437 vzorků zajezdu do dílu,
    // nejhorší celý plátek v materiálu).
    for (let z = zMeet; z <= runStartZ + 1e-9 && clear; z += dzCap) {
      const e = envAtZ(z);
      if (e !== null && e > xTop + 0.01) clear = false;
    }
    if (!clear) continue;
    // Sjezd po obrysu místo rovného běhu (poslední úsek dojezdu).
    const pts = [];
    for (let z = runStartZ; z > zMeet + 1e-9; z -= 0.2) {
      const e = envAtZ(z);
      pts.push({ x: Math.min(Math.max(e === null ? p1.x : e, p1.x), xTop), z });
    }
    pts.push({ x: p1.x, z: zMeet });
    if (pts.length < 2) continue;
    const fitted = fitArcsToPolyline(pts, 0.02);
    if (!fitted || fitted.length === 0) continue;
    const segs = lo.slice(0, -1);
    for (const sg of fitted) {
      if (sg.type === 'line') segs.push({ type: 'line', x1: sg.p1.x, z1: sg.p1.z, x2: sg.p2.x, z2: sg.p2.z });
      else segs.push({ type: 'arc', x1: sg.p1.x, z1: sg.p1.z, x2: sg.p2.x, z2: sg.p2.z, cx: sg.cx, cz: sg.cz, r: sg.r, dir: sg.dir, startAngle: sg.startAngle, endAngle: sg.endAngle });
    }
    segs.push({ type: 'line', x1: p1.x, z1: zMeet, x2: p1.x, z2: p2.zEnd });
    p1.contourLeadOut = segs.concat(p2.contourLeadOut || []);
    p1.mergedOverHump = true;
    passes.splice(i + 1, 1);
    hummockMerges++;
  }
  return hummockMerges;
}
