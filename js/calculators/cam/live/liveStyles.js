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
/* Lišta řezu (liveCutBar.js): Z, posuvník, strana pohledu. */
.cam-live-bar {
  display: flex; align-items: center; gap: 6px; padding: 3px 6px;
  border-bottom: 1px solid #313244; background: #181825; font-size: 12px; color: #a6adc8;
}
.cam-live-bar[hidden] { display: none; }
.cam-live-bar label { display: flex; align-items: center; gap: 3px; flex: 0 0 auto; }
.cam-live-bar input[type=text] {
  width: 62px; background: #1e1e2e; color: #cdd6f4; border: 1px solid #45475a;
  border-radius: 4px; padding: 2px 5px; font-size: 12px;
}
.cam-live-bar input[type=range] { flex: 1 1 auto; min-width: 60px; accent-color: #fab387; margin: 0; }
.cam-live-bar button {
  flex: 0 0 auto; white-space: nowrap; background: #313244; color: #cdd6f4; border: 1px solid #45475a;
  border-radius: 6px; padding: 3px 8px; font-size: 12px; cursor: pointer;
}
.cam-live-bar button[data-cut="start"] { background: #fab387; color: #1e1e2e; border-color: #fab387; font-weight: bold; }
/* Tělo: náhled + editor operací. S editorem dostane náhled 40 % a formulář
   zbytek; široký panel (cam-live-wide) je dá vedle sebe. */
.cam-live-body { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
.cam-live-body.ed-on .cam-live-cv { flex: 0 0 40%; min-height: 70px; }
.cam-live-wide .cam-live-body.ed-on { flex-direction: row; }
.cam-live-wide .cam-live-body.ed-on .cam-live-cv { flex: 1 1 0; min-height: 0; }
.cam-live-wide .cam-live-body.ed-on .cam-live-ed {
  flex: 0 0 min(480px, 50%); border-top: 0; border-left: 1px solid #313244;
}
/* ⤢ Maximalizovaný pohled přes celé okno simulátoru (i přes G-kód). */
.cam-live-max .cam-live-row > .cam-live-pane {
  position: absolute; inset: 0; z-index: 15; border: 0; padding-top: 0;
}
.cam-live-cv { flex: 1 1 0; min-height: 120px; position: relative; overflow: hidden; }
/* Plátno absolutně: jinak by jeho výška (nastavená z ResizeObserveru) zpětně
   zvětšovala panel a panel zase plátno (na výšku rostlo do tisíců px). */
.cam-live-cv canvas { display: block; position: absolute; left: 0; top: 0; touch-action: none; cursor: grab; }
.cam-live-cv canvas:active { cursor: grabbing; }
/* 🎯 jen když je pohled přiblížený / posunutý. */
.cam-live-fit {
  position: absolute; top: 6px; right: 6px; z-index: 2; background: #313244; color: #cdd6f4;
  border: 1px solid #45475a; border-radius: 6px; padding: 2px 6px; font-size: 14px; cursor: pointer;
}
.cam-live-fit[hidden] { display: none; }
.cam-live-ed {
  flex: 1 1 0; min-height: 0; overflow: auto; padding: 6px 8px; border-top: 1px solid #313244;
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
.cam-live-chk { font-size: 11px; margin-top: 6px; line-height: 1.4; }
.cam-live-chk b { color: #bac2de; font-weight: 600; }
.cam-live-chk .error { color: #f38ba8; }
.cam-live-chk .warn { color: #f9e2af; }
/* Tečka nálezu kontroly proti dílu u karty: červená = chyba, žlutá = upozornění. */
.cam-live-flag { width: 10px; height: 10px; border-radius: 50%; flex: 0 0 auto; box-shadow: 0 0 0 2px rgba(243,139,168,0.25); }
.cam-live-flag.error { background: #f38ba8; }
.cam-live-flag.warn { background: #f9e2af; box-shadow: 0 0 0 2px rgba(249,226,175,0.25); }
.cam-live-note { color: #a6adc8; font-size: 11px; margin: 4px 0; }
.cam-live-ol { margin: 4px 0 4px 16px; padding: 0; color: #bac2de; font-size: 11px; line-height: 1.45; }
.cam-live-ol code { background: #313244; border-radius: 3px; padding: 0 3px; }
.cam-live-note summary { cursor: pointer; }
.cam-live-dot { width: 10px; height: 10px; border-radius: 50%; flex: 0 0 auto; }
@media (min-aspect-ratio: 1/1) {
  .cam-live-on .cam-sim-toolbar { right: calc(40% + 10px); }
}
@media (max-aspect-ratio: 1/1) {
  .cam-live-row { flex-direction: column; }
  .cam-live-pane { flex: 0 0 48%; border-left: 0; border-top: 2px solid #45475a; }
}
/* Úzký displej: hlavička v jedné řadě (◎ čelo ▶ 🛠 Z↔ ⤢ ✕). */
@media (max-width: 480px) { .cam-live-long { display: none; } }
/* ◉ Jen čelo: řez skrytý, pohled přes celou plochu (padding-top pod lištu
   plátna dopočítá livePanel.js). */
.cam-live-solo .cam-live-row > .cam-sim-canvas-wrap { display: none; }
.cam-live-solo .cam-live-row > .cam-live-pane { flex: 1 1 auto; border: 0; }
.cam-live-on.cam-live-solo .cam-sim-toolbar { right: 8px; }
.cam-sim-toolbar button.cam-live-solo-btn { background: #cba6f7; color: #1e1e2e; }
/* Záložka Vrtání: díry mimo osu z výkresu (liveDrillUi.js). */
.cam-livedrill-h { font-weight: bold; color: #cdd6f4; font-size: 12px; margin: 4px 0 4px; }
.cam-livedrill-h small { font-weight: normal; color: #a6adc8; }
.cam-livedrill-pf { margin: -2px 0 6px 26px; }
.cam-livedrill-pf .cam-sim-row { margin: 2px 0; }
.cam-livedrill-h.axial { margin-top: 10px; padding-top: 6px; border-top: 1px solid #45475a; }
.cam-livedrill-row {
  display: flex; gap: 6px; align-items: flex-start; padding: 4px 6px; margin: 3px 0;
  border: 1px solid #45475a; border-radius: 6px; background: #1e1e2e; cursor: pointer; font-size: 12px; color: #cdd6f4;
}
.cam-livedrill-row input { margin-top: 2px; }
.cam-livedrill-row small { color: #a6adc8; }
.cam-livedrill-row small.t { color: #f9e2af; }
.cam-livedrill-row.off { opacity: 0.55; }
.cam-livedrill-btns { display: flex; gap: 6px; margin: 6px 0 4px; flex-wrap: wrap; }
.cam-livedrill-btns button { flex: 1 1 auto; font-size: 11px; padding: 5px 6px; }
.cam-livedrill-note { display: block; color: #a6adc8; font-size: 10.5px; line-height: 1.35; }
.cam-livedrill-src { display: flex; gap: 4px; margin: 2px 0 6px; }
.cam-livedrill-src button {
  flex: 1 1 0; background: #313244; color: #cdd6f4; border: 1px solid #45475a; border-radius: 6px;
  padding: 5px 6px; font-size: 11px; cursor: pointer;
}
.cam-livedrill-src button.on { background: #89b4fa; color: #1e1e2e; border-color: #89b4fa; }
.cam-livedrill-src button:disabled { opacity: 0.4; cursor: default; }
.cam-livedrill-nc { margin: 8px 0 4px; padding-top: 6px; border-top: 1px solid #45475a; font-size: 12px; color: #cdd6f4; }
.cam-livedrill-nc > summary { cursor: pointer; font-weight: bold; color: #cdd6f4; margin-bottom: 4px; }
.cam-livedrill-nc .cam-live-note { font-size: 10.5px; }
`;
