// ╔══════════════════════════════════════════════════════════════╗
// ║  geomCore – jednotný adaptér nad geometrickými knihovnami     ║
// ║  (Clipper2 = booleovské operace/offsety, Turf = analýza,      ║
// ║   Detect-Collisions = rychlý broad-phase filtr kolizí)        ║
// ╚══════════════════════════════════════════════════════════════╝
//
// PROČ ADAPTÉR: CAM kód (camSimulator.js) nikdy nevolá knihovny přímo —
// všechno jde přes tento modul. Knihovny tak lze vyměnit/aktualizovat na
// jednom místě a CAM pracuje jen s vlastní konvencí bodů {x, z} v mm.
//
// KONVENCE SOUŘADNIC: CAM bod {x, z} (x = radiálně, z = axiálně) se mapuje
// na Clipper {x: z, y: x} — tj. Z vodorovně, X svisle, stejně jako na plátně
// simulátoru. POZOR: Clipper2 body mají VLASTNÍ pole `z` (uživatelská data
// pro Z-callback) — proto se CAM `z` NIKDY nesmí poslat do Clipperu přímo.
//
// PŘESNOST: všechny D-varianty Clipper2 běží s precision = 4
// (zaokrouhlení na 0,1 µm) — víc než dost pod výrobní tolerance.

import {
  unionD,
  differenceD,
  intersectD,
  inflatePathsD,
  areaD,
  pointInPolygonD,
  simplifyPathsD,
  minkowskiSumD,
  FillRule,
  JoinType,
  EndType,
  PointInPolygonResult,
} from '../../lib/clipper2.min.js';

/** Přesnost D-operací Clipper2 (počet desetinných míst). */
const PRECISION = 4;

// ── Konverze bodů ────────────────────────────────────────────────

/** CAM smyčka [{x,z}, …] → Clipper PathD [{x,y}, …]. */
export function toClipperLoop(pts) {
  return pts.map(p => ({ x: p.z, y: p.x }));
}

/** Clipper PathD → CAM smyčka [{x,z}, …]. */
export function fromClipperLoop(path) {
  return path.map(p => ({ x: p.y, z: p.x }));
}

function toClipperLoops(loops) { return loops.map(toClipperLoop); }
function fromClipperLoops(paths) { return paths.map(fromClipperLoop); }

// ── Booleovské operace (vstup i výstup: pole CAM smyček) ────────

/** Sjednocení množin polygonů A ∪ B. */
export function polyUnion(loopsA, loopsB = []) {
  return fromClipperLoops(
    unionD(toClipperLoops(loopsA), toClipperLoops(loopsB), FillRule.NonZero, PRECISION)
  );
}

/** Rozdíl A − B (např. polotovar − projetá dráha nástroje). */
export function polyDifference(subjectLoops, clipLoops) {
  return fromClipperLoops(
    differenceD(toClipperLoops(subjectLoops), toClipperLoops(clipLoops), FillRule.NonZero, PRECISION)
  );
}

/** Průnik A ∩ B (např. držák × zbývající polotovar = kolize). */
export function polyIntersect(loopsA, loopsB) {
  return fromClipperLoops(
    intersectD(toClipperLoops(loopsA), toClipperLoops(loopsB), FillRule.NonZero, PRECISION)
  );
}

/**
 * Odsazení (offset) polygonů o `delta` mm (kladné = ven, záporné = dovnitř).
 * `join`: 'round' (výchozí — správně pro rádius špičky), 'miter', 'square'.
 */
export function polyOffset(loops, delta, join = 'round') {
  const jt = join === 'miter' ? JoinType.Miter
    : join === 'square' ? JoinType.Square
    : JoinType.Round;
  return fromClipperLoops(
    inflatePathsD(toClipperLoops(loops), delta, jt, EndType.Polygon, 2, PRECISION)
  );
}

/** Součet ploch smyček se znaménkem (díry záporně) [mm²]. */
export function polyArea(loops) {
  return loops.reduce((sum, l) => sum + areaD(toClipperLoop(l)), 0);
}

