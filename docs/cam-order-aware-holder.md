# Hlídání držáku podle POŘADÍ obrábění — plán

> Stav: **kroky 0–3 hotové, ZAPNOUT SE NEDOPORUČUJE** (příznak
> `orderAwareHolder`, výchozí vypnuto — s vypnutým se G-kód nezměnil ani
> o řádek). Krok 3 svůj cíl NESPLNIL a je změřeno proč; kroky 4–5 tím
> ztratily zadání, dokud se nerozhodne o pokračování níž.
> Poslední aktualizace 26. 8. 2026.
> Navazuje na nález 09 z auditu drah (viz CHANGELOG, sekce *Measured and rejected*).

## Co je špatně

`makeHolderClamp()` staví zakázanou oblast špičky z **hotového dílu**:

```
překážka = silueta(offsetPath) ∩ (polotovar ⊕ 0,1)      … buildObstacleLoops
zakázaná oblast F = překážka ⊕ (−obrys držáku)          … buildTipForbiddenRegion
```

`offsetPath` je kontura + R + přídavek, tedy **finální tvar**. O materiálu, který
v okamžiku daného průchodu ještě stojí, model neví vůbec nic. Vjezd do
nevyhrubovaného polotovaru proto nemá co hlídat.

**Změřený dopad (25. 8. 2026, po opravách toho dne):** s nakresleným nožem
zbývají **4 nálezy / 33,4 mm²**, a jen na `part-8` (na začátku dne 121,8 mm²).
Ostatních 24 fixtures jede na nulu. Všechny 4 nálezy sedí na **jednom** průchodu:
hlubokém vjezdu do úzké drážky (r 17,649, rampa na Z 184,5, pak sledování kontury
přes celý díl, sám ubere 334 mm²). Držák vjede tělem 0–4,4 mm **za** špičkou do
ramene r 20–31 / Z 183–189.

Příčina je lokalizovaná a je to **nekonzistence**, ne náhoda: se skutečným nožem
obálka **smaže mezilehlé průchody** (r 26,978 a 24,478 v pásu Z 188–219, které
s náhradním obdélníkem vzniknou), ale **hluboký vjezd nechá projít** — kapsy
(`k > 0`) `applyHolderClamp` vědomě neořezává. Rameno tedy nikdo neodebere a
vjezd do něj nikdo nezakáže.

## Co UŽ JE ZMĚŘENO A ZAMÍTNUTO

Nezkoušet znovu. Všechno níž je naměřené, ne odhad.

| Nápad | Výsledek |
|---|---|
| Doplnit obálku i na kapsové intervaly | úběr −4 192 mm² (−5,5 %) za −27 mm² kolize; **s náhradním držákem o jeden nález VÍC** při téže ztrátě |
| `holderFitsAt` do `stockEntryRamp`, ke kotvě i `holderFitsAlong` po zátahu | bez efektu na nálezy, poslední navíc −24,6 mm² na part-15 |
| Nafouknout držák na neobrobenou stranu | ⛔ 0 → 12 a úběr 4 381 → 10 310 mm² |
| Keep-out pás v `makeHolderClamp` (nález 08) | part-14 401,7 → 4,8 mm², ale part-15 0 → 213,3; úběr ±30 % |

**Poučení, které z toho plyne a které určuje celý návrh:** dnešní obálka je
`překážka ⊇ hotový díl`. Model se znalostí pořadí má `překážka = zbytek ⊇ hotový
díl`, tedy je **vždy alespoň tak přísný** — sám o sobě může úběr jen ubrat.
Zaplatit se musí **zrušením statických proxy**, které tentýž jev dnes hádají
hrubě dopředu. Bez toho je to čistá ztráta, což je přesně to, co všechny čtyři
řádky výš změřily.

Proxy, které nový model nahrazuje:

