// ╔══════════════════════════════════════════════════════════════╗
// ║  PRAVIDLO 7 JAKO JEDEN POSTUP — vrstvy úseku jednou logikou    ║
// ╚══════════════════════════════════════════════════════════════╝
// Klíč plátku `rule7Layers` (zatím kulatá, viz inserts/round.js). Nahrazuje
// pro ten plátek celou hloubkovou smyčku genLongPasses i všechny dodatečné
// úpravy pořadí (humpOrder, pocketHumpSplit, řetězy, dobírání) — průchody
// vznikají rovnou ve správném pořadí a správném tvaru.
//
// POSTUP (docs/cam-pravidla.md, pravidlo 7 — tak, jak ho popsal uživatel
// 29. 9. 2026: „narazí na konturu a měla by se dodělat vrstva až na konec
// a dodělat levá strana … pak by to mělo pokračovat a zas stejná logika,
// dokud nenarazí na hotovní konturu"):
//
//   Oblast (úsek) se obrábí vrstvami shora dolů (žebřík po ap). Každá vrstva
//   jede přes celou oblast. Dokud nikde nenarazí na hotovní konturu, je to
//   obyčejná vrstva až na konec (u stěny na konci oblasti dojede schod
//   nahoru k mělčí vrstvě).
//   PRVNÍ vrstva, která narazí na konturu, jež z obou stran zase klesne pod
//   ni (hrb, čelo dílu), kontury kopíruje a jede až na konec oblasti. Tím se
//   oblast rozpadne na podoblasti mezi hrby a každá se v pořadí jízdy
//   dodělá STEJNÝM postupem až dolů: nejdřív celá první (před hrbem), pak
//   další. Vrstva v podoblasti začíná tam, kde začíná její materiál — u stěny
//   sjede po ní od úrovně mělčí vrstvy (tam, kde vrstva nad ní ze stěny
//   sjela), na konci vyjede po stěně zpět k mělčí vrstvě.
//   Poslední vrstva každé podoblasti leží na jejím dně (pravidlo 3).
//
// Vše se měří na OFFSETOVÉ dráze (střed nosu = kontura + R + přídavek, kde
// strmá stěna ustupuje mezní čáře zanoření 45°) a na plánovací siluetě
// polotovaru rozšířené o R (střed nosu se dotkne polotovaru). Emise G-kódu
// (rychloposuvy vzduchem, nájezdy, odskoky) zůstává společná.

import { topXOnLoop, topXOnLoopFn } from '../../camMath.js';
import { polyOffset } from '../../../../geom/geomCore.js';
import { segAt, subSeg } from './segUtils.js';
import { joinFloorToLayer } from './rule7FloorJoin.js';

const H = 0.1;        // krok vzorkování offsetu v Z [mm]
const EPS = 0.01;     // o kolik musí offset přesáhnout vrstvu = kontura vystoupila
const MAT = 0.01;     // materiál nad dráhou, co ještě není „nic"
const NEAR = 0.5;     // materiál u paty stěny: do této vzdálenosti se vjíždí po stěně
const WALL_IN = 0.5;  // o kolik podoblast zasáhne do sousedního hrbu (svislá stěna)
// Rezerva Z při hledání trasy stěny: svislý úsek (čelo) leží na přesném Z,
// hranice běhu z bisekce o setinu vedle — přebytek odřízne `clipX`.
const ZTOL = 0.05;
const CUT_NEAR = 0.3; // podlaha dřívějších průchodů do 0,3 mm nad vrstvou = už vybráno

/**
 * @param {object} D
 *   passes, step, offsetXAt, traceOffsetPath, regions [{ zHi, zLo }] (jízda z zHi k zLo),
 *   depthsFor(zLo, zHi) → žebřík hloubek, stockLoop (plánovací silueta v rozsahu),
 *   noseR, plungeTan, holderClamp (může být null), foundErrors
 */
