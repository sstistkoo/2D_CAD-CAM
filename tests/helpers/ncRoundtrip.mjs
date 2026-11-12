// Společná smyčka testů cam-nc-roundtrip*: díl × řídicí systém → program →
// nezávislý interpret (ncInterpreter.mjs) × simulace aplikace × ostatní systémy.
import { readFileSync } from 'fs';
import { runCamProg } from './camHeadless.mjs';
import { interpretNc, checkAgainstSim, compareMoves } from './ncInterpreter.mjs';

export const CONTROLS = ['sinumerik', 'fanuc', 'heidenhain'];

/**
 * @param {string} file  cesta k .camprog
 * @param {object} [variant] přepsání klíčů fixture (flipX, flipZ) a `params`
 * @returns {Promise<string[]>} neshody (prázdné = v pořádku)
 */
export async function roundtripProblems(file, variant = {}) {
  const base = JSON.parse(readFileSync(file, 'utf8'));
  const { params: vParams = {}, ...vTop } = variant;
  const problems = [];
  let ref = null;
  for (const ctrl of CONTROLS) {
    const prog = { ...base, ...vTop, params: { ...base.params, ...vParams, controlSystem: ctrl } };
    const r = await runCamProg(prog);
    const sim = r.calcSim.simPath;
    if (!sim || sim.length < 2) { problems.push(`${ctrl}: prázdná simulace`); continue; }
    // Výchozí poloha = bezpečná poloha, jak ji bere simulace (u „zleva" zrcadlená).
    const interp = interpretNc(r.gcode, {
      dia: r.params.mode === 'DIAMON', start: { x: sim[0].x, z: sim[0].z },
      flipX: !!prog.flipX, flipZ: !!prog.flipZ,
    });
    problems.push(...checkAgainstSim(r.gcode, sim, interp).slice(0, 10).map((p) => `${ctrl} ${p}`));
    if (!ref) ref = interp;
    else problems.push(...compareMoves(ref, interp, ctrl));
  }
  return problems;
}
