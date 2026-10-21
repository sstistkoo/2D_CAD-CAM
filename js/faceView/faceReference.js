// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Bokorys (pohled na čelo): podklad pod kresbou        ║
// ╚══════════════════════════════════════════════════════════════╝
// Kreslí se pod objekty (render/objects.js), když je bokorys zapnutý. Podklad
// NENÍ součástí výkresu — jsou to kružnice kolem středu čela spočtené z
// profilu: polotovar (objekty isStock), průměry obrysu, vývrt a čelisti
// sklíčidla (soustruh) / upínací deska s T-drážkami (karusel). Když leží
// bokorys vedle nárysu na ose (desktop), vedou od profilu promítací čáry.
// Střed čela = osa vřetena; vodorovně X (C 0°), svisle Y (C 90°).
import { state } from '../state.js';
import { getFaceLayer, profileObjects, faceUiSync } from './faceLayer.js';

const SKIP_TYPES = new Set(['text', 'point', 'fill', 'camNote', 'constr']);
const STUB_PX = 10;   // přesah značky řezu pod osu, když tam nic není [px]

/** Body objektu ve světových souřadnicích (oblouky vzorkované). */
export function objectPoints(o) {
  if (o.type === 'line' || o.type === 'rect') {
    const pts = [{ x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 }];
    if (o.type === 'rect') pts.push({ x: o.x1, y: o.y2 }, { x: o.x2, y: o.y1 });
    return pts;
  }
  if (o.type === 'circle') {
    return [0, 1, 2, 3].map(k => ({ x: o.cx + o.r * Math.cos(k * Math.PI / 2), y: o.cy + o.r * Math.sin(k * Math.PI / 2) }));
  }
  if (o.type === 'arc') {
    let a0 = o.startAngle, a1 = o.endAngle;
    if (!Number.isFinite(a0) || !Number.isFinite(a1)) return [];
    // Směr jako v render/primitives.drawArc: výchozí proti směru hodin,
    // `ccw: false` = po směru. Bez toho se zaoblení kreslené po směru hodin
    // vzorkovalo z OPAČNÉ strany a nafukovalo obrys v bokorysu.
    if (o.ccw === false) { if (a1 > a0) a1 -= 2 * Math.PI; }
    else if (a1 < a0) a1 += 2 * Math.PI;
    const out = [];
    for (let k = 0; k <= 16; k++) {
      const a = a0 + (a1 - a0) * k / 16;
      out.push({ x: o.cx + o.r * Math.cos(a), y: o.cy + o.r * Math.sin(a) });
    }
    return out;
  }
  if (o.type === 'polyline' && Array.isArray(o.vertices)) return o.vertices;
  return [];
}

const usable = o => o && !o.isDimension && !o.isCoordLabel && !SKIP_TYPES.has(o.type);

/**
 * Poloměry dílu z profilu. Soustruh: poloměr = |svislá souřadnice|,
 * karusel: |vodorovná| (osy otočené o 90°).
 * @returns {{ stockR:number, outerR:number, innerR:number, radii:number[] }|null}
 */
export function profileRadii(objects, machineType) {
  const rad = machineType === 'karusel' ? (p => Math.abs(p.x)) : (p => Math.abs(p.y));
  let stockR = 0, outerR = 0, minR = Infinity, touchesAxis = false;
  const radii = new Set();
  (objects || []).forEach(o => {
    if (!usable(o)) return;
    objectPoints(o).forEach(p => {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      const r = rad(p);
      if (o.isStock) { stockR = Math.max(stockR, r); return; }
      outerR = Math.max(outerR, r);
      if (r < 0.05) touchesAxis = true; else minR = Math.min(minR, r);
      if (o.type === 'line' || o.type === 'polyline') radii.add(+r.toFixed(2));
    });
  });
  if (!(outerR > 0) && !(stockR > 0)) return null;
  if (!(stockR > 0)) stockR = outerR;
  const innerR = !touchesAxis && Number.isFinite(minR) && minR < outerR - 0.5 ? minR : 0;
  return { stockR, outerR: outerR || stockR, innerR, radii: [...radii].sort((a, b) => a - b).slice(-12) };
}

/**
 * Obdélník, který profil zabírá na plátně, nebo null. `withAnnotations` přibere
 * kóty, popisky souřadnic a texty — pro rozmístění bokorysu, ať se o ně nelepí.
 */
