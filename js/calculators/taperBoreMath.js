// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Kužel v díře / na čepu: kontrolní průměry (čistý)   ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Výkres udává JEDEN průměr (s tolerancí) v určité hloubce od jedné strany,
// kuželovitost (1:x nebo úhel) a celkovou délku. Spočítáme průměr v libovolné
// hloubce od kterékoli strany – např. kde měří sonda (Supito).
//
// Souřadnice z: 0 = strana A („spodek"/„začátek"), L = strana B („vrch"/„konec").

import { deviations } from './iso286.js';

/**
 * Změna PRŮMĚRU na 1 mm délky (C).
 * @param {'ratio'|'half'|'full'|'c'} mode  1:x | polovrcholový α° | vrcholový 2α° | přímo C
 * @param {number} value
 * @returns {number} C (≥ 0), NaN při chybě
 */
export function taperC(mode, value) {
  if (!(value > 0)) return mode === 'c' && value === 0 ? 0 : NaN;
  switch (mode) {
    case 'ratio': return 1 / value;
    case 'half': return 2 * Math.tan(value * Math.PI / 180);
    case 'full': return 2 * Math.tan(value / 2 * Math.PI / 180);
    case 'c': return value;
    default: return NaN;
  }
}

/** Všechna vyjádření kuželovitosti z C. */
export function taperForms(C) {
  const half = Math.atan(C / 2) * 180 / Math.PI;
  return { C, ratio: C > 0 ? 1 / C : Infinity, half, full: 2 * half, perSide: C / 2 };
}

/**
 * Tolerance z ISO zápisu („H7", „h7", „js6", „JS7"). Vrací úchylky v mm.
 * @returns {{es:number, ei:number}|{error:string}|null} null = prázdný zápis
 */
export function isoTolerance(code, dim) {
  const s = String(code || '').trim();
  if (!s) return null;
  const m = /^([a-zA-Z]{1,2})\s*(\d{1,2})$/.exec(s);
  if (!m) return { error: 'Zápis tolerance např. H7, h6, js6' };
  const r = deviations(m[1], parseInt(m[2], 10), dim);
  if (r.error) return r;
  return { es: r.upper / 1000, ei: r.lower / 1000 };
}

/**
 * Hlavní výpočet.
 * @param {object} p
 * @param {number} p.D      zadaný (jmenovitý) průměr
 * @param {number} p.es     horní úchylka [mm]
 * @param {number} p.ei     dolní úchylka [mm]
 * @param {number} p.L      celková délka kužele
 * @param {number} p.refDepth  hloubka zadaného průměru od strany refSide
 * @param {'A'|'B'} p.refSide
 * @param {number} p.C      změna průměru na 1 mm
 * @param {'A'|'B'} p.bigSide  strana, kde je kužel VĚTŠÍ
 * @param {{depth:number, side:'A'|'B'|'AB'}[]} p.points
 */
export function computeTaperBore(p) {
  const { D, L, C } = p;
  const es = p.es || 0, ei = p.ei || 0;
  if (!(D > 0)) return { error: 'Zadej průměr' };
  if (!(L > 0)) return { error: 'Zadej celkovou délku kužele' };
  if (!(C >= 0) || !isFinite(C)) return { error: 'Zadej kuželovitost' };
  const refDepth = p.refDepth || 0;
  if (refDepth < 0 || refDepth > L) return { error: 'Hloubka zadaného průměru je mimo délku kužele' };
  if (es < ei) return { error: 'Horní úchylka je menší než dolní' };

  const zRef = p.refSide === 'B' ? L - refDepth : refDepth;
  // Průměr roste směrem k bigSide.
  const dir = p.bigSide === 'A' ? -1 : 1;
  const diaAt = z => D + dir * C * (z - zRef);
  const zOf = (side, depth) => side === 'B' ? L - depth : depth;

  const rows = [];
  for (const pt of p.points || []) {
    if (!(pt.depth >= 0)) continue;
    const sides = pt.side === 'AB' ? ['A', 'B'] : [pt.side === 'B' ? 'B' : 'A'];
    for (const side of sides) {
      const z = zOf(side, pt.depth);
      const nom = diaAt(z);
      rows.push({ side, depth: pt.depth, z, nom, min: nom + ei, max: nom + es, outside: z < 0 || z > L });
    }
  }
  // Rozdíly B − A ve stejné hloubce
  const diffs = [];
  const seen = new Set();
  for (const r of rows) {
    if (r.side !== 'A' || seen.has(r.depth)) continue;
    const b = rows.find(x => x.side === 'B' && x.depth === r.depth);
    if (b) { seen.add(r.depth); diffs.push({ depth: r.depth, diff: b.nom - r.nom, span: L - 2 * r.depth }); }
  }

  return {
    zRef, es, ei, L, C,
    endA: diaAt(0), endB: diaAt(L),
    forms: taperForms(C),
    rows, diffs,
  };
}

/** Formát čísla: 3 desetinná místa (bez −0). */
export function f3(x) {
  const s = (Math.round(x * 1000) / 1000).toFixed(3);
  return s === '-0.000' ? '0.000' : s;
}

/** Úchylky jako „+0.046/−0" (nula: horní „+0", dolní „−0"). */
export function fmtDev(es, ei) {
  const one = (v, zero) => {
    if (Math.abs(v) < 1e-9) return zero;
    return (v > 0 ? '+' : '\u2212') + String(Math.round(Math.abs(v) * 1000) / 1000);
  };
  return one(es, '+0') + '/' + one(ei, '\u22120');
}
