// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – zanořovací řetěz: `pocketReposition` musí mít předchůdce ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Průchod označený `pocketReposition` NENÍ samostatný nájezd: je to POKRAČOVÁNÍ
// zanořovacího řetězu. Emise (gcodeEmit.js) ho proto vydá jako odskok 45° +
// `G0 Z` + `G0 X` na `rampFeedFrom` — tedy rychloposuv V AKTUÁLNÍ HLOUBCE, bez
// jakéhokoli výjezdu nad konturu. To je bezpečné jen tehdy, když nástroj
// opravdu stojí na konci PŘEDCHOZÍHO kroku téhož řetězu (vyříznutý vzduch).
//
// Když předchůdce z pole `passes` vypadne, `pocketReposition` osiří a týž
// rychloposuv vede skrz stojící polotovar. Reálný nález na díle uživatele:
// heuristika „pravých stěn kapes" (hlídání geometrie destičky) brala krok
// dorampování strmé stěny v JEDNOM údolí jako pravou stěnu kroku v údolí
// o 120 mm dál, umělé zúžení srazilo zStart pod zEnd a celý krok smazala →
// `G0 Z` pak projel 430 mm² materiálu. Fix: kroky řetězu (`rampCompletion`,
// stejně jako dřív `entryRangeRamp`) jsou z té heuristiky vyňaté.
//
// Test je model-free: nekouká na geometrii, jen na strukturu řetězu. Vazba
// platí shodně pro všechny tři zdroje `pocketReposition` (řetěz vjezdu na
// hranici rozsahu, dobírání kapsy „najednou", dorampování strmé stěny) —
// všechny kotví `rampFeedFrom` na (x, zStart) PŘEDCHOZÍHO kroku.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures', 'cam');
const fixtures = readdirSync(fixturesDir).filter(f => f.endsWith('.camprog')).sort();

describe('Zanořovací řetěz: pocketReposition navazuje na předchozí krok', () => {
  for (const file of fixtures) {
    it(`${file} → žádný osiřelý pocketReposition`, async () => {
      const prog = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'));
      const { calc, S } = await runCamProg(prog);
      const isParting = S.params.toolShape === 'parting';
      const passes = calc.passes || [];
      const orphans = [];
      passes.forEach((p, i) => {
        if (!p.pocketReposition || !p.rampFeedFrom) return;
        const prev = passes[i - 1];
        // Předchůdce musí existovat a stát PŘESNĚ na kotvě řetězu: konec jeho
        // rampy = (prev.x, prev.zStart) = rampFeedFrom. Tolerance je jen na
        // zaokrouhlení — kotva se kopíruje, nepočítá znovu.
        // Upichovák řetězí JINAK (viz roughingStrategies.js, větev `isParting`):
        // přesun jde v úrovni PŘEDCHOZÍHO dna (x = prev.x) rovnou na NOVÉ
        // zápichové Z (z = zStart TOHOTO kroku) a odtud svísle dolů — šikmý
        // přejezd po sdílené rampě by tělem plátku hobloval pravou stěnu.
        // Společné pro oba tvary řetězu je X: kotva leží na hloubce předchůdce.
        // (U upichováku může kotva vzejít z obou míst — podle toho, který zdroj
        // `pocketReposition` krok vyrobil; oba drží X na hloubce předchůdce.)
        const zOk = prev && Math.abs(prev.zStart - p.rampFeedFrom.z) < 0.01
          || (isParting && Math.abs(p.zStart - p.rampFeedFrom.z) < 0.01);
        const linked = prev
          && Math.abs(prev.x - p.rampFeedFrom.x) < 0.01
          && zOk;
        if (!linked) {
          orphans.push(`[${i}] x=${p.x.toFixed(3)} rampFeedFrom=(${p.rampFeedFrom.x.toFixed(3)},${p.rampFeedFrom.z.toFixed(3)})`
            + ` prev=${prev ? `x=${prev.x.toFixed(3)} zStart=${prev.zStart.toFixed(3)}` : 'ŽÁDNÝ'}`);
        }
      });
      expect(orphans, `osiřelé zanořovací kroky: ${orphans.join(' | ')}`).toEqual([]);
    });
  }
});
