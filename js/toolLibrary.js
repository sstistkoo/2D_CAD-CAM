// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Knihovna nástrojů (sdílená napříč kalkulačkami)     ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Umožňuje uložit vlastní sadu nástrojů (VBD, poloměr špičky, úhly,
// řezné podmínky Vc/f/ap) a znovu je použít v CAM simulátoru,
// kalkulačce VBD & Držáky apod., aniž by se musely zadávat opakovaně.
//
// Záznam nástroje:
//   { id, name, material, vbdCode, tipRadius, toolAngle, tipAngle,
//     vc, f, ap, date, tool? }
// `tool` (jen z CAM) = celý nůž — destička i držák, pole CAM_TOOL_KEYS
// (cam/camToolPicker.js). Záznamy bez něj (VBD kalkulačka, starší) nesou
// jen VBD, R, úhly a řezné podmínky.

import { showToast } from './state.js';
import { getMeta, setMeta } from './idb.js';
import { mountIsoCatalog } from './calculators/isoCatalogPanel.js';

const META_KEY = 'toolLibrary';

/** Vrátí pole uložených nástrojů (nejnovější první). */
export async function getToolLibrary() {
  return (await getMeta(META_KEY)) || [];
}

/** Uloží nový nástroj do knihovny. */
export async function saveToolToLibrary(tool) {
  const library = await getToolLibrary();
  library.unshift({
    id: 'tool_' + Date.now(),
    date: new Date().toLocaleString('cs-CZ'),
    name: 'Nástroj',
    material: '',
    vbdCode: '',
    tipRadius: 0,
    toolAngle: 0,
    tipAngle: 0,
    clearanceAngle: 0,
    vc: 0, f: 0, ap: 0,
    ...tool,
  });
  await setMeta(META_KEY, library);
  showToast(`Nástroj uložen do knihovny: "${tool.name || 'Nástroj'}"`);
}

/** Smaže nástroj z knihovny podle id. */
export async function deleteToolFromLibrary(id) {
  const library = await getToolLibrary();
  const filtered = library.filter(t => t.id !== id);
  await setMeta(META_KEY, filtered);
  return filtered;
}

function _esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _fmt(n) {
  return (n === undefined || n === null || n === '') ? '–' : n;
}

const SHAPE_ICON = { round: '⬤', polygon: '◼', parting: '▮', threading: '▽', drill: '⌀' };

/**
 * Otevře dialog knihovny nástrojů. S `onApply` má dvě záložky: 🧰 Moje nože
 * (uložené) a 📚 ISO katalog (isoCatalogPanel.js) — vestavěné nože z ISO.
 * @param {Object} opts
 * @param {(tool: Object) => void} [opts.onApply] - zavoláno po kliknutí na "Použít"
 * @param {() => Object|null} [opts.getCurrent] - vrátí aktuální parametry nástroje
 *        pro tlačítko "Uložit aktuální nástroj" (null/nedefinováno = tlačítko skryto)
 * @param {(tool: Object) => void} [opts.onAddToMagazine] - 🔧 Do zásobníku v katalogu
 * @param {'R'|'L'} [opts.hand] - výchozí ruka nožů v katalogu (strana hrubování)
 */
