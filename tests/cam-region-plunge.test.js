// ╔══════════════════════════════════════════════════════════════╗
// ║  Zanořování: hranice úseku se nerozpouští, vjezd na ni rampou ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Hranice úseku (regionu) se dosud v „kůře dna" údolí ROZPOUŠTĚLA: hloubky
// pod povrchem dna přebíral region NAD hranicí. Ten na ně ale dosáhne jen
// svým PRVNÍM intervalem, takže materiál za hranicí (dno vybrání) zůstal
// stát — jediná cesta k němu bylo ruční nastavení Rozsahu Z (reálný nález
// na díle uživatele: pod vrstvou Ø19,5 se ve vybrání už nic nevzalo).
//
// Se zapnutým „Zanořováním" hranice DRŽÍ a vjezd na ni se řeší RAMPOU pod
// úhlem zanoření — stejně jako na hranici rozsahu 📐. Bez zanořování zůstává
// rozpouštění (kolmo do kůry dna se sjet nedá).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { MaterialRemoval } from '../js/calculators/cam/materialRemoval.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fxDir = join(__dirname, 'fixtures', 'cam');

const load = (f) => JSON.parse(readFileSync(join(fxDir, f), 'utf8'));

/** Zbytkový materiál [mm²] po projetí celé emitované dráhy. */
const leftover = ({ calc, calcSim, S }) => {
  const rm = new MaterialRemoval(S.params, calc.stockPathSegments);
  if (!rm.valid) return NaN;
  rm.advanceTo(calcSim.simPath, (calcSim.simPath || []).length);
  return Math.abs(rm.model.area());
};

describe('Zanořování do polotovaru na hranici úseku', () => {
  it('part-11-zleva: se Zanořováním se odebere víc materiálu (dno vybrání)', async () => {
    const prog = load('part-11-zleva-casting.camprog');
    expect(prog.params.plungeRoughing).toBe(true);
    const on = await runCamProg(load('part-11-zleva-casting.camprog'));
    const off = await runCamProg({ ...prog, params: { ...prog.params, plungeRoughing: false } });
    expect(on.calc.passes.length).toBeGreaterThan(off.calc.passes.length);
    // Rozhodující je ODEBRANÝ MATERIÁL, ne počet průchodů: zanoření sahá tam,
    // kam se bez něj vůbec nedalo (dno vybrání za hranicí úseku).
    expect(leftover(on)).toBeLessThan(leftover(off) - 50);
    // A jde o rampový vjezd, ne kolmý zápich do kůry.
    const plunges = on.calc.passes.filter(p => p.entryRangeRamp);
    expect(plunges.length, 'rampové vjezdy').toBeGreaterThan(0);
    for (const p of plunges) expect(p.ramp, `vjezd x=${p.x.toFixed(3)} bez rampy`).toBeTruthy();
  }, 60000);

  it('part-11-zleva: zanoření přijde na řadu až po větších průměrech svého místa', async () => {
    // „Co je nahoře, má přednost" — nad zanořeným nástrojem nesmí zůstat
    // materiál, který se teprve bude brát (`__deferEntry` posune zanoření
    // na konec). Kontroluje se v rámci Z-okna zanoření, ne globálně:
    // jiné Z-zóny dílu jsou samostatné a jejich pořadí sem nepatří.
    const { calc } = await runCamProg(load('part-11-zleva-casting.camprog'));
    const longs = calc.passes.filter(p => p.type === 'long');
    const plunges = longs.filter(p => p.entryRangeRamp);
    expect(plunges.length).toBeGreaterThan(0);
    for (const p of plunges) {
      const zLo = Math.min(p.zStart, p.zEnd), zHi = Math.max(p.zStart, p.zEnd);
      const after = longs.slice(longs.indexOf(p) + 1)
        .filter(q => Math.max(q.zStart, q.zEnd) > zLo && Math.min(q.zStart, q.zEnd) < zHi);
      for (const q of after) {
        expect(q.x, `po zanoření x=${p.x.toFixed(3)} ještě průchod na Ø${q.x.toFixed(3)}`)
          .toBeLessThanOrEqual(p.x + 1e-6);
      }
    }
  }, 30000);
});
