// ╔══════════════════════════════════════════════════════════════╗
// ║  Tlačítka tvaru destičky nasadí NŮŽ TVARU i s držákem           ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 7. 10. 2026: „přednastav kulatý SRSCR2525M20, polygon PSBNR2525M12,
// upichovák MGEHR2525-5, závit SER2525M16 a na vrtání Vrtak D20", „ty nože dej
// do Zásobníku" a „ať si to pamatuje, co tam nastavím — nemám tam pořád ten
// obdélník místo držáku". Nález téhož dne: po přepnutí vrták → kulatá zůstalo
// vyložení vrtáku 145 mm (náhradní držák kulaté sedí `toolLength` nad
// destičkou → nehlídal se), úhel 118° a pouzdro 40 × 80 bez obrysu.
//
// `applyShapeChange` / `_setMagSlotShape` jsou uvnitř closure openCamSimulator
// (DOM), proto se vyříznou ze zdroje a pustí nad stubem stavu — totéž
// rozhraní, jaké jim dává panel (S, getInsert, …).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  presetKnifeForShape, presetSlotIndex, defaultMagazineKnives, SHAPE_PRESET_KNIFE_ID, sameKnifeGeometry,
} from '../js/calculators/magazineDefaults.js';
import { _defaultCamParams, SHAPE_CUT_DEFAULTS } from '../js/calculators/cam/camDefaults.js';
import { getInsert } from '../js/calculators/cam/inserts/index.js';
import { holderInflate, holderInflateAll } from '../js/calculators/cam/collisionValidator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXPECTED = {
  round: 'SRSCR2525M20', polygon: 'PSBNR2525M12', parting: 'MGEHR2525-5',
  threading: 'SER2525M16', drill: 'Vrtak HSS D20',
};
const FNS = ['applyShapeChange', '_loadMagSlot', '_rememberShapeKnife', '_loadShapeKnife', '_loadPresetKnife',
  '_slotToParams', '_paramsIntoSlot', '_isoMagSlot', '_buildMagSlotFromTool', '_defaultMagSlot', '_setMagSlotShape'];

function loadShapeFns() {
  const src = readFileSync(join(__dirname, '..', 'js', 'calculators', 'camSimulator.js'), 'utf8').replace(/\r\n/g, '\n');
  const cut = (name) => {
    const a = src.indexOf(`  function ${name}(`);
    if (a < 0) throw new Error(`camSimulator.js: funkce ${name} nenalezena`);
    return src.slice(a, src.indexOf('\n  }\n', a) + 4);
  };
  const S = { params: { ..._defaultCamParams() }, toolMagazine: [], shapeKnives: {}, _shapeGeomMem: {}, activeMagazineSlot: null };
  const deps = {
    S, getInsert, presetKnifeForShape, presetSlotIndex, defaultMagazineKnives, sameKnifeGeometry,
    SHAPE_CUT_DEFAULTS, holderInflate, holderInflateAll,
    dropInsertGuides: () => {}, applyChange: () => {}, showToast: () => {},
    afterToolChange: () => undefined, applyAfterToolChange: () => {}, fullUpdate: () => {},
  };
  const body = FNS.map(cut).join('\n') + '\nreturn { applyShapeChange, _setMagSlotShape, _isoMagSlot, _loadMagSlot };';
  const make = new Function(...Object.keys(deps), body);
  return { S, ...make(...Object.values(deps)) };
}

describe('výchozí nůž pro tvar destičky (magazineDefaults.js)', () => {
  it('každý tvar má svůj nůž z výchozí sady', () => {
    for (const [shape, name] of Object.entries(EXPECTED)) {
      const rec = presetKnifeForShape(shape);
      expect(rec && rec.name, shape).toBe(name);
      expect(rec.tool.toolShape, shape).toBe(shape);
      if (shape !== 'drill') expect(rec.tool.holderProfile, `${shape}: obrys držáku`).toBeTruthy();
    }
    expect(Object.keys(SHAPE_PRESET_KNIFE_ID).sort()).toEqual(Object.keys(EXPECTED).sort());
    expect(presetKnifeForShape('nic')).toBeNull();
  });

  it('slot zásobníku se pozná podle jména i tvaru', () => {
    const mag = [{ name: 'SRSCR2525M20', shape: 'polygon' }, { name: 'X' }, { name: 'SRSCR2525M20', shape: 'round' }];
    expect(presetSlotIndex(mag, 'round')).toBe(2);
    expect(presetSlotIndex(mag, 'parting')).toBe(-1);
    expect(presetSlotIndex(null, 'round')).toBe(-1);
  });
});

