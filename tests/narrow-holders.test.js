import { describe, it, expect } from 'vitest';
import { buildNarrowKnife, narrowHolderProfile, NARROW_GAP_MM } from '../js/calculators/narrowHolders.js';
import { holderForResizedInsert, insertOfParams, insertOfSlot } from '../js/calculators/cam/holderFollowsInsert.js';
import { _isoMagSlot } from '../js/calculators/cam/sim/magSlots.js';
import { isoDefaultsAddedSince, defaultMagazineKnives } from '../js/calculators/magazineDefaults.js';

const xs = (p) => p.sideA.map((q) => q.x);
const halfWidth = (p) => Math.max(...xs(p).map(Math.abs));

describe('úzké držáky (SRDPN, upichovák s rovnou lištou)', () => {
  it('kulatá: lišta užší než destička na obou stranách a do destičky nesahá', () => {
    for (const R of [3, 5, 8, 12.5]) {
      const p = narrowHolderProfile({ toolShape: 'round', toolRadius: R });
      expect(halfWidth(p)).toBeCloseTo(R - NARROW_GAP_MM.round, 6);
      for (const q of p.sideA) expect(Math.hypot(q.x, q.z)).toBeGreaterThanOrEqual(R);
      // Hrany lůžka (tětivy) leží vně kružnice.
      for (let i = 1; i < p.sideA.length; i++) {
        const a = p.sideA[i - 1], b = p.sideA[i];
        const t = Math.max(0, Math.min(1, -(a.x * (b.x - a.x) + a.z * (b.z - a.z)) / ((b.x - a.x) ** 2 + (b.z - a.z) ** 2)));
        expect(Math.hypot(a.x + t * (b.x - a.x), a.z + t * (b.z - a.z))).toBeGreaterThan(R);
      }
    }
  });

  it('upichovák: lišta užší než destička, rovná po celé délce', () => {
    const k = buildNarrowKnife({ kind: 'parting', width: 5, tipRadius: 0.4 });
    const x = xs(k.tool.holderProfile);
    expect(Math.min(...x)).toBeCloseTo(-0.4 + NARROW_GAP_MM.parting, 6);
    expect(Math.max(...x)).toBeCloseTo(5 - 0.4 - NARROW_GAP_MM.parting, 6);
    expect(new Set(x.map((v) => v.toFixed(3))).size).toBe(2);
  });

  it('změna R / šířky přestaví lištu, ručně upravený držák se nemění', () => {
    const k = buildNarrowKnife({ kind: 'round', radius: 5 });
    const params = { ...k.tool, toolName: k.name };
    const hp = holderForResizedInsert(insertOfParams(params), insertOfParams({ ...params, toolRadius: 8 }));
    expect(halfWidth(hp)).toBeCloseTo(8 - NARROW_GAP_MM.round, 6);

    const g = buildNarrowKnife({ kind: 'parting', width: 4 });
    const gp = { ...g.tool, toolName: g.name };
    const hp2 = holderForResizedInsert(insertOfParams(gp), insertOfParams({ ...gp, toolLength: 6 }));
    expect(Math.max(...xs(hp2)) - Math.min(...xs(hp2))).toBeCloseTo(6 - 2 * NARROW_GAP_MM.parting, 6);

    // Slot 🔧 Zásobníku (dialog zásobníku): totéž přes insertOfSlot.
    const slot = _isoMagSlot(g, 9);
    const hp3 = holderForResizedInsert(insertOfSlot(slot), insertOfSlot({ ...slot, toolLength: 3 }));
    expect(Math.max(...xs(hp3)) - Math.min(...xs(hp3))).toBeCloseTo(3 - 2 * NARROW_GAP_MM.parting, 6);

    const edited ={ ...gp, holderProfile: { sideA: gp.holderProfile.sideA.map((q) => ({ x: q.x, z: q.z + 1 })), sideB: [] } };
    expect(holderForResizedInsert(insertOfParams(edited), insertOfParams({ ...edited, toolLength: 6 }))).toBeNull();
  });

  it('výchozí sada je má a uložený zásobník je dostane jednou (revize 4)', () => {
    const names = defaultMagazineKnives().map((r) => r.name);
    expect(names).toContain('SRDPN úzký');
    expect(names).toContain('Upichovák úzký');
    expect(isoDefaultsAddedSince(3).map((r) => r.name)).toEqual(['SRDPN úzký', 'Upichovák úzký']);
  });
});

describe('úzký držák × hlídání držáku (toolEnvelope.js)', () => {
  // Uživatel 1. 11. 2026: SRDPN úzký R5 nedojížděl ke stěně jako SRSCR —
  // obálka brala siluetu středu nosu (o R blíž do strany), držák ve stínu
  // destičky tak končil o 2,5 mm dřív. Teď stejné konce vrstev jako SRSCR R5.
  it('vrstvy u stěny končí stejně jako se SRSCR téhož R', async () => {
    const { runCamProg } = await import('./helpers/camHeadless.mjs');
    const { buildIsoKnife } = await import('../js/calculators/isoToolCatalog.js');
    const P = (x, z, t = 'G1') => ({ type: t, x, z, r: 0, mode: 'ABS' });
    const ends = async (tool) => {
      const r = await runCamProg({ params: { ...tool, roughingStrategy: 'longitudinal', mode: 'RADIUS', stockMode: 'cylinder',
        stockDiameter: 100, stockLength: 90, stockFace: 1, depthOfCut: 2, finishAllowance: 0.2, doFinishing: false },
        contourPoints: [P(0, 0, 'G0'), P(20, 0), P(20, -20), P(40, -25), P(40, -40), P(20, -60), P(20, -80)], stockPoints: [] });
      return r.calc.passes.filter((p) => p.type === 'long' && p.x > 24 && p.x < 46 && p.zEnd > -30)
        .map((p) => `${p.x.toFixed(1)}:${p.zEnd.toFixed(2)}`);
    };
    const narrow = await ends(buildNarrowKnife({ kind: 'round', radius: 5 }).tool);
    expect(narrow.length).toBeGreaterThan(5);
    expect(narrow).toEqual(await ends(buildIsoKnife('RS', { shank: '2525', size: '10' }).tool));
  }, 120000);
});
