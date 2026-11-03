// @vitest-environment happy-dom
// 🛠 Úpravy výkresu (uživatel 3. 11. 2026): uzavření kontury po osách a
// polotovaru ke kontuře, normalizace barev, rozbor rovných čar a barva
// Typu čáry zvlášť pro konturu a polotovar.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';

let ops, dlg, ls, state;
const L = (x1, y1, x2, y2, extra = {}) => ({ type: 'line', x1, y1, x2, y2, layer: 0, ...extra });
const S = (x1, y1, x2, y2) => L(x1, y1, x2, y2, { isStock: true, layer: 3 });
const segs = (r) => r.lines.map(l => [l.x1, l.y1, l.x2, l.y2]);

beforeAll(async () => {
  installUiDom();
  await import('../js/ui.js');
  ({ state } = await import('../js/state.js'));
  ops = await import('../js/dialogs/drawingEditOps.js');
  dlg = await import('../js/dialogs/drawingEditsDialog.js');
  ls = await import('../js/lineStyles.js');
});

// Profil jako na fotce uživatele: od svislé osy (0,180) k vodorovné (845,0).
const contour = () => [L(0, 180, 60, 180), L(60, 180, 100, 55), L(100, 55, 845, 40), L(845, 40, 845, 0)];
const stock = () => [S(0, 237, 880, 237), S(880, 237, 882, 0)];

describe('uzavřít tvar', () => {
  it('kontura s konci na dvou osách se uzavře přes počátek', () => {
    const r = ops.closeContourToAxes(contour(), state.layers);
    expect(segs(r)).toEqual([[0, 180, 0, 0], [0, 0, 845, 0]]);
  });

  it('konce na téže ose → jedna úsečka po ose; konec mimo osu se spustí kolmo', () => {
    expect(segs(ops.closeContourToAxes([L(10, 0, 10, 50), L(10, 50, 90, 50), L(90, 50, 90, 0)], state.layers)))
      .toEqual([[10, 0, 90, 0]]);
    const drop = ops.closeContourToAxes([L(10, 0, 10, 50), L(10, 50, 90, 50)], state.layers);
    expect(segs(drop)).toEqual([[10, 0, 90, 0], [90, 0, 90, 50]]);
    // na ose = pomocná, kolmé spuštění konce na osu = skutečná plocha
    expect(drop.lines.map(l => l.onAxis)).toEqual([true, false]);
  });

  it('uzavřená kontura / víc kusů → nic, s důvodem', () => {
    const closed = [...contour(), L(845, 0, 0, 0), L(0, 0, 0, 180)];
    expect(ops.closeContourToAxes(closed, state.layers).why).toMatch(/uzavřená/);
    expect(ops.closeContourToAxes([L(0, 10, 5, 10), L(20, 10, 30, 0)], state.layers).why).toMatch(/4 volných/);
  });

  it('polotovar se po osách napojí na nejbližší bod kontury (i uzavřené)', () => {
    expect(segs(ops.closeStockToContour([...contour(), ...stock()], state.layers)))
      .toEqual([[0, 237, 0, 180], [882, 0, 845, 0]]);
    const closed = [...contour(), L(845, 0, 0, 0), L(0, 0, 0, 180)];
    expect(segs(ops.closeStockToContour([...closed, ...stock()], state.layers)))
      .toEqual([[0, 237, 0, 180], [882, 0, 845, 0]]);
  });

  it('tlačítko v okně přidá úsečky jedním krokem Zpět, polotovar zůstane polotovarem', () => {
    state.objects = [...contour(), ...stock()];
    const undo = state.undoStack.length;
    let o = dlg.openDrawingEditsDialog();
    o.querySelector('[data-act="closeContour"]').click();
    o = dlg.openDrawingEditsDialog();
    o.querySelector('[data-act="closeStock"]').click();
    expect(state.undoStack.length).toBe(undo + 2);
    const added = state.objects.slice(6);
    expect(added).toHaveLength(4);
    // Všechny čtyři leží na ose → pomocné čáry (do CAM nejdou), tvar se uzavře jen na plátně.
    expect(added.map(a => [a.type, a.finite, a.axisClose, a.layer])).toEqual([
      ['constr', true, true, 0], ['constr', true, true, 0], ['constr', true, true, 3], ['constr', true, true, 3]]);
    // Druhé klepnutí nic nepřidá.
    dlg.openDrawingEditsDialog().querySelector('[data-act="closeContour"]').click();
    expect(state.objects).toHaveLength(10);
    expect(new Set(added.map(a => a.id)).size).toBe(4);
    expect(added.every(a => Number.isInteger(a.id))).toBe(true);
  });
});

