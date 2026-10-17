// ╔══════════════════════════════════════════════════════════════╗
// ║  ◎ Bokorys (pohled na čelo) v CAD + převod do CAM             ║
// ╚══════════════════════════════════════════════════════════════╝
// Kresba čela = vrstva s příznakem isFace a středem `origin` VEDLE profilu.
// Do profilu (CAM, kontrola kontury) nepatří; do CAM jde v souřadnicích vůči
// středu čela přes 📥 Z CAD.
import { describe, it, expect, beforeEach } from 'vitest';
import { state } from '../js/state.js';
import { getFaceLayer, faceViewOn, isFaceObject, profileObjects, faceObjectsLocal, faceDrawingsLocal } from '../js/faceView/faceLayer.js';
import { profileRadii, profileBounds, computeFaceOrigin, profileAtZ, shoulderZs, viewRadii, cutHit } from '../js/faceView/faceReference.js';
import { liveOpsFromCad, detectPcd } from '../js/calculators/cam/live/liveFromCad.js';
import { livePositions } from '../js/calculators/cam/live/liveModel.js';

const profile = [
  { id: 1, layer: 0, type: 'line', x1: 0, y1: 40, x2: -50, y2: 40 },
  { id: 2, layer: 0, type: 'line', x1: -50, y1: 40, x2: -50, y2: 15 },
  { id: 3, layer: 0, type: 'line', x1: -50, y1: 15, x2: 0, y2: 15 },
  { id: 4, layer: 3, type: 'line', x1: 2, y1: 50, x2: -60, y2: 50, isStock: true },
];

beforeEach(() => {
  state.layers = [{ id: 0, name: 'Kontura', visible: true }, { id: 3, name: 'Polotovar', visible: true },
    { id: 7, name: 'Čelo (bokorys)', visible: true, isFace: true, origin: { x: 100, y: 0 } }];
  state.objects = [...profile.map(o => ({ ...o })),
    { id: 10, layer: 7, type: 'circle', cx: 130, cy: 0, r: 4 },
    { id: 11, layer: 7, type: 'line', x1: 90, y1: -38, x2: 110, y2: -38 }];
  state.machineType = 'soustruh';
});

describe('vrstva Čelo', () => {
  it('pozná vrstvu, zapnutí a příslušnost objektů', () => {
    expect(getFaceLayer().id).toBe(7);
    expect(faceViewOn()).toBe(true);
    expect(isFaceObject(state.objects[4])).toBe(true);
    expect(isFaceObject(state.objects[0])).toBe(false);
    state.layers[2].visible = false;
    expect(faceViewOn()).toBe(false);
  });
  it('profil = vše kromě vrstvy Čelo', () => {
    expect(profileObjects().map(o => o.id)).toEqual([1, 2, 3, 4]);
  });
  it('kresba čela vůči středu čela, výkres beze změny', () => {
    const loc = faceObjectsLocal();
    expect(loc[0]).toMatchObject({ cx: 30, cy: 0, r: 4 });
    expect(loc[1]).toMatchObject({ x1: -10, y1: -38, x2: 10, y2: -38 });
    expect(state.objects[4].cx).toBe(130);
  });
  it('bez vrstvy Čelo nic nevyřazuje', () => {
    state.layers = state.layers.slice(0, 2);
    expect(profileObjects()).toBe(state.objects);
    expect(faceObjectsLocal()).toEqual([]);
  });
});

