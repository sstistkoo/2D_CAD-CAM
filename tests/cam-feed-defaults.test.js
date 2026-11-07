// Výchozí posuv (uživatel 7. 11. 2026): kulatá R > 7 a hrubovací polygon 0,8,
// dokončovací polygon a dokončení týmž nožem 0,25; převod uloženého zásobníku.
import { describe, it, expect } from 'vitest';
import { _isoDefaultMagSlots } from '../js/calculators/cam/sim/magSlots.js';
import { buildIsoKnife } from '../js/calculators/isoToolCatalog.js';
import { finishBaseFeed } from '../js/calculators/cam/finishFeed.js';
import { _defaultCamParams } from '../js/calculators/cam/camDefaults.js';
import { upgradeDefaultKnifeFeeds, legacyKnifeFeed } from '../js/calculators/magazineFeedUpgrade.js';

describe('výchozí posuv nožů', () => {
  it('výchozí zásobník: hrubovací 0,8, dokončovací 0,25, malá kulatá beze změny', () => {
    const f = Object.fromEntries(_isoDefaultMagSlots().map(s => [s.name, s.f]));
    expect(f.PSKNR2525M12).toBe(0.8);
    expect(f.PSBNR2525M12).toBe(0.8);
    expect(f.PDJNR2525M15).toBe(0.25);
    expect(f.SRSCR2525M20).toBe(0.8);          // R10
    expect(f['SRDPN úzký']).toBe(0.12);        // R5 ≤ 7 → dál podle R
  });
  it('kulatá z katalogu: hranice R 7', () => {
    expect(buildIsoKnife('RS', { size: '16', shank: '2525', hand: 'R' }).f).toBe(0.8);   // R8
    expect(buildIsoKnife('RS', { size: '12', shank: '2525', hand: 'R' }).f).toBeLessThan(0.8); // R6
  });
  it('F dokončení: týž nůž → finishFeed, 0 → F hrubování, dokončovací nůž → jeho f', () => {
    const p = _defaultCamParams();
    expect(p.feed).toBe(0.8);
    expect(finishBaseFeed(p)).toBe(0.25);
    expect(finishBaseFeed({ ...p, finishFeed: 0 })).toBe(0.8);
    expect(finishBaseFeed(p, { f: 0.18 })).toBe(0.18);
  });
  it('převod zásobníku: jen nezměněné výchozí nože a F, které je drží', () => {
    const old = _isoDefaultMagSlots().map(s => ({ ...s, f: legacyKnifeFeed(s) ?? s.f }));
    const fin = old.findIndex(s => s.name === 'PDJNR2525M15');
    old[fin].f = 0.33;                                           // upravil uživatel
    const S = { toolMagazine: old, params: { toolName: old[0].name, feed: old[0].f }, opParts: [] };
    expect(upgradeDefaultKnifeFeeds(S)).toBe(3);                 // PSKNR, PSBNR, SRSCR
    expect(S.toolMagazine[0].f).toBe(0.8);
    expect(S.toolMagazine[fin].f).toBe(0.33);
    expect(S.params.feed).toBe(0.8);
    expect(upgradeDefaultKnifeFeeds(S)).toBe(0);                 // podruhé nic
  });
});
