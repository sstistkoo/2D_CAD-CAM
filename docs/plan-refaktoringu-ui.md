# Plán: rozdělení `js/ui.js`

> **HOTOVO 16. 10. 2026:** `ui.js` 5 312 → **156 ř.** (rozcestník), kód v 16 modulech
> `js/ui/` + balíku `js/ui/properties/` (6 souborů), strop v `file-size-budget` = 156. Zbývá jen
> „Nalezené chyby" níž — opravit zvlášť, po dohodě s uživatelem.
>
> Výchozí stav 16. 10. 2026: **5 312 ř.**, strop v `tests/file-size-budget.test.js` = 5 312 (+15).
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
| 1b spouštěcí tlačítka → `js/ui/launchers.js` (+ `initLauncherButtons()`) | `refactor(ui): spouštěcí tlačítka…` | 4 162 | `ui-launchers` |
| 1e výběr barvy → `js/ui/colorPicker.js` | `refactor(ui): výběr barvy…` | 3 709 | `ui-color-picker` |
| 2b-1 dialogy mřížky a úhlu → `js/ui/gridAngleDialogs.js` | `refactor(ui): dialogy mřížky…` | 3 620 | `ui-grid-angle-dialogs` |
| 2b-2 nulový bod → `js/ui/nullPoint.js` (+ `initNullPointButtons()`) | `refactor(ui): nulový bod…` | 3 456 | `ui-null-point` |
| 2b-3 Smazat vše + historie → `js/ui/drawingHistory.js` (+ `initClearAllButton()`) | `refactor(ui): Smazat vše a historie…` | 3 300 | `ui-drawing-history` |
| 2a Nastavení → `js/ui/settingsDialog.js` | `refactor(ui): Nastavení…` | 2 797 | `ui-settings` |
| 2c průsečíky + `togglePanel` → `js/ui/intersectionList.js` | `refactor(ui): seznam průsečíků…` | 2 648 | `ui-intersection-list` |
| 2d vrstvy → `js/ui/layerList.js` (+ `initLayerButtons()`) | `refactor(ui): seznam vrstev…` | 2 529 | `ui-layer-list` |
| 2e seznam objektů → `js/ui/objectList.js`, skok do CNC → `js/ui/cncJump.js` | `refactor(ui): seznam objektů…` | 1 873 | `ui-object-list` |
| 3a lišta, `setTool`, hinty, přídavek → `js/ui/toolbar.js` (+ `initToolbar()`) | `refactor(ui): lišta nástrojů…` | 1 579 | `ui-toolbar` |
| 3b přepínače stavového řádku → `js/ui/statusButtons.js` (+ `initStatusButtons()`) | `refactor(ui): přepínače stavového řádku…` | 1 338 | `ui-status-buttons` |
| 3c název projektu, nápověda, motiv → `js/ui/helpTheme.js` (+ `initHelpButtons()`) | `refactor(ui): nápověda a motiv…` | 1 272 | `ui-help-theme` |
| 4-0 charakterizace panelu vlastností (generativní, 16 scénářů / 190 akcí) | `test(ui): charakterizace panelu vlastností…` | 1 272 | `ui-properties` |
| 4 panel vlastností → `js/ui/properties/` (kostra `index.js` + `line`, `arcCircle`, `rect`, `polyline`, `text`) | `refactor(ui): panel vlastností…` | **156** | `ui-properties` |

1d se dělala před 1c: Trigonometrie čte `_calcLastResult` kalkulačky — stav
se stěhuje s funkcí, která ho píše (pravidlo 6), Trigonometrie ho čte přes
`getCalcLastResult()` (jediná změněná řádka mimo hlavičky/importy).
`_lastFocusedInput` (píše ho focusin listener při načtení, čte `openCalculator`)
je stav modulu `calculator.js`, listener v `initCalcButtons()`.

1b: místo samotné `openDrawCncEditor` (4 ř.) celý souvislý blok listenerů
spouštěcích tlačítek (CNC kalkulačky, Trigonometrie, ✏️ Editor, VK/číselné
zadání, CAM, AI, 📝) — čte jen importy a nic zvenku ho nečte. ui.js tím
přestal importovat `cnc-calcs.js`, `combinedModal.js`, `aiPanel.js`;
pořadí vyhodnocení modulů s kódem při načtení (od `app.js`) ověřeno
nástrojem níž — beze změny.

Pořadí vyhodnocení: post-order DFS přes statické importy od `js/app.js`
(jako prohlížeč), vypsat moduly s kódem při načtení a porovnat s commitem
před rozdělením (0bc0338). Přesun importu nesmí přeskládat moduly s kódem
při načtení. (Skript ve scratchpadu sezení, babel parser — snadno znovu.)

2b se dělala před 2a a ve třech modulech (`gridAngleDialogs`, `nullPoint`,
`drawingHistory`): Nastavení volá neexportovanou `showHistoryDialog` — po 2b
ji bere ze sourozeneckého `./drawingHistory.js`, export ui.js se neměnil.

