# CAM — pravidla generování drah

Sesbíráno z kódu, CHANGELOGu a uzavřených plánů (28. 8. 2026). **Nejsou to nová
pravidla** — je to soupis toho, co generátor dnes dělá a proč, na jednom místě.

**K čemu to je.** Otisk (`scripts/cam_fingerprint.mjs`) řekne, že se něco hnulo.
Neřekne, jestli správně. Tenhle dokument je ten druhý díl: seznam podmínek,
proti kterému se dá změna odškrtat.

**Autorita je kód, ne tenhle text.** Každé pravidlo má odkaz na místo, kde
opravdu žije; když se rozejdou, platí kód a tenhle soubor je potřeba opravit.
Pravidla v kódu jsou hustá schválně — `ops/` má 45 % řádků komentář a je v nich
70 odkazů na konkrétní nález na díle.

---

## 1. Jak vzniká dráha (pořadí kroků)

```
kontura (CAD)
  → buildMachinableContour()      obrobitelná kontura + mezní čáry destičky
  → buildRawOffsets()             offset o rádius plátku + přídavky
  → ops/finish.js                 DOKONČOVACÍ dráha
  → ops/roughLong.js|roughFace.js HRUBOVACÍ průchody (pole `passes`)
  → gcodeEmit.js + ops/*Emit.js   G-kód
```

Kdo co dělá: `docs/developer.md`, § CAM pipeline.

### 1.1 Podélné hrubování (`ops/roughLong.js:32`)

Pro každou hloubku `currentX` od `maxStockX − ap` po `minPartX`:

1. najdi Z-hranice na téhle hloubce (okraje polotovaru + průsečíky offsetu),
2. mezi sousedními hranicemi vzorkuj střed — **řeže se tam, kde je NAD námi
   polotovar a POD námi offset**,
3. sousední intervaly sluč; průchod má `zStart > zEnd` (jede zprava doleva).

Nájezd je **rampovaný** (G1 pod úhlem zanoření), ne svislý G0.

### 1.2 Čelní hrubování (`ops/roughFace.js:19`)

Pro každou hloubku Z od `stockFace − ap` po `marchEndZ`:

1. `xStart` = povrch polotovaru + vůle (rapid-bezpečná poloha),
2. `xEnd` = kde kontura blokuje řez jdoucí v −X k ose; když nic, řeže se k X0,
3. nájezd `G0 X` za polotovar → `G0 Z` na hloubku → `G1 −X` řez → odskok.

### 1.3 Zleva není vlastní algoritmus

„Podélně zleva" je **zrcadlo** — svět se překlopí v ose Z (`zMirror.js`) a
pustí se týž `genLongPasses`. Platí tedy beze zbytku všechno, co umí pravá
strana. Vlastní soubor by znamenal druhou kopii generátoru
(`roughingStrategies.js`).

> **Důsledek pro opravy:** cokoli změníš v podélném hrubování, změní i druhou
> stranu. Otisk to ukáže jako změnu na `part-11-zleva-*`, `part-12-*`, `part-13-*`.

---

## 2. Pořadí obrábění

| pravidlo | kde |
|---|---|
| **Vrstvy jdou od největšího průměru dolů.** | `ops/roughLong.js` (`depths`) |
| **Úseky (regiony) se řadí podle své nejmělčí dosažené hloubky** — kdo má větší průměr, jde první. | `ops/long/regions.js:276` (`orderRegions`) |
| **Odložené vjezdy se řadí na konec SVÉHO regionu**, ne až za celý program. Materiál nad zanořeným nástrojem musí zmizet dřív. | `ops/roughLong.js` (`__deferEntry`) |
| **Dělení na úseky podle hrbů kontury** odstraňuje přejíždění zprava doleva a zpátky v každé vrstvě. | `calculatePipeline.js:450` (přání uživatele 27. 8. 2026) |

---

## 3. Podmínky vjezdu a zanoření

### 3.1 Kde smí průchod začít

- Vjezd leží tam, kde na dané hloubce **skutečně začíná polotovar** — okno
  regionu i rozsah 📐 můžou začínat ve vzduchu (`passEntryZ`).
- Kotva rampy se hledá na **vůlí-posunuté siluetě** (offsetová čára), ne na
  syrovém obrysu.
- Vedle vjezdu se musí **vejít držák** v celém svém axiálním dosahu
  (`ops/long/entryRamp.js`, `holderEntryCapZ`).
- Nájezd se smí posunout nejvýš o **`ENTRY_SHIFT_MAX` = 3 mm**; dál ne, protože
  se tím mění i příjezdová cesta (`ops/shared.js:33`).

