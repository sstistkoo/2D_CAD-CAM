// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Správa projektů (multi-project)                    ║
// ╚══════════════════════════════════════════════════════════════╝

import { state, showToast, pushUndo, ensureStockLayer, updateUndoButtons } from '../state.js';
import { COLORS } from '../constants.js';
import { contourDefaultColor, stockDefaultColor } from '../drawColorPrefs.js';
import { updateObjectList, updateProperties, updateLayerList, updateStatusProject, updateMachineTypeBtn, updateXDisplayBtn, updateNullPointUI, updateDimsBtn } from '../ui.js';
import { calculateAllIntersections } from '../geometry.js';
import { saveProjectToDB, loadProjectFromDB, deleteProjectFromDB, getAllProjects, setMeta, getMeta } from '../idb.js';
import { deepClone, expandPolylineObjects } from '../utils.js';
import { saveSettings } from './settingsStore.js';
import { escapeHtml as _esc } from '../htmlEscape.js';
import { showConfirmDialog, makeInputOverlay } from '../dialogFactory.js';
import { thumbSVG } from './projectThumb.js';

// ── Pomocné funkce ──

async function _saveToProjects(name, data) {
  await saveProjectToDB(name, {
    ...data,
    savedAt: new Date().toISOString(),
    objectCount: (data.objects || []).length,
  });
}

/** Data výkresu k uložení (projekt, autosave, zavření okna). */
export function buildProjectData() {
  return {
    version: 4,
    // Název se ukládá i do rozkresleného výkresu – po obnovení stránky se
    // pak autosave a Ctrl+S dál zapisují do TOHO projektu, ne do „Bez názvu".
    projectName: state.projectName,
    // Geometrie nástroje (destička + držák) pro knihovnu nožů — čte se z CAM
    // přes bridge (S.params je closure), null když CAM v této relaci nebylo.
    camTool: (bridge.getCamToolGeometry && bridge.getCamToolGeometry()) || null,
    objects: state.objects,
    intersections: state.intersections,
    nextId: state.nextId,
    gridSize: state.gridSize,
    coordMode: state.coordMode,
    incReference: state.incReference,
    nullPointActive: state.nullPointActive,
    nullPointAngle: state.nullPointAngle,
    machineType: state.machineType,
    xDisplayMode: state.xDisplayMode,
    flipX: state.flipX,
    flipZ: state.flipZ,
    mirrorPreview: state.mirrorPreview,
    showContourGaps: state.showContourGaps,
    layers: state.layers,
    activeLayer: state.activeLayer,
    nextLayerId: state.nextLayerId,
    anchors: state.anchors,
    showObjectNumbers: state.showObjectNumbers,
    showIntersectionNumbers: state.showIntersectionNumbers,
    displayDecimals: state.displayDecimals,
    theme: state.theme,
    snapToGrid: state.snapToGrid,
    angleSnap: state.angleSnap,
    angleSnapStep: state.angleSnapStep,
    showDimensions: state.showDimensions,
    snapQuadrants: state.snapQuadrants,
    snapMidpoints: state.snapMidpoints,
    snapCenters: state.snapCenters,
    undoStack: state.undoStack,
  };
}

