import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('číselné klávesy editoru', () => {
  it('jsou po třech jako numerická klávesnice a končí oddělovačem', async () => {
    const { digitKeysHTML } = await import('../js/calculators/cncDigitKeys.js');
    const html = digitKeysHTML();
    const keys = [...html.matchAll(/data-ins="([^"]+)"/g)].map(m => m[1]);
    expect(keys).toEqual(['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '-']);
    expect(html.endsWith('<span class="cne-digit-sep"></span>')).toBe(true);
  });
});

describe('dvojklep na ↩ ukončí celou obrazovku', () => {
  let mod;
  beforeEach(async () => {
    vi.resetModules();
    globalThis.document = { fullscreenElement: null, exitFullscreen: vi.fn(() => Promise.resolve()) };
    mod = await import('../js/fullscreen.js');
  });

  it('mimo celou obrazovku nikdy nic nekončí', () => {
    expect(mod.undoDoubleTapExitsFullscreen(1000)).toBe(false);
    expect(mod.undoDoubleTapExitsFullscreen(1100)).toBe(false);
    expect(document.exitFullscreen).not.toHaveBeenCalled();
  });

  it('v celé obrazovce druhý klep do 350 ms skončí, pomalejší ne', () => {
    document.fullscreenElement = {};
    expect(mod.undoDoubleTapExitsFullscreen(1000)).toBe(false);
    expect(mod.undoDoubleTapExitsFullscreen(1200)).toBe(true);
    expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
    // po ukončení začíná počítání znovu
    expect(mod.undoDoubleTapExitsFullscreen(1300)).toBe(false);
    expect(mod.undoDoubleTapExitsFullscreen(1800)).toBe(false);
    expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
  });
});
