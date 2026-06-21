// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – CAM Simulátor (soustružení)                      ║
// ║  Konverze SimDraha.html → vanilla JS ES module            ║
// ╚══════════════════════════════════════════════════════════════╝

import { makeOverlay } from '../dialogFactory.js';
import { openCamEditor } from './camEditor.js';
import { state, pushUndo, showToast } from '../state.js';
import { renderAll } from '../render.js';
import { autoCenterView } from '../canvas.js';
import { calculateAllIntersections } from '../geometry.js';
import { updateObjectList } from '../ui.js';
import { bulgeToArc } from '../utils.js';
import { showToolLibraryDialog } from '../toolLibrary.js';
import { getEffectivePlungeAngle, isAngleBetween, intersectVerticalLineSegment, intersectVerticalLineArc } from './cam/camMath.js';
import { ROUGHING_STRATEGIES } from './cam/roughingStrategies.js';

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
  flex: 1; display: flex; flex-direction: column; position: relative; background: #1e1e2e;
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
}
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
.cam-sim-sidebar {
  width: 320px; overflow: hidden; border-left: 1px solid #45475a;
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
.cam-sim-row { display: flex; gap: 6px; margin-bottom: 6px; }
.cam-sim-field { display: flex; flex-direction: column; flex: 1; }
.cam-sim-field label { font-size: 10px; color: #6c7086; margin-bottom: 2px; }
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
.cam-sim-errors {
  background: rgba(243,139,168,0.15); border-left: 3px solid #f38ba8;
  padding: 6px 8px; font-size: 11px; color: #f38ba8;
}
.cam-sim-errors ul { margin: 4px 0 0 16px; padding: 0; }
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
}
.cam-sim-checkbox-row input[type="checkbox"] {
  width: 16px; height: 16px; accent-color: #89b4fa;
}
.cam-sim-checkbox-row span { font-size: 12px; font-weight: 600; }
.cam-sim-checkbox-row small { display: block; font-size: 10px; color: #6c7086; padding-left: 24px; }
.cam-sim-mat-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 6px;
}
.cam-sim-mat-grid button {
  font-size: 10px; padding: 4px 6px; background: #313244; border: 1px solid #45475a;
  color: #a6adc8; border-radius: 3px; cursor: pointer;
}
.cam-sim-mat-grid button:hover { background: #45475a; color: #cdd6f4; }
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
  return { bisector, halfRange };
}
// getEffectivePlungeAngle → přesunuto do cam/camMath.js
// Test jednoho segmentu kontury proti úhlovému rozsahu destičky —
// true = destička by při sledování segmentu špičkou zajela bočním
// ostřím do materiálu (normála segmentu mimo pokrytý rozsah).
// Malá tolerance, aby tečné body PŘESNĚ na hranici dosažitelnosti (typicky
// začátek oblouku navázaného na mostovou čáru profilu) nezhodily celý jinak
// dosažitelný oblouk jako "nedosažitelný" (hraniční false-positive ~0.1°).
const INSERT_REACH_TOL = 1.5 * Math.PI / 180;
function segInterferesWithTool(seg, clearance) {
  const { bisector, halfRange } = clearance;
  const lim = halfRange + INSERT_REACH_TOL;
  if (seg.type === 'line') {
    const n = getNormal(seg.p1, seg.p2);
    if (n.x === 0 && n.z === 0) return false;
    return Math.abs(normalizeAngle(vecAngle(n.x, n.z) - bisector)) > lim;
  }
  if (seg.type === 'arc') {
    const midAbsX = Math.abs((seg.p1.x + seg.p2.x) / 2);
    const isOuter = Math.abs(seg.cx) < midAbsX;
    const startAngle = Math.atan2(seg.p1.x - seg.cx, seg.p1.z - seg.cz);
    let endAngle = Math.atan2(seg.p2.x - seg.cx, seg.p2.z - seg.cz);
    if (seg.dir === 'G2' && endAngle > startAngle) endAngle -= 2 * Math.PI;
    if (seg.dir === 'G3' && endAngle < startAngle) endAngle += 2 * Math.PI;
    const steps = 8;
    for (let s = 0; s <= steps; s++) {
      const a = startAngle + (endAngle - startAngle) * (s / steps);
      const normAngle = isOuter ? normalizeAngle(a) : normalizeAngle(a + Math.PI);
      if (Math.abs(normalizeAngle(normAngle - bisector)) > lim) return true;
    }
  }
  return false;
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
function buildMachinableContour(segs, guides) {
  if (!guides || guides.length === 0) return segs;
  let result = segs.map(s => ({ ...s }));
  for (const g of guides) {
    const A = { x: g.x1, z: g.z1 }, B = { x: g.x2, z: g.z2 };
    if (Math.hypot(A.x - B.x, A.z - B.z) < 0.5) continue;
    const lA = _locateOnContour(result, A), lB = _locateOnContour(result, B);
    if (lA && lB) {
      // Oba konce na kontuře → vyříznout úsek mezi nimi a nahradit mostem.
      let f, s, fPt, sPt;
      if (lA.key <= lB.key) { f = lA; fPt = A; s = lB; sPt = B; }
      else { f = lB; fPt = B; s = lA; sPt = A; }
      if (s.key - f.key < 1e-4) continue;
      const bridge = { type: 'line', p1: fPt, p2: sPt, fromInsert: true };
      if (f.segIdx === s.segIdx) {
        // Oba konce na jedné entitě → rozdělit: [start..fPt] + most + [sPt..end].
        const seg = result[f.segIdx];
        const head = { ...seg }; setSegEnd(head, fPt); syncArcEndpoints(head);
        const tail = { ...seg }; setSegStart(tail, sPt); syncArcEndpoints(tail); delete tail.chainBreak;
        result.splice(f.segIdx, 1, head, bridge, tail);
      } else {
        const before = result.slice(0, f.segIdx + 1).map(x => ({ ...x }));
        setSegEnd(before[before.length - 1], fPt); syncArcEndpoints(before[before.length - 1]);
        const after = result.slice(s.segIdx).map(x => ({ ...x }));
        setSegStart(after[0], sPt); syncArcEndpoints(after[0]); delete after[0].chainBreak;
        result = [...before, bridge, ...after];
      }
    } else if (lA || lB) {
      // Jeden konec mostu leží MIMO konturu (na polotovaru) — typicky čelo
      // na začátku/konci kontury (mezní čára míří k ose/okraji materiálu).
      // Most prodlouží konturu na tomto okraji k tomu bodu.
      const loc = lA || lB, locPt = lA ? A : B, offPt = lA ? B : A;
      const startPt = segStartPoint(result[0]);
      const endPt = segEndPoint(result[result.length - 1]);
      const dStart = Math.hypot(offPt.x - startPt.x, offPt.z - startPt.z);
      const dEnd = Math.hypot(offPt.x - endPt.x, offPt.z - endPt.z);
      if (Math.min(dStart, dEnd) > 5) continue; // off bod nepatří k okraji kontury
      if (dStart <= dEnd) {
        // Prodloužení na ZAČÁTKU: nový start = offPt, most offPt→locPt.
        const after = result.slice(loc.segIdx).map(x => ({ ...x }));
        setSegStart(after[0], locPt); syncArcEndpoints(after[0]); delete after[0].chainBreak;
        result = [{ type: 'line', p1: offPt, p2: locPt, fromInsert: true }, ...after];
      } else {
        // Prodloužení na KONCI: nový konec = offPt, most locPt→offPt.
        const before = result.slice(0, loc.segIdx + 1).map(x => ({ ...x }));
        setSegEnd(before[before.length - 1], locPt); syncArcEndpoints(before[before.length - 1]);
        result = [...before, { type: 'line', p1: locPt, p2: offPt, fromInsert: true }];
      }
    }
  }
  // Odstranit nulové úsečky, které vzniknou split-em mostu PŘESNĚ na styku
  // dvou entit (setSegStart/End srazí dotčenou entitu na nulovou délku).
  // Bez toho kolem nich trimAndRemoveLoops vyrobí zpětný „trojúhelník"
  // (projevilo se na hrubování i dokončování u čela). chainBreak přeneseme
  // na následující úsek, ať se nepřeruší řetěz.
  for (let k = result.length - 1; k >= 0; k--) {
    const s = result[k];
    if (s.type === 'line' && Math.hypot(s.p2.x - s.p1.x, s.p2.z - s.p1.z) <= 1e-6) {
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
    const excludeIdx = grp.map(s => idxOf.get(s) + 1);
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
      // Dolní konec: průsečík s konturou/polotovarem. NEvynecháváme
      // segmenty skupiny — nájezdový tečný bod často leží právě na nich
      // (boční oblouček u nájezdu), takže s exclude paprsek konturu mine
      // a čára zůstane krátká. Bez exclude trefí skutečnou hranu.
      let down = camRayIntersection(best.x, best.z, -sb, -cb, null, localCalcDown);
      if (!down) {
        const t = sb > 0.01 ? (best.x - botX) / sb : 0;
        down = t > 0.01 ? { x: best.x - sb * t, z: best.z - cb * t } : best;
      }
      // Horní konec: průsečík s konturou; bez něj skončit u vršku
      // regionu (NEprotahovat k hornímu okraji polotovaru).
      let up = camRayIntersection(best.x, best.z, sb, cb, excludeIdx, localCalc);
      if (!up) {
        const capX = Math.min(topX, stockTopXG);
        const t = sb > 0.01 ? (capX - best.x) / sb : 0;
        up = t > 0.01 ? { x: best.x + sb * t, z: best.z + cb * t } : best;
      }
      if (Math.hypot(up.x - down.x, up.z - down.z) < 0.5) return;
      const dup = interferenceGuides.some(g =>
        Math.hypot(g.x1 - down.x, g.z1 - down.z) < 0.5 && Math.hypot(g.x2 - up.x, g.z2 - up.z) < 0.5);
      if (!dup) interferenceGuides.push({ x1: down.x, z1: down.z, x2: up.x, z2: up.z, kind });
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
  if (seg.type !== 'line') return true;
  return pt.x >= Math.min(seg.p1.x, seg.p2.x) - TRIM_TOL &&
    pt.x <= Math.max(seg.p1.x, seg.p2.x) + TRIM_TOL &&
    pt.z >= Math.min(seg.p1.z, seg.p2.z) - TRIM_TOL &&
    pt.z <= Math.max(seg.p1.z, seg.p2.z) + TRIM_TOL;
}
// Minimální vzdálenost průsečíku od endpointu, kterou požadujeme pro
// global loop-removal. Nižší hodnota → loop-removal eliminuje legitimní
// malé oblouky mezi dlouhými segmenty (intersection padne těsně za
// trimnutý konec line, ale je to falešná smyčka, ne skutečné self-cross).
const LOOP_INTERIOR_MIN = 0.1;
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
        if (pt && isOnSegBounds(pt, s1) && isOnSegBounds(pt, s2)) {
          const s1End = segEndPoint(s1);
          const s2Start = segStartPoint(s2);
          const d1 = Math.hypot(pt.x - s1End.x, pt.z - s1End.z);
          const d2 = Math.hypot(pt.x - s2Start.x, pt.z - s2Start.z);
          if (d1 < LOOP_INTERIOR_MIN || d2 < LOOP_INTERIOR_MIN) continue;
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
      if (nextOff.type === 'line') {
        const ox = rawSegs[i + 1].p2.x - rawSegs[i + 1].p1.x;
        const oz = rawSegs[i + 1].p2.z - rawSegs[i + 1].p1.z;
        const dx = nextOff.p2.x - nextOff.p1.x, dz = nextOff.p2.z - nextOff.p1.z;
        if (dx * ox + dz * oz < 0) continue;
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

// ── G-code parser (manual code → sim path) ─────────────────────
function parseManualGCodeToPath(code, prms) {
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
    const type = gMatch ? 'G' + gMatch[1] : lastMoveType;
    const xMatch = clean.match(/[XU]([-]?\d*\.?\d+)/);
    const zMatch = clean.match(/[ZW]([-]?\d*\.?\d+)/);
    const rMatch = clean.match(/(?:R|CR=)([-]?\d*\.?\d+)/);
    const iMatch = clean.match(/I([-]?\d*\.?\d+)/);
    const kMatch = clean.match(/K([-]?\d*\.?\d+)/);
    let targetX = currentX, targetZ = currentZ, hasMove = false;
    if (xMatch) { targetX = prms.mode === 'DIAMON' ? parseFloat(xMatch[1]) / 2 : parseFloat(xMatch[1]); hasMove = true; }
    if (zMatch) { targetZ = parseFloat(zMatch[1]); hasMove = true; }
    if (gMatch) lastMoveType = type;
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
          const arc = getArcParams(p1, p2, arcR, type);
          if (!arc.error) {
            const steps = 10;
            let sA = Math.atan2(p1.x - arc.cx, p1.z - arc.cz);
            let eA = Math.atan2(p2.x - arc.cx, p2.z - arc.cz);
            if (type === 'G2' && eA > sA) eA -= 2 * Math.PI;
            if (type === 'G3' && eA < sA) eA += 2 * Math.PI;
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

// ══════════════════════════════════════════════════════════════
// ║  MAIN EXPORT                                              ║
// ══════════════════════════════════════════════════════════════
export function openCamSimulator(initialContour, initialGCode) {
  injectCSS();

  // ── Build HTML ──
  const bodyHTML = `
<div class="cam-sim-root">
  <div class="cam-sim-canvas-area">
    <div class="cam-sim-toolbar">
      <button data-act="addpt" title="Vložit za bod">➕</button>
      <button data-act="profile" title="Trasovat profil po kontuře (klikejte na body, Enter = dokončit, Esc = zrušit)">📈</button>
      <button data-act="profile-apply" title="Použít trasovaný profil jako novou konturu" class="cam-sim-preview-btn" style="display:none">✅</button>
      <button data-act="profile-cancel" title="Zrušit náhled profilu" class="cam-sim-preview-btn" style="display:none">❌</button>
      <button data-act="delpt" title="Odebrat bod">➖</button>
      <button data-act="edit-contour" title="Kontura: táhněte body kontury pro změnu jejich polohy. Vylučuje se s úpravou drah.">◆ Kontura</button>
      <button data-act="edit-paths" title="Dráhy: úprava G-kódu – táhněte uzly/úsečky dráhy; ➕/➖ na dráze přidá/smaže pohyb. Vylučuje se s úpravou kontury.">✥ Dráhy</button>
      <button data-act="fit" title="Centrovat">🎯</button>
      <button data-act="flipx" title="Otočit svislou osu – nástroj zespodu (prohodí G2/G3)">⇅ X+ ↑</button>
      <button data-act="simpath" title="Cyklus: 👁 vše → ✂️ jen řezné (bez rychloposuvů) → 🙈 nic" class="cam-sim-active">👁</button>
      <button data-act="zlimits" title="Z-limity: čelisti, koník + rozsah obrábění (klikněte a táhněte čáry)">📏</button>
      <button data-act="snap" title="SNAP: přichytávání k bodům a hranám kontury/polotovaru (jako v CAD) – konce, středy, oblouky, úsečky" class="cam-sim-active">🧲</button>
      <button data-act="gextend" title="Prodloužit: klik na koncový bod úsečky (G0/G1) nebo konstrukční čáry → protáhne k nejbližšímu průsečíku s konturou / offsetem / konstrukční čarou (zapněte ✥ Dráhy)">⊢ Prodl</button>
      <button data-act="gtrim" title="Oříznout: klik na koncový bod úsečky (G0/G1) nebo konstrukční čáry → zkrátí k nejbližšímu průsečíku zpět (zapněte ✥ Dráhy)">⊣ Ořez</button>
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
          <button data-code="show-sidebar" title="Zobrazit editor kontury">✏ Edit</button>
          <button data-code="save-prog" title="Uložit celý projekt (kontura + parametry + G-kód) do souboru .camprog">💾 Uložit</button>
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
  const titlebar = overlay.querySelector('.calc-titlebar');
  if (titlebar) {
    const titleH3 = titlebar.querySelector('h3');

    undoTitleBtn = document.createElement('button');
    undoTitleBtn.className = 'cam-sim-calc-btn';
    undoTitleBtn.title = 'Zpět';
    undoTitleBtn.textContent = '↩';
    undoTitleBtn.addEventListener('click', (e) => { e.stopPropagation(); undo(); });

    redoTitleBtn = document.createElement('button');
    redoTitleBtn.className = 'cam-sim-calc-btn';
    redoTitleBtn.title = 'Vpřed';
    redoTitleBtn.textContent = '↪';
    redoTitleBtn.addEventListener('click', (e) => { e.stopPropagation(); redo(); });

    if (titleH3) titleH3.after(undoTitleBtn, redoTitleBtn);
    else titlebar.insertBefore(undoTitleBtn, titlebar.firstChild);

    const calcBtn = document.createElement('button');
    calcBtn.className = 'cam-sim-calc-btn';
    calcBtn.title = 'Kalkulačka';
    calcBtn.textContent = '🔢';
    calcBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      import('../ui.js').then(m => m.openCalculator());
    });
    titlebar.insertBefore(calcBtn, titlebar.querySelector('.calc-close-btn'));
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
    if (clipBtn) clipBtn.style.display = '';
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
    params: {
      machineType: 'LIMS=2000', mode: 'DIAMON', toolName: 'ROUGHER_T1',
      speed: 200, feed: 0.25, depthOfCut: 2.0, retractDistance: 2.0,
      allowanceX: 0.5, allowanceZ: 0.1, toolRadius: 0.8,
      // Přídavek na hotovo: přičítá se k Rádiusu (R) i k Přídavku X/Z —
      // hrubovací offset = R + Přídavek X/Z + Přídavek na hotovo,
      // dokončovací offset = jen R.
      finishAllowance: 0,
      doFinishing: true, roughingStrategy: 'longitudinal',
      // Směr hrubování: 'right' = zprava doleva (standard), 'left' = zleva
      // doprava (druhá strana — zprava nelze, narazil by držák/destička).
      // Kombinuje se s roughingStrategy (podélně/čelně).
      roughingSide: 'right',
      stockMode: 'cylinder', stockMargin: 5.0, stockDiameter: 100,
      stockLength: 100, stockFace: 2.0, safeX: 150, safeZ: 5,
      machineStructure: 'lathe', controlSystem: 'sinumerik',
      toolShape: 'round', toolLength: 10, toolAngle: 15, toolTipAngle: 90,
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
      // Bez schodků: po dojezdu hrubovacího průchodu na offset nástroj
      // dál sleduje konturu (G1/G2/G3) až na hloubku dalšího průchodu,
      // místo okamžitého 45° odskoku — schody mezi kroky se obrobí
      // přímo po obrysu.
      noStepRoughing: false,
      // Stejné chování i pro čelní (X) hrubování.
      noStepRoughingFace: false,
      // Vůle nad polotovarem pro rychloposuvy v Z. Default 1 mm =
      // dráha rychloposuvu se táhne co nejtěsněji vedle polotovaru.
      rapidClearance: 1.0
    },
    view: { scale: 3, panX: 600, panY: 350 },
    flipX: false,
    // Z-osa limity (čelisti/koník) a rozsah obrábění – hodnoty v Z (null = vypnuto)
    zLimits: { chuck: null, tail: null, rangeStart: null, rangeEnd: null },
    // 'off' = skryto, 'fixtures' = čelisti + koník, 'range' = rozsah obrábění,
    // 'both' = vše. Cyklus: off → fixtures → range → both → off.
    showZLimits: 'off',
    // 'all' = vše, 'cut' = jen řezné (G1/G2/G3, skryje G0 rychloposuvy),
    // 'none' = nic. Cyklus: all → cut → none → all.
    showSimPath: 'all',
    draggedLimit: null, // 'chuck' | 'tail' | 'rangeStart' | 'rangeEnd' nebo null
    simRunning: false, simProgress: 0,
    manualGCode: '',
    generatedCode: [], errors: [],
    past: [], future: [],
    draggedPointId: null, hoverPointId: null,
    isDragging: false, addPointMode: false, pointDragEnabled: false,
    gcodeEditEnabled: false,   // úprava drah (G-kód) – nezávislá na pointDragEnabled
    snapEnabled: true,   // SNAP přichytávání zapnuté hned po načtení
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
    _cachedCalc: null, _hoverIsStock: false,
    selectedPoints: new Set(),
    rectSelecting: false,
    rectStart: null,
    rectEnd: null,
    snapLines: [],
    // Pomocné (konstrukční) čáry — např. tečny z nástroje Úhel. Reálné
    // souřadnice (X = rádius), nejsou součástí kontury ani G-kódu.
    guideLines: [],
    _lastTapTime: 0
  };

  // Load from localStorage
  const STORAGE_KEY = 'skica-cam-simulator';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const p = JSON.parse(saved);
      if (p.params) Object.assign(S.params, p.params);
      // Migrace: dřívější roughingStrategy 'backside' → podélně + směr zleva.
      if (S.params.roughingStrategy === 'backside') {
        S.params.roughingStrategy = 'longitudinal';
        S.params.roughingSide = 'left';
      }
      if (p.contourPoints && p.contourPoints.length > 0) S.contourPoints = p.contourPoints;
      if (p.stockPoints && p.stockPoints.length > 0) S.stockPoints = p.stockPoints;
      if (p.manualGCode) S.manualGCode = p.manualGCode;
      if (p.flipX !== undefined) S.flipX = !!p.flipX;
      if (Array.isArray(p.profileOriginal)) S._profileOriginal = p.profileOriginal;
      if (Array.isArray(p.guideLines)) S.guideLines = p.guideLines;
      if (p.zLimits) Object.assign(S.zLimits, p.zLimits);
      if (p.showZLimits !== undefined) {
        // Zpětná kompatibilita: dříve boolean, teď tri/quad-state string.
        if (typeof p.showZLimits === 'boolean') S.showZLimits = p.showZLimits ? 'fixtures' : 'off';
        else if (['off', 'fixtures', 'range', 'both'].includes(p.showZLimits)) S.showZLimits = p.showZLimits;
      }
      if (p.showSimPath !== undefined) {
        // Zpětná kompatibilita: dříve byl boolean, teď string.
        if (typeof p.showSimPath === 'boolean') S.showSimPath = p.showSimPath ? 'all' : 'none';
        else if (['all', 'cut', 'none'].includes(p.showSimPath)) S.showSimPath = p.showSimPath;
      }
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
  if (!_importedStockFromGCode) {
    try {
      const importedStock = buildStockPointsFromCanvas(S.params);
      if (importedStock.length >= 2) {
        S.stockPoints = importedStock;
        S.params.stockMode = 'casting';
      }
    } catch (e) { console.warn('buildStockPointsFromCanvas:', e); }
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
  const toolbar = root.querySelector('.cam-sim-toolbar');
  const playerBar = root.querySelector('.cam-sim-player-bar');
  const playBtn = playerBar.querySelector('[data-act="play"]');
  const sidebar = root.querySelector('.cam-sim-sidebar');

  // Sync flipX button to persisted state
  const flipBtn = toolbar.querySelector('[data-act="flipx"]');
  if (flipBtn) {
    flipBtn.classList.toggle('cam-sim-active', S.flipX);
    flipBtn.textContent = S.flipX ? '⇅ X+ ↓' : '⇅ X+ ↑';
  }
  // Sync Z-limits button to persisted tri-state
  const zlimBtn = toolbar.querySelector('[data-act="zlimits"]');
  const ZLIM_CFG = {
    off:      { icon: '📏', active: false, toast: 'Z-limity skryty' },
    fixtures: { icon: '⛔', active: true,  toast: 'Zobrazeny čelisti a koník' },
    range:    { icon: '📐', active: true,  toast: 'Zobrazen rozsah obrábění' },
    both:     { icon: '🟰', active: true,  toast: 'Zobrazeno vše – čelisti, koník i rozsah' },
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
      gcode: S.manualGCode
    };
  }
  function _restore(s) {
    S.contourPoints = s.contour;
    S.stockPoints = s.stock;
    if (s.guides) S.guideLines = s.guides;
    if (typeof s.gcode === 'string') S.manualGCode = s.gcode;
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
        params: S.params, contourPoints: S.contourPoints,
        stockPoints: S.stockPoints, manualGCode: S.manualGCode,
        flipX: S.flipX, guideLines: S.guideLines, profileOriginal: S._profileOriginal,
        zLimits: S.zLimits, showZLimits: S.showZLimits, showSimPath: S.showSimPath
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
    const worldPoints = absContour.map(p => ({ ...p, xReal: prms.mode === 'DIAMON' ? p.xAbs / 2 : p.xAbs, zReal: p.zAbs }));
    const stockWorldPoints = absStock.map(p => ({ ...p, xReal: prms.mode === 'DIAMON' ? p.xAbs / 2 : p.xAbs, zReal: p.zAbs }));

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
        interferenceSegments: [], interferenceGuides: [], stockTopX,
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

    for (let i = 0; i < worldPoints.length - 1; i++) {
      const p1 = worldPoints[i], p2 = worldPoints[i + 1], type = p2.type;
      // G0 = export vygeneroval pouze "přesun" mezi dvěma nesouvisejícími
      // entitami (mezera mezi nimi v CADu nic nemá nakresleno) — takový
      // segment NENÍ součástí kontury a nesmí se obrábět ani zobrazovat
      // jako spojnice (viz removeContourSelfIntersections/chainBreak níže).
      if (type === 'G1') {
        contourSegments.push({ type: 'line', p1: { x: p1.xReal, z: p1.zReal }, p2: { x: p2.xReal, z: p2.zReal }, orig: p2 });
      } else if (type === 'G2' || type === 'G3') {
        const arc = getArcParams({ x: p1.xReal, z: p1.zReal }, { x: p2.xReal, z: p2.zReal }, p2.rVal, type);
        if (arc.error) foundErrors.push(`Řádek ${i + 2}: Rádius R${p2.r} je příliš malý.`);
        else if (arc.r < totalOffset) foundErrors.push(`KOLIZE (Řádek ${i + 2}): Rádius kontury menší než nástroj.`);
        const startAngle = Math.atan2(p1.xReal - arc.cx, p1.zReal - arc.cz);
        const endAngle = Math.atan2(p2.xReal - arc.cx, p2.zReal - arc.cz);
        contourSegments.push({ type: 'arc', ...arc, p1: { x: p1.xReal, z: p1.zReal }, p2: { x: p2.xReal, z: p2.zReal }, dir: type, startAngle, endAngle });
      }
    }
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
    if (contourSegments.length > 2) {
      contourSegments = removeContourSelfIntersections(contourSegments);
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
    const interferenceSegments = [];
    if (clearance) {
      rawContourForInterference.forEach(seg => {
        if (segInterferesWithTool(seg, clearance)) interferenceSegments.push(seg);
      });
    }

    // Automatické mezní čáry: jen při zapnutém Hlídání geometrie (jinak by
    // zůstaly vykreslené i po vypnutí). Ruční čáry (S.guideLines) netknuté.
    const interferenceGuides = (clearance && prms.respectInsertGeometry)
      ? computeInterferenceGuides(interferenceSegments, rawContourForInterference, clearance, prms, worldPoints, stockWorldPoints)
      : [];


    // Automatické profilování: při zapnutém Hlídání geometrie se nedosažitelné
    // úseky kontury nahradí mostovou úsečkou z geometrie destičky a tahle
    // obrobitelná kontura se použije pro offsety/dráhy/CNC.
    let machinableContour = null;
    if (clearance && prms.respectInsertGeometry && interferenceGuides.length > 0) {
      machinableContour = buildMachinableContour(contourSegments, interferenceGuides);
      contourSegments = machinableContour;
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
    const offsetPath = trimAndRemoveLoops(rawOffsets);

    // finishing offset
    if (prms.doFinishing) {
      // Hlídání destičky: úseky, kam destička bočním ostřím nedosáhne,
      // dokončování vynechá — následující segment dostane chainBreak,
      // takže se přes mezeru přejede rychloposuvem.
      const respectFin = prms.respectInsertGeometry && clearance;
      let finSkipped = 0;
      let pendingBreak = false;
      let finRaw = [];
      for (let i = 0; i < contourSegments.length; i++) {
        const seg = contourSegments[i];
        const blocked = respectFin && segInterferesWithTool(seg, clearance);
        let finSeg = null;
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
        if (blocked) {
          // Nedosažitelný úsek: neobrábí se (přerušení dráhy), ale uchová
          // se pro tečkované vykreslení a jako překážka pro rychloposuvy.
          finSkipped++;
          finSeg.unreachable = true;
          finishUnreachablePath.push(finSeg);
          pendingBreak = true;
          continue;
        }
        // Po přeskočeném oblouku (pendingBreak): přeskočit přechodný čelní
        // řez, jehož offset začíná na menším X než skončil předchozí segment
        // (nástroj by musel jet dovnitř — vznik trojúhelníkového artefaktu).
        // pendingBreak se smaže, aby se trim mohl spojit přímo s dalším segmentem.
        // VÝJIMKA: mostový úsek z geometrie destičky (fromInsert = konstrukční
        // čára dojezd/zanoření) je ZÁMĚRNÁ dráha — nikdy ho nezahazovat, jinak
        // dokončování zajede ZA konstrukční čáru (oblouk by začal moc brzy).
        if (pendingBreak && finSeg.type === 'line' && !seg.fromInsert && finRaw.length > 0) {
          const prev = finRaw[finRaw.length - 1];
          if (prev.type === 'line' && finSeg.p1.x < prev.p2.x - 0.05) {
            pendingBreak = false;
            continue;
          }
        }
        // Mostový úsek (fromInsert) nikdy nepřerušovat: jeho konce LEŽÍ na
        // kontuře (spojitý), takže ho trim napojí v průsečíku s předchozím
        // úsekem. Bez výjimky by ho přeskočený mikro/degenerovaný oblouk před
        // ním označil jako chainBreak → dokončování by k němu skočilo G0 a
        // oblouk by začal moc brzy (zajetí za konstrukční čáru).
        if ((seg.chainBreak || pendingBreak) && !seg.fromInsert) finSeg.chainBreak = true;
        pendingBreak = false;
        finRaw.push(finSeg);
      }
      finishOffsetPath = trimAndRemoveLoops(finRaw);
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

    // Passes
    const passes = [];
    const step = parseFloat(prms.depthOfCut) || 1;
    const sRad = (parseFloat(prms.stockDiameter) || 100) / 2;
    const stockFace = parseFloat(prms.stockFace) || 0;

    // Rozsah obrábění (📐) — pro strategii „druhá strana" (zleva) vymezuje
    // Z-zónu, kde se obrábí. Aktivní jen když uživatel rozsah zobrazí
    // (showZLimits 'range' nebo 'both') a má obě hodnoty. null = neomezeno.
    const rangeShown = S.showZLimits === 'range' || S.showZLimits === 'both';
    const rS = S.zLimits.rangeStart, rE = S.zLimits.rangeEnd;
    const machiningRange = (rangeShown && typeof rS === 'number' && isFinite(rS)
      && typeof rE === 'number' && isFinite(rE))
      ? { zLo: Math.min(rS, rE), zHi: Math.max(rS, rE) } : null;
    // Čelisti (levý konec v upínači) — backside nesmí řezat pod chuck.
    const fixturesShown = S.showZLimits === 'fixtures' || S.showZLimits === 'both';
    const chuckZ = (fixturesShown && typeof S.zLimits.chuck === 'number' && isFinite(S.zLimits.chuck))
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
            if (zA <= zHi + 1e-6 && zA >= zLo - 1e-6)
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
      findLeadOutEndZ, hIntersect, machiningRange, chuckZ,
    };
    // operations[] model: seznam operací hrubování, každá naplní passes
    // přes svou strategii z registru. Zatím odvozeno z prms.roughingStrategy
    // (= 1 operace); persistentní seznam + UI přijdou s druhou stranou.
    const operations = getRoughingOperations();
    for (const op of operations) {
      const strategy = ROUGHING_STRATEGIES[op.kind] || ROUGHING_STRATEGIES.longitudinal;
      strategy.genPasses(passCtx, op);
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
    const limitsActive = S.showZLimits === 'fixtures' || S.showZLimits === 'both';
    const chuckLim = (limitsActive && typeof S.zLimits.chuck === 'number' && isFinite(S.zLimits.chuck)) ? S.zLimits.chuck : null;
    const tailLim  = (limitsActive && typeof S.zLimits.tail  === 'number' && isFinite(S.zLimits.tail))  ? S.zLimits.tail  : null;
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
          } else if (zS - zE < EPS) { droppedCount++; continue; }
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
          // Arc: pokud je celý uvnitř → keep; pokud min/max Z prochází limit → drop.
          const zMin = seg.cz - seg.r, zMax = seg.cz + seg.r;
          // Konzervativně: pokud rozsah Z překračuje limit, oblouk zahodit.
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
    simPath = parseManualGCodeToPath(S.manualGCode, prms);
    for (let i = 0; i < simPath.length - 1; i++)
      addToPath(simPath[i].x, simPath[i].z, simPath[i + 1].x, simPath[i + 1].z, simPath[i + 1].type);

    // Vrch polotovaru v X (pro bezpečné rapid přejezdy nad materiálem).
    let stockTopX = sRad;
    if (prms.stockMode === 'casting' && stockWorldPoints.length > 0) {
      stockTopX = -9999;
      stockWorldPoints.forEach(p => { if (p.xReal > stockTopX) stockTopX = p.xReal; });
    }

    S.errors = foundErrors;
    return { worldPoints, stockWorldPoints, contourSegments, machinableContour, offsetPath, finishOffsetPath, finishUnreachablePath, stockPathSegments, passes, simPath, retractDist, totalPathLength, estimatedTimeSeconds, interferenceSegments, interferenceGuides, stockTopX };
  }

  // ── G-Code Editor Content ────────────────────────────────────
  // G-kód editor je vždy ručně editovatelný (viz "🔄 Autorefresh drah").
  function generateGCode(calc) {
    return S.manualGCode.split('\n').map((line, idx) => ({ text: line, simIdx: idx }));
  }

  // ── Auto G-Code Generator (z aktuální kontury/parametrů) ─────
  // Volá se jen z tlačítka "🔄 Autorefresh drah" — výsledek přepíše
  // S.manualGCode (a tedy i editor a simulační dráhu).
  function generateAutoGCode(calc) {
    const prms = S.params;
    const d = new Date();
    const lines = [];
    const add = (text, simIdx = null) => lines.push({ text, simIdx });
    const cmt = (text) => prms.controlSystem === 'fanuc' ? `( ${text} )` : `; ${text}`;
    const addCmt = (text) => add(cmt(text), null);
    let blockNum = 10;
    const N = () => { const s = `N${blockNum} `; blockNum += 10; return s; };
    const addN = (text, simIdx = null) => add(`${N()}${text}`, simIdx);
    const note = (cmd, text) => ` ${cmd}${cmt(text)}`;
    let arcR = (r) => `CR=${(parseFloat(r) || 0).toFixed(3)}`;
    // Při otočení svislé osy X (X+ dolů) je program psán pro nástroj zespodu –
    // smysl rotace se obrací, takže G02↔G03 ve výstupu prohazujeme.
    const flipArc = (code) => {
      if (!S.flipX) return code;
      const c = String(code).trim().toUpperCase();
      if (c === 'G2' || c === 'G02') return code.includes('02') ? 'G03' : 'G3';
      if (c === 'G3' || c === 'G03') return code.includes('03') ? 'G02' : 'G2';
      return code;
    };

    if (prms.controlSystem === 'sinumerik') {
      addCmt('Vygenerovaný kód SINUMERIK 840D');
      addCmt(`Datum: ${d.toLocaleDateString()}`);
      if (S.flipX) addCmt('Obrábění zespodu (X+ dolů) – G2/G3 prohozeny');
      addN(`G18${note('', 'Rovina ZX')}`); addN(`G90${note('', 'Absolutní programování')}`);
      addN(`G54${note('', 'Posunutí počátku')}`); addN(`G95${note('', 'Posuv na otáčku')}`);
      addN(`G75 X${prms.safeX}${note('', 'Nájezd do ref. bodu')}`); addN(`G75 Z${prms.safeZ}`);
      addN(`LIMS=2000${note('', 'Limit otáček')}`);
      addN(`G96 S${prms.speed} ${prms.machineType}${note('', 'Konst. řezná rychlost')}`);
      addN(`${prms.mode === 'DIAMON' ? 'DIAMON' : 'DIAMOF'}${note('', prms.mode === 'DIAMON' ? 'Programování průměru' : 'Programování poloměru')}`);
      addN(`T="${prms.toolName}" D1 M6${note('', 'Výměna nástroje')}`);
      addN(`M3${note('', 'Vřeteno CW')}`); addN(`M8${note('', 'Chlazení ZAP')}`);
      arcR = (r) => `CR=${(parseFloat(r) || 0).toFixed(3)}`;
    } else if (prms.controlSystem === 'fanuc') {
      addCmt('Vygenerovaný kód FANUC'); addCmt(`Datum: ${d.toLocaleDateString()}`);
      if (S.flipX) addCmt('Obrábění zespodu (X+ dolů) – G2/G3 prohozeny');
      addN(`G21${note('', 'Metrický vstup')}`); addN(`G40${note('', 'Zrušení kompenzace')}`);
      addN(`G99${note('', 'Posuv mm/ot')}`); addN(`G18${note('', 'Rovina ZX')}`);
      addN(`G28 U0 W0${note('', 'Referenční bod')}`); addN(`G50 S2000${note('', 'Max otáčky')}`);
      addN(`G96 S${prms.speed} M3${note('', 'Konst. řezná rychlost')}`);
      addN(`T0101${note('', 'Nástroj 1 / Korekce 1')}`); addN(`M8${note('', 'Chlazení ZAP')}`);
      arcR = (r) => `R${(parseFloat(r) || 0).toFixed(3)}`;
    } else if (prms.controlSystem === 'heidenhain') {
      addCmt('Vygenerovaný kód HEIDENHAIN ISO'); addCmt(`Datum: ${d.toLocaleDateString()}`);
      if (S.flipX) addCmt('Obrábění zespodu (X+ dolů) – G2/G3 prohozeny');
      addN(`G18${note('', 'Rovina ZX')}`); addN(`G90${note('', 'Absolutní')}`);
      addN(`G71${note('', 'Metrický systém')}`); addN(`G54${note('', 'Nulový bod')}`);
      addN(`G96 S${prms.speed} M3${note('', 'Řezná rychlost')}`);
      addN(`T1 M6${note('', 'Nástroj')}`); addN('M8');
      arcR = (r) => `R${(parseFloat(r) || 0).toFixed(3)}`;
    }

    let simCounter = 0;
    addN(`G0 X${prms.safeX} Z${prms.safeZ}${note('', 'Rychloposuv')}`, 0);
    const rDist = calc.retractDist || 2.0;

    addCmt(`--- HRUBOVANI (${(ROUGHING_STRATEGIES[roughingKey()] || ROUGHING_STRATEGIES.longitudinal).label}) ---`);
    // Vůle nad polotovarem + úhel nájezdové rampy (ladí s calculate()).
    const rapidClrGc = Math.max(0.05, parseFloat(prms.rapidClearance) || 1);
    const entryAngleDegGc = getEffectivePlungeAngle(prms);
    const entryRadGc = entryAngleDegGc * Math.PI / 180;
    // Helper: ořezat Z na aktivní čelisti/koník limity (G-kód generace).
    const gcLimsActive = S.showZLimits === 'fixtures' || S.showZLimits === 'both';
    const gcChuckZ = (gcLimsActive && typeof S.zLimits.chuck === 'number' && isFinite(S.zLimits.chuck)) ? S.zLimits.chuck : null;
    const gcTailZ  = (gcLimsActive && typeof S.zLimits.tail  === 'number' && isFinite(S.zLimits.tail))  ? S.zLimits.tail  : null;
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
    const cur = { x: null, z: null };
    const setPos = (x, z) => { cur.x = x; cur.z = z; };
    // Výchozí poloha = bezpečná poloha z úvodního G0 (programované souř.).
    setPos((parseFloat(prms.safeX) || 0) / (prms.mode === 'DIAMON' ? 2 : 1), parseFloat(prms.safeZ) || 0);
    // touch = true: cíl leží na kontuře/materiálu — poslední úsek sjezdu
    // (Vůle nad polotovarem) se jede pracovním posuvem, ne rychloposuvem.
    const safeRapidTo = (tx, tz, touch = false) => {
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
      if (segmentHitsPath({ x: cur.x, z: cur.z }, { x: tx, z: tz }, rapidBlockers)) {
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
      addCmt(`Průchod ${i + 1}${pass.ramp ? ' (oblouk G3)' : pass.contourLeadIn ? ' (kapsa po kontuře)' : pass.contourLeadOut ? ' (bez schodků)' : ''}`);
      if (pass.type === 'long' && pass.contourLeadIn) {
        // Kapsa za bossem kontury: namísto odskoku a rychloposuvu přes
        // vršek polotovaru se kopíruje samotná kontura (G1/G2/G3) až k
        // bodu, kde její sklon dosáhne úhlu zanoření, odtud rampa pod
        // tímto úhlem na aktuální zaběr, dno kapsy a standardní odskok.
        const li = pass.contourLeadIn;
        const entry = li.length > 0
          ? { x: li[0].x1, z: li[0].z1 }
          : (pass.ramp ? { x: pass.ramp.x0, z: pass.ramp.z0 } : { x: pass.x, z: pass.zStart });
        // Návrat na konturu z odskoku předchozího průchodu.
        if (Math.abs(cur.x - entry.x) > 1e-6 || Math.abs(cur.z - entry.z) > 1e-6) {
          simCounter += 1; addN(`G1 X${xDia(entry.x)} Z${entry.z.toFixed(3)} F${prms.feed}`, simCounter); setPos(entry.x, entry.z);
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
          // Bez schodků: po dně kapsy dál po kontuře (G1/G2/G3) místo
          // odskoku — druhá stěna kapsy (G2 na bod 10, úsečka na bod 11)
          // se obrobí přímo po obrysu.
          for (const seg of pass.contourLeadOut) {
            if (seg.type === 'line') {
              simCounter += 1; addN(`G1 X${xDia(seg.x2)} Z${seg.z2.toFixed(3)} F${prms.feed}`, simCounter); setPos(seg.x2, seg.z2);
            } else {
              simCounter += 1; addN(`${flipArc(seg.dir)} X${xDia(seg.x2)} Z${seg.z2.toFixed(3)} ${arcR(seg.r)} F${prms.feed}`, simCounter); setPos(seg.x2, seg.z2);
            }
          }
        }
        if (!pass.noRetract) {
          const zRetractVal = clipZGc(cur.z + rDist);
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
          const zRetractVal = clipZGc(cur.z - rDist);
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
          const zRetractVal = clipZGc(cur.z + rDist);
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
        const zRetractVal = clipZGc(cur.z + rDist);
        simCounter += 1; addN(`G1 X${xDia(cur.x + rDist)} Z${zRetractVal.toFixed(3)}`, simCounter); setPos(cur.x + rDist, zRetractVal);
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
    if (prms.doFinishing && firstGcFinSeg) {
      addCmt('--- DOKONCOVANI ---');
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
      simCounter += 1; addN(`G1 X${sX_out} Z${sZ.toFixed(3)} F${prms.feed}`, simCounter); setPos(sX, sZ);
      finPath.forEach(seg => {
        if (seg.isDegenerate) return;
        // chainBreak = samostatný řetěz (mezi konturami nic nenavazuje) —
        // najet rychloposuvem na jeho začátek místo řezného přejezdu mezerou.
        if (seg.chainBreak) {
          const sp = segStartPoint(seg);
          // touch: cíl leží na kontuře — poslední vůli dojet posuvem.
          safeRapidTo(sp.x, sp.z, true);
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

    if (prms.controlSystem === 'fanuc') {
      addN('M9'); addN('M5'); addN('G28 U0 W0'); addN(`M30${note('', 'Konec programu')}`);
    } else if (prms.controlSystem === 'heidenhain') {
      addN('M9'); addN('M5'); addN('M30');
    } else {
      addN(`M30${note('', 'Konec programu')}`);
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
      error: '#f38ba8', text: '#6c7086', tool: '#f9e2af'
    };

    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);
    const vS = S.flipX ? 1 : -1;
    const toScreen = (x, z) => {
      if (isNaN(x) || isNaN(z)) return { x: 0, y: 0 };
      if (prms.machineStructure === 'carousel')
        return { x: S.view.panX + x * S.view.scale, y: S.view.panY + vS * z * S.view.scale };
      return { x: S.view.panX + z * S.view.scale, y: S.view.panY + vS * x * S.view.scale };
    };

    // grid — dynamically cover entire visible canvas
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.beginPath();
    // Convert canvas corners to world coords to find visible range
    const toWorld = (sx, sy) => {
      if (prms.machineStructure === 'carousel')
        return { x: (sx - S.view.panX) / S.view.scale, z: vS * (sy - S.view.panY) / S.view.scale };
      return { x: vS * (sy - S.view.panY) / S.view.scale, z: (sx - S.view.panX) / S.view.scale };
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
    if (prms.machineStructure === 'carousel') {
      ctx.fillText('X+', w - 20, zero.y + 15); ctx.fillText('Z+', zero.x + 10, vLabelY);
    } else {
      ctx.fillText('Z+', w - 20, zero.y + 15); ctx.fillText('X+', zero.x + 10, vLabelY);
    }
    ctx.fillText('X0 Z0', zero.x + 4, zero.y - 4);

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
    if (calc.worldPoints.length > 0) {
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
      ctx.strokeStyle = S._previewContour ? 'rgba(137,180,250,0.25)' : C.contour; ctx.lineWidth = 3; ctx.stroke();

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
          let e1 = { x: g.x1, z: g.z1 }, e2 = { x: g.x2, z: g.z2 };
          if (!g.auto && S.gcodeEditEnabled) {
            let dx = g.x2 - g.x1, dz = g.z2 - g.z1; const L = Math.hypot(dx, dz);
            if (L > 1e-9) { dx /= L; dz /= L; e1 = { x: g.x1 - dx * 1e4, z: g.z1 - dz * 1e4 }; e2 = { x: g.x2 + dx * 1e4, z: g.z2 + dz * 1e4 }; }
          }
          const p1 = toScreen(e1.x, e1.z), p2 = toScreen(e2.x, e2.z);
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.setLineDash([8, 4]); ctx.stroke(); ctx.setLineDash([]);
          // offset dráhy středu plátku (korekce R) na stranu vzduchu (+X).
          // Dva offsety jako u kontury: dokončovací (jen R) a hrubovací
          // (R + Přídavek X/Z + Přídavek na hotovo).
          if (tipROff > 0) {
            let n = getNormal({ x: g.x1, z: g.z1 }, { x: g.x2, z: g.z2 });
            if (n.x < 0 || (Math.abs(n.x) < 1e-9 && n.z < 0)) n = { x: -n.x, z: -n.z };
            const aX = parseFloat(prms.allowanceX) || 0;
            const aZ = parseFloat(prms.allowanceZ) || 0;
            const fin = parseFloat(prms.finishAllowance) || 0;
            const drawOff = (ox, oz) => {
              const o1 = toScreen(e1.x + ox, e1.z + oz);
              const o2 = toScreen(e2.x + ox, e2.z + oz);
              ctx.beginPath(); ctx.moveTo(o1.x, o1.y); ctx.lineTo(o2.x, o2.y);
              ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.stroke(); ctx.setLineDash([]);
            };
            drawOff(n.x * tipROff, n.z * tipROff);
            if (aX > 1e-9 || aZ > 1e-9 || fin > 1e-9)
              drawOff(n.x * (tipROff + aX + fin), n.z * (tipROff + aZ + fin));
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
    if (S.showSimPath !== 'none' && prms.doFinishing && (calc.finishUnreachablePath || []).length > 0) {
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
        const rPix = Math.max(tRad * S.view.scale, 6);
        ctx.fillStyle = C.tool; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
        if (prms.toolShape === 'round') {
          ctx.beginPath(); ctx.arc(pt.x, pt.y, rPix, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        } else if (prms.toolShape === 'polygon') {
          const lenPix = Math.max((parseFloat(prms.toolLength) || 10) * S.view.scale, 20);
          const rotRad = -(parseFloat(prms.toolAngle) || 0) * (Math.PI / 180);
          const tipAng = (parseFloat(prms.toolTipAngle) || 90) * (Math.PI / 180);
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
          // Druhá strana (zleva): destička řeže opačným směrem (+Z) —
          // zrcadlit v ose Z (vodorovně), ať špička míří doprava.
          if (roughingKey() === 'backside') ctx.scale(-1, 1);
          ctx.beginPath(); ctx.moveTo(t1x, t1y);
          ctx.lineTo(cornerX + Math.cos(a1) * lenPix, cornerY + Math.sin(a1) * lenPix);
          ctx.lineTo(cornerX + Math.cos(a2) * lenPix, cornerY + Math.sin(a2) * lenPix);
          ctx.lineTo(t2x, t2y);
          ctx.arc(0, 0, rPix, angT2, angT1, useCCW);
          ctx.closePath(); ctx.fill(); ctx.stroke();
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
      if (calc.worldPoints) {
        calc.worldPoints.forEach((p, i) => {
          if (!p) return;
          const pt = toScreen(p.xReal, p.zReal);
          const isHovered = (contourActive || pointPickActive) && !S._hoverIsStock && i === S.hoverPointId;
          const isDragged = contourActive && !_draggingStock && i === S.draggedPointId;
          const isSelected = contourActive && S.selectedPoints.has(i);
          const radius = (isHovered || isDragged) ? 8 : (isSelected ? 6 : (contourActive ? 4 : 3));
          ctx.fillStyle = (isHovered || isDragged) ? '#f9e2af' : (isSelected ? '#f9e2af' : C.contour);
          ctx.beginPath(); ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2); ctx.fill();
          if (isSelected) {
            ctx.strokeStyle = '#f9e2af'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(pt.x, pt.y, radius + 3, 0, Math.PI * 2); ctx.stroke();
          }
          if (!isHovered && !isDragged) {
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
          const isHovered = (stockActive || pointPickActive) && S._hoverIsStock && i === S.hoverPointId;
          const isDragged = stockActive && _draggingStock && i === S.draggedPointId;
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
      const showFix = S.showZLimits === 'fixtures' || S.showZLimits === 'both';
      const showRng = S.showZLimits === 'range'    || S.showZLimits === 'both';
      if (showFix) {
        // Limity (čelisti, koník) – červené, krátké tečky
        drawZLine(S.zLimits.chuck, '#f38ba8', '⛔ Čelisti', false);
        drawZLine(S.zLimits.tail,  '#f38ba8', '⛔ Koník',   false);
      }
      if (showRng) {
        // Rozsah obrábění – žluté, dlouhé čárky
        drawZLine(S.zLimits.rangeStart, '#f9e2af', '◀ Start rozsahu', true);
        drawZLine(S.zLimits.rangeEnd,   '#f9e2af', 'Konec rozsahu ▶', true);
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
      const label = `Z: ${S._snap.z.toFixed(3)}  X: ${xDisp.toFixed(3)}`;
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
    const vS = S.flipX ? 1 : -1;
    if (isCar) S.view = { scale: ns, panX: cW / 2 - midX * ns, panY: cH / 2 - vS * midZ * ns };
    else S.view = { scale: ns, panX: cW / 2 - midZ * ns, panY: cH / 2 - vS * midX * ns };
    draw();
  }

  // ── getPointAt (hit testing) ──
  function getStockHandleAt(clientX, clientY) {
    if (S.simRunning || S.params.stockMode !== 'cylinder') return null;
    const calc = S._cachedCalc; if (!calc) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left, my = clientY - rect.top;
    const prms = S.params;
    const vS = S.flipX ? 1 : -1;
    const toScreen = (x, z) => {
      if (prms.machineStructure === 'carousel') return { x: S.view.panX + x * S.view.scale, y: S.view.panY + vS * z * S.view.scale };
      return { x: S.view.panX + z * S.view.scale, y: S.view.panY + vS * x * S.view.scale };
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
    const vS = S.flipX ? 1 : -1;
    const toScreen = (x, z) => {
      if (prms.machineStructure === 'carousel') return { x: S.view.panX + x * S.view.scale, y: S.view.panY + vS * z * S.view.scale };
      return { x: S.view.panX + z * S.view.scale, y: S.view.panY + vS * x * S.view.scale };
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
    const vS = S.flipX ? 1 : -1;
    if (S.params.machineStructure === 'carousel')
      return { x: S.view.panX + x * S.view.scale, y: S.view.panY + vS * z * S.view.scale };
    return { x: S.view.panX + z * S.view.scale, y: S.view.panY + vS * x * S.view.scale };
  }
  function _gToWorld(sx, sy) {
    const vS = S.flipX ? 1 : -1;
    if (S.params.machineStructure === 'carousel')
      return { x: (sx - S.view.panX) / S.view.scale, z: vS * (sy - S.view.panY) / S.view.scale };
    return { z: (sx - S.view.panX) / S.view.scale, x: vS * (sy - S.view.panY) / S.view.scale };
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
    const vS = S.flipX ? 1 : -1;
    const toScreen = (x, z) => {
      if (prms.machineStructure === 'carousel') return { x: S.view.panX + x * S.view.scale, y: S.view.panY + vS * z * S.view.scale };
      return { x: S.view.panX + z * S.view.scale, y: S.view.panY + vS * x * S.view.scale };
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

  // Převod kliknutí (client souřadnice) na world souřadnice (X = rádius).
  function clientToWorldCam(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left, sy = clientY - rect.top;
    const vS = S.flipX ? 1 : -1;
    if (S.params.machineStructure === 'carousel') {
      return { wx: (sx - S.view.panX) / S.view.scale, wz: vS * (sy - S.view.panY) / S.view.scale };
    }
    return { wx: vS * (sy - S.view.panY) / S.view.scale, wz: (sx - S.view.panX) / S.view.scale };
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
      let n = getNormal({ x: g.x1, z: g.z1 }, { x: g.x2, z: g.z2 });
      if (n.x < 0 || (Math.abs(n.x) < 1e-9 && n.z < 0)) n = { x: -n.x, z: -n.z };
      out.push({ type: 'line', kind: 'finish',
        p1: { x: g.x1 + n.x * tipROff, z: g.z1 + n.z * tipROff },
        p2: { x: g.x2 + n.x * tipROff, z: g.z2 + n.z * tipROff } });
      if (hasRough) {
        const dxR = n.x * (tipROff + aX + fin), dzR = n.z * (tipROff + aZ + fin);
        out.push({ type: 'line', kind: 'rough',
          p1: { x: g.x1 + dxR, z: g.z1 + dzR },
          p2: { x: g.x2 + dxR, z: g.z2 + dzR } });
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
    for (const g of getAllGuideLines()) lineHit({ x: g.x1, z: g.z1 }, { x: g.x2, z: g.z2 });
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
      g = { x1: auto.x1, z1: auto.z1, x2: auto.x2, z2: auto.z2 };
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
    const vS = S.flipX ? 1 : -1;
    const toScreen = (x, z) => {
      if (prms.machineStructure === 'carousel') return { x: S.view.panX + x * S.view.scale, y: S.view.panY + vS * z * S.view.scale };
      return { x: S.view.panX + z * S.view.scale, y: S.view.panY + vS * x * S.view.scale };
    };
    const isKarusel = prms.machineStructure === 'carousel';
    let bestKey = null, bestD = 8; // tolerance v pixelech
    // Drag-target jen pro aktuálně viditelnou skupinu čar.
    let visibleKeys = [];
    if (S.showZLimits === 'fixtures') visibleKeys = ['chuck', 'tail'];
    else if (S.showZLimits === 'range') visibleKeys = ['rangeStart', 'rangeEnd'];
    else if (S.showZLimits === 'both') visibleKeys = ['chuck', 'tail', 'rangeStart', 'rangeEnd'];
    for (const key of visibleKeys) {
      const z = S.zLimits[key];
      if (z === null || z === undefined || isNaN(z)) continue;
      const d = isKarusel ? Math.abs(toScreen(0, z).y - my) : Math.abs(toScreen(0, z).x - mx);
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
    errorsDiv.innerHTML = '<b>⚠ Nalezeny problémy:</b><ul>' +
      S.errors.map(e => '<li>' + (e.msg || e) + '</li>').join('') + '</ul>';
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
    // Při úpravě drah (✥ Dráhy) má přednost právě editovaný řádek, jinak
    // aktivní řádek simulace.
    // Focus řádek (klik na dráhu) má přednost před aktivním řádkem simulace
    // i při zamčených bodech – stačí, že není spuštěná simulace.
    const focusEdit = !S.simRunning && S._gcodeFocusLine != null;
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
        if (S.editMode === 'stock') {
          // Vstup do editoru polotovaru = uživatel chce vlastní tvar.
          // Bez switche by jeho body byly skryté za válcovým renderingem.
          if (S.params.stockMode !== 'casting') S.params.stockMode = 'casting';
          if (S.stockPoints.length === 0) generateDefaultStock();
        }
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
    html += `<div class="cam-sim-section-title">Struktura stroje</div>
    <div class="cam-sim-toggle-row">
      <button data-struct="lathe" class="${prms.machineStructure === 'lathe' ? 'cam-sim-active' : ''}">Soustruh</button>
      <button data-struct="carousel" class="${prms.machineStructure === 'carousel' ? 'cam-sim-active' : ''}">Karusel</button>
    </div>`;
    html += `<div class="cam-sim-section-title">Řídicí systém</div>
    <div class="cam-sim-toggle-row">
      <button data-ctrl="sinumerik" class="${prms.controlSystem === 'sinumerik' ? 'cam-sim-active' : ''}">Sinumerik</button>
      <button data-ctrl="fanuc" class="${prms.controlSystem === 'fanuc' ? 'cam-sim-active' : ''}">Fanuc</button>
      <button data-ctrl="heidenhain" class="${prms.controlSystem === 'heidenhain' ? 'cam-sim-active' : ''}">Heidenhain</button>
    </div>`;
    html += `<div class="cam-sim-section-title">Programování</div>
    <div class="cam-sim-toggle-row">
      <button data-pmode="DIAMON" class="${prms.mode === 'DIAMON' ? 'cam-sim-active' : ''}">⌀ Průměr</button>
      <button data-pmode="RADIUS" class="${prms.mode === 'RADIUS' ? 'cam-sim-active' : ''}">R Poloměr</button>
    </div>
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label>Max. otáčky (LIMS)</label><input type="number" data-p="lims" inputmode="numeric" value="${parseInt((prms.machineType || '').match(/LIMS=(\d+)/)?.[1]) || 2000}"></div>
      <div class="cam-sim-field"><label>Název nástroje</label><input type="text" data-p="toolName" inputmode="text" value="${prms.toolName}"></div>
    </div>`;
    html += `<div class="cam-sim-section-title">Polotovar</div>
    <div class="cam-sim-toggle-row">
      <button data-smode="cylinder" class="${prms.stockMode === 'cylinder' ? 'cam-sim-active' : ''}">Válec</button>
      <button data-smode="casting" class="${prms.stockMode === 'casting' ? 'cam-sim-active' : ''}">Vlastní tvar</button>
    </div>`;
    if (prms.stockMode === 'cylinder') {
      html += `<div class="cam-sim-row">
        <div class="cam-sim-field"><label>Průměr (D)</label><input type="number" data-p="stockDiameter" value="${prms.stockDiameter}"></div>
        <div class="cam-sim-field"><label>Délka (Z-)</label><input type="number" data-p="stockLength" value="${prms.stockLength}"></div>
      </div>
      <div class="cam-sim-row">
        <div class="cam-sim-field"><label>Přídavek čelo</label><input type="number" data-p="stockFace" value="${prms.stockFace}"></div>
        <div class="cam-sim-field"><label>Přídavek (Auto)</label><input type="number" data-p="stockMargin" value="${prms.stockMargin}"></div>
      </div>
      <button class="cam-sim-btn cam-sim-btn-indigo" data-act="auto-stock">🎯 Auto-rozměr</button>`;
    } else {
      html += `<div class="cam-sim-info-box">Pro definici tvarového polotovaru přepněte na Editor → Polotovar.</div>`;
    }
    html += `<div class="cam-sim-section-title">Bezpečná poloha</div>
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label>X (Průměr)</label><input type="number" data-p="safeX" value="${prms.safeX}"></div>
      <div class="cam-sim-field"><label>Z</label><input type="number" data-p="safeZ" value="${prms.safeZ}"></div>
    </div>
    <div class="cam-sim-row">
      <div class="cam-sim-field" title="Vzdálenost od polotovaru, kde končí rychloposuv. Sjezd přes tuto vůli na povrch už jede pracovním posuvem G1."><label>Vůle nad polotovarem</label><input type="number" step="0.1" min="0.1" data-p="rapidClearance" value="${prms.rapidClearance}"></div>
    </div>`;
    const zlOn = S.showZLimits && S.showZLimits !== 'off';
    const zlLabel = S.showZLimits === 'fixtures' ? '⛔ Čelisti+koník'
                  : (S.showZLimits === 'range'   ? '📐 Rozsah obrábění'
                  : (S.showZLimits === 'both'    ? '🟰 Vše'
                  : 'Zobrazit'));
    html += `<div class="cam-sim-section-title">Z-limity / rozsah <button data-act="zlimits-toggle" class="cam-sim-btn ${zlOn ? 'cam-sim-btn-green' : 'cam-sim-btn-gray'}" style="width:auto;display:inline-flex;padding:2px 8px;font-size:11px;margin-left:8px">${zlLabel}</button></div>
    <small class="cam-sim-info-box" style="display:block">Čelisti / koník = bezpečnostní limity (červené). Rozsah = úsek kontury k obrábění (žluté). Na canvasu lze tahat myší.</small>
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label>⛔ Čelisti Z</label><input type="number" step="0.5" data-zlim="chuck" value="${S.zLimits.chuck ?? ''}" placeholder="vypnuto"></div>
      <div class="cam-sim-field"><label>⛔ Koník Z</label><input type="number" step="0.5" data-zlim="tail" value="${S.zLimits.tail ?? ''}" placeholder="vypnuto"></div>
    </div>
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label>◀ Rozsah start Z</label><input type="number" step="0.5" data-zlim="rangeStart" value="${S.zLimits.rangeStart ?? ''}" placeholder="vypnuto"></div>
      <div class="cam-sim-field"><label>Rozsah konec Z ▶</label><input type="number" step="0.5" data-zlim="rangeEnd" value="${S.zLimits.rangeEnd ?? ''}" placeholder="vypnuto"></div>
    </div>
    <div style="text-align:right;margin-top:2px"><button class="cam-sim-btn cam-sim-btn-gray" style="width:auto;display:inline-flex;padding:2px 8px;font-size:11px" data-act="zlimits-clear">Vymazat vše</button></div>`;
    html += `<div class="cam-sim-section-title">Databáze materiálů</div>
    <div class="cam-sim-mat-grid">${Object.keys(MATERIALS).map(k =>
      `<button data-mat="${k}">${MATERIALS[k].name}</button>`
    ).join('')}</div>`;
    html += `<div class="cam-sim-section-title">Hrubování</div>
    <div class="cam-sim-toggle-row">
      <button data-rough="longitudinal" class="${prms.roughingStrategy === 'longitudinal' ? 'cam-sim-active' : ''}">→ Podélně (Z)</button>
      <button data-rough="face" class="${prms.roughingStrategy === 'face' ? 'cam-sim-active' : ''}">↓ Čelně (X)</button>
    </div>
    <div class="cam-sim-toggle-row">
      <button data-side="right" class="${(prms.roughingSide || 'right') === 'right' ? 'cam-sim-active' : ''}" title="Zaber zprava doleva (standard)">→ Zprava</button>
      <button data-side="left" class="${prms.roughingSide === 'left' ? 'cam-sim-active' : ''}" title="Druhá strana — zaber zleva doprava (zprava nelze, narazil by držák / geometrie destičky), omezeno 📐 Rozsahem obrábění">⇆ Zleva</button>
    </div>
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label>Hloubka (ap)</label><input type="number" step="0.5" data-p="depthOfCut" value="${prms.depthOfCut}"></div>
      <div class="cam-sim-field"><label>Posuv (F)</label><input type="number" step="0.05" data-p="feed" value="${prms.feed}"></div>
    </div>
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label>Rychlost (Vc)</label><input type="number" step="10" data-p="speed" value="${prms.speed}"></div>
      <div class="cam-sim-field"><label>Odskok</label><input type="number" step="0.5" data-p="retractDistance" value="${prms.retractDistance}"></div>
    </div>`;
    html += `<div class="cam-sim-checkbox-row">
      <input type="checkbox" id="cam-sim-nostep" ${prms.noStepRoughing ? 'checked' : ''}>
      <span>Hrubování bez schodků</span>
    </div>
    <small class="cam-sim-info-box" style="display:block;margin-top:2px">Po dojezdu hrubovacího průchodu na offset nástroj dál sleduje konturu (G1/G2/G3) až na hloubku dalšího průchodu, místo okamžitého odskoku — schody mezi kroky se obrobí přímo po obrysu.</small>`;
    if (prms.noStepRoughing) {
      html += `<div class="cam-sim-checkbox-row">
      <input type="checkbox" id="cam-sim-nostep-face" ${prms.noStepRoughingFace ? 'checked' : ''}>
      <span>… i u čelního hrubování</span>
    </div>`;
    }
    html += `<div class="cam-sim-section-title">Nástroj <button data-act="tool-library" class="cam-sim-btn cam-sim-btn-gray" style="width:auto;display:inline-flex;padding:2px 8px;font-size:11px;margin-left:8px">🧰 Knihovna</button></div>
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label>Rádius (R)</label><input type="number" step="0.1" data-p="toolRadius" value="${prms.toolRadius}"></div>
      <div class="cam-sim-field"><label>Přídavek na hotovo</label><input type="number" step="0.1" data-p="finishAllowance" value="${prms.finishAllowance}"></div>
    </div>
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label>Přídavek X</label><input type="number" step="0.1" data-p="allowanceX" value="${prms.allowanceX}"></div>
      <div class="cam-sim-field"><label>Přídavek Z</label><input type="number" step="0.1" data-p="allowanceZ" value="${prms.allowanceZ}"></div>
    </div>
    <small class="cam-sim-info-box" style="display:block;margin-top:2px">Hrubovací offset = Rádius (R) + Přídavek X/Z + Přídavek na hotovo. Dokončovací offset = jen Rádius (R).</small>
    <div style="margin-top:4px"><label style="font-size:10px;color:#6c7086">Tvar destičky</label></div>
    <div class="cam-sim-tool-shape-row">
      <button data-tshape="round" class="${prms.toolShape === 'round' ? 'cam-sim-active' : ''}">⬤</button>
      <button data-tshape="polygon" class="${prms.toolShape === 'polygon' ? 'cam-sim-active' : ''}">◼</button>
    </div>`;
    if (prms.toolShape === 'polygon') {
      html += `<div class="cam-sim-row">
        <div class="cam-sim-field"><label>Délka hrany</label><input type="number" data-p="toolLength" value="${prms.toolLength}"></div>
        <div class="cam-sim-field"><label>Natočení (°)</label><input type="number" data-p="toolAngle" value="${prms.toolAngle}"></div>
        <div class="cam-sim-field"><label>Vrch. úhel (ε)</label><input type="number" data-p="toolTipAngle" value="${prms.toolTipAngle}"></div>
      </div>`;
    }
    const effPlunge = Math.round(getEffectivePlungeAngle(prms) * 10) / 10;
    html += `<div class="cam-sim-row">
      <div class="cam-sim-field" style="flex:2" title="Úhel, pod kterým nástroj rampuje do materiálu (nájezd dokončování, zanořování do kapes). Auto = úhel spodní hrany destičky (podélně: natočení; čelně: natočení + ε − 90; kulatá destička: 45°)."><label>Úhel zanoření (°)</label><input type="number" step="0.5" min="0.5" max="89" data-p="entryAngle" value="${effPlunge}"></div>
      <div class="cam-sim-field" style="flex:1"><label>&nbsp;</label><button data-act="plunge-auto" class="cam-sim-btn ${prms.entryAngleAuto ? 'cam-sim-btn-green' : 'cam-sim-btn-gray'}" style="padding:4px 8px;font-size:11px" title="Auto = dopočítat úhel ze spodní hrany destičky (natočení + vrcholový úhel)">${prms.entryAngleAuto ? '🔗 Auto' : 'Auto'}</button></div>
    </div>`;
    if (prms.toolShape === 'polygon') {
      html += `<div class="cam-sim-checkbox-row">
        <input type="checkbox" id="cam-sim-respect-insert" ${prms.respectInsertGeometry ? 'checked' : ''}>
        <span>Hlídat geometrii destičky</span>
      </div>
      <small class="cam-sim-info-box" style="display:block;margin-top:2px">Hrubování i dokončování se upraví tak, aby boční ostří destičky (natočení + vrcholový úhel) nezajelo do kontury.</small>`;
    }
    html += `<div class="cam-sim-checkbox-row">
      <input type="checkbox" id="cam-sim-plunge" ${prms.plungeRoughing ? 'checked' : ''}>
      <span>Zanořování (kapsy/zápichy)</span>
    </div>
    <small class="cam-sim-info-box" style="display:block;margin-top:2px">Podélné hrubování smí rampou pod úhlem zanoření sjet i do kapes v kontuře.</small>`;
    html += `<div class="cam-sim-checkbox-row">
      <input type="checkbox" id="cam-sim-fin" ${prms.doFinishing ? 'checked' : ''}>
      <span>Dokončovací operace</span>
    </div>
    <small class="cam-sim-info-box" style="display:block;margin-top:2px">Dráha nástroje přesně po kontuře (pouze s korekcí R).</small>`;
    html += `<div style="text-align:center;margin-top:16px">
      <button class="cam-sim-btn cam-sim-btn-red" style="width:auto;display:inline-flex" data-act="reset">🔄 Resetovat vše</button>
    </div>`;
    tabBody.innerHTML = html;
    attachParamsEvents();
  }

  function attachParamsEvents() {
    tabBody.querySelectorAll('[data-struct]').forEach(btn => {
      btn.addEventListener('click', () => { S.params.machineStructure = btn.dataset.struct; fullUpdate(); });
    });
    tabBody.querySelectorAll('[data-ctrl]').forEach(btn => {
      btn.addEventListener('click', () => { S.params.controlSystem = btn.dataset.ctrl; fullUpdate(); });
    });
    tabBody.querySelectorAll('[data-pmode]').forEach(btn => {
      btn.addEventListener('click', () => { S.params.mode = btn.dataset.pmode; fullUpdate(); });
    });
    tabBody.querySelectorAll('[data-smode]').forEach(btn => {
      btn.addEventListener('click', () => {
        S.params.stockMode = btn.dataset.smode;
        if (btn.dataset.smode === 'casting') { S.activeTab = 'editor'; S.editMode = 'stock'; if (S.stockPoints.length === 0) generateDefaultStock(); }
        fullUpdate();
      });
    });
    tabBody.querySelectorAll('[data-p]').forEach(inp => {
      inp.addEventListener('change', () => {
        const v = inp.value;
        if (inp.dataset.p === 'lims') {
          S.params.machineType = `LIMS=${parseInt(v) || 2000}`;
        } else {
          // Ruční zadání úhlu zanoření vypíná auto dopočet z destičky.
          if (inp.dataset.p === 'entryAngle') S.params.entryAngleAuto = false;
          S.params[inp.dataset.p] = inp.type === 'number' ? (parseFloat(v) || 0) : v;
        }
        fullUpdate();
      });
    });
    tabBody.querySelectorAll('[data-mat]').forEach(btn => {
      btn.addEventListener('click', () => {
        const m = MATERIALS[btn.dataset.mat];
        if (m) { S.params.speed = m.speed; S.params.feed = m.feed; S.params.depthOfCut = m.depth; fullUpdate(); }
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
        fullUpdate();
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
    const zlClear = tabBody.querySelector('[data-act="zlimits-clear"]');
    if (zlClear) zlClear.addEventListener('click', () => {
      S.zLimits = { chuck: null, tail: null, rangeStart: null, rangeEnd: null };
      renderTab(); draw(); saveState();
    });
    tabBody.querySelectorAll('[data-tshape]').forEach(btn => {
      btn.addEventListener('click', () => {
        S.params.toolShape = btn.dataset.tshape;
        if (btn.dataset.tshape === 'polygon') S.params.toolTipAngle = 90;
        fullUpdate();
      });
    });
    const finCb = tabBody.querySelector('#cam-sim-fin');
    if (finCb) finCb.addEventListener('change', () => { S.params.doFinishing = finCb.checked; fullUpdate(); });
    const respCb = tabBody.querySelector('#cam-sim-respect-insert');
    if (respCb) respCb.addEventListener('change', () => { S.params.respectInsertGeometry = respCb.checked; fullUpdate(); });
    const plungeCb = tabBody.querySelector('#cam-sim-plunge');
    if (plungeCb) plungeCb.addEventListener('change', () => { S.params.plungeRoughing = plungeCb.checked; fullUpdate(); });
    const noStepCb = tabBody.querySelector('#cam-sim-nostep');
    if (noStepCb) noStepCb.addEventListener('change', () => { S.params.noStepRoughing = noStepCb.checked; fullUpdate(); });
    const noStepFaceCb = tabBody.querySelector('#cam-sim-nostep-face');
    if (noStepFaceCb) noStepFaceCb.addEventListener('change', () => { S.params.noStepRoughingFace = noStepFaceCb.checked; fullUpdate(); });
    const plungeAutoBtn = tabBody.querySelector('[data-act="plunge-auto"]');
    if (plungeAutoBtn) plungeAutoBtn.addEventListener('click', () => {
      S.params.entryAngleAuto = !S.params.entryAngleAuto;
      // Při vypnutí auta převezme pole aktuálně dopočtenou hodnotu,
      // aby šla ručně doladit od smysluplného výchozího čísla.
      if (!S.params.entryAngleAuto)
        S.params.entryAngle = getEffectivePlungeAngle({ ...S.params, entryAngleAuto: true });
      fullUpdate();
    });
    const toolLibBtn = tabBody.querySelector('[data-act="tool-library"]');
    if (toolLibBtn) toolLibBtn.addEventListener('click', () => {
      showToolLibraryDialog({
        getCurrent: () => ({
          name: S.params.toolName,
          tipRadius: S.params.toolRadius,
          toolAngle: S.params.toolAngle,
          tipAngle: S.params.toolTipAngle,
          vc: S.params.speed,
          f: S.params.feed,
          ap: S.params.depthOfCut,
        }),
        onApply: (tool) => {
          if (tool.name) S.params.toolName = tool.name;
          if (tool.tipRadius !== undefined) S.params.toolRadius = tool.tipRadius;
          if (tool.toolAngle !== undefined) S.params.toolAngle = tool.toolAngle;
          if (tool.tipAngle !== undefined) S.params.toolTipAngle = tool.tipAngle;
          if (tool.vc) S.params.speed = tool.vc;
          if (tool.f) S.params.feed = tool.f;
          if (tool.ap) S.params.depthOfCut = tool.ap;
          fullUpdate();
        },
      });
    });
    const autoBtn = tabBody.querySelector('[data-act="auto-stock"]');
    if (autoBtn) autoBtn.addEventListener('click', handleAutoStock);
    const resetBtn = tabBody.querySelector('[data-act="reset"]');
    if (resetBtn) resetBtn.addEventListener('click', async () => {
      const ok = await camConfirm('Opravdu chcete vymazat veškerou uloženou práci a resetovat?');
      if (ok) {
        localStorage.removeItem(STORAGE_KEY);
        overlay.remove();
        openCamSimulator();
      }
    });
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
      savedAt: new Date().toISOString(),
      params: S.params,
      contourPoints: S.contourPoints,
      stockPoints: S.stockPoints,
      manualGCode: S.manualGCode,
      flipX: S.flipX,
      guideLines: S.guideLines,
      zLimits: S.zLimits,
      showZLimits: S.showZLimits,
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
        if (typeof data.manualGCode === 'string') S.manualGCode = data.manualGCode;
        if (typeof data.flipX === 'boolean') S.flipX = data.flipX;
        if (data.guideLines) S.guideLines = data.guideLines;
        if (data.zLimits) S.zLimits = data.zLimits;
        if (data.showZLimits) S.showZLimits = data.showZLimits;
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
  async function handleSendToCanvas() {
    const pts = resolvePointsToAbsolute(S.contourPoints);
    if (pts.length < 2) { alert('Kontura nemá dostatek bodů.'); return; }
    const ok = await camConfirm('Smazat aktuální výkres a vložit konturu z CAM simulátoru?');
    if (!ok) return;

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
            name: `Úsečka ${id}`, id, layer: state.activeLayer,
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
            name: `Oblouk ${id}`, id, layer: state.activeLayer,
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
      const c1 = toCanvas(g.x1, g.z1);
      const c2 = toCanvas(g.x2, g.z2);
      const id = state.nextId++;
      state.objects.push({
        type: 'constr', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y,
        // finite: konce jsou už oříznuté (mezní/tečná čára), v editoru se
        // nekreslí donekonečna, ale jen mezi koncovými body — jako v CAM.
        finite: true,
        name: `Konstrukční čára ${id}`, id, layer: 1,
      });
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
    const vS = S.flipX ? 1 : -1;
    const prms = S.params || {};
    let wx, wz;
    if (prms.machineStructure === 'carousel') {
      wx = (sx - S.view.panX) / S.view.scale;
      wz = vS * (sy - S.view.panY) / S.view.scale;
    } else {
      wz = (sx - S.view.panX) / S.view.scale;
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
      for (const q of [{ x: g.x1, z: g.z1 }, { x: g.x2, z: g.z2 }])
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
    S.generatedCode = generateGCode(S._cachedCalc);
    showErrors();
    renderCodeArea();
    renderTab();
    draw();
    saveState();
    updateUndoRedoBtns();
    _updateProfileButtons();   // ❌ smazat profil zůstane, dokud profil existuje
  }

  // ── EVENT WIRING ──

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
      draw();
    } else if (act === 'fit') {
      fitView();
    } else if (act === 'flipx') {
      S.flipX = !S.flipX;
      btn.classList.toggle('cam-sim-active', S.flipX);
      btn.textContent = S.flipX ? '⇅ X+ ↓' : '⇅ X+ ↑';
      // Přepočet/redraw – ruční G-kód se nepřepisuje (G2/G3 v něm zůstávají
      // beze změny, viz [[feedback_flip-axis-gcode]]). Nové G2/G3 se promítnou
      // až po "🔄 Autorefresh drah".
      if (!S._cachedCalc) S._cachedCalc = calculate();
      draw();
      saveState();
      const msg = S.flipX
        ? 'Osa X otočena – X+ dolů (ruční kód – G2/G3 nepřepisuji)'
        : 'Osa X – X+ nahoru';
      showToast(msg);
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
      // Cyklus: off → fixtures (čelisti + koník) → range (rozsah obrábění) → both (vše) → off
      const next = { off: 'fixtures', fixtures: 'range', range: 'both', both: 'off' };
      S.showZLimits = next[S.showZLimits] || 'fixtures';
      // Při prvním zapnutí (= přepnutí do viditelného stavu): pokud nejsou
      // hodnoty, automaticky podle kontury.
      if (S.showZLimits !== 'off') {
        const allNull = S.zLimits.chuck === null && S.zLimits.tail === null
          && S.zLimits.rangeStart === null && S.zLimits.rangeEnd === null;
        if (allNull) {
          const absPts = resolvePointsToAbsolute(S.contourPoints);
          if (absPts.length > 0) {
            let minZ = Infinity, maxZ = -Infinity;
            absPts.forEach(p => { if (p.zAbs < minZ) minZ = p.zAbs; if (p.zAbs > maxZ) maxZ = p.zAbs; });
            const span = Math.max(10, maxZ - minZ);
            S.zLimits.chuck = Math.round((minZ - span * 0.15) * 100) / 100;
            S.zLimits.tail = Math.round((maxZ + span * 0.15) * 100) / 100;
            S.zLimits.rangeStart = Math.round((minZ + span * 0.2) * 100) / 100;
            S.zLimits.rangeEnd = Math.round((maxZ - span * 0.2) * 100) / 100;
          } else {
            S.zLimits = { chuck: -110, tail: 10, rangeStart: -90, rangeEnd: -10 };
          }
        }
      }
      const cfg = ZLIM_CFG[S.showZLimits] || ZLIM_CFG.off;
      btn.classList.toggle('cam-sim-active', cfg.active);
      btn.textContent = cfg.icon;
      // Pokud byly chuck/tail auto-populated, dráhy se nově ořežou →
      // recalc. Při off taky, aby zmizel "Z-limity ořízly dráhy" warning.
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
      if (S.rectSelecting) {
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
  root.querySelector('[data-code="show-sidebar"]').addEventListener('click', () => {
    sidebar.classList.add('cam-sim-sidebar-overlay');
    sidebar.style.display = 'flex';
    renderTab(); draw();
  });
  root.querySelector('[data-act="hide-sidebar"]').addEventListener('click', () => {
    sidebar.style.display = 'none';
    sidebar.classList.remove('cam-sim-sidebar-overlay');
    draw();
  });

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
    // Ignoruj „ghost" myší události, které prohlížeč generuje po dotyku
    // (skutečné dotykové akce jdou přes _camDispatchMouse = _camDispatching).
    if (!S._camDispatching && S._camGhostUntil && Date.now() < S._camGhostUntil) return;
    // Klik na plovoucí tlačítka ✓/✗ trasování – neinterpretovat jako bod kontury
    if (e.target.closest('.cam-sim-trace-confirm, .cam-sim-trace-cancel')) return;
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
      const vS = S.flipX ? 1 : -1;
      const prms = S.params || {};
      let wx, wz;
      if (prms.machineStructure === 'carousel') {
        wx = (sx - S.view.panX) / S.view.scale;
        wz = vS * (sy - S.view.panY) / S.view.scale;
      } else {
        wz = (sx - S.view.panX) / S.view.scale;
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
          const isDia = S.params.mode === 'DIAMON';
          camAddMoveDialog({ x: +(isDia ? gn.x * 2 : gn.x).toFixed(3), z: +gn.z.toFixed(3), mode: S.params.mode, afterLabel: nm })
            .then(mv => {
              if (!mv) return;
              pushHistory();
              insertGMove(gn.lineIdx, { type: mv.type, x: isDia ? mv.x / 2 : mv.x, z: mv.z, cr: mv.cr });
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
    // Z-limity – mají přednost před ostatními body, lze tahat i bez odemčení.
    const zKey = getZLimitAt(e.clientX, e.clientY);
    if (zKey !== null) {
      pushHistory();
      S.draggedLimit = zKey; S.isDragging = true;
      lastMousePos = { x: e.clientX, y: e.clientY };
      return;
    }
    const stockIdx = getStockHandleAt(e.clientX, e.clientY);
    if (S.pointDragEnabled && stockIdx !== null) {
      pushHistory(); S.draggedPointId = stockIdx; S.isDragging = true; _draggingStock = true;
      lastMousePos = { x: e.clientX, y: e.clientY };
      return;
    }
    const pointIdx = getPointAt(e.clientX, e.clientY);
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
    if (S.pointDragEnabled && pointIdx !== null) { pushHistory(); S.draggedPointId = pointIdx; S.isDragging = true; }
    else { S.isDragging = true; }
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
        const cptHover = !hn && S.pointDragEnabled && getPointAt(e.clientX, e.clientY) !== null;
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
      const pointIdx = getPointAt(e.clientX, e.clientY);
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
      if (stockHover !== null) {
        canvas.style.cursor = 'move';
        if (S.hoverPointId !== stockHover || !S._hoverIsStock) { S.hoverPointId = stockHover; S._hoverIsStock = true; draw(); }
      } else {
        if (S._hoverIsStock) { S._hoverIsStock = false; S.hoverPointId = null; draw(); }
        if (S.pointDragEnabled && S.hoverPointId !== pointIdx) { S.hoverPointId = pointIdx; draw(); }
        canvas.style.cursor = (S.pointDragEnabled && pointIdx !== null) ? 'move' : 'crosshair';
      }
      return;
    }
    const dx = e.clientX - lastMousePos.x;
    const dy = e.clientY - lastMousePos.y;
    lastMousePos = { x: e.clientX, y: e.clientY };
    if (S.draggedLimit) {
      // Posun pouze v ose Z – pro soustruh dx, pro karusel vS*dy
      const vS = S.flipX ? 1 : -1;
      const dZ = S.params.machineStructure === 'carousel' ? (vS * dy / S.view.scale) : (dx / S.view.scale);
      const cur = parseFloat(S.zLimits[S.draggedLimit]) || 0;
      S.zLimits[S.draggedLimit] = Math.round((cur + dZ) * 100) / 100;
      scheduleFrame(draw);   // tažení z-limitu: sloučit překreslení do snímku
      return;
    }
    if (_draggingStock && S.draggedPointId !== null) {
      let rawDX, rawDZ;
      const vS = S.flipX ? 1 : -1;
      if (S.params.machineStructure === 'carousel') { rawDX = dx / S.view.scale; rawDZ = vS * dy / S.view.scale; }
      else { rawDZ = dx / S.view.scale; rawDX = vS * dy / S.view.scale; }
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
      const vS = S.flipX ? 1 : -1;
      if (S.params.machineStructure === 'carousel') {
        dX_unit = dx / S.view.scale; dZ_unit = vS * dy / S.view.scale;
      } else {
        dZ_unit = dx / S.view.scale; dX_unit = vS * dy / S.view.scale;
      }
      if (S.params.mode === 'DIAMON') dX_unit *= 2;
      const list = S.editMode === 'contour' ? S.contourPoints : S.stockPoints;

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
    } else {
      S.view.panX += dx; S.view.panY += dy;
      scheduleFrame(draw);   // posun pohledu: sloučit překreslení do snímku
    }
  });

  const handleMouseUp = () => {
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
          const vS = S.flipX ? 1 : -1;
          const _toScreen = (x, z) => {
            if (prms.machineStructure === 'carousel') return { x: S.view.panX + x * S.view.scale, y: S.view.panY + vS * z * S.view.scale };
            return { x: S.view.panX + z * S.view.scale, y: S.view.panY + vS * x * S.view.scale };
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
    if (S.isDragging && (S.draggedPointId !== null || _draggingStock)) {
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
    S.isDragging = false; S.draggedPointId = null; _draggingStock = false; S.draggedLimit = null;
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
        const vS = S.flipX ? 1 : -1;
        if (S.params.machineStructure === 'carousel') { rawDX = dx / S.view.scale; rawDZ = vS * dy / S.view.scale; }
        else { rawDZ = dx / S.view.scale; rawDX = vS * dy / S.view.scale; }
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
        const vS = S.flipX ? 1 : -1;
        if (S.params.machineStructure === 'carousel') {
          dX_unit = dx / S.view.scale; dZ_unit = vS * dy / S.view.scale;
        } else {
          dZ_unit = dx / S.view.scale; dX_unit = vS * dy / S.view.scale;
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
      let minZ = Infinity, maxD = 0;
      absPts.forEach(p => {
        const x = S.params.mode === 'DIAMON' ? p.xAbs : p.xAbs * 2;
        if (Math.abs(x) > maxD) maxD = Math.abs(x);
        if (p.zAbs < minZ) minZ = p.zAbs;
      });
      const margin = parseFloat(S.params.stockMargin) || 5;
      S.params.stockDiameter = Math.ceil(maxD + margin * 2);
      S.params.stockLength = Math.ceil(Math.abs(minZ) + margin);
      S.params.stockFace = 2.0;
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
