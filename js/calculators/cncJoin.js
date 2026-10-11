// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – CNC Editor (kreslení): spojení v průsečíku a        ║
// ║  sražení zadané úhlem × délkou. Čisté funkce bez DOM,        ║
// ║  testy: tests/cncJoin.test.js, tests/cncChamfer.test.js.     ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Geometrie se počítá ve fyzické rovině (Z, poloměr) – stejně jako v cncDrawTools.js.
// Úsečka i oblouk (G2/G3, i tečný T) se berou z analyzeDrawCode, takže výrazy,
// PU/L i T se tu nemusí řešit zvlášť.

import { analyzeDrawCode, f3, axesText, lineCom, codePart } from './cncDrawTools.js';

const EPS = 1e-6;
const TAU = 2 * Math.PI;

// ── Segmenty a průsečíky ─────────────────────────────────────

/** Segment (úsečka / oblouk) z pohybu analýzy. */
function segOf(mv, kar) {
  if (mv.g === 1) return { kind: 'line', a: mv.from, b: mv.to };
  const a = mv.arc;
  return { kind: 'arc', a: mv.from, b: mv.to, C: { z: a.cz, x: a.cx }, r: a.r, worldCcw: a.ccw, ccw: a.ccw !== kar, sweep: a.sweep };
}
const theta = (C, p) => Math.atan2(p.x - C.x, p.z - C.z);

/** Úhel od začátku oblouku k bodu po směru oblouku (0 … 2π). */
function arcSweepTo(seg, p) {
  let w = (theta(seg.C, p) - theta(seg.C, seg.a)) * (seg.ccw ? 1 : -1);
  w %= TAU;
  if (w < 0) w += TAU;
  if (w > TAU - 1e-7) w = 0;
  return w;
}

/** Podíl dráhy segmentu (0 = začátek, 1 = konec) k bodu na jeho nosiči; null = mimo segment. */
function paramOn(seg, p) {
  if (seg.kind === 'line') {
    const dz = seg.b.z - seg.a.z, dx = seg.b.x - seg.a.x;
    const t = ((p.z - seg.a.z) * dz + (p.x - seg.a.x) * dx) / (dz * dz + dx * dx);
    return t < -EPS || t > 1 + EPS ? null : Math.min(1, Math.max(0, t));
  }
  const w = arcSweepTo(seg, p);
  return w > seg.sweep + 1e-6 ? null : w / seg.sweep;
}

const dot = (u, v) => u.z * v.z + u.x * v.x;