1. **`stair`** v `makeHolderClamp` (`opts.mainStair`, `clamp.noteMainEnd`) — pásy
   materiálu od mělčích konců. To je crude model zbytku; nový ho zná přesně.
2. **Mezní čáry „stěna − holderWidth"** (`interferenceGuides.js`, `fromInsert`),
   zapracované do obrobitelné kontury. Statická horní mez.
3. **`isForbiddenSoft`** (překážka erodovaná o `openR + 1`) v `holderTrimLeadIn/Out`
   — vědomé tolerování „drhnutí o přídavkovou slupku", protože tvrdý test by
   zahodil dno kapsy.

## Rozpočet: proč se Minkowski nesmí přepočítávat

Naměřeno 25. 8. 2026 (part-8 / part-15 / part-16, nakreslený nůž z magazínu):

| operace | čas |
|---|---|
| `makeHolderClamp()` celý rebuild | **157 / 167 / 382 ms** |
| z toho samotný `buildTipForbiddenRegion` (Minkowski) | 58 / 147 / 98 ms |
| **přímý dotaz** „vejde se držák na (x, z) do zbytku?" | **0,142 ms** |
| inkrementální `cut()` jednoho průchodu do `StockModel` | 0,36 ms |

Různých hloubek: part-8 **26**, part-15 **20**.

Rebuild na každou hloubku = 20–26 × ~160 ms = **3–4 s na díl navíc**. Aplikace
přepočítává při každé změně parametru, takže to je vyloučené.

Přímý dotaz je **~1000× levnější**. Rozpočet nového modelu při hrubém odhadu
26 hloubek × 28 vzorků (hrubý sken + půlení, jako `refineEngageZ`):
`728 × 0,142 ms ≈ 0,10 s` + `32 × 0,36 ms ≈ 0,01 s`. To je únosné.

**Návrh proto Minkowského sumu nepoužívá.** `clampZTowardNegative()` je dnes
analytický (parita + průsečíky hran s `x = X`) a přesný; nová varianta bude
**vzorkovaná** — hrubě po `dzScan` (0,2 mm) a dopřesněná půlením. Ztráta přesnosti
je stejného řádu jako u `blockedAt`/`refineEngageZ`, se kterými zbytek strategie
už žije.

## Postup

Každý krok má vlastní měření a je samostatně zahoditelný.

### Krok 0 — měřicí nástroj ✅ HOTOVO (26. 8. 2026)

`scripts/cam_sweep.mjs`: přes všechny fixtures vydá **úběr** a **nálezy
validátoru** ve dvou variantách držáku a ve dvou standardech polotovaru
(syrová silueta × offsetová čára). Jeden proces na (fixture × varianta),
paralelně; celá sada ~60 s na 4 jádrech.

```bash
node scripts/cam_sweep.mjs                       # celá sada, obě varianty
node scripts/cam_sweep.mjs part-8 range          # jen fixtures dle podřetězce
node scripts/cam_sweep.mjs --save=.cam-sweep-baseline.json
node scripts/cam_sweep.mjs --diff=.cam-sweep-baseline.json
```

Zapsaná baseline se reprodukuje **do posledního místa** (běh 26. 8. 2026 nad
`02a125b`):

```
nakreslený nůž  úběr 76 663,8 mm²   kolize 4 / 33,4 mm²      ✔ shoda
náhradní držák  úběr 76 849,6 mm²   kolize 2 /  2,3 mm²      ✔ shoda
```

**Co „náhradní držák" v baseline znamená — vyjasněno měřením.** Je to sada
**jak je**: vlastní nakreslený obrys tam, kde ho fixture má (14 z 25), náhradní
obdélník jinde. NENÍ to obdélník vnucený všem — ta varianta (`--holder=all`,
klíč `rect`) dá `85 457,9 mm² / 22 nálezů / 9 355,2 mm²`, protože na
`part-13-zleva-flange` je to úplně jiná úloha (15 nálezů / 9 273 mm², úběr
11 777 → 17 757). Držte se dvojice `magazine` + `own`, na tu je baseline
zapsaná; `rect` je diagnostika „vadí tvar držáku, nebo ten díl?".