describe('podklad a rozmístění', () => {
  it('poloměry z profilu: soustruh = |y|, polotovar z isStock, vývrt', () => {
    const g = profileRadii(profile, 'soustruh');
    expect([g.outerR, g.stockR, g.innerR]).toEqual([40, 50, 15]);
    expect(profileRadii(profile, 'karusel').outerR).toBe(50);
  });
  it('oblouk po směru hodin (ccw: false) se nevzorkuje z opačné strany', () => {
    // Zaoblení R10 se středem (−10, 30), po směru hodin z 90° na 0° = pravá horní
    // čtvrtina (y ≥ 30, x ≥ −10). Opačná strana (tři čtvrtiny) by sahala do y = 20.
    const arc = { type: 'arc', cx: -10, cy: 30, r: 10, startAngle: Math.PI / 2, endAngle: 0, ccw: false };
    expect(profileRadii([arc], 'soustruh').outerR).toBeCloseTo(40, 6);
    const ys = profileBounds([arc]);
    expect(ys.minY).toBeCloseTo(30, 6);
    expect(ys.minX).toBeCloseTo(-10, 6);
  });
  it('bokorys vpravo na ose vřetena, za kótami profilu, střed na desítky', () => {
    const dim = { type: 'line', isDimension: true, x1: -50, y1: 120, x2: 30, y2: 120 };
    const plain = computeFaceOrigin(profile, 'soustruh');
    const withDim = computeFaceOrigin([...profile, dim], 'soustruh');
    expect(plain.placement).toBe('right');
    expect(plain.origin.y).toBe(0);
    expect(plain.origin.x - plain.R).toBeGreaterThan(profileBounds(profile).maxX);
    expect(plain.origin.x % 10).toBe(0);
    expect(withDim.origin.x - withDim.R).toBeGreaterThan(30);
  });
  it('karusel: vpravo, svisle uprostřed profilu', () => {
    const car = [{ type: 'line', x1: 40, y1: 0, x2: 40, y2: -60 }];
    const lay = computeFaceOrigin(car, 'karusel');
    expect(lay.origin.y).toBe(-30);
    expect(lay.origin.x).toBeGreaterThan(40);
  });
  it('profil v rovině čela: průměry, vývrt a strana osazení', () => {
    const mid = profileAtZ(profile, 'soustruh', -25);
    expect([mid.outerR, mid.innerR, mid.stockR]).toEqual([40, 15, 50]);
    expect(mid.side).toBe(null);
    expect(profileAtZ(profile, 'soustruh', 0).side).toBe('right');    // pravý konec
    expect(profileAtZ(profile, 'soustruh', -50).side).toBe('left');   // levý konec
  });
  it('bokorys jako na výkresu: vidět je řez a to, co leží za ním ve směru pohledu', () => {
    // Profil: Ø80 (Z −50…0), vývrt Ø30. Navíc osazení Ø100 vlevo (Z −90…−50).
    const step = [...profile, { type: 'line', layer: 0, x1: -50, y1: 40, x2: -50, y2: 50 },
      { type: 'line', layer: 0, x1: -50, y1: 50, x2: -90, y2: 50 }];
    const z = -25;
    const at = profileAtZ(step, 'soustruh', z);
    const right = viewRadii(step, 'soustruh', z, 'right', at);   // díváme se doleva → vidět Ø100
    expect(right.visible).toEqual([15, 40, 50]);
    const left = viewRadii(step, 'soustruh', z, 'left', at);     // díváme se doprava → Ø100 je za zády
    expect(left.visible).toEqual([15, 40]);
  });
  it('skryté hrany: zakryté materiálem mezi hranou a řezem jsou čárkovaně', () => {
    // Hřídel Ø40 (Z 0…60), osazení Ø90 (60…140), Ø60 (140…220).
    const shaft = [
      { type: 'line', x1: 0, y1: 0, x2: 0, y2: 20 }, { type: 'line', x1: 0, y1: 20, x2: 60, y2: 20 },
      { type: 'line', x1: 60, y1: 20, x2: 60, y2: 45 }, { type: 'line', x1: 60, y1: 45, x2: 140, y2: 45 },
      { type: 'line', x1: 140, y1: 45, x2: 140, y2: 30 }, { type: 'line', x1: 140, y1: 30, x2: 220, y2: 30 },
      { type: 'line', x1: 220, y1: 30, x2: 220, y2: 0 },
    ];
    const at = profileAtZ(shaft, 'soustruh', 180);
    const v = viewRadii(shaft, 'soustruh', 180, 'right', at);
    expect(v.visible).toEqual([30, 45]);   // řez Ø60, za ním osazení Ø90
    expect(v.hidden).toEqual([20]);        // hřídel Ø40 schovaná za osazením Ø90
  });
  it('zásah značky řezu: čára, šipky na koncích, tolerance myš × prst', () => {
    // Řez v Z = 100: svislá čára od y −50 do +50, měřítko 2 px/mm, počátek v (0, 0).
    const w2s = (x, y) => [x * 2, -y * 2];
    const cut = { z: 100, isCar: false, a: [100, -50], b: [100, 50] };
    expect(cutHit(cut, w2s, 200, 0, 8)).toBe(true);        // na čáře
    expect(cutHit(cut, w2s, 207, 30, 8)).toBe(true);       // 7 px vedle
    expect(cutHit(cut, w2s, 212, 0, 8)).toBe(false);       // 12 px — myš už ne
    expect(cutHit(cut, w2s, 212, 0, 22)).toBe(true);       // prst ano
    expect(cutHit(cut, w2s, 200, 108, 8)).toBe(true);      // šipky za koncem (pad 12)
    expect(cutHit(cut, w2s, 200, 130, 8)).toBe(false);     // daleko za koncem
    expect(cutHit(null, w2s, 200, 0, 8)).toBe(false);      // bez bokorysu nic
  });
  it('osazení a krajní Z pro posuvník', () => {
    const step = [...profile, { type: 'line', layer: 0, x1: -20, y1: 40, x2: -20, y2: 25 }];
    const sh = shoulderZs(step, 'soustruh');
    expect(sh.zs).toEqual([-50, -20, 0]);
    expect([sh.min, sh.max]).toEqual([-50, 0]);
  });
});

