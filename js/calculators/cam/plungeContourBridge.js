// ╔══════════════════════════════════════════════════════════════╗
// ║  MEZNÍ ČÁRA ZANOŘENÍ JAKO KONTURA MATERIÁLU                   ║
// ╚══════════════════════════════════════════════════════════════╝
//
// VLASTNÍ SOUBOR ZÁMĚRNĚ (uživatel 10. 9. 2026: *„udělej to tak, aby to
// nezasáhlo do dalšího obrábění, vytáhni to, dej tomu svůj soubor"*).
// Zásah pro JEDEN tvar plátku se v tomhle generátoru dvakrát rozlil do
// ostatních — naposledy tím, že se podmínka opřela o `plungeClearance`,
// kterou má i polygon. Pravidlo proto stojí na KLÍČI PLÁTKU
// (`plungeGuideCutsContour` v `inserts/*.js`) a bydlí mimo pipeline, aby
// bylo na první pohled vidět, koho se týká.
//
// CO TO DĚLÁ: mezní čára zanoření byla u kulaté destičky jen VIZUALIZACE —
// `buildMachinableContour` se pro ni vůbec nevolal, protože obě větve
// v `calculatePipeline.js` stojí na `clearance`, a ta je u kulaté `null`
// (celý břit je nos, boční hlídání nemá). Hrubování proto po čáře
// nezastavilo a stěnu strmější než úhel zanoření sjíždělo PO KONTUŘE, tedy
// strměji, než plátek smí (na dílu uživatele kužel 69,5° a oblouk R 10).
//
// Teď je z čáry MOST jako u polygonu: vrstvy o něj zarazí a materiál pod ní
// zůstane — přesně to, co ta čára v náhledu kreslí. Je to VĚDOMÁ ZMĚNA proti
// poznámce ze 7. 9. 2026 („čára je hranice, ne řez"), vyžádaná uživatelem.
//
// ZMĚŘENO 9. 9. 2026 na dílu uživatele (kulatá R 5, ap 2,5, 45°):
//   řezy strmější než 45°  32 → 7        (kužel i oblouk: 24 → 0)
//   pás Z 160…180          0 % → 25 %    (polygon tam má 9 %)
//   úběr                   5 002 → 5 115 mm²
//   duplicitní dráhy       53 → 13
//   zajetí do kontury      0 → 0
// CENA, KTERÁ JE ZATÍM NEVYŘEŠENÁ: tvrdé kolize držáku 4 → 16 (řetěz
// dobírání sjíždí po té čáře až do 30 mm hluboké kapsy, kam se držák
// nevejde) a dvě třísky nad `ap` v krku (4,02 a 4,71 mm). Než se to
// spraví, NENÍ to hotová oprava.
import { buildMachinableContour } from './contourBuild.js';
import { _locateOnContour } from './camMath.js';
import { getInsert } from './inserts/index.js';

/**
 * Postaví obrobitelnou konturu z mezních čar zanoření — jen pro plátek,
 * který to má v pravidlech, a jen když ji nepostavila žádná větev před tím.
 *
 * @param {object} prms            parametry CAM
 * @param {object|null} plungeClearance  `getPlungeGuardRange(...)`
 * @param {Array|null} machinableContour už postavená kontura (null = není)
 * @param {Array} contourSegments  kontura ke zmostování
 * @param {Array} interferenceGuides mezní čáry
 * @returns {{machinableContour: Array, contourSegments: Array, interferenceGuides: Array}|null}
 *          null = nic se nemění (volající si nechá své hodnoty)
 */
export function bridgePlungeGuidesIntoContour(
  prms, plungeClearance, machinableContour, contourSegments, interferenceGuides,
) {
  if (machinableContour) return null;                       // postavila ji jiná větev
  if (!plungeClearance || !prms.respectInsertGeometry) return null;
  if (!getInsert(prms).plungeGuideCutsContour) return null; // tenhle tvar to nechce
  const pgs = interferenceGuides.filter(g => g.plungeLimit && !g._dominated);
  if (pgs.length === 0) return null;

  const mc = buildMachinableContour(contourSegments, pgs);
  if (!mc || mc.length === 0) return null;
  return {
    machinableContour: mc,
    contourSegments: mc,
    // Táž podmínka jako v obou větvích `calculatePipeline.js`: čára, jejíž
    // dolní konec sedí na POLOTOVARU, na kontuře z definice neleží — a přesto
    // platí.
    interferenceGuides: interferenceGuides.filter(g =>
      !g._dominated && (
        g.downOnStock || g.downClipped ||
        (_locateOnContour(mc, { x: g.x1, z: g.z1 }) &&
         _locateOnContour(mc, { x: g.x2, z: g.z2 })))),
  };
}
