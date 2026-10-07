// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – pravidlo 15: dokončování nesjíždí strměji než úhel       ║
// ║  zanoření                                                      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// docs/cam-pravidla.md, pravidlo 15 (uživatel 7. 10. 2026). Díl uživatele
// `projekt_2026-10-07 (3)`, úsek 2 (kulatá R 10, úhel zanoření 45°):
// `N2360 G3 X36.836 Z106.625 CR=20.000` jela po vypuklém oblouku až tam, kde
// klesá skoro kolmo, a pak „Výjezd materiálem posuvem" až na X150. Dokončit
// se má celý kus kontury před místem, kde sklon dosáhne úhlu zanoření
// (oblouk do 135°), pak rovný průměr a odjezd vzduchem.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { splitSteepFinish } from '../js/calculators/cam/ops/finishSteep.js';
import { MaterialRemoval } from '../js/calculators/cam/materialRemoval.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const deg = Math.PI / 180;

describe('splitSteepFinish — dělení úseku podle úhlu zanoření', () => {
  const line = (x1, z1, x2, z2) => ({ type: 'line', p1: { x: x1, z: z1 }, p2: { x: x2, z: z2 } });

  it('úsečka: mírná projde, strmější než úhel zanoření (ve směru jízdy) celá odpadne', () => {
    expect(splitSteepFinish(line(10, 0, 10, -5), 45, -1).steep).toBeNull();      // vodorovně
    expect(splitSteepFinish(line(10, 0, 8, -5), 45, -1).steep).toBeNull();       // 21,8° dolů
    expect(splitSteepFinish(line(10, 0, 5, -5), 45, -1).steep).toBeNull();       // přesně 45°
    expect(splitSteepFinish(line(10, 0, 4, -2), 45, -1).keep).toBeNull();        // 71,6° dolů
    expect(splitSteepFinish(line(5, 0, 10, -1), 45, -1).steep).toBeNull();       // stoupá (čelo nahoru)
    // Zleva se jede +Z (dráha se otočí): tatáž úsečka v pořadí kontury je
    // stoupání, ne klesání.
    expect(splitSteepFinish(line(10, 0, 4, -2), 45, +1).steep).toBeNull();
    expect(splitSteepFinish(line(4, -2, 10, 0), 45, +1).keep).toBeNull();
  });

  it('vypuklý oblouk se rozdělí v místě, kde tečna dosáhne úhlu zanoření', () => {
    // Střed (30, 125), r 20, G3 z 90° (vodorovná tečna nahoře) do 160°.
    const arc = { type: 'arc', cx: 30, cz: 125, r: 20, dir: 'G3', startAngle: 90 * deg, endAngle: 160 * deg,
      refP1: { x: 40, z: 125 }, refP2: { x: 30 + Math.sin(160 * deg) * 10, z: 125 + Math.cos(160 * deg) * 10 } };
    const sp = splitSteepFinish(arc, 45, -1);
    expect(sp.keep.startAngle / deg).toBeCloseTo(90, 3);
    expect(sp.keep.endAngle / deg).toBeCloseTo(135.5, 1);
    expect(sp.steep.endAngle / deg).toBeCloseTo(160, 3);
    expect(sp.steepFirst).toBe(false);
    // Referenční body kontury jdou s ním (r kontury 10).
    expect(Math.hypot(sp.keep.refP2.x - 30, sp.keep.refP2.z - 125)).toBeCloseTo(10, 6);
    // Úhel 90° (kolmo) — oblouk projde celý.
    expect(splitSteepFinish(arc, 90, -1).steep).toBeNull();
  });
});

describe('pravidlo 15 na dílu uživatele (úsek 2, kulatá R 10, 45°)', () => {
  it('dokončování nesjede strměji než 45°, končí rovným průměrem a odjezdem vzduchem', async () => {
    const prog = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'cam-cases', 'round-r10-finish-steep-arc.camprog'), 'utf8'));
    const r = await runCamProg(prog);
    const lines = r.gcode.split('\n');
    const fin = lines.findIndex(l => /DOKONCOVANI/.test(l));
    expect(fin).toBeGreaterThan(0);
    const finText = lines.slice(fin).join('\n');
    // Oblouk končí v místě sklonu 45° (X 44,136 Z 111,198), ne až dole (X 36,836).
    expect(finText).toMatch(/G3 X44\.13\d Z111\.19\d/);
    expect(finText).not.toMatch(/X36\.836 Z106\.625/);
    expect(finText).toMatch(/Rovný průměr/);
    expect(finText).not.toMatch(/Výjezd materiálem posuvem/);
    // Žádný posuv dokončování PO KONTUŘE (G1/G2/G3), který ubírá materiál,
    // neklesá k ose strměji než 45° (model úběru jako scripts/cam_rules_check.mjs).
    // Nájezd na začátek řetězu (první posuv po rychloposuvu) se tu nepočítá:
    // na tomhle dílu sjíždí do zbytku po hrubování v údolí (`N900 G1 X18.743`,
    // 23,9 mm²) — zbytek tam nechal řetěz zanoření úseku 1, který končí na
    // hranici úseků (pravidlo 14, rozhoduje uživatel, viz CHANGELOG).
    const sp = r.calcSim.simPath;
    const rm = new MaterialRemoval(r.params, r.calcSim.stockPathSegments, {});
    const bad = [];
    for (let i = 1; i < sp.length; i++) {
      const before = Math.abs(rm.model.area());
      rm.advanceTo(sp, i);
      const cut = before - Math.abs(rm.model.area());
      const approach = sp[i - 1].type === 'G0' || (i > 1 && sp[i - 2].type === 'G0' && sp[i - 1].originalLineIdx === sp[i].originalLineIdx);
      if (sp[i].originalLineIdx < fin || sp[i].type === 'G0' || approach || cut < 0.05) continue;
      const dx = sp[i].x - sp[i - 1].x, dz = sp[i].z - sp[i - 1].z;
      if (dx < -1e-6 && Math.atan2(-dx, -dz) > (45 + 1) * deg)
        bad.push(`${(lines[sp[i].originalLineIdx] || '').trim()}: ${(Math.atan2(-dx, -dz) / deg).toFixed(1)}°, ${cut.toFixed(2)} mm²`);
    }
    expect(bad, bad.join('\n')).toEqual([]);
    // Hlášení podle pravidla 15.
    expect(r.errors.some(e => /pravidlo 15/.test(e.msg))).toBe(true);
  });
});
