// ╔══════════════════════════════════════════════════════════════╗
// ║  Skim vrstva čelního hrubování se dělí ROVNOMĚRNĚ             ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Marche čelního hrubování je kotvená na hraně NAKRESLENÉHO polotovaru,
// jenže materiál může sahat až na offsetovou čáru — nad hranu se proto
// přidává skim. Dokud šel skim po `ap` od plánovací hrany, obě mřížky se
// o Vůli Z rozešly a na jejich styku zbyla tenká vrstva:
//
//   part-18, ap 3:  369,932 → 366,932 (3,0) → 365,932 (jen 1,0) → 362,932 (3,0)
//
// Podélné hrubování dostalo tutéž opravu 21. 8. 2026 (`planTopX`), čelní
// zůstalo pozadu. Rovnoměrné dělení dá 2 × 2,0 mm — POČET vrstev se nemění,
// jen se posunou, takže úběr zůstává na desetinu mm² stejný (změřeno na všech
// 25 fixtures: 76 849,6 mm² před i po).
//
// Měří se PRVNÍ rozteč vrstev, protože právě tam ta tenká vrstva byla: skim
// dělí `ap + Vůle Z` na `nSkim` stejných dílů a poslední z nich dosedá přesně
// na mřížku, takže rozteč `zs[0] → zs[1]` musí vyjít `(ap + VůleZ) / nSkim`.
// Před opravou tam byla `VůleZ` (part-18: 1,0 při ap 3).
//
// Levá strana (`faceLeft`) nemá mezi fixtures ŽÁDNÉ zastoupení — všechny
// čelní jedou zprava — proto se tu testuje zvlášť překlopením strany.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { stockClearanceIsZero, stockClearances } from '../js/calculators/cam/camMath.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures', 'cam');

// Singleton `S` v harnessu si Z/X-limity MERGUJE, ne přepisuje — fixture bez
// některého klíče podědí hodnotu po předchozím běhu v témže souboru. Bez
// tohohle doplnění vyšla levá strana na 2,5 mm místo 1,75 — a IZOLOVANĚ
// přitom prošla, takže by to vypadalo jako nahodilost, ne jako kontaminace.
const ZL0 = { chuck: null, tail: null, chuckActive: false, tailActive: false, rangeStart: null, rangeEnd: null, rangeActive: false };
const XL0 = { rangeXMin: null, rangeXMax: null, active: false };

async function firstGap(file, override = {}) {
  const prog = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'));
  prog.params = { ...prog.params, ...override };
  prog.zLimits = { ...ZL0, ...(prog.zLimits || {}) };
  prog.xLimits = { ...XL0, ...(prog.xLimits || {}) };
  const { calc, params } = await runCamProg(prog);
  const left = params.roughingSide === 'left';
  const zs = [...new Set(calc.passes.filter(p => p.type === 'face').map(p => +p.z.toFixed(4)))]
    .sort((a, b) => (left ? a - b : b - a));
  const step = parseFloat(params.depthOfCut);
  const clrZ = stockClearanceIsZero(params) ? 0 : stockClearances(params).z;
  return { gap: Math.abs(zs[1] - zs[0]), step, clrZ, left, zs };
}

const expectedGap = (step, clrZ) => {
  const span = step + clrZ;
  const nSkim = span > step * 1.1 ? Math.ceil(span / step - 1e-9) : 1;
  return span / nSkim;
};

describe('čelní skim nenechá na styku mřížek tenkou vrstvu', () => {
  // NAMĚŘENO po opravě; před ní byla první rozteč rovna Vůli Z (1,000).
  for (const [f, want] of [
    ['part-18-face-big-radius.camprog', 2.0],   // ap 3,   Vůle Z 1 → 4/2
    ['part-16-face-holder.camprog', 2.0],       // ap 3,   Vůle Z 1 → 4/2
    ['part-19-face-tilted-insert.camprog', 2.0],
    ['face-parting-retract-holder.camprog', 2.0],
    ['face-cylinder.camprog', 1.5],             // ap 2,   Vůle Z 1 → 3/2
    ['face-casting.camprog', 1.75],             // ap 2,5, Vůle Z 1 → 3,5/2
  ]) {
    it(`${f} — první rozteč ${want} mm, ne Vůle Z`, async () => {
      const r = await firstGap(f);
      expect(r.clrZ, 'fixture bez Vůle Z by nic neměřila').toBeGreaterThan(0);
      expect(r.gap, `vrstvy: ${r.zs.slice(0, 4).join(', ')}`).toBeCloseTo(want, 6);
      expect(r.gap).toBeCloseTo(expectedGap(r.step, r.clrZ), 6);
      // Rovnoměrné dělení `ap + VůleZ` nemůže dát díl menší než polovina ap
      // (span > (nSkim−1)·ap ⇒ span/nSkim > (nSkim−1)/nSkim · ap ≥ ap/2).
      expect(r.gap).toBeGreaterThanOrEqual(r.step / 2 - 1e-6);
      expect(r.gap).toBeLessThanOrEqual(r.step + 1e-6);
    }, 180000);
  }

  it('zleva: táž mřížka zrcadlově (mezi fixtures nezastoupené)', async () => {
    const r = await firstGap('face-casting.camprog', { roughingSide: 'left' });
    expect(r.left).toBe(true);
    expect(r.gap).toBeCloseTo(expectedGap(r.step, r.clrZ), 6);
    expect(r.gap).toBeGreaterThanOrEqual(r.step / 2 - 1e-6);
  }, 180000);

  it('nulová Vůle Z = žádný skim (mřížka zůstává kotvená na čele)', async () => {
    // Bez Vůle nemá co přesahovat, takže se nesmí přidat ani jedna vrstva —
    // jinak by se posunula celá mřížka, a to je změřeně horší (viz `planTopX`).
    const r = await firstGap('face-cylinder.camprog',
      { allowanceX: 0, allowanceZ: 0, stockClearX: 0, stockClearZ: 0 });
    expect(r.clrZ).toBe(0);
    expect(r.gap).toBeCloseTo(r.step, 6);
  }, 180000);
});
