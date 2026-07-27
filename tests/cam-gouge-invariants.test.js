// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – řezné pohyby nesmí podjet hotovní konturu (zajezd)     ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Model-free pojistka nad EMITOVANOU dráhou (calcSim.simPath), stejný vzor
// jako cam-traversal-invariants: programovaný bod (STŘED špičky) nesmí ležet
// pod dráhou středu špičky hotovní kontury — tj. uvnitř hotového dílu.
//
// Historie: dojezd „bez schodků" u strmé stěny mířil rampou pod úhlem
// zanoření tam, kde přímka OPUSTÍ SILUETU POLOTOVARU (findRampOutTarget) —
// hotovní konturu netestoval vůbec. Na dílech, kde za údolím kontura zase
// stoupá, vedla rampa i navazující dokončovací kroky SKRZ díl: 6 z 12
// fixtures mělo zajezd desítky mm (rampa dojela až na X≈−1, tj. za osu),
// reálný díl uživatele 18 mm. Test tuhle třídu chyb zamyká.
//
// Kritérium má DVĚ podmínky, protože ani jedna sama nestačí:
//   1. bod leží pod max X offsetu na svém Z  (replika `offsetXAt`/`blockedAt`),
//   2. a zároveň NELEŽÍ na offsetu (> 0,15 mm od něj).
// Bez (2) by test falešně hlásil díl se ZÁPICHEM: dojezd po kontuře uvnitř
// zápichu je legitimně pod maximem offsetu na tomtéž Z, ale jede PO profilu.
// Uzavřená silueta offsetu (`offsetSilhouetteLoop`) se pro bodový test použít
// nedá — u kapes/zápichů se sama protíná, takže `pointInLoop` lže.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { isAngleBetween } from '../js/calculators/cam/camMath.js';
import { _defaultCamParams } from '../js/calculators/cam/camDefaults.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures', 'cam');
// Jen PODÉLNÉ fixtures: u čelní strategie špička dojíždí až na osu, kde je
// silueta uzavřená k ose — čelo by se hlásilo jako zajezd (hlídá ho jiná cesta).
const fixtures = readdirSync(fixturesDir).filter(f => f.endsWith('.camprog')).sort()
  .filter(f => (JSON.parse(readFileSync(join(fixturesDir, f), 'utf8')).params || {}).roughingStrategy !== 'face');

// Replika offsetXAt/maxXAt z calculatePipeline.js (max X dráhy STŘEDU špičky
// na daném Z; null = na tomhle Z kontura není).
function maxXAt(segs, z) {
  let maxX = null;
  for (const seg of segs) {
    if (seg.isDegenerate) continue;
    if (seg.type === 'line') {
      const zMin = Math.min(seg.p1.z, seg.p2.z), zMax = Math.max(seg.p1.z, seg.p2.z);
      if (z < zMin - 0.01 || z > zMax + 0.01) continue;
      const dz = seg.p2.z - seg.p1.z;
      const x = Math.abs(dz) < 1e-6
        ? Math.max(seg.p1.x, seg.p2.x)
        : seg.p1.x + ((z - seg.p1.z) / dz) * (seg.p2.x - seg.p1.x);
      if (maxX === null || x > maxX) maxX = x;
    } else if (seg.type === 'arc') {
      const cosA = (z - seg.cz) / seg.r;
      if (cosA < -1.001 || cosA > 1.001) continue;
      const a1 = Math.acos(Math.max(-1, Math.min(1, cosA)));
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

/** Offsetová dráha navzorkovaná na lomenou čáru (pro měření vzdálenosti). */
function samplePath(segs) {
  const pts = [];
  for (const s of segs) {
    if (s.isDegenerate) continue;
    if (s.type === 'line') { pts.push({ x: s.p1.x, z: s.p1.z }, { x: s.p2.x, z: s.p2.z }); continue; }
    let sA = s.startAngle, eA = s.endAngle;
    if (s.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
    if (s.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
    const n = Math.max(2, Math.ceil(s.r * Math.abs(eA - sA) / 0.2));
    for (let j = 0; j <= n; j++) {
      const a = sA + (eA - sA) * (j / n);
      pts.push({ x: s.cx + Math.sin(a) * s.r, z: s.cz + Math.cos(a) * s.r });
    }
  }
  return pts;
}

/** Vzdálenost bodu od navzorkované dráhy (nejbližší úsečka). */
function distToPath(p, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
    let t = L2 > 0 ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
    if (d < best) best = d;
  }
  return best;
}

function worstPenetration(calc, calcSim) {
  const path = (calc.finishOffsetPath && calc.finishOffsetPath.length)
    ? calc.finishOffsetPath : calc.offsetPath;
  const poly = samplePath(path);
  const sp = calcSim.simPath || [];
  let worst = 0, where = null;
  for (let i = 1; i < sp.length; i++) {
    if ((sp[i].type || 'G0') === 'G0') continue;
    const a = sp[i - 1], b = sp[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
      if (p.x <= 1) continue;                       // čelní pohyby u osy
      const o = maxXAt(path, p.z);
      if (o === null) continue;
      const d = o - p.x;
      if (d <= worst || d <= 0.05) continue;
      if (distToPath(p, poly) <= 0.15) continue;    // jede PO profilu (zápich, dojezd)
      worst = d; where = `X${p.x.toFixed(2)} Z${p.z.toFixed(2)}`;
    }
  }
  return { worst, where };
}

// part-10 (zápich): zbytek je ARTEFAKT 1-D měření u SVISLÉ stěny zápichu —
// špička stojí na patě stěny a `maxXAt` na témž Z (tolerance 0,01 mm) vrátí
// vršek té stěny. Ověřeno proti modelu úběru: do hotového dílu zasahuje
// 0,02 mm², tj. reálně nic. Hodnota je tu proto přišpendlená, ne skrytá.
const KNOWN = { 'part-10-zapich-casting.camprog': 2.5 };
const LIMIT = 0.5;

describe('CAM: řezné pohyby nepodjíždějí hotovní konturu', () => {
  for (const file of fixtures) {
    it(`${file} → zajezd pod konturu < ${KNOWN[file] ?? LIMIT} mm`, async () => {
      const prog = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'));
      // DETERMINISMUS: `runCamProg` params jen MERGUJE do singletonu `S`, takže
      // klíč, který fixture nemá, propadne z předchozího .camprog v témž
      // workeru (zLimits/xLimits stejně tak) — pořadí testů by měnilo výsledek.
      prog.params = { ..._defaultCamParams(), ...prog.params };
      prog.zLimits = { chuck: null, tail: null, chuckActive: false, tailActive: false,
        rangeStart: null, rangeEnd: null, rangeActive: false, ...(prog.zLimits || {}) };
      prog.xLimits = { rangeXMin: null, rangeXMax: null, active: false, ...(prog.xLimits || {}) };
      // Regiony vynuceně ZAP: region-cesta pouští dojezd strmé stěny nejdál,
      // takže právě ona musí být pod dohledem.
      prog.params.regionRoughing = true;
      const { calc, calcSim } = await runCamProg(prog);
      const { worst, where } = worstPenetration(calc, calcSim);
      expect(worst, `nejhlubší zajezd ${worst.toFixed(2)} mm @ ${where}`)
        .toBeLessThan(KNOWN[file] ?? LIMIT);
    });
  }
});
