// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – VK syntaxe: srovnání zápisu a kontrola překlepů      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Parser VK (`parseVkLine` ve vkContour.js) čte jen kanonický zápis –
// `G11 X40.0 Z-20.0`. Člověk ale píše `g01 x40,5 z -20`, `G1 X.5`,
// `X10+5` nebo `G11 X40 Z?` s překlepem. Dřív takový řádek parser TIŠE
// zahodil (kontura se vykreslila bez něj a nikdo nevěděl proč).
//
// Tenhle modul dělá dvě věci:
//   1. `normalizeVkLine/Text` – převede lidský zápis na kanonický
//      (velká písmena, G01→G1, čárka→tečka, `.5`→`0.5`, výrazy, `X=10`).
//      Už korektní zápis nechá BEZE ZMĚNY (`40.0` zůstane `40.0`).
//   2. Hlásí `issues` – řádky, kterým nelze věřit (neznámý příkaz, adresa
//      I/J/K, číslo s mezerou `X10 -5`, oblouk bez R, záporné R, dvakrát X…).
//      Řádek s chybou se NEPŘEPISUJE, ať se uživateli nic neztratí.
//
// Čistý text→text modul bez DOM, ať jde testovat ve vitest `environment: 'node'`.

import { safeEvalMath } from '../utils.js';

/** Příkazy VK a jejich kanonický tvar (G01 → G1, G011 → G11). */
const COMMANDS = new Map([[0, 'G0'], [1, 'G1'], [2, 'G2'], [3, 'G3'], [11, 'G11'], [111, 'G111']]);
const COMMAND_LIST = 'G0, G1, G2, G3, G11, G111';
const VALUE_WORDS = new Set(['X', 'Z', 'PA', 'PR', 'R']);

/** Nad touhle hodnotou je to skoro jistě překlep (X1000000), ne dílec. */
const MAX_SANE = 100000;

/** @typedef {{level: 'error'|'warn', msg: string, line?: number}} VkIssue */

/**
 * Hodnota adresy → kanonický text, `'?'` (neznámá), nebo `null` (nejde přečíst).
 * @param {string} raw text za písmenem adresy
 * @returns {{text: string, num: number|null}|null}
 */
function parseValue(raw) {
  const value = raw.replace(/^[\s=:]+/, '').trim();
  if (value === '') return null;
  if (value === '?') return { text: '?', num: null };
  if (/\d\s+[+-]?\d/.test(value)) return null;   // `10 -5`, `10 5` – nejednoznačné

  const plain = value.replace(/,(?=\d)/g, '.');
  let num;
  if (/^[+-]?\d+(?:\.\d+)?$/.test(plain)) {
    num = parseFloat(plain);
    return { text: plain.replace(/^\+/, ''), num };
  }
  num = /^[+-]?(?:\d+\.?|\.\d+)$/.test(plain) ? parseFloat(plain) : safeEvalMath(plain);
  if (!Number.isFinite(num)) return null;
  return { text: String(Number(num.toFixed(6))), num };
}

/** Odděl komentáře (`;…` a `(…)` s písmenem) – ve výrazu `X(10+5)*2` je závorka počítání. */
function splitComment(line) {
  const semicolon = line.indexOf(';');
  let code = semicolon === -1 ? line : line.slice(0, semicolon);
  const comments = [];
  code = code.replace(/\([^)]*\)?/g, (group) => {
    if (!/[A-Za-z]/.test(group)) return group;
    comments.push(group);
    return ' ';
  });
  if (semicolon !== -1) comments.push(line.slice(semicolon));
  return { code, comment: comments.join(' ').trim() };
}

/**
 * Srovná jeden řádek VK syntaxe a ohlásí, co je v něm špatně.
 * @param {string} line
 * @returns {{line: string, issues: VkIssue[]}} `line` = kanonický zápis, nebo
 *   původní (jen oříznutý), když řádek obsahuje chybu
 */
