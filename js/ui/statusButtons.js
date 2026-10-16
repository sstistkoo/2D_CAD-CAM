// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Přepínače stavového řádku a indikátory nastavení    ║
// ╚══════════════════════════════════════════════════════════════╝

// Vyňato z js/ui.js beze změny (16. 10. 2026, docs/plan-refaktoringu-ui.md,
// Fáze 3): snap k bodům / mřížce / úhlu, režim kót, ABS/INC, R/⌀, typ stroje,
// 🗑 Smazat kóty, Auto-detekce a klikací indikátory (.coord-ind). V ui.js
// byly funkce prokládané kódem při načtení — funkce jsou tu na úrovni modulu
// (deklarace se vyzvednou, pořadí nehraje roli), kód při načtení v PŮVODNÍM
// POŘADÍ v initStatusButtons(), kterou ui.js volá na původním místě. Kód
// aplikace importuje jen z js/ui.js, nikdy z js/ui/* napřímo.

import { COLORS } from '../constants.js';
import { state, showToast, pushUndo } from '../state.js';
import { renderAll } from '../render.js';
import { bridge } from '../bridge.js';
import { showGridSizeDialog, showAngleSnapDialog } from './gridAngleDialogs.js';
import { persistSettings } from '../ui.js';

// ── Snap k bodům tlačítko ──
/** Aktualizuje stav tlačítka snap k bodům. */
export function updateSnapPtsBtn() {
  const btn = document.getElementById("btnSnapPts");
  if (!btn) return;
  const ind = btn.querySelector(".snap-ind");
  ind.className =
    "snap-ind " + (state.snapToPoints ? "snap-on" : "snap-off");
  // Sync mobile snap button
  const mobileSnap = document.getElementById("mobileSnap");
  if (mobileSnap) mobileSnap.classList.toggle("snap-active", state.snapToPoints);
}

// ── Grid Snap tlačítko ──
/** Aktualizuje stav tlačítka snap k mřížce. */
export function updateSnapGridBtn() {
  document.getElementById("btnSnapGrid")?.classList.toggle("active", state.snapToGrid);
}

/** Přepne snap na mřížku ON ↔ OFF (tlačítko i indikátor ve stavovém řádku). */
export function toggleSnapGrid() {
  state.snapToGrid = !state.snapToGrid;
  updateSnapGridBtn();
  bridge.updateCoordBarIndicators?.();
  renderAll();
  showToast(state.snapToGrid ? `Snap na mřížku: ON (${state.gridSize})` : "Snap na mřížku: OFF");
}

// ── Angle Snap tlačítko ──
/** Aktualizuje stav tlačítka úhlového snapu. */
export function updateAngleSnapBtn() {
  document.getElementById("btnAngleSnap")?.classList.toggle("active", state.angleSnap);
}

/** Přepne úhlový snap ON ↔ OFF (tlačítko i indikátor ve stavovém řádku). */
export function toggleAngleSnap() {
  state.angleSnap = !state.angleSnap;
  updateAngleSnapBtn();
  bridge.updateCoordBarIndicators?.();
  renderAll();
  showToast(state.angleSnap ? `Úhlový snap: ON (${state.angleSnapStep}°)` : "Úhlový snap: OFF");
}

// ── Kóty tlačítko (3 stavy: all → intersections → none) ──
/** Aktualizuje stav tlačítka kót. */
export function updateDimsBtn() {
  const btn = document.getElementById("btnDims");
  if (!btn) return;
  btn.textContent = '📐 Kóty';
  btn.classList.remove("active");
  btn.style.background = '';
  btn.style.color = '';
  btn.style.borderColor = '';
  if (state.showDimensions === 'all' || state.showDimensions === 'dimensions') {
    btn.classList.add("active");
  } else if (state.showDimensions === 'intersections') {
    btn.style.background = COLORS.dimension;
    btn.style.color = COLORS.bgDark;
    btn.style.borderColor = COLORS.dimension;
  }
  // 'none' → výchozí neaktivní vzhled
}

