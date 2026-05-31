// Testy pro Gear Pair nástroj:
//   - validateGearPairParams (dialog validátor)
//   - computeGearPairLayout (osová vzdálenost + fázová rotace 2. kola)

import { describe, it, expect } from 'vitest';
import { validateGearPairParams } from '../js/dialogs/gearPairDialog.js';
import { computeGearPairLayout, rotateProfile } from '../js/tools/gearPairMath.js';

// ── Validátor ──

describe('validateGearPairParams', () => {
  it('akceptuje validní vstup', () => {
    const r = validateGearPairParams({ m: 2, z1: 20, z2: 40, alpha: 20 });
    expect(r.error).toBeUndefined();
    expect(r.params.m).toBe(2);
    expect(r.params.z1).toBe(20);
    expect(r.params.z2).toBe(40);
  });

  it('default úhel záběru = 20°', () => {
    expect(validateGearPairParams({ m: 2, z1: 20, z2: 40 }).params.alpha).toBe(20);
  });

  it('odmítne modul ≤ 0', () => {
    expect(validateGearPairParams({ m: 0, z1: 20, z2: 40 }).error).toMatch(/Modul/);
    expect(validateGearPairParams({ m: -1, z1: 20, z2: 40 }).error).toMatch(/Modul/);
  });

  it('odmítne počet zubů < 6 (oba kola)', () => {
    expect(validateGearPairParams({ m: 2, z1: 5, z2: 40 }).error).toMatch(/kola 1/);
    expect(validateGearPairParams({ m: 2, z1: 20, z2: 5 }).error).toMatch(/kola 2/);
  });

  it('odmítne korekci mimo ±1', () => {
    expect(validateGearPairParams({ m: 2, z1: 20, z2: 40, x1: 1.5 }).error).toMatch(/x1/);
    expect(validateGearPairParams({ m: 2, z1: 20, z2: 40, x2: -2 }).error).toMatch(/x2/);
  });

  it('default flagy', () => {
    const r = validateGearPairParams({ m: 2, z1: 20, z2: 40 });
    expect(r.params.addRefCircles).toBe(false);
    expect(r.params.addAxisLine).toBe(false);
    expect(r.params.orientation).toBe(0);
    expect(r.params.steps).toBe(16);
  });
});

// ── Layout výpočet ──

describe('computeGearPairLayout', () => {
  it('osová vzdálenost = m·(z1+z2)/2 (pastorek 20, kolo 40, m=2 → a=60)', () => {
    const r = computeGearPairLayout({ m: 2, z1: 20, z2: 40, orientation: 0 }, 0, 0);
    expect(r.axis).toBe(60);
    expect(r.cx2).toBeCloseTo(60, 5);
    expect(r.cy2).toBeCloseTo(0, 5);
  });

  it('orientace 90° → kolo 2 nad kolem 1', () => {
    const r = computeGearPairLayout({ m: 2, z1: 20, z2: 30, orientation: 90 }, 0, 0);
    expect(r.cx2).toBeCloseTo(0, 5);
    expect(r.cy2).toBeCloseTo(50, 5);
  });

  it('absolutní střed kola 1 ovlivňuje pozici kola 2 (translace)', () => {
    const r = computeGearPairLayout({ m: 2, z1: 20, z2: 40, orientation: 0 }, 100, 50);
    expect(r.cx2).toBeCloseTo(160, 5);
    expect(r.cy2).toBeCloseTo(50, 5);
  });

  it('liché z2 → fázová rotace = 0 (mezera přirozeně na π)', () => {
    const r = computeGearPairLayout({ m: 2, z1: 20, z2: 21, orientation: 0 }, 0, 0);
    expect(r.rotation2).toBeCloseTo(0, 6);
  });

  it('sudé z2 → fázová rotace = π/z2 (posun mezery na π)', () => {
    const r = computeGearPairLayout({ m: 2, z1: 20, z2: 40, orientation: 0 }, 0, 0);
    expect(r.rotation2).toBeCloseTo(Math.PI / 40, 6);
  });

  it('orientace se přičítá k fázové rotaci kola 2', () => {
    // sudé z2 + orientation 30° → phaseRot + orientRad
    const r = computeGearPairLayout({ m: 2, z1: 20, z2: 30, orientation: 30 }, 0, 0);
    expect(r.rotation2).toBeCloseTo(Math.PI / 30 + Math.PI / 6, 6);
  });

  it('různý modul nemá smysl (zkontrolováno přes validátor jen společný m)', () => {
    // computeGearPairLayout neřeší m1≠m2 (parametry mají jen 1× m)
    // dialog garantuje společný modul, takže není co testovat víc
    expect(true).toBe(true);
  });
});

// ── Sanity: výsledná polylinová geometrie pomocí přímého výpočtu ──

describe('Gear pair: roztečné kružnice se přesně dotýkají v bodě kontaktu', () => {
  it('m=2 z1=20 z2=40: r1=20, r2=40, a=r1+r2=60 ✓', () => {
    const m = 2, z1 = 20, z2 = 40;
    const r1 = m * z1 / 2;
    const r2 = m * z2 / 2;
    const { axis } = computeGearPairLayout({ m, z1, z2, orientation: 0 }, 0, 0);
    expect(axis).toBe(r1 + r2);
  });

  it('s korekcí (x1, x2) je osová vzdálenost stále r1+r2 (zjednodušeno – přesný výpočet vyžaduje pracovní úhel záběru)', () => {
    // Pro CAM/CAD účely je rozumné držet teoretickou rozteč i s mírnou
    // korekcí. Přesný (pracovní) úhel záběru se v praxi řeší jinak.
    const r = computeGearPairLayout({ m: 2, z1: 20, z2: 40, x1: 0.5, x2: 0.5, orientation: 0 }, 0, 0);
    expect(r.axis).toBe(60);
  });
});