**POSUNUTÝ VJEZD MÁ TAKY DOSTAT RAMPU — opraveno 1. 9. 2026.** Brána rampy
v `ops/long/openPass.js` byla `iv.zStart >= entryZ - 1e-6` („vjezd sedí přesně
na umělé hranici"). Jenže hlídání držáku přesune `intervals[0].zStart` DOLEVA
(`iv0.zStart = zTry` v `roughLong.js`, značka `entryShifted`) ještě před
`intervals.forEach`, takže brána propadla a průchod se zanořil **kolmo (90°)**,
i když bylo Zanořování zapnuté a úhel 15°. Nález uživatele na dílu ⌀129 × 355,
údolí Z 74–84:

| hloubka X | `iv.zStart` | `entryZ` | `entryCapped` | brána | vjezd |
|---|---|---|---|---|---|
| 19,545 | 82,756 | 82,756 | ne | ✓ | ve vzduchu |
| 16,545 | **81,682** | 83,432 | **ano** | ✗ | kolmý sjezd 2,1 mm → **teď rampa 15°** |
| 13,545 | **80,682** | 83,432 | **ano** | ✗ | `N3200 G1 X13.545 F0.25`; rampa tam neexistuje, zůstává zápich |
| 10,545 | 83,432 | 83,432 | ano | ✓ | rampa |

Posunutý vjezd si hledá **vlastní kotvu** `stockEntryRamp(currentX, iv.zStart)`
— přímku zanoření skrz SKUTEČNÝ vjezd, takže `zStart` se nemění a úhel sedí
přesně. Hlídá `tests/cam-shifted-entry-ramp.test.js` (na `part-17-long-parting`,
kde je táž geometrie).

**KDYŽ RAMPA NENÍ, VRSTVA SE VYNECHÁ — rozhodnutí uživatele 1. 9. 2026.**
*„Ať to nezajíždí kolmo, to je zakázané při takovém plátku; když tak ať to
vynechá tu dráhu… když to nejde, tak to nemůže dělat, jako by to byl
upichovák."* U plátku, jehož úhel zanoření je < 90° (`entryRampIsPlunge`
false), se tedy `entryCapped` vjezd bez rampy NEVYDÁ — je to táž větev, jakou
už měl vjezd na hranici rozsahu (`if (!rampOk) … return`), jen se dosud
nevztahovala na vjezd posunutý obálkou držáku.

Cena je změřená a uživatel ji zvolil vědomě: **−183,8 / −200,5 mm² úběru** na
sadě (0,2 %), kolize beze změny (0/0 v obou standardech). Materiál, který tím
zůstane stát, si vezme dokončování. Na `part-15-finish-zprava` a
`holder-region-roughing` to znamená o 2–3 průchody míň; otisky počtů
v `cam-stock-span-depths` a `cam-residual-clamp` jsou k tomu datu upravené.

> **Příznak `orderAwareHolder` tím přestal být inertní mimo `part-8`.** Rampa
> posunutého vjezdu se ptá OBOU modelů držáku a polygonový (`residEntryArea`)
> existuje jen se zapnutým příznakem — vypnutý vrací 0. Se zapnutým proto
> najde konflikty, které výškové pole nevidí, a vrstva se místo kolmého
> zápichu vynechá (na `holder-region-roughing` dvě, −60,3 mm²). Je to rozdíl
> MODELŮ, ne vada příznaku.

