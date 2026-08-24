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
import { validateToolpath, holderWorldLoop } from '../js/calculators/cam/collisionValidator.js';

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
    // Do kapsy za stěnou/bossem se SMÍ zanořit (7. 8. 2026 — dřív to podélné
    // hrubování vůbec nezkoušelo, viz `if (!prms.plungeRoughing) return`
    // v roughingStrategies.js). Podmínkou je Zanořování a to, že se vedle
    // vjezdu vejde DRŽÁK — okno počítá `clamp.span` (obálka držáku, Fáze 3b);
    // do užší kapsy se nástroj nepustí.
    //
    // Test proto nehlídá „žádná kapsa" (to byla politika, ne vlastnost), ale
    // to, na čem záleží: kapsové průchody nesmí narazit DRŽÁKEM do materiálu.
    // Kříži se nezávislým validátorem kolizí (Fáze 2), stejně jako
    // tests/holder-envelope-demo.test.js.
    const withPlunge = await runCamProg(pocketProg());
    const holderHits = validateToolpath(
      withPlunge.calcSim.simPath, withPlunge.S.params, withPlunge.calc.stockPathSegments, {},
    ).filter(i => i.kind === 'holder');
    expect(holderHits, `kolize DRŽÁKU: ${holderHits.map(i => `${i.area?.toFixed(1)} mm² @Z${i.z?.toFixed(1)}`).join(', ')}`)
      .toEqual([]);
    // Se zanořováním VYPNUTÝM kapsa nevzniká vůbec (větev je za tím příznakem).
    const { calc: noPlunge } = await runCamProg(pocketProg({ plungeRoughing: false }));
    expect((noPlunge.passes || []).some(p => p.pocketClean || p.pocketEntry)).toBe(false);
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
// ╔══════════════════════════════════════════════════════════════╗
// ║  Virtuální zvětšení držáku (holderInflate)                    ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Nafouknutí obrysu držáku, aby nůž držel od obrobku větší mezeru, aniž by
// se překresloval nůž (zadání uživatele 23. 8. 2026: „nejčastěji se to bude
// používat, aby to nenarazilo do čela … kdyby tam byla házivost nebo otřep").
// Hlídá se hlavně to, kam se nafouknout SMÍ a kam ne — obojí je změřená
// hranice, ne opatrnost, viz inflateHolderLoop v collisionValidator.js.
//
// Vzor je upichovák uživatele: spodní hrana leží PŘÍMO na hrotu (profil
// (0,0)–(2,0)) a pak stoupá k plné tloušťce 20 mm. Právě u něj je růst dolů
// i dopředu zakázaný.
const partingHolder = {
  holderProfile: {
    sideA: [
      { x: 0, z: 0 }, { x: 2, z: 0 }, { x: 20, z: 6.551464216791643 },
      { x: 20, z: 200 }, { x: 0, z: 200 },
    ],
    sideB: [],
  },
  holderWidth: 20, holderLength: 200, toolLength: 5, toolRadius: 0.8,
};
const span = (loop) => ({
  xLo: Math.min(...loop.map(p => p.x)), xHi: Math.max(...loop.map(p => p.x)),
  zLo: Math.min(...loop.map(p => p.z)), zHi: Math.max(...loop.map(p => p.z)),
});