export function profileBounds(objects, withAnnotations = false) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  (objects || []).forEach(o => {
    if (!o) return;
    let pts;
    if (usable(o)) pts = objectPoints(o);
    else if (withAnnotations && (o.isDimension || o.isCoordLabel || o.type === 'text')) {
      pts = o.type === 'text' ? [{ x: o.x, y: o.y }] : objectPoints({ ...o, type: 'line' });
      ['dimSrcX1', 'dimSrcX2', 'dimCenterX'].forEach((k, i) => {
        const ky = ['dimSrcY1', 'dimSrcY2', 'dimCenterY'][i];
        if (Number.isFinite(o[k]) && Number.isFinite(o[ky])) pts.push({ x: o[k], y: o[ky] });
      });
    } else return;
    pts.forEach(p => {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
  });
  return Number.isFinite(minX) ? { minX, maxX, minY, maxY } : null;
}

/**
 * Poloměr, který bokorys zabírá: polotovar + přesah středového kříže.
 * Sklíčidlo / čelisti se NEKRESLÍ — největší kružnice by mátla (vypadala jako
 * průměr dílu, který v nárysu není; uživatel 17. 10. 2026).
 */
export function faceRadius(stockR) {
  return stockR * 1.12 + 4;
}

/**
 * Kam bokorys patří: VPRAVO vedle nárysu jako na výkresu (i na mobilu — nad
 * profilem to mátlo, uživatel 17. 10. 2026). Soustruh: na ose vřetena (Z),
 * karusel: vpravo, svisle uprostřed profilu.
 */
export function computeFaceOrigin(objects, machineType) {
  const isCar = machineType === 'karusel';
  const geo = profileRadii(objects, machineType);
  const sR = geo ? geo.stockR : 50;
  const R = faceRadius(sR);
  // Mezera za kótami a popisky profilu (vyčnívají za geometrii).
  const gap = Math.max(30, R * 0.5);
  const b = profileBounds(objects, true) || (isCar
    ? { minX: 0, maxX: sR, minY: -100, maxY: 0 }
    : { minX: -100, maxX: 0, minY: 0, maxY: sR });
  // Střed na celé desítky: mřížka (a SNAP k ní) pak měří čisté vzdálenosti
  // od středu čela.
  const ten = v => Math.ceil(v / 10) * 10;
  const origin = isCar ? { x: ten(Math.max(b.maxX, sR) + R + gap), y: Math.round((b.minY + b.maxY) / 20) * 10 }
    : { x: ten(b.maxX + R + gap), y: 0 };
  return { origin, placement: 'right', R, bounds: b };
}

// ── Profil v rovině čela ──────────────────────────────────────
const zOf = (p, isCar) => (isCar ? p.y : p.x);
const rOf = (p, isCar) => Math.abs(isCar ? p.x : p.y);

/** Lomená čára objektu (oblouky vzorkované) — pro řezy rovinou Z. */
function chainPoints(o) {
  if (o.type === 'rect') return [{ x: o.x1, y: o.y1 }, { x: o.x2, y: o.y1 }, { x: o.x2, y: o.y2 }, { x: o.x1, y: o.y2 }, { x: o.x1, y: o.y1 }];
  if (o.type === 'circle') return [];
  return objectPoints(o);
}

/** Poloměry, kde rovina Z protíná objekty (úsečky ležící v rovině → oba konce). */
function hitsAt(objects, isCar, z) {
  const out = [];
  objects.forEach(o => {
    const pts = chainPoints(o);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const za = zOf(a, isCar), zb = zOf(b, isCar);
      if (Math.abs(za - z) < 1e-6 && Math.abs(zb - z) < 1e-6) { out.push(rOf(a, isCar), rOf(b, isCar)); continue; }
      if ((za - z) * (zb - z) > 0 || za === zb) continue;
      const t = (z - za) / (zb - za);
      const ra = isCar ? a.x : a.y, rb = isCar ? b.x : b.y;
      out.push(Math.abs(ra + (rb - ra) * t));
    }
  });
  return out;
}

/** Průsečíky → mezikruží materiálu [od, do] (lichý počet → materiál od osy). */
function intervals(h) {
  h.sort((a, b) => a - b);
  if (h.length % 2) h.unshift(0);
  const iv = [];
  for (let i = 0; i + 1 < h.length; i += 2) iv.push([h[i], h[i + 1]]);
  return iv;
}

/**
 * Materiál dílu v rovině Z jako mezikruží [od, do] (poloměry, vzestupně).
 * V rovině zlomu profilu je průsečík dvojznačný — vzorkovat mimo zlomy.
 */
export function materialAt(objects, machineType, z) {
  const part = (objects || []).filter(o => usable(o) && !o.isStock);
  return intervals(hitsAt(part, machineType === 'karusel', z));
}

/**
 * Profil v rovině čela Z: poloměry kontury těsně vlevo a vpravo od roviny
 * (čelo = osazení mezi nimi), polotovar v rovině a doporučená strana čela
 * (menší průměr vpravo → čelo hledí doprava).
 * @returns {{ radii:number[], outerR:number, innerR:number, stockR:number, side:'right'|'left'|null }}
 */
