# CAM — pravidla generování drah

Sesbíráno z kódu, CHANGELOGu a uzavřených plánů (28. 8. 2026). **Nejsou to nová
pravidla** — je to soupis toho, co generátor dnes dělá a proč, na jednom místě.

**K čemu to je.** Otisk (`scripts/cam_fingerprint.mjs`) řekne, že se něco hnulo.
Neřekne, jestli správně. Tenhle dokument je ten druhý díl: seznam podmínek,
proti kterému se dá změna odškrtat.

**Tvar plátku má vlastní soubor.** Rozhodnutí, která se liší podle tvaru
destičky, patří do `js/calculators/cam/inserts/*.js`; sdílený kód se ptá
`getInsert(prms)`, **nikdy `prms.toolShape`**. Co je vytažené, kdo se na to
ptá a co se ještě může plést do jiných plátků, je v
`docs/cam-tvar-platku-v-generatoru.md`.

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
| **…ale JEN ZA MĚLČÍ, nikdy za hlubší.** Hloubková posloupnost musí zůstat monotónní i po přeskupení. Kotvy ramp se hledají proti modelu zbytku v POŘADÍ PLÁNOVÁNÍ — přeskočí-li odložená skupina hlubší vrstvu, kotva té vrstvy sedí na materiálu, který teprve zmizí, a sjezd k ní se prořeže plným kusem KOLMO DOLŮ (§3.1 to zakazuje). Nález 2. 9. 2026: pořadí 9,8 → 6,8 → 18,8 → 15,8 → 12,8 a `N160 G1 X12.783` = 11,8 mm radiálně do plného. | `ops/roughLong.js` (vkládání `tail`) |
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

