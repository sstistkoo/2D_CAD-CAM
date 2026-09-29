// ── Řešič pravoúhlého trojúhelníku (γ = 90°) ──
// a = protilehlá k α, b = přilehlá k α, c = přepona, α + β = 90°.
// Čistá funkce bez DOM – testovatelná (tests/trig-solver.test.js).

const DEG = Math.PI / 180;
const REL_TOL = 1e-3;   // relativní shoda stran (0,1 %)
const ANG_TOL = 0.01;   // shoda úhlů ve stupních

/**
 * @param {{a?:number|null,b?:number|null,c?:number|null,alpha?:number|null,beta?:number|null}} known
 *   známé hodnoty (null/undefined = neznámá)
 * @returns {{ok:true,a:number,b:number,c:number,alpha:number,beta:number}|{ok:false,error:string}}
 */
export function solveRightTriangle(known) {
  const k = {};
  for (const key of ["a", "b", "c", "alpha", "beta"]) {
    const v = known[key];
    k[key] = (v === null || v === undefined || v === "") ? null : Number(v);
    if (k[key] !== null && !(isFinite(k[key]) && k[key] > 0)) {
      return { ok: false, error: `Neplatná hodnota ${label(key)} (musí být kladné číslo)` };
    }
  }
  for (const key of ["alpha", "beta"]) {
    if (k[key] !== null && k[key] >= 90) return { ok: false, error: `Úhel ${label(key)} musí být menší než 90°` };
  }
  const sides = ["a", "b", "c"].filter(s => k[s] !== null);
  const angle = k.alpha !== null ? k.alpha : (k.beta !== null ? 90 - k.beta : null);
  const count = sides.length + (k.alpha !== null ? 1 : 0) + (k.beta !== null ? 1 : 0);
  if (count < 2) return { ok: false, error: "Zadejte 2 hodnoty" };
  if (sides.length === 0) return { ok: false, error: "Ze dvou úhlů nejde určit velikost – zadejte aspoň jednu stranu" };

  let a, b, c;
  if (k.c !== null && k.a !== null && k.c <= k.a) return { ok: false, error: "Přepona c musí být delší než a" };
  if (k.c !== null && k.b !== null && k.c <= k.b) return { ok: false, error: "Přepona c musí být delší než b" };

  if (sides.length >= 2) {
    // Dvě strany mají přednost (přesnější než přes úhel)
    if (k.a !== null && k.b !== null) { a = k.a; b = k.b; c = Math.hypot(a, b); }
    else if (k.a !== null) { a = k.a; c = k.c; b = Math.sqrt(c * c - a * a); }
    else { b = k.b; c = k.c; a = Math.sqrt(c * c - b * b); }
  } else {
    const al = angle * DEG;
    if (k.a !== null) { a = k.a; c = a / Math.sin(al); b = a / Math.tan(al); }
    else if (k.b !== null) { b = k.b; c = b / Math.cos(al); a = b * Math.tan(al); }
    else { c = k.c; a = c * Math.sin(al); b = c * Math.cos(al); }
  }
  const alpha = Math.atan2(a, b) / DEG;
  const res = { ok: true, a, b, c, alpha, beta: 90 - alpha };

  // Přeurčené zadání (3+ hodnoty) → všechny zadané musí sedět s výsledkem
  for (const key of ["a", "b", "c"]) {
    if (k[key] !== null && Math.abs(k[key] - res[key]) > REL_TOL * res[key]) {
      return { ok: false, error: "Zadané hodnoty si odporují – nechte jen 2" };
    }
  }
  for (const key of ["alpha", "beta"]) {
    if (k[key] !== null && Math.abs(k[key] - res[key]) > ANG_TOL) {
      return { ok: false, error: "Zadané hodnoty si odporují – nechte jen 2" };
    }
  }
  return res;
}

function label(key) {
  return { a: "a", b: "b", c: "c", alpha: "α", beta: "β" }[key];
}
