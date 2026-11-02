// Sdílené pomůcky oprav výkresu (axisFix.js, drawingFixes.js): výběr čar,
// které jdou do CAM, konce čar, volné konce a zápis jedné opravy.
//
// Oprava = { kind, group, label, at, objs, sets, dels }
//   objs  — čáry, kterých se týká (zvýraznění, přiblížení)
//   sets  — [{ obj, k, v }]: obj[k] = v (obj = původní objekt výkresu)
//   dels  — objekty ke smazání
// Opravy jsou NEZÁVISLÉ: každá nese konečné hodnoty svých souřadnic, takže
// jde provést libovolný zaškrtnutý výběr (dialog v contourCheck.js).

import { withoutHelperObjects } from '../helperLayer.js';

export const EPS = 0.01;      // shodné s tolerancí řetězení kontury (fileIO.js)
export const ON_AXIS = 1e-3;  // tohle už je na ose

export const fmt = (v, d = 3) => {
  const p = 10 ** d;
  return (Math.round(v * p) / p).toString().replace('.', ',');
};

export function isStockObj(o) {
  const clean = (o.name || '').replace(/\s+\d+\s*$/, '').toLowerCase();
  return !!o.isStock || clean === 'polotovar';
}

/** Objekty, které jdou do CAM (stejný výběr jako runCncExport forCam). */
export function camObjects(objects, layers) {
  const faceIds = new Set((layers || []).filter(l => l.isFace || l.isShell).map(l => l.id));
  const list = objects.filter(o => o && !o.shellHole && !o.shellSlot && !faceIds.has(o.layer)
    && !o.isDimension && !o.isCoordLabel && !o.isCamPathNote
    && (o.type === 'line' || o.type === 'arc' || o.type === 'polyline'));
  return withoutHelperObjects(list, layers);
}

/**
 * Pracovní skupiny kontura / polotovar: úsečky jako upravitelné kopie
 * (`_orig` = původní objekt), ostatní typy beze změny (jen do napojení).
 */
export function workGroups(objects, layers) {
  const cam = camObjects(objects, layers);
  return [['kontura', false], ['polotovar', true]].map(([name, stock]) => ({
    name,
    work: cam.filter(o => isStockObj(o) === stock).map(o => (o.type === 'line' ? { ...o, _orig: o } : o)),
  }));
}

export function endsOf(o) {
  if (o.type === 'line') return [{ x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 }];
  if (o.type === 'arc') return [
    { x: o.cx + o.r * Math.cos(o.startAngle), y: o.cy + o.r * Math.sin(o.startAngle) },
    { x: o.cx + o.r * Math.cos(o.endAngle), y: o.cy + o.r * Math.sin(o.endAngle) },
  ];
  if (o.type === 'polyline' && !o.closed && Array.isArray(o.vertices) && o.vertices.length > 1) {
    const v = o.vertices;
    return [{ x: v[0].x, y: v[0].y }, { x: v[v.length - 1].x, y: v[v.length - 1].y }];
  }
  return [];
}

/** Volné konce: [{ o, i (0 = začátek, 1 = konec), x, y }] */
export function freeEnds(list) {
  const all = [];
  list.forEach(o => endsOf(o).forEach((p, i) => all.push({ o, i, x: p.x, y: p.y })));
  return all.filter(e => all.filter(f => Math.hypot(f.x - e.x, f.y - e.y) < EPS).length === 1);
}

/** Konce JINÝCH čar v bodě (x, y): [{ o, i }] */
export function joinedAt(list, self, x, y) {
  const out = [];
  for (const o of list) {
    if (o === self) continue;
    endsOf(o).forEach((p, i) => { if (Math.hypot(p.x - x, p.y - y) < EPS) out.push({ o, i }); });
  }
  return out;
}

/** Klíče souřadnic konce úsečky. */
export const endKeys = (i) => (i === 0 ? ['x1', 'y1'] : ['x2', 'y2']);

/** Posune konec úsečky (kopie) a zapíše to do opravy. */
export function moveEnd(item, o, i, x, y) {
  const [kx, ky] = endKeys(i);
  o[kx] = x; o[ky] = y;
  item.sets.push({ obj: o._orig, k: kx, v: x }, { obj: o._orig, k: ky, v: y });
  if (!item.objs.includes(o._orig)) item.objs.push(o._orig);
}

/** Popis místa „Z… X…" podle stroje (soustruh: Z vodorovně, X = poloměr svisle). */
export function placeLabel(x, y, machineType) {
  const [z, r] = machineType === 'karusel' ? [y, x] : [x, y];
  return `Z${fmt(z, 2)} X${fmt(r, 2)}`;
}

/** Provede zaškrtnuté opravy na výkrese. Vrací objekty ke smazání. */
export function applyFixItems(items) {
  const dels = new Set();
  for (const it of items) {
    for (const s of it.sets) s.obj[s.k] = s.v;
    for (const d of it.dels) dels.add(d);
  }
  return [...dels];
}

/** Otisk opravy — odmítnutá se stejná znovu nenabízí. */
export function fixKey(it) {
  const o = it.objs[0];
  const nums = o ? [o.x1, o.y1, o.x2, o.y2, o.cx, o.cy].filter(v => v != null).map(v => (+v).toFixed(3)) : [];
  return `${it.kind}:${nums.join(',')}`;
}
