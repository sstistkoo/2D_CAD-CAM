// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Nástroj: Zápich (DIN 76 / DIN 509 / vlastní)        ║
// ║  Vykreslí otevřenou polyline profilu zápichu na zadaném      ║
// ║  průměru – uživatel ji následně napojí na konturu            ║
// ║  (přesun/oříznutí stávajících čar).                          ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, showToast, withUndoBatch } from '../state.js';
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
export function buildGrooveProfile({ f, t, r, alpha, entryStyle, exitStyle }) {
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
 * Umístí relativní profil zápichu (u podél plochy, v ≤ 0 hloubka) do výkresu.
 *  orient 'h' – plocha vodorovně, profil běží po x, hloubka jde dolů (−y)
 *  orient 'v' – plocha svisle, profil běží po y, hloubka jde doleva (−x)
 * `anchor` = vstupní hrana; `mirror` obrátí směr podél plochy.
 * @returns {{vertices: {x:number,y:number}[], bulges: number[]}}
 */
export function placeGrooveProfile(profile, { orient = 'h', mirror = false, anchor }) {
  const s = mirror ? -1 : 1;
  const vertices = profile.vertices.map(p => (orient === 'v'
    ? { x: anchor.x + p.y, y: anchor.y + s * p.x }
    : { x: anchor.x + s * p.x, y: anchor.y + p.y }));
  // Prohození os (svisle) je zrcadlení → obrací smysl oblouků; mirror taky
  const k = orient === 'v' ? -s : s;
  return { vertices, bulges: profile.bulges.map(b => k * b) };
}

/**
 * Klik při aktivním nástroji „groove": klik na plátno → dialog → po
 * potvrzení se profil zápichu umístí vstupní hranou na pozici kliknutí.
 * Průměr d určuje radiální souřadnici – na soustruhu výšku (svět y), na
 * karuselu (osy prohozené, osa rotace svisle) vodorovnou polohu (svět x);
 * druhá souřadnice je z kliknutí. Orientace (vodorovně/svisle) jde zvolit
 * v dialogu, výchozí je podle stroje (soustruh vodorovně, karusel svisle).
 */
export function handleGrooveClick(wx, wy) {
  const isKarusel = state.machineType === 'karusel';
  showGrooveDialog((params) => {
    if (!params) return;
    const { diameter, f, t, r, alpha, type, mirror, orient } = params;
    const R1 = diameter / 2;

    let entryStyle, exitStyle;
    if (type === 'din509e' || type === 'din509f') {
      entryStyle = 'radius'; exitStyle = 'chamfer';
    } else {
      entryStyle = 'chamfer'; exitStyle = 'radius';
    }

    const profile = buildGrooveProfile({ f, t, r, alpha, entryStyle, exitStyle });

    const anchor = isKarusel ? { x: R1, y: wy } : { x: wx, y: R1 };
    const { vertices, bulges } = placeGrooveProfile(profile, { orient, mirror, anchor });

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
  }, { orient: isKarusel ? 'v' : 'h' });
}
