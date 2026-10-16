// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Nastavení aplikace (uložení / obnovení při startu)  ║
// ╚══════════════════════════════════════════════════════════════╝
// Nastavení (snapy, mřížka, krok a tolerance úhlu, motiv, osy, typ stroje…)
// se ukládá ZVLÁŠŤ od rozkresleného výkresu (IDB 'currentProjectData'), do
// localStorage pod klíčem 'skica-settings'. Dřív bylo jen ve výkresu a při
// startu se obnovilo jen s neprázdným výkresem; po „Smazat vše" nebo na
// čisté stránce se tak ztratilo. Teď se obnoví vždy.
//
// Proč localStorage a ne IndexedDB: zápis je synchronní, takže doběhne
// i při zavření / obnovení stránky (pagehide). Zápis do IDB tam prohlížeč
// nestihne a přepnutí klávesou těsně před obnovením by se ztratilo.
//
// Uložení: persistSettings() v ui.js (po změně v dialogu / indikátoru),
// saveProject() (autosave po každé úpravě, Ctrl+S) a při skrytí / zavření
// stránky (initSettingsAutoSave) — to pokryje i přepínače z klávesnice.
// Projekt (soubor / správce projektů) nese svoje nastavení dál; po jeho
// otevření se uloží jako aktuální nastavení s prvním uložením.

import { state } from '../state.js';

export const SETTINGS_KEY = 'skica-settings';

const isBool = (v) => typeof v === 'boolean';
const inRange = (lo, hi) => (v) => typeof v === 'number' && Number.isFinite(v) && v > lo && v <= hi;
const oneOf = (...vals) => (v) => vals.includes(v);

/** Klíč stavu → kontrola hodnoty (neplatná / chybějící se přeskočí). */
const SCHEMA = {
  gridSize: inRange(0, 1e6),
  snapToPoints: isBool,
  snapToGrid: isBool,
  angleSnap: isBool,
  angleSnapStep: inRange(0, 180),
  angleSnapTolerance: inRange(0, 45),
  snapQuadrants: isBool,
  snapMidpoints: isBool,
  snapCenters: isBool,
  // ABS/INC a nulový bod patří k sobě (INC se měří od incReference, otočený
  // o nullPointAngle) — obnovují se spolu, jinak by po startu bylo INC
  // vůči skrytému, neotočenému bodu.
  coordMode: oneOf('abs', 'inc'),
  incReference: (v) => !!v && typeof v === 'object' && Number.isFinite(v.x) && Number.isFinite(v.y),
  nullPointActive: isBool,
  nullPointAngle: (v) => typeof v === 'number' && Number.isFinite(v),
  machineType: oneOf('soustruh', 'karusel'),
  xDisplayMode: oneOf('radius', 'diameter'),
  flipX: isBool,
  flipZ: isBool,
  mirrorPreview: isBool,
  showContourGaps: isBool,
  displayDecimals: (v) => Number.isInteger(v) && v >= 0 && v <= 6,
  theme: oneOf('dark', 'light'),
  showDimensions: oneOf('all', 'intersections', 'dimensions', 'none'),
  showObjectNumbers: isBool,
  showIntersectionNumbers: isBool,
};

export const SETTINGS_KEYS = Object.keys(SCHEMA);

/** Aktuální nastavení ze `state`. */
export function collectSettings() {
  const out = {};
  for (const k of SETTINGS_KEYS) out[k] = state[k];
  return out;
}

/**
 * Přenese platné hodnoty do `state`; neplatné nebo chybějící nechá být.
 * @param {Record<string, any>|null|undefined} data
 */
export function applySettings(data) {
  if (!data || typeof data !== 'object') return;
  for (const k of SETTINGS_KEYS) {
    if (SCHEMA[k](data[k])) state[k] = data[k];
  }
}

/** Uloží aktuální nastavení (hned, synchronně). */
export function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(collectSettings()));
  } catch (e) { console.warn('Uložení nastavení selhalo:', e); }
}

/** Uložené nastavení, nebo null (nic / poškozené / nedostupné úložiště). */
export function loadSavedSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const data = raw ? JSON.parse(raw) : null;
    return data && typeof data === 'object' ? data : null;
  } catch { return null; }
}

/**
 * Obnoví nastavení při startu — i k prázdnému výkresu. Uložené nastavení
 * má přednost; co v něm chybí (starší verze aplikace ho neměla vůbec),
 * vezme se z uloženého výkresu `fallback`.
 * @param {Record<string, any>|null|undefined} [fallback] currentProjectData
 */
export function restoreSettings(fallback) {
  applySettings({ ...(fallback || {}), ...(loadSavedSettings() || {}) });
}

let _autoSaveWired = false;
/** Uloží nastavení při skrytí stránky (mobil, přepnutí aplikace) a zavření. */
export function initSettingsAutoSave() {
  if (_autoSaveWired) return;
  _autoSaveWired = true;
  const save = () => saveSettings();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
  window.addEventListener('pagehide', save);
}
