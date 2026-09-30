// ╔══════════════════════════════════════════════════════════════╗
// ║  Rozsah X (📐): vlastní přepínač meze + strop X max (pravidlo 12) ║
// ╚══════════════════════════════════════════════════════════════╝
// 1. Každá mez má vlastní přepínač a platí i SAMA. Do 30. 9. 2026 se rozsah
//    zapnul jen s oběma mezemi — samotné „X max" se tiše ignorovalo.
// 2. Pravidlo 12 (docs/cam-pravidla.md): nad X max se neobrábí a pod materiál,
//    který nad X max stojí, se nepodjíždí. Díl uživatele 30. 9. 2026
//    (`cam-xrange/xmax-wall.camprog`, X max 27,01): polotovar vyleze nad čáru
//    na Z 269,63 — dřív jelo podélné hrubování X 20,6…13 až na Z 245 (pod
//    sloupem vysokým 64,5) a čelní bralo celý sloup od X 64,5.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { _defaultCamParams } from '../js/calculators/cam/camDefaults.js';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';
import { resolveRangeX, xMaxWallZ, XMAX_WALL_TOL } from '../js/calculators/cam/rangeX.js';

const here = dirname(fileURLToPath(import.meta.url));
const ZL0 = { chuck: null, tail: null, chuckActive: false, tailActive: false, rangeStart: null, rangeEnd: null, rangeActive: false };

async function run(file, { xLimits, zLimits, params = {} } = {}) {
  const prog = JSON.parse(readFileSync(join(here, 'fixtures', file), 'utf8'));
  prog.params = { ..._defaultCamParams(), ...prog.params, ...params };
  prog.zLimits = { ...ZL0, ...(zLimits ?? prog.zLimits ?? {}) };
  prog.xLimits = { rangeXMin: null, rangeXMax: null, active: false, ...(xLimits ?? prog.xLimits ?? {}) };
  const r = await runCamProg(prog);
  const issues = validateToolpath(r.calcSim.simPath, r.params, r.calcSim.stockPathSegments, { backside: r.params.roughingSide === 'left' });
  return { ...r, passes: r.calc.passes, issues };
}

describe('rozsah X: přepínač každé meze', () => {
  it('vypnutá mez neplatí, i když má hodnotu; starý projekt bez přepínačů bere `active`', () => {
    expect(resolveRangeX({ rangeXMin: 5, rangeXMax: 30, active: true, minActive: false, maxActive: true }))
      .toEqual({ xLo: -Infinity, xHi: 30 });
    expect(resolveRangeX({ rangeXMin: 5, rangeXMax: 30, active: true, minActive: true, maxActive: false }))
      .toEqual({ xLo: 5, xHi: Infinity });
    expect(resolveRangeX({ rangeXMin: 5, rangeXMax: 30, active: false, minActive: false, maxActive: false })).toBe(null);
    expect(resolveRangeX({ rangeXMin: null, rangeXMax: 30, active: true })).toEqual({ xLo: -Infinity, xHi: 30 });
    expect(resolveRangeX({ rangeXMin: 30, rangeXMax: 5, active: true })).toEqual({ xLo: 5, xHi: 30 });
    expect(resolveRangeX({ rangeXMin: 5, rangeXMax: 30, active: false })).toBe(null);
  });

  it('samotné X min drží dno průchodů (part-1, r ≥ 20)', async () => {
    const onlyMin = await run('cam/part-1.camprog', { xLimits: { minActive: true, maxActive: false, rangeXMin: 20, rangeXMax: 45 } });
    const both = await run('cam/part-1.camprog', { xLimits: { active: true, rangeXMin: 20, rangeXMax: 1e4 } });
    const depths = onlyMin.passes.filter(p => p.type !== 'face').map(p => p.x);
    expect(depths.length).toBeGreaterThan(0);
    expect(onlyMin.gcode).toBe(both.gcode);
    for (const d of depths) expect(d).toBeGreaterThanOrEqual(20 - 0.01);
  }, 120000);
});

