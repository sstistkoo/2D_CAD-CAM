// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Dialogy / Polární kreslení z bodu                ║
// ╚══════════════════════════════════════════════════════════════╝

import { COLORS, SNAP_POINT_THRESHOLD } from '../constants.js';
import { makeInputOverlay, onOverlayRemoved } from '../dialogFactory.js';
import { state, showToast, axisLabels } from '../state.js';
import { addObject } from '../objects.js';
import { screenToWorld, snapPt, drawCanvas } from '../canvas.js';
import { safeEvalMath, bulgeToArc } from '../utils.js';
import { findObjectAt, findSegmentAt, intersectLineLine, intersectLineCircle, getPolylineSegmentAsLine, calculateAllIntersections } from '../geometry.js';
import { renderAll } from '../render.js';
import { refreshToolbarActive } from '../ui.js';
import { bridge } from '../bridge.js';

// ── Polární kreslení z referenčního bodu ──
document
  .getElementById("btnPolar")
  .addEventListener("click", showPolarDrawingDialog);

// Zapamatování posledně použitých hodnot (Délka/Úhel/Typ/Ukončení/Řetězit) –
// dialog se pak neotevírá pořád s výchozími hodnotami, ale s tím, co uživatel
// naposled zadal (podobně jako `lineStyle` v lineStyles.js).
const POLAR_LS_KEY = 'skica-polar-prefs';

