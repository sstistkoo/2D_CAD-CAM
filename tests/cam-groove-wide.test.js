// ╔══════════════════════════════════════════════════════════════╗
// ║  Vnější zápich libovolné šířky (Upich + ◯ Vnější) — pravidlo 17 ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Z = bok na straně sklíčidla (jako upich), šířka k obráběcí straně;
// zápichy vedle sebe s krokem ≤ 0,8 × šířka destičky, boky a dno
// s přídavky, dokončení bok → dno → bok. Šířka 0 = upichnutí beze změny.
import { describe, it, expect } from 'vitest';
import { runCamProg } from './helpers/camHeadless.mjs';

const base = {
  machineType: 'LIMS=2000', mode: 'RADIUS', toolName: 'T1', speed: 120, feed: 0.06,
  retractDistance: 2, partingApproachFeed: 0.5, allowanceX: 12, allowanceZ: 0, finishAllowance: 0.2,
  doFinishing: true, roughingStrategy: 'face', roughingSide: 'right', partOffSmooth: true,
  stockMode: 'cylinder', stockDiameter: 40, stockLength: 60, stockFace: 2, safeX: 150, safeZ: 5,
  machineStructure: 'lathe', controlSystem: 'sinumerik',
  toolShape: 'parting', toolLength: 3, toolRadius: 0.2, toolAngle: 0, toolTipAngle: 90, toolClearanceAngle: 0,
  respectInsertGeometry: false, rapidClearance: 1, partOffZ: 10, grooveWidth: 8,
};
const contourPoints = [
  { id: 1, type: 'G0', x: 0, z: 40, r: 0, mode: 'ABS' },
  { id: 2, type: 'G1', x: 18, z: 40, r: 0, mode: 'ABS' },
  { id: 3, type: 'G1', x: 18, z: 0, r: 0, mode: 'ABS' },
];
const run = (over = {}) => runCamProg({ params: { ...base, ...over }, contourPoints, stockPoints: [], flipX: false, flipZ: false });
function cuts(gcode) {
  const out = []; let z = null, x = null;
  for (const l of gcode.split('\n')) {
    if (l.includes('KONTURA')) break;
    const mz = /Z(-?[\d.]+)/.exec(l), mx = /X(-?[\d.]+)/.exec(l);
    if (/\bG0\b|\bG1\b/.test(l)) { if (mz) z = parseFloat(mz[1]); if (mx) x = parseFloat(mx[1]); }
    if (/\bG1\b/.test(l)) out.push({ x, z, text: l });
  }
  return out;
}

describe('vnější zápich libovolné šířky', () => {
  it('3 zápichy vedle sebe (krok 2,3 ≤ 0,8 × 3), dno s přídavkem, dokončení bok → dno → bok', async () => {
    const { gcode } = await run();
    expect(gcode).toContain('ZAPICH sirka 8');
    const c = cuts(gcode);
    // Hrubování: Z středu = 10 + 0,2 přídavek + 0,2 rádius + i·2,3; dno X 12 + R 0,2 + 0,2.
    expect(c.slice(0, 3).map(m => [m.z, m.x])).toEqual([[10.4, 12.4], [12.7, 12.4], [15, 12.4]]);
    // Dokončení: bok u sklíčidla Z 10,2 na dno X 12,2, po dně na Z 15,2, druhým bokem nahoru.
    expect(c.slice(3).map(m => [m.z, m.x])).toEqual([[10.2, 12.2], [15.2, 12.2], [15.2, 20.2]]);
  });
  it('zleva = zrcadlo v Z (šířka k −Z)', async () => {
    const c = cuts((await run({ roughingSide: 'left' })).gcode);
    expect(c.slice(0, 3).map(m => m.z)).toEqual([9.6, 7.3, 5]);
  });
  it('bez dokončení zůstane přídavek na hotovo (žádný dokončovací průchod)', async () => {
    const c = cuts((await run({ doFinishing: false })).gcode);
    expect(c).toHaveLength(3);
  });
  it('šířka 0 / šířka destičky = upichnutí beze změny', async () => {
    const a = (await run({ grooveWidth: 0 })).gcode, b = (await run({ grooveWidth: 3 })).gcode;
    expect(a).toContain('--- UPICHNUTI ---');
    expect(b).toBe(a);
  });
  it('přídavky boků se nevejdou / kulatá destička → hlášení, žádný zápich', async () => {
    expect((await run({ grooveWidth: 3.3, allowanceZ: 0.1 })).gcode).toMatch(/! Zápich 3\.3 mm se s přídavky/);
    expect((await run({ toolShape: 'round', toolRadius: 2 })).gcode).toMatch(/! Zápich širší než destička umí jen/);
  });
});
