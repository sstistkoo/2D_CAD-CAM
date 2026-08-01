import { describe, it, expect } from 'vitest';
import {
  parseVkLine,
  buildVkPreviewData,
  resolveVkArcGeometry,
  zoomVkViewport,
  screenToVkPoint,
  panVkViewport,
  pickVkAmbiguousSolution,
} from '../js/calculators/vkContour.js';

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

  it('treats first G0 with only X/Z as a positioning point, not a line from VPOL', () => {
    const data = buildVkPreviewData([
      'G111 X0 Z40',
      'G0 X10 Z30',
    ]);

    expect(data.segments).toHaveLength(1);
    expect(data.segments[0]).toMatchObject({ type: 'line', start: { x: 10, z: 30 }, end: { x: 10, z: 30 } });
  });

  it('treats first element X/Z + PA/PR as start + direction (not end from VPOL)', () => {
    const data = buildVkPreviewData([
      'G111 X0 Z40',
      'G0 X40 Z20 PA10 PR100',
    ]);

    expect(data.segments).toHaveLength(1);
    expect(data.segments[0].start).toEqual({ x: 40, z: 20 });
    expect(data.segments[0].end.x).toBeCloseTo(40 + 100 * Math.sin(10 * Math.PI / 180), 9);
    expect(data.segments[0].end.z).toBeCloseTo(20 + 100 * Math.cos(10 * Math.PI / 180), 9);
  });

  it('resolves a stable arc center for G2/G3 preview segments', () => {
    const geometry = resolveVkArcGeometry({ x: 0, z: 0 }, { x: 10, z: 0 }, 10, 'G3');

    expect(geometry).not.toBeNull();
    expect(geometry.center.x).toBeCloseTo(5, 9);
    expect(geometry.center.z).toBeCloseTo(8.660254037844387, 9);
    expect(geometry.sweep).toBeGreaterThan(0);
    expect(geometry.startAngle).toBeCloseTo(-2.0943951023931953, 9);
    expect(geometry.endAngle).toBeCloseTo(-1.0471975511965976, 9);
  });

  it('treats G0 with X/Z and PA as a construction ray anchored at the given point', () => {
    const data = buildVkPreviewData(['G0 X20 Z20 PA12']);

    expect(data.segments).toHaveLength(1);
    expect(data.segments[0]).toMatchObject({ type: 'ray', start: { x: 20, z: 20 }, angle: 12 });
  });

  it('creates a construction ray from VPOL when the VPOL line includes PA', () => {
    const data = buildVkPreviewData(['G111 X10 Z30 PA45']);

    expect(data.vpol).toEqual({ x: 10, z: 30 });
    expect(data.segments).toHaveLength(1);
    expect(data.segments[0]).toMatchObject({ type: 'ray', start: { x: 10, z: 30 }, angle: 45 });
  });

  it('maps screen axes differently for carousel and lathe views', () => {
    const viewport = { zoom: 1, originCanvasX: 24, originCanvasY: 120 };
    const bounds = { minX: -10, maxX: 20, minZ: -10, maxZ: 40 };
    const size = { width: 220, height: 140 };

    const carouselPoint = screenToVkPoint({ x: 70, y: 80 }, viewport, bounds, size, true);
    const lathePoint = screenToVkPoint({ x: 70, y: 80 }, viewport, bounds, size, false);

    expect(carouselPoint.x).toBeCloseTo(5, 9);
    expect(carouselPoint.z).toBeCloseTo(3.0434782608695654, 9);
    expect(lathePoint.x).toBeCloseTo(3.0434782608695654, 9);
    expect(lathePoint.z).toBeCloseTo(5, 9);
  });

  it('uses the selected ambiguous solution for the draft geometry', () => {
    const previewData = {
      vpol: { x: 0, z: 10 },
      segments: [],
      bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 },
      draft: { type: 'line', start: { x: 0, z: 10 }, end: { x: 5, z: 5 } },
      ambiguousSolutions: [
        { start: { x: 0, z: 10 }, end: { x: 2, z: 2 }, color: 'default' },
        { start: { x: 0, z: 10 }, end: { x: 8, z: 8 }, color: 'cyan' },
      ],
    };

    const selected = pickVkAmbiguousSolution(previewData, 1);

    expect(selected.selectedSolution).toMatchObject({ end: { x: 8, z: 8 }, color: 'cyan' });
    expect(selected.draft.end).toEqual({ x: 8, z: 8 });
  });

  it('keeps the world point under the cursor stable while panning', () => {
    const viewport = { zoom: 1, originCanvasX: 24, originCanvasY: 120 };
    const bounds = { minX: -10, maxX: 20, minZ: -10, maxZ: 40 };
    const size = { width: 220, height: 140 };
    const startPoint = { x: 100, y: 80 };
    const endPoint = { x: 120, y: 90 };

    const nextViewport = panVkViewport(viewport, startPoint, endPoint, bounds, size, false);
    const startWorld = screenToVkPoint(startPoint, viewport, bounds, size, false);
    const endWorld = screenToVkPoint(endPoint, nextViewport, nextViewport.bounds, size, false);

    expect(endWorld.x).toBeCloseTo(startWorld.x, 9);
    expect(endWorld.z).toBeCloseTo(startWorld.z, 9);
  });

  it('zooms around the cursor while keeping the pointed world coordinate stable', () => {
    const viewport = { zoom: 1, originCanvasX: 24, originCanvasY: 120 };
    const bounds = { minX: -10, maxX: 20, minZ: -10, maxZ: 40 };
    const size = { width: 220, height: 140 };
    const nextViewport = zoomVkViewport(viewport, { x: 110, y: 80 }, bounds, size, false, 1.25);

    const worldPoint = screenToVkPoint({ x: 110, y: 80 }, viewport, bounds, size, false);
    const nextWorldPoint = screenToVkPoint({ x: 110, y: 80 }, nextViewport, bounds, size, false);

    expect(nextViewport.zoom).toBeCloseTo(1.25, 9);
    expect(nextWorldPoint.x).toBeCloseTo(worldPoint.x, 9);
    expect(nextWorldPoint.z).toBeCloseTo(worldPoint.z, 9);
  });
});
