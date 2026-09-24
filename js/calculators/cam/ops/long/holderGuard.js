// ╔══════════════════════════════════════════════════════╗
// ║  JEDINÁ KONTROLA DRŽÁKU — pravidlo 2 (docs/cam-pravidla.md)     ║
// ╚══════════════════════════════════════════════════════╝
// „Nástroj smí být jen tam, kde se vejde držák." Obrys držáku = nakreslený
// obrys + „Virt. zvětšení držáku" (`holderWorldLoop`), bez prostoru destičky
// (materiál u hrotu řeže destička). Materiál = to, co V TU CHVÍLI stojí:
// polotovar (offsetová čára) mínus všechno, co už ujely dřívější průchody
// (`passes`, v pořadí). Díl je v tom zahrnutý — ten nikdo neubírá.
//
// Do 23. 9. 2026 bylo v generátoru 12 různých kontrol držáku nad třemi
// modely materiálu a se třemi tolerancemi; jedna vjezd pustila a další ho
// o kus dál zahodila. Teď se každé místo (vjezd, rampa, řez, dojezd, kapsa)
// ptá TADY a dostane tutéž odpověď. Tolerance je jedna a stejná jako ve
// validátoru (0,5 mm²).

import { toolFootprint } from '../../materialRemoval.js';
import { ResidualTracker } from '../../residualTracker.js';
import { residualHolderLoop, holderAreaInResidual, holderAreaAlongResidual,
  RESIDUAL_FIT_TOL } from '../../residualHolder.js';
import { polyArea, polyIntersect, polyDifference, toolSweep } from '../../../../geom/geomCore.js';
import { HOLDER_CLAMP_MARGIN } from '../../toolEnvelope.js';

export const HOLDER_TOL = RESIDUAL_FIT_TOL;

/**
 * @param prms              parametry CAM
 * @param stockPathSegments segmenty polotovaru
 * @param seedLoop          offsetová čára CELÉHO polotovaru (bez ořezu rozsahem)
 * @param passes            živé pole průchodů — co je v něm, je už ujeté
 */