export async function showToolLibraryDialog(opts = {}) {
  let library = await getToolLibrary();
  const hasCatalog = typeof opts.onApply === 'function';
  let catalogMounted = false;

  function buildList(lib) {
    if (lib.length === 0) {
      return `<li style="color:var(--ctp-subtext0);padding:20px;text-align:center">
        Knihovna nástrojů je prázdná.${opts.getCurrent ? '<br><span style="font-size:12px">Uložte aktuální nástroj tlačítkem níže.</span>' : ''}
        ${hasCatalog ? '<br><span style="font-size:12px">Hotové nože podle ISO najdete v záložce 📚 ISO katalog.</span>' : ''}
      </li>`;
    }
    return lib.map((t, i) => `
      <li class="project-item" data-tidx="${i}">
        <div class="project-info">
          <div class="project-name">${_esc(t.name)}</div>
          <div class="project-meta">
            ${t.tool && t.tool.toolShape ? `<span title="Celý nůž — destička i držák">${SHAPE_ICON[t.tool.toolShape] || ''} + držák</span> · ` : ''}${t.material ? _esc(t.material) + ' · ' : ''}${t.vbdCode ? `<span style="font-family:monospace">${_esc(t.vbdCode)}</span> · ` : ''}${t.tool && t.tool.toolShape === 'drill' ? `⌀ ${_fmt(Math.round(t.tipRadius * 2000) / 1000)} mm · σ ${_fmt(t.tipAngle)}°` : `rε ${_fmt(t.tipRadius)} mm`}${t.clearanceAngle ? ` · α ${_fmt(t.clearanceAngle)}°` : ''}
            ${t.vc ? ` · Vc ${_fmt(t.vc)} f ${_fmt(t.f)} ap ${_fmt(t.ap)}` : ''}
          </div>
        </div>
        <div class="project-actions">
          ${opts.onApply ? '<button class="project-action-btn" data-act="apply" title="Použít v kalkulačce">✅</button>' : ''}
          <button class="project-action-btn" data-act="rename" title="Přejmenovat">✏️</button>
          <button class="project-action-btn del" data-act="delete" title="Smazat">🗑</button>
        </div>
      </li>`
    ).join('');
  }

  const overlay = document.createElement('div');
  overlay.className = 'input-overlay';
  overlay.style.zIndex = '300';
  overlay.innerHTML = `
    <div class="input-dialog tool-lib-dlg${hasCatalog ? ' tool-lib-dlg--wide' : ''}">
      <h3>🧰 Knihovna nástrojů</h3>
      ${hasCatalog ? `<div class="vbd-tabs">
        <button class="vbd-tab" data-tab="mine">🧰 Moje nože (<span id="toolLibCount">${library.length}</span>)</button>
        <button class="vbd-tab" data-tab="iso">📚 ISO katalog</button>
      </div>` : ''}
      <div class="tool-lib-pane" data-pane="mine">
        <ul class="project-list" id="toolLibList">${buildList(library)}</ul>
        ${opts.getCurrent ? '<button class="btn-ok" id="toolLibSaveCurrent" style="width:100%;margin-bottom:8px">➕ Uložit aktuální nástroj do knihovny</button>' : ''}
      </div>
      ${hasCatalog ? '<div class="tool-lib-pane tool-lib-pane--iso" data-pane="iso"></div>' : ''}
      <div class="btn-row" style="flex-direction:column;gap:8px;align-items:stretch">
        <button class="btn-cancel" id="toolLibClose" style="width:100%">Zavřít</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  function refreshList() {
    overlay.querySelector('#toolLibList').innerHTML = buildList(library);
    const cnt = overlay.querySelector('#toolLibCount');
    if (cnt) cnt.textContent = library.length;
    attachListeners();
  }

  // Záložky: prázdná knihovna otevře rovnou katalog (jinak by okno nic nenabídlo).
  function showTab(tab) {
    overlay.querySelectorAll('.vbd-tab').forEach((b) => b.classList.toggle('vbd-tab-active', b.dataset.tab === tab));
    overlay.querySelectorAll('.tool-lib-pane').forEach((p) => { p.style.display = p.dataset.pane === tab ? '' : 'none'; });
    if (tab === 'iso' && !catalogMounted) {
      catalogMounted = true;
      mountIsoCatalog(overlay.querySelector('[data-pane="iso"]'), {
        hand: opts.hand,
        onApply: (rec) => {
          opts.onApply(rec);
          overlay.remove();
          showToast(`Nástroj "${rec.name}" použit.`);
        },
        onAddToMagazine: opts.onAddToMagazine,
        onSave: async (rec) => {
          await saveToolToLibrary(rec);
          library = await getToolLibrary();
          refreshList();
        },
      });
    }
  }
  if (hasCatalog) {
    overlay.querySelectorAll('.vbd-tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
    showTab(library.length === 0 ? 'iso' : 'mine');
  }

  function attachListeners() {
    overlay.querySelectorAll('#toolLibList .project-item').forEach(item => {
      const idx = parseInt(item.dataset.tidx);
      item.querySelectorAll('.project-action-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const act = btn.dataset.act;
          const entry = library[idx];
          if (!entry) return;

          if (act === 'apply') {
            opts.onApply(entry);
            overlay.remove();
            showToast(`Nástroj "${entry.name}" použit.`);
          } else if (act === 'rename') {
            const newName = prompt('Nový název:', entry.name);
            if (newName && newName.trim()) {
              library[idx].name = newName.trim();
              await setMeta(META_KEY, library);
              refreshList();
            }
          } else if (act === 'delete') {
            if (!confirm(`Smazat nástroj "${entry.name}"?`)) return;
            library = await deleteToolFromLibrary(entry.id);
            refreshList();
          }
        });
      });
    });
  }
  attachListeners();

  const saveBtn = overlay.querySelector('#toolLibSaveCurrent');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const tool = opts.getCurrent ? opts.getCurrent() : null;
      if (!tool) return;
      const name = prompt('Název nástroje:', tool.name || 'Nástroj');
      if (!name || !name.trim()) return;
      await saveToolToLibrary({ ...tool, name: name.trim() });
      library = await getToolLibrary();
      refreshList();
    });
  }

  overlay.querySelector('#toolLibClose').addEventListener('click', () => overlay.remove());
}
