// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Trasování profilu (Profile Trace)                 ║
// ║  Multi-click nástroj pro sběr souřadnic po kontuře         ║
// ╚══════════════════════════════════════════════════════════════╝

import { COLORS } from '../constants.js';
import { state, showToast, toDisplayCoords, axisLabels, displayX, inputX, xPrefix, coordHelpers, pushUndo } from '../state.js';
import { renderAll } from '../render.js';
import { resetHint, setHint, updateObjectList } from '../ui.js';
import { makeOverlay } from '../dialogFactory.js';
import { showBulgeDialog } from '../dialogs/bulge.js';
import { bulgeToArc, radiusToBulge, safeEvalMath } from '../utils.js';
import { calculateAllIntersections } from '../geometry.js';

// ── Interní stav trasování ──
let _tracePoints = [];
let _traceSegments = [];
let _traceBulges = [];   // bulge pro každý segment (0 = rovný)
let _traceOverlay = null;
let _selectedTraceIdx = -1; // vybraný bod/segment v panelu

/**
 * Vypočte I a K pro obloukový segment.
 * I = inkrementální vzdálenost startbod→střed v ose X.
 * K = inkrementální vzdálenost startbod→střed v ose Z.
 * @returns {{I: number, K: number}|null}
 */
function _calcIK(segIdx) {
  if (segIdx < 0 || segIdx >= _traceSegments.length) return null;
  const seg = _traceSegments[segIdx];
  if (seg.centerX == null || seg.centerY == null) return null;
  const start = _tracePoints[segIdx];
  const isKarusel = state.machineType === 'karusel';
  // wx = vodorovná osa, wy = svislá osa v editoru
  // Soustruh: X = wy (svislá), Z = wx (vodorovná) → I je delta wy, K je delta wx
  // Karusel:  X = wx (vodorovná), Z = wy (svislá) → I je delta wx, K je delta wy
  const dcx = seg.centerX - start.x; // delta ve world X (vodorovná)
  const dcy = seg.centerY - start.y; // delta ve world Y (svislá)
  if (isKarusel) {
    return { I: displayX(dcx), K: dcy };
  } else {
    return { I: displayX(dcy), K: dcx };
  }
}

/**
 * Analyzuje segment mezi dvěma body – pokud leží na objektu (oblouk),
 * vrací info o tom. Respektuje manuální bulge.
 */
function _analyzeSegment(p1, p2, bulge) {
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const angle = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;

  // Pokud je manuální bulge, použít ho
  if (bulge && bulge !== 0) {
    const arc = bulgeToArc(p1, p2, bulge);
    if (arc) {
      return {
        segType: bulge < 0 ? 'G02' : 'G03',
        dist, angle,
        radius: arc.r,
        centerX: arc.cx,
        centerY: arc.cy,
      };
    }
  }

  // Zkusit najít oblouk/kružnici, na které leží OBA body
  const tol = Math.max(15 / state.zoom, 2);
  let segType = 'G01';
  let radius = null;
  let centerX = null;
  let centerY = null;

  for (let i = 0; i < state.objects.length; i++) {
    const obj = state.objects[i];
    // Skip locked/invisible layers
    const layer = state.layers.find(l => l.id === obj.layer);
    if (layer && (layer.locked || !layer.visible)) continue;

    if (obj.type === 'circle') {
      const d1 = Math.abs(Math.hypot(p1.x - obj.cx, p1.y - obj.cy) - obj.r);
      const d2 = Math.abs(Math.hypot(p2.x - obj.cx, p2.y - obj.cy) - obj.r);
      if (d1 < tol && d2 < tol) {
        segType = _isClockwise(p1, p2, { x: obj.cx, y: obj.cy }) ? 'G02' : 'G03';
        radius = obj.r;
        centerX = obj.cx;
        centerY = obj.cy;
        break;
      }
    } else if (obj.type === 'arc') {
      const d1 = Math.abs(Math.hypot(p1.x - obj.cx, p1.y - obj.cy) - obj.r);
      const d2 = Math.abs(Math.hypot(p2.x - obj.cx, p2.y - obj.cy) - obj.r);
      if (d1 < tol && d2 < tol) {
        segType = _isClockwise(p1, p2, { x: obj.cx, y: obj.cy }) ? 'G02' : 'G03';
        radius = obj.r;
        centerX = obj.cx;
        centerY = obj.cy;
        break;
      }
    } else if (obj.type === 'polyline') {
      const arc = _findPolylineArcForPoints(obj, p1, p2, tol);
      if (arc) {
        segType = _isClockwise(p1, p2, { x: arc.cx, y: arc.cy }) ? 'G02' : 'G03';
        radius = arc.r;
        centerX = arc.cx;
        centerY = arc.cy;
        break;
      }
    }
  }

  return { segType, dist, angle, radius, centerX, centerY };
}

