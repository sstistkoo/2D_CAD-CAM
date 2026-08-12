// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM čelně – spodní hrana destičky sahá jen po délku břitu     ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Hlídání geometrie destičky (genFacePasses) drží průchod nad spodní hranou,
// která od špičky klesá pod úhlem natočení. Hrana ale končí s destičkou —
// za ní přebírá hlídání DRŽÁKU s vlastním (mnohem mírnějším) sklonem.
//
// Bez té meze se přímka extrapolovala donekonečna: na dílu uživatele
// (destička b 10 mm, natočení −15°) zvedla stěna vzdálená 33 mm průchod
// o 8,8 mm, další ještě víc, a program skončil v půlce dílu — levá polovina
// se přestala obrábět úplně (fixture `part-19-face-tilted-insert`).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProgFile } from './helpers/camHeadless.mjs';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';
import { insertReachZ } from '../js/calculators/cam/toolEnvelope.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = join(__dirname, 'fixtures', 'cam', 'part-19-face-tilted-insert.camprog');

describe('Čelní hrubování nakloněnou destičkou (b 10 mm, −15°)', () => {
  it('dosah destičky je konečný a odpovídá délce břitu', () => {
    const prms = JSON.parse(readFileSync(fixture, 'utf8')).params;
    const reach = insertReachZ(prms);
    expect(reach).toBeGreaterThan(0);
    // Břit délky b nakloněný o φ sahá v ose Z zhruba b·cos φ — rozhodně ne dál než b.
    expect(reach).toBeLessThanOrEqual(parseFloat(prms.toolLength) + 0.01);
  });

  it('obrábí se CELÝ díl, ne jen pravá polovina', async () => {
    const { calc } = await runCamProgFile(fixture);
    const zs = calc.passes.filter(p => p.type === 'face').map(p => p.z);
    expect(zs.length).toBeGreaterThan(60);
    // Kontura sahá k Z=0; hrubování musí dojet do jeho blízkosti (dřív končilo
    // na Z≈198, tj. v polovině dílu).
    expect(Math.min(...zs)).toBeLessThan(30);
  });

  it('program neobsahuje kolize destičky ani držáku', async () => {
    const prms = JSON.parse(readFileSync(fixture, 'utf8')).params;
    const { calcSim } = await runCamProgFile(fixture);
    const issues = validateToolpath(calcSim.simPath, prms, calcSim.stockPathSegments, {
      backside: prms.roughingSide === 'left',
    });
    expect(issues.map(i => `${i.kind} @X${i.x.toFixed(1)} Z${i.z.toFixed(1)} = ${i.area.toFixed(0)} mm²`)).toEqual([]);
  });
});
