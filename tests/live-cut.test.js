// Řez v rovině Z pro Pohled na čelo v CAM (cam/live/liveCut.js) a plocha
// řezu sdílená s bokorysem v CAD (faceView/faceReference.js → sectionAt).
import { describe, it, expect } from 'vitest';
import { pointsToChains, liveProfile, liveCutAt, autoSide, snapZ } from '../js/calculators/cam/live/liveCut.js';
import { sectionAt, objectPoints } from '../js/faceView/faceReference.js';
import { defaultNav, isDefaultNav, zoomAt } from '../js/calculators/cam/live/liveFaceNav.js';

// Odstupňovaný hřídel v průměrech (DIAMON): Ø40 (Z 0…−30), Ø70 (−30…−60), Ø100 (−60…−100).
const shaftPts = [
  { x: 0, z: 0, type: 'G0' }, { x: 40, z: 0, type: 'G1' }, { x: 40, z: -30, type: 'G1' },
  { x: 70, z: -30, type: 'G1' }, { x: 70, z: -60, type: 'G1' }, { x: 100, z: -60, type: 'G1' },
  { x: 100, z: -100, type: 'G1' },
];
const S = pts => ({ params: { mode: 'DIAMON', stockMode: 'cylinder', stockDiameter: 110 }, contourPoints: pts, stockPoints: [] });

describe('kontura CAM → lomené čáry (x = Z, y = poloměr)', () => {
  it('průměry se půlí, G0 začne novou čáru', () => {
    const ch = pointsToChains([...shaftPts, { x: 20, z: -120, type: 'G0' }, { x: 20, z: -140, type: 'G1' }], 0.5);
    expect(ch.length).toBe(2);
    expect(ch[0].vertices[1]).toEqual({ x: 0, y: 20 });
    expect(ch[0].vertices.at(-1)).toEqual({ x: -100, y: 50 });
    expect(ch[1].vertices).toEqual([{ x: -120, y: 10 }, { x: -140, y: 10 }]);
  });
  it('oblouk = objekt arc ve směru G2 (zaoblení hrany R5 leží mezi koncovými poloměry)', () => {
    const pts = [{ x: 0, z: 0, type: 'G0' }, { x: 30, z: 0, type: 'G1' }, { x: 35, z: -5, type: 'G2', r: 5 },
      { x: 35, z: -20, type: 'G1' }];
    const objs = pointsToChains(pts, 1);
    expect(objs.map(o => o.type)).toEqual(['polyline', 'arc', 'polyline']);
    expect(objs[1]).toMatchObject({ r: 5, ccw: false });
    expect(objs[2].vertices).toEqual([{ x: -5, y: 35 }, { x: -20, y: 35 }]);
    const v = objectPoints(objs[1]);
    v.forEach(p => {
      expect(p.y).toBeGreaterThanOrEqual(30 - 1e-6);
      expect(p.y).toBeLessThanOrEqual(35 + 1e-6);
      expect(p.x).toBeLessThanOrEqual(1e-6);
      expect(p.x).toBeGreaterThanOrEqual(-5 - 1e-6);
    });
    expect(v.at(-1).x).toBeCloseTo(-5, 6);
    expect(v.at(-1).y).toBeCloseTo(35, 6);
  });
  it('profil: osazení pro posuvník, válcový polotovar se nepřidává', () => {
    const prof = liveProfile(S(shaftPts));
    expect(prof.empty).toBe(false);
    expect(prof.objects.every(o => !o.isStock)).toBe(true);
    expect([prof.min, prof.max]).toEqual([-100, 0]);
    expect(prof.zs).toEqual([-100, -60, -30, 0]);
  });
});

describe('řez v rovině Z', () => {
  const prof = liveProfile(S(shaftPts));
  it('v rovině osazení je plocha řezu celý větší průměr — žádný falešný vývrt', () => {
    const c = liveCutAt(prof, -30, 'right');
    expect([c.at.outerR, c.at.innerR]).toEqual([35, 0]);
    expect(c.view.visible).toContain(50);   // za řezem osazení Ø100
    // Zleva (díváme se k +Z) je za rovinou tenčí Ø40.
    expect(liveCutAt(prof, -30, 'left').at.outerR).toBe(20);
  });
  it('strana podle osazení: menší průměr vpravo → zprava', () => {
    expect(autoSide(prof, -30)).toBe('right');
    expect(autoSide(prof, -45)).toBe('right');            // uprostřed válce → výchozí
    expect(autoSide(prof, -45, 'left')).toBe('left');
  });
  it('skutečný vývrt zůstane', () => {
    // Pouzdro: Ø80 venku, vývrt Ø30, Z 0…−50 (uzavřený obrys).
    const bush = [
      { x: 30, z: 0, type: 'G0' }, { x: 80, z: 0, type: 'G1' }, { x: 80, z: -50, type: 'G1' },
      { x: 30, z: -50, type: 'G1' }, { x: 30, z: 0, type: 'G1' },
    ];
    const c = liveCutAt(liveProfile(S(bush)), -25, 'right');
    expect([c.at.outerR, c.at.innerR]).toEqual([40, 15]);
  });
  it('bokorys v CAD: sectionAt na objektech výkresu', () => {
    const shaft = [
      { type: 'line', x1: 0, y1: 0, x2: 0, y2: 20 }, { type: 'line', x1: 0, y1: 20, x2: 60, y2: 20 },
      { type: 'line', x1: 60, y1: 20, x2: 60, y2: 45 }, { type: 'line', x1: 60, y1: 45, x2: 140, y2: 45 },
    ];
    expect(sectionAt(shaft, 'soustruh', 60, 'right')).toEqual({ outerR: 20, innerR: 0 });
    expect(sectionAt(shaft, 'soustruh', 60, 'left')).toEqual({ outerR: 45, innerR: 0 });
    expect(sectionAt(shaft, 'soustruh', 200, 'right')).toEqual({ outerR: 0, innerR: 0 });
  });
  it('posuvník se přichytí k nejbližší značce v toleranci', () => {
    expect(snapZ(-29.6, [-60, -30, 0], 0.5)).toBe(-30);
    expect(snapZ(-28, [-60, -30, 0], 0.5)).toBe(-28);
  });
});

describe('zoom a posun pohledu na čelo', () => {
  it('bod pod kurzorem zůstane na místě, zoom má meze', () => {
    const n = defaultNav();
    const w = 400, h = 300, mx = 300, my = 100;
    // Světový bod pod kurzorem: (mx − střed) / zoom.
    const world = nv => [(mx - (w / 2 + nv.panX)) / nv.zoom, (my - (h / 2 + nv.panY)) / nv.zoom];
    const before = world(n);
    zoomAt(n, 1.15, mx, my, w, h);
    zoomAt(n, 1.15, mx, my, w, h);
    const after = world(n);
    expect(after[0]).toBeCloseTo(before[0], 9);
    expect(after[1]).toBeCloseTo(before[1], 9);
    expect(isDefaultNav(n)).toBe(false);
    for (let i = 0; i < 100; i++) zoomAt(n, 2, mx, my, w, h);
    expect(n.zoom).toBe(40);
  });
});