export function genRule7Layers(D) {
  const { passes, step, offsetXAt, traceOffsetPath, regions, depthsFor, stockLoop: stockLoopIn, stockLoopFull, noseR, plungeTan,
    holderClamp, residEntryArea, newCutArea, cutStats, floorAt, entryTol = 0.5, clearX = 0, clearZ = 0, stockLoopRaw = null, foundErrors } = D;
  let holderSkips = 0, holderShifts = 0, idleSkips = 0;
  let regionTop = Infinity;   // začátek právě obráběné oblasti (rozsah, mez úseku)

  // Polotovar pro dotazy „je tu materiál" = CELÝ (ne ořezaný rozsahem 📐):
  // za hranicí rozsahu uprostřed polotovaru materiál pokračuje a vjezd tam
  // není „ze vzduchu" (range-entry-ramp: kolmý zápich místo rampy).
  const stockLoop = stockLoopFull || stockLoopIn;
  // Kde se střed nosu dotkne polotovaru: plánovací silueta rozšířená o R.
  let circleLoop = stockLoop;
  if (stockLoop && noseR > 0) {
    try {
      const off = polyOffset([stockLoop], noseR);
      if (off && off.length) circleLoop = off.slice().sort((u, v) => v.length - u.length)[0];
    } catch { /* bez offsetu: silueta sama */ }
  }
  // Obě smyčky jsou během generování neměnné → předpočtený dotaz (topXOnLoopFn).
  const matTop = topXOnLoopFn(circleLoop);
  // Polotovar přímo ve sloupci pod nosem (spodek nosu = x − R).
  const stockTop = topXOnLoopFn(stockLoop);
  const O = (z) => { const v = offsetXAt(z); return v === null || !Number.isFinite(v) ? -Infinity : v; };
  const hasMat = (z, y) => { const t = matTop(z); return t !== null && t > y + MAT; };

  // SKUTEČNÝ polotovar (bez vůle) — výška po sloupcích 0,1 mm. Plánovací
  // obrys je o vůli větší: nos, který zavadí jen o vůli (zbytek po úseku 1,
  // klín u hrbu), nic neuřízne. Vrstva tam nezačíná, nezanořuje se do
  // vzduchu a nepřejíždí pak celé údolí (díl uživatele 29. 9. 2026 (7)/(8):
  // `G1 X45.595 Z147.847 ; Rampa` 3,5 mm vzduchem, `G0 Z184.183`).
  let rawTab = null, rawZ0 = 0;
  if (stockLoopRaw && stockLoopRaw.length >= 3) {
    let lo = Infinity, hi = -Infinity;
    for (const r of regions || []) { lo = Math.min(lo, r.zLo); hi = Math.max(hi, r.zHi); }
    if (Number.isFinite(lo) && Number.isFinite(hi)) {
      rawZ0 = lo - noseR - 1;
      const n = Math.ceil((hi + noseR + 1 - rawZ0) / 0.1);
      rawTab = new Array(n + 1);
      for (let i = 0; i <= n; i++) rawTab[i] = topXOnLoop(stockLoopRaw, rawZ0 + i * 0.1);
    }
  }
  const rawTop = (z) => {
    if (!rawTab) return null;
    const i = Math.round((z - rawZ0) / 0.1);
    return i >= 0 && i < rawTab.length ? rawTab[i] : null;
  };
  // Skutečný polotovar jen UVNITŘ oblasti (za jejím začátkem je hotový úsek).
  const rawTopInside = (z) => (z <= regionTop + 1e-9 ? rawTop(z) : null);
  // Zasáhne kružnice nosu se středem (y, z) skutečný polotovar UVNITŘ
  // oblasti (proti jízdě nejdál po její začátek)? Bez skutečné siluety
  // platí plánovací.
  const realInside = (z, y) => {
    if (!rawTab) return hasMat(z, y);
    const zTo = Math.min(z + noseR, regionTop);
    for (let zc = z - noseR; zc <= zTo + 1e-9; zc += 0.1) {
      const t = rawTop(zc);
      if (t === null) continue;
      const dz = zc - z;
      if (t > y - Math.sqrt(Math.max(noseR * noseR - dz * dz, 0)) + MAT) return true;
    }
    return false;
  };

  // ZA ZAČÁTKEM OBLASTI (proti jízdě) je hotový úsek, nebo polotovar za
  // hranicí rozsahu 📐 — do jeho SKUTEČNÉHO materiálu nos vjezdem sahat
  // nesmí. Plánovací obrys je polotovar + vůle, skutečný se odhadne o vůli
  // X níž a sloupce se berou až za vůlí Z. Řetěz ramp od stěny zbytku po
  // úseku 1 jinak zadní půlkou nosu ubíral stěnu (0,12 mm² na rampu,
  // round-r10-section2-parts, stěna X 29,2 Z 196,2).
  const outsideTouch = (segs) => {
    const zOut = regionTop + clearZ;
    if (!Number.isFinite(zOut) || noseR <= 0) return false;
    for (const sg of segs || []) {
      const n = Math.max(1, Math.ceil(Math.hypot(sg.x2 - sg.x1, sg.z2 - sg.z1) / 0.25));
      for (let k = 0; k <= n; k++) {
        const p = segAt(sg, k / n);
        if (p.z + noseR <= zOut) continue;
        for (let zc = Math.max(zOut, p.z - noseR); zc <= p.z + noseR; zc += 0.1) {
          const t = stockTop(zc);
          if (t === null) continue;
          const low = p.x - Math.sqrt(Math.max(noseR * noseR - (zc - p.z) * (zc - p.z), 0));
          let top = t - clearX;
          if (typeof floorAt === 'function') { const fl = floorAt(zc); if (Number.isFinite(fl)) top = Math.min(top, fl - noseR); }
          if (top > Math.max(low, 0) + 0.02) return true;
        }
      }
    }
    return false;
  };

  // Projel nos některého dřívějšího průchodu bodem (x, z)?
  const passedAt = (x, z) => {
    const near = (sg) => {
      const n = Math.max(1, Math.ceil(Math.hypot(sg.x2 - sg.x1, sg.z2 - sg.z1) / 0.05));
      for (let k = 0; k <= n; k++) { const q = segAt(sg, k / n); if (Math.hypot(q.x - x, q.z - z) < 0.03) return true; }
      return false;
    };
    for (const p of passes) {
      if (p.type !== 'long' || !Number.isFinite(p.x)) continue;
      const segs = [...(p.contourLeadIn || []), ...(p.contourLeadOut || [])];
      if (p.ramp) segs.push({ type: 'line', x1: p.ramp.x0, z1: p.ramp.z0, x2: p.x, z2: p.zStart });
      segs.push({ type: 'line', x1: p.x, z1: p.zStart, x2: p.x, z2: p.zEnd });
      for (const sg of segs) {
        if (Math.min(sg.x1, sg.x2) > x + 0.05 || Math.max(sg.x1, sg.x2) < x - 0.05) continue;
        if (Math.min(sg.z1, sg.z2) > z + 0.05 || Math.max(sg.z1, sg.z2) < z - 0.05) continue;
        if (near(sg)) return true;
      }
    }
    return false;
  };

  // Rozdělení oblasti [zA → zB] (zA > zB, směr jízdy) na běhy „offset nad
  // vrstvou y" / „dno" s hranicemi dopočtenými bisekcí.
  const runsAt = (y, zA, zB) => {
    const above = (z) => O(z) > y + EPS;
    const n = Math.max(1, Math.ceil((zA - zB) / H));
    const runs = [];
    let prevZ = zA, prevA = above(zA), cur = { above: prevA, z0: zA, z1: zA };
    for (let k = 1; k <= n; k++) {
      const z = zA - (zA - zB) * k / n, a = above(z);
      if (a !== prevA) {
        let hi = prevZ, lo = z;
        for (let it = 0; it < 30; it++) { const m = (hi + lo) / 2; if (above(m) === prevA) hi = m; else lo = m; }
        cur.z1 = hi; runs.push(cur);
        cur = { above: a, z0: hi, z1: hi };
        prevA = a;
      }
      prevZ = z;
    }
    cur.z1 = zB; runs.push(cur);
    return runs.filter(r => r.z0 - r.z1 > 1e-6);
  };

  // Materiál na dně běhu: první a poslední Z (v pořadí jízdy), kde je nad vrstvou.
  // Začátek podle KRUŽNICE nosu (nos materiál předbíhá o R), konec podle
  // polotovaru pod STŘEDEM nosu — kružnice sahá o R za konec polotovaru a
  // vrstva by jela R posuvem vzduchem.
  const floorMat = (r, y) => {
    const n = Math.max(1, Math.ceil((r.z0 - r.z1) / H));
    let zs = null, ze = null, zeCircle = null;
    const colMat = (z) => { const t = stockTop(z); return t !== null && t > Math.max(y - noseR, 0) + MAT; };
    let zPrevNo = null, zeNext = null;
    const spans = [];
    for (let k = 0; k <= n; k++) {
      const z = r.z0 - (r.z0 - r.z1) * k / n;
      const m = hasMat(z, y);
      if (m) {
        if (!spans.length || (zPrevNo !== null && spans[spans.length - 1].b > zPrevNo)) {
          let a = z;
          if (zPrevNo !== null) { let u = zPrevNo, v = z; for (let it = 0; it < 25; it++) { const q = (u + v) / 2; if (hasMat(q, y)) v = q; else u = q; } a = v; }
          spans.push({ a, b: z, real: false });
        } else spans[spans.length - 1].b = z;
        const sp = spans[spans.length - 1];
        if (!sp.touch && realInside(z, y)) sp.touch = true;
        if (zs === null) {
          zs = z;
          // Přesná hranice bisekcí — nezávisle na mřížce vzorků.
          if (zPrevNo !== null) { let a = zPrevNo, b = z; for (let it = 0; it < 25; it++) { const q = (a + b) / 2; if (hasMat(q, y)) b = q; else a = q; } zs = b; }
        }
        zeCircle = z;
        if (colMat(z)) { ze = z; zeNext = null; } else if (ze !== null && zeNext === null) zeNext = z;
      } else zPrevNo = z;
      if (!colMat(z) && ze !== null && zeNext === null) zeNext = z;
    }
    if (ze !== null && zeNext !== null) {
      let a = ze, b = zeNext; for (let it = 0; it < 25; it++) { const q = (a + b) / 2; if (colMat(q)) a = q; else b = q; } ze = a;
    }
    if (zs === null) return null;
    ze = ze ?? zeCircle;
    // Úseky, kde nos zavadí jen o vůli — nebo se skutečného polotovaru jen
    // DOTKNE a nic neubere —, nejsou materiál vrstvy. Strmá stěna zbytku po
    // úseku 1 těsně za mezí: dotek 0,1 mm, úběr 0 → vrstvy 33,095 … 28,095
    // vjely u hrbu rampou a přejely údolí rychloposuvem (díl (9), `G0 Z154.272`).
    for (const sp of spans) {
      sp.real = !!sp.touch && (!rawTab || typeof newCutArea !== 'function'
        || newCutArea([{ type: 'line', x1: y, z1: sp.a, x2: y, z2: sp.b }], { topAt: rawTopInside }) > 0.05 + 0.01 * (sp.a - sp.b));
    }
    const real = spans.filter(sp => sp.real);
    if (!real.length) return null;
    // Vrstva začíná, kde kružnice nosu zasáhne SKUTEČNÝ polotovar — nájezd
    // o vůli před ním přidá emise (rychloposuv končí podle plánovacího
    // obrysu). Začátek podle plánovacího obrysu byl o vůli dřív, ve vzduchu,
    // a vjezd tam pak zbytečně rampoval (díl (8), úsek 2, X 26,73).
    let zr = real[0] === spans[0] ? zs : real[0].a;
    if (rawTab && !realInside(zr, y)) {
      let prev = zr;
      for (let z = zr - H; z >= real[0].b - 1e-9; z -= H) { if (realInside(z, y)) { zr = z; break; } prev = z; }
      let u = prev, v = zr;
      for (let it = 0; it < 25; it++) { const q = (u + v) / 2; if (realInside(q, y)) v = q; else u = q; }
      zr = v;
    }
    return { zs: zr, ze: Math.max(ze, real[real.length - 1].b), realSpans: real.map((sp, k) => ({ a: k === 0 ? zr : sp.a, b: sp.b })) };
  };

  // Na stěně běhu `run` (offset nad vrstvou) najdi Z, kde offset dosáhne
  // úrovně `up`, počínaje od paty `zFoot` směrem `dir` (+1 = proti jízdě).
  const wallZ = (run, zFoot, up, dir) => {
    const zEnd = dir > 0 ? run.z0 : run.z1;
    const n = Math.max(1, Math.ceil(Math.abs(zEnd - zFoot) / H));
    for (let k = 1; k <= n; k++) {
      const z = zFoot + (zEnd - zFoot) * k / n;
      if (O(z) >= up - 1e-6) {
        let a = zFoot + (zEnd - zFoot) * (k - 1) / n, b = z;
        for (let it = 0; it < 30; it++) { const m = (a + b) / 2; if (O(m) >= up - 1e-6) b = m; else a = m; }
        return b;
      }
    }
    return zEnd;
  };

  // Přejezd přes hrb rozdělený ve vrcholu: nahoru (dojezd) a dolů (nájezd).
  const splitAtTop = (segs) => {
    let best = null;
    segs.forEach((s, k) => {
      for (let j = 0; j <= 20; j++) {
        const p = segAt(s, j / 20);
        if (!best || p.x > best.x + 1e-9) best = { x: p.x, k, t: j / 20 };
      }
    });
    if (!best) return [segs, []];
    const s = segs[best.k];
    const upPart = segs.slice(0, best.k), downPart = segs.slice(best.k + 1);
    if (best.t > 1e-6) upPart.push(subSeg(s, 0, best.t));
    if (best.t < 1 - 1e-6) downPart.unshift(subSeg(s, best.t, 1));
    return [upPart, downPart];
  };

  const segLen = (segs) => (segs || []).reduce((a, s) => a + Math.hypot(s.x2 - s.x1, s.z2 - s.z1), 0);
  // Končí nájezd úsečkou pod úhlem zanoření u (x, z)? Vrací její konec
  // (skutečné místo, kam nos sjel — nájezd končí o ZTOL za začátkem vrstvy).
  const plungeLineEnd = (li, x, z) => {
    const s = li && li.length ? li[li.length - 1] : null;
    if (!s || s.type !== 'line' || !(s.x1 - s.x2 > 0.05)) return null;
    if (Math.abs(s.x2 - x) > 0.02 || Math.abs(s.z2 - z) > 0.02) return null;
    const dz = Math.abs(s.z2 - s.z1);
    return dz > 1e-6 && Math.abs((s.x1 - s.x2) / dz - plungeTan) <= plungeTan * 0.02 ? { z: s.z2 } : null;
  };

  // Část trasy mezi úrovněmi X ∈ [xLo, xHi]. `traceOffsetPath` bere svislé
  // úseky (čelo dílu) celé — od osy až nahoru; nájezd i dojezd ale vedou jen
  // mezi vrstvou a mělčí vrstvou.
  const clipX = (segs, xLo, xHi) => {
    const out = [];
    const inside = (p) => p.x >= xLo - 1e-6 && p.x <= xHi + 1e-6;
    for (const s of segs || []) {
      const N = 40;
      let t0 = null, t1 = null;
      for (let j = 0; j <= N; j++) {
        const t = j / N;
        if (inside(segAt(s, t))) { if (t0 === null) t0 = t; t1 = t; }
      }
      if (t0 === null) continue;
      const refine = (a, b, wantIn) => {        // a mimo/uvnitř, b opačně
        for (let it = 0; it < 30; it++) { const m = (a + b) / 2; if (inside(segAt(s, m)) === wantIn) b = m; else a = m; }
        return b;
      };
      if (t0 > 0) t0 = refine(t0 - 1 / N, t0, true);
      if (t1 < 1) t1 = refine(t1 + 1 / N, t1, true);
      if (t1 - t0 < 1e-6) continue;
      out.push(t0 <= 1e-9 && t1 >= 1 - 1e-9 ? s : subSeg(s, t0, t1));
    }
    // Mikroúsečky (setinový schod mezi vrstvou a dnem, nulové úseky) pryč —
    // další úsek naváže na koncový bod předchozího.
    const kept = out.filter(sg => Math.hypot(sg.x2 - sg.x1, sg.z2 - sg.z1) >= 0.05);
    return kept.length ? kept : out;
  };

  // ── Jedna vrstva `d` přes oblast (běhy `runs`) ──────────────────────────
  // `up` = úroveň mělčí vrstvy, odkud se sjíždí po stěně a kam se vyjíždí.
  // `chain` = začátek mělčí vrstvy téže oblasti (pro řetěz ramp, kde se
  // vjíždí do plného materiálu bez stěny — pravidlo 6).
  const emitLayer = (d, runs, up, chain) => {
    const pieces = [];
    runs.forEach((r, k) => { if (!r.above) pieces.push({ k, r, m: floorMat(r, d) }); });
    const withMat = pieces.filter(p => p.m);
    if (withMat.length === 0) return null;
    const chosen = pieces.slice(pieces.indexOf(withMat[0]), pieces.indexOf(withMat[withMat.length - 1]) + 1);
    const out = [];
    chosen.forEach((p, idx) => {
      const r = p.r;
      const o = { x: d, zStart: r.z0, zEnd: r.z1, leadIn: null, leadOut: null, cont: false, wallEnd: false };
      if (idx === 0) {
        const prev = runs[p.k - 1];
        if (prev && prev.above && p.m && p.m.zs >= r.z0 - NEAR) {
          const zTop = wallZ(prev, r.z0, up, +1);
          const li = clipX(traceOffsetPath(zTop + ZTOL, r.z0 - ZTOL), d, up);
          if (segLen(li) > 0.05) o.leadIn = li;
        } else if (p.m) o.zStart = p.m.zs;
      } else o.leadIn = p.humpDown && p.humpDown.length ? p.humpDown : null;
      if (idx === chosen.length - 1) {
        const next = runs[p.k + 1];
        if (next && next.above && p.m && p.m.ze <= r.z1 + NEAR) {
          const zUp = wallZ(next, r.z1, up, -1);
          const lo = clipX(traceOffsetPath(r.z1 + ZTOL, zUp - ZTOL), d, up);
          if (segLen(lo) > 0.05) { o.leadOut = lo; o.wallEnd = true; }
        } else if (p.m) o.zEnd = p.m.ze;
      } else {
        const hump = clipX(traceOffsetPath(r.z1 + ZTOL, chosen[idx + 1].r.z0 - ZTOL), d, Infinity);
        const [upPart, downPart] = splitAtTop(hump);
        o.leadOut = upPart;
        chosen[idx + 1].humpDown = downPart;
        o.cont = true;
      }
      // Nájezd, který na vrstvu nedosedne: `traceOffsetPath` vynechává
      // uzavírací čelo jdoucí k ose, takže nájezd po vodítku skončí nad
      // vrstvou (part-22, 0,28 mm) a emise by dojela svisle (pravidlo 6).
      // Zbytek dojede pod úhlem zanoření.
      if (o.leadIn && o.leadIn.length) {
        const e = o.leadIn[o.leadIn.length - 1], gapX = e.x2 - d;
        if (gapX > 0.05) {
          const z2 = e.z2 - gapX / plungeTan;
          o.leadIn = [...o.leadIn, { type: 'line', x1: e.x2, z1: e.z2, x2: d, z2 }];
          o.zStart = Math.min(o.zStart, z2);
        }
      }
      out.push(o);
    });
    // Rampa nesmí podjet offset dílu v žádném bodě — ani na svém začátku
    // (začátek na plošině pod její offsetovou čarou, 29. 9. 2026).
    const noGouge = (x0, z0, zS) => {
      for (let t = 0; t <= 1 + 1e-9; t += 0.1) {
        const zz = z0 + (zS - z0) * t, xx = x0 + (d - x0) * t;
        if (O(zz) > xx + 0.05) return false;
      }
      return true;
    };
    const steepLi = (li) => li.some(sg => sg.type === 'line' && sg.x1 - sg.x2 > 0.05
      && (sg.x1 - sg.x2) > plungeTan * Math.abs(sg.z2 - sg.z1) * 1.02);
    // SJEZD ZA HRBEM STRMĚJI NEŽ ÚHEL ZANOŘENÍ (pravidlo 6): z vrcholu, kde
    // nástroj po přejezdu stojí, rampou pod úhlem zanoření.
    for (const o of out.slice(1)) {
      const li = o.leadIn;
      if (!li || !li.length || !steepLi(li)) continue;
      const x0 = li[0].x1, z0 = li[0].z1, zS = z0 - (x0 - d) / plungeTan;
      if (!(zS > o.zEnd + 0.05) || !noGouge(x0, z0, zS)) continue;
      o.leadIn = null; o.ramp = { x0, z0 }; o.zStart = Math.min(o.zStart, zS);
    }
    // ── UŽ VYBRANÝ ZAČÁTEK (pravidlo 5): kudy dřívější průchody projely až
    // k téhle hloubce (podlaha do CUT_NEAR nad ní — typicky vrstva na schodu
    // těsně nad touhle), tam se vrstva nejede; začne až za tím.
    if (typeof floorAt === 'function') {
      const f0 = out[0];
      let z = f0.zStart;
      while (z > f0.zEnd + H && floorAt(z) <= d + CUT_NEAR) z -= H;
      if (z < f0.zStart - 0.5) { f0.zStart = z; f0.leadIn = null; }
    }
    // ── VJEZD DO VRSTVY (pravidla 6 a 2) — jeden postup, v tomto pořadí:
    //  1) po stěně od mělčí vrstvy: sjezd nejvýš pod úhlem zanoření a sloupec
    //     nad jeho začátkem už vybraný (sjede se k němu shora),
    //  2) ze vzduchu: pod středem nosu na začátku není polotovar,
    //  3) rampou pod úhlem zanoření z prvního vybraného místa mělčí vrstvy
    //     (od stěny dál po vrstvě).
    // Každá možnost musí projít i držákem — statickou obálkou proti dílu
    // (`holderClamp`) a modelem podle pořadí proti stojícímu materiálu.
    // Nevejde-li se nic, vrstva se vynechá a nahlásí (materiál zůstane).
    const f = out[0];
    const fits = (c) => (!holderClamp || holderClamp(c.x, c.zStart, c.zEnd, {}) !== null)
      && (typeof residEntryArea !== 'function'
        || residEntryArea({ x: c.x, zStart: c.zStart, zEnd: c.zEnd, ramp: c.ramp }, c.leadIn || [], entryTol) <= entryTol);
    // Je sloupec nad (x, z) volný až na x? V té úrovni polotovar nikdy nebyl
    // (vrstva nad ní tu mohla vypadnout jako „nic neubere"), nebo ho vybraly
    // dřívější průchody — podlaha po sloupcích 0,25 mm, ptá se i 0,3 mm za
    // bodem; bez modelu podlahy (díl bez držáku) dno mělčí vrstvy za jejím
    // začátkem.
    const columnCut = (x, z) => {
      if (!realInside(z, x)) return true;
      if (typeof floorAt === 'function') {
        const fl = Math.max(floorAt(z), floorAt(z + 0.3));
        if (Number.isFinite(fl)) return fl <= x + 0.02;
      }
      return !!(chain && Math.abs(chain.x - x) < 0.05 && z <= chain.z - 0.3);
    };
    const dropClear = (x, z) => {
      // Bodem už projel nos dřívějšího průchodu (nájezd po mezní čáře u meze
      // úseku končí tam, kde začne další) — sloupcová podlaha po 0,25 mm to
      // na strmém boku kružnice R 10 neví (0,22 mm² mezi sloupci).
      if (passedAt(x, z)) return true;
      // Kružnice nosu na konci sjezdu nezasáhne skutečný polotovar — výš
      // (odkud se sjíždí) tím spíš ne. Plánovací model by tu viděl vůli.
      if (rawTab && !realInside(z, x)) return true;
      const a = typeof newCutArea === 'function'
        ? newCutArea([{ type: 'line', x1: x + 2 * step, z1: z, x2: x, z2: z }]) : Infinity;
      return Number.isFinite(a) ? a <= 0.05 : columnCut(x, z);
    };
    // Sloupec pod středem nosu bez polotovaru nad spodkem nosu — skutečného,
    // je-li k dispozici (vůle není materiál).
    const colAir = (z) => { const t = rawTab ? rawTop(z) : stockTop(z); return t === null || t <= Math.max(d - noseR, 0) + MAT; };
    const findEntry = () => {
      let entry = null;
      if (f.leadIn && !steepLi(f.leadIn) && dropClear(f.leadIn[0].x1, f.leadIn[0].z1) && !outsideTouch(f.leadIn)) {
        const c = { x: d, zStart: f.zStart, zEnd: f.zEnd, leadIn: f.leadIn };
        if (fits(c)) entry = c;
      }
      // „Ze vzduchu" = celá kružnice nosu těsně PŘED začátkem (proti směru
      // jízdy) se polotovaru nedotýká — pak se k vrstvě přijede vodorovně.
      // Nestačí sloupec pod středem: za čelem dílu (zprava konec jízdy) ležel
      // zadní bok nosu v odlitku a sjezd byl svislý zápich (part-22, 90°).
      // Za začátkem je vzduch i tam, kde materiál sousední oblasti už vybraly
      // dřívější průchody až na tuhle úroveň (a nestojí tam díl).
      const zb = f.zStart + 0.2;
      const airBehind = O(zb) <= d + EPS && (!realInside(zb, d)
        || (typeof floorAt === 'function' && floorAt(zb) <= d + CUT_NEAR));
      if (!entry && !f.leadIn && colAir(f.zStart) && airBehind) {
        const c = { x: d, zStart: f.zStart, zEnd: f.zEnd };
        if (fits(c)) entry = c;
      }
      if (!entry && up - d > 0.05) {
        // Začátek rampy (up, z) nesmí ležet POD dřívější dráhou (pod rampou
        // mělčí vrstvy — sloupcový model to přehlédne a emise pak jela kus
        // rampy rychloposuvem, 0,7 mm² proti vůli polotovaru): dřívější
        // průchody tudy musely dojet až na úroveň `up`, nebo tam v té úrovni
        // materiál nikdy nebyl (prázdná drážka odlitku).
        const zFrom = f.leadIn ? f.leadIn[0].z1 : f.zStart;
        // Kudy už dřívější průchod projel, musí začátek ležet na jeho podlaze;
        // plánovací silueta rozhoduje jen tam, kde zatím nejel nikdo.
        // …a dá se k němu dojet rychloposuvem: plánovací obrys (polotovar
        // + vůle) nesahá nad začátek víc než o vůli X. Jinak rychloposuv
        // skončí vysoko a k rampě se sjíždí svisle posuvem (roh stěny zbytku
        // po úseku 1: 2,76 mm, round-r10-section2-parts).
        const reachable = (z) => {
          const fl = typeof floorAt === 'function' ? Math.max(floorAt(z), floorAt(z + 0.3)) : Infinity;
          if (Number.isFinite(fl) && fl <= up + 0.02) return true;
          const t = matTop(z);
          return t === null || t <= up + clearX + 0.05;
        };
        const startOk = (z) => columnCut(up, z) && reachable(z);
        // Co nejblíž začátku vrstvy (u stěny); mezi kandidáty v pořadí jízdy
        // i přesný začátek mělčí vrstvy, pokud ta sama vjela rampou — řetěz
        // ramp po jedné přímce, nos jede po povrchu, který rampa nad ním
        // právě obrobila. (Vrstva, která začala vodorovně u stěny, řetěz
        // nezakládá: rampa odtud by zadní půlkou nosu sjela do stěny.)
        const zs = [];
        for (let z = zFrom; z > f.zEnd + 0.5; z -= 0.5) zs.push(z);
        const chained = chain && chain.ramp && Math.abs(chain.x - up) < 0.05 && chain.z <= zFrom + 1e-6;
        if (chained) { const k = zs.findIndex(z => z < chain.z); zs.splice(k < 0 ? zs.length : k, 0, chain.z); }
        for (const z of zs) {
          const zS = z - (up - d) / plungeTan;
          const fromChain = chained && z === chain.z;
          if (!(zS > f.zEnd + 0.05)) { if (fromChain) continue; break; }
          if (!fromChain && (!startOk(z) || !dropClear(up, z))) continue;
          // Řetěz od sjezdu po stěně jen do materiálu: za koncem polotovaru
          // by jel rampami vzduchem (part-22 za čelem, 3,5 mm bez úběru).
          if (fromChain && chain.fromLeadIn && rawTab && !realInside(zS, d)) continue;
          if (!noGouge(up, z, zS)) continue;
          const c = { x: d, zStart: zS, zEnd: f.zEnd, ramp: { x0: up, z0: z }, chainLeadIn: fromChain && !!chain.fromLeadIn };
          if (outsideTouch([{ type: 'line', x1: up, z1: z, x2: d, z2: zS }])) continue;
          if (fits(c)) { entry = c; break; }
        }
      }
      return entry;
    };
    let entry = findEntry();
    // VJEZD, KTERÝ NIC NEUBERE (pravidla 4 a 5): materiál u stěny zbytku po
    // úseku 1 jde vzít jen z polohy přímo u stěny, kam se vjet nedá — vjezd
    // se posune dál, stěny se pak nedotkne a vrstva přejíždí celé údolí
    // rychloposuvem (díl (9), `G0 Z154.272`). Když vjezd a tělo až k dalšímu
    // materiálu vrstvy nic skutečného neuberou, vrstva začne až u něj.
    const realSpans = (chosen[0] && chosen[0].m && chosen[0].m.realSpans) || [];
    if (entry && rawTab && typeof newCutArea === 'function') {
      for (let si = 1; si < realSpans.length; si++) {
        const zNext = realSpans[si].a;
        if (!(zNext < entry.zStart - 1e-6)) continue;
        const path = [...(entry.leadIn || [])];
        if (entry.ramp) path.push({ type: 'line', x1: entry.ramp.x0, z1: entry.ramp.z0, x2: d, z2: entry.zStart });
        path.push({ type: 'line', x1: d, z1: entry.zStart, x2: d, z2: zNext });
        if (newCutArea(path, { topAt: rawTopInside }) > 0.05 + 0.01 * segLen(path)) break;
        const save = { zStart: f.zStart, leadIn: f.leadIn };
        f.zStart = zNext; f.leadIn = null;
        const e2 = findEntry();
        if (!e2) { f.zStart = save.zStart; f.leadIn = save.leadIn; break; }
        entry = e2;
      }
    }
    if (!entry) { holderSkips++; return null; }
    if (entry.ramp && (f.leadIn || !colAir(f.zStart))) holderShifts++;
    f.leadIn = entry.leadIn || null; f.ramp = entry.ramp || null; f.zStart = entry.zStart;
    f.chainLeadIn = !!entry.chainLeadIn;
    // VRSTVA, KTERÁ NIC NEUBERE (pravidlo 5), se nevydá — u osy za čelem
    // vzaly všechno kružnice nosu mělčích vrstev. Měří se celou dráhou proti
    // podlaze dosud vydaných průchodů (pod 0,01 mm² na mm, jako kontrola P5).
    if (typeof newCutArea === 'function') {
      const path = [];
      for (const o of out) {
        if (o.ramp) path.push({ type: 'line', x1: o.ramp.x0, z1: o.ramp.z0, x2: o.x, z2: o.zStart });
        for (const sg of o.leadIn || []) path.push(sg);
        path.push({ type: 'line', x1: o.x, z1: o.zStart, x2: o.x, z2: o.zEnd });
        for (const sg of o.leadOut || []) path.push(sg);
      }
      const len = segLen(path);
      // I krátký kus (0,07 mm u příruby pod vrstvou na schodu): emise k němu
      // přidá nájezd od doteku kružnice nosu — 10 mm posuvem vzduchem.
      // Nebo sebere jen setiny, které po sobě nechala vrstva na schodu
      // (X 40,595 po plošině příruby 0,02 mm pod vrstvou 40,676, díl (7)).
      const cut = newCutArea(path);
      if (cut <= 0.01 * Math.max(len, 1) || (cut <= 0.3 && cut <= 0.03 * len)) { idleSkips++; return null; }
    }
    // TĚLO ZA NÁJEZDEM, KTERÉ NIC NEUBERE (pravidla 4, 5 a 14): klín pod
    // mezní čarou u hranice úseku vybere nájezd po čáře, tělo za ním jede
    // vzduchem k mezi a odjezd se vrací šikmo zpět — „taneček" `G0 Z145.276
    // / G1 X48.618 Z143.276` (díl (7), úsek 1). Vrstva skončí na konci nájezdu.
    // PRAVIDLO 14 (uživatel 7. 10. 2026): platí pro tělo JAKÉKOLI délky
    // a měří se proti SKUTEČNÉMU polotovaru (pravidlo 9). Za koncem polotovaru
    // jelo tělo 7 mm vzduchem (`N3120 G0 Z-18.996`, odskok a návrat na konec
    // rampy) — teď vrstva skončí na konci rampy a další rampa na ni naváže
    // bez odskoku (viz NAVAZUJÍCÍ PRŮCHOD níž): jeden souvislý sjezd.
    if (typeof newCutArea === 'function') {
      const o = out[out.length - 1];
      const li = o.leadIn || (o.ramp ? [{ type: 'line', x1: o.ramp.x0, z1: o.ramp.z0, x2: o.x, z2: o.zStart }] : null);
      const bodyLen = o.zStart - o.zEnd;
      if (li && li.length && !o.leadOut && !o.cont && bodyLen > 1e-6) {
        const body = { type: 'line', x1: o.x, z1: o.zStart, x2: o.x, z2: o.zEnd };
        const real = rawTab ? { topAt: rawTopInside } : {};
        const idleBody = bodyLen < 2
          ? newCutArea([...li, body]) - newCutArea(li) <= 0.05 + 0.01 * bodyLen
          : newCutArea([...li, body], real) - newCutArea(li, real) <= 0.05 + 0.01 * bodyLen;
        if (idleBody) o.zEnd = o.zStart;
      }
    }
    // Držák (pravidlo 2): kde se nevejde, vrstva končí dřív.
    let firstStart = null;
    for (let i = 0; i < out.length; i++) {
      const o = out[i];
      if (holderClamp) {
        const nz = holderClamp(o.x, o.zStart, o.zEnd, {});
        if (nz === null) { if (i > 0) delete passes[passes.length - 1].noRetract; break; }
        if (nz > o.zEnd + 1e-6) { o.zEnd = nz; o.leadOut = null; o.cont = false; o.holderClamped = true; }
      }
      const pass = { type: 'long', x: o.x, zStart: o.zStart, zEnd: o.zEnd, rule7: true };
      if (o.wallEnd || o.cont) pass.blocked = true;
      if (o.ramp) { pass.ramp = o.ramp; pass.rampEntryClear = true; }
      if (o.leadIn) { pass.contourLeadIn = o.leadIn; pass.leadInTrimmed = true; }
      if (o.leadOut && o.leadOut.length) pass.contourLeadOut = o.leadOut;
      if (o.cont) pass.noRetract = true;
      if (o.holderClamped) pass.holderClamped = true;
      // KONEC ŘETĚZU ZANOŘENÍ (uživatel 8. 10. 2026, úsek 3 za čelem dílu):
      // průchod, který končí rampou (tělo za ní nic neubralo), odskakoval
      // šikmo zpátky po téže rampě — `N3290 G1 X31.666 Z-13.749`. Když je nad
      // koncem rampy volno (kolmý zdvih nosu ze skutečného polotovaru nic
      // neubere — proti podlaze dřívějších průchodů a vlastní rampě), odjede
      // se rovnou kolmo v X jako u řetězu za hranicí úseku (`retractRadial`).
      if (o.ramp && Math.abs(o.zEnd - o.zStart) < 1e-6 && typeof cutStats === 'function' && chainTopAt) {
        const lift = { type: 'line', x1: o.x, z1: o.zStart, x2: o.x + 2 * noseR + step, z2: o.zStart };
        const rampSeg = { type: 'line', x1: o.ramp.x0, z1: o.ramp.z0, x2: o.x, z2: o.zStart };
        const st = cutStats([lift], { topAt: chainTopAt, floorSegs: [rampSeg] });
        if (st && st.area <= 0.05) pass.retractRadial = true;
      }
      passes.push(pass);
      // Řetěz ramp založí i vjezd PO STĚNĚ, který končí na přímce zanoření:
      // nos sjel po téže přímce jako rampa, další rampa na ni navazuje přesně.
      // Jinak se začátek rampy hledal po 0,5 mm a vyšel kus dál než konec
      // předchozího sjezdu (díl uživatele 30. 9. 2026 (9), úsek 2:
      // `N4370 G1 X38.095 Z262.325 ; Rampa` z Z 259,825 místo 259,325).
      if (firstStart === null) {
        const liEnd = o.ramp ? null : plungeLineEnd(o.leadIn, o.x, o.zStart);
        // `fromLeadIn` nese celý řetěz, který takový sjezd založil.
        firstStart = { x: o.x, z: liEnd ? liEnd.z : o.zStart, ramp: !!o.ramp || !!liEnd, fromLeadIn: !!liEnd || !!o.chainLeadIn };
      }
      if (!o.cont) break;
    }
    return firstStart;
  };

  // Vodorovné plošiny offsetu (schody) v oblasti s úrovní v (lo, hi).
  const flatsIn = (zA, zB, lo, hi) => {
    const out = [];
    const n = Math.max(1, Math.ceil((zA - zB) / H));
    let run = null, prev = null;
    for (let k = 0; k <= n; k++) {
      const z = zA - (zA - zB) * k / n, o = O(z);
      const flat = Number.isFinite(o) && prev !== null && Math.abs(o - prev) < 1e-4 && o > lo + 0.05 && o < hi - 0.05;
      if (flat) { if (!run) run = { F: o, z0: z + (zA - zB) / n, z1: z }; else run.z1 = z; }
      else if (run) { if (run.z0 - run.z1 >= 1) out.push(run); run = null; }
      prev = o;
    }
    if (run && run.z0 - run.z1 >= 1) out.push(run);
    return out.sort((a, b) => b.F - a.F);
  };

  // Běhy VRSTVY NA SCHODU: dno jen v okně plošiny, ale STĚNA vedle něj
  // v celé délce, pokud vystoupá až k mělčí vrstvě `up` — dojezd („zarovnání
  // schodku") pak dojede k ní. Okno ji dřív uťalo 0,5 mm za patou a dojezd
  // skončil v půlce (díl uživatele 30. 9. 2026 (10): `N3300 G1 X42.020
  // Z206.901`, mělčí vrstva X 43,045). Stěna, která k `up` nevystoupá (nízký
  // hrb), zůstane oříznutá oknem — přes hrb vrstva na schodu nejede.
  const floorWindowRuns = (y, wA, wB, zA, zB, up) => {
    const out = [];
    for (const r of runsAt(y, zA, zB)) {
      if (!(r.z0 > wB + 1e-9 && r.z1 < wA - 1e-9)) continue;
      const clipped = { ...r, z0: Math.min(r.z0, wA), z1: Math.max(r.z1, wB) };
      if (!r.above) { out.push(clipped); continue; }
      let reaches = false;
      for (let z = r.z0; z >= r.z1 - 1e-9 && !reaches; z -= H) if (O(z) >= up - 1e-6) reaches = true;
      out.push(reaches ? r : clipped);
    }
    return out;
  };

  // ── Oblast [zA → zB] od hloubky depths[di0] ──────────────────────────────
  const buildRegion = (depths, zA, zB, di0, levelAbove) => {
    let lastD = levelAbove, chain = null;
    const floorLevels = new Set();
    for (let di = di0; di < depths.length; di++) {
      const d = depths[di];
      if (Number.isFinite(lastD) && d >= lastD - 1e-6) continue;
      let floorPass = null;
      // VRSTVA NA SCHODU (pravidlo 3: „na dně ani na schodu nesmí zůstat víc
      // než přídavek"). Plošina offsetu mezi mělčí vrstvou a touhle by jinak
      // zůstala pod pásem až skoro ap (plošina X 30,156 před přírubou úseku 2:
      // 22 mm²). Vrstva těsně nad plošinou jede jen v okně plošiny — přes celou
      // oblast by udělala tenkou vrstvu uprostřed.
      // Plošina na vrcholu HRBU, přes který vrstva `d` přejede (materiál
      // vrstvy je před hrbem i za ním), se nedělá zvlášť: přejezd hrb kopíruje
      // i s plošinou (pravidlo 7). Jinak se napřed jela plošina ZA kruhovým
      // vybráním a teprve pak vrstva od začátku (díl (7), `N1600 G1 X37.576
      // Z46.022 ; Rampa`).
      const runsD = runsAt(d, zA, zB);
      const crossed = runsD.filter((r, k) => r.above && k > 0 && k < runsD.length - 1
        && floorMat(runsD[k - 1], d) && floorMat(runsD[k + 1], d));
      if (Number.isFinite(lastD)) {
        for (const fl of flatsIn(zA, zB, d, lastD)) {
          if (crossed.some(h => fl.z0 <= h.z0 + 1e-6 && fl.z1 >= h.z1 - 1e-6)) continue;
          const dF = fl.F + 0.02;
          const wA = Math.min(zA, fl.z0 + noseR + 1), wB = Math.max(zB, fl.z1 - WALL_IN);
          const runsF = floorWindowRuns(dF, wA, wB, zA, zB, Math.min(lastD, dF + step));
          if (!runsF.some(r => !r.above)) continue;
          if (emitLayer(dF, runsF, Math.min(lastD, dF + step), chain) !== null) {
            floorLevels.add(dF.toFixed(3));
            floorPass = passes[passes.length - 1];
          }
        }
      }
      const runs = runsD;
      const floors = runs.filter(r => !r.above);
      if (floors.length === 0) break;
      const up = Number.isFinite(lastD) ? Math.min(lastD, d + step) : d + step;
      // Střed nosu pod osou nemá smysl (destička by jela celá pod ní).
      if (d < -MAT) break;
      const humps = runs.filter((r, k) => r.above && k > 0 && k < runs.length - 1);
      const nBefore = passes.length;
      const start = emitLayer(d, runs, up, chain);
      // Vrstva na dně, za kterou stěna sjíždí k téhle vrstvě: bez odskoku
      // pokračuje po stěně dolů (ops/long/rule7FloorJoin.js).
      if (start !== null && floorPass && passes[nBefore - 1] === floorPass && passes[nBefore]) {
        joinFloorToLayer(floorPass, passes[nBefore], {
          traceOffsetPath, plungeTan, step,
          entryOk: (li) => !outsideTouch(li) && (typeof residEntryArea !== 'function'
            || residEntryArea({ x: passes[nBefore].x, zStart: passes[nBefore].zStart, zEnd: passes[nBefore].zEnd }, li, entryTol) <= entryTol),
        });
      }
      if (start === null) {
        // Na téhle hloubce tu není materiál. Hrby ale oblast dělí dál —
        // podoblasti pod nimi se dodělají samostatně.
        if (humps.length === 0) { continue; }
      } else { lastD = d; chain = start; }
      if (humps.length > 0) {
        // Podoblast sahá o kousek do sousedních hrbů, ať v ní hlubší vrstvy
        // uvidí stěnu i tam, kde je svislá (čelo dílu leží přesně na hranici).
        for (const f of floors) {
          const k = runs.indexOf(f);
          const zA2 = k > 0 && runs[k - 1].above ? Math.min(f.z0 + WALL_IN, runs[k - 1].z0) : f.z0;
          const zB2 = k < runs.length - 1 && runs[k + 1].above ? Math.max(f.z1 - WALL_IN, runs[k + 1].z1) : f.z1;
          buildRegion(depths, zA2, zB2, di + 1, Number.isFinite(lastD) ? lastD : d);
        }
        return;
      }
    }
    // POSLEDNÍ VRSTVA NA DNĚ oblasti (pravidlo 3): nejnižší bod offsetu, když
    // ho žebřík minul o víc než pár setin.
    let fMin = Infinity;
    const n = Math.max(1, Math.ceil((zA - zB) / H));
    for (let k = 0; k <= n; k++) { const v = O(zA - (zA - zB) * k / n); if (v < fMin) fMin = v; }
    if (Number.isFinite(fMin) && Number.isFinite(lastD) && fMin + 0.02 < lastD - 0.05
        && !floorLevels.has((fMin + 0.02).toFixed(3))) {
      const dB = fMin + 0.02;
      const runs = runsAt(dB, zA, zB);
      if (runs.some(r => !r.above)) emitLayer(dB, runs, Math.min(lastD, dB + step), chain);
    }
  };

  // ── PRAVIDLO 14: ŘETĚZ ZANOŘENÍ POKRAČUJE PŘES HRANICI ÚSEKU ────────────
  // Uživatel 7. 10. 2026 (`projekt_2026-10-07 (3)`, úsek 1 u bodů 5–8):
  // řetěz ramp po mezní čáře skončil na hranici úseku („kolmo nad tím
  // místem") a pod ním zůstal zbytek; „pokud bude dobírat v úseku zbytek,
  // může zajet i do dalšího úseku, aby ten zbytek dobral" a „N1410 G1 X39.545
  // Z195.750 — tahle dráha má pokračovat a dobrat ten zbytek, aby po
  // zanořování nezbyl ten kousek". Řetěz proto z konce posledního průchodu
  // oblasti pokračuje rampami po téže přímce (o ap níž, pod úhlem zanoření)
  // i za HRANICI ÚSEKU (ne za ruční konec rozsahu 📐) dolů: končí na offsetu
  // dílu (nezajede do něj), u držáku, který se nevejde (pravidlo 2), u kroku,
  // který by vzal víc než jednu vrstvu (pravidlo 3 — za hranicí stojí
  // neobrobený materiál dalšího úseku), nebo u kroku, který už nic neubere
  // (dál vede vzduchem; co je pod ním, obrobí další úsek — pravidlo 5).
  const chainTopAt = stockLoopRaw ? topXOnLoopFn(stockLoopRaw) : null;
  const continueChainBeyond = (zLo, mark) => {
    if (!chainTopAt || typeof cutStats !== 'function' || passes.length <= mark) return;
    const last = passes[passes.length - 1];
    if (!last || !last.rule7 || last.noRetract || !Number.isFinite(last.x)) return;
    const lo = last.contourLeadOut;
    const e = lo && lo.length ? { x: lo[lo.length - 1].x2, z: lo[lo.length - 1].z2 } : { x: last.x, z: last.zEnd };
    const run = step / plungeTan;
    // Konec posledního průchodu leží u hranice (nejvýš jeden krok rampy před ní).
    if (!(e.z - zLo <= run + 0.6 && e.z - zLo >= -0.6)) return;
    // Za hranicí pokračuje skutečný polotovar (jinak je to konec polotovaru).
    if (chainTopAt(zLo - 0.5) === null) return;
    const real = { topAt: chainTopAt };
    const chain = [];
    let x = e.x, z = e.z;
    for (let k = 0; k < 400; k++) {
      let x2 = x - step, z2 = z - run, floorHit = false;
      // Nezajet do dílu: krok se zkrátí na první dotek offsetu (dno — konec řetězu).
      const gougeAt = (t) => O(z + (z2 - z) * t) > x + (x2 - x) * t + 0.02;
      let tHit = null;
      for (let t = 0.02; t <= 1 + 1e-9; t += 0.02) if (gougeAt(t)) { tHit = t; break; }
      if (tHit !== null) {
        let a = Math.max(0, tHit - 0.02), b = tHit;
        for (let it = 0; it < 30; it++) { const m = (a + b) / 2; if (gougeAt(m)) b = m; else a = m; }
        if (a < 1e-3) break;
        x2 = x + (x2 - x) * a; z2 = z + (z2 - z) * a; floorHit = true;
      }
      if (x2 < -MAT) break;
      const seg = { type: 'line', x1: x, z1: z, x2, z2 };
      // Kolik krok ubere ze skutečného polotovaru (proti podlaze dosud
      // vydaných průchodů i předchozích kroků řetězu) — a nejvýš jednu
      // vrstvu (pravidlo 3): za hranicí může stát neobrobený materiál
      // dalšího úseku (hrb), do kterého by krok zajel celou výškou.
      const st = cutStats([seg], { ...real, floorSegs: chain });
      if (!st || st.maxThick > step + 0.05) break;
      if (!(st.area > 0.05)) break;
      const c = { x: x2, zStart: z2, zEnd: z2, ramp: { x0: x, z0: z } };
      if (holderClamp && holderClamp(c.x, c.zStart, c.zEnd, {}) === null) break;
      if (typeof residEntryArea === 'function' && residEntryArea(c, [], entryTol) > entryTol) break;
      // `retractRadial` = odjezd kolmo v X (ops/roughEmit.js): šikmý odskok
      // zpět by nosem zavadil o zbytek u hranice a výjezd by pak jel celý
      // posuvem (`Výjezd materiálem posuvem` až na X150).
      passes.push({ type: 'long', x: x2, zStart: z2, zEnd: z2, rule7: true, ramp: { x0: x, z0: z }, rampEntryClear: true, chainBeyond: true, retractRadial: true });
      chain.push(seg);
      x = x2; z = z2;
      if (floorHit) break;
    }
  };

  const nStart = passes.length;
  for (const reg of regions) {
    const depths = depthsFor(reg.zLo, reg.zHi);
    if (!depths || depths.length === 0) continue;
    regionTop = reg.zHi;
    const mark = passes.length;
    buildRegion(depths, reg.zHi, reg.zLo, 0, NaN);
    if (reg.sectionLo !== false) continueChainBeyond(reg.zLo, mark);
  }
  // NAVAZUJÍCÍ PRŮCHOD ZAČÍNÁ, KDE PŘEDCHOZÍ SKONČIL → bez odskoku. Dřív
  // odjel o Odskok a hned se na totéž místo vrátil (díl uživatele 30. 9. 2026
  // (10): `N2570 G1 X48.618 ; Výjezd v X (stěna)`, `N2580 G0 X47.730`,
  // `N2590 G1 X46.618` — dva sjezdy po mezní čáře u meze úseku 1).
  const endOf = (p) => {
    const lo = p.contourLeadOut;
    if (lo && lo.length) return { x: lo[lo.length - 1].x2, z: lo[lo.length - 1].z2 };
    // Bez těla (jen nájezd, „taneček" u meze) stojí nástroj na konci nájezdu.
    const li = p.contourLeadIn;
    if (li && li.length && Math.abs(p.zStart - p.zEnd) < 1e-6) return { x: li[li.length - 1].x2, z: li[li.length - 1].z2 };
    return { x: p.x, z: p.zEnd };
  };
  const startOf = (p) => (p.contourLeadIn && p.contourLeadIn.length ? { x: p.contourLeadIn[0].x1, z: p.contourLeadIn[0].z1 }
    : p.ramp ? { x: p.ramp.x0, z: p.ramp.z0 } : { x: p.x, z: p.zStart });
  for (let i = Math.max(nStart, 1); i < passes.length; i++) {
    const a = passes[i - 1], b = passes[i];
    if (!a || !b || !a.rule7 || !b.rule7 || a.noRetract) continue;
    const e = endOf(a), s0 = startOf(b);
    if (!(Math.abs(e.x - s0.x) < 0.011 && Math.abs(e.z - s0.z) < 0.011)) continue;
    // Nájezdy končí o ZTOL za začátkem vrstvy — začátek dalšího průchodu se
    // srovná přesně na konec předchozího (o setinu), jinak emise vydala
    // mezi nimi prázdné `G0`.
    if (b.contourLeadIn && b.contourLeadIn.length) {
      b.contourLeadIn[0] = { ...b.contourLeadIn[0], x1: e.x, z1: e.z };
    } else if (b.ramp) {
      b.ramp = { ...b.ramp, x0: e.x, z0: e.z };
    } else if (Math.abs(e.x - s0.x) > 1e-6 || Math.abs(e.z - s0.z) > 1e-6) continue;
    a.noRetract = true;
  }
  if (foundErrors && (holderSkips || holderShifts))
    foundErrors.push({ type: 'warning', msg: `Držák (pravidlo 2): ${holderShifts} vrstev vjíždí dál od stěny rampou, ${holderSkips} vrstev vynecháno — u stěny by držák vjel do materiálu. Zbytek obrobte z druhé strany nebo jiným nástrojem.` });
  if (foundErrors && !passes.length) foundErrors.push({ type: 'warning', msg: 'Pravidlo 7: v úseku nevznikla žádná vrstva (nic k obrobení?).' });
}
