# CAM — předávka 9. 9. 2026 (kulatá destička)

Pro pokračování v novém sezení. Díl uživatele: `projekt_2026-09-08 (4).camprog`
(kulatá destička **R 5**, ap 2,5, úhel zanoření 45°, podélně zprava, odlitek).
Fixture v repu: `tests/fixtures/cam/part-22-round-r10.camprog` (táž geometrie,
R 10).

## Jak se tu měří (bez toho nedělej nic)

```bash
node scripts/cam_fingerprint.mjs --save=pred.json   # PŘED zásahem
node scripts/cam_fingerprint.mjs --diff=pred.json   # PO zásahu
node scripts/cam_sweep.mjs                          # úběr × kolize, 29 dílů
node scripts/cam_sweep.mjs --set=booleanRoughing=true --holder=own
#   ↑ NEZAPOMÍNAT: otisk ani běžný sweep NEPOKRÝVAJÍ vynucenou booleovskou
#     větev, a díly uživatele po ní jedou.
```

Otisk shodný → bezpečnostní testy nemají čím spadnout, nepouštět je.
Otisk se hnul → `collision-validator`, `material-removal`,
`cam-traversal-invariants`.

**Měřítka, která na tomhle dílu rozhodují** (skripty jsou jednorázové, napiš si
je znovu — měří se nad `calcSim.simPath` z `tests/helpers/camHeadless.mjs`):

| co | jak |
|---|---|
| tříska nad `ap` | po každém řezném pohybu rozdíl stropu `MaterialRemoval` |
| řezy strmější než úhel zanoření | `atan2(-dx, abs(dz))` proti `getEffectivePlungeAngle` |
| duplicitní dráhy | shodné dvojice bodů; + pohyby, po kterých se nezmenší plocha zbytku |
| zajetí do hotové kontury | `ContourGouge` |
| kolize | `validateToolpath` v OBOU standardech (syrový × `planStock`) |

> **`roughLong` běží na jedno `calculate()` DVAKRÁT** a pokaždé s jiným dělením
> na úseky (na tomhle dílu 7 × 3 regiony). Emituje se ten DRUHÝ. Kdo čte
> hlášení nebo `passes` z prvního běhu, diagnostikuje jiný program, než jaký
> se vydá — na tomhle dílu to stálo celou předchozí diagnózu (viz níž).

## Stav (po opravě 9. 9. 2026)

Na dílu uživatele: 80 průchodů, úběr 5 002,3 mm², zajetí do hotové kontury
**0**, tvrdé kolize **4** (pre-existující, viz bod 3), **největší tříska
2,52 mm — nic nad `ap`**, řezy strmější než 45° **32** (z toho hlubší než
1 mm jen **8**; svislé 90° řezy **11**, ale šest z nich pod 0,02 mm).

### Hotovo v této sérii

| commit | co | měření |
|---|---|---|
| `e4f4b6b` | konec dílu = jeden úsek | úseky 4 → 3 |
| `b7e53b0` | nájezd se ořezává i ČÁSTEČNĚ | duplicity 65 → 48, posuv naprázdno 730 → 548 mm |
| `61f5566` | sjezd na hloubku šikmo pod úhlem zanoření | strmé řezy 57 → 39 |
| `297278f` | mezní čára zanoření se kreslí plně | zobrazení |
| `8de7665` | **zpět** zvednutí kotvy rampy — porušovalo ap | překročení ap 5 → 1 |
| (9. 9.) | **vrstva, které dojezd posunul začátek, se už nezahazuje** | tříska 5,00 → 2,52 mm; nad ap 2 → 0 |
| (9. 9.) | **sjezd na hloubku jde pod úhlem zanoření i ze `safeRapidTo`** | strmé řezy 39 → 32, hlubší než 1 mm 15 → 8, svislé 18 → 11 |
| `cf1a221` | **pole „Úhel zanoření (°)“ mění i mezní čáru** | polygon 10°: strmé řezy 19 → 8, duplicity 1 → 0 |
| (10. 9.) | **tvar plátku vytažen z generátoru do `cam/inserts/*.js`** (9 rozhodnutí) | otisk SHODNÝ + G-kód 3 uživatelových souborů bajt po bajtu stejný |

