// ╔══════════════════════════════════════════════╗
// ║  PÁS mezi polotovarem a offsetovou čarou (náhled úběru)      ║
// ╚══════════════════════════════════════════════╝
//
// Přídavek X/Z (polo.) je v zadání proto, že odlitek MŮŽE být větší — materiál
// až k offsetové čáře tedy reálně existovat může a dráhy se podle toho plánují.
// Náhled úběru ale kreslil jen syrový obrys, takže rychloposuv, který za
// offsetovou čáru skočí, vypadal neškodně (nález uživatele 19. 8. 2026).
// `MaterialRemoval` proto umí základ na OFFSETOVÉ čáře — `{ planningOutline: true }`.
// Od 20. 8. 2026 na něm náhled vybarvuje polotovar JEDNÍM odstínem (pás nad
// nakresleným odlitkem není zvláštní zóna, je to prostě polotovar).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { MaterialRemoval } from '../js/calculators/cam/materialRemoval.js';
import { HolderGouge } from '../js/calculators/cam/holderGouge.js';
import { polyDifference } from '../js/geom/geomCore.js';
import { runCamProgFile } from './helpers/camHeadless.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = join(__dirname, 'fixtures', 'cam', 'part-16-face-holder.camprog');
// Díl, na kterém držák do pásu vjede i po opravě modelu materiálu
// (24. 8. 2026 — `HolderGouge` ubírá tělem destičky, ne tenkým plánovacím
// profilem). Na `part-16` byl vjezd 0,09 mm² a byl to právě ten artefakt:
// materiál, který destička dávno odebrala. Tady je 1,01 mm², tedy o řád víc.
const bandFixture = join(__dirname, 'fixtures', 'cam', 'part-17-long-parting.camprog');
const prog = JSON.parse(readFileSync(fixture, 'utf8'));

const area = (loop) => {
  let a = 0;
  for (let i = 0, n = loop.length; i < n; i++) {
    const p = loop[i], q = loop[(i + 1) % n];
    a += p.x * q.z - q.x * p.z;
  }
  return Math.abs(a) / 2;
};


// Znaménková plocha — u prstence s dírou se díra ODEČTE (na rozdíl od |plocha|,
// kde by se přičetla a pás vyšel jako součet obou obrysů).
const signedArea = (loop) => {
  let a = 0;
  for (let i = 0, n = loop.length; i < n; i++) {
    const p = loop[i], q = loop[(i + 1) % n];
    a += p.x * q.z - q.x * p.z;
  }
  return a / 2;
};

describe('MaterialRemoval — základ až po offsetovou čáru', () => {
  it('bez příznaku je základem SYROVÝ obrys — to je odpověď pro validator i části programu', () => {
    // Válcový režim: `buildStockLoopRaw` si vystačí s parametry, silueta odlitku
    // není potřeba, a pás je tedy jen zásluha `planningOutline`.
    const cyl = { ...prog.params, stockMode: 'cylinder', stockDiameter: 100, stockLength: 50, stockFace: 0 };
    const raw = new MaterialRemoval(cyl, []);
    expect(raw.valid).toBe(true);
    expect(raw.baseLoop).toEqual(raw.rawLoop);
  });

  it('s příznakem je základ VĚTŠÍ o pás — a syrový obrys zůstává dostupný', () => {
    const cyl = { ...prog.params, stockMode: 'cylinder', stockDiameter: 100, stockLength: 50, stockFace: 0 };
    const outer = new MaterialRemoval(cyl, [], { planningOutline: true });
    expect(outer.valid).toBe(true);
    // `rawLoop` musí zůstat k dispozici — je to odpověď na otázku „kde končí
    // NAKRESLENÝ odlitek" (pás v `HolderGouge`, úběr pro další část programu).
    // Náhled ho už nepotřebuje: vybarvuje jedním odstínem až po offsetovou
    // čáru (viz test níž).
    expect(outer.rawLoop).toBeTruthy();
    expect(area(outer.baseLoop)).toBeGreaterThan(area(outer.rawLoop));
  });

  it('nulový Přídavek X i Z = žádný pás (čáry splývají)', () => {
    const cyl = { ...prog.params, stockMode: 'cylinder', stockDiameter: 100, stockLength: 50, stockFace: 0,
      stockClearX: 0, stockClearZ: 0 };
    const outer = new MaterialRemoval(cyl, [], { planningOutline: true });
    expect(area(outer.baseLoop)).toBeCloseTo(area(outer.rawLoop), 6);
  });
});

