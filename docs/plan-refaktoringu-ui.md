# Plán: rozdělení `js/ui.js`

> Stav 16. 10. 2026: **5 312 ř.**, strop v `tests/file-size-budget.test.js` = 5 312 (+15).
> Zadal uživatel 16. 10. jako samostatnou práci na nové sezení (CLAUDE.md:
> refaktoring obřího souboru = vědomé rozhodnutí). Postup stejný jako u
> simulátoru (`docs/plan-rozdeleni-cam-simulatoru.md`) a `geometry.js`
> (7b0622c): **od toho, u čeho nejméně hrozí, že něco přestane fungovat**, a s testy.

## Stav

| Krok | Commit | ui.js po kroku | Test |
|---|---|---|---|
| Fáze 0 — pojistky | `test(ui): pojistky…` | 5 312 | `ui-api` (exporty, bridge, 92 listenerů, DOM při načtení, stráže) |
| 1a poznámky → `js/ui/notesDialog.js` | `refactor(ui): poznámky…` | 4 947 | `ui-notes` |
| 1d kalkulačka → `js/ui/calculator.js` (+ `initCalcButtons()`) | `refactor(ui): kalkulačka…` | 4 437 | `ui-calculator` |
| 1c Trigonometrie → `js/ui/trigCalc.js` | `refactor(ui): Trigonometrie…` | 4 216 | `ui-trig` |

1d se dělala před 1c: Trigonometrie čte `_calcLastResult` kalkulačky — stav
se stěhuje s funkcí, která ho píše (pravidlo 6), Trigonometrie ho čte přes
`getCalcLastResult()` (jediná změněná řádka mimo hlavičky/importy).
`_lastFocusedInput` (píše ho focusin listener při načtení, čte `openCalculator`)
je stav modulu `calculator.js`, listener v `initCalcButtons()`.

Při stěhování: `npm run sw` spouštět s `LC_ALL=cs_CZ.UTF-8` (generátor řadí
`localeCompare` podle systému — v C locale přeskládá „ch…" soubory a diff sw.js
se zanese šumem). Kontrolní skript doslovnosti: úsek modulu musí být souvislý
úsek `git show HEAD:js/ui.js`.

## Nalezené chyby (opravit zvlášť, ne při stěhování)

1. **Poznámky: Escape v poli Hledat zavře celé okno**, ne jen lištu hledání —
   keydown bublá z inputu na `document` k ESC handleru `makeOverlay`
   (obsah se uloží, takže se nic neztratí). Oprava: `e.stopPropagation()`
   u Escape v `searchInput` keydown. Test `ui-notes` teď stávající chování
   charakterizuje — při opravě ho upravit.

## Co v souboru je (měřeno 16. 10.)

ui.js NENÍ jedna funkce jako simulátor: 79 top-level deklarací + **731 ř. kódu,
který běží při načtení** (listenery tlačítek, registrace do `bridge`,
`loadLineStylePref()`, MutationObserver…). Importuje ho 35 souborů; z venku se
používá 28 jmen (nejvíc `setHint` 19×, `resetHint` 18×, `updateObjectList` 16×,
`updateProperties` 11×) a dynamicky `import('../ui.js').then(m => m.openCalculator())`
(camEditor, cncEditor, camSimulator, tolerance).

