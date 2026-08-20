# Sjednocení polotovaru na offsetovou čáru

> Rozpracovaný plán. Navazuje na `docs/geometry-libs-migration.md`
> (ÚKLID bod 1, 10. 8. 2026). Stav k 20. 8. 2026.

## Zadání

Uživatel, opakovaně 20. 8. 2026:

> *„Obrobek je celý i s tou offsetovou čarou, neboli polotovar nekončí na čáře
> polotovaru, ale na offsetové čáře — je to přídavek, kdyby byl materiál větší.
> Mělo by to tak být i dělané, že ten polotovar končí až na té offsetové čáře.“*
> A: *„Nebudeme vůbec brát tu červenou čáru od polotovaru, ta přestane pro dráhy
> existovat.“*

Přídavek X/Z (polo.) je v zadání právě proto, že odlitek **může** být větší.
Materiál až k offsetové čáře tedy reálně existovat může → plánuje se
pesimisticky a **náraz do té zóny je náraz**.

---

## Definice HOTOVO (měřitelná)

`validateToolpath` umí dnes odpovědět v obou standardech (`opts.planStock`).
Rozdíl mezi nimi **JE seznam práce** — a je konečný:

| standard | nálezů | celkem |
|---|---|---|
| syrový obrys (`planStock: false`, dnešní default) | **0** | 0 mm² |
| offsetová čára (`planStock: true`) | **46** | 185,2 mm² |

Rozpad těch 46: **33× `rapid`**, **13× `holder`**. Naměřeno 20. 8. 2026 na všech
24 fixtures (`tests/fixtures/cam/*.camprog`), `maxIssues: 400`, **jedna fixture =
jeden proces** (ve sdíleném procesu vyjde 44 — singleton `S` kontaminuje).

Fixtures už čisté i v offsetovém standardu: `part-10`, `part-11`, `part-12`,
`part-13`, `part-14`, `pocket-wall`, `range-chain-steep-face`.
Nejhorší: `face-cylinder` (3 / 44,0 mm²), `face-casting` (2 / 33,4 mm²),
`part-16-face-holder` (2 / 23,5 mm²), `range-end-leadout` (4 / 19,4 mm²).

**HOTOVO = těch 46 je 0 a `tests/cam-collision-free` běží s `planStock: true`.**
Tohle číslo je průběžný ukazatel — po každém kroku se přeměří.

> Pozor: „46 → 0“ je metrika KOLIZÍ. Sama o sobě nestačí — viz
> `feedback_measure-removal-not-just-collisions`. Ke každému kroku se měří
> i **odebraná plocha** (mm²), ne jen počet nálezů a `passCount`.

---

## Co UŽ na offsetové čáře je

| co | kde |
|---|---|
| plánování drah | `planLoopRef()` — `cam/gcodeEmit.js:561` |
| vjezd průchodu (horní hrana okna) | `passEntryZ` / `stockCrossingsAt` — `cam/roughingStrategies.js:1809` |
| zastavení rychloposuvu před čarou | param `rapidFeedGap` (`rapidStopXAt`, `rapidStartXAt`) |
| čelní přejezd v Z | `rapidStockPlan` + `rapidHitsPlan` — `cam/gcodeEmit.js:437` |
| hlídání držáku nad SYROVÝM pásem | `stairAt` = `povrch + clrXFC` (`holderGuardFace`) |
| ⛔ panel v aplikaci | `camSimulator.js:1064` posílá `planStock: true` |
| náhled: pás + červený `gougeBand` | `MaterialRemoval(…, {planningOutline})`, `HolderGouge(…, {band})` |
| **dojezd podélného průchodu ven z polotovaru** | `offsetExitZ` — `cam/gcodeEmit.js:581` (viz krok 1) |
| **vrchol hloubkové posloupnosti (skim vrstva)** | `planTopX` — `cam/roughingStrategies.js:1195` (krok 2) |

## Co na ní NENÍ

1. **Čelní generátor čte syrovou siluetu** (`castingOuterAtZ`).
2. **Dynamický zbytek `rapidStock` je syrový** → musel vedle vzniknout druhý,
   plánovací (`rapidStockPlan`). To je ta dvojkolejnost, co má zmizet.
3. **Validátor má dva standardy** — default je syrový.
4. **Náhled kreslí na dvakrát** (světlý pás + jádro), ne jeden odstín.

---

## Proč NE velký třesk (a co s větví `wip/sjednoceni-polotovaru`)