Nástroj tiskne i **offsetový standard**, který v plánu dosud zapsaný nebyl:

| varianta | syrová silueta | offsetová čára |
|---|---|---|
| nakreslený nůž (`magazine`) | 76 663,8 mm² · 4 / 33,4 | 84 682,4 mm² · 4 / 41,6 |
| náhradní držák (`own`) | 76 849,6 mm² · 2 / 2,3 | 84 889,3 mm² · 11 / 76,6 |

Offsetových 11 nálezů = přesně `EXPECTED_PLAN` v `tests/cam-collision-free`
(`holder-casting-slanted-face` 3× + `part-8` 8×), takže nástroj a sada měří
totéž.

Vedlejší zjištění: rozdíl 185,8 mm² mezi oběma variantami nese jen **trojice**
fixtures — `holder-casting-slanted-face` (321,9 → 414,5), `holder-region-roughing`
(854,8 → 924,3) a `part-8` (2 529,0 → 2 552,7). Všechny tři jsou přesně ty bez
nakresleného obrysu, na kterých držák rozhoduje. `part-1/2/4/6` se liší jen
počtem průchodů, úběr mají na desetinu stejný.

**Pasti zapracované do nástroje:**
- singleton `S` v harnessu kontaminuje → jeden PROCES na (fixture × varianta),
  ne jeden na sadu;
- `zLimits`/`xLimits` harness MERGUJE (`Object.assign`), ne přepisuje → posílá
  se plná sada klíčů (`ZL0`/`XL0`);
- `maxIssues` je zvednuté z výchozích 12 na 64. Dnešní maximum na fixture jsou
  4 nálezy, takže se baseline nemění — ale propad v kroku 3–4 nezůstane
  zamaskovaný stropem.

Baseline pro kroky 1–4 se drží přes `--save`/`--diff` (soubory `.cam-sweep-*.json`
jsou v `.gitignore`) — tím odpadá past „baseline měřená přes `git checkout --`",
protože se porovnávají naměřená ČÍSLA, ne dva stavy stromu.

### Krok 1 — akumulátor zbytku ve strategii ✅ HOTOVO (26. 8. 2026)

`js/calculators/cam/residualTracker.js` + seam a test
`tests/cam-strategy-residual`. Úběr ani G-kód se nezměnily (ověřeno
`cam_sweep --diff`: Δ 0,0 mm² / 0 nálezů; sada 1408/1408; se zapnutým
příznakem vyjde na `part-8`, `part-13` i `holder-region-roughing` BAJT PO
BAJTU týž program).

#### Zjištění, které krok 1 přerámovalo: akumulátor UŽ EXISTOVAL

`genLongPasses` si vede `cutFloorTab` — **výškové pole** po 0,25 mm v ose Z,
plněné líně z prefixu `passes[]` (`notePassInto` → `residTopAt`). Ptá se ho
hlídání zanoření (`holderFitArea`, `holderFitAreaAlong`) i kontrola odložených
vjezdů na konci regionu. Order-aware model zbytku tedy v repu je; chybí jen
`applyHolderClamp`, který pořád jede na statické obálce z HOTOVÉHO dílu.

Jenže výškové pole je JEDNO ČÍSLO NA SLOUPEC, takže **neumí tunel**: když
zanoření nebo dojezd po kontuře podjede pod stojícím materiálem, srazí celý
sloupec na hloubku tunelu. Změřeno proti reálně projeté dráze:

