/**
 * Kreslicí CNC editor (uživatel 8. 11. 2026):
 *  – po otevření kurzor rovnou na NOVÉM řádku na konci kontury, aby šlo hned
 *    pokračovat v zadávání (před `; STOCK_START` / `; KONTURA_END`, jinak na konci),
 *  – přepínač AUTO v horní liště: po zavření editoru překreslit výkres podle
 *    kódu bez dotazu „Přepsat výkres…?" (výchozí VYP = s dotazem).
 */

const END_RE = /;\s*(KONTURA_END|STOCK_START)\b/i;
const START_RE = /;\s*KONTURA_START\b/i;

/** Index posledního neprázdného řádku kontury a řádku, kde kontura končí. */
export function contourEnd(v) {
  const lines = v.split('\n');
  const start = lines.findIndex(l => START_RE.test(l));
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (END_RE.test(lines[i])) { end = i; break; }
  let last = end - 1;
  while (last > start && last >= 0 && !lines[last].trim()) last--;
  return { lines, lastLine: last, endLine: end };
}

/**
 * Kam dát kurzor po otevření: { pos, newline } – pos = konec posledního řádku
 * kontury (newline: true → vložit „\n"), nebo začátek už prázdného řádku za ním.
 */
export function openCaret(v) {
  const { lines, lastLine, endLine } = contourEnd(v);
  const offset = i => lines.slice(0, i).reduce((n, l) => n + l.length + 1, 0);
  if (lastLine < 0) return { pos: v.length, newline: false };
  if (lastLine + 1 < endLine && !lines[lastLine + 1].trim()) return { pos: offset(lastLine + 1), newline: false };
  return { pos: offset(lastLine) + lines[lastLine].length, newline: !!lines[lastLine].trim() };
}

/** Kód beze změny (bez ohledu na prázdné řádky a \r) → nic nepřekreslovat. */
export const sameCode = (a, b) => {
  const n = s => String(s).replace(/\r/g, '').split('\n').filter(l => l.trim()).join('\n').trim();
  return n(a) === n(b);
};

const KEY = 'cne_autoRedraw';
let auto = null;
export function autoRedrawOn() {
  if (auto === null) { auto = false; try { auto = localStorage.getItem(KEY) === '1'; } catch { /* bez úložiště */ } }
  return auto;
}

export function wireAutoRedraw(root) {
  autoRedrawOn();
  const apply = () => root.querySelectorAll('[data-autodraw]').forEach(b => {
    b.classList.toggle('active', auto);
    b.title = auto ? 'AUTO ZAP – po zavření se výkres překreslí podle kódu bez dotazu (klik vypne)'
      : 'AUTO VYP – po zavření se zeptá „Přepsat výkres podle kódu?" (klik zapne překreslení bez dotazu)';
  });
  apply();
  root.addEventListener('mousedown', e => { if (e.target.closest('[data-autodraw]')) e.preventDefault(); });
  root.addEventListener('click', e => {
    if (!e.target.closest('[data-autodraw]')) return;
    auto = !auto;
    try { localStorage.setItem(KEY, auto ? '1' : '0'); } catch { /* bez úložiště */ }
    apply();
  });
}
