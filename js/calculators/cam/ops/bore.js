// ╔═════════════════════════╗
// ║  OPERACE: VYVRTÁVÁNÍ            ║
// ╚═════════════════════════╝
// Podélné hrubování díry vyvrtávací tyčí — pravidlo 13 (docs/cam-pravidla.md,
// schválil uživatel 7. 10. 2026): „Vnitřní obrábění je zrcadlo vnějšího
// v ose X. Platí pravidla 1–12 beze změny, jen ‚nahoru' znamená ‚k ose'
// a polotovar je předvrtaná díra. Tyč se musí vejít do díry."
//
// Samostatná operace s vlastním programem jako vrtání a závit: když je
// aktivní, generátor nedělá nic jiného.
//
// JAK: díra se překlopí kolem poloměru R_ref (r' = R_ref − r). Stěna díry
// je v zrcadle povrch hřídele, předvrtání válcový polotovar, osa obrobku
// „nahoře". Na takovém světě se spustí CELÝ obyčejný výpočet a emise
// vnějšího hrubování zprava (computeCalculation + generateAutoGCode —
// předané v ctx, ať tenhle modul neimportuje emitor zpátky) a z hotového
// programu se vezme tělo hrubování: X se překlopí zpátky (X = k·R_ref − X'),
// G2↔G3. Úseky, vrstvy po ap, držák, vjezdy, rychloposuvy — všechno je
// tentýž kód jako venku, žádná druhá (chudší) kopie. Obrys vyvrtávací tyče
// z 📚 katalogu je nakreslený přesně v tomhle zrcadle (isoInternalTools.js:
// +z profilu = od špičky k ose tyče = k ose obrobku).
//
// První verze (rozhodnutí uživatele 7. 10. 2026): jen podélné hrubování
// válcové díry ⌀D × délka L od Z čela, z předvrtání ⌀d0 × L0 (z operace
// Vrtání, nebo zadané). 8. 10. 2026: i ZLEVA (od levého čela k +Z) — k zrcadlu
// v X se přidá zrcadlo v Z (sideOf, unmirrorBoreLine s = −1).
// 8. 10. 2026: tvar díry i z VÝKRESU (`boreSource: 'cad'`) — samostatný
// řetěz z CAD nebo díra napojená na čelo vnější kontury (cam/boreContour.js).
// 9. 10. 2026: předvrtání vrtákem v témže programu (ops/borePreDrill.js) —
// válec do hloubky plného ⌀ L0 + kužel špičky (`borePreTip`), který končí na
// dně díry + Přídavek Z. Tyč z něj podélně bezpečně vezme stěnu jen do L0:
// níž stojí kolem kuželu materiál a tyč (tělo míří k ose) by se o něj opřela
// — změřeno: zrcadlo s kuželem jako polotovarem plánovalo průchody přes osu.
// V zrcadle proto díra končí falešným dnem v L0 (+ přídavek Z, `Lcut`) a dno
// díry (prstenec + kužel) se nahlásí — dobere ho až „dno díry čelně".

import { buildControlTailLines } from '../controlDialect.js';
import { stockClearances } from '../camMath.js';
import { holderProfileLoop } from '../collisionValidator.js';
import { buildInsertOutlineSegments } from '../insertPreview.js';
import { getInsert } from '../inserts/index.js';
import { boreChainFromState } from '../boreContour.js';
import { mirrorZLimits } from '../zMirror.js';
import { polyDifference, polyUnion } from '../../../geom/geomCore.js';

const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
/** O kolik je R_ref nad stěnou díry — v zrcadle „osa" leží v dílu, mimo obrábění. */
const R_REF_MARGIN = 5;
/** Vůle mezi tyčí a protější stěnou díry, pod kterou se nejede [mm]. */
const WALL_GAP = 0.2;
/**
 * Strana: s = +1 zprava (do díry k −Z), −1 zleva (k +Z). Vnitřní svět je vždy
 * vnější hrubování ZPRAVA: skutečné (r, z) ↔ zrcadlové (R_ref − r, s·z).
 * Zleva se tedy navíc překlopí Z (jako „zleva" u vnějšího obrábění) — oblouky
 * se pak otočí dvakrát a G2/G3 zůstanou.
 */
