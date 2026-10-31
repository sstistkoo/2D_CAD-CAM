// ╔══════════════════════════════════════════════════════╗
// ║  ČELNÍ PŘEJEZD V Z — DESTIČKA + DRŽÁK × OFFSETOVÁ ČÁRA ║
// ╚══════════════════════════════════════════════════════╝
// Přejezd mezi čelními průchody (`roughEmit.js`, `travelBlocked`) testoval
// jen DESTIČKU (`rapidHitsPlan`, štíhlá stopa) — DRŽÁK vůbec. Validátor
// (`validateToolpath`, planStock) ale u rychloposuvu bere celý držák proti
// offsetové čáře, a tak přejezd, kterým držák projede vůlí kolem odlitku,
// emise pustila a validátor hlásil.
// Nález uživatele 31. 10. 2026 (part-25, čelně zprava): `G0 X37.740` →
// `G0 Z20.932` podél válce Ø70 — držák 9,9 mm² ve vůli.
//
// Měří se jako validátor: držák zmenšený o SHRINK proti PLÁNOVACÍMU zbytku
// emise (`rapidStockPlan` = offsetová čára minus vydané řezy), práh TOL.
// (Posunout o vůli živý `rapidStock` NEJDE: vůle naroste i do vyříznutých
// drážek a přejezdy nad nimi se zbytečně zvedají.)
import { toolSweep, polyOffset, polyArea } from '../../geom/geomCore.js';
import { holderWorldLoop } from './collisionValidator.js';
import { insertWorldLoop } from './materialRemoval.js';
import { getInsert } from './inserts/index.js';

// Držák jako tests/cam-collision-free (offsetová čára): zmenšení 0,25, práh 0,5.
const HOLDER = { shrink: 0.25, tol: 0.5 };
// Destička PŘÍSNĚ — „žádný dotek": přejezdy jsou krátké (4 mm), takže roh,
// který sjede o 1 mm do vůle, vyrobí plochu pod 0,5 mm² a práh validátoru ho
// pustí (uživatel 31. 10. 2026, konec dílu: `G0 X41.370` → `G0 Z4.932`,
// roh destičky 3,85 mm pod nosem stojí přímo na povrchu Ø77,1).
const INSERT = { shrink: 0.05, tol: 0.05 };

// Testuje se DRŽÁK a CELÁ DESTIČKA. `rapidHitsPlan` zná jen štíhlou řeznou
// stopu (nos + břit); natočená SNMG má ale zadní roh níž než nos a ten
// přejezd na X38,356 pořád projel polotovarem (uživatel 31. 10. 2026:
// „plátek to projede znova, jenom se to nezabarví červeně").
//
// UPICHOVÁK (`cutsFullWidth`): DRŽÁK se nehlídá — plánovací model si jeho
// zápichy zapisuje štíhlou stopou, ne celou šířkou těla, takže mezi zápichy
// v něm stojí fantom: přejezd 3 mm na X19,55 tam „narazil" 56 mm², kdežto
// validátor (řeže celou destičkou) je čistý; zbytečné zdvihy až na X65
// (part-18-parting-90-ramp, part-20-zleva-parting-taper). DESTIČKA ano:
// sjezd na X44,170 dosedl tělem 0,5 mm² do vůle (face-parting, part-16/18/20).
//
// OD 31. 10. 2026 PLATÍ PRO VŠECHNY RYCHLOPOSUVY EMISE (`holderHitsRapid`
// a výchozí `minRapidX` sjezdu v gcodeEmit.js), nejen čelní přejezd: podélně
// zleva najetí na průchod `G0 Z193.478` → `G0 X60.545` drhlo tělem natočené
// destičky po čele příruby Z196,28 (21,5 mm² do materiálu, part-11/12/14/21).
//
// Vrátí predikát (x1, z1, x2, z2) → narazí rychloposuv z bodu 1 do 2 do vůle?
// `planModel` je živý objekt (mění se řezy) nebo funkce, která ho vrátí
// (v emisi vzniká až po vytvoření kontroly); obrysy se postaví líně.
export function makeFaceTransitGuard(prms, planModel) {
  const model = typeof planModel === 'function' ? planModel : () => planModel;
  const parting = !!getInsert(prms).cutsFullWidth;
  let bodies;
  const build = () => {
    const left = (prms.roughingSide || 'right') === 'left';
    const body = (l, k) => (l && l.length >= 3 ? { loop: polyOffset([l], -k.shrink)[0] || l, tol: k.tol } : null);
    const hl = !parting ? holderWorldLoop(prms, left) : null;
    bodies = [body(insertWorldLoop(prms, left), INSERT), body(hl, HOLDER)].filter(Boolean);
  };
  return (x1, z1, x2, z2) => {
    // Vypnuté „Hlídat geometrii (destička + držák)" vypíná i tohle hlídání
    // (tests/range-entry-ramp: bez hlídání kolize BÝT musí — jinak test nic neměří).
    if (!prms.respectInsertGeometry || globalThis.__DISABLE_HOLDER_CLAMP__) return false;
    const pm = model();
    if (!pm) return false;
    try {
      if (!bodies) build();
      const pts = [{ x: x1, z: z1 }, { x: x2, z: z2 }];
      for (const b of bodies) if (Math.abs(polyArea(pm.collide(toolSweep(b.loop, pts)))) > b.tol) return true;
    } catch { /* model je jen pro rychloposuvy — bez nálezu */ }
    return false;
  };
}

// Nejnižší X, kam smí RYCHLOPOSUVOVÝ sjezd v X na Z `z` (z `fromX` k `tx`),
// aby celá destička zůstala nad offsetovou čarou; −∞ = celý sjezd volný.
// Zbytek pod tou mezí dojede emise posuvem (`descend` v emitDescendX).
export function rapidFloorX(guard, fromX, tx, z) {
  if (!(fromX - tx > 1e-6) || !guard(fromX, z, tx, z)) return -Infinity;
  let lo = tx, hi = fromX;              // lo = naráží, hi = volno
  for (let k = 0; k < 20; k++) { const m = (lo + hi) / 2; if (guard(fromX, z, m, z)) lo = m; else hi = m; }
  return Math.min(fromX, Math.ceil(hi * 1000) / 1000);
}
