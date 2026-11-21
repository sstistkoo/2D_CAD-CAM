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
  return lines.slice(Math.max(0, i - 6), i + 4);
}

describe('výměna dokončovacího nože v bodě výměny', () => {
  it('Sinumerik: G75 X a G75 Z těsně před T="DOKONCOVAK"', async () => {
    const w = await beforeFinishCall('sinumerik', (l) => /^T="DOKONCOVAK"/.test(l));
    const i = w.findIndex((l) => /^T="DOKONCOVAK"/.test(l));
    expect(w.slice(i - 2, i).map((l) => l.split(' ')[0] + ' ' + l.split(' ')[1][0])).toEqual(['G75 X', 'G75 Z']);
    // Vřeteno a chlazení stojí při výměně (jako při spojování částí).
    expect(w.slice(0, i).join('|')).toMatch(/M5\|M9\|G0 /);
    expect(w.slice(i + 1, i + 4)).toEqual([expect.stringMatching(/^G96 S/), 'M3', 'M8']);
  }, 180000);

  it('Fanuc: G28 U0 W0 těsně před T0505', async () => {
    const w = await beforeFinishCall('fanuc', (l) => /^T0505\b/.test(l));
    const i = w.findIndex((l) => /^T0505\b/.test(l));
    expect(w[i - 1]).toBe('G28 U0 W0');
    expect(w.slice(0, i).join('|')).toMatch(/M5\|M9\|G0 /);
    expect(w.slice(i + 1, i + 4)).toEqual([expect.stringMatching(/^G96 S\d+$/), 'M3', 'M8']);
  }, 180000);
});

// Slot zásobníku bez vc/f (starší či importovaný zásobník): dřív `G96 Sundefined`
// a dokončení celé `F0`. Teď hodnoty z panelu (finishEmit.js, finishFeed.js).
describe('dokončovací nůž ze zásobníku bez vc/f', () => {
  it.each(['sinumerik', 'fanuc', 'heidenhain'])('%s: žádné undefined ani F0', async (ctrl) => {
    const prog = { ...base, toolMagazine,
      params: { ...base.params, controlSystem: ctrl, doFinishing: true, finishingSlot: 1 } };
    const { gcode } = await runCamProg(prog);
    expect(gcode).not.toMatch(/undefined|NaN/);
    expect(gcode.split('\n').map(code).filter((l) => /\bF0*\.?0*(?![\d.])/.test(l) && /\bF/.test(l))).toEqual([]);
  }, 180000);
});

