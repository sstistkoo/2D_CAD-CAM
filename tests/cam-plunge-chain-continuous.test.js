// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – pravidlo 14: řetěz zanoření bez odjezdu                  ║
// ╚══════════════════════════════════════════════════════════════╝
//
// docs/cam-pravidla.md, pravidlo 14 (uživatel 7. 10. 2026). Díl uživatele
// `projekt_2026-10-07 (3)`, úsek 3 (kulatá R 10, 45°): za čelem dílu
// rampa `N3110 G1 X33.666 Z-11.749`, pak `N3120 G0 Z-18.996` (tělo vrstvy
// vzduchem za koncem polotovaru), odskok `N3130 G1 X35.666 Z-16.996`
// a návrat na konec rampy k další rampě. Tělo za rampou, které ze
// skutečného polotovaru nic neubere, odpadne — další rampa navazuje
// bez odskoku, jeden souvislý sjezd.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('pravidlo 14 na dílu uživatele (úsek 3, kulatá R 10, 45°)', () => {
  it('řetěz ramp za čelem jede souvisle — žádný rychloposuv za polotovar a návrat', async () => {
    const prog = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'cam-cases', 'round-r10-plunge-chain-end.camprog'), 'utf8'));
    const { gcode } = await runCamProg(prog);
    const lines = gcode.split('\n');
    const a = lines.findIndex(l => /HRUBOVANI/.test(l)), b = lines.findIndex(l => /DOKONCOVANI/.test(l));
    const rough = lines.slice(a, b).filter(l => /^N\d+/.test(l));
    // Konec první rampy za čelem a hned na něj navazující další rampa.
    const k = rough.findIndex(l => /G1 X33\.666 Z-11\.749/.test(l));
    expect(k, rough.join('\n')).toBeGreaterThan(0);
    expect(rough[k + 1]).toMatch(/G1 X29\.666 Z-15\.749 ; Rampa/);
    // Polotovar končí na Z −8 — nic nejede na Z −18,996 (tělo vzduchem).
    expect(rough.filter(l => /Z-1[6-9]\.\d/.test(l))).toEqual([]);
  });
});

// Pokračování přes hranici úseku (uživatel 7. 10. 2026: „pokud bude dobírat
// v úseku zbytek, může zajet i do dalšího úseku, aby ten zbytek dobral").
// Úsek 1 téhož dílu s nožem SRSCR2525M20 (rozsah Z 373,932 → 195,278): řetěz
// ramp po mezní čáře skončil na hranici a nad údolím zůstal zbytek.
describe('pravidlo 14 — řetěz pokračuje přes hranici úseku (úsek 1, SRSCR2525M20)', () => {
  it('za hranicí Z 195,278 sjíždí dál rampami pod 45° a odjede kolmo v X, ne posuvem materiálem', async () => {
    const prog = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'cam-cases', 'round-r10-chain-beyond-section.camprog'), 'utf8'));
    const { gcode, calc } = await runCamProg(prog);
    const beyond = (calc.passes || []).filter(p => p.chainBeyond);
    expect(beyond.length).toBeGreaterThan(0);
    for (const p of beyond) {
      expect(p.zStart).toBeLessThan(195.278);                       // za hranicí úseku
      const dx = p.ramp.x0 - p.x, dz = p.ramp.z0 - p.zStart;
      expect(Math.atan2(dx, dz) * 180 / Math.PI).toBeLessThanOrEqual(45.5);   // pod úhlem zanoření
      expect(dx).toBeLessThanOrEqual(parseFloat(prog.params.depthOfCut) + 1e-6);   // nejvýš ap
    }
    const lines = gcode.split('\n');
    const rough = lines.slice(lines.findIndex(l => /HRUBOVANI/.test(l)), lines.findIndex(l => /DOKONCOVANI/.test(l)));
    expect(rough.join('\n')).not.toMatch(/Výjezd materiálem posuvem/);
    const last = rough.findIndex(l => /Rampa/.test(l) && l.includes(`X${beyond[beyond.length - 1].x.toFixed(3)}`));
    expect(rough[last + 1]).toMatch(/Výjezd v X \(stěna\)/);
  });
});
