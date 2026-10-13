// Kreslení plátna CAM simulátoru (bývalý blok CANVAS DRAWING = funkce draw()
// v camSimulator.js, Fáze 5 docs/plan-rozdeleni-cam-simulatoru.md). Spočte
// převod svět → obrazovka a vykreslí vrstvy v původním pořadí:
//   drawStock.js     mřížka, osy, polotovar (úběr), díry, hranice posuvu
//   drawContour.js   kontura, trasování, rušení, konstrukční a offsetové čáry
//   drawToolpath.js  průchody, dráha programu, upichnutí, nástroj při simulaci
//   drawOverlays.js  body, profil, úseky, meze, výběr, SNAP
// Vrstvy si nic nepřepisují; sdílí jen „snímek" f (calc, prms, toScreen, …).
import { drawStockLayer } from './drawStock.js';
import { drawContourLayer } from './drawContour.js';
import { drawToolpathLayer } from './drawToolpath.js';
import { drawOverlayLayer } from './drawOverlays.js';

/**
 * @param d stav a funkce simulátoru (skládá se při každém kreslení, ať vrstvy
 *   vidí aktuální `let` proměnné tažení/hoveru):
 *   { S, canvas, ctx, getRemovalModel, getRemovalOuterModel, partsActive, _sampleStockOutlineWorld, _clipOutlineOutsideContour, getStockPlanOutline, _drawPointsContour, getGNodes, _draggingPartOff, motionOverlay, preDrillPhase, showMotionInfo, simTimeProfile, toolMirrored, getHolderGouge, getContourGouge, _draggingStock, _hoverContourSeg, _draggedContourSeg, _draggingStockPt, _camAutoSegs, _camAutoRevealCount, getSectionLeftover }
 */
export function drawCanvas(d) {
  const { S, canvas, ctx } = d;
  const calc = S._cachedCalc;
  if (!calc) return;
  const prms = S.params;
  const w = canvas.width, h = canvas.height;
  if (w <= 0 || h <= 0) return;

  const C = {
    bg: '#1e1e2e', grid: '#313244', axis: '#f38ba8', stock: '#6c7086',
    contour: '#89b4fa', offset: '#cba6f7', pass: '#a6e3a1', finish: '#f5c2e7',
    error: '#f38ba8', text: '#6c7086', tool: '#f9e2af', insert: 'rgba(186,194,222,0.7)',
    // Nedokončené trasování profilu (ruční i Auto/Krok náhled) — bílá, ať je
    // vidět i na modré konturové čáře (stejně jako v CAD, viz profileTraceClick.js).
    trace: '#ffffff'
  };

  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);
  const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
  const toScreen = (x, z) => {
    if (isNaN(x) || isNaN(z)) return { x: 0, y: 0 };
    if (prms.machineStructure === 'carousel')
      return { x: S.view.panX + hS * x * S.view.scale, y: S.view.panY + vS * z * S.view.scale };
    return { x: S.view.panX + hS * z * S.view.scale, y: S.view.panY + vS * x * S.view.scale };
  };

  const f = { ...d, calc, prms, w, h, C, vS, hS, toScreen };
  drawStockLayer(f);
  drawContourLayer(f);
  drawToolpathLayer(f);
  drawOverlayLayer(f);
}
