// Testy čistých geometrických funkcí editoru tvaru držáku v CAM Geometrii
// (obdélník → přesun rohu na bod destičky + sražení rohu).
import { describe, it, expect, beforeAll } from 'vitest';
import { loadCamInternals } from './helpers/camInternals.mjs';
import { drawInsertAndHolderPreview } from '../js/calculators/cam/insertPreview.js';

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
    // Obdélník leží CELÝ na obrobené straně (x ∈ [0, hw]), ne vystředěný na
    // špičku — vystředěný byl do 25. 8. 2026 a půlkou trčel do materiálu.
    expect(Math.min(...xs)).toBeCloseTo(0);
    expect(Math.max(...xs)).toBeCloseTo(20); // hw
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
    // levý roh x=0 (u špičky), střed x=10, pravý roh x=20, vše na spodní hraně z=10
    expect(h[0].x).toBeCloseTo(0);
    expect(h[1].x).toBeCloseTo(10);
    expect(h[2].x).toBeCloseTo(20);
    expect(h.every(p => near(p.z, 10))).toBe(true);
  });
});

// Stub 2D kontextu s plnou maticí transformací — zaznamená body cest tak,
// jak by opravdu vyšly na obrazovce (včetně translate/rotate/scale).
function recordingCtx() {
  const paths = [];
  let m = [1, 0, 0, 1, 0, 0], stack = [], cur = null;
  const mul = (n) => {
    const [a, b, c, d, e, f] = m, [A, B, C, D, E, F] = n;
    m = [a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f];
  };
  const tp = (x, y) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
  const api = {
    beginPath() { cur = []; },
    moveTo(x, y) { if (cur) cur.push(tp(x, y)); },
    lineTo(x, y) { if (cur) cur.push(tp(x, y)); },
    arc(x, y, r, a0, a1) {
      if (!cur) return;
      cur.push(tp(x + r * Math.cos(a0), y + r * Math.sin(a0)));
      cur.push(tp(x + r * Math.cos(a1), y + r * Math.sin(a1)));
    },
    rect(x, y, w, h) { if (cur) [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].forEach(([a, b]) => cur.push(tp(a, b))); },
    closePath() {}, fill() { if (cur) paths.push(cur.slice()); }, stroke() { if (cur) paths.push(cur.slice()); },
    save() { stack.push(m.slice()); }, restore() { if (stack.length) m = stack.pop(); },
    translate(x, y) { mul([1, 0, 0, 1, x, y]); },
    rotate(a) { mul([Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]); },
    scale(x, y) { mul([x, 0, 0, y, 0, 0]); },
    measureText: () => ({ width: 0 }),
    paths,
  };
  return new Proxy(api, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => (t[k] = v, true) });
}

describe('náhled Geometrie: držák sedí na hranu destičky', () => {
  it('konce nakresleného obrysu leží PŘESNĚ na horních rozích upichováku', () => {
    // Regrese 27. 8. 2026: destička se kreslila s pixelovými PODLAHAMI
    // (R ≥ 2,5 px, šířka ≥ 8 px), kdežto vlastní obrys držáku v pravém
    // měřítku — při oddálení se plátek nafoukl a nakreslený držák pak
    // začínal UVNITŘ něj, ne na jeho hraně (naměřeno 1,6–1,8 px).
    // b = 5, R = 0,8 → tělo plátku má vrch v z = 15, boky v x = −0,8 a 4,2.
    const prms = {
      toolShape: 'parting', toolLength: 5, toolRadius: 0.8, toolAngle: 0,
      holderWidth: 20, holderLength: 200, holderHand: 'R', knifeAngle: 270,
      holderProfile: { sideA: [
        { x: 4.2, z: 15 }, { x: 21.9, z: 32.7 }, { x: 21.9, z: 212.8 },
        { x: -0.8, z: 212.8 }, { x: -0.8, z: 15 },
      ], sideB: [] },
    };
    const ctx = recordingCtx();
    drawInsertAndHolderPreview(ctx, 600, 300, prms, {});
    const holder = ctx.paths.find(p => p.length === prms.holderProfile.sideA.length);
    expect(holder).toBeTruthy();
    const insert = ctx.paths.reduce((best, p) => (p !== holder && p.length > (best ? best.length : 0) ? p : best), null);
    expect(insert).toBeTruthy();
    const topY = Math.min(...insert.map(p => p.y));
    const corners = insert.filter(p => Math.abs(p.y - topY) < 0.5);
    const gap = (h) => Math.min(...corners.map(c => Math.hypot(c.x - h.x, c.y - h.y)));
    expect(gap(holder[0])).toBeLessThan(0.01);
    expect(gap(holder[holder.length - 1])).toBeLessThan(0.01);
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
    // levý spodní roh je (0, 10) — obdélník leží celý na obrobené straně
    const out = M.chamferProfileCorner(prof, { x: 0, z: 10 }, 4);
    // původně 5 bodů (uzavřený) → 4 vrcholy; po sražení 5 vrcholů + uzavření = 6
    expect(out.length).toBe(6);
    expect(near(out[0].x, out[out.length - 1].x) && near(out[0].z, out[out.length - 1].z)).toBe(true);
    // žádný bod už není přesně v původním rohu (0,10)
    expect(out.some(p => near(p.x, 0) && near(p.z, 10))).toBe(false);
    // dva nové body leží 4 mm od rohu podél hran
    const p1 = out.find(p => near(p.x, 0) && near(p.z, 14));  // podél svislé hrany nahoru
    const p2 = out.find(p => near(p.x, 4) && near(p.z, 10));  // podél spodní hrany doprava
    expect(p1).toBeTruthy();
    expect(p2).toBeTruthy();
  });

  it('nesymetrický úhel dopočte druhou nohu ze sinové věty (dN = dP·tan β pro pravý úhel)', () => {
    const prof = M.holderRectProfile({ holderWidth: 20, holderLength: 40, toolLength: 10, toolRadius: 0.8 });
    // levý spodní roh (0,10), dist=4 podél svislé hrany, úhel 30°
    const out = M.chamferProfileCorner(prof, { x: 0, z: 10 }, 4, 30);
    // první noha (svislá) = 4 → bod (0,14)
    expect(out.some(p => near(p.x, 0) && near(p.z, 14))).toBe(true);
    // druhá noha (vodorovná) = 4·tan(30°) = 2.309 → bod (2.31,10)
    const p2 = out.find(p => near(p.z, 10) && p.x > 1e-3);
    expect(p2).toBeTruthy();
    expect(p2.x).toBeCloseTo(4 * Math.tan(30 * Math.PI / 180), 3);
  });

  it('úhel 45° zůstává symetrický (default nezměněn)', () => {
    const prof = M.holderRectProfile({ holderWidth: 20, holderLength: 40, toolLength: 10, toolRadius: 0.8 });
    const a = M.chamferProfileCorner(prof, { x: 20, z: 10 }, 3);        // default 45
    const b = M.chamferProfileCorner(prof, { x: 20, z: 10 }, 3, 45);    // explicitně 45
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
