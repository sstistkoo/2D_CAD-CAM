// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Testy: VK režim kreslení (klik do výkresu → syntaxe) ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Vlastní obsluha kliku (`addPointFromCanvas` v initVkTab) je uzavřená
// nad DOM formuláře, takže se testují funkce, ze kterých je složená:
// worldToVk → vkElementCommand/vkChainHasElements → buildVkElementLine.
// Test tím pokrývá to podstatné – že klikáním vzniká syntaxe, ze které
// vyjde zpátky přesně naklikaná geometrie (jednotky osy X + prohození os).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { state } from '../js/state.js';
import {
  upsertVkVpolLine,
  worldToVk,
  vkElementCommand,
  vkChainHasElements,
  buildVkElementLine,
  dropLastVkElementLine,
  buildVkPreviewData,
  vkToWorld,
} from '../js/calculators/vkContour.js';

const original = {
  machineType: state.machineType,
  xDisplayMode: state.xDisplayMode,
};

beforeEach(() => {
  state.machineType = 'soustruh';
  state.xDisplayMode = 'diameter';
});

afterEach(() => {
  Object.assign(state, original);
});

/**
 * Simulace jednoho kliku do výkresu v režimu kreslení – stejné pořadí
 * kroků jako `addPointFromCanvas` + `insertElementFromForm`.
 * @param {string} code dosavadní VK syntaxe
 * @param {[number, number]} point world souřadnice kliku
 * @param {{type?: 'vl'|'vkr', dir?: 'G2'|'G3', r?: number, isT?: boolean}} [opts]
 */
function clickPoint(code, [wx, wy], opts = {}) {
  const { type = 'vl', dir = 'G2', r = 5, isT = false } = opts;
  const pt = worldToVk(wx, wy);
  const line = buildVkElementLine({
    cmd: vkElementCommand(type, !vkChainHasElements(code), dir),
    x: pt.x, z: pt.z,
    r, isArc: type === 'vkr',
    isT,
  });
  return code.trim() === '' ? line : `${code}\n${line}`;
}

describe('vkElementCommand', () => {
  it('první prvek řetězu je G0, další G11', () => {
    expect(vkElementCommand('vl', true, 'G2')).toBe('G0');
    expect(vkElementCommand('vl', false, 'G2')).toBe('G11');
  });

  it('oblouk nese směr bez ohledu na pozici v řetězu', () => {
    expect(vkElementCommand('vkr', true, 'G3')).toBe('G3');
    expect(vkElementCommand('vkr', false, 'G2')).toBe('G2');
  });

  it('VPOL je vždy G111', () => {
    expect(vkElementCommand('vpol', true, 'G2')).toBe('G111');
  });
});

describe('vkChainHasElements', () => {
  it('prázdná syntaxe ani samotný VPOL řetěz nezačínají', () => {
    expect(vkChainHasElements('')).toBe(false);
    expect(vkChainHasElements('G111 X0 Z40')).toBe(false);
  });

  it('geometrický prvek řetěz začíná – včetně G1 po konverzi na ISO', () => {
    expect(vkChainHasElements('G0 X10 Z0')).toBe(true);
    expect(vkChainHasElements('G111 X0 Z40\nG2 X10 Z-5 R3')).toBe(true);
    expect(vkChainHasElements('G1 X10 Z0')).toBe(true);
  });
});

describe('buildVkElementLine', () => {
  it('nezadané pole zapíše jako ?', () => {
    expect(buildVkElementLine({ cmd: 'G11', x: null, z: -12 })).toBe('G11 X? Z-12');
  });

  it('doplní PA/PR, R oblouku, VPOL tag i tečnost', () => {
    expect(buildVkElementLine({ cmd: 'G11', x: 20, z: -5, pa: 30, pr: '12' }))
      .toBe('G11 X20 Z-5 PA30 PR12');
    expect(buildVkElementLine({ cmd: 'G3', x: 20, z: -5, r: 4, isArc: true, isT: true }))
      .toBe('G3 X20 Z-5 R4 T');
    expect(buildVkElementLine({ cmd: 'G11', x: 20, z: -5, vpolTag: 'VPOL2' }))
      .toBe('G11 X20 Z-5 VPOL2');
  });

  it('nula je hodnota, ne prázdno', () => {
    expect(buildVkElementLine({ cmd: 'G0', x: 0, z: 0 })).toBe('G0 X0 Z0');
  });
});

