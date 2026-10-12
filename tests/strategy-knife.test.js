import { describe, it, expect } from 'vitest';
import { strategyKnifeSlot } from '../js/calculators/cam/strategyKnife.js';

const mag = [
  { name: 'PSKNR2525M12', shape: 'polygon' },
  { name: 'PSBNR2525M12', shape: 'polygon' },
  { name: 'SRSCR2525M20', shape: 'round' },
];

describe('strategyKnifeSlot – držák podle strategie hrubování', () => {
  it('čelně → PSKNR, podélně → PSBNR', () => {
    expect(strategyKnifeSlot(mag, { toolShape: 'polygon', toolName: 'PSKNR2525M12' }, 'longitudinal')).toBe(1);
    expect(strategyKnifeSlot(mag, { toolShape: 'polygon', toolName: 'PSBNR2525M12' }, 'face')).toBe(0);
  });
  it('správný nůž se nemění', () => {
    expect(strategyKnifeSlot(mag, { toolShape: 'polygon', toolName: 'PSBNR2525M12' }, 'longitudinal')).toBe(-1);
  });
  it('cizí držák nebo jiný tvar se nemění', () => {
    expect(strategyKnifeSlot(mag, { toolShape: 'polygon', toolName: 'Moje' }, 'longitudinal')).toBe(-1);
    expect(strategyKnifeSlot(mag, { toolShape: 'round', toolName: 'PSKNR2525M12' }, 'longitudinal')).toBe(-1);
  });
  it('chybí-li cílový nůž v zásobníku, nic se nemění', () => {
    expect(strategyKnifeSlot([mag[0]], { toolShape: 'polygon', toolName: 'PSKNR2525M12' }, 'longitudinal')).toBe(-1);
  });
});
