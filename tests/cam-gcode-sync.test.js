// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – synchronizace NÁHLEDU a PROGRAMU (cam/gcodeSync.js)    ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Panel má JEDINÉ pravidlo pro to, co se po změně nastavení stane s
// programem (`S.manualGCode`):
//   program se přegeneruje SÁM jen tehdy, když (a) by změna jinak nebyla
//   vidět (běží/mění se cyklový režim závit/upich — ty nemají vlastní náhled
//   drah) A ZÁROVEŇ (b) v programu nejsou ruční úpravy.
// Dřív si to řešil každý ovládací prvek po svém: „Booleovské hrubování" a
// „Hrubovat po regionech" program bez ptaní přepisovaly, zatímco stejně
// strategické „Čelně/Podélně" ne — a ruční úpravy z editoru se tím ztrácely
// nenávratně (regenerace nezapisuje do historie, saveState je hned uloží).
import { describe, it, expect } from 'vitest';
import {
  pathInputsKey, markGCodeGenerated, markGCodeEdited, gcodeStale,
  cycleModeActive, decideChange,
} from '../js/calculators/cam/gcodeSync.js';

const mkState = (params = {}) => ({
  params: {
    depthOfCut: 2, feed: 0.25, booleanRoughing: false, regionRoughing: false,
    threadActive: false, partOffZ: null, toolTipMirror: false, ...params,
  },
  contourPoints: [{ x: 10, z: 0 }, { x: 10, z: -20 }],
  stockPoints: [{ x: 12, z: 2 }, { x: 12, z: -22 }],
  zLimits: { rangeStart: null, rangeEnd: null, rangeActive: false },
  xLimits: { rangeXMin: null, rangeXMax: null, active: false },
  guideLines: [], flipX: false, flipZ: false, activeMagazineSlot: null,
  gcodeDirty: false, gcodeKey: null,
});

describe('gcodeSync – otisk vstupů (neaktuální dráhy)', () => {
  it('otisk je KRÁTKÝ hash, ne celá serializace', () => {
    // Vozí se v localStorage, v .camprog i v každém snímku historie — plná
    // serializace parametrů a kontury by tam neměla co dělat.
    const key = pathInputsKey(mkState());
    expect(key).toMatch(/^[0-9a-f]{1,8}$/);
  });

  it('otisk nezávisí na pořadí klíčů v params', () => {
    // `S.params` vzniká jednou přes Object.assign nad výchozími hodnotami,
    // jindy klonem záznamu části — pořadí vlastností se liší, hodnoty ne.
    const S = mkState();
    const reordered = { ...S, params: Object.fromEntries(Object.entries(S.params).reverse()) };
    expect(pathInputsKey(reordered)).toBe(pathInputsKey(S));
  });

  it('bez otisku (program neznámého původu) se neaktuálnost nehlásí', () => {
    expect(gcodeStale(mkState())).toBe(false);
    // ...ani když otisk ve stavu vůbec není (starší uložený stav).
    const S = mkState(); delete S.gcodeKey;
    expect(gcodeStale(S)).toBe(false);
  });

  it('čerstvě vygenerovaný program není neaktuální', () => {
    const S = mkState();
    markGCodeGenerated(S);
    expect(gcodeStale(S)).toBe(false);
  });

  it.each([
    ['hrubovací parametr', (S) => { S.params.depthOfCut = 3; }],
    ['přepínač strategie', (S) => { S.params.booleanRoughing = true; }],
    ['kontura', (S) => { S.contourPoints = [{ x: 11, z: 0 }]; }],
    ['polotovar', (S) => { S.stockPoints = [{ x: 20, z: 2 }]; }],
    ['rozsah Z', (S) => { S.zLimits = { rangeStart: -5, rangeEnd: -15, rangeActive: true }; }],
    ['rozsah X', (S) => { S.xLimits = { rangeXMin: 2, rangeXMax: null, active: true }; }],
    ['konstrukční čáry', (S) => { S.guideLines = [{ z: -5 }]; }],
    ['flip osy', (S) => { S.flipX = true; }],
    ['nůž ze zásobníku', (S) => { S.activeMagazineSlot = 2; }],
  ])('%s → dráhy v programu jsou neaktuální', (_name, mutate) => {
    const S = mkState();
    markGCodeGenerated(S);
    mutate(S);
    expect(gcodeStale(S)).toBe(true);
  });

  it('toolTipMirror je jen kosmetika náhledu → neaktuálnost NEhlásí', () => {
    const S = mkState();
    markGCodeGenerated(S);
    S.params.toolTipMirror = true;
    expect(gcodeStale(S)).toBe(false);
    // ...ale otisk sám o sobě se jím nesmí lišit ani při přímém porovnání
    expect(pathInputsKey(S)).toBe(S.gcodeKey);
  });

  it('ruční úprava neaktuálnost NEschová (otisk zůstává)', () => {
    const S = mkState();
    markGCodeGenerated(S);
    S.params.feed = 0.4;
    markGCodeEdited(S);
    expect(gcodeStale(S)).toBe(true);
    expect(S.gcodeDirty).toBe(true);
  });

  it('regenerace vynuluje oba stavy', () => {
    const S = mkState();
    markGCodeGenerated(S);
    markGCodeEdited(S);
    S.params.depthOfCut = 9;
    markGCodeGenerated(S);
    expect(S.gcodeDirty).toBe(false);
    expect(gcodeStale(S)).toBe(false);
  });
});

