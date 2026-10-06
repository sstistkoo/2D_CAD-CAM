// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – malý náhled nože (SVG): destička + hlava držáku     ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Pro seznamy nožů (📚 ISO katalog, 🔧 Zásobník) — malá kresba, ať je nůž
// poznat bez otevírání 👁 Ukázat (uživatel 6. 10. 2026). Kreslí z TÝCHŽ
// dat jako CAM: obrys destičky z insertPreview.js, obrys držáku
// z holderProfileLoop (collisionValidator.js — vlastní obrys i náhradní
// obdélník), zrcadlení podle ruky a natočení nože (knifeAngle) stejně jako
// drawInsertAndHolderPreview. Ořízne se na okolí špičky — dřík pokračuje
// mimo obrázek. Barvy dává CSS (.knife-svg .h / .i / .c).

import { buildInsertProfileSegments, buildInsertOutlineSegments, threadingToothSegments } from './cam/insertPreview.js';
import { holderProfileLoop } from './cam/collisionValidator.js';

const r3 = (v) => Math.round(v * 1000) / 1000;

/** Body obrysu (oblouky navzorkované kratší cestou, jako traceInsertSegments). */
export function segPoints(segs) {
  const out = [];
  for (const s of segs) {
    if (s.type === 'circle') {
      for (let i = 0; i < 24; i++) out.push({ x: s.cx + s.r * Math.cos(i * Math.PI / 12), z: s.cz + s.r * Math.sin(i * Math.PI / 12) });
    } else if (s.type === 'arc') {
      const a0 = Math.atan2(s.from.z - s.cz, s.from.x - s.cx);
      let d = Math.atan2(s.to.z - s.cz, s.to.x - s.cx) - a0;
      while (d <= -Math.PI) d += 2 * Math.PI;
      while (d > Math.PI) d -= 2 * Math.PI;
      for (let i = 0; i <= 8; i++) out.push({ x: s.cx + s.r * Math.cos(a0 + d * i / 8), z: s.cz + s.r * Math.sin(a0 + d * i / 8) });
    } else {
      out.push(s.from, s.to);
    }
  }
  return out;
}

/**
 * SVG náhled nože z parametrů ve tvaru S.params (toolShape, toolRadius,
 * holderProfile…). Slot zásobníku převést přes paramsFromMagSlot.
 * @param {Object} prms
 * @param {number} [px] velikost čtverce v px
 */
export function knifeThumbSvg(prms, px = 72) {
  const mir = prms.holderHand === 'L' ? -1 : 1;
  const kd = Number.isFinite(parseFloat(prms.knifeAngle)) ? parseFloat(prms.knifeAngle) : 270;
  const a = (270 - kd) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  // profil {x, z} → obrazovka (y dolů), pak natočení kolem špičky jako rotScr v náhledu Geometrie
  const scr = (q) => { const x = q.x * mir, y = -q.z; return { x: x * ca - y * sa, y: x * sa + y * ca }; };
  const full = segPoints(buildInsertOutlineSegments(prms)).map(scr);
  const cutSegs = prms.toolShape === 'threading' ? threadingToothSegments(prms) : buildInsertProfileSegments(prms);
  const cut = segPoints(cutSegs).map(scr);
  const holder = (holderProfileLoop(prms) || []).map(scr);

  // Výřez: destička + vrcholy držáku v jejím okolí (hlava), ne celý dřík.
  const ext = Math.max(1, ...full.map((p) => Math.hypot(p.x, p.y)));
  const reach = Math.max(2.2 * ext, 1.6 * (parseFloat(prms.holderWidth) || 20), 30);
  const near = [...full, ...holder.filter((p) => Math.hypot(p.x, p.y) <= reach)];
  const xs = near.map((p) => p.x), ys = near.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const side = Math.max(x1 - x0, y1 - y0, 20) + 4;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const path = (pts) => (pts.length ? 'M' + pts.map((p) => `${r3(p.x)} ${r3(p.y)}`).join(' L') + ' Z' : '');
  return `<svg class="knife-svg" viewBox="${r3(cx - side / 2)} ${r3(cy - side / 2)} ${r3(side)} ${r3(side)}" width="${px}" height="${px}" aria-hidden="true">`
    + (holder.length ? `<path class="h" d="${path(holder)}" vector-effect="non-scaling-stroke"/>` : '')
    + `<path class="i" d="${path(full)}" vector-effect="non-scaling-stroke"/>`
    + `<path class="c" d="${path(cut)}" vector-effect="non-scaling-stroke"/>`
    + '</svg>';
}
