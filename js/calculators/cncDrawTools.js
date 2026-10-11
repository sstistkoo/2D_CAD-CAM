// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – CNC Editor z Kalkulaček: rozbor kreslicího G-kódu   ║
// ║  (údaje k řádku, kontroly geometrie, úsečka úhlem, G90↔G91   ║
// ║  jen pro vybrané řádky). Čisté funkce bez DOM – testy v      ║
// ║  tests/cncDrawTools.test.js.                                 ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Souřadnice se počítají ve FYZICKÉ rovině (Z, poloměr) – v kódu je X
// v režimu „průměr" dvojnásobné (xs = 2). Oblouky se konstruují ve světových
// souřadnicích plátna stejně jako kreslicí parser (parseGcodeToObjects v
// storage/fileIO.js): soustruh svět (x=Z, y=poloměr), karusel (x=poloměr, y=Z),
// G3 = proti směru hodin ve světě. Tím náhled i údaje sedí s tím, co se nakreslí.

import { arcFromEndpointsRadius } from '../utils.js';
import { readAddr, updateParams, isParamLine, resolveExpressions } from './cncExpr.js';

const EPS = 1e-6;
/** Řádek s polárním zadáním úsečky: PU<úhel> + L<délka> (nebo cílové X / Z). */
const POLAR_RE = /(?:^|[^A-Z])PU\s*=?\s*[-+]?(?:\d|\.\d)/;
export const f3 = v => String(Number((Math.abs(v) < 5e-4 ? 0 : v).toFixed(3)));

/** Samostatné T na řádku s G2/G3 = tečné napojení (T5 = nástroj se nepočítá). */
const T_RE = /(?:^|\s)T(?=\s|$)/;

/**
 * Oblouk tečný ve startu ke směru předchozího pohybu, procházející koncem.
 * Střed leží na kolmici ke směru ve startu: s = |w|² / (2·n·w), w = konec − start.
 */
function tangentArc(prev, stock, from, to, ccw, kar, flip, spec) {
  const dir = prev && prev.g !== 0 && !!prev.stock === stock ? moveDirDeg(prev, { opts: { karusel: kar } }) : null;
  if (dir === null) return { r: 0, ccw, err: 'T: tečný oblouk potřebuje před sebou úsečku nebo oblouk (ne G0).' };
  const a = dir * Math.PI / 180, d = { z: Math.cos(a), x: Math.sin(a) }, n = { z: -d.x, x: d.z };
  // T + R + jedna souřadnice (X nebo Z): G2/G3 určí stranu, R poloměr; konec je průsečík
  // kružnice s přímkou X = konst. / Z = konst. – první, ke kterému oblouk dojede (kratší).
  const one = spec.hasX !== spec.hasZ;
  if (spec.R !== null && !spec.hasX && !spec.hasZ) return { r: 0, ccw, err: 'T: k poloměru R doplňte koncové X nebo Z.' };
  if (spec.R !== null && one) {
    if (spec.R < EPS) return { r: 0, ccw, err: 'T: poloměr R musí být kladný.' };
    const left = ccw !== kar;                       // zatáčka doleva ve fyzické rovině (Z, X)
    const sg = left ? spec.R : -spec.R;
    const C = { z: from.z + sg * n.z, x: from.x + sg * n.x };
    const alongZ = spec.hasZ;                       // pevná souřadnice: Z nebo X
    const fixed = alongZ ? to.z : to.x;
    const dd = spec.R * spec.R - (fixed - (alongZ ? C.z : C.x)) ** 2;
    if (dd < -1e-9) return { r: 0, ccw, err: `T: oblouk R${f3(spec.R)} ${alongZ ? 'Z' : 'X'}${f3(fixed)} nedosáhne.` };
    const sq = Math.sqrt(Math.max(dd, 0));
    const th = (p) => Math.atan2(p.x - C.x, p.z - C.z), th0 = th(from), dirSign = left ? 1 : -1;
    let best = null;
    for (const sgn of sq < 1e-9 ? [0] : [1, -1]) {
      const E = alongZ ? { z: fixed, x: C.x + sgn * sq } : { x: fixed, z: C.z + sgn * sq };
      let sw = ((th(E) - th0) * dirSign) % (2 * Math.PI);
      if (sw < 0) sw += 2 * Math.PI;
      if (sw < 1e-7) sw = 2 * Math.PI;              // E = start (leží na přímce) – to není dojetí
      if (!best || sw < best.sw) best = { E, sw };
    }
    return { cx: C.x, cz: C.z, r: spec.R, ccw, end: best.E };
  }
  const w = { z: to.z - from.z, x: to.x - from.x };
  const ww = w.z * w.z + w.x * w.x, nw = n.z * w.z + n.x * w.x;
  if (ww < EPS * EPS) return { r: 0, ccw, err: 'T: koncový bod je stejný jako začátek oblouku.' };
  if (Math.abs(nw) < 1e-9 * Math.sqrt(ww)) return { r: 0, ccw, err: 'T: koncový bod leží na tečně – oblouk by byl přímka (použijte G1).' };
  const sg = ww / (2 * nw);
  // Zatáčka doleva ve fyzické rovině (Z, X) je proti směru hodin; u karuselu je svět zrcadlený.
  const worldCcw = (sg > 0) !== kar;
  const arc = { cx: from.x + sg * n.x, cz: from.z + sg * n.z, r: Math.abs(sg), ccw: worldCcw };
  if (worldCcw !== ccw) arc.warn = `T: tečný oblouk do tohoto bodu jde opačným smyslem – správně je G${worldCcw !== flip ? 3 : 2}`;
  return arc;
}

