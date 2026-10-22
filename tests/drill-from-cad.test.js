// Vrtání děr z výkresu jako OPERACE VRTÁNÍ (uživatel 20. 10. 2026: „mám
// vrtání, ale pořád polygonální plátek … ukazuje dráhy, které by tam vůbec
// neměly být … tři druhy výběru"):
//  • ops/drill.js — s vybranými dírami z CAD je program bloku poháněných
//    nástrojů, ne díra v ose; „V ose" vrátí středovou díru,
//  • cam/sim/machTabTool.js — záložka obrábění vybere nástroj své operace,
//  • cam/genButtons.js — mimo soustružení jen „🔄 Dráhy",
//  • cam/live/liveMachining.js — kus se natáčí k nástroji (osa C).
import { describe, it, expect } from 'vitest';
import { emitDrill, drillHoleLoop } from '../js/calculators/cam/ops/drill.js';
import { newLiveOp, liveDrillFromCad } from '../js/calculators/cam/live/liveModel.js';
import { findLiveBlock } from '../js/calculators/cam/live/liveMarkers.js';
import { machTabPlan, machTabClick } from '../js/calculators/cam/sim/machTabTool.js';
import { genButtonsHidden } from '../js/calculators/cam/genButtons.js';
import { buildLiveTimeline, liveStateAt } from '../js/calculators/cam/live/liveMachining.js';
import { catalogDrillRec, addCatalogDrills } from '../js/calculators/cam/live/liveDrillTools.js';

const hole = o => ({ ...newLiveOp('drill', { faceZ: 0, outerD: 100 }, 1), pcd: 60, count: 4, depth: 10, ...o });
const base = {
  controlSystem: 'sinumerik', mode: 'DIAMON', safeX: 150, safeZ: 5, feed: 0.2, speed: 25,
  toolShape: 'drill', toolRadius: 4, toolTipAngle: 118, toolLength: 60, drillDepth: 20, drillPeck: 5,
};
const emit = prms => {
  const lines = [];
  const add = text => lines.push({ text });
  emitDrill({
    S: { params: prms, contourPoints: [{ x: 0, z: 0, type: 'G0' }, { x: 100, z: 0, type: 'G1' }], genNotes: [] },
    calc: {}, prms, lines, addCmt: t => add(`; ${t}`), addN: add, note: (c, t) => ` ${c}; ${t}`,
    arcR: r => `CR=${r}`, flipArc: c => c,
  });
  return lines.map(l => l.text);
};

describe('operace Vrtání: díry z výkresu × díra v ose', () => {
  it('s vybranými dírami z CAD je program blok poháněných nástrojů, ne díra v ose', () => {
    const prms = { ...base, liveOps: [hole()] };
    expect(liveDrillFromCad(prms)).toBe(true);
    const L = emit(prms);
    expect(findLiveBlock(L)).toBeTruthy();
    expect(L.some(l => /SPOS=/.test(l))).toBe(true);
    expect(L.some(l => /G0 X0/.test(l))).toBe(false);        // do osy se nejede
    expect(L.some(l => /M30/.test(l))).toBe(true);           // konec programu
    expect(drillHoleLoop(prms, { ok: true, D: 8, zFace: 0, zBottom: -20, dir: -1 })).toBe(null);
  });
  it('„V ose" i bez vybraných děr = vrtání středové díry', () => {
    for (const prms of [{ ...base, liveOps: [hole()], drillSource: 'axis' }, { ...base, liveOps: [hole({ enabled: false })] }]) {
      expect(liveDrillFromCad(prms)).toBe(false);
      const L = emit(prms);
      expect(findLiveBlock(L)).toBe(null);
      expect(L.some(l => /G0 X0/.test(l))).toBe(true);
    }
  });
});

describe('záložka obrábění → nástroj', () => {
  const S = (toolShape, code = '', extra = {}) => ({ params: { toolShape, partOffZ: null, ...extra }, manualGCode: code });
  it('nástroj odpovídá → jen záložka', () => {
    expect(machTabPlan('vrt', S('drill'))).toBe('keep');
    expect(machTabPlan('zavit', S('threading'))).toBe('keep');
    expect(machTabPlan('upich', S('parting'))).toBe('keep');
    expect(machTabPlan('upich', S('round'))).toBe('tool');   // upichovák místo kulatého (uživatel 20. 10.)
    expect(machTabPlan('hrub', S('polygon'))).toBe('keep');
  });
  it('soustružení s programem → nová operace; bez programu → jen nástroj', () => {
    expect(machTabPlan('vrt', S('polygon', 'N10 G0 X50'))).toBe('part');
    expect(machTabPlan('vrt', S('polygon', ''))).toBe('tool');
    expect(machTabPlan('zavit', S('round', 'N10 G1 X20'))).toBe('part');
  });
  it('z vrtání / závitu zpět na Hrub. → soustružnický nůž (nebo část se soustružením)', () => {
    expect(machTabPlan('hrub', S('drill', 'N10'))).toBe('tool');
    expect(machTabPlan('hot', S('threading', 'N10'))).toBe('tool');
  });
  it('program jiné operace se nepřepisuje: ze závitu / upichu na Vrtání = nová část', () => {
    expect(machTabPlan('vrt', S('threading', 'N10', { threadActive: true }))).toBe('part');
    expect(machTabPlan('vrt', S('parting', 'N10'))).toBe('part');
    expect(machTabPlan('zavit', S('drill', ''))).toBe('tool');    // prázdná část → jen nástroj
  });
});

