# Plán: rozdělení `js/calculators/camSimulator.js`

> Stav 13. 10. 2026: **11 716 ř.**, strop v `tests/file-size-budget.test.js` = 11 712 + 15.
> Po Fázi 1 (13. 10. odpoledne): **10 972 ř.**, strop 10 972.
> Schváleno uživatelem jako samostatná práce (CLAUDE.md: refaktoring obřího
> souboru = vědomé rozhodnutí, ne vedlejší efekt opravy). Pořadí: **od toho,
> u čeho nejméně hrozí, že něco přestane fungovat**, a s testy.

## Pravidla

1. **Žádná změna chování.** Kód se jen přestěhuje. Žádné „když už jsem tady“
   opravy — nalezenou chybu zapsat, opravit zvlášť.
2. **Jeden blok = jeden commit**, po každém kroku musí být aplikace funkční.
3. **Nejdřív test, pak stěhování.** Test bloku se napíše a projde na STARÉM
   kódu, pak se blok přesune a test musí projít beze změny.
4. Po každém kroku **snížit strop** v `file-size-budget.test.js` na nový počet řádků.
5. Nový soubor ~300–500 ř.; větší blok rozdělit na víc souborů podle logiky.
6. Nový JS soubor → `npm run sw`. Dokumentace: `docs/developer.md` (kde co žije).
7. Kam: `js/calculators/cam/sim/` (nová složka jen pro kousky simulátoru).

## Vzor vyjmutí (ověřený na `cam/genButtons.js`, 13. 10.)

Simulátor je JEDNA funkce `openCamSimulator`, bloky si sdílejí proměnné přes closure.

- **Co blok jen ČTE nebo VOLÁ** (S, draw, fullUpdate, pushHistory…) → předá
  se parametrem. Modul exportuje `createXxx(ctx)` nebo `showXxxDialog(ctx, …)`,
  v simulátoru zůstane import + jedno volání.
- **Co blok PŘEPISUJE** (`let` proměnné jiných bloků, sloupec *writes*) →
  parametrem předat nejde (modul nepřepíše cizí `let`). Proměnné se nejdřív
  přesunou do sdíleného objektu (např. `const toolUi = { magEditSlotRef: null, … }`)
  — to je samostatný malý commit PŘED stěhováním.
- Funkce volané odjinud (*fanIn*) modul vrátí; simulátor je rozbalí do
  stejných jmen (`const { showMagazineDialog } = createMagazine(ctx)`), aby se
  zbytek souboru neměnil.

Provázanost měří `node scripts/sim_coupling.mjs [blok]` (reads / writes /
fanIn + seznam symbolů). Pouštět před a po každém kroku.

Doplněno ve Fázi 1:
- **Obal místo rozbalení, když jde o jednu funkci:** `function x(a) { _x(ctx, a); }`
  zůstane hoisted jako dřív — žádné riziko TDZ. Vlastní stav bloku (`let`
  debounce, cache…) → **továrna** `createXxx(ctx)` vrátí funkce
  (`const { x } = createXxx(ctx)` na místě bloku).
- **TDZ:** `const { x } = …` nahrazuje hoisted funkci → `node scripts/sim_coupling.mjs --sync`
  ukáže, co se volá synchronně při otevření; nic z toho nesmí vést na `x` dřív,
  než proběhne řádek s továrnou. Do `ctx` nedávat `const`, který je deklarovaný
  až NÍŽ (např. `showSidebar` v EVENT WIRING) — předat líně `() => showSidebar()`.
- **Tělo doslova:** modul vzniká vyříznutím bloku skriptem (odsazení −2,
  nová hlavička), ne přepisem; po přesunu odebrat importy, které simulátor už
  nepoužívá (ESLint je nehlásí jako chybu).
- **Testy nezávislé na generátoru drah** (běží v `test:cad`): vlastní malá
  kontura/polotovar nebo ručně psaný program místo dráhy z fixture.

## Testy

Simulátor (UI) dnes testy skoro nemá — hlídají hlavně generování drah.
Proto vrstvy:

