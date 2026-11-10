// ╔══════════════════════════════════════════════════════════════╗
// ║  Přepočet G-kódu G90 ↔ G91 (tlačítko G90/G91 v editorech)     ║
// ╚══════════════════════════════════════════════════════════════╝
// Společné pro CAM Editor (camEditor.js) a CNC Editor (cncEditor.js). Do
// 10. 11. 2026 měl každý editor vlastní kopii; CNC Editor navíc „zhuštěný
// zápis" (4ec0abb9, 3. 10. 2026): G90/G91 se nepíše znovu, dokud se nemění.
// Ten zůstává jen v CNC Editoru — volba `compact`.
//
// R-parametry: `params` je Map 'R1' → číslo (z parseru editoru). Funkce si ho
// během průchodu doplňují o přiřazení R1=… z kódu, proto dostávají kopii.

import { safeEvalMath } from '../utils.js';

/** Hodnota adresy: číslo nebo výraz s R-parametry (R1*2+5). NaN = nejde. */
export function evalParam(expr, params) {
  const expanded = String(expr).replace(/R(\d+)/gi, (_, id) => {
    const key = `R${parseInt(id, 10)}`;
    return params.has(key) ? params.get(key) : 0;
  });
  if (!/^[0-9.+\-*/() ]+$/.test(expanded)) return NaN;
  return safeEvalMath(expanded);
}

/** Přiřazení R1=… v bloku → params. */
function assignParams(clean, params) {
  const am = clean.match(/R(\d+)\s*=\s*([^=;]+?)(?=\s+[A-Z]|$)/g);
  if (!am) return;
  for (const a of am) {
    const p = a.split('=');
    const v = evalParam(p[1], params);
    if (!isNaN(v)) params.set(`R${parseInt(p[0].replace('R', ''), 10)}`, v);
  }
}

/** Kód bloku bez poznámky za středníkem, velkými písmeny. */
function cleanOf(line) {
  const ci = line.indexOf(';');
  return (ci !== -1 ? line.substring(0, ci) : line).trim().toUpperCase();
}

/**
 * Přírůstkový kód (G91) → absolutní (G90). Podle G90/G91 v textu se sleduje
 * režim, dopočítá absolutní poloha a souřadnice se přepíší; G91 → G90.
 * @param {Map<string, number>} params R-parametry (nemění se, bere se kopie)
 * @param {{compact?: boolean}} opts compact = G90 se nepíše znovu, už-li v kódu stojí
 */
export function codeToAbsolute(code, params = new Map(), { compact = false } = {}) {
  const prm = new Map(params);
  const out = [];
  let x = 0, z = 0, mode = 90;
  let absWritten = false;
  for (const line of code.split('\n')) {
    const clean = cleanOf(line);
    if (!clean) { out.push(line); continue; }
    assignParams(clean, prm);
    if (clean.includes('G90')) { mode = 90; absWritten = true; }
    if (clean.includes('G91')) mode = 91;
    // Referenční / pevné body (G74/G75) nesou jen zástupné X0/Z0 – nejsou to
    // souřadnice interpolace, takže je nepřepočítáváme ani jimi neposouváme polohu.
    if (/\bG7[45]\b/.test(clean)) { out.push(line); continue; }
    let mod = line;
    if (/[XZ]/.test(clean)) {
      mod = mod.replace(/([XZ])\s*(=?)\s*([^\s;]+)/gi, (m, ax, eq, vs) => {
        ax = ax.toUpperCase();
        const v = evalParam(vs, prm); if (isNaN(v)) return m;
        const abs = mode === 91 ? ((ax === 'X' ? x : z) + v) : v;
        if (ax === 'X') x = abs; else z = abs;
        return `${ax}${Number(abs.toFixed(3))}`;
      });
    }
    if (mode === 91) {
      if (!compact) mod = mod.replace(/\bG91\b/gi, 'G90');
      else if (absWritten && /[XZ]/.test(clean)) mod = mod.replace(/\bG91\b\s*/gi, '');
      else { mod = mod.replace(/\bG91\b/gi, 'G90'); absWritten = true; }
    }
    out.push(mod);
  }
  return out.join('\n');
}

/**
 * Absolutní kód (G90) → přírůstkový (G91). Nájezd (první pohyb v dané ose)
 * zůstává absolutní v G90, navazující pohyby jsou přírůstkové v G91 – stejně
 * jako CNC export v CAD.
 * @param {{compact?: boolean}} opts compact = G90/G91 jen při změně
 */
export function codeToIncremental(code, params = new Map(), { compact = false } = {}) {
  const prm = new Map(params);
  const out = [];
  let x = 0, z = 0, curMode = 90, initX = false, initZ = false;
  let emittedG = null;   // naposledy zapsané G90/G91 (jen compact)
  for (const line of code.split('\n')) {
    const clean = cleanOf(line);
    if (!clean) { out.push(line); continue; }
    assignParams(clean, prm);
    if (clean.includes('G90')) curMode = 90;
    if (clean.includes('G91')) curMode = 91;
    if (/\bG7[45]\b/.test(clean)) { out.push(line); continue; }
    const hasX = /X/i.test(clean), hasZ = /Z/i.test(clean);
    if (!hasX && !hasZ) {
      if (compact && /\bG9[01]\b/.test(clean)) emittedG = curMode;
      out.push(line);
      continue;
    }
    const tgt = (hasX && !initX) || (hasZ && !initZ) ? 90 : 91;
    let mod = line.replace(/([XZ])\s*(=?)\s*([^\s;]+)/gi, (m, ax, eq, vs) => {
      ax = ax.toUpperCase();
      const v = evalParam(vs, prm); if (isNaN(v)) return m;
      const abs = curMode === 91 ? ((ax === 'X' ? x : z) + v) : v;
      const val = tgt === 91 ? (abs - (ax === 'X' ? x : z)) : abs;
      if (ax === 'X') { x = abs; if (tgt === 90) initX = true; }
      else { z = abs; if (tgt === 90) initZ = true; }
      return `${ax}${Number(val.toFixed(3))}`;
    });
    mod = mod.replace(/\bG9[01]\b/gi, '').replace(/\s+/g, ' ');
    const newG = tgt === 90 ? 'G90' : 'G91';
    if (compact && tgt === emittedG) mod = mod.trim();
    else if (/^\s*N\d+/i.test(mod)) mod = mod.replace(/^(N\d+)\s*/i, `$1 ${newG} `);
    else mod = `${newG} ` + mod.trim();
    emittedG = tgt;
    out.push(mod);
  }
  return out.join('\n');
}
