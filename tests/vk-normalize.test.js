import { describe, it, expect } from 'vitest';
import {
  normalizeVkLine, normalizeVkText, vkErrorSummary, formatVkIssues,
} from '../js/calculators/vkNormalize.js';
import { parseVkLine, buildVkPreviewData, vkChainHasElements, vkArcInWorld, resolveVkArcGeometry, vkToWorld } from '../js/calculators/vkContour.js';

const norm = (s) => normalizeVkLine(s).line;
const errors = (s) => normalizeVkLine(s).issues.filter((i) => i.level === 'error');

describe('normalizeVkLine – korektní zápis zůstane beze změny', () => {
  it.each([
    'G0 X10.0 Z30.0',
    'G11 X40.0 Z?',
    'G11 X? Z? PA150',
    'G11 X? Z? PA180 PR20',
    'G2 X50.0 Z-25.0 R5.0 T',
    'G2 X? Z? R3.0 T VPOL1',
    'G3 X? Z? R5.0 T VPOL2',
    'G111 X0 Z40',
    'G111 X10 Z20 PA30 R5',
    'G1 X10 Z-30',
    '; komentář',
    '( G111 X0 Z40 - POZNÁMKA VPOL )',
    '',
  ])('%s', (line) => {
    expect(norm(line)).toBe(line);
    expect(errors(line)).toEqual([]);
  });
});

describe('normalizeVkLine – lidský zápis', () => {
  it('malá písmena a vedoucí nula v příkazu', () => {
    expect(norm('g01 x10 z-5')).toBe('G1 X10 Z-5');
    expect(norm('G02 X5 Z-3 R2')).toBe('G2 X5 Z-3 R2');
    expect(norm('g03 x5 z-3 r2 t')).toBe('G3 X5 Z-3 R2 T');
    expect(norm('G00 X0 Z0')).toBe('G0 X0 Z0');
  });
  it('desetinná čárka, .5, 5., mezery za adresou, přiřazení', () => {
    expect(norm('G1 X10,5 Z-3')).toBe('G1 X10.5 Z-3');
    expect(norm('G1 X.5 Z-.25')).toBe('G1 X0.5 Z-0.25');
    expect(norm('G1 X5. Z+3')).toBe('G1 X5 Z3');
    expect(norm('G1 X 10  Z -5')).toBe('G1 X10 Z-5');
    expect(norm('G1 X=10 Z:5')).toBe('G1 X10 Z5');
  });
  it('výrazy, bloky bez mezer, číslo bloku', () => {
    expect(norm('G1 X10+5 Z200/4')).toBe('G1 X15 Z50');
    expect(norm('G1 X(10+5)*2 Z-3')).toBe('G1 X30 Z-3');
    expect(norm('G1X10Z-5')).toBe('G1 X10 Z-5');
    expect(norm('N10 G1 X10 Z0')).toBe('G1 X10 Z0');
  });
  it('neznámé ? a VPOL/T v libovolné velikosti, komentář zůstane', () => {
    expect(norm('g2 x? z? r3 t vpol1')).toBe('G2 X? Z? R3 T VPOL1');
    expect(norm('G1 X10 Z-5 ; poznámka')).toBe('G1 X10 Z-5 ; poznámka');
    expect(norm('G1 X10 (hrana) Z-5')).toBe('G1 X10 Z-5 (hrana)');
  });
  it('pořadí adres se zachová, příkaz jde první', () => {
    expect(norm('X10 Z-5 G1')).toBe('G1 X10 Z-5');
  });
});

