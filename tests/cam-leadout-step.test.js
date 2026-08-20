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
import { buildStockLoopRaw } from '../js/calculators/cam/materialRemoval.js';
import { stockClearances, intersectVerticalLineSegment, intersectVerticalLineArc, isAngleBetween } from '../js/calculators/cam/camMath.js';
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

// Max X offsetové dráhy na zadaném Z (= totéž, co uvnitř generátoru rozhoduje
// o zablokování průchodu). null = na tomhle Z offset není (vzduch).
const offsetXAt = (offsetPath, z) => {
  let max = null;
  for (const os of offsetPath) {
    if (os.isDegenerate) continue;
    if (os.type === 'line') {
      const x = intersectVerticalLineSegment(z, os.p1, os.p2);
      if (x !== null && (max === null || x > max)) max = x;
    } else {
      for (const x of intersectVerticalLineArc(z, { x: os.cx, z: os.cz }, os.r)) {
        const a = Math.atan2(x - os.cx, z - os.cz);
        if (isAngleBetween(a, os.startAngle, os.endAngle, os.dir === 'G2') && (max === null || x > max)) max = x;
      }
    }
  }
  return max;
};

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

// Obálka držáku si drží bezpečnostní rezervu (HOLDER_CLAMP_MARGIN, 0,1 mm) od
// zakázané oblasti. Tou oblastí je ale i SILUETA OFFSETU, takže rezerva
// zkracovala i průchody, které končí prostě na stěně kontury — každý zablokovaný
// průchod stál 0,1 mm před offsetovou čárou (uživatel: „nedojede úplně
// k offsetové čáře"). Rezerva patří DRŽÁKU, ne špičce na offsetu.
describe('zablokovaný průchod dojede až na offsetovou čáru', () => {
  // Vzdálenost v Z od konce průchodu k místu, kde offset poprvé přeroste jeho
  // hloubku (= stěna). null = do `max` mm žádná stěna.
  const distToWall = (offsetPath, p, max = 0.4, h = 0.005) => {
    for (let z = p.zEnd - h; z > p.zEnd - max; z -= h) {
      const x = offsetXAt(offsetPath, z);
      if (x !== null && x > p.x) return p.zEnd - z;
    }
    return null;
  };
  for (const [name, file] of [['insert-shadow', fixture], ['steep-face', fixtureSteep]]) {
    it(`${name}: vrstvy končí přesně na mezní čáře plátku`, async () => {
      const { calc } = await runCamProg(JSON.parse(readFileSync(file, 'utf8')));
      // ČELNÍ mezní čáry hlídání destičky (rovné úseky obrobitelné kontury
      // s fromInsert, strmější než 45°) — přesně ta místa z hlášení uživatele.
      const faces = calc.machinableContour.filter(s => s.type === 'line' && s.fromInsert
        && !s.isDegenerate && Math.abs(s.p2.x - s.p1.x) > Math.abs(s.p2.z - s.p1.z));
      expect(faces.length, 'fixture nemá čelní mezní čáru').toBeGreaterThan(0);
      const inFace = (p) => faces.some(s => {
        const [zLo, zHi] = [Math.min(s.p1.z, s.p2.z) - 2, Math.max(s.p1.z, s.p2.z) + 2];
        const [xLo, xHi] = [Math.min(s.p1.x, s.p2.x), Math.max(s.p1.x, s.p2.x)];
        return p.zEnd >= zLo && p.zEnd <= zHi && p.x >= xLo && p.x <= xHi;
      });
      let checked = 0;
      for (const p of calc.passes) {
        // Jen běžné vrstvy: konce kroků řetězu ramp určuje rampa a u stěny
        // skoro rovnoběžné s hloubkou je vzorkovaná booleovská geometrie
        // (0,2 mm v Z) nepřesná sama o sobě.
        if (p.type !== 'long' || !p.blocked || p.holderClamped || p.pocketClean || p.ramp || !inFace(p)) continue;
        const d = distToWall(calc.offsetPath, p);
        if (d === null) continue;
        checked++;
        expect(d, `průchod x=${p.x.toFixed(3)} skončil na Z=${p.zEnd.toFixed(3)}, tj. ${d.toFixed(3)} mm před offsetovou čárou`)
          .toBeLessThan(0.03);
      }
      expect(checked, 'fixture nemá žádnou vrstvu končící na čelní mezní čáře').toBeGreaterThan(2);
    }, 30000);
  }
});

// „Hrub. bez schodků | i u čelního": dojezd po ČELNÍ (radiální) stěně se bez
// zaškrtnutí nedělá ani v PODÉLNÉM hrubování (dřív přepínač platil jen pro
// čelní strategii a v podélné se dal vypnout jen vypnutím celého „bez schodků").
describe('přepínač „i u čelního" platí i v podélném hrubování', () => {
  // Dojezd běžné vrstvy, který stoupá v X víc, než ujede v Z = dojezd po čele.
  // (Dokončení rampy/kapsy má vlastní pravidla — pod přepínač nespadá, jinak by
  // pod ořízlou rampou zůstal stát klín materiálu.)
  const faceLeadOuts = (calc) => calc.passes.filter(p =>
    p.type === 'long' && p.contourLeadOut && p.contourLeadOut.length > 0
    && !p.ramp && !p.pocketEntry && !p.pocketReposition && !p.pocketClean
    && Math.abs(p.contourLeadOut[p.contourLeadOut.length - 1].x2 - p.contourLeadOut[0].x1)
       > Math.abs(p.contourLeadOut[p.contourLeadOut.length - 1].z2 - p.contourLeadOut[0].z1));

  it('zaškrtnuto = dojezdy po čele jsou, nezaškrtnuto = nejsou', async () => {
    const prog = JSON.parse(readFileSync(fixture, 'utf8'));
    prog.params.noStepRoughing = true;

    prog.params.noStepRoughingFace = true;
    const on = await runCamProg(JSON.parse(JSON.stringify(prog)));
    expect(faceLeadOuts(on.calc).length, 'fixture nemá čelní dojezdy, test nic neměří').toBeGreaterThan(0);

    prog.params.noStepRoughingFace = false;
    const off = await runCamProg(JSON.parse(JSON.stringify(prog)));
    expect(faceLeadOuts(off.calc).map(p => p.x)).toEqual([]);

    // Dojezdy po KUŽELU/VÁLCI (postupují v Z víc, než stoupají v X) přepínač
    // neruší — ty patří k podélnému „bez schodků" a zůstávají zapnuté.
    const alongContour = (calc) => calc.passes.filter(p =>
      p.type === 'long' && p.contourLeadOut && p.contourLeadOut.length > 0
      && !faceLeadOuts(calc).includes(p)).length;
    expect(alongContour(off.calc)).toBeGreaterThan(0);
  }, 60000);
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
      const loop = buildStockLoopRaw(S.params, calc.stockPathSegments);
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
