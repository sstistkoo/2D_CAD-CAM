// @vitest-environment happy-dom
// Okno Kontroly výkresu (contourCheck.js offerDrawingFixes): seznam oprav se
// zaškrtávátky, tlačítko ukazuje počet, opraví se jen zaškrtnuté (jedno Zpět),
// nezaškrtnuté se v tomtéž sezení znovu nenabízejí.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';

let cc, state;
const L = (x1, y1, x2, y2) => ({ type: 'line', x1, y1, x2, y2, layer: 0, name: 'Úsečka' });

beforeAll(async () => {
  installUiDom();
  await import('../js/ui.js');
  ({ state } = await import('../js/state.js'));
  cc = await import('../js/dialogs/contourCheck.js');
});

describe('okno Kontrola výkresu', () => {
  it('zaškrtnuté se opraví, nezaškrtnuté zůstane a znovu se nenabídne', () => {
    state.machineType = 'soustruh';
    // čelo začíná 0,3 pod osou + mezera 0,2 v rohu
    state.objects = [L(100, -0.3, 100, 20), L(100, 20, 50.2, 20), L(50, 20, 50, 30), L(50, 30, 0, 30), L(0, 30, 0, 0)];
    let done = 0;
    expect(cc.offerDrawingFixes({ onDone: () => done++ })).toBe(true);
    const dlg = document.querySelector('.fix-dialog');
    const boxes = dlg.querySelectorAll('input[type=checkbox]');
    expect(boxes).toHaveLength(2);
    const ok = dlg.querySelector('#fixDialogOk');
    expect(ok.textContent).toBe('Opravit vše (2)');
    expect(state.drawingFixMarks).toHaveLength(3);
    // Odškrtnout mezeru (druhá položka).
    const gapIdx = [...dlg.querySelectorAll('.fix-item span')].findIndex(s => s.textContent.includes('mezera'));
    boxes[gapIdx].checked = false;
    boxes[gapIdx].dispatchEvent(new Event('change'));
    expect(ok.textContent).toBe('Opravit vybrané (1)');
    ok.click();
    expect(done).toBe(1);
    expect(document.querySelector('.fix-dialog')).toBeNull();
    expect(state.drawingFixMarks).toEqual([]);
    expect(state.objects[0].y1).toBe(0);         // osa opravena
    expect(state.objects[1].x2).toBe(50.2);      // mezera ne
    // Odmítnutá mezera se znovu nenabízí — ruční kontrola (all) ano.
    expect(cc.offerDrawingFixes()).toBe(false);
    expect(cc.offerDrawingFixes({ all: true })).toBe(true);
    document.querySelector('.fix-dialog').closest('.input-overlay').remove();   // = Ponechat vše
    expect(state.objects[1].x2).toBe(50.2);
  });

  it('bez chyb se okno neotevře', () => {
    state.objects = [L(100, 0, 100, 20), L(100, 20, 0, 20), L(0, 20, 0, 0)];
    let done = 0;
    expect(cc.offerDrawingFixes({ onDone: () => done++ })).toBe(false);
    expect(done).toBe(1);
    expect(document.querySelector('.fix-dialog')).toBeNull();
  });
});
