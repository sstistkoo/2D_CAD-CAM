# CAM – proč se to pořád kazí a proč to trvá

Analýza z 5. 9. 2026. Všechna čísla jsou **naměřená** na dílu uživatele
`projekt_2026-09-04 (2)` (kontura 30 bodů, polotovar 27 bodů, rozsah přes celý
díl, 65 průchodů, 521 řádků G-kódu), ne odhadnutá.

---

## 1. Kolik to stojí času a kam ten čas jde

| co | naměřeno |
|---|---|
| celý výpočet dílu (2× `calculate()` + emise) | **4 476 ms** (medián ze 3; za zátěže stroje až 10 865 ms) |
| z toho uvnitř Clipperu (booleovské operace) | **~60 %** |
| `polyIntersect` na jeden výpočet | **9 240 volání** |
| `polyDifference` | **2 164** |
| `toolSweep` | **2 885** |
| `polyArea` | **9 238** |

To je **~140 booleovských operací nad polygony na jeden hrubovací průchod**.
Pro 2D soustružení, kde je profil jednoznačná funkce Z, je to o dva řády víc,
než co ta úloha potřebuje.

### Kdo je volá

| podíl | odkud |
|---|---|
| **7 436 z 9 240 (80 %)** | `planQuality` → `holderAreaAlongResidual` |
| 1 404 | `residEntryArea` (hlídání vjezdu) |
| ~400 | zbytek (rychloposuvy, držák v emisi) |

**80 % veškeré geometrické práce nedělá dráhy — boduje plán.**

### Co ten gate stojí — a proč ho PŘESTO nejde vypnout

`calculatePipeline.js:478` pouští generování **CELÉHO DÍLU DVAKRÁT** a oba plány
oboduje `planQuality`. Cena (medián ze 3 běhů, střídavě, aby se vyrušil drift):

| díl | s gate | bez gate | gate stojí |
|---|---|---|---|
| `projekt_2026-09-04 (2)` | 4 476 ms | 2 014 ms | **55 %** |
| `part-4` | 3 149 ms | 1 664 ms | **47 %** |
| `part-8` | 2 981 ms | 1 463 ms | **51 %** |

**ALE — a to je důležité — vypnout ho nejde.** Změřeno na 29 dílech:

| | |
|---|---|
| gate běží na | **23 z 29** dílů |
| druhý běh opravdu potřebuje | **23 z 23** |
| **mění rozhodnutí** (zahodí plán s dělením) | **17 z 23** |

> **Zamítnutá zkratka (5. 9. 2026).** Napadlo mě druhý běh přeskočit, když
> `withSplit.holder <= HOLDER_INTRUSION_TOL` (0,5 mm²) — `holder` je součet
> ploch, tedy ≥ 0, takže by podmínka `withSplit.holder <= without.holder + TOL`
> platila bez ohledu na druhý plán. **Neušetří to nic:** absolutní hodnota
> metriky vychází **95 až 1 045 mm²** na každém dílu, tedy o tři řády nad
> prahem. Ten práh je tolerance POROVNÁNÍ dvou plánů, ne absolutní mez.
> Otisk zůstal shodný (změna je korektní), ale čas se nehnul.

Zrychlit gate proto **nelze obejitím** — jen tím, že `planQuality` přestane být
drahá. A to je krok 1.

### Vedlejší nález, který stojí za pozornost

