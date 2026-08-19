import { describe, it, expect, afterEach } from 'vitest';
import { state } from '../js/state.js';
import {
  parseVkLine,
  buildVkPreviewData,
  buildTextChain,
  resolveVkArcGeometry,
  vkToWorld,
  worldToVk,
  pickVkAmbiguousSolution,
  insertTangentTransitions,
  planTangentTransitions,
  diffPreviewSegments,
} from '../js/calculators/vkContour.js';

describe('parseVkLine', () => {
  it('parses VPOL and element commands from VK syntax', () => {
    const vpol = parseVkLine('G111 X10 Z20 PA30 R5');
    const line = parseVkLine('G11 X12 Z22 PA45 PR3');

    expect(vpol).toMatchObject({ cmd: 'G111', x: 10, z: 20, pa: 30, r: 5 });
    expect(line).toMatchObject({ cmd: 'G11', x: 12, z: 22, pa: 45, pr: 3 });
  });

  it('parses G0 as the initial point command', () => {
    const initial = parseVkLine('G0 X10 Z30');

    expect(initial).toMatchObject({ cmd: 'G0', isArc: false, x: 10, z: 30 });
  });

  // Vlastní konverze na ISO vyrábí G1 (z G11 i G0) a stejně tak přechodové
  // úsečky tečnosti. Bez G1 v parseru byl zkonvertovaný program neviditelný.
  it('rozumí i G1 z vlastního ISO výstupu (a nezamění ho s G11/G111)', () => {
    expect(parseVkLine('G1 X10 Z-30')).toMatchObject({ cmd: 'G1', isArc: false, x: 10, z: -30 });
    expect(parseVkLine('G11 X10 Z-30')).toMatchObject({ cmd: 'G11' });
    expect(parseVkLine('G111 X0 Z40')).toMatchObject({ cmd: 'G111' });
  });
});

describe('buildVkPreviewData – zkonvertovaný ISO program', () => {
  // Po „Konvertovat na ISO G-kód" nezbude ani G0, ani VPOL – samé G1.
  // První řádek proto musí posloužit jako počátek, jinak by se zahodil celý.
  it('bere první G1 jako počáteční bod, když není VPOL ani G0', () => {
    const data = buildVkPreviewData(['G1 X10 Z0', 'G1 X10 Z-30', 'G2 X20 Z-40 R10', 'G1 X20 Z-70']);

    expect(data.vpol).toBeNull();
    expect(data.segments).toHaveLength(4);
    expect(data.segments[0]).toMatchObject({ start: { x: 10, z: 0 }, end: { x: 10, z: 0 } });
    expect(data.segments[1]).toMatchObject({ type: 'line', end: { x: 10, z: -30 } });
    expect(data.segments[2]).toMatchObject({ type: 'arc', radius: 10, end: { x: 20, z: -40 } });
    expect(data.segments[3]).toMatchObject({ type: 'line', end: { x: 20, z: -70 } });
  });

  it('s VPOL zůstává první prvek úsečkou od pólu (beze změny)', () => {
    const data = buildVkPreviewData(['G111 X0 Z40', 'G11 X10 Z-30']);

    expect(data.vpol).toEqual({ x: 0, z: 40 });
    expect(data.segments[0]).toMatchObject({ start: { x: 0, z: 40 }, end: { x: 10, z: -30 } });
  });
});

