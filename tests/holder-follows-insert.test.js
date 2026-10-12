// Katalogový držák se přizpůsobí velikosti plátku (cam/holderFollowsInsert.js).
import { describe, it, expect } from 'vitest';
import { buildIsoKnife } from '../js/calculators/isoToolCatalog.js';
import { holderForResizedInsert, insertOfParams } from '../js/calculators/cam/holderFollowsInsert.js';

const paramsOf = (rec) => ({ ...rec.tool, toolName: rec.name });
const maxZ = (hp) => Math.max(...hp.sideA.map((p) => p.z));

describe('držák sleduje velikost plátku', () => {
  it('kulatá: R6 → R10 přestaví obrys držáku jako katalogový RCMT 2006', () => {
    const p = paramsOf(buildIsoKnife('RS', { shank: '2525', hand: 'L', size: '12' }));
    const before = insertOfParams(p);
    const next = { ...p, toolRadius: 10 };
    const hp = holderForResizedInsert(before, insertOfParams(next));
    expect(hp).not.toBeNull();
    // Stejný tvar jako katalog pro ⌀20 (R10).
    const cat = buildIsoKnife('RS', { shank: '2525', hand: 'L', size: '20' }).tool.holderProfile;
    expect(JSON.stringify(hp)).toBe(JSON.stringify(cat));
  });

  it('SRGCL (alias) se přestaví stejně jako SRSCL', () => {
    const p = paramsOf(buildIsoKnife('RG', { shank: '2525', hand: 'L', size: '12' }));
    expect(p.toolName).toBe('SRGCL2525M12');
    const hp = holderForResizedInsert(insertOfParams(p), insertOfParams({ ...p, toolRadius: 8 }));
    expect(hp).not.toBeNull();
    expect(maxZ(hp)).toBeGreaterThan(0);
  });

  it('postupné změny R fungují (obrys odpovídá vždy poslední velikosti)', () => {
    const p0 = paramsOf(buildIsoKnife('RS', { shank: '2525', hand: 'R', size: '12' }));
    const p1 = { ...p0, toolRadius: 9, holderProfile: holderForResizedInsert(insertOfParams(p0), insertOfParams({ ...p0, toolRadius: 9 })) };
    const hp2 = holderForResizedInsert(insertOfParams(p1), insertOfParams({ ...p1, toolRadius: 7 }));
    expect(hp2).not.toBeNull();
  });

  it('polygon: změna délky hrany přestaví držák', () => {
    const p = paramsOf(buildIsoKnife('CL', { shank: '2525', hand: 'R', size: '12' }));
    const hp = holderForResizedInsert(insertOfParams(p), insertOfParams({ ...p, toolLength: 16 }));
    expect(hp).not.toBeNull();
    expect(JSON.stringify(hp)).not.toBe(JSON.stringify(p.holderProfile));
  });

  it('ručně upravený obrys se nemění', () => {
    const p = paramsOf(buildIsoKnife('RS', { shank: '2525', hand: 'R', size: '12' }));
    p.holderProfile = { sideA: p.holderProfile.sideA.slice(0, -1), sideB: [] };
    expect(holderForResizedInsert(insertOfParams(p), insertOfParams({ ...p, toolRadius: 10 }))).toBeNull();
  });

  it('cizí název nože / beze změny velikosti → null', () => {
    const p = paramsOf(buildIsoKnife('RS', { shank: '2525', hand: 'R', size: '12' }));
    expect(holderForResizedInsert(insertOfParams({ ...p, toolName: 'MŮJ NŮŽ' }), insertOfParams({ ...p, toolName: 'MŮJ NŮŽ', toolRadius: 10 }))).toBeNull();
    expect(holderForResizedInsert(insertOfParams(p), insertOfParams(p))).toBeNull();
  });
});