Gate zahodí plán s dělením úseků na **17 z 23 dílů**. Dělení přitom vynucuje
pravidlo §6.0 pravidel drah („NEPŘEJÍŽDĚT, DOKUD NENÍ CELÁ PRAVÁ STRANA
HOTOVÁ"), které vyslovil uživatel. Komentář u gate říká, že je to *pojistka,
ne optimalizace* — jenže v praxi to znamená, že **uživatelovo pravidlo se
na 74 % dílů tiše nepoužije**, protože metrika držáku ho přebije. To je přesně
ten vzor, který je v repu jinde zapsaný jako chyba: *„podmínku z pravidel drah
nesmí přebít měřicí gate — opravit se má PŘÍČINA."*

---

## 2. Jak to dělají jiné CAM systémy

Standardní architektura soustružnického hrubování (Mastercam, Esprit, Fusion,
GibbsCAM i klasická literatura) stojí na čtyřech věcech, které tady chybí:

### 2.1 Jeden model zbytku, spočítaný JEDNOU

Soustružení je 2D a profil je **monotónní řetěz** — na každém Z je jeden vrchol
materiálu. Zbytek se proto drží jako **schodový model: seznam Z-intervalů na
každé hloubce**, který se po každém průchodu aktualizuje v konstantním čase.
Dotaz „je tady materiál?" je vyhledání v setříděném poli, ne booleovská operace.

**U nás:** modely jsou tři a musí se navzájem shodovat —
- plánovací výškové tabulky (`depthTabs.js`, vzorkované po 0,25 mm),
- líný prefix `cutFloorTab` (dosynchrovávaný podle pole `passes`),
- emisní `rapidStock` + `rapidStockPlan` (jiné polygony),
- a validátor si staví **čtvrtý**.

Když se rozejdou, vznikne přesně ta třída chyb, kterou tenhle týden řešíme:
kotva rampy počítaná proti vzorkované podlaze, u které zaokrouhlení posunulo
dotyk o 0,067 mm a rampa pak šplhala o 13 mm dál.

### 2.2 Nejdřív generovat, PAK hlídat

V zavedených systémech je generování dráhy geometrická konstrukce (protni
hloubkovou čáru se zbytkem → intervaly → spoj je) a **hlídání kolizí je
samostatný průchod nad hotovou dráhou**. Když se něco zahodí, ví se kde a proč.

**U nás je hlídání vpletené do generování.** Průchod může zahodit nebo zkrátit
**42 různých míst ve 12 souborech**:

| soubor | míst |
|---|---|
| `ops/roughLong.js` | 13 |
| `ops/long/pocketPass.js` | 10 |
| `calculatePipeline.js` | 5 |
| `ops/long/residualGuard.js` | 3 |
| `openPass.js`, `insertFlankGuard.js`, `face/insertGuard.js` | po 2 |
| dalších 5 souborů | po 1 |

Praktický důsledek, změřený včera: aby se zjistilo, proč chybí **jeden**
průchod, bylo potřeba projít čtyři mylné hypotézy a bisekcí pipeline hledat
místo, které ho maže. Vinník (`guardInsertFlankLong`) přitom hlásil
„průchod ZKRÁCEN", ačkoli ho smazal celý.

### 2.3 Vjezdy jsou strategie, ne podmínky

Jinde je vjezd sada strategií (zápich / rampa / šroubovice / předvrtání), každá
umí odpovědět „dokážeš sem vjet?" a vrátí dráhu nebo null. Přidat případ =
přidat strategii.

**U nás** je vjezd rozhodnut podmínkou typu
`entryCapped && !plungeEntryOk && !entryRampIsPlunge && iv.entryShifted && iv.zStart < entryZ - 1e-6`
a stejná otázka se řeší na několika místech zvlášť. Odtud vada, že dojezd na
offsetovou čáru měl roky **jen otevřený průchod a rampový ne** — jsou to dvě
nezávislé větve emise, do kterých se funkce přidávají po jedné.

### 2.4 Pořadí drží datová struktura, ne příznaky

**U nás** je pořadí a návaznost uložená v příznacích na průchodech:
`noRetract`, `pocketReposition`, `rampFeedFrom`, `emitChainFrom`, `emitZEnd`,
`__deferEntry`. Kdokoli přeskupí nebo zahodí průchod, tiše rozbije řetěz o tři
kroky dál. Přesně na tohle je v paměti poznámka *„přeskupení passes zneplatní
kotvy ramp"* a včera to bylo potřeba dodatečně ošetřovat ručně.

### 2.5 Pravidlo „nepřejíždět" (§6.0) — jinde je to VÝCHOZÍ chování

Pravidlo, které uživatel vyslovil 28. 8. 2026, není v oboru nic zvláštního.
Je to rozdíl mezi **po úsecích (depth-first)** a **po vrstvách napříč dílem
(breadth-first)**, a soustružnické CAM systémy jedou po úsecích jako VÝCHOZÍ
režim. Nezajišťují to ale metrikou — zajišťuje to struktura:

| krok | jak to dělají jinde | jak to děláme my |
|---|---|---|
| **rozklad na úseky** | podle DOSAŽITELNOSTI: úsek = maximální oblast, na kterou se dá dojet z jednoho směru, aniž se prochází stojícím materiálem | heuristika nad „hrby" kontury (`splitIsNeeded`, `kind === 'peak'`) |
| **pořadí úseků** | topologicky: úsek B se smí začít, až zmizí materiál, který brání přístupu k němu | **podle PRŮMĚRU** — `regions.js:281` řadí `(b.x - a.x)`, tedy od největšího |
| **co dělá držák** | rozhoduje, jestli je úsek tímhle nástrojem obrobitelný (jinak hlášení „vezmi jiný nástroj/upnutí"), nebo zkrátí jednotlivý průchod | přebije CELÝ rozklad a vrátí plán bez dělení (17 z 23 dílů) |

**A tady je jádro problému.** Změřená skutečnost je, že dělení na úseky vyrábí
kolize držáku (+18 nálezů na náhradním držáku, viz §6.0 pravidel drah). Z toho
se ale vyvodil špatný závěr. Ty kolize neříkají „dělení je špatné" — říkají
**„pořadí úseků je špatné"**: úsek se začne obrábět dřív, než zmizí materiál,
který drží držák venku. Plán BEZ dělení ten problém obchází náhodou — jede po
vrstvách napříč celým dílem, takže blokující materiál odebere dřív.

Gate tedy sahá na správný problém **špatnou pákou**: místo aby přeuspořádal
úseky, zahodí rozklad.

**Že to bylo pochopeno už dřív, je vidět v kódu:** komentář
`calculatePipeline.js:466` říká, že správná odpověď je *„držák nesmí zajet do
úseku, který se ještě nehruboval — viz `pendingRegions` v ops/roughLong.js"*.
**`pendingRegions` v kódu NEEXISTUJE** — je jen v tom komentáři. Nikdy se
neimplementoval a gate zůstal jako náhradní řešení.

Co by to znamenalo udělat pořádně:

1. Úsekům přiřadit **blokátory**: které úseky musí být hotové, aby se do
   tohohle dal dostat nástroj VČETNĚ držáku.
2. Pořadí = topologické setřídění nad tou relací (místo dnešního třídění podle
   průměru).
3. Když úsek nemá pořadí, ve kterém by se dal obrobit, **nahlásit ho** jako
   neobrobitelný tímhle nástrojem — ne tiše zahodit dělení celého dílu.

Tím zmizí důvod, proč gate vůbec existuje, a s ním i polovina času výpočtu
(§1). Je to nejspíš tentýž kus práce jako krok 2 (oddělit generování od
hlídání), protože obojí potřebuje, aby o zahození rozhodovalo JEDNO místo
se známým důvodem.

### 2.6 ZPRAVA × ZLEVA na TÉMŽ dílu — nález uživatele 5. 9. 2026

Uživatel si všiml, že hrubování **zprava** na jeho dílu jede čistě po vrstvách,
kdežto **zleva** je „samá chyba". Změřeno na fixture
`part-23-zleva-cely-rozsah` (týž díl, týž nůž, jen `roughingSide`):

| | průchodů | úběr | řezy ve vzduchu | zbytek | kolize |
|---|---|---|---|---|---|
| **zprava** | 53 | **5 094 mm²** | **0 / 0,0 mm** | **560 mm²** | 0 / 0 |
| **zleva** | 64 | 3 900 mm² | 9 / 8,1 mm | **1 188 mm²** | 0 / 0 |

**Zleva odebere o 23 % míň a nechá 2,1× víc materiálu.** Kolize jsou v obou
směrech nulové — výsledek zleva tedy není nebezpečný, jen výrazně horší.

Pásy, kde zůstává materiál:

| | pásy |
|---|---|
| zprava | Z69–73 (1 mm), Z77–107 (21 mm), Z150–195 (10 mm) |
| zleva | Z82–109 (13), Z117–123 (2), Z144–198 (26), **Z266–331 (31 mm)** |

Ten poslední pás zprava NEEXISTUJE. A **není nedosažitelný**: s vypnutým
`respectInsertGeometry` se zleva obrobí (zbytek se tam vynuluje, i když jinde
naroste). Blokuje ho tedy HLÍDÁNÍ, ne geometrie.

**Proč zrovna zleva:** ten pás je u koníku. Zprava se k němu nůž dostane
JAKO K PRVNÍMU — cestou nic nestojí. Zleva k němu musí přejet celý díl, takže
hlídání vidí všechen dosud neodebraný materiál a vjezd zakáže. Je to přesně
ta situace, na kterou míří `pendingRegions` (§2.5): **obrobit vzdálený konec
DŘÍV**, ne až po zbytku dílu.

Ablace, které to zúžily (ať se neopakují):

| vypnuto | řezy ve vzduchu zleva |
|---|---|
| nic | 9 / 8,1 mm |
| `regionRoughing` | 9 / 8,1 mm — bez vlivu |
| `booleanRoughing` | 9 / 8,1 mm — bez vlivu |
| `plungeRoughing` | 12 / 8,6 mm — horší |
| obálka DRŽÁKU | 1 / 1,4 mm, ale úběr **3 900 → 2 887 mm²** |
| celé hlídání | 1 / 1,4 mm, ale 3 kolize / 108,9 mm² |

Obálka držáku tedy ty vzduchové řezy „dělá" jen v tom smyslu, že po jejím
ořezu vznikají dobírací průchody — vypnout ji je měřitelně horší.

### 2.7 `pendingRegions` chybějící pás NEOPRAVÍ — změřeno 5. 9. 2026

Než stavět plánovač přístupnosti (§2.5), změřilo se, jestli by vůbec pomohl na
to, co uživatel vidí. **Nepomohl by.**

**a) Pořadí úseků podle blízkosti k nájezdu místo podle průměru** (jednořádková
změna v `regions.js:281`):

| | zbytek zleva | pás Z266–331 |
|---|---|---|
| podle průměru (dnes) | 1 188 mm² | **31 mm — je tam** |
| podle blízkosti k nájezdu | 1 126 mm² | **31 mm — pořád tam** |

−62 mm² a klíčový pás beze změny.

**b) Není to držák.** Velikost držáku na ten pás nemá ŽÁDNÝ vliv:

