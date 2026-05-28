// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Post-draw dialog                                  ║
// ║  Po nakreslení objektu zobrazí dialog s vlastnostmi         ║
// ║  a možností úpravy.                                         ║
// ╚══════════════════════════════════════════════════════════════╝

import { makeInputOverlay } from '../dialogFactory.js';
import { state, pushUndo, showToast, axisLabels, displayX, inputX, xPrefix } from '../state.js';
import { safeEvalMath } from '../utils.js';
import { calculateAllIntersections } from '../geometry.js';
import { updateObjectList, resetHint } from '../ui.js';
import { renderAll } from '../render.js';
import { addObject, addPolylineAsSegments } from '../objects.js';

/**
 * Zobrazí post-draw dialog pro úsečku (line/constr).
 * @param {import('../types.js').DrawObject} obj
 */
export function showPostDrawLineDialog(obj) {
  const [H, V] = axisLabels();
  const dx = obj.x2 - obj.x1;
  const dy = obj.y2 - obj.y1;
  const length = Math.hypot(dx, dy);
  const angle = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;

  const isVerticalX = (key) => key === 'y1' || key === 'y2';
  const fmt = (val, key) => isVerticalX(key) ? displayX(val).toFixed(3) : val.toFixed(3);
  const pfx = xPrefix();

  const overlay = makeInputOverlay(`
    <div class="input-dialog">
      <h3>${obj.type === 'constr' ? 'Konstrukční úsečka' : 'Úsečka'} – vlastnosti</h3>
      <div class="anchor-radio-row">
        <span>📌 Fixní bod:</span>
        <label><input type="radio" name="pdAnchor" value="1" checked> Bod 1</label>
        <label><input type="radio" name="pdAnchor" value="2"> Bod 2</label>
      </div>
      <div class="input-row">
        <div>
          <label>${H}1:</label>
          <input type="text" id="pdH1" value="${obj.x1.toFixed(3)}" inputmode="decimal">
        </div>
        <div>
          <label>${pfx}${V}1:</label>
          <input type="text" id="pdV1" value="${fmt(obj.y1, 'y1')}" inputmode="decimal">
        </div>
      </div>
      <div class="input-row">
        <div>
          <label>${H}2:</label>
          <input type="text" id="pdH2" value="${obj.x2.toFixed(3)}" inputmode="decimal">
        </div>
        <div>
          <label>${pfx}${V}2:</label>
          <input type="text" id="pdV2" value="${fmt(obj.y2, 'y2')}" inputmode="decimal">
        </div>
      </div>
      <div class="input-row">
        <div>
          <label>Délka:</label>
          <input type="text" id="pdLen" value="${length.toFixed(3)}" inputmode="decimal">
        </div>
        <div>
          <label>Úhel (°):</label>
          <input type="text" id="pdAng" value="${angle.toFixed(2)}" inputmode="decimal">
        </div>
      </div>
      <div class="btn-row">
        <button class="btn-cancel btn-cancel-overlay">Zrušit</button>
        <button class="btn-ok" id="pdOk">OK</button>
      </div>
    </div>`);

  const h1 = overlay.querySelector('#pdH1');
  const v1 = overlay.querySelector('#pdV1');
  const h2 = overlay.querySelector('#pdH2');
  const v2 = overlay.querySelector('#pdV2');
  const lenInp = overlay.querySelector('#pdLen');
  const angInp = overlay.querySelector('#pdAng');

  function getAnchor() {
    return overlay.querySelector('input[name="pdAnchor"]:checked').value;
  }

  // Sync: when length/angle changes, move the non-fixed endpoint
  function syncFromPolar() {
    const l = safeEvalMath(lenInp.value);
    const a = safeEvalMath(angInp.value);
    if (!isFinite(l) || !isFinite(a)) return;
    const rad = a * Math.PI / 180;
    if (getAnchor() === '1') {
      const x1 = safeEvalMath(h1.value);
      const y1 = inputX(safeEvalMath(v1.value));
      if (isFinite(x1) && isFinite(y1)) {
        h2.value = (x1 + l * Math.cos(rad)).toFixed(3);
        v2.value = displayX(y1 + l * Math.sin(rad)).toFixed(3);
      }
    } else {
      const x2 = safeEvalMath(h2.value);
      const y2 = inputX(safeEvalMath(v2.value));
      if (isFinite(x2) && isFinite(y2)) {
        h1.value = (x2 + l * Math.cos(rad)).toFixed(3);
        v1.value = displayX(y2 + l * Math.sin(rad)).toFixed(3);
      }
    }
  }

  // Sync: when endpoints change, update length/angle
  function syncFromEndpoints() {
    const x1 = safeEvalMath(h1.value);
    const y1 = inputX(safeEvalMath(v1.value));
    const x2 = safeEvalMath(h2.value);
    const y2 = inputX(safeEvalMath(v2.value));
    if (isFinite(x1) && isFinite(y1) && isFinite(x2) && isFinite(y2)) {
      lenInp.value = Math.hypot(x2 - x1, y2 - y1).toFixed(3);
      if (getAnchor() === '1') {
        angInp.value = (((Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI) + 360) % 360).toFixed(2);
      } else {
        angInp.value = (((Math.atan2(y1 - y2, x1 - x2) * 180 / Math.PI) + 360) % 360).toFixed(2);
      }
    }
  }

  h1.addEventListener('input', syncFromEndpoints);
  v1.addEventListener('input', syncFromEndpoints);
  h2.addEventListener('input', syncFromEndpoints);
  v2.addEventListener('input', syncFromEndpoints);
  lenInp.addEventListener('input', syncFromPolar);
  angInp.addEventListener('input', syncFromPolar);
  overlay.querySelectorAll('input[name="pdAnchor"]').forEach(r => {
    r.addEventListener('change', syncFromEndpoints);
  });

  function accept() {
    const nx1 = safeEvalMath(h1.value);
    const ny1 = inputX(safeEvalMath(v1.value));
    const nx2 = safeEvalMath(h2.value);
    const ny2 = inputX(safeEvalMath(v2.value));
    if (!isFinite(nx1) || !isFinite(ny1) || !isFinite(nx2) || !isFinite(ny2)) {
      showToast('Neplatné hodnoty');
      return;
    }
    if (Math.hypot(nx2 - nx1, ny2 - ny1) < 1e-9) {
      showToast('Úsečka má nulovou délku');
      return;
    }
    // Update the object in-place (undo was already pushed by addObject)
    obj.x1 = nx1; obj.y1 = ny1;
    obj.x2 = nx2; obj.y2 = ny2;
    calculateAllIntersections();
    updateObjectList();
    renderAll();
    overlay.remove();
  }

  overlay.querySelector('#pdOk').addEventListener('click', accept);
  _wireKeys(overlay, accept);
  h1.focus();
  h1.select();
}

