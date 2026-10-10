// Zpevnění vyvrtávání / kontroly kolizí (10. 10. 2026): oříznutí validátoru se hlásí,
// NaN v řetězu z CAD nerozbije ⌀ díry, X/Z parser zrcadla zná i „X=“ a „X+“.
import { describe, it, expect } from 'vitest';
import { unmirrorBoreLine, boreGeom } from '../js/calculators/cam/ops/bore.js';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';
import { boreRealCollisions } from '../js/calculators/cam/boreRealCollision.js';

describe('unmirrorBoreLine — tvary čísel dialektů', () => {
  it('X10.5, X=10.5 i X+10.5 dají totéž', () => {
    const a = unmirrorBoreLine('G1 X10.5 Z-3', 100, 1);
    expect(unmirrorBoreLine('G1 X=10.5 Z-3', 100, 1)).toBe(a);
    expect(unmirrorBoreLine('G1 X+10.5 Z-3', 100, 1)).toBe(a);
    expect(a).toContain('X89.500');
  });
  it('zleva překlopí Z i ve tvaru Z=', () => {
    expect(unmirrorBoreLine('G1 X5 Z=-3', 100, -1)).toContain('Z3.000');
  });
  it('komentář za středníkem se nemění', () => {
    expect(unmirrorBoreLine('G1 X5 ; X7', 100, 1)).toContain('; X7');
  });
});

describe('boreGeom — NaN v řetězu z CAD', () => {
  it('bod s NaN se ignoruje, ⌀ zůstane konečný', () => {
    const chain = [
      { p1: { x: 10, z: 0 }, p2: { x: 10, z: -20 } },
      { p1: { x: 10, z: -20 }, p2: { x: NaN, z: -25 } },
    ];
    const g = boreGeom({ boreSource: 'cad', mode: 'RADIUS' }, chain);
    expect(Number.isFinite(g.D)).toBe(true);
    expect(g.D).toBe(20);
  });
});

describe('oříznutí kontroly kolizí se hlásí', () => {
  const prms = {
    stockMode: 'cylinder', stockDiameter: 60, stockLength: 60, stockFace: 0,
    toolRadius: 0.8, toolLength: 10, depthOfCut: 2, holderWidth: 20, holderLength: 200,
  };
  // Opakované G0 skrz válec r=30: každý blok je samostatný nález.
  const rapids = (n) => {
    const pts = [{ x: 10, z: 10, type: 'G0' }];
    for (let i = 1; i <= n; i++) pts.push({ x: 10, z: i % 2 ? -50 : 10, type: 'G0', originalLineIdx: i });
    return pts;
  };
  it('víc nálezů než maxIssues → truncated "issues"', () => {
    const out = validateToolpath(rapids(6), prms, [], { maxIssues: 2 });
    expect(out.length).toBe(2);
    expect(out.truncated).toBe('issues');
  });
  it('víc bloků než maxBlocks → truncated "blocks"', () => {
    const out = validateToolpath(rapids(6), prms, [], { maxBlocks: 3 });
    expect(out.truncated).toBe('blocks');
  });
  it('krátký program bez limitu → bez příznaku', () => {
    expect(validateToolpath(rapids(1), prms, []).truncated).toBeUndefined();
  });
  it('boreRealCollisions: prázdná dráha → bez příznaku', () => {
    expect(boreRealCollisions(prms, [], null).truncated).toBeUndefined();
  });
});
