// DOČASNÁ reprodukce — smazat po opravě
import { it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

it('dump guides + bridges part-10', async () => {
  const prog = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'cam', 'part-10-zapich-casting.camprog'), 'utf8'));
  const { calc } = await runCamProg(prog);
  const lines = [];
  for (const g of (calc.interferenceGuides || []))
    lines.push(`${g.kind}${g.downOnStock ? '[stock]' : ''} dolni ${g.x1.toFixed(1)},${g.z1.toFixed(1)} -> horni ${g.x2.toFixed(1)},${g.z2.toFixed(1)}${g.via ? ' via ' + g.via.map(v => v.x.toFixed(1) + ',' + v.z.toFixed(1)).join(' ') : ''}`);
  const mc = calc.machinableContour || [];
  for (const s of mc.filter(x => x.fromInsert))
    lines.push(`most ${s.type} ${s.p1.x.toFixed(1)},${s.p1.z.toFixed(1)} -> ${s.p2.x.toFixed(1)},${s.p2.z.toFixed(1)}`);
  expect(lines.join('\n')).toBe('');
}, 60000);
