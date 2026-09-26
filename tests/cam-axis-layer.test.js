// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – vrstva NA OSE nesmí projet dílem                         ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Booleovský sken (`ops/long/intervalScan.js`) hledá intervaly jako průsečík
// vodorovné čáry x = X se zbytkem (obal − dílec). Na hloubce X = 0 ta čára
// leží PŘESNĚ na spodní hraně obalu i dílce a proužky nulové šířky po
// zjednodušení/Clipperu se počítaly jako materiál. Nález uživatele 26. 9. 2026
// (kulatá R 10): „Průchod 31" `N1650 G0 X0.000` + `N1660 G1 Z251.767` jel
// středem nosu po ose skrz čep r 9,117 (Z 243…345) — interval Z 369,9 → 195,3.
//
// Invariant: tělo průchodu na ose (|x| < 0,05) nikde neleží pod offsetovou
// dráhou dílu — končí nejpozději na offsetové čáře čela.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { makePassHelpers } from '../js/calculators/cam/passHelpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = [
  ...readdirSync(join(__dirname, 'fixtures', 'cam')).filter(f => f.endsWith('.camprog'))
    .sort().map(f => join('cam', f)),
  join('cam-cases', 'round-r10-valley-holder.camprog'),
];

describe('CAM: vrstva na ose neprojede dílem', () => {
  for (const rel of fixtures) {
    it(`${rel} → průchod na ose končí na čele`, async () => {
      const prog = JSON.parse(readFileSync(join(__dirname, 'fixtures', rel), 'utf8'));
      const { calc } = await runCamProg(prog);
      const { offsetXAt } = makePassHelpers(calc.offsetPath || []);
      const bad = [];
      for (const p of calc.passes || []) {
        if (p.type !== 'long' || !Number.isFinite(p.x) || Math.abs(p.x) >= 0.05) continue;
        if (!Number.isFinite(p.zStart) || !Number.isFinite(p.zEnd)) continue;
        const lo = Math.min(p.zStart, p.zEnd), hi = Math.max(p.zStart, p.zEnd);
        for (let z = lo + 0.25; z < hi - 0.25; z += 0.25) {
          const off = offsetXAt(z);
          if (off !== null && off > p.x + 0.05) {
            bad.push(`x=${p.x.toFixed(3)} Z ${hi.toFixed(3)} → ${lo.toFixed(3)}: na Z ${z.toFixed(2)} offset ${off.toFixed(3)}`);
            break;
          }
        }
      }
      expect(bad, `průchod na ose projíždí dílem:\n${bad.join('\n')}`).toEqual([]);
    });
  }
});