/**
 * Určí, zda oblouk z p1 do p2 kolem centra je CW (G02).
 */
function _isClockwise(p1, p2, center) {
  const cross = (p1.x - center.x) * (p2.y - center.y) -
                (p1.y - center.y) * (p2.x - center.x);
  return cross < 0;
}

/**
 * Najde obloukový segment polyline, na kterém leží oba body.
 */
function _findPolylineArcForPoints(poly, p1, p2, tol) {
  const verts = poly.vertices || [];
  const bulges = poly.bulges || [];
  for (let i = 0; i < verts.length - 1; i++) {
    const b = bulges[i] || 0;
    if (b === 0) continue;
    const arc = bulgeToArc(verts[i], verts[i + 1], b);
    if (!arc) continue;
    const d1 = Math.abs(Math.hypot(p1.x - arc.cx, p1.y - arc.cy) - arc.r);
    const d2 = Math.abs(Math.hypot(p2.x - arc.cx, p2.y - arc.cy) - arc.r);
    if (d1 < tol && d2 < tol) return arc;
  }
  return null;
}

/**
 * Hlavní click handler pro trasování profilu.
 */
export function handleProfileTraceClick(wx, wy) {
  if (!state.drawing) {
    // První bod – start trasování
    _tracePoints = [{ x: wx, y: wy }];
    _traceSegments = [];
    _traceBulges = [];
    state.drawing = true;
    state.tempPoints = [{ x: wx, y: wy }];
    state._profileTraceBulges = _traceBulges;
    setHint('Trasování: klepněte na další bod (R = radius, Enter = dokončit)');
    showToast('Trasování profilu zahájeno');
    renderAll();
    updateTracePanel();
  } else {
    // Další bod
    const prev = _tracePoints[_tracePoints.length - 1];
    const seg = _analyzeSegment(prev, { x: wx, y: wy }, 0);
    _tracePoints.push({ x: wx, y: wy });
    _traceSegments.push(seg);
    _traceBulges.push(0);
    state.tempPoints.push({ x: wx, y: wy });
    state._profileTraceBulges = _traceBulges;
    setHint(`Trasování: ${_tracePoints.length} bodů (R = radius, Enter = dokončit, Esc = zrušit)`);
    renderAll();
    updateTracePanel();
  }
}

/**
 * Dokončí trasování a zobrazí výslednou tabulku.
 */
export function finishProfileTrace() {
  if (_tracePoints.length < 2) {
    showToast('Je potřeba alespoň 2 body');
    return;
  }
  state.drawing = false;
  state.tempPoints = [];
  resetHint();
  renderAll();
  updateTracePanel();
  // Otevřít pravý panel (sidebar) s profilem
  _openRightPanel();
}

/**
 * Otevře pravý sidebar panel aby byl vidět profil.
 */
function _openRightPanel() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar && !sidebar.classList.contains('mobile-open')) {
    sidebar.classList.add('mobile-open');
    if (overlay) overlay.classList.add('active');
  }
}

/**
 * Nastaví bulge na posledním segmentu trasování.
 * Volá se z events.js po dialogu bulge.
 * @param {number} segIdx - index segmentu
 * @param {number} bulge - hodnota bulge
 */
export function setTraceBulge(segIdx, bulge) {
  if (segIdx < 0 || segIdx >= _traceSegments.length) return;
  _traceBulges[segIdx] = bulge;
  state._profileTraceBulges = _traceBulges;
  // Přepočítat segment
  const p1 = _tracePoints[segIdx];
  const p2 = _tracePoints[segIdx + 1];
  _traceSegments[segIdx] = _analyzeSegment(p1, p2, bulge);
  renderAll();
}