| Řádky | Téma | Hlavní obsah | ř. |
|---|---|---|---|
| 1–109 | jádro | importy, `bridge.*`, `persistSettings` (`let _persistTimer`), `deleteObjectsByIndices` | 109 |
| 110–755 | seznam objektů | `updateObjectList` (499), `_toggleSegmentSelection`, skok do CNC (`scrollCncToObject`, `let _lastCncJumpSelection`) | 646 |
| 756–1860 | **panel vlastností** | `updateProperties` (**1105** = 21 % souboru) | 1105 |
| 1861–2017 | průsečíky | `updateIntersectionList`, `togglePanel` | 157 |
| 2018–2477 | barvy | převody HSV/RGB, kapátko, `openColorPicker` (285), barva vrstvy/objektu/výplně | 460 |
| 2478–2732 | vrstvy + lišta | `updateLayerList`, tlačítka vrstev, přídavek (`btnAllowance`), `[data-tool]` (74) | 255 |
| 2733–3193 | nástroje + stav | `setTool` (84), snap/úhel/kóty/souř. režim/X/typ stroje, nulový bod | 461 |
| 3194–3484 | dialogy | nulový bod (106), Zpět/Znovu, Smazat vše, historie (122) | 291 |
| 3485–4238 | kalkulačka | `openCalculator` (426), `openTrigCalc` (221), plovoucí 🔢 a schránka (`let _calcClipboardValue`, `_calcLastResult`, `_lastFocusedInput`), tlačítka CNC kalkulaček | 754 |
| 4239–4641 | editor + poznámky | `openDrawCncEditor`, CAM/AI/VK tlačítka, **poznámky** = anonymní listener `btnOpenNotes` (367) | 403 |
| 4642–4804 | drobné | mřížka, úhel, stav projektu, nápověda, `applyTheme` | 163 |
| 4805–5312 | **nastavení** | `showSettingsDialog` (503) + 3 listenery | 508 |

Vazby přes témata (deklarace): `updateProperties` ↔ `updateObjectList` (cyklus,
volají se navzájem), vlastnosti → barvy, vrstvy → barvy (`ICON_EYE_*`),
nastavení → lišta/stav/jádro/historie, historie → seznamy. Kód při načtení
používá: tlačítka vrstev → seznamy; `[data-tool]` → `setTool`; document `click`
(ř. 3128) → přepínače lišty; 🔢/📋 → kalkulačka. **Poznámky (367 ř.) a
`openDrawCncEditor` nepoužívají nic jiného z ui.js — čisté listy.**

Nástroje na měření (ve scratchpadu minulého sezení, snadno znovu napsat — @babel/parser
je v devDependencies): seznam deklarací s vazbami přes hranice témat
(`geodeps.mjs <repo> js/ui.js 1:jadro 110:seznam …`) a totéž pro kód při načtení
(`uiside.mjs`). Pro vnitřek `updateProperties` bude potřeba obdoba
`scripts/sim_coupling.mjs` (které lokální proměnné funkce čte/přepisuje která větev).

## Pravidla

1. **Žádná změna chování.** Kód se jen přestěhuje DOSLOVA. Nalezenou chybu zapsat,
   opravit zvlášť (samostatný commit).
2. **Jeden blok = jeden commit**, po každém kroku aplikace funguje.
3. **Nejdřív test, pak stěhování.** Test projde na STARÉM kódu, pak přesun, test beze změny.
4. **`js/ui.js` zůstane rozcestník se STEJNÝM seznamem exportů** (jako `geometry.js`).
   Kód zvenku importuje jen z `js/ui.js`, nikdy z `js/ui/*` — jinak by přestaly
   platit `vi.mock('../js/ui.js', …)` ve 12 testech (mockují rozcestník; moduly
   v `js/ui/` se pak vůbec nenačtou). Hlídat testem (vzor: importní stráž
   v `tests/cam-insert-isolation.test.js`).
5. **Moduly v `js/ui/` nemají kód při načtení.** Listenery a volání se zabalí do
   `export function initXxx()` a ui.js je volá **v původním pořadí** na původním
   místě. Důvod: rozcestník vyhodnotí všechny importy DŘÍV než svoje tělo —
   kdyby moduly věšely listenery samy, změnilo by se pořadí (záleží na něm
   u `document` listenerů `click` / `focusin`) a `loadLineStylePref()` by běžel
   jindy.
6. Funkce volané při načtení (synchronně) → obyčejný export, ne továrna (TDZ).
   Stav modulu (`let`) se stěhuje s funkcemi, které ho píšou; zvenku jen přes
   exportované get/set (jako `getCalcClipboardValue`).
