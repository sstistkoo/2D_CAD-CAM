// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – obrys UPICHOVÁKU nesmí zasáhnout do hotového dílu      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Sesterský invariant k `cam-gouge-invariants`, ale o patro přísnější.
// Ten měří PROGRAMOVANÝ BOD (střed nosu) proti dráze středu nosu hotovní
// kontury — u upichováku to nestačí: plátek řeže CELOU spodní hranou šířky b
// a jeho tělo sahá od −R za špičkou po (b − R) před ní (`inserts/parting.js`).
// Špička tedy může sedět na offsetu PŘESNĚ a plátek přitom o čtyři milimetry
// dál ukrojit kus dílu.
//
// Nález uživatele 1. 9. 2026 (⌀111 × 350, upichovák b = 5, podélně zleva):
//
//   N1770 G1 X40.545 Z133.314 ; Rampa 90.0°
//
// Špička X40,545 = offset na Z133,314 (40,545) na tisícinu přesně. Jenže
// obrys plátku sahá na Z129,114, kde offset stojí na 41,295 — spodní ostří
// (X39,745) tam bylo 0,33 mm POD konturou a ukrojilo 0,18 mm² z hotového
// dílu. Hlídání `clampPartingBody` (ops/long/intervalScan.js) tehdy testovalo
// stěnu JEDINÝM bodem 0,05 mm nad začátkem intervalu; na kuželu ~10° od osy
// tam offset stoupne o 0,009 mm, tedy pod řeznou tolerancí 0,01 — minulo to
// o 1,1 µm. Test se od té doby ptá celého okna těla.
//
// PROČ TO NEUVIDÍ VALIDÁTOR (⛔ panel): ten hlídá POLOTOVAR a DRŽÁK, tedy
// „narazil jsem do něčeho, co tam stojí". Zajezd do HOTOVÉHO TVARU je opačná
// otázka — materiál tam být má a nikdo do něj nesmí. Na dílu uživatele
// hlásil validátor nula nálezů a plátek přitom v dílu byl.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { insertWorldLoop } from '../js/calculators/cam/materialRemoval.js';
import { polyArea, polyIntersect } from '../js/geom/geomCore.js';
import { isAngleBetween } from '../js/calculators/cam/camMath.js';
import { _defaultCamParams } from '../js/calculators/cam/camDefaults.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures', 'cam');
// Jen UPICHOVÁK: ostatní tvary se tělem do kolizní obálky nepočítají
// (`inserts/*.js`) a jejich nos hlídá `cam-gouge-invariants`.
const fixtures = readdirSync(fixturesDir).filter(f => f.endsWith('.camprog')).sort()
  .filter(f => (JSON.parse(readFileSync(join(fixturesDir, f), 'utf8')).params || {}).toolShape === 'parting');

/** Kontura navzorkovaná na body (oblouky po ~0,15 mm tětivy). */
function samplePart(segs) {
  const pts = [];
  for (const s of segs || []) {
    if (s.isDegenerate) continue;
    if (s.type === 'line') { pts.push({ x: s.p1.x, z: s.p1.z }, { x: s.p2.x, z: s.p2.z }); continue; }
    let a1 = s.startAngle, a2 = s.endAngle;
    if (s.dir === 'G2' && a2 > a1) a2 -= 2 * Math.PI;
    if (s.dir === 'G3' && a2 < a1) a2 += 2 * Math.PI;
    const n = Math.max(8, Math.ceil(s.r * Math.abs(a2 - a1) / 0.15));
    for (let j = 0; j <= n; j++) {
      const a = a1 + (a2 - a1) * (j / n);
      pts.push({ x: s.cx + Math.sin(a) * s.r, z: s.cz + Math.cos(a) * s.r });
    }
  }
  return pts;
}

