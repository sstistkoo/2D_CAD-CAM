// ╔══════════════════════════════════════════════╗
// ║  PÁS mezi polotovarem a offsetovou čarou (náhled úběru)      ║
// ╚══════════════════════════════════════════════╝
//
// Přídavek X/Z (polo.) je v zadání proto, že odlitek MŮŽE být větší — materiál
// až k offsetové čáře tedy reálně existovat může a dráhy se podle toho plánují.
// Náhled úběru ale kreslil jen syrový obrys, takže rychloposuv, který za
// offsetovou čáru skočí, vypadal neškodně (nález uživatele 19. 8. 2026).
// `MaterialRemoval` proto umí základ na OFFSETOVÉ čáře — `{ planningOutline: true }`.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { MaterialRemoval } from '../js/calculators/cam/materialRemoval.js';
import { HolderGouge } from '../js/calculators/cam/holderGouge.js';
import { runCamProgFile } from './helpers/camHeadless.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = join(__dirname, 'fixtures', 'cam', 'part-16-face-holder.camprog');
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
    // Válcový režim: `buildStockLoop` si vystačí s parametry, silueta odlitku
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
    // `rawLoop` musí zůstat k dispozici — náhled na něj ořezává pás, aby jádro
    // zůstalo v dosavadním odstínu.
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
    hg.advanceTo(calcSim.simPath, calcSim.simPath.length - 1);
    // Na tomhle dílu držák do pásu opravdu vjede — jinak by se nemělo co
    // vybarvit a test by hlídal mrtvý kód (nález uživatele 19. 8. 2026).
    expect(hg.gougeBand.length).toBeGreaterThan(0);
    // Záznamy jsou DISJUNKTNÍ: pás je mimo syrový obrys, tvrdé vnoření v něm.
    for (const l of hg.gougeBand) expect(Math.abs(signedArea(l))).toBeGreaterThan(0.02);
  }, 120000);

  it('bez příznaku se pás nesleduje (dosavadní chování oranžového varování)', async () => {
    const { calcSim, S } = await runCamProgFile(fixture);
    const hg = new HolderGouge(S.params, calcSim.stockPathSegments, false);
    hg.advanceTo(calcSim.simPath, calcSim.simPath.length - 1);
    expect(hg.bandLoops).toBeNull();
    expect(hg.gougeBand).toEqual([]);
  }, 120000);
});
