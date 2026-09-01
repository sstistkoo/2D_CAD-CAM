// ╔══════════════════════════════════════════════════════════════╗
// ║  Ořez proti ZBYTKU × ořez proti Minkowského obálce            ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Krok 2 plánu `docs/cam-order-aware-holder.md`. `makeResidualClamp` má
// nahradit `clampZTowardNegative` v `applyHolderClamp` — tedy musí mít
// SHODNÉ ROZHRANÍ i shodnou odpověď všude, kde se obě soustavy ptají na
// totéž. Tam, kde zbytek ještě není obroben, je `zbytek = překážka`, takže
// obě varianty MUSÍ dát stejný ořez.
//
// Rozdíl je jen v tom, jak se na to ptají:
//   obálka   F = překážka ⊕ (−držák), pak parita a průsečíky hran s x = X
//   zbytek   držák se položí na (X, z) a protne se se zbytkem
// První je analytická a přesná, ale přestavět se dá jen celá (157–382 ms).
// Druhá je vzorkovaná, ale zeptat se jde kdykoli — a právě proto o materiálu,
// který v tu chvíli ještě stojí, může vědět.
//
// Mez ±0,2 mm je ze zadání kroku 2. Reálný rozdíl je menší a má vysvětlení:
// obálka hlásí kolizi při DOTYKU (nulová plocha), kdežto dotaz nad zbytkem
// až nad tolerancí `RESIDUAL_FIT_TOL` (0,5 mm²) — na překážce široké `w`
// je ten posun právě `tol / w`.
import { describe, it, expect } from 'vitest';
import {
  makeResidualClamp, residualHolderLoop, holderFitsInResidual, RESIDUAL_FIT_TOL,
} from '../js/calculators/cam/residualHolder.js';
import { buildTipForbiddenRegion, clampZTowardNegative, HOLDER_CLAMP_MARGIN } from '../js/calculators/cam/toolEnvelope.js';

const rect = (x1, x2, z1, z2) => [
  { x: x1, z: z1 }, { x: x2, z: z1 }, { x: x2, z: z2 }, { x: x1, z: z2 },
];

// Držák vůči špičce: od x = 10 (nad destičkou) nahoru, tloušťka 20 mm
// v ose Z na OBROBENOU stranu (+z) — jako `holderWorldLoop` u obdélníku.
const HOLDER = rect(10, 60, 0, 20);

describe('makeResidualClamp — rozhraní', () => {
  it('bez zbytku i bez držáku vrací null (hlídání se nekoná)', () => {
    expect(makeResidualClamp([], HOLDER)).toBeNull();
    expect(makeResidualClamp([rect(0, 40, 100, 140)], null)).toBeNull();
  });

  it('volný interval → původní zEnd, zakázaný start → null', () => {
    const loops = [rect(0, 40, 100, 140)];
    const clamp = makeResidualClamp(loops, HOLDER);
    // Špička na X = 20 → držák x ∈ [30, 80], z ∈ [z, z+20]. Volno je, až
    // když je CELÝ držák pod překážkou, tedy z + 20 ≤ 100 → z ≤ 80.
    expect(clamp(20, 79, 60)).toBe(60);
    // Start uprostřed překážky.
    expect(clamp(20, 120, 60)).toBeNull();
    // A na z = 99 už držák do překážky zasahuje (z ∈ [99, 119]).
    expect(clamp(20, 99, 60)).toBeNull();
  });

  it('holderFitsInResidual je bodová varianta téhož', () => {
    const loops = [rect(0, 40, 100, 140)];
    expect(holderFitsInResidual(loops, HOLDER, 20, 200)).toBe(true);
    expect(holderFitsInResidual(loops, HOLDER, 20, 120)).toBe(false);
    // Mimo překážku v ose X (držák x ∈ [50, 100], překážka končí na 40).
    expect(holderFitsInResidual(loops, HOLDER, 40, 120)).toBe(true);
  });
});