/** Hodnota adresy (X, Z, I, K, R, CR=) z řádku bez komentáře; null = není. */
function addr(line, letter) {
  const m = new RegExp('(?:^|[^A-Z])' + letter + '\\s*=?\\s*([-+]?(?:\\d+\\.?\\d*|\\.\\d+))', 'i').exec(line);
  return m ? parseFloat(m[1]) : null;
}

/** Kód řádku bez komentáře (; i Fanuc závorky) a bez čísla bloku. */
export function codePart(raw) {
  return raw.replace(/\([^)]*\)/g, ' ').replace(/;.*$/, '').replace(/^\s*N\d+\s*/i, '').trim().toUpperCase();
}

/**
 * Rozbor kódu po řádcích.
 * @param {string} code
 * @param {{diam?: boolean, karusel?: boolean, flip?: boolean}} [opts]
 *   flip = G2/G3 v textu prohozené kvůli zrcadlení jedné osy (flipX ≠ flipZ,
 *   viz flipArc v runCncExport) – oblouk se pak ve světě bere opačně.
 * @returns {{moves: object[], byLine: Map<number, object>, xs: number, opts: object}}
 *   move = { line, g, mode, stock, from:{z,x}, to:{z,x}, arc? } – x = poloměr;
 *   arc = { cz, cx, r, ccw, sweep, err? } (střed ve fyzické rovině).
 */