/** Poloha bodu vůči JEDNÉ smyčce: 'inside' | 'outside' | 'on'. */
export function pointInLoop(pt, loop) {
  // Clipper na nekořenné souřadnici (NaN, nekonečno, řády 10^18) vyhodí RangeError
  // a shodí celý `calculate()`. Uživateli pak zůstane v panelu STARÝ program BEZ
  // jakékoli chyby — vypadá to, že přepnutí nefunguje. Reálný nález
  // 20. 8. 2026: UPICHOVÁK má zanoření 90 stupňů (`getEffectivePlungeAngle`),
  // `tan 90` je 1,6e16 a rampové marchování (`stockEntryRamp`,
  // `findRampOutTarget`) tím NÁSOBÍ — přepnutí na PODÉLNÉ hrubování
  // s upichovákem tak spadlo. Mimo rozumný rozsah je odpověď mimo smyčku (tam
  // žádný polotovar není), takže půlení v těch funkcích dojde k degenerované,
  // ale správné SVISLÉ rampě.
  if (!Number.isFinite(pt.x) || !Number.isFinite(pt.z)
    || Math.abs(pt.x) > 1e6 || Math.abs(pt.z) > 1e6) return 'outside';
  const r = pointInPolygonD({ x: pt.z, y: pt.x }, toClipperLoop(loop));
  if (r === PointInPolygonResult.IsInside) return 'inside';
  if (r === PointInPolygonResult.IsOn) return 'on';
  return 'outside';
}

/** Zjednodušení smyček (Douglas–Peucker přes Clipper), eps v mm. */
export function polySimplify(loops, eps = 0.005) {
  return fromClipperLoops(simplifyPathsD(toClipperLoops(loops), eps, true));
}

/**
 * Stopa nástroje po dráze (Minkowského suma): `toolLoop` = obrys nástroje
 * (destička/držák) RELATIVNĚ ke špičce, `pathPts` = body dráhy špičky.
 * Vrátí smyčky pokrývající vše, čím nástroj po dráze projel — přesně to,
 * co se odečítá od polotovaru (vizuální odebírání materiálu) nebo protíná
 * s polotovarem (kontrola kolize držáku po celé dráze, ne jen v bodech).
 *
 * `minkowskiSumD` s otevřenou dráhou vydá jen stopu HRANICE obrysu, ne
 * zametené TĚLESO — chybí mu člen `A + b₀` (tentýž, jaký o kus níž
 * přidává `minkowskiSolidSum`). Na dlouhém úseku to není vidět, protože
 * hranice cestou projde celým vnitřkem; na KRÁTKÉM kroku ale zůstane
 * uprostřed neodebraný ostrůvek. Změřeno 24. 8. 2026: obrys 17,0 mm² a krok
 * 0,2 mm → zameteno 4,3 mm², tedy MÍŇ než obrys sám; těleso destičky
 * 194,5 mm² a týž krok → 5,7 mm² ve čtyřech kusech. Takový ostrůvek pak
 * v modelu vypadá jako materiál a držák se do něj „vnoří" (na
 * `part-11-zleva-casting` to dělalo 6,8 mm² oranžové z čisté nuly).
 *
 * Doplňuje se obrys posazený na OBA konce úseku. Uvnitř úseku je stopa
 * hranice úplná už dnes, takže víc čepiček není potřeba. Orientace se
 * srovnává na kladnou ze stejného důvodu jako v `minkowskiSolidSum`:
 * `NonZero` by opačně orientovaný překryv vyrušil a udělal z něj díru.
 */
export function toolSweep(toolLoop, pathPts) {
  const swept = minkowskiSumD(toClipperLoop(toolLoop), toClipperLoop(pathPts), false)
    .map(path => (areaD(path) < 0 ? path.slice().reverse() : path));
  const caps = [];
  for (const c of [pathPts[0], pathPts[pathPts.length - 1]]) {
    if (!c) continue;
    const cap = toClipperLoop(toolLoop.map(p => ({ x: p.x + c.x, z: p.z + c.z })));
    caps.push(areaD(cap) < 0 ? cap.slice().reverse() : cap);
  }
  return fromClipperLoops(unionD([...swept, ...caps], [], FillRule.NonZero, PRECISION));
}

