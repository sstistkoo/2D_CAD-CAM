// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Nástroj: Závit (na úsečce kontury)                  ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Klik na úsečku kontury rovnoběžnou s osou rotace (válcová plocha) –
// VODOROVNOU (soustruh: osa Z vodorovně) nebo SVISLOU (karusel: osa svisle)
// → dialog s výběrem závitu (předvybraný podle změřeného ⌀) → nástroj
// upraví výkres pro CAM:
//   • úsečka se srovná na jmenovitý ⌀ závitu (i s napojenými čarami),
//   • na začátku 45° sražení (pokud chybí), na konci zápich DIN 76,
//   • dno d₃ a střední ⌀ d₂ jako konstrukční čáry (hrubování do nich
//     nezajede — hloubka závitu je věc závitovacího cyklu v CAM),
//   • na úsečku se uloží metadata threadInfo → CAM Simulátor si je při
//     otevření načte do záložky Závit (⌀D, P, hloubka, Z start/konec).
//
// Délku závitu lze zadat v dialogu nebo nakliknout na výkrese
// („⊹ Nakliknout konec" → další klik v nástroji určí konec závitu).

import { state, showToast, withUndoBatch } from '../state.js';
import { addObject } from '../objects.js';
import { renderAll } from '../render.js';
import { findObjectAt, findIntersectionAt, calculateAllIntersections } from '../geometry.js';
import { setHint, resetHint, updateObjectList, updateProperties } from '../ui.js';
import { buildGrooveProfile } from './grooveClick.js';
import { lookupDin76 } from '../calculators/dinGrooves.js';
import { showThreadToolDialog, threadToolDiameters } from '../dialogs/threadDialog.js';

const TOL = 0.01;   // tolerance napojení koncových bodů [mm]

let _pending = null;   // { ctx, vals } — čeká se na kliknutí konce závitu

export function resetThreadState() {
  if (_pending) { _pending = null; resetHint(); }
}

// ── Rámec závitu ──
// Výpočty běží v souřadnicích a = podél osy rotace, r = vzdálenost od osy.
// `orient` určuje, jak se mapují na svět (podle kliknuté úsečky):
//   'h' – vodorovná úsečka: a = x, r = y (osa rotace vodorovně – soustruh)
//   'v' – svislá úsečka:    a = y, r = x (osa rotace svisle – karusel)
const toW = (orient, a, r) => (orient === 'v' ? { x: r, y: a } : { x: a, y: r });
const aOf = (orient, x, y) => (orient === 'v' ? y : x);
const rOf = (orient, x, y) => (orient === 'v' ? x : y);

function endAR(o, k, orient) {
  const x = k === 1 ? o.x1 : o.x2, y = k === 1 ? o.y1 : o.y2;
  return { a: aOf(orient, x, y), r: rOf(orient, x, y) };
}

function setEnd(o, k, orient, a, r) {
  const w = toW(orient, a, r);
  if (k === 1) { o.x1 = w.x; o.y1 = w.y; } else { o.x2 = w.x; o.y2 = w.y; }
}

/** 'h' / 'v' podle směru úsečky, jinak null (šikmá / nulová). */
function lineOrient(o) {
  const dx = Math.abs(o.x2 - o.x1), dy = Math.abs(o.y2 - o.y1);
  if (dy <= 1e-6 && dx > 1e-6) return 'h';
  if (dx <= 1e-6 && dy > 1e-6) return 'v';
  return null;
}

/** Kontext z vybrané úsečky (`click` = světový bod kliknutí, nepovinný). */
function buildCtx(obj, click) {
  const orient = lineOrient(obj);
  const a1 = aOf(orient, obj.x1, obj.y1), a2 = aOf(orient, obj.x2, obj.y2);
  const aL = Math.min(a1, a2), aR = Math.max(a1, a2);
  // Začátek = konec blíž kliknutí (u výběru bez kliknutí „pravý" = vyšší a).
  const clickA = click ? aOf(orient, click.x, click.y) : undefined;
  const startSide = clickA === undefined ? 'right'
    : (Math.abs(clickA - aR) <= Math.abs(clickA - aL) ? 'right' : 'left');
  return {
    // Úsečka se drží jako OBJEKT, ne index – mezi kliknutími (nakliknutí
    // délky) může Zpět nebo mazání pole přeskládat
    obj,
    orient,
    measuredDia: Math.abs(rOf(orient, obj.x1, obj.y1)) * 2,
    lineLen: aR - aL,
    aL, aR,
    startSide,
  };
}