/**
 * Zobrazí post-draw dialog pro bod.
 * @param {import('../types.js').DrawObject} obj
 */
export function showPostDrawPointDialog(obj) {
  const [H, V] = axisLabels();
  const pfx = xPrefix();

  const overlay = makeInputOverlay(`
    <div class="input-dialog">
      <h3>Bod – vlastnosti</h3>
      <div class="input-row">
        <div>
          <label>${H}:</label>
          <input type="text" id="pdH" value="${obj.x.toFixed(3)}" inputmode="decimal">
        </div>
        <div>
          <label>${pfx}${V}:</label>
          <input type="text" id="pdV" value="${displayX(obj.y).toFixed(3)}" inputmode="decimal">
        </div>
      </div>
      <div class="btn-row">
        <button class="btn-cancel btn-cancel-overlay">Zrušit</button>
        <button class="btn-ok" id="pdOk">OK</button>
      </div>
    </div>`);

  const hInp = overlay.querySelector('#pdH');
  const vInp = overlay.querySelector('#pdV');

  function accept() {
    const nx = safeEvalMath(hInp.value);
    const ny = inputX(safeEvalMath(vInp.value));
    if (!isFinite(nx) || !isFinite(ny)) {
      showToast('Neplatné hodnoty');
      return;
    }
    obj.x = nx; obj.y = ny;
    calculateAllIntersections();
    updateObjectList();
    renderAll();
    overlay.remove();
  }

  overlay.querySelector('#pdOk').addEventListener('click', accept);
  _wireKeys(overlay, accept);
  hInp.focus();
  hInp.select();
}

