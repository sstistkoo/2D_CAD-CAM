// @vitest-environment happy-dom
import { describe, it, expect, beforeAll } from 'vitest';

let mod;
beforeAll(async () => {
  // dotykový displej – lišta a přepínání type="number"
  window.matchMedia = (q) => ({ matches: q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {} });
  mod = await import('../js/dialogs/mathKeyBar.js');
});

const field = (html) => {
  document.body.innerHTML = html;
  return document.body.querySelector('input');
};

describe('výrazy v číselných polích (lišta + × ÷)', () => {
  it('které pole bere výraz', () => {
    expect(mod.isMathField(field('<input type="text" inputmode="decimal">'))).toBe(true);
    expect(mod.isMathField(field('<input type="number">'))).toBe(true);
    expect(mod.isMathField(field('<input type="text">'))).toBe(false);
    expect(mod.isMathField(field('<input type="text" inputmode="decimal" data-no-math>'))).toBe(false);
  });

  it('výraz → číslo, obyčejné číslo (i s čárkou) beze změny', () => {
    const el = field('<input type="text" inputmode="decimal">');
    el.value = '120-2*3'; expect(mod.evalMathField(el)).toBe(true); expect(el.value).toBe('114');
    el.value = '(50+10)/3'; mod.evalMathField(el); expect(el.value).toBe('20');
    el.value = '1,5'; expect(mod.evalMathField(el)).toBe(false); expect(el.value).toBe('1,5');
    el.value = '-0.25'; expect(mod.evalMathField(el)).toBe(false);
    el.value = '50/'; expect(mod.evalMathField(el)).toBe(false); expect(el.value).toBe('50/');
  });

  it('znaménko z lišty nepřepíše označené číslo, připíše se za něj', () => {
    const el = field('<input type="text" inputmode="decimal">');
    el.value = '90';
    el.focus();
    el.setSelectionRange(0, 2);
    document.querySelector('.math-key-bar [data-mk="+"]').click();
    expect(el.value).toBe('90+');
    el.setSelectionRange(0, 3);
    document.querySelector('.math-key-bar [data-mk="-"]').click();
    expect(el.value).toBe('90+-');
  });

  it('change přepočítá výraz dřív, než ho přečte obsluha pole', () => {
    const el = field('<input type="text" inputmode="decimal">');
    let seen = null;
    el.addEventListener('change', () => { seen = el.value; });
    el.value = '50/2';
    el.dispatchEvent(new Event('change', { bubbles: true }));
    expect(seen).toBe('25');
  });

  it('change u převedeného type="number" vrátí typ dřív, než ho čte obsluha', () => {
    const el = field('<input type="number">');
    let seen = null;
    el.addEventListener('change', () => { seen = [el.type, el.value]; });
    el.focus();
    el.value = '3*3';
    el.dispatchEvent(new Event('change', { bubbles: true }));
    expect(seen).toEqual(['number', '9']);
  });

  it('type="number" je při psaní textové a po opuštění zase číselné s výsledkem', () => {
    const el = field('<input type="number" inputmode="numeric"><button>ok</button>');
    el.focus();
    expect(el.type).toBe('text');
    expect(el.getAttribute('inputmode')).toBe('decimal');
    expect(document.querySelector('.math-key-bar')?.hidden).toBe(false);
    el.value = '10*4';
    el.blur();
    expect(el.type).toBe('number');
    expect(el.getAttribute('inputmode')).toBe('numeric');
    expect(el.value).toBe('40');
  });
});
