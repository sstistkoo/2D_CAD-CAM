// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Bokorys (◎ Čelo): zapnutí, čela, lišta, tlačítka     ║
// ╚══════════════════════════════════════════════════════════════╝
// ◎ přepíná: profil → profil + bokorys → jen bokorys → profil; každé
// přepnutí zarámuje to, co je vidět. Bokorys = pohled na čelo VPRAVO vedle
// nárysu (i na mobilu), na ose vřetena. Kreslí se do aktuálního čela
// (faceLayer.js): kružnice = díra, úsečka = drážka; v CAM je načte
// 🛠 Operace → 📥 Z CAD.
//
// Čel může být víc (díry na osazení uprostřed profilu, zleva i zprava):
// lišta čela dole na plátně — výběr čela, ➕ nové, 🗑 smazat, Z roviny čela
// (políčko + posuvník se značkami osazení), ◀ zprava / ▶ zleva (šipka = směr
// pohledu). Podklad
// bokorysu ukazuje průměry profilu v rovině čela, v nárysu je značka řezu.
//
// Když profil zasáhne do bokorysu nebo se změní stroj, kresby všech čel se
// posunou (i v historii ↩, ať Zpět nepřeskakuje).
//
// Tlačítka: desktop = ◎ v horní liště; mobil = kulaté ◎ nahoře u 🔢.
import { state, showToast } from '../state.js';
import { safeEvalMath } from '../utils.js';
import { bridge } from '../bridge.js';
import { renderAll } from '../render.js';
import { fitViewToWorldBounds } from '../canvas.js';
import { calculateAllIntersections } from '../geometry.js';
import { updateLayerList, updateObjectList } from '../ui.js';
import { translateObject } from '../objects.js';
import {
  FACE_LAYER_NAME, getFaceLayer, getFaceLayers, faceViewMode, profileObjects,
  onFaceViewChange, faceLabel,
} from './faceLayer.js';
import { computeFaceOrigin, profileAtZ, shoulderZs } from './faceReference.js';
import { initCutDrag } from './faceCutDrag.js';

/** Zasahuje profil do kruhu bokorysu? */
function overlaps(b, o, R) {
  if (!b) return false;
  const dx = Math.max(b.minX - o.x, 0, o.x - b.maxX);
  const dy = Math.max(b.minY - o.y, 0, o.y - b.maxY);
  return Math.hypot(dx, dy) < R + 2;
}

/** Posune kresby všech čel o (dx, dy) — ve výkresu i ve všech snímcích ↩/↪. */
function moveFaceDrawings(dx, dy) {
  const ids = new Set(getFaceLayers().map(l => l.id));
  state.objects.forEach(o => { if (ids.has(o.layer)) translateObject(o, dx, dy); });
  const mapStack = stack => (stack || []).map(raw => {
    try {
      const snap = JSON.parse(raw);
      const objs = Array.isArray(snap) ? snap : snap.objects;
      (objs || []).forEach(o => { if (o && ids.has(o.layer)) translateObject(o, dx, dy); });
      return JSON.stringify(snap);
    } catch { return raw; }
  });
  state.undoStack = mapStack(state.undoStack);
  state.redoStack = mapStack(state.redoStack);
}

const layout = () => computeFaceOrigin(profileObjects(), state.machineType);

/** Střed bokorysu (společný všem čelům); při kolizi s profilem posun. */
function applyLayout() {
  const cur = getFaceLayer();
  const lay = layout();
  const all = getFaceLayers();
  const O = cur.origin;
  if (!O) all.forEach(l => { l.origin = { ...lay.origin }; });
  else if (cur.placement !== lay.placement || cur.machine !== state.machineType || overlaps(lay.bounds, O, lay.R)) {
    moveFaceDrawings(lay.origin.x - O.x, lay.origin.y - O.y);
    all.forEach(l => { l.origin = { ...lay.origin }; });
  }
  all.forEach(l => { l.placement = lay.placement; l.machine = state.machineType; if (!l.origin) l.origin = { ...cur.origin }; });
  return lay;
}