export function profileAtZ(objects, machineType, z) {
  const isCar = machineType === 'karusel';
  const part = (objects || []).filter(o => usable(o) && !o.isStock);
  const stock = (objects || []).filter(o => usable(o) && o.isStock);
  const d = 0.3;
  const L = hitsAt(part, isCar, z - d), Rr = hitsAt(part, isCar, z + d), C = hitsAt(part, isCar, z);
  const all = [...L, ...Rr, ...C].filter(r => Number.isFinite(r));
  const radii = [...new Set(all.map(r => +r.toFixed(2)))].sort((a, b) => a - b);
  const outerR = radii.length ? radii[radii.length - 1] : 0;
  // Vývrt v rovině: nejmenší nenulový poloměr, pokud kontura k ose nedojde.
  const innerR = radii.length > 1 && radii[0] > 0.05 ? radii[0] : 0;
  const sHits = [...hitsAt(stock, isCar, z - d), ...hitsAt(stock, isCar, z + d)];
  const stockR = sHits.length ? Math.max(...sHits) : 0;
  const stockRadii = [...new Set(sHits.filter(r => r > 0.05).map(r => +r.toFixed(2)))];
  const mL = L.length ? Math.max(...L) : 0, mR = Rr.length ? Math.max(...Rr) : 0;
  const side = mR < mL - 0.05 ? 'right' : (mL < mR - 0.05 ? 'left' : null);
  return { radii: radii.slice(-8), outerR, innerR, stockR, stockRadii, side };
}

/**
 * Plocha řezu v rovině Z při pohledu ze strany `side`: materiál těsně ZA
 * rovinou ve směru pohledu (zprava = k −Z). V rovině osazení je to celý větší
 * průměr — dřív se menší průměr osazení četl jako vývrt a plný hřídel měl
 * v řezu falešnou díru (uživatel 19. 10. 2026).
 * @returns {{ outerR:number, innerR:number }} innerR = 0 → materiál od osy
 */
export function sectionAt(objects, machineType, z, side) {
  const isCar = machineType === 'karusel';
  const part = (objects || []).filter(o => usable(o) && !o.isStock);
  const h = hitsAt(part, isCar, z + (side === 'left' ? 0.3 : -0.3)).sort((a, b) => a - b);
  if (!h.length) return { outerR: 0, innerR: 0 };
  if (h.length % 2) h.unshift(0);
  const inner = h[0] > 0.05 ? h[0] : 0;
  return { outerR: +h[h.length - 1].toFixed(2), innerR: +inner.toFixed(2) };
}

/**
 * Co je v bokorysu vidět jako na výkresu: řez v rovině Z a za ním (ve směru
 * pohledu — čelo zprava = díváme se doleva, k −Z) hrany profilu jako
 * kružnice. Větší průměry za řezem (osazení) a průměry uvnitř vývrtu jsou
 * vidět, průměry mezi vývrtem a obvodem řezu zakrývá plocha řezu (skryté).
 * Co leží před řezem (na straně pozorovatele), se nekreslí.
 * `stock` = totéž pro polotovar (`at.radii` = polotovar v rovině): větší
 * polotovar za řezem je vidět (uživatel 20. 10. 2026), dílem se nezakrývá.
 * @returns {{ visible:number[], hidden:number[] }}
 */