describe('virtuální zvětšení držáku', () => {
  it('nula = obrys přesně jak je nakreslený (profil {x,z} → svět {z,x})', () => {
    const loop = holderWorldLoop({ ...partingHolder, holderInflate: 0 }, false);
    expect(loop).toEqual([
      { x: 0, z: 0 }, { x: 0, z: 2 }, { x: 6.551464216791643, z: 20 },
      { x: 200, z: 20 }, { x: 200, z: 0 },
    ]);
  });

  it('jednostranně (výchozí): roste JEN k obráběné straně', () => {
    const base = span(holderWorldLoop({ ...partingHolder, holderInflate: 0 }, false));
    const inf = span(holderWorldLoop({ ...partingHolder, holderInflate: 1 }, false));
    expect(inf.zHi).toBeCloseTo(base.zHi + 1, 9);   // boční čelo se odsune
    expect(inf.zLo).toBeCloseTo(base.zLo, 9);       // přední strana stojí
    expect(inf.xLo).toBeCloseTo(base.xLo, 9);       // špička stojí
    expect(inf.xHi).toBeCloseTo(base.xHi, 9);       // délka se nemění
  });

  it('jednostranně: spodní šikmá hrana se prodlouží POD SVÝM úhlem', () => {
    // Předloha: (0,2) → (6.5515,20), tedy dz/dx = 18/6.5515. Po posunu o 1 mm
    // k obráběné straně musí ležet na TÉŽE přímce posunuté o +1 v z, čili
    // začínat na (0,3) a končit na (6.5515,21) — ne se zlomit ani zaoblit.
    const loop = holderWorldLoop({ ...partingHolder, holderInflate: 1 }, false);
    // Tolerance 0,01 mm: Minkowského suma v geomCore jede na VÝCHOZÍ
    // přesnosti Clipperu (2 des. místa), takže 6,5515 vyjde jako 6,55.
    // 1,5 um je hluboko pod čímkoli, na čem u hlídání držáku záleží
    // (HOLDER_FIT_TOL je 2 mm), a přesnost se tu schválně nezvedá —
    // minkowskiSolidSum sdílí s obálkou držáku i její snapshoty.
    const has = (x, z) => loop.some(p => Math.hypot(p.x - x, p.z - z) < 0.01);
    expect(has(0, 3)).toBe(true);
    expect(has(6.551464216791643, 21)).toBe(true);
    // Ploška na úrovni hrotu se tím prodlouží z 2 na 3 mm, ale NEKLESNE.
    expect(Math.min(...loop.filter(p => p.x < 1e-9).map(p => p.z))).toBeCloseTo(0, 9);
  });

  it('zrcadlí se se stranou hrubování (zleva = přesná negace v Z)', () => {
    // Rám je kanonický (+z = obrobená strana), takže přídavek přeskočí na
    // druhou stranu SÁM — uživatel ho po přepnutí zleva/zprava nepřenastavuje.
    const prms = { ...partingHolder, holderInflate: 1 };
    const right = holderWorldLoop(prms, false);
    const left = holderWorldLoop(prms, true);
    expect(left).toEqual(right.map(p => ({ x: p.x, z: -p.z })));
  });

  it('kolem celého držáku (záškrt) roste i nahoru, ale nikdy POD hrot', () => {
    // Pod hrotem řeže destička; držák, který by tam klesl, hlásí kolizi na
    // každém běžném řezu. Změřeno: nafouknutí o 1 mm PŘED špičku (na
    // neobráběnou stranu) vyhnalo úběr 4381 → 10310 mm² a ⛔ 0 → 12.
    const base = span(holderWorldLoop({ ...partingHolder, holderInflate: 0 }, false));
    const all = span(holderWorldLoop(
      { ...partingHolder, holderInflate: 1, holderInflateAll: true }, false));
    expect(all.zHi).toBeCloseTo(base.zHi + 1, 9);
    expect(all.xHi).toBeCloseTo(base.xHi + 1, 9);
    expect(all.xLo).toBeCloseTo(base.xLo, 9);   // hrot drží
    expect(all.zLo).toBeCloseTo(base.zLo, 9);   // neobráběná strana drží
  });

  it('bez držáku zůstává null i s nenulovým zvětšením', () => {
    // polyOffset([null]) by spadl v toClipperLoop a shodil celý calculate().
    const none = { holderWidth: 0, holderLength: 0, toolLength: 10, toolRadius: 0.8 };
    expect(holderWorldLoop({ ...none, holderInflate: 0 }, false)).toBeNull();
    expect(holderWorldLoop({ ...none, holderInflate: 2 }, false)).toBeNull();
    expect(holderWorldLoop({ ...none, holderInflate: 2, holderInflateAll: true }, false)).toBeNull();
  });
});
