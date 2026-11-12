// ╔══════════════════════════════════════════════════════════════╗
// ║  Nezávislý interpret NC programu (jen pro testy)              ║
// ╚══════════════════════════════════════════════════════════════╝
// Čte vygenerovaný program tak, jak by ho četl STROJ, a NESDÍLÍ kód s aplikací
// (žádné getArcParams, žádný parseManualGCodeToPath). Smysl: simulace, kolizní
// testy i generátor počítají střed oblouku stejnou funkcí — když se v ní
// spletou, spletou se všichni stejně a nic nespadne. Tenhle interpret je druhý,
// nezávislý názor (test `cam-nc-roundtrip.test.js`).
//
// Konvence (rovina G18, pohled Z doprava, X nahoru = výkres SKICA):
//   • G2 = po směru hodin v pohledu stroje, G3 = proti. Stroj „zespodu"
//     (flipX: X+ dolů) nebo s otočenou Z (flipZ) má pohled zrcadlený, takže
//     ve výkresu je smysl opačný při lichém počtu překlopení.
//   • R / CR= > 0 = oblouk ≤ 180°, < 0 = oblouk > 180° (Sinumerik, Fanuc i
//     Heidenhain ISO shodně).
//   • X v průměru (DIAMON / diametrální režim) → poloměr = X/2; U = přírůstek X.
//   • Střed se tu volí podle ÚHLU OBLOUKU (krátký/dlouhý v daném smyslu), ne
//     vzorcem kolmice — schválně jiná cesta než getArcParams.

const TAU = 2 * Math.PI;

/** Úhel bodu kolem středu ve výkresu (z doprava, x nahoru), 0..2π. */
function ang(c, p) {
  const a = Math.atan2(p.x - c.x, p.z - c.z);
  return a < 0 ? a + TAU : a;
}

/** Úhel, který opíše oblouk z a do b daným smyslem (cw = po směru hodin ve výkresu). */
function sweep(c, a, b, cw) {
  const d = ang(c, b) - ang(c, a);
  const ccw = ((d % TAU) + TAU) % TAU;          // proti směru hodin
  return cw ? (ccw === 0 ? 0 : TAU - ccw) : ccw;
}

/**
 * Střed oblouku z koncových bodů, |R| a smyslu.
 * @returns {{c:{x:number,z:number}, r:number, sweep:number, deficit:number}|null}
 *   deficit = o kolik je |R| MENŠÍ než polovina tětivy (> 0 = oblouk nejde sestrojit).
 */
export function arcCenter(p1, p2, R, cw) {
  const r = Math.abs(R), long = R < 0;
  const dz = p2.z - p1.z, dx = p2.x - p1.x, d = Math.hypot(dz, dx);
  if (d < 1e-9) return null;
  const deficit = d / 2 - r;
  const h = Math.sqrt(Math.max(0, r * r - d * d / 4));
  const m = { x: (p1.x + p2.x) / 2, z: (p1.z + p2.z) / 2 };
  const n = { x: dz / d, z: -dx / d };          // jednotková kolmice k tětivě
  const cands = [{ x: m.x + h * n.x, z: m.z + h * n.z }, { x: m.x - h * n.x, z: m.z - h * n.z }];
  const scored = cands.map((c) => ({ c, s: sweep(c, p1, p2, cw) }));
  // krátký oblouk = menší opsaný úhel, dlouhý = větší
  scored.sort((a, b) => a.s - b.s);
  const pick = long ? scored[1] : scored[0];
  return { c: pick.c, r: Math.max(r, d / 2), sweep: pick.s, deficit };
}

/** Bod na oblouku v poměru t ∈ [0,1] od začátku. */
export function arcPoint(arc, p1, cw, t) {
  const a0 = ang(arc.c, p1);
  const a = a0 + (cw ? -1 : 1) * arc.sweep * t;
  return { x: arc.c.x + arc.r * Math.sin(a), z: arc.c.z + arc.r * Math.cos(a) };
}

