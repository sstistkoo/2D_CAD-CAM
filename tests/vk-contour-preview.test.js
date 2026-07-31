import { describe, it, expect } from 'vitest';
import { parseVkLine, buildVkPreviewData } from '../js/calculators/vkContour.js';

describe('parseVkLine', () => {
  it('parses VPOL and element commands from VK syntax', () => {
    const vpol = parseVkLine('G111 X10 Z20 PA30 R5');
    const line = parseVkLine('G11 X12 Z22 PA45 PR3');

    expect(vpol).toMatchObject({ cmd: 'G111', x: 10, z: 20, pa: 30, r: 5 });
    expect(line).toMatchObject({ cmd: 'G11', x: 12, z: 22, pa: 45, pr: 3 });
  });

  it('parses G0 as the initial point command', () => {
    const initial = parseVkLine('G0 X10 Z30');

    expect(initial).toMatchObject({ cmd: 'G0', isArc: false, x: 10, z: 30 });
  });
});

describe('buildVkPreviewData', () => {
  it('builds a simple line preview from VPOL and a subsequent element', () => {
    const data = buildVkPreviewData([
      'G111 X0 Z40',
      'G11 X10 Z30',
    ]);

    expect(data.vpol).toEqual({ x: 0, z: 40 });
    expect(data.segments).toHaveLength(1);
    expect(data.segments[0]).toMatchObject({ type: 'line', start: { x: 0, z: 40 }, end: { x: 10, z: 30 } });
  });

  it('tracks the last known point from the parsed geometry', () => {
    const data = buildVkPreviewData([
      'G111 X0 Z40',
      'G11 X10 Z30',
    ]);

    expect(data.lastPoint).toEqual({ x: 10, z: 30 });
  });

  it('resolves a line endpoint from PA/PR when coordinates are missing', () => {
    const data = buildVkPreviewData([
      'G111 X0 Z40',
      'G11 PA45 PR10',
    ]);

    expect(data.segments[0].type).toBe('line');
    expect(data.segments[0].start).toEqual({ x: 0, z: 40 });
    expect(data.segments[0].end.x).toBeCloseTo(7.071067811865475, 9);
    expect(data.segments[0].end.z).toBeCloseTo(47.071067811865476, 9);
  });

  it('includes a live draft segment when the form contains a pending element', () => {
    const data = buildVkPreviewData(['G111 X0 Z40'], {
      type: 'line',
      start: { x: 0, z: 40 },
      end: { x: 12, z: 32 },
      direction: 'G11',
    });

    expect(data.draft).toMatchObject({ type: 'line', end: { x: 12, z: 32 } });
  });

  it('treats G0 as a line segment starting from VPOL', () => {
    const data = buildVkPreviewData([
      'G111 X0 Z40',
      'G0 X10 Z30',
    ]);

    expect(data.segments).toHaveLength(1);
    expect(data.segments[0]).toMatchObject({ type: 'line', start: { x: 0, z: 40 }, end: { x: 10, z: 30 } });
  });
});