/** Max X kontury na daném Z (replika `maxXAt` z calculatePipeline). */
function maxXAt(segs, z) {
  let m = null;
  for (const s of segs || []) {
    if (s.isDegenerate) continue;
    if (s.type === 'line') {
      const lo = Math.min(s.p1.z, s.p2.z), hi = Math.max(s.p1.z, s.p2.z);
      if (z < lo - 0.01 || z > hi + 0.01) continue;
      const dz = s.p2.z - s.p1.z;
      const x = Math.abs(dz) < 1e-6
        ? Math.max(s.p1.x, s.p2.x)
        : s.p1.x + ((z - s.p1.z) / dz) * (s.p2.x - s.p1.x);
      if (m === null || x > m) m = x;
    } else {
      const c = (z - s.cz) / s.r;
      if (c < -1.001 || c > 1.001) continue;
      const a1 = Math.acos(Math.max(-1, Math.min(1, c)));
      for (const a of [a1, -a1]) {
        if (!isAngleBetween(a, s.startAngle, s.endAngle, s.dir === 'G2')) continue;
        const x = s.cx + Math.sin(a) * s.r;
        if (m === null || x > m) m = x;
      }
    }
  }
  return m;
}

// Vzorkování dráhy po 0,5 mm — nález měl v ose Z rozsah přes 1 mm, takže
// hrubší krok by ho mohl přeskočit.
const STEP = 0.5;
// Polygonový průnik je drahý, takže se pouští jen tam, kde vůbec MŮŽE něco
// vyjít: hrubý 1-D test „sahá kontura v okně plátku výš než jeho spodní
// ostří?" odfiltruje drtivou většinu dráhy (nástroj se pohybuje nad
// polotovarem, ne u kontury).
const PREFILTER = 0.2;
// Práh nálezu: Clipper + vzorkování oblouků tětivami dávají zbytkové
// desetitisíciny mm². Nález, kvůli kterému test vznikl, byl 0,18 mm²,
// tedy o dva řády výš.
const LIMIT = 0.05;

describe('CAM: obrys upichovacího plátku nezajíždí do hotového dílu', () => {
  for (const file of fixtures) {
    it(`${file} → průnik plátku s dílem < ${LIMIT} mm²`, async () => {
      const prog = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'));
      // DETERMINISMUS: `runCamProg` params jen MERGUJE do singletonu `S`
      // (viz cam-gouge-invariants) — chybějící klíč by propadl z předchozí
      // fixture v témž workeru.
      prog.params = { ..._defaultCamParams(), ...prog.params };
      prog.zLimits = { chuck: null, tail: null, chuckActive: false, tailActive: false,
        rangeStart: null, rangeEnd: null, rangeActive: false, ...(prog.zLimits || {}) };
      prog.xLimits = { rangeXMin: null, rangeXMax: null, active: false, ...(prog.xLimits || {}) };
      const { calc, calcSim, params } = await runCamProg(prog);

      const pts = samplePart(calc.contourSegments);
      expect(pts.length, 'kontura je prázdná — fixture nic neměří').toBeGreaterThan(2);
      // Hotový díl = kontura uzavřená k ose (materiál leží pod ní).
      const part = [...pts, { x: 0, z: pts[pts.length - 1].z }, { x: 0, z: pts[0].z }];

      const ins = insertWorldLoop(params, (params.roughingSide || 'right') === 'left');
      expect(ins && ins.length >= 3, 'obrys plátku se nepodařilo sestavit').toBe(true);
      const zLo = Math.min(...ins.map(p => p.z)), zHi = Math.max(...ins.map(p => p.z));
      const xLo = Math.min(...ins.map(p => p.x));

      const sp = calcSim.simPath || [];
      let worst = 0, where = null;
      for (let i = 1; i < sp.length; i++) {
        if ((sp[i].type || 'G0') === 'G0') continue;      // rychloposuv řeší validátor
        const a = sp[i - 1], b = sp[i];
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / STEP));
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
          if (p.x < 0.5) continue;                        // pohyby u osy (čelo)
          // Předfiltr: nejvyšší kontura přes okno plátku proti jeho spodku.
          let top = null;
          for (let d = zLo; d <= zHi + 1e-9; d += 0.5) {
            const c = maxXAt(calc.contourSegments, p.z + d);
            if (c !== null && (top === null || c > top)) top = c;
          }
          if (top === null || top < p.x + xLo - PREFILTER) continue;
          const loop = ins.map(q => ({ x: q.x + p.x, z: q.z + p.z }));
          let area = 0;
          try { area = Math.abs(polyArea(polyIntersect([loop], [part]))); } catch { area = 0; }
          if (area > worst) { worst = area; where = `X${p.x.toFixed(3)} Z${p.z.toFixed(3)}`; }
        }
      }
      expect(worst, `plátek v dílu ${worst.toFixed(3)} mm² @ ${where}`).toBeLessThan(LIMIT);
    });
  }
});