/**
 * Zobrazí post-draw dialog pro kružnici.
 * @param {import('../types.js').DrawObject} obj
 */
export function showPostDrawCircleDialog(obj) {
  const [H, V] = axisLabels();
  const pfx = xPrefix();

  const overlay = makeInputOverlay(`
    <div class="input-dialog">
      <h3>Kružnice – vlastnosti</h3>
      <div class="input-row">
        <div>
          <label>Střed ${H}:</label>
          <input type="text" id="pdCH" value="${obj.cx.toFixed(3)}" inputmode="decimal">
        </div>
        <div>
          <label>Střed ${pfx}${V}:</label>
          <input type="text" id="pdCV" value="${displayX(obj.cy).toFixed(3)}" inputmode="decimal">
        </div>
      </div>
      <div class="input-row">
        <div>
          <label>Poloměr:</label>
          <input type="text" id="pdR" value="${obj.r.toFixed(3)}" inputmode="decimal">
        </div>
        <div>
          <label>Průměr:</label>
          <input type="text" id="pdD" value="${(obj.r * 2).toFixed(3)}" inputmode="decimal">
        </div>
      </div>
      <div class="btn-row">
        <button class="btn-cancel btn-cancel-overlay">Zrušit</button>
        <button class="btn-ok" id="pdOk">OK</button>
      </div>
    </div>`);

  const cH = overlay.querySelector('#pdCH');
  const cV = overlay.querySelector('#pdCV');
  const rInp = overlay.querySelector('#pdR');
  const dInp = overlay.querySelector('#pdD');

  rInp.addEventListener('input', () => {
    const r = safeEvalMath(rInp.value);
    if (isFinite(r)) dInp.value = (r * 2).toFixed(3);
  });
  dInp.addEventListener('input', () => {
    const d = safeEvalMath(dInp.value);
    if (isFinite(d)) rInp.value = (d / 2).toFixed(3);
  });

  function accept() {
    const ncx = safeEvalMath(cH.value);
    const ncy = inputX(safeEvalMath(cV.value));
    const nr = safeEvalMath(rInp.value);
    if (!isFinite(ncx) || !isFinite(ncy) || !isFinite(nr) || nr <= 0) {
      showToast('Neplatné hodnoty');
      return;
    }
    obj.cx = ncx; obj.cy = ncy; obj.r = nr;
    calculateAllIntersections();
    updateObjectList();
    renderAll();
    overlay.remove();
  }

  overlay.querySelector('#pdOk').addEventListener('click', accept);
  _wireKeys(overlay, accept);
  rInp.focus();
  rInp.select();
}

/**
 * Zobrazí post-draw dialog pro obdélník.
 * @param {import('../types.js').DrawObject} obj
 */
