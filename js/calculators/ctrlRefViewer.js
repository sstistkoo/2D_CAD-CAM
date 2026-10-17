import { makeOverlay } from '../dialogFactory.js';

// ── Společné okno referenční příručky řídicího systému ──────
// Sinumerik má vlastní moduly (gcode.js, mcode.js, …). Fanuc a Heidenhain
// používají tyto tři obecné funkce + datové soubory (fanuc*.js, heidenhain*.js).
// Vzhled sdílí CSS třídy `gc-*` / `sn-*` (viz css/style.css).

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/** Zkratka pro položku s jedním příkladem: ref(název, syntaxe, popis, kód, [poznámka]). */
export function ref(name, syntax, description, code, note = '') {
  return { name, syntax, description, examples: code ? [{ title: 'Příklad:', code, description: note }] : [] };
}

// ── Rozcestník ──────────────────────────────────────────────
// tiles: [{ icon, title, desc, action }]
export function openControlHub({ type, title, subtitle, tiles }) {
  const tilesHTML = tiles.map((t, i) => `
    <button class="sn-tile" data-idx="${i}">
      <span class="sn-tile-icon">${t.icon}</span>
      <span class="sn-tile-title">${esc(t.title)}</span>
      <span class="sn-tile-desc">${esc(t.desc)}</span>
    </button>`).join('');

  const overlay = makeOverlay(type, title,
    `<div class="sn-subtitle">${esc(subtitle)}</div><div class="sn-grid">${tilesHTML}</div>`,
    'sn-window');
  if (!overlay) return;

  overlay.querySelector('.sn-grid').addEventListener('click', e => {
    const tile = e.target.closest('.sn-tile');
    if (!tile) return;
    overlay.remove();
    tiles[Number(tile.dataset.idx)].action();
  });
}

// ── Seznam s vyhledáváním a kategoriemi ─────────────────────
// groups: { 'Název skupiny': ['jméno', …] }, items: [{ name, syntax, description, examples }]
export function openRefList({ type, title, placeholder, groups, items, windowClass = 'gc-window', syntaxLabel = 'Syntax:', note = '' }) {
  const chips = Object.keys(groups).map(cat =>
    `<button class="gc-chip" data-cat="${esc(cat)}">${esc(cat)}</button>`).join('');

  const overlay = makeOverlay(type, title, `
    <div class="gc-search-wrap">
      <input type="search" class="gc-search" placeholder="${esc(placeholder || 'Hledat…')}" autocomplete="off">
    </div>
    ${note ? `<div class="gc-note">${esc(note)}</div>` : ''}
    <div class="gc-chips">
      <button class="gc-chip gc-chip-active" data-cat="__all__">Vše</button>${chips}
    </div>
    <div class="gc-list"></div>`, windowClass);
  if (!overlay) return;

  const searchEl = overlay.querySelector('.gc-search');
  const listEl = overlay.querySelector('.gc-list');
  const chipsEl = overlay.querySelector('.gc-chips');
  let activeCat = '__all__';

  const cardHTML = cmd => `
    <div class="gc-card" data-name="${esc(cmd.name)}">
      <div class="gc-card-header">
        <span class="gc-card-name">${esc(cmd.name)}</span>
        <span class="gc-card-desc">${esc(cmd.description)}</span>
        <span class="gc-card-arrow">▾</span>
      </div>
      <div class="gc-card-detail">
        <div class="gc-syntax"><span class="gc-syntax-label">${esc(syntaxLabel)}</span> <code>${esc(cmd.syntax)}</code></div>
        ${(cmd.examples || []).map(ex => `
          <div class="gc-example">
            <div class="gc-ex-title">${esc(ex.title)}</div>
            <pre class="gc-ex-code">${esc(ex.code)}</pre>
            ${ex.description ? `<div class="gc-ex-desc">${esc(ex.description)}</div>` : ''}
          </div>`).join('')}
      </div>
    </div>`;

  function render() {
    const q = searchEl.value.trim().toLowerCase();
    const matches = c => !q ||
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.syntax.toLowerCase().includes(q);

    let html = '';
    if (activeCat !== '__all__') {
      const allowed = groups[activeCat] || [];
      html = items.filter(c => allowed.includes(c.name) && matches(c)).map(cardHTML).join('');
    } else {
      const grouped = new Set(Object.values(groups).flat());
      for (const [groupName, names] of Object.entries(groups)) {
        const part = items.filter(c => names.includes(c.name) && matches(c));
        if (part.length) html += `<div class="gc-group-title">${esc(groupName)}</div>${part.map(cardHTML).join('')}`;
      }
      const rest = items.filter(c => !grouped.has(c.name) && matches(c));
      if (rest.length) html += `<div class="gc-group-title">Ostatní</div>${rest.map(cardHTML).join('')}`;
    }
    listEl.innerHTML = html || '<div class="gc-empty">Žádné výsledky</div>';
  }

  listEl.addEventListener('click', e => {
    const card = e.target.closest('.gc-card');
    if (!card) return;
    const wasOpen = card.classList.contains('gc-card-open');
    listEl.querySelectorAll('.gc-card-open').forEach(c => c.classList.remove('gc-card-open'));
    if (!wasOpen) card.classList.add('gc-card-open');
  });
  searchEl.addEventListener('input', render);
  chipsEl.addEventListener('click', e => {
    const chip = e.target.closest('.gc-chip');
    if (!chip) return;
    chipsEl.querySelectorAll('.gc-chip').forEach(c => c.classList.remove('gc-chip-active'));
    chip.classList.add('gc-chip-active');
    activeCat = chip.dataset.cat;
    render();
  });

  render();
  searchEl.focus();
}

// ── Ukázky programů ─────────────────────────────────────────
// examples: [{ title, code, notes?: [string] }]
export function openRefExamples({ type, title, examples }) {
  const overlay = makeOverlay(type, title, `
    <div class="gc-search-wrap">
      <input type="search" class="gc-search ex-search" placeholder="Hledat ukázku…" autocomplete="off">
    </div>
    <div class="gc-list"></div>`, 'gc-window ex-window');
  if (!overlay) return;

  const searchEl = overlay.querySelector('.gc-search');
  const listEl = overlay.querySelector('.gc-list');

  function render() {
    const q = searchEl.value.trim().toLowerCase();
    const shown = examples.filter(ex => !q || ex.title.toLowerCase().includes(q) || ex.code.toLowerCase().includes(q));
    if (!shown.length) { listEl.innerHTML = '<div class="gc-empty">Žádné výsledky</div>'; return; }

    listEl.innerHTML = shown.map(ex => `
      <div class="gc-card gc-card-open ex-card">
        <div class="gc-card-header ex-card-header">
          <span class="gc-card-name ex-card-name">${esc(ex.title)}</span>
          <button class="mc-copy-btn" data-code="${esc(ex.code)}" title="Kopírovat kód">📋</button>
        </div>
        <div class="gc-card-detail" style="display:block">
          <pre class="gc-ex-code ex-code-block">${esc(ex.code)}</pre>
          ${ex.notes?.length ? `<ul class="ex-notes">${ex.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
        </div>
      </div>`).join('');
  }

  listEl.addEventListener('click', e => {
    const btn = e.target.closest('.mc-copy-btn');
    if (!btn) return;
    e.stopPropagation();
    navigator.clipboard?.writeText(btn.dataset.code).then(() => {
      btn.textContent = '✓';
      setTimeout(() => { btn.textContent = '📋'; }, 1200);
    }).catch(() => {});
  });
  searchEl.addEventListener('input', render);
  render();
  searchEl.focus();
}
