// ╔══════════════════════════════════════════════════════════════╗
// ║  Jen dokončení v díře (Hot. + ◎ Vnitřní) — ops/boreFinish.js   ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Doplnění pravidla 13 (docs/cam-pravidla.md, schválil uživatel 22. 10. 2026):
// vnější Hot. v zrcadle — jeden dokončovací průchod po stěně díry, bez
// hrubování; polotovar = hotový obrys zmenšený o přídavky (stěna Ph + PX,
// dno Ph + PZ); tyč se musí vejít do VYHRUBOVANÉ díry (nejužší místo od
// ústí po špičku), ne do předvrtání. Hlídá se: dráha je táž jako dokončení
// po hrubování („Dokončit stěnu díry"), žádné hrubovací průchody ani
// předvrtání vrtákem, žádná hlášení o nevyhrubovaném zbytku, tlustší tyč
// projde, zleva = zrcadlo zprava.
import { describe, it, expect } from 'vitest';
import { runCamProg } from './helpers/camHeadless.mjs';
import { buildIsoInternalKnife } from '../js/calculators/isoInternalTools.js';
import { boreGeom, wallRadius } from '../js/calculators/cam/ops/bore.js';
import { roughedMaterial, roughedProfile, wallMinFrom } from '../js/calculators/cam/ops/boreFinish.js';

const P = (pts) => pts.map(([z, x], i) => ({ id: i + 1, type: i ? 'G1' : 'G0', x, z, r: 0, mode: 'ABS' }));
const mirZ = (pts) => pts.map(([z, x]) => [-z, x]);
// Díra od ústí dovnitř: sražení 1×45°, ⌀40 do Z−15, schod, ⌀30 do Z−30, dno k předvrtání ⌀25.
const BORE = [[0, 21], [-1, 20], [-15, 20], [-15, 15], [-30, 15], [-30, 12.5]];
const OUTER = [[0, 30], [-40, 30], [-40, 0]];
const CONNECTED = [...[...BORE].reverse(), ...OUTER];

const base = {
  mode: 'RADIUS', speed: 180, feed: 0.2, depthOfCut: 1.5, retractDistance: 1, allowanceX: 0.3, allowanceZ: 0.1,
  noStepRoughing: true, stockMode: 'cylinder', stockDiameter: 62, stockLength: 42, stockFace: 1, safeX: 50, safeZ: 5,
  controlSystem: 'sinumerik', ...buildIsoInternalKnife('BCL', { bar: 20 }).tool,
  boreActive: true, boreSource: 'cad', borePreDiameter: 25, borePreDepth: 35,
};
const cyl = { boreSource: 'cylinder', boreDiameter: 40, boreDepth: 25, boreZStart: 0 };

