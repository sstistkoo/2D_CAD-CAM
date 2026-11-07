// Posuv podle plátku (uživatel 7. 11. 2026, insertFeeds.js): zvlášť hrubování
// (f) a dokončení (fFin); F dokončení v CAM; převod uloženého zásobníku.
import { describe, it, expect } from 'vitest';
import { _isoDefaultMagSlots, _buildMagSlotFromTool } from '../js/calculators/cam/sim/magSlots.js';
import { insertRoughFeed, insertFinishFeed, slotFinishFeed } from '../js/calculators/insertFeeds.js';
import { finishBaseFeed } from '../js/calculators/cam/finishFeed.js';
import { _defaultCamParams } from '../js/calculators/cam/camDefaults.js';
import { upgradeDefaultKnifeFeeds, legacyKnifeFeeds } from '../js/calculators/magazineFeedUpgrade.js';

const poly = (radius, tipAngle) => ({ shape: 'polygon', radius, tipAngle });
const round = (radius) => ({ shape: 'round', radius });

describe('posuv podle plátku', () => {
  it('hrubování: rε a pevnost špičky, kulatá podle R', () => {
    expect(insertRoughFeed(poly(0.8, 90))).toBe(0.48);    // SNMG ..08
    expect(insertRoughFeed(poly(1.2, 80))).toBe(0.72);    // CNMG ..12
    expect(insertRoughFeed(poly(1.6, 90))).toBe(0.8);     // strop
    expect(insertRoughFeed(poly(0.4, 55))).toBe(0.18);    // DNMG ..04
    expect(insertRoughFeed(poly(0.4, 35))).toBe(0.12);    // VNMG ..04
    expect(insertRoughFeed(poly(0, 90))).toBe(0.1);       // ostrá špička = dno
    expect(insertRoughFeed(round(5))).toBe(0.4);
    expect(insertRoughFeed(round(10))).toBe(0.8);
    expect(insertRoughFeed(round(16))).toBe(1);
    expect(insertRoughFeed({ shape: 'parting', radius: 0.4 })).toBeNull();
  });
  it('dokončení: z Ra 1,6, nikdy rychleji než hrubování', () => {
    expect(insertFinishFeed(poly(0.4, 55))).toBe(0.14);
    expect(insertFinishFeed(poly(0.8, 90))).toBe(0.2);
    expect(insertFinishFeed(poly(1.2, 80))).toBe(0.25);
    expect(insertFinishFeed(round(10))).toBe(0.5);
    expect(insertFinishFeed(round(5))).toBe(0.4);          // = hrubování R5
    for (const r of [0.2, 0.4, 0.8, 1.2, 1.6]) for (const e of [35, 55, 80, 90]) {
      expect(insertFinishFeed(poly(r, e))).toBeLessThanOrEqual(insertRoughFeed(poly(r, e)));
    }
  });
  it('výchozí zásobník nese f hrub. i f dok.', () => {
    const by = Object.fromEntries(_isoDefaultMagSlots().map(s => [s.name, s]));
    expect([by.PSBNR2525M12.f, by.PSBNR2525M12.fFin]).toEqual([0.48, 0.2]);
    expect([by.PDJNR2525M15.f, by.PDJNR2525M15.fFin]).toEqual([0.18, 0.14]);
    expect([by.SRSCR2525M20.f, by.SRSCR2525M20.fFin]).toEqual([0.8, 0.5]);
    expect(by['MGEHR2525-5'].fFin).toBeUndefined();
  });
  it('nůž ze souboru (bez řezných podmínek) dostane odhad z plátku', () => {
    const s = _buildMagSlotFromTool({ toolShape: 'polygon', toolRadius: 1.2, toolTipAngle: 80 }, 3, 'X');
    expect([s.f, s.fFin]).toEqual([0.72, 0.25]);
  });
  it('F dokončení: dok. nůž → fFin/odhad, týž nůž → finishFeed, 0 = auto z plátku', () => {
    const p = { ..._defaultCamParams(), toolShape: 'polygon', toolRadius: 0.8, toolTipAngle: 90, feed: 0.48 };
    expect(p.finishFeed).toBe(0);
    expect(finishBaseFeed(p)).toBe(0.2);
    expect(finishBaseFeed({ ...p, finishFeed: 0.3 })).toBe(0.3);
    expect(finishBaseFeed({ ...p, toolShape: 'parting' })).toBe(0.48);   // bez pravidla → F
    expect(finishBaseFeed(p, { f: 0.5, fFin: 0.18 })).toBe(0.18);
    expect(finishBaseFeed(p, { shape: 'polygon', radius: 0.4, tipAngle: 55, f: 0.3 })).toBe(0.14);
    expect(slotFinishFeed({ shape: 'parting', f: 0.09 })).toBe(0.09);
  });
  it('převod zásobníku: nezměněné výchozí nože z rev ≤ 4 i rev 5, upravené ne', () => {
    const slots = _isoDefaultMagSlots();
    const i = (n) => slots.findIndex(s => s.name === n);
    const old = slots.map(s => { const o = { ...s }; delete o.fFin; const l = legacyKnifeFeeds(s); if (l.length) o.f = l[0]; return o; });
    old[i('PSBNR2525M12')].f = 0.8;                         // revize 5
    old[i('PDJNR2525M15')].f = 0.33;                        // upravil uživatel
    const S = { toolMagazine: old, params: { toolName: 'PSBNR2525M12', feed: 0.8, finishFeed: 0.25 }, opParts: [] };
    expect(upgradeDefaultKnifeFeeds(S)).toBe(4);           // PSKNR, PSBNR, SRSCR, SRDPN (fFin)
    expect([old[i('PSBNR2525M12')].f, old[i('PSBNR2525M12')].fFin]).toEqual([0.48, 0.2]);
    expect(old[i('PDJNR2525M15')].f).toBe(0.33);
    expect(old[i('PDJNR2525M15')].fFin).toBeUndefined();
    expect(S.params.feed).toBe(0.48);
    expect(S.params.finishFeed).toBe(0);
    expect(upgradeDefaultKnifeFeeds(S)).toBe(0);
  });
});
