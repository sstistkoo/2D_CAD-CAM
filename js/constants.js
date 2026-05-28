// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Centralizované konstanty                           ║
// ╚══════════════════════════════════════════════════════════════╝

// ── Catppuccin Mocha – barvy tématu ─────────────────────────
const DARK_COLORS = {
  primary:       '#89b4fa',
  construction:  '#6c7086',
  dimension:     '#a6e3a1',
  selected:      '#ffffff',
  preview:       '#f5c2e7',
  snapPoint:     '#fab387',
  snapEdge:      '#cba6f7',
  delete:        '#f38ba8',
  axisH:         '#a6e3a1',
  axisV:         '#f38ba8',
  text:          '#cdd6f4',
  textSecondary: '#9399b2',
  label:         '#a6adc8',
  textMuted:     '#6c7086',
  bgDark:        '#1e1e2e',
  bgDarker:      '#11111b',
  surface:       '#313244',
  surfaceHover:  '#45475a',
  border:        '#585b70',
  yellow:        '#f9e2af',
};

// ── Catppuccin Latte – světlé barvy ─────────────────────────
const LIGHT_COLORS = {
  primary:       '#1e66f5',
  construction:  '#9ca0b0',
  dimension:     '#40a02b',
  selected:      '#000000',
  preview:       '#ea76cb',
  snapPoint:     '#fe640b',
  snapEdge:      '#8839ef',
  delete:        '#d20f39',
  axisH:         '#40a02b',
  axisV:         '#d20f39',
  text:          '#4c4f69',
  textSecondary: '#7c7f93',
  label:         '#6c6f85',
  textMuted:     '#9ca0b0',
  bgDark:        '#eff1f5',
  bgDarker:      '#dce0e8',
  surface:       '#ccd0da',
  surfaceHover:  '#bcc0cc',
  border:        '#acb0be',
  yellow:        '#df8e1d',
};

export const COLORS = { ...DARK_COLORS };

/** Přepne barevné konstanty podle tématu ('dark' | 'light'). */
export function applyThemeColors(theme) {
  const src = theme === 'light' ? LIGHT_COLORS : DARK_COLORS;
  Object.assign(COLORS, src);
}

// ── Přichycení (snap) ───────────────────────────────────────
export const SNAP_POINT_THRESHOLD = 20;   // px (děleno zoom) – přichycení k bodu
export const SNAP_EDGE_THRESHOLD  = 12;   // px (děleno zoom) – přichycení k hraně

// ── Zoom ────────────────────────────────────────────────────
export const ZOOM_FACTOR = 1.15;
export const ZOOM_MIN    = 0.05;
export const ZOOM_MAX    = 200;

// ── Mřížka ──────────────────────────────────────────────────
export const GRID_BASE_STEP      = 10;    // počáteční rozteč mřížky
export const GRID_MIN_PX         = 15;    // min px vzdálenost pro zobrazení

// ── Dotek / mobil ───────────────────────────────────────────
export const MOBILE_BREAKPOINT   = 900;   // px šířka pro mobilní rozhraní
export const LONG_PRESS_MS       = 400;   // ms pro aktivaci přesného kříže
export const CROSSHAIR_OFFSET_Y  = -80;   // px posun kříže nad prst
export const TOUCH_MOVE_THRESHOLD = 5;    // px min. pohyb prstu pro detekci tahu
export const PAN_ACTIVATE_THRESHOLD = 10; // px min. pohyb pro aktivaci pannování

// ── Vibrace (haptic) ────────────────────────────────────────
export const VIBRATE_LONG_PRESS  = 30;    // ms
export const VIBRATE_SNAP_POINT  = 15;    // ms
export const VIBRATE_SNAP_EDGE   = 10;    // ms

// ── Renderování ─────────────────────────────────────────────
export const LINE_WIDTH          = 1.5;   // standardní šířka čáry
export const LINE_WIDTH_SELECTED = 2.5;   // šířka čáry při výběru
export const CONSTRUCTION_DASH   = [6, 4];
export const PREVIEW_DASH        = [4, 4];
export const ARROW_LENGTH        = 8;     // px délka šipky kóty
export const ARROW_ANGLE         = Math.PI / 7;

// ── Geometrie / výběr ───────────────────────────────────────
export const SELECT_THRESHOLD     = 15;   // px (děleno zoom) – výběr objektu klikem
export const CONSTRAINT_OFFSET_PX = 22;   // px odsazení vazební značky od segmentu
export const ARC_OUTSIDE_PENALTY  = 100;  // penalizace vzdálenosti mimo oblouk

// ── Ostatní ─────────────────────────────────────────────────
export const PASTE_OFFSET        = 10;    // px posun při vložení
export const AUTO_CENTER_PADDING = 0.15;  // 15 % padding při zoomToFit
