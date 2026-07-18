// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – automatické mezní čáry hran destičky / držáku          ║
// ║  (computeInterferenceGuides + pomocníci, Fáze 3 migrace na    ║
// ║   Clipper2, viz docs/geometry-libs-migration.md)              ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Pro každou souvislou skupinu interferenčních segmentů kontury se spočítá
// „mezní čára" hrany destičky, která se regionu jen dotkne: dojezd = čelní
// hrana (natočení + ε), zanoření = spodní hrana (natočení). Od bodu dotyku
// se čára protáhne podél hrany destičky, případně se zlomí podél stěny
// držáku (buildHolderBoundaryPts) k dnu kapsy / polotovaru. Výstup je pole
// mezních čar { x1,z1, x2,z2, kind, via? } — buildMachinableContour z nich
// staví „obrobitelnou konturu" (nahrazuje nedosažitelné úseky mosty).
//
// Souřadnice: CAM svět {x = poloměr, z = axiálně} v mm, stejně jako
// contourSegments / worldPoints v camSimulator.js.
//
// ── STAV (aktuální) ────────────────────────────────────────────
// HOTOVO (Fáze 3): buildHolderBoundaryPts počítá hranici hlídání držáku
// z Clipper2 DOSAŽITELNÉ OBLASTI — plný obrys držáku (holderWorldLoop) přes
// zakázanou oblast špičky F = dílec ⊕ (−obrys držáku) (buildTipForbiddenRegion).
// Nahradilo to dřívější aproximaci „stěna − šířka W" svislým pásem. Rozšířeno
// i do generátoru drah (roughingStrategies.js: regiony + dokončování kapes).
//
// PLÁN: teď se pracuje na Fázi 5 (sjednocení UI zanořování — 3 checkboxy → 2),
// PAK se dodělá zbytek Fáze 3/4 — dynamický plánovač pořadí pro order-dependent
// kolize držáku (vjezd do kapsy / rampa plive do materiálu sousedního regionu
// obrobeného až později; statická obálka to principiálně nevidí). Detail viz
// docs/geometry-libs-migration.md a poznámka [[geom-libs-migration]] v paměti.

import {
  getArcParams,
  intersectLineCircle,
  getNormal,
  vecAngle,
  normalizeAngle,
  isAngleBetween,
  stockClearances,
  _locateOnContour,
} from './camMath.js';
import { holderWorldLoop } from './collisionValidator.js';
import { buildTipForbiddenRegion } from './toolEnvelope.js';
import { polyIntersect } from '../../geom/geomCore.js';

// Uzavřená smyčka z posloupnosti světových bodů (worldPoints/stock): řezné
// segmenty (G1/G2/G3) navzorkované, profil uzavřený k ose X=0 na obou koncích
// (G0 přejezdy se přeskočí — netvoří hranu materiálu). Null, když nedává smysl.
function worldPointsToLoop(pts) {
  if (!pts || pts.length < 3) return null;
  const loop = [];
  const pushP = (x, z) => {
    const l = loop[loop.length - 1];
    if (!l || Math.hypot(l.x - x, l.z - z) > 1e-6) loop.push({ x, z });
  };
  for (let i = 1; i < pts.length; i++) {
    const p1 = pts[i - 1], p2 = pts[i];
    if (p2.type === 'G1') {
      pushP(p1.xReal, p1.zReal); pushP(p2.xReal, p2.zReal);
    } else if (p2.type === 'G2' || p2.type === 'G3') {
      const arc = getArcParams({ x: p1.xReal, z: p1.zReal }, { x: p2.xReal, z: p2.zReal }, p2.rVal, p2.type);
      if (arc.error) continue;
      let sA = Math.atan2(p1.xReal - arc.cx, p1.zReal - arc.cz);
      let eA = Math.atan2(p2.xReal - arc.cx, p2.zReal - arc.cz);
      if (p2.type === 'G2' && eA > sA) eA -= 2 * Math.PI;
      if (p2.type === 'G3' && eA < sA) eA += 2 * Math.PI;
      for (let s = 0; s <= 12; s++) {
        const a = sA + (eA - sA) * (s / 12);
        pushP(arc.cx + Math.sin(a) * arc.r, arc.cz + Math.cos(a) * arc.r);
      }
    }
  }
  if (loop.length < 3) return null;
  if (Math.abs(loop[loop.length - 1].x) > 1e-6) pushP(0, loop[loop.length - 1].z);
  if (Math.abs(loop[0].x) > 1e-6) pushP(0, loop[0].z);
  return loop.length >= 3 ? loop : null;
}

