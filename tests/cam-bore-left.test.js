// ╔══════════════════════════════════════════════════════════════╗
// ║  Vyvrtávání ZLEVA (cam/ops/bore.js, pravidlo 13 + „zleva")     ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Zleva = díra od levého čela do +Z. Vnitřní svět je vždy vnější hrubování
// zprava; zleva se k zrcadlu v X přidá zrcadlo v Z. Program zleva je proto
// PŘESNÉ zrcadlo programu zprava: stejné X, Z → −Z, oblouky G2↔G3. Hlídá se
// pro válcovou díru, pro díru z výkresu napojenou na levé čelo (s obloukem
// v ústí) i pro samostatný řetěz; a že se ústí na levém čele pozná.
import { describe, it, expect } from 'vitest';
import { runCamProg } from './helpers/camHeadless.mjs';
import { buildIsoInternalKnife } from '../js/calculators/isoInternalTools.js';
import { boreChainFromState, splitBoreFromSegments, segmentsFromPoints } from '../js/calculators/cam/boreContour.js';
import { boreGeom } from '../js/calculators/cam/ops/bore.js';

// [z, x, typ, r]
const P = (pts) => pts.map(([z, x, t, r], i) => ({ id: i + 1, type: i ? (t || 'G1') : 'G0', x, z, r: r || 0, mode: 'ABS' }));
const mirZ = (pts) => pts.map(([z, x, t, r]) => [-z, x, t === 'G2' ? 'G3' : t === 'G3' ? 'G2' : t, r]);
// Zprava: ústí se zaoblením R1 (oblouk), ⌀40 do Z−15, schod, ⌀30 do Z−30, dno.
const BORE = [[0, 21], [-1, 20, 'G3', 1], [-15, 20], [-15, 15], [-30, 15], [-30, 12.5]];
const OUTER = [[0, 30], [-40, 30], [-40, 0]];
const CONNECTED = [...[...BORE].reverse().map(([z, x], i, a) => [z, x, i > 0 ? (BORE[BORE.length - i][2] === 'G3' ? 'G2' : BORE[BORE.length - i][2]) : undefined, i > 0 ? BORE[BORE.length - i][3] : 0]), ...OUTER];

const base = {
  mode: 'RADIUS', speed: 180, feed: 0.2, depthOfCut: 1.5, retractDistance: 1, allowanceX: 0.3, allowanceZ: 0.1,
  noStepRoughing: true, stockMode: 'cylinder', stockDiameter: 62, stockLength: 42, stockFace: 1, safeX: 50, safeZ: 5,
  controlSystem: 'sinumerik', ...buildIsoInternalKnife('BCL', { bar: 20 }).tool,
  boreActive: true, borePreDiameter: 25, borePreDepth: 35, boreDiameter: 40, boreDepth: 30, boreZStart: 0,
};

/** Pohybové řádky těla vyvrtávání (bez N). */
function body(gcode) {
  const out = [];
  let on = false;
  for (const l of gcode.split('\n')) {
    if (l.includes('VYVRTAVANI')) on = true;
    if (!on) continue;
    if (/\bM30\b/.test(l)) break;
    const code = l.split(/[;(]/)[0].replace(/^N\d+\s+/, '').trim();
    if (/\bG0?[0-3]\b/.test(code)) out.push(code);
  }
  return out;
}
/** Řádek zprava překlopený do zleva: Z → −Z, G2↔G3. */
const flipLine = (l) => l
  .replace(/\bG0?([23])\b/, (m, d) => m.replace(d, d === '2' ? '3' : '2'))
  .replace(/Z(-?\d*\.?\d+)/g, (_, v) => { const z = -parseFloat(v); return 'Z' + (Math.abs(z) < 5e-4 ? 0 : z).toFixed(3); });
const norm = (l) => l.replace(/([XZ])(-?\d*\.?\d+)/g, (_, a, v) => a + (+parseFloat(v).toFixed(3)));

async function bodies(params, right, left) {
  const r = await runCamProg({ params: { ...params, roughingSide: 'right' }, ...right, stockPoints: [] });
  const l = await runCamProg({ params: { ...params, roughingSide: 'left' }, ...left, stockPoints: [] });
  return { right: body(r.gcode), left: body(l.gcode), notesL: l.S.genNotes };
}

describe('vyvrtávání zleva = zrcadlo zprava', () => {
  it('válcová díra ⌀40 × 30 z předvrtání ⌀25 × 35', async () => {
    const { right, left } = await bodies(base, { contourPoints: P(OUTER) }, { contourPoints: P(mirZ(OUTER)) });
    expect(right.length).toBeGreaterThan(8);
    expect(left.map(norm)).toEqual(right.map(flipLine).map(norm));
  });

  it('díra z výkresu napojená na levé čelo (zaoblení v ústí, schod) i s dokončením', async () => {
    // Dokončení jede po oblouku v ústí — tím se porovnají i G2/G3.
    const p = { ...base, boreSource: 'cad', boreFinish: true };
    const { right, left, notesL } = await bodies(p, { contourPoints: P(CONNECTED) }, { contourPoints: P(mirZ(CONNECTED)) });
    expect(right.some(l => /\bG0?[23]\b/.test(l))).toBe(true);   // oblouk v ústí opravdu jede
    expect(left.map(norm)).toEqual(right.map(flipLine).map(norm));
    expect(notesL.some(n => /nevejde|není díra/.test(n.msg))).toBe(false);
  });

  it('samostatný řetěz zleva (nakreslený od dna i od ústí) dá tentýž program', async () => {
    const p = { ...base, boreSource: 'cad' };
    const outerL = P(mirZ([[0, 0], ...OUTER]));
    const a = await runCamProg({ params: { ...p, roughingSide: 'left' }, contourPoints: P(mirZ(CONNECTED)), stockPoints: [] });
    const b = await runCamProg({ params: { ...p, roughingSide: 'left' }, contourPoints: outerL, borePoints: P(mirZ(BORE)), stockPoints: [] });
    expect(body(b.gcode).map(norm)).toEqual(body(a.gcode).map(norm));
  });

  it('ústí na levém čele: řetěz začíná u Z0 a vede k +Z; geometrie díry jako zprava', () => {
    const S = { params: { ...base, boreSource: 'cad', roughingSide: 'left' }, contourPoints: P(mirZ(CONNECTED)) };
    const ch = boreChainFromState(S);
    expect(ch.source).toBe('connected');
    expect(ch.segs[0].p1).toEqual({ x: 21, z: 0 });
    expect(ch.segs[ch.segs.length - 1].p2.z).toBeCloseTo(30, 9);
    const gL = boreGeom(S.params, ch.segs);
    const gR = boreGeom({ ...S.params, roughingSide: 'right' }, boreChainFromState({ params: { ...S.params, roughingSide: 'right' }, contourPoints: P(CONNECTED) }).segs);
    expect([gL.ok, gL.D, gL.L, gL.zF, gL.s]).toEqual([true, gR.D, gR.L, 0, -1]);
    // Zprava se díra u levého čela nevyjímá (patří levé straně).
    expect(splitBoreFromSegments(segmentsFromPoints(P(mirZ(CONNECTED)), 'RADIUS'), 'right')).toBeNull();
  });
});