export function viewRadii(objects, machineType, z, side, at, stock = false) {
  const isCar = machineType === 'karusel';
  const dir = side === 'left' ? 1 : -1;   // směr pohledu v Z (zprava = k −Z)
  const behind = zz => (zz - z) * dir >= -1e-6;
  const part = (objects || []).filter(o => usable(o) && !o.isStock === !stock);
  // Hrany = kružnice v místech zlomu profilu (konce úseček, vrcholy, konce
  // oblouků) za rovinou řezu: { r, z }.
  const edges = [];
  const zsAll = new Set();
  part.forEach(o => {
    let pts = chainPoints(o);
    if (o.type === 'arc' && pts.length > 2) pts = [pts[0], pts[pts.length - 1]];
    pts.forEach(p => {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      const zz = zOf(p, isCar), r = rOf(p, isCar);
      zsAll.add(+zz.toFixed(4));
      if (r > 0.05 && behind(zz)) edges.push({ r, z: zz });
    });
  });
  (at.radii || []).forEach(r => { if (r > 0.05) edges.push({ r, z }); });
  // Materiál v rovině zz: dvojice průsečíků (lichý počet → od osy).
  const material = zz => intervals(hitsAt(part, isCar, zz));
  // Vzorky Z mezi hranou a řezem: středy mezi zlomy profilu (v zlomu samotném
  // je průsečík dvojznačný) + těsně za řezem.
  const zs = [...zsAll].sort((a, b) => a - b);
  const samplesBetween = ze => {
    const lo = Math.min(ze, z), hi = Math.max(ze, z);
    const inner = zs.filter(v => v > lo + 1e-6 && v < hi - 1e-6);
    const pts = [lo, ...inner, hi];
    const out = [];
    for (let i = 0; i + 1 < pts.length; i++) out.push((pts[i] + pts[i + 1]) / 2);
    return out;
  };
  const cache = new Map();
  const matAt = zz => { const k = zz.toFixed(4); if (!cache.has(k)) cache.set(k, material(zz)); return cache.get(k); };
  // Hrana je vidět, když ji mezi ní a pozorovatelem (od hrany k řezu)
  // nezakrývá materiál — poloměr neleží UVNITŘ žádného plného intervalu.
  const isVisible = e => {
    if (Math.abs(e.z - z) < 1e-6) return true;
    return samplesBetween(e.z).every(zz => matAt(zz).every(([a, b]) => !(e.r > a + 1e-3 && e.r < b - 1e-3)));
  };
  const byR = new Map();
  edges.forEach(e => {
    const k = (Math.round(e.r * 10) / 10).toFixed(1);
    const v = isVisible(e);
    const prev = byR.get(k);
    if (!prev) byR.set(k, { r: e.r, vis: v });
    else if (v && !prev.vis) byR.set(k, { r: e.r, vis: true });
  });
  // Sloučit téměř totožné kružnice (konce zaoblení) — viditelná má přednost.
  const sorted = [...byR.values()].sort((a, b) => a.r - b.r);
  const merged = [];
  sorted.forEach(c => {
    const last = merged[merged.length - 1];
    if (last && c.r - last.r < 0.4) { if (c.vis && !last.vis) merged[merged.length - 1] = c; return; }
    merged.push(c);
  });
  return {
    visible: merged.filter(c => c.vis).map(c => +c.r.toFixed(2)).slice(-14),
    hidden: merged.filter(c => !c.vis).map(c => +c.r.toFixed(2)).slice(-14),
  };
}

/**
 * Z osazení profilu (úsečky kolmé na osu) a krajní Z — značky na posuvníku.
 * `withStock`: rozsah i značky sahají přes konce polotovaru (posuvník čela
 * úplně vpravo = před polotovarem, ne jen před hotovou konturou — uživatel
 * 21. 10. 2026); osazení polotovaru se neznačí.
 */
export function shoulderZs(objects, machineType, withStock = false) {
  const isCar = machineType === 'karusel';
  const zs = new Set();
  let min = Infinity, max = -Infinity, sMin = Infinity, sMax = -Infinity;
  (objects || []).forEach(o => {
    if (!usable(o)) return;
    if (o.isStock) {
      if (withStock) chainPoints(o).forEach(p => { const z = zOf(p, isCar); if (Number.isFinite(z)) { sMin = Math.min(sMin, z); sMax = Math.max(sMax, z); } });
      return;
    }
    const pts = chainPoints(o);
    pts.forEach(p => { const z = zOf(p, isCar); if (Number.isFinite(z)) { min = Math.min(min, z); max = Math.max(max, z); } });
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (Math.abs(zOf(a, isCar) - zOf(b, isCar)) < 1e-6 && Math.abs(rOf(a, isCar) - rOf(b, isCar)) > 0.1)
        zs.add(+zOf(a, isCar).toFixed(3));
    }
  });
  if (Number.isFinite(min)) { zs.add(+min.toFixed(3)); zs.add(+max.toFixed(3)); }
  if (Number.isFinite(sMin)) {
    zs.add(+sMin.toFixed(3)); zs.add(+sMax.toFixed(3));
    min = Math.min(min, sMin); max = Math.max(max, sMax);
  }
  return { zs: [...zs].sort((a, b) => a - b), min: Number.isFinite(min) ? min : -100, max: Number.isFinite(max) ? max : 0 };
}

const fmtMm = v => String(+(+v).toFixed(2));

let _viewCache = null;

// Značka řezu v nárysu: geometrie posledního vykreslení (tažení myší / prstem,
// faceCutDrag.js) a zvýraznění při najetí / tažení.
let _cut = null, _cutHot = false;
/** { z, isCar, a:[wx,wy], b:[wx,wy] } — konce čáry řezu ve světových souřadnicích, nebo null. */
export function faceCutGeom() { return _cut; }
/**
 * Zásah značky řezu: je bod (sx, sy) [px] do `tol` od čáry řezu, prodloužené o
 * `pad` px na obou koncích (šipky)? `w2s` = worldToScreen. `endsOnly`: jen konce
 * přesahující polotovar (šipky, popisek) — uvnitř dílu jsou body, na které se
 * v nástrojích kreslení kreslí (řez stojí často přímo na osazení).
 */