3b: funkce byly v ui.js prokládané kódem při načtení. Blok se rozdělil podle
AST (každý příkaz i s komentáři nad ním): deklarace funkcí na úroveň modulu,
ostatní příkazy v původním pořadí do `initStatusButtons()`; kontrola proložením
zpět = původní text. Deklarace se vyzvednou, takže na jejich pořadí nezáleží.

Fáze 4: měření (AST) ukázalo, že žádná větev `switch (obj.type)` nepřepisuje
sdílené lokální proměnné — všechny jen čtou `obj`, `tbody`, `H`, `V` a pomocníky
řádků. Každá větev je jeden blok s jediným `break` na konci → tělo bloku doslova
(jen o 4 mezery méně odsazené, řádky uvnitř víceřádkového template literalu beze
změny) jako `export function xProps({ obj, tbody, … })`; kostra volá `xProps(ctx)`.
Bod (3 ř.) zůstal v kostře. Kontrola: větve zpět = původní řádky, diff kostry
jen `export` u `_afterGeomEdit`, řádek `ctx` a volání větví.

Při stěhování: `npm run sw` spouštět s `LC_ALL=cs_CZ.UTF-8` (generátor řadí
`localeCompare` podle systému — v C locale přeskládá „ch…" soubory a diff sw.js
se zanese šumem). Kontrolní skript doslovnosti: úsek modulu musí být souvislý
úsek `git show HEAD:js/ui.js`.

## Nalezené chyby (opravit zvlášť, ne při stěhování)

1. ✅ **Opraveno 16. 10.** — **Poznámky: Escape v poli Hledat zavřel celé okno**,
   ne jen lištu hledání (keydown bublal na `document` k ESC `makeOverlay`
   / `events.js`). Při opravě se našla horší příčina: po prvním napsaném znaku
   `doSearch` přesunul fokus do editoru a **další písmena přepsala označený
   nález v poznámce** (Escape pak přicházel už z editoru). Teď: psaní a Enter
   v poli hledání nechají fokus v poli (nález se v editoru označí a posune),
   Escape zavře jen lištu a vrátí fokus do editoru na označený nález; ▲/▼
   přejdou do editoru jako dřív. Test `ui-notes`.
2. ✅ **Opraveno 16. 10.** — **Výběr barvy: každé otevření přidalo na `window`
   listenery `mousemove` a `mouseup`** (tažení v SV ploše) a nikdy je neodebralo.
   Teď se odeberou přes `onOverlayRemoved`, ať se okno zavře jakkoli. Test
   `ui-color-picker` (počítá aktivní listenery po všech cestách zavření).
3. **Mrtvé odkazy na tlačítka:** `btnSnapGrid`, `btnAngleSnap`, `btnSnapPts`,
   `btnDims`, `btnCoordMode`, `btnXDisplay`, `btnMachineType`, `btnHistory`,
   `btnSettings`, `btnCalcInt` nejsou v `index.html` ani je nic nevytváří
   (ui.js na ně věší listenery přes `?.`). Přepínače mají náhradu (indikátory
   `.coord-ind`, Nastavení), ale **dialogy Velikost mřížky a Krok úhlového
   snapu** se otevíraly jen pravým klikem na `btnSnapGrid`/`btnAngleSnap` —
   z UI teď nejsou dosažitelné. Rozhodnout s uživatelem (odebrat / navěsit jinam).
4. ✅ **Opraveno 16. 10.** — **Nulový bod: toast po nastavení ukazoval „ΔX: 0 ΔZ: 0"**
   místo souřadnic bodu (`fmtStatusCoords` až po přepnutí do INC vůči právě
   nastavenému bodu). Teď se poloha formátuje v ABS předem. Test `ui-null-point`.
5. **Hinty ani název projektu se nikde nezobrazují:** `setHint` / `resetHint`
   (19 importérů) zapisují do `#statusHint` a `updateStatusProject` do
   `#statusProject` — ani jeden prvek v `index.html` není (`#statusHint` podle
   historie nikdy nebyl). Rozhodnout s uživatelem: přidat prvek do stavového řádku,
   nebo hinty odebrat. Testy `ui-toolbar` / `ui-help-theme` prvky přidávají jen pro charakterizaci.
6. **Auto-uložení rozkreslené kontury při přepnutí nástroje dělá dva záznamy
   Zpět** — `setTool` volá `pushUndo()` a `addObject()` ho volá znovu (první
   Zpět vrátí konturu, druhé nic). Tužka má jen ten z `addObject`. Oprava:
   odebrat `pushUndo()` v `setTool` (`js/ui/toolbar.js`).
7. **Výběr barvy: puštění myši mimo dialog po tažení v SV ploše picker zruší**
   (a vrátí původní barvu). `click` po tažení vznikne na společném předkovi
   mousedown/mouseup — na pozadí overlaye — a jeho handler „klik mimo" zavolá
   `finish(false)`. Stejně i před rozdělením. Oprava: klik mimo ignorovat, když
   právě skončilo tažení (`js/ui/colorPicker.js`).

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
