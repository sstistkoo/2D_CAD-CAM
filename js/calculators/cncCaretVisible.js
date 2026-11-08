/**
 * Kurzor v editoru G-kódu musí být po psaní z tlačítek VŽDY vidět (uživatel
 * 8. 11. 2026: po novém řádku kurzor zajel dolů pod okraj). Vložení textu
 * přes `.value` posun neřeší a insertText navíc vrací původní scrollTop,
 * proto se po každém vložení / mazání dorovná pohled na kurzor:
 *  – svisle: řádek s kurzorem s rezervou 1 řádku nahoře i dole,
 *  – vodorovně: sloupec kurzoru (písmo je neproporcionální).
 */
let ctx = null;
function charWidth(cs) {
  ctx = ctx || document.createElement('canvas').getContext?.('2d');
  if (!ctx) return parseFloat(cs.fontSize) * 0.6 || 8;
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  return ctx.measureText('M').width || parseFloat(cs.fontSize) * 0.6 || 8;
}

/** Vrací { top, left } – nový scroll pro daný stav (čistá funkce, testovatelná). */
export function scrollForCaret({ line, col, lineH, charW, padTop, padLeft, viewH, viewW, scrollTop, scrollLeft, margin = 1 }) {
  const top = padTop + line * lineH, bottom = top + lineH;
  let st = scrollTop;
  if (viewH > 0) {
    if (bottom + margin * lineH > scrollTop + viewH) st = bottom + margin * lineH - viewH;
    if (top - margin * lineH < st) st = Math.max(0, top - margin * lineH);
  }
  const x = padLeft + col * charW;
  let sl = scrollLeft;
  if (viewW > 0) {
    if (x + 2 * charW > scrollLeft + viewW) sl = x + 2 * charW - viewW;
    if (x - 2 * charW < sl) sl = Math.max(0, x - 2 * charW);
  }
  return { top: Math.max(0, st), left: Math.max(0, sl) };
}

export function ensureCaretVisible(editor) {
  if (!editor || editor.selectionStart == null) return;
  const cs = getComputedStyle(editor);
  const before = editor.value.slice(0, editor.selectionStart);
  const nl = before.lastIndexOf('\n');
  const r = scrollForCaret({
    line: before.split('\n').length - 1, col: before.length - nl - 1,
    lineH: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4 || 18, charW: charWidth(cs),
    padTop: parseFloat(cs.paddingTop) || 0, padLeft: parseFloat(cs.paddingLeft) || 0,
    viewH: editor.clientHeight, viewW: editor.clientWidth,
    scrollTop: editor.scrollTop, scrollLeft: editor.scrollLeft,
  });
  if (r.top !== editor.scrollTop) editor.scrollTop = r.top;
  if (r.left !== editor.scrollLeft) editor.scrollLeft = r.left;
  editor.dispatchEvent(new Event('scroll'));          // podklad se zvýrazněním jde za textem
}
