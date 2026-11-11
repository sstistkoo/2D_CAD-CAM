// Kulatá destička: KOLMO U STRMÉ STĚNY (pravidlo 6, uživatel 11. 11. 2026).
// Mezní čára zanoření (pod úhlem zanoření od vrcholu strmé stěny) dřív vedla
// i hrubovací offset, takže vrstvy pod ramenem začínaly po 45° dál od stěny
// a u ní zůstal klín (karusel carousel-face-swap-xz: až 63 mm). Teď hrubování
// sjede po stěně kolmo (přepínač „Kolmo u strmé stěny", prms.wallPlunge, výchozí vypnuto — rozbíjel 6 testů kulaté R10: řetězy ramp, údolí; rule7Layers `wallPlunge`), dokončování se čarou řídí
// dál (pravidlo 15) — a jeho začátek nesmí ležet tam, kde by kružnice nosu
// zasáhla díl (bez klínu dokončování zajelo do paty stěny 5,7 mm²).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { stripCodeOwnedParams } from '../js/calculators/cam/camDefaults.js';
import { MaterialRemoval } from '../js/calculators/cam/materialRemoval.js';
import { ContourGouge } from '../js/calculators/cam/contourGouge.js';
import { topXOnLoop } from '../js/calculators/cam/camMath.js';
import { offsetSilhouetteLoop } from '../js/calculators/cam/toolEnvelope.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const load = () => {
  const p = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'cam-cases', 'carousel-face-swap-xz.camprog'), 'utf8'));
  p.params = stripCodeOwnedParams(p.params);   // jako aplikace (Bp X500 Z500)
  return p;
};

// Výsledek v prohozeném světě karuselu (tam dráhy vznikají): zbytek po celém
// programu, nejvyšší zbytek nad dílem v pásu u stěny a zajetí do dílu.
async function measure(prog) {
  const r = await runCamProg(prog);
  const x = r.calcSim._xz, P = x.S.params, c = x.calc, cc = r.calc._xz.calc;
  const rm = new MaterialRemoval(P, c.stockPathSegments, {});
  const g = new ContourGouge(P, cc.contourSegments, c.stockPathSegments);
  let gouge = 0;
  for (let i = 1; i < c.simPath.length; i++) { rm.advanceTo(c.simPath, i); g.update(rm.model.loops); gouge = Math.max(gouge, g.area); }
  const part = offsetSilhouetteLoop(cc.contourSegments);
  const top = (loops, z) => { let t = null; for (const l of loops) { const v = topXOnLoop(l, z); if (v !== null && (t === null || v > t)) t = v; } return t; };
  let wedge = 0;   // svislá stěna Z′ 212–225 (rameno X′ 132), klín vlevo od ní
  for (let z = 150; z <= 212; z += 1) wedge = Math.max(wedge, top(rm.model.loops, z) - topXOnLoop(part, z));
  return { gouge, wedge, gcode: r.gcode };
}

describe('Kulatá: kolmo u strmé stěny (karusel, svislá stěna pod ramenem)', () => {
  it('se zapnutým přepínačem: u stěny nezůstane klín, dokončování nezajede do dílu', async () => {
    const p = load(); p.params.wallPlunge = true;
    const { gouge, wedge, gcode } = await measure(p);
    expect(wedge).toBeLessThan(2);          // dřív až 62,9 mm
    expect(gouge).toBeLessThan(0.02);       // dřív (bez pojistky začátku dokončování) 5,7 mm²
    expect(gcode).toMatch(/Kolmo u stěny/);
  });

  it('výchozí (přepínač vypnutý): rampa po čáře zanoření, klín zůstane, do dílu se nezajede', async () => {
    const p = load();
    const { wedge, gcode, gouge } = await measure(p);
    expect(wedge).toBeGreaterThan(30);
    expect(gouge).toBeLessThan(0.02);
    expect(gcode).not.toMatch(/Kolmo u stěny/);
  });
});
