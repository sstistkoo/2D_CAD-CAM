// ╔══════════════════════════════════════════════════════════════╗
// ║  VRSTVA NA DNĚ POKRAČUJE DOLŮ BEZ ODSKOKU (pravidlo 7, kulatá)  ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Vrstva na schodu/dně (`rule7Layers.js`, „VRSTVA NA SCHODU") jede jen
// v okně plošiny. Když za plošinou stěna sjíždí (mezní čára 45°) a další
// vrstva žebříku začíná právě pod ní, jela se dřív zvlášť: vrstva na dně
// dojela, odskočila, rychloposuvem se vrátila a další vrstva se zanořila
// rampou z úrovně NAD dnem — nebo, ještě hůř, vjela „po stěně" přes celé dno
// znovu (70 mm posuvem 0,02 mm pod vrstvou na dně). Uživatel 30. 9. 2026
// (díl (9), úsek 2, `N4860 G1 Z350.188`): *„dráha nejde až na konec
// a nezanořuje se na požadovanou hloubku ap, místo toho udělá odskok, vyjede
// kousek, vrátí se a začne se zanořovat — mělo by to jet normálně bez toho
// odskoku a tanečku nahoře."*
//
// Tady se vrstva na dně ukončí tam, kde stěna ze dna sjíždí, a navazující
// vrstva z toho místa sjede PO STĚNĚ (vjezd podle pravidla 10, bod 1 —
// mělčí vrstvou je vrstva na dně) až na svou hloubku a jede dál.

import { tailFromFloor, notSteeperThan } from './wallEntry.js';

/**
 * @param F  průchod vrstvy na dně (poslední vydaný před P)
 * @param P  první průchod další vrstvy
 * @param deps.traceOffsetPath  dráha po offsetu mezi dvěma Z
 * @param deps.entryOk(leadIn)  vejde se takový vjezd (držák, polotovar za mezí)?
 * @returns true, když se vrstvy spojily (F a P upravené na místě)
 */
export function joinFloorToLayer(F, P, { traceOffsetPath, plungeTan, step, floorLift = 0.02, entryOk }) {
  if (!F || !P || F.type !== 'long' || P.type !== 'long') return false;
  if (F.noRetract || F.contourLeadOut || !(F.x > P.x + 0.05) || F.x - P.x > step + 0.05) return false;
  if (!Number.isFinite(F.zStart) || !Number.isFinite(F.zEnd) || !Number.isFinite(P.zStart)) return false;
  const trace = traceOffsetPath(F.zStart, P.zStart);
  if (!Array.isArray(trace) || trace.length === 0) return false;
  // Dno leží o `floorLift` pod vrstvou na dně (vrstva jede 0,02 nad plošinou).
  const tail = tailFromFloor(trace, F.x - floorLift - 0.01);
  if (!tail || tail.length === 0) return false;
  const last = tail[tail.length - 1];
  if (Math.abs(last.x2 - P.x) > 0.05 || Math.abs(last.z2 - P.zStart) > 0.05) return false;
  // Z vrstvy na dně na začátek sjezdu pod úhlem zanoření; to místo musí
  // vrstva na dně projet (leží mezi jejím začátkem a koncem).
  const t0 = tail[0];
  const zc = t0.z1 + (F.x - t0.x1) / plungeTan;
  if (!(zc <= F.zStart + 1e-6 && zc >= F.zEnd - 1e-6)) return false;
  const leadIn = [];
  if (Math.hypot(F.x - t0.x1, zc - t0.z1) > 1e-4) leadIn.push({ type: 'line', x1: F.x, z1: zc, x2: t0.x1, z2: t0.z1 });
  leadIn.push(...tail);
  // Běh vrstvy začíná, kde offset klesne na hloubku + setinu — zbytek
  // dojede pod úhlem zanoření, ne svisle (pravidlo 6).
  let zStartP = P.zStart;
  if (last.x2 > P.x + 1e-4) {
    const z2 = last.z2 - (last.x2 - P.x) / plungeTan;
    leadIn.push({ type: 'line', x1: last.x2, z1: last.z2, x2: P.x, z2 });
    zStartP = Math.min(P.zStart, z2);
  }
  if (!notSteeperThan(leadIn, plungeTan)) return false;
  if (typeof entryOk === 'function' && !entryOk(leadIn)) return false;
  F.zEnd = zc;
  F.noRetract = true;
  delete P.ramp;
  delete P.rampEntryClear;
  P.contourLeadIn = leadIn;
  P.zStart = zStartP;
  P.leadInTrimmed = true;
  P.floorJoin = true;
  return true;
}