Na větvi leží hotová změna: `buildStockLoop()` vrací offsetovou smyčku,
`buildStockLoopRaw()` zůstává pro nakreslený obrys. Jedna hranice, všech
6 konzumentů naráz.

**Nepoužívat.** Dva doložené důvody:

- **Rozbije 59 testů v 16 souborech** a NENÍ oddělené, co je jen zápis staré
  hranice (`boolean-roughing`, `boolean-layer-components`,
  `boolean-region-roughing` — „mezikruží 500 mm²“ už není 500) a co je
  skutečná regrese (`cam-collision-free`, `cam-finish-holder`,
  `cam-leadout-air-rapid`, `cam-backside-mirror`, `cam-face-insert-reach`).
- **Stojí na starším základu.** Větev nezná dnešní `opts.band` v `HolderGouge`
  ani `opts.planningOutline` v `MaterialRemoval` — merge by sebral práci na
  náhledu z 19. 8. Viz `feedback_dont-rebase-fixes-onto-older-base`.

**Co z ní ale vzít** (samostatně, jako vlastní commity):

- `bd6d85c` — **hardening `airSplitAxial`**: „vzduch“ se rozhodoval jen podle
  toho, že NOS je nad hranicí; netestoval, jestli nad nástrojem nestojí
  materiál. Nově se každý úsek označený jako vzduch ověří dynamickým zbytkem
  a při nárazu se jede posuvem (`part-11` 13 → 11 nálezů). Patří do kroku 4.
- `eb5340e` odhalil skutečnou chybu: `offsetLoopOf` byla identita, ale
  `buildStockLoop` vracel syrový obrys → podélné plánování o offset **přišlo**.
  Na `main` už neplatí, ale je to past, do které se dá spadnout znovu.

---

## Vedoucí myšlenka: hranice je dvouvrstvá — plánovač × emise

Sjednocení NENÍ „přepiš všude `buildStockLoop` na offset". Hranice žije ve
DVOU vrstvách a každá má svou roli:

- **Plánovač** (`roughingStrategies.js`) pracuje se SYROVOU geometrií, protože
  z ní odvozuje TOPOLOGII: kde je stěna kontury, kde končí díl, co je kapsa
  a co otevřený doběh. Ta klasifikace (`blocked`) je nosná — kapsy se zanořují
  rampou a obálka držáku je záměrně neořezává.
- **Emise** (`gcodeEmit.js`) hranici PŘEKLÁDÁ na offsetovou čáru až u konkrétního
  pohybu: `offsetExitZ` (dojezd ven), `trimLeadOutToStock` (dojezd po kontuře),
  `airSplitAxial` (co je vzduch), `findRampOutTarget` (cíl rampy),
  `rapidStopXAt` / `rapidStartXAt` (kde končí rychloposuv).

**Pravidlo, které z toho plyne:** posunout hranici v plánovači znamená
dvojí aplikaci (emise ji posune ještě jednou) NEBO změnu topologie. Krok 1 na
tom padl — obojí najednou. Zbylé kroky proto míří tam, kde plánovač hranici
používá k něčemu, co emise dorovnat NEUMÍ:

- ~~**hloubková posloupnost** (`maxStockX`) — sílu první třísky emise
  neopraví~~ → krok 2, HOTOVO,
- **čelní `castingOuterAtZ`** — povrch, od kterého se odvíjí celý doběh,
- **`rapidStock`** — dynamický model, ze kterého emise sama rozhoduje.

---

## Kroky

Pořadí není libovolné: **nejdřív se hne řezná hranice (3), pak se ladí
přejezdy (4–5)**. Obráceně by se přejezdy ladily dvakrát.

**Před KAŽDÝM krokem** ověř probem nad `calcSim.simPath`, že symptom je vidět
ve vygenerovaném G-kódu. Krok 1 se takhle celý rozpadl — viz níž.

### ~~Krok 1 — spodní hrana podélného okna~~ ⛔ ODPADÁ (ověřeno 20. 8. 2026)

**Premisa byla chybná. Nic tu k opravě není — emise to už dělá.**

Tvrzení „podélné průchody končí na syrovém konci polotovaru" vzniklo měřením
`pass.zEnd`, tedy PLÁNOVAČE. Jenže dojezd na offsetovou čáru dělá až EMISE:
`offsetExitZ` (`gcodeEmit.js:581`) u každého NEBLOKOVANÉHO průchodu bez dojezdu
po kontuře prodlouží tělo na `min(bodyEndZ − VůleZ, offsetová hrana)`
(`gcodeEmit.js:1337`). `pass.zEnd` proto zůstává na syrové geometrii
**záměrně** — je to vstup, ne výsledek.

