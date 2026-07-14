// Testy čistých geometrických funkcí editoru tvaru držáku v CAM Geometrii
// (obdélník → přesun rohu na bod destičky + sražení rohu).
import { describe, it, expect, beforeAll } from 'vitest';
import { loadCamInternals } from './helpers/camInternals.mjs';

let M;
beforeAll(async () => { M = await loadCamInternals(); });

const near = (a, b, t = 1e-6) => Math.abs(a - b) <= t;

describe('holderRectProfile', () => {
  it('vytvoří uzavřený obdélník šířky holderWidth × délky holderLength nad destičkou', () => {
    const p = M.holderRectProfile({ holderWidth: 20, holderLength: 200, toolLength: 10, toolRadius: 0.8 });
    expect(p.length).toBe(5); // 4 rohy + uzavírací duplikát
    // uzavřený
    expect(near(p[0].x, p[4].x) && near(p[0].z, p[4].z)).toBe(true);
    const xs = p.map(q => q.x), zs = p.map(q => q.z);
    expect(Math.min(...xs)).toBeCloseTo(-10); // -hw/2
    expect(Math.max(...xs)).toBeCloseTo(10);
    // spodní hrana NAD destičkou (z0 = max(toolLen, r, 4) = 10), ne na 0
    expect(Math.min(...zs)).toBeCloseTo(10);
    expect(Math.max(...zs)).toBeCloseTo(210); // z0 + l1
  });
});

describe('holderBottomHandles', () => {
  it('vrátí 3 body spodní hrany: levý roh, střed, pravý roh', () => {
    const prof = M.holderRectProfile({ holderWidth: 20, holderLength: 200, toolLength: 10, toolRadius: 0.8 });
    const h = M.holderBottomHandles(prof);
    expect(h.length).toBe(3);
    expect(h[0].role).toBe('corner');
    expect(h[1].role).toBe('mid');
    expect(h[2].role).toBe('corner');
    // levý roh x=-10, střed x=0, pravý roh x=10, všechny na spodní hraně z=10
    expect(h[0].x).toBeCloseTo(-10);
    expect(h[1].x).toBeCloseTo(0);
    expect(h[2].x).toBeCloseTo(10);
    expect(h.every(p => near(p.z, 10))).toBe(true);
  });
});

describe('translateHolderProfile', () => {
  it('posune všechny body obou stran o (dx,dz)', () => {
    const prof = { sideA: [{ x: -10, z: 10 }, { x: 10, z: 10 }], sideB: [{ x: 0, z: 5 }] };
    const out = M.translateHolderProfile(prof, 10, -10);
    expect(out.sideA[0]).toEqual({ x: 0, z: 0 });   // levý spodní roh → střed R (0,0)
    expect(out.sideA[1]).toEqual({ x: 20, z: 0 });
    expect(out.sideB[0]).toEqual({ x: 10, z: -5 });
  });
});

describe('chamferProfileCorner', () => {
  it('nahradí roh dvěma body (sražení) a zachová uzavřenost', () => {
    const prof = M.holderRectProfile({ holderWidth: 20, holderLength: 40, toolLength: 10, toolRadius: 0.8 });
    // levý spodní roh je (-10, 10)
    const out = M.chamferProfileCorner(prof, { x: -10, z: 10 }, 4);
    // původně 5 bodů (uzavřený) → 4 vrcholy; po sražení 5 vrcholů + uzavření = 6
    expect(out.length).toBe(6);
    expect(near(out[0].x, out[out.length - 1].x) && near(out[0].z, out[out.length - 1].z)).toBe(true);
    // žádný bod už není přesně v původním rohu (-10,10)
    expect(out.some(p => near(p.x, -10) && near(p.z, 10))).toBe(false);
    // dva nové body leží 4 mm od rohu podél hran
    const p1 = out.find(p => near(p.x, -10) && near(p.z, 14)); // podél svislé hrany nahoru
    const p2 = out.find(p => near(p.x, -6) && near(p.z, 10));  // podél spodní hrany doprava
    expect(p1).toBeTruthy();
    expect(p2).toBeTruthy();
  });

  it('nesymetrický úhel dopočte druhou nohu ze sinové věty (dN = dP·tan β pro pravý úhel)', () => {
    const prof = M.holderRectProfile({ holderWidth: 20, holderLength: 40, toolLength: 10, toolRadius: 0.8 });
    // levý spodní roh (-10,10), dist=4 podél svislé hrany, úhel 30°
    const out = M.chamferProfileCorner(prof, { x: -10, z: 10 }, 4, 30);
    // první noha (svislá) = 4 → bod (-10,14)
    expect(out.some(p => near(p.x, -10) && near(p.z, 14))).toBe(true);
    // druhá noha (vodorovná) = 4·tan(30°) = 2.309 → bod (-7.69,10)
    const p2 = out.find(p => near(p.z, 10) && p.x > -10 + 1e-3);
    expect(p2).toBeTruthy();
    expect(p2.x).toBeCloseTo(-10 + 4 * Math.tan(30 * Math.PI / 180), 3);
  });

  it('úhel 45° zůstává symetrický (default nezměněn)', () => {
    const prof = M.holderRectProfile({ holderWidth: 20, holderLength: 40, toolLength: 10, toolRadius: 0.8 });
    const a = M.chamferProfileCorner(prof, { x: 10, z: 10 }, 3);        // default 45
    const b = M.chamferProfileCorner(prof, { x: 10, z: 10 }, 3, 45);    // explicitně 45
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('getInsertAnchorPoints obsahuje Střed R', () => {
  it('přidá bod (0,0) side=center pro kulatou i čtyřstrannou destičku', () => {
    for (const shape of ['round', 'polygon']) {
      const pts = M.getInsertAnchorPoints({ toolShape: shape, toolRadius: 0.8, toolLength: 10, toolAngle: 0, toolTipAngle: 90 });
      const center = pts.find(p => p.side === 'center');
      expect(center).toBeTruthy();
      expect(near(center.x, 0) && near(center.z, 0)).toBe(true);
    }
  });
});
