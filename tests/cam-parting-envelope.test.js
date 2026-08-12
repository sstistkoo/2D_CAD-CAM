// ╔══════════════════════════════════════════════════════════════╗
// ║  Obálka upichováku (podélně) — smí dráhu jen ZVEDNOUT         ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Sjezdy/dojezdy upichováku se přepočítávají na OBÁLKU x(z) = max offsetu
// pod rovnou částí dna plátku, aby tělo za aktivním rohem neřezalo do
// tvaru. Obálka se ale počítá ze SYROVÉHO `offsetXAt`, kdežto původní
// trasa už prošla podlahou hloubky vrstvy, ořezem na sousední průchod
// i obálkou držáku. Bez stropu „jen zvednout" se z rovného dojezdu ve
// výšce vrstvy stal sjezd po kontuře až na dno dílu — a hlídání držáku
// to NEVIDĚLO, protože testovalo tu původní, rovnou trasu.
//
// Fixture `part-17-long-parting` = díl uživatele s upichovákem (š. 3)
// v podélném hrubování; před opravou 22 nálezů / 2589 mm².
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';

const fixture = join(__dirname, 'fixtures', 'cam', 'part-17-long-parting.camprog');
const load = () => JSON.parse(readFileSync(fixture, 'utf8'));

describe('upichovák podélně: obálka nesmí dráhu snížit', () => {
  it('dojezdy nesjíždějí po kontuře až na dno dílu', async () => {
    const { calc, S } = await runCamProg(load());
    // Dojezd „bez schodků" dobírá schod vůči MĚLČÍMU sousedovi — v zásadě
    // tedy stoupá. Pár desetin dolů je diskretizace obálky, jedna vrstva
    // je schod na kontuře; DESÍTKY mm dolů znamenají, že se dráha přepsala
    // syrovou konturou (regrese obálky upichováku — bylo 41 mm).
    const limit = 2 * (parseFloat(S.params.depthOfCut) || 0);
    const bad = [];
    for (const p of calc.passes) {
      if (p.type !== 'long' || !p.contourLeadOut) continue;
      for (const s of p.contourLeadOut) {
        const dive = p.x - Math.min(s.x1, s.x2);
        if (dive > limit) bad.push(`X${p.x.toFixed(2)}: dojezd ${dive.toFixed(1)} mm pod vrstvu (na X${Math.min(s.x1, s.x2).toFixed(2)} @Z${s.z2.toFixed(1)})`);
      }
    }
    expect(bad).toEqual([]);
  }, 120000);

  it('obálka nenarovnává oblouky na úsečky', async () => {
    const { calc, gcode } = await runCamProg(load());
    // Podlaha obálky se u OBLOUKU musí vyhodnotit přesně (průsečík kružnice
    // se svislicí). „Konzervativně vyšším koncem" zvedne podlahu na maximum
    // přes celé rozpětí oblouku → obálka nad ním vyjde vodorovná a v G-kódu
    // z oblouku zbude ÚSEČKA (reálný nález uživatele: `G1 X31.766 Z−1.261`
    // místo `G3 … CR=11.344`, a s ním i utržené dokončování).
    const arcs = (gcode.split('\n').filter(l => /^N\d+\s+G[23]\b/.test(l.trim()))).length;
    expect(arcs).toBeGreaterThan(10);
    // Dojezdy, které vznikly z oblouků, musí oblouky zůstat.
    const loArcs = calc.passes.reduce((n, p) => n + (p.contourLeadOut || []).filter(s => s.type === 'arc').length, 0);
    expect(loArcs).toBeGreaterThan(5);
  }, 120000);

  it('program nemá kolize držáku', async () => {
    const { calc, calcSim, S } = await runCamProg(load());
    const issues = validateToolpath(calcSim.simPath, S.params, calc.stockPathSegments,
      { backside: false, maxIssues: 500, maxBlocks: 100000 });
    // Historie: 22 nálezů / 2589 mm² (obálka přepisovala dojezd sjezdem po
    // kontuře) → 3 / 78 mm² (dobírání kapsy lezlo do prohlubně, kam se
    // držák nevejde) → 0.
    expect(issues.map(i => `${i.kind} ${i.area.toFixed(0)}mm² @X${i.x.toFixed(1)} Z${i.z.toFixed(1)}`)).toEqual([]);
  }, 120000);

  it('dobírání kapsy nelezе tam, kam se držák nevejde', async () => {
    // Prohlubeň, jejíž DNO je ve tvrdé obálce držáku, se nedobírá — jinak
    // tam nůž zaveze držák do přídavku na protilehlé stěně. Dokončování
    // takovou prohlubeň stejně přemostí rovným průměrem.
    const { calc, errors } = await runCamProg(load());
    const bottoms = calc.passes.filter(p => p.pocketClean).map(p => p.x.toFixed(2));
    expect(bottoms).not.toContain('20.43');
    expect(errors.map(e => e.msg).join('\n')).toMatch(/Hlídání držáku: \d+ prohlube/);
  }, 120000);

  it('poslední rovný průměr dojede přes konec polotovaru', async () => {
    // Profil končí čelem, offsetová čára tedy skončí v jeho rohu (Z−1,3) —
    // ale polotovar pokračuje k Z−8. Bez doběhu tam zůstane prstenec a
    // couvne i doběh DOKONČOVÁNÍ (nad hotovní čarou by stálo víc než
    // jedna tříska).
    const { gcode } = await runCamProg(load());
    const zEnds = [...gcode.matchAll(/^N\d+\s+G1\s+X31\.\d+\s+Z(-\d+\.\d+)/gm)].map(m => parseFloat(m[1]));
    expect(Math.min(...zEnds, 0)).toBeLessThan(-7);
    expect(gcode).toMatch(/G1 X31\.366 Z-8\.\d+ ; Rovný průměr/);   // dokončování
  }, 120000);
});
