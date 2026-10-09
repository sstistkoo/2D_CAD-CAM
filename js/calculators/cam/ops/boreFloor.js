// ╔══════════════════════════════════════════════════════════════╗
// ║  VYVRTÁVÁNÍ — DNO DÍRY ČELNĚ (od osy ven)                      ║
// ╚══════════════════════════════════════════════════════════════╝
// Navazuje na vyvrtávání z plného (ops/borePreDrill.js): podélná tyč vezme
// stěnu jen do hloubky plného ⌀ předvrtání (`Lcut`), pod ní zůstane prstenec
// dna a kužel po špičce vrtáku (`boreBottomLeft`). Tahle fáze je dobere
// ČELNĚ — vrstva po vrstvě od osy ven ke stěně, týmž nožem (vyvrtávací tyčí).
//
// IZOLACE (rozhodnutí uživatele 9. 10. 2026: „nechci aby se to jakkoliv
// ovlivňovalo s jinými plátky a s jinými drahami"): vlastní soubor, spouští
// se JEN z emitBore, když (a) je to vyvrtávání z plného s kuželem špičky
// (`borePreTip > 0`, tedy `boreBottomLeft` ≠ null) a (b) nástroj je vyvrtávací
// tyč (`canBore`). Vnější obrábění, vrtání, závity, vyvrtávání s ručním
// předvrtáním ani žádný jiný plátek tudy neprojdou. Sdílený generátor se
// volá jen přes zrcadlový svět této fáze (parametry se mění na KOPII).
//
// FYZIKA (změřeno 9. 10. 2026, tyč BCL S16: profil z 0 = špička, těleso tyče
// leží 1,3 mm nad špičkou ve směru k ústí a 2,6–18,6 mm od špičky k ose):
//   • vrstvy po vrstvě shora dolů, tloušťka ≤ mezera mezi špičkou a spodkem
//     tělesa tyče (−0,2) — tělo je pak nad vrstvou ve vzduchu;
//   • střed: tělo tyče sahá při špičce poblíž osy za osu na protější stranu
//     díry; tam už je materiál odebraný dřívějšími vrstvami (točí se kolem
//     osy), nad vrstvou nestojí nic — proto tloušťka vrstvy ≤ mezera;
//   • hlídání držáku/destičky vnějšího čelního hrubování (ops/face/*Guard)
//     modeluje jen polovinu zrcadla a kužel by zkrátil všechny průchody na
//     ~⅓ — u této fáze se vypíná (`respectInsertGeometry:false` na kopii
//     parametrů) a nahrazuje ho pravidlo tloušťky vrstvy výš.
// Zrcadlo (pravidlo 13): x' = R_ref − r, osa dílu = x' R_ref. Čelní hrubování
// v zrcadle jede x' dolů = ve skutečnosti od osy ven.

import { buildControlTailLines } from '../controlDialect.js';
import { holderProfileLoop } from '../collisionValidator.js';
import { boreMirrorState, boreBottomLeft, boreFits, unmirrorBoreLine, chainMirrorContour } from './bore.js';

const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
/** Rezerva mezi tělesem tyče a ještě neodebraným materiálem [mm]. */
const BODY_MARGIN = 0.2;
/** Nejmenší tloušťka vrstvy, pod kterou už se fáze nevyplatí [mm]. */
const MIN_LAYER = 0.3;

/** Mezera od špičky ke spodku tělesa tyče ve směru k ústí [mm] (profil x). */
export function boreBodyGap(prms) {
  const xs = (holderProfileLoop(prms) || []).map(p => p.x).filter(Number.isFinite);
  return xs.length ? Math.max(0, Math.min(...xs)) : 0;
}

/** Tloušťka vrstvy dna: zadané ap, nejvýš mezera tělesa tyče − rezerva. */
export function boreFloorLayer(prms) {
  return Math.min(Math.max(num(prms.depthOfCut, 2), MIN_LAYER), Math.max(MIN_LAYER, boreBodyGap(prms) - BODY_MARGIN));
}

