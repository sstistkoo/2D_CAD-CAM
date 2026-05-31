// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Nástroj: Hvězda                                    ║
// ║  Generuje přes makerjs.models.Star                          ║
// ╚══════════════════════════════════════════════════════════════╝

import { showToast } from '../state.js';
import { addObject } from '../objects.js';
import { renderAll } from '../render.js';
import { showStarDialog } from '../dialogs/starDialog.js';
import { getMaker } from '../dxf.js';
import { makerModelToPolylines } from '../lib/makerjsBridge.js';

export function resetStarState() { /* dialog je modální */ }

export function handleStarClick(wx, wy) {
  showStarDialog((params) => {
    if (!params) return;
    const mk = getMaker();
    if (!mk || !mk.models || !mk.models.Star) {
      showToast('Maker.js Star není dostupný');
      return;
    }
    const { points, outerRadius, innerRadius } = params;
    const star = new mk.models.Star(points, outerRadius, innerRadius);
    const polys = makerModelToPolylines(mk, star, wx, wy);
    if (polys.length === 0) {
      showToast('Hvězda se nepodařila vytvořit');
      return;
    }
    for (const p of polys) {
      addObject({
        type: 'polyline',
        vertices: p.vertices,
        bulges: p.bulges,
        closed: p.closed,
        skipIntersections: true,
        name: `Hvězda ${points}*`,
      });
    }
    renderAll();
    showToast(`Hvězda ${points} cípů přidána ✓`);
  });
}
