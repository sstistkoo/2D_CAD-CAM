// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Vybarvit: klik do plochy ji vyplní barvou            ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Kontury v SKICA bývají poskládané z jednotlivých úseček/oblouků (ne
// jedné uzavřené polyline), takže "vyplnit tvar" znamená nejdřív poskládat
// VŠECHNY viditelné objekty do uzavřených smyček podle shodných koncových
// bodů, pak najít tu, do které uživatel klikl (+ díry z vnořených smyček —
// klik do mezikruží mezi konturou a polotovarem vybarví jen ten prstenec),
// a z ní udělat jeden 'fill' objekt (Path2D, pravidlo 'evenodd').

import { state, showToast } from '../state.js';
import { addObject } from '../objects.js';
import { bulgeToArc } from '../utils.js';

const LOOP_EPS = 0.02;   // world units – tolerance shody koncových bodů
const ARC_STEP_DEG = 6;  // krok vzorkování oblouků na body (jemnost výplně)
const AXIS_EPS = 0.05;   // world units – tolerance „leží na ose rotace" (y≈0)

/** Vzorkuje oblouk na body od startAngle k endAngle (respektuje ccw). */
function sampleArcPoints(cx, cy, r, startAngle, endAngle, ccw) {
  let sweep = endAngle - startAngle;
  if (ccw) { while (sweep <= 1e-9) sweep += 2 * Math.PI; }
  else { while (sweep >= -1e-9) sweep -= 2 * Math.PI; }
  const steps = Math.max(1, Math.ceil(Math.abs(sweep) / (ARC_STEP_DEG * Math.PI / 180)));
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = startAngle + sweep * (i / steps);
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

/** Rozloží objekt na řadu bodů (pro řetězové navazování nebo samostatnou smyčku). */
function objToPoints(obj) {
  switch (obj.type) {
    case 'line':
    case 'constr':
      return [{ x: obj.x1, y: obj.y1 }, { x: obj.x2, y: obj.y2 }];
    case 'arc':
      return sampleArcPoints(obj.cx, obj.cy, obj.r, obj.startAngle, obj.endAngle, obj.ccw !== false);
    case 'circle':
      return sampleArcPoints(obj.cx, obj.cy, obj.r, 0, Math.PI * 2, true);
    case 'rect': {
      const x1 = Math.min(obj.x1, obj.x2), x2 = Math.max(obj.x1, obj.x2);
      const y1 = Math.min(obj.y1, obj.y2), y2 = Math.max(obj.y1, obj.y2);
      return [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }, { x: x1, y: y1 }];
    }
    case 'polyline': {
      if (!obj.vertices || obj.vertices.length < 2) return null;
      const vs = obj.vertices, bs = obj.bulges || [];
      const pts = [{ x: vs[0].x, y: vs[0].y }];
      const count = obj.closed ? vs.length : vs.length - 1;
      for (let i = 0; i < count; i++) {
        const p1 = vs[i], p2 = vs[(i + 1) % vs.length];
        const b = bs[i] || 0;
        if (b !== 0) {
          const arc = bulgeToArc(p1, p2, b);
          if (arc) {
            pts.push(...sampleArcPoints(arc.cx, arc.cy, arc.r, arc.startAngle, arc.endAngle, arc.ccw).slice(1));
            continue;
          }
        }
        pts.push({ x: p2.x, y: p2.y });
      }
      return pts;
    }
    default:
      return null;
  }
}

const _eq = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < LOOP_EPS;

/**
 * Postaví uzavřené smyčky z výběru objektů. Kružnice, obdélníky a uzavřené
 * kontury (polyline.closed) jsou vždy samostatná smyčka; úsečky/oblouky/
 * otevřené kontury se řetězí podle shodných koncových bodů (greedy walk).
 *
 * Soustružnické kontury/polotovary bývají kresleny jako OTEVŘENÝ profil
 * vztažený k ose rotace (y=0) — samy o sobě netvoří uzavřenou smyčku, dokud
 * se „nedokreslí" podél osy. Řetězec, jehož OBA volné konce leží na ose
 * (|y|<AXIS_EPS), se proto považuje za uzavřený rovnou osou (closePath()
 * při vykreslení nakreslí tu chybějící úsečku po ose sám).
 * @param {object[]} objs
 * @param {{closeOnAxis?: boolean}} [opts]
 * @returns {{loops: {x:number,y:number}[][], openCount: number}}
 */