/** Zarámovat, co je vidět: profil + bokorys / jen bokorys / jen profil. */
function fitView(mode) {
  const lay = layout();
  const b = lay.bounds, R = lay.R;
  const cur = getFaceLayer();
  const O = cur && cur.origin;
  if (mode === 'solo' && O) fitViewToWorldBounds({ minX: O.x - R, maxX: O.x + R, minY: O.y - R, maxY: O.y + R });
  else if (mode === 'both' && O) fitViewToWorldBounds({
    minX: Math.min(b.minX, O.x - R), maxX: Math.max(b.maxX, O.x + R),
    minY: Math.min(b.minY, O.y - R), maxY: Math.max(b.maxY, O.y + R),
  });
  else fitViewToWorldBounds(b);
}

/** Zapnutý bokorys po načtení projektu přerozmístit (profil se mohl změnit). */
function relayoutIfOn() {
  const cur = getFaceLayer();
  if (!cur || faceViewMode() === 'off') return;
  const before = JSON.stringify(cur.origin);
  applyLayout();
  if (JSON.stringify(cur.origin) !== before) { fitView(faceViewMode()); calculateAllIntersections(); renderAll(); }
}

/** Výchozí Z prvního čela: pravý konec profilu (čelo zprava). */
function defaultFace() {
  const sh = shoulderZs(profileObjects(), state.machineType);
  return { faceZ: +sh.max.toFixed(3), faceSide: 'right' };
}

function newFaceLayer(z, side) {
  const l = {
    id: state.nextLayerId++, name: FACE_LAYER_NAME, color: '#fab387', visible: false, locked: false,
    isFace: true, faceZ: z, faceSide: side,
  };
  l.name = `Čelo ${faceLabel(l)}`;
  state.layers.push(l);
  return l;
}

/** Přepnout aktuální čelo — viditelné je jen ono, režim (jen bokorys) se přenese. */
function setCurrent(next) {
  const prev = getFaceLayer();
  const mode = faceViewMode();
  getFaceLayers().forEach(l => { l.faceCurrent = l === next; });
  if (prev && prev !== next) {
    next.solo = prev.solo; next.soloHidden = prev.soloHidden; next.prevActive = prev.prevActive;
    prev.solo = false; prev.soloHidden = [];
    if (!next.origin && prev.origin) next.origin = { ...prev.origin };
  }
  getFaceLayers().forEach(l => { l.visible = mode !== 'off' && l === next; });
  if (mode !== 'off') state.activeLayer = next.id;
  state.selected = null; state.multiSelected.clear(); state.selectedPoint = null;
}

export function enableFaceView() {
  let cur = getFaceLayer();
  if (!cur) {
    const d = defaultFace();
    cur = newFaceLayer(d.faceZ, d.faceSide);
    cur.faceCurrent = true;
  }
  getFaceLayers().forEach(l => {
    if (!Number.isFinite(l.faceZ)) Object.assign(l, defaultFace());
    if (!l.faceSide) l.faceSide = 'right';
    renameFace(l);
  });
  endSolo(cur);   // starý příznak „jen bokorys" z uloženého projektu
  applyLayout();
  getFaceLayers().forEach(l => { l.visible = l === cur; });
  if (state.activeLayer !== cur.id) { cur.prevActive = state.activeLayer; state.activeLayer = cur.id; }
  fitView('both');
  refresh();
  // Na mobilu pod zvoneček 🔔 (okénko dole by zakrylo lištu čela).
  showToast('◎ Bokorys: kreslete do čela — kružnice = díra, úsečka = drážka. Čelo (Z, strana) vyberte v liště dole. V CAM: 🛠 Operace → 📥 Z CAD', 5000, { bell: true });
}

