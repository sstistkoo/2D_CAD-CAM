// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Bokorys: lišta čela pod nárysem                      ║
// ╚══════════════════════════════════════════════════════════════╝
// Lišta čela leží PŘÍMO NA PLÁTNĚ pod nárysem — posouvá se s výkresem a mění
// velikost se zoomem (dole u okraje plátna zakrývala na mobilu tlačítka,
// uživatel 19. 10. 2026). Na soustruhu posuvník lícuje s osou Z nárysu:
// krajní polohy jezdce jsou pod konci profilu, jezdec stojí pod značkou řezu.
// Karusel (Z je svisle) a „jen bokorys" (nárys skrytý): posuvník pod kresbou
// bez lícování.
//
// Posuvník Z (značky osazení) a pod ním řádek: výběr čela, ➕ nové, 🗑 smazat,
// Z roviny čela (políčko, i výraz), ◀ zprava / ▶ zleva (šipka = směr pohledu).
// Lišta je v #canvasWrap pod lištou nástrojů (z-index), okraj plátna ji
// ořízne; poloha se přepočítá po každém vykreslení (onFaceDrawn).
import { state, showToast } from '../state.js';
import { safeEvalMath } from '../utils.js';
import { worldToScreen } from '../canvas.js';
import { updateLayerList } from '../ui.js';
import { getFaceLayer, getFaceLayers, faceViewMode, profileObjects, faceLabel } from './faceLayer.js';
import { shoulderZs, profileBounds, profileRadii, faceRadius, faceCutGeom, onFaceDrawn, objectPoints, inFaceDisc } from './faceReference.js';

const THUMB = 16;              // šířka jezdce posuvníku (výchozí vzhled prohlížečů) [px]
const RANGE_H = 18;            // výška posuvníku při měřítku 1 [px]
const BASE_W = 340;            // šířka nárysu na plátně, při které má lišta měřítko 1 [px]
const MIN_S = 0.7, MAX_S = 1.4;
const GAP = 12;                // mezera pod nárysem (šipky řezu, čísla osy) [px]

let bar = null;
let deps = null;
let lastPlace = '';

/**
 * @param d { setCurrent(l), newFace(z, side) → vrstva, deleteFace(l), refresh(),
 *   setFaceZ(z, snapMm), renameFace(l) } — z faceView.js (bez cyklického importu)
 */
export function initFaceBar(d) {
  deps = d;
  onFaceDrawn(placeBar);
}

function buildBar() {
  bar = document.createElement('div');
  bar.id = 'faceBar';
  bar.innerHTML = `
    <input data-fb="range" type="range" list="faceBarTicks" title="Posun roviny čela po profilu — přichytí se k osazením">
    <datalist id="faceBarTicks"></datalist>
    <div class="fb-row">
      <select data-fb="sel" title="Čelo, do kterého se kreslí (každé má vlastní kresbu děr)"></select>
      <button data-fb="add" title="Nové čelo — vlastní kresba děr, poloha Z a strana">➕</button>
      <button data-fb="del" title="Smazat aktuální čelo i s jeho kresbou">🗑</button>
      <label title="Z roviny čela v nárysu (lze zadat i výraz)">Z <input data-fb="z" type="text" inputmode="decimal" autocomplete="off"></label>
      <button data-fb="side" title="Odkud se na čelo dívá a vrtá: ◀ zprava (díváme se doleva, k −Z) / ▶ zleva (doprava). Šipka = směr pohledu"></button>
    </div>`;
  (document.getElementById('canvasWrap') || document.body).appendChild(bar);
  const sel = bar.querySelector('[data-fb="sel"]');
  const zIn = bar.querySelector('[data-fb="z"]');
  const range = bar.querySelector('[data-fb="range"]');
  sel.addEventListener('change', () => {
    const l = getFaceLayers().find(x => String(x.id) === sel.value);
    if (l) { deps.setCurrent(l); deps.refresh(); }
  });
  bar.querySelector('[data-fb="add"]').addEventListener('click', () => {
    const cur = getFaceLayer();
    const l = deps.newFace(cur ? cur.faceZ : 0, cur ? cur.faceSide : 'right');
    deps.setCurrent(l);
    deps.refresh();
    showToast('Nové čelo — nastavte Z posuvníkem nebo do políčka', 2500, { bell: true });
  });
  bar.querySelector('[data-fb="del"]').addEventListener('click', () => {
    const cur = getFaceLayer();
    if (cur) deps.deleteFace(cur);
  });
  bar.querySelector('[data-fb="side"]').addEventListener('click', () => {
    const cur = getFaceLayer();
    if (!cur) return;
    cur.faceSide = cur.faceSide === 'left' ? 'right' : 'left';
    cur.sideManual = true;
    deps.renameFace(cur);
    deps.refresh();
  });
  // Posuvník přichytává k osazení do 1,5 % rozsahu (min. 0,2 mm).
  const rangeSnap = () => {
    const sh = shoulderZs(profileObjects(), state.machineType);
    return Math.max(0.2, (sh.max - sh.min) * 0.015);
  };
  range.addEventListener('input', () => deps.setFaceZ(parseFloat(range.value), rangeSnap()));
  range.addEventListener('change', () => updateLayerList());
  zIn.addEventListener('change', () => {
    const v = safeEvalMath(zIn.value);
    if (!Number.isFinite(v)) { showToast('Neplatné číslo'); updateBar(); return; }
    const cur = getFaceLayer();
    if (cur) cur.sideManual = false;
    deps.setFaceZ(v, 0);
    updateLayerList();
  });
  // Kolečko nad lištou zoomuje plátno jako nad výkresem (lišta je jeho součástí).
  bar.addEventListener('wheel', e => {
    const cv = document.getElementById('drawCanvas');
    if (!cv) return;
    e.preventDefault();
    cv.dispatchEvent(new WheelEvent('wheel', {
      deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode, clientX: e.clientX, clientY: e.clientY,
      ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, bubbles: true, cancelable: true,
    }));
  }, { passive: false });
  window.addEventListener('resize', () => requestAnimationFrame(placeBar));
}

