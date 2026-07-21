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
  // Vzorkování offsetXAt po 0,2 mm přes velký Z-rozsah (dlouhý odlitek) dává
  // stovky téměř-kolineárních bodů. Clipper2 na takové husté smyčce u některých
  // tvarů (ověřeno na holder-region-roughing: ~850 bodů) degeneruje do extrémně
  // pomalého/zacyklení. Lehké zjednodušení (ε 0,01 mm, hluboko pod řeznou
  // tolerancí — plocha se nezmění) to spolehlivě řeší.
  const reg = polySimplify([regionLoop], 0.01);
  return polyDifference([stockLoop], reg.length ? reg : [regionLoop]);
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

/**
 * Horní hrana (max X) zbytkového materiálu na dané axiální souřadnici `z`:
 * průsečíky svislé čáry z = konst s hranami smyček, největší X = povrch
 * zbytku. Vrací null, když na tomto Z zbytek žádný materiál nemá (vzduch).
 */
function residualTopXAtZ(loops, z) {
  let top = null;
  for (const loop of loops) {
    const n = loop.length;
    for (let i = 0; i < n; i++) {
      const a = loop[i], b = loop[(i + 1) % n];
      const za = a.z, zb = b.z;
      if ((za <= z && zb > z) || (zb <= z && za > z)) {
        const t = (z - za) / (zb - za);
        const x = a.x + (b.x - a.x) * t;
        if (top === null || x > top) top = x;
      }
    }
  }
  return top;
}

/**
 * Spodní hrana (min X) jedné smyčky na axiální souřadnici `z` — zrcadlo
 * `residualTopXAtZ`, ale nad JEDNOU komponentou a s minimem. To je nejhlubší
 * dosažitelná pozice STŘEDU špičky v této komponentě na daném Z (kde díl
 * stoupá do pásu, je to jeho offset; jinak spodní mez pásu). Vrací null,
 * když svislá čára z komponentu neprotíná.
 */
function loopBottomXAtZ(loop, z) {
  let bot = null;
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const a = loop[i], b = loop[(i + 1) % n];
    const za = a.z, zb = b.z;
    if ((za <= z && zb > z) || (zb <= z && za > z)) {
      const t = (z - za) / (zb - za);
      const x = a.x + (b.x - a.x) * t;
      if (bot === null || x < bot) bot = x;
    }
  }
  return bot;
}

/**
 * ROZKLAD VRSTVY NA KOMPONENTY (Fáze 3, krok 3) — polygon-native primitivum
 * pro emisi dráhy z HRAN regionů. Pás poloměrů [xLo, xHi] ∩ zbytek (volitelně
 * ořez Z na [zLo, zHi], `sliceLayer`) → samostatné smyčky = KOMPONENTY (bosse
 * odlitku i kapsy dílu, oba směry splynutí zadarmo). Pro každou vrátí:
 *
 *   - `zStart` / `zEnd` = Z-rozpětí komponenty (zStart > zEnd, jízdní pořadí
 *     zprava doleva) — grupovací klíč per-hloubka emise (nahrazuje regiony),
 *   - `bottomEdge` = spodní (min-X) hrana komponenty jako polylinie {x,z} od
 *     zStart k zEnd — ŘEZNÁ DRÁHA vrstvy: kde díl stoupá do pásu, kopíruje
 *     jeho offset (dráha středu špičky), jinak je plochá na `xLo`. Sloužit
 *     může přímo jako sled bodů řezu (krok 3C).
 *
 * Klasifikaci konců na „stěna vs otevřený okraj" (`blocked`) tato čistá funkce
 * NEDĚLÁ — vyžaduje konturu dílu (`offsetXAt`), dostupnou až při napojení;
 * tam se dopočte stávajícími helpery (`blockedAt`), aby sémantika seděla se
 * scan-line. Komponenty SEŘAZENÉ zprava (max zStart) doleva. Čistá geometrie.
 */
export function extractLayerComponents(residualLoops, xLo, xHi, zLo = -Z_INF, zHi = Z_INF, dz = 0.2, withEdge = true) {
  const comps = sliceLayer(residualLoops, xLo, xHi, zLo, zHi);
  const out = [];
  for (const loop of comps) {
    let zMax = -Infinity, zMin = Infinity;
    for (const p of loop) { if (p.z > zMax) zMax = p.z; if (p.z < zMin) zMin = p.z; }
    if (!(zMax - zMin > 1e-6)) continue;
    // Ploché řezné intervaly na dně pásu (x = xLo) uvnitř této komponenty —
    // to, co dnes emituje scan-line/intervalová cesta. Sjednocení přes všechny
    // komponenty (seřazené zStart↓) je BIT-shodné s layerZIntervalsAtX(zbytek,
    // xLo) (parity crossings jsou tytéž body), jen rozdělené po komponentách.
    const floorIntervals = layerZIntervalsAtX([loop], xLo);
    const comp = { zStart: zMax, zEnd: zMin, floorIntervals };
    if (withEdge) {
      // Spodní hrana shora (zStart) dolů (zEnd), krok dz; přesný spodní vzorek
      // těsně nad zMin (na hraně by svislice komponentu už neprotla). Řezná
      // dráha z HRAN (krok 3C); u intervalové cesty (3B) se nevzorkuje.
      const bottomEdge = [];
      for (let z = zMax; z > zMin + 1e-9; z -= dz) {
        const x = loopBottomXAtZ(loop, z);
        if (x !== null) bottomEdge.push({ x, z });
      }
      const xEnd = loopBottomXAtZ(loop, zMin + 1e-6);
      if (xEnd !== null) bottomEdge.push({ x: xEnd, z: zMin });
      comp.bottomEdge = bottomEdge;
    }
    out.push(comp);
  }
  out.sort((a, b) => b.zStart - a.zStart);
  return out;
}

