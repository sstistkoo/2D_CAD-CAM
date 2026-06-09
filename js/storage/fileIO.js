// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – File I/O (export/import projektů, DXF, CNC)       ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, showToast, pushUndo, displayX } from '../state.js';
import { COLORS } from '../constants.js';
import { updateObjectList, updateProperties, updateLayerList, updateMachineTypeBtn, updateXDisplayBtn } from '../ui.js';
import { calculateAllIntersections } from '../geometry.js';
import { bulgeToArc, exportFileName } from '../utils.js';
import { parseDXF, exportDXF, exportDXFMaker } from '../dxf.js';
import { loadFont, isVectorTextAvailable } from '../lib/fontLoader.js';
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
        state.flipX = !!data.flipX;
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

/** Exportuje projekt jako DXF soubor (Maker.js → validní formát pro Fusion 360). */
export async function exportDXFFile() {
  if (state.objects.length === 0) {
    showToast('Žádné objekty k exportu');
    return;
  }
  // Pokud projekt obsahuje text a font ještě není načtený, počkáme na něj –
  // text se pak v DXF vygeneruje jako vektorové cesty místo TEXT entity.
  const hasText = state.objects.some(o => o && o.type === 'text');
  if (hasText && !isVectorTextAvailable()) {
    try { await loadFont(); } catch (e) { /* nepodstatné – fallback uvnitř */ }
  }

  // Primárně robustní export přes Maker.js; fallback na manuální generátor.
  let dxfText = null;
  try {
    dxfText = exportDXFMaker(state.objects, state.layers);
  } catch (err) {
    console.error('Maker.js DXF export selhal, použiji fallback:', err);
  }
  if (!dxfText) dxfText = exportDXF(state.objects, state.layers);

  const blob = new Blob([dxfText], { type: 'application/dxf' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = exportFileName('dxf');
  a.click();
  URL.revokeObjectURL(a.href);
  const note = hasText && isVectorTextAvailable() ? ' (text → vektor)' : '';
  showToast(`Exportováno ${state.objects.length} objektů do DXF${note}`);
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
export function showFileDialog() {
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
}
document.getElementById("btnLoad")?.addEventListener("click", showFileDialog);
bridge.showFileDialog = showFileDialog;

// ── CNC Export ──
function runCncExport() {
  // Pokud jsou označeny objekty (profil), exportovat pouze je; jinak vše.
  const selectedIndices = new Set();
  if (state.multiSelected && state.multiSelected.size > 0) {
    state.multiSelected.forEach(i => selectedIndices.add(i));
  } else if (state.selected !== null && state.selected !== undefined) {
    selectedIndices.add(state.selected);
  }
  const exportObjects = selectedIndices.size > 0
    ? state.objects.filter((_, i) => selectedIndices.has(i))
    : state.objects;

  const isInc = state.cncOutputMode === 'inc';
  // Spodní obrábění (X+ dolů / zadní nožová hlava): osa X má obrácený smysl,
  // proto se G2↔G3 zapisují prohozeně. Hodnoty X (poloměr) zůstávají kladné a stejné.
  const flipArc = (code) => state.flipX ? (code === 'G02' ? 'G03' : 'G02') : code;
  let out = "; === SKICA – CNC Soustružník (X,Z) ===\n";
  out += `; Datum: ${new Date().toLocaleString("cs")}\n`;
  out += `; Počet objektů: ${exportObjects.length}${selectedIndices.size > 0 ? ' (vybraný profil)' : ''}\n`;
  out += `; Průsečíků: ${state.intersections.length}\n`;
  out += `; Režim: ${isInc ? 'Inkrementální (INC)' : 'Absolutní (ABS)'}\n`;
  if (state.flipX) out += "; Obrábění zespodu (X+ dolů) – G2/G3 prohozeny\n";
  const [_gH, _gV] = state.machineType === 'karusel' ? ['X','Z'] : ['Z','X'];
  if (isInc) out += `; Reference: ${_gH}${state.incReference.x.toFixed(3)} ${_gV}${state.incReference.y.toFixed(3)}\n`;
  out += "\n";
  out += "G28 ; Návrat do referenčního bodu\n";
  out += isInc ? "\n" : "G90 ; Absolutní režim\n\n";

  let prevX = isInc ? state.incReference.x : 0;
  let prevY = isInc ? state.incReference.y : 0;
  let lastEndX = null;
  let lastEndY = null;
  let _firstRapidDone = false;  // G91: první G00 jede absolutně (G90), pak přepneme G91
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
  function fmtCoordAbs(x, y) {
    const xVal = state.machineType === 'karusel' ? displayX(x) : x;
    const yVal = state.machineType === 'karusel' ? y : displayX(y);
    return `${_gH}${xVal.toFixed(3)} ${_gV}${yVal.toFixed(3)}`;
  }
  function emitRapid(x, y) {
    if (isInc && !_firstRapidDone) {
      out += `G00 ${fmtCoordAbs(x, y)} G90\n`;
      out += `G91 ; Inkrementální režim\n`;
      prevX = x; prevY = y;
      _firstRapidDone = true;
    } else {
      out += `G00 ${fmtCoord(x, y)}\n`;
      prevX = x; prevY = y;
    }
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
  // Roztřídíme objekty na (a) konturu a (b) polotovar. Oba se exportují
  // do G-kódu samostatnými sekcemi, aby je CAM (i externí parser) uměl
  // rozlišit – polotovar mezi značkami STOCK_START / STOCK_END.
  const items = [];
  const stockItems = [];
  let _seqNum = 0;
  for (const obj of exportObjects) {
    if (obj.type === 'constr') continue;
    if (obj.type === 'text') continue;
    if (obj.isDimension || obj.isCoordLabel) continue;
    _seqNum++;
    const cleanName = (obj.name || '').replace(/\s+\d+\s*$/, '') || obj.type;
    // Objekt považujeme za polotovar pokud má isStock=true NEBO pokud je pojmenovaný
    // "Polotovar" (prefix bez čísla) — to pokrývá případ kde isStock byl nesprávně false.
    const _nameIsStock = cleanName.toLowerCase() === 'polotovar';
    const target = (obj.isStock || _nameIsStock) ? stockItems : items;
    const seqLabel = `${cleanName} ${_seqNum}`;

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

      // Orient right-to-left jen u kontury. U polotovaru je orientace
      // diktována chain pořadím (orientation by chain rozbil → G00 skoky).
      if (!obj.isStock && x1 < x2) { [x1, x2] = [x2, x1]; [y1, y2] = [y2, y1]; }

      target.push({
        type: 'line', name: seqLabel,
        x1, y1, x2, y2,
        _sortX: Math.max(x1, x2)
      });
    } else if (obj.type === 'point') {
      target.push({ ...obj, name: seqLabel, _sortX: obj.x });
    } else if (obj.type === 'circle') {
      target.push({ ...obj, name: seqLabel, _sortX: obj.cx + obj.r });
    } else if (obj.type === 'arc') {
      // _sortX podle pravějšího ENDPOINTU oblouku (ne cx+r, který je extrémně
      // vlevo když má oblouk velký poloměr s endpointy blízko sebe). Bez toho
      // by sort u kontury reorganizoval segmenty před úsečku mezi obloukama
      // a fileIO musel vkládat zbytečné G00 přejezdy → po round-tripu
      // se chain rozbil na duplikované úsečky.
      const aSx = obj.cx + obj.r * Math.cos(obj.startAngle);
      const aEx = obj.cx + obj.r * Math.cos(obj.endAngle);
      target.push({ ...obj, name: seqLabel, _sortX: Math.max(aSx, aEx) });
    } else if (obj.type === 'rect') {
      let rx1 = obj.x1, ry1 = obj.y1, rx2 = obj.x2, ry2 = obj.y2;
      if (!obj.isStock && rx1 < rx2) { [rx1, rx2] = [rx2, rx1]; [ry1, ry2] = [ry2, ry1]; }
      target.push({ ...obj, name: seqLabel, x1: rx1, y1: ry1, x2: rx2, y2: ry2, _sortX: Math.max(rx1, rx2) });
    } else if (obj.type === 'polyline') {
      target.push({ ...obj, name: seqLabel, _sortX: Math.max(...obj.vertices.map(v => v.x)) });
    }
  }

  // Sort right to left (highest X first) — jen kontura.
  items.sort((a, b) => b._sortX - a._sortX);

  // Chain-sort polotovaru: seřadíme objekty tak, aby konec[i] navazoval na
  // začátek[i+1]. Pokud je třeba, otočíme orientaci segmentu. Tím zajistíme,
  // že emitor nevloží G00 rapidy mezi navazující segmenty polotovaru a celý
  // polotovar vyjde jako jeden spojitý tvar.
  if (stockItems.length > 1) {
    function _getEp(obj) {
      switch (obj.type) {
        case 'line':   return { sx: obj.x1, sy: obj.y1, ex: obj.x2, ey: obj.y2 };
        case 'arc': {
          const sx = obj.cx + obj.r * Math.cos(obj.startAngle);
          const sy = obj.cy + obj.r * Math.sin(obj.startAngle);
          const ex = obj.cx + obj.r * Math.cos(obj.endAngle);
          const ey = obj.cy + obj.r * Math.sin(obj.endAngle);
          return { sx, sy, ex, ey };
        }
        case 'polyline': {
          const vv = obj.vertices;
          return { sx: vv[0].x, sy: vv[0].y, ex: vv[vv.length - 1].x, ey: vv[vv.length - 1].y };
        }
        default: return null;
      }
    }
    function _revObj(obj) {
      switch (obj.type) {
        case 'line':
          return { ...obj, x1: obj.x2, y1: obj.y2, x2: obj.x1, y2: obj.y1 };
        case 'arc':
          return { ...obj, startAngle: obj.endAngle, endAngle: obj.startAngle, ccw: !(obj.ccw !== false) };
        case 'polyline': {
          const rev = [...obj.vertices].reverse();
          const n = obj.vertices.length;
          const rb = [];
          for (let i = 0; i < n - 1; i++) rb[i] = -(obj.bulges[n - 2 - i] || 0);
          return { ...obj, vertices: rev, bulges: rb };
        }
        default: return obj;
      }
    }
    // Najdi volný startovní konec (není spojen s žádným jiným koncem).
    const EPS = 0.05;
    const eps_arr = stockItems.map(_getEp); // null pro typy bez endpointů
    function _isFreeEnd(x, y) {
      let cnt = 0;
      for (const ep of eps_arr) {
        if (!ep) continue;
        if (Math.hypot(ep.sx - x, ep.sy - y) < EPS) cnt++;
        if (Math.hypot(ep.ex - x, ep.ey - y) < EPS) cnt++;
      }
      return cnt <= 1;
    }
    // Najdi startovní item (jehož start je volný konec).
    // Přeskočíme položky bez endpointů (circle) — ty nemohou zahájit chain.
    let startIdx = -1;
    // Nejdřív hledej skutečný volný konec
    outer: for (let i = 0; i < stockItems.length; i++) {
      const ep = eps_arr[i]; if (!ep) continue;
      if (_isFreeEnd(ep.sx, ep.sy)) { startIdx = i; break outer; }
      if (_isFreeEnd(ep.ex, ep.ey)) {
        stockItems[i] = _revObj(stockItems[i]);
        eps_arr[i] = _getEp(stockItems[i]);
        startIdx = i; break outer;
      }
    }
    // U uzavřeného obrysu není žádný volný konec → začni prvním chainovatelným segmentem
    if (startIdx === -1) {
      for (let i = 0; i < stockItems.length; i++) {
        if (eps_arr[i]) { startIdx = i; break; }
      }
    }
    if (startIdx === -1) startIdx = 0; // fallback: všechno jsou circles apod.
    // Greedy chain-sort od startIdx
    const used = new Array(stockItems.length).fill(false);
    const sorted = [];
    used[startIdx] = true;
    sorted.push(stockItems[startIdx]);
    let curEnd = eps_arr[startIdx] ? { x: eps_arr[startIdx].ex, y: eps_arr[startIdx].ey } : null;
    for (let iter = 0; iter < stockItems.length - 1 && curEnd; iter++) {
      let found = false;
      for (let i = 0; i < stockItems.length; i++) {
        if (used[i]) continue;
        const ep = _getEp(stockItems[i]); if (!ep) continue;
        if (Math.hypot(ep.sx - curEnd.x, ep.sy - curEnd.y) < EPS) {
          used[i] = true; sorted.push(stockItems[i]);
          curEnd = { x: ep.ex, y: ep.ey }; found = true; break;
        }
        if (Math.hypot(ep.ex - curEnd.x, ep.ey - curEnd.y) < EPS) {
          stockItems[i] = _revObj(stockItems[i]);
          used[i] = true; sorted.push(stockItems[i]);
          const rep = _getEp(stockItems[i]);
          curEnd = rep ? { x: rep.ex, y: rep.ey } : null; found = true; break;
        }
      }
      if (!found) break;
    }
    // Přidej zbývající nepřipojené položky
    for (let i = 0; i < stockItems.length; i++) if (!used[i]) sorted.push(stockItems[i]);
    stockItems.length = 0; sorted.forEach(s => stockItems.push(s));
  }

  // Společný emitor jednoho objektu (přepoužit pro konturu i polotovar)
  function emitObj(obj) {
    switch (obj.type) {
      case "point":
        out += `; ${obj.name}\n`;
        if (needsRapid(obj.x, obj.y)) emitRapid(obj.x, obj.y);
        lastEndX = obj.x; lastEndY = obj.y;
        break;
      case "line":
        out += `; ${obj.name} (délka: ${Math.hypot(obj.x2 - obj.x1, obj.y2 - obj.y1).toFixed(3)})\n`;
        if (needsRapid(obj.x1, obj.y1)) emitRapid(obj.x1, obj.y1);
        out += `G01 ${fmtCoord(obj.x2, obj.y2)}\n`;
        lastEndX = obj.x2; lastEndY = obj.y2;
        break;
      case "circle": {
        out += `; ${obj.name} (R: ${obj.r.toFixed(3)})\n`;
        const cStartX = obj.cx + obj.r, cStartY = obj.cy;
        if (needsRapid(cStartX, cStartY)) emitRapid(cStartX, cStartY);
        const circG = flipArc('G02');
        if (isInc) {
          out += `${circG} X${(-2 * obj.r).toFixed(3)} Z0.000 I${(-obj.r).toFixed(3)} K0.000\n`;
          prevX = obj.cx - obj.r; prevY = obj.cy;
          out += `${circG} X${(2 * obj.r).toFixed(3)} Z0.000 I${obj.r.toFixed(3)} K0.000\n`;
          prevX = obj.cx + obj.r; prevY = obj.cy;
        } else {
          out += `${circG} X${(obj.cx - obj.r).toFixed(3)} Z${obj.cy.toFixed(3)} I${(-obj.r).toFixed(3)} K0.000\n`;
          out += `${circG} X${(obj.cx + obj.r).toFixed(3)} Z${obj.cy.toFixed(3)} I${obj.r.toFixed(3)} K0.000\n`;
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
        if (needsRapid(sx, sy)) emitRapid(sx, sy);
        // Jednotná logika pro konturu i polotovar: G2/G3 z `ccw` flagu.
        //  • CAD ccw=true  (canvas anticlockwise=true) = svět CCW = G03
        //  • CAD ccw=false                              = svět CW  = G02
        //  • undefined ccw (legacy/fillet bez nastavení) → default true → G03
        // Cross-product přístup picknul „kratší" arc kolem středu bez ohledu
        // na uživatelův záměr (krátký/dlouhý), takže round-trip CAD→CAM→CAD
        // prohazoval oblouky. ccw flag tu informaci nese spolehlivě.
        const arcG = flipArc(obj.ccw === false ? 'G02' : 'G03');
        out += `${arcG} ${fmtCoord(ex, ey)} R${obj.r.toFixed(3)}\n`;
        lastEndX = ex; lastEndY = ey;
        break;
      }
      case "rect":
        out += `; ${obj.name} (${Math.abs(obj.x2 - obj.x1).toFixed(2)} × ${Math.abs(obj.y2 - obj.y1).toFixed(2)})\n`;
        if (needsRapid(obj.x1, obj.y1)) emitRapid(obj.x1, obj.y1);
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
          emitRapid(obj.vertices[0].x, obj.vertices[0].y);
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
              const gCode = flipArc(pb < 0 ? 'G02' : 'G03');
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
  }

  out += "; --- Objekty (zprava doleva) ---\n";
  items.forEach(emitObj);

  // Polotovar – samostatná sekce mezi STOCK_START / STOCK_END značkami.
  // CAM (i externí parser) tak může konturu a polotovar přijmout odděleně.
  if (stockItems.length > 0) {
    // Odfiltruj degenerované úsečky (délka ≈ 0) — vznikají jako artefakty
    // chain-sortu nebo boolean operací a způsobují zbytečné G00 rapidy.
    for (let i = stockItems.length - 1; i >= 0; i--) {
      const _o = stockItems[i];
      if (_o.type === 'line' && Math.hypot(_o.x2 - _o.x1, _o.y2 - _o.y1) < 1e-3) {
        stockItems.splice(i, 1);
      }
    }
    // Reset polohy mezi sekcemi: další G00 v polotovaru musí být vždy emitován,
    // i kdyby náhodou souřadnice navazovala na poslední bod kontury.
    lastEndX = null; lastEndY = null;
    out += "; STOCK_START — polotovar (isStock objekty)\n";
    stockItems.forEach(emitObj);
    out += "; STOCK_END\n\n";
  }

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
  document.getElementById("cncOutput").value = out;
  return out;
}

function copyCncToClipboard() {
  const out = document.getElementById("cncOutput").value;
  if (!out) {
    runCncExport();
  }
  const text = document.getElementById("cncOutput").value;
  navigator.clipboard
    .writeText(text)
    .then(() => showToast("CNC export zkopírován do schránky"))
    .catch(() => showToast("Nelze zkopírovat do schránky"));
}

document.getElementById("btnExport")?.addEventListener("click", () => {
  runCncExport();
  copyCncToClipboard();
});
document.getElementById("btnCncMode").addEventListener("click", () => {
  state.cncOutputMode = state.cncOutputMode === 'abs' ? 'inc' : 'abs';
  document.getElementById("btnCncMode").textContent = state.cncOutputMode === 'abs' ? 'G90' : 'G91';
  runCncExport();
});
document.getElementById("btnCncEdit").addEventListener("click", () => {
  let code = document.getElementById("cncOutput").value;
  if (!code) { runCncExport(); code = document.getElementById("cncOutput").value; }
  openCncEditor(code);
});
document.getElementById("btnCncToCam").addEventListener("click", () => {
  const code = document.getElementById("cncOutput").value;
  if (!code) { showToast("CNC kód je prázdný"); return; }
  try {
    const objs = parseGcodeToObjects(code);
    if (!objs.length) { showToast("Nenalezeny žádné pohyby v kódu"); return; }
    pushUndo();
    state.objects = state.objects.filter(o => o.isDimension || o.isCoordLabel);
    objs.forEach(o => state.objects.push(o));
    calculateAllIntersections();
    updateObjectList();
    updateProperties();
    autoCenterView();
    showToast(`Vykresleno ${objs.length} objektů z CNC kódu`);
  } catch (e) {
    showToast("Chyba při parsování kódu: " + e.message);
  }
});
bridge.runCncExport = runCncExport;

// ── CNC Uložit / Načíst ──

function saveCncFile() {
  let code = document.getElementById("cncOutput").value;
  if (!code) { runCncExport(); code = document.getElementById("cncOutput").value; }
  if (!code) { showToast("Žádný CNC kód k uložení"); return; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([code], { type: "text/plain" }));
  a.download = exportFileName("mpf");
  a.click();
}

function importCncFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".mpf,.nc,.txt,.cnc";
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const objs = parseGcodeToObjects(ev.target.result);
        if (!objs.length) { showToast("Nenalezeny žádné pohyby v souboru"); return; }
        pushUndo();
        objs.forEach(o => state.objects.push(o));
        calculateAllIntersections();
        updateObjectList();
        updateProperties();
        autoCenterView();
        runCncExport();
        showToast(`Načteno ${objs.length} objektů z G-kódu`);
      } catch (e) {
        showToast("Chyba při načítání G-kódu: " + e.message);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function parseGcodeToObjects(code) {
  const isKarusel = state.machineType === 'karusel';
  const isDiam = state.xDisplayMode === 'diameter';
  // soustruh: Z = canvas x, X = canvas y (poloměr)
  // karusel:  X = canvas x, Z = canvas y
  function toCanvas(gZ, gX) {
    const xRaw = isDiam ? gX / 2 : gX;
    return isKarusel ? { x: gX, y: gZ } : { x: gZ, y: xRaw };
  }

  // Bezpečné vyhodnocení aritmetického výrazu (pouze číslice, +−×÷, tečka, e)
  function evalExpr(s) {
    if (s == null) return null;
    s = String(s).replace(/[\[\]()]/g, '').trim();
    if (!s || !/^[0-9eE.+\-*\/\s]+$/.test(s)) return null;
    try {
      // eslint-disable-next-line no-new-func
      const v = Function('"use strict"; return (' + s + ')')();
      return isFinite(v) ? v : null;
    } catch { return null; }
  }

  // Extrakce číselné hodnoty adresy (X, Z, R, I, K…) z řádku.
  // Podporuje: čísla, znaménka, výrazy (X10+5, X10/2), mezery (X 10), rovnítko (X=10).
  function getAddr(line, letter) {
    const re = new RegExp(
      '(?:^|[^A-Za-z])' + letter +
      '\\s*=?\\s*([+\\-]?\\s*(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+\\-]?\\d+)?' +
      '(?:\\s*[+\\-\\*\\/]\\s*(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+\\-]?\\d+)?)*)',
      'i'
    );
    const m = re.exec(line);
    return m ? evalExpr(m[1]) : null;
  }

  const objs = [];
  let cx = 0, cy = 0;     // aktuální poloha v canvas souřadnicích
  let gMode = 90;          // 90=absolutní, 91=inkrementální (modální – platí dokud není změněno)
  let motionCode = 0;      // poslední pohybový kód (modální G0/1/2/3)
  let inStock = false;

  for (const rawLine of code.split('\n')) {
    // Detekce STOCK markerů před odstraněním komentářů
    if (/STOCK_START/i.test(rawLine)) { inStock = true; continue; }
    if (/STOCK_END/i.test(rawLine))   { inStock = false; continue; }

    // Odstraň komentáře: (text) Fanuc styl, ; do konce řádku
    let line = rawLine
      .replace(/\([^)]*\)/g, ' ')
      .replace(/;.*$/, '')
      .trim();

    if (!line || line === '%') continue;         // oddělovač programu
    if (/#\d/.test(line)) continue;              // Fanuc makro proměnné #1, #100 …
    line = line.replace(/\[([^\]]*)\]/g, '$1');  // [výraz] → výraz (aritmetika)
    line = line.replace(/^\s*N\s*\d+\s*/i, '').trim(); // číslo bloku N10, N0020

    // Zpracuj G-slova na řádku (G0=G00, G1=G01 atd.)
    const gs = [];
    const reG = /\bG\s*(0*\d{1,2})(?!\d)/gi;
    let gm;
    while ((gm = reG.exec(line)) !== null) gs.push(parseInt(gm[1], 10));

    // Aktualizace modálních stavů (platí dokud nejsou přepsány)
    if (gs.includes(90)) gMode = 90;
    if (gs.includes(91)) gMode = 91;
    if (gs.some(g => g === 0)) motionCode = 0;
    if (gs.some(g => g === 1)) motionCode = 1;
    if (gs.some(g => g === 2)) motionCode = 2;
    if (gs.some(g => g === 3)) motionCode = 3;

    // Zjisti souřadnice na řádku
    const gZval = getAddr(line, 'Z');
    const gXval = getAddr(line, 'X');
    if (gZval === null && gXval === null) continue;

    // Efektivní pohybový G-kód: explicitní na tomto řádku nebo poslední modální
    const thisMotion = gs.find(g => g <= 3) ?? motionCode;

    // Výpočet cílového bodu v canvas souřadnicích
    let tx, ty;
    if (gMode === 91) {
      // Inkrementální: přičti zadané osy, nezadané zůstanou
      const dPt = toCanvas(gZval ?? 0, gXval ?? 0);
      tx = cx + (gZval !== null ? dPt.x : 0);
      ty = cy + (gXval !== null ? dPt.y : 0);
    } else {
      // Absolutní: nezadaná osa zůstane na aktuální poloze
      const curGZ = isKarusel ? cy : cx;
      const curGX = isKarusel ? cx : (isDiam ? cy * 2 : cy);
      const absPt = toCanvas(gZval ?? curGZ, gXval ?? curGX);
      tx = absPt.x;
      ty = absPt.y;
    }

    if (thisMotion === 0) { cx = tx; cy = ty; continue; } // G00 rapid

    if (thisMotion === 1) {
      if (Math.hypot(tx - cx, ty - cy) > 1e-4) {
        objs.push({ type: 'line', id: state.nextId++, name: 'Úsečka',
          x1: cx, y1: cy, x2: tx, y2: ty, isStock: inStock });
      }
      cx = tx; cy = ty;
      continue;
    }

    if (thisMotion === 2 || thisMotion === 3) {
      const gRval = getAddr(line, 'R');
      const gIval = getAddr(line, 'I');  // offset středu v X od aktuální polohy
      const gKval = getAddr(line, 'K');  // offset středu v Z od aktuální polohy
      const dx = tx - cx, dy = ty - cy;
      const dist2 = dx * dx + dy * dy;
      let acx, acy;

      if (gIval !== null || gKval !== null) {
        // Formát I/K: střed = aktuální poloha + (I=ΔX, K=ΔZ)
        const off = toCanvas(gKval ?? 0, gIval ?? 0);
        acx = cx + off.x;
        acy = cy + off.y;
      } else if (gRval !== null) {
        // Formát R: R<0 = velký oblouk (>180°), R>0 = malý oblouk
        const isLong = gRval < 0;
        const absR = Math.abs(gRval);
        if (dist2 < 1e-8 || absR * absR < dist2 / 4 - 1e-6) { cx = tx; cy = ty; continue; }
        const h = Math.sqrt(Math.max(0, absR * absR - dist2 / 4));
        const dist = Math.sqrt(dist2);
        const nx = -dy / dist, ny = dx / dist;
        const sBase = thisMotion === 2 ? -1 : 1;
        const sign = isLong ? -sBase : sBase;
        acx = (cx + tx) / 2 + sign * h * nx;
        acy = (cy + ty) / 2 + sign * h * ny;
      } else { cx = tx; cy = ty; continue; }

      const R = Math.hypot(cx - acx, cy - acy);
      if (R < 1e-6) { cx = tx; cy = ty; continue; }
      const startA = Math.atan2(cy - acy, cx - acx);
      const endA   = Math.atan2(ty - acy, tx - acx);
      objs.push({ type: 'arc', id: state.nextId++, name: 'Oblouk',
        cx: acx, cy: acy, r: R, startAngle: startA, endAngle: endA,
        ccw: thisMotion === 3, isStock: inStock });
      cx = tx; cy = ty;
    }
  }
  return chainToPolylines(objs);
}

// Spojí za sebou navazující line/arc objekty do polyline (kontury).
// Segmenty navazují pokud konec jednoho = začátek druhého (tolerance 1e-3).
function chainToPolylines(objs) {
  const EPS = 1e-3;
  function eq(a, b) { return Math.abs(a - b) < EPS; }
  function endPt(o) {
    if (o.type === 'line') return { x: o.x2, y: o.y2 };
    if (o.type === 'arc')  return { x: o.cx + o.r * Math.cos(o.endAngle), y: o.cy + o.r * Math.sin(o.endAngle) };
    return null;
  }
  function startPt(o) {
    if (o.type === 'line') return { x: o.x1, y: o.y1 };
    if (o.type === 'arc')  return { x: o.cx + o.r * Math.cos(o.startAngle), y: o.cy + o.r * Math.sin(o.startAngle) };
    return null;
  }
  // Výpočet bulge pro oblouk (tan(θ/4), kladný=CCW, záporný=CW)
  function arcBulge(o) {
    let dA = o.endAngle - o.startAngle;
    if (o.ccw) { if (dA <= 0) dA += 2 * Math.PI; }
    else        { if (dA >= 0) dA -= 2 * Math.PI; }
    const b = Math.tan(dA / 4);
    return o.ccw ? b : -Math.abs(b);
  }

  const result = [];
  const used = new Array(objs.length).fill(false);

  for (let i = 0; i < objs.length; i++) {
    if (used[i]) continue;
    const o = objs[i];
    if (o.type !== 'line' && o.type !== 'arc') { result.push(o); used[i] = true; continue; }

    // Zkus sestavit řetězec začínající od i
    const chain = [o];
    used[i] = true;

    let tail = endPt(o);
    while (tail) {
      let found = false;
      for (let j = 0; j < objs.length; j++) {
        if (used[j]) continue;
        if (objs[j].type !== 'line' && objs[j].type !== 'arc') continue;
        const sp = startPt(objs[j]);
        if (sp && eq(sp.x, tail.x) && eq(sp.y, tail.y)) {
          chain.push(objs[j]);
          used[j] = true;
          tail = endPt(objs[j]);
          found = true;
          break;
        }
      }
      if (!found) break;
    }

    if (chain.length === 1) {
      result.push(chain[0]);
      continue;
    }

    // Sestav polyline z řetězce
    const vertices = [];
    const bulges = [];
    const isStock = chain[0].isStock;
    for (const seg of chain) {
      const sp = startPt(seg);
      vertices.push({ x: sp.x, y: sp.y });
      bulges.push(seg.type === 'arc' ? arcBulge(seg) : 0);
    }
    // Přidej koncový bod posledního segmentu
    const lastEnd = endPt(chain[chain.length - 1]);
    const closed = eq(lastEnd.x, vertices[0].x) && eq(lastEnd.y, vertices[0].y);
    if (!closed) {
      vertices.push({ x: lastEnd.x, y: lastEnd.y });
      bulges.push(0);
    }

    result.push({
      type: 'polyline',
      id: state.nextId++,
      name: isStock ? 'Polotovar' : 'Kontura',
      vertices,
      bulges,
      closed,
      isStock: !!isStock,
    });
  }
  return result;
}

document.getElementById("btnCncSave").addEventListener("click", saveCncFile);
document.getElementById("btnCncLoad").addEventListener("click", importCncFile);
