// Styly panelu „Pohled na čelo" (poháněné nástroje). Catppuccin Mocha jako
// zbytek CAM simulátoru (camSimulatorStyles.js). Vkládá se jednou.
export const LIVE_CSS = `
.cam-live-row { flex: 1; min-height: 0; display: flex; flex-direction: row; }
.cam-live-row > .cam-sim-canvas-wrap { flex: 1; min-width: 0; min-height: 0; }
.cam-live-pane {
  flex: 0 0 40%; min-width: 0; min-height: 0; overflow: hidden; display: flex; flex-direction: column;
  border-left: 2px solid #45475a; background: #181825; position: relative;
}
.cam-live-pane[hidden] { display: none; }
.cam-live-head {
  display: flex; align-items: center; gap: 6px; padding: 4px 6px;
  background: #181825; border-bottom: 1px solid #313244; flex-wrap: wrap;
}
.cam-live-title { font-weight: bold; color: #cdd6f4; font-size: 12px; margin-right: auto; }
.cam-live-head button, .cam-live-ed button {
  background: #313244; color: #cdd6f4; border: 1px solid #45475a; border-radius: 6px;
  padding: 3px 8px; font-size: 12px; cursor: pointer;
}
.cam-live-head button:hover, .cam-live-ed button:hover { background: #45475a; }
.cam-live-head button.cam-sim-active { background: #89b4fa; color: #1e1e2e; }
.cam-live-cv { flex: 1 1 0; min-height: 120px; position: relative; overflow: hidden; }
/* Plátno absolutně: jinak by jeho výška (nastavená z ResizeObserveru) zpětně
   zvětšovala panel a panel zase plátno (na výšku rostlo do tisíců px). */
.cam-live-cv canvas { display: block; position: absolute; left: 0; top: 0; }
.cam-live-ed {
  flex: 0 0 auto; max-height: 55%; overflow: auto; padding: 6px 8px; border-top: 1px solid #313244;
  color: #cdd6f4; font-size: 12px;
}
.cam-live-ed[hidden] { display: none; }
.cam-live-ed h4 { margin: 6px 0 4px; font-size: 12px; color: #bac2de; }
.cam-live-btns { display: flex; gap: 6px; flex-wrap: wrap; margin: 4px 0; }
.cam-live-status { font-size: 11px; color: #a6adc8; margin: 2px 0 6px; }
.cam-live-status.warn { color: #f9e2af; }
.cam-live-status.ok { color: #a6e3a1; }
.cam-live-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 4px 8px; }
.cam-live-f { display: flex; flex-direction: column; gap: 1px; font-size: 11px; color: #a6adc8; }
.cam-live-f input, .cam-live-f select, .cam-live-f textarea {
  background: #1e1e2e; color: #cdd6f4; border: 1px solid #45475a; border-radius: 4px;
  padding: 3px 5px; font-size: 12px; min-width: 0;
}
.cam-live-f textarea { font-family: monospace; min-height: 52px; resize: vertical; }
.cam-live-f.wide { grid-column: 1 / -1; }
.cam-live-card { border: 1px solid #45475a; border-radius: 6px; margin: 6px 0; background: #1e1e2e; }
.cam-live-card.sel { border-color: #89b4fa; }
.cam-live-card-h { display: flex; align-items: center; gap: 6px; padding: 4px 6px; cursor: pointer; }
.cam-live-card-h .t { flex: 1; min-width: 0; }
.cam-live-card-h .t b { color: #cdd6f4; }
.cam-live-card-h .t small { display: block; color: #a6adc8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cam-live-card-h button { padding: 1px 6px; }
.cam-live-card-b { padding: 4px 6px 8px; border-top: 1px solid #313244; }
.cam-live-prob { color: #f38ba8; font-size: 11px; margin-top: 4px; }
.cam-live-note { color: #a6adc8; font-size: 11px; margin: 4px 0; }
.cam-live-dot { width: 10px; height: 10px; border-radius: 50%; flex: 0 0 auto; }
@media (min-aspect-ratio: 1/1) {
  .cam-live-on .cam-sim-toolbar { right: calc(40% + 10px); }
}
@media (max-aspect-ratio: 1/1) {
  .cam-live-row { flex-direction: column; }
  .cam-live-pane { flex: 0 0 48%; border-left: 0; border-top: 2px solid #45475a; }
  .cam-live-ed { max-height: 50%; }
}
`;
