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
    // Žádný ŠIKMÝ posuv přes údolí Z 200 → 168 (dno je pro držák nedosažitelné).
    const spans = (m, lo, hi) => Math.min(m.z0, m.z) < lo && Math.max(m.z0, m.z) > hi;
    const bridges = fin.filter(m => m.g !== 'G0' && m.z0 !== null
      && spans(m, 168, 200) && Math.abs(m.x - m.x0) > 1);
    expect(bridges.map(m => m.line)).toEqual([]);
    expect(gcode).not.toMatch(/X7\.675 Z166\.145/);
    expect(gcode).not.toMatch(/X12\.077 Z138\.970/);
    // Dno X 8,743 mezi body 11 a 12 se dokončí až do rohu u čela Z 138 a dráha
    // pokračuje rovnou nahoru po čele — žádný sjezd podél čela zvlášť
    // (`N9660 G1 X9.661 F0.1`, uživatel 8. 10. 2026). Hlídání držáku dřív
    // zakázalo celé dno kvůli přesahu offsetu v rohu (ops/finish.js).
    const iFloor = fin.findIndex(m => m.g === 'G1' && Math.abs(m.x - 9.543) < 0.01 && m.z < 139.2 && m.z0 > 146);
    expect(iFloor, fin.map(m => m.line).join('\n')).toBeGreaterThan(0);
    expect(fin[iFloor + 1].g).toBe('G1');
    expect(fin[iFloor + 1].x).toBeGreaterThan(39);
    expect(fin.some(m => m.g === 'G1' && Math.abs(m.z - m.z0) < 1e-6 && m.x0 > 30 && m.x < 10)).toBe(false);
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

  it('rovný průměr nejede tam, kam se nevejde držák (part-16, válec X 27,856)', async () => {
    // Úsek válce Z 67 → 55 vyřadil filtr „držák × nevyhrubovaný zbytek"
    // (ops/finishEmit.js) a rovný průměr na konci řetězu po něm dřív jel
    // celých 15 mm (`G1 X27.856 Z52.037 ; Rovný průměr`) a ven posuvem
    // materiálem. Uživatel 8. 10. 2026: „oprav ten Rovný průměr, ať hlídá držák".
    const { gcode } = await runCamProgFile(join(__dirname, 'fixtures', 'cam', 'part-16-face-holder.camprog'));
    const runOuts = gcode.split('\n').filter(l => /Rovný průměr/.test(l));
    expect(runOuts.filter(l => /X27\.856/.test(l))).toEqual([]);
  });

  it('šikmý odskok čelního průchodu neřeže tělem plátku pod mělčím sousedem', async () => {
    // Rovné dno upichováku sahá 3,4 mm k obrobené straně; odskok pod 45° ho
    // posune o 2 mm do pásu, který vybral jen mělčí průchod — tělo tam bokem
    // ujedlo klín (`N4390 G1 X16.361 Z196.932` 0,69 mm², 10 odskoků). Měří se
    // modelem úběru: šikmý odskok v hrubování nesmí nic ubrat.
    const { MaterialRemoval } = await import('../js/calculators/cam/materialRemoval.js');
    const r = await runCamProgFile(FILE);
    const sp = r.calcSim.simPath, L = r.gcode.split('\n');
    const iFin = L.findIndex(l => /DOKONCOVANI/.test(l));
    const rm = new MaterialRemoval(r.params, r.calcSim.stockPathSegments, {});
    const bad = [];
    for (let i = 1; i < sp.length; i++) {
      const before = Math.abs(rm.model.area());
      rm.advanceTo(sp, i);
      const cut = before - Math.abs(rm.model.area());
      const a = sp[i - 1], b = sp[i], idx = sp[i].originalLineIdx;
      const txt = (L[idx] || '').trim();
      if (idx < iFin && b.type !== 'G0' && b.x > a.x + 0.5 && Math.abs(b.z - a.z) > 0.5
        && /^N\d+ G1 X[\d.]+ Z[-\d.]+$/.test(txt) && cut > 0.05) bad.push(`${txt} (${cut.toFixed(2)} mm²)`);
    }
    expect(bad).toEqual([]);
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