describe('parita s Minkowského obálkou (zbytek = hotový díl)', () => {
  // Dvě překážky nad sebou i vedle sebe — ať ořez není triviální.
  const OBSTACLES = [
    rect(0, 40, 100, 140),     // stěna
    rect(0, 25, 40, 70),       // nižší, blíž k ose
  ];
  const forbidden = buildTipForbiddenRegion(OBSTACLES, HOLDER);
  const clampEnv = (X, zS, zE) => clampZTowardNegative(forbidden, X, zS, zE, HOLDER_CLAMP_MARGIN);
  // POROVNÁVÁ SE METODA, NE VOLBA TOLERANCE. Obálka hlásí kolizi při DOTYKU
  // (nulová plocha), dotaz nad zbytkem až nad `tol` — na překážce široké `w`
  // je to posun právě `tol / w`, tedy vlastnost tolerance, ne ořezu. Parita
  // se proto měří s tolerancí u nuly; produkční 0,5 mm² má vlastní test níž.
  const clampRes = makeResidualClamp(OBSTACLES, HOLDER, { margin: HOLDER_CLAMP_MARGIN, tol: 0.01 });

  it('obálka se vůbec postavila', () => {
    expect(forbidden.length).toBeGreaterThan(0);
    expect(clampRes).not.toBeNull();
  });

  for (const X of [5, 12, 20, 28, 35, 45]) {
    it(`X = ${X}: stejný ořez ±0,2 mm`, () => {
      const zS = 200, zE = 0;
      const a = clampEnv(X, zS, zE);
      const b = clampRes(X, zS, zE);
      if (a === null || b === null) {
        expect(b, `obálka ${a}, zbytek ${b}`).toBe(a);
        return;
      }
      expect(Math.abs(a - b), `obálka ${a.toFixed(3)}, zbytek ${b.toFixed(3)}`)
        .toBeLessThanOrEqual(0.2);
    });
  }

  it('shoda platí i pro intervaly končící PŘED překážkou', () => {
    // Interval skončí dřív, než držák na cokoli narazí → obě vrátí zEnd.
    expect(clampRes(20, 200, 165)).toBe(165);
    expect(clampEnv(20, 200, 165)).toBe(165);
  });

  it('start uvnitř zakázané oblasti → obě null', () => {
    for (const X of [12, 20]) {
      expect(clampRes(X, 120, 0)).toBeNull();
      expect(clampEnv(X, 120, 0)).toBeNull();
    }
  });

  it('ÚZKÁ překážka se nepřeskočí (proto stopa místo skenu po krocích)', () => {
    // Žebro široké 0,4 mm v ose Z. Sken po 0,2–2 mm by ho podle fáze minul;
    // stopa držáku přes celý interval ho potká vždy.
    const rib = [rect(0, 40, 130.0, 130.4)];
    const c = makeResidualClamp(rib, HOLDER, { tol: 0.05 });
    const z = c(20, 200, 0);
    expect(z, 'žebro nezastavilo průchod').not.toBeNull();
    // Držák (z ∈ [z, z+20]) se žebra dotkne, jakmile z + 20 < 130,4 →
    // ořez musí přijít nad 110,4 (mínus rezerva).
    expect(z).toBeGreaterThan(110);
  });
});

describe('residualHolderLoop', () => {
  const prms = {
    toolRadius: 0.8, toolLength: 10, holderWidth: 20, holderLength: 200,
    stockMode: 'cylinder', stockDiameter: 60, stockLength: 60,
  };

  it('odečte destičku a zeštíhlí (vzor holderCutShrunkLoop)', () => {
    const plain = residualHolderLoop(prms, false, { subtractInsert: false, shrink: 0 });
    const cut = residualHolderLoop(prms, false);
    expect(plain).not.toBeNull();
    expect(cut).not.toBeNull();
    // Zeštíhlený obrys leží uvnitř: jeho nejnižší x je výš, nejvyšší níž.
    expect(Math.min(...cut.map(p => p.x))).toBeGreaterThan(Math.min(...plain.map(p => p.x)) - 1e-9);
    expect(Math.max(...cut.map(p => p.x))).toBeLessThan(Math.max(...plain.map(p => p.x)) + 1e-9);
  });

  it('bez definovaného držáku vrací null', () => {
    expect(residualHolderLoop({ ...prms, holderWidth: 0 }, false)).toBeNull();
  });
});

describe('tolerance', () => {
  it('RESIDUAL_FIT_TOL je validátorových 0,5 mm², ne skenových 2,0', () => {
    // Kdyby se sem zdědila dvojka z HOLDER_FIT_TOL, hlídání by nad přesným
    // polygonem tolerovalo 4× větší vnoření, než jaké validátor hlásí jako
    // kolizi. Viz komentář u konstanty.
    expect(RESIDUAL_FIT_TOL).toBe(0.5);
  });

  it('produkční tolerance posune ořez přesně o tol / šířku překážky', () => {
    // Tohle NENÍ nepřesnost metody, je to definice tolerance — a je dobré ji
    // mít změřenou, protože na ÚZKÉ překážce je posun největší.
    // Držák x ∈ [X+10, X+60], překážka x ∈ [0, 40] → překryv 40 − (X+10).
    const OB = [rect(0, 40, 100, 140)];
    for (const [X, w] of [[20, 10], [28, 2]]) {
      const exact = makeResidualClamp(OB, HOLDER, { tol: 0.01 })(X, 200, 0);
      const prod = makeResidualClamp(OB, HOLDER)(X, 200, 0);
      const shift = exact - prod;
      expect(shift, `X=${X}: posun ${shift.toFixed(3)} mm, čekáno ${(RESIDUAL_FIT_TOL / w).toFixed(3)}`)
        .toBeCloseTo(RESIDUAL_FIT_TOL / w, 1);
    }
  });
});

