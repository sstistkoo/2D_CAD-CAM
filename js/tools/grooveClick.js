// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Nástroj: Zápich (DIN 76 / DIN 509 / vlastní)        ║
// ║  Vykreslí otevřenou polyline profilu zápichu na zadaném      ║
// ║  průměru – uživatel ji následně napojí na konturu            ║
// ║  (přesun/oříznutí stávajících čar).                          ║
// ╚══════════════════════════════════════════════════════════════╝

import { showToast, withUndoBatch } from '../state.js';
import { addObject } from '../objects.js';
import { renderAll } from '../render.js';
import { showGrooveDialog } from '../dialogs/grooveDialog.js';

export function resetGrooveState() { /* dialog je modální, žádný persistentní stav */ }

const ARC90_BULGE = Math.tan(Math.PI / 8); // bulge pro oblouk 90° (ccw)

/**
 * Sestaví relativní profil zápichu (vrcholy + bulges).
 * Souřadnice: x = axiální (Z), y = radiální odchylka od průměru d (<=0,
 * záporné = zápich do materiálu). Počátek (0,0) leží na vstupní hraně.
 */
function buildGrooveProfile({ f, t, r, alpha, entryStyle, exitStyle }) {
  const rC = Math.max(0, Math.min(r, t));
  const alphaRad = (alpha * Math.PI) / 180;
  const tanA = Math.tan(alphaRad) || 1;
  const vertices = [{ x: 0, y: 0 }];
  const bulges = [];
  let x = 0;

  // ── Vstupní stěna ──
  if (entryStyle === 'chamfer') {
    x += t / tanA;
    vertices.push({ x, y: -t });
    bulges.push(0);
  } else {
    const vert = t - rC;
    if (vert > 1e-9) {
      vertices.push({ x, y: -vert });
      bulges.push(0);
    }
    x += rC;
    vertices.push({ x, y: -t });
    bulges.push(rC > 1e-9 ? ARC90_BULGE : 0);
  }

  // ── Dno zápichu ──
  x += f;
  vertices.push({ x, y: -t });
  bulges.push(0);

  // ── Výstupní stěna ──
  if (exitStyle === 'chamfer') {
    x += t / tanA;
    vertices.push({ x, y: 0 });
    bulges.push(0);
  } else {
    if (rC > 1e-9) {
      x += rC;
      vertices.push({ x, y: -t + rC });
      bulges.push(ARC90_BULGE);
      const vert = t - rC;
      if (vert > 1e-9) {
        vertices.push({ x, y: 0 });
        bulges.push(0);
      }
    } else {
      vertices.push({ x, y: 0 });
      bulges.push(0);
    }
  }

  return { vertices, bulges };
}

/**
 * Klik při aktivním nástroji „groove": klik na plátno → dialog → po
 * potvrzení se profil zápichu umístí vstupní hranou na pozici kliknutí,
 * v radiální výšce d/2.
 */
export function handleGrooveClick(wx, wy) {
  showGrooveDialog((params) => {
    if (!params) return;
    const { diameter, f, t, r, alpha, type, mirror } = params;
    const R1 = diameter / 2;

    let entryStyle, exitStyle;
    if (type === 'din509e' || type === 'din509f') {
      entryStyle = 'radius'; exitStyle = 'chamfer';
    } else {
      entryStyle = 'chamfer'; exitStyle = 'radius';
    }

    const profile = buildGrooveProfile({ f, t, r, alpha, entryStyle, exitStyle });

    const vertices = profile.vertices.map(v => ({
      x: wx + (mirror ? -v.x : v.x),
      y: R1 + v.y,
    }));
    const bulges = profile.bulges.map(b => (mirror ? -b : b));

    withUndoBatch(() => {
      addObject({
        type: 'polyline',
        vertices,
        bulges,
        closed: false,
        name: `Zápich ⌀${diameter} f${f}×t${t}`,
      });
    });
    renderAll();
    showToast(`Zápich přidán (f=${f}, t=${t}, r=${r} mm) ✓`);
  });
}
