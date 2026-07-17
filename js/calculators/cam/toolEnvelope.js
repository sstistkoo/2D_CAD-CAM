// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – obálka nástroje: zakázaná oblast špičky (Fáze 3a       ║
// ║  migrace na Clipper2, viz docs/geometry-libs-migration.md)   ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Konce hrubovacích průchodů se dnes určují jen dotykem ŠPIČKY s offsetem
// kontury — držák nad destičkou může u stoupající stěny (kužel, čelo bosse)
// vjet do materiálu, který v době průchodu ještě stojí. Tento modul to řeší
// množinově:
//
//   zakázaná oblast špičky F = překážka ⊕ (−obrys držáku)   (Minkowski)
//
// kde překážka = silueta offsetu kontury (materiál, který po hrubování
// zůstává — při globálním sweepu shora dolů je to přesně to, co nad
// aktuální hloubkou stojí v okamžiku každého průchodu). Špička se pak při
// skenu intervalů nesmí dostat dovnitř F — průchod se zkrátí na první
// vstup do F (s bezpečnostní rezervou).
//
// Souřadnice: CAM svět {x = poloměr, z = axiálně} v mm, jako offsetPath.

import { minkowskiSolidSum, polyIntersect, polyOffset } from '../../geom/geomCore.js';
import { holderWorldLoop } from './collisionValidator.js';
import { buildStockLoop } from './materialRemoval.js';

/**
 * Silueta offsetu kontury jako uzavřená smyčka: navzorkuje segmenty
 * offsetPath (line/arc, jízdní pořadí — klesající Z) a uzavře profil
 * k ose X=0 na obou koncích. Null, když profil nedává smysl.
 */
export function offsetSilhouetteLoop(offsetPath) {
  const segs = (offsetPath || []).filter(s => s && !s.isDegenerate);
  if (segs.length === 0) return null;
  const pts = [];
  const push = (p) => {
    const l = pts[pts.length - 1];
    if (!l || Math.hypot(l.x - p.x, l.z - p.z) > 1e-6) pts.push({ x: p.x, z: p.z });
  };
  for (const seg of segs) {
    if (seg.type === 'line') {
      push(seg.p1); push(seg.p2);
    } else if (seg.type === 'arc') {
      let sA = seg.startAngle, eA = seg.endAngle;
      if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
      if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
      const steps = Math.max(2, Math.min(48, Math.ceil(seg.r * Math.abs(eA - sA) / 0.4)));
      for (let j = 0; j <= steps; j++) {
        const a = sA + (eA - sA) * (j / steps);
        push({ x: seg.cx + Math.sin(a) * seg.r, z: seg.cz + Math.cos(a) * seg.r });
      }
    }
  }
  if (pts.length < 2) return null;
  const first = pts[0], last = pts[pts.length - 1];
  if (Math.abs(last.x) > 1e-6) pts.push({ x: 0, z: last.z });
  if (Math.abs(first.x) > 1e-6) pts.push({ x: 0, z: first.z });
  return pts.length >= 3 ? pts : null;
}

/**
 * Zakázaná oblast ŠPIČKY pro daný obrys nástroje relativně ke špičce
 * (typicky držák z holderWorldLoop): F = obstacle ⊕ (−toolLoop).
 * Špička uvnitř F ⇔ nástroj protíná překážku.
 */
export function buildTipForbiddenRegion(obstacleLoops, toolLoop) {
  const reflected = toolLoop.map(p => ({ x: -p.x, z: -p.z }));
  let out = [];
  for (const obstacle of obstacleLoops) {
    if (!obstacle || obstacle.length < 3) continue;
    out = out.concat(minkowskiSolidSum(obstacle, reflected));
  }
  return out;
}

/**
 * Pohotový konstruktor pro calculate(): z parametrů (držák) a offsetPath
 * (silueta) postaví clamp funkci pro scanIntervals, nebo vrátí null,
 * když není co hlídat (bez držáku / bez profilu).
 *
 * Vrácená funkce clamp(X, zStart, zEnd, { mainStair }) → nové zEnd | null:
 *   - zEnd beze změny, když špička na celém intervalu do F nevstoupí,
 *   - první vstup do F (s rezervou `margin`), když vstoupí uprostřed,
 *   - null, když už začátek intervalu leží ve F (průchod vynechat).
 *
 * SCHODY (mainStair): silueta popisuje jen FINÁLNÍ materiál — zkrácené
 * mělčí průchody ale nechávají stát schody NAD ní, do kterých by držák
 * hlubších průchodů najel (a každé zkrácení schod dál zvětšuje). Proto
 * si clamp přes noteMainEnd() pamatuje skutečné konce mělčích průchodů
 * hlavní stěny a hlubší průchod drží levou hranu držáku před nimi:
 * z_tip ≥ zEnd_mělčí + (vzdálenost špička→levá stěna držáku) + rezerva,
 * pro každý schod ve výškovém rozsahu držáku. resetStair() nuluje
 * evidenci (nový region / nová operace).
 */