describe('tlačítka tvaru v panelu (applyShapeChange)', () => {
  it('vrták → kulatá: kulatá dostane SRSCR s držákem, ne vyložení a pouzdro vrtáku', () => {
    const { S, applyShapeChange } = loadShapeFns();
    applyShapeChange('polygon');
    applyShapeChange('drill');
    expect(S.params.toolLength).toBe(145);
    applyShapeChange('round');
    const p = S.params;
    expect(p.toolName).toBe('SRSCR2525M20');
    expect(p.toolShape).toBe('round');
    expect(p.toolRadius).toBe(10);
    expect(p.toolLength).toBeLessThan(20);
    expect(p.toolTipAngle).not.toBe(118);
    expect([p.holderWidth, p.holderLength]).toEqual([25, 150]);
    expect(p.holderProfile).toBeTruthy();
  });

  it('každé tlačítko nasadí svůj nůž — a chybí-li v zásobníku, přidá ho tam', () => {
    const { S, applyShapeChange } = loadShapeFns();
    for (const shape of ['polygon', 'parting', 'threading', 'drill', 'round']) {
      applyShapeChange(shape);
      expect(S.params.toolName, shape).toBe(EXPECTED[shape]);
      expect(S.params.toolShape).toBe(shape);
      const slot = S.toolMagazine[S.activeMagazineSlot];
      expect(slot && slot.name, `${shape}: slot v zásobníku`).toBe(EXPECTED[shape]);
    }
    expect(S.toolMagazine.map(s => s.slot)).toEqual([1, 2, 3, 4, 5]);
  });

  it('nůž ze zásobníku má přednost (jako ✅ Použít, i s jeho ap)', () => {
    const { S, applyShapeChange, _isoMagSlot } = loadShapeFns();
    S.toolMagazine = defaultMagazineKnives().map((r, i) => _isoMagSlot(r, i + 1));
    const k = presetSlotIndex(S.toolMagazine, 'round');
    S.toolMagazine[k].ap = 2;
    applyShapeChange('drill');
    applyShapeChange('round');
    expect(S.activeMagazineSlot).toBe(k);
    expect(S.params.depthOfCut).toBe(2);
  });

  it('pamatuje si nůž, který byl u tvaru nastavený (i s držákem), a ukládá ho se stavem', () => {
    const { S, applyShapeChange, _isoMagSlot, _loadMagSlot } = loadShapeFns();
    // Vlastní polygonový nůž v zásobníku (jiné jméno i obrys) → ✅ Použít.
    const own = { ..._isoMagSlot(presetKnifeForShape('polygon'), 8), name: 'Můj PSBNR' };
    own.holderProfile.sideA[0].x += 1;
    S.toolMagazine = [own];
    _loadMagSlot(0);
    S.params.toolRadius = 1.2;                       // úprava v panelu
    applyShapeChange('round');
    expect(S.params.toolName).toBe('SRSCR2525M20');
    applyShapeChange('polygon');
    expect(S.params.toolName).toBe('Můj PSBNR');
    expect(S.params.toolRadius).toBe(1.2);
    expect(S.params.holderProfile.sideA[0].x).toBe(own.holderProfile.sideA[0].x);
    // Slot se neoznačí — nůž se od něj liší (R 1,2).
    expect(S.activeMagazineSlot).toBeNull();
    // Paměť je čisté JSON (ukládá se do localStorage se stavem).
    expect(JSON.parse(JSON.stringify(S.shapeKnives)).round.name).toBe('SRSCR2525M20');
  });

  it('polygon při čelním hrubování má natočení záporné, upichovák jede čelně', () => {
    const { S, applyShapeChange } = loadShapeFns();
    S.params.roughingStrategy = 'face';
    applyShapeChange('polygon');
    expect(S.params.toolAngle).toBeLessThan(0);
    S.params.roughingStrategy = 'longitudinal';
    applyShapeChange('parting');
    expect(S.params.roughingStrategy).toBe('face');
  });
});

describe('změna tvaru ve slotu zásobníku (_setMagSlotShape)', () => {
  it('slot vrtáku → kulatá: výchozí nůž i s držákem, číslo slotu zůstává', () => {
    const { _setMagSlotShape, _isoMagSlot } = loadShapeFns();
    const slot = _isoMagSlot(presetKnifeForShape('drill'), 7);
    _setMagSlotShape(slot, 'round');
    expect(slot.name).toBe('SRSCR2525M20');
    expect(slot.slot).toBe(7);
    expect(slot.toolLength).toBeLessThan(20);
    expect([slot.holderWidth, slot.holderLength]).toEqual([25, 150]);
    expect(slot.holderProfile).toBeTruthy();
  });

  it('vlastní jméno slotu zůstává', () => {
    const { _setMagSlotShape, _isoMagSlot } = loadShapeFns();
    const slot = { ..._isoMagSlot(presetKnifeForShape('polygon'), 2), name: 'Můj nůž' };
    _setMagSlotShape(slot, 'parting');
    expect(slot.name).toBe('Můj nůž');
    expect(slot.shape).toBe('parting');
    expect(slot.vbdCode).toBe(presetKnifeForShape('parting').tool.toolVbdCode);
  });
});
