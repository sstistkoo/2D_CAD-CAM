// ╔══════════════════════════════════════════════════════════════╗
// ║  Obrábění: ◯ Vnější / ◎ Vnitřní a záložka Frézování             ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 22. 10. 2026: místo záložky „Vyvrt." přepínač Vnější / Vnitřní
// pod Zleva / Zprava (Hrub. vnitřní = vyvrtávání, Závit vnitřní = vnitřní
// závit) a Frézování jako samostatná záložka za Vrtáním — „máme to dané do
// kupy s operací na vrtání, tak to rozděl". Hlídá se: přepínač čte parametr
// operace (nemá vlastní stav), část Vrtání má v NC bloku jen vrtání, část
// Frézování jen frézy, klik na záložku zakládá / přepíná správnou část.
import { describe, it, expect } from 'vitest';
import { emitDrill } from '../js/calculators/cam/ops/drill.js';
import { newLiveOp, liveDrillFromCad, liveRunOps, liveOpOn, liveKindOf } from '../js/calculators/cam/live/liveModel.js';
import { buildLiveBlock } from '../js/calculators/cam/live/liveGcode.js';
import { toggleLiveGroup } from '../js/calculators/cam/live/liveDrillTools.js';
import { machTabPlan, opPartIndex } from '../js/calculators/cam/sim/machTabTool.js';
import { genButtonsHidden } from '../js/calculators/cam/genButtons.js';
import { surfaceInner, programInner, SURFACE_TABS } from '../js/calculators/cam/sim/machSurface.js';

