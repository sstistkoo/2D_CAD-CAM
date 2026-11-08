// Objekty vykreslené z G-kódu dostanou jednotnou tloušťku a vrstvu; vlastní barva zůstane.
import { describe, it, expect } from 'vitest';
import { parseGcodeToObjects } from '../js/storage/gcodeParse.js';
import { normalizeDrawnObjects, drawLineWeight } from '../js/drawColorPrefs.js';
import { STOCK_LAYER_ID } from '../js/state.js';

describe('normalizeDrawnObjects', () => {
  it('kontura i polotovar: vrstva a stejná tloušťka, ručně nastavená barva zůstane', () => {
    const { objs } = parseGcodeToObjects('G0 X0 Z0\nG1 X50\nG1 Z-30\n; STOCK_START\nG0 X60 Z2\nG1 Z-40\n; STOCK_END');
    objs.forEach(o => { o.layer = o.isStock ? STOCK_LAYER_ID : 0; });
    objs[0].color = '#00ff00'; objs[0].lineStyle = 'dashed'; objs[0].dashed = true;
    normalizeDrawnObjects(objs);
    expect(objs.some(o => o.isStock)).toBe(true);
    expect(objs[0].color).toBe('#00ff00');
    expect(objs[1].color).toBeUndefined();
    for (const o of objs) {
      expect(o.layer).toBe(o.isStock ? STOCK_LAYER_ID : 0);
      expect(!!o.dashed).toBe(false);
      if (drawLineWeight() === 'thick') expect(o.lineStyle).toBe('solidThick');
    }
  });
});
