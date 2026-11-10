import { describe, it, expect, afterEach } from 'vitest';
import { state } from '../js/state.js';
import { parseVkLine, buildVkElementLine, buildVkPreviewData } from '../js/calculators/vkContour.js';
import { vkAngleSwap } from '../js/calculators/vkAngle.js';
import { screenToWorldAngle } from '../js/dialogs/compassAngle.js';
import { analyzeDrawCode, moveInfo } from '../js/calculators/cncDrawTools.js';

afterEach(() => { state.machineType = 'soustruh'; });

describe('VK: PA na karuselu od vodorovné osy → (proti směru hodin)', () => {
  it('soustruh: PA beze změny (0° = +Z doprava)', () => {
    expect(parseVkLine('G11 X10 Z5 PA30').pa).toBe(30);
    expect(buildVkElementLine({ cmd: 'G11', x: 1, z: 2, pa: 30 })).toContain('PA30');
  });
  it('karusel: PA 0 = doprava (+X), 90 = nahoru (+Z), zápis ↔ řešič je involuce', () => {
    state.machineType = 'karusel';
    expect(parseVkLine('G11 X10 Z5 PA0').pa).toBe(90);    // řešič: 90° = směr +X
    expect(parseVkLine('G11 X10 Z5 PA90').pa).toBe(0);    // řešič: 0° = směr +Z
    expect(vkAngleSwap(vkAngleSwap(0.1))).toBe(0.1);
    const text = buildVkElementLine({ cmd: 'G11', x: 1, z: 2, pa: parseVkLine('G11 PA35').pa });
    expect(text).toContain('PA35');
  });
  it('karusel: PA45 PR10 jde doprava-nahoru na obrazovce (+X i +Z)', () => {
    state.machineType = 'karusel';
    const d = buildVkPreviewData(['G0 X0 Z0', 'G11 PA45 PR10']);
    const seg = d.segments.filter(s => s.type === 'line').pop();
    expect(seg.end.x).toBeGreaterThan(5); expect(seg.end.z).toBeGreaterThan(5);
  });
  it('karusel: PA0 PR10 jde jen v X', () => {
    state.machineType = 'karusel';
    const seg = buildVkPreviewData(['G0 X0 Z0', 'G11 PA0 PR10']).segments.filter(s => s.type === 'line').pop();
    expect(seg.end.x).toBeCloseTo(10, 6); expect(seg.end.z).toBeCloseTo(0, 6);
  });
});

describe('CAD kompas: šipka = směr na obrazovce i se zrcadlením', () => {
  it('bez zrcadlení beze změny', () => { expect(screenToWorldAngle(45)).toBe(45); expect(screenToWorldAngle(270)).toBe(270); });
  it('flipZ: → míří do světa −wx (180°), ↑ zůstává 90°', () => {
    expect(screenToWorldAngle(0, { flipZ: true })).toBe(180);
    expect(screenToWorldAngle(90, { flipZ: true })).toBe(90);
  });
  it('flipX: ↑ míří do světa −wy (270°)', () => { expect(screenToWorldAngle(90, { flipX: true })).toBe(270); });
});

describe('CNC editor: PU a info ∠ respektují flipX/flipZ na karuselu', () => {
  it('PU0 L10 bez flipu → +X; s flipZ → −X; info ∠ = 0 (zadaná hodnota)', () => {
    for (const flipZ of [false, true]) {
      const an = analyzeDrawCode('G0 X0 Z0\nG1 PU0 L10', { karusel: true, flipZ });
      const mv = an.moves[1];
      expect(mv.to.x).toBeCloseTo(flipZ ? -10 : 10, 6);
      expect(moveInfo(mv, an).join(' ')).toContain('∠ 0°');
    }
  });
});
