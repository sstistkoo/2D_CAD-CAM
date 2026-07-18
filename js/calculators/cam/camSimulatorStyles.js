// ── CSS injection ──────────────────────────────────────────────
let cssInjected = false;
export function injectCSS() {
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
