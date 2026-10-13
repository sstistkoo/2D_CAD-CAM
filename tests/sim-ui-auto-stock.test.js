// @vitest-environment happy-dom
// Polotovar v simulátoru: „🎯 Auto-rozměr" válce a výchozí „Vlastní tvar"
// (blok auto stock → js/calculators/cam/sim/autoStock.js). Hodnoty jsou
// charakterizace starého kódu — po přestěhování se nesmí změnit.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { installSimDom, openSim, loadFixture, settle } from './helpers/simUi.mjs';

// Kontura s půlkruhem R10 na Ø40: vrchol oblouku (R30) leží nad koncovými
// body (R20) — bez větve „arc extremes" by Auto-rozměr dal Ø46 místo Ø66.
const CONTOUR = [
  { id: 1, type: 'G0', x: 0, z: 0, r: 0, mode: 'ABS' },
  { id: 2, type: 'G1', x: 40, z: 0, r: 0, mode: 'ABS' },
  { id: 3, type: 'G1', x: 40, z: -30, r: 0, mode: 'ABS' },
  { id: 4, type: 'G3', x: 40, z: -50, r: 10, mode: 'ABS' },
  { id: 5, type: 'G1', x: 40, z: -62.4, r: 0, mode: 'ABS' },
];

let sim;
beforeAll(async () => {
  installSimDom();
  sim = await openSim(loadFixture('cam/part-1.camprog'));
});
afterAll(async () => { await sim?.close(); });

const click = async (sel) => { sim.q(sel).click(); await settle(5); };

describe('simulátor — polotovar', () => {
  it('🎯 Auto-rozměr: válec z kontury (průměr, délka, čelo) + krok historie', async () => {
    const { S } = sim;
    S.params.mode = 'DIAMON';
    S.params.stockMargin = 3;
    S.contourPoints = structuredClone(CONTOUR);
    await click('[data-tab="editor"]');
    await click('[data-edit="stock"]');
    await click('[data-smode="cylinder"]');
    const past = S.past.length;
    await click('[data-act="auto-stock"]');
    expect({ D: S.params.stockDiameter, L: S.params.stockLength, F: S.params.stockFace })
      .toEqual({ D: 66, L: 66, F: 2 });   // (30 + 3) · 2; 62,4 + 3; 0 + 2
    expect(S.past.length).toBe(past + 1);
  });

  // Výchozí obrys bere jen koncové body (R20 + 5 → Ø50), oblouk ne.
  it('Vlastní tvar bez bodů → výchozí obrys 5 mm kolem kontury', async () => {
    const { S } = sim;
    S.params.mode = 'DIAMON';
    S.contourPoints = structuredClone(CONTOUR);
    S.stockPoints = [];
    await click('[data-tab="editor"]');
    await click('[data-edit="stock"]');
    await click('[data-smode="casting"]');
    expect(S.params.stockMode).toBe('casting');
    expect(S.stockPoints.map(({ type, x, z, r, mode }) => ({ type, x, z, r, mode }))).toEqual([
      { type: 'G0', x: 50, z: 2, r: 0, mode: 'ABS' },
      { type: 'G1', x: 50, z: -67.4, r: 0, mode: 'ABS' },
      { type: 'G1', x: 0, z: -67.4, r: 0, mode: 'ABS' },
    ]);
  });
});
