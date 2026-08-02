// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Typy čar (ČSN EN ISO 128) pro nástroj „Typ čáry"    ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Nástroj v liště (dřív jen „Konstr.") otevře dialog s výběrem typu čáry
// a barvy; zvolený typ se pak kreslí opakovaně, dokud se nástroj nevypne.
// Popisek tlačítka se mění na `short` (max 6 znaků, aby se na mobilu
// nezalomila lišta nástrojů).

import { CONSTRUCTION_DASH } from './constants.js';
import { state } from './state.js';

/**
 * Katalog typů čar dle ČSN EN ISO 128.
 * - `dash`     – vzor čárkování v px obrazovky (prázdné pole = souvislá)
 * - `width`    – násobek LINE_WIDTH (1 = tenká, 2 = tlustá)
 * - `aux`      – výchozí „pomocná čára": objekt se založí jako `constr`,
 *                takže do kontury ani do CAM/G-kódu nevstupuje
 * - `infinite` – čára bez konců (původní konstrukční čára)
 * - `short`    – popisek na tlačítku, max 6 znaků
 * @typedef {{key:string,label:string,short:string,dash:number[],width:number,
 *            aux:boolean,infinite?:boolean,use:string}} LineStyleDef
 */

/** @type {LineStyleDef[]} */
export const LINE_STYLES = [
  {
    key: 'solidThick',
    label: 'Souvislá tlustá',
    short: 'Tl',
    dash: [],
    width: 2,
    aux: false,
    use: 'Viditelné hrany a obrysy',
  },
  {
    key: 'solidThin',
    label: 'Souvislá tenká',
    short: 'Te',
    dash: [],
    width: 1,
    aux: true,
    use: 'Kótovací a odkazovací čáry, šrafy',
  },
  {
    key: 'dashed',
    label: 'Čárkovaná',
    short: 'Čá',
    dash: [8, 4],
    width: 1,
    aux: true,
    use: 'Zakryté hrany a obrysy',
  },
  {
    key: 'dashDot',
    label: 'Čerchovaná tenká',
    short: 'Če',
    dash: [14, 4, 2, 4],
    width: 1,
    aux: true,
    use: 'Osy souměrnosti, středy kružnic',
  },
  {
    key: 'dashDotDot',
    label: 'Dvoječerchovaná',
    short: '2č',
    dash: [14, 4, 2, 4, 2, 4],
    width: 1,
    aux: true,
    use: 'Sousední díly, krajní polohy',
  },
  {
    key: 'constr',
    label: 'Konstrukční',
    short: 'Ko',
    dash: [...CONSTRUCTION_DASH],
    width: 1,
    aux: true,
    infinite: true,
    use: 'Nekonečná pomocná čára (2 body)',
  },
];

/** Výchozí typ = původní chování tlačítka (konstrukční čára). */
export const DEFAULT_LINE_STYLE = 'constr';

/**
 * @param {string} [key]
 * @returns {LineStyleDef}
 */
export function getLineStyle(key) {
  return LINE_STYLES.find(s => s.key === key)
    || LINE_STYLES.find(s => s.key === DEFAULT_LINE_STYLE);
}

/** Aktuálně zvolený typ čáry (definice z katalogu). */
export function activeLineStyle() {
  return getLineStyle(state.lineStyle.key);
}

// ── Vykreslování ────────────────────────────────────────────

/**
 * Vzor čárkování objektu pro canvas (px obrazovky).
 * Starší objekty bez `lineStyle` si drží původní chování (`dashed`/`constr`).
 * @param {{type?:string,lineStyle?:string,dashed?:boolean}} obj
 * @returns {number[]}
 */
export function objDash(obj) {
  if (obj.lineStyle) return getLineStyle(obj.lineStyle).dash;
  if (obj.type === 'constr' || obj.dashed) return CONSTRUCTION_DASH;
  return [];
}

/**
 * Násobek tloušťky čáry podle typu čáry (1 = tenká, 2 = tlustá).
 * @param {{lineStyle?:string}} obj
 * @returns {number}
 */
export function objWidthMul(obj) {
  return obj.lineStyle ? getLineStyle(obj.lineStyle).width : 1;
}

// ── Vlastnosti nově kreslené čáry ───────────────────────────

/**
 * Vlastnosti objektu pro nově nakreslenou čáru podle aktivní volby.
 * Pomocná čára (`aux`) vzniká jako typ `constr` – nevstupuje do kontury
 * ani do CAM; s `finite: true`, pokud typ není nekonečný.
 * @returns {Record<string, any>}
 */
export function activeLineProps() {
  const st = activeLineStyle();
  const aux = state.lineStyle.aux;
  /** @type {Record<string, any>} */
  const props = {
    type: aux ? 'constr' : 'line',
    lineStyle: st.key,
    dashed: st.dash.length > 0,
  };
  if (aux && !st.infinite) props.finite = true;
  if (state.lineStyle.color) props.color = state.lineStyle.color;
  return props;
}

// ── Perzistence volby (localStorage) ────────────────────────

const LS_KEY = 'skica-line-style';

/** Načte poslední volbu typu čáry z localStorage do `state.lineStyle`. */
export function loadLineStylePref() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    const st = getLineStyle(saved.key);
    state.lineStyle.key = st.key;
    state.lineStyle.color = typeof saved.color === 'string' ? saved.color : null;
    state.lineStyle.aux = typeof saved.aux === 'boolean' ? saved.aux : st.aux;
  } catch { /* neplatná/nedostupná předvolba – zůstane výchozí */ }
}

/** Uloží aktuální volbu typu čáry do localStorage. */
export function saveLineStylePref() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state.lineStyle));
  } catch { /* localStorage nedostupné (private mode) */ }
}

// ── Tlačítko v liště nástrojů ───────────────────────────────

/**
 * Promítne aktuální volbu do tlačítka nástroje: popisek (`short`),
 * náhled vzoru v ikoně a barvu ikony.
 */
export function refreshLineStyleBtn() {
  const btn = document.getElementById('btnLineStyle');
  if (!btn) return;
  const st = activeLineStyle();

  const label = btn.querySelector('.tool-btn-label');
  if (label) {
    const stockSuffix = state.drawStockMode ? ' Pol' : ' Kon';
    label.textContent = st.short + stockSuffix;
  }

  const icon = btn.querySelector('svg');
  const seg = btn.querySelector('.line-style-icon-seg');
  if (seg) {
    seg.setAttribute('stroke-dasharray', st.dash.length ? st.dash.map(d => d / 2).join(' ') : 'none');
    seg.setAttribute('stroke-width', String(st.width >= 2 ? 3 : 1.5));
  }
  if (icon) icon.style.color = state.lineStyle.color || '';

  btn.title = `${st.label} – ${st.use}`
    + (state.lineStyle.aux ? ' · pomocná čára (mimo konturu a CAM)' : ' · součást kontury')
    + (state.drawStockMode ? ' · kreslení polotovaru' : ' · kreslení kontury')
    + '\nKlik otevře výběr typu čáry a barvy.';
}
