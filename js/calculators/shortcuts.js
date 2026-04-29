import { makeOverlay } from '../dialogFactory.js';

// ── Data: Zkratky Sinumerik 840D ────────────────────────────
const shortcutGroups = [
  {
    title: 'Rozšířené klávesové zkratky',
    items: [
      { keys: 'CTRL + Z',           desc: 'Zpět – vrátí poslední změnu' },
      { keys: 'CTRL + Y',           desc: 'Znovu – opakuje vrácenou změnu' },
      { keys: 'CTRL + =',           desc: 'Otevření kalkulačky' },
      { keys: 'CTRL + C',           desc: 'Kopírování označeného textu' },
      { keys: 'CTRL + V',           desc: 'Vložení textu ze schránky' },
      { keys: 'CTRL + X',           desc: 'Vyjmutí označeného textu' },
      { keys: 'CTRL + S',           desc: 'Uložení aktuálního programu' },
      { keys: 'CTRL + F',           desc: 'Otevření dialogu pro vyhledávání' },
      { keys: 'ESC',                desc: 'Zavření aktivního okna/dialogu' },
      { keys: 'F1',                 desc: 'Kontextová nápověda' },
      { keys: 'CTRL + G',           desc: 'Přechod na další G funkci' },
      { keys: 'CTRL + M',           desc: 'Přechod na další M funkci' },
      { keys: 'CTRL + SHIFT + S',   desc: 'Uložit jako…' },
      { keys: 'CTRL + A',           desc: 'Označení celého textu' },
      { keys: 'CTRL + SHIFT + F',   desc: 'Pokročilé vyhledávání v programech' },
      { keys: 'CTRL + ALT + S',     desc: 'Rychlé uložení všech otevřených souborů' },
      { keys: 'CTRL + ALT + M',     desc: 'Monitor vytížení stroje' },
      { keys: 'CTRL + SHIFT + P',   desc: 'Nastavení tiskárny' },
      { keys: 'CTRL + ALT + D',     desc: 'Diagnostické informace' },
      { keys: 'CTRL + SHIFT + T',   desc: 'Seznam nástrojů' },
      { keys: 'CTRL + ALT + P',     desc: 'Parametry stroje' },
      { keys: 'CTRL + ALT + L',     desc: 'Protokol událostí' },
      { keys: 'CTRL + SHIFT + M',   desc: 'Seznam M funkcí' },
      { keys: 'CTRL + ALT + G',     desc: 'Seznam G funkcí' },
      { keys: 'CTRL + SHIFT + D',   desc: 'DRF offset' },
      { keys: 'CTRL + ALT + O',     desc: 'Nastavení offsetů' },
      { keys: 'CTRL + SHIFT + W',   desc: 'Pracovní posunutí' },
      { keys: 'CTRL + ALT + R',     desc: 'R-parametry' },
      { keys: 'CTRL + SHIFT + V',   desc: 'Proměnné programu' },
      { keys: 'CTRL + ALT + H',     desc: 'Historie alarmů' },
      { keys: 'CTRL + SHIFT + L',   desc: 'Limity os' },
      { keys: 'SHIFT + DEL',        desc: 'Vymazání bloku' },
      { keys: 'SHIFT + TAB',        desc: 'Přepnutí mezi okny editoru' },
      { keys: 'ALT + S',            desc: 'Správce programů' },
      { keys: 'ALT + P',            desc: 'Operační plán' },
      { keys: 'ALT + O',            desc: 'Nastavení offsetů' },
      { keys: 'F2',                 desc: 'Přejmenování souboru/programu' },
      { keys: 'CTRL + SHIFT + I',   desc: 'Informace o programu' },
      { keys: 'CTRL + TAB',         desc: 'Přepínání mezi aktivními okny' },
      { keys: 'ALT + M',            desc: 'Manuální režim' },
      { keys: 'ALT + A',            desc: 'Automatický režim' },
      { keys: 'CTRL + ALT + J',     desc: 'JOG režim' },
      { keys: 'SHIFT + SPACE',      desc: 'Rychlý náhled programu' }
    ]
  },
  {
    title: 'Klávesové zkratky displeje',
    items: [
      { keys: 'ALT + M',           desc: 'Manuální režim' },
      { keys: 'ALT + A',           desc: 'Automatický režim' },
      { keys: 'ALT + S',           desc: 'Správce programů' },
      { keys: 'ALT + O',           desc: 'Nastavení offsetů' },
      { keys: 'CTRL + P',          desc: 'Vytvoření kopie obrazovky a uložení jako soubor' },
      { keys: 'CTRL + L',          desc: 'Skok na konkrétní řádek v programu' },
      { keys: 'ALT + C',           desc: 'Kalkulačka' },
      { keys: 'ALT + B',           desc: 'Simulace programu' },
      { keys: 'SHIFT + INSERT',    desc: 'Vložení obsahu schránky' }
    ]
  },
  {
    title: 'Tlačítka na displeji',
    items: [
      { keys: 'SELECT',            desc: 'Výběr položky nebo potvrzení volby' },
      { keys: 'MENU FORWARD',      desc: 'Přepnutí na další menu' },
      { keys: 'MENU BACK',         desc: 'Návrat do předchozího menu' },
      { keys: 'CHANNEL',           desc: 'Přepínání mezi kanály stroje' },
      { keys: 'AREA SWITCH',       desc: 'Přepínání mezi hlavními oblastmi (Machine, Program, Tools…)' },
      { keys: 'ETC',               desc: 'Zobrazení dalších dostupných funkcí' },
      { keys: 'CURSOR',            desc: 'Navigační šipky pro pohyb v menu a editorech' },
      { keys: 'PAGE UP/DOWN',      desc: 'Posun o stránku nahoru/dolů' },
      { keys: 'END',               desc: 'Skok na konec seznamu/programu' },
      { keys: 'HOME',              desc: 'Skok na začátek seznamu/programu' },
      { keys: 'ALARM CANCEL',      desc: 'Potvrzení a zrušení alarmů' },
      { keys: 'PROGRAM CONTROL',   desc: 'Ovládání programu (DRY RUN, SKIP BLOCK…)' },
      { keys: 'MACHINE FUNCTION',  desc: 'Přístup k funkcím stroje (vřeteno, chlazení…)' },
      { keys: 'CUSTOM',            desc: 'Uživatelsky definované funkce' },
      { keys: 'TEACH IN',          desc: 'Režim učení pozic' },
      { keys: 'WCS MCS',           desc: 'Přepínání mezi souřadnými systémy (obrobku/stroje)' },
      { keys: 'DRF',               desc: 'Aktivace/deaktivace ručního posunutí' },
      { keys: 'REPOS',             desc: 'Návrat do přerušeného bodu programu' }
    ]
  },
  {
    title: 'Pohyb v režimech',
    items: [
      { keys: 'MENU SELECT', desc: 'Přepínání mezi hlavními menu' },
      { keys: 'MACHINE',     desc: 'Přepnutí do strojního režimu' },
      { keys: 'PROGRAM',     desc: 'Editor programu' }
    ]
  },
  {
    title: 'Ovládání programu',
    items: [
      { keys: 'CYCLE START', desc: 'Spuštění programu' },
      { keys: 'CYCLE STOP',  desc: 'Zastavení programu' },
      { keys: 'RESET',       desc: 'Reset řídicího systému' }
    ]
  },
  {
    title: 'Editor programu',
    items: [
      { keys: 'INSERT', desc: 'Vložení textu' },
      { keys: 'INPUT',  desc: 'Potvrzení zadání' },
      { keys: 'ALTER',  desc: 'Změna hodnoty' }
    ]
  },
  {
    title: 'Nástrojové funkce',
    items: [
      { keys: 'OFFSET', desc: 'Korekce nástrojů' },
      { keys: 'T,S,M',  desc: 'Nástroj, otáčky, pomocné funkce' },
      { keys: 'WO',     desc: 'Nulové body' }
    ]
  },
  {
    title: 'Simulace',
    items: [
      { keys: 'SIM',         desc: 'Spuštění simulace' },
      { keys: 'ALTER + SIM', desc: 'Nastavení simulace' }
    ]
  },
  {
    title: 'Diagnostika',
    items: [
      { keys: 'ALARM', desc: 'Seznam alarmů' },
      { keys: 'HELP',  desc: 'Nápověda k aktuální funkci' }
    ]
  },
  {
    title: 'Rychlé funkce',
    items: [
      { keys: 'PAGE UP/DOWN', desc: 'Listování stránkami' },
      { keys: 'RECALL',       desc: 'Poslední zadaná hodnota' }
    ]
  },
  {
    title: 'Ruční ovládání',
    items: [
      { keys: 'JOG', desc: 'Ruční režim' },
      { keys: 'INC', desc: 'Krokování' },
      { keys: 'REF', desc: 'Najetí referenčních bodů' }
    ]
  }
];

