// ╔══════════════════════════════════════════════════════════════╗
// ║  Držák plátku (holderWidth/holderLength) × hlídání geometrie  ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Mezní čára z hlídání geometrie destičky je VŽDY ROVNÁ ÚSEČKA podél hrany
// destičky — žádné oblouky, žádné zlomy (viz invariant v hlavičce
// js/calculators/cam/interferenceGuides.js). Mezistav, kdy se čára lámala
// podél dosažitelné hranice držáku (`via` vrcholy), je pryč: hranice kopíruje
// zakřivenou konturu, takže „mezní čára" vycházela jako křivka.
//
// Důsledkem je, že do kapsy širší než držák se nástroj mezní čárou nepustí
// (kapsa se přemostí „V" stejně jako bez držáku) — obrobitelná kontura na
// holderWidth vůbec nezávisí. Kolizní ochrana držáku tím nezmizela, dělá ji
// holderLoopL v roughingStrategies.js + validateToolpath (proto se počet
// průchodů s držákem a bez něj pořád liší).
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

// Kompaktní popis obrobitelné kontury pro porovnání dvou běhů.
const dumpMC = (calc) => (calc.machinableContour || calc.contourSegments).map(s => s.type === 'line'
  ? `L (${s.p1.x.toFixed(2)},${s.p1.z.toFixed(2)})->(${s.p2.x.toFixed(2)},${s.p2.z.toFixed(2)})${s.fromInsert ? ' {ins}' : ''}${s.fromHolder ? ' {hld}' : ''}`
  : `A r=${s.r.toFixed(2)} ${s.dir}`);

describe('držák plátku — zanoření do široké kapsy', () => {
  it('mezní čáry jsou ROVNÉ — obrobitelná kontura na držáku nezávisí', async () => {
    const { calc } = await runCamProg(pocketProg());
    // ŽÁDNÁ mezní čára se nesmí lámat (via vrcholy jsou zrušené).
    const bent = (calc.interferenceGuides || []).filter(g => g.via && g.via.length);
    expect(bent).toEqual([]);
    const mc = calc.machinableContour || calc.contourSegments;
    // Žádný most nepochází ze stěny držáku — mostem je jen hrana destičky.
    expect(mc.some(s => s.fromHolder)).toBe(false);
    // Dno kapsy (x = 20) není obrobitelné: kapsu nahradilo „V" z hrany
    // destičky, stejně jako bez držáku.
    const bottom = mc.filter(s => s.type === 'line'
      && Math.abs(s.p1.x - 20) < 0.01 && Math.abs(s.p2.x - 20) < 0.01);
    expect(bottom.length).toBe(0);
    expect(mc.some(s => s.fromInsert)).toBe(true);
    // Podélné hrubování kapsu za stěnou/bossem nedohledává (agresivní
    // dojezd/rampa do neznáma tam uměla narazit na kolizi s držákem a nechat
    // schod bez dojezdu) — žádný pocketClean/pocketEntry.
    expect((calc.passes || []).some(p => p.pocketClean || p.pocketEntry)).toBe(false);
    // PARITA: stejná kontura jako s vypnutým držákem (holderWidth 0). Mezní
    // čára je čistá hrana destičky, geometrie držáku do ní nevstupuje.
    const { calc: noHolder } = await runCamProg(pocketProg({ holderWidth: 0 }));
    expect(dumpMC(calc)).toEqual(dumpMC(noHolder));
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
