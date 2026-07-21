// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM regrese: BOOLEOVSKÁ hrubovací větev (booleanRoughing=on)  ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Dvojče cam-gcode-regression.test.js, ale s vynuceným příznakem
// `booleanRoughing = true`. Experimentální booleovská cesta (migrace Fáze 3)
// dnes NEMÁ vlastní G-kód regresní pojistku — hlídá ji jen material-parita
// (boolean-roughing-wiring), která připouští drobné rozdíly v drahách. Tento
// snapshot přišpendlí PŘESNÝ booleovský výstup, takže jakákoli restrukturace
// emisní smyčky (kroky 3B/3C) se hned ukáže jako diff. Scan-line snapshoty
// (cam-gcode-regression, flag OFF) zůstávají oddělené a nedotčené.
//
// Záměrná změna booleovské cesty: `npx vitest run cam-boolean-gcode-regression -u`.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures', 'cam');
const fixtures = readdirSync(fixturesDir).filter(f => f.endsWith('.camprog')).sort();

// Kompaktní shrnutí struktury pipeline (shodné s cam-gcode-regression) —
// napoví, KDE se booleovská cesta případně pohnula (kontura vs dráhy).
function pipelineSummary(calc) {
  const seg = (s) => s.type === 'line'
    ? `L (${s.p1.x.toFixed(2)},${s.p1.z.toFixed(2)})->(${s.p2.x.toFixed(2)},${s.p2.z.toFixed(2)})${s.fromInsert ? ' {ins}' : ''}`
    : `A r=${s.r.toFixed(2)} ${s.dir}${s.fromInsert ? ' {ins}' : ''}`;
  const mc = (calc.machinableContour || calc.contourSegments || []).filter(s => !s.isDegenerate);
  const passTags = (calc.passes || []).map((p) => {
    const tags = ['pocketClean', 'pocketReposition', 'pocketEntry', 'ramp', 'contourLeadIn', 'contourLeadOut', 'backside', 'blocked']
      .filter(t => p[t]).join(',');
    return `${p.type}${tags ? '{' + tags + '}' : ''}`;
  });
  return {
    machinableContour: mc.map(seg),
    passCount: (calc.passes || []).length,
    passTags,
  };
}

describe('CAM booleovská hrubovací větev — regrese (booleanRoughing=on)', () => {
  for (const file of fixtures) {
    it(`${file} → stabilní booleovský G-kód`, async () => {
      const prog = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'));
      prog.params.booleanRoughing = true;
      const { calc, gcode } = await runCamProg(prog);

      const hardErrors = (calc.foundErrors || calc.errors || []).filter(e =>
        (typeof e === 'string') || (e && e.type && e.type !== 'warning'));
      expect(hardErrors, `hard errors: ${JSON.stringify(hardErrors)}`).toEqual([]);

      expect(gcode).toContain('HRUBOVANI');
      const stableGcode = gcode.replace(/^; Datum: .*/m, '; Datum: <normalized>');
      expect(pipelineSummary(calc)).toMatchSnapshot('pipeline-bool');
      expect(stableGcode).toMatchSnapshot('gcode-bool');
    });
  }
});