/** Validace: úsečka kontury rovnoběžná s osou, mimo osu. Vrací chybovou hlášku nebo null. */
function lineError(o) {
  if (!o || o.type !== 'line') return 'Klikněte na úsečku kontury (válcovou plochu pro závit)';
  if (o.isDimension || o.isCoordLabel) return 'Kóty závitovat nelze — klikněte na úsečku kontury';
  if (o.isStock) return 'To je polotovar — klikněte na úsečku KONTURY';
  const orient = lineOrient(o);
  if (!orient) return 'Závit lze přidat jen na vodorovnou nebo svislou úsečku (válec rovnoběžný s osou rotace)';
  if (rOf(orient, o.x1, o.y1) <= TOL) {
    return orient === 'v'
      ? 'Úsečka leží na ose / vlevo od osy — závit potřebuje válcovou plochu vpravo od osy'
      : 'Úsečka leží na ose / pod osou — závit potřebuje válcovou plochu nad osou';
  }
  return null;
}

function openDialog(ctx, vals) {
  showThreadToolDialog(ctx, vals, {
    onConfirm: (params) => applyThread(ctx, params),
    onPickLength: (v) => {
      _pending = { ctx, vals: v };
      const zs = v.startSide === 'left' ? ctx.aL : ctx.aR;
      setHint(`Klikněte na výkrese, kde má závit končit (začátek Z=${zs.toFixed(2)}, Esc = zrušit)`);
      showToast('Klikněte na konec závitu na výkrese');
    },
    onCancel: () => {},
  });
}

export function handleThreadClick(wx, wy) {
  // ── 2. klik: nakliknutí konce závitu ──
  if (_pending) {
    const { ctx, vals } = _pending;
    _pending = null;
    resetHint();
    const snap = findIntersectionAt(wx, wy);
    const a = snap ? aOf(ctx.orient, snap.x, snap.y) : aOf(ctx.orient, wx, wy);
    const zs = vals.startSide === 'left' ? ctx.aL : ctx.aR;
    vals.len = Math.round(Math.abs(a - zs) * 100) / 100;
    openDialog(ctx, vals);
    return;
  }
  // ── 1. klik: výběr úsečky ──
  const idx = findObjectAt(wx, wy);
  const o = idx !== null ? state.objects[idx] : null;
  const err = lineError(o);
  if (err) { showToast(err); return; }
  openDialog(buildCtx(o, { x: wx, y: wy }));
}

/** Aktivace nástroje s už vybranou úsečkou (jako filletChamferFromSelection). */
export function threadFromSelection() {
  if (state.selected === null) return false;
  const o = state.objects[state.selected];
  if (!o || o.type !== 'line' || lineError(o)) return false;
  openDialog(buildCtx(o));
  return true;
}

/** Posune koncové body všech napojených čar z bodu (a, rOld) do (a, rNew). */
function moveConnectedEnds(orient, a, rOld, rNew, skipObj) {
  const from = toW(orient, a, rOld), to = toW(orient, a, rNew);
  let arcsSkipped = 0;
  state.objects.forEach((o) => {
    if (o === skipObj || o.isDimension || o.isCoordLabel) return;
    if (o.type === 'line' || o.type === 'constr') {
      if (Math.abs(o.x1 - from.x) < TOL && Math.abs(o.y1 - from.y) < TOL) { o.x1 = to.x; o.y1 = to.y; }
      if (Math.abs(o.x2 - from.x) < TOL && Math.abs(o.y2 - from.y) < TOL) { o.x2 = to.x; o.y2 = to.y; }
    } else if (o.type === 'arc' || o.type === 'polyline') {
      // Oblouky/polyline nelze bezpečně "natáhnout" — jen upozornit.
      arcsSkipped++;
    }
  });
  return arcsSkipped;
}

/**
 * Najde sousední úsečku s koncem v rohu (a, r); pref 'face' = čelo (kolmé
 * na osu rotace), 'slant' = šikmá hrana.
 */
