// ╔══════════════════════════════════════════════════════════════╗
// ║  Dojezd „bez schodků": dobrání schodu vs. hloubka záběru (ap) ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Fixture range-chain-insert-shadow.camprog je REÁLNÝ díl uživatele, na kterém
// se ukázaly dvě chyby podélného hrubování naráz:
//
//  1. Řetěz ramp na hranici rozsahu Z končí posledním krokem KRATŠÍM než
//     Hloubka (ap) — ten krok dosedl na konturu a hned odskočil, aniž by
//     dobral schod vůči kroku nad sebou.
//  2. Mezní čáru „stínu" břitu (buildMachinableContour ji vkládá místo
//     nedosažitelného oblouku) sjel dojezd jedním úsekem 4,5 mm pod hloubku
//     vlastní vrstvy. Ta čára klesá PŘESNĚ pod úhlem zanoření (u auto úhlu je
//     effPlungeDeg = |Natočení| plátku), takže ostré porovnání v
//     findSteepCorner ji nikdy nevyhodnotilo jako strmou stěnu a rampa ořízlá
//     na ap se vůbec nespustila.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { buildStockLoop } from '../js/calculators/cam/materialRemoval.js';
import { stockClearances } from '../js/calculators/cam/camMath.js';
import { polyOffset } from '../js/geom/geomCore.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = join(__dirname, 'fixtures', 'cam', 'range-chain-insert-shadow.camprog');
// Týž díl, ale s rozsahem Z posunutým nad kapsu u čela: řetěz ramp tam končí
// na STRMÉ stěně, kde je konec průchodu (vzorkovaná booleovská geometrie)
// o desetinu mm v Z jinde než analytický dotyk offsetu — a to je na stěně se
// sklonem ~3,7 skoro půl mm v X.
const fixtureSteep = join(__dirname, 'fixtures', 'cam', 'range-chain-steep-face.camprog');

// Krajní hodnoty X na segmentu dojezdu (úsečka i oblouk).
const segXs = (s) => s.type === 'line'
  ? [s.x1, s.x2]
  : [s.x1, s.x2, s.cx + Math.sin(s.startAngle) * s.r, s.cx + Math.sin(s.endAngle) * s.r];

