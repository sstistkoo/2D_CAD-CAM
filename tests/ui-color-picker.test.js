// @vitest-environment happy-dom
// Výběr barvy (7 barev duhy + vlastní SV/hue/RGB + kapátko z plátna, volitelně
// tloušťka / průhlednost) a jeho tři použití: Vybarvit (bridge.openFillColorPicker
// z events.js), barva vrstvy (seznam vrstev), barva výběru (panel vlastností).
// Psáno PŘED přesunem z ui.js do js/ui/colorPicker.js
// (docs/plan-refaktoringu-ui.md, Fáze 1e) jako charakterizace: projde na
// starém kódu a po přesunu musí projít beze změny.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';

let ui, bridge, state, drawCanvas;
const pop = () => document.querySelector('.color-popover-overlay');
const q = (s) => pop().querySelector(s);
const swatches = () => [...pop().querySelectorAll('.color-swatch-btn')].map(b => b.dataset.color + (b.classList.contains('active') ? '*' : ''));
const rgb = () => [...pop().querySelectorAll('.custom-picker-rgb input')].map(i => i.value);
const sliders = () => [...pop().querySelectorAll('.color-popover-width')].map(r => [r.querySelector('label').textContent, r.querySelector('input').value, r.querySelector('span').textContent]);
const setInput = (el, v) => { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); };
const esc = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
const toast = () => document.querySelector('.toast')?.textContent;

beforeAll(async () => {
  installUiDom();
  ui = await import('../js/ui.js');
  ({ bridge } = await import('../js/bridge.js'));
  ({ state } = await import('../js/state.js'));
  ({ drawCanvas } = await import('../js/canvas.js'));
});
afterEach(() => {
  pop()?.remove();
  state.objects = [];
  state.selected = null;
  state.multiSelected.clear();
});

describe('výběr barvy — Vybarvit (bridge.openFillColorPicker)', () => {
  it('duha, vlastní barva přes hue a RGB, průhlednost; OK výplň ponechá', () => {
    const fill = { type: 'fill', color: '#ff0000', alpha: 0.5 };
    state.objects = [fill];
    bridge.openFillColorPicker(fill);
    expect(q('h3').textContent).toBe('Vybarvit');
    expect(swatches()).toMatchInlineSnapshot(`
      [
        "#e53935",
        "#fb923c",
        "#fbbf24",
        "#4ade80",
        "#60a5fa",
        "#818cf8",
        "#c084fc",
      ]
    `);
    expect(rgb()).toEqual(['255', '0', '0']);
    expect(sliders()).toEqual([['Průhlednost', '0.5', '50 %']]);
    expect(q('.custom-picker-panel').hidden).toBe(true);
    q('.color-popover-swatch-toggle').click();
    expect(q('.custom-picker-panel').hidden).toBe(false);

    const sw = pop().querySelectorAll('.color-swatch-btn');
    sw[3].click();
    expect(fill.color).toBe(sw[3].dataset.color);
    expect(swatches().filter(s => s.endsWith('*'))).toEqual([sw[3].dataset.color + '*']);

    setInput(q('.custom-picker-hue'), 200);
    const afterHue = fill.color;
    setInput(pop().querySelectorAll('.custom-picker-rgb input')[0], 16);
    setInput(pop().querySelectorAll('.custom-picker-rgb input')[1], 32);
    setInput(pop().querySelectorAll('.custom-picker-rgb input')[2], 300);   // ořízne na 255
    expect([afterHue, fill.color, rgb(), q('.custom-picker-hue').value, q('.custom-picker-preview').style.background])
      .toMatchInlineSnapshot(`
        [
          "#4aadde",
          "#1020ff",
          [
            "16",
            "32",
            "255",
          ],
          "236",
          "#1020ff",
        ]
      `);

    setInput(pop().querySelectorAll('.color-popover-width input')[0], 0.25);
    expect(fill.alpha).toBe(0.25);
    expect(sliders()).toEqual([['Průhlednost', '0.25', '25 %']]);

    q('.color-popover-ok').click();
    expect(pop()).toBeNull();
    expect(state.objects).toEqual([fill]);
  });

  it('✕, Escape i klik mimo dialog zruší celé vybarvení (smaže novou výplň)', () => {
    for (const cancel of [() => q('.color-popover-close').click(), esc, () => pop().click()]) {
      const fill = { type: 'fill', color: '#00ff00', alpha: 1 };
      state.objects = [{ type: 'point', x: 0, y: 0 }, fill];
      bridge.openFillColorPicker(fill);
      cancel();
      expect(pop()).toBeNull();
      expect(state.objects).toEqual([{ type: 'point', x: 0, y: 0 }]);
    }
  });

  it('kapátko: klik na objekt převezme barvu a picker se otevře znovu (zachová průhlednost); do prázdna / Escape jen znovu otevře', () => {
    const line = { type: 'line', x1: -50, y1: 0, x2: 50, y2: 0, color: '#123456' };
    const fill = { type: 'fill', color: '#ff0000', alpha: 0.5 };
    state.objects = [line, fill];
    Object.assign(state, { panX: 0, panY: 0, zoom: 1 });
    bridge.openFillColorPicker(fill);
    setInput(pop().querySelectorAll('.color-popover-width input')[0], 0.3);

    q('.color-popover-eyedrop').click();
    expect(pop()).toBeNull();
    expect(drawCanvas.style.cursor).toBe('crosshair');
    expect(toast()).toBe('Klikněte na objekt, jehož barvu chcete použít (klik do prázdna = zrušit)');
    drawCanvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 0, clientY: 0 }));
    expect(fill.color).toBe('#123456');
    expect(drawCanvas.style.cursor).toBe('');
    expect(pop()).toBeTruthy();
    expect([rgb(), sliders()]).toEqual([['18', '52', '86'], [['Průhlednost', '0.3', '30 %']]]);

    q('.color-popover-eyedrop').click();
    drawCanvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 400, clientY: 400 }));
    expect(fill.color).toBe('#123456');
    expect(pop()).toBeTruthy();

    q('.color-popover-eyedrop').click();
    esc();
    expect(pop()).toBeTruthy();
    expect(state.objects).toEqual([line, fill]);   // Escape kapátka výplň nemaže
  });
});