## Vyřešeno 9. 9. 2026 — tříska 2× ap

**Příčina** (plný řetěz, doložený): dojezd MĚLČÍHO průchodu („bez schodků“)
sleduje konturu za konec svého intervalu a kus toho NÁSLEDUJÍCÍHO na téže
hloubce obrobí; `ops/long/openPass.js` proto tomu intervalu posune začátek
dolů (`q.zStart = coverLo`). Nový `zStart` **už neleží na kontuře** — tady byla
o 4,3 mm níž. `traceOffsetPath(zGapHi, iv.zStart)` tedy vedl POD hloubku
vrstvy, `clipLeadInToDepth` z něj nenechal nic a „prázdný nájezd není nájezd“
vrstvu zahodilo celou. Konkrétně na dílu uživatele: `r 32,045` interval
`52,435 → 19,826` (sken ho vrací SPRÁVNĚ) přepsán na `45,497 → 19,826`,
načež nájezd `70,197 → 45,497` skončil na `x 27,761`, tedy 4,3 mm pod
vrstvou → 0 segmentů → vrstva pryč → **`r 29,545` ukrojila 5,00 mm = 2× ap**.

**Oprava:** u TAKTO POSUNUTÉHO intervalu (značka `leadOutCoveredTo`) se trasa
nájezdu zkrátí na poslední Z, kde je kontura ještě na hloubce vrstvy
(`contourTouchZ`, bisekce nad `offsetXAt` v `ops/long/pocketPass.js`).
Podrobně `docs/cam-pravidla-drah.md` §3.1, „VÝJIMKA: ZAČÁTEK, KTERÝ POSUNUL
DOJEZD“.

**Dvě podmínky, bez kterých to nefunguje** (obojí změřeno):

1. **Jen interval se značkou `leadOutCoveredTo`.** Bez toho `part-20` −395,7 mm²
   úběru a `part-18-parting-90-ramp` přepsané dráhy.
2. **Nikdy u UPICHOVÁKU.** `contourTouchZ` hledá bod, kde je na hloubce ŠPIČKA;
   upichovák řeže celou spodní hranou šířky `b`, takže tělo tam ještě leží ve
   stěně. Na `part-20` zajel obrys plátku **0,153 mm² do HOTOVÉHO dílu**
   (X 40,545 Z 133,426, práh 0,05, `tests/cam-parting-body-gouge`). Kolize to
   nebyla, otisk to ukázal jen jako „jiné dráhy" — chytila to až PLNÁ SADA.

S obojím je **otisk všech 29 fixtures SHODNÝ**.

**Cena:** duplicitní dvojice 42 → 53 (+56 mm jízdy v už vyříznutém prostoru) —
nová trasa vede po témže kusu kontury jako ten dojezd a `makeChainRegistry` ji
zahodit nesmí (u nájezdu bez rampy je zahození CELÉ trasy zakázané, spadl by
na kolmý zápich).

**Co bylo v předávce z 8. 9. NAPSÁNO ŠPATNĚ** (ať se to nehledá znovu):

* *„není to `noEntrySkips`“* — **JE.** Předchozí sezení počítalo hlášení
  z PRVNÍHO běhu `roughLong`, kde se ten průchod ještě vytvoří.
* *„v G-kódu ten průchod začíná až na Z 19,826“* — nezačíná, v G-kódu
  **není vůbec**.
* Podezřelí `mergeLayersOverHump` a post-processing v `roughLong.js`
  (ř. 1420–1510) jsou **nevinní**.

## Vyřešeno 9. 9. 2026 — sjezd na hloubku pod 45°

Nález uživatele: *„zanořování ani jednou neudělalo to, co by mělo, a není
dodrženo, že se má zanořovat pod úhlem 45 stupňů"*.

**Příčina:** pravidlo `rampedApproach` v `emitFeedToDepth` existovalo, ale
**`safeRapidTo` si sjezd emitovala SAMA** (`G1 X…`) a to pravidlo míjela —
a tudy chodí většina vjezdů do kapsy. Pět svislých zápichů, dva po
**6,000 mm** = `Vůle X + R`.