**TÉŽ PRAVIDLO PLATÍ PRO KAPSU** (`ops/long/pocketPass.js`): kapsový průchod,
který nemá ani rampu (`stockEntryRamp` vrátil null), ani NEPRÁZDNÝ nájezd po
kontuře, se nevydá. `traceOffsetPath` umí vrátit prázdné pole a to se dosud
přiřadilo stejně — jenže `[]` je v JS pravdivé, takže průchod dál vypadal jako
„kapsa po kontuře", emise nenašla žádný segment, spadla na `{x: pass.x,
z: pass.zStart}` a sjela na hloubku RADIÁLNĚ. Nález uživatele 1. 9. 2026:
`N2020 G1 X31.545 F0.25` (6,4 mm radiálně kvůli pásu 1,45 mm) a `N3010 G1
X19.545 F0.25` (4,2 mm kvůli 0,66 mm) — *„ty dráhy tu vůbec nemají co dělat,
jsou to chyby"*. Hlásí se jako „do kapsy nevede ani rampa, ani nájezd".

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

**A JE TO VIDĚT V ⚠ PANELU** — *„Zanořování: N vrstev vynecháno…"*. Tiché
zahazování průchodů je v tomhle generátoru opakovaná past (`holderClampZEnd`
takhle na `part-13-zleva-flange` nechal zmizet 17 průchodů celé pravé strany
a v panelu nebylo ani slovo), takže každá vrstva, která padne kvůli tomuhle
pravidlu, se počítá a hlásí.

Pravidlo se NEVZTAHUJE na svislé zanoření (90°, typicky upichovák): tam žádná
rampa neexistuje (`plungeDirL.uz = 0`) a kolmý zápich je vlastní provoz plátku
— řídí ho dál `plungeHolderFitsAt` (§6.1, rozhodnutí 26. 8. 2026). Blok se
taky nespustí bez `orderAwareHolder`, protože bez něj se vjezd vůbec
neposouvá; tam platí bez rozdílu brána o řádek níž.

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

**VÝJIMKA: ZAČÁTEK, KTERÝ POSUNUL DOJEZD — opraveno 9. 9. 2026.** Pravidlo
„prázdný nájezd = vynechat vrstvu“ platí jen tam, kde nájezd chybí kvůli
GEOMETRII. Je ale ještě druhá cesta, jak zůstat s prázdnem v ruce, a ta
o vrstvě nic neříká:

1. Dojezd MĚLČÍHO průchodu („bez schodků“) sleduje konturu dál za konec
   svého intervalu a kus NÁSLEDUJÍCÍHO intervalu tím na téže hloubce už
   obrobí. `ops/long/openPass.js` proto tomu intervalu posune začátek dolů
   (`q.zStart = coverLo`) — správně, ten kus je hotový.
2. Jenže nový `zStart` **už neleží na kontuře**. Kontura v něm může být
   dávno POD hloubkou vrstvy (na dílu uživatele o 4,3 mm).
3. `traceOffsetPath(zGapHi, iv.zStart)` tedy vede pod vrstvu,
   `clipLeadInToDepth` z něj nenechá nic — a vrstva se zahodila celá.

Nález uživatele 8. 9. 2026 (kulatá R 5, ap 2,5, podélně zprava, odlitek):
vrstva **r 32,045 v pásu Z 45,5…19,8 nevzala nic** a materiál po ní sebrala
až r 29,545 — **jednou třískou 5,00 mm, tedy 2× ap**. Pravidlo uživatele je
přitom jednoznačné: *materiál se má dál brát, jen žádná vrstva nesmí ukrojit
2× ap* — vrstvu tedy ROZDĚLIT, ne vynechat.

Trasa nájezdu se proto u TAKTO POSUNUTÉHO intervalu (značka
`leadOutCoveredTo`) zkrátí na poslední Z, kde je kontura ještě na hloubce
vrstvy (`contourTouchZ`, bisekce nad `offsetXAt`). Nástroj po ní sjede na
hloubku a tělo průchodu pokračuje odtud dolů — **přesně týmž tvarem, jakým
o vrstvu níž jede r 29,545**. Nikde se nezanořuje kolmo, takže §3.1 zůstává
v platnosti.

| měřítko (díl uživatele) | před | po |
|---|---|---|
| největší tříska | **5,00 mm** (2× ap) | **2,52 mm** |
| třísky nad `ap` | 2 | **0** |
| úběr | 5 002,2 mm² | 5 002,3 mm² |
| tvrdé kolize (syrová / offset) | 4 / 2 | 4 / 2 (tytéž, pre-existující) |
| průchody | 78 | 80 |
| duplicitní dvojice bodů | 42 | 53 |

Duplicity jsou cena, ne vada: nová trasa vede po témže kusu kontury jako
dojezd, který interval zkrátil, a `makeChainRegistry` ji NEZAHAZUJE — u
nájezdu bez rampy je zahození celé trasy zakázané (§6.2, spadl by na kolmý
zápich). Za −2,48 mm třísky to stojí +56 mm jízdy v už vyříznutém prostoru.

> **DVĚ PODMÍNKY, BEZ KTERÝCH TO NEFUNGUJE — obojí změřeno 9. 9. 2026.**
>
> 1. **Jen u intervalu se značkou `leadOutCoveredTo`.** Bez toho (tedy
>    „zkracuj trasu vždycky, když vyjde prázdná“) se pravidlo chytlo i tam,
>    kde nájezd chybí právem: `part-20-zleva-parting-taper` −395,7 mm²
>    úběru, `part-18-parting-90-ramp` přepsané dráhy.
> 2. **Nikdy u UPICHOVÁKU.** `contourTouchZ` hledá bod, kde je na hloubce
>    vrstvy ŠPIČKA; upichovák ale řeže celou spodní hranou šířky `b`, takže
>    jeho tělo tam ještě leží ve stěně. Sken si kvůli tomu odsouvá začátek
>    intervalu o `partingBodyZ` (`clampPartingBody`) a zkrácený nájezd by
>    ten odsun obešel: na `part-20-zleva-parting-taper` zajel obrys plátku
>    **0,153 mm² do HOTOVÉHO dílu** na X 40,545 Z 133,426 (práh 0,05,
>    `tests/cam-parting-body-gouge`). Kolize to nebyla a otisk to ukázal
>    jen jako „jiné dráhy“ — chytila to až plná sada.
>
> S obojím je **OTISK VŠECH 29 FIXTURES SHODNÝ** — pravidlo se na sadě
> neprojeví vůbec a mění jen díly, kde ta situace nastane.

> **VYVRÁCENÁ DIAGNÓZA z předávky 8. 9. 2026:** *„není to `noEntrySkips`,
> ten hlásí 2 vrstvy, ale obě na r 44,545“*. **Je to `noEntrySkips`.**
> `roughLong` běží na jedno `calculate()` DVAKRÁT a pokaždé s jiným
> dělením na úseky (7 × 3 regiony); v prvním běhu se průchod vytvoří,
> v druhém — tom, který se emituje — padne. Kdo počítá hlášení z prvního
> běhu, vidí jiné dvě vrstvy než ty, které skutečně zmizely.

### 3.2 Úhel zanoření podle tvaru plátku — UZAVŘENO 26. 8. 2026

| plátek | úhel | proč |
|---|---|---|
| **upichovací** | 90° (kolmo) | spodní hrana JE obráběcí hrana; kolmý zápich je jeho normální provoz |
| **kulatý** | 45° | kolmo by bral celým plátkem |
| **polygon** | podle spodní hrany — podélně `|natočení|`, čelně `|natočení + vrchol − 90|`, u pozitivní plátky navíc omezeno hřbetem α | |

`camMath.js:12` (`getEffectivePlungeAngle`). **Neotvírat bez nového nápadu.**

**Ten úhel je zároveň MEZNÍ ČÁRA** (7. 9. 2026). U polygonu vede čára
`'zanoreni'` odjakživa pod `|natočení|` — což je TÝŽ úhel, jaký vrací
`getEffectivePlungeAngle`, jen se tam bral z tvaru destičky. Kulatá destička
tvar nemá (`getToolClearanceRange` pro ni vrací `null`, takže jí nevznikla ani
jedna čára), a přesto totéž omezení má. `getPlungeGuardRange`
(`contourBuild.js`) proto z pole **„Úhel zanoření (°)"** postaví týž úhlový
rozsah, jaký polygon dostává ze svého tvaru, jen JEDNOSTRANNÝ:

| | `'dojezd'` (čelní hrana) | `'zanoreni'` (sjezd) |
|---|---|---|
| **polygon** | ano, pod `natočení + vrchol` | ano, pod `natočení` |
| **kulatá** | **ne** — čelní hranu nemá (rozhodnutí uživatele) | ano, pod **Úhlem zanoření** |

**Čára kulaté destičky je HRANICE, ne ŘEZ.** Do `buildMachinableContour` se
NEPOSÍLÁ (`plungeLimit: true`): u polygonu most nahrazuje úsek, kam se hrot
NEDOSTANE, ale kulatý nos se na tutéž stěnu dostane — jen se k ní nesjede
rampou. Přemostit ji by umazalo materiál, který nástroj vzít umí. Ověřeno
otiskem: na 28 fixtures se program nezměnil.

**Na DĚLENÍ ÚSEKŮ se ale počítá** (`guideStaysInStock`, `ops/long/regions.js`).
Nejdřív tu byla přeskakovaná; uživatel to 8. 9. 2026 opravil — pravidlo
*„dělí jen čára, co VYJEDE z polotovaru"* je jedno pro všechny plátky.
Zároveň se opravil jeho opačný konec: **není-li v ústí údolí ŽÁDNÁ čára,
nic tam dosah neomezuje, takže hranice NEPLATÍ.** Dokud se vracelo `found`,
znamenala nepřítomnost čáry pravý opak. U polygonu to nebylo vidět (při
úhlu zanoření 15° čára v ústí skoro vždycky je), kulatá při 45° žádnou
nevydá — a konec dílu se jí proto rozpadl na dva úseky, ačkoli polygon
tentýž tvar bere vcelku a mezeru přeletí rychloposuvem.

Změřeno na `part-22-round-r10` (ústí Z 31,9…52,5): úseky 4 → 3, průchodů
61 → 59, úběr 4 865,8 → 4 804,7 mm², zajetí do kontury 0, tvrdé kolize 0.
Otisk: změnil se JEN tenhle díl. Cena je 2 nové nálezy v pesimistickém
offsetovém standardu (rapid @r40,10 = 2× 1,47 mm²) — přejezd v Z na řezné
hloubce, tedy táž otevřená věc jako u `safeRapidTo` níž.

### 3.2b Dojezd na hranu materiálu stojí „vůle + RÁDIUS NOSU"

Rychloposuv se před hranou materiálu zastaví o `rapidStopZ = Vůle Z + R`
a zbytek se dojede POSUVEM („bezpečný dotek", `ops/roughEmit.js`). Je to
geometricky správně — nos se hranou dotkne, až když jeho střed dojede o R
blíž — ale s velkým rádiusem to dominuje programu:

| | polygon R 0,8 | kulatá R 10 |
|---|---|---|
| pohybů posuvem jedoucích vzduchem | 17 | **47** |
| celkem | **26,5 mm** | **457,7 mm** |
| na jeden průchod | ~2 mm | **~11 mm** |

Uživatel to 8. 9. 2026 nahlásil jako *„teď to přejíždí všechno posuvem"*
(u polygonu se tentýž vzduch přeletí rychloposuvem). **OTEVŘENÉ.** Pozor
při opravě: část těch 11 mm je SKUTEČNÝ ZÁBĚR (nos se do stěny zavaluje
postupně), ne vzduch — měřítko „dno nosu vs. obrys na Z středu" to
nadhodnocuje. Bezpečná cesta je rozsekat i ten dojezd přes
`airSplitAxial`, ne zkrátit `rapidStopZ`: to by pustilo rychloposuv na
stěnu.

---

### 3.2c SJEZD NA HLOUBKU JDE POD ÚHLEM ZANOŘENÍ — VŠUDE (9. 9. 2026)

Poslední kousek příjezdu na hloubku se dojíždí POSUVEM a je dlouhý
`rapidStopX = Vůle X + R`. U plátku s `rampedApproach` (kulatá destička) se
nesjíždí radiálně, ale ŠIKMO pod úhlem zanoření: nástroj couvne v Z
o `dx/tg(úhel)` PROTI směru řezu (do už obrobeného) a odtud dojede
diagonálou přesně na cíl (`emitFeedToDepth` v `gcodeEmit.js`). Cíl se nemění,
mění se jen cesta k němu.

**DÍRA V TOM PRAVIDLE — opravená 9. 9. 2026** (nález uživatele: *„zanořování
ani jednou neudělalo to, co by mělo, a není dodrženo, že se má zanořovat pod
úhlem 45 stupňů“*): **`safeRapidTo` si sjezd emitovala SAMA.** Její větev
„diagonální sjezd k materiálu“ vydávala rovnou `G1 X…` a `emitFeedToDepth`
úplně minula — a přitom tudy chodí většina vjezdů do kapsy. Na dílu uživatele
to bylo PĚT svislých zápichů, z toho dva po **6,000 mm** (`N3340 G1 X22.388`,
`N4730 G1 X19.911`), tedy přesně `Vůle X + R` u R 5.

| díl uživatele (kulatá R 5, ap 2,5, 45°) | před | po |
|---|---|---|
| řezy strmější než 45° | 39 | **32** |
| z toho hlubší než 1 mm | 15 | **8** |
| svislé (90°) řezy | 18 | **11** — šest z nich pod 0,02 mm (µm doklepnutí konce nájezdu, ne zápich) |
| úběr / největší tříska / zajetí do kontury | 5 002,3 mm² / 2,52 mm / 0 | **beze změny** |
| tvrdé kolize (syrová / offset) | 4 / 2 | **beze změny** |

Na sadě se hne JEDINÁ fixture (`part-22-round-r10`, +1 řádek — poloha jednoho
rychloposuvu) a `cam_sweep` hlásí **0 změn v úběru i kolizích**.

#### Zbylých pět svislých sjezdů a proč tam zůstávají

| kde | hloubka | proč nejde šikmo |
|---|---|---|
| Z 201,348 a Z 198,848 | 2,000 mm | couvnutí i diagonála vjedou DRŽÁKEM do materiálu (týž kořen jako čtyři tvrdé kolize držáku na tomhle dílu) |
| Z −5,49 / −5,50 (3×) | 3,495 mm | průchod je na konci dílu dlouhý jen **2,51 mm**, rampa u R 5 potřebuje **3,495 mm** |

> **DVĚ VARIANTY, JAK TO PŘESTO SJET — ZMĚŘENO A ZAMÍTNUTO 9. 9. 2026.**
> Obě řeší úhel, obě porušují něco důležitějšího:
>
> | pokus | co udělal |
> |---|---|
> | couvnout na DRUHOU stranu (za konec dílu) a šikmo zpátky | nástroj přejede týž kousek TŘIKRÁT a rampy stojí přímo pod sebou — reálná stížnost uživatele (*„vidíš to, že to je přímo pod sebou“*) |
> | rampovat DOPŘEDU, do řezu | za rampou zůstane klín; příští vrstva ho vezme JEDNOU TŘÍSKOU **3,91 mm** (ap 2,5) a přibude tvrdá kolize rychloposuvu **2,3 mm²** |
> | totéž, ale rampovat jen ŘEZNOU část sjezdu (vzduchová vůle nahoře svisle) | tříska **3,16 mm**, kolize **1,1 mm²** — klín se jen zmenšil, nezmizel |
>
> `ap` je vyslovená podmínka uživatele; porušená podmínka opravu ruší, i když
> jinak vypadá líp (viz i §6.1). Radiální sjezd tam proto zůstává.

> **POLYGON NENÍ LEPŠÍ VZOR — změřeno 9. 9. 2026.** Uživatel navrhl
> inspirovat se polygonem (*„tam je to dobré to zanořování“*). Týž díl
> s polygonem R 0,8 má ale **12 svislých sjezdů**, většinu přesně
> **1,800 mm** = `Vůle X + R` — je to TÝŽ kód a týž radiální sjezd, jen
> osmkrát kratší, takže na plátně není vidět. Kulatá destička je po téhle
> opravě na tom LÍP než polygon (5 skutečných svislých sjezdů proti 12).

---

### 3.2d POLE „ÚHEL ZANOŘENÍ (°)" MĚNÍ I MEZNÍ ČÁRU (10. 9. 2026)

Mez zanoření se u polygonu brala VÝHRADNĚ z geometrie plátku. Když si
uživatel v „Hlídání geometrie" přepnul úhel na 5°, dráhy sice rampovaly pod
5° (`getEffectivePlungeAngle`), ale ČÁRA zůstala na 15° — dvě různá čísla pro
tutéž mez. Nález uživatele: *„ať to mění i tu čáru a ne ať je tam pořád těch
15 stupňů"*.

Bere se **PŘÍSNĚJŠÍ z obou** (`tightenByPlungeAngle` v `contourBuild.js`):
ručně zadaný MENŠÍ úhel nástroj opravdu víc omezuje, větší než co dovolí tvar
plátku nepřidá nic. Úhel vydané čáry jde přes `plungeBetaDeg`, ať se kreslí
tam, kam hlídání dosáhne.

| polygon, díl uživatele, úhel 10° | před | po |
|---|---|---|
| řezy strmější než zadaných 10° | **19** | **8** |
| doslovné duplicity (táž dvojice bodů) | 1 | **0** |
| řezné pohyby bez úbytku | 106 (279 mm) | 96 (243 mm) |
| kolize / zajetí do kontury | 0 / 0 | **0 / 0** |
| úběr | 4 545,3 | 4 507,8 mm² |

**Otisk celé sady je SHODNÝ** — fixtures mají buď `entryAngleAuto`, nebo
`entryAngle` rovný |natočení|, nebo úhel VĚTŠÍ (`part-19-face-tilted-insert`:
45° proti natočení −15°), takže se jich přísnější mez netýká.

> **KTERÁ HRANICE ROZSAHU JE ZANOŘENÍ — TA DÁL OD NULY.** Rozsah normál je
> `bisector ± halfRange`, u polygonu `[natočení + vrchol − 90°, natočení +
> 90°]`. Mez ZANOŘENÍ je ta vzdálenější (`|natočení| + 90°`) — týž tvar, jaký
> má kulatá v `getPlungeGuardRange`. Ta bližší je DOJEZD (čelní hrana).
> Posunul jsem nejdřív tu špatnou: rozsah se **rozšířil** místo zúžení,
> hlídání pustilo víc a dráhy **zajely 4,11 mm² do hotového dílu** (na `HEAD`
> 0,00). Menší úhel musí rozsah ZÚŽIT — když po zásahu `halfRange` vzroste,
> je to obráceně.

---

### 3.3 Kapsa za bossem

Interval, do kterého se zprava vjet nedá, se obsluhuje jen se **zapnutým
Zanořováním**: vede se k němu sledováním kontury (G1/G2/G3) a rampou pod úhlem
zanoření. Bez zanořování se vynechá (`ops/long/pocketPass.js`).

Úzká kapsa (užší než upichovací plátek) se přeskočí a hlásí se to.

---

## 4. Meze hlídání

### 4.1 Destička

- **HLOUBKA (ap) SE MĚŘÍ OD BŘITU, NE OD PROGRAMOVANÉHO BODU** (7. 9. 2026).
  Hloubky průchodů jsou v souřadnicích DRÁHY (střed nosu), silueta polotovaru
  v souřadnicích POVRCHU — liší se přesně o rádius nosu. U polygonu
  (R 0,4–1,2) je to pod rozlišením, u KULATÉ destičky R 10 brala první tříska
  `ap + R`: na válci r 50 při ap 2,5 vyšel první průchod na X 49,25, tedy břit
  na r 39,25 → **10,75 mm místo 2,5**. Klíč je `noseLiftX` v `cam/inserts/`
  (R u kulaté, **0 u ostatních**, aby se jejich mřížka nepohnula) a musí sedět
  na TŘECH místech:
  1. kotva posloupnosti (`ladderTopX` v `ops/roughLong.js`),
  2. `stockZRangeAt` — „sahá sem polotovar?" se ptá na hloubku břitu,
  3. strop obdélníkového obalu booleovské větve (`planTopX` do
     `makeIntervalScan`) **a** `stockCrossingsAt`, které hledá vjezd.

  Bez bodu 3 se opraví jen válec: na odlitku začaly průchody 24,5 / 27,0 /
  29,5 až na kuželu a přes válec r 21,803 se pak přejelo JEDINÝM průchodem —
  tříska 9,76 mm (`N1310 G1 Z251.257`). Měřeno tloušťkou třísky z modelu
  úběru, ne rozestupem drah.

  > **ZBÝVÁ (změřeno a odloženo 8. 9. 2026):** týž člen patří i do
  > `offsetStockTopXAtZ`, ze které se staví KOTVA RAMPY. Bez něj sedí kotva na
  > povrchu, břit je hned na dně a řetěz nemá kam sestupovat — kapsa Z 167…196
  > (9,6 mm materiálu) dostane jediný průchod. S opravou: průchodů 61 → 71,
  > úběr 4 865,8 → 5 051,2 mm², největší tříska 9,00 → 7,60 mm. **Ale přibude
  > tvrdá kolize:** `G0 Z` z konce průchodu 63 (r 42,97, Z −3 → 30) projede
  > 4,25 mm² stojícího materiálu, a to i proti modelu se znalostí pořadí —
  > není to tedy stín vlastního řezu.
  >
  > **VYVRÁCENÁ HYPOTÉZA (8. 9. 2026):** nezpůsobuje to `noteCutPass`.
  > Vypadalo to na něj — předpovídá odebraný pás ROVNOU ÚSEČKOU `zStart→zEnd`
  > na `bodyX`, kdežto konec toho průchodu jede po oblouku jinam, takže by
  > model mohl hlásit vzduch tam, kde materiál stojí. Změřeno vypnutím té
  > předpovědi (skutečné řezy si model zapisuje dál přes
  > `noteCutMove`/`noteCutArc`): **kolize zůstala beze změny 4,25 mm²** a
  > navíc se objevila tříska 47,6 mm — ta předpověď je nosná, ne škodlivá.
  >
  > **DOHLEDÁNO 8. 9. 2026 — KOTVU BLOKUJE JINÁ, ZÁVAŽNĚJŠÍ VADA.**
  > Emituje to `safeRapidTo`, větev `sameX` (`gcodeEmit.js`, volání
  > `roughEmit.js:461` = čistý přejezd v Z na SOUČASNÉ hloubce). Hlídání je
  > tam umístěné i parametrizované správně — `rapidHitsStock(cur.x, cur.z,
  > cur.x, tz)` — jen dostane špatnou odpověď, protože model zbytku je v pásu
  > Z 13…25 posazený až o 7,7 mm níž než skutečnost (na Z 19: model r 26,15
  > × skutečnost r 33,87; nos má dno na 32,97).
  >
  > **Proč je model níž:** `noteCutArc` vzorkuje oblouk od `seg.startAngle`,
  > tedy od PŮVODNÍHO začátku, a zapíše i hlavu oblouku, kterou nástroj
  > neprojel. Jenže to je jen následek — příčina je, že se ten `G3` vůbec
  > vydá ze špatného místa:
  >
  > ```
  > N3690 G1 Z35.032            ← nástroj na (37,446; 35,032)
  > N3700 G3 X40.966 Z9.503 CR=20.545
  >     střed oblouku (20,421; 9,511), r = 20,545
  >     vzdálenost startu od středu = 30,679  →  START LEŽÍ 10,1 mm MIMO OBLOUK
  > ```
  >
  > Takový blok řízení interpretuje jako úplně jinou křivku, než je zamýšlená.
  > **Tohle je vada G-kódu, ne jen modelu**, a je vážnější než nezvednutá
  > kotva — opravovat se má ona, ne hlídání kolem ní.
  >
  > **Změřeno a ZAMÍTNUTO cestou:** (a) vypnutí předpovědi pásu v
  > `noteCutPass` — kolize beze změny 4,25 mm² a navíc tříska 47,6 mm, ta
  > předpověď je nosná; (b) oprava `noteCutArc` na vzorkování od skutečné
  > polohy — kolizi neřeší (start na oblouku NELEŽÍ, takže se použije
  > záložní `startAngle`) a na `part-20-zleva-parting-taper` snížila zdvih
  > 35,310 → 32,770, tedy do NEBEZPEČNÉ strany.
  >
  > Kotva zůstává nezvednutá, dokud se nespraví ten start oblouku.
- **RAMPA SE TESTUJE PROTI KONTUŘE PO CELÉ DÉLCE**, ne jen v dosedacím bodě
  (`rampClearOfContour` v `ops/long/entryRamp.js`). `stockEntryRamp`
  i `findRampOutTarget` si přímku samy konstruují, a proto se cestou ptají
  `blockedAt`; uzavírací krok řetězu ji ale jen DOPOČÍTÁ z kotvy a hloubky —
  a ptal se leda na dosedací bod, ve větvi s intervalem ze `scan` na nic.
  Nález 7. 9. 2026 (kulatá R 10): `Rampa 45.0°` z (35,77; 52,53) na
  (29,64; 46,40) jela celou délkou pod offsetem kontury a ukrojila
  **36,8 mm²** hotového dílu; kotva sama ležela 1,4 mm pod offsetem, protože
  v tom místě je vnitřní rádius menší než nos. Hlídá
  `part-22-round-r10.camprog` v `tests/cam-gouge-invariants` (bez opravy
  42,0 mm², s ní 0).
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
- **ODSKOK POD 45° SE TESTUJE PROTI KONTUŘE** (`retractHitsContour`
  v `ops/roughEmit.js`). Míří na obrobenou stranu, takže tam obvykle nic
  není — jenže couvne i za ZAČÁTEK průchodu, a tam může stát MEZNÍ ČÁRA
  plátku (stín břitu vložený `buildMachinableContour` místo nedosažitelného
  rohu). Nález uživatele 1. 9. 2026 (podélně ZLEVA): `N2040 G1 X33.545
  Z143.293` a `N3030 G1 X21.545 Z80.919` zajely **4,85 mm pod konturu** —
  průchod stojí na r 31,5, kontura tam vystoupá na r 38,2.
  Když by diagonála podjela, vyjede se SVISLE v X (zpátky do vlastní stopy).
  Čelní strategie tenhle test měla odjakživa; podélná ne. Stojí to 0 mm²
  úběru u nakresleného nože a −11,0 mm² u náhradního držáku — a to jsou právě
  ty odřezky z hotové kontury. Hlídá `part-21-zleva-insert-shadow.camprog`
  v `tests/cam-gouge-invariants` (bez opravy 4,85 mm, s ní 0).

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

| místo | co podle něj rozhoduje | stav |
|---|---|---|
| `ops/roughLong.js` `maxStockX` | od jaké hloubky vůbec začínají vrstvy | **otevřené** (mřížka je kotvená na kůře, skim ji dorovnává na `planTopX`) |
| `ops/roughLong.js` `stockZRangeAt` | **Z-okno řezu = KDE PRŮCHOD KONČÍ** | **HOTOVO 11. 9. 2026** — viz §5.2 |
| `ops/long/intervalScan.js` `getResidualLoops` | Z-rozpětí booleovského obalu zbytku | **HOTOVO 11. 9. 2026** — viz §5.2 |
| `ops/roughLong.js` `_stockLoopSpanMemo` | rozpětí pro kapsový span | **otevřené** |
| `ops/roughLong.js` `cylStockZ` | `traceFloorL` — dno pro sledování obrysu | **otevřené** |
| `ops/long/regions.js` `regionSplits` | kde jsou údolí = hranice ÚSEKŮ | **otevřené** (je to „kde dělit", ne „kde končit") |
| `gcodeEmit.js:162` | `rapidStock` = model ze SYROVÉ smyčky; plánovací `rapidStockPlan` je vedle něj samostatně | záměrná dvojice |

**Pozor při opravě:** jde o ZMĚNU DRAH, ne refaktor — vrstvy začnou o Vůli X
výš a Z-okno bude o Vůli Z širší. Měřit otiskem i sweepem.

### 5.2 Dno průchodu (`effZMin`) — sjednoceno 11. 9. 2026

Do 11. 9. 2026 odpovídaly na otázku **„kde má dráha skončit"** DVĚ nezávislé
logiky s různým modelem polotovaru:

1. **Plán** — `stockZRangeAt` v `ops/roughLong.js` četl SYROVÝ řetěz
   (`hIntersect(stockPathSegments)`) a z něj stavěl `effZMin`, tedy dno
   průchodu. Booleovský obal zbytku (`getResidualLoops`) bral Z-rozpětí
   rovněž ze syrové smyčky, i když jeho X-mez (`planTopX`) už offsetová byla.
2. **Emise** — `offsetExitZ` v `gcodeEmit.js` ten rozdíl dorovnávala až
   dodatečně: konec řezu prodloužila na offsetovou čáru, ale jen v okně
   **4× Přídavek**.

Na hraně skoro rovnoběžné s osou Z okno nestačí — kolmý posun o Vůli se podél
Z natáhne 1/sin(sklon). Reálný nález (díl uživatele 11. 9. 2026, oblouk R18,
Vůle 1 mm): `N1580 G1 Z119.340` místo Z 116,835, tedy **2,5 mm** stojícího
materiálu před tečkovanou čarou. Na sousední hloubce, kde vzdálenost vyšla
1,6 mm, se dráha do okna vešla a na čáru dojela — proto to vypadalo náhodně.

**Platí jediná logika: dno průchodu se měří na VŮLÍ-POSUNUTÉ siluetě.**
Prodloužení v emisi zůstává jako pojistka pro konec zkrácený dosahem nosu
(`airSplitAxial` pracuje na hloubce `x − R`), ale **nesmí přejet `pass.zEnd`** —
bez toho stropu se odsazení „ještě o Vůli Z" přičítalo i tam, kde průchod na
čáře už stál, a výjezd ji přejel o celou Vůli Z (naměřeno 1,000 mm).

Změřeno na 29 fixtures (`cam_fingerprint` + `cam_sweep`): otisk se hnul u 23,
úběr **+349,6 mm²** (nakreslený nůž) / **+182,9 mm²** (náhradní držák),
**kolize beze změny** (7 / 121,3 mm², resp. 0 / 0,0).

> **Doplněk 1. 9. 2026 — nejde jen o „syrový × offsetový" obrys.** Kotva
> zanoření (`stockEntryRamp`) používala offsetovou čáru správně, a přesto
> vyráběla 44mm rampy: offsetová čára je pořád obrys PŮVODNÍHO odlitku a neví
> nic o tom, co mělčí vrstvy už odebraly. Správná mez pro kotvu je **povrch
> ZBYTKU** — tedy nižší z offsetové čáry a už vyříznuté podlahy
> (`cutFloorTab`). Tatáž otázka platí i pro `rapidStopXAt`: kde se rychloposuv
> zastaví před sjezdem na hloubku (na dílu uživatele to dělalo rozdíl
> X 20,550 proti X 17,740, tedy 2,8 mm sjezdu posuvem navíc).

---

### 5.3 Hloubková mřížka je PER ÚSEK (11. 9. 2026)

> **Každý úsek bere `ap` od SVÉHO nejvyššího průměru.** Kotvou je offsetová
> čára toho úseku, ne největší průměr celého dílu.

Do 11. 9. 2026 byl žebřík hloubek **jeden pro celý díl**, kotvený na
`maxStockX` (+ skim vrstvy k offsetové čáře). Úsek, jehož vlastní vrch leží
níž, pak dostal první vrstvu tak silnou, jak zrovna padla globální mřížka —
od plného `ap` po **nic**:

| díl uživatele, levý úsek | |
|---|---|
| polotovar r | 38,566 |
| offsetová čára | 39,566 |
| první hloubka z globální mřížky | 39,545 |
| **tříska** | **0,021 mm** — *„lízne kvůli tomu jenom tu vrchní dráhu"* |

Druhý příznak téhož: hloubky se mezi úseky opakovaly (`X47.045` v prvním
i druhém úseku), protože mřížka byla jedna.

**Jak to je teď** (`buildDepths` v `ops/roughLong.js`):
- `depthsAll` = původní globální žebřík, **jen pro detekci ÚSEKŮ**
  (`regions.js` se ptá „vzal by tenhle split na některé hloubce něco?").
  Zůstal bitově stejný schválně — dělení dílu na úseky se měnit nemělo.
- Uvnitř smyčky úseků se staví **vlastní žebřík** od `loopTopXIn` — vrchu
  OFFSETOVÉ smyčky v Z-okně toho úseku. Mřížka jde po přesných `ap` a skim
  vrstva degeneruje na nulu (kotva už NA offsetové čáře leží).

**Změřeno na 29 fixtures** (`cam_sweep`, i se dvěma opravami níž): kolize
**7 / 121,3 mm² → 3 / 5,8 mm²** (nakreslený nůž), **0 / 0,0** beze změny
(náhradní držák); průchodů 1402 → 1381; úběr −16,2 mm² / −508,9 mm².
**Zajetí do hotové kontury (`ContourGouge`) přes celou sadu 84,1 → 48,9 mm².**

**Kde se úběr ztratil (a proč to není důvod k zamítnutí):**
- `part-13-zleva-flange` −220,8 mm²: poslední vrstva sedne o 1 mm výš
  (54,922 → 55,922) a na dno úseku nedosedne. Je to TÁŽ mez jako u dna pásu
  `machiningRangeX.xLo` — uzavírací bisekce (`lastDepthWithPasses`) je
  vypnutá u zakrytého vjezdu (`!entryCapped`). **Otevřené.**
- `part-20-zleva-parting-taper` −305,3 mm²: v Z 340–372 přestal vznikat
  JEDEN zápich `X24,610 → X7,545` označený „Rampa 90.0°“, tedy **15,2 mm
  kolmo** při `ap` 3. Že zmizel, není ztráta dráhy, o kterou by kdo stál.

### 5.3a Co přeskupení mřížky ODKRYLO (11. 9. 2026)

Tři vady, které v repu byly dávno — jen je stará mřížka míjela. Všechny tři
jsou opravené a **žádná z nich není důsledek per-úsek žebříku**:

1. **`cylStockZ` četl pole Délka dřív než siluetu.** U odlitku o něm rozměry
   válce neříkají nic (§ komentář přímo nad tou funkcí), ale silueta se brala
   až ZA podmínkou `len !== 0`: `part-1` Délka 5 → sledovací dno −5,000,
   ačkoli silueta končí na −10,000. Dojezdy se opíraly o zeď 5 mm nad koncem
   materiálu. Hlídá `tests/cam-stock-zero-dimension`; ten to roky nechytil,
   protože se o dno žádná dráha neopřela — teď se opřela.
2. **Radiální výjezd na začátek dojezdu se zahazoval na `1e-6`.** Konec
   průchodu je ze SKENU (`refineEngageZ`), začátek dojezdu z ANALYTICKÉHO
   offsetu, takže se na svislém čele liší o setiny (`part-1`: 257,524 proti
   257,514 = **0,010 mm**). Přesná podmínka výjezd zahodila a emise místo
   něj nakreslila DIAGONÁLU z konce průchodu rovnou na konec prvního úseku
   dojezdu — **14,4 mm² skrz hotovou konturu** r 29,94. `leadOutClimb`
   v `ops/roughEmit.js` má proto toleranci `LEADOUT_CLIMB_DZ` 0,05 mm
   a podmínku „jen na bezpečné straně ve směru řezu".
3. **Měření dojezdu proti offsetové čáře bylo 1-D.** `tests/cam-leadout-air-rapid`
   porovnával X při pevném Z; tam, kde je hranice skoro ROVNOBĚŽNÁ S OSOU X,
   z posunu 0,08 mm kolmo vyjde 0,405 mm v X. Měří se teď KOLMÁ vzdálenost —
   je to zároveň přísnější.

### 5.3b Otevřené po 11. 9. 2026

- **`part-1`/`part-2`: 3,05 → 18,09 mm² v pásu Z −9,95…−2,43.** Tam už
  polotovar nesahá (končí na Z −10), ale OBROBITELNÁ kontura ano — pipeline ji
  k jeho konci protahuje. Průchod na hloubce 37,978 tam sjede do pásu mezi
  koncem polotovaru a offsetovou čarou (Z −11), nic neodebere a TĚLEM plátku
  škrtne čelo dílu (Ø 41,978). Správná odpověď je protáhnout obrobitelnou
  konturu na konec OFFSETOVÉ čáry, ne polotovaru — táž věta jako §5.
- **Duplicitní dojezdy zanořovacího řetězu — ZMÍRNĚNO 11. 9. 2026, viz §5.4.**
  Kroky řetězu v kapse (`ops/long/pocketPass.js`) si dojezd neořezávají na
  hloubku předchozího kroku, jak to dělá otevřený průchod
  (`clipLeadOutToDepth` v `openPass.js`) — na `part-1` projedou tři kroky
  TOUTÉŽ trasou. Zahodit je nejde: evidence projetých drah
  (`makeChainRegistry`) je smí zahodit jen u `pocketClean` a plošný ořez byl
  změřen a zamítnut (nová kolize držáku na `part-18-parting-90-ramp`);
  `clipLeadOutToDepth` navíc krátí jen RADIÁLNÍ úseky, a tahle trasa žádný
  nemá. **Dráha tedy zůstává, jen se po ní jede rychloposuvem.** Že tam
  z principu VEDOU, je pořád otevřené.

---

## 5.4 Po už projeté dráze se jede RYCHLOPOSUVEM (11. 9. 2026)

> Úsek dojezdu, který podle DYNAMICKÉHO zbytku nemá co ubrat, se přejede
> rychloposuvem. **Geometrie se nemění — tentýž bod A → tentýž bod B.**

Dojezd „bez schodků" se drží kontury, takže kroky zanořovacího řetězu v kapse
přelezou týž hrb pokaždé znovu: `part-1` vydával **třikrát** `G1 X39.110
Z70.607`, tedy 3 × 34,4 mm posuvu. Přes celou sadu **47 doslovných duplicit
a 983 mm posuvu**.

**Proč je to bezpečné (a proč to NENÍ totéž co ořez dojezdu):**
- Mění se jen DRUH pohybu, ne trasa. Nástroj ani držák se nedostanou nikam,
  kam by se při posuvu nedostaly → **žádná nová kolize vzniknout nemůže**.
  Změřeno: `cam_sweep` vyšel bajt po bajtu stejně (úběr 87 757,5 / 90 507,7
  mm², kolize 3 / 5,8 a 0 / 0,0), `ContourGouge` 48,91 mm² beze změny.
- Ořez dojezdu tohle tvrdit NEMŮŽE — ten trasu zkracuje a posune 45° odskok
  (proto je zamítnutý, viz §5.3b).

**Tři podmínky, všechny nutné:**
1. **Značka z plánovací evidence** — `reg.isDuplicate(s)` v `ops/roughLong.js`
   označí `s.overCut`. Je to VÝKONOVÁ brána, ne bezpečnostní: bez ní běžel
   polygonový dotaz níž na KAŽDÝ úsek dojezdu a `tests/cam-finish-holder`
   v PLNÉ SADĚ přetekl vlastní 90s timeout. Značka se počítá jednou,
   vzorkovaně, a je zároveň užší — projde jí 92 % zisku.
   `isDuplicate` sám vzorkuje po 0,3 mm, takže se ptá **jen na úsečky delší
   než 2 mm** (kratší ani oblouk emise stejně nepřevede).
   **PAST V MĚŘENÍ:** izolovaně ten test běžel 52 s a `cam_fingerprint` hlásil
   šum (27 s proti 29 s) — fixtures jedou v paralelních procesech a dominuje
   jim start. Zpomalení tohohle druhu se pozná AŽ NA PLNÉ SADĚ.
2. **Dynamický zbytek PLNOU stopou destičky** (`leadOutAlreadyCut`
   v `gcodeEmit.js`; `rapidFoot`, ne zeštíhlená) a práh **0,01 mm²** — řádově
   pod 0,5 mm², se kterým pracuje `rapidHitsStock`. Tohle je ta BEZPEČNOSTNÍ
   podmínka: značka mluví o PLÁNOVANÝCH drahách, kdežto emise je ještě ořezává
   (`trimLeadOutToStock`, ořezy držáku), takže poslední slovo má skutečný
   zbytek.
3. **Jen JEDNOOSÝ pohyb.** `G0 X… Z…` může na některých řídicích systémech
   jet nelineárně (každá osa svou rychlostí) — tím by se dráha mezi A a B
   změnila a padl by argument z odstavce výš. Zbytek emise to dodržuje taky
   (`safeRapidTo` vydává `G0 X` a `G0 Z` zvlášť). Oblouky proto zůstávají
   posuvem vždycky (`G0` po oblouku neexistuje).

**Výsledek:** duplicity **47 → 19** pohybů, **983 → 133 mm**; posuv naprázdno
přes celou sadu **8 109 → 7 203 mm** (16,9 % → 15,3 % veškerého posuvu).
Označeno v G-kódu jako `; Po už projeté dráze`.

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
| **PO PROJETÉ DRÁZE SE PODRUHÉ NEJEZDÍ** (2. 9. 2026) | *„Projíždí to dvakrát stejnou dráhu, i když už je to obrobené."* Řetězy po kontuře jsou výřezy JEDNÉ `offsetPath` — dva s překrytým Z-pásmem vydají doslova tutéž dráhu. Evidence: `cutRegistry.js`. Ořezává se KONEC dojezdu u dobrání kapsy a vypouští se nájezd, který celý vede po projeté dráze. | `ops/long/cutRegistry.js` (viz §6.2) |
| **Vrstva dojíždí až na offsetovou čáru polotovaru** (2. 9. 2026) | *„Chtělo by to, aby to protáhl tu vrstvu až na konec k té offsetové čáře od polotovaru."* Výjezd z kapsy se zastaví, jakmile offset klesne na hloubku průchodu — když v tom Z-okně žádná hlubší vrstva nepřijde, dojede se rovně na siluetu. | `ops/roughLong.js` (doběh přes konec profilu) |

---

### 6.2 Co všechno se eviduje jako „už projeté"

Bez evidence se týž řez vydá dvakrát. Historicky ji měly jen tři věci; od
2. 9. 2026 je jich pět:

| co | kde | proti čemu chrání |
|---|---|---|
| přímky zanoření | `plungeLineRuns` / `notePlungeRun` | dobrání ořízlé rampy po témž klínu |
| rohy sjeté rampou | `rampedOutCorners` / `cornerAlreadyRampedOut` | kapsa za bossem zopakuje roh, co už sjel dojezd |
| dobrané kapsy | `pocketDoneRanges` | hlubší hloubky zkoušejí tutéž kapsu znovu |
| **konce dojezdu na hloubce vrstvy** | `openPass.js` (`coverLo`/`coverHi`) | interval, kterým dojezd projel, se vydá jako vlastní průchod. **Počítá se i to, kudy dojezd projel POD hloubkou vrstvy** — sjezd do prohlubně a zpět vrstvu odebral taky |
| **řetězy po kontuře** | `cutRegistry.js` (`makeChainRegistry`) | výjezd z kapsy jede znovu za každý zákrok bursteu |
| **rovný řez na hloubce z jiného REGIONU** | `cutRegistry.js` (`depthCutClampZ`) | doběh přeletí údolí a dojede na stěnu, kterou už soused obrobil |

**Kde doběh po stopce KONČÍ:** na offsetové čáře polotovaru — poslední hraně
materiálu před stopkou (`stockRunBackZ` v `ops/long/runScan.js`). Ne na
stopce samotné (za údolím by zbyl rychloposuv 24 mm a pahýl řezu 0,29 mm) a
ne na první mezeře (`stockRunEndZ` vrátí vrstvu na Z 31,96 — mezery se
přeletět MAJÍ, viz „Dodělat vrstvu"). U stopky materiál zpravidla JE (sousední
úsek dílu, jen už obrobený — silueta polotovaru o tom neví), takže se ten
pruh přeskočí a hledá se hrana až za první mezerou.

**Stopku dělá i DNO OKNA VLASTNÍHO ÚSEKU** (6. 9. 2026, `regionFloorZ`).
Evidence výš je order-dependent: úseky jedou od největšího průměru, takže
ten první je naplánovaný dřív, než nějaká evidence vznikne, a doběh mu pak
nic nezastaví. Na dílu uživatele jel krok řetězu r 47,045 rovnou
Z 205,142 → −5,000 — 210 mm přes celý díl a přes obě hranice úseků — a
materiál za hranicí vzal podruhé vlastní průchod souseda
(r 47,045 Z 142,828 → 119,340). V G-kódu to bylo vidět jako
`G1 Z142.876 F0.25 ; Přejezd materiálem posuvem`, tedy soustružení vzduchu
posuvem přes 52 mm. Okno úseku je proto další mez vedle evidence; evidence
zůstává, protože pokrývá hranice, které se na dané hloubce ROZPUSTILY
(v kůře dna údolí), kde okno samo nezastaví.

> **Pozor na měřicí gate.** Dno okna bylo jako mez zamítnuté 2. 9. 2026 za
> −197 mm² úběru. To zamítnutí neplatí: §6.0 je PODMÍNKA a úběr ji vetovat
> nesmí (viz řádek „plán s dělením smí vetovat jen DRŽÁK, nikdy úběr" výš).
> Změřeno navíc bez ceny — 3 z 28 fixtures se hnuly, všechny jen o mizející
> „Přejezd materiálem posuvem", úběr i počet průchodů beze změny, kolize 0/0.

**Doložené meze evidence** (obojí změřeno 2. 9. 2026, nezkoušet znovu bez
nového nápadu):

- **Stopka „u čehokoli, co je hotové" je moc hrubá.** Ostrůvek 1,36 mm
  uprostřed 108mm doběhu utne celou jízdu → −153,7 mm² na `part-8`. Stopku
  dělá jen úsek, ve kterém doběh KONČÍ.
- **Nájezd se neořezává po částech.** Není to jen řez, ale i cesta k rampě —
  z půlky řetězu by se na její začátek muselo rychloposuvem po tětivě, tedy
  skrz konturu. Buď je celý duplicitní a zmizí celý (průchod pak najede
  `safeRapidTo`), nebo zůstane. Vypustit ho smí jen průchod s RAMPOU: bez ní
  by `safeRapidTo` mířila na `(pass.x, pass.zStart)`, tedy kolmý zápich (§3.1).
- **Plošný ořez dojezdů dělá kolize.** Dojezd nejen řeže, taky VYVÁŽÍ NÁSTROJ
  VEN; jeho zkrácení posune 45° odskok do místa, kde už držák místo nemá
  (`part-18-parting-90-ramp`: nová kolize 1,0 mm² při nezměněném úběru).
  Ořezává se proto jen dobrání kapsy (`pocketClean`), kde je opakování
  vlastností zadání — poslední zákrok bursteu i dobrání míří na týž `exitZ`.

---

## 6.5 ZÁVĚREČNÁ KONTROLA PLÁNU (7. 9. 2026)

Pravidla v tomhle dokumentu jsou vlastnosti CELÉHO programu, ale v kódu je
**nikdo nevlastní**: vznikají jako vedlejší produkt hloubkové smyčky a pak na
hotové průchody sahá dalších ~36 míst v šesti souborech (`roughLong`,
`depthTabs`, `humpMerge`, `insertFlankGuard`, `openPass`, `residualGuard`).
Každé řeší svůj legitimní problém a žádné už nekontroluje, jestli tím
pravidlo neporušilo. Proto z jednoduchých podmínek lezou složité vady a
nacházel je uživatel očima v G-kódu, ne generátor.

`ops/long/planCheck.js` běží **až za všemi zásahy** (za `mergeLayersOverHump`),
dráhy NEMĚNÍ a hlásí do ⚠ panelu s konkrétním r/Z:

| kontrola | co je porušený invariant |
|---|---|
| **průchod jede vzduchem** | na jeho hloubce nad ním nikde nestojí materiál (plánovací silueta), nejdelší souvislý záběr < `dzScan`. Výjimky: dojezd/nájezd po kontuře (§7.2 — hodnota kroku je v dojezdu) a RAMPA (ta sama řeže) |
| **průchod přejel hranici svého úseku** | §6.0. Bere se jen hranice, která na dané hloubce opravdu platí (`edgeDissolved` — v kůře dna údolí se úseky spojují) |

**Kontrola musí být nevakuová.** Ověřuje se tak, že se oprava vypne a hlášky
musí naskočit — u obou vad ze 7. 9. 2026 to platí a obě pojmenuje přesně.
Falešné poplachy do ní NEPATŘÍ: každá kontrola je psaná jako skutečný
invariant a výjimka se doplňuje s doloženým důvodem, ne vypnutím kontroly.

**Co odkryla hned:** tři dosud neznámé vady na sadě (`holder-casting-slanted-face`
a `holder-region-roughing` — jízda vzduchem; `part-21-zleva-insert-shadow` —
přejezd hranice). Po opravách téhož dne zbývá poslední.

### 6.5a Kotva řetězu leží v materiálu → rampa se PRODLOUŽÍ, ne kotva zvedne

`safeRapidTo` je bezpečná jen proti KONTUŘE, ne proti polotovaru. U odlitku
proto sjede rychloposuvem dovnitř odlitku a zbytek na kotvu dojede RADIÁLNĚ —
kolmý zápich, který §3.1 u plátků s úhlem zanoření < 90° zakazuje. Nález
uživatele 7. 9. 2026: `N700 G0 X46.345` + `N710 G1 X44.545 F0.25` na
Z 195,812, kde má plánovací silueta r 65,2 (1,8 mm radiálně do plného kusu).

Kotvu **zvednout nelze** (visí na ní celý řetěz — viz „kotva rampy leží
v materiálu"). Řešením je prodloužit RAMPU po téže přímce zanoření až na
povrch, ale **nejvýš o jednu Hloubku záběru**: výš už materiál sebrala
předchozí vrstva. Bez toho stropu rampa začínala na PŮVODNÍM povrchu odlitku
a jela 63 mm v Z posuvem místem, které je dávno obrobené.

### 6.5b Rampa, která nedosáhne na svou hloubku, NENÍ průchod

Emise ustřihne rampu tam, kde vyjede z materiálu. Když tím nedosáhne na
hloubku průchodu, uřízne jen pás v hloubkách MĚLČÍCH vrstev — a ty ho už
vzaly. Je to tedy zopakovaná rampa, ne nový záběr, a průchod se zahodí; práci
odvede řetěz dorampování, který navazuje o Hloubku záběru výš. (Nález
uživatele: „Průchod 11" rampoval X 51,207 → 46,837 a odjel, aniž by dosáhl na
svou hloubku 44,545 — těsně vedle rampy „Průchodu 9" X 51,253 → 47,045.)

**Změřeno u 6.5a + 6.5b dohromady:** otisk 19 z 28 fixtures (všechny
KRATŠÍ), ale úběr 82 822,0 → 82 823,7 a 86 178,5 → 86 163,1 mm², tedy
−15,4 mm² z 86 000 (0,018 %), a kolize beze změny. Zkrácení nejsou ubrané
řezy, ale ubrané přejezdy, nájezdy a duplicitní rampy.

> **Pozor na to, co otisk umí.** `cam_fingerprint` a snapshoty pinují
> CHOVÁNÍ, ne správnost — byl-li výstup dřív špatný, pinují tu chybu (tři
> řádky „Přejezd materiálem posuvem" v nich seděly měsíce jako správný
> výsledek). „Změnilo se 19 dílů" tedy neznamená „rozbil jsem 19 dílů".
> Rozhodnout umí jen geometrie: ÚBĚR a KOLIZE ze `cam_sweep`, plus tyhle
> invarianty.

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

### 7.4 KRČEK Z 84–99 — MEZ DESTIČKY, ne směru (změřeno 2. 9. 2026)

Uživatel opakovaně hlásil, že vrstva u krčku „nedojede až k offsetové čáře
a nechá tam zbytek". Změřeno **6,72 mm nad konturou v pásu Z 85–99** — a je
to mez plátku, ne vada plánování:

| měření | výsledek |
|---|---|
| zleva | 6,72 mm |
| **zprava (tentýž díl)** | **6,72 mm — identicky** |
| zleva s VYPNUTÝM hlídáním držáku | 6,72 mm — beze změny |
| zleva s vypnutým `respectInsertGeometry` | pás zmizí |

Takže rozhoduje GEOMETRIE DESTIČKY. Krček je v Z dlouhý 15,58 mm
(Z 84,177…99,757) a hluboký 8,00 mm (ústí r 15,579 → dno r 7,579). Zadní bok
plátku stoupá pod natočením 15°, takže na plnou hloubku potřebuje
**8 / tg 15° = 29,9 mm** v ose Z. K dispozici je 15,58 mm → plátek dosáhne
nejvýš ~4,2 mm a zbytek nechá stát. Otočení strany obrábění s tím nehne —
bok je pod 15° tak jako tak.

Zbytek tam patří jinému nástroji (užší plátek, zapichovák), ne jinému směru.

### 7.3 KONEC DÍLU ZLEVA — VJEZD SE NENAJDE, i když místo je (2. 9. 2026)

Na dílu uživatele zůstává rukáv **Z 243–345** (silueta r 21,8, kontura r 9,1)
zleva celý neobrobený: **žádná hloubka pod r 43,5 nejde za Z 265.**

**Region tam JE** — poslední geometrický region běží od Z 227,6 do +∞, takže
rukáv do něj patří celý. Chybí VJEZD.

A místo pro něj existuje. Změřeno tak, jak by se to dělalo — obálka držáku
položená do rukávu proti ZBYTKU PO CELÉM PROGRAMU (`holderWorldLoop`
× `MaterialRemoval`), vnoření v mm²:

| Z \ špička | r 19 | r 16 | r 13 | r 10 |
|---|---|---|---|---|
| 250 | 421 | 484 | 547 | 610 |
| 270 | 270 | 331 | 394 | 457 |
| 280 | 106 | 137 | 172 | 225 |
| **300** | **0,0** | **0,0** | **0,0** | 37,9 |
| **340** | **0,0** | **0,0** | **0,0** | 37,9 |

Od **Z ≈ 290** je držák čistý. (Uživatel nezávisle ukázal myší Z 293,1 —
sedí.) Těch 37,9 mm² u r 10 je držák otírající se o rukáv, který za ním
teprve zbývá odebrat — mizí s pořadím, jak průchody postupují.

**Dřívější závěr „zleva to nejde, protože držák nepřejde přírubu" platí jen
pro Z < 285.** Pro zbytek rukávu neplatí a byl chybný.

Chybí tedy jediné: aby se v tomhle regionu vjezd POSUNUL na Z ≈ 290 a zanořil
se tam rampou — přesně to, co `holderEntryCapZ` dělá v údolích a co uživatel
ukazuje na obrázku („mělo by se to jak v tom údolí začít za tím zanořovat").
Proč tam ta cesta nedojede, není dohledáno.

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