**Důkaz** (probe nad `calcSim.simPath`, tedy nad naparsovaným SKUTEČNÝM
G-kódem, všech 24 fixtures): **žádný** axiální řezný pohyb nekončí na syrové
hraně polotovaru v situaci, kdy je offsetová čára dál. Nula nálezů.
Na `part-1` emise vydá `G1 Z-10.000` → `G1 Z-11.000` při syrovém konci −10
a offsetové čáře −11 — přesně na ní.

**Co udělá změna v plánovači** (zkoušeno, změřeno, zahozeno):
- **Dvojí aplikace.** `pass.zEnd = −11` → emise prodlouží na −12, tedy 1 mm
  ZA offsetovou čáru. Posuv vzduchem navíc, žádný zisk.
- **Prosté posunutí `effZMin` níž rozbije topologii intervalů.** Sken o kus dál
  narazí na ČELO dílu a poslední interval se z „doběhl na konec polotovaru"
  (`blocked: false`) překlopí na KAPSU (`blocked: true`). Kapsy se zanořují
  rampou a obálka držáku je záměrně neořezává (`roughingStrategies.js:2929`
  přijímá jen `blocked`) → na `part-13-zleva-flange` z toho vznikla zanořovací
  kaskáda až na Ø9,8 u čela příruby: **0 → 21 kolizí, 11 100 mm²**, z toho
  5 640 mm² jediným průchodem. Hranice `blocked` je nosná.

**Poučení do dalších kroků:** *měřit vygenerovaný G-kód (`calcSim.simPath`),
ne mezivýsledky plánovače.* Emise má vlastní vrstvu pravidel proti offsetové
čáře (`offsetExitZ`, `trimLeadOutToStock`, `airSplitAxial`, `findRampOutTarget`)
a plánovač jí do toho nesmí mluvit dvakrát. Než se sáhne na kterýkoli další
bod, ověř TÍMTO způsobem, že symptom vůbec existuje.

### Krok 2 — vrchol hloubkové posloupnosti ✅ HOTOVO (20. 8. 2026)

**Co bylo špatně:** `maxStockX` (`roughingStrategies.js:1174`) se bral ze
syrových `stockWorldPoints` (u válce `sRad`) a posloupnost startovala na
`maxStockX − step`. Materiál ale může sahat až na `maxStockX + VůleX`, takže
**první průchod ukousl `ap + Vůle` místo `ap`**. Jediné místo, kde sjednocení
mění SÍLU třísky, ne jen dráhu — a emise to dorovnat neumí.

**Ověření symptomu** (probe nad `calcSim.simPath` proti plánovací smyčce,
`topXOnLoop` — sdílený helper): na **17 fixtures** vyšla tříska prvního
průchodu přesně o Vůli X větší než `ap`, tedy 20–50 % přetížení podle `ap`:

| fixture | ap | tříska syrová | tříska plánovací |
|---|---|---|---|
| `part-11`…`part-15`, `range-chain-*` | 5 | 5,000 | **6,000** |
| `part-1`, `part-2`, `part-17` | 3 | 3,000 | **4,000** |
| `part-4`, `part-6`, `part-8`, `part-9` | 2,5 | 2,500 | **3,500** |
| `holder-*`, `part-10`, `pocket-wall` | 2 | 2,000 | **3,000** |

`range-end-leadout` vyšel „ok" správně — vrch polotovaru je tam níž než `ap`.

