// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – emise průchodu cik cak (ops/zigzagReverse.js)          ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Průchod nese hotovou řadu pohybů (moves) — směr řezu se v něm střídá,
// takže ho nejde emitovat jako podélný průchod (ten má jeden směr zDir).
// Příjezd k prvnímu bodu jde přes safeRapidTo (rychloposuv nad zbytkem,
// poslední kus posuvem), na konci výjezd v X nad okraj kapsy.

import { zigzagWallFeed, zigzagFeedPlan } from './zigzagFeed.js';
import { formatFeed } from '../arcFeedComp.js';
import { chipThinActive, chipRatio, chipMargin, moveDepth } from '../feedTuning.js';

/**
 * @param {object} pass  { type:'zigzag', moves:[{g,x,z}], xSafe }
 * @param {object} env   addN, xDia, cur, setPos, safeRapidTo, noteCutMove, prms, rDist, rDistZ
 * @param {number} simCounter
 * @returns {number} nový simCounter
 */
export function emitZigzagPass(pass, env, simCounter) {
  const { addN, xDia, cur, setPos, safeRapidTo, noteCutMove, prms, rDist, rDistZ } = env;
  let mv = pass.moves || [];
  if (mv.length < 2) return simCounter;
  // JÍZDA PO STĚNĚ NEZAČÍNÁ VZDUCHEM (audit CAM 25. 11. 2026, pravidlo 5).
  // Začíná na vršku stěny (`xSafe`), ale horní kus stěny už projely vrstvy:
  // lathe-zigzag-left-10 `N2540 G1 X62.883` 8 mm posuvem, ubráno 0,001 mm².
  // Úvodní úseky, které z plánovacího zbytku neuberou nic (prahy jako
  // `dropAirTail`), se nejedou — příjezd jde rovnou nad první řezající bod
  // (rychloposuv nad zbytek, posledních 0,5 mm posuvem).
  if (pass.wallClean && typeof env.planCutsAlong === 'function') {
    const perMm = env.airPerMm || 0.01;
    // Neubere-li nic ani jeden pohyb (wall-steps průchod 67: jen sjezd po
    // stěně 11,4 mm, kterou už vrstvy projely), průchod se nevydá vůbec.
    const cuts = mv.some((m, j) => j > 0 && m.g === 'G1'
      && env.planCutsAlong(mv[j - 1].x, mv[j - 1].z, m.x, m.z, perMm));
    if (!cuts) return simCounter;
    let k = 0;
    while (mv.length - k > 2 && mv[k + 1].g === 'G1'
      && !env.planCutsAlong(mv[k].x, mv[k].z, mv[k + 1].x, mv[k + 1].z, perMm)) k++;
    if (k > 0) mv = [{ ...mv[k], g: 'G0' }, ...mv.slice(k + 1)];
  }
  if (pass.chain && cur.x > mv[0].x) {
    // Navazující obrácená vrstva (uživatel 1. 11. 2026): po odskoku
    // rychloposuvem rovnou nad vjezd (projetá výška, vlevo vzduch), dolů ve
    // vzduchu a posledních 0,5 posuvem — jako mezi vrstvami zprava doleva.
    simCounter += 1; addN(`G0 Z${mv[0].z.toFixed(3)}`, simCounter); setPos(cur.x, mv[0].z);
    if (cur.x - mv[0].x > 0.5) { simCounter += 1; addN(`G0 X${xDia(mv[0].x + 0.5)}`, simCounter); setPos(mv[0].x + 0.5, cur.z); }
    simCounter += 1; addN(`G1 X${xDia(mv[0].x)} F${prms.feed}`, simCounter); setPos(mv[0].x, cur.z);
  } else {
    // Rychloposuv se zastaví podle KRUŽNICE NOSU nad skutečným zbytkem
    // (`rapidStopXAt`), ne pevně o Stop rychloposuvu nad začátkem — pravidlo
    // 20 „rychloposuv končí 0,5 nad vrstvou" a pravidlo 5. Dřív se k začátku
    // každé vrstvy sjíždělo 6 mm posuvem vzduchem (lathe-zigzag-left-10
    // `G0 X149.000` → `G1 X143.000`, audit 23. 11. 2026). Stejně jako rampa
    // podélného hrubování (`rampEntryClear`, roughEmit.js).
    const stop = typeof env.rapidStopXAt === 'function' ? env.rapidStopXAt(mv[0].z) : null;
    // Pod nosem v tom Z žádný zbytek (`stop` null, vjezd vedle dílu) → rychloposuv
    // až 0,5 nad vrstvu; dřív výchozí vůle a 3 mm posuvem vzduchem
    // (lathe-zigzag-wall-steps `N6430`, audit 26. 11. 2026).
    const noStock = stop === null && typeof env.rapidStopXAt === 'function';
    safeRapidTo(mv[0].x, mv[0].z, true, false, true,
      !Number.isFinite(env.rapidStopX) ? null : noStock ? Math.min(env.rapidStopX, 0.5)
        : stop === null ? null : Math.min(env.rapidStopX, Math.max(stop - mv[0].x, 0)));
    // `safeRapidTo` někdy zůstane ve výšce přejezdu (karusel wall-steps:
    // X114,38 nad začátkem rampy X78,22) a první pohyb průchodu pak jel z ní
    // jedním strmým G1 (`N2400` 78°, posledních 10 mm v materiálu; audit
    // 24. 11. 2026). Dojet: rychloposuvem na zastavení nad zbytkem, pak posuvem.
    if (Math.abs(cur.z - mv[0].z) < 1e-6 && cur.x > mv[0].x + 1e-6) {
      let xs = stop !== null ? Math.min(cur.x, Math.max(stop, mv[0].x)) : cur.x;
      // Rychloposuv dolů jen když nenarazí do zbytku (ani plánovacího) — jinak posuvem.
      const hit = (x1, x2) => (env.rapidHitsStock && env.rapidHitsStock(x1, cur.z, x2, cur.z)) || (env.rapidHitsPlan && env.rapidHitsPlan(x1, cur.z, x2, cur.z));
      if (xs < cur.x - 1e-6 && hit(cur.x, xs)) xs = cur.x;
      if (xs < cur.x - 1e-6) { simCounter += 1; addN(`G0 X${xDia(xs)}`, simCounter); setPos(xs, cur.z); }
      if (cur.x > mv[0].x + 1e-6) { simCounter += 1; addN(`G1 X${xDia(mv[0].x)} F${prms.feed}`, simCounter); setPos(mv[0].x, cur.z); }
    }
  }
  // Posuv u čela (ops/zigzagFeed.js); zanoření řeší cam/feedTuning.js.
  const plan = (zigzagWallFeed(prms) || prms.chipThinOn) ? zigzagFeedPlan(mv, prms) : null;
  const steps = plan || mv.slice(1).map((m) => ({ g: m.g, x: m.x, z: m.z, f: null }));
  // Tloušťka třísky: ap každého pohybu z modelu zbytku TĚSNĚ před ním — model
  // je po předchozích pohybech téhož průchodu už aktuální (noteCutMove níž).
  const chipOpt = env.residualTopXAtZ && chipThinActive(prms)
    ? { topAt: env.residualTopXAtZ, tipR: parseFloat(prms.toolRadius) || 0, margin: chipMargin(prms) } : null;
  // OBRÁCENÁ VRSTVA NEKONČÍ VZDUCHEM (audit CAM 25. 11. 2026, pravidlo 5):
  // vrstva ze vzduchu ke stěně končí výstupem po stěně k vrstvě nad ní, který
  // tu stěnu znovu projede (lathe-zigzag-v-insert-size `N2290` 9,2 mm,
  // ubráno 0). Jsou-li všechny zbývající pohyby G1 ven od osy a z plánovacího
  // zbytku (už bez těla téže vrstvy — noteCutMove níž) neuberou nic, nejedou
  // se — odskok jde rovnou z konce vrstvy. Měří se až tady, ne předem.
  const tailInAir = (j) => {
    // Totéž na konci každé řady před výjezdem (karusel u3-beyond `N400` 18 mm,
    // ubráno 0,018 mm²) — výjezd jde rovnou z konce posledního řezu.
    if (typeof env.planCutsAlong !== 'function' || j === 0) return false;
    const perMm = env.airPerMm || 0.01;
    let px = cur.x, pz = cur.z;
    for (let q = j; q < steps.length; q++) {
      const s = steps[q];
      if (s.g !== 'G1' || s.x < px - 1e-6 || env.planCutsAlong(px, pz, s.x, s.z, perMm)) return false;
      px = s.x; pz = s.z;
    }
    return true;
  };
  // VZDUCH UPROSTŘED ŘADY (audit CAM 25. 11. 2026, pravidlo 5): krok cik
  // caku o vrstvu níž vede tam, kde už nic nestojí (karusel u3-beyond `N190`
  // 11,3 mm, ubráno 0), a teprve další pohyb řeže. Souvislý úsek G1 delší
  // než 3 mm, který z aktuálního plánovacího zbytku nic neubere a za nímž
  // následuje řez, se jede rychloposuvem PO OSÁCH (ne dvouosý G0 — Fanuc ho
  // nejede po přímce) a posledních 0,5 mm posuvem. Jen když obě rychlé dráhy
  // nenarazí ani do zbytku, ani do plánovacího zbytku a nic neuberou.
  const airRun = (j) => {
    if (j === 0 || typeof env.planCutsAlong !== 'function' || !env.rapidHitsStock || !env.rapidHitsPlan) return null;
    const perMm = env.airPerMm || 0.01;
    let px = cur.x, pz = cur.z, len = 0, q = j;
    for (; q < steps.length; q++) {
      const s = steps[q];
      if (s.g !== 'G1') return null;
      if (env.planCutsAlong(px, pz, s.x, s.z, perMm)) break;
      len += Math.hypot(s.x - px, s.z - pz); px = s.x; pz = s.z;
    }
    if (q >= steps.length || len <= 3) return null;
    const clear = (x1, z1, x2, z2) => !env.rapidHitsStock(x1, z1, x2, z2) && !env.rapidHitsPlan(x1, z1, x2, z2)
      && !env.planCutsAlong(x1, z1, x2, z2, perMm);
    // Dvě pořadí os; posledních 0,5 mm druhé osy posuvem.
    for (const xFirst of [true, false]) {
      const mid = xFirst ? { x: px, z: cur.z } : { x: cur.x, z: pz };
      const d2 = xFirst ? pz - cur.z : px - cur.x;
      if (Math.abs(d2) <= 0.5) continue;
      const stop = xFirst ? { x: px, z: pz - Math.sign(d2) * 0.5 } : { x: px - Math.sign(d2) * 0.5, z: pz };
      if (clear(cur.x, cur.z, mid.x, mid.z) && clear(mid.x, mid.z, stop.x, stop.z)) return { q, mid, stop, end: { x: px, z: pz } };
    }
    return null;
  };
  let skipTo = -1;
  for (const [j, m] of steps.entries()) {
    if (j < skipTo) continue;
    if (tailInAir(j)) break;
    const run = airRun(j);
    if (run) {
      for (const p of [run.mid, run.stop]) {
        const w = (Math.abs(p.x - cur.x) > 1e-6 ? ` X${xDia(p.x)}` : '') + (Math.abs(p.z - cur.z) > 1e-6 ? ` Z${p.z.toFixed(3)}` : '');
        if (w) { simCounter += 1; addN(`G0${w}`, simCounter); setPos(p.x, p.z); }
      }
      const fx = cur.x, fz = cur.z, e = run.end;
      const w = (Math.abs(e.x - fx) > 1e-6 ? ` X${xDia(e.x)}` : '') + (Math.abs(e.z - fz) > 1e-6 ? ` Z${e.z.toFixed(3)}` : '');
      simCounter += 1; addN(`G1${w} F${prms.feed}`, simCounter); setPos(e.x, e.z);
      noteCutMove(fx, fz, e.x, e.z);
      skipTo = run.q;
      continue;
    }
    const fx = cur.x, fz = cur.z;
    const words = (Math.abs(m.x - fx) > 1e-6 ? ` X${xDia(m.x)}` : '') + (Math.abs(m.z - fz) > 1e-6 ? ` Z${m.z.toFixed(3)}` : '');
    if (!words) continue;
    simCounter += 1;
    let f = m.f == null ? parseFloat(prms.feed) : m.f;
    if (chipOpt && m.g !== 'G0') f *= chipRatio(prms, moveDepth(fx, fz, m.x, m.z, chipOpt)) || 1;
    addN(m.g === 'G0' ? `G0${words}` : `G1${words} F${m.f == null && f === parseFloat(prms.feed) ? prms.feed : formatFeed(f)}`, simCounter);
    setPos(m.x, m.z);
    if (m.g !== 'G0') noteCutMove(fx, fz, m.x, m.z);
  }
  if (pass.reversedLayer) {
    // Obrácená vrstva (ze vzduchu ke stěně): odskok jako po podélné vrstvě —
    // šikmo od stěny zpět, ne výjezd nahoru; další vrstva zajede pro ap.
    const dir = Math.sign(mv[1].z - mv[0].z) || 1;
    const fx = cur.x + rDist, fz = cur.z - dir * (rDistZ || rDist);
    simCounter += 1;
    addN(`G1 X${xDia(fx)} Z${fz.toFixed(3)}`, simCounter);
    setPos(fx, fz);
    // Vrstva cestou vystoupala nad výšku odskoku (po čele dílu): další vrstva
    // jede rychloposuvem v Z z výšky odskoku — napřed nad nejvyšší bod, jinak
    // by G0 projel dílem (soustruh zleva R20, 6. 11. 2026: G0 Z457.586 na X208
    // přes čelo X189, offset X209,2).
    const top = Math.max(...mv.map((q) => q.x));
    if (top > fx - 1e-6) {
      simCounter += 1; addN(`G0 X${xDia(top + rDist)}`, simCounter); setPos(top + rDist, fz);
    }
    return simCounter;
  }
  if ((pass.floorZigzag || pass.wallClean) && pass.endDir) {
    // Spodek cik cak končí u stěny — napřed odskok od ní (G0 po stěně by o ni drhl).
    const fx = cur.x + rDist, fz = cur.z - pass.endDir * (rDistZ || rDist);
    simCounter += 1; addN(`G1 X${xDia(fx)} Z${fz.toFixed(3)}`, simCounter); setPos(fx, fz);
  }
  const xOut = Math.max(pass.xSafe, cur.x) + rDist;
  simCounter += 1;
  addN(`G0 X${xDia(xOut)}`, simCounter);
  setPos(xOut, cur.z);
  return simCounter;
}