/**
 * Vrátí aktuální data trasování pro bulge dialog.
 */
export function getTraceData() {
  return { points: _tracePoints, segments: _traceSegments, bulges: _traceBulges };
}

/**
 * Zruší trasování.
 */
export function cancelProfileTrace() {
  _tracePoints = [];
  _traceSegments = [];
  _traceBulges = [];
  state.drawing = false;
  state.tempPoints = [];
  state._profileTraceBulges = [];
  resetHint();
  renderAll();
  updateTracePanel();
}

/**
 * Reset stavu trasování (volá se z resetDrawingState).
 */
export function resetProfileTraceState() {
  _tracePoints = [];
  _traceSegments = [];
  _traceBulges = [];
  _traceOverlay = null;
  _selectedTraceIdx = -1;
  state._profileTraceBulges = [];
  updateTracePanel();
}

// ── Export CSV do schránky ──

function _exportCSV() {
  const { H, V, Hp, Vp, fH, fV } = coordHelpers();
  const dec = state.displayDecimals;
  let csv = `N;${Hp}${H};${Vp}${V};Typ;Délka;R;I;K;Úhel\n`;

  _tracePoints.forEach((pt, i) => {
    const d = toDisplayCoords(pt.x, pt.y);
    const hVal = fH(d.x).toFixed(dec);
    const vVal = fV(d.y).toFixed(dec);

    if (i === 0) {
      csv += `${i + 1};${hVal};${vVal};G00;–;–;–;–;–\n`;
    } else {
      const seg = _traceSegments[i - 1];
      const rText = seg.radius !== null ? seg.radius.toFixed(dec) : '–';
      const ik = _calcIK(i - 1);
      const iText = ik ? ik.I.toFixed(dec) : '–';
      const kText = ik ? ik.K.toFixed(dec) : '–';
      csv += `${i + 1};${hVal};${vVal};${seg.segType};${seg.dist.toFixed(dec)};${rText};${iText};${kText};${seg.angle.toFixed(1)}°\n`;
    }
  });

  navigator.clipboard.writeText(csv).then(() => {
    showToast('CSV zkopírováno do schránky ✓');
  }).catch(() => {
    showToast('Nelze zapisovat do schránky');
  });
}

function _copyTable() {
  const { H, V, Hp, Vp, fH, fV } = coordHelpers();
  const dec = state.displayDecimals;
  let text = `N\t${Hp}${H}\t${Vp}${V}\tTyp\tDélka\tR\tI\tK\tÚhel\n`;

  _tracePoints.forEach((pt, i) => {
    const d = toDisplayCoords(pt.x, pt.y);
    const hVal = fH(d.x).toFixed(dec);
    const vVal = fV(d.y).toFixed(dec);

    if (i === 0) {
      text += `${i + 1}\t${hVal}\t${vVal}\tG00\t–\t–\t–\t–\t–\n`;
    } else {
      const seg = _traceSegments[i - 1];
      const rText = seg.radius !== null ? seg.radius.toFixed(dec) : '–';
      const ik = _calcIK(i - 1);
      const iText = ik ? ik.I.toFixed(dec) : '–';
      const kText = ik ? ik.K.toFixed(dec) : '–';
      text += `${i + 1}\t${hVal}\t${vVal}\t${seg.segType}\t${seg.dist.toFixed(dec)}\t${rText}\t${iText}\t${kText}\t${seg.angle.toFixed(1)}°\n`;
    }
  });

  navigator.clipboard.writeText(text).then(() => {
    showToast('Tabulka zkopírována do schránky ✓');
  }).catch(() => {
    showToast('Nelze zapisovat do schránky');
  });
}

// ── Vykreslit profil jako objekty na výkrese ──

/**
 * Vytvoří z trasovaného profilu skutečné objekty (úsečky a oblouky) na výkrese.
 */
