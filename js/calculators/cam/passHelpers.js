// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – dotazy nad offsetem kontury (pass-helpery)             ║
// ╚══════════════════════════════════════════════════════════════╝
// Čistě geometrické dotazy, ze kterých strategie hrubování skládají
// průchody: „jak vysoko je offset na tomhle Z", „projeď offset v pásu
// [zHi,zLo]", „kam až dojet dojezdem bez schodků". Dřív žily jako uzávěry
// přímo v calculate() nad JEDINÝM offsetPath; vytažením do továrny
// (makePassHelpers) je lze postavit i nad JINOU sadou segmentů — což
// potřebuje hrubování zleva, které si staví zrcadlený svět (viz zMirror.js).
//
// Souřadnice: CAM svět {x = poloměr, z = axiálně} v mm. Oblouky používají
// úhel = atan2(x − cx, z − cz), 'G2' = klesající úhel.

import { intersectHorizontalLineArc, intersectHorizontalLineSegment, isAngleBetween } from './camMath.js';

/** Horizontální průsečíky (Z) segmentů s přímkou x = xLine, s kolineárním fallbackem. */
export function hIntersect(segs, xLine, checkDegen) {
  const out = [];
  for (const seg of segs) {
    if (checkDegen && seg.isDegenerate) continue;
    if (seg.type === 'line') {
      const z = intersectHorizontalLineSegment(xLine, seg.p1, seg.p2);
      if (z !== null) out.push(z);
      else if (Math.abs(seg.p1.x - xLine) < 0.01 && Math.abs(seg.p2.x - xLine) < 0.01) {
        out.push(seg.p1.z, seg.p2.z);
      }
    } else if (seg.type === 'arc') {
      const res = intersectHorizontalLineArc(xLine, { x: seg.cx, z: seg.cz }, seg.r);
      for (const z of res) {
        const angle = Math.atan2(xLine - seg.cx, z - seg.cz);
        if (isAngleBetween(angle, seg.startAngle, seg.endAngle, seg.dir === 'G2')) out.push(z);
      }
    }
  }
  return out;
}

/** Max X segmentů na zadaném Z. Null pokud Z mimo Z-rozsah segmentů. */
export function maxXAt(segs, z) {
  let maxX = null;
  for (const seg of segs) {
    if (seg.isDegenerate) continue;
    if (seg.type === 'line') {
      const zMin = Math.min(seg.p1.z, seg.p2.z);
      const zMax = Math.max(seg.p1.z, seg.p2.z);
      if (z < zMin - 0.01 || z > zMax + 0.01) continue;
      const dz = seg.p2.z - seg.p1.z;
      const x = Math.abs(dz) < 1e-6
        ? Math.max(seg.p1.x, seg.p2.x)
        : seg.p1.x + ((z - seg.p1.z) / dz) * (seg.p2.x - seg.p1.x);
      if (maxX === null || x > maxX) maxX = x;
    } else if (seg.type === 'arc') {
      const cosA = (z - seg.cz) / seg.r;
      if (cosA < -1.001 || cosA > 1.001) continue;
      const cosC = Math.max(-1, Math.min(1, cosA));
      const a1 = Math.acos(cosC);
      for (const a of [a1, -a1]) {
        if (isAngleBetween(a, seg.startAngle, seg.endAngle, seg.dir === 'G2')) {
          const x = seg.cx + Math.sin(a) * seg.r;
          if (maxX === null || x > maxX) maxX = x;
        }
      }
    }
  }
  return maxX;
}

/** Úhel oblouku na zadaném Z (jen v rozsahu výseku); null mimo. */
export function arcAngleAtZ(seg, z) {
  const cosA = (z - seg.cz) / seg.r;
  if (cosA < -1.001 || cosA > 1.001) return null;
  const cosC = Math.max(-1, Math.min(1, cosA));
  const a1 = Math.acos(cosC);
  for (const a of [a1, -a1]) {
    if (isAngleBetween(a, seg.startAngle, seg.endAngle, seg.dir === 'G2')) return a;
  }
  return null;
}

/**
 * Sada dotazů nad JEDNÍM offsetem kontury (v jízdním pořadí, klesající Z):
 *   offsetXAt(z)                            – max X offsetu na Z (null mimo)
 *   traceOffsetPath(zHi, zLo)               – segmenty offsetu v pásu, v jízdním pořadí
 *   findPocketExitZ(zFrom, depthX, zFloor)  – konec dojezdu z kapsy
 *   findLeadOutEndZ(zFrom, prevX, nextX, zFloor) – konec dojezdu bez schodků
 */
