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
function arcSteps(r, scale) { return Math.max(8, Math.min(64, Math.ceil(r * scale * 0.5))); }

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
// Efektivní úhel zanoření/nájezdu (°). V auto režimu se dopočítá z tvaru
// destičky = úhel spodní hrany vůči ose posuvu (podélně: natočení;
// čelně: natočení + ε − 90). Kulatá destička hrany nemá — auto je 45°.
function getEffectivePlungeAngle(prms) {
  const clampA = (v) => Math.max(0.5, Math.min(89, v));
  if (!prms.entryAngleAuto) return clampA(parseFloat(prms.entryAngle) || 30);
  if (prms.toolShape !== 'polygon') return 45;
  const rot = parseFloat(prms.toolAngle) || 0;
  const tip = parseFloat(prms.toolTipAngle) || 90;
  const a = prms.roughingStrategy === 'face' ? Math.abs(rot + tip - 90) : Math.abs(rot);
  return clampA(a);
}
// Test jednoho segmentu kontury proti úhlovému rozsahu destičky —
// true = destička by při sledování segmentu špičkou zajela bočním
// ostřím do materiálu (normála segmentu mimo pokrytý rozsah).
function segInterferesWithTool(seg, clearance) {
  const { bisector, halfRange } = clearance;
  if (seg.type === 'line') {
    const n = getNormal(seg.p1, seg.p2);
    if (n.x === 0 && n.z === 0) return false;
    return Math.abs(normalizeAngle(vecAngle(n.x, n.z) - bisector)) > halfRange;
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
      if (Math.abs(normalizeAngle(normAngle - bisector)) > halfRange) return true;
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
function isAngleBetween(target, start, end, isG2) {
  if (isNaN(target) || isNaN(start) || isNaN(end)) return false;
  const pi2 = 2 * Math.PI;
  const t = ((target % pi2) + pi2) % pi2;
  const s = ((start % pi2) + pi2) % pi2;
  const e = ((end % pi2) + pi2) % pi2;
  if (isG2) { if (s >= e) return t <= s && t >= e; return t <= s || t >= e; }
  else { if (e >= s) return t >= s && t <= e; return t >= s || t <= e; }
}
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
function intersectVerticalLineSegment(zLine, p1, p2) {
  if (!p1 || !p2) return null;
  const minZ = Math.min(p1.z, p2.z), maxZ = Math.max(p1.z, p2.z);
  if (zLine < minZ || zLine > maxZ) return null;
  if (Math.abs(p2.z - p1.z) < 1e-6) return null;
  const t = (zLine - p1.z) / (p2.z - p1.z);
  return p1.x + t * (p2.x - p1.x);
}
function intersectVerticalLineArc(zLine, center, radius) {
  if (!center) return [];
  const term = radius * radius - Math.pow(zLine - center.z, 2);
  if (term < 0) return [];
  const sqrtTerm = Math.sqrt(term);
  return [center.x - sqrtTerm, center.x + sqrtTerm];
}
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
              path.push({ x: arc.cx + Math.sin(a) * arc.r, z: arc.cz + Math.cos(a) * arc.r, type, originalLineIdx: idx });
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
export function openCamSimulator(initialContour) {
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
      <button data-act="lock" title="Zamknout/odemknout body" class="cam-sim-active">🔒</button>
      <button data-act="fit" title="Centrovat">🎯</button>
      <button data-act="flipx" title="Otočit svislou osu – nástroj zespodu (prohodí G2/G3)">⇅ X+ ↑</button>
      <button data-act="simpath" title="Cyklus: 👁 vše → ✂️ jen řezné (bez rychloposuvů) → 🙈 nic" class="cam-sim-active">👁</button>
      <button data-act="zlimits" title="Z-limity: čelisti, koník + rozsah obrábění (klikněte a táhněte čáry)">📏</button>
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
        <button data-act="speed-down" title="Zpomalit">◀</button>
        <span class="cam-sim-speed-label">1×</span>
        <button data-act="speed-up" title="Zrychlit">▶</button>
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
      doFinishing: true, roughingStrategy: 'longitudinal',
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
    // Trasování profilu (klikací nástroj) — body, segmenty a náhled výsledné kontury
    profileTraceMode: false,
    _tracePoints: [],   // [{x, z}] absolutní world souřadnice (rádius, Z)
    _traceSegs: [],     // [{type:'G1'|'G2'|'G3', dist, r, cx, cz}] – segment od _tracePoints[i] do [i+1]
    _previewContour: null, // číslovaná náhledová kontura čekající na potvrzení
    _refContour: null,      // záloha původní S.contourPoints po dobu náhledu
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
      if (p.contourPoints && p.contourPoints.length > 0) S.contourPoints = p.contourPoints;
      if (p.stockPoints && p.stockPoints.length > 0) S.stockPoints = p.stockPoints;
      if (p.manualGCode) S.manualGCode = p.manualGCode;
      if (p.flipX !== undefined) S.flipX = !!p.flipX;
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
  function pushHistory() {
    S.past.push({
      contour: JSON.parse(JSON.stringify(S.contourPoints)),
      stock: JSON.parse(JSON.stringify(S.stockPoints))
    });
    S.future = [];
    updateUndoRedoBtns();
  }
  function undo() {
    if (S.past.length === 0) return;
    const prev = S.past.pop();
    S.future.unshift({
      contour: JSON.parse(JSON.stringify(S.contourPoints)),
      stock: JSON.parse(JSON.stringify(S.stockPoints))
    });
    S.contourPoints = prev.contour;
    S.stockPoints = prev.stock;
    updateUndoRedoBtns();
    fullUpdate();
  }
  function redo() {
    if (S.future.length === 0) return;
    const next = S.future.shift();
    S.past.push({
      contour: JSON.parse(JSON.stringify(S.contourPoints)),
      stock: JSON.parse(JSON.stringify(S.stockPoints))
    });
    S.contourPoints = next.contour;
    S.stockPoints = next.stock;
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
        flipX: S.flipX, guideLines: S.guideLines,
        zLimits: S.zLimits, showZLimits: S.showZLimits, showSimPath: S.showSimPath
      }));
    } catch (_) { /* quota */ }
  }

  // ── CALCULATED DATA (memoized) ──
  function calculate() {
    const prms = S.params;
    const absContour = resolvePointsToAbsolute(S.contourPoints);
    const absStock = resolvePointsToAbsolute(S.stockPoints);
    const worldPoints = absContour.map(p => ({ ...p, xReal: prms.mode === 'DIAMON' ? p.xAbs / 2 : p.xAbs, zReal: p.zAbs }));
    const stockWorldPoints = absStock.map(p => ({ ...p, xReal: prms.mode === 'DIAMON' ? p.xAbs / 2 : p.xAbs, zReal: p.zAbs }));

    const tipR = parseFloat(prms.toolRadius) || 0;
    const allowanceX = parseFloat(prms.allowanceX) || 0;
    const allowanceZ = parseFloat(prms.allowanceZ) || 0;
    const totalOffset = tipR + Math.max(allowanceX, allowanceZ);
    const retractDist = parseFloat(prms.retractDistance) || 2.0;

    let contourSegments = [];
    let rawOffsets = [];
    let finishOffsetPath = [];
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

    // ── Automatické mezní čáry hran destičky („kontura hotová") ──
    // Pro každou souvislou skupinu interferenčních segmentů se spočítá
    // přímka hrany destičky, která se regionu jen dotkne: dojezd = čelní
    // hrana (natočení + ε), zanoření = spodní hrana (natočení). Od bodu
    // dotyku se protáhne podél hrany k průsečíkům s konturou — ukazuje,
    // kudy destička region bezpečně obejde (tečna jako z nástroje Úhel).
    const interferenceGuides = [];
    if (clearance && interferenceSegments.length > 0) {
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
          // Dolní konec: průsečík s konturou; bez něj skončit u spodku regionu.
          let down = camRayIntersection(best.x, best.z, -sb, -cb, excludeIdx, localCalc);
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
    }


    let incompleteMachiningCount = 0;
    // 1. raw offsets — per-axis pro lines (alX v X, alZ v Z), uniformní pro arcs
    for (let i = 0; i < contourSegments.length; i++) {
      const seg = contourSegments[i];
      let offSeg = null;
      if (seg.type === 'line') {
        const n = getNormal(seg.p1, seg.p2);
        const tx = n.x * (tipR + allowanceX);
        const tz = n.z * (tipR + allowanceZ);
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
        if (respectFin && segInterferesWithTool(seg, clearance)) {
          finSkipped++; pendingBreak = true; continue;
        }
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
            finSeg = { type: 'arc', cx: seg.cx, cz: seg.cz, r: rNew, dir: seg.dir, refP1: seg.p1, refP2: seg.p2, startAngle, endAngle };
          }
        }
        if (finSeg) {
          if (seg.chainBreak || pendingBreak) finSeg.chainBreak = true;
          pendingBreak = false;
          finRaw.push(finSeg);
        }
      }
      finishOffsetPath = trimAndRemoveLoops(finRaw);
      if (finSkipped > 0)
        foundErrors.push({ type: 'warning', msg: `Hlídání destičky: dokončování vynechá ${finSkipped} úsek(ů), kam destička nedosáhne (přejezd G0).` });
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

    if (prms.roughingStrategy === 'face') {
      // ── ČELNÍ HRUBOVÁNÍ (od povrchu polotovaru −X k ose / kontuře) ──
      // Pro každou hloubku Z od (stockFace − step) po minZPart:
      //   1. xStart = stockOuter + rapidClr (= rapid-bezpečná X nad povrchem)
      //   2. xEnd = max X průsečíku offsetu se svislicí v currentZ (= místo,
      //      kde kontura blokuje řez jdoucí −X k ose). Pokud žádný blok,
      //      řezáme až k X=0.
      //
      // Nájezd: G0 X za polotovar → G0 Z na hloubku → G1 −X řez → G1 retract 45°.
      // 45° retract po čelním řezu jede do už odřezané zóny (slab nad
      // currentZ byl plně odebrán předchozími pasy + aktuálním), takže
      // bezpečné.
      const rapidClrFC = Math.max(0.05, parseFloat(prms.rapidClearance) || 1);
      // Helper: max X polotovaru (skutečná pravá hrana materiálu) na zadané Z.
      // Pro cylinder = konstantní sRad. Pro casting = max X všech průsečíků
      // svislice v Z s outline polotovaru → per-Z, takže rapid nemusí jezdit
      // až na globální sRad+clearance, ale jen těsně nad lokální povrch.
      const castingOuterAtZ = (z) => {
        if (prms.stockMode !== 'casting' || stockPathSegments.length === 0) return sRad;
        let maxX = -9999;
        stockPathSegments.forEach(seg => {
          if (seg.isDegenerate) return;
          if (seg.type === 'line') {
            const x = intersectVerticalLineSegment(z, seg.p1, seg.p2);
            if (x !== null && x > maxX) maxX = x;
          } else if (seg.type === 'arc') {
            const res = intersectVerticalLineArc(z, { x: seg.cx, z: seg.cz }, seg.r);
            res.forEach(x => {
              const angle = Math.atan2(x - seg.cx, z - seg.cz);
              if (isAngleBetween(angle, seg.startAngle, seg.endAngle, seg.dir === 'G2') && x > maxX) maxX = x;
            });
          }
        });
        return maxX > -9999 ? maxX : sRad;
      };
      const minZPart = worldPoints.length > 0 ? Math.min(...worldPoints.map(p => p.z)) : -1000;
      // Start na pravé hraně polotovaru: pro cylinder = stockFace, pro casting =
      // max(stockWorldPoints.zReal). Bez tohoto fixu casting s default stockFace=2
      // ihned vyletí ze smyčky (currentZ-step <= minZPart=0) a žádný pas se neemituje.
      let faceStartZ = stockFace;
      if (prms.stockMode === 'casting' && stockWorldPoints.length > 0) {
        faceStartZ = -9999;
        stockWorldPoints.forEach(p => { if (p.zReal > faceStartZ) faceStartZ = p.zReal; });
      }
      // Z-rozsah kontury (pro detekci „za konturou" – tam stop, jinak by
      // se cuty pouštěly i do chuck-stub oblasti).
      let maxOZ = -9999, minOZ = 9999;
      offsetPath.forEach(p => {
        if (p.isDegenerate) return;
        const z1 = p.type === 'line' ? p.p1.z : p.cz + p.r;
        const z2 = p.type === 'line' ? p.p2.z : p.cz - p.r;
        maxOZ = Math.max(maxOZ, z1, z2);
        minOZ = Math.min(minOZ, z1, z2);
      });
      let currentZ = faceStartZ;
      let safe = 0;
      // Iterace: ukončíme, jakmile by další step šel pod minZPart (= nejlevější
      // Z bodu kontury). Tím se vyhneme řezu za konturou do držákové oblasti.
      while ((currentZ - step) >= minZPart - 0.01 && safe < 500) {
        currentZ -= step; safe++;
        let xsEnd = [];
        offsetPath.forEach(os => {
          if (os.isDegenerate) return;
          if (os.type === 'line') {
            const x = intersectVerticalLineSegment(currentZ, os.p1, os.p2);
            if (x !== null) xsEnd.push(x);
          } else if (os.type === 'arc') {
            const res = intersectVerticalLineArc(currentZ, { x: os.cx, z: os.cz }, os.r);
            res.forEach(x => {
              const angle = Math.atan2(x - os.cx, currentZ - os.cz);
              if (isAngleBetween(angle, os.startAngle, os.endAngle, os.dir === 'G2')) xsEnd.push(x);
            });
          }
        });
        xsEnd.sort((a, b) => a - b);
        let xEnd;
        let xEndBlocked = false;
        if (xsEnd.length > 0) {
          // Kontura na tomto Z protíná svislici → vyber NEJVĚTŠÍ X (= outermost
          // kontura, ten první narazíme jdoucí −X od povrchu). Filtruj jen
          // průsečíky uvnitř polotovaru.
          const validXs = xsEnd.filter(x => x < sRad + 1);
          if (validXs.length === 0) continue; // všechny mimo polotovar
          xEnd = validXs[validXs.length - 1];
          xEndBlocked = true;
        } else {
          // Bez průsečíku:
          //   currentZ > maxOZ → jsme za pravým koncem kontury (face-stub
          //     nad konturou), řezáme až k ose
          //   currentZ < minOZ → jsme za levým koncem kontury (chuck-stub),
          //     skip (nesmíme řezat do držáku)
          //   uvnitř → unusual, skip pro safety
          if (currentZ > maxOZ + 0.01) xEnd = 0;
          else continue;
        }
        // Per-Z casting outer (pro casting). Pro cylinder = sRad konstantní.
        const xSurface = castingOuterAtZ(currentZ);
        const xStartLocal = xSurface + rapidClrFC;
        if (xEnd >= xStartLocal - 0.01) continue; // řez nulové délky
        passes.push({ type: 'face', z: currentZ, xStart: xStartLocal, xSurface, xEnd, blocked: xEndBlocked });
        if (currentZ < -200) break;
      }

      // ── Hlídání geometrie destičky (čelně) ──
      // Spodní hrana destičky se naklání pod vodorovnou o |natočení|
      // (při čelním hrubování bývá natočení záporné) → průchody končící
      // u kontury se zastavují postupně výš, jinak by hrana vpravo od
      // špičky zajela do už obrobeného osazení (vzniká schodiště).
      if (prms.respectInsertGeometry && prms.toolShape === 'polygon') {
        const phiFaceDeg = -(parseFloat(prms.toolAngle) || 0);
        if (phiFaceDeg > 0.01) {
          const tanPhiF = Math.tan(Math.min(89.5, phiFaceDeg) * Math.PI / 180);
          const faceWalls = passes.filter(p => p.type === 'face' && p.blocked).map(p => ({ z: p.z, xEnd: p.xEnd }));
          let faceAdjusted = 0;
          for (let pi = passes.length - 1; pi >= 0; pi--) {
            const p = passes[pi];
            if (p.type !== 'face') continue;
            let xE = p.xEnd;
            for (const w of faceWalls) {
              if (w.z <= p.z + 1e-6) continue;
              const cand = w.xEnd + (w.z - p.z) * tanPhiF;
              if (cand > xE) xE = cand;
            }
            if (xE > p.xEnd + 0.01) {
              faceAdjusted++;
              if (xE >= p.xStart - 0.05) { passes.splice(pi, 1); continue; }
              p.xEnd = xE;
            }
          }
          if (faceAdjusted > 0)
            foundErrors.push({ type: 'warning', msg: `Hlídání destičky: ${faceAdjusted} čelních průchodů zkráceno, aby spodní hrana destičky nezajela do kontury.` });
        }
      }
    } else {
      // ── PODÉLNÉ HRUBOVÁNÍ (RIGHT → LEFT, standard soustružení) ─────
      // Pro každou hloubku currentX od (maxStockX − step) po minPartX:
      //   1. Najdi všechny Z-hranice na této hloubce (krajní stocku +
      //      průsečíky offsetu s horizontálou v currentX).
      //   2. Mezi každými dvěma sousedními hranicemi vzorkuj midpoint:
      //        — Je nad námi polotovar?  (stockOuter(zMid) >= currentX)
      //        — Je pod námi offset?      (offset(zMid) <= currentX nebo není)
      //      Když obojí → cut zone v tomto Z-intervalu.
      //   3. Sloučit sousední intervaly. Pas má zStart > zEnd
      //      (zStart = pravá hrana = max Z, typicky stockFace;
      //       zEnd = levá hrana = kde kontura zvedá offset nad currentX,
      //              nebo levý okraj polotovaru).
      //
      // Nájezd je rampovaný (G1 pod prms.entryAngle), ne svislý G0 plunge.
      // Pro monotonní tvar (kužel + rovný úsek) vyjde 1 průjezd na hloubku.

      const cylStockZ = (parseFloat(prms.stockLength) || 100) * -1;

      // X-bounds offsetu
      let minPartX = 9999, maxPartX = -9999;
      offsetPath.forEach(os => {
        if (os.isDegenerate) return;
        if (os.type === 'line') {
          minPartX = Math.min(minPartX, os.p1.x, os.p2.x);
          maxPartX = Math.max(maxPartX, os.p1.x, os.p2.x);
        } else {
          minPartX = Math.min(minPartX, os.cx - os.r);
          maxPartX = Math.max(maxPartX, os.cx + os.r);
        }
      });

      // Vrch polotovaru v X
      let maxStockX = sRad;
      if (prms.stockMode === 'casting' && stockWorldPoints.length > 0) {
        maxStockX = -9999;
        stockWorldPoints.forEach(p => { if (p.xReal > maxStockX) maxStockX = p.xReal; });
      }

      // Horizontální průsečíky segmentů (s kolinarním fallbackem)
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

      // Z-rozsah polotovaru na zadané hloubce X.
      // Pro casting: rightmost/leftmost intersection řetězce + otevřené konce.
      // Pro válec: [cylStockZ, stockFace].
      // Vrací { zMax, zMin, all } nebo null pokud na této X polotovar není.
      const stockZRangeAt = (X) => {
        if (prms.stockMode === 'casting') {
          const zs = hIntersect(stockPathSegments, X, false);
          const startP = stockWorldPoints[0];
          const endP = stockWorldPoints[stockWorldPoints.length - 1];
          if (startP && startP.xReal > X + 0.01) zs.push(startP.zReal);
          if (endP && endP.xReal > X + 0.01) zs.push(endP.zReal);
          if (zs.length < 2) return null;
          zs.sort((a, b) => b - a);
          return { zMax: zs[0], zMin: zs[zs.length - 1], all: zs };
        }
        if (X > sRad + 0.01) return null;
        return { zMax: stockFace, zMin: cylStockZ, all: [stockFace, cylStockZ] };
      };

      // Posloupnost hloubek: maxStockX−step, …, ≥ minPartX, vždy s vynuceným
      // posledním průjezdem PŘESNĚ na minPartX (nedořezaný hřebínek).
      const depths = [];
      for (let d = maxStockX - step; d > minPartX + 0.005; d -= step) depths.push(d);
      if (depths.length === 0 || Math.abs(depths[depths.length - 1] - minPartX) > 0.005) {
        depths.push(minPartX);
      }

      const effPlungeDegL = getEffectivePlungeAngle(prms);
      const effPlungeTanL = Math.tan(effPlungeDegL * Math.PI / 180);
      let plungeSkipped = 0;
      // Průchody předchozí hloubky — vjezd rampou smí začít jen nad
      // floor-em, který předchozí hloubka skutečně dořezala (napravo od
      // něj zůstává neodřezaný klín po její rampě / schod stěny).
      let prevDepthPasses = [];
      let prevDepthX = maxStockX;

      for (const currentX of depths) {
        const sz = stockZRangeAt(currentX);
        if (!sz) continue;
        const thisDepthPasses = [];

        // Skenem zprava doleva najdeme všechny volné intervaly (offset
        // nepřekračuje currentX). První interval (od pravé hrany
        // polotovaru) = klasický otevřený vjezd. Každý další interval je
        // kapsa/zápich — tam se smí jet jen se zapnutým zanořováním:
        // vjezd rampou pod úhlem zanoření z floor-u předchozí hloubky.
        //
        // Stock outline NEPROFILUJE řez (i kdyby měl casting přerušení /
        // dolíky uprostřed) — fyzický nástroj projíždí mezerou ve vzduchu
        // bez problému. Stopuje JEN kontura.
        const dzScan = 0.2;
        const blockedAt = (z) => {
          const offX = offsetXAt(z);
          return offX !== null && offX > currentX + 0.01;
        };
        const intervals = [];
        let zScan = sz.zMax;
        let inRun = !blockedAt(zScan);
        const firstOpen = inRun;
        let runStartZ = zScan;
        while (zScan > sz.zMin + dzScan) {
          zScan -= dzScan;
          const blocked = blockedAt(zScan);
          if (inRun && blocked) {
            // o krok zpět = poslední bezpečné Z
            intervals.push({ zStart: runStartZ, zEnd: zScan + dzScan, blocked: true });
            inRun = false;
          } else if (!inRun && !blocked) {
            runStartZ = zScan;
            inRun = true;
          }
        }
        if (inRun) intervals.push({ zStart: runStartZ, zEnd: sz.zMin, blocked: false });

        intervals.forEach((iv, idx) => {
          // Vynech triviálně krátké průchody (nic neuříznou).
          if (iv.zStart - iv.zEnd < dzScan) return;
          if (idx === 0 && firstOpen) {
            // Otevřený vjezd zprava přes hranu polotovaru.
            const pass = { type: 'long', x: currentX, zStart: iv.zStart, zEnd: iv.zEnd, blocked: iv.blocked };
            passes.push(pass); thisDepthPasses.push(pass);
            return;
          }
          // Kapsa — vjezd jen rampou (zanořování).
          if (!prms.plungeRoughing) return;
          const x0 = Math.min(prevDepthX, maxStockX);
          if (x0 - currentX < 0.01) return;
          // Vjezd rampou nesmí začít na přirozené pozici pravé stěny —
          // předchozí hloubka tam kvůli své rampě floor nedořezala
          // (zbylý klín) a sjezd shora by zajel do materiálu. Začátek
          // rampy klampneme na zStart překrývajícího průchodu předchozí
          // hloubky. Nad hladinou polotovaru (x0 = vršek) klamp netřeba.
          let z0 = iv.zStart;
          if (x0 < maxStockX - 0.01) {
            const above = prevDepthPasses.filter(p => p.zEnd <= iv.zStart + 0.01 && p.zStart >= iv.zEnd - 0.01);
            if (above.length === 0) { plungeSkipped++; return; }
            z0 = Math.min(z0, Math.max(...above.map(p => p.zStart)));
          }
          const dzRamp = (x0 - currentX) / effPlungeTanL;
          if (z0 - dzRamp - iv.zEnd < dzScan) { plungeSkipped++; return; }
          const pass = {
            type: 'long', x: currentX,
            zStart: z0 - dzRamp, // floor začíná až pod koncem rampy
            zEnd: iv.zEnd, blocked: iv.blocked,
            ramp: { x0, z0 }
          };
          passes.push(pass); thisDepthPasses.push(pass);
        });
        prevDepthPasses = thisDepthPasses;
        prevDepthX = currentX;
      }
      if (plungeSkipped > 0)
        foundErrors.push({ type: 'warning', msg: `POZNÁMKA: Zanořování — ${plungeSkipped} kapes je příliš úzkých pro rampu pod ${effPlungeDegL.toFixed(1)}°.` });

      // ── Hlídání geometrie destičky (podélně) ──
      // Čelní hrana destičky se nad špičkou naklání o φ = natočení + ε − 90
      // za svislici → průchody končící u zdi (levé stěny) se zastavují
      // postupně dál vpravo, takže boční ostří nezajede do kontury
      // (zbytek tvoří schodiště pod úhlem hrany). Spodní hrana (natočení)
      // totéž zrcadlově u pravých stěn kapes při zanořování.
      if (prms.respectInsertGeometry && prms.toolShape === 'polygon') {
        const rotDeg = parseFloat(prms.toolAngle) || 0;
        const tipDeg = parseFloat(prms.toolTipAngle) || 90;
        let adjusted = 0;
        const phiDeg = rotDeg + tipDeg - 90;
        if (phiDeg > 0.01) {
          // Dojezd se počítá přesně proti offsetové dráze: rohy (koncové
          // body segmentů) klasicky přes tanφ, oblouky navíc TEČNOU čelní
          // hrany na kružnici — jinak by hrana mezi vzorky zajela do
          // vyduté/vypouklé stěny oblouku.
          const phiRad = Math.min(89.5, phiDeg) * Math.PI / 180;
          const tanPhi = Math.tan(phiRad);
          const betaRad = phiRad + Math.PI / 2;          // směr čelní hrany (od +Z)
          const eX = Math.sin(betaRad), eZ = Math.cos(betaRad); // hrana míří nahoru-doleva
          for (let pi = passes.length - 1; pi >= 0; pi--) {
            const p = passes[pi];
            if (p.type !== 'long') continue;
            let zE = p.zEnd;
            for (const seg of offsetPath) {
              if (seg.isDegenerate) continue;
              if (seg.type === 'line') {
                for (const q of [seg.p1, seg.p2]) {
                  if (q.x <= p.x + 0.05 || q.z > p.zStart + 0.01) continue;
                  const cand = q.z + (q.x - p.x) * tanPhi;
                  if (cand > zE) zE = cand;
                }
              } else {
                const a1 = { x: seg.cx + Math.sin(seg.startAngle) * seg.r, z: seg.cz + Math.cos(seg.startAngle) * seg.r };
                const a2 = { x: seg.cx + Math.sin(seg.endAngle) * seg.r, z: seg.cz + Math.cos(seg.endAngle) * seg.r };
                for (const q of [a1, a2]) {
                  if (q.x <= p.x + 0.05 || q.z > p.zStart + 0.01) continue;
                  const cand = q.z + (q.x - p.x) * tanPhi;
                  if (cand > zE) zE = cand;
                }
                // Tečna hrany na oblouk: přímka hrany špičky (p.x, zT) se
                // směrem e musí mít od středu vzdálenost r. Dotyk musí
                // ležet nad špičkou, vlevo od startu pasu a v rozsahu oblouku.
                for (const sgn of [1, -1]) {
                  const zT = seg.cz - ((seg.cx - p.x) * eZ - sgn * seg.r) / eX;
                  const t = (seg.cx - p.x) * eX + (seg.cz - zT) * eZ; // projekce středu na hranu
                  if (t <= 0.05) continue;
                  const Px = p.x + eX * t, Pz = zT + eZ * t;
                  if (Px <= p.x + 0.05 || Pz > p.zStart + 0.01) continue;
                  const ang = Math.atan2(Px - seg.cx, Pz - seg.cz);
                  if (!isAngleBetween(ang, seg.startAngle, seg.endAngle, seg.dir === 'G2')) continue;
                  if (zT > zE) zE = zT;
                }
              }
            }
            if (zE > p.zEnd + 0.01) {
              adjusted++;
              if (zE >= p.zStart - 0.05) { passes.splice(pi, 1); continue; }
              p.zEnd = zE;
            }
          }
        }
        // Pravé stěny kapes: spodní hrana destičky stoupá od špičky pod
        // úhlem natočení — hlubší zanořovací průchody musí začínat o
        // dx/tan(natočení) víc vlevo, jinak by hrana nad špičkou zajela
        // do pravé stěny kapsy.
        if (rotDeg > 0.01) {
          const tanRot = Math.tan(Math.min(89.5, rotDeg) * Math.PI / 180);
          const rightWalls = passes.filter(p => p.type === 'long' && p.ramp).map(p => ({ x: p.x, z: p.ramp.z0 }));
          for (let pi = passes.length - 1; pi >= 0; pi--) {
            const p = passes[pi];
            if (p.type !== 'long' || !p.ramp) continue;
            let z0 = p.ramp.z0;
            for (const w of rightWalls) {
              if (w.x <= p.x + 1e-6) continue;
              const cand = w.z - (w.x - p.x) / tanRot;
              if (cand < z0) z0 = cand;
            }
            if (z0 < p.ramp.z0 - 0.01) {
              adjusted++;
              const dzRamp = p.ramp.z0 - p.zStart;
              p.ramp.z0 = z0;
              p.zStart = z0 - dzRamp;
              if (p.zStart - p.zEnd < 0.05) passes.splice(pi, 1);
            }
          }
        }
        if (adjusted > 0)
          foundErrors.push({ type: 'warning', msg: `Hlídání destičky: ${adjusted} hrubovacích průchodů zkráceno, aby boční ostří nezajelo do kontury.` });
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
          if (zS - zE < EPS) { droppedCount++; continue; }
          // Zanořovací průchod nelze zkrátit zprava (rampa by se rozbila)
          // — pokud limity stahují zStart nebo vršek rampy, celý vynech.
          if (pass.ramp && (zS !== origZS || (tailLim !== null && pass.ramp.z0 > tailLim))) { droppedCount++; continue; }
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
    return { worldPoints, stockWorldPoints, offsetPath, finishOffsetPath, stockPathSegments, passes, simPath, retractDist, totalPathLength, estimatedTimeSeconds, interferenceSegments, interferenceGuides, stockTopX };
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
      addN(`G75 Z0${note('', 'Nájezd do ref. bodu')}`); addN('G75 X0');
      addN(`LIMS=2000${note('', 'Limit otáček')}`);
      addN(`G96 S${prms.speed} ${prms.machineType}${note('', 'Konst. řezná rychlost')}`);
      addN(`${prms.mode}${note('', prms.mode === 'DIAMON' ? 'Programování průměru' : 'Programování poloměru')}`);
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

    addCmt(`--- HRUBOVANI (${prms.roughingStrategy === 'face' ? 'CELNI' : 'PODELNE'}) ---`);
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
    const rapidBlockers = [...(calc.offsetPath || []), ...(calc.finishOffsetPath || [])].filter(s => !s.isDegenerate);
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
      addCmt(`Průchod ${i + 1}${pass.ramp ? ' (zanoření do kapsy)' : ''}`);
      if (pass.type === 'long' && pass.ramp) {
        // Zanořovací průchod do kapsy/zápichu:
        //   G0 X<nad polotovar>        ; rapid do plného vzduchu
        //   G0 Z<z0>                   ; nad pravý okraj kapsy
        //   G0 X<x0+vůle>              ; sjezd k floor-u předchozí hloubky
        //   G1 X<x0>                   ; dotek floor-u posuvem
        //   G1 X<hloubka> Z<zStart>    ; rampa pod úhlem zanoření
        //   G1 Z<zEnd> F<f>            ; podélný řez po dně kapsy
        //   G1 X+odskok Z+odskok       ; retract pod 45°
        // Vždy přes vršek polotovaru — stav rozpracovaného obrobku mezi
        // kapsami nelze z finálního offsetu spolehlivě poznat.
        const xTopRamp = Math.max((calc.stockTopX || 0) + rapidClrGc, cur.x);
        const zRetractVal = clipZGc(pass.zEnd + rDist);
        if (xTopRamp > cur.x + 1e-6) { simCounter += 1; addN(`G0 X${xDia(xTopRamp)}`, simCounter); }
        setPos(xTopRamp, cur.z);
        simCounter += 1; addN(`G0 Z${pass.ramp.z0.toFixed(3)}`, simCounter); setPos(cur.x, pass.ramp.z0);
        simCounter += 1; addN(`G0 X${xDia(pass.ramp.x0 + rapidClrGc)}`, simCounter); setPos(pass.ramp.x0 + rapidClrGc, cur.z);
        simCounter += 1; addN(`G1 X${xDia(pass.ramp.x0)} F${prms.feed}`, simCounter); setPos(pass.ramp.x0, cur.z);
        simCounter += 1; addN(`G1 X${xDia(pass.x)} Z${pass.zStart.toFixed(3)}${note('', `Rampa ${entryAngleDegGc.toFixed(1)}°`)}`, simCounter); setPos(pass.x, pass.zStart);
        simCounter += 1; addN(`G1 Z${pass.zEnd.toFixed(3)} F${prms.feed}`, simCounter); setPos(pass.x, pass.zEnd);
        simCounter += 1; addN(`G1 X${xDia(pass.x + rDist)} Z${zRetractVal.toFixed(3)}`, simCounter); setPos(pass.x + rDist, zRetractVal);
      } else if (pass.type === 'long') {
        // Standardní podélné hrubování (vpravo → vlevo):
        //   G0 Z<zApproach>            ; rapid za polotovar (clearance)
        //   G0 X<hloubka>              ; rapid k průměru
        //   G1 Z<pass.zStart>          ; sjezd přes clearance na hranu polotovaru
        //                                už pracovním posuvem (bezpečný dotek)
        //   G1 Z<zEnd> F<f>            ; podélný řez −Z přes celou špónu
        //   G1 X<hloubka+odskok> Z<zEnd+odskok>  ; retract pod 45°
        const zApproachVal = clipZGc(pass.zStart + rapidClrGc);
        const zRetractVal = clipZGc(pass.zEnd + rDist);
        // Přejezd v Z na nájezdový bod s kontrolou kolize (po zanoření do
        // kapsy může nástroj stát hluboko — přímý přejezd by řízl stěnu).
        safeRapidTo(cur.x, zApproachVal);
        safeRapidTo(pass.x, zApproachVal);
        simCounter += 1; addN(`G1 Z${pass.zStart.toFixed(3)} F${prms.feed}`, simCounter); setPos(pass.x, pass.zStart);
        simCounter += 1; addN(`G1 Z${pass.zEnd.toFixed(3)} F${prms.feed}`, simCounter); setPos(pass.x, pass.zEnd);
        simCounter += 1; addN(`G1 X${xDia(pass.x + rDist)} Z${zRetractVal.toFixed(3)}`, simCounter); setPos(pass.x + rDist, zRetractVal);
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
        const zRetractVal = clipZGc(pass.z + rDist);
        // Přejezdy s kontrolou kolize: nejdřív v X za polotovar, pak v Z.
        safeRapidTo(pass.xStart, cur.z);
        safeRapidTo(pass.xStart, pass.z);
        simCounter += 1; addN(`G1 X${xDia(pass.xSurface)} F${prms.feed}`, simCounter); setPos(pass.xSurface, pass.z);
        simCounter += 1; addN(`G1 X${xDia(pass.xEnd)} F${prms.feed}`, simCounter); setPos(pass.xEnd, pass.z);
        simCounter += 1; addN(`G1 X${xDia(pass.xEnd + rDist)} Z${zRetractVal.toFixed(3)}`, simCounter); setPos(pass.xEnd + rDist, zRetractVal);
      }
    });

    // Návrat na bezpečnou polohu s kontrolou kolize (po zanoření do kapsy
    // by přímá diagonála mohla proříznout stěnu/konturu).
    safeRapidTo((parseFloat(prms.safeX) || 0) / (prms.mode === 'DIAMON' ? 2 : 1), parseFloat(prms.safeZ) || 0);

    const firstGcFinSeg = calc.finishOffsetPath.find(s => !s.isDegenerate);
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
      const sZ_approachVal = clipZGc(sZ + finishRampDz);
      // Nájezd na přibližovací bod s kontrolou kolize — přímá diagonála
      // z bezpečné polohy může u členité kontury proříznout offset.
      safeRapidTo(sX + finishApproachDx, sZ_approachVal);
      simCounter += 1; addN(`G1 X${sX_out} Z${sZ.toFixed(3)} F${prms.feed}`, simCounter); setPos(sX, sZ);
      calc.finishOffsetPath.forEach(seg => {
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
          const p1 = toScreen(g.x1, g.z1), p2 = toScreen(g.x2, g.z2);
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.setLineDash([8, 4]); ctx.stroke(); ctx.setLineDash([]);
          // offset dráhy středu plátku (korekce R) na stranu vzduchu (+X)
          if (tipROff > 0) {
            let n = getNormal({ x: g.x1, z: g.z1 }, { x: g.x2, z: g.z2 });
            if (n.x < 0 || (Math.abs(n.x) < 1e-9 && n.z < 0)) n = { x: -n.x, z: -n.z };
            const o1 = toScreen(g.x1 + n.x * tipROff, g.z1 + n.z * tipROff);
            const o2 = toScreen(g.x2 + n.x * tipROff, g.z2 + n.z * tipROff);
            ctx.beginPath(); ctx.moveTo(o1.x, o1.y); ctx.lineTo(o2.x, o2.y);
            ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.stroke(); ctx.setLineDash([]);
          }
          // koncové body — viditelné a klikatelné ("+" vloží bod kontury)
          ctx.fillStyle = col;
          for (const q of [p1, p2]) { ctx.beginPath(); ctx.arc(q.x, q.y, 3.5, 0, Math.PI * 2); ctx.fill(); }
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

    // finish path — v 🙈 stavu skryjeme všechny drahy
    if (S.showSimPath !== 'none' && prms.doFinishing && calc.finishOffsetPath.length > 0) {
      ctx.beginPath();
      calc.finishOffsetPath.forEach((seg, i) => {
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
      ctx.strokeStyle = C.finish; ctx.lineWidth = 2; ctx.stroke();
    }

    // roughing passes — v 🙈 stavu skryjeme všechny drahy
    if (S.showSimPath !== 'none') {
      ctx.beginPath();
      calc.passes.forEach(pass => {
        if (pass.type === 'long') {
          if (pass.ramp) {
            // rampa zanoření z floor-u předchozí hloubky
            const pr = toScreen(pass.ramp.x0, pass.ramp.z0);
            const pe = toScreen(pass.x, pass.zStart);
            ctx.moveTo(pr.x, pr.y); ctx.lineTo(pe.x, pe.y);
          }
          const p1 = toScreen(pass.x, pass.zStart), p2 = toScreen(pass.x, pass.zEnd);
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        } else {
          const p1 = toScreen(pass.xStart, pass.z), p2 = toScreen(pass.xEnd, pass.z);
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        }
      });
      ctx.strokeStyle = C.pass; ctx.lineWidth = 1.5; ctx.stroke();
    }

    // sim path (dashed) — 'all' = vše, 'cut' = jen G1/G2/G3, 'none' = nic
    if (S.showSimPath !== 'none' && calc.simPath.length > 0) {
      ctx.beginPath();
      for (let i = 0; i < calc.simPath.length - 1; i++) {
        const p1 = calc.simPath[i], p2 = calc.simPath[i + 1];
        if (S.showSimPath === 'cut' && p2.type === 'G0') continue;
        const s = toScreen(p1.x, p1.z), e = toScreen(p2.x, p2.z);
        if (Math.abs(s.x - e.x) > 0.1 || Math.abs(s.y - e.y) > 0.1) {
          ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y);
        }
      }
      ctx.strokeStyle = '#f38ba8'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 6]); ctx.stroke(); ctx.setLineDash([]);
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

  // Nejbližší průsečík paprsku (sx,sz) + t·(dirX,dirZ) se segmenty kontury
  // a polotovaru (reálné souřadnice, X = rádius). exclude = {idx, isStock}
  // segment, který se vynechá (např. tečnovaný oblouk). calcOverride
  // dovoluje předat čerstvé worldPoints (volání zevnitř calculate()).
  // Vrací {x,z} | null.
  function camRayIntersection(sx, sz, dirX, dirZ, exclude, calcOverride) {
    const calc = calcOverride || S._cachedCalc; if (!calc) return null;
    let best = null, bestT = Infinity;
    // exclude: buď {idx,isStock} (jeden segment), nebo pole indexů do
    // calc.worldPoints (vynechá víc segmentů kontury najednou).
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

  // Všechny pomocné čáry: ruční (S.guideLines) + automatické mezní
  // čáry hran destičky z posledního výpočtu.
  function getAllGuideLines() {
    return [...(S.guideLines || []), ...((S._cachedCalc && S._cachedCalc.interferenceGuides) || [])];
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
    const hlIdx = getActiveCodeLineIdx();
    const lineEls = codeBackdrop.querySelectorAll('.cam-sim-code-bd-line');
    lineEls.forEach((el, i) => el.classList.toggle('cam-sim-code-active', i === hlIdx));
    if (hlIdx != null && lineEls[hlIdx]) {
      const lineEl = lineEls[hlIdx];
      const top = lineEl.offsetTop, bottom = top + lineEl.offsetHeight;
      if (top < manualTa.scrollTop || bottom > manualTa.scrollTop + manualTa.clientHeight) {
        manualTa.scrollTop = Math.max(0, top - manualTa.clientHeight / 2);
        codeBackdrop.scrollTop = manualTa.scrollTop;
      }
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
      html += `<div class="cam-sim-info-box">Potáhněte body na canvasu pro změnu rozměrů válce. Odemkněte body tlačítkem 🔒.</div>
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
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label>Hloubka (ap)</label><input type="number" step="0.5" data-p="depthOfCut" value="${prms.depthOfCut}"></div>
      <div class="cam-sim-field"><label>Posuv (F)</label><input type="number" step="0.05" data-p="feed" value="${prms.feed}"></div>
    </div>
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label>Rychlost (Vc)</label><input type="number" step="10" data-p="speed" value="${prms.speed}"></div>
      <div class="cam-sim-field"><label>Odskok</label><input type="number" step="0.5" data-p="retractDistance" value="${prms.retractDistance}"></div>
    </div>`;
    html += `<div class="cam-sim-section-title">Nástroj <button data-act="tool-library" class="cam-sim-btn cam-sim-btn-gray" style="width:auto;display:inline-flex;padding:2px 8px;font-size:11px;margin-left:8px">🧰 Knihovna</button></div>
    <div class="cam-sim-row">
      <div class="cam-sim-field"><label>Rádius (R)</label><input type="number" step="0.1" data-p="toolRadius" value="${prms.toolRadius}"></div>
      <div class="cam-sim-field"><label>Přídavek X</label><input type="number" step="0.1" data-p="allowanceX" value="${prms.allowanceX}"></div>
      <div class="cam-sim-field"><label>Přídavek Z</label><input type="number" step="0.1" data-p="allowanceZ" value="${prms.allowanceZ}"></div>
    </div>
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
    getAllGuideLines().forEach(g => {
      for (const q of [{ x: g.x1, z: g.z1 }, { x: g.x2, z: g.z2 }]) {
        allPts.push({ xAbs: prms.mode === 'DIAMON' ? q.x * 2 : q.x, zAbs: q.z });
      }
    });
    let best = null, bestD = Infinity;
    for (const p of allPts) {
      const d = Math.hypot(p.xAbs - wx, p.zAbs - wz);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best && bestD < 20 / S.view.scale * (prms.mode === 'DIAMON' ? 2 : 1)) { wx = best.xAbs; wz = best.zAbs; }
    return { wx, wz };
  }

  /** Přidá další bod do trasování; pokud existuje víc možností segmentu, zobrazí volbu. */
  async function _addTracePoint(wx, wz) {
    const p2 = { x: wx, z: wz };
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

    S._tracePoints.push(p2);
    S._traceSegs.push(seg);
    _showTraceButtons();
    draw();
  }

  /** Zobrazí/skryje tlačítka pro potvrzení/zrušení náhledu profilu. */
  function _showPreviewButtons(show) {
    const a = toolbar.querySelector('[data-act="profile-apply"]');
    const c = toolbar.querySelector('[data-act="profile-cancel"]');
    if (a) a.style.display = show ? '' : 'none';
    if (c) c.style.display = show ? '' : 'none';
  }

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
      pts.push({ id: id++, type: seg.type, x: p.x, z: p.z, r: seg.r || 0, mode: 'ABS' });
    }
    S._refContour = S.contourPoints;
    S._previewContour = pts;
    _exitProfileTraceMode();
    _showPreviewButtons(true);
    draw();
    showToast('Náhled profilu připraven – potvrďte (✅) nebo zrušte (❌)');
  }

  /** Nahradí konturu trasovaným profilem. */
  function _applyPreviewContour() {
    if (!S._previewContour) return;
    pushHistory();
    S.contourPoints = S._previewContour;
    S._previewContour = null;
    S._refContour = null;
    _showPreviewButtons(false);
    S._cachedCalc = calculate();
    S.manualGCode = generateAutoGCode(S._cachedCalc).map(l => l.text).join('\n');
    fullUpdate();
    showToast('Profil použit jako nová kontura ✓');
  }

  /** Zahodí náhled trasovaného profilu, kontura zůstává nezměněná. */
  function _cancelPreviewContour() {
    S._previewContour = null;
    S._refContour = null;
    _showPreviewButtons(false);
    draw();
    showToast('Náhled profilu zrušen');
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
  }

  // ── EVENT WIRING ──

  // toolbar
  toolbar.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'addpt') {
      S.addPointMode = !S.addPointMode;
      if (S.addPointMode) {
        S.delPointMode = false; toolbar.querySelector('[data-act="delpt"]').classList.remove('cam-sim-active');
        showToast('Klikněte na bod (vložit segment) nebo na oblouk (tečna pod úhlem)');
      }
      btn.classList.toggle('cam-sim-active', S.addPointMode);
      canvas.style.cursor = S.addPointMode ? 'copy' : 'crosshair';
    } else if (act === 'delpt') {
      S.delPointMode = !S.delPointMode;
      if (S.delPointMode) { S.addPointMode = false; toolbar.querySelector('[data-act="addpt"]').classList.remove('cam-sim-active'); }
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
      _cancelPreviewContour();
    } else if (act === 'lock') {
      S.pointDragEnabled = !S.pointDragEnabled;
      btn.textContent = S.pointDragEnabled ? '🔓' : '🔒';
      btn.classList.toggle('cam-sim-active', !S.pointDragEnabled);
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
        S.simRunning = true; playBtn.textContent = '⏸'; startSimLoop();
      }
    } else if (act === 'stop') {
      S.simRunning = false; S.simProgress = 0; S.simBlockTarget = null;
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
    if (!S._cachedCalc) S._cachedCalc = calculate();
    S.manualGCode = generateAutoGCode(S._cachedCalc).map(l => l.text).join('\n');
    fullUpdate();
    showToast('Dráhy přegenerovány z kontury a parametrů');
  });
  root.querySelector('[data-code="editor"]').addEventListener('click', handleSendToEditor);
  root.querySelector('[data-code="to-canvas"]').addEventListener('click', handleSendToCanvas);
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
  manualTa.addEventListener('input', () => {
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
        E = camRayIntersection(T.x, T.z, dirX, dirZ, { idx: found.idx, isStock: found.isStock });
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
          const hit = camRayIntersection(fx, fromAbs.zAbs, Math.sin(rad), Math.cos(rad), null);
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
    const newScale = Math.max(0.2, Math.min(oldScale * (1 - Math.sign(e.deltaY) * 0.15), 50));
    S.view.panX = mx - (mx - S.view.panX) * (newScale / oldScale);
    S.view.panY = my - (my - S.view.panY) * (newScale / oldScale);
    S.view.scale = newScale;
    draw();
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
    // Klik na plovoucí tlačítka ✓/✗ trasování – neinterpretovat jako bod kontury
    if (e.target.closest('.cam-sim-trace-confirm, .cam-sim-trace-cancel')) return;
    // Trasování profilu – klik přidá další bod
    if (S.profileTraceMode) {
      const { wx, wz } = _traceWorldFromClient(e.clientX, e.clientY);
      _addTracePoint(wx, wz);
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
    if (!S.isDragging) {
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
      draw();
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
      S._cachedCalc = calculate();
      S.generatedCode = generateGCode(S._cachedCalc);
      draw();
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

      S._cachedCalc = calculate();
      S.generatedCode = generateGCode(S._cachedCalc);
      draw();
    } else {
      S.view.panX += dx; S.view.panY += dy;
      draw();
    }
  });

  const handleMouseUp = () => {
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
      saveState(); renderCodeArea(); renderTab();
    }
    if (S.draggedLimit) {
      // Po přetažení čelisti/koníka přepočítat dráhy (chuck/tail ořezává cuts).
      const needRecalc = S.draggedLimit === 'chuck' || S.draggedLimit === 'tail';
      saveState(); renderTab();
      if (needRecalc) fullUpdate();
    }
    S.isDragging = false; S.draggedPointId = null; _draggingStock = false; S.draggedLimit = null;
    draw();
  };
  canvasWrap.addEventListener('mouseup', handleMouseUp);
  canvasWrap.addEventListener('mouseleave', handleMouseUp);

  // ── TOUCH ──
  canvasWrap.addEventListener('touchstart', e => {
    if (e.target.closest('.cam-sim-trace-confirm, .cam-sim-trace-cancel')) return;
    if (e.touches.length === 1) {
      // Trasování profilu – tap přidá další bod
      if (S.profileTraceMode) {
        const t = e.touches[0];
        const { wx, wz } = _traceWorldFromClient(t.clientX, t.clientY);
        _addTracePoint(wx, wz);
        return;
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

      const t = e.touches[0];
      const stockIdx = getStockHandleAt(t.clientX, t.clientY);
      if (S.pointDragEnabled && stockIdx !== null) {
        pushHistory(); S.draggedPointId = stockIdx; S.isDragging = true; _draggingStock = true;
        lastMousePos = { x: t.clientX, y: t.clientY };
        return;
      }
      const pointIdx = getPointAt(t.clientX, t.clientY);
      if (S.addPointMode) {
        const exitAddMode = () => { S.addPointMode = false; toolbar.querySelector('[data-act="addpt"]').classList.remove('cam-sim-active'); canvas.style.cursor = 'crosshair'; };
        // Tap na koncový bod pomocné čáry → bod přesně na segmentu.
        const gp = getGuideEndpointAt(t.clientX, t.clientY);
        if (gp && insertPointOnSegmentAt(gp.x, gp.z)) {
          exitAddMode();
          showToast('Bod vložen na konturu v místě pomocné čáry ✓');
          return;
        }
        const found = getAnyPointAt(t.clientX, t.clientY);
        if (found) { handleInsertAfter(found.idx, found.isStock); exitAddMode(); return; }
        // Tap na oblouk → tečná úsečka pod úhlem (CAD nástroj „Úhel").
        const arcFound = getArcSegmentAt(t.clientX, t.clientY);
        if (arcFound) { openTangentLineModal(arcFound); exitAddMode(); }
        return;
      }
      if (S.delPointMode) {
        const found = getAnyPointAt(t.clientX, t.clientY);
        if (found) {
          const list = found.isStock ? S.stockPoints : S.contourPoints;
          if (list.length > 1) { pushHistory(); list.splice(found.idx, 1); fullUpdate(); }
          else showToast('Nelze odebrat poslední bod.');
          return;
        }
        // Tap mimo body: smazat ruční pomocnou čáru pod prstem.
        const gIdx = getUserGuideAt(t.clientX, t.clientY);
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
      lastMousePos = { x: t.clientX, y: t.clientY };
    } else if (e.touches.length === 2) {
      lastPinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    }
  }, { passive: true });

  canvasWrap.addEventListener('touchmove', e => {
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
        S._cachedCalc = calculate();
        S.generatedCode = generateGCode(S._cachedCalc);
        draw();
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

        S._cachedCalc = calculate();
        S.generatedCode = generateGCode(S._cachedCalc);
        draw();
      } else {
        S.view.panX += dx; S.view.panY += dy;
        draw();
      }
    }
    if (e.touches.length === 2 && lastPinchDist) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const zoomFactor = dist / lastPinchDist;
      const rect = canvas.getBoundingClientRect();
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
      const oldScale = S.view.scale;
      const newScale = Math.max(0.2, Math.min(oldScale * zoomFactor, 50));
      S.view.panX = mx - (mx - S.view.panX) * (newScale / oldScale);
      S.view.panY = my - (my - S.view.panY) * (newScale / oldScale);
      S.view.scale = newScale;
      lastPinchDist = dist;
      draw();
    }
  }, { passive: true });

  canvasWrap.addEventListener('touchend', () => {
    // Rect selection completion on touch
    if (S.rectSelecting && S.rectStart && S.rectEnd) {
      handleMouseUp();
      lastPinchDist = null;
      return;
    }
    S.snapLines = [];
    if (S.isDragging && (S.draggedPointId !== null || _draggingStock)) {
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
