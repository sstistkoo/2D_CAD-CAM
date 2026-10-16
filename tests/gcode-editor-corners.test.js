// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Testy: převod sražení/zaoblení na dráhu (editory)    ║
// ╚══════════════════════════════════════════════════════════════╝
// convertCornersToPaths je od 16. 10. 2026 sdílená CAM Editorem (výchozí
// volby) i CNC Editorem (průměr, I/K, čísla bez nul). Hodnoty níž jsou výstup
// původních dvou kopií — ověřeno porovnáním starého a nového kódu přes
// 3 řídicí systémy × 16 stavů (průměr/poloměr × soustruh/karusel × flipX/flipZ).

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../js/render.js', () => ({ renderAll: vi.fn(), renderAllDebounced: vi.fn() }));

import { convertCornersToPaths } from '../js/calculators/gcodeEditorShared.js';

const PROG = 'G0 X0 Z5\nG1 X40 Z0 F0.2\nRND=2\nG1 X40 Z-30\nG1 X60 Z-30 CHF=1.5\nG1 X60 Z-50\nM30';
const cncOpts = { xs: 2, ik: true, fmt: v => String(Number(v.toFixed(3))) };

beforeEach(() => {
  const store = {};
  globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
});

describe('convertCornersToPaths', () => {
  it('CAM Editor (výchozí volby): 3 desetinná místa, oblouk jen s R', () => {
    expect(convertCornersToPaths(PROG)).toEqual({
      code: 'G0 X0 Z5\nG1 X38.248 Z0.219 F0.2\nG3 X40.000 Z-1.766 R2.000\nG1 X40 Z-30\n'
        + 'G1 X58.500 Z-30.000\nG1 X60.000 Z-31.500\nG1 X60 Z-50\nM30',
      converted: 2, skipped: 0,
    });
  });

  it('CNC Editor: X jako průměr, oblouk s I/K, čísla bez zbytečných nul', () => {
    expect(convertCornersToPaths(PROG, cncOpts)).toEqual({
      code: 'G0 X0 Z5\nG1 X36.97 Z0.379 F0.2\nG3 X40 Z-1.562 I-0.97 K-1.94 R2\nG1 X40 Z-30\n'
        + 'G1 X57 Z-30\nG1 X60 Z-31.5\nG1 X60 Z-50\nM30',
      converted: 2, skipped: 0,
    });
  });

  it('onlyLine převede jen marker na zadaném řádku', () => {
    const r = convertCornersToPaths(PROG, { onlyLine: 4 });
    expect(r.converted).toBe(1);
    expect(r.code).toContain('RND=2');
    expect(r.code).not.toContain('CHF=');
  });

  it('gWord rozhoduje o směru oblouku (karusel / zrcadlení)', () => {
    const r = convertCornersToPaths(PROG, { gWord: () => 'G2' });
    expect(r.code).toContain('G2 X40.000 Z-1.766 R2.000');
  });

  it('bez markerů vrací kód beze změny', () => {
    const code = 'G0 X0 Z5\nG1 X40 Z0\nM30';
    expect(convertCornersToPaths(code)).toEqual({ code, converted: 0, skipped: 0 });
  });
});
