// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Název projektu, nápověda, motiv                     ║
// ╚══════════════════════════════════════════════════════════════╝

// Vyňato z js/ui.js beze změny (16. 10. 2026, docs/plan-refaktoringu-ui.md,
// Fáze 3). Funkce na úrovni modulu, listenery nápovědy (v ui.js prokládané
// mezi funkcemi) v původním pořadí v initHelpButtons(), kterou ui.js volá
// na původním místě. Kód aplikace importuje jen z js/ui.js, nikdy z js/ui/*.

import { applyThemeColors } from '../constants.js';
import { state, showToast } from '../state.js';
import { renderAll } from '../render.js';
import { getMeta, setMeta } from '../idb.js';
import { closeOnBackdropClick } from '../dialogFactory.js';

// ╔══════════════════════════════════════════════════════════════╗
// ║  Statusbar – název projektu                                  ║
// ╚══════════════════════════════════════════════════════════════╝

/** Aktualizuje název projektu ve stavovém řádku. */
export function updateStatusProject() {
  const el = document.getElementById('statusProject');
  if (el) el.textContent = 'Projekt: ' + (state.projectName || 'Bez názvu');
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  Help overlay                                                ║
// ╚══════════════════════════════════════════════════════════════╝

/** Zobrazí nápovědu (modal). */
export function showHelp() {
  const overlay = document.getElementById('helpOverlay');
  if (overlay) overlay.classList.add('visible');
}

/** Skryje nápovědu. */
export function hideHelp() {
  const overlay = document.getElementById('helpOverlay');
  if (overlay) overlay.classList.remove('visible');
}

/** Přepne viditelnost nápovědy. */
export function toggleHelp() {
  const overlay = document.getElementById('helpOverlay');
  if (!overlay) return;
  if (overlay.classList.contains('visible')) {
    hideHelp();
  } else {
    showHelp();
  }
}

// ── First-run help ──
/** Zkontroluje a zobrazí nápovědu při prvním spuštění. */
export async function checkFirstRunHelp() {
  const shown = await getMeta('helpShown');
  if (!shown) {
    showHelp();
    setMeta('helpShown', '1');
  }
}

// ══════════════════════════════════════════════════════════════
// ║  Nastavení – dialog s konfigurací aplikace                ║
// ══════════════════════════════════════════════════════════════

/** Aplikuje aktuální motiv na CSS i canvas barvy. */
export function applyTheme() {
  const isLight = state.theme === 'light';
  document.body.classList.toggle('light-theme', isLight);
  applyThemeColors(state.theme);
  renderAll();
  showToast(isLight ? 'Světlý motiv' : 'Tmavý motiv');
}

/** Listenery nápovědy ❓ / ✕ / klik mimo (při načtení — volá js/ui.js na původním místě). */
export function initHelpButtons() {
  // Help close button
  document.getElementById('helpCloseBtn')?.addEventListener('click', hideHelp);

  // Help overlay click on background
  const helpOverlay = document.getElementById('helpOverlay');
  if (helpOverlay) closeOnBackdropClick(helpOverlay, () => hideHelp());

  // Help toolbar button
  document.getElementById('btnHelp')?.addEventListener('click', toggleHelp);
}
