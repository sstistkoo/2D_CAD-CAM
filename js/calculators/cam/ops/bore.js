// ╔═════════════════════════╗
// ║  OPERACE: VYVRTÁVÁNÍ            ║
// ╚═════════════════════════╝
// Podélné hrubování díry vyvrtávací tyčí — pravidlo 13 (docs/cam-pravidla.md,
// schválil uživatel 7. 10. 2026): „Vnitřní obrábění je zrcadlo vnějšího
// v ose X. Platí pravidla 1–12 beze změny, jen ‚nahoru' znamená ‚k ose'
// a polotovar je předvrtaná díra. Tyč se musí vejít do díry."
//
// Samostatná operace s vlastním programem jako vrtání a závit: když je
// aktivní, generátor nedělá nic jiného.
//
// JAK: díra se překlopí kolem poloměru R_ref (r' = R_ref − r). Stěna díry
// je v zrcadle povrch hřídele, předvrtání válcový polotovar, osa obrobku
// „nahoře". Na takovém světě se spustí CELÝ obyčejný výpočet a emise
// vnějšího hrubování zprava (computeCalculation + generateAutoGCode —
// předané v ctx, ať tenhle modul neimportuje emitor zpátky) a z hotového
// programu se vezme tělo hrubování: X se překlopí zpátky (X = k·R_ref − X'),
// G2↔G3. Úseky, vrstvy po ap, držák, vjezdy, rychloposuvy — všechno je
// tentýž kód jako venku, žádná druhá (chudší) kopie. Obrys vyvrtávací tyče
// z 📚 katalogu je nakreslený přesně v tomhle zrcadle (isoInternalTools.js:
// +z profilu = od špičky k ose tyče = k ose obrobku).
//
// První verze (rozhodnutí uživatele 7. 10. 2026): jen podélné hrubování
// válcové díry ⌀D × délka L od Z čela, z předvrtání ⌀d0 × L0 (z operace
// Vrtání, nebo zadané), jen zprava. Tvar díry z CAD přijde zvlášť.

import { buildControlTailLines } from '../controlDialect.js';
import { stockClearances } from '../camMath.js';
import { holderProfileLoop } from '../collisionValidator.js';
import { buildInsertOutlineSegments } from '../insertPreview.js';
import { getInsert } from '../inserts/index.js';

const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
/** O kolik je R_ref nad stěnou díry — v zrcadle „osa" leží v dílu, mimo obrábění. */
const R_REF_MARGIN = 5;
/** Vůle mezi tyčí a protější stěnou díry, pod kterou se nejede [mm]. */
const WALL_GAP = 0.2;

/**
 * Geometrie vyvrtávání z parametrů (sdílí emise, UI i testy).
 * @returns {{ok:boolean, reason?:string, k:number, zF:number, D:number, L:number,
 *   d0:number, L0:number, r:number, r0:number, rRef:number, rIn:number, reach:number}}
 */
export function boreGeom(prms) {
  const k = prms.mode === 'DIAMON' ? 2 : 1;          // jednotky X v programu (průměr / poloměr)
  const zF = num(prms.boreZStart, 0);
  const D = Math.max(0, num(prms.boreDiameter, 0)), L = Math.max(0, num(prms.boreDepth, 0));
  const d0 = Math.max(0, num(prms.borePreDiameter, 0)), L0 = Math.max(0, num(prms.borePreDepth, 0));
  const r = D / 2, r0 = d0 / 2;
  const reach = boreToolReach(prms);
  // Rychloposuvy v díře: o vůli X od stěny předvrtání — tatáž vůle, o kterou
  // je venku plánovací obrys nad polotovarem (v zrcadle je to přesně on).
  const clr = stockClearances(prms);
  const clrX = Math.max(0.1, clr.x), clrZ = Math.max(0, clr.z);
  const rIn = r0 - clrX;
  const g = { ok: true, k, zF, D, L, d0, L0, r, r0, rRef: r + R_REF_MARGIN, rIn, clrX, clrZ, reach };
  const fail = (reason) => ({ ...g, ok: false, reason });
  if ((prms.roughingSide || 'right') === 'left') return fail('Vyvrtávání zatím jen zprava (do díry od pravého čela).');
  if (!getInsert(prms).canBore) return fail('Nástroj není vyvrtávací tyč (destička polygon nebo kulatá) — vyber ji ve 🔧 Zásobníku.');
  if (!(D > 0 && L > 0)) return fail('Zadej průměr a délku díry.');
  if (!(d0 > 0 && L0 > 0)) return fail('Zadej předvrtání (průměr a hloubku) — nebo ho převezmi z Vrtání.');
  if (!(D > d0 + 0.01)) return fail(`Díra ⌀${D} není větší než předvrtání ⌀${d0} — není co vyvrtat.`);
  if (L > L0 + 1e-6) return fail(`Díra (${L} mm) je hlubší než předvrtání (${L0} mm) — vyvrtávací tyč nevrtá do plného.`);
  // Pravidlo 13: tyč se musí vejít do díry už na vjezdu (nejblíž k ose).
  if (!boreFits(rIn, reach, r0)) {
    return fail(`Tyč se do díry nevejde (pravidlo 13): sahá ${reach.toFixed(1)} mm od špičky k ose, předvrtání ⌀${d0} — je potřeba větší předvrtání nebo tenčí tyč.`);
  }
  return g;
}