| držák | zbytek v pásu Z266–331 |
|---|---|
| 20 × 200 mm | 596 mm² |
| 20 × 60 mm | 596 mm² |
| 20 × 25 mm | 596 mm² |
| 8 × 25 mm | 699 mm² (hůř) |
| 3 × 10 mm | 699 mm² (hůř) |

Hypotéza „držák nedosáhne přes přírubu" je tím vyvrácená.

**c) Je to hlídání DESTIČKY.** S `respectInsertGeometry = false` se ten pás
zleva obrobí (jinde ale zbytek naroste na 2 893 mm²).

**Závěr: `pendingRegions` je pořád správná věc pro pravidlo §6.0 a pro zrušení
dvojího generování (−50 % času), ale na hlavní symptom uživatele — pás
Z 266–331 neobrobený zleva — nemá vliv.** Blokuje ho mezní čára destičky, což
je otázka GEOMETRIE nástroje proti stěně, ne otázka pořadí. Žádné pořadí to
nezmění.

Další krok na tenhle symptom vede přes mezní čáru na tom kuželu (r64,5 → r21,8
přes 15 mm, tedy ~71°): ověřit, jestli je zamítnutí zleva správné, nebo jestli
je to táž třída vady jako neomezený dosah boční hrany opravený 4. 9. 2026.

