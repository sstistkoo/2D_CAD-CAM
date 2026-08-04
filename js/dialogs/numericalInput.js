// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Dialogy / Numerický vstup                        ║
// ╚══════════════════════════════════════════════════════════════╝

import { COLORS, LINE_WIDTH, PREVIEW_DASH } from '../constants.js';
import { state, showToast, fromIncToAbs, axisLabels, toDisplayCoords } from '../state.js';
import { addObject } from '../objects.js';
import { safeEvalMath, arcFromEndpointsRadius } from '../utils.js';
import { normalizeGcodeText } from '../gcodeNormalize.js';
import { wireExprInputs } from './mobileEdit.js';
import { showFilletChamferDialog } from './objectDialogs.js';
import { bridge } from '../bridge.js';
import { worldToScreen, screenAngle, screenCCW, fitViewToWorldBounds, autoCenterView } from '../canvas.js';

// ── Numerický vstup – dialog pro přesné zadání souřadnic ──
// Drátování spouštěcích tlačítek žije v js/ui.js (btnNumInput,
// desktopNumInput) a js/touch.js (mobileNumInput) – tenhle modul jen
// exportuje funkce. Dřív si tlačítka lovil sám na úrovni modulu, takže
// jakákoli změna jejich ID shodila celou appku už při importu.

// Stav pro chaining je uložen v state.numDialogChain

/**
 * Vykreslí živý náhled právě rozepsaného objektu (`state.numPreview.data`,
 * plněné z `readFormGeometry()` v `initNumericalTab`) na CAD plátno.
 * Volá se z `renderAll()` přes `bridge.renderNumPreview` (render.js
 * nesmí importovat dialogové moduly – viz CLAUDE.md o bridge).
 *
 * Registrace je module-level (na rozdíl od VK): funkce nemá žádný stav
 * vázaný na konkrétní otevření okna, čte jen `state.numPreview`, takže
 * ji netřeba při zavření okna odregistrovávat – bez viditelné záložky
 * je `visible` stejně false a tahle funkce se vůbec nezavolá.
 * @param {CanvasRenderingContext2D} c
 */
function renderNumPreviewOnCad(c) {
  const data = state.numPreview?.data;
  if (!data) return;
  c.save();
  c.strokeStyle = COLORS.preview;
  c.fillStyle = COLORS.preview;
  c.lineWidth = LINE_WIDTH;
  c.setLineDash(PREVIEW_DASH);

  const dot = (wx, wy, radius = 3.5) => {
    const [sx, sy] = worldToScreen(wx, wy);
    const dash = c.getLineDash();
    c.setLineDash([]);
    c.beginPath();
    c.arc(sx, sy, radius, 0, Math.PI * 2);
    c.fill();
    c.setLineDash(dash);
  };

  switch (data.type) {
    case 'point':
      dot(data.x, data.y, 4);
      break;
    case 'line':
    case 'constr': {
      const [sx1, sy1] = worldToScreen(data.x1, data.y1);
      const [sx2, sy2] = worldToScreen(data.x2, data.y2);
      c.beginPath();
      c.moveTo(sx1, sy1);
      c.lineTo(sx2, sy2);
      c.stroke();
      dot(data.x1, data.y1);
      dot(data.x2, data.y2);
      break;
    }
    case 'circle': {
      const [sx, sy] = worldToScreen(data.cx, data.cy);
      c.beginPath();
      c.arc(sx, sy, data.r * state.zoom, 0, Math.PI * 2);
      c.stroke();
      dot(data.cx, data.cy, 2.5);
      break;
    }
    case 'arc': {
      const [sx, sy] = worldToScreen(data.cx, data.cy);
      c.beginPath();
      c.arc(sx, sy, data.r * state.zoom, screenAngle(data.sa), screenAngle(data.ea), screenCCW(data.ccw));
      c.stroke();
      break;
    }
    case 'rect': {
      const [sx1, sy1] = worldToScreen(data.x1, data.y1);
      const [sx2, sy2] = worldToScreen(data.x2, data.y2);
      c.beginPath();
      c.rect(Math.min(sx1, sx2), Math.min(sy1, sy2), Math.abs(sx2 - sx1), Math.abs(sy2 - sy1));
      c.stroke();
      break;
    }
    case 'polyline': {
      const pts = data.draft ? [...data.verts, data.draft] : data.verts;
      if (pts.length >= 2) {
        c.beginPath();
        const [sx0, sy0] = worldToScreen(pts[0].x, pts[0].y);
        c.moveTo(sx0, sy0);
        for (let i = 1; i < pts.length; i += 1) {
          const [sx, sy] = worldToScreen(pts[i].x, pts[i].y);
          c.lineTo(sx, sy);
        }
        c.stroke();
      }
      data.verts.forEach(v => dot(v.x, v.y, 3));
      break;
    }
  }
  c.setLineDash([]);
  c.restore();
}

bridge.renderNumPreview = renderNumPreviewOnCad;

/**
 * World AABB živého náhledu, nebo null když není co rámovat.
 * @param {object|null} data `state.numPreview.data`
 * @returns {{minX: number, maxX: number, minY: number, maxY: number}|null}
 */
function numPreviewWorldBounds(data) {
  if (!data || data.valid === false) return null;
  const pts = [];
  switch (data.type) {
    case 'point': pts.push([data.x, data.y]); break;
    case 'line':
    case 'constr': pts.push([data.x1, data.y1], [data.x2, data.y2]); break;
    case 'circle':
    case 'arc':
      pts.push([data.cx - data.r, data.cy - data.r], [data.cx + data.r, data.cy + data.r]);
      break;
  }
  const finite = pts.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (finite.length === 0) return null;
  return {
    minX: Math.min(...finite.map(p => p[0])),
    maxX: Math.max(...finite.map(p => p[0])),
    minY: Math.min(...finite.map(p => p[1])),
    maxY: Math.max(...finite.map(p => p[1])),
  };
}

/**
 * ⤢ v liště okna nad záložkou 🔢 – vycentruje plátno na rozepsaný objekt.
 * Když ještě není co ukazovat, spadne to na běžné vycentrování výkresu
 * (obojí rámuje jen VIDITELNOU část plátna, ne oblast pod oknem).
 * @returns {boolean}
 */
export function fitCadViewToNumPreview() {
  const bounds = numPreviewWorldBounds(state.numPreview?.data);
  if (!bounds) return false;
  fitViewToWorldBounds(bounds);
  bridge.renderAll?.();
  return true;
}

bridge.fitNumPreviewView = fitCadViewToNumPreview;

// Typy objektů zadávané číselně. Obdélník a kontura tu schválně nejsou –
// obdélník se číselně nekreslí a kontura vzniká řetězením úseček (každé
// „OK" navazuje na konec předchozí). Ikony sedí s panelem nástrojů.
// Konstrukční čára je „úsečka, ale čárkovaně" – žádný znak přerušovanou
// diagonálu nemá, takže je z SVG (velikost i barvu dědí z tlačítka).
const CONSTR_ICON = '<svg class="num-type-svg" viewBox="0 0 20 20" aria-hidden="true">'
  + '<line x1="3" y1="17" x2="17" y2="3" stroke="currentColor" stroke-width="2"'
  + ' stroke-dasharray="4 3" stroke-linecap="round"/></svg>';

