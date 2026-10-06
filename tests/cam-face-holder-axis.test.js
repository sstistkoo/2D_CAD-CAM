// ČELNÍ HRUBOVÁNÍ NOŽEM PSKNR (destička i hlava sahají pod úroveň špičky).
//
// Nález uživatele 6. 10. 2026 (díl `face-psknr-axis.camprog` = jeho projekt):
// „dráhy nejedou pěkně jedna za sebou pod úhlem plátku, u každého záběru je
// schodek, každá další dráha skončí o něco dřív a neudělá 15° kužel". Dvě
// příčiny, obě změřené:
//
//  1. HLÍDÁNÍ DRŽÁKU (ops/face/holderGuard.js) bralo dno průchodu, který
//     dojel NA OSU, jako povrch s materiálem pod sebou. Hlava čelního nože je
//     pod úrovní špičky → průchody nad čelem dílu končily na X 2,14 / 3,94 /
//     6,08 / 7,88 místo na ose. Pod osou nic nestojí (pravidlo 2).
//  2. OBRYS DRŽÁKU z 📚 katalogu (verze 1) měl roh hlavy přesně v rohu
//     destičky = na prodloužení břitu. Zbytek po předchozím průchodu se
//     břitu dotýká, takže i držáku → zkrácení a řetězení do pily 1,07/2,87
//     mm místo 15° kužele, k tomu 2 kolize rychloposuvem. Verze 2 odsadí
//     hlavu 1 mm od břitů.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';
import { buildIsoKnife } from '../js/calculators/isoToolCatalog.js';

const FILE = join(__dirname, 'fixtures', 'cam-cases', 'face-psknr-axis.camprog');
const PART_END_Z = 346.9;            // čelo dílu (Z 346,371) + Přídavek Z 0,5
const STEP = 4;                       // ap čelně
const CONE = STEP * Math.tan(15 * Math.PI / 180);   // 1,072 mm na průchod

async function run(holderVersion) {
  const prog = JSON.parse(readFileSync(FILE, 'utf8'));
  if (holderVersion) {
    prog.params = { ...prog.params, holderProfile: buildIsoKnife('SK', { shank: '2525', size: '12', radius: '08', holderVersion }).tool.holderProfile };
  }
  const { calc, calcSim, params } = await runCamProg(prog);
  const face = calc.passes.filter((p) => p.type === 'face').sort((a, b) => b.z - a.z);
  const issues = validateToolpath(calcSim.simPath, params, calcSim.stockPathSegments, { backside: false, maxIssues: 20 });
  return { face, issues };
}

describe('čelní hrubování PSKNR — průchody na osu a 15° kužel', () => {
  it('nad čelem dílu dojede každý průchod na osu i se starým obrysem (hlídání držáku u osy)', async () => {
    const { face } = await run(null);          // obrys uložený v projektu uživatele (verze 1)
    const above = face.filter((p) => p.z > PART_END_Z);
    expect(above.length).toBeGreaterThanOrEqual(6);
    for (const p of above) expect(p.xEnd, `Z ${p.z.toFixed(3)}`).toBeLessThan(0.01);
  }, 120000);

  it('s obrysem z katalogu: vlevo od čela čistý 15° kužel (žádná pila) a bez kolizí', async () => {
    const { face, issues } = await run(3);
    for (const p of face.filter((q) => q.z > PART_END_Z)) expect(p.xEnd, `Z ${p.z.toFixed(3)}`).toBeLessThan(0.01);
    // Kužel pod čelem: Z 344,9 … 296,9 (dál už vrstvu ukončí polotovar).
    const cone = face.filter((p) => p.z < PART_END_Z && p.z > 296);
    expect(cone.length).toBeGreaterThanOrEqual(12);
    for (let i = 1; i < cone.length; i++) {
      const rise = cone[i].xEnd - cone[i - 1].xEnd;
      expect(rise, `Z ${cone[i - 1].z.toFixed(1)} → ${cone[i].z.toFixed(1)}: ${cone.map((p) => p.xEnd.toFixed(2)).join(', ')}`)
        .toBeCloseTo(CONE, 1);
    }
    expect(issues.map((s) => `${s.kind || s.type} ${s.area?.toFixed?.(1)} @X${s.x?.toFixed?.(1)} Z${s.z?.toFixed?.(1)}`)).toEqual([]);
  }, 120000);
});
