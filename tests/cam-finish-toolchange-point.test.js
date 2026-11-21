// Výměna na dokončovací nůž jede do bodu výměny jako hlavička (audit 21. 11. 2026):
// Sinumerik G75 X/Z (pevný bod), Fanuc G28 U0 W0 — ne jen bezpečná poloha u dílu.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';

const base = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'cam', 'part-1.camprog'), 'utf8'));
const toolMagazine = [{ slot: 3, name: 'HRUBOVAK' }, { slot: 5, name: 'DOKONCOVAK' }];
const code = (l) => l.replace(/^\s*N\d+\s*/, '').replace(/\([^)]*\)|;.*$/g, '').trim();

async function beforeFinishCall(ctrl, call) {
  const prog = { ...base, toolMagazine,
    params: { ...base.params, controlSystem: ctrl, doFinishing: true, finishingSlot: 1 } };
  const lines = (await runCamProg(prog)).gcode.split('\n').map(code).filter(Boolean);
  const i = lines.findIndex(call);
  expect(i, `${ctrl}: výměna na dokončovací nůž chybí`).toBeGreaterThan(0);
  return lines.slice(Math.max(0, i - 3), i);
}

describe('výměna dokončovacího nože v bodě výměny', () => {
  it('Sinumerik: G75 X a G75 Z těsně před T="DOKONCOVAK"', async () => {
    const prev = await beforeFinishCall('sinumerik', (l) => /^T="DOKONCOVAK"/.test(l));
    expect(prev.slice(-2).map((l) => l.split(' ')[0] + ' ' + l.split(' ')[1][0])).toEqual(['G75 X', 'G75 Z']);
  }, 180000);

  it('Fanuc: G28 U0 W0 těsně před T0505', async () => {
    const prev = await beforeFinishCall('fanuc', (l) => /^T0505\b/.test(l));
    expect(prev[prev.length - 1]).toBe('G28 U0 W0');
  }, 180000);
});
