// ╔══════════════════════════════════════════════════════════╗
// ║  Kvalita hrubovacího plánu ve dvou číslech                      ║
// ╚══════════════════════════════════════════════════════════╝
//
// Slouží k rozhodnutí, jestli se vyplatí dělit díl na úseky podle hrbů kontury
// (viz ops/long/regions.js). Staticky se to rozhodnout nedá — zkoušeny čtyři
// různé testy a žádný neodělil díly, kde dělení vyjde čistě, od těch, kde držák
// narazí (změřeno 27. 8. 2026). Měří se proto až HOTOVÝ plán a porovnávají se
// dvě varianty téhož dílu.
//
// Měřit JEN průchody u hranic úseků NESTAČÍ: kolize, které dělení způsobí, leží
// jinde v plánu (takovým filtrem prošlo 5 fixtures). Měří se celý plán.

import { ResidualTracker, passCutPolylines } from '../../residualTracker.js';
import { holderAreaAlongResidual } from '../../residualHolder.js';
import { holderWorldLoop } from '../../collisionValidator.js';
import { toolFootprint } from '../../materialRemoval.js';
import { polyArea } from '../../../../geom/geomCore.js';

/** O kolik smí být varianta s dělením horší (mm²), než se zahodí. */
export const HOLDER_INTRUSION_TOL = 0.5;

/**
 * Vrátí `{ holder, residual }`:
 *   `holder`   — největší plocha, kterou držák projede stojícím materiálem,
 *   `residual` — kolik materiálu po hrubování zůstane (dobírá dokončování).
 * `passes` se nemění. Obě čísla dávají smysl jen v POROVNÁNÍ dvou plánů téhož
 * dílu — absolutní hodnota je nenulová i u plánu, který validátor bere jako
 * čistý (na díle uživatele 2,44 mm² při nule nálezů).
 */
export function planQuality(passes, prms, stockPathSegments) {
  const bad = { holder: 0, residual: 0 };
  if (!Array.isArray(passes) || passes.length === 0) return bad;
  let holderLoop = null;
  try { holderLoop = holderWorldLoop(prms, false); } catch { holderLoop = null; }
  const foot = toolFootprint(prms);
  let tracker;
  try { tracker = new ResidualTracker(prms, stockPathSegments, { footprint: foot }); }
  catch { return bad; }
  let worst = 0, reported = false;
  for (const p of passes) {
    try {
      if (holderLoop) {
        for (const pts of passCutPolylines(p)) {
          const a = holderAreaAlongResidual(tracker.loops, holderLoop, pts, {});
          if (a > worst) worst = a;
        }
      }
      tracker.notePass(p);
    } catch (e) {
      // Jeden průchod nesmí shodit měření, ale TICHÉ spolknutí už jednou schovalo
      // ReferenceError a měřidlo pak vracelo nulu — tedy „všechno v pořádku“.
      if (!reported) { reported = true; console.warn('planQuality:', e && e.message); }
    }
  }
  let residual = 0;
  try { residual = Math.abs(polyArea(tracker.loops || [])); } catch { residual = 0; }
  return { holder: worst, residual };
}
