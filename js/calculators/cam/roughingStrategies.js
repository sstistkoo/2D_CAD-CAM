// ╔════════════════════════════════════════════════════════╗
// ║  CAM – rozcestník hrubovacích strategií                         ║
// ╚════════════════════════════════════════════════════════╝
//
// Každá OPERACE má svůj soubor v `ops/`, každý PLÁTEK svá pravidla
// v `inserts/`. Tady zbyl už jen registr: která volba v panelu spouští co.
//
// PŘIDÁNÍ STRATEGIE:
//   1. nový soubor v `ops/` s funkcí genXxxPasses(ctx), která naplní ctx.passes,
//   2. záznam do ROUGHING_STRATEGIES níž (klíč + genPasses + label),
//   3. zavádí-li nový pass.type, obsloužit ho ve třech dispatch místech
//      v camSimulator.js (ořez Z-limitů, emise G-kódu, vykreslení).
import { genFacePasses } from './ops/roughFace.js';
import { genLongPasses } from './ops/roughLong.js';

export { genFacePasses, genLongPasses };
// genPasses(ctx) naplní ctx.passes; label se použije v hlavičce G-kódu.
// Cílově sem přibudou zápichy ('grooving').
//
// „PODELNE ZLEVA" (druhá strana) NENÍ vlastní algoritmus: je to přesné
// zrcadlo podélného hrubování, takže se celý CAM svět překlopí v ose Z
// (calculatePipeline.js + zMirror.js) a použije se TÝŽ genLongPasses —
// v zrcadle jede standardně zprava doleva. Zleva tak platí beze zbytku
// všechno, co umí pravá strana: kapsy, zanořovací rampy, dojezdy „bez
// schodků", hlídání geometrie destičky i obálka držáku.
export const ROUGHING_STRATEGIES = {
  longitudinal: { genPasses: genLongPasses, label: 'PODELNE' },
  face: { genPasses: genFacePasses, label: 'CELNI' },
  backside: { genPasses: genLongPasses, label: 'PODELNE ZLEVA' },
};
