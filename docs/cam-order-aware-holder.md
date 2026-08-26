# Hlídání držáku podle POŘADÍ obrábění — plán

> Stav: **UZAVŘENO 26. 8. 2026.** Kroky 0–3 hotové, `orderAwareHolder` je
> od téhož dne **výchozí ZAPNUTÝ**. Nálezy s nakresleným nožem
> **4 / 33,4 mm² → 0** za 328 mm² úběru (−0,43 %); G-kód se změnil na
> JEDINÉM dílu (`part-8`, jeden zahozený kapsový vjezd). Krok 4 (rušení
> statických proxy) se NEDĚLÁ — neměl by co splácet.
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

### Krok 3 — zapojit za příznakem ✅ HOTOVO (26. 8. 2026)

Zapojeno v `genLongPasses` za příznakem `orderAwareHolder` (výchozí `false`).

**Rozhodující zjištění: zbytek patří k HLÍDÁNÍ VJEZDU, ne k ořezu intervalů.**
Plán chtěl nahradit `holderClampZEnd` v `applyHolderClamp`. To bylo zkoušeno
ve třech variantách a všechny jsou změřeně horší (tabulka níž). Zbylá vada
nálezu 09 tam totiž vůbec není: `part-8` krvácí na VJEZDU do kapsy
(`#23`, `pocketEntry`, r 17,65, rampa na Z 184,5), který hlídá
`holderFitArea` u `buildPocketPass` — a ten čte VÝŠKOVÉ POLE, o kterém krok 1
změřil, že je právě v pásu Z 117,5–183 až **11,2 mm pod realitou**.

Nasazeno je proto tohle: u kapsového vjezdu se vedle skenu ptá i polygonový
zbytek podél CELÉHO vjezdu (`residEntryArea` → `holderAreaAlongResidual`),
prahem `RESIDUAL_FIT_TOL` (0,5 mm²). Na tom vjezdu najde **30,1 mm²** vnoření
držáku a zákrok zahodí.

#### Výsledek se zapnutým příznakem

| | úběr | kolize |
|---|---|---|
| nakreslený nůž, dnes | 76 663,8 mm² | 4 / 33,4 mm² |
| nakreslený nůž, **zapnuto** | 76 335,8 (−328,0; −0,43 %) | **0 / 0,0** ✅ |
| náhradní držák, dnes | 76 849,6 mm² | 2 / 2,3 mm² |
| náhradní držák, **zapnuto** | 76 518,4 (−331,2; −0,43 %) | 2 / 2,3 (beze změny) |

Mění se **jediný díl — `part-8`**; ostatních 24 fixtures je bit po bitu
shodných. Zbylé 2 nálezy u náhradního držáku jsou
`holder-casting-slanted-face`, což je jiná, dávno doložená mez
(`holderFitsAt` na rampě, viz `EXPECTED` v `tests/cam-collision-free`).
Proti offsetové čáře navíc `part-8` s náhradním držákem spadl z 8 / 69,5
na 5 / 57,3.

Akceptace kroku 3 zněla „4 / 33,4 → 0, ostatní fixtures beze změny" —
splněno. Cena je jeden zahozený zákrok, ne rozpadlý program.

#### Co bylo zkoušeno a ZMĚŘENĚ ZAMÍTNUTO

Nezkoušet znovu; všechno je naměřené na celé sadě.

| Varianta | Výsledek |
|---|---|
| Zbytek NAHRAZUJE obálku v `applyHolderClamp` | úběr 76 664 → **65 979 mm² (−14 %)**, kolize **4 → 67** (31 138 mm²) |
| Zbytek se s obálkou SKLÁDÁ (přísnější z obou) | prakticky totéž — zbytek je dominantní |
| + smí jen ZKRÁTIT, ne zrušit | úběr +1 482 mm², ale `part-10-zapich-casting` +1 457 mm² a **3 nálezy / 2 578 mm²** navíc; `part-8` **beze změny** |
| Ořez i na KAPSOVÉ intervaly (`k > 0`) | po odečtení vlastního řezu **inertní** — identický výsledek na všech 25 fixtures |

