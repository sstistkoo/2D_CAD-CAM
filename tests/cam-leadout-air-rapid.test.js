// ╔══════════════════════════════════════════════════════════════╗
// ║  Dojezd „bez schodků": nejezdit posuvem vzduchem, dojet schod ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Pojistky nad EMITOVANÝM kódem / strukturou průchodů:
//
//  1. AXIÁLNÍ posuv nepřejíždí vzduch. Rovné pokračování vrstvy (konstantní
//     hloubka X) se stejně jako tělo průchodu seká na rychloposuv(vzduch)/
//     posuv(materiál) podle PLÁNOVACÍHO obrysu polotovaru — nad údolím, kam
//     nástroj nedosáhne, není co řezat. Měří se proti VŮLÍ-POSUNUTÉ siluetě,
//     ne proti zbytkovému modelu (jde o TRVALÝ vzduch = dolík odlitku, ne
//     o už obrobené místo) a ne proti syrové kůře: Přídavek polotovaru je
//     v zadání proto, že odlitek může být větší, takže mělký dolík MĚLČÍ NEŽ
//     PŘÍDAVEK je z hlediska plánování plný materiál a jezdí se posuvem
//     (ÚKLID 8. 8. 2026, docs/geometry-libs-migration.md — reálný případ:
//     pocket-wall-at-plunge-angle má dolík 0,68 mm při Vůli 1 mm).
//     VÝJIMKA: pohyby, které emise sama označila `; Přejezd materiálem
//     posuvem`, se neměří. Tenhle test modeluje nástroj jen DOSAHEM NOSU
//     (`x − tipR`), kdežto emise se rozhoduje celou STOPOU DESTIČKY proti
//     dynamickému zbytku — tělo destičky za nosem škrtne materiál i tam, kde
//     je nos prokazatelně ve vzduchu. Takový posuv není plýtvání, ale vědomá
//     volba „safe-but-slow" (týž práh 0,5 mm² jako descendTo, exit-split
//     a validátor). Změřeno 20. 8. 2026 na holder-casting-slanted-face:
//     44,1 mm nosového vzduchu v pohybu, jehož stopa přitom škrtne 0,9 mm²
//     plánovacího materiálu.
//
//  2. Každý krok řetězu dorampování strmé stěny (`rampCompletion`) si při
//     zapnutém „Hrubování bez schodků" dobírá svůj schod sám. Dřív dojížděl
//     jen POSLEDNÍ krok, mezikroky končily nasucho na stěně.
//
//  3. Přesun v kapse (návrat na pokračování rampy) se zvedne o ÚROVEŇ VRSTVY,
//     ne jen o „Odskok" — při Hloubce (ap) větší než Odskok zůstal nástroj pod
//     úrovní předchozí vrstvy a přejezd v Z vedl materiálem. Sjezd zpátky
//     nedojíždí rychloposuvem až na materiál (poslední kousek posuvem).
//
//  4. Dojezd po kontuře končí na VŮLÍ-POSUNUTÉ siluetě, ne na holé kůře —
//     vůle je přídavek, který se taky obrábí.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { buildStockLoop, offsetStockLoop } from '../js/calculators/cam/materialRemoval.js';

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
    // Vlastní značka emise „tudy jedu posuvem schválně" — viz hlavička.
    const thruStock = /Přejezd materiálem posuvem/.test(line);
    const t = line.replace(/;.*/, '').trim();
    if (!t.startsWith('N')) continue;
    const body = t.replace(/^N\d+\s*/, '');
    const gm = body.match(/G0?([0-3])\b/); if (gm) g = +gm[1];
    const xm = body.match(/X(-?[\d.]+)/), zm = body.match(/Z(-?[\d.]+)/);
    const nx = xm ? +xm[1] : x, nz = zm ? +zm[1] : z;
    if (xm || zm) { moves.push({ g, x0: x, z0: z, x1: nx, z1: nz, thruStock }); x = nx; z = nz; }
  }
  return moves;
}

