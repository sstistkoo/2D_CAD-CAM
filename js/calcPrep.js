// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Úprava výrazu kalkulačky před výpočtem                 ║
// ╚══════════════════════════════════════════════════════════════╝
// Převzato z Bony (js/nastroje.js): doplní chybějící × (2π, 3(2), (1)(2),
// 2sqrt(9)), neuzavřené závorky, procenta jako běžná kalkulačka, vědecký zápis 1e+22, znaky × ÷ −.
// Výpočet pak dělá safeEvalMath (funkce sin/cos/tan ve stupních, ^, pi).

import { safeEvalMath } from './utils.js';

const FN = 'asin|acos|atan|sinr|cosr|tanr|sin|cos|tan|sqrt|abs|log|ln|round|floor|ceil|pi';
const reKrat1 = new RegExp('(\\d|\\)|pi|%)(?=\\(|' + FN + ')', 'gi');   // číslo / ) / pi před ( nebo funkcí
const reKrat2 = /(\)|pi)(?=[\d.])/gi;                                    // ) / pi před číslem

/**
 * Procenta jako na běžné kalkulačce: A + B% = A·(1 + B/100), A − B% = A·(1 − B/100).
 * A je vše před znaménkem až k otevřené závorce. Po × ÷ ^ ( zůstává B% = B/100.
 * @param {string} x
 */
function procenta(x) {
  const re = /([+-])(\d+(?:\.\d*)?|\.\d+)%/g;
  let m;
  while ((m = re.exec(x))) {
    const i = m.index;
    if (i === 0 || !/[\d.)%i]/.test(x[i - 1])) continue;               // unární minus (5×-10%)
    let hl = 0, start = 0;
    for (let j = i - 1; j >= 0; j--) {
      if (x[j] === ')') hl++;
      else if (x[j] === '(') { if (hl === 0) { start = j + 1; break; } hl--; }
    }
    const nove = `(${x.slice(start, i)})*(1${m[1]}${m[2]}/100)`;
    x = x.slice(0, start) + nove + x.slice(i + m[0].length);
    re.lastIndex = start + nove.length;
  }
  return x;
}

/** @param {string} v */
export function prepCalcExpr(v) {
  let x = String(v).replace(/π/g, 'pi').replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/')
    .replace(/,/g, '.').replace(/\s+/g, '');
  x = x.replace(/(\d+(?:\.\d*)?)e([+-]?\d+)/gi, '($1*10^($2))');
  x = x.replace(reKrat1, '$1*').replace(reKrat2, '$1*');
  x = procenta(x);                                                       // 200+10% = 220
  x = x.replace(/(\d+(?:\.\d*)?|\.\d+)%/g, '($1/100)').replace(/%/g, '/100'); // 200÷10% = 2000
  const chybi = (x.match(/\(/g) || []).length - (x.match(/\)/g) || []).length;
  if (chybi > 0) x += ')'.repeat(chybi);
  return x;
}

/**
 * Výsledek výrazu kalkulačky, nebo null.
 * @param {string} v
 * @returns {number|null}
 */
export function evalCalcExpr(v) {
  if (!String(v).trim()) return null;
  const r = safeEvalMath(prepCalcExpr(v));
  return Number.isFinite(r) ? r : null;
}
