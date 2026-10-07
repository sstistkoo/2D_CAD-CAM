// ╔══════════════════════════════════════════════════════════════╗
// ║  Vrtání (operace Vrtání, nástroj ⌀ vrták)                      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// drillActive generuje vrtací cyklus v ose (X0) místo hrubování:
//   • záběry Q od Z čela, poslední na dno (na špičku / na plný ⌀),
//   • vyjíždění (G83): mezi záběry z díry ven na R rovinu a zpět nad dno,
//     lámání (G73): jen odskok,
//   • G97 konstantní otáčky z Vc a ⌀, prodleva v dialektu systému,
//   • radiální rychloposuvy mimo polotovar (R rovina × čelo polotovaru),
//   • nástroj, který není vrták, nevrtá.
// Model nástroje: stopa = přesný obrys vrtáku, držák = pouzdro v ose.
import { describe, it, expect } from 'vitest';
import { runCamProg } from './helpers/camHeadless.mjs';
import { getInsert } from '../js/calculators/cam/inserts/index.js';
import { toolFootprint, toolFootprintVisual, MaterialRemoval, buildStockLoopRaw } from '../js/calculators/cam/materialRemoval.js';
import { holderProfileLoop, validateToolpath } from '../js/calculators/cam/collisionValidator.js';
import { polyArea } from '../js/geom/geomCore.js';
import { convertGCodeControlSystem } from '../js/calculators/cam/controlDialect.js';

const baseParams = {
  machineType: 'LIMS=2000', mode: 'RADIUS', toolName: 'Vrtak D20', speed: 25, feed: 0.2,
  depthOfCut: 2, retractDistance: 2, allowanceX: 0, allowanceZ: 0, finishAllowance: 0,
  doFinishing: false, roughingStrategy: 'longitudinal', roughingSide: 'right',
  stockMode: 'cylinder', stockDiameter: 44, stockLength: 60, stockFace: 2,
  safeX: 150, safeZ: 5, machineStructure: 'lathe', controlSystem: 'sinumerik',
  toolShape: 'drill', toolRadius: 10, toolTipAngle: 118, toolLength: 100, toolAngle: 0,
  toolClearanceAngle: 0, holderWidth: 40, holderLength: 60, holderProfile: null,
  respectInsertGeometry: true, rapidClearance: 1, partOffZ: null, threadActive: false,
  drillActive: true, drillZStart: 0, drillDepth: 20, drillDepthFullDia: false,
  drillClearance: 2, drillPeck: 5, drillChipMode: 'clear', drillRetract: 1, drillDwell: 0,
};
const contourPoints = [
  { id: 1, type: 'G0', x: 0, z: 0, r: 0, mode: 'ABS' },
  { id: 2, type: 'G1', x: 20, z: 0, r: 0, mode: 'ABS' },
  { id: 3, type: 'G1', x: 20, z: -50, r: 0, mode: 'ABS' },
  { id: 4, type: 'G1', x: 0, z: -50, r: 0, mode: 'ABS' },
];
const prog = (over) => ({ params: { ...baseParams, ...over }, contourPoints, stockPoints: [], flipX: false, flipZ: false });

// Tělo cyklu VRTANI → pohyby {g, x?, z?} v pořadí.
function moves(gcode) {
  const lines = gcode.split('\n');
  const start = lines.findIndex(l => l.includes('VRTANI'));
  const end = lines.findIndex((l, i) => i > start && l.includes('KONTURA'));
  const body = lines.slice(start, end);
  return {
    body,
    mv: body.map(l => {
      const g = (l.match(/\b(G0|G1)\b/) || [])[1];
      if (!g) return null;
      const x = l.match(/ X([\-0-9.]+)/), z = l.match(/ Z([\-0-9.]+)/);
      return { g, x: x ? parseFloat(x[1]) : undefined, z: z ? parseFloat(z[1]) : undefined };
    }).filter(Boolean),
  };
}

