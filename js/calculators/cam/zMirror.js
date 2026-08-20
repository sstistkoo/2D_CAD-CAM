// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – zrcadlení světa v ose Z (hrubování „zleva")            ║
// ╚══════════════════════════════════════════════════════════════╝
// Podélné hrubování ZLEVA DOPRAVA je přesné zrcadlo standardního hrubování
// zprava doleva. Místo druhé, paralelní (a nutně chudší) implementace se
// proto zrcadlí SVĚT: na vstupu computeCalculation() se geometrie překlopí
// z → −z, celý výpočet proběhne beze změny (v zrcadle je to obyčejné
// hrubování zprava se standardním pravým nožem) a hotový `calc` se překlopí
// zpátky do reálného světa. Zleva tak platí úplně všechno, co umí pravá
// strana — obrobitelná kontura, dosažitelnost destičky, mezní čáry, obálka
// držáku, kapsy, rampy, dojezdy bez schodků i booleovské hrubování.
//
// Proč se zrcadlí SVĚT a ne NÁSTROJ: nůž na druhou stranu je zrcadlově
// obrácený (levá ruka), takže „zrcadlený svět + pravý nůž" JE reálná situace
// „reálný svět + levý nůž". Spotřebitelé, kteří pracují v reálném světě
// (kreslení plátku, validátor kolizí, HolderGouge), si nástroj zrcadlí sami
// přes příznak `backside`.
//
// KONVENCE OBLOUKŮ (stejná jako v camMath/offsetPath):
//   úhel a = atan2(x − cx, z − cz);  'G2' = klesající a, 'G3' = rostoucí a.
// Překlopení z → −z mapuje a → π − a a obrací smysl (G2↔G3). Když se navíc
// OTOČÍ pořadí průchodu (start↔konec), smysl se obrátí podruhé a dir tedy
// ZŮSTÁVÁ. Toho využívá mirrorSegPath u polí, jejichž pořadí je KONVENCE
// („jízdní pořadí = klesající Z", uzavřené smyčky s danou orientací) —
// obrácením pole se konvence i orientace zachovají. Naopak pole, jejichž
// pořadí je ČAS (dráha nástroje: contourLeadIn/Out), se NEobracejí a smysl
// oblouku se u nich prohodí (mirrorTraceSegs).

const mirA = (a) => Math.PI - a;
const mirPt = (p) => ({ ...p, z: -p.z });
const flipDir = (d) => (d === 'G2' ? 'G3' : d === 'G3' ? 'G2' : d);
/** −v jen pro konečná čísla; null/undefined/NaN projdou beze změny. */
const negNum = (v) => (typeof v === 'number' && isFinite(v)) ? -v : v;

/** Segment (line/arc s p1/p2) zrcadlený a PROJETÝ POZPÁTKU (p1↔p2). */
function mirrorSegReversed(seg) {
  if (seg.type === 'line') {
    return { ...seg, p1: mirPt(seg.p2), p2: mirPt(seg.p1) };
  }
  const out = {
    ...seg, cz: -seg.cz,
    startAngle: mirA(seg.endAngle), endAngle: mirA(seg.startAngle),
  };
  if (seg.p1 && seg.p2) { out.p1 = mirPt(seg.p2); out.p2 = mirPt(seg.p1); }
  if (seg.refP1 && seg.refP2) { out.refP1 = mirPt(seg.refP2); out.refP2 = mirPt(seg.refP1); }
  return out;
}

/**
 * Pole segmentů, jejichž pořadí je KONVENCE (offsetPath, stockPathSegments,
 * contourSegments, machinableContour…). Zrcadlí i obrátí pořadí, takže
 * výsledek zase klesá v Z a uzavřená smyčka (buildStockLoopRaw) si drží
 * orientaci — Clipper by jinak offsetoval dovnitř.
 */
export function mirrorSegPath(segs) {
  if (!Array.isArray(segs)) return segs;
  const out = [];
  for (let i = segs.length - 1; i >= 0; i--) out.push(mirrorSegReversed(segs[i]));
  return out;
}

/**
 * „Trace" segmenty (x1/z1 → x2/z2), jejichž pořadí je ČAS — kudy jede
 * nástroj (contourLeadIn/contourLeadOut). Pořadí se NEotáčí: nástroj projede
 * tytéž úseky ve stejném sledu, jen v opačném směru Z. Proto se prohodí
 * i smysl oblouku (jediné zrcadlení, bez otočení).
 */
export function mirrorTraceSegs(segs) {
  if (!Array.isArray(segs)) return segs;
  return segs.map(s => s.type === 'line'
    ? { ...s, z1: -s.z1, z2: -s.z2 }
    : {
      ...s, cz: -s.cz, dir: flipDir(s.dir),
      startAngle: mirA(s.startAngle), endAngle: mirA(s.endAngle),
      z1: -s.z1, z2: -s.z2,
    });
}