function _loadProjectData(data) {
  // Otevření projektu historii Zpět VYČISTÍ (uživatel 18. 11. 2026): Zpět by
  // jinak vrátilo výkres předchozího projektu pod názvem nově otevřeného
  // a autosave by jím ten projekt za 3 s přepsal.
  state.undoStack = [];
  state.redoStack = [];
  updateUndoButtons();
  const _exp = expandPolylineObjects(data.objects || [], data.nextId || 1);
  state.objects = _exp.objects;
  state.nextId = _exp.nextId;
  if (data.gridSize && data.gridSize > 0) state.gridSize = data.gridSize;
  if (data.coordMode) state.coordMode = data.coordMode;
  if (data.incReference) state.incReference = data.incReference;
  state.nullPointActive = !!data.nullPointActive;
  state.nullPointAngle = data.nullPointAngle || 0;
  if (data.machineType) state.machineType = data.machineType;
  state.xDisplayMode = data.xDisplayMode || 'radius';
  state.flipX = !!data.flipX;
  state.flipZ = !!data.flipZ;
  state.mirrorPreview = !!data.mirrorPreview;
  if (data.showContourGaps !== undefined) state.showContourGaps = !!data.showContourGaps;
  if (data.layers) {
    state.layers = data.layers;
    state.activeLayer = data.activeLayer || 0;
    state.nextLayerId = data.nextLayerId || (data.layers.length > 0 ? Math.max(...data.layers.map(l => l.id)) + 1 : 1);
    ensureStockLayer();
  } else {
    state.objects.forEach(obj => { if (obj.layer === undefined) obj.layer = 0; });
  }
  state.anchors = data.anchors || [];
  if (data.showObjectNumbers !== undefined) state.showObjectNumbers = data.showObjectNumbers;
  if (data.showIntersectionNumbers !== undefined) state.showIntersectionNumbers = data.showIntersectionNumbers;
  if (data.displayDecimals !== undefined) state.displayDecimals = data.displayDecimals;
  if (data.snapToGrid !== undefined) state.snapToGrid = data.snapToGrid;
  if (data.angleSnap !== undefined) state.angleSnap = data.angleSnap;
  if (data.angleSnapStep !== undefined) state.angleSnapStep = data.angleSnapStep;
  if (data.showDimensions !== undefined) state.showDimensions = data.showDimensions;
  if (data.snapQuadrants !== undefined) state.snapQuadrants = data.snapQuadrants;
  if (data.snapMidpoints !== undefined) state.snapMidpoints = data.snapMidpoints;
  if (data.snapCenters !== undefined) state.snapCenters = data.snapCenters;
  state.selected = null;
  state.multiSelected.clear();
  state.selectedPoint = null;
  // Přenést uložený nůž (destička + držák) do CAM — hodnoty se nastaví do
  // CAM Geometrie hned (je-li CAM otevřené) i pro příští otevření CAM, takže
  // si uživatel může ukládat projekty jako knihovnu nožů.
  if (data.camTool && bridge.applyCamToolGeometry) {
    if (bridge.applyCamToolGeometry(data.camTool)) {
      showToast('Nůž z projektu přenesen do CAM 🔧');
    }
  }
  updateObjectList();
  updateProperties();
  updateLayerList();
  calculateAllIntersections();
  updateMachineTypeBtn();
  updateXDisplayBtn();
  updateNullPointUI();
  // Projekt nese i režim kót – indikátor 📐 ve stavovém řádku musí sedět
  updateDimsBtn();
  bridge.updateCoordBarIndicators?.();
  saveSettings();   // nastavení z projektu platí i po obnovení stránky
}

/** Otevřený výkres hned jako rozkreslený (bez pushUndo se autosave nespustí
 *  a po obnovení stránky by se vrátil výkres předchozího projektu). */
function _persistOpened() {
  setMeta('currentProjectData', buildProjectData()).catch(() => {});
}

// ── Save / Load ──

/**
 * Uloží aktuální projekt do IndexedDB.
 * @param {{quiet?: boolean}} [opts] `quiet` = jen tiché potvrzení (viz
 *   showToast() v state.js) – pro autosave, co běží po každé editaci;
 *   ruční uložení (Ctrl+S, tlačítko Uložit) zůstává viditelné.
 */
export async function saveProject({ quiet = false } = {}) {
  const data = buildProjectData();
  saveSettings();   // před zápisem do IDB — ten může selhat (plné úložiště)
  await setMeta('currentProjectData', data);
  await _saveToProjects(state.projectName, data);
  showToast("Projekt uložen", undefined, { quiet });
  updateStatusProject();
}

/** Načte projekt z IndexedDB. */
export async function loadProject() {
  try {
    const data = await getMeta('currentProjectData');
    if (!data) {
      showToast("Žádný uložený projekt");
      return;
    }
    _loadProjectData(data);
    showToast(`Načteno ${state.objects.length} objektů`);
  } catch (e) {
    showToast("Chyba při načítání projektu");
  }
}

