// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Inicializace aplikace (ES Module entry point)      ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, showToast, updateUndoButtons } from './state.js';
import { resizeCanvases, autoCenterView } from './canvas.js';
import { calculateAllIntersections } from './geometry.js';
import { updateObjectList, updateProperties, resetHint, updateDimsBtn, updateSnapPtsBtn, updateCoordModeBtn, updateMachineTypeBtn, updateXDisplayBtn, updateSnapGridBtn, togglePanel, updateLayerList, updateStatusProject, checkFirstRunHelp, updateAngleSnapBtn, updateNullPointUI, applyTheme } from './ui.js';
import { initAutoSave } from './storage.js';
import { getMeta, setMeta, migrateFromLocalStorage } from './idb.js';
import { bridge } from './bridge.js';

// ── Globální error handlery ──
window.addEventListener('error', (e) => {
  console.error('Neošetřená chyba:', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('Neošetřený promise rejection:', e.reason);
});

// Side-effect imports — tyto moduly registrují event listenery při načtení
import './render.js';
import './objects.js';
import './events.js';
import './touch.js';
import './dialogs.js';

// ── Panel toggle via data-panel attributes ──
document.querySelectorAll('.panel-header[data-panel]').forEach(header => {
  header.addEventListener('click', (e) => {
    if (e.target.closest('.obj-edit-btn, .cnc-copy-btn')) return;
    togglePanel(header.dataset.panel);
  });
  header.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      togglePanel(header.dataset.panel);
    }
  });
});

// ── Auto-load při startu ──
async function tryAutoLoad() {
  try {
    const data = await getMeta('currentProjectData');
    if (data && data.objects && data.objects.length > 0) {
      state.objects = data.objects;
      state.nextId = data.nextId || 1;
      if (data.gridSize && data.gridSize > 0)
        state.gridSize = data.gridSize;
      if (data.coordMode) state.coordMode = data.coordMode;
      if (data.incReference) state.incReference = data.incReference;
      state.nullPointActive = !!data.nullPointActive;
      state.nullPointAngle = data.nullPointAngle || 0;
      if (data.machineType) state.machineType = data.machineType;
      state.xDisplayMode = data.xDisplayMode || 'radius';
      if (data.layers) {
        state.layers = data.layers;
        state.activeLayer = data.activeLayer || 0;
        state.nextLayerId = data.nextLayerId || (data.layers.length > 0 ? Math.max(...data.layers.map(l => l.id)) + 1 : 1);
      } else {
        state.objects.forEach(obj => { if (obj.layer === undefined) obj.layer = 0; });
      }
      state.anchors = data.anchors || [];
      if (data.showObjectNumbers !== undefined) state.showObjectNumbers = data.showObjectNumbers;
      if (data.showIntersectionNumbers !== undefined) state.showIntersectionNumbers = data.showIntersectionNumbers;
      if (data.displayDecimals !== undefined) state.displayDecimals = data.displayDecimals;
      if (data.theme) state.theme = data.theme;
      if (data.snapToGrid !== undefined) state.snapToGrid = data.snapToGrid;
      if (data.angleSnap !== undefined) state.angleSnap = data.angleSnap;
      if (data.angleSnapStep !== undefined) state.angleSnapStep = data.angleSnapStep;
      if (data.showDimensions !== undefined) state.showDimensions = data.showDimensions;
      if (data.snapQuadrants !== undefined) state.snapQuadrants = data.snapQuadrants;
      if (data.snapMidpoints !== undefined) state.snapMidpoints = data.snapMidpoints;
      if (Array.isArray(data.undoStack)) state.undoStack = data.undoStack;
      updateObjectList();
      updateProperties();
      updateLayerList();
      updateUndoButtons();
    }
  } catch (e) {
    console.warn('Auto-load selhal:', e);
  }
}

// ── Auto-save každých 30 s ──
setInterval(() => {
  if (state.objects.length > 0) {
    const data = {
      version: 1.6,
      objects: state.objects,
      intersections: state.intersections,
      nextId: state.nextId,
      gridSize: state.gridSize,
      coordMode: state.coordMode,
      incReference: state.incReference,
      nullPointActive: state.nullPointActive,
      nullPointAngle: state.nullPointAngle,
      machineType: state.machineType,
      xDisplayMode: state.xDisplayMode,
      layers: state.layers,
      activeLayer: state.activeLayer,
      nextLayerId: state.nextLayerId,
      anchors: state.anchors,
      showObjectNumbers: state.showObjectNumbers,
      showIntersectionNumbers: state.showIntersectionNumbers,
      displayDecimals: state.displayDecimals,
      theme: state.theme,
      snapToGrid: state.snapToGrid,
      angleSnap: state.angleSnap,
      angleSnapStep: state.angleSnapStep,
      showDimensions: state.showDimensions,
      snapQuadrants: state.snapQuadrants,
      snapMidpoints: state.snapMidpoints,
      undoStack: state.undoStack,
    };
    setMeta('currentProjectData', data).catch(err => {
      if (err && err.name === 'QuotaExceededError') {
        showToast('Úložiště je plné – auto-save selhal');
      } else {
        console.warn('Auto-save selhal:', err);
      }
    });
  }
}, 30000);