> **TŘI VĚCI, KTERÉ SE U TÉHLE RAMPY DĚLAT NESMÍ** — všechny změřené proti
> stavu 80 307,5 / 83 265,7 mm²; správná varianta stojí **0,0 mm² a 0 nálezů**:
>
> | co | cena |
> |---|---|
> | pustit kotvu do ŘETĚZU `rampSt` | −254,6 / −290,5 mm²; hlubší (už NEposunuté) vrstvy na zděděné kotvě ztroskotají a vypadnou (`holder-casting-slanted-face` 35 → 33 průchodů, `part-10-zapich` 38 → 35, `part-15-finish-zprava` 33 → 31) |
> | vynechat vrstvu, když rampa nevyjde („rampa, nebo nic") | tytéž stovky mm²; fallback na dnešní kolmý vjezd je změřeně čistý |
> | vydat rampu bez hlídání držáku PODÉL ní | +4 nálezy v OFFSETOVÉM standardu (`pocket-wall-at-plunge-angle`, 1,0–2,3 mm²) a přes odložené vjezdy další ztráta průchodů |
>
> Ptají se proto OBA modely: `holderFitAreaAlong` (výškové pole, jede i bez
> order-aware) a `residEntryArea` s prahem `ENTRY_FIT_TOL` — tedy TÝMŽ prahem,
> jakým se posuzoval ten posun vjezdu. Výškové pole samo nestačí: o tunelech
> neví a přesně tu rampu na `pocket-wall-at-plunge-angle` pustilo.

### 3.2 Úhel zanoření podle tvaru plátku — UZAVŘENO 26. 8. 2026

| plátek | úhel | proč |
|---|---|---|
| **upichovací** | 90° (kolmo) | spodní hrana JE obráběcí hrana; kolmý zápich je jeho normální provoz |
| **kulatý** | 45° | kolmo by bral celým plátkem |
| **polygon** | podle spodní hrany — podélně `|natočení|`, čelně `|natočení + vrchol − 90|`, u pozitivní plátky navíc omezeno hřbetem α | |

`camMath.js:12` (`getEffectivePlungeAngle`). **Neotvírat bez nového nápadu.**

### 3.3 Kapsa za bossem

Interval, do kterého se zprava vjet nedá, se obsluhuje jen se **zapnutým
Zanořováním**: vede se k němu sledováním kontury (G1/G2/G3) a rampou pod úhlem
zanoření. Bez zanořování se vynechá (`ops/long/pocketPass.js`).

Úzká kapsa (užší než upichovací plátek) se přeskočí a hlásí se to.

---

## 4. Meze hlídání

### 4.1 Destička

- Úseky, kam boční ostří nedosáhne, se **vynechají** — nezkracují se.
- Hrana destičky má **konečný dosah** (`insertReachZ`); za koncem břitu přebírá
  hlídání držák.
- **Upichovák: každý test překážky se ptá CELÉHO OKNA TĚLA** (−R … b−R od
  špičky), ne bodu špičky — plátek řeže celou spodní hranou šířky b
  (`inserts/parting.js`). Bodový test to na MÍRNÉ šikmině neuvidí: na kuželu
  ~10° od osy stoupne offset za 0,05 mm o 0,009 mm, tedy pod řeznou tolerancí
  0,01 mm. Nález 1. 9. 2026: zápich seděl na offsetu na tisícinu přesně
  a plátek o 4,2 mm dál ukrojil 0,18 mm² z hotového dílu
  (`ops/long/intervalScan.js`, `clampPartingBody`).
- **Zajezd do HOTOVÉHO tvaru validátor nehlásí.** ⛔ panel měří polotovar
  a držák („narazil jsem do něčeho, co tam stojí"); že nástroj ukrojil kus
  dílu, je opačná otázka a hlídají ji invarianty:
  `cam-gouge-invariants` (střed nosu) a `cam-parting-body-gouge` (obrys
  upichováku).
- **Čelně: vrstva nikdy nejde hlouběji než předchozí.** Hrana nakloněné
  destičky leží v axiální vzdálenosti `dz` o `dz·tan(natočení)` níž — hlubší řez
  by jí zajel do hotové vrstvy. Běží **až po hlídání držáku**, protože co držák
  zvedne, už by žádná kontrola destičky neviděla (`ops/face/layerDepth.js:17`).

> ⚠ **LATENTNÍ VADA (1. 9. 2026): „pravé stěny kapes" nemají lokalitu.**
> Druhý blok `ops/long/insertFlankGuard.js` (heuristika `rotDeg`) bere za
> „pravou stěnu" **kotvu rampy KTERÉHOKOLI jiného průchodu na dílu** a posune
> podle ní začátek každého hlubšího — bez jediné podmínky, že spolu ty dva
> průchody geometricky souvisejí. První blok (`phiDeg`) se přitom ptá
> SKUTEČNÉ kontury (`offsetPath`); tahle asymetrie je ta vada.
>
> Doloženo na dílu uživatele 1. 9. 2026 (spočítáno ručně, sedí na µm):
> `Průchod 9` (X46,545) dostal začátek posunutý o 11,2 mm podle
> `Průchodu 7` — ležícího **60 mm daleko v Z a za jinou částí kontury**
> (258,436 − 3,000/tg 15° = 247,240 = přesně vydaná kotva). Vjezd se tím
> dostal MIMO materiál a emise vydala `N580 G0 Z172.532` + dojezd
> `N590 G1 X48.545 Z174.532` 20 mm od místa, kde řez skončil. Totéž
> `Průchod 33` ← `Průchod 31` (142,875 − 3,000/tg 15° = 131,679).
>
> Opravami z 1. 9. 2026 (duplicitní průchody, kotva na zbytku) ty falešné
> „stěny" na tomto dílu **zmizely** — blok už na něm nesáhne ani na jeden
> průchod (hlášení „6 průchodů zkráceno" → „4", a všechny 4 jsou z bloku
> `phiDeg`). Vada tím není opravená, jen se přestala spouštět. Než se na ni
> sáhne, je potřeba případ, na kterém se projeví — jinak se nedá změřit,
> jestli podmínka lokality něco nepokazí.

### 4.2 Držák

| práh | hodnota | proč |
|---|---|---|
| `HOLDER_STOCK_GAP` | 1,0 mm | volný prostor mezi držákem a offsetovou čarou při hledání stropu vjezdu |
| `HOLDER_ENTRY_STOCK_GAP` | 2,0 mm | odstup držáku od offsetové čáry u kotvy zanoření — *„ať je držák tak 2 mm od té čáry"* (10. 8. 2026) |
| `HOLDER_FIT_TOL` | 2,0 mm² | sken je hrubší model než polygon a **systematicky nadhodnocuje**: naměřeno 0,63 mm² skenem proti 0 polygonem. Práh leží 2× nad stropem artefaktů a 3× pod nejmenší skutečnou vadou. S 0,5 padly na `part-17` 4,4 % úběru |
| `ENTRY_FIT_TOL` | 0,5 mm² | **stejný jako u validátoru.** Přísnější práh zamítá vjezdy, které nikdo nehlásí: při 0,1 přišla sada o 103,6 mm² úběru a čtyři díly o celý průchod, aniž ubyla jediná kolize |

`ops/shared.js`. **Poučení:** práh přísnější než měřítko, kterým se výsledek
posuzuje, se nedá obhájit.

### 4.3 Dva modely materiálu

- **Výškové tabulky** (`ops/long/depthTabs.js`) — levné, vzorkované po 0,25 mm.
  **Neumí TUNEL:** když zanoření podjede pod stojícím materiálem, srazí celý
  sloupec na hloubku tunelu (naměřeno 11–14 mm na `part-8`).
- **Polygonový zbytek** (`ops/long/residualGuard.js`) — zná pořadí, tunel umí.
  Za příznakem `orderAwareHolder`.

---

## 5. Kde končí polotovar

> ## Syrová čára polotovaru NEEXISTUJE. Bere se jedině offsetová čára.
> ## Není-li offsetová čára, teprve pak platí syrový obrys.
>
> **Závazné znění pravidla** (uživatel, 31. 8. 2026). Pro GENEROVÁNÍ DRAH je
> polotovarem offsetová čára — syrový nakreslený obrys se neuvažuje vůbec.
> Jediná výjimka je degenerace: **Přídavek X/Z (polo.) = 0**, kdy žádná
> offsetová čára nevzniká a obě čáry splývají; teprve tam platí obrys tak,
> jak je nakreslený (vědomé zadání „polotovar je přesně tady").

**Proč:** přídavek X/Z je v zadání právě proto, že odlitek MŮŽE být větší.
Materiál až k té čáře tedy reálně existovat může a náraz do něj je náraz
*(rozhodnutí uživatele 20. 8. 2026: „obrobek je celý i s tou offsetovou
čarou… mělo by to tak být i dělané")*.

- Dráhy se proti té čáře plánují, náhled ji vybarvuje, validátor ji měří.
- Rychloposuv **staví PŘED ní**, o `rapidFeedGap` (výchozí 1 mm); zbytek se
  dojede pracovním posuvem.
- Snap se na ni chytá (vrcholy i hrany) — od 31. 8. 2026.
- Náhled i snap berou tutéž smyčku jako plánování (`getStockPlanOutline`
  v `camSimulator.js` → `stockPlanLoop`), aby nemohly tvrdit každý něco jiného.

`collisionValidator.js:303`, `materialRemoval.js:269`, `camMath.js:403`.

### 5.1 Kde se syrový obrys ZATÍM ještě používá (audit 31. 8. 2026)

Sjednocení popisuje `docs/cam-sjednoceni-polotovaru.md` a je z větší části
hotové. Legitimní zbytek je jediný: **z čeho se offset počítá** —
`buildStockLoopRaw()` musí syrovou smyčku vyrobit, aby ji `offsetStockLoop()`
měl co posunout (`ops/roughLong.js:297`). To není „použití pro generování".

Skutečně otevřená místa, kde o dráze rozhoduje SYROVÝ obrys:

| místo | co podle něj rozhoduje |
|---|---|
| `ops/roughLong.js:120` | `maxStockX` — od jaké hloubky vůbec začínají vrstvy (průsečíky na hranicích rozsahu 📐) |
| `ops/roughLong.js:191` | `stockZRangeAt` — Z-okno řezu na hranicích rozsahu 📐 |
| `ops/roughLong.js:149` | `_stockLoopSpanMemo` — rozpětí pro kapsový span |
| `gcodeEmit.js:162` | `rapidStock` = model ze SYROVÉ smyčky; plánovací `rapidStockPlan` je vedle něj samostatně |

**Pozor při opravě:** u prvních tří jde o hranice rozsahu 📐 a posun na offset
tam znamená, že vrstvy začnou o Vůli X výš a Z-okno bude o Vůli Z širší —
tedy ZMĚNA DRAH, ne refaktor. Měřit otiskem i sweepem.

> **Doplněk 1. 9. 2026 — nejde jen o „syrový × offsetový" obrys.** Kotva
> zanoření (`stockEntryRamp`) používala offsetovou čáru správně, a přesto
> vyráběla 44mm rampy: offsetová čára je pořád obrys PŮVODNÍHO odlitku a neví
> nic o tom, co mělčí vrstvy už odebraly. Správná mez pro kotvu je **povrch
> ZBYTKU** — tedy nižší z offsetové čáry a už vyříznuté podlahy
> (`cutFloorTab`). Tatáž otázka platí i pro `rapidStopXAt`: kde se rychloposuv
> zastaví před sjezdem na hloubku (na dílu uživatele to dělalo rozdíl
> X 20,550 proti X 17,740, tedy 2,8 mm sjezdu posuvem navíc).

---

## 6. Pravidla, která vyslovil uživatel

### 6.0 „NEPŘEJÍŽDĚT, DOKUD NENÍ CELÁ PRAVÁ STRANA HOTOVÁ" — PLATÍ VŽDY

> ## Nepřejíždět, dokud není celá pravá strana hotová.
>
> **Závazné znění pravidla** (uživatel, 28. 8. 2026: *„to je podmínka, co musí
> být vždy dodržena"*). Není to optimalizace ani volba — je to podmínka.

Když vrstvu přeruší hotovní kontura (hrb, boss, stěna kapsy):

1. **Vrstva se DOJEDE.** Jede-li se „bez schodků", pokračuje se po obrysu až
   do **rohu hotovní kontury na druhé straně** — tam, kde kontura zahne. Ne
   dřív, ne k umělé hranici.
2. **Pak se dodělá CELÁ TA STRANA až na dno** — všechny hloubky.
3. **Teprve potom se přejíždí na druhou stranu.** Nepřejíždí se tam a zpátky
   po hloubkách.
4. **Po přejezdu se dodělá VŠECHNO, co na té straně zbylo neobrobené —
   a teprve pak se jede dál.** Strana se nikdy neopouští rozdělaná.
   *(doplněno 28. 8. 2026: „až pak se pojede dál")*

„Ta strana" = ta, ze které nástroj přijíždí — u standardního podélného
hrubování zprava doleva tedy PRAVÁ. U hrubování zleva je svět zrcadlený
(§1.3), takže je to zrcadlená pravá, tedy fyzicky levá.

**Pravidlo je REKURZIVNÍ.** Neplatí jen pro první dvojici stran: každý úsek,
na který se přejede, se dodělá celý, než se pokračuje na další. Zakázaný vzor
je jakékoli **střídání po vrstvách** mezi dvěma místy dílu — ať už je to
pravá/levá strana hrbu, nebo dva úseky za sebou.

> **Kontrola v náhledu:** projeď simulaci a sleduj, jestli se nástroj vrací na
> místo, kde už jednou byl, do hloubky, kterou tam ještě nedobral. Pokud ano,
> pravidlo je porušené — nezáleží na tom, že celkový úběr sedí.

**Proč:** přejíždění napříč dílem v každé vrstvě je zbytečná dráha a nástroj
se veze po kontuře přes hotový tvar.

#### Stav implementace (28. 8. 2026)

Pravidlo bylo do té doby splněné jen ve dvou úzkých případech. Na pokyn
uživatele *„jestli tam je nějaká jiná podmínka, tak ji smaž — tohle je jediné,
co se bude dělat"* padly **tři gaty**:

| co bylo podmíněné | čím | stav |
|---|---|---|
| dojet vrstvu přes hrb | `mergesOverHump` jen u upichováku | ZRUŠENO — platí pro polygon i kulatou (`inserts/*.js`) |
| dělení na úseky | jen ODLITEK + zaškrtnuté „Dělit na úseky" | ZRUŠENO — silueta se staví i pro válec, checkbox už negatuje (`ops/roughLong.js`, `ops/long/regions.js`) |
| dělení u HRBU kontury | heuristika „vejde se přes hranici držák?" split ZAHODILA | ZRUŠENO — `splitIsNeeded` u `kind === 'peak'` vrací rovnou `true` |

Zbývá jediná technická podmínka: bez siluety polotovaru se zlomy spočítat
nedají (`!stockLoopL || stockLoopL.length < 3`). To není politika, to je
nemožnost.

**Změřená cena** (sweep, 26 fixtures × 2 držáky):

| | úběr | kolize |
|---|---|---|
| **nakreslený nůž** | 80 786 → **82 810 mm²** (+2 025) | **0 → 0** |
| náhradní obdélníkový držák | 81 984 → **84 687 mm²** (+2 703) | 2 → **20** (+87 mm²) |

S reálným nakresleným nožem je to tedy čistá výhra. Osmnáct nálezů navíc je
na NÁHRADNÍM obdélníku (používá se tam, kde nůž nakreslený není — je hrubší
a pesimističtější), soustředěných na `part-1/2/4/6/9` kolem Z 257–258
a na `part-8`.

> **Zrušení heuristiky u hrbu nestálo nic.** Starý komentář v `splitIsNeeded`
> varoval před „7 fixtures, 5,8–43,6 mm²" — po zrušení předchozích dvou gatů
> se to už neprojevilo: úběr +204 mm² a **žádný nový nález**. Ta výstraha
> platila pro jiný stav kódu.

#### GATE, KTERÝ PRAVIDLO PŘEBÍJEL — ZRUŠEN 1. 9. 2026

Od 27. 8. 2026 se plán počítal DVAKRÁT — s dělením podle hrbů a bez něj —
a `planQuality` rozhodla, který se nechá. Na dílu uživatele (⌀111 × 350,
upichovák, podélně zleva) tím pravidlo padalo pokaždé: dělení se spočítalo
(8 úseků, zlomy Z 4,1 / 67,2 / 127,2 / 228,1) a pak se zahodilo. Uživatel to
viděl jako **24 návratů „vlevo–vpravo–vlevo"** kolem každého hrbu.

Příčiny byly TŘI a všechny na straně toho měření, ne pravidla:

| co | jak se to projevilo | kde |
|---|---|---|
| **duplicitní okna úseků** | rozpuštěná DOLNÍ hranice sahala rovnou na −∞, takže okno přeskočilo i hranice, které drží, a týž interval vydal ještě jeden region níž — z 112 průchodů bylo 6 duplicitních (`X63.545 Z196.3…256.6` dvakrát) | `ops/roughLong.js`, `regZLo` |
| **metrika neuměla plány rozlišit** | `planQuality` brala MAXIMUM přes průchody; jeden velký zákrok společný oběma plánům ho nasytil. Na `part-1` vyšlo 272,84 mm² pro plán s dělením i bez něj, ačkoli validátor jednomu napočítal 20 nálezů a druhému nulu | `ops/long/holderCheck.js` |
| **vetovala i CENA** | plán s dělením je z principu o něco dražší (každý úsek se dodělá do své hloubky, u hranic zůstane materiál pro jinou operaci) — kritérium `residual` ho zamítalo, i když byl čistý: na dílu uživatele −399 mm² proti NULE kolizí | `calculatePipeline.js` |

Po opravě smí plán s dělením vetovat **jen DRŽÁK** (proveditelnost), nikdy
úběr. Změřeno (sweep, 27 fixtures × 2 držáky):

| | úběr | kolize |
|---|---|---|
| náhradní držák | 88 726,1 → **88 232,1** mm² (−494) | **47 / 207,9 → 0 / 0,0** |
| nakreslený nůž | 85 235,9 → **85 235,9** mm² (0) | **9 / 15,8 → 2 / 4,9** |

Na dílu uživatele: alternace **24 → 0**, kolize 0 → 0, průchodů 69 → 75,
úběr 4 034,5 → 3 635,9 mm² (těch −399 hlásí ⚠ panel jako pět vynechaných
odložených zanoření — držák se do nich po obrobení úseku nevejde).
`tests/cam-collision-free` je poprvé zelený s PRÁZDNÝM seznamem výjimek.

> **Pořadí úseků se NEMĚNILO.** Zkoušeno seřadit je po směru jízdy místo
> „největší průměr první" (zadání 27. 8. 2026) — samo o sobě to nepomohlo
> (nakreslený nůž 122 nálezů) a po opravě metriky bylo měřitelně HORŠÍ
> (náhradní držák 2 / 1,5 proti 0 / 0,0). Zamítnuto, pravidlo o průměru platí.
#### ZMĚŘENO A ODLOŽENO: rozpuštění hranice u HRBU (31. 8. 2026)

Vrstvy NAD hrbem se pořád sekají vejpůl uprostřed jeho plošiny — hranice
úseku tam platí, i když hrb vrstvu vůbec nepřerušuje. Příčina je
v `ops/roughLong.js`:

```js
const dissolveEdge = !prms.plungeRoughing;   // se Zanořováním hranice DRŽÍ
```

Rozpouštění je podmíněné vypnutým Zanořováním. To dává smysl u ÚDOLÍ
polotovaru (kolmo do kůry dna se sjet nedá), ale ne u HRBU: přejet nad hrbem
žádné zanoření nepotřebuje.

**Oprava byla napsaná a změřená** — rozlišit `kind === 'peak'` a nad hrbem
hranici zrušit bez ohledu na zanořování. Na dílu uživatele fungovala přesně
podle pravidla (průchody r 52–63 dojely na Z 195,278 místo Z 228,132, program
577 → 517 řádků). **Na sadě je ale neúnosná:**

| | úběr | kolize |
|---|---|---|
| bez opravy | 82 810,4 | **0 / 0,0 mm²** |
| s opravou | 82 810,8 (**+0,4**) | **30 / 240,8 mm²** |

Za 0,4 mm² materiálu třicet kolizí držáku na konfiguraci, která byla čistá.
Odloženo, **ne zahozeno** — leží v `git stash@{0}` („WIP on main“ nad
`4cd0d15`).

**Kde hledat dál:** rozšířený průchod se plánuje přes obě strany hrbu, ale
ořez obálkou držáku (`applyHolderClamp` / `holderClampZEnd`) zřejmě neplatí
na celý nový rozsah. Příští pokus musí ověřit, že se držák vejde po CELÉ
délce sloučené vrstvy, ne jen v jejím původním úseku.

**Co ještě není ověřené:** pořadí stran pořád řídí `orderRegions` podle
NEJVĚTŠÍHO PRŮMĚRU, ne „napřed ta, ze které přijíždím". Na dílech sady to
vychází stejně (tie-break je vyšší Z, tedy pravá), ale na dílu, kde má levá
strana větší průměr, by šla první.

### 6.1 Ostatní

| pravidlo | co znamená | kde |
|---|---|---|
| **„CELÝ, NEBO VŮBEC"** (11. 8. 2026) | Úsek, na který se nedá dojet celý, se neobrábí vůbec — ani zkrácený. Jinak zůstane na hotové ploše přechod uprostřed. Platí i pro úsečky. | `ops/finish.js:9` |
| **„Napřed se dojede to, co je ve směru dráhy"** | Vrstva přerušená nízkým hrbem se neotáčí: sjede po obrysu na druhou stranu a pokračuje. Zatím jen upichovák. | `ops/long/humpMerge.js:7` |
| **„Ať je držák tak 2 mm od té čáry"** (10. 8. 2026) | `HOLDER_ENTRY_STOCK_GAP` | `ops/shared.js:11` |
| **„Dodělat vrstvu"** (21. 8. 2026) | Na strmém boku offset propadne pod hloubku dalšího průchodu hned na prvním milimetru a žádná hlubší vrstva se tam nedostane — dojezd musí pokračovat. | `ops/long/openPass.js:219` |
| **Kolmý zápich upichováku není vada** (26. 8. 2026) | Zakázat ho plošně na každé umělé hranici je moc hrubé; nebezpečný je jen tam, kde do stojícího materiálu vjede DRŽÁK. | `ops/long/openPass.js:41` |
| **U ostatních plátků je kolmý zápich ZAKÁZANÝ** (1. 9. 2026) | *„Ať to nezajíždí kolmo… když to nejde, tak to nemůže dělat, jako by to byl upichovák."* Vjezd na umělé hranici bez rampy se nevydá — vrstva se vynechá. Cena −184/−201 mm², kolize beze změny. | `ops/long/openPass.js` (viz §3.1) |
| **Hranice úseku 📐 = volba uživatele** | „Tady končí tenhle úsek, zbytek dodělá jiná operace." Proto se **ořezává, nezahazuje** — na rozdíl od nedosažitelných úseků. | `ops/finish.js:367` |
| **Hrubování bez schodků / „i u čelního"** | Po dojezdu na offset se pokračuje po kontuře na hloubku dalšího průchodu. Přepínač „i u čelního" řídí jen radiální stěny; kužely a válce jedou vždy. | `docs/user-guide.md:673` |

---

## 7. Doložené meze — NEOTEVÍRAT bez nového nápadu

| věc | proč je to mez |
|---|---|
| dělení úseku ve středu údolí | **TŘIKRÁT** zamítnuto (8. 8., 10. 8. a 1. 9. 2026); nejde o pokrytí, ale o KOTVU ZANOŘENÍ — čísla níž |
| horní mez rozsahu 📐 u čelního hrubování | vynutit nejde (−11,8 mm² pokus) |
| přísnější hlídání držáku u `holder-region-roughing` | každé zpřísnění stojí o dva řády víc materiálu (−310 mm² za 0,6 mm²) |
| zrcadlení držáku u upichováku | nezrcadlit = 332 kolizí čelně zleva |
| úhel zanoření podle tvaru destičky | uzavřeno 26. 8. (viz §3.2) |
| nájezd průchodu × držák (poloha) | na sadě −3 948 mm² a +1 127 mm² nových kolizí → zahozeno |
| `applyHolderClamp` na kapsové intervaly | −4 192 mm² úběru a s náhradním držákem o nález VÍC |
| memoizace uvnitř `calculate()` | `pathInputsKey` nepokrývá všechny vstupy; rozbilo 9 souborů testů |
| rampa posunutého vjezdu puštěná do ŘETĚZU kotev | −255 až −291 mm² a +4 nálezy offset; správně je LOKÁLNÍ kotva, viz §3.1 |
| zahazovat „uzavírací krok řetězu, co nic neodebere" | viz §7.2 — nedá se odlišit od kroku, který odebere 13–44 mm² |

### 7.1 Hranice ve STŘEDU ÚDOLÍ — přeměřeno 1. 9. 2026

Uživatel na to upozornil znovu: *„vezme to prostě odprostředka toho údolí“*.
Vidí správnou věc — zlom polotovaru je definovaný jako **střed údolí**
(`regions.js`), takže na jeho dílu padl na Z 172,5 doprostřed plochého dna
X 16,74 (Z 149,5…196,3) a vrstva se tam rozřízne svislým zápichem.

Pod dnem údolí je materiál souvislý, takže se hranice rozpouští — ale jen
`!prms.plungeRoughing`. Se zapnutým Zanořováním DRŽÍ. Zkusil jsem ji rozpustit
vždy (`dissolveValley = true`) a změřil to na celé sadě:

| | úběr | kolize |
|---|---|---|
| dnes | náhradní držák **88 232,1** mm² | **0 / 0,0** |
| s rozpuštěním | náhradní držák **85 529,5** mm² (−2 703) | **2 / 4,6** |
| | nakreslený nůž 85 235,9 → **83 000,1** (−2 236) | 2 / 4,9 → 2 / 4,9 |

Na dílu uživatele samotném je to naopak +280 mm² (3 635,9 → 3 915,6), ale za
cenu dvou nálezů 2,3 mm² v ÚDOLÍ (Z ≈ 154, `G1 X9.943`) — tedy přesně tam,
kam se držák nevejde. Napříč sadou tedy platí stará výstraha z kódu: po
rozpuštění hranice **zůstane dno vybrání stát**, protože region nad ní na něj
dosáhne jen svým PRVNÍM intervalem.

**Zkoušen i POSUN KOTVY místo posunu hranice** (1. 9. 2026). `holderEntryReachZ`
na to existuje a je psaný přesně na tuhle stížnost, jenže se u 90° zápichu
vůbec nespustí: `plungeEntryOk` (zápich se na hranici vejde) přeskočí celý
blok. Po odblokování se kotva opravdu posunula — zápich Z 170,7 → **162,75**,
tedy o 8 mm blíž ústí. Cena ale byla vyšší než výnos:

| | průchodů | úběr | ⚠ |
|---|---|---|---|
| dnes | 75 | **3 635,9** mm² | 5 odložených zanoření |
| s posunem kotvy | 72 | 3 474,3 (−162) | 11 odložených + **12 vrstev u stěny** |
| + strop o šířku plátku | 72 | 3 428,3 (−208) | totéž |

Důvod je fyzikální: kotva se posune ke stěně hrbu a 5mm upichovák se tam
tělem nevejde (`clampPartingBody`), takže vrstvy vypadnou. **Poloha uprostřed
dna tedy není svévole — je to nejzazší místo, kam se ten nůž s držákem vejde.**
Užší plátek nebo obrobení téhle poloviny z druhé strany je jediná cesta dál;
přesně to ⚠ panel hlásí („držák se k nim nedostane… obrobte je z druhé strany“).
**Co z toho plyne pro příští pokus:** nesahat na `dissolveValley`, dokud
nebude vyřešené VLASTNICTVÍ ÚDOLÍ — tedy aby sloučený region pokryl i
intervaly za bývalou hranicí, ne jen ten první. Teprve pak má smysl měřit
znovu; samotné přepnutí příznaku je měřitelně horší.

Materiál, který na dílu uživatele v levé půlce údolí zůstává (X 16,74 proti
kontuře 8,74 na Z 149,5…167), přitom **není** důsledek té hranice: leží tam
proto, že se do něj nevejde držák, a ⚠ panel to hlásí jako „5 odložených
zanoření vynecháno“. Rozpuštění hranice ho vezme jen tak, že do té stěny
držákem drhne.
Plný kontext: `docs/cam-plan-2026-08-28.md` §4, `docs/cam-order-aware-holder.md`,
`docs/cam-sjednoceni-polotovaru.md`, `docs/geometry-libs-migration.md`.

### 7.2 „Uzavírací krok řetězu, co nic neodebere" — OTEVŘENÉ, 1. 9. 2026

Uživatel na svém dílu ukázal `Průchod 54`: celý nájezd, rampa 15° a odjezd
kvůli řezu **0,05 mm** (*„ten blbej podpich, který odstraň"*). Vzniká
v bisekci uzavírající řetěz zanoření (`roughLong.js`), když v celém intervalu
není hloubka se skutečným řezem — bisekce pak dosedne na svůj vlastní
epsilon 0,05 a takový krok vydá.

**Zahodit je plošně NEJDE.** Celá hodnota takového kroku je v DOJEZDU, ne
v řezu, a ten dojezd jinde dobírá schod za stovky mm². Zkoušené a zamítnuté:

| kritérium | co dělalo |
|---|---|
| plocha řezu ≥ `ENTRY_FIT_TOL` | −196,6 / −192,8 mm² na sadě — bere i kroky s velkým dojezdem |
| rozsah v Z ≤ `Odskok` | totéž; rozsah v Z o dojezdu po strmé stěně nic neříká |
| výstup dojezdu v X < `ap` | `range-chain-insert-shadow` (ap 5, výstup 4,665) padá těsně |
| výstup dojezdu v X < 0,8 · `ap` | zabije `range-chain-steep-face` — tam táž „nulová" konstrukce odebere **13,3 mm²** a hlídá ji `tests/cam-leadout-step` |

Změřené hodnoty (26 fixtures) ukazují, proč: mezi „nesmyslem" a „prací" NENÍ
geometrický předěl. `part-17` má výstup dojezdu 2,21 mm a odebere 12,5 mm²;
uživatelův podpich má 2,05 mm a odebere ~6 mm². **Rozhodnout to umí jen
skutečný model zbytku**, ne odhad z geometrie průchodu — a ten v plánovači
zatím není (týž závěr jako u `docs/cam-order-aware-holder.md`).

Než se do toho půjde, je potřeba od uživatele mez v mm² („pod tolik to nemá
smysl"), nebo pořadí-znalý model úběru v plánovači.

---

## 8. Jak změnu ověřit

```bash
node scripts/cam_fingerprint.mjs --save=pred.json   # PŘED
# …oprava…
node scripts/cam_fingerprint.mjs --diff=pred.json   # KDE se to hnulo
node scripts/cam_sweep.mjs                          # BYLO TO K LEPŠÍMU? (úběr × kolize)
npx vitest run                                      # 1525 testů
```

**Měř ÚBĚR, ne jen kolize.** „Kolize 0" neznamená, že změna neublížila —
dvakrát prošla ztráta 75 a 19 mm², kterou validátor neukáže.

**Moduly sdílejí DATA, ne jen soubory.** `offsetXAt` čte 12 modulů, do pole
`passes` zapisuje 12, obálku držáku vidí 6. Změna v jednom se proto může
projevit na dílu, o který nešlo — od toho je otisk.