/**
 * REGIONY Z GEOMETRIE (Fáze 3, krok 2) — polygon-native náhrada ruční
 * valley/surface detekce nad `stockWorldPoints` v roughingStrategies.
 * computeRegions. Detekuje „údolí" = lokální minima HORNÍ HRANY zadaných
 * smyček (max X na dané Z) s prominencí `minDrop` na OBOU stranách.
 *
 * Produkce jí předává SILUETU polotovaru (`[buildStockLoop(...)]`): signál
 * pro odlitkové hrby je horní hrana polotovaru, stejně jako u manuálu, takže
 * bez regrese pokrytí. POZOR: NEpředávat zbytek stock−dílec — jeho komponenty
 * mají i opačný směr splynutí (kapsa dílu: oddělena hluboko, splyne mělko),
 * který legacy model (zHiSurf/zLoSurf) neumí a nechal by stát materiál
 * (viz komentář u booleanRegionSplits). Testy funkci krmí i residuálem
 * (u něj se horní hrana rovná siluetě, když dílec nedosahuje k povrchu).
 *
 * Vrací splits `[{ z, xSurf }]` (z = střed dna údolí, xSurf = X dna) SEŘAZENÉ
 * shora (max Z) dolů — formát, který čeká `assembleRegions`. Sémantika legacy
 * modelu (odlitkový hrb): region oddělen MĚLCE (X > xSurf) a v kůře dna (X ≤
 * xSurf) splyne. Otevřená údolí bez protistěny (klesnou a už se nezvednou)
 * NEJSOU split — stejně jako manuál (vyžaduje `after > cur`).
 */
export function computeResidualRegions(residualLoops, zMax, zMin, dz = 0.2, minDrop = 0.3) {
  if (!residualLoops || residualLoops.length === 0) return [];
  if (!(zMax > zMin)) return [];
  // Hustý vzorek horní hrany zbytku shora (max Z) dolů; vzduch → x = 0.
  const samples = [];
  for (let z = zMax; z >= zMin - 1e-9; z -= dz) {
    samples.push({ z, x: residualTopXAtZ(residualLoops, z) ?? 0 });
  }
  const n = samples.length;
  if (n < 3) return [];

  const splits = [];
  let peak = samples[0].x;
  let i = 1;
  while (i < n) {
    const x = samples[i].x;
    if (x > peak) { peak = x; i++; continue; }
    if (x <= peak - minDrop) {
      // Sestup do údolí — najdi dno (min X) a čekej na zvednutí na
      // protistěnu (min + minDrop) = druhý bok. Bez zvednutí = otevřený
      // konec (žádný split).
      let minX = x, j = i;
      while (j < n) {
        const xj = samples[j].x;
        if (xj < minX) minX = xj;
        if (xj >= minX + minDrop) break;
        j++;
      }
      if (j >= n) break;                     // údolí doběhlo do konce → není split
      // Střed plochého dna (x ≤ minX + tolerance) jako Z splitu.
      let zSum = 0, cnt = 0;
      for (let k = i; k < j; k++) {
        if (samples[k].x <= minX + Math.max(0.15, minDrop / 2)) { zSum += samples[k].z; cnt++; }
      }
      const zc = cnt > 0 ? zSum / cnt : samples[i].z;
      splits.push({ z: zc, xSurf: minX });
      peak = samples[j].x;                    // reset na protistěnu
      i = j;
    } else {
      i++;
    }
  }
  splits.sort((a, b) => b.z - a.z);           // shora dolů (jako manuál)
  return splits;
}

/** Plocha zbytkového materiálu [mm²] (kladně) — pro testy/telemetrii. */
export function residualArea(residualLoops) {
  return Math.abs(polyArea(residualLoops));
}

/** Zjednodušení smyček pro kreslení/rychlost (ε default 0,005 mm). */
export function simplifyLoops(loops, eps = 0.005) {
  return polySimplify(loops, eps);
}