Společný důvod, proč ořez intervalů nefunguje: **zkrácený ani zahozený
interval materiál NEODEBERE, jen ho nechá stát** — a další, hlubší průchod ho
pak vezme najednou a projede držákem skrz. Na `part-17` to bylo vidět nejlíp:
průchodů 53 → 44, ale úběr 4 933 → 10 183 mm² a 26 nálezů. Obálka si zahození
dovolit může (modeluje HOTOVÝ DÍL, tedy překážku, která nezmizí); zbytek je
PŘECHODNÝ a správná odpověď na „nevejde se teď" je přeplánovat POŘADÍ, což je
vědomě mimo rozsah.

#### Dvě opravy, bez kterých to nešlo

1. **Musí se odečíst VLASTNÍ ŘEZ zákroku.** Držák se táhne v drážce, kterou
   ten zákrok právě řeže, a jeho obrys začíná u hrotu (u upichováku i u nožů
   z magazínu doslova na něm). Bez odečtení „stojí" materiál těsně za špičkou
   při každém běžném řezu: `part-17` +5 287 mm² a 36 nálezů, `part-8` +2 176.
   Vlastním řezem je vždy jen ta ČÁST dráhy, kterou má nástroj UŽ ZA SEBOU —
   zametená stopa přes celou rampu je moc velkorysá (táž úvaha jako
   u `holderEntryCapZ`).
2. **Model se rozchází, když se `passes` ZKRÁTÍ.** Líný prefix (vzor
   `syncCutFloor`) nestačí: pole se za běhu i zkracuje
   (`tail.length = dropFrom`, `passes.splice(pi, 1)`). Model umí jen ubírat,
   takže si připisoval řezy zákroků, které nakonec nikdo neudělá.
   `syncResidual()` proto při zkrácení staví model ZNOVU. Splice doprostřed
   se tím neřeší, ale ten je na bezpečné straně.

#### Cena — po zrychlení +0 až +25 %

Celý přepočet (`calculate()` × 2 v harnessu, 5 opakování, minimum):

| fixture | vypnuto | zapnuto | před zrychlením |
|---|---|---|---|
| `part-8` | 692 ms | 609 ms (**−12 %**) | +6 % |
| `part-16-face-holder` | 1 052 ms | 1 056 ms (+0 %) | — |
| `part-15-finish-zprava` | 541 ms | 579 ms (**+7 %**) | +72 % |
| `part-13-zleva-flange` | 286 ms | 329 ms (**+15 %**) | +124 % |

(Poslední sloupec je stav před přechodem na sagittu; mezitím ještě revize
odstranila druhou, zahozenou stavbu modelu — viz CHANGELOG.)

`part-8` je se zapnutým příznakem RYCHLEJŠÍ, protože zahodí jeden zákrok
a s ním kus programu.

Zrychlení udělaly dvě věci, obě čistě ve vzorkování:

1. **Oblouky se vzorkují SAGITTOU, ne pevnou délkou tětivy**
   (`ARC_SAGITTA_TOL` v `residualTracker.js`). Emise vzorkuje po 0,1 mm bez
   ohledu na rádius, takže na velkém oblouku sype vzorky, které nic nepřinesou
   (sagitta 0,1mm tětivy na r 50 je 0,000025 mm). Z `L²/(8r) ≤ tol` plyne
   `L ≤ √(8·r·tol)`; chyba je tím shora omezená a počet vzorků klesá
   s odmocninou rádiusu. Na `noteAll`: `part-8` 459 bodů / 82 ms → 249 / 30,
   `part-13` 163 / 18 → 88 / 7. Tolerance **0,01 mm** je nejhrubší, která
   drží mez testu: při 0,04 by `part-15` vyjel na 0,057 mm (mez 0,05).
2. **Dotaz na vjezd vzorkuje po 2 mm, ne po 1** (`step: 2`, `maxSamples: 24`).
   Držák je v ose Z přes 20 mm široký, takže sousední polohy se překrývají
   z 90 % — na výsledku se to neprojevilo vůbec (sweep bit po bitu shodný).

**Zkoušeno a ZAMÍTNUTO:** hromadit vlastní řez PŘÍRŮSTKOVĚ (jen poslední úsek
místo celého prefixu). Vypadá to, že to ruší kvadratickou složitost, ale je to
horší — postupné `polyDifference` nabaluje modelu vrcholy, takže každý další
rozdíl je dražší než jeden rozdíl proti původnímu obrysu (`part-13`
10,4 → 30,8 ms na dotaz).