/** Průsečíky nosičů (přímka / kružnice) dvou segmentů. */
function carrierPoints(s1, s2) {
  const pts = [];
  const lineLine = (p, d, q, e) => {
    const den = d.z * e.x - d.x * e.z;
    if (Math.abs(den) < 1e-12 * Math.hypot(d.z, d.x) * Math.hypot(e.z, e.x)) return;
    const t = ((q.z - p.z) * e.x - (q.x - p.x) * e.z) / den;
    pts.push({ z: p.z + t * d.z, x: p.x + t * d.x });
  };
  const lineCircle = (p, d, C, r) => {
    const f = { z: p.z - C.z, x: p.x - C.x };
    const A = dot(d, d), B = 2 * dot(f, d), Cq = dot(f, f) - r * r;
    const disc = B * B - 4 * A * Cq;
    if (disc < -1e-9 * A) return;
    const sq = Math.sqrt(Math.max(disc, 0));
    for (const t of sq < 1e-9 ? [-B / (2 * A)] : [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) pts.push({ z: p.z + t * d.z, x: p.x + t * d.x });
  };
  const d = s => ({ z: s.b.z - s.a.z, x: s.b.x - s.a.x });
  if (s1.kind === 'line' && s2.kind === 'line') lineLine(s1.a, d(s1), s2.a, d(s2));
  else if (s1.kind === 'line') lineCircle(s1.a, d(s1), s2.C, s2.r);
  else if (s2.kind === 'line') lineCircle(s2.a, d(s2), s1.C, s1.r);
  else {
    const dz = s2.C.z - s1.C.z, dx = s2.C.x - s1.C.x, dd = Math.hypot(dz, dx);
    if (dd < EPS || dd > s1.r + s2.r + 1e-9 || dd < Math.abs(s1.r - s2.r) - 1e-9) return pts;
    const a = (s1.r * s1.r - s2.r * s2.r + dd * dd) / (2 * dd);
    const h = Math.sqrt(Math.max(s1.r * s1.r - a * a, 0));
    const mz = s1.C.z + a * dz / dd, mx = s1.C.x + a * dx / dd;
    pts.push({ z: mz - h * dx / dd, x: mx + h * dz / dd });
    if (h > 1e-9) pts.push({ z: mz + h * dx / dd, x: mx - h * dz / dd });
  }
  return pts;
}

const segLen = (seg, to) => seg.kind === 'line'
  ? Math.hypot(to.z - seg.a.z, to.x - seg.a.x)
  : seg.r * arcSweepTo(seg, to);
const segName = seg => seg.kind === 'line' ? 'úsečku' : 'oblouk';

// ── Spojení v průsečíku ──────────────────────────────────────

/**
 * Spojí dva prvky (úsečka / oblouk) v průsečíku do jedné navazující kontury. Kurzor
 * (řádek `ln`) je na druhém prvku B (nebo na rychloposuvu před ním); před B musí být
 * rychloposuv G0 na jeho začátek a před ním první prvek A. Výsledek: začátek A →
 * průsečík → začátek B (A se v průsečíku ořízne, B se obrátí a vede z průsečíku zpět
 * na svůj začátek). Protíná-li se víc míst, bere se to, ke kterému A dojede první.
 * @returns {{code: string, line: number, point: {z: number, x: number}} | {err: string}}
 */
export function joinAtIntersection(code, ln, opts = {}) {
  const an = analyzeDrawCode(code, opts), mvs = an.moves, xs = an.xs, kar = !!an.opts.karusel, flip = !!opts.flip;
  let bi = -1;
  mvs.forEach((m, i) => { if (m.line <= ln) bi = i; });
  if (bi >= 0 && mvs[bi].g === 0 && mvs[bi + 1]?.g >= 1) bi++;   // kurzor na rychloposuvu před B
  const B = mvs[bi], J = mvs[bi - 1], A = mvs[bi - 2];
  const hint = 'Kurzor dejte na druhý prvek – před ním musí být rychloposuv (G0) na jeho začátek a první prvek (úsečka nebo oblouk).';
  if (!B || !J || !A || B.g < 1 || J.g !== 0 || A.g < 1 || A.stock !== B.stock) return { err: hint };
  const bad = [A, B].find(m => m.polarErr || m.arc?.err);
  if (bad) return { err: bad.polarErr || bad.arc.err };
  const sa = segOf(A, kar), sb = segOf(B, kar);
  const lenA = sa.kind === 'line' ? Math.hypot(sa.b.z - sa.a.z, sa.b.x - sa.a.x) : sa.r * sa.sweep;
  const lenB = sb.kind === 'line' ? Math.hypot(sb.b.z - sb.a.z, sb.b.x - sb.a.x) : sb.r * sb.sweep;
  if (lenA < EPS || lenB < EPS) return { err: 'Jeden z prvků má nulovou délku.' };

  const cand = carrierPoints(sa, sb);
  if (!cand.length) {
    return { err: sa.kind === 'line' && sb.kind === 'line'
      ? 'Úsečky jsou rovnoběžné – průsečík neexistuje.'
      : 'Prvky se neprotínají (nosné přímky / kružnice se míjejí).' };
  }
  const valid = cand.map(p => ({ p, ta: paramOn(sa, p), tb: paramOn(sb, p) })).filter(c => c.ta !== null && c.tb !== null);
  if (!valid.length) {
    const c = cand[0];
    const offA = paramOn(sa, c) === null;
    return { err: `Prvky se neprotínají – průsečík X${f3(c.x * xs)} Z${f3(c.z)} leží mimo ${offA ? 'první' : 'druhý'} ${segName(offA ? sa : sb)} (na jeho prodloužení).` };
  }
  valid.sort((u, v) => u.ta - v.ta);
  const P = valid[0].p;

  const inc = B.mode === 91;
  const gArc = (ccwWorld) => (ccwWorld !== flip ? 'G3' : 'G2');
  // Text pohybu from → to po prvku `seg` (pro obrácený prvek `rev`: opačný smysl, střed zůstává).
  const moveText = (seg, from, to, rev, bare) => {
    if (seg.kind === 'line') {
      const ax = axesText(from, to, xs, inc);
      return ax ? (bare ? ax : 'G1 ' + ax) : '';
    }
    const ccw = rev ? !seg.worldCcw : seg.worldCcw;
    const x = f3(inc ? (to.x - from.x) * xs : to.x * xs), z = f3(inc ? to.z - from.z : to.z);
    return `${gArc(ccw)} X${x} Z${z} I${f3((seg.C.x - from.x) * xs)} K${f3(seg.C.z - from.z)}`;
  };
  const textA = moveText(sa, sa.a, P, false, false);
  if (!textA) return { err: 'Průsečík leží v počátku prvního prvku – není co spojit.' };
  const textB = moveText(sb, P, sb.a, true, sa.kind === 'line' && sb.kind === 'line');

  const lines = code.split('\n');
  // Popisky z exportu („line 1, L=141.421") – délka po oříznutí se přepíše.
  const upd = (com, len) => com.replace(/L=[-\d.]+/, 'L=' + f3(len));
  const comA = upd(lineCom(lines[A.line]), segLen(sa, P));
  const comB = upd(lineCom(lines[B.line]), sb.kind === 'line'
    ? Math.hypot(sb.a.z - P.z, sb.a.x - P.x)
    : sb.r * (arcSweepTo(sb, P) ? arcSweepTo(sb, P) : TAU));
  const out = [];
  for (let i = A.line; i <= B.line; i++) {
    if (i === A.line) out.push(textA + (comA ? ' ' + comA : ''));
    else if (i === J.line) continue;
    else if (i === B.line) { if (textB) out.push(textB + (comB ? ' ' + comB : '')); }
    else out.push(lines[i]);
  }
  const endIdx = A.line + out.length - 1;
  lines.splice(A.line, B.line - A.line + 1, ...out);
  return { code: lines.join('\n'), line: endIdx, point: P };
}

// ── Sražení úhel × délka ─────────────────────────────────────

/** Přepíše koncové X / Z úsečky na řádku (ostatní slova, N-blok a komentář zůstanou). */
function rewriteEnd(raw, from, to, xs) {
  const com = lineCom(raw);
  const n = (raw.match(/^\s*N\d+\s*/i) || [''])[0];
  const body = codePart(raw);
  const gs = (body.match(/\bG\s*\d+/g) || []).map(g => g.replace(/\s+/g, ''));
  if (!gs.some(g => /^G0*[0-3]$/.test(g))) gs.push('G1');                // úsečka s PU bez G
  const VAL = String.raw`(?:\s*=\s*[^\s;]+|\s*\[[^\]]*\]|\s*[-+]?[\d.(][-+*/().\d]*)`;
  const rest = body.replace(/\bG\s*\d+/g, ' ')
    .replace(new RegExp('(?<![A-Z])(?:PU|L|X|Z)' + VAL, 'g'), ' ').replace(/\s+/g, ' ').trim();
  const ax = axesText(from, to, xs, false);
  return (n + [...gs, rest, ax].filter(Boolean).join(' ')).trim() + (com ? ' ' + com : '');
}

const rot = (u, deg) => {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return { z: c * u.z - s * u.x, x: s * u.z + c * u.x };
};

/**
 * Sražení rohu mezi dvěma úsečkami zadané úhlem a délkou. Kurzor je na řádku první
 * úsečky (končí v rohu), další pohyb je druhá úsečka. `along` = 'first' / 'second' říká,
 * po které úsečce se měří délka `L` od rohu; `alpha` je úhel sražení vůči TÉTO úsečce
 * (např. 3×30° = délka 3 podél osy, sklon 30° k ose). Jen v G90.
 * @returns {{code: string, line: number, a: {z,x}, b: {z,x}} | {err: string}}
 */
export function chamferByAngle(code, ln, L, alpha, along = 'first', opts = {}) {
  if (!(L > 0)) return { err: 'Zadejte kladnou délku sražení.' };
  if (!(alpha > 0 && alpha < 90)) return { err: 'Úhel sražení musí být mezi 0° a 90°.' };
  const an = analyzeDrawCode(code, opts), xs = an.xs, mvs = an.moves;
  let i1 = -1;
  mvs.forEach((m, i) => { if (m.line <= ln) i1 = i; });
  const M1 = mvs[i1], M2 = mvs[i1 + 1];
  if (!M1 || !M2 || M1.g !== 1 || M2.g !== 1 || M1.stock !== M2.stock) return { err: 'Kurzor dejte na první ze dvou navazujících úseček (G1), mezi kterými je roh.' };
  if (M1.mode === 91 || M2.mode === 91) return { err: 'Sražení úhlem počítá jen v G90 – nejdřív převeďte kód tlačítkem G90 / G91.' };
  if (Math.hypot(M2.from.z - M1.to.z, M2.from.x - M1.to.x) > 1e-6) return { err: 'Druhá úsečka nenavazuje na konec první.' };
  const K = M1.to;
  const len1 = Math.hypot(M1.to.z - M1.from.z, M1.to.x - M1.from.x), len2 = Math.hypot(M2.to.z - M2.from.z, M2.to.x - M2.from.x);
  if (len1 < EPS || len2 < EPS) return { err: 'Jedna z úseček má nulovou délku.' };
  const dA1 = { z: (M1.from.z - K.z) / len1, x: (M1.from.x - K.x) / len1 };   // od rohu podél 1. úsečky
  const dB1 = { z: (M2.to.z - K.z) / len2, x: (M2.to.x - K.x) / len2 };       // od rohu podél 2. úsečky
  if (Math.abs(dA1.z * dB1.x - dA1.x * dB1.z) < 1e-9) return { err: 'Úsečky leží v jedné přímce – není tu roh.' };
  const first = along !== 'second';
  const dA = first ? dA1 : dB1, dB = first ? dB1 : dA1;                // A = úsečka, po které se měří L
  const lenA = first ? len1 : len2, lenB = first ? len2 : len1;
  if (L >= lenA - 1e-9) return { err: `Délka sražení ${f3(L)} je větší než ${first ? 'první' : 'druhá'} úsečka (${f3(lenA)}).` };
  const PA = { z: K.z + L * dA.z, x: K.x + L * dA.x };
  const eA = { z: -dA.z, x: -dA.x };                                    // z PA zpět k rohu
  let best = null;
  for (const s of [1, -1]) {
    const e = rot(eA, s * alpha);                                       // směr sražení z PA
    // PA + λ e = K + μ dB
    const den = e.z * (-dB.x) - e.x * (-dB.z);
    if (Math.abs(den) < 1e-12) continue;
    const rz = K.z - PA.z, rx = K.x - PA.x;
    const lam = (rz * (-dB.x) - rx * (-dB.z)) / den, mu = (e.z * rx - e.x * rz) / den;
    if (lam > EPS && mu > EPS && (!best || mu < best.mu)) best = { mu, lam };
  }
  if (!best) return { err: 'Sražení s tímto úhlem a délkou nevychází (zkuste jiný úhel).' };
  if (best.mu >= lenB - 1e-9) return { err: `Sražení by sahalo za ${first ? 'druhou' : 'první'} úsečku (potřeba ${f3(best.mu)}, je ${f3(lenB)}).` };
  const PB = { z: K.z + best.mu * dB.z, x: K.x + best.mu * dB.x };
  // Body ve směru jízdy: konec 1. úsečky a začátek 2. úsečky po sražení.
  const P1 = first ? PA : PB, P2 = first ? PB : PA;

  const lines = code.split('\n');
  const com = `; sražení ${f3(L)}×${f3(alpha)}°`;
  lines[M1.line] = rewriteEnd(lines[M1.line], M1.from, P1, xs);
  const chamfer = 'G1 ' + axesText(P1, P2, xs, false) + ' ' + com;
  lines.splice(M1.line + 1, 0, chamfer);
  return { code: lines.join('\n'), line: M1.line + 1, a: P1, b: P2 };
}