const sideOf = (prms) => ((prms.roughingSide || 'right') === 'left' ? -1 : 1);

/**
 * Geometrie vyvrtávání z parametrů (sdílí emise, UI i testy).
 * @param chain  tvar díry z výkresu (segmenty od ústí dovnitř, boreChainFromState)
 *               — jen při `boreSource: 'cad'`; jinak válec ⌀ × délka z parametrů
 * @returns {{ok:boolean, reason?:string, k:number, zF:number, D:number, L:number,
 *   d0:number, L0:number, r:number, r0:number, rRef:number, rIn:number, reach:number,
 *   chain:Array|null}}
 */
export function boreGeom(prms, chain = null) {
  const k = prms.mode === 'DIAMON' ? 2 : 1;          // jednotky X v programu (průměr / poloměr)
  const fromCad = prms.boreSource === 'cad';
  const s = sideOf(prms);
  const d0 = Math.max(0, num(prms.borePreDiameter, 0)), L0 = Math.max(0, num(prms.borePreDepth, 0));
  const r0 = d0 / 2;
  // Kužel špičky předvrtání (ops/borePreDrill.js): špička končí o tipL hlouběji.
  const tipL = Math.max(0, num(prms.borePreTip, 0));
  const allowZ = Math.max(0, num(prms.allowanceZ, 0));
  let zF = num(prms.boreZStart, 0);
  let D = Math.max(0, num(prms.boreDiameter, 0)), L = Math.max(0, num(prms.boreDepth, 0));
  const cad = fromCad && Array.isArray(chain) && chain.length > 0 ? chain : null;
  if (cad) {
    // Ústí = začátek řetězu; ⌀ = největší průměr; délka = nejhlubší bod, kde
    // je co vyvrtat (body uvnitř předvrtání — dno vrtané díry — se nepočítají).
    const pts = cad.flatMap(s => [s.p1, s.p2]);
    zF = cad[0].p1.z;
    D = 2 * Math.max(...pts.map(p => p.x));
    const cut = pts.filter(p => p.x > r0 + 0.01);
    L = cut.length ? Math.max(...cut.map(p => s * (zF - p.z))) : 0;
  }
  const r = D / 2;
  // Předvrtání se špičkou: podélně jen do hloubky plného ⌀ (viz hlavička).
  const Lcut = tipL > 0 && L0 + allowZ < L - 1e-6 ? L0 + allowZ : L;
  const reach = boreToolReach(prms);
  // Rychloposuvy v díře: o vůli X od stěny předvrtání — tatáž vůle, o kterou
  // je venku plánovací obrys nad polotovarem (v zrcadle je to přesně on).
  const clr = stockClearances(prms);
  const clrX = Math.max(0.1, clr.x), clrZ = Math.max(0, clr.z);
  const rIn = r0 - clrX;
  const g = { ok: true, k, s, zF, D, L, Lcut, d0, L0, tipL, r, r0, rRef: r + R_REF_MARGIN, rIn, clrX, clrZ, reach, chain: cad };
  const fail = (reason) => ({ ...g, ok: false, reason });
  if (!getInsert(prms).canBore) return fail('Nástroj není vyvrtávací tyč (destička polygon nebo kulatá) — vyber ji ve 🔧 Zásobníku.');
  if (fromCad && !cad) return fail('Ve výkresu není díra — nakresli stěnu díry (samostatně, nebo napojenou na čelo dílu), nebo přepni na Válec ⌀ × délka.');
  if (!(D > 0 && L > 0)) return fail(cad ? 'Nakreslená díra neleží mimo předvrtání — není co vyvrtat.' : 'Zadej průměr a délku díry.');
  if (!(d0 > 0 && L0 > 0)) return fail('Zadej předvrtání (průměr a hloubku) — nebo ho převezmi z Vrtání.');
  if (!(D > d0 + 0.01)) return fail(`Díra ⌀${D} není větší než předvrtání ⌀${d0} — není co vyvrtat.`);
  // S kuželem špičky stačí, když špička dojede na dno + přídavek Z.
  if (L > L0 + (tipL > 0 ? tipL + allowZ : 0) + 1e-6) return fail(`Díra (${L} mm) je hlubší než předvrtání (${L0} mm) — vyvrtávací tyč nevrtá do plného.`);
  // Pravidlo 13: tyč se musí vejít do díry už na vjezdu (nejblíž k ose).
  if (!boreFits(rIn, reach, r0)) {
    return fail(`Tyč se do díry nevejde (pravidlo 13): sahá ${reach.toFixed(1)} mm od špičky k ose, předvrtání ⌀${d0} — je potřeba větší předvrtání nebo tenčí tyč.`);
  }
  return g;
}

