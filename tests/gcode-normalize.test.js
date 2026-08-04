// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Testy: normalizace ručně psaného G-kódu             ║
// ╚══════════════════════════════════════════════════════════════╝

import { describe, it, expect } from 'vitest';
import { normalizeGcodeLine, normalizeGcodeText } from '../js/gcodeNormalize.js';

describe('normalizeGcodeLine – lidský zápis → kanonický', () => {
  it('malá písmena a chybějící nuly', () => {
    expect(normalizeGcodeLine('g1 x10 z-5')).toBe('G01 X10.000 Z-5.000');
    expect(normalizeGcodeLine('g0x0z0')).toBe('G00 X0.000 Z0.000');
  });

  it('mezery mezi adresou a hodnotou', () => {
    expect(normalizeGcodeLine('X 10   Z 20')).toBe('X10.000 Z20.000');
  });

  it('desetinná čárka', () => {
    expect(normalizeGcodeLine('x10,5 z-3,25')).toBe('X10.500 Z-3.250');
  });

  it('matematické výrazy', () => {
    expect(normalizeGcodeLine('X10+5')).toBe('X15.000');
    expect(normalizeGcodeLine('Z200/3')).toBe('Z66.667');
    expect(normalizeGcodeLine('X(10+5)*2')).toBe('X30.000');
    // Mezery uvnitř výrazu – adresu ukončuje až další písmeno.
    expect(normalizeGcodeLine('X10 + 5 Z-3')).toBe('X15.000 Z-3.000');
  });

  it('přiřazovací zápis X=10 / X:10', () => {
    expect(normalizeGcodeLine('x=10 z: -5')).toBe('X10.000 Z-5.000');
  });

  it('blok bez mezer', () => {
    expect(normalizeGcodeLine('n10g1x20z-30')).toBe('N10 G01 X20.000 Z-30.000');
  });

  it('oblouk s poloměrem', () => {
    expect(normalizeGcodeLine('g3 x25 z-40 r5')).toBe('G03 X25.000 Z-40.000 R5.000');
  });

  it('komentáře zůstanou a nepřepisují se', () => {
    expect(normalizeGcodeLine('g1 x10 ; ted jedeme doprava'))
      .toBe('G01 X10.000 ; ted jedeme doprava');
    expect(normalizeGcodeLine('; jen poznamka')).toBe('; jen poznamka');
    expect(normalizeGcodeLine('g1 x10 (najezd)')).toBe('G01 X10.000 (najezd)');
  });

  it('nesrozumitelná hodnota zůstane, ať je vidět, čemu appka nerozuměla', () => {
    expect(normalizeGcodeLine('X??')).toBe('X??');
  });

  it('prázdný řádek zůstane prázdný', () => {
    expect(normalizeGcodeLine('')).toBe('');
    expect(normalizeGcodeLine('   ')).toBe('');
  });
});

describe('normalizeGcodeText – celý program', () => {
  it('zachová členění na řádky včetně prázdných', () => {
    const input = 'g0 x0 z0\n\ng1 x20 z-30\ng2 x25 z-40 r5';
    expect(normalizeGcodeText(input)).toBe(
      'G00 X0.000 Z0.000\n\nG01 X20.000 Z-30.000\nG02 X25.000 Z-40.000 R5.000',
    );
  });

  it('výstup je idempotentní (druhý průchod už nic nemění)', () => {
    const once = normalizeGcodeText('g1x10,5z-3 ; pozn');
    expect(normalizeGcodeText(once)).toBe(once);
  });

  it('zvládne prázdný vstup', () => {
    expect(normalizeGcodeText('')).toBe('');
    expect(normalizeGcodeText(null)).toBe('');
  });
});