/** Obnovit obsah lišty (čela, Z, strana, rozsah posuvníku) a polohu. */
export function updateBar() {
  const mode = faceViewMode();
  if (!bar) buildBar();
  bar.style.display = mode === 'off' ? 'none' : '';
  if (mode === 'off') return;
  const cur = getFaceLayer();
  const sel = bar.querySelector('[data-fb="sel"]');
  sel.innerHTML = getFaceLayers().map(l => `<option value="${l.id}"${l === cur ? ' selected' : ''}>${faceLabel(l)}</option>`).join('');
  const zIn = bar.querySelector('[data-fb="z"]');
  if (document.activeElement !== zIn) zIn.value = String(cur.faceZ);
  bar.querySelector('[data-fb="side"]').textContent = cur.faceSide === 'left' ? '▶ zleva' : '◀ zprava';
  const sh = shoulderZs(profileObjects(), state.machineType);
  const range = bar.querySelector('[data-fb="range"]');
  range.min = String(Math.min(sh.min, cur.faceZ));
  range.max = String(Math.max(sh.max, cur.faceZ));
  range.step = 'any';
  if (document.activeElement !== range) range.value = String(cur.faceZ);
  bar.querySelector('#faceBarTicks').innerHTML = sh.zs.map(z => `<option value="${z}"></option>`).join('');
  lastPlace = '';
  placeBar();
}

/**
 * Obdélník kresby v nárysu [svět]: profil (s kótami) + vše dokreslené MIMO kruh
 * bokorysu — i do vrstvy čela, kam se v režimu čela kreslí (lišta ležela přes
 * dokreslenou úsečku, uživatel 20. 10. 2026). Skryté vrstvy se nepočítají.
 */
export function drawnBounds() {
  const hidden = new Set(state.layers.filter(l => !l.visible).map(l => l.id));
  const faceIds = new Set(getFaceLayers().map(l => l.id));
  const vis = state.objects.filter(o => !hidden.has(o.layer) && !o.isCamPathNote);
  const box = profileBounds(vis.filter(o => !faceIds.has(o.layer)), true)
    || { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  vis.filter(o => faceIds.has(o.layer)).forEach(o => {
    (o.type === 'text' ? [{ x: o.x, y: o.y }] : objectPoints(o)).forEach(p => {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || inFaceDisc(p.x, p.y)) return;
      box.minX = Math.min(box.minX, p.x); box.maxX = Math.max(box.maxX, p.x);
      box.minY = Math.min(box.minY, p.y); box.maxY = Math.max(box.maxY, p.y);
    });
  });
  return Number.isFinite(box.minX) ? box : null;
}

/**
 * Kam lišta patří [px plátna]: pod nárys (s kótami, dokreslením a značkou řezu), v režimu
 * „jen bokorys" pod bokorys. Soustruh: x0…x1 = Z min…max posuvníku, `rtl`
 * při zrcadlené ose.
 * @returns {{ x0:number, x1:number, y:number, rtl:boolean }|null}
 */
