import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../js/htmlEscape.js';

describe('escapeHtml', () => {
  it('escapuje & < > " (text i atribut v uvozovkách)', () => {
    expect(escapeHtml('a & b <i>"x"</i>')).toBe('a &amp; b &lt;i&gt;&quot;x&quot;&lt;/i&gt;');
  });
  it('null / undefined → prázdný řetězec, čísla jako text', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(12.5)).toBe('12.5');
  });
  it('nezdvojuje už escapovaný text a apostrof nechává', () => {
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
    expect(escapeHtml("it's")).toBe("it's");
  });
});
