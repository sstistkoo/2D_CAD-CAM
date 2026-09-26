// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – kulatá R 10, „✂ Po úsecích": úsek 2 na zbytku po úseku 1 ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Fixture = úsek 2 dílu uživatele 26. 9. 2026 přesně tak, jak ho aplikace
// generuje v režimu „✂ Po úsecích": rozsah 📐 Z 195,278…101,942 a polotovar
// = obrobený zbytek po úseku 1 (stěna X ≈ 29,2 na Z 196,2). Tři nálezy:
//
//  1. `N2620 G1 X27.795` — sjezd na začátek rampy do drážky na Z 186,835;
//     kružnice nosu R 10 sahala na Z 196,8 a zadní stranou destičky škrábla
//     stěnu zbytku (kontrola pravidel: P6 „90°"). Začátek rampy `noseAware`
//     končil, jakmile SPODEK nosu vyjel z polotovaru, ne až na volné kružnici.
//  2. `N2860 G1 X23.388 Z148.391` — poslední vrstva X 19,230 leží o 0,013 mm
//     pod dnem X 19,243; dojezd po dně se zahodil jako „kousek pod vrstvou"
//     a emise spojila konec vrstvy se stěnou šikmou čarou „do kuželu".
//  3. Po `N2340 G1 Z137.565` chyběly vrstvy 46,73 / 44,23 / 41,73 u pravé
//     stěny hrbu: vjezd se hledal podle kraje materiálu pod spodkem nosu
//     (Z 143,7, uvnitř offsetu stěny), kružnice přitom materiál bere bokem.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures', 'cam-cases', 'round-r10-section2-parts.camprog');
const loadProg = () => JSON.parse(readFileSync(FIXTURE, 'utf8'));
const R = 10;
// Stěna zbytku po úseku 1 (offsetová čára polotovaru: Z 196,23 − Vůle 1).
const WALL_Z = 195.23;

describe('CAM: kulatá R 10 — „✂ Po úsecích", úsek 2', () => {
  it('rampa do drážky začíná tam, kde je celá kružnice nosu mimo stěnu', async () => {
    const { calc, params } = await runCamProg(loadProg());
    expect(params.toolShape).toBe('round');
    const ramps = calc.passes.filter(p => p.type === 'long' && p.ramp && p.rampEntryClear);
    expect(ramps.length).toBeGreaterThan(0);
    for (const p of ramps) {
      expect(p.ramp.z0 + R, `rampa X ${p.x.toFixed(3)} z Z ${p.ramp.z0.toFixed(3)}`).toBeLessThan(WALL_Z);
    }
  });

  it('k rampě se nesjíždí svisle přes stěnu (G1 X těsně před Rampou jen ≤ 1,6 mm)', async () => {
    const { gcode } = await runCamProg(loadProg());
    const lines = gcode.split('\n');
    const bad = [];
    let x = null;
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].replace(/;.*/, '').trim();
      if (/Rampa/.test(lines[i])) {
        const prev = lines[i - 1].replace(/;.*/, '').trim();
        const pm = /^N\d+\s+G1\s+X(-?[\d.]+)\s+F/.exec(prev);
        if (pm && x !== null && x - +pm[1] > 1.6) bad.push(`${prev} (z X ${x})`);
      }
      const mx = /X(-?[\d.]+)/.exec(t);
      if (mx && !/Rampa/.test(lines[i + 1] || '')) x = +mx[1];
    }
    expect(bad, `svislý sjezd posuvem k rampě:\n${bad.join('\n')}`).toEqual([]);
  });

  it('poslední vrstva na dně jede rovně po dně ke stěně, ne šikmo do kuželu', async () => {
    const { calc } = await runCamProg(loadProg());
    const last = calc.passes.filter(p => p.type === 'long' && p.x < 19.25 && p.x > 19.2
      && Math.abs(p.zEnd - 168.29) < 0.05);
    expect(last.length).toBe(1);
    const lo = last[0].contourLeadOut || [];
    expect(lo.length).toBeGreaterThan(0);
    // První úsek dojezdu = dno (X 19,243) až ke stěně hrbu (Z < 150).
    expect(Math.abs(lo[0].x2 - 19.243)).toBeLessThan(0.02);
    expect(lo[0].z2).toBeLessThan(150);
  });

  it('vrstvy 46,73 / 44,23 / 41,73 u pravé stěny hrbu nechybí', async () => {
    const { calc } = await runCamProg(loadProg());
    const atWall = calc.passes.filter(p => p.type === 'long' && p.zEnd > 147.5 && p.zEnd < 148.1
      && p.zStart > 150);
    for (const x of [46.73, 44.23, 41.73]) {
      expect(atWall.some(p => Math.abs(p.x - x) < 0.01), `chybí vrstva X ${x} u stěny`).toBe(true);
    }
  });
});
