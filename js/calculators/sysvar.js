import { makeOverlay } from '../dialogFactory.js';

// ── Data: Systémové proměnné Sinumerik 840D ─────────────────
const variableGroups = {
  'Geometrické Osy': [
    { name: '$P_AXN1', desc: 'Aktuální adresa geometrické osy – souřadnice' },
    { name: '$P_AXN2', desc: 'Aktuální adresa geometrické osy – pořadnice' },
    { name: '$P_AXN3', desc: 'Aktuální adresa geometrické osy – použití' }
  ],
  'Frame Proměnné': [
    { name: '$P_IFRAME',   desc: 'Aktuální nastavitelný Frame' },
    { name: '$P_PFRAME',   desc: 'Aktuální programovatelný Frame' },
    { name: '$P_BFRAME',   desc: 'Aktuální proměnná základní Frame' },
    { name: '$P_ACTFRAME', desc: 'Aktuální celkový Frame' },
    { name: '$P_UIFR[]',   desc: 'Nastavitelné Frame (např. G54)' }
  ],
  'Systémové Informace': [
    {
      name: '$P_F',
      desc: 'Aktuálně aktivní posuv',
      detail: 'Hodnota závisí na G94/G95 režimu (mm/min resp. mm/ot).',
      code: 'R10=$P_F           ; Uložení aktivního posuvu do R10\nIF $P_F < 0.1       ; Kontrola minimálního posuvu\n    MSG("Příliš malý posuv!")\nENDIF'
    },
    { name: '$P_DRYRUN', desc: '0 → Zkušební chod ZAP; 1 → Zkušební chod VYP' },
    { name: '$P_SEARCH', desc: '1 → Vyhledání věty (s výpočtem nebo bez) je aktivní' }
  ],
  'Nástrojové Proměnné': [
    { name: '$P_TOOLR',  desc: 'Aktivní poloměr nástroje (WZ) – celkem' },
    { name: '$P_TOOLNO', desc: 'Aktivní číslo WZ (T0 – T32000)' }
  ],
  'Vřeteno a Osy': [
    { name: '$AC_MSNUM', desc: 'Číslo řídicího (Master) vřetena' },
    { name: '$AA_S',     desc: 'Skutečný počet otáček vřetena (znaménko = směr otáčení)' }
  ],
  'Měrový Systém': [
    { name: '$MN_SCALING_SYSTEM_IS_METRIC', desc: '1 → Metrický, 2 → Palcový' },
    { name: '$MN_SCALING_VALUE_INCH',       desc: 'Konverzní faktor z metr. na palcový systém (25,4)' }
  ],
  'PLC Komunikace': [
    { name: '$A_IN[]',  desc: 'Digitální signály PLC – čtení (1-16)' },
    { name: '$A_OUT[]', desc: 'Digitální signály PLC – psaní' },
    { name: '$A_INA[]', desc: 'Reálná hodnota PLC – čtení (1-4)' },
    {
      name: '$AA_IW[X]',
      desc: 'Skutečná pozice osy v souřadném systému obrobku',
      detail: 'Aktualizuje se v reálném čase. Hodnota v mm nebo palcích. Lze použít pro všechny osy.',
      code: 'R1=$AA_IW[X]       ; Uložení aktuální X pozice do R1\nIF $AA_IW[X] > 100  ; Kontrola pozice X\n    MSG("X je větší než 100mm")\nENDIF'
    }
  ]
};

// ── Helpers ─────────────────────────────────────────────────
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function allVars() {
  return Object.values(variableGroups).flat();
}

// ── Hlavní funkce ───────────────────────────────────────────
export function openSysvarReference() {
  const cats = Object.keys(variableGroups);
  const chipHTML = cats.map(c =>
    `<button class="gc-chip" data-cat="${esc(c)}">${esc(c)} <span class="mc-chip-count">${variableGroups[c].length}</span></button>`
  ).join('');

  const bodyHTML = `
    <div class="gc-search-wrap">
      <input type="search" class="gc-search sv-search" id="svSearch" placeholder="Hledat proměnnou…" autocomplete="off">
    </div>
    <div class="gc-chips" id="svChips">
      <button class="gc-chip gc-chip-active" data-cat="__all__">Vše <span class="mc-chip-count">${allVars().length}</span></button>
      ${chipHTML}
    </div>
    <div class="gc-list" id="svList"></div>
  `;

  const overlay = makeOverlay('sysvar', '📊 Systémové proměnné – Sinumerik 840D', bodyHTML, 'gc-window sv-window');
  if (!overlay) return;

  const searchEl = overlay.querySelector('#svSearch');
  const listEl   = overlay.querySelector('#svList');
  const chipsEl  = overlay.querySelector('#svChips');
  let activeCat  = '__all__';

  function render() {
    const q = searchEl.value.trim().toLowerCase();
    let groups = activeCat === '__all__'
      ? Object.entries(variableGroups)
      : [[activeCat, variableGroups[activeCat] || []]];

    let html = '';
    let total = 0;
    for (const [groupName, vars] of groups) {
      const filtered = vars.filter(v =>
        !q || v.name.toLowerCase().includes(q) || v.desc.toLowerCase().includes(q)
      );
      if (!filtered.length) continue;
      total += filtered.length;
      if (activeCat === '__all__') html += `<div class="gc-group-title">${esc(groupName)}</div>`;
      html += filtered.map(v => cardHTML(v)).join('');
    }

    listEl.innerHTML = total ? html : '<div class="gc-empty">Žádné výsledky</div>';

    listEl.querySelectorAll('.gc-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.mc-copy-btn')) return;
        const isOpen = card.classList.contains('gc-card-open');
        listEl.querySelectorAll('.gc-card-open').forEach(c => c.classList.remove('gc-card-open'));
        if (!isOpen) card.classList.add('gc-card-open');
      });
    });

    listEl.querySelectorAll('.mc-copy-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        navigator.clipboard.writeText(btn.dataset.code).then(() => {
          btn.textContent = '✓';
          setTimeout(() => { btn.textContent = '📋'; }, 1200);
        });
      });
    });
  }

  function cardHTML(v) {
    const hasDetail = v.code || v.detail;
    return `
      <div class="gc-card" data-name="${esc(v.name)}">
        <div class="gc-card-header">
          <span class="gc-card-name sv-card-name">${esc(v.name)}</span>
          <span class="gc-card-desc">${esc(v.desc)}</span>
          ${hasDetail ? '<span class="gc-card-arrow">▾</span>' : ''}
        </div>
        ${hasDetail ? `<div class="gc-card-detail">
          ${v.detail ? `<p style="margin:0 0 8px">${esc(v.detail)}</p>` : ''}
          ${v.code ? `<div class="gc-syntax"><span class="gc-syntax-label">Příklad:</span>
            <pre class="gc-ex-code">${esc(v.code)}</pre>
            <button class="mc-copy-btn" data-code="${esc(v.code)}" title="Kopírovat">📋</button>
          </div>` : ''}
        </div>` : ''}
      </div>`;
  }

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