export function buildClosedLoops(objs, opts = {}) {
  const loops = [];
  const edges = [];

  for (const obj of objs) {
    if (obj.type === 'circle' || obj.type === 'rect' || (obj.type === 'polyline' && obj.closed)) {
      const pts = objToPoints(obj);
      if (pts && pts.length >= 3) loops.push(pts);
      continue;
    }
    const pts = objToPoints(obj);
    if (pts && pts.length >= 2) edges.push(pts);
  }

  let openCount = 0;
  const used = new Array(edges.length).fill(false);
  for (let i = 0; i < edges.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const chain = edges[i].slice();
    let grow = true;
    while (grow) {
      grow = false;
      const tail = chain[chain.length - 1];
      if (chain.length > 2 && _eq(chain[0], tail)) break; // už uzavřeno
      for (let j = 0; j < edges.length; j++) {
        if (used[j]) continue;
        const e = edges[j];
        if (_eq(e[0], tail)) { chain.push(...e.slice(1)); used[j] = true; grow = true; break; }
        if (_eq(e[e.length - 1], tail)) { chain.push(...e.slice(0, -1).reverse()); used[j] = true; grow = true; break; }
      }
    }
    const closed = chain.length >= 3 && _eq(chain[0], chain[chain.length - 1]);
    const closableOnAxis = !closed && opts.closeOnAxis && chain.length >= 2
      && Math.abs(chain[0].y) < AXIS_EPS && Math.abs(chain[chain.length - 1].y) < AXIS_EPS;
    if (closed || closableOnAxis) {
      loops.push(chain);
    } else {
      openCount++;
    }
  }

  return { loops, openCount };
}

export const FILL_DEFAULT_COLOR = '#60a5fa';
export const FILL_DEFAULT_ALPHA = 0.35;

/** Ray-casting test bodu v polygonu. */
function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const hit = (yi > pt.y) !== (yj > pt.y)
      && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

/** Plocha polygonu (shoelace), vždy kladná. */
function polygonArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
  }
  return Math.abs(a) / 2;
}

/** Objekty, ze kterých se skládají hranice pro "Vybarvit" (viditelná vrstva, ne pomocná/textová/kótovací geometrie). */
function fillableObjects() {
  return state.objects.filter((o) => {
    if (o.isDimension || o.isCoordLabel || o.isCamPathNote) return false;
    if (o.type === 'constr' || o.type === 'text' || o.type === 'point' || o.type === 'fill') return false;
    const layer = state.layers.find((l) => l.id === o.layer);
    if (layer && !layer.visible) return false;
    return true;
  });
}

/**
 * Klik do plochy ji vyplní: najde nejmenší uzavřenou smyčku (ze všech
 * viditelných objektů ve výkresu) obsahující bod [wx,wy], odečte od ní díry
 * ze smyček přímo vnořených uvnitř (klik do mezikruží mezi konturou a
 * polotovarem tak vybarví jen ten prstenec) a vytvoří z toho 'fill' objekt.
 * @param {number} wx
 * @param {number} wy
 * @returns {object|null} nově vytvořený fill objekt, nebo null (zobrazí toast)
 */
export function handleFillAreaClick(wx, wy) {
  // Soustruh: profily jsou často vztažené k ose rotace (y=0), takže se
  // otevřené řetězce s oběma konci na ose berou jako uzavřené podél ní.
  const closeOnAxis = state.machineType !== 'karusel';
  const { loops } = buildClosedLoops(fillableObjects(), { closeOnAxis });
  if (loops.length === 0) {
    showToast('Ve výkresu nejsou žádné uzavřené obrysy k vybarvení');
    return null;
  }

  const clickPt = { x: wx, y: wy };
  const containing = loops
    .filter((loop) => pointInPolygon(clickPt, loop))
    .sort((a, b) => polygonArea(a) - polygonArea(b));

  if (containing.length === 0) {
    showToast('Klikněte dovnitř uzavřeného obrysu');
    return null;
  }

  const outer = containing[0];
  // Smyčky přímo vnořené v "outer" (ne hlouběji) se odečtou jako díry — to
  // je to, co dělá z kliku do mezikruží jen ten prstenec mezi obrysy. Test
  // vnoření běží na libovolném bodě HRANICE dané smyčky (ne jejím těžišti!
  // u soustředných obrysů típu kontura/polotovar běžně leží těžiště většího
  // obrysu uvnitř toho menšího, což by vnoření vyhodnotilo obráceně).
  const insideOuter = loops.filter((l) => l !== outer && pointInPolygon(l[0], outer));
  const holes = insideOuter.filter((l) =>
    !insideOuter.some((other) => other !== l && pointInPolygon(l[0], other))
  );

  return addObject({
    type: 'fill',
    loops: [outer, ...holes],
    color: FILL_DEFAULT_COLOR,
    alpha: FILL_DEFAULT_ALPHA,
    name: holes.length > 0 ? 'Výplň (mezikruží)' : 'Výplň',
  });
}