// ── Uložení při zavření okna ──
window.addEventListener('beforeunload', () => {
  if (state.objects.length > 0) {
    const data = {
      version: 1.6,
      objects: state.objects,
      intersections: state.intersections,
      nextId: state.nextId,
      gridSize: state.gridSize,
      coordMode: state.coordMode,
      incReference: state.incReference,
      nullPointActive: state.nullPointActive,
      nullPointAngle: state.nullPointAngle,
      machineType: state.machineType,
      xDisplayMode: state.xDisplayMode,
      layers: state.layers,
      activeLayer: state.activeLayer,
      nextLayerId: state.nextLayerId,
      anchors: state.anchors,
      showObjectNumbers: state.showObjectNumbers,
      showIntersectionNumbers: state.showIntersectionNumbers,
      displayDecimals: state.displayDecimals,
      theme: state.theme,
      snapToGrid: state.snapToGrid,
      angleSnap: state.angleSnap,
      angleSnapStep: state.angleSnapStep,
      showDimensions: state.showDimensions,
      snapQuadrants: state.snapQuadrants,
      snapMidpoints: state.snapMidpoints,
      undoStack: state.undoStack,
    };
    // Synchronní pokus o uložení – navigator.sendBeacon není vhodný pro IDB,
    // ale setMeta spustí IDB transakci, která doběhne i po unload
    setMeta('currentProjectData', data).catch(() => {});
  }
});

// ── Inicializace ──
(async () => {
  await migrateFromLocalStorage();
  await tryAutoLoad();
  // Aplikovat uložený motiv (bez toastu při startu)
  if (state.theme === 'light') {
    document.body.classList.add('light-theme');
    const { applyThemeColors } = await import('./constants.js');
    applyThemeColors('light');
  }
  resizeCanvases();
  if (state.objects.length > 0) {
    calculateAllIntersections();
    // Odložit centrování – počkat na stabilní layout (sidebar, topbar…)
    requestAnimationFrame(() => {
      resizeCanvases();
      autoCenterView();
    });
  }
  resetHint();
  updateDimsBtn();
  updateSnapPtsBtn();
  updateCoordModeBtn();
  updateMachineTypeBtn();
  updateXDisplayBtn();
  updateAngleSnapBtn();
  updateSnapGridBtn();
  updateNullPointUI();
  updateLayerList();
  initAutoSave();
  updateStatusProject();
  if (bridge.updateMobileCoords) bridge.updateMobileCoords(0, 0);
  checkFirstRunHelp();
})().catch(e => {
  console.error('Inicializace selhala:', e);
});

// ── Záloha: po úplném načtení stránky znovu vycentrovat ──
window.addEventListener('load', () => {
  resizeCanvases();
  if (state.objects.length > 0) {
    autoCenterView();
  }
});

// ── PWA Service Worker ──
if ("serviceWorker" in navigator) {
  const isDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (isDev) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(r => r.unregister());
    });
    caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
  } else {
    navigator.serviceWorker
      .register("./sw.js", { updateViaCache: 'none' })
      .then((reg) => {
        console.log("SW: Registrován");
        setInterval(() => reg.update(), 60000);
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('SW: Nová verze nainstalována');
            }
          });
        });
      })
      .catch((e) => console.warn("SW: Chyba", e));

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      showToast('Aktualizace... stránka se obnoví', 1500);
      setTimeout(() => location.reload(), 1500);
    });
  }
}

// ── Delegovaný close handler pro overlay dialogy ──
// Nahrazuje inline onclick="this.closest('.input-overlay').remove()"
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-cancel-overlay');
  if (btn) {
    const overlay = btn.closest('.input-overlay');
    if (overlay) overlay.remove();
  }
});

console.log(
  "%c SKICA – CAD pro CNC soustružník v1.6 (X,Z) ",
  "background:#89b4fa;color:#1e1e2e;font-size:18px;font-weight:bold;padding:4px 12px;border-radius:4px;",
);
console.log(
  "Klávesové zkratky: V=Výběr, W=Přesun, P=Bod, L=Úsečka, K=Konstr., C=Kružnice, A=Oblouk, R=Obdélník, M=Měření, S=Snap, D=Kóty, N=Čísla, Shift+N=Polární, I=ABS/INC, X=Oříz, E=Prodl., F=Zaoblení, J=Kolmice, H=Rovnob., U=Kóta, Ctrl+Z=Zpět, Ctrl+Y=Vpřed, Ctrl+S=Uložit, Del=Smazat",
);