export function normalizeVkLine(line) {
  const original = String(line ?? '');
  const trimmed = original.trim();
  if (trimmed === '') return { line: original, issues: [] };

  const { code, comment } = splitComment(trimmed);
  const body = code.replace(/^\s*N\d+\s*/i, '');
  if (body.trim() === '') return { line: trimmed, issues: [] };   // jen komentář

  /** @type {VkIssue[]} */
  const issues = [];
  const err = (msg) => issues.push({ level: 'error', msg });
  const warn = (msg) => issues.push({ level: 'warn', msg });

  if (/^[^A-Za-z]*[^A-Za-z\s]/.test(body)) err(`text před příkazem: „${trimmed}“`);

  let cmd = null;
  const seen = new Map();
  const out = [];
  const re = /(VPOL|PA|PR|[A-Za-z])([^A-Za-z]*)/gi;
  let m;
  while ((m = re.exec(body)) !== null) {
    const word = m[1].toUpperCase();
    const rest = m[2];

    if (word === 'G') {
      const g = parseValue(rest);
      const canon = g && Number.isInteger(g.num) ? COMMANDS.get(g.num) : undefined;
      if (cmd) err('dva příkazy G na jednom řádku');
      else if (!canon) err(`příkaz G${rest.trim()} VK nezná (jen ${COMMAND_LIST})`);
      else cmd = canon;
      continue;
    }
    if (seen.has(word)) { err(`${word} je na řádku dvakrát`); continue; }

    if (word === 'T') {
      if (rest.trim() !== '') err('T je příznak tečnosti, nepíše se s číslem');
      seen.set('T', true); out.push('T');
    } else if (word === 'VPOL') {
      const v = rest.trim();
      if (v !== '1' && v !== '2') err('VPOL musí být VPOL1 nebo VPOL2');
      seen.set('VPOL', true); out.push(`VPOL${v}`);
    } else if (VALUE_WORDS.has(word)) {
      const parsed = parseValue(rest);
      if (!parsed) {
        err(rest.trim() === ''
          ? `${word} nemá hodnotu (číslo, výraz, nebo ? pro dopočet)`
          : `${word}: „${rest.trim()}“ nejde přečíst jako číslo`);
        seen.set(word, null);
        continue;
      }
      seen.set(word, parsed.num);
      out.push(`${word}${parsed.text}`);
    } else if ('IJK'.includes(word)) {
      err(`${word} (střed oblouku) VK nezná – oblouk se zadává poloměrem R`);
    } else if ('FSMDH'.includes(word)) {
      // Technologie z vloženého ISO programu – VK je čistá geometrie, tak se
      // vynechá (s varováním), ať vložený program nepadá na posuvu.
      warn(`${word}${rest.trim()} je technologie, VK ji nepoužívá – vynecháno`);
    } else {
      err(`adresa ${word} VK nezná`);
    }
  }

  if (!cmd) {
    if (!issues.some((i) => i.level === 'error')) err(`chybí příkaz (${COMMAND_LIST})`);
  } else {
    const isArc = cmd === 'G2' || cmd === 'G3';
    const num = (k) => (typeof seen.get(k) === 'number' ? seen.get(k) : null);
    const hasR = seen.has('R');
    const hasMove = ['X', 'Z', 'PA', 'PR'].some((k) => seen.has(k));

    if (!hasMove && !hasR && cmd !== 'G111') err(`${cmd} bez souřadnic – chybí X, Z nebo PA/PR`);
    if (isArc && !hasR) err('oblouk bez poloměru R');
    if (num('R') === 0) err('R nesmí být 0');
    // Záporné R = oblouk větší než půlkruh (jako v ISO) – smysl má jen u oblouku
    // se zadaným X i Z bez tečnosti. Při dopočtu (?) a u T určuje tvar oblouku
    // tečnost a směr G2/G3, znaménko R by nic neříkalo a solvery počítají s
    // kladným R, tak se v zápisu opraví na |R| (a řekne se to).
    if (isArc && num('R') < 0 && (num('X') == null || num('Z') == null || seen.has('T'))) {
      const at = out.findIndex((t) => t.startsWith('R'));
      out[at] = `R${out[at].slice(2)}`;
      warn(`záporné R se tady nepoužije (tvar oblouku určuje ${seen.has('T') ? 'tečnost T' : 'dopočet ?'}) – bere se ${out[at]}`);
    }
    if (!isArc && cmd !== 'G111' && hasR) warn('R se u úsečky ignoruje');
    if (seen.has('PR') && !seen.has('PA')) warn('PR bez PA se ignoruje');
    if (num('PR') === 0) warn('PR = 0 je nulová délka');
    if (num('PA') != null && Math.abs(num('PA')) > 360) warn('úhel PA je mimo ±360°');
    for (const k of ['X', 'Z', 'R', 'PR']) {
      if (num(k) != null && Math.abs(num(k)) > MAX_SANE) warn(`${k}${num(k)} vypadá jako překlep (nad ${MAX_SANE} mm)`);
    }
  }

  if (issues.some((i) => i.level === 'error')) return { line: trimmed, issues };
  const normalized = [cmd, ...out].join(' ');
  return { line: comment ? `${normalized} ${comment}` : normalized, issues };
}