export function makePassHelpers(offsetPath) {
  const offsetXAt = (z) => maxXAt(offsetPath, z);

  // Kopie segmentů offsetPath oříznuté na Z∈[zLo,zHi], v pořadí jízdy
  // (od vyššího Z k nižšímu) — podklad pro G1/G2/G3 sledování kontury
  // přes "kapsu"/"schod" místo odskoku a rychloposuvu nad polotovarem.
  const traceOffsetPath = (zHi, zLo) => {
    const out = [];
    // offsetPath je v jízdním pořadí (klesající Z); procházíme dopředu,
    // ať výsledek vyjde také v jízdním pořadí (vysoké Z → nízké Z).
    // Každý segment uvnitř drží x1/z1 = vyšší Z, x2/z2 = nižší Z, takže
    // dopředný průchod = spojitá dráha bez zpětných skoků/oblouků.
    for (let i = 0; i < offsetPath.length; i++) {
      const seg = offsetPath[i];
      if (seg.isDegenerate) continue;
      if (seg.type === 'line') {
        const zA = seg.p1.z, zB = seg.p2.z;
        // Čelní (konstantní-Z) úsek — radiální pohyb v X. Z-klipování by ho
        // zahodilo (clipHi==clipLo), proto ho zařadíme zvlášť v jízdním
        // pořadí (p1→p2), pokud jeho Z leží v rozsahu [zLo, zHi].
        if (Math.abs(zA - zB) < 1e-6) {
          // Uzavírací čelo protínající osu (jede k X≈0) NENÍ soustružnický
          // schod — hrubovací dojezd (leadOut) ho nesmí přejíždět až na osu,
          // jinak vznikne dlouhá radiální dráha přes celé čelo do středu
          // (a odskok pak startuje z osy). Náběhové čelo se sleduje OPAČNĚ
          // (od osy ven), to necháváme — dílo se u něj obrábí normálně.
          const towardAxis = seg.p2.x < seg.p1.x - 1e-6 && seg.p2.x < 0.05;
          if (!towardAxis && zA <= zHi + 1e-6 && zA >= zLo - 1e-6)
            out.push({ type: 'line', x1: seg.p1.x, z1: zA, x2: seg.p2.x, z2: zB });
          continue;
        }
        const hiPt = zA >= zB ? seg.p1 : seg.p2;
        const loPt = zA >= zB ? seg.p2 : seg.p1;
        const clipHi = Math.min(zHi, hiPt.z);
        const clipLo = Math.max(zLo, loPt.z);
        if (clipHi <= clipLo + 1e-6) continue;
        const dz = hiPt.z - loPt.z;
        const xAt = (z) => Math.abs(dz) < 1e-9 ? hiPt.x : loPt.x + (z - loPt.z) / dz * (hiPt.x - loPt.x);
        out.push({ type: 'line', x1: xAt(clipHi), z1: clipHi, x2: xAt(clipLo), z2: clipLo });
      } else if (seg.type === 'arc') {
        const zAtStart = seg.cz + Math.cos(seg.startAngle) * seg.r;
        const zAtEnd = seg.cz + Math.cos(seg.endAngle) * seg.r;
        const reversed = zAtStart < zAtEnd;
        const aAtHiOrig = reversed ? seg.endAngle : seg.startAngle;
        const aAtLoOrig = reversed ? seg.startAngle : seg.endAngle;
        const zSegHi = Math.max(zAtStart, zAtEnd);
        const zSegLo = Math.min(zAtStart, zAtEnd);
        const clipHi = Math.min(zHi, zSegHi);
        const clipLo = Math.max(zLo, zSegLo);
        if (clipHi <= clipLo + 1e-6) continue;
        const aAtClipHi = arcAngleAtZ(seg, clipHi) ?? aAtHiOrig;
        const aAtClipLo = arcAngleAtZ(seg, clipLo) ?? aAtLoOrig;
        const outDir = reversed ? (seg.dir === 'G2' ? 'G3' : 'G2') : seg.dir;
        out.push({
          type: 'arc', cx: seg.cx, cz: seg.cz, r: seg.r, dir: outDir,
          startAngle: aAtClipHi, endAngle: aAtClipLo,
          x1: seg.cx + Math.sin(aAtClipHi) * seg.r, z1: clipHi,
          x2: seg.cx + Math.sin(aAtClipLo) * seg.r, z2: clipLo
        });
      }
    }
    return out;
  };

  // Konec leadOutu z kapsy: na rozdíl od findLeadOutEndZ se NEzastaví,
  // když offset stoupá — sleduje druhou (odvrácenou) stěnu kapsy nahoru
  // (G2/G3) až dokud znovu neklesne na řeznou hloubku depthX (tam pokračuje
  // hlubší průchod), nebo dokud kontura nekončí. Tím se obrobí celá druhá
  // stěna kapsy přímo po obrysu místo odskoku.
  const findPocketExitZ = (zFrom, depthX, zFloor) => {
    const h = 0.05;
    let z = zFrom, leftPocket = false;
    for (let i = 0; i < 8000; i++) {
      const zNext = z - h;
      if (zNext < zFloor - 1e-6) break;
      const x = offsetXAt(zNext);
      if (x === null) break;                       // konec kontury
      if (x > depthX + 0.01) leftPocket = true;    // stoupáme po druhé stěně
      else if (leftPocket && x <= depthX + 1e-6) return zNext; // zpět na hloubku
      z = zNext;
    }
    return z;
  };

  // Konec leadOutu otevřeného (podélného) průchodu pro hrubování bez
  // schodků: po dojezdu na konturu se po ní jede dál, dokud offset buď
  // neklesne na hloubku DALŠÍHO (hlubšího) průchodu nextX — tam to převezme
  // další pas — NEBO nestoupne zpět na hloubku PŘEDCHOZÍHO (mělčího)
  // průchodu prevX — tam je vršek schodu, který už mělčí pas obrobil. Tím
  // se schod mezi sousedními zabery obrobí přímo po obrysu (žádný zbytek).
  const findLeadOutEndZ = (zFrom, prevX, nextX, zFloor) => {
    const h = 0.05;
    let z = zFrom;
    for (let i = 0; i < 8000; i++) {
      const zNext = z - h;
      if (zNext < zFloor - 1e-6) break;
      const x = offsetXAt(zNext);
      if (x === null) break;                                  // konec kontury
      if (x <= nextX + 1e-6) return zNext;                    // klesla na hlubší zaber
      if (prevX !== null && x >= prevX - 1e-6) return zNext;   // stoupla na vršek schodu
      z = zNext;
    }
    return z;
  };

  return { offsetXAt, traceOffsetPath, findPocketExitZ, findLeadOutEndZ };
}
