// Karusel Od středu, Cik cak, ap 10 (audit CAM 26. 11. 2026, P3 zbytek na dně):
// mírný svah r673 h45 → r842 h39 a za ním strmá stěna. Doplněná obrácená vrstva
// h47 vystoupala po svahu jen o 1 mm (strop výstupu po stěně) a jízda po offsetu
// se nespustila — vrstva h57 nad ní v tu chvíli ještě nebyla, `slopeOn` s prázdnou
// jízdou nenastavil přepočet (`slopeShort`). Pás h48–52 u stěny r672–733 (8,7 mm)
// nevzal nikdo. Teď vrstva jede po svahu k patě stěny a po ní vyjede ke konci
// vrstvy o ap výš (zigzagReverse.js).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runCamProg } from './helpers/camHeadless.mjs';
import { machinedFor } from '../js/calculators/cam/sim/xzSections.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cam-cases');
const inside = (pts, x, z) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) c = !c; } return c; };

describe('Karusel Od středu, ap 10 — mírný svah pod vrstvou o ap výš', () => {
  it('pás u stěny r672–733 nad svahem je obrobený', async () => {
    const prog = JSON.parse(readFileSync(join(DIR, 'carousel-zigzag-center-ap10.camprog'), 'utf8'));
    prog.params = { ...prog.params, doFinishing: false };
    const r = await runCamProg(prog);
    const stock = machinedFor(r.S, r.calcSim).points;
    for (const [px, pz] of [[680, 50.5], [700, 49.5], [720, 49]]) expect(inside(stock, px, pz), `X${px} Z${pz}`).toBe(false);
  }, 300000);
});
