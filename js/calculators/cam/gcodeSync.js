// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – synchronizace NÁHLEDU a PROGRAMU (čisté funkce)        ║
// ╚══════════════════════════════════════════════════════════════╝
//
// V simulátoru žijí DVĚ dráhy vedle sebe a každá se obnovuje jinak:
//
//   NÁHLED  = `S._cachedCalc` z calculate() — šrafování hrubovacích průchodů,
//             offsetová čára, mezní čáry. Počítá se z PARAMETRŮ, čerstvě po
//             každé změně v panelu.
//   PROGRAM = `S.manualGCode` — co je v editoru, co se exportuje a z čeho se
//             počítá simulovaná dráha i hlídání kolizí. Sám se nepřepočítává.
//
// Ty dvě věci se proto můžou rozejít. Odtud dva stavy programu:
//   `S.gcodeDirty` — je v něm ruční zásah (textarea, CAM Editor, tažení uzlů
//                    dráhy, Prodl/Ořez, poznámka z CAD). Chráněný.
//   „stale"        — pochází z jiných vstupů, než jaké jsou teď nastavené
//                    (`S.gcodeKey` × aktuální `pathInputsKey`).
//
// Tenhle modul drží JEDINÉ pravidlo, podle kterého se po změně nastavení
// rozhoduje, co se stane s programem — ať se nechová každý ovládací prvek
// panelu jinak. Testy: tests/cam-gcode-sync.test.js.

/**
 * FNV-1a otisk řetězce (32 bit, hex). Otisk vstupů se ukládá do localStorage,
 * do projektu i do KAŽDÉHO snímku historie, takže se tam nesmí vozit celá
 * serializace parametrů a kontury — jen krátký hash. Kolize by znamenala
 * jedinou věc: neukázaný puntík „neaktuální" (ne špatné dráhy).
 */
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/**
 * Otisk všeho, z čeho `generateAutoGCode()` staví dráhy. Liší-li se od
 * `S.gcodeKey`, pochází program z jiného nastavení, než jaké je teď v panelu.
 *
 * `toolTipMirror` je vyňatý schválně: je to jen kosmetika náhledu destičky
 * (viz camDefaults), do drah nevstupuje — jinak by jeho přepnutí hlásilo
 * program jako neaktuální.
 */
export function pathInputsKey(S) {
  const { toolTipMirror, ...p } = S.params;
  // Klíče se řadí: POŘADÍ vlastností v `S.params` se liší podle toho, odkud
  // stav přišel (`Object.assign` nad výchozími hodnotami z localStorage ×
  // klon záznamu části), a otisk se nesmí rozejít jen kvůli tomu — hlásil by
  // neaktuální dráhy tam, kde se nic nezměnilo.
  const params = Object.keys(p).sort().map(k => [k, p[k]]);
  return hash32(JSON.stringify([params, S.contourPoints, S.stockPoints, S.zLimits,
    S.xLimits, S.guideLines, S.flipX, S.flipZ, S.activeMagazineSlot]));
}

/** Program právě vznikl z aktuálních vstupů — čistý a aktuální. */
export function markGCodeGenerated(S) {
  S.gcodeDirty = false;
  S.gcodeKey = pathInputsKey(S);
}

/**
 * Do programu se ručně sáhlo — od teď ho automatika nesmí přepsat.
 * `gcodeKey` se ZÁMĚRNĚ nemění: ruční zásah neříká nic o tom, jestli dráhy
 * odpovídají parametrům (a když neodpovídaly, mají to hlásit dál).
 */
export function markGCodeEdited(S) {
  S.gcodeDirty = true;
}

/** Program pochází z jiných vstupů, než jaké jsou teď nastavené.
 *  Bez otisku (`null`/`undefined` — program neznámého původu) se nehlásí nic:
 *  radši mlčet než svítit puntíkem u drah, o kterých nic nevíme. */
export function gcodeStale(S) {
  return S.gcodeKey != null && S.gcodeKey !== pathInputsKey(S);
}

/**
 * Běží režim, který program NAHRAZUJE — závitovací nebo upichovací cyklus
 * (viz early-return v `generateAutoGCode`). Takový cyklus nemá vlastní náhled
 * drah, takže bez přegenerování programu není na plátně vůbec vidět: závit se
 * nekreslí nijak, u upichnutí se kreslí jen rovina řezu a úchopy, ne samotný
 * (peckovaný) cyklus.
 */
export function cycleModeActive(prms) {
  return !!prms.threadActive
    || (prms.partOffZ != null && isFinite(parseFloat(prms.partOffZ)));
}

/**
 * JEDINÉ pravidlo pro obnovu po změně nastavení:
 *   program se přegeneruje SÁM jen tehdy, když (a) by změna jinak nebyla vidět
 *   (běží/mění se cyklový režim) A ZÁROVEŇ (b) v programu nejsou ruční úpravy.
 *   Jinak se překreslí jen náhled a program počká na „🔄 Dráhy".
 *
 * `cycle: true` předává změna SAMOTNÉHO režimu (zapnutí/vypnutí závitu,
 * naklikání/zrušení upichnutí) — tam se podmínka (a) posuzuje podle toho, že
 * se režim mění, ne podle toho, jestli je zrovna zapnutý. Bez toho by zrušené
 * upichnutí nechalo v programu viset upichovací cyklus.
 *
 * @returns {'regen'|'preview'}
 */
export function decideChange(S, { cycle = false } = {}) {
  return ((cycle || cycleModeActive(S.params)) && !S.gcodeDirty) ? 'regen' : 'preview';
}
