// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – File I/O (export/import projektů, DXF, CNC)       ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, showToast, pushUndo, displayX } from '../state.js';
import { COLORS } from '../constants.js';
import { updateObjectList, updateProperties, updateLayerList, updateMachineTypeBtn, updateXDisplayBtn } from '../ui.js';
import { calculateAllIntersections } from '../geometry.js';
import { bulgeToArc } from '../utils.js';
import { parseDXF, exportDXF } from '../dxf.js';
import { autoCenterView } from '../canvas.js';
import { bridge } from '../bridge.js';
import { openCncEditor } from '../calculators/cncEditor.js';
import { openCamSimulator } from '../calculators/camSimulator.js';
import { loadProject } from './projectManager.js';
import { showExportImageDialog } from './exportImage.js';

// ── Export / Import ──

/** Exportuje projekt jako .skica JSON soubor. */
export function exportProjectFile() {
  const data = {
    version: 3,
    objects: state.objects,
    intersections: state.intersections,
    nextId: state.nextId,
    gridSize: state.gridSize,
    coordMode: state.coordMode,
    incReference: state.incReference,
    machineType: state.machineType,
    xDisplayMode: state.xDisplayMode,
    layers: state.layers,
    activeLayer: state.activeLayer,
    nextLayerId: state.nextLayerId,
    showObjectNumbers: state.showObjectNumbers,
    showIntersectionNumbers: state.showIntersectionNumbers,
    anchors: state.anchors,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "skica_projekt.json";
  a.click();
  URL.revokeObjectURL(a.href);
  showToast("Projekt exportován jako soubor");
}

/** Importuje .skica JSON soubor. */
const VALID_OBJ_TYPES = ['point', 'line', 'constr', 'circle', 'arc', 'rect', 'polyline', 'text'];
const MAX_IMPORT_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_OBJECTS = 10000;

function validateImportData(data) {
  if (!data || typeof data !== 'object') throw new Error("Neplatná data");
  const objs = data.objects;
  if (!Array.isArray(objs)) throw new Error("Chybí pole objektů");
  if (objs.length > MAX_OBJECTS) throw new Error(`Příliš mnoho objektů (max ${MAX_OBJECTS})`);
  for (let i = 0; i < objs.length; i++) {
    const o = objs[i];
    if (!o || typeof o !== 'object') throw new Error(`Neplatný objekt #${i}`);
    if (!VALID_OBJ_TYPES.includes(o.type)) throw new Error(`Neznámý typ "${o.type}" u objektu #${i}`);
    // Validate all numeric properties are finite
    for (const key of ['x','y','x1','y1','x2','y2','cx','cy','r','startAngle','endAngle']) {
      if (key in o && !isFinite(o[key])) throw new Error(`Neplatná souřadnice ${key} u objektu #${i}`);
    }
  }
}

export function importProjectFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > MAX_IMPORT_SIZE) {
      showToast(`Soubor je příliš velký (max ${MAX_IMPORT_SIZE / 1024 / 1024} MB)`);
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => {
      showToast('Chyba při čtení souboru');
    };
    reader.onload = (ev) => {
      try {
        let data = JSON.parse(ev.target.result);

        // Auto-detekce SimDxf formátu (points pole místo objects)
        if (Array.isArray(data.points) && !Array.isArray(data.objects)) {
          data = convertSimDxfToSkica(data);
        }

        validateImportData(data);
        pushUndo();
        state.objects = data.objects || [];
        state.nextId = data.nextId || 1;
        if (data.gridSize && data.gridSize > 0)
          state.gridSize = data.gridSize;
        if (data.coordMode) state.coordMode = data.coordMode;
        if (data.incReference) state.incReference = data.incReference;
        if (data.machineType) state.machineType = data.machineType;
        state.xDisplayMode = data.xDisplayMode || 'radius';
        if (data.showObjectNumbers !== undefined) state.showObjectNumbers = data.showObjectNumbers;
        if (data.showIntersectionNumbers !== undefined) state.showIntersectionNumbers = data.showIntersectionNumbers;
        state.anchors = data.anchors || [];
        if (data.layers) {
          state.layers = data.layers;
          state.activeLayer = data.activeLayer || 0;
          state.nextLayerId = data.nextLayerId || (data.layers.length > 0 ? Math.max(...data.layers.map(l => l.id)) + 1 : 1);
        } else {
          state.objects.forEach(obj => { if (obj.layer === undefined) obj.layer = 0; });
        }
        state.selected = null;
        state.multiSelected.clear();
        state.selectedPoint = null;
        updateObjectList();
        updateProperties();
        updateLayerList();
        calculateAllIntersections();
        updateMachineTypeBtn();
        updateXDisplayBtn();
        showToast(`Importováno ${state.objects.length} objektů`);
      } catch (err) {
        showToast("Chyba při čtení souboru");
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

/** Importuje DXF soubor. */
export function importDXFFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.dxf';
  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => {
      showToast('Chyba při čtení DXF souboru');
    };
    reader.onload = (ev) => {
      try {
        const { entities, errors } = parseDXF(ev.target.result);
        if (entities.length === 0) {
          showToast(errors.length > 0 ? `Chyba: ${errors[0]}` : 'Žádné entity v DXF souboru');
          return;
        }
        pushUndo();
        const typeNames = {
          point: 'Bod', line: 'Úsečka', circle: 'Kružnice',
          arc: 'Oblouk', polyline: 'Kontura', text: 'Text'
        };
        for (const entity of entities) {
          entity.id = state.nextId++;
          entity.name = `${typeNames[entity.type] || entity.type} ${entity.id}`;
          if (entity.layer === undefined) entity.layer = state.activeLayer;
          // Validate numeric coordinates before adding
          const numProps = ['x1','y1','x2','y2','cx','cy','r','startAngle','endAngle','x','y','fontSize'];
          let valid = true;
          for (const p of numProps) {
            if (p in entity && !isFinite(entity[p])) { valid = false; break; }
          }
          if (!valid) { errors.push(`Neplatné souřadnice v entitě ${entity.type}`); continue; }
          state.objects.push(entity);
        }
        state.selected = null;
        state.multiSelected.clear();
        state.selectedPoint = null;
        updateObjectList();
        updateProperties();
        calculateAllIntersections();
        autoCenterView();
        let msg = `Importováno ${entities.length} objektů z DXF`;
        if (errors.length > 0) msg += ` (${errors.length} varování)`;
        showToast(msg);
        if (errors.length > 0) console.warn('DXF import warnings:', errors);
      } catch (err) {
        showToast('Chyba při čtení DXF souboru');
        console.error('DXF import error:', err);
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

/** Exportuje projekt jako DXF soubor. */
export function exportDXFFile() {
  if (state.objects.length === 0) {
    showToast('Žádné objekty k exportu');
    return;
  }
  const dxfText = exportDXF(state.objects, state.layers);
  const blob = new Blob([dxfText], { type: 'application/dxf' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'skica_export.dxf';
  a.click();
  URL.revokeObjectURL(a.href);
  showToast(`Exportováno ${state.objects.length} objektů do DXF`);
}

/** Exportuje projekt jako JSON soubor kompatibilní se SimDxf konvertorem. */
function exportJsonCompatible() {
  exportProjectFile();
}

/**
 * Převádí SimDxf "points" formát na SKICA v3 objekty.
 * SimDxf formát: { version: "1.0", points: [{x, z, break, type, id, r?, cw?, cx?, cz?}], dimensions: [] }
 */
function convertSimDxfToSkica(data) {
  const points = data.points || [];
  const objects = [];
  let idCounter = 1;

  for (let i = 0; i < points.length - 1; i++) {
    const curr = points[i];
    const next = points[i + 1];
    if (next.break) continue;

    if (next.type === 'line') {
      objects.push({
        type: 'line',
        id: idCounter,
        name: `Úsečka ${idCounter}`,
        x1: curr.x, y1: curr.z,
        x2: next.x, y2: next.z,
        color: '#89b4fa',
        layer: 0,
      });
      idCounter++;
    } else if (next.type === 'arc') {
      const cx = next.cx, cy = next.cz, r = next.r;
      const startAngle = Math.atan2(curr.z - cy, curr.x - cx);
      const endAngle = Math.atan2(next.z - cy, next.x - cx);
      objects.push({
        type: 'arc',
        id: idCounter,
        name: `Oblouk ${idCounter}`,
        cx: cx, cy: cy, r: r,
        startAngle: next.cw ? endAngle : startAngle,
        endAngle: next.cw ? startAngle : endAngle,
        ccw: !next.cw,
        color: '#89b4fa',
        layer: 0,
      });
      idCounter++;
    }
  }

  return {
    version: 3,
    objects: objects,
    intersections: [],
    nextId: idCounter,
    gridSize: 10,
    coordMode: 'abs',
    machineType: (data.machineType || 'soustruh').toLowerCase(),
    xDisplayMode: 'radius',
    layers: [{ id: 0, name: 'Vrstva 0', color: '#89b4fa', visible: true }],
    activeLayer: 0,
    nextLayerId: 1,
    showObjectNumbers: false,
    showIntersectionNumbers: false,
    anchors: [],
  };
}

// ── Tlačítko Soubor (overlay) ──
document.getElementById("btnLoad").addEventListener("click", () => {
  const overlay = document.createElement("div");
  overlay.className = "input-overlay";
  overlay.innerHTML = `
    <div class="input-dialog">
      <h3>📂 Načíst / Uložit</h3>
      <div class="btn-row" style="flex-direction:column;gap:8px;align-items:stretch">
        <button class="btn-ok" id="loadLocal" style="width:100%">Načíst z paměti prohlížeče</button>
        <button class="btn-ok" id="loadFile" style="width:100%">Importovat ze souboru (.json)</button>
        <button class="btn-ok" id="loadDXF" style="width:100%">📐 Importovat DXF soubor (.dxf)</button>
        <button class="btn-ok" id="exportFile" style="width:100%;background:${COLORS.selected};border-color:${COLORS.selected}">Exportovat do souboru</button>
        <button class="btn-ok" id="exportJsonFile" style="width:100%;background:${COLORS.selected};border-color:${COLORS.selected}">📄 Exportovat JSON soubor</button>
        <button class="btn-ok" id="exportDXF" style="width:100%;background:${COLORS.selected};border-color:${COLORS.selected}">📐 Exportovat DXF</button>
        <button class="btn-ok" id="exportImage" style="width:100%;background:${COLORS.selected};border-color:${COLORS.selected}">🖼 Export obrazu (SVG/PNG)</button>
        <button class="btn-cancel btn-cancel-overlay" style="width:100%">Zrušit</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("#loadLocal").addEventListener("click", () => {
    overlay.remove();
    loadProject();
  });
  overlay.querySelector("#loadFile").addEventListener("click", () => {
    overlay.remove();
    importProjectFile();
  });
  overlay.querySelector("#loadDXF").addEventListener("click", () => {
    overlay.remove();
    importDXFFile();
  });
  overlay.querySelector("#exportFile").addEventListener("click", () => {
    overlay.remove();
    exportProjectFile();
  });
  overlay.querySelector("#exportJsonFile").addEventListener("click", () => {
    overlay.remove();
    exportJsonCompatible();
  });
  overlay.querySelector("#exportDXF").addEventListener("click", () => {
    overlay.remove();
    exportDXFFile();
  });
  overlay.querySelector("#exportImage").addEventListener("click", () => {
    overlay.remove();
    showExportImageDialog();
  });
});

// ── CNC Export ──
function runCncExport() {
  const isInc = state.coordMode === 'inc';
  let out = "; === SKICA – CNC Soustružník (X,Z) ===\n";
  out += `; Datum: ${new Date().toLocaleString("cs")}\n`;
  out += `; Počet objektů: ${state.objects.length}\n`;
  out += `; Průsečíků: ${state.intersections.length}\n`;
  out += `; Režim: ${isInc ? 'Inkrementální (INC)' : 'Absolutní (ABS)'}\n`;
  const [_gH, _gV] = state.machineType === 'karusel' ? ['X','Z'] : ['Z','X'];
  if (isInc) out += `; Reference: ${_gH}${state.incReference.x.toFixed(3)} ${_gV}${state.incReference.y.toFixed(3)}\n`;
  out += "\n";
  out += "G28 ; Návrat do referenčního bodu\n";
  out += isInc ? "G91 ; Inkrementální režim\n\n" : "G90 ; Absolutní režim\n\n";

  let prevX = isInc ? state.incReference.x : 0;
  let prevY = isInc ? state.incReference.y : 0;
  let lastEndX = null;
  let lastEndY = null;
  function fmtCoord(x, y) {
    // V CNC exportu: soustruh → y je osa X, karusel → x je osa X
    const xVal = state.machineType === 'karusel' ? displayX(x) : x;
    const yVal = state.machineType === 'karusel' ? y : displayX(y);
    if (isInc) {
      const dx = x - prevX;
      const dy = y - prevY;
      prevX = x;
      prevY = y;
      const dxDisp = state.machineType === 'karusel' ? displayX(dx) : dx;
      const dyDisp = state.machineType === 'karusel' ? dy : displayX(dy);
      return `${_gH}${dxDisp.toFixed(3)} ${_gV}${dyDisp.toFixed(3)}`;
    }
    return `${_gH}${xVal.toFixed(3)} ${_gV}${yVal.toFixed(3)}`;
  }

  function needsRapid(x, y) {
    if (lastEndX === null) return true;
    return Math.abs(x - lastEndX) > 5e-4 || Math.abs(y - lastEndY) > 5e-4;
  }

  // ── Helpers: trimming to intersections ──
  function isInsideAnyCircle(px, py) {
    return state.objects.some(o =>
      o.type === 'circle' && Math.hypot(px - o.cx, py - o.cy) < o.r - 0.01
    );
  }

  function ptOnSegment(px, py, ax, ay, bx, by) {
    const segLen = Math.hypot(bx - ax, by - ay);
    if (segLen < 1e-9) return false;
    const d1 = Math.hypot(px - ax, py - ay);
    const d2 = Math.hypot(px - bx, py - by);
    return Math.abs(d1 + d2 - segLen) < 0.1;
  }

  function nearestPt(pts, rx, ry) {
    let best = null, bestD = Infinity;
    for (const pt of pts) {
      const d = Math.hypot(pt.x - rx, pt.y - ry);
      if (d < bestD) { best = pt; bestD = d; }
    }
    return best;
  }

  // ── Pre-process: trim + orient right-to-left + sort ──
  const items = [];
  for (const obj of state.objects) {
    if (obj.type === 'constr') continue;
    if (obj.type === 'text') continue;
    if (obj.isDimension || obj.isCoordLabel) continue;

    if (obj.type === 'line') {
      let x1 = obj.x1, y1 = obj.y1, x2 = obj.x2, y2 = obj.y2;

      // Trim endpoints that are inside circles
      const onSeg = state.intersections.filter(pt =>
        ptOnSegment(pt.x, pt.y, x1, y1, x2, y2)
      );
      if (onSeg.length > 0) {
        if (isInsideAnyCircle(x1, y1)) {
          const p = nearestPt(onSeg, x1, y1);
          if (p) { x1 = p.x; y1 = p.y; }
        }
        if (isInsideAnyCircle(x2, y2)) {
          const p = nearestPt(onSeg, x2, y2);
          if (p) { x2 = p.x; y2 = p.y; }
        }
      }

      // Orient right to left (higher X first)
      if (x1 < x2) { [x1, x2] = [x2, x1]; [y1, y2] = [y2, y1]; }

      items.push({
        type: 'line', name: obj.name,
        x1, y1, x2, y2,
        _sortX: Math.max(x1, x2)
      });
    } else if (obj.type === 'point') {
      items.push({ ...obj, _sortX: obj.x });
    } else if (obj.type === 'circle') {
      items.push({ ...obj, _sortX: obj.cx + obj.r });
    } else if (obj.type === 'arc') {
      items.push({ ...obj, _sortX: obj.cx + obj.r });
    } else if (obj.type === 'rect') {
      // Orient right to left
      let rx1 = obj.x1, ry1 = obj.y1, rx2 = obj.x2, ry2 = obj.y2;
      if (rx1 < rx2) { [rx1, rx2] = [rx2, rx1]; [ry1, ry2] = [ry2, ry1]; }
      items.push({ ...obj, x1: rx1, y1: ry1, x2: rx2, y2: ry2, _sortX: Math.max(rx1, rx2) });
    } else if (obj.type === 'polyline') {
      items.push({ ...obj, _sortX: Math.max(...obj.vertices.map(v => v.x)) });
    }
  }

  // Sort right to left (highest X first)
  items.sort((a, b) => b._sortX - a._sortX);

  out += "; --- Objekty (zprava doleva) ---\n";
  items.forEach((obj) => {
    switch (obj.type) {
      case "point":
        out += `; ${obj.name}\n`;
        if (needsRapid(obj.x, obj.y)) out += `G00 ${fmtCoord(obj.x, obj.y)}\n`;
        lastEndX = obj.x; lastEndY = obj.y;
        break;
      case "line":
        out += `; ${obj.name} (délka: ${Math.hypot(obj.x2 - obj.x1, obj.y2 - obj.y1).toFixed(3)})\n`;
        if (needsRapid(obj.x1, obj.y1)) out += `G00 ${fmtCoord(obj.x1, obj.y1)}\n`;
        out += `G01 ${fmtCoord(obj.x2, obj.y2)}\n`;
        lastEndX = obj.x2; lastEndY = obj.y2;
        break;
      case "circle": {
        out += `; ${obj.name} (R: ${obj.r.toFixed(3)})\n`;
        const cStartX = obj.cx + obj.r, cStartY = obj.cy;
        if (needsRapid(cStartX, cStartY)) out += `G00 ${fmtCoord(cStartX, cStartY)}\n`;
        if (isInc) {
          out += `G02 X${(-2 * obj.r).toFixed(3)} Z0.000 I${(-obj.r).toFixed(3)} K0.000\n`;
          prevX = obj.cx - obj.r; prevY = obj.cy;
          out += `G02 X${(2 * obj.r).toFixed(3)} Z0.000 I${obj.r.toFixed(3)} K0.000\n`;
          prevX = obj.cx + obj.r; prevY = obj.cy;
        } else {
          out += `G02 X${(obj.cx - obj.r).toFixed(3)} Z${obj.cy.toFixed(3)} I${(-obj.r).toFixed(3)} K0.000\n`;
          out += `G02 X${(obj.cx + obj.r).toFixed(3)} Z${obj.cy.toFixed(3)} I${obj.r.toFixed(3)} K0.000\n`;
        }
        lastEndX = cStartX; lastEndY = cStartY;
        break;
      }
      case "arc": {
        out += `; ${obj.name} (R: ${obj.r.toFixed(3)})\n`;
        const sx = obj.cx + obj.r * Math.cos(obj.startAngle),
          sy = obj.cy + obj.r * Math.sin(obj.startAngle);
        const ex = obj.cx + obj.r * Math.cos(obj.endAngle),
          ey = obj.cy + obj.r * Math.sin(obj.endAngle);
        if (needsRapid(sx, sy)) out += `G00 ${fmtCoord(sx, sy)}\n`;
        const arcG = obj.ccw ? 'G03' : 'G02';
        out += `${arcG} ${fmtCoord(ex, ey)} R${obj.r.toFixed(3)}\n`;
        lastEndX = ex; lastEndY = ey;
        break;
      }
      case "rect":
        out += `; ${obj.name} (${Math.abs(obj.x2 - obj.x1).toFixed(2)} × ${Math.abs(obj.y2 - obj.y1).toFixed(2)})\n`;
        if (needsRapid(obj.x1, obj.y1)) out += `G00 ${fmtCoord(obj.x1, obj.y1)}\n`;
        out += `G01 ${fmtCoord(obj.x2, obj.y1)}\n`;
        out += `G01 ${fmtCoord(obj.x2, obj.y2)}\n`;
        out += `G01 ${fmtCoord(obj.x1, obj.y2)}\n`;
        out += `G01 ${fmtCoord(obj.x1, obj.y1)}\n`;
        lastEndX = obj.x1; lastEndY = obj.y1;
        break;
      case "polyline": {
        const pn = obj.vertices.length;
        const pSegCnt = obj.closed ? pn : pn - 1;
        out += `; ${obj.name} (${pn} vrcholů${obj.closed ? ', uzavřená' : ''})\n`;
        if (needsRapid(obj.vertices[0].x, obj.vertices[0].y)) {
          out += `G00 ${fmtCoord(obj.vertices[0].x, obj.vertices[0].y)}\n`;
        }
        for (let i = 0; i < pSegCnt; i++) {
          const pp2 = obj.vertices[(i + 1) % pn];
          const pb = obj.bulges[i] || 0;
          if (pb === 0) {
            out += `G01 ${fmtCoord(pp2.x, pp2.y)}\n`;
          } else {
            const pp1 = obj.vertices[i];
            const parc = bulgeToArc(pp1, pp2, pb);
            if (parc) {
              const gCode = pb < 0 ? 'G02' : 'G03';
              out += `${gCode} ${fmtCoord(pp2.x, pp2.y)} R${parc.r.toFixed(3)}\n`;
            } else {
              out += `G01 ${fmtCoord(pp2.x, pp2.y)}\n`;
            }
          }
        }
        const lastV = obj.closed ? obj.vertices[0] : obj.vertices[pn - 1];
        lastEndX = lastV.x; lastEndY = lastV.y;
        break;
      }
    }
    out += "\n";
  });

  if (state.intersections.length > 0) {
    out += "; --- Průsečíky ---\n";
    state.intersections.forEach((pt, i) => {
      const _ipx = state.machineType === 'karusel' ? displayX(pt.x) : pt.x;
      const _ipy = state.machineType === 'karusel' ? pt.y : displayX(pt.y);
      out += `; P${i + 1}: ${_gH}${_ipx.toFixed(3)} ${_gV}${_ipy.toFixed(3)}\n`;
    });
  }
  out += "\nG28 ; Návrat do referenčního bodu\nM30 ; Konec programu\n";
  out += "\n; === Konec ===\n";
  document.getElementById("cncOutput").textContent = out;
  return out;
}

function copyCncToClipboard() {
  const out = document.getElementById("cncOutput").textContent;
  if (!out) {
    runCncExport();
  }
  const text = document.getElementById("cncOutput").textContent;
  navigator.clipboard
    .writeText(text)
    .then(() => showToast("CNC export zkopírován do schránky"))
    .catch(() => showToast("Nelze zkopírovat do schránky"));
}

document.getElementById("btnExport")?.addEventListener("click", () => {
  runCncExport();
  copyCncToClipboard();
});
document.getElementById("btnCncCopy").addEventListener("click", copyCncToClipboard);
document.getElementById("btnCncEdit").addEventListener("click", () => {
  let code = document.getElementById("cncOutput").textContent;
  if (!code) { runCncExport(); code = document.getElementById("cncOutput").textContent; }
  openCncEditor(code);
});
document.getElementById("btnCncToCam").addEventListener("click", () => {
  let code = document.getElementById("cncOutput").textContent;
  if (!code) { runCncExport(); code = document.getElementById("cncOutput").textContent; }
  openCamSimulator(code);
});
bridge.runCncExport = runCncExport;