/**
 * Tloušťka vrstvy tak, aby mřížka vrstev dosedla PŘESNĚ na dno (offset dna =
 * dno + přídavek Z + rε): `span` = výška materiálu nad ním. Jinak by poslední
 * vrstva skončila o zbytek výš — a nic další tu dno nedokončí.
 */
function evenLayer(span, hmax) {
  if (!(span > 0)) return hmax;
  const n = Math.max(1, Math.ceil(span / hmax - 1e-9));
  return (span / n) * (1 - 1e-6);
}

/**
 * Zrcadlový svět fáze „dno": polotovar = zbytek po podélném vyvrtání
 * (prstenec od stěny po `Lcut`, kužel po špičce, materiál pod dnem), kontura
 * = celá díra včetně dna až za osu. Souřadnice jsou zrcadlové (x' = R_ref − r).
 * @returns {{g, S3}|{g, S3:null, reason:string}} S3 null = fáze není potřeba/nejde
 */
export function boreFloorState(S) {
  const { g, S2 } = boreMirrorState(S);
  if (!S2 || !boreBottomLeft(g)) return { g, S3: null };
  const { k, s, zF, L, L0, Lcut, tipL, r0, rRef, clrX } = g;
  const X = (rr) => +(k * (rRef - rr)).toFixed(6);
  const z = (zz) => s * zz;                                     // skutečné Z → zrcadlové
  // Kontura: celá díra (až k ose) a za osu o 3,5 mm — jako u podélné fáze,
  // jen bez falešného dna.
  const zFl = z(zF - L), zRingZ = z(zF - Lcut), zBelow = zFl - 5;
  let full;
  if (g.chain) {
    // Konec kontury musí ležet v ose (dno k ose) — jinak není co čelně brát.
    if (g.chain[g.chain.length - 1].p2.x > 0.01) return { g, S3: null, reason: 'Dno díry nedojíždí do osy (prstenec) — čelní dobrání dna je zatím jen pro dno k ose.' };
    full = chainMirrorContour({ ...g, Lcut: L, r0: clrX - 3 });
  } else {
    const zIn = z(zF) + Math.max(0, g.clrZ) + 2;
    full = [[zIn, X(g.r)], [zFl, X(g.r)], [zFl, X(-3.5)], [zFl - 8, X(-3.5)]].map(([zz, x]) => ({ type: 'G1', x, z: zz, r: 0 }));
  }
  // Polotovar = zbytek po podélném vyvrtání, vše POD prstencem (Lcut): prstenec
  // dna, kužel po špičce, materiál pod dnem. Nad prstencem žádný polotovar není
  // (stěnu díry tam už vzala podélná fáze), takže plánovač nezačíná vrstvy ve
  // vzduchu a nevyrábí materiál v pásu vůle podél stěny.
  const stock = [
    [zRingZ, 0], [zRingZ, X(r0)], [z(zF - L0), X(r0)], [z(zF - L0 - tipL), X(0)],
    [zBelow, X(0)], [zBelow, 0], [zRingZ, 0],
  ].map(([zz, x]) => ({ type: 'G1', x, z: zz, r: 0 }));
  const tag = (pts) => pts.map((p, i) => ({ id: i + 1, mode: 'ABS', r: 0, ...p, type: i ? p.type : 'G0' }));
  const params = {
    ...S2.params,
    stockMode: 'casting', roughingStrategy: 'face',
    // Hlídání držáku/destičky zrcadlového čelního hrubování nahrazuje tloušťka vrstvy.
    respectInsertGeometry: false,
    // Stěnu díry už dokončila podélná fáze; čelní fáze dno nedokončuje (dokončení
    // by znovu jelo stěnou od čela dolů).
    doFinishing: false,
    depthOfCut: evenLayer(Math.max(...stock.map(p => p.z)) - (zFl + num(S.params.allowanceZ, 0) + num(S.params.toolRadius, 0)), boreFloorLayer(S.params)),
  };
  const S3 = {
    ...S2, params, contourPoints: tag(full), stockPoints: tag(stock), genNotes: [], errors: [],
    // Strop X max = osa (R_ref): za osou se neřeže (nástroj tam smí jen jet).
    xLimits: { rangeXMin: null, rangeXMax: X(0), active: false, minActive: false, maxActive: true },
  };
  return { g, S3 };
}