/** Posune režim kót na další hodnotu: all → intersections → dimensions → none → all. */
export function cycleDimsMode() {
  const cycle = { all: 'intersections', intersections: 'dimensions', dimensions: 'none', none: 'all' };
  state.showDimensions = cycle[state.showDimensions] || 'all';
  const labels = { all: 'Kóty: vše', intersections: 'Kóty: pouze průsečíky', dimensions: 'Kóty: pouze kóty', none: 'Kóty: skryté' };
  showToast(labels[state.showDimensions]);
  updateDimsBtn();
  bridge.updateCoordBarIndicators?.();
  renderAll();
}

// ── Coord Mode tlačítko (ABS/INC) ──
/** Aktualizuje zobrazení módu souřadnic (ABS/INC). */
export function updateCoordModeBtn() {
  const btn = document.getElementById("btnCoordMode");
  if (btn) {
    const isInc = state.coordMode === 'inc';
    const label = isInc ? 'INC' : 'ABS';
    btn.textContent = label;
    btn.classList.toggle('active', isInc);
    if (isInc) {
      btn.style.background = COLORS.selected;
      btn.style.color = COLORS.bgDark;
    } else {
      btn.style.background = '';
      btn.style.color = '';
    }
  }
  document.querySelectorAll(".ind-coordmode").forEach((ind) => {
    ind.textContent = state.coordMode === 'inc' ? 'INC' : 'ABS';
    ind.classList.toggle('alt', state.coordMode === 'inc');
    ind.title = state.coordMode === 'inc'
      ? 'Souřadnice: INC (inkrementální) – klik přepne na ABS'
      : 'Souřadnice: ABS (absolutní) – klik přepne na INC';
  });
}

/** Přepne mód souřadnic ABS ↔ INC. */
export function toggleCoordMode() {
  state.coordMode = state.coordMode === 'abs' ? 'inc' : 'abs';
  updateCoordModeBtn();
  renderAll();
  if (bridge.updateMobileCoords) bridge.updateMobileCoords(state.mouse.x, state.mouse.y);
  showToast(state.coordMode === 'inc' ? 'Inkrementální souřadnice (INC)' : 'Absolutní souřadnice (ABS)');
}

// ── X Display Mode tlačítko (Poloměr/Průměr) ──
/** Aktualizuje zobrazení režimu osy X (R/⌀). */
export function updateXDisplayBtn() {
  const btn = document.getElementById("btnXDisplay");
  if (btn) {
    const isDiam = state.xDisplayMode === 'diameter';
    btn.textContent = isDiam ? '⌀' : 'R';
    btn.classList.toggle('active', isDiam);
    if (isDiam) {
      btn.style.background = COLORS.delete;
      btn.style.color = COLORS.bgDark;
    } else {
      btn.style.background = '';
      btn.style.color = '';
    }
  }
  document.querySelectorAll(".ind-xdisplay").forEach((ind) => {
    ind.textContent = state.xDisplayMode === 'diameter' ? '⌀' : 'R';
    ind.classList.toggle('alt', state.xDisplayMode === 'diameter');
    ind.title = state.xDisplayMode === 'diameter'
      ? 'Osa X: Průměr (⌀) – klik přepne na Poloměr'
      : 'Osa X: Poloměr (R) – klik přepne na Průměr';
  });
}

/** Přepne režim osy X: Poloměr ↔ Průměr. */
export function toggleXDisplay() {
  state.xDisplayMode = state.xDisplayMode === 'radius' ? 'diameter' : 'radius';
  updateXDisplayBtn();
  renderAll();
  if (bridge.updateMobileCoords) bridge.updateMobileCoords(state.mouse.x, state.mouse.y);
  showToast(state.xDisplayMode === 'diameter' ? 'Osa X: Průměr (⌀)' : 'Osa X: Poloměr (R)');
}

// ── Machine Type tlačítko (Soustruh/Karusel) ──
/** Aktualizuje zobrazení typu stroje. */
export function updateMachineTypeBtn() {
  const btn = document.getElementById("btnMachineType");
  if (btn) {
    const isKarusel = state.machineType === 'karusel';
    btn.textContent = isKarusel ? '⚙ Karusel' : '⚙ Soustruh';
    btn.classList.toggle('active', isKarusel);
    if (isKarusel) {
      btn.style.background = COLORS.dimension;
      btn.style.color = COLORS.bgDark;
    } else {
      btn.style.background = '';
      btn.style.color = '';
    }
  }
  document.querySelectorAll(".ind-machine").forEach((ind) => {
    ind.textContent = state.machineType === 'karusel' ? 'KAR' : 'SOU';
    ind.classList.toggle('alt', state.machineType === 'karusel');
    ind.title = state.machineType === 'karusel'
      ? 'Typ stroje: Karusel – klik přepne na Soustruh'
      : 'Typ stroje: Soustruh – klik přepne na Karusel';
  });
}

