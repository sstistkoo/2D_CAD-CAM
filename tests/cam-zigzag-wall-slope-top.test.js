// Jízda po stěně spodku cik caku začíná na VRCHOLU svahu, který končí plošinou
// pod výškou nad první vrstvou (audit CAM 27. 11. 2026, pravidlo 3).
//
// Karusel center-ap10 (prohozené osy: x = výška, z = poloměr): svah 25°
// r396–447 stoupá do plošiny h63 (offset h68,2), vrstvy jsou h71 / 61 / 51.
// Stěna ve výšce 71 neexistuje (svah končí na 68,2), takže hledání stěny nic
// nenašlo a jízda začala na konci vrstvy h61 (r430,5) — klín mezi svahem
// a plošinou r434–447 (až 5 mm nad přídavkem) nevzal nikdo. Teď jízda začne
// na vrcholu svahu, svisle dosedne na offset (výjimka pravidla 20, nejvýš ap)
// a jede po svahu dolů.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runCamProg } from './helpers/camHeadless.mjs';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cam-cases');

describe('cik cak: jízda po stěně od vrcholu svahu', () => {
  it('center-ap10: jízda po svahu začíná u plošiny (r ≈ 445,8, h 68,2)', async () => {
    const prog = JSON.parse(readFileSync(join(DIR, 'carousel-zigzag-center-ap10.camprog'), 'utf8'));
    const r = await runCamProg(prog);
    const c = r.calc._xz ? r.calc._xz.calc : r.calc;
    const wall = c.passes.find(p => p.type === 'zigzag' && p.wallClean && p.moves.some(m => m.z > 400 && m.z < 450));
    expect(wall, 'jízda po svahu chybí').toBeTruthy();
    const [g0, seat] = wall.moves;
    expect(g0.g).toBe('G0');
    expect(g0.z).toBeGreaterThan(445);
    expect(g0.z).toBeLessThan(447);
    // svislé dosednutí na offset plošiny, nejvýš o ap (10)
    expect(seat.g).toBe('G1');
    expect(seat.z).toBeCloseTo(g0.z, 6);
    expect(g0.x - seat.x).toBeLessThanOrEqual(10);
    expect(seat.x).toBeCloseTo(68.2, 1);
  }, 120000);

  // Svislé dosednutí jen do ap: `xTop` může ležet vysoko ve vzduchu a pod ním
  // víc vrstev — tam se vrchol svahu nebere (po-x: dosednutí bylo 8,9 mm při
  // ap 2, revize 27. 11. 2026).
  for (const name of ['carousel-zigzag-center-ap10', 'carousel-zigzag-po-x', 'carousel-zigzag-valley', 'lathe-zigzag-left-10']) {
    it(`${name}: svislé dosednutí jízdy po stěně nejvýš o ap`, async () => {
      const prog = JSON.parse(readFileSync(join(DIR, `${name}.camprog`), 'utf8'));
      const ap = parseFloat(prog.params.depthOfCut);
      const r = await runCamProg(prog);
      const c = r.calc._xz ? r.calc._xz.calc : r.calc;
      for (const p of c.passes.filter(q => q.type === 'zigzag' && q.wallClean)) {
        const [g0, m1] = p.moves;
        if (m1 && m1.g === 'G1' && Math.abs(m1.z - g0.z) < 1e-6) expect(g0.x - m1.x, name).toBeLessThanOrEqual(ap + 0.05);
      }
    }, 120000);
  }
});