describe('upsertVkVpolLine', () => {
  it('do prázdné syntaxe zapíše VPOL na první řádek', () => {
    expect(upsertVkVpolLine('', { x: 0, z: 40 })).toBe('G111 X0 Z40');
  });

  it('existující VPOL nahradí a zbytek kontury nechá být', () => {
    const code = 'G111 X0 Z10\nG0 X20 Z0';

    expect(upsertVkVpolLine(code, { x: 0, z: 40 })).toBe('G0 X20 Z0\nG111 X0 Z40');
  });
});

describe('dropLastVkElementLine (krok zpět ⌫ / ➖)', () => {
  it('odebere poslední prvek a vrátí jeho text', () => {
    const code = 'G0 X20 Z0\nG11 X20 Z-20\nG11 X30 Z-20';

    expect(dropLastVkElementLine(code)).toEqual({
      code: 'G0 X20 Z0\nG11 X20 Z-20',
      removed: 'G11 X30 Z-20',
    });
  });

  it('VPOL nechá být – není to prvek kontury', () => {
    const code = 'G111 X0 Z40\nG11 X20 Z-20';

    expect(dropLastVkElementLine(code)?.code).toBe('G111 X0 Z40');
    expect(dropLastVkElementLine('G111 X0 Z40')).toBeNull();
  });

  it('na prázdné syntaxi vrátí null', () => {
    expect(dropLastVkElementLine('')).toBeNull();
    expect(dropLastVkElementLine('( poznámka )')).toBeNull();
  });

  it('po odebrání všeho začíná další klik zase G0', () => {
    let code = 'G0 X20 Z0\nG11 X20 Z-20';
    code = dropLastVkElementLine(code).code;
    code = dropLastVkElementLine(code).code;

    expect(vkChainHasElements(code)).toBe(false);
    expect(vkElementCommand('vl', !vkChainHasElements(code), 'G2')).toBe('G0');
  });
});

describe('kreslení klikáním', () => {
  it('první klik dá G0, další G11', () => {
    let code = '';
    code = clickPoint(code, [0, 10]);
    code = clickPoint(code, [-20, 10]);
    code = clickPoint(code, [-20, 15]);

    expect(code.split('\n')).toEqual([
      'G0 X20 Z0',
      'G11 X20 Z-20',
      'G11 X30 Z-20',
    ]);
  });

  it('naklikané body vyjdou z náhledu zpátky na stejná world místa (soustruh, průměr)', () => {
    const points = [[0, 10], [-20, 10], [-20, 15]];
    const code = points.reduce((acc, pt) => clickPoint(acc, pt), '');

    const { segments } = buildVkPreviewData(code);
    const ends = segments.map(seg => vkToWorld(seg.end));
    expect(ends).toEqual(points);
  });

  it('karusel má prohozené osy – round trip drží i tam', () => {
    state.machineType = 'karusel';
    const points = [[10, 0], [10, -20], [15, -20]];
    const code = points.reduce((acc, pt) => clickPoint(acc, pt), '');

    expect(code.split('\n')[0]).toBe('G0 X20 Z0');
    const { segments } = buildVkPreviewData(code);
    expect(segments.map(seg => vkToWorld(seg.end))).toEqual(points);
  });

  it('v poloměrovém zobrazení se X nezdvojnásobuje', () => {
    state.xDisplayMode = 'radius';
    const code = clickPoint('', [0, 10]);

    expect(code).toBe('G0 X10 Z0');
    expect(vkToWorld(buildVkPreviewData(code).segments[0].end)).toEqual([0, 10]);
  });

  it('oblouk z kliku nese R i zvolený směr', () => {
    let code = clickPoint('', [0, 10]);
    code = clickPoint(code, [-8, 14], { type: 'vkr', dir: 'G3', r: 4, isT: true });

    expect(code.split('\n')[1]).toBe('G3 X28 Z-8 R4 T');
    const arc = buildVkPreviewData(code).segments[1];
    expect(arc).toMatchObject({ type: 'arc', direction: 'G3', radius: 4 });
  });
});
