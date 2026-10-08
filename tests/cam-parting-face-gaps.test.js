// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – upichovák čelně: mezery v dokončování a schod u čela     ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Díl uživatele `projekt_2026-10-08 (1)`, úsek 1 — upichovák MGEHR2525-5
// (MGMN500, šířka 5, rε 0,8), čelní hrubování zprava, dokončování po obálce.
//
//  1. Dokončování: kde hlídání držáku vynechalo úsek (stěna Z 205 a dno
//     údolí, dno u stěny Z 138), obálka plátku zbylé body spojila rovnou
//     čarou posuvem: `N9550 G1 X7.675 Z166.145`, `N9590 G1 X12.077 Z138.970`
//     („přejezd normálním posuvem", „šikmina, nekopíruje hotovní konturu").
//  2. Táž spojka byla překážkou rychloposuvů — přejezdy čelních průchodů
//     v údolí pod ní vyskakovaly `N4630 G0 X69.277 ; Výjezd nad konturu`.
//  3. Za čelem dílu (Z 0) dojezd „bez schodků" vedl ode dna zápichu šikmo
//     k čelu: `N9300 G1 X31.866 Z-4.468` — schod teď bere svislý zápich.
import { describe, it, expect } from 'vitest';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runCamProgFile } from './helpers/camHeadless.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, 'fixtures', 'cam-cases', 'parting-face-holder-gaps.camprog');

const moves = (block) => {
  const out = [];
  let x = null, z = null;
  for (const l of block) {
    const m = /^N\d+ (G[0-3])\b(.*)$/.exec(l.trim());
    if (!m) continue;
    const mx = /X(-?[\d.]+)/.exec(m[2]), mz = /Z(-?[\d.]+)/.exec(m[2]);
    const nx = mx ? +mx[1] : x, nz = mz ? +mz[1] : z;
    out.push({ g: m[1], x0: x, z0: z, x: nx, z: nz, line: l.trim() });
    x = nx; z = nz;
  }
  return out;
};

describe('upichovák čelně — díl uživatele 8. 10. 2026', () => {
  it('dokončování nepřejíždí vynechaný úsek posuvem a nekreslí šikminy přes roh', async () => {
    const { gcode } = await runCamProgFile(FILE);
    const lines = gcode.split('\n');
    const a = lines.findIndex(l => /DOKONCOVANI/.test(l)), b = lines.findIndex(l => /KONTURA/.test(l));
    const fin = moves(lines.slice(a, b));
    // Žádný posuv přes vynechaná místa (pro držák nedosažitelná): údolí
    // Z 200 → 168 ani dno u stěny Z 146 → 139,2 nepřejede jediný G1 „most".
    const spans = (m, lo, hi) => Math.min(m.z0, m.z) < lo && Math.max(m.z0, m.z) > hi;
    const bridges = fin.filter(m => m.g !== 'G0' && m.z0 !== null
      && (spans(m, 168, 200) || spans(m, 139.2, 146)));
    expect(bridges.map(m => m.line)).toEqual([]);
    expect(gcode).not.toMatch(/X7\.675 Z166\.145/);
    expect(gcode).not.toMatch(/X12\.077 Z138\.970/);
    // Mezi ramenem Z 209 a sražením Z 166 je rychloposuv (nový řetěz).
    const iEnd = fin.findIndex(m => m.g === 'G1' && Math.abs(m.x - 30.956) < 0.01 && m.z < 202);
    const iNext = fin.findIndex(m => m.g === 'G1' && m.z < 167 && m.z > 164);
    expect(iEnd).toBeGreaterThan(0);
    expect(iNext).toBeGreaterThan(iEnd);
    expect(fin.slice(iEnd + 1, iNext).some(m => m.g === 'G0')).toBe(true);
  });

  it('přejezdy čelních průchodů v údolí nevyskakují nad konturu', async () => {
    const { gcode } = await runCamProgFile(FILE);
    const lines = gcode.split('\n');
    const rough = lines.slice(lines.findIndex(l => /HRUBOVANI/.test(l)), lines.findIndex(l => /DOKONCOVANI/.test(l)));
    // Údolí Z 190 → 170 (dno X 8,044): přejezd mezi průchody jen nad polotovar
    // (X 16,744 + vůle), ne na X 69,277.
    const valley = moves(rough).filter(m => m.g === 'G0' && m.z0 !== null && m.z0 < 190 && m.z0 > 170 && m.x > m.x0);
    expect(valley.length).toBeGreaterThan(0);
    for (const m of valley) expect(m.x, m.line).toBeLessThan(25);
  });

  it('schod u čela Z 0 bere svislý zápich, ne šikmý výjezd k čelu', async () => {
    const { gcode } = await runCamProgFile(FILE);
    expect(gcode).not.toMatch(/X31\.866 Z-4\.468/);
    const rough = moves(gcode.split('\n'));
    // Zápich Z −5,068 odjede svisle …
    const k = rough.findIndex(m => m.g === 'G1' && Math.abs(m.z - -5.068) < 1e-3 && Math.abs(m.x - 20.566) < 1e-3);
    expect(k).toBeGreaterThan(0);
    expect(rough[k + 1].line).toMatch(/Výjezd v X \(stěna\)/);
    // … a hned za ním svislý zápich na Z −4,73 (tělo plátku 0,02 mm před
    // přídavkem čela) do téže hloubky, bez dojezdu.
    const q = rough.slice(k + 2).find(m => m.g === 'G1');
    expect(q.z).toBeCloseTo(-4.73, 2);
    expect(q.x).toBeCloseTo(20.566, 3);
    expect(q.x0).toBeLessThan(36);   // rychloposuv až nad schod, ne od povrchu polotovaru
  });
});