/** Jen bokorys: skrýt ostatní viditelné vrstvy (zapamatovat si které). */
export function soloFaceView() {
  const cur = getFaceLayer();
  if (!cur || faceViewMode() !== 'both') return;
  cur.soloHidden = state.layers.filter(l => !l.isFace && l.visible).map(l => l.id);
  cur.soloHidden.forEach(id => { const l = state.layers.find(x => x.id === id); if (l) l.visible = false; });
  cur.solo = true;
  state.selected = null; state.multiSelected.clear(); state.selectedPoint = null;
  fitView('solo');
  refresh();
}

/** Konec režimu „jen bokorys" — vrátit skryté vrstvy. */
function endSolo(layer) {
  (layer.soloHidden || []).forEach(id => { const l = state.layers.find(x => x.id === id); if (l) l.visible = true; });
  layer.solo = false;
  layer.soloHidden = [];
}

export function disableFaceView() {
  const cur = getFaceLayer();
  if (!cur) return;
  endSolo(cur);
  getFaceLayers().forEach(l => { l.visible = false; });
  if (getFaceLayers().some(l => l.id === state.activeLayer)) {
    const prev = state.layers.find(l => l.id === cur.prevActive && !l.isFace);
    state.activeLayer = prev ? prev.id : 0;
  }
  // Výběr nesmí zůstat na skrytých objektech.
  state.selected = null; state.multiSelected.clear(); state.selectedPoint = null;
  fitView('off');
  refresh();
}

function refresh() {
  calculateAllIntersections();
  updateLayerList();
  updateObjectList();
  updateButtons();
  renderAll();
}

// ── lišta čela ──────────────────────────────────────────────
let bar = null;
function buildBar() {
  bar = document.createElement('div');
  bar.id = 'faceBar';
  bar.innerHTML = `
    <div class="fb-row">
      <select data-fb="sel" title="Čelo, do kterého se kreslí (každé má vlastní kresbu děr)"></select>
      <button data-fb="add" title="Nové čelo — vlastní kresba děr, poloha Z a strana">➕</button>
      <button data-fb="del" title="Smazat aktuální čelo i s jeho kresbou">🗑</button>
      <label title="Z roviny čela v nárysu (lze zadat i výraz)">Z <input data-fb="z" type="text" inputmode="decimal" autocomplete="off"></label>
      <button data-fb="side" title="Odkud se na čelo dívá a vrtá: ◀ zprava (díváme se doleva, k −Z) / ▶ zleva (doprava). Šipka = směr pohledu"></button>
    </div>
    <input data-fb="range" type="range" list="faceBarTicks" title="Posun roviny čela po profilu — přichytí se k osazením">
    <datalist id="faceBarTicks"></datalist>`;
  document.body.appendChild(bar);
  const sel = bar.querySelector('[data-fb="sel"]');
  const zIn = bar.querySelector('[data-fb="z"]');
  const range = bar.querySelector('[data-fb="range"]');
  sel.addEventListener('change', () => {
    const l = getFaceLayers().find(x => String(x.id) === sel.value);
    if (l) { setCurrent(l); refresh(); }
  });
  bar.querySelector('[data-fb="add"]').addEventListener('click', () => {
    const cur = getFaceLayer();
    const l = newFaceLayer(cur ? cur.faceZ : 0, cur ? cur.faceSide : 'right');
    setCurrent(l);
    refresh();
    showToast('Nové čelo — nastavte Z posuvníkem nebo do políčka', 2500, { bell: true });
  });
  bar.querySelector('[data-fb="del"]').addEventListener('click', () => {
    const cur = getFaceLayer();
    if (!cur) return;
    deleteFace(cur);
  });
  bar.querySelector('[data-fb="side"]').addEventListener('click', () => {
    const cur = getFaceLayer();
    if (!cur) return;
    cur.faceSide = cur.faceSide === 'left' ? 'right' : 'left';
    cur.sideManual = true;
    renameFace(cur);
    refresh();
  });
  // Posuvník přichytává k osazení do 1,5 % rozsahu (min. 0,2 mm).
  const rangeSnap = () => {
    const sh = shoulderZs(profileObjects(), state.machineType);
    return Math.max(0.2, (sh.max - sh.min) * 0.015);
  };
  const setZ = (z, fromRange) => setFaceZ(z, fromRange ? rangeSnap() : 0);
  range.addEventListener('input', () => setZ(parseFloat(range.value), true));
  range.addEventListener('change', () => updateLayerList());
  zIn.addEventListener('change', () => {
    const v = safeEvalMath(zIn.value);
    if (!Number.isFinite(v)) { showToast('Neplatné číslo'); updateBar(); return; }
    const cur = getFaceLayer();
    if (cur) cur.sideManual = false;
    setZ(v, false);
    updateLayerList();
  });
  window.addEventListener('resize', () => requestAnimationFrame(placeBar));
}

