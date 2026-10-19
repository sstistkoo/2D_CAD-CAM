// ▼ „4 řádky" spodního panelu G-kódu (setCodePanelMode v camSimulator.js):
// blok, který právě prošel, běžící blok (zvýrazněný) a dva, které přijdou.
// Řádky bez pohybu (prázdné, komentáře) se přeskakují. Přání uživatele
// 1. 10. 2026 (2 řádky), 19. 10. 2026 rozšířeno na 4.

const ROWS = [
  ['prev', 'Předchozí blok (už prošel)'], ['cur', 'Běžící blok'],
  ['next', 'Následující blok'], ['next', 'Další blok'],
];

/** Řádek s blokem (ne prázdný, ne komentář / % / závorka). */
export const isBlockLine = l => { const t = String(l).trim(); return t !== '' && !/^[;(%]/.test(t); };

/**
 * Indexy řádků pro náhled: { prev, cur, next: [a, b] } (−1 = není).
 * Bez platného `hlIdx` je běžící první blok programu.
 */
export function miniLineIdx(ls, hlIdx) {
  const cur = hlIdx != null && hlIdx >= 0 && hlIdx < ls.length ? hlIdx : ls.findIndex(isBlockLine);
  let prev = -1;
  const next = [];
  if (cur >= 0) {
    for (let i = cur - 1; i >= 0; i--) if (isBlockLine(ls[i])) { prev = i; break; }
    for (let i = cur + 1; i < ls.length && next.length < 2; i++) if (isBlockLine(ls[i])) next.push(i);
  }
  while (next.length < 2) next.push(-1);
  return { prev, cur, next };
}

/** Naplní kontejner `.cam-sim-code-mini` (řádky si vytvoří sám). */
export function renderCodeMini(box, ls, hlIdx) {
  if (box.children.length !== ROWS.length) {
    box.innerHTML = ROWS.map(([k, t]) => `<div class="cam-sim-code-mini-line cam-sim-code-mini-${k}" title="${t}"></div>`).join('');
  }
  const { prev, cur, next } = miniLineIdx(ls, hlIdx);
  // Nezlomitelná mezera drží výšku prázdného řádku.
  [prev, cur, ...next].forEach((i, k) => { box.children[k].textContent = i >= 0 ? ls[i] : '\u00a0'; });
}
