// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – obálka nástroje / zakázaná oblast špičky (Fáze 3a)    ║
// ╚══════════════════════════════════════════════════════════════╝
import { describe, it, expect } from 'vitest';
import {
  offsetSilhouetteLoop, buildTipForbiddenRegion, clampZTowardNegative, makeHolderClamp,
} from '../js/calculators/cam/toolEnvelope.js';
import { pointInLoop, polyArea } from '../js/geom/geomCore.js';

// Silueta „schodu": rovina x=20 od z=0 do z=-40, pak stěna nahoru na x=45
// (strmý kužel) — typický případ N420 z validátoru.
const stepOffsetPath = [
  { type: 'line', p1: { x: 20, z: 0 }, p2: { x: 20, z: -40 } },
  { type: 'line', p1: { x: 20, z: -40 }, p2: { x: 45, z: -50 } },
  { type: 'line', p1: { x: 45, z: -50 }, p2: { x: 45, z: -70 } },
];

// Držák: obdélník šířky 20 (z ±10), spodní hrana 10 nad špičkou, délka 200
const holderPrms = {
  holderWidth: 20, holderLength: 200, toolLength: 10, toolRadius: 0.8,
  respectInsertGeometry: true,
};

describe('offsetSilhouetteLoop', () => {
  it('uzavře profil k ose na obou koncích', () => {
    const loop = offsetSilhouetteLoop(stepOffsetPath);
    // plocha: pás x∈[0,20] přes z∈[0,-40], lichoběžník přechodu a blok x∈[0,45] z∈[-50,-70]
    const area = Math.abs(polyArea([loop]));
    expect(area).toBeCloseTo(20 * 40 + ((20 + 45) / 2) * 10 + 45 * 20, 3);
    expect(pointInLoop({ x: 10, z: -20 }, loop)).toBe('inside');
    expect(pointInLoop({ x: 30, z: -20 }, loop)).toBe('outside');
    expect(pointInLoop({ x: 40, z: -60 }, loop)).toBe('inside');
  });

  it('vrací null pro prázdný offset', () => {
    expect(offsetSilhouetteLoop([])).toBeNull();
  });
});

describe('buildTipForbiddenRegion + clampZTowardNegative', () => {
  // Obdélníková překážka x∈[0,30], z∈[-60,-40]; „držák" = čtverec
  // x∈[5,15], z∈[-5,5] relativně ke špičce (spodek 5 nad špičkou).
  const obstacle = [
    { x: 0, z: -40 }, { x: 30, z: -40 }, { x: 30, z: -60 }, { x: 0, z: -60 },
  ];
  const tool = [
    { x: 5, z: -5 }, { x: 5, z: 5 }, { x: 15, z: 5 }, { x: 15, z: -5 },
  ];
  const forbidden = buildTipForbiddenRegion([obstacle], tool);

  it('špička je zakázaná právě tam, kde nástroj protne překážku', () => {
    // Špička na x=27 (nástroj x∈[32,42] — NAD překážkou x≤30) → volno kdekoli
    expect(clampZTowardNegative(forbidden, 27, 0, -80)).toBe(-80);
    // Špička na x=20 (nástroj x∈[25,35] — protíná výšky ≤30):
    // vjezd zprava (z=0 → −80): nástroj zasáhne překážku, když jeho
    // z-rozsah [z−5, z+5] protne z∈[−60,−40] → vstup do F na z = −35
    const clamped = clampZTowardNegative(forbidden, 20, 0, -80);
    expect(clamped).toBeGreaterThan(-35.2);
    expect(clamped).toBeLessThan(-34.5);
  });

  it('start uvnitř zakázané oblasti → null', () => {
    expect(clampZTowardNegative(forbidden, 20, -50, -80)).toBeNull();
  });

  it('interval hluboko pod překážkou zůstává volný', () => {
    // Špička na x=20 od z=−70 dolů: nástroj z∈[z−5, z+5] se od překážky
    // (z∈[−60,−40]) jen vzdaluje → žádný vstup do F, zEnd beze změny.
    expect(clampZTowardNegative(forbidden, 20, -70, -80)).toBe(-80);
  });
});

describe('makeHolderClamp (integrace parametrů)', () => {
  it('bez držáku → null', () => {
    expect(makeHolderClamp({ ...holderPrms, holderWidth: 0 }, stepOffsetPath)).toBeNull();
  });

  it('zkrátí průchod před stěnou tak, aby držák nevjel do siluety', () => {
    const clamp = makeHolderClamp(holderPrms, stepOffsetPath);
    expect(clamp).not.toBeNull();
    // Průchod na x=30 (r30): špička by volně dojela ke stěně, ale držák
    // (spodek na x=40, z±10) narazí na šikmý přechod: silueta dosahuje
    // výšky x=40 na z=−48 → levá hrana držáku (z_tip−10) se jí dotkne
    // při z_tip = −38 → clamp ≈ −37,9 (s rezervou 0,1).
    const nz = clamp(30, 0, -49);
    expect(nz).toBeGreaterThan(-38.2);
    expect(nz).toBeLessThan(-37.5);
    // Průchod na x=46 (nad vším) → beze změny
    expect(clamp(46, 0, -80)).toBe(-80);
  });
});
