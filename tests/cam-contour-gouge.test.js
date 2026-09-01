// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – červené varování „nůž zajel do hotové kontury"         ║
// ╚══════════════════════════════════════════════════════════════╝
//
// ContourGouge odpovídá na otázku, KTERÁ ČÁST hotového dílu už je odebraná
// (díl MÍNUS zbývající materiál) — simulátor ji vybarví červeně. Test drží
// dvě strany té odpovědi: řez pod konturou se najde, a legitimní obrábění
// (řez v polotovaru nad konturou, dokončovací průchod po kontuře) ne.
import { describe, it, expect } from 'vitest';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ContourGouge } from '../js/calculators/cam/contourGouge.js';
import { MaterialRemoval } from '../js/calculators/cam/materialRemoval.js';
import { runCamProgFile } from './helpers/camHeadless.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Válcový polotovar ∅100 × 100 (radius 0..50, axiálně −100..0), hotový díl
// ∅60 přes celou délku (kontura = svislá čára na poloměru 30).
function baseParams() {
  return {
    toolShape: 'round', toolRadius: 1, depthOfCut: 2, toolLength: 4,
    stockMode: 'cylinder', stockDiameter: 100, stockLength: 100, stockFace: 0,
  };
}
const contour = [{ type: 'line', p1: { x: 30, z: 0 }, p2: { x: 30, z: -100 } }];

/** Projede dráhu a vrátí { loops, area } zajetí do kontury. */
function run(prms, path, segs = contour) {
  const rm = new MaterialRemoval(prms, null);
  rm.advanceTo(path, path.length - 1);
  const cg = new ContourGouge(prms, segs, null);
  const loops = cg.update(rm.model.loops);
  return { cg, loops, area: cg.area };
}

const cut = (pts) => pts.map((p, i) => (i === 0 ? { x: p[0], z: p[1] } : { x: p[0], z: p[1], type: 'G1' }));

describe('ContourGouge – zajetí do hotové kontury', () => {
  it('najde řez vedený POD konturou', () => {
    // Střed špičky na poloměru 25 → celý plátek uvnitř dílu (∅60).
    const { loops, area } = run(baseParams(), cut([[25, -10], [25, -50]]));
    expect(loops.length).toBeGreaterThan(0);
    expect(area).toBeGreaterThan(40 * 2);   // délka 40 mm × min. průměr špičky
  });

  it('nehlásí nic, když se řeže jen polotovar nad konturou', () => {
    // Střed špičky na 40 → spodek plátku na 39, kontura je na 30.
    const { loops, area } = run(baseParams(), cut([[40, -10], [40, -50]]));
    expect(loops).toHaveLength(0);
    expect(area).toBe(0);
  });

  it('dokončovací průchod PO kontuře (dotyk) není zajezd', () => {
    // Střed špičky R1 přesně na dráze středu nosu hotové kontury (30 + 1).
    const { loops } = run(baseParams(), cut([[31, -5], [31, -95]]));
    expect(loops).toHaveLength(0);
  });

  it('stopa zůstane i po odjetí nože (materiál se nevrací)', () => {
    const path = [
      { x: 25, z: -10 }, { x: 25, z: -50, type: 'G1' },
      { x: 60, z: -50, type: 'G0' }, { x: 60, z: 0, type: 'G0' },
    ];
    const { area } = run(baseParams(), path);
    expect(area).toBeGreaterThan(40 * 2);
  });

  it('bez kontury (prázdná silueta) je akumulátor neplatný', () => {
    const cg = new ContourGouge(baseParams(), [], null);
    expect(cg.valid).toBe(false);
    expect(cg.update([[{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }]])).toHaveLength(0);
  });

  it('kontura vyčnívající PŘED polotovar se nepočítá jako odebraná', () => {
    // Díl ∅120 uvnitř polotovaru ∅100: přesah nikdy materiálem nebyl.
    const segs = [{ type: 'line', p1: { x: 60, z: 0 }, p2: { x: 60, z: -100 } }];
    const cg = new ContourGouge(baseParams(), segs, null);
    const rm = new MaterialRemoval(baseParams(), null);
    expect(cg.update(rm.model.loops)).toHaveLength(0);
  });

  it('čistě dokončovaný díl z fixture nehlásí zajezd', async () => {
    const { calc, calcSim, params } = await runCamProgFile(
      join(__dirname, 'fixtures', 'cam', 'part-14-finish-holder.camprog'));
    const rm = new MaterialRemoval(params, calc.stockPathSegments);
    rm.advanceTo(calcSim.simPath, calcSim.simPath.length - 1);
    const cg = new ContourGouge(params, calc.contourSegments, calc.stockPathSegments);
    expect(cg.valid).toBe(true);
    expect(cg.update(rm.model.loops)).toHaveLength(0);
  });
});