describe('buildVkPreviewData', () => {
  it('builds a simple line preview from VPOL and a subsequent element', () => {
    const data = buildVkPreviewData([
      'G111 X0 Z40',
      'G11 X10 Z30',
    ]);

    expect(data.vpol).toEqual({ x: 0, z: 40 });
    expect(data.segments).toHaveLength(1);
    expect(data.segments[0]).toMatchObject({ type: 'line', start: { x: 0, z: 40 }, end: { x: 10, z: 30 } });
  });

  it('tracks the last known point from the parsed geometry', () => {
    const data = buildVkPreviewData([
      'G111 X0 Z40',
      'G11 X10 Z30',
    ]);

    expect(data.lastPoint).toEqual({ x: 10, z: 30 });
  });

  it('resolves a line endpoint from PA/PR when coordinates are missing', () => {
    const data = buildVkPreviewData([
      'G111 X0 Z40',
      'G11 PA45 PR10',
    ]);

    expect(data.segments[0].type).toBe('line');
    expect(data.segments[0].start).toEqual({ x: 0, z: 40 });
    expect(data.segments[0].end.x).toBeCloseTo(7.071067811865475, 9);
    expect(data.segments[0].end.z).toBeCloseTo(47.071067811865476, 9);
  });

  it('includes a live draft segment when the form contains a pending element', () => {
    const data = buildVkPreviewData(['G111 X0 Z40'], {
      type: 'line',
      start: { x: 0, z: 40 },
      end: { x: 12, z: 32 },
      direction: 'G11',
    });

    expect(data.draft).toMatchObject({ type: 'line', end: { x: 12, z: 32 } });
  });

  it('treats first G0 with only X/Z as a positioning point, not a line from VPOL', () => {
    const data = buildVkPreviewData([
      'G111 X0 Z40',
      'G0 X10 Z30',
    ]);

    expect(data.segments).toHaveLength(1);
    expect(data.segments[0]).toMatchObject({ type: 'line', start: { x: 10, z: 30 }, end: { x: 10, z: 30 } });
  });

  it('treats first element X/Z + PA/PR as start + direction (not end from VPOL)', () => {
    const data = buildVkPreviewData([
      'G111 X0 Z40',
      'G0 X40 Z20 PA10 PR100',
    ]);

    expect(data.segments).toHaveLength(1);
    expect(data.segments[0].start).toEqual({ x: 40, z: 20 });
    expect(data.segments[0].end.x).toBeCloseTo(40 + 100 * Math.sin(10 * Math.PI / 180), 9);
    expect(data.segments[0].end.z).toBeCloseTo(20 + 100 * Math.cos(10 * Math.PI / 180), 9);
  });

  // Dřív fungovalo X/Z + PA/PR (počátek + délka/úhel) jen na úplně prvním
  // prvku – na dalších appka buď X/Z zadané zároveň s PA/PR tiše ignorovala
  // (náhled bral X/Z jako CÍL) nebo naopak ignorovala X/Z (konverze na ISO
  // brala jen předchozí bod + PA/PR) – dvě různé, vzájemně nekonzistentní
  // interpretace. Stejné pravidlo teď platí na libovolném prvku řetězu.
  it('applies the same X/Z + PA/PR rule to a later element, not just the first', () => {
    const data = buildVkPreviewData([
      'G0 X0 Z0',
      'G11 X10 Z0 PA90 PR15',
    ]);

    expect(data.segments).toHaveLength(2);
    expect(data.segments[1].start).toEqual({ x: 10, z: 0 });
    expect(data.segments[1].end.x).toBeCloseTo(25, 9);
    expect(data.segments[1].end.z).toBeCloseTo(0, 9);
    expect(data.lastPoint.x).toBeCloseTo(25, 9);
    expect(data.lastPoint.z).toBeCloseTo(0, 9);
  });

  it('resolves a stable arc center for G2/G3 preview segments', () => {
    const geometry = resolveVkArcGeometry({ x: 0, z: 0 }, { x: 10, z: 0 }, 10, 'G3');

    expect(geometry).not.toBeNull();
    expect(geometry.center.x).toBeCloseTo(5, 9);
    expect(geometry.center.z).toBeCloseTo(8.660254037844387, 9);
    expect(geometry.sweep).toBeGreaterThan(0);
    expect(geometry.startAngle).toBeCloseTo(-2.0943951023931953, 9);
    expect(geometry.endAngle).toBeCloseTo(-1.0471975511965976, 9);
  });

  it('treats G0 with X/Z and PA as a construction ray anchored at the given point', () => {
    const data = buildVkPreviewData(['G0 X20 Z20 PA12']);

    expect(data.segments).toHaveLength(1);
    expect(data.segments[0]).toMatchObject({ type: 'ray', start: { x: 20, z: 20 }, angle: 12 });
  });

  it('inserts a tangent G1 transition before an arc after a construction ray', () => {
    const lines = insertTangentTransitions(['G0 X20 Z20 PA0', 'G2 X25 Z50 R5']);

    expect(lines).toEqual(['G0 X20 Z20 PA0', 'G1 X20 Z45', 'G2 X25 Z50 R5']);
  });

  it('creates a construction ray from VPOL when the VPOL line includes PA', () => {
    const data = buildVkPreviewData(['G111 X10 Z30 PA45']);

    expect(data.vpol).toEqual({ x: 10, z: 30 });
    expect(data.segments).toHaveLength(1);
    expect(data.segments[0]).toMatchObject({ type: 'ray', start: { x: 10, z: 30 }, angle: 45 });
  });


  it('uses the selected ambiguous solution for the draft geometry', () => {
    const previewData = {
      vpol: { x: 0, z: 10 },
      segments: [],
      bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 },
      draft: { type: 'line', start: { x: 0, z: 10 }, end: { x: 5, z: 5 } },
      ambiguousSolutions: [
        { start: { x: 0, z: 10 }, end: { x: 2, z: 2 }, color: 'default' },
        { start: { x: 0, z: 10 }, end: { x: 8, z: 8 }, color: 'cyan' },
      ],
    };

    const selected = pickVkAmbiguousSolution(previewData, 1);

    expect(selected.selectedSolution).toMatchObject({ end: { x: 8, z: 8 }, color: 'cyan' });
    expect(selected.draft.end).toEqual({ x: 8, z: 8 });
  });
});

