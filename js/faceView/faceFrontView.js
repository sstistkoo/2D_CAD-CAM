// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Bokorys: díry čel v nárysu (skrytou čarou)           ║
// ╚══════════════════════════════════════════════════════════════╝
// Kreslí se pod objekty hned po podkladu bokorysu (render/objects.js), jen
// když je vidět nárys (bokorys zapnutý, ne „jen bokorys"): díry čel jako na
// výkresu — tenká čárkovaná čára (skrytá hrana) v materiálu, který díra
// prochází: od prvního materiálu za rovinou čela (čelo = posuvník, odkud se
// díváme, může stát i před přírubou) po jeho konec (skrz; díra bez hloubky je
// na výkresu průchozí), u hloubky / do Z po dno se špičkou vrtáku 118°; osa
// díry čerchovaně (uživatel 20. 10. 2026). Díry pod osou leží ve spodní polovině
// nárysu — tu kreslí ⇋ Zrcadlit kolem osy (Nastavení; „◎ Do čela" ho zapne).
// Jen podklad: do výkresu, SNAP ani CAM nejde.
// Poloha díry v nárysu = její SVISLÁ souřadnice v bokorysu (soustruh: bokorys
// stojí na ose vedle nárysu, promítací čáry vedou vodorovně), u karuselu
// vodorovná (osy nárysu otočené).
import { state } from '../state.js';
import { faceHoles, profileObjects, faceViewC } from './faceLayer.js';
import { faceCutGeom, objectsHash } from './faceReference.js';
import { resolveHoleDepth, materialSpan, stockSpan } from './faceDepth.js';

const TIP = 0.3;              // délka špičky vrtáku 118° = 0,3·Ø
const CENTER_EXT = 3;         // přesah osy díry za díru [mm]
const HIDDEN_DASH = [5, 3];
const CENTER_DASH = [10, 3, 2, 3];
// Skrytá hrana je hrana DÍLU — barvou jako obrys (vrstva čela bývá oranžová
// a pletla by se s polotovarem).
const HIDDEN_COL = 'rgba(137,180,250,0.85)';
const CENTER_COL = 'rgba(243,139,168,0.6)';   // jako středový kříž bokorysu

/**
 * Čáry díry v nárysu v rovině (z, r): `c` = střed díry napříč osou (se
 * znaménkem), `rh` = poloměr díry, od roviny čela `z0` ve směru `dir` (−1 =
 * čelo zprava vrtá k −Z) do délky válce `len`; `tip` = dno se špičkou 118°.
 * @returns {{ hidden: number[][][], center: number[][] }} lomené čáry [[z, r], …]
 */
export function holeFrontLines({ c, rh, z0, dir, len, tip }) {
  const z1 = z0 + dir * len;
  const hidden = [
    [[z0, c - rh], [z1, c - rh]],
    [[z0, c + rh], [z1, c + rh]],
  ];
  let zEnd = z1;
  if (tip) {
    zEnd = z1 + dir * TIP * 2 * rh;
    hidden.push([[z1, c - rh], [z1, c + rh]], [[z1, c - rh], [zEnd, c], [z1, c + rh]]);
  }
  return { hidden, center: [[z0 - dir * CENTER_EXT, c], [zEnd + dir * CENTER_EXT, c]] };
}

/**
 * Díry čel v nárysu: [{ o, lines }] (lines z holeFrontLines) — v prvním
 * materiálu pod stopou díry za rovinou čela (faceDepth.materialSpan,
 * z AKTUÁLNÍHO profilu). Hloubka / do Z se měří od roviny čela jako v CAM;
 * díru, která materiál nezasáhne (nebo Z na straně nástroje), vynechá.
 * @param holes [{ face, o }] (faceLayer.faceHoles)
 */
