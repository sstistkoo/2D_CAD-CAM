// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – CAM Simulátor (soustružení)                      ║
// ║  Konverze SimDraha.html → vanilla JS ES module            ║
// ╚══════════════════════════════════════════════════════════════╝

import { makeOverlay } from '../dialogFactory.js';
import { openCamEditor } from './camEditor.js';
import { state, pushUndo, showToast, STOCK_LAYER_ID } from '../state.js';
import { renderAll } from '../render.js';
import { autoCenterView, centerViewOn, resizeCanvases } from '../canvas.js';
import { calculateAllIntersections } from '../geometry.js';
import { updateObjectList, updateLayerList, persistSettings, setCalcClipboardValue, getCalcClipboardValue, setTool } from '../ui.js';
import { bridge } from '../bridge.js';
import { bulgeToArc } from '../utils.js';
import { showToolLibraryDialog } from '../toolLibrary.js';
import { openInsertCalc } from './insert.js';
import { getEffectivePlungeAngle, isAngleBetween, intersectVerticalLineSegment, intersectVerticalLineArc, samplePartingEnvelope, fitArcsToPolyline } from './cam/camMath.js';
import { ROUGHING_STRATEGIES } from './cam/roughingStrategies.js';
import { mCoarse, mFine, gThreads, trThreads, uncThreads, unfThreads, bswThreads, nptThreads, acmeThreads, bsptThreads } from './threadData.js';

// ── Custom confirm dialog ──────────────────────────────────────
function camConfirm(message) {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'cam-confirm-overlay';
    ov.innerHTML = `
      <div class="cam-confirm-box">
        <div class="cam-confirm-msg">${message}</div>
        <div class="cam-confirm-btns">
          <button class="cam-confirm-ok">OK</button>
          <button class="cam-confirm-cancel">Zrušit</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const cleanup = (val) => { ov.remove(); resolve(val); };
    ov.querySelector('.cam-confirm-ok').addEventListener('click', () => cleanup(true));
    ov.querySelector('.cam-confirm-cancel').addEventListener('click', () => cleanup(false));
    ov.addEventListener('click', e => { if (e.target === ov) cleanup(false); });
    ov.querySelector('.cam-confirm-ok').focus();
  });
}

function camCloseConfirm() {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'cam-confirm-overlay';
    ov.innerHTML = `
      <div class="cam-confirm-box">
        <div class="cam-confirm-msg"><strong>Neuložené změny v CAM</strong><br><br>Přenést konturu a dráhy do výkresu, nebo zahodit změny?</div>
        <div class="cam-confirm-btns">
          <button class="cam-confirm-cancel" data-r="discard">Zahodit změny</button>
          <button class="cam-confirm-ok" data-r="save">📐 Zachovat a přenést</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const cleanup = (val) => { ov.remove(); resolve(val); };
    ov.querySelector('[data-r="discard"]').addEventListener('click', () => cleanup('discard'));
    ov.querySelector('[data-r="save"]').addEventListener('click', () => cleanup('save'));
    ov.addEventListener('click', e => { if (e.target === ov) cleanup(null); });
    ov.querySelector('[data-r="save"]').focus();
  });
}

// ── Offset dialog ──────────────────────────────────────────────
function camOffsetDialog(count) {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'cam-confirm-overlay';
    ov.innerHTML = `
      <div class="cam-confirm-box">
        <div class="cam-confirm-msg" style="font-weight:bold;margin-bottom:12px">Posunout ${count} vybraných bodů</div>
        <div style="display:flex;gap:10px;margin-bottom:14px">
          <label style="flex:1;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">
            ΔX<input id="cam-off-x" type="number" value="0" step="0.1"
              style="background:#1e1e2e;border:1px solid #45475a;color:#cdd6f4;border-radius:4px;padding:6px;font-size:14px;width:100%;box-sizing:border-box">
          </label>
          <label style="flex:1;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">
            ΔZ<input id="cam-off-z" type="number" value="0" step="0.1"
              style="background:#1e1e2e;border:1px solid #45475a;color:#cdd6f4;border-radius:4px;padding:6px;font-size:14px;width:100%;box-sizing:border-box">
          </label>
        </div>
        <div class="cam-confirm-btns">
          <button class="cam-confirm-ok">Posunout</button>
          <button class="cam-confirm-cancel">Zrušit</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const cleanup = (val) => { ov.remove(); resolve(val); };
    const doConfirm = () => {
      const dx = parseFloat(ov.querySelector('#cam-off-x').value) || 0;
      const dz = parseFloat(ov.querySelector('#cam-off-z').value) || 0;
      cleanup({ dx, dz });
    };
    ov.querySelector('.cam-confirm-ok').addEventListener('click', doConfirm);
    ov.querySelector('.cam-confirm-cancel').addEventListener('click', () => cleanup(null));
    ov.addEventListener('click', e => { if (e.target === ov) cleanup(null); });
    ov.addEventListener('keydown', e => {
      if (e.key === 'Enter') doConfirm();
      else if (e.key === 'Escape') cleanup(null);
    });
    ov.querySelector('#cam-off-x').focus();
  });
}

// ── Add-move dialog (úprava drah: + → nový pohyb) ──────────────
function camAddMoveDialog(def) {
  return new Promise(resolve => {
    const d = def || {};
    const inp = 'background:#1e1e2e;border:1px solid #45475a;color:#cdd6f4;border-radius:4px;padding:6px;font-size:14px;width:100%;box-sizing:border-box';
    const lab = 'flex:1;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8';
    const ov = document.createElement('div');
    ov.className = 'cam-confirm-overlay';
    ov.innerHTML = `
      <div class="cam-confirm-box">
        <div class="cam-confirm-msg" style="font-weight:bold;margin-bottom:12px">Přidat pohyb za řádek ${d.afterLabel || ''}</div>
        <label style="${lab};margin-bottom:10px">Typ pohybu
          <select id="cam-mv-type" style="${inp}">
            <option value="G0">G0 — rychloposuv</option>
            <option value="G1" selected>G1 — posuv (řez)</option>
            <option value="G2">G2 — oblouk CW</option>
            <option value="G3">G3 — oblouk CCW</option>
          </select>
        </label>
        <div style="display:flex;gap:10px;margin-bottom:10px">
          <label style="${lab}">X${d.mode === 'DIAMON' ? ' (⌀)' : ''}<input id="cam-mv-x" type="number" step="0.1" value="${d.x != null ? d.x : 0}" style="${inp}"></label>
          <label style="${lab}">Z<input id="cam-mv-z" type="number" step="0.1" value="${d.z != null ? d.z : 0}" style="${inp}"></label>
          <label style="${lab};display:none" id="cam-mv-cr-wrap">CR<input id="cam-mv-cr" type="number" step="0.1" value="${d.cr != null ? d.cr : 0}" style="${inp}"></label>
        </div>
        <div class="cam-confirm-btns">
          <button class="cam-confirm-ok">Přidat</button>
          <button class="cam-confirm-cancel">Zrušit</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const typeSel = ov.querySelector('#cam-mv-type');
    const crWrap = ov.querySelector('#cam-mv-cr-wrap');
    const syncCr = () => { crWrap.style.display = (typeSel.value === 'G2' || typeSel.value === 'G3') ? 'flex' : 'none'; };
    typeSel.addEventListener('change', syncCr); syncCr();
    const cleanup = (val) => { ov.remove(); resolve(val); };
    const doConfirm = () => {
      const type = typeSel.value;
      cleanup({
        type,
        x: parseFloat(ov.querySelector('#cam-mv-x').value) || 0,
        z: parseFloat(ov.querySelector('#cam-mv-z').value) || 0,
        cr: (type === 'G2' || type === 'G3') ? (parseFloat(ov.querySelector('#cam-mv-cr').value) || 0) : 0,
      });
    };
    ov.querySelector('.cam-confirm-ok').addEventListener('click', doConfirm);
    ov.querySelector('.cam-confirm-cancel').addEventListener('click', () => cleanup(null));
    ov.addEventListener('click', e => { if (e.target === ov) cleanup(null); });
    ov.addEventListener('keydown', e => { if (e.key === 'Enter') doConfirm(); else if (e.key === 'Escape') cleanup(null); });
    ov.querySelector('#cam-mv-x').focus();
  });
}

// ── CSS injection ──────────────────────────────────────────────
let cssInjected = false;
function injectCSS() {
  if (cssInjected) return;
  cssInjected = true;
  const style = document.createElement('style');
  style.textContent = `
.cam-confirm-overlay {
  position: fixed; inset: 0; z-index: 100000;
  background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center;
}
.cam-confirm-box {
  background: #1e1e2e; border: 1px solid #45475a; border-radius: 10px;
  padding: 24px 28px 18px; min-width: 320px; max-width: 90vw;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5); color: #cdd6f4; font-family: system-ui, sans-serif;
}
.cam-confirm-msg { font-size: 14px; margin-bottom: 18px; line-height: 1.5; }
.cam-confirm-btns { display: flex; gap: 10px; justify-content: flex-end; }
.cam-confirm-btns button {
  padding: 7px 22px; border-radius: 6px; font-size: 13px; font-weight: 600;
  cursor: pointer; border: none;
}
.cam-confirm-ok { background: #89b4fa; color: #1e1e2e; }
.cam-confirm-ok:hover { background: #74a8f7; }
.cam-confirm-cancel { background: #45475a; color: #cdd6f4; }
.cam-confirm-cancel:hover { background: #585b70; }
.cam-sim-window {
  width: 100vw !important; max-width: 100vw !important;
  height: 100dvh !important; max-height: 100dvh !important;
  display: flex; flex-direction: column;
  border-radius: 0 !important;
  animation: none !important;
  transform: none !important;
}
.calc-overlay[data-type="cam-simulator"] {
  align-items: stretch !important;
  justify-content: stretch !important;
  padding: 0 !important;
}
.cam-sim-window .calc-titlebar { border-radius: 0 !important; position: relative; }
.cam-sim-calc-btn {
  background: none; border: none; color: #cdd6f4; font-size: 18px;
  cursor: pointer; padding: 2px 8px; margin-right: 4px; line-height: 1;
  border-radius: 4px;
}
.cam-sim-calc-btn:hover { background: rgba(255,255,255,0.15); }
.cam-sim-calc-btn:disabled { opacity: .35; cursor: default; }
.cam-sim-calc-btn:disabled:hover { background: none; }
.cam-sim-window .calc-body {
  flex: 1; overflow: hidden; padding: 0 !important;
}
.cam-sim-root {
  display: flex; height: 100%; color: #cdd6f4; font-family: system-ui, sans-serif; font-size: 13px;
  position: relative; overflow: hidden;
}
.cam-sim-canvas-area {
  flex: 1; min-width: 0; display: flex; flex-direction: column; position: relative; background: #1e1e2e;
}
.cam-sim-canvas-wrap {
  flex: 1; overflow: hidden; cursor: crosshair; touch-action: none; position: relative;
}
.cam-sim-canvas-wrap canvas { display: block; }
.cam-sim-time-overlay {
  position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%);
  background: rgba(17,17,27,0.75); color: #6c7086; font-size: 11px; font-family: monospace;
  padding: 2px 10px; border-radius: 4px; pointer-events: none; white-space: nowrap; z-index: 2;
}
.cam-sim-trace-confirm, .cam-sim-trace-cancel {
  display: none; position: absolute; bottom: 10px; z-index: 3;
  padding: 10px 16px; border: none; border-radius: 6px; font-size: 14px; font-weight: bold;
  white-space: nowrap;
}
.cam-sim-trace-confirm { right: 10px; background: #a6e3a1; color: #1e1e2e; }
.cam-sim-trace-cancel { right: 130px; background: #f38ba8; color: #1e1e2e; }
.cam-sim-trace-confirm:active { background: #94d8a0; }
.cam-sim-trace-cancel:active { background: #e07090; }
.cam-sim-code-bar button[data-code="show-sidebar"] {
  background: #cba6f7; color: #1e1e2e; border-color: #cba6f7;
}
.cam-sim-toolbar {
  position: absolute; top: 8px; right: 8px; z-index: 5;
  display: flex; gap: 6px; flex-wrap: wrap;
}
.cam-sim-toolbar button {
  background: #313244; border: 1px solid #45475a; color: #cdd6f4;
  border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 16px;
  line-height: 1;
}
.cam-sim-toolbar button:hover { background: #45475a; }
.cam-sim-toolbar button.cam-sim-active { background: #89b4fa; color: #1e1e2e; }
.cam-sim-speed-group {
  display: flex; align-items: center; gap: 4px;
  background: #313244; border: 1px solid #45475a; border-radius: 6px;
  padding: 2px 6px; font-size: 11px; color: #6c7086;
}
.cam-sim-speed-group button {
  background: none; border: none; color: #6c7086; cursor: pointer;
  font-size: 13px; padding: 0 2px; line-height: 1;
}
.cam-sim-speed-group button:hover { color: #cdd6f4; }
.cam-sim-speed-label {
  min-width: 38px; text-align: center; font-family: monospace;
  font-weight: bold; color: #a6e3a1; font-size: 11px;
}
.cam-sim-progress-bar {
  height: 20px; display: flex; align-items: center; gap: 6px;
  padding: 0 8px; background: #181825; border-top: 1px solid #45475a;
  cursor: pointer; user-select: none;
}
.cam-sim-progress-track {
  flex: 1; height: 6px; background: #313244; border-radius: 3px;
  position: relative; overflow: hidden;
}
.cam-sim-progress-fill {
  height: 100%; background: #89b4fa; border-radius: 3px;
  width: 0%; transition: width 0.05s linear;
}
.cam-sim-progress-bar span {
  font-size: 10px; font-family: monospace; color: #6c7086; min-width: 32px;
  text-align: right;
}
.cam-sim-player-bar {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 4px 8px; background: #181825; border-top: 1px solid #45475a;
  position: relative;
}
.cam-sim-code-toggle {
  position: absolute; left: 8px;
  background: #313244; border: 1px solid #45475a; color: #cdd6f4;
  border-radius: 6px; padding: 3px 10px; cursor: pointer; font-size: 13px; line-height: 1;
}
.cam-sim-code-toggle:hover { background: #45475a; }
.cam-sim-code-toggle.cam-sim-active { background: #89b4fa; color: #1e1e2e; border-color: #89b4fa; }
.cam-sim-player-bar button {
  background: #313244; border: 1px solid #45475a; color: #cdd6f4;
  border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 16px;
  line-height: 1;
}
.cam-sim-player-bar button:hover { background: #45475a; }
.cam-sim-player-bar button.cam-sim-active { background: #89b4fa; color: #1e1e2e; }
.cam-sim-player-bar button[data-act="play"] { min-width: 44px; }
.cam-sim-code-area {
  height: 180px; border-top: 1px solid #45475a; display: flex; flex-direction: column;
  background: #11111b;
}
.cam-sim-code-bar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 2px 8px; border-bottom: 1px solid #45475a; background: #181825;
  font-size: 11px; flex-wrap: wrap; gap: 4px;
}
.cam-sim-code-bar span { color: #6c7086; }
.cam-sim-code-bar .cam-sim-code-btns { display: flex; gap: 4px; }
.cam-sim-code-bar button {
  background: #313244; border: 1px solid #45475a; color: #cdd6f4;
  border-radius: 4px; padding: 2px 8px; cursor: pointer; font-size: 11px;
}
.cam-sim-code-bar button:hover { background: #45475a; }
.cam-sim-code-bar button.cam-sim-active { background: #89b4fa; color: #1e1e2e; }
.cam-sim-code-bar button[data-code="editor"] { background: #a6e3a1; color: #1e1e2e; border-color: #a6e3a1; }
.cam-sim-code-wrap {
  flex: 1; position: relative; overflow: hidden;
}
.cam-sim-code-backdrop, .cam-sim-manual-ta {
  position: absolute; inset: 0; margin: 0; box-sizing: border-box;
  width: 100%; height: 100%; padding: 6px;
  font-family: monospace; font-size: 11px; line-height: 1.5;
  white-space: pre; overflow: auto;
}
.cam-sim-code-backdrop {
  pointer-events: none; color: transparent;
}
.cam-sim-code-backdrop::-webkit-scrollbar { width: 0; height: 0; }
.cam-sim-code-bd-line { white-space: pre; }
.cam-sim-code-bd-line.cam-sim-code-active {
  background: rgba(137,180,250,0.2); border-left: 3px solid #89b4fa; margin-left: -3px; padding-left: 3px;
}
.cam-sim-manual-ta {
  resize: none; border: none; outline: none;
  background: transparent; color: #a6e3a1;
}
.cam-sim-manual-ta::-webkit-scrollbar { width: 6px; }
.cam-sim-manual-ta::-webkit-scrollbar-thumb { background: #45475a; border-radius: 3px; }
.cam-sim-window .calc-titlebar { display: none !important; }
.cam-sim-toolbar button:disabled { opacity: .35; cursor: default; }
.cam-sim-toolbar button:disabled:hover { background: #313244; }
.cam-sim-toolbar-sep {
  width: 1px; background: #45475a; align-self: stretch; margin: 2px 0;
}
.cam-sim-sidebar {
  width: 320px; flex-shrink: 0; overflow: hidden; border-left: 1px solid #45475a;
  background: #181825; display: flex; flex-direction: column;
}
.cam-sim-sidebar.cam-sim-sidebar-overlay {
  position: absolute; top: 0; right: 0; bottom: 0; z-index: 10;
  box-shadow: -4px 0 16px rgba(0,0,0,0.5); width: 100%; max-width: 360px;
}

.cam-sim-sidebar::-webkit-scrollbar { width: 6px; }
.cam-sim-sidebar::-webkit-scrollbar-thumb { background: #45475a; border-radius: 3px; }
.cam-sim-header {
  padding: 8px 12px; border-bottom: 1px solid #45475a; background: #11111b;
  display: flex; justify-content: space-between; align-items: center;
}
.cam-sim-header h2 { margin: 0; font-size: 14px; color: #89b4fa; }
.cam-sim-header .cam-sim-undo-btns { display: flex; gap: 4px; }
.cam-sim-header button {
  background: none; border: none; color: #6c7086; cursor: pointer; font-size: 16px; padding: 2px;
}
.cam-sim-header button:hover { color: #cdd6f4; }
.cam-sim-header button:disabled { opacity: 0.3; cursor: default; }
.cam-sim-tabs {
  display: flex; border-bottom: 1px solid #45475a;
}
.cam-sim-tabs button {
  flex: 1; padding: 8px 4px; font-size: 12px; font-weight: 600;
  background: none; border: none; color: #6c7086; cursor: pointer;
  border-bottom: 2px solid transparent;
}
.cam-sim-tabs button:hover { color: #cdd6f4; }
.cam-sim-tabs button.cam-sim-active {
  color: #89b4fa; border-bottom-color: #89b4fa;
}
.cam-sim-tab-body { flex: 1; overflow-y: auto; padding: 10px; min-height: 0; -webkit-overflow-scrolling: touch; }
.cam-sim-tab-body::-webkit-scrollbar { width: 6px; }
.cam-sim-tab-body::-webkit-scrollbar-thumb { background: #45475a; border-radius: 3px; }
.cam-sim-section-title {
  font-weight: bold; font-size: 12px; color: #a6adc8;
  border-bottom: 1px solid #45475a; padding-bottom: 4px; margin: 12px 0 6px 0;
}
.cam-sim-section-title:first-child { margin-top: 0; }
.cam-sim-row { display: flex; gap: 6px; margin-bottom: 6px; position: relative; }
.cam-sim-field { display: flex; flex-direction: column; flex: 1; }
.cam-sim-field label { font-size: 10px; color: #6c7086; margin-bottom: 2px; }
.cam-sim-field label[data-tooltip] { cursor: help; border-bottom: 1px dotted #6c7086; width: fit-content; }
.cam-sim-field label[data-tooltip]:hover::after {
  content: attr(data-tooltip);
  position: absolute; left: 0; right: 0; top: 100%; z-index: 200; margin-top: 2px;
  background: #313244; border: 1px solid #45475a; color: #a6adc8;
  font-size: 10px; font-weight: 400; padding: 5px 7px; border-radius: 4px;
  line-height: 1.5; pointer-events: none; box-shadow: 0 2px 8px rgba(0,0,0,0.5);
}
.cam-sim-field input, .cam-sim-field select {
  background: #1e1e2e; border: 1px solid #45475a; color: #cdd6f4;
  border-radius: 4px; padding: 4px 6px; font-size: 12px; width: 100%; box-sizing: border-box;
}
.cam-sim-field input:focus, .cam-sim-field select:focus {
  outline: none; border-color: #89b4fa;
}
.cam-sim-btn {
  display: flex; align-items: center; justify-content: center; gap: 4px;
  padding: 6px 10px; border-radius: 4px; font-size: 12px; font-weight: 600;
  border: none; cursor: pointer; width: 100%; box-sizing: border-box;
}
.cam-sim-btn:hover { filter: brightness(1.15); }
.cam-sim-btn-blue { background: #89b4fa; color: #1e1e2e; }
.cam-sim-btn-green { background: #a6e3a1; color: #1e1e2e; }
.cam-sim-btn-purple { background: #cba6f7; color: #1e1e2e; }
.cam-sim-btn-red { background: #f38ba8; color: #1e1e2e; }
.cam-sim-btn-gray { background: #45475a; color: #cdd6f4; }
.cam-sim-btn-indigo { background: #89b4fa; color: #1e1e2e; }
.cam-sim-btn-half { width: auto; flex: 1; }
.cam-sim-toggle-row {
  display: flex; gap: 4px; margin-bottom: 6px;
}
.cam-sim-toggle-row button {
  flex: 1; padding: 5px 4px; font-size: 11px; font-weight: 600;
  background: #313244; border: 1px solid #45475a; color: #6c7086;
  border-radius: 4px; cursor: pointer;
}
.cam-sim-toggle-row button:hover { color: #cdd6f4; }
.cam-sim-toggle-row button.cam-sim-active {
  background: #89b4fa; color: #1e1e2e; border-color: #89b4fa;
}
.cam-sim-machine-toggle {
  display: flex; align-items: center; justify-content: space-between;
  background: #313244; border: 1px solid #45475a; color: #cdd6f4;
  border-radius: 6px; padding: 6px 10px; cursor: pointer;
  font-size: 11px; font-weight: 600; width: 100%; box-sizing: border-box;
  margin-bottom: 4px; text-align: left; gap: 6px;
}
.cam-sim-machine-toggle:hover { background: #45475a; }
.cam-sim-machine-summary { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; flex: 1; }
.cam-sim-machine-chip {
  background: rgba(137,180,250,0.12); border: 1px solid rgba(137,180,250,0.35); color: #89b4fa;
  border-radius: 3px; padding: 1px 5px; font-size: 10px; font-weight: 600;
}
.cam-sim-machine-chevron { color: #6c7086; font-size: 10px; flex-shrink: 0; }
.cam-sim-machine-body.cam-sim-collapsed { display: none; }
.cam-sim-errors {
  background: rgba(243,139,168,0.15); border-left: 3px solid #f38ba8;
  font-size: 11px; color: #f38ba8;
}
.cam-sim-errors-toggle {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; padding: 6px 8px; background: none; border: none;
  color: #f38ba8; font-size: 11px; font-weight: 700; cursor: pointer;
  text-align: left; gap: 6px; box-sizing: border-box;
}
.cam-sim-errors-toggle:hover { background: rgba(243,139,168,0.08); }
.cam-sim-errors-toggle .cam-sim-err-chevron { font-size: 10px; opacity: 0.7; flex-shrink: 0; }
.cam-sim-errors-body { padding: 0 8px 6px 8px; }
.cam-sim-errors-body.cam-sim-collapsed { display: none; }
.cam-sim-errors ul { margin: 2px 0 0 16px; padding: 0; }
.cam-sim-point-row {
  display: flex; flex-wrap: wrap; gap: 4px; align-items: center;
  padding: 6px; border-radius: 4px; background: #1e1e2e; border: 1px solid #45475a;
  margin-bottom: 4px; border-left: 3px solid #89b4fa;
}
.cam-sim-point-row.cam-sim-stock { border-left-color: #a6e3a1; }
.cam-sim-point-row .cam-sim-pt-num {
  width: 18px; font-family: monospace; font-size: 11px; color: #6c7086; font-weight: bold;
}
.cam-sim-point-row select {
  width: 48px; background: #11111b; border: 1px solid #45475a; color: #cdd6f4;
  border-radius: 3px; font-size: 11px; padding: 2px;
}
.cam-sim-point-row input {
  width: 56px; background: #11111b; border: 1px solid #45475a; color: #cdd6f4;
  border-radius: 3px; font-size: 11px; padding: 3px 4px; box-sizing: border-box;
}
.cam-sim-point-row input[type=number]::-webkit-inner-spin-button,
.cam-sim-point-row input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.cam-sim-point-row input[type=number] { -moz-appearance: textfield; appearance: textfield; }
.cam-sim-point-row input:focus, .cam-sim-point-row select:focus {
  outline: none; border-color: #89b4fa;
}
.cam-sim-point-row .cam-sim-mode-btn {
  width: 32px; height: 22px; font-size: 9px; font-weight: bold;
  background: #313244; border: 1px solid #45475a; color: #6c7086;
  border-radius: 3px; cursor: pointer; text-align: center;
}
.cam-sim-point-row .cam-sim-mode-btn.cam-sim-inc {
  background: rgba(203,166,247,0.2); color: #cba6f7; border-color: #cba6f7;
}
.cam-sim-point-row .cam-sim-pt-actions {
  margin-left: auto; display: flex; gap: 2px;
}
.cam-sim-point-row .cam-sim-pt-actions button {
  background: none; border: none; cursor: pointer; font-size: 13px; padding: 1px 3px;
  color: #6c7086;
}
.cam-sim-point-row .cam-sim-pt-actions button:hover { color: #cdd6f4; }
.cam-sim-point-header {
  display: flex; gap: 2px; padding: 0 6px; font-size: 10px; font-weight: bold;
  color: #6c7086; margin-bottom: 4px;
}
.cam-sim-checkbox-row {
  display: flex; align-items: center; gap: 8px; padding: 6px 0;
  border-top: 1px solid #45475a; margin-top: 8px;
  position: relative; cursor: default;
}
.cam-sim-checkbox-row input[type="checkbox"] {
  width: 16px; height: 16px; accent-color: #89b4fa;
}
.cam-sim-checkbox-row span { font-size: 12px; font-weight: 600; }
.cam-sim-checkbox-row small { display: block; font-size: 10px; color: #6c7086; padding-left: 24px; }
.cam-sim-checkbox-row[data-tooltip]:hover::after {
  content: attr(data-tooltip);
  position: absolute; left: 0; right: 0; top: calc(100% + 2px); z-index: 200;
  background: #313244; border: 1px solid #45475a; color: #a6adc8;
  font-size: 10px; font-weight: 400; padding: 5px 7px; border-radius: 4px;
  line-height: 1.5; pointer-events: none; box-shadow: 0 2px 8px rgba(0,0,0,0.5);
}
.cam-sim-checkbox-item { display: inline-flex; align-items: center; gap: 6px; position: relative; cursor: default; }
.cam-sim-checkbox-item input[type="checkbox"] { width: 16px; height: 16px; accent-color: #89b4fa; }
.cam-sim-checkbox-item span { font-size: 12px; font-weight: 600; }
.cam-sim-checkbox-item[data-tooltip]:hover::after {
  content: attr(data-tooltip);
  position: absolute; left: 0; top: calc(100% + 6px); z-index: 200;
  background: #313244; border: 1px solid #45475a; color: #a6adc8;
  font-size: 10px; font-weight: 400; padding: 5px 7px; border-radius: 4px;
  line-height: 1.5; pointer-events: none; box-shadow: 0 2px 8px rgba(0,0,0,0.5);
  width: 220px; white-space: normal;
}
.cam-sim-mat-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 6px;
}
.cam-sim-mat-grid button {
  font-size: 10px; padding: 4px 6px; background: #313244; border: 1px solid #45475a;
  color: #a6adc8; border-radius: 3px; cursor: pointer;
}
.cam-sim-mat-grid button:hover { background: #45475a; color: #cdd6f4; }
.cam-sim-mat-grid button.cam-sim-active { background: #89b4fa; color: #1e1e2e; border-color: #89b4fa; }
.cam-sim-import-ta {
  width: 100%; min-height: 120px; padding: 6px; font-family: monospace; font-size: 11px;
  resize: vertical; background: #1e1e2e; border: 1px solid #45475a; color: #cdd6f4;
  border-radius: 4px; box-sizing: border-box;
}
.cam-sim-info-box {
  padding: 6px 8px; background: #1e1e2e; border: 1px solid #45475a; border-radius: 4px;
  font-size: 11px; color: #6c7086; font-style: italic;
}
.cam-sim-tool-shape-row { display: flex; gap: 4px; margin-bottom: 6px; }
.cam-sim-mag-slot [data-act="mag-toggle"]:hover { background: rgba(137,180,250,0.06); }
.cam-sim-tool-shape-row button {
  flex: 1; padding: 5px; background: #313244; border: 1px solid #45475a;
  color: #6c7086; border-radius: 4px; cursor: pointer; font-size: 14px;
}
.cam-sim-tool-shape-row button.cam-sim-active {
  background: #89b4fa; color: #1e1e2e; border-color: #89b4fa;
}
@media (max-width: 768px) {
  .calc-overlay:has(.cam-sim-window) {
    padding-top: 0 !important;
    align-items: flex-start !important;
  }
  .cam-sim-window {
    height: 100dvh !important;
    max-height: 100dvh !important;
    margin-top: 0;
  }
  .cam-sim-tab-body { padding-bottom: 80px; }
  .cam-sim-code-area { min-height: 160px; max-height: 200px; }
  .cam-sim-player-bar { gap: 3px; padding: 4px 4px; }
  .cam-sim-player-bar button {
    padding: 4px 6px; font-size: 13px; min-width: 0;
  }
  .cam-sim-player-bar button[data-act="play"] { min-width: 30px; }
  .cam-sim-speed-group { padding: 2px 4px; gap: 2px; }
  .cam-sim-speed-label { min-width: 26px; font-size: 10px; }
  .cam-sim-code-bar > span { display: none; }
}
`;
  document.head.appendChild(style);
}

// ── MATERIALS constant ─────────────────────────────────────────
const MATERIALS = {
  'Ocel 11 373 (S235)':   { speed: 200, feed: 0.25, depth: 2.5, name: "Ocel (Měkká)" },
  'Ocel 14 220 (Cement)': { speed: 160, feed: 0.2,  depth: 1.5, name: "Ocel (Tvrdší)" },
  'Nerez 17 240 (304)':   { speed: 120, feed: 0.15, depth: 1.0, name: "Nerez" },
  'Hliník (AlSi)':        { speed: 400, feed: 0.35, depth: 4.0, name: "Hliník" },
  'Mosaz':                { speed: 300, feed: 0.2,  depth: 2.5, name: "Mosaz" },
  'Plast (POM)':          { speed: 500, feed: 0.4,  depth: 5.0, name: "Plast" }
};

// Verze logiky generování drah. ZVYŠ při každé změně, která mění vygenerovaný
// G-kód (hrubování/dokončování/hlídání/…). Uložený manualGCode s jinou verzí se
// při otevření CAM zahodí a dráhy se přegenerují automaticky — jinak by uživatel
// viděl staré cachované dráhy z localStorage/projektu (manualGCode se jinak
// nepřepočítává, dokud není prázdný nebo se neklikne „🔄 Dráhy"). Ruční úpravy
// G-kódu ve STEJNÉ verzi zůstávají zachované.
const PATH_LOGIC_VERSION = 3;

// ── MATH HELPERS ───────────────────────────────────────────────
const EPSILON = 1e-9;
const TRIM_TOL = 0.5;
function arcSteps(r, scale) {
  const rPix = Math.abs(r) * scale;
  if (!(rPix > 0.5)) return 8;
  const dTheta = 2 * Math.sqrt((2 * 0.4) / rPix);
  return Math.max(8, Math.min(720, Math.ceil((2 * Math.PI) / dTheta)));
}

function dist(p1, p2) {
  if (!p1 || !p2) return 0;
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.z - p1.z, 2));
}
function getNormal(p1, p2) {
  if (!p1 || !p2) return { x: 0, z: 0 };
  const dx = p2.x - p1.x, dz = p2.z - p1.z, l = Math.sqrt(dx * dx + dz * dz);
  if (l === 0 || isNaN(l)) return { x: 0, z: 0 };
  return { x: -dz / l, z: dx / l };
}
// Úhel směrového vektoru (x,z) ve stejné konvenci jako úhly oblouků (atan2(x,z)).
function vecAngle(x, z) { return Math.atan2(x, z); }
// Normalizace úhlu do rozsahu (-PI, PI>.
function normalizeAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
// Úhlový rozsah normál kontury, který destička daného tvaru pokryje bez
// záběru bočním ostřím (vrcholový úhel ε omezuje, jak moc se může povrch
// odklánět od osy destičky). Pro kulatou destičku (toolShape !== 'polygon')
// omezení neplatí.
function getToolClearanceRange(prms, flipX) {
  if (prms.toolShape !== 'polygon') return null;
  const toolAngleRad = (parseFloat(prms.toolAngle) || 0) * Math.PI / 180;
  const tipRad = (parseFloat(prms.toolTipAngle) || 90) * Math.PI / 180;
  const bisector = flipX ? (-toolAngleRad - tipRad / 2) : (toolAngleRad + tipRad / 2);
  const halfRange = (Math.PI - tipRad) / 2;
  const clearRad = (parseFloat(prms.toolClearanceAngle) || 0) * Math.PI / 180;
  return { bisector, halfRange, clearRad };
}
// getEffectivePlungeAngle → přesunuto do cam/camMath.js
// Test jednoho segmentu kontury proti úhlovému rozsahu destičky —
// true = destička by při sledování segmentu špičkou zajela bočním
// ostřím do materiálu (normála segmentu mimo pokrytý rozsah).
// Malá tolerance, aby tečné body PŘESNĚ na hranici dosažitelnosti (typicky
// začátek oblouku navázaného na mostovou čáru profilu) nezhodily celý jinak
// dosažitelný oblouk jako "nedosažitelný" (hraniční false-positive ~0.1°).
const INSERT_REACH_TOL = 1.5 * Math.PI / 180;
// Vrací: 'tip'   = ani s vůlí hřbetu hrot nedosáhne (mimo halfRange + clearRad),
//        'flank' = hrot dosáhne díky vůli hřbetu (halfRange < diff ≤ halfRange+clearRad),
//                  ale hřbet bude v kontaktu s materiálem — riziko otěru,
//        false   = zcela v bezpečné zóně.
// Model: clearRad rozšiřuje efektivní dosah destičky za geometrické halfRange,
// ale v tomto "bonusovém" pásmu koliduje hřbet s materiálem.
// clearRad = 0 (negativní plátka, α=0) → chování beze změny, žádná flank zóna.
function segInterferesWithTool(seg, clearance) {
  const { bisector, halfRange, clearRad = 0 } = clearance;
  // Bez vůle: geometrická mez + tolerance. S vůlí: rozšířeno o clearRad.
  const tipLim   = halfRange + clearRad + INSERT_REACH_TOL;  // za touto mezí ani s α nedosáhne
  const flankLim = halfRange + INSERT_REACH_TOL;             // bez α nedosáhne, s α dosáhne (flank zóna)

  function checkNormal(normAngle) {
    const diff = Math.abs(normalizeAngle(normAngle - bisector));
    if (diff > tipLim) return 'tip';
    if (clearRad > 0 && diff > flankLim) return 'flank';
    return null;
  }

  if (seg.type === 'line') {
    const n = getNormal(seg.p1, seg.p2);
    if (n.x === 0 && n.z === 0) return false;
    return checkNormal(vecAngle(n.x, n.z)) || false;
  }
  if (seg.type === 'arc') {
    const midAbsX = Math.abs((seg.p1.x + seg.p2.x) / 2);
    const isOuter = Math.abs(seg.cx) < midAbsX;
    const startAngle = Math.atan2(seg.p1.x - seg.cx, seg.p1.z - seg.cz);
    let endAngle = Math.atan2(seg.p2.x - seg.cx, seg.p2.z - seg.cz);
    if (seg.dir === 'G2' && endAngle > startAngle) endAngle -= 2 * Math.PI;
    if (seg.dir === 'G3' && endAngle < startAngle) endAngle += 2 * Math.PI;
    const steps = 8;
    let worstType = null;
    for (let s = 0; s <= steps; s++) {
      const a = startAngle + (endAngle - startAngle) * (s / steps);
      const normAngle = isOuter ? normalizeAngle(a) : normalizeAngle(a + Math.PI);
      const t = checkNormal(normAngle);
      if (t === 'tip') return 'tip';
      if (t === 'flank') worstType = 'flank';
    }
    return worstType || false;
  }
  return false;
}
// Pro oblouk vrátí SOUVISLÝ podinterval úhlu {a0,a1} (v parametru oblouku,
// tj. atan2(x−cx, z−cz), orientovaný start→end), kde špička destičky DOSÁHNE
// (normála uvnitř úhlového rozsahu i s vůlí hřbetu). Vrací null, když nedosáhne
// nikde. Slouží k oříznutí ČÁSTEČNĚ nedosažitelného oblouku — obrobí se
// dosažitelná část místo zahození celého oblouku (jinak vypuklý roh, na který
// špička dojede, zůstane bez dokončovací dráhy).
function arcReachableSpan(seg, clearance) {
  const { bisector, halfRange, clearRad = 0 } = clearance;
  const tipLim = halfRange + clearRad + INSERT_REACH_TOL;
  const midAbsX = Math.abs((seg.p1.x + seg.p2.x) / 2);
  const isOuter = Math.abs(seg.cx) < midAbsX;
  const startAngle = Math.atan2(seg.p1.x - seg.cx, seg.p1.z - seg.cz);
  let endAngle = Math.atan2(seg.p2.x - seg.cx, seg.p2.z - seg.cz);
  if (seg.dir === 'G2' && endAngle > startAngle) endAngle -= 2 * Math.PI;
  if (seg.dir === 'G3' && endAngle < startAngle) endAngle += 2 * Math.PI;
  const steps = 64;
  let a0 = null, a1 = null;
  for (let s = 0; s <= steps; s++) {
    const a = startAngle + (endAngle - startAngle) * (s / steps);
    const normAngle = isOuter ? normalizeAngle(a) : normalizeAngle(a + Math.PI);
    const reachable = Math.abs(normalizeAngle(normAngle - bisector)) <= tipLim;
    if (reachable) { if (a0 === null) a0 = a; a1 = a; }
    else if (a0 !== null) break; // souvislý dosažitelný běh skončil
  }
  if (a0 === null) return null;
  return { a0, a1, startAngle, endAngle };
}
// Test, jestli úsečka (p1→p2, reálné souřadnice X = rádius) protíná
// segmenty offsetové dráhy — pro kontrolu bezpečnosti rychloposuvů.
// Doteky v koncových bodech (najetí přesně na dráhu) se nepočítají.
function segmentHitsPath(p1, p2, segs) {
  const dx = p2.x - p1.x, dz = p2.z - p1.z;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-12) return false;
  for (const seg of segs) {
    if (seg.isDegenerate) continue;
    if (seg.type === 'line') {
      const d = (p1.x - p2.x) * (seg.p1.z - seg.p2.z) - (p1.z - p2.z) * (seg.p1.x - seg.p2.x);
      if (Math.abs(d) < 1e-12) continue; // rovnoběžné/kolineární — neprotíná příčně
      const t = ((p1.x - seg.p1.x) * (seg.p1.z - seg.p2.z) - (p1.z - seg.p1.z) * (seg.p1.x - seg.p2.x)) / d;
      const u = ((p1.x - seg.p1.x) * (p1.z - p2.z) - (p1.z - seg.p1.z) * (p1.x - p2.x)) / d;
      if (t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999) return true;
    } else if (seg.type === 'arc') {
      const hits = intersectLineCircle(p1, p2, { x: seg.cx, z: seg.cz }, seg.r);
      if (!hits) continue;
      for (const q of hits) {
        const t = ((q.x - p1.x) * dx + (q.z - p1.z) * dz) / len2;
        if (t <= 0.001 || t >= 0.999) continue;
        const ang = Math.atan2(q.x - seg.cx, q.z - seg.cz);
        if (isAngleBetween(ang, seg.startAngle, seg.endAngle, seg.dir === 'G2')) return true;
      }
    }
  }
  return false;
}
function intersectLines(p1, p2, p3, p4) {
  if (!p1 || !p2 || !p3 || !p4) return null;
  if (isNaN(p1.x) || isNaN(p1.z) || isNaN(p2.x) || isNaN(p2.z) ||
      isNaN(p3.x) || isNaN(p3.z) || isNaN(p4.x) || isNaN(p4.z)) return null;
  const d = (p1.x - p2.x) * (p3.z - p4.z) - (p1.z - p2.z) * (p3.x - p4.x);
  if (Math.abs(d) < 1e-9 || isNaN(d)) return null;
  const t = ((p1.x - p3.x) * (p3.z - p4.z) - (p1.z - p3.z) * (p3.x - p4.x)) / d;
  const ix = p1.x + t * (p2.x - p1.x);
  const iz = p1.z + t * (p2.z - p1.z);
  if (isNaN(ix) || isNaN(iz)) return null;
  return { x: ix, z: iz };
}
function intersectLinesInfinite(p1, p2, p3, p4) {
  if (!p1 || !p2 || !p3 || !p4) return null;
  if (isNaN(p1.x) || isNaN(p1.z) || isNaN(p2.x) || isNaN(p2.z) ||
      isNaN(p3.x) || isNaN(p3.z) || isNaN(p4.x) || isNaN(p4.z)) return null;
  const d = (p1.x - p2.x) * (p3.z - p4.z) - (p1.z - p2.z) * (p3.x - p4.x);
  if (Math.abs(d) < 1e-9 || isNaN(d)) return null;
  const t = ((p1.x - p3.x) * (p3.z - p4.z) - (p1.z - p3.z) * (p3.x - p4.x)) / d;
  const px = p1.x + t * (p2.x - p1.x);
  const pz = p1.z + t * (p2.z - p1.z);
  if (isNaN(px) || isNaN(pz)) return null;
  return { x: px, z: pz };
}
function intersectLineCircle(p1, p2, center, r) {
  if (!p1 || !p2 || !center) return null;
  const dx = p2.x - p1.x, dz = p2.z - p1.z;
  const fx = p1.x - center.x, fz = p1.z - center.z;
  const a = dx * dx + dz * dz, b = 2 * (fx * dx + fz * dz), c = (fx * fx + fz * fz) - r * r;
  let discriminant = b * b - 4 * a * c;
  // Tolerance pro tangentní případ — bez ní by se line tečná k offset oblouku
  // vyhodnotila jako "no intersection" a bridge fallback v trimAndRemoveLoops
  // by zdegeneroval malý oblouk (radius při ostrém rohu) do bodu.
  const tangentTol = 1e-6 * Math.max(1, a, c < 0 ? -c : c);
  if (discriminant < -tangentTol) return null;
  if (discriminant < 0) discriminant = 0;
  discriminant = Math.sqrt(discriminant);
  const t1 = (-b - discriminant) / (2 * a), t2 = (-b + discriminant) / (2 * a);
  return [
    { x: p1.x + t1 * dx, z: p1.z + t1 * dz },
    { x: p1.x + t2 * dx, z: p1.z + t2 * dz }
  ];
}
function intersectCircleCircle(c1x, c1z, r1, c2x, c2z, r2) {
  const dx = c2x - c1x, dz = c2z - c1z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < EPSILON || d > r1 + r2 + EPSILON || d < Math.abs(r1 - r2) - EPSILON) return null;
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - a * a;
  if (h2 < 0) return null;
  const h = Math.sqrt(Math.max(0, h2));
  const mx = c1x + a * dx / d, mz = c1z + a * dz / d;
  const ox = -dz / d, oz = dx / d;
  return [
    { x: mx + h * ox, z: mz + h * oz },
    { x: mx - h * ox, z: mz - h * oz }
  ];
}
// Skutečné průsečíky dvou segmentů (line/arc) — body, kde se dvě čáry
// kříží (ne koncové body). Pro SNAP na průsečíku kontury/offsetu/
// konstrukční čáry. Vrací jen body ležící uvnitř OBOU segmentů.
function segPairIntersections(s1, s2) {
  if (!s1 || !s2 || s1.isDegenerate || s2.isDegenerate) return [];
  const out = [];
  const onLine = (q, a, b) => {
    const dx = b.x - a.x, dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-12) return false;
    const t = ((q.x - a.x) * dx + (q.z - a.z) * dz) / len2;
    return t > 0.001 && t < 0.999;
  };
  const onArc = (q, s) => isAngleBetween(Math.atan2(q.x - s.cx, q.z - s.cz), s.startAngle, s.endAngle, s.dir === 'G2');
  if (s1.type === 'line' && s2.type === 'line') {
    const p = intersectLines(s1.p1, s1.p2, s2.p1, s2.p2);
    if (p && onLine(p, s1.p1, s1.p2) && onLine(p, s2.p1, s2.p2)) out.push(p);
  } else if (s1.type === 'line' && s2.type === 'arc') {
    const hits = intersectLineCircle(s1.p1, s1.p2, { x: s2.cx, z: s2.cz }, s2.r) || [];
    for (const q of hits) if (onLine(q, s1.p1, s1.p2) && onArc(q, s2)) out.push(q);
  } else if (s1.type === 'arc' && s2.type === 'line') {
    const hits = intersectLineCircle(s2.p1, s2.p2, { x: s1.cx, z: s1.cz }, s1.r) || [];
    for (const q of hits) if (onLine(q, s2.p1, s2.p2) && onArc(q, s1)) out.push(q);
  } else if (s1.type === 'arc' && s2.type === 'arc') {
    const hits = intersectCircleCircle(s1.cx, s1.cz, s1.r, s2.cx, s2.cz, s2.r) || [];
    for (const q of hits) if (onArc(q, s1) && onArc(q, s2)) out.push(q);
  }
  return out;
}
// Lokalizace bodu na kontuře (segmenty result): vrátí {segIdx, key} kde
// key = segIdx + podíl 0..1 podél segmentu (pro řazení podél kontury).
// null = bod neleží na žádném segmentu (do TOL).
function _locateOnContour(result, pt) {
  const TOL = 0.3;
  let best = null, bestD = Infinity;
  for (let i = 0; i < result.length; i++) {
    const s = result[i]; if (!s || s.isDegenerate) continue;
    if (s.type === 'line') {
      if (!s.p1 || !s.p2) continue;
      const dx = s.p2.x - s.p1.x, dz = s.p2.z - s.p1.z, L2 = dx * dx + dz * dz || 1e-9;
      let t = ((pt.x - s.p1.x) * dx + (pt.z - s.p1.z) * dz) / L2;
      if (t < -0.02 || t > 1.02) continue;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(pt.x - (s.p1.x + t * dx), pt.z - (s.p1.z + t * dz));
      if (d < bestD && d < TOL) { bestD = d; best = { segIdx: i, key: i + t }; }
    } else if (s.type === 'arc') {
      const d = Math.abs(Math.hypot(pt.x - s.cx, pt.z - s.cz) - s.r);
      if (d > TOL) continue;
      const a = Math.atan2(pt.x - s.cx, pt.z - s.cz);
      if (!isAngleBetween(a, s.startAngle, s.endAngle, s.dir === 'G2')) continue;
      let sA = s.startAngle, eA = s.endAngle;
      if (s.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
      if (s.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
      let aa = a;
      if (s.dir === 'G2' && aa > sA) aa -= 2 * Math.PI;
      if (s.dir === 'G3' && aa < sA) aa += 2 * Math.PI;
      const t = Math.abs(eA - sA) > 1e-9 ? (aa - sA) / (eA - sA) : 0;
      if (d < bestD) { bestD = d; best = { segIdx: i, key: i + Math.max(0, Math.min(1, t)) }; }
    }
  }
  return best;
}
// Hlídat geometrii destičky: nahradí nedosažitelné úseky kontury rovnou
// "mostovou" úsečkou z geometrie destičky (mezní/tečná čára). Konce mostu
// jsou body, kde mezní čára protíná konturu (A=spodní, B=horní) — leží na
// kontuře (camRayIntersection). Úsek kontury mezi nimi se vyřízne a nahradí
// G1 úsečkou; sousední/rozdělený oblouk se zkrátí a pokračuje dál stejným
// tvarem. Funguje i když oba konce leží na TÉŽE entitě (rozdělení oblouku).
// Mostové úseky dostanou fromInsert=true (jiná barva, jinak normální G1).
// Drážka/kapsa ohraničená DVĚMA mezními čarami (zanoření na vjezdu + dojezd
// na výjezdu) — nahradit „V" v PRŮSEČÍKU obou čar: dolů po jedné dosažitelné
// hraně do dna V, nahoru po druhé ven k otevřenému rohu. Bez tohoto by se obě
// čáry zpracovaly samostatně a konfliktovaly (vjezdový most smaže dno, na které
// se výjezdová čára váže → výjezd se neudělá a dráha skončí dole v kontuře).
// Vrací { result, consumed:Set indexů spotřebovaných guides }.
function mergePocketGuides(segs, guides) {
  let result = segs.map(s => ({ ...s }));
  const consumed = new Set();
  // Vrchol kontury (roh) nejblíž bodu pt do tolerance → {segIdx, at, pt}.
  const vertexNear = (pt) => {
    let best = null, bestD = 0.3;
    for (let i = 0; i < result.length; i++) {
      const s = result[i]; if (s.isDegenerate) continue;
      const a = segStartPoint(s), b = segEndPoint(s);
      const da = Math.hypot(pt.x - a.x, pt.z - a.z); if (da < bestD) { bestD = da; best = { segIdx: i, at: 'start', pt: a }; }
      const db = Math.hypot(pt.x - b.x, pt.z - b.z); if (db < bestD) { bestD = db; best = { segIdx: i, at: 'end', pt: b }; }
    }
    return best;
  };
  // Rozliší u mezní čáry vrcholový (rohový) konec od „hloubkového" (uvnitř
  // entity). Vrací null, když je to nejednoznačné (oba/žádný na rohu).
  const splitGuide = (g) => {
    const e = [{ x: g.x1, z: g.z1 }, { x: g.x2, z: g.z2 }];
    const v0 = vertexNear(e[0]), v1 = vertexNear(e[1]);
    if (v0 && !v1) return { vtx: v0.pt, deep: e[1], loc: v0 };
    if (v1 && !v0) return { vtx: v1.pt, deep: e[0], loc: v1 };
    return null;
  };
  const cutIdx = (loc) => loc.at === 'start' ? loc.segIdx : loc.segIdx + 1;
  // U lomené čáry (hlídání držáku, g.via) je pro párování do „V" rozhodující
  // jen PRVNÍ úsek od rohu — hrana destičky. Když průsečík V padne až za její
  // konec, dno V destička nedosáhne hranou, ale kapsa je dost široká na
  // zanoření držákem → NEpárovat; každá čára pak přemostí svou stěnu zvlášť
  // a dno kapsy mezi nimi zůstane obrobitelné.
  const firstPtAfterVtx = (g, sp) => {
    if (!g.via || !g.via.length) return null;
    const isUpEnd = Math.hypot(sp.vtx.x - g.x2, sp.vtx.z - g.z2) <= Math.hypot(sp.vtx.x - g.x1, sp.vtx.z - g.z1);
    return isUpEnd ? g.via[0] : g.via[g.via.length - 1];
  };
  for (let zi = 0; zi < guides.length; zi++) {
    if (consumed.has(zi) || guides[zi].kind !== 'zanoreni') continue;
    const zg = splitGuide(guides[zi]); if (!zg) continue;
    for (let di = 0; di < guides.length; di++) {
      if (consumed.has(di) || di === zi || guides[di].kind !== 'dojezd') continue;
      const dg = splitGuide(guides[di]); if (!dg) continue;
      if (Math.hypot(zg.vtx.x - dg.vtx.x, zg.vtx.z - dg.vtx.z) < 0.3) continue;
      const zNext = firstPtAfterVtx(guides[zi], zg), dNext = firstPtAfterVtx(guides[di], dg);
      const V = intersectLinesInfinite(zg.vtx, zNext || zg.deep, dg.vtx, dNext || dg.deep);
      if (!V) continue;
      // Dno V musí být hlubší (menší X) než oba otevřené rohy, ne za osou.
      if (!(V.x < zg.vtx.x - 0.05 && V.x < dg.vtx.x - 0.05) || V.x < -0.01) continue;
      // Dno V musí ležet UVNITŘ obou mezních čar (mezi rohem a hloubkovým
      // koncem), ne na jejich dalekém prodloužení — to spolehlivě odmítne
      // spárování čar ze dvou různých prvků (např. zaoblení + drážka).
      // Lomená čára: rozsah se měří jen po konec hranového úseku (bez rezervy
      // do hloubky — za ním už pokračuje silueta držáku).
      const paramOf = (P, A, B) => { const dx = B.x - A.x, dz = B.z - A.z, L2 = dx * dx + dz * dz; return L2 < 1e-9 ? 0 : ((P.x - A.x) * dx + (P.z - A.z) * dz) / L2; };
      const tz = paramOf(V, zg.vtx, zNext || zg.deep), td = paramOf(V, dg.vtx, dNext || dg.deep);
      if (tz < -0.2 || tz > (zNext ? 1.05 : 1.3) || td < -0.2 || td > (dNext ? 1.05 : 1.3)) continue;
      // Rohy seřadit podle pozice v kontuře (klíč = segIdx + at).
      const aFirst = cutIdx(zg.loc) <= cutIdx(dg.loc);
      const a = aFirst ? zg : dg, b = aFirst ? dg : zg;
      const i0 = cutIdx(a.loc), i1 = cutIdx(b.loc);
      if (i1 - i0 < 1) continue;            // mezi rohy nic není
      // Kontrola, že úsek mezi rohy je RECESS (zapadá dovnitř, ne ven).
      const openX = Math.min(a.vtx.x, b.vtx.x);
      let dipsIn = false, bulgesOut = false;
      for (let k = i0; k < i1; k++) {
        const s = result[k]; const ax = segStartPoint(s).x, bx = segEndPoint(s).x;
        if (Math.min(ax, bx) < openX - 0.3) dipsIn = true;
        if (Math.max(ax, bx) > Math.max(a.vtx.x, b.vtx.x) + 0.3) bulgesOut = true;
      }
      if (!dipsIn || bulgesOut) continue;
      // Nahradit úsek mezi rohy „V": roh A → dno V → roh B (oba fromInsert).
      const before = result.slice(0, i0);
      const after = result.slice(i1);
      result = [...before,
        { type: 'line', p1: { ...a.vtx }, p2: { x: V.x, z: V.z }, fromInsert: true },
        { type: 'line', p1: { x: V.x, z: V.z }, p2: { ...b.vtx }, fromInsert: true },
        ...after];
      if (after[0]) delete after[0].chainBreak;
      consumed.add(zi); consumed.add(di);
      break;
    }
  }
  return { result, consumed };
}
// ── Horní obálka náběhových stínů ──
// 'zanoreni' čáry (spodní hrana destičky) jsou navzájem ROVNOBĚŽNÉ (stejný
// sklon = úhel spodní hrany). Když čára G leží celá ve stínu jiné G' (G' je
// nad G v jejich společném Z-rozsahu), generuje ji vrchol, který je sám
// zastíněný vyšším vrcholem → je nadbytečná. Bez potlačení by nižší čára
// (od hlubšího/čelního vrcholu) přemostila konturu POD vyšším vrcholem a
// uřízla ho (uživatel: „udělalo dráhy z bodu 8, i když bod 6 leží nad ním").
// Pocketem spárované čáry (drážky) se nepotlačují — řeší je mergePocketGuides.
// Vrací Set indexů potlačených čar; potlačené navíc dostanou _dominated=true.
function markDominatedGuides(guides, consumed) {
  const dominated = new Set();
  const gZLo = (g) => Math.min(g.z1, g.z2), gZHi = (g) => Math.max(g.z1, g.z2);
  // Výška čáry v daném Z — po částech přes lomené (via) vrcholy; svislý
  // úsek / degenerát → max X koncových bodů (jako dřív).
  const gXAtZ = (g, z) => {
    const pts = guidePolyPoints(g);
    let best = -Infinity;
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], b = pts[k + 1];
      if (Math.abs(b.z - a.z) < 1e-9) {
        if (Math.abs(z - a.z) < 1e-6) best = Math.max(best, a.x, b.x);
        continue;
      }
      const t = (z - a.z) / (b.z - a.z);
      if (t >= -1e-6 && t <= 1 + 1e-6) best = Math.max(best, a.x + (b.x - a.x) * t);
    }
    return best === -Infinity ? Math.max(g.x1, g.x2) : best;
  };
  for (let i = 0; i < guides.length; i++) {
    if (guides[i].kind !== 'zanoreni' || consumed.has(i)) continue;
    for (let j = 0; j < guides.length; j++) {
      if (j === i || guides[j].kind !== 'zanoreni' || consumed.has(j)) continue;
      const lo = Math.max(gZLo(guides[i]), gZLo(guides[j]));
      const hi = Math.min(gZHi(guides[i]), gZHi(guides[j]));
      if (hi - lo < 0.1) continue; // bez překryvu v Z = jiná oblast dílce
      const zm = (lo + hi) / 2;
      if (gXAtZ(guides[j], zm) > gXAtZ(guides[i], zm) + 0.05) {
        dominated.add(i);
        guides[i]._dominated = true; // ať se nekreslí jako „zbytečná" čára ve stínu
        break;
      }
    }
  }
  return dominated;
}
// Most mezi DVĚMA body ležícími na kontuře (A, B; lokace lA, lB z
// _locateOnContour): vyřízne úsek kontury mezi nimi a nahradí ho přímým
// mostem (fromInsert). Vrací novou konturu (nebo beze změny, když jsou body
// prakticky totožné). Nemutuje vstup kromě případu splice na jedné entitě
// (result je pracovní kopie z volajícího).
function bridgeBetweenContourPoints(result, A, B, lA, lB, g) {
  let f, s, fPt, sPt;
  if (lA.key <= lB.key) { f = lA; fPt = A; s = lB; sPt = B; }
  else { f = lB; fPt = B; s = lA; sPt = A; }
  if (s.key - f.key < 1e-4) return result;
  // Most = lomená čára podle mezní čáry g (via z hlídání držáku); bez via
  // jediná přímá úsečka jako dřív. Hranový úsek (od HORNÍHO konce čáry) se
  // pozná podle orientace fPt vůči koncům g.
  const pts = guideBridgePts(g, fPt, sPt);
  const fIsUp = !g || Math.hypot(fPt.x - g.x2, fPt.z - g.z2) <= Math.hypot(fPt.x - g.x1, fPt.z - g.z1);
  const bridges = mkBridgeSegs(pts, fIsUp);
  if (!bridges.length) return result;
  if (f.segIdx === s.segIdx) {
    // Oba konce na jedné entitě → rozdělit: [start..fPt] + most + [sPt..end].
    const seg = result[f.segIdx];
    const head = { ...seg }; setSegEnd(head, fPt); syncArcEndpoints(head);
    const tail = { ...seg }; setSegStart(tail, sPt); syncArcEndpoints(tail); delete tail.chainBreak;
    result.splice(f.segIdx, 1, head, ...bridges, tail);
    return result;
  }
  const before = result.slice(0, f.segIdx + 1).map(x => ({ ...x }));
  setSegEnd(before[before.length - 1], fPt); syncArcEndpoints(before[before.length - 1]);
  const after = result.slice(s.segIdx).map(x => ({ ...x }));
  setSegStart(after[0], sPt); syncArcEndpoints(after[0]); delete after[0].chainBreak;
  return [...before, ...bridges, ...after];
}
// Most z JEDNOHO bodu na kontuře (loc) k druhému konci MIMO konturu (na
// polotovaru). Tři topologie mezní čáry:
//   • downOnStock (ČELNÍ čára u kraje): zahodí nedosažitelné čelo za kotvou a
//     zakončí konturu podél mezní čáry k hraně polotovaru;
//   • NÁBĚHOVÝ STÍN (off míří hluboko do polotovaru, kotva na vnitřním vrcholu):
//     úsek kontury ve stínu destičky se nahradí jedním mostem podél čáry;
//   • PRODLOUŽENÍ K OKRAJI (kotva na krajní entitě): kontura se protáhne k off.
// Vrací novou konturu; při čáře, která nesedí na žádný případ, vrací beze změny.
function bridgeFromContourToStock(result, g, A, B, lA, lB) {
  const loc = lA || lB, locPt = lA ? A : B, offPt = lA ? B : A;
  // Mostové úsečky z bodu from do to podél mezní čáry (respektuje lomené
  // via vrcholy z hlídání držáku; bez nich jediná přímá úsečka).
  const segsFromTo = (from, to) => mkBridgeSegs(guideBridgePts(g, from, to),
    Math.hypot(from.x - g.x2, from.z - g.z2) <= Math.hypot(from.x - g.x1, from.z - g.z1));
  // ── ČELNÍ mezní čára (downOnStock) ──
  // Kotví na rohu čela u KRAJE kontury a míří k hraně polotovaru. Segment čela
  // za kotvou (k ose) je nedosažitelný — zahodí se a kontura se zakončí podél
  // mezní čáry. Kotva u KONCE: ponech [start..kotva] + most k offPt; u ZAČÁTKU
  // zrcadlově. Kotva uvnitř kontury → jen vizualizace (beze změny).
  // Sem patří i ČELNÍ DOJEZDOVÁ čára bez downOnStock: natočená destička dojíždí
  // na čelo u kraje kontury a nechá ho ŠIKMÉ. Kotva je roh čela (start/konec
  // kontury) a volný konec míří DOPŘEDU (za čelo, větší Z) k ose — stejné
  // zakončení jako downOnStock. Bez tohoto by čára spadla do „náběhového stínu"
  // níže a vrátila se beze změny (práh 5 mm překročí každé čelo nad ~19 mm ⌀),
  // takže by se čelo neobrobilo podle geometrie plátku.
  const frontFaceDojezd = !g.downOnStock && g.kind === 'dojezd'
    && offPt.z > locPt.z + 0.5
    && (loc.segIdx <= 1 || loc.segIdx >= result.length - 2);
  if (g.downOnStock || frontFaceDojezd) {
    // _locateOnContour vrací key = segIdx + t (t≈0 začátek entity, ≈1 konec).
    const tPos = loc.key - loc.segIdx;
    const atEnd = tPos > 0.5;
    // cut = index PRVNÍHO segmentu ZA kotvou (na straně zahozeného čela).
    const cut = atEnd ? loc.segIdx + 1 : loc.segIdx;
    const nearEnd = loc.segIdx >= result.length - 2;
    const nearStart = loc.segIdx <= 1;
    if (nearEnd) {
      const before = result.slice(0, cut).map(x => ({ ...x }));
      if (before.length) {
        if (atEnd) { setSegEnd(before[before.length - 1], locPt); syncArcEndpoints(before[before.length - 1]); }
        return [...before, ...segsFromTo({ ...locPt }, { ...offPt })];
      }
    } else if (nearStart) {
      const after = result.slice(cut).map(x => ({ ...x }));
      if (after.length) {
        if (!atEnd) { setSegStart(after[0], locPt); syncArcEndpoints(after[0]); delete after[0].chainBreak; }
        return [...segsFromTo({ ...offPt }, { ...locPt }), ...after];
      }
    }
    return result;
  }
  const startPt = segStartPoint(result[0]);
  const endPt = segEndPoint(result[result.length - 1]);
  const dStart = Math.hypot(offPt.x - startPt.x, offPt.z - startPt.z);
  const dEnd = Math.hypot(offPt.x - endPt.x, offPt.z - endPt.z);
  if (Math.min(dStart, dEnd) > 5) {
    // ── Náběhový stín destičky ──
    // Off konec míří hluboko do POLOTOVARU a loc kotví na vnitřním vrcholu.
    // Zanořovací čára říká, že úsek kontury od loc dál je ve STÍNU destičky
    // (jede shora, dojede jen k čáře) → nahradí se jedním mostem podél čáry;
    // zbytek kontury hlubší než off (upínací oblast) zůstane.
    if (g.kind !== 'zanoreni' || offPt.x < locPt.x + 0.5) return result;
    // ci = první segment ZA kotvou. _locateOnContour vrací key = segIdx + t
    // (t≈0 začátek entity, ≈1 konec) — pozn.: NEmá pole `at`. Kotva na konci
    // entity (t≥0.5) → stín začíná až další entitou; na začátku → touto.
    const ci = (loc.key - loc.segIdx) < 0.5 ? loc.segIdx : loc.segIdx + 1;
    if (ci >= result.length) return result;
    // Výška mezní čáry v daném Z — po částech přes lomené (via) vrcholy;
    // mimo rozsah lomené čáry extrapolace krajního úseku (jako přímka dřív).
    const shadowPts = guideBridgePts(g, { x: locPt.x, z: locPt.z }, { x: offPt.x, z: offPt.z });
    const lineXAtZ = (z) => {
      let best = null;
      for (let k = 0; k + 1 < shadowPts.length; k++) {
        const a = shadowPts[k], b = shadowPts[k + 1];
        if (Math.abs(b.z - a.z) < 1e-9) { if (Math.abs(z - a.z) < 1e-6) best = Math.max(best ?? -Infinity, a.x, b.x); continue; }
        const t = (z - a.z) / (b.z - a.z);
        const inRange = t >= -1e-6 && t <= 1 + 1e-6;
        const isEdgeSpan = k === 0 || k === shadowPts.length - 2;
        if (inRange || isEdgeSpan && (shadowPts.length === 2 || (k === 0 ? t < 0 : t > 1)))
          best = Math.max(best ?? -Infinity, a.x + (b.x - a.x) * t);
      }
      return best ?? locPt.x;
    };
    // Konec stínu = první segment začínající hlouběji než off (Z ≤ off.z).
    // Cestou ověřit, že je celý stín POD čarou (jinak by most zajel do
    // vystupujícího prvku → přeskočit).
    let keepFrom = -1, ok = true;
    for (let k = ci; k < result.length; k++) {
      const sp = segStartPoint(result[k]), ep = segEndPoint(result[k]);
      if (sp.z <= offPt.z + 1e-6) { keepFrom = k; break; }
      const cap = Math.max(ep.z, offPt.z);
      if (sp.x > lineXAtZ(sp.z) + 0.3 || ep.x > lineXAtZ(cap) + 0.3) { ok = false; break; }
    }
    if (!ok) return result;
    const before = result.slice(0, ci).map(x => ({ ...x }));
    const bridge = segsFromTo({ ...locPt }, { ...offPt });
    if (keepFrom === -1) return [...before, ...bridge];
    const tail = result.slice(keepFrom).map(x => ({ ...x }));
    const connector = { type: 'line', p1: { ...offPt }, p2: segStartPoint(tail[0]), fromInsert: true };
    delete tail[0].chainBreak;
    return [...before, ...bridge, connector, ...tail];
  }
  // ── Prodloužení k okraji ── smí navazovat JEN na krajní entitu kontury.
  // Když loc leží uvnitř kontury (např. spodní konec dopadl paprskem na osu
  // odlitku X=0), tahle větev by smazala celý „ocas" kontury → přeskočit.
  const extendStart = dStart <= dEnd;
  if (extendStart ? loc.segIdx !== 0 : loc.segIdx !== result.length - 1) return result;
  if (extendStart) {
    const after = result.slice(loc.segIdx).map(x => ({ ...x }));
    setSegStart(after[0], locPt); syncArcEndpoints(after[0]); delete after[0].chainBreak;
    return [...segsFromTo({ ...offPt }, { ...locPt }), ...after];
  }
  const before = result.slice(0, loc.segIdx + 1).map(x => ({ ...x }));
  setSegEnd(before[before.length - 1], locPt); syncArcEndpoints(before[before.length - 1]);
  return [...before, ...segsFromTo({ ...locPt }, { ...offPt })];
}
// ── ZÁVITOVÁNÍ: sdílené výpočty ───────────────────────────────────────────
// Hloubka profilu závitu [mm, radiálně] podle typu (stejné vzorce jako
// kalkulačka Závity v CAD — detailMetric/detailG/detailTr/… v thread.js).
function threadProfileDepth(typeKey, P, external) {
  if (typeKey === 'tr' || typeKey === 'acme') return 0.5 * P + 0.25;           // lichoběžník: H1 + vůle ac
  if (typeKey === 'g' || typeKey === 'bspt' || typeKey === 'bsw') return 0.6403 * P; // Whitworth 55°
  return external ? 0.6134 * P : 0.5413 * P;                                   // ISO / UN 60°
}

// Rozdělení přísuvů na průchody — kumulativní hloubky [mm]. Degresivně
// (konstantní průřez třísky, ∝ √(i/n)). Auto počet průchodů: průměrný
// záběr ~0,12 mm (M×1 → 6, M×1,5 → 8, M×2 → 11, M×2,5 → 15, M×3 → 16),
// první záběr omezen na 0,4 mm — odpovídá běžné CNC praxi / CYCLE97,
// na rozdíl od konzervativní ruční tabulky v CAD kalkulačce Závity.
function computeThreadPassCuts(totalDepth, forcedPasses) {
  const H = Math.max(0.01, totalDepth);
  let n = forcedPasses > 0 ? Math.min(200, Math.round(forcedPasses)) : Math.max(4, Math.ceil(H / 0.12));
  if (!(forcedPasses > 0)) {
    while (H * Math.sqrt(1 / n) > 0.4 && n < 50) n++;
  }
  const cuts = [];
  for (let i = 1; i <= n; i++) cuts.push(i === n ? H : H * Math.sqrt(i / n));
  return cuts;
}

// ── UPICHNUTÍ (part-off): sdílená geometrie ───────────────────────────────
// Spočítá polohy plátku pro zápich po svislé úsečce v Z=partOffZ. Používá se
// jak v generování G-kódu (generateAutoGCode), tak ve vykreslení (draw), aby
// dráhy a vizualizace odpovídaly. Referenční bod plátku = STŘED pracovního
// rádiusu; spodní (řezná) hrana je o rIns blíž k ose. Viz komentář u
// partOffActive v generateAutoGCode pro sémantiku přídavků.
function partOffGeom(prms, calc) {
  const pz = parseFloat(prms.partOffZ);
  const shape = prms.toolShape;
  const R = Math.max(0, parseFloat(prms.toolRadius) || 0);
  const wIns = Math.max(0, parseFloat(prms.toolLength) || 0);
  // Pracovní rádius: kulatý plátek = R; upichovák = rohový rádius (≤ půl šířky).
  const rIns = shape === 'parting' ? Math.min(R, wIns > 0 ? wIns / 2 : R) : R;
  const allowX = parseFloat(prms.allowanceX) || 0;          // Dojezd X (spodní hrana)
  // Přídavek Z = TRVALÝ přídavek v ose Z — poslední/jediná dráha ho nechá stát
  // (NEodebírá se dokončováním). Přídavek na hotovo = přídavek NA HOTOVO, který
  // odebere až dokončovací (plynulá) dráha, pokud je zapnutá.
  const allowZ = parseFloat(prms.allowanceZ) || 0;
  const finAllow = parseFloat(prms.finishAllowance) || 0;
  const dir = (prms.roughingSide === 'left') ? -1 : 1;      // strana těla plátku
  const xStockTop = Math.max(parseFloat(calc && calc.stockTopX) || 0, 0.1);
  const xCenterTop = xStockTop + rIns;                       // střed: spodní hrana na povrchu
  const xCenterTarget = allowX + rIns;                      // střed: spodní hrana na dojezdu
  // Start X = kam se dojede rychloposuvem a odtud teprve jede posuv. Musí ležet
  // mezi dojezdem a povrchem; 0/neplatné/nad povrch = od povrchu polotovaru.
  const startXRaw = parseFloat(prms.partOffStartX);
  const xCenterStart = (isFinite(startXRaw) && startXRaw > allowX)
    ? Math.max(xCenterTarget, Math.min(startXRaw + rIns, xCenterTop))
    : xCenterTop;
  const zFinal = pz + dir * (rIns + allowZ);               // finální rovina (Přídavek Z zůstává)
  const zRough = zFinal + dir * finAllow;                   // hrubovací rovina (o Přídavek na hotovo dál)
  const doFinish = !!prms.doFinishing && finAllow > 1e-6;   // plynulá dokončovací dráha (jen s Přídavkem na hotovo)
  let canCut = true, reason = '';
  if (shape !== 'round' && shape !== 'parting') {
    canCut = false; reason = '! Upichnutí podporuje jen kulatý / upichovací plátek – dráhy nevygenerovány.';
  } else if (allowX >= xStockTop - 1e-4) {
    canCut = false; reason = '! Dojezd (Dojezd X) leží nad polotovarem – nic k obrobení.';
  }
  return { pz, shape, rIns, allowX, allowZ, finAllow, dir, xStockTop, xBottomEdge: allowX,
           startEdgeX: xCenterStart - rIns,   // spodní hrana v místě startu posuvu (=povrch, když neaktivní)
           xCenterTop, xCenterStart, xCenterTarget, zRough, zFinal, doFinish, canCut, reason };
}

// ── Hranice zanoření podle držáku (model dle nákresu uživatele) ────────────
// Pro NEDOSAŽITELNOU stěnu (zanořovací strana) platí dvě omezení:
//  1. hrana destičky — nekonečná přímka pod natočením z dotykového rohu
//     (původní chování bez držáku),
//  2. držák — svislý pás šířky holderWidth ZA špičkou: nesmí narazit do
//     zbývajícího materiálu stěny. Zbývající povrch stěny = kontura skupiny,
//     u odlitku její KŮRA z polotovaru (stěnu destička neobrobí, kůra na ní
//     zůstane) → omezení = stěna/kůra POSUNUTÁ o holderWidth proti směru
//     obrábění (svislé čelo → svislice, kužel → rovnoběžka s kuželem).
// Mezní čára = hrana destičky od rohu až po průsečík s posunutou stěnou,
// pak podél posunuté stěny dolů (na dno kapsy / k polotovaru).
// Vrací lomené body hranice od dotyku dolů, nebo null (držák vypnut) →
// volající použije nekonečnou hranu destičky.
// Model je aproximace: mezi hloubkou konce hrany destičky a průsečíkem
// s posunutou stěnou se drží hrana (bezpečné pro běžná natočení, kdy
// průsečík leží výš než výška destičky nad špičkou).
function buildHolderBoundaryPts(best, grpSegs, prms, sb, cb, stockWorldPoints) {
  const W = parseFloat(prms.holderWidth);
  const HL = parseFloat(prms.holderLength);
  if (!(W > 0) || !(HL > 0)) return null;
  // Skupina (stěna) + polotovar jako ploché úsečky (oblouky navzorkované).
  const sample12 = (cx, cz, r, sA, eA) => {
    const out = [];
    for (let s = 0; s <= 12; s++) {
      const a = sA + (eA - sA) * (s / 12);
      out.push({ x: cx + Math.sin(a) * r, z: cz + Math.cos(a) * r });
    }
    return out;
  };
  const wallFlat = [];
  for (const seg of grpSegs) {
    if (seg.type === 'line') wallFlat.push([seg.p1, seg.p2]);
    else if (seg.type === 'arc') {
      let sA = Math.atan2(seg.p1.x - seg.cx, seg.p1.z - seg.cz);
      let eA = Math.atan2(seg.p2.x - seg.cx, seg.p2.z - seg.cz);
      if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
      if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
      const pts = sample12(seg.cx, seg.cz, seg.r, sA, eA);
      for (let k = 0; k + 1 < pts.length; k++) wallFlat.push([pts[k], pts[k + 1]]);
    }
  }
  if (!wallFlat.length) return null;
  const stockFlat = [];
  for (let i = 1; i < (stockWorldPoints || []).length; i++) {
    const p1 = stockWorldPoints[i - 1], p2 = stockWorldPoints[i];
    if (p2.type === 'G1') {
      stockFlat.push([{ x: p1.xReal, z: p1.zReal }, { x: p2.xReal, z: p2.zReal }]);
    } else if (p2.type === 'G2' || p2.type === 'G3') {
      const arc = getArcParams({ x: p1.xReal, z: p1.zReal }, { x: p2.xReal, z: p2.zReal }, p2.rVal, p2.type);
      if (arc.error) continue;
      const sA = Math.atan2(p1.xReal - arc.cx, p1.zReal - arc.cz);
      const eA = Math.atan2(p2.xReal - arc.cx, p2.zReal - arc.cz);
      const pts = sample12(arc.cx, arc.cz, arc.r, sA, eA);
      for (let k = 0; k + 1 < pts.length; k++) stockFlat.push([pts[k], pts[k + 1]]);
    }
  }
  const crossings = (flat, x) => {
    const zs = [];
    for (const [p, q] of flat) {
      const z = intersectHorizontalLineSegment(x, p, q);
      if (z !== null) zs.push(z);
    }
    return zs;
  };
  let wallMinX = Infinity, wallXs = new Set();
  for (const [p, q] of wallFlat) {
    wallMinX = Math.min(wallMinX, p.x, q.x);
    wallXs.add(p.x); wallXs.add(q.x);
  }
  // Vzorkovací výšky: dotyk + vrcholy stěny a polotovaru v dosahu držáku.
  const xsSet = new Set([best.x]);
  for (const x of wallXs) xsSet.add(x);
  for (const [p, q] of stockFlat) { xsSet.add(p.x); xsSet.add(q.x); }
  const xs = [...xsSet]
    .filter(x => x <= best.x + 1e-9 && x >= best.x - HL)
    .sort((a, b) => b - a);
  if (xs[xs.length - 1] > best.x - HL + 1e-6) xs.push(best.x - HL);
  // Hrana destičky jako z(x): svislá hrana (natočení 0°) = konst. best.z.
  const zEdgeAt = (x) => sb > 1e-9 ? best.z - (best.x - x) * (cb / sb) : best.z;
  // Posunutá stěna: KŮRA polotovaru přednostně (nejlevější dopad polotovaru
  // v okně těsně před stěnou), jinak stěna sama. Pod spodkem stěny se drží
  // hodnota jejího spodního konce (roh — dál hlídá klouzání kolem rohu).
  const zHolderAt = (x) => {
    const xq = Math.max(x, wallMinX + 1e-9);
    const wallZs = crossings(wallFlat, xq);
    if (!wallZs.length) return null;
    const zWall = Math.min(...wallZs);
    const skin = crossings(stockFlat, xq).filter(z => z >= zWall - W - 1 && z <= zWall + 0.5);
    const zObs = skin.length ? Math.min(zWall, ...skin) : zWall;
    return zObs - W;
  };
  const out = [{ x: best.x, z: best.z }];
  const push = (x, z) => {
    const prev = out[out.length - 1];
    z = Math.min(z, prev.z);               // hranice nesmí stoupat zpět doprava
    if (x > prev.x - 1e-9) { prev.z = Math.min(prev.z, z); return; }
    out.push({ x, z });
  };
  let prevX = best.x, prevE = best.z, prevH = zHolderAt(best.x);
  for (const x of xs) {
    if (x >= prevX - 1e-9) continue;
    const zE = zEdgeAt(x);
    const zH = zHolderAt(x);
    // Přepnutí větve max(hrana, posunutá stěna) mezi vzorky → vložit
    // přesný průsečík (obě větve jsou mezi vzorky lineární).
    if (prevH !== null && zH !== null) {
      const d0 = prevE - prevH, d1 = zE - zH;
      if ((d0 > 0) !== (d1 > 0) && Math.abs(d0 - d1) > 1e-12) {
        const t = d0 / (d0 - d1);
        push(prevX + (x - prevX) * t, prevE + (zE - prevE) * t);
      }
    }
    push(x, zH === null ? zE : Math.max(zE, zH));
    prevX = x; prevE = zE; if (zH !== null) prevH = zH;
  }
  // Zjednodušit kolineární běhy, ať mostů/via bodů není zbytečně moc.
  for (let k = out.length - 2; k > 0; k--) {
    const a = out[k - 1], b = out[k], c = out[k + 1];
    const cr = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    const len = Math.hypot(c.x - a.x, c.z - a.z) || 1;
    if (Math.abs(cr) / len < 0.02) out.splice(k, 1);
  }
  return out.length >= 2 ? out : null;
}
// Body lomené mezní čáry od HORNÍHO konce (x2,z2) k DOLNÍMU (x1,z1) —
// g.via jsou mezilehlé vrcholy (lomení podle siluety držáku), uložené
// v pořadí od horního konce. Přímá čára (bez via) → jen dva body.
function guidePolyPoints(g) {
  return (g && g.via && g.via.length)
    ? [{ x: g.x2, z: g.z2 }, ...g.via, { x: g.x1, z: g.z1 }]
    : [{ x: g.x2, z: g.z2 }, { x: g.x1, z: g.z1 }];
}
// Body mostu z mezní čáry g mezi dvěma jejími konci (from/to v libovolném
// pořadí) — mezi ně vloží via vrcholy ve správné orientaci.
function guideBridgePts(g, fromPt, toPt) {
  if (!g || !g.via || !g.via.length) return [fromPt, toPt];
  const dUp = Math.hypot(fromPt.x - g.x2, fromPt.z - g.z2);
  const dDown = Math.hypot(fromPt.x - g.x1, fromPt.z - g.z1);
  const seq = dUp <= dDown ? g.via : [...g.via].reverse();
  return [fromPt, ...seq.map(q => ({ x: q.x, z: q.z })), toPt];
}
// Posloupnost bodů → mostové úsečky (fromInsert). Segmenty, které netvoří
// hrana destičky, ale stěna držáku (vše kromě segmentu u horního konce),
// dostanou fromHolder=true — dokončování je pak nepřeskakuje kvůli úhlovému
// rozsahu destičky (špička je po nich schopná sjet, držák kapsou projde).
function mkBridgeSegs(pts, upFirst = true) {
  const out = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1];
    if (Math.hypot(b.x - a.x, b.z - a.z) < 1e-6) continue;
    const seg = { type: 'line', p1: { x: a.x, z: a.z }, p2: { x: b.x, z: b.z }, fromInsert: true };
    const isEdgeSeg = upFirst ? k === 0 : k === pts.length - 2;
    if (pts.length > 2 && !isEdgeSeg) seg.fromHolder = true;
    out.push(seg);
  }
  return out;
}
function buildMachinableContour(segs, guides) {
  if (!guides || guides.length === 0) return segs;
  // Nejdřív drážky/kapsy ohraničené dvojicí mezních čar (V), pak jednotlivé.
  const pocket = mergePocketGuides(segs, guides);
  let result = pocket.result;
  // Potlačit náběhové čáry ležící ve stínu vyšší (rovnoběžné) čáry.
  const dominated = markDominatedGuides(guides, pocket.consumed);
  for (let gi = 0; gi < guides.length; gi++) {
    if (pocket.consumed.has(gi) || dominated.has(gi)) continue;
    const g = guides[gi];
    const A = { x: g.x1, z: g.z1 }, B = { x: g.x2, z: g.z2 };
    if (Math.hypot(A.x - B.x, A.z - B.z) < 0.5) continue;
    const lA = _locateOnContour(result, A), lB = _locateOnContour(result, B);
    if (lA && lB) {
      // Oba konce na kontuře → vyříznout úsek mezi nimi a nahradit mostem.
      result = bridgeBetweenContourPoints(result, A, B, lA, lB, g);
    } else if (lA || lB) {
      // Jeden konec mostu leží MIMO konturu (na polotovaru) — čelní zakončení,
      // náběhový stín, nebo prodloužení k okraji (viz bridgeFromContourToStock).
      result = bridgeFromContourToStock(result, g, A, B, lA, lB);
    }
  }
  // Odstranit nulové úsečky, které vzniknou split-em mostu PŘESNĚ na styku
  // dvou entit (setSegStart/End srazí dotčenou entitu na nulovou délku).
  // Bez toho kolem nich trimAndRemoveLoops vyrobí zpětný „trojúhelník"
  // (projevilo se na hrubování i dokončování u čela). chainBreak přeneseme
  // na následující úsek, ať se nepřeruší řetěz.
  for (let k = result.length - 1; k >= 0; k--) {
    const s = result[k];
    const sp = segStartPoint(s), ep = segEndPoint(s);
    if (Math.hypot(ep.x - sp.x, ep.z - sp.z) <= 1e-3) {
      if (s.chainBreak && k + 1 < result.length) result[k + 1].chainBreak = true;
      result.splice(k, 1);
    }
  }
  return result;
}
// Nejbližší průsečík paprsku (sx,sz)+t·(dirX,dirZ) se segmenty kontury a
// polotovaru (reálné souřadnice, X = rádius). exclude = {idx,isStock} segment
// k vynechání, nebo pole indexů do calc.worldPoints. calc nese worldPoints/
// stockWorldPoints. Vrací {x,z} | null. (Modulová verze — testovatelná.)
function camRayIntersection(sx, sz, dirX, dirZ, exclude, calc) {
  if (!calc) return null;
  let best = null, bestT = Infinity;
  const excludeSet = Array.isArray(exclude) ? new Set(exclude) : null;
  const consider = (px, pz) => {
    const t = (px - sx) * dirX + (pz - sz) * dirZ;
    if (t > 0.01 && t < bestT) { bestT = t; best = { x: px, z: pz }; }
  };
  const far = { x: sx + dirX * 1e5, z: sz + dirZ * 1e5 };
  const A1 = { x: sx, z: sz };
  const scan = (pts, isStock) => {
    if (!pts) return;
    for (let i = 1; i < pts.length; i++) {
      if (excludeSet) { if (!isStock && excludeSet.has(i)) continue; }
      else if (exclude && exclude.isStock === isStock && exclude.idx === i) continue;
      const p2 = pts[i], p1 = pts[i - 1];
      if (p2.type === 'G1') {
        const B1 = { x: p1.xReal, z: p1.zReal }, B2 = { x: p2.xReal, z: p2.zReal };
        const d = (A1.x - far.x) * (B1.z - B2.z) - (A1.z - far.z) * (B1.x - B2.x);
        if (Math.abs(d) < 1e-12) continue;
        const t = ((A1.x - B1.x) * (B1.z - B2.z) - (A1.z - B1.z) * (B1.x - B2.x)) / d;
        const u = ((A1.x - B1.x) * (A1.z - far.z) - (A1.z - B1.z) * (A1.x - far.x)) / d;
        if (u < -0.001 || u > 1.001) continue;
        consider(A1.x + t * (far.x - A1.x), A1.z + t * (far.z - A1.z));
      } else if (p2.type === 'G2' || p2.type === 'G3') {
        const arc = getArcParams({ x: p1.xReal, z: p1.zReal }, { x: p2.xReal, z: p2.zReal }, p2.rVal, p2.type);
        if (arc.error) continue;
        const hits = intersectLineCircle(A1, far, { x: arc.cx, z: arc.cz }, arc.r);
        if (!hits) continue;
        const sA = Math.atan2(p1.xReal - arc.cx, p1.zReal - arc.cz);
        const eA = Math.atan2(p2.xReal - arc.cx, p2.zReal - arc.cz);
        for (const q of hits) {
          const ang = Math.atan2(q.x - arc.cx, q.z - arc.cz);
          if (isAngleBetween(ang, sA, eA, p2.type === 'G2')) consider(q.x, q.z);
        }
      }
    }
  };
  scan(calc.worldPoints, false);
  scan(calc.stockWorldPoints, true);
  return best;
}
// ── Automatické mezní čáry hran destičky („kontura hotová") ──
// Pro každou souvislou skupinu interferenčních segmentů se spočítá přímka
// hrany destičky, která se regionu jen dotkne: dojezd = čelní hrana
// (natočení + ε), zanoření = spodní hrana (natočení). Od bodu dotyku se
// protáhne podél hrany k průsečíkům s konturou. Modulová, testovatelná
// funkce — vrací pole {x1,z1,x2,z2,kind}.
function computeInterferenceGuides(interferenceSegments, rawContourForInterference, clearance, prms, worldPoints, stockWorldPoints) {
  const interferenceGuides = [];
  if (!clearance || !interferenceSegments || interferenceSegments.length === 0) return interferenceGuides;

  const rotDegG = parseFloat(prms.toolAngle) || 0;
  const tipDegG = parseFloat(prms.toolTipAngle) || 90;
  const stockTopXG = (prms.stockMode === 'casting' && stockWorldPoints.length > 0)
    ? Math.max(...stockWorldPoints.map(p => p.xReal))
    : (parseFloat(prms.stockDiameter) || 100) / 2;
  // Nejnižší Z dílce (kontury) — pod něj se mezní čára netáhne (zadní čelo
  // polotovaru není řezná plocha).
  const minPartZG = worldPoints.length > 0 ? Math.min(...worldPoints.map(p => p.zReal)) : -1e9;
  // skupiny po sobě jdoucích interferenčních segmentů (pořadí kontury)
  const idxOf = new Map();
  rawContourForInterference.forEach((s, i) => idxOf.set(s, i));
  const sorted = [...interferenceSegments].sort((a, b) => idxOf.get(a) - idxOf.get(b));
  const groups = [];
  let curGrp = null, lastIdx = -10;
  for (const s of sorted) {
    const i = idxOf.get(s);
    if (!curGrp || i !== lastIdx + 1) { curGrp = []; groups.push(curGrp); }
    curGrp.push(s); lastIdx = i;
  }
  const sampleSeg = (seg) => {
    if (seg.type === 'line') return [seg.p1, seg.p2];
    const out = [];
    let sA = Math.atan2(seg.p1.x - seg.cx, seg.p1.z - seg.cz);
    let eA = Math.atan2(seg.p2.x - seg.cx, seg.p2.z - seg.cz);
    if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
    if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
    for (let s = 0; s <= 12; s++) {
      const a = sA + (eA - sA) * (s / 12);
      out.push({ x: seg.cx + Math.sin(a) * seg.r, z: seg.cz + Math.cos(a) * seg.r });
    }
    return out;
  };
  // Strana porušení rozsahu: low = normála pod rozsahem (čelní hrana,
  // dojezd), high = nad rozsahem (spodní hrana, zanoření).
  const isOuterArc = (seg) => Math.abs(seg.cx) < Math.abs((seg.p1.x + seg.p2.x) / 2);
  const devAtAngle = (seg, a) => normalizeAngle((isOuterArc(seg) ? a : a + Math.PI) - clearance.bisector);
  // Body segmentu, které SAMY (svou vlastní normálou) porušují danou
  // stranu rozsahu — u oblouku jen ta část, kde k interferenci skutečně
  // dochází, ne celý (třeba jen částečně postižený) oblouk.
  const violatingPts = (seg, wantLow) => {
    const bad = (dev) => wantLow ? dev < -clearance.halfRange - 1e-6 : dev > clearance.halfRange + 1e-6;
    if (seg.type === 'line') {
      const n = getNormal(seg.p1, seg.p2);
      if (n.x === 0 && n.z === 0) return [];
      return bad(normalizeAngle(vecAngle(n.x, n.z) - clearance.bisector)) ? [seg.p1, seg.p2] : [];
    }
    return sampleSeg(seg).filter(q => {
      const a = Math.atan2(q.x - seg.cx, q.z - seg.cz);
      return bad(devAtAngle(seg, a));
    });
  };
  const sideOf = (seg) => ({
    low: violatingPts(seg, true).length > 0,
    high: violatingPts(seg, false).length > 0,
  });
  // Průsečíky mezních čar hledáme JEN na kontuře — obrys polotovaru
  // není obráběný povrch (čára by se jinak táhla třeba až k ose X0).
  const localCalc = { worldPoints, stockWorldPoints: [] };
  // Pro DOLNÍ (nájezdový) konec mezní čáry hledáme průsečík s konturou
  // I s polotovarem — čára se prodlouží až o skutečnou hranu materiálu.
  const localCalcDown = { worldPoints, stockWorldPoints };
  for (const grp of groups) {
    // Body se sbírají odděleně pro dojezd (low) a zanoření (high) —
    // pokud skupina porušuje rozsah na obě strany různými segmenty,
    // body z "druhé" hrany by mohly přebít dotykový bod téhle hrany.
    const lowPts = [], highPts = [];
    let low = false, high = false;
    grp.forEach(s => {
      const sd = sideOf(s);
      if (sd.low) { low = true; lowPts.push(...violatingPts(s, true)); }
      if (sd.high) { high = true; highPts.push(...violatingPts(s, false)); }
    });
    // Při ray-castu vynechat segmenty téhle skupiny — dotykový bod
    // může ležet na oblouku skupiny a paprsek by jinak mohl narazit
    // zpět na stejný oblouk místo na navazující konturu.
    // Pozor: idxOf vrací index v rawContourForInterference (= contourSegments),
    // ale camRayIntersection prochází worldPoints (jiná indexace, G0 body navíc).
    // Správné vyloučení: použít s.orig, které odkazuje přímo na worldPoints[k].
    const excludeIdx = grp.map(s => {
      // origIdx je číselný index p2 ve worldPoints — přežije structuredClone
      // (rawContourForInterference je hluboká kopie, takže `orig` reference je
      // jiný objekt a worldPoints.indexOf(s.orig) vrací −1 → padalo to na
      // chybný fallback idxOf+1, který nepočítá s G0 body navíc → vyloučil se
      // CIZÍ segment a paprsek pak přeletěl přes blokující vrchol).
      if (Number.isInteger(s.origIdx)) return s.origIdx;
      if (s.orig) {
        const idx = worldPoints.indexOf(s.orig);
        if (idx >= 0) return idx;
      }
      return idxOf.get(s) + 1; // fallback pro mostové segmenty bez orig
    });
    const addGuide = (betaDeg, kind, pts) => {
      const b = betaDeg * Math.PI / 180;
      const sb = Math.sin(b), cb = Math.cos(b);
      // Normála čáry na stranu vzduchu (+X nahoru). Dotyk = bod regionu
      // nejdál ve směru této normály — u dojezdu tečna/roh na pravé
      // straně regionu, u zanoření horní hrana (rim) kapsy.
      let nx = -cb, nz = sb;
      if (nx < 0 || (Math.abs(nx) < 1e-9 && nz < 0)) { nx = -nx; nz = -nz; }
      let best = null, bestG = -Infinity;
      let topX = -Infinity, botX = Infinity;
      pts.forEach(q => {
        const g = q.x * nx + q.z * nz;
        if (g > bestG) { bestG = g; best = q; }
        if (q.x > topX) topX = q.x;
        if (q.x < botX) botX = q.x;
      });
      // Přesný tečný bod oblouku (maximum projekce po celé kružnici) —
      // pokud padne do úhlového rozsahu tohoto oblouku, je to přesnější
      // dotykový bod než vzorkované body (tečna na zakřivené kontuře).
      grp.forEach(s => {
        if (s.type !== 'arc') return;
        const sd = sideOf(s);
        if ((kind === 'dojezd' && !sd.low) || (kind === 'zanoreni' && !sd.high)) return;
        const tx = s.cx + s.r * nx, tz = s.cz + s.r * nz;
        const ang = Math.atan2(tx - s.cx, tz - s.cz);
        const dev = devAtAngle(s, ang);
        const violates = kind === 'dojezd' ? dev < -clearance.halfRange - 1e-6 : dev > clearance.halfRange + 1e-6;
        const within = violates && isAngleBetween(ang, s.startAngle, s.endAngle, s.dir === 'G2');
        if (within) {
          const g = tx * nx + tz * nz;
          if (g > bestG) { bestG = g; best = { x: tx, z: tz }; }
          if (tx > topX) topX = tx;
          if (tx < botX) botX = tx;
        }
      });
      if (!best) return;
      // Dolní konec: PRIMÁRNĚ průsečík s KONTUROU. Mezní čára by měla končit
      // na kontuře, aby ji buildMachinableContour přemostil. Když ale pod
      // dotykem žádná kontura není (typicky u kraje dílu, kde za polotovarem
      // už nic není), skončí čára na hraně POLOTOVARU — a označí se
      // downOnStock, aby se BRALA jen jako VIZUALIZACE (nepřemosťuje konturu,
      // takže se dráhy nemění, ale uživatel čáru vidí až k hraně materiálu).
      // NEvynecháváme segmenty skupiny — nájezdový tečný bod často leží právě
      // na nich (boční oblouček u nájezdu), takže s exclude paprsek konturu mine.
      // Dolní konec: sleduje se ODRAŽENÁ SILUETA nástroje ukotvená v dotykovém
      // bodě (P_k = best − S_k): nejdřív hrana destičky (jen do Délky hrany,
      // je-li zadán držák), pak přechod na roh držáku a svisle dolů podél jeho
      // stěny. Bez držáku (profil null) zůstává jediný nekonečný paprsek podél
      // hrany — původní chování. První průsečík segmentů s konturou = dolní
      // konec mezní čáry; projité lomové vrcholy se uloží do `via` (mezní čára
      // je pak lomená a most po ní smí sjet hlouběji do kapsy).
      // Hranice hlídání = hrana destičky → čára „zbývající stěna/kůra
      // polotovaru posunutá o holderWidth" (buildHolderBoundaryPts, dle
      // nákresu). Platí pro obě strany (zanoření i dojezd) — v kapse drží
      // dno obrobitelné z obou stěn. Bez držáku (nebo bez stěny/polotovaru
      // k opření) = nekonečná přímka podél hrany (staré chování).
      const boundaryPts = buildHolderBoundaryPts(best, grp, prms, sb, cb, stockWorldPoints);
      const walkSilhouette = (calcLoc) => {
        const pts = boundaryPts
          || [{ x: best.x, z: best.z }, { x: best.x - sb * 1e5, z: best.z - cb * 1e5 }];
        const via = [];
        for (let k = 0; k + 1 < pts.length; k++) {
          const a = pts[k], b2 = pts[k + 1];
          const dx = b2.x - a.x, dz = b2.z - a.z;
          const len = Math.hypot(dx, dz);
          if (len < 1e-6) continue;
          const ux = dx / len, uz = dz / len;
          let hit = camRayIntersection(a.x, a.z, ux, uz, null, calcLoc);
          if (hit) {
            const t = (hit.x - a.x) * ux + (hit.z - a.z) * uz;
            if (t <= len + 1e-6) {
              // Odlitkový polotovar má jako uzavírací hrany i OSU (X=0) a ZADNÍ
              // čelo (z < min Z kontury), což nejsou řezné plochy. Dopad na osu
              // zahodit (ukončí hledání — níž už je jen osa); dopad pod konec
              // dílce oříznout přesně na konec dílce po směru segmentu.
              // VÝJIMKA: dotykový bod SÁM na konci dílce (levé/zadní čelo) —
              // viz komentář u downOnStock níže; tam se neořezává.
              if (Math.abs(hit.x) < 0.1 && best.x > 0.5) return { rejected: true };
              if (hit.z < minPartZG - 0.5 && best.z > minPartZG + 0.5) {
                const tz = uz < -0.01 ? (a.z - minPartZG) / -uz : -1;
                hit = (tz > 0.01 && tz <= len) ? { x: a.x + ux * tz, z: minPartZG } : { x: a.x, z: a.z };
              }
              return { down: hit, via };
            }
          }
          via.push({ x: b2.x, z: b2.z });
        }
        return null;
      };
      // Mezní čára by měla končit na KONTUŘE; když pod dotykem žádná kontura
      // není (typicky u kraje dílu), skončí na hraně POLOTOVARU a označí se
      // downOnStock (jen vizualizace / čelní zakončení — viz buildMachinable).
      let downOnStock = false;
      let walk = walkSilhouette(localCalc);
      if (!walk) {
        // Bez JAKÉHOKOLI dopadu na konturu zkusit i hranu polotovaru.
        // (Dopad zahozený osní pojistkou — rejected — fázi s polotovarem
        // nespouští, stejně jako původní přímá varianta.)
        walk = walkSilhouette(localCalcDown);
        if (walk && walk.down) downOnStock = true;
      }
      let down = (walk && walk.down) ? walk.down : null;
      let via = (walk && walk.down) ? walk.via : [];
      if (!down) {
        via = [];
        const t = sb > 0.01 ? (best.x - botX) / sb : 0;
        down = t > 0.01 ? { x: best.x - sb * t, z: best.z - cb * t } : best;
      }
      // Horní konec: průsečík s konturou; bez něj skončit u vršku
      // regionu (NEprotahovat k hornímu okraji polotovaru).
      let up = camRayIntersection(best.x, best.z, sb, cb, excludeIdx, localCalc);
      // Dopad DALEKO od kotevní skupiny (paprsek přeletěl vzduchem přes jinou
      // část dílu — např. z levého čela až na protější čelo) = falešný horní
      // konec: čára by se táhla napříč dílem, stínová dominance by zabila
      // jiné čáry a most by odřízl půlku kontury. Přijmout jen dopad na
      // segmentu v sousedství skupiny (±3 v pořadí kontury).
      if (up) {
        const upLoc = _locateOnContour(rawContourForInterference, up);
        const nearGrp = upLoc && grp.some(s => Math.abs(idxOf.get(s) - upLoc.segIdx) <= 3);
        if (!nearGrp) up = null;
      }
      if (!up) {
        let capX = Math.min(topX, stockTopXG);
        // Čára z nižší skupiny (menší X) nesmí přesáhnout "dolní konec" (x1)
        // čáry z dřívější (vyšší) skupiny stejného druhu — jinak by nižší bod
        // generoval čáru, která na obrazovce vypadá výš než vyšší bod (bug).
        for (const pg of interferenceGuides) {
          // U lomené čáry (držák) je „dolní konec hrany destičky" první via
          // vrchol — hlubší (svislá) část stínu jiné čáry neomezuje.
          const pgLowX = (pg.via && pg.via.length) ? pg.via[0].x : pg.x1;
          if (pg.kind === kind && pgLowX < capX) capX = pgLowX;
        }
        const t = sb > 0.01 ? (capX - best.x) / sb : 0;
        up = t > 0.01 ? { x: best.x + sb * t, z: best.z + cb * t } : best;
      }
      if (!via.length && Math.hypot(up.x - down.x, up.z - down.z) < 0.5) return;
      const dup = interferenceGuides.some(g =>
        Math.hypot(g.x1 - down.x, g.z1 - down.z) < 0.5 && Math.hypot(g.x2 - up.x, g.z2 - up.z) < 0.5);
      if (!dup) {
        const g = { x1: down.x, z1: down.z, x2: up.x, z2: up.z, kind, downOnStock };
        // Lomová místa siluety (konec hrany destičky, roh držáku) — jen ta
        // NAD dolním koncem; poslední vrchol shodný s dolním koncem vynechat.
        if (via.length) g.via = via.filter(q => Math.hypot(q.x - down.x, q.z - down.z) > 0.05 && q.x > down.x - 1e-6);
        if (g.via && !g.via.length) delete g.via;
        interferenceGuides.push(g);
      }
    };
    if (low) addGuide(rotDegG + tipDegG, 'dojezd', lowPts);
    if (high) addGuide(rotDegG, 'zanoreni', highPts);
  }
  return interferenceGuides;
}
function getSegEnd(seg) {
  if (seg.type === 'line') return seg.p2;
  return { x: seg.cx + Math.sin(seg.endAngle) * seg.r, z: seg.cz + Math.cos(seg.endAngle) * seg.r };
}
function getSegStart(seg) {
  if (seg.type === 'line') return seg.p1;
  return { x: seg.cx + Math.sin(seg.startAngle) * seg.r, z: seg.cz + Math.cos(seg.startAngle) * seg.r };
}
function getArcParams(p1, p2, r, type) {
  if (!p1 || !p2) return { error: true, cx: 0, cz: 0, r: 0 };
  const d2 = Math.pow(p2.x - p1.x, 2) + Math.pow(p2.z - p1.z, 2), d = Math.sqrt(d2);
  const isLongArc = r < 0;
  const absR = Math.abs(r);
  let safeR = absR, error = false;
  if (d2 === 0) return { error: true, cx: p1.x, cz: p1.z, r: 0 };
  if (absR < d / 2 - 0.001) { error = true; safeR = d / 2 + 0.001; }
  const mx = (p1.x + p2.x) / 2, mz = (p1.z + p2.z) / 2;
  const h = Math.sqrt(Math.max(0, safeR * safeR - d2 / 4));
  const dx = p2.x - p1.x, dz = p2.z - p1.z;
  const ox = -dz / d, oz = dx / d;
  let sign = (type === 'G3') ? -1 : 1;
  if (isLongArc) sign *= -1;
  const cx = mx + sign * h * ox, cz = mz + sign * h * oz;
  if (isNaN(cx) || isNaN(cz)) return { error: true, cx: 0, cz: 0, r: 0 };
  return { cx, cz, r: safeR, error };
}
// isAngleBetween → přesunuto do cam/camMath.js
function intersectHorizontalLineSegment(xLine, p1, p2) {
  if (!p1 || !p2) return null;
  const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x);
  if (xLine < minX || xLine > maxX) return null;
  if (Math.abs(p2.x - p1.x) < 1e-6) return null;
  const t = (xLine - p1.x) / (p2.x - p1.x);
  return p1.z + t * (p2.z - p1.z);
}
function intersectHorizontalLineArc(xLine, center, radius) {
  if (!center) return [];
  const term = radius * radius - Math.pow(xLine - center.x, 2);
  if (term < 0) return [];
  const sqrtTerm = Math.sqrt(term);
  return [center.z - sqrtTerm, center.z + sqrtTerm];
}
// intersectVerticalLineSegment, intersectVerticalLineArc → přesunuto do cam/camMath.js
// X-ové průsečíky segmentu (line/arc) se svislou čarou Z = zVal — pro
// nalezení bodu polotovaru na limitu čelistí/koníku.
function intersectSegAtZ(seg, zVal) {
  if (seg.type === 'line') {
    const x = intersectVerticalLineSegment(zVal, seg.p1, seg.p2);
    return x === null ? [] : [x];
  }
  if (seg.type === 'arc') {
    return intersectVerticalLineArc(zVal, { x: seg.cx, z: seg.cz }, seg.r).filter(x => {
      const a = Math.atan2(x - seg.cx, zVal - seg.cz);
      return isAngleBetween(a, seg.startAngle, seg.endAngle, seg.dir === 'G2');
    });
  }
  return [];
}

// ── Shared offset trimming + loop removal ──────────────────────
function findSegIntersection(s1, s2) {
  if (s1.type === 'line' && s2.type === 'line') {
    return intersectLines(s1.p1, s1.p2, s2.p1, s2.p2);
  }
  if (s1.type === 'line' && s2.type === 'arc') {
    const ints = intersectLineCircle(s1.p1, s1.p2, { x: s2.cx, z: s2.cz }, s2.r);
    if (ints && ints.length > 0) {
      const ref = getSegEnd(s1);
      const d0 = Math.hypot(ints[0].x - ref.x, ints[0].z - ref.z);
      const d1 = Math.hypot(ints[1].x - ref.x, ints[1].z - ref.z);
      return d0 < d1 ? ints[0] : ints[1];
    }
    return null;
  }
  if (s1.type === 'arc' && s2.type === 'line') {
    const ints = intersectLineCircle(s2.p1, s2.p2, { x: s1.cx, z: s1.cz }, s1.r);
    if (ints && ints.length > 0) {
      const ref = getSegStart(s2);
      const d0 = Math.hypot(ints[0].x - ref.x, ints[0].z - ref.z);
      const d1 = Math.hypot(ints[1].x - ref.x, ints[1].z - ref.z);
      return d0 < d1 ? ints[0] : ints[1];
    }
    return null;
  }
  if (s1.type === 'arc' && s2.type === 'arc') {
    const ints = intersectCircleCircle(s1.cx, s1.cz, s1.r, s2.cx, s2.cz, s2.r);
    if (ints && ints.length > 0) {
      const ref1 = getSegEnd(s1);
      const ref2 = getSegStart(s2);
      let best = null, bestD = Infinity;
      for (const pt of ints) {
        const d = Math.hypot(pt.x - ref1.x, pt.z - ref1.z) + Math.hypot(pt.x - ref2.x, pt.z - ref2.z);
        if (d < bestD) { bestD = d; best = pt; }
      }
      return best;
    }
    return null;
  }
  return null;
}
function setSegEnd(seg, pt) {
  if (seg.type === 'line') seg.p2 = pt;
  else seg.endAngle = Math.atan2(pt.x - seg.cx, pt.z - seg.cz);
}
function setSegStart(seg, pt) {
  if (seg.type === 'line') seg.p1 = pt;
  else seg.startAngle = Math.atan2(pt.x - seg.cx, pt.z - seg.cz);
}
function isOnSegBounds(pt, seg) {
  if (seg.type === 'line') {
    return pt.x >= Math.min(seg.p1.x, seg.p2.x) - TRIM_TOL &&
      pt.x <= Math.max(seg.p1.x, seg.p2.x) + TRIM_TOL &&
      pt.z >= Math.min(seg.p1.z, seg.p2.z) - TRIM_TOL &&
      pt.z <= Math.max(seg.p1.z, seg.p2.z) + TRIM_TOL;
  }
  // Oblouk: průsečík (z protnutí line↔KRUŽNICE / circle↔circle) musí ležet na
  // samotném OBLOUKU — na kružnici (v toleranci) a v jeho úhlovém rozsahu.
  // Bez této kontroly projde i průsečík na prodloužení kružnice mimo oblouk
  // (falešná smyčka → vyříznutí reálné geometrie, např. stěn zápichu před
  // navazujícím rádiusem). Dřív funkce pro oblouk vracela vždy true.
  if (typeof seg.startAngle !== 'number' || typeof seg.endAngle !== 'number') return true;
  const d = Math.hypot(pt.x - seg.cx, pt.z - seg.cz);
  if (Math.abs(d - seg.r) > TRIM_TOL) return false;
  const a = Math.atan2(pt.x - seg.cx, pt.z - seg.cz);
  return isAngleBetween(a, seg.startAngle, seg.endAngle, seg.dir === 'G2');
}
// Minimální vzdálenost průsečíku od endpointu, kterou požadujeme pro
// global loop-removal. Nižší hodnota → loop-removal eliminuje legitimní
// malé oblouky mezi dlouhými segmenty (intersection padne těsně za
// trimnutý konec line, ale je to falešná smyčka, ne skutečné self-cross).
const LOOP_INTERIOR_MIN = 0.1;
// Striktní kontrola, že bod leží UVNITŘ úsečky (parametr t ∈ [0,1]), ne na
// jejím prodloužení. isOnSegBounds používá obdélníkovou toleranci TRIM_TOL
// (0.5 mm) kvůli offsetovým zaokrouhlením — na RAW kontuře ale `intersectLines`
// vrací průsečík NEKONEČNÝCH přímek, takže bod 0,1–0,5 mm za koncem úsečky
// (typicky prodloužení zkosení za čelo) projde jako falešná „smyčka" a
// removeContourSelfIntersections vyřízne reálnou geometrii (sražení). Tahle
// kontrola promítne bod na úsečku a ověří, že je opravdu mezi koncovými body.
function isWithinSegStrict(pt, seg) {
  if (seg.type !== 'line') return isOnSegBounds(pt, seg);
  const dx = seg.p2.x - seg.p1.x, dz = seg.p2.z - seg.p1.z;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-12) return false;
  const t = ((pt.x - seg.p1.x) * dx + (pt.z - seg.p1.z) * dz) / len2;
  return t >= -1e-6 && t <= 1 + 1e-6;
}
function segEndPoint(seg) {
  if (seg.type === 'line') return seg.p2;
  return { x: seg.cx + Math.sin(seg.endAngle) * seg.r, z: seg.cz + Math.cos(seg.endAngle) * seg.r };
}
function segStartPoint(seg) {
  if (seg.type === 'line') return seg.p1;
  return { x: seg.cx + Math.sin(seg.startAngle) * seg.r, z: seg.cz + Math.cos(seg.startAngle) * seg.r };
}
// Po úpravě startAngle/endAngle obloukového segmentu (setSegEnd/setSegStart)
// dosynchronizuje p1/p2 — u raw kontury slouží jako reference pro isOuter
// detekci offsetu i pro zobrazení, takže musí odpovídat novým úhlům.
function syncArcEndpoints(seg) {
  if (seg.type !== 'arc') return;
  seg.p1 = segStartPoint(seg);
  seg.p2 = segEndPoint(seg);
}
// Obrátí směr průchodu segmentem (prohodí start↔konec). Geometrie zůstává,
// mění se jen orientace: u oblouku prohodí úhly a překlopí G2↔G3.
function reverseSeg(seg) {
  const t = seg.p1; seg.p1 = seg.p2; seg.p2 = t;
  if (seg.type === 'arc') {
    const ta = seg.startAngle; seg.startAngle = seg.endAngle; seg.endAngle = ta;
    seg.dir = seg.dir === 'G2' ? 'G3' : 'G2';
  }
}
// Degenerovaný zbytkový oblouk (po ořezu/loop-removalu): jeho začátek a konec
// téměř splývají (malá tětiva). Buď nulový zlomek, nebo — což je horší — oblouk,
// kterému ořez nastavil úhly tak, že obíhá skoro DOKOLA (sweep ≈ 2π). V náhledu
// se kreslí jako PLNÁ KRUŽNICE a v G-kódu se start==konec (po zaokrouhlení) →
// „G2/G3 …CR=" z bodu do sebe = celá kružnice. U soustružnického profilu je
// splývající začátek/konec vždy chyba (reálné oblouky mají konce znatelně od
// sebe), tak ho nahradíme přímou úsečkou start→konec (zachová napojení).
function dropTinyArcs(path) {
  if (!path) return path;
  for (let i = 0; i < path.length; i++) {
    const s = path[i];
    if (!s || s.type !== 'arc') continue;
    const a = segStartPoint(s), b = segEndPoint(s);
    if (Math.hypot(a.x - b.x, a.z - b.z) < 0.2) {
      const line = { type: 'line', p1: a, p2: b };
      if (s.chainBreak) line.chainBreak = true;
      if (s.unreachable) line.unreachable = true;
      if (s.isDegenerate) line.isDegenerate = true;
      path[i] = line;
    }
  }
  return path;
}
// Sjednotí SMĚR průchodu kontury: každý segment se orientuje tak, aby jeho
// začátek navazoval na konec předchozího. Entita nakreslená „pozpátku" (konec
// blíž k předchozímu konci než začátek) se otočí. Bez toho offsetový trimmer
// (spojuje konec→začátek) takovou entitu nenaváže a zahodí ji — typicky oblouk
// nakreslený obráceným směrem zmizí z dráhy. Mění jen orientaci, ne geometrii;
// správně nakreslené kontury (start už navazuje) nechá beze změny. TOL malá,
// ať se nepřeklopí samostatný řetěz (G0 mezera) — tam navazuje až další pas.
function normalizeContourDirection(segs) {
  const TOL = 0.05;
  // Pass 1: otočení segmentu, jehož KONEC je blíž k předchozímu konci než START
  for (let i = 1; i < segs.length; i++) {
    const prevEnd = segEndPoint(segs[i - 1]);
    const st = segStartPoint(segs[i]);
    const en = segEndPoint(segs[i]);
    const dStart = Math.hypot(prevEnd.x - st.x, prevEnd.z - st.z);
    const dEnd = Math.hypot(prevEnd.x - en.x, prevEnd.z - en.z);
    if (dEnd + 1e-9 < dStart && dEnd < TOL) reverseSeg(segs[i]);
  }
  // Pass 2: "sdílený start" — segment[i] začíná NA STEJNÉM BODĚ jako segment[i-1],
  // ale nenavazuje na jeho KONEC. Typický případ: čelní úsek nakreslený dovnitř
  // od téhož rohu, odkud vychází zkosení. Otočení čelního úseku + přesun před
  // zkosení vytvoří průběžný řetěz: čelo_ven → zkosení → tělo.
  // Pass 2 — rozšířený look-back: kromě segs[i-1] kontrolujeme i segs[i-2].
  // Případ: rozděleného čela (dvě úsečky na stejné ose). Po otočení první
  // poloviny a jejím přesunutí před zeď se druhá polovina ocitne dvě pozice
  // za otočenou první, takže segs[i-1] je zeď a shoda se nenajde. Pohled na
  // segs[i-2] (= právě přesunutá první polovina) ji odhalí a opraví.
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 1; i < segs.length; i++) {
      const st = segStartPoint(segs[i]);
      const en = segEndPoint(segs[i]);
      // Segment jdoucí k NIŽŠÍMU Z (klesající Z = správný směr chodu kontury
      // od čela k lunete). Takový segment neobracej — je správně orientován.
      // Příklad: bridge čára (5,46)→(9.287,30) sdílí start s wall1 (5,46),
      // ale je to záměrná dráha klouzající k hloubce → neobrátit.
      if (en.z < st.z - TOL) continue;
      // Zkontrolovat segs[i-1] a případně segs[i-2]
      const maxBack = Math.min(2, i);
      for (let back = 1; back <= maxBack; back++) {
        const prevSt = segStartPoint(segs[i - back]);
        const prevEn = segEndPoint(segs[i - back]);
        const dStartToPrevStart = Math.hypot(st.x - prevSt.x, st.z - prevSt.z);
        const dStartToPrevEnd   = Math.hypot(st.x - prevEn.x, st.z - prevEn.z);
        if (dStartToPrevStart < TOL && dStartToPrevEnd > TOL) {
          reverseSeg(segs[i]);
          const seg = segs.splice(i, 1)[0];
          segs.splice(i - back, 0, seg); // vložit před segment, jehož start sdílíme
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }
  return segs;
}
// Vrátí true, pokud bod leží uvnitř segmentu (ne na/blízko jeho koncových
// bodů) — používá se pro detekci "mostu": nově přidaného segmentu, jehož oba
// konce dopadají do vnitřku jiných segmentů kontury (ne na jejich konce).
function pointOnSegInterior(pt, seg) {
  if (seg.type === 'line') {
    const { p1, p2 } = seg;
    const dx = p2.x - p1.x, dz = p2.z - p1.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-9) return false;
    const cross = Math.abs((pt.x - p1.x) * dz - (pt.z - p1.z) * dx) / len;
    if (cross > TRIM_TOL) return false;
    const t = ((pt.x - p1.x) * dx + (pt.z - p1.z) * dz) / (len * len);
    if (t * len < LOOP_INTERIOR_MIN || (1 - t) * len < LOOP_INTERIOR_MIN) return false;
    return true;
  } else {
    const d = Math.hypot(pt.x - seg.cx, pt.z - seg.cz);
    if (Math.abs(d - seg.r) > TRIM_TOL) return false;
    const a = Math.atan2(pt.x - seg.cx, pt.z - seg.cz);
    if (!isAngleBetween(a, seg.startAngle, seg.endAngle, seg.dir === 'G2')) return false;
    const sp = segStartPoint(seg), ep = segEndPoint(seg);
    if (Math.hypot(pt.x - sp.x, pt.z - sp.z) < LOOP_INTERIOR_MIN) return false;
    if (Math.hypot(pt.x - ep.x, pt.z - ep.z) < LOOP_INTERIOR_MIN) return false;
    return true;
  }
}
// Vyhledá "mostové" segmenty — nově nakreslené úseky, které na konturu
// nenavazují v pořadí kreslení (G0 mezera před i po), ale oba jejich konce
// geometricky dopadají do vnitřku dvou jiných segmentů kontury. Takový
// segment se vloží na své geometrické místo místo úseku, který "přemosťuje" —
// ten (a segmenty mezi ním) se z hlavní kontury odstraní.
function spliceBridgeSegments(segs) {
  let result = segs.map(s => structuredClone(s));
  for (let bi = 0; bi < result.length; bi++) {
    if (result.length < 2) break;
    const bridge = result[bi];
    if (bridge.isDegenerate) continue;
    const bStart = segStartPoint(bridge);
    const bEnd = segEndPoint(bridge);
    const prevConnected = bi > 0 &&
      Math.hypot(segEndPoint(result[bi - 1]).x - bStart.x, segEndPoint(result[bi - 1]).z - bStart.z) < 1e-4;
    const nextConnected = bi < result.length - 1 &&
      Math.hypot(segStartPoint(result[bi + 1]).x - bEnd.x, segStartPoint(result[bi + 1]).z - bEnd.z) < 1e-4;
    if (prevConnected && nextConnected) continue;

    let aIdx = -1, bIdx = -1;
    for (let k = 0; k < result.length; k++) {
      if (k === bi) continue;
      if (!prevConnected && aIdx === -1 && pointOnSegInterior(bStart, result[k])) aIdx = k;
      if (!nextConnected && bIdx === -1 && pointOnSegInterior(bEnd, result[k])) bIdx = k;
    }
    if (prevConnected) aIdx = bi - 1;
    if (nextConnected) bIdx = bi + 1;
    if (aIdx === -1 || bIdx === -1 || aIdx === bIdx) continue;

    const segA = result[aIdx], segB = result[bIdx];
    if (!prevConnected) { setSegEnd(segA, bStart); syncArcEndpoints(segA); }
    if (!nextConnected) { setSegStart(segB, bEnd); syncArcEndpoints(segB); }

    const lo = Math.min(aIdx, bIdx), hi = Math.max(aIdx, bIdx);
    const newArr = [];
    for (let k = 0; k < result.length; k++) {
      if (k === bi) continue;
      if (k > lo && k < hi) continue;
      newArr.push(result[k]);
      if (k === aIdx) newArr.push(bridge);
    }
    return spliceBridgeSegments(newArr);
  }
  return result;
}
// Odstranění samoprotnutí raw kontury (bez tool-offsetu). Narozdíl od
// trimAndRemoveLoops (offset trimming) zde NEKONTROLUJEME směr segmentů —
// segmenty raw kontury na sebe vždy přímo navazují (žádné spurious
// near-touches po zaoblení rohu jako u offsetu), takže jakékoliv geometrické
// Profilování kontury průchodem grafu — v každém bodě kde z něj vychází
// dvě cesty vybere tu vnější (vyšší X = větší poloměr na soustruhu).
// Fotky/případy uživatele:
//   1. Bod se dvěma výstupy: nahoru (vyšší X) vs dolů → vybere nahoru.
//   2. Bod 21→20 vs 21→dolu → vybere 20 (vyšší X).
//   3. Bod 23: větev po mezní čáře destičky (fromInsert) vs oblouk → vybere mezní čáru.
//   4. Bod 24: oblouk nahoru (vyšší X na start) vs dolů → vybere nahoru.
// Vrací { segs: výsledné segmenty, hadBranches: zda byly větvení }.
function resolveOuterProfile(segs) {
  if (!segs || segs.length <= 2) return { segs, hadBranches: false };
  const TOL = 0.02;
  const ptKey = (p) => `${Math.round(p.x / TOL)},${Math.round(p.z / TOL)}`;
  const segSt = (s) => s.type === 'line' ? s.p1
    : { x: s.cx + Math.sin(s.startAngle) * s.r, z: s.cz + Math.cos(s.startAngle) * s.r };
  const segEn = (s) => s.type === 'line' ? s.p2
    : { x: s.cx + Math.sin(s.endAngle) * s.r, z: s.cz + Math.cos(s.endAngle) * s.r };

  // Pre-split: pokud endpoint jiného segmentu padá na interior LINE segmentu,
  // rozdělíme ho tam — aby traversal mohl pokračovat z bridgových koncových bodů.
  // Příklad: bridge (5,46)→(9.287,30) končí uvnitř face_bot (8,30)→(10,30).
  // Face_bot se splitne na (8,30)→(9.287,30) + (9.287,30)→(10,30),
  // takže traversal po bridge najde cestu (9.287,30)→(10,30).
  const splitSegs = [];
  for (let si = 0; si < segs.length; si++) {
    const seg = segs[si];
    if (seg.isDegenerate || seg.type !== 'line') { splitSegs.push(seg); continue; }
    let cur2 = seg;
    for (let sj = 0; sj < segs.length; sj++) {
      if (sj === si) continue;
      const endPt = segEn(segs[sj]);
      const dx = cur2.p2.x - cur2.p1.x, dz = cur2.p2.z - cur2.p1.z;
      const len2 = dx * dx + dz * dz;
      if (len2 < 1e-10) continue;
      const t = ((endPt.x - cur2.p1.x) * dx + (endPt.z - cur2.p1.z) * dz) / len2;
      if (t < 0.05 || t > 0.95) continue;
      const cross = Math.abs((endPt.x - cur2.p1.x) * dz - (endPt.z - cur2.p1.z) * dx) / Math.sqrt(len2);
      if (cross > TOL * 2) continue;
      // endPt leží uvnitř cur2 — split na dvě části
      const snap = { x: cur2.p1.x + t * dx, z: cur2.p1.z + t * dz };
      splitSegs.push({ ...cur2, p2: snap });
      cur2 = { ...cur2, p1: snap };
    }
    splitSegs.push(cur2);
  }

  // Sestavit mapu: klíč počátečního bodu → [segmenty odcházející z něho].
  // Degenerované segmenty (start == konec, např. duplicitní bod z CADu)
  // vynechat — jinak by v uzlu vystupovaly jako falešná větev.
  const startMap = new Map();
  const endKeys = new Set();
  for (const seg of splitSegs) {
    const stK = ptKey(segSt(seg)), enK = ptKey(segEn(seg));
    if (seg.isDegenerate || stK === enK) continue;
    if (!startMap.has(stK)) startMap.set(stK, []);
    startMap.get(stK).push(seg);
    endKeys.add(enK);
  }
  const hadBranches = [...startMap.values()].some(arr => arr.length > 1);
  if (!hadBranches) return { segs, hadBranches: false };

  // X na začátku segmentu (pro výběr vnější větve):
  // u oblouku vezmeme X v 10 % délky, aby šlo detekovat směr zakřivení
  const getInitX = (s) => {
    if (s.type === 'arc') {
      const a = s.startAngle + (s.endAngle - s.startAngle) * 0.1;
      return s.cx + Math.sin(a) * s.r;
    }
    return segEn(s).x;
  };

  // Seedy řetězců: body, které NEJSOU koncem žádného segmentu = začátek
  // souvislého řetězce (první bod kontury nebo bod hned za G0 mezerou).
  // Kontura bývá rozdělená G0 přeskoky na víc nesouvislých řetězců —
  // každý profilujeme zvlášť a spojíme (jinak by se traversal utnul na
  // první mezeře a vrátil jen pár prvních segmentů).
  const seedKeys = [];
  const seenSeed = new Set();
  for (const seg of splitSegs) {
    const stK = ptKey(segSt(seg));
    if (seg.isDegenerate || stK === ptKey(segEn(seg))) continue;
    if (!endKeys.has(stK) && !seenSeed.has(stK)) { seenSeed.add(stK); seedKeys.push(stK); }
  }
  // Fallback: pokud nemá kontura žádný „volný" začátek (čistě uzavřená
  // smyčka), startovat od prvního segmentu jako dřív.
  if (seedKeys.length === 0) seedKeys.push(ptKey(segSt(segs[0])));

  // Průchod grafem od daného bodu, výběr vnější větve v každém uzlu
  const result = [];
  const visited = new Set();
  const maxSteps = splitSegs.length * 2 + 5;
  let firstChain = true;
  for (const seedK of seedKeys) {
    if (visited.has(seedK) || !startMap.has(seedK)) continue;
    let cur = seedK;
    let firstOfChain = true;
    for (let step = 0; step < maxSteps; step++) {
      const k = cur;
      if (visited.has(k)) break;
      visited.add(k);
      const cands = startMap.get(k) || [];
      if (!cands.length) break;

      let chosen;
      if (cands.length === 1) {
        chosen = cands[0];
      } else {
        // Pravidlo 0: vyloučit větve jejichž cílový bod je již navštívený
        // — takový segment vede zpátky do uzavřené smyčky/kapsy a ne ven
        // na vnější profil (platí i když má vyšší X než správná větev).
        const nonCycling = cands.filter(s => !visited.has(ptKey(segEn(s))));
        const pool = nonCycling.length > 0 ? nonCycling : cands;
        // Pravidlo 1: upřednostnit segment z Hlídání geometrie (fromInsert)
        const insertSeg = pool.find(s => s.fromInsert);
        if (insertSeg) {
          chosen = insertSeg;
        } else {
          // Pravidlo 2: vybrat větev s nejvyšším X (vnějšek soustruhu)
          chosen = pool.reduce((best, s) => getInitX(s) > getInitX(best) ? s : best);
        }
      }
      // První segment řetězce za G0 mezerou označit chainBreak — dráha
      // sem najede rychloposuvem (mezi řetězci se neřeže spojnice).
      if (firstOfChain && !firstChain) chosen = { ...chosen, chainBreak: true };
      result.push(chosen);
      cur = ptKey(segEn(chosen));
      firstOfChain = false;
    }
    firstChain = false;
  }

  return { segs: result.length > 0 ? result : segs, hadBranches: true };
}

// protnutí dvou nesousedních segmentů znamená, že úsek mezi nimi leží
// "pod" výslednou konturou a CAM dráhy by ho neměly brát v potaz.
function removeContourSelfIntersections(segs) {
  if (segs.length < 3) return segs;
  const result = segs.map(s => structuredClone(s));
  let loopFound = true, iterations = 0;
  while (loopFound && iterations < 10) {
    loopFound = false; iterations++;
    outerLoop:
    for (let i = 0; i < result.length - 2; i++) {
      for (let j = i + 2; j < result.length; j++) {
        const s1 = result[i], s2 = result[j];
        const pt = findSegIntersection(s1, s2);
        if (pt && isWithinSegStrict(pt, s1) && isWithinSegStrict(pt, s2)) {
          const s1End = segEndPoint(s1);
          const s2Start = segStartPoint(s2);
          const d1 = Math.hypot(pt.x - s1End.x, pt.z - s1End.z);
          const d2 = Math.hypot(pt.x - s2Start.x, pt.z - s2Start.z);
          if (d1 < LOOP_INTERIOR_MIN || d2 < LOOP_INTERIOR_MIN) continue;
          // Přeskočit sdílené krajní body: průsečík na ZAČÁTKU s1 nebo KONCI s2
          // = uzavřený polygon sdílí počáteční bod (ne skutečné samoprotnutí).
          const s1St = segStartPoint(s1), s2En = segEndPoint(s2);
          const ds1 = Math.hypot(pt.x - s1St.x, pt.z - s1St.z);
          const ds2 = Math.hypot(pt.x - s2En.x, pt.z - s2En.z);
          if (ds1 < LOOP_INTERIOR_MIN || ds2 < LOOP_INTERIOR_MIN) continue;
          setSegEnd(s1, pt);
          setSegStart(s2, pt);
          syncArcEndpoints(s1);
          syncArcEndpoints(s2);
          result.splice(i + 1, j - (i + 1));
          loopFound = true;
          break outerLoop;
        }
      }
    }
  }
  return result;
}
function trimAndRemoveLoops(rawSegs, opts = {}) {
  // opts.bridgeCollinear: pokud true, přemostí nesousední LINE segmenty
  // ležící na stejné nekonečné přímce (potlačí drážky/štěrbiny užší než
  // přídavek). Default false — vhodné pro stock generation, ne pro cutting.
  if (rawSegs.length === 0) return [];
  const result = [structuredClone(rawSegs[0])];
  // 1. local trimming
  for (let i = 0; i < rawSegs.length - 1; i++) {
    const prevOff = result[result.length - 1];
    const nextOff = structuredClone(rawSegs[i + 1]);
    // chainBreak = mezi předchozím a tímto segmentem v raw konturě nic
    // nebylo nakresleno (G0 přeskok mezi nesouvisejícími entitami) — žádné
    // trimování ani spojovací přemostění, dráha sem najede samostatně.
    if (nextOff.chainBreak) {
      result.push(nextOff);
      continue;
    }
    const intersection = findSegIntersection(prevOff, nextOff);
    if (intersection) {
      setSegEnd(prevOff, intersection);
      setSegStart(nextOff, intersection);
      syncArcEndpoints(prevOff);
      syncArcEndpoints(nextOff);
      // Přeskočit úsek, jehož počátek byl trimem posunut za jeho konec
      // (obrácený segment = nástroj by musel jet zpět přes již obrobený materiál).
      // VÝJIMKA: průsečík padl ZA raw konec segmentu (tRaw > 1) — segment není
      // skutečně obrácený, jen zatím "přetažený". Peek-ahead: ověřit, zda příští
      // trim segment opraví dopředu. Pokud by zůstal obrácený (průsečík příliš
      // blízko rohu čela → nástroj by zajel do kontury), přeskočit i jeho.
      if (nextOff.type === 'line') {
        const ox = rawSegs[i + 1].p2.x - rawSegs[i + 1].p1.x;
        const oz = rawSegs[i + 1].p2.z - rawSegs[i + 1].p1.z;
        const dx = nextOff.p2.x - nextOff.p1.x, dz = nextOff.p2.z - nextOff.p1.z;
        if (dx * ox + dz * oz < 0) {
          const rawLen2 = ox * ox + oz * oz;
          if (rawLen2 > 1e-12) {
            const tRaw = ((nextOff.p1.x - rawSegs[i + 1].p1.x) * ox +
                          (nextOff.p1.z - rawSegs[i + 1].p1.z) * oz) / rawLen2;
            if (tRaw <= 1 + 1e-6) { continue; } // průsečík uvnitř → skutečný zpětný řez
            // tRaw > 1: průsečík za koncem. Peek-ahead: příští trim napraví?
            if (i + 2 < rawSegs.length && !rawSegs[i + 2].chainBreak &&
                rawSegs[i + 2].type === 'line') {
              const nn = rawSegs[i + 2];
              const c2 = intersectLinesInfinite(nextOff.p1, nextOff.p2, nn.p1, nn.p2);
              if (c2) {
                const dx2 = c2.x - nextOff.p1.x, dz2 = c2.z - nextOff.p1.z;
                if (dx2 * ox + dz2 * oz < 0) continue; // stále obrácený → přeskočit
              }
            }
          } else { continue; }
        }
      }
      result.push(nextOff);
    } else {
      let corner = null;
      if (prevOff.type === 'line' && nextOff.type === 'line') {
        corner = intersectLinesInfinite(prevOff.p1, prevOff.p2, nextOff.p1, nextOff.p2);
      }
      if (corner) {
        prevOff.p2 = corner; nextOff.p1 = corner;
      } else {
        const pStart = getSegEnd(prevOff);
        const pEnd = getSegStart(nextOff);
        result.push({ type: 'line', p1: pStart, p2: { x: pEnd.x, z: pStart.z } });
        if (Math.abs(pEnd.z - pStart.z) > 0.001)
          result.push({ type: 'line', p1: { x: pEnd.x, z: pStart.z }, p2: pEnd });
      }
      result.push(nextOff);
    }
  }
  // 2. global loop removal (handles all segment type combos)
  if (result.length > 2) {
    let loopFound = true, iterations = 0;
    while (loopFound && iterations < 5) {
      loopFound = false; iterations++;
      outerLoop:
      for (let i = 0; i < result.length - 2; i++) {
        for (let j = i + 2; j < result.length; j++) {
          const s1 = result[i], s2 = result[j];
          if (s1.isDegenerate || s2.isDegenerate) continue;
          // Smyčka nesmí spláchnout přechod mezi samostatnými řetězy (subpath) —
          // ty zůstávají oddělené, i kdyby se jejich offsety geometricky kryly.
          let crossesChainBreak = false;
          for (let k = i + 1; k <= j; k++) if (result[k].chainBreak) { crossesChainBreak = true; break; }
          if (crossesChainBreak) continue;
          const pt = findSegIntersection(s1, s2);
          if (pt && isOnSegBounds(pt, s1) && isOnSegBounds(pt, s2)) {
            // True loop musí mít průsečík dostatečně uvnitř s1 i s2.
            const s1End = segEndPoint(s1);
            const s2Start = segStartPoint(s2);
            const d1 = Math.hypot(pt.x - s1End.x, pt.z - s1End.z);
            const d2 = Math.hypot(pt.x - s2Start.x, pt.z - s2Start.z);
            if (d1 < LOOP_INTERIOR_MIN || d2 < LOOP_INTERIOR_MIN) continue;
            // Skutečná smyčka = směry segmentů jsou ~opačné (path se vrací).
            // Fillet (segment mezi ~kolmými lines/arcs) má směry pod úhlem
            // ~90° → není loop, jen rounded corner.
            const exitDir = (seg) => {
              if (seg.type === 'line') {
                const dx = seg.p2.x - seg.p1.x, dz = seg.p2.z - seg.p1.z;
                const l = Math.hypot(dx, dz);
                return l > 1e-6 ? { x: dx / l, z: dz / l } : null;
              }
              const sign = seg.dir === 'G2' ? -1 : 1;
              return { x: sign * Math.cos(seg.endAngle), z: -sign * Math.sin(seg.endAngle) };
            };
            const entryDir = (seg) => {
              if (seg.type === 'line') {
                const dx = seg.p2.x - seg.p1.x, dz = seg.p2.z - seg.p1.z;
                const l = Math.hypot(dx, dz);
                return l > 1e-6 ? { x: dx / l, z: dz / l } : null;
              }
              const sign = seg.dir === 'G2' ? -1 : 1;
              return { x: sign * Math.cos(seg.startAngle), z: -sign * Math.sin(seg.startAngle) };
            };
            const e1 = exitDir(s1), n2 = entryDir(s2);
            if (e1 && n2) {
              const dot = e1.x * n2.x + e1.z * n2.z;
              if (dot > -0.5) continue; // ne dost opačné → není loop
            }
            setSegEnd(s1, pt);
            setSegStart(s2, pt);
            syncArcEndpoints(s1);
            syncArcEndpoints(s2);
            result.splice(i + 1, j - (i + 1));
            loopFound = true;
            break outerLoop;
          }
        }
      }
    }
  }
  // 3. collinear bridging — řeší případ, kdy dva nesousední LINE segmenty
  // leží na stejné nekonečné přímce (typicky dvě OD strany drážky, jejichž
  // ofsety se po překlopení přídavkem překrývají). Vložky mezi nimi
  // (drážka, štěrbina) se nahradí přímým spojením po té přímce.
  // POUZE pokud volající explicitně požádá (opt-in) — pro cutting paths
  // by mohlo zakrýt skutečně dosažitelné feature.
  if (opts.bridgeCollinear && result.length > 2) {
    let bridged = true, iter = 0;
    while (bridged && iter < 5) {
      bridged = false; iter++;
      outerB:
      for (let i = 0; i < result.length - 2; i++) {
        const s1 = result[i];
        if (s1.type !== 'line' || s1.isDegenerate) continue;
        const d1x = s1.p2.x - s1.p1.x, d1z = s1.p2.z - s1.p1.z;
        const l1 = Math.hypot(d1x, d1z);
        if (l1 < 1e-6) continue;
        for (let j = i + 2; j < result.length; j++) {
          const s2 = result[j];
          if (s2.type !== 'line' || s2.isDegenerate) continue;
          const d2x = s2.p2.x - s2.p1.x, d2z = s2.p2.z - s2.p1.z;
          const l2 = Math.hypot(d2x, d2z);
          if (l2 < 1e-6) continue;
          // paralelní (cross ≈ 0) a stejný směr (dot > 0)
          const cross = (d1x / l1) * (d2z / l2) - (d1z / l1) * (d2x / l2);
          if (Math.abs(cross) > 1e-3) continue;
          const dot = (d1x / l1) * (d2x / l2) + (d1z / l1) * (d2z / l2);
          if (dot < 0.99) continue;
          // s2.p1 leží na nekonečné přímce s1
          const px = s2.p1.x - s1.p1.x, pz = s2.p1.z - s1.p1.z;
          const perpDist = Math.abs(px * (d1z / l1) - pz * (d1x / l1));
          if (perpDist > TRIM_TOL) continue;
          // alespoň jeden meziostřední segment musí od přímky odbočit (= skutečný „výlet")
          let hasExcursion = false;
          for (let k = i + 1; k < j; k++) {
            const sk = result[k];
            const ptK = sk.type === 'line' ? sk.p2 : { x: sk.cx + Math.sin(sk.endAngle) * sk.r, z: sk.cz + Math.cos(sk.endAngle) * sk.r };
            const dKx = ptK.x - s1.p1.x, dKz = ptK.z - s1.p1.z;
            const perp = Math.abs(dKx * (d1z / l1) - dKz * (d1x / l1));
            if (perp > TRIM_TOL * 5) { hasExcursion = true; break; }
          }
          if (!hasExcursion) continue;
          // sloučit i..j do jedné přímky s1.p1 → s2.p2 (po stejné přímce)
          result[i] = { type: 'line', p1: { x: s1.p1.x, z: s1.p1.z }, p2: { x: s2.p2.x, z: s2.p2.z } };
          result.splice(i + 1, j - i);
          bridged = true;
          break outerB;
        }
      }
    }
  }
  return result;
}

// Když kontura začíná na ose (čelo do středu, X≈0), offsetová dráha se kvůli
// korekci R od osy odlepí (první bod má malé X>0). Protáhnout první úsek
// offsetu po jeho směru zpět až na X=0, ať nástroj dojede až do středu.
// Volá se na hrubovací i dokončovací offset (požadavek uživatele: obě čáry
// k ose). Bezpečné: pokud první úsek na ose už je (čelní offset), nedělá nic.
function extendOffsetStartToAxis(path) {
  if (!path || path.length === 0) return;
  const s = path[0];
  if (s.type !== 'line' || !s.p1 || !s.p2) return;
  if (Math.abs(s.p1.x) < 1e-6) return;            // už na ose
  const dx = s.p2.x - s.p1.x, dz = s.p2.z - s.p1.z;
  if (Math.abs(dx) < 1e-9) return;                // svislý úsek — protažení v X nedává smysl
  const t = -s.p1.x / dx;                          // parametr, kde úsek protne X=0
  if (t >= 0) return;                              // X=0 leží ve směru jízdy (uvnitř/za) → neprotahovat zpět
  s.p1 = { x: 0, z: s.p1.z + t * dz };
}

// ── resolvePointsToAbsolute ────────────────────────────────────
function resolvePointsToAbsolute(pts) {
  let lastX = 0, lastZ = 0;
  return pts.map(p => {
    let valX = parseFloat(p.x); if (isNaN(valX)) valX = 0;
    let valZ = parseFloat(p.z); if (isNaN(valZ)) valZ = 0;
    let absX, absZ;
    if (p.mode === 'INC') { absX = lastX + valX; absZ = lastZ + valZ; }
    else { absX = valX; absZ = valZ; }
    lastX = absX; lastZ = absZ;
    let rVal = parseFloat(p.r); if (isNaN(rVal)) rVal = 0;
    return { ...p, xAbs: absX, zAbs: absZ, rVal };
  });
}

// ── Složení oboustranné kontury na jednu stranu ────────────────
// Soustružnická kontura je JEDNOSTRANNÁ (profil poloměru, jen jedna strana
// osy rotace). Když uživatel v CADu nakreslí CELÝ obrys (vrch i zrcadlený
// spodek), kontura střídá +X a −X úseky přes osu (každá entita je v exportu
// uvozena G0 na svůj počátek, pak přijde její zrcadlo). CAM by jinak offsetoval
// a obráběl i spodní (zrcadlenou) půlku → dráhy v materiálu, přejezdy pod osu
// a falešné offsetové oblouky ze záporných X.
//
// Funkce takovou oboustrannou konturu složí na stranu polotovaru: body na
// opačné straně osy zahodí. Protože každá +X entita je uvozena G0 na svůj
// počátek, po odstranění −X bodů zůstane plně navázaný jednostranný profil.
// Jednostranné kontury (běžný případ) vrací beze změny.
function foldContourToMachiningSide(points, stockPoints) {
  const eps = 0.01;
  let hasPos = false, hasNeg = false;
  for (const p of points) {
    if (p.xReal > eps) hasPos = true;
    else if (p.xReal < -eps) hasNeg = true;
  }
  if (!(hasPos && hasNeg)) return points; // jednostranná → beze změny

  // Strana obrábění = strana osy, kde leží polotovar (jinak strana kontury
  // s největším dosahem od osy).
  let machSign = 0, maxAbs = 0;
  for (const p of (stockPoints || [])) {
    if (Math.abs(p.xReal) > maxAbs) { maxAbs = Math.abs(p.xReal); machSign = Math.sign(p.xReal); }
  }
  if (machSign === 0) {
    maxAbs = 0;
    for (const p of points) {
      if (Math.abs(p.xReal) > maxAbs) { maxAbs = Math.abs(p.xReal); machSign = Math.sign(p.xReal); }
    }
  }
  if (machSign === 0) machSign = 1;

  // Ponech body na ose (X≈0) i na straně obrábění; zrcadlo za osou zahoď —
  // VYJMA úsečky protínající osu (typicky čelo / upíchnutí, které uživatel
  // nakreslil přes celý průměr od +X k −X). Tu na ose (X=0) oříznout, ať
  // kontura dojede až do středu, místo aby celé čelo vypadlo.
  const kept = [];
  for (let idx = 0; idx < points.length; idx++) {
    const p = points[idx];
    if (p.xReal * machSign >= -eps) { kept.push(p); continue; }
    const prev = points[idx - 1];
    if (p.type === 'G1' && prev && prev.xReal * machSign > eps) {
      const dx = p.xReal - prev.xReal;
      if (Math.abs(dx) > 1e-9) {
        const t = (0 - prev.xReal) / dx;           // parametr, kde úsečka protne osu
        const zAxis = prev.zReal + t * (p.zReal - prev.zReal);
        kept.push({ ...p, x: 0, xAbs: 0, xReal: 0, z: zAxis, zAbs: zAxis, zReal: zAxis });
      }
    }
    // ostatní body za osou zahodit
  }
  return kept.length >= 2 ? kept : points;
}

// ── G-code parser (manual code → sim path) ─────────────────────
function parseManualGCodeToPath(code, prms, unflipArc) {
  const lines = code.split('\n');
  const path = [];
  let currentX = parseFloat(prms.safeX) / 2;
  let currentZ = parseFloat(prms.safeZ);
  let lastMoveType = 'G0';
  path.push({ x: currentX, z: currentZ, type: 'G0' });
  lines.forEach((line, idx) => {
    let clean = line.toUpperCase().trim();
    if (!clean || clean.startsWith(';') || clean.startsWith('(') || clean.startsWith('%')) return;
    // Strip inline comments
    const semiIdx = clean.indexOf(';');
    if (semiIdx >= 0) clean = clean.substring(0, semiIdx).trim();
    const parenIdx = clean.indexOf('(');
    if (parenIdx >= 0) clean = clean.substring(0, parenIdx).trim();
    if (!clean) return;
    const gMatch = clean.match(/\bG0?([0-3])\b/);
    // Řezání závitu (G33 Sinumerik/Heidenhain, G32 Fanuc) — pro simulaci
    // přímý řezný pohyb jako G1 (K/F na řádku je stoupání, ne oblouk).
    const thrMatch = !gMatch && /\bG3[23]\b/.test(clean);
    const type = thrMatch ? 'G1' : (gMatch ? 'G' + gMatch[1] : lastMoveType);
    const xMatch = clean.match(/[XU]([-]?\d*\.?\d+)/);
    const zMatch = clean.match(/[ZW]([-]?\d*\.?\d+)/);
    const rMatch = clean.match(/(?:R|CR=)([-]?\d*\.?\d+)/);
    const iMatch = clean.match(/I([-]?\d*\.?\d+)/);
    const kMatch = clean.match(/K([-]?\d*\.?\d+)/);
    let targetX = currentX, targetZ = currentZ, hasMove = false;
    if (xMatch) { targetX = prms.mode === 'DIAMON' ? parseFloat(xMatch[1]) / 2 : parseFloat(xMatch[1]); hasMove = true; }
    if (zMatch) { targetZ = parseFloat(zMatch[1]); hasMove = true; }
    if (gMatch || thrMatch) lastMoveType = type;
    if (hasMove) {
      if (type === 'G0' || type === 'G1') {
        path.push({ x: targetX, z: targetZ, type, originalLineIdx: idx });
      } else if (type === 'G2' || type === 'G3') {
        let arcR = rMatch ? parseFloat(rMatch[1]) : 0;
        if (!arcR && (iMatch || kMatch)) {
          const ci = iMatch ? parseFloat(iMatch[1]) : 0;
          const ck = kMatch ? parseFloat(kMatch[1]) : 0;
          arcR = Math.hypot(ci, ck);
        }
        if (arcR) {
          const p1 = { x: currentX, z: currentZ };
          const p2 = { x: targetX, z: targetZ };
          // Text už může mít G2/G3 prohozené kvůli flipX/flipZ (viz flipArc
          // v generateAutoGCode) — pro správný výpočet středu/směru oblouku
          // ve světových souřadnicích (a tedy správné zrcadlení v draw())
          // se musíme vrátit ke kanonickému smyslu otáčení.
          const effType = unflipArc ? (type === 'G2' ? 'G3' : 'G2') : type;
          const arc = getArcParams(p1, p2, arcR, effType);
          if (!arc.error) {
            let sA = Math.atan2(p1.x - arc.cx, p1.z - arc.cz);
            let eA = Math.atan2(p2.x - arc.cx, p2.z - arc.cz);
            if (effType === 'G2' && eA > sA) eA -= 2 * Math.PI;
            if (effType === 'G3' && eA < sA) eA += 2 * Math.PI;
            // Počet vzorků úměrný délce oblouku (r·|úhel|), ne pevných 10 —
            // jinak by se degenerovaný mikro-oblouk (např. 0,02 mm) rozdělil
            // na 10 bodů a přehrávání simulace by na něm „zamrzlo".
            const arcLen = arc.r * Math.abs(eA - sA);
            const steps = Math.max(1, Math.min(48, Math.ceil(arcLen / 0.4)));
            for (let j = 1; j <= steps; j++) {
              const a = sA + (eA - sA) * (j / steps);
              const pt = { x: arc.cx + Math.sin(a) * arc.r, z: arc.cz + Math.cos(a) * arc.r, type, originalLineIdx: idx };
              if (j === 1) pt.arcParams = { cx: arc.cx, cz: arc.cz, r: arc.r, startAngle: sA, endAngle: eA, dir: type, tessSteps: steps };
              path.push(pt);
            }
          } else {
            path.push({ x: targetX, z: targetZ, type, originalLineIdx: idx });
          }
        } else {
          path.push({ x: targetX, z: targetZ, type, originalLineIdx: idx });
        }
      }
      currentX = targetX; currentZ = targetZ;
    } else if (gMatch) {
      path.push({ x: currentX, z: currentZ, type, originalLineIdx: idx });
    }
  });
  return path;
}

// ── contour G-code parser (for initial import) ─────────────────
// ──────────────────────────────────────────────────────────────
// Konverze nakreslených „polotovar" objektů (isStock = true) na
// stockPoints pro CAM. Lines, arcs, polylines, rects → chain.
// ──────────────────────────────────────────────────────────────
function buildStockPointsFromCanvas(camParams) {
  const stockObjs = state.objects.filter(o =>
    o.isStock && !o.isDimension && !o.isCoordLabel &&
    o.type !== 'constr' && o.type !== 'text' && o.type !== 'point'
  );
  if (stockObjs.length === 0) return [];

  // Rozložit polyline/rect na úsečky a oblouky, sjednotit s lines/arcs.
  /** @type {{p1:{x:number,y:number}, p2:{x:number,y:number}, type:'line'|'arc', cx?:number, cy?:number, r?:number, ccw?:boolean}[]} */
  const segs = [];
  for (const obj of stockObjs) {
    if (obj.type === 'line') {
      segs.push({ p1: { x: obj.x1, y: obj.y1 }, p2: { x: obj.x2, y: obj.y2 }, type: 'line' });
    } else if (obj.type === 'arc') {
      const sa = obj.startAngle, ea = obj.endAngle;
      const p1 = { x: obj.cx + obj.r * Math.cos(sa), y: obj.cy + obj.r * Math.sin(sa) };
      const p2 = { x: obj.cx + obj.r * Math.cos(ea), y: obj.cy + obj.r * Math.sin(ea) };
      segs.push({ p1, p2, type: 'arc', cx: obj.cx, cy: obj.cy, r: obj.r, ccw: true });
    } else if (obj.type === 'polyline') {
      const vs = obj.vertices || [];
      const bs = obj.bulges || [];
      const count = obj.closed ? vs.length : vs.length - 1;
      for (let i = 0; i < count; i++) {
        const v1 = vs[i], v2 = vs[(i + 1) % vs.length];
        const b = bs[i] || 0;
        if (b !== 0) {
          const arc = bulgeToArc(v1, v2, b);
          if (arc) segs.push({ p1: { x: v1.x, y: v1.y }, p2: { x: v2.x, y: v2.y }, type: 'arc', cx: arc.cx, cy: arc.cy, r: arc.r, ccw: b > 0 });
        } else {
          segs.push({ p1: { x: v1.x, y: v1.y }, p2: { x: v2.x, y: v2.y }, type: 'line' });
        }
      }
    } else if (obj.type === 'rect') {
      const x1 = Math.min(obj.x1, obj.x2), x2 = Math.max(obj.x1, obj.x2);
      const y1 = Math.min(obj.y1, obj.y2), y2 = Math.max(obj.y1, obj.y2);
      const c = [{x:x1,y:y1},{x:x2,y:y1},{x:x2,y:y2},{x:x1,y:y2}];
      for (let i = 0; i < 4; i++) segs.push({ p1: c[i], p2: c[(i + 1) % 4], type: 'line' });
    } else if (obj.type === 'circle') {
      // Kružnice → dva půlkruhy (rozdělené vodorovně), aby vznikl uzavřený řetězec.
      const cx = obj.cx, cy = obj.cy, r = obj.r;
      const right = { x: cx + r, y: cy }, left = { x: cx - r, y: cy };
      segs.push({ p1: right, p2: left, type: 'arc', cx, cy, r, ccw: true });
      segs.push({ p1: left,  p2: right, type: 'arc', cx, cy, r, ccw: true });
    }
  }
  if (segs.length === 0) return [];

  // Seřadit do řetězce – propojit segmenty podle koncových bodů.
  // Tolerance 0.01 mm pokrývá výsledky offset+trim (zaokrouhlování v render).
  // Bi-directional walking: chain rozšiřujeme z obou konců, aby se vždy
  // sebraly všechny propojené segmenty bez ohledu na pořadí v state.objects.
  const tol = 0.01;
  const eq = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < tol;
  // Vyber startovní segment s nejvyšším X (pravá strana, blízko sklíčidla)
  // — vhodný startpoint pro polotovar v soustružnické konvenci.
  let bestIdx = 0, bestX = -Infinity;
  for (let i = 0; i < segs.length; i++) {
    const sx = Math.max(segs[i].p1.x, segs[i].p2.x);
    if (sx > bestX) { bestX = sx; bestIdx = i; }
  }
  const chain = [segs.splice(bestIdx, 1)[0]];
  let safety = segs.length * 2 + 5;
  let extended = true;
  while (segs.length > 0 && extended && safety-- > 0) {
    extended = false;
    // 1) Forward: navázat za konec
    const tail = chain[chain.length - 1].p2;
    let fIdx = -1, fRev = false;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (eq(s.p1, tail)) { fIdx = i; break; }
      if (eq(s.p2, tail)) { fIdx = i; fRev = true; break; }
    }
    if (fIdx !== -1) {
      const seg = segs.splice(fIdx, 1)[0];
      if (fRev) {
        const tmp = seg.p1; seg.p1 = seg.p2; seg.p2 = tmp;
        if (seg.type === 'arc') seg.ccw = !seg.ccw;
      }
      chain.push(seg);
      extended = true;
      continue;
    }
    // 2) Backward: navázat před začátek
    const head = chain[0].p1;
    let bIdx = -1, bRev = false;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (eq(s.p2, head)) { bIdx = i; break; }
      if (eq(s.p1, head)) { bIdx = i; bRev = true; break; }
    }
    if (bIdx !== -1) {
      const seg = segs.splice(bIdx, 1)[0];
      if (bRev) {
        const tmp = seg.p1; seg.p1 = seg.p2; seg.p2 = tmp;
        if (seg.type === 'arc') seg.ccw = !seg.ccw;
      }
      chain.unshift(seg);
      extended = true;
    }
  }

  // Inverzní mapování canvas → CNC (zrcadlí transformaci v handleSendToCanvas)
  const isDia = camParams.mode === 'DIAMON';
  const isKarusel = camParams.machineStructure === 'carousel';
  const fromCanvas = (cx, cy) => {
    const xRadius = isKarusel ? cx : cy;
    const z = isKarusel ? cy : cx;
    const X = isDia ? xRadius * 2 : xRadius;
    return { X, Z: z };
  };
  const round3 = v => Math.round(v * 1000) / 1000;

  // První bod = G0 na začátek řetězce.
  const pts = [];
  let id = Date.now() + 1000;
  const startCnc = fromCanvas(chain[0].p1.x, chain[0].p1.y);
  pts.push({ id: id++, type: 'G0', x: round3(startCnc.X), z: round3(startCnc.Z), r: 0, mode: 'ABS' });
  for (const seg of chain) {
    const endCnc = fromCanvas(seg.p2.x, seg.p2.y);
    if (seg.type === 'line') {
      pts.push({ id: id++, type: 'G1', x: round3(endCnc.X), z: round3(endCnc.Z), r: 0, mode: 'ABS' });
    } else if (seg.type === 'arc') {
      // V canvasu: CCW (ccw=true) = kladný smysl. Pro soustruh (Z→x, X→y) se smysl nemění,
      // pro karusel (X→x, Z→y) se prohazují osy (rotace o 90°), což rovněž zachovává znaménko obíhání.
      // V CNC: G3 = CCW, G2 = CW.
      const cnc = seg.ccw ? 'G3' : 'G2';
      pts.push({ id: id++, type: cnc, x: round3(endCnc.X), z: round3(endCnc.Z), r: round3(seg.r), mode: 'ABS' });
    }
  }
  return pts;
}

// Parser řádků G-kódu do bodů {type, x, z, r, mode} v daném rozsahu řádků.
// `startLine` inclusive, `endLine` exclusive. Polohu/typ trackujeme lokálně,
// aby polotovarová sekce nebyla ovlivněna posledním bodem kontury.
function _parseGCodeRange(lines, startLine, endLine, idBase) {
  const pts = [];
  let currentType = 'G1', idCounter = idBase, lastX = 100, lastZ = 0;
  for (let i = startLine; i < endLine; i++) {
    const line = lines[i];
    const clean = (line || '').toUpperCase().trim();
    if (!clean || clean.startsWith(';') || clean.startsWith('(') || clean.startsWith('%')) continue;
    const gMatch = clean.match(/\bG0?([0-3])\b/);
    if (gMatch) currentType = 'G' + gMatch[1];
    const xMatch = clean.match(/X([-]?\d+\.?\d*)/);
    const zMatch = clean.match(/Z([-]?\d+\.?\d*)/);
    const rMatch = clean.match(/(?:R|CR=)([-]?\d+\.?\d*)/);
    const iMatch = clean.match(/I([-]?\d+\.?\d*)/);
    const kMatch = clean.match(/K([-]?\d+\.?\d*)/);
    if (xMatch || zMatch) {
      const newX = xMatch ? parseFloat(xMatch[1]) : lastX;
      const newZ = zMatch ? parseFloat(zMatch[1]) : lastZ;
      let rVal = rMatch ? parseFloat(rMatch[1]) : 0;
      if (!rVal && (iMatch || kMatch) && (currentType === 'G2' || currentType === 'G3')) {
        const ci = iMatch ? parseFloat(iMatch[1]) : 0;
        const ck = kMatch ? parseFloat(kMatch[1]) : 0;
        const cx = lastX + ci, cz = lastZ + ck;
        rVal = Math.hypot(lastX - cx, lastZ - cz);
      }
      pts.push({ id: idCounter++, type: currentType, x: newX, z: newZ, r: rVal, mode: 'ABS' });
      lastX = newX; lastZ = newZ;
    }
  }
  return pts;
}

// Kompatibilní wrapper – jen kontura (žádné STOCK_START/END značky).
function parseContourGCode(text) {
  const lines = text.split('\n');
  return _parseGCodeRange(lines, 0, lines.length, Date.now());
}

// Rozdělí G-kód podle značek STOCK_START / STOCK_END do dvou sekcí.
// Vrací { contour: pts[], stock: pts[] }. Pokud značky chybí, vrátí jen konturu.
function parseContourAndStockGCode(text) {
  const lines = text.split('\n');
  let stockStart = -1, stockEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const u = (lines[i] || '').toUpperCase();
    if (u.includes('STOCK_START')) stockStart = i;
    else if (u.includes('STOCK_END') && stockStart !== -1) { stockEnd = i; break; }
  }
  if (stockStart === -1) {
    return { contour: _parseGCodeRange(lines, 0, lines.length, Date.now()), stock: [] };
  }
  const idBase = Date.now();
  const contour = _parseGCodeRange(lines, 0, stockStart, idBase);
  const stock = _parseGCodeRange(lines, stockStart + 1, stockEnd, idBase + 100000);
  return { contour, stock };
}

// Výchozí hodnoty CAM parametrů — sdíleno mezi počátečním stavem a tlačítkem
// "🔄 Resetovat vše" (to musí vracet PŘESNĚ stejné výchozí hodnoty, ne jen
// nějakou kopii aktuálních parametrů).
function _defaultCamParams() {
  return {
    machineType: 'LIMS=2000', mode: 'DIAMON', toolName: 'ROUGHER_T1',
    speed: 200, feed: 0.25, depthOfCut: 2.0, retractDistance: 2.0,
    // Úhel odskoku po řezu (°): 90 = svisle v X, 45 = klasická diagonála.
    // X-složka odskoku je vždy retractDistance; Z-složka = rDist/tan(úhel).
    retractAngle: 45,
    allowanceX: 0.5, allowanceZ: 0.1, toolRadius: 0.8,
    // Přídavek na hotovo: přičítá se k Rádiusu (R) i k Přídavku X/Z —
    // hrubovací offset = R + Přídavek X/Z + Přídavek na hotovo,
    // dokončovací offset = jen R.
    finishAllowance: 0,
    doFinishing: true, roughingStrategy: 'longitudinal',
    // Jen dokončení (záložka „Hot."): vynechá hrubovací průchody a objede
    // konturu jediným dokončovacím průchodem (offset = R). Používá se, když
    // hrubování dělá jiný nástroj/operace a tady se dělá pouze načisto.
    finishOnly: false,
    // Směr hrubování: 'right' = zprava doleva (standard), 'left' = zleva
    // doprava (druhá strana — zprava nelze, narazil by držák/destička).
    // Kombinuje se s roughingStrategy (podélně/čelně).
    roughingSide: 'right',
    stockMode: 'cylinder', stockMargin: 5.0, stockDiameter: 100,
    stockLength: 100, stockFace: 2.0, safeX: 150, safeZ: 5,
    machineStructure: 'lathe', controlSystem: 'sinumerik', autoProfile: true,
    toolShape: 'round', toolLength: 10, toolAngle: 15, toolTipAngle: 90,
    // Na kterou stranu od Natočení se otevírá vrcholový úhel destičky v
    // náhledu (jen kosmetika dialogu Geometrie — nemění interferenční
    // výpočet, který má svůj vlastní, na Natočení symetrický model).
    // false = 2. hrana na Natočení−ε (výchozí), true = na Natočení+ε.
    toolTipMirror: false,
    toolVbdCode: '', toolClearanceAngle: 0,
    // Držák plátku — svislé těleso nad destičkou (kolmé upnutí, jako na
    // revolveru): pás šířky holderWidth v ose Z, délky holderLength v ose X.
    // Hlídání geometrie destičky pak neomezuje zanoření nekonečnou hranou
    // destičky: hrana platí jen do délky Délka hrany (toolLength), hlouběji
    // rozhoduje držák — do širší kapsy tak nástroj smí sjet podstatně
    // hlouběji (mezní čára se lomí a pokračuje svisle podél stěny držáku).
    // holderWidth/holderLength ≤ 0 = držák se nehlídá (staré chování).
    holderWidth: 20,    // tloušťka držáku [mm] (v ose Z)
    holderLength: 200,  // délka držáku [mm] (v ose X — max. hloubka zanoření)
    // Ruka držáku (R/L) — při otevření dialogu Geometrie se odvodí ze směru
    // hrubování (roughingSide), pak ji lze tlačítkem ručně přepnout.
    holderHand: 'R',
    // Ručně nakreslený obrys držáku kolem destičky (dialog "⚙️ Geometrie" →
    // Držák → ✏️ Kreslit obrys), buď klikáním v náhledu, nebo přenesením z
    // hlavního CAD plátna. null = žádný vlastní obrys, náhled kreslí prostý
    // obdélník (holderWidth × holderLength). Souřadnice v mm ve stejném
    // systému jako uvnitř drawInsertAndHolderPreview PŘED scale/mirror
    // (0,0 = referenční bod destičky, +z = "nahoru" do držáku).
    // Tvar: { sideA: [{x,z}, ...], sideB: [{x,z}, ...] }
    holderProfile: null,
    // Natočení celého nože (destička + držák) v náhledu [°] — na rozdíl od
    // toolAngle (jen destička) otáčí obojím najednou. Hodnota = SMĚR, kterým
    // míří destička od držáku (kompas ukazuje k destičce). 270° = svisle dolů
    // = výchozí (destička dole, držák nahoru, bez pootočení). Jen náhled.
    knifeAngle: 270,
    // Auto-doplnění obrysu držáku pod 45° dle l1/tloušťky při „📐 Kreslit na
    // CAD plátně", když uživatel nakreslí jen dvě strany (otevřený obrys).
    // Vypnuto = uloží se přesně nakreslený tvar (i otevřený).
    holderAutoComplete: true,
    // Spodní strana závitového plátku [mm] — šířka rovné špičky (lichoběžník).
    // Metrické/palcové ~0,1; lichoběžníkové (Tr/Acme) ≈ 0,366×P (dno profilu).
    toolTipFlat: 0.1,
    // Upichnutí (part-off) upichovákem: Z roviny řezu (null = neaktivní,
    // jede se běžné hrubování/zapichování). Zápich jde v X od povrchu na 0.
    partOffZ: null,
    // Posl. mm nájezdu posuvem: při peckingu se jede rychloposuvem zpět dolů
    // až na tuto vzdálenost nad dno předchozího řezu, pak posuvem F.
    partingApproachFeed: 1.0,
    // Upichnutí plynule (true) = hlavní zápich jde jedním posuvem F na dno,
    // bez peckování (výjezdů pro lámání třísky). false = peckovaný cyklus.
    partOffSmooth: false,
    // Start X (radiální poloha SPODNÍ HRANY, kde ZAČNE posuvem zapichování):
    // z povrchu polotovaru se sem dojede RYCHLOPOSUVEM (kapsa/volno) a teprve
    // odtud jede posuv. 0 = neaktivní (zápich začíná od povrchu polotovaru).
    partOffStartX: 0,
    finishingSlot: null,  // index do toolMagazine pro dokončování (null = stejný nástroj)
    // ── Závitování (záložka „Závit") ──
    // Aktivní = generuje se závitovací cyklus (G33/G32 průchody) místo
    // hrubování/dokončování — stejný vzor jako upichnutí (partOffZ).
    threadActive: false,
    threadName: '',        // označení (M20, G 1/2, …) — jen popisné
    threadType: 'mc',      // klíč typu (mc/mf/tr/g/bspt/npt/unc/unf/bsw/acme) → profil/hloubka
    threadDiameter: 20,    // jmenovitý ⌀ D [mm]
    threadPitch: 2.5,      // stoupání P [mm]
    threadAngle: 60,       // vrcholový úhel profilu [°] — jen popis/vizualizace
    threadDepth: 1.534,    // hloubka profilu H [mm] (radiálně) — auto z P, lze přepsat
    threadExternal: true,  // vnější (true) / vnitřní (false) závit
    threadZStart: 0,       // Z začátku závitu (odtud se řeže směrem k threadZEnd)
    threadZEnd: -20,       // Z konce závitu
    threadRunIn: 3,        // náběh před závitem [mm] (rozběh posuvu, ve směru od konce)
    threadRunOut: 0,       // výběh za koncem [mm] (0 = končí přesně na Z konec, např. v zápichu)
    threadPasses: 0,       // počet průchodů (0 = auto podle hloubky, degresivní přísuv)
    threadSpringPasses: 1, // jiskřící průchody (ap=0) na konci
    // Kuželový závit: kuželovitost 1:k (0 = válcový; 16 = trubkový BSPT/NPT
    // 1:16; kladné = ⌀ roste směrem řezu k Z konci, záporné = klesá).
    threadTaperRatio: 0,
    // Způsob přísuvu: 'radial' = kolmý (obě strany profilu řežou),
    // 'flank' = boční po boku profilu (posun Z o hloubka·tan(ε/2)),
    // 'alternate' = střídavý cik-cak (boky se střídají — rovnoměrné opotřebení).
    threadInfeed: 'radial',
    // Úhel zanoření (ramp-in) — pod tímto úhlem nástroj rampuje do
    // materiálu (nájezd dokončování, zanořování do kapes). Stupně.
    entryAngle: 30,
    // true = úhel zanoření se dopočítává z tvaru destičky (úhel spodní
    // hrany: podélně = natočení; čelně = natočení + ε − 90).
    entryAngleAuto: true,
    // Hlídat boční ostří destičky: hrubovací průchody se zkracují tak,
    // aby destička (natočení + vrcholový úhel) nezajela do kontury,
    // a dokončování přeskočí úseky, kam destička nedosáhne.
    respectInsertGeometry: false,
    // Zanořování: podélné hrubování smí rampou (pod úhlem zanoření)
    // sjet i do kapes/zápichů v kontuře, ne jen do otevřeného řezu.
    plungeRoughing: false,
    // Dobrat kapsu najednou: jakmile rampa narazí na kapsu, dobere ji
    // celou (všechny zákroky ap po sobě), místo aby se dotahovala
    // postupně spolu s hloubkou zbytku dílu. false = původní chování
    // (postupné dotahování v dalších průchodech).
    pocketFinishAtOnce: false,
    // Bez schodků: po dojezdu hrubovacího průchodu na offset nástroj
    // dál sleduje konturu (G1/G2/G3) až na hloubku dalšího průchodu,
    // místo okamžitého 45° odskoku — schody mezi kroky se obrobí
    // přímo po obrysu.
    noStepRoughing: false,
    // Stejné chování i pro čelní (X) hrubování.
    noStepRoughingFace: false,
    // Hrubovat po regionech (jen odlitek): každý výstupek polotovaru
    // (mezi „údolími", kde se polotovar blíží kontuře) se vyhrubuje shora
    // dolů SAMOSTATNĚ, mezi regiony rychloposuv nad polotovar. false =
    // původní globální sweep po hloubkách přes celý díl.
    regionRoughing: false,
    // Vůle nad polotovarem pro rychloposuvy v Z. Default 1 mm =
    // dráha rychloposuvu se táhne co nejtěsněji vedle polotovaru.
    rapidClearance: 1.0
  };
}

// Minimální (reálná, v mm) výška těla upichovacího/zapichovacího plátku nad
// aktivním rádiem — sdíleno mezi drawInsertAndHolderPreview(), getInsertAnchorPoints()
// a buildInsertProfileSegments() (📐 Kreslit na CAD plátně), ať plátek v náhledu,
// anchor bodech i reálně nakreslené CAD geometrii vypadá stejně vysoký.
const PARTING_BODY_MIN_H_MM = 15;

// ══════════════════════════════════════════════════════════════
// ║  MAIN EXPORT                                              ║
// ══════════════════════════════════════════════════════════════
// ── Náhled geometrie destičky + držáku (dialog "⚙️ Geometrie") ────
// Samostatná, na S/simulaci nezávislá kreslicí funkce — kreslí vždy v
// kanonické orientaci (bez ohledu na S.flipX/flipZ/roughingSide, což jsou
// vlastnosti pohledu simulace, ne nástroje samotného). Matematika tvaru
// destičky vychází ze stejných vzorců jako vykreslení nástroje během
// simulace (viz draw(), blok "tool position during sim"), zbavená
// flip/mirror větví.
function drawInsertAndHolderPreview(ctx, w, h, prms, opts) {
  opts = opts || {};
  // uiScale = 1/viewZoom — čáry a markery se násobí jím, aby po zoomu celého
  // kontextu (viz redrawCanvas) zůstaly na obrazovce KONSTANTNĚ tenké.
  // Text se na canvas vůbec nekreslí (rozmazal by se při zoomu) — vrací se
  // v `texts` a vykreslí se jako ostré HTML overlaye (viz positionTexts).
  const us = opts.uiScale || 1;
  const COL = { bg: '#1e1e2e', insert: 'rgba(186,194,222,0.85)', text: '#a6adc8',
    holder: 'rgba(108,112,134,0.35)', holderStroke: 'rgba(166,173,200,0.85)',
    anchor: '#a6e3a1' };
  const labels = {}; // klikatelné anotace úhlů — logické souřadnice (bez zoom/pan volajícího)
  const anchorHits = []; // klikatelné anchor body pro ruční kreslení obrysu (viz opts.showAnchors)
  const handleHits = []; // klikatelné body spodní hrany držáku (editor tvaru, opts.showHolderHandles)
  const texts = [];  // {x, y, text, color, align} v logických souř. → HTML overlaye
  ctx.save();
  if (w <= 0 || h <= 0) { ctx.restore(); return { labels, anchorHits, handleHits, texts }; }

  const toolLen = Math.max(parseFloat(prms.toolLength) || 10, 1);
  const holderW = Math.max(parseFloat(prms.holderWidth) || 0, 0);
  const holderL = Math.max(parseFloat(prms.holderLength) || 0, 0);
  const profile = prms.holderProfile;
  const hasProfile = !!(profile && (
    (profile.sideA && profile.sideA.length) || (profile.sideB && profile.sideB.length)));

  // Vykreslená délka dříku se STROPUJE nezávisle na skutečném l1 (dlouhý
  // držák by jinak zabíral většinu výšky náhledu a zmenšoval destičku pod
  // čitelnou velikost) — reálná délka zůstává v popisce, jen se v náhledu
  // zkrátí a označí standardní značkou přerušení (klikatý zlom). Platí jen
  // pro obdélníkový fallback (bez vlastního nakresleného obrysu).
  const maxShankDrawMM = Math.max(holderW * 1.6, toolLen * 1.5, 12);
  const shankDrawMM = Math.min(holderL, maxShankDrawMM);
  const isShortened = !hasProfile && holderW > 0 && holderL > 0 && holderL > shankDrawMM + 0.01;
  // Mezera mezi špičkou destičky a začátkem držáku — musí být aspoň tak
  // velká, jako destička skutečně "sahá" nahoru (toolLen), jinak její tělo
  // vizuálně přesahuje do hlavy držáku a obě kresby se pletou přes sebe.
  const gapMM = toolLen * 1.3;

  // Pokud existuje vlastní obrys, musí se do maxDim vejít i on (může sahat
  // dál/šířeji než obdélníkový fallback). Faktor je nízký (1,25) — profil
  // má vyplnit náhled; detaily u hrany destičky si uživatel přiblíží zoomem.
  let profileExtentMM = 0;
  if (hasProfile) {
    [...(profile.sideA || []), ...(profile.sideB || [])].forEach(p => {
      profileExtentMM = Math.max(profileExtentMM, Math.abs(p.x), Math.abs(p.z));
    });
  }

  // V kresebním režimu (opts.showAnchors) měřítko fituje na DESTIČKU (ne na
  // držák) — tím je destička velká, min-pixel clampy níže se neaktivují a
  // anchor body sednou přesně na vykreslenou hranu. Držák se v tomto režimu
  // nekreslí (jen destička + anchory + rozpracovaný profil).
  const drawMode = !!opts.showAnchors;
  // hideHolder = záložka „🔩 Destička" — kreslí se jen destička (bez držáku),
  // měřítko fituje na destičku (ne na držák).
  const hideHolder = !!opts.hideHolder;
  const fitInsert = drawMode || hideHolder;
  const insRadiusMM = Math.max(parseFloat(prms.toolRadius) || 0.8, 0.1);
  // V editoru obdélníku (showHolderHandles) se fituje na DESTIČKU + spodní
  // hranu držáku (ne na celé l1=200 → jinak by byla destička mikroskopická).
  const fitProfileExtent = drawMode && !opts.showHolderHandles ? profileExtentMM * 1.25 : 0;
  const maxDim = fitInsert
    ? Math.max(toolLen * 2.6, insRadiusMM * 4.5, fitProfileExtent,
        opts.showHolderHandles ? (Math.max(parseFloat(prms.holderWidth) || 20, 0) * 1.4 + toolLen * 2) : 0, 12)
    : Math.max((gapMM + shankDrawMM) * 1.15, holderW * 1.15, toolLen * 2, profileExtentMM * 1.25, 20);
  const pad = 26;
  const scale = Math.max(Math.min((w - pad * 2) / maxDim, (h - pad * 2) / maxDim), 0.01);
  // Počátek (špička destičky): dole u fallbacku držáku, ale v kresebním režimu
  // výš (~60 %), ať je kolem destičky místo na anchory i na kulatou destičku
  // (ta má počátek ve svém středu → spodní půlka by jinak vypadla z canvasu).
  const ox = w / 2, oy = fitInsert ? h * 0.6 : h - pad - 8;
  const mirror = prms.holderHand === 'L' ? -1 : 1;
  // mm → screen: +z = "nahoru" do držáku (viz gapMM výše), zrcadlení dle ruky.
  const toScr = (x, z) => ({ x: ox + mirror * x * scale, y: oy - z * scale });

  // Natočení CELÉHO NOŽE (destička + držák) — otočí se celý ctx kolem špičky
  // (ox,oy), takže se destička i držák pootočí najednou. HTML popisky/anchory
  // (kreslené mimo ctx) se pak dorovnají přes rotScr().
  // knifeAngle = SMĚR, kterým míří destička od držáku (kompas ukazuje K
  // destičce). Výchozí 270° = svisle dolů = destička dole / držák nahoru
  // (bez pootočení). Vnitřní rotace náhledu R = 270 − knifeAngle.
  const _knifeDir = isFinite(parseFloat(prms.knifeAngle)) ? parseFloat(prms.knifeAngle) : 270;
  const knifeRad = ((270 - _knifeDir) * Math.PI / 180);
  if (knifeRad) { ctx.translate(ox, oy); ctx.rotate(knifeRad); ctx.translate(-ox, -oy); }
  const kc = Math.cos(knifeRad), ks = Math.sin(knifeRad);
  const rotScr = (sx, sy) => knifeRad
    ? { x: ox + (sx - ox) * kc - (sy - oy) * ks, y: oy + (sx - ox) * ks + (sy - oy) * kc }
    : { x: sx, y: sy };

  // ── Těleso držáku (schematicky, kanonická orientace: nahoru = do držáku) ──
  if (!hideHolder && hasProfile) {
    ctx.strokeStyle = COL.holderStroke; ctx.lineWidth = 1.4 * us;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ['sideA', 'sideB'].forEach(key => {
      const pts = profile[key];
      if (!pts || pts.length === 0) return;
      // Obrys začíná na PRVNÍM bodu (anchor na hraně destičky), ne z počátku —
      // jinak by vznikala matoucí spojnice od špičky ke hraně.
      ctx.beginPath();
      const s0 = toScr(pts[0].x, pts[0].z);
      ctx.moveTo(s0.x, s0.y);
      for (let i = 1; i < pts.length; i++) { const s = toScr(pts[i].x, pts[i].z); ctx.lineTo(s.x, s.y); }
      ctx.stroke();
    });
    // Orientační spojnice konců obou stran (zezadu) — jen tečkovaně, není to
    // skutečná hrana, jen naznačení uzavřeného obrysu.
    if (profile.sideA && profile.sideA.length && profile.sideB && profile.sideB.length) {
      const lastA = profile.sideA[profile.sideA.length - 1];
      const lastB = profile.sideB[profile.sideB.length - 1];
      const sA = toScr(lastA.x, lastA.z), sB = toScr(lastB.x, lastB.z);
      ctx.save(); ctx.setLineDash([4 * us, 3 * us]); ctx.strokeStyle = 'rgba(166,173,200,0.5)';
      ctx.beginPath(); ctx.moveTo(sA.x, sA.y); ctx.lineTo(sB.x, sB.y); ctx.stroke();
      ctx.restore();
    }
    ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
  } else if (!hideHolder && !drawMode && holderW > 0 && holderL > 0) {
    const hw2 = (holderW / 2) * scale;
    const nearY = oy - gapMM * scale;
    const farY = nearY - shankDrawMM * scale;

    ctx.fillStyle = COL.holder; ctx.strokeStyle = COL.holderStroke; ctx.lineWidth = 1 * us;
    ctx.beginPath(); ctx.rect(ox - hw2, farY, hw2 * 2, nearY - farY); ctx.fill(); ctx.stroke();

    // Standardní značka přerušení (zlom) uprostřed dříku, když je vykreslená
    // délka zkrácená oproti skutečné l1.
    if (isShortened) {
      const breakY = (nearY + farY) / 2;
      const zig = Math.min(hw2 * 0.5, 8);
      ctx.save();
      ctx.strokeStyle = COL.bg; ctx.lineWidth = 3 * us;
      ctx.beginPath(); ctx.moveTo(ox - hw2 - 1, breakY); ctx.lineTo(ox + hw2 + 1, breakY); ctx.stroke();
      ctx.strokeStyle = COL.holderStroke; ctx.lineWidth = 1.2 * us;
      [-4 * us, 4 * us].forEach(dy => {
        ctx.beginPath();
        ctx.moveTo(ox - hw2 - 2, breakY + dy + zig);
        ctx.lineTo(ox - hw2 * 0.25, breakY + dy - zig);
        ctx.lineTo(ox + hw2 * 0.25, breakY + dy + zig);
        ctx.lineTo(ox + hw2 + 2, breakY + dy - zig);
        ctx.stroke();
      });
      ctx.restore();
    }

    texts.push({ x: ox, y: (farY - 12 > 10 ? farY - 12 : farY + 12), text: `b=${holderW} mm`, color: COL.text, align: 'center' });
    texts.push({ x: ox + hw2 + 14, y: (nearY + farY) / 2, text: `l1=${holderL} mm`, color: COL.text, align: 'left' });
  } else if (!hideHolder && !drawMode) {
    texts.push({ x: ox, y: pad, text: 'Držák se nehlídá (0 mm)', color: COL.text, align: 'center' });
  }


  // ── Destička v referenčním bodě (0,0 = špička/aktivní rádius) ──
  ctx.fillStyle = COL.insert; ctx.strokeStyle = '#cdd6f4'; ctx.lineWidth = 1.2 * us;
  const shape = prms.toolShape;
  // Minimum jen jako pojistka proti degenerovaně malé/nulové velikosti —
  // NESMÍ dominovat nad skutečným měřítkem (dřívější 20 px minimum dělalo
  // destičku vizuálně větší než držák, když byl scale kvůli dlouhému l1 malý).
  const rPix = Math.max((parseFloat(prms.toolRadius) || 0.8) * scale, 2.5);
  ctx.save(); ctx.translate(ox, oy); ctx.scale(mirror, 1);

  if (shape === 'round') {
    ctx.beginPath(); ctx.arc(0, 0, rPix, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (shape === 'threading') {
    const tipAngDeg = parseFloat(prms.toolTipAngle) || 60;
    const half = (tipAngDeg / 2) * (Math.PI / 180);
    const lenPix = Math.max(toolLen * scale, 8);
    const w2 = Math.max(((parseFloat(prms.toolTipFlat) || 0) * scale) / 2, 0.75);
    const dx = Math.sin(half) * lenPix, dy = Math.cos(half) * lenPix;
    ctx.beginPath();
    ctx.moveTo(-w2 - dx, -dy);
    ctx.lineTo(-w2, 0);
    ctx.lineTo(w2, 0);
    ctx.lineTo(w2 + dx, -dy);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    const epsLx = 0, epsLy = -dy - 12;
    texts.push({ x: ox + mirror * epsLx, y: oy + epsLy, text: `ε=${tipAngDeg}°`, color: '#a6e3a1', align: 'center' });
    labels.tipAngle = { x: ox + mirror * epsLx, y: oy + epsLy };
  } else if (shape === 'polygon') {
    const tipAngDeg = parseFloat(prms.toolTipAngle) || 90;
    const effAngleDeg = parseFloat(prms.toolAngle) || 0;
    const lenPix = Math.max(toolLen * scale, 8);
    const rotRad = -effAngleDeg * (Math.PI / 180);
    const tipAng = tipAngDeg * (Math.PI / 180);
    // Na kterou stranu od Natočení se 2. hrana otevírá — dvě geometricky
    // platné možnosti (viz toolTipMirror), ⇄ tlačítko v UI mezi nimi přepíná.
    const a1 = rotRad, a2 = rotRad - tipAng * (prms.toolTipMirror ? -1 : 1);
    const distToCorner = rPix / Math.sin(tipAng / 2);
    const bisector = (a1 + a2) / 2;
    const cornerX = Math.cos(bisector + Math.PI) * distToCorner;
    const cornerY = Math.sin(bisector + Math.PI) * distToCorner;
    const tanLen = Math.min(rPix / Math.tan(tipAng / 2), lenPix * 0.99);
    const t1x = cornerX + Math.cos(a1) * tanLen, t1y = cornerY + Math.sin(a1) * tanLen;
    const t2x = cornerX + Math.cos(a2) * tanLen, t2y = cornerY + Math.sin(a2) * tanLen;
    const angT1 = Math.atan2(t1y, t1x), angT2 = Math.atan2(t2y, t2x);
    const angCorner = bisector + Math.PI;
    const norm = a => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const angDiff = (a, b) => { let d = norm(a - b); if (d > Math.PI) d -= 2 * Math.PI; return d; };
    const midCCWfalse = angT2 + norm(angT1 - angT2) / 2;
    const midCCWtrue = angT2 - norm(angT2 - angT1) / 2;
    const useCCW = Math.abs(angDiff(midCCWtrue, angCorner)) < Math.abs(angDiff(midCCWfalse, angCorner));
    ctx.beginPath(); ctx.moveTo(t1x, t1y);
    ctx.lineTo(cornerX + Math.cos(a1) * lenPix, cornerY + Math.sin(a1) * lenPix);
    ctx.lineTo(cornerX + Math.cos(a2) * lenPix, cornerY + Math.sin(a2) * lenPix);
    ctx.lineTo(t2x, t2y);
    ctx.arc(0, 0, rPix, angT2, angT1, useCCW);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // Klikatelné popisky ε (vrcholový úhel) a natočení — přibližná poloha,
    // stačí k umístění klikací "hotspot" bubliny nad canvasem.
    const epsDir = bisector + Math.PI;
    const epsLx = Math.cos(epsDir) * (rPix + 14), epsLy = Math.sin(epsDir) * (rPix + 14);
    texts.push({ x: ox + mirror * epsLx, y: oy + epsLy, text: `ε=${tipAngDeg}°`, color: '#a6e3a1', align: 'center' });
    labels.tipAngle = { x: ox + mirror * epsLx, y: oy + epsLy };
    const angLx = Math.cos(a1) * (lenPix * 0.55 + 6), angLy = Math.sin(a1) * (lenPix * 0.55 + 6);
    texts.push({ x: ox + mirror * angLx, y: oy + angLy, text: `∠${effAngleDeg}°`, color: '#f9e2af', align: 'center' });
    labels.toolAngle = { x: ox + mirror * angLx, y: oy + angLy };
  } else if (shape === 'parting') {
    const wPix = Math.max(toolLen * scale, 8);
    const effAngleDeg = parseFloat(prms.toolAngle) || 0;
    const rotRad = -effAngleDeg * (Math.PI / 180);
    const r = Math.min(rPix, wPix / 2);
    const w2 = wPix - 2 * r;
    // Výška těla plátku v mm (PARTING_BODY_MIN_H_MM nad rádiem), převedená na
    // px přes `scale` — dřív byl minimem pevný "+10 px", který se scvrkával
    // s mm-výškou (10 px v mm ubývalo se zoomem), takže tělo bylo při větším
    // přiblížení nesmyslně nízké. Stejná konstanta se používá i v
    // getInsertAnchorPoints() a buildInsertProfileSegments() (📐 Kreslit na
    // CAD plátně), ať plátek vždy vypadá stejně vysoký (~15 mm reálně).
    const bodyH = Math.max(wPix * 0.6, r + PARTING_BODY_MIN_H_MM * scale);
    ctx.save(); ctx.rotate(rotRad);
    ctx.beginPath();
    ctx.moveTo(-r, r - bodyH);
    ctx.lineTo(-r, 0);
    ctx.arc(0, 0, r, Math.PI, Math.PI / 2, true);
    ctx.lineTo(w2, r);
    ctx.arc(w2, 0, r, Math.PI / 2, 0, true);
    ctx.lineTo(w2 + r, r - bodyH);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    const angLx = Math.cos(rotRad) * wPix * 0.5, angLy = Math.sin(rotRad) * wPix * 0.5 - bodyH - 6;
    texts.push({ x: ox + mirror * angLx, y: oy + angLy, text: `∠${effAngleDeg}°`, color: '#f9e2af', align: 'center' });
    labels.toolAngle = { x: ox + mirror * angLx, y: oy + angLy };
  }

  // referenční křížek ve špičce
  const cross = 5 * us;
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1 * us;
  ctx.beginPath();
  ctx.moveTo(-cross, 0); ctx.lineTo(cross, 0);
  ctx.moveTo(0, -cross); ctx.lineTo(0, cross);
  ctx.stroke();
  ctx.restore();
  ctx.restore();

  // ── Anchor body pro ruční kreslení obrysu držáku (jen v kresebním režimu) ──
  // Kreslí se AŽ NAD destičkou (jinak by u kulaté destičky ležely přesně na
  // jejím obvodu a byly by kruhem překryté).
  if (opts.showAnchors) {
    getInsertAnchorPoints(prms).forEach(a => {
      // Anchory se kreslí AŽ po ctx.restore (mimo rotaci nože) → screen pozici
      // otočíme ručně přes rotScr, ať sedí na (rotované) hraně destičky.
      const sp = toScr(a.x, a.z);
      const s = rotScr(sp.x, sp.y);
      anchorHits.push({ x: s.x, y: s.y, wx: a.x, wz: a.z, side: a.side, label: a.label });
      ctx.beginPath();
      ctx.arc(s.x, s.y, 5 * us, 0, Math.PI * 2);
      ctx.fillStyle = opts.activeSide === a.side ? COL.anchor : 'rgba(166,227,161,0.5)';
      ctx.strokeStyle = COL.anchor; ctx.lineWidth = 1 * us;
      ctx.fill(); ctx.stroke();
    });
  }

  // ── Klikací body spodní hrany držáku (editor tvaru) — žluté čtverečky ──
  if (opts.showHolderHandles && hasProfile) {
    const sel = opts.selectedHandle;
    holderBottomHandles(profile.sideA).forEach(hnd => {
      const sp = toScr(hnd.x, hnd.z);
      const s = rotScr(sp.x, sp.y);
      handleHits.push({ x: s.x, y: s.y, wx: hnd.x, wz: hnd.z, role: hnd.role, which: hnd.which });
      const isSel = sel && Math.abs(sel.x - hnd.x) < 1e-6 && Math.abs(sel.z - hnd.z) < 1e-6;
      const sz = (hnd.role === 'corner' ? 5 : 4) * us;
      ctx.beginPath();
      ctx.rect(s.x - sz, s.y - sz, sz * 2, sz * 2);
      ctx.fillStyle = isSel ? '#f9e2af' : 'rgba(249,226,175,0.5)';
      ctx.strokeStyle = '#f9e2af'; ctx.lineWidth = 1.2 * us;
      ctx.fill(); ctx.stroke();
    });
  }

  // Natočení nože: HTML popisky (ε, ∠, b, l1…) a klikatelné hotspoty leží mimo
  // ctx, takže je dorovnáme do stejné rotace jako kreslenou geometrii.
  if (knifeRad) {
    texts.forEach(t => { const r = rotScr(t.x, t.y); t.x = r.x; t.y = r.y; });
    Object.keys(labels).forEach(k => { const r = rotScr(labels[k].x, labels[k].y); labels[k] = r; });
  }

  return { labels, anchorHits, handleHits, texts };
}

// Klikatelné anchor body na destičce, odkud se dá spustit kreslení jedné
// strany obrysu držáku (viz S.params.holderProfile). Souřadnice v mm, STEJNÝ
// systém jako holderProfile (0,0 = referenční bod destičky, +z = "nahoru"
// do držáku) — bez zrcadlení (to řeší až toScr()/opts v drawInsertAndHolderPreview).
function getInsertAnchorPoints(prms) {
  const shape = prms.toolShape;
  const pts = [];
  if (shape === 'round') {
    const r = Math.max(parseFloat(prms.toolRadius) || 0.8, 0.1);
    for (let i = 0; i < 8; i++) {
      const deg = i * 45;
      const rad = deg * Math.PI / 180;
      pts.push({ x: Math.cos(rad) * r, z: Math.sin(rad) * r, side: i < 4 ? 'sideA' : 'sideB', label: `${deg}°` });
    }
  } else if (shape === 'polygon') {
    const tipAngDeg = parseFloat(prms.toolTipAngle) || 90;
    const effAngleDeg = parseFloat(prms.toolAngle) || 0;
    const toolLen = Math.max(parseFloat(prms.toolLength) || 10, 1);
    const r = Math.max(parseFloat(prms.toolRadius) || 0.8, 0);
    const rotRad = -effAngleDeg * Math.PI / 180;
    const tipAng = tipAngDeg * Math.PI / 180;
    const a1 = rotRad, a2 = rotRad - tipAng * (prms.toolTipMirror ? -1 : 1);
    // Konec hrany PŘESNĚ tam, kde ji kreslí drawInsertAndHolderPreview:
    // střed rádiusu špičky je posunut o distToCorner podél bisektoru a hrany
    // z něj vybíhají do délky toolLen (viz cornerX/cornerY v draw fci). Bez
    // tohoto offsetu ležel anchor mimo skutečnou hranu.
    const distToCorner = tipAng > 0 ? r / Math.sin(tipAng / 2) : 0;
    const bis = (a1 + a2) / 2 + Math.PI;
    const cx = Math.cos(bis) * distToCorner, cy = Math.sin(bis) * distToCorner;
    pts.push({ x: cx + Math.cos(a1) * toolLen, z: -(cy + Math.sin(a1) * toolLen), side: 'sideA', label: 'Hrana A' });
    pts.push({ x: cx + Math.cos(a2) * toolLen, z: -(cy + Math.sin(a2) * toolLen), side: 'sideB', label: 'Hrana B' });
  } else if (shape === 'threading') {
    // Stejná matematika jako drawInsertAndHolderPreview (shape === 'threading'),
    // jen bez scale — vrchní (širší) hrana lichoběžníku, kde plátek sedí
    // proti držáku, dá tři cíle pro Upravit obdélník: levý/pravý roh + střed.
    const tipAngDeg = parseFloat(prms.toolTipAngle) || 60;
    const half = (tipAngDeg / 2) * Math.PI / 180;
    const toolLen = Math.max(parseFloat(prms.toolLength) || 4, 0.1);
    const flat2 = Math.max((parseFloat(prms.toolTipFlat) || 0) / 2, 0);
    const dx = Math.sin(half) * toolLen, dz = Math.cos(half) * toolLen;
    pts.push({ x: -(flat2 + dx), z: dz, side: 'sideA', label: 'Hrana A (vlevo)' });
    pts.push({ x: 0, z: dz, side: 'top', label: 'Vrch – střed' });
    pts.push({ x: flat2 + dx, z: dz, side: 'sideB', label: 'Hrana B (vpravo)' });
  } else if (shape === 'parting') {
    // Stejná matematika jako buildInsertProfileSegments (shape === 'parting',
    // v CAD Kreslit na CAD plátně) — vrchní hrana těla plátku (u držáku).
    const toolLen = Math.max(parseFloat(prms.toolLength) || 5, 1);
    const R = Math.max(parseFloat(prms.toolRadius) || 0.8, 0.05);
    const r = Math.min(R, toolLen / 2);
    const w2 = toolLen - 2 * r;
    const bodyH = Math.max(toolLen * 0.6, r + PARTING_BODY_MIN_H_MM);
    const rotRad = -(parseFloat(prms.toolAngle) || 0) * Math.PI / 180;
    const rot = (x, y) => ({
      x: x * Math.cos(rotRad) - y * Math.sin(rotRad),
      z: -(x * Math.sin(rotRad) + y * Math.cos(rotRad)),
    });
    const topL = rot(-r, r - bodyH), topR = rot(w2 + r, r - bodyH);
    pts.push({ x: topL.x, z: topL.z, side: 'sideA', label: 'Hrana A (vlevo)' });
    pts.push({ x: (topL.x + topR.x) / 2, z: (topL.z + topR.z) / 2, side: 'top', label: 'Vrch – střed' });
    pts.push({ x: topR.x, z: topR.z, side: 'sideB', label: 'Hrana B (vpravo)' });
  }
  // Střed rádiusu / referenční bod destičky (0,0) — cíl pro přesun držáku.
  // side:'center' → NENÍ strana obrysu, slouží jen jako cíl přesunu (viz editor).
  pts.push({ x: 0, z: 0, side: 'center', label: 'Střed R' });
  return pts;
}

// ── Editor tvaru držáku (náhled) — čisté geometrické funkce ──────────
// Výchozí obdélníkový obrys držáku (uzavřený) v profilu {x,z}: šířka =
// holderWidth (osa x), délka = holderLength (osa z), spodní hrana u z=0
// (u destičky). Index 0=levý spodní roh (BL), 1=pravý spodní (BR).
function holderRectProfile(prms) {
  const hw = Math.max(parseFloat(prms.holderWidth) || 20, 0.1);
  const l1 = Math.max(parseFloat(prms.holderLength) || 200, 1);
  // Spodní hrana NAD destičkou (z0 > 0), ať střední bod (0,z0) nekryje anchor
  // „Střed R" v (0,0) a ať je obdélník vizuálně nad destičkou.
  const toolLen = Math.max(parseFloat(prms.toolLength) || 10, 1);
  const r = Math.max(parseFloat(prms.toolRadius) || 0.8, 0.1);
  const z0 = Math.max(toolLen, r, 4);
  const bl = { x: -hw / 2, z: z0 }, br = { x: hw / 2, z: z0 };
  return [bl, br, { x: hw / 2, z: z0 + l1 }, { x: -hw / 2, z: z0 + l1 }, { x: bl.x, z: bl.z }];
}

// Vykreslí obrys DRŽÁKU (za destičkou) v hlavním simulačním náhledu — VOLAT
// uvnitř ctx.translate(pt.x, pt.y) + zrcadlení strany obrábění, PŘED
// natočením specifickým pro tvar destičky (toolAngle u polygonu/upichováku),
// stejně jako v dialogu "⚙️ Geometrie" (tam knifeAngle otáčí držák nezávisle
// na natočení destičky). Použije stejná profilová data (holderProfile.sideA/
// sideB, {x,z} vůči referenčnímu bodu destičky, +z = k držáku) jako
// getInsertAnchorPoints/holderRectProfile — bez vlastního obrysu prostý
// obdélník Délka × Tloušťka. holderWidth/holderLength ≤ 0 = držák se nehlídá.
function drawHolderProfileLocal(ctx, prms, scale) {
  const profile = prms.holderProfile;
  const hasProfile = profile && ((profile.sideA && profile.sideA.length > 1) || (profile.sideB && profile.sideB.length > 1));
  if (!hasProfile && (Math.max(parseFloat(prms.holderWidth) || 0, 0) <= 0 || Math.max(parseFloat(prms.holderLength) || 0, 0) <= 0)) return;
  const sides = hasProfile ? [profile.sideA, profile.sideB] : [holderRectProfile(prms)];
  ctx.save();
  ctx.fillStyle = 'rgba(108,112,134,0.35)';
  ctx.strokeStyle = 'rgba(166,173,200,0.85)';
  ctx.lineWidth = 1;
  sides.forEach(pts => {
    if (!pts || pts.length < 2) return;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const lx = p.x * scale, ly = -p.z * scale;
      if (i === 0) ctx.moveTo(lx, ly); else ctx.lineTo(lx, ly);
    });
    const closed = Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z) < 1e-6;
    if (closed) { ctx.closePath(); ctx.fill(); }
    ctx.stroke();
  });
  ctx.restore();
}

// Spodní (u destičky) klikací body obrysu: 2 vrcholy s nejmenším z (rohy) +
// jejich střed. Vrací [{x,z,role:'corner'|'mid', which:'L'|'R'}].
function holderBottomHandles(profile) {
  if (!profile || profile.length < 2) return [];
  const pts = profile.slice();
  if (Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z) < 1e-6) pts.pop();
  if (pts.length < 2) return [];
  const minZ = Math.min(...pts.map(p => p.z));
  const tol = Math.max(0.5, (Math.max(...pts.map(p => p.z)) - minZ) * 0.02);
  const bottom = pts.filter(p => p.z - minZ <= tol);
  if (bottom.length < 2) return bottom.map(p => ({ x: p.x, z: p.z, role: 'corner' }));
  const left = bottom.reduce((a, b) => (b.x < a.x ? b : a));
  const right = bottom.reduce((a, b) => (b.x > a.x ? b : a));
  return [
    { x: left.x, z: left.z, role: 'corner', which: 'L' },
    { x: (left.x + right.x) / 2, z: (left.z + right.z) / 2, role: 'mid' },
    { x: right.x, z: right.z, role: 'corner', which: 'R' },
  ];
}

// Posune celý obrys (obě strany) o (dx,dz).
function translateHolderProfile(profile, dx, dz) {
  const move = arr => (arr || []).map(p => ({ x: p.x + dx, z: p.z + dz }));
  return { sideA: move(profile.sideA), sideB: move(profile.sideB) };
}

// Počet úseček uloženého obrysu držáku (0, pokud žádný vlastní obrys není)
// — stejná data (holderProfile.sideA/sideB), ať vznikla přesunem/sražením
// obdélníku (🔧 Upravit obdélník) nebo importem z CAD (📐 Kreslit na CAD
// plátně / captureHolderProfile) — obě cesty píší do stejné struktury bodů.
function holderProfileSegCount(profile) {
  const n = arr => Math.max((arr || []).length - 1, 0);
  return n(profile && profile.sideA) + n(profile && profile.sideB);
}

// Čitelný výpis obrysu držáku (bod-po-bodu, v profilových souřadnicích —
// 0,0 = referenční bod destičky, +z = k držáku) pro rozbalovací sekci
// "Tvar držáku". Později poslouží jako zdroj dat pro hlídání kolizí při
// generování drah (potřebuje tvar držáku + jeho polohu vůči destičce).
function holderShapeInfoHTML(prms) {
  const profile = prms.holderProfile;
  const hasProfile = profile && ((profile.sideA && profile.sideA.length > 1) || (profile.sideB && profile.sideB.length > 1));
  if (!hasProfile) {
    return `<div style="font-size:11px;color:#6c7086;padding:2px 0">Zatím bez vlastního obrysu — počítá se prostý obdélník
      Délka × Tloušťka (výše). Vlastní obrys vznikne přes 🔧 Upravit obdélník nebo 📐 Kreslit na CAD plátně.</div>`;
  }
  const segRows = (pts, label) => {
    if (!pts || pts.length < 2) return '';
    let rows = '';
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const ang = Math.atan2(b.z - a.z, b.x - a.x) * 180 / Math.PI;
      rows += `<tr>
        <td style="padding:2px 6px">${label}${i + 1}</td>
        <td style="padding:2px 6px;font-family:monospace">${a.x.toFixed(1)}, ${a.z.toFixed(1)}</td>
        <td style="padding:2px 6px;font-family:monospace">${b.x.toFixed(1)}, ${b.z.toFixed(1)}</td>
        <td style="padding:2px 6px">${len.toFixed(1)} mm</td>
        <td style="padding:2px 6px">${ang.toFixed(0)}°</td>
      </tr>`;
    }
    return rows;
  };
  return `<table style="width:100%;font-size:10px;border-collapse:collapse">
    <thead><tr style="color:#a6adc8;text-align:left">
      <th style="padding:2px 6px">Úsek</th><th style="padding:2px 6px">Od (X,Z)</th><th style="padding:2px 6px">Do (X,Z)</th>
      <th style="padding:2px 6px">Délka</th><th style="padding:2px 6px">Úhel</th>
    </tr></thead>
    <tbody>${segRows(profile.sideA, 'A')}${segRows(profile.sideB, 'B')}</tbody>
  </table>`;
}

// Srazí (zkosí) roh nejbližší bodu cornerPt. `dist` = délka první nohy (podél
// hrany k předchozímu bodu), `angleDeg` = úhel sražení vůči této hraně (45° =
// symetrické pro pravý úhel). Druhá noha se dopočte ze sinové věty podle
// vnitřního úhlu rohu. Vrací nové pole bodů dané strany (uzavřené, když bylo).
function chamferProfileCorner(sidePts, cornerPt, dist, angleDeg = 45) {
  if (!sidePts || sidePts.length < 3) return sidePts;
  const closed = Math.hypot(sidePts[0].x - sidePts[sidePts.length - 1].x, sidePts[0].z - sidePts[sidePts.length - 1].z) < 1e-6;
  const pts = closed ? sidePts.slice(0, -1) : sidePts.slice();
  const n = pts.length;
  let idx = -1, bd = Infinity;
  pts.forEach((p, i) => { const d = Math.hypot(p.x - cornerPt.x, p.z - cornerPt.z); if (d < bd) { bd = d; idx = i; } });
  if (idx < 0) return sidePts;
  const prev = pts[(idx - 1 + n) % n], cur = pts[idx], next = pts[(idx + 1) % n];
  const unit = (from, to) => { const dx = to.x - from.x, dz = to.z - from.z; const l = Math.hypot(dx, dz) || 1; return { x: dx / l, z: dz / l, len: Math.hypot(dx, dz) }; };
  const uPrev = unit(cur, prev), uNext = unit(cur, next);
  // Vnitřní úhel rohu γ (mezi hranami) a úhel sražení β vůči hraně k `prev`.
  const gamma = Math.acos(Math.max(-1, Math.min(1, uPrev.x * uNext.x + uPrev.z * uNext.z)));
  let beta = (parseFloat(angleDeg) || 45) * Math.PI / 180;
  beta = Math.max(0.02, Math.min(beta, Math.max(0.02, Math.PI - gamma - 0.02)));
  const dP = Math.min(dist, uPrev.len * 0.9);
  const denom = Math.sin(gamma + beta);
  // Sinová věta v trojúhelníku roh-P1-P2: dN = dP·sin β / sin(γ+β).
  let dN = Math.abs(denom) < 1e-6 ? dP : dP * Math.sin(beta) / denom;
  dN = Math.max(0, Math.min(dN, uNext.len * 0.9));
  const p1 = { x: cur.x + uPrev.x * dP, z: cur.z + uPrev.z * dP };
  const p2 = { x: cur.x + uNext.x * dN, z: cur.z + uNext.z * dN };
  pts.splice(idx, 1, p1, p2);
  if (closed) pts.push({ x: pts[0].x, z: pts[0].z });
  return pts;
}

// Sdílený markup pro tvar destičky (Rádius/tlačítka tvaru + podmíněná pole) —
// používá jak hlavní panel "Nástroj", tak modal "⚙️ Geometrie", aby obě UI
// zůstala vizuálně i datově identická (stejné klíče data-p/data-tshape).
// Pole polárního úhlu s tlačítkem ✛ pro rychlou volbu po 45° (stejný vzor
// jako 🔢 Číselné zadání objektu v CAD — viz wireAngleCompass()).
function _polarAngleFieldHTML(dataP, value, titleAttr) {
  return `<div class="cam-sim-field"><label${titleAttr ? ` title="${titleAttr}"` : ''}>Polární úhel (°)</label>
    <div style="display:flex;gap:2px">
      <input type="number" data-p="${dataP}" value="${value}" style="flex:1;min-width:0">
      <button type="button" class="compass-trigger-btn" data-compass-for="${dataP}" title="Rychlá volba úhlu" style="font-size:13px;padding:2px 5px;flex-shrink:0">✛</button>
    </div>
  </div>`;
}

// Napojí ✛ tlačítko na kompasový popup pro rychlou volbu úhlu (0/45/90/…)
// — vzor převzatý z js/dialogs/numericalInput.js (wireAngleCompass), sdílí
// stejné CSS třídy (.angle-compass-popup/.compass-grid/.compass-arrow).
// onPick(angleDeg) se zavolá navíc k vyplnění inputEl (pro data-p pole to
// stačí nechat na 'change' listeneru přes dispatchEvent; onPick je pro
// místa mimo data-p mechanismus, např. showRotateToolPopup).
function wireAngleCompass(triggerBtn, inputEl, onPick) {
  if (!triggerBtn) return;
  triggerBtn.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    const existing = document.querySelector('.angle-compass-popup');
    if (existing) existing.remove();
    const popup = document.createElement('div');
    popup.className = 'angle-compass-popup';
    popup.innerHTML = `<div class="compass-grid">
      <button type="button" data-ang="135" class="compass-arrow" style="grid-area:tl">↖</button>
      <button type="button" data-ang="90" class="compass-arrow" style="grid-area:tc">↑</button>
      <button type="button" data-ang="45" class="compass-arrow" style="grid-area:tr">↗</button>
      <button type="button" data-ang="180" class="compass-arrow" style="grid-area:ml">←</button>
      <button type="button" class="compass-close" style="grid-area:mc">✕</button>
      <button type="button" data-ang="0" class="compass-arrow" style="grid-area:mr">→</button>
      <button type="button" data-ang="225" class="compass-arrow" style="grid-area:bl">↙</button>
      <button type="button" data-ang="270" class="compass-arrow" style="grid-area:bc">↓</button>
      <button type="button" data-ang="315" class="compass-arrow" style="grid-area:br">↘</button>
    </div>`;
    document.body.appendChild(popup);
    const rect = triggerBtn.getBoundingClientRect();
    popup.style.position = 'fixed';
    // Musí být NAD modalem Geometrie (z-index 300) i nad side/rotate popupy
    // (320), jinak by kompas zůstal schovaný za jejich celoobrazovkovým
    // backdropem a klik by na něj nedosáhl (to byl důvod „nereaguje").
    popup.style.zIndex = '600';
    popup.style.left = Math.max(Math.min(rect.left - 60, window.innerWidth - 150), 6) + 'px';
    popup.style.top = Math.max(rect.top - 150, 6) + 'px';
    popup.querySelectorAll('.compass-arrow').forEach(ab => {
      ab.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const ang = parseFloat(ab.dataset.ang);
        if (inputEl) { inputEl.value = ang; inputEl.dispatchEvent(new Event('change', { bubbles: true })); }
        if (onPick) onPick(ang);
        popup.remove();
      });
    });
    popup.querySelector('.compass-close').addEventListener('click', () => popup.remove());
    setTimeout(() => {
      function outsideClick(ev) {
        if (!popup.contains(ev.target) && ev.target !== triggerBtn) { popup.remove(); document.removeEventListener('mousedown', outsideClick); }
      }
      document.addEventListener('mousedown', outsideClick);
    }, 50);
  });
}

// Napojí všechna ✛ tlačítka (data-compass-for) uvnitř containeru na jejich
// odpovídající data-p pole.
function wireAllAngleCompasses(container) {
  container.querySelectorAll('[data-compass-for]').forEach(btn => {
    const inp = container.querySelector(`[data-p="${btn.dataset.compassFor}"]`);
    wireAngleCompass(btn, inp);
  });
}

function _renderInsertShapeFieldsHTML(prms) {
  let html = `${(prms.toolShape === 'threading' || prms.toolShape === 'polygon') ? '' : `<div class="cam-sim-row">
    <div class="cam-sim-field"><label>Rádius (R)</label><input type="number" step="0.1" data-p="toolRadius" value="${prms.toolRadius}"></div>
  </div>`}
  <div style="margin-top:4px"><label style="font-size:10px;color:#6c7086">Tvar destičky</label></div>
  <div class="cam-sim-tool-shape-row">
    <button data-tshape="round" class="${prms.toolShape === 'round' ? 'cam-sim-active' : ''}">⬤</button>
    <button data-tshape="polygon" class="${prms.toolShape === 'polygon' ? 'cam-sim-active' : ''}">◼</button>
    <button data-tshape="parting" class="${prms.toolShape === 'parting' ? 'cam-sim-active' : ''}" title="Upichovací / zapichovací plátek">▮</button>
    <button data-tshape="threading" class="${prms.toolShape === 'threading' ? 'cam-sim-active' : ''}" title="Závitový plátek (profil V dle úhlu závitu)">▽</button>
  </div>`;
  if (prms.toolShape === 'polygon') {
    html += `<div class="cam-sim-row">
      <div class="cam-sim-field"><label>Délka hrany</label><input type="number" data-p="toolLength" value="${prms.toolLength}"></div>
      ${_polarAngleFieldHTML('toolAngle', prms.toolAngle)}
      <div class="cam-sim-field"><label>Vrch. úhel (ε)</label><input type="number" data-p="toolTipAngle" value="${prms.toolTipAngle}"></div>
      <div class="cam-sim-field"><label>Rádius (R)</label><input type="number" step="0.1" data-p="toolRadius" value="${prms.toolRadius}"></div>
    </div>
    <div class="cam-sim-row">
      <button data-act="toggle-tip-mirror" class="cam-sim-btn cam-sim-btn-gray" style="width:auto;display:inline-flex;padding:3px 8px;font-size:11px" title="Vrcholový úhel (ε) jde od Natočení otevřít na dvě strany — pokud náhled ukáže destičku obráceně, přehoďte ji tímto tlačítkem místo přepočítávání úhlů">⇄ Přehodit stranu</button>
    </div>`;
  } else if (prms.toolShape === 'parting') {
    html += `<div class="cam-sim-row">
      <div class="cam-sim-field"><label title="Šířka upichovacího plátku — odpovídá délce hrany">Šířka plátku</label><input type="number" data-p="toolLength" value="${prms.toolLength}"></div>
      ${_polarAngleFieldHTML('toolAngle', prms.toolAngle, 'Polární úhel plátku; 0° = vodorovně s osou Z')}
    </div>`;
  } else if (prms.toolShape === 'threading') {
    html += `<div class="cam-sim-row">
      <div class="cam-sim-field"><label title="Vrcholový úhel V-profilu plátku — musí odpovídat úhlu závitu (M/UN 60°, G/BSW 55°, Tr 30°, Acme 29°). Výběr závitu (🧵 Závity) ho nastaví automaticky.">Úhel profilu (ε)</label><input type="number" data-p="toolTipAngle" value="${prms.toolTipAngle}" min="10" max="90" step="0.5"></div>
      <div class="cam-sim-field"><label title="Délka zobrazené hrany plátku (jen vizualizace)">Délka hrany</label><input type="number" data-p="toolLength" value="${prms.toolLength}"></div>
      <div class="cam-sim-field"><label title="Šířka rovné špičky plátku (lichoběžník). Metrické/palcové ~0,1 mm; Tr/Acme ≈ 0,366×P — výběr závitu (🧵 Závity) nastaví automaticky. Nahrazuje Rádius (R), který se u závitového plátku nepoužívá.">Spodní strana</label><input type="number" data-p="toolTipFlat" value="${prms.toolTipFlat ?? 0.1}" min="0" step="0.05"></div>
    </div>`;
  }
  return html;
}

// ── Geometrie nástroje (destička + držák) pro knihovnu nožů ─────────
// S.params je per-instance closure (viz openCamSimulator). Aby šla geometrie
// nástroje uložit/načíst z projektu (projectManager) a přenést do CAM i mimo
// otevřený simulátor, drží se poslední známá sada zde na úrovni modulu.
const CAM_TOOL_KEYS = ['toolShape', 'toolLength', 'toolAngle', 'toolTipAngle',
  'toolRadius', 'toolTipFlat', 'toolTipMirror', 'toolVbdCode',
  'holderLength', 'holderWidth', 'holderHand', 'holderProfile',
  'knifeAngle', 'holderAutoComplete'];
let _savedCamTool = null;   // naposledy uložený/načtený nůž (mimo otevřené CAM)
let _activeCamParams = null; // S.params živě otevřeného CAM (nebo null)

function _pickCamTool(src) {
  if (!src) return null;
  const out = {};
  for (const k of CAM_TOOL_KEYS) {
    if (src[k] === undefined) continue;
    out[k] = k === 'holderProfile' && src[k] ? JSON.parse(JSON.stringify(src[k])) : src[k];
  }
  return out;
}

/** Geometrie nástroje pro uložení do projektu (živé CAM má přednost). */
export function getCamToolGeometry() {
  return _pickCamTool(_activeCamParams || _savedCamTool);
}

/**
 * Přenese nůž do CAM: uloží do modulového cache a, je-li CAM otevřené, i do
 * jeho živých parametrů. Vrací true při úspěchu.
 */
export function applyCamToolGeometry(tool) {
  const picked = _pickCamTool(tool);
  if (!picked) return false;
  _savedCamTool = { ...(_savedCamTool || {}), ...picked };
  if (_activeCamParams) {
    for (const k of CAM_TOOL_KEYS) if (picked[k] !== undefined) _activeCamParams[k] = picked[k];
    if (bridge.refreshCamToolGeometry) bridge.refreshCamToolGeometry();
  }
  return true;
}

// Registrace pro projectManager (přes bridge — bez cyklického importu).
// typeof-guard: testovací harness (tests/helpers/camInternals.mjs) importy
// stripuje a `bridge` nestubuje — bez guardu by tento top-level řádek spadl.
if (typeof bridge !== 'undefined') {
  bridge.getCamToolGeometry = getCamToolGeometry;
  bridge.applyCamToolGeometry = applyCamToolGeometry;
}

export function openCamSimulator(initialContour, initialGCode) {
  // Během kreslení držáku na CAD plátně je CAM overlay schovaný a plátno
  // patří CAD kreslení — nedovolit otevřít/přepnout do CAM (návrat jen přes
  // dolní lištu ✓ Potvrdit / ✕ Zrušit).
  if (state.holderDrawMode) {
    showToast('Nelze přepnout do CAM během kreslení držáku');
    return;
  }
  injectCSS();

  // ── Build HTML ──
  const bodyHTML = `
<div class="cam-sim-root">
  <div class="cam-sim-canvas-area">
    <div class="cam-sim-toolbar">
      <button data-act="addpt" title="Vložit za bod" style="display:none">➕</button>
      <button data-act="gextend" title="Prodloužit: klik na koncový bod úsečky (G0/G1) nebo konstrukční čáry → protáhne k nejbližšímu průsečíku s konturou / offsetem / konstrukční čarou (zapněte ✥ Dráhy)" style="display:none">⊢ Prodl</button>
      <button data-act="gtrim" title="Oříznout: klik na koncový bod úsečky (G0/G1) nebo konstrukční čáry → zkrátí k nejbližšímu průsečíku zpět (zapněte ✥ Dráhy)" style="display:none">⊣ Ořez</button>
      <button data-act="delpt" title="Odebrat bod" style="display:none">➖</button>
      <button data-act="edit-contour" title="Kontura: táhněte body kontury pro změnu jejich polohy. Vylučuje se s úpravou drah.">◆ Kontura</button>
      <button data-act="edit-paths" title="Dráhy: úprava G-kódu – táhněte uzly/úsečky dráhy; ➕/➖ na dráze přidá/smaže pohyb. Vylučuje se s úpravou kontury.">✥ Dráhy</button>
      <button data-act="fit" title="Centrovat">🎯</button>

      <button data-act="simpath" title="Cyklus: 👁 vše → ✂️ jen řezné (bez rychloposuvů) → 🙈 nic" class="cam-sim-active">👁</button>
      <button data-act="zlimits" title="Z-limity: čelisti, koník + rozsah obrábění (klikněte a táhněte čáry)">📏</button>
      <button data-act="snap" title="SNAP: přichytávání k bodům a hranám kontury/polotovaru (jako v CAD) – konce, středy, oblouky, úsečky" class="cam-sim-active">🧲</button>
      <button data-act="profile" title="Trasovat profil po kontuře (klikejte na body, Enter = dokončit, Esc = zrušit)">📈</button>
      <button data-act="profile-apply" title="Použít trasovaný profil jako novou konturu" class="cam-sim-preview-btn" style="display:none">✅</button>
      <button data-act="profile-cancel" title="Zrušit náhled profilu" class="cam-sim-preview-btn" style="display:none">❌</button>
      <button data-act="toggle-controls" title="Skrýt / zobrazit hlavní ovládací tlačítka" style="font-size:11px;padding:4px 8px">«»</button>
    </div>
    <div class="cam-sim-canvas-wrap"><canvas></canvas><div class="cam-sim-time-overlay"></div>
      <button class="cam-sim-trace-cancel" data-act="trace-cancel" title="Zrušit poslední bod / vypnout trasování (Esc)">✗ Zrušit</button>
      <button class="cam-sim-trace-confirm" data-act="trace-confirm" title="Dokončit trasování profilu (Enter)">✓ Dokončit</button>
    </div>
    <div class="cam-sim-progress-bar">
      <div class="cam-sim-progress-track"><div class="cam-sim-progress-fill"></div></div>
      <span class="cam-sim-progress-pct">0%</span>
    </div>
    <div class="cam-sim-player-bar">
      <button class="cam-sim-code-toggle" data-act="toggle-code" title="Skrýt/zobrazit G-kód panel">▼</button>
      <button data-act="step-back" title="Krok zpět – předchozí pohyb">⏮</button>
      <button data-act="play" title="Spustit/Pauza">▶</button>
      <button data-act="stop" title="Zastavit a vrátit na začátek">⏹</button>
      <button data-act="step-fwd" title="Krok vpřed – další pohyb">⏭</button>
      <div class="cam-sim-speed-group">
        <button data-act="speed-down" title="Zpomalit">▼</button>
        <span class="cam-sim-speed-label">1×</span>
        <button data-act="speed-up" title="Zrychlit">▲</button>
      </div>
      <button data-act="sbl" title="Single block – krok po blocích G-kódu" style="font-size:11px;font-weight:bold;letter-spacing:0.5px">SBL</button>
    </div>
    <div class="cam-sim-code-area">
      <div class="cam-sim-code-bar">
        <span style="font-weight:bold">G-CODE</span>
        <div class="cam-sim-code-btns">
          <button data-code="refresh" title="Přegenerovat dráhy z aktuální kontury a parametrů (přepíše ruční úpravy G-kódu)">🔄 Dráhy</button>
          <button data-code="editor" title="Otevřít v CAM Editoru pro úpravu">🔧 Editor</button>
          <button data-code="to-canvas" title="Vrátit konturu na plátno pro úpravu">📐 Kreslit</button>
          <button data-code="save-prog" title="Uložit celý projekt (kontura + parametry + G-kód) do souboru .camprog">💾 Uložit</button>
          <button data-code="show-sidebar" title="Zobrazit/skrýt boční panel — editor kontury, parametry stroje/nástroje/hrubování a import">⚙ Nast.</button>
          <button data-code="load-prog" title="Načíst projekt ze souboru .camprog">📂 Načíst</button>
        </div>
      </div>
      <div class="cam-sim-code-wrap">
        <div class="cam-sim-code-backdrop"></div>
        <textarea class="cam-sim-manual-ta" spellcheck="false"
          placeholder="Zde můžete psát vlastní G-kód..."></textarea>
      </div>
    </div>
  </div>
  <div class="cam-sim-sidebar" style="display:none">
    <div class="cam-sim-header">
      <h2>🔄 CAM Simulátor</h2>
      <div class="cam-sim-undo-btns">
        <button data-act="undo" title="Zpět">↩</button>
        <button data-act="redo" title="Vpřed">↪</button>
        <button data-act="hide-sidebar" title="Zpět na G-kód">◀</button>
      </div>
    </div>
    <div class="cam-sim-errors" style="display:none"></div>
    <div class="cam-sim-tabs">
      <button data-tab="editor" class="cam-sim-active">✏ Editor</button>
      <button data-tab="params">⚙ Parametry</button>
      <button data-tab="import">📥 Import</button>
    </div>
    <div class="cam-sim-tab-body"></div>
  </div>
</div>`;

  const overlay = makeOverlay('cam-simulator', '🔄', bodyHTML, 'cam-sim-window');
  if (!overlay) return;

  // Místo nápisu „CAM Simulátor" tlačítka Zpět/Vpřed (historie úprav)
  // a tlačítko kalkulačky do titlebaru
  let undoTitleBtn = null, redoTitleBtn = null;
  const camToolbar = overlay.querySelector('.cam-sim-toolbar');
  const titlebar = overlay.querySelector('.calc-titlebar');
  if (camToolbar) {
    undoTitleBtn = document.createElement('button');
    undoTitleBtn.title = 'Zpět';
    undoTitleBtn.textContent = '↩';
    undoTitleBtn.addEventListener('click', (e) => { e.stopPropagation(); undo(); });

    redoTitleBtn = document.createElement('button');
    redoTitleBtn.title = 'Vpřed';
    redoTitleBtn.textContent = '↪';
    redoTitleBtn.addEventListener('click', (e) => { e.stopPropagation(); redo(); });

    const calcBtn = document.createElement('button');
    calcBtn.title = 'Kalkulačka';
    calcBtn.textContent = '🔢';
    calcBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      import('../ui.js').then(m => m.openCalculator());
    });

    const sep = document.createElement('span');
    sep.className = 'cam-sim-toolbar-sep';

    const origClose = titlebar?.querySelector('.calc-close-btn');
    let safeClose = null;
    if (origClose) {
      safeClose = origClose.cloneNode(true);
      origClose.replaceWith(safeClose);
      safeClose.addEventListener('click', async (e) => {
        e.stopPropagation();
        const dirty = S.past.length > 0 || S.manualGCode !== _initialGCode;
        if (!dirty) { overlay.remove(); return; }
        const choice = await camCloseConfirm();
        if (choice === 'discard') overlay.remove();
        else if (choice === 'save') {
          await handleSendToCanvas(true);
          // handleSendToCanvas calls overlay.remove() on success; if it returned
          // early (e.g. < 2 contour points), the overlay stays open intentionally
          // so the user can fix the contour and try again.
        }
      });
    }

    camToolbar.appendChild(sep);
    camToolbar.appendChild(undoTitleBtn);
    camToolbar.appendChild(redoTitleBtn);
    camToolbar.appendChild(calcBtn);
    if (safeClose) camToolbar.appendChild(safeClose);
  }

  // Hide floating calculators, canvas buttons and sidebar when CAM is open
  document.querySelectorAll('.calc-overlay-float').forEach(el => { el.style.display = 'none'; });
  const sidebarEl = document.getElementById('sidebar');
  if (sidebarEl) sidebarEl.style.display = 'none';
  const calcBtn = document.getElementById('canvasCalcBtn');
  const clipBtn = document.getElementById('canvasClipBtn');
  if (calcBtn) calcBtn.style.display = 'none';
  if (clipBtn) clipBtn.style.display = 'none';
  const restoreOnClose = () => {
    document.querySelectorAll('.calc-overlay-float').forEach(el => { el.style.display = ''; });
    if (sidebarEl) sidebarEl.style.display = '';
    if (calcBtn) calcBtn.style.display = '';
    // Obnovit viditelnost schránky podle jejího obsahu (skrytá, když je prázdná)
    if (clipBtn) setCalcClipboardValue(getCalcClipboardValue());
    // Uchovat geometrii nástroje pro knihovnu nožů i po zavření CAM.
    _savedCamTool = _pickCamTool(S.params);
    _activeCamParams = null;
  };
  const camCleanupObs = new MutationObserver(() => {
    if (!document.body.contains(overlay)) { restoreOnClose(); document.removeEventListener('keydown', traceKeyHandler, true); camCleanupObs.disconnect(); }
  });
  camCleanupObs.observe(document.body, { childList: true });

  // Enter = dokončit trasování profilu, Esc = zrušit body / vypnout režim.
  // Zachycuje se v capture fázi a stopImmediatePropagation, aby Esc nezavřel celý overlay.
  const traceKeyHandler = (e) => {
    if (!S.profileTraceMode) return;
    if (e.key === 'Escape') {
      e.stopImmediatePropagation(); e.preventDefault();
      _cancelTraceStep();
    } else if (e.key === 'Enter') {
      e.stopImmediatePropagation(); e.preventDefault();
      _finishProfileTrace();
    }
  };
  document.addEventListener('keydown', traceKeyHandler, true);

  // ── STATE ──
  const S = {
    editMode: 'contour',
    contourPoints: [
      { id: 1, type: 'G0', x: 0, z: 0, r: 0, mode: 'ABS' },
      { id: 2, type: 'G1', x: 20, z: 0, r: 0, mode: 'ABS' },
      { id: 3, type: 'G1', x: 20, z: -15, r: 0, mode: 'ABS' },
      { id: 4, type: 'G1', x: 30, z: -15, r: 0, mode: 'ABS' },
      { id: 5, type: 'G1', x: 35, z: -25, r: 0, mode: 'ABS' },
      { id: 6, type: 'G1', x: 35, z: -40, r: 0, mode: 'ABS' },
      { id: 7, type: 'G2', x: 55, z: -50, r: 10, mode: 'ABS' },
      { id: 8, type: 'G1', x: 55, z: -55, r: 0, mode: 'ABS' },
      { id: 81, type: 'G1', x: 45, z: -55, r: 0, mode: 'ABS' },
      { id: 82, type: 'G1', x: 45, z: -60, r: 0, mode: 'ABS' },
      { id: 83, type: 'G1', x: 55, z: -60, r: 0, mode: 'ABS' },
      { id: 9, type: 'G1', x: 55, z: -65, r: 0, mode: 'ABS' },
      { id: 10, type: 'G3', x: 65, z: -75, r: 12, mode: 'ABS' },
      { id: 11, type: 'G1', x: 80, z: -100, r: 0, mode: 'ABS' }
    ],
    stockPoints: [
      { id: 101, type: 'G0', x: 85, z: 2, r: 0, mode: 'ABS' },
      { id: 102, type: 'G1', x: 85, z: -105, r: 0, mode: 'ABS' },
      { id: 103, type: 'G1', x: 0, z: -105, r: 0, mode: 'ABS' }
    ],
    params: _defaultCamParams(),
    view: { scale: 3, panX: 600, panY: 350 },
    flipX: state.flipX,
    flipZ: state.flipZ,
    // Z-osa limity (čelisti/koník) a rozsah obrábění – hodnoty v Z (null = vypnuto)
    zLimits: { chuck: null, tail: null, chuckActive: false, tailActive: false, rangeStart: null, rangeEnd: null, rangeActive: false },
    // 'off' = skryto, 'fixtures' = čelisti + koník, 'range' = rozsah obrábění,
    // 'both' = vše. Cyklus: off → fixtures → range → both → off.
    showZLimits: 'off',
    // X-osa rozsah obrábění – poloměry v mm (null = neomezeno).
    xLimits: { rangeXMin: null, rangeXMax: null, active: false },
    // 'all' = vše, 'cut' = jen řezné (G1/G2/G3, skryje G0 rychloposuvy),
    // 'none' = nic. Cyklus: all → cut → none → all.
    showSimPath: 'all',
    draggedLimit: null, // 'chuck' | 'tail' | 'rangeStart' | 'rangeEnd' | 'rangeXMin' | 'rangeXMax' nebo null
    simRunning: false, simProgress: 0,
    manualGCode: '',
    generatedCode: [], errors: [],
    past: [], future: [],
    draggedPointId: null, hoverPointId: null,
    isDragging: false, addPointMode: false, pointDragEnabled: false,
    gcodeEditEnabled: false,   // úprava drah (G-kód) – nezávislá na pointDragEnabled
    snapEnabled: true,   // SNAP přichytávání zapnuté hned po načtení
    controlsHidden: false,
    // Upichnutí: klikací režim pro určení Z roviny řezu (part-off).
    partOffPickMode: false,
    // Zapamatovaná geometrie destičky zvlášť pro každý tvar (délka hrany/šířka,
    // natočení, vrchol, hřbet) — aby přepnutí tvaru nepřepsalo hodnoty jiného.
    _shapeGeomMem: {},
    // Trasování profilu (klikací nástroj) — body, segmenty a náhled výsledné kontury
    profileTraceMode: false,
    _tracePoints: [],   // [{x, z}] absolutní world souřadnice (rádius, Z)
    _traceSegs: [],     // [{type:'G1'|'G2'|'G3', dist, r, cx, cz}] – segment od _tracePoints[i] do [i+1]
    _previewContour: null, // číslovaná náhledová kontura čekající na potvrzení
    _refContour: null,      // záloha původní S.contourPoints po dobu náhledu
    // Záloha původní (před-profilové) kontury — drží se i po použití profilu,
    // aby šel profil smazat (❌) a vrátit původní konturu. null = profil není.
    _profileOriginal: null,
    activeTab: 'editor', simSpeed: 1,
    singleBlock: false, simBlockTarget: null,
    _animId: null, _lastMouse: { x: 0, y: 0 }, _lastPinch: null,
    _cachedCalc: null, _hoverIsStock: false, _hoverPartOff: null,
    selectedPoints: new Set(),
    rectSelecting: false,
    rectStart: null,
    rectEnd: null,
    snapLines: [],
    // Pomocné (konstrukční) čáry — např. tečny z nástroje Úhel. Reálné
    // souřadnice (X = rádius), nejsou součástí kontury ani G-kódu.
    guideLines: [],
    _lastTapTime: 0,
    machineConfigOpen: false,
    safetyConfigOpen: false,
    materialConfigOpen: false,
    selectedMaterial: 'Ocel 11 373 (S235)',
    toolConfigOpen: false,
    machiningConfigOpen: false,
    machiningSubTab: 'hrub',
    errorsOpen: false,
    // Zásobník nástrojů — revolverový stroj
    toolMagazine: [],      // pole slotů, každý viz _defaultMagSlot()
    activeMagazineSlot: null,  // index aktivního slotu (null = zásobník nepoužit)
    editingMagazineSlot: null  // index právě editovaného slotu (rozbalená karta)
  };

  // Load from localStorage
  const STORAGE_KEY = 'skica-cam-simulator';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const p = JSON.parse(saved);
      if (p.params) Object.assign(S.params, p.params);
      if (Array.isArray(p.toolMagazine)) S.toolMagazine = p.toolMagazine;
      if (p.activeMagazineSlot !== undefined) S.activeMagazineSlot = p.activeMagazineSlot;
      // Migrace: dřívější roughingStrategy 'backside' → podélně + směr zleva.
      if (S.params.roughingStrategy === 'backside') {
        S.params.roughingStrategy = 'longitudinal';
        S.params.roughingSide = 'left';
      }
      if (p.contourPoints && p.contourPoints.length > 0) S.contourPoints = p.contourPoints;
      if (p.stockPoints && p.stockPoints.length > 0) S.stockPoints = p.stockPoints;
      // Uložené dráhy použij jen když odpovídají AKTUÁLNÍ verzi logiky
      // generování (jinak jsou zastaralé) — prázdný manualGCode se níž
      // (řádek ~3270) automaticky přegeneruje z kontury/parametrů.
      if (p.manualGCode && p.pathLogicVersion === PATH_LOGIC_VERSION) S.manualGCode = p.manualGCode;
      // flipX/flipZ se načítají výhradně ze state.flipX/flipZ (sdílený stav s CAD); ignorujeme localStorage
      if (Array.isArray(p.profileOriginal)) S._profileOriginal = p.profileOriginal;
      if (Array.isArray(p.guideLines)) S.guideLines = p.guideLines;
      if (p.zLimits) Object.assign(S.zLimits, p.zLimits);
      if (p.xLimits) Object.assign(S.xLimits, p.xLimits);
      if (p.showZLimits !== undefined) {
        // Zpětná kompatibilita: boolean → on/off, staré 'fixtures'/'range'/'both' → 'on'.
        if (typeof p.showZLimits === 'boolean') S.showZLimits = p.showZLimits ? 'on' : 'off';
        else if (p.showZLimits === 'off') S.showZLimits = 'off';
        else {
          S.showZLimits = 'on';
          // Starý formát neměl active flagy — odvodit z tri-state hodnoty.
          if (p.zLimits && !('chuckActive' in p.zLimits)) {
            S.zLimits.chuckActive = p.showZLimits === 'fixtures' || p.showZLimits === 'both';
            S.zLimits.tailActive  = p.showZLimits === 'fixtures' || p.showZLimits === 'both';
            S.zLimits.rangeActive = p.showZLimits === 'range'    || p.showZLimits === 'both';
          }
        }
      }
      if (p.showSimPath !== undefined) {
        // Zpětná kompatibilita: dříve byl boolean, teď string.
        if (typeof p.showSimPath === 'boolean') S.showSimPath = p.showSimPath ? 'all' : 'none';
        else if (['all', 'cut', 'none'].includes(p.showSimPath)) S.showSimPath = p.showSimPath;
      }
    }
  } catch (_) { /* ignore */ }

  // Závit nakreslený v CAD (nástroj Závit ukládá metadata threadInfo na
  // úsečku hřbetu) → předvyplnit parametry záložky Závit. Aktivace
  // (threadActive) zůstává na uživateli.
  try {
    const _thObj = (state.objects || []).find(o => o && o.threadInfo && !o.isStock);
    if (_thObj) {
      const ti = _thObj.threadInfo;
      S.params.threadName = ti.name;
      S.params.threadType = ti.type || 'mc';
      S.params.threadDiameter = ti.D;
      S.params.threadPitch = ti.P;
      S.params.threadAngle = ti.angle || 60;
      S.params.threadDepth = ti.H;
      S.params.threadExternal = ti.external !== false;
      S.params.threadZStart = ti.zStart;
      S.params.threadZEnd = ti.zEnd;
      // Konec v zápichu DIN 76 → výběh do zápichu ≈ polovina jeho šířky;
      // bez zápichu nech výchozí/naposledy zadaný výběh.
      if (ti.undercut && ti.undercut.f) S.params.threadRunOut = Math.round(ti.undercut.f / 2 * 10) / 10;
      // Spodní strana závitového plátku dle typu (Tr/Acme = dno profilu).
      S.params.toolTipFlat = (ti.type === 'tr' || ti.type === 'acme')
        ? Math.round(0.366 * ti.P * 100) / 100 : 0.1;
      // CAD nástroj Závit kreslí válcové závity — případný dřívější kužel zrušit.
      S.params.threadTaperRatio = 0;
      setTimeout(() => showToast(`🧵 Z výkresu načten závit ${ti.name} — parametry v záložce Závit`), 600);
    }
  } catch (_) { /* ignore */ }

  // Synchronizace s módem canvasu — bez toho se G-kód vyexportovaný v RADIUS
  // módu interpretuje v CAMu v DIAMON (default) a kontura se vykreslí na
  // poloviční pozici. Mód v CAMu by neměl měnit fyzické umístění kontury.
  if (state.xDisplayMode === 'radius') S.params.mode = 'RADIUS';
  else if (state.xDisplayMode === 'diameter') S.params.mode = 'DIAMON';

  // Parse initial contour (+ volitelně polotovar) z G-kódu pokud byl předán.
  // CNC export v CAD obaluje polotovar značkami STOCK_START/END, takže ho
  // umíme přečíst rovnou z G-kódu bez druhého kanálu.
  let _importedContour = false;
  let _importedStockFromGCode = false;
  if (initialContour && typeof initialContour === 'string' && initialContour.trim()) {
    const parsed = parseContourAndStockGCode(initialContour);
    if (parsed.contour.length > 0) { S.contourPoints = parsed.contour; _importedContour = true; }
    if (parsed.stock.length >= 2) {
      S.stockPoints = parsed.stock;
      S.params.stockMode = 'casting';
      _importedStockFromGCode = true;
    }
  }

  // Fallback: pokud G-kód polotovar neobsahoval, zkus přímý canvas import
  // (isStock objekty na plátně). Pomáhá ve scénářích, kdy CAM byl otevřen
  // jinak než přes "Otevřít v CAM" (např. uložený projekt s polotovarem).
  let _stockFromCanvas = false;
  if (!_importedStockFromGCode) {
    try {
      const importedStock = buildStockPointsFromCanvas(S.params);
      if (importedStock.length >= 2) {
        S.stockPoints = importedStock;
        S.params.stockMode = 'casting';
        _stockFromCanvas = true;
      }
    } catch (e) { console.warn('buildStockPointsFromCanvas:', e); }
  }

  // Kontura přišla z CAD, ale polotovar žádný (ani v G-kódu, ani na plátně)
  // → CAD je zdroj pravdy: zahodit STARÝ tvarový polotovar z minulé CAM
  // session (přežíval v localStorage a zobrazoval se u nové kontury).
  // Rozměry náhradního válce dopočítá auto-fit v INITIAL SETUP níže.
  if (_importedContour && !_importedStockFromGCode && !_stockFromCanvas
      && (S.stockPoints.length > 0 || S.params.stockMode === 'casting')) {
    S.stockPoints = [];
    if (S.params.stockMode === 'casting') S.params.stockMode = 'cylinder';
  }

  // Obnovit ručně upravený G-kód uložený při "📐 Kreslit" (CAM → CAD) jako
  // skrytá poznámka na výkrese — má přednost před localStorage/auto kódem,
  // takže ruční úpravy drah přežijí cestu tam a zpět přes CAD.
  const camNoteIdx = state.objects.findIndex(o => o.isCamPathNote);
  if (camNoteIdx !== -1) {
    if (state.objects[camNoteIdx].gcode) S.manualGCode = state.objects[camNoteIdx].gcode;
    state.objects.splice(camNoteIdx, 1);
  }

  // Kód přenesený z CAM editoru (tlačítko 🔄) je upravená dráha (manualGCode) –
  // má přednost před localStorage i auto-generací, aby se úpravy z editoru
  // vrátily zpět do simulátoru, odkud se kód původně bral.
  if (initialGCode && typeof initialGCode === 'string' && initialGCode.trim()) {
    S.manualGCode = initialGCode;
  }

  // Pokud zatím není žádný G-kód (nová kontura, nic uloženo), počáteční
  // obsah editoru vygenerujeme automaticky z kontury/parametrů.
  if (!S.manualGCode || !S.manualGCode.trim()) {
    S.manualGCode = generateAutoGCode(calculate()).map(l => l.text).join('\n');
  }

  // ── DOM refs ──
  const root = overlay.querySelector('.cam-sim-root');
  const canvasWrap = root.querySelector('.cam-sim-canvas-wrap');
  const canvas = canvasWrap.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const codeBackdrop = root.querySelector('.cam-sim-code-backdrop');
  const manualTa = root.querySelector('.cam-sim-manual-ta');
  const timeOverlay = root.querySelector('.cam-sim-time-overlay');
  const progressBar = root.querySelector('.cam-sim-progress-bar');
  const progressFill = root.querySelector('.cam-sim-progress-fill');
  const progressPct = root.querySelector('.cam-sim-progress-pct');
  const speedLabel = root.querySelector('.cam-sim-speed-label');
  const errorsDiv = root.querySelector('.cam-sim-errors');
  const tabBody = root.querySelector('.cam-sim-tab-body');
  // Refresh callback modalu "⚙️ Geometrie", pokud je otevřený — viz fullUpdate().
  // Záměrně NE na S (S.params se snapshotuje/serializuje, funkce tam nepatří).
  let toolGeomModalRefresh = null;
  // Zpřístupnit živé parametry nástroje modulu (knihovna nožů / projekt) a
  // převzít naposledy uložený/načtený nůž, aby přežil zavření a otevření CAM
  // i načtení projektu (viz getCamToolGeometry/applyCamToolGeometry).
  _activeCamParams = S.params;
  if (_savedCamTool) {
    for (const k of CAM_TOOL_KEYS) if (_savedCamTool[k] !== undefined) S.params[k] = _savedCamTool[k];
  }
  bridge.refreshCamToolGeometry = () => { if (toolGeomModalRefresh) toolGeomModalRefresh(); };
  const toolbar = root.querySelector('.cam-sim-toolbar');
  const playerBar = root.querySelector('.cam-sim-player-bar');
  const playBtn = playerBar.querySelector('[data-act="play"]');
  const sidebar = root.querySelector('.cam-sim-sidebar');
  const _initialGCode = S.manualGCode ?? '';

  // Sync Z-limits button — prostý on/off; co se zobrazuje řídí checkboxy v parametrech
  const zlimBtn = toolbar.querySelector('[data-act="zlimits"]');
  const ZLIM_CFG = {
    off: { icon: '📏', active: false, toast: 'Limity skryty' },
    on:  { icon: '📏', active: true,  toast: 'Limity zobrazeny (dle zaškrtnutých v parametrech)' },
  };
  if (zlimBtn) {
    const cfg = ZLIM_CFG[S.showZLimits] || ZLIM_CFG.off;
    zlimBtn.classList.toggle('cam-sim-active', cfg.active);
    zlimBtn.textContent = cfg.icon;
  }
  // Sync sim-path toggle button to persisted state (all/cut/none)
  const simPathBtn = toolbar.querySelector('[data-act="simpath"]');
  if (simPathBtn) {
    const cfg = {
      all:  { icon: '👁',  active: true },
      cut:  { icon: '✂️',  active: true },
      none: { icon: '🙈', active: false },
    }[S.showSimPath] || { icon: '👁', active: true };
    simPathBtn.classList.toggle('cam-sim-active', cfg.active);
    simPathBtn.textContent = cfg.icon;
  }

  // ── HISTORY ──
  function _snapshot() {
    return {
      contour: JSON.parse(JSON.stringify(S.contourPoints)),
      stock: JSON.parse(JSON.stringify(S.stockPoints)),
      guides: JSON.parse(JSON.stringify(S.guideLines || [])),
      gcode: S.manualGCode,
      // Parametry + zásobník/limity — zejména kvůli "🔄 Resetovat vše",
      // ať jde vzít zpět tlačítkem ↩ Zpět.
      params: JSON.parse(JSON.stringify(S.params)),
      toolMagazine: JSON.parse(JSON.stringify(S.toolMagazine || [])),
      activeMagazineSlot: S.activeMagazineSlot,
      zLimits: JSON.parse(JSON.stringify(S.zLimits)),
      xLimits: JSON.parse(JSON.stringify(S.xLimits)),
      showZLimits: S.showZLimits,
      selectedMaterial: S.selectedMaterial
    };
  }
  function _restore(s) {
    S.contourPoints = s.contour;
    S.stockPoints = s.stock;
    if (s.guides) S.guideLines = s.guides;
    if (typeof s.gcode === 'string') S.manualGCode = s.gcode;
    if (s.params) S.params = s.params;
    if (Array.isArray(s.toolMagazine)) S.toolMagazine = s.toolMagazine;
    if ('activeMagazineSlot' in s) S.activeMagazineSlot = s.activeMagazineSlot;
    if (s.zLimits) S.zLimits = s.zLimits;
    if (s.xLimits) S.xLimits = s.xLimits;
    if (s.showZLimits) S.showZLimits = s.showZLimits;
    if (s.selectedMaterial) S.selectedMaterial = s.selectedMaterial;
  }
  function pushHistory() {
    S.past.push(_snapshot());
    S.future = [];
    updateUndoRedoBtns();
  }
  function undo() {
    if (S.past.length === 0) return;
    const prev = S.past.pop();
    S.future.unshift(_snapshot());
    _restore(prev);
    updateUndoRedoBtns();
    fullUpdate();
  }
  function redo() {
    if (S.future.length === 0) return;
    const next = S.future.shift();
    S.past.push(_snapshot());
    _restore(next);
    updateUndoRedoBtns();
    fullUpdate();
  }
  function updateUndoRedoBtns() {
    const uBtn = root.querySelector('[data-act="undo"]');
    const rBtn = root.querySelector('[data-act="redo"]');
    if (uBtn) uBtn.disabled = S.past.length === 0;
    if (rBtn) rBtn.disabled = S.future.length === 0;
    if (undoTitleBtn) undoTitleBtn.disabled = S.past.length === 0;
    if (redoTitleBtn) redoTitleBtn.disabled = S.future.length === 0;
  }

  // ── SAVE ──
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        pathLogicVersion: PATH_LOGIC_VERSION,
        params: S.params, contourPoints: S.contourPoints,
        stockPoints: S.stockPoints, manualGCode: S.manualGCode,
        flipX: S.flipX, flipZ: S.flipZ, guideLines: S.guideLines, profileOriginal: S._profileOriginal,
        zLimits: S.zLimits, showZLimits: S.showZLimits, xLimits: S.xLimits, showSimPath: S.showSimPath,
        toolMagazine: S.toolMagazine, activeMagazineSlot: S.activeMagazineSlot,
      }));
    } catch (_) { /* quota */ }
  }

  // Typ (podélně/čelně) × směr (zprava/zleva) → klíč strategie v registru.
  //   podélně + zprava → longitudinal     podélně + zleva → backside
  //   čelně   + zprava → face             čelně   + zleva → face (zatím
  //   bez zrcadlené varianty — TODO genFaceLeft).
  function roughingKey() {
    const type = S.params.roughingStrategy || 'longitudinal';
    const left = (S.params.roughingSide || 'right') === 'left';
    if (type === 'longitudinal') return left ? 'backside' : 'longitudinal';
    return 'face';
  }

  // Seznam operací hrubování (operations[] model). Dokud neexistuje
  // persistentní S.operations (+ UI), odvodí se z typu × směru jako jediná
  // operace — zachovává dosavadní chování.
  function getRoughingOperations() {
    if (Array.isArray(S.operations) && S.operations.length > 0) return S.operations;
    return [{ kind: roughingKey() }];
  }

  // ── CALCULATED DATA (memoized) ──
  function calculate(lightOnly = false) {
    const prms = S.params;
    const absContour = resolvePointsToAbsolute(S.contourPoints);
    const absStock = resolvePointsToAbsolute(S.stockPoints);
    let worldPoints = absContour.map(p => ({ ...p, xReal: prms.mode === 'DIAMON' ? p.xAbs / 2 : p.xAbs, zReal: p.zAbs }));
    const stockWorldPoints = absStock.map(p => ({ ...p, xReal: prms.mode === 'DIAMON' ? p.xAbs / 2 : p.xAbs, zReal: p.zAbs }));
    // Oboustranně nakreslenou konturu (vrch i zrcadlený spodek) složit na stranu
    // polotovaru — jinak by se offsetovala a obráběla i zrcadlená −X půlka.
    worldPoints = foldContourToMachiningSide(worldPoints, stockWorldPoints);

    // Lehký přepočet pro PLYNULÉ tažení bodů: spočítá jen body kontury/
    // polotovaru (z nich draw() kreslí konturu) + obrys polotovaru. Dráhy/
    // offsety/hrubování/simulace se NEpočítají — to je drahé a přepočítá se
    // až po puštění myši. Po dobu tažení se proto dráhy SKRYJÍ (prázdná pole
    // níže) a po puštění (handleMouseUp → plný calculate()) se zase ukážou.
    if (lightOnly) {
      const stockPathSegments = [];
      for (let i = 0; i < stockWorldPoints.length - 1; i++) {
        const p1 = stockWorldPoints[i], p2 = stockWorldPoints[i + 1], type = p2.type;
        if (type === 'G1') {
          stockPathSegments.push({ type: 'line', p1: { x: p1.xReal, z: p1.zReal }, p2: { x: p2.xReal, z: p2.zReal } });
        } else if (type === 'G2' || type === 'G3') {
          const arc = getArcParams({ x: p1.xReal, z: p1.zReal }, { x: p2.xReal, z: p2.zReal }, p2.rVal, type);
          const startAngle = Math.atan2(p1.xReal - arc.cx, p1.zReal - arc.cz);
          const endAngle = Math.atan2(p2.xReal - arc.cx, p2.zReal - arc.cz);
          stockPathSegments.push({ type: 'arc', ...arc, dir: type, startAngle, endAngle });
        }
      }
      let stockTopX = (parseFloat(prms.stockDiameter) || 0) / 2;
      if (prms.stockMode === 'casting' && stockWorldPoints.length > 0) {
        stockTopX = -9999;
        stockWorldPoints.forEach(p => { if (p.xReal > stockTopX) stockTopX = p.xReal; });
      }
      return {
        worldPoints, stockWorldPoints, contourSegments: [], machinableContour: null,
        offsetPath: [], finishOffsetPath: [], finishUnreachablePath: [], stockPathSegments,
        passes: [], simPath: [], retractDist: parseFloat(prms.retractDistance) || 2.0,
        totalPathLength: 0, estimatedTimeSeconds: 0,
        interferenceSegments: [], flankSegments: [], interferenceGuides: [], stockTopX,
      };
    }

    const tipR = parseFloat(prms.toolRadius) || 0;
    const allowanceX = parseFloat(prms.allowanceX) || 0;
    const allowanceZ = parseFloat(prms.allowanceZ) || 0;
    const finishAllowance = parseFloat(prms.finishAllowance) || 0;
    const totalOffset = tipR + Math.max(allowanceX, allowanceZ) + finishAllowance;
    const retractDist = parseFloat(prms.retractDistance) || 2.0;

    let contourSegments = [];
    let rawOffsets = [];
    let finishOffsetPath = [];
    // Dokončovací offset úseků, kam destička nedosáhne (Hlídat geometrii):
    // nestrojí se, ale vykreslí se tečkovaně a blokuje rychloposuvy.
    let finishUnreachablePath = [];
    let stockPathSegments = [];
    const foundErrors = [];

    // Upichnutí (part-off): polygonální destička nemá definovaný zápichový
    // profil → varovat a nevytvářet dráhy (viz partOffGeom / generateAutoGCode).
    if (prms.partOffZ != null && isFinite(parseFloat(prms.partOffZ)) && prms.toolShape === 'polygon') {
      foundErrors.push({ type: 'warning', msg: 'Upichnutí: polygonální (kosočtvercová) destička není podporována — zvol kulatý nebo upichovací plátek. Dráhy nevygenerovány.' });
    }

    for (let i = 0; i < worldPoints.length - 1; i++) {
      const p1 = worldPoints[i], p2 = worldPoints[i + 1], type = p2.type;
      // G0 = export vygeneroval pouze "přesun" mezi dvěma nesouvisejícími
      // entitami (mezera mezi nimi v CADu nic nemá nakresleno) — takový
      // segment NENÍ součástí kontury a nesmí se obrábět ani zobrazovat
      // jako spojnice (viz removeContourSelfIntersections/chainBreak níže).
      if (type === 'G1') {
        contourSegments.push({ type: 'line', p1: { x: p1.xReal, z: p1.zReal }, p2: { x: p2.xReal, z: p2.zReal }, orig: p2, origIdx: i + 1 });
      } else if (type === 'G2' || type === 'G3') {
        const arc = getArcParams({ x: p1.xReal, z: p1.zReal }, { x: p2.xReal, z: p2.zReal }, p2.rVal, type);
        if (arc.error) foundErrors.push(`Řádek ${i + 2}: Rádius R${p2.r} je příliš malý.`);
        else if (arc.r < totalOffset) foundErrors.push(`KOLIZE (Řádek ${i + 2}): Rádius kontury menší než nástroj.`);
        const startAngle = Math.atan2(p1.xReal - arc.cx, p1.zReal - arc.cz);
        const endAngle = Math.atan2(p2.xReal - arc.cx, p2.zReal - arc.cz);
        contourSegments.push({ type: 'arc', ...arc, p1: { x: p1.xReal, z: p1.zReal }, p2: { x: p2.xReal, z: p2.zReal }, dir: type, startAngle, endAngle, origIdx: i + 1 });
      }
    }
    // Odfiltrovat degenerované (nulové délky) segmenty dříve než normalizeContourDirection:
    // segment G0→G1 na stejném bodě (kreslení záměrně začíná na bodu bez pohybu)
    // by způsobil, že slepá-odbočka check zahodí správně otočené čelní segmenty —
    // konec degenerátu = konec otočeného čela → detekováno jako slepá odbočka.
    contourSegments = contourSegments.filter(s => {
      const p1 = s.type === 'line' ? s.p1 : null;
      const p2 = s.type === 'line' ? s.p2 : null;
      if (!p1 || !p2) return true; // arcs kept
      return Math.hypot(p2.x - p1.x, p2.z - p1.z) > 1e-4;
    });
    // Sjednotit směr průchodu kontury (otočit pozpátku nakreslené entity, např.
    // oblouk) — jinak je offsetový trimmer nenaváže a zahodí (chybějící dráhy).
    normalizeContourDirection(contourSegments);
    // Snapshot PŘED přemostěním/odstraněním smyček — spliceBridgeSegments
    // může segmenty (např. malý zaoblovací rádius pod mostem) z kontury
    // úplně odstranit, protože dráha tam nepojede. Pro detekci kolize
    // tvaru destičky (interferenceSegments níže) ale potřebujeme i tyto
    // odstraněné segmenty — i když se neobrábí, destička by je při
    // přejezdu mostu mohla narážet, takže uživatel o nich má vědět.
    const rawContourForInterference = contourSegments.map(s => structuredClone(s));
    // Nejprve "mostové" segmenty (nově nakreslený úsek, který oběma konci
    // dopadá doprostřed jiných segmentů přes G0 mezeru) zařadíme na jejich
    // geometrické místo v kontuře — nahradí úsek, který přemosťují.
    if (contourSegments.length > 2) {
      contourSegments = spliceBridgeSegments(contourSegments);
    }
    // Odstranění samoprotnutí (global loop-removal) se dělá nad CELOU
    // konturou napříč G0 mezerami — nový segment může "podjet" pod
    // stávající konturu i přes místo, kde CAD export vložil G0 přeskok
    // (segmenty na sebe geometricky nenavazují, ale protnutí mezi nimi
    // pořád určuje, kde se má vnitřní smyčka vyříznout).
    // Profilování: průchod grafem — v každém uzlu se dvěma výstupy
    // vybere vnější (vyšší X) větev, nebo větev z Hlídání geometrie (fromInsert).
    // Snapshot originálu se použije pro kreslení ztlumeného pozadí.
    const rawContourForProfile = contourSegments.map(s => structuredClone(s));
    let profileModeActive = false;
    // Výběr vnější větve běží VŽDY (nezávisle na přepínači „Auto profil") —
    // aktivuje se jen u kontur s větvením (z bodu vychází víc segmentů) nebo
    // se samoprotnutím, čistých kontur se nedotkne. Tím se uzavřené tvary
    // a zpětné úsečky vyloučí jak pro generování drah, tak pro hlídání
    // geometrie destičky (profileModeActive níže přepočítá interference).
    if (contourSegments.length > 2) {
      const { segs: outerSegs, hadBranches } = resolveOuterProfile(contourSegments);
      if (hadBranches) {
        contourSegments = outerSegs;
        profileModeActive = true;
      }
    }
    // Klasické odstranění smyček (self-intersection) jako fallback.
    if (contourSegments.length > 2) {
      const lenBefore = contourSegments.length;
      contourSegments = removeContourSelfIntersections(contourSegments);
      if (!profileModeActive && contourSegments.length < lenBefore)
        profileModeActive = true;
    }
    // Až po vyříznutí smyček označíme zbývající skutečné mezery (G0
    // přeskoky, které se nepodařilo/nemělo spojit ořezem) jako chainBreak —
    // tam dráha najede rychloposuvem místo spojovacího řezu/čáry.
    for (let i = 1; i < contourSegments.length; i++) {
      const prevEnd = segEndPoint(contourSegments[i - 1]);
      const curStart = segStartPoint(contourSegments[i]);
      if (Math.hypot(curStart.x - prevEnd.x, curStart.z - prevEnd.z) > 1e-4) {
        contourSegments[i].chainBreak = true;
      }
    }
    // Slepá odbočka: chainBreak segment, jehož KONEC se vrací do bodu, kde
    // kontura už pokračuje (= konec předchozího segmentu). Dráha by sem
    // musela rychloposuvem zajet a zase se vrátit na stejné místo —
    // typicky zbytkový/duplicitní úsek z CADu uvnitř kontury, který nejde
    // obrobit. Odstranit a nahlásit jako varování.
    for (let i = contourSegments.length - 1; i >= 1; i--) {
      const seg = contourSegments[i];
      if (!seg.chainBreak) continue;
      const segEnd = segEndPoint(seg);
      const prevEnd = segEndPoint(contourSegments[i - 1]);
      if (Math.hypot(segEnd.x - prevEnd.x, segEnd.z - prevEnd.z) < 1e-4) {
        foundErrors.push({ type: 'warning', msg: `POZNÁMKA: Uzavřená odbočka kontury u X${segEnd.x.toFixed(2)} Z${segEnd.z.toFixed(2)} nelze obrobit — vynechána.` });
        contourSegments.splice(i, 1);
        if (i < contourSegments.length) {
          const nextSeg = contourSegments[i];
          const nextStart = segStartPoint(nextSeg);
          nextSeg.chainBreak = Math.hypot(nextStart.x - prevEnd.x, nextStart.z - prevEnd.z) > 1e-4;
        }
      }
    }
    for (let i = 0; i < stockWorldPoints.length - 1; i++) {
      const p1 = stockWorldPoints[i], p2 = stockWorldPoints[i + 1], type = p2.type;
      if (type === 'G1') {
        stockPathSegments.push({ type: 'line', p1: { x: p1.xReal, z: p1.zReal }, p2: { x: p2.xReal, z: p2.zReal } });
      } else if (type === 'G2' || type === 'G3') {
        const arc = getArcParams({ x: p1.xReal, z: p1.zReal }, { x: p2.xReal, z: p2.zReal }, p2.rVal, type);
        const startAngle = Math.atan2(p1.xReal - arc.cx, p1.zReal - arc.cz);
        const endAngle = Math.atan2(p2.xReal - arc.cx, p2.zReal - arc.cz);
        stockPathSegments.push({ type: 'arc', ...arc, dir: type, startAngle, endAngle });
      }
    }

    // Detekce kolize tvaru destičky s konturou (vrcholový úhel / natočení) —
    // segmenty, jejichž normála leží mimo úhlový rozsah, který destička
    // bez záběru bočním ostřím pokryje.
    const clearance = getToolClearanceRange(prms, S.flipX);
    const interferenceSegments = [];   // hrot nedosáhne → ovlivňuje dráhy
    const flankSegments = [];           // hřbet koliduje → jen varování + vizualizace
    if (clearance) {
      rawContourForInterference.forEach(seg => {
        const itype = segInterferesWithTool(seg, clearance);
        if (itype === 'tip') interferenceSegments.push(seg);
        else if (itype === 'flank') flankSegments.push(seg);
      });
    }

    // Automatické mezní čáry: jen při zapnutém Hlídání geometrie (jinak by
    // zůstaly vykreslené i po vypnutí). Ruční čáry (S.guideLines) netknuté.
    let interferenceGuides = (clearance && prms.respectInsertGeometry)
      ? computeInterferenceGuides(interferenceSegments, rawContourForInterference, clearance, prms, worldPoints, stockWorldPoints)
      : [];


    // Kontura PŘED vložením mostů z hlídání destičky/držáku. Mostové čáry
    // (fromInsert) jsou POUZE HRANICE hlídání, ne obráběná plocha — po nich
    // se nesmí generovat dokončovací dráha (jela by vzduchem podél mezní
    // čáry). Dokončování proto sleduje TUTO skutečnou konturu a nedosažitelné
    // úseky přeskočí (segInterferesWithTool). Hrubování naopak jede po
    // machinable kontuře (mosty určují, kde má zastavit).
    const preBridgeContour = contourSegments.map(s => structuredClone(s));

    // Automatické profilování: při zapnutém Hlídání geometrie se nedosažitelné
    // úseky kontury nahradí mostovou úsečkou z geometrie destičky a tahle
    // obrobitelná kontura se použije pro offsety/dráhy/CNC.
    let machinableContour = null;
    if (clearance && prms.respectInsertGeometry && !profileModeActive && interferenceGuides.length > 0) {
      // Normální (non-profil) mód. Čáry končící na polotovaru (downOnStock)
      // řeší buildMachinableContour zvlášť: ČELNÍ čára kotvící u kraje kontury
      // zakončí konturu podél sebe (zahodí nedosažitelné čelo k ose), ostatní
      // downOnStock uvnitř kontury zůstanou jen vizualizace (dráhy se nemění).
      const bridgeGuides = interferenceGuides.filter(g => !g._dominated);
      machinableContour = buildMachinableContour(contourSegments, bridgeGuides);
      contourSegments = machinableContour;
      interferenceGuides = interferenceGuides.filter(g =>
        !g._dominated && (
          g.downOnStock ||
          (_locateOnContour(machinableContour, { x: g.x1, z: g.z1 }) &&
           _locateOnContour(machinableContour, { x: g.x2, z: g.z2 }))));
    } else if (clearance && prms.respectInsertGeometry && profileModeActive) {
      // Profil mód: vypočítat interference PŘÍMO Z OUTER PROFILU (ne z rawContourForInterference).
      // Tím guides odpovídají segmentům outer profilu a buildMachinableContour
      // správně přemostí nedosažitelné části (oblouk) bez přepsání celé kontury.
      const profileInterferenceSegs = [];
      contourSegments.forEach(seg => {
        const itype = segInterferesWithTool(seg, clearance);
        if (itype === 'tip') profileInterferenceSegs.push(seg);
      });
      if (profileInterferenceSegs.length > 0) {
        const profileGuides = computeInterferenceGuides(
          profileInterferenceSegs, contourSegments.map(s => structuredClone(s)),
          clearance, prms, worldPoints, stockWorldPoints
        );
        if (profileGuides.length > 0) {
          machinableContour = buildMachinableContour(contourSegments, profileGuides);
          contourSegments = machinableContour;
          interferenceGuides = profileGuides.filter(g =>
            !g._dominated &&
            _locateOnContour(machinableContour, { x: g.x1, z: g.z1 }) &&
            _locateOnContour(machinableContour, { x: g.x2, z: g.z2 }));
        }
      }
    }

    let incompleteMachiningCount = 0;
    // 1. raw offsets — per-axis pro lines (alX v X, alZ v Z), uniformní pro arcs
    for (let i = 0; i < contourSegments.length; i++) {
      const seg = contourSegments[i];
      let offSeg = null;
      if (seg.type === 'line') {
        const n = getNormal(seg.p1, seg.p2);
        const tx = n.x * (tipR + allowanceX + finishAllowance);
        const tz = n.z * (tipR + allowanceZ + finishAllowance);
        offSeg = { type: 'line', p1: { x: seg.p1.x + tx, z: seg.p1.z + tz }, p2: { x: seg.p2.x + tx, z: seg.p2.z + tz } };
      } else if (seg.type === 'arc') {
        // Autodetekce směru z geometrie — nezávisle na G2/G3 z exportu.
        // Důvod: pokud byl arc nakreslen s "obrácenou" CW/CCW volbou
        // (canvas má flipnutou Y), export má prohozený G2/G3 a offset by
        // se pak posílal na špatnou stranu.
        // OUTER (konvexní): |center.x| < |chord_midpoint.x| → offset ven.
        // INNER (konkávní): |center.x| > |chord_midpoint.x| → offset dovnitř.
        const midAbsX = Math.abs((seg.p1.x + seg.p2.x) / 2);
        const centerAbsX = Math.abs(seg.cx);
        const isOuter = centerAbsX < midAbsX;
        let rNew = isOuter ? seg.r + totalOffset : seg.r - totalOffset;
        // Pouze geometricky nemožné (rNew <= 0) zahodíme. Malé ale kladné
        // rNew je legitimní — nástroj sleduje miniaturní oblouk kolem rohu.
        if (rNew <= 0.05) { incompleteMachiningCount++; offSeg = null; }
        else {
          const startAngle = Math.atan2(seg.p1.x - seg.cx, seg.p1.z - seg.cz);
          const endAngle = Math.atan2(seg.p2.x - seg.cx, seg.p2.z - seg.cz);
          offSeg = { type: 'arc', cx: seg.cx, cz: seg.cz, r: rNew, dir: seg.dir, refP1: seg.p1, refP2: seg.p2, startAngle, endAngle };
        }
      }
      if (offSeg) {
        if (seg.chainBreak) offSeg.chainBreak = true;
        rawOffsets.push(offSeg);
      }
    }

    // 2. trimming + loop removal (shared helper handles all segment combos)
    const offsetPath = dropTinyArcs(trimAndRemoveLoops(rawOffsets));

    // finishing offset
    if (prms.doFinishing || prms.finishOnly) {
      // Hlídání destičky: úseky, kam destička bočním ostřím nedosáhne,
      // dokončování vynechá — následující segment dostane chainBreak,
      // takže se přes mezeru přejede rychloposuvem.
      const respectFin = prms.respectInsertGeometry && clearance;
      let finSkipped = 0;
      let pendingBreak = false;
      // Přeryv kvůli NEDOSAŽITELNÉMU úseku (hlídání destičky) — na rozdíl od
      // mikro-přeskoku znamená „tady je díra, další dosažitelný úsek je
      // samostatný ostrov": musí dostat tvrdý chainBreak (rychloposuv k němu)
      // a NESMÍ ho spolknout heuristika zpětného řezu (jinak se sousední
      // stěny natáhnou k sobě do artefaktu — dřív monstrum až za polotovar).
      let unreachBreak = false;
      let finRaw = [];
      // Dokončování jede po SKUTEČNÉ kontuře (bez mostů hlídání) — mostové
      // čáry jsou jen hranice, ne obráběná plocha. Nedosažitelné úseky se
      // přeskočí (blocked). Bez hlídání = machinable == pre-bridge, žádný rozdíl.
      const finContour = respectFin ? preBridgeContour : contourSegments;
      for (let i = 0; i < finContour.length; i++) {
        const seg = finContour[i];
        let blocked = respectFin && segInterferesWithTool(seg, clearance);
        let finSeg = null;
        let trailingBreak = false;   // nedosažitelný konec ZA obloukem → přerušit další segment
        if (seg.type === 'line') {
          const n = getNormal(seg.p1, seg.p2);
          finSeg = { type: 'line', p1: { x: seg.p1.x + n.x * tipR, z: seg.p1.z + n.z * tipR }, p2: { x: seg.p2.x + n.x * tipR, z: seg.p2.z + n.z * tipR } };
        } else if (seg.type === 'arc') {
          // Autodetekce směru z geometrie — viz komentář u rough offsetu.
          const midAbsX = Math.abs((seg.p1.x + seg.p2.x) / 2);
          const centerAbsX = Math.abs(seg.cx);
          const isOuter = centerAbsX < midAbsX;
          let rNew = isOuter ? seg.r + tipR : seg.r - tipR;
          if (rNew > 0.05) {
            const startAngle = Math.atan2(seg.p1.x - seg.cx, seg.p1.z - seg.cz);
            const endAngle = Math.atan2(seg.p2.x - seg.cx, seg.p2.z - seg.cz);
            // Mikro-oblouk z nepatrného rohu (offsetová tětiva < ~0.12 mm) =
            // degenerát; zahodit, jinak vznikne smyčka/„čtyřhran" v offsetu.
            // Sousední segmenty (stěna × most) se pak napojí přímo v průsečíku.
            const ex1 = seg.cx + Math.sin(startAngle) * rNew, ez1 = seg.cz + Math.cos(startAngle) * rNew;
            const ex2 = seg.cx + Math.sin(endAngle) * rNew, ez2 = seg.cz + Math.cos(endAngle) * rNew;
            if (Math.hypot(ex2 - ex1, ez2 - ez1) > 0.12)
              finSeg = { type: 'arc', cx: seg.cx, cz: seg.cz, r: rNew, dir: seg.dir, refP1: seg.p1, refP2: seg.p2, startAngle, endAngle };
          }
        }
        if (!finSeg) { pendingBreak = true; continue; }
        // Částečně nedosažitelný oblouk: špička dojede po vrchol vypuklého rohu,
        // ale ne až do navazující strmé stěny. Místo zahození CELÉHO oblouku ho
        // ořízni na dosažitelnou část (obrobí se) a jako nedosažitelný označ jen
        // konec/začátek za mezí (tečkovaně). Trim je vždy PODMNOŽINA dosažitelné
        // zóny → nikdy nezajede (bezpečné).
        if (blocked && finSeg.type === 'arc') {
          const span = arcReachableSpan(seg, clearance);
          if (span && (span.a1 - span.a0) > 0.03) {
            const s0 = finSeg.startAngle, e0 = finSeg.endAngle;
            // Cíp pod GAP (≈1°) je uvnitř tolerance špičky a končí u sousedního
            // úseku/mostu — přimázne se k obrobené části, nezahazuje se zvlášť.
            const GAP = 0.02;
            const beforeGap = Math.abs(span.a0 - s0) > GAP;
            const afterGap = Math.abs(span.a1 - e0) > GAP;
            const a0use = beforeGap ? span.a0 : s0;
            const a1use = afterGap ? span.a1 : e0;
            const mkUnreach = (aA, aB) => ({
              type: 'arc', cx: finSeg.cx, cz: finSeg.cz, r: finSeg.r, dir: finSeg.dir,
              startAngle: aA, endAngle: aB,
              refP1: { x: seg.cx + Math.sin(aA) * seg.r, z: seg.cz + Math.cos(aA) * seg.r },
              refP2: { x: seg.cx + Math.sin(aB) * seg.r, z: seg.cz + Math.cos(aB) * seg.r },
              unreachable: true,
            });
            if (beforeGap) { finishUnreachablePath.push(mkUnreach(s0, span.a0)); finSkipped++; }
            if (afterGap) { finishUnreachablePath.push(mkUnreach(span.a1, e0)); finSkipped++; }
            // Ořízni obráběný oblouk na dosažitelný podinterval (podmnožina
            // dosažitelné zóny → nikdy nezajede).
            finSeg.startAngle = a0use; finSeg.endAngle = a1use;
            finSeg.refP1 = { x: seg.cx + Math.sin(a0use) * seg.r, z: seg.cz + Math.cos(a0use) * seg.r };
            finSeg.refP2 = { x: seg.cx + Math.sin(a1use) * seg.r, z: seg.cz + Math.cos(a1use) * seg.r };
            if (beforeGap) finSeg.chainBreak = true;   // od předchozího přes nedosažitelný začátek
            if (afterGap) trailingBreak = true;         // další segment přes nedosažitelný konec
            blocked = false;
          }
        }
        if (blocked) {
          // Nedosažitelný úsek: neobrábí se (přerušení dráhy), ale uchová
          // se pro tečkované vykreslení a jako překážka pro rychloposuvy.
          finSkipped++;
          finSeg.unreachable = true;
          finishUnreachablePath.push(finSeg);
          pendingBreak = true;
          unreachBreak = true;
          continue;
        }
        // Po přeskočeném oblouku (pendingBreak): přeskočit přechodný čelní
        // řez, jehož offset začíná na menším X než skončil předchozí segment
        // (nástroj by musel jet dovnitř — vznik trojúhelníkového artefaktu).
        // pendingBreak se smaže, aby se trim mohl spojit přímo s dalším segmentem.
        // VÝJIMKA: mostový úsek z geometrie destičky (fromInsert = konstrukční
        // čára dojezd/zanoření) je ZÁMĚRNÁ dráha — nikdy ho nezahazovat, jinak
        // dokončování zajede ZA konstrukční čáru (oblouk by začal moc brzy).
        // Přeryv po NEDOSAŽITELNÉM úseku (unreachBreak) se neaplikuje: další
        // dosažitelný úsek je samostatný ostrov (rychloposuv k němu), ne zpětný
        // řez ke spolknutí.
        if (!unreachBreak && pendingBreak && finSeg.type === 'line' && !seg.fromInsert && finRaw.length > 0) {
          const prev = finRaw[finRaw.length - 1];
          if (prev.type === 'line' && finSeg.p1.x < prev.p2.x - 0.05) {
            if (finSeg.p2.x < prev.p2.x - 0.05) {
              // Celý segment leží dovnitř → skutečný zpětný řez → zahodit.
              pendingBreak = false;
              continue;
            }
            // p1 dovnitř, p2 vně → reálné osazení/čelo. Trim ho napojí na
            // předchozí segment průsečíkem. Vymazat pendingBreak PŘED chainBreak
            // testem, aby trim spojil plynule bez G0.
            pendingBreak = false;
          }
        }
        // Mostový úsek (fromInsert) nikdy nepřerušovat: jeho konce LEŽÍ na
        // kontuře (spojitý), takže ho trim napojí v průsečíku s předchozím
        // úsekem. Bez výjimky by ho přeskočený mikro/degenerovaný oblouk před
        // ním označil jako chainBreak → dokončování by k němu skočilo G0 a
        // oblouk by začal moc brzy (zajetí za konstrukční čáru).
        if ((seg.chainBreak || pendingBreak) && !seg.fromInsert) finSeg.chainBreak = true;
        // Ostrov za nedosažitelnou dírou: tvrdý přeryv (rapid), ať trim
        // sousední úseky nespojí natažením do artefaktu.
        if (unreachBreak) { finSeg.chainBreak = true; unreachBreak = false; }
        pendingBreak = false;
        finRaw.push(finSeg);
        // Oříznutý oblouk nechal za sebou nedosažitelný konec → další segment
        // se k němu nesmí plynule napojit (přejezd G0 přes nedosažitelný kus).
        if (trailingBreak) pendingBreak = true;
      }
      finishOffsetPath = dropTinyArcs(trimAndRemoveLoops(finRaw));
      // Sanitace: když je R nástroje větší než konkávní rádius kontury
      // (nebo selže ořez), může segment zůstat s null/NaN souřadnicí —
      // zahodit, aby se neemitoval „XNaN", a označit přejezd (chainBreak).
      const finFinite = (s) => s.type === 'line'
        ? [s.p1 && s.p1.x, s.p1 && s.p1.z, s.p2 && s.p2.x, s.p2 && s.p2.z].every(Number.isFinite)
        : [s.cx, s.cz, s.r, s.startAngle, s.endAngle].every(Number.isFinite);
      let finDropped = 0;
      for (let i = finishOffsetPath.length - 1; i >= 0; i--) {
        if (!finFinite(finishOffsetPath[i])) {
          finDropped++;
          finishOffsetPath.splice(i, 1);
          if (i < finishOffsetPath.length) finishOffsetPath[i].chainBreak = true;
        }
      }
      if (finDropped > 0)
        foundErrors.push({ type: 'warning', msg: `Dokončování: ${finDropped} úsek(ů) vynecháno — nástroj (R${tipR}) se nevejde do tvaru kontury (malý poloměr). Přejezd G0.` });
      if (finSkipped > 0)
        foundErrors.push({ type: 'warning', msg: `Hlídání destičky: dokončování vynechá ${finSkipped} úsek(ů), kam destička nedosáhne (přejezd G0).` });

      // ── No-gouge pojistka dokončování („dojet co nejblíž, ale bez zajetí") ──
      // Při soustružení zvenčí musí střed nástroje zůstat na vzduchové straně:
      // X ≥ nejvyšší X kontury na daném Z. Když dokončovací úsek (typicky most
      // z geometrie destičky u úzkého zápichu, kam se destička bokem nevejde)
      // tuhle mez přejede, oříznout ho přesně na hranici a zajíždějící zbytek
      // přesunout do nedosažitelných (tečkovaně, bez řezu). Mez se počítá vůči
      // SKUTEČNÉ kontuře (rawContourForInterference), ne přemostěné.
      const profileXAt = (z) => {
        let mx = -Infinity;
        for (const s of rawContourForInterference) {
          if (s.isDegenerate) continue;
          for (const x of intersectSegAtZ(s, z)) if (x > mx) mx = x;
        }
        return mx;
      };
      const GOUGE_EPS = 0.02;
      const gougeAt = (p) => { const mx = profileXAt(p.z); return mx > -Infinity && p.x < mx - GOUGE_EPS; };
      let finClamped = 0;
      for (let i = finishOffsetPath.length - 1; i >= 0; i--) {
        const s = finishOffsetPath[i];
        if (s.type !== 'line' || !s.p1 || !s.p2) continue;
        // Vzorkovat CELÝ úsek, ne jen konce: dlouhý most z geometrie destičky
        // (přes nedosažitelný stín destičky) má konce ve vzduchu, ale STŘEDEM
        // může proříznout konturu. Kontrola jen koncových bodů to propustí →
        // dráha zajede do materiálu. Úsek se rozseká na nezajíždějící části,
        // zajíždějící střed se přesune do nedosažitelných (tečkovaně, bez řezu).
        const ptAt = (t) => ({ x: s.p1.x + (s.p2.x - s.p1.x) * t, z: s.p1.z + (s.p2.z - s.p1.z) * t });
        const segLen = Math.hypot(s.p2.x - s.p1.x, s.p2.z - s.p1.z);
        const N = Math.max(20, Math.ceil(segLen / 0.5));
        const flags = [];
        let anyGouge = false, allGouge = true;
        for (let k = 0; k <= N; k++) { const g = gougeAt(ptAt(k / N)); flags.push(g); if (g) anyGouge = true; else allGouge = false; }
        if (!anyGouge) continue;
        finClamped++;
        // Přesná hranice (v parametru t) mezi vzorkem t0 a t1 s opačným stavem.
        const boundary = (t0, t1) => {
          let lo = t0, hi = t1; const gLo = gougeAt(ptAt(t0));
          for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (gougeAt(ptAt(m)) === gLo) lo = m; else hi = m; }
          return (lo + hi) / 2;
        };
        if (allGouge) {
          finishUnreachablePath.push({ type: 'line', p1: { ...s.p1 }, p2: { ...s.p2 }, unreachable: true });
          finishOffsetPath.splice(i, 1);
          if (i < finishOffsetPath.length) finishOffsetPath[i].chainBreak = true;
          continue;
        }
        // Nezajíždějící (keep) i zajíždějící (gouge) intervaly v t.
        const keepRuns = [], gougeRuns = [];
        let kStart = flags[0] ? null : 0, gStart = flags[0] ? 0 : null;
        for (let k = 1; k <= N; k++) {
          if (flags[k] === flags[k - 1]) continue;
          const b = boundary((k - 1) / N, k / N);
          if (flags[k - 1]) { gougeRuns.push([gStart, b]); gStart = null; kStart = b; }
          else { keepRuns.push([kStart, b]); kStart = null; gStart = b; }
        }
        if (kStart !== null) keepRuns.push([kStart, 1]);
        if (gStart !== null) gougeRuns.push([gStart, 1]);
        gougeRuns.filter(([a, b]) => b - a > 1e-4).forEach(([a, b]) =>
          finishUnreachablePath.push({ type: 'line', p1: ptAt(a), p2: ptAt(b), unreachable: true }));
        const replacement = keepRuns.filter(([a, b]) => b - a > 1e-3).map(([a, b], idx) => {
          const seg = { type: 'line', p1: ptAt(a), p2: ptAt(b) };
          // Přejezd (G0) před úsek, když mu předchází vyříznutá mezera nebo
          // měl-li přejezd už původní úsek.
          if (a > 1e-6 || idx > 0 || s.chainBreak) seg.chainBreak = true;
          return seg;
        });
        // Konec úseku zajíždí → další segment v řetězu potřebuje přejezd.
        if (flags[N] && i + 1 < finishOffsetPath.length) finishOffsetPath[i + 1].chainBreak = true;
        finishOffsetPath.splice(i, 1, ...replacement);
      }
      if (finClamped > 0)
        foundErrors.push({ type: 'warning', msg: `Dokončování: ${finClamped} úsek(ů) zkráceno, aby dráha nezajela do kontury (zbytek nedosažitelný — viz tečkovaně).` });
    }

    // Protáhnout obě offsetové čáry až k ose, když kontura začíná na X0
    // (čelo do středu). Korekce R jinak nechá u osy neobrobený zbytek.
    if (worldPoints.length > 0 && Math.abs(worldPoints[0].xReal) < 1e-3) {
      extendOffsetStartToAxis(offsetPath);
      extendOffsetStartToAxis(finishOffsetPath);
    }

    if (incompleteMachiningCount > 0)
      foundErrors.push({ type: 'warning', msg: `POZNÁMKA: V ${incompleteMachiningCount} místech nedojde ke kompletnímu obrobení.` });

    if (interferenceSegments.length > 0)
      foundErrors.push({ type: 'warning', msg: `Tvar destičky (vrchol ${prms.toolTipAngle}°, natočení ${prms.toolAngle}°) nedosáhne na ${interferenceSegments.length} úsek(ů) kontury (viz zvýrazněná místa na výkrese).` });
    if (flankSegments.length > 0)
      foundErrors.push({ type: 'warning', msg: `Hřbet destičky (α=${prms.toolClearanceAngle}°): ${flankSegments.length} úsek(ů) je dostupných jen díky vůli hřbetu — hřbet bude v kontaktu s materiálem, riziko otěru (viz oranžové zvýraznění).` });

    // Passes
    const passes = [];
    const step = parseFloat(prms.depthOfCut) || 1;
    const sRad = (parseFloat(prms.stockDiameter) || 100) / 2;
    const stockFace = parseFloat(prms.stockFace) || 0;

    // Rozsah obrábění Z (📐) — aktivní jen když uživatel zaškrtne políčko.
    const rS = S.zLimits.rangeStart, rE = S.zLimits.rangeEnd;
    const machiningRange = (S.zLimits.rangeActive && typeof rS === 'number' && isFinite(rS)
      && typeof rE === 'number' && isFinite(rE))
      ? { zLo: Math.min(rS, rE), zHi: Math.max(rS, rE) } : null;
    // Rozsah obrábění X (📐) — aktivní jen když uživatel zaškrtne políčko.
    const xRn = S.xLimits.rangeXMin, xRx = S.xLimits.rangeXMax;
    const machiningRangeX = (S.xLimits.active && typeof xRn === 'number' && isFinite(xRn)
      && typeof xRx === 'number' && isFinite(xRx))
      ? { xLo: Math.min(xRn, xRx), xHi: Math.max(xRn, xRx) } : null;
    // Čelisti (levý konec v upínači) — backside nesmí řezat pod chuck.
    const chuckZ = (S.zLimits.chuckActive && typeof S.zLimits.chuck === 'number' && isFinite(S.zLimits.chuck))
      ? S.zLimits.chuck : null;

    // ── Sdílené helpery pro offsetPath (čelní i podélné hrubování) ──
    // Horizontální průsečíky segmentů (s kolinárním fallbackem).
    const hIntersect = (segs, xLine, checkDegen) => {
      const out = [];
      for (const seg of segs) {
        if (checkDegen && seg.isDegenerate) continue;
        if (seg.type === 'line') {
          const z = intersectHorizontalLineSegment(xLine, seg.p1, seg.p2);
          if (z !== null) out.push(z);
          else if (Math.abs(seg.p1.x - xLine) < 0.01 && Math.abs(seg.p2.x - xLine) < 0.01) {
            out.push(seg.p1.z, seg.p2.z);
          }
        } else if (seg.type === 'arc') {
          const res = intersectHorizontalLineArc(xLine, { x: seg.cx, z: seg.cz }, seg.r);
          for (const z of res) {
            const angle = Math.atan2(xLine - seg.cx, z - seg.cz);
            if (isAngleBetween(angle, seg.startAngle, seg.endAngle, seg.dir === 'G2')) out.push(z);
          }
        }
      }
      return out;
    };

    // Max X segmentů na zadaném Z. Null pokud Z mimo Z-rozsah segmentů.
    const maxXAt = (segs, z) => {
      let maxX = null;
      for (const seg of segs) {
        if (seg.isDegenerate) continue;
        if (seg.type === 'line') {
          const zMin = Math.min(seg.p1.z, seg.p2.z);
          const zMax = Math.max(seg.p1.z, seg.p2.z);
          if (z < zMin - 0.01 || z > zMax + 0.01) continue;
          const dz = seg.p2.z - seg.p1.z;
          const x = Math.abs(dz) < 1e-6
            ? Math.max(seg.p1.x, seg.p2.x)
            : seg.p1.x + ((z - seg.p1.z) / dz) * (seg.p2.x - seg.p1.x);
          if (maxX === null || x > maxX) maxX = x;
        } else if (seg.type === 'arc') {
          const cosA = (z - seg.cz) / seg.r;
          if (cosA < -1.001 || cosA > 1.001) continue;
          const cosC = Math.max(-1, Math.min(1, cosA));
          const a1 = Math.acos(cosC);
          for (const a of [a1, -a1]) {
            if (isAngleBetween(a, seg.startAngle, seg.endAngle, seg.dir === 'G2')) {
              const x = seg.cx + Math.sin(a) * seg.r;
              if (maxX === null || x > maxX) maxX = x;
            }
          }
        }
      }
      return maxX;
    };
    const offsetXAt = (z) => maxXAt(offsetPath, z);

    // ── Dokončování upichovákem: dráha po OBÁLCE ──
    // Upichovák má šířku — dokončovací dráha po samotném offsetu by na
    // úsecích stoupajících k obrobené straně (zprava = doprava) zajela
    // tělem plátku do tvaru. Obálka x(z) = max offsetu pod celou rovnou
    // částí dna: na stoupajících úsecích tak finální povrch řeže DRUHÝ
    // rádius plátku, na klesajících aktivní roh; vršky přejíždí rovné dno.
    // Do úzkých kapes (užší než plátek) obálka nezajede — zbytek je
    // nedosažitelný stejně jako u hlídání geometrie destičky.
    if (prms.toolShape === 'parting' && (prms.doFinishing || prms.finishOnly) && finishOffsetPath.length > 0) {
      const wInsF = parseFloat(prms.toolLength) || 0;
      const rInsF = Math.min(parseFloat(prms.toolRadius) || 0, wInsF / 2);
      const w2RF = Math.max(0, wInsF - 2 * rInsF);
      const dirMF = (prms.roughingSide === 'left') ? -1 : 1;
      let fzMin = Infinity, fzMax = -Infinity;
      finishOffsetPath.forEach(s => {
        if (s.isDegenerate) return;
        if (s.type === 'line') { fzMin = Math.min(fzMin, s.p1.z, s.p2.z); fzMax = Math.max(fzMax, s.p1.z, s.p2.z); }
        else { fzMin = Math.min(fzMin, s.cz - s.r); fzMax = Math.max(fzMax, s.cz + s.r); }
      });
      if (isFinite(fzMin) && fzMax - fzMin > 0.05) {
        const finXAt = (z) => maxXAt(finishOffsetPath, z);
        // jízdní pořadí = klesající Z (zprava doleva) — jako offsetPath.
        // Kruhové úseky obálky se zpětně proloží G2/G3 (fitArcsToPolyline),
        // ať dokončování není rozsekané na stovky mikro-úseček.
        const pts = samplePartingEnvelope(finXAt, fzMax, fzMin, w2RF, dirMF, 0.4, 0.003);
        if (pts.length >= 2) {
          const fitted = fitArcsToPolyline(pts, 0.02);
          finishOffsetPath = fitted.map(s => s.type === 'line'
            ? { type: 'line', p1: { x: s.p1.x, z: s.p1.z }, p2: { x: s.p2.x, z: s.p2.z }, chainBreak: false }
            : { type: 'arc', p1: { x: s.p1.x, z: s.p1.z }, p2: { x: s.p2.x, z: s.p2.z }, refP1: { x: s.p1.x, z: s.p1.z }, refP2: { x: s.p2.x, z: s.p2.z }, cx: s.cx, cz: s.cz, r: s.r, dir: s.dir, startAngle: s.startAngle, endAngle: s.endAngle, chainBreak: false });
        }
      }
    }

    // Úhel oblouku offsetPath na zadaném Z (jen v rozsahu segmentu).
    const arcAngleAtZ = (seg, z) => {
      const cosA = (z - seg.cz) / seg.r;
      if (cosA < -1.001 || cosA > 1.001) return null;
      const cosC = Math.max(-1, Math.min(1, cosA));
      const a1 = Math.acos(cosC);
      for (const a of [a1, -a1]) {
        if (isAngleBetween(a, seg.startAngle, seg.endAngle, seg.dir === 'G2')) return a;
      }
      return null;
    };

    // Kopie segmentů offsetPath oříznuté na Z∈[zLo,zHi], v pořadí jízdy
    // (od vyššího Z k nižšímu) — podklad pro G1/G2/G3 sledování kontury
    // přes "kapsu"/"schod" místo odskoku a rychloposuvu nad polotovarem.
    const traceOffsetPath = (zHi, zLo) => {
      const out = [];
      // offsetPath je v jízdním pořadí (klesající Z); procházíme dopředu,
      // ať výsledek vyjde také v jízdním pořadí (vysoké Z → nízké Z).
      // Každý segment uvnitř drží x1/z1 = vyšší Z, x2/z2 = nižší Z, takže
      // dopředný průchod = spojitá dráha bez zpětných skoků/oblouků.
      for (let i = 0; i < offsetPath.length; i++) {
        const seg = offsetPath[i];
        if (seg.isDegenerate) continue;
        if (seg.type === 'line') {
          const zA = seg.p1.z, zB = seg.p2.z;
          // Čelní (konstantní-Z) úsek — radiální pohyb v X. Z-klipování by ho
          // zahodilo (clipHi==clipLo), proto ho zařadíme zvlášť v jízdním
          // pořadí (p1→p2), pokud jeho Z leží v rozsahu [zLo, zHi].
          if (Math.abs(zA - zB) < 1e-6) {
            // Uzavírací čelo protínající osu (jede k X≈0) NENÍ soustružnický
            // schod — hrubovací dojezd (leadOut) ho nesmí přejíždět až na osu,
            // jinak vznikne dlouhá radiální dráha přes celé čelo do středu
            // (a odskok pak startuje z osy). Náběhové čelo se sleduje OPAČNĚ
            // (od osy ven), to necháváme — dílo se u něj obrábí normálně.
            const towardAxis = seg.p2.x < seg.p1.x - 1e-6 && seg.p2.x < 0.05;
            if (!towardAxis && zA <= zHi + 1e-6 && zA >= zLo - 1e-6)
              out.push({ type: 'line', x1: seg.p1.x, z1: zA, x2: seg.p2.x, z2: zB });
            continue;
          }
          const hiPt = zA >= zB ? seg.p1 : seg.p2;
          const loPt = zA >= zB ? seg.p2 : seg.p1;
          const clipHi = Math.min(zHi, hiPt.z);
          const clipLo = Math.max(zLo, loPt.z);
          if (clipHi <= clipLo + 1e-6) continue;
          const dz = hiPt.z - loPt.z;
          const xAt = (z) => Math.abs(dz) < 1e-9 ? hiPt.x : loPt.x + (z - loPt.z) / dz * (hiPt.x - loPt.x);
          out.push({ type: 'line', x1: xAt(clipHi), z1: clipHi, x2: xAt(clipLo), z2: clipLo });
        } else if (seg.type === 'arc') {
          const zAtStart = seg.cz + Math.cos(seg.startAngle) * seg.r;
          const zAtEnd = seg.cz + Math.cos(seg.endAngle) * seg.r;
          const reversed = zAtStart < zAtEnd;
          const aAtHiOrig = reversed ? seg.endAngle : seg.startAngle;
          const aAtLoOrig = reversed ? seg.startAngle : seg.endAngle;
          const zSegHi = Math.max(zAtStart, zAtEnd);
          const zSegLo = Math.min(zAtStart, zAtEnd);
          const clipHi = Math.min(zHi, zSegHi);
          const clipLo = Math.max(zLo, zSegLo);
          if (clipHi <= clipLo + 1e-6) continue;
          const aAtClipHi = arcAngleAtZ(seg, clipHi) ?? aAtHiOrig;
          const aAtClipLo = arcAngleAtZ(seg, clipLo) ?? aAtLoOrig;
          const outDir = reversed ? (seg.dir === 'G2' ? 'G3' : 'G2') : seg.dir;
          out.push({
            type: 'arc', cx: seg.cx, cz: seg.cz, r: seg.r, dir: outDir,
            startAngle: aAtClipHi, endAngle: aAtClipLo,
            x1: seg.cx + Math.sin(aAtClipHi) * seg.r, z1: clipHi,
            x2: seg.cx + Math.sin(aAtClipLo) * seg.r, z2: clipLo
          });
        }
      }
      return out;
    };

    // Hledání konce "schodu" pro hrubování bez schodků (podélné): jde po
    // offsetXAt od zFrom (kde offset ≈ hloubka současného průchodu) směrem
    // k menším Z, dokud X offsetu neklesne na targetX (hloubka dalšího
    // průchodu), nebo dokud křivka offsetu nekončí (mimo svůj rozsah).
    const findOffsetXCrossing = (zFrom, targetX, zFloor) => {
      const h = 0.05;
      let z = zFrom;
      let xPrev = offsetXAt(z);
      for (let i = 0; i < 4000; i++) {
        const zNext = z - h;
        if (zNext < zFloor - 1e-6) break;
        const x = offsetXAt(zNext);
        if (x === null) break;
        if (x <= targetX + 1e-6) return zNext;
        // Offset se vzdaluje od cíle (např. dno kapsy) - další sledování by
        // jen zdvojovalo zanoření do kapsy a vytvořilo nebezpečný "návrat na
        // konturu" pro další průchod. Skončit zde beze schodu na tomto místě.
        if (xPrev !== null && x > xPrev + 1e-6) break;
        xPrev = x;
        z = zNext;
      }
      return z;
    };

    // Konec leadOutu z kapsy: na rozdíl od findOffsetXCrossing se NEzastaví,
    // když offset stoupá — sleduje druhou (odvrácenou) stěnu kapsy nahoru
    // (G2/G3) až dokud znovu neklesne na řeznou hloubku depthX (tam pokračuje
    // hlubší průchod), nebo dokud kontura nekončí. Tím se obrobí celá druhá
    // stěna kapsy přímo po obrysu místo odskoku.
    const findPocketExitZ = (zFrom, depthX, zFloor) => {
      const h = 0.05;
      let z = zFrom, leftPocket = false;
      for (let i = 0; i < 8000; i++) {
        const zNext = z - h;
        if (zNext < zFloor - 1e-6) break;
        const x = offsetXAt(zNext);
        if (x === null) break;                       // konec kontury
        if (x > depthX + 0.01) leftPocket = true;    // stoupáme po druhé stěně
        else if (leftPocket && x <= depthX + 1e-6) return zNext; // zpět na hloubku
        z = zNext;
      }
      return z;
    };

    // Konec leadOutu otevřeného (podélného) průchodu pro hrubování bez
    // schodků: po dojezdu na konturu se po ní jede dál, dokud offset buď
    // neklesne na hloubku DALŠÍHO (hlubšího) průchodu nextX — tam to převezme
    // další pas — NEBO nestoupne zpět na hloubku PŘEDCHOZÍHO (mělčího)
    // průchodu prevX — tam je vršek schodu, který už mělčí pas obrobil. Tím
    // se schod mezi sousedními zabery obrobí přímo po obrysu (žádný zbytek).
    const findLeadOutEndZ = (zFrom, prevX, nextX, zFloor) => {
      const h = 0.05;
      let z = zFrom;
      for (let i = 0; i < 8000; i++) {
        const zNext = z - h;
        if (zNext < zFloor - 1e-6) break;
        const x = offsetXAt(zNext);
        if (x === null) break;                                  // konec kontury
        if (x <= nextX + 1e-6) return zNext;                    // klesla na hlubší zaber
        if (prevX !== null && x >= prevX - 1e-6) return zNext;   // stoupla na vršek schodu
        z = zNext;
      }
      return z;
    };

    // ── Strategie hrubování (cam/roughingStrategies.js) ──
    // passCtx = sdílený kontext: data + pass-helpery z calculate().
    const passCtx = {
      prms, sRad, stockFace, step, offsetPath, stockPathSegments,
      stockWorldPoints, worldPoints, passes, foundErrors,
      offsetXAt, traceOffsetPath, findOffsetXCrossing, findPocketExitZ,
      findLeadOutEndZ, hIntersect, machiningRange, machiningRangeX, chuckZ,
    };
    // operations[] model: seznam operací hrubování, každá naplní passes
    // přes svou strategii z registru. Zatím odvozeno z prms.roughingStrategy
    // (= 1 operace); persistentní seznam + UI přijdou s druhou stranou.
    // Jen dokončení („Hot."): hrubovací průchody se negenerují — passes zůstane
    // prázdné a objede se jen dokončovací offset (finishOffsetPath).
    if (!prms.finishOnly) {
      const operations = getRoughingOperations();
      for (const op of operations) {
        const strategy = ROUGHING_STRATEGIES[op.kind] || ROUGHING_STRATEGIES.longitudinal;
        strategy.genPasses(passCtx, op);
      }
    }

    // ── Z-limity (čelisti / koník): ořez drah aby nezasáhly do zóny ──
    // Pravidla: cut (G1) musí zůstat uvnitř [chuck, tail]:
    //   long:    zEnd >= chuck (nejet pod čelisti), zStart <= tail (nejet za koník)
    //   face:    pass.z musí být v [chuck, tail], jinak průchod vyhodíme
    //   finish:  finishOffsetPath se ořízne na lineární clip / drop arc
    // Pokud po ořezu nezbude smysluplný řez, segment se zahodí celý.
    // Clamping je aktivní jen když uživatel zobrazí čelisti/koník (fixtures
    // nebo both). 'off' a 'range' chuck/tail ignorují, takže lze přepínat
    // chování bez mazání čísel v parametrech.
    const chuckLim = (S.zLimits.chuckActive && typeof S.zLimits.chuck === 'number' && isFinite(S.zLimits.chuck)) ? S.zLimits.chuck : null;
    const tailLim  = (S.zLimits.tailActive  && typeof S.zLimits.tail  === 'number' && isFinite(S.zLimits.tail))  ? S.zLimits.tail  : null;
    if (chuckLim !== null || tailLim !== null) {
      const EPS = 0.05;
      const zInBounds = (z) => {
        if (chuckLim !== null && z < chuckLim - 0.0001) return false;
        if (tailLim  !== null && z > tailLim  + 0.0001) return false;
        return true;
      };
      let droppedCount = 0;
      let clampedCount = 0;
      const clamped = [];
      for (const pass of passes) {
        if (pass.type === 'long') {
          let zS = pass.zStart, zE = pass.zEnd;
          const origZS = zS, origZE = zE;
          if (chuckLim !== null && zE < chuckLim) zE = chuckLim;
          if (tailLim  !== null && zS > tailLim)  zS = tailLim;
          if (pass.ramp) {
            // Zanořovací průchod (sledování kontury + rampa) nelze zkrátit
            // zprava — limit by rozbil návaznost na konturu. Pokud limity
            // stahují zStart, nebo vršek sledování kontury/rampy leží za
            // tailLim, celý vynech.
            const leadInTopZ = (pass.contourLeadIn && pass.contourLeadIn.length > 0) ? pass.contourLeadIn[0].z1 : pass.ramp.z0;
            if (zS !== origZS || (tailLim !== null && leadInTopZ > tailLim)) { droppedCount++; continue; }
            // Floor může mít nulovou šířku (čistá rampa bez floor-u) — to
            // je v pořádku, zahodit jen pokud limit ořezal zEnd až za
            // začátek rampy (zS).
            if (zS - zE < -EPS) { droppedCount++; continue; }
            zE = Math.min(zE, zS);
          } else if (zS - zE < EPS) {
            // Dokončovací průchod kapsy (pocketClean) i jiné „lead-only" pasy
            // mají nulovou šířku zStart→zEnd — jejich řez je v contourLeadIn/Out
            // (sledování offsetu kolem kapsy). Nezahazovat kvůli nulové šířce,
            // jinak zmizí dobrání schodků v kapse (leady sledují konturu uvnitř
            // dílu, tj. v mezích čelistí/koníku). Bez leadů = opravdu prázdný.
            if (!pass.contourLeadIn && !pass.contourLeadOut) { droppedCount++; continue; }
          }
          if (zS !== origZS || zE !== origZE) clampedCount++;
          clamped.push({ ...pass, zStart: zS, zEnd: zE });
        } else if (pass.type === 'face') {
          if (chuckLim !== null && pass.z < chuckLim) { droppedCount++; continue; }
          if (tailLim  !== null && pass.z > tailLim)  { droppedCount++; continue; }
          clamped.push(pass);
        } else {
          clamped.push(pass);
        }
      }
      passes.length = 0;
      for (const p of clamped) passes.push(p);

      // Ořez finishOffsetPath: lineární clip endpointu k limitu, oblouky
      // překračující limit se zahodí. Vše po prvním ořezu se dropne, aby
      // dráha nepokračovala do zakázané zóny.
      let finishDropped = 0;
      let finishClipped = 0;
      let pastLimit = false;
      for (const seg of finishOffsetPath) {
        if (seg.isDegenerate) continue;
        if (pastLimit) { seg.isDegenerate = true; finishDropped++; continue; }
        if (seg.type === 'line') {
          const inP1 = zInBounds(seg.p1.z);
          const inP2 = zInBounds(seg.p2.z);
          if (inP1 && inP2) continue;
          if (!inP1 && !inP2) { seg.isDegenerate = true; finishDropped++; pastLimit = true; continue; }
          // Jeden bod uvnitř, druhý venku → clip na limit.
          const outZ = inP1 ? seg.p2.z : seg.p1.z;
          const limit = (chuckLim !== null && outZ < chuckLim) ? chuckLim
                       : (tailLim !== null && outZ > tailLim ? tailLim : null);
          if (limit === null) { seg.isDegenerate = true; finishDropped++; pastLimit = true; continue; }
          const dz = seg.p2.z - seg.p1.z;
          const t = Math.abs(dz) > 1e-9 ? (limit - seg.p1.z) / dz : 0;
          const tt = Math.max(0, Math.min(1, t));
          const cx = seg.p1.x + tt * (seg.p2.x - seg.p1.x);
          if (inP1) {
            seg.p2 = { x: cx, z: limit };
          } else {
            seg.p1 = { x: cx, z: limit };
          }
          finishClipped++;
          pastLimit = true;
        } else {
          // Arc: Z-rozsah SKUTEČNÉHO výseku (koncové body + extrém cz±r jen
          // když úhel extrému leží ve výseku) — bounding box celé kružnice
          // by u téměř rovných oblouků s velkým R (arc-fit obálky) zahazoval
          // vše, i když výsek limity vůbec nepřekračuje.
          const zS = seg.cz + Math.cos(seg.startAngle) * seg.r;
          const zE = seg.cz + Math.cos(seg.endAngle) * seg.r;
          let zMin = Math.min(zS, zE), zMax = Math.max(zS, zE);
          if (isAngleBetween(0, seg.startAngle, seg.endAngle, seg.dir === 'G2')) zMax = seg.cz + seg.r;
          if (isAngleBetween(Math.PI, seg.startAngle, seg.endAngle, seg.dir === 'G2')) zMin = seg.cz - seg.r;
          if (!zInBounds(zMin) || !zInBounds(zMax)) {
            seg.isDegenerate = true; finishDropped++; pastLimit = true;
          }
        }
      }
      if (droppedCount > 0 || clampedCount > 0 || finishDropped > 0 || finishClipped > 0) {
        const parts = [];
        if (clampedCount > 0) parts.push(`${clampedCount} hrubovacích zkráceno`);
        if (droppedCount > 0) parts.push(`${droppedCount} hrubovacích vynecháno`);
        if (finishClipped > 0) parts.push(`dokončování ořezáno`);
        if (finishDropped > 0) parts.push(`${finishDropped} dokončovacích segmentů vynecháno`);
        foundErrors.push({
          type: 'warning',
          msg: `Z-limity (čelisti/koník): ${parts.join(', ')}.`
        });
      }
    }

    // Sim path
    let simPath = [];
    let totalPathLength = 0;
    let estimatedTimeSeconds = 0;
    const addToPath = (x1, z1, x2, z2, type) => {
      const d = Math.hypot(x2 - x1, z2 - z1);
      totalPathLength += d;
      if (type === 'G0') { estimatedTimeSeconds += (d / 5000) * 60; }
      else {
        const feed = parseFloat(prms.feed) || 0.1;
        const speed = parseFloat(prms.speed) || 200;
        let avgX = Math.abs((x1 + x2) / 2);
        if (avgX < 1) avgX = 1;
        let rpm = (speed * 1000) / (Math.PI * avgX * 2);
        const limsMatch = (prms.machineType || '').match(/LIMS=(\d+)/);
        const maxRpm = limsMatch ? parseInt(limsMatch[1], 10) : 2000;
        if (rpm > maxRpm) rpm = maxRpm;
        const mmPerMin = feed * rpm;
        if (mmPerMin > 0) estimatedTimeSeconds += (d / mmPerMin) * 60;
      }
      return { x: x2, z: z2, type };
    };

    // Simulační dráha se vždy počítá z (ručně editovatelného) G-kódu —
    // viz [[feedback_flip-axis-gcode]] a tlačítko "🔄 Autorefresh drah",
    // které přepíše S.manualGCode čerstvě vygenerovaným kódem z kontury/parametrů.
    simPath = parseManualGCodeToPath(S.manualGCode, prms, S.flipX !== S.flipZ);
    for (let i = 0; i < simPath.length - 1; i++)
      addToPath(simPath[i].x, simPath[i].z, simPath[i + 1].x, simPath[i + 1].z, simPath[i + 1].type);

    // Vrch polotovaru v X (pro bezpečné rapid přejezdy nad materiálem).
    let stockTopX = sRad;
    if (prms.stockMode === 'casting' && stockWorldPoints.length > 0) {
      stockTopX = -9999;
      stockWorldPoints.forEach(p => { if (p.xReal > stockTopX) stockTopX = p.xReal; });
    }

    S.errors = foundErrors;
    // profileModeActive = výpočet drah/hlídání běží po vyřešeném profilu (vždy).
    // profileViewActive = VYKRESLENÍ vyřešeného profilu (ztlumená originál kontura
    //   + zvýrazněný číslovaný profil) — ovládá tlačítko „Auto profil". Bez něj
    //   se ukáže normální kontura se všemi body, dráhy ale jedou po profilu.
    const profileViewActive = profileModeActive && (prms.autoProfile !== false);
    return { worldPoints, stockWorldPoints, contourSegments, machinableContour, offsetPath, finishOffsetPath, finishUnreachablePath, stockPathSegments, passes, simPath, retractDist, totalPathLength, estimatedTimeSeconds, interferenceSegments, flankSegments, interferenceGuides, stockTopX, profileModeActive, profileViewActive, rawContourForProfile: profileViewActive ? rawContourForProfile : null };
  }

  // ── G-Code Editor Content ────────────────────────────────────
  // G-kód editor je vždy ručně editovatelný (viz "🔄 Autorefresh drah").
  function generateGCode(calc) {
    return S.manualGCode.split('\n').map((line, idx) => ({ text: line, simIdx: idx }));
  }

  // ── Hlavička/závěr programu podle řídicího systému ────────────
  // Sdíleno mezi generateAutoGCode() (čerstvé generování z kontury) a
  // convertGCodeControlSystem() (rychlý převod existujícího — i ručně
  // upraveného — kódu při přepnutí řídicího systému v panelu Parametry).
  // Jediné místo, kde se hlavičky/závěry jednotlivých systémů definují.
  // Function declaration (ne const) — musí být hoistnutá i přes early-return
  // capture v headless test harnessu (tests/helpers/camHeadless.mjs), který
  // vrací hned po zachycení referencí, ještě před vykonáním const inicializací.
  function ctrlCmt(ctrl) {
    return (text) => ctrl === 'fanuc' ? `( ${text} )` : `; ${text}`;
  }

  function buildControlHeaderLines(ctrl, prms, flipX, flipZ) {
    const cmt = ctrlCmt(ctrl);
    const note = (text) => ` ${cmt(text)}`;
    const names = { sinumerik: 'SINUMERIK 840D', fanuc: 'FANUC', heidenhain: 'HEIDENHAIN ISO' };
    const lines = [];
    lines.push(cmt(`Vygenerovaný kód ${names[ctrl] || names.sinumerik}`));
    lines.push(cmt(`Datum: ${new Date().toLocaleDateString()}`));
    if (flipX) lines.push(cmt('Obrábění zespodu (X+ dolů) – G2/G3 prohozeny'));
    if (flipZ) lines.push(cmt('Otočená osa Z (Z+ vlevo) – G2/G3 prohozeny'));

    if (ctrl === 'fanuc') {
      lines.push(`G21${note('Metrický vstup')}`, `G40${note('Zrušení kompenzace')}`);
      lines.push(`G99${note('Posuv mm/ot')}`, `G18${note('Rovina ZX')}`);
      lines.push(`G28 U0 W0${note('Referenční bod')}`, `G50 S2000${note('Max otáčky')}`);
      lines.push(`G96 S${prms.speed} M3${note('Konst. řezná rychlost')}`);
      lines.push(`T0101${note('Nástroj 1 / Korekce 1')}`, `M8${note('Chlazení ZAP')}`);
    } else if (ctrl === 'heidenhain') {
      lines.push(`G18${note('Rovina ZX')}`, `G90${note('Absolutní')}`);
      lines.push(`G71${note('Metrický systém')}`, `G54${note('Nulový bod')}`);
      lines.push(`G96 S${prms.speed} M3${note('Řezná rychlost')}`);
      lines.push(`T1 M6${note('Nástroj')}`, 'M8');
    } else {
      lines.push(`G18${note('Rovina ZX')}`, `G90${note('Absolutní programování')}`);
      lines.push(`G54${note('Posunutí počátku')}`, `G95${note('Posuv na otáčku')}`);
      lines.push(`G75 X${prms.safeX}${note('Nájezd do ref. bodu')}`, `G75 Z${prms.safeZ}`);
      lines.push(`LIMS=2000${note('Limit otáček')}`);
      lines.push(`G96 S${prms.speed} ${prms.machineType}${note('Konst. řezná rychlost')}`);
      lines.push(`${prms.mode === 'DIAMON' ? 'DIAMON' : 'DIAMOF'}${note(prms.mode === 'DIAMON' ? 'Programování průměru' : 'Programování poloměru')}`);
      lines.push(`T="${prms.toolName}" D1 M6${note('Výměna nástroje')}`);
      lines.push(`M3${note('Vřeteno CW')}`, `M8${note('Chlazení ZAP')}`);
    }
    return lines;
  }

  function buildControlTailLines(ctrl) {
    const cmt = ctrlCmt(ctrl);
    if (ctrl === 'fanuc') return ['M9', 'M5', 'G28 U0 W0', `M30 ${cmt('Konec programu')}`];
    if (ctrl === 'heidenhain') return ['M9', 'M5', 'M30'];
    return [`M30 ${cmt('Konec programu')}`];
  }

  function controlArcFormatter(ctrl) {
    return ctrl === 'sinumerik'
      ? (r => `CR=${(parseFloat(r) || 0).toFixed(3)}`)
      : (r => `R${(parseFloat(r) || 0).toFixed(3)}`);
  }

  // Přečísluje N-bloky (stejná konvence jako "Přečíslovat N-bloky" v CAM
  // Editoru) — řádkům bez N doplní, komentáře nechá beze změny.
  function renumberGCodeLines(lines, start, step) {
    let n = start;
    return lines.map(line => {
      const t = line.trim();
      if (!t || t.startsWith(';') || t.startsWith('(')) return line;
      if (/^\s*N\d+/i.test(line)) {
        line = line.replace(/^\s*N\d+/i, 'N' + n);
        n += step;
      } else if (/^[A-Z0-9]/i.test(t) && !t.toUpperCase().startsWith('MSG')) {
        line = 'N' + n + ' ' + line;
        n += step;
      }
      return line;
    });
  }

  // ── Rychlý převod existujícího G-kódu mezi řídicími systémy ──────
  // Volá se při přepnutí "Řídicí systém" v panelu Parametry: hlavička a
  // závěr programu (M30 blok) se přegenerují pro nový systém, střední
  // část — skutečné dráhy, posuvy, i ruční úpravy uživatele — zůstává
  // beze změny, jen se převede styl komentářů (; ↔ ( )) a zápis oblouku
  // (CR=... ↔ R...) na řádcích s G2/G3. Chce-li uživatel dráhy přegenerovat
  // od nuly z kontury, použije tlačítko "🔄 Dráhy" jako dřív.
  function convertGCodeControlSystem(code, oldCtrl, newCtrl, prms, flipX, flipZ) {
    if (!code || !code.trim() || oldCtrl === newCtrl) return code;
    const lines = code.replace(/\r\n/g, '\n').split('\n');

    // Konec hlavičky: dělicí komentář "--- ... ---" (obě varianty stylu),
    // jinak záložně první řezný/kruhový pohyb G1/G2/G3.
    let bodyStart = lines.findIndex(l => /^\s*[;(]\s*-{2,}/.test(l));
    if (bodyStart === -1) {
      bodyStart = lines.findIndex(l => /\bG[123]\b/i.test(l.replace(/^\s*N\d+\s*/i, '').replace(/[;(].*$/, '')));
      if (bodyStart === -1) bodyStart = lines.length;
    }
    const body = lines.slice(bodyStart);

    // Konec programu: poslední M30 + bezprostředně předcházející M5/M9/G28
    // (typický závěrečný blok — viz buildControlTailLines).
    let tailStart = -1;
    for (let i = body.length - 1; i >= 0; i--) {
      if (/^\s*(N\d+\s*)?M30\b/i.test(body[i])) { tailStart = i; break; }
    }
    const tailEnd = tailStart === -1 ? -1 : tailStart + 1;
    while (tailStart > 0) {
      const prevClean = body[tailStart - 1].replace(/^\s*N\d+\s*/i, '').replace(/[;(].*$/, '').trim().toUpperCase();
      if (/^M[59]$/.test(prevClean) || /^G28\b/.test(prevClean)) tailStart--;
      else break;
    }
    const hasTail  = tailStart !== -1;
    const middle   = hasTail ? body.slice(0, tailStart) : body;
    const trailing = hasTail ? body.slice(tailEnd) : [];

    const convLine = (line) => {
      let out = line;
      if (oldCtrl !== 'fanuc' && newCtrl === 'fanuc') {
        out = out.replace(/;\s*(.*)$/, (_, t) => t.trim() ? `( ${t.trim()} )` : '');
      } else if (oldCtrl === 'fanuc' && newCtrl !== 'fanuc') {
        out = out.replace(/\(\s*(.*?)\s*\)\s*$/, (_, t) => t.trim() ? `; ${t.trim()}` : '');
      }
      if (/\bG0?[23]\b/i.test(out)) {
        if (oldCtrl === 'sinumerik' && newCtrl !== 'sinumerik') out = out.replace(/\bCR=(-?[\d.]+)/i, 'R$1');
        else if (oldCtrl !== 'sinumerik' && newCtrl === 'sinumerik') out = out.replace(/\bR(-?[\d.]+)\b/i, 'CR=$1');
      }
      return out;
    };

    const newHeader = buildControlHeaderLines(newCtrl, prms, flipX, flipZ);
    const newTail = hasTail ? buildControlTailLines(newCtrl) : [];

    const assembled = [...newHeader, ...middle.map(convLine), ...newTail, ...trailing.map(convLine)];
    return renumberGCodeLines(assembled, 10, 10).join('\n');
  }

  // ── Auto G-Code Generator (z aktuální kontury/parametrů) ─────
  // Volá se jen z tlačítka "🔄 Autorefresh drah" — výsledek přepíše
  // S.manualGCode (a tedy i editor a simulační dráhu).
  function generateAutoGCode(calc) {
    const prms = S.params;
    const lines = [];
    const add = (text, simIdx = null) => lines.push({ text, simIdx });
    const cmt = ctrlCmt(prms.controlSystem);
    const addCmt = (text) => add(cmt(text), null);
    let blockNum = 10;
    const N = () => { const s = `N${blockNum} `; blockNum += 10; return s; };
    const addN = (text, simIdx = null) => add(`${N()}${text}`, simIdx);
    const note = (cmd, text) => ` ${cmd}${cmt(text)}`;
    let arcR = controlArcFormatter(prms.controlSystem);
    // Při otočení svislé osy X (X+ dolů) je program psán pro nástroj zespodu –
    // smysl rotace se obrací, takže G02↔G03 ve výstupu prohazujeme.
    // Totéž platí pro flipZ; G2/G3 se prohazují při lichém počtu překlopení (XOR).
    const flipArc = (code) => {
      if (S.flipX === S.flipZ) return code;
      const c = String(code).trim().toUpperCase();
      if (c === 'G2' || c === 'G02') return code.includes('02') ? 'G03' : 'G3';
      if (c === 'G3' || c === 'G03') return code.includes('03') ? 'G02' : 'G2';
      return code;
    };

    buildControlHeaderLines(prms.controlSystem, prms, S.flipX, S.flipZ).forEach(line => {
      if (line.startsWith(';') || line.startsWith('(')) add(line, null);
      else addN(line, null);
    });

    let simCounter = 0;
    addN(`G0 X${prms.safeX} Z${prms.safeZ}${note('', 'Rychloposuv')}`, 0);
    const rDist = calc.retractDist || 2.0;
    // Úhel odskoku (°): X-složka je vždy rDist, Z-složka = rDist/tan(úhel).
    // 45° = klasická diagonála (Z = rDist), 90° = svisle jen v X (Z = 0).
    const rAngDeg = Math.max(5, Math.min(90, parseFloat(prms.retractAngle) || 45));
    // zaokrouhlení na 1e-9 → tan(45°)=0.999…99 nerozhodí výstup (Z1.901 vs 1.902)
    const rDistZ = rAngDeg >= 89.95 ? 0 : Math.round(rDist / Math.tan(rAngDeg * Math.PI / 180) * 1e9) / 1e9;

    // ── ZÁVITOVÁNÍ (záložka Závit) ── průchody G33 (Sinumerik/Heidenhain)
    // / G32 (Fanuc) s degresivním radiálním přísuvem (√(i/n) — konstantní
    // průřez třísky) + jiskřící průchody. Vnější závit: přísuv z ⌀D dolů na
    // ⌀(D−2H); vnitřní: z předvrtané díry ⌀(D−2H) nahoru na ⌀D. Otáčky se
    // pro závitování přepnou na konstantní (G97) — G96 by měnil otáčky s X
    // a stoupání by „uteklo".
    if (prms.threadActive) {
      const P = Math.max(0.01, parseFloat(prms.threadPitch) || 1);
      const Dnom = Math.max(0.1, parseFloat(prms.threadDiameter) || 10);
      const H = Math.max(0.01, parseFloat(prms.threadDepth) || threadProfileDepth(prms.threadType, P, prms.threadExternal !== false));
      const ext = prms.threadExternal !== false;
      const zStart = parseFloat(prms.threadZStart) || 0;
      const zEnd = isFinite(parseFloat(prms.threadZEnd)) ? parseFloat(prms.threadZEnd) : zStart - 10;
      const runIn = Math.max(0, parseFloat(prms.threadRunIn) || 0);
      const runOut = Math.max(0, parseFloat(prms.threadRunOut) || 0);
      const spring = Math.max(0, Math.round(parseFloat(prms.threadSpringPasses)) || 0);
      const cuts = computeThreadPassCuts(H, parseFloat(prms.threadPasses) || 0);
      const xd = (v) => prms.mode === 'DIAMON' ? (v * 2).toFixed(3) : v.toFixed(3);
      // Směr řezu: od zStart k zEnd (typicky zprava doleva, Z klesá).
      const dirZ = zEnd < zStart ? -1 : 1;
      const z0 = zStart - dirZ * runIn;        // start s náběhem (rozběh posuvu)
      const zCut = zEnd + dirZ * runOut;       // konec s výběhem
      // Kuželový závit 1:k — poloměr povrchu se mění podél dráhy řezu:
      // slopeR = Δr na 1 mm (Δ⌀ = 1/k na 1 mm). Průchod jede G33 s X i Z
      // (synchronizovaná kuželová interpolace), stoupání zůstává podél Z.
      const taper = parseFloat(prms.threadTaperRatio) || 0;
      const slopeR = taper !== 0 ? 1 / (2 * taper) : 0;
      const distOf = (z) => (z - zStart) / dirZ;                 // vzdálenost podél řezu od Z startu
      const rBase = ext ? Dnom / 2 : Dnom / 2 - H;               // povrch (vnější) / předvrtaná díra (vnitřní) na Z startu
      const rSurfAt = (z) => rBase + slopeR * distOf(z);
      // Konstantní otáčky pro závit: n = Vc·1000/(π·D), omezeno LIMS.
      const lims = parseInt((prms.machineType || '').match(/LIMS=(\d+)/)?.[1]) || 2000;
      const rpm = Math.max(10, Math.min(lims, Math.round((parseFloat(prms.speed) || 100) * 1000 / (Math.PI * Dnom))));
      const clr = Math.max(0.5, parseFloat(prms.rapidClearance) || 1) + 1;
      const rMinor = Dnom / 2 - H;             // poloměr dna profilu (vnější) / předvrtané díry (vnitřní)
      // Odskok mezi průchody musí minout povrch po CELÉ délce (u kužele
      // rozhoduje větší/menší konec).
      const rSurfMax = Math.max(rSurfAt(z0), rSurfAt(zCut));
      const rSurfMin = Math.min(rSurfAt(z0), rSurfAt(zCut));
      const rClear = ext ? rSurfMax + clr : Math.max(0.2, rSurfMin - clr);
      // Způsob přísuvu: radiální (kolmý) / boční po boku profilu / střídavý.
      // Boční = start průchodu se posune v Z o hloubka·tan(ε/2) — G33 drží
      // synchronizaci se vřetenem, takže posun startu posouvá řez v drážce
      // na bok profilu (řeže jen jedna strana špičky). Střídavý znaménko
      // posunu střídá — boky se řežou střídavě (rovnoměrné opotřebení).
      const infeed = prms.threadInfeed === 'flank' || prms.threadInfeed === 'alternate' ? prms.threadInfeed : 'radial';
      const infTan = Math.tan(((parseFloat(prms.threadAngle) || 60) / 2) * Math.PI / 180);
      const zShiftOf = (cum, i) => infeed === 'radial' ? 0
        : infeed === 'flank' ? cum * infTan
        : (i % 2 === 0 ? 1 : -1) * cum * infTan;
      // G33/G32: stoupání K (Sinumerik/Heidenhain ISO) vs. F (Fanuc);
      // kuželový průchod má v bloku i cílové X.
      const thrLine = (z, rTo) => {
        const xWord = taper !== 0 ? ` X${xd(rTo)}` : '';
        return prms.controlSystem === 'fanuc'
          ? `G32 Z${z.toFixed(3)}${xWord} F${P}`
          : `G33 Z${z.toFixed(3)}${xWord} K${P}`;
      };
      const infeedLabel = { radial: 'radialni prisuv', flank: 'bocni prisuv', alternate: 'stridavy prisuv' }[infeed];
      addCmt(`--- ZAVITOVANI ${prms.threadName || `⌀${Dnom}×${P}`} (${ext ? 'vnejsi' : 'vnitrni'}, H=${H.toFixed(3)}, ${cuts.length} pruchodu, ${infeedLabel}${taper !== 0 ? `, kuzel 1:${Math.abs(taper)}` : ''}) ---`);
      if (!ext && rMinor <= 0.05) {
        addCmt(`! Vnitrni zavit: prumer diry ⌀${(rMinor * 2).toFixed(3)} <= 0 — zkontroluj ⌀D a hloubku H. Drahy nevygenerovany.`);
      } else {
        addN(`G97 S${rpm}${note('', 'Konstantní otáčky pro závit')}`);
        simCounter += 1; addN(`G0 X${xd(rClear)} Z${z0.toFixed(3)}${note('', 'Nájezd před závit (náběh)')}`, simCounter);
        let prevCum = 0;
        // Jeden průchod: přejezd na start (Z s bočním posunem), přísuv v X
        // (na kuželu dle povrchu v místě startu), G33 na konec, odskok.
        const onePass = (cum, zShift, label) => {
          const z0i = z0 - dirZ * zShift;
          const rFrom = ext ? rSurfAt(z0i) - cum : rSurfAt(z0i) + cum;
          const rTo = ext ? rSurfAt(zCut) - cum : rSurfAt(zCut) + cum;
          simCounter += 1; addN(`G0 Z${z0i.toFixed(3)}`, simCounter);
          simCounter += 1; addN(`G0 X${xd(rFrom)}${note('', label)}`, simCounter);
          simCounter += 1; addN(thrLine(zCut, rTo), simCounter);
          simCounter += 1; addN(`G0 X${xd(rClear)}${note('', 'Odskok')}`, simCounter);
        };
        cuts.forEach((cum, i) => {
          onePass(cum, zShiftOf(cum, i), `Průchod ${i + 1}/${cuts.length} (ap ${(cum - prevCum).toFixed(3)})`);
          prevCum = cum;
        });
        // Jiskřící průchody na plné hloubce — boční posun jako poslední
        // řezný průchod, ať jedou ve stejné stopě.
        const springShift = zShiftOf(H, cuts.length - 1);
        for (let s = 0; s < spring; s++) onePass(H, springShift, `Jiskřící průchod ${s + 1}`);
        addN(`G0 X${prms.safeX} Z${prms.safeZ}${note('', 'Bezpečná poloha')}`);
        addN(`G96 S${prms.speed}${note('', 'Zpět konst. řezná rychlost')}`);
        buildControlTailLines(prms.controlSystem).forEach(line => addN(line));
      }
      addCmt('--- KONTURA (Pro referenci) ---');
      S.contourPoints.forEach(p => {
        const cmd = (p.type === 'G2' || p.type === 'G3') ? flipArc(p.type) : p.type;
        let line = `${cmd} X${(parseFloat(p.x) || 0)} Z${(parseFloat(p.z) || 0)}`;
        if (p.type === 'G2' || p.type === 'G3') line += ` ${arcR(p.r)}`;
        addCmt(line);
      });
      return lines;
    }

    // ── UPICHNUTÍ (part-off) ── zápich plátkem po SVISLÉ ÚSEČCE v Z=partOffZ.
    // Nově se upich chová jako obrábění syntetické (svislé) kontury plátkem
    // s korekcí rádiusu a přídavky (viz partOffGeom níže) — ne jako „hloupý"
    // radiální zápich na osu. Podporovány jen KULATÝ a UPICHOVACÍ plátek.
    //
    //  • Přídavek X (allowanceX) = DOJEZD: cílová radiální poloha SPODNÍ HRANY
    //    plátku (allowanceX=0 → hrana na X0; =10 → hrana na X10). Referenční
    //    bod plátku = střed pracovního rádiusu ⇒ cíl středu = allowanceX + R.
    //  • Přídavek Z (allowanceZ) + Přídavek na hotovo (finishAllowance) =
    //    přídavek jen v ose Z; hrubování odsazeno o (allowanceZ+finishAllowance)
    //    od roviny řezu, dokončení jede přesně na partOffZ.
    //  • Strana (roughingSide) určuje znaménko Z-offsetu (tělo plátku sedí do
    //    už obrobené zóny).
    // Peck (lámání třísky) zachován: po hloubce „Vyjezd" (retractDistance) plátek
    // vyjede, rychloposuvem zpět až partingApproachFeed mm nad dno, pak posuvem F.
    const partOffActive = prms.partOffZ != null && isFinite(parseFloat(prms.partOffZ));
    if (partOffActive) {
      const geom = partOffGeom(prms, calc);   // společná geometrie (i pro vizualizaci)
      const xd = (v) => prms.mode === 'DIAMON' ? (v * 2).toFixed(3) : v.toFixed(3);
      const pz = geom.pz;
      const peck = Math.max(0.1, parseFloat(prms.retractDistance) || 2);
      const af = Math.max(0, parseFloat(prms.partingApproachFeed));
      const clr = Math.max(0.5, parseFloat(prms.rapidClearance) || 1);
      const xCenterStart = geom.xCenterStart;  // odkud jede posuv (rychloposuv sem)
      const xCenterTarget = geom.xCenterTarget; // střed plátku, spodní hrana na dojezdu
      const xClear = geom.xCenterTop + clr;
      addCmt('--- UPICHNUTI ---');
      if (!geom.canCut) {
        addCmt(geom.reason);
      } else {
        // Jeden zápichový cyklus (peck) na dané Z rovině, střed jede k xTarget.
        // Posuv začíná od Start X (xCenterStart) — z povrchu se sem dojede G0.
        const peckPlunge = (zc, label) => {
          simCounter += 1; addN(`G0 Z${zc.toFixed(3)}${note('', label)}`, simCounter);
          simCounter += 1; addN(`G0 X${xd(xClear)}`, simCounter);
          let depth = xCenterStart;
          let guard = 0;
          while (depth > xCenterTarget + 1e-4 && guard++ < 10000) {
            const nextDepth = Math.max(xCenterTarget, depth - peck);
            // rychloposuv zpět na af mm nad aktuální dno (u prvního na Start X)
            simCounter += 1; addN(`G0 X${xd(depth + af)}`, simCounter);
            simCounter += 1; addN(`G1 X${xd(nextDepth)} F${prms.feed}${note('', 'Zápich')}`, simCounter);
            depth = nextDepth;
            // Výjezd pro uvolnění třísek jen na Start X (xCenterStart), ne nad
            // celý polotovar — v kapse zůstane nástroj blízko a šetří čas.
            if (depth > xCenterTarget + 1e-4) { simCounter += 1; addN(`G0 X${xd(xCenterStart)}${note('', 'Vyjezd – uvolnění třísek')}`, simCounter); }
          }
          simCounter += 1; addN(`G0 X${xd(xClear)}${note('', 'Vyjezd')}`, simCounter);
        };
        // Plynulý zápich = jeden posuv F na dno, bez peckování (výjezdů).
        // Rychloposuvem na Start X, odtud posuvem na dno.
        const smoothPlunge = (zc, label, cutCmt = 'Zápich') => {
          simCounter += 1; addN(`G0 Z${zc.toFixed(3)}${note('', label)}`, simCounter);
          simCounter += 1; addN(`G0 X${xd(xCenterStart)}`, simCounter);
          simCounter += 1; addN(`G1 X${xd(xCenterTarget)} F${prms.feed}${note('', cutCmt)}`, simCounter);
          simCounter += 1; addN(`G0 X${xd(xClear)}${note('', 'Vyjezd')}`, simCounter);
        };
        // Hlavní (hrubovací / jediný) zápich: plynule nebo peckovaně dle volby.
        const mainPlunge = prms.partOffSmooth ? smoothPlunge : peckPlunge;
        // Hlavní zápich VŽDY na zRough (nechá Přídavek Z i Přídavek na hotovo).
        // Dokončovací (plynulá) dráha jede jen se zapnutou „Dokončovací operace"
        // — odebere Přídavek na hotovo až na finální rovinu (zFinal).
        mainPlunge(geom.zRough, geom.doFinish ? 'Rovina upichnutí – hrubování' : 'Rychloposuv na rovinu upichnutí');
        if (geom.doFinish) {
          smoothPlunge(geom.zFinal, 'Dokončení – rovina řezu (plynule)', 'Dokončovací zápich');
        }
        addN(`G0 X${prms.safeX} Z${prms.safeZ}${note('', 'Bezpečná poloha')}`);
        buildControlTailLines(prms.controlSystem).forEach(line => addN(line));
      }
      addCmt('--- KONTURA (Pro referenci) ---');
      S.contourPoints.forEach(p => {
        const cmd = (p.type === 'G2' || p.type === 'G3') ? flipArc(p.type) : p.type;
        let line = `${cmd} X${(parseFloat(p.x) || 0)} Z${(parseFloat(p.z) || 0)}`;
        if (p.type === 'G2' || p.type === 'G3') line += ` ${arcR(p.r)}`;
        addCmt(line);
      });
      return lines;
    }

    if (!prms.finishOnly)
      addCmt(`--- HRUBOVANI (${(ROUGHING_STRATEGIES[roughingKey()] || ROUGHING_STRATEGIES.longitudinal).label}) ---`);
    // Vůle nad polotovarem + úhel nájezdové rampy (ladí s calculate()).
    const rapidClrGc = Math.max(0.05, parseFloat(prms.rapidClearance) || 1);
    const entryAngleDegGc = getEffectivePlungeAngle(prms);
    const entryRadGc = entryAngleDegGc * Math.PI / 180;
    // Helper: ořezat Z na aktivní čelisti/koník limity (G-kód generace).
    const gcChuckZ = (S.zLimits.chuckActive && typeof S.zLimits.chuck === 'number' && isFinite(S.zLimits.chuck)) ? S.zLimits.chuck : null;
    const gcTailZ  = (S.zLimits.tailActive  && typeof S.zLimits.tail  === 'number' && isFinite(S.zLimits.tail))  ? S.zLimits.tail  : null;
    const clipZGc = (z) => {
      let v = z;
      if (gcTailZ  !== null && v > gcTailZ)  v = gcTailZ;
      if (gcChuckZ !== null && v < gcChuckZ) v = gcChuckZ;
      return v;
    };

    // ── Bezpečné rychloposuvy ──
    // Sledujeme reálnou polohu nástroje (X = rádius) a každý přejezd G0
    // testujeme proti offsetové kontuře (hrubovací i dokončovací offset).
    // Pokud by přímý přejezd konturu protnul, nejdřív se vyjede v X nad
    // polotovar/konturu, přejede v Z a teprve pak sjede na cíl.
    const rapidBlockers = [...(calc.offsetPath || []), ...(calc.finishOffsetPath || []), ...(calc.finishUnreachablePath || [])].filter(s => !s.isDegenerate);
    let rapidTopX = calc.stockTopX || 0;
    rapidBlockers.forEach(s => {
      if (s.type === 'line') rapidTopX = Math.max(rapidTopX, s.p1.x, s.p2.x);
      else rapidTopX = Math.max(rapidTopX, s.cx + s.r);
    });
    const xDia = (v) => prms.mode === 'DIAMON' ? (v * 2).toFixed(3) : v.toFixed(3);
    // Max X hrubovacího offsetu na svislici Z (pro kontrolu odskoku u stěny).
    const gcOffsetXAt = (z) => {
      let m = null;
      for (const s of (calc.offsetPath || [])) {
        if (s.isDegenerate) continue;
        if (s.type === 'line') {
          const x = intersectVerticalLineSegment(z, s.p1, s.p2);
          if (x !== null && (m === null || x > m)) m = x;
        } else {
          for (const x of intersectVerticalLineArc(z, { x: s.cx, z: s.cz }, s.r)) {
            const a = Math.atan2(x - s.cx, z - s.cz);
            if (isAngleBetween(a, s.startAngle, s.endAngle, s.dir === 'G2') && (m === null || x > m)) m = x;
          }
        }
      }
      return m;
    };
    const cur = { x: null, z: null };
    const setPos = (x, z) => { cur.x = x; cur.z = z; };
    // Výchozí poloha = bezpečná poloha z úvodního G0 (programované souř.).
    setPos((parseFloat(prms.safeX) || 0) / (prms.mode === 'DIAMON' ? 2 : 1), parseFloat(prms.safeZ) || 0);
    // touch = true: cíl leží na kontuře/materiálu — poslední úsek sjezdu
    // (Vůle nad polotovarem) se jede pracovním posuvem, ne rychloposuvem.
    // forceUp = vždy vyjet NAD polotovar, přejet v Z a teprve najet (nikdy
    // diagonála mezi dvěma body kontury). Dokončování ho zapíná pro přejezd
    // mezi nedosažitelnými „ostrovy": rychloposuv podél čela je sice offsetově
    // 0,8 mm nad plochou (segmentHitsPath ho nevidí jako kolizi), ale vede
    // šikmo přes hlídanou zónu — dráha tam nesmí (jen kontura↔polotovar).
    const safeRapidTo = (tx, tz, touch = false, forceUp = false) => {
      const sameX = Math.abs(tx - cur.x) < 1e-6;
      const sameZ = Math.abs(tz - cur.z) < 1e-6;
      if (sameX && sameZ) { setPos(tx, tz); return; }
      const emit = (txt) => { simCounter += 1; addN(txt, simCounter); };
      // Sjezd v X na cíl: s touch zastaví rychloposuv o vůli výš a dojede G1.
      const descendTo = (fromX) => {
        if (touch && fromX - tx > 1e-6) {
          if (fromX - tx > rapidClrGc + 1e-6) emit(`G0 X${xDia(tx + rapidClrGc)}`);
          emit(`G1 X${xDia(tx)} F${prms.feed}`);
        } else if (Math.abs(fromX - tx) > 1e-6) {
          emit(`G0 X${xDia(tx)}`);
        }
      };
      if (forceUp || segmentHitsPath({ x: cur.x, z: cur.z }, { x: tx, z: tz }, rapidBlockers)) {
        const xUp = Math.max(rapidTopX + rapidClrGc, cur.x, tx);
        if (xUp > cur.x + 1e-6) emit(`G0 X${xDia(xUp)}${note('', 'Výjezd nad konturu')}`);
        if (Math.abs(tz - cur.z) > 1e-6) emit(`G0 Z${tz.toFixed(3)}`);
        descendTo(xUp);
      } else if (sameX) {
        emit(`G0 Z${tz.toFixed(3)}`);
      } else if (sameZ) {
        descendTo(cur.x);
      } else if (touch && cur.x - tx > 1e-6) {
        // Diagonální sjezd k materiálu: rychloposuvem jen na vůli nad cíl.
        if (cur.x - tx > rapidClrGc + 1e-6) {
          emit(`G0 X${xDia(tx + rapidClrGc)} Z${tz.toFixed(3)}`);
          emit(`G1 X${xDia(tx)} F${prms.feed}`);
        } else {
          emit(`G1 X${xDia(tx)} Z${tz.toFixed(3)} F${prms.feed}`);
        }
      } else {
        emit(`G0 X${xDia(tx)} Z${tz.toFixed(3)}`);
      }
      setPos(tx, tz);
    };

    calc.passes.forEach((pass, i) => {
      addCmt(`Průchod ${i + 1}${pass.pocketClean ? ' (dokončení kapsy)' : pass.pocketReposition ? ' (zanoření v kapse)' : pass.ramp ? ' (oblouk G3)' : pass.contourLeadIn ? ' (kapsa po kontuře)' : pass.contourLeadOut ? ' (bez schodků)' : ''}`);
      if (pass.type === 'long' && (pass.contourLeadIn || pass.ramp || pass.pocketClean)) {
        // Kapsa za bossem kontury: namísto odskoku a rychloposuvu přes
        // vršek polotovaru se kopíruje samotná kontura (G1/G2/G3) až k
        // bodu, kde její sklon dosáhne úhlu zanoření, odtud rampa pod
        // tímto úhlem na aktuální zaběr, dno kapsy a odskok.
        const li = pass.contourLeadIn || [];
        const entry = li.length > 0
          ? { x: li[0].x1, z: li[0].z1 }
          : (pass.ramp ? { x: pass.ramp.x0, z: pass.ramp.z0 } : { x: pass.x, z: pass.zStart });
        if (pass.pocketReposition) {
          // Dobrat kapsu najednou — návrat v kapse na pokračování rampy:
          //   1) ODSKOK pod 45° pryč od kontury o vzdálenost Odskok (stejně
          //      jako mimo kapsu) — zvednutí z řezu do už vyříznutého vzduchu,
          //   2) přejezd v ose Z NAD bod, kde má rampa pokračovat
          //      (rampFeedFrom = vršek minulého zápichu / konec minulé rampy),
          //   3) přísun v ose X na ten bod
          // a odtud pracovní rampa řeže jen nový úsek pod ním. Žádný výjezd
          // nad polotovar ani na roh (ten by jel skrz boss nad zápichem).
          const tgt = pass.rampFeedFrom || entry;
          const odskokZ = clipZGc(cur.z + rDistZ);
          simCounter += 1; addN(`G1 X${xDia(cur.x + rDist)} Z${odskokZ.toFixed(3)}`, simCounter); setPos(cur.x + rDist, odskokZ);
          if (Math.abs(cur.z - tgt.z) > 1e-6) { simCounter += 1; addN(`G0 Z${tgt.z.toFixed(3)}`, simCounter); setPos(cur.x, tgt.z); }
          simCounter += 1; addN(`G0 X${xDia(tgt.x)}`, simCounter); setPos(tgt.x, tgt.z);
        } else if (pass.pocketClean) {
          const needMove = Math.abs(cur.x - entry.x) > 1e-6 || Math.abs(cur.z - entry.z) > 1e-6;
          if (pass.cleanApproach && needMove) {
            // Dokončení navazuje na poslední zanořovací zákrok: horní stěnu už
            // obrobily rampy, takže se jen ODSKOČÍ ode dna, přejede v Z nad
            // začátek nedobraného zbytku a přisune se k němu — žádný výjezd nad
            // boss ani přejezd přes už obrobenou stěnu.
            const odskokZ = clipZGc(cur.z + rDistZ);
            simCounter += 1; addN(`G1 X${xDia(cur.x + rDist)} Z${odskokZ.toFixed(3)}`, simCounter); setPos(cur.x + rDist, odskokZ);
            if (Math.abs(cur.z - entry.z) > 1e-6) { simCounter += 1; addN(`G0 Z${entry.z.toFixed(3)}`, simCounter); setPos(cur.x, entry.z); }
            if (Math.abs(cur.x - entry.x) > 1e-6) { simCounter += 1; addN(`G0 X${xDia(entry.x)}`, simCounter); setPos(entry.x, entry.z); }
          } else if (needMove) {
            // Dokončení kapsy bez navázání: nájezd na začátek kontury (roh u
            // náběhu) musí jít BEZPEČNĚ NAD bossem — z dna kapsy přímo nahoru
            // by se řezalo skrz materiál. safeRapidTo zvedne v X nad konturu,
            // přejede v Z a teprve pak sjede k rohu.
            safeRapidTo(entry.x, entry.z, true);
          }
        } else if (Math.abs(cur.x - entry.x) > 1e-6 || Math.abs(cur.z - entry.z) > 1e-6) {
          // Sem se dostaneme jen když cur ≠ entry, tj. NEJDE o plynulé navázání
          // na předchozí otevřený řez (u toho by cur == entry a podmínka výše je
          // nepravdivá). Je to skok z odjezdu předchozího průchodu → nájezd musí
          // jít BEZPEČNĚ NAD konturou (safeRapidTo), ne řezným G1 přímo na entry —
          // ten by protnul konturu („kapsa po kontuře" projíždí konturou).
          safeRapidTo(entry.x, entry.z, true);
        }
        for (const seg of li) {
          if (seg.type === 'line') {
            simCounter += 1; addN(`G1 X${xDia(seg.x2)} Z${seg.z2.toFixed(3)} F${prms.feed}`, simCounter); setPos(seg.x2, seg.z2);
          } else {
            simCounter += 1; addN(`${flipArc(seg.dir)} X${xDia(seg.x2)} Z${seg.z2.toFixed(3)} ${arcR(seg.r)} F${prms.feed}`, simCounter); setPos(seg.x2, seg.z2);
          }
        }
        if (pass.ramp) {
          simCounter += 1; addN(`G1 X${xDia(pass.x)} Z${pass.zStart.toFixed(3)}${note('', `Rampa ${entryAngleDegGc.toFixed(1)}°`)}`, simCounter); setPos(pass.x, pass.zStart);
        }
        if (pass.zStart - pass.zEnd > 1e-6) {
          simCounter += 1; addN(`G1 Z${pass.zEnd.toFixed(3)} F${prms.feed}`, simCounter); setPos(pass.x, pass.zEnd);
        }
        if (pass.contourLeadOut) {
          // Bez schodků / dokončení kapsy: po dně dál po kontuře (G1/G2/G3)
          // místo odskoku — druhá stěna se obrobí přímo po obrysu.
          for (const seg of pass.contourLeadOut) {
            if (seg.type === 'line') {
              simCounter += 1; addN(`G1 X${xDia(seg.x2)} Z${seg.z2.toFixed(3)} F${prms.feed}`, simCounter); setPos(seg.x2, seg.z2);
            } else {
              simCounter += 1; addN(`${flipArc(seg.dir)} X${xDia(seg.x2)} Z${seg.z2.toFixed(3)} ${arcR(seg.r)} F${prms.feed}`, simCounter); setPos(seg.x2, seg.z2);
            }
          }
        }
        if (!pass.noRetract) {
          const zRetractVal = clipZGc(cur.z + rDistZ);
          simCounter += 1; addN(`G1 X${xDia(cur.x + rDist)} Z${zRetractVal.toFixed(3)}`, simCounter); setPos(cur.x + rDist, zRetractVal);
        }
      } else if (pass.type === 'long' && pass.backside) {
        // Druhá strana (zleva): záběr VŽDY zleva, řez ve směru +Z (doprava).
        // Z pravé strany se najet nedá (narazil by držák / geometrie destičky).
        // Čistý přejezd bez kolizí — zvednout nad polotovar, přejet v Z na
        // levou hranu, zanořit, řez doprava, odskok doleva od kontury:
        //   G0 X<nad polotovar>          ; zvednout (čistý přejezd v Z)
        //   G0 Z<zEnd>                   ; přejezd k záběru (levá hrana)
        //   G0 X<hloubka+vůle> / G1 X<hloubka> ; zanoření
        //   G1 Z<zStart> F               ; řez +Z (doprava)
        //   G1 X<+odskok> Z<−odskok>     ; odskok DOLEVA od kontury
        const zEng = pass.zEnd;                 // záběr = levá hrana řezu
        const xSafe = rapidTopX + rapidClrGc;   // X bezpečně nad polotovarem
        const emitB = (txt) => { simCounter += 1; addN(txt, simCounter); };
        if (cur.x < xSafe - 1e-6) { emitB(`G0 X${xDia(xSafe)}`); setPos(xSafe, cur.z); }
        if (Math.abs(cur.z - zEng) > 1e-6) { emitB(`G0 Z${zEng.toFixed(3)}`); setPos(cur.x, zEng); }
        if (cur.x - pass.x > rapidClrGc + 1e-6) emitB(`G0 X${xDia(pass.x + rapidClrGc)}`);
        emitB(`G1 X${xDia(pass.x)} F${prms.feed}`); setPos(pass.x, zEng);
        emitB(`G1 Z${pass.zStart.toFixed(3)} F${prms.feed}`); setPos(pass.x, pass.zStart);
        if (!pass.noRetract) {
          const zRetractVal = clipZGc(cur.z - rDistZ);
          emitB(`G1 X${xDia(cur.x + rDist)} Z${zRetractVal.toFixed(3)}`); setPos(cur.x + rDist, zRetractVal);
        }
      } else if (pass.type === 'long') {
        // Standardní podélné hrubování (vpravo → vlevo):
        //   G0 Z<zApproach>            ; rapid za polotovar (clearance)
        //   G0 X<hloubka>              ; rapid k průměru
        //   G1 Z<pass.zStart>          ; sjezd přes clearance na hranu polotovaru
        //                                už pracovním posuvem (bezpečný dotek)
        //   G1 Z<zEnd> F<f>            ; podélný řez −Z přes celou špónu
        //   G1 X<hloubka+odskok> Z<zEnd+odskok>  ; retract pod 45°
        const zApproachVal = clipZGc(pass.zStart + rapidClrGc);
        // Přejezd v Z na nájezdový bod s kontrolou kolize (po zanoření do
        // kapsy může nástroj stát hluboko — přímý přejezd by řízl stěnu).
        safeRapidTo(cur.x, zApproachVal);
        safeRapidTo(pass.x, zApproachVal);
        simCounter += 1; addN(`G1 Z${pass.zStart.toFixed(3)} F${prms.feed}`, simCounter); setPos(pass.x, pass.zStart);
        simCounter += 1; addN(`G1 Z${pass.zEnd.toFixed(3)} F${prms.feed}`, simCounter); setPos(pass.x, pass.zEnd);
        if (pass.contourLeadOut) {
          // Bez schodků: dál po kontuře (G1/G2/G3) až na hloubku dalšího
          // průchodu místo okamžitého odskoku — schod se obrobí přímo.
          for (const seg of pass.contourLeadOut) {
            if (seg.type === 'line') {
              simCounter += 1; addN(`G1 X${xDia(seg.x2)} Z${seg.z2.toFixed(3)} F${prms.feed}`, simCounter); setPos(seg.x2, seg.z2);
            } else {
              simCounter += 1; addN(`${flipArc(seg.dir)} X${xDia(seg.x2)} Z${seg.z2.toFixed(3)} ${arcR(seg.r)} F${prms.feed}`, simCounter); setPos(seg.x2, seg.z2);
            }
          }
        }
        if (!pass.noRetract) {
          const zRetractVal = clipZGc(cur.z + rDistZ);
          simCounter += 1; addN(`G1 X${xDia(cur.x + rDist)} Z${zRetractVal.toFixed(3)}`, simCounter); setPos(cur.x + rDist, zRetractVal);
        }
      } else {
        // Čelní hrubování (vzor shodný se sim cestou). Per-Z hodnoty:
        //   xStart = lokální casting outer + rapidClr (rapid-safe v tomto Z)
        //   xSurface = lokální casting outer (povrch polotovaru tady)
        //   G0 X<xStart>           ; rapid za polotovar v X (per-Z clearance)
        //   G0 Z<z>                ; rapid na cílovou hloubku
        //   G1 X<xSurface>         ; sjezd přes clearance na povrch polotovaru
        //                            už pracovním posuvem (bezpečný dotek)
        //   G1 X<xEnd> F<f>        ; čelní řez −X k bloku kontury
        //   G1 X<xEnd+odskok> Z<z+odskok>  ; retract pod 45°
        // Přejezdy s kontrolou kolize: nejdřív v X za polotovar, pak v Z.
        safeRapidTo(pass.xStart, cur.z);
        safeRapidTo(pass.xStart, pass.z);
        simCounter += 1; addN(`G1 X${xDia(pass.xSurface)} F${prms.feed}`, simCounter); setPos(pass.xSurface, pass.z);
        simCounter += 1; addN(`G1 X${xDia(pass.xEnd)} F${prms.feed}`, simCounter); setPos(pass.xEnd, pass.z);
        if (pass.contourLeadOut) {
          // Bez schodků: dál po kontuře (G1/G2/G3) v pásu Z∈[z−ap, z]
          // místo okamžitého odskoku — schod se obrobí přímo po obrysu.
          for (const seg of pass.contourLeadOut) {
            if (seg.type === 'line') {
              simCounter += 1; addN(`G1 X${xDia(seg.x2)} Z${seg.z2.toFixed(3)} F${prms.feed}`, simCounter); setPos(seg.x2, seg.z2);
            } else {
              simCounter += 1; addN(`${flipArc(seg.dir)} X${xDia(seg.x2)} Z${seg.z2.toFixed(3)} ${arcR(seg.r)} F${prms.feed}`, simCounter); setPos(seg.x2, seg.z2);
            }
          }
        }
        // Retract pod úhlem odskoku do už obrobené strany: zprava +Z,
        // zleva −Z (drží pass.faceLeft). Když by diagonála zajela do kontury
        // NEBO do materiálu, který sousední (mělčí/zkrácený) průchod nechal
        // stát (stěna kapsy, hlídání destičky) → vyjet svisle jen v X.
        const dirZR = pass.faceLeft ? -1 : 1;
        // Sklon diagonály: na Z-posun dz připadá X-zdvih dz·(rDist/rDistZ);
        // u 90° (rDistZ=0) je odskok svislý a kontrola bezpředmětná.
        const rTan = rDistZ > 1e-9 ? rDist / rDistZ : Infinity;
        let retractGouges = false;
        for (let i = 1; i <= 8 && rDistZ > 1e-9 && !retractGouges; i++) {
          const dz = rDistZ * i / 8;
          const ox = gcOffsetXAt(cur.z + dirZR * dz);
          if (ox !== null && ox > cur.x + dz * rTan - 0.02) retractGouges = true;
        }
        // Zbytek materiálu na sousedních čelních rovinách (xEnd > offset).
        if (!retractGouges && rDistZ > 1e-9) {
          for (const p2 of calc.passes) {
            if (p2.type !== 'face') continue;
            const dz = dirZR * (p2.z - cur.z);
            if (dz <= 1e-6 || dz > rDistZ + 1e-6) continue;
            if (p2.xEnd > cur.x + dz * rTan - 0.02) { retractGouges = true; break; }
          }
        }
        if (retractGouges) {
          simCounter += 1; addN(`G1 X${xDia(cur.x + rDist)}${note('', 'Výjezd v X (stěna)')}`, simCounter); setPos(cur.x + rDist, cur.z);
        } else {
          const zRetractVal = clipZGc(cur.z + (pass.faceLeft ? -rDistZ : rDistZ));
          simCounter += 1; addN(`G1 X${xDia(cur.x + rDist)} Z${zRetractVal.toFixed(3)}`, simCounter); setPos(cur.x + rDist, zRetractVal);
        }
      }
    });

    // Návrat na bezpečnou polohu s kontrolou kolize (po zanoření do kapsy
    // by přímá diagonála mohla proříznout stěnu/konturu).
    safeRapidTo((parseFloat(prms.safeX) || 0) / (prms.mode === 'DIAMON' ? 2 : 1), parseFloat(prms.safeZ) || 0);

    // Dokončování: u druhé strany (zleva) se kontura trasuje OPAČNĚ —
    // zleva doprava (zprava nelze, narazil by držák / geometrie destičky),
    // stejně jako hrubování. Otočí se pořadí segmentů, u oblouků směr (G2↔G3)
    // a krajní úhly; napojení (chainBreak) se přepočítá.
    const finBackside = roughingKey() === 'backside';
    let finPath = calc.finishOffsetPath;
    if (finBackside) {
      finPath = calc.finishOffsetPath.slice().reverse().map(s => s.type === 'line'
        ? { ...s, p1: s.p2, p2: s.p1, chainBreak: false }
        : { ...s, dir: s.dir === 'G2' ? 'G3' : 'G2', startAngle: s.endAngle, endAngle: s.startAngle, p1: s.p2, p2: s.p1, refP1: s.refP2, refP2: s.refP1, chainBreak: false });
      for (let i = 1; i < finPath.length; i++) {
        const prevEnd = segEndPoint(finPath[i - 1]);
        const curStart = segStartPoint(finPath[i]);
        finPath[i].chainBreak = Math.hypot(curStart.x - prevEnd.x, curStart.z - prevEnd.z) > 1e-4;
      }
    }
    const firstGcFinSeg = finPath.find(s => !s.isDegenerate);
    // Výměna nástroje pro dokončování — jen pokud je nastaven jiný nástroj ze zásobníku
    const finSlotIdx = (prms.finishingSlot !== null && prms.finishingSlot !== undefined) ? prms.finishingSlot : null;
    const finSlotData = (finSlotIdx !== null && S.toolMagazine[finSlotIdx]) ? S.toolMagazine[finSlotIdx] : null;
    const finFeed  = finSlotData ? finSlotData.f  : prms.feed;
    const finSpeed = finSlotData ? finSlotData.vc : prms.speed;
    if ((prms.doFinishing || prms.finishOnly) && firstGcFinSeg) {
      addCmt('--- DOKONCOVANI ---');
      if (finSlotData) {
        // Bezpečná poloha před výměnou
        addN(`G0 X${prms.safeX} Z${prms.safeZ}${note('', 'Výjezd do bezpečné polohy')}`);
        if (prms.controlSystem === 'sinumerik') {
          addN(`T="${finSlotData.name}" D1 M6${note('', `Výměna na dokončovací nástroj T${finSlotData.slot}`)}`);
          addN(`G96 S${finSpeed} ${prms.machineType}${note('', 'Řezná rychlost – dokončování')}`);
        } else if (prms.controlSystem === 'fanuc') {
          const tNum = String(finSlotData.slot).padStart(2, '0');
          addN(`T${tNum}${tNum}${note('', `Výměna na T${finSlotData.slot} – dokončování`)}`);
          addN(`G96 S${finSpeed} M3${note('', 'Řezná rychlost – dokončování')}`);
        } else {
          addN(`T${finSlotData.slot} M6${note('', `Výměna na dokončovací nástroj T${finSlotData.slot}`)}`);
          addN(`G96 S${finSpeed} M3${note('', 'Řezná rychlost – dokončování')}`);
        }
        addN(`M3${note('', 'Vřeteno CW')}`);
      }
      const startSeg = firstGcFinSeg;
      const sX = startSeg.type === 'line' ? startSeg.p1.x : (startSeg.cx + Math.sin(startSeg.startAngle) * startSeg.r);
      const sZ = startSeg.type === 'line' ? startSeg.p1.z : (startSeg.cz + Math.cos(startSeg.startAngle) * startSeg.r);
      const sX_out = prms.mode === 'DIAMON' ? (sX * 2).toFixed(3) : sX.toFixed(3);
      // Nájezd pod úhlem entryAngle (úhel spodní strany destičky) —
      // G0 na přibližovací bod 2 mm v X a rampDz v Z mimo konturu,
      // G1 posuvem do startovního bodu kontury (gentle dotek).
      const finishApproachDx = 2;
      const finishRampDz = finishApproachDx / Math.tan(entryRadGc);
      // Rapid přibližovací bod ořežeme na čelisti/koník když jsou aktivní —
      // jinak by ramp s mělkým úhlem překročil limit (collision risk).
      // U backsidu se trasuje doprava, takže nájezdová ramp je z levé strany
      // (−Z), aby nájezd nešel proti směru řezu.
      const sZ_approachVal = clipZGc(sZ + (finBackside ? -finishRampDz : finishRampDz));
      // Nájezd na přibližovací bod s kontrolou kolize — přímá diagonála
      // z bezpečné polohy může u členité kontury proříznout offset.
      safeRapidTo(sX + finishApproachDx, sZ_approachVal);
      simCounter += 1; addN(`G1 X${sX_out} Z${sZ.toFixed(3)} F${finFeed}`, simCounter); setPos(sX, sZ);
      finPath.forEach(seg => {
        if (seg.isDegenerate) return;
        // chainBreak = samostatný řetěz (mezi konturami nic nenavazuje) —
        // najet rychloposuvem na jeho začátek místo řezného přejezdu mezerou.
        if (seg.chainBreak) {
          const sp = segStartPoint(seg);
          // touch: cíl leží na kontuře — poslední vůli dojet posuvem.
          // forceUp: mezi dosažitelnými ostrovy VŽDY výjezd nad polotovar +
          // přejezd Z + najetí — nikdy diagonála přes hlídanou zónu.
          safeRapidTo(sp.x, sp.z, true, true);
        }
        if (seg.type === 'line') {
          const eX = prms.mode === 'DIAMON' ? (seg.p2.x * 2).toFixed(3) : seg.p2.x.toFixed(3);
          simCounter += 1; addN(`G1 X${eX} Z${seg.p2.z.toFixed(3)}`, simCounter); setPos(seg.p2.x, seg.p2.z);
        } else {
          simCounter += 10;
          const eXv = seg.cx + Math.sin(seg.endAngle) * seg.r;
          const eZv = seg.cz + Math.cos(seg.endAngle) * seg.r;
          addN(`${flipArc(seg.dir)} X${xDia(eXv)} Z${eZv.toFixed(3)} ${arcR(seg.r)}`, simCounter);
          setPos(eXv, eZv);
        }
      });
      safeRapidTo((parseFloat(prms.safeX) || 0) / (prms.mode === 'DIAMON' ? 2 : 1), parseFloat(prms.safeZ) || 0);
    }

    buildControlTailLines(prms.controlSystem).forEach(line => addN(line));
    addCmt('--- KONTURA (Pro referenci) ---');
    S.contourPoints.forEach(p => {
      const cmd = (p.type === 'G2' || p.type === 'G3') ? flipArc(p.type) : p.type;
      let line = `${cmd} X${(parseFloat(p.x) || 0)} Z${(parseFloat(p.z) || 0)}`;
      if (p.type === 'G2' || p.type === 'G3') line += ` ${arcR(p.r)}`;
      addCmt(line);
    });
    return lines;
  }

  // ── Vykreslení kontury z bodů {x, z, type, r} (trasování profilu) ──
  function _drawPointsContour(pts, toScreen, color, withNumbers) {
    if (!pts || pts.length === 0) return;
    ctx.beginPath();
    const start = toScreen(pts[0].x, pts[0].z);
    ctx.moveTo(start.x, start.y);
    for (let i = 1; i < pts.length; i++) {
      const p1 = pts[i - 1], p2 = pts[i];
      if (p2.type === 'G2' || p2.type === 'G3') {
        const arc = getArcParams({ x: p1.x, z: p1.z }, { x: p2.x, z: p2.z }, p2.r, p2.type);
        if (!arc.error) {
          const steps = arcSteps(arc.r, S.view.scale);
          let sA = Math.atan2(p1.x - arc.cx, p1.z - arc.cz);
          let eA = Math.atan2(p2.x - arc.cx, p2.z - arc.cz);
          if (p2.type === 'G2' && eA > sA) eA -= 2 * Math.PI;
          if (p2.type === 'G3' && eA < sA) eA += 2 * Math.PI;
          for (let j = 1; j <= steps; j++) {
            const a = sA + (eA - sA) * (j / steps);
            const pt = toScreen(arc.cx + Math.sin(a) * arc.r, arc.cz + Math.cos(a) * arc.r);
            ctx.lineTo(pt.x, pt.y);
          }
          continue;
        }
      }
      const pe = toScreen(p2.x, p2.z);
      ctx.lineTo(pe.x, pe.y);
    }
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();

    if (withNumbers) {
      pts.forEach((p, i) => {
        const pt = toScreen(p.x, p.z);
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill();
        ctx.fillStyle = '#1e1e2e'; ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), pt.x, pt.y + 0.5);
      });
    }
  }

  // ── rAF SLUČOVAČ ──────────────────────────────────────────────
  // Při tažení/posunu generuje myš 100+ událostí za sekundu a každá by jinak
  // spustila celý přepočet + překreslení. scheduleFrame() sloučí práci do max.
  // JEDNOHO běhu za snímek (~60 fps) — provede se jen poslední naplánovaná
  // funkce. flushFrame() vynutí okamžité dokončení (na konci tažení).
  let _rafId = null, _rafFn = null;
  function scheduleFrame(fn) {
    _rafFn = fn;                       // ponech jen poslední požadavek
    if (_rafId !== null) return;
    _rafId = requestAnimationFrame(() => {
      _rafId = null;
      const f = _rafFn; _rafFn = null;
      if (f) f();
    });
  }
  function flushFrame() {
    if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null; }
    const f = _rafFn; _rafFn = null;
    if (f) f();
  }

  // ── CANVAS DRAWING ────────────────────────────────────────────
  function draw() {
    const calc = S._cachedCalc;
    if (!calc) return;
    const prms = S.params;
    const w = canvas.width, h = canvas.height;
    if (w <= 0 || h <= 0) return;

    const C = {
      bg: '#1e1e2e', grid: '#313244', axis: '#f38ba8', stock: '#6c7086',
      contour: '#89b4fa', offset: '#cba6f7', pass: '#a6e3a1', finish: '#f5c2e7',
      error: '#f38ba8', text: '#6c7086', tool: '#f9e2af', insert: 'rgba(186,194,222,0.7)'
    };

    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);
    const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
    const toScreen = (x, z) => {
      if (isNaN(x) || isNaN(z)) return { x: 0, y: 0 };
      if (prms.machineStructure === 'carousel')
        return { x: S.view.panX + hS * x * S.view.scale, y: S.view.panY + vS * z * S.view.scale };
      return { x: S.view.panX + hS * z * S.view.scale, y: S.view.panY + vS * x * S.view.scale };
    };

    // grid — dynamically cover entire visible canvas
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.beginPath();
    // Convert canvas corners to world coords to find visible range
    const toWorld = (sx, sy) => {
      if (prms.machineStructure === 'carousel')
        return { x: hS * (sx - S.view.panX) / S.view.scale, z: vS * (sy - S.view.panY) / S.view.scale };
      return { x: vS * (sy - S.view.panY) / S.view.scale, z: hS * (sx - S.view.panX) / S.view.scale };
    };
    const wTL = toWorld(0, 0), wBR = toWorld(w, h);
    const wMinX = Math.min(wTL.x, wBR.x), wMaxX = Math.max(wTL.x, wBR.x);
    const wMinZ = Math.min(wTL.z, wBR.z), wMaxZ = Math.max(wTL.z, wBR.z);
    // Choose grid step based on zoom
    const rawStep = Math.max(wMaxX - wMinX, wMaxZ - wMinZ) / 15;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const gridStep = [1, 2, 5, 10].map(m => m * mag).find(s => s >= rawStep) || (10 * mag);
    const gx0 = Math.floor(wMinX / gridStep) * gridStep, gx1 = Math.ceil(wMaxX / gridStep) * gridStep;
    const gz0 = Math.floor(wMinZ / gridStep) * gridStep, gz1 = Math.ceil(wMaxZ / gridStep) * gridStep;
    for (let v = gx0; v <= gx1; v += gridStep) {
      const p1 = toScreen(v, gz0), p2 = toScreen(v, gz1);
      ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
    }
    for (let v = gz0; v <= gz1; v += gridStep) {
      const p1 = toScreen(gx0, v), p2 = toScreen(gx1, v);
      ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
    }
    ctx.stroke();

    // grid labels
    ctx.fillStyle = '#585b70'; ctx.font = '10px sans-serif';
    for (let v = gx0; v <= gx1; v += gridStep) {
      if (Math.abs(v) < gridStep * 0.01) continue;
      const label = Number.isInteger(v) ? v.toString() : v.toFixed(1);
      if (prms.machineStructure === 'carousel') {
        const pt = toScreen(v, 0); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(label, pt.x, pt.y + 2);
      } else {
        const pt = toScreen(v, 0); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(label, pt.x - 4, pt.y);
      }
    }
    for (let v = gz0; v <= gz1; v += gridStep) {
      if (Math.abs(v) < gridStep * 0.01) continue;
      const label = Number.isInteger(v) ? v.toString() : v.toFixed(1);
      if (prms.machineStructure === 'carousel') {
        const pt = toScreen(0, v); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(label, pt.x - 4, pt.y);
      } else {
        const pt = toScreen(0, v); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(label, pt.x, pt.y + 2);
      }
    }

    // axes
    const zero = toScreen(0, 0);
    ctx.strokeStyle = C.axis; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(0, zero.y); ctx.lineTo(w, zero.y);
    ctx.moveTo(zero.x, 0); ctx.lineTo(zero.x, h);
    ctx.stroke();
    ctx.fillStyle = C.axis; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const vLabelY = S.flipX ? h - 8 : 15;
    const hLabelX = S.flipZ ? 20 : w - 20;
    if (prms.machineStructure === 'carousel') {
      ctx.fillText('X+', hLabelX, zero.y + 15); ctx.fillText('Z+', zero.x + 10, vLabelY);
    } else {
      ctx.fillText('Z+', hLabelX, zero.y + 15); ctx.fillText('X+', zero.x + 10, vLabelY);
    }
    ctx.fillText('X0 Z0', zero.x + 4, zero.y - 4);

    // Vybarvení (fill objekty z CAD nástroje "Vybarvit") — CAM čte state.objects
    // přímo (na rozdíl od kontury/polotovaru CAM nemá vlastní kopii těchto
    // objektů, protože jde jen o vizuální anotaci, ne obráběnou geometrii).
    // Stejné pořadí jako v CAD (js/render.js drawFills) — kreslí se pod vším.
    const camXZ = (cx, cy) => prms.machineStructure === 'carousel' ? [cx, cy] : [cy, cx];
    state.objects.forEach((obj) => {
      if (obj.type !== 'fill' || !obj.loops || obj.loops.length === 0) return;
      const layer = state.layers.find(l => l.id === obj.layer);
      if (layer && !layer.visible) return;
      const path = new Path2D();
      for (const loop of obj.loops) {
        if (loop.length < 3) continue;
        const p0 = toScreen(...camXZ(loop[0].x, loop[0].y));
        path.moveTo(p0.x, p0.y);
        for (let i = 1; i < loop.length; i++) {
          const p = toScreen(...camXZ(loop[i].x, loop[i].y));
          path.lineTo(p.x, p.y);
        }
        path.closePath();
      }
      ctx.save();
      ctx.globalAlpha = obj.alpha ?? 0.35;
      ctx.fillStyle = obj.color || '#60a5fa';
      ctx.fill(path, 'evenodd');
      ctx.restore();
    });

    // stock
    if (prms.stockMode === 'cylinder') {
      const sRad = (parseFloat(prms.stockDiameter) || 0) / 2;
      const sLen = parseFloat(prms.stockLength) || 0;
      const sFace = parseFloat(prms.stockFace) || 0;
      const s1 = toScreen(sRad, sFace), s2 = toScreen(sRad, -sLen), s3 = toScreen(0, -sLen), sStart = toScreen(0, sFace);
      // filled area
      ctx.fillStyle = 'rgba(108,112,134,0.12)';
      ctx.beginPath(); ctx.moveTo(sStart.x, sStart.y); ctx.lineTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.lineTo(s3.x, s3.y); ctx.closePath(); ctx.fill();
      // outline — all 4 sides visible (tlustá červená čára)
      ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 3; ctx.beginPath();
      ctx.moveTo(sStart.x, sStart.y); ctx.lineTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.lineTo(s3.x, s3.y); ctx.closePath();
      ctx.stroke();
      // label with stock dimensions
      const labelPt = toScreen(sRad, sFace);
      const stockDiaLabel = `∅${parseFloat(prms.stockDiameter)} × ${sLen}`;
      ctx.fillStyle = '#fab387'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      if (prms.machineStructure === 'carousel') ctx.fillText(stockDiaLabel, labelPt.x + 4, labelPt.y - 4);
      else ctx.fillText(stockDiaLabel, labelPt.x + 4, labelPt.y - 4);
    } else if (calc.stockPathSegments.length > 0) {
      ctx.beginPath();
      calc.stockPathSegments.forEach((seg, i) => {
        if (seg.type === 'line') {
          const p1 = toScreen(seg.p1.x, seg.p1.z), p2 = toScreen(seg.p2.x, seg.p2.z);
          if (i === 0) ctx.moveTo(p1.x, p1.y); else ctx.lineTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
        } else if (seg.type === 'arc') {
          const steps = arcSteps(seg.r, S.view.scale);
          let sA = seg.startAngle, eA = seg.endAngle;
          if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
          if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
          for (let j = 0; j <= steps; j++) {
            const a = sA + (eA - sA) * (j / steps);
            const pt = toScreen(seg.cx + Math.sin(a) * seg.r, seg.cz + Math.cos(a) * seg.r);
            if (j === 0 && i === 0) ctx.moveTo(pt.x, pt.y);
            else if (j === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          }
        }
      });
      ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 3; ctx.stroke();
    }

    // contour
    if (calc.worldPoints.length > 0 && !calc.profileViewActive) {
      ctx.beginPath();
      const start = toScreen(calc.worldPoints[0].xReal, calc.worldPoints[0].zReal);
      ctx.moveTo(start.x, start.y);
      for (let i = 0; i < calc.worldPoints.length - 1; i++) {
        const p1 = calc.worldPoints[i], p2 = calc.worldPoints[i + 1];
        const ptEnd = toScreen(p2.xReal, p2.zReal);
        if (p2.type === 'G0') {
          // G0 = mezera mezi nesouvisejícími entitami — nic nevykreslovat,
          // jen přesunout "pero" na začátek dalšího úseku.
          ctx.moveTo(ptEnd.x, ptEnd.y);
        } else if (p2.type === 'G1') {
          ctx.lineTo(ptEnd.x, ptEnd.y);
        } else if (p2.type === 'G2' || p2.type === 'G3') {
          const arc = getArcParams({ x: p1.xReal, z: p1.zReal }, { x: p2.xReal, z: p2.zReal }, p2.rVal, p2.type);
          if (!arc.error) {
            const steps = arcSteps(arc.r, S.view.scale);
            let sA = Math.atan2(p1.xReal - arc.cx, p1.zReal - arc.cz);
            let eA = Math.atan2(p2.xReal - arc.cx, p2.zReal - arc.cz);
            if (p2.type === 'G2' && eA > sA) eA -= 2 * Math.PI;
            if (p2.type === 'G3' && eA < sA) eA += 2 * Math.PI;
            for (let j = 1; j <= steps; j++) {
              const a = sA + (eA - sA) * (j / steps);
              const pt = toScreen(arc.cx + Math.sin(a) * arc.r, arc.cz + Math.cos(a) * arc.r);
              ctx.lineTo(pt.x, pt.y);
            }
          } else ctx.lineTo(ptEnd.x, ptEnd.y);
        }
      }
      ctx.strokeStyle = (S._previewContour || calc.profileViewActive) ? 'rgba(137,180,250,0.2)' : C.contour; ctx.lineWidth = calc.profileViewActive ? 1.5 : 3; ctx.stroke();

      // Úseky kontury vzniklé z geometrie destičky (profilování po mezní
      // čáře) — odlišná barva, ať je poznat. Berou se ale jako normální
      // kontura (G1). Při náhledu profilu se nekreslí (kontura je ztlumená).
      if (!S._previewContour) {
        ctx.beginPath();
        let anyIns = false;
        for (let i = 0; i < calc.worldPoints.length - 1; i++) {
          const p2 = calc.worldPoints[i + 1];
          if (!p2.fromInsert || p2.type === 'G0') continue;
          const a = toScreen(calc.worldPoints[i].xReal, calc.worldPoints[i].zReal);
          const b = toScreen(p2.xReal, p2.zReal);
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); anyIns = true;
        }
        if (anyIns) { ctx.strokeStyle = '#fab387'; ctx.lineWidth = 3; ctx.stroke(); }
      }
    }

    // Auto-profil (Hlídat geometrii): mostové úseky z geometrie destičky,
    // které automaticky nahradily nedosažitelnou část kontury — oranžově,
    // ať je profil vidět (offsety/CNC jedou po této obrobitelné kontuře).
    if (calc.machinableContour && !S._previewContour) {
      ctx.beginPath();
      let anyM = false;
      for (const s of calc.machinableContour) {
        if (!s.fromInsert || s.type !== 'line' || s.isDegenerate) continue;
        const a = toScreen(s.p1.x, s.p1.z), b = toScreen(s.p2.x, s.p2.z);
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); anyM = true;
      }
      if (anyM) { ctx.strokeStyle = '#fab387'; ctx.lineWidth = 3; ctx.stroke(); }
    }

    // Náhled trasovaného profilu (číslovaná kontura čekající na potvrzení)
    if (S._previewContour) {
      _drawPointsContour(S._previewContour, toScreen, C.pass, true);
    }

    // Body trasování v průběhu (před dokončením)
    if (S.profileTraceMode && S._tracePoints.length > 0) {
      const tracePts = [{ ...S._tracePoints[0], type: 'G0' }];
      for (let i = 0; i < S._traceSegs.length; i++) {
        const seg = S._traceSegs[i];
        tracePts.push({ ...S._tracePoints[i + 1], type: seg.type, r: seg.r || 0 });
      }
      _drawPointsContour(tracePts, toScreen, C.tool, true);
    }

    // zvýraznění úseků kontury, kam destička dle svého tvaru/natočení
    // nedosáhne beze zbytku materiálu (kolize bočním ostřím)
    if (calc.interferenceSegments && calc.interferenceSegments.length > 0) {
      ctx.beginPath();
      calc.interferenceSegments.forEach(seg => {
        if (seg.type === 'line') {
          const p1 = toScreen(seg.p1.x, seg.p1.z), p2 = toScreen(seg.p2.x, seg.p2.z);
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        } else if (seg.type === 'arc') {
          const steps = arcSteps(seg.r, S.view.scale);
          let sA = Math.atan2(seg.p1.x - seg.cx, seg.p1.z - seg.cz);
          let eA = Math.atan2(seg.p2.x - seg.cx, seg.p2.z - seg.cz);
          if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
          if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
          for (let j = 0; j <= steps; j++) {
            const a = sA + (eA - sA) * (j / steps);
            const pt = toScreen(seg.cx + Math.sin(a) * seg.r, seg.cz + Math.cos(a) * seg.r);
            if (j === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
          }
        }
      });
      ctx.strokeStyle = C.error; ctx.lineWidth = 5; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
    }

    // oranžové zvýraznění: hřbet destičky koliduje s materiálem (α příliš malý)
    if (calc.flankSegments && calc.flankSegments.length > 0) {
      ctx.beginPath();
      calc.flankSegments.forEach(seg => {
        if (seg.type === 'line') {
          const p1 = toScreen(seg.p1.x, seg.p1.z), p2 = toScreen(seg.p2.x, seg.p2.z);
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        } else if (seg.type === 'arc') {
          const steps = arcSteps(seg.r, S.view.scale);
          let sA = Math.atan2(seg.p1.x - seg.cx, seg.p1.z - seg.cz);
          let eA = Math.atan2(seg.p2.x - seg.cx, seg.p2.z - seg.cz);
          if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
          if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
          for (let j = 0; j <= steps; j++) {
            const a = sA + (eA - sA) * (j / steps);
            const pt = toScreen(seg.cx + Math.sin(a) * seg.r, seg.cz + Math.cos(a) * seg.r);
            if (j === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
          }
        }
      });
      ctx.strokeStyle = '#fab387'; ctx.lineWidth = 4; ctx.setLineDash([6, 3]); ctx.stroke(); ctx.setLineDash([]);
    }

    // pomocné (konstrukční) čáry — ruční tečny z nástroje Úhel (žluté)
    // + automatické mezní čáry hran destičky (tyrkysové). Ke každé se
    // kreslí i offset o rádius plátku (kam dojede STŘED plátku) a malé
    // kroužky na koncových bodech (tečné body / průsečíky) pro klikání.
    {
      const allGuides = [
        ...(S.guideLines || []).map(g => ({ ...g, auto: false })),
        ...((calc.interferenceGuides || []).map(g => ({ ...g, auto: true })))
      ];
      if (allGuides.length > 0) {
        const tipROff = parseFloat(prms.toolRadius) || 0;
        allGuides.forEach(g => {
          const col = g.auto ? '#94e2d5' : C.tool;
          // Uživatelské konstrukční čáry jsou NEKONEČNÉ jen v režimu úpravy
          // (odemčeno) – slouží jako reference pro prodloužení/snap. Po zamčení
          // se zkrátí ke svým skutečným koncovým bodům.
          // Lomená čára (hlídání držáku, g.via) se kreslí po vrcholech; přímá
          // jako dřív. Uživatelská čára v režimu úprav je nekonečná.
          let poly = guidePolyPoints(g);
          if (!g.auto && S.gcodeEditEnabled && (!g.via || !g.via.length)) {
            let dx = g.x2 - g.x1, dz = g.z2 - g.z1; const L = Math.hypot(dx, dz);
            if (L > 1e-9) {
              dx /= L; dz /= L;
              poly = [{ x: g.x2 + dx * 1e4, z: g.z2 + dz * 1e4 }, { x: g.x1 - dx * 1e4, z: g.z1 - dz * 1e4 }];
            }
          }
          ctx.beginPath();
          poly.forEach((q, qi) => {
            const p = toScreen(q.x, q.z);
            if (qi === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
          });
          // Čelní mezní čára končící na polotovaru (downOnStock) = PLNÁ (mění
          // obrobitelnou konturu); ostatní mezní čáry čárkovaně.
          ctx.strokeStyle = col; ctx.lineWidth = 1.5;
          ctx.setLineDash(g.downOnStock ? [] : [8, 4]); ctx.stroke(); ctx.setLineDash([]);
          // offset dráhy středu plátku (korekce R) na stranu vzduchu (+X).
          // Dva offsety jako u kontury: dokončovací (jen R) a hrubovací
          // (R + Přídavek X/Z + Přídavek na hotovo) — po jednotlivých úsecích.
          if (tipROff > 0) {
            const aX = parseFloat(prms.allowanceX) || 0;
            const aZ = parseFloat(prms.allowanceZ) || 0;
            const fin = parseFloat(prms.finishAllowance) || 0;
            const drawOff = (rOff, aXo, aZo) => {
              ctx.beginPath();
              for (let k = 0; k + 1 < poly.length; k++) {
                let n = getNormal(poly[k], poly[k + 1]);
                if (n.x < 0 || (Math.abs(n.x) < 1e-9 && n.z < 0)) n = { x: -n.x, z: -n.z };
                const ox = n.x * (rOff + aXo), oz = n.z * (rOff + aZo);
                const o1 = toScreen(poly[k].x + ox, poly[k].z + oz);
                const o2 = toScreen(poly[k + 1].x + ox, poly[k + 1].z + oz);
                ctx.moveTo(o1.x, o1.y); ctx.lineTo(o2.x, o2.y);
              }
              ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.stroke(); ctx.setLineDash([]);
            };
            drawOff(tipROff, 0, 0);
            if (aX > 1e-9 || aZ > 1e-9 || fin > 1e-9)
              drawOff(tipROff + fin, aX, aZ);
          }
          // koncové body (PŮVODNÍ konce) — viditelné a uchopitelné (tažení po
          // čáře = prodloužit/zkrátit; "+" vloží bod kontury v tečném bodě)
          const c1 = toScreen(g.x1, g.z1), c2 = toScreen(g.x2, g.z2);
          ctx.fillStyle = col;
          for (const q of [c1, c2]) { ctx.beginPath(); ctx.arc(q.x, q.y, 4, 0, Math.PI * 2); ctx.fill(); }
        });
      }
    }

    // offset path — v 🙈 stavu (none) skryjeme všechny drahy
    if (S.showSimPath !== 'none' && calc.offsetPath.length > 0) {
      ctx.beginPath();
      calc.offsetPath.forEach((seg, i) => {
        if (seg.isDegenerate) return;
        if (seg.type === 'line') {
          const p1 = toScreen(seg.p1.x, seg.p1.z), p2 = toScreen(seg.p2.x, seg.p2.z);
          if (i === 0 || seg.chainBreak) ctx.moveTo(p1.x, p1.y); else ctx.lineTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
        } else if (seg.type === 'arc') {
          const steps = arcSteps(seg.r, S.view.scale);
          let sA = seg.startAngle, eA = seg.endAngle;
          if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
          if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
          for (let j = 0; j <= steps; j++) {
            const a = sA + (eA - sA) * (j / steps);
            const pt = toScreen(seg.cx + Math.sin(a) * seg.r, seg.cz + Math.cos(a) * seg.r);
            if (j === 0 && (i === 0 || seg.chainBreak)) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          }
        }
      });
      ctx.strokeStyle = C.offset; ctx.lineWidth = 1; ctx.setLineDash([2, 2]); ctx.stroke(); ctx.setLineDash([]);
    }

    // finish path — kreslí simPath (zelená), finishOffsetPath overlay odstraněn

    // Nedosažitelný dokončovací offset (Hlídat geometrii destičky) —
    // tečkovaně: úseky, kam destička bočním ostřím nedosáhne, takže se
    // neobrobí, ale je vidět, že tam kontura nebude objeta.
    if (S.showSimPath !== 'none' && (prms.doFinishing || prms.finishOnly) && (calc.finishUnreachablePath || []).length > 0) {
      ctx.beginPath();
      calc.finishUnreachablePath.forEach(seg => {
        if (seg.isDegenerate) return;
        if (seg.type === 'line') {
          const p1 = toScreen(seg.p1.x, seg.p1.z), p2 = toScreen(seg.p2.x, seg.p2.z);
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        } else if (seg.type === 'arc') {
          const steps = arcSteps(seg.r, S.view.scale);
          let sA = seg.startAngle, eA = seg.endAngle;
          if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
          if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
          for (let j = 0; j <= steps; j++) {
            const a = sA + (eA - sA) * (j / steps);
            const pt = toScreen(seg.cx + Math.sin(a) * seg.r, seg.cz + Math.cos(a) * seg.r);
            if (j === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
          }
        }
      });
      ctx.strokeStyle = C.finish; ctx.lineWidth = 1.5; ctx.setLineDash([2, 4]); ctx.stroke(); ctx.setLineDash([]);
    }

    // Vykreslí trasování kontury (G1/G2/G3 segmenty s x1/z1/x2/z2) do
    // aktuální cesty — sdíleno pro contourLeadIn i contourLeadOut.
    const drawContourTrace = (segs) => {
      for (const seg of segs) {
        if (seg.type === 'line') {
          const p1 = toScreen(seg.x1, seg.z1), p2 = toScreen(seg.x2, seg.z2);
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        } else {
          const steps = arcSteps(seg.r, S.view.scale);
          let sA = seg.startAngle, eA = seg.endAngle;
          if (seg.dir === 'G2' && eA > sA) eA -= 2 * Math.PI;
          if (seg.dir === 'G3' && eA < sA) eA += 2 * Math.PI;
          for (let j = 0; j <= steps; j++) {
            const a = sA + (eA - sA) * (j / steps);
            const pt = toScreen(seg.cx + Math.sin(a) * seg.r, seg.cz + Math.cos(a) * seg.r);
            if (j === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
          }
        }
      }
    };

    // roughing passes — v 🙈 stavu skryjeme všechny drahy. Při úpravě drah
    // (✥ Dráhy) se skryjí taky: jsou počítané z kontury (needitují se podle
    // ručního G-kódu), takže by zůstaly viset na staré pozici a překrývaly
    // by skutečnou editovanou dráhu (simPath).
    if (S.showSimPath !== 'none' && !S.gcodeEditEnabled) {
      ctx.beginPath();
      calc.passes.forEach(pass => {
        if (pass.type === 'long') {
          if (pass.contourLeadIn) {
            // sledování kontury (G1/G2/G3) přes kapsu místo odskoku
            drawContourTrace(pass.contourLeadIn);
          }
          if (pass.ramp) {
            // rampa zanoření z "rohu" kontury (tečný bod pod úhlem zanoření)
            const pr = toScreen(pass.ramp.x0, pass.ramp.z0);
            const pe = toScreen(pass.x, pass.zStart);
            ctx.moveTo(pr.x, pr.y); ctx.lineTo(pe.x, pe.y);
          }
          const p1 = toScreen(pass.x, pass.zStart), p2 = toScreen(pass.x, pass.zEnd);
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
          if (pass.contourLeadOut) drawContourTrace(pass.contourLeadOut);
        } else {
          const p1 = toScreen(pass.xStart, pass.z), p2 = toScreen(pass.xEnd, pass.z);
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
          if (pass.contourLeadOut) drawContourTrace(pass.contourLeadOut);
        }
      });
      ctx.strokeStyle = C.pass; ctx.lineWidth = 1.5; ctx.stroke();
    }

    // sim path — 'all' = vše, 'cut' = jen řezné, 'none' = nic.
    // Posuvy (G1/G2/G3) plnou čarou (zelená = řez), rychloposuvy (G0)
    // čárkovaně (růžová) — aby G1 nevypadal jako rychloposuv.
    if (S.showSimPath !== 'none' && calc.simPath.length > 0) {
      const strokeSub = (wantRapid) => {
        ctx.beginPath();
        let any = false;
        for (let i = 0; i < calc.simPath.length - 1; i++) {
          const p2 = calc.simPath[i + 1];
          const isRapid = p2.type === 'G0';
          if (isRapid !== wantRapid) continue;
          if (S.showSimPath === 'cut' && isRapid) continue;
          if (p2.arcParams) {
            const ap = p2.arcParams;
            const drawSteps = arcSteps(ap.r, S.view.scale);
            const sA = ap.startAngle, eA = ap.endAngle;
            for (let j = 0; j <= drawSteps; j++) {
              const a = sA + (eA - sA) * (j / drawSteps);
              const pt = toScreen(ap.cx + Math.sin(a) * ap.r, ap.cz + Math.cos(a) * ap.r);
              if (j === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
            }
            i += ap.tessSteps - 1;
            any = true;
          } else {
            const s = toScreen(calc.simPath[i].x, calc.simPath[i].z), e = toScreen(p2.x, p2.z);
            if (Math.abs(s.x - e.x) > 0.1 || Math.abs(s.y - e.y) > 0.1) {
              ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); any = true;
            }
          }
        }
        if (!any) return;
        ctx.lineWidth = 1.5;
        if (wantRapid) { ctx.strokeStyle = '#f38ba8'; ctx.setLineDash([6, 6]); }
        else { ctx.strokeStyle = '#a6e3a1'; ctx.setLineDash([]); }
        ctx.stroke(); ctx.setLineDash([]);
      };
      strokeSub(false);   // posuvy – plně
      strokeSub(true);    // rychloposuvy – čárkovaně
    }

    // úchopové body / úsečky pro úpravu drah (✥ Dráhy)
    if (S.gcodeEditEnabled && !S.simRunning && calc.simPath.length > 0) {
      const hlSeg = S._draggedGSeg || S.hoverGSeg;
      if (hlSeg) {
        const a = toScreen(hlSeg.p1.x, hlSeg.p1.z), b = toScreen(hlSeg.p2.x, hlSeg.p2.z);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = '#f9e2af'; ctx.lineWidth = 3; ctx.stroke();
      }
      const nodes = getGNodes();
      const dragLi = S.draggedGNode ? S.draggedGNode.lineIdx : null;
      const hovLi = S.hoverGNode ? S.hoverGNode.lineIdx : null;
      for (const n of nodes) {
        const pt = toScreen(n.x, n.z);
        const active = n.lineIdx === dragLi || n.lineIdx === hovLi;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, active ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle = active ? '#f9e2af' : (n.type === 'G0' ? '#89b4fa' : '#a6e3a1');
        ctx.fill();
        ctx.strokeStyle = '#1e1e2e'; ctx.lineWidth = 1; ctx.stroke();
      }
    }

    // Rovina upichnutí (part-off) — SVISLÁ ÚSEČKA kontury v Z=partOffZ.
    // Plná čára = upichovací plocha od dojezdu (spodní hrana plátku) po vršek
    // polotovaru; celá rovina řezu navíc čárkovaně (reference od osy nahoru).
    if (prms.partOffZ != null && isFinite(parseFloat(prms.partOffZ))) {
      const g = partOffGeom(prms, calc);
      const pz = g.pz;
      const xTopRef = Math.max(g.xStockTop, (parseFloat(prms.toolRadius) || 1) * 3);
      ctx.save();
      // Reference celé roviny řezu (čárkovaně, od osy nahoru).
      const a0 = toScreen(0, pz), bRef = toScreen(xTopRef * 1.05, pz);
      ctx.strokeStyle = '#f38ba8'; ctx.lineWidth = 1.5; ctx.setLineDash([7, 5]);
      ctx.beginPath(); ctx.moveTo(a0.x, a0.y); ctx.lineTo(bRef.x, bRef.y); ctx.stroke();
      ctx.setLineDash([]);
      // Obrobená úsečka (plná) od spodní hrany (dojezd) po vršek polotovaru
      // + dva úchopové body: spodní = Dojezd X, horní = Start X. V režimu
      // ◆ Kontura je lze chytit a táhnout v ose X (nastaví Dojezd X / Start X).
      if (g.canCut) {
        const eBot = toScreen(g.xBottomEdge, pz), eTop = toScreen(g.xStockTop, pz);
        ctx.strokeStyle = '#f38ba8'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(eBot.x, eBot.y); ctx.lineTo(eTop.x, eTop.y); ctx.stroke();
        const interactive = S.pointDragEnabled && !S.simRunning;
        const drawHandle = (p, color, which, label) => {
          const active = (interactive && S._hoverPartOff === which) || _draggingPartOff === which;
          const r = active ? 6.5 : (interactive ? 5 : 3.5);
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fillStyle = active ? '#f9e2af' : color;
          ctx.fill(); ctx.strokeStyle = '#1e1e2e'; ctx.lineWidth = 1.5; ctx.stroke();
          if (interactive) {
            ctx.fillStyle = color; ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillText(label, p.x + 9, p.y);
          }
        };
        drawHandle(toScreen(g.startEdgeX, pz), '#89b4fa', 'start', 'Start X');   // horní (modrý)
        drawHandle(toScreen(g.xBottomEdge, pz), '#f38ba8', 'dojezd', 'Dojezd X'); // spodní (růžový)
      }
      ctx.fillStyle = '#f38ba8'; ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(`✂ upich Z=${pz.toFixed(2)}`, bRef.x, bRef.y - 4);
      ctx.restore();
    }

    // tool position during sim
    if ((S.simRunning || S.simProgress > 0) && calc.simPath.length > 0) {
      const totalPoints = calc.simPath.length;
      const floatIndex = S.simProgress * (totalPoints - 1);
      const idx = Math.floor(floatIndex);
      const t = floatIndex - idx;
      const pCurrent = calc.simPath[idx];
      if (pCurrent) {
        const pNext = calc.simPath[Math.min(idx + 1, totalPoints - 1)] || pCurrent;
        const curX = pCurrent.x + (pNext.x - pCurrent.x) * t;
        const curZ = pCurrent.z + (pNext.z - pCurrent.z) * t;
        const pt = toScreen(curX, curZ);
        const tRad = parseFloat(prms.toolRadius) || 0.8;
        // −0.75px = polovina šířky konturové čáry (lineWidth 1.5), aby okraj
        // plátku nepřekrýval vykreslenou čáru kontury.
        const rPix = Math.max(tRad * S.view.scale, 6) - 0.75;
        // Držák (za destičkou) — stejné zrcadlení jako destička (strana
        // obrábění/flipZ vodorovně, flipX svisle), ale BEZ natočení
        // specifického pro tvar destičky (toolAngle), stejně jako v dialogu
        // "⚙️ Geometrie" (tam drží orientaci držáku jen knifeAngle).
        ctx.save(); ctx.translate(pt.x, pt.y);
        if ((roughingKey() === 'backside') !== !!S.flipZ) ctx.scale(-1, 1);
        if (S.flipX) ctx.scale(1, -1);
        drawHolderProfileLocal(ctx, prms, S.view.scale);
        ctx.restore();
        ctx.fillStyle = C.insert; ctx.strokeStyle = C.text; ctx.lineWidth = 1;
        if (prms.toolShape === 'round') {
          ctx.beginPath(); ctx.arc(pt.x, pt.y, rPix, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        } else if (prms.toolShape === 'threading') {
          // Závitový plátek: lichoběžníková špička — rovná SPODNÍ STRANA
          // (šířka toolTipFlat) leží přímo na dráze (X průchodu = ⌀ řezu),
          // boky stoupají symetricky ±ε/2 od svislice. Rádius se nepoužívá.
          const tipAngDeg = parseFloat(prms.toolTipAngle) || 60;
          const half = (tipAngDeg / 2) * (Math.PI / 180);
          const lenPix = Math.max((parseFloat(prms.toolLength) || 4) * S.view.scale, 20);
          const w2 = Math.max(((parseFloat(prms.toolTipFlat) || 0) * S.view.scale) / 2, 0.75);
          const dx = Math.sin(half) * lenPix;
          const dy = Math.cos(half) * lenPix;
          ctx.save(); ctx.translate(pt.x, pt.y);
          if (S.flipX) ctx.scale(1, -1);
          ctx.beginPath();
          ctx.moveTo(-w2 - dx, -dy);   // levý horní roh
          ctx.lineTo(-w2, 0);          // levý konec spodní strany
          ctx.lineTo(w2, 0);           // spodní strana (řezná hrana)
          ctx.lineTo(w2 + dx, -dy);    // pravý horní roh
          ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.restore();
        } else if (prms.toolShape === 'polygon') {
          const tipAngDeg = parseFloat(prms.toolTipAngle) || 90;
          const effAngleDeg = parseFloat(prms.toolAngle) || 0;
          const lenPix = Math.max((parseFloat(prms.toolLength) || 10) * S.view.scale, 20);
          const rotRad = -effAngleDeg * (Math.PI / 180);
          const tipAng = tipAngDeg * (Math.PI / 180);
          const a1 = rotRad, a2 = rotRad - tipAng;
          const distToCorner = rPix / Math.sin(tipAng / 2);
          const bisector = (a1 + a2) / 2;
          const cornerX = Math.cos(bisector + Math.PI) * distToCorner;
          const cornerY = Math.sin(bisector + Math.PI) * distToCorner;
          // tangenciální body, kde poloměr špičky (rPix) navazuje na hrany destičky
          const tanLen = Math.min(rPix / Math.tan(tipAng / 2), lenPix * 0.99);
          const t1x = cornerX + Math.cos(a1) * tanLen, t1y = cornerY + Math.sin(a1) * tanLen;
          const t2x = cornerX + Math.cos(a2) * tanLen, t2y = cornerY + Math.sin(a2) * tanLen;
          const angT1 = Math.atan2(t1y, t1x), angT2 = Math.atan2(t2y, t2x);
          const angCorner = bisector + Math.PI;
          const norm = a => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
          const angDiff = (a, b) => { let d = norm(a - b); if (d > Math.PI) d -= 2 * Math.PI; return d; };
          const midCCWfalse = angT2 + norm(angT1 - angT2) / 2;
          const midCCWtrue = angT2 - norm(angT2 - angT1) / 2;
          const useCCW = Math.abs(angDiff(midCCWtrue, angCorner)) < Math.abs(angDiff(midCCWfalse, angCorner));
          ctx.save(); ctx.translate(pt.x, pt.y);
          // Zrcadlení destičky musí odpovídat globálnímu pohledu (viz vS/hS
          // v toScreen). Horizontálně (osa Z): backside a flipZ se vzájemně
          // ruší (XOR). Vertikálně (osa X): flipX zrcadlí pohled svisle.
          if ((roughingKey() === 'backside') !== !!S.flipZ) ctx.scale(-1, 1);
          if (S.flipX) ctx.scale(1, -1);
          ctx.beginPath(); ctx.moveTo(t1x, t1y);
          ctx.lineTo(cornerX + Math.cos(a1) * lenPix, cornerY + Math.sin(a1) * lenPix);
          ctx.lineTo(cornerX + Math.cos(a2) * lenPix, cornerY + Math.sin(a2) * lenPix);
          ctx.lineTo(t2x, t2y);
          ctx.arc(0, 0, rPix, angT2, angT1, useCCW);
          ctx.closePath(); ctx.fill(); ctx.stroke();
          // Vizualizace úhlu hřbetu (α) — tečkované čáry na hranách plátku
          const clearDeg = parseFloat(prms.toolClearanceAngle) || 0;
          if (clearDeg > 0) {
            const clearRad = clearDeg * Math.PI / 180;
            const clLen = Math.min(lenPix * 0.65, 30);
            ctx.save();
            ctx.strokeStyle = 'rgba(166,173,200,0.7)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
            // hřbet na hlavním ostří (a1)
            const ca1 = a1 - clearRad;
            ctx.beginPath(); ctx.moveTo(t1x, t1y);
            ctx.lineTo(t1x + Math.cos(ca1) * clLen, t1y + Math.sin(ca1) * clLen);
            ctx.stroke();
            // hřbet na vedlejším ostří (a2)
            const ca2 = a2 + clearRad;
            ctx.beginPath(); ctx.moveTo(t2x, t2y);
            ctx.lineTo(t2x + Math.cos(ca2) * clLen, t2y + Math.sin(ca2) * clLen);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
          }
          ctx.restore();
        } else if (prms.toolShape === 'parting') {
          // Upichovací / zapichovací plátek: šířka = toolLength, dva spodní
          // rádiusy R. Referenční bod (0,0) = STŘED RÁDIUSU PRACOVNÍ STRANY
          // (jako u polygonu): zprava = levý roh plátku, zleva = pravý roh.
          // Lokálně kreslíme vždy levý roh v počátku s tělem doprava (do už
          // obrobené zóny); stranu obrábění řeší zrcadlení níže.
          const wPix = Math.max((parseFloat(prms.toolLength) || 10) * S.view.scale, 20);
          const rotRad = -(parseFloat(prms.toolAngle) || 0) * (Math.PI / 180);
          const r = Math.min(rPix, wPix / 2);        // rádius nesmí být širší než půl plátku
          const w2 = wPix - 2 * r;                   // rovná část spodního ostří
          // Stejná mm-výška jako v dialogu "⚙️ Geometrie" (PARTING_BODY_MIN_H_MM),
          // aby plátek vypadal stejně vysoký v simulaci i v náhledu geometrie.
          const bodyH = Math.max(wPix * 0.6, r + PARTING_BODY_MIN_H_MM * S.view.scale);
          ctx.save(); ctx.translate(pt.x, pt.y);
          // Zrcadlení: strana obrábění (zleva = otočený plátek) XOR flipZ
          // vodorovně; flipX svisle — ladí s vS/hS v toScreen.
          if (((prms.roughingSide || 'right') === 'left') !== !!S.flipZ) ctx.scale(-1, 1);
          if (S.flipX) ctx.scale(1, -1);
          ctx.rotate(rotRad);
          // Lokální souřadnice: y roste dolů (k ose). Střed aktivního rádiusu
          // = (0,0), spodní ostří na y=+r, tělo nahoru (−y), šířka doprava.
          ctx.beginPath();
          ctx.moveTo(-r, r - bodyH);                        // levý horní roh
          ctx.lineTo(-r, 0);                                // levá strana k tečně rádiusu
          ctx.arc(0, 0, r, Math.PI, Math.PI / 2, true);    // aktivní rádius (střed = ref. bod)
          ctx.lineTo(w2, r);                                // spodní ostří (rovná část)
          ctx.arc(w2, 0, r, Math.PI / 2, 0, true);         // druhý rádius
          ctx.lineTo(w2 + r, r - bodyH);                    // pravá strana nahoru
          ctx.closePath();
          ctx.fill(); ctx.stroke();
          // Malý kontrolní křížek ve středu DRUHÉHO (neaktivního) rádiusu —
          // při obrábění z druhé strany má ležet na offsetové čáře.
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(w2 - 5, 0); ctx.lineTo(w2 + 5, 0);
          ctx.moveTo(w2, -5); ctx.lineTo(w2, 5);
          ctx.stroke();
          ctx.restore();
        }
        // crosshair at tool center
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(pt.x - rPix - 4, pt.y); ctx.lineTo(pt.x + rPix + 4, pt.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(pt.x, pt.y - rPix - 4); ctx.lineTo(pt.x, pt.y + rPix + 4); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    }

    // draw points
    if (!S.simRunning) {
      // Always show cylinder stock handles
      if (prms.stockMode === 'cylinder') {
        const sRad = (parseFloat(prms.stockDiameter) || 0) / 2;
        const sLen = parseFloat(prms.stockLength) || 0;
        const sFace = parseFloat(prms.stockFace) || 0;
        const handles = [toScreen(sRad, sFace), toScreen(sRad, -sLen)];
        const labels = ['⌀/Čelo', '⌀/Délka'];
        ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        handles.forEach((pt, i) => {
          const isHovered = (S._hoverIsStock && i === S.hoverPointId);
          const isDragged = (_draggingStock && i === S.draggedPointId);
          const radius = (isHovered || isDragged) ? 9 : 6;
          ctx.fillStyle = (isHovered || isDragged) ? '#f9e2af' : '#fab387';
          ctx.strokeStyle = '#1e1e2e'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          if (!isDragged) {
            ctx.fillStyle = '#fab387';
            ctx.fillText(labels[i], pt.x + 12, pt.y - 10);
          }
        });
      }
      // Body kontury — VŽDY zobrazené s čísly (pro referenci při popisu bodu).
      // V contour edit módu jsou interaktivní; v stock módu jen reference (menší).
      ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const contourActive = S.editMode === 'contour';
      const pointPickActive = S.addPointMode || S.delPointMode;
      // Hover zvýraznění segmentu kontury/polotovaru (pod body, aby body byly navrchu)
      if (_hoverContourSeg && !S.simRunning) {
        const hs = _hoverContourSeg;
        const pts = hs.isStock ? calc.stockWorldPoints : calc.worldPoints;
        if (pts && pts[hs.idx1] && pts[hs.idx2]) {
          const a = toScreen(pts[hs.idx1].xReal, pts[hs.idx1].zReal);
          const b = toScreen(pts[hs.idx2].xReal, pts[hs.idx2].zReal);
          ctx.save();
          ctx.strokeStyle = '#f9e2af'; ctx.lineWidth = 4; ctx.globalAlpha = 0.5;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          ctx.restore();
        }
      }
      // Drag zvýraznění segmentu kontury/polotovaru (během tažení)
      if (_draggedContourSeg && !S.simRunning) {
        const ds = _draggedContourSeg;
        const pts = ds.isStock ? calc.stockWorldPoints : calc.worldPoints;
        if (pts && pts[ds.idx1] && pts[ds.idx2]) {
          const a = toScreen(pts[ds.idx1].xReal, pts[ds.idx1].zReal);
          const b = toScreen(pts[ds.idx2].xReal, pts[ds.idx2].zReal);
          ctx.save();
          ctx.strokeStyle = '#f9e2af'; ctx.lineWidth = 4; ctx.globalAlpha = 0.7;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          ctx.restore();
        }
      }
      if (calc.worldPoints) {
        calc.worldPoints.forEach((p, i) => {
          if (!p) return;
          const pt = toScreen(p.xReal, p.zReal);
          const isHovered = (S.pointDragEnabled || contourActive || pointPickActive) && !S._hoverIsStock && i === S.hoverPointId;
          const isDragged = !_draggingStockPt && !_draggingStock && i === S.draggedPointId;
          const isSelected = contourActive && S.selectedPoints.has(i);
          // V profil módu: body původní kontury se nezobrazují (jen hover/drag/sel pro editaci)
          if (calc.profileViewActive && !isHovered && !isDragged && !isSelected) return;
          const radius = (isHovered || isDragged) ? 8 : (isSelected ? 6 : (contourActive ? 4 : 3));
          ctx.fillStyle = (isHovered || isDragged) ? '#f9e2af' : (isSelected ? '#f9e2af' : C.contour);
          ctx.beginPath(); ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2); ctx.fill();
          if (isSelected) {
            ctx.strokeStyle = '#f9e2af'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(pt.x, pt.y, radius + 3, 0, Math.PI * 2); ctx.stroke();
          }
          if (!isHovered && !isDragged && !calc.profileViewActive) {
            ctx.fillStyle = contourActive ? '#f9e2af' : C.contour;
            ctx.fillText(`${i + 1}`, pt.x + 8, pt.y - 8);
          }
        });
      }
      // Body polotovaru — VŽDY zobrazené s čísly (S1, S2...), jen pro
      // casting (ne pro cylinder — ten má své vlastní handle nahoře).
      // V stock edit módu jsou interaktivní; v contour módu jen reference.
      if (calc.stockWorldPoints && prms.stockMode !== 'cylinder') {
        const stockActive = S.editMode === 'stock';
        calc.stockWorldPoints.forEach((p, i) => {
          if (!p) return;
          const pt = toScreen(p.xReal, p.zReal);
          const isHovered = (S.pointDragEnabled || stockActive || pointPickActive) && S._hoverIsStock && i === S.hoverPointId;
          const isDragged = _draggingStockPt && i === S.draggedPointId;
          const isSelected = stockActive && S.selectedPoints.has(i);
          const radius = (isHovered || isDragged) ? 8 : (isSelected ? 6 : (stockActive ? 4 : 3));
          ctx.fillStyle = (isHovered || isDragged) ? '#f9e2af' : (isSelected ? '#f9e2af' : C.pass);
          ctx.beginPath(); ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2); ctx.fill();
          if (isSelected) {
            ctx.strokeStyle = '#f9e2af'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(pt.x, pt.y, radius + 3, 0, Math.PI * 2); ctx.stroke();
          }
          if (!isHovered && !isDragged) {
            ctx.fillStyle = stockActive ? '#f9e2af' : C.pass;
            ctx.fillText(`S${i + 1}`, pt.x + 8, pt.y - 8);
          }
        });
      }
    }

    // Profil mód: profilová dráha se kreslí MIMO if(!simRunning) blok
    // → viditelná i při spuštěné simulaci (jako overlay nad nástrojem).
    if (calc.profileViewActive) {
      const profSegs = (calc.machinableContour || calc.contourSegments || []).filter(s => !s.isDegenerate);
      if (profSegs.length > 0) {
        ctx.beginPath();
        let _fp = true;
        for (const s of profSegs) {
          if (s.type === 'line') {
            const a = toScreen(s.p1.x, s.p1.z), b = toScreen(s.p2.x, s.p2.z);
            if (_fp) { ctx.moveTo(a.x, a.y); _fp = false; } else ctx.lineTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
          } else if (s.type === 'arc') {
            const p1 = toScreen(s.cx + Math.sin(s.startAngle)*s.r, s.cz + Math.cos(s.startAngle)*s.r);
            if (_fp) { ctx.moveTo(p1.x, p1.y); _fp = false; } else ctx.lineTo(p1.x, p1.y);
            const steps = Math.max(6, Math.round(Math.abs(s.endAngle - s.startAngle) * s.r / 0.5));
            for (let j = 1; j <= steps; j++) {
              const a2 = s.startAngle + (s.endAngle - s.startAngle) * (j / steps);
              const pt2 = toScreen(s.cx + Math.sin(a2)*s.r, s.cz + Math.cos(a2)*s.r);
              ctx.lineTo(pt2.x, pt2.y);
            }
          }
        }
        ctx.strokeStyle = C.contour; ctx.lineWidth = 3; ctx.stroke();
        // Číslování jen krajních bodů (ne interpolace oblouku)
        const nPts = [];
        for (const s of profSegs) {
          const p1 = s.type === 'line' ? s.p1 : { x: s.cx + Math.sin(s.startAngle)*s.r, z: s.cz + Math.cos(s.startAngle)*s.r };
          const last = nPts[nPts.length - 1];
          if (!last || Math.hypot(p1.x - last.x, p1.z - last.z) > 0.1) nPts.push(p1);
        }
        const lSeg = profSegs[profSegs.length - 1];
        const lPt = lSeg.type === 'line' ? lSeg.p2 : { x: lSeg.cx + Math.sin(lSeg.endAngle)*lSeg.r, z: lSeg.cz + Math.cos(lSeg.endAngle)*lSeg.r };
        if (!nPts.length || Math.hypot(lPt.x - nPts[nPts.length-1].x, lPt.z - nPts[nPts.length-1].z) > 0.1) nPts.push(lPt);
        nPts.forEach((p, i) => {
          const pt = toScreen(p.x, p.z);
          ctx.fillStyle = C.contour;
          ctx.beginPath(); ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2); ctx.fill();
          ctx.fillText(`${i + 1}`, pt.x + 7, pt.y - 7);
        });
      }
    }

    // Z-limity (čelisti, koník, rozsah obrábění)
    if (S.showZLimits && S.showZLimits !== 'off') {
      const drawZLine = (zVal, color, label, isRange) => {
        if (zVal === null || zVal === undefined || isNaN(zVal)) return;
        // Vodorovná (karusel) nebo svislá (soustruh) čára na pozici Z
        const isKarusel = prms.machineStructure === 'carousel';
        ctx.strokeStyle = color;
        ctx.lineWidth = (S.draggedLimit && S.zLimits[S.draggedLimit] === zVal) ? 2.5 : 1.8;
        ctx.setLineDash(isRange ? [10, 4] : [3, 5]);
        ctx.beginPath();
        if (isKarusel) {
          const py = toScreen(0, zVal).y;
          ctx.moveTo(0, py); ctx.lineTo(w, py);
        } else {
          const px = toScreen(0, zVal).x;
          ctx.moveTo(px, 0); ctx.lineTo(px, h);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        // Popisek
        ctx.fillStyle = color;
        ctx.font = 'bold 11px sans-serif';
        if (isKarusel) {
          const py = toScreen(0, zVal).y;
          ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
          ctx.fillText(`${label} Z=${zVal}`, 6, py - 3);
        } else {
          const px = toScreen(0, zVal).x;
          ctx.save();
          ctx.translate(px - 4, 8);
          ctx.rotate(-Math.PI / 2);
          ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
          ctx.fillText(`${label} Z=${zVal}`, 0, 0);
          ctx.restore();
        }
      };
      // Zobrazí jen čáry jejichž checkbox je zaškrtnutý v parametrech
      if (S.zLimits.chuckActive)  drawZLine(S.zLimits.chuck, '#f38ba8', '⛔ Čelisti', false);
      if (S.zLimits.tailActive)   drawZLine(S.zLimits.tail,  '#f38ba8', '⛔ Koník',   false);
      if (S.zLimits.rangeActive) {
        drawZLine(S.zLimits.rangeStart, '#f9e2af', '◀ Start rozsahu', true);
        drawZLine(S.zLimits.rangeEnd,   '#f9e2af', 'Konec rozsahu ▶', true);
      }
    }

    // X-rozsah obrábění (horizontální čáry pro poloměr)
    if (S.showZLimits && S.showZLimits !== 'off') {
      const drawXLine = (xVal, color, label) => {
        if (xVal === null || xVal === undefined || isNaN(xVal)) return;
        const isKarusel = prms.machineStructure === 'carousel';
        ctx.strokeStyle = color;
        ctx.lineWidth = (S.draggedLimit && S.xLimits[S.draggedLimit] === xVal) ? 2.5 : 1.8;
        ctx.setLineDash([10, 4]);
        ctx.beginPath();
        if (isKarusel) {
          const px = toScreen(xVal, 0).x;
          ctx.moveTo(px, 0); ctx.lineTo(px, h);
        } else {
          const py = toScreen(xVal, 0).y;
          ctx.moveTo(0, py); ctx.lineTo(w, py);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = 'bold 11px sans-serif';
        if (isKarusel) {
          const px = toScreen(xVal, 0).x;
          ctx.save();
          ctx.translate(px - 4, 8);
          ctx.rotate(-Math.PI / 2);
          ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
          ctx.fillText(`${label} X=${xVal}`, 0, 0);
          ctx.restore();
        } else {
          const py = toScreen(xVal, 0).y;
          ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
          ctx.fillText(`${label} X=${xVal}`, w - 6, py - 3);
        }
      };
      if (S.xLimits.active) {
        drawXLine(S.xLimits.rangeXMin, '#a6e3a1', '▼ X min');
        drawXLine(S.xLimits.rangeXMax, '#a6e3a1', 'X max ▲');
      }
    }

    // Selection rectangle
    if (S.rectSelecting && S.rectStart && S.rectEnd) {
      const rx = Math.min(S.rectStart.x, S.rectEnd.x);
      const ry = Math.min(S.rectStart.y, S.rectEnd.y);
      const rw = Math.abs(S.rectEnd.x - S.rectStart.x);
      const rh = Math.abs(S.rectEnd.y - S.rectStart.y);
      ctx.fillStyle = 'rgba(137,180,250,0.15)';
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = '#89b4fa'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.setLineDash([]);
    }

    // Snap guide lines
    if (S.snapLines.length > 0) {
      ctx.save();
      ctx.strokeStyle = '#f9e2af'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      S.snapLines.forEach(snap => {
        ctx.beginPath();
        if (snap.type === 'x') {
          const p1 = toScreen(snap.val, snap.from - 5);
          const p2 = toScreen(snap.val, snap.to + 5);
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        } else {
          const p1 = toScreen(snap.from - 5, snap.val);
          const p2 = toScreen(snap.to + 5, snap.val);
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        }
        ctx.stroke();
      });
      ctx.restore();
    }

    // Rect select mode indicator
    if (S.rectSelecting && !S.rectStart) {
      ctx.fillStyle = 'rgba(137,180,250,0.8)'; ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⬚ Tažením vyberte body', w / 2, 20);
    }

    // Úhlový snap – vodicí čára (vodorovně/kolmo) od ref bodu k bodu.
    if (S.snapEnabled && S._angleSnapLine && !S.simRunning) {
      const a = toScreen(S._angleSnapLine.from.x, S._angleSnapLine.from.z);
      const b = toScreen(S._angleSnapLine.to.x, S._angleSnapLine.to.z);
      ctx.strokeStyle = 'rgba(249,226,175,0.7)'; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
    }

    // SNAP indikátor (navrch): čtvereček = bod, kolečko = hrana, + souřadnice.
    if (S.snapEnabled && S._snap && !S.simRunning) {
      const sp = toScreen(S._snap.x, S._snap.z);
      if (S._snap.type === 'point') {
        ctx.strokeStyle = '#f9e2af'; ctx.lineWidth = 2;
        ctx.strokeRect(sp.x - 6, sp.y - 6, 12, 12);
        ctx.font = '11px Consolas'; ctx.fillStyle = '#f9e2af';
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText('SNAP', sp.x + 9, sp.y - 3);
      } else {
        ctx.strokeStyle = '#94e2d5'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sp.x, sp.y, 5, 0, Math.PI * 2); ctx.stroke();
      }
      const xDisp = prms.mode === 'DIAMON' ? S._snap.x * 2 : S._snap.x;
      const label = `X: ${xDisp.toFixed(3)}  Z: ${S._snap.z.toFixed(3)}`;
      ctx.font = '11px Consolas';
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(30,30,46,0.9)';
      ctx.fillRect(sp.x - tw / 2 - 5, sp.y - 36, tw + 10, 17);
      ctx.fillStyle = '#cdd6f4';
      ctx.fillText(label, sp.x, sp.y - 24);
      ctx.textAlign = 'left';
    }

    // Označený bod/uzel pro dvoukrokové uchopení (mobil) – výrazný kroužek.
    if (S._camMarked && !S.simRunning) {
      const mp = toScreen(S._camMarked.x, S._camMarked.z);
      ctx.strokeStyle = '#f5c2e7'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mp.x, mp.y, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(mp.x, mp.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#f5c2e7'; ctx.fill();
    }
  }

  // ── fitView ──
  function fitView() {
    const points = resolvePointsToAbsolute(S.contourPoints);
    if (points.length === 0) return;
    const prms = S.params;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    points.forEach(p => {
      const x = prms.mode === 'DIAMON' ? p.xAbs / 2 : p.xAbs;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (p.zAbs < minZ) minZ = p.zAbs; if (p.zAbs > maxZ) maxZ = p.zAbs;
    });
    // Include stock bounds
    if (prms.stockMode === 'cylinder') {
      const sRad = (parseFloat(prms.stockDiameter) || 0) / 2;
      const sLen = parseFloat(prms.stockLength) || 0;
      const sFace = parseFloat(prms.stockFace) || 0;
      if (sRad > maxX) maxX = sRad;
      if (-sLen < minZ) minZ = -sLen;
      if (sFace > maxZ) maxZ = sFace;
    } else {
      const stockPts = resolvePointsToAbsolute(S.stockPoints);
      stockPts.forEach(p => {
        const x = prms.mode === 'DIAMON' ? p.xAbs / 2 : p.xAbs;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (p.zAbs < minZ) minZ = p.zAbs; if (p.zAbs > maxZ) maxZ = p.zAbs;
      });
    }
    const pad = 20;
    const isCar = prms.machineStructure === 'carousel';
    const visW = isCar ? (maxX - minX) : (maxZ - minZ);
    const visH = isCar ? (maxZ - minZ) : (maxX - minX);
    const ww = visW + pad * 2, hh = visH + pad * 2;
    if (ww <= 0 || hh <= 0) return;
    const cW = canvasWrap.clientWidth, cH = canvasWrap.clientHeight;
    if (cW === 0 || cH === 0) return;
    let ns = Math.min(cW / ww, cH / hh) * 0.8;
    if (ns > 10) ns = 10; if (ns < 0.1) ns = 0.1;
    const midZ = (minZ + maxZ) / 2, midX = (minX + maxX) / 2;
    const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
    if (isCar) S.view = { scale: ns, panX: cW / 2 - hS * midX * ns, panY: cH / 2 - vS * midZ * ns };
    else S.view = { scale: ns, panX: cW / 2 - hS * midZ * ns, panY: cH / 2 - vS * midX * ns };
    draw();
  }

  // ── getPointAt (hit testing) ──
  function getStockHandleAt(clientX, clientY) {
    if (S.simRunning || S.params.stockMode !== 'cylinder') return null;
    const calc = S._cachedCalc; if (!calc) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    const prms = S.params;
    const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
    const toScreen = (x, z) => {
      if (prms.machineStructure === 'carousel') return { x: S.view.panX + hS * x * S.view.scale, y: S.view.panY + vS * z * S.view.scale };
      return { x: S.view.panX + hS * z * S.view.scale, y: S.view.panY + vS * x * S.view.scale };
    };
    const sRad = (parseFloat(prms.stockDiameter) || 0) / 2;
    const sLen = parseFloat(prms.stockLength) || 0;
    const sFace = parseFloat(prms.stockFace) || 0;
    const handles = [
      { x: sRad, z: sFace },
      { x: sRad, z: -sLen },
    ];
    let closest = null, minD = Infinity;
    for (let i = 0; i < handles.length; i++) {
      const pt = toScreen(handles[i].x, handles[i].z);
      const d = Math.hypot(pt.x - mx, pt.y - my);
      if (d < 18 && d < minD) { minD = d; closest = i; }
    }
    return closest;
  }

  function getPointAt(clientX, clientY) {
    if (S.simRunning) return null;
    const calc = S._cachedCalc; if (!calc) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    const prms = S.params;
    const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
    const toScreen = (x, z) => {
      if (prms.machineStructure === 'carousel') return { x: S.view.panX + hS * x * S.view.scale, y: S.view.panY + vS * z * S.view.scale };
      return { x: S.view.panX + hS * z * S.view.scale, y: S.view.panY + vS * x * S.view.scale };
    };
    const pts = S.editMode === 'contour' ? calc.worldPoints : calc.stockWorldPoints;
    if (!pts) return null;
    let closest = null, minD = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const pt = toScreen(pts[i].xReal, pts[i].zReal);
      const d = Math.hypot(pt.x - mx, pt.y - my);
      if (d < 15 && d < minD) { minD = d; closest = i; }
    }
    return closest;
  }

  // ── Úprava drah přímo v G-kódu (tažení v canvasu) ──
  // Společná projekce svět→obrazovka (shodná s draw()).
  function _gToScreen(x, z) {
    const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
    if (S.params.machineStructure === 'carousel')
      return { x: S.view.panX + hS * x * S.view.scale, y: S.view.panY + vS * z * S.view.scale };
    return { x: S.view.panX + hS * z * S.view.scale, y: S.view.panY + vS * x * S.view.scale };
  }
  function _gToWorld(sx, sy) {
    const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
    if (S.params.machineStructure === 'carousel')
      return { x: hS * (sx - S.view.panX) / S.view.scale, z: vS * (sy - S.view.panY) / S.view.scale };
    return { z: hS * (sx - S.view.panX) / S.view.scale, x: vS * (sy - S.view.panY) / S.view.scale };
  }

  // ── SNAP (jako v CAD) ── přichytávání k bodům a hranám kontury/polotovaru.
  function _nearestOnCamLine(wx, wz, x1, z1, x2, z2) {
    const dx = x2 - x1, dz = z2 - z1;
    const L2 = dx * dx + dz * dz;
    let t = L2 ? ((wx - x1) * dx + (wz - z1) * dz) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    return { x: x1 + t * dx, z: z1 + t * dz };
  }
  // Vrátí {x,z,type:'point'|'edge'} nebo null. Body: počátek, vrcholy kontury
  // i polotovaru, středy oblouků, středy úseček (přednost). Hrany: nejbližší
  // bod na úsečce/oblouku.
  function camSnap(clientX, clientY) {
    if (!S.snapEnabled || S.simRunning) return null;
    const calc = S._cachedCalc; if (!calc) return null;
    const rect = canvas.getBoundingClientRect();
    const w = _gToWorld(clientX - rect.left, clientY - rect.top);
    const wx = w.x, wz = w.z;
    const ptThr = 18 / S.view.scale;
    const edgeThr = 10 / S.view.scale;
    let best = null, bestD = Infinity;
    const tryPt = (x, z) => {
      if (x == null || z == null) return;
      const d = Math.hypot(x - wx, z - wz);
      if (d < ptThr && d < bestD) { bestD = d; best = { x, z, type: 'point' }; }
    };
    tryPt(0, 0);
    (calc.worldPoints || []).forEach(p => tryPt(p.xReal, p.zReal));
    (calc.stockWorldPoints || []).forEach(p => tryPt(p.xReal, p.zReal));
    // Uzly drah (koncové body pohybů G-kódu) – jen v režimu úpravy drah,
    // kdy jsou viditelné a tažitelné.
    if (S.gcodeEditEnabled) getGNodes().forEach(n => tryPt(n.x, n.z));
    // Konstrukční / pomocné čáry + jejich offsetové čáry (dráha středu plátku)
    // – koncové body (tečné body, průsečíky) jsou snapovatelné jako úsečky.
    const guides = getAllGuideLines().map(g => ({ type: 'line', p1: { x: g.x1, z: g.z1 }, p2: { x: g.x2, z: g.z2 } }));
    const guideOffsets = getGuideOffsetLines();
    const allGuideSegs = [...guides, ...guideOffsets];
    for (const g of allGuideSegs) { tryPt(g.p1.x, g.p1.z); tryPt(g.p2.x, g.p2.z); }
    // Středy oblouků / úseček – kontura, polotovar, konstrukční + offsetové čáry.
    const baseSegs = [...(calc.contourSegments || []), ...(calc.stockPathSegments || []), ...allGuideSegs].filter(s => s && !s.isDegenerate);
    for (const s of baseSegs) {
      if (s.type === 'arc') tryPt(s.cx, s.cz);
      else if (s.p1 && s.p2) tryPt((s.p1.x + s.p2.x) / 2, (s.p1.z + s.p2.z) / 2);
    }
    // Průsečíky čar (kontura × offset × konstrukční čára × offset konstrukční
    // čáry) — snap na bod, kde se dvě čáry kříží, ne jen na konce/středy.
    const interSegs = [
      ...baseSegs,
      ...(calc.offsetPath || []),
      ...(calc.finishOffsetPath || []),
      ...(calc.finishUnreachablePath || [])
    ].filter(s => s && !s.isDegenerate);
    for (let ii = 0; ii < interSegs.length; ii++)
      for (let jj = ii + 1; jj < interSegs.length; jj++)
        for (const q of segPairIntersections(interSegs[ii], interSegs[jj])) tryPt(q.x, q.z);
    if (best) return best;   // body mají přednost před hranami
    // Hrany: kontura + polotovar + konstrukční čáry + offsetové dráhy.
    const segs = [...baseSegs, ...(calc.offsetPath || []), ...(calc.finishOffsetPath || []), ...(calc.finishUnreachablePath || [])].filter(s => s && !s.isDegenerate);
    for (const s of segs) {
      let px, pz, dist;
      if (s.type === 'line') {
        if (!s.p1 || !s.p2) continue;
        const np = _nearestOnCamLine(wx, wz, s.p1.x, s.p1.z, s.p2.x, s.p2.z);
        px = np.x; pz = np.z; dist = Math.hypot(wx - px, wz - pz);
      } else if (s.type === 'arc') {
        const dx = wx - s.cx, dz = wz - s.cz;
        const d = Math.hypot(dx, dz);
        if (d < 1e-9) continue;
        const a = Math.atan2(dx, dz);   // CAM: x = cx+sin(a)·r, z = cz+cos(a)·r
        if (isAngleBetween(a, s.startAngle, s.endAngle, s.dir === 'G2')) {
          px = s.cx + Math.sin(a) * s.r; pz = s.cz + Math.cos(a) * s.r; dist = Math.abs(d - s.r);
        } else {
          const e1 = { x: s.cx + Math.sin(s.startAngle) * s.r, z: s.cz + Math.cos(s.startAngle) * s.r };
          const e2 = { x: s.cx + Math.sin(s.endAngle) * s.r, z: s.cz + Math.cos(s.endAngle) * s.r };
          const d1 = Math.hypot(wx - e1.x, wz - e1.z), d2 = Math.hypot(wx - e2.x, wz - e2.z);
          if (d1 < d2) { px = e1.x; pz = e1.z; dist = d1; } else { px = e2.x; pz = e2.z; dist = d2; }
        }
      } else continue;
      if (dist < edgeThr && dist < bestD) { bestD = dist; best = { x: px, z: pz, type: 'edge' }; }
    }
    return best;
  }
  // Úhlový snap (jako v CAD): přichytí směr ref→bod na násobek 90°
  // (vodorovně/kolmo) s tolerancí ±1°, projekcí na úhlovou přímku.
  const ANGLE_SNAP_TOL = 1 * Math.PI / 180;
  function applyCamAngleSnap(p, ref) {
    if (!ref) return p;
    const dx = p.x - ref.x, dz = p.z - ref.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-9) return p;
    const angle = Math.atan2(dx, dz);            // x=sin, z=cos
    const step = Math.PI / 2;                    // 90° = vodorovnost/kolmost
    const snapped = Math.round(angle / step) * step;
    if (Math.abs(angle - snapped) > ANGLE_SNAP_TOL) return p;
    const dirx = Math.sin(snapped), dirz = Math.cos(snapped);
    const proj = dx * dirx + dz * dirz;
    return { x: ref.x + proj * dirx, z: ref.z + proj * dirz, _angle: true };
  }
  // Snapnutá světová pozice (uloží i indikátor S._snap), jinak raw.
  // refPoint (volitelný) zapne úhlový snap, když není snap k bodu/hraně.
  function snapWorld(clientX, clientY, refPoint) {
    const rect = canvas.getBoundingClientRect();
    const raw = _gToWorld(clientX - rect.left, clientY - rect.top);
    const snap = camSnap(clientX, clientY);
    if (snap) { S._snap = snap; S._angleSnapLine = null; return { x: snap.x, z: snap.z }; }
    S._snap = null;
    if (S.snapEnabled && refPoint) {
      const a = applyCamAngleSnap(raw, refPoint);
      if (a._angle) { S._angleSnapLine = { from: refPoint, to: { x: a.x, z: a.z } }; return { x: a.x, z: a.z }; }
    }
    S._angleSnapLine = null;
    return raw;
  }
  // Uzly = koncové body pohybů (poslední bod skupiny se stejným
  // originalLineIdx; u oblouku tedy koncový bod oblouku). Tažením uzlu se
  // přepíšou souřadnice X/Z příslušného řádku G-kódu.
  function getGNodes() {
    const calc = S._cachedCalc;
    if (!calc || !calc.simPath) return [];
    const sp = calc.simPath;
    const nodes = [];
    for (let i = 0; i < sp.length; i++) {
      const li = sp[i].originalLineIdx;
      if (li == null) continue;
      if (i + 1 >= sp.length || sp[i + 1].originalLineIdx !== li)
        nodes.push({ simIdx: i, lineIdx: li, x: sp[i].x, z: sp[i].z, type: sp[i].type });
    }
    return nodes;
  }
  function getGNodeAt(clientX, clientY, force = false) {
    if ((!S.gcodeEditEnabled && !force) || S.simRunning) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    const nodes = getGNodes();
    let best = null, minD = Infinity;
    for (const n of nodes) {
      const pt = _gToScreen(n.x, n.z);
      const d = Math.hypot(pt.x - mx, pt.y - my);
      if (d < 10 && d < minD) { minD = d; best = n; }
    }
    return best;
  }
  // Úsečkové pohyby (G0/G1) jako celé úsečky — pro tažení celé dráhy.
  function getGSegmentAt(clientX, clientY, force = false) {
    if ((!S.gcodeEditEnabled && !force) || S.simRunning) return null;
    const calc = S._cachedCalc;
    if (!calc || !calc.simPath) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    const sp = calc.simPath;
    const distSeg = (px, py, ax, ay, bx, by) => {
      const dx = bx - ax, dy = by - ay;
      const L2 = dx * dx + dy * dy;
      let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    };
    let best = null, minD = Infinity;
    for (let i = 1; i < sp.length; i++) {
      const li = sp[i].originalLineIdx;
      if (li == null) continue;
      if (sp[i].type !== 'G0' && sp[i].type !== 'G1') continue;   // jen úsečky
      if (sp[i - 1].originalLineIdx === li) continue;             // ne vnitřek oblouku
      const a = _gToScreen(sp[i - 1].x, sp[i - 1].z);
      const b = _gToScreen(sp[i].x, sp[i].z);
      const d = distSeg(mx, my, a.x, a.y, b.x, b.y);
      // u koncových bodů má přednost uzel — drž se dál od konců
      const dA = Math.hypot(a.x - mx, a.y - my), dB = Math.hypot(b.x - mx, b.y - my);
      if (d < 6 && d < minD && dA > 9 && dB > 9) {
        minD = d;
        best = { simIdx: i, lineIdx: li, type: sp[i].type, startIdx: sp[i - 1].originalLineIdx,
                 p1: { x: sp[i - 1].x, z: sp[i - 1].z }, p2: { x: sp[i].x, z: sp[i].z } };
      }
    }
    return best;
  }
  // Přepíše souřadnici (X/U nebo Z/W) v řádku G-kódu na novou hodnotu;
  // pokud na řádku není, vloží ji (před případný komentář).
  function setGLineCoord(line, letters, val) {
    const v = (Math.round(val * 1000) / 1000).toFixed(3);
    const re = new RegExp(`([${letters}])(-?\\d*\\.?\\d+)`);
    if (re.test(line)) return line.replace(re, `${letters[0]}${v}`);
    const word = `${letters[0]}${v}`;
    // Vlož za G-slovo (G0/G1/...) – přirozené pořadí G X Z F.
    const gm = line.match(/\bG0?[0-3]\b/);
    if (gm) {
      const at = gm.index + gm[0].length;
      return line.slice(0, at) + ` ${word}` + line.slice(at);
    }
    const ci = line.search(/[;(]/);
    if (ci >= 0) return line.slice(0, ci).replace(/\s+$/, '') + ` ${word} ` + line.slice(ci);
    return line.replace(/\s+$/, '') + ` ${word}`;
  }
  // Zapíše nové souřadnice (svět: x=poloměr, z) na jeden či více řádků
  // a přepočítá + překreslí. edits = [{lineIdx, wx, wz}].
  function writeGLines(edits) {
    const lines = S.manualGCode.split('\n');
    for (const ed of edits) {
      if (ed.lineIdx == null || ed.lineIdx < 0 || ed.lineIdx >= lines.length) continue;
      let line = lines[ed.lineIdx];
      if (ed.wx != null) line = setGLineCoord(line, 'XU', S.params.mode === 'DIAMON' ? ed.wx * 2 : ed.wx);
      if (ed.wz != null) line = setGLineCoord(line, 'ZW', ed.wz);
      lines[ed.lineIdx] = line;
    }
    S.manualGCode = lines.join('\n');
    // Během tažení uzlu/úsečky (Dráhy) sloučit přepočet+překreslení do jednoho
    // snímku a NEpřekreslovat G-kód panel (přestavba DOM podkladu + zvýraznění
    // je drahá a běžela by na každý snímek) — panel se obnoví až po puštění
    // (handleMouseUp). Mimo tažení (klik Prodl/Ořez) provést rovnou.
    const commit = () => {
      S._cachedCalc = calculate();
      S.generatedCode = generateGCode(S._cachedCalc);
      if (!S.isDragging) renderCodeArea();   // renderCodeArea volá i backdrop+highlight
      draw();
    };
    if (S.isDragging) scheduleFrame(commit); else commit();
  }
  function writeGLine(lineIdx, wx, wz) { writeGLines([{ lineIdx, wx, wz }]); }

  // Smaže pohyb (řádek) z G-kódu a přepočítá.
  function deleteGLine(lineIdx) {
    const lines = S.manualGCode.split('\n');
    if (lineIdx == null || lineIdx < 0 || lineIdx >= lines.length) return;
    lines.splice(lineIdx, 1);
    S.manualGCode = lines.join('\n');
    S._cachedCalc = calculate();
    S.generatedCode = generateGCode(S._cachedCalc);
    renderCodeArea(); draw(); saveState();
  }
  // Vloží nový pohyb (řádek) ZA daný řádek. move = {type:'G1', x, z, cr}.
  // x,z jsou ve světě (x=poloměr); CR jen pro G2/G3.
  function insertGMove(afterLineIdx, move) {
    const lines = S.manualGCode.split('\n');
    if (afterLineIdx == null || afterLineIdx < 0) return;
    const xOut = S.params.mode === 'DIAMON' ? move.x * 2 : move.x;
    const fmt = v => (Math.round(v * 1000) / 1000).toFixed(3);
    // N-číslo mezi sousedními (cosmetika) — když nejde, bez N.
    const nOf = s => { const m = (s || '').match(/^\s*N(\d+)/); return m ? parseInt(m[1], 10) : null; };
    const nHere = nOf(lines[afterLineIdx]);
    const nNext = nOf(lines[afterLineIdx + 1]);
    let nStr = '';
    if (nHere != null) {
      const nNew = (nNext != null && nNext - nHere > 1) ? Math.floor((nHere + nNext) / 2) : nHere + 1;
      nStr = `N${nNew} `;
    }
    let line = `${nStr}${move.type} X${fmt(xOut)} Z${fmt(move.z)}`;
    if ((move.type === 'G2' || move.type === 'G3') && move.cr) line += ` CR=${fmt(move.cr)}`;
    if (move.type !== 'G0') line += ` F${S.params.feed}`;   // řezné pohyby = posuv
    lines.splice(afterLineIdx + 1, 0, line);
    S.manualGCode = lines.join('\n');
    S._cachedCalc = calculate();
    S.generatedCode = generateGCode(S._cachedCalc);
    S._gcodeFocusLine = afterLineIdx + 1;
    renderCodeArea(); draw(); saveState();
  }

  // Najde nejbližší bod kontury NEBO polotovaru bez ohledu na aktuální
  // editMode — používá se pro "+"/"−" (vložit/odebrat bod), aby šlo
  // navázat kresbu i z bodu polotovaru, když je aktivní editor kontury.
  function getAnyPointAt(clientX, clientY) {
    if (S.simRunning) return null;
    const calc = S._cachedCalc; if (!calc) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    const prms = S.params;
    const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
    const toScreen = (x, z) => {
      if (prms.machineStructure === 'carousel') return { x: S.view.panX + hS * x * S.view.scale, y: S.view.panY + vS * z * S.view.scale };
      return { x: S.view.panX + hS * z * S.view.scale, y: S.view.panY + vS * x * S.view.scale };
    };
    let closest = null, minD = Infinity;
    (calc.worldPoints || []).forEach((p, i) => {
      const pt = toScreen(p.xReal, p.zReal);
      const d = Math.hypot(pt.x - mx, pt.y - my);
      if (d < 15 && d < minD) { minD = d; closest = { idx: i, isStock: false }; }
    });
    if (prms.stockMode !== 'cylinder') {
      (calc.stockWorldPoints || []).forEach((p, i) => {
        const pt = toScreen(p.xReal, p.zReal);
        const d = Math.hypot(pt.x - mx, pt.y - my);
        if (d < 15 && d < minD) { minD = d; closest = { idx: i, isStock: true }; }
      });
    }
    return closest;
  }

  // Hit-test na úchopové body upichnutí (Dojezd X / Start X) na svislé úsečce.
  // Vrátí 'dojezd' | 'start' | null. Aktivní jen v režimu ◆ Kontura.
  function getPartOffHandleAt(clientX, clientY) {
    if (S.simRunning) return null;
    const prms = S.params;
    if (prms.partOffZ == null || !isFinite(parseFloat(prms.partOffZ))) return null;
    const calc = S._cachedCalc; if (!calc) return null;
    const g = partOffGeom(prms, calc);
    if (!g.canCut) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
    const toScreen = (x, z) => (prms.machineStructure === 'carousel')
      ? { x: S.view.panX + hS * x * S.view.scale, y: S.view.panY + vS * z * S.view.scale }
      : { x: S.view.panX + hS * z * S.view.scale, y: S.view.panY + vS * x * S.view.scale };
    let closest = null, minD = Infinity;
    for (const hnd of [{ w: 'dojezd', x: g.xBottomEdge }, { w: 'start', x: g.startEdgeX }]) {
      const pt = toScreen(hnd.x, g.pz);
      const d = Math.hypot(pt.x - mx, pt.y - my);
      if (d < 15 && d < minD) { minD = d; closest = hnd.w; }
    }
    return closest;
  }

  // Radiální (X, v rádiusu) souřadnice pod kurzorem — pro tažení úchopů upichnutí.
  function _partOffRadiusFromClient(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
    return (S.params.machineStructure === 'carousel')
      ? hS * ((clientX - rect.left) - S.view.panX) / S.view.scale
      : vS * ((clientY - rect.top) - S.view.panY) / S.view.scale;
  }

  // Nastaví Dojezd X / Start X z radiální polohy kurzoru (s clampem).
  function _applyPartOffHandle(which, radiusX) {
    const top = partOffGeom(S.params, S._cachedCalc || {}).xStockTop;
    let rx = Math.max(0, radiusX);
    if (which === 'dojezd') {
      const startV = parseFloat(S.params.partOffStartX);
      const upper = (isFinite(startV) && startV > 0) ? startV : top;
      rx = Math.min(rx, Math.max(0, upper - 0.01), top);
      S.params.allowanceX = Math.round(rx * 100) / 100;
    } else {   // start
      const lower = parseFloat(S.params.allowanceX) || 0;
      if (rx >= top - 0.01) S.params.partOffStartX = 0;         // u povrchu → neaktivní
      else S.params.partOffStartX = Math.round(Math.max(rx, lower + 0.01) * 100) / 100;
    }
  }

  // Hit-test na přímé segmenty (G0/G1) kontury nebo stock polyline.
  // Vrátí {idx1, idx2, isStock} nebo null. Ignoruje oblouky.
  function getContourSegmentAt(clientX, clientY) {
    if (!S.pointDragEnabled || S.simRunning) return null;
    const calc = S._cachedCalc; if (!calc) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
    const toScreen = (x, z) => {
      if (S.params.machineStructure === 'carousel') return { x: S.view.panX + hS * x * S.view.scale, y: S.view.panY + vS * z * S.view.scale };
      return { x: S.view.panX + hS * z * S.view.scale, y: S.view.panY + vS * x * S.view.scale };
    };
    const distToSeg = (px, py, ax, ay, bx, by) => {
      const dx = bx - ax, dy = by - ay;
      const L2 = dx * dx + dy * dy;
      let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    };
    let best = null, minD = Infinity;
    const scanPts = (pts, isStock) => {
      if (!pts || pts.length < 2) return;
      for (let i = 0; i < pts.length - 1; i++) {
        const p2 = pts[i + 1];
        if (p2.type === 'G2' || p2.type === 'G3') continue;
        const a = toScreen(pts[i].xReal, pts[i].zReal);
        const b = toScreen(p2.xReal, p2.zReal);
        const d = distToSeg(mx, my, a.x, a.y, b.x, b.y);
        const dA = Math.hypot(a.x - mx, a.y - my), dB = Math.hypot(b.x - mx, b.y - my);
        if (d < 8 && d < minD && dA > 12 && dB > 12) {
          minD = d; best = { idx1: i, idx2: i + 1, isStock };
        }
      }
    };
    scanPts(calc.worldPoints, false);
    if (S.params.stockMode !== 'cylinder') scanPts(calc.stockWorldPoints, true);
    return best;
  }

  // Převod kliknutí (client souřadnice) na world souřadnice (X = rádius).
  function clientToWorldCam(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left, sy = clientY - rect.top;
    const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
    if (S.params.machineStructure === 'carousel') {
      return { wx: hS * (sx - S.view.panX) / S.view.scale, wz: vS * (sy - S.view.panY) / S.view.scale };
    }
    return { wx: vS * (sy - S.view.panY) / S.view.scale, wz: hS * (sx - S.view.panX) / S.view.scale };
  }

  // Najde nejbližší obloukový segment (G2/G3) kontury nebo polotovaru pod
  // kurzorem — pro "+" mód (tečná úsečka pod úhlem z oblouku, CAM obdoba
  // CAD nástroje „Úhel"). Vrací index KONCOVÉHO bodu segmentu.
  function getArcSegmentAt(clientX, clientY) {
    if (S.simRunning) return null;
    const calc = S._cachedCalc; if (!calc) return null;
    const { wx, wz } = clientToWorldCam(clientX, clientY);
    const tol = 10 / S.view.scale;
    let best = null, bestD = Infinity;
    const scan = (pts, isStock) => {
      if (!pts) return;
      for (let i = 1; i < pts.length; i++) {
        const p2 = pts[i];
        if (p2.type !== 'G2' && p2.type !== 'G3') continue;
        const p1 = pts[i - 1];
        const arc = getArcParams({ x: p1.xReal, z: p1.zReal }, { x: p2.xReal, z: p2.zReal }, p2.rVal, p2.type);
        if (arc.error) continue;
        const d = Math.abs(Math.hypot(wx - arc.cx, wz - arc.cz) - arc.r);
        if (d > tol || d >= bestD) continue;
        const ang = Math.atan2(wx - arc.cx, wz - arc.cz);
        const sA = Math.atan2(p1.xReal - arc.cx, p1.zReal - arc.cz);
        const eA = Math.atan2(p2.xReal - arc.cx, p2.zReal - arc.cz);
        if (!isAngleBetween(ang, sA, eA, p2.type === 'G2')) continue;
        bestD = d;
        best = { idx: i, isStock, wx, wz };
      }
    };
    scan(calc.worldPoints, false);
    if (S.params.stockMode !== 'cylinder') scan(calc.stockWorldPoints, true);
    return best;
  }

  // camRayIntersection() je nyní modulová funkce (viz výše u buildMachinableContour) —
  // uvnitř openCamSimulator se volá s S._cachedCalc jako posledním argumentem.

  // Všechny pomocné čáry: ruční (S.guideLines) + automatické mezní
  // čáry hran destičky z posledního výpočtu.
  function getAllGuideLines() {
    return [...(S.guideLines || []), ...((S._cachedCalc && S._cachedCalc.interferenceGuides) || [])];
  }

  // Offsetové (společné) čáry konstrukčních čar – posunuté o rádius plátku
  // na stranu vzduchu (+X); kam dojede STŘED plátku. Vrací snapovatelné
  // úsečky {type:'line', p1, p2} (prázdné, je-li rádius 0).
  function getGuideOffsetLines() {
    const prm = S.params || {};
    const tipROff = parseFloat(prm.toolRadius) || 0;
    if (tipROff <= 0) return [];
    // Dva offsety jako u kontury: dokončovací = jen R, hrubovací =
    // R + Přídavek X/Z + Přídavek na hotovo (po složkách normály).
    const aX = parseFloat(prm.allowanceX) || 0;
    const aZ = parseFloat(prm.allowanceZ) || 0;
    const fin = parseFloat(prm.finishAllowance) || 0;
    const hasRough = aX > 1e-9 || aZ > 1e-9 || fin > 1e-9;
    const out = [];
    for (const g of getAllGuideLines()) {
      // Po úsecích — lomené (via) čáry z hlídání držáku mají offset za segment.
      const pts = guidePolyPoints(g);
      for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k], b = pts[k + 1];
        let n = getNormal(a, b);
        if (n.x < 0 || (Math.abs(n.x) < 1e-9 && n.z < 0)) n = { x: -n.x, z: -n.z };
        out.push({ type: 'line', kind: 'finish',
          p1: { x: a.x + n.x * tipROff, z: a.z + n.z * tipROff },
          p2: { x: b.x + n.x * tipROff, z: b.z + n.z * tipROff } });
        if (hasRough) {
          const dxR = n.x * (tipROff + aX + fin), dzR = n.z * (tipROff + aZ + fin);
          out.push({ type: 'line', kind: 'rough',
            p1: { x: a.x + dxR, z: a.z + dzR },
            p2: { x: b.x + dxR, z: b.z + dzR } });
        }
      }
    }
    return out;
  }

  // Nejbližší průsečík paprsku (sx,sz)+t·(dirX,dirZ), t>0, s geometrií:
  // kontura + offset + dokončovací dráha + konstrukční (pomocné) čáry.
  // Pro prodloužení (paprsek vpřed) i oříznutí (paprsek vzad).
  function nearestPathHit(sx, sz, dirX, dirZ) {
    const calc = S._cachedCalc; if (!calc) return null;
    let best = null, bestT = Infinity;
    const A1 = { x: sx, z: sz };
    const far = { x: sx + dirX * 1e5, z: sz + dirZ * 1e5 };
    const consider = (px, pz) => {
      const t = (px - sx) * dirX + (pz - sz) * dirZ;     // vzdálenost podél paprsku
      if (t > 0.05 && t < bestT) { bestT = t; best = { x: px, z: pz }; }
    };
    const lineHit = (B1, B2) => {
      if (!B1 || !B2) return;
      const d = (A1.x - far.x) * (B1.z - B2.z) - (A1.z - far.z) * (B1.x - B2.x);
      if (Math.abs(d) < 1e-12) return;
      const u = ((A1.x - B1.x) * (A1.z - far.z) - (A1.z - B1.z) * (A1.x - far.x)) / d;
      if (u < -0.001 || u > 1.001) return;               // mimo cílovou úsečku
      const t = ((A1.x - B1.x) * (B1.z - B2.z) - (A1.z - B1.z) * (B1.x - B2.x)) / d;
      consider(A1.x + t * (far.x - A1.x), A1.z + t * (far.z - A1.z));
    };
    const arcHit = (seg) => {
      const hits = intersectLineCircle(A1, far, { x: seg.cx, z: seg.cz }, seg.r);
      if (!hits) return;
      for (const q of hits) {
        const ang = Math.atan2(q.x - seg.cx, q.z - seg.cz);
        if (isAngleBetween(ang, seg.startAngle, seg.endAngle, seg.dir === 'G2')) consider(q.x, q.z);
      }
    };
    const segs = [...(calc.contourSegments || []), ...(calc.offsetPath || []), ...(calc.finishOffsetPath || []), ...(calc.finishUnreachablePath || [])];
    for (const s of segs) {
      if (!s || s.isDegenerate) continue;
      if (s.type === 'line') lineHit(s.p1, s.p2);
      else if (s.type === 'arc') arcHit(s);
    }
    for (const g of getAllGuideLines()) {
      const pts = guidePolyPoints(g);
      for (let k = 0; k + 1 < pts.length; k++) lineHit(pts[k], pts[k + 1]);
    }
    return best;
  }

  // Prodloužení (sign=+1) / oříznutí (sign=−1) úsečkového pohybu (G0/G1):
  // z koncového bodu vyšle paprsek ve směru pohybu (vpřed/vzad) a posune
  // koncový bod na nejbližší průsečík → přepíše X/Z příslušného řádku.
  function extendTrimNode(node, sign) {
    const calc = S._cachedCalc; if (!calc || !calc.simPath) return;
    if (node.type !== 'G0' && node.type !== 'G1') { showToast('Prodloužit/oříznout jde jen u úseček (G0/G1)'); return; }
    if (node.simIdx <= 0) { showToast('Pohyb nemá počátek'); return; }
    const p1 = calc.simPath[node.simIdx - 1];
    let dx = node.x - p1.x, dz = node.z - p1.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) { showToast('Nulová délka pohybu'); return; }
    dx /= len; dz /= len;
    const hit = nearestPathHit(node.x, node.z, sign * dx, sign * dz);
    if (!hit) { showToast(sign > 0 ? 'Žádný průsečík pro prodloužení' : 'Žádný průsečík pro oříznutí'); return; }
    pushHistory();
    writeGLine(node.lineIdx, hit.x, hit.z);
    showToast(sign > 0 ? 'Dráha prodloužena k průsečíku ✓' : 'Dráha oříznuta k průsečíku ✓');
  }

  // Cílový bod pro prodloužení (sign=+1) / oříznutí (sign=−1) konce
  // konstrukční čáry g: konec endIdx se posouvá PO (nekonečné) čáře
  // k nejbližšímu průsečíku s geometrií — ven od kotvy (prodloužit) nebo
  // zpět ke kotvě (oříznout). Kotva = druhý konec. Vrací {x,z} nebo null.
  function guideExtendTrimTarget(g, endIdx, sign) {
    const ax = endIdx === 0 ? g.x2 : g.x1;
    const az = endIdx === 0 ? g.z2 : g.z1;
    const ex = endIdx === 0 ? g.x1 : g.x2;
    const ez = endIdx === 0 ? g.z1 : g.z2;
    let dx = ex - ax, dz = ez - az;
    const L = Math.hypot(dx, dz);
    if (L < 1e-6) return null;
    dx /= L; dz /= L;
    const tEnd = (ex - ax) * dx + (ez - az) * dz;   // = L, parametr aktuálního konce
    let best = null, bestGap = Infinity;
    for (const h of lineGeometryHits(ax, az, dx, dz)) {
      const t = (h.x - ax) * dx + (h.z - az) * dz;
      if (sign > 0) {
        if (t > tEnd + 0.05 && (t - tEnd) < bestGap) { bestGap = t - tEnd; best = h; }
      } else {
        if (t < tEnd - 0.05 && t > 0.05 && (tEnd - t) < bestGap) { bestGap = tEnd - t; best = h; }
      }
    }
    return best;
  }

  // Prodloužit/oříznout konstrukční čáru kliknutím (clientX/Y, sign ±1):
  //  • uživatelská čára (S.guideLines) — konec nebo tělo → posune se konec.
  //  • automatická mezní čára (interferenceGuides) — PŘEVEDE se na trvalou
  //    uživatelskou (nekonečnou, editovatelnou) čáru a hned se prodlouží.
  function extendTrimGuideClick(clientX, clientY, sign) {
    const gEnd = getUserGuideEndForAction(clientX, clientY);
    const auto = gEnd ? null : findAutoGuideForAction(clientX, clientY);
    if (!gEnd && !auto) { showToast('Klikněte na koncový bod nebo na konstrukční čáru'); return; }

    const baseG = gEnd ? S.guideLines[gEnd.guideIdx]
                       : { x1: auto.x1, z1: auto.z1, x2: auto.x2, z2: auto.z2 };
    const endIdx = gEnd ? gEnd.endIdx : auto.endIdx;
    const target = guideExtendTrimTarget(baseG, endIdx, sign);

    // Existující čára bez průsečíku → nic neměnit, jen informovat.
    if (!target && !auto) {
      showToast(sign > 0 ? 'Žádný průsečík pro prodloužení' : 'Žádný průsečík pro oříznutí');
      return;
    }

    pushHistory();
    let g = baseG;
    if (auto) {                       // převést mezní čáru na uživatelskou
      if (!S.guideLines) S.guideLines = [];
      // fromInsert: true → auto-smazání při změně parametrů destičky
      g = { x1: auto.x1, z1: auto.z1, x2: auto.x2, z2: auto.z2, fromInsert: true };
      S.guideLines.push(g);
    }
    if (target) {
      if (endIdx === 0) { g.x1 = target.x; g.z1 = target.z; }
      else { g.x2 = target.x; g.z2 = target.z; }
    }
    saveState(); renderTab(); updateUndoRedoBtns(); draw();
    if (target) showToast(sign > 0 ? 'Konstrukční čára prodloužena ✓' : 'Konstrukční čára oříznuta ✓');
    else showToast('Mezní čára převedena na konstrukční (nekonečnou) čáru ✓');
  }

  // Index RUČNÍ pomocné čáry (S.guideLines) pod kurzorem — klik na čáru
  // nebo její koncový bod. Automatické mezní čáry mazat nejdou (počítají
  // se znovu při každé změně), proto se tu neuvažují.
  function getUserGuideAt(clientX, clientY) {
    if (!S.guideLines || S.guideLines.length === 0) return null;
    const { wx, wz } = clientToWorldCam(clientX, clientY);
    const tol = 10 / S.view.scale;
    for (let i = S.guideLines.length - 1; i >= 0; i--) {
      const g = S.guideLines[i];
      const dx = g.x2 - g.x1, dz = g.z2 - g.z1;
      const len2 = dx * dx + dz * dz;
      let d;
      if (len2 < 1e-12) {
        d = Math.hypot(wx - g.x1, wz - g.z1);
      } else {
        let t = ((wx - g.x1) * dx + (wz - g.z1) * dz) / len2;
        t = Math.max(0, Math.min(1, t));
        d = Math.hypot(g.x1 + t * dx - wx, g.z1 + t * dz - wz);
      }
      if (d < tol) return i;
    }
    return null;
  }

  // Koncový bod pomocné čáry (tečný bod / průsečík) poblíž kurzoru.
  function getGuideEndpointAt(clientX, clientY) {
    const guides = getAllGuideLines();
    if (guides.length === 0) return null;
    const { wx, wz } = clientToWorldCam(clientX, clientY);
    const tol = 12 / S.view.scale;
    let best = null, bestD = tol;
    guides.forEach(g => {
      for (const q of [{ x: g.x1, z: g.z1 }, { x: g.x2, z: g.z2 }]) {
        const d = Math.hypot(q.x - wx, q.z - wz);
        if (d < bestD) { bestD = d; best = q; }
      }
    });
    return best;
  }

  // Uchopený koncový bod UŽIVATELSKÉ konstrukční čáry (S.guideLines) —
  // vrací {guideIdx, endIdx 0/1}. Auto čáry se needitují.
  function getUserGuideEndAt(clientX, clientY) {
    if (!S.guideLines || !S.guideLines.length) return null;
    const { wx, wz } = clientToWorldCam(clientX, clientY);
    const tol = 14 / S.view.scale;
    let best = null, bestD = tol;
    S.guideLines.forEach((g, gi) => {
      [[g.x1, g.z1, 0], [g.x2, g.z2, 1]].forEach(([x, z, ei]) => {
        const d = Math.hypot(x - wx, z - wz);
        if (d < bestD) { bestD = d; best = { guideIdx: gi, endIdx: ei }; }
      });
    });
    return best;
  }

  // Cíl pro Prodl/Ořez na konstrukční čáře: nejdřív přesný koncový bod,
  // jinak klik kamkoli na (nekonečné) tělo UŽIVATELSKÉ čáry → vybere se
  // konec bližší ke kliknutí. Vrací {guideIdx, endIdx} nebo null.
  function getUserGuideEndForAction(clientX, clientY) {
    const exact = getUserGuideEndAt(clientX, clientY);
    if (exact) return exact;
    if (!S.guideLines || !S.guideLines.length) return null;
    const { wx, wz } = clientToWorldCam(clientX, clientY);
    const tol = 10 / S.view.scale;
    let best = null, bestD = tol;
    S.guideLines.forEach((g, gi) => {
      let dx = g.x2 - g.x1, dz = g.z2 - g.z1;
      const L = Math.hypot(dx, dz);
      if (L < 1e-9) return;
      dx /= L; dz /= L;
      // kolmá vzdálenost ke (nekonečné) přímce
      const perp = Math.abs((wx - g.x1) * dz - (wz - g.z1) * dx);
      if (perp < bestD) {
        bestD = perp;
        const d1 = Math.hypot(g.x1 - wx, g.z1 - wz);
        const d2 = Math.hypot(g.x2 - wx, g.z2 - wz);
        best = { guideIdx: gi, endIdx: d1 <= d2 ? 0 : 1 };
      }
    });
    return best;
  }

  // Najde AUTOMATICKOU mezní čáru poblíž kliknutí (konec nebo tělo) pro
  // převod na uživatelskou. Vrací {x1,z1,x2,z2,endIdx} (endIdx = konec bližší
  // ke kliknutí) nebo null. Auto čáry jsou KONEČNÉ úsečky → projekce musí
  // ležet v rozsahu úsečky (s malou tolerancí).
  function findAutoGuideForAction(clientX, clientY) {
    const auto = (S._cachedCalc && S._cachedCalc.interferenceGuides) || [];
    if (!auto.length) return null;
    const { wx, wz } = clientToWorldCam(clientX, clientY);
    const tolPt = 14 / S.view.scale;
    const tolLine = 10 / S.view.scale;
    let best = null, bestScore = Infinity;
    for (const g of auto) {
      // Lomené čáry (hlídání držáku) nejde převést na jednu přímou
      // uživatelskou čáru — přeskočit (jejich přímá náhrada by lhala).
      if (g.via && g.via.length) continue;
      let dx = g.x2 - g.x1, dz = g.z2 - g.z1;
      const L = Math.hypot(dx, dz);
      if (L < 1e-9) continue;
      dx /= L; dz /= L;
      const d1 = Math.hypot(g.x1 - wx, g.z1 - wz);
      const d2 = Math.hypot(g.x2 - wx, g.z2 - wz);
      const endIdx = d1 <= d2 ? 0 : 1;
      const ptD = Math.min(d1, d2);
      if (ptD < tolPt && ptD < bestScore) {
        bestScore = ptD; best = { x1: g.x1, z1: g.z1, x2: g.x2, z2: g.z2, endIdx };
        continue;
      }
      const perp = Math.abs((wx - g.x1) * dz - (wz - g.z1) * dx);
      const t = (wx - g.x1) * dx + (wz - g.z1) * dz;
      if (perp < tolLine && t > -tolLine && t < L + tolLine && perp < bestScore) {
        bestScore = perp; best = { x1: g.x1, z1: g.z1, x2: g.x2, z2: g.z2, endIdx };
      }
    }
    return best;
  }
  // Všechny průsečíky NEKONEČNÉ přímky (ax,az)+t·(dx,dz) s geometrií
  // (kontura + offset + dokončení + konstrukční čáry) — obě strany.
  function lineGeometryHits(ax, az, dx, dz) {
    const calc = S._cachedCalc; if (!calc) return [];
    const out = [];
    const P = { x: ax - dx * 1e5, z: az - dz * 1e5 };
    const Q = { x: ax + dx * 1e5, z: az + dz * 1e5 };
    const lineHit = (B1, B2) => {
      if (!B1 || !B2) return;
      const d = (P.x - Q.x) * (B1.z - B2.z) - (P.z - Q.z) * (B1.x - B2.x);
      if (Math.abs(d) < 1e-12) return;
      const u = ((P.x - B1.x) * (P.z - Q.z) - (P.z - B1.z) * (P.x - Q.x)) / d;
      if (u < -0.001 || u > 1.001) return;
      const t = ((P.x - B1.x) * (B1.z - B2.z) - (P.z - B1.z) * (B1.x - B2.x)) / d;
      out.push({ x: P.x + t * (Q.x - P.x), z: P.z + t * (Q.z - P.z) });
    };
    const arcHit = (seg) => {
      const hits = intersectLineCircle(P, Q, { x: seg.cx, z: seg.cz }, seg.r);
      if (!hits) return;
      for (const q of hits) {
        const ang = Math.atan2(q.x - seg.cx, q.z - seg.cz);
        if (isAngleBetween(ang, seg.startAngle, seg.endAngle, seg.dir === 'G2')) out.push({ x: q.x, z: q.z });
      }
    };
    for (const s of [...(calc.contourSegments || []), ...(calc.offsetPath || []), ...(calc.finishOffsetPath || [])]) {
      if (!s || s.isDegenerate) continue;
      if (s.type === 'line') lineHit(s.p1, s.p2);
      else if (s.type === 'arc') arcHit(s);
    }
    for (const g of getAllGuideLines()) lineHit({ x: g.x1, z: g.z1 }, { x: g.x2, z: g.z2 });
    return out;
  }

  // Vloží bod kontury/polotovaru PŘESNĚ na (wx,wz) — pokud bod leží na
  // některém segmentu: úsečka se rozdělí na dvě, oblouk na dva oblouky
  // po téže kružnici (se správným znaménkem R pro >180° polovinu).
  // Používá se pro koncové body pomocných čar (tečné body, průsečíky).
  function insertPointOnSegmentAt(wx, wz) {
    const calc = S._cachedCalc; if (!calc) return false;
    const tol = 0.05; // bod musí ležet prakticky přesně na segmentu
    const isDia = S.params.mode === 'DIAMON';
    const roundC = (v) => Math.round(v * 1000) / 1000;
    const lists = [
      { pts: calc.worldPoints, raw: S.contourPoints },
      { pts: calc.stockWorldPoints, raw: S.stockPoints }
    ];
    for (const { pts, raw } of lists) {
      if (!pts || pts.length !== raw.length) continue;
      for (let i = 1; i < pts.length; i++) {
        const p2 = pts[i], p1 = pts[i - 1];
        if (p2.type === 'G1') {
          const dx = p2.xReal - p1.xReal, dz = p2.zReal - p1.zReal;
          const len2 = dx * dx + dz * dz;
          if (len2 < 1e-12) continue;
          const t = ((wx - p1.xReal) * dx + (wz - p1.zReal) * dz) / len2;
          if (t < 0.001 || t > 0.999) continue;
          if (Math.hypot(p1.xReal + t * dx - wx, p1.zReal + t * dz - wz) > tol) continue;
          pushHistory();
          raw.splice(i, 0, {
            id: Date.now(), type: 'G1', mode: 'ABS',
            x: roundC(isDia ? wx * 2 : wx), z: roundC(wz), r: 0
          });
          // Původní koncový bod nesmí změnit polohu — INC by se po vložení
          // počítal od nového bodu, proto ho přepíšeme na ABS.
          const endRaw = raw[i + 1];
          if (endRaw.mode === 'INC') { endRaw.mode = 'ABS'; endRaw.x = roundC(p2.xAbs); endRaw.z = roundC(p2.zAbs); }
          fullUpdate();
          return true;
        }
        if (p2.type === 'G2' || p2.type === 'G3') {
          const arc = getArcParams({ x: p1.xReal, z: p1.zReal }, { x: p2.xReal, z: p2.zReal }, p2.rVal, p2.type);
          if (arc.error) continue;
          if (Math.abs(Math.hypot(wx - arc.cx, wz - arc.cz) - arc.r) > tol) continue;
          const aP = Math.atan2(wx - arc.cx, wz - arc.cz);
          const sA = Math.atan2(p1.xReal - arc.cx, p1.zReal - arc.cz);
          const eA = Math.atan2(p2.xReal - arc.cx, p2.zReal - arc.cz);
          if (!isAngleBetween(aP, sA, eA, p2.type === 'G2')) continue;
          // Bod příliš blízko konci oblouku nemá smysl vkládat.
          const distToEnds = Math.min(Math.hypot(wx - p1.xReal, wz - p1.zReal), Math.hypot(wx - p2.xReal, wz - p2.zReal));
          if (distToEnds < 0.01) continue;
          // Úhlové rozpětí polovin podél směru oblouku → znaménko R
          // (záporné R = dlouhý oblouk >180°, viz getArcParams).
          const sweep = (from, to) => {
            let d = to - from;
            if (p2.type === 'G2') { while (d > 1e-12) d -= 2 * Math.PI; return -d; }
            while (d < -1e-12) d += 2 * Math.PI; return d;
          };
          const rMag = Math.abs(parseFloat(p2.rVal)) || arc.r;
          const r1 = sweep(sA, aP) > Math.PI ? -rMag : rMag;
          const r2 = sweep(aP, eA) > Math.PI ? -rMag : rMag;
          pushHistory();
          raw.splice(i, 0, {
            id: Date.now(), type: p2.type, mode: 'ABS',
            x: roundC(isDia ? wx * 2 : wx), z: roundC(wz), r: r1
          });
          const endRaw = raw[i + 1];
          endRaw.r = r2;
          if (endRaw.mode === 'INC') { endRaw.mode = 'ABS'; endRaw.x = roundC(p2.xAbs); endRaw.z = roundC(p2.zAbs); }
          fullUpdate();
          return true;
        }
      }
    }
    return false;
  }

  // Vrátí klíč Z-limity ('chuck' | 'tail' | 'rangeStart' | 'rangeEnd') pod kurzorem, jinak null.
  function getZLimitAt(clientX, clientY) {
    if (S.simRunning || !S.showZLimits || S.showZLimits === 'off') return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    const prms = S.params;
    const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
    const toScreen = (x, z) => {
      if (prms.machineStructure === 'carousel') return { x: S.view.panX + hS * x * S.view.scale, y: S.view.panY + vS * z * S.view.scale };
      return { x: S.view.panX + hS * z * S.view.scale, y: S.view.panY + vS * x * S.view.scale };
    };
    const isKarusel = prms.machineStructure === 'carousel';
    let bestKey = null, bestD = 8; // tolerance v pixelech
    // Drag-target jen pro zaškrtnuté (viditelné) čáry.
    const visibleKeys = [];
    if (S.zLimits.chuckActive)  visibleKeys.push('chuck');
    if (S.zLimits.tailActive)   visibleKeys.push('tail');
    if (S.zLimits.rangeActive)  visibleKeys.push('rangeStart', 'rangeEnd');
    for (const key of visibleKeys) {
      const z = S.zLimits[key];
      if (z === null || z === undefined || isNaN(z)) continue;
      const d = isKarusel ? Math.abs(toScreen(0, z).y - my) : Math.abs(toScreen(0, z).x - mx);
      if (d < bestD) { bestD = d; bestKey = key; }
    }
    return bestKey;
  }

  // Vrátí klíč X-limitu ('rangeXMin' | 'rangeXMax') pod kurzorem, jinak null.
  function getXLimitAt(clientX, clientY) {
    if (S.simRunning || !S.showZLimits || S.showZLimits === 'off') return null;
    if (!S.xLimits.active) return null; // čáry nejsou viditelné — nelze tahat
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    const prms = S.params;
    const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
    const toScreen = (x, z) => {
      if (prms.machineStructure === 'carousel') return { x: S.view.panX + hS * x * S.view.scale, y: S.view.panY + vS * z * S.view.scale };
      return { x: S.view.panX + hS * z * S.view.scale, y: S.view.panY + vS * x * S.view.scale };
    };
    const isKarusel = prms.machineStructure === 'carousel';
    let bestKey = null, bestD = 8;
    for (const [key, x] of [['rangeXMin', S.xLimits.rangeXMin], ['rangeXMax', S.xLimits.rangeXMax]]) {
      if (x === null || x === undefined || isNaN(x)) continue;
      const d = isKarusel ? Math.abs(toScreen(x, 0).x - mx) : Math.abs(toScreen(x, 0).y - my);
      if (d < bestD) { bestD = d; bestKey = key; }
    }
    return bestKey;
  }

  // ── SIMULATION ──
  const SIM_SPEEDS = [0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8];
  // Posuv (G1/G2/G3) běží oproti rychloposuvu (G0) poloviční rychlostí —
  // přibližuje pocit reálného obrábění při přehrávání.
  const FEED_RATE_FACTOR = 0.5;

  function updateProgressBar() {
    const pct = Math.round(S.simProgress * 100);
    progressFill.style.width = pct + '%';
    progressPct.textContent = pct + '%';
  }

  function updateSpeedLabel() {
    const v = S.simSpeed;
    const txt = v < 1 ? v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '') : v;
    speedLabel.textContent = txt + '×';
  }

  // Posun simulace o jeden G-kód blok vpřed (+1) nebo zpět (-1).
  function seekToAdjacentBlock(direction) {
    if (!S._cachedCalc) S._cachedCalc = calculate();
    const calc = S._cachedCalc;
    const total = calc.simPath.length - 1;
    if (total <= 0) return;
    S.simRunning = false; S.simBlockTarget = null; playBtn.textContent = '▶';
    S._gcodeFocusLine = null;   // ovládání simulace přebíjí kliknutý řádek
    const currentSimIdx = Math.max(0, Math.min(total, Math.floor(S.simProgress * total)));
    const currentLineIdx = calc.simPath[currentSimIdx]?.originalLineIdx ?? -1;
    let targetIdx;
    if (direction > 0) {
      targetIdx = total;
      for (let i = currentSimIdx + 1; i <= total; i++) {
        const li = calc.simPath[i].originalLineIdx;
        if (li != null && li > currentLineIdx) { targetIdx = i; break; }
      }
    } else {
      // Najít začátek aktuálního bloku; pokud už na něm jsme, skočit na začátek předchozího.
      let blockStart = currentSimIdx;
      while (blockStart > 0 && calc.simPath[blockStart - 1].originalLineIdx === currentLineIdx) blockStart--;
      if (blockStart < currentSimIdx) {
        targetIdx = blockStart;
      } else {
        const prevLineIdx = blockStart > 0 ? calc.simPath[blockStart - 1].originalLineIdx : null;
        let i = blockStart - 1;
        while (i > 0 && calc.simPath[i - 1].originalLineIdx === prevLineIdx) i--;
        targetIdx = Math.max(0, i);
      }
    }
    S.simProgress = targetIdx / total;
    draw(); updateCodeHighlight(); updateProgressBar();
  }

  function startSimLoop() {
    if (S._animId) return;
    const animate = () => {
      if (!S.simRunning) { S._animId = null; return; }
      // Pomalejší inkrement pro řezné pohyby (G1/G2/G3) — odpovídá tomu,
      // že posuv je ve skutečnosti řádově pomalejší než rychloposuv.
      let feedFactor = 1;
      const calc = S._cachedCalc;
      if (calc && calc.simPath && calc.simPath.length > 1) {
        const idx = Math.floor(S.simProgress * (calc.simPath.length - 1));
        const nextPt = calc.simPath[Math.min(idx + 1, calc.simPath.length - 1)];
        if (nextPt && nextPt.type && nextPt.type !== 'G0') feedFactor = FEED_RATE_FACTOR;
      }
      S.simProgress += 0.0015 * S.simSpeed * feedFactor;
      // Single-block: zastavit po dosažení konce aktuálního G-kód bloku.
      if (S.simBlockTarget !== null && S.simProgress >= S.simBlockTarget) {
        S.simProgress = S.simBlockTarget;
        S.simBlockTarget = null;
        S.simRunning = false;
      }
      if (S.simProgress >= 1) {
        S.simProgress = 1; S.simRunning = false;
        S.simBlockTarget = null;
      }
      if (!S.simRunning) {
        playBtn.textContent = '▶';
      }
      draw();
      updateCodeHighlight();
      updateProgressBar();
      if (S.simRunning) S._animId = requestAnimationFrame(animate);
      else S._animId = null;
    };
    S._animId = requestAnimationFrame(animate);
  }

  // ── UI: errors ──
  function showErrors() {
    if (S.errors.length === 0) { errorsDiv.style.display = 'none'; return; }
    errorsDiv.style.display = '';
    const n = S.errors.length;
    const open = S.errorsOpen;
    errorsDiv.innerHTML =
      `<button class="cam-sim-errors-toggle" data-act="errors-toggle">
        <span>⚠ Nalezeny problémy: ${n}</span>
        <span class="cam-sim-err-chevron">${open ? '▲' : '▼'}</span>
      </button>
      <div class="cam-sim-errors-body${open ? '' : ' cam-sim-collapsed'}">
        <ul>${S.errors.map(e => '<li>' + (e.msg || e) + '</li>').join('')}</ul>
      </div>`;
    errorsDiv.querySelector('[data-act="errors-toggle"]').addEventListener('click', () => {
      S.errorsOpen = !S.errorsOpen;
      showErrors();
    });
  }

  // ── UI: code area ──
  function renderCodeArea() {
    const calc = S._cachedCalc; if (!calc) return;
    // time info on canvas
    if (calc.estimatedTimeSeconds > 0)
      timeOverlay.textContent = `⏱ ${Math.floor(calc.estimatedTimeSeconds / 60)}m ${Math.round(calc.estimatedTimeSeconds % 60)}s | ${(calc.totalPathLength / 1000).toFixed(2)}m`;
    else timeOverlay.textContent = '';

    if (manualTa.value !== S.manualGCode) manualTa.value = S.manualGCode;
    renderCodeBackdrop();
    updateCodeHighlight();
  }
  // Vykreslí podkladové řádky pod textarea (1:1 se řádky G-kódu), aby šlo
  // zvýraznit aktivní řádek simulace pod editovatelným textem.
  function renderCodeBackdrop() {
    codeBackdrop.innerHTML = S.manualGCode.split('\n').map(line =>
      `<div class="cam-sim-code-bd-line">${escHTML(line) || '&nbsp;'}</div>`
    ).join('');
    codeBackdrop.scrollTop = manualTa.scrollTop;
    codeBackdrop.scrollLeft = manualTa.scrollLeft;
  }
  // Index řádku G-kódu odpovídající aktuální pozici simulace — najde
  // nejbližší následující bod simPath s originalLineIdx (viz
  // parseManualGCodeToPath). Používá se pro zvýraznění i skok kurzoru
  // v CAM Editoru na stejný řádek.
  function getActiveCodeLineIdx() {
    const calc = S._cachedCalc;
    if (!calc || calc.simPath.length < 2) return null;
    const currentSimIdx = Math.floor(S.simProgress * (calc.simPath.length - 1));
    for (let i = currentSimIdx; i < calc.simPath.length; i++) {
      if (calc.simPath[i].originalLineIdx != null) return calc.simPath[i].originalLineIdx;
    }
    return findLastIdx(calc.simPath, p => p.originalLineIdx != null) === -1
      ? null
      : calc.simPath[findLastIdx(calc.simPath, p => p.originalLineIdx != null)].originalLineIdx;
  }
  function updateCodeHighlight() {
    const focusEdit = !S.simRunning && S._gcodeFocusLine != null;

    // Klik na dráhu → auto-zobrazit G-kód panel pokud je schovaný (odloženo na mouseup)
    if (focusEdit) {
      const ca = root.querySelector('.cam-sim-code-area');
      if (ca && ca.style.display === 'none') _panelPending = true;
    }
    const hlIdx = focusEdit ? S._gcodeFocusLine : getActiveCodeLineIdx();
    const lineEls = codeBackdrop.querySelectorAll('.cam-sim-code-bd-line');
    lineEls.forEach((el, i) => el.classList.toggle('cam-sim-code-active', i === hlIdx));
    if (hlIdx != null && lineEls[hlIdx]) {
      const lineEl = lineEls[hlIdx];
      const top = lineEl.offsetTop, bottom = top + lineEl.offsetHeight;
      const skipScroll = !focusEdit && document.activeElement === manualTa;
      if (!skipScroll && (top < manualTa.scrollTop || bottom > manualTa.scrollTop + manualTa.clientHeight)) {
        manualTa.scrollTop = Math.max(0, top - manualTa.clientHeight / 2);
        codeBackdrop.scrollTop = manualTa.scrollTop;
      }
    }
    // Skok kurzoru v editoru na editovaný řádek (ověření změny hodnot).
    if (focusEdit) {
      const ls = S.manualGCode.split('\n');
      let off = 0;
      for (let i = 0; i < S._gcodeFocusLine && i < ls.length; i++) off += ls[i].length + 1;
      const end = off + ((ls[S._gcodeFocusLine] || '').length);
      try { manualTa.setSelectionRange(off, end); } catch (_) { /* mimo rozsah */ }
    }
  }
  function findLastIdx(arr, fn) {
    for (let i = arr.length - 1; i >= 0; i--) if (fn(arr[i])) return i;
    return -1;
  }
  function escHTML(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ── UI: sidebar tabs ──
  function renderTab() {
    const prms = S.params;
    tabBody.innerHTML = '';
    if (S.activeTab === 'editor') renderEditorTab();
    else if (S.activeTab === 'params') renderParamsTab();
    else if (S.activeTab === 'import') renderImportTab();
    root.querySelectorAll('.cam-sim-tabs button').forEach(btn => {
      btn.classList.toggle('cam-sim-active', btn.dataset.tab === S.activeTab);
    });
  }

  // ── editor tab ──
  function renderEditorTab() {
    const pts = S.editMode === 'contour' ? S.contourPoints : S.stockPoints;
    const isStock = S.editMode === 'stock';
    const isCylStock = isStock && S.params.stockMode === 'cylinder';
    let html = `<div class="cam-sim-toggle-row">
      <button data-edit="contour" class="${!isStock ? 'cam-sim-active' : ''}">✏ Kontura</button>
      <button data-edit="stock" class="${isStock ? 'cam-sim-active' : ''}">📦 Polotovar</button>
    </div>`;
    if (isStock) {
      html += `<div class="cam-sim-toggle-row">
        <button data-smode="cylinder" class="${S.params.stockMode === 'cylinder' ? 'cam-sim-active' : ''}">Válec</button>
        <button data-smode="casting" class="${S.params.stockMode === 'casting' ? 'cam-sim-active' : ''}">Vlastní tvar</button>
      </div>`;
    }
    if (isCylStock) {
      html += `<div class="cam-sim-info-box">Potáhněte úchopy na canvasu pro změnu rozměrů válce. Zapněte tlačítko ◆ Kontura.</div>
      <div class="cam-sim-row"><div class="cam-sim-field"><label>Průměr (D)</label><input type="number" data-cylp="stockDiameter" value="${S.params.stockDiameter}"></div>
      <div class="cam-sim-field"><label>Délka</label><input type="number" data-cylp="stockLength" value="${S.params.stockLength}"></div></div>
      <div class="cam-sim-row"><div class="cam-sim-field"><label>Přídavek čelo</label><input type="number" data-cylp="stockFace" value="${S.params.stockFace}"></div>
      <div class="cam-sim-field"><label>Přídavek (Auto)</label><input type="number" data-cylp="stockMargin" value="${S.params.stockMargin}"></div></div>
      <button class="cam-sim-btn cam-sim-btn-indigo" data-act="auto-stock">🎯 Auto-rozměr</button>`;
    } else {
    html += `<div class="cam-sim-point-header"><div style="width:18px">#</div><div style="width:48px">Typ</div><div style="width:32px">Mód</div><div style="width:56px">X/U</div><div style="width:56px">Z/W</div><div style="width:40px">R</div></div>`;
    pts.forEach((p, i) => {
      const cls = isStock ? 'cam-sim-stock' : '';
      html += `<div class="cam-sim-point-row ${cls}" data-ptid="${p.id}">
        <div class="cam-sim-pt-num">${i + 1}</div>
        <select data-field="type" data-id="${p.id}"><option ${p.type === 'G0' ? 'selected' : ''}>G0</option><option ${p.type === 'G1' ? 'selected' : ''}>G1</option><option ${p.type === 'G2' ? 'selected' : ''}>G2</option><option ${p.type === 'G3' ? 'selected' : ''}>G3</option></select>
        <button class="cam-sim-mode-btn ${p.mode === 'INC' ? 'cam-sim-inc' : ''}" data-modeid="${p.id}">${p.mode === 'INC' ? 'INC' : 'ABS'}</button>
        <input type="number" data-field="x" data-id="${p.id}" value="${p.x}" placeholder="${p.mode === 'INC' ? 'U' : 'X'}">
        <input type="number" data-field="z" data-id="${p.id}" value="${p.z}" placeholder="${p.mode === 'INC' ? 'W' : 'Z'}">
        ${(p.type === 'G2' || p.type === 'G3') ? `<input type="number" data-field="r" data-id="${p.id}" value="${p.r}" placeholder="R" style="width:40px">` : ''}
        <div class="cam-sim-pt-actions">
          <button data-insertid="${p.id}" title="Vložit za">➕</button>
          <button data-deleteid="${p.id}" title="Smazat">🗑</button>
        </div>
      </div>`;
    });
    html += `<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
      <button class="cam-sim-btn ${isStock ? 'cam-sim-btn-green' : 'cam-sim-btn-blue'}" data-act="addpt-list">➕ Přidat bod</button>
    </div>`;
    if (isStock && typeof S.zLimits.chuck === 'number' && isFinite(S.zLimits.chuck)) {
      html += `<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
      <button class="cam-sim-btn cam-sim-btn-gray" data-act="addpt-chuck-limit">⛔ Bod na limitu čelistí</button>
    </div>`;
    }
    }
    html += `<div style="display:flex;gap:4px;margin-top:6px">
      <button class="cam-sim-btn cam-sim-btn-half cam-sim-btn-gray" data-act="copy-code">📋 Kopírovat</button>
      <button class="cam-sim-btn cam-sim-btn-half cam-sim-btn-purple" data-act="download">📥 Uložit</button>
    </div>
    <div style="display:flex;gap:4px;margin-top:4px">
      <button class="cam-sim-btn cam-sim-btn-half cam-sim-btn-indigo" data-act="export-pdf">📄 Export PDF</button>
      <button class="cam-sim-btn cam-sim-btn-half cam-sim-btn-green" data-act="send-editor">🔧 Otevřít v CAM Editoru</button>
    </div>
    <div style="display:flex;gap:4px;margin-top:4px">
      <button class="cam-sim-btn cam-sim-btn-blue" data-act="to-canvas-edit" title="Vrátit konturu na plátno pro úpravu (přepsat výkres)">📐 Kreslit</button>
    </div>`;
    tabBody.innerHTML = html;
    attachEditorEvents();
  }

  function attachEditorEvents() {
    tabBody.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        S.editMode = btn.dataset.edit;
        if (S.editMode === 'stock' && S.params.stockMode === 'casting' && S.stockPoints.length === 0) generateDefaultStock();
        renderTab(); draw();
      });
    });
    tabBody.querySelectorAll('[data-smode]').forEach(btn => {
      btn.addEventListener('click', () => {
        S.params.stockMode = btn.dataset.smode;
        if (btn.dataset.smode === 'casting' && S.stockPoints.length === 0) generateDefaultStock();
        renderTab(); draw();
      });
    });
    // Když uživatel mění/přidává/maže body polotovaru v editoru, znamená to,
    // že chce vlastní tvar — switchneme stockMode na 'casting', jinak by
    // jeho úpravy byly zakryty válcovým renderingem.
    const ensureStockModeCasting = () => {
      if (S.editMode === 'stock' && S.params.stockMode !== 'casting') S.params.stockMode = 'casting';
    };
    tabBody.querySelectorAll('[data-field]').forEach(el => {
      const id = parseInt(el.dataset.id);
      const field = el.dataset.field;
      el.addEventListener('change', () => {
        pushHistory();
        const list = S.editMode === 'contour' ? S.contourPoints : S.stockPoints;
        const pt = list.find(p => p.id === id);
        if (pt) {
          pt[field] = el.value;
          ensureStockModeCasting();
          fullUpdate();
        }
      });
    });
    tabBody.querySelectorAll('[data-modeid]').forEach(btn => {
      btn.addEventListener('click', () => {
        pushHistory();
        const id = parseInt(btn.dataset.modeid);
        const list = S.editMode === 'contour' ? S.contourPoints : S.stockPoints;
        const pt = list.find(p => p.id === id);
        if (pt) { pt.mode = pt.mode === 'ABS' ? 'INC' : 'ABS'; ensureStockModeCasting(); fullUpdate(); }
      });
    });
    tabBody.querySelectorAll('[data-insertid]').forEach(btn => {
      btn.addEventListener('click', () => {
        pushHistory();
        const id = parseInt(btn.dataset.insertid);
        const list = S.editMode === 'contour' ? S.contourPoints : S.stockPoints;
        const idx = list.findIndex(p => p.id === id);
        if (idx >= 0) {
          const prev = list[idx];
          list.splice(idx + 1, 0, { ...prev, id: Date.now(), z: parseFloat(prev.z) - 5 });
          ensureStockModeCasting();
          fullUpdate();
        }
      });
    });
    tabBody.querySelectorAll('[data-deleteid]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.deleteid);
        const list = S.editMode === 'contour' ? S.contourPoints : S.stockPoints;
        if (list.length > 1) {
          pushHistory();
          const idx = list.findIndex(p => p.id === id);
          if (idx >= 0) list.splice(idx, 1);
          ensureStockModeCasting();
          fullUpdate();
        }
      });
    });
    const addBtn = tabBody.querySelector('[data-act="addpt-list"]');
    if (addBtn) addBtn.addEventListener('click', () => {
      pushHistory();
      const list = S.editMode === 'contour' ? S.contourPoints : S.stockPoints;
      const last = list.length > 0 ? list[list.length - 1] : { x: 100, z: 0 };
      list.push({ id: Date.now(), type: 'G1', x: last.x, z: parseFloat(last.z) - 10, r: 0, mode: 'ABS' });
      ensureStockModeCasting();
      fullUpdate();
    });
    const addChuckPtBtn = tabBody.querySelector('[data-act="addpt-chuck-limit"]');
    if (addChuckPtBtn) addChuckPtBtn.addEventListener('click', handleAddStockChuckPoint);
    const copyBtn = tabBody.querySelector('[data-act="copy-code"]');
    if (copyBtn) copyBtn.addEventListener('click', handleCopyGCode);
    const dlBtn = tabBody.querySelector('[data-act="download"]');
    if (dlBtn) dlBtn.addEventListener('click', handleDownload);
    const pdfBtn = tabBody.querySelector('[data-act="export-pdf"]');
    if (pdfBtn) pdfBtn.addEventListener('click', handleExportPDF);
    const editorBtn = tabBody.querySelector('[data-act="send-editor"]');
    if (editorBtn) editorBtn.addEventListener('click', handleSendToEditor);
    const toCanvasBtn = tabBody.querySelector('[data-act="to-canvas-edit"]');
    if (toCanvasBtn) toCanvasBtn.addEventListener('click', handleSendToCanvas);
    // Cylinder stock param inputs
    tabBody.querySelectorAll('[data-cylp]').forEach(el => {
      el.addEventListener('change', () => {
        pushHistory();
        S.params[el.dataset.cylp] = parseFloat(el.value) || 0;
        fullUpdate();
      });
    });
    const autoStockEdBtn = tabBody.querySelector('[data-act="auto-stock"]');
    if (autoStockEdBtn) autoStockEdBtn.addEventListener('click', () => { handleAutoStock(); fullUpdate(); });
  }

  // ── params tab ──
  function renderParamsTab() {
    const prms = S.params;
    let html = '';
    const _structLabel = prms.machineStructure === 'lathe' ? 'Soustruh' : 'Karusel';
    const _ctrlLabel = prms.controlSystem === 'sinumerik' ? 'Sinumerik' : prms.controlSystem === 'fanuc' ? 'Fanuc' : 'Heidenhain';
    const _modeLabel = prms.mode === 'RADIUS' ? 'R Poloměr' : '⌀ Průměr';
    const _mcOpen = S.machineConfigOpen;
    html += `<button class="cam-sim-machine-toggle" data-act="machine-config-toggle">
      <span class="cam-sim-machine-summary">
        <span class="cam-sim-machine-chip">${_structLabel}</span>
        <span class="cam-sim-machine-chip">${_ctrlLabel}</span>
        <span class="cam-sim-machine-chip">${_modeLabel}</span>
      </span>
      <span class="cam-sim-machine-chevron">${_mcOpen ? '▲' : '▼'}</span>
    </button>
    <div class="cam-sim-machine-body${_mcOpen ? '' : ' cam-sim-collapsed'}">
      <div class="cam-sim-section-title">Struktura stroje</div>
      <div class="cam-sim-toggle-row">
        <button data-struct="lathe" class="${prms.machineStructure === 'lathe' ? 'cam-sim-active' : ''}">Soustruh</button>
        <button data-struct="carousel" class="${prms.machineStructure === 'carousel' ? 'cam-sim-active' : ''}">Karusel</button>
      </div>
      <div class="cam-sim-section-title">Řídicí systém</div>
      <div class="cam-sim-toggle-row">
        <button data-ctrl="sinumerik" class="${prms.controlSystem === 'sinumerik' ? 'cam-sim-active' : ''}">Sinumerik</button>
        <button data-ctrl="fanuc" class="${prms.controlSystem === 'fanuc' ? 'cam-sim-active' : ''}">Fanuc</button>
        <button data-ctrl="heidenhain" class="${prms.controlSystem === 'heidenhain' ? 'cam-sim-active' : ''}">Heidenhain</button>
      </div>
      <div class="cam-sim-section-title">Profilování</div>
      <div class="cam-sim-toggle-row">
        <button data-act="toggle-auto-profile" class="${prms.autoProfile !== false ? 'cam-sim-active' : ''}">⊙ Auto profil</button>
      </div>
      <div class="cam-sim-row">
        <div class="cam-sim-field"><label>Osa X</label><button data-act="flipx-param" class="cam-sim-btn ${S.flipX ? 'cam-sim-btn-blue' : 'cam-sim-btn-gray'}" style="padding:4px 2px;font-size:11px">${S.flipX ? '⇅ X+ ↓' : '⇅ X+ ↑'}</button></div>
        <div class="cam-sim-field"><label>Osa Z</label><button data-act="flipz-param" class="cam-sim-btn ${S.flipZ ? 'cam-sim-btn-blue' : 'cam-sim-btn-gray'}" style="padding:4px 2px;font-size:11px">${S.flipZ ? '⇄ Z+ ←' : '⇄ Z+ →'}</button></div>
      </div>
      <div class="cam-sim-section-title">Programování</div>
      <div class="cam-sim-toggle-row">
        <button data-pmode="DIAMON" class="${prms.mode === 'DIAMON' ? 'cam-sim-active' : ''}">⌀ Průměr</button>
        <button data-pmode="RADIUS" class="${prms.mode === 'RADIUS' ? 'cam-sim-active' : ''}">R Poloměr</button>
      </div>
    </div>`;
    const _safeOpen = S.safetyConfigOpen;
    const _chActive = S.zLimits.chuckActive;
    const _koActive = S.zLimits.tailActive;
    const _zActive = S.zLimits.rangeActive;
    const _xActive = S.xLimits.active;
    const _cs = (on) => on
      ? 'background:rgba(166,227,161,0.18);border-color:rgba(166,227,161,0.5);color:#a6e3a1'
      : 'background:rgba(88,91,112,0.12);border-color:rgba(88,91,112,0.35);color:#585b70';
    html += `<button class="cam-sim-machine-toggle" data-act="safety-config-toggle">
      <span class="cam-sim-machine-summary">
        <span class="cam-sim-machine-chip">Bp ${prms.safeX}<span style="color:#1e1e2e;font-weight:900">/</span>${prms.safeZ}</span>
        <span class="cam-sim-machine-chip">Vůle ${prms.rapidClearance} mm</span>
        <span class="cam-sim-machine-chip" style="display:inline-flex;gap:3px;align-items:center">
          <span style="color:${_chActive ? '#a6e3a1' : '#585b70'}" title="Čelisti">Č</span><span style="color:#45475a">/</span><span style="color:${_koActive ? '#a6e3a1' : '#585b70'}" title="Koník">K</span>
        </span>
        <span class="cam-sim-machine-chip" style="${_cs(_zActive)}" title="Rozsah Z">Z</span>
        <span class="cam-sim-machine-chip" style="${_cs(_xActive)}" title="Rozsah X">X</span>
      </span>
      <span class="cam-sim-machine-chevron">${_safeOpen ? '▲' : '▼'}</span>
    </button>
    <div class="cam-sim-machine-body${_safeOpen ? '' : ' cam-sim-collapsed'}">
      <div class="cam-sim-section-title">Bezpečná poloha</div>
      <div class="cam-sim-row">
        <div class="cam-sim-field"><label>X (Průměr)</label><input type="number" data-p="safeX" value="${prms.safeX}"></div>
        <div class="cam-sim-field"><label>Z</label><input type="number" data-p="safeZ" value="${prms.safeZ}"></div>
      </div>
      <div class="cam-sim-row">
        <div class="cam-sim-field" title="Vzdálenost od polotovaru, kde končí rychloposuv. Sjezd přes tuto vůli na povrch už jede pracovním posuvem G1."><label>Vůle nad polotovarem</label><input type="number" step="0.1" min="0.1" data-p="rapidClearance" value="${prms.rapidClearance}"></div>
      </div>`;
    const zlOn = S.showZLimits === 'on';
    const zlLabel = zlOn ? 'Skrýt' : 'Zobrazit';
    html += `<div class="cam-sim-section-title">Z-limity / rozsah <button data-act="zlimits-toggle" class="cam-sim-btn ${zlOn ? 'cam-sim-btn-green' : 'cam-sim-btn-gray'}" style="width:auto;display:inline-flex;padding:2px 8px;font-size:11px;margin-left:8px">${zlLabel}</button></div>
      <small class="cam-sim-info-box" style="display:block">Čelisti / koník = bezpečnostní limity (červené). Rozsah = úsek kontury k obrábění (žluté). Na canvasu lze tahat myší.</small>
      <div class="cam-sim-row">
        <div class="cam-sim-field"><label style="display:flex;align-items:center;gap:4px"><input type="checkbox" data-act="chuck-active" ${S.zLimits.chuckActive ? 'checked' : ''}> ⛔ Čelisti Z</label><input type="number" step="0.5" data-zlim="chuck" value="${S.zLimits.chuck ?? ''}" placeholder="vypnuto"></div>
        <div class="cam-sim-field"><label style="display:flex;align-items:center;gap:4px"><input type="checkbox" data-act="tail-active" ${S.zLimits.tailActive ? 'checked' : ''}> ⛔ Koník Z</label><input type="number" step="0.5" data-zlim="tail" value="${S.zLimits.tail ?? ''}" placeholder="vypnuto"></div>
      </div>
      <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#cdd6f4;cursor:pointer;margin:4px 0 2px">
        <input type="checkbox" data-act="zrange-active" ${S.zLimits.rangeActive ? 'checked' : ''}> Rozsah Z — aktivovat pro generování drah
      </label>
      <div class="cam-sim-row">
        <div class="cam-sim-field"><label>◀ Rozsah start Z</label><input type="number" step="0.5" data-zlim="rangeStart" value="${S.zLimits.rangeStart ?? ''}" placeholder="vypnuto"></div>
        <div class="cam-sim-field"><label>Rozsah konec Z ▶</label><input type="number" step="0.5" data-zlim="rangeEnd" value="${S.zLimits.rangeEnd ?? ''}" placeholder="vypnuto"></div>
      </div>
      <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#cdd6f4;cursor:pointer;margin:4px 0 2px">
        <input type="checkbox" data-act="xrange-active" ${S.xLimits.active ? 'checked' : ''}> Rozsah X — aktivovat pro generování drah
      </label>
      <div class="cam-sim-row">
        <div class="cam-sim-field"><label>▼ Rozsah X min (∅/2)</label><input type="number" step="0.5" min="0" data-xlim="rangeXMin" value="${S.xLimits.rangeXMin ?? ''}" placeholder="vypnuto"></div>
        <div class="cam-sim-field"><label>Rozsah X max (∅/2) ▲</label><input type="number" step="0.5" min="0" data-xlim="rangeXMax" value="${S.xLimits.rangeXMax ?? ''}" placeholder="vypnuto"></div>
      </div>
      <div style="text-align:right;margin-top:2px"><button class="cam-sim-btn cam-sim-btn-gray" style="width:auto;display:inline-flex;padding:2px 8px;font-size:11px" data-act="zlimits-clear">Vymazat vše</button></div>
    </div>`;
    const _matOpen = S.materialConfigOpen;
    const _matLabel = S.selectedMaterial && MATERIALS[S.selectedMaterial]
      ? MATERIALS[S.selectedMaterial].name : '—';
    html += `<button class="cam-sim-machine-toggle" data-act="material-config-toggle">
      <span class="cam-sim-machine-summary">
        <span style="color:#a6adc8;font-size:11px">Materiál:</span>
        <span class="cam-sim-machine-chip">${_matLabel}</span>
      </span>
      <span class="cam-sim-machine-chevron">${_matOpen ? '▲' : '▼'}</span>
    </button>
    <div class="cam-sim-machine-body${_matOpen ? '' : ' cam-sim-collapsed'}">
      <div class="cam-sim-section-title">Databáze materiálů</div>
      <div class="cam-sim-mat-grid">${Object.keys(MATERIALS).map(k =>
        `<button data-mat="${k}" class="${S.selectedMaterial === k ? 'cam-sim-active' : ''}">${MATERIALS[k].name}</button>`
      ).join('')}</div>
    </div>`;
    const _toolOpen = S.toolConfigOpen;
    const _shapeIcon = prms.toolShape === 'round' ? '⬤' : prms.toolShape === 'parting' ? '▮' : prms.toolShape === 'threading' ? '▽' : '◼';
    const _angleChip = prms.toolShape === 'polygon'
      ? `<span class="cam-sim-machine-chip">${prms.toolAngle}°</span>`
      : prms.toolShape === 'threading'
        ? `<span class="cam-sim-machine-chip">${prms.toolTipAngle}°</span>` : '';
    const _vbdChip = prms.toolVbdCode
      ? `<span class="cam-sim-machine-chip" style="font-family:monospace;font-size:10px;letter-spacing:0.5px">${(prms.toolVbdCode || '').substring(0, 8)}</span>` : '';
    html += `<button class="cam-sim-machine-toggle" data-act="tool-config-toggle">
      <span class="cam-sim-machine-summary">
        <span style="color:#a6adc8;font-size:11px">Nástroj:</span>
        <span class="cam-sim-machine-chip">${prms.toolShape === 'threading' ? `⊔ ${prms.toolTipFlat}` : `R ${prms.toolRadius}`}</span>
        <span class="cam-sim-machine-chip">${_shapeIcon}</span>
        ${_angleChip}
        ${_vbdChip}
      </span>
      <span class="cam-sim-machine-chevron">${_toolOpen ? '▲' : '▼'}</span>
    </button>
    <div class="cam-sim-machine-body${_toolOpen ? '' : ' cam-sim-collapsed'}">
      <div class="cam-sim-row">
        <div class="cam-sim-field"><label>Max. otáčky (LIMS)</label><input type="number" data-p="lims" inputmode="numeric" value="${parseInt((prms.machineType || '').match(/LIMS=(\d+)/)?.[1]) || 2000}"></div>
        <div class="cam-sim-field"><label>Název nástroje</label><input type="text" data-p="toolName" inputmode="text" value="${prms.toolName}"></div>
      </div>
      <div class="cam-sim-section-title">
        <button data-act="tool-library" class="cam-sim-btn cam-sim-btn-gray" style="width:auto;display:inline-flex;padding:2px 8px;font-size:11px">🧰 Knihovna</button>
        <button data-act="open-tool-geometry" class="cam-sim-btn cam-sim-btn-gray" style="width:auto;display:inline-flex;padding:2px 8px;font-size:11px;margin-left:4px" title="Geometrie destičky (VBD) a držáku, náhled a ISO 5608/5610 katalogová data">⚙️ Geometrie</button>
        <button data-act="open-magazine" class="cam-sim-btn cam-sim-btn-gray" style="width:auto;display:inline-flex;padding:2px 8px;font-size:11px;margin-left:4px">🔧 Zásobník</button>
        <button data-act="open-threads" class="cam-sim-btn cam-sim-btn-gray" style="width:auto;display:inline-flex;padding:2px 8px;font-size:11px;margin-left:4px" title="Databáze závitů — výběr nastaví parametry operace Závit i úhel závitového plátku">🧵 Závity</button>
      </div>
      ${_renderInsertShapeFieldsHTML(prms)}
    </div>`;
    const _machOpen = S.machiningConfigOpen;
    const _fmtNum = (v) => String(v).replace('.', ',');
    const _stratIcon = prms.roughingStrategy === 'face' ? '↓' : '↔';
    const _sideIcon = prms.roughingSide === 'left' ? '→' : '←';
    const _phVal = parseFloat(prms.finishAllowance) || 0;
    const _pxVal = parseFloat(prms.allowanceX) || 0;
    const _pzVal = parseFloat(prms.allowanceZ) || 0;
    const _machChips = [
      prms.threadActive ? '🧵 závit!' : '',
      _phVal !== 0 ? `Ph${_fmtNum(prms.finishAllowance)}` : '',
      _pxVal !== 0 ? `PX${_fmtNum(prms.allowanceX)}` : '',
      _pzVal !== 0 ? `PZ${_fmtNum(prms.allowanceZ)}` : ''
    ].filter(Boolean);
    html += `<button class="cam-sim-machine-toggle" data-act="machining-config-toggle">
      <span class="cam-sim-machine-summary">
        <span style="color:#a6adc8;font-size:11px">Obrábění:</span>
        <span class="cam-sim-machine-chip">${_stratIcon}${_sideIcon}</span>
        ${_machChips.map(c => `<span class="cam-sim-machine-chip">${c}</span>`).join('')}
        <span class="cam-sim-machine-chip">ap${_fmtNum(prms.depthOfCut)}</span>
        <span class="cam-sim-machine-chip">F${_fmtNum(prms.feed)}</span>
      </span>
      <span class="cam-sim-machine-chevron">${_machOpen ? '▲' : '▼'}</span>
    </button>
    <div class="cam-sim-machine-body${_machOpen ? '' : ' cam-sim-collapsed'}">
      <div class="cam-sim-toggle-row">
        <button data-rough="face" class="${prms.roughingStrategy === 'face' ? 'cam-sim-active' : ''}">↓ Čelně (X)</button>
        <button data-rough="longitudinal" class="${prms.roughingStrategy === 'longitudinal' ? 'cam-sim-active' : ''}">↔ Podélně (Z)</button>
      </div>
      <div class="cam-sim-toggle-row">
        <button data-side="left" class="${prms.roughingSide === 'left' ? 'cam-sim-active' : ''}" title="Druhá strana — zaber zleva doprava (zprava nelze, narazil by držák / geometrie destičky), omezeno 📐 Rozsahem obrábění">→ Zleva</button>
        <button data-side="right" class="${(prms.roughingSide || 'right') === 'right' ? 'cam-sim-active' : ''}" title="Zaber zprava doleva (standard)">← Zprava</button>
      </div>
      <div class="cam-sim-row">
        <div class="cam-sim-field"><label data-tooltip="Hrubovací offset = Rádius (R) + Přídavek X/Z + Přídavek na hotovo. Dokončovací offset = jen Rádius (R).">Přídavek na hotovo</label><input type="number" step="0.1" data-p="finishAllowance" value="${prms.finishAllowance}"></div>
        <div class="cam-sim-field"><label data-tooltip="Dodatečný přídavek jen ve směru X (radiálně) — přičte se k hrubovacímu offsetu navíc k Přídavku na hotovo.">Přídavek X</label><input type="number" step="0.1" data-p="allowanceX" value="${prms.allowanceX}"></div>
        <div class="cam-sim-field"><label data-tooltip="Dodatečný přídavek jen ve směru Z (podélně) — přičte se k hrubovacímu offsetu navíc k Přídavku na hotovo.">Přídavek Z</label><input type="number" step="0.1" data-p="allowanceZ" value="${prms.allowanceZ}"></div>
      </div>
      <div class="cam-sim-row">
        <div class="cam-sim-field"><label data-tooltip="Maximální hloubka záběru na jeden hrubovací zákrok (radiálně).">Hloubka (ap)</label><input type="number" step="0.5" data-p="depthOfCut" value="${prms.depthOfCut}"></div>
        <div class="cam-sim-field"><label data-tooltip="Posuv na otáčku [mm/ot] pro hrubovací dráhu.">Posuv (F)</label><input type="number" step="0.05" data-p="feed" value="${prms.feed}"></div>
      </div>
      <div class="cam-sim-row">
        <div class="cam-sim-field"><label data-tooltip="Řezná rychlost [m/min] pro výpočet otáček vřetene.">Rychlost (Vc)</label><input type="number" step="10" data-p="speed" value="${prms.speed}"></div>
        <div class="cam-sim-field"><label data-tooltip="Vzdálenost bezpečného odskoku nástroje od obrobku mezi jednotlivými zákroky (zdvih v X).">Odskok</label><input type="number" step="0.5" data-p="retractDistance" value="${prms.retractDistance}"></div>
        <div class="cam-sim-field"><label data-tooltip="Úhel odskoku: 45° = klasická diagonála (X i Z), 90° = svisle jen v ose X. Z-složka = Odskok / tan(úhel).">Úhel odsk. (°)</label><input type="number" step="5" min="5" max="90" data-p="retractAngle" value="${prms.retractAngle ?? 45}"></div>
      </div>`;
    if (prms.toolShape === 'polygon') {
      const insertGuideCount = (S.guideLines || []).filter(g => g.fromInsert).length;
      const totalGuideCount = (S.guideLines || []).length;
      html += `<div class="cam-sim-checkbox-row" data-tooltip="Hrubování i dokončování se upraví tak, aby boční ostří destičky (natočení + vrcholový úhel) nezajelo do kontury.">
        <input type="checkbox" id="cam-sim-respect-insert" ${prms.respectInsertGeometry ? 'checked' : ''}>
        <span>Hlídat geometrii destičky</span>
        ${totalGuideCount > 0 ? `<button data-act="clear-insert-guides" title="Smazat konstrukční čáry vygenerované hlídáním destičky (${totalGuideCount} čar)" style="margin-left:6px;padding:1px 7px;font-size:10px;background:#313244;border:1px solid #45475a;border-radius:4px;cursor:pointer;color:#fab387">🧹 ${totalGuideCount}</button>` : ''}
      </div>`;
    }
    html += `</div>`;
    const _machSubTab = S.machiningSubTab || 'hrub';
    html += `<div class="cam-sim-toggle-row" style="margin-top:6px">
      <button data-machtab="hrub" class="${_machSubTab === 'hrub' ? 'cam-sim-active' : ''}">Hrub.</button>
      <button data-machtab="hot" class="${_machSubTab === 'hot' ? 'cam-sim-active' : ''}">Hot.</button>
      <button data-machtab="upich" class="${_machSubTab === 'upich' ? 'cam-sim-active' : ''}">Upich</button>
      <button data-machtab="zavit" class="${_machSubTab === 'zavit' ? 'cam-sim-active' : ''}">Závit</button>
    </div>`;
    // Aktivní závitování NAHRAZUJE hrubování/dokončování (viz generateAutoGCode)
    // — mimo záložku Závit to ale nebylo nikde vidět a uživatel se divil,
    // proč se místo hrubovacích drah generuje závitovací cyklus.
    if (prms.threadActive && _machSubTab !== 'zavit') {
      html += `<small class="cam-sim-info-box" style="display:block;margin-top:4px;color:#fab387">⚠ Je aktivní <b>závitování</b> (${prms.threadName || `⌀${prms.threadDiameter}×${prms.threadPitch}`}) — program obsahuje jen závitovací cyklus, hrubování/dokončování se negeneruje.
        <button data-act="thread-deactivate" style="margin-left:6px;padding:1px 8px;font-size:10px;background:#313244;border:1px solid #45475a;border-radius:4px;cursor:pointer;color:#a6e3a1">Vypnout závit</button></small>`;
    }
    if (_machSubTab === 'hrub') {
      html += `<div class="cam-sim-checkbox-row" data-tooltip="Po dojezdu hrubovacího průchodu na offset nástroj dál sleduje konturu (G1/G2/G3) až na hloubku dalšího průchodu, místo okamžitého odskoku — schody mezi kroky se obrobí přímo po obrysu.">
        <input type="checkbox" id="cam-sim-nostep" ${prms.noStepRoughing ? 'checked' : ''}>
        <span>Hrub. bez schodků</span>
        ${prms.noStepRoughing ? `<span style="color:#45475a;margin:0 4px">|</span><input type="checkbox" id="cam-sim-nostep-face" ${prms.noStepRoughingFace ? 'checked' : ''}><span>i u čelního</span>` : ''}
      </div>`;
      html += `<div class="cam-sim-checkbox-row">
        <label class="cam-sim-checkbox-item" data-tooltip="Podélné hrubování smí rampou pod úhlem zanoření sjet i do kapes v kontuře.">
          <input type="checkbox" id="cam-sim-plunge" ${prms.plungeRoughing ? 'checked' : ''}>
          <span>Zanořování</span>
        </label>
        ${prms.plungeRoughing ? `<label class="cam-sim-checkbox-item" data-tooltip="Když rampa narazí na kapsu, dobere ji celou najednou (všechny zákroky ap po sobě), než pokračuje zbytkem dílu. Mezi zákroky uvnitř kapsy nástroj bezpečně přejede nad polotovarem. Vypnuto = postupné dotahování spolu s hloubkou zbytku dílu (původní chování).">
          <input type="checkbox" id="cam-sim-plunge-atonce" ${prms.pocketFinishAtOnce ? 'checked' : ''}>
          <span>Dobrat naráz</span>
        </label>` : ''}
      </div>`;
      if (prms.stockMode === 'casting') {
        html += `<div class="cam-sim-checkbox-row" data-tooltip="Jen odlitek: každý výstupek polotovaru (mezi „údolími", kde se povrch blíží kontuře) se vyhrubuje shora dolů SAMOSTATNĚ; mezi regiony rychloposuv nad polotovar. Nástroj nepřejíždí po kontuře napříč celým dílem. Vypnuto = průchody po hloubkách přes celý díl.">
          <input type="checkbox" id="cam-sim-region" ${prms.regionRoughing ? 'checked' : ''}>
          <span>Hrubovat po regionech</span>
        </div>`;
      }
      const effPlunge = Math.round(getEffectivePlungeAngle(prms) * 10) / 10;
      const clearDegUI = parseFloat(prms.toolClearanceAngle) || 0;
      const rawPlunge = prms.toolShape === 'polygon'
        ? (prms.roughingStrategy === 'face' ? Math.abs((parseFloat(prms.toolAngle)||0) + (parseFloat(prms.toolTipAngle)||90) - 90) : Math.abs(parseFloat(prms.toolAngle)||0))
        : 45;
      const plungeClampedByAlpha = prms.entryAngleAuto && clearDegUI > 0 && clearDegUI < rawPlunge;
      html += `<div class="cam-sim-row">
        <div class="cam-sim-field" style="flex:2" title="Úhel, pod kterým nástroj rampuje do materiálu (nájezd dokončování, zanořování do kapes). Auto = úhel spodní hrany destičky (podélně: natočení; čelně: natočení + ε − 90; kulatá destička: 45°). Je-li nastaven úhel hřbetu α, omezuje výsledek shora — hřbet destičky by kontaktoval materiál při strmějším zanoření."><label>Úhel zanoření (°)${plungeClampedByAlpha ? ` <span style="color:#fab387" title="Omezeno úhlem hřbetu α=${clearDegUI}°">⚠ α</span>` : ''}</label><input type="number" step="0.5" min="0.5" max="${prms.toolShape === 'parting' ? 90 : 89}" data-p="entryAngle" value="${effPlunge}"></div>
        <div class="cam-sim-field" style="flex:1"><label>&nbsp;</label><button data-act="plunge-auto" class="cam-sim-btn ${prms.entryAngleAuto ? 'cam-sim-btn-green' : 'cam-sim-btn-gray'}" style="padding:4px 8px;font-size:11px" title="Auto = dopočítat úhel ze spodní hrany destičky, omezeno úhlem hřbetu α je-li nastaven">${prms.entryAngleAuto ? '🔗 Auto' : 'Auto'}</button></div>
      </div>`;
      html += `<div class="cam-sim-checkbox-row" data-tooltip="Dráha nástroje přesně po kontuře (pouze s korekcí R).">
        <input type="checkbox" id="cam-sim-fin" ${prms.doFinishing ? 'checked' : ''}>
        <span>Dokončovací operace</span>
      </div>`;
      if (prms.doFinishing && S.toolMagazine.length > 1) {
        const finSlot = (prms.finishingSlot !== null && prms.finishingSlot !== undefined) ? S.toolMagazine[prms.finishingSlot] : null;
        html += `<div class="cam-sim-row" style="margin-top:6px;align-items:center">
          <div style="font-size:10px;color:#6c7086;white-space:nowrap;padding-right:6px">Nástroj dok.:</div>
          <select id="cam-sim-fin-slot" style="flex:1;background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:4px;padding:3px 6px;font-size:11px">
            <option value="" ${!finSlot ? 'selected' : ''}>— Stejný nástroj —</option>
            ${S.toolMagazine.map((s, i) => `<option value="${i}" ${prms.finishingSlot === i ? 'selected' : ''}>T${s.slot} ${s.name}${s.vbdCode ? ' · ' + s.vbdCode : ''}</option>`).join('')}
          </select>
          ${finSlot ? `<span class="cam-sim-machine-chip" style="margin-left:4px;font-family:monospace">R${finSlot.radius}</span>` : ''}
        </div>`;
        if (finSlot) html += `<small class="cam-sim-info-box" style="display:block;margin-top:2px">T${finSlot.slot} · Vc ${finSlot.vc} m/min · f ${finSlot.f} mm/ot · ap ${finSlot.ap} mm — výměna nástroje se vloží před dokončování.</small>`;
      }
    } else if (_machSubTab === 'hot') {
      html += `<div class="cam-sim-checkbox-row" data-tooltip="Jen dokončení: vynechá hrubovací průchody a objede konturu jediným dokončovacím průchodem (přesně po kontuře, jen s korekcí R) — jako závěrečná dráha v Hrub. Použij, když hrubování dělá jiná operace/nástroj a tady se jede pouze načisto.">
        <input type="checkbox" id="cam-sim-finonly" ${prms.finishOnly ? 'checked' : ''}>
        <span>Dokončovací operace</span>
      </div>`;
      if (prms.finishOnly && S.toolMagazine.length > 1) {
        const finSlot = (prms.finishingSlot !== null && prms.finishingSlot !== undefined) ? S.toolMagazine[prms.finishingSlot] : null;
        html += `<div class="cam-sim-row" style="margin-top:6px;align-items:center">
          <div style="font-size:10px;color:#6c7086;white-space:nowrap;padding-right:6px">Nástroj dok.:</div>
          <select id="cam-sim-fin-slot" style="flex:1;background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:4px;padding:3px 6px;font-size:11px">
            <option value="" ${!finSlot ? 'selected' : ''}>— Stejný nástroj —</option>
            ${S.toolMagazine.map((s, i) => `<option value="${i}" ${prms.finishingSlot === i ? 'selected' : ''}>T${s.slot} ${s.name}${s.vbdCode ? ' · ' + s.vbdCode : ''}</option>`).join('')}
          </select>
          ${finSlot ? `<span class="cam-sim-machine-chip" style="margin-left:4px;font-family:monospace">R${finSlot.radius}</span>` : ''}
        </div>`;
        if (finSlot) html += `<small class="cam-sim-info-box" style="display:block;margin-top:2px">T${finSlot.slot} · Vc ${finSlot.vc} m/min · f ${finSlot.f} mm/ot · ap ${finSlot.ap} mm — výměna nástroje se vloží před dokončování.</small>`;
      } else if (!prms.finishOnly) {
        html += `<small class="cam-sim-info-box" style="display:block;margin-top:4px">Objede konturu na hotovo bez hrubování (stejná dráha jako závěrečné dokončení v Hrub.).</small>`;
      }
    } else if (_machSubTab === 'upich') {
      const _poActive = prms.partOffZ != null && isFinite(parseFloat(prms.partOffZ));
      const _shapeOk = prms.toolShape === 'round' || prms.toolShape === 'parting';
      html += `<div class="cam-sim-row" style="align-items:flex-end">
        <div class="cam-sim-field" style="flex:2"><label title="Upichnutí (part-off): klikni na canvas → v daném Z vznikne svislá úsečka kontury, kterou plátek obrobí zápichem s korekcí rádiusu a přídavky (jen kulatý / upichovací plátek). Prázdné = běžné zapichování/hrubování tvaru.">Upichnutí (part-off)</label>
          <button data-act="partoff-pick" class="cam-sim-btn ${S.partOffPickMode ? 'cam-sim-btn-green' : 'cam-sim-btn-gray'}" style="width:100%;font-size:11px;padding:5px 6px">${S.partOffPickMode ? '⊹ Klikni na canvas…' : (_poActive ? `✂️ Z=${parseFloat(prms.partOffZ).toFixed(2)} (změnit)` : '✂️ Ukázat bod')}</button>
        </div>
        <div class="cam-sim-field" style="flex:1"><label>&nbsp;</label><button data-act="partoff-clear" class="cam-sim-btn cam-sim-btn-gray" style="width:100%;font-size:11px;padding:5px 6px" ${_poActive || S.partOffPickMode ? '' : 'disabled'} title="Zrušit upichnutí — zpět na zapichování/hrubování tvaru">✖ Zrušit</button></div>
      </div>
      ${_poActive ? `${!_shapeOk ? `<small class="cam-sim-info-box" style="display:block;margin-top:4px;color:#f38ba8">⚠ Upichnutí podporuje jen kulatý / upichovací plátek — přepni tvar plátku (dráhy se nevygenerují).</small>` : ''}
      <div class="cam-sim-row">
        <div class="cam-sim-field"><label title="Dojezd: cílová radiální poloha SPODNÍ HRANY plátku. 0 = spodní hrana na osu (X0), 10 = hrana na X10. Střed pracovního rádiusu dojede na (Dojezd X + R).">Dojezd X</label><input type="number" step="0.1" data-p="allowanceX" value="${prms.allowanceX}"></div>
        <div class="cam-sim-field"><label title="Start X: radiální poloha SPODNÍ HRANY, kam se z povrchu polotovaru dojede RYCHLOPOSUVEM a teprve odtud jede posuv (užitečné v kapse — nástroj dojede blíž k ose bez řezání). 0 = zápich začne od povrchu polotovaru.">Start X</label><input type="number" step="0.1" data-p="partOffStartX" value="${prms.partOffStartX}"></div>
        <div class="cam-sim-field"><label title="Z rovina upichnutí (part-off) — souřadnice Z naklikaného bodu. Lze upravit i ručně.">Z upich</label><input type="number" step="0.01" data-p="partOffZ" value="${parseFloat(prms.partOffZ)}"></div>
      </div>
      <div class="cam-sim-row">
        <div class="cam-sim-field"><label title="TRVALÝ přídavek jen v ose Z — poslední (finální) dráha ho nechá stát, NEODEBÍRÁ se dokončováním. Posune finální rovinu řezu o tuto hodnotu.">Přídavek Z</label><input type="number" step="0.1" data-p="allowanceZ" value="${prms.allowanceZ}"></div>
        <div class="cam-sim-field"><label title="Přídavek NA HOTOVO (jen v ose Z): materiál nechaný na finální rovině. Hlavní dráha ho nechá stát VŽDY; jen se zapnutou Dokončovací operací ho odebere druhá (plynulá) dráha.">Přídavek na hotovo</label><input type="number" step="0.1" data-p="finishAllowance" value="${prms.finishAllowance}"></div>
      </div>
      <div class="cam-sim-checkbox-row" data-tooltip="Dokončovací (plynulá, nepeckovaná) dráha odebírající Přídavek na hotovo. Bez ní jede jen jeden zápich na finální rovinu.">
        <input type="checkbox" id="cam-sim-fin" ${prms.doFinishing ? 'checked' : ''}>
        <span>Dokončovací operace</span>
      </div>
      <div class="cam-sim-checkbox-row" data-tooltip="Zapnuto = hlavní zápich jede jedním plynulým posuvem F až na dno (bez peckování). Vypnuto = peckovaný cyklus (výjezdy pro lámání třísky dle polí níže).">
        <input type="checkbox" id="cam-sim-partoff-smooth" ${prms.partOffSmooth ? 'checked' : ''}>
        <span>Plynulé upichnutí (bez peckování)</span>
      </div>
      ${prms.partOffSmooth ? '' : `<div class="cam-sim-row">
        <div class="cam-sim-field"><label title="Peck: rychloposuvem zpět dolů až na tuto vzdálenost nad dno předchozího řezu, poslední úsek posuvem F.">Posuv posl. (mm)</label><input type="number" step="0.5" min="0" data-p="partingApproachFeed" value="${prms.partingApproachFeed}"></div>
        <div class="cam-sim-field"><label title="Vyjezd (peck): po jaké hloubce zanoření nástroj vyjede pro uvolnění třísek. (Sdílí pole „Odskok".)">Vyjezd/peck</label><input type="number" step="0.5" min="0.1" data-p="retractDistance" value="${prms.retractDistance}"></div>
      </div>`}` : ''}`;
    } else if (_machSubTab === 'zavit') {
      const _thName = prms.threadName || `⌀${prms.threadDiameter}×${prms.threadPitch}`;
      const _thCuts = computeThreadPassCuts(Math.max(0.01, parseFloat(prms.threadDepth) || 0.01), parseFloat(prms.threadPasses) || 0);
      const _thCmd = prms.controlSystem === 'fanuc' ? 'G32' : 'G33';
      html += `<div class="cam-sim-row" style="align-items:flex-end">
        <div class="cam-sim-field" style="flex:2"><label title="Vybrat závit z databáze (M, Tr, G, UNC…) — vyplní ⌀D, stoupání P, hloubku H a úhel profilu.">Závit</label>
          <button data-act="thread-pick" class="cam-sim-btn cam-sim-btn-gray" style="width:100%;font-size:11px;padding:5px 6px">🧵 ${prms.threadName ? `${_thName} (změnit)` : 'Vybrat závit…'}</button>
        </div>
        <div class="cam-sim-field" style="flex:1"><label>&nbsp;</label><button data-act="thread-toggle" class="cam-sim-btn ${prms.threadActive ? 'cam-sim-btn-green' : 'cam-sim-btn-gray'}" style="width:100%;font-size:11px;padding:5px 6px" title="Zapnout/vypnout generování závitovacího cyklu (nahrazuje hrubování — dráhy se přegenerují)">${prms.threadActive ? '✅ Aktivní' : 'Neaktivní'}</button></div>
      </div>`;
      html += `<div class="cam-sim-toggle-row">
        <button data-thext="1" class="${prms.threadExternal !== false ? 'cam-sim-active' : ''}" title="Vnější závit — přísuv z povrchu ⌀D dolů na dno profilu">Vnější</button>
        <button data-thext="0" class="${prms.threadExternal === false ? 'cam-sim-active' : ''}" title="Vnitřní závit — přísuv z předvrtané díry ⌀(D−2H) nahoru na ⌀D">Vnitřní</button>
      </div>`;
      const _thInfeed = prms.threadInfeed === 'flank' || prms.threadInfeed === 'alternate' ? prms.threadInfeed : 'radial';
      html += `<div style="margin-top:2px"><label style="font-size:10px;color:#6c7086">Přísuv</label></div>
      <div class="cam-sim-toggle-row">
        <button data-thinfeed="radial" class="${_thInfeed === 'radial' ? 'cam-sim-active' : ''}" title="Radiální (kolmý) přísuv — nástroj jede přímo v X, řežou obě strany profilu. Jednoduchý, pro menší stoupání.">⊥ Radiální</button>
        <button data-thinfeed="flank" class="${_thInfeed === 'flank' ? 'cam-sim-active' : ''}" title="Boční přísuv — start průchodu se posouvá v Z o hloubka·tan(ε/2), řeže jen jeden bok profilu (lepší odvod třísky, menší síly). Pro větší stoupání.">∠ Boční</button>
        <button data-thinfeed="alternate" class="${_thInfeed === 'alternate' ? 'cam-sim-active' : ''}" title="Střídavý (cik-cak) přísuv — boční posun střídá strany, boky profilu se řežou střídavě → rovnoměrné opotřebení špičky. Pro velká stoupání a Tr/Acme.">⇄ Střídavý</button>
      </div>`;
      html += `<div class="cam-sim-row">
        <div class="cam-sim-field"><label title="Jmenovitý (vnější) průměr závitu">⌀ D</label><input type="number" step="0.1" data-p="threadDiameter" value="${prms.threadDiameter}"></div>
        <div class="cam-sim-field"><label title="Stoupání závitu — v G-kódu jako ${_thCmd === 'G32' ? 'F' : 'K'} na řádku ${_thCmd}. Změna přepočítá hloubku H.">Stoupání P</label><input type="number" step="0.05" data-p="threadPitch" value="${prms.threadPitch}"></div>
        <div class="cam-sim-field"><label title="Hloubka profilu (radiálně) — auto z P a typu závitu, lze ručně přepsat">Hloubka H</label><input type="number" step="0.01" data-p="threadDepth" value="${prms.threadDepth}"></div>
      </div>
      <div class="cam-sim-row">
        <div class="cam-sim-field"><label title="Z začátku závitu (odtud se řeže směrem k Z konec)">Z start</label><input type="number" step="0.5" data-p="threadZStart" value="${prms.threadZStart}"></div>
        <div class="cam-sim-field"><label title="Z konce závitu">Z konec</label><input type="number" step="0.5" data-p="threadZEnd" value="${prms.threadZEnd}"></div>
        <div class="cam-sim-field"><label title="Náběh před Z start — dráha navíc na rozběh posuvu/synchronizaci (typ. 2–3×P)">Náběh</label><input type="number" step="0.5" min="0" data-p="threadRunIn" value="${prms.threadRunIn}"></div>
        <div class="cam-sim-field"><label title="Výběh za Z konec — 0 když závit končí v zápichu">Výběh</label><input type="number" step="0.5" min="0" data-p="threadRunOut" value="${prms.threadRunOut}"></div>
      </div>
      <div class="cam-sim-row">
        <div class="cam-sim-field"><label title="Počet řezných průchodů; 0 = auto podle hloubky (degresivní přísuv ~0,12 mm průměrně, první záběr ≤ 0,4 mm — např. M20×2,5 → 15 průchodů)">Průchody (0=auto)</label><input type="number" step="1" min="0" data-p="threadPasses" value="${prms.threadPasses}"></div>
        <div class="cam-sim-field"><label title="Jiskřící průchody (ap=0) na konci — vyhlazení boků">Jiskřící</label><input type="number" step="1" min="0" data-p="threadSpringPasses" value="${prms.threadSpringPasses}"></div>
        <div class="cam-sim-field"><label title="Kuželový závit — kuželovitost 1:k. 0 = válcový; 16 = trubkové BSPT/NPT (1:16, výběr z 🧵 Závity nastaví sám). Kladné = ⌀ roste směrem řezu (k Z konci), záporné = klesá. ⌀ D platí na Z startu; průchody jedou G33/G32 s X i Z.">Kužel 1:k</label><input type="number" step="1" data-p="threadTaperRatio" value="${prms.threadTaperRatio ?? 0}"></div>
      </div>`;
      if (prms.threadActive && prms.toolShape !== 'threading') {
        html += `<small class="cam-sim-info-box" style="display:block;margin-top:4px;color:#fab387">⚠ Aktivní závitování, ale tvar plátku není závitový (▽) — dráhy se vygenerují, plátek v simulaci nebude odpovídat.</small>`;
      }
      const _thInfeedTxt = _thInfeed === 'flank' ? 'boční přísuv' : _thInfeed === 'alternate' ? 'střídavý přísuv' : 'radiální přísuv';
      const _thTaper = parseFloat(prms.threadTaperRatio) || 0;
      html += `<small class="cam-sim-info-box" style="display:block;margin-top:4px">${_thCuts.length} průchodů (1. záběr ${_thCuts[0].toFixed(3)} mm) + ${Math.max(0, Math.round(parseFloat(prms.threadSpringPasses)) || 0)}× jiskřící · ${_thInfeedTxt}${_thTaper !== 0 ? ` · kužel 1:${Math.abs(_thTaper)} (Δ⌀ ${(Math.abs(Math.abs(parseFloat(prms.threadZEnd) - parseFloat(prms.threadZStart)) / _thTaper)).toFixed(2)} mm)` : ''} · ${_thCmd} ${_thCmd === 'G32' ? 'F' : 'K'}${prms.threadPitch} · G97 konst. otáčky${prms.threadActive ? '' : ' — zapni „Aktivní" pro vygenerování drah'}.</small>`;
    }
    html += `<div style="text-align:center;margin-top:16px">
      <button class="cam-sim-btn cam-sim-btn-red" style="width:auto;display:inline-flex" data-act="reset">🔄 Resetovat vše</button>
    </div>`;
    tabBody.innerHTML = html;
    attachParamsEvents();
  }

  // Parametry destičky ovlivňující interferenční čáry — při změně se smažou
  // čáry označené fromInsert:true (byly automaticky povýšeny z hlídání destičky).
  const INSERT_PARAMS = new Set(['toolAngle', 'toolTipAngle', 'toolShape', 'toolClearanceAngle',
    'toolLength', 'holderWidth', 'holderLength']);

  // Sdílený handler pro data-p pole — volaný z hlavního panelu (tabBody) i
  // z modalu Geometrie nástroje, aby obě UI zapisovaly do S.params stejně.
  function applyParamChange(key, inp) {
    const v = inp.value;
    if (key === 'lims') {
      S.params.machineType = `LIMS=${parseInt(v) || 2000}`;
    } else {
      if (key === 'entryAngle') S.params.entryAngleAuto = false;
      S.params[key] = inp.type === 'number' ? (parseFloat(v) || 0) : v;
      // Změna stoupání → přepočet hloubky profilu podle typu závitu
      // (ruční úpravu H tím uživatel dělá až PO nastavení P).
      if (key === 'threadPitch') {
        S.params.threadDepth = Math.round(threadProfileDepth(S.params.threadType, parseFloat(v) || 0, S.params.threadExternal !== false) * 1000) / 1000;
      }
    }
    // Změna tvaru/úhlu destičky → smazat zastaralé promované interferenční čáry
    if (INSERT_PARAMS.has(key) && S.params.respectInsertGeometry) {
      const before = S.guideLines.length;
      S.guideLines = S.guideLines.filter(g => !g.fromInsert);
      if (S.guideLines.length < before)
        showToast('Konstrukční čáry z hlídání destičky aktualizovány 🔄');
    }
    // Aktivní upichnutí: peck/posuv, přídavky a rozměry plátku mění cyklus
    // (dojezd v X, Z-offset, korekce rádiusu) → přegenerovat hned.
    if (S.params.partOffZ != null
        && ['partingApproachFeed', 'retractDistance', 'feed',
            'allowanceX', 'allowanceZ', 'finishAllowance', 'partOffStartX', 'partOffZ',
            'toolRadius', 'toolLength'].includes(key)) {
      _regenGCode();
    } else if (S.params.threadActive && key.startsWith('thread')) {
      // Aktivní závitování: parametry závitu mění celý cyklus → přegenerovat.
      _regenGCode();
    } else {
      fullUpdate();
    }
  }

  // Sdílený handler pro přepnutí tvaru destičky — volaný z hlavního panelu
  // i z modalu Geometrie nástroje.
  function applyShapeChange(next) {
    const prev = S.params.toolShape;
    if (prev !== next) {
      // Zapamatovat geometrii odcházejícího tvaru, ať se nepřepíše cizí hodnotou.
      S._shapeGeomMem[prev] = {
        toolLength: S.params.toolLength, toolAngle: S.params.toolAngle,
        toolTipAngle: S.params.toolTipAngle, toolClearanceAngle: S.params.toolClearanceAngle,
        toolRadius: S.params.toolRadius, toolTipFlat: S.params.toolTipFlat,
      };
      S.params.toolShape = next;
      const mem = S._shapeGeomMem[next];
      if (mem) {
        // Obnovit dřívější hodnoty tohoto tvaru.
        S.params.toolLength = mem.toolLength; S.params.toolAngle = mem.toolAngle;
        S.params.toolTipAngle = mem.toolTipAngle; S.params.toolClearanceAngle = mem.toolClearanceAngle;
        if (mem.toolRadius !== undefined) S.params.toolRadius = mem.toolRadius;
        if (mem.toolTipFlat !== undefined) S.params.toolTipFlat = mem.toolTipFlat;
      } else if (next === 'polygon') {
        S.params.toolLength = 10; S.params.toolAngle = 15; S.params.toolTipAngle = 90;
      } else if (next === 'parting') {
        // Upichovák: šířka 5, natočení 0 (vodorovně s osou Z), standardně čelní.
        S.params.toolLength = 5; S.params.toolAngle = 0;
        S.params.roughingStrategy = 'face';
      } else if (next === 'threading') {
        // Závitový plátek: lichoběžníková špička (rovná spodní strana),
        // úhel dle zvoleného závitu. Rádius se u závitového nepoužívá —
        // špičku definuje spodní strana (návrat na jiný tvar R obnoví z paměti).
        S.params.toolLength = 4; S.params.toolAngle = 0;
        S.params.toolTipAngle = parseFloat(S.params.threadAngle) || 60;
        if (!(parseFloat(S.params.toolTipFlat) > 0)) S.params.toolTipFlat = 0.1;
        S.params.toolRadius = 0;
      }
    }
    // Aktivní upichnutí: tvar plátku mění zápichový cyklus (rádius/šířka)
    // i podporu (polygon → bez drah) → přegenerovat hned.
    if (S.params.partOffZ != null) _regenGCode();
    else fullUpdate();
  }

  // Přehodí, na kterou stranu od Natočení se v náhledu otevírá vrcholový
  // úhel destičky (jen kosmetika kreslení, viz toolTipMirror u defaultů).
  function applyTipMirrorToggle() {
    S.params.toolTipMirror = !S.params.toolTipMirror;
    fullUpdate();
  }

  function attachParamsEvents() {
    const mcToggleBtn = tabBody.querySelector('[data-act="machine-config-toggle"]');
    if (mcToggleBtn) mcToggleBtn.addEventListener('click', () => {
      S.machineConfigOpen = !S.machineConfigOpen;
      renderTab();
    });
    const scToggleBtn = tabBody.querySelector('[data-act="safety-config-toggle"]');
    if (scToggleBtn) scToggleBtn.addEventListener('click', () => {
      S.safetyConfigOpen = !S.safetyConfigOpen;
      renderTab();
    });
    const machToggleBtn = tabBody.querySelector('[data-act="machining-config-toggle"]');
    if (machToggleBtn) machToggleBtn.addEventListener('click', () => {
      S.machiningConfigOpen = !S.machiningConfigOpen;
      renderTab();
    });
    tabBody.querySelectorAll('[data-machtab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const nextTab = btn.dataset.machtab;
        const prevTab = S.machiningSubTab;
        if (nextTab === prevTab) return;
        if (nextTab === 'upich') {
          // Upichnutí se dělá čelně — zapnout, pokud ještě není, a zapamatovat
          // předchozí strategii, ať se dá po odchodu z Upich vrátit zpět.
          if (S.params.roughingStrategy !== 'face') {
            S._preUpichStrategy = S.params.roughingStrategy;
            S.params.roughingStrategy = 'face';
          } else {
            S._preUpichStrategy = null;
          }
        } else if (prevTab === 'upich' && S._preUpichStrategy != null) {
          S.params.roughingStrategy = S._preUpichStrategy;
          S._preUpichStrategy = null;
        }
        S.machiningSubTab = nextTab;
        fullUpdate();
      });
    });
    const flipxParamBtn = tabBody.querySelector('[data-act="flipx-param"]');
    if (flipxParamBtn) flipxParamBtn.addEventListener('click', () => {
      S.flipX = !S.flipX;
      state.flipX = S.flipX;
      persistSettings();
      if (!S._cachedCalc) S._cachedCalc = calculate();
      draw(); saveState();
      showToast(S.flipX ? 'Osa X otočena – X+ dolů (ruční kód – G2/G3 nepřepisuji)' : 'Osa X – X+ nahoru');
      renderTab();
    });
    const flipzParamBtn = tabBody.querySelector('[data-act="flipz-param"]');
    if (flipzParamBtn) flipzParamBtn.addEventListener('click', () => {
      S.flipZ = !S.flipZ;
      state.flipZ = S.flipZ;
      persistSettings();
      if (!S._cachedCalc) S._cachedCalc = calculate();
      draw(); saveState();
      showToast(S.flipZ ? 'Osa Z otočena – Z+ vlevo (ruční kód – G2/G3 nepřepisuji)' : 'Osa Z – Z+ vpravo');
      renderTab();
    });
    tabBody.querySelectorAll('[data-struct]').forEach(btn => {
      btn.addEventListener('click', () => { S.params.machineStructure = btn.dataset.struct; fullUpdate(); });
    });
    tabBody.querySelectorAll('[data-ctrl]').forEach(btn => {
      btn.addEventListener('click', () => {
        const oldCtrl = S.params.controlSystem;
        const newCtrl = btn.dataset.ctrl;
        if (newCtrl === oldCtrl) return;
        // Existující program (i ruční úpravy drah/posuvů) se převede na
        // syntaxi nového systému — hlavička/závěr se přegenerují, tělo se
        // jen převede (komentáře, CR=/R). Regenerace od nuly z kontury
        // zůstává na tlačítku "🔄 Dráhy".
        if (S.manualGCode && S.manualGCode.trim()) {
          S.manualGCode = convertGCodeControlSystem(S.manualGCode, oldCtrl, newCtrl, S.params, S.flipX, S.flipZ);
        }
        S.params.controlSystem = newCtrl;
        fullUpdate();
        const ctrlLabel = newCtrl === 'sinumerik' ? 'Sinumerik' : newCtrl === 'fanuc' ? 'Fanuc' : 'Heidenhain';
        showToast(`Program převeden na ${ctrlLabel}`);
      });
    });
    tabBody.querySelectorAll('[data-pmode]').forEach(btn => {
      btn.addEventListener('click', () => { S.params.mode = btn.dataset.pmode; fullUpdate(); });
    });
    const _apBtn = tabBody.querySelector('[data-act="toggle-auto-profile"]');
    if (_apBtn) _apBtn.addEventListener('click', () => {
      S.params.autoProfile = S.params.autoProfile === false ? true : false;
      fullUpdate();
    });
    tabBody.querySelectorAll('[data-p]').forEach(inp => {
      inp.addEventListener('change', () => applyParamChange(inp.dataset.p, inp));
    });
    wireAllAngleCompasses(tabBody);
    const matToggleBtn = tabBody.querySelector('[data-act="material-config-toggle"]');
    if (matToggleBtn) matToggleBtn.addEventListener('click', () => {
      S.materialConfigOpen = !S.materialConfigOpen;
      renderTab();
    });
    const toolToggleBtn = tabBody.querySelector('[data-act="tool-config-toggle"]');
    if (toolToggleBtn) toolToggleBtn.addEventListener('click', () => {
      S.toolConfigOpen = !S.toolConfigOpen;
      renderTab();
    });
    tabBody.querySelectorAll('[data-mat]').forEach(btn => {
      btn.addEventListener('click', () => {
        const m = MATERIALS[btn.dataset.mat];
        if (m) {
          S.selectedMaterial = btn.dataset.mat;
          S.params.speed = m.speed; S.params.feed = m.feed; S.params.depthOfCut = m.depth;
          fullUpdate();
        }
      });
    });
    tabBody.querySelectorAll('[data-rough]').forEach(btn => {
      btn.addEventListener('click', () => {
        S.params.roughingStrategy = btn.dataset.rough;
        S.params.toolAngle = btn.dataset.rough === 'face' ? -15 : 15;
        fullUpdate();
      });
    });
    tabBody.querySelectorAll('[data-side]').forEach(btn => {
      btn.addEventListener('click', () => {
        S.params.roughingSide = btn.dataset.side;
        // Strana mění znaménko Z-offsetu upichu → přegenerovat cyklus hned.
        if (S.params.partOffZ != null) _regenGCode();
        else fullUpdate();
      });
    });
    // Z-limity – numerické vstupy a tlačítka
    tabBody.querySelectorAll('[data-zlim]').forEach(inp => {
      inp.addEventListener('change', () => {
        const key = inp.dataset.zlim;
        const v = inp.value.trim();
        S.zLimits[key] = v === '' ? null : (parseFloat(v) || 0);
        // Chuck/koník ovlivňují generování drah → recalc; range slouží
        // jen jako vizuální vodítko, takže by stačil draw, ale pro
        // konzistenci děláme fullUpdate i tam.
        fullUpdate();
      });
    });
    const zlToggle = tabBody.querySelector('[data-act="zlimits-toggle"]');
    if (zlToggle) zlToggle.addEventListener('click', () => {
      // Stejné chování jako tlačítko v toolbaru.
      const tbBtn = toolbar.querySelector('[data-act="zlimits"]');
      if (tbBtn) tbBtn.click();
    });
    // Checkboxy aktivace čelistí / koníku / rozsahů
    const chuckChk = tabBody.querySelector('[data-act="chuck-active"]');
    if (chuckChk) chuckChk.addEventListener('change', () => { S.zLimits.chuckActive = chuckChk.checked; fullUpdate(); });
    const tailChk = tabBody.querySelector('[data-act="tail-active"]');
    if (tailChk) tailChk.addEventListener('change', () => { S.zLimits.tailActive = tailChk.checked; fullUpdate(); });
    const zRangeChk = tabBody.querySelector('[data-act="zrange-active"]');
    if (zRangeChk) zRangeChk.addEventListener('change', () => {
      S.zLimits.rangeActive = zRangeChk.checked;
      fullUpdate();
    });
    const xRangeChk = tabBody.querySelector('[data-act="xrange-active"]');
    if (xRangeChk) xRangeChk.addEventListener('change', () => {
      S.xLimits.active = xRangeChk.checked;
      fullUpdate();
    });
    // X-rozsah – numerické vstupy
    tabBody.querySelectorAll('[data-xlim]').forEach(inp => {
      inp.addEventListener('change', () => {
        const key = inp.dataset.xlim;
        const v = inp.value.trim();
        S.xLimits[key] = v === '' ? null : parseFloat(v);
        fullUpdate();
      });
    });
    const zlClear = tabBody.querySelector('[data-act="zlimits-clear"]');
    if (zlClear) zlClear.addEventListener('click', () => {
      S.zLimits = { chuck: null, tail: null, chuckActive: false, tailActive: false, rangeStart: null, rangeEnd: null, rangeActive: false };
      S.xLimits = { rangeXMin: null, rangeXMax: null, active: false };
      renderTab(); draw(); saveState();
    });
    tabBody.querySelectorAll('[data-tshape]').forEach(btn => {
      btn.addEventListener('click', () => applyShapeChange(btn.dataset.tshape));
    });
    const tipMirrorBtn = tabBody.querySelector('[data-act="toggle-tip-mirror"]');
    if (tipMirrorBtn) tipMirrorBtn.addEventListener('click', () => applyTipMirrorToggle());
    const finCb = tabBody.querySelector('#cam-sim-fin');
    if (finCb) finCb.addEventListener('change', () => {
      S.params.doFinishing = finCb.checked;
      // Upichnutí: dokončování přidává/ubírá dokončovací zápich → přegenerovat.
      if (S.params.partOffZ != null) _regenGCode();
      else fullUpdate();
    });
    const finOnlyCb = tabBody.querySelector('#cam-sim-finonly');
    if (finOnlyCb) finOnlyCb.addEventListener('change', () => {
      S.params.finishOnly = finOnlyCb.checked;
      fullUpdate();
    });
    const partOffSmoothCb = tabBody.querySelector('#cam-sim-partoff-smooth');
    if (partOffSmoothCb) partOffSmoothCb.addEventListener('change', () => {
      S.params.partOffSmooth = partOffSmoothCb.checked;
      // Plynule/peck mění hlavní zápichový cyklus → přegenerovat hned.
      if (S.params.partOffZ != null) _regenGCode();
      else fullUpdate();
    });
    const finSlotSel = tabBody.querySelector('#cam-sim-fin-slot');
    if (finSlotSel) finSlotSel.addEventListener('change', () => {
      S.params.finishingSlot = finSlotSel.value === '' ? null : parseInt(finSlotSel.value);
      fullUpdate();
    });
    const respCb = tabBody.querySelector('#cam-sim-respect-insert');
    if (respCb) respCb.addEventListener('change', () => { S.params.respectInsertGeometry = respCb.checked; fullUpdate(); });
    const clearInsertGuidesBtn = tabBody.querySelector('[data-act="clear-insert-guides"]');
    if (clearInsertGuidesBtn) clearInsertGuidesBtn.addEventListener('click', () => {
      const count = S.guideLines.length;
      S.guideLines = [];
      showToast(`Smazáno ${count} konstrukční čar ✓`);
      saveState(); fullUpdate();
    });
    const plungeCb = tabBody.querySelector('#cam-sim-plunge');
    if (plungeCb) plungeCb.addEventListener('change', () => { S.params.plungeRoughing = plungeCb.checked; fullUpdate(); });
    const plungeAtOnceCb = tabBody.querySelector('#cam-sim-plunge-atonce');
    if (plungeAtOnceCb) plungeAtOnceCb.addEventListener('change', () => { S.params.pocketFinishAtOnce = plungeAtOnceCb.checked; fullUpdate(); });
    const noStepCb = tabBody.querySelector('#cam-sim-nostep');
    if (noStepCb) noStepCb.addEventListener('change', () => { S.params.noStepRoughing = noStepCb.checked; fullUpdate(); });
    const noStepFaceCb = tabBody.querySelector('#cam-sim-nostep-face');
    if (noStepFaceCb) noStepFaceCb.addEventListener('change', () => { S.params.noStepRoughingFace = noStepFaceCb.checked; fullUpdate(); });
    const regionCb = tabBody.querySelector('#cam-sim-region');
    if (regionCb) regionCb.addEventListener('change', () => {
      S.params.regionRoughing = regionCb.checked;
      // Strategický přepínač → přegenerovat dráhy hned (editor + simulace),
      // ne jen překreslit náhled pasů (jinak by editor držel starý G-kód).
      _regenGCode();
      showToast(regionCb.checked ? 'Hrubování po regionech zapnuto' : 'Hrubování po regionech vypnuto');
    });
    const plungeAutoBtn = tabBody.querySelector('[data-act="plunge-auto"]');
    if (plungeAutoBtn) plungeAutoBtn.addEventListener('click', () => {
      S.params.entryAngleAuto = !S.params.entryAngleAuto;
      // Při vypnutí auta převezme pole aktuálně dopočtenou hodnotu,
      // aby šla ručně doladit od smysluplného výchozího čísla.
      if (!S.params.entryAngleAuto)
        S.params.entryAngle = getEffectivePlungeAngle({ ...S.params, entryAngleAuto: true });
      fullUpdate();
    });
    const partOffPickBtn = tabBody.querySelector('[data-act="partoff-pick"]');
    if (partOffPickBtn) partOffPickBtn.addEventListener('click', () => {
      S.partOffPickMode = !S.partOffPickMode;
      // Vzájemně se vylučuje s ostatními klikacími režimy.
      if (S.partOffPickMode) { S.profileTraceMode = false; S.addPointMode = false; S.delPointMode = false; }
      canvas.style.cursor = S.partOffPickMode ? 'crosshair' : 'crosshair';
      showToast(S.partOffPickMode ? 'Upichnutí: klikni na canvas pro Z rovinu řezu (Esc = zrušit)' : 'Výběr upichnutí zrušen');
      renderTab(); draw();
    });
    const partOffClearBtn = tabBody.querySelector('[data-act="partoff-clear"]');
    if (partOffClearBtn) partOffClearBtn.addEventListener('click', () => {
      const wasActive = S.params.partOffZ != null;
      S.params.partOffZ = null; S.partOffPickMode = false;
      showToast('Upichnutí zrušeno — zpět na zapichování/hrubování tvaru');
      if (wasActive) _regenGCode(); else { renderTab(); draw(); }
    });
    const toolLibBtn = tabBody.querySelector('[data-act="tool-library"]');
    if (toolLibBtn) toolLibBtn.addEventListener('click', () => {
      showToolLibraryDialog({
        getCurrent: () => ({
          name: S.params.toolName,
          vbdCode: S.params.toolVbdCode,
          tipRadius: S.params.toolRadius,
          toolAngle: S.params.toolAngle,
          tipAngle: S.params.toolTipAngle,
          clearanceAngle: S.params.toolClearanceAngle,
          vc: S.params.speed,
          f: S.params.feed,
          ap: S.params.depthOfCut,
        }),
        onApply: (tool) => {
          if (tool.name) S.params.toolName = tool.name;
          if (tool.vbdCode !== undefined) S.params.toolVbdCode = tool.vbdCode;
          if (tool.tipRadius !== undefined) S.params.toolRadius = tool.tipRadius;
          if (tool.toolAngle !== undefined) S.params.toolAngle = tool.toolAngle;
          if (tool.tipAngle !== undefined) S.params.toolTipAngle = tool.tipAngle;
          if (tool.clearanceAngle !== undefined) S.params.toolClearanceAngle = tool.clearanceAngle;
          if (tool.vc) S.params.speed = tool.vc;
          if (tool.f) S.params.feed = tool.f;
          if (tool.ap) S.params.depthOfCut = tool.ap;
          fullUpdate();
        },
      });
    });
    const magazineBtn = tabBody.querySelector('[data-act="open-magazine"]');
    if (magazineBtn) magazineBtn.addEventListener('click', () => showMagazineDialog());
    tabBody.querySelectorAll('[data-act="open-threads"], [data-act="thread-pick"]').forEach(btn => {
      btn.addEventListener('click', () => showThreadPickerDialog());
    });
    const threadToggleBtn = tabBody.querySelector('[data-act="thread-toggle"]');
    if (threadToggleBtn) threadToggleBtn.addEventListener('click', () => {
      S.params.threadActive = !S.params.threadActive;
      showToast(S.params.threadActive ? `Závitování ${S.params.threadName || ''} aktivní — dráhy přegenerovány` : 'Závitování vypnuto — zpět na hrubování');
      _regenGCode();
    });
    // Rychlé vypnutí závitování z varování v záložkách Hrub./Hot./Upich.
    const threadOffBtn = tabBody.querySelector('[data-act="thread-deactivate"]');
    if (threadOffBtn) threadOffBtn.addEventListener('click', () => {
      S.params.threadActive = false;
      showToast('Závitování vypnuto — zpět na hrubování');
      _regenGCode();
    });
    tabBody.querySelectorAll('[data-thinfeed]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (S.params.threadInfeed === btn.dataset.thinfeed) return;
        S.params.threadInfeed = btn.dataset.thinfeed;
        if (S.params.threadActive) _regenGCode(); else fullUpdate();
      });
    });
    tabBody.querySelectorAll('[data-thext]').forEach(btn => {
      btn.addEventListener('click', () => {
        const ext = btn.dataset.thext === '1';
        if ((S.params.threadExternal !== false) === ext) return;
        S.params.threadExternal = ext;
        // Vnější/vnitřní mění hloubku profilu (60°: 0,6134P vs 0,5413P).
        S.params.threadDepth = Math.round(threadProfileDepth(S.params.threadType, parseFloat(S.params.threadPitch) || 0, ext) * 1000) / 1000;
        if (S.params.threadActive) _regenGCode(); else fullUpdate();
      });
    });
    const toolGeomBtn = tabBody.querySelector('[data-act="open-tool-geometry"]');
    if (toolGeomBtn) toolGeomBtn.addEventListener('click', () => showToolGeometryDialog());
    const resetBtn = tabBody.querySelector('[data-act="reset"]');
    if (resetBtn) resetBtn.addEventListener('click', async () => {
      const ok = await camConfirm('Opravdu chcete resetovat CAM parametry a vymazat vygenerované dráhy? Kontura a polotovar zůstanou zachovány (lze vzít zpět tlačítkem ↩ Zpět).');
      if (ok) {
        pushHistory();
        // Parametry popisující GEOMETRII/stroj (jednotky ⌀/R, tvar a rozměry
        // polotovaru, struktura stroje) se nesmí resetovat na výchozí — jinak
        // by se stávající kontura/polotovar vykreslily špatně (např. přepnutí
        // R↔⌀ změní měřítko X, přepnutí stockMode ztratí vlastní tvar polotovaru).
        const _preserveKeys = ['mode', 'stockMode', 'stockMargin', 'stockDiameter', 'stockLength', 'stockFace', 'machineStructure', 'controlSystem'];
        const _defaults = _defaultCamParams();
        _preserveKeys.forEach(k => { _defaults[k] = S.params[k]; });
        S.params = _defaults;
        S.selectedMaterial = 'Ocel 11 373 (S235)';
        S.toolMagazine = [];
        S.activeMagazineSlot = null;
        S.guideLines = [];
        S.zLimits = { chuck: null, tail: null, chuckActive: false, tailActive: false, rangeStart: null, rangeEnd: null, rangeActive: false };
        S.showZLimits = 'off';
        S.xLimits = { rangeXMin: null, rangeXMax: null, active: false };
        S.machineConfigOpen = false;
        S.safetyConfigOpen = false;
        S.materialConfigOpen = false;
        S.toolConfigOpen = false;
        S.machiningConfigOpen = false;
        S.manualGCode = '';
        fullUpdate();
        showToast('CAM parametry resetovány — kontura a polotovar zachovány');
      }
    });
  }

  // ── thread picker dialog (🧵 Závity) ──
  // Výběr závitu z databáze (threadData.js — stejná data jako kalkulačka
  // Závity v CAD). Klik na řádek vyplní parametry operace Závit (⌀D, P,
  // hloubku H, úhel profilu) a přepne na záložku Závit.
  const THREAD_PICKER_TYPES = [
    { key: 'mc',   label: 'M hrubé',   angle: 60, data: mCoarse,    name: t => `M${t.D}` },
    { key: 'mf',   label: 'M jemné',   angle: 60, data: mFine,      name: t => `M${t.D}×${t.P}` },
    { key: 'tr',   label: 'Tr trap.',  angle: 30, data: trThreads,  name: t => `Tr${t.D}×${t.P}` },
    { key: 'g',    label: 'G (BSP)',   angle: 55, data: gThreads,   name: t => t.n },
    { key: 'bspt', label: 'BSPT kuž.', angle: 55, data: bsptThreads, name: t => t.n, taper: true },
    { key: 'npt',  label: 'NPT kuž.',  angle: 60, data: nptThreads, name: t => t.n, taper: true },
    { key: 'unc',  label: 'UNC',       angle: 60, data: uncThreads, name: t => `UNC ${t.n}` },
    { key: 'unf',  label: 'UNF',       angle: 60, data: unfThreads, name: t => `UNF ${t.n}` },
    { key: 'bsw',  label: 'BSW',       angle: 55, data: bswThreads, name: t => `BSW ${t.n}` },
    { key: 'acme', label: 'Acme',      angle: 29, data: acmeThreads, name: t => `Acme ${t.n}` },
  ];

  // Sdílené otevření VBD dekodéru s importem do S.params — volané z hlavního
  // panelu i z modalu Geometrie.
  function openVbdImportDialog() {
    openInsertCalc({
      onCamImport: (data) => {
        if (data.vbdCode) S.params.toolVbdCode = data.vbdCode;
        if (data.isRound) {
          S.params.toolShape = 'round';
        } else if (data.tipAngle !== null) {
          S.params.toolShape = 'polygon';
          S.params.toolTipAngle = data.tipAngle;
        }
        if (data.clearanceAngle !== null) S.params.toolClearanceAngle = data.clearanceAngle;
        if (data.tipRadius !== null && data.tipRadius > 0) S.params.toolRadius = data.tipRadius;
        fullUpdate();
      },
    });
    // VBD overlay (.calc-overlay, z-index 200) se otevírá pod modalem
    // Geometrie (z-index 300) → zvednout nad něj hned po vytvoření.
    setTimeout(() => {
      const vbdOvr = document.querySelector('.calc-overlay[data-type="inserts"]');
      if (vbdOvr) vbdOvr.style.zIndex = '400';
    }, 0);
  }

  // ── Modal "⚙️ Geometrie" — náhled + geometrie destičky (VBD) a držáku
  // (ISO 5608/5610). Nezávislý na hlavním panelu (může být otevřený souběžně);
  // jediný zdroj pravdy zůstává S.params, synchronizace viz toolGeomModalRefresh.
  function showToolGeometryDialog() {
    const dlg = document.createElement('div');
    dlg.className = 'input-overlay';
    dlg.style.zIndex = '300';
    document.body.appendChild(dlg);

    // Stav náhledu (zoom/posun) a aktivní pod-záložka přežívají mezi
    // re-rendery (render() vždy přepíše dlg.innerHTML) — patří proto do
    // vnějšího closure dialogu, ne do S.params (je to jen UI stav náhledu).
    let viewZoom = 1, viewPanX = 0, viewPanY = 0;
    let activeGeomTab = 'insert'; // 'insert' | 'holder'
    let isDraggingCanvas = false, dragStartX = 0, dragStartY = 0, panStartX = 0, panStartY = 0, clickMoved = false;
    // Poslední klikatelné popisky úhlů z canvasu (logické souřadnice před
    // zoom/pan), použité k umístění "hotspot" bublin přes canvas.
    let lastLabels = {};
    // Ruční kreslení obrysu držáku — drawModeActive zapíná zobrazení
    // klikatelných anchor bodů na destičce; currentDrawSide drží, která
    // strana ('sideA'/'sideB') se právě rozšiřuje (viz handleDrawCanvasClick).
    let drawModeActive = false;
    let currentDrawSide = null;
    let lastAnchorHits = [];
    // Editor tvaru držáku (z obdélníku): rectEditActive zapíná spodní klikací
    // body držáku + anchory destičky (vč. Střed R); rectMoveSel = vybraný bod
    // držáku pro přesun; chamferPickMode = čeká na klik rohu k sražení.
    let rectEditActive = false;
    let rectMoveSel = null;
    let chamferPickMode = false;
    let lastHandleHits = [];
    // Rozbalovací výpis obrysu držáku (segmenty holderProfile) — jen UI stav.
    let holderShapeInfoOpen = false;

    function closeDialog() {
      toolGeomModalRefresh = null;
      document.removeEventListener('keydown', onKeyDown);
      dlg.remove();
    }
    // Escape modal jen zavře, pokud zrovna neběží kreslení obrysu na CAD
    // plátně (modal je pak jen skrytý display:none — viz startHolderDrawOnCad
    // — a Escape má v tu chvíli zrušit KRESLENÍ, ne zahodit skrytý dialog;
    // to řeší state._toolCleanup zaregistrovaný při startu kreslení).
    function onKeyDown(e) { if (e.key === 'Escape' && !state.holderDrawMode) closeDialog(); }
    document.addEventListener('keydown', onKeyDown);
    dlg.addEventListener('click', e => { if (e.target === dlg) closeDialog(); });

    function clampZoom(z) { return Math.max(0.4, Math.min(12, z)); }
    function resetView() { viewZoom = 1; viewPanX = 0; viewPanY = 0; redrawCanvas(); }
    function zoomBy(factor, cx, cy) {
      const oldZoom = viewZoom;
      const newZoom = clampZoom(viewZoom * factor);
      viewPanX = cx - (cx - viewPanX) * (newZoom / oldZoom);
      viewPanY = cy - (cy - viewPanY) * (newZoom / oldZoom);
      viewZoom = newZoom;
      redrawCanvas();
    }

    function redrawCanvas() {
      const cv = dlg.querySelector('#tool-geom-canvas');
      if (!cv) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = cv.getBoundingClientRect();
      const cw = Math.max(Math.round(rect.width), 100), ch = Math.max(Math.round(rect.height), 120);
      if (cv.width !== cw * dpr || cv.height !== ch * dpr) {
        cv.width = cw * dpr; cv.height = ch * dpr;
      }
      const cctx = cv.getContext('2d');
      cctx.setTransform(1, 0, 0, 1, 0, 0);
      cctx.clearRect(0, 0, cv.width, cv.height);
      cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cctx.fillStyle = '#1e1e2e'; cctx.fillRect(0, 0, cw, ch);
      cctx.translate(viewPanX, viewPanY);
      cctx.scale(viewZoom, viewZoom);
      // uiScale = 1/viewZoom → čáry/markery zůstanou po zoomu konstantně tenké.
      const result = drawInsertAndHolderPreview(cctx, cw, ch, S.params,
        { showAnchors: drawModeActive || rectEditActive, activeSide: currentDrawSide, uiScale: 1 / viewZoom,
          hideHolder: activeGeomTab === 'insert',
          showHolderHandles: rectEditActive, selectedHandle: rectMoveSel });
      lastLabels = (result && result.labels) || {};
      lastAnchorHits = (result && result.anchorHits) || [];
      lastHandleHits = (result && result.handleHits) || [];
      positionTexts((result && result.texts) || []);
      positionHotspots();
    }

    // Popisky (ε, ∠, b, l1…) se kreslí jako HTML spany nad canvasem — vždy
    // ostré a KONSTANTNÍ velikosti bez ohledu na zoom (canvas text by se při
    // zoomu rozmazal). Pozice jsou v logických souř. → přepočet zoom/pan.
    function positionTexts(texts) {
      const wrap = dlg.querySelector('#tool-geom-canvas-wrap');
      if (!wrap) return;
      wrap.querySelectorAll('.geom-canvas-label').forEach(el => el.remove());
      texts.forEach(t => {
        const span = document.createElement('span');
        span.className = 'geom-canvas-label';
        const align = t.align || 'center';
        const tx = t.x * viewZoom + viewPanX, ty = t.y * viewZoom + viewPanY;
        span.textContent = t.text;
        span.style.cssText = `position:absolute;left:${tx}px;top:${ty}px;`
          + `transform:translate(${align === 'center' ? '-50%' : align === 'right' ? '-100%' : '0'},-50%);`
          + `color:${t.color};font:11px sans-serif;white-space:nowrap;pointer-events:none;text-shadow:0 0 3px #1e1e2e,0 0 3px #1e1e2e`;
        wrap.appendChild(span);
      });
    }

    // Mapa klíčů popisků → kam kliknutím přepnout a co zaostřit.
    const HOTSPOT_TARGETS = {
      tipAngle: { tab: 'insert', focusSelector: '[data-p="toolTipAngle"]' },
      toolAngle: { tab: 'insert', focusSelector: '[data-p="toolAngle"]' },
    };

    function onHotspotClick(key) {
      const target = HOTSPOT_TARGETS[key];
      if (!target) return;
      const needTabSwitch = activeGeomTab !== target.tab;
      if (needTabSwitch) { activeGeomTab = target.tab; render(); }
      setTimeout(() => {
        const el = target.focusId ? dlg.querySelector('#' + target.focusId) : dlg.querySelector(target.focusSelector);
        if (el) { el.focus(); if (el.select) el.select(); }
      }, needTabSwitch ? 30 : 0);
    }

    // Přes canvas se překreslí malé klikací bubliny na místech popisků úhlů
    // (κr, ε, natočení, γ/γf) — klik přepne na příslušnou pod-záložku a
    // zaostří odpovídající pole k úpravě.
    function positionHotspots() {
      const wrap = dlg.querySelector('#tool-geom-canvas-wrap');
      if (!wrap) return;
      wrap.querySelectorAll('.geom-hotspot').forEach(el => el.remove());
      Object.keys(lastLabels).forEach(key => {
        const pos = lastLabels[key];
        if (!pos || !HOTSPOT_TARGETS[key]) return;
        const btn = document.createElement('button');
        btn.className = 'geom-hotspot';
        btn.title = 'Klikněte pro úpravu';
        btn.style.cssText = `position:absolute;left:${pos.x * viewZoom + viewPanX - 12}px;top:${pos.y * viewZoom + viewPanY - 12}px;width:24px;height:24px;border-radius:50%;border:1px dashed rgba(137,180,250,0.65);background:rgba(137,180,250,0.14);cursor:pointer;padding:0`;
        btn.addEventListener('click', (e) => { e.stopPropagation(); onHotspotClick(key); });
        wrap.appendChild(btn);
      });
    }

    // Myš (kolečko = zoom, tažení = posun) + dotyk (tažení = posun) na canvasu.
    function attachCanvasInteractions(cv) {
      cv.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = cv.getBoundingClientRect();
        zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - rect.left, e.clientY - rect.top);
      }, { passive: false });
      cv.addEventListener('pointerdown', (e) => {
        isDraggingCanvas = true;
        clickMoved = false;
        dragStartX = e.clientX; dragStartY = e.clientY;
        panStartX = viewPanX; panStartY = viewPanY;
        cv.setPointerCapture(e.pointerId);
      });
      cv.addEventListener('pointermove', (e) => {
        if (!isDraggingCanvas) return;
        const dx = e.clientX - dragStartX, dy = e.clientY - dragStartY;
        if (Math.hypot(dx, dy) > 4) clickMoved = true;
        // V kresebním/editovacím režimu se drží krátká "mrtvá zóna" (4px), ať
        // jde odlišit klik na bod od tažení pro posun náhledu.
        if ((!drawModeActive && !rectEditActive) || clickMoved) {
          viewPanX = panStartX + dx;
          viewPanY = panStartY + dy;
          redrawCanvas();
        }
      });
      const endDrag = (e) => {
        isDraggingCanvas = false;
        if ((drawModeActive || rectEditActive) && !clickMoved && e) {
          const rect = cv.getBoundingClientRect();
          handleDrawCanvasClick(e.clientX - rect.left, e.clientY - rect.top);
        }
      };
      cv.addEventListener('pointerup', endDrag);
      cv.addEventListener('pointercancel', () => { isDraggingCanvas = false; });
      cv.addEventListener('pointerleave', () => { isDraggingCanvas = false; });
    }

    // Nejbližší zásah v poli hit bodů (screen-space po zoom/pan). Vrací {hit,dist}.
    function _nearestHit(list, cx, cy) {
      let best = null, bestDist = Infinity;
      list.forEach(a => {
        const sx = a.x * viewZoom + viewPanX, sy = a.y * viewZoom + viewPanY;
        const d = Math.hypot(cx - sx, cy - sy);
        if (d < bestDist) { bestDist = d; best = a; }
      });
      return { hit: best, dist: bestDist };
    }

    // Klik na canvas v editoru tvaru držáku (rectEditActive).
    function handleRectEditClick(cx, cy) {
      const hnd = _nearestHit(lastHandleHits, cx, cy);
      const anc = _nearestHit(lastAnchorHits, cx, cy);
      // Sražení rohu: čeká na klik rohu držáku.
      if (chamferPickMode) {
        if (hnd.hit && hnd.dist <= 16 && hnd.hit.role === 'corner') {
          const corner = { x: hnd.hit.wx, z: hnd.hit.wz };
          chamferPickMode = false;
          showChamferPopup(corner);
        } else { showToast('Klikněte na rohový bod držáku (žlutý čtvereček na kraji)'); }
        return;
      }
      // Přednost má klik na bod držáku (výběr zdroje přesunu).
      if (hnd.hit && hnd.dist <= 16 && (!anc.hit || hnd.dist <= anc.dist)) {
        rectMoveSel = { x: hnd.hit.wx, z: hnd.hit.wz };
        redrawCanvas();
        showToast('Vybráno. Klikněte na bod destičky (zelený) — držák se tam přesune.');
        return;
      }
      // Klik na anchor destičky = cíl přesunu (jen když je vybrán bod držáku).
      if (anc.hit && anc.dist <= 16) {
        if (!rectMoveSel) { showToast('Nejdřív klikněte na bod držáku (žlutý), pak na cíl na destičce.'); return; }
        const dx = anc.hit.wx - rectMoveSel.x, dz = anc.hit.wz - rectMoveSel.z;
        pushHistory();
        S.params.holderProfile = translateHolderProfile(S.params.holderProfile, dx, dz);
        rectMoveSel = null;
        fullUpdate();
        showToast('Držák přesunut ✓');
        return;
      }
      rectMoveSel = null; redrawCanvas();
    }

    // Klik na canvas v kresebním režimu — hit-test proti anchor bodům
    // (lastAnchorHits). Editor tvaru (rectEditActive) má vlastní obsluhu.
    function handleDrawCanvasClick(cx, cy) {
      if (rectEditActive) { handleRectEditClick(cx, cy); return; }
      const { hit: best, dist: bestDist } = _nearestHit(lastAnchorHits, cx, cy);
      if (!best || bestDist > 16) return;
      if (best.side === 'center') return; // Střed R není strana obrysu
      if (!S.params.holderProfile) S.params.holderProfile = { sideA: [], sideB: [] };
      const cur = S.params.holderProfile[best.side];
      if (!cur || cur.length === 0) {
        pushHistory();
        S.params.holderProfile[best.side] = [{ x: best.wx, z: best.wz }];
      }
      currentDrawSide = best.side;
      fullUpdate();
      showHolderSidePopup(best.side);
    }

    // Popup pro sražení (zkosení) vybraného rohu držáku o zadanou vzdálenost.
    function showChamferPopup(corner) {
      document.querySelector('.geom-side-popup, .geom-rotate-popup')?.remove();
      const popup = document.createElement('div');
      popup.className = 'geom-rotate-popup input-overlay';
      popup.style.zIndex = '320';
      popup.innerHTML = `<div class="input-dialog" style="min-width:220px;width:auto;padding:14px">
        <h3 style="margin:0 0 10px;font-size:14px">🔻 Srazit roh držáku</h3>
        <div class="cam-sim-row">
          <div class="cam-sim-field" style="flex:1">
            <label>Velikost sražení (mm)</label>
            <input type="number" id="geom-chamfer-size" value="${Math.max((parseFloat(S.params.holderWidth) || 20) * 0.5, 1).toFixed(1)}" step="1" min="0.1" style="width:100%">
          </div>
          <div class="cam-sim-field" style="flex:1">
            <label title="Úhel sražení vůči hraně; 45° = symetrické (stejné nohy)">Úhel (°)</label>
            <input type="number" id="geom-chamfer-angle" value="45" step="5" min="1" max="89" style="width:100%">
          </div>
        </div>
        <div style="text-align:right;margin-top:10px;display:flex;gap:8px;justify-content:flex-end">
          <button class="btn-cancel" id="geom-chamfer-cancel">Zrušit</button>
          <button class="cam-sim-btn cam-sim-btn-green" id="geom-chamfer-ok" style="width:auto;padding:4px 12px">Srazit</button>
        </div>
      </div>`;
      document.body.appendChild(popup);
      const inp = popup.querySelector('#geom-chamfer-size');
      const angInp = popup.querySelector('#geom-chamfer-angle');
      const apply = () => {
        const d = parseFloat(inp.value);
        if (!isFinite(d) || d <= 0) { showToast('Zadejte velikost sražení'); return; }
        const ang = parseFloat(angInp.value);
        pushHistory();
        S.params.holderProfile.sideA = chamferProfileCorner(S.params.holderProfile.sideA, corner, d, isFinite(ang) ? ang : 45);
        popup.remove();
        fullUpdate();
        showToast('Roh sražen ✓');
      };
      popup.querySelector('#geom-chamfer-ok').addEventListener('click', apply);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') apply(); });
      angInp.addEventListener('keydown', e => { if (e.key === 'Enter') apply(); });
      popup.querySelector('#geom-chamfer-cancel').addEventListener('click', () => popup.remove());
      popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });
      inp.focus(); inp.select();
    }

    // Sdílený wrapper — před KAŽDOU změnou z tohoto dialogu uloží historii
    // (S.past), aby šla vzít zpět tlačítkem ↩ v hlavičce dialogu.
    function withHistory(fn) { return (...args) => { pushHistory(); fn(...args); }; }

    // Malé samostatné okno pro natočení destičky (polární úhel + ✛ kompas) —
    // otevřené z Držák tabu vedle ⇄ Ruka, ať nemusí uživatel přepínat na
    // Destička tab jen kvůli změně Natočení.
    function showRotateToolPopup() {
      const existing = document.querySelector('.geom-rotate-popup');
      if (existing) { existing.remove(); return; }
      const popup = document.createElement('div');
      popup.className = 'geom-rotate-popup input-overlay';
      popup.style.zIndex = '320';
      popup.innerHTML = `<div class="input-dialog" style="min-width:220px;width:auto;padding:14px">
        <h3 style="margin:0 0 10px;font-size:14px">↻ Natočení destičky</h3>
        <div class="cam-sim-row">
          <div class="cam-sim-field" style="flex:1">
            <label>Polární úhel (°)</label>
            <div style="display:flex;gap:2px">
              <input type="number" id="geom-rotate-angle" value="${S.params.toolAngle}" style="flex:1;min-width:0">
              <button type="button" class="compass-trigger-btn" id="geom-rotate-compass" title="Rychlá volba úhlu" style="flex-shrink:0">✛</button>
            </div>
          </div>
        </div>
        <div style="text-align:right;margin-top:10px">
          <button class="btn-cancel" id="geom-rotate-close">Zavřít</button>
        </div>
      </div>`;
      document.body.appendChild(popup);
      const angInp = popup.querySelector('#geom-rotate-angle');
      angInp.addEventListener('change', withHistory(() => {
        S.params.toolAngle = parseFloat(angInp.value) || 0;
        fullUpdate();
      }));
      wireAngleCompass(popup.querySelector('#geom-rotate-compass'), angInp, () => {
        pushHistory();
        S.params.toolAngle = parseFloat(angInp.value) || 0;
        fullUpdate();
      });
      popup.querySelector('#geom-rotate-close').addEventListener('click', () => popup.remove());
      popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });
    }

    // Jako showRotateToolPopup, ale natáčí CELÝ NŮŽ (destička + držák) —
    // knifeAngle se v náhledu aplikuje na obojí najednou (viz
    // drawInsertAndHolderPreview). Otevřeno z Držák tabu.
    function showRotateKnifePopup() {
      const existing = document.querySelector('.geom-rotate-popup');
      if (existing) { existing.remove(); return; }
      const popup = document.createElement('div');
      popup.className = 'geom-rotate-popup input-overlay';
      popup.style.zIndex = '320';
      popup.innerHTML = `<div class="input-dialog" style="min-width:220px;width:auto;padding:14px">
        <h3 style="margin:0 0 10px;font-size:14px">↻ Natočení nože</h3>
        <div style="font-size:10px;color:#6c7086;margin-bottom:6px">Otočí destičku i držák najednou. Šipka míří <b>k destičce</b> (270° = destička dole, držák nahoru).</div>
        <div class="cam-sim-row">
          <div class="cam-sim-field" style="flex:1">
            <label>Směr k destičce (°)</label>
            <div style="display:flex;gap:2px">
              <input type="number" id="geom-knife-angle" value="${S.params.knifeAngle ?? 270}" style="flex:1;min-width:0">
              <button type="button" class="compass-trigger-btn" id="geom-knife-compass" title="Rychlá volba úhlu" style="flex-shrink:0">✛</button>
            </div>
          </div>
        </div>
        <div style="text-align:right;margin-top:10px">
          <button class="btn-cancel" id="geom-knife-close">Zavřít</button>
        </div>
      </div>`;
      document.body.appendChild(popup);
      const angInp = popup.querySelector('#geom-knife-angle');
      angInp.addEventListener('change', withHistory(() => {
        S.params.knifeAngle = parseFloat(angInp.value) || 0;
        fullUpdate();
      }));
      wireAngleCompass(popup.querySelector('#geom-knife-compass'), angInp, () => {
        pushHistory();
        S.params.knifeAngle = parseFloat(angInp.value) || 0;
        fullUpdate();
      });
      popup.querySelector('#geom-knife-close').addEventListener('click', () => popup.remove());
      popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });
    }

    // Popup pro přidávání bodů jedné strany obrysu držáku — Délka + Polární
    // úhel (+ ✛ kompas) od POSLEDNÍHO bodu dané strany. "Přidat bod" body
    // ukládá a popup se rovnou znovu otevře pro další segment (bez nutnosti
    // klikat na canvas znovu — jen první bod strany vzniká kliknutím na
    // anchor, viz handleDrawCanvasClick).
    function showHolderSidePopup(side) {
      const existing = document.querySelector('.geom-side-popup');
      if (existing) existing.remove();
      const pts = (S.params.holderProfile && S.params.holderProfile[side]) || [];
      const sideLabel = side === 'sideA' ? 'A' : 'B';
      const popup = document.createElement('div');
      popup.className = 'geom-side-popup input-overlay';
      popup.style.zIndex = '320';
      popup.innerHTML = `<div class="input-dialog" style="min-width:240px;width:auto;padding:14px">
        <h3 style="margin:0 0 10px;font-size:14px">✏️ Obrys držáku — strana ${sideLabel}</h3>
        <div style="font-size:11px;color:#a6adc8;margin-bottom:8px">Bodů: ${pts.length}</div>
        <div class="cam-sim-row">
          <div class="cam-sim-field"><label>Délka (mm)</label><input type="number" id="geom-side-len" step="0.5" min="0"></div>
          <div class="cam-sim-field">
            <label>Polární úhel (°)</label>
            <div style="display:flex;gap:2px">
              <input type="number" id="geom-side-ang" style="flex:1;min-width:0">
              <button type="button" class="compass-trigger-btn" id="geom-side-compass" title="Rychlá volba úhlu" style="flex-shrink:0">✛</button>
            </div>
          </div>
        </div>
        <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
          <button class="cam-sim-btn cam-sim-btn-green" id="geom-side-add" style="width:auto;padding:4px 10px;font-size:12px">➕ Přidat bod</button>
          <button class="cam-sim-btn cam-sim-btn-gray" id="geom-side-undo" style="width:auto;padding:4px 10px;font-size:12px" ${pts.length <= 1 ? 'disabled' : ''}>↩ Zpět o bod</button>
          <button class="cam-sim-btn cam-sim-btn-gray" id="geom-side-clear" style="width:auto;padding:4px 10px;font-size:12px">🗑 Zrušit stranu</button>
        </div>
        <div style="text-align:right;margin-top:10px">
          <button class="btn-cancel" id="geom-side-done">✔ Dokončit stranu</button>
        </div>
      </div>`;
      document.body.appendChild(popup);

      const lenInp = popup.querySelector('#geom-side-len');
      const angInp = popup.querySelector('#geom-side-ang');
      wireAngleCompass(popup.querySelector('#geom-side-compass'), angInp);

      function addPoint() {
        const len = parseFloat(lenInp.value);
        const ang = parseFloat(angInp.value);
        if (!isFinite(len) || len <= 0 || !isFinite(ang)) { showToast('Zadejte délku a úhel'); return; }
        const cur = S.params.holderProfile[side];
        const last = cur[cur.length - 1];
        const rad = ang * Math.PI / 180;
        pushHistory();
        cur.push({ x: last.x + Math.cos(rad) * len, z: last.z + Math.sin(rad) * len });
        fullUpdate();
        popup.remove();
        showHolderSidePopup(side);
      }
      popup.querySelector('#geom-side-add').addEventListener('click', addPoint);
      [lenInp, angInp].forEach(inp => inp.addEventListener('keydown', e => { if (e.key === 'Enter') addPoint(); }));

      popup.querySelector('#geom-side-undo').addEventListener('click', () => {
        const cur = S.params.holderProfile[side];
        if (cur.length <= 1) return; // anchor bod (první) se nemaže — "Zrušit stranu" místo toho
        pushHistory();
        cur.pop();
        fullUpdate();
        popup.remove();
        showHolderSidePopup(side);
      });
      popup.querySelector('#geom-side-clear').addEventListener('click', () => {
        pushHistory();
        S.params.holderProfile[side] = [];
        currentDrawSide = null;
        fullUpdate();
        popup.remove();
        redrawCanvas();
      });
      const finishSide = () => { currentDrawSide = null; popup.remove(); redrawCanvas(); };
      popup.querySelector('#geom-side-done').addEventListener('click', finishSide);
      popup.addEventListener('click', e => { if (e.target === popup) finishSide(); });
      lenInp.focus();
    }

    // ── „📐 Kreslit držák na CAD plátně" — plnohodnotné CAD kreslení ────
    // Na rozdíl od zahozeného prvního pokusu (overlay-vodítko v render.js) se
    // destička vygeneruje jako REÁLNÉ zamčené CAD objekty (jde na ně snapovat)
    // a držák se kreslí běžnými CAD nástroji. Režim drží state.holderDrawMode
    // a PŘEŽÍVÁ přepnutí nástroje (není svázán se state._toolCleanup). Ruší se
    // jen dolní lištou ✕ Zrušit / ✓ Potvrdit (bridge.confirm/cancelHolderDraw).

    // Mapování profil destičky {x,z} (0,0 = špička, +z do držáku) ↔ CAD svět.
    // holderProfile je JEN pro náhled (drawInsertAndHolderPreview): toScr kreslí
    // x vodorovně, +z SVISLE NAHORU (do držáku). Aby to, co uživatel nakreslí
    // na CAD plátně, vypadalo v náhledu STEJNĚ orientované, musí obrazovkové
    // „nahoru" (CAD wy) = profil z, a obrazovkové „vodorovně" (CAD wx) = profil x.
    // (Nezávisí na machineType — obrazovková orientace je stejná pro soustruh
    // i karusel; dřívější prohození os kreslilo držák naležato místo nastojato.)
    function profToWorld(px, pz) { return { x: px, y: pz }; }
    function worldToProf(wx, wy) { return { x: wx, z: wy }; }

    // Obrys destičky v profilu {x,z} (z nahoru). STEJNÁ matematika jako
    // getInsertAnchorPoints/drawInsertAndHolderPreview (canvas y dolů → z=-y),
    // aby nakreslená destička v CADu ležela přesně tam, kde ji čeká náhled →
    // zpětně sejmutý obrys držáku pak v náhledu sedí kolem destičky.
    function buildInsertProfileSegments(prms) {
      const shape = prms.toolShape;
      const R = Math.max(parseFloat(prms.toolRadius) || 0.8, 0.05);
      const segs = [];
      if (shape === 'round') {
        segs.push({ type: 'circle', cx: 0, cz: 0, r: R });
        return segs;
      }
      if (shape === 'polygon') {
        const tipAng = (parseFloat(prms.toolTipAngle) || 90) * Math.PI / 180;
        const rotRad = -(parseFloat(prms.toolAngle) || 0) * Math.PI / 180;
        const toolLen = Math.max(parseFloat(prms.toolLength) || 10, 1);
        const a1 = rotRad, a2 = rotRad - tipAng * (prms.toolTipMirror ? -1 : 1);
        const distToCorner = R / Math.sin(tipAng / 2);
        const bis = (a1 + a2) / 2;
        const cX = Math.cos(bis + Math.PI) * distToCorner;
        const cY = Math.sin(bis + Math.PI) * distToCorner;
        const tanLen = Math.min(R / Math.tan(tipAng / 2), toolLen * 0.99);
        const P = (ang, len) => ({ x: cX + Math.cos(ang) * len, z: -(cY + Math.sin(ang) * len) });
        const t1 = P(a1, tanLen), t2 = P(a2, tanLen);
        const farA = P(a1, toolLen), farB = P(a2, toolLen);
        segs.push({ type: 'line', from: t1, to: farA });
        segs.push({ type: 'line', from: farA, to: farB });
        segs.push({ type: 'line', from: farB, to: t2 });
        segs.push({ type: 'arc', cx: 0, cz: 0, r: R, from: t2, to: t1 });
        return segs;
      }
      if (shape === 'parting') {
        // Upichovák: od radiusu (levý roh) k hraně; pravá strana bez radiusu.
        const toolLen = Math.max(parseFloat(prms.toolLength) || 5, 1);
        const rotRad = -(parseFloat(prms.toolAngle) || 0) * Math.PI / 180;
        const r = Math.min(R, toolLen / 2);
        const w2 = toolLen - 2 * r;
        const bodyH = Math.max(toolLen * 0.6, r + PARTING_BODY_MIN_H_MM);
        const rot = (x, y) => ({
          x: x * Math.cos(rotRad) - y * Math.sin(rotRad),
          z: -(x * Math.sin(rotRad) + y * Math.cos(rotRad)),
        });
        const pTopL = rot(-r, r - bodyH);
        const pBotL = rot(-r, 0);
        const pTopArcL = rot(0, r);
        const pFlatEnd = rot(w2, r);
        const pTopR = rot(w2 + r, r - bodyH);
        segs.push({ type: 'line', from: pTopL, to: pBotL });
        segs.push({ type: 'arc', cx: rot(0, 0).x, cz: rot(0, 0).z, r, from: pBotL, to: pTopArcL });
        segs.push({ type: 'line', from: pTopArcL, to: pFlatEnd });
        segs.push({ type: 'arc', cx: rot(w2, 0).x, cz: rot(w2, 0).z, r, from: pFlatEnd, to: pTopR });
        segs.push({ type: 'line', from: pTopR, to: pTopL });
        return segs;
      }
      return segs;
    }

    // Převede profil-segmenty na reálné CAD objekty (červené, zamčené, na
    // vrstvě Plátek). isToolInsert = per-objekt výjimka pro snap (viz snapPt) —
    // na zamčenou vrstvu se normálně nesnapuje, na destičku ano.
    function buildInsertObjects(prms, layerId) {
      const RED = '#f38ba8';
      const segs = buildInsertProfileSegments(prms);
      const objs = [];
      for (const s of segs) {
        if (s.type === 'circle') {
          const c = profToWorld(s.cx, s.cz);
          objs.push({ type: 'circle', cx: c.x, cy: c.y, r: s.r });
        } else if (s.type === 'line') {
          const p1 = profToWorld(s.from.x, s.from.z), p2 = profToWorld(s.to.x, s.to.z);
          objs.push({ type: 'line', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
        } else if (s.type === 'arc') {
          const c = profToWorld(s.cx, s.cz);
          const wf = profToWorld(s.from.x, s.from.z), wt = profToWorld(s.to.x, s.to.z);
          const startAngle = Math.atan2(wf.y - c.y, wf.x - c.x);
          const endAngle = Math.atan2(wt.y - c.y, wt.x - c.x);
          let d = endAngle - startAngle;
          while (d <= -Math.PI) d += 2 * Math.PI;
          while (d > Math.PI) d -= 2 * Math.PI;
          objs.push({ type: 'arc', cx: c.x, cy: c.y, r: s.r, startAngle, endAngle, ccw: d >= 0 });
        }
      }
      objs.forEach(o => {
        o.id = state.nextId++;
        o.layer = layerId;
        o.color = RED;
        o.isToolInsert = true;
        o.locked = true;
        o.name = (o.type === 'circle' ? 'Destička ⌀' : o.type === 'arc' ? 'Destička ⌒' : 'Destička —') + ` ${o.id}`;
      });
      return objs;
    }

    // Znovu vytvoří DŘÍVE uložený obrys držáku jako NORMÁLNÍ (editovatelné,
    // odemčené) úsečky na vrstvě Držák — aby šel při opětovném „📐 Kreslit na
    // CAD plátně" dokreslit/upravit, ne kreslit od nuly. profToWorld je inverzí
    // worldToProf použitého při snímání (captureHolderProfile).
    function buildHolderObjectsFromProfile(profile, layerId) {
      if (!profile) return [];
      const objs = [];
      ['sideA', 'sideB'].forEach(key => {
        const pts = profile[key];
        if (!pts || pts.length < 2) return;
        for (let i = 0; i < pts.length - 1; i++) {
          const w1 = profToWorld(pts[i].x, pts[i].z);
          const w2 = profToWorld(pts[i + 1].x, pts[i + 1].z);
          objs.push({ type: 'line', x1: w1.x, y1: w1.y, x2: w2.x, y2: w2.y });
        }
      });
      objs.forEach(o => {
        o.id = state.nextId++;
        o.layer = layerId; // odemčená vrstva Držák → jde editovat/mazat/snapovat
        o.name = `Držák ${o.id}`;
      });
      return objs;
    }

    // ── Zřetězení nakreslených objektů držáku do posloupnosti world bodů ──
    function _objChainPoints(o) {
      if (o.type === 'line') {
        const pts = [{ x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 }];
        return { pts };
      }
      if (o.type === 'arc') {
        let d = o.endAngle - o.startAngle;
        if (o.ccw) { while (d < 0) d += 2 * Math.PI; } else { while (d > 0) d -= 2 * Math.PI; if (d === 0) d = -2 * Math.PI; }
        const n = 10, pts = [];
        for (let i = 0; i <= n; i++) {
          const a = o.startAngle + d * i / n;
          pts.push({ x: o.cx + o.r * Math.cos(a), y: o.cy + o.r * Math.sin(a) });
        }
        return { pts };
      }
      if (o.type === 'polyline') {
        return { pts: o.vertices.map(v => ({ x: v.x, y: v.y })) };
      }
      return null;
    }

    function chainHolderPoints(objs) {
      const segs = objs.map(_objChainPoints).filter(Boolean);
      if (!segs.length) return null;
      const TOL = 0.05; // mm
      const near = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) <= TOL;
      const used = new Array(segs.length).fill(false);
      used[0] = true;
      let chain = segs[0].pts.slice();
      let changed = true;
      while (changed) {
        changed = false;
        for (let i = 0; i < segs.length; i++) {
          if (used[i]) continue;
          const pts = segs[i].pts;
          const a = pts[0], b = pts[pts.length - 1];
          const head = chain[0], tail = chain[chain.length - 1];
          if (near(tail, a)) { chain = chain.concat(pts.slice(1)); used[i] = true; changed = true; }
          else if (near(tail, b)) { chain = chain.concat(pts.slice().reverse().slice(1)); used[i] = true; changed = true; }
          else if (near(head, b)) { chain = pts.slice(0, -1).concat(chain); used[i] = true; changed = true; }
          else if (near(head, a)) { chain = pts.slice().reverse().slice(0, -1).concat(chain); used[i] = true; changed = true; }
        }
      }
      return chain;
    }

    // Sejme obrys držáku z vrstvy Držák → holderProfile {sideA, sideB}.
    // Vrací null, když není co uložit. Rozlišuje režim A (uzavřený obrys) a
    // režim B (otevřené dvě strany → auto-doplnění 45° dle l1/tloušťky).
    function captureHolderProfile(mode) {
      const holderObjs = state.objects.filter(o => o.layer === mode.holderLayerId
        && (o.type === 'line' || o.type === 'arc' || o.type === 'polyline'));
      if (holderObjs.length === 0) return null;
      const chain = chainHolderPoints(holderObjs);
      if (!chain || chain.length < 2) return null;
      const TOL = 0.05;
      const closed = Math.hypot(chain[0].x - chain[chain.length - 1].x, chain[0].y - chain[chain.length - 1].y) <= TOL;
      const prof = chain.map(p => worldToProf(p.x, p.y));
      if (closed) {
        // Režim A — uzavřený obrys je přímo profil.
        return { sideA: prof, sideB: [] };
      }
      // Otevřený obrys: auto-doplnit 45° (režim B) jen když je zaškrtnuto
      // „Auto-doplnit držák"; jinak uložit přesně nakreslený (otevřený) tvar.
      if (S.params.holderAutoComplete === false) {
        return { sideA: prof, sideB: [] };
      }
      return completeTwoSidedProfile(prof, mode);
    }

    // Režim B: z otevřeného profilu {x,z}[] auto-doplní konec pod 45° tak, aby
    // se uzavřel na požadovanou tloušťku držáku, l1 dle nejvzdálenějšího bodu.
    // Upravovaný konec (dál od středu) dán mode.editSide ('A' = první bod,
    // 'B' = poslední bod); přepínač strany viz tlačítko v dolní liště.
    function completeTwoSidedProfile(prof, mode) {
      if (prof.length < 2) return { sideA: prof, sideB: [] };
      const l1 = Math.max(parseFloat(S.params.holderLength) || 0, 0);
      const thick = Math.max(parseFloat(S.params.holderWidth) || 0, 0.1);
      const pts = prof.slice();
      // Který konec je „dál od středu" (větší |x| v profilu) — ten se upravuje,
      // pokud uživatel ručně nepřepnul stranu.
      const first = pts[0], last = pts[pts.length - 1];
      const editLast = mode.editSide === 'B'
        ? true
        : mode.editSide === 'A'
          ? false
          : Math.abs(last.x) >= Math.abs(first.x);
      const anchor = editLast ? pts[0] : pts[pts.length - 1];
      const moving = editLast ? last : first;
      // Cílová tloušťka = rozteč obou konců v ose z; 45° hrana z pohyblivého
      // konce směrem k dosažení tloušťky, pak uzavření zpět k anchoru.
      const targetZ = anchor.z + (moving.z >= anchor.z ? thick : -thick);
      const dz = targetZ - moving.z;
      const corner = { x: moving.x + Math.sign(dz || 1) * Math.abs(dz), z: targetZ }; // 45°
      const closeX = l1 > 0 ? (moving.x >= 0 ? l1 : -l1) : corner.x;
      const endPt = { x: closeX, z: targetZ };
      const closed = editLast
        ? [...pts, corner, endPt, { x: closeX, z: anchor.z }, anchor]
        : [anchor, { x: closeX, z: anchor.z }, endPt, corner, ...pts];
      return { sideA: closed, sideB: [] };
    }

    // Záloha CAD před vstupem do režimu (obnoví se při ✕ i ✓).
    function backupCad() {
      return {
        objects: state.objects, layers: state.layers, activeLayer: state.activeLayer,
        nextLayerId: state.nextLayerId, nextId: state.nextId,
        zoom: state.zoom, panX: state.panX, panY: state.panY, tool: state.tool,
        undoStack: state.undoStack, redoStack: state.redoStack, manualGCode: S.manualGCode,
      };
    }
    function restoreCad(b) {
      state.objects = b.objects; state.layers = b.layers; state.activeLayer = b.activeLayer;
      state.nextLayerId = b.nextLayerId; state.nextId = b.nextId;
      state.zoom = b.zoom; state.panX = b.panX; state.panY = b.panY;
      state.undoStack = b.undoStack; state.redoStack = b.redoStack;
      state.selected = null; state.multiSelected.clear(); state.selectedPoint = null;
    }

    function startHolderCadDraw() {
      if (state.holderDrawMode) { showToast('Kreslení držáku už běží'); return; }
      const prms = S.params;
      const backup = backupCad();
      const plateLayerId = 0, holderLayerId = 1;
      state.objects = [];
      state.selected = null; state.multiSelected.clear(); state.selectedPoint = null;
      state.undoStack = []; state.redoStack = [];
      state.layers = [
        { id: plateLayerId, name: 'Plátek', color: '#f38ba8', visible: true, locked: true },
        { id: holderLayerId, name: 'Držák', color: '#89b4fa', visible: true, locked: false },
      ];
      state.activeLayer = holderLayerId;
      state.nextLayerId = 2;
      const insertObjs = buildInsertObjects(prms, plateLayerId);
      state.objects.push(...insertObjs);
      // Dřív uložený obrys držáku znovu vygenerovat jako editovatelné úsečky,
      // aby šel dokreslit/upravit (ne kreslit od nuly).
      const holderObjs = buildHolderObjectsFromProfile(prms.holderProfile, holderLayerId);
      state.objects.push(...holderObjs);
      const hadHolder = holderObjs.length > 0;
      state.holderDrawMode = {
        backup, insertIds: insertObjs.map(o => o.id),
        plateLayerId, holderLayerId, editSide: 'auto',
      };
      overlay.style.display = 'none';
      dlg.style.display = 'none';
      // openCamSimulator schoval pravý panel (#sidebar) — pro kreslení držáku
      // ho zase ukázat, ať jsou vidět a přepínatelné vrstvy Plátek/Držák.
      // Musí být PŘED resizeCanvases(), aby canvas počítal se šířkou panelu.
      const sidebarEl = document.getElementById('sidebar');
      if (sidebarEl) sidebarEl.style.display = '';
      setTool('line');
      resizeCanvases();
      // Rozsah pohledu ať pokryje i (případný) načtený obrys držáku.
      let holderExtent = 0;
      const prof = prms.holderProfile;
      if (prof) [...(prof.sideA || []), ...(prof.sideB || [])].forEach(p =>
        { holderExtent = Math.max(holderExtent, Math.abs(p.x), Math.abs(p.z)); });
      const span = Math.max((parseFloat(prms.toolLength) || 10) * 4, (parseFloat(prms.toolRadius) || 1) * 8,
        (parseFloat(prms.holderWidth) || 20) * 3, holderExtent * 2.2, 40);
      centerViewOn(0, 0, span);
      calculateAllIntersections();
      updateObjectList();
      updateLayerList();
      renderAll();
      if (bridge.updateHolderDrawButtons) bridge.updateHolderDrawButtons();
      showToast(hadHolder
        ? 'Držák načten pro úpravu (vrstva Držák), pak dole ✓ Potvrdit'
        : 'Nakreslete držák (vrstva Držák) kolem destičky, pak dole ✓ Potvrdit');
    }

    function finishHolderCadDraw(result) {
      const mode = state.holderDrawMode;
      if (!mode) return;
      if (result) S.params.holderProfile = result;
      restoreCad(mode.backup);
      const prevTool = mode.backup.tool;
      state.holderDrawMode = null;
      setTool(prevTool || 'select');
      // Zpět do CAM: pravý panel zase schovat (CAM overlay ho stejně překryje,
      // ale ať je stav konzistentní s openCamSimulator).
      const sidebarEl = document.getElementById('sidebar');
      if (sidebarEl) sidebarEl.style.display = 'none';
      calculateAllIntersections();
      updateObjectList();
      updateLayerList();
      resizeCanvases();
      renderAll();
      if (bridge.updateHolderDrawButtons) bridge.updateHolderDrawButtons();
      overlay.style.display = '';
      dlg.style.display = '';
      activeGeomTab = 'holder';
      if (toolGeomModalRefresh) toolGeomModalRefresh();
      showToast(result ? 'Obrys držáku uložen 📐' : 'Kreslení držáku zrušeno');
    }

    bridge.confirmHolderDraw = () => {
      const mode = state.holderDrawMode;
      if (!mode) return;
      const res = captureHolderProfile(mode);
      if (!res) { showToast('Nakreslete držák (aspoň jednu úsečku na vrstvě Držák)'); return; }
      finishHolderCadDraw(res);
    };
    bridge.cancelHolderDraw = () => finishHolderCadDraw(null);
    // Přepínač upravované strany pro režim B (dolní lišta / holder tab).
    bridge.toggleHolderDrawSide = () => {
      const mode = state.holderDrawMode;
      if (!mode) return;
      mode.editSide = mode.editSide === 'A' ? 'B' : mode.editSide === 'B' ? 'auto' : 'A';
      showToast(`Upravovaná strana: ${mode.editSide === 'auto' ? 'auto (dál od středu)' : mode.editSide}`);
    };

    function render() {
      const prms = S.params;

      dlg.innerHTML = `
        <div class="input-dialog" style="min-width:320px;max-width:520px;width:100%;max-height:92vh;display:flex;flex-direction:column;padding:14px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <h3 style="margin:0">⚙️ Geometrie nástroje</h3>
            <div style="display:flex;gap:4px">
              <button data-act="geom-undo" class="cam-sim-btn cam-sim-btn-gray" style="width:auto;padding:2px 9px;font-size:13px" title="Zpět" ${S.past.length === 0 ? 'disabled' : ''}>↩</button>
              <button data-act="geom-redo" class="cam-sim-btn cam-sim-btn-gray" style="width:auto;padding:2px 9px;font-size:13px" title="Vpřed" ${S.future.length === 0 ? 'disabled' : ''}>↪</button>
            </div>
          </div>
          <div id="tool-geom-canvas-wrap" style="position:relative;flex-shrink:0;overflow:hidden">
            <canvas id="tool-geom-canvas" style="width:100%;height:300px;min-height:240px;display:block;border-radius:6px;border:1px solid #313244;touch-action:none;cursor:grab" title="Kolečko = zoom, tažení = posun"></canvas>
            <div style="position:absolute;top:6px;right:6px;display:flex;flex-direction:column;gap:3px">
              <button data-act="geom-zoom-in" class="cam-sim-btn cam-sim-btn-gray" style="width:24px;height:24px;padding:0;font-size:13px" title="Přiblížit">＋</button>
              <button data-act="geom-zoom-out" class="cam-sim-btn cam-sim-btn-gray" style="width:24px;height:24px;padding:0;font-size:13px" title="Oddálit">－</button>
              <button data-act="geom-zoom-reset" class="cam-sim-btn cam-sim-btn-gray" style="width:24px;height:24px;padding:0;font-size:11px" title="Obnovit náhled">⟲</button>
            </div>
          </div>
          <div class="cam-sim-row" style="margin:10px 0 0">
            <button data-act="geom-tab-insert" class="cam-sim-btn ${activeGeomTab === 'insert' ? 'cam-sim-btn-green' : 'cam-sim-btn-gray'}" style="flex:1">🔩 Destička</button>
            <button data-act="geom-tab-holder" class="cam-sim-btn ${activeGeomTab === 'holder' ? 'cam-sim-btn-green' : 'cam-sim-btn-gray'}" style="flex:1">🗜 Držák</button>
          </div>
          <div style="flex:1;overflow-y:auto;min-height:0;margin-top:8px">
            <div style="display:${activeGeomTab === 'insert' ? '' : 'none'}">
              <div class="cam-sim-row">
                <button data-act="geom-open-vbd" class="cam-sim-btn cam-sim-btn-gray" style="width:auto;display:inline-flex;padding:2px 8px;font-size:11px">🔩 VBD dekodér</button>
              </div>
              <div class="cam-sim-row">
                <div class="cam-sim-field" style="flex:2"><label>VBD kód</label><input type="text" data-p="toolVbdCode" value="${prms.toolVbdCode || ''}" placeholder="CNMG120408-PM" style="font-family:monospace;text-transform:uppercase" maxlength="20" spellcheck="false" autocomplete="off"></div>
              </div>
              ${_renderInsertShapeFieldsHTML(prms)}
              <div class="cam-sim-row">
                <button data-act="geom-open-rotate-insert" class="cam-sim-btn cam-sim-btn-gray" style="width:auto;display:inline-flex;padding:3px 8px;font-size:11px" title="Natočení jen destičky (polární úhel)">↻ Natočení destičky (${prms.toolAngle}°)</button>
              </div>
            </div>
            <div style="display:${activeGeomTab === 'holder' ? '' : 'none'}">
              <div class="cam-sim-row">
                <button data-act="geom-open-magazine" class="cam-sim-btn cam-sim-btn-gray" style="width:auto;display:inline-flex;padding:2px 8px;font-size:11px" title="Otevřít zásobník nástrojů">🔧 Zásobník</button>
                <button data-act="geom-save-magazine" class="cam-sim-btn cam-sim-btn-gray" style="width:auto;display:inline-flex;padding:2px 8px;font-size:11px" title="Uloží aktuální destičku i držák jako nový nůž v zásobníku pro pozdější použití">💾 Uložit do zásobníku</button>
              </div>
              <div class="cam-sim-row">
                <button data-act="geom-toggle-hand" class="cam-sim-btn cam-sim-btn-gray" style="width:auto;display:inline-flex;padding:3px 8px;font-size:11px" title="Ruka držáku — při otevření odvozena ze směru hrubování, zde lze přepnout ručně">⇄ Ruka: ${prms.holderHand === 'L' ? 'Levá (L)' : 'Pravá (R)'}</button>
                <button data-act="geom-open-rotate-knife" class="cam-sim-btn cam-sim-btn-gray" style="width:auto;display:inline-flex;padding:3px 8px;font-size:11px" title="Natočení celého nože (destička i držák). Šipka ukazuje směrem k destičce. 270° = destička dole / držák nahoru.">↻ Natočení nože (${prms.knifeAngle ?? 270}°)</button>
              </div>
              <div class="cam-sim-row" style="align-items:center">
                <label style="display:inline-flex;align-items:center;gap:6px;font-size:11px;cursor:pointer;flex:0 0 auto" title="Když nakreslíte na CAD plátně jen dvě strany (otevřený obrys), auto-doplní se pod 45° podle Délky a Tloušťky. Vypnuto = uloží se přesně nakreslený tvar.">
                  <input type="checkbox" id="geom-holder-autocomplete" ${prms.holderAutoComplete !== false ? 'checked' : ''}>
                  Auto
                </label>
                <div class="cam-sim-field"><label title="Funkční délka l1 — stejné pole jako Délka držáku dole v panelu Nástroj">Délka držáku (l1)</label><input type="number" step="10" min="0" data-p="holderLength" value="${prms.holderLength ?? 200}"></div>
                <div class="cam-sim-field"><label title="Tloušťka (šířka v ose Z) držáku plátku — používá se pro hlídání geometrie destičky">Tloušťka držáku</label><input type="number" step="1" min="0" data-p="holderWidth" value="${prms.holderWidth ?? 20}"></div>
              </div>
              <div class="cam-sim-row">
                <button data-act="geom-toggle-shape-info" class="cam-sim-btn cam-sim-btn-gray" style="width:auto;display:inline-flex;padding:3px 8px;font-size:11px" title="Vypíše obrys držáku bod po bodu (délka + úhel každého úseku) — stejná data jako 📐 Kreslit na CAD plátně / 🔧 Upravit obdélník">${holderShapeInfoOpen ? '▾' : '▸'} Tvar držáku${holderProfileSegCount(prms.holderProfile) > 0 ? ` (${holderProfileSegCount(prms.holderProfile)} úseků)` : ''}</button>
              </div>
              ${holderShapeInfoOpen ? `<div style="border:1px solid #313244;border-radius:6px;padding:4px 2px;margin:0 0 8px;overflow-x:auto">${holderShapeInfoHTML(prms)}</div>` : ''}
              ${(() => {
                const anchorsSupported = prms.toolShape === 'round' || prms.toolShape === 'polygon';
                const prof = prms.holderProfile;
                const hasProfileNow = !!(prof && ((prof.sideA && prof.sideA.length) || (prof.sideB && prof.sideB.length)));
                return `<div style="font-size:10px;color:#6c7086;margin:6px 0 4px">Vlastní obrys — klikněte na zvýrazněný bod na destičce v náhledu, pak zadejte délku a úhel jednotlivých úseček:</div>
                <div class="cam-sim-row">
                  <button data-act="geom-toggle-draw" class="cam-sim-btn ${drawModeActive ? 'cam-sim-btn-green' : 'cam-sim-btn-gray'}" style="width:auto;display:inline-flex;padding:3px 8px;font-size:11px" ${anchorsSupported ? '' : 'disabled'} title="${anchorsSupported ? 'Klikněte na zvýrazněný bod na destičce v náhledu nahoře' : 'Ruční obrys je zatím podporovaný jen pro kulatou a čtyřstrannou destičku'}">✏️ Kreslit obrys${drawModeActive ? ' (aktivní)' : ''}</button>
                  ${hasProfileNow ? `<button data-act="geom-clear-profile" class="cam-sim-btn cam-sim-btn-gray" style="width:auto;display:inline-flex;padding:3px 8px;font-size:11px">🗑 Smazat obrys</button>` : ''}
                </div>
                <div class="cam-sim-row">
                  <button data-act="geom-draw-on-cad" class="cam-sim-btn cam-sim-btn-gray" style="width:auto;display:inline-flex;padding:3px 8px;font-size:11px" title="Vyčistí CAD plátno (se zálohou), vygeneruje destičku jako zamčenou geometrii a nechá vás nakreslit držák běžnými CAD nástroji. Dole ✓ Potvrdit / ✕ Zrušit.">📐 Kreslit na CAD plátně</button>
                </div>
                <div style="font-size:10px;color:#6c7086;margin:8px 0 4px">Úprava obdélníku držáku přímo v náhledu — přesuň roh na bod destičky (vč. 🎯 Střed R) a sraž druhý roh:</div>
                <div class="cam-sim-row">
                  <button data-act="geom-rect-edit" class="cam-sim-btn ${rectEditActive ? 'cam-sim-btn-green' : 'cam-sim-btn-gray'}" style="width:auto;display:inline-flex;padding:3px 8px;font-size:11px" title="Zobrazí obdélník držáku se 3 body na spodní hraně (2 rohy + střed) a body destičky. Klik na bod držáku → klik na bod destičky = přesun.">🔧 Upravit obdélník${rectEditActive ? ' (aktivní)' : ''}</button>
                  ${rectEditActive ? `
                  <button data-act="geom-rect-chamfer" class="cam-sim-btn ${chamferPickMode ? 'cam-sim-btn-green' : 'cam-sim-btn-gray'}" style="width:auto;display:inline-flex;padding:3px 8px;font-size:11px" title="Klikněte, pak vyberte rohový bod držáku ke sražení">🔻 Srazit roh${chamferPickMode ? ' (vyberte roh)' : ''}</button>
                  <button data-act="geom-rect-reset" class="cam-sim-btn cam-sim-btn-gray" style="width:auto;display:inline-flex;padding:3px 8px;font-size:11px" title="Vymaže úpravy a vrátí čistý obdélník podle Délky a Tloušťky">🗑 Vymazat</button>` : ''}
                </div>`;
              })()}
            </div>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;border-top:1px solid #313244;padding-top:10px;flex-shrink:0">
            <button class="btn-cancel" id="geom-dlg-close">Zavřít</button>
          </div>
        </div>`;

      dlg.querySelector('#geom-dlg-close').addEventListener('click', closeDialog);

      const undoBtn = dlg.querySelector('[data-act="geom-undo"]');
      if (undoBtn) undoBtn.addEventListener('click', () => undo());
      const redoBtn = dlg.querySelector('[data-act="geom-redo"]');
      if (redoBtn) redoBtn.addEventListener('click', () => redo());

      // Přepínač pod-záložek Destička/Držák — jen lokální UI stav, bez historie.
      const tabInsertBtn = dlg.querySelector('[data-act="geom-tab-insert"]');
      if (tabInsertBtn) tabInsertBtn.addEventListener('click', () => { activeGeomTab = 'insert'; render(); });
      const tabHolderBtn = dlg.querySelector('[data-act="geom-tab-holder"]');
      if (tabHolderBtn) tabHolderBtn.addEventListener('click', () => { activeGeomTab = 'holder'; render(); });

      dlg.querySelectorAll('[data-p]').forEach(inp => {
        inp.addEventListener('change', withHistory(() => applyParamChange(inp.dataset.p, inp)));
      });
      wireAllAngleCompasses(dlg);
      const tipMirrorBtn = dlg.querySelector('[data-act="toggle-tip-mirror"]');
      if (tipMirrorBtn) tipMirrorBtn.addEventListener('click', withHistory(() => applyTipMirrorToggle()));
      dlg.querySelectorAll('[data-tshape]').forEach(btn => {
        btn.addEventListener('click', withHistory(() => applyShapeChange(btn.dataset.tshape)));
      });
      const geomVbdBtn = dlg.querySelector('[data-act="geom-open-vbd"]');
      if (geomVbdBtn) geomVbdBtn.addEventListener('click', () => openVbdImportDialog());
      const geomOpenMagBtn = dlg.querySelector('[data-act="geom-open-magazine"]');
      if (geomOpenMagBtn) geomOpenMagBtn.addEventListener('click', () => showMagazineDialog());
      const geomSaveMagBtn = dlg.querySelector('[data-act="geom-save-magazine"]');
      if (geomSaveMagBtn) geomSaveMagBtn.addEventListener('click', () => saveCurrentToolToMagazine());
      const toggleShapeInfoBtn = dlg.querySelector('[data-act="geom-toggle-shape-info"]');
      if (toggleShapeInfoBtn) toggleShapeInfoBtn.addEventListener('click', () => { holderShapeInfoOpen = !holderShapeInfoOpen; render(); });
      const toggleHandBtn = dlg.querySelector('[data-act="geom-toggle-hand"]');
      if (toggleHandBtn) toggleHandBtn.addEventListener('click', withHistory(() => {
        S.params.holderHand = S.params.holderHand === 'L' ? 'R' : 'L';
        fullUpdate();
      }));
      const openRotateInsertBtn = dlg.querySelector('[data-act="geom-open-rotate-insert"]');
      if (openRotateInsertBtn) openRotateInsertBtn.addEventListener('click', () => showRotateToolPopup());
      const openRotateKnifeBtn = dlg.querySelector('[data-act="geom-open-rotate-knife"]');
      if (openRotateKnifeBtn) openRotateKnifeBtn.addEventListener('click', () => showRotateKnifePopup());
      const autoCompleteChk = dlg.querySelector('#geom-holder-autocomplete');
      if (autoCompleteChk) autoCompleteChk.addEventListener('change', withHistory(() => {
        S.params.holderAutoComplete = autoCompleteChk.checked;
        fullUpdate();
      }));
      const toggleDrawBtn = dlg.querySelector('[data-act="geom-toggle-draw"]');
      if (toggleDrawBtn) toggleDrawBtn.addEventListener('click', () => {
        drawModeActive = !drawModeActive;
        currentDrawSide = null;
        document.querySelector('.geom-side-popup')?.remove();
        render();
      });
      const clearProfileBtn = dlg.querySelector('[data-act="geom-clear-profile"]');
      if (clearProfileBtn) clearProfileBtn.addEventListener('click', withHistory(() => {
        S.params.holderProfile = null;
        fullUpdate();
      }));
      const drawOnCadBtn = dlg.querySelector('[data-act="geom-draw-on-cad"]');
      if (drawOnCadBtn) drawOnCadBtn.addEventListener('click', () => startHolderCadDraw());

      // ── Editor tvaru držáku z obdélníku ──
      const rectEditBtn = dlg.querySelector('[data-act="geom-rect-edit"]');
      if (rectEditBtn) rectEditBtn.addEventListener('click', () => {
        rectEditActive = !rectEditActive;
        rectMoveSel = null; chamferPickMode = false;
        if (rectEditActive) {
          // Vypnout freehand kreslení + materializovat obdélník, pokud není obrys.
          drawModeActive = false; currentDrawSide = null;
          const p = S.params.holderProfile;
          const hasP = p && ((p.sideA && p.sideA.length) || (p.sideB && p.sideB.length));
          if (!hasP) { pushHistory(); S.params.holderProfile = { sideA: holderRectProfile(S.params), sideB: [] }; }
        }
        render();
      });
      const rectChamferBtn = dlg.querySelector('[data-act="geom-rect-chamfer"]');
      if (rectChamferBtn) rectChamferBtn.addEventListener('click', () => {
        chamferPickMode = !chamferPickMode;
        rectMoveSel = null;
        showToast(chamferPickMode ? 'Klikněte na rohový bod držáku (žlutý čtvereček na kraji)' : 'Sražení zrušeno');
        render();
      });
      const rectResetBtn = dlg.querySelector('[data-act="geom-rect-reset"]');
      if (rectResetBtn) rectResetBtn.addEventListener('click', withHistory(() => {
        rectMoveSel = null; chamferPickMode = false;
        S.params.holderProfile = { sideA: holderRectProfile(S.params), sideB: [] };
        fullUpdate();
        showToast('Obdélník obnoven');
      }));

      // Zoom/posun canvasu — čistě UI stav náhledu, nejde do historie.
      const zoomInBtn = dlg.querySelector('[data-act="geom-zoom-in"]');
      if (zoomInBtn) zoomInBtn.addEventListener('click', () => {
        const cv = dlg.querySelector('#tool-geom-canvas');
        zoomBy(1.3, cv.clientWidth / 2, cv.clientHeight / 2);
      });
      const zoomOutBtn = dlg.querySelector('[data-act="geom-zoom-out"]');
      if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => {
        const cv = dlg.querySelector('#tool-geom-canvas');
        zoomBy(1 / 1.3, cv.clientWidth / 2, cv.clientHeight / 2);
      });
      const zoomResetBtn = dlg.querySelector('[data-act="geom-zoom-reset"]');
      if (zoomResetBtn) zoomResetBtn.addEventListener('click', resetView);

      const canvasEl = dlg.querySelector('#tool-geom-canvas');
      if (canvasEl) attachCanvasInteractions(canvasEl);
      redrawCanvas();
    }

    // Ruka držáku se při OTEVŘENÍ dialogu odvodí ze směru hrubování
    // (roughingSide) — poté ji lze tlačítkem "⇄ Ruka" ručně přepnout, aniž by
    // se přepínala zpátky při každém re-renderu (viz toolGeomModalRefresh).
    S.params.holderHand = S.params.roughingSide === 'left' ? 'L' : 'R';

    toolGeomModalRefresh = render;
    render();
  }

  function showThreadPickerDialog() {
    const dlg = document.createElement('div');
    dlg.className = 'input-overlay';
    dlg.style.zIndex = '300';
    dlg.innerHTML = `
      <div class="input-dialog" style="min-width:340px;max-width:460px;width:100%;max-height:82vh;display:flex;flex-direction:column">
        <h3 style="margin:0 0 10px">🧵 Závity — výběr pro závitování</h3>
        <div id="thr-pick-types" style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-bottom:8px"></div>
        <input type="text" id="thr-pick-filter" placeholder="Filtr…" style="background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:4px;padding:5px 8px;font-size:12px;margin-bottom:8px">
        <div id="thr-pick-body" style="flex:1;overflow-y:auto;min-height:0;border:1px solid #313244;border-radius:6px"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;border-top:1px solid #313244;padding-top:10px">
          <button class="btn-cancel" id="thr-pick-close">Zavřít</button>
        </div>
      </div>`;
    document.body.appendChild(dlg);

    let activeType = THREAD_PICKER_TYPES.find(t => t.key === S.params.threadType) || THREAD_PICKER_TYPES[0];
    const typesEl = dlg.querySelector('#thr-pick-types');
    const bodyEl = dlg.querySelector('#thr-pick-body');
    const filterEl = dlg.querySelector('#thr-pick-filter');

    function renderTypes() {
      typesEl.innerHTML = THREAD_PICKER_TYPES.map(t =>
        `<button data-thrtype="${t.key}" class="cam-sim-btn ${t.key === activeType.key ? 'cam-sim-btn-green' : 'cam-sim-btn-gray'}" style="font-size:10px;padding:4px 2px">${t.label}</button>`
      ).join('');
      typesEl.querySelectorAll('[data-thrtype]').forEach(btn => {
        btn.addEventListener('click', () => {
          activeType = THREAD_PICKER_TYPES.find(t => t.key === btn.dataset.thrtype);
          renderTypes(); renderRows();
        });
      });
    }

    function pitchOf(t) { return t.P !== undefined ? t.P : Math.round(25.4 / t.tpi * 10000) / 10000; }

    function renderRows() {
      const f = (filterEl.value || '').toLowerCase();
      const rows = activeType.data
        .map(t => ({ t, nm: activeType.name(t), P: pitchOf(t) }))
        .filter(r => !f || r.nm.toLowerCase().includes(f) || String(r.t.D).includes(f));
      let html = `<table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="color:#a6adc8;font-size:10px;text-align:left">
          <th style="padding:4px 8px">Závit</th><th style="padding:4px 8px">P mm</th><th style="padding:4px 8px">D mm</th>${activeType.data[0] && activeType.data[0].tpi !== undefined ? '<th style="padding:4px 8px">TPI</th>' : ''}
        </tr></thead><tbody>`;
      rows.forEach((r, i) => {
        html += `<tr data-thridx="${i}" style="cursor:pointer;border-top:1px solid #313244">
          <td style="padding:4px 8px;font-weight:600">${r.nm}</td>
          <td style="padding:4px 8px">${r.P}</td>
          <td style="padding:4px 8px">${r.t.D}</td>
          ${r.t.tpi !== undefined ? `<td style="padding:4px 8px;color:#6c7086">${r.t.tpi}</td>` : ''}
        </tr>`;
      });
      html += '</tbody></table>';
      if (rows.length === 0) html = '<div style="padding:14px;text-align:center;color:#6c7086;font-size:12px">Žádný závit neodpovídá filtru.</div>';
      bodyEl.innerHTML = html;
      bodyEl.querySelectorAll('[data-thridx]').forEach(tr => {
        tr.addEventListener('click', () => {
          const r = rows[parseInt(tr.dataset.thridx)];
          if (!r) return;
          applyThreadPick(activeType, r.t);
          dlg.remove();
        });
        tr.addEventListener('mouseenter', () => { tr.style.background = '#313244'; });
        tr.addEventListener('mouseleave', () => { tr.style.background = ''; });
      });
    }

    filterEl.addEventListener('input', renderRows);
    dlg.querySelector('#thr-pick-close').addEventListener('click', () => dlg.remove());
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.remove(); });
    renderTypes(); renderRows();
    filterEl.focus();
  }

  function applyThreadPick(typeDef, t) {
    const P = t.P !== undefined ? t.P : Math.round(25.4 / t.tpi * 10000) / 10000;
    const ext = S.params.threadExternal !== false;
    S.params.threadName = typeDef.name(t);
    S.params.threadType = typeDef.key;
    S.params.threadDiameter = t.D;
    S.params.threadPitch = P;
    S.params.threadAngle = typeDef.angle;
    S.params.threadDepth = Math.round(threadProfileDepth(typeDef.key, P, ext) * 1000) / 1000;
    // Kuželové trubkové závity (BSPT/NPT) mají kuželovitost 1:16.
    S.params.threadTaperRatio = typeDef.taper ? 16 : 0;
    // Závitový plátek přebírá úhel profilu; náběh standardně 2×P (min 2 mm).
    S.params.threadRunIn = Math.max(2, Math.round(2 * P * 10) / 10);
    // Spodní strana plátku: Tr/Acme = šířka dna profilu ≈ 0,366×P, jinak 0,1.
    S.params.toolTipFlat = (typeDef.key === 'tr' || typeDef.key === 'acme')
      ? Math.round(0.366 * P * 100) / 100 : 0.1;
    if (S.params.toolShape === 'threading') {
      S.params.toolTipAngle = typeDef.angle;
      S.params.toolRadius = 0;
    }
    S.machiningSubTab = 'zavit';
    const taperNote = typeDef.taper ? ' — kuželový 1:16 (nastaveno, ⌀ D platí na Z startu)' : '';
    showToast(`Závit ${S.params.threadName}: P=${P} mm, H=${S.params.threadDepth} mm, ${typeDef.angle}°${taperNote}`);
    if (S.params.threadActive) _regenGCode(); else fullUpdate();
  }

  // ── magazine dialog ──
  function _defaultMagSlot(num) {
    return {
      slot: num, name: `T${num}`, vbdCode: '',
      shape: 'round', radius: 0.8, tipAngle: 90, toolAngle: 15,
      clearanceAngle: 0, toolLength: 10, tipFlat: 0.1,
      vc: 200, f: 0.25, ap: 2.0,
      // Držák — ukládá se spolu s destičkou, aby ✅ Použít obnovilo celý nůž.
      holderLength: 200, holderWidth: 20, holderHand: 'R',
      knifeAngle: 270, holderAutoComplete: true, holderProfile: null,
    };
  }

  function _applyMagSlot(idx) {
    const slot = S.toolMagazine[idx];
    if (!slot) return;
    S.activeMagazineSlot = idx;
    S.params.toolName        = slot.name;
    S.params.toolVbdCode     = slot.vbdCode;
    S.params.toolShape       = slot.shape;
    S.params.toolRadius      = slot.radius;
    S.params.toolTipAngle    = slot.tipAngle;
    S.params.toolAngle       = slot.toolAngle;
    S.params.toolClearanceAngle = slot.clearanceAngle;
    S.params.toolLength      = slot.toolLength;
    if (slot.shape === 'threading') S.params.toolTipFlat = slot.tipFlat ?? 0.1;
    S.params.speed           = slot.vc;
    S.params.feed            = slot.f;
    S.params.depthOfCut      = slot.ap;
    // Držák
    if (slot.holderLength !== undefined) S.params.holderLength = slot.holderLength;
    if (slot.holderWidth !== undefined) S.params.holderWidth = slot.holderWidth;
    if (slot.holderHand !== undefined) S.params.holderHand = slot.holderHand;
    if (slot.knifeAngle !== undefined) S.params.knifeAngle = slot.knifeAngle;
    if (slot.holderAutoComplete !== undefined) S.params.holderAutoComplete = slot.holderAutoComplete;
    S.params.holderProfile = slot.holderProfile ? JSON.parse(JSON.stringify(slot.holderProfile)) : null;
    fullUpdate();
  }

  function _syncParamsToSlot(idx) {
    const slot = S.toolMagazine[idx];
    if (!slot) return;
    slot.name          = S.params.toolName;
    slot.vbdCode       = S.params.toolVbdCode || '';
    slot.shape         = S.params.toolShape;
    slot.radius        = S.params.toolRadius;
    slot.tipAngle      = S.params.toolTipAngle;
    slot.toolAngle     = S.params.toolAngle;
    slot.clearanceAngle = S.params.toolClearanceAngle || 0;
    slot.toolLength    = S.params.toolLength;
    slot.tipFlat       = S.params.toolTipFlat ?? 0.1;
    slot.vc            = S.params.speed;
    slot.f             = S.params.feed;
    slot.ap            = S.params.depthOfCut;
    // Držák
    slot.holderLength  = S.params.holderLength;
    slot.holderWidth   = S.params.holderWidth;
    slot.holderHand    = S.params.holderHand;
    slot.knifeAngle    = S.params.knifeAngle;
    slot.holderAutoComplete = S.params.holderAutoComplete;
    slot.holderProfile = S.params.holderProfile ? JSON.parse(JSON.stringify(S.params.holderProfile)) : null;
  }

  /** Uloží AKTUÁLNĚ nastavený nůž (destička i držák z Geometrie nástroje) jako
   * nový slot v zásobníku — pro pozdější použití (✅ Použít jako aktivní). */
  function saveCurrentToolToMagazine() {
    const nextSlot = S.toolMagazine.length > 0 ? Math.max(...S.toolMagazine.map(s => s.slot)) + 1 : 1;
    const slot = _defaultMagSlot(nextSlot);
    slot.name = S.params.toolName || `T${nextSlot}`;
    S.toolMagazine.push(slot);
    _syncParamsToSlot(S.toolMagazine.length - 1);
    S.activeMagazineSlot = S.toolMagazine.length - 1;
    S.editingMagazineSlot = S.toolMagazine.length - 1;
    saveState();
    showToast(`Nůž (destička + držák) uložen do zásobníku jako T${slot.slot}`);
  }

  function showMagazineDialog() {
    const mag = S.toolMagazine;

    const dlg = document.createElement('div');
    dlg.className = 'input-overlay';
    dlg.style.zIndex = '300';
    dlg.innerHTML = `
      <div class="input-dialog" style="min-width:400px;max-width:540px;width:100%;max-height:82vh;display:flex;flex-direction:column">
        <h3 style="margin:0 0 12px">🔧 Zásobník nástrojů</h3>
        <div id="mag-dlg-body" style="flex:1;overflow-y:auto;min-height:0"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;border-top:1px solid #313244;padding-top:10px">
          <button class="cam-sim-btn cam-sim-btn-gray" id="mag-dlg-save-current" style="flex:1" title="Uloží aktuálně nastavenou destičku i držák (ze záložky Parametry / Geometrie) jako nový nůž">💾 Uložit aktuální nástroj</button>
          <button class="cam-sim-btn cam-sim-btn-gray" id="mag-dlg-add" style="flex:1">＋ Přidat nůž</button>
          <button class="btn-cancel" id="mag-dlg-close">Zavřít</button>
        </div>
      </div>`;
    document.body.appendChild(dlg);

    const body = dlg.querySelector('#mag-dlg-body');

    function renderBody() {
      const activeIdx = S.activeMagazineSlot;
      const editIdx = S.editingMagazineSlot;

      if (mag.length === 0) {
        body.innerHTML = `<div class="cam-sim-info-box" style="text-align:center;padding:20px">
          Zásobník je prázdný.<br><small>Klikněte „＋ Přidat nůž" níže.</small>
        </div>`;
        attachBodyEvents();
        return;
      }

      let html = '';
      mag.forEach((slot, i) => {
        const isActive = i === activeIdx;
        const isEditing = i === editIdx;
        const shapeIcon = slot.shape === 'round' ? '⬤' : slot.shape === 'parting' ? '▮' : slot.shape === 'threading' ? '▽' : '◼';
        const border = isActive ? 'border:1.5px solid #a6e3a1;' : 'border:1.5px solid #313244;';

        html += `<div class="cam-sim-mag-slot" data-magidx="${i}" style="background:#1e1e2e;border-radius:8px;margin-bottom:8px;${border}overflow:hidden">`;
        html += `<div style="display:flex;align-items:center;gap:6px;padding:7px 8px;cursor:pointer" data-act="mag-toggle" data-magidx="${i}">
          <span class="cam-sim-machine-chip" style="background:${isActive ? '#40a02b' : '#313244'};font-family:monospace;font-weight:700;min-width:28px;text-align:center">T${slot.slot}</span>
          <span style="flex:1;font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHTML(slot.name)}</span>
          ${slot.vbdCode ? `<span style="font-family:monospace;font-size:10px;color:#89dceb;padding:1px 5px;border-radius:4px;border:1px solid #313244">${escHTML(slot.vbdCode.substring(0,12))}</span>` : ''}
          <span class="cam-sim-machine-chip">${shapeIcon} R${slot.radius}</span>
          ${slot.shape === 'polygon' ? `<span class="cam-sim-machine-chip">${slot.toolAngle}° ε${slot.tipAngle}°${slot.clearanceAngle ? ` α${slot.clearanceAngle}°` : ''}</span>` : ''}
          ${slot.shape === 'threading' ? `<span class="cam-sim-machine-chip">ε${slot.tipAngle}°</span>` : ''}
          <span style="color:#6c7086;font-size:12px">${isEditing ? '▲' : '▼'}</span>
        </div>`;

        if (isEditing) {
          html += `<div style="padding:0 8px 10px 8px;border-top:1px solid #313244">
            <div class="cam-sim-row" style="margin-top:8px">
              <div class="cam-sim-field"><label>Slot (T#)</label><input type="number" data-mf="slot" data-magidx="${i}" value="${slot.slot}" min="1" max="99" style="font-weight:700"></div>
              <div class="cam-sim-field" style="flex:2"><label>Název (G-kód)</label><input type="text" data-mf="name" data-magidx="${i}" value="${escHTML(slot.name)}" style="font-family:monospace"></div>
            </div>
            <div class="cam-sim-row">
              <div class="cam-sim-field" style="flex:2"><label>VBD kód</label><input type="text" data-mf="vbdCode" data-magidx="${i}" value="${escHTML(slot.vbdCode)}" placeholder="CNMG120408-PM" style="font-family:monospace;text-transform:uppercase" spellcheck="false"></div>
              <div class="cam-sim-field"><label>Rádius (R)</label><input type="number" data-mf="radius" data-magidx="${i}" step="0.1" value="${slot.radius}"></div>
            </div>
            <div style="display:flex;gap:6px;margin-bottom:6px">
              <button data-act="mag-vbd" data-magidx="${i}" class="cam-sim-btn cam-sim-btn-gray" style="flex:1;font-size:11px;padding:4px 6px">🔩 VBD dekodér</button>
              <button data-act="mag-lib" data-magidx="${i}" class="cam-sim-btn cam-sim-btn-gray" style="flex:1;font-size:11px;padding:4px 6px">🧰 Z knihovny</button>
            </div>
            <div style="margin-bottom:4px"><label style="font-size:10px;color:#6c7086">Tvar destičky</label></div>
            <div class="cam-sim-tool-shape-row" style="margin-bottom:6px">
              <button data-mshape="round" data-magidx="${i}" class="${slot.shape === 'round' ? 'cam-sim-active' : ''}">⬤</button>
              <button data-mshape="polygon" data-magidx="${i}" class="${slot.shape === 'polygon' ? 'cam-sim-active' : ''}">◼</button>
              <button data-mshape="parting" data-magidx="${i}" class="${slot.shape === 'parting' ? 'cam-sim-active' : ''}" title="Upichovací / zapichovací plátek">▮</button>
              <button data-mshape="threading" data-magidx="${i}" class="${slot.shape === 'threading' ? 'cam-sim-active' : ''}" title="Závitový plátek">▽</button>
            </div>
            ${slot.shape === 'polygon' ? `
            <div class="cam-sim-row">
              <div class="cam-sim-field"><label>Délka hrany</label><input type="number" data-mf="toolLength" data-magidx="${i}" value="${slot.toolLength}"></div>
              <div class="cam-sim-field"><label>Natočení (°)</label><input type="number" data-mf="toolAngle" data-magidx="${i}" value="${slot.toolAngle}"></div>
              <div class="cam-sim-field"><label>Vrch. úhel (ε)</label><input type="number" data-mf="tipAngle" data-magidx="${i}" value="${slot.tipAngle}"></div>
              <div class="cam-sim-field"><label>Úhel hřbetu (α)</label><input type="number" data-mf="clearanceAngle" data-magidx="${i}" value="${slot.clearanceAngle}" min="0" max="30"></div>
            </div>` : ''}
            ${slot.shape === 'parting' ? `
            <div class="cam-sim-row">
              <div class="cam-sim-field"><label>Šířka plátku</label><input type="number" data-mf="toolLength" data-magidx="${i}" value="${slot.toolLength}"></div>
              <div class="cam-sim-field"><label>Natočení (°)</label><input type="number" data-mf="toolAngle" data-magidx="${i}" value="${slot.toolAngle}"></div>
            </div>` : ''}
            ${slot.shape === 'threading' ? `
            <div class="cam-sim-row">
              <div class="cam-sim-field"><label>Úhel profilu (ε)</label><input type="number" data-mf="tipAngle" data-magidx="${i}" value="${slot.tipAngle}" min="10" max="90"></div>
              <div class="cam-sim-field"><label>Délka hrany</label><input type="number" data-mf="toolLength" data-magidx="${i}" value="${slot.toolLength}"></div>
              <div class="cam-sim-field"><label title="Šířka rovné špičky plátku (Tr/Acme ≈ 0,366×P, metrické ~0,1)">Spodní strana</label><input type="number" data-mf="tipFlat" data-magidx="${i}" value="${slot.tipFlat ?? 0.1}" min="0" step="0.05"></div>
            </div>` : ''}
            <div class="cam-sim-section-title" style="margin-top:8px">Řezné podmínky</div>
            <div class="cam-sim-row">
              <div class="cam-sim-field"><label>Vc (m/min)</label><input type="number" data-mf="vc" data-magidx="${i}" step="10" value="${slot.vc}"></div>
              <div class="cam-sim-field"><label>f (mm/ot)</label><input type="number" data-mf="f" data-magidx="${i}" step="0.05" value="${slot.f}"></div>
              <div class="cam-sim-field"><label>ap (mm)</label><input type="number" data-mf="ap" data-magidx="${i}" step="0.5" value="${slot.ap}"></div>
            </div>
            <div style="display:flex;gap:6px;margin-top:8px">
              <button data-act="mag-apply" data-magidx="${i}" class="cam-sim-btn ${isActive ? 'cam-sim-btn-green' : 'cam-sim-btn-gray'}" style="flex:2;font-size:12px">✅ ${isActive ? 'Aktivní nástroj' : 'Použít jako aktivní'}</button>
              <button data-act="mag-delete" data-magidx="${i}" class="cam-sim-btn cam-sim-btn-red" style="flex:1;font-size:12px">🗑 Smazat</button>
            </div>
          </div>`;
        }
        html += `</div>`;
      });

      if (mag.length > 0) {
        html += `<div class="cam-sim-info-box" style="font-size:10px">
          Kliknutím na kartu rozbalíte editaci. „✅ Použít" přepíše parametry nástroje v záložce Parametry.
        </div>`;
      }

      body.innerHTML = html;
      attachBodyEvents();
    }

    function attachBodyEvents() {
      body.querySelectorAll('[data-act="mag-toggle"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.magidx);
          S.editingMagazineSlot = S.editingMagazineSlot === idx ? null : idx;
          saveState(); renderBody();
        });
      });

      body.querySelectorAll('[data-mf]').forEach(inp => {
        inp.addEventListener('change', () => {
          const idx = parseInt(inp.dataset.magidx);
          const field = inp.dataset.mf;
          const slot = mag[idx];
          if (!slot) return;
          const numFields = ['slot','radius','tipAngle','toolAngle','clearanceAngle','toolLength','tipFlat','vc','f','ap'];
          slot[field] = numFields.includes(field) ? (parseFloat(inp.value) || 0) : inp.value;
          if (idx === S.activeMagazineSlot) { _applyMagSlot(idx); renderBody(); } else { saveState(); renderBody(); }
        });
      });

      body.querySelectorAll('[data-mshape]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.magidx);
          mag[idx].shape = btn.dataset.mshape;
          if (mag[idx].shape === 'polygon' && !mag[idx].tipAngle) mag[idx].tipAngle = 90;
          if (mag[idx].shape === 'parting') { mag[idx].toolAngle = 0; mag[idx].toolLength = 5; }
          if (mag[idx].shape === 'threading') { mag[idx].toolAngle = 0; mag[idx].toolLength = 4; mag[idx].tipAngle = 60; if (!(mag[idx].tipFlat > 0)) mag[idx].tipFlat = 0.1; }
          if (idx === S.activeMagazineSlot) { _applyMagSlot(idx); renderBody(); } else { saveState(); renderBody(); }
        });
      });

      body.querySelectorAll('[data-act="mag-apply"]').forEach(btn => {
        btn.addEventListener('click', () => {
          _applyMagSlot(parseInt(btn.dataset.magidx));
          renderBody();
        });
      });

      body.querySelectorAll('[data-act="mag-delete"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const idx = parseInt(btn.dataset.magidx);
          if (!await camConfirm(`Smazat slot T${mag[idx]?.slot} (${mag[idx]?.name})?`)) return;
          mag.splice(idx, 1);
          if (S.activeMagazineSlot === idx) S.activeMagazineSlot = null;
          else if (S.activeMagazineSlot > idx) S.activeMagazineSlot--;
          if (S.editingMagazineSlot === idx) S.editingMagazineSlot = null;
          else if (S.editingMagazineSlot > idx) S.editingMagazineSlot--;
          saveState(); renderBody();
        });
      });

      body.querySelectorAll('[data-act="mag-vbd"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.magidx);
          openInsertCalc({
            onCamImport: (data) => {
              const slot = mag[idx];
              if (!slot) return;
              if (data.vbdCode) slot.vbdCode = data.vbdCode;
              if (data.isRound) { slot.shape = 'round'; }
              else if (data.tipAngle !== null) { slot.shape = 'polygon'; slot.tipAngle = data.tipAngle; }
              if (data.clearanceAngle !== null) slot.clearanceAngle = data.clearanceAngle;
              if (data.tipRadius !== null && data.tipRadius > 0) slot.radius = data.tipRadius;
              if (idx === S.activeMagazineSlot) { _applyMagSlot(idx); renderBody(); } else { saveState(); renderBody(); }
            },
          });
          // VBD overlay (.calc-overlay, z-index 200) se otevírá pod zásobníkem (z-index 300)
          // → zvednout nad zásobník hned po vytvoření
          setTimeout(() => {
            const vbdOvr = document.querySelector('.calc-overlay[data-type="inserts"]');
            if (vbdOvr) vbdOvr.style.zIndex = '400';
          }, 0);
        });
      });

      body.querySelectorAll('[data-act="mag-lib"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.magidx);
          showToolLibraryDialog({
            onApply: (tool) => {
              const slot = mag[idx];
              if (!slot) return;
              if (tool.name) slot.name = tool.name;
              if (tool.vbdCode !== undefined) slot.vbdCode = tool.vbdCode;
              if (tool.tipRadius !== undefined) slot.radius = tool.tipRadius;
              if (tool.toolAngle !== undefined) slot.toolAngle = tool.toolAngle;
              if (tool.tipAngle !== undefined) slot.tipAngle = tool.tipAngle;
              if (tool.clearanceAngle !== undefined) slot.clearanceAngle = tool.clearanceAngle;
              if (tool.vc) slot.vc = tool.vc;
              if (tool.f) slot.f = tool.f;
              if (tool.ap) slot.ap = tool.ap;
              if (idx === S.activeMagazineSlot) { _applyMagSlot(idx); renderBody(); } else { saveState(); renderBody(); }
            },
          });
        });
      });
    }

    dlg.querySelector('#mag-dlg-add').addEventListener('click', () => {
      const nextSlot = mag.length > 0 ? Math.max(...mag.map(s => s.slot)) + 1 : 1;
      mag.push(_defaultMagSlot(nextSlot));
      S.editingMagazineSlot = mag.length - 1;
      saveState(); renderBody();
    });

    dlg.querySelector('#mag-dlg-save-current').addEventListener('click', () => {
      saveCurrentToolToMagazine();
      renderBody();
    });

    dlg.querySelector('#mag-dlg-close').addEventListener('click', () => dlg.remove());

    renderBody();
  }

  // ── import tab ──
  function renderImportTab() {
    tabBody.innerHTML = `
      <div class="cam-sim-section-title">Import G-kódu</div>
      <textarea class="cam-sim-import-ta" placeholder="G1 X... Z..."></textarea>
      <button class="cam-sim-btn cam-sim-btn-green" style="margin-top:6px" data-act="import-gcode">📥 Import</button>`;
    const importBtn = tabBody.querySelector('[data-act="import-gcode"]');
    const ta = tabBody.querySelector('.cam-sim-import-ta');
    if (importBtn) importBtn.addEventListener('click', () => {
      const text = ta.value;
      if (!text.trim()) return;
      const pts = parseContourGCode(text);
      if (pts.length > 0) {
        pushHistory();
        if (S.editMode === 'contour') S.contourPoints = pts;
        else S.stockPoints = pts;
        fullUpdate();
        fitView();
      } else {
        alert('Nepodařilo se rozpoznat žádné body v G-kódu.');
      }
    });
  }

  // ── auto stock ──
  function handleAutoStock() {
    const absPts = resolvePointsToAbsolute(S.contourPoints);
    if (absPts.length === 0) return;
    const prms = S.params;
    let minZ = Infinity, maxZ = -Infinity, maxR = 0;
    // Convert to radius for consistent comparison
    absPts.forEach(p => {
      const r = prms.mode === 'DIAMON' ? Math.abs(p.xAbs) / 2 : Math.abs(p.xAbs);
      if (r > maxR) maxR = r;
      if (p.zAbs < minZ) minZ = p.zAbs; if (p.zAbs > maxZ) maxZ = p.zAbs;
    });
    // Also check arc extremes (the arc peak can exceed endpoint X values)
    for (let i = 0; i < absPts.length - 1; i++) {
      const p2 = absPts[i + 1];
      if (p2.type === 'G2' || p2.type === 'G3') {
        const x1 = prms.mode === 'DIAMON' ? absPts[i].xAbs / 2 : absPts[i].xAbs;
        const z1 = absPts[i].zAbs;
        const x2 = prms.mode === 'DIAMON' ? p2.xAbs / 2 : p2.xAbs;
        const z2 = p2.zAbs;
        const arc = getArcParams({ x: x1, z: z1 }, { x: x2, z: z2 }, p2.rVal, p2.type);
        if (!arc.error) {
          const arcMaxR = Math.abs(arc.cx) + arc.r;
          if (arcMaxR > maxR) maxR = arcMaxR;
          if (arc.cz - arc.r < minZ) minZ = arc.cz - arc.r;
        }
      }
    }
    const margin = parseFloat(prms.stockMargin) || 5;
    // stockDiameter is always diameter
    S.params.stockDiameter = Math.ceil((maxR + margin) * 2);
    S.params.stockLength = Math.ceil(Math.abs(minZ) + margin);
    S.params.stockFace = Math.ceil(maxZ) + 2;
    fullUpdate();
    fitView();
  }

  function generateDefaultStock() {
    const absPts = resolvePointsToAbsolute(S.contourPoints);
    if (absPts.length === 0) return;
    let minZ = Infinity, maxX = 0;
    absPts.forEach(p => {
      const x = S.params.mode === 'DIAMON' ? p.xAbs / 2 : p.xAbs;
      if (Math.abs(x) > maxX) maxX = Math.abs(x);
      if (p.zAbs < minZ) minZ = p.zAbs;
    });
    const sR = maxX + 5, sL = minZ - 5;
    const stockX = S.params.mode === 'DIAMON' ? sR * 2 : sR;
    S.stockPoints = [
      { id: Date.now(), type: 'G0', x: stockX, z: 2, r: 0, mode: 'ABS' },
      { id: Date.now() + 1, type: 'G1', x: stockX, z: sL, r: 0, mode: 'ABS' },
      { id: Date.now() + 2, type: 'G1', x: 0, z: sL, r: 0, mode: 'ABS' }
    ];
  }

  // ── copy / download / PDF ──
  function handleCopyGCode() {
    const text = S.manualGCode;
    navigator.clipboard.writeText(text).then(() => {
      const btn = tabBody.querySelector('[data-act="copy-code"]');
      if (btn) { const orig = btn.textContent; btn.textContent = '✅ Zkopírováno'; setTimeout(() => { btn.textContent = orig; }, 1500); }
    }).catch(() => alert('Nepodařilo se zkopírovat kód do schránky.'));
  }
  function handleDownload() {
    const text = S.manualGCode;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    let ext = 'mpf';
    if (S.params.controlSystem === 'heidenhain') ext = 'h';
    else if (S.params.controlSystem === 'fanuc') ext = 'nc';
    a.download = `program_${new Date().toISOString().slice(0, 10)}.${ext}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  // ── Uložit / načíst celý projekt (.camprog) ──
  // Stejná sada polí jako saveState() — umožní 1:1 přenést stav simulátoru
  // mezi instancemi (např. z Live Serveru do preview pro reprodukci chyb).
  function handleSaveProject() {
    const payload = {
      __camprog: 1,
      pathLogicVersion: PATH_LOGIC_VERSION,
      savedAt: new Date().toISOString(),
      params: S.params,
      contourPoints: S.contourPoints,
      stockPoints: S.stockPoints,
      manualGCode: S.manualGCode,
      flipX: S.flipX,
      flipZ: S.flipZ,
      guideLines: S.guideLines,
      zLimits: S.zLimits,
      showZLimits: S.showZLimits,
      xLimits: S.xLimits,
      showSimPath: S.showSimPath
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `projekt_${new Date().toISOString().slice(0, 10)}.camprog`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Projekt uložen do souboru .camprog');
  }
  function handleLoadProject() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.camprog,.json,application/json';
    inp.addEventListener('change', () => {
      const file = inp.files && inp.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        let data;
        try { data = JSON.parse(reader.result); }
        catch (_) { alert('Soubor se nepodařilo načíst (neplatný JSON).'); return; }
        if (!data || !data.params || !data.contourPoints) {
          alert('Soubor neobsahuje platný projekt (.camprog).'); return;
        }
        if (data.params) S.params = data.params;
        if (data.contourPoints) S.contourPoints = data.contourPoints;
        if (data.stockPoints) S.stockPoints = data.stockPoints;
        // Uložené dráhy jen když odpovídají aktuální verzi logiky generování;
        // jinak přegenerovat z kontury/parametrů (fullUpdate níž to zajistí,
        // protože prázdný manualGCode → generateAutoGCode).
        if (typeof data.manualGCode === 'string' && data.pathLogicVersion === PATH_LOGIC_VERSION) {
          S.manualGCode = data.manualGCode;
        } else {
          S._cachedCalc = calculate();
          S.manualGCode = generateAutoGCode(S._cachedCalc).map(l => l.text).join('\n');
        }
        if (typeof data.flipX === 'boolean') { S.flipX = data.flipX; state.flipX = S.flipX; persistSettings(); }
        if (typeof data.flipZ === 'boolean') { S.flipZ = data.flipZ; state.flipZ = S.flipZ; persistSettings(); }
        if (data.guideLines) {
          S.guideLines = data.guideLines;
          // Upozornění na případně zastaralé čáry z hlídání destičky
          if (S.guideLines.length > 0 && data.params && data.params.respectInsertGeometry)
            showToast(`Projekt obsahuje ${S.guideLines.length} konstrukční čar — pokud jsou zastaralé po změně destičky, použijte 🧹 vedle „Hlídat geometrii destičky".`, 5000);
        }
        if (data.zLimits) S.zLimits = Object.assign(
          { chuck: null, tail: null, chuckActive: false, tailActive: false, rangeStart: null, rangeEnd: null, rangeActive: false },
          data.zLimits
        );
        if (data.showZLimits) {
          if (data.showZLimits === 'off') {
            S.showZLimits = 'off';
          } else {
            S.showZLimits = 'on';
            // Backward compat: starý formát neměl active flagy — odvodit ze showZLimits.
            if (data.zLimits && !('chuckActive' in data.zLimits)) {
              S.zLimits.chuckActive = data.showZLimits === 'fixtures' || data.showZLimits === 'both';
              S.zLimits.tailActive  = data.showZLimits === 'fixtures' || data.showZLimits === 'both';
              S.zLimits.rangeActive = data.showZLimits === 'range'    || data.showZLimits === 'both';
            }
          }
        }
        if (data.xLimits) S.xLimits = Object.assign({ rangeXMin: null, rangeXMax: null, active: false }, data.xLimits);
        if (data.showSimPath) S.showSimPath = data.showSimPath;
        S.simRunning = false; S.simProgress = 0;
        fullUpdate();
        showToast('Projekt načten ze souboru');
      };
      reader.readAsText(file);
    });
    inp.click();
  }
  async function handleExportPDF() {
    try {
      // Načíst jsPDF lokálně (UMD) pokud ještě není
      if (!window.jspdf) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'js/lib/jspdf.umd.min.js';
          s.onload = resolve;
          s.onerror = () => reject(new Error('jsPDF load failed'));
          document.head.appendChild(s);
        });
      }
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      const noAccents = (str) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      doc.setFontSize(20); doc.text(noAccents('Technologicky list - CAM'), 15, 20);
      doc.setFontSize(10);
      doc.text(`Datum: ${new Date().toLocaleDateString()}`, 15, 30);
      doc.text(noAccents(`System: ${S.params.controlSystem.toUpperCase()}`), 15, 35);
      doc.setFontSize(12); doc.text(noAccents('Parametry obrabeni:'), 15, 50);
      doc.setFontSize(10);
      let y = 60;
      const addP = (l, v) => { doc.text(noAccents(`${l}: ${v}`), 20, y); y += 6; };
      addP('Stroj', S.params.machineType); addP('Nastroj', S.params.toolName);
      addP('Rezna rychlost', S.params.speed + ' m/min'); addP('Posuv', S.params.feed + ' mm/ot');
      addP('Hloubka trisky', S.params.depthOfCut + ' mm');
      if (canvas) {
        const imgData = canvas.toDataURL('image/png');
        const imgProps = doc.getImageProperties(imgData);
        const pdfW = 100, pdfH = (imgProps.height * pdfW) / imgProps.width;
        doc.text(noAccents('Nahled drahy:'), 100, 50);
        doc.addImage(imgData, 'PNG', 100, 55, pdfW, pdfH);
      }
      y = 120; doc.setFontSize(12); doc.text('G-Code:', 15, y); y += 10;
      doc.setFont('courier', 'normal'); doc.setFontSize(9);
      S.generatedCode.forEach(lineObj => {
        if (y > 280) { doc.addPage(); y = 20; }
        doc.text(noAccents(lineObj.text), 15, y); y += 5;
      });
      doc.save('CAM_Export.pdf');
    } catch (err) {
      alert('Knihovna pro PDF se nepodařila načíst. Zkuste to znovu.');
      console.error(err);
    }
  }

  // ── Send to CAM Editor ──
  function handleSendToEditor() {
    const text = S.manualGCode;
    if (!text.trim()) { alert('Není žádný G-kód k odeslání.'); return; }
    openCamEditor(text, getActiveCodeLineIdx());
  }

  // ── Vrátit konturu zpět na plátno ──
  async function handleSendToCanvas(skipConfirm = false) {
    const pts = resolvePointsToAbsolute(S.contourPoints);
    if (pts.length < 2) { alert('Kontura nemá dostatek bodů.'); return; }
    if (!skipConfirm) {
      const ok = await camConfirm('Smazat aktuální výkres a vložit konturu z CAM simulátoru?');
      if (!ok) return;
    }

    // Uložit undo, smazat stávající objekty
    pushUndo();
    state.objects.length = 0;
    state.selected = null;

    const isDia = S.params.mode === 'DIAMON';
    const isKarusel = S.params.machineStructure === 'carousel';
    // Mapování: CNC X,Z → canvas x,y
    // soustruh: canvas.x = Z, canvas.y = X
    // karusel:  canvas.x = X, canvas.y = Z
    const toCanvas = (cncX, cncZ) => isKarusel
      ? { x: cncX, y: cncZ }
      : { x: cncZ, y: cncX };

    // Vykreslí řetězec absolutních CNC bodů do state.objects.
    // isStock=true označí segmenty jako polotovar (isStock příznak).
    const emitChain = (chainPts, isStock) => {
      for (let i = 0; i < chainPts.length - 1; i++) {
        const p1 = chainPts[i], p2 = chainPts[i + 1];
        // Přepočet z průměru na poloměr pokud je DIAMON mód
        const x1 = isDia ? p1.xAbs / 2 : p1.xAbs;
        const x2 = isDia ? p2.xAbs / 2 : p2.xAbs;
        const c1 = toCanvas(x1, p1.zAbs);
        const c2 = toCanvas(x2, p2.zAbs);

        if (p2.type === 'G0') {
          // G0 = mezera mezi nesouvisejícími entitami — nevytvářet úsečku
          // tam, kde v CADu nic nebylo nakresleno.
          continue;
        } else if (p2.type === 'G1') {
          const id = state.nextId++;
          const obj = {
            type: 'line', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y,
            name: `Úsečka ${id}`, id, layer: isStock ? STOCK_LAYER_ID : state.activeLayer,
          };
          if (isStock) obj.isStock = true;
          state.objects.push(obj);
        } else if (p2.type === 'G2' || p2.type === 'G3') {
          const arc = getArcParams(
            { x: x1, z: p1.zAbs },
            { x: x2, z: p2.zAbs },
            p2.rVal, p2.type
          );
          if (arc.error) continue;
          const cc = toCanvas(arc.cx, arc.cz);
          // Nastavit ccw + zachovat start/end body podle p1→p2 směru (BEZ swapu).
          // Mapování CAM G2/G3 → CAD ccw:
          //   G3 (CCW v CAMu = svět CCW) → ccw=true
          //   G2 (CW  v CAMu = svět CW ) → ccw=false
          // Bez správného ccw renderer kresí default (true), což pro G2 znamená
          // dlouhý oblouk přes druhou stranu středu. Při dalším exportu pak
          // cross-product produkoval jiný G2/G3 → round-trip oblouky obracel.
          const startAngle = Math.atan2(c1.y - cc.y, c1.x - cc.x);
          const endAngle   = Math.atan2(c2.y - cc.y, c2.x - cc.x);
          const id = state.nextId++;
          const obj = {
            type: 'arc', cx: cc.x, cy: cc.y, r: arc.r,
            startAngle, endAngle,
            ccw: p2.type === 'G3',
            name: `Oblouk ${id}`, id, layer: isStock ? STOCK_LAYER_ID : state.activeLayer,
          };
          if (isStock) obj.isStock = true;
          state.objects.push(obj);
        }
      }
    };

    // Kontura
    emitChain(pts, false);

    // Polotovar — válcový (rectangle z stockDiameter/stockLength/stockFace)
    // nebo tvarový (stockPoints řetězec).
    const prms = S.params;
    if (prms.stockMode === 'cylinder') {
      const sRad = (parseFloat(prms.stockDiameter) || 0) / 2;
      const sLen = parseFloat(prms.stockLength) || 0;
      const sFace = parseFloat(prms.stockFace) || 0;
      if (sRad > 0 && sLen > 0) {
        // 4 rohy v CNC X (poloměr), Z; obejdou rectangle.
        // Použijeme syntetické body s xAbs jako průměr v DIAMON režimu,
        // aby emitChain udělal /2 zpětně na poloměr.
        const xDia = isDia ? sRad * 2 : sRad;
        const stockChain = [
          { type: 'G0', xAbs: 0,    zAbs: sFace },
          { type: 'G1', xAbs: xDia, zAbs: sFace },
          { type: 'G1', xAbs: xDia, zAbs: -sLen },
          { type: 'G1', xAbs: 0,    zAbs: -sLen },
          { type: 'G1', xAbs: 0,    zAbs: sFace },
        ];
        emitChain(stockChain, true);
      }
    } else {
      const stockPts = resolvePointsToAbsolute(S.stockPoints);
      if (stockPts.length >= 2) emitChain(stockPts, true);
    }

    // Konstrukční čáry (ruční pomocné + automatické hranice nájezdu/výjezdu)
    // — souřadnice g.x1/z1/x2/z2 jsou již v reálných (poloměrových) jednotkách,
    // takže se předávají do toCanvas přímo bez přepočtu DIAMON → RADIUS.
    const guideLines = getAllGuideLines();
    for (const g of guideLines) {
      // Lomená čára (hlídání držáku) → každý úsek jako samostatná čára.
      const pts = guidePolyPoints(g);
      for (let k = 0; k + 1 < pts.length; k++) {
        const c1 = toCanvas(pts[k].x, pts[k].z);
        const c2 = toCanvas(pts[k + 1].x, pts[k + 1].z);
        const id = state.nextId++;
        state.objects.push({
          type: 'constr', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y,
          // finite: konce jsou už oříznuté (mezní/tečná čára), v editoru se
          // nekreslí donekonečna, ale jen mezi koncovými body — jako v CAM.
          finite: true,
          name: `Konstrukční čára ${id}`, id, layer: 1,
        });
      }
    }

    // Skrytá poznámka s ručně upraveným G-kódem drah — nevykresluje se,
    // ale při příštím otevření CAM se z ní obnoví editor (viz openCamSimulator),
    // takže ruční úpravy drah přežijí cestu CAM → CAD → CAM.
    state.objects.push({
      type: 'camNote', id: state.nextId++, isCamPathNote: true,
      gcode: S.manualGCode, layer: state.activeLayer
    });

    calculateAllIntersections();
    updateObjectList();
    autoCenterView();
    renderAll();

    // Zavřít CAM simulátor
    overlay.remove();
    // Na mobilu zavřít sidebar
    if (window.innerWidth <= 900) {
      const mainSidebar = document.getElementById('sidebar');
      if (mainSidebar) mainSidebar.classList.remove('mobile-open');
      const sideOverlay = document.getElementById('sidebarOverlay');
      if (sideOverlay) sideOverlay.style.display = 'none';
    }
    const guideMsg = guideLines.length ? ` + ${guideLines.length} konstr. čar` : '';
    showToast(`Kontura + polotovar vloženy (${state.objects.length} objektů${guideMsg})`);
  }

  // ── TRASOVÁNÍ PROFILU ──────────────────────────────────────────

  /**
   * Najde všechny možné segmenty (přímka + oblouky existující kontury/polotovaru),
   * po kterých lze trasovat z p1 do p2. První kandidát je vždy přímka (G1).
   */
  function _findTraceCandidates(p1, p2) {
    const dist = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    const candidates = [{ type: 'G1', dist, r: 0, cx: null, cz: null }];
    const tol = Math.max(0.05, 10 / S.view.scale);

    for (const arr of [S.contourPoints, S.stockPoints]) {
      const abs = resolvePointsToAbsolute(arr);
      for (let i = 1; i < abs.length; i++) {
        const seg = abs[i];
        if (seg.type !== 'G2' && seg.type !== 'G3') continue;
        const a = abs[i - 1];
        const ap = getArcParams({ x: a.xAbs, z: a.zAbs }, { x: seg.xAbs, z: seg.zAbs }, seg.rVal, seg.type);
        if (ap.error) continue;
        const d1 = Math.abs(Math.hypot(p1.x - ap.cx, p1.z - ap.cz) - ap.r);
        const d2 = Math.abs(Math.hypot(p2.x - ap.cx, p2.z - ap.cz) - ap.r);
        if (d1 < tol && d2 < tol) {
          const dup = candidates.some(c =>
            c.cx != null &&
            Math.abs(c.cx - ap.cx) < 1e-6 &&
            Math.abs(c.cz - ap.cz) < 1e-6 &&
            Math.abs(c.r - ap.r) < 1e-6
          );
          if (!dup) {
            // Směr (G2/G3) pro pořadí p1→p2 určíme tak, že vyzkoušíme,
            // která varianta dá stejný střed jako nalezený oblouk.
            const test2 = getArcParams(p1, p2, ap.r, 'G2');
            const matches2 = !test2.error && Math.abs(test2.cx - ap.cx) < 1e-3 && Math.abs(test2.cz - ap.cz) < 1e-3;
            candidates.push({ type: matches2 ? 'G2' : 'G3', dist, r: ap.r, cx: ap.cx, cz: ap.cz });
          }
        }
      }
    }
    return candidates;
  }

  /**
   * Zobrazí modal s možnostmi segmentu (přímka / oblouk(y)) a vrátí Promise,
   * která se vyřeší vybraným kandidátem. Při zavření bez výběru se vrátí první (přímka).
   */
  function _chooseTraceSegment(candidates) {
    return new Promise((resolve) => {
      let bodyHTML = '<div style="display:flex;flex-direction:column;gap:6px;">';
      candidates.forEach((c, i) => {
        const label = c.type === 'G1'
          ? `Přímka (G1) — délka ${c.dist.toFixed(2)} mm`
          : `Oblouk (${c.type}) — R${c.r.toFixed(2)}`;
        bodyHTML += `<button class="calc-btn cam-seg-choice-btn" data-idx="${i}" style="text-align:left">${label}</button>`;
      });
      bodyHTML += '</div>';

      const overlay = makeOverlay('camSegmentChoice', 'Výběr segmentu profilu', bodyHTML);
      if (!overlay) { resolve(candidates[0]); return; }

      let resolved = false;
      const finish = (val) => {
        if (resolved) return;
        resolved = true;
        if (document.body.contains(overlay)) overlay.remove();
        resolve(val);
      };

      overlay.querySelectorAll('.cam-seg-choice-btn').forEach(btn => {
        btn.addEventListener('click', () => finish(candidates[parseInt(btn.dataset.idx, 10)]));
      });

      new MutationObserver((_, obs) => {
        if (!document.body.contains(overlay)) { obs.disconnect(); finish(candidates[0]); }
      }).observe(document.body, { childList: true });
    });
  }

  let _choosingTraceSeg = false;

  /** Převede klientské souřadnice na světové (rádius, Z) a přichytí k nejbližšímu bodu kontury/polotovaru. */
  function _traceWorldFromClient(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
    const prms = S.params || {};
    let wx, wz;
    if (prms.machineStructure === 'carousel') {
      wx = hS * (sx - S.view.panX) / S.view.scale;
      wz = vS * (sy - S.view.panY) / S.view.scale;
    } else {
      wz = hS * (sx - S.view.panX) / S.view.scale;
      wx = vS * (sy - S.view.panY) / S.view.scale;
    }
    // Trasování pracuje v surových souřadnicích (DIAMON = průměr) —
    // world z plátna je v rádiusu, proto převod.
    if (prms.mode === 'DIAMON') wx *= 2;
    // snap na nejbližší bod kontury/polotovaru + koncové body pomocných
    // čar (ruční tečny i automatické mezní čáry hran destičky)
    const allPts = [...resolvePointsToAbsolute(S.contourPoints), ...resolvePointsToAbsolute(S.stockPoints)];
    // Ruční konstrukční čáry — bez příznaku. Automatické mezní čáry z geometrie
    // destičky (interferenceGuides) — koncům dáme index, ať profilování pozná,
    // že úsek vedený mezi dvěma konci TÉŽE čáry je "kontura z geometrie destičky".
    (S.guideLines || []).forEach(g => {
      for (const q of [{ x: g.x1, z: g.z1 }, { x: g.x2, z: g.z2 }])
        allPts.push({ xAbs: prms.mode === 'DIAMON' ? q.x * 2 : q.x, zAbs: q.z, _insertIdx: -1 });
    });
    const insertGuides = (S._cachedCalc && S._cachedCalc.interferenceGuides) || [];
    insertGuides.forEach((g, gi) => {
      // Včetně lomových (via) vrcholů — trasování po lomené čáře jde po úsecích.
      for (const q of guidePolyPoints(g))
        allPts.push({ xAbs: prms.mode === 'DIAMON' ? q.x * 2 : q.x, zAbs: q.z, _insertIdx: gi });
    });
    let best = null, bestD = Infinity;
    for (const p of allPts) {
      const d = Math.hypot(p.xAbs - wx, p.zAbs - wz);
      if (d < bestD) { bestD = d; best = p; }
    }
    const snapped = !!(best && bestD < 20 / S.view.scale * (prms.mode === 'DIAMON' ? 2 : 1));
    if (snapped) { wx = best.xAbs; wz = best.zAbs; }
    const insertGuideIdx = (snapped && best && typeof best._insertIdx === 'number') ? best._insertIdx : -1;
    return { wx, wz, snapped, insertGuideIdx };
  }

  /** Přidá další bod do trasování; pokud existuje víc možností segmentu, zobrazí volbu. */
  async function _addTracePoint(wx, wz, insertGuideIdx = -1) {
    const p2 = { x: wx, z: wz, gIdx: insertGuideIdx };
    if (S._tracePoints.length === 0) {
      S._tracePoints = [p2];
      S._traceSegs = [];
      draw();
      return;
    }
    if (_choosingTraceSeg) return;
    const p1 = S._tracePoints[S._tracePoints.length - 1];
    const candidates = _findTraceCandidates(p1, p2);

    let seg;
    if (candidates.length > 1) {
      _choosingTraceSeg = true;
      seg = await _chooseTraceSegment(candidates);
      _choosingTraceSeg = false;
      if (!S.profileTraceMode) return; // mezitím zrušeno
    } else {
      seg = candidates[0];
    }

    // Úsek vedený mezi dvěma konci TÉŽE čáry z geometrie destičky =
    // "kontura podle geometrie destičky" (vykreslí se odlišnou barvou,
    // jinak normální úsečka kontury).
    if (insertGuideIdx >= 0 && p1.gIdx === insertGuideIdx) seg.fromInsert = true;

    S._tracePoints.push(p2);
    S._traceSegs.push(seg);
    _showTraceButtons();
    draw();
  }

  /** Sjednocená logika tlačítek profilu: ✅ jen při náhledu, ❌ při náhledu
   *  NEBO když je profil použitý (pak ❌ = smazat profil a vrátit konturu). */
  function _updateProfileButtons() {
    const a = toolbar.querySelector('[data-act="profile-apply"]');
    const c = toolbar.querySelector('[data-act="profile-cancel"]');
    const previewing = !!S._previewContour;
    const hasProfile = !!S._profileOriginal;
    if (a) a.style.display = previewing ? '' : 'none';
    if (c) {
      c.style.display = (previewing || hasProfile) ? '' : 'none';
      c.title = previewing ? 'Zrušit náhled profilu' : 'Smazat profil a vrátit původní konturu';
    }
  }
  // Zpětná kompatibilita — staré volání; teď řídí vše _updateProfileButtons.
  function _showPreviewButtons() { _updateProfileButtons(); }

  /** Zobrazí/skryje plovoucí tlačítka ✓ Dokončit / ✗ Zrušit u trasování profilu. */
  function _showTraceButtons() {
    const confirmBtn = canvasWrap.querySelector('.cam-sim-trace-confirm');
    const cancelBtn = canvasWrap.querySelector('.cam-sim-trace-cancel');
    if (confirmBtn) confirmBtn.style.display = (S.profileTraceMode && S._tracePoints.length >= 2) ? 'block' : 'none';
    if (cancelBtn) cancelBtn.style.display = S.profileTraceMode ? 'block' : 'none';
  }

  /** Esc/✗: zruší poslední rozpracované body trasování, nebo vypne celý režim. */
  function _cancelTraceStep() {
    if (S._tracePoints.length > 0) {
      S._tracePoints = []; S._traceSegs = [];
      _showTraceButtons();
      draw();
      showToast('Trasování zrušeno');
    } else {
      _exitProfileTraceMode();
    }
  }

  /** Vypne režim trasování profilu (volitelně zachová rozpracované body). */
  function _exitProfileTraceMode(clearTrace = true) {
    S.profileTraceMode = false;
    if (clearTrace) { S._tracePoints = []; S._traceSegs = []; }
    const pbtn = toolbar.querySelector('[data-act="profile"]');
    if (pbtn) pbtn.classList.remove('cam-sim-active');
    canvas.style.cursor = 'crosshair';
    _showTraceButtons();
    draw();
  }

  /** Dokončí trasování a připraví číslovaný náhled nové kontury. */
  function _finishProfileTrace() {
    if (S._tracePoints.length < 2) { showToast('Je potřeba alespoň 2 body'); return; }
    const pts = [];
    let id = 1;
    pts.push({ id: id++, type: 'G0', x: S._tracePoints[0].x, z: S._tracePoints[0].z, r: 0, mode: 'ABS' });
    for (let i = 0; i < S._traceSegs.length; i++) {
      const seg = S._traceSegs[i];
      const p = S._tracePoints[i + 1];
      const pt = { id: id++, type: seg.type, x: p.x, z: p.z, r: seg.r || 0, mode: 'ABS' };
      if (seg.fromInsert) pt.fromInsert = true;
      pts.push(pt);
    }
    S._refContour = S.contourPoints;
    S._previewContour = pts;
    _exitProfileTraceMode();
    // „✓ Dokončit" rovnou použije profil — bez mezikroku náhledu/fajfky.
    _applyPreviewContour();
  }

  /** Nahradí konturu trasovaným profilem. Zachová zálohu původní kontury,
   *  ať jde profil smazat (❌) a vrátit původní konturu. */
  function _applyPreviewContour() {
    if (!S._previewContour) return;
    pushHistory();
    // Záloha PŮVODNÍ (před-profilové) kontury — drž tu nejstarší.
    if (!S._profileOriginal) S._profileOriginal = S._refContour || S.contourPoints;
    S.contourPoints = S._previewContour;
    S._previewContour = null;
    S._refContour = null;
    _updateProfileButtons();
    S._cachedCalc = calculate();
    S.manualGCode = generateAutoGCode(S._cachedCalc).map(l => l.text).join('\n');
    fullUpdate();
    showToast('Profil použit ✓ — ❌ ho smaže a vrátí původní konturu');
  }

  /** Zahodí náhled trasovaného profilu, kontura zůstává nezměněná. */
  function _cancelPreviewContour() {
    S._previewContour = null;
    S._refContour = null;
    _updateProfileButtons();
    draw();
    showToast('Náhled profilu zrušen');
  }

  /** Smaže použitý profil a vrátí původní (před-profilovou) konturu. */
  function _deleteProfile() {
    if (!S._profileOriginal) return;
    pushHistory();
    S.contourPoints = S._profileOriginal;
    S._profileOriginal = null;
    _updateProfileButtons();
    S._cachedCalc = calculate();
    S.manualGCode = generateAutoGCode(S._cachedCalc).map(l => l.text).join('\n');
    fullUpdate();
    showToast('Profil smazán — obnovena původní kontura');
  }

  // ── FULL UPDATE (recalc + redraw + re-render UI) ──
  function fullUpdate() {
    S._cachedCalc = calculate();
    // Aktivní upichnutí (part-off) = reálný program je JEN zapichovací cyklus
    // (viz partOffActive v generateAutoGCode). Teoretický náhled hrubování
    // (offsetPath/passes) se ale počítá vždy nezávisle na tom, z aktuálních
    // parametrů (roughingStrategy…) — bez potlačení by se přes skutečnou
    // dráhu upichnutí kreslilo i cizí čelní/podélné hrubovací šrafování.
    const _partOffActive = S.params.partOffZ != null && isFinite(parseFloat(S.params.partOffZ));
    // Aktivní ZÁVITOVÁNÍ nahrazuje hrubování stejně jako upichnutí — bez
    // potlačení by se přes závitovací cyklus kreslilo hrubovací šrafování
    // z parametrů a vypadalo by to, že se hrubuje, i když program obsahuje
    // jen závit (uživatel: „proč mi generuje dráhy závitu v hrubování").
    const _threadCycleActive = !!S.params.threadActive;
    // Prázdný manualGCode (např. po "🔄 Resetovat vše") = žádné dráhy k
    // zobrazení — potlačit i teoretický náhled (hrubovací šrafování/pasy),
    // který se jinak počítá vždy nezávisle na manualGCode přímo z parametrů.
    if (!S.manualGCode || !S.manualGCode.trim() || _partOffActive || _threadCycleActive) {
      S._cachedCalc.offsetPath = [];
      S._cachedCalc.finishOffsetPath = [];
      S._cachedCalc.finishUnreachablePath = [];
      S._cachedCalc.passes = [];
      S._cachedCalc.interferenceSegments = [];
      S._cachedCalc.flankSegments = [];
      S._cachedCalc.interferenceGuides = [];
      S._cachedCalc.totalPathLength = 0;
      S._cachedCalc.estimatedTimeSeconds = 0;
    }
    S.generatedCode = generateGCode(S._cachedCalc);
    showErrors();
    renderCodeArea();
    renderTab();
    draw();
    saveState();
    updateUndoRedoBtns();
    _updateProfileButtons();   // ❌ smazat profil zůstane, dokud profil existuje
    // Modal "⚙️ Geometrie" (pokud otevřený) se přerenderuje ze stejného
    // S.params — obousměrná synchronizace s hlavním panelem.
    if (toolGeomModalRefresh) toolGeomModalRefresh();
  }

  // Přegeneruje S.manualGCode z aktuální kontury+parametrů (přepíše ruční
  // úpravy). Používá se u operací, které samy definují dráhu — např. upichnutí
  // (part-off), kde chceme cyklus vidět hned, ne až po „🔄 Autorefresh".
  function _regenGCode() {
    S._cachedCalc = calculate();
    S.manualGCode = generateAutoGCode(S._cachedCalc).map(l => l.text).join('\n');
    fullUpdate();
  }

  // ── EVENT WIRING ──

  // Sync flipX/flipZ z CAD nastavení → CAM (obousměrná synchronizace)
  const _flipXAC = new AbortController();
  document.addEventListener('flipx-cad', (e) => {
    S.flipX = e.detail;
    draw(); saveState(); renderTab();
  }, { signal: _flipXAC.signal });
  document.addEventListener('flipz-cad', (e) => {
    S.flipZ = e.detail;
    draw(); saveState(); renderTab();
  }, { signal: _flipXAC.signal });
  new MutationObserver(() => {
    if (!document.contains(overlay)) _flipXAC.abort();
  }).observe(document.body, { childList: true });

  // toolbar
  toolbar.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const act = btn.dataset.act;
    const clearExtendTrim = () => {
      if (!S.gExtendMode && !S.gTrimMode) return;
      S.gExtendMode = false; S.gTrimMode = false;
      toolbar.querySelector('[data-act="gextend"]')?.classList.remove('cam-sim-active');
      toolbar.querySelector('[data-act="gtrim"]')?.classList.remove('cam-sim-active');
    };
    if (act === 'addpt') {
      S.addPointMode = !S.addPointMode;
      if (S.addPointMode) {
        S.delPointMode = false; toolbar.querySelector('[data-act="delpt"]').classList.remove('cam-sim-active');
        clearExtendTrim();
        showToast('Klikněte na bod (vložit segment) nebo na oblouk (tečna pod úhlem)');
      }
      btn.classList.toggle('cam-sim-active', S.addPointMode);
      canvas.style.cursor = S.addPointMode ? 'copy' : 'crosshair';
    } else if (act === 'delpt') {
      S.delPointMode = !S.delPointMode;
      if (S.delPointMode) { S.addPointMode = false; toolbar.querySelector('[data-act="addpt"]').classList.remove('cam-sim-active'); clearExtendTrim(); }
      btn.classList.toggle('cam-sim-active', S.delPointMode);
      canvas.style.cursor = S.delPointMode ? 'no-drop' : 'crosshair';
    } else if (act === 'profile') {
      if (S._previewContour) { showToast('Nejprve potvrďte (✅) nebo zrušte (❌) náhled profilu'); return; }
      if (S.profileTraceMode) {
        _exitProfileTraceMode();
      } else {
        S.addPointMode = false; S.delPointMode = false;
        toolbar.querySelector('[data-act="addpt"]')?.classList.remove('cam-sim-active');
        toolbar.querySelector('[data-act="delpt"]')?.classList.remove('cam-sim-active');
        S.profileTraceMode = true;
        S._tracePoints = []; S._traceSegs = [];
        btn.classList.add('cam-sim-active');
        canvas.style.cursor = 'crosshair';
        showToast('Trasování profilu: klikejte na body (Enter/✓ = dokončit, Esc/✗ = zrušit)');
        _showTraceButtons();
        draw();
      }
    } else if (act === 'profile-apply') {
      _applyPreviewContour();
    } else if (act === 'profile-cancel') {
      // Při náhledu = zrušit náhled; jinak (profil už použitý) = smazat profil.
      if (S._previewContour) _cancelPreviewContour();
      else _deleteProfile();
    } else if (act === 'edit-contour') {
      // Kontura: tažení bodů kontury. Vzájemně se vylučuje s úpravou drah.
      S.pointDragEnabled = !S.pointDragEnabled;
      if (S.pointDragEnabled) {
        S.gcodeEditEnabled = false;
        S.hoverGNode = null; S.hoverGSeg = null;
        S.gExtendMode = false; S.gTrimMode = false;
        toolbar.querySelector('[data-act="edit-paths"]')?.classList.remove('cam-sim-active');
        toolbar.querySelector('[data-act="gextend"]')?.classList.remove('cam-sim-active');
        toolbar.querySelector('[data-act="gtrim"]')?.classList.remove('cam-sim-active');
        showToast('Kontura: táhněte body kontury pro změnu jejich polohy');
      }
      btn.classList.toggle('cam-sim-active', S.pointDragEnabled);
      { const v = S.pointDragEnabled || S.gcodeEditEnabled; toolbar.querySelector('[data-act="addpt"]').style.display = v ? '' : 'none'; toolbar.querySelector('[data-act="delpt"]').style.display = v ? '' : 'none'; }
      { const ve = S.gcodeEditEnabled; toolbar.querySelector('[data-act="gextend"]').style.display = ve ? '' : 'none'; toolbar.querySelector('[data-act="gtrim"]').style.display = ve ? '' : 'none'; }
      draw();
    } else if (act === 'edit-paths') {
      // Dráhy: úprava G-kódu. Vzájemně se vylučuje s úpravou kontury.
      S.gcodeEditEnabled = !S.gcodeEditEnabled;
      if (S.gcodeEditEnabled) {
        S.pointDragEnabled = false;
        toolbar.querySelector('[data-act="edit-contour"]')?.classList.remove('cam-sim-active');
        if (S.showSimPath === 'none') S.showSimPath = 'all';   // ať jdou dráhy uchopit
        showToast('Dráhy: táhněte uzly/úsečky dráhy; ➕/➖ na dráze přidá/smaže pohyb');
      } else {
        S.hoverGNode = null; S.hoverGSeg = null; S._gcodeFocusLine = null;
        // při vypnutí vypnout i režimy prodloužit/oříznout
        S.gExtendMode = false; S.gTrimMode = false;
        toolbar.querySelector('[data-act="gextend"]')?.classList.remove('cam-sim-active');
        toolbar.querySelector('[data-act="gtrim"]')?.classList.remove('cam-sim-active');
      }
      btn.classList.toggle('cam-sim-active', S.gcodeEditEnabled);
      { const v = S.pointDragEnabled || S.gcodeEditEnabled; toolbar.querySelector('[data-act="addpt"]').style.display = v ? '' : 'none'; toolbar.querySelector('[data-act="delpt"]').style.display = v ? '' : 'none'; }
      { const ve = S.gcodeEditEnabled; toolbar.querySelector('[data-act="gextend"]').style.display = ve ? '' : 'none'; toolbar.querySelector('[data-act="gtrim"]').style.display = ve ? '' : 'none'; }
      draw();
    } else if (act === 'fit') {
      fitView();
    } else if (act === 'simpath') {
      // Cyklus: all → cut (skryté rychloposuvy) → none → all
      const next = { all: 'cut', cut: 'none', none: 'all' };
      S.showSimPath = next[S.showSimPath] || 'all';
      const cfg = {
        all:  { icon: '👁',  active: true,  toast: 'Simulační trajektorie zobrazena' },
        cut:  { icon: '✂️',  active: true,  toast: 'Skryté rychloposuvy (jen řezné drahy)' },
        none: { icon: '🙈', active: false, toast: 'Simulační trajektorie skryta' },
      }[S.showSimPath];
      btn.classList.toggle('cam-sim-active', cfg.active);
      btn.textContent = cfg.icon;
      draw();
      saveState();
      showToast(cfg.toast);
    } else if (act === 'zlimits') {
      // Prostý on/off – co se zobrazuje řídí checkboxy v parametrech.
      S.showZLimits = S.showZLimits === 'on' ? 'off' : 'on';
      // Při prvním zapnutí: pokud nejsou žádné hodnoty, auto-inicializovat
      // čelisti/koník z kontury a zaškrtnout je (rozsah nechme na uživateli).
      if (S.showZLimits === 'on') {
        const allNull = S.zLimits.chuck === null && S.zLimits.tail === null
          && S.zLimits.rangeStart === null && S.zLimits.rangeEnd === null;
        if (allNull) {
          const absPts = resolvePointsToAbsolute(S.contourPoints);
          if (absPts.length > 0) {
            let minZ = Infinity, maxZ = -Infinity;
            absPts.forEach(p => { if (p.zAbs < minZ) minZ = p.zAbs; if (p.zAbs > maxZ) maxZ = p.zAbs; });
            const span = Math.max(10, maxZ - minZ);
            S.zLimits.chuck = Math.round((minZ - span * 0.15) * 100) / 100;
            S.zLimits.tail  = Math.round((maxZ + span * 0.15) * 100) / 100;
            S.zLimits.rangeStart = Math.round((minZ + span * 0.2) * 100) / 100;
            S.zLimits.rangeEnd   = Math.round((maxZ - span * 0.2) * 100) / 100;
          } else {
            S.zLimits.chuck = -110; S.zLimits.tail = 10;
            S.zLimits.rangeStart = -90; S.zLimits.rangeEnd = -10;
          }
          // Auto-zaškrtnout čelisti/koník, rozsah ponechat na uživateli.
          S.zLimits.chuckActive = true;
          S.zLimits.tailActive  = true;
        }
      }
      const cfg = ZLIM_CFG[S.showZLimits] || ZLIM_CFG.off;
      btn.classList.toggle('cam-sim-active', cfg.active);
      btn.textContent = cfg.icon;
      fullUpdate();
      showToast(cfg.toast);
    } else if (act === 'snap') {
      S.snapEnabled = !S.snapEnabled;
      btn.classList.toggle('cam-sim-active', S.snapEnabled);
      if (!S.snapEnabled) S._snap = null;
      showToast(S.snapEnabled
        ? 'SNAP zapnut: přichytávání k bodům a hranám kontury/polotovaru'
        : 'SNAP vypnut');
      draw();
    } else if (act === 'gextend' || act === 'gtrim') {
      const on = act === 'gextend' ? !S.gExtendMode : !S.gTrimMode;
      S.gExtendMode = act === 'gextend' ? on : false;
      S.gTrimMode = act === 'gtrim' ? on : false;
      // vzájemně vylučující s vkládáním/mazáním bodů
      if (on) {
        S.addPointMode = false; S.delPointMode = false;
        toolbar.querySelector('[data-act="addpt"]')?.classList.remove('cam-sim-active');
        toolbar.querySelector('[data-act="delpt"]')?.classList.remove('cam-sim-active');
      }
      toolbar.querySelector('[data-act="gextend"]').classList.toggle('cam-sim-active', S.gExtendMode);
      toolbar.querySelector('[data-act="gtrim"]').classList.toggle('cam-sim-active', S.gTrimMode);
      if (on && !S.gcodeEditEnabled) {
        // Pro úpravu drah je potřeba odemčeno (= editace drah zapnutá).
        showToast('Nejdřív zapněte ✥ Dráhy, pak klikněte na koncový bod');
      } else if (on) {
        showToast(act === 'gextend'
          ? 'Prodloužit: klikněte na koncový bod úsečky (protáhne se k průsečíku)'
          : 'Oříznout: klikněte na koncový bod úsečky (zkrátí se k průsečíku)');
      }
      canvas.style.cursor = on ? 'crosshair' : 'crosshair';
      draw();
    } else if (act === 'toggle-controls') {
      S.controlsHidden = !S.controlsHidden;
      const hidden = S.controlsHidden;
      const acts = ['edit-contour', 'edit-paths', 'fit', 'simpath', 'zlimits', 'snap', 'profile'];
      acts.forEach(a => {
        const el = toolbar.querySelector(`[data-act="${a}"]`);
        if (el) el.style.display = hidden ? 'none' : '';
      });
      btn.textContent = hidden ? '»«' : '«»';
      btn.title = hidden ? 'Zobrazit hlavní ovládací tlačítka' : 'Skrýt hlavní ovládací tlačítka';
    }
  });

  // player bar (play/stop, krokování, rychlost, single-block)
  playerBar.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'play') {
      if (S.simRunning) {
        // Pauza – zastavit, ale zachovat pozici.
        S.simRunning = false; S.simBlockTarget = null;
        playBtn.textContent = '▶';
      } else {
        if (S.simProgress >= 1) S.simProgress = 0;
        // V single-block módu: spočítat cíl = konec dalšího G-kód bloku.
        if (S.singleBlock) {
          if (!S._cachedCalc) S._cachedCalc = calculate();
          const calc = S._cachedCalc;
          const total = calc.simPath.length - 1;
          const currentSimIdx = Math.floor(S.simProgress * total);
          const currentLineIdx = calc.simPath[currentSimIdx]?.originalLineIdx ?? -1;
          let targetIdx = total;
          for (let i = currentSimIdx + 1; i <= total; i++) {
            const li = calc.simPath[i].originalLineIdx;
            if (li != null && li > currentLineIdx) { targetIdx = i; break; }
          }
          S.simBlockTarget = total > 0 ? targetIdx / total : 1;
        } else {
          S.simBlockTarget = null;
        }
        S._gcodeFocusLine = null;   // přehrávání přebíjí kliknutý řádek
        S.simRunning = true; playBtn.textContent = '⏸'; startSimLoop();
      }
    } else if (act === 'stop') {
      S.simRunning = false; S.simProgress = 0; S.simBlockTarget = null;
      S._gcodeFocusLine = null;   // stop přebíjí kliknutý řádek
      playBtn.textContent = '▶';
      draw(); updateCodeHighlight(); updateProgressBar();
    } else if (act === 'step-back') {
      seekToAdjacentBlock(-1);
    } else if (act === 'step-fwd') {
      seekToAdjacentBlock(1);
    } else if (act === 'sbl') {
      S.singleBlock = !S.singleBlock;
      btn.classList.toggle('cam-sim-active', S.singleBlock);
      if (!S.singleBlock) S.simBlockTarget = null;
      showToast(S.singleBlock ? 'Single block ZAP – přehrávání po blocích' : 'Single block VYP');
    } else if (act === 'speed-down') {
      const idx = SIM_SPEEDS.indexOf(S.simSpeed);
      if (idx > 0) S.simSpeed = SIM_SPEEDS[idx - 1];
      else if (idx === -1) S.simSpeed = SIM_SPEEDS[0];
      updateSpeedLabel();
    } else if (act === 'speed-up') {
      const idx = SIM_SPEEDS.indexOf(S.simSpeed);
      if (idx < SIM_SPEEDS.length - 1) S.simSpeed = SIM_SPEEDS[idx + 1];
      else if (idx === -1) S.simSpeed = SIM_SPEEDS[SIM_SPEEDS.length - 1];
      updateSpeedLabel();
    }
  });

  // undo / redo
  root.querySelector('[data-act="undo"]').addEventListener('click', undo);
  root.querySelector('[data-act="redo"]').addEventListener('click', redo);

  const codeArea = root.querySelector('.cam-sim-code-area');
  const toggleCodeBtn = root.querySelector('[data-act="toggle-code"]');
  if (codeArea && toggleCodeBtn) {
    toggleCodeBtn.addEventListener('click', function() {
      const hidden = codeArea.style.display === 'none';
      codeArea.style.display = hidden ? '' : 'none';
      this.textContent = hidden ? '▼' : '▲';
      this.title = hidden ? 'Skrýt G-kód panel' : 'Zobrazit G-kód panel';
      this.classList.toggle('cam-sim-active', !hidden);
    });
  }

  // progress bar scrubbing
  function scrubProgress(e) {
    const track = progressBar.querySelector('.cam-sim-progress-track');
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    S.simProgress = ratio;
    S._gcodeFocusLine = null;   // scrub přebíjí kliknutý řádek
    draw(); updateCodeHighlight(); updateProgressBar();
  }
  let _scrubbing = false;
  progressBar.addEventListener('mousedown', e => {
    _scrubbing = true; scrubProgress(e);
  });
  document.addEventListener('mousemove', e => {
    if (_scrubbing) scrubProgress(e);
  });
  document.addEventListener('mouseup', () => { _scrubbing = false; });
  progressBar.addEventListener('touchstart', e => {
    if (e.touches.length === 1) { _scrubbing = true; scrubProgress(e.touches[0]); }
  }, { passive: true });
  progressBar.addEventListener('touchmove', e => {
    if (_scrubbing && e.touches.length === 1) scrubProgress(e.touches[0]);
  }, { passive: true });
  progressBar.addEventListener('touchend', () => { _scrubbing = false; });

  // keyboard shortcuts
  const handleKeyDown = (e) => {
    if (!document.body.contains(overlay)) return;
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
    if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
    if (e.key === 'Escape') {
      if (S.partOffPickMode) {
        S.partOffPickMode = false;
        showToast('Výběr upichnutí zrušen');
        renderTab(); draw();
      } else if (S.rectSelecting) {
        S.rectSelecting = false;
        S.rectStart = null;
        S.rectEnd = null;
        S.selectedPoints.clear();
        canvas.style.cursor = 'crosshair';
        draw();
      } else if (S.selectedPoints.size > 0) {
        S.selectedPoints.clear();
        draw();
      }
    }
  };
  document.addEventListener('keydown', handleKeyDown);

  // tabs
  root.querySelectorAll('.cam-sim-tabs button').forEach(btn => {
    btn.addEventListener('click', () => { S.activeTab = btn.dataset.tab; renderTab(); });
  });

  // code area buttons
  root.querySelector('[data-code="refresh"]').addEventListener('click', async () => {
    const ok = await camConfirm('Přegenerovat dráhy z aktuální kontury a parametrů? Ruční úpravy G-kódu budou přepsány.');
    if (!ok) return;
    S._cachedCalc = calculate();
    S.manualGCode = generateAutoGCode(S._cachedCalc).map(l => l.text).join('\n');
    fullUpdate();
    showToast('Dráhy přegenerovány z kontury a parametrů');
  });
  root.querySelector('[data-code="editor"]').addEventListener('click', handleSendToEditor);
  root.querySelector('[data-code="to-canvas"]').addEventListener('click', handleSendToCanvas);
  root.querySelector('[data-code="save-prog"]').addEventListener('click', handleSaveProject);
  root.querySelector('[data-code="load-prog"]').addEventListener('click', handleLoadProject);
  const showSidebar = () => {
    if (root.offsetWidth < 700) sidebar.classList.add('cam-sim-sidebar-overlay');
    else sidebar.classList.remove('cam-sim-sidebar-overlay');
    sidebar.style.display = 'flex';
    renderTab(); draw();
  };
  const hideSidebar = () => {
    sidebar.style.display = 'none';
    sidebar.classList.remove('cam-sim-sidebar-overlay');
    draw();
  };
  root.querySelector('[data-code="show-sidebar"]').addEventListener('click', () => {
    if (sidebar.style.display === 'flex') hideSidebar(); else showSidebar();
  });
  root.querySelector('[data-act="hide-sidebar"]').addEventListener('click', hideSidebar);

  // manual textarea
  manualTa.addEventListener('mousedown', () => { S._gcodeFocusLine = null; });
  manualTa.addEventListener('input', () => {
    S._gcodeFocusLine = null;
    S.manualGCode = manualTa.value;
    S._cachedCalc = calculate();
    S.generatedCode = generateGCode(S._cachedCalc);
    renderCodeBackdrop();
    updateCodeHighlight();
    draw();
    saveState();
  });
  manualTa.addEventListener('scroll', () => {
    codeBackdrop.scrollTop = manualTa.scrollTop;
    codeBackdrop.scrollLeft = manualTa.scrollLeft;
  });

  // Vloží do polotovaru nový bod tam, kde jeho obrys protíná svislou
  // čáru limitu čelistí (Z = S.zLimits.chuck) — vznikne reálný vrchol
  // polotovaru, který lze tahat/označit i použít jako bod pro kreslení
  // (po "📐 Kreslit" je vidět jako koncový bod úsečky polotovaru).
  function handleAddStockChuckPoint() {
    const chuckLim = S.zLimits.chuck;
    if (typeof chuckLim !== 'number' || !isFinite(chuckLim)) return;
    const calc = S._cachedCalc || calculate();
    const prms = S.params;
    const inserts = [];
    calc.stockPathSegments.forEach((seg, i) => {
      intersectSegAtZ(seg, chuckLim).forEach(x => inserts.push({ afterIndex: i, x }));
    });
    if (inserts.length === 0) {
      alert('Obrys polotovaru neprotíná limit čelistí.');
      return;
    }
    pushHistory();
    // Vkládat od konce, ať se nemění indexy dříve nalezených průsečíků.
    inserts.sort((a, b) => b.afterIndex - a.afterIndex);
    inserts.forEach(({ afterIndex, x }) => {
      const rawX = prms.mode === 'DIAMON' ? x * 2 : x;
      S.stockPoints.splice(afterIndex + 1, 0, {
        id: Date.now() + Math.floor(Math.random() * 1000),
        type: 'G1', mode: 'ABS',
        x: Math.round(rawX * 1000) / 1000,
        z: Math.round(chuckLim * 1000) / 1000,
        r: 0
      });
    });
    fullUpdate();
  }

  // ── CANVAS INTERACTION ──
  function handleInsertAfter(index, isStock) {
    const stock = isStock !== undefined ? isStock : S.editMode === 'stock';
    const list = stock ? S.stockPoints : S.contourPoints;
    const prev = list[index];
    // Absolutní souřadnice výchozího bodu — pro dopočet X/Z z úhlu+délky.
    const fromAbs = resolvePointsToAbsolute(list)[index];
    openInsertSegmentModal(prev, (newPt, tgt) => {
      pushHistory();
      const targetList = tgt === 'stock' ? S.stockPoints : S.contourPoints;
      // vložit za index jen pokud jde o stejný list, jinak na konec
      if (targetList === list) {
        list.splice(index + 1, 0, { ...newPt, id: Date.now() });
      } else {
        targetList.push({ ...newPt, id: Date.now() });
      }
      fullUpdate();
    }, stock ? 'stock' : 'contour', fromAbs);
  }

  // ── Modal: tečná úsečka pod úhlem z oblouku (CAM obdoba CAD „Úhel") ──
  // Klik na oblouk v "+" módu: oblouk se ukončí (ořízne/prodlouží po své
  // kružnici) v bodě, kde má tečna zadaný úhel — na straně kliknutí — a za
  // tečný bod se vloží G1 úsečka zadané délky pod tímto úhlem.
  function openTangentLineModal(found) {
    const ov = document.createElement('div');
    ov.className = 'cam-confirm-overlay';
    ov.style.zIndex = '200000';
    const inpStyle = 'background:#1e1e2e;border:1px solid #45475a;color:#cdd6f4;border-radius:4px;padding:6px;font-size:14px;width:100%;box-sizing:border-box';
    ov.innerHTML = `
      <div class="cam-confirm-box" style="min-width:320px;max-width:95vw">
        <div style="font-weight:bold;font-size:14px;margin-bottom:10px;color:#cba6f7">📐 Tečna pod úhlem z oblouku</div>
        <p style="font-size:11px;color:#a6adc8;margin:0 0 12px">Úsečka tečná k oblouku pod zadaným úhlem (tečný bod na straně kliknutí). Úhel: 0° = +Z (vodorovně vpravo), 90° = +X (nahoru), záporný/+180° = opačný směr.</p>
        <div style="display:flex;gap:10px;margin-bottom:14px">
          <label style="flex:1;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">
            Úhel (°)<input id="tlm-ang" type="number" value="45" step="1" style="${inpStyle}">
          </label>
          <label style="flex:1;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">
            Ukončení<select id="tlm-mode" style="${inpStyle};padding:7px 6px">
              <option value="length" selected>Zadaná délka</option>
              <option value="intersect">Do průsečíku</option>
            </select>
          </label>
        </div>
        <div style="display:flex;gap:10px;margin-bottom:14px" id="tlm-len-row">
          <label style="flex:1;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">
            Délka<input id="tlm-len" type="number" value="10" step="0.5" min="0.001" style="${inpStyle}">
          </label>
        </div>
        ${S.params.toolShape === 'polygon' ? `
        <div style="display:flex;gap:6px;margin-bottom:14px">
          <button id="tlm-preset-front" title="Úhel čelní hrany destičky (natočení + ε − 180) — kontrola dojezdů v Z" style="flex:1;padding:6px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;border:2px solid #45475a;background:#313244;color:#cdd6f4">↘ Hrana dojezdu</button>
          <button id="tlm-preset-bottom" title="Úhel spodní hrany destičky (natočení − 180) — kontrola zanořování" style="flex:1;padding:6px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;border:2px solid #45475a;background:#313244;color:#cdd6f4">↙ Hrana zanoření</button>
        </div>` : ''}
        <div style="display:flex;gap:10px;margin-bottom:6px">
          <label style="flex:1;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">
            Výsledek<select id="tlm-result" style="${inpStyle};padding:7px 6px">
              <option value="guide" selected>Pomocná čára (jen zobrazit)</option>
              <option value="insert">Vložit do kontury (oříznout oblouk)</option>
            </select>
          </label>
        </div>
        <p style="font-size:10px;color:#6c7086;margin:0 0 12px">Pomocná čára konturu nemění — slouží ke kontrole, např. zda destička nezajíždí do kontury.</p>
        ${S.guideLines.length > 0 ? `<div style="margin-bottom:12px"><button id="tlm-clear" style="width:100%;padding:6px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;border:2px solid #45475a;background:#313244;color:#cdd6f4">🧹 Smazat pomocné čáry (${S.guideLines.length})</button></div>` : ''}
        <div class="cam-confirm-btns">
          <button id="tlm-ok" style="padding:7px 22px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;border:none;background:#a6e3a1;color:#1e1e2e">Vložit</button>
          <button id="tlm-cancel" style="padding:7px 22px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;border:none;background:#45475a;color:#cdd6f4">Zrušit</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.querySelector('#tlm-cancel').addEventListener('click', close);
    ov.addEventListener('keydown', e => {
      if (e.key === 'Escape') close();
      else if (e.key === 'Enter') ov.querySelector('#tlm-ok').click();
    });
    const modeSel = ov.querySelector('#tlm-mode');
    modeSel.addEventListener('change', () => {
      ov.querySelector('#tlm-len-row').style.display = modeSel.value === 'length' ? '' : 'none';
    });
    const clearBtn = ov.querySelector('#tlm-clear');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      S.guideLines = [];
      saveState();
      draw();
      clearBtn.parentElement.remove();
      showToast('Pomocné čáry smazány.');
    });
    // Presety: úhel hrany destičky (směr dolů k materiálu) + Do průsečíku.
    const applyPreset = (angDeg) => {
      let a = angDeg;
      while (a <= -180) a += 360;
      while (a > 180) a -= 360;
      ov.querySelector('#tlm-ang').value = Math.round(a * 10) / 10;
      modeSel.value = 'intersect';
      modeSel.dispatchEvent(new Event('change'));
    };
    const presetFront = ov.querySelector('#tlm-preset-front');
    if (presetFront) presetFront.addEventListener('click', () => {
      applyPreset((parseFloat(S.params.toolAngle) || 0) + (parseFloat(S.params.toolTipAngle) || 90) - 180);
    });
    const presetBottom = ov.querySelector('#tlm-preset-bottom');
    if (presetBottom) presetBottom.addEventListener('click', () => {
      applyPreset((parseFloat(S.params.toolAngle) || 0) - 180);
    });
    setTimeout(() => { const i = ov.querySelector('#tlm-ang'); if (i) { i.focus(); i.select(); } }, 50);

    ov.querySelector('#tlm-ok').addEventListener('click', () => {
      const angDeg = parseFloat(ov.querySelector('#tlm-ang').value);
      const termMode = modeSel.value;
      const len = parseFloat(ov.querySelector('#tlm-len').value);
      if (isNaN(angDeg) || (termMode === 'length' && (isNaN(len) || len <= 0))) { showToast('Zkontrolujte úhel a délku.'); return; }
      const list = found.isStock ? S.stockPoints : S.contourPoints;
      const abs = resolvePointsToAbsolute(list);
      const p1 = abs[found.idx - 1], p2 = abs[found.idx];
      if (!p1 || !p2) { close(); return; }
      const isDia = S.params.mode === 'DIAMON';
      const toReal = (p) => ({ x: isDia ? p.xAbs / 2 : p.xAbs, z: p.zAbs });
      const arc = getArcParams(toReal(p1), toReal(p2), p2.rVal, p2.type);
      if (arc.error) { showToast('Oblouk nelze vyhodnotit.'); close(); return; }
      const rad = angDeg * Math.PI / 180;
      const dirZ = Math.cos(rad), dirX = Math.sin(rad);
      // Tečný bod = střed ± r·normála směru (kolmice v rovině ZX);
      // ze dvou kandidátů bereme ten blíž místu kliknutí.
      const t1 = { x: arc.cx + arc.r * dirZ, z: arc.cz - arc.r * dirX };
      const t2 = { x: arc.cx - arc.r * dirZ, z: arc.cz + arc.r * dirX };
      const d1 = Math.hypot(found.wx - t1.x, found.wz - t1.z);
      const d2 = Math.hypot(found.wx - t2.x, found.wz - t2.z);
      const T = d1 <= d2 ? t1 : t2;
      let E;
      if (termMode === 'intersect') {
        // Do průsečíku: prodloužit paprsek z tečného bodu k nejbližšímu
        // prvku kontury/polotovaru (tečnovaný oblouk se vynechá).
        E = camRayIntersection(T.x, T.z, dirX, dirZ, { idx: found.idx, isStock: found.isStock }, S._cachedCalc);
        if (!E) { showToast('Žádný průsečík ve směru úhlu nenalezen.'); return; }
      } else {
        E = { x: T.x + dirX * len, z: T.z + dirZ * len };
      }
      const resultMode = ov.querySelector('#tlm-result').value;
      if (resultMode === 'guide') {
        // Jen pomocná čára — kontura zůstává beze změny.
        S.guideLines.push({ x1: T.x, z1: T.z, x2: E.x, z2: E.z });
        close();
        saveState();
        draw();
        showToast(`Pomocná tečna pod úhlem ${angDeg}° přidána ✓`);
        return;
      }
      pushHistory();
      const tgt = list[found.idx];
      tgt.x = Math.round((isDia ? T.x * 2 : T.x) * 1000) / 1000;
      tgt.z = Math.round(T.z * 1000) / 1000;
      tgt.mode = 'ABS';
      list.splice(found.idx + 1, 0, {
        id: Date.now(), type: 'G1', mode: 'ABS',
        x: Math.round((isDia ? E.x * 2 : E.x) * 1000) / 1000,
        z: Math.round(E.z * 1000) / 1000,
        r: 0
      });
      close();
      fullUpdate();
      showToast(`Tečna pod úhlem ${angDeg}° vložena ✓`);
    });
  }

  // ── Modal pro vložení segmentu ──────────────────────────────────
  function openInsertSegmentModal(fromPt, onConfirm, defaultTarget, fromAbs) {
    let pickMode = false;

    const ov = document.createElement('div');
    ov.className = 'cam-confirm-overlay';
    ov.style.zIndex = '200000';

    // pick hint banner – zobrazí se místo modalu při pick módu
    const hint = document.createElement('div');
    hint.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:200001;background:#f9e2af;color:#1e1e2e;font-weight:700;font-size:13px;padding:8px 20px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.4);pointer-events:none;display:none';
    hint.textContent = '🎯 Klikněte na bod kontury nebo polotovaru…  (Esc = zpět)';
    document.body.appendChild(hint);

    const syncValues = () => {
      const xEl = ov.querySelector('#ism-x');
      const zEl = ov.querySelector('#ism-z');
      const rEl = ov.querySelector('#ism-r');
      if (xEl) ov._x = parseFloat(xEl.value) || 0;
      if (zEl) ov._z = parseFloat(zEl.value) || 0;
      if (rEl) ov._r = parseFloat(rEl.value) || 0;
      const aEl = ov.querySelector('#ism-ang');
      const alEl = ov.querySelector('#ism-anglen');
      const amEl = ov.querySelector('#ism-angmode');
      if (aEl) ov._ang = parseFloat(aEl.value);
      if (alEl) ov._angLen = parseFloat(alEl.value);
      if (amEl) ov._angMode = amEl.value;
    };

    const enterPickMode = () => {
      syncValues();
      pickMode = true;
      ov.style.display = 'none';
      hint.style.display = 'block';
      canvas.style.cursor = 'crosshair';
    };

    const exitPickMode = () => {
      pickMode = false;
      ov.style.display = '';
      hint.style.display = 'none';
      canvas.style.cursor = 'crosshair';
      renderModal();
      setTimeout(() => ov.querySelector('#ism-x') && ov.querySelector('#ism-x').focus(), 30);
    };

    const renderModal = () => {
      const mode = ov._mode || fromPt.mode || 'ABS';
      const type = ov._type || 'G1';
      const x = ov._x !== undefined ? ov._x : fromPt.x;
      const z = ov._z !== undefined ? ov._z : (parseFloat(fromPt.z) - 5);
      const r = ov._r !== undefined ? ov._r : (fromPt.r || 0);
      const target = ov._target || defaultTarget || S.editMode || 'contour';
      const isArc = type === 'G2' || type === 'G3';

      ov.innerHTML = `
        <div class="cam-confirm-box" style="min-width:340px;max-width:95vw">
          <div style="font-weight:bold;font-size:14px;margin-bottom:14px;color:#cba6f7">➕ Vložit segment za bod</div>
          <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center;flex-wrap:wrap">
            <span style="font-size:12px;color:#a6adc8;min-width:36px">Kam</span>
            <button data-tgt="contour" style="padding:5px 14px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;border:2px solid ${target==='contour'?'#cba6f7':'#45475a'};background:${target==='contour'?'#cba6f7':'#313244'};color:${target==='contour'?'#1e1e2e':'#cdd6f4'}">Kontura</button>
            <button data-tgt="stock" style="padding:5px 14px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;border:2px solid ${target==='stock'?'#a6e3a1':'#45475a'};background:${target==='stock'?'#a6e3a1':'#313244'};color:${target==='stock'?'#1e1e2e':'#cdd6f4'}">Polotovar</button>
          </div>
          <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center">
            <span style="font-size:12px;color:#a6adc8;min-width:36px">Režim</span>
            <button id="ism-mode" style="padding:5px 14px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;border:none;background:${mode==='ABS'?'#89b4fa':'#a6e3a1'};color:#1e1e2e">
              ${mode==='ABS'?'G90 ABS':'G91 INC'}
            </button>
          </div>
          <div style="display:flex;gap:6px;margin-bottom:14px">
            ${['G1','G2','G3'].map(t => `
              <button data-type="${t}" style="flex:1;padding:6px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;border:2px solid ${t===type?'#cba6f7':'#45475a'};background:${t===type?'#cba6f7':'#313244'};color:${t===type?'#1e1e2e':'#cdd6f4'}">${t}</button>
            `).join('')}
          </div>
          <div style="display:flex;gap:10px;margin-bottom:${isArc?'10px':'14px'}">
            <label style="flex:1;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">
              X<input id="ism-x" type="number" value="${x}" step="0.1"
                style="background:#1e1e2e;border:1px solid #45475a;color:#cdd6f4;border-radius:4px;padding:6px;font-size:14px;width:100%;box-sizing:border-box">
            </label>
            <label style="flex:1;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">
              Z<input id="ism-z" type="number" value="${z}" step="0.1"
                style="background:#1e1e2e;border:1px solid #45475a;color:#cdd6f4;border-radius:4px;padding:6px;font-size:14px;width:100%;box-sizing:border-box">
            </label>
          </div>
          ${isArc ? `
          <div style="margin-bottom:14px">
            <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">
              R (poloměr)<input id="ism-r" type="number" value="${r}" step="0.1" min="0"
                style="background:#1e1e2e;border:1px solid #45475a;color:#cdd6f4;border-radius:4px;padding:6px;font-size:14px;width:100%;box-sizing:border-box">
            </label>
          </div>` : ''}
          ${fromAbs ? `
          <div style="display:flex;gap:10px;margin-bottom:14px;align-items:flex-end;flex-wrap:wrap">
            <label style="flex:1;min-width:70px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">
              📐 Úhel (°)<input id="ism-ang" type="number" value="${ov._ang !== undefined && !isNaN(ov._ang) ? ov._ang : 45}" step="1"
                style="background:#1e1e2e;border:1px solid #45475a;color:#cdd6f4;border-radius:4px;padding:6px;font-size:14px;width:100%;box-sizing:border-box">
            </label>
            <label style="flex:1;min-width:100px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">
              Ukončení<select id="ism-angmode"
                style="background:#1e1e2e;border:1px solid #45475a;color:#cdd6f4;border-radius:4px;padding:7px 4px;font-size:13px;width:100%;box-sizing:border-box">
                <option value="length" ${ov._angMode !== 'intersect' ? 'selected' : ''}>Zadaná délka</option>
                <option value="intersect" ${ov._angMode === 'intersect' ? 'selected' : ''}>Do průsečíku</option>
              </select>
            </label>
            <label id="ism-anglen-wrap" style="flex:1;min-width:60px;display:${ov._angMode === 'intersect' ? 'none' : 'flex'};flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">
              Délka<input id="ism-anglen" type="number" value="${ov._angLen !== undefined && !isNaN(ov._angLen) ? ov._angLen : 10}" step="0.5" min="0.001"
                style="background:#1e1e2e;border:1px solid #45475a;color:#cdd6f4;border-radius:4px;padding:6px;font-size:14px;width:100%;box-sizing:border-box">
            </label>
            <button id="ism-angcalc" title="Dopočítat X/Z od výchozího bodu: pod úhlem na zadanou délku, nebo do průsečíku s konturou/polotovarem (0° = +Z vodorovně, 90° = +X nahoru)"
              style="padding:7px 12px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;border:2px solid #45475a;background:#313244;color:#cdd6f4;white-space:nowrap">↘ X/Z</button>
          </div>` : ''}
          <div style="margin-bottom:14px">
            <button id="ism-pick" style="width:100%;padding:7px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;border:2px solid #45475a;background:#313244;color:#cdd6f4">
              🎯 Přebrat souřadnice z bodu
            </button>
          </div>
          <div class="cam-confirm-btns">
            <button id="ism-ok" style="padding:7px 22px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;border:none;background:#a6e3a1;color:#1e1e2e">Vložit</button>
            <button id="ism-cancel" style="padding:7px 22px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;border:none;background:#45475a;color:#cdd6f4">Zrušit</button>
          </div>
        </div>`;

      ov._mode = mode;
      ov._type = type;
      ov._x = x;
      ov._z = z;
      ov._r = r;
      ov._target = target;

      ov.querySelectorAll('[data-tgt]').forEach(btn => {
        btn.addEventListener('click', () => {
          syncValues();
          ov._target = btn.dataset.tgt;
          renderModal();
        });
      });

      ov.querySelector('#ism-mode').addEventListener('click', () => {
        syncValues();
        ov._mode = ov._mode === 'ABS' ? 'INC' : 'ABS';
        renderModal();
      });

      ov.querySelectorAll('[data-type]').forEach(btn => {
        btn.addEventListener('click', () => {
          syncValues();
          ov._type = btn.dataset.type;
          renderModal();
        });
      });

      ov.querySelector('#ism-pick').addEventListener('click', enterPickMode);

      // Dopočet X/Z z úhlu od výchozího bodu (CAD nástroj „Úhel") —
      // ukončení zadanou délkou, nebo do průsečíku s konturou/polotovarem.
      const angModeSel = ov.querySelector('#ism-angmode');
      if (angModeSel) angModeSel.addEventListener('change', () => {
        ov._angMode = angModeSel.value;
        const lenWrap = ov.querySelector('#ism-anglen-wrap');
        if (lenWrap) lenWrap.style.display = angModeSel.value === 'intersect' ? 'none' : 'flex';
      });
      const angCalcBtn = ov.querySelector('#ism-angcalc');
      if (angCalcBtn) angCalcBtn.addEventListener('click', () => {
        syncValues();
        const a = ov._ang, l = ov._angLen;
        const toIntersect = ov._angMode === 'intersect';
        if (isNaN(a) || (!toIntersect && (isNaN(l) || l <= 0))) { showToast('Zkontrolujte úhel a délku.'); return; }
        const isDia = S.params.mode === 'DIAMON';
        const fx = isDia ? fromAbs.xAbs / 2 : fromAbs.xAbs;
        const rad = a * Math.PI / 180;
        let ex, ez;
        if (toIntersect) {
          const hit = camRayIntersection(fx, fromAbs.zAbs, Math.sin(rad), Math.cos(rad), null, S._cachedCalc);
          if (!hit) { showToast('Žádný průsečík ve směru úhlu nenalezen.'); return; }
          ex = hit.x; ez = hit.z;
        } else {
          ex = fx + Math.sin(rad) * l;
          ez = fromAbs.zAbs + Math.cos(rad) * l;
        }
        ov._x = Math.round((isDia ? ex * 2 : ex) * 1000) / 1000;
        ov._z = Math.round(ez * 1000) / 1000;
        ov._mode = 'ABS';
        renderModal();
      });

      ov.querySelector('#ism-ok').addEventListener('click', () => {
        syncValues();
        const pt = { type: ov._type, x: ov._x, z: ov._z, r: ov._r || 0, mode: ov._mode };
        const tgt = ov._target;
        ov.remove(); hint.remove();
        _pickHandler = null;
        canvas.style.cursor = 'crosshair';
        onConfirm(pt, tgt);
      });

      ov.querySelector('#ism-cancel').addEventListener('click', () => {
        document.removeEventListener('keydown', handlePickEsc);
        ov.remove(); hint.remove(); _pickHandler = null; canvas.style.cursor = 'crosshair';
      });

      ov.addEventListener('keydown', e => {
        if (e.key === 'Enter') ov.querySelector('#ism-ok').click();
        else if (e.key === 'Escape') ov.querySelector('#ism-cancel').click();
      });
    };

    // Escape při pick módu vrátí modal zpět
    const handlePickEsc = (e) => {
      if (e.key === 'Escape' && pickMode) { exitPickMode(); }
    };
    document.addEventListener('keydown', handlePickEsc);

    renderModal();
    document.body.appendChild(ov);
    setTimeout(() => ov.querySelector('#ism-x') && ov.querySelector('#ism-x').focus(), 50);

    // pick handler – kliknutí na canvas přebere souřadnice bodu
    _pickHandler = (wx, wz) => {
      if (!pickMode) { _pickHandler = null; return; }
      ov._x = Math.round(wx * 100) / 100;
      ov._z = Math.round(wz * 100) / 100;
      document.removeEventListener('keydown', handlePickEsc);
      _pickHandler = null;
      exitPickMode();
    };
  }

  // ── Modal pro přidání G-kód pohybu – bohatá verze (úhel, délka, pick) ──
  function openAddGMoveModal(gn, afterLabel, onConfirm) {
    const isDia = S.params.mode === 'DIAMON';
    const fromX = gn.x;   // world radius
    const fromZ = gn.z;

    let pickMode = false;
    const ov = document.createElement('div');
    ov.className = 'cam-confirm-overlay';
    ov.style.zIndex = '200000';

    const hint = document.createElement('div');
    hint.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:200001;background:#f9e2af;color:#1e1e2e;font-weight:700;font-size:13px;padding:8px 20px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.4);pointer-events:none;display:none';
    hint.textContent = '🎯 Klikněte na bod dráhy nebo kontury…  (Esc = zpět)';
    document.body.appendChild(hint);

    const ms = { type: 'G1', x: +(isDia ? fromX * 2 : fromX).toFixed(3), z: +fromZ.toFixed(3), cr: 0, ang: 45, angLen: 10, angMode: 'length' };

    const syncValues = () => {
      const xEl = ov.querySelector('#agm-x'); if (xEl) ms.x = parseFloat(xEl.value) || 0;
      const zEl = ov.querySelector('#agm-z'); if (zEl) ms.z = parseFloat(zEl.value) || 0;
      const crEl = ov.querySelector('#agm-cr'); if (crEl) ms.cr = parseFloat(crEl.value) || 0;
      const aEl = ov.querySelector('#agm-ang'); if (aEl) ms.ang = parseFloat(aEl.value);
      const alEl = ov.querySelector('#agm-anglen'); if (alEl) ms.angLen = parseFloat(alEl.value);
      const amEl = ov.querySelector('#agm-angmode'); if (amEl) ms.angMode = amEl.value;
    };

    const enterPickMode = () => { syncValues(); pickMode = true; ov.style.display = 'none'; hint.style.display = 'block'; canvas.style.cursor = 'crosshair'; };
    const exitPickMode = () => { pickMode = false; ov.style.display = ''; hint.style.display = 'none'; canvas.style.cursor = 'crosshair'; renderModal(); setTimeout(() => { const el = ov.querySelector('#agm-x'); if (el) { el.focus(); el.select(); } }, 30); };

    const inp = 'background:#1e1e2e;border:1px solid #45475a;color:#cdd6f4;border-radius:4px;padding:6px;font-size:14px;width:100%;box-sizing:border-box';
    const selStyle = 'background:#1e1e2e;border:1px solid #45475a;color:#cdd6f4;border-radius:4px;padding:7px 4px;font-size:13px;width:100%;box-sizing:border-box';

    const renderModal = () => {
      const isArc = ms.type === 'G2' || ms.type === 'G3';
      ov.innerHTML = `
        <div class="cam-confirm-box" style="min-width:340px;max-width:95vw">
          <div style="font-weight:bold;font-size:14px;margin-bottom:14px;color:#89b4fa">➕ Přidat pohyb za řádek ${afterLabel}</div>
          <div style="display:flex;gap:6px;margin-bottom:14px">
            ${['G0','G1','G2','G3'].map(t => `<button data-type="${t}" style="flex:1;padding:6px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;border:2px solid ${t===ms.type?'#89b4fa':'#45475a'};background:${t===ms.type?'#89b4fa':'#313244'};color:${t===ms.type?'#1e1e2e':'#cdd6f4'}">${t}</button>`).join('')}
          </div>
          <div style="display:flex;gap:10px;margin-bottom:${isArc?'10px':'14px'}">
            <label style="flex:1;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">X${isDia?' (⌀)':''}<input id="agm-x" type="number" value="${ms.x}" step="0.1" style="${inp}"></label>
            <label style="flex:1;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">Z<input id="agm-z" type="number" value="${ms.z}" step="0.1" style="${inp}"></label>
          </div>
          ${isArc ? `<div style="margin-bottom:14px"><label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">CR (poloměr)<input id="agm-cr" type="number" value="${ms.cr}" step="0.1" min="0" style="${inp}"></label></div>` : ''}
          <div style="display:flex;gap:10px;margin-bottom:14px;align-items:flex-end;flex-wrap:wrap">
            <label style="flex:1;min-width:70px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">📐 Úhel (°)<input id="agm-ang" type="number" value="${!isNaN(ms.ang)?ms.ang:45}" step="1" style="${inp}"></label>
            <label style="flex:1;min-width:100px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">Ukončení<select id="agm-angmode" style="${selStyle}"><option value="length" ${ms.angMode!=='intersect'?'selected':''}>Zadaná délka</option><option value="intersect" ${ms.angMode==='intersect'?'selected':''}>Do průsečíku</option></select></label>
            <label id="agm-anglen-wrap" style="flex:1;min-width:60px;display:${ms.angMode==='intersect'?'none':'flex'};flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">Délka<input id="agm-anglen" type="number" value="${!isNaN(ms.angLen)?ms.angLen:10}" step="0.5" min="0.001" style="${inp}"></label>
            <button id="agm-angcalc" title="Dopočítat X/Z od výchozího bodu pod úhlem (0°=+Z vodorovně, 90°=+X nahoru)" style="padding:7px 12px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;border:2px solid #45475a;background:#313244;color:#cdd6f4;white-space:nowrap">↘ X/Z</button>
          </div>
          <div style="margin-bottom:14px">
            <button id="agm-pick" style="width:100%;padding:7px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;border:2px solid #45475a;background:#313244;color:#cdd6f4">🎯 Přebrat souřadnice z bodu</button>
          </div>
          <div class="cam-confirm-btns">
            <button id="agm-ok" style="padding:7px 22px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;border:none;background:#89b4fa;color:#1e1e2e">Přidat</button>
            <button id="agm-cancel" style="padding:7px 22px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;border:none;background:#45475a;color:#cdd6f4">Zrušit</button>
          </div>
        </div>`;

      ov.querySelectorAll('[data-type]').forEach(btn => btn.addEventListener('click', () => { syncValues(); ms.type = btn.dataset.type; renderModal(); }));
      ov.querySelector('#agm-pick').addEventListener('click', enterPickMode);

      const angModeSel = ov.querySelector('#agm-angmode');
      angModeSel.addEventListener('change', () => {
        ms.angMode = angModeSel.value;
        ov.querySelector('#agm-anglen-wrap').style.display = ms.angMode === 'intersect' ? 'none' : 'flex';
      });

      ov.querySelector('#agm-angcalc').addEventListener('click', () => {
        syncValues();
        const a = ms.ang, l = ms.angLen, toIntersect = ms.angMode === 'intersect';
        if (isNaN(a) || (!toIntersect && (isNaN(l) || l <= 0))) { showToast('Zkontrolujte úhel a délku.'); return; }
        const rad = a * Math.PI / 180;
        let ex, ez;
        if (toIntersect) {
          const hit = camRayIntersection(fromX, fromZ, Math.sin(rad), Math.cos(rad), null, S._cachedCalc);
          if (!hit) { showToast('Žádný průsečík ve směru úhlu nenalezen.'); return; }
          ex = hit.x; ez = hit.z;
        } else {
          ex = fromX + Math.sin(rad) * l;
          ez = fromZ + Math.cos(rad) * l;
        }
        ms.x = Math.round((isDia ? ex * 2 : ex) * 1000) / 1000;
        ms.z = Math.round(ez * 1000) / 1000;
        renderModal();
      });

      const doConfirm = () => {
        syncValues();
        document.removeEventListener('keydown', handlePickEsc);
        ov.remove(); hint.remove();
        _pickHandler = null; canvas.style.cursor = 'crosshair';
        onConfirm({ type: ms.type, x: isDia ? ms.x / 2 : ms.x, z: ms.z, cr: ms.cr });
      };
      const doCancel = () => {
        document.removeEventListener('keydown', handlePickEsc);
        ov.remove(); hint.remove(); _pickHandler = null; canvas.style.cursor = 'crosshair';
      };
      ov.querySelector('#agm-ok').addEventListener('click', doConfirm);
      ov.querySelector('#agm-cancel').addEventListener('click', doCancel);
      ov.addEventListener('keydown', e => { if (e.key === 'Enter') doConfirm(); else if (e.key === 'Escape') doCancel(); });
      setTimeout(() => { const el = ov.querySelector('#agm-x'); if (el) { el.focus(); el.select(); } }, 30);
    };

    const handlePickEsc = (e) => { if (e.key === 'Escape' && pickMode) exitPickMode(); };
    document.addEventListener('keydown', handlePickEsc);

    renderModal();
    document.body.appendChild(ov);

    _pickHandler = (wx, wz) => {
      if (!pickMode) { _pickHandler = null; return; }
      ms.x = Math.round((isDia ? wx * 2 : wx) * 1000) / 1000;
      ms.z = Math.round(wz * 1000) / 1000;
      document.removeEventListener('keydown', handlePickEsc);
      _pickHandler = null;
      exitPickMode();
    };
  }

  let _pickHandler = null;

  canvasWrap.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const oldScale = S.view.scale;
    const newScale = Math.max(0.2, Math.min(oldScale * (1 - Math.sign(e.deltaY) * 0.15), 200));
    S.view.panX = mx - (mx - S.view.panX) * (newScale / oldScale);
    S.view.panY = my - (my - S.view.panY) * (newScale / oldScale);
    S.view.scale = newScale;
    scheduleFrame(draw);   // zoom kolečkem: sloučit překreslení do snímku
  }, { passive: false });

  let lastMousePos = { x: 0, y: 0 };
  let lastPinchDist = null;
  let _draggingStock = false;
  let _draggingStockPt = false;   // tažení bodu stock polyline (ne válcový handle)
  let _draggingPartOff = null;    // 'dojezd' | 'start' — tažení úchopu upichnutí (jen v ose X)
  let _draggedContourSeg = null;  // {idx1,idx2,isStock,lockAxis} – tažení celé úsečky
  let _hoverContourSeg = null;    // {idx1,idx2,isStock} – hover zvýraznění segmentu
  let _mdX = 0, _mdY = 0, _panelPending = false;

  // ── Double-click to enter rect selection mode ──
  canvasWrap.addEventListener('dblclick', e => {
    if (S.profileTraceMode) { e.preventDefault(); _finishProfileTrace(); return; }
    if (!S.pointDragEnabled || S.simRunning) return;
    e.preventDefault();
    S.rectSelecting = true;
    S.selectedPoints.clear();
    S.snapLines = [];
    canvas.style.cursor = 'crosshair';
    draw();
  });

  // Plovoucí tlačítka ✓ Dokončit / ✗ Zrušit pro trasování profilu (mobil bez klávesnice)
  canvasWrap.querySelector('.cam-sim-trace-confirm').addEventListener('click', e => {
    e.stopPropagation();
    _finishProfileTrace();
  });
  canvasWrap.querySelector('.cam-sim-trace-cancel').addEventListener('click', e => {
    e.stopPropagation();
    _cancelTraceStep();
  });

  canvasWrap.addEventListener('mousedown', e => {
    _mdX = e.clientX; _mdY = e.clientY; _panelPending = false;
    // Ignoruj „ghost" myší události, které prohlížeč generuje po dotyku
    // (skutečné dotykové akce jdou přes _camDispatchMouse = _camDispatching).
    if (!S._camDispatching && S._camGhostUntil && Date.now() < S._camGhostUntil) return;
    // Klik na plovoucí tlačítka ✓/✗ trasování – neinterpretovat jako bod kontury
    if (e.target.closest('.cam-sim-trace-confirm, .cam-sim-trace-cancel')) return;
    // Upichnutí – klik určí Z rovinu řezu (snap na bod/hranu má přednost).
    if (S.partOffPickMode) {
      const { wz } = _traceWorldFromClient(e.clientX, e.clientY);
      if (isFinite(wz)) {
        S.params.partOffZ = Math.round(wz * 1000) / 1000;
        S.partOffPickMode = false;
        // Horní bod úsečky (Start X) předvyplnit povrchem polotovaru — jen když
        // ještě není nastavený (uživatel ho pak může přetáhnout níž do kapsy).
        if (!(parseFloat(S.params.partOffStartX) > 0)) {
          const stTop = (S._cachedCalc && parseFloat(S._cachedCalc.stockTopX)) || (parseFloat(S.params.stockDiameter) || 0) / 2;
          if (stTop > 0) S.params.partOffStartX = Math.round(stTop * 100) / 100;
        }
        showToast(`Upichnutí v Z=${S.params.partOffZ.toFixed(2)}`);
        _regenGCode();   // upichovací cyklus se projeví hned
      }
      e.stopPropagation();
      return;
    }
    // Trasování profilu – bod se přidá JEN když klik trefí snapovatelný
    // bod (vrchol kontury/polotovaru) nebo průsečík/koncový bod pomocné
    // čáry. Mimo snap se nic nepřidá a klik/tažení jen posune pohled (pan).
    if (S.profileTraceMode) {
      const { wx, wz, snapped, insertGuideIdx } = _traceWorldFromClient(e.clientX, e.clientY);
      if (snapped) {
        _addTracePoint(wx, wz, insertGuideIdx);
        e.stopPropagation();
        return;
      }
      // mimo snap → jen posun pohledu
      S.isDragging = true;
      lastMousePos = { x: e.clientX, y: e.clientY };
      e.stopPropagation();
      return;
    }
    // Pick handler pro modal vložení segmentu
    if (_pickHandler) {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
      const prms = S.params || {};
      let wx, wz;
      if (prms.machineStructure === 'carousel') {
        wx = hS * (sx - S.view.panX) / S.view.scale;
        wz = vS * (sy - S.view.panY) / S.view.scale;
      } else {
        wz = hS * (sx - S.view.panX) / S.view.scale;
        wx = vS * (sy - S.view.panY) / S.view.scale;
      }
      // snap na nejbližší bod kontury
      const allPts = [...S.contourPoints, ...S.stockPoints];
      let best = null, bestD = Infinity;
      for (const p of allPts) {
        const d = Math.hypot(p.x - wx, p.z - wz);
        if (d < bestD) { bestD = d; best = p; }
      }
      if (best && bestD < 20 / S.view.scale) { wx = best.x; wz = best.z; }
      _pickHandler(wx, wz);
      e.stopPropagation();
      return;
    }
    // Rect selection start
    if (S.rectSelecting) {
      const rect = canvas.getBoundingClientRect();
      S.rectStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      S.rectEnd = null;
      S.isDragging = true;
      lastMousePos = { x: e.clientX, y: e.clientY };
      return;
    }
    // Úprava drah (odemčený zámek): mazání (−), přidání (+), tažení bodu/úsečky.
    // Při add/del se nejdřív zkusí dráha; když klik dráhu netrefí, propadne
    // dál na úpravu bodů kontury (sjednocené odemčení tvar + dráhy).
    if (S.gcodeEditEnabled) {
      // Prodloužit / oříznout: klik na koncový bod úsečky → k průsečíku.
      if (S.gExtendMode || S.gTrimMode) {
        const gn = getGNodeAt(e.clientX, e.clientY);
        if (gn) { extendTrimNode(gn, S.gExtendMode ? 1 : -1); return; }
        // Konstrukční / mezní čára — klik na konec nebo kamkoli na čáru.
        // Auto mezní čára se přitom převede na trvalou uživatelskou.
        extendTrimGuideClick(e.clientX, e.clientY, S.gExtendMode ? 1 : -1);
        return;
      }
      // − aktivní: klik na koncový bod smaže příslušný pohyb z G-kódu.
      if (S.delPointMode) {
        const gn = getGNodeAt(e.clientX, e.clientY);
        if (gn) { pushHistory(); deleteGLine(gn.lineIdx); return; }
      } else if (S.addPointMode) {
        // + aktivní: klik na koncový bod → dialog pro nový pohyb (G0/G1/G2/G3).
        const gn = getGNodeAt(e.clientX, e.clientY);
        if (gn) {
          const lns = S.manualGCode.split('\n');
          const nm = ((lns[gn.lineIdx] || '').match(/^\s*(N\d+)/) || [])[1] || `řádek ${gn.lineIdx + 1}`;
          openAddGMoveModal(gn, nm, mv => {
            pushHistory();
            insertGMove(gn.lineIdx, { type: mv.type, x: mv.x, z: mv.z, cr: mv.cr });
          });
          return;
        }
      } else {
        // Konstrukční (nekonečná) čára: uchopení koncového bodu → posun PO
        // čáře (prodloužit/zkrátit) se snapem k průsečíkům.
        const gEnd = getUserGuideEndAt(e.clientX, e.clientY);
        if (gEnd) {
          pushHistory();
          S._draggedGuideEnd = gEnd; S.isDragging = true;
          lastMousePos = { x: e.clientX, y: e.clientY };
          return;
        }
        // Uchopení konce AUTOMATICKÉ mezní čáry → převést na trvalou
        // uživatelskou (nekonečnou) čáru a táhnout její konec.
        const autoEnd = getGuideEndpointAt(e.clientX, e.clientY) ? findAutoGuideForAction(e.clientX, e.clientY) : null;
        if (autoEnd) {
          pushHistory();
          if (!S.guideLines) S.guideLines = [];
          S.guideLines.push({ x1: autoEnd.x1, z1: autoEnd.z1, x2: autoEnd.x2, z2: autoEnd.z2 });
          S._draggedGuideEnd = { guideIdx: S.guideLines.length - 1, endIdx: autoEnd.endIdx };
          S.isDragging = true;
          lastMousePos = { x: e.clientX, y: e.clientY };
          showToast('Mezní čára převedena na konstrukční (nekonečnou) čáru ✓');
          return;
        }
        // Priorita: bod kontury (vrchol = tvar) → uzel dráhy → úsečka dráhy.
        // Vrcholy kontury mají přednost (zámek je primárně na tvar; navíc na
        // nich leží uzly dokončovací dráhy). Uzly/úsečky mimo vrcholy
        // (hrubování, rychloposuvy) ovládají dráhu.
        const cptHit = S.pointDragEnabled && getPointAt(e.clientX, e.clientY) !== null;
        if (!cptHit) {
          const gnode = getGNodeAt(e.clientX, e.clientY);
          if (gnode) {
            // refPoint = předchozí bod (start pohybu) pro úhlový snap
            const sp = S._cachedCalc && S._cachedCalc.simPath;
            const prev = (sp && gnode.simIdx > 0) ? sp[gnode.simIdx - 1] : null;
            gnode.refPoint = prev ? { x: prev.x, z: prev.z } : null;
            S.draggedGNode = gnode; S.isDragging = true; S._gdragNeedHistory = true;
            // Už při kliknutí (bez tažení) skoč kurzorem na odpovídající
            // řádek G-kódu a zvýrazni ho.
            S._gcodeFocusLine = gnode.lineIdx; updateCodeHighlight();
            lastMousePos = { x: e.clientX, y: e.clientY };
            return;
          }
          const gseg = getGSegmentAt(e.clientX, e.clientY);
          if (gseg) {
            const rect = canvas.getBoundingClientRect();
            gseg.startW = _gToWorld(e.clientX - rect.left, e.clientY - rect.top);
            gseg.orig1 = { x: gseg.p1.x, z: gseg.p1.z };
            gseg.orig2 = { x: gseg.p2.x, z: gseg.p2.z };
            gseg.lockAxis = null;
            S._draggedGSeg = gseg; S.isDragging = true; S._gdragNeedHistory = true;
            // Skok kurzoru na řádek G-kódu už při kliknutí (bez tažení).
            S._gcodeFocusLine = gseg.lineIdx; updateCodeHighlight();
            lastMousePos = { x: e.clientX, y: e.clientY };
            return;
          }
        }
        // jinak (vrchol kontury) spadne na tažení bodu kontury níže
      }
    }
    // Zamčené body (mimo režim úprav drah): klik na dráhu nehýbe tvarem,
    // jen označí + skočí kurzorem na odpovídající řádek G-kódu. Nevrací se,
    // takže tažením lze dál posouvat pohled (pan).
    if (!S.gcodeEditEnabled && !S.simRunning) {
      const gn = getGNodeAt(e.clientX, e.clientY, true);
      const gs = gn ? null : getGSegmentAt(e.clientX, e.clientY, true);
      if (gn || gs) { S._gcodeFocusLine = (gn || gs).lineIdx; updateCodeHighlight(); }
    }
    // Z/X-limity – mají přednost před ostatními body, lze tahat i bez odemčení.
    const zKey = getZLimitAt(e.clientX, e.clientY);
    if (zKey !== null) {
      pushHistory();
      S.draggedLimit = zKey; S.isDragging = true;
      lastMousePos = { x: e.clientX, y: e.clientY };
      return;
    }
    const xKey = getXLimitAt(e.clientX, e.clientY);
    if (xKey !== null) {
      pushHistory();
      S.draggedLimit = xKey; S.isDragging = true;
      lastMousePos = { x: e.clientX, y: e.clientY };
      return;
    }
    const stockIdx = getStockHandleAt(e.clientX, e.clientY);
    if (S.pointDragEnabled && stockIdx !== null) {
      pushHistory(); S.draggedPointId = stockIdx; S.isDragging = true; _draggingStock = true;
      lastMousePos = { x: e.clientX, y: e.clientY };
      return;
    }
    if (S.addPointMode) {
      const exitAddMode = () => { S.addPointMode = false; toolbar.querySelector('[data-act="addpt"]').classList.remove('cam-sim-active'); canvas.style.cursor = 'crosshair'; };
      // Klik na koncový bod pomocné čáry → vložit bod kontury přesně
      // v tečném bodě / průsečíku (rozdělí úsečku či oblouk na místě).
      const gp = getGuideEndpointAt(e.clientX, e.clientY);
      if (gp && insertPointOnSegmentAt(gp.x, gp.z)) {
        exitAddMode();
        showToast('Bod vložen na konturu v místě pomocné čáry ✓');
        return;
      }
      const found = getAnyPointAt(e.clientX, e.clientY);
      if (found) { handleInsertAfter(found.idx, found.isStock); exitAddMode(); return; }
      // Klik na oblouk → tečná úsečka pod úhlem (CAD nástroj „Úhel").
      const arcFound = getArcSegmentAt(e.clientX, e.clientY);
      if (arcFound) { openTangentLineModal(arcFound); exitAddMode(); }
      return;
    }
    if (S.delPointMode) {
      const found = getAnyPointAt(e.clientX, e.clientY);
      if (found) {
        const list = found.isStock ? S.stockPoints : S.contourPoints;
        if (list.length > 1) {
          pushHistory();
          list.splice(found.idx, 1);
          fullUpdate();
        } else {
          showToast('Nelze odebrat poslední bod.');
        }
        return;
      }
      // Klik mimo body: smazat ruční pomocnou čáru pod kurzorem.
      const gIdx = getUserGuideAt(e.clientX, e.clientY);
      if (gIdx !== null) {
        S.guideLines.splice(gIdx, 1);
        saveState();
        draw();
        showToast('Pomocná čára smazána ✓');
      }
      return;
    }
    // Úchopy upichnutí (Dojezd X / Start X) mají přednost před body kontury.
    const poHandle = S.pointDragEnabled ? getPartOffHandleAt(e.clientX, e.clientY) : null;
    if (poHandle) {
      pushHistory();
      _draggingPartOff = poHandle; S.isDragging = true;
      lastMousePos = { x: e.clientX, y: e.clientY };
      return;
    }
    const pointHit = S.pointDragEnabled ? getAnyPointAt(e.clientX, e.clientY) : null;
    if (S.pointDragEnabled && pointHit !== null) {
      pushHistory();
      S.draggedPointId = pointHit.idx; S.isDragging = true;
      _draggingStockPt = pointHit.isStock;
    } else if (S.pointDragEnabled) {
      const seg = getContourSegmentAt(e.clientX, e.clientY);
      if (seg) {
        pushHistory();
        _draggedContourSeg = { ...seg, lockAxis: null };
        S.isDragging = true;
      } else { S.isDragging = true; }
    } else { S.isDragging = true; }
    lastMousePos = { x: e.clientX, y: e.clientY };
  });

  canvasWrap.addEventListener('mousemove', e => {
    // Rect selection drag
    if (S.rectSelecting && S.isDragging && S.rectStart) {
      const rect = canvas.getBoundingClientRect();
      S.rectEnd = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      draw();
      return;
    }

    // SNAP indikátor – sledování pod kurzorem (i bez tažení).
    if (S.snapEnabled && !S.isDragging) {
      const prev = S._snap;
      const next = camSnap(e.clientX, e.clientY);
      const changed = (!!prev !== !!next) || (prev && next && (Math.abs(prev.x - next.x) > 1e-6 || Math.abs(prev.z - next.z) > 1e-6 || prev.type !== next.type));
      S._snap = next;
      if (changed) draw();
    }

    // Tažení koncového bodu konstrukční (nekonečné) čáry PO čáře — posun
    // se omezí na směr čáry, druhý konec drží směr; snap k průsečíkům.
    if (S.gcodeEditEnabled && S.isDragging && S._draggedGuideEnd) {
      const ge = S._draggedGuideEnd;
      const g = S.guideLines[ge.guideIdx];
      if (g) {
        const rect = canvas.getBoundingClientRect();
        const w = _gToWorld(e.clientX - rect.left, e.clientY - rect.top);
        const ax = ge.endIdx === 0 ? g.x2 : g.x1, az = ge.endIdx === 0 ? g.z2 : g.z1; // kotva = druhý konec
        let dx = (ge.endIdx === 0 ? g.x1 : g.x2) - ax, dz = (ge.endIdx === 0 ? g.z1 : g.z2) - az;
        const L = Math.hypot(dx, dz);
        if (L > 1e-9) {
          dx /= L; dz /= L;
          // projekce kurzoru na nekonečnou čáru
          const tproj = (w.x - ax) * dx + (w.z - az) * dz;
          let px = ax + tproj * dx, pz = az + tproj * dz;
          // snap na nejbližší průsečík čáry s geometrií (v dosahu)
          S._snap = null;
          if (S.snapEnabled) {
            const tolW = 12 / S.view.scale;
            let bestD = tolW, bestP = null;
            for (const h of lineGeometryHits(ax, az, dx, dz)) {
              const d = Math.hypot(h.x - px, h.z - pz);
              if (d < bestD) { bestD = d; bestP = h; }
            }
            if (bestP) { px = bestP.x; pz = bestP.z; S._snap = { x: px, z: pz, type: 'edge' }; }
          }
          if (ge.endIdx === 0) { g.x1 = px; g.z1 = pz; } else { g.x2 = px; g.z2 = pz; }
          draw();
        }
      }
      return;
    }

    // Úprava drah (✥ Dráhy) – tažení koncového bodu / úsečky + hover.
    if (S.gcodeEditEnabled) {
      const rect = canvas.getBoundingClientRect();
      const ensureHistory = () => {
        if (S._gdragNeedHistory) { pushHistory(); S._gdragNeedHistory = false; }
      };
      if (S.isDragging && S.draggedGNode) {
        ensureHistory();
        S._gcodeFocusLine = S.draggedGNode.lineIdx;   // skok kurzoru na řádek
        // snap k bodu/hraně; jinak úhlový snap (vodorovně/kolmo) vůči ref bodu
        const w = snapWorld(e.clientX, e.clientY, S.draggedGNode.refPoint);
        writeGLine(S.draggedGNode.lineIdx, w.x, w.z);
        return;
      }
      if (S.isDragging && S._draggedGSeg) {
        const seg = S._draggedGSeg;
        const w = _gToWorld(e.clientX - rect.left, e.clientY - rect.top);
        let dX = w.x - seg.startW.x, dZ = w.z - seg.startW.z;
        // Zamknutí na jednu osu (podle převažujícího směru tažení) — posun
        // úsečky jen v X nebo jen v Z, druhá souřadnice se nemění.
        if (!seg.lockAxis && Math.hypot(dX, dZ) > 0.15)
          seg.lockAxis = Math.abs(dX) >= Math.abs(dZ) ? 'x' : 'z';
        if (!seg.lockAxis) return;       // dokud se nerozhodne osa, nehýbej
        ensureHistory();
        S._gcodeFocusLine = seg.lineIdx;  // skok kurzoru na řádek
        if (seg.lockAxis === 'x') dZ = 0; else dX = 0;
        // Zapiš jen zamčenou osu (druhá = null → na řádku zůstává beze změny).
        const edits = [{ lineIdx: seg.lineIdx,
          wx: seg.lockAxis === 'x' ? seg.orig2.x + dX : null,
          wz: seg.lockAxis === 'z' ? seg.orig2.z + dZ : null }];
        if (seg.startIdx != null) edits.push({ lineIdx: seg.startIdx,
          wx: seg.lockAxis === 'x' ? seg.orig1.x + dX : null,
          wz: seg.lockAxis === 'z' ? seg.orig1.z + dZ : null });
        writeGLines(edits);
        return;
      }
      if (!S.isDragging) {
        const hn = getGNodeAt(e.clientX, e.clientY);
        // bod kontury má přednost před úsečkou dráhy (viz mousedown)
        const cptHover = !hn && S.pointDragEnabled && getAnyPointAt(e.clientX, e.clientY) !== null;
        const hs = (hn || cptHover) ? null : getGSegmentAt(e.clientX, e.clientY);
        const changed = ((S.hoverGNode && S.hoverGNode.lineIdx) || null) !== ((hn && hn.lineIdx) || null)
          || ((S.hoverGSeg && S.hoverGSeg.simIdx) || null) !== ((hs && hs.simIdx) || null);
        S.hoverGNode = hn; S.hoverGSeg = hs;
        if (hn || hs) {                    // dráha pod kurzorem → tažení dráhy
          canvas.style.cursor = 'move';
          if (changed) draw();
          return;
        }
        // žádná dráha pod kurzorem → spadne na hover bodů kontury níže
        if (changed) draw();
      }
    }

    // Hit-testing (hover/kurzor) JEN když netáhneme — během tažení se nad
    // ničím nepřejíždí, tak veškeré hledání bodů/úchopů/limitů přeskočíme.
    if (!S.isDragging) {
      const zHover = getZLimitAt(e.clientX, e.clientY);
      const stockHover = S.pointDragEnabled ? getStockHandleAt(e.clientX, e.clientY) : null;
      const pointHit = S.pointDragEnabled ? getAnyPointAt(e.clientX, e.clientY) : null;
      if (S.addPointMode) {
        const found = getAnyPointAt(e.clientX, e.clientY);
        canvas.style.cursor = found ? 'pointer'
          : (getGuideEndpointAt(e.clientX, e.clientY) || getArcSegmentAt(e.clientX, e.clientY)) ? 'pointer' : 'copy';
        const newId = found ? found.idx : null, newIsStock = !!(found && found.isStock);
        if (S.hoverPointId !== newId || S._hoverIsStock !== newIsStock) { S.hoverPointId = newId; S._hoverIsStock = newIsStock; draw(); }
        return;
      }
      if (zHover !== null) {
        canvas.style.cursor = S.params.machineStructure === 'carousel' ? 'ns-resize' : 'ew-resize';
        return;
      }
      const xHover = getXLimitAt(e.clientX, e.clientY);
      if (xHover !== null) {
        canvas.style.cursor = S.params.machineStructure === 'carousel' ? 'ew-resize' : 'ns-resize';
        return;
      }
      // Úchopy upichnutí (Dojezd X / Start X) — přednost, tažení jen v ose X.
      const poHover = S.pointDragEnabled ? getPartOffHandleAt(e.clientX, e.clientY) : null;
      if (poHover !== null) {
        canvas.style.cursor = S.params.machineStructure === 'carousel' ? 'ew-resize' : 'ns-resize';
        if (S._hoverPartOff !== poHover) { S._hoverPartOff = poHover; S.hoverPointId = null; S._hoverIsStock = false; _hoverContourSeg = null; draw(); }
        return;
      }
      if (S._hoverPartOff !== null) { S._hoverPartOff = null; draw(); }
      if (stockHover !== null) {
        canvas.style.cursor = 'move';
        if (S.hoverPointId !== stockHover || !S._hoverIsStock) { S.hoverPointId = stockHover; S._hoverIsStock = true; _hoverContourSeg = null; draw(); }
      } else if (pointHit !== null) {
        canvas.style.cursor = 'move';
        if (S.hoverPointId !== pointHit.idx || S._hoverIsStock !== pointHit.isStock) {
          S.hoverPointId = pointHit.idx; S._hoverIsStock = pointHit.isStock; _hoverContourSeg = null; draw();
        }
      } else {
        const segHit = S.pointDragEnabled ? getContourSegmentAt(e.clientX, e.clientY) : null;
        const prevSeg = _hoverContourSeg;
        const changed = (S.hoverPointId !== null) || (S._hoverIsStock)
          || (!!prevSeg !== !!segHit)
          || (prevSeg && segHit && (prevSeg.idx1 !== segHit.idx1 || prevSeg.idx2 !== segHit.idx2 || prevSeg.isStock !== segHit.isStock));
        S.hoverPointId = null; S._hoverIsStock = false; _hoverContourSeg = segHit;
        canvas.style.cursor = (S.pointDragEnabled && segHit !== null) ? 'move' : 'crosshair';
        if (changed) draw();
      }
      return;
    }
    const dx = e.clientX - lastMousePos.x;
    const dy = e.clientY - lastMousePos.y;
    lastMousePos = { x: e.clientX, y: e.clientY };
    if (S.draggedLimit) {
      const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
      if (S.draggedLimit in S.xLimits) {
        // X-rozsah: tažení v ose X — soustruh dy, karusel dx
        const dX = S.params.machineStructure === 'carousel'
          ? (hS * dx / S.view.scale)
          : (dy / (vS * S.view.scale));
        const cur = parseFloat(S.xLimits[S.draggedLimit]) || 0;
        S.xLimits[S.draggedLimit] = Math.round((cur + dX) * 100) / 100;
      } else {
        // Z-rozsah: tažení v ose Z — soustruh dx, karusel vS*dy
        const dZ = S.params.machineStructure === 'carousel' ? (vS * dy / S.view.scale) : (hS * dx / S.view.scale);
        const cur = parseFloat(S.zLimits[S.draggedLimit]) || 0;
        S.zLimits[S.draggedLimit] = Math.round((cur + dZ) * 100) / 100;
      }
      scheduleFrame(draw);
      return;
    }
    if (_draggingPartOff) {
      // Tažení úchopu upichnutí — jen v ose X, nastaví Dojezd X / Start X.
      _applyPartOffHandle(_draggingPartOff, _partOffRadiusFromClient(e.clientX, e.clientY));
      lastMousePos = { x: e.clientX, y: e.clientY };
      scheduleFrame(draw);   // úsečka + úchopy sledují kurzor; dráhy se přegenerují po puštění
      return;
    }
    if (_draggingStock && S.draggedPointId !== null) {
      let rawDX, rawDZ;
      const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
      if (S.params.machineStructure === 'carousel') { rawDX = hS * dx / S.view.scale; rawDZ = vS * dy / S.view.scale; }
      else { rawDZ = hS * dx / S.view.scale; rawDX = vS * dy / S.view.scale; }
      if (S.draggedPointId === 0) {
        S.params.stockDiameter = Math.max(1, parseFloat(S.params.stockDiameter) + rawDX * 2);
        S.params.stockFace = Math.round((parseFloat(S.params.stockFace) + rawDZ) * 100) / 100;
      } else {
        S.params.stockDiameter = Math.max(1, parseFloat(S.params.stockDiameter) + rawDX * 2);
        S.params.stockLength = Math.max(1, Math.round((parseFloat(S.params.stockLength) - rawDZ) * 100) / 100);
      }
      S.params.stockDiameter = Math.round(S.params.stockDiameter * 100) / 100;
      // Během tažení jen lehký náhled (body + kontura) — plynulé i u složité
      // kontury. Plný přepočet drah proběhne po puštění (handleMouseUp); dráhy
      // se po dobu tažení skryjí a po puštění se zase ukážou.
      scheduleFrame(() => { S._cachedCalc = calculate(true); draw(); });
    } else if (S.draggedPointId !== null) {
      let dX_unit = 0, dZ_unit = 0;
      const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
      if (S.params.machineStructure === 'carousel') {
        dX_unit = hS * dx / S.view.scale; dZ_unit = vS * dy / S.view.scale;
      } else {
        dZ_unit = hS * dx / S.view.scale; dX_unit = vS * dy / S.view.scale;
      }
      if (S.params.mode === 'DIAMON') dX_unit *= 2;
      const list = _draggingStockPt ? S.stockPoints : S.contourPoints;

      // Multi-drag: if dragging a selected point, move all selected
      if (S.selectedPoints.size > 1 && S.selectedPoints.has(S.draggedPointId)) {
        S.snapLines = [];
        S.selectedPoints.forEach(idx => {
          const p = list[idx];
          if (p) { p.x = parseFloat(p.x) + dX_unit; p.z = parseFloat(p.z) + dZ_unit; }
        });
      } else {
        const pt = list[S.draggedPointId];
        pt.x = parseFloat(pt.x) + dX_unit;
        pt.z = parseFloat(pt.z) + dZ_unit;

        // Snap guides
        S.snapLines = [];
        const allAbs = resolvePointsToAbsolute(list);
        const dragAbs = allAbs[S.draggedPointId];
        if (dragAbs) {
          const isDia = S.params.mode === 'DIAMON';
          const dragWX = isDia ? dragAbs.xAbs / 2 : dragAbs.xAbs;
          const dragWZ = dragAbs.zAbs;
          const snapTol = 3 / S.view.scale;
          for (let i = 0; i < allAbs.length; i++) {
            if (i === S.draggedPointId) continue;
            const otherWX = isDia ? allAbs[i].xAbs / 2 : allAbs[i].xAbs;
            const otherWZ = allAbs[i].zAbs;
            if (Math.abs(dragWX - otherWX) < snapTol) {
              S.snapLines.push({ type: 'x', val: otherWX, from: Math.min(dragWZ, otherWZ), to: Math.max(dragWZ, otherWZ) });
              if (pt.mode === 'ABS') pt.x = isDia ? otherWX * 2 : otherWX;
            }
            if (Math.abs(dragWZ - otherWZ) < snapTol) {
              S.snapLines.push({ type: 'z', val: otherWZ, from: Math.min(dragWX, otherWX), to: Math.max(dragWX, otherWX) });
              if (pt.mode === 'ABS') pt.z = otherWZ;
            }
          }
        }
      }

      // Během tažení jen lehký náhled (body + kontura) — plynulé i u složité
      // kontury. Plný přepočet drah proběhne po puštění (handleMouseUp); dráhy
      // se po dobu tažení skryjí a po puštění se zase ukážou.
      scheduleFrame(() => { S._cachedCalc = calculate(true); draw(); });
    } else if (_draggedContourSeg !== null) {
      // Tažení celé úsečky: oba krajní body se posunou spolu, s zamčením na osu.
      const seg = _draggedContourSeg;
      let dX_unit = 0, dZ_unit = 0;
      const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
      if (S.params.machineStructure === 'carousel') { dX_unit = hS * dx / S.view.scale; dZ_unit = vS * dy / S.view.scale; }
      else { dZ_unit = hS * dx / S.view.scale; dX_unit = vS * dy / S.view.scale; }
      if (S.params.mode === 'DIAMON') dX_unit *= 2;
      // Zamknout na převažující osu po překročení prahu
      if (!seg.lockAxis && (Math.abs(dX_unit) + Math.abs(dZ_unit)) > 0.05) {
        seg.lockAxis = Math.abs(dX_unit) >= Math.abs(dZ_unit) ? 'x' : 'z';
      }
      if (seg.lockAxis === 'x') dZ_unit = 0; else if (seg.lockAxis === 'z') dX_unit = 0;
      const segList = seg.isStock ? S.stockPoints : S.contourPoints;
      const pt1 = segList[seg.idx1], pt2 = segList[seg.idx2];
      if (pt1) { pt1.x = parseFloat(pt1.x) + dX_unit; pt1.z = parseFloat(pt1.z) + dZ_unit; }
      // INC bod: pt1 se posunulo, pt2 sleduje automaticky (je relativní k pt1)
      if (pt2 && pt2.mode !== 'INC') { pt2.x = parseFloat(pt2.x) + dX_unit; pt2.z = parseFloat(pt2.z) + dZ_unit; }
      scheduleFrame(() => { S._cachedCalc = calculate(true); draw(); });
    } else {
      S.view.panX += dx; S.view.panY += dy;
      scheduleFrame(draw);   // posun pohledu: sloučit překreslení do snímku
    }
  });

  const handleMouseUp = (e) => {
    if (_panelPending) {
      _panelPending = false;
      const dist = e ? Math.hypot(e.clientX - _mdX, e.clientY - _mdY) : 999;
      if (dist < 6) {
        const ca = root.querySelector('.cam-sim-code-area');
        if (ca && ca.style.display === 'none') {
          ca.style.display = '';
          const tb = root.querySelector('[data-act="toggle-code"]');
          if (tb) { tb.textContent = '▼'; tb.title = 'Skrýt G-kód panel'; tb.classList.remove('cam-sim-active'); }
        }
      }
    }
    // Dokončit případný odložený snímek z tažení SYNCHRONNĚ, aby níže navazující
    // přepočet/saveState/render pracovaly s finálním stavem.
    flushFrame();
    // Rect selection completion
    if (S.rectSelecting) {
      if (S.rectStart && S.rectEnd) {
        S.rectSelecting = false;
        const calc = S._cachedCalc;
        if (calc) {
          const pts = S.editMode === 'contour' ? calc.worldPoints : calc.stockWorldPoints;
          const prms = S.params;
          const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
          const _toScreen = (x, z) => {
            if (prms.machineStructure === 'carousel') return { x: S.view.panX + hS * x * S.view.scale, y: S.view.panY + vS * z * S.view.scale };
            return { x: S.view.panX + hS * z * S.view.scale, y: S.view.panY + vS * x * S.view.scale };
          };
          const minX = Math.min(S.rectStart.x, S.rectEnd.x);
          const maxX = Math.max(S.rectStart.x, S.rectEnd.x);
          const minY = Math.min(S.rectStart.y, S.rectEnd.y);
          const maxY = Math.max(S.rectStart.y, S.rectEnd.y);
          S.selectedPoints.clear();
          if (pts) {
            pts.forEach((p, i) => {
              const sp = _toScreen(p.xReal, p.zReal);
              if (sp.x >= minX && sp.x <= maxX && sp.y >= minY && sp.y <= maxY) {
                S.selectedPoints.add(i);
              }
            });
          }
        }
        S.rectStart = null;
        S.rectEnd = null;
        canvas.style.cursor = 'crosshair';
        S.isDragging = false;
        draw();
        // Open offset dialog if points selected
        if (S.selectedPoints.size > 0) {
          camOffsetDialog(S.selectedPoints.size).then(result => {
            if (result && (result.dx !== 0 || result.dz !== 0)) {
              pushHistory();
              const list = S.editMode === 'contour' ? S.contourPoints : S.stockPoints;
              S.selectedPoints.forEach(idx => {
                const pt = list[idx];
                if (pt) {
                  pt.x = parseFloat(pt.x) + result.dx;
                  pt.z = parseFloat(pt.z) + result.dz;
                }
              });
              S.selectedPoints.clear();
              fullUpdate();
            } else {
              S.selectedPoints.clear();
              draw();
            }
          });
        }
      } else {
        // Incomplete rect selection (mouseleave/cancel) — reset
        S.rectSelecting = false;
        S.rectStart = null;
        S.rectEnd = null;
        S.selectedPoints.clear();
        S.isDragging = false;
        canvas.style.cursor = 'crosshair';
        draw();
      }
      return;
    }
    // Clear snap lines on release
    S.snapLines = [];
    if (_draggingPartOff) {
      // Puštění úchopu upichnutí → přegenerovat dráhy z nového Dojezd X / Start X
      // (a obnovit panel s hodnotami polí).
      _draggingPartOff = null; S.isDragging = false;
      _regenGCode();
      return;
    }
    if (S.isDragging && (S.draggedPointId !== null || _draggingStock || _draggedContourSeg !== null)) {
      // Po puštění TEĎ jednou přepočítat kompletní dráhy z nové polohy bodů
      // (během tažení běžel jen lehký náhled) → dráhy se zase ukážou.
      S._cachedCalc = calculate();
      S.generatedCode = generateGCode(S._cachedCalc);
      saveState(); renderCodeArea(); renderTab();
    }
    if (S.draggedLimit) {
      // Po přetažení čelisti/koníka přepočítat dráhy (chuck/tail ořezává cuts).
      const needRecalc = S.draggedLimit === 'chuck' || S.draggedLimit === 'tail';
      saveState(); renderTab();
      if (needRecalc) fullUpdate();
    }
    // Dokončení úpravy drahy / konstrukční čáry – uložit a obnovit panely.
    if (S.draggedGNode || S._draggedGSeg || S._draggedGuideEnd) {
      // Po dotažení dráhy obnovit G-kód panel (během tažení se kvůli výkonu
      // nepřekresloval). flushFrame() výše už přepočítal _cachedCalc/manualGCode.
      renderCodeArea();
      saveState(); renderTab(); updateUndoRedoBtns();
    }
    S.isDragging = false; S.draggedPointId = null; _draggingStock = false; _draggingStockPt = false;
    _draggingPartOff = null;
    _draggedContourSeg = null; S.draggedLimit = null;
    S.draggedGNode = null; S._draggedGSeg = null; S._gdragNeedHistory = false;
    S._draggedGuideEnd = null; S._snap = null;
    S._angleSnapLine = null;
    draw();
  };
  canvasWrap.addEventListener('mouseup', handleMouseUp);
  canvasWrap.addEventListener('mouseleave', handleMouseUp);

  // ── TOUCH ──
  // ── Precision crosshair (mobil) ──
  // Long-press → křížek s offsetem NAD prstem + souřadnice (jako v CAD).
  // Jednoprstý touch se posílá přes SYNTETICKÉ myší události na (precision =
  // offsetnuté) pozici, takže funguje veškerá myší logika (tažení uzlů, drah,
  // konstrukčních čar, prodloužit/oříznout) a dá se přesně mířit bez posunu
  // pozadí. Pinch (2 prsty) a trasování/výběr zůstávají beze změny.
  const CAM_CH_OFFSET = -60;        // px – křížek nad prstem (blíž ke kolečku/prstu)
  const CAM_LONGPRESS_MS = 320;
  const CAM_MOVE_THRESH = 10;
  const precisionEl = document.getElementById('precisionCrosshair');
  const precisionLabel = precisionEl ? precisionEl.querySelector('.ch-label') : null;
  let camTouch = null;              // {x0,y0,lastX,lastY,started,moved}
  let camPressTimer = null;
  const _camDispatchMouse = (type, cx, cy) => {
    S._camDispatching = true;
    canvasWrap.dispatchEvent(new MouseEvent(type, { clientX: cx, clientY: cy, bubbles: true }));
    S._camDispatching = false;
  };
  // Křížek nad prstem. allowSnap=true (polohovací režim) → přichytí se k
  // bodům/hranám kontury/offsetu/konstr. čar (jako v CAD): křížek skočí na
  // snap bod, ukáže snapnuté souřadnice a uloží cílovou pozici pro akci.
  const _camShowCrosshair = (fingerX, fingerY, allowSnap) => {
    if (!precisionEl) return;
    const rect = canvas.getBoundingClientRect();
    const chX = fingerX, chY = fingerY + CAM_CH_OFFSET;   // poloha křížku (client)
    let tx = chX, ty = chY, snap = null;
    if (allowSnap && S.snapEnabled && !S.simRunning) {
      snap = camSnap(chX, chY);                            // snap k bodu/hraně
    }
    if (allowSnap) {
      // Aktualizovat snap indikátor + překreslit canvas (jako desktop hover).
      const prev = S._snap;
      S._snap = snap;
      if (snap) { const ss = _gToScreen(snap.x, snap.z); tx = rect.left + ss.x; ty = rect.top + ss.y; }
      const changed = (!!prev !== !!snap)
        || (prev && snap && (Math.abs(prev.x - snap.x) > 1e-6 || Math.abs(prev.z - snap.z) > 1e-6 || prev.type !== snap.type));
      if (changed) draw();
    }
    S._camTargetClient = { x: tx, y: ty };                 // sem se provede akce při puštění
    precisionEl.style.left = tx + 'px';
    precisionEl.style.top = ty + 'px';
    precisionEl.style.display = 'block';
    if (precisionLabel) {
      let wx, wz;
      if (S._snap) { wx = S._snap.x; wz = S._snap.z; }
      else { const w = _gToWorld(tx - rect.left, ty - rect.top); wx = w.x; wz = w.z; }
      const xDisp = S.params.mode === 'DIAMON' ? wx * 2 : wx;
      precisionLabel.textContent = `X${xDisp.toFixed(2)} Z${wz.toFixed(2)}`;
    }
  };
  const _camHideCrosshair = () => { if (precisionEl) precisionEl.style.display = 'none'; };
  const _camActionMode = () => S.addPointMode || S.delPointMode || S.gExtendMode || S.gTrimMode;
  // Je na (client) pozici tažitelný prvek? (bod kontury / uzel dráhy)
  const _camDraggableAt = (cx, cy) =>
    (S.pointDragEnabled && getPointAt(cx, cy) !== null) ||
    (S.gcodeEditEnabled && getGNodeAt(cx, cy) !== null);
  const _camStartPrecision = () => {
    if (!camTouch) return;
    S._camPrecision = true;
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch (_) { /* ignore */ } }
    const fx = camTouch.lastX, fy = camTouch.lastY;
    // Dvoukrokové uchopení: pokud byl minulým křížkem označen bod/uzel
    // (S._camMarked, ve světě → přežije zoom/pan), uchop ho teď a táhni
    // dalším pohybem prstu.
    if (S._camMarked && !_camActionMode()) {
      const rect = canvas.getBoundingClientRect();
      const ss = _gToScreen(S._camMarked.x, S._camMarked.z);
      _camDispatchMouse('mousedown', rect.left + ss.x, rect.top + ss.y);
      const got = !!(S.draggedGNode || S.draggedPointId !== null || S._draggedGSeg || S._draggedGuideEnd || _draggingStock);
      S._camMarked = null;
      if (got) {
        // Uchopený prvek se PŘESUNE na křížek a dál ho sleduje (absolutně),
        // ne relativní posun. lastMousePos zůstává na bodu (z grab mousedownu),
        // takže iniciální mousemove na pozici křížku ho tam rovnou přitáhne
        // (delta = křížek − bod); další pohyb prstu už ho jen veze.
        camTouch.posMode = false;
        _camShowCrosshair(fx, fy, false);
        _camDispatchMouse('mousemove', fx, fy + CAM_CH_OFFSET);
        draw();
        return;
      }
      // Označený prvek už neexistuje (přepočet) → pokračuj normálně.
    }
    if (_camActionMode()) {
      // Akční režim (+/−/Prodl/Ořez): křížek je jen polohovací kurzor,
      // akce se provede až při puštění na přesné pozici.
      camTouch.posMode = true;
    } else {
      // Zkus uchopit prvek pod křížkem (uzel/úsečka/konstr. čára/bod).
      _camDispatchMouse('mousedown', fx, fy + CAM_CH_OFFSET);
      const grabbed = !!(S.draggedGNode || S._draggedGSeg || S._draggedGuideEnd || S.draggedPointId !== null || _draggingStock);
      if (!grabbed) { S.isDragging = false; camTouch.posMode = true; }  // nic pod křížkem → NEpanovat
      else camTouch.posMode = false;
    }
    _camShowCrosshair(fx, fy, camTouch.posMode);   // polohovací režim → snap
  };
  const _camEndTouch = () => {
    if (S._camPrecision) _camHideCrosshair();
    S._camPrecision = false; camTouch = null;
    clearTimeout(camPressTimer); camPressTimer = null;
  };

  canvasWrap.addEventListener('touchstart', e => {
    if (e.target.closest('.cam-sim-trace-confirm, .cam-sim-trace-cancel')) return;
    if (e.touches.length === 1) {
      // Trasování profilu – tap přidá bod JEN při snapu na bod/průsečík;
      // mimo snap propadne na jednoprstou logiku níže (posun pohledu).
      if (S.profileTraceMode) {
        const tt = e.touches[0];
        const { wx, wz, snapped, insertGuideIdx } = _traceWorldFromClient(tt.clientX, tt.clientY);
        if (snapped) {
          _addTracePoint(wx, wz, insertGuideIdx);
          return;
        }
      }
      // Double-tap detection for rect selection
      const now = Date.now();
      if (now - S._lastTapTime < 350 && S.pointDragEnabled && !S.simRunning) {
        S.rectSelecting = true;
        S.selectedPoints.clear();
        S.snapLines = [];
        draw();
        S._lastTapTime = 0;
        return;
      }
      S._lastTapTime = now;

      // Rect selection on touch
      if (S.rectSelecting) {
        const rect = canvas.getBoundingClientRect();
        S.rectStart = { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
        S.rectEnd = null;
        S.isDragging = true;
        lastMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        return;
      }

      // Jednoprstý touch: odložíme rozhodnutí (tap / tažení / long-press
      // precision) a vše poženeme přes syntetické myší události — viz
      // touchmove/touchend. Long-press → precision křížek nad prstem.
      const t = e.touches[0];
      camTouch = { x0: t.clientX, y0: t.clientY, lastX: t.clientX, lastY: t.clientY, started: false, moved: false };
      S._camPrecision = false;
      clearTimeout(camPressTimer);
      camPressTimer = setTimeout(() => { camPressTimer = null; if (camTouch && !camTouch.moved) _camStartPrecision(); }, CAM_LONGPRESS_MS);
    } else if (e.touches.length === 2) {
      // Druhý prst → zrušit jednoprstou interakci/precision, jen pinch.
      clearTimeout(camPressTimer); camPressTimer = null;
      if (camTouch && camTouch.started) _camDispatchMouse('mouseup', camTouch.lastX, camTouch.lastY);
      if (S._camPrecision) _camHideCrosshair();
      S._camPrecision = false; camTouch = null;
      lastPinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    }
  }, { passive: true });

  canvasWrap.addEventListener('touchmove', e => {
    // Precision / odložená jednoprstá interakce → syntetické myší události.
    if (camTouch && e.touches.length === 1) {
      const t = e.touches[0];
      camTouch.lastX = t.clientX; camTouch.lastY = t.clientY;
      if (S._camPrecision) {
        // posMode = jen polohovací kurzor (žádný pan); jinak táhne uchopený prvek
        if (!camTouch.posMode) _camDispatchMouse('mousemove', t.clientX, t.clientY + CAM_CH_OFFSET);
        _camShowCrosshair(t.clientX, t.clientY, camTouch.posMode);   // polohovací režim → snap
        return;
      }
      if (!camTouch.started) {
        if (Math.hypot(t.clientX - camTouch.x0, t.clientY - camTouch.y0) > CAM_MOVE_THRESH) {
          clearTimeout(camPressTimer); camPressTimer = null;
          camTouch.moved = true; camTouch.started = true;
          _camDispatchMouse('mousedown', camTouch.x0, camTouch.y0);   // začátek tažení/posunu
          _camDispatchMouse('mousemove', t.clientX, t.clientY);
        }
        return;
      }
      _camDispatchMouse('mousemove', t.clientX, t.clientY);
      return;
    }
    if (S.addPointMode) return;

    // Rect selection drag on touch
    if (S.rectSelecting && S.isDragging && S.rectStart && e.touches.length === 1) {
      const rect = canvas.getBoundingClientRect();
      S.rectEnd = { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
      draw();
      return;
    }

    if (S.isDragging && e.touches.length === 1) {
      const t = e.touches[0];
      const dx = t.clientX - lastMousePos.x;
      const dy = t.clientY - lastMousePos.y;
      lastMousePos = { x: t.clientX, y: t.clientY };
      if (_draggingStock && S.draggedPointId !== null) {
        let rawDX, rawDZ;
        const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
        if (S.params.machineStructure === 'carousel') { rawDX = hS * dx / S.view.scale; rawDZ = vS * dy / S.view.scale; }
        else { rawDZ = hS * dx / S.view.scale; rawDX = vS * dy / S.view.scale; }
        if (S.draggedPointId === 0) {
          S.params.stockDiameter = Math.max(1, parseFloat(S.params.stockDiameter) + rawDX * 2);
          S.params.stockFace = Math.round((parseFloat(S.params.stockFace) + rawDZ) * 100) / 100;
        } else {
          S.params.stockDiameter = Math.max(1, parseFloat(S.params.stockDiameter) + rawDX * 2);
          S.params.stockLength = Math.max(1, Math.round((parseFloat(S.params.stockLength) - rawDZ) * 100) / 100);
        }
        S.params.stockDiameter = Math.round(S.params.stockDiameter * 100) / 100;
        // Tažení (touch): jen lehký náhled, plný přepočet až po puštění.
        scheduleFrame(() => { S._cachedCalc = calculate(true); draw(); });
      } else if (S.draggedPointId !== null) {
        let dX_unit = 0, dZ_unit = 0;
        const vS = S.flipX ? 1 : -1; const hS = S.flipZ ? -1 : 1;
        if (S.params.machineStructure === 'carousel') {
          dX_unit = hS * dx / S.view.scale; dZ_unit = vS * dy / S.view.scale;
        } else {
          dZ_unit = hS * dx / S.view.scale; dX_unit = vS * dy / S.view.scale;
        }
        if (S.params.mode === 'DIAMON') dX_unit *= 2;
        const list = S.editMode === 'contour' ? S.contourPoints : S.stockPoints;

        // Multi-drag on touch
        if (S.selectedPoints.size > 1 && S.selectedPoints.has(S.draggedPointId)) {
          S.snapLines = [];
          S.selectedPoints.forEach(idx => {
            const p = list[idx];
            if (p) { p.x = parseFloat(p.x) + dX_unit; p.z = parseFloat(p.z) + dZ_unit; }
          });
        } else {
          const pt = list[S.draggedPointId];
          pt.x = parseFloat(pt.x) + dX_unit;
          pt.z = parseFloat(pt.z) + dZ_unit;

          // Snap guides on touch
          S.snapLines = [];
          const allAbs = resolvePointsToAbsolute(list);
          const dragAbs = allAbs[S.draggedPointId];
          if (dragAbs) {
            const isDia = S.params.mode === 'DIAMON';
            const dragWX = isDia ? dragAbs.xAbs / 2 : dragAbs.xAbs;
            const dragWZ = dragAbs.zAbs;
            const snapTol = 3 / S.view.scale;
            for (let i = 0; i < allAbs.length; i++) {
              if (i === S.draggedPointId) continue;
              const otherWX = isDia ? allAbs[i].xAbs / 2 : allAbs[i].xAbs;
              const otherWZ = allAbs[i].zAbs;
              if (Math.abs(dragWX - otherWX) < snapTol) {
                S.snapLines.push({ type: 'x', val: otherWX, from: Math.min(dragWZ, otherWZ), to: Math.max(dragWZ, otherWZ) });
                if (pt.mode === 'ABS') pt.x = isDia ? otherWX * 2 : otherWX;
              }
              if (Math.abs(dragWZ - otherWZ) < snapTol) {
                S.snapLines.push({ type: 'z', val: otherWZ, from: Math.min(dragWX, otherWX), to: Math.max(dragWX, otherWX) });
                if (pt.mode === 'ABS') pt.z = otherWZ;
              }
            }
          }
        }

        // Tažení (touch): jen lehký náhled, plný přepočet až po puštění.
        scheduleFrame(() => { S._cachedCalc = calculate(true); draw(); });
      } else {
        S.view.panX += dx; S.view.panY += dy;
        scheduleFrame(draw);   // posun pohledu (touch): sloučit do snímku
      }
    }
    if (e.touches.length === 2 && lastPinchDist) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const zoomFactor = dist / lastPinchDist;
      const rect = canvas.getBoundingClientRect();
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
      const oldScale = S.view.scale;
      const newScale = Math.max(0.2, Math.min(oldScale * zoomFactor, 200));
      S.view.panX = mx - (mx - S.view.panX) * (newScale / oldScale);
      S.view.panY = my - (my - S.view.panY) * (newScale / oldScale);
      S.view.scale = newScale;
      lastPinchDist = dist;
      scheduleFrame(draw);   // pinch zoom: sloučit překreslení do snímku
    }
  }, { passive: true });

  canvasWrap.addEventListener('touchend', () => {
    // Rect selection completion on touch
    if (S.rectSelecting && S.rectStart && S.rectEnd) {
      handleMouseUp();
      lastPinchDist = null; camTouch = null;
      return;
    }
    // Jednoprstá interakce přes syntetické myší události (tap / tažení /
    // precision). Po dokončení blokujeme „ghost" myší události z prohlížeče.
    if (camTouch) {
      clearTimeout(camPressTimer); camPressTimer = null;
      const fx = camTouch.lastX, fy = camTouch.lastY;
      if (S._camPrecision) {
        if (camTouch.posMode) {
          // Polohovací kurzor: akci provedeme až teď, na PŘESNÉ pozici křížku
          // – tj. na snapnutém bodě/hraně, pokud snap chytil (S._camTargetClient).
          const tc = S._camTargetClient || { x: fx, y: fy + CAM_CH_OFFSET };
          if (!_camActionMode() && S._snap && _camDraggableAt(tc.x, tc.y)) {
            // Dvoukrokové uchopení: snapnutý bod/uzel jen OZNAČ (ve světě);
            // dalším podržením se uchopí a táhne (viz _camStartPrecision).
            S._camMarked = { x: S._snap.x, z: S._snap.z };
            showToast('Označeno – podrž znovu a táhni');
            draw();
          } else {
            _camDispatchMouse('mousedown', tc.x, tc.y);
            _camDispatchMouse('mouseup', tc.x, tc.y);
          }
        } else {
          _camDispatchMouse('mouseup', fx, fy + CAM_CH_OFFSET);   // dokonči tažení prvku
        }
        _camHideCrosshair(); S._camPrecision = false;
      } else if (camTouch.started) {
        _camDispatchMouse('mouseup', fx, fy);
      } else if (S._camMarked) {
        // Čekalo se na uchopení označeného bodu, ale přišel krátký tap →
        // zrušit označení (uživatel si to rozmyslel).
        S._camMarked = null; draw();
      } else {
        // Krátký tap (bez pohybu, bez long-pressu) → klik na (raw) pozici:
        // tap akce (přidat/smazat/prodloužit/oříznout) + uchopení/uvolnění.
        _camDispatchMouse('mousedown', camTouch.x0, camTouch.y0);
        _camDispatchMouse('mouseup', camTouch.x0, camTouch.y0);
      }
      S._camGhostUntil = Date.now() + 700;
      camTouch = null; lastPinchDist = null;
      return;
    }
    flushFrame();   // dokončit odložený snímek z tažení před uložením stavu
    S.snapLines = [];
    if (S.isDragging && (S.draggedPointId !== null || _draggingStock)) {
      // Po puštění TEĎ jednou přepočítat kompletní dráhy z nové polohy bodů
      // (během tažení běžel jen lehký náhled) → dráhy se zase ukážou.
      S._cachedCalc = calculate();
      S.generatedCode = generateGCode(S._cachedCalc);
      saveState(); renderCodeArea(); renderTab();
    }
    if (S.draggedLimit) {
      const needRecalc = S.draggedLimit === 'chuck' || S.draggedLimit === 'tail';
      saveState(); renderTab();
      if (needRecalc) fullUpdate();
    }
    S.isDragging = false; S.draggedPointId = null; _draggingStock = false; S.draggedLimit = null; lastPinchDist = null;
    draw();
  });

  // ── RESIZE OBSERVER ──
  const resizeObs = new ResizeObserver(() => {
    const cw = canvasWrap.clientWidth, ch = canvasWrap.clientHeight;
    if (cw > 0 && ch > 0 && (canvas.width !== cw || canvas.height !== ch)) {
      canvas.width = cw; canvas.height = ch;
    }
    draw();
  });
  resizeObs.observe(canvasWrap);

  // ── CLEANUP on overlay removal ──
  const cleanupObs = new MutationObserver((_, obs) => {
    if (!document.body.contains(overlay)) {
      resizeObs.disconnect(); obs.disconnect();
      document.removeEventListener('keydown', handleKeyDown);
      if (S._animId) cancelAnimationFrame(S._animId);
      S.simRunning = false;
    }
  });
  cleanupObs.observe(document.body, { childList: true });

  // ── INITIAL SETUP ──
  canvas.width = canvasWrap.clientWidth;
  canvas.height = canvasWrap.clientHeight;
  if (_importedContour) {
    // Auto-fit cylinder-stock parametrů k importované kontuře (Diameter/Length/Face).
    // Tyto hodnoty pouze nastavují velikost defaultního válcového polotovaru —
    // pokud už máme tvarový polotovar (z G-kódu nebo z canvas), nepřepisujeme ho.
    const absPts = resolvePointsToAbsolute(S.contourPoints);
    if (absPts.length > 0) {
      let minZ = Infinity, maxZ = -Infinity, maxD = 0;
      absPts.forEach(p => {
        const x = S.params.mode === 'DIAMON' ? p.xAbs : p.xAbs * 2;
        if (Math.abs(x) > maxD) maxD = Math.abs(x);
        if (p.zAbs < minZ) minZ = p.zAbs;
        if (p.zAbs > maxZ) maxZ = p.zAbs;
      });
      const margin = parseFloat(S.params.stockMargin) || 5;
      S.params.stockDiameter = Math.ceil(maxD + margin * 2);
      S.params.stockLength = Math.ceil(Math.abs(minZ) + margin);
      // Čelo válce musí pokrýt i konturu kreslenou v +Z (čelo dílu na
      // Z=maxZ, ne na Z0) — jinak by polotovar ležel mimo součást.
      S.params.stockFace = Math.max(2, Math.ceil(maxZ) + 2);
    }
    // Defaultní casting-stock vygeneruj jen pokud žádný (ani G-kódový, ani canvas) není.
    if (!_importedStockFromGCode && S.stockPoints.length === 0) {
      generateDefaultStock();
    }
  }
  fullUpdate();
  requestAnimationFrame(() => fitView());
  if (typeof window !== 'undefined') window.__camDebug = { S, calculate, camRayIntersection, fullUpdate, getArcParams, getNormal, vecAngle, normalizeAngle, getToolClearanceRange, segInterferesWithTool, isAngleBetween, intersectLineCircle };
}
