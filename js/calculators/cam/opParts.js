// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – skládání programu z více operací (částí)              ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Jedna kontura (jeden výkres) se dá obrobit na několik operací: nejdřív
// hrubování jedním nožem, pak drážky/zápich jiným, pak závit atd. Každá
// operace = jedna „ČÁST" programu s vlastními parametry (nůž, otáčky,
// posuv, rozsahy obrábění) a vlastním G-kódem.
//
// Klíčová vlastnost: další část NEZAČÍNÁ na původním polotovaru, ale na
// tom, co po předchozí části zbylo. Obrobený polotovar se odvodí booleovsky
// (MaterialRemoval nad celou dráhou části) a převede zpět na profil
// polotovaru (stockPoints), se kterým další část počítá dráhy.
//
// Souřadnice: {x = poloměr [mm], z = axiálně [mm]}, stejně jako simPath —
// stockPoints se ale ukládají v UŽIVATELSKÉM zápisu (DIAMON → ⌀).

import { polyOffset, polySimplify } from '../../geom/geomCore.js';
import { fitArcsToPolyline, getArcParams } from './camMath.js';
import { MaterialRemoval } from './materialRemoval.js';
import { mergePrograms } from './gcodeMerge.js';

// Zjednodušení odvozeného profilu [mm]. Profil se nejdřív odsadí VEN o
// stejnou hodnotu, aby chyba zjednodušení padla na stranu „víc materiálu"
// (nástroj pak nanejvýš řeže vzduch, nikdy nenajede do neodebraného kusu).
const SIMPLIFY_EPS = 0.05;

// Bod na ose — profil polotovaru je otevřený a končí na ose, viz
// generateDefaultStock() / buildStockLoop(). Tolerance musí pokrýt odsazení
// ven o SIMPLIFY_EPS (osová hrana se tím dostane na x ≈ −SIMPLIFY_EPS).
const AXIS_EPS = SIMPLIFY_EPS * 1.5;

// Strop počtu bodů odvozeného polotovaru — každý bod je segment, přes který
// pak jede scan hrubování. Nad limitem se zjednodušuje hrubší tolerancí.
const MAX_STOCK_POINTS = 400;

// Parametry, které si část NESMÍ nést vlastní (jsou vlastnost výkresu/stroje,
// ne operace) — při přepnutí části se přebírají z aktuálního stavu.
const SHARED_PARAM_KEYS = ['machineStructure', 'controlSystem', 'mode', 'safeX', 'safeZ'];

// Parametry popisující POLOTOVAR — při zobrazení celého programu se berou
// z první části (program začíná na původním polotovaru).
const STOCK_PARAM_KEYS = ['stockMode', 'stockDiameter', 'stockLength', 'stockFace', 'stockMargin'];

let _idSeq = 0;
function nextId() { return Date.now() * 1000 + (_idSeq = (_idSeq + 1) % 1000); }

const clone = (v) => JSON.parse(JSON.stringify(v ?? null));

/** Popisek nástroje části pro chip/název ("T3 UPICH" / "ROUGHER_T1"). */
export function partToolLabel(S) {
  const slotIdx = S.activeMagazineSlot;
  const mag = Array.isArray(S.toolMagazine) ? S.toolMagazine : [];
  if (slotIdx !== null && slotIdx !== undefined && mag[slotIdx]) {
    const t = mag[slotIdx];
    return `T${t.slot} ${t.name || ''}`.trim();
  }
  return (S.params && S.params.toolName) || 'nůž';
}

/**
 * Vytvoří záznam části z živého stavu simulátoru.
 * `stockPoints` = polotovar PŘED touto částí (tj. výsledek části předchozí).
 */
export function makePart(S, { name, gcode } = {}) {
  const idx = (S.opParts ? S.opParts.length : 0) + 1;
  return {
    id: nextId(),
    name: name || `Část ${idx} – ${partToolLabel(S)}`,
    gcode: gcode !== undefined ? gcode : (S.manualGCode || ''),
    params: clone(S.params),
    zLimits: clone(S.zLimits),
    xLimits: clone(S.xLimits),
    stockPoints: clone(S.stockPoints),
    selectedMaterial: S.selectedMaterial,
    activeMagazineSlot: S.activeMagazineSlot,
  };
}