const geo = { faceZ: 0, outerD: 100 };
const hole = o => ({ ...newLiveOp('drill', geo, 1), name: 'Díry', pcd: 60, count: 4, depth: 10, toolName: 'VRTAK_D8', ...o });
const pocket = o => ({ ...newLiveOp('mill', geo, 2), name: 'Kapsa', toolName: 'FREZA_D10', ...o });
const base = {
  controlSystem: 'sinumerik', mode: 'DIAMON', safeX: 150, safeZ: 5, feed: 0.2, speed: 25,
  toolShape: 'drill', toolRadius: 4, toolTipAngle: 118, toolLength: 60, drillDepth: 20, drillPeck: 5,
  drillActive: true,
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
const tools = L => L.filter(l => /^T="/.test(l)).map(l => l.match(/T="([^"]+)"/)[1]);

describe('program části: Vrtání jen vrtá, Frézování jen frézuje', () => {
  const ops = [hole(), pocket()];
  it('bez druhu (starší projekt) blok obsahuje obojí', () => {
    expect(tools(buildLiveBlock({ ...base, liveOps: ops }))).toEqual(['VRTAK_D8', 'FREZA_D10']);
  });
  it('část Vrtání: jen vrták', () => {
    expect(tools(buildLiveBlock({ ...base, liveOps: ops, liveKind: 'drill' }))).toEqual(['VRTAK_D8']);
  });
  it('část Frézování: jen fréza, komentář FREZOVANI', () => {
    const prms = { ...base, liveOps: ops, liveKind: 'mill' };
    expect(tools(buildLiveBlock(prms))).toEqual(['FREZA_D10']);
    expect(emit(prms).some(l => /FREZOVANI Z VYKRESU/.test(l))).toBe(true);
  });
  it('část Frézování bez vybraného frézování nevrtá v ose', () => {
    const prms = { ...base, liveOps: [hole(), pocket({ enabled: false })], liveKind: 'mill' };
    expect(liveDrillFromCad(prms)).toBe(true);
    const L = emit(prms);
    expect(L.some(l => /G0 X0/.test(l))).toBe(false);
    expect(tools(L)).toEqual([]);
  });
  it('pohled (liveRunOps) drží indexy, druhý druh je nevybraný; výběr se nemění', () => {
    const prms = { ...base, liveOps: ops, liveKind: 'mill' };
    const run = liveRunOps(prms);
    expect(run.map(liveOpOn)).toEqual([false, true]);
    expect(prms.liveOps.map(liveOpOn)).toEqual([true, true]);
    // Mimo část s vrtákem (soustružení, 📝 blok) se nefiltruje.
    expect(liveRunOps({ ...prms, drillActive: false }).map(liveOpOn)).toEqual([true, true]);
  });
  it('navrtání a závit patří k vrtání', () => {
    expect(liveKindOf({ kind: 'drill', role: 'spot' })).toBe('drill');
    expect(liveKindOf({ kind: 'mill' })).toBe('mill');
  });
});

describe('výběr klepnutím jen v rámci druhu', () => {
  it('„jen tahle skupina" neruší frézování', () => {
    const ops = [hole({ name: 'A' }), hole({ name: 'B' }), pocket()];
    expect(toggleLiveGroup(ops, 1).map(liveOpOn)).toEqual([false, true, true]);
  });
});

describe('záložka Frézování → část programu', () => {
  const S = (toolShape, code = '', extra = {}) => ({ params: { toolShape, partOffZ: null, ...extra }, manualGCode: code });
  it('část Frézování = keep, z části Vrtání nová část (a naopak)', () => {
    expect(machTabPlan('frez', S('drill', 'N10', { liveKind: 'mill' }))).toBe('keep');
    expect(machTabPlan('frez', S('drill', 'N10', { liveKind: 'drill' }))).toBe('part');
    expect(machTabPlan('frez', S('drill', 'N10'))).toBe('part');            // starší část Vrtání
    expect(machTabPlan('vrt', S('drill', 'N10', { liveKind: 'mill' }))).toBe('part');
    expect(machTabPlan('vrt', S('drill', 'N10', { liveKind: 'drill' }))).toBe('keep');
    expect(machTabPlan('frez', S('polygon', 'N10'))).toBe('part');
    expect(machTabPlan('frez', S('polygon', ''))).toBe('tool');
  });
  it('existující část operace se najde podle druhu', () => {
    const st = {
      activePart: 0,
      opParts: [
        { params: { toolShape: 'polygon' } },
        { params: { toolShape: 'drill', liveKind: 'drill' } },
        { params: { toolShape: 'drill', liveKind: 'mill' } },
      ],
    };
    expect(opPartIndex(st, 'vrt')).toBe(1);
    expect(opPartIndex(st, 'frez')).toBe(2);
  });
  it('Frézování nemá „✂ Po úsecích"', () => {
    const b = { hasParts: true, allView: false, fromSections: true, face: false, sectionsOk: true };
    expect(genButtonsHidden({ ...b, op: 'frez', tool: 'drill' }).section).toBe(true);
  });
});

describe('◯ Vnější / ◎ Vnitřní', () => {
  it('u Hrub., Hot., Upich a Závitu (ne u Vrtání a Frézování)', () => {
    expect([...SURFACE_TABS].sort()).toEqual(['hot', 'hrub', 'upich', 'zavit']);
  });
  it('čte parametr operace: Hrub./Hot. = vyvrtávání, Závit = vnitřní závit', () => {
    expect(surfaceInner({ boreActive: true }, 'hrub')).toBe(true);
    expect(surfaceInner({ boreActive: false }, 'hrub')).toBe(false);
    expect(surfaceInner({ threadExternal: false }, 'zavit')).toBe(true);
    expect(surfaceInner({}, 'zavit')).toBe(false);                     // výchozí vnější
    expect(surfaceInner({ boreActive: true }, 'hot')).toBe(true);     // jen dokončení v díře
    expect(surfaceInner({ boreActive: false }, 'hot')).toBe(false);
    expect(surfaceInner({ boreActive: true }, 'upich')).toBe(false);
    expect(surfaceInner({ partOffInner: true }, 'upich')).toBe(true);     // zápich v díře
  });
  it('čip souhrnu: program uvnitř díry', () => {
    expect(programInner({ boreActive: true })).toBe(true);
    expect(programInner({ threadActive: true, threadExternal: false })).toBe(true);
    expect(programInner({ threadActive: false, threadExternal: false })).toBe(false);
    expect(programInner({ partOffZ: -10, partOffInner: true })).toBe(true);
    expect(programInner({ partOffZ: null, partOffInner: true })).toBe(false);
  });
});