### 2.8 Rozsah 📐 nerozhoduje o drahách — rozhoduje o GATU (5. 9. 2026)

Uživatel poslal dva programy TÉHOŽ dílu, které se liší JEDINÝM číslem:
`zLimits.rangeStart` 284,35 (dráhy „jdou dobře") × 385,89 („katastrofa").
Obojí se reprodukuje headless bajt po bajtu.

Rozklad na úseky je v obou **shodný** — `peakSplitZs` = Z 4,20 / 61,80 /
127,20 / 227,60. Liší se jen to, jestli plán s dělením přežije pojistku
v `calculatePipeline.js:477`:

| rangeStart | `withSplit.holder` | `without.holder` | dělení |
|---|---|---|---|
| 284,35 | 151,24 | **107,93** | **ZAHOZENO** → 51 průchodů |
| 385,89 | **167,30** | 385,66 | **PONECHÁNO** → 64 průchodů |

Rozsah tedy dráhy nezlepšuje — jen odřízne pravý konec, čímž z plánu BEZ
dělení zmizí to, co ho dělalo horším, a pojistka převáží na druhou stranu.
Všechno, co uživatel popisuje jako „dělá si to co chce", je plán S DĚLENÍM.

To je přesně ta struktura z §2.5: jedna binární metrika, spočítaná ze dvou
kompletních plánů, rozhoduje o celém dílu — a uživatel na ni nemá páku
kromě posunutí rozsahu, které s příčinou nesouvisí. Dokud pořadí úseků
neřeší dosažitelnost (`pendingRegions`), zůstane volba mezi „porušit §6.0"
a „vozit držák do stojícího materiálu" nerozhodnutelná lokálně.

### 2.9 Chybějící vrstva = kotva vjezdu na boku kužele (5. 9. 2026)