// ── Helpers ─────────────────────────────────────────────────
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function totalItems() { return shortcutGroups.reduce((n, g) => n + g.items.length, 0); }

// ── Hlavní funkce ───────────────────────────────────────────
export function openShortcutsReference() {
  const chipHTML = shortcutGroups.map(g =>
    `<button class="gc-chip" data-cat="${esc(g.title)}">${esc(g.title)} <span class="mc-chip-count">${g.items.length}</span></button>`
  ).join('');

  const bodyHTML = `
    <div class="gc-search-wrap">
      <input type="search" class="gc-search sk-search" id="skSearch" placeholder="Hledat zkratku…" autocomplete="off">
    </div>
    <div class="gc-chips" id="skChips">
      <button class="gc-chip gc-chip-active" data-cat="__all__">Vše <span class="mc-chip-count">${totalItems()}</span></button>
      ${chipHTML}
    </div>
    <div class="gc-list" id="skList"></div>
  `;

  const overlay = makeOverlay('shortcuts', '⌨️ Zkratky – Sinumerik 840D', bodyHTML, 'gc-window sk-window');
  if (!overlay) return;

  const searchEl = overlay.querySelector('#skSearch');
  const listEl   = overlay.querySelector('#skList');
  const chipsEl  = overlay.querySelector('#skChips');
  let activeCat  = '__all__';

  function render() {
    const q = searchEl.value.trim().toLowerCase();
    const groups = activeCat === '__all__'
      ? shortcutGroups
      : shortcutGroups.filter(g => g.title === activeCat);

    let html = '';
    let total = 0;
    for (const grp of groups) {
      const filtered = grp.items.filter(it =>
        !q || it.keys.toLowerCase().includes(q) || it.desc.toLowerCase().includes(q)
      );
      if (!filtered.length) continue;
      total += filtered.length;
      if (activeCat === '__all__') html += `<div class="gc-group-title">${esc(grp.title)}</div>`;
      html += filtered.map(it => `
        <div class="gc-card sk-card">
          <div class="gc-card-header">
            <span class="gc-card-name sk-card-keys">${esc(it.keys)}</span>
            <span class="gc-card-desc">${esc(it.desc)}</span>
          </div>
        </div>
      `).join('');
    }

    listEl.innerHTML = total ? html : '<div class="gc-empty">Žádné výsledky</div>';
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
