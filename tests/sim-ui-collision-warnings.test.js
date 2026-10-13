// @vitest-environment happy-dom
// Varování kolizí v simulátoru (bloky „Validace kolizí držáku/destičky" +
// „Kolize držáku s materiálem" → js/calculators/cam/sim/collisionWarnings.js):
// ⛔ hlášky validátoru v panelu (debounce 600 ms po fullUpdate), okno
// „Nástroj je v materiálu" a oranžová stopa vnoření držáku při simulaci.
// Ručně psaný program — nezávisí na generátoru drah. Hodnoty = charakterizace
// starého kódu před přestěhováním.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { installSimDom, openSim, loadFixture, settle } from './helpers/simUi.mjs';

const CONTOUR = [
  { id: 1, type: 'G0', x: 0, z: 0, r: 0, mode: 'ABS' },
  { id: 2, type: 'G1', x: 40, z: 0, r: 0, mode: 'ABS' },
  { id: 3, type: 'G1', x: 40, z: -62.4, r: 0, mode: 'ABS' },
];
// Rychloposuv do polotovaru (Ø66) a pak posuv podél osy hluboko do materiálu.
const PROGRAM = [
  'G0 X100 Z10',
  'G0 X50 Z-20',
  'G1 X50 Z-25 F0.2',
  'G0 X100 Z10',
  'G1 X20 Z5 F0.2',
  'G1 X20 Z-60',
  'G0 X100 Z10',
].join('\n');

let sim;
beforeAll(async () => {
  installSimDom();
  sim = await openSim(loadFixture('cam/part-1.camprog'));
});
afterAll(async () => { await sim?.close(); });

const collisions = () => sim.S.errors.filter(e => e && e.collision).map(e => e.msg);

async function loadProgram({ safeX = 100, safeZ = 10 } = {}) {
  const { S } = sim;
  S.params.mode = 'DIAMON';
  S.params.respectInsertGeometry = true;
  S.params.stockMode = 'cylinder';
  S.params.stockDiameter = 66; S.params.stockLength = 66; S.params.stockFace = 2;
  S.params.safeX = safeX; S.params.safeZ = safeZ;
  S.contourPoints = structuredClone(CONTOUR);
  S.manualGCode = PROGRAM;
  S.gcodeDirty = true;
  S.simProgress = 0;
  sim.fullUpdate();
  await settle(700);   // debounce validátoru 600 ms
}

describe('simulátor — varování kolizí', () => {
  it('⛔ hlášky validátoru v panelu; vypnuté hlídání je smaže', async () => {
    await loadProgram();
    expect(collisions()).toMatchInlineSnapshot(`
      [
        "⛔ Rychloposuv materiálem (řádek 2, X100.0 Z10.0) — průnik ~71.7 mm².",
        "⛔ Rychloposuv materiálem (řádek 4, X50.0 Z-25.0) — průnik ~2.9 mm².",
        "⛔ Držák v kolizi se zbývajícím materiálem (řádek 6, X20.0 Z5.0) — průnik ~501.4 mm².",
        "⛔ Rychloposuv materiálem (řádek 7, X20.0 Z-60.0) — průnik ~108.8 mm².",
      ]
    `);
    expect(document.querySelector('.cam-start-popup')).toBeNull();
    sim.S.params.respectInsertGeometry = false;
    sim.fullUpdate();
    await settle(700);
    expect(collisions()).toEqual([]);
  });

  it('start v materiálu: hláška + okno, ⚙ Nastavit počáteční bod otevře Parametry', async () => {
    await loadProgram({ safeX: 50, safeZ: -20 });
    expect(collisions().filter(m => m.includes('počátečním bodu'))).toMatchInlineSnapshot(`
      [
        "⛔ Nástroj je v počátečním bodu (Bp X50 Z-20) v materiálu (nástroj v polotovaru) — průnik ~73.5 mm². Změň Bezpečnou polohu.",
      ]
    `);
    const pop = document.querySelector('.cam-start-popup');
    expect(pop).not.toBeNull();
    pop.querySelector('[data-r="set"]').click();
    expect(document.querySelector('.cam-start-popup')).toBeNull();
    expect([sim.S.activeTab, sim.S.safetyConfigOpen]).toEqual(['params', true]);
    // Okno jen při PŘECHODU mimo → v materiálu: stejné vstupy znovu = bez okna.
    sim.fullUpdate();
    await settle(700);
    expect(document.querySelector('.cam-start-popup')).toBeNull();
  });

  it('oranžová stopa vnoření držáku se kreslí až po projetí dráhy', async () => {
    await loadProgram();
    const orange = () => sim.drawCalls().filter(c => c[0] === '=' && c[1] === 'fillStyle' && (c[2] === 'rgba(250,140,50,0.55)' || c[2] === 'rgba(231,76,60,0.55)')).map(c => c[2]);
    sim.clearDrawCalls();
    sim.fullUpdate();
    expect(orange()).toEqual([]);
    sim.S.simProgress = 1;
    sim.clearDrawCalls();
    sim.fullUpdate();
    expect([...new Set(orange())]).toMatchInlineSnapshot(`
      [
        "rgba(231,76,60,0.55)",
        "rgba(250,140,50,0.55)",
      ]
    `);
  });
});
