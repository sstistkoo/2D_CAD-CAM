// ╔══════════════════════════════════════════════════════════════╗
// ║  Dojezd „bez schodků": nejezdit posuvem vzduchem, dojet schod ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Dvě pojistky nad EMITOVANÝM kódem / strukturou průchodů:
//
//  1. AXIÁLNÍ posuv nepřejíždí vzduch. Rovné pokračování vrstvy (konstantní
//     hloubka X) se stejně jako tělo průchodu seká na rychloposuv(vzduch)/
//     posuv(materiál) podle siluety ODLITKU — nad údolím, kam nástroj
//     nedosáhne, není co řezat. Měří se proti syrové siluetě polotovaru,
//     ne proti zbytkovému modelu: jde o TRVALÝ vzduch (dolík odlitku), ne
//     o už obrobené místo.
//
//  2. Každý krok řetězu dorampování strmé stěny (`rampCompletion`) si při
//     zapnutém „Hrubování bez schodků" dobírá svůj schod sám. Dřív dojížděl
//     jen POSLEDNÍ krok, mezikroky končily nasucho na stěně.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { buildStockLoop } from '../js/calculators/cam/materialRemoval.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fxDir = join(__dirname, 'fixtures', 'cam');
// Jen podélné odlitkové fixtures — u válce žádný „vzduch v siluetě" není
// a čelní strategie axiální rovné běhy negeneruje.
const fixtures = readdirSync(fxDir).filter(f => f.endsWith('.camprog')).filter((f) => {
  const p = JSON.parse(readFileSync(join(fxDir, f), 'utf8')).params || {};
  return p.roughingStrategy !== 'face' && p.stockMode === 'casting';
}).sort();

/** Max X siluety polotovaru na daném Z (null = tam polotovar není). */
const topXAt = (loop, z) => {
  let top = null;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    if ((a.z <= z && b.z > z) || (b.z <= z && a.z > z)) {
      const x = a.x + (b.x - a.x) * ((z - a.z) / (b.z - a.z));
      if (top === null || x > top) top = x;
    }
  }
  return top;
};

/** Pohyby z G-kódu (X = poloměr, modální G). */
function parseMoves(gcode) {
  const moves = [];
  let g = 0, x = 150, z = 5;
  for (const line of gcode.split('\n')) {
    const t = line.replace(/;.*/, '').trim();
    if (!t.startsWith('N')) continue;
    const body = t.replace(/^N\d+\s*/, '');
    const gm = body.match(/G0?([0-3])\b/); if (gm) g = +gm[1];
    const xm = body.match(/X(-?[\d.]+)/), zm = body.match(/Z(-?[\d.]+)/);
    const nx = xm ? +xm[1] : x, nz = zm ? +zm[1] : z;
    if (xm || zm) { moves.push({ g, x0: x, z0: z, x1: nx, z1: nz }); x = nx; z = nz; }
  }
  return moves;
}

describe('Dojezd „bez schodků"', () => {
  for (const file of fixtures) {
    it(`${file}: axiální posuv nejede vzduchem`, async () => {
      const prog = JSON.parse(readFileSync(join(fxDir, file), 'utf8'));
      const { calc, gcode, S } = await runCamProg(prog);
      const loop = buildStockLoop(S.params, calc.stockPathSegments) || [];
      if (loop.length < 3) return;                    // bez siluety není co měřit
      const tipR = parseFloat(S.params.toolRadius) || 0;
      const worst = { len: 0, at: null };
      for (const m of parseMoves(gcode)) {
        if (m.g !== 1 || Math.abs(m.x1 - m.x0) > 1e-6) continue;   // jen axiální posuv
        const reach = m.x1 - tipR;
        const n = Math.max(1, Math.ceil(Math.abs(m.z1 - m.z0) / 0.2));
        const dz = Math.abs(m.z1 - m.z0) / n;
        // Jen vzduch UZAVŘENÝ materiálem (dolík odlitku uvnitř pohybu). Vzduch
        // na konci pohybu se neměří: tam patří legitimní nájezd přes vůli,
        // dojezd o Vůli Z za hranu materiálu i odjezd za polotovar.
        let run = 0, seenSolid = false;
        for (let i = 0; i <= n; i++) {
          const z = m.z0 + (m.z1 - m.z0) * (i / n);
          const top = topXAt(loop, z);
          if (top !== null && reach <= top + 1e-4) {                 // materiál
            if (seenSolid && run > worst.len) { worst.len = run; worst.at = { x: m.x1, z }; }
            run = 0; seenSolid = true;
          } else if (seenSolid) run += dz;
        }
      }
      // Práh 2 mm: emise rozsekává jen vzduch ≥ 0,5 mm (drobné crossingy
      // z tesselovaných oblouků siluety se neřežou na kousíčky) + rezerva
      // na diskretizaci měření.
      expect(worst.len, `posuv uzavřeným vzduchem ${worst.len.toFixed(1)} mm u ${JSON.stringify(worst.at)}`)
        .toBeLessThan(2);
    }, 30000);
  }

  it('part-11-zleva: i MEZIKROK dorampování si dobere schod po kontuře', async () => {
    const prog = JSON.parse(readFileSync(join(fxDir, 'part-11-zleva-casting.camprog'), 'utf8'));
    expect(prog.params.noStepRoughing).toBe(true);
    const { calc } = await runCamProg(prog);
    // Řetěz v údolí Z≈38–45: mezikrok na Ø24,5 + poslední krok na Ø22,7.
    const chain = (calc.passes || []).filter(p => p.rampCompletion && p.x > 20 && p.x < 27);
    expect(chain.length, 'fixture má v údolí řetěz dorampování').toBeGreaterThan(1);
    const mid = chain.find(p => p.noRetract);          // mezikrok (poslední odjíždí)
    expect(mid, 'mezikrok řetězu').toBeTruthy();
    // Doběh se NEzastaví na společném cíli (Z 44,994) — jede až na stěnu kontury…
    expect(mid.zEnd).toBeGreaterThan(46);
    // …a odtud dobere schod sledováním obrysu (dřív dojížděl jen poslední krok).
    expect(mid.contourLeadOut && mid.contourLeadOut.length > 0,
      `mezikrok x=${mid.x.toFixed(3)} bez dojezdu po kontuře`).toBe(true);
  }, 30000);
});