describe('normalizeVkLine – ochrana proti překlepům', () => {
  it('neznámý příkaz a chybějící příkaz', () => {
    expect(errors('G90 X10')[0].msg).toMatch(/G90 VK nezná/);
    expect(errors('G41 X10')).toHaveLength(1);
    expect(errors('X10 Z5')[0].msg).toMatch(/chybí příkaz/);
    expect(errors('G1 G2 X10 Z5 R3')[0].msg).toMatch(/dva příkazy/);
  });
  it('střed oblouku I/J/K a cizí adresy', () => {
    expect(errors('G2 X10 Z5 I3 K2')[0].msg).toMatch(/střed oblouku/);
    expect(errors('G1 X10 Z5 Q100')[0].msg).toMatch(/adresa Q/);
    const f = normalizeVkLine('G1 X10 Z5 F0.2 M8');
    expect(f.issues.map((i) => i.level)).toEqual(['warn', 'warn']);
    expect(f.line).toBe('G1 X10 Z5');
  });
  it('nejednoznačné číslo s mezerou: „X10 -5“ se NEvyhodnotí jako 5', () => {
    const r = normalizeVkLine('G1 X10 -5 Z0');
    expect(r.issues.some((i) => i.level === 'error')).toBe(true);
    expect(r.line).toBe('G1 X10 -5 Z0');
    expect(errors('G1 X10 5')).toHaveLength(1);
    expect(errors('G1 X10 - 5')).toEqual([]);
  });
  it('adresa bez hodnoty, nečíselná hodnota, dělení nulou', () => {
    expect(errors('G1 X Z5')[0].msg).toMatch(/X nemá hodnotu/);
    expect(errors('G1 X1.2.3 Z5')[0].msg).toMatch(/nejde přečíst/);
    expect(errors('G1 X10/0 Z5')).toHaveLength(1);
  });
  it('dvakrát stejná adresa', () => {
    expect(errors('G1 X10 X20 Z5')[0].msg).toMatch(/X je na řádku dvakrát/);
  });
  it('oblouk bez R, nulové a záporné R', () => {
    expect(errors('G2 X10 Z5')[0].msg).toMatch(/bez poloměru/);
    expect(errors('G2 X10 Z5 R0')[0].msg).toMatch(/nesmí být 0/);
    for (const l of ['G2 X? Z? R-4', 'G3 X10 Z5 R-6 T', 'G2 X10 Z? R-4']) {
      const r = normalizeVkLine(l);
      expect(r.issues.map((i) => i.level)).toEqual(['warn']);
      expect(r.line).not.toMatch(/R-/);
    }
    expect(norm('g3 x? z? r-4 t')).toBe('G3 X? Z? R4 T');
    expect(errors('G3 X10 Z5 R-6')).toEqual([]);
    expect(errors('G2 X? Z? R?')).toEqual([]);
  });
  it('T s číslem (omylem vyvolání nástroje) a špatné VPOL', () => {
    expect(errors('G1 X10 Z5 T1')[0].msg).toMatch(/T je příznak/);
    expect(errors('G2 X? Z? R3 VPOL3')[0].msg).toMatch(/VPOL1 nebo VPOL2/);
  });
  it('prázdný příkaz a text před příkazem', () => {
    expect(errors('G1')[0].msg).toMatch(/bez souřadnic/);
    expect(errors('123 G1 X5 Z5')[0].msg).toMatch(/před příkazem/);
  });
  it('varování nebrání použití a řádek se přesto srovná', () => {
    const r = normalizeVkLine('g1 x1000000 z5');
    expect(r.issues[0].level).toBe('warn');
    expect(r.line).toBe('G1 X1000000 Z5');
    expect(normalizeVkLine('G1 X5 Z5 R3').issues[0].level).toBe('warn');
    expect(normalizeVkLine('G11 X? Z? PA400').issues[0].level).toBe('warn');
    expect(normalizeVkLine('G11 X? Z? PR0 PA10').issues[0].level).toBe('warn');
  });
  it('řádek s chybou se nepřepíše (jen se ořízne)', () => {
    expect(norm('  g90 x10  ')).toBe('g90 x10');
  });
});

describe('normalizeVkText', () => {
  it('čísluje řádky od 1 a zachová prázdné řádky', () => {
    const { text, issues } = normalizeVkText('g0 x0 z0\n\nG2 X5 Z5\ng1 x,5 z1');
    expect(text.split('\n')[0]).toBe('G0 X0 Z0');
    expect(text.split('\n')[1]).toBe('');
    expect(issues.map((i) => i.line)).toContain(3);
    expect(issues.find((i) => i.line === 3).msg).toMatch(/bez poloměru/);
  });
  it('vkErrorSummary: prázdný při samých varováních, jinak text s řádkem', () => {
    expect(vkErrorSummary(normalizeVkText('G1 X1000000 Z5').issues)).toBe('');
    expect(vkErrorSummary(normalizeVkText('G1 X5\nG9 X1').issues)).toMatch(/Řádek 2/);
  });
  it('formatVkIssues zkracuje dlouhý seznam', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ level: 'error', msg: 'x', line: i + 1 }));
    expect(formatVkIssues(many, 2).split('\n')).toHaveLength(3);
  });
});