describe('xMaxWallZ — kde polotovar vyleze nad X max', () => {
  const seg = (z1, x1, z2, x2) => ({ type: 'line', p1: { x: x1, z: z1 }, p2: { x: x2, z: z2 } });
  // Odlitek: vpravo nízko (X 20), sloup X 60 na Z 40…70, vlevo zase X 20.
  const stock = [seg(100, 0, 100, 20), seg(100, 20, 80, 20), seg(80, 20, 70, 60), seg(70, 60, 40, 60),
    seg(40, 60, 40, 20), seg(40, 20, 0, 20), seg(0, 20, 0, 0), seg(0, 0, 100, 0)];
  const casting = { stockMode: 'casting' };

  it('najde průsečík šikmé stěny s X max', () => {
    const w = xMaxWallZ(casting, 50, stock, 30);
    expect(w.empty).toBe(false);
    expect(w.zWall).toBeCloseTo(80 - 10 * (10 + XMAX_WALL_TOL) / 40, 5);
  });
  it('svislá stěna, stěna mimo rozsah Z a polotovar celý pod X max', () => {
    const vertical = [seg(100, 0, 100, 20), seg(100, 20, 70, 20), seg(70, 20, 70, 60), seg(70, 60, 0, 60), seg(0, 60, 0, 0), seg(0, 0, 100, 0)];
    expect(xMaxWallZ(casting, 50, vertical, 30).zWall).toBeCloseTo(70, 6);
    expect(xMaxWallZ(casting, 50, stock, 30, 85, 100)).toBe(null);
    expect(xMaxWallZ(casting, 50, stock, 65)).toBe(null);
  });
  it('nad X max už na volném konci → nic; tyč nad X max → nic', () => {
    expect(xMaxWallZ(casting, 50, stock, 30, 0, 60).empty).toBe(true);
    expect(xMaxWallZ({ stockMode: 'bar' }, 50, [], 30).empty).toBe(true);
    expect(xMaxWallZ({ stockMode: 'bar' }, 25, [], 30)).toBe(null);
  });
});

describe('pravidlo 12 na dílu uživatele (X max 27,01, stěna Z 269,63)', () => {
  const X_MAX = 27.01, Z_WALL = 269.63;
  for (const strategy of ['longitudinal', 'face']) {
    it(`${strategy}: nic nad X max ani za stěnou, bez kolize`, async () => {
      const free = await run('cam-xrange/xmax-wall.camprog', {
        params: { roughingStrategy: strategy }, xLimits: { active: false, minActive: false, maxActive: false },
      });
      const r = await run('cam-xrange/xmax-wall.camprog', { params: { roughingStrategy: strategy } });
      const zOf = (p) => p.type === 'face' ? p.z : Math.min(p.zStart, p.zEnd);
      expect(Math.min(...free.passes.map(zOf)), 'bez X max se za stěnu nejede — případ nic netestuje').toBeLessThan(Z_WALL - 5);

      expect(r.passes.length).toBeGreaterThan(0);
      for (const p of r.passes) {
        expect(zOf(p), `průchod za stěnou Z${Z_WALL}`).toBeGreaterThanOrEqual(Z_WALL - 0.01);
        const top = p.type === 'face' ? p.xSurface : p.x;
        expect(top, 'průchod nad X max').toBeLessThanOrEqual(X_MAX + XMAX_WALL_TOL + 1e-6);
      }
      expect(r.errors.some(e => /X max 27\.01: od Z 269\.63/.test(e.msg))).toBe(true);
      expect(r.issues.length, JSON.stringify(r.issues.slice(0, 3))).toBe(0);
    }, 120000);
  }

  it('tyč nad X max: žádné dráhy a hlášení (part-1 jako tyč r50, X max 40)', async () => {
    const r = await run('cam/part-1.camprog', {
      params: { stockMode: 'bar', doFinishing: true }, xLimits: { maxActive: true, minActive: false, rangeXMax: 40 },
    });
    expect(r.passes.length).toBe(0);
    expect((r.calc.finishOffsetPath || []).length).toBe(0);
    expect(r.errors.some(e => /sahá nad X max už na začátku/.test(e.msg))).toBe(true);
  }, 120000);
});
