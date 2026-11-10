// Kontrola programu v CAM/CNC Editoru (js/calculators/gcodeEditorParser.js).
// Do 10. 11. 2026 měl každý editor vlastní třídu CNCParser; CNC Editor navíc
// kontroly pro kreslení. Při sloučení dávala nová třída nad 96 NC programy
// z fixtures a ručními případy totéž co obě staré (396 porovnání).
import { describe, it, expect } from 'vitest';
import { CNCParser, defaultParserConfig } from '../js/calculators/gcodeEditorParser.js';

const check = (code, cfg) => {
  const p = new CNCParser();
  p.reset();
  p.loadSubprograms({ 'A.MPF': code });
  return p.parseProgram(code, 'A.MPF', cfg).errors.map(e => e.msg);
};

describe('defaultParserConfig', () => {
  it('CAM Editor: bez kontrol pro kreslení; CNC Editor: vložené uprostřed, pořadí drží', () => {
    expect(Object.keys(defaultParserConfig())).toEqual(
      ['movement', 'coords', 'feed', 'spindle', 'startstop', 'end', 'duplicate', 'calls', 'params', 'syntax']);
    expect(Object.keys(defaultParserConfig({ drawChecks: true }))).toEqual(
      ['movement', 'coords', 'feed', 'spindle', 'startstop', 'end', 'duplicate',
        'modalMove', 'arcParams', 'axisTwice', 'arcFit', 'contJump', 'negX', 'tangency',
        'calls', 'params', 'syntax']);
  });

  it('každé volání vrací nové objekty (editor je mění z ⚙ nastavení)', () => {
    const a = defaultParserConfig(), b = defaultParserConfig();
    a.feed.active = false;
    expect(b.feed.active).toBe(true);
  });
});

describe('CNCParser – kontroly pro kreslení jen s drawChecks', () => {
  const code = 'G0 X10 Z0\nX20 Z-5\nG2 X30 Z-10\nG1 X1 X2 F0.2\nM30';

  it('CNC Editor hlásí zděděné G0, oblouk bez R a osu dvakrát', () => {
    const msgs = check(code, defaultParserConfig({ drawChecks: true })).join('\n');
    expect(msgs).toMatch(/Blok nemá G1 – platí G0/);
    expect(msgs).toMatch(/Oblouk G2 bez poloměru/);
    expect(msgs).toMatch(/Osa X je v bloku zapsaná dvakrát/);
  });

  it('CAM Editor (bez těch položek) je nehlásí', () => {
    const msgs = check(code, defaultParserConfig()).join('\n');
    expect(msgs).not.toMatch(/platí G0|bez poloměru|dvakrát/);
  });
});
