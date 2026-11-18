// @vitest-environment happy-dom
// Kontrola kódu 18. 11. 2026 – import SVG: čísla s jednotkou, bulges otevřené kontury.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';

let parseSVGToObjects;
beforeAll(async () => {
  installUiDom();
  await import('../js/ui.js');
  ({ parseSVGToObjects } = await import('../js/storage/fileIO.js'));
});

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

describe('import SVG', () => {
  it('atributy s jednotkou („10mm") nedají NaN', () => {
    const objs = parseSVGToObjects(svg('<circle cx="10mm" cy="5mm" r="3mm"/><rect x="1px" y="2px" width="4px" height="6px"/>'));
    expect(objs[0]).toMatchObject({ type: 'circle', cx: 10, cy: -5, r: 3 });
    expect(objs[1]).toMatchObject({ type: 'rect', x1: 1, y1: -8, x2: 5, y2: -2 });
  });

  it('otevřená kontura má o jeden bulge méně než vrcholů, uzavřená stejně', () => {
    const [pl, pg] = parseSVGToObjects(svg('<polyline points="0,0 10,0 10,10"/><polygon points="0,0 10,0 10,10"/>'));
    expect(pl.bulges).toHaveLength(2);
    expect(pg.bulges).toHaveLength(3);
  });
});
