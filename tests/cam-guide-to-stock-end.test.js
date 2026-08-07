// ╔══════════════════════════════════════════════════════════════╗
// ║  Mezní čára končí na hraně MATERIÁLU, ne na konci dílce       ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Volný (dolní) konec mezní čáry hlídání geometrie destičky hledá paprsek
// podél hrany destičky. Když paprsek mine konturu a dopadne až na obrys
// POLOTOVARU, čára tam má SKONČIT — polotovar za koncem dílce pokračuje
// (přídavek na čelo) a je to pořád materiál, kam nástroj nedosáhne.
//
// Dřív se takový dopad ořezával zpět na `minPartZG` (konec kontury), takže
// čára viditelně nedojela k obrysu polotovaru. Reálný nález na díle uživatele
// (projekt_2026-08-07, hrubování zleva): stín kužele Ø199,7 skončil na čele
// dílce Z449,81, ačkoli polotovar sahá na Z482 — 32 mm chybělo.
//
// Dopad ZA konturou vždycky leží na polotovaru (kontura tam z definice není),
// takže ten ořez nedělal nic jiného, než že tuhle informaci zahazoval.
//
// Implementace: `walkStraight` v js/calculators/cam/interferenceGuides.js.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fxDir = join(__dirname, 'fixtures', 'cam');
const load = (name) => JSON.parse(readFileSync(join(fxDir, name), 'utf8'));

/** Z-rozsah kontury a polotovaru tak, jak je zadaný v .camprog (world). */
function zSpans(prog) {
  const cz = prog.contourPoints.map(p => p.z);
  const sz = prog.stockPoints.map(p => p.z);
  return {
    contour: { lo: Math.min(...cz), hi: Math.max(...cz) },
    stock: { lo: Math.min(...sz), hi: Math.max(...sz) },
  };
}

describe('Mezní čára dojede až na hranu materiálu', () => {
  // face-cylinder: polotovar přesahuje čelo dílce o 7,25 mm. Čára zanoření
  // u čela musí dojet ZA konturu, ne skončit na jejím konci.
  it('face-cylinder: volný konec čáry leží za koncem kontury, na polotovaru', async () => {
    const prog = load('face-cylinder.camprog');
    expect(prog.params.respectInsertGeometry).toBe(true);
    const span = zSpans(prog);
    // Polotovar musí dílec vůbec přesahovat, jinak test nic netestuje.
    expect(span.stock.lo).toBeLessThan(span.contour.lo - 1);

    const { calc } = await runCamProg(prog);
    const guides = calc.interferenceGuides || [];
    expect(guides.length).toBeGreaterThan(0);

    // Čára s volným koncem ZA konturou (dřív ořezaná přesně na span.contour.lo).
    const past = guides.filter(g => g.z1 < span.contour.lo - 0.5);
    expect(past.length, `žádná čára nepřesáhla konec kontury (${span.contour.lo}); ` +
      `konce: ${guides.map(g => g.z1.toFixed(2)).join(', ')}`).toBeGreaterThan(0);

    // …a nepřestřelí materiál: dopad leží uvnitř Z-rozsahu polotovaru.
    for (const g of past) {
      expect(g.z1).toBeGreaterThanOrEqual(span.stock.lo - 0.5);
      expect(g.x1).toBeGreaterThan(0.1);       // ne na ose (tam se čára zahazuje)
    }
  }, 30000);

  // part-11-zleva: totéž přes zrcadlo (hrubování zleva). Konec čáry se
  // posunul z konce dílce na obrys polotovaru o ~22 mm.
  it('part-11-zleva: konec čáry sedí na polotovaru i přes zrcadlo Z', async () => {
    const prog = load('part-11-zleva-casting.camprog');
    expect(prog.params.roughingSide).toBe('left');
    const span = zSpans(prog);
    const { calc } = await runCamProg(prog);
    const guides = calc.interferenceGuides || [];

    const past = guides.filter(g => g.z1 > span.contour.hi + 0.5);
    expect(past.length, `konce čar: ${guides.map(g => g.z1.toFixed(2)).join(', ')}`).toBeGreaterThan(0);
    for (const g of past) expect(g.z1).toBeLessThanOrEqual(span.stock.hi + 0.5);
  }, 30000);
});
