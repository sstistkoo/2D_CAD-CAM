// Tlačítka generování drah v CAM simulátoru: „🔄 Dráhy" × „✂ Po úsecích" × „↺ Reset".
// Vyňato z camSimulator.js (obří soubor nesmí růst) — stav simulátoru `S`
// a jeho akce se předávají parametrem.

/**
 * Která tlačítka jsou SKRYTÁ. Vidět je vždy jen to, co teď opravdu jde
 * použít (přání uživatele 30. 9. 2026), a u programu z úseků buď „🔄 Dráhy",
 * nebo „✂ Po úsecích" — podle nastavení v panelu (13. 10. 2026):
 *  • „✂ Po úsecích" — plán má úseky v rozsahu obrábění (`sectionsOk`), nebo
 *    program z úseků už je (dalším klikem se přegeneruje od začátku). NIKDY
 *    při čelním hrubování: to úseky nemá, klik by skončil chybou.
 *  • „🔄 Dráhy" — v části i bez částí vždy. V náhledu CELÉHO programu jen
 *    u programu z úseků, když „Po úsecích" nejde (čelně) — klik pak části
 *    nahradí jedním programem (`regenWholeProgram`). Části z „➕ Operace"
 *    se v celém programu negenerují (přegeneruje se klikem na chip části).
 *  • „↺ Reset" — jen když program má části.
 *  • Vrtání / závit / upich (záložka nebo nástroj vrták, závitový nůž,
 *    upichovák) úseky nemá — „✂ Po úsecích" se schová, dráhy generuje
 *    jediné „🔄 Dráhy" (uživatel 20. 10. 2026: „tři druhy výběru, měl bych
 *    mít jenom jednu možnost").
 *
 * @param o.hasParts      program je rozdělený na části
 * @param o.allView       náhled „Celý program"
 * @param o.fromSections  části vznikly z „✂ Po úsecích" (první má `baseLimits`)
 * @param o.face          v panelu je čelní hrubování
 * @param o.sectionsOk    `sectionSteps(calc)` nehlásí chybu
 * @param [o.op]          záložka obrábění (hrub, hot, upich, zavit, vrt, vyvrt)
 * @param [o.tool]        tvar nástroje (drill, threading, parting, …)
 * @returns {{ refresh: boolean, section: boolean, reset: boolean }}
 */
export function genButtonsHidden({ hasParts, allView, fromSections, face, sectionsOk, op, tool }) {
  const other = ['upich', 'zavit', 'vrt'].includes(op) || ['drill', 'threading', 'parting'].includes(tool);
  const section = face || other || !(fromSections || sectionsOk);
  const refresh = hasParts && allView && !(fromSections && section);
  return { refresh, section, reset: !hasParts };
}

/**
 * „🔄 Dráhy" v náhledu celého programu z úseků: části nahradí JEDEN program
 * s nastavením z PANELU nad původním polotovarem a rozsahem — totéž jako
 * „↺ Reset" + „🔄 Dráhy". Parametry panelu se nesmí přepsat parametry části:
 * dřív klik jen přepnul na část a ta vrátila své Podélně (nález uživatele
 * 13. 10. 2026: „přepnul jsem na čelní, po kliknutí se to přeplo na podélné
 * hrubování a udělala jedna část").
 *
 * @param S     stav simulátoru
 * @param deps  akce simulátoru: confirm(text) → Promise<bool>, busy(text, fn),
 *              pushHistory(), restoreBaseFromLive(), regen(), toast(text, ms)
 */
export async function regenWholeProgram(S, { confirm, busy, pushHistory, restoreBaseFromLive, regen, toast }) {
  const ok = await confirm('Dráhy nahradí části programu jedním programem s nastavením z panelu (jde vzít zpět přes ↩ Zpět). Pokračovat?');
  if (!ok) return;
  await busy('Generuji dráhy a G-kód…', () => {
    pushHistory();
    restoreBaseFromLive();   // polotovar první části, rozsah uživatele, parametry z panelu
    S.opParts = [];
    S.activePart = 0;
    regen();
  });
  toast('Části nahrazeny jedním programem podle nastavení v panelu', 4000);
}
