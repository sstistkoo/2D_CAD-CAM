// Čisté funkce slotů 🔧 Zásobníku (js/calculators/cam/sim/magSlots.js,
// vyňato z camSimulator.js 13. 10. 2026): název slotu ze souboru, slot
// z exportu nástroje, výchozí ISO sada, změna tvaru slotu.
import { describe, it, expect } from 'vitest';
import { _defaultMagSlot, _slotNameFromFilename, _buildMagSlotFromTool, _isoDefaultMagSlots, _setMagSlotShape } from '../js/calculators/cam/sim/magSlots.js';
import { SHAPE_CUT_DEFAULTS } from '../js/calculators/cam/camDefaults.js';

describe('sloty zásobníku', () => {
  it('název slotu ze jména souboru (bez .json a _T#, podtržítka → mezery)', () => {
    expect(_slotNameFromFilename('psknr_2525-m12_T3.json')).toBe('Psknr 2525 m12');
    expect(_slotNameFromFilename('.json')).toBe('Nůž');
  });

  it('slot z exportu nástroje: geometrie z exportu, řezné podmínky podle tvaru', () => {
    const profile = [{ x: 0, z: 0 }, { x: 5, z: 0 }];
    const slot = _buildMagSlotFromTool({ toolShape: 'polygon', toolRadius: 0.4, toolTipAngle: 55, holderHand: 'L', holderProfile: profile }, 4, 'Můj nůž');
    expect(slot).toMatchObject({ slot: 4, name: 'Můj nůž', shape: 'polygon', radius: 0.4, tipAngle: 55, holderHand: 'L', ...SHAPE_CUT_DEFAULTS.polygon });
    expect(slot.holderProfile).toEqual(profile);
    expect(slot.holderProfile).not.toBe(profile);   // hluboká kopie
    expect(_defaultMagSlot(9)).toMatchObject({ slot: 9, name: 'T9', shape: 'round', holderProfile: null });
  });

  it('výchozí sada T1–T7 a změna tvaru slotu na nůž tvaru (vlastní jméno zůstane)', () => {
    const mag = _isoDefaultMagSlots();
    expect(mag.map(s => `T${s.slot} ${s.name} ${s.shape}`)).toEqual([
      'T1 PSKNR2525M12 polygon', 'T2 PSBNR2525M12 polygon', 'T3 PDJNR2525M15 polygon', 'T4 SRSCR2525M20 round',
      'T5 SER2525M16 threading', 'T6 MGEHR2525-5 parting', 'T7 Vrtak HSS D20 drill',
    ]);
    const own = { ..._defaultMagSlot(8), name: 'Vlastní' };
    _setMagSlotShape(own, 'parting');
    expect([own.slot, own.name, own.shape]).toEqual([8, 'Vlastní', 'parting']);
    const def = mag[0];
    _setMagSlotShape(def, 'round');
    expect([def.slot, def.name, def.shape]).toEqual([1, 'SRSCR2525M20', 'round']);
  });
});