describe('dojezd „bez schodků" u řetězu ramp a mezní čáry plátku', () => {
  it('poslední (kratší než ap) krok řetězu ramp dobere schod po obrysu', async () => {
    const prog = JSON.parse(readFileSync(fixture, 'utf8'));
    const { calc } = await runCamProg(prog);
    const chain = calc.passes.filter(p => p.type === 'long' && p.entryRangeRamp);
    expect(chain.length).toBeGreaterThan(1);
    // Nejhlubší krok řetězu = ten, který vznikl bisekcí pod poslední plnou
    // hloubkou (jeho ramp.x0 je hloubka předchozího kroku).
    const last = chain.reduce((a, b) => (b.x < a.x ? b : a));
    expect(last.ramp.x0 - last.x).toBeLessThan(prog.params.depthOfCut);
    expect(last.contourLeadOut, 'poslední krok řetězu nemá dojezd = nedojetý schodek').toBeTruthy();
    // Dojezd musí vystoupat až k hloubce předchozího kroku — jinak mezi nimi
    // zůstane stát schod. (findLeadOutEndZ skenuje po 0,05 mm v Z, na kuželu
    // proto o kousek přejede — proto horní tolerance.)
    const maxX = Math.max(...last.contourLeadOut.flatMap(segXs));
    expect(maxX).toBeGreaterThan(last.ramp.x0 - 0.05);
    expect(maxX).toBeLessThan(last.ramp.x0 + 0.5);
  }, 30000);

  it('dojezd nesjede pod hloubku vlastní vrstvy; zbytek dobere rampa ≤ ap', async () => {
    const prog = JSON.parse(readFileSync(fixture, 'utf8'));
    const ap = prog.params.depthOfCut;
    const { calc } = await runCamProg(prog);

    for (const p of calc.passes) {
      if (p.type !== 'long' || !p.contourLeadOut || p.pocketClean) continue;
      const minX = Math.min(...p.contourLeadOut.flatMap(segXs));
      // 0,5 mm tolerance: dojezd smí ZAČÍNAT na kontuře těsně pod hloubkou
      // (bod dosednutí offsetu), ale nesmí se pod ni propadat dál.
      expect(p.x - minX, `dojezd průchodu x=${p.x.toFixed(3)} sjel ${(p.x - minX).toFixed(3)} mm pod svou hloubku`)
        .toBeLessThan(0.5);
    }

    // Klín pod mezní čárou plátku dobere samostatný průchod rampou, a ten
    // nesmí sebrat víc než Hloubka (ap) v jednom kroku.
    const ramped = calc.passes.filter(p => p.type === 'long' && p.ramp && !p.entryRangeRamp);
    expect(ramped.length).toBeGreaterThan(0);
    for (const p of ramped) expect(p.ramp.x0 - p.x).toBeLessThan(ap + 1e-6);
  }, 30000);

  it('řetěz končící na STRMÉ stěně dobere schod (konec ≠ analytický dotyk)', async () => {
    const { calc } = await runCamProg(JSON.parse(readFileSync(fixtureSteep, 'utf8')));
    const chain = calc.passes.filter(p => p.type === 'long' && p.entryRangeRamp);
    expect(chain.length).toBeGreaterThan(1);
    const last = chain.reduce((a, b) => (b.x < a.x ? b : a));
    expect(last.contourLeadOut, 'dojezd zahozen kvůli napojení na strmé stěně').toBeTruthy();
    // Vystoupá po stěně zpátky k hloubce předchozího kroku řetězu.
    expect(Math.max(...last.contourLeadOut.flatMap(segXs))).toBeGreaterThan(last.ramp.x0 - 0.05);
  }, 30000);
});

// Konec rozsahu obrábění 📐 platí pro KAŽDÝ řezný pohyb. Řez vrstvy ho držel
// (effZMin), ale sledování obrysu i cíl rampy si za dno braly polotovar —
// dojezd schodu a dokončení rampy pak rozsah přejely o desítky mm.
describe('rozsah obrábění Z je tvrdé dno i pro dojezdy a rampy', () => {
  for (const file of ['range-end-leadout.camprog', 'range-chain-insert-shadow.camprog', 'range-chain-steep-face.camprog']) {
    it(`${file}: žádný řez pod konec rozsahu`, async () => {
      const prog = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'cam', file), 'utf8'));
      const zLo = Math.min(prog.zLimits.rangeStart, prog.zLimits.rangeEnd);
      expect(prog.zLimits.rangeActive).toBe(true);
      const { gcode } = await runCamProg(prog);
      let g = 0, x = 150, z = 5, minZ = Infinity, at = '';
      for (const line of gcode.split('\n')) {
        const t = line.replace(/;.*/, '').trim();
        if (!t.startsWith('N')) continue;
        const body = t.replace(/^N\d+\s*/, '');
        const gm = body.match(/G0?([0-3])\b/); if (gm) g = +gm[1];
        const xm = body.match(/X(-?[\d.]+)/), zm = body.match(/Z(-?[\d.]+)/);
        if (!xm && !zm) continue;
        const nx = xm ? +xm[1] : x, nz = zm ? +zm[1] : z;
        if (g !== 0 && nz < minZ) { minZ = nz; at = `X${nx.toFixed(3)} Z${nz.toFixed(3)}`; }
        x = nx; z = nz;
      }
      expect(minZ, `řezný pohyb ${at} je ${(zLo - minZ).toFixed(3)} mm za koncem rozsahu Z=${zLo}`)
        .toBeGreaterThan(zLo - 0.05);
    }, 30000);
  }
});