function renameFace(l) { l.name = `Čelo ${faceLabel(l)}`; }

/**
 * Nastaví Z aktuálního čela (posuvník, políčko, tažení řezu v nárysu).
 * @param snapMm přichytit k nejbližšímu osazení profilu do této vzdálenosti [mm] (0 = ne)
 */
export function setFaceZ(z, snapMm = 0) {
  const cur = getFaceLayer();
  if (!cur || !Number.isFinite(z)) return;
  if (snapMm > 0) {
    const sh = shoulderZs(profileObjects(), state.machineType);
    const near = sh.zs.reduce((b, s) => (Math.abs(s - z) < Math.abs(b - z) ? s : b), Infinity);
    if (Math.abs(near - z) <= snapMm) z = near;
  }
  cur.faceZ = +(+z).toFixed(3);
  // Strana podle osazení (menší průměr vpravo → čelo zprava), dokud ji
  // uživatel nepřepnul ručně.
  const side = profileAtZ(profileObjects(), state.machineType, cur.faceZ).side;
  if (side && !cur.sideManual) cur.faceSide = side;
  renameFace(cur);
  updateBar();
  renderAll();
}

/**
 * Smazat čelo i s kresbou — NAVŽDY (po potvrzení): vrstva zmizí, a proto se
 * její objekty vyřadí i ze snímků ↩/↪. Jinak by ↩ vrátil díry na
 * neexistující vrstvu a ty by se počítaly do profilu (přenos do CAM).
 */
export function deleteFace(layer) {
  const n = state.objects.filter(o => o.layer === layer.id).length;
  if (!confirm(`Smazat čelo ${faceLabel(layer)}${n ? ` i s ${n} objekty kresby` : ''}? Nejde vrátit.`)) return false;
  const mode = faceViewMode();
  const others = getFaceLayers().filter(l => l !== layer);
  if (others.length) setCurrent(others[0]);
  else if (mode !== 'off') disableFaceView();
  state.objects = state.objects.filter(o => o.layer !== layer.id);
  const purge = stack => (stack || []).map(raw => {
    try {
      const snap = JSON.parse(raw);
      if (Array.isArray(snap)) return JSON.stringify(snap.filter(o => !o || o.layer !== layer.id));
      snap.objects = (snap.objects || []).filter(o => !o || o.layer !== layer.id);
      return JSON.stringify(snap);
    } catch { return raw; }
  });
  state.undoStack = purge(state.undoStack);
  state.redoStack = purge(state.redoStack);
  state.layers = state.layers.filter(l => l !== layer);
  if (state.activeLayer === layer.id) state.activeLayer = others.length && mode !== 'off' ? others[0].id : 0;
  refresh();
  showToast(`Čelo ${faceLabel(layer)} smazáno`);
  return true;
}

function updateBar() {
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
  placeBar();
}