/** Zapíše živý stav simulátoru zpět do záznamu části (před přepnutím/uložením). */
export function syncPartFromState(part, S) {
  if (!part) return part;
  part.gcode = S.manualGCode || '';
  part.params = clone(S.params);
  part.zLimits = clone(S.zLimits);
  part.xLimits = clone(S.xLimits);
  part.stockPoints = clone(S.stockPoints);
  part.selectedMaterial = S.selectedMaterial;
  part.activeMagazineSlot = S.activeMagazineSlot;
  return part;
}

/** Nahraje záznam části do živého stavu simulátoru (kontura zůstává sdílená). */
export function applyPartToState(part, S) {
  if (!part) return;
  const shared = {};
  SHARED_PARAM_KEYS.forEach(k => { shared[k] = S.params[k]; });
  S.params = Object.assign(clone(part.params) || {}, shared);
  S.zLimits = clone(part.zLimits) || S.zLimits;
  S.xLimits = clone(part.xLimits) || S.xLimits;
  S.stockPoints = clone(part.stockPoints) || [];
  if (part.selectedMaterial) S.selectedMaterial = part.selectedMaterial;
  S.activeMagazineSlot = part.activeMagazineSlot ?? null;
  S.manualGCode = part.gcode || '';
}

// ── Obrobený polotovar (co zbylo po části) ─────────────────────

/**
 * Odsimuluje CELOU dráhu části nad jejím polotovarem a vrátí zbývající
 * materiál jako pole smyček [{x,z}, …] (radiální souřadnice).
 * Vrací null, když polotovar/dráha nejsou k dispozici.
 */
export function machinedStockModel(prms, stockPathSegments, simPath) {
  if (!simPath || simPath.length < 2) return null;
  const mr = new MaterialRemoval(prms, stockPathSegments);
  if (!mr.valid) return null;
  mr.advanceTo(simPath, simPath.length - 1);
  return mr;
}

export function machinedStockLoops(prms, stockPathSegments, simPath) {
  const mr = machinedStockModel(prms, stockPathSegments, simPath);
  return mr && mr.model ? mr.model.loops : null;
}

/** Plocha smyčky se znaménkem (shoelace) — jen pro výběr té největší. */
function loopArea(loop) {
  let a = 0;
  for (let i = 0, n = loop.length; i < n; i++) {
    const p = loop[i], q = loop[(i + 1) % n];
    a += p.z * q.x - q.z * p.x;
  }
  return a / 2;
}

/**
 * Převede smyčky zbývajícího materiálu na PROFIL polotovaru ve tvaru, jaký
 * čeká `S.stockPoints`: otevřený řetěz od pravého čela po povrchu doleva,
 * zakončený bodem na ose (viz generateDefaultStock).
 *
 * Vrací { points: [{x,z}], dropped } — `dropped` = počet zahozených menších
 * smyček (upíchnutý kus, oddělené zbytky).
 */