export function drawTraceToCanvas() {
  if (_tracePoints.length < 2) { showToast('Žádný profil k vykreslení'); return; }
  pushUndo();
  const created = [];
  for (let i = 0; i < _traceSegments.length; i++) {
    const p1 = _tracePoints[i];
    const p2 = _tracePoints[i + 1];
    const seg = _traceSegments[i];
    const bulge = _traceBulges[i] || 0;
    let obj;

    if ((seg.segType === 'G02' || seg.segType === 'G03') && seg.centerX != null && bulge !== 0) {
      const arc = bulgeToArc(p1, p2, bulge);
      if (arc) {
        const id = state.nextId++;
        obj = {
          type: 'arc',
          cx: arc.cx, cy: arc.cy, r: arc.r,
          startAngle: arc.startAngle, endAngle: arc.endAngle,
          name: `Oblouk ${id}`, id,
          layer: state.activeLayer,
        };
      }
    }

    if (!obj) {
      const id = state.nextId++;
      obj = {
        type: 'line',
        x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
        name: `Úsečka ${id}`, id,
        layer: state.activeLayer,
      };
    }

    state.objects.push(obj);
    created.push(obj);
  }
  updateObjectList();
  calculateAllIntersections();
  showToast(`Profil vykreslen (${created.length} obj.) ✓`);
}

// ── Import profilu z G-kódu ──

/**
 * Zobrazí dialog pro zadání G-kódu a vytvoří z něj trasovací body.
 */
export function importTraceFromGcode() {
  const overlay = makeOverlay();
  const dlg = overlay.querySelector('.dialog') || overlay;
  dlg.style.cssText = 'width:min(420px,95vw);max-height:80vh;display:flex;flex-direction:column;';
  dlg.innerHTML = `
    <h3 style="margin:0 0 8px">📥 Import G-kódu</h3>
    <p style="margin:0 0 6px;font-size:12px;color:#aaa">Zadejte G-kód (G00/G01/G02/G03 X… Z… R…/I… K…):</p>
    <textarea id="gcodeImportArea" rows="10" style="width:100%;box-sizing:border-box;font-family:monospace;font-size:13px;background:#1a1a2e;color:#e0e0e0;border:1px solid #444;border-radius:4px;padding:6px;resize:vertical;" placeholder="G00 X100 Z5\nG01 X100 Z-50\nG02 X80 Z-60 R10\nG01 X80 Z-100"></textarea>
    <div style="display:flex;gap:8px;margin-top:8px;justify-content:flex-end;">
      <button id="gcodeImportCancel" class="calc-btn" style="flex:1">Zrušit</button>
      <button id="gcodeImportOk" class="calc-btn" style="flex:1;background:#2563eb">Importovat</button>
    </div>
  `;

  const ta = dlg.querySelector('#gcodeImportArea');
  const cancelBtn = dlg.querySelector('#gcodeImportCancel');
  const okBtn = dlg.querySelector('#gcodeImportOk');

  cancelBtn.addEventListener('click', () => overlay.remove());

  okBtn.addEventListener('click', () => {
    const text = ta.value.trim();
    if (!text) { showToast('Prázdný vstup'); return; }
    const parsed = _parseGcodeToTrace(text);
    if (!parsed || parsed.points.length < 2) {
      showToast('Nelze rozpoznat G-kód (min. 2 body)');
      return;
    }
    // Set trace state
    _tracePoints = parsed.points;
    _traceBulges = parsed.bulges;
    _traceSegments = [];
    for (let i = 0; i < _tracePoints.length - 1; i++) {
      _traceSegments.push(_analyzeSegment(_tracePoints[i], _tracePoints[i + 1], _traceBulges[i]));
    }
    state.tempPoints = _tracePoints.map(p => [p.x, p.y]);
    state._profileTraceBulges = _traceBulges;
    state.drawing = true;
    state.tool = 'profileTrace';
    _selectedTraceIdx = -1;
    overlay.remove();
    updateTracePanel();
    renderAll();
    showToast(`Import: ${_tracePoints.length} bodů ✓`);
  });

  ta.focus();
}

/**
 * Parsuje text G-kódu na body a bulge.
 * Podporuje G00/G01/G02/G03 s X, Z, R, I, K parametry.
 */