/** @param {string} name */
export async function openProject(name) {
  const data = await loadProjectFromDB(name);
  if (!data) { showToast('Projekt nenalezen'); return; }
  _loadProjectData(data);
  state.projectName = name;
  updateStatusProject();
  _persistOpened();
  showToast(`Otevřen projekt: ${name}`);
}

/** @param {string} name */
export async function deleteProject(name) {
  // Uložit do historie smazaných výkresů před smazáním
  try {
    const data = await loadProjectFromDB(name);
    if (data) {
      const history = (await getMeta('deletedHistory')) || [];
      history.unshift({
        id: 'del_' + Date.now(),
        name: name,
        date: new Date().toLocaleString('cs-CZ'),
        data: deepClone(data),
      });
      if (history.length > 10) history.length = 10;
      await setMeta('deletedHistory', history);
    }
  } catch (e) { /* ignore history errors */ }
  await deleteProjectFromDB(name);
  showToast(`Projekt "${name}" smazán`);
}

/**
 * @param {string} oldName
 * @param {string} newName
 */
export async function renameProject(oldName, newName) {
  if (!newName || newName.trim() === '') return;
  newName = newName.trim();
  const data = await loadProjectFromDB(oldName);
  if (!data) return;
  const existing = await loadProjectFromDB(newName);
  if (existing) { showToast('Projekt s tímto názvem již existuje'); return; }
  await saveProjectToDB(newName, data);
  await deleteProjectFromDB(oldName);
  if (state.projectName === oldName) {
    state.projectName = newName;
    updateStatusProject();
  }
  showToast(`Přejmenováno na "${newName}"`);
}

/** @param {string} name */
export async function duplicateProject(name) {
  const data = await loadProjectFromDB(name);
  if (!data) return;
  const allProjects = await getAllProjects();
  let newName = name + ' (kopie)';
  let i = 2;
  while (allProjects[newName]) { newName = name + ` (kopie ${i++})`; }
  const copy = deepClone(data);
  copy.savedAt = new Date().toISOString();
  await saveProjectToDB(newName, copy);
  showToast(`Vytvořena kopie: ${newName}`);
}

/** Vytvoří nový prázdný projekt. */
export function newProject() {
  pushUndo();
  state.objects = [];
  state.nextId = 1;
  state.selected = null;
  state.multiSelected.clear();
  state.selectedPoint = null;
  state.intersections = [];
  // Kotvy patří výkresu (ukládají se s projektem i do Zpět) – dřív zůstaly
  // z předchozího výkresu viset v prázdném novém projektu.
  state.anchors = [];
  state.projectName = 'Bez názvu';
  state.layers = [
    { id: 0, name: 'Kontura', color: contourDefaultColor(), visible: true, locked: false },
    { id: 1, name: 'Konstrukce', color: COLORS.construction, visible: true, locked: false },
    { id: 2, name: 'Kóty', color: COLORS.dimension, visible: true, locked: false },
    { id: 3, name: 'Polotovar', color: stockDefaultColor(), visible: true, locked: false },
  ];
  state.activeLayer = 0;
  state.nextLayerId = 4;
  updateObjectList();
  updateProperties();
  updateLayerList();
  updateStatusProject();
  showToast('Nový projekt');
}

const UNNAMED = 'Bez názvu';

/**
 * 💾 Uložit z Nastavení: výkres bez názvu se zeptá na název (jinak by ho
 * přepsal další nový výkres – autosave zapisuje pod aktuální název).
 */
export function saveNamed() {
  if (!state.projectName || state.projectName === UNNAMED) { showSaveAsDialog(); return; }
  saveProject();
}

/**
 * 📄 Nový výkres: pojmenovaný výkres se uloží a otevře se prázdný; výkres bez
 * názvu (a s obsahem) nabídne uložení pod názvem, nebo zahození.
 */
