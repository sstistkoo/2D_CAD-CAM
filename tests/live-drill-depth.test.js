// Hloubka díry poháněným vrtákem = hloubka PLNÉHO Ø jako kóta na výkrese,
// špička 118° jede o 0,3·Ø dál (liveModel.drillDepth, uživatel 30. 10. 2026).
// Díra skrz z výkresu (depthAtTip) přesah na špičku už nese. Kontrola 5:
// vyložení / šroubovice vrtáku ze zásobníku proti hloubce špičky.
import { describe, it, expect } from 'vitest';
import { buildLiveBlock } from '../js/calculators/cam/live/liveGcode.js';
import { newLiveOp, normalizeLiveOp, drillDepth, drillLevels, liveOpSummary } from '../js/calculators/cam/live/liveModel.js';
import { buildLiveTimeline, liveStateAt } from '../js/calculators/cam/live/liveMachining.js';
import { liveOpsFromCad } from '../js/calculators/cam/live/liveFromCad.js';
import { checkLiveOps, drillReachIssue, deepHoleIssue } from '../js/calculators/cam/live/liveChecks.js';
import { liveProfile } from '../js/calculators/cam/live/liveCut.js';

const geo = { faceZ: 0, outerD: 100 };
// Ø8 hl. 10 → špička 12,4; jedna díra, naráz.
const drill = o => normalizeLiveOp({ ...newLiveOp('drill', geo, 1), pattern: 'points', points: '0; 30', peck: 0, ...o });
const prms = (o = {}) => ({ controlSystem: 'sinumerik', mode: 'DIAMON', safeX: 150, safeZ: 5, liveOps: [drill()], ...o });

describe('drillDepth: kam jede špička', () => {
  it('plný Ø + 0,3·Ø; skrz z výkresu, navrtání, závit a fréza beze změny', () => {
    expect(drillDepth(drill())).toBe(12.4);
    expect(drillDepth(drill({ depthAtTip: true }))).toBe(10);
    expect(drillDepth(drill({ role: 'spot', spotD: 10 }))).toBe(10);
    expect(drillDepth(drill({ role: 'tap', pitch: 1.25 }))).toBe(10);
    expect(drillDepth(normalizeLiveOp({ ...newLiveOp('mill', geo, 1), depth: 4 }))).toBe(4);
  });
  it('popis operace ukáže hloubku i špičku', () => {
    expect(liveOpSummary(drill())).toContain('hl. 10 (špička 12.4)');
    expect(liveOpSummary(drill({ depthAtTip: true }))).toContain('hl. 10 (špička)');
  });
});

describe('NC: špička na hloubce plného Ø + 0,3·Ø', () => {
  it('Sinumerik CYCLE82 – DP', () => {
    expect(buildLiveBlock(prms()).some(l => l.startsWith('CYCLE82(5, 0, 2, -12.4,'))).toBe(true);
  });
  it('Fanuc G83 – Z', () => {
    expect(buildLiveBlock(prms({ controlSystem: 'fanuc', mode: 'RADIUS' })).some(l => /^G83 X30 C\d+ Z-12\.4 /.test(l))).toBe(true);
  });
  it('Heidenhain (rozepsaně) – G1 Z', () => {
    expect(buildLiveBlock(prms({ controlSystem: 'heidenhain' })).some(l => l.startsWith('G1 Z-12.4 '))).toBe(true);
  });
  it('radiálně: X dna = plášť − (hloubka + 0,3·Ø)', () => {
    const L = buildLiveBlock(prms({ controlSystem: 'fanuc', liveOps: [drill({ side: 'radial', pattern: 'pcd', count: 1, zPos: -15, xTop: 100 })] }));
    expect(L.some(l => /^G87 Z-15 C\d+ X75\.2 /.test(l))).toBe(true);   // Ø(50 − 12,4)
  });
  it('díra skrz z výkresu jede špičkou na svou hloubku', () => {
    expect(buildLiveBlock(prms({ liveOps: [drill({ depthAtTip: true })] })).some(l => l.startsWith('CYCLE82(5, 0, 2, -10,'))).toBe(true);
  });
});

describe('simulace = NC', () => {
  it('na konci je díra vrtaná na hloubku špičky', () => {
    const tl = buildLiveTimeline([drill()], {});
    expect(liveStateAt(tl, tl.total).depth.get('0:0')).toBeCloseTo(12.4, 6);
  });
});