function _parseGcodeToTrace(text) {
  const lines = text.split(/\n/).map(l => l.trim()).filter(l => l && !l.startsWith('(') && !l.startsWith(';') && !l.startsWith('%'));
  const isKarusel = state.machineType === 'karusel';
  const points = [];
  const bulges = [];
  let curX = 0, curZ = 0;
  let curG = 'G00';

  for (const line of lines) {
    const gMatch = line.match(/G0*([0-3])/i);
    if (gMatch) curG = 'G0' + gMatch[1];

    const xMatch = line.match(/X\s*(-?[\d.]+)/i);
    const zMatch = line.match(/Z\s*(-?[\d.]+)/i);
    const rMatch = line.match(/R\s*(-?[\d.]+)/i);
    const iMatch = line.match(/I\s*(-?[\d.]+)/i);
    const kMatch = line.match(/K\s*(-?[\d.]+)/i);

    if (!xMatch && !zMatch) continue;

    if (xMatch) curX = parseFloat(xMatch[1]);
    if (zMatch) curZ = parseFloat(zMatch[1]);

    // Convert CNC coords (X, Z) to canvas coords (wx, wy)
    const wx = isKarusel ? inputX(curX) : curZ;
    const wy = isKarusel ? curZ : inputX(curX);
    const pt = { x: wx, y: wy };

    if (points.length > 0 && (curG === 'G02' || curG === 'G03')) {
      const prev = points[points.length - 1];
      let bulge = 0;

      if (rMatch) {
        const r = parseFloat(rMatch[1]);
        bulge = radiusToBulge(prev, pt, Math.abs(r), curG === 'G02');
        if (bulge === null) bulge = 0;
        if (r < 0) bulge = -bulge;
      } else if (iMatch && kMatch) {
        const iVal = parseFloat(iMatch[1]);
        const kVal = parseFloat(kMatch[1]);
        let cx, cy;
        if (isKarusel) {
          cx = prev.x + inputX(iVal);
          cy = prev.y + kVal;
        } else {
          cx = prev.x + kVal;
          cy = prev.y + inputX(iVal);
        }
        const r = Math.hypot(prev.x - cx, prev.y - cy);
        bulge = radiusToBulge(prev, pt, r, curG === 'G02');
        if (bulge === null) bulge = 0;
      }

      bulges.push(bulge);
    } else if (points.length > 0) {
      bulges.push(0);
    }

    points.push(pt);
  }

  if (points.length < 2) return null;
  return { points, bulges };
}

// ── G-kód jako string (pro CNC editor i clipboard) ──

/**
 * Vrátí G-kód trasování jako string.
 * @returns {string}
 */
export function getTraceGcode() {
  if (_tracePoints.length < 2) return '';
  const { fH, fV } = coordHelpers();
  const dec = state.displayDecimals;
  const isKarusel = state.machineType === 'karusel';
  let gcode = '';

  _tracePoints.forEach((pt, i) => {
    const d = toDisplayCoords(pt.x, pt.y);
    const xVal = isKarusel ? fH(d.x) : fV(d.y);
    const zVal = isKarusel ? d.y : d.x;

    if (i === 0) {
      gcode += `G00 X${xVal.toFixed(dec)} Z${zVal.toFixed(dec)}\n`;
    } else {
      const seg = _traceSegments[i - 1];
      if (seg.segType === 'G02' || seg.segType === 'G03') {
        const rVal = seg.radius !== null ? seg.radius : 0;
        const ik = _calcIK(i - 1);
        if (ik) {
          gcode += `${seg.segType} X${xVal.toFixed(dec)} Z${zVal.toFixed(dec)} I${ik.I.toFixed(dec)} K${ik.K.toFixed(dec)}\n`;
        } else {
          gcode += `${seg.segType} X${xVal.toFixed(dec)} Z${zVal.toFixed(dec)} R${rVal.toFixed(dec)}\n`;
        }
      } else {
        gcode += `G01 X${xVal.toFixed(dec)} Z${zVal.toFixed(dec)}\n`;
      }
    }
  });
  return gcode;
}

// ── Panel v sidebaru ──

/**
 * Aktualizuje panel trasování v pravém sidebaru.
 * Volá se po každém kliku, dokončení, nebo změně bulge.
 */