describe('převod do CAM', () => {
  const geo = { faceZ: 0, outerD: 100 };
  it('pravidelné rozmístění se pozná jako rozteč', () => {
    expect(detectPcd([{ a: 30, r: 20 }, { a: 150, r: 20 }, { a: 270, r: 20 }])).toEqual({ pcd: 40, count: 3, startAngle: 30 });
    expect(detectPcd([{ a: 0, r: 20 }, { a: 100, r: 20 }])).toBe(null);
  });
  it('kružnice stejného Ø = jedna operace, úsečka = drážka', () => {
    const objs = [
      ...[0, 90, 180, 270].map(a => ({ type: 'circle', r: 4, cx: 30 * Math.cos(a * Math.PI / 180), cy: 30 * Math.sin(a * Math.PI / 180) })),
      { type: 'circle', cx: 10, cy: 10, r: 3 },
      { type: 'line', x1: -20, y1: 0, x2: 20, y2: 0 },
      { type: 'arc', cx: 0, cy: 0, r: 5, startAngle: 0, endAngle: 1 },
      { type: 'line', x1: 0, y1: 0, x2: 5, y2: 0, isDimension: true },
    ];
    const res = liveOpsFromCad(objs, geo, []);
    expect([res.holes, res.slots, res.skipped]).toEqual([5, 1, 1]);
    const d8 = res.ops.find(o => o.holeD === 8);
    expect([d8.pattern, d8.pcd, d8.count, d8.startAngle]).toEqual(['pcd', 60, 4, 0]);
    const p = livePositions(res.ops.find(o => o.holeD === 6))[0];
    expect(p.x).toBeCloseTo(10, 3);
    expect(p.y).toBeCloseTo(10, 3);
    expect(res.ops.find(o => o.millType === 'slot').slot).toEqual({ x1: -20, y1: 0, x2: 20, y2: 0 });
  });
  it('z výkresu: díra vůči středu čela', () => {
    const res = liveOpsFromCad(faceObjectsLocal(), geo, []);
    const op = res.ops.find(o => o.kind === 'drill');
    expect(livePositions(op)[0]).toMatchObject({ a: 0, r: 30 });
  });
  it('víc čel: každé se svým Z a stranou, skryté čelo se nechytá do profilu', () => {
    state.layers.push({ id: 8, name: 'Čelo Z-50 ▶', visible: false, isFace: true, faceZ: -50, faceSide: 'left', origin: { x: 100, y: 0 } });
    state.layers[2].faceZ = 0; state.layers[2].faceSide = 'right'; state.layers[2].faceCurrent = true;
    state.objects.push({ id: 12, layer: 8, type: 'circle', cx: 100, cy: 20, r: 3 });
    expect(profileObjects().map(o => o.id)).toEqual([1, 2, 3, 4]);
    const faces = faceDrawingsLocal();
    expect(faces.map(f => [f.z, f.side, f.objects.length])).toEqual([[0, 'right', 2], [-50, 'left', 1]]);
    const res = liveOpsFromCad(faces, geo, []);
    const left = res.ops.find(o => o.holeD === 6);
    expect([left.zTop, left.faceDir]).toEqual([-50, -1]);
    expect(left.name).toContain('Z-50 ▶');   // šipka = směr pohledu (zleva → doprava)
    expect(res.ops.find(o => o.holeD === 8).faceDir).toBe(1);
  });
  it('opakované načtení: ruční operace zůstanou, hloubka a nástroj se převezmou', () => {
    const objs = [{ type: 'circle', cx: 30, cy: 0, r: 4 }];
    const first = liveOpsFromCad(objs, geo, []).ops;
    first[0].depth = 25; first[0].toolName = 'VRTAK_X';
    const manual = { ...first[0], fromCad: false, name: 'ruční' };
    const again = liveOpsFromCad([...objs, { type: 'circle', cx: -30, cy: 0, r: 4 }], geo, [manual, first[0]]);
    expect(again.ops[0].name).toBe('ruční');
    const imp = again.ops.filter(o => o.fromCad);
    expect(imp).toHaveLength(1);
    expect([imp[0].depth, imp[0].toolName, imp[0].pattern]).toEqual([25, 'VRTAK_X', 'pcd']);
  });
});
