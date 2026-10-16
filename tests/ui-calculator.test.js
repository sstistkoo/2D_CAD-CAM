// @vitest-environment happy-dom
// Kalkulačka (🔢), její schránka (📋 na plátně) a sledování posledního
// vstupního pole. Psáno PŘED přesunem z ui.js do js/ui/calculator.js
// (docs/plan-refaktoringu-ui.md, Fáze 1d) jako charakterizace: projde na
// starém kódu a po přesunu musí projít beze změny. Testy běží v pořadí
// a sdílí stav modulu (poslední výsledek = ANS, schránka).
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';
import { settle } from './helpers/simUi.mjs';
import { getMeta, setMeta } from '../js/idb.js';

let ui;
const overlay = () => document.querySelector('.calc-overlay[data-type="calc"]');
const q = (s) => overlay().querySelector(s);
const press = (...vals) => { for (const v of vals) q(`.calc-btn[data-val="${CSS.escape(v)}"]`).click(); };
const display = () => q('#calcDisplay').value;
const exprLine = () => q('#calcExpr').textContent;
const history = () => [...overlay().querySelectorAll('.calc-hist-full')].map(e => e.textContent);
const toast = () => document.querySelector('.toast')?.textContent;
const calcBtn = () => document.getElementById('canvasCalcBtn');
const clipBtn = () => document.getElementById('canvasClipBtn');

async function openCalc() {
  calcBtn().click();
  await vi.waitFor(() => expect(overlay()).toBeTruthy());
  await settle(5);
}
async function closeCalc() {
  q('.calc-close-inner-btn').click();
  await settle(5);
}

beforeAll(async () => {
  installUiDom();
  ui = await import('../js/ui.js');
});
beforeEach(async () => {
  await setMeta('calcHistory', null);
  vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
});
afterEach(async () => {
  if (overlay()) await closeCalc();
  document.querySelectorAll('.test-input').forEach(e => e.remove());
  vi.restoreAllMocks();
});

describe('kalkulačka', () => {
  it('🔢 otevře plovoucí okno bez titulku a tlačítko 🔢 se schová; zavření ho vrátí', async () => {
    expect(calcBtn().style.display).toBe('');
    await openCalc();
    expect(overlay().classList.contains('calc-overlay-float')).toBe(true);
    expect(q('.calc-titlebar').style.display).toBe('none');
    expect(q('.calc-window').className).toBe('calc-window calc-basic-window');
    expect(calcBtn().style.display).toBe('none');
    ui.openCalculator();   // druhé otevření nic nepřidá
    expect(document.querySelectorAll('.calc-overlay[data-type="calc"]').length).toBe(1);
    await closeCalc();
    expect(overlay()).toBeNull();
    expect(calcBtn().style.display).toBe('');
  });

  it('jiné blokující okno schová 🔢, plovoucí ne', async () => {
    const block = document.createElement('div');
    block.className = 'calc-overlay';
    document.body.appendChild(block);
    await settle(5);
    expect(calcBtn().style.display).toBe('none');
    block.className = 'calc-overlay calc-overlay-float';
    block.remove();
    document.body.appendChild(block);
    await settle(5);
    expect(calcBtn().style.display).toBe('');
    block.remove();
    await settle(5);
  });

  it('výpočty: operátory, implicitní násobení π, %, tečka, C/←, historie do IDB', async () => {
    await openCalc();
    expect(display()).toBe('');   // jen placeholder „0"
    press('1', '2', '+', '3', '=');
    expect(display()).toBe('15');
    expect(exprLine()).toBe('12+3 = 15');
    expect(history()).toEqual(['12+3 = 15']);
    await vi.waitFor(async () => expect(await getMeta('calcHistory')).toEqual([{ expr: '12+3', result: 15 }]));

    press('2', 'pi', '=');   // číslice po „=" začne nový výpočet; 2π
    expect(display()).toBe('6.28318530718');
    expect(exprLine()).toBe('2×π = 6.28318530718');

    press('C', '5', '0', '%', '*', '-', '4', '=');
    expect(display()).toBe('-2');
    expect(exprLine()).toBe('50%×−4 = -2');

    press('C', '.', '5', '.', '5', 'CE', '+', '+', '1', '=');
    expect(display()).toBe('1.5');
    expect(history()).toEqual(['12+3 = 15', '2×π = 6.28318530718', '50%×−4 = -2', '0.5+1 = 1.5']);

    press('C', '2', '+', '=');
    expect(exprLine()).toBe('⚠ Chyba ve výrazu');
    expect(q('#calcDisplay').classList.contains('calc-display-error')).toBe(true);
  });

  it('funkce: √, x², sin ve stupních, asin mimo obor; rozbalovací f(x)', async () => {
    await openCalc();
    press('9', 'sqrt');
    expect(display()).toBe('3');
    expect(exprLine()).toBe('sqrt(9) = 3');
    press('pow');
    expect(display()).toBe('9');
    press('_trig');
    expect(q('#calcTrigDropdown').classList.contains('open')).toBe(true);
    press('C', '3', '0', 'sin');
    expect(display()).toBe('0.5');
    expect(q('#calcTrigDropdown').classList.contains('open')).toBe(false);
    press('C', '2', 'asin');
    expect(exprLine()).toBe('⚠ Mimo definiční obor');
  });

  it('ANS přežije zavření okna; operátor na prázdném displeji naváže na ANS', async () => {
    await openCalc();
    press('7', '=');
    await closeCalc();
    await openCalc();
    press('ans');
    expect(display()).toBe('7');
    press('C', '*', '3', '=');
    expect(display()).toBe('21');
    expect(exprLine()).toBe('7×3 = 21');
    press('C', '2', 'ans');   // implicitní násobení
    expect(display()).toBe('2*21');
  });

  it('historie: klik na řádek vrátí výsledek, ✕ smaže řádek, 🗑 smaže vše', async () => {
    await setMeta('calcHistory', [{ expr: '1+1', result: 2 }, { expr: '2+2', result: 4 }]);
    await openCalc();
    await vi.waitFor(() => expect(history()).toEqual(['1+1 = 2', '2+2 = 4']));
    overlay().querySelectorAll('.calc-history-item')[1].click();
    expect(display()).toBe('4');
    expect(exprLine()).toBe('← 4');
    overlay().querySelectorAll('.calc-hist-del')[0].click();
    expect(history()).toEqual(['2+2 = 4']);
    await vi.waitFor(async () => expect(await getMeta('calcHistory')).toEqual([{ expr: '2+2', result: 4 }]));
    q('.calc-hist-clear-btn').click();
    expect(history()).toEqual([]);
    expect(toast()).toBe('Historie vymazána');
  });

  it('klávesnice: psaní, Enter spočítá, Escape vymaže (okno zůstane)', async () => {
    await openCalc();
    const d = q('#calcDisplay');
    d.value = '6,5*2';
    d.dispatchEvent(new Event('input', { bubbles: true }));
    d.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(display()).toBe('13');
    d.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(display()).toBe('0');
    expect(overlay()).toBeTruthy();
  });
});

