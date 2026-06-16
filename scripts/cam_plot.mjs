// Generátor SVG náhledu rohu kontury z přesných čísel harnessu.
// Z vodorovně (roste vpravo), X svisle (roste nahoru). Píše do scripts/_cam_plot.svg
import { writeFileSync } from 'fs';

const Zmin = 43, Xmax = 9, S = 50, ML = 60, TM = 30;
const sx = z => ML + (z - Zmin) * S;
const sy = x => TM + (Xmax - x) * S;
const P = (x, z) => `${sx(z).toFixed(1)},${sy(x).toFixed(1)}`; // pozn. arg pořadí (x,z)

// Data (X,Z) z harnessu, oříznuté na okno Z>=43, X<=9
const contour = [[0,48],[4,48],[5,47],[5.843,43]];
const finish  = [[0,50],[4.828,50],[6.835,47.994],[7.887,43]];
const rough   = [[0,50.2],[4.911,50.2],[7.018,48.093],[8.091,43]];
const guide   = [[0,49.072],[4,48]];

const poly = pts => 'M' + pts.map(([x,z]) => P(x,z)).join(' L');

const zTicks = [44,46,48,50];
const xTicks = [0,2,4,6,8];
const grid = [
  ...zTicks.map(z => `<line x1="${sx(z)}" y1="${TM}" x2="${sx(z)}" y2="${sy(0)}" class="grid"/><text x="${sx(z)}" y="${sy(0)+18}" class="ax" text-anchor="middle">Z${z}</text>`),
  ...xTicks.map(x => `<line x1="${ML}" y1="${sy(x)}" x2="${sx(51)}" y2="${sy(x)}" class="grid"/><text x="${ML-8}" y="${sy(x)+4}" class="ax" text-anchor="end">X${x}</text>`),
].join('\n');

const svg = `<svg viewBox="0 0 660 620" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="t d">
<title id="t">Roh kontury: dokončovací a hrubovací offset</title>
<desc id="d">Detail horního rohu. Obě offsetové dráhy začínají na ose X0 a sledují čelo, zkosení a kužel. Kolečko označuje roh hrubovacího offsetu X4.911 Z50.2.</desc>
<style>
  .grid{stroke:var(--border,#313244);stroke-width:1;opacity:.5}
  .ax{fill:var(--text-muted,#9399b2);font:11px ui-monospace,monospace}
  .lbl{fill:var(--text,#cdd6f4);font:12px ui-sans-serif,system-ui}
  .lblsm{fill:var(--text-muted,#9399b2);font:11px ui-monospace,monospace}
  .contour{stroke:var(--text,#cdd6f4);stroke-width:2.5;fill:none}
  .finish{stroke:#a6e3a1;stroke-width:2.5;fill:none}
  .rough{stroke:#89b4fa;stroke-width:2.5;fill:none}
  .guide{stroke:#94e2d5;stroke-width:1.5;fill:none;stroke-dasharray:8 4}
  .axisline{stroke:var(--text-muted,#9399b2);stroke-width:1;stroke-dasharray:10 4 2 4;opacity:.7}
  .mk{fill:none;stroke:#f38ba8;stroke-width:2.5}
</style>
<rect x="0" y="0" width="660" height="620" fill="transparent"/>
${grid}
<line x1="${ML}" y1="${sy(0)}" x2="${sx(51)}" y2="${sy(0)}" class="axisline"/>
<text x="${sx(44.2)}" y="${sy(0)-6}" class="lblsm">osa (X0)</text>

<path class="guide" d="${poly(guide)}"/>
<path class="contour" d="${poly(contour)}"/>
<path class="finish" d="${poly(finish)}"/>
<path class="rough" d="${poly(rough)}"/>

<!-- kolečko = roh hrubovacího offsetu, kam má dojet -->
<circle class="mk" cx="${sx(50.2)}" cy="${sy(4.911)}" r="8"/>
<line class="mk" x1="${sx(50.2)+8}" y1="${sy(4.911)}" x2="${sx(50.2)+70}" y2="${sy(4.911)-30}"/>
<text x="${sx(50.2)+74}" y="${sy(4.911)-34}" class="lbl">roh hrubování</text>
<text x="${sx(50.2)+74}" y="${sy(4.911)-19}" class="lblsm">X4.911 Z50.2</text>

<!-- start na ose -->
<circle cx="${sx(50)}" cy="${sy(0)}" r="3.5" fill="#a6e3a1"/>
<circle cx="${sx(50.2)}" cy="${sy(0)}" r="3.5" fill="#89b4fa"/>
<text x="${sx(50.2)+10}" y="${sy(0)-4}" class="lblsm">start obou drah na X0</text>

<!-- legenda -->
<g transform="translate(70,524)">
  <line x1="0" y1="0" x2="26" y2="0" class="contour"/><text x="32" y="4" class="lbl">kontura (díl)</text>
  <line x1="0" y1="20" x2="26" y2="20" class="finish"/><text x="32" y="24" class="lbl">dokončovací offset (R=2) — X4.828 Z50.0</text>
  <line x1="0" y1="40" x2="26" y2="40" class="rough"/><text x="32" y="44" class="lbl">hrubovací offset (R+2.2) — X4.911 Z50.2</text>
  <line x1="0" y1="60" x2="26" y2="60" class="guide"/><text x="32" y="64" class="lbl">auto konstrukční čára (po opravě skrytá při vyp.)</text>
</g>
</svg>`;

writeFileSync(new URL('./_cam_plot.svg', import.meta.url), svg);
console.log('wrote scripts/_cam_plot.svg', svg.length, 'bytes');