/** Jak daleko od špičky (středu nosu) k ose sahá nástroj — tyč i destička [mm]. */
export function boreToolReach(prms) {
  const zs = (holderProfileLoop(prms) || []).map(p => p.z);
  for (const s of buildInsertOutlineSegments(prms)) {
    if (s.type === 'circle') zs.push(s.cz + s.r);
    else if (s.type === 'arc') zs.push(s.cz + s.r, s.from.z, s.to.z);   // oblouk: shora odhad
    else if (s.from) zs.push(s.from.z, s.to.z);
  }
  return Math.max(0, ...zs.filter(Number.isFinite));
}

/** Vejde se tyč, když je špička na poloměru rTip? Protější stěna = předvrtání. */
export function boreFits(rTip, reach, r0) {
  return rTip - reach > -r0 + WALL_GAP;
}

/** Za dnem díry vede kontura o vůli X + tolik UVNITŘ předvrtání [mm]. */
const BEYOND_BOTTOM_IN = 0.5;

/**
 * Kam (hloubka od čela) sahá polotovar v zrcadle: válec předvrtání do L0;
 * s falešným dnem (předvrtání se špičkou, `Lcut`) ještě 1 mm za něj — pod
 * L0 je skutečný materiál (dno díry), rychloposuvy tam nesmí.
 */
export function boreStockDepth(g) {
  return g.Lcut < g.L ? Math.max(g.L0, g.Lcut + 1) : g.L0;
}
/** O kolik před pásmem vůle před čelem díry leží bezpečné Z tyče [mm]. */
const FRONT_SAFE = 5;
/** O kolik za pásmo vůle před čelem začíná stěna díry v zrcadle [mm]. */
const FRONT_EXT = 2;

/**
 * Kontura díry v zrcadle (body programu, od čela dovnitř): stěna díry už
 * PŘED čelem, dno díry, pak uvnitř předvrtání (za pásmem vůle) až za konec
 * polotovaru.
 * - Čelo dílu (mezikruží kolem díry) v zrcadle není: s malým rádiusem nosu
 *   (0,4) je pásmo vůle před čelem širší než odsazení čela a hloubky pod
 *   dnem díry by tam jezdily krátké průchody posuvem, které nic neuberou.
 * - Kdyby za dnem ležela na stěně předvrtání nebo v pásmu vůle (v zrcadle
 *   pod plánovacím obrysem = „materiál"), dojezd „bez schodků" by po ní jel
 *   posuvem vzduchem až na dno předvrtání.
 * - Kdyby skončila na dně (nebo šla až k ose), vrstvy by za dnem pokračovaly
 *   do konce polotovaru a „Výjezd nad konturu" by šel přes osu.
 */
export function boreMirrorContour(g) {
  if (g.chain) return chainMirrorContour(g);
  const { k, Lcut, r, r0, rRef, clrX, clrZ } = g;
  const zF = g.s * g.zF;                      // čelo v zrcadle (zleva překlopené Z)
  const X = (rr) => +(k * (rRef - rr)).toFixed(6);
  const rIn = r0 - clrX - BEYOND_BOTTOM_IN, zEnd = zF - boreStockDepth(g) - 1;
  const zIn = zF + clrZ + FRONT_EXT;
  const pts = [[zIn, X(r)], [zF - Lcut, X(r)], [zF - Lcut, X(rIn)], [zEnd, X(rIn)]];
  return pts.map(([z, x], i) => ({ id: i + 1, type: i ? 'G1' : 'G0', x, z, r: 0, mode: 'ABS' }));
}