Strmé řezy **39 → 32**, hlubší než 1 mm **15 → 8**, svislé **18 → 11** (šest
z nich pod 0,02 mm = doklepnutí konce nájezdu). Úběr, tříska, zajetí do
kontury i kolize beze změny; na sadě 0 změn v úběru i kolizích, otisk se hne
jen u `part-22-round-r10` (+1 řádek).

**Zbylých pět svislých sjezdů — doložené meze:**

| kde | hloubka | proč |
|---|---|---|
| Z 201,348 · Z 198,848 | 2,000 mm | šikmá varianta vjede DRŽÁKEM do materiálu (týž kořen jako bod 3) |
| Z −5,49 / −5,50 (3×) | 3,495 mm | průchod je na konci dílu dlouhý 2,51 mm, rampa u R 5 potřebuje 3,495 mm |

**Zamítnuto cestou (změřeno):**

| pokus | co udělal |
|---|---|
| couvnout na DRUHOU stranu (za konec dílu) a šikmo zpátky | nástroj přejede týž kousek TŘIKRÁT, rampy stojí přímo pod sebou — stížnost uživatele |
| rampovat DOPŘEDU, do řezu | klín za rampou vezme příští vrstva třískou **3,91 mm** (ap 2,5) + kolize rychloposuvu 2,3 mm² |
| totéž jen pro ŘEZNOU část sjezdu | tříska **3,16 mm**, kolize 1,1 mm² |

