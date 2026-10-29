// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – CNC Editor: výpočet oblouku pro dialog ⌒ Oblouk       ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Dialog (cncArcModal.js) sestaví z údajů řádek `G2/G3 …`, nechá ho projít
// stejnou analýzou, kterou editor používá pro náhled a kontroly
// (`analyzeDrawCode`), a převezme z ní střed, poloměr, úhel i chybu. Geometrii
// tak nepočítáme dvakrát – zrcadlení os, karusel i G91 řeší analýza.
//
// Kombinace údajů (vše ostatní vrací srozumitelné „chybí údaj"):
//   netečně:  konec X+Z + R           → G2/G3 X Z R   (velký oblouk = záporné R)
//             konec X+Z + úhel        → R = tětiva / (2·sin(úhel/2))
//   tečně:    konec X+Z               → G2/G3 X Z T   (smysl určí napojení)
//             R + X nebo Z            → G2/G3 X|Z R T
//             R + úhel rozevření      → konec se dopočte, G2/G3 X Z T
// Čisté funkce bez DOM – testy v tests/cnc-arc-tools.test.js.

import { analyzeDrawCode, moveAtOrBefore, moveDirDeg, modeAtLine, f3 } from './cncDrawTools.js';

const RAD = Math.PI / 180;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Je řádek `idx` uvnitř bloku polotovaru (STOCK_START … STOCK_END)? */
function inStockAt(lines, idx) {
  let stock = false;
  for (let i = 0; i <= idx && i < lines.length; i++) {
    if (/STOCK_START/i.test(lines[i])) stock = true;
    else if (/STOCK_END/i.test(lines[i])) stock = false;
  }
  return stock;
}

/**
 * Kde oblouk začíná a zda na něco jde tečně navázat (stejná pravidla jako
 * „Úsečka úhlem": jen za G1 / obloukem ve stejné části kódu, ne za G0).
 * @param {string} code celý text editoru
 * @param {number} idx řádek, za který se oblouk vloží (řádek s kurzorem)
 * @param {{diam?: boolean, karusel?: boolean, flip?: boolean}} opts
 */
export function arcContext(code, idx, opts) {
  const lines = code.split('\n');
  const head = lines.slice(0, idx + 1).join('\n');
  const an = analyzeDrawCode(head, opts);
  let p = moveAtOrBefore(an, idx);
  if (p && !!p.stock !== inStockAt(lines, idx)) p = null;
  let prevDir = null;
  let why = '';
  if (!p) why = 'předchozí úsečka ani oblouk tu není';
  else if (p.g === 0) why = 'předchozí je rychloposuv G0 (start)';
  else {
    prevDir = moveDirDeg(p, an);
    if (prevDir === null) why = 'předchozí pohyb nemá směr';
  }
  return {
    head, idx, opts, xs: an.xs,
    from: p ? p.to : { z: 0, x: 0 },
    prevLine: p ? p.line : null,
    prevDir, tangentOk: prevDir !== null, why,
    incr: modeAtLine(code, idx) === 91,
  };
}

/**
 * Konec tečného oblouku z poloměru a úhlu rozevření (ve fyzické rovině Z, poloměr).
 * Stejná konstrukce jako `tangentArc` v cncDrawTools.js: střed leží na kolmici
 * ke směru předchozího pohybu, na straně podle G2/G3 (u karuselu zrcadlově).
 */
export function tangentSweepEnd(from, dirDeg, R, sweepDeg, ccw, kar) {
  const a = dirDeg * RAD;
  const d = { z: Math.cos(a), x: Math.sin(a) };
  const n = { z: -d.x, x: d.z };
  const left = ccw !== kar;
  const sg = left ? R : -R;
  const C = { z: from.z + sg * n.z, x: from.x + sg * n.x };
  const th = Math.atan2(from.x - C.x, from.z - C.z) + (left ? 1 : -1) * sweepDeg * RAD;
  return { z: C.z + R * Math.cos(th), x: C.x + R * Math.sin(th) };
}

/**
 * @param {ReturnType<typeof arcContext>} ctx
 * @param {{g: 2|3, tangent: boolean, X: number|null, Z: number|null, R: number|null,
 *          sweep: number|null, big?: boolean}} spec
 *   X je v jednotkách kódu (průměr u diametrálního režimu), Z a R v mm, sweep ve stupních.
 * @returns {{err: string} | {line: string, g: 2|3, comment: string, info: object}}
 */
