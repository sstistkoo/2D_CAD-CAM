// Regrese 10. 11. 2026: limit otáček v hlavičce, volání nástroje číslem slotu
// (Fanuc/Heidenhain), převod závitu/LIMS/nástroje mezi řídicími systémy,
// vřeteno při spojení operací a znaménko poloměru oblouku nad 180°.
import { describe, it, expect } from 'vitest';
import { buildControlHeaderLines, buildControlTailLines, convertGCodeControlSystem }
  from '../js/calculators/cam/controlDialect.js';
import { mergePrograms } from '../js/calculators/cam/gcodeMerge.js';
import { activeToolNumber, toolCallWord } from '../js/calculators/cam/toolCall.js';
import { arcSignedR } from '../js/calculators/cam/arcSign.js';

const prms = { speed: 180, machineType: 'LIMS=500', mode: 'DIAMON', toolName: 'T1', safeX: 500, safeZ: 500 };
const mag = [{ slot: 3, name: 'HRUBOVAK' }, { slot: 5, name: 'DOKONCOVAK' }];

const program = (ctrl, tool) => {
  const p = { ...prms, toolName: tool.name };
  const cm = ctrl === 'fanuc' ? '( --- HRUBOVANI --- )' : '; --- HRUBOVANI ---';
  return [...buildControlHeaderLines(ctrl, p, false, false, tool), 'G0 X500 Z500', cm,
    'G1 X40 Z-20 F0.3', 'G0 X500', 'G0 Z500', ...buildControlTailLines(ctrl)].join('\n');
};
const code = (l) => l.replace(/^\s*N\d+\s*/, '').replace(/[;(].*$/, '').trim();

describe('hlavička: limit otáček z pole Max. otáčky', () => {
  it('Fanuc G50 a Sinumerik LIMS berou uživatelský limit', () => {
    expect(buildControlHeaderLines('fanuc', prms).some(l => l.startsWith('G50 S500'))).toBe(true);
    expect(buildControlHeaderLines('sinumerik', prms).some(l => /LIMS=2000/.test(l))).toBe(false);
  });
});

describe('volání nástroje', () => {
  it('Fanuc/Heidenhain číslem slotu, Sinumerik jménem', () => {
    const t = { name: 'DOKONCOVAK', num: 5 };
    expect(buildControlHeaderLines('fanuc', prms, false, false, t).map(code)).toContain('T0505');
    expect(buildControlHeaderLines('heidenhain', prms, false, false, t).map(code)).toContain('T5 M6');
    expect(buildControlHeaderLines('sinumerik', prms, false, false, t).map(code)).toContain('T="DOKONCOVAK" D1 M6');
  });
  it('číslo z aktivního slotu, jinak podle jména, jinak 1', () => {
    expect(activeToolNumber({ toolMagazine: mag, activeMagazineSlot: 1, params: {} })).toBe(5);
    expect(activeToolNumber({ toolMagazine: mag, activeMagazineSlot: null, params: { toolName: 'HRUBOVAK' } })).toBe(3);
    expect(activeToolNumber({ toolMagazine: [], params: { toolName: 'X' } })).toBe(1);
    expect(toolCallWord('fanuc', { num: 12 })).toBe('T1212');
  });
});

describe('převod Sinumerik → Fanuc', () => {
  const sin = ['N5 T="HRUBOVAK" D1 M6', '; --- HRUBOVANI ---', 'N10 G96 S250 LIMS=500',
    'N15 T="DOKONCOVAK" D1 M6', 'N20 G33 Z-20 K1.5', 'N30 M30'].join('\n');
  const out = convertGCodeControlSystem(sin, 'sinumerik', 'fanuc', prms, false, false, mag);
  it('závit G33 K → G32 F a zpět', () => {
    expect(out).toMatch(/G32 Z-20 F1\.5/);
    expect(convertGCodeControlSystem(out, 'fanuc', 'sinumerik', prms, false, false, mag)).toMatch(/G33 Z-20 K1\.5/);
  });
  it('LIMS= v těle zmizí', () => { expect(out).not.toMatch(/LIMS/); });
  it('nástroj v hlavičce i výměna uvnitř podle zásobníku', () => {
    const tools = out.split('\n').map(code).filter(c => /^T\d/.test(c));
    expect(tools).toEqual(['T0303', 'T0505']);
    const back = convertGCodeControlSystem(out, 'fanuc', 'sinumerik', prms, false, false, mag);
    expect(back).toMatch(/T="HRUBOVAK" D1 M6/);
    expect(back).toMatch(/T="DOKONCOVAK" D1 M6/);
  });
});

describe('spojení operací', () => {
  for (const ctrl of ['sinumerik', 'fanuc', 'heidenhain']) {
    it(`${ctrl}: stejný nůž — vřeteno mezi částmi nestojí`, () => {
      const t = { name: 'HRUBOVAK', num: 3 };
      const L = mergePrograms([{ name: 'A', code: program(ctrl, t) }, { name: 'B', code: program(ctrl, t) }], ctrl).split('\n');
      const start = L.findIndex(l => /===== B/.test(l));
      const cut = L.findIndex((l, i) => i > start && /G1 X40/.test(l));
      const lastStop = L.slice(0, cut).map(code).lastIndexOf('M5');
      const lastRun = L.slice(0, cut).map(code).findLastIndex(c => /\bM0?3\b/.test(c));
      expect(lastStop < lastRun).toBe(true);
      expect(L.filter(l => /M30/.test(l))).toHaveLength(1);
    });
    it(`${ctrl}: jiný nůž — výměna, pak M3 a M8 před řezem`, () => {
      const L = mergePrograms([{ name: 'A', code: program(ctrl, { name: 'HRUBOVAK', num: 3 }) },
        { name: 'B', code: program(ctrl, { name: 'DOKONCOVAK', num: 5 }) }], ctrl).split('\n');
      const start = L.findIndex(l => /===== B/.test(l));
      const cut = L.findIndex((l, i) => i > start && /G1 X40/.test(l));
      const between = L.slice(start, cut).map(code);
      const want = { sinumerik: 'T="DOKONCOVAK" D1 M6', fanuc: 'T0505', heidenhain: 'T5 M6' }[ctrl];
      expect(between).toContain(want);
      expect(between.some(c => /\bM0?3\b/.test(c))).toBe(true);
      expect(between).toContain('M8');
      expect(L.some(l => /STOPRE/.test(l))).toBe(ctrl === 'sinumerik');
    });
  }
  it('Heidenhain se pozná i bez předaného systému (žádný STOPRE)', () => {
    const L = mergePrograms([{ name: 'A', code: program('heidenhain', { num: 3 }) },
      { name: 'B', code: program('heidenhain', { num: 5 }) }]);
    expect(L).not.toMatch(/STOPRE/);
  });
});

describe('oblouk nad 180° = záporný poloměr', () => {
  // Kruh se středem (0, -10), R10: z (0,0) přes vrchol X10 na (5, -18.66) = 210°.
  const seg = { r: 10, cx: 0, cz: -10, dir: 'G2', x2: 5, z2: -18.660254 };
  it('210° → −R, 150° → +R', () => {
    expect(arcSignedR(seg, 0, 0)).toBe(-10);
    expect(arcSignedR({ ...seg, dir: 'G3' }, 0, 0)).toBe(10);
  });
});
