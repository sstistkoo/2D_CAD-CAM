// Úvodní vzduch vrstvy se jede rychloposuvem až na vůli před zbytkem
// (audit CAM 27. 11. 2026, pravidlo 5). Rychloposuv dřív končil podle obrysu
// POLOTOVARU, i když materiál před vrstvou vzaly vrstvy výš (kulatá bokem nosu):
//  – čelně part-18 `N3060 G1 X45.807` z X74,37 — 26,8 mm posuvem vzduchem,
//  – podélně part-22 `N1510 G1 Z356.336` z Z380,35 — 21 mm posuvem vzduchem.
// Kontrola pravidel to hlásí jako P5 „(úvod)"; tady přímo na G-kódu.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runCamProg } from './helpers/camHeadless.mjs';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cam');
const load = (n) => JSON.parse(readFileSync(join(DIR, `${n}.camprog`), 'utf8'));
const lines = (g) => g.split('\n').map(l => l.trim()).filter(l => /^N\d+/.test(l));
const num = (l, a) => { const m = new RegExp(`\\b${a}(-?[\\d.]+)`).exec(l); return m ? parseFloat(m[1]) : null; };

describe('úvodní vzduch vrstvy rychloposuvem', () => {
  it('part-18 čelně: tělo vrstvy Z197,932 nezačíná posuvem z obrysu polotovaru', async () => {
    const L = lines((await runCamProg(load('part-18-face-big-radius'))).gcode);
    const k = L.findIndex(l => /G0 Z197\.932\b/.test(l));
    expect(k).toBeGreaterThan(0);
    // po přejezdu na Z jde rychloposuv v X blíž k materiálu, ne hned G1 z X74,37
    const next = L[k + 1];
    expect(next.startsWith(next.split(' ')[0] + ' G0 X'), next).toBe(true);
    expect(num(next, 'X')).toBeLessThan(60);
  }, 120000);

  it('part-22 podélně: vrstva X5,545 nezačíná posuvem ze Z380', async () => {
    const L = lines((await runCamProg(load('part-22-round-r10'))).gcode);
    const k = L.findIndex(l => /G1 Z356\.336\b/.test(l));
    expect(k).toBeGreaterThan(0);
    const prev = L[k - 1];
    expect(/ G0 Z/.test(prev), prev).toBe(true);
    expect(num(prev, 'Z')).toBeLessThan(370);
  }, 120000);
});
