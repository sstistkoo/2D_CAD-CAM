// ╔══════════════════════════════════════════════════════════════╗
// ║  Držák plátku (holderWidth/holderLength) × hlídání geometrie  ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Mezní čáry z hlídání geometrie destičky dřív modelovaly boční ostří jako
// NEKONEČNOU přímku — do široké kapsy se strmými stěnami nástroj nesměl,
// i když by se tam držák fyzicky vešel. S držákem (svislý pás šířky
// holderWidth, délky holderLength) se mezní čára lomí: hrana destičky platí
// jen do Délky hrany (toolLength), pak roh držáku a svisle dolů — nástroj
// smí až na dno kapsy širší než držák. holderWidth/holderLength ≤ 0 vrací
// staré chování (V-přemostění kapsy).
import { describe, it, expect } from 'vitest';
import { runCamProg } from './helpers/camHeadless.mjs';

// Obdélníková kapsa (šířka 60 mm v Z, hloubka 20 mm v X) ve válci r40;
// svislé stěny destička (natočení 15°, ε 90°) bočním ostřím neobrobí.
// Šířka volena tak, aby se do kapsy FYZICKY vešel celý obrys držáku (20 mm)
// i po zúžení mezní čárou u pravé stěny a dočišťovací průchod dojel na dno.
// S užší kapsou (dřív 30 mm) je efektivní dno po offsetu+mezní čáře jen
// ~18 mm — držák se tam nevejde a dno je NEdosažitelné bez kolize (dřívější
// verze testu to tvrdila mylně; ověřeno nezávislým validátorem kolizí).
function pocketProg(overrides = {}) {
  const pt = (type, x, z) => ({ id: Math.random(), type, x, z, r: 0, mode: 'ABS' });
  return {
    __camprog: 1,
    params: {
      machineType: 'LIMS=2000', mode: 'RADIUS', toolName: 'T1',
      speed: 200, feed: 0.25, depthOfCut: 2, retractDistance: 2, retractAngle: 45,
      allowanceX: 0.5, allowanceZ: 0.1, toolRadius: 0.8, finishAllowance: 0,
      doFinishing: true, roughingStrategy: 'longitudinal', finishOnly: false,
      // Válec jde z +stockFace dolů na −stockLength; kontura leží v z 0…100.
      roughingSide: 'right', stockMode: 'cylinder', stockMargin: 2,
      stockDiameter: 84, stockLength: 2, stockFace: 102, safeX: 150, safeZ: 110,
      machineStructure: 'lathe', controlSystem: 'sinumerik', autoProfile: true,
      toolShape: 'polygon', toolLength: 10, toolAngle: 15, toolTipAngle: 90,
      toolVbdCode: '', toolClearanceAngle: 0,
      holderWidth: 20, holderLength: 200,
      partOffZ: null, partingApproachFeed: 1, partOffSmooth: false, partOffStartX: 0,
      finishingSlot: null, entryAngle: 30, entryAngleAuto: true,
      respectInsertGeometry: true, plungeRoughing: true,
      pocketFinishAtOnce: true, noStepRoughing: true, noStepRoughingFace: true,
      rapidClearance: 1, threadActive: false,
      ...overrides,
    },
    contourPoints: [
      pt('G0', 40, 100),
      pt('G1', 40, 70),   // pravý horní roh kapsy (rim)
      pt('G1', 20, 70),   // pravá svislá stěna
      pt('G1', 20, 10),   // dno kapsy
      pt('G1', 40, 10),   // levá svislá stěna
      pt('G1', 40, 0),
      pt('G1', 0, 0),
    ],
    stockPoints: [],
    flipX: false, flipZ: false, guideLines: [],
  };
}