describe('výběr barvy — vrstva a výběr objektů', () => {
  it('barva vrstvy: živý náhled barvy i tloušťky na tečce, Escape vrátí obojí', () => {
    const layer = { ...state.layers[0], name: 'Obrys', color: '#89b4fa', lineWidth: 2 };
    const orig = state.layers;
    state.layers = [layer];
    try {
      ui.updateLayerList();
      const dot = document.querySelector('#layerList .layer-color-dot');
      dot.click();
      expect(q('h3').textContent).toBe('Barva vrstvy „Obrys“');
      expect(sliders()).toEqual([['Tloušťka čáry', '2', '2 px']]);
      pop().querySelectorAll('.color-swatch-btn')[0].click();
      const c0 = pop().querySelectorAll('.color-swatch-btn')[0].dataset.color;
      expect([layer.color, dot.style.background]).toEqual([c0, c0]);
      setInput(pop().querySelectorAll('.color-popover-width input')[0], 3.5);
      expect([layer.lineWidth, sliders()[0][2]]).toEqual([3.5, '3.5 px']);
      esc();
      expect([layer.color, layer.lineWidth, dot.style.background]).toEqual(['#89b4fa', 2, '#89b4fa']);

      delete layer.lineWidth;
      dot.click();
      expect(sliders()[0]).toMatchInlineSnapshot(`
        [
          "Tloušťka čáry",
          "1.5",
          "1.5 px",
        ]
      `);   // bez tloušťky vrstvy → LINE_WIDTH
    } finally { state.layers = orig; }
  });

  it('barva výběru (panel vlastností): sjednotí všechny, ✕ vrátí původní; OK ponechá', () => {
    const a = { type: 'line', x1: 0, y1: 0, x2: 10, y2: 0, color: '#ff0000', layer: state.layers[0].id };
    const b = { type: 'line', x1: 0, y1: 5, x2: 10, y2: 5, layer: state.layers[0].id };
    state.objects = [a, b];
    state.selected = 0;
    state.multiSelected = new Set([0, 1]);
    ui.updateProperties();
    const row = [...document.querySelectorAll('#propTable tr')].find(tr => tr.firstChild?.textContent === 'Barva');
    const btn = row.querySelector('.layer-color-dot');
    btn.click();
    expect(q('h3').textContent).toBe('Barva (2 objektů)');
    expect(rgb()).toEqual(['255', '0', '0']);
    expect(sliders()).toEqual([]);
    const sw = pop().querySelectorAll('.color-swatch-btn')[5];
    sw.click();
    expect([a.color, b.color, btn.style.background]).toEqual([sw.dataset.color, sw.dataset.color, sw.dataset.color]);
    q('.color-popover-close').click();
    expect([a.color, b.color, btn.style.background]).toEqual(['#ff0000', undefined, '#ff0000']);

    btn.click();
    pop().querySelectorAll('.color-swatch-btn')[1].click();
    q('.color-popover-ok').click();
    expect(a.color).toBe(b.color);
    expect(a.color).not.toBe('#ff0000');
  });
});