| Vrstva | Co hlídá | Kdy |
|---|---|---|
| **Fáze 0: harness** `tests/sim-ui-*.test.js` | otevření simulátoru nad fixture .camprog v DOM prostředí; dialog jde otevřít, prvky existují, změna pole se zapíše do `S.params` / localStorage | napsat PŘED přesunem každého bloku |
| **Unit testy** vyjmutých čistých funkcí | snap, validace, výpočty bez DOM | při vyjmutí |
| **Záznam kreslení** (stub `ctx` zapisuje volání) | `draw()` nad fixture dá stejnou posloupnost volání před i po | Fáze 5 |
| **Otisk drah** `cam_fingerprint.mjs --save/--diff` | dráhy se nehnuly (mají být SHODNÉ u všech fixtures) | každý krok |
| **`npm run test:cad`** | celek + strop velikosti | každý krok |
| **Proklikání v prohlížeči** (Browser pane, `skica-static`) | daný dialog/funkce reálně funguje | každý krok |

**DOM prostředí: `happy-dom`** (jen `devDependencies`, schváleno 13. 10. 2026).
Zkouška 13. 10. (Node + happy-dom, bez vitestu): simulátor se otevře
(88 tlačítek), vygeneruje G-kód (246 ř.), uloží stav do localStorage a klik
na „Čelně“ skryje „✂ Po úsecích“. Co harness musí udělat:
- vložit `<body>` z `index.html` bez `<script>` — moduly aplikace (např.
  `js/canvas.js`) hledají své prvky už při importu,
- zkopírovat do `globalThis` všechny vlastnosti okna, které Node nemá
  (`CSS`, `getComputedStyle`, …) — ve vitestu to udělá
  `// @vitest-environment happy-dom` v hlavičce testu,
- stub `HTMLCanvasElement.prototype.getContext` (happy-dom 2D kontext neumí);
  **⚠ kreslení zatím neproběhlo (0 volání ctx)** — zjistit, jestli `draw()`
  čeká na rAF / velikost plátna (ResizeObserver, `clientWidth` = 0), než se
  začne s Fází 5.

Pro testy přidat do simulátoru „háček“ (1 řádek): `openCamSimulator` vrátí
`{ S, close }`, aby test viděl stav bez lovení v DOM.

**Hotovo 13. 10. (Fáze 0):** harness `tests/helpers/simUi.mjs`
(`installSimDom()`, `openSim(prog)` → `{ S, close, q, qa, canvas, drawCalls }`,
`loadFixture`, `settle`), smoke test `tests/sim-ui-smoke.test.js` (běží
v `test:cad`, ~6 s). Kreslení: `draw()` končil na `canvas.width = 0`
(happy-dom nemá layout, `clientWidth` = 0) — harness vrací 800 × 600 jen pro
`.cam-sim-canvas-wrap`; `getContext('2d')` je záznamník volání pro každé
plátno zvlášť (`['lineTo', x, y]`, `['=', 'strokeStyle', …]`) → základ
pro Fázi 5. Otevření = fixture do localStorage (`skica-cam-simulator`),
flipX/flipZ do `state` (simulátor je z localStorage nebere).

### ⚠ Pasti při stěhování (zjištěno ve Fázi 0)

- **`camHeadless.mjs` (+ `scripts/cam_gcode_repro.mjs`, `cam_debug.mjs`,
  `cam_face_debug.mjs`, `tests/helpers/camInternals.mjs`) vyřezávají
  VŠECHNY importy `camSimulator.js`** a nahrazují je ručním prelude;
  headless běh končí `return` na řádku `const STORAGE_KEY = …` a volá jen
  `calculate()` / `generateAutoGCode()`. Blok, na který z nich vede volání,
  by po přestěhování v headless běhu chyběl (ReferenceError, často spolknutý
  try/catch → tichá změna drah). Před stěhováním ověřit, že blok z
  `calculate`/`generateAutoGCode` není dosažitelný; jinak doplnit prelude.
  `const { … } = createXxx(ctx)` za kotvou je v headless běhu v TDZ.
- **Testy, které vyřezávají funkce ze zdroje simulátoru:**
  `cam-path-pick-arc` (`getGSegmentAt`), `shape-preset-knife`
  (`applyShapeChange`, `_loadMagSlot`, … — blok Zásobník/Geometrie),
  `camInternals.mjs` (seznam `EXPORTS`). Při přesunu takové funkce je
  přepnout na import z nového modulu.

