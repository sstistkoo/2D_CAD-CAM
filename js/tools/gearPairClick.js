// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Nástroj: Pár zabírajících ozubených kol           ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Vykreslí dvě zabírající čelní kola se správnou osovou vzdáleností
// a fázovou rotací druhého kola, aby zuby zapadaly do mezer.

import { showToast, withUndoBatch } from '../state.js';
import { addObject } from '../objects.js';
import { renderAll } from '../render.js';
import { showGearPairDialog } from '../dialogs/gearPairDialog.js';
import { generateFullGearProfile, calculateGearDimensions } from './gearGenerator.js';
import { computeGearPairLayout, rotateProfile } from './gearPairMath.js';

export { computeGearPairLayout, rotateProfile }; // re-export pro testy

export function resetGearPairState() { /* dialog je modální */ }

export function handleGearPairClick(wx, wy) {
  showGearPairDialog((params) => {
    if (!params) return;
    const { m, z1, z2, alpha, x1, x2, steps, addRefCircles, addAxisLine } = params;
    const cx1 = wx, cy1 = wy;
    const { axis, cx2, cy2, rotation2 } = computeGearPairLayout(params, cx1, cy1);

    withUndoBatch(() => {

    // Kolo A (pastorek)
    const profile1 = generateFullGearProfile(m, z1, alpha, x1, steps, cx1, cy1);
    addObject({
      type: 'polyline',
      vertices: profile1.vertices,
      bulges: profile1.bulges,
      closed: true,
      skipIntersections: true,
      name: `Pár A: m${m} z${z1}`,
    });

    // Kolo B (rotované a posunuté)
    const profile2 = generateFullGearProfile(m, z2, alpha, x2, steps, cx2, cy2);
    const rotated2 = rotateProfile(profile2, cx2, cy2, rotation2);
    addObject({
      type: 'polyline',
      vertices: rotated2.vertices,
      bulges: rotated2.bulges,
      closed: true,
      skipIntersections: true,
      name: `Pár B: m${m} z${z2}`,
    });

    // Volitelně ref kružnice (roztečné u obou kol)
    if (addRefCircles) {
      const dim1 = calculateGearDimensions(m, z1, alpha, x1);
      const dim2 = calculateGearDimensions(m, z2, alpha, x2);
      addObject({
        type: 'circle', cx: cx1, cy: cy1, r: dim1.rp,
        name: `Roztečná A ⌀${(dim1.rp * 2).toFixed(1)}`,
        layer: 1, dashed: true, skipIntersections: true,
      });
      addObject({
        type: 'circle', cx: cx2, cy: cy2, r: dim2.rp,
        name: `Roztečná B ⌀${(dim2.rp * 2).toFixed(1)}`,
        layer: 1, dashed: true, skipIntersections: true,
      });
    }

    // Volitelně osa spojnice středů
    if (addAxisLine) {
      addObject({
        type: 'line',
        x1: cx1, y1: cy1, x2: cx2, y2: cy2,
        name: `Osa AB a=${axis.toFixed(2)}`,
        layer: 1, dashed: true,
      });
    }

    renderAll();
    showToast(`Pár kol m=${m}, z₁=${z1}, z₂=${z2}, a=${axis.toFixed(1)} mm ✓`);
    });
  });
}
