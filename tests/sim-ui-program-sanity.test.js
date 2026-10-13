// @vitest-environment happy-dom
// Uložený program s nesmyslnou souřadnicí (pozůstatek chyby generátoru do
// 27. 8. 2026: „N560 G0 X486708909.740" u upichováku s 90° zanořením) se při
// otevření CAM přegeneruje; ručně upravený zůstane. Bez toho ⛔ panel hlásil
// kolizi držáku na „X973417795…" (nález 13. 10. 2026). Viz cam/sim/programSanity.js.
import { describe, it, expect, beforeAll } from 'vitest';
import { installSimDom, openSim, loadFixture } from './helpers/simUi.mjs';
import { insaneCoordLines, MAX_COORD_MM } from '../js/calculators/cam/sim/programSanity.js';

beforeAll(() => installSimDom());

describe('insaneCoordLines', () => {
  it('najde X/Z/CR mimo rozsah stroje, komentáře a N/F/S ignoruje', () => {
    const code = [
      'N550 G1 X51.545 Z197.278',
      'N560 G0 X486708909.740',
      '; X99999999 jen v komentáři',
      'N570 G2 X10 Z-5 CR=123456',
      'N580 G1 Z-20000.5 F0.25',
      'N99999 G0 X50 S20000',
    ].join('\n');
    expect(insaneCoordLines(code).map(b => b.lineIdx)).toEqual([1, 3, 4]);
    expect(MAX_COORD_MM).toBe(10000);
  });
});

describe('otevření CAM s uloženým programem z doby chyby (part-18-parting-90-ramp)', () => {
  it('neupravený program se zahodí a dráhy se vygenerují znovu — bez nesmyslných souřadnic', async () => {
    const prog = loadFixture('cam/part-18-parting-90-ramp.camprog');
    expect(insaneCoordLines(prog.manualGCode).length).toBeGreaterThan(0);   // fixture je opravdu z doby chyby
    const sim = await openSim(prog);
    try {
      expect(sim.S.manualGCode).not.toBe(prog.manualGCode);
      expect(sim.S.manualGCode.split('\n').length).toBeGreaterThan(50);
      expect(insaneCoordLines(sim.S.manualGCode)).toEqual([]);
    } finally { await sim.close(); }
  });

  it('ručně upravený program zůstane (úpravy se nezahazují)', async () => {
    const prog = { ...loadFixture('cam/part-18-parting-90-ramp.camprog'), gcodeDirty: true };
    const sim = await openSim(prog);
    try {
      expect(sim.S.manualGCode).toBe(prog.manualGCode);
      expect(sim.S.gcodeDirty).toBe(true);
    } finally { await sim.close(); }
  });
});
