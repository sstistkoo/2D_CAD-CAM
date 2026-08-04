// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Normalizace ručně psaného G-kódu                    ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Parser G-kódu (`parseGcodeToObjects` ve storage/fileIO.js) čte kanonický
// zápis: velká písmena, desetinná tečka, hotová čísla. Člověk ale píše, jak
// mu to jde pod ruku – `g1 x10+5 z-3,5`. Tenhle modul takový zápis převede
// na kanonický, aby parser nemusel znát každou lidskou variantu (a aby
// uživatel po stisku 🔄 viděl, jak byl jeho zápis pochopen).
//
// Zvládne:
//   • malá písmena           `g1 x10`      → `G01 X10.000`
//   • mezery za adresou      `X 10  Z 20`  → `X10.000 Z20.000`
//   • desetinnou čárku       `X10,5`       → `X10.500`
//   • matematické výrazy     `X10+5`, `Z200/3`, `X(10+5)*2`
//   • přiřazovací zápis      `X=10`, `X:10`
//   • bloky bez mezer        `G1X10Z-5`    → `G01 X10.000 Z-5.000`
//   • čísla bloků, komentáře `;…` i `(…)` zůstanou beze změny
//
// Čistý text→text modul bez DOM, ať jde testovat ve vitest `environment: 'node'`.

import { safeEvalMath } from './utils.js';

// Adresy, které nesou celé číslo (kód, ne rozměr) – u nich by `.000` jen
// mátlo a parser G-slova stejně čte jako celá čísla.
const INTEGER_ADDRESSES = new Set(['G', 'M', 'N', 'T']);

// Pohybová a přípravná G-slova se píšou dvojmístně (G01, ne G1) – stejně je
// vypisuje CNC panel, takže ručně psaný kód pak sedí s vygenerovaným.
function formatInteger(letter, value) {
  const n = Math.round(value);
  if (letter === 'G' || letter === 'M') return `${letter}${String(Math.abs(n)).padStart(2, '0')}`;
  return `${letter}${n}`;
}

/**
 * Převede jednu adresu (písmeno + zapsaná hodnota) na kanonický tvar.
 * Nesrozumitelnou hodnotu vrací tak, jak byla – parser ji přeskočí a
 * uživatel v editoru uvidí, čemu appka neporozuměla.
 * @param {string} letter velké písmeno adresy
 * @param {string} raw hodnota tak, jak ji uživatel napsal
 * @returns {string}
 */
function normalizeAddress(letter, raw) {
  // `X=10` / `X: 10` – přiřazovací zápis z ručních poznámek.
  const value = raw.replace(/^[\s=:]+/, '').trim();
  if (value === '') return letter;

  const plain = value.replace(/,(?=\d)/g, '.');
  const num = /^[+-]?\d+(?:\.\d+)?$/.test(plain) ? parseFloat(plain) : safeEvalMath(plain);
  if (!Number.isFinite(num)) return `${letter}${value}`;

  return INTEGER_ADDRESSES.has(letter) ? formatInteger(letter, num) : `${letter}${num.toFixed(3)}`;
}

/**
 * Oddělí komentáře (`;…` do konce řádku a `(…)`), aby se v nich nic
 * nepřepisovalo – text v závorkách je poznámka, ne adresy.
 *
 * Závorka ale může být i součástí výrazu (`X(10+5)*2`). Rozhoduje obsah:
 * je-li v ní písmeno, je to poznámka; samá čísla a operátory = počítá se.
 * @param {string} line
 * @returns {{code: string, comment: string}}
 */
function splitComment(line) {
  const semicolon = line.indexOf(';');
  let code = semicolon === -1 ? line : line.slice(0, semicolon);
  const trailing = semicolon === -1 ? '' : line.slice(semicolon);

  // Závorkové komentáře můžou být i uprostřed řádku; posbírají se na konec.
  const comments = [];
  code = code.replace(/\([^)]*\)?/g, (group) => {
    if (!/[A-Za-z]/.test(group)) return group;   // závorka ve výrazu
    comments.push(group);
    return ' ';
  });
  if (trailing) comments.push(trailing);
  return { code, comment: comments.join(' ').trim() };
}

/**
 * Normalizuje jeden řádek ručně psaného G-kódu.
 * @param {string} line
 * @returns {string}
 */
export function normalizeGcodeLine(line) {
  const { code, comment } = splitComment(line);
  if (code.trim() === '') return comment || '';

  // Adresu ukončuje až další PÍSMENO – uvnitř hodnoty tak smí být mezery
  // i operátory (`X10 + 5 Z-3` = X:„10 + 5", Z:„-3").
  const tokens = [];
  const re = /([A-Za-z])([^A-Za-z]*)/g;
  let match;
  while ((match = re.exec(code)) !== null) {
    tokens.push(normalizeAddress(match[1].toUpperCase(), match[2]));
  }
  // Žádná adresa, ale něco tam napsané je (třeba `(123)`) – nechat beze
  // změny, ať se uživateli nic neztratí.
  if (tokens.length === 0) return line.trim();

  const normalized = tokens.join(' ');
  return comment ? `${normalized} ${comment}` : normalized;
}

/**
 * Normalizuje celý program. Prázdné řádky zůstávají (dělí bloky).
 * @param {string} text
 * @returns {string}
 */
export function normalizeGcodeText(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map(normalizeGcodeLine)
    .join('\n');
}
