// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – kulatá R 10: údolí za hrbem jede vrstvami až na dno     ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Nález uživatele 26. 9. 2026: v údolí vlevo od hrbu (Z 195…221) skončily
// vrstvy na `N1900 G1 Z195.278` (X 50,545), přestože pod nimi bylo ještě
// 10 mm materiálu a místa dost. Hlídání držáku (`ops/long/holderFit.js`)
// bralo vyříznutou podlahu v souřadnicích DRÁHY (střed nosu) jako povrch —
// vrstva přes vrchol hrbu `N380 G1 X60.581 Z216.792` se tak zapsala jako
// „materiál do X 60,58", o celé R výš, než kam doopravdy řezala, a držák
// hlubších vrstev do toho domnělého materiálu „narazil".
//
// Druhý nález na témže místě: dobírací řetěz ořízlé rampy
// (`pendingRampCompletions`) projel celé údolí ještě jednou vzduchem —
// „Průchod 36 (oblouk G3)" + „zanoření v kapse" po týchž vrstvách.
//
// Fixture leží v `tests/fixtures/cam-cases/`, ne v plošné sadě: díl má jinde
// zbytkové nálezy s jinou příčinou (drážka Z 148…205 pod přírubou, klín pod
// přímkou zanoření u boku hrbu), které tahle oprava neřeší.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures', 'cam-cases', 'round-r10-valley-holder.camprog');
const loadProg = () => JSON.parse(readFileSync(FIXTURE, 'utf8'));

// Údolí za hrbem: vrstvy začínají na přímce zanoření z rohu hrbu a končí na
// hranici úseku (Z 195,278). Dno údolí v souřadnicích dráhy: X 30,156 +
// přídavek 0,5 + R 10 = 40,656.
const inValley = (p) => p.type === 'long' && Number.isFinite(p.x)
  && Math.abs(p.zEnd - 195.278) < 0.01 && p.zStart > 195.5 && p.zStart < 216;

describe('CAM: kulatá R 10 — údolí za hrbem (hlídání držáku, střed nosu × povrch)', () => {
  it('vrstvy v údolí sjedou až na jeho dno, ne jen 4 pod vrchol hrbu', async () => {
    const { calc, params } = await runCamProg(loadProg());
    expect(params.toolShape).toBe('round');
    const xs = calc.passes.filter(inValley).map(p => p.x);
    // Dřív nejhlubší vrstva X 50,545 (4 vrstvy); teď až k dnu údolí.
    expect(Math.min(...xs)).toBeLessThan(41);
    for (const x of [58.045, 55.545, 53.045, 50.545, 48.045, 45.545, 43.045, 40.545]) {
      expect(xs.some(v => Math.abs(v - x) < 0.01), `chybí vrstva X ${x}`).toBe(true);
    }
  });

  it('žádná vrstva údolí se nejede dvakrát', async () => {
    const { calc } = await runCamProg(loadProg());
    const seen = new Map();
    const dup = [];
    for (const p of calc.passes.filter(inValley)) {
      const k = p.x.toFixed(3);
      if (seen.has(k)) dup.push(`X ${k}`);
      seen.set(k, true);
    }
    expect(dup, `vrstvy údolí vydané dvakrát: ${dup.join(', ')}`).toEqual([]);
  });

  it('hlubší vrstvy nevjedou držákem do materiálu', async () => {
    const run = await runCamProg(loadProg());
    const issues = validateToolpath(run.calcSim.simPath, run.params, run.calc.stockPathSegments,
      { planStock: true });
    const atValley = issues.filter(i => (i.z ?? 0) > 185 && (i.z ?? 0) < 235);
    expect(atValley.length, `nálezy v údolí: ${JSON.stringify(atValley.map(i => ({ k: i.kind, z: +(i.z || 0).toFixed(1), a: +(i.area || 0).toFixed(1) })))}`).toBe(0);
  });
});