const NUM_TYPES = [
  { key: 'line',   icon: '/',          label: 'Úsečka' },
  { key: 'circle', icon: '○',          label: 'Kružnice' },
  { key: 'point',  icon: '·',          label: 'Bod' },
  { key: 'constr', icon: CONSTR_ICON,  label: 'Konstrukční čára' },
  { key: 'arc',    icon: '⌒',          label: 'Oblouk' },
];

// Po otevření okna je vybraný Bod: má nejmíň polí, takže na pole pro zápis
// G-kódu zbyde nejvíc místa a je vidět celé bez rolování.
const DEFAULT_NUM_TYPE = 'point';

// Pole na ruční zápis G-kódu zůstává PRÁZDNÉ – není to zrcadlo pravého CNC
// panelu, ale škrtací blok, ze kterého se kód vykreslí na plátno (a teprve
// pak ho panel vygeneruje sám). Placeholder ukazuje formát, ve kterém to
// pravý panel vypisuje, aby se ručně psaný kód s ním rovnou potkal.
const GCODE_PLACEHOLDER = 'G00 X0.000 Z0.000\nG01 X20.000 Z-30.000\nG03 X25.000 Z-40.000 R5.000';
const NUM_GCODE_STORAGE_KEY = 'skica-num-gcode';

/**
 * Markup záložky „Číselné zadání". Čistá funkce – jen HTML.
 * `.input-dialog` zůstává jako obal obsahu, aby platila stávající CSS
 * pravidla `.input-dialog label/input/.btn-row/.btn-ok/.btn-cancel`
 * (nejsou zanořená pod `.input-overlay`). Titulek nese titlebar okna.
 *
 * Typ objektu se vybírá řádkem ikon; skrytý `<select id="numType">` pod ním
 * zůstává jediným zdrojem pravdy (čte ho `updateFields()`, `createObject()`
 * i obsluha 🎯), takže ikony jen přepínají jeho hodnotu.
 */
export function renderNumericalTab() {
  const html = `
    <div class="input-dialog">
      <div class="tab-scroll">
        <div class="num-type-row">
          ${NUM_TYPES.map(t => `<button type="button" class="num-type-btn" data-num-type="${t.key}" title="${t.label}">${t.icon}</button>`).join('')}
        </div>
        <select id="numType" hidden>
          ${NUM_TYPES.map(t => `<option value="${t.key}"${t.key === DEFAULT_NUM_TYPE ? ' selected' : ''}>${t.label}</option>`).join('')}
        </select>
        <div id="numFields"></div>
      <div class="vk-gcode-box vk-gcode-box-bare">
        <button type="button" class="vk-header-btn vk-gcode-corner-btn" data-act="gcode-apply"
          title="Vykreslit zapsaný G-kód na plátno (nahradí objekty výkresu)">🔄</button>
        <textarea class="vk-gcode-textarea" data-id="num-gcode" spellcheck="false"
          placeholder="${GCODE_PLACEHOLDER}" aria-label="Ruční zápis G-kódu"></textarea>
        </div>
      </div>
    </div>`;
  return { html };
}

/**
 * Naváže logiku číselného zadání na obsah záložky. `container` je jen obsah
 * záložky – celé okno (pro skrytí při výběru z mapy a pro zavření) se hledá
 * přes `.calc-overlay`, protože záložka okno sdílí s VK.
 * @param {HTMLElement} container
 * @param {{ picker?: import('./canvasPick.js').CanvasPicker|null }} [deps]
 *   `picker` = sdílený jednorázový odběr kliku na plátno (canvasPick.js).
 *   Okno je plovoucí, takže se při výběru bodu už neschovává – jen se
 *   zvýrazní cílové pole.
 * @returns {{ destroy: () => void }}
 */
