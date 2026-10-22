// Okno 🔧 Zásobník CAM simulátoru: seznam nožů (karty s náhledem, editace
// slotu, ✅ Použít, ✏️ Upravit, ▲▼, 🗑), ＋ Přidat, 💾 Uložit aktuální,
// ☰ menu (📥 import ze souborů, 🔄 seřazení), ↩/↪. Vyňato z camSimulator.js
// (blok „magazine dialog", docs/plan-rozdeleni-cam-simulatoru.md) — stav
// simulátoru a jeho funkce se předávají parametrem.
import { showToast } from '../../../state.js';
import { showToolLibraryDialog } from '../../../toolLibrary.js';
import { openInsertCalc } from '../../insert.js';
import { knifeThumbSvg } from '../../knifeThumb.js';
import { isoMillSvg } from '../../isoMills.js';
import { camConfirm } from '../camSimulatorDialogs.js';
import { insertOfSlot, holderForResizedInsert } from '../holderFollowsInsert.js';
import { showToolSlotPreviewDialog, paramsFromMagSlot } from '../toolSlotPreview.js';
import { _defaultMagSlot, _slotNameFromFilename, _buildMagSlotFromTool, _setMagSlotShape } from './magSlots.js';

/** @param ctx { S, toolUi, escHTML, escAttr, saveState, pushHistory, undo, redo, updateUndoRedoBtns, _applyMagSlot, flushMagSlotEdit, _reorderMagazine, _resortToolMagazineToDefaults, _libraryKnife, openOrRaiseToolGeometry, showSaveCurrentToolDialog, openToolLibraryForActive, showMagazineMenu } */
export function createMagazineDialog({ S, toolUi, escHTML, escAttr, saveState, pushHistory, undo, redo, updateUndoRedoBtns, _applyMagSlot, flushMagSlotEdit, _reorderMagazine, _resortToolMagazineToDefaults, _libraryKnife, openOrRaiseToolGeometry, showSaveCurrentToolDialog, openToolLibraryForActive, showMagazineMenu }) {
  function showMagazineDialog() {
    // Jen jedno okno — z ⚙️ Geometrie (otevřené ze zásobníku) se dá zásobník
    // otevřít znovu; pak ho jen vytáhnout nahoru.
    const openDlg = document.querySelector('.cam-mag-overlay');
    if (openDlg) {
      document.body.appendChild(openDlg);
      if (toolUi.magazineDialogRefresh) toolUi.magazineDialogRefresh();
      return;
    }

    // Hlavička v jednom řádku: název | 🧰 ⚙️ | ↩ ↪ ☰ · ✕ (křížek odsazený od
    // menu, ať se okno při klepnutí na ☰ omylem nezavře). Import ze souborů
    // a Seřazení jsou v menu ☰, dole jen běžné akce.
    const dlg = document.createElement('div');
    dlg.className = 'input-overlay cam-mag-overlay';
    dlg.style.zIndex = '300';
    dlg.innerHTML = `
      <div class="input-dialog cam-mag-dlg" style="min-width:400px;max-width:540px;width:100%;max-height:82vh;display:flex;flex-direction:column">
        <div class="cam-mag-head">
          <h3 class="cam-mag-title">🔧 Zásobník</h3>
          <div class="cam-mag-head-mid">
            <button class="cam-mag-hbtn" data-act="mag-library" title="Knihovna nožů — vybraný nůž se nastaví jako aktuální nástroj">🧰<span class="cam-mag-lbl">Knihovna</span></button>
            <button class="cam-mag-hbtn" data-act="mag-geometry" title="Geometrie aktuálního nástroje — destička (VBD) a držák, náhled a ISO 5608/5610 katalogová data">🔪<span class="cam-mag-lbl">Geometrie</span></button>
          </div>
          <div class="cam-mag-head-right">
            <button class="cam-mag-hbtn cam-mag-ibtn" data-act="mag-undo" title="Zpět">↩</button>
            <button class="cam-mag-hbtn cam-mag-ibtn" data-act="mag-redo" title="Vpřed">↪</button>
            <button class="cam-mag-hbtn cam-mag-ibtn" data-act="mag-menu" title="Další akce — 📥 Import ze souborů, 🔄 Seřadit dle výchozích">☰</button>
            <button class="cam-mag-hbtn cam-mag-ibtn cam-mag-close" data-act="mag-close" title="Zavřít">✕</button>
          </div>
        </div>
        <div id="mag-dlg-body" style="flex:1;overflow-y:auto;min-height:0"></div>
        <div style="display:flex;gap:8px;margin-top:12px;padding-top:10px;border-top:1px solid #313244">
          <button class="cam-sim-btn cam-sim-btn-gray" id="mag-dlg-save-current" style="flex:1" title="Uloží aktuálně nastavenou destičku i držák (ze záložky Parametry / Geometrie) jako nový nůž">💾 Uložit aktuální nástroj</button>
          <button class="cam-sim-btn cam-sim-btn-gray" id="mag-dlg-add" style="flex:1">＋ Přidat nůž</button>
        </div>
      </div>`;
    document.body.appendChild(dlg);

    const body = dlg.querySelector('#mag-dlg-body');

    // Pole se čte při každém překreslení znovu: ↩/↪ ho nahradí kopií ze snímku.
    function renderBody() {
      const mag = S.toolMagazine;
      const activeIdx = S.activeMagazineSlot;
      const editIdx = S.editingMagazineSlot;

      if (mag.length === 0) {
        body.innerHTML = `<div class="cam-sim-info-box" style="text-align:center;padding:20px">
          Zásobník je prázdný.<br><small>Klikněte „＋ Přidat nůž" níže.</small>
        </div>`;
        attachBodyEvents();
        return;
      }

      let html = '';
      mag.forEach((slot, i) => {
        const isActive = i === activeIdx;
        const isEditing = i === editIdx;
        const shapeIcon = slot.shape === 'round' ? '⬤' : slot.shape === 'parting' ? '▮' : slot.shape === 'threading' ? '▽' : slot.shape === 'drill' ? '⌀' : slot.shape === 'mill' ? '✣' : '◼';
        const isMill = slot.shape === 'mill';   // fréza = poháněný nástroj (frézování z výkresu), ne aktivní nůž
        const border = isActive ? 'border:1.5px solid #a6e3a1;' : 'border:1.5px solid #313244;';

        // Malý náhled nože přímo v řádku (uživatel 6. 10. 2026) — ať je nůž
        // poznat bez rozbalení a 👁 Ukázat; klik na něj Ukázat otevře.
        let thumb = '';
        try { thumb = isMill ? isoMillSvg({ tool: { toolRadius: parseFloat(slot.radius) || 5 }, centerCut: slot.centerCut !== false }, 36) : knifeThumbSvg(paramsFromMagSlot(slot), 36); } catch (_) { /* nečitelný obrys — bez náhledu */ }
        html += `<div class="cam-sim-mag-slot" data-magidx="${i}" style="background:#1e1e2e;border-radius:8px;margin-bottom:8px;${border}overflow:hidden">`;
        html += `<div style="display:flex;align-items:center;gap:6px;padding:7px 8px 7px 4px;cursor:pointer" data-act="mag-toggle" data-magidx="${i}">
          <span class="cam-mag-move">
            <button data-act="mag-up" data-magidx="${i}" title="Posunout výš — prohodí se s T${mag[i - 1]?.slot ?? ''}" ${i === 0 ? 'disabled' : ''}>▲</button>
            <button data-act="mag-down" data-magidx="${i}" title="Posunout níž — prohodí se s T${mag[i + 1]?.slot ?? ''}" ${i === mag.length - 1 ? 'disabled' : ''}>▼</button>
          </span>
          <span class="cam-sim-machine-chip" style="background:${isActive ? '#40a02b' : '#313244'};font-family:monospace;font-weight:700;min-width:28px;text-align:center">T${slot.slot}</span>
          ${thumb ? `<button class="cam-mag-thumb" data-act="mag-thumb" data-magidx="${i}" title="Náhled nože — klik = 👁 Ukázat (destička i držák)">${thumb}</button>` : ''}
          <span style="flex:1;font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHTML(slot.name)}</span>
          ${slot.vbdCode ? `<span class="cam-mag-vbd" style="font-family:monospace;font-size:10px;color:#89dceb;padding:1px 5px;border-radius:4px;border:1px solid #313244">${escHTML(slot.vbdCode.substring(0,12))}</span>` : ''}
          <span class="cam-sim-machine-chip">${isMill ? `✣ ⌀${Math.round((parseFloat(slot.radius) || 0) * 2000) / 1000}` : slot.shape === 'drill' ? `⌀${Math.round((parseFloat(slot.radius) || 0) * 2000) / 1000}` : `${shapeIcon} R${slot.radius}`}</span>
          ${slot.shape === 'polygon' ? `<span class="cam-sim-machine-chip cam-mag-ang">${slot.toolAngle}° ε${slot.tipAngle}°${slot.clearanceAngle ? ` α${slot.clearanceAngle}°` : ''}</span>` : ''}
          ${slot.shape === 'threading' ? `<span class="cam-sim-machine-chip cam-mag-ang">ε${slot.tipAngle}°</span>` : ''}
          ${slot.shape === 'drill' ? `<span class="cam-sim-machine-chip cam-mag-ang">σ${slot.tipAngle}°</span>` : ''}
          ${isMill ? `<span class="cam-sim-machine-chip cam-mag-ang" title="${slot.centerCut === false ? 'Neřeže středem — zanoření rampou' : 'Řeže středem'}">z${slot.teeth || 3}${slot.centerCut === false ? ' ⚠' : ''}</span>` : ''}
          <span style="color:#6c7086;font-size:12px">${isEditing ? '▲' : '▼'}</span>
        </div>`;

        if (isEditing) {
          html += `<div style="padding:0 8px 10px 8px;border-top:1px solid #313244">
            <div class="cam-sim-row" style="margin-top:8px">
              <div class="cam-sim-field"><label>Slot (T#)</label><input type="number" data-mf="slot" data-magidx="${i}" value="${slot.slot}" min="1" max="99" style="font-weight:700"></div>
              <div class="cam-sim-field" style="flex:2"><label>Název (G-kód)</label><input type="text" data-mf="name" data-magidx="${i}" value="${escAttr(slot.name ?? '')}" style="font-family:monospace"></div>
            </div>
            <div class="cam-sim-row">
              <div class="cam-sim-field" style="flex:2"><label>VBD kód</label><input type="text" data-mf="vbdCode" data-magidx="${i}" value="${escAttr(slot.vbdCode ?? '')}" placeholder="CNMG120408-PM" style="font-family:monospace;text-transform:uppercase" spellcheck="false"></div>
              ${slot.shape === 'drill' || isMill
                ? `<div class="cam-sim-field"><label>⌀ ${isMill ? 'frézy' : 'vrtáku'}</label><input type="number" data-mf="drillD" data-magidx="${i}" step="0.1" min="0.1" value="${Math.round((parseFloat(slot.radius) || 0) * 2000) / 1000}"></div>`
                : `<div class="cam-sim-field"><label>Rádius (R)</label><input type="number" data-mf="radius" data-magidx="${i}" step="0.1" value="${slot.radius}"></div>`}
            </div>
            <div style="display:flex;gap:6px;margin-bottom:6px">
              <button data-act="mag-vbd" data-magidx="${i}" class="cam-sim-btn cam-sim-btn-gray" style="flex:1;font-size:11px;padding:4px 6px">🔩 VBD dekodér</button>
              <button data-act="mag-lib" data-magidx="${i}" class="cam-sim-btn cam-sim-btn-gray" style="flex:1;font-size:11px;padding:4px 6px">🧰 Z knihovny</button>
            </div>
            <div style="margin-bottom:4px"><label style="font-size:10px;color:#6c7086">Tvar destičky</label></div>
            <div class="cam-sim-tool-shape-row" style="margin-bottom:6px">
              <button data-mshape="round" data-magidx="${i}" class="${slot.shape === 'round' ? 'cam-sim-active' : ''}">⬤</button>
              <button data-mshape="polygon" data-magidx="${i}" class="${slot.shape === 'polygon' ? 'cam-sim-active' : ''}">◼</button>
              <button data-mshape="parting" data-magidx="${i}" class="${slot.shape === 'parting' ? 'cam-sim-active' : ''}" title="Upichovací / zapichovací plátek">▮</button>
              <button data-mshape="threading" data-magidx="${i}" class="${slot.shape === 'threading' ? 'cam-sim-active' : ''}" title="Závitový plátek">▽</button>
              <button data-mshape="drill" data-magidx="${i}" class="${slot.shape === 'drill' ? 'cam-sim-active' : ''}" title="Vrták (vrtání v ose, záložka Vrtání)">⌀</button>
              <button data-mshape="mill" data-magidx="${i}" class="${isMill ? 'cam-sim-active' : ''}" title="Fréza — poháněný nástroj pro frézování z výkresu (kapsa, drážka, pero); CAM ji vybere podle Ø">✣</button>
            </div>
            ${isMill ? `
            <div class="cam-sim-row">
              <div class="cam-sim-field"><label title="Počet zubů z — posuv F = fz · z · n">Zubů (z)</label><input type="number" data-mf="teeth" data-magidx="${i}" value="${slot.teeth || 3}" min="1" max="12" step="1"></div>
              <div class="cam-sim-field"><label title="Vyložení — od čela frézy k pouzdru">Vyložení</label><input type="number" data-mf="toolLength" data-magidx="${i}" value="${slot.toolLength}"></div>
              <div class="cam-sim-field"><label title="Fréza, která neřeže středem, nesmí zanořit kolmo">Středem</label><select data-mf="centerCut" data-magidx="${i}"><option value="1"${slot.centerCut !== false ? ' selected' : ''}>řeže</option><option value="0"${slot.centerCut === false ? ' selected' : ''}>neřeže</option></select></div>
            </div>` : ''}
            ${slot.shape === 'polygon' ? `
            <div class="cam-sim-row">
              <div class="cam-sim-field"><label>Délka hrany</label><input type="number" data-mf="toolLength" data-magidx="${i}" value="${slot.toolLength}"></div>
              <div class="cam-sim-field"><label>Natočení (°)</label><input type="number" data-mf="toolAngle" data-magidx="${i}" value="${slot.toolAngle}"></div>
              <div class="cam-sim-field"><label>Vrch. úhel (ε)</label><input type="number" data-mf="tipAngle" data-magidx="${i}" value="${slot.tipAngle}"></div>
              <div class="cam-sim-field"><label>Úhel hřbetu (α)</label><input type="number" data-mf="clearanceAngle" data-magidx="${i}" value="${slot.clearanceAngle}" min="0" max="30"></div>
            </div>` : ''}
            ${slot.shape === 'parting' ? `
            <div class="cam-sim-row">
              <div class="cam-sim-field"><label>Šířka plátku</label><input type="number" data-mf="toolLength" data-magidx="${i}" value="${slot.toolLength}"></div>
              <div class="cam-sim-field"><label>Natočení (°)</label><input type="number" data-mf="toolAngle" data-magidx="${i}" value="${slot.toolAngle}"></div>
            </div>` : ''}
            ${slot.shape === 'threading' ? `
            <div class="cam-sim-row">
              <div class="cam-sim-field"><label>Úhel profilu (ε)</label><input type="number" data-mf="tipAngle" data-magidx="${i}" value="${slot.tipAngle}" min="10" max="90"></div>
              <div class="cam-sim-field"><label>Délka hrany</label><input type="number" data-mf="toolLength" data-magidx="${i}" value="${slot.toolLength}"></div>
              <div class="cam-sim-field"><label title="Šířka rovné špičky plátku (Tr/Acme ≈ 0,366×P, metrické ~0,1)">Spodní strana</label><input type="number" data-mf="tipFlat" data-magidx="${i}" value="${slot.tipFlat ?? 0.1}" min="0" step="0.05"></div>
            </div>` : ''}
            ${slot.shape === 'drill' ? `
            <div class="cam-sim-row">
              <div class="cam-sim-field"><label title="Vrcholový úhel špičky σ (HSS 118°, tvrdokov 140°)">Vrch. úhel (σ)</label><input type="number" data-mf="tipAngle" data-magidx="${i}" value="${slot.tipAngle}" min="60" max="180"></div>
              <div class="cam-sim-field"><label title="Vyložení — od špičky ke sklíčidlu/pouzdru">Vyložení</label><input type="number" data-mf="toolLength" data-magidx="${i}" value="${slot.toolLength}"></div>
            </div>` : ''}
            <div class="cam-sim-section-title" style="margin-top:8px">Řezné podmínky</div>
            <div class="cam-sim-row">
              <div class="cam-sim-field"><label>Vc (m/min)</label><input type="number" data-mf="vc" data-magidx="${i}" step="10" value="${slot.vc}"></div>
              <div class="cam-sim-field"><label>${isMill ? 'fz (mm/zub)' : 'f (mm/ot)'}</label><input type="number" data-mf="f" data-magidx="${i}" step="${isMill ? 0.005 : 0.05}" value="${slot.f}"></div>
              <div class="cam-sim-field"><label>${isMill ? 'Krok do hl. (mm)' : 'ap (mm)'}</label><input type="number" data-mf="ap" data-magidx="${i}" step="0.5" value="${slot.ap}"></div>
            </div>
            ${isMill ? `<div class="cam-sim-info-box" style="margin-top:8px;font-size:11px">✣ Fréza je poháněný nástroj — soustružit s ní nejde. CAM ji vybere sám pro frézování z výkresu (kapsa, drážka, pero) podle Ø; otáčky n = Vc·1000/(π·Ø), posuv F = fz·z·n.</div>
            <div style="display:flex;gap:6px;margin-top:6px">${mag.length > 1 ? `<button data-act="mag-delete" data-magidx="${i}" class="cam-sim-btn cam-sim-btn-red" style="flex:1;font-size:12px">🗑 Smazat</button>` : ''}</div>` : `
            <div style="display:flex;gap:6px;margin-top:8px">
              <button data-act="mag-show" data-magidx="${i}" class="cam-sim-btn cam-sim-btn-gray" style="flex:1;font-size:12px" title="Ukáže nůž (destičku i držák) tak, jak vypadá v simulaci — jen náhled, nic se nepřepíše">👁 Ukázat</button>
              <button data-act="mag-edit" data-magidx="${i}" class="cam-sim-btn cam-sim-btn-gray" style="flex:1;font-size:12px" title="Otevře 🔪 Geometrii nástroje pro tento nůž (nastaví ho jako aktivní; změny se po zavření uloží zpět do slotu)">✏️ Upravit</button>
            </div>
            <div style="display:flex;gap:6px;margin-top:6px">
              <button data-act="mag-apply" data-magidx="${i}" class="cam-sim-btn ${isActive ? 'cam-sim-btn-green' : 'cam-sim-btn-gray'}" style="flex:2;font-size:12px">✅ ${isActive ? 'Aktivní nástroj' : 'Použít jako aktivní'}</button>
              ${mag.length > 1 ? `<button data-act="mag-delete" data-magidx="${i}" class="cam-sim-btn cam-sim-btn-red" style="flex:1;font-size:12px">🗑 Smazat</button>` : ''}
            </div>`}
          </div>`;
        }
        html += `</div>`;
      });

      // Nápověda jen nad sbaleným seznamem — u rozbalené karty je to vidět.
      if (mag.length > 0 && !(editIdx != null && mag[editIdx])) {
        html += `<div class="cam-sim-info-box" style="font-size:10px">
          Kliknutím na kartu rozbalíte editaci. „✅ Použít" přepíše parametry nástroje v záložce Parametry.
        </div>`;
      }

      body.innerHTML = html;
      attachBodyEvents();
    }

    // Každá změna slotu = krok historie (↩/↪ v hlavičce); rozbalení karty ne.
    function attachBodyEvents() {
      const mag = S.toolMagazine;
      body.querySelectorAll('[data-act="mag-toggle"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.magidx);
          S.editingMagazineSlot = S.editingMagazineSlot === idx ? null : idx;
          saveState(); renderBody();
        });
      });

      body.querySelectorAll('[data-mf]').forEach(inp => {
        inp.addEventListener('change', () => {
          const idx = parseInt(inp.dataset.magidx);
          const field = inp.dataset.mf;
          const slot = mag[idx];
          if (!slot) return;
          const numFields = ['slot','radius','tipAngle','toolAngle','clearanceAngle','toolLength','tipFlat','vc','f','ap','teeth'];
          pushHistory();
          const _slotWas = insertOfSlot(slot);
          // ⌀ vrtáku se ukládá jako rádius (⌀/2), stejně jako v panelu.
          if (field === 'drillD') slot.radius = Math.max(0.05, (parseFloat(inp.value) || 0) / 2);
          else if (field === 'centerCut') slot.centerCut = inp.value === '1';
          else if (field === 'teeth') slot.teeth = Math.max(1, Math.round(parseFloat(inp.value) || 1));
          else slot[field] =numFields.includes(field) ? (parseFloat(inp.value) || 0) : inp.value;
          const _slotHp = slot.shape === 'mill' ? null : holderForResizedInsert(_slotWas, insertOfSlot(slot));
          if (_slotHp) slot.holderProfile = _slotHp;
          if (idx === S.activeMagazineSlot) { _applyMagSlot(idx); renderBody(); } else { saveState(); renderBody(); }
        });
      });

      body.querySelectorAll('[data-mshape]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.magidx);
          if (!mag[idx] || mag[idx].shape === btn.dataset.mshape) return;
          if (btn.dataset.mshape === 'mill' && idx === S.activeMagazineSlot) {
            showToast('Aktivní nůž nejde změnit na frézu — fréza je poháněný nástroj. Přidejte ji jako nové T (＋) nebo z 📚 katalogu.', 5000);
            return;
          }
          pushHistory();
          _setMagSlotShape(mag[idx], btn.dataset.mshape);
          if (idx === S.activeMagazineSlot) { _applyMagSlot(idx); renderBody(); } else { saveState(); renderBody(); }
        });
      });

      body.querySelectorAll('[data-act="mag-apply"]').forEach(btn => {
        btn.addEventListener('click', () => {
          pushHistory();
          _applyMagSlot(parseInt(btn.dataset.magidx));
          renderBody();
        });
      });

      // Klik na náhled v řádku = 👁 Ukázat (bez rozbalení karty).
      body.querySelectorAll('[data-act="mag-thumb"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const slot = mag[parseInt(btn.dataset.magidx)];
          if (slot) showToolSlotPreviewDialog(slot);
        });
      });

      // 👁 Ukázat — jen náhled nože (destička + držák), do S.params nesahá.
      body.querySelectorAll('[data-act="mag-show"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const slot = mag[parseInt(btn.dataset.magidx)];
          if (slot) showToolSlotPreviewDialog(slot);
        });
      });

      // ✏️ Upravit — Geometrie nástroje umí editovat jen S.params, takže se
      // nůž nejdřív načte jako aktivní; zpětný zápis do slotu řeší
      // toolUi.magEditSlotRef při zavření modalu (viz closeDialog v Geometrii).
      body.querySelectorAll('[data-act="mag-edit"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.magidx);
          if (!mag[idx]) return;
          pushHistory();
          // Rozdělaná úprava jiného slotu se musí uložit TEĎ — po _applyMagSlot
          // by už v S.params byl nový nůž a změny předchozího by se ztratily.
          flushMagSlotEdit();
          _applyMagSlot(idx);
          toolUi.magEditSlotRef = mag[idx];
          toolUi.magEditHandTouched = false;
          renderBody();
          // Když už je Geometrie otevřená (zásobník se z ní dá otevřít),
          // druhý modal navíc nezakládat — jen ji vytáhnout s načteným nožem.
          openOrRaiseToolGeometry();
        });
      });

      body.querySelectorAll('[data-act="mag-delete"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const idx = parseInt(btn.dataset.magidx);
          if (mag.length <= 1) return;   // aspoň jeden nůž v zásobníku zůstává (🗑 se u něj nekreslí)
          if (!await camConfirm(`Smazat slot T${mag[idx]?.slot} (${mag[idx]?.name})?`)) return;
          pushHistory();
          _reorderMagazine(() => S.toolMagazine.splice(idx, 1));
          renderBody();
        });
      });

      // ▲▼ Pozice v zásobníku = číslo T: soused si s nožem vymění místo i T.
      body.querySelectorAll('[data-act="mag-up"], [data-act="mag-down"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();   // hlavička karty jinak rozbalí/sbalí kartu
          const i = parseInt(btn.dataset.magidx);
          const j = btn.dataset.act === 'mag-up' ? i - 1 : i + 1;
          if (!mag[i] || !mag[j]) return;
          pushHistory();
          _reorderMagazine(() => {
            [mag[i].slot, mag[j].slot] = [mag[j].slot, mag[i].slot];
            [mag[i], mag[j]] = [mag[j], mag[i]];
          });
          renderBody();
        });
      });

      body.querySelectorAll('[data-act="mag-vbd"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.magidx);
          openInsertCalc({
            onCamImport: (data) => {
              const slot = S.toolMagazine[idx];
              if (!slot) return;
              pushHistory();
              if (data.isRound) { _setMagSlotShape(slot, 'round'); }
              else if (data.tipAngle !== null) { _setMagSlotShape(slot, 'polygon'); slot.tipAngle = data.tipAngle; }
              if (data.vbdCode) slot.vbdCode = data.vbdCode;
              if (data.clearanceAngle !== null) slot.clearanceAngle = data.clearanceAngle;
              if (data.tipRadius !== null && data.tipRadius > 0) slot.radius = data.tipRadius;
              if (idx === S.activeMagazineSlot) { _applyMagSlot(idx); renderBody(); } else { saveState(); renderBody(); }
            },
          });
          // VBD overlay (.calc-overlay, z-index 200) se otevírá pod zásobníkem (z-index 300)
          // → zvednout nad zásobník hned po vytvoření
          setTimeout(() => {
            const vbdOvr = document.querySelector('.calc-overlay[data-type="inserts"]');
            if (vbdOvr) vbdOvr.style.zIndex = '400';
          }, 0);
        });
      });

      body.querySelectorAll('[data-act="mag-lib"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.magidx);
          showToolLibraryDialog({
            hand: S.params.roughingSide === 'left' ? 'L' : 'R',
            onApply: (tool) => {
              const slot = S.toolMagazine[idx];
              if (!slot) return;
              pushHistory();
              const knife = _libraryKnife(tool);
              if (knife) {
                // Celý nůž do TÉHOŽ objektu slotu (Object.assign, ne nový
                // objekt) — ✏️ Upravit na slot drží referenci.
                Object.assign(slot, _buildMagSlotFromTool(knife, slot.slot, slot.name));
              } else {
                if (tool.vbdCode !== undefined) slot.vbdCode = tool.vbdCode;
                if (tool.tipRadius !== undefined) slot.radius = tool.tipRadius;
                if (tool.toolAngle !== undefined) slot.toolAngle = tool.toolAngle;
                if (tool.tipAngle !== undefined) slot.tipAngle = tool.tipAngle;
                if (tool.clearanceAngle !== undefined) slot.clearanceAngle = tool.clearanceAngle;
              }
              if (tool.name) slot.name = tool.name;
              if (tool.vc) slot.vc = tool.vc;
              if (tool.f) slot.f = tool.f;
              if (tool.ap) slot.ap = tool.ap;
              if (idx === S.activeMagazineSlot) { _applyMagSlot(idx); renderBody(); } else { saveState(); renderBody(); }
            },
          });
        });
      });
    }

    const nextSlotNum = () => {
      const mag = S.toolMagazine;
      return mag.length > 0 ? Math.max(...mag.map(s => s.slot)) + 1 : 1;
    };

    dlg.querySelector('#mag-dlg-add').addEventListener('click', () => {
      pushHistory();
      S.toolMagazine.push(_defaultMagSlot(nextSlotNum()));
      S.editingMagazineSlot = S.toolMagazine.length - 1;
      saveState(); renderBody();
    });

    function importSlotsFromFiles() {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json,application/json'; inp.multiple = true;
      inp.addEventListener('change', () => {
        const files = Array.from(inp.files || []);
        if (!files.length) return;
        // Do zásobníku až najednou a v pořadí výběru (FileReader dobíhá
        // v libovolném pořadí) — jeden krok ↩ Zpět vrátí celý import.
        // onloadend = i při chybě čtení, jinak by se na konec nikdy nedošlo.
        const found = new Array(files.length).fill(null);
        let remaining = files.length;
        files.forEach((file, fi) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            try {
              const data = JSON.parse(reader.result);
              const tool = data && data.tool && typeof data.tool === 'object' ? data.tool : data;
              if (tool && tool.toolShape) found[fi] = { tool, name: _slotNameFromFilename(file.name) };
            } catch (_) { /* neplatný/nekompatibilní soubor přeskočen */ }
            if (--remaining > 0) return;
            const ok = found.filter(Boolean);
            if (ok.length > 0) {
              pushHistory();
              for (const f of ok) S.toolMagazine.push(_buildMagSlotFromTool(f.tool, nextSlotNum(), f.name));
              saveState();
            }
            showToast(ok.length > 0 ? `Do zásobníku přidáno ${ok.length} nožů ze souborů` : 'Nepodařilo se rozpoznat žádný platný soubor nože');
            renderBody();
          };
          reader.readAsText(file);
        });
      });
      inp.click();
    }

    function resortSlots() {
      pushHistory();
      _reorderMagazine(_resortToolMagazineToDefaults);
      showToast('Zásobník přeřazen: výchozí nože na T1, T2…, vlastní za nimi');
      renderBody();
    }

    dlg.querySelector('#mag-dlg-save-current').addEventListener('click', () => showSaveCurrentToolDialog(renderBody));

    dlg.querySelector('[data-act="mag-library"]').addEventListener('click', () => openToolLibraryForActive());
    dlg.querySelector('[data-act="mag-geometry"]').addEventListener('click', () => openOrRaiseToolGeometry());
    dlg.querySelector('[data-act="mag-undo"]').addEventListener('click', () => undo());
    dlg.querySelector('[data-act="mag-redo"]').addEventListener('click', () => redo());
    dlg.querySelector('[data-act="mag-menu"]').addEventListener('click', () => showMagazineMenu('☰ Zásobník', [
      { icon: '📥', label: 'Import ze souborů', run: importSlotsFromFiles,
        hint: 'Jeden nebo víc .json z 💾 Uložit do PC (🔪 Geometrie) — každý jako nový slot, název podle souboru' },
      { icon: '🔄', label: 'Seřadit dle výchozích', run: resortSlots,
        hint: 'Výchozí ISO nože (PSKNR, PSBNR, PDJNR, SRSCR, SER, MGEHR) zpět na T1–T6 v pořadí obrábění, vlastní za ně' },
    ]));
    dlg.querySelector('[data-act="mag-close"]').addEventListener('click', () => {
      if (toolUi.magazineDialogRefresh === renderBody) toolUi.magazineDialogRefresh = null;
      dlg.remove();
    });

    // Seznam se musí umět překreslit i zvenčí — po ✏️ Upravit se do slotu
    // vrací geometrie až při zavření Geometrie (viz flushMagSlotEdit), po ↩/↪
    // je v S.toolMagazine kopie ze snímku.
    toolUi.magazineDialogRefresh = renderBody;
    renderBody();
    updateUndoRedoBtns();
  }
  return { showMagazineDialog };
}
