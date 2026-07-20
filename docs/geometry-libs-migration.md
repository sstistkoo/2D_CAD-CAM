# Plán přechodu CAM na geometrické knihovny

> Clipper2 (booleovské operace, offsety) · Turf.js (prostorová analýza) ·
> Detect-Collisions (rychlý broad-phase filtr kolizí)
>
> Stav: Fáze 0 hotová (15. 7. 2026) · adaptér `js/geom/geomCore.js`

> **PAUZA (18. 7. 2026) → REFAKTOR HOTOV, migrace může pokračovat:**
> Migrace (Fáze 3 zbytek / 3b dokončování / 4 zbývá / 5) byla dočasně
> odložena kvůli REFAKTORINGU `js/calculators/camSimulator.js` (byl ~13 500
> řádků, moc velký na efektivní práci). Refaktoring je **HOTOV** (Fáze A+B,
> 18. 7. 2026): soubor **13 435 → 8 432 řádků**, čisté funkce + výpočetní
> jádro (`calculate`→`cam/calculatePipeline.js`, emise G-kódu
> →`cam/gcodeEmit.js`) rozdělené do modulů v `js/calculators/cam/`. Migrace
> na Clipper2 (booleovské hrubovací dráhy, přejezdy, UI) se tím vrací do hry —
> zbytek plánu níže platí beze změny. Viz paměť `geom-libs-migration`.

## Proč

Ruční geometrie v `js/calculators/camSimulator.js` (~13 500 řádků) řeší
obrobitelnou konturu, mezní čáry destičky/držáku, přemostění kapes, ořez
smyček… vlastními funkcemi (`buildMachinableContour`, `computeInterferenceGuides`,
`trimAndRemoveLoops`, `resolveOuterProfile`, `bridgeFromContourToStock`, …).
U složitějších tvarů se opakovaně objevují chyby a hlídání držáku od plátku
nefunguje spolehlivě. Robustní polygon-boolean jádro (Clipper2) tyhle třídy
chyb řeší principiálně: místo stovek geometrických speciálních případů se
počítá s uzavřenými polygony množinově.

## Stav knihoven v `lib/`

| Knihovna | Soubor | Formát | Stav |
|---|---|---|---|
| Clipper2 (clipper2-ts 2.0.1-18) | `lib/clipper2.min.js` (125 kB) | ES modul | ✅ funguje (ověřeno testy) |
| Turf.js | `lib/turf.min.js` (531 kB) | UMD → `globalThis.turf` | ✅ funguje, načítat lazy |
| Detect-Collisions | `lib/detect-collisions.js` (35 kB) | ES modul | ✅ nahrazeno soběstačným bundlem `check2d@9.36.4` (balíček detect-collisions se přejmenoval na check2d; původní soubor byl nepoužitelný CommonJS rozcestník) |

CSP v `index.html` povoluje jen `script-src 'self'` — všechny knihovny musí
zůstat lokální soubory (žádné CDN za běhu). Po přidání do produkce spustit
`npm run sw`, ať se dostanou do PWA cache.

## Architektura: adaptér `js/geom/geomCore.js`

CAM kód **nikdy nevolá knihovny přímo** — vše jde přes adaptér. Ten:

- převádí mezi CAM konvencí `{x, z}` (x radiálně, z axiálně) a Clipper
  `{x, y}` (pozor: Clipper2 body mají vlastní pole `z` — uživatelská data,
  nesmí se poplést s CAM osou Z),
- běží s `precision = 4` (0,1 µm),
- exportuje: `polyUnion`, `polyDifference`, `polyIntersect`, `polyOffset`,
  `polyArea`, `pointInLoop`, `polySimplify`, `toolSweep` (Minkowského suma =
  stopa nástroje po dráze), třídu `StockModel` (postupné odebírání materiálu)
  a lazy loadery `ensureTurf()` / `ensureCollisions()`.

