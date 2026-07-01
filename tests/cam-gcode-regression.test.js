// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM regrese: celý pipeline (kontura → dráhy → G-kód)         ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Pouští REÁLNÝ calculate() + generateAutoGCode() nad uloženými .camprog
// (tests/fixtures/cam/*.camprog) a snapshotuje výstup. Jakákoli změna v logice
// hrubování/obrobitelné kontury/mezních čar, která změní G-kód, se hned ukáže
// jako diff snapshotu — konec "střílení naslepo". Když je změna ZÁMĚRNÁ, snapshot
// se přepíše: `npx vitest run cam-gcode-regression -u`.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures', 'cam');
const fixtures = readdirSync(fixturesDir).filter(f => f.endsWith('.camprog')).sort();

// Kompaktní shrnutí struktury pipeline (bez plovoucího šumu) — rychle napoví,
// KDE se něco změnilo (kontura vs dráhy), i když se G-kód liší jen kousek.
function pipelineSummary(calc) {
  const seg = (s) => s.type === 'line'
    ? `L (${s.p1.x.toFixed(2)},${s.p1.z.toFixed(2)})->(${s.p2.x.toFixed(2)},${s.p2.z.toFixed(2)})${s.fromInsert ? ' {ins}' : ''}`
    : `A r=${s.r.toFixed(2)} ${s.dir}${s.fromInsert ? ' {ins}' : ''}`;
  const mc = (calc.machinableContour || calc.contourSegments || []).filter(s => !s.isDegenerate);
  const guides = (calc.interferenceGuides || []).map(g =>
    `${g.kind}${g.downOnStock ? '/stock' : ''}: (${g.x1.toFixed(2)},${g.z1.toFixed(2)})->(${g.x2.toFixed(2)},${g.z2.toFixed(2)})`);
  const passTags = (calc.passes || []).map((p) => {
    const tags = ['pocketClean', 'pocketReposition', 'pocketEntry', 'ramp', 'contourLeadIn', 'contourLeadOut', 'backside', 'blocked']
      .filter(t => p[t]).join(',');
    return `${p.type}${tags ? '{' + tags + '}' : ''}`;
  });
  return {
    machinableContour: mc.map(seg),
    interferenceGuides: guides,
    passCount: (calc.passes || []).length,
    passTags,
  };
}

describe('CAM pipeline regrese (G-kód + struktura)', () => {
  it('nalezeny fixtures', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const file of fixtures) {
    it(`${file} → stabilní G-kód`, async () => {
      const prog = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'));
      const { calc, gcode } = await runCamProg(prog);

      // Bez chyb výpočtu (varování jsou OK, ale hard errors ne).
      const hardErrors = (calc.foundErrors || calc.errors || []).filter(e =>
        (typeof e === 'string') || (e && e.type && e.type !== 'warning'));
      expect(hardErrors, `hard errors: ${JSON.stringify(hardErrors)}`).toEqual([]);

      // G-kód musí být neprázdný a validně tvarovaný.
      expect(gcode).toContain('HRUBOVANI');
      expect(gcode.split('\n').length).toBeGreaterThan(20);

      expect(pipelineSummary(calc)).toMatchSnapshot('pipeline');
      expect(gcode).toMatchSnapshot('gcode');
    });
  }
});