describe('gcodeSync – cyklové režimy', () => {
  it('bez závitu a upichnutí neběží žádný cyklus', () => {
    expect(cycleModeActive(mkState().params)).toBe(false);
  });
  it('aktivní závit = cyklový režim', () => {
    expect(cycleModeActive(mkState({ threadActive: true }).params)).toBe(true);
  });
  it('naklikané upichnutí = cyklový režim (i v Z=0)', () => {
    expect(cycleModeActive(mkState({ partOffZ: 0 }).params)).toBe(true);
  });
  it('nečíselné partOffZ se nepočítá', () => {
    expect(cycleModeActive(mkState({ partOffZ: NaN }).params)).toBe(false);
  });
});

describe('gcodeSync – pravidlo obnovy po změně nastavení', () => {
  it('běžná změna parametru = jen náhled, program se nesahá', () => {
    expect(decideChange(mkState())).toBe('preview');
  });

  it('strategický přepínač (booleovské/regiony) program NEPŘEPISUJE', () => {
    // Regrese: dřív oba volaly _regenGCode() bez ptaní — ruční úpravy pryč.
    const S = mkState({ booleanRoughing: true, regionRoughing: true });
    expect(decideChange(S)).toBe('preview');
  });

  it('běžící cyklový režim + čistý program = přegenerovat (jinak není vidět)', () => {
    expect(decideChange(mkState({ partOffZ: -10 }))).toBe('regen');
    expect(decideChange(mkState({ threadActive: true }))).toBe('regen');
  });

  it('běžící cyklový režim + RUČNĚ upravený program = jen náhled', () => {
    const S = mkState({ partOffZ: -10 });
    markGCodeEdited(S);
    expect(decideChange(S)).toBe('preview');
  });

  it('změna samotného režimu (cycle) přegeneruje, i když už neběží', () => {
    // Zrušení upichnutí: partOffZ je pryč, ale program pořád obsahuje cyklus.
    expect(decideChange(mkState(), { cycle: true })).toBe('regen');
  });

  it('změna režimu ale ruční program nepřepíše', () => {
    const S = mkState();
    markGCodeEdited(S);
    expect(decideChange(S, { cycle: true })).toBe('preview');
  });

  it('ruční program chrání i po opětovném zapnutí cyklu', () => {
    const S = mkState({ threadActive: true });
    markGCodeGenerated(S);
    markGCodeEdited(S);
    expect(decideChange(S, { cycle: true })).toBe('preview');
    // Vědomé „🔄 Dráhy" ochranu sundá (markGCodeGenerated) a od té chvíle
    // se cyklus zase obnovuje sám.
    markGCodeGenerated(S);
    expect(decideChange(S)).toBe('regen');
  });
});
