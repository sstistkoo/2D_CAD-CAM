// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – offset: krátká stěna za pohlceným vnitřním rádiusem     ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Díl uživatele `projekt_2026-10-12` (kulatá R 10, čelně zprava): vnitřní
// zaoblení R 5 (bod 9–10) je menší než rádius plátku, takže jeho offset
// odpadne a krátká stěna za ním (Z 20, X 12,787…15) se ořízne PŘES svůj
// konec — offset jede pozpátku. Kontrola dopředu (`trimAndRemoveLoops`) se
// dívala jen na navazující úsečku; za stěnou je ale vypuklý oblouk R 5,
// takže obrácený úsek zůstal v dráze a čelní dojezd po něm sjel
// `G2 X15.000 Z30.200` → 2,8 mm pod konturu (19,8 mm² zajetí, červeně).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { trimAndRemoveLoops } from '../js/calculators/cam/contourBuild.js';
import { MaterialRemoval } from '../js/calculators/cam/materialRemoval.js';
import { ContourGouge } from '../js/calculators/cam/contourGouge.js';
import { runCamProg } from './helpers/camHeadless.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const line = (x1, z1, x2, z2) => ({ type: 'line', p1: { x: x1, z: z1 }, p2: { x: x2, z: z2 } });

describe('trimAndRemoveLoops — obrácený úsek před obloukem', () => {
  it('stěnu pohlcenou rohem vypustí a úsečku napojí přímo na oblouk', () => {
    // Syrové offsety (R 10,2): stěna X 7,787 → X 17,987; stěna Z 20 → Z 30,2;
    // vypuklý oblouk R 5 kolem (15, 15) → R 15,2. Vnitřní R 5 mezi nimi odpadl.
    const raw = [
      line(17.987, 32.517, 17.987, 25),
      line(12.787, 30.2, 15, 30.2),
      { type: 'arc', cx: 15, cz: 15, r: 15.2, dir: 'G3', startAngle: 0, endAngle: Math.PI / 2 },
    ];
    const out = trimAndRemoveLoops(raw);
    expect(out).toHaveLength(2);
    expect(out[0].p2.x).toBeCloseTo(17.987, 6);
    expect(out[0].p2.z).toBeCloseTo(15 + Math.sqrt(15.2 ** 2 - 2.987 ** 2), 6);   // Z 29,904
    expect(out[1].type).toBe('arc');
    expect(out[1].startAngle).toBeCloseTo(Math.atan2(2.987, Math.sqrt(15.2 ** 2 - 2.987 ** 2)), 6);
  });
});

describe('díl uživatele (kulatá R 10, čelně) — nezajede do kontury', () => {
  it('hrubovací offset nemá smyčku a program neubere nic z hotového dílu', async () => {
    const prog = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'cam-cases', 'round-r10-face-small-fillet.camprog'), 'utf8'));
    const r = await runCamProg(prog);
    // Mezi Z 25 a 32,5 leží kontura na X 7,787 → střed R 10,2 nikdy pod X 17,987.
    for (const s of r.calc.offsetPath) {
      if (s.type !== 'line') continue;
      for (const p of [s.p1, s.p2]) if (p.z > 25.5 && p.z < 32) expect(p.x).toBeGreaterThan(17.98);
    }
    expect(r.gcode).not.toMatch(/X15\.000 Z30\.200/);
    const path = r.calcSim.simPath;
    const mr = new MaterialRemoval(r.params, r.calcSim.stockPathSegments);
    mr.advanceTo(path, path.length - 1);
    const cg = new ContourGouge(r.params, r.calcSim.contourSegments, r.calcSim.stockPathSegments);
    cg.update(mr.model.loops);
    expect(cg.area).toBeLessThan(0.05);
  });
});
