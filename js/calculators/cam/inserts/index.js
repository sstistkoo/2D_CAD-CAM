// ╔════════════════════════════════════════════════════════╗
// ║  ROZCESTNÍK PRAVIDEL PLÁTKŮ                                    ║
// ╚════════════════════════════════════════════════════════╝
//
// PROČ TO EXISTUJE: generátor drah je JEDEN pro všechny plátky (4 670 řádků)
// a tvar destičky do něj vstupoval na 23 místech jako `prms.toolShape === '…'`.
// Znamenalo to, že zásah kvůli jednomu plátku mohl změnit dráhy jinému — což
// se 27. 8. 2026 taky stalo (úprava pro upichovák rozvedla booleovskou
// a scan-line větev na `part-1` s POLYGONÁLNÍ destičkou o 22 mm² úběru).
//
// Teď má každý plátek SVůJ soubor s pravidly a generátor se jich jen ptá.
// Změna pro upichovák se dělá v `parting.js` a na polygon fyzicky nedosáhne.
//
// Pravidla jsou ČISTÁ DATA odvozená z parametrů — žádný stav, žádný import
// generátoru, takže tu nemůže vzniknout cyklická závislost.
import { partingInsert } from './parting.js';
import { polygonInsert } from './polygon.js';
import { roundInsert } from './round.js';
import { threadingInsert } from './threading.js';

const BY_SHAPE = {
  parting: partingInsert,
  polygon: polygonInsert,
  round: roundInsert,
  threading: threadingInsert,
};

/** Pravidla plátku pro dané parametry. Neznámý tvar → kulatá (nos R). */
export function getInsert(prms) {
  const make = BY_SHAPE[prms && prms.toolShape] || roundInsert;
  return make(prms || {});
}