describe('insertTangentTransitions – mezi dvěma běžnými prvky', () => {
  const original = { xDisplayMode: state.xDisplayMode };
  afterEach(() => Object.assign(state, original));

  // Válec na poloměru 10 od Z0 do Z-40, pak tečný oblouk R10 na poloměr 20.
  // Střed oblouku leží na poloměru 20, takže dotyk je na Z-30 nebo Z-50 –
  // napsaný roh Z-40 se musí posunout, ne obejít vloženou úsečkou.
  const chain = () => ['G0 X10 Z0', 'G11 X10 Z-40', 'G2 X20 Z-40 R10 T'];

  it('posune konec předchozího prvku do dotykového bodu (nevkládá další řádek)', () => {
    const out = insertTangentTransitions(chain());

    expect(out).toHaveLength(3);                     // žádné couvání navíc
    expect(out[0]).toBe('G0 X10 Z0');
    expect(out[2]).toBe('G2 X20 Z-40 R10 T');
    const [, px, pz] = out[1].match(/^G11 X(\S+) Z(\S+)$/);
    expect(parseFloat(px)).toBeCloseTo(10, 6);       // zůstává na válci
    expect([-30, -50]).toContain(parseFloat(pz));    // posunuto na skutečný dotyk
  });

  it('bez příznaku T se nic nepřepisuje – uživatel o tečnost nežádal', () => {
    const out = insertTangentTransitions(['G0 X10 Z0', 'G11 X10 Z-40', 'G2 X20 Z-40 R10']);

    expect(out).toEqual(['G0 X10 Z0', 'G11 X10 Z-40', 'G2 X20 Z-40 R10']);
  });

  it('funguje i v režimu průměr (týž fyzický dotyk, jiný zápis)', () => {
    state.xDisplayMode = 'radius';
    const radiusZ = insertTangentTransitions(chain())[1].match(/Z(\S+)$/)[1];
    state.xDisplayMode = 'diameter';
    const diameterOut = insertTangentTransitions(['G0 X20 Z0', 'G11 X20 Z-40', 'G2 X40 Z-40 R10 T']);
    const [, dx, dz] = diameterOut[1].match(/^G11 X(\S+) Z(\S+)$/);

    expect(parseFloat(dx)).toBeCloseTo(20, 6);
    expect(parseFloat(dz)).toBeCloseTo(parseFloat(radiusZ), 6);
  });

  it('dva oblouky za sebou zůstávají netknuté (kategorie 4.5, zatím neřešeno)', () => {
    const lines = ['G0 X10 Z0', 'G2 X20 Z-40 R10 T', 'G2 X30 Z-60 R10 T'];

    expect(insertTangentTransitions(lines)).toEqual(lines);
  });
});

describe('buildTextChain – X/Z + PA/PR komba (sdíleno s tečným napojením)', () => {
  it('bere X/Z jako počátek prvku a dopočte konec z PA/PR i mimo první prvek', () => {
    const parsed = ['G0 X0 Z0', 'G11 X10 Z0 PA90 PR15'].map(parseVkLine);
    const chain = buildTextChain(parsed);

    expect(chain[1].start).toEqual({ x: 10, z: 0 });
    expect(chain[1].end.x).toBeCloseTo(25, 9);
    expect(chain[1].end.z).toBeCloseTo(0, 9);
  });
});

// Regrese: `planTangentTransitions()` umí posunout konec předchozí úsečky
// na tečný dotyk s následujícím obloukem (`patchLineXZ()` přepíše X/Z).
// U komba X/Z+PA/PR ale X/Z znamená POČÁTEK, ne konec – kdyby ho appka
// přepsala na dotykový bod, omylem by posunula začátek úsečky a spolu
// s nezměněným PA/PR by z toho vyšla úplně jiná geometrie (najeto při
// psaní testu níž: konec úsečky by "utekl" o délku PR navíc).
describe('planTangentTransitions – kombo X/Z+PA/PR se tečným dotykem nesmí přepsat', () => {
  it('nechá kombo řádek beze změny místo posunutí jeho (chybně chápaného) konce', () => {
    const lines = ['G0 X10 Z0', 'G11 X10 Z0 PA180 PR40', 'G2 X20 Z-40 R10 T'];
    const plan = planTangentTransitions(lines);

    expect(plan.lines[1]).toBe('G11 X10 Z0 PA180 PR40');
    expect(plan.touches).toEqual([]);
  });
});