// ── Zapojení do strategie (krok 3, příznak orderAwareHolder) ───────────────
// Zbytek se ptá u VJEZDU zákroku (`residEntryArea` → `holderAreaAlongResidual`),
// NE při ořezu Z-intervalů. Ta druhá varianta byla zkoušena a změřeně zamítnuta
// (viz komentář u `applyHolderClamp` a docs/cam-order-aware-holder.md).
describe('orderAwareHolder v genLongPasses', () => {
  const MAGAZINE_HOLDER = {
    sideA: [
      { x: 0, z: 0 }, { x: 2, z: 0 }, { x: 20, z: 6.551464216791643 },
      { x: 20, z: 200 }, { x: 0, z: 200 }, { x: 0, z: 0 },
    ],
    sideB: [],
  };
  const ZL0 = { chuck: null, tail: null, chuckActive: false, tailActive: false, rangeStart: null, rangeEnd: null, rangeActive: false };
  const XL0 = { rangeXMin: null, rangeXMax: null, active: false };

  async function run(file, orderAware, holderProfile) {
    const { runCamProg } = await import('./helpers/camHeadless.mjs');
    const { validateToolpath } = await import('../js/calculators/cam/collisionValidator.js');
    const { readFileSync } = await import('fs');
    const { join, dirname } = await import('path');
    const { fileURLToPath } = await import('url');
    const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cam');
    const prog = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    prog.params = { ...prog.params, orderAwareHolder: orderAware };
    if (holderProfile) prog.params.holderProfile = holderProfile;
    prog.zLimits = { ...ZL0, ...(prog.zLimits || {}) };
    prog.xLimits = { ...XL0, ...(prog.xLimits || {}) };
    const r = await runCamProg(prog);
    return {
      passes: r.calc.passes.length,
      issues: validateToolpath(r.calcSim.simPath, r.params, r.calcSim.stockPathSegments,
        { backside: r.params.roughingSide === 'left', maxIssues: 64 }),
    };
  }

  // AKCEPTACE kroku 3. `part-8` je jediný díl, kde zbylá vada nálezu 09 žije:
  // hluboký vjezd do úzké drážky (`pocketEntry`, r 17,65, rampa na Z 184,5).
  // Dnešní hlídání ho pustí, protože čte VÝŠKOVÉ POLE, které o tunelu neví
  // (krok 1 to tam změřil na 11,2 mm). Polygonový zbytek v tom vjezdu najde
  // 30,1 mm² vnoření držáku a zákrok zahodí.
  it('part-8 s nakresleným nožem: 4 nálezy / 33,4 mm² → 0', async () => {
    const off = await run('part-8.camprog', false, MAGAZINE_HOLDER);
    const on = await run('part-8.camprog', true, MAGAZINE_HOLDER);
    const fmt = (r) => r.issues.map(i => `${i.kind}@r${i.x.toFixed(1)}Z${i.z.toFixed(1)}=${i.area.toFixed(1)}`).join('; ');
    // Bez příznaku ta vada JE — kdyby zmizela jinudy, tenhle test by tiše
    // přestal měřit, co má.
    expect(off.issues.length, `bez příznaku: ${fmt(off)}`).toBeGreaterThan(0);
    expect(on.issues.length, `s příznakem: ${fmt(on)}`).toBe(0);
    // Cena je JEDEN zahozený zákrok, ne rozpadlý program.
    expect(off.passes - on.passes).toBeLessThanOrEqual(2);
  }, 120000);

  it('ostatní díly se příznakem nehnou (part-1)', async () => {
    // Změřeno sweepem: se zapnutým příznakem se napříč 25 fixtures × 2
    // variantami držáku změnil JEDINÝ díl — part-8. Tady jsou dva zástupci.
    //
    // OD 1. 9. 2026 UŽ TO NENÍ ÚPLNÁ PRAVDA a `holder-region-roughing` je
    // proto ven. Zákaz kolmého zanoření (docs/cam-pravidla-drah.md §3.1)
    // se ptá na rampu posunutého vjezdu OBOU modelů držáku, a polygonový
    // (`residEntryArea`) existuje jen se zapnutým příznakem: vrátí 0, když
    // je vypnutý. Se zapnutým tedy najde konflikty, které výškové pole
    // nevidí, a dvě vrstvy se místo kolmého zápichu vynechají (−60,3 mm²).
    // To je ROZDÍL MODELŮ, ne vada příznaku — a přesně to, k čemu je.
    // `part-1` (bez posunutých vjezdů) zůstává inertní a hlídá to dál.
    for (const f of ['part-1.camprog']) {
      const off = await run(f, false, MAGAZINE_HOLDER);
      const on = await run(f, true, MAGAZINE_HOLDER);
      expect(on.passes, `${f}: počet průchodů`).toBe(off.passes);
      expect(on.issues.length, `${f}: nálezy`).toBe(off.issues.length);
    }
  }, 120000);
});
