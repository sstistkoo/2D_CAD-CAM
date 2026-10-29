// CNC Editor – dialog ⌒ Oblouk, tečné napojení: maticová kontrola geometrie.
// Pro každou kombinaci (předchozí prvek × režim stroje × způsob zadání) ověří,
// že nový oblouk OPRAVDU navazuje tečně (směr na konci předchozího = směr na
// začátku nového), má zadané R / úhel a že přenos do výkresu (T → I/K → CAD
// parser) dá tentýž oblouk.
import { describe, it, expect } from 'vitest';
import { arcContext, previewArc } from '../js/calculators/cncArcTools.js';
import { analyzeDrawCode, tangentAt, tangentToIK, polarToXZ } from '../js/calculators/cncDrawTools.js';
import { parseGcodeToObjects } from '../js/storage/gcodeParse.js';
import { state } from '../js/state.js';

const PREV = {
  'úsečka −Z': 'G90 G00 X0 Z0\nG01 X0 Z-20',
  'úsečka šikmo': 'G90 G00 X0 Z0\nG01 X10 Z-10',
  'úsečka +X (čelo)': 'G90 G00 X0 Z0\nG01 X15 Z0',
  'úsečka −X': 'G90 G00 X30 Z0\nG01 X10 Z0',
  'oblouk G3 R': 'G90 G00 X0 Z0\nG01 X0 Z-10\nG03 X10 Z-20 R10',
  'oblouk G2 R': 'G90 G00 X0 Z0\nG01 X0 Z-10\nG02 X10 Z-20 R10',
  'oblouk G2 I/K': 'G90 G00 X0 Z0\nG01 X0 Z-10\nG02 X0 Z-20 I0 K-5',   // X0 → platí v poloměru i průměru
  'oblouk G3 velký (R−)': 'G90 G00 X0 Z0\nG01 X0 Z-10\nG03 X10 Z-20 R-10',
  'tečný oblouk T (řetěz)': 'G90 G00 X0 Z0\nG01 X0 Z-10\nG03 X10 Z-20 T',
  'oblouk v G91': 'G90 G00 X0 Z0\nG91\nG01 Z-10\nG03 X10 Z-10 R10',
  'polární úsečka PU': 'G90 G00 X0 Z0\nG01 PU150 L10',
};
const MODES = [];
for (const diam of [false, true]) for (const karusel of [false, true]) for (const flip of [false, true]) MODES.push({ diam, karusel, flip });
const modeName = (o) => `${o.diam ? 'průměr' : 'poloměr'}/${o.karusel ? 'karusel' : 'soustruh'}${o.flip ? '/zrcadlo' : ''}`;

const lastMove = (an) => an.moves[an.moves.length - 1];

/** Ověří tečnost a vrátí nový pohyb. */
function checkTangent(code, line, opts) {
  const an = analyzeDrawCode(`${code}\n${line}`, opts);
  const mv = lastMove(an);
  const prev = an.moves[an.moves.length - 2];
  expect(mv.arc && mv.arc.err, `chyba analýzy: ${mv.arc && mv.arc.err}`).toBeFalsy();
  expect(mv.arc.warn, `varování smyslu: ${mv.arc.warn}`).toBeFalsy();
  const t1 = tangentAt(prev, true, an);
  const t2 = tangentAt(mv, false, an);
  expect(t1 && t2).toBeTruthy();
  expect(t1.z * t2.z + t1.x * t2.x).toBeCloseTo(1, 5);   // stejný směr, ne opačný
  return { an, mv };
}

/** Přenos do výkresu stejnou cestou jako editor (PU → X Z, T → I K) a CAD parser:
 *  stejný oblouk. Tolerance 0,005 mm – I/K se zapisují zaokrouhlené na 3 místa. */
function checkTransfer(code, line, opts, mv) {
  const conv = tangentToIK(polarToXZ(`${code}\n${line}`, opts).code, opts).code;
  const an2 = analyzeDrawCode(conv, opts);
  const mv2 = lastMove(an2);
  expect(mv2.arc.err).toBeFalsy();
  expect(mv2.arc.cx).toBeCloseTo(mv.arc.cx, 2);
  expect(mv2.arc.cz).toBeCloseTo(mv.arc.cz, 2);
  state.machineType = opts.karusel ? 'karusel' : 'soustruh';
  state.xDisplayMode = opts.diam ? 'diameter' : 'radius';
  state.flipX = opts.flip; state.flipZ = false;
  const { objs } = parseGcodeToObjects(conv);
  const arc = objs.filter((o) => o.type === 'arc').pop();
  const wc = opts.karusel ? { x: mv.arc.cx, y: mv.arc.cz } : { x: mv.arc.cz, y: mv.arc.cx };
  expect(arc.r).toBeCloseTo(mv.arc.r, 2);
  expect(arc.cx).toBeCloseTo(wc.x, 2);
  expect(arc.cy).toBeCloseTo(wc.y, 2);
}