Nález uživatele „chybí mně tam jedna vrstva a úplně je vynechaná".
Změřeno na `projekt_2026-09-05 (4)`, region real Z 227,6…∞ (pravý konec,
polotovar r 21,803):

| hloubka | vydaných průchodů |
|---|---|
| r 19,545 | **0** |
| r 16,545 | 1 (Z 312,7 → 367,0) |
| r 13,545 | 1 |

Vrstva r 19,545 na mřížce existuje a materiál pod ní je (2,26 mm), takže
první skutečný záběr r 16,545 bere **5,26 mm při nastavené Hloubce (ap) 3**
— o 75 % víc, než uživatel zadal.

Příčina je v `holderEntryCapZ` (`ops/long/entryRamp.js`). Ta vrací PRVNÍ Z,
kde se vejde rampa i držák — a nic víc:

| hloubka | kotva real Z | povrch tam | rampa dosedne na | dno okna |
|---|---|---|---|---|
| r 19,545 | 263,85 | **r 46,67** (bok kužele) | **365,08** | 366,63 |
| r 16,545 | 289,35 | r 22,80 (válec) | 312,71 | 366,99 |
| r 13,545 | 289,35 | r 22,80 (válec) | 323,90 | 367,34 |

Na boku kužele je povrch 27 mm nad nožem, takže rampa pod 15° spotřebuje
**101 mm** a dosedne 1,55 mm před koncem okna. Podmínka (a) v té funkci
(`z − (top − X)/tan ≤ zFloor + 0,05`) to pustí — 1,55 > 0,05 — ale scan
z takové kotvy je zavřený (`firstOpen = false`), takže volající posun
vjezdu zahodí, interval spadne do kapsové větve, tu zamítne obálka držáku
a **hloubka vypadne celá, bez hlášení**.

Hlubší vrstvy tutéž vadu nemají náhodou: u nich `holderFitsAt` na kuželu
neprojde, takže se kotva posune až za něj na válec.

**Co s tím:** kotva vjezdu musí splňovat OBOJÍ — vejde se držák *a* po
dosednutí rampy zbývá co řezat. Dnes se druhá půlka testuje až u volajícího
(`roughLong.js`, rescan) a při neúspěchu se rezignuje místo hledání dál.
NEOPRAVENO — je to zásah do vjezdů, kde jsou dvě změřené prohry
(`project_cam-entry-holder-approach`, ENTRY_FIT_TOL), takže to chce vlastní
měřicí kolo, ne přílepek k opravě emise.

---

## 3. Proč jsou i malé opravy boj

Tohle není pocit, plyne to přímo z architektury:

1. **Nejde uvažovat lokálně.** Protože o dráze rozhoduje 42 míst se sdílenou
   mutovatelnou pamětí, nikdo neví, co změna udělá, dokud ji nepustí na všech
   28 dílech ve dvou standardech držáku. Proto v repu vůbec existuje
   `cam_fingerprint.mjs` — je to náhrada za to, že se to nedá odvodit.

2. **Zpětná vazba trvá minuty.** Otisk 45 s, sweep 2 min, sada 10 min. Jeden
   pokus = řádově čtvrthodina. Za sezení se tak vejde 10–20 pokusů, ne 200.

3. **Prahy jsou naladěné na dnešní chování.** Když je oprava věcně správná, ale
   posune výsledek, měření ji ukáže jako regresi a zamítne se. V repu je dlouhý
   seznam „ZMĚŘENO A ZAMÍTNUTO" — část z nich nejsou špatné nápady, ale správné
   věci, které v téhle architektuře **měřitelně zhorší** výsledek.

