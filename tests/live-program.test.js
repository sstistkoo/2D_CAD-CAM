// @vitest-environment happy-dom
// Blok poháněných nástrojů v programu simulátoru (cam/live/liveProgram.js):
// ruční 📝 Zapsat na konec, jen v poslední části, 🗑 Z programu, stav pro
// operaci Vrtání (blok generuje ops/drill.js, ne vkládání textu).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createLiveProgram } from '../js/calculators/cam/live/liveProgram.js';
import { newLiveOp } from '../js/calculators/cam/live/liveModel.js';
import { findLiveBlock } from '../js/calculators/cam/live/liveMarkers.js';

const PROG = ['N10 G18', 'N20 G0 X50 Z5', 'N30 G1 Z-20 F0.2', 'N40 M30'].join('\n');
let S, root, ta, toast, saved;

beforeEach(() => {
  document.body.innerHTML = `<div class="root"><div class="cam-sim-parts-bar"></div><textarea class="cam-sim-manual-ta"></textarea></div>`;
  root = document.querySelector('.root');
  ta = root.querySelector('textarea');
  S = { params: { controlSystem: 'sinumerik', liveOps: [newLiveOp('drill', { faceZ: 0, outerD: 80 }, 1)] }, manualGCode: PROG, opParts: null, activePart: 0, opView: 'part' };
  ta.value = PROG;
  // Simulátor: událost input přepíše program z textarea.
  ta.addEventListener('input', () => { S.manualGCode = ta.value; });
  toast = vi.fn(); saved = 0;
});
const make = () => createLiveProgram({ S, root, pushHistory: () => {}, saveState: () => { saved++; }, toast });
const hasBlock = () => !!findLiveBlock(S.manualGCode.split('\n'));

describe('blok poháněných nástrojů v programu', () => {
  it('zapíše blok před konec programu', () => {
    const p = make();
    expect(p.write(true)).toBe(true);
    const ls = S.manualGCode.split('\n');
    const b = findLiveBlock(ls);
    expect(b).toBeTruthy();
    expect(ls.indexOf('N40 M30')).toBeGreaterThan(b.end);
    expect(p.write(true)).toBe(false);   // beze změny
  });
  it('náhled celého programu ani jiná než poslední část se nepřepisují', () => {
    const p = make();
    ta.readOnly = true;
    expect(p.write(true)).toBe(false);
    expect(toast).toHaveBeenCalled();
    ta.readOnly = false;
    S.opParts = [{}, {}, {}]; S.activePart = 1;
    expect(p.write(true)).toBe(false);
    expect(hasBlock()).toBe(false);
  });
  it('🗑 Z programu blok odebere', () => {
    const p = make();
    p.write(true);
    expect(p.has()).toBe(true);
    expect(p.unwrite()).toBe(true);
    expect(hasBlock()).toBe(false);
    expect(p.has()).toBe(false);
    expect(p.unwrite()).toBe(false);
  });
  it('operace Vrtání: stav říká, že program generuje Vrtání', () => {
    const p = make();
    S.params.drillActive = true;
    expect(p.blockState().cls).toBe('warn');                 // bez bloku v programu
    p.write(true);
    expect(p.blockState()).toMatchObject({ cls: 'ok' });
    expect(p.blockState().text).toMatch(/Operace Vrtání/);
  });
});
