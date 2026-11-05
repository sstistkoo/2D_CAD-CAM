// ╔══════════════════════════════════════════════════════════════╗
// ║  CIK CAK — materiál za začátkem úseku (do stěny za hranicí)    ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Karusel Od středu 5. 11. 2026, díl (9), Úsek 3: kapsa pod šikmou stěnou
// S12–S13 za hranicí Ú2/Ú3 (X 673–706) — Ú2 ji nebere (vlevo ji neohraničuje
// stěna, jen hranice úseku → patří dalšímu úseku, pravidlo 20), Ú3 jel
// vrstvy jen po svou hranici. Zůstal klín 30 mm (dokončování by do něj
// najelo), nebo — když spodek cik cak za hranici dojel — začínal pod
// materiálem a sjížděl k němu svisle posuvem (N4400 G1 Z77.571, 60 mm).
//
// Materiál, který za začátkem úseku (z > zHi, strana začátku obrábění) ještě
// stojí nad hrubovacím offsetem, vezme úsek sám cik cakem shora: vrstvy po
// ap od stěny k hranici a zpět, poslední po dně (pravidla 1 a 20 — spodek až
// ke stěně i za hranicí). Jen ta část, kterou už nejede jiný průchod (spodek
// cik cak za hranici). Jede se jako PRVNÍ v úseku — leží nejvíc na straně
// začátku (pravidlo 7) a vrstvy úseku pak u hranice nevyjíždějí posuvem
// materiálem nad sebou (dřív N190 G1 Z141.110 „Výjezd materiálem posuvem").
//
// Prostor středu nosu, jízda −Z (zleva je svět zrcadlený), strana začátku =
// vyšší z. `stock` = polotovar úseku (po předchozím úseku obrobený).

import { maxXAt } from '../passHelpers.js';
import { wallFinders, buildZigzag } from './zigzagFloor.js';
import { gouges } from './zigzagValley.js';

const DS = 0.25;

/** Nejvyšší z podélné vrstvy i s rampou a nájezdem (soustruh: rampy za hranicí). */
function zMaxLong(p) {
  const zs = [p.zStart, p.zEnd];
  for (const s of [...(p.contourLeadIn || []), ...(p.contourLeadOut || [])]) zs.push(s.z1, s.z2);
  if (p.ramp) zs.push(p.ramp.z0);
  return Math.max(...zs.filter(Number.isFinite));
}

/**
 * @param {object} o { passes, start, raw, stock, noseR, step, tanA, zHi, noSteps }
 * @returns {number} počet vložených průchodů
 */
export function zigzagBeyondStart({ passes, start = 0, raw, stock, noseR = 0, step, tanA, zHi, noSteps = false }) {
  if (!Array.isArray(passes) || !raw || !Array.isArray(stock) || !stock.length) return 0;
  if (!Number.isFinite(zHi) || !(step > 0) || !(tanA > 0)) return 0;
  const W = wallFinders(raw);
  // Vrch materiálu v prostoru středu nosu (nos na polotovaru shora).
  const top = (z) => { const v = maxXAt(stock, z); return v === null ? -Infinity : v + noseR; };
  // Pás za hranicí, kde polotovar stojí nad offsetem — až ke stěně (offset se
  // zvedne k polotovaru) nebo ke konci polotovaru.
  let zB = null, Tc = -Infinity, floor = Infinity;
  for (let z = zHi + DS; z <= zHi + 5000; z += DS) {
    const t = top(z), f = W.fR(z);
    if (!(t > f + 0.5)) break;
    zB = z; Tc = Math.max(Tc, t); floor = Math.min(floor, f);
  }
  if (zB === null || zB - zHi < 1 || !(Tc - floor > 0.5)) return 0;

  // Co z pásu už jede jiný průchod: `cov` = výška, odkud dolů ho bere.
  // Spodek cik cak za hranicí začíná na své výšce `xTop` (G0 u stěny) a čeká
  // nad sebou volno — kapsa musí dojet přesně na ni (dřív skončila o 6,5 mm
  // výš a spodek se k začátku zanořil svisle). Podélná vrstva bere ap nad sebou.
  let cov = -Infinity;
  for (let i = start; i < passes.length; i++) {
    const p = passes[i];
    if (!p) continue;
    let x = -Infinity;
    if (p.type === 'long' && Number.isFinite(p.x) && zMaxLong(p) > zHi + 1) x = p.x + step;
    else if (p.type === 'zigzag' && Array.isArray(p.moves)) {
      for (const m of p.moves) if (m.z > zHi + 1 && m.z < zB + 1) x = Math.max(x, m.x);
    }
    // Průchod začínající nad vrchem materiálu bere celý pás (soustruh zleva,
    // díl (10), Ú2: spodek údolí od X135 byl vynechán a kapsa za hranicí
    // jela navíc — údolí „rozdělené uprostřed").
    if (x > -Infinity) cov = Math.max(cov, Math.min(x, Tc));
  }
  // Nad `cov` jen tenký zbytek (soustruh, Ú2: 0,36 mm nad začátkem spodku) —
  // vezme ho příjezd spodku, vrstva navíc ne.
  if (Tc - cov <= 0.5 * step) return 0;

  const minF = floor;
  const layers = [];
  const layerAt = (X) => {
    const b = W.wallRight(X, zHi, zB + 1) ?? zB;
    return b - zHi < 1 ? null : { X, a: zHi, b };
  };
  for (let k = 1; k < 200; k++) {
    let X = Tc - k * step;
    if (X <= cov + 0.3) {
      // Poslední vrstva přesně na `cov` (začátek spodku / ap nad vrstvou).
      const last = layers[layers.length - 1];
      if (!last || last.X - cov > 0.3) { const L = layerAt(cov); if (L) layers.push(L); }
      break;
    }
    const bottom = X <= minF + 0.02;
    if (bottom) X = minF + 0.02;
    if (bottom) {
      // Po dně (šikmé dno klesá k hranici — na výšce nejnižšího místa by
      // „stěna" byla hned u hranice): rozpětí předchozí vrstvy, jízda po
      // offsetu nanejvýš v její výšce (jako kapsy pod spodkem).
      const last = layers[layers.length - 1];
      const P = last || layerAt(X + step);
      if (P) layers.push({ X, a: zHi, b: P.b, follow: true, top: last ? last.X : X + step });
      break;
    }
    const L = layerAt(X);
    if (!L) break;
    layers.push(L);
  }
  if (!layers.length) return 0;
  const reach = 4 * step / Math.max(tanA, 0.2) + 2;
  let use = layers.slice(), zz = null;
  while (use.length) {
    zz = buildZigzag({ layers: use, xTop: Tc, tanA, reach, noSteps, W });
    if (!gouges(zz[0].moves, W.fR)) break;
    use.pop(); zz = null;
  }
  if (!zz) return 0;
  zz.forEach((p) => { p.beyondStart = true; });
  passes.splice(start, 0, ...zz);
  return zz.length;
}
