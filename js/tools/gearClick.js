// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Nástroj: Ozubení (spur, internal, rack, sprocket) ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, showToast } from '../state.js';
import { addObject } from '../objects.js';
import {
  generateFullGearProfile,
  calculateGearDimensions,
  generateInternalGearProfile,
  calculateInternalGearDimensions,
  generateRackProfile,
  calculateRackDimensions,
  generateSprocketProfile,
  calculateSprocketDimensions,
} from './gearGenerator.js';
import { showGearDialog } from '../dialogs/gearDialog.js';
import { renderAll } from '../render.js';

/** Resetuje stav nástroje gear (volá se při Escape / změně nástroje) */
export function resetGearState() {
  // žádný persistentní stav – dialog je modální
}

/** Přidá referenční kružnice (roztečná, hlavová, patní) */
function addRefCircles3(cx, cy, dim) {
  addObject({
    type: 'circle', cx, cy, r: dim.rp,
    name: `Roztečná ⌀${(dim.rp * 2).toFixed(1)}`,
    layer: 1, dashed: true, skipIntersections: true,
  });
  addObject({
    type: 'circle', cx, cy, r: dim.ra,
    name: `Hlavová ⌀${(dim.ra * 2).toFixed(1)}`,
    layer: 1, dashed: true, skipIntersections: true,
  });
  addObject({
    type: 'circle', cx, cy, r: dim.rf,
    name: `Patní ⌀${(dim.rf * 2).toFixed(1)}`,
    layer: 1, dashed: true, skipIntersections: true,
  });
}

/**
 * Kliknutí při aktivním nástroji "gear".
 * Klik na plátno → otevře dialog → po potvrzení se objekt automaticky umístí na pozici kliknutí.
 */
export function handleGearClick(wx, wy) {
  showGearDialog((params) => {
    if (!params) return;
    switch (params.gearType) {

      // ── Čelní kolo (spur) ──
      case 'spur': {
        const { m, z, alpha, x, steps, addRefCircles } = params;
        const profile = generateFullGearProfile(m, z, alpha, x, steps, wx, wy);
        addObject({
          type: 'polyline',
          vertices: profile.vertices,
          bulges: profile.bulges,
          closed: true,
          skipIntersections: true,
          name: `Ozub. kolo m${m} z${z}`,
        });
        if (addRefCircles) {
          addRefCircles3(wx, wy, calculateGearDimensions(m, z, alpha, x));
        }
        renderAll();
        showToast(`Čelní kolo m=${m} z=${z} přidáno ✓`);
        break;
      }

      // ── Vnitřní ozubení (internal) ──
      case 'internal': {
        const { m, z, alpha, x, steps, addRefCircles } = params;
        const profile = generateInternalGearProfile(m, z, alpha, x, steps, wx, wy);
        addObject({
          type: 'polyline',
          vertices: profile.vertices,
          bulges: profile.bulges,
          closed: true,
          skipIntersections: true,
          name: `Vnitřní ozub. m${m} z${z}`,
        });
        if (addRefCircles) {
          const dim = calculateInternalGearDimensions(m, z, alpha, x);
          addRefCircles3(wx, wy, dim);
          // Vnější rim kružnice (rámec)
          const rRim = dim.rf + 2.5 * m;
          addObject({
            type: 'circle', cx: wx, cy: wy, r: rRim,
            name: `Rim ⌀${(rRim * 2).toFixed(1)}`,
            layer: 1, dashed: false, skipIntersections: true,
          });
        }
        renderAll();
        showToast(`Vnitřní ozubení m=${m} z=${z} přidáno ✓`);
        break;
      }

      // ── Ozubený hřeben (rack) ──
      case 'rack': {
        const { m, z, alpha, x } = params;
        const profile = generateRackProfile(m, z, alpha, x, wx, wy);
        addObject({
          type: 'polyline',
          vertices: profile.vertices,
          bulges: profile.bulges,
          closed: profile.closed,
          skipIntersections: true,
          name: `Hřeben m${m} z${z}`,
        });
        renderAll();
        showToast(`Ozubený hřeben m=${m} z=${z} přidán ✓`);
        break;
      }

      // ── Řetězové kolo (sprocket) ──
      case 'sprocket': {
        const { pChain, z, d1, steps, addRefCircles } = params;
        const profile = generateSprocketProfile(pChain, z, d1, steps, wx, wy);
        addObject({
          type: 'polyline',
          vertices: profile.vertices,
          bulges: profile.bulges,
          closed: true,
          skipIntersections: true,
          name: `Řetěz. kolo p${pChain} z${z}`,
        });
        if (addRefCircles) {
          const dim = calculateSprocketDimensions(pChain, z, d1);
          addObject({
            type: 'circle', cx: wx, cy: wy, r: dim.rp,
            name: `Roztečná ⌀${dim.dp.toFixed(1)}`,
            layer: 1, dashed: true, skipIntersections: true,
          });
        }
        renderAll();
        showToast(`Řetězové kolo p=${pChain} z=${z} přidáno ✓`);
        break;
      }
    }
  });
}
