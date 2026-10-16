// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Smazat vše a Historie smazaných výkresů             ║
// ╚══════════════════════════════════════════════════════════════╝

// Vyňato z js/ui.js beze změny (16. 10. 2026, docs/plan-refaktoringu-ui.md,
// Fáze 2b); jediná úprava je `export` u showHistoryDialog (otevírá ho
// Nastavení). Listener 🗑 Smazat vše je v initClearAllButton() — volá ji
// js/ui.js na původním místě (pořadí listenerů). Kód aplikace importuje jen
// z js/ui.js, nikdy z js/ui/* napřímo.

import { state, showToast, pushUndo } from '../state.js';
import { expandPolylineObjects } from '../utils.js';
import { renderAll } from '../render.js';
import { bridge } from '../bridge.js';
import { makeOverlay } from '../dialogFactory.js';
import { getMeta, setMeta } from '../idb.js';
import { updateObjectList, updateProperties, updateIntersectionList, updateStatusProject } from '../ui.js';

// ── Smazat vše ──
/** Listener 🗑 Smazat vše (při načtení — volá js/ui.js na původním místě). */
export function initClearAllButton() {
  document.getElementById("btnClearAll").addEventListener("click", async () => {
    if (state.objects.length === 0) return;
    if (confirm("Opravdu smazat všechny objekty?")) {
      // Uložit do historie smazaných výkresů (max 10)
      try {
        const history = (await getMeta('deletedHistory')) || [];
        const snapshot = {
          id: 'del_' + Date.now(),
          name: state.projectName || 'Bez názvu',
          date: new Date().toLocaleString('cs-CZ'),
          data: {
            objects: JSON.parse(JSON.stringify(state.objects)),
            nextId: state.nextId,
            layers: JSON.parse(JSON.stringify(state.layers)),
            activeLayer: state.activeLayer,
            nextLayerId: state.nextLayerId,
          },
        };
        history.unshift(snapshot);
        if (history.length > 10) history.length = 10;
        await setMeta('deletedHistory', history);
      } catch (e) { /* ignore storage errors */ }

      pushUndo();
      state.objects = [];
      state.selected = null;
      state.selectedPoint = null;
      state.intersections = [];
      state.nextId = 1;
      updateObjectList();
      updateProperties();
      updateIntersectionList();
      document.getElementById("cncOutput").value = "";
      renderAll();
    }
  });
}

// ── Historie smazaných výkresů ──
export async function showHistoryDialog() {
  let history = (await getMeta('deletedHistory')) || [];
  if (history.length === 0) {
    showToast("Žádné smazané výkresy v historii");
    return;
  }

  function _esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function buildHistoryHTML(hist) {
    return hist.map((h, i) => {
      const objs = h.data ? (h.data.objects || []) : (h.objects || []);
      const name = h.name || '(bez názvu)';
      return `<li class="project-item" data-hidx="${i}">
        <div class="project-info">
          <div class="project-name">${_esc(name)}</div>
          <div class="project-meta">${_esc(h.date)} · ${objs.length} objektů</div>
        </div>
        <div class="project-actions">
          <button class="project-action-btn" data-act="restore" title="Obnovit">♻️</button>
          <button class="project-action-btn" data-act="rename" title="Přejmenovat">✏️</button>
          <button class="project-action-btn" data-act="tolib" title="Uložit do knihovny">📚</button>
          <button class="project-action-btn del" data-act="delete" title="Smazat z historie">🗑</button>
        </div>
      </li>`;
    }).join('');
  }

  const bodyHTML = `
    <div style="max-height:60vh;overflow-y:auto">
      <p style="margin:0 0 8px;font-size:13px;color:var(--ctp-subtext0)">Posledních ${history.length} smazaných výkresů:</p>
      <ul class="project-list" id="historyList">${buildHistoryHTML(history)}</ul>
    </div>`;
  const overlay = makeOverlay("history", "🕓 Historie smazaných výkresů", bodyHTML);

  function attachHistoryListeners() {
    overlay.querySelectorAll('#historyList .project-item').forEach(item => {
      const idx = parseInt(item.dataset.hidx);
      item.querySelectorAll('.project-action-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const act = btn.dataset.act;
          const entry = history[idx];
          if (!entry) return;

          if (act === 'restore') {
            if (state.objects.length > 0 && !confirm("Nahradit aktuální výkres obnoveným?")) return;
            pushUndo();
            if (entry.data) {
              // Nový formát – plná data projektu
              const _exp = expandPolylineObjects(entry.data.objects || [], entry.data.nextId || 1);
              state.objects = _exp.objects;
              state.nextId = _exp.nextId;
              if (entry.data.layers) {
                state.layers = entry.data.layers;
                state.activeLayer = entry.data.activeLayer || 0;
                state.nextLayerId = entry.data.nextLayerId || (state.layers.length > 0 ? Math.max(...state.layers.map(l => l.id)) + 1 : 1);
              }
            } else {
              // Starý formát – jen objects + nextId
              const _rawObjs = entry.objects || [];
              const _rawId = entry.nextId || (Math.max(0, ..._rawObjs.map(o => o.id || 0)) + 1);
              const _exp = expandPolylineObjects(_rawObjs, _rawId);
              state.objects = _exp.objects;
              state.nextId = _exp.nextId;
            }
            if (entry.name && entry.name !== '(bez názvu)') {
              state.projectName = entry.name;
              updateStatusProject();
            }
            state.selected = null;
            state.selectedPoint = null;
            state.intersections = [];
            updateObjectList();
            updateProperties();
            updateIntersectionList();
            if (bridge.calculateAllIntersections) bridge.calculateAllIntersections();
            renderAll();
            overlay.remove();
            showToast(`Výkres "${entry.name || entry.date}" obnoven ✓`);
          } else if (act === 'rename') {
            const newName = prompt('Nový název:', entry.name || '');
            if (newName && newName.trim()) {
              history[idx].name = newName.trim();
              await setMeta('deletedHistory', history);
              overlay.querySelector('#historyList').innerHTML = buildHistoryHTML(history);
              attachHistoryListeners();
            }
          } else if (act === 'tolib') {
            const libName = prompt('Název v knihovně:', entry.name || `Výkres z ${entry.date}`);
            if (libName && libName.trim()) {
              const library = (await getMeta('library')) || [];
              const objs = entry.data ? (entry.data.objects || []) : (entry.objects || []);
              library.unshift({
                id: 'lib_' + Date.now(),
                name: libName.trim(),
                date: new Date().toLocaleString('cs-CZ'),
                objectCount: objs.length,
                data: entry.data || { objects: entry.objects, nextId: entry.nextId },
              });
              await setMeta('library', library);
              showToast(`Uloženo do knihovny: "${libName.trim()}"`);
            }
          } else if (act === 'delete') {
            if (confirm('Smazat tento záznam z historie?')) {
              history.splice(idx, 1);
              await setMeta('deletedHistory', history);
              if (history.length === 0) {
                overlay.remove();
                showToast('Historie je prázdná');
              } else {
                overlay.querySelector('#historyList').innerHTML = buildHistoryHTML(history);
                attachHistoryListeners();
              }
            }
          }
        });
      });
    });
  }
  attachHistoryListeners();
}