Testy: `tests/geom-core.test.js`. Regresní pojistka celé migrace:
`tests/cam-gcode-regression.test.js` (snapshoty plného pipeline) — každá fáze
musí buď nechat snapshoty beze změny, nebo je změnit **vědomě** (`-u`).

## Rozdělení rolí

| Úloha | Knihovna | Funkce adaptéru |
|---|---|---|
| polotovar − projetá dráha (vizuální odebírání) | Clipper2 | `StockModel.cut(toolSweep(...))` |
| kolize držáku/plátku × zbytkový polotovar | Detect-Collisions (broad-phase) → Clipper2 (přesně) | `ensureCollisions()` → `polyIntersect` |
| offset kontury o rádius špičky + přídavky | Clipper2 | `polyOffset(loops, R + přídavek)` |
| vrstvy hrubování, regiony, zbytkový materiál | Clipper2 | `polyIntersect` s pásem vrstvy |
| vzdálenost bodu od kontury, nejbližší bod, uvnitř/vně | Turf.js | `getTurf()` → `pointToLineDistance`, `nearestPointOnLine`, `booleanPointInPolygon` |
| zjednodušení hustých křivek pro plátno | Clipper2 / Turf | `polySimplify` / `turf.simplify` |

## Fáze migrace

### Fáze 0 — základ (HOTOVO 15. 7. 2026)
Adaptér + testy, úklid přímého importu Clipperu z `js/app.js`,
odstranění rozbité source-map reference, náhrada
`lib/detect-collisions.js` funkčním bundlem (check2d 9.36.4).

### Fáze 1 — vizuální odebírání polotovaru v simulaci (HOTOVO 15. 7. 2026)
*Nízké riziko, nemění G-kód ani snapshoty.*

Implementace: `js/calculators/cam/materialRemoval.js`
(`MaterialRemoval`, `buildStockLoop`, `toolFootprint`) +
integrace v `camSimulator.js` (`getRemovalModel`, `remainPath` v `draw()`).

- Polotovar → `StockModel` (válec = obdélník od osy; odlitek =
  navzorkované `stockPathSegments` uzavřené k ose X=0).
- Stopa nástroje = Minkowského suma obrysu špičky podél řezných úseků
  `simPath` (G0 rychloposuvy neřežou); inkrementálně po snímcích,
  přetočení zpět = přepočet od nuly, periodický `polySimplify`.
- Zbývající polotovar ořezává (clip) CAD vybarvení i výplň polotovaru
  v `draw()` → materiál vizuálně mizí.
- Přepínač ⛏ v horní liště simulátoru (persistovaný, default zapnuto).
- V1 aproximace špičky = kružnice rádiusu R; celý polygon destičky
  (+ upichovák šířky b) přijde s Fází 2.
- Testy: `tests/material-removal.test.js`.

### Fáze 2 — hlídání kolizí (destička + držák) jako VALIDACE (HOTOVO 16. 7. 2026)
*Stará logika dál generuje dráhy; nová je nezávisle kontroluje.*

Implementace: `js/calculators/cam/collisionValidator.js`
(`validateToolpath`, `holderProfileLoop`, `holderWorldLoop`) + integrace
v `camSimulator.js` (`runCollisionValidation`, debounce 600 ms po
`fullUpdate()`, gated checkboxem `respectInsertGeometry`).

- Obrys držáku: vlastní profil (`holderProfile.sideA` + otočená `sideB`)
  nebo obdélník Tloušťka × Délka; transformace do světa dle strany
  hrubování (backside zrcadlí Z) — stejně jako kreslení v `draw()`.
- Průchod celé dráhy blok po bloku (řádek G-kódu) nad `StockModel`:
  řezné bloky nejdřív odeberou materiál stopou destičky, pak se testuje
  Minkowského stopa DRŽÁKU × zbytek; G0 rychloposuvy testují destičku
  i držák (rychloposuv materiálem = havárie). Obrysy pro testy zmenšeny
  o 0,05 mm a tolerance průniku 0,5 mm² — proti falešným dotykům.
- Broad-phase: Detect-Collisions SAT `System` proti původnímu polotovaru
  (lazy přes `ensureCollisions()`), fallback ruční AABB.
