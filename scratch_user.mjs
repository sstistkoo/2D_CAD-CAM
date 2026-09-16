import { runCamProg } from './tests/helpers/camHeadless.mjs';
import { validateToolpath } from './js/calculators/cam/collisionValidator.js';
import { readFileSync } from 'fs';

const prog = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { calc, calcSim, errors, params } = await runCamProg(prog);
const issues = validateToolpath(calcSim.simPath || [], params, calcSim.stockPathSegments,
  { backside: params.roughingSide === 'left', maxIssues: 60 });
const f = (k) => {
  const a = issues.filter(i => i.kind === k);
  return a.length ? `${a.length} / ${a.reduce((s, i) => s + i.area, 0).toFixed(1)} mm2` : '0';
};
console.log('pruchodu:', (calc.passes || []).length);
console.log('kolize rapid:', f('rapid'), '| kolize drzak:', f('holder'));
console.log('HLASKY (' + errors.length + '):');
for (const e of errors) console.log('  -', (typeof e === 'string' ? 'HARD: ' + e : e.msg));
// nejhlubsi pruchody v levem konci dilu (Z < 70)
const left = (calc.passes || []).filter(p => p.type === 'long' && p.zEnd < 70).map(p => +p.x.toFixed(3)).sort((a, b) => a - b);
console.log('nejmensi X v levem konci (Z<70):', left.slice(0, 6).join(', '));
