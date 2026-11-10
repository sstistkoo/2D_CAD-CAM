// Kontrola NC programu před exportem (js/calculators/ncCheck.js).
// Program se staví ze SKUTEČNÉ hlavičky a konce řízení (controlDialect.js),
// takže když generátor hlavičku změní, test ukáže, jestli kontrola nezačala
// hlásit falešné poplachy. Nad 96 programy z tests/fixtures/cam (3 řízení)
// dávala kontrola při zavedení 0 nálezů (10. 11. 2026).
import { describe, it, expect } from 'vitest';
import { checkNcProgram, formatNcFindings, confirmNcExport } from '../js/calculators/ncCheck.js';
import { buildControlHeaderLines, buildControlTailLines, controlArcFormatter } from '../js/calculators/cam/controlDialect.js';

const PRMS = { speed: 200, safeX: 150, safeZ: 5, machineType: 'M3 LIMS=2500', mode: 'DIAMON', toolName: 'HRUB' };
const CTRLS = ['sinumerik', 'fanuc', 'heidenhain'];

function program(ctrl, body) {
  const arc = controlArcFormatter(ctrl);
  const moves = body || [
    'G0 X150 Z5',
    'G0 X40 Z2',
    'G1 Z-30 F0.25',
    `G2 X50 Z-35 ${arc(5)}`,
    'G1 X60',
    'G0 X150 Z5',
  ];
  return [...buildControlHeaderLines(ctrl, PRMS, false, false), ...moves, ...buildControlTailLines(ctrl)].join('\n');
}
const kinds = (code, ctrl) => checkNcProgram(code, ctrl).map(f => f.msg);

describe('ncCheck – čistý program', () => {
  it.each(CTRLS)('%s: vygenerovaná hlavička + konec = bez nálezu', (ctrl) => {
    expect(checkNcProgram(program(ctrl), ctrl)).toEqual([]);
  });

  it('komentáře se nečtou jako kód (G41 v textu, závorky Fanuc)', () => {
    const code = program('fanuc').replace('G1 X60', 'G1 X60 ( G41 G2 bez R )');
    expect(checkNcProgram(code, 'fanuc')).toEqual([]);
  });

  it('název nástroje v uvozovkách se nečte jako G-kód', () => {
    const code = program('sinumerik').replace('T="HRUB"', 'T="G2_X99999"');
    expect(checkNcProgram(code, 'sinumerik')).toEqual([]);
  });

  it('závit G33 bez F není chyba posuvu', () => {
    const code = program('sinumerik', ['G0 X40 Z5', 'G33 Z-20 K2', 'G0 X150']);
    expect(kinds(code, 'sinumerik').join()).not.toMatch(/posuv/);
  });
});