7. Nový soubor ~300–500 ř. Po každém kroku **snížit strop** v `file-size-budget`.
8. Nový JS soubor → `npm run sw`. Dokumentace: `docs/developer.md` (kde co žije).
9. Práce mimo CAM → stačí **`npm run test:cad`** (CLAUDE.md), i před push.
10. Kam: `js/ui/` (vzor `js/geometry/`). Hlavička modulu: odkud vyňato a že se
    importuje přes `js/ui.js`.

## Fáze 0 — pojistky (bez stěhování)

1. **`tests/helpers/uiDom.mjs`** — happy-dom s `<body>` z `index.html` (vzor
   `installSimDom` v `tests/helpers/simUi.mjs`), stub canvasu, `localStorage`,
   IndexedDB podle potřeby. Ověřit, že `import('../js/ui.js')` v něm projde.
2. **`tests/ui-api.test.js`** (vzor `tests/geometry-api.test.js`):
   - snímek seřazeného seznamu exportů ui.js (vč. `openCalculator`);
   - snímek klíčů, které ui.js zaregistruje do `bridge`;
   - **snímek pořadí listenerů při načtení**: před importem obalit
     `EventTarget.prototype.addEventListener` a zapsat `(id/selektor prvku, typ)`
     v pořadí registrace. Hlídá pravidlo 5 — přesun nesmí listener ztratit ani
     přehodit.
3. Importní stráž: nic mimo `js/ui.js` a `js/ui/` neimportuje `js/ui/*`.
4. Commit „test(ui): pojistky před rozdělením ui.js".

Charakterizační testy jednotlivých bloků se píší až v dané fázi (pravidlo 3).

## Fáze 1 — čisté listy (nejmenší riziko)

Nevolá je nic z ui.js kromě jednoho listeneru; samy z ui.js nic nepoužívají
nebo jen exportované funkce.

| Krok | Blok | Nový modul | Test před přesunem |
|---|---|---|---|
| 1a | poznámky (listener `btnOpenNotes`, 367) | `js/ui/notesDialog.js` → `openNotesDialog()` | klik → okno, záložky, uložení do IDB (`setMeta('userNotesAll')`), migrace starého `userNotes` |
| 1b | `openDrawCncEditor` + listenery editoru | `js/ui/drawCncEditor.js` | otevře CNC editor z desktop/mobil tlačítka |
| 1c | `openTrigCalc` | `js/ui/trigCalc.js` | výpočet trojúhelníku → výsledek, tlačítko 🔢 |
| 1d | `openCalculator` + 🔢/📋 + `let` schránky | `js/ui/calculator.js` (+ `initCalcButtons()`) | výrazy, schránka get/set, vložení do posledního inputu, dynamický import z cncEditoru |
| 1e | barvy (převody, kapátko, `openColorPicker`, 3 obaly) | `js/ui/colorPicker.js` | převody HSV↔RGB čistě; picker → `obj.color` / barva vrstvy + undo |

Po Fázi 1 odhad ~3 650 ř.

## Fáze 2 — dialogy a seznamy

| Krok | Blok | Nový modul |
|---|---|---|
| 2a | `showSettingsDialog` (503) | `js/ui/settingsDialog.js` — importuje přepínače lišty z rozcestníku zpět (cyklus jen přes funkce = v pořádku) |
| 2b | nulový bod, historie, Smazat vše, mřížka/úhel | `js/ui/dialogs.js` (případně 2 soubory) |
| 2c | `updateIntersectionList`, `togglePanel` | `js/ui/intersectionList.js` |
| 2d | `updateLayerList` + tlačítka vrstev | `js/ui/layerList.js` |
| 2e | `updateObjectList` (499) + výběr segmentu + skok do CNC | `js/ui/objectList.js` + `js/ui/cncJump.js` |

Test nastavení: každé pole dialogu → `state` / `localStorage` (`persistSettings`),
Zrušit nic nezmění. Seznamy: render řádků z fixture výkresu, klik = výběr,
oko/zámek vrstvy, smazání (`deleteObjectsByIndices`).

## Fáze 3 — lišta a stav