/**
 * Srovná celou VK syntaxi (prázdné řádky a komentáře zůstanou).
 * @param {string} text
 * @returns {{text: string, issues: VkIssue[]}} `issues[].line` je číslo řádku od 1
 */
export function normalizeVkText(text) {
  const issues = [];
  const lines = String(text ?? '').split(/\r?\n/).map((raw, i) => {
    const res = normalizeVkLine(raw);
    for (const issue of res.issues) issues.push({ ...issue, line: i + 1 });
    return res.line;
  });
  return { text: lines.join('\n'), issues };
}

/** Jen chyby (varování nebrání vložení ani konverzi). */
export function vkErrors(issues) {
  return (issues || []).filter((i) => i.level === 'error');
}

/** Chyby (bez varování) jako text do toastu; prázdný řetězec = zápis je v pořádku. */
export function vkErrorSummary(issues, max = 2) {
  return formatVkIssues(vkErrors(issues), max);
}

/** Vypíše hlášky pod pole se zápisem (`box` je element, DOM se tu neimportuje). */
export function renderVkIssues(box, value) {
  if (!box) return;
  const { issues } = normalizeVkText(value);
  box.textContent = formatVkIssues(issues);
  box.classList.toggle('vk-syntax-issues-error', vkErrors(issues).length > 0);
  box.hidden = issues.length === 0;
}

/**
 * Po opuštění pole (`change`) srovná zápis, ať uživatel vidí, jak mu VK
 * porozumělo. Za psaní se nic nepřepisuje – skákal by kurzor.
 * @param {HTMLTextAreaElement} el
 * @param {() => void} onRewrite zavolá se, jen když se text změnil
 */
export function bindVkAutoNormalize(el, onRewrite) {
  el.addEventListener('change', () => {
    const { text, issues } = normalizeVkText(el.value);
    if (text === el.value) return;
    el.value = text;
    // Po přepisu varování zmizí z pole (řádek už je v pořádku), tak aspoň zpráva.
    onRewrite(formatVkIssues(issues.filter((i) => i.level === 'warn')));
  });
}

/**
 * Issues → čitelný text pro stavový řádek / toast.
 * @param {VkIssue[]} issues
 * @param {number} [max] kolik hlášek vypsat, zbytek se spočítá
 */
export function formatVkIssues(issues, max = 3) {
  const sorted = [...(issues || [])].sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
  const shown = sorted.slice(0, max).map((i) => `${i.level === 'error' ? '⛔' : '⚠️'} Řádek ${i.line}: ${i.msg}`);
  if (sorted.length > max) shown.push(`… a ${sorted.length - max} dalších`);
  return shown.join('\n');
}
