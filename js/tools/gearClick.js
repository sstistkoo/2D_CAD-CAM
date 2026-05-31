// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Nástroj: Ozubení (spur, internal, rack, sprocket) ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, showToast, withUndoBatch } from '../state.js';
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

/**
 * Přidá referenční kružnice (roztečná, hlavová, patní) a volitelně
 * textové popisky s číselnou hodnotou průměru, umístěné nad horní
 * polovinou kružnice (textové gravury, čitelné jak na obrazovce tak
 * v DXF exportu).
 *
 * @param {number} cx
 * @param {number} cy
 * @param {{rp:number, ra:number, rf:number}} dim
 * @param {{addDimensions?:boolean, fontSize?:number}} [opts]
 */
function addRefCircles3(cx, cy, dim, opts = {}) {
  const addDims = !!opts.addDimensions;
  // Velikost popisku úměrná velikosti kola; minimální 2 mm, maximální 8 mm
  const labelSize = opts.fontSize || Math.max(2, Math.min(8, dim.rp * 0.08));

  const circles = [
    { r: dim.rp, label: 'Roztečná' },
    { r: dim.ra, label: 'Hlavová' },
    { r: dim.rf, label: 'Patní' },
  ];

  for (const c of circles) {
    addObject({
      type: 'circle', cx, cy, r: c.r,
      name: `${c.label} ⌀${(c.r * 2).toFixed(1)}`,
      layer: 1, dashed: true, skipIntersections: true,
    });
    if (addDims) {
      // Popisek umístěný uvnitř kružnice nahoře (lépe se hodí pro CAM)
      addObject({
        type: 'text',
        x: cx - labelSize * 2,
        y: cy + c.r - labelSize * 0.6,
        text: `⌀${(c.r * 2).toFixed(1)}`,
        fontSize: labelSize,
        rotation: 0,
        name: `Kóta ${c.label} ⌀${(c.r * 2).toFixed(1)}`,
        layer: 1,
        isDimension: true,
      });
    }
  }
}

/**
 * Kliknutí při aktivním nástroji "gear".
 * Klik na plátno → otevře dialog → po potvrzení se objekt automaticky umístí na pozici kliknutí.
 */
export function handleGearClick(wx, wy) {
  showGearDialog((params) => {
    if (!params) return;
    withUndoBatch(() => {
    switch (params.gearType) {

      // ── Čelní kolo (spur) ──
      case 'spur': {
        const { m, z, alpha, x, steps, addRefCircles, addDimensions } = params;
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
          addRefCircles3(wx, wy, calculateGearDimensions(m, z, alpha, x), { addDimensions });
        }
        renderAll();
        showToast(`Čelní kolo m=${m} z=${z} přidáno ✓`);
        break;
      }

      // ── Vnitřní ozubení (internal) ──
      case 'internal': {
        const { m, z, alpha, x, steps, addRefCircles, addDimensions } = params;
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
          addRefCircles3(wx, wy, dim, { addDimensions });
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
        const { pChain, z, d1, steps, addRefCircles, addDimensions } = params;
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
          if (addDimensions) {
            const labelSize = Math.max(2, Math.min(8, dim.rp * 0.08));
            addObject({
              type: 'text',
              x: wx - labelSize * 2,
              y: wy + dim.rp - labelSize * 0.6,
              text: `⌀${dim.dp.toFixed(1)}`,
              fontSize: labelSize,
              rotation: 0,
              name: `Kóta Roztečná ⌀${dim.dp.toFixed(1)}`,
              layer: 1,
              isDimension: true,
            });
          }
        }
        renderAll();
        showToast(`Řetězové kolo p=${pChain} z=${z} přidáno ✓`);
        break;
      }
    }
    });
  });
}
