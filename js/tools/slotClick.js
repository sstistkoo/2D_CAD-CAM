// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Nástroj: Drážka                                     ║
// ║  Na díle v nárysu = drážka pro pero do pláště (CAM frézuje), ║
// ║  jinde oválná drážka přes makerjs.models.Slot (2D kresba).  ║
// ╚══════════════════════════════════════════════════════════════╝
// Klepnutí na díl v nárysu (obrys / materiál, mimo bokorys) otevře ⊐ Drážka
// pro pero (calculators/shellSlot.js) se Z klepnutí jako středem drážky;
// klepnutí na existující drážku pro pero ji otevře k úpravě (uživatel
// 22. 10. 2026). V okně jde přepnout na obecný ovál.

import { showToast, withUndoBatch } from '../state.js';
import { addObject } from '../objects.js';
import { renderAll } from '../render.js';
import { showSlotDialog } from '../dialogs/slotDialog.js';
import { getMaker } from '../dxf.js';
import { faceViewOn } from '../faceView/faceLayer.js';
import { inFaceDisc } from '../faceView/faceReference.js';
import { shellZAt } from '../faceView/shellHoles.js';
import { shellSlotAt } from '../faceView/shellHoleDraw.js';
import { openShellSlotCalc } from '../calculators/shellSlot.js';
import { makerModelToPolylines } from '../lib/makerjsBridge.js';

export function resetSlotState() { /* dialog je modální, žádný persistentní stav */ }

/**
 * Klik při aktivním nástroji „slot": klik na plátno → dialog → po potvrzení
 * se objekt umístí středem na pozici kliknutí.
 */
export function handleSlotClick(wx, wy) {
  const inDisc = faceViewOn() && inFaceDisc(wx, wy);
  const hit = !inDisc && shellSlotAt(wx, wy);
  if (hit) { openShellSlotCalc({ edit: hit }); return; }
  const z = inDisc ? null : shellZAt(wx, wy);
  if (z !== null) { openShellSlotCalc({ z }, () => ovalSlot(wx, wy)); return; }
  ovalSlot(wx, wy);
}

/** Obecná oválná drážka (2D kresba) se středem v místě klepnutí. */
function ovalSlot(wx, wy) {
  showSlotDialog((params) => {
    if (!params) return;
    const mk = getMaker();
    if (!mk || !mk.models || !mk.models.Slot) {
      showToast('Maker.js Slot není dostupný');
      return;
    }
    const { length, width, angle } = params;
    const r = width / 2;
    const half = length / 2;

    // Slot s osou na X, středem v (0,0): od (-half,0) do (+half,0)
    const slot = new mk.models.Slot([-half, 0], [half, 0], r);

    // Volitelná rotace okolo (0,0)
    if (angle) mk.model.rotate(slot, angle, [0, 0]);

    const polys = makerModelToPolylines(mk, slot, wx, wy);
    if (polys.length === 0) {
      showToast('Slot se nepodařilo vytvořit');
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
          name: `Drážka ${length}×${width}`,
        });
      }
    });
    renderAll();
    showToast(`Drážka ${length}×${width} mm přidána ✓`);
  });
}