describe('schránka kalkulačky a vložení do posledního pole', () => {
  const makeInput = (value) => {
    const inp = document.createElement('input');
    inp.className = 'test-input';
    inp.value = value;
    document.body.appendChild(inp);
    inp.focus();   // focusin → poslední pole
    return inp;
  };

  it('📋 v kalkulačce: do systémové schránky + tlačítko schránky na plátně', async () => {
    await openCalc();
    press('C', '4', '2', '=', 'copy');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('42');
    expect(ui.getCalcClipboardValue()).toBe('42');
    expect([clipBtn().textContent, clipBtn().title, clipBtn().style.display]).toEqual(['42', 'Schránka: 42 (klik = vložit)', '']);
  });

  it('⤓ vloží výsledek na kurzor posledního pole (input událost) a zavře kalkulačku', async () => {
    const inp = makeInput('ab');
    inp.setSelectionRange(1, 1);
    const onInput = vi.fn();
    inp.addEventListener('input', onInput);
    await openCalc();
    q('#calcDisplay').focus();   // vlastní displej kalkulačky se jako cíl nesleduje
    press('C', '9', '=', 'paste');
    expect(inp.value).toBe('a9b');
    expect([inp.selectionStart, inp.selectionEnd]).toEqual([2, 2]);
    expect(onInput).toHaveBeenCalledTimes(1);
    expect(toast()).toBe('Vloženo: 9');
    expect(overlay()).toBeNull();
  });

  it('⤓ bez platného cíle jen zkopíruje do schránky', async () => {
    const inp = makeInput('x');
    inp.remove();
    await openCalc();
    press('C', '3', '=', 'paste');
    expect(ui.getCalcClipboardValue()).toBe('3');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('3');
    expect(overlay()).toBeTruthy();
  });

  it('tlačítko schránky na plátně: vloží do posledního pole, prázdná → hláška', async () => {
    ui.setCalcClipboardValue('12.5');
    const inp = makeInput('');
    clipBtn().click();
    expect(inp.value).toBe('12.5');
    expect(toast()).toBe('Vloženo: 12.5');

    ui.setCalcClipboardValue(null);
    expect([clipBtn().textContent, clipBtn().title, clipBtn().style.display]).toEqual(['—', 'Schránka kalkulačky (prázdná)', 'none']);
    clipBtn().click();
    expect(toast()).toBe('Schránka kalkulačky je prázdná');

    ui.setCalcClipboardValue('');
    expect(clipBtn().style.display).toBe('none');
  });

  it('tlačítko schránky bez platného pole zkopíruje do systémové schránky', async () => {
    ui.setCalcClipboardValue('7');
    const inp = makeInput('');
    inp.disabled = true;
    clipBtn().click();
    expect(inp.value).toBe('');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('7');
  });

  it('#btnOpenCalc (panel Kalkulačky) otevře kalkulačku', async () => {
    document.getElementById('btnOpenCalc').click();
    await settle(5);
    expect(overlay()).toBeTruthy();
  });
});