export function newDrawing() {
  const named = state.projectName && state.projectName !== UNNAMED;
  if (!state.objects.length) { newProject(); return; }
  if (named) {
    saveProject({ quiet: true }).catch(() => {}).finally(() => {
      const was = state.projectName;
      newProject();
      showToast(`„${was}" uložen · nový výkres`);
    });
    return;
  }
  // Tři volby – zavření okna (pozadí, Esc) nesmí výkres zahodit
  const ov = makeInputOverlay(`
    <div class="input-dialog confirm-dialog">
      <p class="confirm-dialog-message">Výkres nemá název – uložit ho, než otevřeš nový? Jinak ho nový výkres přepíše (vrátit jde jen přes Zpět).</p>
      <div class="btn-row" style="flex-wrap:wrap">
        <button type="button" class="btn-cancel btn-cancel-overlay">Zrušit</button>
        <button type="button" class="btn-cancel" id="ndDiscard">Zahodit a nový</button>
        <button type="button" class="btn-ok" id="ndSave">💾 Uložit pod názvem</button>
      </div>
    </div>`);
  ov.querySelector('#ndDiscard').addEventListener('click', () => { ov.remove(); newProject(); });
  ov.querySelector('#ndSave').addEventListener('click', () => { ov.remove(); showSaveAsDialog(() => newProject()); });
}

/**
 * Otevře dialog pro uložení projektu pod novým názvem.
 * @param {(name: string) => void} [onSaved]  po uložení (např. „Nový výkres")
 */
export function showSaveAsDialog(onSaved) {
  const overlay = document.createElement('div');
  overlay.className = 'input-overlay';
  overlay.innerHTML = `
    <div class="input-dialog">
      <h3>💾 Uložit jako</h3>
      <label>Název projektu:</label>
      <input type="text" id="saveAsName" inputmode="text" autofocus>
      <div class="btn-row">
        <button class="btn-cancel" id="saveAsCancel">Zrušit</button>
        <button class="btn-ok" id="saveAsOk">Uložit</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const inp = overlay.querySelector('#saveAsName');
  inp.value = state.projectName;
  inp.select();
  inp.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') doSave();
    if (e.key === 'Escape') overlay.remove();
  });

  let asking = false;   // otevřený dotaz na přepsání – další Enter ho nezdvojí
  async function doSave() {
    const name = inp.value.trim();
    if (!name || asking) return;
    // Jiný už uložený projekt stejného jména se dřív tiše přepsal
    if (name !== state.projectName && await loadProjectFromDB(name)) {
      asking = true;
      showConfirmDialog(`Projekt „${name}“ už existuje. Přepsat ho aktuálním výkresem?`,
        () => { asking = false; writeAs(name); },
        { confirmLabel: 'Přepsat', onCancel: () => { asking = false; } });
      return;
    }
    await writeAs(name);
  }

  async function writeAs(name) {
    state.projectName = name;
    const data = buildProjectData();
    await setMeta('currentProjectData', data);
    await _saveToProjects(name, data);
    updateStatusProject();
    overlay.remove();
    showToast(`Uloženo jako "${name}"`);
    if (typeof onSaved === 'function') onSaved(name);
  }

  overlay.querySelector('#saveAsOk').addEventListener('click', doSave);
  overlay.querySelector('#saveAsCancel').addEventListener('click', () => overlay.remove());
}

/** Otevře dialog se správou projektů. */
export async function showProjectsDialog() {
  const projects = await getAllProjects();

  const overlay = document.createElement('div');
  overlay.className = 'input-overlay';

  function buildList(projs) {
    let html = '';
    const sortedNames = Object.keys(projs).sort((a, b) => {
      return (projs[b].savedAt || '').localeCompare(projs[a].savedAt || '');
    });
    if (sortedNames.length === 0) {
      html = '<li style="color:' + COLORS.textMuted + ';padding:12px;text-align:center;grid-column:1/-1">Žádné uložené výkresy</li>';
    } else {
      for (const name of sortedNames) {
        const p = projs[name];
        const date = p.savedAt ? new Date(p.savedAt).toLocaleString('cs') : '–';
        const count = p.objectCount || (p.objects || []).length;
        const isActive = name === state.projectName;
        html += `
          <li class="project-item proj-card${isActive ? ' active' : ''}" data-name="${_esc(name)}">
            <button type="button" class="proj-thumb-btn" data-act="open" title="Otevřít">${thumbSVG(p)}</button>
            <div class="project-info">
              <div class="project-name">${_esc(name)}${isActive ? ' <small>(otevřený)</small>' : ''}</div>
              <div class="project-meta">${date} · ${count} objektů</div>
            </div>
            <div class="project-actions">
              <button class="project-action-btn" data-act="open" title="Otevřít">📂</button>
              <button class="project-action-btn" data-act="rename" title="Přejmenovat">✏️</button>
              <button class="project-action-btn" data-act="duplicate" title="Duplikovat">📋</button>
              <button class="project-action-btn del" data-act="delete" title="Smazat">🗑</button>
            </div>
          </li>`;
      }
    }
    return html;
  }

  overlay.innerHTML = `
    <div class="input-dialog proj-dialog">
      <h3>📁 Uložené výkresy</h3>
      <ul class="project-list proj-gallery">${buildList(projects)}</ul>
      <div class="btn-row" style="flex-direction:column;gap:8px;align-items:stretch">
        <div style="display:flex;gap:8px">
          <button class="btn-ok" id="projSaveAs" style="flex:1">💾 Uložit aktuální jako…</button>
          <button class="btn-ok" id="projNew" style="flex:1">📄 Nový výkres</button>
        </div>
        <button class="btn-cancel" id="projClose" style="width:100%">Zavřít</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  async function refreshList() {
    const freshProjs = await getAllProjects();
    overlay.querySelector('.project-list').innerHTML = buildList(freshProjs);
    attachListeners();
  }

  function attachListeners() {
    overlay.querySelectorAll('.project-item').forEach(item => {
      const name = item.dataset.name;
      item.querySelectorAll('.project-action-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const act = btn.dataset.act;
          if (act === 'open') {
            await openProject(name);
            overlay.remove();
          } else if (act === 'rename') {
            const newName = prompt('Nový název:', name);
            if (newName && newName.trim()) {
              await renameProject(name, newName.trim());
              await refreshList();
            }
          } else if (act === 'duplicate') {
            await duplicateProject(name);
            await refreshList();
          } else if (act === 'delete') {
            if (confirm(`Opravdu smazat "${name}"?`)) {
              await deleteProject(name);
              await refreshList();
            }
          }
        });
      });
      // Double-click to open
      item.addEventListener('dblclick', async () => {
        await openProject(name);
        overlay.remove();
      });
    });
  }

  attachListeners();
  overlay.querySelector('#projNew').addEventListener('click', () => {
    overlay.remove();
    newDrawing();
  });
  overlay.querySelector('#projSaveAs').addEventListener('click', () => {
    overlay.remove();
    showSaveAsDialog(() => showProjectsDialog());
  });
  overlay.querySelector('#projClose').addEventListener('click', () => overlay.remove());
}

