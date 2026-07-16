// ╔══════════════════════════════════════════════════════════════╗
// ║  Offset kontury s různými přídavky X/Z (anizotropní)          ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Regresní ochrana proti „trojúhelníku": úsečky se offsetují po osách
// (aX v X, aZ v Z), oblouky se dřív posouvaly uniformně o max(aX, aZ) —
// konce nesedly na sousední úsečky a trimmer z krátkých úseků dělal
// trojúhelníkové artefakty (špičky). Oblouk je teď elipsa proložená
// G2/G3: offset musí být SPOJITÝ a bez špiček.
import { describe, it, expect } from 'vitest';
import { runCamProg } from './helpers/camHeadless.mjs';

// Tvar à la uživatelův případ: rádius → KRÁTKÁ úsečka → rádius
// (hřbet mezi dvěma oblouky) + rovné úseky kolem. RADIUS mode → x = poloměr.
const prog = {
  __camprog: 1,
  params: {
    machineType: 'LIMS=2000', mode: 'RADIUS', toolName: 'T1',
    speed: 200, feed: 0.25, depthOfCut: 2.0, retractDistance: 2.0, retractAngle: 45,
    allowanceX: 0, allowanceZ: 0.5, toolRadius: 0.8, finishAllowance: 0,
    doFinishing: true, roughingStrategy: 'longitudinal', roughingSide: 'right',
    stockMode: 'cylinder', stockDiameter: 90, stockLength: 80, stockFace: 2,
    safeX: 150, safeZ: 5, machineStructure: 'lathe', controlSystem: 'sinumerik',
    autoProfile: true, toolShape: 'round', toolLength: 10, toolAngle: 15,
    toolTipAngle: 90, toolClearanceAngle: 0,
    holderWidth: 0, holderLength: 0, holderHand: 'R', holderProfile: null,
    entryAngle: 30, entryAngleAuto: true, respectInsertGeometry: false,
    plungeRoughing: false, pocketFinishAtOnce: false,
    noStepRoughing: false, noStepRoughingFace: false, regionRoughing: false,
    rapidClearance: 1.0, partOffZ: null, threadActive: false,
  },
  contourPoints: [
    { id: 1, type: 'G0', x: 0, z: 0, r: 0, mode: 'ABS' },
    { id: 2, type: 'G1', x: 20, z: 0, r: 0, mode: 'ABS' },
    { id: 3, type: 'G1', x: 20, z: -15, r: 0, mode: 'ABS' },
    // rádius nahoru → krátká úsečka (1,5 mm) → rádius dolů (hřbet)
    { id: 4, type: 'G3', x: 30, z: -25, r: 10, mode: 'ABS' },
    { id: 5, type: 'G1', x: 30, z: -26.5, r: 0, mode: 'ABS' },
    { id: 6, type: 'G2', x: 25, z: -35, r: 9, mode: 'ABS' },
    { id: 7, type: 'G1', x: 25, z: -50, r: 0, mode: 'ABS' },
    { id: 8, type: 'G1', x: 40, z: -60, r: 0, mode: 'ABS' },
  ],
  stockPoints: [],
};

const segStart = (s) => s.type === 'line' ? s.p1
  : { x: s.cx + Math.sin(s.startAngle) * s.r, z: s.cz + Math.cos(s.startAngle) * s.r };
const segEnd = (s) => s.type === 'line' ? s.p2
  : { x: s.cx + Math.sin(s.endAngle) * s.r, z: s.cz + Math.cos(s.endAngle) * s.r };
const segDir = (s) => {
  const a = segStart(s), b = segEnd(s);
  return Math.atan2(b.x - a.x, b.z - a.z);
};

describe('anizotropní offset (aX=0, aZ=0.5) — rádius/úsečka/rádius', () => {
  it('offsetPath je spojitý a bez trojúhelníkových špiček', async () => {
    const { calc } = await runCamProg(prog);
    const path = calc.offsetPath.filter(s => !s.isDegenerate);
    expect(path.length).toBeGreaterThan(3);
    const gaps = [];
    const spikes = [];
    for (let i = 1; i < path.length; i++) {
      if (path[i].chainBreak) continue;
      const gap = Math.hypot(
        segStart(path[i]).x - segEnd(path[i - 1]).x,
        segStart(path[i]).z - segEnd(path[i - 1]).z);
      if (gap > 0.05) gaps.push(`seg ${i}: mezera ${gap.toFixed(3)} mm`);
      // Špička = ostrý obrat směru mezi sousedními segmenty (trojúhelník
      // měl obrat ~180°). Hladká kontura s tečnými přechody nesmí mít
      // obrat přes ~135°.
      let dA = segDir(path[i]) - segDir(path[i - 1]);
      while (dA > Math.PI) dA -= 2 * Math.PI;
      while (dA < -Math.PI) dA += 2 * Math.PI;
      if (Math.abs(dA) > (135 * Math.PI) / 180) spikes.push(`seg ${i}: obrat ${(dA * 180 / Math.PI).toFixed(0)}°`);
    }
    expect(gaps).toEqual([]);
    expect(spikes).toEqual([]);
  }, 30000);

  it('vršek konvexního oblouku je odsazen jen o R + aX (ne o aZ)', async () => {
    const { calc } = await runCamProg(prog);
    // Hřbet: konvexní G3 oblouk (id 4) vrcholí u x=30 — offset nahoře
    // (normála čistě v X) musí být 30 + R + aX = 30,8, ne 31,3.
    // Měří se jen v Z-okně hřbetu, ať výsledek nepřebije konec kontury.
    const zLo = -27, zHi = -16;
    let maxX = -Infinity;
    const take = (x, z) => { if (z >= zLo && z <= zHi) maxX = Math.max(maxX, x); };
    for (const s of calc.offsetPath) {
      if (s.isDegenerate) continue;
      if (s.type === 'line') {
        for (let t = 0; t <= 1; t += 0.05)
          take(s.p1.x + (s.p2.x - s.p1.x) * t, s.p1.z + (s.p2.z - s.p1.z) * t);
      } else {
        // vzorkovat oblouk
        let sA = s.startAngle, eA = s.endAngle;
        if (s.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
        if (s.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
        for (let t = 0; t <= 1; t += 0.05) {
          const a = sA + (eA - sA) * t;
          take(s.cx + Math.sin(a) * s.r, s.cz + Math.cos(a) * s.r);
        }
      }
    }
    expect(maxX).toBeGreaterThan(30.7);
    expect(maxX).toBeLessThan(30.95);
  }, 30000);
});