export function showPostDrawRectDialog(obj) {
  const [H, V] = axisLabels();
  const pfx = xPrefix();
  const w = Math.abs(obj.x2 - obj.x1);
  const h = Math.abs(obj.y2 - obj.y1);

  const overlay = makeInputOverlay(`
    <div class="input-dialog">
      <h3>Obdélník – vlastnosti</h3>
      <div class="anchor-radio-row">
        <span>📌 Fixní roh:</span>
        <label><input type="radio" name="pdRAnchor" value="1" checked> Roh 1</label>
        <label><input type="radio" name="pdRAnchor" value="2"> Roh 2</label>
      </div>
      <div class="input-row">
        <div>
          <label>${H}1:</label>
          <input type="text" id="pdH1" value="${obj.x1.toFixed(3)}" inputmode="decimal">
        </div>
        <div>
          <label>${pfx}${V}1:</label>
          <input type="text" id="pdV1" value="${displayX(obj.y1).toFixed(3)}" inputmode="decimal">
        </div>
      </div>
      <div class="input-row">
        <div>
          <label>${H}2:</label>
          <input type="text" id="pdH2" value="${obj.x2.toFixed(3)}" inputmode="decimal">
        </div>
        <div>
          <label>${pfx}${V}2:</label>
          <input type="text" id="pdV2" value="${displayX(obj.y2).toFixed(3)}" inputmode="decimal">
        </div>
      </div>
      <div class="input-row">
        <div>
          <label>Šířka (${H}):</label>
          <input type="text" id="pdW" value="${w.toFixed(3)}" inputmode="decimal">
        </div>
        <div>
          <label>Výška (${V}):</label>
          <input type="text" id="pdHt" value="${displayX(h).toFixed(3)}" inputmode="decimal">
        </div>
      </div>
      <div class="btn-row">
        <button class="btn-cancel btn-cancel-overlay">Zrušit</button>
        <button class="btn-ok" id="pdOk">OK</button>
      </div>
    </div>`);

  const h1 = overlay.querySelector('#pdH1');
  const v1 = overlay.querySelector('#pdV1');
  const h2 = overlay.querySelector('#pdH2');
  const v2 = overlay.querySelector('#pdV2');
  const wInp = overlay.querySelector('#pdW');
  const htInp = overlay.querySelector('#pdHt');

  function getAnchor() {
    return overlay.querySelector('input[name="pdRAnchor"]:checked').value;
  }

  // Sync width/height -> move the non-fixed corner
  wInp.addEventListener('input', () => {
    const wVal = safeEvalMath(wInp.value);
    if (!isFinite(wVal)) return;
    if (getAnchor() === '1') {
      const x1 = safeEvalMath(h1.value);
      if (isFinite(x1)) {
        const sign = (safeEvalMath(h2.value) >= x1) ? 1 : -1;
        h2.value = (x1 + sign * Math.abs(wVal)).toFixed(3);
      }
    } else {
      const x2 = safeEvalMath(h2.value);
      if (isFinite(x2)) {
        const sign = (safeEvalMath(h1.value) <= x2) ? -1 : 1;
        h1.value = (x2 + sign * Math.abs(wVal)).toFixed(3);
      }
    }
  });
  htInp.addEventListener('input', () => {
    const hVal = inputX(safeEvalMath(htInp.value));
    if (!isFinite(hVal)) return;
    if (getAnchor() === '1') {
      const y1 = inputX(safeEvalMath(v1.value));
      if (isFinite(y1)) {
        const sign = (inputX(safeEvalMath(v2.value)) >= y1) ? 1 : -1;
        v2.value = displayX(y1 + sign * Math.abs(hVal)).toFixed(3);
      }
    } else {
      const y2 = inputX(safeEvalMath(v2.value));
      if (isFinite(y2)) {
        const sign = (inputX(safeEvalMath(v1.value)) <= y2) ? -1 : 1;
        v1.value = displayX(y2 + sign * Math.abs(hVal)).toFixed(3);
      }
    }
  });

  // Sync endpoints -> width/height
  function syncWH() {
    const x1 = safeEvalMath(h1.value);
    const y1 = inputX(safeEvalMath(v1.value));
    const x2 = safeEvalMath(h2.value);
    const y2 = inputX(safeEvalMath(v2.value));
    if (isFinite(x1) && isFinite(y1) && isFinite(x2) && isFinite(y2)) {
      wInp.value = Math.abs(x2 - x1).toFixed(3);
      htInp.value = displayX(Math.abs(y2 - y1)).toFixed(3);
    }
  }
  h1.addEventListener('input', syncWH);
  v1.addEventListener('input', syncWH);
  h2.addEventListener('input', syncWH);
  v2.addEventListener('input', syncWH);

  function accept() {
    const nx1 = safeEvalMath(h1.value);
    const ny1 = inputX(safeEvalMath(v1.value));
    const nx2 = safeEvalMath(h2.value);
    const ny2 = inputX(safeEvalMath(v2.value));
    if (!isFinite(nx1) || !isFinite(ny1) || !isFinite(nx2) || !isFinite(ny2)) {
      showToast('Neplatné hodnoty');
      return;
    }
    if (Math.abs(nx2 - nx1) < 1e-9 && Math.abs(ny2 - ny1) < 1e-9) {
      showToast('Obdélník má nulovou velikost');
      return;
    }
    obj.x1 = nx1; obj.y1 = ny1;
    obj.x2 = nx2; obj.y2 = ny2;
    calculateAllIntersections();
    updateObjectList();
    renderAll();
    overlay.remove();
  }

  overlay.querySelector('#pdOk').addEventListener('click', accept);
  _wireKeys(overlay, accept);
  h1.focus();
  h1.select();
}

