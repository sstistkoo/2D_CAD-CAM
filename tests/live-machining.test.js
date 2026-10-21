// Simulace obrábění poháněnými nástroji v čase (cam/live/liveMachining.js).
import { describe, it, expect } from 'vitest';
import { buildLiveTimeline, liveStateAt } from '../js/calculators/cam/live/liveMachining.js';
import { newLiveOp, normalizeLiveOp } from '../js/calculators/cam/live/liveModel.js';

const geo = { faceZ: 0, outerD: 100 };
const op = (kind, over) => normalizeLiveOp({ ...newLiveOp(kind, geo, 1), ...over });
const prms = { rapidFeed: 6000 };

describe('časová osa obrábění', () => {
  const drill = op('drill', { count: 2, pcd: 60, depth: 10, feed: 100, peck: 0, dwell: 0, safe: 2, retract: 5 });
  const tl = buildLiveTimeline([drill], prms);

  it('vrtání trvá podle posuvu: 2 díry × (2 + 10 mm) při 100 mm/min', () => {
    expect(tl.total).toBeGreaterThan(2 * 12 / 100 * 60);       // 14,4 s posuvem
    expect(tl.total).toBeLessThan(2 * 12 / 100 * 60 + 3);      // + rychloposuvy a natočení C
    expect(tl.opEnd).toEqual([tl.total]);
  });
  it('hloubka díry roste v čase, druhá díra začne až po první', () => {
    const tFirstBottom = tl.pts.find(p => p.hole === 0 && p.d >= 10).t;
    const mid = liveStateAt(tl, tFirstBottom / 2 + 0.2);
    const d0 = mid.depth.get('0:0');
    expect(d0).toBeGreaterThan(0);
    expect(d0).toBeLessThan(10);
    expect(mid.depth.has('0:1')).toBe(false);
    expect(mid.active).toEqual({ op: 0, hole: 0 });
    expect(mid.done.size).toBe(0);
  });
  it('na konci jsou obě díry na plné hloubce a operace hotová', () => {
    const end = liveStateAt(tl, tl.total + 5);
    expect([end.depth.get('0:0'), end.depth.get('0:1')]).toEqual([10, 10]);
    expect(end.done.has(0)).toBe(true);
    expect(end.active).toBe(null);
  });
  it('vrtání s krokem: víc ponorů, stejná konečná hloubka, delší čas', () => {
    const peck = buildLiveTimeline([{ ...drill, peck: 3 }], prms);
    expect(peck.total).toBeGreaterThan(tl.total);
    expect(liveStateAt(peck, peck.total).depth.get('0:1')).toBe(10);
  });
  it('kapsa: stopa frézy v materiálu a hloubka po hladinách', () => {
    const mill = op('mill', { count: 1, pcd: 0, holeD: 20, toolD: 8, depth: 6, stepDown: 3, feed: 300 });
    const mtl = buildLiveTimeline([mill], prms);
    const end = liveStateAt(mtl, mtl.total);
    expect(end.depth.get('0:0')).toBeCloseTo(6, 6);
    const lines = end.sweeps.get(0);
    expect(lines.length).toBeGreaterThan(0);
    const far = Math.max(...lines.flat().map(q => Math.hypot(q.x, q.y)));
    expect(far).toBeCloseTo(20 / 2 - 8 / 2, 6);   // nejvzdálenější střed frézy = Ø kapsy − Ø frézy
    expect(liveStateAt(mtl, 0).sweeps.size).toBe(0);
  });
  it('radiální díra: hloubka od pláště k ose', () => {
    const rad = op('drill', { side: 'radial', count: 1, startAngle: 90, xTop: 80, zPos: -20, depth: 8, feed: 120, peck: 0, dwell: 0 });
    const rtl = buildLiveTimeline([rad], prms);
    const bottom = rtl.pts.find(p => p.d >= 8);
    expect(bottom.x).toBeCloseTo(0, 6);
    expect(bottom.y).toBeCloseTo(40 - 8, 6);       // úhel 90° → osa Y, poloměr 40 − 8
    expect(bottom.z).toBe(-20);
  });
  it('chybné zadání (NC blok ho vynechá) se ani v simulaci neobrobí', () => {
    const bad = op('mill', { count: 1, pcd: 40, holeD: 6, toolD: 10, depth: 4 });   // kapsa menší než fréza
    const two = buildLiveTimeline([bad, drill], prms);
    const end = liveStateAt(two, two.total);
    expect([...end.depth.keys()].some(k => k.startsWith('0:'))).toBe(false);
    expect(end.depth.get('1:0')).toBe(10);
    expect(two.total).toBeCloseTo(tl.total, 6);
  });
});