describe('ncCheck – hlášené chyby', () => {
  it('Sinumerik: G96 bez LIMS', () => {
    const code = program('sinumerik').split('\n').map(l => l.replace(/LIMS=\d+/g, '')).join('\n');
    expect(kinds(code, 'sinumerik').join()).toMatch(/G96.*omezení otáček.*LIMS/);
  });

  it('Fanuc: G96 bez G50 S', () => {
    const code = program('fanuc').split('\n').filter(l => !/^G50 S/.test(l)).join('\n');
    expect(kinds(code, 'fanuc').join()).toMatch(/G50 S/);
  });

  it('Heidenhain: limit otáček se nehlásí (program ho psát neumí, hlavička na to upozorňuje)', () => {
    expect(kinds(program('heidenhain'), 'heidenhain').join()).not.toMatch(/omezení otáček/);
  });

  it.each(CTRLS)('%s: řez bez M3', (ctrl) => {
    const code = program(ctrl).split('\n').map(l => l.replace(/\bM3\b/g, '')).join('\n');
    expect(kinds(code, ctrl).join()).toMatch(/bez zapnutého vřetena/);
  });

  it('řez po M5 (vřeteno vypnuté uprostřed)', () => {
    const code = program('sinumerik', ['G0 X40 Z2', 'M5', 'G1 Z-30 F0.2']);
    expect(kinds(code, 'sinumerik').join()).toMatch(/bez zapnutého vřetena/);
  });

  it('řez bez posuvu F', () => {
    const code = program('fanuc', ['G0 X40 Z2', 'G1 Z-30']);
    expect(kinds(code, 'fanuc').join()).toMatch(/bez posuvu/);
  });

  it('pohyb před voláním nástroje', () => {
    const code = program('heidenhain').split('\n').filter(l => !/^T\d/.test(l)).join('\n');
    expect(kinds(code, 'heidenhain').join()).toMatch(/před voláním nástroje/);
  });

  it.each(CTRLS)('%s: oblouk bez poloměru i středu', (ctrl) => {
    const code = program(ctrl, ['G0 X40 Z2', 'G1 Z-30 F0.2', 'G2 X50 Z-35']);
    expect(kinds(code, ctrl).join()).toMatch(/Oblouk G2 bez poloměru/);
  });

  it('oblouk se středem I/K je v pořádku, nulový poloměr ne', () => {
    expect(kinds(program('fanuc', ['G0 X40 Z2', 'G1 Z-30 F0.2', 'G2 X50 Z-35 I5 K0']), 'fanuc')).toEqual([]);
    expect(kinds(program('sinumerik', ['G0 X40 Z2', 'G1 Z-30 F0.2', 'G3 X50 Z-35 CR=0.000']), 'sinumerik').join()).toMatch(/nulovým poloměrem/);
  });

  it('nesmyslná souřadnice', () => {
    const code = program('sinumerik', ['G0 X486708909.740 Z5']);
    expect(checkNcProgram(code, 'sinumerik').some(f => f.level === 'error' && /Nesmyslná/.test(f.msg))).toBe(true);
  });

  it('chybí M30 / kód za M30 / G41 bez G40', () => {
    const noEnd = program('sinumerik').split('\n').filter(l => !/M30/.test(l)).join('\n');
    expect(kinds(noEnd, 'sinumerik').join()).toMatch(/Chybí konec programu/);
    expect(kinds(`${program('sinumerik')}\nG1 X10 F0.2`, 'sinumerik').join()).toMatch(/za koncem programu/);
    expect(kinds(program('sinumerik', ['G0 X40 Z2', 'G42 G1 Z-30 F0.2']), 'sinumerik').join()).toMatch(/G41\/G42/);
  });

  it('stejná chyba se hlásí jednou, s číslem řádku', () => {
    const code = program('fanuc', ['G0 X40 Z2', 'G1 Z-30', 'G1 X50', 'G1 Z-40']);
    const f = checkNcProgram(code, 'fanuc').filter(x => /bez posuvu/.test(x.msg));
    expect(f).toHaveLength(1);
    expect(code.split('\n')[f[0].line - 1]).toBe('G1 Z-30');
  });
});

describe('ncCheck – potvrzení exportu', () => {
  it('čistý program se na nic neptá', () => {
    let asked = false;
    expect(confirmNcExport(program('fanuc'), 'fanuc', () => { asked = true; return false; })).toBe(true);
    expect(asked).toBe(false);
  });

  it('s nálezem rozhoduje uživatel; text obsahuje řádek a důvod', () => {
    const code = program('fanuc', ['G0 X40 Z2', 'G1 Z-30']);
    let text = '';
    expect(confirmNcExport(code, 'fanuc', (t) => { text = t; return false; })).toBe(false);
    expect(confirmNcExport(code, 'fanuc', () => true)).toBe(true);
    expect(text).toMatch(/chyby: 1/);
    expect(text).toMatch(/ř\. \d+ \(G1 Z-30\): Řezný pohyb bez posuvu/);
    expect(text).toMatch(/Přesto pokračovat\?/);
  });

  it('dlouhý seznam se zkrátí', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ level: 'warn', line: i + 1, block: '', msg: `x${i}` }));
    expect(formatNcFindings(many, 8)).toMatch(/… a 4 dalších/);
  });
});