/**
 * Zobrazí post-draw dialog pro konturu (polyline).
 * @param {import('../types.js').DrawObject} obj
 */
export function showPostDrawPolylineDialog(obj) {
  const [H, V] = axisLabels();
  const pfx = xPrefix();
  const verts = obj.vertices;
  const closed = obj.closed;

  // Calculate total length
  let totalLen = 0;
  for (let i = 0; i < verts.length - (closed ? 0 : 1); i++) {
    const p1 = verts[i];
    const p2 = verts[(i + 1) % verts.length];
    totalLen += Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }

  // Build vertex rows
  let vertexRows = '';
  for (let i = 0; i < verts.length; i++) {
    vertexRows += `
      <div class="input-row" style="margin-bottom:2px">
        <div>
          <label style="font-size:11px">${H}${i + 1}:</label>
          <input type="text" class="pd-vh" data-idx="${i}" data-axis="h" value="${verts[i].x.toFixed(3)}" inputmode="decimal" style="font-size:12px;padding:4px">
        </div>
        <div>
          <label style="font-size:11px">${pfx}${V}${i + 1}:</label>
          <input type="text" class="pd-vv" data-idx="${i}" data-axis="v" value="${displayX(verts[i].y).toFixed(3)}" inputmode="decimal" style="font-size:12px;padding:4px">
        </div>
      </div>`;
  }

  const overlay = makeInputOverlay(`
    <div class="input-dialog">
      <h3>Kontura – vlastnosti</h3>
      <div style="font-size:12px;opacity:0.7;margin-bottom:6px">
        ${verts.length} bodů | ${closed ? 'Uzavřená' : 'Otevřená'} | Délka: ${totalLen.toFixed(3)} mm
      </div>
      <div style="max-height:250px;overflow-y:auto;margin-bottom:8px">
        ${vertexRows}
      </div>
      <div class="btn-row">
        <button class="btn-cancel btn-cancel-overlay">Zrušit</button>
        <button class="btn-ok" id="pdOk">OK</button>
      </div>
    </div>`);

  function accept() {
    const hInputs = overlay.querySelectorAll('.pd-vh');
    const vInputs = overlay.querySelectorAll('.pd-vv');
    const newVerts = [];
    for (let i = 0; i < hInputs.length; i++) {
      const nx = safeEvalMath(hInputs[i].value);
      const ny = inputX(safeEvalMath(vInputs[i].value));
      if (!isFinite(nx) || !isFinite(ny)) {
        showToast(`Neplatná hodnota v bodě ${i + 1}`);
        return;
      }
      newVerts.push({ x: nx, y: ny });
    }
    for (let i = 0; i < newVerts.length; i++) {
      obj.vertices[i].x = newVerts[i].x;
      obj.vertices[i].y = newVerts[i].y;
    }
    calculateAllIntersections();
    updateObjectList();
    renderAll();
    overlay.remove();
  }

  overlay.querySelector('#pdOk').addEventListener('click', accept);
  _wireKeys(overlay, accept);
  const firstInp = overlay.querySelector('.pd-vh');
  if (firstInp) { firstInp.focus(); firstInp.select(); }
}

// ── Helpers ──

function _wireKeys(overlay, accept) {
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); accept(); }
    if (e.key === 'Escape') overlay.remove();
    e.stopPropagation();
  });
}

