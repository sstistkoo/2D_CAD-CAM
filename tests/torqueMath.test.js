import { describe, it, expect } from 'vitest';
import {
  boltTorque, yieldOf, wrenchSetting, convertTorque,
  METRIC_BOLTS, INSERT_SCREWS, KENLOC_PINS, CLAMP_SCREWS, insertIC, hexKeyOf,
} from '../js/calculators/torqueMath.js';

const bolt = (d, cls, mu) => {
  const [, P, dw, dh] = METRIC_BOLTS.find(r => r[0] === d);
  return boltTorque({ d, P, dw, dh, Rp: yieldOf(cls, d), mu });
};

describe('torqueMath – šroub VDI 2230', () => {
  it('M10 8.8, μ 0,12: předpětí ~29,6 kN, moment ~49–50 Nm (tabulka VDI 2230)', () => {
    const r = bolt(10, '8.8', 0.12);
    expect(r.FM / 1000).toBeCloseTo(29.6, 1);
    expect(r.MA).toBeGreaterThan(48);
    expect(r.MA).toBeLessThan(51);
  });
  it('M16, μ 0,12: 8.8 ≈ 210, 10.9 ≈ 308, 12.9 ≈ 361 Nm (tabulka VDI 2230)', () => {
    expect(bolt(16, '8.8', 0.12).MA).toBeCloseTo(210, -1);
    expect(bolt(16, '10.9', 0.12).MA).toBeCloseTo(308, -1);
    expect(bolt(16, '12.9', 0.12).MA).toBeCloseTo(361, -1);
  });
  it('vyšší tření → nižší předpětí, vyšší moment', () => {
    const a = bolt(12, '10.9', 0.10), b = bolt(12, '10.9', 0.16);
    expect(b.FM).toBeLessThan(a.FM);
    expect(b.MA).toBeGreaterThan(a.MA);
  });
  it('8.8 nad M16 má vyšší mez kluzu', () => {
    expect(yieldOf('8.8', 16)).toBe(640);
    expect(yieldOf('8.8', 20)).toBe(660);
    expect(yieldOf('x', 10)).toBeNull();
  });
  it('neplatné vstupy → null', () => {
    expect(boltTorque({ d: 10, P: 1.5, dw: 16, dh: 11, Rp: 640, mu: 0 })).toBeNull();
    expect(boltTorque({ d: 10, P: 1.5, dw: 10, dh: 11, Rp: 640, mu: 0.12 })).toBeNull();
  });
});

describe('torqueMath – klíč a jednotky', () => {
  it('prodloužení o 1/4 délky klíče: nastavit 80 %', () => {
    expect(wrenchSetting(100, 400, 100)).toBeCloseTo(80, 9);
  });
  it('bez prodloužení se nastavení nemění', () => {
    expect(wrenchSetting(35, 300, 0)).toBe(35);
    expect(wrenchSetting(0, 300, 0)).toBeNull();
  });
  it('převody jednotek', () => {
    expect(convertTorque(1, 'kgfm', 'Nm')).toBeCloseTo(9.80665, 6);
    expect(convertTorque(3.5, 'Nm', 'cNm')).toBeCloseTo(350, 9);
    expect(convertTorque(10, 'lbfft', 'Nm')).toBeCloseTo(13.558, 3);
    expect(convertTorque(1, 'Nm', 'xx')).toBeNull();
  });
});

describe('torqueMath – data', () => {
  it('šrouby VBD: min ≤ max a kladné', () => {
    for (const [, , lo, hi] of INSERT_SCREWS) {
      expect(lo).toBeGreaterThan(0);
      expect(hi).toBeGreaterThanOrEqual(lo);
    }
  });
});

describe('torqueMath – Kenloc a označení VBD', () => {
  it('CNMG120412FN i ANSI CNMG433FN → IC 12,7, negativní', () => {
    expect(insertIC('CNMG120412FN')).toEqual({ ic: 12.7, neg: true });
    expect(insertIC('cnmg 433 fn')).toEqual({ ic: 12.7, neg: true });
  });
  it('CCMT09T304 je pozitivní, neznámé označení → null', () => {
    expect(insertIC('CCMT09T304')).toEqual({ ic: 9.525, neg: false });
    expect(insertIC('RCMX2006')).toBeNull();
  });
  it('imbus z textu klíče, Torx → null', () => {
    expect(hexKeyOf('imbus 2,5')).toBe(2.5);
    expect(hexKeyOf('2.5 mm')).toBe(2.5);
    expect(hexKeyOf('T20')).toBeNull();
  });
  it('CNMG 12 s imbusem 2,5 → Kenloc KLM-46, 3,3 Nm', () => {
    const pin = KENLOC_PINS.find(p => p[0] === 2.5);
    expect(pin[3]).toBe(3.3);
    expect(pin[4]).toBe(insertIC('CNMG120412').ic);
  });
});

describe('torqueMath – upínky shora', () => {
  it('imbus 2,5 → šroub upínky 4,0–4,2 Nm, rozsahy platné', () => {
    expect(CLAMP_SCREWS.find(c => c[0] === 2.5).slice(3)).toEqual([4.0, 4.2]);
    for (const [, , , lo, hi] of CLAMP_SCREWS) expect(hi).toBeGreaterThanOrEqual(lo);
  });
});