/**
 * Totéž pro díru z výkresu: ústí protažené před čelo, řetěz díry (oblouky
 * v zrcadle G2↔G3), a kde řetěz zajede do předvrtání za pásmo vůle (dno
 * vrtané díry, dno k ose), skončí na té hranici a pokračuje za konec
 * polotovaru jako u válce.
 */
/** O kolik za osu (do x' > R_ref) sahá kontura DNA při čelním dobrání [mm]. */
export const FLOOR_BEYOND_AXIS = 3.5;

/**
 * @param opts.beyondAxis  kontura jde až FLOOR_BEYOND_AXIS za osu místo konce uvnitř
 *   předvrtání (čelní dobrání dna, ops/boreFloor.js) — bez podvrhování g.r0
 */
export function chainMirrorContour(g, opts = {}) {
  const { k, L0, r0, rRef, clrX, clrZ } = g;
  const zF = g.s * g.zF;
  // Zleva: řetěz překlopený v Z (oblouk tím obrátí smysl) — dál jako zprava.
  const chain = g.s > 0 ? g.chain : g.chain.map(sg => ({
    ...sg, p1: { x: sg.p1.x, z: -sg.p1.z }, p2: { x: sg.p2.x, z: -sg.p2.z },
    ...(sg.type === 'arc' ? { dir: sg.dir === 'G2' ? 'G3' : 'G2' } : {}),
  }));
  const X = (rr) => +(k * (rRef - rr)).toFixed(6);
  const rB = opts.beyondAxis ? -FLOOR_BEYOND_AXIS : r0 - clrX - BEYOND_BOTTOM_IN, zEnd = zF - boreStockDepth(g) - 1;
  const p0 = chain[0].p1;
  const pts = [{ type: 'G0', x: X(p0.x), z: zF + clrZ + FRONT_EXT }, { type: 'G1', x: X(p0.x), z: p0.z }];
  let last = p0;
  // Falešné dno (předvrtání se špičkou): řetěz končí v hloubce Lcut — úsečka
  // se tam rozdělí, oblouk přes ni se vynechá (stěna pak jede svisle dolů).
  const zCut = zF - g.Lcut, cutting = g.Lcut < g.L;
  for (const s of chain) {
    if (cutting && s.p2.z < zCut - 1e-9) {
      if (s.type === 'line' && s.p1.z > zCut + 1e-9) {
        const t = (s.p1.z - zCut) / (s.p1.z - s.p2.z);
        last = { x: s.p1.x + (s.p2.x - s.p1.x) * t, z: zCut };
        if (last.x >= rB) pts.push({ type: 'G1', x: X(last.x), z: last.z });
      }
      if (last.z > zCut + 1e-9 && last.x >= rB) { last = { x: last.x, z: zCut }; pts.push({ type: 'G1', x: X(last.x), z: zCut }); }
      break;
    }
    if (s.p2.x < rB) {
      if (s.type === 'line' && s.p1.x > rB) {
        const t = (s.p1.x - rB) / (s.p1.x - s.p2.x);
        last = { x: rB, z: s.p1.z + (s.p2.z - s.p1.z) * t };
        pts.push({ type: 'G1', x: X(last.x), z: last.z });
      }
      break;
    }
    pts.push(s.type === 'line'
      ? { type: 'G1', x: X(s.p2.x), z: s.p2.z }
      : { type: s.dir === 'G2' ? 'G3' : 'G2', x: X(s.p2.x), z: s.p2.z, r: s.r });
    last = s.p2;
  }
  if (last.x > rB + 1e-6) pts.push({ type: 'G1', x: X(rB), z: last.z });
  pts.push({ type: 'G1', x: X(rB), z: Math.min(zEnd, last.z - 1) });
  return pts.map((p, i) => ({ id: i + 1, mode: 'ABS', r: 0, ...p }));
}

/**
 * Parametry zrcadlového světa: válec = předvrtání, vnější hrubování zprava.
 * Dokončení stěny díry (`boreFinish`) = vnější dokončovací průchod v zrcadle,
 * VŽDY týmž nástrojem (finishingSlot vnějšího obrábění by do díry poslal
 * vnější dokončovací nůž).
 */
