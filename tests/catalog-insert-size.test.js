// Výběr velikosti plátku podle ISO katalogu (cam/catalogInsertSize.js).
import { describe, it, expect } from 'vitest';
import { buildIsoKnife } from '../js/calculators/isoToolCatalog.js';
import { catalogSizeRowHTML, applyCatalogSize } from '../js/calculators/cam/catalogInsertSize.js';

const paramsOf = (rec) => ({ ...rec.tool, toolName: rec.name });

describe('velikost plátku podle katalogu', () => {
  it('kulatá SRGCL2525M12: výběr obsahuje RCMT 1204M0 jako zvolený', () => {
    const html = catalogSizeRowHTML(paramsOf(buildIsoKnife('RG', { shank: '2525', hand: 'L', size: '12' })));
    expect(html).toContain('data-p="isoSize"');
    expect(html).toMatch(/<option value="12" selected>RCMT 1204M0<\/option>/);
    expect(html).toContain('RCMT 0803M0');
  });

  it('změna na 20 nastaví R10, VBD kód, název a držák jako katalog', () => {
    const p = paramsOf(buildIsoKnife('RS', { shank: '2525', hand: 'L', size: '12' }));
    expect(applyCatalogSize(p, '20')).toBe(true);
    const cat = buildIsoKnife('RS', { shank: '2525', hand: 'L', size: '20' });
    expect(p.toolRadius).toBe(10);
    expect(p.toolVbdCode).toBe(cat.vbdCode);
    expect(p.toolName).toBe(cat.name);
    expect(JSON.stringify(p.holderProfile)).toBe(JSON.stringify(cat.tool.holderProfile));
  });

  it('ručně přepsané R (mimo katalog) → „vlastní velikost"', () => {
    const p = { ...paramsOf(buildIsoKnife('RS', { shank: '2525', hand: 'R', size: '12' })), toolRadius: 7.3 };
    expect(catalogSizeRowHTML(p)).toContain('— vlastní velikost —');
  });

  it('polygon: velikost nastaví délku hrany', () => {
    const p = paramsOf(buildIsoKnife('CL', { shank: '2525', hand: 'R', size: '12' }));
    expect(applyCatalogSize(p, '16')).toBe(true);
    expect(p.toolLength).toBe(buildIsoKnife('CL', { shank: '2525', hand: 'R', size: '16' }).tool.toolLength);
  });

  it('cizí nůž nebo jiný tvar nemá výběr', () => {
    const p = paramsOf(buildIsoKnife('RS', { shank: '2525', hand: 'R', size: '12' }));
    expect(catalogSizeRowHTML({ ...p, toolName: 'MŮJ NŮŽ' })).toBe('');
    expect(catalogSizeRowHTML({ ...p, toolShape: 'parting' })).toBe('');
    expect(applyCatalogSize({ ...p, toolName: 'MŮJ NŮŽ' }, '20')).toBe(false);
  });
});
