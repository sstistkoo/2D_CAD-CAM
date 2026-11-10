// @vitest-environment happy-dom
// Oba editory G-kódu (CAM Editor, CNC Editor) přes skutečné tlačítko v okně:
// hlavička, G90/G91 a ⚠ kontrola programu. Ty funkce jsou od 10. 11. 2026
// ve sdílených modulech (gcodeEditorHeader, gcodeCoordConvert,
// gcodeEditorParser) a editor je jen volá – tady se hlídá, že je volá správně.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';

const EDITORS = [
  ['CAM Editor', async (code) => (await import('../js/calculators/camEditor.js')).openCamEditor(code)],
  ['CNC Editor', async (code) => (await import('../js/calculators/cncEditor.js')).openCncEditor(code)],
];

// Okno editoru = předek editoru přímo pod <body>.
const windowOf = (el) => { while (el.parentElement && el.parentElement !== document.body) el = el.parentElement; return el; };

async function open(opener, code) {
  installUiDom();
  document.querySelectorAll('[data-el="editor"]').forEach(e => windowOf(e).remove());
  await opener(code);
  const ed = [...document.querySelectorAll('[data-el="editor"]')].pop();
  const win = windowOf(ed);
  const click = (act) => win.querySelector(`[data-act="${act}"]`).click();
  const setCode = (v) => { ed.value = v; ed.dispatchEvent(new Event('input', { bubbles: true })); };
  return { ed, win, click, setCode };
}

describe.each(EDITORS)('%s – akce v okně', (name, opener) => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* */ } });

  it('📝 hlavička se vloží na začátek programu', async () => {
    const { ed, click } = await open(opener, 'G0 X10 Z5\nM30');
    click('header');
    click('hdrApply');
    const lines = ed.value.split('\n');
    expect(lines[0]).toBe('N10 M41');
    expect(lines).toContain('N50 G54 G95 G90');
    expect(lines.slice(-2)).toEqual(['G0 X10 Z5', 'M30']);
  });

  it('G90 → G91 → G90 vrátí původní souřadnice', async () => {
    const { ed, click, setCode } = await open(opener, 'G90\nG0 X50 Z2\nG1 Z-20 F0.2\nG1 X60 Z-25');
    setCode('G90\nG0 X50 Z2\nG1 Z-20 F0.2\nG1 X60 Z-25');
    click('convMode');
    expect(ed.value).toMatch(/G91 G1 Z-22/);
    click('convMode');
    expect(ed.value.match(/[XZ]-?[\d.]+/g)).toEqual(['X50', 'Z2', 'Z-20', 'X60', 'Z-25']);
    expect(ed.value).not.toMatch(/G91/);
  });

  it('⚠ kontrola programu vypíše nalezenou chybu', async () => {
    const { win, click, setCode } = await open(opener, '');
    setCode('G95 G1 X10 Z0 F0.2');
    click('validate');
    const rows = [...win.querySelectorAll('.cne-val-row .cne-val-msg')].map(r => r.textContent);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.join('\n')).toMatch(/M30|vřeten|otáč/i);
  });
});