### Krok 4 — splatit ztrátu zrušením proxy → NEDĚLÁ SE

Zadání znělo „zrušit `stair`, mezní čáry `fromInsert` a `isForbiddenSoft`,
aby se splatil propad úběru". Propad ale nenastal: nasazené řešení stojí
**0,43 %** (328 mm²), ne předpokládaných 5,5 %, a je to JEDEN vědomě zahozený
zákrok, který vjížděl držákem do materiálu. Rušit kvůli tomu tři funkční
statické proxy by byl obchod bez důvodu — každá z nich hlídá něco jiného
a všechny tři mají vlastní změřenou historii.

Kdyby se k tomu někdy vracelo: proxy jsou vyjmenované v sekci *Co UŽ JE
ZMĚŘENO A ZAMÍTNUTO* výš a pořadí měření je `stair` → mezní čáry →
`isForbiddenSoft`, každá zvlášť a přes `cam_sweep --diff`.

### Krok 5 — rozhodnout ✅ ZAPNUTO VÝCHOZÍ (26. 8. 2026)

`orderAwareHolder: true` v `camDefaults.js`. Rozhodnutí uživatele s těmito
čísly na stole:

| | dřív | teď |
|---|---|---|
| kolize, nakreslený nůž | 4 / 33,4 mm² | **0 / 0,0** |
| kolize, náhradní držák | 2 / 2,3 mm² | 2 / 2,3 (jiná, doložená mez) |
| úběr, nakreslený nůž | 76 663,8 mm² | 76 335,8 (−0,43 %) |
| čas přepočtu | — | +0 až +25 %, na `part-8` −12 % |

Co to znamená v praxi: zákrok, který na `part-8` vjížděl **30,1 mm² držáku**
do stojícího materiálu, se už neudělá. Uživatel se o tom dozví z existujícího
hlášení „*Hlídání geometrie (držák): N úsek(ů) polotovaru zůstalo NEOBROBENO
— držák se k nim nedostane*", takže materiál nemizí tiše.

Co se muselo přepsat: snapshoty `cam-gcode-regression`
a `cam-boolean-gcode-regression`. Zkontrolováno položku po položce —
na `part-8` ubyl přesně jeden průchod
(`long{pocketEntry,ramp,contourLeadIn,contourLeadOut,blocked}`, `passCount`
35 → 34), na šesti dalších dílech je G-kód BIT PO BITU shodný a mění se jen
počet v poznámce „Zanořování — N průchodů do kapsy nedosáhlo plné cílové
hloubky" (2 → 1), protože kapsová smyčka končí o jeden zamítnutý pokus dřív.

**Past, kterou to odhalilo:** `cam_sweep --diff` hlásil „mění se jediný díl",
protože porovnával jen úběr a nálezy. Změnu, která nehne ani jedním, přehlédl
— těch šest dílů ukázaly až snapshoty. Kritérium proto nově zahrnuje i POČET
PRŮCHODŮ.

### Krok 6 — kolmé zanoření na umělé hranici ✅ HOTOVO (26. 8. 2026)

První využití modelu MIMO kapsový vjezd. Předchozí oprava zakázala svislé
zanoření (90°, upichovák + Auto) na každé umělé hranici plošně, protože
`entryRangeRamp` při 90° degeneruje na kolmý zápich přesně na hranici a vozí
držák do stojícího materiálu (viz CHANGELOG). Plošný zákaz byl ale jen náhrada
za chybějící model — uživatel 26. 8. 2026: *„zanořování udělej tak, že to půjde
kolmě u toho upichováku, ale hlídat kolizi a nepovolit ho tak, aby držák vjel
do materiálu"*.

`plungeHolderFitsAt(X, zStart, zEnd)` (roughingStrategies.js) popíše svislý
sjezd jako rampu z offsetové čáry kolmo dolů a pošle ho do `residEntryArea` —
tedy do `holderAreaAlongResidual` proti polygonovému zbytku. Práh
`RESIDUAL_FIT_TOL` (0,5 mm²) jako u validátoru. Bez `orderAwareHolder` vrací
`false`: statická obálka na tuhle otázku odpovědět neumí a mlčky ji povolit by
znamenalo vrátit původní kolizi.

