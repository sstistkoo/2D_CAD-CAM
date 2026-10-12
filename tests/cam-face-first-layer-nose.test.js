// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – čelně kulatou: první vrstva nevezme víc než ap          ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Pravidlo 3 (docs/cam-pravidla.md). Mřížka čelních vrstev je mřížka STŘEDŮ
// nosu, jenže kulatá destička řeže o rádius PŘED středem. První vrstva u čela
// polotovaru proto brala ap + R: díl uživatele `projekt_2026-10-12 (2)`
// (R 10, ap 4) `N160 G1 X13.101` na Z71,717 → 9,3 mm v ose Z, part-18 (R 8,
// ap 3) → 9,0 mm. Oprava (`faceLayerNoseLead` v inserts/round.js) dělí první
// vrstvy od polohy středu, ve které se čela dotkne břit; u dílu uživatele
// první vrstva sedí na koníku (Z 79,37), za kterým se čelní průchod zahazuje.
//
// Měří se v ŘÁDCÍCH (výška X → kolik se v ose Z ubralo), protože čelně je ap
// v ose Z: model úběru před pohybem × po něm.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { MaterialRemoval } from '../js/calculators/cam/materialRemoval.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Nejpravější Z materiálu ve výšce x (čelo zbytku při marchi zprava). */
function rightZ(loops, x) {
  let best = null;
  for (const l of loops) for (let i = 0; i < l.length; i++) {
    const a = l[i], b = l[(i + 1) % l.length];
    if ((a.x - x) * (b.x - x) > 0 || a.x === b.x) continue;
    const z = a.z + (x - a.x) / (b.x - a.x) * (b.z - a.z);
    if (best === null || z > best) best = z;
  }
  return best;
}

/** Největší tloušťka v ose Z, kterou ubral některý posuv: { v, line }. */
async function worstAxialChip(rel, tweak = (p) => p) {
  const prog = tweak(JSON.parse(readFileSync(join(__dirname, 'fixtures', rel), 'utf8')));
  const r = await runCamProg(prog);
  const sp = r.calcSim.simPath, lines = r.gcode.split('\n');
  // Jen hrubování — dokončování jede po kontuře podél osy, ap se ho netýká.
  const finAt = lines.findIndex(l => /DOKONCOVANI/.test(l));
  const rm = new MaterialRemoval(r.params, r.calcSim.stockPathSegments, {});
  let worst = { v: 0, line: '' };
  for (let i = 1; i < sp.length; i++) {
    const before = rm.model.loops;
    rm.advanceTo(sp, i);
    if (sp[i].type === 'G0' || (finAt >= 0 && sp[i].originalLineIdx > finAt)) continue;
    // Jen ČELNÍ ŘEZ (radiálně k ose v konstantním Z) — to je vrstva. Dojezd
    // „bez schodků" jede po kontuře a sloupne srp (radiálně desetiny mm), který
    // by řádková míra ukázala jako dlouhý.
    if (Math.abs(sp[i].z - sp[i - 1].z) > 1e-6 || sp[i].x >= sp[i - 1].x) continue;
    const after = rm.model.loops;
    for (let x = 0.1; x < 40; x += 0.2) {
      const b0 = rightZ(before, x), b1 = rightZ(after, x);
      if (b0 === null || b1 === null) continue;
      if (b0 - b1 > worst.v) worst = { v: b0 - b1, line: (lines[sp[i].originalLineIdx] || '').trim() };
    }
  }
  return { worst, ap: parseFloat(r.params.depthOfCut), gcode: r.gcode, r };
}

const USER = 'cam-cases/round-r10-face-small-fillet.camprog';
const TAIL = 79.37;

describe('čelně kulatou: žádný řez nevezme v ose Z víc než ap', () => {
  it('díl uživatele bez koníku (R 10, ap 4)', async () => {
    const { worst, ap } = await worstAxialChip(USER, (p) => ({ ...p, zLimits: { ...p.zLimits, tailActive: false } }));
    expect(worst.v, worst.line).toBeLessThanOrEqual(ap + 0.05);
  }, 180000);

  // S koníkem Z 79,37 (6 mm za čelem polotovaru) se tenká první vrstva postavit
  // nedá: plátek R 10 sahá 10 mm za střed a do koníku nesmí (uživatel
  // 12. 10. 2026: meze platí pro okraj plátku). První vrstva proto sedí přesně
  // na Z 69,37, žádný řezný pohyb za tu mez nejede a program to nahlásí.
  it('díl uživatele s koníkem: plátek za koník nesáhne, první vrstva na mezi', async () => {
    const { gcode, r } = await worstAxialChip(USER);
    expect(gcode).toMatch(/HRUBOVANI \(CELNI\) ---\n; Průchod 1[^\n]*\n\S+ G0 Z69\.370\n/);
    const beyond = r.calcSim.simPath.filter(q => q.type !== 'G0' && q.z > TAIL - 10 + 0.01);
    expect(beyond.map(q => q.z)).toEqual([]);
    expect(r.errors.some(e => /Koník Z 79\.37: první čelní vrstva vezme/.test(e.msg))).toBe(true);
  }, 180000);

  it('part-18 (R 8, ap 3)', async () => {
    const { worst, ap } = await worstAxialChip('cam/part-18-face-big-radius.camprog');
    expect(worst.v, worst.line).toBeLessThanOrEqual(ap + 0.05);
  }, 180000);
});
