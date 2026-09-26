// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – kulatá R 10: úsek 2 — bok hrbu a drážka po vrstvách     ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Nález uživatele 26. 9. 2026 (díl `cam-cases/round-r10-valley-holder`,
// úsek 2 = Z 101,9…195,3): u pravé stěny hrbu (Z ≈ 138) a v drážce pod
// přírubou (Z 148…195) skončila kulatá R 10 na vrstvě X 31,909 a vrstvy
// 29,409 … 19,409 se zahodily („Zanořování: 8 vrstev vynecháno"). Polygon
// tam sjíždí řetězem ramp až na dno a udělá i poslední tenčí vrstvu.
//
// Tři příčiny, každá hlídaná zvlášť:
//  1. vjezd se hledal podle kraje materiálu pod SPODKEM nosu — u stěny
//     vyšlo okno 0,1 mm a vrstva spadla do kapsy bez vjezdu (roughLong.js),
//  2. kapsa bez nájezdu po kontuře neměla rampu z povrchu: `stockEntryRamp`
//     srovnával střed nosu s povrchem (entryRamp.js `noseAware`,
//     pocketPass.js `noseEntryRamp`),
//  3. poslední vrstva na dně (zbytek < ap) chyběla (roughLong.js, „POSLEDNÍ
//     VRSTVA NA DNĚ").
// A emise: k rampě se sjíždí rychloposuvem až nad materiál, ne 4–6 mm
// posuvem vzduchem (`rampEntryClear`, pravidlo 5).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures', 'cam-cases', 'round-r10-valley-holder.camprog');
const loadProg = () => JSON.parse(readFileSync(FIXTURE, 'utf8'));

// Průchody u pravé stěny hrbu: končí na offsetu stěny (Z ≈ 148,2…148,6).
const atWall = (p) => p.type === 'long' && Number.isFinite(p.x)
  && p.zEnd > 148 && p.zEnd < 148.7 && p.zStart > p.zEnd;

describe('CAM: kulatá R 10 — úsek 2 (bok hrbu a drážka)', () => {
  it('vrstvy u stěny hrbu sjedou až na dno (X 19,243 + 0,02)', async () => {
    const { calc } = await runCamProg(loadProg());
    const xs = calc.passes.filter(atWall).map(p => p.x);
    for (const x of [29.409, 26.909, 24.409, 21.909, 19.409]) {
      expect(xs.some(v => Math.abs(v - x) < 0.01), `chybí vrstva X ${x}`).toBe(true);
    }
    // Poslední tenčí vrstva na dně (dno drážky u hrbu X 19,243).
    expect(Math.min(...xs)).toBeLessThan(19.3);
  });

  it('do drážky se zanořuje rampou 45° z povrchu a dál řetězem, ne kolmo', async () => {
    const { calc } = await runCamProg(loadProg());
    const groove = calc.passes.filter(p => atWall(p) && p.x < 27.5);
    expect(groove.length).toBeGreaterThanOrEqual(4);
    for (const p of groove) {
      expect(p.ramp, `vrstva X ${p.x.toFixed(3)} bez rampy`).toBeTruthy();
      const slope = Math.abs(p.ramp.x0 - p.x) / Math.abs(p.ramp.z0 - p.zStart);
      expect(slope).toBeLessThanOrEqual(1 + 1e-3);                    // ≤ 45°
      expect(p.ramp.x0 - p.x).toBeLessThanOrEqual(2.5 + 0.05);          // ≤ ap
    }
    // První vrstva v drážce začíná napravo (rampa z povrchu), ne u stěny.
    const first = groove.reduce((a, b) => (a.x > b.x ? a : b));
    expect(first.zStart).toBeGreaterThan(175);
  });

  it('k rampě do drážky se nesjíždí posuvem vzduchem (pravidlo 5)', async () => {
    const { gcode } = await runCamProg(loadProg());
    const lines = gcode.split('\n');
    const bad = [];
    let x = null;
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].replace(/;.*/, '');
      const mx = /X(-?[\d.]+)/.exec(t);
      if (/Rampa/.test(lines[i])) {
        const mz = /Z(-?[\d.]+)/.exec(t);
        const prev = lines[i - 1].replace(/;.*/, '');
        const pm = /^N\d+\s+G1\s+X(-?[\d.]+)\s+F/.exec(prev.trim());
        if (mz && +mz[1] > 170 && +mz[1] < 185 && pm) {
          const before = lines[i - 2].replace(/;.*/, '');
          const bm = /X(-?[\d.]+)/.exec(before);
          const from = bm ? +bm[1] : x;
          if (from !== null && from - +pm[1] > 1.6) bad.push(`${prev.trim()} (z X ${from})`);
        }
      }
      if (mx) x = +mx[1];
    }
    expect(bad, `sjezd k rampě posuvem vzduchem:\n${bad.join('\n')}`).toEqual([]);
  });

  it('bez kolize držáku v úseku 2', async () => {
    const run = await runCamProg(loadProg());
    const issues = validateToolpath(run.calcSim.simPath, run.params, run.calc.stockPathSegments,
      { planStock: true });
    const inSection = issues.filter(i => (i.z ?? 0) > 101 && (i.z ?? 0) < 196);
    expect(inSection.length, JSON.stringify(inSection.map(i => ({ k: i.kind, z: +(i.z || 0).toFixed(1), a: +(i.area || 0).toFixed(1) })))).toBe(0);
  });
});