// Hranice hlídání držáku od dotykového bodu `best` dolů (−X). V každé výšce x
// se drží MAX(hrana destičky, dosažitelná hranice držáku):
//   • hrana destičky = přímka pod natočením (sklon dle sb/cb),
//   • hranice držáku = LEVÝ (dosažitelný) okraj zakázané oblasti špičky F
//     (F = dílec ⊕ −obrys držáku, viz computeInterferenceGuides). Nahrazuje
//     dřívější aproximaci „stěna − šířka W" plným obrysem držáku (Clipper2).
// `forbidden` = pole smyček F, `reachX` = x-dosah držáku pod dotykem.
// Vrací lomené body hranice od dotyku dolů, nebo null (bez držáku / F).
function buildHolderBoundaryPts(best, sb, cb, forbidden, reachX) {
  if (!forbidden || forbidden.length === 0 || !(reachX > 0)) return null;
  // Průsečíky hran F s vodorovnou přímkou X=x (half-open pravidlo).
  const crossingsAt = (x) => {
    const zs = [];
    for (const loop of forbidden) {
      for (let i = 0; i < loop.length; i++) {
        const p = loop[i], q = loop[(i + 1) % loop.length];
        if ((p.x <= x) === (q.x <= x)) continue;
        zs.push(p.z + ((x - p.x) / (q.x - p.x)) * (q.z - p.z));
      }
    }
    return zs;
  };
  // Horní okraj F v x (nejvyšší vrchol). Držák sedí z0 ≈ (výška destičky)
  // NAD špičkou, takže F nedosahuje až ke špičce (dead zone best.x−z0…best.x).
  // Dotaz na F v této zóně clampneme na fTopX — držák se bere, jako by
  // dosahoval ke špičce (konzervativně, jako původní model „stěna − W").
  let fTopX = -Infinity;
  for (const loop of forbidden) for (const p of loop) if (p.x > fTopX) fTopX = p.x;
  // Hranice držáku ve výšce x = průsečík F na DOSAŽITELNÉ straně, nejblíž
  // referenci `ref` (spojitost okraje při klesajícím x). Špička klesá shora
  // → bere se okraj F ≤ ref (nejbližší menší z); tím se sleduje spodní hrana
  // bloku F (dosažitelná strana), ne jeho horní (materiálová) hrana — jinak
  // by se u úzké kapsy (bez dosažitelného pásu) čára protáhla vnitřkem F.
  // null = F tuto výšku neprotíná.
  const zHolderAt = (x, ref) => {
    const zs = crossingsAt(Math.min(x, fTopX - 1e-3));
    if (!zs.length) return null;
    const below = zs.filter(z => z <= ref + 0.05);
    const pool = below.length ? below : zs;
    let best2 = null, bestD = Infinity;
    for (const z of pool) { const d = Math.abs(z - ref); if (d < bestD) { bestD = d; best2 = z; } }
    return best2;
  };
  // Vzorkovací výšky: dotyk + vrcholy F v dosahu [best.x − reachX, best.x].
  const xsSet = new Set([best.x]);
  for (const loop of forbidden) for (const p of loop) {
    if (p.x <= best.x + 1e-9 && p.x >= best.x - reachX) xsSet.add(p.x);
  }
  const xs = [...xsSet]
    .filter(x => x <= best.x + 1e-9 && x >= best.x - reachX)
    .sort((a, b) => b - a);
  if (xs[xs.length - 1] > best.x - reachX + 1e-6) xs.push(best.x - reachX);
  // Hrana destičky jako z(x): svislá hrana (natočení 0°) = konst. best.z.
  const zEdgeAt = (x) => sb > 1e-9 ? best.z - (best.x - x) * (cb / sb) : best.z;
  const out = [{ x: best.x, z: best.z }];
  const push = (x, z) => {
    const prev = out[out.length - 1];
    z = Math.min(z, prev.z);               // hranice nesmí stoupat zpět doprava
    if (x > prev.x - 1e-9) { prev.z = Math.min(prev.z, z); return; }
    out.push({ x, z });
  };
  let prevX = best.x, prevE = best.z, prevH = zHolderAt(best.x, best.z);
  for (const x of xs) {
    if (x >= prevX - 1e-9) continue;
    const zE = zEdgeAt(x);
    const zH = zHolderAt(x, prevH !== null ? prevH : prevE);
    // Přepnutí větve max(hrana, hranice držáku) mezi vzorky → vložit přesný
    // průsečík (obě větve jsou mezi vzorky lineární).
    if (prevH !== null && zH !== null) {
      const d0 = prevE - prevH, d1 = zE - zH;
      if ((d0 > 0) !== (d1 > 0) && Math.abs(d0 - d1) > 1e-12) {
        const t = d0 / (d0 - d1);
        push(prevX + (x - prevX) * t, prevE + (zE - prevE) * t);
      }
    }
    push(x, zH === null ? zE : Math.max(zE, zH));
    prevX = x; prevE = zE; if (zH !== null) prevH = zH;
  }
  // Zjednodušit kolineární běhy, ať mostů/via bodů není zbytečně moc.
  for (let k = out.length - 2; k > 0; k--) {
    const a = out[k - 1], b = out[k], c = out[k + 1];
    const cr = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    const len = Math.hypot(c.x - a.x, c.z - a.z) || 1;
    if (Math.abs(cr) / len < 0.02) out.splice(k, 1);
  }
  return out.length >= 2 ? out : null;
}

