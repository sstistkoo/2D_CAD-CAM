// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Oprava u osy: konce těsně vedle osy, pahýly, přesahy  ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Nález uživatele 2. 11. 2026 (skica_projekt_1): čelo kontury začínalo na
// X −0,301 (kousek POD osou), čelo polotovaru končilo na X 0,786 (nad osou),
// osa polotovaru přesahovala za čelo do Z 268,76 a tam z ní trčel pahýl
// 1,153 mm. Na plátně to není vidět, ale CAM pak dostal otevřený polotovar
// a čelo bez začátku. „Oprav i ty chyby, aby to nabídlo opravu."
//
// Před otevřením CAM (contourCheck.js openCamFromDrawing) se nabídne jedna
// oprava (jeden krok Zpět), zvlášť pro konturu a polotovar:
//   1. VOLNÝ konec úsečky do AXIS_TOL od osy (ne přesně na ní) → na osu.
//      Vodorovná úsečka u osy se posune celá, ať se nezešikmí.
//   2. Úsečka, která tím zkrátí na nulu (pahýl) → smazat.
//   3. Úsečka, jejíž volný konec přesahuje za volný konec jiné čáry, který
//      leží na ní (T, „přesah za roh") → zkrátit k tomu konci.
// Upravují se jen úsečky (oblouky a polylinie se jen počítají do napojení).

import { state } from '../state.js';
import { withoutHelperObjects } from '../helperLayer.js';

/** Do kolika mm od osy se volný konec považuje za „měl být na ose" */
export const AXIS_TOL = 2.0;
const EPS = 0.01;      // shodné s tolerancí řetězení kontury (fileIO.js)
const ON_AXIS = 1e-3;  // tohle už je na ose

const fmt = (v) => (Math.round(v * 1000) / 1000).toString().replace('.', ',');

function _isStock(o) {
  const clean = (o.name || '').replace(/\s+\d+\s*$/, '').toLowerCase();
  return !!o.isStock || clean === 'polotovar';
}

/** Objekty, které jdou do CAM (stejný výběr jako runCncExport forCam). */
function _camObjects(objects, layers) {
  const faceIds = new Set((layers || []).filter(l => l.isFace || l.isShell).map(l => l.id));
  const list = objects.filter(o => o && !o.shellHole && !o.shellSlot && !faceIds.has(o.layer)
    && !o.isDimension && !o.isCoordLabel && !o.isCamPathNote
    && (o.type === 'line' || o.type === 'arc' || o.type === 'polyline'));
  return withoutHelperObjects(list, layers);
}