function loadPolarPrefs() {
  try {
    const raw = localStorage.getItem(POLAR_LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function savePolarPrefs(prefs) {
  try { localStorage.setItem(POLAR_LS_KEY, JSON.stringify(prefs)); } catch { /* localStorage nedostupné */ }
}

// Aktuálně otevřený/skrytý dialog (max jeden najednou) – umožňuje setTool()
// v ui.js dialog zrušit, když uživatel klikne na jiný kreslicí nástroj
// (viz bridge.cancelPolarPicking). `_activeStop` obnoví `state.tool` na
// hodnotu před „Tečnost" SYNCHRONNĚ (dřív, než setTool() pokračuje dál –
// jinak by např. auto-uložení rozkreslené kontury při přepnutí nástroje
// nepoznalo, že `state.tool` byl ve skutečnosti „polyline").
let _openOverlay = null;
let _activeStop = null;
bridge.cancelPolarPicking = () => {
  if (_activeStop) _activeStop();
  if (_openOverlay && document.body.contains(_openOverlay)) _openOverlay.remove();
};

// Poslední úsečka vytvořená „➕ Přidat"/„🎯 Tečnost" – MODULOVÁ úroveň (ne
// jen v rámci jednoho otevření dialogu), protože běžný postup je zavřít
// dialog a znovu ho otevřít jen kvůli změně úhlu. Kdyby se tohle sledování
// resetovalo při každém otevření, „zkouším úhel na stejném místě" by pořád
// zakládalo novou úsečku vedle staré, místo aby tu předchozí nahradilo –
// přesně to hromadění, které jde odstranit jen refreshem stránky.
let _lastAddLine = null;
let _lastAddRefKey = null;
let _lastAddTime = 0;
let _lastPick = null;

// Bezpečnostní okno pro nahrazení – bez něj by např. dvě zcela nesouvisející
// úsečky založené s prázdným výběrem (ref. bod defaultně 0,0) o hodiny/dny
// později mohly tiše splynout jen kvůli shodě souřadnic. „Zkouším úhel na
// stejném místě" se odehrává v řádu sekund/minut, ne déle.
const REPLACE_WINDOW_MS = 5 * 60 * 1000;

/**
 * Najde nejbližší průsečík paprsku (sx,sy) → směr (dx,dy) s ostatní geometrií.
 * @param {number} sx
 * @param {number} sy
 * @param {number} dx jednotkový směrový vektor
 * @param {number} dy jednotkový směrový vektor
 * @param {number|null} excludeIdx index objektu, který se nemá testovat (např. tečnovaná kružnice)
 * @returns {{x:number,y:number}|null}
 */
function findRayIntersection(sx, sy, dx, dy, excludeIdx) {
  const ray = { x1: sx, y1: sy, x2: sx + dx, y2: sy + dy, isConstr: true };
  let best = null, bestT = Infinity;

  const consider = (pt) => {
    const t = (pt.x - sx) * dx + (pt.y - sy) * dy;
    if (t > 1e-6 && t < bestT) { bestT = t; best = pt; }
  };

  state.objects.forEach((obj, idx) => {
    if (idx === excludeIdx) return;
    const layer = state.layers.find(l => l.id === obj.layer);
    if (layer && (layer.locked || !layer.visible)) return;

    if (obj.type === 'line' || obj.type === 'constr') {
      for (const pt of intersectLineLine(ray, { x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 })) consider(pt);
    } else if (obj.type === 'circle' || obj.type === 'arc') {
      for (const pt of intersectLineCircle(ray, obj)) consider(pt);
    } else if (obj.type === 'polyline') {
      const n = obj.vertices.length;
      const segCount = obj.closed ? n : n - 1;
      for (let i = 0; i < segCount; i++) {
        const bulge = (obj.bulges && obj.bulges[i]) || 0;
        if (bulge === 0) {
          const seg = getPolylineSegmentAsLine(obj, i);
          if (seg) for (const pt of intersectLineLine(ray, seg)) consider(pt);
        } else {
          const p1 = obj.vertices[i], p2 = obj.vertices[(i + 1) % n];
          const arc = bulgeToArc(p1, p2, bulge);
          if (arc) for (const pt of intersectLineCircle(ray, arc)) consider(pt);
        }
      }
    }
  });

  return best;
}

/** Otevře dialog pro polární kreslení (délka + úhel) nebo úsečku pod úhlem. */
export function showPolarDrawingDialog() {
  // Případnou už otevřenou (třeba jen skrytou, uprostřed „Tečnost" klikání)
  // relaci nejdřív zrušit – jinak by na plátně zůstaly viset staré
  // posluchače kliků VEDLE nových (jeden klik pak vytvoří dvě úsečky, každou
  // pod jiným úhlem) a vstupní pole by vypadala, že se „vynulovala", protože
  // jde ve skutečnosti o úplně novou instanci dialogu s výchozími hodnotami.
  bridge.cancelPolarPicking();

  let refX = 0,
    refZ = 0;
  // V INC režimu použít incReference jako výchozí referenční bod
  if (state.coordMode === 'inc') {
    refX = state.incReference.x;
    refZ = state.incReference.y;
  }
  if (state.selected !== null) {
    const sel = state.objects[state.selected];
    if (sel.type === "point") {
      refX = sel.x;
      refZ = sel.y;
    } else if (sel.type === "line" || sel.type === "constr") {
      refX = sel.x2;
      refZ = sel.y2;
    } else if (sel.type === "circle" || sel.type === "arc") {
      refX = sel.cx;
      refZ = sel.cy;
    }
  }

  // Naposled zadané hodnoty (Délka/Úhel/Typ/Ukončení/Řetězit) – dialog se
  // pak neotevírá pořád od nuly.
  const prefs = loadPolarPrefs();
  const defLen = prefs.len ?? '10';
  const defAng = prefs.ang ?? '0';
  const defType = prefs.type ?? 'line';
  const defAngMode = prefs.angMode ?? 'length';
  const defChain = !!prefs.chain;

  const overlay = makeInputOverlay(`
    <div class="input-dialog" style="min-width:460px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <h3 style="margin:0">📐 Polární / Úhel</h3>
        <button class="btn-cancel" id="polClose" style="padding:4px 8px;font-size:16px">✕</button>
      </div>
      <label>Referenční bod:</label>
      <div class="input-row">
        <div><label>${axisLabels()[0]}:</label><input type="text" id="polRefX" value="${refX}"></div>
        <div><label>${axisLabels()[1]}:</label><input type="text" id="polRefZ" value="${refZ}"></div>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">
        <button class="btn-ok" id="polMarkRef" style="font-size:16px;padding:4px 8px" title="Označit ref. bod">📍</button>
        <button class="btn-ok" id="polFromSelected" style="font-size:16px;padding:4px 8px;background:${COLORS.dimension};border-color:${COLORS.dimension}" title="Z vybraného objektu">📌</button>
        <button class="btn-ok" id="polPickFromMap" style="font-size:16px;padding:4px 8px;background:${COLORS.selected};border-color:${COLORS.selected};color:${COLORS.bgDark}" title="Kliknout z výkresu">🎯</button>
      </div>
      <hr style="border-color:${COLORS.surfaceHover};margin:8px 0">
      <label>Segment (polární souřadnice od ref. bodu):</label>
      <div class="input-row">
        <div><label>Délka:</label><input type="text" id="polLen" value="${defLen}"></div>
        <div><label>Úhel (°):</label><input type="text" id="polAng" value="${defAng}"></div>
      </div>
      <div class="input-row">
        <div><label>Typ:</label>
          <select id="polType" style="width:100%">
            <option value="line"${defType === 'line' ? ' selected' : ''}>Úsečka</option>
            <option value="constr"${defType === 'constr' ? ' selected' : ''}>Konstrukční čára</option>
            <option value="point"${defType === 'point' ? ' selected' : ''}>Bod (na konci)</option>
          </select>
        </div>
        <button class="btn-ok" id="polAdd" style="height:100%;margin-top:18px">➕ Přidat</button>
      </div>
      <div style="display:flex;align-items:center;gap:4px;margin-bottom:10px">
        <label style="font-size:11px;display:flex;align-items:center;gap:4px;cursor:pointer;white-space:nowrap">
          <input type="checkbox" id="polChain"${defChain ? ' checked' : ''}> Řetězit (konec → nový ref.)
        </label>
      </div>
      <hr style="border-color:${COLORS.surfaceHover};margin:8px 0">
      <p style="font-size:11px;color:${COLORS.textMuted};margin:4px 0">Tečna napojení na kružnici/oblouk</p>
      <div class="input-row">
        <div><label>Ukončení:</label>
          <select id="angMode" style="width:100%">
            <option value="length"${defAngMode === 'length' ? ' selected' : ''}>Zadaná délka</option>
            <option value="intersect"${defAngMode === 'intersect' ? ' selected' : ''}>Do průsečíku</option>
          </select>
        </div>
        <button class="btn-ok" id="angPick" title="Vybrat bod / kružnici" style="height:100%;margin-top:18px">🎯 Tečnost</button>
      </div>
      <div id="polHistory" style="max-height:120px;overflow-y:auto;font-size:11px;font-family:Consolas;color:${COLORS.label};margin:8px 0;padding:4px;background:${COLORS.bgDarker};border-radius:4px;display:none"></div>
    </div>`);

  // Dialog nemění `state.tool` (Přidat/Tečnost fungují nezávisle na
  // aktuálním nástroji), ale tlačítko dosud aktivního nástroje (např.
  // Kružnice) by jinak zůstalo vizuálně zvýrazněné, jako by se do
  // Polární/Úhel vůbec nepřepnulo. Označit „Polární" a ostatní vypnout;
  // po zavření dialogu se zvýraznění vrátí k aktuálnímu `state.tool`.
  document.querySelectorAll('[data-tool].active').forEach(b => b.classList.remove('active'));
  const polarBtn = document.getElementById('btnPolar');
  polarBtn?.classList.add('active');
  _openOverlay = overlay;
  // `stopAnglePicking` je function-deklarace (hoisted) – bezpečné odkázat se
  // na ni už tady, přestože je definovaná níž v téhle funkci.
  _activeStop = stopAnglePicking;
  onOverlayRemoved(overlay, () => {
    // Když dialog úplně zmizí – Escape/klik mimo, NEBO uživatel mezitím
    // (v tichém „Tečnost" režimu) klikl na jiný kreslicí nástroj v liště
    // (setTool() pak zavolá bridge.cancelPolarPicking, které už `_activeStop`
    // spustilo synchronně) – odhlásit případně stále aktivní posluchače na
    // canvasu a vrátit `state.tool` na hodnotu před zahájením „Tečnost".
    // Pokud si `state.tool` mezitím převzal jiný nástroj, návrat se
    // přeskočí (viz guard uvnitř stopAnglePicking) – nová volba má přednost.
    _openOverlay = null;
    _activeStop = null;
    stopAnglePicking();
    polarBtn?.classList.remove('active');
    refreshToolbarActive();
  });

  const polRefX = overlay.querySelector("#polRefX");
  const polRefZ = overlay.querySelector("#polRefZ");
  const polLen = overlay.querySelector("#polLen");
  const polAng = overlay.querySelector("#polAng");
  const polType = overlay.querySelector("#polType");
  const polChain = overlay.querySelector("#polChain");
  const polHistory = overlay.querySelector("#polHistory");
  const angMode = overlay.querySelector("#angMode");

  /** Uloží aktuální hodnoty polí, aby se při dalším otevření nabídly znovu. */
  function persistCurrentPrefs() {
    savePolarPrefs({
      len: polLen.value,
      ang: polAng.value,
      type: polType.value,
      angMode: angMode.value,
      chain: polChain.checked,
    });
  }

  let segCount = 0;
  // Poslední řádek historie v TÉHLE instanci dialogu (na rozdíl od
  // _lastAddLine/_lastPick jde o DOM element – při novém otevření dialogu
  // (nové HTML) nemá smysl přenášet, prostě se založí čerstvý řádek).
  let _lastAddHistoryDiv = null;

  overlay.querySelector("#polMarkRef").addEventListener("click", () => {
    const rx = safeEvalMath(polRefX.value);
    const rz = safeEvalMath(polRefZ.value);
    if (isNaN(rx) || isNaN(rz)) return;
    addObject({
      type: "point",
      x: rx,
      y: rz,
      name: `Ref ${state.nextId}`,
    });
    showToast(`Referenční bod ${axisLabels()[0]}${rx} ${axisLabels()[1]}${rz} vytvořen`);
  });

  overlay
    .querySelector("#polFromSelected")
    .addEventListener("click", () => {
      if (state.selected === null) {
        showToast("Žádný vybraný objekt");
        return;
      }
      const sel = state.objects[state.selected];
      if (sel.type === "point") {
        polRefX.value = sel.x;
        polRefZ.value = sel.y;
      } else if (sel.type === "line" || sel.type === "constr") {
        polRefX.value = sel.x2;
        polRefZ.value = sel.y2;
      } else if (sel.type === "circle" || sel.type === "arc") {
        polRefX.value = sel.cx;
        polRefZ.value = sel.cy;
      } else if (sel.type === "rect") {
        polRefX.value = sel.x1;
        polRefZ.value = sel.y1;
      }
      showToast("Ref. bod načten z vybraného objektu");
    });

  // Pick referenčního bodu kliknutím na výkres
  let _polPickCleanup = null;
  overlay.querySelector("#polPickFromMap").addEventListener("click", () => {
    overlay.style.display = "none";
    showToast("Klikněte na výkres pro výběr ref. bodu...");

    function cleanup() {
      drawCanvas.removeEventListener("click", onPick);
      drawCanvas.removeEventListener("touchend", onTouch);
      _polPickCleanup = null;
    }

    function onPick(e) {
      const rect = drawCanvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      let [wx, wy] = screenToWorld(sx, sy);
      if (state.snapToPoints) [wx, wy] = snapPt(wx, wy);
      cleanup();
      polRefX.value = parseFloat(wx.toFixed(3));
      polRefZ.value = parseFloat(wy.toFixed(3));
      overlay.style.display = "flex";
      showToast(`Ref. bod nastaven: ${axisLabels()[0]}${polRefX.value} ${axisLabels()[1]}${polRefZ.value}`);
    }

    function onTouch(e) {
      if (e.changedTouches.length === 1) {
        const t = e.changedTouches[0];
        const rect = drawCanvas.getBoundingClientRect();
        const sx = t.clientX - rect.left;
        const sy = t.clientY - rect.top;
        let [wx, wy] = screenToWorld(sx, sy);
        if (state.snapToPoints) [wx, wy] = snapPt(wx, wy);
        cleanup();
        polRefX.value = parseFloat(wx.toFixed(3));
        polRefZ.value = parseFloat(wy.toFixed(3));
        overlay.style.display = "flex";
        e.preventDefault();
        showToast(`Ref. bod nastaven: ${axisLabels()[0]}${polRefX.value} ${axisLabels()[1]}${polRefZ.value}`);
      }
    }

    drawCanvas.addEventListener("click", onPick);
    drawCanvas.addEventListener("touchend", onTouch);
    _polPickCleanup = cleanup;
  });

  overlay.querySelector("#polAdd").addEventListener("click", () => {
    const rx = safeEvalMath(polRefX.value);
    const rz = safeEvalMath(polRefZ.value);
    const len = safeEvalMath(polLen.value);
    const angDeg = safeEvalMath(polAng.value);
    if (
      isNaN(rx) ||
      isNaN(rz) ||
      isNaN(len) ||
      isNaN(angDeg) ||
      len <= 0
    ) {
      showToast("Zkontrolujte hodnoty (délka musí být > 0)");
      return;
    }

    // Úhel s offsetem od natočeného nulového bodu
    const angleOffset = (state.nullPointActive && state.nullPointAngle !== 0)
      ? (state.nullPointAngle * Math.PI / 180) : 0;
    const rad = (angDeg * Math.PI) / 180 + angleOffset;
    const endX = rx + len * Math.cos(rad);
    const endZ = rz + len * Math.sin(rad);
    const typ = polType.value;

    const historyLine = `#${segCount + 1}: ${axisLabels()[0]}${rx.toFixed(2)} ${axisLabels()[1]}${rz.toFixed(2)} → d=${len} ∠${angDeg}° → ${axisLabels()[0]}${endX.toFixed(2)} ${axisLabels()[1]}${endZ.toFixed(2)}`;

    if (typ === "point") {
      addObject({
        type: "point",
        x: endX,
        y: endZ,
        name: `Bod ${state.nextId}`,
      });
      _lastAddLine = null;
      _lastAddRefKey = null;
    } else {
      const refKey = `${typ}:${rx}:${rz}`;
      if (_lastAddLine && _lastAddRefKey === refKey && state.objects.includes(_lastAddLine)
          && Date.now() - _lastAddTime <= REPLACE_WINDOW_MS) {
        // Stejný ref. bod jako minule (jen jiná délka/úhel) – upravit
        // předchozí úsečku místo přidání dalšího paprsku ze stejného bodu.
        // ÚMYSLNĚ bez pushUndo() – původní vytvoření úsečky (addObject níž)
        // už jeden snapshot uložilo („před touhle úsečkou“); kdyby se před
        // KAŽDOU úpravou úhlu ukládal další, jedno „Zpět“ by vracelo jen
        // poslední zkoušený úhel místo celé úsečky najednou.
        _lastAddLine.x2 = endX;
        _lastAddLine.y2 = endZ;
        _lastAddTime = Date.now();
        calculateAllIntersections();
        renderAll();
        if (_lastAddHistoryDiv) {
          _lastAddHistoryDiv.textContent = historyLine;
        } else {
          // Nahrazovaná úsečka pochází z dřívějšího otevření dialogu (nové
          // HTML nemá odpovídající řádek) – založit v TÉHLE instanci nový.
          segCount++;
          polHistory.style.display = "";
          const div = document.createElement('div');
          div.textContent = historyLine;
          polHistory.appendChild(div);
          _lastAddHistoryDiv = div;
        }
      } else {
        _lastAddLine = addObject({
          type: typ === "constr" ? "constr" : "line",
          x1: rx,
          y1: rz,
          x2: endX,
          y2: endZ,
          name: `${typ === "constr" ? "Konstr" : "Úsečka"} ${state.nextId}`,
          dashed: typ === "constr",
        });
        _lastAddRefKey = refKey;
        _lastAddTime = Date.now();
        segCount++;
        polHistory.style.display = "";
        const div = document.createElement('div');
        div.textContent = historyLine;
        polHistory.appendChild(div);
        _lastAddHistoryDiv = div;
      }
    }
    polHistory.scrollTop = polHistory.scrollHeight;

    if (polChain.checked) {
      polRefX.value = endX.toFixed(3);
      polRefZ.value = endZ.toFixed(3);
    }

    polLen.focus();
    polLen.select();
    persistCurrentPrefs();
    showToast(`Segment #${segCount} přidán`);
  });

  overlay
    .querySelector("#polClose")
    .addEventListener("click", () => { 
      if (_polPickCleanup) _polPickCleanup(); 
      if (_angPickCleanup) _angPickCleanup();
      overlay.remove(); 
    });

  // Funkcionalita pro režim Úhel
  let _angPickCleanup = null;
  // Nástroj aktivní PŘED zahájením „Tečnost" klikání (např. rozpracovaná
  // kontura) – po dobu klikání na canvasu se `state.tool` dočasně přepne na
  // neutrální hodnotu, aby souběžný obecný handler kliku (mousedown) klik
  // nesměroval do původního nástroje (jinak se úsečka pod úhlem vytvoří,
  // ALE zároveň se klik započítá i jako další bod rozkreslené kontury).
  let _prevToolBeforePick = null;

  function stopAnglePicking() {
    if (_angPickCleanup) _angPickCleanup();
    if (_prevToolBeforePick !== null) {
      // Obnovit jen když si `state.tool` mezitím nepřevzal jiný nástroj
      // (klik na Kružnici/Kontura/... v liště zavolá setTool() dřív, než
      // sem dorazí úklid – v tom případě má nová volba přednost).
      if (state.tool === '__polarAnglePick') state.tool = _prevToolBeforePick;
      _prevToolBeforePick = null;
    }
  }

  overlay.querySelector("#angPick").addEventListener("click", () => {
    const angDeg = safeEvalMath(polAng.value);
    const mode = angMode.value;
    let length = 0;
    if (mode === 'length') {
      length = safeEvalMath(polLen.value);
      if (isNaN(length) || length <= 0) {
        showToast("Délka musí být > 0");
        return;
      }
    }
    if (isNaN(angDeg)) {
      showToast("Zkontrolujte úhel");
      return;
    }

    const angleOffset = (state.nullPointActive && state.nullPointAngle !== 0)
      ? (state.nullPointAngle * Math.PI / 180) : 0;
    const rad = (angDeg * Math.PI) / 180 + angleOffset;
    const dirX = Math.cos(rad), dirY = Math.sin(rad);

    // Opakovaný klik na „Tečnost" v RÁMCI stejného dialogu (např. po úpravě
    // úhlu, nebo po „Žádný průsečík..." zprávě) jinak nechá viset posluchače
    // z PŘEDCHOZÍHO kliku na canvasu vedle těch nových – jeden klik pak
    // vytvoří úsečku za každý dosud neuklizený pokus najednou.
    if (_angPickCleanup) _angPickCleanup();

    if (_prevToolBeforePick === null) _prevToolBeforePick = state.tool;
    state.tool = '__polarAnglePick';
    overlay.style.display = "none";
    showToast("Klikněte na bod, nebo na kružnici/oblouk pro tečnu...");

    function cleanup() {
      drawCanvas.removeEventListener("click", onPick);
      drawCanvas.removeEventListener("touchend", onTouch);
      _angPickCleanup = null;
    }

    function processPick(wx, wy) {
      if (state.snapToPoints) [wx, wy] = snapPt(wx, wy);

      let startX = wx, startY = wy, excludeIdx = null;

      const idx = findObjectAt(wx, wy);
      let circ = null;
      if (idx !== null) {
        const obj = state.objects[idx];
        if (obj.type === 'circle' || obj.type === 'arc') {
          circ = { cx: obj.cx, cy: obj.cy, r: obj.r };
          excludeIdx = idx;
        } else if (obj.type === 'polyline') {
          const segIdx = findSegmentAt(obj, wx, wy);
          if (segIdx != null) {
            const bulge = (obj.bulges && obj.bulges[segIdx]) || 0;
            if (bulge !== 0) {
              const p1 = obj.vertices[segIdx];
              const p2 = obj.vertices[(segIdx + 1) % obj.vertices.length];
              const arc = bulgeToArc(p1, p2, bulge);
              if (arc) circ = { cx: arc.cx, cy: arc.cy, r: arc.r };
            }
          }
        }
      }

      if (circ) {
        const nx = -dirY, ny = dirX;
        const t1 = { x: circ.cx + circ.r * nx, y: circ.cy + circ.r * ny };
        const t2 = { x: circ.cx - circ.r * nx, y: circ.cy - circ.r * ny };
        const d1 = Math.hypot(wx - t1.x, wy - t1.y);
        const d2 = Math.hypot(wx - t2.x, wy - t2.y);
        const t = d1 <= d2 ? t1 : t2;
        startX = t.x; startY = t.y;
      }

      let endX, endY;
      if (mode === 'length') {
        endX = startX + dirX * length;
        endY = startY + dirY * length;
      } else {
        const hit = findRayIntersection(startX, startY, dirX, dirY, excludeIdx);
        if (!hit) {
          showToast("Žádný průsečík ve směru úhlu nenalezen");
          // Ukončit klikání (ne nechat viset posluchač na canvasu do
          // neurčita) – další pokus vyžaduje nový klik na „Tečnost".
          stopAnglePicking();
          overlay.style.display = "flex";
          return;
        }
        endX = hit.x; endY = hit.y;
      }

      // Klik blízko místa, kam se kliklo minule (typicky: upravil se jen
      // úhel a zkouší se to znovu na stejném místě) → nahradit tu úsečku
      // místo přidání dalšího paprsku vedle ní.
      const tol = SNAP_POINT_THRESHOLD / state.zoom;
      if (_lastPick && state.objects.includes(_lastPick.obj)
          && Math.hypot(startX - _lastPick.startX, startY - _lastPick.startY) <= tol
          && Date.now() - _lastPick.time <= REPLACE_WINDOW_MS) {
        // ÚMYSLNĚ bez pushUndo() – viz stejná poznámka u „➕ Přidat" výš.
        _lastPick.obj.x1 = startX; _lastPick.obj.y1 = startY;
        _lastPick.obj.x2 = endX; _lastPick.obj.y2 = endY;
        calculateAllIntersections();
        renderAll();
        _lastPick.startX = startX; _lastPick.startY = startY;
        _lastPick.time = Date.now();
      } else {
        const obj = addObject({
          type: 'line',
          x1: startX, y1: startY, x2: endX, y2: endY,
          name: `Úhel ${state.nextId}`,
        });
        _lastPick = { obj, startX, startY, time: Date.now() };
      }
      persistCurrentPrefs();
      // „Tečnost" zůstává aktivní (dialog schovaný, NE znovu zavřený ani
      // znovu vyskakující) – další klik na canvasu rovnou umístí další
      // úsečku pod stejným úhlem. Tlačítko „Polární" v liště zůstává
      // zvýrazněné jako vizuální připomínka, že je pořád aktivní. Skončí
      // se buď klávesou Esc, nebo přepnutím na jiný nástroj v liště
      // (setTool() ho přes bridge.cancelPolarPicking zruší).
      drawCanvas.addEventListener("click", onPick);
      drawCanvas.addEventListener("touchend", onTouch);
      _angPickCleanup = cleanup;
      showToast(`Úsečka pod úhlem ${angDeg}° vytvořena ✓ – klikněte pro další (Esc = konec)`);
    }

    function onPick(e) {
      const rect = drawCanvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const [wx, wy] = screenToWorld(sx, sy);
      cleanup();
      processPick(wx, wy);
    }

    function onTouch(e) {
      if (e.changedTouches.length === 1) {
        const tch = e.changedTouches[0];
        const rect = drawCanvas.getBoundingClientRect();
        const sx = tch.clientX - rect.left;
        const sy = tch.clientY - rect.top;
        const [wx, wy] = screenToWorld(sx, sy);
        cleanup();
        e.preventDefault();
        processPick(wx, wy);
      }
    }

    drawCanvas.addEventListener("click", onPick);
    drawCanvas.addEventListener("touchend", onTouch);
    _angPickCleanup = cleanup;
  });

  overlay.addEventListener("keydown", (e) => {
    // Enter potvrzuje „➕ Přidat" JEN ve vlastních polích segmentu
    // (referenční bod) – Délka a Úhel jsou sdílené i s „🎯 Tečnost", takže
    // Enter po zadání úhlu tam by potvrdil Přidat, i když uživatel chtěl
    // ve skutečnosti kliknout Tečnost → vznikly by dvě úsečky najednou.
    if (e.key === "Enter" && (e.target === polRefX || e.target === polRefZ)) {
      overlay.querySelector("#polAdd").click();
    }
    if (e.key === "Escape") {
      if (_polPickCleanup) _polPickCleanup();
      if (_angPickCleanup) _angPickCleanup();
      overlay.remove();
    }
  });

  polLen.focus();
}
