// ╔══════════════════════════════════════════════════════════════╗
// ║  OPERACE: ZÁPICH V DÍŘE (Upich + ◎ Vnitřní)                    ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Doplnění pravidla 13 (docs/cam-pravidla.md, schválil uživatel 22. 10. 2026):
// vnější Upich v zrcadle — zápich VEN od stěny díry vnitřní zapichovací tyčí.
//   • Z roviny (`partOffZ`, naklikaná jako u upichu) = bok zápichu blíž
//     k ústí díry; `grooveWidth` vede od něj hlouběji do díry.
//   • `grooveBottomX` = poloměr dna zápichu (vnější hrana destičky na dně).
//   • Šířka libovolná: zápichy vedle sebe s krokem ≤ šířka destičky
//     (překryv), boky (Přídavek Z + Přídavek na hotovo) a dno (Přídavek na
//     hotovo) zůstanou; dokončení (Dokončovací operace) jede po prvním boku
//     na dno, po dně ke druhému boku a po něm zpátky ke stěně díry.
//     Šířka = šířka destičky → jeden zápich jako u upichu.
//   • Díra = hotový ⌀ z vyvrtávání (Hrub./Hot. + ◎ Vnitřní), jinak
//     předvrtání; `grooveHoleD` > 0 ji přebije (ruční zadání).
//   • Tyč se musí vejít: protější strana tyče nesmí k protější stěně díry
//     a bližší strana tyče musí zůstat v díře i se špičkou na dně zápichu
//     (= hloubka zápichu ≤ dosah destičky). Jinak se dráha nevydá.
//   • Pohyb: rychloposuvem před ústí → do díry k ose → na Z → ke stěně →
//     zápich → zpět k ose → ven z díry.
//
// Emise je přímo ve skutečných souřadnicích (jako vnitřní závit) — zápich
// je jen radiální pohyb, zrcadlení přes vnější generátor by nic nepřineslo.

import { stockClearances } from '../camMath.js';
import { buildControlTailLines } from '../controlDialect.js';
import { holderProfileLoop, holderWorldLoop } from '../collisionValidator.js';
import { getInsert } from '../inserts/index.js';
import { boreGeom, boreToolReach, boreFits } from './bore.js';
import { boreChainFromState } from '../boreContour.js';
import { buildStockLoopRaw, toolFootprint } from '../materialRemoval.js';
import { toolReachAlongZ } from '../toolRadialFlip.js';
import { barOverhangNote } from './barOverhang.js';

const num = (v, d = 0) => { const x = parseFloat(v); return Number.isFinite(x) ? x : d; };
/** Mezera mezi tyčí a stěnou díry [mm] (jako WALL_GAP vyvrtávání). */
const GAP = 0.2;
/** Překryv sousedních zápichů: krok ≤ 0,8 × šířka destičky. */
const STEP_FRAC = 0.8;

/** Poloměr díry (stěny) ve skutečném Z, nebo null, kde díra není. */
function holeRadiusAt(g, z, holeR) {
  if (holeR > 0) return holeR;
  const depth = g.s * (g.zF - z);
  if (g.chain) {
    // Tvar z výkresu: lineární interpolace po řetězu (oblouk ~ tětiva).
    let best = null;
    for (const sg of g.chain) {
      const a = sg.p1, b = sg.p2;
      if (!a || !b) continue;
      const lo = Math.min(a.z, b.z), hi = Math.max(a.z, b.z);
      if (z < lo - 1e-9 || z > hi + 1e-9) continue;
      const t = Math.abs(b.z - a.z) < 1e-9 ? 0 : (z - a.z) / (b.z - a.z);
      const r = Math.abs(b.z - a.z) < 1e-9 ? Math.min(a.x, b.x) : a.x + t * (b.x - a.x);
      best = best === null ? r : Math.min(best, r);
    }
    if (best !== null) return best;
  } else if (g.D > 0 && depth >= -1e-9 && depth <= g.L + 1e-6) {
    return g.D / 2;
  }
  if (g.d0 > 0 && depth >= -1e-9 && depth <= g.L0 + 1e-6) return g.d0 / 2;
  return null;
}

