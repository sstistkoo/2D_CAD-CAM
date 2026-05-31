// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Načítání TTF fontu pro vektorový text v DXF      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Asynchronně načte Roboto-Regular.ttf přes opentype.js a vrátí font
// objekt použitelný v `new makerjs.models.Text(font, …)`.
// Výsledek je cachovaný – druhé volání vrátí stejnou promise.

const DEFAULT_FONT_URL = './lib/fonts/Roboto-Regular.ttf';
let _fontPromise = null;
let _font = null;

/**
 * Vrátí načtený font (synchronně), pokud byl už načtený přes preloadFont().
 * Jinak null. Použij pro export, který už čekal na font.
 */
export function getLoadedFont() {
  return _font;
}

/**
 * Načte font (s cachí). Druhé volání vrátí cachovanou promise.
 * Vrací null, pokud opentype.js nebo font soubor není dostupný.
 * @param {string} [url]
 * @returns {Promise<object|null>}
 */
export function loadFont(url) {
  if (_fontPromise) return _fontPromise;
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!window.opentype) {
    console.warn('opentype.js není načtený – vektorový text v DXF nebude k dispozici');
    return Promise.resolve(null);
  }
  const target = url || DEFAULT_FONT_URL;
  _fontPromise = new Promise((resolve) => {
    window.opentype.load(target, (err, font) => {
      if (err || !font) {
        console.warn('Načtení fontu selhalo (' + target + '):', err && err.message);
        resolve(null);
      } else {
        _font = font;
        // Globální handle pro dxf.js / objToMakerModel (vyhne se importu)
        if (typeof window !== 'undefined') window.__skicaFont = font;
        resolve(font);
      }
    });
  });
  return _fontPromise;
}

/**
 * Vrátí, zda je vektorový text k dispozici (opentype + font načteny).
 */
export function isVectorTextAvailable() {
  return !!(_font && typeof window !== 'undefined' && window.opentype);
}