export function cutHit(cut, w2s, sx, sy, tol, pad = 12, endsOnly = false) {
  if (!cut) return false;
  const a = w2s(...cut.a), b = w2s(...cut.b);
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
  const a2 = [a[0] - ux * pad, a[1] - uy * pad], b2 = [b[0] + ux * pad, b[1] + uy * pad];
  const dx = b2[0] - a2[0], dy = b2[1] - a2[1], L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((sx - a2[0]) * dx + (sy - a2[1]) * dy) / L2)) : 0;
  if (Math.hypot(sx - (a2[0] + t * dx), sy - (a2[1] + t * dy)) > tol) return false;
  if (!endsOnly || !(cut.sR > 0)) return true;
  // Vzdálenost průmětu od osy [mm]: řez jde od `lo` (a) do `hi` (b); bez nich
  // souměrně kolem osy.
  const half = Math.hypot(cut.b[0] - cut.a[0], cut.b[1] - cut.a[1]) / 2;
  const lo = Number.isFinite(cut.lo) ? cut.lo : -half, hi = Number.isFinite(cut.hi) ? cut.hi : half;
  const u = ((sx - a[0]) * ux + (sy - a[1]) * uy) / L;
  return Math.abs(lo + u * (hi - lo)) >= cut.sR;
}

/** Zvýraznit řez (najetí / tažení). Vrací true, když se stav změnil (překreslí volající). */
export function setFaceCutHot(on) {
  if (_cutHot === on) return false;
  _cutHot = on;
  return true;
}
/** Levný otisk souřadnic objektů — klíč cache výpočtů nad profilem. */
export function objectsHash(objects) {
  let h = 0;
  const add = v => { if (Number.isFinite(v)) h = (h * 31 + Math.round(v * 1000)) | 0; };
  (objects || []).forEach(o => {
    add(o.x1); add(o.y1); add(o.x2); add(o.y2); add(o.cx); add(o.cy); add(o.r);
    add(o.startAngle); add(o.endAngle); h = (h * 31 + (o.isStock ? 1 : 0) + (o.ccw === false ? 2 : 0)) | 0;
    if (Array.isArray(o.vertices)) o.vertices.forEach(v => { add(v.x); add(v.y); });
    if (Array.isArray(o.bulges)) o.bulges.forEach(add);
  });
  return `${(objects || []).length}|${h}`;
}
/** Otisk profilu + roviny čela pro cache řezu. */
function geoKey(objects, z, side) {
  return `${objectsHash(objects)}|${z}|${side}|${state.machineType}`;
}

// ── Geometrie posledního vykreslení: SNAP a skrývání čísel hlavních os ──
let _disc = null;   // { x, y, r, R, radii[], solo, isCar }
/** Leží světový bod v bokorysu (s rezervou na popisky)? */
export function inFaceDisc(wx, wy) {
  return !!_disc && Math.hypot(wx - _disc.x, wy - _disc.y) <= _disc.r;
}
/**
 * Nekreslit číslo hlavní osy v bodě (wx, wy)? V režimu „jen bokorys" žádné,
 * jinak ne v bokorysu ani za ním po společné ose (soustruh: osa Z vpravo od
 * bokorysu) — bokorys má vlastní stupnici na středovém kříži.
 */
export function hideMainAxisLabel(wx, wy) {
  if (!_disc) return false;
  if (_disc.solo) return true;
  if (inFaceDisc(wx, wy)) return true;
  return !_disc.isCar && Math.abs(_disc.y) < 1e-6 && Math.abs(wy) < 1e-6 && wx >= _disc.x - _disc.r;
}
/** Body pro SNAP: střed čela a kvadranty kružnic podkladu. */
export function faceSnapPoints() {
  if (!_disc) return [];
  const pts = [{ x: _disc.x, y: _disc.y }];
  _disc.radii.forEach(r => [0, 90, 180, 270].forEach(a => {
    const t = a * Math.PI / 180;
    pts.push({ x: _disc.x + r * Math.cos(t), y: _disc.y + r * Math.sin(t) });
  }));
  return pts;
}
/**
 * Nejbližší bod na kružnicích podkladu nebo na osách středového kříže
 * (SNAP na hranu) → { x, y, dist } | null.
 */
export function faceSnapEdge(wx, wy) {
  if (!_disc) return null;
  const dx = wx - _disc.x, dy = wy - _disc.y, d = Math.hypot(dx, dy);
  let best = null;
  const take = (x, y, dist) => { if (!best || dist < best.dist) best = { x, y, dist }; };
  if (d > 1e-9) _disc.radii.forEach(r => take(_disc.x + dx / d * r, _disc.y + dy / d * r, Math.abs(d - r)));
  if (Math.abs(dx) <= _disc.R) take(wx, _disc.y, Math.abs(dy));
  if (Math.abs(dy) <= _disc.R) take(_disc.x, wy, Math.abs(dx));
  return best;
}

