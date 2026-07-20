// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – hrubovací dráhy z booleovské geometrie (Fáze 3         ║
// ║  migrace na Clipper2, viz docs/geometry-libs-migration.md)   ║
// ╚══════════════════════════════════════════════════════════════╝
//
// GEOMETRICKÉ JÁDRO Fáze 3 — čisté funkce nad Clipper2 adaptérem
// (geomCore.js). Nahrazuje ruční scan-line hledání řezných Z-intervalů
// (genLongPasses/scanIntervals) množinovou geometrií:
//
//   1. ZBYTKOVÝ MATERIÁL  = polotovar − (kontura ⊕ offset R + přídavky)
//      Offset kontury je už spočtený (a správně anizotropní pro aX≠aZ) —
//      REUŽÍVÁME hotový `offsetPath` (dráha STŘEDU špičky), uzavřený k ose;
//      scalar polyOffset by anizotropii ztratil (viz Fáze 4 pozn. o elipse).
//   2. VRSTVA  = zbytek ∩ pás [xLo, xHi]  → Clipper vrátí samostatné
//      smyčky = REGIONY zadarmo (dnešní regionRoughing to dělá ručně).
//   3. Řezné Z-intervaly ve vrstvě = průnik vrstvy s vodorovnou čárou
//      hloubky průchodu (spodní hrana pásu).
//
// Souřadnice: CAM {x = poloměr [mm], z = axiálně [mm]}, stejně jako simPath
// a geomCore. Nezávislé na flipX/flipZ i machineStructure.
//
// STAV: čistá geometrie + testy (tests/boolean-roughing.test.js). NAPOJENÍ
// do generátoru drah (genLongPasses za příznakem) je samostatný krok —
// tento modul zatím NIC nemění na G-kódu ani regresních snapshotech.

import { polyDifference, polyIntersect, polyArea, polySimplify } from '../../geom/geomCore.js';

// Velký Z-přesah pro pásové obdélníky (mimo jakýkoli reálný díl).
const Z_INF = 1e6;

/**
 * Navzorkuje segment offsetu (line/arc) na posloupnost bodů {x, z}.
 * Oblouky po ~`chord` mm tětivy (shodně s buildStockLoop). Vrací body
 * VČETNĚ počátku i konce segmentu.
 */
function sampleSegment(seg, chord = 0.2) {
  if (seg.type === 'line') {
    return [{ x: seg.p1.x, z: seg.p1.z }, { x: seg.p2.x, z: seg.p2.z }];
  }
  // arc
  let sA = seg.startAngle, eA = seg.endAngle;
  if (sA === undefined || eA === undefined) {
    sA = Math.atan2((seg.refP1 || seg.p1).x - seg.cx, (seg.refP1 || seg.p1).z - seg.cz);
    eA = Math.atan2((seg.refP2 || seg.p2).x - seg.cx, (seg.refP2 || seg.p2).z - seg.cz);
  }
  if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
  if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
  const steps = Math.max(2, Math.min(64, Math.ceil(seg.r * Math.abs(eA - sA) / chord)));
  const pts = [];
  for (let j = 0; j <= steps; j++) {
    const a = sA + (eA - sA) * (j / steps);
    pts.push({ x: seg.cx + Math.sin(a) * seg.r, z: seg.cz + Math.cos(a) * seg.r });
  }
  return pts;
}

/**
 * Uzavřená smyčka „zakázané" oblasti (finální díl + přídavek) z dráhy
 * STŘEDU špičky (`offsetPath`, segmenty line/arc v jízdním pořadí =
 * klesající Z). Body offsetu se navzorkují a spojí, pak se profil uzavře
 * k ose soustružení (x = `axisX`, default 0): konec offsetu → osa →
 * druhý konec offsetu → zpět. Výsledek = plné těleso, do kterého STŘED
 * špičky nesmí; zbytek polotovaru mimo něj je hrubovací oblast.
 *
 * Vrací [] když je offset prázdný nebo degenerovaný (< 2 body).
 */
export function offsetRegionLoop(offsetPath, axisX = 0) {
  if (!Array.isArray(offsetPath) || offsetPath.length === 0) return [];
  const pts = [];
  const push = (p) => {
    const l = pts[pts.length - 1];
    if (!l || Math.hypot(l.x - p.x, l.z - p.z) > 1e-6) pts.push({ x: p.x, z: p.z });
  };
  for (const seg of offsetPath) {
    if (seg.isDegenerate) continue;
    for (const p of sampleSegment(seg)) push(p);
  }
  if (pts.length < 2) return [];
  const first = pts[0], last = pts[pts.length - 1];
  // Uzavřít k ose: z posledního (nejmenší Z) dolů na osu, podél osy zpět
  // k Z prvního (největší Z), odtud smyčka spojí zpět na first.
  if (Math.abs(last.x - axisX) > 1e-6) push({ x: axisX, z: last.z });
  push({ x: axisX, z: first.z });
  return pts;
}

/**
 * Oblast dílce vzorkováním funkce `offsetXAt(z)` (max X dráhy STŘEDU špičky
 * na dané Z, null = vzduch) po kroku `dz` přes [zMin, zMax], uzavřená k ose.
 * ROBUSTNĚJŠÍ než `offsetRegionLoop` u reálných dílů: offsetPath má u kapes/
 * bossů chainBreaky a nesouvislé větve — jejich přímé sešití do jedné smyčky
 * dá nesmyslný polygon. Vzorkování max X (přesně to, co používá scan-line
 * `blockedAt`) dá věrnou hranici, takže booleovské intervaly SEDÍ se scan-line.
 * Kde `offsetXAt` vrací null (vzduch nad čelem / za dílem) → hranice na ose
 * (x=`axisX`), tj. všechen polotovar tam je zbytek.
 */
