// ╔════════════════════════════════════════════════════════╗
// ║  Obálka sjezdů a dojezdů upichováku (podélně)                  ║
// ╚════════════════════════════════════════════════════════╝
// ── Sjezdy/dojezdy upichováku po OBÁLCE (podélně) ──
// Sledování kontury (leadIn do kapsy, leadOut „bez schodků") jede u
// upichováku po obálce x(z) = max offsetu pod rovnou částí dna (tělo
// doprava): na klesající kontuře (sjezd do kapsy, dojezd schodu doleva)
// tak dráha zůstane výš, dokud tělo nemine pravou stěnu — jinak by
// aktivní roh sledoval konturu a tělo za ním řezalo do tvaru. Na
// stoupající (levé stěny) se obálka kryje s offsetem. Kruhové úseky se
// zpětně prokládají G2/G3 (fitArcsToPolyline).

import { samplePartingEnvelope, fitArcsToPolyline, isAngleBetween } from '../../camMath.js';

/**
 * Přepočítá sledování kontury (leadIn/leadOut) na OBÁLKU plátku. Mění
 * `passes` na místě; pro plátky bez širokého boku se nevolá vůbec.
 *
 * @param passes    pole průchodů (mutácia na místě)
 * @param offsetXAt dráha středu špičky na daném z
 * @param flatSpanZ rovná část dna plátku (b − 2R) — šířka obálky
 */
export function envelopePartingLeads(passes, offsetXAt, flatSpanZ) {
    // X původní trasy na axiální souřadnici z (max přes segmenty, které tam
    // zasahují). Slouží jako PODLAHA obálky — viz envify níž.
    // OBLOUK SE MUSÍ VYHODNOTIT PŘESNĚ (průsečík kružnice se svislicí, jen
    // úhlově platná větev): „konzervativně vyšším koncem" zvedne podlahu na
    // maximum přes CELÉ rozpětí oblouku, takže obálka nad ním vyjde vodorovná
    // a z oblouku se v G-kódu stane ÚSEČKA (reálný nález uživatele:
    // `G1 X31.766 Z−1.261` místo `G3 … CR=11.344`).
    const traceXAt = (segs, z) => {
      let top = null;
      const bump = (x) => { if (Number.isFinite(x) && (top === null || x > top)) top = x; };
      for (const s of segs) {
        const zLo = Math.min(s.z1, s.z2), zHi = Math.max(s.z1, s.z2);
        if (z < zLo - 1e-9 || z > zHi + 1e-9) continue;
        if (s.type === 'line') {
          const dz = s.z2 - s.z1;
          bump(Math.abs(dz) < 1e-9 ? Math.max(s.x1, s.x2) : s.x1 + (s.x2 - s.x1) * ((z - s.z1) / dz));
        } else if (Number.isFinite(s.cx) && Number.isFinite(s.cz) && s.r > 0) {
          const d = z - s.cz;
          if (Math.abs(d) > s.r) { bump(Math.max(s.x1, s.x2)); continue; }   // svislice mimo kružnici
          const h = Math.sqrt(Math.max(0, s.r * s.r - d * d));
          let hit = false;
          for (const x of [s.cx + h, s.cx - h]) {
            const a = Math.atan2(x - s.cx, z - s.cz);
            if (isAngleBetween(a, s.startAngle, s.endAngle, s.dir === 'G2')) { bump(x); hit = true; }
          }
          if (!hit) bump(Math.max(s.x1, s.x2));
        } else {
          bump(Math.max(s.x1, s.x2));
        }
      }
      return top;
    };
    const envify = (segs) => {
      if (!segs || segs.length === 0) return segs;
      const zFrom = segs[0].z1, zTo = segs[segs.length - 1].z2;
      if (Math.abs(zTo - zFrom) < 0.02) return segs;
      const pts = samplePartingEnvelope(offsetXAt, zFrom, zTo, flatSpanZ, 1, 0.4, 0.003);
      if (pts.length < 2) return segs;
      // Obálka smí dráhu jen ZVEDNOUT. Počítá se ze syrového `offsetXAt`,
      // jenže původní trasa už prošla podlahou hloubky vrstvy, ořezem na
      // sousední (mělčí) průchod i obálkou držáku — její X je proto závazné
      // MINIMUM. Bez tohohle stropu se z rovného dojezdu ve výšce vrstvy
      // stal sjezd po kontuře až na dno dílu: na díle uživatele dojezd
      // z X49,5 sjel na X7,9 (41 mm pod svou vrstvu) a držák jel 20 mm
      // v bossu — hlídání držáku přitom trasu VIDĚLO jako čistou, protože
      // testovalo tu původní, rovnou (2589 mm² kolizí).
      for (const p of pts) {
        const floor = traceXAt(segs, p.z);
        if (floor !== null && floor > p.x) p.x = floor;
      }
      const fitted = fitArcsToPolyline(pts, 0.02);
      const out = [];
      for (const s of fitted) {
        if (s.type === 'line') out.push({ type: 'line', x1: s.p1.x, z1: s.p1.z, x2: s.p2.x, z2: s.p2.z });
        else out.push({ type: 'arc', x1: s.p1.x, z1: s.p1.z, x2: s.p2.x, z2: s.p2.z, cx: s.cx, cz: s.cz, r: s.r, dir: s.dir, startAngle: s.startAngle, endAngle: s.endAngle });
      }
      return out.length > 0 ? out : segs;
    };
    for (const p of passes) {
      if (p.type !== 'long') continue;
      if (p.contourLeadIn) p.contourLeadIn = envify(p.contourLeadIn);
      if (p.contourLeadOut) p.contourLeadOut = envify(p.contourLeadOut);
    }
}