const num = (s) => parseFloat(s);
const word = (body, letter) => {
  // Adresa jako samostatné slovo: písmeno, za ním číslo (ne „CR=", „LIMS=", „DIAMON")
  const m = body.match(new RegExp(`(?:^|[\\s])${letter}(-?\\d*\\.?\\d+)(?=$|[\\s])`));
  return m ? num(m[1]) : null;
};

/**
 * Projde program a vrátí pohyby.
 * @param {string} text   program
 * @param {{dia:boolean, start:{x:number,z:number}, flipX?:boolean, flipZ?:boolean}} opt
 *   dia = X v průměru (výchozí režim; Sinumerik ho přepíná slovy DIAMON/DIAMOF),
 *   start = poloha před prvním blokem (poloměr, z).
 * @returns {{moves: object[], problems: string[]}} moves: {line, type, from, to, arc?}
 */
export function interpretNc(text, opt) {
  const flip = !!opt.flipX !== !!opt.flipZ;
  let dia = !!opt.dia;
  let pos = { ...opt.start };
  let modal = 'G0';
  const moves = [], problems = [];
  const lines = String(text).split('\n');
  lines.forEach((raw, idx) => {
    let body = raw.toUpperCase();
    body = body.replace(/"[^"]*"/g, ' ').replace(/\([^)]*\)/g, ' ');
    const sc = body.indexOf(';');
    if (sc >= 0) body = body.slice(0, sc);
    body = body.replace(/^\s*N\d+\s*/, ' ').trim();
    if (!body || body.startsWith('%')) return;
    body = ' ' + body.replace(/\s+/g, ' ') + ' ';
    if (/\sDIAMON\s/.test(body)) dia = true;
    if (/\sDIAMOF\s/.test(body)) dia = false;
    // Nájezd na referenční / pevný bod stroje: hodnoty os jsou výběr osy, ne cíl.
    if (/\sG(28|75|53)\s/.test(body)) return;
    const gs = [...body.matchAll(/\sG0*(\d+)(?=\s)/g)].map((m) => +m[1]);
    const motion = gs.filter((g) => g <= 3).pop();
    const thread = gs.some((g) => g === 32 || g === 33);
    if (gs.includes(4)) return;                 // prodleva
    if (motion != null) modal = 'G' + motion;
    const type = thread ? 'G1' : modal;
    const X = word(body, 'X'), Z = word(body, 'Z'), U = word(body, 'U'), W = word(body, 'W');
    if (X == null && Z == null && U == null && W == null) return;
    const xs = dia ? 0.5 : 1;
    const to = {
      x: X != null ? X * xs : U != null ? pos.x + U * xs : pos.x,
      z: Z != null ? Z : W != null ? pos.z + W : pos.z,
    };
    const mv = { line: idx, type, from: pos, to };
    if (type === 'G2' || type === 'G3') {
      const crm = body.match(/\sCR=(-?\d*\.?\d+)/);
      const R = crm ? num(crm[1]) : word(body, 'R');
      if (R == null) {
        problems.push(`ř. ${idx + 1}: oblouk bez R/CR= (I/K interpret nezná): ${raw.trim()}`);
      } else {
        const cw = (type === 'G2') !== flip;
        const arc = arcCenter(pos, to, R, cw);
        if (arc) mv.arc = { ...arc, cw, R };
      }
    }
    moves.push(mv);
    pos = to;
  });
  return { moves, problems };
}

// ── Kontroly (test cam-nc-roundtrip) ──────────────────────────────

/** Oblouk, který na stroji nejde sestrojit: |R| menší než půl tětivy o víc než tol.
 *  Sinumerik toleruje 0,01 mm (MD 21000 CIRCLE_ERROR_CONST), bereme polovinu. */
export const ARC_DEFICIT_TOL = 0.005;
/** Shoda poloh mezi interpretem a simulací / mezi řídicími systémy (mm). */
export const POS_TOL = 1e-3;

const lineOf = (text, i) => String(text).split('\n')[i]?.trim();

