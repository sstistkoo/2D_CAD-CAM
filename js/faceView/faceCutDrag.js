// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Bokorys: tažení značky řezu v nárysu                 ║
// ╚══════════════════════════════════════════════════════════════╝
// Čerchovanou čáru řezu (se šipkami a popiskem Z) v nárysu lze chytit myší
// nebo prstem a posouvat po profilu — Z čela se mění průběžně, bokorys se
// překresluje, u osazení profilu se řez přichytí (stejně jako posuvník pod nárysem).
//
// Zachytává se mimo rozkreslený objekt; do 8 px (prst 22 px) od čáry klik
// patří řezu, ne objektu pod ním. Ve Výběru kdekoli na čáře, v ostatních
// nástrojích za konce přesahující díl (šipky, popisek) — po nakreslení úsečky
// zůstane nástroj Úsečka a řez nešel chytit vůbec (uživatel 20. 10. 2026);
// uvnitř dílu se kreslí (řez stojí často přímo na osazení).
// Listenery jsou v zachycovací fázi na #canvasWrap, takže se dostanou před obsluhu myši (events.js) i dotyku
// (touch.js) na plátně, a při chycení řezu je nepustí dál.
import { state } from '../state.js';
import { worldToScreen, screenToWorld } from '../canvas.js';
import { renderAll } from '../render.js';
import { faceCutGeom, cutHit, setFaceCutHot as setHot } from './faceReference.js';

const setFaceCutHot = on => { if (setHot(on)) renderAll(); };

const MOUSE_PX = 8, TOUCH_PX = 22, END_PAD = 12;

/** Je bod (sx, sy) v plátně na značce řezu? (čistá geometrie: faceReference.cutHit) */
const hitCut = (sx, sy, tol) =>
  cutHit(faceCutGeom(), worldToScreen, sx, sy, tol, END_PAD, state.tool !== 'select');

/**
 * @param deps { setFaceZ(z, snapMm), onDone() } — nastaví Z aktuálního čela
 *   (faceView.js) a po puštění řezu obnoví seznamy (název čela se změnil)
 */
export function initCutDrag({ setFaceZ, onDone }) {
  const wrap = document.getElementById('canvasWrap');
  const canvas = document.getElementById('drawCanvas');
  if (!wrap || !canvas) return;
  let drag = null;          // { off } rozdíl mezi Z pod kurzorem a Z řezu při chycení
  let savedCursor = null;   // inline kurzor před najetím

  let dragEndAt = -1e9;     // kdy skončilo tažení myší (pak přijde ještě 'click')

  // Ne během rozkresleného objektu ani rozmisťované kóty (tu umístí puštění myši).
  const canGrab = () => !state.drawing && !(state.tempPoints && state.tempPoints.length)
    && !state.dragging && !state.holderDrawMode && !state._dimPlacing;
  const local = (cx, cy) => { const r = canvas.getBoundingClientRect(); return [cx - r.left, cy - r.top]; };
  const zAt = (sx, sy) => { const w = screenToWorld(sx, sy); const cut = faceCutGeom(); return cut.isCar ? w[1] : w[0]; };

  function setCursor(on) {
    if (on && savedCursor === null) {
      savedCursor = canvas.style.cursor;
      const cut = faceCutGeom();
      canvas.style.cursor = cut && cut.isCar ? 'ns-resize' : 'ew-resize';
    } else if (!on && savedCursor !== null) {
      canvas.style.cursor = savedCursor;
      savedCursor = null;
    }
  }

  function start(cx, cy, tol) {
    if (!canGrab()) return false;
    const [sx, sy] = local(cx, cy);
    if (!hitCut(sx, sy, tol)) return false;
    const cut = faceCutGeom();
    drag = { off: zAt(sx, sy) - cut.z };
    setFaceCutHot(true);
    setCursor(true);
    return true;
  }
  function move(cx, cy) {
    const [sx, sy] = local(cx, cy);
    // Přichycení k osazení: 8 px na obrazovce přepočtené na mm.
    setFaceZ(zAt(sx, sy) - drag.off, MOUSE_PX / (state.zoom || 1));
  }
  function end() {
    drag = null;
    setFaceCutHot(false);
    setCursor(false);
    onDone();
  }

  // Lišta čela je taky v #canvasWrap (pod nárysem, jezdec pod řezem) — co
  // míří na ni, patří jí.
  const onBar = e => e.target !== canvas;

  // ── myš ──
  wrap.addEventListener('mousedown', e => {
    if (e.button !== 0 || e.shiftKey || onBar(e)) return;
    if (start(e.clientX, e.clientY, MOUSE_PX)) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
  // Tažení sleduje celé okno — kurzor smí z plátna vyjet, řez se nepustí.
  window.addEventListener('mousemove', e => {
    if (!drag) return;
    e.stopImmediatePropagation();
    move(e.clientX, e.clientY);
  }, true);
  wrap.addEventListener('mousemove', e => {
    if (drag) return;
    if (!canGrab() || onBar(e)) { setCursor(false); setFaceCutHot(false); return; }
    const [sx, sy] = local(e.clientX, e.clientY);
    const over = hitCut(sx, sy, MOUSE_PX);
    setCursor(over);
    setFaceCutHot(over);
  }, true);
  window.addEventListener('mouseup', () => { if (drag) { end(); dragEndAt = performance.now(); } }, true);
  // 'click' po puštění řezu nepatří plátnu — 🎯 výběr z plátna (canvasPick)
  // a dialogy poslouchají 'click' a vzaly by bod, kde se řez pustil.
  wrap.addEventListener('click', e => {
    if (performance.now() - dragEndAt > 400) return;
    dragEndAt = -1e9;
    e.stopImmediatePropagation(); e.preventDefault();
  }, true);

  // ── dotyk ──
  wrap.addEventListener('touchstart', e => {
    if (e.touches.length !== 1 || onBar(e)) return;
    const t = e.touches[0];
    if (start(t.clientX, t.clientY, TOUCH_PX)) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, { capture: true, passive: false });
  wrap.addEventListener('touchmove', e => {
    if (!drag) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (e.touches.length === 1) move(e.touches[0].clientX, e.touches[0].clientY);
  }, { capture: true, passive: false });
  const touchEnd = e => { if (drag) { e.stopImmediatePropagation(); end(); } };
  wrap.addEventListener('touchend', touchEnd, true);
  wrap.addEventListener('touchcancel', touchEnd, true);
}
