# Plán přechodu CAM na geometrické knihovny

> Clipper2 (booleovské operace, offsety) · Turf.js (prostorová analýza) ·
> Detect-Collisions (rychlý broad-phase filtr kolizí) · adaptér
> `js/geom/geomCore.js`

## ⛔ MIGRACE UZAVŘENA (10. 8. 2026)

**Hotovo a v produkci:** Fáze 0–2 · 2b/3 · 3a/3b · Fáze 3 (jádro, regiony,
příznak `booleanRoughing`) · Fáze 4 (přejezdy, vjezdy, dynamický zbytek) ·
ÚKLID (všechny tři body). Zbytek dokumentu je **záznam, jak to vzniklo** —
ne backlog.

**Rozhodnutí uživatele:** migrace se dál „dojíždět" nebude. Co zbývalo, byly
z větší části nápady, které nikdy nedostaly reálný důvod; držet je jako
„ZBÝVÁ" jen vyrábělo dojem nedodělku a tlak dělat práci naslepo.

### Vědomě NEDĚLÁME (a proč)

| položka | proč ne |
|---|---|
| **Fáze 3 krok 3C** — řezná dráha z hran komponent | V sadě **nemá demonstrátor**: změřeno 21. 7., že booleovská cesta odebírá materiál identicky se scan-line na VŠECH fixtures (Δ ≤ 1,5 mm²). Byl by to přepis naslepo bez kritéria hotovosti. |
| **Skutečné přeplánování pořadí** operací | Jediný reálný cíl je part-10-zapich (15,9 mm²); face-casting 267 mm² je INHERENTNÍ šířkou nosu, reorder ho neopraví. Proti tomu stojí riziko zásahu do pořadí všech operací. Dnešní `exit-split` je bezpečné řešení („safe-but-slow"). |
| **ÚKLID bod 4** — `pass.kind` místo 11 booleanů, rozsypané tolerance | Čistá kosmetika bez dopadu na výstup. Leda mimochodem, až se toho kódu bude sahat z jiného důvodu. |
| **Zbytkové 0,6–3 mm² `rapid` nálezy** | Pod prahem šumu. Zúžit to jde jen menším `rapidFootSlim`, což vrátí falešné poplachy. Není to rozdíl obrysů nástroje (ověřeno 10. 8.), ale rozdíl modelů „co už je odebráno": emise z plánované geometrie průchodů, validátor z reálné `simPath`. |
| **Rozšíření 2b/3** — polygon/threading s modelem úlevu, F_all ve vizuálním úběru | Nikdo si nestěžoval; „bylo by hezké". |
| **Fáze 5 — sjednocení UI zanořování** | Rozhodnuto 20. 7.: v panelu jsou provedené jiné úpravy a přeskládání checkboxů by je rozbilo. |

### Jediná otevřená věc

**Hranice úseku ve STŘEDU údolí** (sekce „ZBÝVÁ" níž). Dva pokusy zamítnuty
(8. 8. a 10. 8.); u druhého je změřeno, že zadání je jiné, než se myslelo —
**nejde o pokrytí** (levá půlka údolí se odebere stejně s regiony i bez nich),
ale o **kotvu zanoření**. Čeká na díl, kde to reálně uškodí (kolize nebo
prokazatelně stojící materiál). Nezkoušet potřetí bez přečtení „DRUHÝ POKUS".

### Uděláno na závěr (10. 8. 2026)

- **Konec tichého zahazování hloubek.** Obálka držáku uměla vyhodit celou zónu
  bez jediného slova v ⚠ panelu — na `part-13-zleva-flange` takhle zmizelo
  17 průchodů celé pravé strany (držák 20 mm radiálně by musel přes přírubu
  Ø199,7) a vypadalo to jako chyba geometrie. Jeden z counterů
  (`holderNarrowPockets`) se dokonce plnil, ale nikdo ho nehlásil — osiřel.
  Nově se sbírají `holderBlockedDepths` a hlásí se **hloubky, na kterých
  nakonec nevznikl žádný průchod**. Počítat POKUSY nešlo: na
  range-end-leadout to dávalo „17 vynechaných průchodů", ačkoli reálně chyběly
  4 (tentýž interval bývá obsloužen jinou větví nebo přeskenováním).
  Dráhy ani G-kód se nemění.
- **`pocketClean` přejmenován v G-kódu** na „(kapsa bez schodků)". Nález
  uživatele „nemám danou dokončovací operaci, tohle by dělat nemělo" byl
  o POPISKU: průchod visí na „Hrub. bez schodků" (`noStepRoughing`), ne na
  `doFinishing`, a to správně — jeho vypnutí nechá stát 64 mm², protože dobírá
  hřebínky ~0,5 mm po rampách krokovaných po ap. Je to hrubovací dobrání
  schodku, jen se jmenovalo jako dokončování.

## ÚKLID PŘED DALŠÍMI FÁZEMI (zadání 8. 8. 2026) — HOTOVO 10. 8. 2026

> Po sérii oprav řízených reálnými díly (22. 7. – 8. 8.) se nasčítala
> složitost, která už sama vyrábí chyby. Není to nekonzistentní kód — 1187
> testů prochází a model-free pojistky (`cam-traversal-invariants`,
> `cam-gouge-invariants`, `cam-ramp-chain`, `cam-leadout-air-rapid`,
> `cam-region-guide-split`) fungují. Problém je, že **týž pojem je vyjádřený
> na dvou třech místech** a záplata dopadne jen na jednu kopii.

### 1. Polotovar = OFFSETOVÁ ČÁRA (návrh uživatele, hlavní zjednodušení)

Dnes existují **tři** paralelní modely „kde je materiál", každý používaný
jinou částí kódu:

| model | co to je | výskytů |
|---|---|---|
| statická silueta odlitku | `castingTopXAtZ`, `stockLoop0Ref` (gcodeEmit) | 16 |
| dynamický zbytek | `rapidStock`, `rapidHitsStock` (gcodeEmit) | 32 |
| vůlí-posunutá silueta | `stockLoopOffsetL/FullL` (roughingStrategies) | 20 |

**Rozhodnutí:** pro PLÁNOVÁNÍ DRAH je polotovarem **vůlí-posunutá (offsetová)
čára**, syrový obrys se ignoruje. Důvod je fyzikální, ne kosmetický: Přídavek
X/Z (polotovar) je tam právě proto, že odlitek může být větší — takže materiál
až k té čáře **může reálně existovat** a plánovat se musí pesimisticky.
Tím první a třetí model splynou v jeden.

Co tím odpadne:
- `offsetExitZ`, `trimLeadOutToStock`, prodlužování výjezdu v `airSplitAxial`
  a řada „konec řezu se dotáhne na tečkovanou čáru" míst — všechno je pak
  prostě „skonči na polotovaru";
- neshoda prahů, kdy `airSplitAxial` počítá vzduch proti SYROVÉ siluetě
  (práh `x − tipR`), ale výjezd dojíždí na OFFSETOVOU (kvůli tomu se
  8. 8. musela přišroubovat pojistka `rapidHitsStock` na `G0` uvnitř řezu).

**POZOR — co se inflatovat NESMÍ:** `validateToolpath` (`collisionValidator.js`)
a vizuální úběr (`MaterialRemoval`/`buildStockLoop`) odpovídají na jinou otázku
(„narazil jsem fyzicky?" / „co je vidět"), ne „kde může být materiál". Tam
zůstává SYROVÝ obrys, jinak by validátor hlásil kolize v přídavkovém pásmu
a v simulaci by materiál nemizel. Po úklidu tedy zůstanou dva modely
s jasnou dělbou: **pesimistický obrys (plánování)** × **dynamický zbytek
(co už je odebráno)** — a validátor se syrovým obrysem stranou.

Degenerovaný případ je bezpečný: při nulových přídavcích je offsetová čára
totožná se syrovou, takže se nic nemění.

**HOTOVO (jeden plánovací obrys, 10. 8. 2026).** První a třetí model splynuly:

- `gcodeEmit.js` má nově `planLoopRef()` = vůlí-posunutá silueta (fallback na
  syrovou, když Clipper selže) a nad ní `planTopXAtZ` / `planCrossZ`. Zanikly
  `castingTopXAtZ`, `castingTopXAtZOffset` a `castingCrossZ`; čtyři skoro
  identické průchody smyčkou nahradily sdílené `topXOnLoop` / `crossZOnLoop`
  (`offsetExitZ` si vlastní průchod nechává vědomě — hledá NEJBLIŽŠÍ hranu
  ve směru jízdy a porovnává na 1e-6, kdežto `crossZOnLoop` zaokrouhluje na
  0,1 µm, což by u hrany přesně na `zFrom` rozhodlo jinak).
- **Sdílená `offsetStockLoop(loop, prms)`** (`materialRemoval.js`) — offset
  siluety byl do té doby zkopírovaný v `gcodeEmit.js` i `roughingStrategies.js`
  (a testy by ho potřebovaly jako třetí kopii). Je to jediné místo, kde jde
  opravit známá mez „bere se jen komponenta `[0]`".
- **`stockEntryRamp` přestal ručně přičítat vůli** na konci nalezené přímky
  (na diagonále to není totéž co posun KOLMO k hranici) — testuje se přímo
  proti `stockLoopOffsetL` a konec se dopřesní půlením. Přesně stejná oprava,
  jakou už měl zrcadlový `findRampOutTarget`.
- **Nulový Přídavek X i Z (polo.) = žádná offsetová čára se nehledá**
  (`stockClearanceIsZero` v `camMath.js`): plánovacím obrysem je přímo
  polotovar, jak je nakreslený. Přes `stockClearances` to nešlo — ta zdola
  ořezává na 0,05 mm (mez pro zastavení rychloposuvu a ochrana před dělením
  nulou u anizotropního offsetu), takže i při nulovém zadání by se obrys
  posunul o 0,05 mm a Clipper by ho navíc přetesseloval. Prázdné pole nulou
  NENÍ (dědí `rapidClearance`); jen jedna z hodnot nulová taky ne. Platí i pro
  válcovou obdobu (`stockSurfX`), kde žádná smyčka k offsetování není.

**Změřeno** (izolovaně per fixture proti worktree; `remain` = stojící materiál):
- **part-11/12-zleva: `rapid` kolize 101,3 → 91,6 mm²**, jinak beze změny;
- pocket-wall-at-plunge-angle: −4 řádky G-kódu, materiál ± 0,0;
- holder-region-roughing: +0,85 mm² (0,02 %) a +1 průchod — z přesnější kotvy
  `stockEntryRamp`; ostatních 15 fixtures beze změny.
- V pořadí regresní sady (kontaminovaný singleton `S`) totéž: part-1 +0,36 mm².

G-kód se hnul na 14 fixtures, ale **jednotným vzorem**: hranice G1/G0 se posune
tak, že posuv jde dál a rychloposuv vzduchem se krátí. Žádný nový typ pohybu.
Snapshoty obou regresních sad vědomě přegenerovány (izolovaně po souborech).

Pojistka `tests/cam-leadout-air-rapid` **musela změnit referenci**: měřila
„vzduch" proti SYROVÉ kůře, což je přesně konvence, kterou tenhle krok ruší.
Reálný případ: `pocket-wall-at-plunge-angle` má dolík hluboký 0,68 mm při Vůli
1 mm — z hlediska plánování je to plný materiál a jede se posuvem, kdežto test
to hlásil jako 8 mm posuvu vzduchem. Nově měří proti plánovacímu obrysu, takže
si sílu zachovává (skutečná údolí jsou hlubší než přídavek).

### 2. Sloučit duplicitní detekci údolí

`computeResidualRegions` (`booleanRoughing.js`) a `manualRegionSplits`
(`roughingStrategies.js`) implementují **týž algoritmus dvakrát** (booleovská
vs. ruční cesta). Nejlepší důkaz, že to škodí: **obě měly identickou chybu**
(hranice = střed dna údolí místo ústí, viz ZBÝVÁ ve Fázi 4). Sloučit do jedné
funkce; ruční cesta ať je jen jiný zdroj vstupní siluety.

**HOTOVO (10. 8. 2026).** `manualRegionSplits` zrušen, zůstala jediná
`regionSplits()` nad `computeResidualRegions`. Příznak `booleanRoughing` už
detekci údolí NEOVLIVŇUJE (dál rozhoduje jen o zdroji řezných intervalů).

Sloučeno na **vzorkovanou** verzi, protože přesněji určuje ÚSTÍ údolí:
vrcholová heuristika brala jako ústí sousední VRCHOL obrysu, což je na dlouhé
šikmé stěně až její druhý konec. Naměřený dopad té nepřesnosti: na part-11/12
si obě cesty našly totéž údolí (z −172,9 vs −172,5), ale `splitIsNeeded`
rozhodl OPAČNĚ → **23 vs 31 průchodů**. Ústí je přitom právě to, podle čeho se
k údolí přiřadí mezní čára destičky.

Zjištění při měření: **6 fixtures (part-11/12/13, range-*) běží booleovskou
cestou**, zbytek ruční — takže obě větve byly v sadě živé a rozdíl mezi nimi
maskovaný. Po sloučení: holder-region +0,44 mm², part-10 −0,09, part-1/2/4/6/9
a pocket-wall −0,05 až −0,24 (v pořadí sady), **počty průchodů i řádků beze
změny**; booleovské snapshoty se nehnuly vůbec (ty už tenhle detektor měly).

### 3. Sjednotit modely nástroje

`rapidFoot` (5×), `rapidFootSlim` (4×), `toolFootprint` (8×) + plný obrys
destičky ve validátoru. Zbytkové nálezy 0,6–3 mm², které se 8. 8. nepodařilo
dorazit, jsou doslova mezera mezi dvěma z nich. Buď jeden obrys s explicitním
parametrem „bezpečnostní zúžení", nebo aspoň zdokumentovat, kdo kdy který
používá a proč.

**HOTOVO (10. 8. 2026) — a zadání bylo postavené na omylu.** Obrysy nejsou
čtyři, ale **DVA**, a obě strany je používají SHODNĚ:

| obrys | k čemu | emise | validátor |
|---|---|---|---|
| plný `toolFootprint` | čím se ODEBÍRÁ materiál | `rapidFoot` (`noteCutPass`) | `foot` (cut) |
| zúžený o 0,05 mm | čím se TESTUJE dotyk | `rapidFootSlim` (`rapidHitsStock`) | `footShrunk` (G0 test) |

Zúžení se počítalo `polyOffset(−0,05)` zvlášť v `gcodeEmit.js` a zvlášť
v `collisionValidator.js` — odtud dojem dvou různých modelů. Nově je to jedna
`toolFootprintSlim(prms, shrink = 0.05)` v `materialRemoval.js` s explicitním
parametrem „bezpečnostní zúžení"; validátoru zůstal jeho konfigurovatelný
`opts.shrink`. Čistý dedup, **měřitelně nulový dopad**.

**Zbytkové nálezy 0,6–3 mm² tedy NEJSOU rozdílem obrysů** (jak doc tvrdil) —
je to rozdíl mezi tím, JAK KAŽDÁ STRANA VÍ, co už je odebráno: emise si zbytek
vede z PLÁNOVANÉ geometrie průchodů (`noteCutPass` = leadIn → rampa → dno →
leadOut), validátor z reálně projeté `simPath`. Kdo to bude chtít dorazit, musí
sblížit tyhle dva modely zbytku, ne obrysy nástroje.

#### Doplněk (11. 8. 2026): stopa má SMĚR — čelně se prodlužuje v Z

Obrys byl osově souměrný podle osy Z (šířka jen 2R) a tělo protahoval pouze
radiálně o `max(2·ap, 3)`. To je správně pro PODÉLNÉ hrubování, kde se
sousední průchody skládají v ose X a hřebínek mezi nimi leží pod tím
prodloužením. **Čelně se ale průchody skládají v Z** s roztečí ap, takže
v modelu zůstával stát hřebínek `ap − 2R` po celé délce dílu. Fyzicky
neexistuje (odřízne ho tělo destičky), ale všichni tři konzumenti obrysu ho
brali vážně:

| konzument | projev falešného hřebínku |
|---|---|
| `HolderGouge` | oranžová stopa vnoření držáku přes CELÝ obrobek |
| `rapidStock` (emise) | „Výjezd nad konturu" před každým čelním průchodem |
| `validateToolpath` | desítky ⛔ nálezů „držák v materiálu" |

Nově `insertBodyZ(prms, r)` v `materialRemoval.js` protahuje stadion i v Z —
**jen čelně** (`roughingStrategy === 'face'`) a **jen k obrobené straně**
(zprava +Z, zleva −Z, tedy zrcadleně podle `roughingSide`, stejná konvence
jako `span`/`dirM` v hlídání upichováku). Rozsah: upichovák `Šířka − R`
(fyzická šířka břitu), ostatní tvary `ap` (dosáhne přesně na střed rádiusu
předchozího průchodu, překryv R) — dál se tělo nemodeluje, aby se
nezakrývaly skutečné kolize. Podélná větev vrací bajt po bajtu týž polygon
(snapshoty part-1…13 se nehnuly), čelní fixtures `face-cylinder`
a `face-casting` se přegenerovaly.

**Co po opravě ZBYLO a je skutečné:** čelní generátor nemá `holderClampZEnd`
(používá ho jen `genLongPasses`), takže vlevo od stěny, která stoupá směrem
k obrobené straně, jede 20mm držák v materiálu. Na dílu uživatele
(kužel Z 212→221) po opravě zbylo 126 nálezů, všechny v Z ≤ 216 — to už není
artefakt modelu, ale chybějící PREVENCE (clamp/přeplánování pořadí u čelního
hrubování).

### 4. Drobnosti stejného původu

- **`pocketReposition` sdílejí TŘI mechanismy** (řetěz vjezdu na hranici
  rozsahu, dobírání kapsy, dorampování strmé stěny). Průchod nese 11 příznaků
  (`ramp`, `rampCompletion`, `pocketEntry`, `pocketReposition`,
  `entryRangeRamp`, `holderClamped`, `noRetract`, …). Kvůli sdílení příznaku
  vznikla 8. 8. špatná assertion v testu. Zvážit `pass.kind` místo sady
  booleanů.
- **Osiřelý kód**: `clamp.span` (Fáze 3b) byl napsaný a týdny NIKÝM nevolaný;
  `return;` vypínající kapsovou větev nechal pod sebou ~370 řádků mrtvého
  kódu. Při vypínání větve VŽDY zkontrolovat, co tím osiří.
- **Rozsypané pevné tolerance** (0,2 / 0,1 / 0,05 / 0,01 mm, 0,5 mm²,
  `CORNER_TOL 1,5`). Neúspěšný pokus z 8. 8. byl přesně o jedné takové:
  tolerance 0,2 mm, do které se trefí jen náhodou, protože burst sjíždí po
  `ap`, kdežto stěna je šikmá. Odvozovat od kroku/geometrie, ne psát ručně.

**Co NEDĚLAT:** nedělit `roughingStrategies.js` (2380 ř.) ani `gcodeEmit.js`
(1357 ř.) kvůli velikosti. Bez sjednocení modelů výš by se složitost jen
rozprostřela do víc souborů. Dělení existujícího souboru je samostatné vědomé
rozhodnutí (viz CLAUDE.md), ne vedlejší efekt úklidu.

**Jak měřit:** každý krok izolovaně per fixture, baseline v odděleném
`git worktree` (viz `feedback_measure-baseline-in-worktree`), hlídat
zbytkový materiál i kolize — ne jen zelené testy. Snapshoty obou regresních
sad jsou síť; jejich změna musí být vždy vysvětlená.

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

> **ZRUŠENO 5. 8. 2026 pro MEZNÍ ČÁRY.** Mezní čára hlídání geometrie destičky
> musí být **rovná úsečka** — žádné oblouky, žádné zlomy. Hranice dosažitelné
> oblasti kopíruje zakřivenou konturu, takže lomená („via") mezní čára
> vycházela jako křivka. `computeInterferenceGuides` proto F_all vůbec
> nepočítá a vrací čistou hranu destičky;  `buildHolderBoundaryPts` zůstává
> jen jako samostatný helper s charakterizačním testem, do pipeline zapojený
> není. Popis níže platí dál pro **ostatní** spotřebitele F_all (obálka
> držáku v `roughingStrategies.js`, `collisionValidator.js`) — kolizní
> ochrana držáku se tím nezměnila, jen se nepromítá do mezních čar.

Mezní čáry (`computeInterferenceGuides` / `buildHolderBoundaryPts`) se počítaly
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
  mezeru, ⚠ varování).
  > **OPRAVA 11. 8. 2026 — ZÁMĚNA SOUSTAV, dokončování mizelo celé.**
  > Dokončovací smyčka brala `clamp.isForbidden` z hrubovacího clampu, jehož
  > překážkou je silueta HRUBOVACÍHO offsetu (kontura + R + přídavek) = dráha
  > STŘEDU špičky, ne materiál. Hrubovací průchody po ní jezdí ZVENČÍ (dotyk =
  > mez), takže je pro ně správná; dokončovací dráha (kontura + R) ale leží
  > z definice UVNITŘ — a protože obrys držáku obsahuje počátek, platí
  > F ⊇ překážka → zakázáno bylo úplně všechno. Změřeno: 42/42 vzorků
  > dokončovací dráhy uvnitř siluety, díl uživatele 18/18 úseků zahozeno,
  > fixtures part-2/4/6/8/9 po 13 (a `; --- DOKONCOVANI ---` v jejich
  > snapshotech vůbec nebylo, aniž by si toho kdo všiml).
  > Dokončování má teď **vlastní obálku `makeFinishTipGuard`**, jejíž
  > překážka = silueta FINÁLNÍ kontury ∩ polotovar (skutečný materiál).
  > Přídavková slupka se nemodeluje schválně — sundává ji špička před sebou
  > (táž úvaha jako morfologický opening u hrubovacího clampu).
  > Hrubování se nezměnilo (G-kód 18/18 fixtures bajt po bajtu shodný).
- **Kvalita dokončovacích drah (11. 8. 2026, nálezy uživatele na part-14)**:
  (a) NÁJEZD — rampu pod úhlem zanoření měl jen první řetěz, navazující
  dosedaly kolmo v X na hotovou plochu (ryska v místě dotyku). Rampu teď
  dostávají všechny, ze strany po SMĚRU řezu; koridor se prověřuje proti
  `residualTopXAtZ` (strop záběru = jedna hloubka třísky) i proti hotovní
  kontuře (`finProfileXAt` = finishOffsetPath ∪ finishUnreachablePath),
  jinak fallback na svislý dojezd. PAST: cílový bod rampy (t = 1) LEŽÍ na
  kontuře, takže materiál v jeho Z-rovině je z definice — u čela k ose
  celé tělo dílu; testovat ho nesmíš, jinak zablokuješ každý nájezd na
  čelo (chyceno `tests/cam-finish-holder.test.js`: fallback vyrobil rapid
  materiálem, 7–28 mm² na part-1/2/4/6/9).
  (b) ŽÁDNÉ PŮLKY SEGMENTŮ — částečně dosažitelný oblouk se ořezával na
  dosažitelnou část (`arcReachableSpan`, Fáze 3b); pravidlo uživatele je
  „celý, nebo vůbec" (schod uprostřed rádiusu je horší než neobrobeno).
  Ořez odstraněn; místo něj **rovný průměr** = přímý pohyb v Z na téže
  hloubce, dokud nástroj z materiálu nevyjede (`finRunOut` v gcodeEmit —
  potřebuje zbytkový polotovar, který zná jen emise). Taky celý, nebo
  vůbec: zastavení o strop záběru = pahýl uprostřed materiálu.
  (c) DVA RŮZNÉ STROPY ZÁBĚRU (oprava po nálezu na part-15): rampa nájezdu
  smí ukrojit jen PŘÍDAVKOVOU SLUPKU (má do plochy dosednout), rovný
  průměr smí jednu hloubku třísky (má zbytek ubrat). Se společným stropem
  ap projela rampa klínem po zanoření hrubování — 1,2 mm třísky celou
  délkou nájezdu.
  (c2) ROVNÝ PRŮMĚR I NA ZAČÁTKU ŘETĚZU (`finRunInZ`) — zrcadlo `finRunOut`,
  jen u válcového prvního úseku (|Δx| < 0,05). NÁLEZ PŘI LADĚNÍ: zbytkový
  model `rapidStock` hlásí u průchodů SLEDUJÍCÍCH KONTURU povrch až o
  PŘÍDAVEK níž, než po hrubování reálně zůstal (naměřeno 27,044 vs. 27,441
  na oblouku R6 dílu uživatele; rozdíl = přesně allowanceX 0,4) — jako by
  `noteCutPass` registroval ty úseky po hotovní čáře místo po hrubovací
  offsetové. Rovný průměr proto bere hranici „materiál došel" o přídavek
  níž (`finTopEps`). Tohle je jen obcházka v dokončování; SAMOTNÁ NEPŘESNOST
  ZŮSTÁVÁ a míří na nebezpečnou stranu i pro rychloposuvy (model si myslí,
  že materiál už není) — na fixtures ji validátor drah nechytá, ale stojí
  za samostatnou opravu v `noteCutPass`.
  (c3) MEZNÍ ČÁRA PLATÍ I PRO DOKONČOVÁNÍ (`machinableRangeOf` v
  contourBuild.js). Mezní čára neomezuje jen CELÉ úseky — stín nedosažitelné
  strmé stěny zkrátí i sousední válec: na part-15 končí válec X9,117 podle
  `buildMachinableContour` už na Z245,966, ne na Z243,123. Hrubování po
  obrobitelné kontuře jede, dokončování jelo po syrové a poslední 2,9 mm
  bralo naráz 29 mm² (tříska 14 mm). Úsek, na který se nedá dojet celý, se
  podle rozhodnutí uživatele (11. 8. 2026) NEOBRÁBÍ VŮBEC — ani zkrácený,
  a to i pro ÚSEČKY (dřív jen oblouky). Cena je vědomá: na part-15 tím
  vypadne dokončení 99 mm válce Ø18,2. Párování preBridge ⇄ machinable je
  GEOMETRICKÉ (nosná přímka / střed+poloměr), ne přes identitu objektů —
  obrobitelná kontura vzniká mutací a `preBridgeContour` je klon před ní.
  MĚŘENÍ hloubky třísky: přehrát emitované řezné bloky ze `simPath` do
  StockModelu (jako validateToolpath) a brát LOKÁLNÍ záběr ve vzorcích, ne
  průměr přes blok — špička na posledních mm 102mm válce se v průměru
  ztratí (0,67 vs. 14 mm). Pojistka: `tests/cam-finish-holder.test.js`
  „žádný dokončovací řez nebere víc než přídavek".
  (d) NULOVÉ ÚSEKY (p1 ≡ p2) z ořezu kolineárních segmentů se z
  `finishOffsetPath` zahazují. Neobrábějí nic, ale projdou filtry — a když
  jejich skutečné sousedy vyřadí držák, zůstane sirotek, kolem kterého
  emise vyrobí plný nájezd i odjezd (na part-15 sjezd do materiálu, nic,
  a výjezd posuvem skrz materiál). `chainBreak` dědí jen tehdy, když ho
  nulový úsek skutečně měl — jinak vznikne zbytečný přejezd mezi
  spojitými sousedy.
- **Zbytek polotovaru při dokončování (11. 8. 2026)**: obálka výš zná jen
  finální tvar, ne POŘADÍ obrábění. Co po hrubování reálně zůstalo stát
  (nevyhrubovaný klín za bossem), ví až dynamický `rapidStock` v emisi —
  úseky, kde by v něm jel držák, se zahazují až tam (`gcodeEmit.js`, hlášení
  přes `S.genNotes` → `fullUpdate()`). Testuje se JEN materiál nad hotovým
  tvarem (`rapidStock − kontura⊕přídavek`): kdyby se testoval celý zbytek,
  přidaly by se inherentní kolize modelu držáku s TĚLEM dílu u čela k ose
  a dokončování čela by zmizelo celé (face-casting). Změřeno validátorem:
  face-casting 4 → 0, face-cylinder 8 → 0 nálezů v dokončovacím bloku.
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

### Fáze 3 — hrubovací dráhy z booleovské geometrie (krok 3C se DĚLAT NEBUDE)
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

**HOTOVO — krok 3A geometrické primitivum + síť pro restrukturaci (21. 7. 2026):**
`extractLayerComponents` (booleanRoughing.js) rozloží hloubkovou vrstvu na
KOMPONENTY (samostatné smyčky pásu `[xLo,xHi]∩zbytek`) a per komponentu vydá:
`zStart`/`zEnd` (Z-rozpětí), `floorIntervals` (ploché řezné intervaly na dně pásu =
dnešní intervalová emise) a `bottomEdge` (min-X hrana = ŘEZNÁ DRÁHA z HRAN pro
krok 3C; přepínač `withEdge`). Helper `loopBottomXAtZ` (zrcadlo `residualTopXAtZ`).
Testy `tests/boolean-layer-components.test.js`. Nová G-kód pojistka
`tests/cam-boolean-gcode-regression.test.js` přišpendlila PŘESNÝ výstup booleovské
větve všech 12 fixtures (dosud ji hlídala jen material-parita) — nutná síť pro 3C.

**KLÍČOVÝ NÁLEZ MĚŘENÍ (21. 7. 2026) — krok 3C nemá v sadě demonstrátor,
„output-ekvivalentní 3B" NELZE:**
- Booleovská cesta dnes odebírá materiál IDENTICKY jako scan-line na VŠECH
  fixtures (Δ ≤ 1,5 mm², metoda `remaining` jako v boolean-roughing-wiring). Δ:
  holder-region +0,1, part-10 −1,5, holder-slanted 0,0.
- Scan-line hrubování má ÚPLNÉ pokrytí dosažitelného materiálu (řeže každou
  hloubku X na všech Z, kde je díl pod ní) → **stojící materiál nenechává**;
  demonstrátor „díl nechávající stát materiál" tudíž nejde postavit. Historické
  `+121/+243 mm²` byly artefakt naive-residual pokusu, ne reálná mezera.
- Přínos kroku 3C je tedy **kvalita PŘEJEZDŮ** (mělký průchod netáhne po kontuře
  napříč dílem), ne pokrytí — neměří se jako mm² materiálu.
- Empiricky ověřeno (a vráceno): přepojení `booleanScanIntervals` přes
  `extractLayerComponents` (per-hloubka komponenty) ZMĚNILO booleovský G-kód 2
  fixtures (holder-region, pocket-wall) → per-hloubka komponenty **NEJSOU**
  output-ekvivalentní s plochými intervaly (granularita se u sevření pásu liší),
  patří do 3C. Snapshot to zachytil. Cheap `layerZIntervalsAtX` (memoizovaný
  zbytek) je navíc perf-lepší než per-hloubka Clipper `sliceLayer`.

DALŠÍ KROK (až reálný složitý díl vyžádá): 3C = řezná dráha z `bottomEdge` +
leadOut po hraně komponenty + holder-trim z hrany; vědomě přegenerovat booleovské
snapshoty. Scan-line snapshoty (flag OFF) zůstávají mimo.

### Fáze 4 — plánování přejezdů (rychloposuvy) — ČÁSTEČNĚ (16. 7. 2026)

Hotovo:
- **Přídavek kolem polotovaru po osách** (`stockClearX`/`stockClearZ`, UI
  „Přídavek X/Z (polo.)", null = dědí `rapidClearance`): hranice konce
  rychloposuvu / začátku G1 se kreslí **tečkovaně kolem polotovaru**
  (válec i odlitek, per-osový offset povrchu). Emise nájezdů/odskoků,
  čelní hrubování, závit i upichnutí čtou oddělené hodnoty
  (`camMath.stockClearances`). Na tuhle čáru dráha i VYJÍŽDÍ na konci řezu
  (`gcodeEmit.offsetExitZ`) — odsazení podél osy Z by na šikmé/obloukové
  hraně skončilo uvnitř přídavkového pásma.
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

Hotovo (podélný řez rapiduje vzduch nad drážkami odlitku — increment 1, 22. 7. 2026):
*Řízeno REÁLNÝM dílem uživatele (`projekt_2026-07-22`) — první demonstrátor, kde
scan/bool cesta prokazatelně řeže vzduch: nálezy „průchod začíná ve vzduchu z druhé
strany zápichu / nedojede k polotovaru".*
- **Kořen**: hrubovací intervaly se počítají proti OBDÉLNÍKOVÉMU obalu polotovaru
  (rozhodnutí Fáze 3), který ignoruje siluetu odlitku → podélný průchod na hloubce
  X **posuvem** táhne i nad drážkou/nižším místem odlitku, kde díl nesahá a odlitek
  tam není (vzduch). Ověřeno: region-průchody part-uživatele startovaly ~40 mm ve
  vzduchu nad zápichem.
- **Fix** (`gcodeEmit.js`, sdílené pro scan i bool): podélný řez `zStart→zEnd` se
  rozseká na `G0`(vzduch nad odlitkem) / `G1`(materiál) podle PŮVODNÍ siluety
  odlitku (`castingTopXAtZ` z hoisted `stockLoop0Ref`, `castingCrossZ`). Práh je
  **`pass.x − tipRGc`** (dosah NOSU, ne střed — nos sahá o R hlouběji, jinak by se
  skipnul materiál grazovaný nosem: latentní +16 mm² na part-8, chyceno paritou a
  opraveno). Clearance „bezpečný dotek" (`G1 Z zStart`) beze změny; rapid jen
  VÝRAZNÝ vzduch ≥0,5 mm (drobné crossingy tesselovaných oblouků siluety se
  nesekají); sousední úseky stejného typu se slévají → celý řez v materiálu =
  původní `G1 Z zEnd` (snapshoty bez drážek beze změny).
- **Materiál-parita 100 %** (rapiduje jen prokazatelný vzduch): part-1/8/10,
  holder-region, pocket-wall i uživatelův díl mají zbytek IDENTICKÝ s baseline
  (ověřeno StockModel remain-sweepem před/po). Vědomě přegenerované snapshoty 9
  casting fixtures × 2 (scan+bool). Invarianty/kolize/material-removal beze změny.
- **Rozsah**: řeší jen PODÉLNÝ Z-řez (`pass.type==='long'` bez ramp/pocketEntry).
  ZBÝVÁ (další increment y z bug-reportu uživatele): rampy pocketEntry přes vzduch
  (`N550/N570` — diagonální G1, jiná větev), „bez schodků" leadOut na regionech
  B/C (= krok 3C, leadOut po hraně komponenty), plné zanoření zápichu, pořadí
  operací (dodělat čelo → pak zanoření).

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
- **Sjezd na hloubku dle povrchu ODLITKU, ne kontury** (`descendTo` v
  `safeRapidTo`): nájezdová vůle `zApprox` je „vzduch" jen vůči kontuře — obal
  odlitku tam může být plný, takže rychloposuv na hloubku vjížděl do materiálu.
  Když sjezd reálně naráží na zbytek (gate `rapidHitsStock` — STEJNÝ práh 0,5 mm²
  jako jinde, takže skin-grazing pod prahem se nechytá a cylindry/part-1..9
  zůstávají prakticky beze změny), rychloposuv se zastaví na povrchu zbytku +
  vůle (`residualTopXAtZ`) a zbytek dojede posuvem. Endpointy řezu beze změny
  (žádný materiál navíc). Nejvíc pomohlo holder-region (descend rapid do odlitku
  → posuv); vědomě přegenerované snapshoty 4 fixtures (holder-region/-casting,
  face-cylinder drobný posun zastavení rapidu, part-1 touch-nájezd o 0,37 mm).

Ověřeno jako už POKRYTÉ (hlavní podélná cesta) — samostatná změna netřeba:
- Z Bezpečné polohy rychloposuvem + přepnutí na **posuv o `rapidStopZ` před
  materiálem** (part-1: `G0 Z<zStart+clr>` → `G0 X<hloubka>` → `G1 Z<zStart>`
  posuvem přes vůli na hranu).
- **Výjezd z materiálu posuvem** o `rapidClearance` za hranu, pak odskok
  (`zExit` v podélném průchodu, gated `rapidHitsStock`).
- **Odskok mezi záběry** (`retractDistance`/`retractAngle`) + rychloposuv
  vzduchem k dalšímu záběru (`safeRapidTo`, dynamický zbytek).

Hotovo (výjezd skrz odlitek posuvem — exit-split, 22. 7. 2026):
- **Retract NAHORU z hluboké polohy skrz odlitek** (part-10 ~16 mm²): svislý
  zdvih „Výjezd nad konturu" (`safeRapidTo` v gcodeEmit.js) se teď testuje proti
  `rapidStock` (STEJNÝ práh `rapidHitsStock` 0,5 mm² jako `descendTo`). Když
  zdvih reálně naráží na stojící kůru, DĚLÍ se — část skrz materiál až nad
  povrch zbytku (+ vůle `rapidStopX`, `residualTopXAtZ`) jede POSUVEM
  (`G1 … ; Výjezd materiálem posuvem`), zbytek vzduchem rychloposuvem. Přesné
  zrcadlo `descendTo` (opačný směr). Endpoint (xUp) i navazující přejezd v Z
  beze změny — mění se jen JAK se k xUp dojede (posuv místo rapidu skrz materiál),
  **žádná změna řezné geometrie** (diff = jen `G0 X…` → `G1 X… posuvem` [+ `G0`]).
- **Politika „safe-but-slow", ne reorder**: je to bezpečné projetí kůry posuvem,
  ne přeplánování pořadí. Odlitkové order-dependent podélné retrakty (part-10,
  holder-*, part-1/4/6/8/9, pocket-wall — všechny měly latentní rychloposuv skrz
  stojící materiál, ne jen part-10; baseline seamu je podhodnocoval) se opravují
  konzistentně. **Čelní PŘEJEZDY se VYNECHÁVAJÍ** (`feedThroughStock=false` u
  `safeRapidTo(pass.xStart, …)`): tam je dotyk sousedního neobrobeného Z
  INHERENTNÍ šířkou nosu (face-casting 267 mm²/37 přejezdů), ne order-dependent
  kolize → zůstává rychloposuvem (jinak by se jen nafoukl čas). Face-casting
  roughing se tím NEMĚNÍ (jen 1 dokončovací retrakt skrz tělo odlitku).
- Semantická pojistka: `tests/cam-traversal-invariants.test.js` (2. smyčka) —
  model-free hlídá, že exit-split jede vždy monotónně VEN (feed roste v X, návazný
  rapid pokračuje ven), nikdy „feed ven → rapid zpět dovnitř".
- Vědomě přegenerované snapshoty (izolovaně per soubor — singleton `S`
  kontaminuje): `cam-gcode-regression` (scan-line, ~27 konverzí) i
  `cam-boolean-gcode-regression` (~12). Ověřeno normalizací N-čísel: jediný nový
  typ řádku je `Výjezd materiálem posuvem`, vše ostatní jen přečíslování.

Hotovo (vjezd na materiálu + jen nutné regiony — pořadí vrstev, 27. 7. 2026):
- **Vjezd průchodu na hranici REÁLNÉHO materiálu** (`passEntryZ` v
  `roughingStrategies.js`): okno regionu / rozsahu 📐 může začínat ve VZDUCHU
  (údolí odlitku, mezera mezi hrby). Průchod pak „vjížděl" desítky mm mimo
  materiál — emise to sice přeletěla rychloposuvem (`rapidStock`), ale obálka
  DRŽÁKU posuzovala vjezd tam, kam nástroj nikdy nesjede, a fyzicky bezpečný
  průchod zahodila (na díle uživatele vypadla celá vrstva u NEJVĚTŠÍHO průměru).
  Okno se teď ořízne paritou průsečíků **vůlí-posunuté siluety** (`stockLoopOffsetL`
  — tečkovaná hranice, přesně kde začíná posuv; syrový obrys by vjezd posadil až
  ZA vůli a u šikmé stěny nechal klínek — ověřeno na holder-region-roughing).
  Když v okně na dané hloubce materiál není, hloubka se přeskočí (dřív z ní
  zbyl prázdný průchod = „trojúhelník" uprostřed údolí). Výjimka: materiál za
  stěnou kontury (vjet nelze) nechává kraj okna beze změny — takový průchod
  neřeže vrstvu, ale jeho dojezd „bez schodků" po stěně ano.
- **Split regionu jen když opravdu dělí** (`splitIsNeeded`): údolí odlitku je
  SIGNÁL, ne důvod dělit dráhy. Pro každou hloubku, kde region pod splitem něco
  bere, se zkusí SLOUČENÝ sken; když dojede aspoň tak hluboko jako samostatný
  region, split se zahodí. Bez toho hranice krájela souvislý zátah: nejdřív celá
  PRAVÁ strana, teprve pak levá — i když je vlevo VĚTŠÍ průměr (díl uživatele:
  údolí od oblouku na odlitku, hrb Ø77 vlevo se hruboval až po Ø70 vpravo).
  Po sloučení jde vrstva odshora dolů přes obě strany, vzduch mezi nimi přeletí
  rychloposuvem, a doleva se pokračuje jen tam, kam pustí kontura — dělení tak
  vzniká z OFFSETU HOTOVNÍ KONTURY, ne ze středu údolí polotovaru.
- **Hranici dělá až dosah destičky** (`guideStaysInStock`, doplněno 5. 8. 2026
  jako doplněk předchozího bodu): test „sloučeného skenu" je jednosměrný — porovnává jen PRVNÍ interval,
  takže když sweep narazí na stěnu kontury hned na začátku (hrubování zleva),
  hranici zachová, kdežto z druhé strany TÉHOŽ dílu ji zahodí. Rozhoduje proto
  mezní čára hlídání geometrie destičky (`interferenceGuides`, kind `zanoreni`)
  ležící v ÚSTÍ údolí (`zHi`/`zLo` ze `computeResidualRegions`): vyjede-li
  volným koncem z polotovaru do vzduchu, je materiál za ní z téhle strany
  nedostupný a hranice platí; končí-li uvnitř polotovaru (na hotovní kontuře),
  úsek nedělí. Údolí BEZ mezní čáry si hranici drží — nahradit údolí čistě
  mezními čarami NELZE (naměřeno: range-end-leadout +545 mm² zbytku,
  14→4 průchody). Zamčeno v `tests/cam-region-guide-split.test.js`.
- Měřeno per fixture izolovaně (singleton `S` kontaminuje) při `regionRoughing`
  ON i OFF: zbytkový materiál shodný nebo lepší (holder-casting-slanted −5 mm²,
  part-1/2 +1,5 mm² = 0,03 %), průchodů méně (např. part-4/6 40→36,
  holder-region 27→23, díl uživatele −707 mm² zbytku). Vědomě přegenerované
  snapshoty obou regresních sad.

Hotovo (rampa dojezdu nepodjíždí konturu, 27. 7. 2026):
- **`findRampOutTarget` testuje i HOTOVNÍ KONTURU**, nejen siluetu polotovaru.
  Dřív rampa dojezdu „bez schodků" mířila tam, kde přímka pod úhlem zanoření
  opustí vůlí-posunutou siluetu odlitku — pokud mezi tím kontura zase stoupala
  (údolí s protilehlým hrbem), vedla rampa i navazující dokončovací kroky přímkou
  SKRZ díl. Naměřeno na fixtures: **6 z 12 mělo zajezd 42–44 mm pod offset**
  (rampa dojela na X≈−1, tj. za osu), reálný díl uživatele 18 mm. Konec rampy se
  dopřesňuje půlením (dosedne přesně na konturu); rovné úseky dokončovacích kroků
  (`pendingRampCompletions`) dostaly stejné omezení (`straightRunEndZ`).
- **Rovné pokračování dojezdu jede až na stěnu kontury** (dřív jen k Z, kam mířila
  rampa): rampa je VJEZD do vrstvy, po dosednutí má dojezd dobrat schodek přes
  celé údolí a teprve pak odjet.
- **Po dosednutí se dobere schod SLEDOVÁNÍM OBRYSU** (`traceOffsetPath` +
  `findLeadOutEndZ` na konci rovného úseku, a totéž u posledního kroku
  `pendingRampCompletions`) — bez toho končila vrstva v údolí nasucho a mezi ní a
  hotovní konturou stál klín (reálný nález uživatele: „dvě vrstvy v údolí nejsou
  dojeté"). Trasa se přijme jen když NAVAZUJE na aktuální polohu
  (`traceIfContinuous`): u zápichu má kontura na tomtéž Z víc větví a
  `traceOffsetPath` může vrátit jinou → mezi ně by se emitoval svislý sjezd skrz
  materiál (chyceno pojistkou na part-10, 6 mm).
- Pozn. k pojistce: kritérium je DVOJ-podmínkové (pod max X offsetu a zároveň
  dál než 0,15 mm od offsetu). Samotné „X < offsetXAt(z)" je u dílu se zápichem
  falešně pozitivní (dojezd po dně zápichu je legitimně pod maximem na témž Z) a
  uzavřená silueta offsetu se pro bodový test použít nedá — u kapes se sama
  protíná.
- Pojistka `tests/cam-gouge-invariants.test.js` — model-free nad `calcSim.simPath`:
  žádný řezný pohyb nesmí ležet pod dráhou středu špičky hotovní kontury
  (`finishOffsetPath`, jinak `offsetPath`). Čelní fixtures vyňaty (1-D test je u
  svislé čelní stěny slepý), zbytkový známý zajezd part-10 (2,17 mm, rampa
  zanoření do zápichu = jiná větev) je přišpendlený, ne skrytý. Test si normalizuje
  params/zLimits na defaulty — jinak by výsledek závisel na pořadí fixtures
  (singleton `S` merguje). Na starém kódu padá 8 z 10 podélných fixtures.
- Zbytkový materiál fixtures tím ROSTE (part-1 5868 → 8647 mm² s regiony) —
  odebíral se materiál HOTOVÉHO DÍLU. Snapshoty obou regresních sad regenerovány.

Hotovo (rozsah 📐 ořezává i PLÁNOVACÍ geometrii, 28. 7. 2026):
- Rozsah obrábění Z se dosud uplatňoval jen na řezné pohyby; hloubková
  posloupnost i vjezdy se počítaly z CELÉHO polotovaru → odlitkový hrb ZA
  hranicí rozsahu vyrobil průchody na průměrech, které v rozsahu vůbec nejsou
  (řez vzduchem: rozsah Z 108–195,6 s materiálem do X≈48 dal průchody na
  X≈65/59). Nově se ořezává i geometrie, ze které se plánuje. **Kolize se dál
  počítají proti NEOŘEZANÉMU polotovaru** (obálka držáku, `validateToolpath`,
  `MaterialRemoval`) — odtud dvojice smyček `stockLoopL` / `stockLoopFullL`
  a jejich offsetů `stockLoopOffsetL` / `stockLoopOffsetFullL`, se kterou
  pracují všechny pozdější kroky.
- **Dno rozsahu je tvrdé i pro DOJEZDY a rampy** (`traceFloorL` ve
  `findLeadOutEndZ` / `findPocketExitZ` / `findRampOutTarget`) — dřív si za dno
  braly siluetu polotovaru a rozsah přejely o desítky mm.
- **Samostatné zanoření za odlitkovým hrbem**: kotva rampy se posune na
  nejpravější místo, kde nástroj stojí na offsetové čáře polotovaru a vedle se
  v celém axiálním dosahu vejde držák (1 mm volno). Dřív taková hloubka celá
  vypadla a menší průměry zůstaly nehrubované (obejít šlo jen ručním posunutím
  Startu rozsahu Z). Zanoření se v pořadí odloží za větší průměry.
- Testy: `tests/cam-leadout-step.test.js` + fixture `range-end-leadout`,
  `tests/range-entry-ramp.test.js`.

Hotovo (víc operací nad zbytkovým `StockModel`em, 28. 7. 2026):
- **➕ Operace**: program se skládá z částí a další část startuje na polotovaru
  OBROBENÉM těmi předchozími (`js/calculators/cam/opParts.js`, `gcodeMerge.js`).
  První reálné využití booleovského zbytku jako **VSTUPU dalšího výpočtu**, ne
  jen vizualizace.
- Zbytek z `StockModel` se před předáním prokládá **oblouky**
  (`fitArcsToPolyline`), ne stovkami úseček z booleovského výstupu (34 → 15
  bodů, z toho 4 oblouky) — jinak by scan hrubování jelo přes tisíce segmentů.
  Oblouky se dělí na **max. 90°**: zápis „koncový bod + R" je u skoro-180°
  oblouku numericky prekérní (tětiva → 2R), zaokrouhlení na µm posune
  dopočítaný střed o řád víc. Každý oblouk se po zaokrouhlení ověří a při
  neshodě degraduje na úsečku.
- Test: `tests/cam-op-parts.test.js`.

Hotovo (hrubování zleva = ZRCADLO, 29. 7. 2026):
- „→ Zleva" přestalo být vlastní (v1) strategií — je to čistě zrcadlo v ose Z
  (`js/calculators/cam/zMirror.js` + `passHelpers.js`): svět se na vstupu
  překlopí, spočítá se obyčejné hrubování zprava a výsledek se překlopí zpět.
  Levá strana tím zdědila VŠECHNO z pravé — siluetu odlitku, mezní čáry, kapsy,
  rampy, obálku držáku i booleovskou větev (dřív počítala s válcovým
  polotovarem a hlídání destičky brala pro pravý nůž → 41 průchodů přes celý
  díl; nově 25 s regiony a rampami, hlášené problémy 13 → 2).
- PAST: zrcadlení musí řetěz bodů i **OBRACET** (typ pohybu a rádius patří
  k úseku DO bodu → posun o jedna), jinak offsety ÚSEČEK spadnou dovnitř dílu
  (venku zůstanou jen oblouky, které si stranu detekují z geometrie).
- Pravá strana zůstala bit za bit stejná — žádný snapshot se nezměnil. Testy:
  `tests/cam-backside-mirror.test.js` + fixtures `part-11-zleva-casting`,
  `part-12-zleva-step`.

Hotovo (konec průchodu na HRANĚ materiálu, 29.–30. 7. 2026):
- Řezný interval se plánuje z obdélníkového OBALU (rozhodnutí Fáze 3), takže
  mohl sahat desítky mm za skutečný polotovar — nástroj po posledním řezu ještě
  přejel prázdnem na konec okna, tam pustil posuv o Vůli Z a teprve pak odskočil.
  Koncový vzduch se nově zahazuje: průchod dojede na hranu odlitku a navazující
  dojezd ho posune na **vůlí-posunutou siluetu**. Totéž pro dojezd „bez schodků"
  (`trimLeadOutToStock`; úseky celé ve vzduchu se zahodí, hraniční se zkrátí
  interpolací). Odebraný materiál **± 0,0 mm² na všech 17 fixtures** — mizí jen
  jízda vzduchem.
- **Údolí si nese své ústí** (`computeResidualRegions` vrací i `zHi`/`zLo`) =
  podklad pro `guideStaysInStock` výš.
- **Řetěz ramp vyňat z heuristiky „pravých stěn kapes"**: kroky dorampování se
  braly jako samostatné bossy NAPŘÍČ celým dílem → průchodu spadl `zStart` pod
  `zEnd`, celý se smazal a osiřelý `pocketReposition` jel rychloposuvem skrz
  neobrobený materiál (part-11/12: 501 mm² → 0, pocket-wall-at-plunge-angle:
  163 → 0). Pojistka `tests/cam-ramp-chain.test.js` (žádný `pocketReposition`
  bez předchůdce).

Hotovo (zanořování pod DNO VYBRÁNÍ, 5. 8. 2026):
- Rozpouštění hranice úseku v „kůře dna" (`zHiSurf`/`zLoSurf`) platí jen **BEZ**
  `plungeRoughing`. Se zapnutým Zanořováním hranice DRŽÍ a vjezd na ni se řeší
  RAMPOU pod úhlem zanoření (přesně jako na hranici rozsahu 📐) — dřív hloubky
  pod povrchem dna přebíral úsek NAD hranicí, ten na ně ale dosáhne jen svým
  prvním intervalem, takže materiál za hranicí zůstal stát a jedinou cestou
  k němu bylo ruční nastavení Rozsahu Z. Bez rampy by vznikl kolmý zápich do
  kůry, proto to platí jen se zanořováním.
- Zanoření vzniká jen tam, kde se vedle vjezdu prokazatelně **vejde DRŽÁK**
  (`holderEntryCapZ`); jinak se hloubka v tom úseku vynechá jako dřív. Hranice
  leží uprostřed materiálu → bez místa pro držák by rampa vjela bokem do
  neobrobeného odlitku (87 mm² oranžová kolize uprostřed vybrání; s podmínkou
  5 → 0 hlášených kolizí).
- **Odložené zanoření se řadí na konec SVÉHO úseku** (`regionMark`), ne až za
  celý program — úsek je samostatná Z-zóna dílu. Podmínka „co je nahoře, má
  přednost" (`__deferEntry`) platí dál, měří se ale v Z-okně zanoření.
- Měřeno izolovaně: **méně stojícího materiálu, nikde ne víc** (part-11 −168 mm²,
  range-chain-insert-shadow −107, díl uživatele −106, part-12 −104, part-10 −60,
  holder-region −40, range-end-leadout −34).
- Pojistky: `tests/cam-region-plunge.test.js`, `tests/range-entry-ramp.test.js`.

Hotovo (dojezdy a doběh dorampování nejedou vzduchem, 5. 8. 2026):
- **`airSplitAxial` (`gcodeEmit.js`) je SDÍLENÝ helper** pro tělo průchodu, dno
  za rampou i AXIÁLNÍ úsečky dojezdu „bez schodků": rozseká pohyb na
  G0(vzduch)/G1(materiál) podle siluety odlitku a přechod řez→vzduch dojede až
  na vůlí-posunutou siluetu (jinak padá `tests/cam-leadout-step`). Dřív jel
  dojezd „bez schodků" posuvem desítky mm nad údolím naprázdno.
- **Mezikroky řetězu dorampování si doberou svůj schod** — jedou až na stěnu
  kontury a odtud po obrysu, ne na společný cíl `rc.targetZ` (dřív dojížděl jen
  POSLEDNÍ krok, mezikroky končily nasucho uprostřed materiálu). Pak ale
  POVINNĚ `trimLeadOutToStock` i v rampové větvi emise, jinak dojezd pokračuje
  po kontuře do vzduchu. Měřeno: part-8 −189 mm², part-4/6 −80, part-11/12
  a díl uživatele −67, part-1/2 −21; počty průchodů beze změny, čas +3 %.
- **Doběh končí na konci SOUVISLÉHO materiálu** (`stockRunEndZ`
  v `roughingStrategies.js`): za mezerou v odlitku je jiné místo dílu, vcelku se
  bere jen materiál V KUSE (stejné pravidlo jako u hranic úseků; dřív doběh
  přeletěl celé údolí a dodělával vrstvu na druhé straně). Měří se na **CELÉ**
  vůlí-posunuté siluetě (`stockLoopOffsetFullL`, bez ořezu rozsahem) — „materiál
  v kuse" je vlastnost DÍLU, ne zvoleného úseku. Hranice se hledá **PŮLENÍM**,
  ne po krocích vzorkování: konec musí sednout PŘESNĚ na offsetovou čáru, o krok
  vedle by ho emise nesměla dotáhnout (prodloužení výjezdu nesmí přejet konec
  průchodu) a řez by skončil o vůli dřív. Emise proto prodlužuje výjezd i na
  NULOVÝ navazující vzduch (`>=` místo `>`) a smrsklé úseky filtruje pryč.
- **Přesun v kapse se zvedá po ÚROVNÍCH PŘEDCHOZÍCH VRSTEV** (krok = ap), dokud
  přejezd nevede volně (strop = výjezd nad konturu) — odskok 2 mm nestačí, když
  je ap 5 mm, a přejezd v Z pak vedl stojícím odlitkem. Sjezd zpět končí
  pracovním posuvem (sdílený `emitDescendX`).
- Krok dorampování už nepokračuje rychloposuvem přes celý zbytek dílu (koncový
  vzduch se zahodí stejně jako u otevřeného průchodu); odjezd do bezpečné polohy
  jde nejdřív v X a teprve pak v Z, nikdy diagonálou.
- Pojistka `tests/cam-leadout-air-rapid.test.js` — měří posuv **UZAVŘENÝM**
  vzduchem (vzduch na konci pohybu je legitimní nájezd/dojezd).

Hotovo (hotovní offset jako sdílená reference, 5. 8. 2026):
- Výpočet offsetu kontury vytažen z `calculatePipeline.js` do
  `js/calculators/cam/toolOffset.js`, aby šel spočítat víckrát s různými
  přídavky. Nový `calc.finishRefPath` = čistě GEOMETRICKÁ reference „kam dojede
  střed plátku na hotovo": kreslí se i s vypnutým Dokončováním (skutečná dráha
  `finishOffsetPath` bez něj nevzniká), do G-kódu nevstupuje, dá se na ni
  snapovat. Bez zadaných přídavků se nekreslí (splynula by s hrubovacím).
- Doplňkově: obálka držáku si drží rezervu 0,1 mm od zakázané oblasti, ta ale
  platí jen pro **překážku za koncem** průchodu (držák), ne pro špičku na
  offsetu — dřív stála každá vrstva 0,1 mm před offsetovou čárou.

Hotovo (mezní čára končí na hraně materiálu, 7. 8. 2026):
- Volný konec mezní čáry (`walkStraight` v `interferenceGuides.js`) se při dopadu
  ZA konturou ořezával zpět na konec dílce (`minPartZG`). Jenže dopad za konturou
  z definice leží na POLOTOVARU — kontura tam není — takže ořez jen zahazoval
  informaci „kam až sahá materiál, kam nástroj nedosáhne". Na díle uživatele
  (hrubování zleva) tím stín kužele Ø199,7 skončil na čele dílce Z449,81, ačkoli
  polotovar sahá na Z482. Dopad na OSU (X≈0) se dál zahazuje beze změny.
- Dráhy ani G-kód se nemění (ověřeno na všech 17 fixtures — snapshoty se hnuly
  jen v souřadnicích čar). Pojistka `tests/cam-guide-to-stock-end.test.js`.

Hotovo (zanoření do kapsy zapnuto — Fáze 3b dodrátována, 7. 8. 2026):
*Řízeno REÁLNÝM dílem uživatele (`projekt_2026-08-07`, hrubování zleva):
příruba Ø170 u čela zahodila všechny hloubky pod sebou — 4 průchody místo desítek.*
- **Kořen**: kapsová/zanořovací větev `genLongPasses` byla od 23. 7. vypnutá
  nepodmíněným `return` (nahradil původní `if (!prms.plungeRoughing) return`).
  Průchody tak vznikaly JEN pro `idx===0 && firstOpen` = otevřený vjezd. Sken
  materiál v údolí našel (na X84,9 dva intervaly), jen se s ním nic nedělo.
- **`clamp.span` byl NAPSANÝ, ale NIKDO HO NEVOLAL** — kapsový ořez obálkou
  držáku z Fáze 3b při vypnutí větve osiřel. Bez něj zapnutí vyrobilo
  **11 kolizí držáku / 500–670 mm²** na `range-chain-*` a `range-end-leadout`,
  kde bylo čisto. Po napojení: 0. Tohle byl skutečný obsah rozhodnutí z 22. 7.
  („kapsy vypnout") — chybějící drát, ne chybějící algoritmus.
- Dvě pojistky navíc: rampa ≤ ap (kotva zvednutá na kůru je u kapsy za bossem
  2× ap nad dnem — naměřeno 9,8 mm při ap 5) a `chainTipIs` (přesun uvnitř
  kapsy jen když kotva je doloženě posledním vydaným průchodem — jinak se
  mezi kroky řetězu vklíní zanoření odjinud a rychloposuv vede materiálem).
- **Burst („dobrat kapsu najednou") hledal kapsu na nové hloubce až od
  intervalu č. 1.** Kapsa, která je intervalem PRVNÍM (`firstOpen === false` =
  hrubování zleva za přírubou), se tak nenašla, burst po prvním zanoření
  skončil a zbytek zůstal na jediném dokončovacím průchodu — ten kapsu projel
  diagonálou přes celé údolí (985 mm² kolize držáku + 570 mm² na navazujících
  úsecích). Index se teď odvíjí od `firstOpen` a `cGapHi` má stejný fallback
  na `entryZ` jako hlavní smyčka. Díl uživatele: **6 → 12 průchodů,
  1555 → 0 mm² kolizí**.
- `clamp.span` MUSÍ platit i uvnitř bursteu (vytaženo do `holderSpanClamp`):
  burst si intervaly na každé hloubce skenuje ZNOVU, takže by jinak sjel ap po
  ap do kapsy, kam se držák mezi stěny nevejde (chyceno `tests/cam-holder` —
  7 kolizí, 12–32 mm² každá).
- Fixture `part-13-zleva-flange.camprog` = díl uživatele, na kterém se to našlo;
  pojistka `tests/cam-pocket-burst-depth.test.js` (na starém kódu padá: 1 krok
  místo >4). POZOR při psaní takové pojistky: `pocketReposition` sdílejí TŘI
  mechanismy (řetěz vjezdu na hranici rozsahu, dobírání kapsy, dorampování
  strmé stěny) — výhradně kapsové jsou `pocketEntry` a `pocketClean`.
- Známý zbytek: `simPath[0]` je syntetický startovní bod (bez `originalLineIdx`),
  který u dílu s velkým polotovarem leží UVNITŘ materiálu → validátor hlásí
  „rapid" na prvním přejezdu do bezpečné polohy (na díle uživatele 53 mm²).
  Artefakt simulace, ne dráhy; existuje nezávisle na kapsách.
- Měřeno izolovaně proti worktree na `0e464ee`: **méně stojícího materiálu,
  nikde ne víc** (holder-casting-slanted-face −24,2 mm², holder-region −7,7).
- POZOR na měření baseline: `git checkout --` vrací na HEAD, který už může
  obsahovat rozpracovanou práci (commit mezitím). Baseline měř v odděleném
  `git worktree` na konkrétním commitu — jinak porovnáváš kód sám se sebou
  a vyjde ti falešná „dokonalá parita".

Hotovo (rychloposuv vzduchem se testuje proti ZBYTKU, 7. 8. 2026):
- `airSplitAxial` dělí řez na rapid/posuv podle PŮVODNÍ siluety odlitku a prahu
  „dosah nosu" (`x − tipR`). Silueta ale nezná materiál, který v tom místě
  nechal stát dřívější průchod, a práh nepočítá s tělem destičky za nosem.
  Takový `G0` se teď navíc testuje proti AKTUÁLNÍMU `rapidStock`
  (`rapidHitsStock`, týž práh 0,5 mm²) a při nárazu jede posuvem — zrcadlo
  `descendTo` / exit-splitu. Práh siluety se NEMĚNÍ (dosah nosu je vědomý,
  viz increment 1 z 22. 7.).
- Opravilo i nálezy starší než kapsy: part-1/2 0,8 → **0**, part-4/6/9
  5,7 → **4,4**, part-8 51,4 → **50,1**. Po sadě 17 dílů nezůstal jediný
  `rapid` nález mimo inherentní čelní hrubování. Řezná geometrie beze změny.
- Zbytková mez: `rapidHitsStock` měří ZEŠTÍHLENÝM footprintem (proti falešným
  poplachům), validátor plným obrysem destičky — rozdíl ~0,8 mm² se pod práh
  schová. Táž mez drží 2 nálezy držáku na part-4/6/8/9. Zúžit ji lze jen
  změnou `rapidFootSlim`, což falešné poplachy vrátí.

### ZBÝVÁ — hranice úseku leží ve STŘEDU údolí (nálezy 8. 8. 2026)

> **Priorita 1 pro další sezení.** Opakovaný nález uživatele („bere to od
> prostředka", „tohle mi udělalo už tolik problémů"). Příčina je izolovaná
> a reprodukovatelná, ale oprava JE VĚTŠÍ než jeden řádek — první pokus
> selhal, viz níž. Fixtures: `part-13-zleva-flange.camprog` (v repu) a díl
> uživatele `projekt_2026-08-08 (2).camprog` (údolí Z103–317, dno X44,5).

**Co je špatně.** Hranice úseku se počítá jako **průměr plochého dna údolí**,
tedy doslova jeho střed. Dřív to bylo na dvou duplicitních místech; po ÚKLIDU
bodu 2 (10. 8. 2026) je to **jedno místo** — `computeResidualRegions`
(`cam/booleanRoughing.js`): `const zc = cnt > 0 ? zSum / cnt : samples[i].z;`
(`manualRegionSplits` zrušen, obě cesty jedou přes něj).

Funkce si přitom ÚSTÍ údolí (`zHi`/`zLo`) už počítá — jen se pro hranici
nepoužívá. Důsledek: `passEntryZ` dostane okno začínající uprostřed volného
prostoru, takže se do údolí vjíždí od poloviny a levá část zůstane stát
(na dílu uživatele rampa začínala na Z210,4 = přesně (103,191+317,664)/2).

**Diagnostická cesta (ať se neopakuje).** Bylo to třikrát svedeno na špatnou
příčinu, než se to izolovalo. Co to NENÍ:
- **není to držák** — zkrácení `holderProfile` na z≤20 nezmění vůbec nic;
  `holderEntryCapZ` vrací `ret == zHi`, tj. přesně to, co dostane, a holder
  span je jen 22,6 mm;
- **není to mezní čára destičky** — guide u levé stěny je krátký
  (`zanoreni (71,72/103,56)→(74,68/92,53)`, `clipped`), údolí neblokuje;
- pozor na `respectInsertGeometry` jako testovací přepínač: vypíná ZÁROVEŇ
  obálku držáku (`holderLoopL`), takže „NOINS" test nic neizoluje.
Rozhodující test je `regionRoughing` ON/OFF: OFF → rampy od ústí
(z89, 108, 126, 145, 164, 182, 201, 220), ON → jediná od z210.

**První pokus a proč selhal.** Změna `z` na `samples[i].z` (ústí)
udělala na dílu uživatele přesně to, co se chce — jenže rozbila
pokrytí jinde: **part-11 +444 mm², part-12 +289 mm²** stojícího materiálu,
průchodů 31→24, a vizuálně to „bere napříč údolím, jako by tam všude byl
polotovar". Důvod: hranice není jen značka „tady je údolí", ale **tvrdý okraj
Z-okna úseku** (`regZHi`/`regZLo` → `effZMax`/`effZMin` v hloubkové smyčce).
Posunutá na ústí nechá jeden úsek zabrat celé údolí VČETNĚ vzduchu nad ním
a scan tam pak hledá materiál, kde není.

**Co je tedy potřeba udělat.** Rozdělit dvě role, které dnes nese jedno číslo:
1. **kde údolí JE** (signál pro `splitIsNeeded` / `guideStaysInStock` /
   `zHiSurf`/`zLoSurf`) — může zůstat střed dna,
2. **kde končí Z-okno úseku** — musí být ÚSTÍ, a okno se musí odvozovat tak,
   aby sousední úsek nezabral vzduch nad údolím (tj. okno ořezat siluetou,
   ne jen hranicí — nabízí se použít `passEntryZ` s `stockLoopOffsetL` už při
   sestavení regionu v `assembleRegions`, ne až v hloubkové smyčce).
Měřit IZOLOVANĚ per fixture, baseline v odděleném worktree (viz níž), a hlídat
part-11/12 — ty jsou na tuhle změnu nejcitlivější.

#### DRUHÝ POKUS (10. 8. 2026) — ZAMĚŘENO, ZAMÍTNUTO, VRÁCENO

Zkoušena přesně varianta „rozdělit dvě role", jen s rolemi vázanými na
HLOUBKU: hranice = **ÚSTÍ nad povrchem dna údolí** (tam je uvnitř údolí
vzduch, takže střed jen natahuje okno souseda přes prázdno) a **střed dna
v kůře a hlouběji** (tam je materiál souvislý a dělí se poctivě na půl).
Regiony k tomu dostaly `zHiMouth`/`zLoMouth` (region NAD údolím končí u ústí
na své straně, region POD ním u toho svého).

**Reprodukce symptomu sedí** (`projekt_2026-08-08 (2).camprog`, údolí
Z102,4–317,8, dno X44,5, ap 5): `regionRoughing` ON → 21 průchodů, kotvy ramp
**210,4 / 224,2 / 242,8**; OFF → 18 průchodů, kotvy **89,1 · 107,7 · 126,4 ·
145 · 163,7 · 182,4 · 201 · 219,7** (řetěz od ústí přes 8 hloubek).

Proč to selhalo — tři naměřené věci, každá sama o sobě stopka:

1. **Symptom je POD dnem údolí, kam ta změna nesahá.** Kotvy 210,4/224,2/242,8
   patří hloubkám X 41,9 / 36,9 / 35,8, tedy pod dnem X44,5. Nad dnem
   (X 81,9…46,9) je uvnitř údolí vzduch. Po opravě proto na dílu uživatele
   vyšlo **přesně to co dřív** (21 průchodů, 25 824 mm²) — čistý no-op.
2. **„Levá část zůstane stát" MĚŘENÍ NEPOTVRDILO.** Zbytek v pásmu údolí:
   ON 8 762,8 mm² (levá půlka 4 824,5 + pravá 3 938,4) vs OFF 8 804,4
   (4 822,5 + 3 981,9). Regiony tedy neberou MÉNĚ — levá půlka je na mm²
   stejná. Vadí VJEZD doprostřed materiálu, ne pokrytí. To mění zadání:
   hledá se lepší kotva rampy, ne jiné vlastnictví materiálu.
3. **Vjezd na ústí bez capu držáku = NOVÉ KOLIZE.** Hranice na ústí splyne
   s hranou materiálu, takže `regionCappedRaw` (`effZMax === regZHi`) začne
   platit vždycky a vynutí `holderEntryCapZ`; bez místa pro držák se hloubka
   zahodí → na dílu uživatele **21 → 11 průchodů, +1 210 mm²**. Vyjmout ústí
   z capu („za ním je přece vzduch") NELZE: držák je široký a dosáhne přes
   údolí na protilehlý hrb — **nové kolize držáku na 5 fixtures**
   (holder-region 2×1,6 mm², part-10 3×42,4, part-11/12 +1 nález,
   range-end-leadout 2×2,2) a k tomu holder-region 33→28 průchodů (+8 mm²),
   part-11 +28 mm².

**Co si z toho vzít pro TŘETÍ pokus.** Zadání je jiné, než doc tvrdil: není to
problém pokrytí, ale KOTVY ZANOŘENÍ. Bez `regionRoughing` vzniká řetěz ramp od
ústí (`pocketEntry` → `pocketReposition`, kotva každé vrstvy = konec té
předchozí); s regiony se tenhle řetěz nerozvine, protože hranice ROZŘÍZNE
kapsu údolí na dvě půlky a ani jedna sama neprojde. Cesta tedy vede přes to,
aby kapsa přes údolí zůstala JEDNA (vlastnictví celého údolí jedním úsekem),
ne přes posouvání okraje okna. A ať se řetěz rozvine jakkoli, cap držáku na
vjezdu MUSÍ zůstat.

Diagnostika je připravená: `globalThis.__REGION_LOG__` vedle `raw`/`splits`
loguje i `mouths` (zHi/zLo každého údolí) a celá sestavená okna `regions`.

### VYŘÍZENO — zanořování: duplicita, pořadí, úhel rampy (10. 8. 2026)

Série z bug-reportu nad `projekt_2026-08-10*.camprog` (= fixture
`part-11-zleva-casting`). Měřeno proti baseline ve worktree.

- **Týž klín dvakrát**: ořízlá rampa dojezdu (`pendingRampCompletions`) a kapsa
  za bossem (`buildPocketPass`) sjíždějí po TÉŽE přímce zanoření. Fix
  `plungeLineRuns` (přímka = `c = z − x/tg(úhel)`, evidují se X-ÚSEKY).
  DVĚ pasti odhalené měřením: (1) „nejhlubší dosah" nestačí — po jedné přímce
  leží i dva nesouvislé útvary (`holder-casting-slanted-face`: kapsa X 39–45 vs.
  dobírák X 52,3–53,0); (2) registrovat se musí od `pocketPass.ramp.x0`, ne od
  `corner.x` (kotva kapsy je nejvýš o ap nad dnem). Tolerance shody přímek 0,1.
- **Pořadí**: dobírák se rozhoduje po hloubkové smyčce, ale VYDÁVÁ se hned za
  poslední stejně hluboký/mělčí průchod. Nevkládat před průchod s
  `pocketReposition`/`noRetract`/`cleanApproach`.
- **Poslední vrstva u nedosažitelné hranice**: bisekce (`lastDepthWithPasses`),
  jen při `!entryCapped` (na umělé hranici by to byl svislý zápich).
- **Úhel rampy**: práh zajetí pod offset = POLOVINA přídavku (ne 0,05 mm) →
  u stěny těsně pod úhlem zanoření jede rampa opravdu 15°. Popisek v
  `gcodeEmit.js` tiskne skutečný sklon.
- **`approachTraverseFree`**: přisunutí v kapse (odskok → přejezd v Z → sjezd)
  se použije jen tam, kde offset nikde nevystoupí nad úroveň přejezdu. Bez toho
  vedl rychloposuv hotovní konturou (kontura Ø27 na Z 55–68 vs. přejezd Ø26,5) —
  regrese, kterou vyrobil právě fix úhlu rampy.
- **Hlášení zahozených Z-zón** (`holderDroppedZones` × skutečné pokrytí včetně
  leadIn/leadOut).
- Testy `cam-leadout-air-rapid` „mezikrok/přesun v kapse" PŘEPOJENY z part-11
  na **part-4** (jejich vozidlo v part-11 byla právě ta duplicita).

### ZBÝVÁ — pravá strana za přírubou (Z 271→366) se NEHRUBUJE

Uživatel trvá na tom, že tam zanoření JDE, a geometricky má pravdu: za přírubou
Ø129 stojí polotovar jen na Ø43,6 a držák (20 mm axiálně, spodní hrana stoupá
6,55 mm na 18 mm) se tam vejde. Chybí ale VJEZD: interval je „otevřený
pokračující řez" (`!iv.blocked`) a jeho začátek u Z 265 obálka držáku nepustí
(klín pod mezní čarou „zanoření" sahá do Ø84), takže se celý úsek zahodí.

**TŘI ZAMÍTNUTÉ POKUSY (10. 8. 2026), každý změřen validátorem kolizí:**
1. Vlastní posun vjezdu (`holderEntryCapZ` + `stockEntryRamp`) — držák naboural
   do příruby: kontrolovala se jen ŠPIČKA, ne kotva rampy, která leží ZPÁTKY nad
   vjezdem (Z 258–278). Kolize na `holder-region-roughing` 0 → 42,8 mm².
2. Totéž + prověření celé rampy bodovou sondou obálky — na fixtures čisté, ale
   na dílu uživatele pořád oranžová kolize u S25 (kandidát prošel obálkou, přesto
   validátor hlásí náraz → sonda a validátor si nejsou rovnocenné).
3. Propadnutí do kapsové větve (přání uživatele „nedělej novou logiku, je to
   tam") — kolize 94,5 → **136,6 mm²** a konec polotovaru se rozsypal na desítky
   mikro-průchodů (Ø4,1–4,6 u S27): kapsová větev předpokládá kapsu mezi DVĚMA
   stěnami, otevřený konec neumí.

**OBCHÁZKA, KTERÁ FUNGUJE (uživatel, 11. 8. 2026) — a ukazuje správnou cestu:**
Stačí nastavit **Start rozsahu Z** za klín (např. Z 300 nebo 310) a úsek se
obrobí normálně, se zanořením rampou pod 15° a **0 kolizí** (změřeno
`validateToolpath` se správným `backside`: 3 průchody, maxZ 368,1). Odpovídá to
tomu, jak uživatel dílem prochází — po úsecích.

Z toho plyne, že ZBYTEČNÉ je přestavovat hranici v obrobitelné kontuře
(varianta A níž). Vjezd na hranici rozsahu totiž jde přes UŽ HOTOVÝ a otestovaný
řetěz: `entryCapped` → `entryRampAnchor` → `holderEntryCapZ` („automatický start
zanoření za odlitkovým hrbem"). **Automatické řešení = označit svislou hranici
klínu za UMĚLOU HRANICI (přesně jako hranici rozsahu 📐 nebo hranici úseku), aby
se pro ni ten řetěz spustil sám** — ne psát pro tenhle případ vlastní vjezd.
Pět pokusů psát ho vedle toho řetězu skončilo kolizemi (viz výš); řetěz sám to
zvládá, jen se pro tuhle hranici dosud nespouštěl (interval je `!iv.blocked`
a `entryCapped` se pro něj nenastaví).

**Varianta A (přestavba hranice) — ODLOŽENO jako zbytečně velké:** vjezd i CELÁ jeho rampa se musí
prověřit TÍM SAMÝM Minkowského modelem, který pak počítá `validateToolpath`
(dnes se rozhoduje podle zjednodušené `holderFitsAt` proti STATICKÉ siluetě, a ta
navíc nevidí, co už odebraly mělčí vrstvy), a kapsová větev musí umět
jednostranně otevřený interval (bez `findPocketExitZ` na neexistující protistěně).
Souvisí to s odloženým dynamickým plánovačem pořadí. Dokud to není, ⚠ panel to
aspoň NAHLÁSÍ (viz výš) a úsek patří obrábění z druhé strany.

Vedlejší nález z pokusu 3, který platí i pro budoucí řešení: dojezdy v tom úseku
končily na SYROVÉM polotovaru, ne na offsetové čáře.

### VYŘÍZENO / UZAVŘENO — drobnější, ze stejné série

- ~~**Dokončení kapsy (`pocketClean`) běží i s vypnutým Dokončováním.**~~
  **VYŘÍZENO 10. 8. 2026 — byl to POPISEK, ne chování.** Průchod visí na
  „Hrub. bez schodků" (`noStepRoughing`), NE na `doFinishing`, a to správně:
  jeho vypnutí nechá stát **64 mm²**, protože dobírá hřebínky ~0,5 mm po
  rampách krokovaných po ap — je to hrubovací dobrání schodku. Matoucí bylo
  jen jméno v G-kódu („dokončení kapsy"), přejmenováno na
  **„(kapsa bez schodků)"**, ať je z výstupu poznat, ke kterému přepínači
  patří.
- ~~**Pravá strana `part-13-zleva-flange` (Z>305) se nehrubuje.**~~
  **OVĚŘENO A VYŘÍZENO 10. 8. 2026.** Fyzika sedí: držák 20 mm radiálně by
  musel přes přírubu Ø199,7, tedy nástroj na X ≥ 99,85 (`__DISABLE_HOLDER_CLAMP__`
  → 29 podélných průchodů místo 12). Chybělo jen HLÁŠENÍ — viz „Uděláno na
  závěr" v hlavičce: obálka držáku už zóny nezahazuje tiše.
- **Zbytkových 0,6–3 mm² `rapid`** na nájezdu dokončení kapsy — **NEDĚLÁ SE**
  (viz tabulka v hlavičce). POZOR, dřívější
  vysvětlení („rozdíl mezi zeštíhleným footprintem a plným obrysem ve
  validátoru") bylo MYLNÉ — ověřeno 10. 8. při ÚKLIDU bodu 3: obě strany
  používají shodnou dvojici plný/zúžený obrys. Skutečný rozdíl je v tom, jak
  každá strana ví, co už je odebráno: emise z PLÁNOVANÉ geometrie průchodů
  (`noteCutPass`), validátor z reálně projeté `simPath`.

Zbývá (genuinní mezera — order-dependent odlitek):
- **Skutečné přeplánování pořadí** (obrobit kůru nad zápichem DŘÍV, aby výjezd
  vedl vzduchem, ne posuvem skrz materiál): exit-split výše je jen bezpečný, ne
  optimální. Patří k odloženému dynamickému plánování pořadí (klasifikace bodů
  přejezdu proti AKTUÁLNÍMU `StockModel`, retract po vstupní trase). Couvnutí po
  trase u kolmého zápichu nepomůže (reverz = tentýž blokovaný svislý zdvih).
- **Latentní past ve `offsetLoopOf`** (`roughingStrategies.js`): bere
  z `polyOffset` jen komponentu `[0]`, takže u složitého obrysu odlitku může
  minout tu správnou. Dnes to nikde neškodí (konec doběhu dosedá půlením
  a emise ho smí dotáhnout na nulový vzduch), ale každý další spotřebitel
  vůlí-posunuté siluety na to musí myslet — dřív kvůli tomu doběh skončil
  o vůli dřív a padal `tests/cam-leadout-step` na `range-chain-insert-shadow`.

Implementace (odloženo): každý bod přejezdu klasifikovat proti **aktuálnímu**
`StockModel` (`pointInLoop` / průnik úseku se zbytkem) — „vzduch“ je vše mimo
zbytkový materiál, včetně už obrobených kapes. Z-limity / X-limity
(`S.zLimits`, `S.xLimits`) vstupují jako ořezový obdélník (`rectClip`)
povolené oblasti přejezdů i záběrů.

**ZMĚŘENO + diagnostický seam (21. 7. 2026):** svislý zdvih „Výjezd nad konturu"
(`safeRapidTo` v gcodeEmit.js) se sám netestuje proti `rapidStock`. Guarded seam
`globalThis.__RAPID_LIFT_LOG__` (v produkci no-op, vzor `__REGION_LOG__`) měří
plochu, kterou každý zdvih projede zbytkem. Metoda: nastav globál na `[]` a spusť
pipeline v IZOLOVANÉM procesu **per fixture** (singleton `S` jinak kontaminuje —
párové měření v jednom procesu je bezcenné). Baseliny [mm²]: part-10-zapich
**15,9** (JEDEN zdvih X17,6→45,4 @Z15,98 = order-dependent cíl budoucího
plánovače), face-casting **267** (37 facing-přejezdů — INHERENTNÍ, tool-width
grazuje sousední neobrobené Z, reorder neopraví), face-cylinder 23, part-4/6/8/9
~5, holder-slanted 5,7; part-1/2 a holder-region **0** (bez konfliktu). Kontrolní
fix (retract po vstupní trase / dělení rapid↔posuv i pro VÝJEZD) = tentýž odložený
order-planner výše; couvnutí po trase navíc nepomůže u kolmého zápichu (reverz =
tentýž blokovaný svislý zdvih). In-suite absolutní-práh test NELZE spolehlivě
(singleton `S`: reset params ho izoluje, ale prosákne do `boolean-roughing-wiring`,
který na deterministické kontaminaci stojí; ta je mimochodem sama flaky nezávisle
na této práci — kandidát na samostatnou opravu).

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