// Body lomené mezní čáry od HORNÍHO konce (x2,z2) k DOLNÍMU (x1,z1) —
// g.via jsou mezilehlé vrcholy (lomení podle siluety držáku), uložené
// v pořadí od horního konce. Přímá čára (bez via) → jen dva body.
export function guidePolyPoints(g) {
  return (g && g.via && g.via.length)
    ? [{ x: g.x2, z: g.z2 }, ...g.via, { x: g.x1, z: g.z1 }]
    : [{ x: g.x2, z: g.z2 }, { x: g.x1, z: g.z1 }];
}
// Body mostu z mezní čáry g mezi dvěma jejími konci (from/to v libovolném
// pořadí) — mezi ně vloží via vrcholy ve správné orientaci.
export function guideBridgePts(g, fromPt, toPt) {
  if (!g || !g.via || !g.via.length) return [fromPt, toPt];
  const dUp = Math.hypot(fromPt.x - g.x2, fromPt.z - g.z2);
  const dDown = Math.hypot(fromPt.x - g.x1, fromPt.z - g.z1);
  const seq = dUp <= dDown ? g.via : [...g.via].reverse();
  return [fromPt, ...seq.map(q => ({ x: q.x, z: q.z })), toPt];
}
// Posloupnost bodů → mostové úsečky (fromInsert). Segmenty, které netvoří
// hrana destičky, ale stěna držáku (vše kromě segmentu u horního konce),
// dostanou fromHolder=true — dokončování je pak nepřeskakuje kvůli úhlovému
// rozsahu destičky (špička je po nich schopná sjet, držák kapsou projde).
export function mkBridgeSegs(pts, upFirst = true) {
  const out = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1];
    if (Math.hypot(b.x - a.x, b.z - a.z) < 1e-6) continue;
    const seg = { type: 'line', p1: { x: a.x, z: a.z }, p2: { x: b.x, z: b.z }, fromInsert: true };
    const isEdgeSeg = upFirst ? k === 0 : k === pts.length - 2;
    if (pts.length > 2 && !isEdgeSeg) seg.fromHolder = true;
    out.push(seg);
  }
  return out;
}

// Nejbližší průsečík paprsku (sx,sz)+t·(dirX,dirZ) se segmenty kontury a
// polotovaru (reálné souřadnice, X = rádius). exclude = {idx,isStock} segment
// k vynechání, nebo pole indexů do calc.worldPoints. calc nese worldPoints/
// stockWorldPoints. Vrací {x,z} | null. (Modulová verze — testovatelná.)
export function camRayIntersection(sx, sz, dirX, dirZ, exclude, calc) {
  if (!calc) return null;
  let best = null, bestT = Infinity;
  const excludeSet = Array.isArray(exclude) ? new Set(exclude) : null;
  const consider = (px, pz) => {
    const t = (px - sx) * dirX + (pz - sz) * dirZ;
    if (t > 0.01 && t < bestT) { bestT = t; best = { x: px, z: pz }; }
  };
  const far = { x: sx + dirX * 1e5, z: sz + dirZ * 1e5 };
  const A1 = { x: sx, z: sz };
  const scan = (pts, isStock) => {
    if (!pts) return;
    for (let i = 1; i < pts.length; i++) {
      if (excludeSet) { if (!isStock && excludeSet.has(i)) continue; }
      else if (exclude && exclude.isStock === isStock && exclude.idx === i) continue;
      const p2 = pts[i], p1 = pts[i - 1];
      if (p2.type === 'G1') {
        const B1 = { x: p1.xReal, z: p1.zReal }, B2 = { x: p2.xReal, z: p2.zReal };
        const d = (A1.x - far.x) * (B1.z - B2.z) - (A1.z - far.z) * (B1.x - B2.x);
        if (Math.abs(d) < 1e-12) continue;
        const t = ((A1.x - B1.x) * (B1.z - B2.z) - (A1.z - B1.z) * (B1.x - B2.x)) / d;
        const u = ((A1.x - B1.x) * (A1.z - far.z) - (A1.z - B1.z) * (A1.x - far.x)) / d;
        if (u < -0.001 || u > 1.001) continue;
        consider(A1.x + t * (far.x - A1.x), A1.z + t * (far.z - A1.z));
      } else if (p2.type === 'G2' || p2.type === 'G3') {
        const arc = getArcParams({ x: p1.xReal, z: p1.zReal }, { x: p2.xReal, z: p2.zReal }, p2.rVal, p2.type);
        if (arc.error) continue;
        const hits = intersectLineCircle(A1, far, { x: arc.cx, z: arc.cz }, arc.r);
        if (!hits) continue;
        const sA = Math.atan2(p1.xReal - arc.cx, p1.zReal - arc.cz);
        const eA = Math.atan2(p2.xReal - arc.cx, p2.zReal - arc.cz);
        for (const q of hits) {
          const ang = Math.atan2(q.x - arc.cx, q.z - arc.cz);
          if (isAngleBetween(ang, sA, eA, p2.type === 'G2')) consider(q.x, q.z);
        }
      }
    }
  };
  scan(calc.worldPoints, false);
  scan(calc.stockWorldPoints, true);
  return best;
}

