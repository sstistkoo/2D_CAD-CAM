// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – emise průchodu cik cak (ops/zigzagReverse.js)          ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Průchod nese hotovou řadu pohybů (moves) — směr řezu se v něm střídá,
// takže ho nejde emitovat jako podélný průchod (ten má jeden směr zDir).
// Příjezd k prvnímu bodu jde přes safeRapidTo (rychloposuv nad zbytkem,
// poslední kus posuvem), na konci výjezd v X nad okraj kapsy.

/**
 * @param {object} pass  { type:'zigzag', moves:[{g,x,z}], xSafe }
 * @param {object} env   addN, xDia, cur, setPos, safeRapidTo, noteCutMove, prms, rDist, rDistZ
 * @param {number} simCounter
 * @returns {number} nový simCounter
 */
export function emitZigzagPass(pass, env, simCounter) {
  const { addN, xDia, cur, setPos, safeRapidTo, noteCutMove, prms, rDist, rDistZ } = env;
  const mv = pass.moves || [];
  if (mv.length < 2) return simCounter;
  if (pass.chain && cur.x > mv[0].x) {
    // Navazující obrácená vrstva (uživatel 1. 11. 2026): po odskoku
    // rychloposuvem rovnou nad vjezd (projetá výška, vlevo vzduch), dolů ve
    // vzduchu a posledních 0,5 posuvem — jako mezi vrstvami zprava doleva.
    simCounter += 1; addN(`G0 Z${mv[0].z.toFixed(3)}`, simCounter); setPos(cur.x, mv[0].z);
    if (cur.x - mv[0].x > 0.5) { simCounter += 1; addN(`G0 X${xDia(mv[0].x + 0.5)}`, simCounter); setPos(mv[0].x + 0.5, cur.z); }
    simCounter += 1; addN(`G1 X${xDia(mv[0].x)} F${prms.feed}`, simCounter); setPos(mv[0].x, cur.z);
  } else safeRapidTo(mv[0].x, mv[0].z, true);
  for (let i = 1; i < mv.length; i++) {
    const m = mv[i], fx = cur.x, fz = cur.z;
    const words = (Math.abs(m.x - fx) > 1e-6 ? ` X${xDia(m.x)}` : '') + (Math.abs(m.z - fz) > 1e-6 ? ` Z${m.z.toFixed(3)}` : '');
    if (!words) continue;
    simCounter += 1;
    addN(m.g === 'G0' ? `G0${words}` : `G1${words} F${prms.feed}`, simCounter);
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