/**
 * Řetěz bodů kontury/polotovaru. Kromě překlopení Z se OBRACÍ POŘADÍ, a to
 * je podstatné: offset úsečky se počítá z LEVÉ normály směru jízdy
 * (`getNormal` = {−dz, dx}), takže leží vně jen u kontury kreslené od
 * pravého čela DOLEVA (klesající Z) — a na tom stojí i
 * `normalizeContourDirection`. Po pouhém překlopení by řetěz běžel zleva
 * doprava („nakreslený pozpátku") a offsety ÚSEČEK by spadly dovnitř dílu,
 * zatímco oblouky (ty si stranu detekují z geometrie) by zůstaly venku —
 * přesně ten obrázek „offsetová čára sedí jen u rádiusů".
 *
 * Typ pohybu a rádius patří k ÚSEKU DO bodu, takže se při obrácení posouvají
 * o jedna: T'[j] = T[n−j], R'[j] = R[n−j]; T'[0] zůstává původní start.
 * Smysl oblouku se NEmění — překlopení ho prohodí a obrácení jízdy podruhé
 * (stejné pravidlo jako u mirrorSegPath).
 *
 * Funkce je involuce: dvojí použití vrátí přesně původní pořadí i typy.
 * Na tom závisí párování `calc.worldPoints[i]` ↔ `S.contourPoints[i]`
 * (tažení a vkládání bodů v simulátoru), proto se tatáž funkce používá
 * na vstupu i při návratu do reálného světa.
 */
export function mirrorPointChain(pts) {
  if (!Array.isArray(pts)) return pts;
  const n = pts.length;
  const out = [];
  for (let j = 0; j < n; j++) {
    const src = pts[n - 1 - j];
    const mv = j === 0 ? pts[0] : pts[n - j];      // úsek, který do bodu vede
    const q = { ...src, type: mv.type };
    if ('r' in mv) q.r = mv.r;
    if ('rVal' in mv) q.rVal = mv.rVal;
    if (typeof src.zReal === 'number') q.zReal = -src.zReal;
    if (typeof src.zAbs === 'number') {
      // Řetěz už je rozpuštěný do absolutních souřadnic (resolvePointsToAbsolute).
      // Přírůstkový zápis (INC) se obrácením pořadí rozbije — ukotvit ho tedy
      // na absolutní hodnoty; ABS řetězce (běžný případ) tím projdou beze změny.
      q.zAbs = -src.zAbs;
      q.z = q.zAbs;
      q.x = src.xAbs;
      q.mode = 'ABS';
    } else if (typeof src.z === 'number') {
      q.z = -src.z;
    }
    out.push(q);
  }
  return out;
}

/** Jeden hrubovací průchod (plán = čas → pořadí leadů se nemění). */
export function mirrorPass(pass) {
  const out = { ...pass, backside: true };
  if (typeof pass.zStart === 'number') out.zStart = -pass.zStart;
  if (typeof pass.zEnd === 'number') out.zEnd = -pass.zEnd;
  if (typeof pass.z === 'number') { out.z = -pass.z; out.faceLeft = true; }   // čelní průchod
  if (pass.ramp) out.ramp = { ...pass.ramp, z0: -pass.ramp.z0 };
  if (pass.rampFeedFrom) out.rampFeedFrom = { ...pass.rampFeedFrom, z: -pass.rampFeedFrom.z };
  if (pass.contourLeadIn) out.contourLeadIn = mirrorTraceSegs(pass.contourLeadIn);
  if (pass.contourLeadOut) out.contourLeadOut = mirrorTraceSegs(pass.contourLeadOut);
  return out;
}

/** Mezní čáry (interferenceGuides) — úsečky s průjezdovými body. */
export function mirrorGuides(guides) {
  if (!Array.isArray(guides)) return guides;
  return guides.map(g => ({
    ...g, z1: -g.z1, z2: -g.z2,
    via: Array.isArray(g.via) ? g.via.map(p => ({ ...p, z: -p.z })) : g.via,
  }));
}

/**
 * Parametry pro zrcadlený svět. Válcový polotovar sahá od −stockLength po
 * stockFace, po překlopení tedy od −stockFace po stockLength → obě čísla se
 * prohodí. Strana se přepne na 'right': v zrcadle se opravdu obrábí
 * standardně zprava a geometrie nástroje se bere NEotočená.
 */
export function mirrorParamsZ(prms) {
  return { ...prms, roughingSide: 'right', stockFace: prms.stockLength, stockLength: prms.stockFace };
}

/**
 * Z-limity: čelisti (levý konec) a koník (pravý konec) si po překlopení
 * vymění role — i se svými zaškrtávátky. Rozsah obrábění 📐 stejně tak.
 */
export function mirrorZLimits(zl) {
  return {
    ...zl,
    chuck: negNum(zl.tail), tail: negNum(zl.chuck),
    chuckActive: zl.tailActive, tailActive: zl.chuckActive,
    rangeStart: negNum(zl.rangeEnd), rangeEnd: negNum(zl.rangeStart),
  };
}

/**
 * Hotový výsledek výpočtu zpět do reálného světa. `simPath` se NEzrcadlí —
 * vzniká parsováním skutečného (reálného) G-kódu, ne ze zrcadleného světa.
 */
export function mirrorCalcZ(calc) {
  const out = { ...calc };
  for (const key of ['worldPoints', 'stockWorldPoints']) {
    if (calc[key]) out[key] = mirrorPointChain(calc[key]);
  }
  for (const key of ['contourSegments', 'machinableContour', 'offsetPath', 'finishOffsetPath',
    'finishRefPath', 'finishUnreachablePath', 'stockPathSegments', 'interferenceSegments',
    'flankSegments', 'rawContourForProfile']) {
    if (calc[key]) out[key] = mirrorSegPath(calc[key]);
  }
  if (calc.interferenceGuides) out.interferenceGuides = mirrorGuides(calc.interferenceGuides);
  if (calc.passes) out.passes = calc.passes.map(mirrorPass);
  return out;
}
