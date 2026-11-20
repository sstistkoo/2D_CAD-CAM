// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Úprava výrazu kalkulačky před výpočtem                 ║
// ╚══════════════════════════════════════════════════════════════╝
// Převzato z Bony (js/nastroje.js): doplní chybějící × (2π, 3(2), (1)(2),
// 2sqrt(9)), neuzavřené závorky, % = /100, vědecký zápis 1e+22, znaky × ÷ −.
// Výpočet pak dělá safeEvalMath (funkce sin/cos/tan ve stupních, ^, pi).

import { safeEvalMath } from './utils.js';

const FN = 'asin|acos|atan|sinr|cosr|tanr|sin|cos|tan|sqrt|abs|log|ln|round|floor|ceil|pi';
const reKrat1 = new RegExp('(\\d|\\)|pi|%)(?=\\(|' + FN + ')', 'gi');   // číslo / ) / pi před ( nebo funkcí
const reKrat2 = /(\)|pi)(?=[\d.])/gi;                                    // ) / pi před číslem

/** @param {string} v */
export function prepCalcExpr(v) {
  let x = String(v).replace(/π/g, 'pi').replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/')
    .replace(/,/g, '.').replace(/\s+/g, '');
  x = x.replace(/(\d+(?:\.\d*)?)e([+-]?\d+)/gi, '($1*10^($2))');
  x = x.replace(reKrat1, '$1*').replace(reKrat2, '$1*');
  x = x.replace(/%/g, '/100');
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