export function previewArc(ctx, spec) {
  const { from, xs, incr, opts } = ctx;
  const { X, Z, R, sweep: A } = spec;
  const hasX = isNum(X), hasZ = isNum(Z), hasR = isNum(R), hasA = isNum(A);
  if (hasR && R <= 0) return { err: 'R musí být kladné (velký oblouk zaškrtni níže).' };
  if (hasA && !(A > 0 && A < 360)) return { err: 'Úhel rozevření musí být mezi 0° a 360°.' };

  let g = spec.g;
  const sx = (v) => f3(incr ? v - from.x * xs : v);   // v G91 se zapisují přírůstky
  const sz = (v) => f3(incr ? v - from.z : v);
  let parts;
  let autoDir = false;
  let usedR = R;

  if (!spec.tangent) {
    if (!hasX || !hasZ) return { err: 'Zadej konec oblouku X i Z.' };
    if (hasR === hasA) return { err: hasR ? 'Zadej R, nebo úhel rozevření – ne obojí.' : 'Zadej R, nebo úhel rozevření.' };
    const chord = Math.hypot(Z - from.z, X / xs - from.x);
    if (chord < 1e-6) return { err: 'Konec je stejný bod jako začátek oblouku.' };
    let big = !!spec.big;
    if (hasA) {
      // Zaokrouhleno NAHORU, aby R po zápisu na 3 místa nespadlo pod půlku tětivy.
      usedR = Math.ceil(chord / (2 * Math.sin(A * RAD / 2)) * 1000 - 1e-9) / 1000;
      big = A > 180;
    }
    parts = [`X${sx(X)}`, `Z${sz(Z)}`, `R${f3(big ? -usedR : usedR)}`];
  } else {
    if (!ctx.tangentOk) return { err: `Tečně nejde: ${ctx.why}.` };
    if (hasX && hasZ) {
      if (hasR || hasA) return { err: 'Tečně: s koncem X+Z už R ani úhel nezadávej.' };
      parts = [`X${sx(X)}`, `Z${sz(Z)}`, 'T'];
      autoDir = true;
    } else if (hasR && hasX !== hasZ) {
      if (hasA) return { err: 'Tečně: R + souřadnice už úhel nepotřebuje.' };
      parts = [hasX ? `X${sx(X)}` : `Z${sz(Z)}`, `R${f3(R)}`, 'T'];
    } else if (hasR && hasA && !hasX && !hasZ) {
      const ccw = (g === 3) !== !!opts.flip;
      const end = tangentSweepEnd(from, ctx.prevDir, R, A, ccw, !!opts.karusel);
      parts = [`X${sx(end.x * xs)}`, `Z${sz(end.z)}`, 'T'];
    } else {
      return { err: 'Tečně zadej: konec X+Z, nebo R + X či Z, nebo R + úhel rozevření.' };
    }
  }

  const run = (gg) => {
    const line = `G${gg} ${parts.join(' ')}`;
    const an = analyzeDrawCode(`${ctx.head}\n${line}`, opts);
    return { line, mv: an.byLine.get(ctx.idx + 1) };
  };
  let res = run(g);
  // Tečna + konec: smysl oblouku je dán geometrií, ne volbou G2/G3 → opravit.
  if (autoDir && res.mv && res.mv.arc && res.mv.arc.warn) {
    g = res.mv.arc.ccw !== !!opts.flip ? 3 : 2;
    res = run(g);
  }
  const { line, mv } = res;
  if (!mv || !mv.arc) return { err: 'Řádek se nepodařilo vyhodnotit.' };
  if (mv.arc.err) return { err: mv.arc.err.replace(/^(Oblouk|T): /, '') };

  const sweepDeg = mv.arc.sweep / RAD;
  const r = mv.arc.r;
  return {
    line, g,
    comment: `⌒ R${f3(r)} ∠${f3(sweepDeg)}°${spec.tangent ? ' tečně' : ''}`,
    info: { r, sweepDeg, end: { x: mv.to.x * xs, z: mv.to.z }, autoDir },
  };
}