export function makeHolderClamp(prms, offsetPath, { backside = false, margin = 0.1, stockPathSegments = null } = {}) {
  const holder = holderWorldLoop(prms, backside);
  if (!holder) return null;
  const silhouette = offsetSilhouetteLoop(offsetPath);
  if (!silhouette) return null;
  // Překážka = silueta ∩ polotovar: kontura může přesahovat polotovar
  // (kužel nad průměrem tyče, úseky za délkou) — tam žádný materiál
  // nestojí a držák tam smí. Průnik zároveň normalizuje případná
  // samoprotnutí siluety (nemonotónní profil s kapsami), která by
  // Minkowského sumu zkazila. Bez polotovaru fallback na čistou siluetu.
  let obstacleLoops = [silhouette];
  const stockLoop = buildStockLoop(prms, stockPathSegments || []);
  if (stockLoop) {
    const clipped = polyIntersect([silhouette], polyOffset([stockLoop], 0.1, 'miter'));
    if (clipped.length > 0) obstacleLoops = clipped;
  }
  // Morfologický OPENING (eroze + dilatace o dosah špičky R + max přídavek):
  // tenké slupky finálního povrchu (tloušťka ≲ 2×dosah, např. přídavkový
  // pás nad čelem) dokončí špička a držáku reálně nevadí — z překážky se
  // vyfiltrují. Tlusté stěny (kužely, bossy), kam držák skutečně narazí,
  // opening zachová včetně polohy jejich hran.
  const openR = Math.max(
    (parseFloat(prms.toolRadius) || 0)
    + Math.max(parseFloat(prms.allowanceX) || 0, parseFloat(prms.allowanceZ) || 0)
    + (parseFloat(prms.finishAllowance) || 0) + 0.1,
    0.3);
  const eroded = polyOffset(obstacleLoops, -openR, 'miter');
  if (eroded.length === 0) return null;   // celá překážka je jen slupka
  obstacleLoops = polyOffset(eroded, openR, 'miter');
  if (obstacleLoops.length === 0) return null;
  const forbidden = buildTipForbiddenRegion(obstacleLoops, holder);
  if (forbidden.length === 0) return null;
  // Bbox držáku pro schodovou podmínku (u obdélníku přesný, u vlastního
  // obrysu konzervativní): hwLeft = špička→levá stěna, výšky [hLo, hHi].
  const hwLeft = -Math.min(...holder.map(p => p.z));
  const hLo = Math.min(...holder.map(p => p.x));
  const hHi = Math.max(...holder.map(p => p.x));
  let stair = [];   // { xLo, xHi, zEnd } — pásy materiálu od mělčích konců
  const clamp = (X, zStart, zEnd, opts = {}) => {
    let nz = clampZTowardNegative(forbidden, X, zStart, zEnd, margin);
    const dbg = globalThis.__HOLDER_CLAMP_DEBUG__;
    if (nz === null) {
      if (dbg) console.log(`[clamp] X=${X.toFixed(2)} [${zStart.toFixed(2)}..${zEnd.toFixed(2)}] → NULL (start ve F)`);
      return null;
    }
    const nzSil = nz;
    if (opts.mainStair && hwLeft > 0) {
      for (const s of stair) {
        if (s.xHi <= X + hLo || s.xLo >= X + hHi) continue;   // mimo výšky držáku
        const lim = s.zEnd + hwLeft + margin;
        if (lim > nz) nz = lim;
      }
      if (nz >= zStart) {
        if (dbg) console.log(`[clamp] X=${X.toFixed(2)} [${zStart.toFixed(2)}..${zEnd.toFixed(2)}] → NULL (stair, sil→${nzSil.toFixed(2)})`);
        return null;
      }
    }
    if (dbg && nz > zEnd + 1e-9) console.log(`[clamp] X=${X.toFixed(2)} [${zStart.toFixed(2)}..${zEnd.toFixed(2)}] → ${nz.toFixed(2)} (sil→${nzSil.toFixed(2)}${nz !== nzSil ? ', stair' : ''})`);
    return nz;
  };
  clamp.noteMainEnd = (xLo, xHi, zEnd) => { stair.push({ xLo, xHi, zEnd }); };
  clamp.resetStair = () => { stair = []; };
  // Bodový test (tvrdá oblast) — konce otevřených průchodů.
  clamp.isForbidden = (x, z) => pointInForbidden(forbidden, x, z);
  // MĚKKÁ zakázaná oblast pro sledování kontury (leadIn/leadOut) a
  // dokončování: překážka erodovaná o dalších (openR + 1) mm. Trasy po
  // stěnách „drhnou" držákem jen o přídavkovou slupku (~R + přídavek) —
  // to guides v2 vědomě tolerují (dno kapsy musí zůstat dosažitelné);
  // masivní kolize s TĚLEM dílu (čelo u osy, boss) blokuje i po erozi.
  const softObstacle = polyOffset(obstacleLoops, -(openR + 1.0), 'miter');
  const forbiddenSoft = softObstacle.length > 0
    ? buildTipForbiddenRegion(softObstacle, holder) : [];
  clamp.isForbiddenSoft = (x, z) => forbiddenSoft.length > 0 && pointInForbidden(forbiddenSoft, x, z);
  // Komponentový ořez pro KAPSOVÉ intervaly (vstup u stěny zakázaný,
  // vnitřek dosažitelný — držák se do široké kapsy vejde): vrací
  // { zStart, zEnd } první povolené komponenty, nebo null.
  clamp.span = (X, zStart, zEnd) => {
    const r = clampSpanTowardNegative(forbidden, X, zStart, zEnd, margin);
    if (globalThis.__HOLDER_CLAMP_DEBUG__)
      console.log(`[span] X=${X.toFixed(2)} [${zStart.toFixed(2)}..${zEnd.toFixed(2)}] → ${r ? r.zStart.toFixed(2) + '..' + r.zEnd.toFixed(2) : 'NULL'}`);
    return r;
  };
  return clamp;
}