export function faceBarGeom(cur, zMin, zMax, w2s = worldToScreen) {
  const pts = [];
  let zAligned = false;
  if (cur.solo) {
    if (!cur.origin) return null;
    const geo = profileRadii(profileObjects(), state.machineType);
    const R = faceRadius(geo ? geo.stockR : 50) * 1.08;
    pts.push([cur.origin.x - R, cur.origin.y - R], [cur.origin.x + R, cur.origin.y + R]);
  } else {
    const b = drawnBounds();
    if (b) pts.push([b.minX, b.minY], [b.maxX, b.maxY]);
    const cut = faceCutGeom();
    if (cut) pts.push(cut.a, cut.b);
    zAligned = state.machineType !== 'karusel';
  }
  if (!pts.length) return null;
  const sp = pts.map(p => w2s(p[0], p[1]));
  const xs = sp.map(p => p[0]);
  const y = Math.max(...sp.map(p => p[1])) + GAP;
  if (!zAligned) return { x0: Math.min(...xs), x1: Math.max(...xs), y, rtl: false };
  const a = w2s(zMin, 0)[0], b = w2s(zMax, 0)[0];
  return { x0: Math.min(a, b), x1: Math.max(a, b), y, rtl: b < a };
}

/** Měřítko lišty podle šířky nárysu na plátně (s mezemi, ať jde ovládat). */
export function faceBarScale(width) {
  return Math.max(MIN_S, Math.min(MAX_S, width / BASE_W));
}

function placeBar() {
  if (!bar || bar.style.display === 'none') return;
  const cur = getFaceLayer();
  const cv = document.getElementById('drawCanvas');
  if (!cur || !cv) return;
  const range = bar.querySelector('[data-fb="range"]');
  const row = bar.querySelector('.fb-row');
  const g = faceBarGeom(cur, +range.min, +range.max);
  if (!g) return;
  const W = g.x1 - g.x0;
  const s = faceBarScale(W);
  // Řádek pod posuvníkem: nejvýš na šířku plátna, v mezích lišty, a jde-li
  // to, celý na plátně.
  const cw = cv.clientWidth;
  const sr = Math.min(s, (cw - 8) / (row.offsetWidth || 1));
  const rowW = row.offsetWidth * sr;
  let left = Math.min(Math.max(g.x0, 4), cw - rowW - 4);
  left = Math.max(g.x0, Math.min(left, g.x1 - rowW));
  const key = [g.x0, g.y, W, s, sr, g.rtl, left].map(v => (typeof v === 'number' ? v.toFixed(2) : v)).join();
  if (key === lastPlace) return;
  lastPlace = key;
  // Posuvník širší o jezdec: střed jezdce v krajních polohách přesně nad x0 / x1.
  Object.assign(range.style, {
    left: `${g.x0 - THUMB * s / 2}px`, top: `${g.y}px`, width: `${W / s + THUMB}px`,
    transform: `scale(${s})`, direction: g.rtl ? 'rtl' : 'ltr',
  });
  Object.assign(row.style, { left: `${left}px`, top: `${g.y + (RANGE_H + 2) * s}px`, transform: `scale(${sr})` });
}

export const FACE_BAR_CSS = `
#faceBar { position: absolute; inset: 0; z-index: 4; pointer-events: none; overflow: hidden; }
#faceBar > * { pointer-events: auto; }
#faceBar input[type=range] {
  position: absolute; margin: 0; padding: 0; height: ${RANGE_H}px; transform-origin: 0 0;
  accent-color: var(--ctp-peach); background: transparent; cursor: pointer;
}
#faceBar .fb-row {
  position: absolute; transform-origin: 0 0; display: flex; align-items: center; gap: 5px; white-space: nowrap;
  padding: 4px 6px; border-radius: 8px; background: var(--ctp-mantle); color: var(--ctp-text);
  border: 1px solid var(--ctp-surface1); box-shadow: 0 2px 10px rgba(0,0,0,0.35); font-size: 12px;
}
#faceBar select, #faceBar input[type=text], #faceBar button {
  background: var(--ctp-surface0); color: var(--ctp-text); border: 1px solid var(--ctp-surface1);
  border-radius: 5px; padding: 3px 6px; font-size: 12px; min-width: 0;
}
#faceBar input[type=text] { width: 64px; }
#faceBar button { cursor: pointer; }
#faceBar button:disabled { opacity: 0.4; cursor: default; }
#faceBar label { display: flex; align-items: center; gap: 3px; color: var(--ctp-subtext0); }
/* Lišta patří k plátnu CAD — nad oknem (CAM, dialogy) by ovládala neviditelný
   výkres (uživatel 18. 10. 2026). Plovoucí okna (VK) nevadí. */
body:has(.calc-overlay:not(.calc-overlay-float)) #faceBar { display: none !important; }
@media (max-width: 900px) {
  body.sidebar-open #faceBar { display: none !important; }
}`;
