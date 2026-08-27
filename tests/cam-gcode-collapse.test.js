// ╔══════════════════════════════════════════════════════════════╗
// ║  Slučování navazujících přímých bloků (cam/gcodeCollapse.js)  ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Generátor skládá jeden rovný pohyb ze tří etap (nájezd posuvem, řez,
// doběh za hranu polotovaru) a ve výstupu z toho byly tři bloky po jedné
// přímce — nález uživatele 27. 8. 2026. Slučování je POST-ÚPRAVA TEXTU:
// dráha musí zůstat doslova stejná, takže se tu hlídají obě strany —
// co se sloučit MÁ i co se sloučit NESMÍ.
//
// Plošně to hlídají regresní snapshoty (cam-gcode-regression) a měření
// `scripts/cam_sweep.mjs`, kde po nasazení nevyšla ani jedna změněná
// fixture (úběr i kolize na milimetr stejné, 1 067 bloků pryč).
import { describe, it, expect } from 'vitest';
import { mergeCollinearMoves } from '../js/calculators/cam/gcodeCollapse.js';

/** Text → řádky ve tvaru, v jakém je vydává `generateAutoGCode`. */
const L = (...texts) => texts.map((text, i) => ({ text, simIdx: i }));
const T = (lines) => mergeCollinearMoves(lines).map(l => l.text);

// Výchozí poloha: bez ní se první pohyb slučovat nesmí (není odkud měřit).
const START = 'N10 G0 X150 Z5';

describe('slučování navazujících přímých bloků', () => {
  it('tři bloky po jedné přímce dají jeden (nález uživatele)', () => {
    expect(T(L(START, 'N20 G0 X63.545', 'N30 G0 Z260.173',
      'N40 G1 Z258.373 F0.25', 'N50 G1 Z196.278 F0.25', 'N60 G1 Z195.278 F0.25')))
      .toEqual([START, 'N20 G0 X63.545', 'N30 G0 Z260.173', 'N40 G1 Z195.278 F0.25']);
  });

  it('šikmý pohyb se sloučí taky — zapíše obě osy', () => {
    // Výchozí poloha musí ležet na téže přímce, jinak nejde o jeden pohyb.
    expect(T(L('N10 G0 X150 Z100', 'N20 G1 X100 Z50 F0.2', 'N30 G1 X50 Z0 F0.2')))
      .toEqual(['N10 G0 X150 Z100', 'N20 G1 X50 Z0 F0.2']);
  });

  it('kolmé pohyby zůstávají dva bloky', () => {
    const src = L(START, 'N20 G0 Z258.386', 'N30 G0 X63.545');
    expect(T(src)).toEqual(src.map(l => l.text));
  });

  it('obrat směru po téže přímce se neslučuje', () => {
    // Z5 → Z100 je +95, zpátky na Z50 je −50: táž přímka, opačný směr.
    const src = L(START, 'N20 G1 Z100 F0.25', 'N30 G1 Z50 F0.25');
    expect(T(src)).toEqual(src.map(l => l.text));
    // Pokračování TÝMŽ směrem (Z100 → Z200) se naopak sloučí.
    expect(T(L(START, 'N20 G1 Z100 F0.25', 'N30 G1 Z200 F0.25')))
      .toEqual([START, 'N20 G1 Z200 F0.25']);
  });

  it('komentář blok ochrání (rampa, výjezd nad konturu)', () => {
    const src = L(START, 'N20 G1 X100 ; Rampa 90.0°', 'N30 G1 X50 F0.25');
    expect(T(src)).toEqual(src.map(l => l.text));
  });

  it('různý posuv se neslučuje (F je modální, měří se platný)', () => {
    const src = L(START, 'N20 G1 Z100 F0.25', 'N30 G1 Z150 F0.1');
    expect(T(src)).toEqual(src.map(l => l.text));
    // …ale chybějící F znamená TÝŽ modální posuv, takže sloučit lze.
    expect(T(L(START, 'N20 G1 Z100 F0.25', 'N30 G1 Z150')))
      .toEqual([START, 'N20 G1 Z150 F0.25']);
  });

  it('rychloposuv se s řezným pohybem nemíchá', () => {
    const src = L(START, 'N20 G0 Z100', 'N30 G1 Z50 F0.25');
    expect(T(src)).toEqual(src.map(l => l.text));
  });

  it('oblouk běh přeruší a sám se nesloučí', () => {
    const src = L(START, 'N20 G1 Z100 F0.25', 'N30 G3 X40 Z90 CR=10 F0.25', 'N40 G1 Z50 F0.25');
    expect(T(src)).toEqual(src.map(l => l.text));
  });

  it('první pohyb bez známé výchozí polohy se neslučuje', () => {
    const src = L('N10 G1 Z100 F0.25', 'N20 G1 Z50 F0.25');
    expect(T(src)).toEqual(src.map(l => l.text));
  });

  it('blok s jinou adresou (M, S) běh přeruší', () => {
    const src = L(START, 'N20 G1 Z100 F0.25', 'N30 M8', 'N40 G1 Z50 F0.25');
    expect(T(src)).toEqual(src.map(l => l.text));
  });

  it('nulový pohyb (týž bod dvakrát) zmizí, poloha se nezmění', () => {
    expect(T(L(START, 'N20 G1 Z100 F0.25', 'N30 G1 Z100 F0.25')))
      .toEqual([START, 'N20 G1 Z100 F0.25']);
  });

  it('komentářové řádky mezi průchody zůstávají a běh přeruší', () => {
    expect(T(L(START, 'N20 G1 Z100 F0.25', '; Průchod 2', 'N30 G1 Z50 F0.25')))
      .toEqual([START, 'N20 G1 Z100 F0.25', '; Průchod 2', 'N30 G1 Z50 F0.25']);
  });

  it('vybočení nad 1 µm se nesloučí, pod ním ano', () => {
    // Kolmá odchylka mezibodu od přímky běhu; práh kryje tisk na 3 desetiny.
    const S0 = 'N10 G0 X150 Z100';
    const src = L(S0, 'N20 G1 X100 Z50 F0.2', 'N30 G1 X49.99 Z0 F0.2');
    expect(T(src), 'vybočení 3,5 µm').toEqual(src.map(l => l.text));
    expect(T(L(S0, 'N20 G1 X100 Z50 F0.2', 'N30 G1 X49.999 Z0 F0.2')))
      .toEqual([S0, 'N20 G1 X49.999 Z0 F0.2']);
  });

  it('vstupní pole se nemění (vrací se nové)', () => {
    const src = L(START, 'N20 G1 Z100 F0.25', 'N30 G1 Z50 F0.25');
    const before = src.map(l => l.text);
    mergeCollinearMoves(src);
    expect(src.map(l => l.text)).toEqual(before);
  });
});