## Pořadí kroků

Čísla z `sim_coupling.mjs` 13. 10. 2026 (ř. = řádky bloku; čte/píše = closure
symboly jiných bloků; fanIn = kolik bloků sahá na jeho funkce).

### Fáze 0 — příprava (simulátor se nemění, kromě háčku) ✅ 13. 10.
- harness `tests/helpers/simUi.mjs` (otevření nad `tests/fixtures/**/*.camprog`,
  stub canvasu, zavření) + první smoke test `tests/sim-ui-smoke.test.js`.

### Fáze 1 — piloty: malé, skoro nic nepřepisují (~780 ř.) ✅ 13. 10.
Účel: zavést vzor `ctx` na místech, kde se nemůže moc pokazit.

Hotovo (11 716 → 10 972 ř., otisk drah shodný u všech 30 fixtures):
`cam/sim/autoStock.js` (test `sim-ui-auto-stock`), `sendToCanvas.js`
(`sim-ui-send-to-canvas`, snapshot objektů CAD soustruh + karusel),
`tangentLineModal.js` (`sim-ui-tangent-line`), `insertSegmentModal.js`
(`sim-ui-insert-segment`; předtím commit `_pickHandler` → `canvasPick.handler`),
`collisionWarnings.js` (`sim-ui-collision-warnings`). `cam-insert-isolation`
nekontroluje `cam/sim/` (UI jako camSimulator.js) a hlídá, že z něj kód drah
nic neimportuje.

| Blok | ř. | čte | píše | test |
|---|---|---|---|---|
| auto stock | 55 | 3 | 0 | polotovar z kontury → `S.stockPoints` |
| Modal: tečná úsečka pod úhlem | 145 | 5 | 0 | otevřít, zadat, přidá segment |
| Vrátit konturu zpět na plátno | 163 | 4 | 0 | (stub CAD) dostane body kontury |
| Validace kolizí + Kolize držáku (oranžové) | 190 | 11 | 0 | unit nad fixture: stejné hlášky |
| Modal pro vložení segmentu | 227 | 2 | 1 (`_pickHandler`) | otevřít, vložit |

### Fáze 2 — snapy (~1 020 ř.), nic nepřepisují
| Blok | ř. | čte | píše | test |
|---|---|---|---|---|
| SNAP MEZNÍCH ČAR (rozsah 📐, čelisti, koník) | 892 | 16 | 0 | unit: tažení meze → hodnota v `S.zLimits` |
| SNAP (jako v CAD) | 127 | 6 | 0 | unit: přichycení k bodu/hraně |

### Fáze 3 — záložka Parametry (~1 160 ř.), nic nepřepisuje
| Blok | ř. | čte | píše | test |
|---|---|---|---|---|
| params tab | 1159 | 30 | 0 | každé pole/přepínač → `S.params`; Čelně/Podélně, Zprava/Zleva, záložky Hrub./Hot./… |
Rozdělit na víc souborů (hrubování / dokončení / vrtání+vyvrtávání / závit…).

### Fáze 4 — nože: Geometrie + Zásobník (~2 110 ř.)
Přepisují si navzájem proměnné → **nejdřív** commit „sdílený objekt `toolUi`“
(`magEditSlotRef`, `magEditHandTouched`, `magazineDialogRefresh`,
`toolGeomModalRefresh`), pak stěhovat.

| Blok | ř. | čte | píše | test |
|---|---|---|---|---|
| magazine dialog | 1056 | 19 | 3 | otevřít, vybrat slot, uložit nůž, ↩/↪ |
| Modal „⚙️ Geometrie“ | 1053 | 22 | 2 | otevřít, změnit tvar/úhel, import/export geometrie |

### Fáze 5 — kreslení plátna (~1 320 ř.)
Nic nepřepisuje, ale volá ho 13 bloků → test **záznamem volání ctx** nad
2–3 fixtures (dráhy, části, vyvrtávání) PŘED stěhováním.