/**
 * Tělo čelní fáze ve SKUTEČNÉM světě (řádky s `simIdx`), nebo null.
 * @param ctx  { S, warn, computeCalculation, generateAutoGCode }
 */
export function boreFloorBody({ S, warn, computeCalculation, generateAutoGCode }) {
  const { g, S3, reason } = boreFloorState(S);
  if (!S3) { if (reason) warn(`Vyvrtávání: ${reason}`); return null; }
  const inner = generateAutoGCode(S3, computeCalculation(S3));
  for (const e of [...(S3.errors || []), ...(S3.genNotes || [])]) {
    if (e && e.msg && !/^Rozsah (obrábění|X max)/.test(e.msg)) warn(`Vyvrtávání (dno): ${e.msg}`);
  }
  const start = inner.findIndex(l => l.simIdx === 0);
  if (start < 0) return null;
  const tail0 = buildControlTailLines(S.params.controlSystem)[0];
  let end = inner.findIndex((l, i) => i > start && l.text.replace(/^N\d+\s+/, '') === tail0);
  if (end < 0) end = inner.length;
  const kRef = g.k * g.rRef;
  const body = inner.slice(start, end).map(l => ({ ...l, text: unmirrorBoreLine(l.text, kRef, g.s) }));
  // Pravidlo 13: v hotové díře je protější stěna na poloměru díry (ne předvrtání).
  let x = null, bad = null;
  for (const l of body) {
    if (l.simIdx === null || l.simIdx === undefined) continue;
    const mx = l.text.split(/[;(]/)[0].match(/X(-?\d*\.?\d+)/);
    if (mx) x = parseFloat(mx[1]);
    if (x !== null && !boreFits(x / g.k, g.reach, g.r)) { bad = x; break; }
  }
  if (bad !== null) { warn('Vyvrtávání (dno): tyč by se při čelním dobrání dna nevešla do díry (pravidlo 13).'); return null; }
  return { body, g };
}

/** Značka fáze „dno" v programu (komentář před jejím tělem). */
export const FLOOR_MARK = 'DNO DIRY';

/**
 * Kde v dráze simulace začíná čelní dobrání dna: první bod za značkou fáze.
 * @returns {number|null} null = program fázi „dno" nemá
 */
export function boreFloorSplitIndex(simPath, code) {
  if (!Array.isArray(simPath) || !code) return null;
  const mark = code.split('\n').findIndex(l => l.includes(`--- ${FLOOR_MARK}`));
  if (mark < 0) return null;
  const i = simPath.findIndex(p => p && Number.isInteger(p.originalLineIdx) && p.originalLineIdx > mark);
  return i > 0 ? i : null;
}

/**
 * Simulace fáze „dno" v jejím zrcadlovém světě (úběr, validátor): totéž co
 * `boreMirrorSim` pro podélnou fázi, jen nad polotovarem po vyvrtání.
 * @param simPath  část dráhy simulace od začátku fáze „dno"
 * @returns {{g, params, calcM:{simPath, stockPathSegments, contourSegments}, un:(loops)=>loops}|null}
 */
export function boreFloorSim(S, simPath, computeCalculation) {
  const { g, S3 } = boreFloorState(S);
  if (!S3 || !Array.isArray(simPath)) return null;
  const calc3 = computeCalculation(S3);
  const flip = (pts) => pts.map(q => ({ ...q, x: g.rRef - q.x, z: g.s * q.z }));
  return {
    g, params: S3.params, un: (loops) => loops.map(flip),
    calcM: { simPath: flip(simPath), stockPathSegments: calc3.stockPathSegments, contourSegments: calc3.contourSegments },
  };
}
