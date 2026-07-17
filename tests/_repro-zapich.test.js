// DOČASNÁ reprodukce — smazat po opravě
import { it, expect } from 'vitest';
import fs, { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

it('dump guides + bridges part-10', async () => {
  const prog = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'cam', 'part-10-zapich-casting.camprog'), 'utf8'));
  
  const { calc, calcSim, gcode } = await runCamProg(prog);
  const lines = [];
  lines.push(`CALC1 passes: ${calc.passes.length} | CALC2 passes: ${(calcSim && calcSim.passes || []).length}`);
  for (const p of (calcSim && calcSim.passes || [])) {
    if (p.type === 'long' && p.x < 22 && Math.min(p.zStart, p.zEnd) < 40 && Math.max(p.zStart, p.zEnd) > 10)
      lines.push(`calc2skin x${p.x.toFixed(1)} z${p.zStart.toFixed(1)}->${p.zEnd.toFixed(1)}${p.ramp ? ' RAMPA ' + p.ramp.x0.toFixed(1) + ',' + p.ramp.z0.toFixed(1) : ''}`);
  }
  // Průchody v oblasti údolí (z 20..75): typ + rampa + rozsah
  for (const p of calc.passes) {
    if (p.type !== 'long') continue;
    const zHi = Math.max(p.zStart, p.zEnd), zLo = Math.min(p.zStart, p.zEnd);
    if (false) continue;
    lines.push(`pass[${p._r || '?'}] x${p.x.toFixed(1)} z${p.zStart.toFixed(1)}->${p.zEnd.toFixed(1)}`
      + (p.ramp ? ` RAMPA od ${p.ramp.x0.toFixed(1)},${p.ramp.z0.toFixed(1)}` : '')
      + (p.contourLeadIn ? ' leadIn' : '') + (p.contourLeadOut ? ' leadOut' : '')
      + (p.pocketClean ? ' CLEAN' : '') + (p.pocketEntry ? ' entry' : '') + (p.pocketReposition ? ' repo' : ''));
  }
  for (const g of (calc.interferenceGuides || []))
    lines.push(`${g.kind}${g.downOnStock ? '[stock]' : ''}${g.downClipped ? '[clip]' : ''}${g._dominated ? '[dom]' : ''} dolni ${g.x1.toFixed(1)},${g.z1.toFixed(1)} -> horni ${g.x2.toFixed(1)},${g.z2.toFixed(1)}${g.via ? ' via ' + g.via.map(v => v.x.toFixed(1) + ',' + v.z.toFixed(1)).join(' ') : ''}`);
  const mc = calc.machinableContour || [];
  for (const s of mc.filter(x => x.fromInsert))
    lines.push(`most ${s.type} ${s.p1.x.toFixed(1)},${s.p1.z.toFixed(1)} -> ${s.p2.x.toFixed(1)},${s.p2.z.toFixed(1)}`);
  // machinable kontura v oblasti údolí (z 20..80)
  for (const s of mc) {
    const sp = s.type === 'line' ? s.p1 : { x: s.cx + Math.sin(s.startAngle) * s.r, z: s.cz + Math.cos(s.startAngle) * s.r };
    const ep = s.type === 'line' ? s.p2 : { x: s.cx + Math.sin(s.endAngle) * s.r, z: s.cz + Math.cos(s.endAngle) * s.r };
    if (Math.max(sp.z, ep.z) > 20 && Math.min(sp.z, ep.z) < 80)
      lines.push(`mc ${s.type}${s.fromInsert ? '[ins]' : ''}${s.chainBreak ? '[BRK]' : ''} ${sp.x.toFixed(1)},${sp.z.toFixed(1)} -> ${ep.x.toFixed(1)},${ep.z.toFixed(1)}`);
  }
  // offsetPath v oblasti údolí
  for (const s of calc.offsetPath || []) {
    if (s.isDegenerate) continue;
    const sp = s.type === 'line' ? s.p1 : { x: s.cx + Math.sin(s.startAngle) * s.r, z: s.cz + Math.cos(s.startAngle) * s.r };
    const ep = s.type === 'line' ? s.p2 : { x: s.cx + Math.sin(s.endAngle) * s.r, z: s.cz + Math.cos(s.endAngle) * s.r };
    if (Math.max(sp.z, ep.z) > 30 && Math.min(sp.z, ep.z) < 60)
      lines.push(`off ${s.type}${s.chainBreak ? '[BRK]' : ''} ${sp.x.toFixed(1)},${sp.z.toFixed(1)} -> ${ep.x.toFixed(1)},${ep.z.toFixed(1)}`);
  }
  fs.writeFileSync(join(__dirname, '..', 'repro-dump.txt'), lines.join('\n'));
  expect(true).toBe(true);
}, 60000);