/** Nejmenší poloměr díry na úseku Z (vzorkuje po 0,25 mm + konce). */
function holeMinRadius(g, z1, z2, holeR) {
  const lo = Math.min(z1, z2), hi = Math.max(z1, z2);
  const n = Math.max(1, Math.ceil((hi - lo) / 0.25));
  let m = Infinity;
  for (let i = 0; i <= n; i++) {
    const r = holeRadiusAt(g, lo + (hi - lo) * i / n, holeR);
    if (r === null) return null;
    m = Math.min(m, r);
  }
  return m;
}

/**
 * Bližší strana tyče (k osa → +z v profilu): nejmenší z držáku za šířkou
 * destičky. Špička (střed rádiusu) na poloměru rc → strana tyče na rc − zNear.
 */
function barNearSide(prms) {
  const w = getInsert(prms).widthZ || 0;
  const pts = (holderProfileLoop(prms) || []).filter(p => p.x > w + 0.5);
  return pts.length ? Math.min(...pts.map(p => p.z)) : 0;
}

/**
 * Geometrie zápichu v díře (sdílí emise, UI i testy).
 * @param chain  tvar díry z výkresu (boreChainFromState), jen při boreSource 'cad'
 */
export function grooveInnerGeom(prms, chain = null, stockLoop = null) {
  const bg = boreGeom(prms, chain);
  const g = { s: bg.s, zF: bg.zF, D: bg.D, L: bg.L, d0: bg.d0, L0: bg.L0, chain: bg.chain };
  const k = prms.mode === 'DIAMON' ? 2 : 1;
  const ins = getInsert(prms);
  const w = ins.widthZ || 0;                         // šířka destičky (0 = není zapichovací)
  const rIns = Math.max(0, ins.partOffCornerR || 0);   // rohový rádius destičky
  const W = Math.max(0, num(prms.grooveWidth, 0)) || w;
  const zA = num(prms.partOffZ, NaN);                 // bok u ústí
  const zB = zA - g.s * W;                            // bok hlouběji v díře
  const rBot = num(prms.grooveBottomX, 0);            // poloměr dna (vnější hrana destičky)
  const allowZ = Math.max(0, num(prms.allowanceZ, 0));
  const finAllow = Math.max(0, num(prms.finishAllowance, 0));
  const doFinish = !!prms.doFinishing && finAllow > 1e-6;
  const holeR = Math.max(0, num(prms.grooveHoleD, 0)) / 2;
  const clr = Math.max(0.5, stockClearances(prms).x);
  const out = { ok: false, k, s: g.s, zF: g.zF, w, rIns, W, zA, zB, rBot, allowZ, finAllow, doFinish, clr };
  const fail = (reason) => ({ ...out, reason });

  if (!ins.canPartOff || !(w > 0)) return fail('Zápich v díře potřebuje vnitřní zapichovací tyč (upichovací destička) — vyber ji ve 🔧 Zásobníku nebo v 📚 katalogu → Vnitřní (do díry).');
  if (!prms.toolInternal) return fail('Nástroj je vnější upichovák — do díry patří vnitřní zapichovací tyč (📚 katalog → Vnitřní (do díry)).');
  if (!Number.isFinite(zA)) return fail('Naklikej Z zápichu (bok u ústí díry).');
  if (W < w - 1e-6) return fail(`Šířka zápichu ${W} mm je menší než šířka destičky ${w} mm — vyber užší destičku.`);
  const rHole = holeMinRadius(g, zA, zB, holeR);
  if (rHole === null) return fail('Zápich leží mimo díru — zadej ⌀ díry, nebo nastav vyvrtávání / předvrtání (Hrub. + ◎ Vnitřní).');
  // Cesta od ústí k zápichu: nejužší místo díry, kudy tyč jede rychloposuvem.
  const rPath = holeMinRadius(g, g.zF, zA, holeR);
  if (rPath === null) return fail('Mezi ústím díry a zápichem není díra — zkontroluj Z zápichu a ⌀ díry.');
  const rWall = Math.min(rHole, rPath);
  if (!(rBot > rHole + 1e-6)) return fail(`Dno zápichu (X ${rBot}) neleží za stěnou díry (poloměr ${rHole.toFixed(3)}) — zápich jde VEN od stěny.`);

  // Poloha středu rádiusu destičky (rc): vnější hrana = rc + rIns.
  const reach = boreToolReach(prms);            // špička → protější strana tyče
  const zNear = barNearSide(prms);              // špička → bližší strana tyče
  const rcStart = rHole - clr - rIns;           // hrana o vůli X před stěnou v místě zápichu
  const rcBotFinal = rBot - rIns;
  const rcBotRough = rcBotFinal - finAllow;     // dno: Přídavek na hotovo zůstává vždy (jako u upichu)
  // „K ose": tyč uprostřed díry, ale hrana destičky nejvýš o vůli od nejužší stěny.
  const rcIn = Math.min(rWall - clr - rIns, (reach + zNear) / 2);
  if (!boreFits(rcIn, reach, rWall)) {
    return fail(`Tyč se do díry nevejde (pravidlo 13): sahá ${reach.toFixed(1)} mm od špičky, díra ⌀${(2 * rWall).toFixed(2)} — je potřeba tenčí tyč.`);
  }
  if (rcIn > rcStart + 1e-6) return fail('Tyč nemá v díře kde stát — díra je na ni moc úzká.');
  // Bližší strana tyče musí zůstat v díře i se špičkou na dně zápichu.
  const depth = rBot - rHole;
  if (zNear > 0 && rcBotFinal - zNear > rHole - GAP + 1e-6) {
    return fail(`Zápich je hlubší (${depth.toFixed(2)} mm), než destička v tyči dosáhne (${Math.max(0, zNear + rIns - GAP).toFixed(2)} mm) — vyber tyč s větším dosahem.`);
  }

  // Hrubovací zápichy: interval destičky v „hloubce" u (0 = bok u ústí, W = druhý bok).
  const fa = W - w > 1e-6 ? allowZ + finAllow : 0;   // přídavek boků (jen u širšího zápichu)
  const span = W - 2 * fa;
  if (span < w - 1e-6) return fail(`Zápich ${W} mm se s přídavky boků (2 × ${fa.toFixed(2)}) nevejde na destičku ${w} mm — zmenši přídavky.`);
  const n = span - w < 1e-6 ? 1 : Math.ceil((span - w) / (STEP_FRAC * w)) + 1;
  const step = n > 1 ? (span - w) / (n - 1) : 0;
  const plunges = [];
  for (let i = 0; i < n; i++) plunges.push(fa + i * step);   // u = začátek destičky
  // Z středu rádiusu pro destičku od hloubky u (interval [u, u + w]).
  const dir = (prms.roughingSide === 'left') ? -1 : 1;
  const zOfU = (u) => {
    const za = zA - g.s * u, zb = zA - g.s * (u + w);
    const zmin = Math.min(za, zb), zmax = Math.max(za, zb);
    return dir > 0 ? zmin + rIns : zmax - rIns;
  };
  // Před ústí: za čelo díry i za polotovar (může čelo přečnívat) o vůli + 1 mm
  // — odtud jede tyč radiálně k ose a zpátky ven, nad polotovarem.
  const zStock = stockLoop && stockLoop.length ? (g.s > 0 ? Math.max(...stockLoop.map(q => q.z)) : Math.min(...stockLoop.map(q => q.z))) : g.zF;
  // + kam nástroj sahá za špičku do díry (směr −s).
  const ext2 = toolReachAlongZ([holderWorldLoop(prms, prms.roughingSide === 'left'), toolFootprint(prms)], -g.s);
  const zOut = g.zF + g.s * (Math.max(0, g.s * (zStock - g.zF)) + clr + 1 + ext2);
  return { ...out, ok: true, rHole, rWall, reach, zNear, rcStart, rcIn, rcBotFinal, rcBotRough,
    plunges: plunges.map(zOfU), zFinA: zOfU(fa > 0 ? allowZ : 0), zFinB: zOfU(fa > 0 ? W - allowZ - w : 0), zOut, depth };
}

