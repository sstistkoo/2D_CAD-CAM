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
import { zigzagWallStart } from './zigzagWallStart.js';
import { zigzagBeyondStart } from './zigzagBeyondStart.js';
import { valleyZigzag, pocketsBelowZigzag, dropBelowValleyFloor, dropUnderOffset } from './zigzagValley.js';
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
  // Vrstva celá pod hrubovacím offsetem = zajetí do kontury (pojistka).
  // Na tyči ne — tam platí Podélně beze změny (pravidlo 20).
  if (getInsert(prms).zigzagPockets && prms.stockMode !== 'cylinder') dropUnderOffset({ passes, start, raw: ctx.offsetPathNoGuide || offsetPath });
  // Úsek nad údolím polotovaru: u dolní hranice (vlevo od prvního hrbu) ne pod dno údolí.
  // Dno údolí je výška polotovaru (plán úseků); vrstvy jedou středem nosu —
  // spodek nosu na dně = dno + R (soustruh 6. 11. 2026, díl (5) R20: s R5
  // rozdíl nevadil, s R20 jel Ú1 vrstvy X142/X134 ke hranici S7 — údolí
  // rozdělené na dva kusy, N2050 Z556.262).
  const valleyFloorC = Number.isFinite(ctx.valleyFloor) ? ctx.valleyFloor + (parseFloat(prms.toolRadius) || 0) : null;
  if (valleyFloorC !== null && ctx.machiningRange && Number.isFinite(ctx.machiningRange.zLo)) {
    dropBelowValleyFloor({ passes, start, raw: ctx.offsetPathNoGuide || offsetPath, floor: valleyFloorC, zLo: ctx.machiningRange.zLo });
  }
  if (!getInsert(prms).zigzagPockets) return;
  if (!holderNarrowerThanInsert(prms)) {
    foundErrors.push({ type: 'warning', msg: 'Cik cak: držák není užší než kulatá destička — jede se jen podélně (široký držák by o stěnu za hrbolem drhl). Použijte úzký držák (🔧 SRDPN úzký).' });
    return;
  }
  // Vrstva u čela na straně začátku: vjezd od stěny, ne z čáry zanoření
  // (uživatel 5. 11. 2026: „jezdit až k čelům tam a nazpět", zigzagWallStart.js).
  if (prms.stockMode !== 'cylinder') {
    zigzagWallStart({
      passes, start, raw: ctx.offsetPathNoGuide || offsetPath, step,
      tanA: Math.tan(getEffectivePlungeAngle(prms) * Math.PI / 180),
      zHi: ctx.machiningRange && Number.isFinite(ctx.machiningRange.zHi) ? ctx.machiningRange.zHi : Infinity,
    });
  }
  reverseAirLayers({
    passes, start, raw: ctx.offsetPathNoGuide || offsetPath, guided: offsetPath,
    stock: stockPathSegments, noseR: parseFloat(prms.toolRadius) || 0, step,
    afterPrev: !!ctx.afterPrev,   // za hranici jen po předchozím úseku
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
    valleyStart: !!ctx.valleyStart,   // za hranicí údolí až ke stěně hrbu (pravidlo 1)
  });
  // Údolí za hrbem bez hranice úseku (čára zanoření skončí na kontuře): místo
  // řetězu ramp po čáře zanoření taky cik cak až ke stěně (ops/zigzagValley.js).
  // Na tyči platí Podélně beze změny (pravidlo 20).
  if (prms.stockMode === 'cylinder') return;
  const vo = {
    passes, start, raw: ctx.offsetPathNoGuide || offsetPath, step,
    tanA: Math.tan(getEffectivePlungeAngle(prms) * Math.PI / 180),
    zLo: ctx.machiningRange && Number.isFinite(ctx.machiningRange.zLo) ? ctx.machiningRange.zLo : -Infinity,
    zHi: ctx.machiningRange && Number.isFinite(ctx.machiningRange.zHi) ? ctx.machiningRange.zHi : Infinity,
    noSteps: !!prms.noStepRoughing,
  };
  valleyZigzag({ ...vo, stock: stockPathSegments, noseR: parseFloat(prms.toolRadius) || 0 });
  // Kapsy pod spodkem (zářez do V, nižší dno): napřed pravá, pak levá.
  // Pod podélnou vrstvou jen mimo úsek nad údolím (tam pod dnem údolí nic — dropBelowValleyFloor).
  pocketsBelowZigzag({ ...vo, belowLong: valleyFloorC === null, valleyFloor: valleyFloorC });
  // Materiál za začátkem úseku (kapsa za hranicí, kterou předchozí úsek
  // nebere): cik cak shora až ke stěně (ops/zigzagBeyondStart.js).
  // Jen když se před úsekem obráběl jiný úsek — v Ú1 je za začátkem konec
  // polotovaru nebo rozsah 📐 (karusel, díl (11): Rozsah X min 45,69 a Ú1 jel napřed X0–45,7).
  if (ctx.afterPrev) zigzagBeyondStart({ ...vo, stock: stockPathSegments, noseR: parseFloat(prms.toolRadius) || 0 });
}