describe('klik na Vrtání při aktivním vrtáku překreslí panel', () => {
  // Uživatel 22. 10. 2026: vrták aktivní, panel na Hrub. → klik na Vrtání
  // přepnul záložku jen ve stavu, „Co vrtat" se ukázalo až po kliku na nástroj.
  it('záložka se změní → applyChange', async () => {
    const op = hole({ enabled: true, toolNo: 8 });
    const S = {
      params: { ...base, drillActive: true, liveOps: [op] }, manualGCode: 'N10',
      machiningSubTab: 'hrub', activeMagazineSlot: 0,
      toolMagazine: [{ slot: 8, shape: 'drill', name: 'Vrtak HSS D8', diameter: op.holeD }],
    };
    const calls = [];
    const ctx = {
      S, tabBody: null, partsActive: () => false, pushHistory: () => {},
      setMachiningSubTab: t => { const ch = S.machiningSubTab !== t; S.machiningSubTab = t; return ch; },
      applyChange: o => calls.push(o || {}), _applyMagSlot: () => calls.push('mag'),
    };
    await machTabClick('vrt', ctx);
    expect(S.machiningSubTab).toBe('vrt');
    expect(calls.length).toBeGreaterThan(0);
  });
});

describe('tlačítka generování', () => {
  const b = { hasParts: true, allView: false, fromSections: true, face: false, sectionsOk: true };
  it('mimo soustružení jen „🔄 Dráhy" (Po úsecích schované)', () => {
    expect(genButtonsHidden({ ...b, op: 'hrub', tool: 'polygon' }).section).toBe(false);
    expect(genButtonsHidden({ ...b, op: 'vrt', tool: 'drill' })).toMatchObject({ section: true, refresh: false });
    expect(genButtonsHidden({ ...b, op: 'hrub', tool: 'threading' }).section).toBe(true);
    expect(genButtonsHidden({ ...b, op: 'hrub', tool: 'round' }).section).toBe(false);   // i Hrub. + ◎ Vnitřní (vyvrtávání) úseky má
  });
});

describe('simulace: kus se natáčí k nástroji', () => {
  it('díra pod nástrojem nahoře (90°) — natočení = 90° − úhel díry, přejezd polárně', () => {
    const op = { ...hole({ count: 2, startAngle: 0 }), peck: 0, dwell: 0 };   // díry na 0° a 180°
    const tl = buildLiveTimeline([op], {});
    expect(tl.toolAt).toBe(90);
    const bottom0 = tl.pts.find(p => p.hole === 0 && p.d >= 10);
    expect(liveStateAt(tl, bottom0.t).rot).toBeCloseTo(90, 6);          // díra 0° → otočit o +90°
    const gap = tl.pts.find(p => p.hole === 1 && p.gap);
    const mid = liveStateAt(tl, gap.t - 0.01);
    expect(Math.hypot(mid.tool.x, mid.tool.y)).toBeCloseTo(30, 1);       // po poloměru, ne přes střed
    const bottom1 = tl.pts.find(p => p.hole === 1 && p.d >= 10);
    expect(Math.abs(liveStateAt(tl, bottom1.t).rot)).toBeCloseTo(90, 6); // díra 180° → ±90°
  });
});

describe('vrták z 📚 na každý Ø', () => {
  it('Ø, který katalog nemá (7), dostane vrták podle nejbližšího', () => {
    const rec = catalogDrillRec(7);
    expect(rec.name).toBe('Vrtak HSS D7');
    expect(rec.tool.toolRadius).toBe(3.5);
    const mag = [{ slot: 1, shape: 'round', radius: 0.8 }];
    const added = addCatalogDrills(mag, [7, 7, 8], (r, T) => ({ slot: T, name: r.name, shape: 'drill', radius: r.tool.toolRadius }));
    expect(added.map(s => [s.slot, s.name])).toEqual([[2, 'Vrtak HSS D7'], [3, 'Vrtak HSS D8']]);
  });
});