describe('planTangentTransitions / diffPreviewSegments – živý náhled tečnosti', () => {
  const chain = ['G0 X10 Z0', 'G11 X10 Z-40', 'G2 X20 Z-40 R10 T'];

  it('hlásí dotykové body vedle upravených řádků', () => {
    const plan = planTangentTransitions(chain);

    expect(plan.lines).toEqual(insertTangentTransitions(chain));   // stejný výstup
    expect(plan.touches).toHaveLength(1);
    expect(plan.touches[0].x).toBeCloseTo(10, 6);
    expect([-30, -50]).toContain(plan.touches[0].z);
  });

  it('bez tečné úpravy nehlásí žádný dotyk', () => {
    const plan = planTangentTransitions(['G0 X10 Z0', 'G11 X10 Z-40', 'G11 X20 Z-40']);

    expect(plan.touches).toEqual([]);
    expect(plan.lines).toEqual(['G0 X10 Z0', 'G11 X10 Z-40', 'G11 X20 Z-40']);
  });

  it('náhled ukáže jen to, co se posune – ne kopii celé kontury', () => {
    const base = buildVkPreviewData(chain);
    const hint = buildVkPreviewData(planTangentTransitions(chain).lines);
    const changed = diffPreviewSegments(hint.segments, base.segments);

    // Posune se konec válce a s ním začátek oblouku – ne celá kontura.
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.length).toBeLessThan(hint.segments.length);
    changed.forEach(seg => expect(seg.type).not.toBe('ray'));
  });

  it('shodné segmenty se do rozdílu nedostanou', () => {
    const base = buildVkPreviewData(chain);

    expect(diffPreviewSegments(base.segments, base.segments)).toEqual([]);
    expect(diffPreviewSegments(null, base.segments)).toEqual([]);
  });
});

describe('insertTangentTransitions – jednotky osy X', () => {
  const original = { xDisplayMode: state.xDisplayMode };
  afterEach(() => Object.assign(state, original));

  // Tečná geometrie musí počítat ve skutečné rovině (Z, poloměr). Dřív se jí
  // předhazovala čísla tak, jak jsou v textu, takže v režimu průměr byla osa X
  // 2× roztažená a dotykový bod vycházel jinde (u tohohle zadání to hlásilo
  // jediný degenerovaný dotyk přímo na Z-40 místo dvou správných).
  it('dotykový bod vyjde fyzicky stejně v režimu poloměr i průměr', () => {
    // Válcová plocha na poloměru 10 (konstrukční paprsek PA0) → tečný oblouk
    // R10 končící na poloměru 20 / Z-40. Střed oblouku musí ležet na poloměru
    // 20, takže dotyk je na Z-30 nebo Z-50 – nikdy na Z-40.
    state.xDisplayMode = 'radius';
    const inRadius = insertTangentTransitions(['G0 X10 Z0 PA0', 'G2 X20 Z-40 R10']);
    state.xDisplayMode = 'diameter';
    const inDiameter = insertTangentTransitions(['G0 X20 Z0 PA0', 'G2 X40 Z-40 R10']);

    expect(inRadius).toHaveLength(3);
    expect(inDiameter).toHaveLength(3);
    const [, rx, rz] = inRadius[1].match(/^G1 X(\S+) Z(\S+)$/);
    const [, dx, dz] = inDiameter[1].match(/^G1 X(\S+) Z(\S+)$/);

    // Dotyk zůstává na paprsku – v obou režimech týž poloměr, jen jinak zapsaný.
    expect(parseFloat(rx)).toBeCloseTo(10, 6);
    expect(parseFloat(dx)).toBeCloseTo(20, 6);
    // A hlavně: stejná geometrie, ne posunutá o faktor 2.
    expect(parseFloat(dz)).toBeCloseTo(parseFloat(rz), 6);
    expect([-30, -50]).toContain(parseFloat(rz));
  });
});

describe('vkToWorld / worldToVk', () => {
  const original = { machineType: state.machineType, xDisplayMode: state.xDisplayMode };
  afterEach(() => Object.assign(state, original));

  it('maps lathe axes: CNC Z vodorovně (wx), CNC X svisle (wy) jako poloměr', () => {
    state.machineType = 'soustruh';
    state.xDisplayMode = 'diameter';

    expect(vkToWorld({ x: 40, z: -12 })).toEqual([-12, 20]);
    expect(worldToVk(-12, 20)).toEqual({ x: 40, z: -12 });
  });

  it('maps carousel axes prohozeně (CNC X = wx)', () => {
    state.machineType = 'karusel';
    state.xDisplayMode = 'diameter';

    expect(vkToWorld({ x: 40, z: -12 })).toEqual([20, -12]);
    expect(worldToVk(20, -12)).toEqual({ x: 40, z: -12 });
  });

  it('nepřepočítává X v režimu poloměr', () => {
    state.machineType = 'soustruh';
    state.xDisplayMode = 'radius';

    expect(vkToWorld({ x: 20, z: 5 })).toEqual([5, 20]);
    expect(worldToVk(5, 20)).toEqual({ x: 20, z: 5 });
  });
});