describe('normalizace barev', () => {
  it('sundá vlastní barvy, polotovar přesune do vrstvy Polotovar, vrstvám vrátí výchozí barvu', () => {
    const layers = [{ id: 0, color: '#ffff00' }, { id: 3, color: '#fab387' }];
    const objs = [L(0, 0, 1, 0, { color: '#fbbf24' }), L(0, 0, 1, 0, { layer: 3 }), S(0, 0, 1, 1), L(0, 1, 1, 1, { isStock: true, color: '#fbbf24' }),
      { type: 'line', x1: 0, y1: 0, x2: 1, y2: 1, isDimension: true, color: '#fff' }];
    const plan = ops.planColorNormalize(objs, layers, { contourLayer: 0, stockLayer: 3, contourColor: '#89b4fa', stockColor: '#e53935' });
    ops.applyColorNormalize(plan);
    expect(objs.map(o => [o.layer, o.color])).toEqual([[0, undefined], [0, undefined], [3, undefined], [3, undefined], [undefined, '#fff']]);
    expect(layers.map(l => l.color)).toEqual(['#89b4fa', '#e53935']);
  });

  it('sjednotí tloušťku: dvě tloušťky kontury → jedna (tlustá i tenká)', () => {
    const layers = [{ id: 0, color: '#89b4fa' }, { id: 3, color: '#e53935' }];
    const std = { contourLayer: 0, stockLayer: 3, contourColor: '#89b4fa', stockColor: '#e53935' };
    const mk = () => [L(0, 0, 1, 0), L(1, 0, 2, 0, { lineStyle: 'solidThick', dashed: false }), L(2, 0, 3, 0, { lineStyle: 'dashed', dashed: true })];
    const thick = mk();
    ops.applyColorNormalize(ops.planColorNormalize(thick, layers, { ...std, weight: 'thick' }));
    expect(thick.map(o => [o.lineStyle, o.dashed])).toEqual([['solidThick', false], ['solidThick', false], ['solidThick', false]]);
    const thin = mk();
    ops.applyColorNormalize(ops.planColorNormalize(thin, layers, { ...std, weight: 'thin' }));
    expect(thin.map(o => [o.lineStyle, o.dashed])).toEqual([[undefined, undefined], [undefined, undefined], [undefined, undefined]]);
    // Bez `weight` (jen barvy) se tloušťka nemění.
    expect(ops.planColorNormalize(mk(), layers, std).objs).toHaveLength(0);
  });

  it('okno Úpravy: výběr tloušťky se pamatuje, barva vrstvy se změní hned', async () => {
    const prefs = await import('../js/drawColorPrefs.js');
    const o = dlg.openDrawingEditsDialog();
    o.querySelector('[data-weight="thin"]').click();
    expect(prefs.drawLineWeight()).toBe('thin');
    const c = o.querySelector('#deditStockColor');
    c.value = '#112233'; c.dispatchEvent(new Event('change'));
    expect(state.layers.find(l => l.id === 3).color).toBe('#112233');
    prefs.setDrawColorPrefs({ contour: null, stock: null });
    prefs.setDrawLineWeight('thick');
    o.remove();
  });
});

describe('rovné čáry', () => {
  it('přesně rovné = exact, odchylka 0,001 = near, šikmá se nehlásí', () => {
    const r = ops.classifyStraightLines([L(0, 10, 50, 10), L(0, 10, 0, 40), L(0, 20, 50, 20.001), L(0, 0, 30, 30)], state.layers);
    expect(r.map(s => [s.kind, s.dir])).toEqual([['exact', 'h'], ['exact', 'v'], ['near', 'h']]);
    expect(r[2].off).toBeCloseTo(0.001, 9);
  });
});

describe('barva Typu čáry podle režimu', () => {
  it('barva polotovaru se nepřenese do kontury', () => {
    state.lineStyle = { key: 'solidThick', color: null, stockColor: '#fbbf24', aux: false };
    state.drawStockMode = true;
    expect(ls.activeLineProps().color).toBe('#fbbf24');
    state.drawStockMode = false;
    expect(ls.activeLineProps().color).toBeUndefined();
  });

  it('stará uložená jediná barva (bez verze) se nepřebírá', () => {
    localStorage.setItem('skica-line-style', JSON.stringify({ key: 'solidThick', color: '#fbbf24', aux: false }));
    ls.loadLineStylePref();
    expect([state.lineStyle.color, state.lineStyle.stockColor]).toEqual([null, null]);
    state.lineStyle.stockColor = '#e53935';
    ls.saveLineStylePref();
    state.lineStyle.stockColor = null;
    ls.loadLineStylePref();
    expect(state.lineStyle.stockColor).toBe('#e53935');
  });
});