- Nálezy jdou do „⚠ Nalezeny problémy“ s N-číslem řádku, X/Z pozicí
  a plochou průniku; cache podle klíče vstupů (G-kód + nástroj + držák +
  polotovar), plná validace jen při změně.
- Checkbox přejmenován: „Hlídat geometrii destičky“ → **„Hlídat geometrii
  (destička + držák)“**.
- Testy: `tests/collision-validator.test.js`.

### Fáze 2b/3 — sjednocená kolizní oblast nástroje (destička + držák) (HOTOVO 20. 7. 2026)

Mezní čáry (`computeInterferenceGuides` / `buildHolderBoundaryPts`) se počítají
ze **SJEDNOCENÉ** zakázané oblasti špičky místo dřívější držák-only:

  F_all = (dílec ⊕ −držák) ∪ (dílec ⊕ −TĚLO destičky)

- Implementace: `js/calculators/cam/toolEnvelope.js`
  (`insertWorldLoop`, `buildToolForbiddenRegion`) + sdílený obrys destičky
  `buildInsertProfileSegments` (export z `insertPreview.js`, dřív jen lokální
  v camSimulatoru). Napojení v `interferenceGuides.js` (F_all místo
  `buildTipForbiddenRegion(držák)`).
- **Tělo mimo aktivní břit**: mezní čára = HRANICE dosažitelné oblasti
  (komplement F_all), ne bodová kolize — aktivní břit tak zůstává řeznou
  referencí (analytická hrana `zEdgeAt`) a tělo destičky jen tlačí hranici ven.
- **Politika „tělo jen bez úlevu"**: tělo se přidá pouze pro tvary, jejichž bok
  reálně naráží — **upichovák** (`parting`, plný bok šířky b). Obrys se
  morfologicky OTEVŘE o R (odstraní aktivní nos, nechá boky). Soustružnický
  **polygon** má zadní hrany uvolněné úlevem (nakreslený klín úlev nemodeluje →
  složení celého těla by falešně ubíralo legitimní průchody) a **kulatá**
  destička je celá aktivní nos → obě zůstávají na analytické hraně, jako dřív.
  Důsledek: **existující fixtures (polygon/round) se NEMĚNÍ** — F_all je u nich
  bit-identická s dřívější držák-only oblastí (viz test). Polygon s modelem
  úlevu (relief) se může doplnit později.
- Testy: `tests/insert-forbidden-region.test.js` (obrys destičky + politika
  těla), `tests/holder-boundary.test.js` (charakterizace `buildHolderBoundary
  Pts`). Regresní snapshoty `cam-gcode-regression` **beze změny**.
- Zbývá (rozšíření): polygon/threading s modelem úlevu; využít F_all i pro
  „stopu nástroje" ve vizuálním úběru (Fáze 1 dnes jen kružnice R).

### Fáze 3b — obálka держáku pro dokončování a trasy (HOTOVO 16. 7. 2026)

- **Dokončování**: úseky, kde by špička (a tedy держák) ležela v zakázané
  oblasti, se přeskočí jako nedosažitelné (tečkovaně, rychloposuv přes
  mezeru, ⚠ varování) — `clamp.isForbidden` v dokončovací smyčce.
- **Trasy sledování kontury** (leadIn/leadOut kapes, „bez schodků"
  dojezdy): ořez proti obálce (`holderTrimLeadIn/Out`) — odstranilo třídu
  „nájezd kapsy trasovaný od osy přes celé čelo" (~343 mm² na part-2).
- **Kapsové intervaly**: komponentový ořez `clampSpanTowardNegative` —
  okno, kam se держák mezi stěny vejde (≈ lomené mezní čáry guides v2);
  užší kapsy se vynechají s varováním. Dočišťovací trasy kapes se ořezávají
  na totéž okno.
- Existuje i MĚKKÁ zakázaná oblast (`isForbiddenSoft`, eroze o dosah
  špičky + 1 mm) pro tolerování drhnutí o přídavkovou slupku.