export function updateTracePanel() {
  const header = document.getElementById('tracePanelHeader');
  const panel = document.getElementById('tracePanel');
  const content = document.getElementById('tracePanelContent');
  if (!header || !panel || !content) return;

  const hasData = _tracePoints.length >= 2;
  header.style.display = hasData ? '' : 'none';
  panel.style.display = hasData ? 'block' : 'none';

  if (!hasData) { content.innerHTML = ''; return; }

  const { H, V, Hp, Vp, fH, fV } = coordHelpers();
  const dec = state.displayDecimals;

  let totalLen = 0;
  _traceSegments.forEach(s => totalLen += s.dist);

  // Kompaktní seznam segmentů
  let html = `<div class="trace-panel-info">Bodů: <b>${_tracePoints.length}</b> · Délka: <b>${totalLen.toFixed(dec)}</b></div>`;
  html += '<ul class="trace-panel-list">';

  _tracePoints.forEach((pt, i) => {
    const d = toDisplayCoords(pt.x, pt.y);
    const hVal = fH(d.x).toFixed(dec);
    const vVal = fV(d.y).toFixed(dec);

    if (i === 0) {
      html += `<li class="trace-panel-item trace-panel-rapid" data-idx="0">
        <span class="trace-panel-n">${i + 1}</span>
        <span class="trace-panel-gcode trace-rapid">G00</span>
        <span class="trace-panel-coords">${Hp}${H}${hVal} ${Vp}${V}${vVal}</span>
      </li>`;
    } else {
      const seg = _traceSegments[i - 1];
      const isArc = seg.segType === 'G02' || seg.segType === 'G03';
      const rText = seg.radius !== null ? ' R' + seg.radius.toFixed(dec) : '';
      const ik = _calcIK(i - 1);
      const ikText = ik ? ` I${ik.I.toFixed(dec)} K${ik.K.toFixed(dec)}` : '';
      const gcClass = isArc ? 'trace-arc-code' : '';

      html += `<li class="trace-panel-item${isArc ? ' trace-panel-arc' : ''}" data-idx="${i}">
        <span class="trace-panel-n">${i + 1}</span>
        <span class="trace-panel-gcode ${gcClass}">${seg.segType}</span>
        <span class="trace-panel-coords">${Hp}${H}${hVal} ${Vp}${V}${vVal}${rText}${ikText}</span>
        <button class="trace-panel-r-btn" data-seg="${i - 1}" title="Radius">⌒</button>
      </li>`;
    }
  });

  html += '</ul>';
  html += `<div class="trace-panel-actions">
    <button id="tracePanelToCnc" class="calc-btn trace-panel-btn" title="Odeslat do CNC editoru">⚙ Do CNC</button>
    <button id="tracePanelToCam" class="calc-btn trace-panel-btn" title="Otevřít v CAM simulátoru">🔄 CAM</button>
    <button id="tracePanelCopy" class="calc-btn trace-panel-btn" title="Kopírovat G-kód">📋 G-kód</button>
    <button id="tracePanelDraw" class="calc-btn trace-panel-btn" title="Vykreslit profil na výkrese">✏ Vykreslit</button>
    <button id="tracePanelImport" class="calc-btn trace-panel-btn" title="Import profilu z G-kódu">📥 G→Profil</button>
    <button id="tracePanelCSV" class="calc-btn trace-panel-btn" title="Kopírovat jako CSV">📊 CSV</button>
    <button id="tracePanelCopyTable" class="calc-btn trace-panel-btn" title="Kopírovat tabulku">📋 Tabulka</button>
  </div>`;

  content.innerHTML = html;

  // Click handlers — segmenty
  content.querySelectorAll('.trace-panel-item').forEach(li => {
    const idx = parseInt(li.dataset.idx, 10);
    // Zvýraznění vybraného
    if (idx === _selectedTraceIdx) li.classList.add('selected');
    li.addEventListener('click', (e) => {
      if (e.target.closest('.trace-panel-r-btn')) return;
      _selectedTraceIdx = idx;
      // Zvýraznit v UI
      content.querySelectorAll('.trace-panel-item').forEach(el => el.classList.remove('selected'));
      li.classList.add('selected');
      // Posunout pohled na bod
      if (idx >= 0 && idx < _tracePoints.length) {
        const pt = _tracePoints[idx];
        state.panX = -pt.x * state.zoom + (state.canvasW || 400) / 2;
        state.panY = pt.y * state.zoom + (state.canvasH || 400) / 2;
        renderAll();
      }
      // Zobrazit vlastnosti
      _showTraceProperties(idx);
    });
  });

  // Radius buttons
  content.querySelectorAll('.trace-panel-r-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const segIdx = parseInt(btn.dataset.seg, 10);
      const p1 = _tracePoints[segIdx];
      const p2 = _tracePoints[segIdx + 1];
      showBulgeDialog(p1, p2, _traceBulges[segIdx] || 0, (newBulge) => {
        setTraceBulge(segIdx, newBulge);
        updateTracePanel();
      });
    });
  });

  // CNC editor button
  const cncBtn = content.querySelector('#tracePanelToCnc');
  if (cncBtn) {
    cncBtn.addEventListener('click', () => {
      const gcode = getTraceGcode();
      if (!gcode) { showToast('Žádná data k exportu'); return; }
      import('../calculators/cncEditor.js').then(m => {
        m.openCncEditor(gcode);
      });
    });
  }

  // CAM simulator button
  const camBtn = content.querySelector('#tracePanelToCam');
  if (camBtn) {
    camBtn.addEventListener('click', () => {
      const gcode = getTraceGcode();
      if (!gcode) { showToast('Žádná data k exportu'); return; }
      import('../calculators/camSimulator.js').then(m => {
        m.openCamSimulator(gcode);
      });
    });
  }

  // Copy G-code button
  const copyBtn = content.querySelector('#tracePanelCopy');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const gcode = getTraceGcode();
      navigator.clipboard.writeText(gcode).then(() => {
        showToast('G-kód zkopírován ✓');
      }).catch(() => {
        showToast('Nelze zapisovat do schránky');
      });
    });
  }

  // Draw to canvas button
  const drawBtn = content.querySelector('#tracePanelDraw');
  if (drawBtn) {
    drawBtn.addEventListener('click', () => drawTraceToCanvas());
  }

  // Import G-code button
  const importBtn = content.querySelector('#tracePanelImport');
  if (importBtn) {
    importBtn.addEventListener('click', () => importTraceFromGcode());
  }

  // CSV button
  const csvBtn = content.querySelector('#tracePanelCSV');
  if (csvBtn) {
    csvBtn.addEventListener('click', () => _exportCSV());
  }

  // Copy table button
  const copyTblBtn = content.querySelector('#tracePanelCopyTable');
  if (copyTblBtn) {
    copyTblBtn.addEventListener('click', () => _copyTable());
  }
}

