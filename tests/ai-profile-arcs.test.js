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