describe('Dojezd „bez schodků"', () => {
  for (const file of fixtures) {
    it(`${file}: axiální posuv nejede vzduchem`, async () => {
      const prog = JSON.parse(readFileSync(join(fxDir, file), 'utf8'));
      const { calc, gcode, S } = await runCamProg(prog);
      const rawLoop = buildStockLoop(S.params, calc.stockPathSegments) || [];
      if (rawLoop.length < 3) return;                 // bez siluety není co měřit
      const loop = offsetStockLoop(rawLoop, S.params) || rawLoop;
      const tipR = parseFloat(S.params.toolRadius) || 0;
      const worst = { len: 0, at: null };
      for (const m of parseMoves(gcode)) {
        if (m.g !== 1 || Math.abs(m.x1 - m.x0) > 1e-6) continue;   // jen axiální posuv
        if (m.thruStock) continue;                                 // vědomý průjezd materiálem
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

  it('part-4: přesun v kapse se zvedne nad řez a sjezd dojede posuvem', async () => {
    // Přesun uvnitř kapsy (návrat na pokračování rampy dalšího kroku řetězu)
    // se NESMÍ vést v úrovni řezu — nástroj se před ním musí zvednout a sjezd
    // zpátky nesmí dojet rychloposuvem až na materiál (poslední kousek posuvem).
    //
    // POZOR na výběr fixture: dřív se tohle měřilo na `part-11-zleva-casting`
    // v údolí Z≈38–80. Tam ale ten řetěz byl DUPLICITA (kapsa za bossem sjela
    // po téže přímce zanoření už uvnitř hloubkové smyčky — viz plungeLineRuns
    // v roughingStrategies.js) a po jejím odstranění v tom okně žádný přesun
    // v kapse nezbyl. `part-4` má v údolí Z≈29–59 pravý čtyřkrokový řetěz,
    // takže se tu měří TÝŽ mechanismus, jen na správném dílu.
    const prog = JSON.parse(readFileSync(join(fxDir, 'part-4.camprog'), 'utf8'));
    const { gcode } = await runCamProg(prog);
    const moves = parseMoves(gcode);
    // Přejezdy v Z (konstantní X) uvnitř kapsy v údolí Z≈29–60, které se
    // VRACEJÍ na začátek dalšího kroku rampy (z0 < z1, tedy zpátky „nahoru").
    const trav = moves.filter(m => m.g === 0 && Math.abs(m.x1 - m.x0) < 1e-6
      && Math.abs(m.z1 - m.z0) > 5 && m.z1 > 29 && m.z1 < 60 && m.z0 < m.z1 && m.x1 < 60);
    expect(trav.length, 'přejezd v kapse zpět na pokračování rampy').toBeGreaterThan(0);
    for (const m of trav) {
      const idx = moves.indexOf(m);
      // Zvednutí PŘED přejezdem: přejezd jde výš, než kde skončil předchozí
      // řezný pohyb. Že v té výšce opravdu vede vzduchem, hlídá nad DYNAMICKÝM
      // modelem (co už průchody odebraly) validátor kolizí — syrová silueta by
      // tady lhala, materiál nad nástrojem je v tu chvíli dávno pryč.
      expect(m.x1, 'přejezd nad úrovní předchozího řezu').toBeGreaterThan(moves[idx - 1].x0);
      // Sjezd zpátky: rychloposuv a teprve pak posuv na cílovou hloubku.
      expect(moves[idx + 1].g, 'sjezd rychloposuvem').toBe(0);
      expect(moves[idx + 2].g, 'poslední kousek sjezdu posuvem').toBe(1);
      expect(moves[idx + 1].x1 - moves[idx + 2].x1).toBeGreaterThan(0);
    }
  }, 30000);

  it('part-11-zleva: dojezd po kontuře končí až na offsetové čáře polotovaru', async () => {
    // Vůle je PŘÍDAVEK — dojezd má vyjet až na vůlí-posunutou (tečkovanou)
    // siluetu, ne skončit na holé kůře odlitku.
    const prog = JSON.parse(readFileSync(join(fxDir, 'part-11-zleva-casting.camprog'), 'utf8'));
    const { calc, gcode, S } = await runCamProg(prog);
    const loop = buildStockLoop(S.params, calc.stockPathSegments) || [];
    const tipR = parseFloat(S.params.toolRadius) || 0;
    // Vůle je KOLMÁ vzdálenost — na strmé hraně ji podél X natáhne 1/sin(sklon),
    // takže „syrová hodnota + vůle" nestačí; hranice se musí spočítat offsetem
    // smyčky, stejně jako ji počítá emisní kód i náhled (sdílený helper).
    const off = offsetStockLoop(loop, S.params);
    // Emitovaný konec dojezdu v údolí (šikmý úsek po mezní čáře destičky) =
    // řezný pohyb, který v tomhle okně dojede NEJDÁL v Z (za ním už je jen
    // odskok pod 45°, ten jde zpátky).
    const end = parseMoves(gcode)
      .filter(m => m.g === 1 && m.z1 > 78 && m.z1 < 86 && m.x1 > 20 && m.x1 < 30)
      .reduce((a, b) => (a === null || b.z1 > a.z1 ? b : a), null);
    expect(end, 'emitovaný konec dojezdu').toBeTruthy();
    const raw = topXAt(loop, end.z1), offTop = topXAt(off, end.z1);
    expect(offTop, 'offsetová čára nad koncem dojezdu').not.toBeNull();
    // Špička dojela ZA syrovou kůru (přídavek se taky obrábí) a stojí na
    // offsetové čáře — ne dřív (nedotažený dojezd), ne dál (řez do vzduchu).
    expect(end.x1 - tipR).toBeGreaterThan(raw);
    expect(Math.abs((end.x1 - tipR) - offTop), `konec ${(end.x1 - tipR).toFixed(3)} vs offset ${offTop.toFixed(3)}`)
      .toBeLessThan(0.3);
  }, 30000);

  it('part-4: i MEZIKROK dorampování si dobere schod po kontuře', async () => {
    // Vozidlo přesunuto z `part-11-zleva-casting` (jeho řetěz v údolí Z≈38–45
    // byl duplicita kapsy za bossem — viz předchozí test) na `part-4`, kde je
    // řetěz pravý: Ø37,0 → Ø34,5 → Ø32,0 → Ø31,9 v údolí Z≈29–59.
    const prog = JSON.parse(readFileSync(join(fxDir, 'part-4.camprog'), 'utf8'));
    expect(prog.params.noStepRoughing).toBe(true);
    const { calc } = await runCamProg(prog);
    const chain = (calc.passes || []).filter(p => p.rampCompletion
      && p.zStart > 29 && p.zStart < 60);
    expect(chain.length, 'fixture má v údolí řetěz dorampování').toBeGreaterThan(1);
    const mid = chain.find(p => p.noRetract);          // mezikrok (poslední odjíždí)
    expect(mid, 'mezikrok řetězu').toBeTruthy();
    // Doběh se NEzastaví na společném cíli řetězu (poslední krok dosedá na
    // Z≈40,2) — jede rovně dál až na stěnu kontury…
    const last = chain[chain.length - 1];
    expect(mid.zEnd, `mezikrok x=${mid.x.toFixed(3)} skončil na společném cíli`)
      .toBeLessThan(last.zStart - 1);
    // …a odtud dobere schod sledováním obrysu (dřív dojížděl jen poslední krok).
    expect(mid.contourLeadOut && mid.contourLeadOut.length > 0,
      `mezikrok x=${mid.x.toFixed(3)} bez dojezdu po kontuře`).toBe(true);
  }, 30000);
});