export function analyzeDrawCode(code, opts = {}) {
  const xs = opts.diam ? 2 : 1;
  const kar = !!opts.karusel;
  const toW = (p) => kar ? { x: p.x, y: p.z } : { x: p.z, y: p.x };
  const fromW = (w) => kar ? { x: w.x, z: w.y } : { x: w.y, z: w.x };
  const moves = [];
  const byLine = new Map();
  const params = new Map();   // R-parametry
  const bad = new Map();      // řádek → nevyhodnotitelný výraz
  let pos = { z: 0, x: 0 };
  let mode = 90, motion = null, stock = false;
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (/STOCK_START/i.test(raw)) { stock = true; continue; }
    if (/STOCK_END/i.test(raw)) { stock = false; continue; }
    const c = codePart(raw);
    if (!c) continue;
    updateParams(raw, params);                    // R1=10, R2=R1*2 …
    if (isParamLine(raw)) continue;
    const lineBad = [];
    const addr = (cc, l) => readAddr(cc, l, params, lineBad);   // číslo i výraz
    // Jiné příkazy s X/Z (TRANS, CYCLE…, LIMS=) nejsou pohyb kontury.
    if (/^[A-Z_]{2,}/.test(c) && !/^G\d/.test(c) && !POLAR_RE.test(c)) continue;
    const gs = [...c.matchAll(/\bG\s*0*(\d{1,2})(?!\d)/g)].map(m => +m[1]);
    if (gs.includes(90)) mode = 90;
    if (gs.includes(91)) mode = 91;
    if (gs.some(g => [4, 33, 53, 74, 75, 92, 50].includes(g))) continue;
    const gm = gs.filter(g => g <= 3);
    if (gm.length) motion = gm[gm.length - 1];
    else if (POLAR_RE.test(c)) motion = 1;        // polární úsečka bez G je vždy G1
    const X = addr(c, 'X'), Z = addr(c, 'Z');
    const PU = POLAR_RE.test(c) ? addr(c, 'PU') : null;
    if (lineBad.length) bad.set(i, 'Neplatný výraz: ' + lineBad.join(', '));
    if (X === null && Z === null && PU === null) continue;
    const from = { ...pos };
    let to = mode === 91
      ? { z: from.z + (Z ?? 0), x: from.x + (X ?? 0) / xs }
      : { z: Z ?? from.z, x: X !== null ? X / xs : from.x };
    let polarErr = null;
    if (PU !== null) {
      // Polární zadání: PU = úhel od +Z, a L (délka), nebo cílové X / Z (v G91 přírůstek).
      const L = addr(c, 'L');
      const Xt = X === null ? null : (mode === 91 ? from.x * xs + X : X);
      const Zt = Z === null ? null : (mode === 91 ? from.z + Z : Z);
      const e = angleLineEnd(from, PU, { L, X: L === null ? Xt : null, Z: L === null ? Zt : null }, xs);
      if (e.err) { polarErr = e.err; to = { ...from }; } else to = { z: e.z, x: e.x / xs };
    }
    pos = to;
    if (motion === null) continue;               // souřadnice bez druhu pohybu – jen poloha
    const mv = { line: i, g: motion, mode, stock, from, to };
    if (polarErr) mv.polarErr = polarErr;
    if (motion === 2 || motion === 3) {
      const I = addr(c, 'I'), K = addr(c, 'K');
      const R = addr(c, 'CR') ?? addr(c, 'R');
      const ccw = (motion === 3) !== !!opts.flip;
      // T = tečné napojení: střed se dopočte z tečnosti ke směru předchozího pohybu.
      const tArc = T_RE.test(c)
        ? tangentArc(moves[moves.length - 1], stock, from, to, ccw, kar, !!opts.flip, { hasX: X !== null, hasZ: Z !== null, R: R === null ? null : Math.abs(R) })
        : null;
      if (tArc) {
        mv.arc = tArc;
        mv.tangent = true;
        if (tArc.end) { to = tArc.end; mv.to = to; pos = to; }   // konec dopočtený z R a jedné souřadnice
      } else if (I !== null || K !== null) {
        const cen = { x: from.x + (I ?? 0) / xs, z: from.z + (K ?? 0) };
        const r = Math.hypot(from.x - cen.x, from.z - cen.z);
        const r2 = Math.hypot(to.x - cen.x, to.z - cen.z);
        mv.arc = { cx: cen.x, cz: cen.z, r, ccw };
        if (r < EPS) mv.arc.err = 'Oblouk: střed I/K leží v počátečním bodě.';
        else if (Math.abs(r - r2) > 0.01) mv.arc.err = `Oblouk: konec neleží na kružnici ze středu I/K (R začátek ${f3(r)}, konec ${f3(r2)}).`;
        if (R !== null && Math.abs(Math.abs(R) - r) > 0.01 && !mv.arc.err)
          mv.arc.err = `Oblouk: R${f3(Math.abs(R))} nesouhlasí se středem I/K (vychází R${f3(r)}).`;
      } else if (R !== null) {
        const a = arcFromEndpointsRadius(toW(from), toW(to), Math.abs(R), ccw, { longArc: R < 0 });
        if (a) { const cen = fromW({ x: a.cx, y: a.cy }); mv.arc = { cx: cen.x, cz: cen.z, r: Math.abs(R), ccw }; }
        else {
          const chord = Math.hypot(to.x - from.x, to.z - from.z);
          mv.arc = { r: Math.abs(R), ccw, err: `Oblouk: R${f3(Math.abs(R))} je menší než půlka vzdálenosti bodů – potřeba aspoň R${f3(chord / 2)}.` };
        }
      }
      if (mv.arc && !mv.arc.err && mv.arc.cx !== undefined) {
        const ws = toW(from), we = toW(to), wc = toW({ x: mv.arc.cx, z: mv.arc.cz });
        const a1 = Math.atan2(ws.y - wc.y, ws.x - wc.x), a2 = Math.atan2(we.y - wc.y, we.x - wc.x);
        let sw = mv.arc.ccw ? a2 - a1 : a1 - a2;   // smysl oblouku (u T z tečnosti, ne z G2/G3)
        while (sw <= EPS) sw += 2 * Math.PI;
        mv.arc.sweep = sw;
        mv.arc.a1 = a1; mv.arc.a2 = a2;
      }
    }
    moves.push(mv);
    byLine.set(i, mv);
  }
  return { moves, byLine, xs, bad, params, opts: { diam: !!opts.diam, karusel: kar } };
}