/**
 * Bodový test: leží špička (x, z) uvnitř zakázané oblasti? Even-odd
 * parita paprskem podél +z (stejné half-open pravidlo jako clamp sken).
 */
export function pointInForbidden(forbiddenLoops, x, z) {
  let parity = 0;
  for (const loop of forbiddenLoops) {
    for (let i = 0; i < loop.length; i++) {
      const p = loop[i], q = loop[(i + 1) % loop.length];
      if ((p.x <= x) === (q.x <= x)) continue;
      const zc = p.z + ((x - p.x) / (q.x - p.x)) * (q.z - p.z);
      if (zc > z) parity ^= 1;
    }
  }
  return parity === 1;
}

/**
 * Ořez intervalu na PRVNÍ povolenou komponentu od zStart (obě strany):
 * pro KAPSY, kde je vstup u stěny zakázaný (držák nad okrajem), ale
 * vnitřek dosažitelný — vrací { zStart, zEnd } zmenšené o rezervu,
 * nebo null, když v intervalu žádná povolená komponenta není.
 */
export function clampSpanTowardNegative(forbiddenLoops, X, zStart, zEnd, margin = 0.1) {
  const crossings = [];
  let insideAtStart = 0;
  for (const loop of forbiddenLoops) {
    for (let i = 0; i < loop.length; i++) {
      const p = loop[i], q = loop[(i + 1) % loop.length];
      if ((p.x <= X) === (q.x <= X)) continue;
      const z = p.z + ((X - p.x) / (q.x - p.x)) * (q.z - p.z);
      if (z > zStart) insideAtStart ^= 1;
      else if (z >= zEnd - 1e-9) crossings.push(z);
    }
  }
  crossings.sort((a, b) => b - a);   // shora dolů (směr jízdy −Z)
  let state = insideAtStart === 1;
  let sNew = state ? null : zStart;
  let eNew = zEnd;
  for (const c of crossings) {
    if (state) { sNew = c - margin; state = false; }   // výstup z F → začátek
    else { eNew = c + margin; break; }                 // vstup do F → konec
  }
  if (sNew === null || sNew - eNew < 0.2) return null;
  return { zStart: Math.min(zStart, sNew), zEnd: Math.max(zEnd, eNew) };
}

/**
 * Ořez intervalu špičky na vodorovné přímce x = X při jízdě od zStart
 * (vyšší Z) k zEnd (nižší Z) proti zakázané oblasti (pole smyček,
 * even-odd parita = sjednocení). Vrací nové zEnd (≥ původní), nebo null
 * když je zakázaný už začátek intervalu.
 */
export function clampZTowardNegative(forbiddenLoops, X, zStart, zEnd, margin = 0.1) {
  // Průsečíky hran s přímkou x = X (half-open pravidlo proti dvojímu
  // započtení vrcholů) + parita napravo od zStart = uvnitř/venku.
  const crossings = [];
  let parityAtStart = 0;
  for (const loop of forbiddenLoops) {
    for (let i = 0; i < loop.length; i++) {
      const p = loop[i], q = loop[(i + 1) % loop.length];
      if ((p.x <= X) === (q.x <= X)) continue;
      const z = p.z + ((X - p.x) / (q.x - p.x)) * (q.z - p.z);
      if (z > zStart) parityAtStart ^= 1;
      else if (z >= zEnd - 1e-9) crossings.push(z);
    }
  }
  if (parityAtStart === 1) return null;          // start uvnitř F
  if (crossings.length === 0) return zEnd;       // celý interval volný
  // První vstup do F ve směru jízdy (−Z) = největší z průsečíků pod zStart
  const firstEntry = Math.max(...crossings);
  const clamped = firstEntry + margin;
  if (clamped >= zStart) return null;            // po rezervě nezbylo nic
  return Math.max(zEnd, clamped);
}
