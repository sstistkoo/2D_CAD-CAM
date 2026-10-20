// Kontroly operací poháněných nástrojů proti tvaru dílu (cam/live/liveChecks.js):
// díra v materiálu čela, hloubka (skrz / vývrt), Ø pláště radiální díry,
// bezpečná vzdálenost a odjezd proti osazení.
import { describe, it, expect } from 'vitest';
import { checkLiveOp, checkLiveOps } from '../js/calculators/cam/live/liveChecks.js';
import { liveProfile } from '../js/calculators/cam/live/liveCut.js';
import { newLiveOp, normalizeLiveOp } from '../js/calculators/cam/live/liveModel.js';
import { materialAt } from '../js/faceView/faceReference.js';

const S = pts => ({ params: { mode: 'DIAMON', stockMode: 'cylinder', stockDiameter: 110 }, contourPoints: pts, stockPoints: [] });
// Odstupňovaný hřídel (průměry): Ø40 (Z 0…−30), Ø70 (−30…−60), Ø100 (−60…−100).
const shaft = liveProfile(S([
  { x: 0, z: 0, type: 'G0' }, { x: 40, z: 0, type: 'G1' }, { x: 40, z: -30, type: 'G1' },
  { x: 70, z: -30, type: 'G1' }, { x: 70, z: -60, type: 'G1' }, { x: 100, z: -60, type: 'G1' },
  { x: 100, z: -100, type: 'G1' },
]));
// Pouzdro: Ø100 venku, vývrt Ø40 (Z 0…−20) a Ø60 (−20…−50), uzavřený obrys.
const bush = liveProfile(S([
  { x: 40, z: 0, type: 'G0' }, { x: 100, z: 0, type: 'G1' }, { x: 100, z: -50, type: 'G1' },
  { x: 60, z: -50, type: 'G1' }, { x: 60, z: -20, type: 'G1' }, { x: 40, z: -20, type: 'G1' }, { x: 40, z: 0, type: 'G1' },
]));
// Hřídel s nákružkem: Ø40 (0…−20), nákružek Ø80 (−20…−23), Ø60 (−23…−26), Ø100 (−26…−60).
const collar = liveProfile(S([
  { x: 0, z: 0, type: 'G0' }, { x: 40, z: 0, type: 'G1' }, { x: 40, z: -20, type: 'G1' },
  { x: 80, z: -20, type: 'G1' }, { x: 80, z: -23, type: 'G1' }, { x: 60, z: -23, type: 'G1' },
  { x: 60, z: -26, type: 'G1' }, { x: 100, z: -26, type: 'G1' }, { x: 100, z: -60, type: 'G1' },
]));

const drill = o => normalizeLiveOp({ ...newLiveOp('drill'), safe: 2, retract: 5, ...o });
const face = o => drill({ side: 'face', pattern: 'pcd', count: 4, startAngle: 0, faceDir: 1, ...o });
const radial = o => drill({ side: 'radial', pattern: 'pcd', count: 4, startAngle: 0, ...o });
const texts = r => r.issues.map(x => `${x.sev}: ${x.text}`);

describe('materiál v rovině Z (faceReference.materialAt)', () => {
  it('hřídel od osy, pouzdro jako mezikruží', () => {
    expect(materialAt(shaft.objects, 'soustruh', -45)).toEqual([[0, 35]]);
    expect(materialAt(bush.objects, 'soustruh', -10)).toEqual([[20, 50]]);
    expect(materialAt(bush.objects, 'soustruh', -30)).toEqual([[30, 50]]);
    expect(materialAt(shaft.objects, 'soustruh', 5)).toEqual([]);
  });
});

