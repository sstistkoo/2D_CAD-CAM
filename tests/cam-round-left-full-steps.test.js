// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – kulatá R 10 zleva: zahlazení schodků a navázání průchodů ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Díl uživatele 30. 9. 2026 (projekt_2026-09-30 (10), „🔄 Dráhy" celého
// programu; kulatá R 10, ap 2,5, zleva). Nálezy:
//  1. `N3500 G1 Z194.499` — vrstvy u svislé stěny Z 205 (X 38,045 … 28,045)
//     nezahladily schodek nahoru po stěně a spodní (X 25,545) jen do X 27,744:
//     emise ořezávala dojezd na hranu polotovaru podle sloupce pod STŘEDEM
//     nosu (tam nízký polotovar), bok nosu R 10 přitom bral vysoký za čelem
//     (gcodeEmit.js `trimLeadOutToStock`, klíč plátku `leadOutTrimNoseCircle`),
//  2. `N3300 G1 X42.020 Z206.901` — vrstva na schodu X 40,676 dojela schodek
//     jen do X 42,020, ne k mělčí vrstvě X 43,045 (okno plošiny utínalo
//     stěnu, rule7Layers.js `floorWindowRuns`),
//  3. `N2570 G1 X48.618 ; Výjezd v X (stěna)` + `G0 X47.730` + `G1 X46.618` —
//     odjezd a návrat na totéž místo mezi dvěma sjezdy u meze úseku 1
//     (rule7Layers.js, navazující průchod bez odskoku).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures', 'cam-cases', 'round-r10-left-full-steps.camprog');
let run = null;
const getRun = async () => (run ??= await runCamProg(JSON.parse(readFileSync(FIXTURE, 'utf8'))));
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
const lines = (gcode) => gcode.split('\n').map(l => l.replace(/^N\d+\s+/, '').trim());

describe('CAM: kulatá R 10 zleva — zahlazení schodků a navázání průchodů', () => {
  it('vrstvy u stěny Z 205 zahladí schodek nahoru až k mělčí vrstvě', async () => {
    const { gcode } = await getRun();
    const L = lines(gcode);
    const ends = L.map((l, i) => (l.startsWith('G1 Z194.499') ? i : -1)).filter(i => i >= 0);
    expect(ends.length).toBeGreaterThanOrEqual(10);
    for (const i of ends) {
      const m = /^G1 X([\d.]+) Z194\.509/.exec(L[i + 1]);
      expect(m, `za „${L[i]}" (ř. ${i}) dojezd po stěně, ne odskok: „${L[i + 1]}"`).toBeTruthy();
    }
    // Spodní dojezd dojede přesně k mělčí vrstvě X 28,045 (dřív 27,744).
    expect(L.some(l => l.startsWith('G1 X28.045 Z194.509'))).toBe(true);
  });

  it('vrstva na schodu X 40,676 dojede schodek k mělčí vrstvě X 43,045', async () => {
    const { calc } = await getRun();
    const p = calc.passes.find(q => q.type === 'long' && near(q.x, 40.676) && Math.max(q.zStart, q.zEnd) > 200);
    expect(p && p.contourLeadOut && p.contourLeadOut.length).toBeTruthy();
    expect(p.contourLeadOut[p.contourLeadOut.length - 1].x2).toBeCloseTo(43.045, 2);
  });

  it('dva sjezdy u meze úseku 1 navazují bez odjezdu a návratu', async () => {
    const { calc, gcode } = await getRun();
    const a = calc.passes.find(q => q.type === 'long' && near(q.x, 46.618) && near(q.zEnd, 144.304, 0.05));
    expect(a && a.noRetract, 'bez odskoku').toBe(true);
    const L = lines(gcode);
    const i = L.findIndex(l => l.startsWith('G1 X46.618 Z144.314'));
    expect(i).toBeGreaterThan(0);
    expect(L[i + 1]).toMatch(/^; Průchod/);
    expect(L[i + 2]).toMatch(/^G1 X45\.676/);
    expect(L.some(l => /^G0\s*$/.test(l)), 'prázdné G0').toBe(false);
  });

  it('bez kolize nástroje a držáku (validátor, planStock, zleva)', async () => {
    const r = await getRun();
    const issues = validateToolpath(r.calcSim.simPath, r.params, r.calcSim.stockPathSegments,
      { planStock: true, backside: true });
    expect(issues.map(i => ({ k: i.kind, x: +(i.x || 0).toFixed(2), z: +(i.z || 0).toFixed(2), a: +(i.area || 0).toFixed(2) }))).toEqual([]);
  });
});
