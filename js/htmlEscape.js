// ╔══════════════════════════════════════════════════════════════╗
// ║  htmlEscape – jediná funkce pro bezpečné vložení textu do HTML ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Dřív měl skoro každý dialog vlastní kopii (≈ 25×, dvě varianty: přes
// DOM `textContent` a přes `replace`). Tahle verze pokrývá obě: escapuje
// & < > " (bezpečná pro text i pro hodnotu atributu v uvozovkách) a
// null/undefined vrací jako prázdný řetězec. Modul nic neimportuje, aby ho
// mohl použít kdokoli (i state.js) bez cyklických importů.

const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/**
 * Escapuje text pro vložení do HTML (obsah i atribut v uvozovkách).
 * @param {unknown} s
 * @returns {string}
 */
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, ch => MAP[ch]);
}
