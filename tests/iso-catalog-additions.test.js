// Doplňky 📚 katalogu z 12. 10. 2026: navrtáváky, hustší řada vrtáků (+ Morse 3–5),
// těžké vyvrtávací tyče ⌀50–80, zapichováky 6 a 8 mm a radiusový zápich MRMN.
import { describe, it, expect } from 'vitest';
import {
  buildIsoDrill, isoDrillDiameters, isoPreDrillDiameters, isoDrillLabel, ISO_DRILL_KINDS,
} from '../js/calculators/isoDrills.js';
import { drillDims } from '../js/calculators/cam/inserts/drill.js';
import {
  buildIsoKnife, isoGrooveWidths, isoTypeById, isoVariants, ISO_SHANKS,
} from '../js/calculators/isoToolCatalog.js';
import { ISO_BARS, buildIsoInternalKnife, isoThreadInsertsForBar, isoBarFitsHole } from '../js/calculators/isoInternalTools.js';
import { catalogDrillFor } from '../js/calculators/cam/ops/borePreDrill.js';

describe('📚 navrtáváky a řada vrtáků', () => {
  it('navrtávák 90° / 120°: vrchol, krátké vyložení, na jeden zátah, jméno bez diakritiky', () => {
    const a = buildIsoDrill({ kind: 'spot90', diameter: 10 });
    const b = buildIsoDrill({ kind: 'spot120', diameter: 10 });
    expect(a.name).toBe('Navrtavak 90 D10');
    expect(b.name).toBe('Navrtavak 120 D10');
    expect(a.tool.toolTipAngle).toBe(90);
    expect(b.tool.toolTipAngle).toBe(120);
    expect(a.tool.toolShape).toBe('drill');
    expect(a.ap).toBe(0);
    // Krátký a tuhý — mnohem kratší než HSS vrták téhož ⌀.
    expect(a.tool.toolLength).toBeLessThan(buildIsoDrill({ kind: 'hss', diameter: 10 }).tool.toolLength / 2);
    // Špička 90° má délku kužele = poloměr; CAM (drillDims) jí rozumí.
    expect(drillDims({ toolRadius: 5, toolTipAngle: 90, toolLength: a.tool.toolLength }).point).toBeCloseTo(5, 6);
  });

  it('navrtávák nemá popisek „pod závit"; neznámý ⌀ → ⌀10', () => {
    expect(isoDrillLabel(5, 'spot90')).toBe('⌀5');
    expect(isoDrillLabel(5, 'hss')).toBe('⌀5 · pod M6');
    expect(buildIsoDrill({ kind: 'spot120', diameter: 7 }).iso.diameter).toBe(10);
  });

  it('řada HSS má mezilehlé ⌀ a velké vrtáky s Morse 3–5, tvrdokov mezilehlé ⌀', () => {
    const hss = isoDrillDiameters('hss');
    for (const d of [9, 11, 13, 15, 19, 21, 32, 35, 38, 40, 45, 50]) expect(hss, `HSS ⌀${d}`).toContain(d);
    for (const d of [9, 11, 13, 15, 19]) expect(isoDrillDiameters('hm'), `HM ⌀${d}`).toContain(d);
    const holder = (d) => buildIsoDrill({ kind: 'hss', diameter: d }).holderCode;
    expect([holder(20), holder(25), holder(32), holder(40), holder(50)]).toEqual(['MK2', 'MK3', 'MK4', 'MK4', 'MK5']);
    // Pouzdro vždy začíná za vyložením a je širší než vrták (viz test v iso-tool-catalog).
    for (const d of [32, 50]) {
      const r = buildIsoDrill({ kind: 'hss', diameter: d });
      expect(r.tool.holderWidth).toBeGreaterThan(d);
    }
  });

  it('předvrtání v CAM jede dál po PŮVODNÍ řadě ⌀ (doplnění katalogu nesmí změnit dráhy)', () => {
    expect(isoPreDrillDiameters()).toEqual([3, 4, 4.2, 5, 6, 6.8, 8, 8.5, 10, 10.2, 12, 14, 16, 17.5, 18, 20, 22, 25, 30]);
    // dMax 14,5 → dřív ⌀14, ne nově doplněné ⌀13 / ⌀15.
    expect(catalogDrillFor(14.5).iso.diameter).toBe(14);
    expect(catalogDrillFor(20.9).iso.diameter).toBe(20);
    expect(catalogDrillFor(60).iso.diameter).toBe(30);
  });

  it('každý druh má aspoň jeden ⌀ a jedinečné jména', () => {
    const names = ISO_DRILL_KINDS.flatMap((k) => isoDrillDiameters(k.id).map((d) => buildIsoDrill({ kind: k.id, diameter: d }).name));
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('📚 těžké vyvrtávací tyče ⌀50–80', () => {
  it('jsou v řadě s Dmin ≈ 1,25×d a pojmenování podle ISO 5608', () => {
    for (const d of [50, 63, 80]) expect(ISO_BARS.find((b) => b.d === d), `⌀${d}`).toBeTruthy();
    expect(buildIsoInternalKnife('BCL', { bar: 50 }).name).toBe('S50W-PCLNR19');
    expect(buildIsoInternalKnife('BCL', { bar: 80 }).iso.dmin).toBe(100);
    expect(isoBarFitsHole(63, 79)).toBe(false);
    expect(isoBarFitsHole(63, 80)).toBe(true);
  });

  it('mají všechny typy včetně závitového SNR', () => {
    for (const id of ['BCL', 'BTF', 'BDU', 'BDQ', 'BVU', 'BTH']) {
      expect(buildIsoInternalKnife(id, { bar: 63 })?.iso.bar, id).toBe(63);
    }
    expect(isoThreadInsertsForBar(63).length).toBeGreaterThan(0);
  });
});

describe('📚 zapichováky 6 a 8 mm a radiusový zápich', () => {
  it('MGMN 600 / 800 jen do dříků, kam se vejdou', () => {
    expect(isoGrooveWidths('1616').map((g) => g.w)).toEqual([2, 3]);
    expect(isoGrooveWidths('2525').map((g) => g.w)).toEqual([2, 3, 4, 5, 6]);
    expect(isoGrooveWidths('3232').map((g) => g.w)).toEqual([3, 4, 5, 6, 8]);
    const k = buildIsoKnife('GR', { shank: '3232', width: 8 });
    expect(k.name).toBe('MGEHR3232-8');
    expect(k.vbdCode).toBe('MGMN800-M');
    expect(k.tool.toolLength).toBe(8);
  });

  it('MRMN: plný rádius dna = šířka / 2, jedinečné jméno vedle MGMN', () => {
    const gn = isoTypeById('GN');
    expect(isoVariants(gn, '2525')).toEqual(['neg']);
    const k = buildIsoKnife('GN', { shank: '2525', width: 4 });
    expect(k.name).toBe('MGEHR2525-4-R2');
    expect(k.vbdCode).toBe('MRMN400-M');
    expect(k.tool).toMatchObject({ toolShape: 'parting', toolLength: 4, toolRadius: 2 });
    expect(k.name).not.toBe(buildIsoKnife('GR', { shank: '2525', width: 4 }).name);
    // Dřík 1616 má jen MRMN 300; 3232 až 8.
    expect(isoGrooveWidths('1616', gn).map((g) => g.w)).toEqual([3]);
    expect(isoGrooveWidths('3232', gn).map((g) => g.w)).toEqual([3, 4, 5, 6, 8]);
  });

  it('každá zapichovací kombinace dá obrys držáku a rádius nepřesáhne půl šířky', () => {
    for (const sh of ISO_SHANKS) {
      for (const id of ['GR', 'GN']) {
        for (const g of isoGrooveWidths(sh.code, isoTypeById(id))) {
          const k = buildIsoKnife(id, { shank: sh.code, width: g.w });
          expect(k.tool.toolRadius, k.name).toBeLessThanOrEqual(g.w / 2 + 1e-9);
          expect(k.tool.holderProfile.sideA.length, k.name).toBeGreaterThanOrEqual(5);
        }
      }
    }
  });
});