// ── Přepočet po editaci bodu ──

function _refreshTraceAfterEdit(idx) {
  // Recalculate affected segments (before and after the point)
  if (idx > 0) {
    const segIdx = idx - 1;
    _traceSegments[segIdx] = _analyzeSegment(
      _tracePoints[segIdx], _tracePoints[segIdx + 1], _traceBulges[segIdx]
    );
  }
  if (idx < _traceSegments.length) {
    _traceSegments[idx] = _analyzeSegment(
      _tracePoints[idx], _tracePoints[idx + 1], _traceBulges[idx]
    );
  }
  // Sync state
  state.tempPoints = _tracePoints.map(p => [p.x, p.y]);
  updateTracePanel();
  renderAll();
  // Refresh properties panel with updated computed values
  _showTraceProperties(idx);
}

// ── Zobrazení detailů segmentu ve Vlastnostech ──

function _showTraceProperties(idx) {
  const tbody = document.querySelector('#propTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const { H, V, Hp, Vp, fH, fV } = coordHelpers();
  const isK = state.machineType === 'karusel';
  const dec = state.displayDecimals;

  // Inverse functions for coordinate input (reverse of fH/fV)
  const invH = v => isK ? inputX(v) : v;
  const invV = v => isK ? v : inputX(v);

  function addRow(label, value) {
    const tr = document.createElement('tr');
    const tdL = document.createElement('td');
    tdL.textContent = label;
    const tdV = document.createElement('td');
    tdV.className = 'prop-readonly';
    tdV.textContent = value;
    tr.appendChild(tdL);
    tr.appendChild(tdV);
    tbody.appendChild(tr);
  }

  function addEditRow(label, value, onChange) {
    const tr = document.createElement('tr');
    const tdL = document.createElement('td');
    tdL.textContent = label;
    const tdV = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.className = 'prop-input';
    input.value = parseFloat(value).toFixed(dec);
    input.addEventListener('change', () => {
      const v = safeEvalMath(input.value);
      if (!isNaN(v)) {
        onChange(v);
        _refreshTraceAfterEdit(idx);
      }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      e.stopPropagation();
    });
    input.addEventListener('focus', () => input.select());
    tdV.appendChild(input);
    tr.appendChild(tdL);
    tr.appendChild(tdV);
    tbody.appendChild(tr);
  }

  if (idx < 0 || idx >= _tracePoints.length) return;

  const pt = _tracePoints[idx];
  const d = toDisplayCoords(pt.x, pt.y);
  const hVal = fH(d.x).toFixed(dec);
  const vVal = fV(d.y).toFixed(dec);

  addRow('Bod', `${idx + 1} / ${_tracePoints.length}`);

  // Editable end point coordinates
  addEditRow(`${Hp}${H}`, hVal, (v) => {
    const raw = invH(v);
    _tracePoints[idx].x = state.coordMode === 'inc' ? raw + state.incReference.x : raw;
  });
  addEditRow(`${Vp}${V}`, vVal, (v) => {
    const raw = invV(v);
    _tracePoints[idx].y = state.coordMode === 'inc' ? raw + state.incReference.y : raw;
  });

  if (idx === 0) {
    addRow('Typ', 'G00 – Nájezd');
  } else {
    const seg = _traceSegments[idx - 1];
    const isArc = seg.segType === 'G02' || seg.segType === 'G03';

    // Editable start point coordinates
    const sp = _tracePoints[idx - 1];
    const sd = toDisplayCoords(sp.x, sp.y);
    addEditRow('Start ' + Hp + H, fH(sd.x).toFixed(dec), (v) => {
      const raw = invH(v);
      _tracePoints[idx - 1].x = state.coordMode === 'inc' ? raw + state.incReference.x : raw;
    });
    addEditRow('Start ' + Vp + V, fV(sd.y).toFixed(dec), (v) => {
      const raw = invV(v);
      _tracePoints[idx - 1].y = state.coordMode === 'inc' ? raw + state.incReference.y : raw;
    });

    const typeLabel = seg.segType === 'G01' ? 'G01 – Lineární' :
                      seg.segType === 'G02' ? 'G02 – CW oblouk' :
                      seg.segType === 'G03' ? 'G03 – CCW oblouk' : seg.segType;
    addRow('Typ', typeLabel);
    addRow('Délka', seg.dist.toFixed(dec) + ' mm');
    addRow('Úhel', seg.angle.toFixed(1) + '°');

    if (isArc && seg.radius !== null) {
      // Editable radius
      addEditRow('R', seg.radius.toFixed(dec), (v) => {
        if (v <= 0) return;
        const segIdx = idx - 1;
        const p1 = _tracePoints[segIdx];
        const p2 = _tracePoints[segIdx + 1];
        const newBulge = radiusToBulge(p1, p2, v, seg.segType === 'G02');
        if (newBulge !== null) {
          setTraceBulge(segIdx, newBulge);
        }
      });

      // Read-only center coordinates
      if (seg.centerX != null && seg.centerY != null) {
        const cd = toDisplayCoords(seg.centerX, seg.centerY);
        addRow('Střed ' + Hp + H, fH(cd.x).toFixed(dec));
        addRow('Střed ' + Vp + V, fV(cd.y).toFixed(dec));
      }

      // I / K
      const ik = _calcIK(idx - 1);
      if (ik) {
        addRow('I (inkr.)', ik.I.toFixed(dec));
        addRow('K (inkr.)', ik.K.toFixed(dec));
      }
    }

    // Bulge
    const bulge = _traceBulges[idx - 1] || 0;
    if (bulge !== 0) {
      addRow('Bulge', bulge.toFixed(6));
    }
  }

  // Otevřít panel vlastností, pokud je zavřený
  const propPanel = document.getElementById('propPanel');
  if (propPanel && getComputedStyle(propPanel).display === 'none') {
    propPanel.style.display = 'block';
    const propHeader = propPanel.previousElementSibling;
    if (propHeader) {
      for (const n of propHeader.childNodes) {
        if (n.nodeType === 3) {
          n.textContent = n.textContent.replace(/[▾▸]/, '▾');
          break;
        }
      }
    }
  }

  // Zrušit výběr objektu, aby se Vlastnosti nepřepsaly
  state.selected = null;
  state.selectedSegment = null;
}
