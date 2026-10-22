// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Díry v plášti: vykreslení v nárysu a v bokorysu      ║
// ╚══════════════════════════════════════════════════════════════╝
// Nárys: osu díry kreslí běžné vykreslení objektů (čerchovaná úsečka ve
// vrstvě Díry v plášti — značka díry, vždy nahoře). Tady se dokreslí každá
// díra po obvodu skrytou čarou z AKTUÁLNÍHO profilu tak, jak leží při
// natočení pohledu (posuvník vpravo od bokorysu, faceLayer.faceViewC):
// průmět od pláště do hloubky se špičkou vrtáku 118°; díra mířící k nám /
// od nás (průmět kratší než ~17 %) jako kružnice Ø díry na ose. Nejde-li
// díru v profilu určit, osa se přeškrtne červeně.
// Bokorys: každá díra po obvodu jako paprsek od pláště ke dnu na svém úhlu C
// (C 0° = X, C 90° = Y — jako díry v čele), aby bylo vidět natočení vůči
// dírám v čele (uživatel 22. 10. 2026). Jen podklad: do výkresu, SNAP ani
// CAM nejde.
import { state } from '../state.js';
import { faceDiscGeom } from './faceReference.js';
import { getShellLayer, getFaceLayer, faceViewOn, profileObjects, faceViewC, faceHoles } from './faceLayer.js';
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
 * Průměty děr jedné díry v plášti do nárysu při natočení `viewC` (úhel C
 * nahoře): [{ pts }] obrys (z, výška) nebo { circle, c, rh } — díra míří
 * k nám / od nás. Výška = vzdálenost od osy × cos(C díry − viewC).
 */
export function shellFrontProjections(z, spec, res, viewC) {
  return shellAngles(spec).map(a => {
    const k = Math.cos((a - viewC) * Math.PI / 180);
    if (Math.abs(k) < 0.17) return { circle: true, c: res.R * k, rh: spec.d / 2 };
    return { pts: shellFrontOutline(z, spec.d, res.R, res.depth).map(([zz, r]) => [zz, r * k]) };
  });
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
  const view = faceViewC();
  g.save();
  if (!layer || layer.visible) {   // bez vrstvy = díry vrácené ↩ po smazání vrstvy
    items.forEach(({ o, z, res }) => {
      if (res.error) {
        // Nejde určit (mimo díl, hloubka přes osu…) — přeškrtnout osu.
        const a = w2s(o.x1, o.y1), b = w2s(o.x2, o.y2);
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        g.strokeStyle = ERR; g.lineWidth = 2; g.setLineDash([]);
        g.beginPath(); g.moveTo(mx - 6, my - 6); g.lineTo(mx + 6, my + 6); g.moveTo(mx + 6, my - 6); g.lineTo(mx - 6, my + 6); g.stroke();
        return;
      }
      g.strokeStyle = COL; g.lineWidth = 1; g.setLineDash(HIDDEN_DASH);
      shellFrontProjections(z, o.shellHole, res, view).forEach(pr => {
        g.beginPath();
        if (pr.circle) {
          const c = S(z, pr.c), e = S(z + pr.rh, pr.c);
          g.arc(c[0], c[1], Math.hypot(e[0] - c[0], e[1] - c[1]), 0, 2 * Math.PI);
        } else pr.pts.forEach(([zz, rr], i) => { const s = S(zz, rr); if (i) g.lineTo(s[0], s[1]); else g.moveTo(s[0], s[1]); });
        g.stroke();
      });
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

/**
 * Bokorys: čára natočení pohledu — průměr na úhlu C, který je v nárysu
 * nahoře (posuvník vpravo od bokorysu), s trojúhelníkem a popiskem na jeho
 * konci. Kreslí se jen při natočení jiném než výchozím (jinak by se
 * zbytečně překrývala se svislou osou bokorysu).
 */
export function drawViewCut(g, w2s) {
  const face = faceViewOn() ? getFaceLayer() : null;
  const disc = faceDiscGeom();
  if (!face || !face.origin || !disc) return;
  const C = faceViewC();
  const def = state.machineType === 'karusel' ? 0 : 90;
  if (Math.abs(C - def) < 1e-6) return;
  const t = C * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  const R = disc.R * 1.06;
  const a = w2s(face.origin.x - R * c, face.origin.y - R * s), b = w2s(face.origin.x + R * c, face.origin.y + R * s);
  g.save();
  g.strokeStyle = '#fab387'; g.lineWidth = 1.2; g.setLineDash([8, 4]);
  g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  // Trojúhelník na konci „nahoře v nárysu" (míří ven).
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  g.setLineDash([]); g.fillStyle = '#fab387';
  g.beginPath();
  g.moveTo(b[0] + ux * 9, b[1] + uy * 9);
  g.lineTo(b[0] - uy * 5, b[1] + ux * 5);
  g.lineTo(b[0] + uy * 5, b[1] - ux * 5);
  g.closePath(); g.fill();
  g.font = '11px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(`C${+C.toFixed(1)}° nahoře`, b[0] + ux * 26, b[1] + uy * 18);
  g.restore();
}

const SNAP_HOLE = 4;     // přichycení posuvníku natočení k úhlu díry [°]
const SNAP_45 = 2;       // … k násobku 45° [°]

/** Úhly C děr v čele a v plášti (pro přichycení). */
export function holeAnglesC() {
  const out = new Set();
  faceHoles().forEach(({ face, o }) => {
    const x = o.cx - face.origin.x, y = o.cy - face.origin.y;
    if (Math.hypot(x, y) < 1e-6) return;
    out.add(+(((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360).toFixed(3));
  });
  shellHoles().forEach(o => shellAngles(o.shellHole).forEach(a => out.add(a)));
  return [...out];
}

/** Úhel přichycený k dírám (do SNAP_HOLE°) nebo k násobku 45° (do SNAP_45°). */
export function snapViewC(c, holes = holeAnglesC()) {
  const dist = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);
  let best = null, bd = SNAP_HOLE;
  holes.forEach(a => { const d = dist(c, a); if (d < bd) { bd = d; best = a; } });
  if (best !== null) return best;
  const q = Math.round(c / 45) * 45;
  return dist(c, q) < SNAP_45 ? q % 360 : c;
}