/** Pohybové řádky od značky VYVRTAVANI / od dokončení (bez N). */
function moves(gcode, from = 'VYVRTAVANI') {
  const out = [];
  let on = false;
  for (const l of gcode.split('\n')) {
    if (l.includes(from)) on = true;
    if (!on) continue;
    if (/\bM30\b/.test(l)) break;
    const code = l.split(/[;(]/)[0].replace(/^N\d+\s+/, '').trim();
    if (/\bG0?[0-3]\b/.test(code)) out.push(code);
  }
  return out;
}
const xz = (l) => {
  const mx = l.match(/X(-?\d*\.?\d+)/), mz = l.match(/Z(-?\d*\.?\d+)/);
  return { x: mx ? +mx[1] : null, z: mz ? +mz[1] : null };
};

describe('jen dokončení v díře — program', () => {
  it('jediný dokončovací průchod po stěně: týž jako dokončení po hrubování, bez hrubování a hlášení', async () => {
    const fin = await runCamProg({ params: { ...base, finishOnly: true }, contourPoints: P(CONNECTED), stockPoints: [] });
    const rough = await runCamProg({ params: { ...base, boreFinish: true }, contourPoints: P(CONNECTED), stockPoints: [] });
    expect(fin.gcode).toContain('JEN DOKONCENI');
    expect(fin.S.genNotes.map(n => n.msg)).toEqual([]);
    // Mezi značkou díry a dokončením žádný řezný pohyb (hrubování).
    const before = moves(fin.gcode).slice(0, moves(fin.gcode).length - moves(fin.gcode, 'DOKONCOVANI').length);
    expect(before.some(l => /\bG0?1\b/.test(l))).toBe(false);
    expect(moves(fin.gcode, 'DOKONCOVANI')).toEqual(moves(rough.gcode, 'DOKONCOVANI'));
    const xs = moves(fin.gcode, 'DOKONCOVANI').map(l => xz(l).x).filter(v => v !== null);
    for (const r of [19.2, 14.2, 11.7]) expect(xs).toContain(r);   // stěna − rε, dno k předvrtání
  });

  it('předvrtání vrtákem se nevrtá — díra je vyhrubovaná', async () => {
    const toolMagazine = [{ slot: 5, name: 'Vrtak HSS D25', shape: 'drill', radius: 12.5, tipAngle: 118, length: 120, f: 0.2, vc: 25 }];
    const res = await runCamProg({ params: { ...base, ...cyl, finishOnly: true, borePreDrill: true }, contourPoints: P(OUTER), stockPoints: [], toolMagazine });
    expect(res.gcode).not.toMatch(/Vrtak/);
    expect(res.gcode).toContain('JEN DOKONCENI');
  });

  it('tyč ⌀25 se do předvrtání ⌀25 nevejde, do vyhrubované díry ano', async () => {
    const bar25 = { ...base, ...cyl, ...buildIsoInternalKnife('BCL', { bar: 25 }).tool };
    expect(boreGeom(bar25).ok).toBe(false);
    expect(boreGeom({ ...bar25, finishOnly: true }).ok).toBe(true);
    const res = await runCamProg({ params: { ...bar25, finishOnly: true }, contourPoints: P(OUTER), stockPoints: [] });
    expect(res.S.genNotes.some(n => /nevejde/.test(n.msg))).toBe(false);
    expect(moves(res.gcode, 'DOKONCOVANI').length).toBeGreaterThan(3);
  });

  it('díra hlubší než plný ⌀ vrtáku (předvrtání se špičkou): dno se dokončí k předvrtání', async () => {
    // Nález v prohlížeči 22. 10. 2026: pod dnem zůstal v zrcadle materiál až
    // k ose a dokončení skončilo na stěně nad dnem.
    const toolMagazine = [{ slot: 5, name: 'Vrtak HSS D20', shape: 'drill', radius: 10, tipAngle: 118, length: 120, f: 0.2, vc: 25 }];
    const p = { ...base, ...cyl, boreDiameter: 30, boreDepth: 20, borePreDrill: true, finishOnly: true };
    const res = await runCamProg({ params: p, contourPoints: P(OUTER), stockPoints: [], toolMagazine });
    expect(res.S.params.borePreTip).toBeGreaterThan(5);                     // špička vrtáku: díra hlubší než plný ⌀
    expect(res.S.genNotes.map(n => n.msg)).toEqual([]);
    const mv = moves(res.gcode, 'DOKONCOVANI').map(xz);
    expect(mv.some(m => m.x === 14.2)).toBe(true);                          // stěna ⌀30 − rε
    expect(mv.some(m => m.z === -19.2)).toBe(true);                         // dno Z−20 + rε
    expect(mv.some(m => m.x !== null && m.x <= 10 - 0.8 + 1e-3)).toBe(true);   // po dně až k předvrtání
  });

  it('zleva = zrcadlo zprava', async () => {
    const flip = (l) => l.replace(/Z(-?\d*\.?\d+)/g, (_, v) => { const z = -parseFloat(v); return 'Z' + (Math.abs(z) < 5e-4 ? 0 : z).toFixed(3); })
      .replace(/([XZ])(-?\d*\.?\d+)/g, (_, a, v) => a + (+parseFloat(v).toFixed(3)));
    const norm = (l) => l.replace(/([XZ])(-?\d*\.?\d+)/g, (_, a, v) => a + (+parseFloat(v).toFixed(3)));
    const p = { ...base, ...cyl, finishOnly: true };
    const r = await runCamProg({ params: { ...p, roughingSide: 'right' }, contourPoints: P(OUTER), stockPoints: [] });
    const l = await runCamProg({ params: { ...p, roughingSide: 'left' }, contourPoints: P(mirZ(OUTER)), stockPoints: [] });
    // Po poslední G1: odjezd před čelo k Bezpečné poloze stroje — ta leží
    // vpravo, zleva tedy Z před levým čelem, ne zrcadlo (jako u hrubování).
    const cut = (ls) => ls.slice(0, ls.map(x => /\bG0?1\b/.test(x)).lastIndexOf(true) + 1);
    const mr = cut(moves(r.gcode, 'DOKONCOVANI'));
    expect(mr.length).toBeGreaterThan(3);
    expect(cut(moves(l.gcode, 'DOKONCOVANI')).map(norm)).toEqual(mr.map(flip));
  });
});

describe('vyhrubovaná díra — polotovar a protější stěna', () => {
  const o = { s: 1, zF: 0, r0: 12.5, rRef: 25, depth: 35, aRad: 0.3, aAx: 0.1 };
  const hole = [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: -25 }, { x: 0, z: -25 }];
  const prof = roughedProfile(roughedMaterial(hole, o), o);

  it('stěna o přídavek X blíž k ose, dno o přídavek Z výš, pod dnem předvrtání', () => {
    const at = (z) => prof.filter(p => Math.abs(p.z - z) < 1e-3).map(p => +p.r.toFixed(3));
    expect(at(0)).toEqual([19.7]);
    expect(at(-24.9)).toEqual([19.7, 12.5]);
    expect(at(-35)).toEqual([12.5]);
  });

  it('protější stěna = nejužší místo od ústí po špičku', () => {
    expect(wallMinFrom(prof, -10)).toBeCloseTo(19.7, 3);
    expect(wallMinFrom(prof, -30)).toBeCloseTo(12.5, 3);
    const g = boreGeom({ ...base, ...cyl, finishOnly: true });
    expect(wallRadius(g, -10)).toBeCloseTo(19.7, 3);
    expect(wallRadius(boreGeom({ ...base, ...cyl }), -10)).toBe(12.5);   // hrubování: předvrtání
  });
});
