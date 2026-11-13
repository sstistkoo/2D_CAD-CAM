// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../js/htmlEscape.js';

describe('escapeHtml v atributu (📋 Kopírovat u příkladů)', () => {
  it('kód s uvozovkami projde data-code beze ztráty', () => {
    // Dřívější DOM varianta neescapovala " → atribut skončil u první
    // uvozovky a tlačítko zkopírovalo jen „MSG(".
    const code = 'MSG("hodnoty osy X "<<R1<<" mm")';
    const div = document.createElement('div');
    div.innerHTML = `<button data-code="${escapeHtml(code)}">📋</button><pre>${escapeHtml(code)}</pre>`;
    expect(div.querySelector('button').dataset.code).toBe(code);
    expect(div.querySelector('pre').textContent).toBe(code);
  });
});

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