| fixture | výškové pole | ResidualTracker |
|---|---|---|
| `part-8` | **−11,2 mm** (93 vzorků, pás Z 117,5–183) | ≤ 0,05 mm |
| `holder-casting-slanted-face` | **−13,6 mm** (10 vzorků, pás Z 68,8–100,3) | ≤ 0,05 mm |
| `part-1` / `part-4` / `holder-region-roughing` | v mezi | ≤ 0,05 mm |
| `part-13-zleva-flange` | v mezi | 0,30 mm (doložená mez, viz níž) |

**To jsou přesně ty dva díly, na kterých zůstávají doložené kolize držáku**
(4 / 33,4 mm² a 2 / 2,3 mm²) — a chyba je v NEBEZPEČNÉM směru: model tvrdí, že
je vykopáno, tak tam hlídání držák pustí. Dosavadní vysvětlení („mez modelu
`holderFitsAt`, který držák modeluje skenem povrchu místo polygonem", zapsané
v `EXPECTED` u `cam-collision-free`) tedy **není celé**: vedle modelu DRŽÁKU
je vedle i model MATERIÁLU. Tracker je proto potřeba — není to dražší kopie
výškového pole, je to jiná reprezentace.

#### Co je nasazené

```js
new ResidualTracker(prms, stockPathSegments, { seedLoop, raw, footprint })
tracker.notePass(pass)     // cut(toolSweep(footprint, passCutPolylines(pass)))
tracker.noteAll(passes)    // postaví znovu z celého pole
tracker.loops              // zbytek jako polygony
tracker.topAt(z)           // povrch zbytku — správně i NAD tunelem
```

Odchylky od původního zadání, každá změřená:

1. **Seed je OFFSETOVÁ čára, ne `buildStockLoopRaw`.** Syrový základ by byl
   MÉNĚ přísný než dnešní výškové pole, které se staví nad
   `stockLoopOffsetFullL`. Strategie svou smyčku předává přes `seedLoop`
   (celý polotovar, bez ořezu rozsahem 📐 — držák narazí i za hranicí rozsahu).
2. **Oblouky se vzorkují, ne píší tětivou.** Táž oprava, jakou dostal
   `noteCutArc` v emisi 12. 8. 2026. Bez ní byl tracker 0,30–0,74 mm pod
   realitou na čtyřech fixtures; s ní ≤ 0,05.
3. **Výjimka pro průchod s nulovým dnem** platí i pro staré výškové pole.
   `notePassInto` ji neměla, a právě rampa degenerovaného zanoření #27 dělala
   na `part-8` pás Z 183–192,5. Oprava stála **nula** (`cam_sweep --diff`:
   Δ 0,0 mm² a žádná změněná fixture) — na dnešních dílech na tom nikdy žádné
   rozhodnutí nestálo.

#### Doložená mez: `part-13-zleva-flange` 0,30 mm

35 vzorků z 1936, výhradně v pásech Z 173–176 a 181–186, a všechny sedí na
`contourLeadOut` průchodů #8/#11. Příčina je systémová, ne vada: **tracker zná
PLÁN, ne EMISI.** Mezi nimi je ještě `envify`, zpětné prokládání oblouků, ořezy
držáku a `emitBodyX`. Zpřesnit to jde jedině plněním modelu až v emisi — což je
přesně `rapidStock` v `gcodeEmit.js` a strategii to nepomůže, protože ta se
musí rozhodnout dřív.

#### Cena — plán ji podstřelil

| fixture | průchodů | `noteAll` |
|---|---|---|
| `part-8` | 35 | **223 ms** (6,4 ms/průchod) |
| `part-15-finish-zprava` | 32 | 90 ms (2,8) |
| `part-16-face-holder` | 112 | 112 ms (1,0) |

Rozpočet níž počítal s 0,36 ms na řez — jenže tam je řez KRÁTKÝ POHYB
(`rapidStock`), kdežto tady celý průchod: tělo + rampa + nájezd/dojezd
s navzorkovanými oblouky, tedy `toolSweep` přes stovky bodů. Cenu nese
`toolSweep`, ne velikost modelu (`polySimplify` po 1 / 4 / 8 / 24 řezech vyšel
na týž čas ±3 %). Pořád je to řádově míň než rebuild obálky NA KAŽDOU HLOUBKU
(3–4 s), ale zadarmo to není — proto příznak.

