// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – čelně: sjezd po kolmé stěně (pravidlo 3)                 ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 1. 11. 2026 (`projekt_2026-10-31`, upichovák zleva): mřížka po ap
// na stěnu nesedla — čelo Z 0 nechalo 1,2 mm, osazení Z 205 2,4 mm (přídavek
// 0,2). Průchod za stěnou zabere ap shora, na průměru se posune ke stěně a sjede
// po ní dolů (uživatel: „posunul by se doleva a sjel by to až dolů").
// Dokončení čela pak zhora dolů jako samostatný řetěz.
import { describe, it, expect } from 'vitest';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { wallDescents, attachWallDescents } from '../js/calculators/cam/ops/face/wallLayers.js';
import { runCamProgFile } from './helpers/camHeadless.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, 'fixtures', 'cam-cases', 'parting-finish-envelope-edge.camprog');

// Offset: dno X 7,744 do Z 204,009, svislice, nahoře X 31,156 (postup +Z).
const offsetPath = [
  { type: 'line', p1: { x: 7.744, z: 190 }, p2: { x: 7.744, z: 204.009 } },
  { type: 'line', p1: { x: 7.744, z: 204.009 }, p2: { x: 31.156, z: 204.009 } },
  { type: 'line', p1: { x: 31.156, z: 204.009 }, p2: { x: 31.156, z: 214 } },
];
const offsetXAt = (z) => (z < 190 || z > 214 ? null : (z < 204.009 - 0.01 ? 7.744 : 31.156));

describe('wallDescents', () => {
  it('sjezd dostane vrstva ZA stěnou, cíl 0,02 před svislicí', () => {
    const d = wallDescents([196, 198, 200, 202, 204, 206], offsetPath, offsetXAt, 1);
    expect(d).toHaveLength(1);
    expect(d[0].zBeyond).toBe(204);
    expect(d[0].zNew).toBeCloseTo(203.989, 6);
  });
  it('vrstva už u stěny (blíž než 0,1) → bez sjezdu', () => {
    expect(wallDescents([200, 202, 203.95, 206], offsetPath, offsetXAt, 1)).toHaveLength(0);
  });
  it('klesající stěnu (ve směru postupu) nechá být', () => {
    expect(wallDescents([210, 208, 206, 204, 202], offsetPath, offsetXAt, -1)).toHaveLength(0);
  });
  it('připojí dojezd: po vršku ke stěně, pak dolů', () => {
    const passes = [{ type: 'face', z: 204, xEnd: 31.156 }];
    const n = attachWallDescents(passes, [{ zw: 204.009, zNew: 203.989, zBeyond: 204 }], () => 7.744);
    expect(n).toBe(1);
    expect(passes[0].contourLeadOut.map(g => [g.x2, g.z2])).toEqual([[31.156, 203.989], [7.744, 203.989]]);
  });
});

describe('díl uživatele — čelo Z 0 zleva upichovákem', () => {
  it('hrubování: sjezd po čele a po osazení, dokončení čela zhora dolů', async () => {
    const { gcode } = await runCamProgFile(FILE);
    const L = gcode.split('\n');
    const iFin = L.findIndex(l => l.includes('DOKONCOVANI'));
    const rough = L.slice(0, iFin).join('\n');
    // Průchod Z 0 dojede na průměr, posune se ke stěně (Z −1,02 = čelo − R 0,8
    // − přídavek 0,2 − 0,02) a sjede k ose; totéž u osazení Z 205.
    expect(rough).toMatch(/G0 Z0\.000\nN\d+ G1 X31\.566 F[\d.]+\nN\d+ G1 X31\.566 Z-1\.020 F[\d.]+\nN\d+ G1 X0\.000 Z-1\.020/);
    expect(rough).toMatch(/G1 X31\.156 Z203\.989 F[\d.]+\nN\d+ G1 X7\.744 Z203\.989/);
    // Dokončování začíná čelem: první G1 sjede na osu, pak odskok, a čelem
    // se posuvem nahoru nejede (`G1 X31.366 Z-0.800` z osy).
    const fin = L.slice(iFin).filter(l => /^N\d+ G1/.test(l));
    expect(fin[0]).toMatch(/G1 X0\.000/);
    expect(fin[1]).toMatch(/G1 X2\.000 Z-2\.800/);
    const i0 = L.findIndex((l, i) => i > iFin && /G1 X0\.000/.test(l));
    expect(L[i0 + 1]).not.toMatch(/G1 X31\.366 Z-0\.800/);
    // Osazení Z 205 uprostřed: po dně ke stěně → odskok → stěna SHORA dolů →
    // odskok → průměr. Nikdy posuvem po stěně nahoru (horní strana držáku).
    const finTxt = L.slice(iFin).map(l => l.replace(/^N\d+ /, '')).join('\n');
    // Dno končí o přídavek 0,2 + 0,02 před stěnou (bok plátku by jinak vjel do
    // přídavku na stěně po celé výšce); kout dočistí sjezd po stěně.
    expect(finTxt).toMatch(/G1 X7\.544 Z203\.978\nG1 X9\.544 Z201\.978\nG0 X32\.956[^\n]*\nG0 Z204\.201\nG1 X30\.956 Z204\.201\nG1 X7\.544 Z204\.198\nG1 X9\.544 Z202\.198/);
    expect(finTxt).not.toMatch(/G1 X7\.544 Z204\.198\nG1 X30\.956 Z204\.201/);
  });
});