4. **Hlášky lžou.** ⚠ panel pojmenovává příznak („8 úseků neobrobeno — držák"),
   ne mechanismus (ve skutečnosti hlídání boční hrany destičky). Diagnóza podle
   hlášky vede systematicky vedle.

---

## 4. Co s tím — po krocích, každý samostatně užitečný

### ~~Krok 0 — zrušit dvojí generování~~ — NENÍ K DISPOZICI (změřeno 5. 9. 2026)

Původně jsem tenhle krok navrhl jako levnou výhru. **Byl to omyl a měření ho
vyvrátilo:** gate mění rozhodnutí na 17 z 23 dílů, takže je nosný, a zkratka
přes práh `HOLDER_INTRUSION_TOL` neušetří nic (viz §1). Levná výhra tady není —
zrychlení gate vede přes levnou `planQuality`, tedy přes krok 1.

**Poučení navíc:** první měření („6 351 → 3 367 ms") byl JEDEN vzorek za zátěže
stroje. Rozdíl mezi variantami se musí měřit **medianem z několika běhů
střídavě**, jinak se dá obhájit skoro cokoli.

> **ZMĚŘENO A ZAMÍTNUTO 5. 9. 2026 — obal zbytku ze siluety místo obdélníku.**
> Booleovský sken staví zbytek proti obdélníku `[0..planTopX] × [zMin..zMax]`,
> takže „materiál je všude" a průchody se plánují i tam, kde odlitek není
> (demonstrátor: průchody na r34,5 / r31,5 / r28,5 v pásu Z 85–93, kde je
> polotovar r16,58 — **12 až 18 mm nad materiálem**). Nahradit obdélník
> vůlí-posunutou siluetou vypadalo jako přímá oprava. **Není:**
>
> | | HEAD | se siluetou |
> |---|---|---|
> | úběr (nakreslený nůž / náhradní) | 82 975,7 / 86 908,9 mm² | 82 928,9 / 86 972,4 |
> | **kolize** | **2 / 4,9** a **0 / 0,0** | **8 / 113,4** a **7 / 116,3** |
> | zbytek na dílu uživatele | 1 188 mm² | 1 188 mm² (BEZE ZMĚNY) |
> | průchody převážně ve vzduchu | 5 | **8** |
>
> Zbytek se nezmenšil ani o milimetr, průchodů ve vzduchu přibylo a kolize
> vystřelily o **+113 mm²**. Komentář u toho obdélníku (*„proti siluetě by se
> intervaly u úzkých míst rozpadly na nesmyslné vnitřní kapsy"*) měl pravdu.
>
> **Správná páka je jinde:** ne přeplánovat zbytek, ale **nevydávat řezný pohyb
> tam, kde plánovací model materiál nemá**. Tělo průchodu to už umí
> (`airSplitAxial`); rampa, odjezd a dojezd po kontuře ne — a přesně z nich
> pochází 6 z 9 nálezů uživatele z 5. 9. 2026.

### Krok 1 — JEDEN model zbytku (1–2 dny) — ZAČÍNÁ SE TÍMHLE

Schodový model: na každé hloubce setříděný seznam Z-intervalů, aktualizovaný
přírůstkově po každém průchodu. Všechny dotazy „stojí tam materiál" přes něj.
Zruší se tím tři paralelní modely a s nimi celá třída chyb „plán × emise".

**Zisk:** řádové zrychlení (polygony jen na vstupní offset a na validátor)
a zmizí rozcházení modelů.

### Krok 2 — ROZPRACOVÁNO 5. 9. 2026: hlídání držáku podél celé dráhy

Pokus o krok 2 udělaný „zdola" — doplnit chybějící hlídání místo přepisu.
Patch `order-aware-holder-clamp.patch`.

**Co chybělo:** `holderFitAreaAlong` testuje jen VJEZD (rampu a dosednutí
špičky). Tělo a dojezd nehlídá nikdo — konec dráhy je bez ochrany. Nový
`firstHolderHitOnPath` (`ops/long/holderFit.js`) projde dráhu zákroku
(nájezd → tělo → dojezd) bod po bodu proti modelu zbytku a vrátí první místo,
kde se držák nevejde; vlastní řez se průběžně odečítá.

**Proč to dosud nevadilo:** takový průchod utnula hranice úseku od hrbu.
Hranice tedy dělaly nepřiznanou práci za hlídání — a §6.0a je ruší.

**Změřeno.** Ořez jen DOJEZDU + zahození dobrání kapsy, když se do ní držák
nevejde:

| | bez §6.0a | s §6.0a |
|---|---|---|
| kolize na dílu uživatele | 0 → 0 | **6 / 196 mm² → 1 / 1,5 mm²** |
| `cam-collision-free` | 31/31 | 7 → 6 padajících |
| úběr přes sadu | −97 mm² (−0,11 %) | — |

**Doložená mez: TĚLO A NÁJEZD SE OŘEZÁVAT NESMÍ.** První verze zkracovala
i tělo a zahazovala zákroky, u nichž držák nepustil ani nájezd — a vyrobila
9 NOVÝCH nálezů na `part-11/12/14` (Z 260,3 a Z 38,0). Důvod je strukturální:
tělo a nájezd drží řetěz (`noRetract`, `emitZEnd`, navazující
`pocketReposition`), takže jejich zkrácení posune polohu NÁSLEDUJÍCÍHO
zákroku — a ten pak najíždí odjinud, než pro co ho hlídání schválilo.
Bezpečně se dá ořezávat jen DOJEZD (za ním následuje pouze odskok) a zahodit
jen `pocketClean` (úklidový zákrok, nikdo na něj nenavazuje).

#### Dotaženo 5. 9. 2026 (druhé kolo): 6 → 2 padající fixtures

Zbylé nálezy měly JEDNU společnou příčinu, jen na třech místech: **kotva
rampy je bod UVNITŘ materiálu a najíždí se na ni rychloposuvem.** Dokud díl
dělily hranice od hrbů, takový nájezd se k tomu místu nedostal.

| kde | co bylo | výsledek |
|---|---|---|
| `pocketPass.js` — spuštění kotvy na `x + ap` | předpoklad „materiál nad ní vzala mělčí vrstva" bez §6.0a neplatí | **OPRAVENO**: spustí se nejvýš na povrch ZBYTKU (`residTopAt`) |
| `pendingRampCompletions` (`roughLong.js`) | první krok řetězu najíždí zvenčí na kotvu předchozího kroku | **ZAMÍTNUTO** (viz níž) |
| `openPass.js` — osiřelý řetěz | mezi kroky se vklínil jiný zákrok → `chainTipIs` false, přesto se jede na vnitřní kotvu | **ZAMÍTNUTO** |
| `openPass.js` — chybí mez „zákrok ≤ ap" | u 90° zanoření jeden záběr **24,6 mm** (`part-20`) | **ZAMÍTNUTO** |

**Proč tři ze čtyř zamítnuty.** Zdvih kotvy na povrch kolize opravdu odstraní
(6 → 2 padající fixtures), ale kotva NENÍ volný parametr — visí na ní řetěz:

- rampa pak sebere celý rozdíl JEDNÍM záběrem — `cam-leadout-step`: 20 mm
  při ap 5;
- posunutá kotva osiří následující `pocketReposition` — `cam-ramp-chain` na
  `holder-casting-slanted-face` (`feedFrom 44,988/126,859` × předchozí zákrok
  `41,897/165,069`).

Nepomohlo omezit zdvih na `ap` (kde je povrch výš, kotva zůstane pod ním
a rychloposuv jde skrz dál) ani vyjmout ŽIVÝ řetěz (`chainTipIs`) — rozpad je
o krok dál, protože se mění, které průchody vůbec vzniknou.

**Správné řešení: PRODLOUŽIT ŘETĚZ nahoru až na povrch po krocích ≤ ap**,
ne posouvat kotvu jednoho kroku. To je vlastní kus práce.

**PAST, na kterou jsem po cestě skočil:** povrch se musí číst v Z, kam se
kotva OPRAVDU posune, ne v tom původním. Při 15° se Z posune 3,7× víc než X
a tam už je silueta jinde — kotva pak spadne pod kůru a nájezd projede
materiálem (`part-9`: `rapid @r150.00 Z87.8 = 15,0 mm²`). Stejně tak
`residTopAt` vracející `null` (mimo polotovar) NENÍ „nula".

**Co zůstalo zelené** (`cam-collision-free` 31/31, kolize na sadě beze změny,
úběr −0,11 %): hlídání podél celé dráhy + ořez dojezdu + kapsová kotva proti
zbytku. Na dnešních fixtures to nic nezlepší — je to díra v hlídání, která
vystřelí až bez hranic od hrbů.

**Zbývá k §6.0a** (dvě různé situace + jedna strukturální):
`part-20-zleva-parting-taper` (upichovák, Z 351–352, 8 nálezů — 90° zanoření
hlídá `plungeHolderFitsAt` výškovým polem, které tunel neumí),
`holder-casting-slanted-face` (offsetový standard, 2 nálezy po 1 mm²).

A hlavně: **`range-end-leadout` ztratí 71 % úběru** (14 → 6 průchodů,
675 → 198 mm²) — bez hranic je úsek tak velký, že hlídání zakáže vjezd
a vypadnou celé hloubky (4 hloubky, 2 neobrobené úseky polotovaru). To NENÍ
díra v hlídání, ale přesně ta situace z §2.5: vzdálený konec se musí obrobit
DŘÍV. Bez pořadí podle dosažitelnosti (`pendingRegions`) §6.0a na tomhle dílu
nemůže vyjít.

### Krok 1 — POTVRZENO MĚŘENÍM 5. 9. 2026: pořadí úseků blokuje rozdíl modelů

Pořadí úseků podle dosažitelnosti je JEDEN řádek (`orderRegions`
v `ops/long/regions.js`): řadit podle `zHi` (nejblíž nájezdu první) a průměr
nechat až jako tiebreak. Změřeno na celé sadě:

| | dnešní pořadí (podle průměru) | podle dosažitelnosti |
|---|---|---|
| úběr — náhradní držák | 91 084 mm² | **91 229 mm² (+145)** |
| kolize — náhradní držák | **0 / 0,0** | **2 / 1,5 mm²** |
| díl uživatele (part-21/23) | 3 437,9 mm² | **3 494,7 (+57)** |
| díl uživatele S §6.0a | 43 průchodů / 3 062 mm² | **51 průchodů / 3 265 mm² (+203)** |

`range-end-leadout` (ztráta 71 % úběru s §6.0a) se pořadím **NEMĚNÍ**
(6 průchodů / 198 mm² v obou) — dřívější domněnka, že jde o pořadí, je tím
**vyvrácena**. Ten díl má s §6.0a 3 úseky, ne jeden; blokuje ho hlídání
držáku (4 zakázané hloubky, 2 neobrobené úseky polotovaru).

**Zbylé 2 kolize jsou obě `rapid @r42.25 Z110.8 = 0,8 mm²` na `part-1`/`part-2`**
(+ 1 nález `holder @r28.55 Z112.9 = 0,9 mm²` na part-21/23 v OFFSETOVÉM
standardu). Vypadá to jako díra v hlídání nájezdu. NENÍ. Tři hypotézy,
všechny vyvrácené měřením:

| hypotéza | výsledek |
|---|---|
| sjezd v X se testuje ZÚŽENOU stopou → zkusit plnou (`emitDescendX`) | **beze změny** |
| hlídání testuje ÚHLOPŘÍČKU, stroj jede do L → testovat obě nohy zvlášť | **beze změny** |
| přejezd v Z se testuje zúženou stopou → zkusit plnou (`safeRapidTo`) | **beze změny** |

Emise v tom místě **žádné vnoření nevidí** (`rapidStock`, práh 0,5 mm²),
validátor tam měří 0,8 mm². Je to tedy ROZDÍL DVOU MODELŮ zbytku, ne chybějící
test — přesně to, co má odstranit **krok 1 (jeden model zbytku)** níž. Dokud
oba modely nesouhlasí, je hledání jednotlivých nálezů hádání: každá hypotéza
stojí jedno plné měřicí kolo a všechny tři výše skončily na nule.

**Závěr: pořadí úseků je hotové a měřitelně přínosné, ale nasadit ho nejde
před krokem 1.**

### Krok 2 (původní záměr) — oddělit generování od hlídání (2–3 dny)

Generátor vydá **kandidáty**; jediná funkce `applyGuards(passes)` rozhodne
o zkrácení/zahození a ke každému průchodu zapíše **důvod**. Otázka „proč tam
ten průchod není" se stane vyhledáním, ne bisekcí. ⚠ panel bude pravdivý zadarmo.

### Krok 3 — vjezdy jako strategie (1–2 dny)

`PlungeEntry`, `RampEntry`, `ContourLeadIn` — každá s `canEnter()` a `build()`.
Dvanáctičlenné podmínky se rozpadnou a přidání případu přestane být zásah do
sdíleného výrazu.

### Co se NESMÍ ztratit

V komentářích je několik set řádků draze zaplacené znalosti (naměřené meze,
zamítnuté varianty, reálné nálezy na dílech). Při přepisu je musí převzít
**testy**, ne smazat. `docs/cam-pravidla-drah.md` je na to připravený — je to
seznam podmínek, které mají platit bez ohledu na implementaci.

---

## 5. Odhad a upřímná poznámka

Kroky 0–3 jsou dohromady **zhruba týden až dva soustředěné práce** a jsou to
přepisy jádra hrubování, ne kosmetika. Riziko je reálné.

Alternativa je pokračovat ladit současný stav. Ta cesta funguje — za poslední
týden se takhle opravilo deset konkrétních vad — ale každá další stojí zhruba
stejně a **počet míst, kde to může selhat, neklesá**.

Levný vstup do toho **není** — krok 0 měření vyvrátilo. Nejmenší smysluplný
kus je krok 1 (jeden model zbytku), protože z něj plyne obojí naráz: zlevní
`planQuality` (a tím i těch 50 % času, co dnes žere gate) a zruší rozcházení
plánu s emisí.