#### ⚠ Pro krok 2: `passes[]` je pořadí obrábění až ve FINÁLNÍM stavu

Plán psal „volá se na místě, kde se průchod push-uje do `passes`". To nejde:
pole se za běhu ještě přeskládá — dobírací řetězy se vkládají `passes.splice(at, …)`
DOPROSTŘED a konec regionu odsouvá odložená zanoření (`__deferEntry`) na konec.
Tracker se proto plní až z hotového pole (`noteAll`). Krok 2, který se bude ptát
UPROSTŘED plánování, si musí vzít prefix — a ten prefix NENÍ totéž co finální
pořadí. Táž díra je mimochodem i v dnešním líném `syncCutFloor`: co se vloží
`splice` PŘED jeho značku, se do výškového pole nikdy nezapíše (směr je
bezpečný — model pak tvrdí, že materiál stojí).

### Krok 2 — dotaz místo obálky ✅ HOTOVO (26. 8. 2026)

`js/calculators/cam/residualHolder.js` + `tests/cam-residual-clamp` (17 testů).
Modul zatím **nikdo neimportuje** — zapojení do `applyHolderClamp` je krok 3.

```js
residualHolderLoop(prms, backside, { subtractInsert, shrink })  // obrys pro dotazy
holderAreaInResidual(loops, holderLoop, x, z)                   // mm²
holderFitsInResidual(loops, holderLoop, x, z, tol)              // bool
makeResidualClamp(loops, holderLoop, { margin, tol, eps })      // → clamp(X, zStart, zEnd)
```

`clamp` má **shodné rozhraní** s tím z `makeHolderClamp`: `null` = zakázaný
start, jinak posunutý `zEnd` (≥ původní). Navíc `.area(x, z)`,
`.isForbidden(x, z)`, `.sweptArea(X, z1, z2)`. Rezerva se přičítá stejně
(`hranice + margin`), takže pravidlo v `applyHolderClamp` — zkrátit jen když
`nz − margin` leží ZA koncem intervalu — platí beze změny.

`.span` (ořez na první povolenou KOMPONENTU, dnešní `clampSpanTowardNegative`
pro kapsy) tu **schválně není**. Hledání „první povolené komponenty" není
monotónní, takže by potřebovalo vzorkování — a jestli ho kapsy vůbec chtějí,
je rozhodnutí kroku 3, kde se to dá změřit.

#### Sken po krocích byl nahrazen ZAMETENÝM držákem

Zadání psalo „hrubý sken po `dzScan` (0,2 mm) a dopřesnění půlením". Sken po
krocích ale může **přeskočit překážku užší než krok** — a to je nebezpečný
směr. Místo toho se testuje STOPA držáku přes celý zbývající interval
(`toolSweep(holderLoop, [(X,z1),(X,z2)])`) a ta predikce je **monotónní**:
kratší interval má stopu podmnožinou delší, takže plocha průniku roste s délkou
intervalu. Půlení nad monotónní predikcí je přesné a nemá díry — hlídá to test
„ÚZKÁ překážka se nepřeskočí" (žebro 0,4 mm).

Vedlejší efekt je rychlost: volný interval (drtivá většina) stojí **jeden**
dotaz místo stovek, blokovaný ~13 (půlení na 0,01 mm).

#### Tolerance je 0,5 mm², ne 2,0

`RESIDUAL_FIT_TOL = 0.5` jako u validátoru. `HOLDER_FIT_TOL = 2.0`
v `roughingStrategies.js` je vědomá kompenzace HRUBÉHO modelu (sken povrchu
po Z + profil spodní hrany), který systematicky nadhodnocuje — změřeno tamtéž:
`part-13` sken 0,63 mm² → polygon 0; `part-17` sken 1,09/0,61 → polygon 0,12.
Tady se měří polygonovým průnikem, takže se dvojka nedědí; dědila by se jen
chyba, kterou kompenzuje.

