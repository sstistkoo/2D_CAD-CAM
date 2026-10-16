// @vitest-environment happy-dom
// Nulový bod (📍 #btnSetRef, ✕ #btnClearNullPoint, indikátor v levém panelu).
// Psáno PŘED přesunem z ui.js do js/ui/nullPoint.js
// (docs/plan-refaktoringu-ui.md, Fáze 2b) jako charakterizace: projde na
// starém kódu a po přesunu musí projít beze změny.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';

let ui, state, drawCanvas;
const ov = () => document.querySelector('.input-overlay');
const q = (s) => ov().querySelector(s);
const toast = () => document.querySelector('.toast')?.textContent;
const indicator = () => [document.getElementById('nullPointIndicator').hidden, document.getElementById('nullPointCoords').textContent,
  document.getElementById('btnSetRef').classList.contains('null-active')];
const np = () => [state.incReference, state.nullPointAngle, state.nullPointActive, state.coordMode];

beforeAll(async () => {
  installUiDom();
  ui = await import('../js/ui.js');
  ({ state } = await import('../js/state.js'));
  ({ drawCanvas } = await import('../js/canvas.js'));
});
beforeEach(() => {
  ui.clearNullPoint();
  state.machineType = 'soustruh';
});
afterEach(() => { document.querySelectorAll('.input-overlay').forEach(o => o.remove()); });

describe('nulový bod', () => {
  it('📍 otevře dialog (soustruh: Z / X), Potvrdit nastaví bod, úhel a INC; indikátor ukáže X/Z', () => {
    document.getElementById('btnSetRef').click();
    expect(q('h3').textContent).toBe('📍 Nastavení nulového bodu');
    expect([...ov().querySelectorAll('.input-row label')].map(l => l.textContent)).toEqual(['Z:', 'X:', 'Natočení (°):']);
    q('#nullPtH').value = '10';
    q('#nullPtV').value = '2*2.5';
    q('#nullPtAngle').value = '30';
    q('#nullPtOk').click();
    expect(ov()).toBeNull();
    expect(np()).toEqual([{ x: 10, y: 5 }, 30, true, 'inc']);
    expect(indicator()).toEqual([false, 'X: 5.000  Z: 10.000  ∠30°', true]);
    // Hláška v absolutních souřadnicích (dřív se formátovala až po přepnutí
    // do INC vůči právě nastavenému bodu → vždy „ΔX: 0 ΔZ: 0", nález č. 4).
    expect(toast()).toBe('Nulový bod: X: 5   Z: 10 ∠30°');
    // i když už INC běží s jiným bodem
    document.getElementById('btnSetRef').click();   // aktivní → zrušit
    state.coordMode = 'inc';
    state.incReference = { x: 100, y: 100 };
    state.nullPointActive = false;
    document.getElementById('btnSetRef').click();
    q('#nullPtH').value = '-4';
    q('#nullPtV').value = '7.5';
    q('#nullPtOk').click();
    expect(toast()).toBe('Nulový bod: X: 7.5   Z: -4');
    expect(state.coordMode).toBe('inc');
  });

  it('nastavení i zrušení se hned uloží s ABS/INC (po obnovení stránky platí dál)', () => {
    const stored = () => JSON.parse(localStorage.getItem('skica-settings'));
    document.getElementById('btnSetRef').click();
    q('#nullPtH').value = '10';
    q('#nullPtV').value = '5';
    q('#nullPtAngle').value = '30';
    q('#nullPtOk').click();
    const s = stored();
    expect([s.incReference, s.nullPointAngle, s.nullPointActive, s.coordMode]).toEqual([{ x: 10, y: 5 }, 30, true, 'inc']);
    ui.clearNullPoint();
    const c = stored();
    expect([c.incReference, c.nullPointAngle, c.nullPointActive, c.coordMode]).toEqual([{ x: 0, y: 0 }, 0, false, 'abs']);
  });

  it('druhý klik na aktivní 📍 nulový bod zruší (ABS); ✕ v panelu taky', () => {
    document.getElementById('btnSetRef').click();
    q('#nullPtH').value = '1';
    q('#nullPtOk').click();
    expect(state.nullPointActive).toBe(true);
    document.getElementById('btnSetRef').click();
    expect(ov()).toBeNull();
    expect(np()).toEqual([{ x: 0, y: 0 }, 0, false, 'abs']);
    expect(indicator()).toEqual([true, '', false]);
    expect(toast()).toBe('Nulový bod zrušen – ABS režim');

    document.getElementById('btnSetRef').click();
    q('#nullPtOk').click();
    document.getElementById('btnClearNullPoint').click();
    expect(np()).toEqual([{ x: 0, y: 0 }, 0, false, 'abs']);
  });

  it('karusel: popisky X / Z, indikátor bez úhlu; Enter potvrdí; neplatné souřadnice dialog nechají', () => {
    state.machineType = 'karusel';
    document.getElementById('btnSetRef').click();
    expect([...ov().querySelectorAll('.input-row label')].slice(0, 2).map(l => l.textContent)).toEqual(['X:', 'Z:']);
    q('#nullPtH').value = 'abc';
    q('#nullPtOk').click();
    expect([toast(), !!ov(), state.nullPointActive]).toEqual(['Neplatné souřadnice', true, false]);
    q('#nullPtH').value = '7';
    q('#nullPtV').value = '-3';
    q('#nullPtAngle').value = 'xx';   // neplatný úhel → 0
    q('#nullPtV').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(np()).toEqual([{ x: 7, y: -3 }, 0, true, 'inc']);
    expect(indicator()).toEqual([false, 'X: 7.000  Z: -3.000', true]);
  });

  it('🎯 vybrat z výkresu: dialog se schová, klik na plátno vyplní souřadnice a dialog vrátí; Zrušit zavře', () => {
    Object.assign(state, { panX: 100, panY: 50, zoom: 2, snapToPoints: false });
    document.getElementById('btnSetRef').click();
    q('#nullPtPick').click();
    expect(ov().style.display).toBe('none');
    expect(toast()).toBe('Klikněte na výkres pro výběr bodu...');
    drawCanvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 140, clientY: 30 }));
    expect(ov().style.display).toBe('flex');
    expect([q('#nullPtH').value, q('#nullPtV').value]).toMatchInlineSnapshot(`
      [
        "20.000",
        "10.000",
      ]
    `);
    q('#nullPtCancel').click();
    expect(ov()).toBeNull();
    expect(state.nullPointActive).toBe(false);
  });
});