/**
 * @param ctx { S, calc, prms, lines, addCmt, addN, note }
 * @returns hotové řádky programu
 */
export function emitGrooveInner(ctx) {
  const { S, calc, prms, lines, addCmt, addN, note } = ctx;
  const chain = prms.boreSource === 'cad' ? boreChainFromState(S) : null;
  let stock = null;
  try { stock = buildStockLoopRaw(prms, calc && calc.stockPathSegments); } catch { stock = null; }
  const g = grooveInnerGeom(prms, chain, stock);
  const xd = (v) => (v * g.k).toFixed(3);
  const zs = (v) => v.toFixed(3);
  let sim = 0;
  const N = (t) => { sim += 1; addN(t, sim); };
  addCmt(`--- ZAPICH V DIRE sirka ${g.W} dno X${xd(g.rBot)} (pravidlo 13: zrcadlo vnejsiho upichu) ---`);
  if (!g.ok) {
    addCmt(`! ${g.reason}`);
    if (S.genNotes) S.genNotes.push({ type: 'warning', msg: `Zápich v díře: ${g.reason}` });
  } else {
    // Vyložení tyče (jen hlášení): druhý bok zápichu od ústí díry.
    const ovh = barOverhangNote(prms, g.s * (g.zF - g.zB));
    if (ovh) { addCmt(`! ${ovh}`); if (S.genNotes) S.genNotes.push({ type: 'warning', msg: `Zápich v díře: ${ovh}` }); }
    const peck = Math.max(0.1, num(prms.retractDistance, 2));
    const af = Math.max(0, num(prms.partingApproachFeed, 0));
    const F = prms.feed;
    // Do díry: před ústí, k ose, pak na Z (rychloposuvy ve volné díře).
    N(`G0 Z${zs(g.zOut)}${note('', 'Před ústí díry')}`);
    N(`G0 X${xd(g.rcIn)}`);
    const plunge = (zc, rcTo, label) => {
      N(`G0 Z${zs(zc)}${note('', label)}`);
      N(`G0 X${xd(g.rcStart)}`);
      if (prms.partOffSmooth) {
        N(`G1 X${xd(rcTo)} F${F}${note('', 'Zápich')}`);
      } else {
        // Peck VEN: po hloubce „Vyjezd" zpět na Start, pak rychle k dnu.
        let r = g.rcStart, guard = 0;
        while (r < rcTo - 1e-4 && guard++ < 10000) {
          const next = Math.min(rcTo, r + peck);
          if (r > g.rcStart + 1e-4) N(`G0 X${xd(Math.max(g.rcStart, r - af))}`);
          N(`G1 X${xd(next)} F${F}${note('', 'Zápich')}`);
          r = next;
          if (r < rcTo - 1e-4) N(`G0 X${xd(g.rcStart)}${note('', 'Vyjezd – uvolnění třísek')}`);
        }
      }
      N(`G0 X${xd(g.rcIn)}${note('', 'K ose')}`);
    };
    g.plunges.forEach((zc, i) => plunge(zc, g.rcBotRough, g.plunges.length > 1 ? `Zápich ${i + 1}/${g.plunges.length}` : 'Rovina zápichu'));
    if (g.doFinish) {
      // Dokončení: první bok na dno, po dně ke druhému boku, po něm ke stěně.
      N(`G0 Z${zs(g.zFinA)}${note('', 'Dokončení – bok u ústí')}`);
      N(`G0 X${xd(g.rcStart)}`);
      N(`G1 X${xd(g.rcBotFinal)} F${F}${note('', 'Dokončovací zápich')}`);
      if (Math.abs(g.zFinB - g.zFinA) > 1e-6) N(`G1 Z${zs(g.zFinB)}${note('', 'Dno zápichu')}`);
      N(`G1 X${xd(g.rcStart)}${note('', 'Druhý bok')}`);
      N(`G0 X${xd(g.rcIn)}${note('', 'K ose')}`);
    }
    // Ven z díry v ose, teprve pak bezpečná poloha.
    N(`G0 Z${zs(g.zOut)}${note('', 'Ven z díry')}`);
    addN(`G0 X${prms.safeX} Z${prms.safeZ}${note('', 'Bezpečná poloha')}`);
    buildControlTailLines(prms.controlSystem).forEach(line => addN(line));
  }
  return lines;
}
