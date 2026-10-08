// ╔══════════════════════════════════════════════════════════════╗
// ║  Tvar díry z výkresu (cam/boreContour.js + ops/bore.js)        ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 8. 10. 2026: díru chce kreslit oběma způsoby —
//   A) samostatný řetěz (S.borePoints, sekce DIRA z přenosu),
//   B) napojenou na čelo (uzavřený řez: dno → stěna → ústí → čelo → vnější).
// Hlídá se: B se z kontury vyjme v obou směrech kreslení (běžný profil ani
// sražení čela ne), vnější hrubování pak díru vynechá (dřív jelo skrz stěnu
// dílu až k ose), A i B dají stejný program vyvrtávání a jeho dráhy zůstanou
// v díře (stěna − přídavek − rε, nic za dno, nic do předvrtání za vůli).
import { describe, it, expect } from 'vitest';
import { runCamProg } from './helpers/camHeadless.mjs';
import { buildIsoInternalKnife } from '../js/calculators/isoInternalTools.js';
import { buildIsoKnife } from '../js/calculators/isoToolCatalog.js';
import { splitBoreFromSegments, segmentsFromPoints, boreChainFromState } from '../js/calculators/cam/boreContour.js';
import { boreGeom } from '../js/calculators/cam/ops/bore.js';

const P = (pts) => pts.map(([z, x], i) => ({ id: i + 1, type: i ? 'G1' : 'G0', x, z, r: 0, mode: 'ABS' }));
// Díra od ústí dovnitř: sražení 1×45° v ústí, ⌀40 do Z−15, schod, ⌀30 do Z−30, dno k předvrtání ⌀25.
const BORE = [[0, 21], [-1, 20], [-15, 20], [-15, 15], [-30, 15], [-30, 12.5]];
const OUTER = [[0, 30], [-40, 30], [-40, 0]];
const PLAIN = [[0, 0], ...OUTER];                                   // vnější profil bez díry
const CONNECTED = [...[...BORE].reverse(), ...OUTER];               // B: dno → … → ústí → čelo → vnější
const CONNECTED_REV = [...CONNECTED].reverse();                     // B nakreslený obráceně

const bar20 = buildIsoInternalKnife('BCL', { bar: 20 }).tool;      // S20S-PCLNR09, rε 0,8
const base = {
  mode: 'RADIUS', speed: 180, feed: 0.2, depthOfCut: 1.5, retractDistance: 1, allowanceX: 0.3, allowanceZ: 0.1,
  noStepRoughing: true, stockMode: 'cylinder', stockDiameter: 62, stockLength: 42, stockFace: 1, safeX: 50, safeZ: 5,
  controlSystem: 'sinumerik', ...bar20, boreActive: true, boreSource: 'cad', borePreDiameter: 25, borePreDepth: 35,
};