/** Jak daleko od špičky (středu nosu) k ose sahá nástroj — tyč i destička [mm]. */
export function boreToolReach(prms) {
  const zs = (holderProfileLoop(prms) || []).map(p => p.z);
  for (const s of buildInsertOutlineSegments(prms)) {
    if (s.type === 'circle') zs.push(s.cz + s.r);
    else if (s.type === 'arc') zs.push(s.cz + s.r, s.from.z, s.to.z);   // oblouk: shora odhad
    else if (s.from) zs.push(s.from.z, s.to.z);
  }
  return Math.max(0, ...zs.filter(Number.isFinite));
}

/** Vejde se tyč, když je špička na poloměru rTip? Protější stěna = předvrtání. */
export function boreFits(rTip, reach, r0) {
  return rTip - reach > -r0 + WALL_GAP;
}

/** Za dnem díry vede kontura o vůli X + tolik UVNITŘ předvrtání [mm]. */
const BEYOND_BOTTOM_IN = 0.5;
/** O kolik za pásmo vůle před čelem začíná stěna díry v zrcadle [mm]. */
const FRONT_EXT = 2;

/**
 * Kontura díry v zrcadle (body programu, od čela dovnitř): stěna díry už
 * PŘED čelem, dno díry, pak uvnitř předvrtání (za pásmem vůle) až za konec
 * polotovaru.
 * - Čelo dílu (mezikruží kolem díry) v zrcadle není: s malým rádiusem nosu
 *   (0,4) je pásmo vůle před čelem širší než odsazení čela a hloubky pod
 *   dnem díry by tam jezdily krátké průchody posuvem, které nic neuberou.
 * - Kdyby za dnem ležela na stěně předvrtání nebo v pásmu vůle (v zrcadle
 *   pod plánovacím obrysem = „materiál"), dojezd „bez schodků" by po ní jel
 *   posuvem vzduchem až na dno předvrtání.
 * - Kdyby skončila na dně (nebo šla až k ose), vrstvy by za dnem pokračovaly
 *   do konce polotovaru a „Výjezd nad konturu" by šel přes osu.
 */
export function boreMirrorContour(g) {
  const { k, zF, L, L0, r, r0, rRef, clrX, clrZ } = g;
  const X = (rr) => +(k * (rRef - rr)).toFixed(6);
  const rIn = r0 - clrX - BEYOND_BOTTOM_IN, zEnd = zF - L0 - 1;
  const zIn = zF + clrZ + FRONT_EXT;
  const pts = [[zIn, X(r)], [zF - L, X(r)], [zF - L, X(rIn)], [zEnd, X(rIn)]];
  return pts.map(([z, x], i) => ({ id: i + 1, type: i ? 'G1' : 'G0', x, z, r: 0, mode: 'ABS' }));
}

/** Parametry zrcadlového světa: válec = předvrtání, vnější hrubování zprava, nic jiného. */
export function boreMirrorParams(prms, g) {
  return {
    ...prms,
    boreActive: false, drillActive: false, threadActive: false, partOffZ: null,
    roughingStrategy: 'longitudinal', roughingSide: 'right', doFinishing: false, finishOnly: false,
    stockMode: 'cylinder', stockDiameter: 2 * (g.rRef - g.r0), stockFace: g.zF, stockLength: g.L0 - g.zF,
    safeX: +(g.k * (g.rRef - g.rIn)).toFixed(6),
  };
}