describe('držák plátku — zanoření do široké kapsy', () => {
  it('s držákem: mezní čáry se lomí (via) a dno kapsy zůstává obrobitelné', async () => {
    const { calc } = await runCamProg(pocketProg());
    // Zanořovací mezní čára je lomená podle dosažitelné oblasti držáku (F).
    const viaGuides = (calc.interferenceGuides || []).filter(g => g.via && g.via.length);
    expect(viaGuides.length).toBeGreaterThanOrEqual(1);
    // Lomená čára pravého rohu (40,70): hrana destičky pod 15° z rohu až po
    // průsečík s dosažitelnou hranicí držáku. Fáze 3: plný obrys držáku
    // (holderWorldLoop) je vycentrovaný ±holderWidth/2, takže hranice leží
    // na „stěna − holderWidth/2" (z = 70 − 10 = 60), ne na 70−20 jako dřívější
    // aproximace svislým pásem šířky W. Pak svisle na dno (20, 60).
    const zan = viaGuides.find(g => g.kind === 'zanoreni');
    expect(zan).toBeTruthy();
    expect(zan.x1).toBeCloseTo(20, 1);
    expect(zan.z1).toBeCloseTo(60, 1);
    expect(zan.via[0].z).toBeCloseTo(60, 1);
    // Obrobitelná kontura obsahuje kus DNA kapsy (x = 20) — bez držáku by
    // celou kapsu nahradilo „V" a na dno by se nesmělo.
    const mc = calc.machinableContour || calc.contourSegments;
    const bottom = mc.filter(s => s.type === 'line'
      && Math.abs(s.p1.x - 20) < 0.01 && Math.abs(s.p2.x - 20) < 0.01);
    expect(bottom.length).toBeGreaterThan(0);
    // Svislé mostové úseky podél stěny držáku jsou označené fromHolder
    // (dokončování je nepřeskakuje kvůli úhlovému rozsahu destičky).
    expect(mc.some(s => s.fromHolder)).toBe(true);
    // Dobírání kapsy (pocketClean) skutečně dojede na dno (offset dna
    // = 20 + R0.8 + přídavek X 0.5 = 21.3).
    const cleanPass = (calc.passes || []).find(p => p.pocketClean);
    expect(cleanPass).toBeTruthy();
    expect(cleanPass.x).toBeLessThan(22);
  });

  it('bez držáku (holderWidth 0): staré chování — kapsa se přemostí, dno nedostupné', async () => {
    const { calc } = await runCamProg(pocketProg({ holderWidth: 0 }));
    const viaGuides = (calc.interferenceGuides || []).filter(g => g.via && g.via.length);
    expect(viaGuides.length).toBe(0);
    const mc = calc.machinableContour || calc.contourSegments;
    expect(mc.some(s => s.fromHolder)).toBe(false);
    // Dno kapsy (x=20) v obrobitelné kontuře není.
    const bottom = mc.filter(s => s.type === 'line'
      && Math.abs(s.p1.x - 20) < 0.01 && Math.abs(s.p2.x - 20) < 0.01);
    expect(bottom.length).toBe(0);
  });

  it('úzká kapsa (užší než držák) se přemostí V-čkem i s držákem', async () => {
    // Kapsa jen 12 mm široká (Z 58–70) — držák šířky 20 se dovnitř nevejde.
    const prog = pocketProg();
    const pt = (type, x, z) => ({ id: Math.random(), type, x, z, r: 0, mode: 'ABS' });
    prog.contourPoints = [
      pt('G0', 40, 100),
      pt('G1', 40, 70),
      pt('G1', 20, 70),
      pt('G1', 20, 58),
      pt('G1', 40, 58),
      pt('G1', 40, 0),
      pt('G1', 0, 0),
    ];
    const { calc } = await runCamProg(prog);
    const mc = calc.machinableContour || calc.contourSegments;
    // Dno (x=20) nedosažitelné — kapsu nahradily mostové úseky.
    const bottom = mc.filter(s => s.type === 'line'
      && Math.abs(s.p1.x - 20) < 0.01 && Math.abs(s.p2.x - 20) < 0.01);
    expect(bottom.length).toBe(0);
    expect(mc.some(s => s.fromInsert)).toBe(true);
  });
});