/** Lišta dole na plátně (na mobilu nad kulatými tlačítky). */
function placeBar() {
  if (!bar || bar.style.display === 'none') return;
  const cv = document.getElementById('drawCanvas');
  if (!cv) return;
  const r = cv.getBoundingClientRect();
  const mobile = window.matchMedia('(max-width: 900px)').matches;
  bar.style.left = `${Math.round(r.left + 8)}px`;
  bar.style.maxWidth = `${Math.round(r.width - 16)}px`;
  bar.style.bottom = `${Math.round(window.innerHeight - r.bottom + (mobile ? 72 : 10))}px`;
}

// ── tlačítka ◎ ──────────────────────────────────────────────
const buttons = [];
const TITLES = {
  off: 'Profil — klik: profil + bokorys (pohled na čelo). Do bokorysu se kreslí díry (kružnice) a drážky (úsečky) pro poháněné nástroje; v CAM je načte 🛠 Operace → 📥 Z CAD',
  both: 'Profil + bokorys — klik: jen bokorys',
  solo: 'Jen bokorys — klik: zpět jen profil (kresby čel zůstanou ve vrstvách čel)',
};
const LABELS = { off: '◎ Čelo', both: '◎ Profil + čelo', solo: '◉ Jen čelo' };
function updateButtons() {
  const mode = faceViewMode();
  buttons.forEach(b => {
    b.classList.toggle('active', mode !== 'off');
    b.classList.toggle('solo', mode === 'solo');
    b.setAttribute('aria-pressed', mode !== 'off' ? 'true' : 'false');
    b.title = TITLES[mode];
  });
  const top = document.getElementById('btnFaceView');
  if (top) top.textContent = LABELS[mode];
  const f = document.getElementById('canvasFaceBtn');
  if (f) f.textContent = mode === 'solo' ? '◉' : '◎';
  placeFloating();
  updateBar();
}
// Tři kroky: profil → profil + bokorys → jen bokorys → profil.
function toggle() {
  const mode = faceViewMode();
  if (mode === 'off') enableFaceView();
  else if (mode === 'both') soloFaceView();
  else disableFaceView();
}

const CSS = `
#canvasFaceBtn { display: none; }
#faceBar {
  position: fixed; z-index: 240; display: flex; flex-direction: column; gap: 4px;
  padding: 5px 8px; border-radius: 8px; background: var(--ctp-mantle); color: var(--ctp-text);
  border: 1px solid var(--ctp-surface1); box-shadow: 0 2px 10px rgba(0,0,0,0.35); font-size: 12px;
  box-sizing: border-box; width: 360px;
}
#faceBar .fb-row { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
#faceBar select, #faceBar input[type=text], #faceBar button {
  background: var(--ctp-surface0); color: var(--ctp-text); border: 1px solid var(--ctp-surface1);
  border-radius: 5px; padding: 3px 6px; font-size: 12px; min-width: 0;
}
#faceBar input[type=text] { width: 64px; }
#faceBar button { cursor: pointer; }
#faceBar button:disabled { opacity: 0.4; cursor: default; }
#faceBar label { display: flex; align-items: center; gap: 3px; color: var(--ctp-subtext0); }
#faceBar input[type=range] { width: 100%; accent-color: var(--ctp-peach); }
@media (max-width: 900px) {
  #btnFaceView { display: none; }
  #faceBar { width: auto; }
  body.sidebar-open #faceBar { display: none !important; }
  #canvasFaceBtn {
    display: flex; align-items: center; justify-content: center;
    position: fixed; top: 44px; right: 104px; z-index: 250;
    width: 40px; height: 40px; border: none; border-radius: 50%; padding: 0;
    background: var(--ctp-surface2); color: var(--ctp-text); font-size: 20px; line-height: 40px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4); cursor: pointer;
  }
  #canvasFaceBtn.active { background: var(--ctp-peach); color: var(--ctp-base); }
  #canvasFaceBtn.solo { background: var(--ctp-mauve); color: var(--ctp-base); }
  /* Schránka kalkulačky má s obsahem stejné místo — ◎ pak pod 🔢. */
  #canvasFaceBtn.below-calc { top: 92px; right: 152px; }
  body.sidebar-open #canvasFaceBtn { display: none; }
}
@media (max-width: 900px) and (orientation: landscape) {
  /* Na šířku je řada tlačítek v horní liště: [◎] [Dvojklik] [↩] [↪] [🔢] [🧲] [⊙];
     „right" dopočítá placeFloating() podle skutečné polohy sousedů. */
  #canvasFaceBtn, #canvasFaceBtn.below-calc {
    top: max(5px, env(safe-area-inset-top)); right: calc(232px + env(safe-area-inset-right, 0px));
    width: 32px; height: 26px; line-height: 26px; font-size: 15px; border-radius: 6px; box-shadow: none;
  }
}`;

