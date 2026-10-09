// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – nájezdová rampa dokončení jen tam, kde řeže (pravidlo 5)║
// ╚══════════════════════════════════════════════════════════════╝
//
// Přibližovací bod rampy ležel 2 mm nad cílem; při úhlu zanoření 5°
// (polygon CCMT) to dalo rampu 22,9 mm skoro celou vzduchem — nájezd na střed
// čela i návrat za nedosažitelný zápich (`G0 Z6.860`, `G1 X15.400 Z-16.000`
// nad hotovou plošinou). Teď rampa začne v prvním bodě téže přímky, kde má
// nos pod sebou celou Vůli X a v pásu Vůle Z nic výš — dál se jede
// rychloposuvem. Rampa zůstane aspoň průměr nosu (min. 1 mm), ať se na
// hotovou plochu dosedá ze strany. Klíč plátku `finishRampFromContact`.
// Za zápichem jede nos nad zbytkem jen 0,2–0,3 mm (zbytek leží pod úhlem
// zanoření jako rampa), takže tam zůstává ~15 mm posuvu v pásu Vůle 1 mm.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runCamProg } from './helpers/camHeadless.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const P = (pts) => pts.map(([z, x], i) => ({ id: i + 1, type: i ? 'G1' : 'G0', x, z, r: 0, mode: 'ABS' }));

/** Nájezdy dokončení: G1 hned po rychloposuvu (případně po svislém G1). */
function finishLeadIns(gcode) {
  const out = [];
  let on = false, x = null, z = null, prevRapid = false;
  for (const raw of gcode.split('\n')) {
    if (/DOKON/i.test(raw) && raw.includes(';')) on = true;
    const code = raw.split(/[;(]/)[0].replace(/^N\d+\s+/, '').trim();
    const g = code.match(/\bG0?([01])\b/);
    const mx = code.match(/X(-?\d*\.?\d+)/), mz = code.match(/Z(-?\d*\.?\d+)/);
    const nx = mx ? +mx[1] : x, nz = mz ? +mz[1] : z;
    if (g && on && g[1] === '1' && prevRapid && mz && x !== null) {
      out.push({ len: Math.hypot(nx - x, nz - z), dx: Math.abs(nx - x), dz: Math.abs(nz - z), line: raw.trim() });
    }
    if (g) prevRapid = g[1] === '0' || (prevRapid && g[1] === '1' && !mz);
    x = nx; z = nz;
  }
  return out;
}

describe('CAM: nájezdová rampa dokončení (polygon)', () => {
  it('CCMT 5°, hřídel se zápichem: nájezd na čelo i za zápich bez dlouhé rampy vzduchem', async () => {
    const params = {
      mode: 'RADIUS', speed: 180, feed: 0.2, depthOfCut: 1, retractDistance: 1, allowanceX: 0.3, allowanceZ: 0.1,
      noStepRoughing: true, roughingStrategy: 'longitudinal', roughingSide: 'right', stockMode: 'cylinder',
      stockDiameter: 40, stockLength: 32, stockFace: 0, safeX: 30, safeZ: 5, partOffZ: null,
      toolShape: 'polygon', toolLength: 9.67, toolAngle: 5, toolTipAngle: 80, toolRadius: 0.4, toolTipFlat: 0.1,
      toolTipMirror: false, toolVbdCode: 'CCMT09T304', toolClearanceAngle: 7,
      holderLength: 125, holderWidth: 20, holderHand: 'R', knifeAngle: 270, holderInflate: 0, holderInflateAll: false,
      holderProfile: { sideA: [{ x: 8.27, z: 1.326 }, { x: 24.602, z: 8.941 }, { x: 24.602, z: 125 }, { x: 4.602, z: 125 },
        { x: 4.602, z: 26 }, { x: 3.818, z: 26 }, { x: 1.326, z: 8.27 }, { x: 8.27, z: 1.326 }], sideB: [] },
    };
    const contour = [[0, 0], [0, 15], [-10, 15], [-10, 12], [-16, 12], [-16, 15], [-30, 15], [-30, 20], [-32, 20]];
    const { gcode } = await runCamProg({ params, contourPoints: P(contour), stockPoints: [] });
    const ramps = finishLeadIns(gcode);
    expect(ramps.length).toBeGreaterThanOrEqual(2);
    for (const r of ramps) expect(r.len, r.line).toBeGreaterThanOrEqual(0.99);   // dosednutí ze strany
    const face = ramps.find(r => /X0\.000 Z0\.400/.test(r.line));
    const back = ramps.find(r => /X15\.400 Z-16\.000/.test(r.line));   // návrat za zápich
    expect(face && back, 'nájezd na čelo i za zápich').toBeTruthy();
    expect(face.len, face.line).toBeLessThan(3);      // dřív 22,9 mm
    expect(back.len, back.line).toBeLessThan(16);     // dřív 22,9 mm
  });

  it('díl s přídavkem 0 (holder-casting-slanted-face): rampa ≥ průměr nosu, ne svislý dosed', async () => {
    const prog = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'cam', 'holder-casting-slanted-face.camprog'), 'utf8'));
    const { gcode, params } = await runCamProg(prog);
    const ramps = finishLeadIns(gcode).filter(r => r.dz > 1e-3);
    expect(ramps.length).toBeGreaterThan(0);
    const d = Math.max(1, 2 * (parseFloat(params.toolRadius) || 0));
    for (const r of ramps) expect(r.len, r.line).toBeGreaterThanOrEqual(d - 0.02);
  });
});
