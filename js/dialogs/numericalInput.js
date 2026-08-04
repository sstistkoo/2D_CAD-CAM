// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Dialogy / Numerický vstup                        ║
// ╚══════════════════════════════════════════════════════════════╝

import { COLORS, LINE_WIDTH, PREVIEW_DASH } from '../constants.js';
import { state, showToast, fromIncToAbs, axisLabels, toDisplayCoords } from '../state.js';
import { addObject, addRectAsSegments, addPolylineAsSegments } from '../objects.js';
import { safeEvalMath } from '../utils.js';
import { wireExprInputs } from './mobileEdit.js';
import { bridge } from '../bridge.js';
import { worldToScreen, screenAngle, screenCCW } from '../canvas.js';

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
 * Markup záložky „Číselné zadání". Čistá funkce – jen HTML.
 * `.input-dialog` zůstává jako obal obsahu, aby platila stávající CSS
 * pravidla `.input-dialog label/input/.btn-row/.btn-ok/.btn-cancel`
 * (nejsou zanořená pod `.input-overlay`). Titulek nese titlebar okna.
 */
export function renderNumericalTab() {
  const html = `
    <div class="input-dialog">
      <div id="numModeInfo" style="font-size:11px;margin-bottom:8px;padding:4px 8px;border-radius:4px;font-family:Consolas;${state.coordMode === 'inc' ? `background:${COLORS.selected}22;color:${COLORS.selected}` : `color:${COLORS.textMuted}`}">
        Režim: ${state.coordMode === 'inc' ? 'INC (přírůstkový) – hodnoty jsou Δ od reference ' + axisLabels()[0] + '=' + state.incReference.x.toFixed(3) + ' ' + axisLabels()[1] + '=' + state.incReference.y.toFixed(3) : 'ABS (absolutní)'}
      </div>
      <div style="font-size:10px;color:${COLORS.border};margin-bottom:6px;font-style:italic">💡 Pole podporují matematické výrazy: 123+56, 200/3, (10+5)*2</div>
      <label>Typ objektu:</label>
      <select id="numType">
        <option value="point">Bod</option>
        <option value="line" selected>Úsečka</option>
        <option value="constr">Konstrukční čára</option>
        <option value="circle">Kružnice</option>
        <option value="arc">Oblouk</option>
        <option value="rect">Obdélník</option>
        <option value="polyline">Kontura</option>
      </select>
      <div id="numFields"></div>
      <div class="btn-row">
        <button class="btn-cancel" id="numCancel" title="Zavře okno">Zrušit</button>
        <button class="btn-ok" id="numOk" title="Potvrdí náhled na plátně a zůstane otevřené pro další prvek (zavřít ✕ v liště)">✓ Potvrdit</button>
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

  // Vrcholy rozpracované kontury – dřív visely na elementu okna
  // (jako `_polyVerts`), teď žijí v closure init funkce.
  let polyVerts = [];
  let polyBulges = [];

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

  function pickBtn(label) {
    return `<button type="button" class="pick-btn" title="Vybrat z mapy">${label}</button>`;
  }

  function angleCompassBtn() {
    return `<button type="button" class="compass-trigger-btn" title="Rychlá volba úhlu" style="font-size:16px;padding:2px 6px">✛</button>`;
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
        const c = toAbs(val("#ncx"), val("#ncy"));
        const r = val("#nr");
        const sa = (val("#nsa") * Math.PI) / 180;
        const ea = (val("#nea") * Math.PI) / 180;
        const ccw = container.querySelector("#narcDir")?.value === 'ccw';
        return {
          type: "arc",
          valid: finite2(c.x, c.y) && isFinite(r) && r > 0 && isFinite(sa) && isFinite(ea),
          cx: c.x, cy: c.y, r, sa, ea, ccw,
        };
      }
      case "rect": {
        const p1 = toAbs(val("#nx1"), val("#ny1"));
        const w = val("#nw"), h = val("#nh");
        // Šířka/výška je vždy relativní delta od bodu 1 – i v INC (stejné
        // pravidlo jako u Délka/Úhel), jinak níž.
        const p2 = (isFinite(w) && isFinite(h) && w > 0 && h > 0)
          ? { x: p1.x + w, y: p1.y + h }
          : toAbs(val("#nx2"), val("#ny2"));
        return { type: "rect", valid: finite2(p1.x, p1.y) && finite2(p2.x, p2.y), x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
      }
      case "polyline": {
        // Zjednodušený náhled: hotové vrcholy (polyVerts) + draft segment na
        // právě psaný bod X/Z. Cesta přes Délka/Úhel do náhledu nejde (žije
        // ve vnořeném uzávěru s relativním úhlem k poslednímu segmentu) –
        // finální kontura se ale skládá výhradně přes ➕ Přidat bod, takže
        // to na výsledek nemá vliv, jen na to, co je vidět při psaní.
        const nx = val("#nx"), ny = val("#ny");
        const draft = finite2(nx, ny) ? toAbs(nx, ny) : null;
        return { type: "polyline", valid: polyVerts.length > 0 || draft != null, verts: polyVerts.slice(), draft };
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
                <div class="pick-col">${pickBtn("🎯")}</div></div>
                ${hasChain ? `<div id="numChainInfo" style="font-size:11px;color:${COLORS.textSecondary};margin-top:4px"></div>` : ''}`;
        break;
      case "line":
      case "constr":
        html = `<div class="input-row">${axisPair(
                  `<div><label>${lbl(H+'1')}:</label><input type="text" id="nx1" value="${startDispX}"></div>`,
                  `<div><label>${lbl(V+'1')}:</label><input type="text" id="ny1" value="${startDispY}"></div>`
                )}
                <div class="pick-col">${pickBtn("🎯1")}</div></div>
                <div class="input-row">${axisPair(
                  `<div><label>${lbl(H+'2')}:</label><input type="text" id="nx2" value=""></div>`,
                  `<div><label>${lbl(V+'2')}:</label><input type="text" id="ny2" value=""></div>`
                )}
                <div class="pick-col">${pickBtn("🎯2")}</div></div>
                <div id="numLineInfo" style="font-size:11px;color:${COLORS.textSecondary};margin-top:4px"></div>
                <label style="font-size:11px;color:${COLORS.textMuted};margin-top:4px">Nebo: Délka a polární úhel</label>
                <div class="input-row"><div><label>Délka:</label><input type="text" id="nlen" value=""></div>
                <div><label>Úhel (°):</label><input type="text" id="nang" value=""></div>
                <div class="pick-col">${angleCompassBtn()}</div></div>`;
        break;
      case "circle":
        html = `<div class="input-row">${axisPair(
                  `<div><label>${lbl('Střed '+H)}:</label><input type="text" id="ncx" value="${startDispX}"></div>`,
                  `<div><label>${lbl('Střed '+V)}:</label><input type="text" id="ncy" value="${startDispY}"></div>`
                )}
                <div class="pick-col">${pickBtn("🎯")}</div></div>
                <div class="input-row"><div><label>Poloměr:</label><input type="text" id="nr" value="10"></div>
                <div class="pick-col">${pickBtn("📏 R")}</div></div>`;
        break;
      case "arc":
        html = `<div class="input-row">${axisPair(
                  `<div><label>${lbl('Střed '+H)}:</label><input type="text" id="ncx" value="${startDispX}"></div>`,
                  `<div><label>${lbl('Střed '+V)}:</label><input type="text" id="ncy" value="${startDispY}"></div>`
                )}
                <div class="pick-col">${pickBtn("🎯")}</div></div>
                <div class="input-row"><div><label>Poloměr:</label><input type="text" id="nr" value="10"></div>
                <div class="pick-col">${pickBtn("📏 R")}</div></div>
                <div class="input-row"><div><label>Start (°):</label><input type="text" id="nsa" value="0"></div>
                <div class="pick-col">${pickBtn("📐 S")}</div></div>
                <div class="input-row"><div><label>Konec (°):</label><input type="text" id="nea" value="90"></div>
                <div class="pick-col">${pickBtn("📐 E")}</div></div>
                <div class="input-row"><div><label>Směr:</label><select id="narcDir">
                  <option value="cw">↻ CW (po směru)</option>
                  <option value="ccw">↺ CCW (proti směru)</option>
                </select></div></div>`;
        break;
      case "rect":
        html = `<div class="input-row">${axisPair(
                  `<div><label>${lbl(H+'1')}:</label><input type="text" id="nx1" value="${startDispX}"></div>`,
                  `<div><label>${lbl(V+'1')}:</label><input type="text" id="ny1" value="${startDispY}"></div>`
                )}
                <div class="pick-col">${pickBtn("🎯1")}</div></div>
                <div class="input-row">${axisPair(
                  `<div><label>${lbl(H+'2')}:</label><input type="text" id="nx2" value=""></div>`,
                  `<div><label>${lbl(V+'2')}:</label><input type="text" id="ny2" value=""></div>`
                )}
                <div class="pick-col">${pickBtn("🎯2")}</div></div>
                <label style="font-size:11px;color:${COLORS.textMuted};margin-top:4px">Nebo: Šířka × Výška od bodu 1</label>
                <div class="input-row"><div><label>Šířka:</label><input type="text" id="nw" value=""></div>
                <div><label>Výška:</label><input type="text" id="nh" value=""></div></div>`;
        break;
      case "polyline":
        html = `<div style="font-size:12px;color:${COLORS.label};margin-bottom:8px">Zadávejte body po jednom. Klikněte "Přidat bod" pro každý vrchol kontury.</div>
                <div class="input-row">${axisPair(
                  `<div><label>${lbl(H)}:</label><input type="text" id="nx" value="${startDispX}"></div>`,
                  `<div><label>${lbl(V)}:</label><input type="text" id="ny" value="${startDispY}"></div>`
                )}
                <div class="pick-col">${pickBtn("🎯")}</div></div>
                <div id="polyLineInfo" style="font-size:11px;color:${COLORS.textSecondary};margin-top:4px"></div>
                <label style="font-size:11px;color:${COLORS.textMuted};margin-top:4px">Nebo: Délka a polární úhel od posledního bodu</label>
                <div class="input-row"><div><label>Délka:</label><input type="text" id="polyLen" value=""></div>
                <div><label>Úhel (°):</label><input type="text" id="polyAng" value=""></div>
                <div class="pick-col">${angleCompassBtn()}</div></div>
                <label id="polyRelAngleLabel" style="font-size:11px;display:none;align-items:center;gap:4px;cursor:pointer;margin-top:2px;color:${COLORS.textMuted}">
                  <input type="checkbox" id="polyRelAngle"> Relativní úhel (od předchozího segmentu)
                </label>
                <div id="polyVertexList" style="max-height:150px;overflow-y:auto;font-size:11px;font-family:Consolas;color:${COLORS.label};margin:8px 0;padding:4px;background:${COLORS.bgDarker};border-radius:4px;display:none"></div>
                <div style="display:flex;gap:6px;margin-bottom:8px">
                  <button class="btn-ok" id="polyAddVtx" style="font-size:11px;padding:3px 8px;flex:1">➕ Přidat bod</button>
                  <label style="font-size:11px;display:flex;align-items:center;gap:4px;cursor:pointer;white-space:nowrap">
                    <input type="checkbox" id="polyClosed"> Uzavřená
                  </label>
                </div>`;
        break;
    }
    fieldsDiv.innerHTML = html;

    // Wire pick buttons
    const pickBtns = fieldsDiv.querySelectorAll(".pick-btn");
    pickBtns.forEach((btn, i) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        pickFromMap((wx, wy) => {
          const t2 = typeSelect.value;
          // V INC režimu převést absolutní souřadnice na delta pro pole
          const dp = isInc ? toDisplayCoords(wx, wy) : { x: wx, y: wy };
          if (t2 === "point" || t2 === "polyline") {
            const nx = container.querySelector("#nx");
            const ny = container.querySelector("#ny");
            if (nx) nx.value = dp.x.toFixed(3);
            if (ny) ny.value = dp.y.toFixed(3);
            if (t2 === "point") updateChainInfo();
            if (t2 === "polyline") {
              // Trigger input event to update polyline info (délka/úhel)
              if (nx) nx.dispatchEvent(new Event("input"));
            }
          } else if (t2 === "line" || t2 === "constr" || t2 === "rect") {
            if (i === 0) {
              const f1 = container.querySelector("#nx1");
              const f2 = container.querySelector("#ny1");
              if (f1) f1.value = dp.x.toFixed(3);
              if (f2) f2.value = dp.y.toFixed(3);
            } else {
              const f1 = container.querySelector("#nx2");
              const f2 = container.querySelector("#ny2");
              if (f1) f1.value = dp.x.toFixed(3);
              if (f2) f2.value = dp.y.toFixed(3);
              // Auto-fill rect width/height (delta od delta = absolutní rozdíl)
              if (t2 === "rect") {
                const x1v = safeEvalMath(container.querySelector("#nx1")?.value) || 0;
                const y1v = safeEvalMath(container.querySelector("#ny1")?.value) || 0;
                const nw = container.querySelector("#nw");
                const nh = container.querySelector("#nh");
                if (nw) nw.value = (dp.x - x1v).toFixed(3);
                if (nh) nh.value = (dp.y - y1v).toFixed(3);
              }
            }
            updateLineInfo();
          } else if (t2 === "circle" || t2 === "arc") {
            const cxInp = container.querySelector("#ncx");
            const cyInp = container.querySelector("#ncy");
            const rInp = container.querySelector("#nr");
            const saInp = container.querySelector("#nsa");
            const eaInp = container.querySelector("#nea");
            const cx = safeEvalMath(cxInp ? cxInp.value : 0) || 0;
            const cy = safeEvalMath(cyInp ? cyInp.value : 0) || 0;
            // Pro výpočet poloměru/úhlu potřebujeme absolutní střed
            const absCenter = isInc ? fromIncToAbs(cx, cy) : { x: cx, y: cy };
            if (i === 0) {
              // Pick středu
              if (cxInp) cxInp.value = dp.x.toFixed(3);
              if (cyInp) cyInp.value = dp.y.toFixed(3);
            } else if (i === 1) {
              // Pick bodu pro poloměr – vzdálenost od absolutního středu
              if (rInp) {
                const r = Math.hypot(wx - absCenter.x, wy - absCenter.y);
                rInp.value = r.toFixed(3);
              }
            } else if (i === 2 && saInp) {
              // Pick bodu pro start úhel
              const ang = Math.atan2(wy - absCenter.y, wx - absCenter.x) * 180 / Math.PI;
              saInp.value = ang.toFixed(2);
            } else if (i === 3 && eaInp) {
              // Pick bodu pro konec úhel
              const ang = Math.atan2(wy - absCenter.y, wx - absCenter.x) * 180 / Math.PI;
              eaInp.value = ang.toFixed(2);
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
    const currentType = typeSelect.value;
    if (currentType === 'line' || currentType === 'constr') {
      wireAngleCompass(fieldsDiv, 'nang');
    } else if (currentType === 'polyline') {
      wireAngleCompass(fieldsDiv, 'polyAng');
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

    // Rect: sync W/H ↔ X2/Z2
    function syncRectWH() {
      const nw = fieldsDiv.querySelector("#nw");
      const nh = fieldsDiv.querySelector("#nh");
      if (!nw || !nh) return;
      const x1 = safeEvalMath(fieldsDiv.querySelector("#nx1")?.value);
      const y1 = safeEvalMath(fieldsDiv.querySelector("#ny1")?.value);
      const x2f = fieldsDiv.querySelector("#nx2");
      const y2f = fieldsDiv.querySelector("#ny2");
      // W/H → X2/Z2
      nw.addEventListener("input", () => {
        const w = safeEvalMath(nw.value);
        if (isFinite(x1) && isFinite(w) && x2f) x2f.value = (x1 + w).toFixed(3);
      });
      nh.addEventListener("input", () => {
        const h = safeEvalMath(nh.value);
        if (isFinite(y1) && isFinite(h) && y2f) y2f.value = (y1 + h).toFixed(3);
      });
      // X2/Z2 → W/H
      if (x2f) x2f.addEventListener("input", () => {
        const v = safeEvalMath(x2f.value);
        if (isFinite(x1) && isFinite(v)) nw.value = (v - x1).toFixed(3);
      });
      if (y2f) y2f.addEventListener("input", () => {
        const v = safeEvalMath(y2f.value);
        if (isFinite(y1) && isFinite(v)) nh.value = (v - y1).toFixed(3);
      });
    }
    syncRectWH();

    // Polyline vertex management
    const polyAddBtn = fieldsDiv.querySelector("#polyAddVtx");
    if (polyAddBtn) {
      const vtxList = fieldsDiv.querySelector("#polyVertexList");

      // Délka/úhel sync pro konturu
      function getPolyLastVert() {
        if (polyVerts && polyVerts.length > 0) {
          return polyVerts[polyVerts.length - 1];
        }
        if (hasChain) return { x: state.numDialogChain.x, y: state.numDialogChain.y };
        return null;
      }

      function getPrevSegmentAngle() {
        const verts = polyVerts;
        if (!verts || verts.length < 2) return null;
        const p1 = verts[verts.length - 2];
        const p2 = verts[verts.length - 1];
        return Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
      }

      function isRelativeAngle() {
        const cb = fieldsDiv.querySelector("#polyRelAngle");
        return cb && cb.checked;
      }

      function updateRelAngleVisibility() {
        const label = fieldsDiv.querySelector("#polyRelAngleLabel");
        if (label) {
          label.style.display = (polyVerts && polyVerts.length >= 2) ? 'flex' : 'none';
        }
      }
      updateRelAngleVisibility();

      function updatePolyInfo() {
        const info = fieldsDiv.querySelector("#polyLineInfo");
        if (!info) return;
        const nx = safeEvalMath(fieldsDiv.querySelector("#nx")?.value);
        const ny = safeEvalMath(fieldsDiv.querySelector("#ny")?.value);
        const last = getPolyLastVert();
        if (!last || !isFinite(nx) || !isFinite(ny)) { info.textContent = ''; return; }
        const abs = isInc ? fromIncToAbs(nx, ny) : { x: nx, y: ny };
        const d = Math.hypot(abs.x - last.x, abs.y - last.y);
        const a = Math.atan2(abs.y - last.y, abs.x - last.x) * 180 / Math.PI;
        info.textContent = `Délka: ${d.toFixed(3)} mm  |  Úhel: ${a.toFixed(2)}°`;
      }

      ["#nx","#ny"].forEach(sel => {
        const inp = fieldsDiv.querySelector(sel);
        if (inp) inp.addEventListener("input", updatePolyInfo);
      });

      // Délka/úhel → info text (nepřepisuje Z/X pole)
      function syncPolyLenAng() {
        const polyLen = fieldsDiv.querySelector("#polyLen");
        const polyAng = fieldsDiv.querySelector("#polyAng");
        if (!polyLen || !polyAng) return;
        function onInput() {
          const len = safeEvalMath(polyLen.value);
          let ang = safeEvalMath(polyAng.value);
          if (!isFinite(len) || !isFinite(ang) || len <= 0) return;
          // Relativní úhel: přičíst úhel předchozího segmentu
          if (isRelativeAngle()) {
            const prevAng = getPrevSegmentAngle();
            if (prevAng !== null) ang = prevAng + ang;
          }
          // Zjistit referenční bod – buď ručně zadané Z/X, nebo poslední vertex
          const nxInp = fieldsDiv.querySelector("#nx");
          const nyInp = fieldsDiv.querySelector("#ny");
          const manualX = safeEvalMath(nxInp?.value);
          const manualY = safeEvalMath(nyInp?.value);
          let base;
          if (isFinite(manualX) && isFinite(manualY)) {
            base = isInc ? fromIncToAbs(manualX, manualY) : { x: manualX, y: manualY };
          } else {
            base = getPolyLastVert();
          }
          if (!base) return;
          const rad = (ang * Math.PI) / 180;
          const absX = base.x + len * Math.cos(rad);
          const absY = base.y + len * Math.sin(rad);
          const info = fieldsDiv.querySelector("#polyLineInfo");
          if (info) {
            const dp2 = isInc ? toDisplayCoords(absX, absY) : { x: absX, y: absY };
            info.textContent = `Délka: ${len.toFixed(3)} mm  |  Úhel: ${ang.toFixed(2)}° → ${H}${dp2.x.toFixed(3)} ${V}${dp2.y.toFixed(3)}`;
          }
        }
        polyLen.addEventListener("input", onInput);
        polyAng.addEventListener("input", onInput);
        // Při změně checkboxu přepočítat
        const relCb = fieldsDiv.querySelector("#polyRelAngle");
        if (relCb) relCb.addEventListener("change", onInput);
      }
      syncPolyLenAng();

      function updateVtxList() {
        if (polyVerts.length > 0) {
          vtxList.style.display = "";
          vtxList.innerHTML = polyVerts.map((v, vi) =>
            `<div>V${vi + 1}: ${H}${v.x.toFixed(3)} ${V}${v.y.toFixed(3)}</div>`
          ).join("");
          vtxList.scrollTop = vtxList.scrollHeight;
        }
      }

      polyAddBtn.addEventListener("click", () => {
        const nxInp = fieldsDiv.querySelector("#nx");
        const nyInp = fieldsDiv.querySelector("#ny");
        const polyLenInp = fieldsDiv.querySelector("#polyLen");
        const polyAngInp = fieldsDiv.querySelector("#polyAng");
        const vx = safeEvalMath(nxInp?.value);
        const vy = safeEvalMath(nyInp?.value);
        const lenVal = safeEvalMath(polyLenInp?.value);
        let angVal = safeEvalMath(polyAngInp?.value);
        const hasCoords = isFinite(vx) && isFinite(vy);
        const hasLenAng = isFinite(lenVal) && isFinite(angVal) && lenVal > 0;

        if (!hasCoords && !hasLenAng) return;

        if (hasCoords && hasLenAng) {
          // Obojí vyplněno → souřadnice jsou začátek, délka+úhel dá koncový bod
          // Relativní úhel spočítat PŘED přidáním startAbs (od předchozího segmentu)
          if (isRelativeAngle()) {
            const prevAng = getPrevSegmentAngle();
            if (prevAng !== null) angVal = prevAng + angVal;
          }
          const startAbs = isInc ? fromIncToAbs(vx, vy) : { x: vx, y: vy };
          polyVerts.push(startAbs);
          if (polyVerts.length > 1) polyBulges.push(0);
          showToast(`Bod ${polyVerts.length}: ${H}${startAbs.x.toFixed(2)} ${V}${startAbs.y.toFixed(2)}`);
          const rad = (angVal * Math.PI) / 180;
          const endAbs = { x: startAbs.x + lenVal * Math.cos(rad), y: startAbs.y + lenVal * Math.sin(rad) };
          polyVerts.push(endAbs);
          polyBulges.push(0);
          showToast(`Bod ${polyVerts.length}: ${H}${endAbs.x.toFixed(2)} ${V}${endAbs.y.toFixed(2)}`);
        } else if (hasCoords) {
          // Jen souřadnice → přidat jeden bod
          const abs = isInc ? fromIncToAbs(vx, vy) : { x: vx, y: vy };
          polyVerts.push(abs);
          if (polyVerts.length > 1) polyBulges.push(0);
          showToast(`Bod ${polyVerts.length}: ${H}${abs.x.toFixed(2)} ${V}${abs.y.toFixed(2)}`);
        } else if (hasLenAng) {
          // Jen délka+úhel → vypočítat od posledního vertexu
          const last = getPolyLastVert();
          if (!last) { showToast('Zadejte nejprve souřadnice bodu'); return; }
          if (isRelativeAngle()) {
            const prevAng = getPrevSegmentAngle();
            if (prevAng !== null) angVal = prevAng + angVal;
          }
          const rad = (angVal * Math.PI) / 180;
          const endAbs = { x: last.x + lenVal * Math.cos(rad), y: last.y + lenVal * Math.sin(rad) };
          polyVerts.push(endAbs);
          if (polyVerts.length > 1) polyBulges.push(0);
          showToast(`Bod ${polyVerts.length}: ${H}${endAbs.x.toFixed(2)} ${V}${endAbs.y.toFixed(2)}`);
        }

        updateVtxList();
        // Zobrazit checkbox pro relativní úhel po 2+ bodech
        updateRelAngleVisibility();
        // Vyčistit všechna pole po přidání bodu pro další zadávání
        if (nxInp) nxInp.value = '';
        if (nyInp) nyInp.value = '';
        if (polyLenInp) polyLenInp.value = '';
        if (polyAngInp) polyAngInp.value = '';
        const info = fieldsDiv.querySelector("#polyLineInfo");
        if (info) info.textContent = '';
        // Fokus na první pole pro rychlé zadání dalšího bodu
        if (nxInp) nxInp.focus();
      });
      updateVtxList();
    }

    // Živý náhled – nové HTML, nové hodnoty (výchozí i chain-ové).
    scheduleNumPreview();
  }

  /** Toast „Pokračování od X.. Z.." – při otevření okna i po každém dalším prvku. */
  function announceChainContinuation() {
    if (hasChain) {
      showToast(`Pokračování od ${H}${state.numDialogChain.x.toFixed(2)} ${V}${state.numDialogChain.y.toFixed(2)}`);
    }
  }

  typeSelect.addEventListener("change", updateFields);
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
        case "rect": {
          const g = readFormGeometry();
          if (!g.valid) { showToast("Zadejte druhý roh (X2/Z2, nebo Šířka a Výška)"); return false; }
          addRectAsSegments(g.x1, g.y1, g.x2, g.y2);
          state.numDialogChain = { x: g.x2, y: g.y2 };
          break;
        }
        case "polyline": {
          const verts = polyVerts || [];
          if (verts.length < 2) {
            showToast("Kontura potřebuje alespoň 2 body");
            return false;
          }
          const closed = container.querySelector("#polyClosed")?.checked || false;
          const bulges = polyBulges || [];
          while (bulges.length < (closed ? verts.length : verts.length - 1)) bulges.push(0);
          addPolylineAsSegments(verts.slice(), bulges.slice(0, closed ? verts.length : verts.length - 1), closed);
          const lastV = verts[verts.length - 1];
          state.numDialogChain = { x: lastV.x, y: lastV.y };
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
    if (!createObject()) return;
    picker?.cancel();
    // Kontura se zadává přírůstkově přes „Přidat bod" – po vložení hotové
    // kontury začít napočisto, jinak by se do dalšího „Vytvořit" vlekly
    // vrcholy té předchozí.
    if (typeSelect.value === 'polyline') { polyVerts = []; polyBulges = []; }
    updateFields();
    announceChainContinuation();
  }

  // Vytvořit – okno zůstává otevřené, pokračuje se dalším prvkem
  container.querySelector("#numOk").addEventListener("click", createAnother);

  // Zrušit – tohle konturu ukončí a okno zavře
  container.querySelector("#numCancel").addEventListener("click", () => {
    state.numDialogChain = { x: null, y: null };
    picker?.cancel();
    root.remove();
  });

  container.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName === "INPUT") {
      createAnother();
    }
    // ESC okno nezavírá (plovoucí režim – patří nástroji na plátně),
    // jen odzbrojí rozdělaný 🎯 výběr bodu.
    if (e.key === "Escape") picker?.cancel();
  });

  return {
    destroy() {
      // Rozdělaný odběr kliku na plátno by jinak přežil zavření okna.
      picker?.cancel();
      document.querySelector('.angle-compass-popup')?.remove();
    },
  };
}
