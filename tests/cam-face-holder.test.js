// ╔══════════════════════════════════════════════════════════════╗
// ║  ČELNÍ hrubování × DRŽÁK — hlídání obálky (Fáze 4)            ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Čelní generátor dlouho neměl obdobu `holderClampZEnd` z podélné větve:
// průchod šel na hloubku danou konturou, ale držák se veze na UŽ OBROBENÉ
// straně a vlevo od stoupající stěny (kužel, osazení, hrana odlitku) jel
// v materiálu. V simulátoru to byla souvislá oranžová stopa vnoření přes
// celý díl, ve validátoru desítky ⛔ nálezů.
//
// Fixture `part-16-face-holder` = reálný díl uživatele (⌀111 × 350 odlitek,
// upichovák š. 5 v nakresleném držáku 20 × 200 mm, čelní hrubování zprava).
// Bez clampu má 126 nálezů; test drží nulu a zároveň hlídá, že to není
// vacuum (s vypnutým clampem nálezy BÝT musí).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';
import { holderBottomProfile } from '../js/calculators/cam/toolEnvelope.js';

const fixture = join(__dirname, 'fixtures', 'cam', 'part-16-face-holder.camprog');
const load = () => JSON.parse(readFileSync(fixture, 'utf8'));

async function runAndValidate(prog) {
  const { calc, calcSim, gcode, errors, S } = await runCamProg(prog);
  const issues = validateToolpath(calcSim.simPath, S.params, calc.stockPathSegments,
    { backside: false, maxIssues: 500, maxBlocks: 100000 });
  return { calc, gcode, errors, issues };
}

describe('spodní hrana držáku (holderBottomProfile)', () => {
  it('vlastní obrys: dno stoupá od špičky pod úhlem hřbetu', () => {
    const prms = load().params;
    const hb = holderBottomProfile(prms);
    expect(hb).not.toBeNull();
    expect(hb.reach).toBeCloseTo(20, 3);        // šířka držáku v ose Z
    expect(hb.bottomAt(0)).toBeCloseTo(0, 3);   // u špičky sahá až k ní
    expect(hb.bottomAt(2)).toBeCloseTo(0, 3);   // rovná pata plátku
    expect(hb.bottomAt(20)).toBeCloseTo(6.5515, 2);
    expect(hb.bottomAt(11)).toBeGreaterThan(hb.bottomAt(5));   // monotónní
    expect(hb.bottomAt(20.5)).toBeNull();       // za dosahem držáku
  });

  it('výchozí obdélníkový držák sedí NAD špičkou a je oboustranný', () => {
    // Bez vlastního obrysu = obdélník Tloušťka × Délka nad destičkou:
    // spodní hrana je konstantní (z0), dosah = polovina tloušťky.
    const hb = holderBottomProfile({ holderWidth: 20, holderLength: 100, toolLength: 10, toolRadius: 0.8 });
    expect(hb.reach).toBeCloseTo(10, 3);
    expect(hb.bottomAt(0)).toBeCloseTo(10, 3);
    expect(hb.bottomAt(9)).toBeCloseTo(10, 3);
  });

  it('bez držáku vrací null (nehlídá se nic)', () => {
    expect(holderBottomProfile({ holderWidth: 0, holderLength: 0 })).toBeNull();
  });
});

describe('čelní hrubování s držákem', () => {
  it('vygenerovaný program nemá kolizi držáku ani rychloposuvu', async () => {
    const { issues } = await runAndValidate(load());
    expect(issues.map(i => `${i.kind} ${i.area.toFixed(0)}mm² @X${i.x.toFixed(1)} Z${i.z.toFixed(1)}`)).toEqual([]);
  }, 120000);

  it('hlásí zkrácené/vynechané průchody (uživatel se to musí dozvědět)', async () => {
    const { errors } = await runAndValidate(load());
    const msg = errors.map(e => e.msg).join('\n');
    expect(msg).toMatch(/Hlídání držáku \(čelně\)/);
    expect(msg).toMatch(/průchodů zkráceno/);
  }, 120000);

  it('test není vacuum: s vypnutým clampem kolize BÝT musí', async () => {
    globalThis.__DISABLE_HOLDER_CLAMP__ = true;
    try {
      const { issues } = await runAndValidate(load());
      expect(issues.length).toBeGreaterThan(20);
    } finally {
      delete globalThis.__DISABLE_HOLDER_CLAMP__;
    }
  }, 120000);

  it('clamp bere hloubku, ne pokrytí: průchody zůstávají a řežou', async () => {
    // Pojistka proti opačnému extrému — clamp, který by z programu udělal
    // pár průchodů, je stejná vada jako žádný clamp.
    const { calc } = await runAndValidate(load());
    const face = calc.passes.filter(p => p.type === 'face');
    expect(face.length).toBeGreaterThan(90);
    for (const p of face) expect(p.xEnd).toBeLessThan(p.xStart - 0.04);
  }, 120000);
});
