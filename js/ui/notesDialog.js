// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Poznámkový blok (záložky, ukládání do IDB)         ║
// ╚══════════════════════════════════════════════════════════════╝

// Vyňato z js/ui.js beze změny (16. 10. 2026, docs/plan-refaktoringu-ui.md,
// Fáze 1a). Listener tlačítka #btnOpenNotes věší js/ui/launchers.js
// (initLauncherButtons); kód aplikace importuje jen z js/ui.js, nikdy
// z js/ui/* napřímo.

import { showToast } from '../state.js';
import { makeOverlay } from '../dialogFactory.js';
import { getMeta, setMeta } from '../idb.js';

// ── Poznámkový blok (profesionální verze) ──
/**
 * Svislá poloha znaku `pos` v textovém poli i se zalomenými řádky: zrcadlo
 * se stejným písmem, odsazením a šířkou jako pole. null = pole nemá
 * rozvržení (skryté, test bez layoutu).
 * @param {HTMLTextAreaElement} ta @param {CSSStyleDeclaration} cs @param {number} pos
 */
function textTopAt(ta, cs, pos) {
  if (!ta.clientWidth) return null;
  const m = document.createElement('div');
  for (const p of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing',
    'wordSpacing', 'tabSize', 'paddingTop', 'paddingLeft', 'paddingRight', 'textTransform']) m.style[p] = cs[p];
  Object.assign(m.style, {
    position: 'absolute', visibility: 'hidden', left: '-99999px', top: '0', boxSizing: 'border-box',
    width: ta.clientWidth + 'px', border: '0', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', wordBreak: cs.wordBreak,
  });
  m.textContent = ta.value.slice(0, pos);
  const mark = document.createElement('span');
  mark.textContent = '\u200b';
  m.appendChild(mark);
  document.body.appendChild(m);
  const top = mark.offsetTop;
  m.remove();
  return top;
}

