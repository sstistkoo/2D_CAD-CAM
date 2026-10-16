// SKICA – render: Cíl kreslení (plátno / export) sdílený textem a kótami
// (vyčleněno z js/render.js 16. 10. 2026; veřejné API exportuje dál js/render.js)

import { ctx, screenAngle, screenCCW, worldToScreen } from '../canvas.js';
import { COLORS } from '../constants.js';
import { state } from '../state.js';

// ── Cíl kreslení (plátno / export) ──
// Výchozí je plátno aplikace. Export PNG si cíl přes drawTextOn() /
// drawDimensionOn() dočasně přepne na vlastní canvas a transformaci – text i
// kóty se tak kreslí JEDNÍM kódem (šipky, popisky, text po cestě…), ne další
// kopií v exportImage.js. Přepínají se jen funkce textu a kót.
// `ctx` (const z canvas.js) je při vyhodnocení tohoto modulu kvůli cyklu
// importů ještě v TDZ – proto getter, ne přímá hodnota.
const _MAIN_VIEW = {
  get ctx() { return ctx; },
  w2s: (x, y) => worldToScreen(x, y), angle: (a) => screenAngle(a), ccw: (a) => screenCCW(a),
  zoom: () => state.zoom, markers: true, color: null, ink: null,
};
export let _tv = _MAIN_VIEW;
// Kolekce umístěných popisků kót pro detekci kolizí
export let _dimLabelRects = [];
/** Vynuluje kolizní obdélníky popisků kót (začátek snímku). */
export function resetDimLabelRects() { _dimLabelRects = []; }

/** Barva popisku – export na světlé pozadí si vnutí tmavé (`ink`). */
export function _ink(key) {
  return (_tv.ink && _tv.ink[key]) || COLORS[key];
}

export function _textFill(obj, isSel) {
  if (_tv.color) return _tv.color(obj);
  return isSel ? COLORS.selected : (obj.color || COLORS.text);
}

/**
 * Spustí `fn` s cílem kreslení přepnutým na cizí 2D kontext (export). Osa Y
 * v `view.w2s` musí být převrácená stejně jako na plátně (svět Y nahoru →
 * obraz Y dolů); export kreslí bez zrcadlení os plátna.
 * @param {CanvasRenderingContext2D} g
 * @param {{w2s: (x:number,y:number)=>[number,number], zoom: number,
 *   color?: (o:object)=>string, ink?: {text:string,textSecondary:string},
 *   labelRects?: object[]}} view – `labelRects` sdílej přes celý export,
 *   aby se popisky kót vyhýbaly i sobě navzájem
 */
export function _withView(g, view, fn) {
  const prev = _tv, prevRects = _dimLabelRects;
  _tv = {
    ctx: g, w2s: view.w2s, angle: (a) => -a, ccw: (a) => a, zoom: () => view.zoom,
    markers: false, color: view.color || null, ink: view.ink || null,
  };
  _dimLabelRects = view.labelRects || [];
  try { fn(); }
  finally { _tv = prev; _dimLabelRects = prevRects; }
}