#### Akceptace: parita s obálkou

Jednotkový test proti `clampZTowardNegative` na umělé geometrii (dvě překážky,
6 hloubek): tam, kde je zbytek roven překážce, dávají obě varianty **totéž
±0,2 mm**. Parita se měří s tolerancí u nuly, protože obálka hlásí kolizi při
DOTYKU, kdežto dotaz nad zbytkem až nad `tol` — na překážce široké `w` je to
posun právě `tol / w` (změřeno: 0,05 mm při w = 10, 0,25 mm při w = 2). To je
vlastnost tolerance, ne ořezu, a má vlastní test.

#### Cena — dotaz je opravdu levný

Změřeno na zbytku po polovině průchodů, dotazy = hloubky a Z-rozsahy zbývajících
průchodů:

| fixture | dotazů | celkem | na dotaz | `makeHolderClamp` rebuild |
|---|---|---|---|---|
| `part-8` | 17 | 3,6 ms | 0,21 ms | 42 ms |
| `part-15-finish-zprava` | 16 | 31,1 ms | 1,94 ms | 72 ms |
| `holder-region-roughing` | 20 | 7,5 ms | 0,37 ms | 1 ms |

Rozptyl dělá počet zkrácených intervalů: volný interval = 1 dotaz, zkrácený
~13 (půlení). Celý sešup dotazů tedy stojí 4–31 ms na díl — proti rebuildu
obálky NA KAŽDOU HLOUBKU (20–26 × ≈ 1–2 s) je to pořád ta správná strana.

#### ⚠ Pro krok 3: pořadí není detail, je to celá věc

V sondě výš vrátil `clamp` na `part-8` **null u 8 ze 17** zbývajících průchodů.
Není to předpověď kroku 3 — sonda odřezala prvních 50 % průchodů a pak se
ptala na celý zbytek proti TOMU JEDNOMU stavu. Skutečné zapojení musí tracker
plnit PRŮBĚŽNĚ, aby se každý průchod posuzoval proti zbytku ve svém okamžiku.
Kdyby se to zapojilo proti zastaralému stavu, hlídání zamítne násobně víc, než
má — a přesně to je způsob, jakým všechny čtyři zamítnuté nápady v tabulce výš
přišly o úběr.

### Krok 3 — zapojit za příznakem ⚠ HOTOVO, ALE CÍL NESPLNĚN (26. 8. 2026)

Zapojeno v `genLongPasses` za příznakem `orderAwareHolder` (výchozí `false`):
tracker se plní LÍNĚ z prefixu `passes` a `applyHolderClamp` se ptá jeho
ořezu. Akceptace ale **neprošla** — a je změřeno proč.

#### Výsledek (celá sada, obě varianty držáku)

| | úběr | kolize |
|---|---|---|
| nakreslený nůž, baseline | 76 663,8 mm² | 4 / 33,4 mm² |
| nakreslený nůž, **zapnuto** | **78 145,6** (+1 481,8) | **7 / 2 611,2** |
| náhradní držák, baseline | 76 849,6 mm² | 2 / 2,3 mm² |
| náhradní držák, **zapnuto** | **78 082,2** (+1 232,6) | **3 / 2 577,8** |

Úběr tedy naopak VZROSTL (krok 4 by neměl co splácet), ale:

- **`part-8` se nezměnil ANI O ŘÁDEK** (32 průchodů, 2 529,0 mm², 4 / 33,4) —
  a to byl celý cíl. Ořez tam nevystřelí ani jednou.
- **`part-10-zapich-casting` je nová vada**: úběr 1 307,8 → 2 765,3
  (+1 457,5) a **3 nálezy / 2 577,8 mm²**.