describe('odstupňovaný hřídel', () => {
  it('díry v čele a na osazení v pořádku', () => {
    expect(texts(checkLiveOp(shaft, face({ zTop: 0, pcd: 24, holeD: 8, depth: 10 })))).toEqual([]);
    // Osazení Z−30 zprava: mezikruží r 20…35, díra r 27,5 ± 3.
    expect(texts(checkLiveOp(shaft, face({ zTop: -30, pcd: 55, holeD: 6, depth: 10 })))).toEqual([]);
  });
  it('díra na osazení zasahuje do menšího průměru nad čelem', () => {
    const r = checkLiveOp(shaft, face({ zTop: -30, pcd: 44, holeD: 8, depth: 10 }));
    expect(texts(r)).toEqual(['error: Díry 1–4: zásah do osazení Ø40 nad čelem Z-30.']);
    expect(r.sev).toBe('error');
    expect([...r.marks.keys()]).toEqual([0, 1, 2, 3]);
  });
  it('odjezd a bezpečná vzdálenost narazí do nákružku', () => {
    const op = { zTop: -26, pcd: 70, holeD: 6, depth: 5, count: 1 };
    expect(texts(checkLiveOp(collar, face(op))))
      .toEqual(['error: Díra 1: odjezd 5 mm narazí do osazení Ø80 – je jen 3 mm nad čelem (Z-23).']);
    expect(texts(checkLiveOp(collar, face({ ...op, safe: 4, retract: 6 }))))
      .toEqual(['error: Díra 1: bezpečná vzdálenost 4 mm narazí do osazení Ø80 – je jen 3 mm nad čelem (Z-23).']);
    expect(texts(checkLiveOp(collar, face({ ...op, safe: 1, retract: 2 })))).toEqual([]);
  });
  it('Z čela uvnitř materiálu: povrch je dál', () => {
    expect(texts(checkLiveOp(shaft, face({ zTop: -40, pcd: 50, holeD: 6, count: 1 }))))
      .toEqual(['error: Díra 1: Z čela -40 leží v materiálu – povrch je o 10 mm dál (Z-30).']);
  });
});

describe('díra mimo materiál', () => {
  it('celá mimo čelo', () => {
    const r = checkLiveOp(shaft, face({ zTop: 0, pcd: 60, holeD: 8 }));
    expect(texts(r)).toEqual(['error: Díry 1–4: mimo materiál čela Z0 – stopa Ø52–Ø68, čelo plné Ø40.']);
  });
  it('přesah přes obvod čela', () => {
    expect(texts(checkLiveOp(shaft, face({ zTop: 0, pcd: 36, holeD: 8, count: 2 }))))
      .toEqual(['error: Díry 1, 2: přesah přes obvod čela Z0 – stopa do Ø44, čelo Ø40.']);
  });
  it('za čelem není materiál (špatná strana čela)', () => {
    expect(texts(checkLiveOp(shaft, face({ zTop: 0, pcd: 24, faceDir: -1, count: 1 }))))
      .toEqual(['error: Díra 1: za čelem Z0 (▶ zleva) není materiál dílu – zkontrolujte Z čela a stranu čela.']);
  });
  it('drážka přes střed čela pouzdra zasahuje do vývrtu', () => {
    const op = normalizeLiveOp({ ...newLiveOp('mill'), zTop: 0, millType: 'slot', toolD: 10, depth: 3, slot: { x1: -40, y1: 0, x2: 40, y2: 0 } });
    expect(texts(checkLiveOp(bush, op))).toEqual(['error: Drážka: zásah do vývrtu Ø40 na čele Z0 – stopa od Ø0.']);
  });
  it('kapsa mezi vývrtem a obvodem v pořádku', () => {
    const op = normalizeLiveOp({ ...newLiveOp('mill'), zTop: 0, millType: 'pocket', pattern: 'pcd', pcd: 70, count: 3, holeD: 12, toolD: 8, depth: 6 });
    expect(texts(checkLiveOp(bush, op))).toEqual([]);
  });
});

describe('pouzdro s vývrtem', () => {
  it('díra v mezikruží v pořádku, u vývrtu zásah', () => {
    expect(texts(checkLiveOp(bush, face({ zTop: 0, pcd: 80, holeD: 8, depth: 10 })))).toEqual([]);
    expect(texts(checkLiveOp(bush, face({ zTop: 0, pcd: 44, holeD: 8, count: 1 }))))
      .toEqual(['error: Díra 1: zásah do vývrtu Ø40 na čele Z0 – stopa od Ø36.']);
  });
  it('díra narazí do širšího vývrtu v hloubce', () => {
    expect(texts(checkLiveOp(bush, face({ zTop: 0, pcd: 54, holeD: 8, depth: 30, count: 1 }))))
      .toEqual(['error: Díra 1: náraz do vývrtu Ø60 v hloubce 20 mm (Z-20).']);
  });
  it('radiální díra skrz stěnu do vývrtu = upozornění', () => {
    expect(texts(checkLiveOp(bush, radial({ xTop: 100, zPos: -35, holeD: 8, depth: 10 })))).toEqual([]);
    const r = checkLiveOp(bush, radial({ xTop: 100, zPos: -35, holeD: 8, depth: 25 }));
    expect(texts(r)).toEqual(['warn: Díry 1–4: skrz stěnu do vývrtu Ø60 – stěna 20 mm, hloubka 25 mm.']);
    expect(r.sev).toBe('warn');
  });
});

