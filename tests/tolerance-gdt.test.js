import { describe, it, expect } from 'vitest';
import { gdtSectionHTML } from '../js/calculators/toleranceGdt.js';

describe('Tolerance – značky ISO 1101', () => {
  const html = gdtSectionHTML();
  const count = (re) => (html.match(re) || []).length;

  it('všech 14 značek ISO 1101 (souosost a soustřednost mají jednu značku)', () => {
    expect(count(/class="gdt-item"/g)).toBe(14);
    for (const n of ['Přímost', 'Rovinnost', 'Kruhovitost', 'Válcovitost', 'Tvar profilu', 'Tvar plochy',
      'Rovnoběžnost', 'Kolmost', 'Sklon', 'Poloha', 'Souosost', 'Souměrnost', 'Házení kruhové', 'Házení celkové']) {
      expect(html).toContain(n);
    }
  });

  it('každá značka má SVG ikonu, nic nechybí', () => {
    expect(html).not.toContain('undefined');
    expect(count(/<svg /g)).toBe(14 + 3);          // seznam + 3 vzorové rámečky
    expect(count(/<svg /g)).toBe(count(/<\/svg>/g));
  });

  it('párové tagy', () => {
    for (const t of ['div', 'span', 'details']) {
      expect(count(new RegExp('<' + t + '[ >]', 'g'))).toBe(count(new RegExp('</' + t + '>', 'g')));
    }
  });
});
