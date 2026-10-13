// @vitest-environment happy-dom
// Smoke test simulátoru (Fáze 0 plánu rozdělení camSimulator.js):
// otevře se nad fixture, vygeneruje program, vykreslí plátno a zavře se.
// Hlídá harness (tests/helpers/simUi.mjs), na kterém stojí testy jednotlivých
// bloků před jejich přestěhováním do js/calculators/cam/sim/.
import { describe, it, expect, beforeAll } from 'vitest';
import { installSimDom, openSim, loadFixture, settle, SIM_STORAGE_KEY } from './helpers/simUi.mjs';

beforeAll(() => installSimDom());

describe('simulátor — otevření nad fixture', () => {
  it('otevře se, vygeneruje program, vykreslí a zavře', async () => {
    const prog = loadFixture('cam/part-1.camprog');
    const sim = await openSim(prog);
    try {
      expect(sim.root).not.toBeNull();
      // Stav z „localStorage" = fixture.
      expect(sim.S.contourPoints).toEqual(prog.contourPoints);
      expect(sim.S.params.roughingStrategy).toBe(prog.params.roughingStrategy);
      // Program vygenerovaný (fixture ho nemá uložený).
      const gcode = sim.q('.cam-sim-manual-ta').value;
      expect(gcode.split('\n').length).toBeGreaterThan(20);
      expect(gcode).toMatch(/G1\s/);
      // Plátno se opravdu kreslilo (draw() neskončil na nulové velikosti).
      expect(sim.canvas.width).toBeGreaterThan(0);
      expect(sim.drawCalls().filter(c => c[0] === 'lineTo').length).toBeGreaterThan(50);
      // Stav se uložil.
      expect(JSON.parse(localStorage.getItem(SIM_STORAGE_KEY)).contourPoints).toEqual(prog.contourPoints);
      // Postranní panel CAD je po dobu CAM schovaný.
      expect(document.getElementById('sidebar').style.display).toBe('none');
    } finally {
      await sim.close();
    }
    expect(document.querySelector('.cam-sim-root')).toBeNull();
    expect(document.getElementById('sidebar').style.display).toBe('');
  });

  it('dá se otevřít znovu a překreslení po změně pohledu kreslí', async () => {
    const sim = await openSim(loadFixture('cam/part-1.camprog'));
    try {
      sim.clearDrawCalls();
      sim.q('[data-act="fit"]').click();
      await settle();
      expect(sim.drawCalls().length).toBeGreaterThan(0);
    } finally {
      await sim.close();
    }
  });
});
