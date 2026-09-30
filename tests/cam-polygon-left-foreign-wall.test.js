// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – polygon zleva, celý program: „stěna" z cizího úseku      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Díl uživatele 30. 9. 2026 (projekt_2026-09-30 (4), polygon R1, natočení
// 15°, ap 2,5, zleva, „Generovat" celého programu — bez „✂ Po úsecích").
// Heuristika pravých stěn kapes (ops/long/insertFlankGuard.js) brala za
// stěnu rampu z KTERÉHOKOLI úseku: rampy X 48,045 / 45,545 v úseku 3
// (Z 235 / 248) posunuly kotvy v úsecích 1, 2 i 4 o desítky až stovky mm,
// průchody zdegenerovaly a zmizely. „Po úsecích" je mělo (cizí úsek tam
// v poli průchodů není). Chyběly:
//  1. úsek 1: vrstva X 29,566 Z 20,3 → 80 (nad ní `N2520 G1 Z79.311`),
//  2. úsek 2: vrstva X 39,118 pod `N1620 G1 Z143.635` za hrbem,
//  3. úsek 4: nejhlubší vrstvy u čela X 9,44 / 6,94 / 4,44.
// A druhá chyba téže heuristiky: výška stěny se brala jako hloubka průchodu,
// ne začátek jeho rampy (o ap − 0,02 výš) → hlubší krok řetězu ramp se
// odsunul o 0,07 mm a nájezd další vrstvy svisle řezal (`G1 X6.940`).
//
// Druhé kolo téhož dne (projekt_2026-09-30 (6), srovnání s „Po úsecích" (7)):
//  4. úseky se obráběly Ú3 → Ú2 → Ú1 → Ú4 (staré pořadí „největší průměr
//     napřed") místo pravidla 8 → v údolí úseku 2 zbytečná rampa
//     `N1980 G1 X28.981` a chyběla poslední vrstva se zanořením,
//  5. vrstva X 39,118 za hrbem vjížděla rampou 15° a nechala klín pod
//     stěnou 10° (pravidlo 10: napřed po stěně) a pod ní chyběla uzavírací
//     rampa (X 38,5).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures', 'cam-cases', 'polygon-left-full-foreign-wall.camprog');
let run = null;
const getRun = async () => (run ??= await runCamProg(JSON.parse(readFileSync(FIXTURE, 'utf8'))));
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
const zLo = (p) => Math.min(p.zStart, p.zEnd);
const zHi = (p) => Math.max(p.zStart, p.zEnd);

describe('CAM: polygon zleva — stěna kapsy jen ze svého úseku a na dosah hrany', () => {
  it('úsek 1: vrstva X 29,566 za čelem jede až k hranici úseku', async () => {
    const { calc } = await getRun();
    const p = calc.passes.find(q => q.type === 'long' && near(q.x, 29.566) && zLo(q) > 15 && zLo(q) < 25);
    expect(p, 'vrstva X 29,566 v Z 20…80').toBeTruthy();
    expect(zHi(p)).toBeGreaterThan(79);
  });

  it('úsek 2: pod vrstvou X 41,618 je vrstva X 39,118 i za hrbem (Z 141 → 143,6)', async () => {
    const { calc } = await getRun();
    const p = calc.passes.find(q => q.type === 'long' && near(q.x, 39.118) && zLo(q) > 135 && zHi(q) < 144);
    expect(p, 'vrstva X 39,118 za hrbem').toBeTruthy();
    expect(zHi(p)).toBeGreaterThan(143.5);
  });

  it('úsek 4: u čela jsou i nejhlubší vrstvy a řetěz ramp navazuje přesně', async () => {
    const { calc } = await getRun();
    const face = calc.passes.filter(q => q.type === 'long' && q.ramp && zHi(q) > 368 && zLo(q) > 290);
    expect(Math.min(...face.map(q => q.x))).toBeLessThan(5);
    // Krok řetězu (rampa začíná na hloubce předchozího průchodu) začíná
    // PŘESNĚ na konci jeho rampy — jinak svislý nájezd řeže (pravidlo 6).
    let chained = 0;
    for (let i = 1; i < calc.passes.length; i++) {
      const prev = calc.passes[i - 1], p = calc.passes[i];
      if (p.type !== 'long' || !p.ramp || !prev.ramp || !face.includes(p) || !near(p.ramp.x0, prev.x)) continue;
      chained++;
      expect(p.ramp.z0, `rampa X ${p.x.toFixed(3)} navazuje na X ${prev.x.toFixed(3)}`).toBeCloseTo(prev.zStart, 2);
    }
    expect(chained).toBeGreaterThanOrEqual(3);
  });

  it('úseky jedou po řadě zleva Ú1 → Ú2 → Ú3 → Ú4 (pravidlo 8)', async () => {
    const { calc } = await getRun();
    const long = calc.passes.filter(q => q.type === 'long');
    const firstIn = (lo, hi) => long.findIndex(q => zLo(q) >= lo && zHi(q) <= hi);
    const order = [[-13, 82.1], [82, 143.7], [143.6, 265.5], [265.3, 371]].map(([lo, hi]) => firstIn(lo, hi));
    expect(order.every(i => i >= 0)).toBe(true);
    expect(order).toEqual(order.slice().sort((a, b) => a - b));
  });

  it('úsek 2: údolí bez zbytečné rampy X 28,981 a s poslední vrstvou pod X 16,618', async () => {
    const { calc } = await getRun();
    const valley = calc.passes.filter(q => q.type === 'long' && zLo(q) > 99 && zHi(q) < 120);
    expect(valley.some(q => near(q.x, 28.981)), 'rampa X 28,981').toBe(false);
    expect(Math.min(...valley.map(q => q.x))).toBeLessThan(16);
  });

  it('úsek 2 za hrbem: vjezd po stěně (napřed mírnější než 15°) a uzavírací rampa pod ním', async () => {
    const { calc } = await getRun();
    const p = calc.passes.find(q => q.type === 'long' && near(q.x, 39.118) && zLo(q) > 135 && zHi(q) < 144);
    expect(p && p.contourLeadIn, 'vjezd po stěně').toBeTruthy();
    const li = p.contourLeadIn;
    expect(li[0].x1, 'začíná na podlaze vrstvy X 41,618').toBeCloseTo(41.618, 2);
    expect(li[0].z1).toBeLessThan(130);
    const first = li[0];
    const slopeDeg = Math.atan2(first.x1 - first.x2, Math.abs(first.z2 - first.z1)) * 180 / Math.PI;
    expect(slopeDeg, 'po stěně materiálu, ne pod úhlem zanoření').toBeLessThan(14);
    expect(calc.passes.some(q => q.type === 'long' && q.rampCompletion && q.x < 39 && q.x > 38 && zHi(q) > 143 && zHi(q) < 144)).toBe(true);
  });

  it('bez kolize nástroje a držáku (validátor, planStock, zleva)', async () => {
    const r = await getRun();
    const issues = validateToolpath(r.calcSim.simPath, r.params, r.calcSim.stockPathSegments,
      { planStock: true, backside: true });
    expect(issues.map(i => ({ k: i.kind, x: +(i.x || 0).toFixed(2), z: +(i.z || 0).toFixed(2), a: +(i.area || 0).toFixed(2) }))).toEqual([]);
  });
});
