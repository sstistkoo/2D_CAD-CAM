// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – upichovák: obálka dokončování za vynechaným úsekem       ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Díl uživatele `projekt_2026-10-31 (6)` — upichovák MGEHR2525-5 (šířka 5,
// rε 0,8), čelně zleva. Za úseky, které dokončování vynechalo kvůli držáku,
// začíná dráha uprostřed okna plátku; vzorky obálky (partingEnvelopeAt) po
// 0,38 mm začátek přeskakovaly a obálka skákala: pila ±0,2 mm na sražení
// (`N8630 G1 X9.234 Z165.341`) a ±3,5 mm na čele (`N8910 G1 X5.769 Z346.559`).
import { describe, it, expect } from 'vitest';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runCamProgFile } from './helpers/camHeadless.mjs';
import { partingEnvelopeAt } from '../js/calculators/cam/camMath.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, 'fixtures', 'cam-cases', 'parting-finish-envelope-edge.camprog');

describe('upichovák — obálka za vynechaným úsekem', () => {
  it('okraj předlohy uvnitř okna jde do maxima', () => {
    // předloha jen od z=1 výš, klesá: max v okně [0; 3,4] je na okraji z=1
    const xAt = (z) => (z < 1 ? null : 10 - 2 * (z - 1));
    for (let z0 = 0.6; z0 < 1; z0 += 0.05) expect(partingEnvelopeAt(xAt, z0, 3.4, 1)).toBeCloseTo(10, 4);
  });

  it('dokončování bez pily na sražení S8–S9 a na čele', async () => {
    const { gcode } = await runCamProgFile(FILE);
    const lines = gcode.split('\n');
    const fin = lines.slice(lines.findIndex(l => l.includes('DOKONCOVANI')));
    const pts = [];
    let x = null, z = null;
    for (const l of fin) {
      const m = /^N\d+ G1\b(.*)$/.exec(l.trim());
      if (!m) continue;
      const mx = /X(-?[\d.]+)/.exec(m[1]), mz = /Z(-?[\d.]+)/.exec(m[1]);
      x = mx ? +mx[1] : x; z = mz ? +mz[1] : z;
      pts.push({ x, z, line: l.trim() });
    }
    // Ve vybraných pásech nesmí X střídavě stoupat a klesat (pila).
    for (const [lo, hi] of [[164.4, 168], [346.1, 347.7]]) {
      const band = pts.filter(p => p.z > lo && p.z < hi && p.x < 20);
      expect(band.length).toBeGreaterThan(0);
      let flips = 0;
      for (let i = 2; i < band.length; i++) {
        const d1 = band[i - 1].x - band[i - 2].x, d2 = band[i].x - band[i - 1].x;
        if (Math.abs(d1) > 0.05 && Math.abs(d2) > 0.05 && Math.sign(d1) !== Math.sign(d2)) flips++;
      }
      expect(flips, band.map(p => p.line).join('\n')).toBe(0);
    }
    // Rovné dno plátku (3,4 mm k −Z) nesmí pod rovinu VYNECHANÉHO úseku vlevo:
    // X8,743 před sražením, X9,117 před čelem (+ R 0,8). Obálka je musí vidět
    // (finishUnreachablePath) — druhé kolo téhož dne: `N8770 G1 X9.296 Z347.166`.
    // …a to i s přídavkem na hotovo 0,2 — vynechaný úsek hrubování nechalo
    // s přídavkem (třetí kolo: `N8790 G1 X9.917 Z347.166` ho sjelo).
    for (const [lo, hi, xMin] of [[164.4, 167.3, 8.743 + 0.8 + 0.2], [346.1, 347.7, 9.117 + 0.8 + 0.2]]) {
      const band = pts.filter(p => p.z > lo && p.z < hi && p.x < 20);
      for (const p of band) expect(p.x, p.line).toBeGreaterThan(xMin - 0.01);
    }
  });
});
