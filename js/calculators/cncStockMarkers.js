/**
 * Značky kontury a polotovaru v kreslicím editoru G-kódu (přepínač ✎K / ✎P).
 * Čisté funkce nad textem – bez DOM.
 *
 * Parsery (storage/gcodeParse.js, cam/gcodeParser.js, cncDrawTools.js) znají jen
 * `STOCK_START` a `STOCK_END`; text za nimi je jen popisek pro člověka.
 * Uživatel 13. 11. 2026: přepínání psalo značky pod sebe a v kódu zůstávaly dvě
 * `STOCK_END` za sebou → značky se teď párují:
 *  – klik uprostřed kódu vloží DVOJICI (konec + znovu začátek), takže kód pod
 *    kurzorem dál patří tam, kam patřil, a nová část je mezi nimi,
 *  – klik hned za značkou, za kterou nic nepřibylo, ji zruší (zpět),
 *  – osiřelé / zdvojené značky a prázdné dvojice se při každém kliku uklidí.
 */

export const STOCK_START_LINE = '; STOCK_START — kontura konec, polotovar začátek';
export const STOCK_END_LINE = '; STOCK_END — polotovar konec, dál kontura';

const S_RE = /^\s*;\s*STOCK_START\b/i;
const E_RE = /^\s*;\s*STOCK_END\b/i;
const MARKER_LINE = /^\s*;\s*STOCK_(START|END)\b/i;
const hasCode = (line) => line.split(';')[0].trim() !== '';

/** Je pozice `pos` v bloku polotovaru (za neuzavřeným STOCK_START)? */
export function caretInStock(v, pos) {
  const before = v.slice(0, pos ?? 0);
  return before.lastIndexOf('STOCK_START') > before.lastIndexOf('STOCK_END');
}

/**
 * Klik hned za značkou, za kterou do kurzoru nic nepřibylo → značku zrušit.
 * @param {string} v
 * @param {number} pos
 * @returns {{value: string, caret: number}|null}  null = před kurzorem žádná taková značka
 */
export function bareMarkerRemoval(v, pos) {
  const before = v.slice(0, pos).replace(/\s+$/, '');
  const ms = before.lastIndexOf('\n') + 1;
  if (!MARKER_LINE.test(before.slice(ms))) return null;
  let me = v.indexOf('\n', ms); if (me < 0) me = v.length;
  // Smaže se řádek i s jedním zalomením (za ním, u posledního řádku před ním);
  // prázdný řádek s kurzorem hned pod značkou (vznikl s ní) jde pryč taky.
  const blank = pos === me + 1 && v[me + 1] === '\n';
  const [a, b] = me < v.length ? [ms, me + (blank ? 2 : 1)] : [Math.max(0, ms - 1), me];
  return { value: v.slice(0, a) + v.slice(b), caret: pos >= b ? pos - (b - a) : a };
}

/**
 * Uklidí značky: STOCK_END mimo polotovar a STOCK_START uvnitř polotovaru pryč
 * (osiřelé / zdvojené) a dvojice značek bez kódu mezi nimi pryč – kromě té,
 * mezi kterou stojí kurzor (právě vložená, ještě prázdná).
 * @param {string} v
 * @param {number} pos
 * @returns {{value: string, caret: number}}
 */
export function normalizeStockMarkers(v, pos) {
  const lines = v.split('\n');
  const keep = lines.map(() => true);
  let caretLine = 0;
  for (let i = 0, off = 0; i < lines.length; off += lines[i].length + 1, i++) {
    if (pos >= off) caretLine = i;
  }
  let inStock = false, last = -1, code = false;
  lines.forEach((line, i) => {
    const isS = S_RE.test(line), isE = !isS && E_RE.test(line);
    if (!isS && !isE) { if (hasCode(line)) code = true; return; }
    if (isS === inStock) { keep[i] = false; return; }                 // zdvojená / osiřelá
    if (last >= 0 && !code && !(last < caretLine && caretLine < i)) { // prázdná dvojice
      keep[last] = keep[i] = false; inStock = !inStock; last = -1; code = true;
      return;
    }
    inStock = isS; last = i; code = false;
  });
  if (keep.every(Boolean)) return { value: v, caret: pos };
  let caret = pos, off = 0;
  lines.forEach((line, i) => {
    const len = line.length + 1;
    if (!keep[i] && off < pos) caret -= Math.min(len, pos - off);
    off += len;
  });
  const value = lines.filter((_, i) => keep[i]).join('\n');
  return { value, caret: Math.max(0, Math.min(caret, value.length)) };
}

/**
 * Klik na ✎K / ✎P: nový text a kurzor.
 * @param {string} v
 * @param {number} pos
 * @returns {{value: string, caret: number, label: string}}
 */
export function toggleStock(v, pos) {
  const bare = bareMarkerRemoval(v, pos);
  if (bare) return { ...normalizeStockMarkers(bare.value, bare.caret), label: 'zrušena' };
  const inStock = caretInStock(v, pos);
  const mark = inStock ? STOCK_END_LINE : STOCK_START_LINE;
  const back = inStock ? STOCK_START_LINE : STOCK_END_LINE;
  // Je pod kurzorem (do další značky) kód? Pak ho vrátit tam, kam patřil.
  let codeAfter = false;
  for (const line of v.slice(pos).split('\n')) {
    if (MARKER_LINE.test(line)) break;
    if (hasCode(line)) { codeAfter = true; break; }
  }
  const pre = v.slice(0, pos), post = v.slice(pos);
  const lead = pre && !pre.endsWith('\n') ? '\n' : '';
  const head = lead + mark + '\n';
  const tail = codeAfter ? '\n' + back + (post.startsWith('\n') ? '' : '\n') : '';
  const r = normalizeStockMarkers(pre + head + tail + post, pre.length + head.length);
  return { ...r, label: inStock ? 'polotovar konec' : 'polotovar začátek' };
}