/** Tělo vyvrtávání → pohyby { x (poloměr), z, line }. */
function boreMoves(gcode) {
  const out = [];
  let x = null, z = null, on = false;
  for (const l of gcode.split('\n')) {
    if (l.includes('VYVRTAVANI')) on = true;
    if (!on) continue;
    if (/\bM30\b/.test(l)) break;
    const code = l.split(/[;(]/)[0];
    const mx = code.match(/X(-?\d*\.?\d+)/), mz = code.match(/Z(-?\d*\.?\d+)/);
    if (mx) x = parseFloat(mx[1]);
    if (mz) z = parseFloat(mz[1]);
    if (/\bG0?[0-3]\b/.test(code) && (mx || mz)) out.push({ x, z, line: l });
  }
  return out;
}
const body = (gcode) => boreMoves(gcode).map(m => m.line.replace(/^N\d+\s+/, ''));

describe('díra napojená na čelo — vyjmutí z kontury', () => {
  it('kreslená ode dna i od vnějšího obrysu: díra začíná v ústí, vnější část zůstane', () => {
    for (const pts of [CONNECTED, CONNECTED_REV]) {
      const split = splitBoreFromSegments(segmentsFromPoints(P(pts), 'RADIUS'));
      expect(split).not.toBeNull();
      expect(split.bore[0].p1).toEqual({ x: 21, z: 0 });
      expect(split.bore[split.bore.length - 1].p2).toEqual({ x: 12.5, z: -30 });
      expect(split.bore.length).toBe(BORE.length - 1);
      expect(split.outer.length).toBe(OUTER.length);   // čelo + vnější ⌀ + konec k ose
    }
  });

  it('běžný profil, sražení čela ani kontura bez čela díru nemají', () => {
    for (const pts of [PLAIN, [[0, 0], [0, 28], [-2, 30], [-40, 30], [-40, 0]], OUTER]) {
      expect(splitBoreFromSegments(segmentsFromPoints(P(pts), 'RADIUS'))).toBeNull();
    }
  });

  it('vnější hrubování napojenou díru vynechá — stejné dráhy jako díl bez díry', async () => {
    const ext = { ...base, ...buildIsoKnife('CL', { shank: '2525' }).tool, boreActive: false };
    const a = (await runCamProg({ params: ext, contourPoints: P(PLAIN), stockPoints: [] })).calc.passes;
    const b = (await runCamProg({ params: ext, contourPoints: P(CONNECTED), stockPoints: [] })).calc.passes;
    expect(b.map(p => [p.x, p.zStart, p.zEnd])).toEqual(a.map(p => [p.x, p.zStart, p.zEnd]));
    // Nic uvnitř dílu: hloubky pod ⌀60 jen před čelem.
    for (const p of b) if (p.x < 30) expect(Math.min(p.zStart, p.zEnd)).toBeGreaterThan(0);
  });
});

describe('vyvrtávání díry z výkresu', () => {
  it('samostatný řetěz má přednost; bez díry ve výkresu se nevrtá a řekne to', () => {
    const S = { params: base, contourPoints: P(CONNECTED), borePoints: P(BORE.slice(0, 3)) };
    expect(boreChainFromState(S).source).toBe('separate');
    expect(boreChainFromState({ params: base, contourPoints: P(CONNECTED) }).source).toBe('connected');
    expect(boreChainFromState({ params: base, contourPoints: P(PLAIN) })).toBeNull();
    expect(boreGeom(base, null).reason).toMatch(/Ve výkresu není díra/);
  });

  it('napojená na čelo i samostatný řetěz dají tentýž program, dráhy jen v díře', async () => {
    const b = await runCamProg({ params: base, contourPoints: P(CONNECTED), stockPoints: [] });
    const a = await runCamProg({ params: base, contourPoints: P(PLAIN), borePoints: P(BORE), stockPoints: [] });
    expect(body(a.gcode)).toEqual(body(b.gcode));
    const mv = boreMoves(b.gcode);
    expect(mv.length).toBeGreaterThan(10);
    const g = boreGeom(base, boreChainFromState({ params: base, contourPoints: P(CONNECTED) }).segs);
    // Stěna díry (poloměr) v Z: sražení, ⌀40, ⌀30.
    const wall = (z) => (z > -1 ? 20 + (z + 1) : z > -15 ? 20 : 15);
    for (const m of mv.filter(q => q.z < 0)) {
      expect(m.x, m.line).toBeLessThanOrEqual(wall(m.z) - 0.3 - 0.8 + 0.02);
      expect(m.x, m.line).toBeGreaterThanOrEqual(g.rIn - 1e-3);
      expect(m.z, m.line).toBeGreaterThanOrEqual(-30 + 0.1 - 1e-3);
    }
    // Obě dna dojetá: ⌀40 (r 18,9) i ⌀30 (r 13,9).
    const xs = mv.map(m => +m.x.toFixed(3));
    expect(xs).toContain(18.9);
    expect(xs).toContain(13.9);
  });
});

describe('vyvrtávání — dokončení stěny díry (boreFinish)', () => {
  it('jede po stěně (sražení, ⌀40, schod, ⌀30, dno k předvrtání), výjezdy v díře nejdál na rIn, týmž nástrojem', async () => {
    // Vnější dokončovací nůž ve slotu 0 — do díry ho dokončení poslat nesmí.
    const toolMagazine = [{ slot: 1, name: 'PCLNR2525M12', shape: 'polygon', radius: 0.8, tipAngle: 80, toolAngle: 5, f: 0.1, vc: 250 }];
    const res = await runCamProg({ params: { ...base, boreFinish: true, finishingSlot: 0 }, contourPoints: P(CONNECTED), stockPoints: [], toolMagazine });
    const lines = res.gcode.split('\n');
    const iF = lines.findIndex(l => l.includes('DOKONCOVANI'));
    expect(iF).toBeGreaterThan(0);
    expect(res.gcode).not.toMatch(/T="PCLNR/);
    const g = boreGeom(base, boreChainFromState({ params: base, contourPoints: P(CONNECTED) }).segs);
    // boreMoves čte od značky VYVRTAVANI — dokončovací část se jí předá s ní.
    // (první nájezd jen v Z — poloha X z hrubování tu není známá, přeskočí se)
    const fin = boreMoves(['; --- VYVRTAVANI', ...lines.slice(iF)].join('\n')).filter(m => m.x !== null);
    const xs = fin.map(m => +m.x.toFixed(3));
    for (const r of [19.2, 14.2, 12.5 - 0.8]) expect(xs).toContain(+r.toFixed(3));   // stěna − rε, dno k předvrtání
    for (const m of fin.filter(q => q.z < 0)) {
      expect(m.x, m.line).toBeGreaterThanOrEqual(g.rIn - 1e-3);
      expect(m.z, m.line).toBeGreaterThanOrEqual(-30 - 0.8 - 1e-3);
    }
    // Pomocné X max (dno díry) se uživateli nehlásí; tyč se vejde.
    expect(res.S.genNotes.some(n => /Rozsah|nevejde/.test(n.msg))).toBe(false);
  });

  it('bez boreFinish žádné dokončení (výchozí stav)', async () => {
    const res = await runCamProg({ params: base, contourPoints: P(CONNECTED), stockPoints: [] });
    expect(res.gcode).not.toContain('DOKONCOVANI');
  });
});