- **Známé zbývající mezery** (validátor je HLÁSÍ v ⚠ panelu, generátor jim
  zatím nebrání): čelní strategie (genFacePasses bez obálky), odlitkové
  regiony (nezapočaté regiony stojí jako plný materiál — statická silueta
  je nevidí) a KOLIZE ZÁVISLÉ NA POŘADÍ (trasa jede dřív, než se okolní
  materiál obrobí — statický model je principiálně nevidí; řešení = 
  dynamické plánování ve Fázi 4 nad StockModel).

### Fáze 3a — konce průchodů z obálky nástroje (HOTOVO 16. 7. 2026)
*První booleovský zásah do generování drah — kolize držáku z Fáze 2
se řeší u zdroje.*

Implementace: `js/calculators/cam/toolEnvelope.js` (`makeHolderClamp`,
`offsetSilhouetteLoop`, `buildTipForbiddenRegion`, `clampZTowardNegative`)
+ `geomCore.minkowskiSolidSum` + napojení v `scanIntervals`
(roughingStrategies.js) přes `passCtx.holderClampZEnd`.

- **Zakázaná oblast špičky** F = silueta offsetu ⊕ (−obrys držáku)
  (Minkowského suma vyplněných polygonů). Špička nesmí do F → interval
  průchodu se zkrátí na první vstup (rezerva 0,1 mm), plně zakázaný
  interval se vynechá.
- **Schodová podmínka**: silueta je jen finální materiál — zkrácené mělčí
  průchody nechávají schody NAD ní. Clamp si přes `noteMainEnd()` eviduje
  skutečné konce mělčích průchodů hlavní stěny a hlubší průchod drží
  levou hranu držáku před nimi (bbox držáku; reset per region/operace).
- `holderClamped` interval potlačí „bez schodků" leadOut (sledování stěny
  je přesně to, kam držák nesmí).
- Aktivní jen se zapnutým „Hlídat geometrii" + definovaným držákem; jen
  podélné hrubování zprava (genLongPasses). Regresní snapshoty beze
  změny (fixtures jsou dle validátoru kolizí prosté → clamp se neaktivuje);
  nový regresní test `tests/holder-envelope-demo.test.js` drží demo díl
  hrubovaný bez kolizí držáku (křížová kontrola validátorem Fáze 2).
- Zbývá (Fáze 3b): obálka pro DOKONČOVACÍ dráhu (validátor na demo dílu
  hlásí reálné kolize držáku u čela — dokončování k ose s širokým
  držákem), backside/čelní strategie, schody pro kapsy.

### Fáze 3 — hrubovací dráhy z booleovské geometrie (zbytek)
*Jádro přepisu; krýt regresními snapshoty, zapínat za příznakem.*

1. **Zbytkový materiál** = polotovar − (kontura ⊕ offset R + přídavky X/Z)
   (`polyDifference` + `polyOffset`).
2. **Vrstva** = průnik zbytku s pásem `[x_i, x_i+ap]` → Clipper vrátí
   samostatné smyčky = **regiony zadarmo** (dnešní `regionRoughing` ručně).
3. Dráha vrstvy = spodní hrana smyčky regionu; nájezd/výjezd viz Fáze 4.
4. „Bez schodků“ (`noStepRoughing`): dojezd vrstvy pokračuje po hraně
   smyčky (= offset kontury) k předchozí vrstvě — logika zachována.
5. Nedosažitelné úseky (kolize dle Fáze 2) se z hrany smyčky vyříznou;
   zanoření jen pod úhlem `entryAngle` (Auto = úhel spodní hrany plátku).

