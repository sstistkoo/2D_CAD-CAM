// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Dialog ⚙️ Nastavení                                  ║
// ╚══════════════════════════════════════════════════════════════╝

// Vyňato z js/ui.js beze změny (16. 10. 2026, docs/plan-refaktoringu-ui.md,
// Fáze 2a); jediná úprava je `export`. Listenery tlačítek ⚙️ věší dál js/ui.js.
// Přepínače lišty a uložení nastavení bere z rozcestníku ../ui.js (cyklus jen
// přes funkce). Kód aplikace importuje jen z js/ui.js, nikdy z js/ui/* napřímo.

import { state, showToast, pushUndo, axisLabels, displayX, xPrefix, fmtNum } from '../state.js';
import { renderAll } from '../render.js';
import { bridge } from '../bridge.js';
import { makeOverlay } from '../dialogFactory.js';
import { showHistoryDialog } from './drawingHistory.js';
import { applyTheme, persistSettings, toggleAngleSnap, toggleSnapGrid, updateCoordModeBtn, updateDimsBtn, updateMachineTypeBtn, updateXDisplayBtn } from '../ui.js';

export function showSettingsDialog() {
  const act = (cond) => cond ? 'border-color:var(--ctp-green);background:var(--ctp-green);color:var(--ctp-base)' : 'border-color:var(--ctp-surface1);background:var(--ctp-surface0);color:var(--ctp-text)';
  const btnS = 'flex:1;padding:5px 6px;font-size:12px;border-radius:5px;cursor:pointer;border:2px solid transparent;';
  const bodyHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;min-width:300px;max-width:420px">

      <!-- Projekty a export – zabalovací -->
      <details open style="border:1px solid var(--ctp-surface1);border-radius:6px;margin:0;background:var(--ctp-mantle)">
        <summary style="padding:6px 10px;cursor:pointer;font-size:12px;color:var(--ctp-blue);font-weight:600;user-select:none;list-style:none;display:flex;align-items:center;gap:4px">
          <span id="settProjArrow" style="transition:transform .2s;display:inline-block;transform:rotate(90deg)">▸</span> 📂 Projekty a export
        </summary>
        <div style="padding:4px 10px 8px;display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;gap:6px">
            <button class="calc-btn" id="settSave" style="${btnS}background:var(--ctp-surface0);color:var(--ctp-text);border-color:var(--ctp-surface1)" title="Uložit projekt do prohlížeče">💾 Uložit</button>
            <button class="calc-btn" id="settLoad" style="${btnS}background:var(--ctp-surface0);color:var(--ctp-text);border-color:var(--ctp-surface1)" title="Načíst / Uložit (soubory)">📂 Soubor</button>
          </div>
          <div style="display:flex;gap:6px">
            <button class="calc-btn" id="settHistory" style="${btnS}background:var(--ctp-surface0);color:var(--ctp-text);border-color:var(--ctp-surface1)" title="Historie smazaných výkresů">🕓 Historie</button>
            <button class="calc-btn" id="settLibrary" style="${btnS}background:var(--ctp-surface0);color:var(--ctp-text);border-color:var(--ctp-surface1)" title="Knihovna výkresů">📚 Knihovna</button>
          </div>
          <div style="display:flex;gap:6px">
            <button class="calc-btn" id="settProjects" style="${btnS}background:var(--ctp-surface0);color:var(--ctp-text);border-color:var(--ctp-surface1)">📁 Projekty</button>
            <button class="calc-btn" id="settCNC" style="${btnS}background:var(--ctp-surface0);color:var(--ctp-text);border-color:var(--ctp-surface1)">📋 CNC Export</button>
          </div>
          <button class="calc-btn" id="settDxfJson" style="width:100%;padding:5px 6px;font-size:12px;border-radius:5px;cursor:pointer;background:#a6e3a1;color:#1e1e2e;border:1px solid #a6e3a1">🔄 DXF - JSON konvertor</button>
        </div>
      </details>

      <!-- Kóty -->
      <fieldset style="border:1px solid var(--ctp-surface1);border-radius:6px;padding:6px 10px;margin:0">
        <legend style="color:var(--ctp-blue);font-size:12px;padding:0 4px">📐 Kóty</legend>
        <div style="display:flex;gap:6px;margin-top:2px;flex-wrap:wrap">
          <button class="calc-btn" id="settDimsAll" style="${btnS}min-width:60px;${act(state.showDimensions === 'all')}">Vše</button>
          <button class="calc-btn" id="settDimsIntersect" style="${btnS}min-width:60px;${act(state.showDimensions === 'intersections')}">Průsečíky</button>
          <button class="calc-btn" id="settDimsOnly" style="${btnS}min-width:60px;${act(state.showDimensions === 'dimensions')}">Kóty</button>
          <button class="calc-btn" id="settDimsNone" style="${btnS}min-width:60px;${act(state.showDimensions === 'none')}">Skryté</button>
        </div>
      </fieldset>

      <!-- Přesnost zobrazení -->
      <fieldset style="border:1px solid var(--ctp-surface1);border-radius:6px;padding:6px 10px;margin:0">
        <legend style="color:var(--ctp-blue);font-size:12px;padding:0 4px">🔢 Přesnost zobrazení</legend>
        <div style="display:flex;align-items:center;gap:8px;margin-top:2px">
          <label style="flex:1;font-size:12px;color:var(--ctp-text)">Desetinná místa:</label>
          <select id="settDecimals" style="padding:4px 8px;border-radius:5px;border:1px solid var(--ctp-surface1);background:var(--ctp-surface0);color:var(--ctp-text);font-size:13px">
            <option value="0"${state.displayDecimals === 0 ? ' selected' : ''}>0 (1 mm)</option>
            <option value="1"${state.displayDecimals === 1 ? ' selected' : ''}>1 (0.1)</option>
            <option value="2"${state.displayDecimals === 2 ? ' selected' : ''}>2 (0.01)</option>
            <option value="3"${state.displayDecimals === 3 ? ' selected' : ''}>3 (0.001)</option>
          </select>
        </div>
      </fieldset>

      <!-- Zobrazení os a stroje -->
      <fieldset style="border:1px solid var(--ctp-surface1);border-radius:6px;padding:6px 10px;margin:0">
        <legend style="color:var(--ctp-blue);font-size:12px;padding:0 4px">📏 Zobrazení</legend>
        <div style="display:flex;gap:6px;margin-top:2px">
          <button class="calc-btn" id="settXRadius" style="${btnS}${act(state.xDisplayMode === 'radius')}">R Poloměr</button>
          <button class="calc-btn" id="settXDiam" style="${btnS}${act(state.xDisplayMode === 'diameter')}">⌀ Průměr</button>
        </div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="calc-btn" id="settCoordAbs" style="${btnS}${act(state.coordMode === 'abs')}">ABS</button>
          <button class="calc-btn" id="settCoordInc" style="${btnS}${act(state.coordMode === 'inc')}">INC</button>
          <button class="calc-btn" id="settMachSoustruh" style="${btnS}${act(state.machineType === 'soustruh')}">Soustruh</button>
          <button class="calc-btn" id="settMachKarusel" style="${btnS}${act(state.machineType === 'karusel')}">Karusel</button>
        </div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="calc-btn" id="settFlipX" style="${btnS}${act(state.flipX)}" title="Otočit svislou osu – nástroj zespodu">⇅ X+ ${state.flipX ? 'dolů ↓' : 'nahoru ↑'}</button>
          <button class="calc-btn" id="settFlipZ" style="${btnS}${act(state.flipZ)}" title="Otočit vodorovnou osu Z">⇄ Z+ ${state.flipZ ? 'vlevo ←' : 'vpravo →'}</button>
        </div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="calc-btn" id="settMirrorPreview" style="${btnS}${act(state.mirrorPreview)}" title="Dokreslit konturu zrcadlenou kolem osy rotace (y=0) — druhá polovina nárysu; jen zobrazení, objekty nevznikají">⇋ Zrcadlit kolem osy: ${state.mirrorPreview ? 'ON' : 'OFF'}</button>
        </div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="calc-btn" id="settContourGaps" style="${btnS}${act(state.showContourGaps)}" title="Zvýraznit mezery/přerušení v kontuře na plátně">⊗ Mezery v kontuře: ${state.showContourGaps ? 'ON' : 'OFF'}</button>
        </div>
      </fieldset>

      <!-- Mřížka a snap -->
      <fieldset style="border:1px solid var(--ctp-surface1);border-radius:6px;padding:6px 10px;margin:0">
        <legend style="color:var(--ctp-blue);font-size:12px;padding:0 4px"># Mřížka a snap</legend>
        <div style="display:flex;gap:6px;margin-top:2px">
          <button class="calc-btn" id="settSnapGrid" style="${btnS}${act(state.snapToGrid)}"># Mřížka: ${state.snapToGrid ? 'ON' : 'OFF'}</button>
          <button class="calc-btn" id="settAngleSnap" style="${btnS}${act(state.angleSnap)}">∠ Úhel: ${state.angleSnap ? 'ON' : 'OFF'}</button>
        </div>
        <div style="display:flex;gap:8px;margin-top:5px;align-items:center">
          <label style="font-size:11px;color:var(--ctp-subtext0)">Mřížka:</label>
          <input id="settGrid" type="number" min="0.1" max="100" step="0.1" value="${state.gridSize}"
            style="width:56px;padding:3px 6px;border-radius:5px;border:1px solid var(--ctp-surface1);background:var(--ctp-surface0);color:var(--ctp-text);font-size:12px;text-align:center">
          <label style="font-size:11px;color:var(--ctp-subtext0)">Úhel (°):</label>
          <input id="settAngleStep" type="number" min="1" max="90" step="1" value="${state.angleSnapStep}"
            style="width:56px;padding:3px 6px;border-radius:5px;border:1px solid var(--ctp-surface1);background:var(--ctp-surface0);color:var(--ctp-text);font-size:12px;text-align:center">
        </div>
        <div style="display:flex;gap:6px;margin-top:5px">
          <button class="calc-btn" id="settSnapQuadrants" style="${btnS}font-size:11px;${act(state.snapQuadrants)}">◎ Quadranty: ${state.snapQuadrants ? 'ON' : 'OFF'}</button>
          <button class="calc-btn" id="settSnapMidpoints" style="${btnS}font-size:11px;${act(state.snapMidpoints)}">½ Středy: ${state.snapMidpoints ? 'ON' : 'OFF'}</button>
          <button class="calc-btn" id="settSnapCenters" style="${btnS}font-size:11px;${act(state.snapCenters)}">⊕ Středy R: ${state.snapCenters ? 'ON' : 'OFF'}</button>
        </div>
      </fieldset>

      <!-- Kotvy -->
      <fieldset style="border:1px solid var(--ctp-surface1);border-radius:6px;padding:6px 10px;margin:0">
        <legend style="color:var(--ctp-blue);font-size:12px;padding:0 4px">⚓ Kotvy</legend>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:11px;color:var(--ctp-subtext0)">Aktivních: <strong id="settAnchorCount">${state.anchors.length}</strong></span>
          <button class="calc-btn" id="settListAnchors" title="Seznam kotev" style="padding:2px 6px;font-size:14px;border-radius:5px;cursor:pointer;background:var(--ctp-surface0);color:var(--ctp-text);border:1px solid var(--ctp-surface1);opacity:${state.anchors.length === 0 ? '0.5' : '1'}"${state.anchors.length === 0 ? ' disabled' : ''}>📋</button>
          <button class="calc-btn" id="settDeleteAnchors" title="Smazat všechny kotvy" style="margin-left:auto;padding:4px 10px;font-size:11px;border-radius:5px;cursor:pointer;background:var(--ctp-red);color:var(--ctp-base);border:1px solid var(--ctp-red);opacity:${state.anchors.length === 0 ? '0.5' : '1'}"${state.anchors.length === 0 ? ' disabled' : ''}>🗑️ Smazat vše</button>
        </div>
        <div id="settAnchorList" style="display:none;max-height:140px;overflow-y:auto;margin-top:4px;border:1px solid var(--ctp-surface1);border-radius:5px;background:var(--ctp-mantle)"></div>
      </fieldset>

      <!-- Motiv – malý přepínač dole -->
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;padding:4px 0;border-top:1px solid var(--ctp-surface0);margin-top:2px">
        <span style="font-size:11px;color:var(--ctp-subtext0)">Motiv:</span>
        <button class="calc-btn" id="settThemeDark" title="Tmavý motiv" style="padding:3px 10px;font-size:11px;border-radius:4px;cursor:pointer;border:2px solid transparent;${act(state.theme === 'dark')}">🌙 Tmavý</button>
        <button class="calc-btn" id="settThemeLight" title="Světlý motiv" style="padding:3px 10px;font-size:11px;border-radius:4px;cursor:pointer;border:2px solid transparent;${act(state.theme === 'light')}">☀️ Světlý</button>
      </div>

    </div>`;

  const overlay = makeOverlay('settings', '⚙️ Nastavení', bodyHTML, 'cnc-window');
  if (!overlay) return;

  // ── Helpers ──
  const activeStyle = 'border-color:var(--ctp-green);background:var(--ctp-green);color:var(--ctp-base)';
  const inactiveStyle = 'border-color:var(--ctp-surface1);background:var(--ctp-surface0);color:var(--ctp-text)';
  const btnBase = 'flex:1;padding:5px 6px;font-size:12px;border-radius:5px;cursor:pointer;border:2px solid transparent;';
  const btnBaseSmall = 'flex:1;padding:5px 6px;font-size:11px;border-radius:5px;cursor:pointer;border:2px solid transparent;';

  // ── Rozbalovací šipka ──
  const detailsEl = overlay.querySelector('details');
  if (detailsEl) {
    detailsEl.addEventListener('toggle', () => {
      const arrow = overlay.querySelector('#settProjArrow');
      if (arrow) arrow.style.transform = detailsEl.open ? 'rotate(90deg)' : '';
    });
  }

  // ── Motiv ──
  function updateThemeBtns() {
    const dBtn = overlay.querySelector('#settThemeDark');
    const lBtn = overlay.querySelector('#settThemeLight');
    dBtn.style.cssText = `padding:3px 10px;font-size:11px;border-radius:4px;cursor:pointer;border:2px solid transparent;${state.theme === 'dark' ? activeStyle : inactiveStyle}`;
    lBtn.style.cssText = `padding:3px 10px;font-size:11px;border-radius:4px;cursor:pointer;border:2px solid transparent;${state.theme === 'light' ? activeStyle : inactiveStyle}`;
  }
  overlay.querySelector('#settThemeDark').addEventListener('click', () => {
    state.theme = 'dark';
    applyTheme();
    updateThemeBtns();
    persistSettings();
  });
  overlay.querySelector('#settThemeLight').addEventListener('click', () => {
    state.theme = 'light';
    applyTheme();
    updateThemeBtns();
    persistSettings();
  });

  // ── Přesnost zobrazení ──
  overlay.querySelector('#settDecimals').addEventListener('change', (e) => {
    state.displayDecimals = parseInt(e.target.value);
    renderAll();
    persistSettings();
    showToast(`Přesnost: ${state.displayDecimals} des. míst`);
  });

  // ── Typ stroje ──
  function updateMachBtns() {
    const sBtn = overlay.querySelector('#settMachSoustruh');
    const kBtn = overlay.querySelector('#settMachKarusel');
    sBtn.style.cssText = `${btnBase}${state.machineType === 'soustruh' ? activeStyle : inactiveStyle}`;
    kBtn.style.cssText = `${btnBase}${state.machineType === 'karusel' ? activeStyle : inactiveStyle}`;
  }
  overlay.querySelector('#settMachSoustruh').addEventListener('click', () => {
    state.machineType = 'soustruh';
    updateMachineTypeBtn();
    updateMachBtns();
    renderAll();
    persistSettings();
  });
  overlay.querySelector('#settMachKarusel').addEventListener('click', () => {
    state.machineType = 'karusel';
    updateMachineTypeBtn();
    updateMachBtns();
    renderAll();
    persistSettings();
  });

  // ── Osa X ──
  function updateXBtns() {
    const rBtn = overlay.querySelector('#settXRadius');
    const dBtn = overlay.querySelector('#settXDiam');
    rBtn.style.cssText = `${btnBase}${state.xDisplayMode === 'radius' ? activeStyle : inactiveStyle}`;
    dBtn.style.cssText = `${btnBase}${state.xDisplayMode === 'diameter' ? activeStyle : inactiveStyle}`;
  }
  overlay.querySelector('#settXRadius').addEventListener('click', () => {
    state.xDisplayMode = 'radius';
    updateXDisplayBtn();
    updateXBtns();
    renderAll();
    persistSettings();
  });
  overlay.querySelector('#settXDiam').addEventListener('click', () => {
    state.xDisplayMode = 'diameter';
    updateXDisplayBtn();
    updateXBtns();
    renderAll();
    persistSettings();
  });

  // ── Otočení svislé osy X (nástroj zespodu) ──
  overlay.querySelector('#settFlipX').addEventListener('click', () => {
    state.flipX = !state.flipX;
    document.dispatchEvent(new CustomEvent('flipx-cad', { detail: state.flipX }));
    const fBtn = overlay.querySelector('#settFlipX');
    fBtn.style.cssText = `${btnBase}${state.flipX ? activeStyle : inactiveStyle}`;
    fBtn.textContent = `⇅ X+ ${state.flipX ? 'dolů ↓' : 'nahoru ↑'}`;
    renderAll();
    persistSettings();
    if (bridge.updateMobileCoords) bridge.updateMobileCoords(state.mouse.x, state.mouse.y);
    showToast(state.flipX ? 'Osa X otočena – X+ dolů' : 'Osa X – X+ nahoru');
  });

  // ── Otočení vodorovné osy Z ──
  overlay.querySelector('#settFlipZ').addEventListener('click', () => {
    state.flipZ = !state.flipZ;
    document.dispatchEvent(new CustomEvent('flipz-cad', { detail: state.flipZ }));
    const zBtn = overlay.querySelector('#settFlipZ');
    zBtn.style.cssText = `${btnBase}${state.flipZ ? activeStyle : inactiveStyle}`;
    zBtn.textContent = `⇄ Z+ ${state.flipZ ? 'vlevo ←' : 'vpravo →'}`;
    renderAll();
    persistSettings();
    if (bridge.updateMobileCoords) bridge.updateMobileCoords(state.mouse.x, state.mouse.y);
    showToast(state.flipZ ? 'Osa Z otočena – Z+ vlevo' : 'Osa Z – Z+ vpravo');
  });

  // ── Náhled zrcadlení kolem osy rotace (y=0) ──
  overlay.querySelector('#settMirrorPreview').addEventListener('click', () => {
    state.mirrorPreview = !state.mirrorPreview;
    const mBtn = overlay.querySelector('#settMirrorPreview');
    mBtn.style.cssText = `${btnBase}${state.mirrorPreview ? activeStyle : inactiveStyle}`;
    mBtn.textContent = `⇋ Zrcadlit kolem osy: ${state.mirrorPreview ? 'ON' : 'OFF'}`;
    renderAll();
    persistSettings();
    showToast(state.mirrorPreview ? 'Náhled zrcadlení: ON' : 'Náhled zrcadlení: OFF');
  });

  // ── Zobrazení mezer v kontuře ──
  overlay.querySelector('#settContourGaps').addEventListener('click', () => {
    state.showContourGaps = !state.showContourGaps;
    const gBtn = overlay.querySelector('#settContourGaps');
    gBtn.style.cssText = `${btnBase}${state.showContourGaps ? activeStyle : inactiveStyle}`;
    gBtn.textContent = `⊗ Mezery v kontuře: ${state.showContourGaps ? 'ON' : 'OFF'}`;
    renderAll();
    persistSettings();
    showToast(state.showContourGaps ? 'Zvýraznění mezer v kontuře: ON' : 'Zvýraznění mezer v kontuře: OFF');
  });

  // ── Snap mřížka ON/OFF ──
  function updateSnapGridSettBtn() {
    const btn = overlay.querySelector('#settSnapGrid');
    btn.style.cssText = `${btnBase}${state.snapToGrid ? activeStyle : inactiveStyle}`;
    btn.textContent = `# Mřížka: ${state.snapToGrid ? 'ON' : 'OFF'}`;
  }
  overlay.querySelector('#settSnapGrid').addEventListener('click', () => {
    toggleSnapGrid();
    updateSnapGridSettBtn();
    persistSettings();
  });

  // ── Úhlový snap ON/OFF ──
  function updateAngleSnapSettBtn() {
    const btn = overlay.querySelector('#settAngleSnap');
    btn.style.cssText = `${btnBase}${state.angleSnap ? activeStyle : inactiveStyle}`;
    btn.textContent = `∠ Úhel: ${state.angleSnap ? 'ON' : 'OFF'}`;
  }
  overlay.querySelector('#settAngleSnap').addEventListener('click', () => {
    toggleAngleSnap();
    updateAngleSnapSettBtn();
    persistSettings();
  });

  // ── Mřížka ──
  overlay.querySelector('#settGrid').addEventListener('change', (e) => {
    const val = parseFloat(e.target.value);
    if (val > 0 && val <= 100) {
      state.gridSize = val;
      renderAll();
      persistSettings();
    }
  });

  // ── Úhlový snap krok ──
  overlay.querySelector('#settAngleStep').addEventListener('change', (e) => {
    const val = parseInt(e.target.value);
    if (val >= 1 && val <= 90) {
      state.angleSnapStep = val;
      persistSettings();
    }
  });

  // ── Quadranty kružnice ON/OFF ──
  function updateSnapQuadrantsBtn() {
    const btn = overlay.querySelector('#settSnapQuadrants');
    btn.style.cssText = `${btnBaseSmall}${state.snapQuadrants ? activeStyle : inactiveStyle}`;
    btn.textContent = `◎ Quadranty: ${state.snapQuadrants ? 'ON' : 'OFF'}`;
  }
  overlay.querySelector('#settSnapQuadrants').addEventListener('click', () => {
    state.snapQuadrants = !state.snapQuadrants;
    updateSnapQuadrantsBtn();
    renderAll();
    persistSettings();
    showToast(state.snapQuadrants ? 'Snap quadranty kružnice: ON' : 'Snap quadranty kružnice: OFF');
  });

  // ── Středy úseček ON/OFF ──
  function updateSnapMidpointsBtn() {
    const btn = overlay.querySelector('#settSnapMidpoints');
    btn.style.cssText = `${btnBaseSmall}${state.snapMidpoints ? activeStyle : inactiveStyle}`;
    btn.textContent = `½ Středy: ${state.snapMidpoints ? 'ON' : 'OFF'}`;
  }
  overlay.querySelector('#settSnapMidpoints').addEventListener('click', () => {
    state.snapMidpoints = !state.snapMidpoints;
    updateSnapMidpointsBtn();
    renderAll();
    persistSettings();
    showToast(state.snapMidpoints ? 'Snap středy úseček: ON' : 'Snap středy úseček: OFF');
  });

  // ── Středy oblouků (R) ON/OFF ──
  function updateSnapCentersBtn() {
    const btn = overlay.querySelector('#settSnapCenters');
    btn.style.cssText = `${btnBaseSmall}${state.snapCenters ? activeStyle : inactiveStyle}`;
    btn.textContent = `⊕ Středy R: ${state.snapCenters ? 'ON' : 'OFF'}`;
  }
  overlay.querySelector('#settSnapCenters').addEventListener('click', () => {
    state.snapCenters = !state.snapCenters;
    updateSnapCentersBtn();
    renderAll();
    persistSettings();
    showToast(state.snapCenters ? 'Snap středy oblouků: ON' : 'Snap středy oblouků: OFF');
  });

  // ── Souřadnice ABS/INC ──
  function updateCoordBtns() {
    const aBtn = overlay.querySelector('#settCoordAbs');
    const iBtn = overlay.querySelector('#settCoordInc');
    aBtn.style.cssText = `${btnBase}${state.coordMode === 'abs' ? activeStyle : inactiveStyle}`;
    iBtn.style.cssText = `${btnBase}${state.coordMode === 'inc' ? activeStyle : inactiveStyle}`;
  }
  overlay.querySelector('#settCoordAbs').addEventListener('click', () => {
    state.coordMode = 'abs';
    updateCoordModeBtn();
    updateCoordBtns();
    renderAll();
    if (bridge.updateMobileCoords) bridge.updateMobileCoords(state.mouse.x, state.mouse.y);
    persistSettings();
    showToast('Absolutní souřadnice (ABS)');
  });
  overlay.querySelector('#settCoordInc').addEventListener('click', () => {
    state.coordMode = 'inc';
    updateCoordModeBtn();
    updateCoordBtns();
    renderAll();
    if (bridge.updateMobileCoords) bridge.updateMobileCoords(state.mouse.x, state.mouse.y);
    persistSettings();
    showToast('Inkrementální souřadnice (INC)');
  });

  // ── Kóty režim ──
  function updateDimsBtns() {
    const modes = ['all', 'intersections', 'dimensions', 'none'];
    const ids = ['#settDimsAll', '#settDimsIntersect', '#settDimsOnly', '#settDimsNone'];
    modes.forEach((m, i) => {
      const btn = overlay.querySelector(ids[i]);
      btn.style.cssText = `${btnBase}min-width:60px;${state.showDimensions === m ? activeStyle : inactiveStyle}`;
    });
  }
  ['all', 'intersections', 'dimensions', 'none'].forEach((mode, i) => {
    const ids = ['#settDimsAll', '#settDimsIntersect', '#settDimsOnly', '#settDimsNone'];
    overlay.querySelector(ids[i]).addEventListener('click', () => {
      state.showDimensions = mode;
      updateDimsBtn();
      bridge.updateCoordBarIndicators?.();
      updateDimsBtns();
      renderAll();
      persistSettings();
      const labels = { all: 'Kóty: vše', intersections: 'Kóty: pouze průsečíky', dimensions: 'Kóty: pouze kóty', none: 'Kóty: skryté' };
      showToast(labels[mode]);
    });
  });

  // ── Uložit ──
  overlay.querySelector('#settSave').addEventListener('click', () => {
    overlay.remove();
    if (bridge.saveProject) bridge.saveProject();
  });

  // ── Soubor (načíst/uložit) ──
  overlay.querySelector('#settLoad').addEventListener('click', () => {
    overlay.remove();
    if (bridge.showFileDialog) bridge.showFileDialog();
  });

  // ── Historie ──
  overlay.querySelector('#settHistory').addEventListener('click', () => {
    overlay.remove();
    showHistoryDialog();
  });

  // ── Knihovna ──
  overlay.querySelector('#settLibrary').addEventListener('click', () => {
    overlay.remove();
    if (bridge.showLibraryDialog) bridge.showLibraryDialog();
  });

  // ── Projekty ──
  overlay.querySelector('#settProjects').addEventListener('click', () => {
    overlay.remove();
    if (bridge.showProjectsDialog) bridge.showProjectsDialog();
  });

  // ── CNC Export ──
  overlay.querySelector('#settCNC').addEventListener('click', () => {
    overlay.remove();
    if (bridge.runCncExport) bridge.runCncExport();
  });

  // ── DXF - JSON ──
  overlay.querySelector('#settDxfJson').addEventListener('click', () => {
    overlay.remove();
    window.open('dxf-json.html', '_blank');
  });

  // ── Smazat všechny kotvy ──
  function refreshAnchorUI() {
    const countEl = overlay.querySelector('#settAnchorCount');
    const delBtn = overlay.querySelector('#settDeleteAnchors');
    const listBtn = overlay.querySelector('#settListAnchors');
    const listEl = overlay.querySelector('#settAnchorList');
    if (countEl) countEl.textContent = String(state.anchors.length);
    const empty = state.anchors.length === 0;
    if (delBtn) { delBtn.disabled = empty; delBtn.style.opacity = empty ? '0.5' : '1'; }
    if (listBtn) { listBtn.disabled = empty; listBtn.style.opacity = empty ? '0.5' : '1'; }
    if (listEl && listEl.style.display !== 'none') renderAnchorList();
  }

  function renderAnchorList() {
    const listEl = overlay.querySelector('#settAnchorList');
    if (!listEl) return;
    const [H, V] = axisLabels();
    if (state.anchors.length === 0) {
      listEl.innerHTML = '<p style="margin:0;padding:8px;font-size:12px;color:var(--ctp-subtext0);text-align:center">Žádné kotvy</p>';
      return;
    }
    listEl.innerHTML = state.anchors.map((a, i) => {
      const hVal = fmtNum(displayX(a.x));
      const vVal = fmtNum(a.y);
      return `<div style="display:flex;align-items:center;gap:6px;padding:5px 8px;border-bottom:1px solid var(--ctp-surface0);font-size:12px" data-anchor-idx="${i}">
        <span style="color:var(--ctp-red);font-size:14px">⚓</span>
        <span style="flex:1;color:var(--ctp-text);font-family:monospace">${H}${xPrefix()}${hVal} &nbsp; ${V}${vVal}</span>
        <button class="anchor-del-btn" data-idx="${i}" title="Smazat kotvu" style="padding:2px 6px;font-size:12px;border-radius:4px;cursor:pointer;background:transparent;color:var(--ctp-red);border:1px solid var(--ctp-red);line-height:1">✕</button>
      </div>`;
    }).join('');

    listEl.querySelectorAll('.anchor-del-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.dataset.idx, 10);
        if (idx >= 0 && idx < state.anchors.length) {
          pushUndo();
          state.anchors.splice(idx, 1);
          renderAll();
          refreshAnchorUI();
          showToast('Kotva odstraněna ✓');
        }
      });
    });
  }

  // ── Zobrazit/skrýt seznam kotev ──
  overlay.querySelector('#settListAnchors').addEventListener('click', () => {
    const listEl = overlay.querySelector('#settAnchorList');
    if (!listEl) return;
    if (listEl.style.display === 'none') {
      listEl.style.display = 'block';
      renderAnchorList();
    } else {
      listEl.style.display = 'none';
    }
  });

  overlay.querySelector('#settDeleteAnchors').addEventListener('click', () => {
    if (state.anchors.length === 0) return;
    pushUndo();
    const count = state.anchors.length;
    state.anchors.length = 0;
    renderAll();
    refreshAnchorUI();
    const listEl = overlay.querySelector('#settAnchorList');
    if (listEl) listEl.style.display = 'none';
    showToast(`Smazáno ${count} kotev ✓`);
  });
}