describe('radiální díra', () => {
  it('Ø pláště sedí s dílem', () => {
    expect(texts(checkLiveOp(shaft, radial({ xTop: 40, zPos: -15, holeD: 6, depth: 8 })))).toEqual([]);
    expect(texts(checkLiveOp(shaft, radial({ xTop: 40.08, zPos: -15, holeD: 6, depth: 8 })))).toEqual([]);
  });
  it('špatný Ø pláště → hláška s nalezeným Ø', () => {
    expect(texts(checkLiveOp(shaft, radial({ xTop: 70, zPos: -10, holeD: 6, depth: 8, count: 2 }))))
      .toEqual(['error: Díry 1, 2: Ø pláště 70 neodpovídá dílu – v Z-10 je Ø40.']);
  });
  it('díra u osazení: odjezd v materiálu', () => {
    expect(texts(checkLiveOp(shaft, radial({ xTop: 40, zPos: -28, holeD: 6, depth: 8, count: 1 }))))
      .toEqual(['error: Díra 1: bezpečná vzdálenost i odjezd končí v materiálu – osazení Ø70 u díry je 15 mm nad pláštěm.']);
  });
  it('díra za koncem dílu', () => {
    expect(texts(checkLiveOp(shaft, radial({ xTop: 40, zPos: 10, holeD: 6, depth: 8, count: 1 }))))
      .toEqual(['error: Díra 1: mimo díl – v Z10 není materiál.']);
    expect(texts(checkLiveOp(shaft, radial({ xTop: 40, zPos: -1, holeD: 6, depth: 8, count: 1 }))))
      .toEqual(['error: Díra 1: přesah za konec dílu – díra zabírá Z-4 až Z2.']);
  });
});

describe('díra skrz', () => {
  it('čelo zleva: materiál končí na osazení → upozornění s hloubkou', () => {
    // Levé čelo Z−100 (vrtá k +Z), díra r 45 v Ø100 — za Z−60 už jen Ø70.
    const r = checkLiveOp(shaft, face({ zTop: -100, faceDir: -1, pcd: 90, holeD: 8, depth: 50, count: 1 }));
    expect(texts(r)).toEqual(['warn: Díra 1: skrz – materiál končí v hloubce 40 mm (Z-60), hloubka 50 mm. Ověřte, co je za dílem (upínač).']);
    expect(r.marks.get(0)).toBe('warn');
    expect(texts(checkLiveOp(shaft, face({ zTop: -100, faceDir: -1, pcd: 90, holeD: 8, depth: 40, count: 1 })))).toEqual([]);
  });
  it('pouzdro: díra hlubší než délka dílu', () => {
    expect(texts(checkLiveOp(bush, face({ zTop: 0, pcd: 80, holeD: 8, depth: 60, count: 1 }))))
      .toEqual(['warn: Díra 1: skrz – materiál končí v hloubce 50 mm (Z-50), hloubka 60 mm. Ověřte, co je za dílem (upínač).']);
  });
});

describe('celek', () => {
  it('bez kontury null, chybné zadání se tvarem nekontroluje', () => {
    expect(checkLiveOps(liveProfile(S([])), [face({})])).toBe(null);
    const ops = [face({ zTop: 0, pcd: 60, depth: 0 }), face({ zTop: 0, pcd: 24 })];
    const r = checkLiveOps(shaft, ops);
    expect(r.map(x => x.issues.length)).toEqual([0, 0]);
    expect(checkLiveOps(shaft, ops.map(o => ({ ...o })))).toBe(r);   // stejné zadání → z paměti
  });
});
