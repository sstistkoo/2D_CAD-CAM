// @vitest-environment happy-dom
// Trigonometrie – pravý trojúhelník (tlačítko #btnOpenTrig). Psáno PŘED
// přesunem z ui.js do js/ui/trigCalc.js (docs/plan-refaktoringu-ui.md,
// Fáze 1c) jako charakterizace: projde na starém kódu a po přesunu musí
// projít beze změny. Testy běží v pořadí (poslední výsledek kalkulačky
// a schránka jsou stav modulu).
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';
import { settle } from './helpers/simUi.mjs';

let ui, bridge;
const overlay = () => document.querySelector('.calc-overlay[data-type="trig"]');
const q = (s) => overlay().querySelector(s);
const F = ['trigA', 'trigB', 'trigC', 'trigAlpha', 'trigBeta'];
const values = () => F.map(id => q('#' + id).value + (q('#' + id).classList.contains('computed') ? '*' : ''));
const status = () => [q('.trig-status').textContent, q('.trig-status').classList.contains('trig-status-error')];
const toast = () => document.querySelector('.toast')?.textContent;
const setField = (id, v) => { const i = q('#' + id); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); };
const enter = (id) => q('#' + id).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
const history = () => [...q('#trigHistory').children].map(r => r.textContent);

async function openTrig() {
  document.getElementById('btnOpenTrig').click();
  await vi.waitFor(() => expect(overlay()).toBeTruthy());
}

beforeAll(async () => {
  installUiDom();
  ui = await import('../js/ui.js');
  ({ bridge } = await import('../js/bridge.js'));
});
beforeEach(() => {
  vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
});
afterEach(async () => {
  document.querySelectorAll('.calc-overlay').forEach(o => o.remove());
  await settle(5);
  vi.restoreAllMocks();
});

describe('trigonometrie', () => {
  it('tlačítko otevře okno a zavolá bridge.extendTrigCalc (záložka Obecný)', async () => {
    const orig = bridge.extendTrigCalc;
    bridge.extendTrigCalc = vi.fn();
    try {
      await openTrig();
      expect(bridge.extendTrigCalc).toHaveBeenCalledTimes(1);
    } finally { bridge.extendTrigCalc = orig; }
    expect(q('.calc-titlebar h3').textContent).toBe('📐 Trigonometrie – pravý trojúhelník');
    expect(q('.calc-window').classList.contains('trig-window')).toBe(true);
    expect(values()).toEqual(['', '', '', '', '']);
    expect(q('#trigGamma').value).toBe('90');
    expect(status()).toEqual(['Zadejte 2 hodnoty – výpočet proběhne automaticky', false]);
  });

  it('Enter spočítá ze 2 zadaných; změna zadání přepočítá jen ze zadaných polí', async () => {
    await openTrig();
    setField('trigA', '3');
    setField('trigB', '4');
    enter('trigB');
    expect(values()).toEqual(['3', '4', '5*', '36.8699*', '53.1301*']);
    expect(status()).toEqual(['✓ Vypočteno', false]);
    setField('trigA', 'sqrt(9)*2');
    q('.trig-btn-solve').click();
    expect(values()).toEqual(['sqrt(9)*2', '4', '7.2111*', '56.3099*', '33.6901*']);
  });

  it('automatický výpočet při psaní (prodleva 400 ms), nedokončený výraz chybu nehlásí', async () => {
    await openTrig();
    setField('trigC', '10');
    setField('trigAlpha', '30');
    await vi.waitFor(() => expect(values()).toEqual(['5*', '8.6603*', '10', '30', '60*']), { timeout: 2000 });
    setField('trigA', 'sqrt(');
    await settle(450);
    expect(status()).toEqual(['Zadejte 2 hodnoty – výpočet proběhne automaticky', false]);
    q('.trig-btn-solve').click();
    expect(status()).toEqual(['Neplatný výraz v poli a', true]);
  });

  it('Kopírovat → schránka + historie; Vymazat uloží do historie jen jednou a vyprázdní pole', async () => {
    await openTrig();
    setField('trigA', '3');
    setField('trigB', '4');
    enter('trigA');
    q('.trig-btn-copy').click();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('a=3  b=4  c=5  α=36.8699°  β=53.1301°  γ=90°');
    expect(history()).toEqual(['a=3  b=4  c=5  α=36.8699°  β=53.1301°  γ=90°']);
    q('.trig-btn-clear').click();
    expect(history()).toHaveLength(1);
    expect(values()).toEqual(['', '', '', '', '']);
    q('#trigHistory').children[0].click();
    expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith('a=3  b=4  c=5  α=36.8699°  β=53.1301°  γ=90°');
  });

  it('⤓ Vložit výsledek: bez výsledku hláška; schránka → první prázdné pole; výsledek kalkulačky → vybrané pole', async () => {
    await openTrig();
    q('.trig-btn-paste').click();
    expect(toast()).toBe('Kalkulačka zatím nemá výsledek');

    ui.setCalcClipboardValue('7');
    q('.trig-btn-paste').click();
    expect(values()[0]).toBe('7');
    expect(toast()).toBe('Vloženo: 7');

    // výsledek kalkulačky má přednost před schránkou
    ui.openCalculator();
    const calc = document.querySelector('.calc-overlay[data-type="calc"]');
    for (const v of ['2', '4', '=']) calc.querySelector(`.calc-btn[data-val="${v}"]`).click();
    calc.querySelector('.calc-close-inner-btn').click();
    q('#trigBeta').dispatchEvent(new FocusEvent('focus'));
    q('.trig-btn-paste').click();
    expect(values()[4]).toBe('24');
  });

  it('⌨ přepne klávesnici čísla ↔ písmena; 🔢 otevře kalkulačku', async () => {
    await openTrig();
    const kbd = q('.trig-btn-kbd');
    kbd.click();
    expect([q('#trigA').inputMode, q('#trigBeta').inputMode, kbd.textContent]).toEqual(['text', 'text', '⌨ 123']);
    kbd.click();
    expect([q('#trigA').inputMode, kbd.textContent]).toEqual(['decimal', '⌨ abc']);
    q('.trig-btn-calc').click();
    expect(document.querySelector('.calc-overlay[data-type="calc"]')).toBeTruthy();
  });
});