/**
 * Dialog po každém segmentu kontury (polyline).
 * Zobrazí počátek, konec, délku, úhel segmentu s možností úpravy.
 * Tlačítka: Další bod / Dokončit (otevřená) / Uzavřít (uzavřená polygon).
 */
export function showPolylineSegmentDialog() {
  const pts = state.tempPoints;
  if (!pts || pts.length < 2) return;

  const segIdx = pts.length - 2;
  const p1 = pts[segIdx];
  const p2 = pts[segIdx + 1];
  const [H, V] = axisLabels();
  const pfx = xPrefix();
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.hypot(dx, dy);
  const angle = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;

  const overlay = makeInputOverlay(`
    <div class="input-dialog">
      <h3>Kontura – segment ${segIdx + 1}</h3>
      <div style="font-size:12px;opacity:0.7;margin-bottom:6px">
        Celkem bodů: ${pts.length} | Segmentů: ${pts.length - 1}
      </div>
      <div class="anchor-radio-row">
        <span>📌 Fixní bod:</span>
        <label><input type="radio" name="plAnchor" value="1" checked> Bod 1</label>
        <label><input type="radio" name="plAnchor" value="2"> Bod 2</label>
      </div>
      <div class="input-row">
        <div>
          <label>${H}1:</label>
          <input type="text" id="plH1" value="${p1.x.toFixed(3)}" inputmode="decimal">
        </div>
        <div>
          <label>${pfx}${V}1:</label>
          <input type="text" id="plV1" value="${displayX(p1.y).toFixed(3)}" inputmode="decimal">
        </div>
      </div>
      <div class="input-row">
        <div>
          <label>${H}2:</label>
          <input type="text" id="plH2" value="${p2.x.toFixed(3)}" inputmode="decimal">
        </div>
        <div>
          <label>${pfx}${V}2:</label>
          <input type="text" id="plV2" value="${displayX(p2.y).toFixed(3)}" inputmode="decimal">
        </div>
      </div>
      <div class="input-row">
        <div>
          <label>Délka:</label>
          <input type="text" id="plLen" value="${length.toFixed(3)}" inputmode="decimal">
        </div>
        <div>
          <label>Úhel (°):</label>
          <input type="text" id="plAng" value="${angle.toFixed(2)}" inputmode="decimal">
        </div>
      </div>
      <div class="btn-row" style="flex-wrap:wrap;gap:6px">
        <button class="btn-cancel btn-cancel-overlay">Zrušit</button>
        <button class="btn-ok" id="plNext" title="Potvrdit a pokračovat v kreslení">Další bod</button>
        <button class="btn-ok" id="plFinish" style="background:#4a9d4a" title="Dokončit otevřenou konturu">Dokončit</button>
        <button class="btn-ok" id="plClose" style="background:#c07020" title="Uzavřít konturu">Uzavřít</button>
      </div>
    </div>`);

  const h1 = overlay.querySelector('#plH1');
  const v1 = overlay.querySelector('#plV1');
  const h2 = overlay.querySelector('#plH2');
  const v2 = overlay.querySelector('#plV2');
  const lenInp = overlay.querySelector('#plLen');
  const angInp = overlay.querySelector('#plAng');

  function getAnchor() {
    return overlay.querySelector('input[name="plAnchor"]:checked').value;
  }

  function syncFromPolar() {
    const l = safeEvalMath(lenInp.value);
    const a = safeEvalMath(angInp.value);
    if (!isFinite(l) || !isFinite(a)) return;
    const rad = a * Math.PI / 180;
    if (getAnchor() === '1') {
      const x1 = safeEvalMath(h1.value);
      const y1 = inputX(safeEvalMath(v1.value));
      if (isFinite(x1) && isFinite(y1)) {
        h2.value = (x1 + l * Math.cos(rad)).toFixed(3);
        v2.value = displayX(y1 + l * Math.sin(rad)).toFixed(3);
      }
    } else {
      const x2 = safeEvalMath(h2.value);
      const y2 = inputX(safeEvalMath(v2.value));
      if (isFinite(x2) && isFinite(y2)) {
        h1.value = (x2 + l * Math.cos(rad)).toFixed(3);
        v1.value = displayX(y2 + l * Math.sin(rad)).toFixed(3);
      }
    }
  }

  function syncFromEndpoints() {
    const x1 = safeEvalMath(h1.value);
    const y1 = inputX(safeEvalMath(v1.value));
    const x2 = safeEvalMath(h2.value);
    const y2 = inputX(safeEvalMath(v2.value));
    if (isFinite(x1) && isFinite(y1) && isFinite(x2) && isFinite(y2)) {
      lenInp.value = Math.hypot(x2 - x1, y2 - y1).toFixed(3);
      if (getAnchor() === '1') {
        angInp.value = (((Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI) + 360) % 360).toFixed(2);
      } else {
        angInp.value = (((Math.atan2(y1 - y2, x1 - x2) * 180 / Math.PI) + 360) % 360).toFixed(2);
      }
    }
  }

  h1.addEventListener('input', syncFromEndpoints);
  v1.addEventListener('input', syncFromEndpoints);
  h2.addEventListener('input', syncFromEndpoints);
  v2.addEventListener('input', syncFromEndpoints);
  lenInp.addEventListener('input', syncFromPolar);
  angInp.addEventListener('input', syncFromPolar);
  overlay.querySelectorAll('input[name="plAnchor"]').forEach(r => {
    r.addEventListener('change', syncFromEndpoints);
  });

  /** Read validated values from the form. Returns null on error. */
  function readValues() {
    const nx1 = safeEvalMath(h1.value);
    const ny1 = inputX(safeEvalMath(v1.value));
    const nx2 = safeEvalMath(h2.value);
    const ny2 = inputX(safeEvalMath(v2.value));
    if (!isFinite(nx1) || !isFinite(ny1) || !isFinite(nx2) || !isFinite(ny2)) {
      showToast('Neplatné hodnoty');
      return null;
    }
    if (Math.hypot(nx2 - nx1, ny2 - ny1) < 1e-9) {
      showToast('Segment má nulovou délku');
      return null;
    }
    return { x1: nx1, y1: ny1, x2: nx2, y2: ny2 };
  }

  /** Apply edited values back to tempPoints */
  function applyValues(vals) {
    pts[segIdx].x = vals.x1;
    pts[segIdx].y = vals.y1;
    pts[segIdx + 1].x = vals.x2;
    pts[segIdx + 1].y = vals.y2;
  }

  /** Finish polyline as open or closed */
  function finishPolyline(closed) {
    const vals = readValues();
    if (!vals) return;
    applyValues(vals);

    const bulges = state._polylineBulges || [];
    if (closed) {
      while (bulges.length < pts.length) bulges.push(0);
    } else {
      while (bulges.length < pts.length - 1) bulges.push(0);
    }
    addPolylineAsSegments(pts.slice(), bulges.slice(0, closed ? pts.length : pts.length - 1), closed);
    state.drawing = false;
    state.tempPoints = [];
    state._polylineBulges = [];
    resetHint();
    overlay.remove();
    showToast(closed ? 'Kontura uzavřena' : 'Kontura dokončena');
  }

  // "Další bod" – confirm segment values, continue drawing
  overlay.querySelector('#plNext').addEventListener('click', () => {
    const vals = readValues();
    if (!vals) return;
    applyValues(vals);
    overlay.remove();
    renderAll();
  });

  // "Dokončit" – finish open polyline
  overlay.querySelector('#plFinish').addEventListener('click', () => finishPolyline(false));

  // "Uzavřít" – close polyline
  overlay.querySelector('#plClose').addEventListener('click', () => finishPolyline(true));

  // Enter = Další bod, Escape = cancel
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const vals = readValues();
      if (!vals) return;
      applyValues(vals);
      overlay.remove();
      renderAll();
    }
    if (e.key === 'Escape') overlay.remove();
    e.stopPropagation();
  });

  h2.focus();
  h2.select();
}