/** Řádek programu ze zrcadla zpět do skutečného světa: X = kRef − X', G2↔G3. */
export function unmirrorBoreLine(text, kRef) {
  const ci = text.search(/[;(]/);
  let code = ci < 0 ? text : text.slice(0, ci);
  const rest = ci < 0 ? '' : text.slice(ci);
  code = code.replace(/\bG0?([23])\b/g, (m, d) => m.replace(d, d === '2' ? '3' : '2'));
  code = code.replace(/X(-?\d*\.?\d+)/g, (_, v) => {
    const x = kRef - parseFloat(v);
    return 'X' + (Math.abs(x) < 5e-4 ? 0 : x).toFixed(3);
  });
  return code + rest;
}

/**
 * Zrcadlový svět pro výpočet drah i simulaci: { g, S2 } (S2 = null, když
 * geometrie nevyšla). Kontura díry, válec předvrtání, žádný rozsah 📐 ani
 * X max (patří vnější kontuře), žádné části programu.
 */
export function boreMirrorState(S) {
  const g = boreGeom(S.params);
  if (!g.ok) return { g, S2: null };
  const S2 = {
    params: boreMirrorParams(S.params, g), contourPoints: boreMirrorContour(g), stockPoints: [],
    zLimits: { ...S.zLimits, rangeActive: false }, xLimits: { rangeXMin: null, rangeXMax: null, active: false },
    guideLines: [], flipX: S.flipX, flipZ: S.flipZ, manualGCode: '', errors: [], genNotes: [],
    toolMagazine: S.toolMagazine,
  };
  return { g, S2 };
}

/**
 * Simulace vyvrtávání v ZRCADLE drah (úběr, validátor, kolize držáku, zajetí
 * do kontury počítají s vnějším nožem — v zrcadle je to pravda).
 * @returns {{g, params, calcM:{simPath, stockPathSegments, contourSegments}, un:(loops)=>loops}|null}
 *   calcM.simPath = skutečná simulovaná dráha překlopená do zrcadla; un()
 *   vrátí smyčky {x,z} (poloměr) zpátky do skutečného světa.
 */
export function boreMirrorSim(S, simPath, computeCalculation) {
  const { g, S2 } = boreMirrorState(S);
  if (!S2 || !Array.isArray(simPath)) return null;
  const calc2 = computeCalculation(S2);
  const flip = (pts) => pts.map(q => ({ ...q, x: g.rRef - q.x }));
  return {
    g, params: S2.params, un: (loops) => loops.map(flip),
    calcM: { simPath: flip(simPath), stockPathSegments: calc2.stockPathSegments, contourSegments: calc2.contourSegments },
  };
}

/**
 * @param ctx  { S, prms, lines, addCmt, addN, note, computeCalculation, generateAutoGCode }
 * @returns    hotové řádky programu
 */
export function emitBore(ctx) {
  const { S, prms, lines, addCmt, addN, note, computeCalculation, generateAutoGCode } = ctx;
  const { g, S2 } = boreMirrorState(S);
  const warn = (msg) => { if (S.genNotes) S.genNotes.push({ type: 'warning', msg }); };
  addCmt(`--- VYVRTAVANI ⌀${g.D} x ${g.L} z predvrtani ⌀${g.d0} x ${g.L0} (pravidlo 13: zrcadlo vnejsiho hrubovani) ---`);
  let body = null;
  if (!g.ok) {
    addCmt(`! ${g.reason}`);
    warn(`Vyvrtávání: ${g.reason}`);
  } else {
    const inner = generateAutoGCode(S2, computeCalculation(S2));
    for (const e of [...(S2.errors || []), ...(S2.genNotes || [])]) if (e && e.msg) warn(`Vyvrtávání: ${e.msg}`);
    // Tělo = od prvního pohybu (nájezd na bezpečný bod v díře) po závěr programu.
    const start = inner.findIndex(l => l.simIdx === 0);
    const tail0 = buildControlTailLines(prms.controlSystem)[0];
    let end = inner.findIndex((l, i) => i > start && l.text.replace(/^N\d+\s+/, '') === tail0);
    if (end < 0) end = inner.length;
    const kRef = g.k * g.rRef;
    body = start < 0 ? [] : inner.slice(start, end).map(l => ({ ...l, text: unmirrorBoreLine(l.text, kRef) }));
    // Pravidlo 13: v díře (Z pod čelem) tyč nesmí sáhnout na protější stěnu.
    let x = null, z = null, bad = null;
    for (const l of body) {
      if (l.simIdx === null || l.simIdx === undefined) continue;
      const code = l.text.split(/[;(]/)[0];
      const mx = code.match(/X(-?\d*\.?\d+)/), mz = code.match(/Z(-?\d*\.?\d+)/);
      if (mx) x = parseFloat(mx[1]);
      if (mz) z = parseFloat(mz[1]);
      if (x !== null && z !== null && z < g.zF - 1e-6 && !boreFits(x / g.k, g.reach, g.r0)) { bad = { x, z }; break; }
    }
    if (bad) {
      const msg = `Tyč se do díry nevejde (pravidlo 13): u Z ${bad.z.toFixed(3)} by zadní strana tyče sáhla na protější stěnu předvrtání ⌀${g.d0}.`;
      addCmt(`! ${msg}`);
      warn(`Vyvrtávání: ${msg}`);
      body = null;
    }
  }
  let simCounter = 0;
  for (const l of body || []) {
    if (/^N\d+\s/.test(l.text)) {
      const isMove = l.simIdx !== null && l.simIdx !== undefined;
      if (isMove) simCounter += 1;
      addN(l.text.replace(/^N\d+\s+/, ''), isMove ? simCounter : null);
    } else {
      lines.push({ text: l.text, simIdx: null });
    }
  }
  // Ven z díry je hotovo (tělo končí v Z před čelem) — radiálně na bezpečnou polohu.
  simCounter += 1; addN(`G0 X${prms.safeX}${note('', 'Bezpečná poloha')}`, simCounter);
  buildControlTailLines(prms.controlSystem).forEach(line => addN(line));
  addCmt('--- DIRA (Pro referenci) ---');
  addCmt(`⌀${g.D} x ${g.L} od Z${g.zF}, predvrtani ⌀${g.d0} x ${g.L0}`);
  return lines;
}
