// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Editor G-kódu: automatické doplnění G0 / G1          ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Kdo píše program od nuly, často napíše jen souřadnice (`X0 Z346`). Bez G
// slova by se řádek bral jako modální (po prázdném editoru jako G0 – bez
// čáry). Po stisku Enter se proto řádek dokončí:
//   • první řádek se souřadnicemi bez G  → G0 (najetí na start),
//   • další řádky se souřadnicemi bez G  → G1 (přímka),
//     pokud už není v platnosti G1 (pak řádek zůstane, jak je – je to platný
//     modální zápis a nemění se text, který program už má).
// Řádek, který G pohybu (G0–G3) nebo jiný G kód obsahuje, se nikdy nemění.
//
// Čisté funkce bez DOM kromě `autoCompleteMotionG` (dostane element editoru).

/** G kódy, které pohyb nenahrazují (rovina, jednotky, korekce, nulový bod, režimy). */
const MODAL_ONLY_G = new Set([17, 18, 19, 20, 21, 40, 41, 42, 43, 44, 49, 54, 55, 56, 57, 58, 59, 90, 91, 94, 95, 96, 97, 98, 99]);

// Souřadnicové slovo X/Z/U/W s hodnotou (písmeno nesmí být součástí delšího slova).
const COORD_RE = /(^|[^A-Za-z])([XZUW])\s*=?\s*[-+.\d(]/i;
const ARC_RE = /(^|[^A-Za-z])[RIK]\s*=?\s*[-+.\d(]/i;

/** Kód bez komentářů (`;…` a `(text)`), bez čísla bloku. */
function codeOf(line) {
  return String(line ?? '')
    .replace(/\([^)]*\)?/g, (g) => (/[A-Za-z]/.test(g) ? ' ' : g))
    .replace(/;.*$/, '')
    .replace(/^\s*N\s*\d+\s*/i, '');
}

function gWords(code) {
  const out = [];
  const re = /(?:^|[^A-Za-z])G\s*0*(\d{1,3})(?!\d)/gi;
  let m;
  while ((m = re.exec(code)) !== null) out.push(parseInt(m[1], 10));
  return out;
}

/** Řádek, který rozhodně nejsou „holé souřadnice" (Sinumerik příkazy, parametry, makra). */
function isNonPlainCode(code) {
  if (/#|\$/.test(code)) return true;
  if (/(^|[^A-Za-z])R\d+\s*=/i.test(code)) return true;                    // R1=5
  const first = code.trim().match(/^[A-Za-z]{2,}/);
  return !!first && !/^(CHF|RND|AP|RP)$/i.test(first[0]);                // IF, DEF, MSG, …
}

/**
 * Doplní G0 / G1 do řádku, který má souřadnice, ale žádné G.
 * @param {string} before text PŘED tímto řádkem (včetně posledního zalomení)
 * @param {string} line   řádek, který uživatel právě dopsal
 * @returns {string|null} nový řádek, nebo `null` = nechat být
 */
export function completeMotionLine(before, line) {
  const code = codeOf(line);
  if (!code.trim() || isNonPlainCode(code)) return null;
  const m = COORD_RE.exec(code);
  if (!m || ARC_RE.test(code)) return null;
  const gs = gWords(code);
  if (gs.some((g) => !MODAL_ONLY_G.has(g))) return null;   // G0–G3 i G4, G28, G33, … zůstávají

  // Co už program dělá: byly souřadnice? a který pohyb G0–G3 platí?
  let hadCoords = false;
  let lastMotion = null;
  for (const prev of String(before).split('\n')) {
    // Polotovar (STOCK_START … STOCK_END) je samostatný obrys: jeho první bod je
    // znovu start (G0), ne G1 od konce kontury – jinak by vznikla falešná čára.
    if (/STOCK_START|STOCK_END/i.test(prev)) { hadCoords = false; lastMotion = null; continue; }
    const pc = codeOf(prev);
    if (!pc.trim()) continue;
    if (COORD_RE.test(pc)) hadCoords = true;
    for (const g of gWords(pc)) if (g >= 0 && g <= 3) lastMotion = g;
  }
  if (hadCoords && lastMotion === 1) return null;           // G1 už platí, text se nemění
  const word = hadCoords ? 'G1' : 'G0';

  // Vložit těsně před první souřadnici – v původním řádku (ne v `code`).
  const masked = String(line)
    .replace(/\([^)]*\)?/g, (g) => (/[A-Za-z]/.test(g) ? ' '.repeat(g.length) : g))
    .replace(/;.*$/, (c) => ' '.repeat(c.length));
  const orig = COORD_RE.exec(masked);
  if (!orig) return null;
  const at = orig.index + orig[1].length;
  return `${line.slice(0, at)}${word} ${line.slice(at)}`;
}

/**
 * Po zalomení řádku (Enter nebo tlačítko ↵) dokončí řádek nad kurzorem.
 * @param {HTMLTextAreaElement} editor
 * @param {{inputType?: string}} [ev] událost `input`; bez `insertLineBreak/insertParagraph` se nic neděje
 * @returns {string} aktuální text editoru (po případné úpravě)
 */
export function autoCompleteMotionG(editor, ev) {
  const v = editor.value;
  const type = ev && ev.inputType;
  if (type !== 'insertLineBreak' && type !== 'insertParagraph') return v;
  const caret = editor.selectionStart;
  if (editor.selectionEnd !== caret || v[caret - 1] !== '\n') return v;
  const nl = v.indexOf('\n', caret);
  if (v.slice(caret, nl < 0 ? v.length : nl).trim()) return v;   // Enter uprostřed řádku

  const lineStart = v.lastIndexOf('\n', caret - 2) + 1;
  const line = v.slice(lineStart, caret - 1);
  const fixed = completeMotionLine(v.slice(0, lineStart), line);
  if (fixed === null) return v;

  const { scrollTop, scrollLeft } = editor;
  editor.value = v.slice(0, lineStart) + fixed + v.slice(caret - 1);
  editor.selectionStart = editor.selectionEnd = caret + (fixed.length - line.length);
  editor.scrollTop = scrollTop;
  editor.scrollLeft = scrollLeft;
  return editor.value;
}
