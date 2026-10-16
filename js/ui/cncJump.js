// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Skok v CNC kódu na řádek vybraného objektu          ║
// ╚══════════════════════════════════════════════════════════════╝

// Vyňato z js/ui.js beze změny (16. 10. 2026, docs/plan-refaktoringu-ui.md,
// Fáze 2e); jediná úprava je `export` u scrollCncToObject (volá ho panel
// vlastností). Kód aplikace importuje jen z js/ui.js, nikdy z js/ui/* napřímo.

import { state } from '../state.js';

// ── Skok v CNC kódu na řádek vybraného objektu ──
const _RE_SPECIAL = /[.*+?^${}()|[\]\\]/g;
function _escRe(s) {
  return String(s).replace(_RE_SPECIAL, "\\$&");
}

/** Sestaví regex odpovídající komentáři objektu v CNC kódu (bez ohledu na pořadové číslo). */
function _objCommentRegex(obj) {
  const cleanName = _escRe((obj.name || "").replace(/\s+\d+\s*$/, "") || obj.type);
  const numOpt = "( \\d+)?";
  const stockOpt = "(POLOTOVAR — )?";
  switch (obj.type) {
    case "line": {
      const len = _escRe(Math.hypot(obj.x2 - obj.x1, obj.y2 - obj.y1).toFixed(3));
      return new RegExp(`^; ${stockOpt}${cleanName}${numOpt} \\(délka: ${len}\\)$`, "gm");
    }
    case "circle":
    case "arc": {
      const r = _escRe(obj.r.toFixed(3));
      return new RegExp(`^; ${stockOpt}${cleanName}${numOpt} \\(R: ${r}\\)$`, "gm");
    }
    case "rect": {
      const w = _escRe(Math.abs(obj.x2 - obj.x1).toFixed(2));
      const h = _escRe(Math.abs(obj.y2 - obj.y1).toFixed(2));
      return new RegExp(`^; ${stockOpt}${cleanName}${numOpt} \\(${w} × ${h}\\)$`, "gm");
    }
    case "polyline": {
      const pn = obj.vertices.length;
      const suffix = _escRe(`(${pn} vrcholů${obj.closed ? ", uzavřená" : ""})`);
      return new RegExp(`^; ${stockOpt}${cleanName}${numOpt} ${suffix}$`, "gm");
    }
    case "point":
      return new RegExp(`^; ${stockOpt}${cleanName}${numOpt}$`, "gm");
    default:
      return null;
  }
}

let _lastCncJumpSelection = undefined;

/** Pokud je v textu CNC kódu nalezen komentář k danému objektu, posune zobrazení textarey na příslušný řádek a zvýrazní jej. */
export function scrollCncToObject(obj) {
  if (!obj) return;
  const cncOutput = document.getElementById("cncOutput");
  if (!cncOutput || !cncOutput.value) return;

  // Nepřeskakuj uživateli rozdělaný výběr/kopírování textu v poli CNC kódu.
  if (document.activeElement === cncOutput) return;

  // Skoč jen při změně výběru objektu, ne při každém překreslení.
  if (_lastCncJumpSelection === state.selected) return;
  _lastCncJumpSelection = state.selected;

  const re = _objCommentRegex(obj);
  if (!re) return;

  const text = cncOutput.value;
  const cleanName = (obj.name || "").replace(/\s+\d+\s*$/, "") || obj.type;
  const isStockObj = !!obj.isStock || cleanName.toLowerCase() === "polotovar";
  const stockStartIdx = text.indexOf("; STOCK_START");
  const stockEndIdx = text.indexOf("; STOCK_END");
  const hasStockBlock = stockStartIdx !== -1 && stockEndIdx !== -1;

  let m, fallback = null;
  while ((m = re.exec(text))) {
    const inStock = hasStockBlock && m.index > stockStartIdx && m.index < stockEndIdx;
    if (inStock === isStockObj) break;
    if (!fallback) fallback = m;
  }
  if (!m) m = fallback;
  if (!m) return;

  const lineStart = m.index;
  let lineEnd = text.indexOf("\n", lineStart);
  if (lineEnd === -1) lineEnd = text.length;

  // Na dotykovém zařízení by focus textarey vysunul klávesnici při každém
  // klepnutí na objekt (jen se označuje, nic se nezadává). Řádek se proto
  // zvýrazní s inputmode="none" (bez klávesnice); jakmile uživatel na pole
  // CNC kódu sám klepne, inputmode se vrátí a klávesnice vyjede normálně.
  if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) {
    const prevMode = cncOutput.getAttribute("inputmode");
    cncOutput.setAttribute("inputmode", "none");
    const restore = (e) => {
      cncOutput.removeEventListener("pointerdown", restore);
      cncOutput.removeEventListener("blur", restore);
      if (prevMode === null) cncOutput.removeAttribute("inputmode");
      else cncOutput.setAttribute("inputmode", prevMode);
      // Klepnutí do už fokusovaného pole by klávesnici nevysunulo —
      // blur, a výchozí akce klepnutí pole fokusuje znovu (s klávesnicí).
      if (e && e.type === "pointerdown") cncOutput.blur();
    };
    cncOutput.addEventListener("pointerdown", restore);
    cncOutput.addEventListener("blur", restore);
  }
  cncOutput.focus({ preventScroll: true });
  cncOutput.setSelectionRange(lineStart, lineEnd);

  const lineNumber = text.slice(0, lineStart).split("\n").length - 1;
  const style = getComputedStyle(cncOutput);
  let lineHeight = parseFloat(style.lineHeight);
  if (isNaN(lineHeight)) lineHeight = parseFloat(style.fontSize) * 1.2;
  cncOutput.scrollTop = Math.max(0, (lineNumber - 2) * lineHeight);
}
