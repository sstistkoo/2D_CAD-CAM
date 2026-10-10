// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Kontrola kontury: zdvojené čáry, jeden profil do CAM ║
// ╚══════════════════════════════════════════════════════════════╝
//
// • Zdvojené čáry (dvě stejné přesně přes sebe) na plátně nejsou vidět –
//   přiblížíme na ně, zvýrazníme je žlutě (render.js drawContourHighlights)
//   a nabídneme smazání přebytečné kopie.
// • Přenos do CAM posílá jen hlavní souvislý profil (runCncExport forCam).
//   Zbude-li mimo něj něco, ukážeme to fialově a necháme rozhodnout – u
//   profilu s mezerou by jinak do CAM potichu odešla jen jeho část.
// Nález uživatele 30. 9. 2026: hláška „kontura se větví" u zdvojené úsečky,
// kterou nebylo na výkrese vidět; CAM ji dostal jako samostatný kus za G0.

import { state, pushUndo, showToast } from '../state.js';
import { bridge } from '../bridge.js';
import { renderAll } from '../render.js';
import { fitViewToWorldBounds } from '../canvas.js';
import { showConfirmDialog } from '../dialogFactory.js';
import { findContourDuplicates, objectsBounds } from '../stockTools.js';
import { deleteObjectsByIndices } from '../ui.js';

// Otisky zdvojených čar, které uživatel už v nabídce viděl (za celou session) –
// runCncExport běží po každé úpravě výkresu a stejnou nabídku by jinak
// vnucoval pořád dokola, i po Zpět za smazáním. Znovu se nabízí jen, když
// přibude NOVÉ zdvojení.
const _offered = new Set();
// Nabídka je právě otevřená (další export mezitím nemá přidávat toast).
let _dialogOpen = false;
// Automatická nabídka až po první akci uživatele: při startu aplikace si
// pohled ještě vycentruje app.js (rAF + load) a detail by přebil – tam stačí
// toast a žluté zvýraznění. Otevření CAM nabízí vždy.
let _armed = false;
if (typeof document !== 'undefined') {
  const arm = () => { _armed = true; };
  document.addEventListener('pointerdown', arm, { once: true, capture: true });
  document.addEventListener('keydown', arm, { once: true, capture: true });
}

function _objKey(o) {
  const nums = [o.x1, o.y1, o.x2, o.y2, o.cx, o.cy, o.r, o.startAngle, o.endAngle];
  return o.type + ':' + nums.map(v => (v == null ? '' : (+v).toFixed(3))).join(',');
}
function _hasNew(dups) {
  return dups.some(d => !_offered.has(_objKey(d.obj)));
}

/** 1 čára / 2–4 čáry / 5+ čar */
function _plural(n, one, few, many) {
  return n === 1 ? one : (n >= 2 && n <= 4 ? few : many);
}

function _saveView() {
  return { zoom: state.zoom, panX: state.panX, panY: state.panY };
}
function _restoreView(v) {
  state.zoom = v.zoom; state.panX = v.panX; state.panY = v.panY;
  const zoomEl = document.getElementById('statusZoom');
  if (zoomEl) zoomEl.textContent = `Zoom: ${(state.zoom * 100).toFixed(0)}%`;
}
// Toast dole (typicky hlášení z exportu po poslední úpravě) by ležel přes
// tlačítka dotazu – dotaz říká totéž podrobněji, toast se schová.
function _hideToast() {
  const t = document.querySelector('.toast.show');
  if (t) { clearTimeout(t._timer); t.classList.remove('show'); }
}

// Přiblížit na objekty do plochy NAD otevřeným dotazovým oknem (volat až po
// showConfirmDialog, ať je okno změřitelné).
function _zoomTo(objs) {
  _hideToast();
  const b = objectsBounds(objs);
  if (!b) return;
  const above = document.querySelector('.input-overlay--peek .input-dialog');
  // Větší okraj než u běžného centrování: kousek okolí pro orientaci a
  // rezerva na horní lištu nástrojů, která na desktopu leží přes plátno.
  fitViewToWorldBounds(b, { minExtent: 30, above, padding: 0.25 });
}

/**
 * Smaže přebytečné kopie (jeden krok Zpět). Kóty navázané na mazanou kopii
 * se přepojí na čáru, která zůstává – měří totéž, nemají zmizet s ní.
 * @param {{obj: object, keep: object}[]} dups
 * @returns {number} počet smazaných
 */
