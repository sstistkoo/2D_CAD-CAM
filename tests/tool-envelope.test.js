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
    // BEZ ZVEDNUTÍ PROGRAMOVANÉHO BODU (polygon má `noseLiftX = 0`), takže
    // `stepOffsetPath` je rovnou povrch a platí původní čistě geometrická
    // úvaha: průchod na x=30 (r30) má držák se spodkem na x=40 a ten leží
    // CELÝ na obrobené straně (z ∈ [z_tip, z_tip+20]) — od 25. 8. 2026, dřív
    // byl vystředěný (z ± 10). Jeho LEVÁ hrana je proto sama špička, takže
    // o šikmý přechod zavadí až tam, kde silueta dosahuje výšky x=40, tj. na
    // z = −48 → clamp ≈ −47,9 (s rezervou 0,1). S vystředěným obdélníkem to
    // bylo −37,9, protože hrana předbíhala špičku o 10 mm.
    const clamp = makeHolderClamp({ ...holderPrms, toolShape: 'polygon' }, stepOffsetPath);
    expect(clamp).not.toBeNull();
    const nz = clamp(30, 0, -49);
    expect(nz).toBeGreaterThan(-48.0);
    expect(nz).toBeLessThan(-47.5);
    // Průchod na x=46 (nad vším) → beze změny
    expect(clamp(46, 0, -80)).toBe(-80);
  });

  it('u KULATÉ destičky se silueta sníží o rádius nosu (18. 9. 2026)', () => {
    // `makeHolderClamp` dostává offsetovou čáru, která vede STŘEDEM NOSU,
    // kdežto obrys držáku je ve SVĚTĚ. Překážka se proto staví ze siluety
    // snížené o `noseLiftX` (u kulaté = R) — jinak by se podmínka „spodní
    // hrana držáku nad materiálem" četla jako „střed nosu nad materiálem"
    // a u velkého R by zahazovala celé hloubky
    // (`docs/cam-pravidla-drah.md` §4.2a).
    //
    // Na tomhle schodu je přechod kuželem se sklonem dz/dx = −10/25 = −0,4,
    // takže snížení siluety o R 0,8 posune mez přesně o 0,4 × 0,8 = 0,32 mm.
    const flat = makeHolderClamp({ ...holderPrms, toolShape: 'polygon' }, stepOffsetPath);
    const round = makeHolderClamp({ ...holderPrms, toolShape: 'round' }, stepOffsetPath);
    expect(round).not.toBeNull();
    expect(round(30, 0, -49) - flat(30, 0, -49)).toBeCloseTo(-0.32, 2);
    // Neznámý tvar spadne na kulatou (viz getInsert), takže se chová stejně.
    const dflt = makeHolderClamp(holderPrms, stepOffsetPath);
    expect(dflt(30, 0, -49)).toBeCloseTo(round(30, 0, -49), 6);
  });
});