/** Otevře poznámkový blok (📝): víc záložek, autosave, hledání, export .txt. */
export async function openNotesDialog() {
  // ── Data layer: multiple note tabs stored in IDB ──
  let allNotes = await getMeta('userNotesAll');
  if (!allNotes) {
    // Migrate old single-note format
    const legacy = await getMeta('userNotes') || '';
    allNotes = [{ id: 1, title: 'Poznámky', text: legacy }];
  }
  let activeId = allNotes[0].id;
  let nextId = Math.max(...allNotes.map(n => n.id)) + 1;
  let dirty = false;
  let fontSize = 'normal'; // 'sm' | 'normal' | 'lg'

  const getActive = () => allNotes.find(n => n.id === activeId);

  // ── Build overlay ──
  const overlay = makeOverlay('notes', '📝 Poznámkový blok', `
    <!-- Tabs -->
    <div class="notes-tabs" id="notesTabs"></div>
    <!-- Toolbar -->
    <div class="notes-toolbar">
      <button class="notes-tb-btn" data-act="bold" title="Tučné **text**"><b>B</b></button>
      <button class="notes-tb-btn" data-act="italic" title="Kurzíva *text*"><i>I</i></button>
      <button class="notes-tb-btn" data-act="strike" title="Přeškrtnuté ~~text~~"><s>S</s></button>
      <span class="notes-sep"></span>
      <button class="notes-tb-btn" data-act="bullet" title="Odrážka">•</button>
      <button class="notes-tb-btn" data-act="number" title="Číslo">1.</button>
      <button class="notes-tb-btn" data-act="check" title="Checkbox [ ]">☑</button>
      <button class="notes-tb-btn" data-act="heading" title="Nadpis">#</button>
      <span class="notes-sep"></span>
      <button class="notes-tb-btn" data-act="timestamp" title="Vložit datum/čas">🕐</button>
      <button class="notes-tb-btn" data-act="line" title="Oddělovač">―</button>
      <span class="notes-sep"></span>
      <button class="notes-tb-btn" data-act="fontDown" title="Menší písmo">A↓</button>
      <button class="notes-tb-btn" data-act="fontUp" title="Větší písmo">A↑</button>
      <span class="notes-sep"></span>
      <button class="notes-tb-btn" data-act="search" title="Hledat (Ctrl+F)">🔍</button>
      <button class="notes-tb-btn" data-act="undo" title="Zpět (Ctrl+Z)">↩</button>
      <button class="notes-tb-btn" data-act="redo" title="Vpřed (Ctrl+Y)">↪</button>
    </div>
    <!-- Search bar -->
    <div class="notes-search-bar" id="notesSearchBar">
      <input type="text" id="notesSearchInput" inputmode="text" placeholder="Hledat…">
      <span class="notes-search-count" id="notesSearchCount"></span>
      <button class="notes-tb-btn" data-act="searchPrev" title="Předchozí">▲</button>
      <button class="notes-tb-btn" data-act="searchNext" title="Další">▼</button>
      <button class="notes-tb-btn" data-act="searchClose" title="Zavřít">✕</button>
    </div>
    <!-- Editor -->
    <textarea class="notes-editor" id="notesArea" placeholder="Pište své poznámky…\n\nTipy:\n  **tučné**  *kurzíva*  ~~přeškrtnuté~~\n  - odrážky\n  [ ] checkbox\n  # nadpis"></textarea>
    <!-- Status bar -->
    <div class="notes-statusbar">
      <div class="notes-status-left">
        <span class="notes-save-indicator"><span class="dot"></span> <span id="notesSaveText">Uloženo</span></span>
        <span id="notesLastSaved"></span>
      </div>
      <div class="notes-status-right">
        <span id="notesWordCount">0 slov</span>
        <span id="notesCharCount">0 znaků</span>
        <span id="notesLineCount">Ř 1</span>
      </div>
    </div>
    <!-- Actions -->
    <div class="notes-actions">
      <button class="notes-btn danger" data-act="clear">🗑 Vymazat</button>
      <button class="notes-btn" data-act="copy">📋 Kopírovat</button>
      <button class="notes-btn" data-act="download">⬇ Stáhnout .txt</button>
      <button class="notes-btn primary" data-act="save">💾 Uložit</button>
    </div>
  `, 'notes-window');
  if (!overlay) return;

  const ta = overlay.querySelector('#notesArea');
  const tabsEl = overlay.querySelector('#notesTabs');
  const dotEl = overlay.querySelector('.notes-save-indicator .dot');
  const saveTextEl = overlay.querySelector('#notesSaveText');
  const lastSavedEl = overlay.querySelector('#notesLastSaved');
  const wordEl = overlay.querySelector('#notesWordCount');
  const charEl = overlay.querySelector('#notesCharCount');
  const lineEl = overlay.querySelector('#notesLineCount');
  const searchBar = overlay.querySelector('#notesSearchBar');
  const searchInput = overlay.querySelector('#notesSearchInput');
  const searchCountEl = overlay.querySelector('#notesSearchCount');

  // ── Helpers ──
  const persist = async () => {
    await setMeta('userNotesAll', allNotes);
    // keep legacy key in sync
    const first = allNotes.find(n => n.id === 1);
    if (first) await setMeta('userNotes', first.text);
    dirty = false;
    dotEl.classList.remove('dirty');
    saveTextEl.textContent = 'Uloženo';
    const now = new Date();
    lastSavedEl.textContent = now.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  };

  const markDirty = () => {
    dirty = true;
    dotEl.classList.add('dirty');
    saveTextEl.textContent = 'Neuloženo';
  };

  const updateStats = () => {
    const text = ta.value;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    const curLine = ta.value.substring(0, ta.selectionStart).split('\n').length;
    wordEl.textContent = words + ' slov';
    charEl.textContent = chars + ' znaků';
    lineEl.textContent = 'Ř ' + curLine;
  };

  // ── Tab rendering ──
  const renderTabs = () => {
    tabsEl.innerHTML = '';
    allNotes.forEach(n => {
      const btn = document.createElement('button');
      btn.className = 'notes-tab' + (n.id === activeId ? ' active' : '');
      btn.textContent = n.title;
      btn.addEventListener('click', () => switchTab(n.id));
      btn.addEventListener('dblclick', () => renameTab(n.id));
      btn.addEventListener('contextmenu', e => { e.preventDefault(); showTabCtx(e, n.id); });
      tabsEl.appendChild(btn);
    });
    const addBtn = document.createElement('button');
    addBtn.className = 'notes-tab-add';
    addBtn.textContent = '+';
    addBtn.title = 'Nová záložka';
    addBtn.addEventListener('click', addTab);
    tabsEl.appendChild(addBtn);
  };

  const switchTab = (id) => {
    // Save current text before switching
    const cur = getActive();
    if (cur) cur.text = ta.value;
    activeId = id;
    const note = getActive();
    ta.value = note ? note.text : '';
    renderTabs();
    updateStats();
    markDirty();
    ta.focus();
  };

  const addTab = () => {
    const title = prompt('Název nové záložky:', 'Poznámka ' + nextId);
    if (!title) return;
    allNotes.push({ id: nextId++, title, text: '' });
    switchTab(allNotes[allNotes.length - 1].id);
  };

  const renameTab = (id) => {
    const note = allNotes.find(n => n.id === id);
    if (!note) return;
    const title = prompt('Nový název:', note.title);
    if (title) { note.title = title; renderTabs(); markDirty(); }
  };

  const showTabCtx = (e, id) => {
    // Remove old context menu if any
    overlay.querySelectorAll('.notes-ctx').forEach(m => m.remove());
    const menu = document.createElement('div');
    menu.className = 'notes-ctx';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.innerHTML = `
      <button data-ctx="rename">✏️ Přejmenovat</button>
      <button data-ctx="duplicate">📄 Duplikovat</button>
      ${allNotes.length > 1 ? '<button data-ctx="delete">🗑 Smazat</button>' : ''}
    `;
    overlay.appendChild(menu);
    menu.addEventListener('click', ev => {
      const act = ev.target.dataset.ctx;
      if (act === 'rename') renameTab(id);
      if (act === 'duplicate') {
        const src = allNotes.find(n => n.id === id);
        if (src) {
          allNotes.push({ id: nextId++, title: src.title + ' (kopie)', text: src.text });
          switchTab(allNotes[allNotes.length - 1].id);
        }
      }
      if (act === 'delete' && allNotes.length > 1) {
        if (confirm('Smazat záložku „' + (allNotes.find(n => n.id === id)?.title) + '"?')) {
          allNotes = allNotes.filter(n => n.id !== id);
          if (activeId === id) switchTab(allNotes[0].id);
          renderTabs();
          markDirty();
        }
      }
      menu.remove();
    });
    const dismiss = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', dismiss); } };
    setTimeout(() => document.addEventListener('click', dismiss), 0);
  };

  // ── Toolbar: insert helpers ──
  const wrapSelection = (before, after) => {
    const start = ta.selectionStart, end = ta.selectionEnd;
    const sel = ta.value.substring(start, end) || 'text';
    ta.setRangeText(before + sel + after, start, end, 'select');
    ta.focus();
    markDirty();
    updateStats();
  };

  const insertAtCursor = (text) => {
    const start = ta.selectionStart;
    ta.setRangeText(text, start, ta.selectionEnd, 'end');
    ta.focus();
    markDirty();
    updateStats();
  };

  const insertLinePrefix = (prefix) => {
    const start = ta.selectionStart;
    const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
    ta.setRangeText(prefix, lineStart, lineStart, 'end');
    ta.focus();
    markDirty();
    updateStats();
  };

  // ── Toolbar actions ──
  const toolbarActions = {
    bold: () => wrapSelection('**', '**'),
    italic: () => wrapSelection('*', '*'),
    strike: () => wrapSelection('~~', '~~'),
    bullet: () => insertLinePrefix('- '),
    number: () => insertLinePrefix('1. '),
    check: () => insertLinePrefix('[ ] '),
    heading: () => insertLinePrefix('# '),
    timestamp: () => {
      const now = new Date();
      insertAtCursor('[' + now.toLocaleDateString('cs-CZ') + ' ' + now.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }) + '] ');
    },
    line: () => insertAtCursor('\n────────────────────────────────\n'),
    fontDown: () => {
      if (fontSize === 'lg') fontSize = 'normal';
      else fontSize = 'sm';
      ta.classList.remove('font-sm', 'font-lg');
      if (fontSize !== 'normal') ta.classList.add('font-' + fontSize);
    },
    fontUp: () => {
      if (fontSize === 'sm') fontSize = 'normal';
      else fontSize = 'lg';
      ta.classList.remove('font-sm', 'font-lg');
      if (fontSize !== 'normal') ta.classList.add('font-' + fontSize);
    },
    search: () => searchBar.classList.toggle('open'),
    undo: () => { document.execCommand('undo'); updateStats(); },
    redo: () => { document.execCommand('redo'); updateStats(); },
    // Search navigation
    searchClose: () => searchBar.classList.remove('open'),
    searchPrev: () => doSearch(-1),
    searchNext: () => doSearch(1),
    // Bottom actions
    save: () => { getActive().text = ta.value; persist(); showToast('Poznámky uloženy ✓'); },
    clear: () => {
      if (confirm('Opravdu vymazat obsah této záložky?')) {
        ta.value = '';
        getActive().text = '';
        markDirty();
        updateStats();
        showToast('Záložka vymazána');
      }
    },
    copy: () => {
      navigator.clipboard.writeText(ta.value).then(() => showToast('Zkopírováno do schránky ✓'));
    },
    download: () => {
      const note = getActive();
      const blob = new Blob([ta.value], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (note.title || 'poznamky') + '.txt';
      a.click();
      URL.revokeObjectURL(a.href);
      showToast('Soubor stažen ✓');
    },
  };

  // ── Search in text ──
  let searchMatches = [];
  let searchIdx = -1;
  // fromField = hledá se z pole hledání (psaní, Enter): fokus v poli zůstane,
  // nález se v editoru jen označí a editor se na něj posune. Dřív se fokus
  // přesunul do editoru a další psaná písmena přepsala označený nález.
  const doSearch = (dir, fromField = false) => {
    const q = searchInput.value;
    if (!q) { searchCountEl.textContent = ''; return; }
    searchMatches = [];
    let i = -1;
    const lower = ta.value.toLowerCase();
    const ql = q.toLowerCase();
    while ((i = lower.indexOf(ql, i + 1)) !== -1) searchMatches.push(i);
    if (!searchMatches.length) { searchCountEl.textContent = '0 / 0'; return; }
    searchIdx = (searchIdx + dir + searchMatches.length) % searchMatches.length;
    searchCountEl.textContent = (searchIdx + 1) + ' / ' + searchMatches.length;
    if (!fromField) ta.focus();
    ta.setSelectionRange(searchMatches[searchIdx], searchMatches[searchIdx] + q.length);
    if (fromField) {
      // Bez fokusu prohlížeč k označení neposune — posunout na nález.
      const cs = getComputedStyle(ta);
      let lh = parseFloat(cs.lineHeight);
      if (isNaN(lh)) lh = (parseFloat(cs.fontSize) || 14) * 1.2;
      // Poloha i se zalomenými řádky (dlouhý odstavec = víc řádků na
      // obrazovce); bez rozvržení (skrytý editor) aspoň podle řádků textu.
      const top = textTopAt(ta, cs, searchMatches[searchIdx]);
      const line = ta.value.slice(0, searchMatches[searchIdx]).split('\n').length - 1;
      ta.scrollTop = Math.max(0, top != null ? top - 2 * lh : (line - 2) * lh);
    }
  };
  searchInput.addEventListener('input', () => { searchIdx = -1; doSearch(1, true); });
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); doSearch(e.shiftKey ? -1 : 1, true); }
    // Escape zavře jen lištu hledání — nesmí bublat na document, jinak ESC
    // z makeOverlay / events.js zavře celé okno poznámek.
    if (e.key === 'Escape') { e.stopPropagation(); searchBar.classList.remove('open'); ta.focus(); }
  });

  // ── Event delegation for toolbar + action buttons ──
  overlay.addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act && toolbarActions[act]) toolbarActions[act]();
  });

  // ── Text area events ──
  let autoSaveTimer = null;
  ta.addEventListener('input', () => {
    markDirty();
    updateStats();
    // Debounced autosave
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      getActive().text = ta.value;
      persist();
    }, 2000);
  });
  ta.addEventListener('click', updateStats);
  ta.addEventListener('keyup', e => {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(e.key)) updateStats();
  });

  // Ctrl+F interceptor inside notes
  ta.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      searchBar.classList.add('open');
      searchInput.focus();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      getActive().text = ta.value;
      persist();
      showToast('Poznámky uloženy ✓');
    }
    // Tab key inserts \t
    if (e.key === 'Tab') {
      e.preventDefault();
      insertAtCursor('\t');
    }
  });

  // ── Init ──
  const note = getActive();
  ta.value = note ? note.text : '';
  renderTabs();
  updateStats();
  ta.focus();

  // ── Autosave on overlay close ──
  const _obs = new MutationObserver((_, obs) => {
    if (!document.body.contains(overlay)) {
      clearTimeout(autoSaveTimer);
      getActive().text = ta.value;
      persist();
      obs.disconnect();
    }
  });
  _obs.observe(document.body, { childList: true });
}
