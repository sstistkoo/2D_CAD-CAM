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

// ── VRSTVU NA SCHODU ZASTÍNÍ DALŠÍ VRSTVA ─────────────────────────────────
// Když navazující vrstva (tělem, nájezdem nebo dojezdem „zarovnání schodku")
// projede v KAŽDÉM Z dráhy vrstvy na schodu stejně hluboko nebo hlouběji,
// vrstva na schodu nic neubere navíc — jen pojede dno podruhé. Audit
// 23. 11. 2026, lathe-zigzag-left-valley `N5420`: vrstva na plošině X35,356
// přesáhla oknem nad údolí (tenká vrstva 1,16 mm mezi X36,545 a X34,545)
// a dojezd další vrstvy (`N5490`) pak celou plošinu sjel znovu.
// U další vrstvy se počítá jen TĚLO a DOJEZD: nájezdy (rampa, po stěně) se
// po vytvoření ještě přestavují (řetězy, přeřazení přes hrb) — v-insert-size
// zastínil schod X83,2 nájezd po stěně, který pak skončil jinde a dno jelo
// 86 mm vzduchem.

const passSegs = (p, entry = true) => {
  const out = [];
  if (entry && p.ramp) out.push({ x1: p.ramp.x0, z1: p.ramp.z0, x2: p.x, z2: p.zStart });
  if (entry) for (const s of p.contourLeadIn || []) out.push(s);
  out.push({ x1: p.x, z1: p.zStart, x2: p.x, z2: p.zEnd });
  for (const s of p.contourLeadOut || []) out.push(s);
  return out.filter((s) => [s.x1, s.z1, s.x2, s.z2].every(Number.isFinite));
};

// Nejnižší X dráhy `segs` v místě z (null = tam nejede).
const lowXAt = (segs, z) => {
  let best = null;
  for (const s of segs) {
    const lo = Math.min(s.z1, s.z2), hi = Math.max(s.z1, s.z2);
    if (z < lo - 1e-6 || z > hi + 1e-6) continue;
    const x = hi - lo < 1e-9 ? Math.min(s.x1, s.x2) : s.x1 + (s.x2 - s.x1) * (z - s.z1) / (s.z2 - s.z1);
    if (best === null || x < best) best = x;
  }
  return best;
};

/**
 * @param floor  průchody vrstvy na schodu
 * @param next   průchody navazující (hlubší) vrstvy
 * @returns true, když `next` (tělo + dojezd) v každém Z dráhy `floor` jede aspoň stejně hluboko
 */
export function floorShadowedByLayer(floor, next, tol = 0.03, h = 0.25) {
  if (!floor.length || !next.length) return false;
  const nSegs = next.flatMap((p) => passSegs(p, false));
  for (const p of floor) {
    for (const s of passSegs(p)) {
      const n = Math.max(1, Math.ceil(Math.abs(s.z2 - s.z1) / h));
      for (let k = 0; k <= n; k++) {
        const t = k / n, z = s.z1 + (s.z2 - s.z1) * t, x = s.x1 + (s.x2 - s.x1) * t;
        const xn = lowXAt(nSegs, z);
        if (xn === null || xn > x + tol) return false;
      }
    }
  }
  return true;
}