/** Stupnice na středovém kříži: dílky po 1/2/5·10ⁿ mm (aspoň ~28 px), popisky od středu. */
function drawCrossScale(g, w2s, O, R, zoom, col) {
  const steps = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
  const step = steps.find(s => s * zoom >= 28) || 1000;
  const n = Math.floor(R / step);
  if (n < 1) return;
  g.save();
  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1; g.setLineDash([]);
  g.font = '9px sans-serif';
  const [cx, cy] = w2s(O.x, O.y);
  g.beginPath(); g.moveTo(cx - 7, cy); g.lineTo(cx + 7, cy); g.moveTo(cx, cy - 7); g.lineTo(cx, cy + 7); g.stroke();
  for (let k = -n; k <= n; k++) {
    if (k === 0) continue;
    const big = k % 5 === 0 || n <= 6;
    const t = big ? 5 : 3;
    const [hx, hy] = w2s(O.x + k * step, O.y);
    g.beginPath(); g.moveTo(hx, hy - t); g.lineTo(hx, hy + t); g.stroke();
    const [vx, vy] = w2s(O.x, O.y + k * step);
    g.beginPath(); g.moveTo(vx - t, vy); g.lineTo(vx + t, vy); g.stroke();
    if (big || n <= 10) {
      const lbl = fmtMm(Math.abs(k * step));
      // Nad vodorovnou osou a vpravo od svislé — čísla hlavních os jsou pod
      // osou Z a vlevo od osy X.
      g.fillText(lbl, hx - g.measureText(lbl).width / 2, hy - 8);
      g.fillText(lbl, vx + 7, vy + 3);
    }
  }
  g.restore();
}

/** Kóta průměru přes střed pod úhlem `deg` (šipky na kružnici, text za ní). */
function drawDiaDim(g, w2s, O, r, deg, col, text) {
  if (!(r > 0)) return;
  const a = deg * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a);
  const p1 = w2s(O.x - ux * r, O.y - uy * r), p2 = w2s(O.x + ux * r, O.y + uy * r);
  const p3 = w2s(O.x + ux * r * 1.35, O.y + uy * r * 1.35);
  g.save();
  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1; g.setLineDash([]);
  g.beginPath(); g.moveTo(p1[0], p1[1]); g.lineTo(p3[0], p3[1]); g.stroke();
  const arrow = (tip, from) => {
    const dx = tip[0] - from[0], dy = tip[1] - from[1], L = Math.hypot(dx, dy) || 1;
    const bx = dx / L, by = dy / L, s = 7;
    g.beginPath(); g.moveTo(tip[0], tip[1]);
    g.lineTo(tip[0] - bx * s - by * s * 0.35, tip[1] - by * s + bx * s * 0.35);
    g.lineTo(tip[0] - bx * s + by * s * 0.35, tip[1] - by * s - bx * s * 0.35);
    g.closePath(); g.fill();
  };
  const c = w2s(O.x, O.y);
  arrow(p1, c); arrow(p2, c);
  g.font = 'bold 11px sans-serif';
  g.fillText(text, p3[0] + (ux >= 0 ? 4 : -4 - g.measureText(text).width), p3[1] + (uy >= 0 ? -4 : 12));
  g.restore();
}

// Po každém vykreslení (lišta čela pod nárysem si přepočte polohu, faceBar.js).
let _onDrawn = null;
/** Zavolat `fn` po každém vykreslení podkladu (i při vypnutém bokorysu). */
export function onFaceDrawn(fn) { _onDrawn = fn; }

/**
 * Nakreslí podklad bokorysu (+ značku řezu v nárysu).
 * @param g CanvasRenderingContext2D
 * @param w2s worldToScreen z canvas.js → [sx, sy]
 */
export function drawFaceReference(g, w2s) {
  paintFace(g, w2s);
  if (_onDrawn) _onDrawn();
}