> **POLYGON NENÍ VZOR.** Uživatel navrhl inspirovat se polygonem (*„tam je to
> dobré to zanořování"*). Změřeno: týž díl s polygonem R 0,8 má **12 svislých
> sjezdů**, většinu přesně **1,800 mm** = `Vůle X + R`. Je to týž kód a týž
> radiální sjezd, jen osmkrát kratší, takže není vidět. Kulatá je teď na tom
> LÍP než polygon (5 skutečných svislých sjezdů proti 12). Kdyby se
> `rampedApproach` zapnul i polygonu, hne se CELÁ sada — samostatné rozhodnutí.

## Vyřešeno 10. 9. 2026 — pole „Úhel zanoření (°)" mění i mezní čáru

Nález uživatele: *„ať to mění i tu čáru a ne ať je tam pořád těch 15 stupňů"*.
Mez se u polygonu brala výhradně z geometrie plátku, takže dráhy rampovaly pod
zadaným úhlem, ale čára zůstala na |natočení|. Bere se teď **přísnější z obou**
(`tightenByPlungeAngle` v `contourBuild.js`).

| polygon, díl uživatele, úhel 10° | před | po |
|---|---|---|
| řezy strmější než zadaných 10° | **19** | **8** |
| doslovné duplicity | 1 | **0** |
| řezné pohyby bez úbytku | 106 (279 mm) | 96 (243 mm) |
| kolize / zajetí do kontury | 0 / 0 | **0 / 0** |

**Otisk celé sady SHODNÝ.** Detail a past („která hranice je zanoření")
v `docs/cam-pravidla-drah.md` §3.2d.

## Poslední tříska u polygonu je DOLOŽENÝ KOMPROMIS, ne vada

Na dílu uživatele zbývá u polygonu jediná tříska nad `ap`: **3,053 mm**
(Z 276,29, r 21,803 → 18,750, dráha X 19,545). Je stejná i na `HEAD`.

Mechanismus: odlitek má v Z 271,5…366,4 vrch **r 21,803**. Mřížka hloubek je
kotvená na GLOBÁLNÍM vrchu (`ladderTopX`) a krokuje po `ap`, takže tam padne
na 22,045 a 19,545. Vrstva 22,045 se ale nevydá — `stockZRangeAt` se ptá na
`Xpath − noseLiftX`, a `noseLiftX` je u polygonu **0**, takže vidí
21,803 < 22,045 = „tady polotovar není". Špička (X − 0,8 = 21,245) by přitom
0,558 mm ukrojila. Zbytek pak vezme 19,545: 21,803 − 18,745 = **3,058 mm**.

`noseLiftX = 0` u nekulatých plátků je VĚDOMÉ rozhodnutí („aby se jejich
mřížka nepohnula", `docs/cam-pravidla-drah.md` §4.1) a posunutí celé mřížky
už jednou změřeno a zahozeno (`part-8` −5 průchodů a −337 mm², `part-17`
2 tvrdé kolize). Přesnost stojí 0,56 mm třísky navíc; **neopravovat bez
nového nápadu** — správná cesta je LOKÁLNÍ skim u schodu odlitku, ne posun
mřížky. U kulaté je týž mechanismus mnohem horší (`noseLiftX` = R), a jsou
z něj ty dvě třísky 4,02 a 4,71 mm v krku.

## Podmínka „dráha se nemá jet víckrát" — PROMĚŘENO 10. 9. 2026

| díl uživatele | doslovné duplicity | řezné pohyby bez úbytku |
|---|---|---|
| **polygon 10°** | **0** | 96 (243 mm = 9,9 %) |
| **kulatá R 5, 45°** | **64 (83,7 mm)** | 277 (505 mm = 15,0 %) |
| kulatá na `HEAD` (pro srovnání) | 52 (59,1 mm) | 246 (444 mm = 13,6 %) |

**U polygonu podmínka porušená NENÍ.** Zbylých 9,9 % jsou odskoky na konci
průchodu (2 mm pod 45°) a konce dojezdů dojíždějící o vůli za materiál —
nejdelší souvislý úsek je 5,5 mm. Záměrné, ne opakovaná dráha.

**U kulaté PORUŠENÁ JE.** 52 duplicit je pre-existujících, 12 přidala oprava
třísky 2× ap (vědomá cena, viz výš). Nejdelší jízdy naprázdno posuvem jsou
ale jinde a jsou velké:

```
28,5 mm  (57,05; 218,85) -> (54,05; 197,28)
25,3 mm  (54,05; 215,85) -> (51,55; 197,28)
22,8 mm  (51,55; 213,35) -> (49,05; 197,28)
15,8 mm  (35,95;  10,29) -> (35,97;  −5,50)   ← a týž úsek JEŠTĚ JEDNOU
```

Prvních tři jsou kroky ŘETĚZU DOBÍRÁNÍ u levého čela — každý dojede celou
délku až na Z 197,28 posuvem přes prostor, který už předchozí krok vyřízl.
Je to týž řetěz, který dělá i ty čtyři tvrdé kolize držáku (bod 2), takže se
to má řešit spolu s ním.

Skript na to je jednorázový (`dup.mjs`): projít `calcSim.simPath`, počítat
(a) shodné dvojice bodů, (b) řezné pohyby, po kterých neklesne plocha
`MaterialRemoval`, a slévat je do souvislých úseků.

## Hotovo 10. 9. 2026 — tvar plátku vytažen z generátoru

Devět rozhodnutí o tvaru destičky žilo mimo `cam/inserts/` jako
`prms.toolShape === '…'` a sahalo do drah. Teď jsou to klíče v pravidlech
plátku; sdílený kód se ptá `getInsert(prms)`. Přehled, kdo co čte a **co se
ještě může plést**, je v `docs/cam-tvar-platku-v-generatoru.md`.

Refaktor je čistý: otisk 29 fixtures **SHODNÝ** a G-kód tří uživatelových
`.camprog` (polygon 5°/10°, kulatá 45°) bajt po bajtu stejný proti `HEAD`
ve worktree.

## NOVÝ NÁLEZ 10. 9. 2026 — malý úhel zanoření rozhodí konec dílu

Polygon, `ap 2,5`, R 0,8, uživatelovy soubory:

| úhel | úběr | největší tříska | třísek nad ap | duplicity | kolize |
|---|---|---|---|---|---|
| 15° | 4 627,6 mm² | 3,053 mm | 2 | 0 | 0 / 0 |
| 10° | 4 507,8 mm² | 3,053 mm | 1 | 0 | 0 / 0 |
| **5°** | 4 358,5 mm² | **10,023 mm** | **7** | 0 | 0 / 0 |

**Příčina:** rampa dodělání (`rampCompletion`, `ops/roughLong.js`) se
kontroluje proti HOTOVNÍ KONTUŘE (`rampClearOfContour`), ale proti
ZBÝVAJÍCÍMU MATERIÁLU vůbec — a její strop „nejvýš jedna Hloubka (ap)“
platí jen v ose X. Při 5° je `ap / tg(5°)` = 28,6 mm v ose Z, takže rozjezd
přeletí celý sousední hrb, kterého se žádná mělčí vrstva nedotkla:
`N2560 G1 X25.257 Z20.914 ; Rampa 5.0°` vede 49 mm v Z a v Z 20,9 zabírá
10,02 mm (r 34,48 → 24,46). Při 15° tatáž rampa měří 16 mm a zůstane ve
vykopaném prostoru — proto si toho nikdo nevšiml.

**Pozor na past:** strop `ap` na rampu proti zbytku (přerušit řetěz tam, kde
se nevejde) vypadá jako přímé vynucení podmínky, ale řetěz dodělání je
právě to, co `ap` jinde HLÍDÁ — po přerušení vezme klín až hlubší vrstva
jedním záběrem. Změřeno a zamítnuto, viz tabulka zamítnutých pokusů níž.

## Hotovo 10. 9. 2026 — polygon se zanořuje pod úhlem, ne kolmo

`rampedApproach` (sjezd na hloubku šikmo) měla zapnutou jen kulatá. U polygonu
se poslední kousek — dlouhý `Vůle X + R` — sjížděl radiálně pod 90°, i když
měl uživatel nastavených 10°. Zapnuto i pro polygon:

| | R 0,8 | R 1,3 |
|---|---|---|
| řezy strmější než 10° | 8 → **4** | 9 → **5** |
| z toho svislých (90°) | 7 → **3** | 9 → **5** |
| tříska / nad ap / duplicity / kolize | beze změny | beze změny |

Sada: `cam_sweep` kolize **7 / 121,3 mm² beze změny** (nakreslený nůž),
**0 / 0,0** (náhradní držák), úběr +0,7 mm² z 87 424. Otisk se hnul u 19 z 29
fixtures (všechny polygonální), safety testy 81/81.

## NOVÝ NÁLEZ 10. 9. 2026 — rádius plátku prosakuje do struktury drah

Týž díl, jen R 0,8 → R 1,3: třísek nad ap **1 → 4**, největší tříska
3,053 → 3,553 mm, duplicitní dráhy **0 → 1**. Vzniká navíc „Průchod 37 (kapsa
po kontuře)“, jehož nájezd znovu projede dojezd Průchodu 32
(`X40.043 Z138.972 → X41.818 Z129.028`), ujede 40 mm posuvem naprázdno a pak
spadne **6,822 mm radiálně** (`N2050 G1 X32.045`), z toho 3,18 mm do
materiálu. Rozbor a proč to `makeChainRegistry` nechytí:
`docs/cam-tvar-platku-v-generatoru.md`.

## Co zbývá — v pořadí, jak to dává smysl

### 1. Kulatá se NEDOSTANE do hlubokého krku, polygon ano

**Největší otevřená vada.** Nález uživatele 9. 9. 2026 (*„špatně skoro všude,
kam se podívám"*), soubor `projekt_2026-09-09 (3).camprog`, táž geometrie
s polygonem = `projekt_2026-09-09 (2).camprog`.

Díl má v Z 138…205 krk: kontura **r 6,744 / 8,743**, odlitek **r 16,743**.

| | polygon R 0,8 / 15° | kulatá R 5 / 45° |
|---|---|---|
| nejhlubší průchod v tom regionu | **r 17,045** a **r 14,545** | **r 47,045** |
| odebráno v pásu Z 160…180 | 9 % | **0 %** |
| odebráno v pásu Z 140…160 | 45 % | 34 % |

Globálně přitom kulatá odebere VÍC (5 002 proti 4 628 mm²) a má menší třísku
(2,52 proti 3,05 mm, polygon má 2 třísky nad `ap`) — vada je MÍSTNÍ, ne
celková.

**DOHLEDÁNO 9. 9. 2026 až na místo, kde to padá.** Sken intervaly VRACÍ
správně až dolů (`x=17,045 → interval 199,4 → 172,5`); zahazuje je až
`ops/long/pocketPass.js` na řádku, kde `holderClampZEnd(...)` vrátí `null`
(*„Celý interval zakázaný"*) → `holderBlockedDepths.add()` +
`holderDroppedZones.push()` + `return`. Ověřeno sondou
`globalThis.__HOLDER_CLAMP_DEBUG__`:

```
[clamp] X=44.55 [213.20..172.53] → NULL (start ve F)
[clamp] X=42.05 [212.26..172.53] → NULL (start ve F)
[clamp] X=39.55 [211.33..172.53] → NULL (start ve F)
[clamp] X=37.05 [210.39..172.53] → NULL (start ve F)
[clamp] X=34.55 [199.52..172.53] → NULL (start ve F)
```

Takže to NENÍ mezní čára zanoření ani sken — je to **obálka DRŽÁKU**.
Zbývá zjistit, proč je pro R 5 přísnější než pro R 0,8, když by měla být
volnější: programovaný bod leží u R 5 o 5 mm dál od povrchu, takže i držák
je dál. Podezřelý je `openR` v `makeHolderClamp` (`toolRadius + přídavek
+ 0,1`, tedy 5,6 proti 1,4) a umístění `holderWorldLoop` vůči špičce.

**A JE TO TICHÉ.** `holderDroppedZones` se u tohohle dílu v ⚠ panelu vůbec
neobjeví (hlášení má jen „Bez schodků" a „Kontrola plánu"), přitom zmizí
celá spodní část krku. Tiché zahazování průchodů je v tomhle generátoru
opakovaná past — hlásit se to MUSÍ, ať už se příčina spraví, nebo ne.

Pro srovnání mezní čáry zanoření (nejsou příčinou, ale liší se):

```
polygon   zanoreni (43.16,195.31) → (50.08,221.13)     ← 15°
kulatá    zanoreni (24.52,195.57) → (50.08,221.13)     ← 45°
```

Uživatelovo zadání zní: **„má se zanořovat víc vlevo, jak u polygonálního
plátku, má jet rovně a zanořovat se až když je to potřeba — na tom spodním
průměru"**, a *„už se zanořuje i do toho levého čela"* (čelo Z 205,009,
r 30,156 → 6,744). Úbytek úběru je při tom výslovně povolený:
*„bude odebráno míň z toho materiálu, jenom uprostřed to sebere víc"*.

### 2. R 10: čtyři třísky nad `ap`, největší **19,86 mm** (7,9× ap)

**Je to na FIXTUŘE v repu**, takže na rozdíl od všeho ostatního se to dá
hlídat testem: `part-22-round-r10.camprog` (ap 2,5, nos R 10, jinak táž
geometrie jako díl uživatele). Změřeno 9. 9. 2026, **pre-existující** —
dnešní oprava se ho nedotkla (otisk bajt po bajtu shodný):

| # | tříska | kde | dráha X |
|---|---|---|---|
| 75 | **19,858 mm** | Z 196,5, r 52,040 → 32,182 | 42,045 |
| 253 | 9,003 mm | Z 175,3, r 16,744 → 7,740 | 17,743 |
| 588 | 6,869 mm | Z 21,6, r 33,909 → 27,040 | 37,045 |
| 478 | 4,084 mm | Z 55,5, r 31,540 → 27,456 | 37,456 |

Souvisí to s odloženým nálezem v `docs/cam-pravidla-drah.md` §4.1
(„ZBÝVÁ (změřeno a odloženo 8. 9. 2026)“): `noseLiftX` chybí
v `offsetStockTopXAtZ`, ze které se staví KOTVA RAMPY, takže kotva sedí na
povrchu, břit je hned na dně a řetěz nemá kam sestupovat. Oprava tam byla
změřená (průchody 61 → 71, největší tříska 9,00 → 7,60 mm), ale přinesla
tvrdou kolizi 4,25 mm² — a ta je blokovaná vadou G-kódu (`G3` vydaný ze
startu, který na oblouku neleží). **Pořadí prací: nejdřív ten start
oblouku, pak kotva, pak přeměřit tuhle tabulku.**

Na díle uživatele (R 5) je po dnešní opravě největší tříska 2,52 mm, tedy
nic nad `ap`. **Proč se R 10 chová tak jinak, ZMĚŘENO NENÍ** — nabízí se, že
`noseLiftX` je u R 10 dvojnásobný, ale je to hypotéza; první krok příštího
sezení má být měření, ne oprava.

### 3. Čtyři tvrdé kolize držáku na dílu uživatele (PRE-EXISTUJÍCÍ)

`holder @r42,05 Z203,8 = 1,04` · `@r39,55 Z201,3 = 0,65` ·
`@r41,55 Z201,3 = 0,65` · `@r39,55 Z201,3 = 1,28 mm²`.
Ověřeno, že tam jsou i před celou touhle sérií.

**Zaměřeno 9. 9. 2026:** všechny čtyři leží v ŘETĚZU DOBÍRÁNÍ RAMPY
(`pocketReposition`, „Průchody 24–27“, řádky `N1400`–`N1450`), a to na jeho
KOTVÁCH: `G1 X39.545 Z201.348 ; Rampa 45.0°`, `G1 Z195.278`, `G1 X39.545`,
`G1 X37.045 Z198.848 ; Rampa 45.0°`. Řetěz se do pořadí VKLÁDÁ až po
naplánování (`passes.splice` v `roughLong.js`), takže hlídání držáku
(`holderFitAreaAlong`, `plungeHolderFitsAt`) běželo proti jinému modelu
zbytku, než jaký při provedení opravdu stojí — táž povaha jako nález
„Přeskupení passes zneplatní kotvy ramp“. **Pozor:** paralelní kontrolu
v `generateAutoGCode` NEPŘIDÁVAT (dřív změřeno jako vysoké riziko);
opravovat se má POŘADÍ/kotva, ne hlídání kolem ní.

### 4. Dojezd (`contourLeadOut`) se pořád jede víckrát — 53 duplicit

Ořez sufixu je záměrně jen u `pocketClean`: dojezd nejen řeže, ale i VYVÁŽÍ
nástroj ven, a jeho zkrácení posune 45° odskok tam, kde držák nemá místo
(změřeno dřív: `part-18-parting-90-ramp`, 1,0 mm² kolize). Zkracovat se smí
jen s ověřením, že odskok zůstane volný.

**Nový, konkrétnější podnět (9. 9. 2026):** 11 z těch duplicit přidala dnešní
oprava a jsou to duplicity, o kterých se DÁ uvažovat: nájezd nové vrstvy jede
po témže kusu kontury jako dojezd té předchozí, a nástroj tam na konci toho
dojezdu UŽ STÁL (`N3910 G1 X32.045 Z47.747`, `N3920 G1 Z45.251`). Kdyby se
místo nového nájezdu navázalo (`noRetract` + pokračování), zmizelo by ~18 mm
duplicitní dráhy. Vyžaduje to ale sáhnout do POŘADÍ, ne do trasy.

### 5. Přejezd vzduchem posuvem

`rapidStopZ = Vůle Z + R`, takže se před každým řezem dojíždí `1 + R` posuvem
(u R 5 šest mm, u R 10 jedenáct). Polygon R 0,8: 26,5 mm za program, kulatá
R 10: 457,7 mm. **Past:** část toho je skutečný záběr (nos se do stěny zavaluje
postupně), ne vzduch — měřítko „dno nosu vs. obrys na Z středu“ to
nadhodnocuje. Bezpečná cesta je rozsekat i dojezd přes `airSplitAxial`, ne
zkrátit `rapidStopZ`.

## Zamítnuté pokusy (neopakovat bez nového nápadu)

| pokus | proč padl |
|---|---|
| zvednout kotvu rampy o rádius nosu | +230 mm² úběru, ale 4 řezy nad ap (`8de7665`) |
| vypnout předpověď pásu v `noteCutPass` | kolize beze změny a navíc tříska 47,6 mm — předpověď je nosná |
| `noteCutArc` vzorkovat od skutečné polohy | kolizi neřeší (start na oblouku neleží) a snížila zdvih na `part-20` do nebezpečné strany |
| odmítnout nesouvislý dojezd celý | ubralo úběr na 4 dílech, aniž to řešilo cíl |
| propagovat vynechanou vrstvu do hlubších | údolí zůstalo neobrobené + nová tvrdá kolize |
| zkracovat nájezd na hloubku VŽDYCKY (bez `leadOutCoveredTo`) | `part-20-zleva-parting-taper` −395,7 mm² úběru, `part-18-parting-90-ramp` přepsané dráhy (9. 9. 2026) |
| couvnout před sjezdem na DRUHOU stranu (za konec dílu) | nástroj přejede týž kousek třikrát, rampy stojí přímo pod sebou (9. 9. 2026) |
| rampovat sjezd DOPŘEDU, do řezu | klín za rampou vezme příští vrstva třískou 3,91 mm při ap 2,5 + kolize rychloposuvu 2,3 mm² |
| totéž jen pro řeznou část sjezdu | tříska 3,16 mm, kolize 1,1 mm² — klín se jen zmenšil |
| strop `ap` na rampu dodělání proti zbytku (`rampEngageOk`, přerušit řetěz) | třísek nad ap: 10° 1 → 5, 15° 2 → 6, kulatá 0 → 5 (7,60 mm) — řetěz je právě to, co `ap` hlídá (10. 9. 2026) |
| `noseLiftX: R` u polygonu (jako u kulaté) | posune celou hloubkovou mřížku: třísek nad ap 10° 1 → 2, 15° 2 → 3, 5° 7 → 10 (10. 9. 2026) |
| zrušit zúžení `getToolClearanceRange` úhlem zanoření | 5° se nespraví (třísky 7 → 6, největší pořád 10,02 mm) a 10°/15° se nezmění — vada není tady |

## Dlouhodobě červené testy (předchází této práci — nezametat)

Ověřeno 9. 9. 2026 ve WORKTREE na čistém `HEAD` (`git worktree add … HEAD`),
tedy skutečně pre-existující, ne následek téhle práce:

| soubor | co padá | poznámka |
|---|---|---|
| `cam-boolean-gcode-regression` | **všech 10** fixtures | snapshot naposled aktualizován v `709e87b`, od té doby **10 commitů** v `js/calculators/cam/` — ten test dnes nehlídá NIC. Před refreshem (`-u`) je potřeba ověřit, že současný výstup je správný, jinak se jen posvětí drift. |
| `cam-gcode-regression` | `part-15-finish-zprava`, `part-17-long-parting`, `part-22-round-r10`, `range-chain-insert-shadow` | předávka z 8. 9. `part-22-round-r10` neuváděla |
| `cam-ramp-chain` | `holder-casting-slanted-face`, `part-22-round-r10` | |
| `cam-collision-free` | `part-22-round-r10` v offsetovém standardu (3 nálezy rychloposuvu, 3,6 mm²) | |
| `cam-leadout-step` | „dojezd nesjede pod hloubku vlastní vrstvy" | v předávce z 8. 9. chyběl |
| `cam-pocket-burst-depth` | `part-11-zleva: skok mezi kapsovými kroky > ap` | v předávce z 8. 9. chyběl |

Celkem **19** červených testů na čistém `HEAD` (sada 1 575 testů).

**Po zapnutí `rampedApproach` u polygonu (10. 9. 2026) je jich 17.**
Snapshot `cam-gcode-regression` se musel obnovit (změna je záměrná, hnula 19
z 29 fixtures) a spolu s tím se posvětil starší drift `part-15-finish-zprava`
a `range-chain-insert-shadow` — obojího se změna opravdu týkala.
`part-17-long-parting` a `part-22-round-r10` byly ze snapshotu VRÁCENY na
`HEAD`, protože se jich změna netýká (otisk je nehlásil) a jejich drift má
zůstat vidět.

`tests/cam-leadout-air-rapid` (přesun v kapse) bylo potřeba upravit: filtr
chytal i nové COUVNUTÍ PŘED ZANOŘENÍM (taky `G0 Z` s konstantním X) a čekal
sjezd ve tvaru `G0 X` → `G1 X`. Teď rozlišuje obojí podle toho, co následuje,
a připouští mezi rychloposuv a poslední řezný kousek couvnutí. Měřený
invariant se nezměnil.

Zbytek sady je zelený.