/** Přepne typ stroje Soustruh ↔ Karusel (prohodí osy). */
export function toggleMachineType() {
  state.machineType = state.machineType === 'soustruh' ? 'karusel' : 'soustruh';
  updateMachineTypeBtn();
  renderAll();
  if (bridge.updateMobileCoords) bridge.updateMobileCoords(state.mouse.x, state.mouse.y);
  showToast(state.machineType === 'karusel'
    ? 'Karusel – X vodorovně, Z svisle'
    : 'Soustruh – Z vodorovně, X svisle');
}

/** Listenery přepínačů a indikátorů (při načtení — volá js/ui.js na původním místě). */
export function initStatusButtons() {
  const btnSnapPts = document.getElementById("btnSnapPts");
  if (btnSnapPts) {
    btnSnapPts.addEventListener("click", () => {
      state.snapToPoints = !state.snapToPoints;
      updateSnapPtsBtn();
      renderAll();
      showToast(state.snapToPoints ? "Snap k bodům: ON" : "Snap k bodům: OFF");
    });
  }

  document.getElementById("btnSnapGrid")?.addEventListener("click", toggleSnapGrid);

  document.getElementById("btnSnapGrid")?.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showGridSizeDialog();
  });

  document.getElementById("btnAngleSnap")?.addEventListener("click", toggleAngleSnap);

  document.getElementById("btnAngleSnap")?.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showAngleSnapDialog();
  });

  document.getElementById("btnDims")?.addEventListener("click", cycleDimsMode);

  // ── Smazat kóty tlačítko ──
  document.getElementById("btnDeleteDims").addEventListener("click", () => {
    const dimCount = state.objects.filter(o => o.isDimension || o.isCoordLabel).length;
    if (dimCount === 0) {
      showToast("Žádné kóty ke smazání");
      return;
    }
    pushUndo();
    state.objects = state.objects.filter(o => !o.isDimension && !o.isCoordLabel);
    state.selected = null;
    state.multiSelected.clear();
    state.selectedPoint = null;
    showToast(`Smazáno ${dimCount} kót`);
    if (bridge.updateObjectList) bridge.updateObjectList();
    renderAll();
  });

  // ── Auto-detekce R, zkosení, zápichů ──
  document.getElementById("btnAutoDetect")?.addEventListener("click", () => {
    if (bridge.autoDetectFeatures) bridge.autoDetectFeatures();
  });

  document.getElementById("btnCoordMode")?.addEventListener("click", toggleCoordMode);

  document.getElementById("btnXDisplay")?.addEventListener("click", toggleXDisplay);

  document.getElementById("btnMachineType")?.addEventListener("click", toggleMachineType);

  // ── Klikací indikátory nastavení (statusbar na desktopu + mobilní coord bar) ──
  // Indikátory SOU/KAR, ABS/INC, R/⌀, #, ∠ a 📐 ukazují hodnoty z Nastavení.
  // Klik na indikátor přepne na další hodnotu, aby se kvůli přepnutí nemusel
  // otevírat dialog Nastavení. Vypnutý indikátor zůstává viditelný (ztlumený) –
  // jinak by po vypnutí nešlo kliknout zpátky (viz .coord-ind v style.css).
  document.addEventListener("click", (e) => {
    const ind = e.target.closest?.(".coord-ind");
    if (!ind) return;
    e.preventDefault();
    e.stopPropagation();
    const cls = ind.classList;
    if (cls.contains("ind-machine")) toggleMachineType();
    else if (cls.contains("ind-coordmode")) toggleCoordMode();
    else if (cls.contains("ind-xdisplay")) toggleXDisplay();
    else if (cls.contains("ind-grid")) toggleSnapGrid();
    else if (cls.contains("ind-angle")) toggleAngleSnap();
    else if (cls.contains("ind-dims")) cycleDimsMode();
    else return;
    persistSettings();
  });
}