function findNeighborAt(orient, a, r, skipObj, pref) {
  const p = toW(orient, a, r);
  let found = null;
  state.objects.forEach((o) => {
    if (o === skipObj || o.type !== 'line' || o.isDimension || o.isCoordLabel || o.isStock) return;
    const at1 = Math.abs(o.x1 - p.x) < TOL && Math.abs(o.y1 - p.y) < TOL;
    const at2 = Math.abs(o.x2 - p.x) < TOL && Math.abs(o.y2 - p.y) < TOL;
    if (!at1 && !at2) return;
    const e1 = endAR(o, 1, orient), e2 = endAR(o, 2, orient);
    const dA = Math.abs(e2.a - e1.a), dR = Math.abs(e2.r - e1.r);
    const isFace = dA < TOL && dR > TOL;
    const isSlant = dA > TOL && dR > TOL;
    if (pref === 'face' && isFace) found = { obj: o, end: at1 ? 1 : 2 };
    if (pref === 'slant' && isSlant && !found) found = { obj: o, end: at1 ? 1 : 2 };
  });
  return found;
}

function applyThread(ctx, p) {
  const sel = ctx.obj;
  if (!sel || sel.type !== 'line' || !state.objects.includes(sel)) { showToast('Úsečka už neexistuje'); return; }
  const orient = ctx.orient;

  const dir = p.startSide === 'right' ? -1 : 1;      // směr od začátku do materiálu
  const zStart = p.startSide === 'right' ? ctx.aR : ctx.aL;
  const zOther = p.startSide === 'right' ? ctx.aL : ctx.aR;
  const { d2, d3 } = threadToolDiameters(p.typeKey, p.D, p.P);
  const H = (p.D - d3) / 2;
  const uc = lookupDin76(p.P);
  // Profil zápichu: tabulkové f je šířka DNA — celková axiální šířka
  // (vstupní 45° hrana + dno + výstupní rádius) je větší. Bereme ji
  // z posledního vrcholu profilu, aby úsečka za zápichem navazovala.
  const ucProfile = buildGrooveProfile({ f: uc.f, t: uc.t, r: uc.r, alpha: 45, entryStyle: 'chamfer', exitStyle: 'radius' });
  const ucWidth = ucProfile.vertices[ucProfile.vertices.length - 1].x;

  // Délka: závit + případný zápich se musí vejít na úsečku.
  const maxLen = ctx.lineLen - (p.undercut ? ucWidth : 0);
  let len = Math.min(p.len, maxLen);
  if (len < p.len - 1e-9) showToast(`Délka zkrácena na ${len.toFixed(2)} mm (závit + zápich se musí vejít na úsečku)`);
  if (len <= p.P) { showToast('Závit se na úsečku nevejde — zkraťte zápich nebo délku'); return; }

  const rOld = rOf(orient, sel.x1, sel.y1);
  const rNew = p.adjust ? p.D / 2 : rOld;
  const zTh = zStart + dir * len;                    // konec závitu
  const ch = Math.max(0.1, Math.min(p.chamferSize || p.P, len / 2));
  const line = (a1, r1, a2, r2, extra) => {
    const w1 = toW(orient, a1, r1), w2 = toW(orient, a2, r2);
    return { x1: w1.x, y1: w1.y, x2: w2.x, y2: w2.y, ...extra };
  };
  /** Který konec hřbetu leží na souřadnici a (1/2/0). */
  const selEndAt = (a) => (Math.abs(endAR(sel, 1, orient).a - a) < TOL ? 1
    : Math.abs(endAR(sel, 2, orient).a - a) < TOL ? 2 : 0);

  withUndoBatch(() => {
    // ── 1) Srovnání průměru na jmenovitý (vč. napojených čar) ──
    let arcsSkipped = 0;
    if (Math.abs(rNew - rOld) > 1e-9) {
      const a1 = endAR(sel, 1, orient).a, a2 = endAR(sel, 2, orient).a;
      arcsSkipped += moveConnectedEnds(orient, a1, rOld, rNew, sel);
      arcsSkipped += moveConnectedEnds(orient, a2, rOld, rNew, sel);
      setEnd(sel, 1, orient, a1, rNew);
      setEnd(sel, 2, orient, a2, rNew);
    }

    // ── 2) Sražení na začátku (jen pokud tam šikmá hrana už není) ──
    const slantExists = !!findNeighborAt(orient, zStart, rNew, sel, 'slant');
    if (p.chamfer && !slantExists) {
      const face = findNeighborAt(orient, zStart, rNew, sel, 'face');
      if (face) setEnd(face.obj, face.end, orient, endAR(face.obj, face.end, orient).a, rNew - ch);
      addObject(line(zStart, rNew - ch, zStart + dir * ch, rNew, {
        type: 'line',
        layer: sel.layer,
        name: `Sražení závitu ${ch.toFixed(1)}×45°`,
      }));
      // Úsečka hřbetu začíná až za sražením.
      const k = selEndAt(zStart);
      if (k) setEnd(sel, k, orient, zStart + dir * ch, rNew);
    }

    // ── 3) Zápich DIN 76 na konci závitu ──
    if (p.undercut) {
      const s = dir === -1 ? -1 : 1;
      // Prohození os (svislý závit) je zrcadlení → obrací smysl oblouků
      const bs = orient === 'v' ? -s : s;
      addObject({
        type: 'polyline',
        vertices: ucProfile.vertices.map(v => toW(orient, zTh + s * v.x, rNew + v.y)),
        bulges: ucProfile.bulges.map(b => bs * b),
        closed: false,
        layer: sel.layer,
        name: `Zápich DIN 76 (f${uc.f}×t${uc.t}) – ${p.name}`,
      });
      // Úsečka hřbetu končí na začátku zápichu; zbytek za zápichem je nová úsečka.
      const zFar = zTh + dir * ucWidth;
      const k = selEndAt(zOther);
      if (k) setEnd(sel, k, orient, zTh, rNew);
      if (Math.abs(zOther - zFar) > 0.02) {
        addObject(line(zFar, rNew, zOther, rNew, {
          type: 'line',
          layer: sel.layer,
          name: 'Úsečka za zápichem',
        }));
      }
    }

    // ── 4) Konstrukční čáry d₃ (dno) a d₂ (střední ⌀) ──
    // finite: true → kreslí se jen mezi koncovými body (přes délku závitu),
    // ne nekonečně přes celý výkres (viz drawLine v render.js).
    // Se zápichem závit výběhem pokračuje dovnitř zápichu — čáry se protáhnou
    // až na 45° vstupní stěnu zápichu v hloubce dané čáry (a = zTh + dir·hloubka).
    if (p.drawD3) {
      const h3 = rNew - d3 / 2;
      const zEnd3 = p.undercut ? zTh + dir * Math.min(h3, uc.t) : zTh;
      addObject(line(zStart, d3 / 2, zEnd3, d3 / 2, { type: 'constr', finite: true, name: `Dno závitu d₃ ⌀${d3.toFixed(3)}` }));
    }
    if (p.drawD2) {
      const h2 = rNew - d2 / 2;
      const zEnd2 = p.undercut ? zTh + dir * Math.min(h2, uc.t) : zTh;
      addObject(line(zStart, d2 / 2, zEnd2, d2 / 2, { type: 'constr', finite: true, name: `Střední ⌀ d₂ ${d2.toFixed(3)}` }));
    }

    // ── 5) Popisek ── (u svislého závitu podél úsečky, čte se shora dolů)
    if (p.label) {
      const mid = (zStart + zTh) / 2;
      const pos = orient === 'v' ? toW(orient, mid + 3, rNew + 2) : toW(orient, mid - 3, rNew + 2);
      addObject({
        type: 'text',
        x: pos.x, y: pos.y,
        text: p.name, fontSize: 3, rotation: orient === 'v' ? -Math.PI / 2 : 0,
        layer: 1,
        name: `Popisek ${p.name}`,
      });
    }

    // ── 6) Metadata pro CAM (záložka Závit v CAM Simulátoru) ──
    // zStart/zEnd jsou souřadnice PODÉL OSY ROTACE (u svislého závitu svět y)
    sel.threadInfo = {
      name: p.name, type: p.typeKey === 'custom' ? 'mc' : p.typeKey,
      D: p.D, P: p.P, angle: p.angle, H: Math.round(H * 1000) / 1000,
      external: true,
      zStart, zEnd: Math.round(zTh * 1000) / 1000,
      chamfer: ch, undercut: p.undercut ? { ...uc } : null,
      orient,
    };
    sel.name = `Závit ${p.name}`;

    if (arcsSkipped > 0) showToast('⚠ Napojený oblouk se nepřizpůsobil novému ⌀ — zkontrolujte napojení');
  });

  // Zrušit výběr úsečky — po vytvoření závitu by zůstala zvýrazněná (bílá).
  state.selected = null;
  state.selectedSegment = null;
  if (state.multiSelected) state.multiSelected.clear();
  updateProperties();
  calculateAllIntersections();
  updateObjectList();
  renderAll();
  showToast(`Závit ${p.name}: L=${len.toFixed(1)} mm, H=${H.toFixed(3)} mm${p.undercut ? `, zápich f${uc.f}` : ''}${p.adjust && Math.abs(rNew - rOld) > 1e-9 ? `, ⌀ srovnán na ${p.D}` : ''} ✓`);
}
