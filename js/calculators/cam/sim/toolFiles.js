// Nůž jako soubor / knihovna / menu v CAM simulátoru: 💾 Uložit do PC a 📂
// načtení geometrie nože, záznam a nůž 🧰 Knihovny, otevření Knihovny nad
// aktuálním nástrojem, otevření/vytažení 🔪 Geometrie, menu okna Zásobníku
// a „💾 Uložit aktuální nástroj". Vyňato z camSimulator.js (blok „magazine
// dialog", docs/plan-rozdeleni-cam-simulatoru.md) — stav simulátoru a jeho
// funkce se předávají parametrem.
import { showToast } from '../../../state.js';
import { showToolLibraryDialog, saveToolToLibrary } from '../../../toolLibrary.js';
import { upgradeIsoHolderProfile } from '../../isoToolCatalog.js';
import { CAM_TOOL_KEYS, _pickCamTool } from '../camToolPicker.js';
import { getInsert } from '../inserts/index.js';
import { _buildMagSlotFromTool } from './magSlots.js';

/** @param ctx { S, toolUi, pushHistory, saveState, fullUpdate, dropInsertGuides, afterToolChange, applyAfterToolChange, saveCurrentToolToMagazine, showToolGeometryDialog, escAttr } */
export function createToolFiles({ S, toolUi, pushHistory, saveState, fullUpdate, dropInsertGuides, afterToolChange, applyAfterToolChange, saveCurrentToolToMagazine, showToolGeometryDialog, escAttr }) {
  /** Stáhne aktuální nůž (destička + držák, stejná pole jako CAM_TOOL_KEYS —
   * sdílené s knihovnou/projektem/zásobníkem) jako .json soubor na disk. */
  function exportToolGeometryFile() {
    const tool = _pickCamTool(S.params);
    if (!tool) return;
    const payload = { __skicaTool: 1, savedAt: new Date().toISOString(), toolName: S.params.toolName || '', tool };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (S.params.toolName || 'nastroj').replace(/[^a-z0-9_-]+/gi, '_');
    a.download = `nuz_${safeName}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Nůž (destička + držák) uložen do souboru');
  }

  /** Načte nůž (destička + držák) z .json souboru vyexportovaného výše. */
  function importToolGeometryFile() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.addEventListener('change', () => {
      const file = inp.files && inp.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        let data;
        try { data = JSON.parse(reader.result); }
        catch (_) { alert('Soubor se nepodařilo načíst (neplatný JSON).'); return; }
        const tool = data && data.tool && typeof data.tool === 'object' ? data.tool : data;
        if (!tool || !tool.toolShape) { alert('Soubor neobsahuje platnou geometrii nástroje (destička + držák).'); return; }
        pushHistory();
        // Soubor bez holderProfile (starší export) + jiný tvar destičky = obrys
        // držáku nakreslený pro ten předchozí tvar; ten k novému plátku nepatří.
        if (tool.toolShape !== undefined && tool.toolShape !== S.params.toolShape
            && tool.holderProfile === undefined) S.params.holderProfile = null;
        for (const k of CAM_TOOL_KEYS) if (tool[k] !== undefined) S.params[k] = tool[k];
        fullUpdate();
        if (toolUi.toolGeomModalRefresh) toolUi.toolGeomModalRefresh();
        showToast('Nůž (destička + držák) načten ze souboru');
      };
      reader.readAsText(file);
    });
    inp.click();
  }

  /** Aktuální nástroj (S.params) jako záznam 🧰 Knihovny (viz toolLibrary.js).
   *  `tool` = CELÝ nůž (destička + držák, stejná pole jako 💾 Uložit do PC);
   *  ploché VBD/R/úhly zůstávají kvůli přehledu v seznamu a starším čtenářům. */
  function currentToolLibraryRecord() {
    return {
      name: S.params.toolName,
      vbdCode: S.params.toolVbdCode,
      tipRadius: S.params.toolRadius,
      toolAngle: S.params.toolAngle,
      tipAngle: S.params.toolTipAngle,
      clearanceAngle: S.params.toolClearanceAngle,
      vc: S.params.speed,
      f: S.params.feed,
      ap: S.params.depthOfCut,
      tool: _pickCamTool(S.params),
    };
  }

  /** Celý nůž ze záznamu knihovny (kopie — záznam drží otevřený dialog knihovny
   *  a ✏️ Přejmenovat ho ukládá zpět), nebo null u staršího záznamu bez něj
   *  (ty uměly jen VBD, R, úhly a Vc/f/ap). */
  function _libraryKnife(rec) {
    if (!(rec && rec.tool && rec.tool.toolShape)) return null;
    const knife = JSON.parse(JSON.stringify(rec.tool));
    // Nůž uložený z 📚 katalogu se starým obrysem držáku → opravený (viz _upgradeIsoHolders).
    const np = upgradeIsoHolderProfile(rec.name, knife.toolVbdCode, knife.holderProfile);
    if (np) knife.holderProfile = JSON.parse(JSON.stringify(np));
    return knife;
  }


  /** 🧰 Knihovna nožů nad AKTUÁLNÍM nástrojem (S.params) — z hlavičky
   *  🔧 Zásobníku (dřív tlačítko v panelu Nástroj). */
  function openToolLibraryForActive() {
    showToolLibraryDialog({
      getCurrent: currentToolLibraryRecord,
      hand: S.params.roughingSide === 'left' ? 'L' : 'R',
      // 📚 ISO katalog → nový slot zásobníku (okno knihovny zůstane otevřené,
      // ať jde zásobník naplnit víc noži za sebou).
      onAddToMagazine: (rec) => {
        const knife = _libraryKnife(rec);
        if (!knife) return;
        pushHistory();
        const mag = S.toolMagazine;
        const num = mag.length > 0 ? Math.max(...mag.map(s => s.slot)) + 1 : 1;
        const slot = _buildMagSlotFromTool(knife, num, rec.name || `T${num}`);
        if (rec.vc) slot.vc = rec.vc;
        if (rec.f) slot.f = rec.f;
        if (rec.ap) slot.ap = rec.ap;
        mag.push(slot);
        saveState();
        if (toolUi.magazineDialogRefresh) toolUi.magazineDialogRefresh();
        showToast(`${rec.name} přidán do zásobníku jako T${num}`);
      },
      onApply: (tool) => {
        pushHistory();
        const wasDrill = !!getInsert(S.params).canDrill;
        const knife = _libraryKnife(tool);
        if (knife) {
          // Jako 📂 Načíst z PC: obrys držáku patří k tvaru, se kterým se uložil.
          if (knife.toolShape !== S.params.toolShape && knife.holderProfile === undefined) S.params.holderProfile = null;
          for (const k of CAM_TOOL_KEYS) if (knife[k] !== undefined) S.params[k] = knife[k];
        } else {
          if (tool.vbdCode !== undefined) S.params.toolVbdCode = tool.vbdCode;
          if (tool.tipRadius !== undefined) S.params.toolRadius = tool.tipRadius;
          if (tool.toolAngle !== undefined) S.params.toolAngle = tool.toolAngle;
          if (tool.tipAngle !== undefined) S.params.toolTipAngle = tool.tipAngle;
          if (tool.clearanceAngle !== undefined) S.params.toolClearanceAngle = tool.clearanceAngle;
        }
        if (tool.name) S.params.toolName = tool.name;
        if (tool.vc) S.params.speed = tool.vc;
        if (tool.f) S.params.feed = tool.f;
        if (tool.ap) S.params.depthOfCut = tool.ap;
        // Jako pole panelu: jiná destička → pryč s čarami té staré a
        // applyChange (v cyklu závit/upich přegeneruje program), ne jen
        // fullUpdate — stejně jako u VBD dekodéru.
        dropInsertGuides();
        applyAfterToolChange(afterToolChange(wasDrill));
      },
    });
  }

  /** 🔪 Geometrie aktuálního nástroje. Když už je otevřená (zásobník se dá
   *  otevřít i z ní), vytáhne ji nahoru místo zakládání druhého okna. */
  function openOrRaiseToolGeometry() {
    const open = document.querySelector('.cam-geom-overlay');
    if (!open) { showToolGeometryDialog(); return; }
    document.body.appendChild(open);
    if (toolUi.toolGeomModalRefresh) toolUi.toolGeomModalRefresh();
  }

  /** Malé okno s volbami nad zásobníkem (☰ menu, 💾 kam uložit). Volba okno
   *  zavře a zavolá `run(okno)` — z něj si přečte případná pole z `topHTML`.
   *  `items` = [{ icon, label, hint, run }]. */
  function showMagazineMenu(title, items, topHTML = '') {
    const ovr = document.createElement('div');
    ovr.className = 'input-overlay';
    ovr.style.zIndex = '310';
    ovr.innerHTML = `
      <div class="input-dialog cam-mag-dlg" style="width:100%;max-width:380px">
        <div class="cam-mag-head">
          <h3 class="cam-mag-title">${title}</h3>
          <span style="flex:1"></span>
          <button class="cam-mag-hbtn cam-mag-ibtn cam-mag-close" data-act="menu-close" title="Zavřít">✕</button>
        </div>
        ${topHTML}
        <div class="cam-mag-menu">${items.map((it, i) => `
          <button class="cam-mag-menu-item" data-mi="${i}">
            <span class="cam-mag-menu-ico">${it.icon}</span>
            <span class="cam-mag-menu-txt"><b>${it.label}</b><small>${it.hint}</small></span>
          </button>`).join('')}
        </div>
      </div>`;
    const close = () => ovr.remove();
    ovr.addEventListener('click', e => { if (e.target === ovr) close(); });
    ovr.querySelector('[data-act="menu-close"]').addEventListener('click', close);
    ovr.querySelectorAll('[data-mi]').forEach(btn => {
      btn.addEventListener('click', () => { close(); items[+btn.dataset.mi].run(ovr); });
    });
    document.body.appendChild(ovr);
    return ovr;
  }

  /** 💾 Uložit aktuální nástroj — kam: do zásobníku (celý nůž jako nový
   *  aktivní slot) nebo do 🧰 Knihovny (celý nůž, sdílená mezi projekty). */
  function showSaveCurrentToolDialog(onSaved) {
    const mag = S.toolMagazine;
    const nextT = mag.length > 0 ? Math.max(...mag.map(s => s.slot)) + 1 : 1;
    const nameOf = (ovr) => (ovr.querySelector('[data-act="save-name"]').value || '').trim();
    const ovr = showMagazineMenu('💾 Uložit nástroj', [
      { icon: '🔧', label: 'Do zásobníku', run: (o) => { saveCurrentToolToMagazine(nameOf(o)); if (onSaved) onSaved(); },
        hint: `Nový slot T${nextT} — celý nůž: destička, držák i řezné podmínky; stane se aktivním` },
      { icon: '🧰', label: 'Do knihovny', run: (o) => {
          saveToolToLibrary({ ...currentToolLibraryRecord(), name: nameOf(o) || 'Nástroj' });
        },
        hint: 'Celý nůž: destička, držák i řezné podmínky — knihovna je sdílená mezi projekty' },
    ], `<label for="mag-save-name">Název</label>
        <input type="text" id="mag-save-name" data-act="save-name" value="${escAttr(S.params.toolName || '')}" placeholder="T${nextT}" spellcheck="false" autocomplete="off">`);
    const inp = ovr.querySelector('[data-act="save-name"]');
    inp.focus(); inp.select();
  }
  return { exportToolGeometryFile, importToolGeometryFile, currentToolLibraryRecord, _libraryKnife, openToolLibraryForActive, openOrRaiseToolGeometry, showMagazineMenu, showSaveCurrentToolDialog };
}