describe('📥 Z CAD: skrz = hloubka špičky, hloubka / do Z = plný Ø', () => {
  const hole = (depth, depthTag) => ({ type: 'circle', cx: 30, cy: 0, r: 4, depth, depthTag });
  it('čelo', () => {
    const { ops } = liveOpsFromCad([{ z: 0, side: 'right', objects: [hole(13.4, 'skrz'), { ...hole(10, 'hl. 10'), cx: -30, r: 3 }] }], geo, []);
    const by = d => ops.find(o => o.holeD === d);
    expect(by(8).depthAtTip).toBe(true);
    expect(by(6).depthAtTip).toBeUndefined();
    expect(drillDepth(by(6))).toBe(11.8);
  });
});

describe('úbytek kroku (DAM)', () => {
  // Ø8 hl. 20 → špička 22,4; krok 8, úbytek 2 → záběry 8, 6, 4, 2, 2… (nejméně úbytek).
  const op = o => drill({ depth: 20, peck: 8, peckDegr: 2, ...o });
  it('záběry se zkracují do úbytku, poslední = špička', () => {
    expect(drillLevels(op())).toEqual([8, 14, 18, 20, 22, 22.4]);
    expect(drillLevels(op({ peckDegr: 0 }))).toEqual([8, 16, 22.4]);
  });
  it('Sinumerik CYCLE83: DAM = úbytek', () => {
    expect(buildLiveBlock(prms({ liveOps: [op()] })).some(l => l.startsWith('CYCLE83(5, 0, 2, -22.4, , -8, , 2, '))).toBe(true);
  });
  it('Fanuc: G83 ho neumí → rozepsaně s poznámkou, stejné záběry jako simulace', () => {
    const L = buildLiveBlock(prms({ controlSystem: 'fanuc', mode: 'RADIUS', liveOps: [op()] }));
    expect(L.some(l => /^G83/.test(l))).toBe(false);
    expect(L.some(l => l.includes('Úbytek kroku 2 mm'))).toBe(true);
    expect(L.filter(l => /^G1 Z/.test(l)).map(l => +l.match(/Z(-?[\d.]+)/)[1])).toEqual([-8, -14, -18, -20, -22, -22.4]);
    const tl = buildLiveTimeline([op()], {});
    const cuts = tl.pts.filter((p, i) => p.cut && !(tl.pts[i + 1] && tl.pts[i + 1].cut)).map(p => p.d);
    expect(cuts).toEqual([8, 14, 18, 20, 22, 22.4]);
  });
});

describe('kontrola 6: hluboká díra', () => {
  it('nad 3×Ø naráz nebo jen lámání = upozornění, vyjíždění v pořádku', () => {
    expect(deepHoleIssue(drill({ depth: 30, peck: 0 })).text).toMatch(/hluboká díra \(4,05×Ø\) naráz/);
    expect(deepHoleIssue(drill({ depth: 30, peck: 8, chipMode: 'break' })).text).toMatch(/jen s lámáním/);
    expect(deepHoleIssue(drill({ depth: 30, peck: 8, chipMode: 'clear' }))).toBe(null);
    expect(deepHoleIssue(drill({ depth: 20, peck: 0 }))).toBe(null);   // špička 22,4 = 2,8×Ø
  });
});

describe('kontrola 5: vrták dosáhne', () => {
  const slot = { slot: 15, shape: 'drill', name: 'Vrtak HSS D8', toolLength: 80 };   // šroubovice 75 (DIN 338)
  it('za vyložením chyba, za šroubovicí upozornění', () => {
    expect(drillReachIssue(drill({ depth: 100 }), slot).sev).toBe('error');
    expect(drillReachIssue(drill({ depth: 73 }), slot).sev).toBe('warn');   // špička 75,4
    expect(drillReachIssue(drill({ depth: 72 }), slot)).toBe(null);         // špička 74,4
    expect(drillReachIssue(drill({ depth: 100 }), null)).toBe(null);        // vrták není v zásobníku
  });
  it('nález u všech děr operace s T a vyložením', () => {
    const S = { params: { mode: 'DIAMON', stockMode: 'cylinder', stockDiameter: 110 }, stockPoints: [],
      contourPoints: [{ x: 0, z: 0, type: 'G0' }, { x: 100, z: 0, type: 'G1' }, { x: 100, z: -200, type: 'G1' }] };
    const op = drill({ pattern: 'pcd', pcd: 60, count: 4, depth: 100, peck: 8, toolNo: 15 });
    const [r] = checkLiveOps(liveProfile(S), [op], [slot]);
    expect(r.issues).toEqual([{ sev: 'error', text: 'Díry 1–4: špička jede 102,4 mm do materiálu, T15 Vrtak HSS D8 má vyložení jen 80 mm – upínač narazí do dílu. Dlouhý vrták (DIN 340) nebo vrtat z obou stran.' }]);
    expect(checkLiveOps(liveProfile(S), [op], [])[0].issues).toEqual([]);
  });
});
