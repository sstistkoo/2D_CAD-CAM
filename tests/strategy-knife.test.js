import { describe, it, expect } from 'vitest';
import { strategyKnifeSlot, knifeStrategy } from '../js/calculators/cam/strategyKnife.js';

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

describe('knifeStrategy – karusel po X (uživatel 11. 11. 2026)', () => {
  const S = (p) => ({ params: { roughingStrategy: 'face', ...p } });
  it('karusel po X: ↔ Čelně počítá podélně → nůž podélný (PSBNR)', () => {
    const s = S({ machineStructure: 'carousel', carouselAlongX: true });
    expect(knifeStrategy(s)).toBe('longitudinal');
    expect(strategyKnifeSlot(mag, { toolShape: 'polygon', toolName: 'PSKNR2525M12' }, knifeStrategy(s))).toBe(1);
    expect(knifeStrategy(S({ machineStructure: 'carousel', roughingStrategy: 'longitudinal' }))).toBe('face');
  });
  it('soustruh a karusel bez přepínače beze změny', () => {
    expect(knifeStrategy(S({ machineStructure: 'lathe' }))).toBe('face');
    expect(knifeStrategy(S({ machineStructure: 'carousel', carouselAlongX: false }))).toBe('face');
    expect(knifeStrategy(S({ machineStructure: 'carousel', roughingStrategy: 'zigzag' }))).toBe('zigzag');
  });
});