function paintFace(g, w2s) {
  faceUiSync();
  _disc = null;
  _cut = null;   // bez bokorysu (i v režimu jen bokorys) není co tahat
  const layer = getFaceLayer();
  if (!layer || !layer.visible || !layer.origin) return;
  const O = layer.origin;
  const prof = profileObjects();
  const isCar = state.machineType === 'karusel';
  const geoAll = profileRadii(prof, state.machineType);
  const sRmax = geoAll ? geoAll.stockR : 50;
  const bodyR = faceRadius(sRmax);
  const z = Number.isFinite(layer.faceZ) ? layer.faceZ : 0;
  // Řez a viditelnost hran se počítají jen při změně profilu / Z / strany —
  // vykreslení běží i při každém pohybu myši.
  const key = geoKey(prof, z, layer.faceSide);
  if (!_viewCache || _viewCache.key !== key) {
    const at0 = profileAtZ(prof, state.machineType, z);
    const view = viewRadii(prof, state.machineType, z, layer.faceSide, at0);
    // Polotovar vidět za řezem (větší průměr polotovaru dál od roviny).
    const stockView = viewRadii(prof, state.machineType, z, layer.faceSide, { radii: at0.stockRadii }, true);
    // Plocha řezu z materiálu za rovinou (v rovině osazení bez falešného vývrtu).
    _viewCache = { key, at: { ...at0, ...sectionAt(prof, state.machineType, z, layer.faceSide) }, view, stockView };
  }
  const { at, view, stockView } = _viewCache;
  const sR = at.stockR || sRmax;
  const stockCircles = [sR, ...stockView.visible.filter(r => Math.abs(r - sR) > 0.05)];
  const radii = at.radii.filter(r => r > 0.05);
  _disc = { x: O.x, y: O.y, r: bodyR * 1.15, R: bodyR, radii: [...view.visible, ...stockCircles], solo: !!layer.solo, isCar };
  const zoom = state.zoom;
  const circle = (r, fill, stroke, lw = 1, dash) => {
    const [cx, cy] = w2s(O.x, O.y);
    g.beginPath(); g.arc(cx, cy, Math.max(0.5, r * zoom), 0, 2 * Math.PI);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.setLineDash(dash || []); g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); g.setLineDash([]); }
  };
  const line = (x1, y1, x2, y2, col, dash, lw = 1) => {
    const a = w2s(x1, y1), b = w2s(x2, y2);
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
    g.setLineDash(dash || []); g.strokeStyle = col; g.lineWidth = lw; g.stroke(); g.setLineDash([]);
  };
  // Světový bod nárysu z (z, poloměr): soustruh wx = z, wy = r; karusel wx = r, wy = z.
  const P = (zz, r) => (isCar ? [r, zz] : [zz, r]);
  g.save();
  const light = state.theme === 'light';
  const edge = light ? 'rgba(76,79,105,0.45)' : 'rgba(127,132,156,0.6)';
  const contour = 'rgba(137,180,250,0.9)';
  const cut = 'rgba(250,179,135,0.95)';

  if (!layer.solo) {
    // Značka řezu v nárysu: čerchovaná čára v rovině čela, šipky ukazují směr
    // pohledu (čelo zprava = díváme se zprava doleva, k −Z), popisek Z.
    const spanOf = r => r + Math.max(6, r * 0.15);
    const span = spanOf(sR);
    const spanMax = Math.max(span, spanOf(sRmax));
    // Pod osou nic nakreslené (běžný poloviční profil): řez jen přes kreslenou
    // stranu, pod osu jen krátký přesah bez šipky — lišta čela pak stojí hned
    // pod osou, ne pod prázdným spodkem řezu (uživatel 20. 10. 2026).
    const pb = profileBounds(prof, true);
    // ⇋ Zrcadlit kolem osy (Nastavení, osa y = 0 → jen soustruh; „◎ Do čela"
    // ho zapne) dokreslí spodní polovinu — řez i lišta jdou pod ni.
    const below = !pb || (isCar ? pb.minX : pb.minY) < -0.01 || (!isCar && !!state.mirrorPreview);
    const lo = below ? -span : -STUB_PX / (zoom || 1);
    const [x1, y1] = P(z, lo), [x2, y2] = P(z, span);
    // spanMax / loMax = řez přes největší průměr dílu: lišta čela pod nárysem
    // se staví podle něj, ne podle průměru v Z — jinak při tažení skákala
    // nahoru a dolů (uživatel 20. 10. 2026).
    _cut = { z, isCar, a: [x1, y1], b: [x2, y2], sR, lo, hi: span, spanMax, loMax: below ? -spanMax : lo };
    // Najetí / tažení: silnější čára s podkladem, ať je vidět, že jde chytit.
    if (_cutHot) line(x1, y1, x2, y2, 'rgba(250,179,135,0.30)', null, 9);
    line(x1, y1, x2, y2, cut, [10, 3, 2, 3], _cutHot ? 2.4 : 1.5);
    const dir = layer.faceSide === 'left' ? 1 : -1;
    (below ? [span, -span] : [span]).forEach(r => {
      const A = w2s(...P(z, r)), B = w2s(...P(z + dir * Math.max(4, span * 0.25), r));
      const dx = B[0] - A[0], dy = B[1] - A[1], Lr = Math.hypot(dx, dy) || 1, ux = dx / Lr, uy = dy / Lr;
      g.strokeStyle = cut; g.fillStyle = cut; g.lineWidth = 1.5; g.setLineDash([]);
      g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke();
      g.beginPath(); g.moveTo(B[0], B[1]);
      g.lineTo(B[0] - ux * 8 - uy * 4, B[1] - uy * 8 + ux * 4);
      g.lineTo(B[0] - ux * 8 + uy * 4, B[1] - uy * 8 - ux * 4);
      g.closePath(); g.fill();
    });
    const T = w2s(...P(z, span));
    g.font = 'bold 11px sans-serif'; g.fillStyle = cut;
    g.fillText(`Z${fmtMm(z)}`, T[0] + 4, T[1] - 6);
    // Promítací čáry od řezu k bokorysu (bokorys na ose vřetena vedle nárysu).
    const proj = 'rgba(137,180,250,0.28)';
    if (!isCar && Math.abs(O.y) < 1e-6) {
      radii.forEach(r => { line(z, r, O.x, r, proj, [6, 4]); if (below) line(z, -r, O.x, -r, proj, [6, 4]); });
    }
  }

  // Polotovar a průměry profilu v rovině čela.
  // Polotovar v barvě vrstvy Polotovar (jako v nárysu), kontura modře.
  const stockLayer = (state.layers || []).find(l => l.id === 3);
  // Čerchovaně se dvěma tečkami (pomocná čára) — odlišné od skrytých hran.
  // V rovině řezu i větší polotovar za ní (ve směru pohledu).
  stockCircles.forEach(r => circle(r, null, (stockLayer && stockLayer.color) || '#fab387', 1.3, [10, 3, 2, 3, 2, 3]));
  // Plocha řezu (mezikruží vývrt … obvod v rovině čela), pak hrany za řezem:
  // viditelné plně, zakryté řezem slabě čárkovaně.
  if (at.outerR > 0) {
    const [cx, cy] = w2s(O.x, O.y);
    g.beginPath();
    g.arc(cx, cy, at.outerR * zoom, 0, 2 * Math.PI);
    if (at.innerR > 0) g.arc(cx, cy, at.innerR * zoom, 0, 2 * Math.PI, true);
    g.fillStyle = light ? 'rgba(30,102,245,0.10)' : 'rgba(137,180,250,0.14)';
    g.fill('evenodd');
  }
  // Skryté hrany jako na výkresu: tenká čárkovaná čára (krátké čárky).
  view.hidden.forEach(r => circle(r, null, 'rgba(137,180,250,0.55)', 0.9, [4, 3]));
  view.visible.forEach(r => circle(r, null, contour, r === at.outerR ? 1.8 : 1.3));
  // Středový kříž čela se stupnicí v mm od středu (podle ní se díry umisťují —
  // stavový řádek měří od počátku výkresu) a kóty průměrů v rovině čela.
  const axis = 'rgba(243,139,168,0.6)';
  const ext = bodyR * 1.08;
  line(O.x - ext, O.y, O.x + ext, O.y, axis, [8, 3, 2, 3]);
  line(O.x, O.y - ext, O.x, O.y + ext, axis, [8, 3, 2, 3]);
  drawCrossScale(g, w2s, O, bodyR, zoom, axis);
  const dimCol = light ? 'rgba(30,102,245,0.9)' : 'rgba(137,180,250,0.95)';
  if (at.outerR > 0) drawDiaDim(g, w2s, O, at.outerR, 45, dimCol, `Ø${fmtMm(2 * at.outerR)}`);
  if (at.innerR > 0) drawDiaDim(g, w2s, O, at.innerR, -45, dimCol, `Ø${fmtMm(2 * at.innerR)}`);
  // Poháněný nástroj v revolveru (jako CAM, cam/live liveSettings.toolAt):
  // soustruh NAHOŘE (X+ jako v nárysu), karusel vpravo — k němu se díra
  // natáčí osou C. Šipka míří na kus.
  g.fillStyle = 'rgba(249,226,175,0.9)';
  g.beginPath();
  if (isCar) {
    const [tx, ty] = w2s(O.x + sR, O.y);
    g.moveTo(tx + 4, ty); g.lineTo(tx + 16, ty - 6); g.lineTo(tx + 16, ty + 6);
  } else {
    const [tx, ty] = w2s(O.x, O.y + sR);
    g.moveTo(tx, ty - 4); g.lineTo(tx - 6, ty - 16); g.lineTo(tx + 6, ty - 16);
  }
  g.closePath(); g.fill();
  g.font = '11px sans-serif';
  g.fillStyle = edge;
  const [lx, ly] = w2s(O.x - bodyR, O.y + bodyR * 1.08);
  g.fillText(`Bokorys – čelo Z${fmtMm(z)} ${layer.faceSide === 'left' ? '▶ zleva' : '◀ zprava'}`, lx, ly - 18);
  const [ax, ay] = w2s(O.x + bodyR, O.y);
  g.fillText('C0°', ax + 4, ay - 4);
  const [bx, by] = w2s(O.x, O.y + bodyR);
  g.fillText('C90°', bx + 4, by - 4);
  g.restore();
}