// ── Knihovna výkresů ──


/** Otevře dialog knihovny výkresů. */
export async function showLibraryDialog() {
  let library = (await getMeta('library')) || [];


  function buildList(lib) {
    if (lib.length === 0) {
      return `<li style="color:var(--ctp-overlay0);padding:20px;text-align:center;grid-column:1/-1">
        Knihovna je prázdná.<br><span style="font-size:12px">Uložte výkres tlačítkem ➕ níže.</span>
      </li>`;
    }
    return lib.map((item, i) => `
      <li class="project-item proj-card" data-lidx="${i}">
        <button type="button" class="proj-thumb-btn" data-act="open" title="Načíst do výkresu">${thumbSVG(item.data)}</button>
        <div class="project-info">
          <div class="project-name">${_esc(item.name)}</div>
          <div class="project-meta">${_esc(item.date)} · ${item.objectCount || (item.data?.objects || []).length} objektů</div>
        </div>
        <div class="project-actions">
          <button class="project-action-btn" data-act="open" title="Načíst do výkresu">📂</button>
          <button class="project-action-btn" data-act="rename" title="Přejmenovat">✏️</button>
          <button class="project-action-btn" data-act="duplicate" title="Duplikovat">📋</button>
          <button class="project-action-btn del" data-act="delete" title="Smazat">🗑</button>
        </div>
      </li>`
    ).join('');
  }

  const overlay = document.createElement('div');
  overlay.className = 'input-overlay';
  overlay.innerHTML = `
    <div class="input-dialog proj-dialog">
      <h3>📚 Knihovna výkresů</h3>
      <ul class="project-list proj-gallery" id="libraryList">${buildList(library)}</ul>
      <div class="btn-row" style="flex-direction:column;gap:8px;align-items:stretch">
        <button class="btn-ok" id="libSaveCurrent" style="width:100%">➕ Uložit aktuální výkres do knihovny</button>
        <button class="btn-cancel" id="libClose" style="width:100%">Zavřít</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  function refreshList() {
    overlay.querySelector('#libraryList').innerHTML = buildList(library);
    attachListeners();
  }

  function attachListeners() {
    overlay.querySelectorAll('#libraryList .project-item').forEach(item => {
      const idx = parseInt(item.dataset.lidx);
      item.querySelectorAll('.project-action-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const act = btn.dataset.act;
          const entry = library[idx];
          if (!entry) return;

          if (act === 'open') {
            if (state.objects.length > 0 && !confirm("Nahradit aktuální výkres výkresem z knihovny?")) return;
            _loadProjectData(entry.data);
            if (entry.name) {
              state.projectName = entry.name;
              updateStatusProject();
            }
            _persistOpened();
            overlay.remove();
            showToast(`Načteno z knihovny: "${entry.name}"`);
          } else if (act === 'rename') {
            const newName = prompt('Nový název:', entry.name);
            if (newName && newName.trim()) {
              library[idx].name = newName.trim();
              await setMeta('library', library);
              refreshList();
            }
          } else if (act === 'duplicate') {
            const copy = deepClone(entry);
            copy.id = 'lib_' + Date.now();
            copy.name = entry.name + ' (kopie)';
            copy.date = new Date().toLocaleString('cs-CZ');
            library.splice(idx + 1, 0, copy);
            await setMeta('library', library);
            refreshList();
            showToast(`Duplikováno: "${copy.name}"`);
          } else if (act === 'delete') {
            if (confirm(`Smazat "${entry.name}" z knihovny?`)) {
              library.splice(idx, 1);
              await setMeta('library', library);
              refreshList();
            }
          }
        });
      });
      // Double-click to open
      item.addEventListener('dblclick', async () => {
        const entry = library[idx];
        if (!entry) return;
        if (state.objects.length > 0 && !confirm("Nahradit aktuální výkres výkresem z knihovny?")) return;
        _loadProjectData(entry.data);
        if (entry.name) {
          state.projectName = entry.name;
          updateStatusProject();
        }
        _persistOpened();
        overlay.remove();
        showToast(`Načteno z knihovny: "${entry.name}"`);
      });
    });
  }

  attachListeners();

  overlay.querySelector('#libSaveCurrent').addEventListener('click', async () => {
    const name = prompt('Název v knihovně:', state.projectName || 'Bez názvu');
    if (name && name.trim()) {
      const data = buildProjectData();
      library.unshift({
        id: 'lib_' + Date.now(),
        name: name.trim(),
        date: new Date().toLocaleString('cs-CZ'),
        objectCount: (data.objects || []).length,
        data: data,
      });
      await setMeta('library', library);
      refreshList();
      showToast(`Uloženo do knihovny: "${name.trim()}"`);
    }
  });

  overlay.querySelector('#libClose').addEventListener('click', () => overlay.remove());
}

// ── Tlačítka ──
document.getElementById("btnSave")?.addEventListener("click", saveProject);
document.getElementById("btnProjects")?.addEventListener("click", () => showProjectsDialog());
document.getElementById("btnLibrary")?.addEventListener("click", () => showLibraryDialog());

import { bridge } from '../bridge.js';
bridge.showProjectsDialog = showProjectsDialog;
bridge.saveProject = saveProject;
bridge.showLibraryDialog = showLibraryDialog;
bridge.saveNamed = saveNamed;
bridge.newDrawing = newDrawing;