| Blok | ř. | čte | píše | test |
|---|---|---|---|---|
| CANVAS DRAWING | 1322 | 26 | 0 | záznam kreslení shodný |

**Po Fázi 1–5:** ~11 700 − ~6 400 ≈ **5 300 ř.** v `camSimulator.js`.

### Fáze 6 — rozhodnout až potom (nejvíc provázané)
| Blok | ř. | čte | píše |
|---|---|---|---|
| Myš / výběr obdélníkem / tažení | 747 | 68 | **9** |
| Precision crosshair (mobil) | 345 | 24 | 3 |
| EVENT WIRING | 503 | 66 | 0 |
| Auto profil / krokování | 453 | 13 | 1 |
| ČÁSTI PROGRAMU | 315 | 14 | **7** |
| editor tab, SIMULATION, .camprog, vyvrtávání z plného | 150–240 | | |
Tady je riziko nejvyšší a přínos se zmenšuje — možná nechat jádro jak je.

## Nalezené chyby (při stěhování neopravené — opravit zvlášť, po dohodě)

1. **„📐 Kreslit" se neptá.** `addEventListener('click', handleSendToCanvas)`
   předá objekt události jako `skipConfirm` (pravdivý) → dotaz „Smazat
   aktuální výkres a vložit konturu z CAM simulátoru?" se nikdy neukáže
   (tlačítko v liště G-kódu i `to-canvas-edit` v Editoru). Výkres jde vrátit
   přes ↩ v CAD (pushUndo). Opravit = `() => handleSendToCanvas()`; zeptat se
   uživatele, jestli dotaz chce.
2. **🎯 Přebrat souřadnice v režimu Ø (DIAMON).** Obsluha myši
   (`canvasPick.handler`, CANVAS INTERACTION) přichytává k bodům podle
   `p.x` (v Ø režimu PRŮMĚR) proti poloměru kurzoru — přichycení míjí;
   bez přichycení modal „➕ Vložit segment" dostane do pole X (průměr)
   POLOMĚR, modal „přidat G-kód pohyb" naopak přichycený průměr ještě
   zdvojí (`ms.x = wx * 2`). V režimu poloměru je vše v pořádku
   (`sim-ui-insert-segment` proto běží v RADIUS).
3. **Nesmyslná souřadnice v ⛔ hlášce:** `part-18-parting-90-ramp` hlásí
   „Držák v kolizi … (N1050, X973417795…)" — `it.x` z validátoru ~5·10⁸.
   (Zjištěno sondou nad fixtures v harnessu; ⛔ hlášky v UI má i řada
   dalších fixtures — part-10, 14, 15, 18, 20, 22, 23, 4/6/8/9.)

## Kontrolní seznam jednoho kroku

1. `node scripts/sim_coupling.mjs "<blok>"` → seznam závislostí do `ctx`;
   ověřit pasti výš (dosažitelnost z `calculate`, testy vyřezávající funkce,
   `--sync` u továrny, `cam-insert-isolation` u čtení `toolShape`/`toolAngle`).
2. `node scripts/cam_fingerprint.mjs --save=pred.json` (ve scratchpadu).
3. Napsat test bloku, **projde na starém kódu**.
4. Přestěhovat (jen přesun + `ctx`), v simulátoru import + volání.
5. Test bloku + `npm run test:cad` zelené; `cam_fingerprint --diff` SHODNÝ.
6. `npm run sw`; proklik v prohlížeči (dialog/funkce + konzole bez chyb).
7. Snížit strop v `file-size-budget.test.js`, krátce doplnit `docs/developer.md`.
8. Commit `refactor(sim): <blok> → cam/sim/<soubor>.js`.

## Stav

- [x] Plán, měřicí skript `scripts/sim_coupling.mjs` (13. 10. 2026)
- [x] `happy-dom` + `@babel/parser` v devDependencies, zkouška otevření simulátoru (13. 10.)
- [x] Fáze 0 — harness, háček, první smoke test (13. 10.)
- [x] Fáze 1 — 5 pilotů (13. 10.)
- [ ] Fáze 2 · [ ] Fáze 3 · [ ] Fáze 4 · [ ] Fáze 5 · [ ] Fáze 6 (rozhodnout)
