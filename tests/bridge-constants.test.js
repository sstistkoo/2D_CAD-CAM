import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Bridge ──
import { bridge } from '../js/bridge.js';

describe('bridge – callback registry', () => {
  it('má všechny sloty nastavené na null', () => {
    const keys = [
      'updateMobileCancelBtn', 'updateMobileCoords', 'updatePolylineButtons',
      'updateTraceButtons', 'finishProfileTrace',
      'updateProperties', 'updateObjectList', 'updateIntersectionList',
      'calculateAllIntersections', 'runCncExport', 'renderAll', 'resetHint',
    ];
    for (const key of keys) {
      expect(bridge[key]).toBeNull();
    }
  });

  it('umožňuje registraci callbacku', () => {
    const orig = bridge.renderAll;
    const fn = vi.fn();
    bridge.renderAll = fn;
    bridge.renderAll();
    expect(fn).toHaveBeenCalledOnce();
    bridge.renderAll = orig;
  });
});

// ── Constants ──
import { COLORS, GRID_BASE_STEP, GRID_MIN_PX, MOBILE_BREAKPOINT, LONG_PRESS_MS, ZOOM_MIN, ZOOM_MAX } from '../js/constants.js';

describe('constants', () => {
  it('COLORS obsahuje základní barvy', () => {
    expect(COLORS.primary).toBeDefined();
    expect(COLORS.selected).toBeDefined();
    expect(COLORS.preview).toBeDefined();
    expect(COLORS.bgDark).toBeDefined();
  });

  it('numerické konstanty mají rozumné hodnoty', () => {
    expect(GRID_BASE_STEP).toBeGreaterThan(0);
    expect(GRID_MIN_PX).toBeGreaterThan(0);
    expect(MOBILE_BREAKPOINT).toBeGreaterThan(0);
    expect(LONG_PRESS_MS).toBeGreaterThan(0);
    expect(ZOOM_MIN).toBeGreaterThan(0);
    expect(ZOOM_MAX).toBeGreaterThan(ZOOM_MIN);
  });
});