export function removeContourDuplicates(dups) {
  const live = dups.filter(d => state.objects.includes(d.obj));
  if (live.length === 0) return 0;
  pushUndo();
  for (const d of live) {
    if (d.obj.id == null || d.keep.id == null) continue;
    for (const o of state.objects) {
      if (!o.isDimension) continue;
      if (o.sourceObjId === d.obj.id) o.sourceObjId = d.keep.id;
      if (o.dimLine1Id === d.obj.id) o.dimLine1Id = d.keep.id;
      if (o.dimLine2Id === d.obj.id) o.dimLine2Id = d.keep.id;
    }
  }
  deleteObjectsByIndices(live.map(d => state.objects.indexOf(d.obj)));
  state.contourDuplicates = [];
  return live.length;
}

/**
 * Přiblíží na zdvojené čáry (žluté zvýraznění) a nabídne smazání kopií.
 * Po rozhodnutí se pohled vrátí, kde byl – detail je jen po dobu dotazu;
 * ponechané zdvojení zůstává na výkrese vyznačené žlutě.
 * @param {{obj: object, keep: object}[]} dups
 * @param {{onDone?: () => void, zoom?: boolean}} [opts] `onDone` po rozhodnutí
 *   (obojím); `zoom: false` = pohled nechat (uživatel na místo právě kliknul)
 */
export function offerContourDuplicates(dups, { onDone = null, zoom = true } = {}) {
  if (!dups || dups.length === 0) { if (onDone) onDone(); return; }
  for (const d of dups) _offered.add(_objKey(d.obj));
  const view = _saveView();
  state.contourDuplicates = dups;
  const n = dups.length;
  const msg = n === 1
    ? 'Na výkrese leží dvě stejné čáry přesně přes sebe (vyznačeno žlutě) — jedna je navíc '
      + 'a kvůli ní se kontura hlásí jako rozvětvená.\n\nSmazat přebytečnou kopii? (Zpět ji vrátí.)'
    : `Na výkrese leží ${n}× dvě stejné čáry přesně přes sebe (vyznačeno žlutě) — ${n} ${_plural(n, 'čára je', 'čáry jsou', 'čar je')} navíc `
      + 'a kvůli nim se kontura hlásí jako rozvětvená.\n\nSmazat přebytečné kopie? (Zpět je vrátí.)';
  _dialogOpen = true;
  showConfirmDialog(msg, () => {
    _dialogOpen = false;
    const removed = removeContourDuplicates(dups);
    _restoreView(view);
    renderAll();
    showToast(`Zdvojené čáry smazány (${removed}) ✓`);
    if (onDone) onDone();
  }, {
    confirmLabel: n === 1 ? 'Smazat kopii' : `Smazat ${n} ${_plural(n, 'kopii', 'kopie', 'kopií')}`,
    cancelLabel: 'Ponechat',
    peek: true,
    onCancel: () => {
      _dialogOpen = false;
      _restoreView(view);
      renderAll();
      if (onDone) onDone();
    },
  });
  if (zoom) _zoomTo(dups.map(d => d.obj));
  else _hideToast();
  renderAll();
}

// Vzdálenost bodu od úsečky/oblouku (world) – zdvojené čáry jsou jen tyhle dva typy.
function _distToObj(o, x, y) {
  if (o.type === 'line') {
    const dx = o.x2 - o.x1, dy = o.y2 - o.y1, L2 = dx * dx + dy * dy;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - o.x1) * dx + (y - o.y1) * dy) / L2)) : 0;
    return Math.hypot(x - (o.x1 + t * dx), y - (o.y1 + t * dy));
  }
  if (o.type === 'arc') {
    const TAU = Math.PI * 2, ccw = o.ccw !== false;
    const norm = (v) => ((v % TAU) + TAU) % TAU;
    const a = Math.atan2(y - o.cy, x - o.cx);
    const sweep = norm(ccw ? o.endAngle - o.startAngle : o.startAngle - o.endAngle) || TAU;
    const rel = norm(ccw ? a - o.startAngle : o.startAngle - a);
    if (rel <= sweep) return Math.abs(Math.hypot(x - o.cx, y - o.cy) - o.r);
    const end = (ang) => Math.hypot(x - (o.cx + o.r * Math.cos(ang)), y - (o.cy + o.r * Math.sin(ang)));
    return Math.min(end(o.startAngle), end(o.endAngle));
  }
  return Infinity;
}

/**
 * Klik na žlutě vyznačenou zdvojenou čáru (nebo její popisek) v režimu Výběr:
 * nabídne smazání právě té kopie. Souřadnice jsou NEpřichycené (snap by klik
 * vedle na sousední čáru stáhl do společného vrcholu, tj. i na zdvojenou).
 * @param {number} wx  world X kliknutí
 * @param {number} wy  world Y kliknutí
 * @param {number} sx  screen X (stejná soustava jako worldToScreen)
 * @param {number} sy  screen Y
 * @param {number} [tolPx] tolerance zásahu čáry v px (prst víc než myš)
 * @returns {boolean} true = klik patřil zdvojené čáře (dál ho nezpracovávat)
 */
