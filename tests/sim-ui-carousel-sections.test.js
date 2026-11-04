// @vitest-environment happy-dom
// Karusel po X: „✂ Po úsecích" s VÍC úseky (cam/sim/xzSections.js). Fixture
// `carousel-sections3` = soustruhový díl `round-r10-section2-parts` s
// prohozenými osami (a bezpečnou polohou), takže prohozený svět karuselu je
// přesně ten soustruhový díl. Programy úseků proto musí po prohození os
// vyjít řádek po řádku stejně jako na soustruhu (3 úseky, 4. 11. 2026).
import { describe, it, expect } from 'vitest';
import { installSimDom, openSim, loadFixture, settle } from './helpers/simUi.mjs';
import { swapGCodeText } from '../js/calculators/cam/xzSwap.js';

async function runSections(prog, machine) {
  installSimDom();
  const { state } = await import('../js/state.js');
  state.machineType = machine;
  const sim = await openSim(prog, { settleMs: 300 });
  const { S } = sim;
  S.opParts = []; S.activePart = 0;
  sim.q('[data-code="section-paths"]').click();
  for (let k = 0; k < 120 && !(S.opParts || []).length; k++) {
    await settle(500);
    const ov = document.querySelector('.cam-confirm-overlay button');
    if (ov) ov.click();
  }
  await settle(1500);
  const parts = S.opParts.map(p => ({ name: p.name, gcode: p.gcode }));
  await sim.close();
  return parts;
}
const moves = (t) => t.split('\n').filter(l => /^N\d+ G[0-3]\b/.test(l))
  .map(l => l.replace(/^N\d+ /, '').replace(/\s*;.*$/, '').trim()
    .replace(/(-?\d+\.\d+|-?\d+)/g, (m) => String(Math.round(parseFloat(m) * 100) / 100)));

describe('karusel po X: ✂ Po úsecích se 3 úseky', () => {
  it('úseky jako na soustruhu (po prohození os řádek po řádku)', async () => {
    const L = loadFixture('cam-cases/round-r10-section2-parts.camprog');
    L.opParts = [];
    L.zLimits = { ...(L.zLimits || {}), chuckActive: false, tailActive: false, rangeActive: false };
    L.xLimits = { active: false };
    const lathe = await runSections(L, 'soustruh');
    const car = await runSections(loadFixture('cam-cases/carousel-sections3.camprog'), 'karusel');
    expect(lathe.map(p => p.name)).toEqual(['Úsek 1', 'Úsek 2', 'Úsek 3']);
    expect(car.map(p => p.name)).toEqual(lathe.map(p => p.name));
    for (let i = 0; i < lathe.length; i++) {
      expect(car[i].gcode).toMatch(/- KARUSEL/);
      expect(moves(swapGCodeText(car[i].gcode, { toReal: false, dia: false }))).toEqual(moves(lathe[i].gcode));
    }
  }, 600000);
});