export function boreMirrorParams(prms, g) {
  return {
    ...prms,
    boreActive: false, borePreDrill: false, drillActive: false, threadActive: false, partOffZ: null,
    roughingStrategy: 'longitudinal', roughingSide: 'right', doFinishing: !!prms.boreFinish, finishOnly: false,
    finishingSlot: null,
    stockMode: 'cylinder', stockDiameter: 2 * (g.rRef - g.r0), stockFace: g.s * g.zF,
    stockLength: boreStockDepth(g) - g.s * g.zF,
    safeX: +(g.k * (g.rRef - g.rIn)).toFixed(6),
    // Bezpečné Z uvnitř vnitřního světa = PŘED čelem díry (Bezpečná poloha
    // stroje bývá za dílem (nález uživatele 9. 10. 2026: Bp Z5 u dílu
    // Z0–143 → tyč jela osou přes plné dno dílu).
    // Zrcadlový rám (zleva Z' = −Z, ale číslo Bp se bere beze změny jako dřív):
    // Bp se zachová, když leží před čelem aspoň o vůli Z; jinak se dá před čelo.
    safeZ: +(num(prms.safeZ, 0) - g.s * g.zF >= g.clrZ ? num(prms.safeZ, 0) : g.s * g.zF + g.clrZ + FRONT_SAFE).toFixed(6),
  };
}

/**
 * Co vyvrtávání (s předvrtáním) ve skutečném světě odebralo: pás díry od
 * čela do konce polotovaru v zrcadle MÍNUS zbytek ze zrcadla (překlopený
 * zpět, `remainReal`) MÍNUS materiál kolem kuželu po špičce vrtáku.
 */
export function boreRemovedLoops(g, remainReal) {
  const { zF, L0, rRef, s, r0, tipL } = g;
  const dz = boreStockDepth(g);
  const zone = [{ x: 0, z: zF }, { x: rRef, z: zF }, { x: rRef, z: zF - s * dz }, { x: 0, z: zF - s * dz }];
  // Předvrtání se špičkou: pod hloubkou plného ⌀ je vyvrtaný jen kužel —
  // materiál kolem něj (uvnitř ⌀ předvrtání) zrcadlo nezná, patří k dílu.
  const keep = remainReal.slice();
  if (!(tipL > 0)) return polyDifference([zone], keep);
  const far = dz + tipL + 10;
  keep.push([{ x: r0, z: zF - s * L0 }, { x: 0, z: zF - s * (L0 + tipL) }, { x: 0, z: zF - s * far }, { x: r0, z: zF - s * far }]);
  // Kužel po špičce je vyvrtaný celý, i když sahá za konec pásu díry.
  const cone = [{ x: 0, z: zF - s * L0 }, { x: r0, z: zF - s * L0 }, { x: 0, z: zF - s * (L0 + tipL) }];
  return polyUnion(polyDifference([zone], keep), [cone]);
}

/**
 * Obrys DÍRY ve skutečném světě (x = poloměr, z): od ústí na čele po dno a k ose.
 * Díl nakreslený jako hotový kalíšek díru nemá jako materiál — pro úběr se
 * k dílu přičte, protože se obrábí z plného (vrták + tyč).
 * @returns {Array<{x:number,z:number}>}
 */
export function boreHoleLoop(g) {
  const { zF, s, L } = g;
  const pts = [{ x: 0, z: zF }];
  if (g.chain) {
    pts.push({ x: g.chain[0].p1.x, z: g.chain[0].p1.z });
    for (const sg of g.chain) {
      if (sg.type === 'arc') {
        let d = sg.endAngle - sg.startAngle;
        if (sg.dir === 'G2' && d > 0) d -= 2 * Math.PI;
        if (sg.dir === 'G3' && d < 0) d += 2 * Math.PI;
        for (let j = 1; j <= 12; j++) { const a = sg.startAngle + d * j / 12; pts.push({ x: sg.cx + sg.r * Math.sin(a), z: sg.cz + sg.r * Math.cos(a) }); }
      } else pts.push({ x: sg.p2.x, z: sg.p2.z });
    }
    const last = pts[pts.length - 1];
    if (last.x > 1e-6) pts.push({ x: 0, z: last.z });
  } else {
    pts.push({ x: g.r, z: zF }, { x: g.r, z: zF - s * L }, { x: 0, z: zF - s * L });
  }
  return pts;
}