describe('tečné napojení ⌒ Oblouk – matice', () => {
  for (const opts of MODES) {
    for (const [name, code] of Object.entries(PREV)) {
      it(`${modeName(opts)} · za: ${name}`, () => {
        const ctx = arcContext(code, code.split('\n').length - 1, opts);
        expect(ctx.tangentOk, ctx.why).toBe(true);
        const base = { tangent: true, X: null, Z: null, R: null, sweep: null };
        for (const g of [2, 3]) {
          for (const sweep of [30, 90, 200]) {
            // 1) R + úhel rozevření → konec dopočten
            const a = previewArc(ctx, { ...base, g, R: 5, sweep });
            expect(a.err, a.err).toBeUndefined();
            expect(a.line.startsWith(`G${g} `)).toBe(true);
            const { mv } = checkTangent(code, a.line, opts);
            expect(mv.arc.r).toBeCloseTo(5, 2);
            expect(mv.arc.sweep * 180 / Math.PI).toBeCloseTo(sweep, 1);
            checkTransfer(code, a.line, opts, mv);

            // 2) tentýž konec jako X+Z → stejný oblouk, smysl se určí sám
            for (const gg of [2, 3]) {
              const b = previewArc(ctx, { ...base, g: gg, X: a.info.end.x, Z: a.info.end.z });
              expect(b.err, b.err).toBeUndefined();
              expect(b.g).toBe(a.g);
              const r2 = checkTangent(code, b.line, opts).mv;
              expect(r2.arc.r).toBeCloseTo(5, 2);
            }

            // 3) R + jedna souřadnice (X konce) → tečný oblouk R5 (první průsečík)
            const c = previewArc(ctx, { ...base, g, R: 5, X: a.info.end.x });
            if (!c.err) {
              const r3 = checkTangent(code, c.line, opts).mv;
              expect(r3.arc.r).toBeCloseTo(5, 2);
              checkTransfer(code, c.line, opts, r3);
            } else {
              expect(c.err).toMatch(/nedosáhne/);
            }
          }
        }
      });
    }
  }
});

describe('I = poloměr i v průměrovém režimu', () => {
  const diam = { diam: true, karusel: false, flip: false };
  it('editor: I5 posune střed o 5 mm v poloměru (X20 → X40 = půlkruh R5)', () => {
    const mv = lastMove(analyzeDrawCode('G90 G00 X20 Z0\nG02 X40 Z0 I5 K0', diam));
    expect(mv.arc.err).toBeFalsy();
    expect(mv.arc.cx).toBeCloseTo(15, 9);
    expect(mv.arc.r).toBeCloseTo(5, 9);
  });
  it('T → I/K zapíše I v poloměru', () => {
    const conv = tangentToIK('G90 G00 X0 Z0\nG01 X20 Z0\nG03 X40 Z-10 T', diam).code;
    const i = Number(conv.match(/ I(-?[\d.]+)/)[1]);
    const mv = lastMove(analyzeDrawCode('G90 G00 X0 Z0\nG01 X20 Z0\nG03 X40 Z-10 T', diam));
    expect(i).toBeCloseTo(mv.arc.cx - 10, 3);    // start na poloměru 10
  });
});

describe('kdy tečné napojení není', () => {
  const opts = { diam: false, karusel: false, flip: false };
  const ctx = (code) => arcContext(code, code.split('\n').length - 1, opts);
  it('na začátku, za G0, za nulovou úsečkou, za chybným obloukem', () => {
    expect(ctx('').tangentOk).toBe(false);
    expect(ctx('G90 G00 X0 Z0').tangentOk).toBe(false);
    expect(ctx('G90 G00 X0 Z0\nG01 X0 Z0').why).toMatch(/nemá směr|úsečka ani oblouk/);
    expect(ctx('G90 G00 X0 Z0\nG01 X0 Z0').tangentOk).toBe(false);
    expect(ctx('G90 G00 X0 Z0\nG02 X10 Z-20 R2').tangentOk).toBe(false);   // R moc malé
  });
  it('kurzor pod komentářem / prázdným řádkem se bere poslední pohyb před ním', () => {
    const c = ctx('G90 G00 X0 Z0\nG01 X0 Z-20\n; poznámka\n');
    expect(c.tangentOk).toBe(true);
    expect(c.prevLine).toBe(1);
  });
  it('konec na tečně (přímka místo oblouku) se ohlásí', () => {
    const c = ctx('G90 G00 X0 Z0\nG01 X0 Z-20');
    const r = previewArc(c, { g: 2, tangent: true, X: 0, Z: -40, R: null, sweep: null });
    expect(r.err).toMatch(/na tečně/);
  });
});