/**
 * Minkowského suma dvou VYPLNĚNÝCH polygonů A ⊕ B (oba uzavřené smyčky).
 * Standardní konstrukce pro souvislé B: (∂A ⊕ B) ∪ (A + b₀) — okrajová
 * stopa B podél hranice A sjednocená s jedním posunutým A. Použití:
 * zakázaná oblast špičky nástroje = překážka ⊕ (−obrys nástroje).
 */
export function minkowskiSolidSum(loopA, loopB) {
  const sweep = minkowskiSumD(toClipperLoop(loopB), toClipperLoop(loopA), true);
  // Smyčky z minkowskiSumD mají smíšené orientace — NonZero union by
  // opačně orientované překryvy vyrušil (díry uvnitř oblasti). Sjednotit
  // všechny na kladnou plochu = skutečné množinové sjednocení.
  const oriented = sweep.map(path => areaD(path) < 0 ? path.slice().reverse() : path);
  const b0 = loopB[0];
  const shiftedA = toClipperLoop(loopA.map(p => ({ x: p.x + b0.x, z: p.z + b0.z })));
  const shiftedAOriented = areaD(shiftedA) < 0 ? shiftedA.slice().reverse() : shiftedA;
  return fromClipperLoops(unionD([...oriented, shiftedAOriented], [], FillRule.NonZero, PRECISION));
}

// ── Model polotovaru (vizuální odebírání materiálu) ─────────────

/**
 * Polotovar jako množina polygonů, od které se postupně odečítají
 * projeté dráhy. Použití v simulátoru:
 *   const stock = new StockModel([stockLoop]);
 *   stock.cut(toolSweep(insertLoop, passPts));   // po každém průchodu
 *   stock.loops → vykreslit vybarvením (fill) místo původního polotovaru
 */
export class StockModel {
  constructor(loops) {
    this.loops = loops.map(l => l.map(p => ({ x: p.x, z: p.z })));
  }
  /** Odebere materiál (rozdíl). Vrací this pro řetězení. */
  cut(loops) {
    this.loops = polyDifference(this.loops, loops);
    return this;
  }
  /** Průnik s cizí geometrií (kolize) — vrací smyčky průniku ([] = bez kolize). */
  collide(loops) {
    return polyIntersect(this.loops, loops);
  }
  /** Zbývající plocha materiálu [mm²]. */
  area() {
    return polyArea(this.loops);
  }
  isEmpty() {
    return this.loops.length === 0 || Math.abs(this.area()) < 1e-9;
  }
  clone() {
    return new StockModel(this.loops);
  }
}

// ── Turf.js (lazy — načítá se až při prvním použití v CAM) ──────

let _turf = null;

/**
 * Zajistí načtení Turf.js (UMD bundle → globalThis.turf). Volat na začátku
 * openCamSimulator(); do té doby se ~540 kB knihovny vůbec nenačítá.
 */
export async function ensureTurf() {
  if (_turf) return _turf;
  try {
    const mod = await import('../../lib/turf.min.js');
    _turf = globalThis.turf || mod;
  } catch (e) {
    console.warn('geomCore: Turf.js se nepodařilo načíst:', e);
    _turf = null;
  }
  return _turf;
}

/** Synchronní přístup k Turf (null, pokud ensureTurf() ještě neproběhl). */
export function getTurf() {
  return _turf || globalThis.turf || null;
}

// ── Detect-Collisions (lazy broad-phase filtr) ───────────────────

let _collisions = null;

/**
 * Zajistí načtení Detect-Collisions (SAT broad-phase). Vrací modul se
 * System/Polygon/Box…, nebo null, když bundle chybí/nejde načíst — volající
 * pak musí spadnout na přesnou (pomalejší) kontrolu přes Clipper2.
 */
export async function ensureCollisions() {
  if (_collisions) return _collisions;
  try {
    const mod = await import('../../lib/detect-collisions.js');
    _collisions = (mod && (mod.System || (mod.default && mod.default.System))) ? mod : null;
    if (!_collisions) console.warn('geomCore: detect-collisions.js neexportuje System — je to správný browser bundle?');
  } catch (e) {
    console.warn('geomCore: Detect-Collisions se nepodařilo načíst:', e);
    _collisions = null;
  }
  return _collisions;
}