/**
 * Kus dna díry, který tyč z předvrtání se špičkou nevezme (skutečná Z):
 * prstenec kolem předvrtání od hloubky plného ⌀ L0 po dno a kužel po
 * špičce. null = dno se vyvrtá celé.
 */
export function boreBottomLeft(g) {
  if (!(g.Lcut < g.L)) return null;
  return { zFrom: g.zF - g.s * g.L0, zTo: g.zF - g.s * g.L, thick: g.L - g.L0 };
}

/**
 * Řádek programu ze zrcadla zpět do skutečného světa: X = kRef − X', zprava
 * G2↔G3; zleva (s = −1) navíc Z = −Z' a G2/G3 beze změny (dvě překlopení).
 */
export function unmirrorBoreLine(text, kRef, s = 1) {
  const ci = text.search(/[;(]/);
  let code = ci < 0 ? text : text.slice(0, ci);
  const rest = ci < 0 ? '' : text.slice(ci);
  if (s > 0) code = code.replace(/\bG0?([23])\b/g, (m, d) => m.replace(d, d === '2' ? '3' : '2'));
  code = code.replace(/X(-?\d*\.?\d+)/g, (_, v) => {
    const x = kRef - parseFloat(v);
    return 'X' + (Math.abs(x) < 5e-4 ? 0 : x).toFixed(3);
  });
  if (s < 0) {
    code = code.replace(/Z(-?\d*\.?\d+)/g, (_, v) => {
      const z = -parseFloat(v);
      return 'Z' + (Math.abs(z) < 5e-4 ? 0 : z).toFixed(3);
    });
  }
  return code + rest;
}

/** Je bod (skutečné Z) v díře — za čelem ve směru do díry? */
const inHole = (g, z) => g.s * (g.zF - z) > 1e-6;

/**
 * Zrcadlový svět pro výpočet drah i simulaci: { g, S2 } (S2 = null, když
 * geometrie nevyšla). Kontura díry, válec předvrtání, žádný rozsah 📐 ani
 * X max (patří vnější kontuře), žádné části programu.
 */
export function boreMirrorState(S) {
  const src = S.params.boreSource === 'cad' ? boreChainFromState(S) : null;
  const g = boreGeom(S.params, src ? src.segs : null);
  if (!g.ok) return { g, S2: null };
  // X max v zrcadle = nos se dotkne stěny předvrtání: dokončení skončí na dně
  // díry a nejede dál po pomocném obrysu uvnitř předvrtání (vzduchem).
  // Polotovar (předvrtání) leží pod ním — hrubování to nemění (změřeno).
  const xMax = g.rRef - g.r0 + Math.max(0, num(S.params.toolRadius, 0));
  const S2 = {
    params: boreMirrorParams(S.params, g), contourPoints: boreMirrorContour(g), stockPoints: [],
    zLimits: { ...(g.s > 0 ? S.zLimits : mirrorZLimits(S.zLimits || {})), rangeActive: false },
    xLimits: { rangeXMin: null, rangeXMax: xMax, active: false, minActive: false, maxActive: true },
    guideLines: [], flipX: S.flipX, flipZ: S.flipZ, manualGCode: '', errors: [], genNotes: [],
    toolMagazine: S.toolMagazine,
  };
  return { g, S2 };
}

/**
 * Simulace vyvrtávání v ZRCADLE drah (úběr, validátor, kolize držáku, zajetí
 * do kontury počítají s vnějším nožem — v zrcadle je to pravda).
 * @returns {{g, params, calcM:{simPath, stockPathSegments, contourSegments}, un:(loops)=>loops}|null}
 *   calcM.simPath = skutečná simulovaná dráha překlopená do zrcadla; un()
 *   vrátí smyčky {x,z} (poloměr) zpátky do skutečného světa.
 */
export function boreMirrorSim(S, simPath, computeCalculation) {
  const { g, S2 } = boreMirrorState(S);
  if (!S2 || !Array.isArray(simPath)) return null;
  const calc2 = computeCalculation(S2);
  const flip = (pts) => pts.map(q => ({ ...q, x: g.rRef - q.x, z: g.s * q.z }));
  return {
    g, params: S2.params, un: (loops) => loops.map(flip),
    calcM: { simPath: flip(simPath), stockPathSegments: calc2.stockPathSegments, contourSegments: calc2.contourSegments },
  };
}

/**
 * První pohyb těla (`G0 X.. Z..` na bezpečný bod před čelem) se rozdělí na Z,
 * pak X: z Bezpečné polohy stroje (X venku, Z klidně za dílem) by šikmý
 * rychloposuv vedl skrz díl. Nejdřív se jede v Z po vnější Bp (mimo díl),
 * teprve pak radiálně do osy díry před čelem.
 */
function splitFirstApproach(body) {
  const i = body.findIndex(l => l.simIdx === 0);
  if (i < 0) return;
  const l = body[i];
  // X a Z se čtou nezávisle na pořadí a zápisu (G0 / G00), zbytek řádku zůstane.
  const head = l.text.match(/^(N\d+\s+)G0?0\b/);
  const code = l.text.split(/[;(]/)[0];
  const mx = code.match(/\bX-?\d*\.?\d+/), mz = code.match(/\bZ-?\d*\.?\d+/);
  if (!head || !mx || !mz) return;
  const tail = l.text.slice(code.length);
  body.splice(i, 1,
    { ...l, text: `${head[1]}G0 ${mz[0]} ; Před čelo díry` },
    { ...l, text: `${head[1]}G0 ${mx[0]}${tail ? ' ' + tail : ''}` });
}

/** Rychloposuvy v díře (Z pod čelem) blíž k ose než rIn → na rIn (řádky už ve skutečném světě). */
function clampRapidsToSafeRadius(body, g) {
  let z = null;
  for (const l of body) {
    const ci = l.text.search(/[;(]/);
    const code = ci < 0 ? l.text : l.text.slice(0, ci);
    const mz = code.match(/Z(-?\d*\.?\d+)/);
    const mx = code.match(/X(-?\d*\.?\d+)/);
    const zNew = mz ? parseFloat(mz[1]) : z;
    if (/\bG0?0\b/.test(code) && mx && zNew !== null && inHole(g, zNew) && parseFloat(mx[1]) / g.k < g.rIn - 1e-6) {
      l.text = code.replace(/X(-?\d*\.?\d+)/, 'X' + (g.k * g.rIn).toFixed(3)) + (ci < 0 ? '' : l.text.slice(ci));
    }
    z = zNew;
  }
}

/**
 * @param ctx  { S, prms, lines, addCmt, addN, note, computeCalculation, generateAutoGCode }
 * @returns    hotové řádky programu
 */
export function emitBore(ctx) {
  const { S, prms, lines, addCmt, addN, note, computeCalculation, generateAutoGCode, boreFloorBody } = ctx;
  const { g, S2 } = boreMirrorState(S);
  const warn = (msg) => { if (S.genNotes) S.genNotes.push({ type: 'warning', msg }); };
  addCmt(`--- VYVRTAVANI ⌀${g.D} x ${g.L} z predvrtani ⌀${g.d0} x ${g.L0} (pravidlo 13: zrcadlo vnejsiho hrubovani) ---`);
  let body = null;
  if (!g.ok) {
    addCmt(`! ${g.reason}`);
    warn(`Vyvrtávání: ${g.reason}`);
  } else {
    const inner = generateAutoGCode(S2, computeCalculation(S2));
    // Hlášky ořezu rozsahem patří pomocnému X max (dno díry), ne uživateli.
    for (const e of [...(S2.errors || []), ...(S2.genNotes || [])]) {
      if (e && e.msg && !/^Rozsah (obrábění|X max)/.test(e.msg)) warn(`Vyvrtávání: ${e.msg}`);
    }
    // Tělo = od prvního pohybu (nájezd na bezpečný bod v díře) po závěr programu.
    const start = inner.findIndex(l => l.simIdx === 0);
    const tail0 = buildControlTailLines(prms.controlSystem)[0];
    let end = inner.findIndex((l, i) => i > start && l.text.replace(/^N\d+\s+/, '') === tail0);
    if (end < 0) end = inner.length;
    const kRef = g.k * g.rRef;
    body = start < 0 ? [] : inner.slice(start, end).map(l => ({ ...l, text: unmirrorBoreLine(l.text, kRef, g.s) }));
    splitFirstApproach(body);
    // Výjezd v díře nejdál na vnitřní bezpečný poloměr: „Výjezd nad konturu"
    // po dokončení zvedá nad pomocný obrys za dnem — ve skutečnosti k ose,
    // kde by tyč zadní stranou sáhla na protější stěnu. Na rIn je pořád volné
    // předvrtání (o vůli X od stěny).
    clampRapidsToSafeRadius(body, g);
    // Pravidlo 13: v díře (Z pod čelem) tyč nesmí sáhnout na protější stěnu.
    let x = null, z = null, bad = null;
    for (const l of body) {
      if (l.simIdx === null || l.simIdx === undefined) continue;
      const code = l.text.split(/[;(]/)[0];
      const mx = code.match(/X(-?\d*\.?\d+)/), mz = code.match(/Z(-?\d*\.?\d+)/);
      if (mx) x = parseFloat(mx[1]);
      if (mz) z = parseFloat(mz[1]);
      if (x !== null && z !== null && inHole(g, z) && !boreFits(x / g.k, g.reach, g.r0)) { bad = { x, z }; break; }
    }
    if (bad) {
      const msg = `Tyč se do díry nevejde (pravidlo 13): u Z ${bad.z.toFixed(3)} by zadní strana tyče sáhla na protější stěnu předvrtání ⌀${g.d0}.`;
      addCmt(`! ${msg}`);
      warn(`Vyvrtávání: ${msg}`);
      body = null;
    }
  }
  // Dno díry po předvrtání se špičkou: čelně od osy ven (ops/boreFloor.js —
  // vlastní fáze, týž nůž). Když se nevydá, hlásí se, co zůstává.
  const left = g.ok && body ? boreBottomLeft(g) : null;
  if (left) {
    const f2 = (v) => (Math.round(v * 100) / 100).toString().replace('.', ',');
    const floor = boreFloorBody ? boreFloorBody({ S, warn, computeCalculation, generateAutoGCode }) : null;
    if (floor) {
      body = [...body, { text: `; --- DNO DIRY Z${left.zTo.toFixed(3)} (celne od osy ven, tez nuz) ---`, simIdx: null }, ...floor.body];
    } else {
      addCmt(`! dno diry Z${left.zFrom.toFixed(3)} az Z${left.zTo.toFixed(3)} zustava (predvrtani se spickou)`);
      warn(`Vyvrtávání: dno díry od Z ${f2(left.zFrom)} do Z ${f2(left.zTo)} (${f2(left.thick)} mm) zůstává — z předvrtání se špičkou ho tyč podélně nevezme (tělem by se opřela o kužel po vrtáku) a čelní dobrání dna nevyšlo.`);
    }
  }
  let simCounter = 0;
  for (const l of body || []) {
    if (/^N\d+\s/.test(l.text)) {
      const isMove = l.simIdx !== null && l.simIdx !== undefined;
      if (isMove) simCounter += 1;
      addN(l.text.replace(/^N\d+\s+/, ''), isMove ? simCounter : null);
    } else {
      lines.push({ text: l.text, simIdx: null });
    }
  }
  // Ven z díry je hotovo (tělo končí v Z před čelem) — radiálně na bezpečnou polohu.
  simCounter += 1; addN(`G0 X${prms.safeX}${note('', 'Bezpečná poloha')}`, simCounter);
  buildControlTailLines(prms.controlSystem).forEach(line => addN(line));
  addCmt('--- DIRA (Pro referenci) ---');
  addCmt(`⌀${g.D} x ${g.L} od Z${g.zF}, predvrtani ⌀${g.d0} x ${g.L0}`);
  return lines;
}
