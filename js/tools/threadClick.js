// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Nástroj: Závit (na úsečce kontury)                  ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Klik na vodorovnou úsečku kontury (válcová plocha) → dialog s výběrem
// závitu (předvybraný podle změřeného ⌀) → nástroj upraví výkres pro CAM:
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

/** Kontext z vybrané úsečky. */
function buildCtx(objIdx, clickX) {
  const o = state.objects[objIdx];
  const xL = Math.min(o.x1, o.x2), xR = Math.max(o.x1, o.x2);
  // Začátek = konec blíž kliknutí (u výběru bez kliknutí pravý konec).
  const startSide = clickX === undefined ? 'right'
    : (Math.abs(clickX - xR) <= Math.abs(clickX - xL) ? 'right' : 'left');
  return {
    objIdx,
    measuredDia: Math.abs(o.y1) * 2,
    lineLen: xR - xL,
    xL, xR,
    startSide,
  };
}

/** Validace: vodorovná úsečka kontury nad osou. Vrací chybovou hlášku nebo null. */
function lineError(o) {
  if (!o || o.type !== 'line') return 'Klikněte na úsečku kontury (válcovou plochu pro závit)';
  if (o.isDimension || o.isCoordLabel) return 'Kóty závitovat nelze — klikněte na úsečku kontury';
  if (o.isStock) return 'To je polotovar — klikněte na úsečku KONTURY';
  if (Math.abs(o.y1 - o.y2) > 1e-6) return 'Závit lze přidat jen na vodorovnou úsečku (válec, rovnoběžně s osou Z)';
  if (o.y1 <= TOL) return 'Úsečka leží na ose / pod osou — závit potřebuje válcovou plochu nad osou';
  return null;
}