export function frontHoles(holes, objects, machineType, viewC = machineType === 'karusel' ? 0 : 90) {
  // Násobky 90° přesně (cos 90° = 6e-17 by posunul výšku díry o šum).
  const th = viewC * Math.PI / 180;
  const exact = v => (Math.abs(v) < 1e-12 ? 0 : Math.abs(Math.abs(v) - 1) < 1e-12 ? Math.sign(v) : v);
  const cT = exact(Math.cos(th)), sT = exact(Math.sin(th));
  const memo = new Map();
  const out = [];
  holes.forEach(({ face, o }) => {
    const hx = o.cx - face.origin.x, hy = o.cy - face.origin.y;
    const ra = Math.hypot(hx, hy);
    const faceZ = Number.isFinite(face.faceZ) ? face.faceZ : 0;
    const side = face.faceSide === 'left' ? 'left' : 'right';
    // Díra bez hloubky je na výkresu průchozí.
    const spec = o.holeDepth || { mode: 'through', value: 0 };
    const p = { faceZ, side, d: 2 * o.r, lo: Math.max(0, ra - o.r), hi: ra + o.r, objects, machineType };
    const key = [faceZ, side, p.lo.toFixed(4), p.hi.toFixed(4), !!spec.stock].join('|');
    // Skrz vč. polotovaru i s polotovarem před čelem (jako CAM, faceDepth.holeForCam).
    if (!memo.has(key)) memo.set(key, spec.stock ? stockSpan(objects, machineType, faceZ, side, p.lo, p.hi) : materialSpan(objects, machineType, faceZ, side, p.lo, p.hi));
    const span = memo.get(key);
    if (!span) return;
    let end = span.end, tip = false;
    if (spec.mode !== 'through') {
      const res = resolveHoleDepth(spec, p);
      if (!(res.depth > span.start)) return;              // vrták materiál nezasáhne
      if (res.depth < span.end) { end = res.depth; tip = true; }
    }
    const dir = side === 'left' ? 1 : -1;
    // Výška v nárysu = průmět středu díry do směru C, který je nahoře
    // (posuvník natočení, faceViewC): C 90° → Y bokorysu, C 0° → X.
    const c = hx * cT + hy * sT;
    out.push({ o, lines: holeFrontLines({ c, rh: o.r, z0: faceZ + dir * span.start, dir, len: end - span.start, tip }) });
  });
  return out;
}

// Hloubky děr (skrz = hledání materiálu pod dírou) jen při změně profilu / děr
// — vykreslení běží i při každém pohybu myši.
let _cache = null;

/** Klíč cache: profil + díry (poloha, Ø, hloubka, čelo) + stroj. */
function holesKey(prof, holes) {
  const hk = holes.map(({ face, o }) => [face.id, face.faceZ, face.faceSide, face.origin.x, face.origin.y,
    o.cx, o.cy, o.r, o.holeDepth ? `${o.holeDepth.mode}:${o.holeDepth.value}:${!!o.holeDepth.stock}` : ''].join(',')).join(';');
  return `${objectsHash(prof)}|${hk}|${state.machineType}|${faceViewC()}`;
}

/** Svět z (z, poloměr) nárysu: soustruh wx = z, wy = r; karusel naopak. */
const toWorld = ([zz, r]) => (state.machineType === 'karusel' ? [r, zz] : [zz, r]);

/**
 * Čáry děr v nárysu z posledního vykreslení jako úsečky pro SNAP (kótování,
 * kreslení od díry — render/mirrorSnap.js). Bez nárysu prázdné.
 */
export function frontHoleSnapLines() {
  if (!_cache || !faceCutGeom()) return [];
  const out = [];
  _cache.holes.forEach(({ lines }) => [...lines.hidden, lines.center].forEach(pl => {
    for (let i = 1; i < pl.length; i++) {
      const [x1, y1] = toWorld(pl[i - 1]), [x2, y2] = toWorld(pl[i]);
      out.push({ type: 'line', x1, y1, x2, y2 });
    }
  }));
  return out;
}

/**
 * Nakreslí díry čel do nárysu (po podkladu bokorysu, pod objekty).
 * @param g CanvasRenderingContext2D
 * @param w2s worldToScreen → [sx, sy]
 */
export function drawFrontView(g, w2s) {
  if (!faceCutGeom()) return;   // bokorys vypnutý nebo „jen bokorys" — nárys není vidět
  const holes = faceHoles();
  // Bez děr zahodit i cache — SNAP (frontHoleSnapLines) by chytal smazané díry.
  if (!holes.length) { _cache = null; return; }
  const prof = profileObjects();
  const key = holesKey(prof, holes);
  if (!_cache || _cache.key !== key) _cache = { key, holes: frontHoles(holes, prof, state.machineType, faceViewC()) };
  const poly = pts => {
    g.beginPath();
    pts.forEach((p, i) => {
      const s = w2s(...toWorld(p));
      if (i) g.lineTo(s[0], s[1]); else g.moveTo(s[0], s[1]);
    });
    g.stroke();
  };
  g.save();
  // Skryté hrany tence čárkovaně, osa díry čerchovaně.
  _cache.holes.forEach(({ lines }) => {
    g.strokeStyle = HIDDEN_COL;
    g.lineWidth = 1;
    g.setLineDash(HIDDEN_DASH);
    lines.hidden.forEach(poly);
    g.strokeStyle = CENTER_COL;
    g.lineWidth = 0.8;
    g.setLineDash(CENTER_DASH);
    poly(lines.center);
  });
  g.restore();
}
