// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { taperBoreHTML, initTaperBore } from '../js/calculators/taperBore.js';

const type = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };

describe('kalkulačka Kužel – tvarový přechod R (UI)', () => {
  it('kužel + R12 na vrchu → tabulka bodů, náčrt s R, text do programu', () => {
    localStorage.clear();
    const ov = document.createElement('div');
    ov.innerHTML = taperBoreHTML();
    document.body.appendChild(ov);
    initTaperBore(ov);
    const $ = id => ov.querySelector('[data-tb="' + id + '"]');
    const f = id => ov.querySelector('[data-tf="' + id + '"]');
    type($('d'), '330'); type($('L'), '50'); type($('a'), '10');
    $('big').value = 'A'; $('big').dispatchEvent(new Event('input', { bubbles: true }));
    f('faceB').value = 'in';
    type(f('RB'), '12');
    type(f('zTop'), '0');
    const res = ov.querySelector('.tf-res').textContent;
    expect(res).toContain('Začátek R na čele');
    expect(res).toContain('309.862');                   // 330 − 2·12/tan 50°
    expect(res).toContain('-9.916');                    // Z konce R na kuželu
    expect(ov.querySelector('.tb-svg [data-edit="fil:B"]')).not.toBe(null);
    // začátek R zadán na čele → nabídne převzetí průsečíku do kužele
    f('givenB').value = 'start'; f('givenB').dispatchEvent(new Event('change', { bubbles: true }));
    type(f('diaB'), '300');
    const take = ov.querySelector('.tf-take');
    expect(take).not.toBe(null);
    take.click();
    expect(Number($('d').value)).toBeCloseTo(300 + 2 * 12 / Math.tan(50 * Math.PI / 180), 3);
    expect(ov.querySelector('.tf-take')).toBe(null);
  });

  it('převzetí průsečíku nahradí druhý průměr, délka a úhel zůstanou', () => {
    localStorage.clear();
    const ov = document.createElement('div');
    ov.innerHTML = taperBoreHTML();
    document.body.appendChild(ov);
    initTaperBore(ov);
    const $ = id => ov.querySelector('[data-tb="' + id + '"]');
    const f = id => ov.querySelector('[data-tf="' + id + '"]');
    $('big').value = 'A'; $('big').dispatchEvent(new Event('input', { bubbles: true }));
    type($('D'), '360'); type($('L'), '50'); type($('a'), '10');   // vrch d se dopočítá
    f('faceB').value = 'in';
    f('givenB').value = 'start'; f('givenB').dispatchEvent(new Event('change', { bubbles: true }));
    type(f('RB'), '12'); type(f('diaB'), '300');
    ov.querySelector('.tf-take').click();
    expect($('L').value).toBe('50');
    expect($('a').value).toBe('10');
    expect($('D').classList.contains('computed')).toBe(true);    // D se teď dopočítá
    expect(ov.querySelector('.tf-take')).toBe(null);
    ov.remove();
  });

  it('klikací detail: přepnutí hrany, směr čela, popisky bodů', () => {
    const ov = document.body.lastElementChild;
    const svg = ov.querySelector('.tf-svg');
    const f = id => ov.querySelector('[data-tf="' + id + '"]');
    const click = key => svg.querySelector('[data-edit="' + key + '"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(svg.textContent).toContain('R12');
    expect(svg.textContent).toContain('průsečík');
    const tab = s => ov.querySelector('.tf-tab[data-tfside="' + s + '"]');
    tab('A').click();
    expect(svg.textContent).toContain('R ?');            // spodek zatím bez R
    expect(svg.textContent).toContain('Spodek');
    expect(ov.querySelector('.tf-edge[data-side="A"]').hidden).toBe(false);
    expect(ov.querySelector('.tf-edge[data-side="B"]').hidden).toBe(true);   // jen jedna sada polí
    const before = f('faceA').value;
    click('face');                                       // ⇄ otočit R v detailu
    expect(f('faceA').value).not.toBe(before);
    ov.querySelector('.tf-flip[data-side="A"]').click(); // ⇄ Otočit R pod poli
    expect(f('faceA').value).toBe(before);
    tab('B').click();
    expect(svg.textContent).toContain('R12');
  });
});
