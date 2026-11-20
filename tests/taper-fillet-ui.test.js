// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { taperBoreHTML, initTaperBore } from '../js/calculators/taperBore.js';

const type = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
function mount() {
  localStorage.clear();
  const ov = document.createElement('div');
  ov.innerHTML = taperBoreHTML();
  document.body.appendChild(ov);
  initTaperBore(ov);
  return {
    ov,
    $: id => ov.querySelector('[data-tb="' + id + '"]'),
    f: id => ov.querySelector('[data-tf="' + id + '"]'),
    c: id => ov.querySelector('[data-tfc="' + id + '"]'),
    svg: ov.querySelector('.tf-svg'),
    click: key => ov.querySelector('.tf-svg [data-edit="' + key + '"]').dispatchEvent(new MouseEvent('click', { bubbles: true })),
  };
}

describe('kalkulačka Kužel – záložka Přechod R (UI)', () => {
  it('kužel zadaný přímo v záložce R + R12 nahoře → body, kopie, náčrt kužele bez R', () => {
    const { ov, $, f, c, svg } = mount();
    c('cbig').value = 'A'; c('cbig').dispatchEvent(new Event('change', { bubbles: true }));
    type(c('cB'), '330'); type(c('cL'), '50'); type(c('ca'), '10');
    expect($('d').value).toBe('330');                   // zrcadlo do záložky Kužel
    expect($('L').value).toBe('50');
    expect(c('cA').classList.contains('computed')).toBe(true);
    expect(Number(c('cA').value)).toBeCloseTo(330 + 100 * Math.tan(10 * Math.PI / 180), 2);
    f('faceB').value = 'in';
    type(f('RB'), '12');
    type(f('zTop'), '0');
    const res = ov.querySelector('.tf-res').textContent;
    expect(res).toContain('Začátek R na čele');
    expect(res).toContain('309.862');
    expect(res).toContain('-9.916');
    expect(ov.querySelector('.tb-svg').innerHTML).not.toContain('tb-fil');
    // profil: oba konce, α a L klikací
    expect(svg.querySelector('[data-edit="R:B"]')).not.toBe(null);
    expect(svg.querySelector('[data-edit="R:A"]')).not.toBe(null);   // spodek bez R → „R ?"
    expect(svg.querySelector('[data-edit="alpha"]').textContent).toContain('10');
    expect(svg.querySelector('[data-edit="L"]').textContent).toContain('50');
    ov.remove();
  });

  it('vrch i spodek naráz (Ø se zápichem s R), převzetí průsečíku ze začátku R', () => {
    const { ov, $, f, c } = mount();
    c('cbig').value = 'A'; c('cbig').dispatchEvent(new Event('change', { bubbles: true }));
    type(c('cA'), '360'); type(c('cL'), '50'); type(c('ca'), '10');
    f('faceB').value = 'in'; type(f('RB'), '12');
    f('faceA').value = 'out'; type(f('angA'), '-15'); type(f('RA'), '5');
    const res = ov.querySelector('.tf-res').textContent;
    expect(res).toContain('Vrch R12');
    expect(res).toContain('Spodek R5');
    expect(res).toContain('pod -15°');
    f('givenB').value = 'start'; f('givenB').dispatchEvent(new Event('change', { bubbles: true }));
    expect(f('diaB').disabled).toBe(false);
    type(f('diaB'), '300');
    ov.querySelector('.tf-take').click();
    expect($('L').value).toBe('50');
    expect($('a').value).toBe('10');
    expect(Number(c('cB').value)).toBeCloseTo(300 + 2 * 12 / Math.tan(50 * Math.PI / 180), 3);
    ov.remove();
  });

  it('otočit R, záložky Kužel / Přechod R', () => {
    const { ov, f, click } = mount();
    const sec = ov.querySelector('#tbSection');
    const before = f('faceA').value;
    click('face:A');
    expect(f('faceA').value).not.toBe(before);
    ov.querySelector('.tf-flip[data-side="A"]').click();
    expect(f('faceA').value).toBe(before);
    expect(ov.querySelector('#tfSection').classList.contains('tb-r-only')).toBe(true);
    expect(ov.querySelector('.tb-svg').classList.contains('tb-cone-only')).toBe(true);
    ov.querySelector('[data-tbmode="r"]').click();
    expect(sec.classList.contains('tb-r')).toBe(true);
    ov.querySelector('[data-tbmode="cone"]').click();
    expect(sec.classList.contains('tb-r')).toBe(false);
    ov.remove();
  });
});
