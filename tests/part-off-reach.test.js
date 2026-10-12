// Dosah čepele upichováku (cam/partOffReach.js) a upichovací lišty s dlouhým dosahem z 📚 katalogu.
import { describe, it, expect } from 'vitest';
import { partOffReachDepth, partOffReachWarning } from '../js/calculators/cam/partOffReach.js';
import { buildIsoKnife, isoLongReaches, isoGrooveWidths, isoTypeById, ISO_SHANKS } from '../js/calculators/isoToolCatalog.js';

const prmsOf = (rec, extra = {}) => ({ ...rec.tool, toolRadius: rec.tool.toolRadius, ...extra });

describe('dosah čepele upichováku', () => {
  it('standardní MGEHR 2525-5 (tmax 23) sahá ~20 mm, lišta T40 ~40 mm, T65 ~65 mm', () => {
    const std = partOffReachDepth(prmsOf(buildIsoKnife('GR', { shank: '2525', width: 5 })));
    expect(std).toBeGreaterThan(19);
    expect(std).toBeLessThan(22);
    for (const reach of [32, 40, 50, 65]) {
      const d = partOffReachDepth(prmsOf(buildIsoKnife('GD', { shank: '2525', width: 6, reach })));
      // Čepel sahá do tmax (od špičky), rozšíření začíná o pár desetin dál.
      expect(d, `T${reach}`).toBeGreaterThanOrEqual(reach - 0.01);
      expect(d, `T${reach}`).toBeLessThan(reach + 1);
    }
  });

  it('držák bez obrysu nebo bez rozšíření dosah neomezuje; ne-upichovací plátek také ne', () => {
    const k = buildIsoKnife('GR', { shank: '2525', width: 5 });
    expect(partOffReachDepth({ ...prmsOf(k), holderProfile: null })).toBeNull();
    const w = 5, r = k.tool.toolRadius;
    const rect = { sideA: [{ x: -r, z: 3 }, { x: w - r, z: 3 }, { x: w - r, z: 100 }, { x: -r, z: 100 }, { x: -r, z: 3 }], sideB: [] };
    expect(partOffReachDepth({ ...prmsOf(k), holderProfile: rect })).toBeNull();
    expect(partOffReachDepth(prmsOf(buildIsoKnife('SB', { shank: '2525' })))).toBeNull();
  });

  it('varování jen když polotovar sahá hlouběji než čepel (a je zadaná rovina upichnutí)', () => {
    const std = prmsOf(buildIsoKnife('GR', { shank: '2525', width: 5 }), { partOffZ: 100, allowanceX: 0.5 });
    expect(partOffReachWarning(std, 15)).toBeNull();
    expect(partOffReachWarning(std, 55)).toMatch(/sahá jen 20\.\d mm.*54\.5 mm/);
    expect(partOffReachWarning({ ...std, partOffZ: null }, 55)).toBeNull();
    const long = prmsOf(buildIsoKnife('GD', { shank: '2525', width: 6, reach: 65 }), { partOffZ: 100, allowanceX: 0.5 });
    expect(partOffReachWarning(long, 55)).toBeNull();
    expect(partOffReachWarning(long, 80)).not.toBeNull();
  });
});

describe('📚 upichovací lišta s dlouhým dosahem a dřík 4040', () => {
  it('dosah ≤ 13× šířka; jméno nese dosah; jen od dříku 2020', () => {
    expect(isoLongReaches(3)).toEqual([32]);
    expect(isoLongReaches(5)).toEqual([32, 40, 50, 65]);
    const gd = isoTypeById('GD');
    expect(isoGrooveWidths('1616', gd)).toEqual([]);
    expect(isoGrooveWidths('2020', gd).map((g) => g.w)).toEqual([3, 4]);
    const k = buildIsoKnife('GD', { shank: '2525', width: 5, reach: 50 });
    expect(k.name).toBe('UPICHR2525-5-T50');
    expect(k.iso.reach).toBe(50);
    // Neplatný dosah pro šířku → náhradní hodnota, ne null.
    expect(buildIsoKnife('GD', { shank: '2525', width: 3, reach: 65 }).iso.reach).toBe(32);
    expect(buildIsoKnife('GD', { shank: '1616' })).toBeNull();
  });

  it('dřík 4040 (R200) je v řadě a staví nože včetně zapichovacích a závitových', () => {
    const sh = ISO_SHANKS.find((s) => s.code === '4040');
    expect(sh).toMatchObject({ h: 40, b: 40, len: 'R', l1: 200 });
    expect(buildIsoKnife('CL', { shank: '4040' }).name).toMatch(/^PCLNR4040R/);
    expect(buildIsoKnife('RS', { shank: '4040', size: '32' }).name).toBe('SRSCR4040R32');
    expect(buildIsoKnife('TH', { shank: '4040' }).name).toMatch(/^SER4040R/);
    expect(buildIsoKnife('GR', { shank: '4040', width: 8 }).name).toBe('MGEHR4040-8');
  });
});