export function initNumericalTab(container, { picker = null } = {}) {
  const root = container.closest('.calc-overlay') || container.closest('.input-overlay') || container;
  const typeSelect = container.querySelector("#numType");
  const fieldsDiv = container.querySelector("#numFields");

  // Úsečka/konstr.: která dvojice polí je autoritativní pro createObject().
  // updateLineInfo() PŘEPISUJE nlen/nang jako informační zobrazení pokaždé,
  // když se změní X1/Z1/X2/Z2 (i po 🎯 výběru z mapy) – bez tohohle
  // příznaku by createObject() vzal displej rekonstruovaný z Délka+Úhel
  // (úhel zaokrouhlený na 2 des. místa) MÍSTO přesně napsaných souřadnic,
  // takže by se u velkých délek ztratila přesnost v řádu desetin mm.
  // true jen tehdy, když do Délka/Úhel fakt psal uživatel.
  let lineUsesLenAng = false;

  function pickFromMap(callback, btn) {
    if (!picker) return;
    picker.pick(callback, {
      field: btn?.closest('.input-row') || null,
      hint: 'Klikněte do výkresu pro výběr bodu…',
    });
  }

  /**
   * Tlačítko „vybrat bod z výkresu". `role` říká, které pole klik naplní –
   * dřív se to poznávalo podle POŘADÍ tlačítka v DOM, takže přeskládání
   * řádků formuláře tiše přehodilo význam kliku.
   * @param {string} label
   * @param {'point'|'p1'|'p2'|'center'|'radius'|'startAngle'|'endAngle'} role
   */
  function pickBtn(label, role) {
    return `<button type="button" class="pick-btn" data-pick="${role}" title="Vybrat z mapy">${label}</button>`;
  }

  function angleCompassBtn() {
    return `<button type="button" class="compass-trigger-btn" title="Rychlá volba úhlu" style="font-size:16px;padding:2px 6px">✛</button>`;
  }

  /** OK sedí v posledním řádku polí, ne pod nimi – šetří řádek na mobilu. */
  function okBtn() {
    return `<button type="button" class="btn-ok num-ok-btn" id="numOk"
      title="Vloží objekt do výkresu; okno zůstane otevřené pro další prvek (zavřít ✕ v liště)">OK</button>`;
  }

  // Roh vzniklý navázáním úsečky na úsečku. Drží se poslední vytvořený
  // konec, aby šlo poznat, že nová úsečka fakt navazuje – jen tehdy má
  // smysl nabízet zaoblení/zkosení a jen tehdy je roh jednoznačný.
  let prevLineEnd = null;
  let lastLineCorner = null;

  // Jak se zadává oblouk: 'center' = střed + úhly, 'endpoints' = začátek,
  // konec, R a smysl (zápis jako v G-kódu, navazuje na předchozí prvek).
  let arcMode = 'endpoints';

  // Konec posledně PŘIPSANÉHO řádku do pole „Ruční zápis G-kódu" – ať se
  // při navazujícím řetězení (úsečka na úsečku apod.) neopakuje zbytečný
  // G00 na bod, kde nástroj beztak už stojí. `null` = další prvek si musí
  // vždy najet sám (přerušený řetěz, nebo bod/kružnice před ním).
  let lastAppendedGcodeEnd = null;

  /**
   * Připíše nově vytvořený objekt do pole „Ruční zápis G-kódu" ve stejném
   * formátu, jaký appka vypisuje jinde (`bridge.formatAbsCoord` – sdílené
   * s pravým CNC panelem, aby se osy/jednotky nerozjely na dvou místech).
   * Bod a kružnice nejsou skutečný pohyb nástroje – zapíšou se jako
   * komentář, aby zápis zůstal čitelný a validní (parser komentáře
   * ignoruje, takže nevadí ani při zpětném 🔄 vykreslení).
   * @param {string} t typ z `readFormGeometry()` ('point'|'line'|'constr'|'circle'|'arc')
   * @param {object} g geometrie vrácená `readFormGeometry()`
   */
  function appendGcodeForObject(t, g) {
    const gcodeEl = container.querySelector('[data-id="num-gcode"]');
    if (!gcodeEl) return;
    const fmt = (x, y) => bridge.formatAbsCoord ? bridge.formatAbsCoord(x, y) : `X${x.toFixed(3)} Z${y.toFixed(3)}`;
    const continuesFrom = (x, y) => lastAppendedGcodeEnd
      && Math.hypot(x - lastAppendedGcodeEnd.x, y - lastAppendedGcodeEnd.y) < 1e-6;

    const lines = [];
    let newEnd = null;
    switch (t) {
      case 'point':
        lines.push(`; Bod ${fmt(g.x, g.y)}`);
        break;
      case 'line':
      case 'constr':
        if (!continuesFrom(g.x1, g.y1)) lines.push(`G00 ${fmt(g.x1, g.y1)}`);
        lines.push(`G01 ${fmt(g.x2, g.y2)}${t === 'constr' ? ' ; konstr' : ''}`);
        newEnd = { x: g.x2, y: g.y2 };
        break;
      case 'circle':
        lines.push(`; Kružnice střed ${fmt(g.cx, g.cy)} R${g.r.toFixed(3)}`);
        break;
      case 'arc': {
        const sx = g.cx + g.r * Math.cos(g.sa), sy = g.cy + g.r * Math.sin(g.sa);
        const ex = g.cx + g.r * Math.cos(g.ea), ey = g.cy + g.r * Math.sin(g.ea);
        if (!continuesFrom(sx, sy)) lines.push(`G00 ${fmt(sx, sy)}`);
        // Zrcadlení jedné osy obrací smysl oblouku – stejné pravidlo jako
        // flipArc() v runCncExport() (storage/fileIO.js).
        const base = g.ccw ? 'G03' : 'G02';
        const code = (state.flipX !== state.flipZ) ? (base === 'G02' ? 'G03' : 'G02') : base;
        lines.push(`${code} ${fmt(ex, ey)} R${g.r.toFixed(3)}`);
        newEnd = { x: ex, y: ey };
        break;
      }
      default:
        return;
    }
    lastAppendedGcodeEnd = newEnd;
    gcodeEl.value = gcodeEl.value.trim() === '' ? lines.join('\n') : `${gcodeEl.value}\n${lines.join('\n')}`;
    try { localStorage.setItem(NUM_GCODE_STORAGE_KEY, gcodeEl.value); } catch { /* ignore */ }
  }

  /**
   * Najde poslední řádek, jehož cílová souřadnice je přesně `(wx, wy)` –
   * hledá se OD KONCE textem naformátovaným stejně jako `appendGcodeForObject`
   * (`bridge.formatAbsCoord`), takže je to spolehlivé bez ohledu na to, kolik
   * dalších řádků mezitím přibylo. Roh vzniká mezi DVĚMA po sobě jdoucími
   * úsečkami – marker patří na tu, co do rohu DOJÍŽDÍ (má ho jako svůj CÍL),
   * ne na tu, která z něj teprve vede dál.
   * @param {number} wx
   * @param {number} wy
   * @returns {number} index v `gcodeEl.value.split('\n')`, nebo -1
   */
  function findLineIndexEndingAt(wx, wy) {
    const gcodeEl = container.querySelector('[data-id="num-gcode"]');
    const target = gcodeEl && bridge.formatAbsCoord ? bridge.formatAbsCoord(wx, wy) : null;
    if (!target) return -1;
    const lines = gcodeEl.value.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes(target)) return i;
    }
    return -1;
  }

  /**
   * Připíše marker sražení/zaoblení (`bridge.gcodeCornerMarker()` – stejná
   * konvence jako CNC Editor: Sinumerik `CHF=`/`RND=`, Fanuc `C`/`R`,
   * Heidenhain `CHF `/`RND R`) na řádek, který DOJÍŽDÍ do zadaného rohu.
   * Je to jen standardní ISO zkratka, appka ji needituje na skutečnou dráhu
   * – to dělá tlačítko „⌒ Sražení/zaoblení → dráha" přímo v CNC Editoru,
   * když to uživatel chce vidět/ověřit.
   * @param {'fillet'|'chamfer'} mode
   * @param {number} value
   * @param {number} cornerWx world X rohu (konec úsečky, na kterou marker patří)
   * @param {number} cornerWy world Y rohu
   * @returns {boolean} false = řádek dojíždějící do rohu se v textu nenašel
   */
  function appendCornerMarker(mode, value, cornerWx, cornerWy) {
    if (!bridge.gcodeCornerMarker) return false;
    const gcodeEl = container.querySelector('[data-id="num-gcode"]');
    if (!gcodeEl) return false;
    const idx = findLineIndexEndingAt(cornerWx, cornerWy);
    if (idx === -1) return false;
    const lines = gcodeEl.value.split('\n');
    const marker = bridge.gcodeCornerMarker(mode, value);
    const line = lines[idx];
    const ci = line.indexOf(';');
    const code = (ci !== -1 ? line.slice(0, ci) : line).replace(/\s+$/, '');
    const comment = ci !== -1 ? line.slice(ci) : '';
    lines[idx] = comment ? `${code} ${marker} ${comment}` : `${code} ${marker}`;
    gcodeEl.value = lines.join('\n');
    try { localStorage.setItem(NUM_GCODE_STORAGE_KEY, gcodeEl.value); } catch { /* ignore */ }
    return true;
  }

  /** Tlačítka ⌒/⌿ – jen když je co zaoblit (dvě navazující úsečky). */
  function cornerToolsHTML() {
    if (!lastLineCorner) return '';
    return `<div class="input-row num-corner-row">
      <span class="num-corner-label">Roh s předchozí úsečkou:</span>
      <div class="pick-col">
        <button type="button" class="btn-ok num-corner-btn" data-corner="fillet" title="Zaoblit roh">⌒</button>
        <button type="button" class="btn-ok num-corner-btn" data-corner="chamfer" title="Zkosit roh">⌿</button>
      </div>
    </div>`;
  }

  // Typ rohu pro NEPOVINNÉ pole „Roh s předchozí" – vyplní se hned při
  // zadávání navazující úsečky, takže OK v jednom kroku vytvoří úsečku
  // I zaoblí/zkosí roh s tou předchozí (místo dvou kroků: čára, pak zvlášť
  // ⌒/⌿ v `cornerToolsHTML()` výše, která zůstává jako záložní cesta,
  // když se pole nevyplní předem).
  let cornerInlineMode = 'fillet';

  /**
   * Nepovinný řádek „Roh s předchozí" přímo ve formuláři úsečky – zobrazí
   * se, kdykoli existuje předchozí úsečka (`prevLineEnd`), i než appka ví,
   * jestli tahle nová na ni fakt naváže (to se pozná až po vytvoření).
   * Když roh nakonec nevznikne (uživatel změnil počáteční bod jinam),
   * appka o tom po OK jen informuje toastem – nic se tiše neaplikuje jinam.
   */
  function cornerInlineFieldHTML() {
    if (!prevLineEnd) return '';
    return `<div class="input-row num-corner-inline-row">
      <div class="num-corner-inline-toggle">
        <button type="button" class="vk-toggle${cornerInlineMode === 'fillet' ? ' active' : ''}" data-corner-mode="fillet" title="Zaoblit roh s předchozí úsečkou">⌒</button>
        <button type="button" class="vk-toggle${cornerInlineMode === 'chamfer' ? ' active' : ''}" data-corner-mode="chamfer" title="Zkosit roh s předchozí úsečkou">⌿</button>
      </div>
      <div><label>Roh s předchozí (nepovinné):</label><input type="text" id="ncorner" value="" placeholder="R / vzdálenost"></div>
    </div>`;
  }

  /**
   * Zaoblí/zkosí roh mezi poslední a předposlední úsečkou – stejná operace
   * jako nástroj Zaoblení/Zkosení na plátně, jen se na roh nemusí klikat.
   * @param {'fillet'|'chamfer'} mode
   */
  function applyCornerTool(mode) {
    const corner = lastLineCorner;
    if (!corner) return;
    showFilletChamferDialog((chosenMode, p1, p2) => {
      if (!bridge.filletChamferAtCorner?.(chosenMode, p1, p2, corner.x, corner.y)) {
        showToast('Roh se nenašel – úsečky už asi nenavazují');
        return;
      }
      // Marker je jednohodnotová zkratka (CHF=/RND=) – u zkosení dvěma
      // různými vzdálenostmi bere jen p1. Skutečná (asymetrická) geometrie
      // na plátně tím není dotčená, jde jen o zápis do G-kódu.
      appendCornerMarker(chosenMode, p1, corner.x, corner.y);
      // Roh je zpracovaný; druhý pokus by zaobloval už zaoblené.
      lastLineCorner = null;
      updateFields();
    }, mode);
  }

  function wireAngleCompass(container, angleInputId) {
    const btn = container.querySelector('.compass-trigger-btn');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const existing = document.querySelector('.angle-compass-popup');
      if (existing) existing.remove();

      const popup = document.createElement('div');
      popup.className = 'angle-compass-popup';
      popup.innerHTML = `
        <div class="compass-grid">
          <button data-ang="135" class="compass-arrow" style="grid-area:tl" title="135°">↖</button>
          <button data-ang="90" class="compass-arrow" style="grid-area:tc" title="90°">↑</button>
          <button data-ang="45" class="compass-arrow" style="grid-area:tr" title="45°">↗</button>
          <button data-ang="180" class="compass-arrow" style="grid-area:ml" title="180°">←</button>
          <button class="compass-close" style="grid-area:mc" title="Zavřít">✕</button>
          <button data-ang="0" class="compass-arrow" style="grid-area:mr" title="0°">→</button>
          <button data-ang="225" class="compass-arrow" style="grid-area:bl" title="225°">↙</button>
          <button data-ang="270" class="compass-arrow" style="grid-area:bc" title="270°">↓</button>
          <button data-ang="315" class="compass-arrow" style="grid-area:br" title="315°">↘</button>
        </div>`;

      popup.style.position = 'fixed';
      popup.style.zIndex = '100000';

      // Blokovat probublání do okna
      popup.addEventListener('click', (ev) => ev.stopPropagation());
      popup.addEventListener('mousedown', (ev) => ev.stopPropagation());
      popup.addEventListener('touchstart', (ev) => ev.stopPropagation());

      root.appendChild(popup);

      // Pozicovat dole na střed obrazovky, nad spodní lištu
      const pw = popup.offsetWidth;
      const ph = popup.offsetHeight;
      const left = Math.max(4, Math.min((window.innerWidth - pw) / 2, window.innerWidth - pw - 4));
      const top = Math.max(4, window.innerHeight - ph - 80);
      popup.style.left = left + 'px';
      popup.style.top = top + 'px';

      popup.querySelectorAll('.compass-arrow').forEach(ab => {
        ab.onclick = function() {
          const ang = this.dataset.ang;
          const inp = document.getElementById(angleInputId);
          if (inp) {
            inp.value = ang;
            inp.dispatchEvent(new Event('input', { bubbles: true }));
          }
          popup.remove();
        };
      });

      // Zavřít křížkem uprostřed
      const closeBtn = popup.querySelector('.compass-close');
      if (closeBtn) {
        closeBtn.onclick = function() { popup.remove(); };
      }

      // Zavřít popup kliknutím mimo
      function onOutsideClick(ev) {
        if (!popup.contains(ev.target) && ev.target !== btn) {
          popup.remove();
          document.removeEventListener('click', onOutsideClick);
        }
      }
      setTimeout(() => document.addEventListener('click', onOutsideClick), 100);
    });
  }

  const isInc = state.coordMode === 'inc';
  const [H, V] = axisLabels();
  const lbl = (name) => isInc ? 'Δ' + name : name;

  // Chain-závislé výchozí hodnoty pro počáteční bod. `let`, ne module-level
  // `const` – „Vytvořit" teď okno nezavírá a rovnou pokračuje dalším
  // prvkem (viz createAnother níž), takže updateFields() musí při KAŽDÉM
  // volání vidět čerstvý state.numDialogChain, ne ten z prvního vykreslení.
  let hasChain, startDispX, startDispY;
  function refreshChainDefaults() {
    hasChain = state.numDialogChain.x !== null;
    const chainX = hasChain ? state.numDialogChain.x.toFixed(3) : "0";
    const chainY = hasChain ? state.numDialogChain.y.toFixed(3) : "0";
    // V INC režimu chain hodnoty zobrazit jako delta od reference
    const chainDispX = hasChain ? (isInc ? (state.numDialogChain.x - state.incReference.x).toFixed(3) : chainX) : "0";
    const chainDispY = hasChain ? (isInc ? (state.numDialogChain.y - state.incReference.y).toFixed(3) : chainY) : "0";

    // Poslední kliknutý bod na plátně (viz #statusCoords) – záložní výchozí hodnota
    // počátečního bodu, pokud právě neběží řetězení od předchozího objektu (hasChain)
    const hasLastClick = state.lastClickPoint.x !== null;
    const lastClickDispX = hasLastClick
      ? (isInc ? (state.lastClickPoint.x - state.incReference.x).toFixed(3) : state.lastClickPoint.x.toFixed(3))
      : "0";
    const lastClickDispY = hasLastClick
      ? (isInc ? (state.lastClickPoint.y - state.incReference.y).toFixed(3) : state.lastClickPoint.y.toFixed(3))
      : "0";
    // Výchozí hodnota počátečního bodu: chain (pokračování kreslení) > poslední klik > 0
    startDispX = hasChain ? chainDispX : lastClickDispX;
    startDispY = hasChain ? chainDispY : lastClickDispY;
  }

  // Zobrazovat osy vždy v pořadí X, Z (jako zbytek UI – viz fmtStatusCoords),
  // bez ohledu na to, že axisLabels() vrací [H, V] podle wx/wy (soustruh: H=Z, V=X)
  const xFirst = H === 'X';
  /** Poskládá dvojici polí (H-osa, V-osa) do zobrazovaného pořadí X, Z. */
  function axisPair(hFieldHtml, vFieldHtml) {
    return xFirst ? hFieldHtml + vFieldHtml : vFieldHtml + hFieldHtml;
  }

  /**
   * Přečte aktuální stav formuláře a spočítá geometrii vybraného typu –
   * BEZ vytvoření objektu. Sdílí ho `createObject()` (skutečné vložení)
   * i živý náhled na plátně (`scheduleNumPreview`), aby nevznikly dvě
   * mírně odlišné cesty výpočtu – přesně tenhle vzorec (Délka/Úhel vs.
   * X2/Z2) dřív způsobil ztrátu přesnosti, viz `lineUsesLenAng` výš.
   * @returns {{type: string, valid: boolean, [key: string]: any}}
   */
  function readFormGeometry() {
    const t = typeSelect.value;
    const toAbs = (vx, vy) => isInc ? fromIncToAbs(vx, vy) : { x: vx, y: vy };
    const val = (id) => safeEvalMath(container.querySelector(id)?.value);
    const finite2 = (a, b) => isFinite(a) && isFinite(b);

    switch (t) {
      case "point": {
        const p = toAbs(val("#nx"), val("#ny"));
        return { type: "point", valid: finite2(p.x, p.y), x: p.x, y: p.y };
      }
      case "line":
      case "constr": {
        const p1 = toAbs(val("#nx1"), val("#ny1"));
        const len = val("#nlen"), ang = val("#nang");
        let p2;
        if (lineUsesLenAng && isFinite(len) && isFinite(ang) && len > 0) {
          // Polární vždy od bodu 1 (absolutního), bez ohledu na INC/ABS –
          // v INC režimu by toAbs() jinak vzal len*cos/sin jako deltu od
          // INC reference, ne od p1.
          const rad = (ang * Math.PI) / 180;
          p2 = { x: p1.x + len * Math.cos(rad), y: p1.y + len * Math.sin(rad) };
        } else {
          p2 = toAbs(val("#nx2"), val("#ny2"));
        }
        return { type: t, valid: finite2(p1.x, p1.y) && finite2(p2.x, p2.y), x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
      }
      case "circle": {
        const c = toAbs(val("#ncx"), val("#ncy"));
        const r = val("#nr");
        return { type: "circle", valid: finite2(c.x, c.y) && isFinite(r) && r > 0, cx: c.x, cy: c.y, r };
      }
      case "arc": {
        const r = val("#nr");
        const ccw = container.querySelector("#narcDir")?.value === 'ccw';
        if (arcMode === 'endpoints') {
          // Zadání jako v G-kódu: začátek, konec, R a smysl otáčení.
          const p1 = toAbs(val("#nx1"), val("#ny1"));
          const p2 = toAbs(val("#nx2"), val("#ny2"));
          if (!finite2(p1.x, p1.y) || !finite2(p2.x, p2.y)) return { type: "arc", valid: false };
          const arc = arcFromEndpointsRadius(p1, p2, r, ccw);
          if (!arc) return { type: "arc", valid: false, minRadius: Math.hypot(p2.x - p1.x, p2.y - p1.y) / 2 };
          return {
            type: "arc", valid: true,
            cx: arc.cx, cy: arc.cy, r: arc.r, sa: arc.startAngle, ea: arc.endAngle, ccw,
          };
        }
        const c = toAbs(val("#ncx"), val("#ncy"));
        const sa = (val("#nsa") * Math.PI) / 180;
        const ea = (val("#nea") * Math.PI) / 180;
        return {
          type: "arc",
          valid: finite2(c.x, c.y) && isFinite(r) && r > 0 && isFinite(sa) && isFinite(ea),
          cx: c.x, cy: c.y, r, sa, ea, ccw,
        };
      }
      default:
        return { type: t, valid: false };
    }
  }

  let numPreviewRAF = null;
  /** Přepočte a zobrazí (nebo skryje) živý náhled – volá se z rAF, ne přímo z listeneru. */
  function updateNumPreview() {
    const geo = readFormGeometry();
    state.numPreview.visible = geo.valid;
    state.numPreview.data = geo.valid ? geo : null;
    // Oblouk ze začátku a konce nejde sestrojit, když je R kratší než půlka
    // tětivy – bez téhle hlášky by náhled jen tiše zmizel.
    const arcInfo = container.querySelector("#numArcInfo");
    if (arcInfo) {
      arcInfo.textContent = geo.minRadius
        ? `Poloměr musí být aspoň ${geo.minRadius.toFixed(3)} mm (půlka vzdálenosti bodů)`
        : '';
    }
    bridge.renderAll?.();
  }
  function scheduleNumPreview() {
    if (numPreviewRAF != null) return;
    numPreviewRAF = window.requestAnimationFrame(() => {
      numPreviewRAF = null;
      updateNumPreview();
    });
  }

  function updateFields() {
    refreshChainDefaults();
    lineUsesLenAng = false;
    const t = typeSelect.value;
    let html = "";
    switch (t) {
      case "point":
        html = `<div class="input-row">${axisPair(
                  `<div><label>${lbl(H)}:</label><input type="text" id="nx" value="${startDispX}"></div>`,
                  `<div><label>${lbl(V)}:</label><input type="text" id="ny" value="${startDispY}"></div>`
                )}
                <div class="pick-col">${pickBtn("🎯", "point")}${okBtn()}</div></div>
                ${hasChain ? `<div id="numChainInfo" style="font-size:11px;color:${COLORS.textSecondary};margin-top:4px"></div>` : ''}`;
        break;
      case "line":
      case "constr":
        html = `<div class="input-row">${axisPair(
                  `<div><label>${lbl(H+'1')}:</label><input type="text" id="nx1" value="${startDispX}"></div>`,
                  `<div><label>${lbl(V+'1')}:</label><input type="text" id="ny1" value="${startDispY}"></div>`
                )}
                <div class="pick-col">${pickBtn("🎯1", "p1")}</div></div>
                <div class="input-row">${axisPair(
                  `<div><label>${lbl(H+'2')}:</label><input type="text" id="nx2" value=""></div>`,
                  `<div><label>${lbl(V+'2')}:</label><input type="text" id="ny2" value=""></div>`
                )}
                <div class="pick-col">${pickBtn("🎯2", "p2")}</div></div>
                <div id="numLineInfo" style="font-size:11px;color:${COLORS.textSecondary};margin-top:4px"></div>
                ${cornerInlineFieldHTML()}
                <div class="input-row"><div><label>Délka:</label><input type="text" id="nlen" value=""></div>
                <div><label>Úhel (°):</label><input type="text" id="nang" value=""></div>
                <div class="pick-col">${angleCompassBtn()}${okBtn()}</div></div>
                ${cornerToolsHTML()}`;
        break;
      case "circle":
        html = `<div class="input-row">${axisPair(
                  `<div><label>${lbl('Střed '+H)}:</label><input type="text" id="ncx" value="${startDispX}"></div>`,
                  `<div><label>${lbl('Střed '+V)}:</label><input type="text" id="ncy" value="${startDispY}"></div>`
                )}
                <div class="pick-col">${pickBtn("🎯", "center")}</div></div>
                <div class="input-row"><div><label>Poloměr:</label><input type="text" id="nr" value="10"></div>
                <div class="pick-col">${pickBtn("📏 R", "radius")}${okBtn()}</div></div>`;
        break;
      case "arc": {
        // Dva způsoby zadání, oba na tři řádky; poslední řádek mají společný
        // (poloměr + směr + OK).
        const modeRow = `<div class="num-arc-modes">
                  <button type="button" class="num-arc-mode${arcMode === 'endpoints' ? ' active' : ''}" data-arc-mode="endpoints">Start + konec</button>
                  <button type="button" class="num-arc-mode${arcMode === 'center' ? ' active' : ''}" data-arc-mode="center">Střed + úhly</button>
                </div>`;
        const shapeRows = arcMode === 'endpoints'
          ? `<div class="input-row">${axisPair(
                  `<div><label>${lbl('Start '+H)}:</label><input type="text" id="nx1" value="${startDispX}"></div>`,
                  `<div><label>${lbl('Start '+V)}:</label><input type="text" id="ny1" value="${startDispY}"></div>`
                )}
                <div class="pick-col">${pickBtn("🎯1", "p1")}</div></div>
                <div class="input-row">${axisPair(
                  `<div><label>${lbl('Konec '+H)}:</label><input type="text" id="nx2" value=""></div>`,
                  `<div><label>${lbl('Konec '+V)}:</label><input type="text" id="ny2" value=""></div>`
                )}
                <div class="pick-col">${pickBtn("🎯2", "p2")}</div></div>`
          : `<div class="input-row">${axisPair(
                  `<div><label>${lbl('Střed '+H)}:</label><input type="text" id="ncx" value="${startDispX}"></div>`,
                  `<div><label>${lbl('Střed '+V)}:</label><input type="text" id="ncy" value="${startDispY}"></div>`
                )}
                <div class="pick-col">${pickBtn("🎯", "center")}</div></div>
                <div class="input-row">
                <div><label>Start (°):</label><input type="text" id="nsa" value="0"></div>
                <div><label>Konec (°):</label><input type="text" id="nea" value="90"></div>
                <div class="pick-col">${pickBtn("📐 S", "startAngle")}${pickBtn("📐 E", "endAngle")}</div></div>`;
        html = `${modeRow}
                ${shapeRows}
                <div class="input-row">
                <div><label>Poloměr:</label><input type="text" id="nr" value="10"></div>
                <div><label>Směr:</label><select id="narcDir">
                  <option value="cw">↻ CW (po směru)</option>
                  <option value="ccw">↺ CCW (proti směru)</option>
                </select></div>
                <div class="pick-col">${pickBtn("📏 R", "radius")}${okBtn()}</div></div>
                <div id="numArcInfo" style="font-size:11px;color:${COLORS.textSecondary};margin-top:4px"></div>`;
        break;
      }
    }
    fieldsDiv.innerHTML = html;

    // Wire pick buttons – co klik naplní, říká `data-pick`, ne pořadí v DOM.
    fieldsDiv.querySelectorAll(".pick-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        pickFromMap((wx, wy) => {
          // V INC režimu převést absolutní souřadnice na delta pro pole
          const dp = isInc ? toDisplayCoords(wx, wy) : { x: wx, y: wy };
          const setPair = (xSel, ySel) => {
            const fx = container.querySelector(xSel);
            const fy = container.querySelector(ySel);
            if (fx) fx.value = dp.x.toFixed(3);
            if (fy) fy.value = dp.y.toFixed(3);
          };
          /** Absolutní střed oblouku/kružnice a úhel kliknutého bodu od něj. */
          const fromCenter = () => {
            const cx = safeEvalMath(container.querySelector("#ncx")?.value) || 0;
            const cy = safeEvalMath(container.querySelector("#ncy")?.value) || 0;
            const c = isInc ? fromIncToAbs(cx, cy) : { x: cx, y: cy };
            return { c, deg: Math.atan2(wy - c.y, wx - c.x) * 180 / Math.PI };
          };

          switch (btn.dataset.pick) {
            case "point":
              setPair("#nx", "#ny");
              updateChainInfo();
              break;
            case "p1":
              setPair("#nx1", "#ny1");
              updateLineInfo();
              break;
            case "p2":
              setPair("#nx2", "#ny2");
              updateLineInfo();
              break;
            case "center":
              setPair("#ncx", "#ncy");
              break;
            case "radius": {
              const rInp = container.querySelector("#nr");
              if (rInp) {
                const { c } = fromCenter();
                rInp.value = Math.hypot(wx - c.x, wy - c.y).toFixed(3);
              }
              break;
            }
            case "startAngle": {
              const saInp = container.querySelector("#nsa");
              if (saInp) saInp.value = fromCenter().deg.toFixed(2);
              break;
            }
            case "endAngle": {
              const eaInp = container.querySelector("#nea");
              if (eaInp) eaInp.value = fromCenter().deg.toFixed(2);
              break;
            }
          }
          showToast(`Bod: X${wx.toFixed(2)} Z${wy.toFixed(2)}`);
          scheduleNumPreview();
        }, btn);
      });
    });

    const first = fieldsDiv.querySelector("input");
    if (first && !("ontouchstart" in window)) setTimeout(() => first.focus(), 50);

    // Auto-select obsahu při kliknutí + vyhodnocení výrazu při opuštění pole
    wireExprInputs(fieldsDiv);

    // Auto-update info pro úsečky/konstr.
    function updateLineInfo() {
      const info = fieldsDiv.querySelector("#numLineInfo");
      if (!info) return;
      const x1 = safeEvalMath(fieldsDiv.querySelector("#nx1")?.value);
      const y1 = safeEvalMath(fieldsDiv.querySelector("#ny1")?.value);
      const x2 = safeEvalMath(fieldsDiv.querySelector("#nx2")?.value);
      const y2 = safeEvalMath(fieldsDiv.querySelector("#ny2")?.value);
      if ([x1,y1,x2,y2].every(v => isFinite(v))) {
        const d = Math.hypot(x2-x1, y2-y1);
        const a = Math.atan2(y2-y1, x2-x1) * 180 / Math.PI;
        info.textContent = `Délka: ${d.toFixed(3)} mm  |  Úhel: ${a.toFixed(2)}°`;
        // Auto-fill délka/úhel polí pokud oba body jsou nenulové – jen INFO
        // zobrazení, ne nová autoritativní hodnota (viz lineUsesLenAng výš).
        const nlen = fieldsDiv.querySelector("#nlen");
        const nang = fieldsDiv.querySelector("#nang");
        if (nlen && nang && d > 0.0001) {
          nlen.value = d.toFixed(3);
          nang.value = a.toFixed(2);
        }
        lineUsesLenAng = false;
      }
    }
    ["#nx1","#ny1","#nx2","#ny2"].forEach(sel => {
      const inp = fieldsDiv.querySelector(sel);
      if (inp) inp.addEventListener("input", updateLineInfo);
    });
    updateLineInfo();

    // Sync délka/úhel → souřadnice bodu 2
    function syncLenAngToCoords() {
      const nlen = fieldsDiv.querySelector("#nlen");
      const nang = fieldsDiv.querySelector("#nang");
      if (!nlen || !nang) return;
      function onLenAngInput() {
        const len = safeEvalMath(nlen.value);
        const ang = safeEvalMath(nang.value);
        if (!isFinite(len) || !isFinite(ang) || len <= 0) return;
        // Sem se chodí jen ze skutečného psaní do Délka/Úhel (programová
        // .value= v updateLineInfo() žádný input event nevyvolává) – od
        // teď je pro createObject() autoritativní tahle dvojice, ne X2/Z2.
        lineUsesLenAng = true;
        const x1 = safeEvalMath(fieldsDiv.querySelector("#nx1")?.value) || 0;
        const y1 = safeEvalMath(fieldsDiv.querySelector("#ny1")?.value) || 0;
        const rad = (ang * Math.PI) / 180;
        const nx2 = fieldsDiv.querySelector("#nx2");
        const ny2 = fieldsDiv.querySelector("#ny2");
        if (nx2) nx2.value = (x1 + len * Math.cos(rad)).toFixed(3);
        if (ny2) ny2.value = (y1 + len * Math.sin(rad)).toFixed(3);
        // Update info text
        const info = fieldsDiv.querySelector("#numLineInfo");
        if (info) info.textContent = `Délka: ${len.toFixed(3)} mm  |  Úhel: ${ang.toFixed(2)}°`;
      }
      nlen.addEventListener("input", onLenAngInput);
      nang.addEventListener("input", onLenAngInput);
    }
    syncLenAngToCoords();

    // Wire angle compass – jen pro aktuální typ
    if (typeSelect.value === 'line' || typeSelect.value === 'constr') {
      wireAngleCompass(fieldsDiv, 'nang');
    }

    // Auto-update info pro bod (chain distance)
    function updateChainInfo() {
      const info = fieldsDiv.querySelector("#numChainInfo");
      if (!info || !hasChain) return;
      const nx = safeEvalMath(fieldsDiv.querySelector("#nx")?.value);
      const ny = safeEvalMath(fieldsDiv.querySelector("#ny")?.value);
      if (isFinite(nx) && isFinite(ny)) {
        // V INC režimu pole obsahuje delta – převést na absolutní pro porovnání s chain
        const abs = isInc ? fromIncToAbs(nx, ny) : { x: nx, y: ny };
        const d = Math.hypot(abs.x - state.numDialogChain.x, abs.y - state.numDialogChain.y);
        const a = Math.atan2(abs.y - state.numDialogChain.y, abs.x - state.numDialogChain.x) * 180 / Math.PI;
        info.textContent = `Od předchozího: ${d.toFixed(3)} mm  |  Úhel: ${a.toFixed(2)}°`;
      }
    }
    ["#nx","#ny"].forEach(sel => {
      const inp = fieldsDiv.querySelector(sel);
      if (inp) inp.addEventListener("input", updateChainInfo);
    });
    updateChainInfo();

    // Živý náhled – nové HTML, nové hodnoty (výchozí i chain-ové).
    scheduleNumPreview();
  }

  /** Toast „Pokračování od X.. Z.." – při otevření okna i po každém dalším prvku. */
  function announceChainContinuation() {
    if (hasChain) {
      showToast(`Pokračování od ${H}${state.numDialogChain.x.toFixed(2)} ${V}${state.numDialogChain.y.toFixed(2)}`);
    }
  }

  // Řádek ikon nad formulářem přepíná skrytý <select id="numType">, který
  // zůstává jediným zdrojem pravdy o typu objektu.
  const typeBtns = container.querySelectorAll('[data-num-type]');
  function syncTypeButtons() {
    typeBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.numType === typeSelect.value));
  }
  typeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (typeSelect.value === btn.dataset.numType) return;
      typeSelect.value = btn.dataset.numType;
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  typeSelect.addEventListener("change", () => { syncTypeButtons(); updateFields(); });
  syncTypeButtons();
  updateFields();
  announceChainContinuation();

  // Živý náhled – jeden delegovaný listener na `container` chytí psaní
  // do jakéhokoli pole i přepínač směru oblouku (narcDir), bez ohledu na
  // to, že `fieldsDiv.innerHTML` se při každém updateFields() přepisuje.
  // Konkrétní pole mají navíc vlastní listenery (sync X2↔Délka/Úhel apod.)
  // – ty tenhle jen doplňují, nenahrazují.
  container.addEventListener("input", scheduleNumPreview);
  container.addEventListener("change", scheduleNumPreview);

  function createObject() {
    const t = typeSelect.value;
    if (t !== 'line' && t !== 'constr') {
      // Cokoli jiného než úsečka řetěz přerušuje – roh by pak ukazoval
      // na dvojici, která spolu už nesouvisí.
      prevLineEnd = null;
      lastLineCorner = null;
    }
    try {
      switch (t) {
        case "point": {
          const g = readFormGeometry();
          if (!g.valid) { showToast("Zadejte souřadnice bodu"); return false; }
          addObject({ type: "point", x: g.x, y: g.y, name: `Bod ${state.nextId}` });
          state.numDialogChain = { x: g.x, y: g.y };
          break;
        }
        case "line":
        case "constr": {
          const g = readFormGeometry();
          if (!g.valid) { showToast("Zadejte cílový bod (X2/Z2, nebo Délka a Úhel)"); return false; }
          addObject({
            type: t,
            x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2,
            name: `${t === "constr" ? "Konstr" : "Úsečka"} ${state.nextId}`,
            dashed: t === "constr",
          });
          // Roh je jen tam, kde nová úsečka fakt začíná na konci předchozí.
          const joinsPrevious = prevLineEnd
            && Math.hypot(prevLineEnd.x - g.x1, prevLineEnd.y - g.y1) < 1e-6;
          lastLineCorner = joinsPrevious ? { x: g.x1, y: g.y1 } : null;
          prevLineEnd = { x: g.x2, y: g.y2 };
          state.numDialogChain = { x: g.x2, y: g.y2 };
          break;
        }
        case "circle": {
          const g = readFormGeometry();
          if (!g.valid) { showToast("Zadejte střed a kladný poloměr"); return false; }
          addObject({ type: "circle", cx: g.cx, cy: g.cy, r: g.r, name: `Kružnice ${state.nextId}` });
          state.numDialogChain = { x: g.cx, y: g.cy };
          break;
        }
        case "arc": {
          const g = readFormGeometry();
          if (!g.valid) { showToast("Zadejte střed, kladný poloměr a úhly"); return false; }
          addObject({
            type: "arc", cx: g.cx, cy: g.cy, r: g.r,
            startAngle: g.sa, endAngle: g.ea, ccw: g.ccw,
            name: `Oblouk ${state.nextId}`,
          });
          state.numDialogChain = { x: g.cx + g.r * Math.cos(g.ea), y: g.cy + g.r * Math.sin(g.ea) };
          break;
        }
      }
      return true;
    } catch (err) {
      showToast("Chyba – zkontrolujte hodnoty");
      return false;
    }
  }

  /**
   * Vytvoří objekt a NEZAVÍRÁ okno – rovnou se pokračuje dalším prvkem
   * (typicky řetězec úseček „bod za bodem"). `createObject()` už
   * aktualizovalo `state.numDialogChain`, takže `updateFields()` natáhne
   * čerstvé „Start = konec předchozího prvku" do stejného typu formuláře.
   */
  function createAnother() {
    // Geometrie se čte PŘED `createObject()` a znovu (stejná, čistá funkce)
    // hned po něm – ne proto, že by se mezitím měnila, ale aby zápis do
    // G-kódu použil přesně to, co se skutečně vložilo, ne odhad.
    if (!createObject()) return;
    appendGcodeForObject(typeSelect.value, readFormGeometry());
    applyInlineCornerIfRequested();
    picker?.cancel();
    // Vycentrovat plátno na celý výkres po každém přidaném prvku – při
    // řetězení „bod za bodem" jinak snadno vyjede mimo viditelnou plochu.
    autoCenterView();
    updateFields();
    announceChainContinuation();
  }

  /**
   * Zaoblí/zkosí roh HNED, když ho uživatel vyplnil v nepovinném řádku
   * „Roh s předchozí" přímo u zadávání této úsečky – jedno OK místo dvou
   * kroků (čára, pak zvlášť ⌒/⌿). Volá se vždy po `createObject()`; když
   * pole zůstalo prázdné nebo roh (ještě) nevznikl, jen tiše skončí – roh
   * pak nabídne `cornerToolsHTML()` jako záložní krok navíc.
   */
  function applyInlineCornerIfRequested() {
    if (!lastLineCorner) return;
    const input = container.querySelector('#ncorner');
    const value = input ? safeEvalMath(input.value) : NaN;
    if (!isFinite(value) || value <= 0) return;
    const corner = lastLineCorner;
    if (!bridge.filletChamferAtCorner?.(cornerInlineMode, value, value, corner.x, corner.y)) {
      showToast('Roh se nenašel – úsečky už asi nenavazují');
      return;
    }
    appendCornerMarker(cornerInlineMode, value, corner.x, corner.y);
    lastLineCorner = null;
  }

  // OK i tlačítka rohu žijí uvnitř #numFields, který updateFields() pokaždé
  // přepíše – proto delegace na kontejner, ne listener na konkrétní prvek.
  container.addEventListener("click", (e) => {
    if (e.target.closest("#numOk")) { createAnother(); return; }
    const cornerBtn = e.target.closest("[data-corner]");
    if (cornerBtn) { applyCornerTool(cornerBtn.dataset.corner); return; }
    const arcModeBtn = e.target.closest("[data-arc-mode]");
    if (arcModeBtn && arcModeBtn.dataset.arcMode !== arcMode) {
      arcMode = arcModeBtn.dataset.arcMode;
      updateFields();
      return;
    }
    const cornerModeBtn = e.target.closest("[data-corner-mode]");
    if (cornerModeBtn && cornerModeBtn.dataset.cornerMode !== cornerInlineMode) {
      cornerInlineMode = cornerModeBtn.dataset.cornerMode;
      // Jen přepnout zvýraznění – NE updateFields(), to by smazalo právě
      // rozepsané X2/Z2/Délku/Úhel (přepínač může přijít kdykoli během
      // zadávání úsečky, ne jen na jejím začátku).
      cornerModeBtn.parentElement.querySelectorAll('[data-corner-mode]')
        .forEach(b => b.classList.toggle('active', b === cornerModeBtn));
    }
  });

  container.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName === "INPUT") {
      createAnother();
    }
    // ESC okno nezavírá (plovoucí režim – patří nástroji na plátně),
    // jen odzbrojí rozdělaný 🎯 výběr bodu.
    if (e.key === "Escape") picker?.cancel();
  });

  // ── Ruční zápis G-kódu ──
  // Škrtací blok, ne zrcadlo pravého CNC panelu: text si píše uživatel a 🔄
  // ho vykreslí na plátno. Obsah přežívá zavření okna (stejně jako VK
  // syntaxe na sousední záložce), aby se rozepsaný program neztratil.
  const gcodeEl = container.querySelector('[data-id="num-gcode"]');
  try { gcodeEl.value = localStorage.getItem(NUM_GCODE_STORAGE_KEY) || ''; } catch { /* ignore */ }
  gcodeEl.addEventListener('input', () => {
    try { localStorage.setItem(NUM_GCODE_STORAGE_KEY, gcodeEl.value); } catch { /* ignore */ }
  });

  container.querySelector('[data-act="gcode-apply"]').addEventListener('click', () => {
    if (!gcodeEl.value.trim()) { showToast('Zapište nejdřív G-kód'); return; }
    // Ručně psaný kód se nejdřív srovná do kanonického tvaru a přepíše se
    // i v poli – uživatel tak vidí, jak byl jeho zápis pochopen, a text je
    // rovnou ve formátu, který vypisuje CNC panel.
    const normalized = normalizeGcodeText(gcodeEl.value);
    if (normalized !== gcodeEl.value) {
      gcodeEl.value = normalized;
      gcodeEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
    bridge.renderCncCodeToCanvas?.(normalized);
  });

  return {
    destroy() {
      // Rozdělaný odběr kliku na plátno by jinak přežil zavření okna.
      picker?.cancel();
      document.querySelector('.angle-compass-popup')?.remove();
    },
  };
}
