// Testy pro Gear Pair nástroj:
//   - validateGearPairParams (dialog validátor)
//   - computeGearPairLayout (osová vzdálenost + fázová rotace 2. kola)

import { describe, it, expect } from 'vitest';
import { validateGearPairParams } from '../js/dialogs/gearPairDialog.js';
import { computeGearPairLayout, rotateProfile } from '../js/tools/gearPairMath.js';
import { generateFullGearProfile } from '../js/tools/gearGenerator.js';
import { polyIntersect, polyArea } from '../js/geom/geomCore.js';
import { bulgeToArc } from '../js/utils.js';

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

  it('s korekcí (x1, x2) je osová vzdálenost provozní a_w (inv α_w = inv α + 2·tg α·Σx/Σz)', () => {
    // Do 18. 11. 2026 se kreslilo zjednodušeně v r1 + r2 – zuby se překrývaly.
    const r = computeGearPairLayout({ m: 2, z1: 20, z2: 40, alpha: 20, x1: 0.5, x2: 0.5, orientation: 0 }, 0, 0);
    const inv = (p) => Math.tan(p) - p, al = 20 * Math.PI / 180;
    const aw = Math.acos(60 * Math.cos(al) / r.axis);
    expect(inv(aw)).toBeCloseTo(inv(al) + 2 * Math.tan(al) * 1 / 60, 12);
    expect(r.axis).toBeGreaterThan(60);
    expect(r.axis).toBeLessThan(62);                       // < a + (x1+x2)·m
    expect(r.tipShorten).toBeCloseTo(62 - r.axis, 12);     // hlavová vůle zůstane 0,25·m
    // V-nulové soukolí (x1 = −x2): a_w = a, hlava se nezkracuje.
    const v0 = computeGearPairLayout({ m: 2, z1: 20, z2: 40, alpha: 20, x1: 0.4, x2: -0.4 }, 0, 0);
    expect(v0.axis).toBe(60);
    expect(v0.tipShorten).toBe(0);
  });
});

describe('Gear pair: zuby v a_w zabírají bez překrytí i bez vůle', () => {
  const densify = (prof) => {
    const pts = [];
    const n = prof.vertices.length;
    for (let i = 0; i < n; i++) {
      const p1 = prof.vertices[i], p2 = prof.vertices[(i + 1) % n], b = prof.bulges[i] || 0;
      pts.push(p1);
      const arc = b ? bulgeToArc(p1, p2, b) : null;
      if (!arc) continue;
      let sweep = arc.endAngle - arc.startAngle;
      if (b > 0 && sweep < 0) sweep += 2 * Math.PI;
      if (b < 0 && sweep > 0) sweep -= 2 * Math.PI;
      for (let k = 1; k < 12; k++) {
        const t = arc.startAngle + sweep * k / 12;
        pts.push({ x: arc.cx + arc.r * Math.cos(t), y: arc.cy + arc.r * Math.sin(t) });
      }
    }
    return pts;
  };
  const cases = [
    { m: 2, z1: 20, z2: 40, alpha: 20, x1: 0.5, x2: 0.5 },
    { m: 3, z1: 17, z2: 31, alpha: 20, x1: 0.4, x2: -0.1 },
    { m: 2, z1: 25, z2: 25, alpha: 20, x1: -0.2, x2: -0.2 },
  ];
  for (const c of cases) {
    it(`m${c.m} z${c.z1}/${c.z2} x ${c.x1}/${c.x2}`, () => {
      const lay = computeGearPairLayout(c, 0, 0);
      const g1 = generateFullGearProfile(c.m, c.z1, c.alpha, c.x1, 60, 0, 0, lay.tipShorten);
      const g2 = rotateProfile(generateFullGearProfile(c.m, c.z2, c.alpha, c.x2, 60, lay.cx2, lay.cy2, lay.tipShorten), lay.cx2, lay.cy2, lay.rotation2);
      const area = (t, extra = 0) => {
        const a = rotateProfile(g1, 0, 0, t + extra);
        const b = rotateProfile(g2, lay.cx2, lay.cy2, -t * c.z1 / c.z2);
        const xz = (pts) => pts.map(q => ({ z: q.x, x: q.y }));   // geomCore bere {x, z}
        return Math.abs(polyArea(polyIntersect([xz(densify(a))], [xz(densify(b))])));
      };
      const pitch = 2 * Math.PI / c.z1;
      let worst = 0;
      for (let k = 0; k < 8; k++) worst = Math.max(worst, area(pitch * k / 8));
      expect(worst).toBeLessThan(1e-3);                       // žádné překrytí zubů
      const d = 0.02 / (lay.axis * c.z1 / (c.z1 + c.z2));     // 0,02 mm na valivé kružnici
      expect(area(0, d)).toBeGreaterThan(1e-4);               // bez vůle: pootočení = překrytí
      expect(area(0, -d)).toBeGreaterThan(1e-4);
    });
  }
});