export function loopsToStockProfile(loops) {
  if (!loops || loops.length === 0) return { points: [], dropped: 0 };

  // Chybu proložení hodit na stranu „víc materiálu": nejdřív odsadit ven
  // o SIMPLIFY_EPS (níž se se stejnou tolerancí prokládají oblouky/úsečky,
  // takže výsledek původní tvar vždy obepíná). Zjednodušení tady jen
  // vyhazuje duplicitní/kolineární body, ať fit nemá co řešit.
  let simplified = loops;
  try {
    simplified = polySimplify(polyOffset(loops, SIMPLIFY_EPS), 0.005);
  } catch { /* fallback: syrové smyčky */ }
  if (!simplified || simplified.length === 0) simplified = loops;

  const best = simplified.slice().sort((a, b) => Math.abs(loopArea(b)) - Math.abs(loopArea(a)))[0];
  const dropped = simplified.length - 1;

  const pts = best.map(p => ({ x: p.x, z: p.z }));
  const n = pts.length;
  if (n < 3) return { points: [], dropped };

  // Nejdelší souvislý (cyklicky) úsek bodů na ose = uzávěr smyčky k ose,
  // který v otevřeném profilu polotovaru nefiguruje. Odsazení ven posunulo
  // osovou hranu do záporných X — proto ≤ AXIS_EPS, ne |x| ≤ ε.
  const onAxis = pts.map(p => p.x <= AXIS_EPS);
  if (!onAxis.some(Boolean)) {
    // Polotovar se osy nedotýká (trubka apod.) — profil nejde zapsat
    // otevřeným řetězem; vrátit prázdno, volající nechá polotovar beze změny.
    return { points: [], dropped, noAxis: true };
  }
  let bestStart = -1, bestLen = 0, curStart = -1, curLen = 0;
  for (let i = 0; i < 2 * n; i++) {
    if (onAxis[i % n]) {
      if (curLen === 0) curStart = i % n;
      curLen++;
      if (curLen > bestLen && curLen <= n) { bestLen = curLen; bestStart = curStart; }
    } else curLen = 0;
  }
  if (bestLen >= n) return { points: [], dropped };

  // Řetěz = body za osovým úsekem, v pořadí smyčky.
  const chain = [];
  for (let k = 0; k < n - bestLen; k++) chain.push(pts[(bestStart + bestLen + k) % n]);
  if (chain.length < 2) return { points: [], dropped };

  // Konvence profilu: začátek u pravého čela (větší Z), konec vlevo na ose.
  if (chain[0].z < chain[chain.length - 1].z) chain.reverse();
  // Odsazení ven mohlo poslat body kousek za osu — poloměr nesmí být záporný.
  const poly = chain.map(p => ({ x: Math.max(0, p.x), z: p.z }));

  // Zbytkový materiál je z Clipperu vždy mnohoúhelník — zaoblení dílu by tedy
  // skončila jako stovky drobných úseček. Proložit je zpět oblouky/úsečkami
  // (stejný fit jako u trasování profilu), ať polotovar zůstane čitelný a
  // scan hrubování nejede přes tisíce segmentů. Nevejde-li se do stropu
  // bodů, tolerance se stupňuje.
  let tol = SIMPLIFY_EPS;
  let segs = fitArcsToPolyline(poly, tol);
  while (segs.length + 2 > MAX_STOCK_POINTS && tol < 2) {
    tol *= 2;
    const re = fitArcsToPolyline(poly, tol);
    if (re.length >= segs.length) break;
    segs = re;
  }
  if (segs.length === 0) return { points: [], dropped };
  segs = splitWideArcs(segs);

  const out = [{ x: segs[0].p1.x, z: segs[0].p1.z, type: 'G0', r: 0 }];
  for (const s of segs) {
    // Střed z fitu se veze s bodem — po zaokrouhlení se podle něj ověří, že
    // oblouk zůstal tam, kam patří (viz machinedStockPoints).
    if (s.type === 'arc') out.push({ x: s.p2.x, z: s.p2.z, type: s.dir, r: s.r, cx: s.cx, cz: s.cz });
    else out.push({ x: s.p2.x, z: s.p2.z, type: 'G1', r: 0 });
  }
  // Uzavření k ose je vždy rovné (osový úsek se do profilu nepíše).
  out.push({ x: 0, z: out[out.length - 1].z, type: 'G1', r: 0 });

  return { points: out, dropped, arcs: segs.filter(s => s.type === 'arc').length };
}

/**
 * Rozdělí široké oblouky na kratší (výchozí strop 90°).
 *
 * PROČ: fitArcsToPolyline povoluje rozvin až ~169°, jenže u tak plochého
 * oblouku je zápis „koncový bod + poloměr" numericky prekérní — tětiva se
 * blíží 2R, takže drobná chyba v R (třeba jen zaokrouhlení souřadnic na µm
 * při zápisu do bodů polotovaru) posune dopočítaný střed o řád víc. V nejhorším
 * spadne R pod polovinu tětivy, getArcParams to ohlásí jako chybu a oblouk
 * dokreslí jako půlkruh — na plátně to vypadá, jako by se obrátil směr.
 * Poloviny/čtvrtiny téhož oblouku leží na stejné kružnici, takže tvar se
 * nemění, jen se zpevní zápis.
 */