export function makeHolderGuard({ prms, stockPathSegments, seedLoop, passes }) {
  // Vypínač „Hlídat geometrii" (a testovací přepínač) vypne i tuhle kontrolu.
  const on = prms.respectInsertGeometry && !globalThis.__DISABLE_HOLDER_CLAMP__;
  const holderL = on ? residualHolderLoop(prms, false) : null;
  const foot = toolFootprint(prms);
  let tracker = null;
  if (holderL && seedLoop) {
    tracker = new ResidualTracker(prms, stockPathSegments, { seedLoop, footprint: foot });
    if (!tracker.valid) tracker = null;
  }
  // Model se plní LÍNĚ z prefixu `passes`. Pole se za běhu i přeskládává
  // a zkracuje, takže se porovnává identita objektů a při neshodě se model
  // postaví znovu (umí jen ubírat, ne vracet).
  let noted = [];
  const loops = () => {
    let same = noted.length <= passes.length;
    for (let i = 0; same && i < noted.length; i++) same = passes[i] === noted[i];
    if (!same) { tracker.noteAll([]); noted = []; }
    for (let i = noted.length; i < passes.length; i++) { tracker.notePass(passes[i]); noted.push(passes[i]); }
    return tracker.loops;
  };

  // Materiál jen v pásu, kam držák na dráze `pts` vůbec dosáhne (obrys držáku
  // + nástroj kolem ní). Všechny další polygonové operace pak běží nad malým
  // kusem místo nad celým dílem — jinak je tahle kontrola většina času výpočtu.
  const hb = holderL ? holderL.reduce((b, p) => ({
    x0: Math.min(b.x0, p.x), x1: Math.max(b.x1, p.x), z0: Math.min(b.z0, p.z), z1: Math.max(b.z1, p.z),
  }), { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity }) : null;
  const reach = foot ? foot.reduce((m, p) => Math.max(m, Math.abs(p.x), Math.abs(p.z)), 0) : 0;
  const near = (pts) => {
    const all = loops();
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    const m = reach + 1;
    const rect = [
      { x: Math.min(x0 + hb.x0, x0) - m, z: Math.min(z0 + hb.z0, z0) - m },
      { x: Math.max(x1 + hb.x1, x1) + m, z: Math.min(z0 + hb.z0, z0) - m },
      { x: Math.max(x1 + hb.x1, x1) + m, z: Math.max(z1 + hb.z1, z1) + m },
      { x: Math.min(x0 + hb.x0, x0) - m, z: Math.max(z1 + hb.z1, z1) + m },
    ];
    try { return polyIntersect(all, [rect]); } catch { return all; }
  };

  // Vnoření držáku se špičkou v (x, z) [mm²]. `ownCut` = úseky {x1,z1,x2,z2},
  // které TENTÝŽ zákrok ujel, než sem dojel (rampa, nájezd) — ty už nestojí.
  const area = (x, z, ownCut = null) => {
    if (!tracker) return 0;
    let stand = ownCut && ownCut.length > 0 ? near([{ x, z }, ...ownCut.flatMap(s => [{ x: s.x1, z: s.z1 }, { x: s.x2, z: s.z2 }]).filter(p => Number.isFinite(p.x) && Number.isFinite(p.z))]) : loops();
    if (ownCut && ownCut.length > 0) {
      const cuts = [];
      for (const s of ownCut) {
        if (![s.x1, s.z1, s.x2, s.z2].every(Number.isFinite)) continue;
        for (const l of toolSweep(foot, [{ x: s.x1, z: s.z1 }, { x: s.x2, z: s.z2 }]) || []) cuts.push(l);
      }
      if (cuts.length > 0) { try { stand = polyDifference(stand, cuts); } catch { /* bez odečtu = přísnější */ } }
    }
    return holderAreaInResidual(stand, holderL, x, z);
  };
  const fits = (x, z, ownCut = null) => area(x, z, ownCut) <= HOLDER_TOL;

  // Nejhorší vnoření PODÉL dráhy špičky `pts` (v pořadí jízdy); vlastním
  // řezem je v každém bodě ta část dráhy, kterou už má nástroj za sebou.
  const areaAlong = (pts, abortAbove = Infinity) => {
    if (!tracker || !Array.isArray(pts)) return 0;
    if (pts.length === 1) return area(pts[0].x, pts[0].z);
    return holderAreaAlongResidual(near(pts), holderL, pts,
      { ownFoot: foot, step: 1, maxSamples: 128, abortAbove });
  };

  // Ořez ŘEZU na hloubce X od zStart doleva: null = už začátek je zakázaný,
  // jinak nejnižší zEnd, kam průchod dojede, aniž by držák vjel do materiálu.
  // Rozhraní shodné s dřívější statickou obálkou (`makeHolderClamp`).
  const swept = (X, z1, z2) => {
    if (Math.abs(z1 - z2) < 1e-9) return area(X, z1);
    try {
      const path = [{ x: X, z: z1 }, { x: X, z: z2 }];
      const sw = toolSweep(holderL, path);
      if (!sw || sw.length === 0) return 0;
      const stand = polyDifference(near(path), toolSweep(foot, path));
      return stand && stand.length ? Math.abs(polyArea(polyIntersect(stand, sw))) : 0;
    } catch { return Math.max(area(X, z1), area(X, z2)); }
  };
  const clamp = !tracker ? null : (X, zStart, zEnd) => {
    if (![X, zStart, zEnd].every(Number.isFinite) || !(zStart > zEnd)) return zEnd;
    if (area(X, zStart) > HOLDER_TOL) return null;
    if (swept(X, zStart, zEnd) <= HOLDER_TOL) return zEnd;
    let good = zStart, bad = zEnd;
    for (let i = 0; i < 24 && good - bad > 0.01; i++) {
      const mid = (good + bad) / 2;
      if (swept(X, zStart, mid) > HOLDER_TOL) bad = mid; else good = mid;
    }
    const z = bad + HOLDER_CLAMP_MARGIN;
    return z >= zStart ? null : Math.max(zEnd, z);
  };
  if (clamp) {
    clamp.isForbidden = (x, z) => area(x, z) > HOLDER_TOL;
    clamp.isForbiddenSoft = clamp.isForbidden;
  }

  // Nejpravější z ≤ zFrom (po 1 mm, pak půlením na 0,05 mm), kde se držák
  // se špičkou na hloubce X vejde. null = v okně nikde.
  const firstFitZ = (X, zFrom, zFloor) => {
    if (fits(X, zFrom)) return zFrom;
    let zNo = zFrom, zFit = null;
    for (let z = zFrom - 1; z > zFloor; z -= 1) {
      if (fits(X, z)) { zFit = z; break; }
      zNo = z;
    }
    if (zFit === null) return null;
    while (zNo - zFit > 0.05) {
      const zm = (zNo + zFit) / 2;
      if (fits(X, zm)) zFit = zm; else zNo = zm;
    }
    return zFit;
  };

  return { active: !!tracker, area, fits, areaAlong, clamp, firstFitZ };
}