function openDialog(ctx, vals) {
  showThreadToolDialog(ctx, vals, {
    onConfirm: (params) => applyThread(ctx, params),
    onPickLength: (v) => {
      _pending = { ctx, vals: v };
      const zs = v.startSide === 'left' ? ctx.xL : ctx.xR;
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
    const z = snap ? snap.x : wx;
    const zs = vals.startSide === 'left' ? ctx.xL : ctx.xR;
    vals.len = Math.round(Math.abs(z - zs) * 100) / 100;
    openDialog(ctx, vals);
    return;
  }
  // ── 1. klik: výběr úsečky ──
  const idx = findObjectAt(wx, wy);
  const o = idx !== null ? state.objects[idx] : null;
  const err = lineError(o);
  if (err) { showToast(err); return; }
  openDialog(buildCtx(idx, wx));
}

/** Aktivace nástroje s už vybranou úsečkou (jako chamferFromSelection). */
export function threadFromSelection() {
  if (state.selected === null) return false;
  const o = state.objects[state.selected];
  if (!o || o.type !== 'line' || lineError(o)) return false;
  openDialog(buildCtx(state.selected));
  return true;
}

/** Posune koncové body všech napojených čar z bodu (z,y) do (z,yNew). */
function moveConnectedEnds(z, y, yNew, skipIdx) {
  let arcsSkipped = 0;
  state.objects.forEach((o, i) => {
    if (i === skipIdx || o.isDimension || o.isCoordLabel) return;
    if (o.type === 'line' || o.type === 'constr') {
      if (Math.abs(o.x1 - z) < TOL && Math.abs(o.y1 - y) < TOL) o.y1 = yNew;
      if (Math.abs(o.x2 - z) < TOL && Math.abs(o.y2 - y) < TOL) o.y2 = yNew;
    } else if (o.type === 'arc' || o.type === 'polyline') {
      // Oblouky/polyline nelze bezpečně "natáhnout" — jen upozornit.
      arcsSkipped++;
    }
  });
  return arcsSkipped;
}

/** Najde sousední úsečku s koncem v rohu (z,y); pref 'vertical' = svislé čelo. */
function findNeighborAt(z, y, skipIdx, pref) {
  let found = null;
  state.objects.forEach((o, i) => {
    if (i === skipIdx || o.type !== 'line' || o.isDimension || o.isCoordLabel || o.isStock) return;
    const at1 = Math.abs(o.x1 - z) < TOL && Math.abs(o.y1 - y) < TOL;
    const at2 = Math.abs(o.x2 - z) < TOL && Math.abs(o.y2 - y) < TOL;
    if (!at1 && !at2) return;
    const dz = Math.abs(o.x2 - o.x1), dy = Math.abs(o.y2 - o.y1);
    const isVertical = dz < TOL && dy > TOL;
    const isSlant = dz > TOL && dy > TOL;
    if (pref === 'vertical' && isVertical) found = { idx: i, end: at1 ? 1 : 2 };
    if (pref === 'slant' && isSlant && !found) found = { idx: i, end: at1 ? 1 : 2 };
  });
  return found;
}

function applyThread(ctx, p) {
  const sel = state.objects[ctx.objIdx];
  if (!sel || sel.type !== 'line') { showToast('Úsečka už neexistuje'); return; }

  const dir = p.startSide === 'right' ? -1 : 1;      // směr od začátku do materiálu
  const zStart = p.startSide === 'right' ? ctx.xR : ctx.xL;
  const zOther = p.startSide === 'right' ? ctx.xL : ctx.xR;
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

  const rOld = sel.y1;
  const rNew = p.adjust ? p.D / 2 : rOld;
  const zTh = zStart + dir * len;                    // konec závitu
  const ch = Math.max(0.1, Math.min(p.chamferSize || p.P, len / 2));

  withUndoBatch(() => {
    // ── 1) Srovnání průměru na jmenovitý (vč. napojených čar) ──
    let arcsSkipped = 0;
    if (Math.abs(rNew - rOld) > 1e-9) {
      arcsSkipped += moveConnectedEnds(sel.x1, rOld, rNew, ctx.objIdx);
      arcsSkipped += moveConnectedEnds(sel.x2, rOld, rNew, ctx.objIdx);
      sel.y1 = rNew; sel.y2 = rNew;
    }

    // ── 2) Sražení na začátku (jen pokud tam šikmá hrana už není) ──
    const slantExists = !!findNeighborAt(zStart, rNew, ctx.objIdx, 'slant');
    if (p.chamfer && !slantExists) {
      const face = findNeighborAt(zStart, rNew, ctx.objIdx, 'vertical');
      if (face) {
        const f = state.objects[face.idx];
        if (face.end === 1) f.y1 = rNew - ch; else f.y2 = rNew - ch;
      }
      addObject({
        type: 'line',
        x1: zStart, y1: rNew - ch,
        x2: zStart + dir * ch, y2: rNew,
        layer: sel.layer,
        name: `Sražení závitu ${ch.toFixed(1)}×45°`,
      });
      // Úsečka hřbetu začíná až za sražením.
      if (Math.abs(sel.x1 - zStart) < TOL) sel.x1 = zStart + dir * ch;
      else if (Math.abs(sel.x2 - zStart) < TOL) sel.x2 = zStart + dir * ch;
    }

    // ── 3) Zápich DIN 76 na konci závitu ──
    if (p.undercut) {
      const mirror = dir === -1;
      addObject({
        type: 'polyline',
        vertices: ucProfile.vertices.map(v => ({ x: zTh + (mirror ? -v.x : v.x), y: rNew + v.y })),
        bulges: ucProfile.bulges.map(b => (mirror ? -b : b)),
        closed: false,
        layer: sel.layer,
        name: `Zápich DIN 76 (f${uc.f}×t${uc.t}) – ${p.name}`,
      });
      // Úsečka hřbetu končí na začátku zápichu; zbytek za zápichem je nová úsečka.
      const zFar = zTh + dir * ucWidth;
      if (Math.abs(sel.x1 - zOther) < TOL) sel.x1 = zTh;
      else if (Math.abs(sel.x2 - zOther) < TOL) sel.x2 = zTh;
      if (Math.abs(zOther - zFar) > 0.02) {
        addObject({
          type: 'line',
          x1: zFar, y1: rNew, x2: zOther, y2: rNew,
          layer: sel.layer,
          name: 'Úsečka za zápichem',
        });
      }
    }

    // ── 4) Konstrukční čáry d₃ (dno) a d₂ (střední ⌀) ──
    // finite: true → kreslí se jen mezi koncovými body (přes délku závitu),
    // ne nekonečně přes celý výkres (viz drawLine v render.js).
    // Se zápichem závit výběhem pokračuje dovnitř zápichu — čáry se protáhnou
    // až na 45° vstupní stěnu zápichu v hloubce dané čáry (x = zTh + dir·hloubka).
    if (p.drawD3) {
      const h3 = rNew - d3 / 2;
      const zEnd3 = p.undercut ? zTh + dir * Math.min(h3, uc.t) : zTh;
      addObject({ type: 'constr', finite: true, x1: zStart, y1: d3 / 2, x2: zEnd3, y2: d3 / 2, name: `Dno závitu d₃ ⌀${d3.toFixed(3)}` });
    }
    if (p.drawD2) {
      const h2 = rNew - d2 / 2;
      const zEnd2 = p.undercut ? zTh + dir * Math.min(h2, uc.t) : zTh;
      addObject({ type: 'constr', finite: true, x1: zStart, y1: d2 / 2, x2: zEnd2, y2: d2 / 2, name: `Střední ⌀ d₂ ${d2.toFixed(3)}` });
    }

    // ── 5) Popisek ──
    if (p.label) {
      addObject({
        type: 'text',
        x: (zStart + zTh) / 2 - 3, y: rNew + 2,
        text: p.name, fontSize: 3, rotation: 0,
        layer: 1,
        name: `Popisek ${p.name}`,
      });
    }

    // ── 6) Metadata pro CAM (záložka Závit v CAM Simulátoru) ──
    sel.threadInfo = {
      name: p.name, type: p.typeKey === 'custom' ? 'mc' : p.typeKey,
      D: p.D, P: p.P, angle: p.angle, H: Math.round(H * 1000) / 1000,
      external: true,
      zStart, zEnd: Math.round(zTh * 1000) / 1000,
      chamfer: ch, undercut: p.undercut ? { ...uc } : null,
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
