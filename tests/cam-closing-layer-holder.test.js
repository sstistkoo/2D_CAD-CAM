// POSLEDNÍ (KRATŠÍ) VRSTVA a DRŽÁK proti stojícímu zbytku (pravidlo 2).
//
// Nález uživatele 6. 10. 2026 (díl `long-pclnr-valley.camprog` = jeho
// projekt): s PCLNR 2525M12 z 📚 katalogu 9 kolizí držáku (až 24 mm²) u Z 78,5.
// Údolí mezi hrbem a levou stěnou je pro PCLNR nedosažitelné (vedlejší hrana
// 5°), pás odlitku na kuželi (Z ≈ 102–111) STOJÍ. Hloubková smyčka se na
// držák ptá modelu zbytku (`entryHolderArea`) a vrstvy u levé stěny nevydala —
// jenže blok „poslední vrstva před nedosažitelnou hranicí" (bisekce v
// roughLong.js) je vrátil zpátky, protože jeho sken zná jen hotovou konturu.
// Svislý sjezd u Z 78,5 pak vezl hlavu (31 mm vpravo) skrz ten pás.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';
import { validateToolpath } from '../js/calculators/cam/collisionValidator.js';
import { buildIsoKnife } from '../js/calculators/isoToolCatalog.js';

const FILE = join(__dirname, 'fixtures', 'cam-cases', 'long-pclnr-valley.camprog');

async function collisions(id, size) {
  const prog = JSON.parse(readFileSync(FILE, 'utf8'));
  const k = buildIsoKnife(id, { shank: '2525', size, radius: '08' });
  prog.params = { ...prog.params, ...k.tool, toolName: k.name };
  const { calcSim, params } = await runCamProg(prog);
  return validateToolpath(calcSim.simPath, params, calcSim.stockPathSegments, { backside: false, maxIssues: 50 })
    .map((s) => `${s.kind} ${s.area.toFixed(1)} mm² @X${s.x.toFixed(1)} Z${s.z.toFixed(1)}`);
}

describe('poslední vrstva nepustí držák do stojícího zbytku', () => {
  it.each([['CL', '12'], ['WL', '08'], ['SB', '12']])('%s: žádná kolize držáku na dílu s nedosažitelným údolím', async (id, size) => {
    expect(await collisions(id, size)).toEqual([]);
  }, 180000);
});

// Audit 21. 11. 2026: s VLASTNÍM nožem dílu (nakreslený držák, „Šlicht") jel
// dojezd po kontuře pod zbytkem, který vrstvy nad ním kvůli držáku nechaly
// stát — `G1 X13.140 Z246.234` z Z285 (tříska 24 mm, držák 80 mm²) a dojezd
// po válci r 10,4 přes 100 mm (držák 110 mm²). Dojezd teď končí tam, kde by
// držák vjel do toho zbytku (toolEnvelope.js `stairForbidden`), a odtržený
// dojezd se vynechá (openPass.js).
describe('dojezd po kontuře nejede pod zbytkem od držáku', () => {
  it('vlastní nůž dílu: žádná kolize držáku', async () => {
    const prog = JSON.parse(readFileSync(FILE, 'utf8'));
    const { calcSim, params, gcode } = await runCamProg(prog);
    const hits = validateToolpath(calcSim.simPath, params, calcSim.stockPathSegments, { backside: false, maxIssues: 50 })
      .map((s) => `${s.kind} ${s.area.toFixed(1)} mm² @X${s.x.toFixed(1)} Z${s.z.toFixed(1)}`);
    expect(hits).toEqual([]);
    expect(gcode).not.toMatch(/G1 X13\.140 Z246\.234/);
  }, 180000);
});

