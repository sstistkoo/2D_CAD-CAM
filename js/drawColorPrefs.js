// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Výchozí barvy kontury a polotovaru (Nastavení)        ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 3. 11. 2026: „dát do nastavení možnost si barvu přednastavit pro
// konturu a polotovar, ať to není úplně natvrdo". Barva se ukládá v
// localStorage (předvolba zařízení, ne projektu) a platí pro barvu vrstev
// Kontura (0) a Polotovar u nového výkresu, pro „A" (podle vrstvy) v dialogu
// Typ čáry a pro 🎨 Normalizovat barvy v Úpravách výkresu.
// null = výchozí barva tématu (COLORS.primary / COLORS.stock).

import { COLORS } from './constants.js';
import { state, STOCK_LAYER_ID } from './state.js';

const LS_KEY = 'skica-draw-colors';
const HEX = /^#[0-9a-f]{6}$/i;

/** @type {{contour: string|null, stock: string|null, weight: 'thin'|'thick'}} */
const prefs = { contour: null, stock: null, weight: 'thick' };

try {
  const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
  if (saved && HEX.test(saved.contour)) prefs.contour = saved.contour;
  if (saved && HEX.test(saved.stock)) prefs.stock = saved.stock;
  if (saved && (saved.weight === 'thin' || saved.weight === 'thick')) prefs.weight = saved.weight;
} catch { /* localStorage nedostupné / neplatné – výchozí barvy */ }

/**
 * Tloušťka čar kontury a polotovaru pro 🎨 Normalizovat (Úpravy výkresu):
 * 'thick' = souvislá tlustá (viditelné hrany, ISO 128), 'thin' = tenká.
 */
export function drawLineWeight() { return prefs.weight; }
/** Uloží tloušťku pro normalizaci. */
export function setDrawLineWeight(w) {
  prefs.weight = w === 'thin' ? 'thin' : 'thick';
  try { localStorage.setItem(LS_KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
}

/** Výchozí barva kontury (předvolba, jinak barva tématu). */
export function contourDefaultColor() { return prefs.contour || COLORS.primary; }
/** Výchozí barva polotovaru (předvolba, jinak barva tématu). */
export function stockDefaultColor() { return prefs.stock || COLORS.stock; }
/** Uložené předvolby (barvy: null = výchozí tématu). */
export function getDrawColorPrefs() { return { ...prefs }; }

/** Obarví vrstvy Kontura a Polotovar aktuálního výkresu výchozími barvami. */
export function applyDrawColorsToLayers(layers = state.layers) {
  const c0 = layers.find(l => l.id === 0);
  const cs = layers.find(l => l.id === STOCK_LAYER_ID);
  if (c0) c0.color = contourDefaultColor();
  if (cs) cs.color = stockDefaultColor();
}

/**
 * Uloží předvolbu (null = vrátit výchozí barvu tématu) a přebarví vrstvy
 * Kontura a Polotovar aktuálního výkresu.
 * @param {{contour?: string|null, stock?: string|null}} next
 */
export function setDrawColorPrefs(next) {
  for (const k of ['contour', 'stock']) {
    if (k in next) prefs[k] = next[k] && HEX.test(next[k]) ? next[k] : null;
  }
  try { localStorage.setItem(LS_KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
  applyDrawColorsToLayers();
}

// Výchozí vrstvy při startu (načtený projekt si pak přinese vlastní barvy).
if (prefs.contour || prefs.stock) applyDrawColorsToLayers();