export function sampleOffsetRegion(offsetXAt, zMax, zMin, dz = 0.2, axisX = 0) {
  const clamp = (x) => (x === null || x < axisX) ? axisX : x;
  const pts = [];
  for (let z = zMax; z > zMin + 1e-9; z -= dz) pts.push({ x: clamp(offsetXAt(z)), z });
  pts.push({ x: clamp(offsetXAt(zMin)), z: zMin });   // přesný spodní vzorek
  pts.push({ x: axisX, z: zMin });                    // uzavřít k ose
  pts.push({ x: axisX, z: zMax });
  return pts;
}

/**
 * Zbytkový materiál = polotovar − oblast (dílec + přídavek).
 * `stockLoop` = uzavřená smyčka polotovaru (buildStockLoop). `regionLoop`
 * = offsetRegionLoop(offsetPath). Vrací pole smyček zbytku (může být
 * prázdné, když je díl ≥ polotovar).
 */
export function buildResidual(stockLoop, regionLoop) {
  if (!stockLoop || stockLoop.length < 3) return [];
  if (!regionLoop || regionLoop.length < 3) return [stockLoop.map(p => ({ x: p.x, z: p.z }))];
  return polyDifference([stockLoop], [regionLoop]);
}

/**
 * Vrstva hrubování = zbytek ∩ pás poloměrů [xLo, xHi] (volitelně omezený
 * v Z na [zLo, zHi]). Clipper vrátí samostatné smyčky = REGIONY (výstupky
 * oddělené údolími/kapsami) zadarmo. `xLo` = hloubka průchodu (spodní
 * hrana pásu), `xHi` = xLo + ap (nebo vrch materiálu). Vrací pole smyček.
 */
export function sliceLayer(residualLoops, xLo, xHi, zLo = -Z_INF, zHi = Z_INF) {
  if (!residualLoops || residualLoops.length === 0) return [];
  const band = [
    { x: xLo, z: zHi }, { x: xHi, z: zHi },
    { x: xHi, z: zLo }, { x: xLo, z: zLo },
  ];
  return polyIntersect(residualLoops, [band]);
}

/**
 * Řezné Z-intervaly na hloubce průchodu X = průnik smyček s vodorovnou
 * čárou x = X. Vrací pole [{ zStart, zEnd }] SEŘAZENÉ od největšího Z
 * (zStart, pravá hrana) k nejmenšímu (jízdní pořadí zprava doleva),
 * uvnitř každého intervalu zStart > zEnd. Slouží k porovnání s dřívějším
 * scanIntervals i jako základ emise průchodů.
 */
export function layerZIntervalsAtX(loops, X, eps = 1e-4) {
  const crossings = [];
  for (const loop of loops) {
    const n = loop.length;
    for (let i = 0; i < n; i++) {
      const a = loop[i], b = loop[(i + 1) % n];
      const xa = a.x, xb = b.x;
      // Hrana protíná vodorovnou čáru x = X (striktně mezi konci, ať se
      // vrcholy nepočítají dvakrát).
      if ((xa <= X && xb > X) || (xb <= X && xa > X)) {
        const t = (X - xa) / (xb - xa);
        crossings.push(a.z + (b.z - a.z) * t);
      }
    }
  }
  if (crossings.length < 2) return [];
  crossings.sort((p, q) => p - q);   // vzestupně v Z
  // Sudé páry = vnitřek materiálu (parita). Interval [z_2k, z_2k+1].
  const intervals = [];
  for (let k = 0; k + 1 < crossings.length; k += 2) {
    const zLo = crossings[k], zHi = crossings[k + 1];
    if (zHi - zLo > eps) intervals.push({ zStart: zHi, zEnd: zLo });
  }
  // Jízdní pořadí: od největšího Z doleva.
  intervals.sort((p, q) => q.zStart - p.zStart);
  return intervals;
}

/**
 * Kompletní posloupnost hloubkových vrstev nad zbytkovým materiálem.
 * Pro každou hloubku `X` z `depths` (klesající, od vrchu materiálu k dílu)
 * vrátí { X, regions } kde regions = smyčky vrstvy [X, X+step] a jejich
 * řezné intervaly na hloubce X. `depths` už zahrnují vynucený poslední
 * průchod na minPartX (viz genLongPasses). Čistá geometrie — bez ramp,
 * nájezdů, obálky držáku (ty řeší napojení v genLongPasses).
 */
export function buildLayers(residualLoops, depths, step, zLo = -Z_INF, zHi = Z_INF) {
  const layers = [];
  for (const X of depths) {
    const regionLoops = sliceLayer(residualLoops, X, X + step, zLo, zHi);
    const intervals = layerZIntervalsAtX(regionLoops, X);
    layers.push({ X, regionLoops, intervals });
  }
  return layers;
}

/** Plocha zbytkového materiálu [mm²] (kladně) — pro testy/telemetrii. */
export function residualArea(residualLoops) {
  return Math.abs(polyArea(residualLoops));
}

/** Zjednodušení smyček pro kreslení/rychlost (ε default 0,005 mm). */
export function simplifyLoops(loops, eps = 0.005) {
  return polySimplify(loops, eps);
}