- `holder-casting-slanted-face` se naopak spravil (2 / 2,3 → **0**).
- Ostatní fixtures: drobné pohyby úběru, žádné nové nálezy.

#### PROČ `part-8` ne: ořez intervalů je špatné místo

Zbylé 4 nálezy sedí na VJEZDU do kapsy (`#27`, `pocketEntry`, degenerovaný
průchod s nulovým dnem) — na jeho RAMPĚ a kotvě. `applyHolderClamp` ale
ořezává Z-INTERVALY hloubkových průchodů; rampovou kotvu plánuje
`stockEntryRamp` a hlídá `holderFitArea`/`holderFitAreaAlong`. Polygonový
model se tedy zapojil tam, kde díra není.

A tohle je ta pointa: `holderFitArea` čte VÝŠKOVÉ POLE, o kterém krok 1
změřil, že je na `part-8` až **11,2 mm pod realitou** — a to přesně v pásu
Z 117,5–183, kde ty nálezy jsou. Další pokus proto patří **ke kotvě rampy**,
ne k ořezu intervalů. (Plán to jednou zkoušel a odepsal jako „bez efektu" —
jenže tehdy s tím výškovým polem, o kterém teď víme, že tam lže.)

#### Tři opravy, které si měření vynutilo

Každá je zapsaná v kódu i s čísly, ať se nezkoušejí znovu.

1. **Nahrazení obálky je špatně; ORDER-AWARE SE S NÍ SKLÁDÁ.**
   Se záměnou (jak plán psal) vyšlo úběr 76 664 → **65 979 mm² (−14 %)**
   a kolize **4 → 67 (31 138 mm²)**.
2. **Zbytek smí průchod ZKRÁTIT, ne ZRUŠIT.** Obálka si zahození dovolit může
   — modeluje HOTOVÝ DÍL, tedy překážku, která nezmizí. Zbytek je PŘECHODNÝ:
   „nevejde se teď" znamená „ještě ne". A zahozená hloubka materiál
   NEODEBERE, jen ho nechá stát, takže ho další, hlubší průchod vezme
   najednou a projede skrz. Změřeno na `part-17`: průchodů 53 → 44, ale úběr
   4 933 → 10 183 mm² a 26 nálezů.
3. **Musí se odečíst VLASTNÍ ŘEZ průchodu.** Držák se táhne v drážce, kterou
   ten průchod právě řeže, a jeho obrys začíná u hrotu (u upichováku i u nožů
   z magazínu doslova na něm). Bez odečtení „stojí" materiál těsně za špičkou
   při každém běžném řezu: `part-17` +5 287 mm² a 36 nálezů, `part-10`
   +1 458, `part-8` +2 176. Táž úvaha jako `ownCut` u `holderFitArea`.

Po opravě 3 je **kapsová větev inertní** — na všech 25 fixtures dává
identický výsledek se zapnutou i vypnutou. V kódu zůstala (je to bezpečnostní
hlídání, ne optimalizace; „na téhle sadě nevystřelí" není důkaz, že nevystřelí
na dílu uživatele), ale je potřeba vědět, že ji sada NEMĚŘÍ.

#### Model se rozchází, když se `passes` ZKRÁTÍ

Líný prefix (týž vzor jako `syncCutFloor`) nestačí: pole se za běhu nejen
plní, ale i zkracuje (`tail.length = dropFrom` u odložených zákroků,
`passes.splice(pi, 1)` u rampy). Model umí jen ubírat, ne vracet materiál
zpět, takže si připisoval řezy průchodů, které nakonec nikdo neudělá.
`residualClamp()` proto při zkrácení pole staví model ZNOVU. Splice doprostřed
se tím neřeší, ale ten je na bezpečné straně (model pak tvrdí, že materiál
stojí).

### Krok 4 — splatit ztrátu zrušením proxy

Postupně, každou zvlášť a se změřením:

1. `stair` (`opts.mainStair` + `clamp.noteMainEnd`) — vypnout, když je
   `orderAwareHolder` zapnutý.
2. Mezní čáry z `interferenceGuides` (`fromInsert: true`) — nechat jen ty, které
   uživatel nakreslil ručně.
3. `isForbiddenSoft` v `holderTrimLeadIn/Out` — nahradit tvrdým testem proti
   zbytku (soft byl kompromis kvůli tomu, že tvrdý test nad hotovým dílem zahazoval
   dno kapsy; nad zbytkem ten důvod odpadá).

**Akceptace celku:** úběr **≥ 76 663,8 mm²** (nakreslený nůž) a **≥ 76 849,6 mm²**
(náhradní držák), tedy žádná ztráta proti dnešku, při nulových nálezech.
`tests/cam-collision-free` zelený v obou standardech, `tests/cam-gcode-regression`
přepsaný vědomě.

### Krok 5 — rozhodnout → ZATÍM NE

Podmínka zněla „zapnout jen při splnění kroku 4". Krok 3 svůj cíl nesplnil
(`part-8` beze změny) a přinesl novou vadu (`part-10`, 2 578 mm²), takže se
**nezapíná**. Příznak zůstává výchozí vypnutý, jako `regionRoughing`
a `booleanRoughing`, a naměřená čísla jsou zapsaná výš.

Co dává smysl zkusit dál, v tomhle pořadí:

1. **Kotva rampy proti POLYGONOVÉMU zbytku.** Tam `part-8` skutečně krvácí
   a výškové pole je tam změřeně 11,2 mm vedle. Tohle je jediný krok, který
   míří na doložený cíl.
2. **`part-10-zapich-casting`** — zjistit, proč tam ořez přidá 1 458 mm²
   úběru a 3 kolize při NEZMĚNĚNÉM počtu průchodů (průchody se tedy jen
   prodloužily, což clamp sám o sobě neumí; jde o následek).
3. Teprve potom krok 4 (rušení proxy) — a ten teď navíc nemá co splácet,
   protože úběr se zapnutým příznakem neklesl, ale vzrostl.

## Mimo rozsah

- **Čelní hrubování** má vlastní hlídání (`holderGuardFace` + `holderBottomProfile`,
  sken po `zListAll`), ne `makeHolderClamp`. Až po podélném a samostatně.
- **Přeplánování POŘADÍ** průchodů (obrobit rameno dřív, aby se vjezd vešel).
  Tenhle plán pořadí bere jako dané a jen ho respektuje.
- **Dokončování** (`makeFinishTipGuard`) — jiná soustava, viz komentář u té funkce.

## Otevřená otázka k rozhodnutí

Co se zbytkem **mimo rozsah 📐**? Dnešní pravidlo (docs/user-guide.md,
§ *Obrábění po úsecích*) zní: mimo rozsah materiál pro **plánování** neexistuje,
pro **kolize** ano. Tracker musí držet totéž, jinak se úsekové obrábění rozbije
— ale znamená to, že zbytek a plánovací obrys jsou **dva různé modely**, ne jeden.

## Pasti, které si to vybere (všechny už jednou stály čas)

- Měřit **úběr**, ne jen kolize. Dvakrát prošla ztráta 75 a 19 mm², kterou
  validátor ani `passCount` neukáže.
- Baseline měřit **ve worktree**, ne přes `git checkout --` (repo se commituje
  průběžně, jinak se kód porovná sám se sebou).
- **Žádný debug kód v pracovní kopii** — skončí v cizím commitu.
- Fixtures často jedou v režimu **RADIUS**; sonda pak měří v poloviční poloze.
- Padající test po změně nejdřív ověřit na čistém HEADu — sada není za gate a
  `vitest` má v tomhle repu `testTimeout` 120 s právě proto, že CAM testy pouští
  celý pipeline.