describe('Vrtání (operace Vrtání)', () => {
  it('vyjíždění: záběry po 5 mm od vjezdu do materiálu, mezi nimi ven na R rovinu a zpět 1 mm nad dno', async () => {
    const { gcode } = await runCamProg(prog({}));
    const { body, mv } = moves(gcode);
    expect(body.some(l => /G97 S398\b/.test(l))).toBe(true);        // 25·1000/(π·20) = 397,9
    // Polotovar má čelo Z2 (2 mm nad čelem dílu) — vrták vjede do materiálu
    // tam, ne na Z0, a odtud se počítá Q (nález 7. 10. 2026: odlitek před
    // čelem + Q v jednom záběru).
    expect(mv.filter(m => m.g === 'G1').map(m => m.z)).toEqual([-3, -8, -13, -18, -20]);
    expect(body.filter(l => /\bG1\b/.test(l)).every(l => / F0\.2\b/.test(l))).toBe(true);
    // Příjezd: R rovina Z0 + 2 by ležela v pásu vůle před čelem polotovaru
    // (Z2 + vůle 1) — polotovar končí na offsetové čáře, R rovina se posune na Z3.
    expect(mv.slice(0, 2)).toEqual([{ g: 'G0', z: 3 }, { g: 'G0', x: 0 }]);
    // Mezi záběry: G0 Z3 (ven) → G0 Z(dno + 1).
    const g0z = mv.filter(m => m.g === 'G0' && m.z !== undefined).map(m => m.z);
    expect(g0z.slice(1, 9)).toEqual([3, -2, 3, -7, 3, -12, 3, -17]);
    // Odjezd: z díry, radiálně ven, pak v Z na bezpečnou polohu.
    expect(mv.slice(-3)).toEqual([{ g: 'G0', z: 3 }, { g: 'G0', x: 150 }, { g: 'G0', z: 5 }]);
    expect(body.some(l => /\bG96 S25\b/.test(l))).toBe(true);
  });

  it('lámání třísky: mezi záběry jen odskok o 1 mm, bez vyjetí z díry', async () => {
    const { gcode } = await runCamProg(prog({ drillChipMode: 'break' }));
    const g0z = moves(gcode).mv.filter(m => m.g === 'G0' && m.z !== undefined).map(m => m.z);
    expect(g0z).toEqual([3, -2, -7, -12, -17, 3, 5]);
  });

  it('čelo polotovaru za R rovinou nehýbe: R = Z čelo + bezpečná vzdálenost', async () => {
    const { gcode } = await runCamProg(prog({ stockFace: 0, drillClearance: 2 }));
    expect(moves(gcode).mv[0]).toEqual({ g: 'G0', z: 2 });
  });

  it('hloubka na plný ⌀ přidá délku špičky r/tan(σ/2); Q 0 = jeden zátah', async () => {
    const { gcode } = await runCamProg(prog({ drillDepthFullDia: true, drillPeck: 0 }));
    const g1 = moves(gcode).mv.filter(m => m.g === 'G1');
    expect(g1.length).toBe(1);
    expect(g1[0].z).toBeCloseTo(-(20 + 10 / Math.tan(59 * Math.PI / 180)), 3);
  });

  it('prodleva na dně v dialektu: Sinumerik G4 F, Fanuc G04 P (ms), Heidenhain G04 F', async () => {
    const sin = await runCamProg(prog({ drillDwell: 0.5 }));
    expect(moves(sin.gcode).body.some(l => /\bG4 F0\.5\b/.test(l))).toBe(true);
    const fan = await runCamProg(prog({ drillDwell: 0.5, controlSystem: 'fanuc' }));
    expect(moves(fan.gcode).body.some(l => /\bG04 P500\b/.test(l))).toBe(true);
    const hei = await runCamProg(prog({ drillDwell: 0.5, controlSystem: 'heidenhain' }));
    expect(moves(hei.gcode).body.some(l => /\bG04 F0\.5\b/.test(l))).toBe(true);
    // Simulace prodlevu nebere jako pohyb (P/F nejsou souřadnice): řádek
    // s G04 nemá v dráze žádný bod (X/U by se četly jako pohyb).
    const dwellIdx = fan.gcode.split('\n').findIndex(l => /\bG04 P500\b/.test(l));
    expect(dwellIdx).toBeGreaterThan(0);
    expect(fan.calcSim.simPath.some(p => p.originalLineIdx === dwellIdx)).toBe(false);
    // Přepnutí řídicího systému převede i prodlevu (tam i zpět).
    const toFanuc = convertGCodeControlSystem(sin.gcode, 'sinumerik', 'fanuc', sin.params, false, false);
    expect(toFanuc).toMatch(/\bG04 P500\b/);
    expect(toFanuc).not.toMatch(/\bG4 F/);
    const toHei = convertGCodeControlSystem(toFanuc, 'fanuc', 'heidenhain', sin.params, false, false);
    expect(toHei).toMatch(/\bG04 F0\.5\b/);
  });

  it('zleva vrtá k +Z a vrták/pouzdro se zrcadlí', async () => {
    const { gcode } = await runCamProg(prog({ roughingSide: 'left', drillZStart: -50, drillDepth: 10, drillPeck: 0 }));
    const mv = moves(gcode).mv;
    expect(mv.find(m => m.g === 'G1').z).toBe(-40);
    expect(mv[0].z).toBeLessThan(-60);                      // radiálně mimo levé čelo polotovaru
  });

  it('vrták vrtá i s vypnutým Vrtáním — a závit/upich s ním vypne (nález 7. 10. 2026)', async () => {
    // Uživatel dal do úseku vrták ⌀5, Vrtání nechal „Neaktivní" a 🔄 Dráhy
    // vyrobily HRUBOVÁNÍ vrtákem. Vrták umí jen vrtat: operaci určuje nástroj.
    const r = await runCamProg(prog({ drillActive: false, threadActive: true, partOffZ: -30 }));
    expect(r.gcode).toMatch(/VRTANI/);
    expect(r.gcode).not.toMatch(/HRUBOVANI|ZAVITOVANI|UPICHNUTI/);
    expect([r.params.drillActive, r.params.threadActive, r.params.partOffZ]).toEqual([true, false, null]);
  });

  it('Z čelo prázdné = čelo dílu na straně obrábění (díl od Z0 doprava, nález 7. 10. 2026)', async () => {
    // Kontura posunutá doprava: čelo Z60, díl až k Z10. Výchozí Z0 vrtalo od
    // LEVÉHO konce skrz celý kus.
    const shifted = contourPoints.map(p => ({ ...p, z: p.z + 60 }));
    const run = (over) => runCamProg({ ...prog(over), contourPoints: shifted });
    const auto = moves((await run({ drillZStart: null, stockMode: 'cylinder', stockFace: 62, stockLength: 60 })).gcode).mv;
    expect(auto.filter(m => m.g === 'G1').map(m => m.z)).toEqual([57, 52, 47, 42, 40]);   // Q od čela polotovaru Z62
    expect(auto[0]).toEqual({ g: 'G0', z: 63 });                      // R rovina za čelem polotovaru Z62 + vůle 1
    const left = moves((await run({ drillZStart: null, roughingSide: 'left', drillPeck: 0, drillDepth: 5 })).gcode).mv;
    expect(left.find(m => m.g === 'G1').z).toBe(15);                    // zleva čelo Z10 → +5
  });

  it('odlitek přesahující čelo: první záběr je Q od vjezdu do odlitku, ne odlitek + Q', async () => {
    // Odlitek sahá 22 mm před čelo dílu (jako díl uživatele: čelo Z346,4,
    // odlitek do Z368,9) — dřív první posuv jel 22 + Q mm bez výjezdu.
    const stockPoints = [
      { id: 11, type: 'G0', x: 0, z: 22, r: 0, mode: 'ABS' },
      { id: 12, type: 'G1', x: 24, z: 22, r: 0, mode: 'ABS' },
      { id: 13, type: 'G1', x: 24, z: -55, r: 0, mode: 'ABS' },
      { id: 14, type: 'G1', x: 0, z: -55, r: 0, mode: 'ABS' },
    ];
    const r = await runCamProg({ ...prog({ stockMode: 'casting', drillZStart: null }), stockPoints });
    const mv = moves(r.gcode).mv;
    const g1 = mv.filter(m => m.g === 'G1').map(m => m.z);
    expect(mv[0].z).toBeGreaterThan(22);                                // R rovina za odlitkem
    expect(g1[0]).toBeCloseTo(17, 3);                                   // 22 − Q
    for (let i = 1; i < g1.length; i++) expect(g1[i - 1] - g1[i]).toBeLessThanOrEqual(5 + 1e-6);
    expect(g1[g1.length - 1]).toBe(-20);
    expect(validateToolpath(r.calcSim.simPath, r.params, r.calcSim.stockPathSegments, { planStock: true })).toEqual([]);
  });

  it('soustružnický nůž vrtání vypne — hrubuje se jako dřív', async () => {
    const r = await runCamProg(prog({ toolShape: 'round', toolRadius: 0.8, drillActive: true }));
    expect(r.gcode).not.toMatch(/VRTANI/);
    expect(r.gcode).toMatch(/HRUBOVANI/);
    expect(r.params.drillActive).toBe(false);
  });

  it('simulace: díra ⌀20 odebrána obrysem vrtáku, bez kolize; krátké vyložení → náraz pouzdra', async () => {
    const r = await runCamProg(prog({}));
    const prm = r.params;
    const path = r.calcSim.simPath;
    const base = buildStockLoopRaw(prm, r.calcSim.stockPathSegments);
    const rm = new MaterialRemoval(prm, r.calcSim.stockPathSegments);
    rm.advanceTo(path, path.length - 1);
    const left = Math.abs(polyArea(rm.model.loops));
    // Polovina řezu: válec r10 od čela Z2 k Z−20 minus kužel špičky.
    const cone = 0.5 * 10 * (10 / Math.tan(59 * Math.PI / 180));
    expect(Math.abs(polyArea([base])) - left).toBeCloseTo(10 * 22 - cone, 0);
    expect(validateToolpath(path, prm, r.calcSim.stockPathSegments, { planStock: true })).toEqual([]);

    const short = await runCamProg(prog({ toolLength: 30, drillDepth: 40 }));
    const issues = validateToolpath(short.calcSim.simPath, short.params, short.calcSim.stockPathSegments, { planStock: true });
    expect(issues.some(i => i.kind === 'holder')).toBe(true);
    expect(short.S.genNotes.some(n => /vyložení vrtáku/.test(n.msg))).toBe(true);
  });

  it('model nástroje: stopa = obrys vrtáku (±r), pouzdro v ose za vyložením', () => {
    const prm = { ...baseParams };
    const ins = getInsert(prm);
    expect([ins.canDrill, ins.holderAxial, ins.footprintIsOutline]).toEqual([true, true, true]);
    expect(ins.pointLengthZ).toBeCloseTo(10 / Math.tan(59 * Math.PI / 180), 6);
    for (const side of ['right', 'left']) {
      const p = { ...prm, roughingSide: side };
      for (const foot of [toolFootprint(p), toolFootprintVisual(p)]) {
        const xs = foot.map(q => q.x), zs = foot.map(q => q.z);
        expect([Math.min(...xs), Math.max(...xs)]).toEqual([-10, 10]);
        expect(Math.max(...zs.map(Math.abs))).toBeCloseTo(100, 6);
      }
      // Orientace jako stadion ostatních plátků i zleva (toolFootprintSlim zužuje polyOffsetem).
      expect(Math.sign(polyArea([toolFootprint(p)]))).toBe(Math.sign(polyArea([toolFootprint({ ...p, toolShape: 'round' })])));
    }
    const holder = holderProfileLoop(prm);
    expect(Math.min(...holder.map(q => q.x))).toBe(100);
    expect([Math.min(...holder.map(q => q.z)), Math.max(...holder.map(q => q.z))]).toEqual([-20, 20]);
    // Ostatní plátky klíče vrtáku nezapínají.
    for (const s of ['round', 'polygon', 'parting', 'threading']) {
      const o = getInsert({ ...prm, toolShape: s });
      expect([o.canDrill, o.holderAxial, o.footprintIsOutline, o.pointLengthZ], s).toEqual([false, false, false, 0]);
    }
  });
});