// Konec řezu do vzduchu musí dojet POSUVEM až na vůlí-posunutou siluetu
// („tečkovaná" čára = Přídavek X/Z kolem polotovaru). Dřív se odsazovalo jen
// podél osy Z, takže na šikmé/obloukové hraně polotovaru dráha stála uvnitř
// přídavkového pásma — viditelně před tečkovanou čarou.
describe('výjezd z materiálu končí na offsetové čáře polotovaru', () => {
  for (const [name, file] of [['insert-shadow', fixture], ['steep-face', fixtureSteep]]) {
    it(`${name}: žádný řez nekončí uvnitř přídavkového pásma`, async () => {
      const prog = JSON.parse(readFileSync(file, 'utf8'));
      const { calc, gcode, S } = await runCamProg(prog);
      const loop = buildStockLoop(S.params, calc.stockPathSegments);
      const { x: clrX, z: clrZ } = stockClearances(S.params);
      const off = Math.abs(clrX - clrZ) < 1e-6
        ? polyOffset([loop], clrX)[0]
        : (() => {
            const k = clrX / clrZ;
            return polyOffset([loop.map(p => ({ x: p.x, z: p.z * k }))], clrX)[0]
              .map(p => ({ x: p.x, z: p.z / k }));
          })();
      // Nejbližší průsečík smyčky s hloubkou X pod bodem (= hranice, kterou
      // řez opouští ve směru jízdy −Z).
      const crossBelow = (L, X, z) => {
        let best = null;
        for (let i = 0; i < L.length; i++) {
          const a = L[i], b = L[(i + 1) % L.length];
          if ((a.x <= X && b.x > X) || (b.x <= X && a.x > X)) {
            const v = a.z + (b.z - a.z) * ((X - a.x) / (b.x - a.x));
            if (v <= z + 1e-6 && (best === null || v > best)) best = v;
          }
        }
        return best;
      };
      // Poslední ŘEZNÝ bod před odskokem/rychloposuvem.
      let g = 0, x = 150, z = 5, prev = null;
      const ends = [];
      for (const line of gcode.split('\n')) {
        const t = line.replace(/;.*/, '').trim();
        if (!t.startsWith('N')) continue;
        const body = t.replace(/^N\d+\s*/, '');
        const gm = body.match(/G0?([0-3])\b/); if (gm) g = +gm[1];
        const xm = body.match(/X(-?[\d.]+)/), zm = body.match(/Z(-?[\d.]+)/);
        if (!xm && !zm) continue;
        const nx = xm ? +xm[1] : x, nz = zm ? +zm[1] : z;
        // Odskok (+X i +Z zároveň) už není řez „do materiálu" — konec je bod před ním.
        const retract = g !== 0 && nx > x + 1e-6 && nz > z + 1e-6;
        if ((g === 0 || retract) && prev) { ends.push(prev); prev = null; }
        if (g !== 0 && !retract) prev = { x: nx, z: nz };
        x = nx; z = nz;
      }
      if (prev) ends.push(prev);
      expect(ends.length).toBeGreaterThan(3);
      const win = 4 * Math.max(clrX, clrZ);
      for (const p of ends) {
        // Zajímají jen konce, které právě OPUSTILY polotovar jeho hranou:
        // hrana leží kousek nad koncem (nebo přesně na něm). Konce na stěně
        // kontury uvnitř materiálu žádnou hranu polotovaru nad sebou nemají.
        const raw = crossBelow(loop, p.x, p.z + win);
        if (raw === null || raw < p.z - win) continue;
        const o = crossBelow(off, p.x, p.z + win + 1);
        if (o === null || o > raw) continue;
        expect(p.z, `řez skončil na (${p.x.toFixed(3)},${p.z.toFixed(3)}), offsetová čára je až na Z=${o.toFixed(3)}`)
          .toBeLessThan(o + 0.02);
      }
    }, 30000);
  }
});
