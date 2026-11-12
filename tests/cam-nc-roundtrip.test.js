// ╔══════════════════════════════════════════════════════════════╗
// ║  NC program × nezávislý interpret × simulace × 3 řídicí systémy ║
// ╚══════════════════════════════════════════════════════════════╝
// Simulace, kolizní testy i generátor počítají střed oblouku stejnou funkcí
// (getArcParams). Kdyby se v ní nebo v prohazování G2/G3 spletly, spletou se
// všechny stejně a žádný test nespadne — přitom stroj pojede jinudy.
// Tenhle test čte vygenerovaný program NEZÁVISLÝM interpretem
// (tests/helpers/ncInterpreter.mjs, bez kódu aplikace) a hlídá:
//   (a) každý oblouk jde na stroji sestrojit (|R| ≥ půl tětivy) — jinak alarm,
//   (b) simulace aplikace jede tam, kam stroj (cíle bloků i body na obloucích),
//   (c) Sinumerik, Fanuc a Heidenhain popisují TUTÉŽ dráhu.
// Z (b) plyne, že kolizní testy nad simPath platí i pro skutečný stroj.
// Karusel a překlopené osy: cam-nc-roundtrip-variants.test.js.
import { describe, it, expect } from 'vitest';
import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { interpretNc, checkAgainstSim, arcCenter } from './helpers/ncInterpreter.mjs';
import { parseManualGCodeToPath } from '../js/calculators/cam/gcodeParser.js';
import { roundtripProblems } from './helpers/ncRoundtrip.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = join(__dirname, 'fixtures', 'cam');
const fixtures = readdirSync(dir).filter((f) => f.endsWith('.camprog')).sort();

const prms = { safeX: 100, safeZ: 10, mode: 'DIAMON' };
const start = { x: 50, z: 10 };
const check = (code, flip = {}) => {
  const sim = parseManualGCodeToPath(code, prms, !!flip.flipX !== !!flip.flipZ);
  return checkAgainstSim(code, sim, interpretNc(code, { dia: true, start, ...flip }));
};

describe('interpret NC – sám o sobě', () => {
  it('G2 = po směru hodin ve výkresu (Z doprava, X nahoru)', () => {
    // z (0,0) do (0,20) po směru hodin → střed pod tětivou, oblouk jde nahoru
    const a = arcCenter({ x: 0, z: 0 }, { x: 0, z: 20 }, 10, true);
    expect(a.c.x).toBeCloseTo(0, 9);
    expect(a.c.z).toBeCloseTo(10, 9);
    const b = arcCenter({ x: 0, z: 0 }, { x: 0, z: 20 }, 12, true);
    expect(b.c.x).toBeLessThan(0);
    expect(b.sweep).toBeLessThan(Math.PI);
  });

  it('záporné R = oblouk přes 180°', () => {
    const a = arcCenter({ x: 0, z: 0 }, { x: 0, z: 20 }, -12, true);
    expect(a.c.x).toBeGreaterThan(0);
    expect(a.sweep).toBeGreaterThan(Math.PI);
  });

  it('X v průměru, U/W přírůstkově, G28/G75 nejsou pohyb', () => {
    const { moves } = interpretNc('G0 X80 Z2\nG75 X300\nG1 U-10 W-5\nDIAMOF\nG1 X30', { dia: true, start });
    expect(moves.map((m) => [m.to.x, m.to.z])).toEqual([[40, 2], [35, -3], [30, -3]]);
  });

  it('simulace souhlasí na správném programu (i po překlopení os)', () => {
    const code = 'G0 X40 Z2\nG1 Z0 F0.2\nG3 X60 Z-10 CR=10\nG1 Z-30\nG2 X80 Z-40 R10\nG1 X100';
    expect(check(code)).toEqual([]);
    expect(check(code.replace(/G3/, 'G02').replace(/G2 /, 'G03 '), { flipX: true })).toEqual([]);
  });

  it('POZNÁ chybu: oblouk, který nejde sestrojit (R < půl tětivy)', () => {
    const p = check('G0 X40 Z0\nG2 X60 Z-30 CR=10');
    expect(p.join('\n')).toMatch(/nejde sestrojit/);
  });

  it('POZNÁ chybu: simulace by brala G2 jako G3', () => {
    const code = 'G0 X40 Z0\nG2 X60 Z-10 CR=10';
    const sim = parseManualGCodeToPath(code, prms, false);
    // interpret „stroje" čte opačný smysl → musí nahlásit jinou dráhu
    const p = checkAgainstSim(code, sim, interpretNc(code, { dia: true, start, flipX: true }));
    expect(p.join('\n')).toMatch(/jinudy/);
  });
});

describe('CAM program × stroj × 3 řídicí systémy (soustruh)', () => {
  for (const f of fixtures) {
    it(f, async () => {
      expect(await roundtripProblems(join(dir, f))).toEqual([]);
    });
  }
});
