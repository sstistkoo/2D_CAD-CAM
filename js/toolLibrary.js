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
//     vc, f, ap, date }

import { showToast } from './state.js';
import { getMeta, setMeta } from './idb.js';

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

/**
 * Otevře dialog knihovny nástrojů.
 * @param {Object} opts
 * @param {(tool: Object) => void} [opts.onApply] - zavoláno po kliknutí na "Použít"
 * @param {() => Object|null} [opts.getCurrent] - vrátí aktuální parametry nástroje
 *        pro tlačítko "Uložit aktuální nástroj" (null/nedefinováno = tlačítko skryto)
 */
export async function showToolLibraryDialog(opts = {}) {
  let library = await getToolLibrary();

  function buildList(lib) {
    if (lib.length === 0) {
      return `<li style="color:var(--ctp-overlay0);padding:20px;text-align:center">
        Knihovna nástrojů je prázdná.${opts.getCurrent ? '<br><span style="font-size:12px">Uložte aktuální nástroj tlačítkem níže.</span>' : ''}
      </li>`;
    }
    return lib.map((t, i) => `
      <li class="project-item" data-tidx="${i}">
        <div class="project-info">
          <div class="project-name">${_esc(t.name)}</div>
          <div class="project-meta">
            ${t.material ? _esc(t.material) + ' · ' : ''}${t.vbdCode ? _esc(t.vbdCode) + ' · ' : ''}rε ${_fmt(t.tipRadius)} mm
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
    <div class="input-dialog" style="min-width:360px;max-width:520px">
      <h3>🧰 Knihovna nástrojů</h3>
      <ul class="project-list" id="toolLibList">${buildList(library)}</ul>
      <div class="btn-row" style="flex-direction:column;gap:8px;align-items:stretch">
        ${opts.getCurrent ? '<button class="btn-ok" id="toolLibSaveCurrent" style="width:100%">➕ Uložit aktuální nástroj do knihovny</button>' : ''}
        <button class="btn-cancel" id="toolLibClose" style="width:100%">Zavřít</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  function refreshList() {
    overlay.querySelector('#toolLibList').innerHTML = buildList(library);
    attachListeners();
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
