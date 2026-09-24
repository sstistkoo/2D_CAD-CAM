// ╔══════════════════════════════════════════════════════════════╗
// ║  PRAVIDLO 1 (docs/cam-pravidla.md): hranice úseku = PATA čáry  ║
// ║  zanoření, která VYJEDE z materiálu. Jinde se díl nedělí.      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Do 23. 9. 2026 se díl dělil i uprostřed údolí polotovaru a uprostřed hrbu
// kontury. Uživatel to zrušil: *„chci, aby si to dělení na půlku, ať již
// v údolí nebo na hrbu, zrušil, nic takového tam nechci"*. Tenhle test
// hlídá, že hranice leží JEN na patách čar zanoření (a že čára, která
// zůstane celá v polotovaru, díl nedělí).
//
// Implementace: `guideSplits` v js/calculators/cam/ops/long/regions.js.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fxDir = join(__dirname, 'fixtures', 'cam');

// Splity z guarded diagnostického háčku v computeRegions (Z je ve VNITŘNÍCH
// souřadnicích strategie — u hrubování zleva zrcadlených, viz zMirror.js).
async function runWithSplits(name) {
  const prog = JSON.parse(readFileSync(join(fxDir, `${name}.camprog`), 'utf8'));
  globalThis.__REGION_LOG__ = [];
  const res = await runCamProg(prog);
  const splits = (globalThis.__REGION_LOG__[globalThis.__REGION_LOG__.length - 1] || {}).splits || [];
  globalThis.__REGION_LOG__ = undefined;
  // Paty čar zanoření (konec blíž ose) v REÁLNÝCH souřadnicích.
  const feet = (res.calc.interferenceGuides || []).filter(g => g.kind === 'zanoreni')
    .map(g => (g.x1 <= g.x2 ? g.z1 : g.z2));
  return { splits, feet };
}

describe('Pravidlo 1: úseky se dělí jen na patě čáry zanoření', () => {
  for (const name of ['part-11-zleva-casting', 'range-end-leadout']) {
    it(`${name}: každá hranice leží na patě čáry zanoření`, async () => {
      const { splits, feet } = await runWithSplits(name);
      expect(splits.length, 'díl má čáry, které vyjedou z materiálu — hranice chybí').toBeGreaterThan(0);
      for (const s of splits) {
        expect(feet.some(f => Math.abs(Math.abs(f) - Math.abs(s.z)) < 0.2),
          `hranice Z ${s.z} neleží na patě žádné čáry zanoření: ${JSON.stringify(feet)}`).toBe(true);
      }
    }, 30000);
  }

  it('part-11-zleva: čára končící v materiálu (Z≈35) ani středy údolí (Z≈92, 172) díl nedělí', async () => {
    const { splits } = await runWithSplits('part-11-zleva-casting');
    const at = (z) => splits.some(s => Math.abs(Math.abs(s.z) - z) < 3);
    expect(at(35), JSON.stringify(splits)).toBe(false);
    expect(at(92), JSON.stringify(splits)).toBe(false);
    expect(at(172.5), JSON.stringify(splits)).toBe(false);
  }, 30000);

  it('range-end-leadout: středy údolí (Z≈92, 172,6) nejsou hranicí', async () => {
    const { splits } = await runWithSplits('range-end-leadout');
    expect(splits.some(s => Math.abs(s.z - 92) < 3), JSON.stringify(splits)).toBe(false);
    expect(splits.some(s => Math.abs(s.z - 172.6) < 3), JSON.stringify(splits)).toBe(false);
  }, 30000);
});