/** Poslední pohyb na řádku `idx` nebo před ním (poloha „kde jsem"). */
export function moveAtOrBefore(an, idx) {
  let best = null;
  for (const m of an.moves) { if (m.line <= idx) best = m; else break; }
  return best;
}

/** Úhel směru (Z, X) ve stupních od osy +Z, proti směru hodin, rozsah (−180, 180]. */
function dirDeg(dz, dx) { return Math.atan2(dx, dz) * 180 / Math.PI; }

/**
 * Údaje k pohybu pro informační řádek editoru.
 * @returns {string[]} části textu
 */
export function moveInfo(mv, an) {
  const xs = an.xs;
  const dz = mv.to.z - mv.from.z, dx = mv.to.x - mv.from.x;
  const end = `konec X${f3(mv.to.x * xs)} Z${f3(mv.to.z)}`;
  if (mv.polarErr) return ['Úsečka PU/L', '⚠ ' + mv.polarErr];
  if (mv.g === 0 || mv.g === 1) {
    const L = Math.hypot(dz, dx);
    const parts = [mv.g === 0 ? 'Rychloposuv' : 'Úsečka', `L ${f3(L)}`];
    if (L > EPS) parts.push(`∠ ${f3(dirDeg(dz, dx))}°`);
    parts.push(`ΔX ${f3(dx * xs)}`, `ΔZ ${f3(dz)}`, end);
    return parts;
  }
  const a = mv.arc;
  if (!a) return [`Oblouk G${mv.g}`, 'chybí R / I,K', end];
  if (a.err) return [`Oblouk G${mv.g}`, a.err];
  const deg = a.sweep * 180 / Math.PI;
  return [`Oblouk G${mv.g}${mv.tangent ? ' T (tečný)' : ''}`, ...(a.warn ? ['⚠ ' + a.warn] : []), `R ${f3(a.r)}`, `střed X${f3(a.cx * xs)} Z${f3(a.cz)}`,
    `I${f3((a.cx - mv.from.x) * xs)} K${f3(a.cz - mv.from.z)}`, `výseč ${f3(deg)}°`,
    `délka ${f3(a.r * a.sweep)}`, end];
}

// ── Kontroly geometrie (validace kreslení) ─────────────────────
/** Režim souřadnic (90 / 91) platný na konci řádku `idx` – poslední G90/G91 před ním. */
export function modeAtLine(code, idx) {
  let m = 90;
  code.split('\n').slice(0, idx + 1).forEach(l => {
    const c = codePart(l);
    if (/\bG90\b/.test(c)) m = 90;
    if (/\bG91\b/.test(c)) m = 91;
  });
  return m;
}

/** Směr pohybu v jeho koncovém bodě ve stupních od +Z (G0/G1 = směr úsečky,
 *  oblouk = tečna); null = pohyb nemá směr (nulová délka, chybný oblouk). */
export function moveDirDeg(mv, an) {
  if (!mv) return null;
  let t;
  if (mv.g === 0 || mv.g === 1) {
    const dz = mv.to.z - mv.from.z, dx = mv.to.x - mv.from.x, L = Math.hypot(dz, dx);
    t = L > EPS ? { z: dz / L, x: dx / L } : null;
  } else t = tangentAt(mv, true, an);
  return t ? dirDeg(t.z, t.x) : null;
}