**Řešení: SKIM VRSTVA NAD MŘÍŽKU, mřížka se NEPOSOUVÁ.**
```js
const planTopX = maxStockX + clrXPlanL;   // exaktní: Minkowski v X
for (let d = planTopX - step; d > maxStockX - step + 0.005 && d > minPartX + 0.005; d -= step) depths.push(d);
for (let d = maxStockX - step; d > minPartX + 0.005; d -= step) depths.push(d);   // beze změny
```
`planTopX` jde i do obálky zbytku v `getResidualLoops` (booleovská větev by
jinak skim vrstvu zahodila jako „nad polotovarem"). Přičtení Vůle X je tu
EXAKTNÍ, ne antivzor: offset je Minkowského součet s elipsou o poloose `clrX`
v X, takže GLOBÁLNÍ maximum v X roste přesně o `clrX` bez ohledu na tvar.

**ZAMÍTNUTO — posunout celou posloupnost** (`maxStockX += clrX`). Vypadá to
čistěji, ale je to čistá ztráta: každá hloubka padne jinam vůči schodům
a údolím. Změřeno:
- `part-8`: 24 → **19 průchodů**, zbytek +337,6 mm² (o tolik MÍŇ se odebralo),
- `part-17`: `colRaw` **0 → 2** (tvrdá kolize proti nakreslenému odlitku),
- `part-11`/`12`/`14`: `colPlan` 0 → 2,
- celkem 46 → **47** nálezů, 185,2 → 194,1 mm².

**Výsledek skim varianty (změřeno izolovaně, všech 24 fixtures):**
- tříska prvního průchodu **nikde nepřesahuje `ap`**,
- kolize `colRaw` i `colPlan` **beze změny na každé fixture** (46 / 185,2 mm²),
- odebraná plocha (syrová i plánovací) **beze změny na každé fixture** —
  ten pás bral už dřív první průchod, jen jedním hlubším záběrem,
- cena: **+1 průchod (≈ +7 řádků)** na odlitkovou fixture,
- snapshoty: mění se JEN `passCount` (+1), jeden `"long"` v `passTags`
  a přečíslování N. `machinableContour`, `interferenceGuides` i `warnings`
  jsou bitově shodné ve scan-line i booleovské větvi.
- sada **1327/1327**.

### Krok 3 — čelní generátor na offsetovou čáru ★ DALŠÍ

**Co:** `castingOuterOrNull` / `castingOuterAtZ`
(`roughingStrategies.js:77` a `:127`) čtou syrové `stockPathSegments`.
Krmí `xSurface` (ř. 296 — kde začíná řez), celou logiku doběhu (ř. 553–888)
a `rapidStartXAt`. Rychloposuv už si plánovací smyčku bere sám
(`planLoopFC`, ř. 154) — je to tedy poslední syrový čtenář v čelní strategii.

**Jak:** `planLoopFC` už v souboru je → `castingOuterAtZ` postavit nad ním
(`topXOnLoop`) a `castingOuterOrNull` nechat syrový jen tam, kde jde o otázku
„MINE svislice obrys?“ (rozlišení „materiál neznámé výšky“ × „žádný materiál“
v zóně doběhu).

**Riziko:** střední. Povrch se zvedne o vůli → čelní vrstvy začínají řezat
dřív (posuvem vzduchem). Doběh je citlivý — viz
`project_cam-face-tilted-insert-rules` a `project_cam-face-tip-radius`.
**Rozbije:** `cam-face-*` (5 souborů), `cam-face-insert-reach`.
**Cena:** změřit čas i odebranou plochu. Čelní fixtures dnes drží
33,4 / 23,5 / 17,9 mm² v offsetovém standardu — velká část ze 46 je tady.

### Krok 4 — jeden dynamický model zbytku

**Co:** `gcodeEmit.js:429–477` drží `rapidStock` (syrový) i `rapidStockPlan`
(offsetový) a k nim dvojici `rapidHitsStock` / `rapidHitsPlan`, které se
v podmínkách střídají (ř. 880, 921). Tohle je jádro dvojkolejnosti.

**Jak:** `rapidStock` postavit rovnou nad `planLoopRef()`, `rapidStockPlan`
a `rapidHitsPlan` smazat, volání sloučit. Ve stejném commitu přidat
hardening `airSplitAxial` z `bd6d85c` (bez něj vzniknou nové kolize typu
`G0 X39.545 Z195.278` = 3,6 mm² na `part-11`).

**Riziko:** vysoké na DÉLKU programu — 33 ze 46 nálezů je `rapid`, ty se
změní na posuv nebo objezd. `feedThroughStock` / EXIT-SPLIT / `descendTo`
se všechny řídí `rapidHitsStock`.
**Rozbije:** `cam-traversal-invariants`, `cam-leadout-air-rapid`,
`cam-backside-mirror` (parita zrcadlení — každé číslo z offsetové smyčky
MUSÍ projít `quantizeUp` na 0,01 mm), snapshoty.
**Zisk:** největší jednotlivý — po tomhle by mělo ze 46 zbýt ≈ 13.

### Krok 5 — držák jednotně proti offsetové čáře

**Co:** zbylých 13 nálezů typu `holder`. `HolderGouge.baseLoop`
(`holderGouge.js:40`) i obálka v `toolEnvelope.js:135` staví na syrovém obrysu.
**Známý zbytek:** přejezd nad levým čelem příruby, Z 195,28–195,88,
X 25–46 = 12,36 mm² (`project_cam-rapid-stop-before-offset-line`).

**Riziko:** NEJVYŠŠÍ v celém plánu. Odstranit ten přejezd znamená zvednout ho
nad čelo příruby (X 46+), tedy vysoko a často.
**Nejdřív vysvětlit neshodu:** ad-hoc probe s plným 200mm držákem a
`HolderGouge` se o té oblasti neshodují (oranžová hlásí 0,00 mm²). Než se
sáhne na dráhy, musí být jasné, který z těch dvou lže.
**Souvisí:** `project_cam-holder-order-collisions` — detekce je hotová,
zbývá jen PREVENCE, a ta má vysoké riziko false positives.

### Krok 6 — překlopit default validátoru

**Co:** `collisionValidator.js:154` — `planStock` přestane být opt-in,
syrový standard se buď smaže, nebo zůstane jako `opts.rawStock` pro `opParts`.
`tests/cam-collision-free` se přepne na offsetový standard.

**Kdy:** až kroky 2–5 srazí 46 na 0. Tenhle krok NIC neopravuje, jen zamkne
dosažený stav. Dělat ho dřív = stěna červených testů bez informační hodnoty.

### Krok 7 — náhled jedním odstínem

**Co:** `camSimulator.js` drží `_removal` (syrový) a `_removalOuter`
(offsetový) a kreslí pás světlejším tónem, oříznutý přes `bandClip`.
Cíl: jeden odstín.

**PAST (doložená):** `_removal.baseLoop` je zároveň parita pro mazání
VYBARVENÍ — s pásem jako základem by mazání žralo výplně nad polotovarem.
Dvojice modelů tedy zůstane, mění se jen kreslení.
**Riziko:** kosmetika, žádné dráhy. Dá se pustit kdykoli, nezávisle.

### Krok 8 — úklid API

Teprve teď má smysl `buildStockLoop` → `buildStockLoopRaw` + `stockPlanLoop()`
a zrušit ad-hoc přestavby offsetové smyčky (dnes na 5 místech: `gcodeEmit`,
`roughingStrategies` 2×, `holderGouge`, `camSimulator`). Čistý refaktor
v okamžiku, kdy si každý konzument už vědomě vybírá.

---

## Co ZŮSTÁVÁ syrové (natrvalo)

Sjednocení **neznamená** „všude offset“. Tyhle odpovídají na jinou otázku:

| co | proč |
|---|---|
| `opParts` / `machinedStockModel` (`opParts.js:116`) | co fyzicky zbylo pro další operaci |
| `MaterialRemoval.baseLoop` bez `planningOutline` | parita pro mazání vybarvení v náhledu |
| `castingOuterOrNull` v zóně doběhu | „svislice MINE obrys“ ≠ „materiál je nula“ |
| `buildStockLoopRaw` | kreslení nakresleného obrysu |

Nulový Přídavek X i Z = obě čáry splývají (`stockClearanceIsZero`) → celý
plán je v tom případě no-op.

---

## Pravidla měření (nepřeskakovat)

- **Měřit VYGENEROVANÝ G-KÓD (`calcSim.simPath`), ne mezivýsledky plánovače.**
  `calc.passes[].zEnd` je VSTUP do emise, ne výsledek — emise hranici ještě
  překládá na offsetovou čáru. Krok 1 vznikl z měření `pass.zEnd` a celý
  padl; probe nad `simPath` ho vyvrátil za jeden běh.
- **Měřit IZOLOVANĚ, jedna fixture = jeden proces.** `sweep.mjs` má kontaminaci
  singletonu `S` (`part-1` tam vyšlo 318 vs 233 izolovaně). Slouží jen k detekci
  „která fixture se hnula“.
- **Baseline ve worktree**, ne `git checkout --` — uživatel commituje průběžně
  (`feedback_measure-baseline-in-worktree`).
- **Kvantizace:** každé číslo, které z offsetové smyčky jde do emise, musí projít
  `quantizeUp` na 0,01 mm, jinak padne `cam-backside-mirror` (Clipper dá témuž
  místu zleva a zprava o ~1 µm jinou hodnotu).
- **Bezpečnostní minimum po každém kroku:** `tests/collision-validator`,
  `tests/material-removal`, `tests/cam-traversal-invariants`,
  `tests/cam-collision-free`. Celá sada až na závěr kroku.
- **Testy procházet JEDEN PO DRUHÉM s měřením**, ne hromadné `vitest -u`.
  Sada je deterministická; padající test nejdřív ověřit přes worktree —
  může měřit zastaralý MODEL, ne regresi (`feedback_head-may-be-red`).
- **Žádný debug kód v pracovní kopii** — repo se commituje samo
  (`feedback_no-debug-code-in-worktree`).
