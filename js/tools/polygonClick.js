// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Nástroj: Pravidelný polygon                       ║
// ║  Generuje přes makerjs.models.Polygon                       ║
// ╚══════════════════════════════════════════════════════════════╝

import { showToast, withUndoBatch } from '../state.js';
import { addObject } from '../objects.js';
import { renderAll } from '../render.js';
import { showPolygonDialog } from '../dialogs/polygonDialog.js';
import { getMaker } from '../dxf.js';
import { makerModelToPolylines } from '../lib/makerjsBridge.js';

export function resetPolygonState() { /* dialog je modální */ }

export function handlePolygonClick(wx, wy) {
  showPolygonDialog((params) => {
    if (!params) return;
    const mk = getMaker();
    if (!mk || !mk.models || !mk.models.Polygon) {
      showToast('Maker.js Polygon není dostupný');
      return;
    }
    const { sides, radius, firstAngle, circumscribed } = params;
    const poly = new mk.models.Polygon(sides, radius, firstAngle, !!circumscribed);
    const polys = makerModelToPolylines(mk, poly, wx, wy);
    if (polys.length === 0) {
      showToast('Polygon se nepodařilo vytvořit');
      return;
    }
    withUndoBatch(() => {
      for (const p of polys) {
        addObject({
          type: 'polyline',
          vertices: p.vertices,
          bulges: p.bulges,
          closed: p.closed,
          skipIntersections: true,
          name: `Polygon ${sides}×${radius}`,
        });
      }
    });
    renderAll();
    showToast(`Polygon ${sides}-úhelník ⌀${(2 * radius).toFixed(1)} mm přidán ✓`);
  });
}