/** Tečna (Z, X) na začátku / konci pohybu – jednotkový vektor. */
export function tangentAt(mv, atEnd, an) {
  if (mv.g === 1) {
    const dz = mv.to.z - mv.from.z, dx = mv.to.x - mv.from.x, L = Math.hypot(dz, dx);
    return L > EPS ? { z: dz / L, x: dx / L } : null;
  }
  const a = mv.arc;
  if (!a || a.err || a.cx === undefined) return null;
  const p = atEnd ? mv.to : mv.from;
  // Směr ve světě: kolmice na poloměr; ccw ve světě, převod zpět do (Z, X).
  const kar = an.opts.karusel;
  const w = kar ? { x: p.x - a.cx, y: p.z - a.cz } : { x: p.z - a.cz, y: p.x - a.cx };
  const t = a.ccw ? { x: -w.y, y: w.x } : { x: w.y, y: -w.x };
  const L = Math.hypot(t.x, t.y);
  if (L < EPS) return null;
  return kar ? { x: t.x / L, z: t.y / L } : { z: t.x / L, x: t.y / L };
}

/**
 * @param {ReturnType<typeof analyzeDrawCode>} an
 * @param {Record<string, {active: boolean}>} cfg
 * @returns {{lineIndex: number, msg: string}[]}
 */
export function geometryChecks(an, cfg) {
  const out = [];
  const on = k => cfg[k] && cfg[k].active;
  let fedInSection = false, lastStock = null, prev = null;
  for (const mv of an.moves) {
    if (mv.stock !== lastStock) { fedInSection = false; prev = null; lastStock = mv.stock; }
    if (on('arcFit') && mv.arc && mv.arc.err) out.push({ lineIndex: mv.line, msg: mv.arc.err });
    if (on('negX') && !an.opts.karusel && mv.to.x < -EPS)
      out.push({ lineIndex: mv.line, msg: `X${f3(mv.to.x * an.xs)} je záporné – bod pod osou soustružení.` });
    if (mv.g === 0) {
      const moved = Math.hypot(mv.to.z - mv.from.z, mv.to.x - mv.from.x) > EPS;
      if (on('contJump') && fedInSection && moved)
        out.push({ lineIndex: mv.line, msg: `Kontura nenavazuje – rychloposuv G0 uprostřed ${mv.stock ? 'polotovaru' : 'kontury'} (skok z X${f3(mv.from.x * an.xs)} Z${f3(mv.from.z)}).` });
      prev = null;
      continue;
    }
    fedInSection = true;
    if (on('tangency') && prev && (prev.g >= 2 || mv.g >= 2)) {
      const t1 = tangentAt(prev, true, an), t2 = tangentAt(mv, false, an);
      if (t1 && t2) {
        const ang = Math.acos(Math.max(-1, Math.min(1, t1.z * t2.z + t1.x * t2.x))) * 180 / Math.PI;
        if (ang > 0.5) out.push({ lineIndex: mv.line, msg: `Přechod na oblouk/z oblouku není tečný (lom ${f3(ang)}°).` });
      }
    }
    prev = mv;
  }
  return out;
}

// ── Úsečka zadaná úhlem ───────────────────────────────────────
/**
 * Koncový bod úsečky z počátku `from` pod úhlem `deg` (od osy +Z, proti směru
 * hodin – jako ANG u Sinumeriku) a jedním z údajů: délka L, cílové X (v
 * jednotkách kódu) nebo cílové Z.
 * @returns {{x: number, z: number} | {err: string}} x v jednotkách kódu
 */