**Změřeno** na dílu uživatele (`tests/fixtures/cam-cases/range-parting-plunge`,
podélně + upichovák + Start rozsahu uvnitř odlitku):

| | úběr | průchodů | kolize (offsetová čára) |
|---|---|---|---|
| bez příznaku | 2 310 mm² | 31 | 2 / 5,1 mm² |
| s příznakem | **2 365 mm²** | 32 | 2 / 5,1 mm² |

Na reálném projektu uživatele 2 555 → 2 610 mm². Sada 25 fixtures beze změny
(`cam_sweep --diff` Δ +0,0 mm², 0 nálezů) — kombinaci „podélně + upichovák +
Auto 90° + umělá hranice uvnitř polotovaru" žádná z nich nemá. Regrese:
`tests/cam-range-parting-plunge.test.js`.

Zbylé 2 nálezy toho dílu jsou u ÚDOLÍ (Z≈84,6), ne na hranici, a jsou to
grazy proti offsetové čáře (proti syrové siluetě 0) — viz
`project_cam-entry-holder-approach` v paměti.

### Krok 7 — nájezd průchodu ✅ HOTOVO (26. 8. 2026)

Druhé využití modelu. Poloha, ze které průchod sjíždí na hloubku, se proti
držáku nekontrolovala vůbec (`holderEntryCapZ` běží jen v zanořovací větvi).
Nález uživatele: oranžová stopa `HolderGouge` 0,42 mm² na Z≈105 od sjezdu na
Z≈84 — vzdálený konec držáku ve stoupající kůře odlitku.

**Kolizní je SAMA POLOHA, ne cesta k ní.** Zdvih nad konturu před přejezdem ji
změřeně nechal beze změny, takže `safeRapidTo` na to nestačí; opravit to jde
jen tím, kde průchod začíná.

`entryHolderArea(X, z)` popíše sjezd jako svislici z offsetové čáry a pošle ho
do `residEntryArea`. Nájezd se posune doleva po `DZ_CAP`, dokud držák neprojde.

**Strop posunu `ENTRY_SHIFT_MAX` = 3 mm je nutný**, ne kosmetika: bez něj se
na `range-end-leadout` posunul vjezd tak daleko, že se změnila i příjezdová
cesta — sedm nových průchodů na Z≈173 a s nimi zdvih „Výjezd nad konturu"
skrz kůru, **1 100 mm² kolizí a −647 mm² úběru**. Varianta „nenašlo se →
zahodit interval" je horší ještě jinak: shodit `firstOpen` přeznačí zbytek na
KAPSU a spustí jinou větev (dalších −340 mm²). Správně je **nechat vjezd, jak
byl**.

| | úběr | kolize |
|---|---|---|
| sada, nakreslený nůž | 76 335,8 → **76 403,0** (+67,2) | 0 / 0,0 beze změny |
| sada, náhradní držák | 76 518,4 → **76 573,2** (+54,8) | 2 / 2,3 beze změny |
| díl uživatele | 2 555 → **2 633** (+78) | oranžová 0,42 → **0,00**; ⛔ 2/5,1 → **0/0,0** |

Zisk na obou stranách — na rozdíl od pěti pokusů se STATICKOU obálkou
(`docs/cam-sjednoceni-polotovaru.md`, krok 5), kde tatáž oprava stála
−3 948 mm² a vyráběla nové kolize. Přepsané snapshoty (5 dílů): dvěma
průchodům zmizel příznak `ramp`/`pocketReposition` — posunutý vjezd rampu už
nepotřebuje.

**Poučení pro měření:** ⛔ panel (`validateToolpath`) a ORANŽOVÁ stopa na plátně
(`HolderGouge`) jsou DVA různé detektory. Validátor tenhle nález nehlásil
(0,42 mm² je pod jeho prahem 0,5), zatímco `HolderGouge` ho kreslí. Kdo měří
„co uživatel vidí", musí sáhnout po `HolderGouge`, ne po validátoru.

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