describe('integrace s parserem VK', () => {
  it('parseVkLine čte lidský zápis stejně jako kanonický', () => {
    expect(parseVkLine('g01 x10,5 z -3')).toMatchObject({ cmd: 'G1', x: 10.5, z: -3 });
    expect(parseVkLine('g02 x5 z-3 r2 t')).toMatchObject({ cmd: 'G2', isArc: true, r: 2, isT: true });
    expect(parseVkLine('g11 x? z? pa150')).toMatchObject({ cmd: 'G11', x: null, pa: 150 });
  });
  it('dřív tiše zahozené řádky (G01/G02, malá písmena) jsou teď v náhledu', () => {
    const data = buildVkPreviewData(['g0 x10 z0', 'G01 X10 Z-30', 'G02 X20 Z-40 R10']);
    expect(data.segments.filter((s) => s.type !== 'ray')).toHaveLength(3);
  });
  it('vkChainHasElements rozpozná i lidský zápis', () => {
    expect(vkChainHasElements('g01 x5 z5')).toBe(true);
    expect(vkChainHasElements('G111 X0 Z40')).toBe(false);
  });
});

describe('záporné R = oblouk větší než půlkruh', () => {
  const a = { x: 0, z: 0 };
  const b = { x: 0, z: 10 };      // tětiva 10, R6 → minor i major oblouk existuje
  const sweep = (arc) => {
    let d = arc.endAngle - arc.startAngle;
    if (arc.ccw) { while (d <= 0) d += 2 * Math.PI; } else { while (d >= 0) d -= 2 * Math.PI; }
    return Math.abs(d);
  };
  it.each(['G2', 'G3'])('%s: kladné R = < 180°, záporné R = > 180°, stejný poloměr', (dir) => {
    const minor = vkArcInWorld(a, b, 6, dir);
    const major = vkArcInWorld(a, b, -6, dir);
    expect(minor.r).toBe(6);
    expect(major.r).toBe(6);
    expect(sweep(minor)).toBeLessThan(Math.PI);
    expect(sweep(major)).toBeGreaterThan(Math.PI);
    expect(major.ccw).toBe(minor.ccw);
    // střed je na opačné straně tětivy
    expect(Math.hypot(major.cx - minor.cx, major.cy - minor.cy)).toBeGreaterThan(1);
  });
  it('oba oblouky končí ve stejných bodech', () => {
    const arc = vkArcInWorld(a, b, -6, 'G3');
    const at = (ang) => [arc.cx + arc.r * Math.cos(ang), arc.cy + arc.r * Math.sin(ang)];
    const [sx, sy] = at(arc.startAngle);
    const [ex, ey] = at(arc.endAngle);
    const [wsx, wsy] = vkToWorld(a);
    const [wex, wey] = vkToWorld(b);
    expect(Math.hypot(sx - wsx, sy - wsy)).toBeLessThan(1e-9);
    expect(Math.hypot(ex - wex, ey - wey)).toBeLessThan(1e-9);
  });
  it('R = 0 se odmítne a R menší než půlka tětivy taky', () => {
    expect(vkArcInWorld(a, b, 0, 'G2')).toBeNull();
    expect(vkArcInWorld(a, b, -4, 'G2')).toBeNull();
  });
  it('resolveVkArcGeometry: záporné R dá větší sweep', () => {
    const minor = resolveVkArcGeometry(a, b, 6, 'G3');
    const major = resolveVkArcGeometry(a, b, -6, 'G3');
    expect(Math.abs(minor.sweep)).toBeLessThan(Math.PI);
    expect(Math.abs(major.sweep)).toBeGreaterThan(Math.PI);
  });
  it('náhled: R-6 se z VK zápisu dostane do segmentu jako velký oblouk', () => {
    const data = buildVkPreviewData(['G0 X0 Z0', 'G3 X0 Z10 R-6']);
    const seg = data.segments.find((s) => s.type === 'arc');
    expect(seg.radius).toBe(-6);
  });
});