function splitWideArcs(segs, maxSweep = Math.PI / 2) {
  const out = [];
  for (const s of segs) {
    if (s.type !== 'arc') { out.push(s); continue; }
    let sA = s.startAngle, eA = s.endAngle;
    if (s.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
    if (s.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
    const sweep = eA - sA;
    const n = Math.max(1, Math.ceil(Math.abs(sweep) / maxSweep));
    if (n === 1) { out.push(s); continue; }
    let prev = s.p1;
    for (let k = 1; k <= n; k++) {
      const a = sA + sweep * (k / n);
      // Poslední díl končí přesně v původním koncovém bodě (bez dopočtu).
      const pt = k === n ? s.p2
        : { x: s.cx + Math.sin(a) * s.r, z: s.cz + Math.cos(a) * s.r };
      out.push({ ...s, p1: prev, p2: pt, startAngle: sA + sweep * ((k - 1) / n), endAngle: a });
      prev = pt;
    }
  }
  return out;
}

/**
 * Ověří, že se oblouk po ZAOKROUHLENÍ souřadnic dopočítá na stejný střed jako
 * při fitu. Vrací true, když sedí (tolerance v mm).
 */
function arcSurvivesRounding(prevPt, pt, tol = 0.05) {
  if (pt.cx === undefined) return true;
  const a = getArcParams({ x: prevPt.x, z: prevPt.z }, { x: pt.x, z: pt.z }, pt.r, pt.type);
  if (a.error) return false;
  return Math.hypot(a.cx - pt.cx, a.cz - pt.cz) <= tol;
}

/**
 * Profil obrobeného polotovaru rovnou jako body pro `S.stockPoints`
 * (G0 + G1 řetěz, X v uživatelském režimu DIAMON/DIAMOF).
 */
export function machinedStockPoints(prms, stockPathSegments, simPath) {
  const mr = machinedStockModel(prms, stockPathSegments, simPath);
  if (!mr) return { points: [], empty: true };
  const loops = mr.model ? mr.model.loops : null;
  if (!loops || loops.length === 0) return { points: [], empty: true, baseLoop: mr.baseLoop };
  const { points, dropped, noAxis, arcs } = loopsToStockProfile(loops);
  if (points.length < 2) return { points: [], dropped, noAxis, baseLoop: mr.baseLoop };
  const dia = prms.mode === 'DIAMON' ? 2 : 1;
  const round = (v) => Math.round(v * 1000) / 1000;
  // Souřadnice bodu polotovaru se zapisují zaokrouhlené (µm) — u oblouku se pak
  // ověří, že se z nich dopočítá TÝŽ střed jako při fitu. Když ne (extrémně
  // plochý oblouk), degraduje se na úsečku: po rozdělení na ≤ 90° je taková
  // tětiva už jen setiny mm od kružnice, kdežto špatně dopočítaný střed by
  // oblouk vykreslil úplně jinudy.
  let degraded = 0;
  const outPts = [];
  points.forEach((p, i) => {
    const isArc = p.type === 'G2' || p.type === 'G3';
    const rp = {
      id: nextId(),
      type: p.type,
      x: round(p.x * dia),
      z: round(p.z),
      // Rádius oblouku je VŽDY skutečný poloměr (viz resolvePointsToAbsolute:
      // rVal se počítá proti xReal), takže se na průměr nepřepočítává.
      r: isArc ? round(p.r) : 0,
      mode: 'ABS',
    };
    if (isArc && i > 0) {
      const prevReal = { x: outPts[i - 1].x / dia, z: outPts[i - 1].z };
      const check = { x: rp.x / dia, z: rp.z, r: rp.r, type: rp.type, cx: p.cx, cz: p.cz };
      if (!arcSurvivesRounding(prevReal, check)) {
        rp.type = 'G1';
        rp.r = 0;
        degraded++;
      }
    }
    outPts.push(rp);
  });
  return {
    points: outPts,
    dropped,
    arcs: arcs - degraded,
    degraded,
    baseLoop: mr.baseLoop,
  };
}

// ── Celý program (všechny části za sebou) ──────────────────────

/**
 * Spojí části do jednoho programu stejnou logikou jako „🔗 Spojit do jednoho"
 * v CAM Editoru: opakovaná nastavení hlavičky se vynechají, M30 zůstane jen
 * na konci a při výměně nože se vypíše nájezd do ref. bodu.
 */
export function buildCombinedProgram(parts) {
  const items = (parts || [])
    .filter(p => p && p.gcode && p.gcode.trim())
    .map((p, i) => ({ name: p.name || `Část ${i + 1}`, code: p.gcode }));
  if (items.length === 0) return '';
  if (items.length === 1) return items[0].code;
  return mergePrograms(items);
}

/** Položky pro frontu „SPOJ G-KÓD" v CAM Editoru. */
export function partsAsMergeItems(parts) {
  return (parts || [])
    .filter(p => p && p.gcode && p.gcode.trim())
    .map((p, i) => ({ name: `${p.name || `Část ${i + 1}`}.MPF`, code: p.gcode }));
}

export { STOCK_PARAM_KEYS, SHARED_PARAM_KEYS };
