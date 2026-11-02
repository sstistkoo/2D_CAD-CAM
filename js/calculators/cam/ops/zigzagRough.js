// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – strategie „Cik cak" (kulatá destička v úzkém držáku)   ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Uživatel 1. 11. 2026: všechno podle pravidel jako „Podélně" — úseky,
// jejich pořadí, zanořování. Jediný rozdíl: vrstva za hrbolem, která by se
// zprava zanořila a vyjela vlevo do prázdného prostoru (polotovar tam není),
// se vezme obráceně — ze vzduchu doprava ke stěně (ops/zigzagReverse.js).
// Kapsy přes celé údolí a přejíždění mezi úseky se NEDĚLÁ.
//
// Cik cak se nepoužije (vše podélně), když destička není kulatá nebo je
// držák širší než destička (pravidlo 2 — jede se oběma směry ke stěně).

import { genLongPasses } from './roughLong.js';
import { getInsert } from '../inserts/index.js';
import { reverseAirLayers } from './zigzagReverse.js';
import { floorZigzag } from './zigzagFloor.js';
import { getEffectivePlungeAngle, stockClearances } from '../camMath.js';

/** Držák je v ose Z užší než kulatá destička (i s virtuálním zvětšením). */
export function holderNarrowerThanInsert(prms) {
  const R = parseFloat(prms.toolRadius) || 0;
  const pts = (prms.holderProfile && prms.holderProfile.sideA) || [];
  if (!(R > 0) || pts.length < 3) return false;
  const inflate = Math.max(parseFloat(prms.holderInflate) || 0, 0);
  return Math.max(...pts.map((p) => Math.abs(p.x))) + inflate < R - 1e-6;
}

export function genZigzagPasses(ctx, op) {
  const { prms, passes, foundErrors, offsetPath, stockPathSegments, step } = ctx;
  const start = passes.length;
  genLongPasses(ctx, op);
  if (!getInsert(prms).zigzagPockets) return;
  if (!holderNarrowerThanInsert(prms)) {
    foundErrors.push({ type: 'warning', msg: 'Cik cak: držák není užší než kulatá destička — jede se jen podélně (široký držák by o stěnu za hrbolem drhl). Použijte úzký držák (🔧 SRDPN úzký).' });
    return;
  }
  reverseAirLayers({
    passes, start, raw: ctx.offsetPathNoGuide || offsetPath, guided: offsetPath,
    stock: stockPathSegments, noseR: parseFloat(prms.toolRadius) || 0, step,
    // Vjezd je ve vzduchu (nos se nedotkne polotovaru), takže smí i za hranici
    // úseku (Po úsecích: Ú1 končí na patě čáry zanoření, volno je za ní —
    // pravidlo 11 hlídá jen materiál). Mez jsou jen čelisti.
    zLo: Number.isFinite(ctx.chuckZ) ? ctx.chuckZ : -Infinity,
    zHi: ctx.machiningRange && Number.isFinite(ctx.machiningRange.zHi) ? ctx.machiningRange.zHi : Infinity,
    clear: Math.max(stockClearances(prms).x, stockClearances(prms).z),
  });
  // Spodek pod polotovarem u hranice úseku: místo zanořování cik cak, vpravo
  // až ke stěně i za hranicí (výjimka, ops/zigzagFloor.js).
  floorZigzag({
    passes, start, raw: ctx.offsetPathNoGuide || offsetPath, step,
    tanA: Math.tan(getEffectivePlungeAngle(prms) * Math.PI / 180),
    zHi: ctx.machiningRange && Number.isFinite(ctx.machiningRange.zHi) ? ctx.machiningRange.zHi : Infinity,
    noSteps: !!prms.noStepRoughing,   // schody na stěnách dojet (Hrub. bez schodků)
  });
}