// ── Automatické mezní čáry hran destičky („kontura hotová") ──
// Pro každou souvislou skupinu interferenčních segmentů se spočítá přímka
// hrany destičky, která se regionu jen dotkne: dojezd = čelní hrana
// (natočení + ε), zanoření = spodní hrana (natočení). Od bodu dotyku se
// protáhne podél hrany k průsečíkům s konturou. Modulová, testovatelná
// funkce — vrací pole {x1,z1,x2,z2,kind}.
export function computeInterferenceGuides(interferenceSegments, rawContourForInterference, clearance, prms, worldPoints, stockWorldPoints) {
  const interferenceGuides = [];
  if (!clearance || !interferenceSegments || interferenceSegments.length === 0) return interferenceGuides;

  const rotDegG = parseFloat(prms.toolAngle) || 0;
  const tipDegG = parseFloat(prms.toolTipAngle) || 90;
  const stockTopXG = (prms.stockMode === 'casting' && stockWorldPoints.length > 0)
    ? Math.max(...stockWorldPoints.map(p => p.xReal))
    : (parseFloat(prms.stockDiameter) || 100) / 2;
  // Nejnižší Z dílce (kontury) — pod něj se mezní čára netáhne (zadní čelo
  // polotovaru není řezná plocha).
  const minPartZG = worldPoints.length > 0 ? Math.min(...worldPoints.map(p => p.zReal)) : -1e9;
  // skupiny po sobě jdoucích interferenčních segmentů (pořadí kontury)
  const idxOf = new Map();
  rawContourForInterference.forEach((s, i) => idxOf.set(s, i));
  const sorted = [...interferenceSegments].sort((a, b) => idxOf.get(a) - idxOf.get(b));
  const groups = [];
  let curGrp = null, lastIdx = -10;
  for (const s of sorted) {
    const i = idxOf.get(s);
    if (!curGrp || i !== lastIdx + 1) { curGrp = []; groups.push(curGrp); }
    curGrp.push(s); lastIdx = i;
  }
  const sampleSeg = (seg) => {
    if (seg.type === 'line') return [seg.p1, seg.p2];
    const out = [];
    let sA = Math.atan2(seg.p1.x - seg.cx, seg.p1.z - seg.cz);
    let eA = Math.atan2(seg.p2.x - seg.cx, seg.p2.z - seg.cz);
    if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
    if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
    for (let s = 0; s <= 12; s++) {
      const a = sA + (eA - sA) * (s / 12);
      out.push({ x: seg.cx + Math.sin(a) * seg.r, z: seg.cz + Math.cos(a) * seg.r });
    }
    return out;
  };
  // Strana porušení rozsahu: low = normála pod rozsahem (čelní hrana,
  // dojezd), high = nad rozsahem (spodní hrana, zanoření).
  const isOuterArc = (seg) => Math.abs(seg.cx) < Math.abs((seg.p1.x + seg.p2.x) / 2);
  const devAtAngle = (seg, a) => normalizeAngle((isOuterArc(seg) ? a : a + Math.PI) - clearance.bisector);
  // Body segmentu, které SAMY (svou vlastní normálou) porušují danou
  // stranu rozsahu — u oblouku jen ta část, kde k interferenci skutečně
  // dochází, ne celý (třeba jen částečně postižený) oblouk.
  const violatingPts = (seg, wantLow) => {
    const bad = (dev) => wantLow ? dev < -clearance.halfRange - 1e-6 : dev > clearance.halfRange + 1e-6;
    if (seg.type === 'line') {
      const n = getNormal(seg.p1, seg.p2);
      if (n.x === 0 && n.z === 0) return [];
      return bad(normalizeAngle(vecAngle(n.x, n.z) - clearance.bisector)) ? [seg.p1, seg.p2] : [];
    }
    return sampleSeg(seg).filter(q => {
      const a = Math.atan2(q.x - seg.cx, q.z - seg.cz);
      return bad(devAtAngle(seg, a));
    });
  };
  const sideOf = (seg) => ({
    low: violatingPts(seg, true).length > 0,
    high: violatingPts(seg, false).length > 0,
  });
  // ── Ořez mezních čar polotovarem (odlitek) ─────────────────────
  // Mezní čára má smysl jen v MATERIÁLU: jakmile silueta nástroje vyjde
  // z kůry odlitku do vzduchu (údolí mezi výstupky), čára končí na
  // hranici polotovaru + vůle X. Bez ořezu by se táhla vzduchem přes
  // údolí, mergePocketGuides by ji spároval s protější stěnou a most by
  // z ní udělal falešnou konturu (hrubování by „obrábělo" vzduch).
  const stockLoopG2 = (() => {
    if (prms.stockMode !== 'casting' || !stockWorldPoints || stockWorldPoints.length < 3) return null;
    const pts = [];
    const pushP = (x, z) => {
      const l = pts[pts.length - 1];
      if (!l || Math.hypot(l.x - x, l.z - z) > 1e-6) pts.push({ x, z });
    };
    for (let i = 1; i < stockWorldPoints.length; i++) {
      const p1 = stockWorldPoints[i - 1], p2 = stockWorldPoints[i];
      if (p2.type === 'G1') {
        pushP(p1.xReal, p1.zReal); pushP(p2.xReal, p2.zReal);
      } else if (p2.type === 'G2' || p2.type === 'G3') {
        const arc = getArcParams({ x: p1.xReal, z: p1.zReal }, { x: p2.xReal, z: p2.zReal }, p2.rVal, p2.type);
        if (arc.error) continue;
        let sA = Math.atan2(p1.xReal - arc.cx, p1.zReal - arc.cz);
        let eA = Math.atan2(p2.xReal - arc.cx, p2.zReal - arc.cz);
        if (p2.type === 'G2' && eA > sA) eA -= 2 * Math.PI;
        if (p2.type === 'G3' && eA < sA) eA += 2 * Math.PI;
        for (let s = 0; s <= 12; s++) {
          const a = sA + (eA - sA) * (s / 12);
          pushP(arc.cx + Math.sin(a) * arc.r, arc.cz + Math.cos(a) * arc.r);
        }
      }
    }
    if (pts.length < 3) return null;
    if (Math.abs(pts[pts.length - 1].x) > 1e-6) pushP(0, pts[pts.length - 1].z);
    if (Math.abs(pts[0].x) > 1e-6) pushP(0, pts[0].z);
    return pts;
  })();
  const insideStockG = (x, z) => {
    if (!stockLoopG2) return true;
    let parity = 0;
    for (let i = 0; i < stockLoopG2.length; i++) {
      const p = stockLoopG2[i], q = stockLoopG2[(i + 1) % stockLoopG2.length];
      if ((p.x <= x) === (q.x <= x)) continue;
      const zc = p.z + ((x - p.x) / (q.x - p.x)) * (q.z - p.z);
      if (zc > z) parity ^= 1;
    }
    return parity === 1;
  };
  const clrExitG = stockClearances(prms).x;
  // ── Zakázaná oblast špičky F pro hranici hlídání držáku (Fáze 3) ──
  // F = obrys dílce (silueta kontury, u odlitku ∩ polotovar) ⊕ (−obrys
  // držáku). Špička uvnitř F ⇔ držák naráží do materiálu. Hranice hlídání
  // (buildHolderBoundaryPts) sleduje LEVÝ (dosažitelný) okraj F místo
  // dřívější aproximace „stěna − šířka W". Plný obrys držáku (holderWorldLoop,
  // backside:false — konzistentně s makeHolderClamp). Spočte se JEDNOU.
  let holderForbidden = null, holderReachX = 0;
  const holderLoopG = holderWorldLoop(prms, false);
  const contourLoopG = worldPointsToLoop(worldPoints);
  if (holderLoopG && contourLoopG) {
    let obstacle = [contourLoopG];
    if (stockLoopG2 && stockLoopG2.length >= 3) {
      const clipped = polyIntersect([contourLoopG], [stockLoopG2]);
      if (clipped.length > 0) obstacle = clipped;
    }
    holderForbidden = buildTipForbiddenRegion(obstacle, holderLoopG);
    holderReachX = Math.max(...holderLoopG.map(p => p.x));
  }
  // Výstup siluety z materiálu podél úseku a+t·(ux,uz), t∈(0, tMax]:
  // pochod po 0,5 mm + bisekce. k===0 = kotva na kontuře (v materiálu).
  const stockExitOnSeg = (a, ux, uz, tMax, isFirst) => {
    if (!stockLoopG2 || tMax < 0.05) return null;
    let prevT = 0;
    let prevIn = isFirst ? true : insideStockG(a.x, a.z);
    if (!prevIn) return 0;
    const step = 0.5;
    for (let t = step; ; t += step) {
      const tt = Math.min(t, tMax);
      const inNow = insideStockG(a.x + ux * tt, a.z + uz * tt);
      if (prevIn && !inNow) {
        let lo = prevT, hi = tt;
        for (let i = 0; i < 12; i++) {
          const m = (lo + hi) / 2;
          if (insideStockG(a.x + ux * m, a.z + uz * m)) lo = m; else hi = m;
        }
        return hi;
      }
      prevT = tt; prevIn = inNow;
      if (tt >= tMax) return null;
    }
  };

  // Průsečíky mezních čar hledáme JEN na kontuře — obrys polotovaru
  // není obráběný povrch (čára by se jinak táhla třeba až k ose X0).
  const localCalc = { worldPoints, stockWorldPoints: [] };
  // Pro DOLNÍ (nájezdový) konec mezní čáry hledáme průsečík s konturou
  // I s polotovarem — čára se prodlouží až o skutečnou hranu materiálu.
  const localCalcDown = { worldPoints, stockWorldPoints };
  for (const grp of groups) {
    // Body se sbírají odděleně pro dojezd (low) a zanoření (high) —
    // pokud skupina porušuje rozsah na obě strany různými segmenty,
    // body z "druhé" hrany by mohly přebít dotykový bod téhle hrany.
    const lowPts = [], highPts = [];
    let low = false, high = false;
    grp.forEach(s => {
      const sd = sideOf(s);
      if (sd.low) { low = true; lowPts.push(...violatingPts(s, true)); }
      if (sd.high) { high = true; highPts.push(...violatingPts(s, false)); }
    });
    // Při ray-castu vynechat segmenty téhle skupiny — dotykový bod
    // může ležet na oblouku skupiny a paprsek by jinak mohl narazit
    // zpět na stejný oblouk místo na navazující konturu.
    // Pozor: idxOf vrací index v rawContourForInterference (= contourSegments),
    // ale camRayIntersection prochází worldPoints (jiná indexace, G0 body navíc).
    // Správné vyloučení: použít s.orig, které odkazuje přímo na worldPoints[k].
    const excludeIdx = grp.map(s => {
      // origIdx je číselný index p2 ve worldPoints — přežije structuredClone
      // (rawContourForInterference je hluboká kopie, takže `orig` reference je
      // jiný objekt a worldPoints.indexOf(s.orig) vrací −1 → padalo to na
      // chybný fallback idxOf+1, který nepočítá s G0 body navíc → vyloučil se
      // CIZÍ segment a paprsek pak přeletěl přes blokující vrchol).
      if (Number.isInteger(s.origIdx)) return s.origIdx;
      if (s.orig) {
        const idx = worldPoints.indexOf(s.orig);
        if (idx >= 0) return idx;
      }
      return idxOf.get(s) + 1; // fallback pro mostové segmenty bez orig
    });
    const addGuide = (betaDeg, kind, pts) => {
      const b = betaDeg * Math.PI / 180;
      const sb = Math.sin(b), cb = Math.cos(b);
      // Normála čáry na stranu vzduchu (+X nahoru). Dotyk = bod regionu
      // nejdál ve směru této normály — u dojezdu tečna/roh na pravé
      // straně regionu, u zanoření horní hrana (rim) kapsy.
      let nx = -cb, nz = sb;
      if (nx < 0 || (Math.abs(nx) < 1e-9 && nz < 0)) { nx = -nx; nz = -nz; }
      let best = null, bestG = -Infinity;
      let topX = -Infinity, botX = Infinity;
      pts.forEach(q => {
        const g = q.x * nx + q.z * nz;
        if (g > bestG) { bestG = g; best = q; }
        if (q.x > topX) topX = q.x;
        if (q.x < botX) botX = q.x;
      });
      // Přesný tečný bod oblouku (maximum projekce po celé kružnici) —
      // pokud padne do úhlového rozsahu tohoto oblouku, je to přesnější
      // dotykový bod než vzorkované body (tečna na zakřivené kontuře).
      grp.forEach(s => {
        if (s.type !== 'arc') return;
        const sd = sideOf(s);
        if ((kind === 'dojezd' && !sd.low) || (kind === 'zanoreni' && !sd.high)) return;
        const tx = s.cx + s.r * nx, tz = s.cz + s.r * nz;
        const ang = Math.atan2(tx - s.cx, tz - s.cz);
        const dev = devAtAngle(s, ang);
        const violates = kind === 'dojezd' ? dev < -clearance.halfRange - 1e-6 : dev > clearance.halfRange + 1e-6;
        const within = violates && isAngleBetween(ang, s.startAngle, s.endAngle, s.dir === 'G2');
        if (within) {
          const g = tx * nx + tz * nz;
          if (g > bestG) { bestG = g; best = { x: tx, z: tz }; }
          if (tx > topX) topX = tx;
          if (tx < botX) botX = tx;
        }
      });
      if (!best) return;
      // Dolní konec: PRIMÁRNĚ průsečík s KONTUROU. Mezní čára by měla končit
      // na kontuře, aby ji buildMachinableContour přemostil. Když ale pod
      // dotykem žádná kontura není (typicky u kraje dílu, kde za polotovarem
      // už nic není), skončí čára na hraně POLOTOVARU — a označí se
      // downOnStock, aby se BRALA jen jako VIZUALIZACE (nepřemosťuje konturu,
      // takže se dráhy nemění, ale uživatel čáru vidí až k hraně materiálu).
      // NEvynecháváme segmenty skupiny — nájezdový tečný bod často leží právě
      // na nich (boční oblouček u nájezdu), takže s exclude paprsek konturu mine.
      // Dolní konec: sleduje se ODRAŽENÁ SILUETA nástroje ukotvená v dotykovém
      // bodě (P_k = best − S_k): nejdřív hrana destičky (jen do Délky hrany,
      // je-li zadán držák), pak přechod na roh držáku a svisle dolů podél jeho
      // stěny. Bez držáku (profil null) zůstává jediný nekonečný paprsek podél
      // hrany — původní chování. První průsečík segmentů s konturou = dolní
      // konec mezní čáry; projité lomové vrcholy se uloží do `via` (mezní čára
      // je pak lomená a most po ní smí sjet hlouběji do kapsy).
      // Hranice hlídání = hrana destičky → čára „zbývající stěna/kůra
      // polotovaru posunutá o holderWidth" (buildHolderBoundaryPts, dle
      // nákresu). Platí pro obě strany (zanoření i dojezd) — v kapse drží
      // dno obrobitelné z obou stěn. Bez držáku (nebo bez stěny/polotovaru
      // k opření) = nekonečná přímka podél hrany (staré chování).
      const boundaryPts = buildHolderBoundaryPts(best, sb, cb, holderForbidden, holderReachX);
      const straightPts = [{ x: best.x, z: best.z }, { x: best.x - sb * 1e5, z: best.z - cb * 1e5 }];
      const walkSilhouette = (calcLoc, ptsOverride) => {
        const pts = ptsOverride || boundaryPts || straightPts;
        const via = [];
        for (let k = 0; k + 1 < pts.length; k++) {
          const a = pts[k], b2 = pts[k + 1];
          const dx = b2.x - a.x, dz = b2.z - a.z;
          const len = Math.hypot(dx, dz);
          if (len < 1e-6) continue;
          const ux = dx / len, uz = dz / len;
          let hit = camRayIntersection(a.x, a.z, ux, uz, null, calcLoc);
          let tHit = null;
          if (hit) {
            const t = (hit.x - a.x) * ux + (hit.z - a.z) * uz;
            if (t <= len + 1e-6) tHit = t; else hit = null;
          }
          // Ořez polotovarem (odlitek): když silueta vyjde z materiálu DŘÍV,
          // než dopadne na konturu, čára končí na hranici polotovaru + vůle
          // X — dál je vzduch (údolí), tam se nehlídá ani nemostí.
          // VÝJIMKA: výstup přes OSU (x≈0) nebo ZADNÍ čelo (z < konec dílce)
          // — to jsou uzavírací hrany smyčky, ne kůra; nechat staré chování
          // (dopad na osu → rejected, zadní čelo → ořez na konec dílce).
          let tExit = stockExitOnSeg(a, ux, uz, tHit !== null ? tHit : len, k === 0);
          if (tExit !== null) {
            const ex = { x: a.x + ux * tExit, z: a.z + uz * tExit };
            if (ex.x < 0.5 || ex.z < minPartZG - 0.5) tExit = null;
          }
          if (tExit !== null && (tHit === null || tExit < tHit - 1e-6)) {
            const tEnd = tExit + clrExitG;
            return { down: { x: a.x + ux * tEnd, z: a.z + uz * tEnd }, via, clipped: true };
          }
          if (hit) {
            // Odlitkový polotovar má jako uzavírací hrany i OSU (X=0) a ZADNÍ
            // čelo (z < min Z kontury), což nejsou řezné plochy. Dopad na osu
            // zahodit (ukončí hledání — níž už je jen osa); dopad pod konec
            // dílce oříznout přesně na konec dílce po směru segmentu.
            // VÝJIMKA: dotykový bod SÁM na konci dílce (levé/zadní čelo) —
            // viz komentář u downOnStock níže; tam se neořezává.
            if (Math.abs(hit.x) < 0.1 && best.x > 0.5) return { rejected: true };
            if (hit.z < minPartZG - 0.5 && best.z > minPartZG + 0.5) {
              const tz = uz < -0.01 ? (a.z - minPartZG) / -uz : -1;
              hit = (tz > 0.01 && tz <= len) ? { x: a.x + ux * tz, z: minPartZG } : { x: a.x, z: a.z };
            }
            return { down: hit, via };
          }
          via.push({ x: b2.x, z: b2.z });
        }
        return null;
      };
      // Mezní čára by měla končit na KONTUŘE; když pod dotykem žádná kontura
      // není (typicky u kraje dílu), skončí na hraně POLOTOVARU a označí se
      // downOnStock (jen vizualizace / čelní zakončení — viz buildMachinable).
      let downOnStock = false;
      // Odlitek: má-li PŘÍMÁ hrana destičky (čistý úhel zanoření) vyjít
      // z polotovaru do vzduchu (údolí / stranou přes kůru) DŘÍV, než by ji
      // držáková stěna zlomila dolů, drží se stock-ořez přímé čáry. V
      // otevřeném prostoru za nástrojem není materiál, na který by držák
      // narazil — lomení k držákové stěně by tam čáru falešně stáhlo dolů
      // (viz projekt casting: bez tohoto by mezní čára místo pokračování
      // v úhlu zanoření sjela svisle dolů podél odebírané kůry).
      let walk = null;
      if (boundaryPts) {
        const straightClip = walkSilhouette(localCalc, straightPts);
        if (straightClip && straightClip.clipped) walk = straightClip;
      }
      if (!walk) walk = walkSilhouette(localCalc);
      if (!walk) {
        // Bez JAKÉHOKOLI dopadu na konturu zkusit i hranu polotovaru.
        // (Dopad zahozený osní pojistkou — rejected — fázi s polotovarem
        // nespouští, stejně jako původní přímá varianta.)
        walk = walkSilhouette(localCalcDown);
        if (walk && walk.down) downOnStock = true;
      }
      let down = (walk && walk.down) ? walk.down : null;
      let via = (walk && walk.down) ? walk.via : [];
      const downClipped = !!(walk && walk.clipped);
      if (!down) {
        via = [];
        const t = sb > 0.01 ? (best.x - botX) / sb : 0;
        down = t > 0.01 ? { x: best.x - sb * t, z: best.z - cb * t } : best;
      }
      // Horní konec: průsečík s konturou; bez něj skončit u vršku
      // regionu (NEprotahovat k hornímu okraji polotovaru).
      let up = camRayIntersection(best.x, best.z, sb, cb, excludeIdx, localCalc);
      // Dopad DALEKO od kotevní skupiny (paprsek přeletěl vzduchem přes jinou
      // část dílu — např. z levého čela až na protější čelo) = falešný horní
      // konec: čára by se táhla napříč dílem, stínová dominance by zabila
      // jiné čáry a most by odřízl půlku kontury. Přijmout jen dopad na
      // segmentu v sousedství skupiny (±3 v pořadí kontury).
      if (up) {
        const upLoc = _locateOnContour(rawContourForInterference, up);
        const nearGrp = upLoc && grp.some(s => Math.abs(idxOf.get(s) - upLoc.segIdx) <= 3);
        if (!nearGrp) up = null;
      }
      if (!up) {
        let capX = Math.min(topX, stockTopXG);
        // Čára z nižší skupiny (menší X) nesmí přesáhnout "dolní konec" (x1)
        // čáry z dřívější (vyšší) skupiny stejného druhu — jinak by nižší bod
        // generoval čáru, která na obrazovce vypadá výš než vyšší bod (bug).
        for (const pg of interferenceGuides) {
          // U lomené čáry (držák) je „dolní konec hrany destičky" první via
          // vrchol — hlubší (svislá) část stínu jiné čáry neomezuje.
          const pgLowX = (pg.via && pg.via.length) ? pg.via[0].x : pg.x1;
          if (pg.kind === kind && pgLowX < capX) capX = pgLowX;
        }
        const t = sb > 0.01 ? (capX - best.x) / sb : 0;
        up = t > 0.01 ? { x: best.x + sb * t, z: best.z + cb * t } : best;
      }
      if (!via.length && Math.hypot(up.x - down.x, up.z - down.z) < 0.5) return;
      const dup = interferenceGuides.some(g =>
        Math.hypot(g.x1 - down.x, g.z1 - down.z) < 0.5 && Math.hypot(g.x2 - up.x, g.z2 - up.z) < 0.5);
      if (!dup) {
        const g = { x1: down.x, z1: down.z, x2: up.x, z2: up.z, kind, downOnStock };
        // Dolní konec oříznutý polotovarem (výstup do vzduchu v údolí) —
        // drží se v seznamu i bez dopadu na konturu (vizualizace + most
        // „náběhový stín" zakončí konturu podél čáry a zbytek nechá).
        if (downClipped) g.downClipped = true;
        // Lomová místa siluety (konec hrany destičky, roh držáku) — jen ta
        // NAD dolním koncem; poslední vrchol shodný s dolním koncem vynechat.
        if (via.length) g.via = via.filter(q => Math.hypot(q.x - down.x, q.z - down.z) > 0.05 && q.x > down.x - 1e-6);
        if (g.via && !g.via.length) delete g.via;
        interferenceGuides.push(g);
      }
    };
    if (low) addGuide(rotDegG + tipDegG, 'dojezd', lowPts);
    if (high) addGuide(rotDegG, 'zanoreni', highPts);
  }
  return interferenceGuides;
}