`setTool`, `[data-tool]`, snap/úhel/kóty/režim souřadnic/zobrazení X/typ stroje,
`document` click (ř. 3128), nápověda, `applyTheme` → `js/ui/toolbar.js`
+ `js/ui/statusButtons.js`. Nejvíc importérů (`setHint`, `resetHint`, `setTool`)
— díky rozcestníku se jim nic nemění, ale snímek pořadí listenerů tady hlídá nejvíc.

## Fáze 4 — panel vlastností `updateProperties` (1105, nejrizikovější)

Struktura: žádný výběr → vícenásobný výběr → `switch (obj.type)`: point,
line/constr (~220), circle, arc, rect (~218), polyline (~150), text (~100) →
společná část. Větve sdílejí lokální proměnné funkce (HTML, panel, pomocné
closury) — **nejdřív změřit**, co která větev čte/přepisuje (obdoba
`sim_coupling.mjs`), pak teprve rozhodnout ctx vs. návratová hodnota.

- Test PŘED: pro každý typ z fixture výkresu vybrat objekt → snímek HTML panelu;
  změnit pole (X, Y, R, úhel, délka, text…) → `state.objects` změněno, `pushUndo`
  zavolán, `renderAll` zavolán. Vícenásobný výběr totéž.
- Cíl: `js/ui/properties/index.js` (kostra + společná část) + `line.js`, `rect.js`,
  `polyline.js`, `arcCircle.js`, `text.js`, `multi.js` (každý < 300 ř.).
- Případně dvě sezení: nejdřív měření + testy, pak stěhování.

## Konec

ui.js = rozcestník (importy, `bridge`, exporty, volání `initXxx()` v původním
pořadí), odhad < 200 ř. Pak: vyřadit ui.js ze seznamu obřích souborů v CLAUDE.md,
strop v budgetu na skutečnost, `docs/developer.md`, CHANGELOG.

## Kontrolní seznam každého kroku

1. charakterizační test bloku projde na starém kódu (`git stash push -- js/ui.js` pro ověření);
2. přesun skriptem (Python, utf-8, `newline=''`, zápis přes `.tmp` + `os.replace`;
   **ne heredoc s `\n`/`\\` v JS** — rozbije escapy);
3. tělo modulu = text z HEAD (kontrolní skript, rozdíl jen hlavička/importy/`export`);
4. `npm run lint` + přísná kontrola globálů:
   `npx eslint --no-config-lookup --rule '{"no-undef":"error"}' js/ui.js js/ui/*.js`
   (odhalí skryté `window` globály, které běžný lint pustí);
5. `npm run sw`, `npm run test:cad`;
6. prohlížeč (`skica-static`, nejdřív odregistrovat SW): proklikat přesunutý blok, konzole bez chyb;
7. snížit strop, `docs/developer.md`, commit (push jen na pokyn uživatele).

## Pasti

- **Cyklus importů** ui.js ↔ cnc-calcs.js ↔ camSimulator.js a moduly
  `cam/sim/*` (sendToCanvas, paramsEventsGeneral, holderCadDraw) importují ui.js.
  V pořádku, dokud se importy nepoužijí při načtení — nový kód při načtení
  (`initXxx()`) smí volat jen funkce, ne číst `const` z jiného modulu cyklu.
- `bridge.openFillColorPicker = openFillColorPicker` (ř. 2475) je přiřazení
  hodnoty, ne šipka — po přesunu musí zůstat stejná funkce (import do rozcestníku).
- 12 testů mockuje `../js/ui.js` továrnou s vyjmenovanými funkcemi — pokud
  modul v `js/ui/` začne importovat jiný modul přímo a ten test ho načte jinou
  cestou, mock nezabere (pravidlo 4).
- `document.getElementById(...).addEventListener` bez `?.` spadne, když prvek
  v DOM testu chybí — harness musí mít celé `<body>` z `index.html`.
- Dynamický `import('../ui.js')` z editorů → `openCalculator` musí zůstat
  exportem rozcestníku (snímek exportů to hlídá).
