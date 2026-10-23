// Čelní zápich (pravidlo 19): výběr čelního nože — ze 🔧 Zásobníku, jinak
// vhodný z 📚 katalogu podle rozsahu ⌀, šířky a dosahu čepele.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../js/state.js', async (orig) => ({ ...(await orig()), showToast: vi.fn() }));

import { createKnifeSlots } from '../js/calculators/cam/sim/knifeSlots.js';
import { _isoMagSlot } from '../js/calculators/cam/sim/magSlots.js';
import { buildIsoFaceGroove } from '../js/calculators/isoFaceGrooves.js';
import { _defaultCamParams } from '../js/calculators/cam/camDefaults.js';

const mk = (mag, o = {}) => {
  const S = { params: { ..._defaultCamParams(), partOffFace: true, partOffZ: 0, faceGrooveD1: 32, faceGrooveD2: 40, faceGrooveDepth: 3, ...o }, toolMagazine: mag, activeMagazineSlot: 0 };
  const noop = () => {};
  const k = createKnifeSlots({ S, toolUi: {}, gcodeStale: noop, pathInputsKey: () => '', fullUpdate: noop, saveState: noop, pushHistory: noop, dropInsertGuides: noop, afterToolChange: noop, applyAfterToolChange: noop });
  return { S, k };
};

describe('autoPickToolFor("grooveface")', () => {
  it('bez čelního nože v zásobníku přidá vhodný z katalogu (⌀30–45, nejširší, co se vejde)', () => {
    const { S, k } = mk([]);
    const r = k.autoPickToolFor('grooveface');
    expect(r.changed).toBe(true);
    expect(r.msg).toMatch(/z 📚 katalogu/);
    expect(S.params.toolName).toMatch(/^FGR2525-4-A9-D30-45$/);
  });
  it('vybere čelní nůž ze zásobníku, který zápich pokryje', () => {
    const a = _isoMagSlot(buildIsoFaceGroove({ range: 0, width: 3 }), 1);   // ⌀20–30 — nepokryje
    const b = _isoMagSlot(buildIsoFaceGroove({ range: 1, width: 3 }), 2);
    const { S, k } = mk([a, b]);
    k.autoPickToolFor('grooveface');
    expect(S.params.toolName).toBe(b.name);
    expect(S.toolMagazine).toHaveLength(2);
  });
  it('zápich mimo všechny rozsahy → varování', () => {
    const { k } = mk([], { faceGrooveD1: 10, faceGrooveD2: 16 });
    expect(k.autoPickToolFor('grooveface').msg).toMatch(/⚠/);
  });
  it('upichnutí nevezme čelní nůž', () => {
    const f = _isoMagSlot(buildIsoFaceGroove({ range: 1, width: 3 }), 1);
    const { S, k } = mk([f], { partOffFace: false });
    k.autoPickToolFor('partoff');
    expect(S.params.toolName).not.toBe(f.name);
  });
});
