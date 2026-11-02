// @vitest-environment happy-dom
// Mezery, kvůli kterým část kontury nejde do CAM (leftoverFixes.js): dialog
// před CAM nabídne 🔧 Spojit (uživatel 2. 11. 2026: „automatická oprava se
// mi nenabídla, jen ať se vrátím do kreslení").
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';

let cc, state, lf;
const L = (x1, y1, x2, y2) => ({ type: 'line', x1, y1, x2, y2, layer: 0, name: 'Úsečka' });

beforeAll(async () => {
  installUiDom();
  await import('../js/ui.js');
  await import('../js/storage/fileIO.js');   // bridge.buildCamTransfer
  ({ state } = await import('../js/state.js'));
  cc = await import('../js/dialogs/contourCheck.js');
  lf = await import('../js/dialogs/leftoverFixes.js');
});

describe('findLeftoverFixes', () => {
  it('úsečka + úsečka s mezerou 2 mm v rohu → do průsečíku', () => {
    state.machineType = 'soustruh';
    // schod: vodorovná končí 2 mm před svislou
    const a = L(100, 0, 100, 20), b = L(100, 20, 52, 20), c = L(50, 22, 50, 30), d = L(50, 30, 0, 30), e = L(0, 30, 0, 0);
    state.objects = [a, b, c, d, e];
    const fixes = lf.findLeftoverFixes([c, d, e]);
    expect(fixes).toHaveLength(1);
    expect(fixes[0].kind).toBe('join');
    cc.applyLeftoverFixes(fixes);
    expect([b.x2, b.y2]).toEqual([50, 20]);
    expect([c.x1, c.y1]).toEqual([50, 20]);
  });
  it('oblouk + oblouk → spojovací úsečka', () => {
    state.machineType = 'soustruh';
    const a = { type: 'arc', layer: 0, cx: 0, cy: 0, r: 10, startAngle: 0, endAngle: Math.PI / 2 };
    const b = { type: 'arc', layer: 0, cx: -3, cy: 0, r: 10, startAngle: Math.PI / 2, endAngle: Math.PI };
    state.objects = [L(30, 0, 10, 0), a, b];
    const fixes = lf.findLeftoverFixes([b]);
    expect(fixes).toHaveLength(1);
    expect(fixes[0].kind).toBe('bridge');
    const n = state.objects.length;
    cc.applyLeftoverFixes(fixes);
    expect(state.objects).toHaveLength(n + 1);
    const br = state.objects[n];
    expect(br.x1).toBeCloseTo(0); expect(br.y1).toBeCloseTo(10);
    expect(br.x2).toBeCloseTo(-3); expect(br.y2).toBeCloseTo(10);
  });
  it('karusel: konce oba na ose (x = 0) se nespojují', () => {
    state.machineType = 'karusel';
    const a = L(0, 0, 40, 0), b = L(0, 2, 0, 50);
    state.objects = [a, b];
    expect(lf.findLeftoverFixes([b]).filter(f => f.amount === 2)).toHaveLength(0);
  });
  it('mezera nad MAX_GAP se nenabízí', () => {
    state.machineType = 'soustruh';
    const c = L(40, 20, 40, 30);
    state.objects = [L(100, 0, 100, 20), L(100, 20, 50, 20), c, L(40, 30, 0, 30)];
    expect(lf.findLeftoverFixes([c, state.objects[3]])).toHaveLength(0);
    expect(lf.nearestLeftoverGap([c, state.objects[3]])).toBeCloseTo(10);
  });
});

describe('dialog před CAM', () => {
  it('nabídne 🔧 Spojit, opraví a otevře CAM s celou konturou', () => {
    state.machineType = 'soustruh';
    state.layers = [{ id: 0, name: 'Kontura', visible: true, locked: false }];
    const c = L(50, 22.5, 50, 30);
    state.objects = [L(100, 0, 100, 20), L(100, 20, 52.5, 20), c, L(50, 30, 0, 30), L(0, 30, 0, 0)];
    let code = null;
    cc.openCamFromDrawing(cd => { code = cd; });
    const btn = document.getElementById('leftoverFix');
    expect(btn).not.toBeNull();
    expect(btn.textContent).toContain('Spojit (1)');
    btn.click();
    expect(code).toContain('KONTURA_START');
    expect(c.y1).toBe(20);
    expect(document.getElementById('leftoverFix')).toBeNull();
  });
});
