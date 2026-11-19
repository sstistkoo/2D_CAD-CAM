// @vitest-environment happy-dom
// Kontrola kódu 17. 11. 2026 – AI profil: oblouk přes 180° (CR<0, I/K).
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';

beforeAll(() => { installUiDom(); });

describe('AI profil: oblouk přes 180° v G-kódu', () => {
  it('profil → G-kód → profil zachová dlouhý oblouk (CR<0) i I/K', async () => {
    const { profileToGcode, gcodeToProfile } = await import('../js/ai/aiPanel.js');
    const b = Math.tan((270 * Math.PI / 180) / 4);                 // 270° CCW
    const verts = [{ x: 0, y: 10 }, { x: 10, y: 10 }];
    const g = profileToGcode(verts, [b, 0]);
    expect(g).toMatch(/G3 X20\.000 Z10\.000 CR=-/);
    const back = gcodeToProfile(g);
    expect(back.bulges[0]).toBeCloseTo(b, 3);   // CR zaokrouhlené na 3 místa
    // Totéž zapsané přes I/K (střed 5 mm pod tětivou): I = −5, K = 5.
    const ik = gcodeToProfile('G0 X20 Z0\nG3 X20 Z10 I-5 K5');
    expect(ik.bulges[0]).toBeCloseTo(b, 6);
    expect(gcodeToProfile('G0 X20 Z0\nG3 X20 Z10 CR=7.0710678').bulges[0]).toBeCloseTo(1 / b, 6);
  });
});

describe('Trasování profilu: import G-kódu', () => {
  it('I/K i CR<0 dají dlouhý oblouk, komentář se nečte, I je poloměr', async () => {
    const { _parseGcodeToTrace } = await import('../js/tools/profileTraceClick.js');
    const { state } = await import('../js/state.js');
    const b = Math.tan((270 * Math.PI / 180) / 4);
    Object.assign(state, { machineType: 'soustruh', flipX: false, flipZ: false, xDisplayMode: 'radius' });
    expect(_parseGcodeToTrace('G0 X10 Z0\nG3 X10 Z10 I-5 K5').bulges[0]).toBeCloseTo(b, 6);
    expect(_parseGcodeToTrace('G0 X10 Z0\nG3 X10 Z10 CR=-7.0710678').bulges[0]).toBeCloseTo(b, 6);
    const c = _parseGcodeToTrace('G18 G90\nG0 X10 Z0 ; max 2\nG1 Z5 ; index 3');
    expect(c.points.map(p => [p.x, p.y])).toEqual([[0, 10], [5, 10]]);
    // Režim průměru: X se půlí, I zůstává poloměr.
    state.xDisplayMode = 'diameter';
    expect(_parseGcodeToTrace('G0 X20 Z0\nG3 X20 Z10 I-5 K5').bulges[0]).toBeCloseTo(b, 6);
    state.xDisplayMode = 'radius';
  });
});

describe('AI profil z JSON na karuselu (kontrola 19. 11. 2026)', () => {
  it('karusel = transpozice soustruhového profilu, bulge s opačným znaménkem', async () => {
    const { buildProfile } = await import('../js/ai/aiPanel.js');
    const { state } = await import('../js/state.js');
    const els = [{ type: 'line', d1: 20, d2: 20, l: 10 }, { type: 'arc', d1: 20, d2: 30, l: 5, r: 5 }];
    state.machineType = 'soustruh';
    const lathe = buildProfile(els);
    state.machineType = 'karusel';
    const kar = buildProfile(els);
    state.machineType = 'soustruh';
    expect(kar.vertices).toEqual(lathe.vertices.map(v => ({ x: v.y, y: v.x })));
    expect(kar.bulges).toEqual(lathe.bulges.map(b => -b || 0));
    expect(lathe.bulges.some(b => b !== 0)).toBe(true);
  });
});
