// ╔══════════════════════════════════════════════════════════════╗
// ║  Úseky = pravidlo 1: pata čáry zanoření, která VYJEDE z materiálu ║
// ╚══════════════════════════════════════════════════════════════╝
//
// docs/cam-pravidla.md, pravidlo 1: „Díl se rozdělí na úseky. Úsek končí
// tam, kde čára zanoření vyjede z materiálu." Hranice leží na PATĚ té čáry;
// čára, která z materiálu nevyjede, díl nedělí; jiné dělení neexistuje —
// nikdy uprostřed údolí ani uprostřed hrbu.
//
// Do 24. 9. 2026 se dělilo i uprostřed údolí polotovaru (Z≈92 / 172 na
// obou fixtures níž) a uprostřed hrbu kontury. Tenhle test hlídá, že to
// nevrátí: hranice jsou PŘESNĚ paty čar, které vyjedou.
//
// Implementace: js/calculators/cam/ops/long/sectionFeet.js (táž funkce
// měří i scripts/cam_rules_check.mjs).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fxDir = join(__dirname, 'fixtures', 'cam');

// Hranice z guarded diagnostického háčku v computeRegions (Z je ve VNITŘNÍCH
// souřadnicích strategie — u hrubování zleva zrcadlených, viz zMirror.js).
async function splitsOf(name) {
  const prog = JSON.parse(readFileSync(join(fxDir, name), 'utf8'));
  globalThis.__REGION_LOG__ = [];
  const res = await runCamProg(prog);
  const splits = (globalThis.__REGION_LOG__[globalThis.__REGION_LOG__.length - 1] || {}).splits || [];
  globalThis.__REGION_LOG__ = undefined;
  return { ...res, zs: splits.map(s => s.z).sort((a, b) => b - a) };
}

describe('Úseky hrubování: jen pata čáry zanoření, která vyjede z materiálu', () => {
  it('part-11-zleva: hranice na patách Z 82 / 143,6 / 265,4 — v údolích Z 35 / 92 / 172 ne', async () => {
    const { zs } = await splitsOf('part-11-zleva-casting.camprog');
    // Zrcadlené Z (hrubování zleva).
    expect(zs).toEqual([-82, -143.6, -265.4]);
  }, 60000);

  it('range-end-leadout: hranice na patách Z 195,3 / 107,2 — v údolích Z 92 / 172,6 ne', async () => {
    const { zs } = await splitsOf('range-end-leadout.camprog');
    expect(zs).toEqual([195.3, 107.2]);
  }, 60000);
});