describe('HolderGouge — vjezd držáku do PÁSU (červeně)', () => {
  it('pás se spočítá jako offset MÍNUS syrový obrys a vede se zvlášť', async () => {
    const { calcSim, S } = await runCamProgFile(fixture);
    const hg = new HolderGouge(S.params, calcSim.stockPathSegments, false, { band: true });
    expect(hg.valid).toBe(true);
    expect(hg.bandLoops).toBeTruthy();
    // Prstenec s dírou — SEČTENÁ (znaménková) plocha je úzý pás, ne celý kus.
    const ring = Math.abs(hg.bandLoops.reduce((a, l) => a + signedArea(l), 0));
    expect(ring).toBeGreaterThan(1);
    expect(ring).toBeLessThan(0.5 * Math.abs(signedArea(hg.baseLoop)));
    // Že se pás opravdu VYBARVUJE (a test nehlídá mrtvý kód, nález uživatele
    // 19. 8. 2026), se ověří na dílu, kde do něj držák vjíždí měřitelně —
    // viz bandFixture výš.
    const band = await runCamProgFile(bandFixture);
    const hgB = new HolderGouge(band.S.params, band.calcSim.stockPathSegments,
      false, { band: true });
    hgB.advanceTo(band.calcSim.simPath, band.calcSim.simPath.length - 1);
    expect(hgB.gougeBand.length).toBeGreaterThan(0);
    // Záznamy jsou DISJUNKTNÍ: pás je mimo syrový obrys, tvrdé vnoření v něm.
    for (const l of hgB.gougeBand) expect(Math.abs(signedArea(l))).toBeGreaterThan(0.02);
  }, 120000);

  it('offsetový zbytek OBSAHUJE syrový — náhled proto stačí vybarvit jednou', async () => {
    // Náhled kreslí polotovar JEDNÍM odstínem až po offsetovou čáru (jedna
    // výplň `stockPath` v camSimulator.js) — polotovar tam končí, pás nad
    // nakresleným odlitkem není zvláštní zóna. Drží to jen tehdy, když
    // offsetový zbytek opravdu obsahuje ten syrový: obě smyčky řeže TATÁŽ
    // dráha, jen začínají na jiném základu a syrový základ ⊆ offsetový.
    // Kdyby to neplatilo, jedna výplň by kus jádra ztratila.
    const { calcSim, S } = await runCamProgFile(fixture);
    const raw = new MaterialRemoval(S.params, calcSim.stockPathSegments);
    const out = new MaterialRemoval(S.params, calcSim.stockPathSegments, { planningOutline: true });
    expect(raw.valid && out.valid).toBe(true);
    for (const p of [0.25, 0.6, 1]) {
      const at = p * (calcSim.simPath.length - 1);
      raw.advanceTo(calcSim.simPath, at);
      out.advanceTo(calcSim.simPath, at);
      const outside = polyDifference(raw.model.loops, out.model.loops);
      const lost = Math.abs(outside.reduce((a, l) => a + signedArea(l), 0));
      // Clipper vrací na společných hranách slivery — mez je řádově pod
      // plochou, kterou by šlo na plátně rozeznat.
      expect(lost, `při ${(p * 100).toFixed(0)} % dráhy leží ${lost.toFixed(3)} mm² syrového zbytku MIMO offsetový`).toBeLessThan(0.05);
    }
  }, 120000);

  it('bez příznaku se pás nesleduje (dosavadní chování oranžového varování)', async () => {
    const { calcSim, S } = await runCamProgFile(fixture);
    const hg = new HolderGouge(S.params, calcSim.stockPathSegments, false);
    hg.advanceTo(calcSim.simPath, calcSim.simPath.length - 1);
    expect(hg.bandLoops).toBeNull();
    expect(hg.gougeBand).toEqual([]);
  }, 120000);
});