export function angleLineEnd(from, deg, { L = null, X = null, Z = null } = {}, xs = 1) {
  if (!isFinite(deg)) return { err: 'Zadejte úhel.' };
  const r = deg * Math.PI / 180, dz = Math.cos(r), dx = Math.sin(r);
  let t;
  if (L !== null && isFinite(L)) t = L;
  else if (X !== null && isFinite(X)) {
    if (Math.abs(dx) < 1e-9) return { err: 'Úhel je rovnoběžný s osou Z – s cílovým X se neprotne.' };
    t = (X / xs - from.x) / dx;
  } else if (Z !== null && isFinite(Z)) {
    if (Math.abs(dz) < 1e-9) return { err: 'Úhel je rovnoběžný s osou X – s cílovým Z se neprotne.' };
    t = (Z - from.z) / dz;
  } else return { err: 'Zadejte délku L, nebo cílové X či Z.' };
  if (t < -EPS) return { err: 'Zadaný cíl leží opačným směrem, než ukazuje úhel.' };
  return { x: (from.x + t * dx) * xs, z: from.z + t * dz };
}

// ── G90 ↔ G91 jen pro vybrané řádky ──────────────────────────
function setAxis(c, letter, val) {
  const re = new RegExp('(^|[^A-Z])' + letter + '\\s*=?\\s*[-+]?(?:\\d+\\.?\\d*|\\.\\d+)', 'i');
  return c.replace(re, (m, pre) => `${pre}${letter}${f3(val)}`);
}
function setLineMode(raw, g) {
  const ci = raw.indexOf(';');
  let c = ci >= 0 ? raw.slice(0, ci) : raw;
  const com = ci >= 0 ? raw.slice(ci) : '';
  if (/\bG9[01]\b/i.test(c)) c = c.replace(/\bG9[01]\b/i, g);
  else {
    const pre = (c.match(/^\s*N\d+\s*/i) || [''])[0];
    c = pre + g + ' ' + c.slice(pre.length).replace(/^\s+/, '');
  }
  return c.replace(/\s+$/, '') + (com ? ' ' + com.replace(/^\s+/, '') : '');
}

/**
 * Převede souřadnice pohybů na řádcích first…last do G90 nebo G91 (ostatní
 * řádky beze změny, za výběrem se případně vrátí původní režim).
 * @returns {{code: string, changed: number}}
 */
export function convertLinesMode(code, first, last, target, opts = {}) {
  const an = analyzeDrawCode(code, opts);
  const xs = an.xs;
  const lines = code.split('\n');
  const tok = target === 91 ? 'G91' : 'G90';
  // Výrazy (X=R1*2, X10+5) se v převáděných řádcích nejdřív nahradí čísly, jinak by setAxis rozbil výraz.
  const resolved = resolveExpressions(code).code.split('\n');
  let changed = 0, firstDone = false;
  for (const mv of an.moves) {
    if (mv.line < first || mv.line > last) continue;
    const raw = resolved[mv.line];
    const ci = raw.indexOf(';');
    let c = ci >= 0 ? raw.slice(0, ci) : raw;
    const com = ci >= 0 ? raw.slice(ci) : '';
    const hasX = addr(codePart(raw), 'X') !== null, hasZ = addr(codePart(raw), 'Z') !== null;
    if (hasX) c = setAxis(c, 'X', target === 91 ? (mv.to.x - mv.from.x) * xs : mv.to.x * xs);
    if (hasZ) c = setAxis(c, 'Z', target === 91 ? mv.to.z - mv.from.z : mv.to.z);
    c = c.replace(/\bG9[01]\b\s*/gi, '');
    let nl = c.replace(/\s+$/, '') + (com ? ' ' + com.replace(/^\s+/, '') : '');
    if (!firstDone) { nl = setLineMode(nl, tok); firstDone = true; }
    lines[mv.line] = nl;
    changed++;
  }
  if (!changed) return { code, changed: 0 };
  // Samostatné G90/G91 (řádek bez pohybu) uvnitř výběru by režim přepnulo uprostřed
  // převedeného úseku → pryč (řádek zůstane, jen bez té značky).
  const moved = new Set(an.moves.map(m => m.line));
  for (let i = first; i <= last && i < lines.length; i++) {
    if (moved.has(i) || !/\bG9[01]\b/i.test(codePart(lines[i]))) continue;
    const ci = lines[i].indexOf(';');
    const c = (ci >= 0 ? lines[i].slice(0, ci) : lines[i]).replace(/\bG9[01]\b\s*/gi, '').replace(/\s+$/, '');
    const com = ci >= 0 ? lines[i].slice(ci) : '';
    lines[i] = c && com ? c + ' ' + com : (c || com);
  }
  // První pohyb za výběrem: vrátit jeho původní režim, pokud ho nemá zapsaný.
  const after = an.moves.find(m => m.line > last);
  if (after && after.mode !== target && !/\bG9[01]\b/i.test(codePart(lines[after.line])))
    lines[after.line] = setLineMode(lines[after.line], after.mode === 91 ? 'G91' : 'G90');
  return { code: lines.join('\n'), changed };
}

