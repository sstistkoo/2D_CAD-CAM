// ── Řešič obecného trojúhelníku ──
// Strany a, b, c; úhly α, β, γ ve stupních; α leží proti a, β proti b, γ proti c.
// Čistá funkce bez DOM – testovatelná (tests/triangle-solver.test.js).
// Zvládne SSS, SAS, ASA/AAS i SSA (nejednoznačný případ → až dvě řešení).

const DEG = Math.PI / 180;
const REL_TOL = 1e-3;      // relativní shoda přeurčených stran (0,1 %)
const ANG_TOL = 0.01;      // shoda úhlů ve stupních

const SIDE_KEYS = ['a', 'b', 'c'];
const ANG_KEYS = ['alpha', 'beta', 'gamma'];
const LABEL = { a: 'a', b: 'b', c: 'c', alpha: 'α', beta: 'β', gamma: 'γ' };

const sinD = (x) => Math.sin(x * DEG);
const cosD = (x) => Math.cos(x * DEG);
const acosD = (x) => Math.acos(Math.max(-1, Math.min(1, x))) / DEG;
const asinD = (x) => Math.asin(Math.max(-1, Math.min(1, x))) / DEG;

/** Z úplných stran a úhlů (sedmi hodnot) vrátí výsledek s plochou, obvodem a výškami. */
function finish(S, A) {
  const [a, b, c] = S;
  const s = (a + b + c) / 2;
  const area = 0.5 * a * b * sinD(A[2]);
  return {
    a, b, c, alpha: A[0], beta: A[1], gamma: A[2],
    perimeter: a + b + c, area,
    ha: 2 * area / a, hb: 2 * area / b, hc: 2 * area / c,
    circumR: a / (2 * sinD(A[0])), inR: area / s,
  };
}

/** Úhly ze tří stran (kosinová věta); null = neplatný trojúhelník. */
function anglesFromSides(S) {
  const [a, b, c] = S;
  if (!(a + b > c * (1 + 1e-12) && a + c > b * (1 + 1e-12) && b + c > a * (1 + 1e-12))) return null;
  const al = acosD((b * b + c * c - a * a) / (2 * b * c));
  const be = acosD((a * a + c * c - b * b) / (2 * a * c));
  return [al, be, 180 - al - be];
}

/**
 * @param {{a?:number|null,b?:number|null,c?:number|null,alpha?:number|null,beta?:number|null,gamma?:number|null}} known
 * @returns {{ok:true, solutions:object[]}|{ok:false, error:string}}
 *   solutions[i] = {a,b,c,alpha,beta,gamma,perimeter,area,ha,hb,hc,circumR,inR}
 */
export function solveTriangle(known) {
  const k = {};
  for (const key of [...SIDE_KEYS, ...ANG_KEYS]) {
    const v = known[key];
    k[key] = (v === null || v === undefined || v === '') ? null : Number(v);
    if (k[key] !== null && !(isFinite(k[key]) && k[key] > 0)) {
      return { ok: false, error: `Neplatná hodnota ${LABEL[key]} (musí být kladné číslo)` };
    }
  }
  for (const key of ANG_KEYS) {
    if (k[key] !== null && k[key] >= 180) return { ok: false, error: `Úhel ${LABEL[key]} musí být menší než 180°` };
  }
  let S = SIDE_KEYS.map(x => k[x]);
  let A = ANG_KEYS.map(x => k[x]);
  const nS = S.filter(v => v !== null).length, nA = A.filter(v => v !== null).length;
  if (nS + nA < 3) return { ok: false, error: 'Zadejte 3 hodnoty (aspoň jedna musí být strana)' };
  if (nS === 0) return { ok: false, error: 'Ze tří úhlů nejde určit velikost – zadejte aspoň jednu stranu' };

  const sols = [];
  if (nA >= 2) {
    // ASA / AAS: třetí úhel z doplňku do 180°, strany ze sinové věty
    let ang = A.slice();
    if (nA === 2) { const i = ang.indexOf(null); ang[i] = 180 - ang.reduce((s, v) => s + (v ?? 0), 0); }
    const sum = ang[0] + ang[1] + ang[2];
    if (ang.some(v => !(v > ANG_TOL / 10))) return { ok: false, error: 'Součet zadaných úhlů musí být menší než 180°' };
    if (Math.abs(sum - 180) > ANG_TOL) return { ok: false, error: 'Součet úhlů musí být 180°' };
    const i = S.findIndex(v => v !== null);
    const kk = S[i] / sinD(ang[i]);
    sols.push({ S: ang.map(x => kk * sinD(x)), A: ang });
  } else if (nS === 3) {
    const ang = anglesFromSides(S);
    if (!ang) return { ok: false, error: 'Z těchto stran trojúhelník nevznikne (součet dvou musí být větší než třetí)' };
    sols.push({ S, A: ang });
  } else {
    // dvě strany a jeden úhel
    const ai = A.findIndex(v => v !== null);
    const others = [0, 1, 2].filter(x => x !== ai);
    if (S[ai] === null) {
      // SAS: úhel je mezi oběma známými stranami, třetí strana z kosinové věty
      const [j, l] = others;
      const si = Math.sqrt(S[j] * S[j] + S[l] * S[l] - 2 * S[j] * S[l] * cosD(A[ai]));
      const full = S.slice(); full[ai] = si;
      const ang = anglesFromSides(full);
      if (!ang) return { ok: false, error: 'Z těchto hodnot trojúhelník nevznikne' };
      sols.push({ S: full, A: ang });
    } else {
      // SSA: úhel leží proti známé straně, druhá známá strana je j → sinová věta
      const j = others.find(x => S[x] !== null), l = others.find(x => x !== j);
      const x = S[j] * sinD(A[ai]) / S[ai];
      if (x > 1 + 1e-9) return { ok: false, error: 'Trojúhelník neexistuje – strana protilehlá zadanému úhlu je příliš krátká' };
      const base = asinD(x);
      const cands = Math.abs(x - 1) < 1e-9 ? [90] : [base, 180 - base];
      for (const aj of cands) {
        const al = 180 - A[ai] - aj;
        if (!(al > 1e-9)) continue;
        const ang = [0, 0, 0]; ang[ai] = A[ai]; ang[j] = aj; ang[l] = al;
        const full = S.slice(); full[l] = S[ai] * sinD(al) / sinD(A[ai]);
        sols.push({ S: full, A: ang });
      }
      if (!sols.length) return { ok: false, error: 'Z těchto hodnot trojúhelník nevznikne' };
    }
  }

  // Kontrola přeurčených (zadaných navíc) hodnot proti vyřešenému trojúhelníku
  const good = sols.filter(({ S: s, A: a }) =>
    S.every((v, i) => v === null || Math.abs(v - s[i]) <= REL_TOL * Math.max(v, 1e-9)) &&
    A.every((v, i) => v === null || Math.abs(v - a[i]) <= ANG_TOL));
  if (!good.length) return { ok: false, error: 'Zadané hodnoty si protiřečí – nesedí do jednoho trojúhelníku' };
  return { ok: true, solutions: good.map(({ S: s, A: a }) => finish(s, a)) };
}
