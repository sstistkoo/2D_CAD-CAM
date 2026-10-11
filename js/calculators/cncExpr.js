// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – CNC Editor (kreslení): výrazy a R-parametry v kódu  ║
// ║  X=10+5, Z=R1*2, X[10/4], Z=SIN(30)*10, R1=20 … Čisté       ║
// ║  funkce bez DOM, testy: tests/cncExpr.test.js.               ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Dřív se hodnota adresy četla jen jako číslo: `X10+5` dalo 10 (tiše se zahodilo
// „+5") a `X=R1*2` dalo 0 – náhled i přenos do výkresu pak ukazovaly jiný tvar,
// než jaký stroj vyjede. Teď se výraz vyhodnotí (safeEvalMath: + − * / ^ závorky,
// SIN/COS/TAN/ASIN/ACOS/ATAN ve stupních, SQRT, ABS, LN, LOG, PI, …) a R-parametry
// se dosadí z dřívějších řádků `R1=10`. Nevyhodnotitelný výraz se ohlásí.

import { safeEvalMath } from '../utils.js';

/** Hodnota za písmenem adresy: `=výraz`, `[výraz]`, nebo číslo (případně s operátory). */
const VALUE_SRC = '(?:\\s*=\\s*([^\\s;]+)|\\s*\\[([^\\]]*)\\]|\\s*([-+]?[\\d.(][-+*/().\\d]*))';
const PLAIN_NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)$/;
/** Přiřazení parametru: R1=10, R2=R1*2+3 (R bez „=" je poloměr oblouku). */
const ASSIGN_RE = /(?<![A-Z])R(\d+)\s*=\s*(.*?)(?=\s+R\d+\s*=|$)/g;

/** Kód řádku bez komentáře (; i závorky) a bez čísla bloku, velkými písmeny. */
function codeOf(raw) {
  return raw.replace(/\([^)]*\)/g, ' ').replace(/;.*$/, '').replace(/^\s*N\d+\s*/i, '').trim().toUpperCase();
}

/**
 * Vyhodnotí výraz; R-parametry (R5) dosadí z `params`.
 * @param {string} expr
 * @param {Map<string, number>} params
 * @returns {number} NaN = nevyhodnotitelné (neznámý parametr, chyba syntaxe, dělení nulou…)
 */
export function evalExpr(expr, params) {
  let unknown = false;
  const sub = String(expr).replace(/(?<![A-Z])R(\d+)(?!\d)/gi, (_, n) => {
    const v = params.get('R' + n);
    if (v === undefined) { unknown = true; return '0'; }
    return `(${v})`;
  });
  if (unknown) return NaN;
  return safeEvalMath(sub);
}

/** Zapíše do `params` přiřazení R… = … z řádku (kód bez komentáře). */
export function updateParams(code, params) {
  const c = codeOf(code);
  for (const m of c.matchAll(ASSIGN_RE)) {
    const v = evalExpr(m[2], params);
    if (Number.isFinite(v)) params.set('R' + m[1], v);
  }
}

/** Je řádek přiřazením parametru (R1=…)? Pak R na něm není poloměr. */
export function isParamLine(code) {
  return /^R\d+\s*=/.test(codeOf(code));
}

/**
 * Hodnota adresy `letter` na řádku: číslo, výraz (`=…`, `[…]`, `10+5`) nebo null (není).
 * Chybný výraz se vrátí jako null a text chyby se přidá do `bad`.
 */
export function readAddr(line, letter, params, bad) {
  const m = new RegExp('(?<![A-Z])' + letter + VALUE_SRC, 'i').exec(line);
  if (!m) return null;
  const raw = (m[1] ?? m[2] ?? m[3]).trim();
  if (PLAIN_NUMBER.test(raw)) return parseFloat(raw);
  const v = evalExpr(raw, params);
  if (!Number.isFinite(v)) { bad?.push(`${letter}${m[1] !== undefined ? '=' : ''}${raw}`); return null; }
  return v;
}

const LETTERS = ['CR', 'PU', 'X', 'Z', 'I', 'K', 'R', 'L'];

/**
 * Přepíše výrazy na čísla (X=R1*2 → X20), aby je pochopil i parser výkresu / CAM.
 * Čísla a řádky bez výrazu zůstanou beze změny; nevyhodnotitelný výraz také.
 * @returns {{code: string, converted: number}}
 */
export function resolveExpressions(code) {
  const params = new Map();
  let converted = 0;
  const lines = code.split('\n').map((raw) => {
    const ci = raw.indexOf(';');
    let body = ci >= 0 ? raw.slice(0, ci) : raw;
    const com = ci >= 0 ? raw.slice(ci) : '';
    const c = codeOf(raw);
    const isParam = /^R\d+\s*=/.test(c);
    if (!c) return raw;
    updateParams(raw, params);
    // Jiné příkazy (TRANS, CYCLE…) a řádky s přiřazením se nepřepisují.
    if (isParam || (/^[A-Z_]{2,}/.test(c) && !/^G\d/.test(c) && !/^PU\s*=?\s*[-+\d.]/.test(c))) return raw;
    for (const L of LETTERS) {
      body = body.replace(new RegExp('((?<![A-Za-z])' + L + ')' + VALUE_SRC, 'gi'), (all, lt, a, b, d) => {
        const e = (a ?? b ?? d).trim();
        if (PLAIN_NUMBER.test(e) && a === undefined && b === undefined) return all;
        const v = evalExpr(e, params);
        if (!Number.isFinite(v)) return all;
        converted++;
        return lt + String(Number(v.toFixed(4)));
      });
    }
    return body + com;
  });
  return { code: lines.join('\n'), converted };
}