**HOTOVO — geometrické jádro (20. 7. 2026):** kroky 1–2 (+ extrakce řezných
Z-intervalů) jako čisté funkce v `js/calculators/cam/booleanRoughing.js`:
`offsetRegionLoop` (uzavře hotový `offsetPath` = dráhu STŘEDU špičky k ose —
reuse místo `polyOffset`, aby se zachovala anizotropie aX≠aZ; scalar offset
by ji ztratil, viz pozn. Fáze 4 o elipse), `buildResidual` (polotovar −
oblast dílce přes `polyDifference`), `sliceLayer` (zbytek ∩ pás `[xLo,xHi]`
→ regiony), `layerZIntervalsAtX` (řezné intervaly na hloubce X paritou
průsečíků), `buildLayers` (hloubková posloupnost s volitelným Z-ořezem
rozsahu obrábění). Ověřeno `tests/boolean-roughing.test.js` (mj. boss–údolí–
boss → 2 samostatné regiony „zadarmo").

**HOTOVO — napojení do `genLongPasses` ZA PŘÍZNAKEM (20. 7. 2026):** nový
příznak `booleanRoughing` (default **false** = scan-line). Zapnuto = řezné
Z-intervaly podélných průchodů se berou z booleovského jádra
(`booleanScanIntervals` v `roughingStrategies.js`) místo ručního
`scanIntervals`. Obálka držáku (`applyHolderClamp`) vytažena jako sdílené
post-zpracování obou cest. DVĚ KLÍČOVÁ ZJIŠTĚNÍ z ověření na fixtures:
- **Zbytek = OBAL − oblast dílce, ne silueta − oblast.** Scan-line záměrně
  IGNORUJE obrys polotovaru (řeže i vzduchem, „Stopuje JEN kontura"). Zbytek
  proti skutečné siluetě odlitku se u úzkých míst rozpadl na vnitřní „kapsy",
  které emise neuměla obrobit → stál materiál (až +243 mm²). Proto se zbytek
  počítá proti PLNÉMU obdélníkovému obalu `[0..maxStockX]×[zMin..zMax]`.
- **Oblast dílce = vzorkování `offsetXAt(z)`, ne sešití `offsetPath`.**
  offsetPath má u kapes/bossů chainBreaky → přímé sešití dá nesmyslný polygon.
  `sampleOffsetRegion` vzorkuje max X (přesně jako scan-line `blockedAt`) →
  intervaly SEDÍ se scan-line.
Ověřeno `tests/boolean-roughing-wiring.test.js`: na 6 podélných fixtures
booleovská cesta odebere STEJNÝ materiál (part-1 Δ<5 mm² = vzorkovací šum),
dojede na stejnou hloubku/Z-obálku, bez hard-error; pass count jen o málo
nižší (vynechá degenerované no-op intervaly). Regresní snapshoty
`cam-gcode-regression` **beze změny** (příznak default off). Příznak je
zapínatelný v UI (panel CAM simulátoru, tab Hrubování → „Booleovské hrubování
(exp.)", `#cam-sim-boolean`) — slouží k vizuálnímu ověření a dalšímu vývoji.

POZNÁMKA k rozsahu: napojení zatím jen odvozuje INTERVALY; emise (rampy,
leadIn/Out, holder trim) je pořád scan-line-tvarovaná. Analýza ukázala, že na
úrovni intervalů je booleovská cesta u podélného i čelního hrubování jen VĚRNÝM
ekvivalentem scan-line (facing nemá kapsy — jeden blokující X). Skutečný přínos
booleanů (regiony z KOMPONENT zbytku s přirozeným splynutím v kůře, residual-
aware přejezdy) se plně projeví až v krocích 3–5, které vyžadují restrukturaci
smyčky emise a DVĚ residuální reprezentace (obal pro intervaly ⇄ silueta
polotovaru pro regiony) — samostatná větší iterace.
**HOTOVO — regiony z geometrie (Fáze 3, krok 2, 20. 7. 2026):**
`computeResidualRegions` (booleanRoughing.js) detekuje údolí (odlitkové hrby /
stěny) jako lokální minima horní hrany siluety polotovaru (prominence `minDrop`
na obou stranách) → splity `[{z, xSurf}]` ve formátu ruční detekce. Napojeno do
`computeRegions` v genLongPasses za příznakem `booleanRoughing` (jen s
`regionRoughing` + odlitek); ruční (`manualRegionSplits`) i booleovská
(`booleanRegionSplits`) cesta sdílejí `assembleRegions`. Ověřeno
`tests/boolean-region-roughing.test.js` (part-10-zapich-casting: booleovské
splity ≈ ruční, materiál-parita). POZOR test-izolace: `camHeadless` resetuje
příznak `booleanRoughing` na každý běh (singleton `S` ho jinak nechá prosáknout
do dalšího .camprog → flaky snapshot drift; latentní od zapojení příznaku,
odhaleno až přeuspořádáním workerů).

**KLÍČOVÉ ROZHODNUTÍ (BOUNDED varianta): detekce bere SILUETU polotovaru
(`buildStockLoop`), NE zbytek `stock−dílec`.** Komponenty zbytku mají u features
dílu OPAČNÝ směr splynutí (kapsa dílu: oddělena hluboko, splyne mělko), který
legacy region model (`zHiSurf`/`zLoSurf` jen pro odlitkový hrb — oddělen mělce,
splyne v kůře) NEUMÍ → složení celého zbytku nechalo stát materiál (na
holder-region-roughing +121 mm² pod z≈22,9). Silueta = stejný signál jako ruční
detekce → BEZ regrese pokrytí (holder i part-10: splity, Z-obálka i hloubka
IDENTICKÉ s ruční cestou). Obecné residual-komponentové regiony (kapsy dílu,
obousměrné splynutí) = až restrukturace emisní smyčky.

**Při ověření odhalen a opraven latentní HANG** intervalové cesty: `buildResidual`
volal Clipper2 `polyDifference` na ~850bodové husté smyčce oblasti (offset po
0,2 mm přes velký Z-rozsah) a u některých tvarů (holder) degeneroval do
zacyklení → přidán `polySimplify` (ε 0,01 mm) vstupu před differencí (doběhne v
ms, plocha beze změny). Latentní od napojení intervalů, odhalen až regiony z
geometrie (holder plně provedou intervalovou cestou).

Zbývá: dráha přímo z HRAN regionů + nájezdy/rampy, obousměrné residual-
komponentové regiony (kapsy dílu = restrukturace emisní smyčky `outer _regions ×
inner depths` → per-hloubka komponenty), čelní/backside cesta. UI sjednocení
zanořování (Fáze 5) se DĚLAT NEBUDE — viz poznámka u Fáze 5.

### Fáze 4 — plánování přejezdů (rychloposuvy) — ČÁSTEČNĚ (16. 7. 2026)

Hotovo:
- **Vůle nad polotovarem po osách** (`stockClearX`/`stockClearZ`, UI „Vůle
  X/Z (polotovar)", null = dědí `rapidClearance`): hranice konce
  rychloposuvu / začátku G1 se kreslí **tečkovaně kolem polotovaru**
  (válec i odlitek, per-osový offset povrchu). Emise nájezdů/odskoků,
  čelní hrubování, závit i upichnutí čtou oddělené hodnoty
  (`camMath.stockClearances`).
- **Vjezd na hranici rozsahu Z rampou**: kotva = průsečík čáry začátku
  rozsahu s hranicí polotovaru (+ vůle X), všechny hloubky sdílejí touž
  přímku pod úhlem zanoření (dřív kolmý zápich jako u upichování).
  Test: `tests/range-entry-ramp.test.js`.
- Oprava anizotropního offsetu kontury (aX ≠ aZ): oblouk = elipsa
  proložená zpět G2/G3 — konec trojúhelníkových artefaktů u
  rádius→krátká úsečka→rádius. Test: `tests/offset-anisotropic.test.js`.
- Oprava Fáze 3a po validaci na reálných drahách (viz níže): snapshoty
  fixtures vědomě aktualizovány — odstraněné průchody byly validátorem
  potvrzené SKUTEČNÉ kolize držáku (čelo k ose ~343 mm² na part-2);
  vynechané průchody hlásí ⚠ varování.

DŮLEŽITÉ POUČENÍ (testovací infrastruktura): `camHeadless.runCamProg`
dřív vracel `calc.simPath` z běhu s prázdným `manualGCode` → **prázdná
dráha** — všechny headless validace kolizí byly bezpředmětné (vždy 0).
Teď vrací i `calcSim` (druhý průchod z vygenerovaného kódu) a prelude
harnessu zrcadlí všechny reálné importy camSimulatoru (chybějící symboly
dřív tiše zabíjely obálku držáku přes try/catch).

Hotovo (jádro, 17. 7. 2026):
- **Dynamický zbytkový polotovar v emisi G-kódu**: `generateAutoGCode` si
  drží `StockModel` a po každém průchodu ho „obrobí" (`noteCutPass` — řezné
  pohyby průchodu v pořadí emise; rychloposuvy/odskoky se nezapočítávají).
  Každý přímý rychloposuv (`safeRapidTo`) se testuje Minkowského stopou
  destičky proti AKTUÁLNÍMU zbytku → při kontaktu nahoru přes polotovar,
  přejezd v Z, sjezd (řeší kolize závislé na POŘADÍ, které statické
  blockery nevidí).
- **Vůle měřená od HRANY nástroje**: zastavení rychloposuvu = vůle + R
  (`rapidStopX/Z`) — dřív při vůli < R nos špičky škrtal o polotovar o
  R − vůle při každém nájezdu (třída ~1 mm² nálezů validátoru).
- **Výjezd z materiálu posuvem**: otevřený konec průchodu pokračuje G1
  ještě o Vůli Z za hranu (test proti zbytku ověří, že za koncem je
  vzduch — hranice rozsahu/stěna se neprodlužuje), teprve pak odskok.
- Izolovaná validace: part-1/2/4/6/9 + pocket-wall **rapid = 0**, holder
  kleslo na ~3 (řadové zbytky v kapsách). POZOR: souhrnný sweep v jednom
  procesu je kontaminovaný singleton stavem S mezi fixtures — měřit
  izolovaně (proces na fixture).

Hotovo (přejezdy nájezdu, 21. 7. 2026):
- **Konec marného/nebezpečného descend-backu v nájezdu**: dvoufázový nájezd
  podélného hrubování (`safeRapidTo(cur.x, zApprox)` = přejezd v Z, pak
  `safeRapidTo(pass.x, zApprox)` = sjezd na hloubku) sjížděl u ČISTĚ-Z fáze,
  která se musela kvůli materiálu zvednout nad konturu, ZPĚT na původní
  (hluboké) X — a druhý nájezd ho hned zase zvedl. Na odlitku
  (part-10-zapich) to byl rychloposuv skrz ~25 mm² stojícího materiálu za
  zápichem. Fix (`safeRapidTo`): čistě-Z přejezd, který zvedl, už NEsjíždí
  zpět — nástroj zůstane nahoře a navazující nájezd sjede rovnou na skutečnou
  hloubku (přesně „vyjet rychloposuvem nad polotovar, přejet v Z, sjet tam").
  Řezná geometrie beze změny (diff = **jen odebrané `G0 X…`**, žádný přidaný
  ani změněný řezný pohyb); vědomě přegenerované snapshoty 9 fixtures.
- **Semantická pojistka**: `tests/cam-traversal-invariants.test.js` — nad
  emitovanými souřadnicemi (žádný geometrický model → není flaky) hlídá, že
  X-profil každého souvislého běhu rychloposuvů v hrubování je UNIMODÁLNÍ
  (stoupá k jednomu vrcholu = zvednutí, pak klesá na hloubku), nikdy „údolí"
  (sjezd-a-znovu-výjezd). Padá na 9 fixtures před fixem, prochází po něm.

Ověřeno jako už POKRYTÉ (hlavní podélná cesta) — samostatná změna netřeba:
- Z Bezpečné polohy rychloposuvem + přepnutí na **posuv o `rapidStopZ` před
  materiálem** (part-1: `G0 Z<zStart+clr>` → `G0 X<hloubka>` → `G1 Z<zStart>`
  posuvem přes vůli na hranu).
- **Výjezd z materiálu posuvem** o `rapidClearance` za hranu, pak odskok
  (`zExit` v podélném průchodu, gated `rapidHitsStock`).
- **Odskok mezi záběry** (`retractDistance`/`retractAngle`) + rychloposuv
  vzduchem k dalšímu záběru (`safeRapidTo`, dynamický zbytek).

Zbývá (genuinní mezera — order-dependent odlitek):
- **Sjezd na hloubku v SOLIDNÍM odlitku posuvem, ne rychloposuvem**: druhý
  nájezd sjíždí rychloposuvem na `pass.x` i tam, kde je v dané Z-poloze ještě
  plný odlitek (nájezdová vůle `zApprox` je „vzduch" jen vůči kontuře, ne vůči
  odlitkovému obalu) — na part-10 zbývá ~13 mm² grazing. Správně: sjet
  rychloposuvem na povrch odlitku + vůli a zbytek posuvem. Patří k odloženému
  dynamickému plánování (rozdělení rapid↔posuv proti AKTUÁLNÍMU `StockModel`).

Implementace (odloženo): každý bod přejezdu klasifikovat proti **aktuálnímu**
`StockModel` (`pointInLoop` / průnik úseku se zbytkem) — „vzduch“ je vše mimo
zbytkový materiál, včetně už obrobených kapes. Z-limity / X-limity
(`S.zLimits`, `S.xLimits`) vstupují jako ořezový obdélník (`rectClip`)
povolené oblasti přejezdů i záběrů.

### Fáze 5 — sjednocení UI zanořování

> **NEBUDE SE DĚLAT (rozhodnutí 20. 7. 2026):** UI zanořování se sjednocovat
> nebude — v panelu už jsou provedené jiné úpravy a přeskládání checkboxů by je
> rozbilo. `regionRoughing` tedy v UI zůstává (a booleovská region-cesta se
> aktivuje jen s ním, viz Fáze 3 krok 2). Sekce níže je ponechána jako původní
> záměr, ale je NEAKTUÁLNÍ.

Ze tří checkboxů (Zanořování · Dobrat naráz · Hrubovat po regionech) dva:

- **Zanořování** (`plungeRoughing`) — povolí rampu do kapes pod
  `entryAngle` (+ tlačítko Auto z geometrie plátku).
- **Dobrat naráz** (`pocketFinishAtOnce`) — kapsu/zápich dobrat celou hned,
  nevracet se po vrstvách.
- `regionRoughing` zmizí z UI — regiony jsou ve Fázi 3 přirozený výstup
  Clipperu (parametr nechat načítat kvůli starým projektům, ignorovat).
- „Hrub. bez schodků“ + „i u čelního“ zůstávají beze změny.

## Výkonové zásady

- Clipper2 volat po **úsecích/průchodech**, ne v každém mikrokroku simulace.
- V mikrokrocích jen broad-phase (Detect-Collisions AABB/SAT), přesný průnik
  až při hlášeném kontaktu.
- Smyčky pro kreslení průběžně `polySimplify` (ε ≈ 0,005 mm), ať plátno
  neseká; pro výpočty držet nesimplifikovaná data.
- Turf načítat lazy přes `ensureTurf()` až při otevření CAM (531 kB).

## Pořadí prací a rizika

| Fáze | Riziko | Mění G-kód? | Pojistka |
|---|---|---|---|
| 0 základ | žádné | ne | `tests/geom-core.test.js` |
| 1 úběr materiálu | nízké | ne | vizuální kontrola |
| 2 validace kolizí | nízké | ne (jen hlášení) | porovnání s ruční logikou na fixture |
| 3 dráhy z booleanů | **vysoké** | ano | snapshoty `cam-gcode-regression` + příznak |
| 4 přejezdy | střední | ano | snapshoty + simulace |
| 5 UI | nízké | nepřímo | ruční test panelu |