// ── Polární úsečky (PU/L) a spojení dvou úseček v průsečíku ────
/** Text os pohybu from → to; osa beze změny se nepíše. `inc` = přírůstky (G91). */
export function axesText(from, to, xs, inc) {
  const dx = (to.x - from.x) * xs, dz = to.z - from.z;
  const parts = [];
  if (f3(dx) !== '0') parts.push('X' + f3(inc ? dx : to.x * xs));
  if (f3(dz) !== '0') parts.push('Z' + f3(inc ? dz : to.z));
  return parts.join(' ');
}
export const lineCom = raw => (raw.match(/;.*$/) || [''])[0];

/**
 * Přepíše řádky s PU/L na obyčejné souřadnice (X, Z) – CAD parser PU nezná.
 * @returns {{code: string, converted: number}}
 */
export function polarToXZ(code, opts = {}) {
  const an = analyzeDrawCode(code, opts);
  const lines = code.split('\n');
  let converted = 0;
  for (const mv of an.moves) {
    const raw = lines[mv.line], c = codePart(raw);
    if (!POLAR_RE.test(c) || mv.polarErr) continue;
    const gs = (c.match(/\bG\s*\d+/g) || []).map(g => g.replace(/\s+/g, ''));
    if (!gs.some(g => /^G0*[0-3]$/.test(g))) gs.push('G1');   // PU bez G = G1 (po G0 by jinak zůstal rychloposuv)
    const n = (raw.match(/^\s*N\d+\s*/i) || [''])[0];
    const com = lineCom(raw);
    const ax = axesText(mv.from, mv.to, an.xs, mv.mode === 91);
    lines[mv.line] = (n + [...gs, ax].filter(Boolean).join(' ')).trim() + (com ? ' ' + com : '');
    converted++;
  }
  return { code: lines.join('\n'), converted };
}

/**
 * Přepíše tečné oblouky (G2/G3 … T) na obyčejný zápis X Z I K se správným G2/G3 –
 * CAD parser T nezná. Střed dopočte analýza (viz tangentArc).
 * @returns {{code: string, converted: number}}
 */
export function tangentToIK(code, opts = {}) {
  const an = analyzeDrawCode(code, opts);
  const lines = code.split('\n');
  let converted = 0;
  for (const mv of an.moves) {
    if (!mv.tangent || !mv.arc || mv.arc.err) continue;
    const raw = lines[mv.line], c = codePart(raw);
    const n = (raw.match(/^\s*N\d+\s*/i) || [''])[0];
    const com = lineCom(raw);
    const g = mv.arc.ccw !== !!opts.flip ? 'G3' : 'G2';
    const inc = mv.mode === 91, xs = an.xs;
    // Ostatní slova řádku (F, M…) zůstanou; mizí G2/G3, X, Z, I, K, R, CR a samotné T.
    const rest = c.replace(/\bG\s*0*[23](?!\d)/g, ' ').replace(/(?:^|\s)T(?=\s|$)/g, ' ')
      .replace(/(?<![A-Z])(?:X|Z|I|K|R|CR)\s*=?\s*[-+]?(?:\d+\.?\d*|\.\d+)/g, ' ').replace(/\s+/g, ' ').trim();
    const x = f3(inc ? (mv.to.x - mv.from.x) * xs : mv.to.x * xs), z = f3(inc ? mv.to.z - mv.from.z : mv.to.z);
    const ik = `I${f3((mv.arc.cx - mv.from.x) * xs)} K${f3(mv.arc.cz - mv.from.z)}`;
    lines[mv.line] = (n + [g, rest, `X${x}`, `Z${z}`, ik].filter(Boolean).join(' ')).trim() + (com ? ' ' + com : '');
    converted++;
  }
  return { code: lines.join('\n'), converted };
}
