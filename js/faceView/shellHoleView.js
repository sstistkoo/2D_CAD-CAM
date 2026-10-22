// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Díry v plášti: vykreslení v nárysu a v bokorysu      ║
// ╚══════════════════════════════════════════════════════════════╝
// Nárys: osu díry kreslí běžné vykreslení objektů (čerchovaná úsečka ve
// vrstvě Díry v plášti); tady se k ní dokreslí obrys díry skrytou čarou
// z AKTUÁLNÍHO profilu — od pláště do hloubky se špičkou vrtáku 118°
// (díra natočená do roviny nárysu, jak se kreslí na výkresu). Nejde-li díru
// v profilu určit, osa se přeškrtne červeně.
// Bokorys: každá díra po obvodu jako paprsek od pláště ke dnu na svém úhlu C
// (C 0° = X, C 90° = Y — jako díry v čele), aby bylo vidět natočení vůči
// dírám v čele (uživatel 22. 10. 2026). Jen podklad: do výkresu, SNAP ani
// CAM nejde.
import { state } from '../state.js';
import { getShellLayer, getFaceLayer, faceViewOn, profileObjects } from './faceLayer.js';
import { shellHoles, shellHoleZ, resolveShellHole, shellAngles, toWorldZR } from './shellHoles.js';

const COL = '#94e2d5';
const FILL = 'rgba(148,226,213,0.18)';
const ERR = '#f38ba8';
const HIDDEN_DASH = [5, 3];
const TIP = 0.3;   // špička vrtáku 118° ≈ 0,3·Ø

/** Obrys díry v rovině (z, r): skryté hrany + špička; lomená čára [[z, r], …]. */
export function shellFrontOutline(z, d, R, depth) {
  const h = d / 2, rb = R - depth;
  const tip = Math.min(TIP * d, Math.max(0, rb));
  return [[z - h, R], [z - h, rb], [z, rb - tip], [z + h, rb], [z + h, R]];
}

/**
 * Nakreslí obrysy děr v plášti (nárys) a paprsky v bokorysu.
 * @param g CanvasRenderingContext2D
 * @param w2s worldToScreen → [sx, sy]
 */
export function drawShellHoles(g, w2s) {
  const list = shellHoles();
  if (!list.length) return;
  const layer = getShellLayer();
  const prof = profileObjects();
  const items = list.map(o => {
    const z = shellHoleZ(o);
    return { o, z, res: resolveShellHole(o.shellHole, z, prof, state.machineType) };
  });
  const S = (z, r) => { const p = toWorldZR(z, r); return w2s(p.x, p.y); };
  g.save();
  if (layer && layer.visible) {
    items.forEach(({ o, z, res }) => {
      if (res.error) {
        // Nejde určit (mimo díl, hloubka přes osu…) — přeškrtnout osu.
        const a = w2s(o.x1, o.y1), b = w2s(o.x2, o.y2);
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        g.strokeStyle = ERR; g.lineWidth = 2; g.setLineDash([]);
        g.beginPath(); g.moveTo(mx - 6, my - 6); g.lineTo(mx + 6, my + 6); g.moveTo(mx + 6, my - 6); g.lineTo(mx - 6, my + 6); g.stroke();
        return;
      }
      const pts = shellFrontOutline(z, o.shellHole.d, res.R, res.depth);
      g.strokeStyle = COL; g.lineWidth = 1; g.setLineDash(HIDDEN_DASH);
      g.beginPath();
      pts.forEach(([zz, rr], i) => { const s = S(zz, rr); if (i) g.lineTo(s[0], s[1]); else g.moveTo(s[0], s[1]); });
      g.stroke();
    });
  }
  // Bokorys: paprsky děr na jejich úhlech C.
  const face = faceViewOn() ? getFaceLayer() : null;
  if (face && face.origin) {
    const O = face.origin;
    g.setLineDash([]);
    g.lineWidth = 1.2;
    items.forEach(({ o, res }) => {
      if (res.error) return;
      const h = o.shellHole.d / 2, rb = res.R - res.depth;
      shellAngles(o.shellHole).forEach(a => {
        const t = a * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
        // Obdélník napříč: osa (c, s), kolmice (−s, c).
        const P = (r, w) => w2s(O.x + r * c - w * s, O.y + r * s + w * c);
        const q = [P(res.R, -h), P(rb, -h), P(rb, h), P(res.R, h)];
        g.beginPath();
        q.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
        g.closePath();
        g.fillStyle = FILL; g.fill();
        g.strokeStyle = COL; g.stroke();
      });
    });
  }
  g.restore();
}