export function offerDuplicateAt(wx, wy, sx, sy, tolPx = 8) {
  const dups = (state.contourDuplicates || []).filter(d => state.objects.includes(d.obj));
  if (dups.length === 0 || _dialogOpen) return false;
  const byLabel = (state._dupLabelBoxes || []).find(b =>
    sx >= b.x0 && sx <= b.x1 && sy >= b.y0 && sy <= b.y1 && dups.includes(b.dup));
  let hit = byLabel ? byLabel.dup : null;
  if (!hit) {
    const tol = tolPx / state.zoom;
    let best = Infinity;
    for (const d of dups) {
      const dist = _distToObj(d.obj, wx, wy);
      if (dist <= tol && dist < best) { best = dist; hit = d; }
    }
  }
  if (!hit) return false;
  offerContourDuplicates([hit], { zoom: false });
  return true;
}

// Plátno je volné pro nabídku – nic se právě nekreslí a nad CAD neleží jiné
// okno ani CAM (jinak nabídku odložit na příští export, otisk nezapisovat).
function _canvasFree() {
  if (!_armed) return false;
  if (state.drawing || (state.tempPoints && state.tempPoints.length > 0)) return false;
  if (state.holderDrawMode) return false;
  if (typeof document === 'undefined') return false;
  return !document.querySelector('.cam-sim-root, .input-overlay');
}

/**
 * Automatická nabídka z CNC exportu (běží po každé úpravě výkresu): nabídne,
 * jen když přibylo zdvojení, které uživatel v nabídce ještě neviděl.
 * @param {{obj: object, keep: object}[]} dups
 * @returns {boolean} true = nabídka se otevřela (toast je pak zbytečný)
 */
export function maybeOfferContourDuplicates(dups) {
  if (!dups || dups.length === 0) return false;
  if (_dialogOpen) return true;
  if (!_hasNew(dups) || !_canvasFree()) return false;
  offerContourDuplicates(dups);
  return true;
}

/**
 * Otevření CAM z výkresu: nejdřív nabídka smazání zdvojených čar (pokud je
 * uživatel ještě neviděl), pak přenos jen hlavního profilu.
 * Zůstane-li mimo profil něco dalšího, ukáže to a zeptá se.
 * @param {(code: string) => void} openCam
 */
export function openCamFromDrawing(openCam) {
  const dups = findContourDuplicates();
  const transfer = () => _transferMainProfile(openCam);
  if (dups.length > 0 && _hasNew(dups)) {
    offerContourDuplicates(dups, { onDone: transfer });
  } else {
    transfer();
  }
}

function _transferMainProfile(openCam) {
  const res = bridge.buildCamTransfer ? bridge.buildCamTransfer() : null;
  if (!res || typeof res !== 'object') { openCam(res || undefined); return; }
  const suspect = res.boreSuspect || [];
  if (res.leftovers.length === 0 && suspect.length === 0) { openCam(res.code); return; }
  const view = _saveView();
  const shown = res.leftovers.length > 0 ? res.leftovers : suspect;
  state.camLeftovers = shown;
  const n = shown.length;
  const msg = res.leftovers.length > 0
    ? `Do CAM půjde jen hlavní souvislý profil. ${n} ${_plural(n, 'čára na něj nenavazuje', 'čáry na něj nenavazují', 'čar na něj nenavazuje')} `
      + '(vyznačeno fialově „mimo profil") a do CAM ' + _plural(n, 'nepůjde', 'nepůjdou', 'nepůjde') + '.\n\n'
      + 'Patří-li k profilu, je v kontuře mezera — vraťte se do výkresu a spojte ji.'
    : `Vyznačené čáry (${n}) končí těsně u konce profilu, ale nenavazují na něj — v kontuře je mezera. `
      + 'Do CAM půjdou jako samostatná DÍRA pro vyvrtávání, ne jako součást kontury.\n\n'
      + 'Patří-li k profilu, vraťte se do výkresu a mezeru spojte.';
  showConfirmDialog(msg, () => {
    state.camLeftovers = [];
    _restoreView(view);
    renderAll();
    openCam(res.code);
  }, {
    confirmLabel: res.leftovers.length > 0 ? 'Otevřít CAM bez nich' : 'Otevřít CAM i tak',
    cancelLabel: 'Zpět do výkresu',
    danger: false,
    peek: true,
    // Zvýraznění zůstane, ať je vidět, co opravit; sundá ho příští úprava
    // výkresu (runCncExport → _reportContourIssues).
    onCancel: () => renderAll(),
  });
  _zoomTo(shown);
  renderAll();
}

bridge.offerContourDuplicates = offerContourDuplicates;
bridge.maybeOfferContourDuplicates = maybeOfferContourDuplicates;
bridge.openCamFromDrawing = openCamFromDrawing;