/**
 * Program × simulace aplikace (`parseManualGCodeToPath` → simPath).
 * Každý blok s pohybem: poslední bod simulace z toho řádku = cíl bloku; u oblouku
 * každý bod simulace leží na oblouku interpretu ve stejném poměru (simulace dělí
 * oblouk rovnoměrně po úhlu).
 * @returns {string[]} popisy neshod (prázdné = v pořádku)
 */
export function checkAgainstSim(text, simPath, interp) {
  const out = [...interp.problems];
  const byLine = new Map();
  for (const q of simPath) {
    if (q.originalLineIdx == null) continue;
    if (!byLine.has(q.originalLineIdx)) byLine.set(q.originalLineIdx, []);
    byLine.get(q.originalLineIdx).push(q);
  }
  const moved = new Set();
  for (const m of interp.moves) {
    moved.add(m.line);
    if (m.arc && m.arc.deficit > ARC_DEFICIT_TOL) {
      out.push(`ř. ${m.line + 1}: oblouk nejde sestrojit, |R| je o ${m.arc.deficit.toFixed(4)} mm menší než půl tětivy: ${lineOf(text, m.line)}`);
    }
    const pts = byLine.get(m.line);
    const len = Math.hypot(m.to.x - m.from.x, m.to.z - m.from.z);
    if (!pts) {
      if (len > POS_TOL) out.push(`ř. ${m.line + 1}: simulace blok nejede (pohyb ${len.toFixed(3)} mm): ${lineOf(text, m.line)}`);
      continue;
    }
    const last = pts[pts.length - 1];
    let err = Math.hypot(last.x - m.to.x, last.z - m.to.z);
    if (m.arc) {
      pts.forEach((q, j) => {
        const a = arcPoint(m.arc, m.from, m.arc.cw, (j + 1) / pts.length);
        err = Math.max(err, Math.hypot(q.x - a.x, q.z - a.z));
      });
    }
    if (err > POS_TOL) out.push(`ř. ${m.line + 1}: simulace jede jinudy než stroj (až ${err.toFixed(4)} mm): ${lineOf(text, m.line)}`);
  }
  // Simulace se pohnula na řádku, který stroj nebere jako pohyb.
  // (G28/G75/G53 = nájezd na referenční bod — simulace ho bere jako přejezd na
  // stejné místo, to je v pořádku, když se nikam nepohne.)
  let prev = simPath[0];
  for (const q of simPath) {
    if (q.originalLineIdx != null && !moved.has(q.originalLineIdx) && Math.hypot(q.x - prev.x, q.z - prev.z) > POS_TOL) {
      out.push(`ř. ${q.originalLineIdx + 1}: simulace se pohnula, stroj ne: ${lineOf(text, q.originalLineIdx)}`);
    }
    prev = q;
  }
  return out;
}

/**
 * Stejná dráha ve dvou programech (jiný řídicí systém, tentýž díl).
 * Porovnává jen pohyby (cíle, smysl a střed oblouků), ne text.
 * @returns {string[]} popisy neshod
 */
export function compareMoves(a, b, labelB) {
  const out = [];
  if (a.moves.length !== b.moves.length) out.push(`${labelB}: ${b.moves.length} pohybů místo ${a.moves.length}`);
  const n = Math.min(a.moves.length, b.moves.length);
  for (let i = 0; i < n && out.length < 10; i++) {
    const p = a.moves[i], q = b.moves[i];
    const d = Math.hypot(p.to.x - q.to.x, p.to.z - q.to.z);
    const arcDiff = !!p.arc !== !!q.arc
      || (p.arc && (p.arc.cw !== q.arc.cw || Math.hypot(p.arc.c.x - q.arc.c.x, p.arc.c.z - q.arc.c.z) > POS_TOL));
    if (d > POS_TOL || p.type !== q.type || arcDiff) {
      out.push(`${labelB}: pohyb ${i + 1} (ř. ${q.line + 1}) se liší: ${p.type} → (${p.to.x.toFixed(3)}, ${p.to.z.toFixed(3)}) vs ${q.type} → (${q.to.x.toFixed(3)}, ${q.to.z.toFixed(3)})`);
    }
  }
  return out;
}