const LANDSCAPE_MQ = '(max-width: 900px) and (orientation: landscape)';
// Tlačítka horní řady na šířku — ◎ jde vlevo od nejlevějšího viditelného.
const ROW_IDS = ['mobileRectArm', 'mobileUndo', 'mobileRedo', 'canvasClipBtn', 'canvasCalcBtn'];

// Viditelnost plovoucího tlačítka (position: fixed → offsetParent je vždy null).
function shown(e) {
  if (!e || getComputedStyle(e).display === 'none') return null;
  const r = e.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? r : null;
}

function placeFloating() {
  const f = document.getElementById('canvasFaceBtn');
  if (!f) return;
  f.classList.toggle('below-calc', !!shown(document.getElementById('canvasClipBtn')));
  f.style.right = '';
  if (!window.matchMedia(LANDSCAPE_MQ).matches) return;
  let left = Infinity;
  ROW_IDS.forEach(id => {
    const r = shown(document.getElementById(id));
    if (r && r.top < 60) left = Math.min(left, r.left);
  });
  if (Number.isFinite(left)) f.style.right = `${Math.max(0, window.innerWidth - left + 6)}px`;
}

function mount() {
  if (!document.getElementById('face-view-css')) {
    const st = document.createElement('style');
    st.id = 'face-view-css'; st.textContent = CSS;
    document.head.appendChild(st);
  }
  const topbar = document.getElementById('topbar');
  if (topbar && !document.getElementById('btnFaceView')) {
    const b = document.createElement('button');
    b.id = 'btnFaceView'; b.className = 'tool-btn'; b.textContent = '◎ Čelo';
    topbar.insertBefore(b, topbar.querySelector('.toolbar-header'));
    b.addEventListener('click', toggle);
    buttons.push(b);
  }
  if (!document.getElementById('canvasFaceBtn')) {
    const f = document.createElement('button');
    f.id = 'canvasFaceBtn'; f.textContent = '◎'; f.setAttribute('aria-label', 'Bokorys – pohled na čelo');
    const calc = document.getElementById('canvasCalcBtn');
    (calc && calc.parentNode ? calc.parentNode : document.body).insertBefore(f, calc || null);
    f.addEventListener('click', toggle);
    buttons.push(f);
    // Sousední tlačítka se ukazují/schovávají (schránka s obsahem, ↪ jen
    // s historií, Dvojklik jen ve Výběru) — pak ◎ přesunout.
    const mo = new MutationObserver(() => requestAnimationFrame(placeFloating));
    ROW_IDS.forEach(id => {
      const e = document.getElementById(id);
      if (e && e !== f) mo.observe(e, { attributes: true, attributeFilter: ['style', 'class'] });
    });
    window.addEventListener('resize', () => requestAnimationFrame(placeFloating));
  }
  updateButtons();
}

bridge.deleteFace = deleteFace;
mount();
// Řez v nárysu jde chytit myší / prstem a táhnout (faceCutDrag.js).
initCutDrag({ setFaceZ, onDone: () => { updateLayerList(); updateObjectList(); } });
// Načtení projektu, ↩, oko u vrstvy: obnovit tlačítka a lištu; zapnutý
// bokorys přerozmístit (profil se mohl změnit).
onFaceViewChange(on => { updateButtons(); if (on) relayoutIfOn(); });