function _ends(o) {
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

/** Volné konce skupiny: [{ o, i (0 = začátek, 1 = konec), x, y }] */
function _freeEnds(group) {
  const all = [];
  group.forEach(o => _ends(o).forEach((p, i) => all.push({ o, i, x: p.x, y: p.y })));
  return all.filter(e => all.filter(f => Math.hypot(f.x - e.x, f.y - e.y) < EPS).length === 1);
}

const _len = (o) => Math.hypot(o.x2 - o.x1, o.y2 - o.y1);

/**
 * Najde opravy u osy. Nic nemění — vrací plán; použije ho applyAxisFixes.
 * @param {object[]} [objects] výkres (výchozí state.objects)
 * @param {{layers?: object[], machineType?: string}} [opts]
 * @returns {{ items: {obj: object, group: string, kind: 'snap'|'stub'|'trim', amount: number}[],
 *             edits: Map<object, object>, deletes: Set<object> }}
 */
export function findAxisFixes(objects = state.objects, { layers = state.layers, machineType = state.machineType } = {}) {
  // Osa rotace: soustruh má poloměr ve svislé y, karusel ve vodorovné x.
  const R = machineType === 'karusel' ? 'x' : 'y';
  const edits = new Map();     // původní úsečka → upravená kopie
  const deletes = new Set();
  const items = [];
  const cam = _camObjects(objects, layers);
  for (const [gName, want] of [['kontura', false], ['polotovar', true]]) {
    // Pracovní kopie úseček; ostatní typy se jen počítají do napojení.
    const work = cam.filter(o => _isStock(o) === want).map(o => {
      if (o.type !== 'line') return o;
      const c = { ...o, _orig: o };
      return c;
    });
    const live = () => work.filter(o => !deletes.has(o._orig));

    // 1. Volné konce u osy → na osu.
    for (const e of _freeEnds(live())) {
      if (e.o.type !== 'line') continue;
      const r = e[R];
      if (!(Math.abs(r) > ON_AXIS && Math.abs(r) <= AXIS_TOL)) continue;
      const k = R + (e.i === 0 ? '1' : '2'), kOther = R + (e.i === 0 ? '2' : '1');
      const horiz = Math.abs(e.o[k] - e.o[kOther]) < 1e-6;
      if (horiz) {
        // Vodorovná úsečka u osy jde na osu celá — a s ní i konce čar, které
        // na její druhý konec navazují (jinak by se spoj rozpojil). Navazuje-li
        // tam něco jiného než úsečka (oblouk), neopravuje se nic.
        const ox = e.o[kOther === 'y1' || kOther === 'x1' ? 'x1' : 'x2'];
        const oy = e.o[kOther === 'y1' || kOther === 'x1' ? 'y1' : 'y2'];
        const joined = [];
        let blocked = false;
        for (const o of live()) {
          if (o === e.o) continue;
          _ends(o).forEach((p, i) => {
            if (Math.hypot(p.x - ox, p.y - oy) >= EPS) return;
            if (o.type !== 'line') blocked = true; else joined.push({ o, kk: R + (i === 0 ? '1' : '2') });
          });
        }
        if (blocked) continue;
        for (const j of joined) { j.o[j.kk] = 0; edits.set(j.o._orig, j.o); }
        e.o[kOther] = 0;
      }
      e.o[k] = 0;
      edits.set(e.o._orig, e.o);
      items.push({ obj: e.o._orig, group: gName, kind: 'snap', amount: r });
    }
    // 2. Pahýl zkrácený na nulu → smazat.
    for (const o of live()) {
      if (o.type === 'line' && edits.has(o._orig) && _len(o) < EPS) {
        deletes.add(o._orig); edits.delete(o._orig);
        const it = items.find(q => q.obj === o._orig && q.kind === 'snap');
        if (it) { it.kind = 'stub'; it.amount = Math.abs(it.amount); }
      }
    }
    // 3. Přesah za volný konec jiné čáry, který leží na úsečce → zkrátit.
    const free = _freeEnds(live());
    for (const e of free) {
      const L = e.o;
      if (L.type !== 'line') continue;
      const dx = L.x2 - L.x1, dy = L.y2 - L.y1, L2 = dx * dx + dy * dy;
      if (L2 < EPS * EPS) continue;
      let best = null;
      for (const g of free) {
        if (g.o === L) continue;
        const t = ((g.x - L.x1) * dx + (g.y - L.y1) * dy) / L2;
        const d = Math.hypot(g.x - (L.x1 + t * dx), g.y - (L.y1 + t * dy));
        const pastStart = t * Math.sqrt(L2), pastEnd = (1 - t) * Math.sqrt(L2);
        if (d >= EPS || pastStart < EPS || pastEnd < EPS) continue;   // ne uvnitř úsečky
        // Zkrátit k nejbližšímu takovému bodu od volného konce.
        const dist = Math.hypot(g.x - e.x, g.y - e.y);
        if (!best || dist < best.dist) best = { g, dist };
      }
      if (!best) continue;
      const kx = e.i === 0 ? 'x1' : 'x2', ky = e.i === 0 ? 'y1' : 'y2';
      L[kx] = best.g.x; L[ky] = best.g.y;
      edits.set(L._orig, L);
      items.push({ obj: L._orig, group: gName, kind: 'trim', amount: best.dist });
      e.x = best.g.x; e.y = best.g.y;   // tenhle konec už není volný přesah
    }
  }
  return { items, edits, deletes };
}

/**
 * Provede plán z findAxisFixes. Volající dělá pushUndo a mazání (ui.js
 * deleteObjectsByIndices — přepojí i kóty); tady se jen přepíšou souřadnice.
 * @returns {object[]} úsečky ke smazání (ještě ve state.objects)
 */
export function applyAxisFixEdits(fixes) {
  for (const [orig, c] of fixes.edits) {
    orig.x1 = c.x1; orig.y1 = c.y1; orig.x2 = c.x2; orig.y2 = c.y2;
  }
  return [...fixes.deletes];
}

/** Text dotazu: co se opraví (řádek na položku). */
export function describeAxisFixes(fixes) {
  const lines = fixes.items.map(it => {
    const g = it.group === 'kontura' ? 'Kontura' : 'Polotovar';
    if (it.kind === 'snap') return `• ${g}: konec čáry ${fmt(Math.abs(it.amount))} mm ${it.amount < 0 ? 'pod osou' : 'nad osou'} → na osu`;
    if (it.kind === 'stub') return `• ${g}: pahýl ${fmt(it.amount)} mm u osy → smazat`;
    return `• ${g}: přesah ${fmt(it.amount)} mm za roh → zkrátit`;
  });
  return 'U osy výkres skoro sedí, ale ne přesně (vyznačeno) — CAM by pak '
    + 'dostal neuzavřený polotovar nebo konturu bez kusu čela:\n\n'
    + lines.join('\n') + '\n\nOpravit? (Zpět to vrátí.)';
}

/** Otisk plánu — stejné opravy se po „Ponechat" znovu nenabízejí. */
export function axisFixKey(fixes) {
  return fixes.items.map(it => {
    const o = it.obj;
    return `${it.kind}:${[o.x1, o.y1, o.x2, o.y2].map(v => (+v).toFixed(3)).join(',')}`;
  }).sort().join('|');
}
