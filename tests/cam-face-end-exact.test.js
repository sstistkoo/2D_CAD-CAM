// ╔══════════════════════════════════════════════════════════════╗
// ║  Konec vrstvy u svislého čela + dojezd po čele od hloubky      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Audit CAM 26. 11. 2026 (pravidla 3 a 9):
//  1. Oblast dílce pro booleovské intervaly (`sampleOffsetRegion`) je
//     vzorkovaná po 0,2 mm, takže čelo (vodorovný úsek offsetu) je v ní šikmá
//     hrana. Konce vrstev u čela ležely na přímce (part-1 Z257,430 … 257,614
//     při offsetu Z257,514) — hlubší vrstvy zajely do přídavku, mělčí nechaly
//     až 0,1 mm, kontrola hlásila třísku 3,09 při ap 3. Konec se teď dopřesní
//     na skutečný dotyk (`booleanScanIntervals`, ops/long/intervalScan.js).
//  2. Dojezd po čele vydal traceOffsetPath celý OD OSY (`x1 = 0`). Emise jede
//     od konce průchodu, ale pravidlo 9 (realStock.js) bralo, že průchod
//     přejel celé čelo, a vrstvy pod ním zahodilo jako „nic neuberou" — díl
//     bez díry tak dřív obrobil pás před čelem jen díky šikmým koncům (1.).
//     Začátek dojezdu se ořízne na hloubku průchodu (`clipLeadOutToDepth`).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { clipLeadOutToDepth } from '../js/calculators/cam/ops/shared.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('konce vrstev u svislého čela', () => {
  it('part-1: všechny vrstvy pod čelem končí na offsetu čela (do 0,011)', async () => {
    const prog = JSON.parse(readFileSync(join(here, 'fixtures/cam/part-1.camprog'), 'utf8'));
    const r = await runCamProg(prog);
    const ends = r.calc.passes.filter(p => p.type === 'long' && p.x > 1 && p.x < 31 && p.zEnd > 255 && p.zEnd < 260).map(p => p.zEnd);
    expect(ends.length).toBeGreaterThanOrEqual(8);
    for (const z of ends) {
      expect(z, 'vrstva zajela za offset čela').toBeGreaterThanOrEqual(257.514 - 1e-6);
      expect(z, 'vrstva skončila před čelem').toBeLessThanOrEqual(257.514 + 0.011);
    }
  }, 120000);
});

describe('dojezd po čele začíná na hloubce průchodu', () => {
  it('vodorovný úsek od osy se ořízne na minX', () => {
    const segs = [{ type: 'line', x1: 0, z1: 0.9, x2: 31.1, z2: 0.9 }, { type: 'line', x1: 31.1, z1: 0.9, x2: 31.1, z2: -40 }];
    clipLeadOutToDepth(segs, Infinity, 30.5);
    expect(segs[0].x1).toBe(30.5);
    expect(segs[0].x2).toBeCloseTo(31.1, 9);
    expect(segs).toHaveLength(2);
  });

  it('bez minX se nic nemění', () => {
    const segs = [{ type: 'line', x1: 0, z1: 0.9, x2: 31.1, z2: 0.9 }];
    clipLeadOutToDepth(segs, 40);
    expect(segs[0].x1).toBe(0);
  });
});
