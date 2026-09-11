# Tvar plátku v generátoru drah — co je vytažené a co se ještě může plést

> Vzniklo 10. 9. 2026 na pokyn uživatele: *„a když tak vytáhni do souboru to,
> co by se mohlo ještě plést do jiných plátků či operací při generování drah"*.
> Doplňuje `docs/cam-pravidla-drah.md` (co MUSÍ platit) a `docs/developer.md`
> (který modul co dělá). Tenhle soubor říká, KUDY se zásah pro jeden tvar
> plátku může rozlít do ostatních.

## Proč to vůbec je problém

Generátor drah je JEDEN pro všechny tvary plátků. Tvar do něj vstupoval jako
`prms.toolShape === '…'` na 23 místech, takže oprava pro jeden plátek fyzicky
sahala na dráhy ostatních. Stalo se to letos **dvakrát**:

* **27. 8. 2026** — úprava pro upichovák rozvedla booleovskou a scan-line větev
  na `part-1` s POLYGONÁLNÍ destičkou o 22 mm² úběru.
* **9. 9. 2026** — podmínka pro kulatou destičku se opřela o `plungeClearance`,
  kterou má i polygon; polygonálnímu plátku uživatele zmizela celá vrstva
  a zanoření spadlo z 45° na 15°. **Otisk 29 fixtures to nechytil** a moje
  vlastní rekonstrukce polygonu taky ne — vada byla vidět až na
  UŽIVATELOVĚ souboru s JEHO nastavením.

Proto platí pravidlo: **sdílený kód se ptá `getInsert(prms)`, nikdy
`prms.toolShape`.** Pravidla plátků (`js/calculators/cam/inserts/*.js`) jsou
čistá data bez jediného importu, takže tam nemůže vzniknout cyklus ani
vedlejší efekt.

## Co bylo vytaženo 10. 9. 2026 (audit)

Devět rozhodnutí o tvaru plátku žilo MIMO `inserts/` a sahalo do generování
drah. Všechna jsou teď klíče v pravidlech plátku:

| Kde to bylo | Původní test | Klíč v `inserts/*.js` |
|---|---|---|
| `camMath.js:17` `getEffectivePlungeAngle` | `=== 'parting'` (strop 90°) | `plungeAngleMaxDeg` |
| `camMath.js:17` tamtéž | `!== 'polygon'` → auto 45° | `autoPlungeAngleDeg` (null = dopočítat z tvaru) |
| `contourBuild.js:16` `getToolClearanceRange` | `!== 'polygon'` → null | `hasFlankGeometry` |
| `interferenceGuides.js:355` `insEdgeReachG` | `!== 'polygon'` → Infinity | `hasFlankGeometry` |
| `materialRemoval.js:49` `insertBodyZ` | `=== 'parting'` | `faceBodyZFromWidth` |
| `materialRemoval.js:176` `toolFootprintVisual` | `=== 'round'` | `footprintIsNoseOnly` |
| `toolEnvelope.js:91` kolizní obálka | `new Set(['parting'])` | `bodyInCollisionEnvelope` |
| `calculatePipeline.js:139` varování upichnutí | `=== 'polygon'` | `hasGrooveProfile` |
| `ops/finish.js:326` dokončování po obálce | `=== 'parting'` | `finishAlongEnvelope` |
| `threadHelpers.js:40,61` `partOffGeom` | `=== 'parting'` / `!== 'round' && !== 'parting'` | `partOffCornerR`, `canPartOff` |

**Čistý refaktor — doloženo měřením:** `node scripts/cam_fingerprint.mjs
--diff=…` hlásí **OTISK SHODNÝ** u všech 29 fixtures a G-kód tří
uživatelových `.camprog` souborů (polygon 5°/10°, kulatá 45°) vyšel bajt po
bajtu stejný (SHA-1 `b8e3f947…`, `6e4058e2…`, `173b2a46…` před i po).

### Dvě nesrovnalosti, které refaktor ZACHOVAL (nejsou opravené)

* `canPartOff` (jen kulatá a upichovák) a `hasGrooveProfile` (všechno kromě
  polygonu) se rozcházejí u **závitového plátku**: `threadHelpers.partOffGeom`
  ho k upichnutí nepustí, ale varování z `calculatePipeline` nedostane —
  hlášku vydá až `ops/partOff.js` z `geom.reason`. Polygon dostane hlášky dvě.
  Sjednocení by změnilo pole `errors`, tedy i snapshot — je to vědomě odloženo.
* `tiltDeg` se z `polygon.js` vydává, ale **nikdo se na něj neptá** (slouží jen
  k výpočtu vlastního `tiltedFlank`). Kdo ho uvidí, ať nepředpokládá, že
  natočení jde do drah tudy — jde tam napřímo přes `prms.toolAngle`, viz níž.
* **Neznámý `toolShape`** (poškozený/ručně upravený projekt) se nově chová
  jako KULATÁ i ve `toolFootprintVisual` a `partOffGeom` — dřív tam padal do
  větve „ne-kulatá“ / „neumí upíchnout“. Je to v souladu s dokumentovaným
  chováním `getInsert` („neznámý tvar → kulatá“) a UI jinou hodnotu než
  round/polygon/parting/threading nenabízí, takže na reálný projekt to
  nedosáhne.

## Kdo se dnes na která pravidla ptá

| Klíč | Čte |
|---|---|
| `cutsFullWidth` | `ops/face/insertGuard`, `ops/face/regionRunOut`, `ops/roughFace`, `ops/roughLong` |
| `hasFlankGeometry` | `contourBuild`, `interferenceGuides`, `ops/face/insertGuard`, `ops/face/layerDepth`, `ops/roughFace`, `ops/roughLong` |
| `widthZ`, `cornerR` | `ops/face/insertGuard`, `ops/roughLong` |
| `bodyZ`, `mergesOverHump` | `ops/long/humpMerge` |
| `flatSpanZ`, `noseLiftX`, `envelopeAlongContour` | `ops/roughLong` |
| `faceCoverZ` | `ops/face/regionRunOut` |
| `tiltedFlank` | `ops/roughFace` |
| `guideKinds`, `plungeGuide` | `contourBuild` |
| `plungeGuideCutsContour` | `plungeContourBridge` |
| `rampedApproach` | `gcodeEmit` |
| `footprintIsNoseOnly`, `faceBodyZFromWidth` | `materialRemoval` |
| `bodyInCollisionEnvelope` | `toolEnvelope` |
| `plungeAngleMaxDeg`, `autoPlungeAngleDeg` | `camMath` |
| `canPartOff`, `partOffCornerR` | `threadHelpers` |
| `hasGrooveProfile` | `calculatePipeline` |
| `finishAlongEnvelope` | `ops/finish` |
| `tiltDeg` | **nikdo** |

## Co se ještě může plést (ZBÝVÁ)

### 1. Parametry tvaru se čtou napřímo, mimo pravidla

`prms.toolAngle` (natočení) se čte v OSMI sdílených modulech, `toolTipAngle`
ve čtyřech, `toolClearanceAngle` ve dvou, `toolLength` ve třech. U kulaté
destičky natočení ani vrcholový úhel nedávají smysl (je to kruh), a přesto
je ten kód přečte a spočítá z nich tangens:

| Modul | Co čte | Zábrana |
|---|---|---|
| `ops/roughFace.js:545` | `toolAngle` | ANO — `respectInsertGeometry && hasFlankGeometry` |
| `ops/face/insertGuard.js` | `toolAngle` | ANO — `respectInsertGeometry && hasFlankGeometry` |
| `ops/face/layerDepth.js` | `toolAngle` | ANO — `respectInsertGeometry && hasFlankGeometry` |
| `ops/face/regionRunOut.js:29` | `toolAngle` | **NE** — jen `Math.max(0, …)`, tedy „u upichováku vyjde nula" |
| `ops/long/insertFlankGuard.js:23` | `toolAngle`, `toolTipAngle` | **NE** ve funkci samotné — hlídá až volající (`hasFlankGeometry`) |
| `interferenceGuides.js` | `toolAngle`, `toolTipAngle` | **NE** — běží pro každý tvar, který vydá mezní čáru |
| `collisionValidator.js:65` | `toolLength` s náhradou `|| 10` | **NE** — u kulaté je šířka plátku prázdná a použije se 10 mm |

**Riziko:** kdo tyhle vzorce upraví kvůli polygonu, změní i dráhy kulaté
a upichováku. Správný směr je udělat z nich klíč (`faceCoverZ`, `bodyZ`
a spol. už tak vzniklé jsou), ne přidávat další `if` na tvar.

### 2. Úhel zanoření je v pravidlech, jeho DŮSLEDKY nikde

`getEffectivePlungeAngle` je teď plně řízený plátkem, ale délka rampy z něj
plyne jako `ap / tg(úhel)` a **nemá žádný strop**. Při 5° a ap 2,5 je jedna
rampa 28,6 mm dlouhá v ose Z. Viz nález níž — je to dnes nejtvrdší otevřená
vada polygonu.

### 3. `plungeContourBridge.js` je zapojený, ale vypnutý

Modul umí udělat z mezní čáry zanoření skutečnou konturu materiálu; visí na
klíči `plungeGuideCutsContour`, který má **každý** plátek na `false`.
U kulaté je změřeno, co zapnutí udělá (řezy strmější než úhel zanoření 32 → 7,
pás Z 160–180 z 0 % na 25 %), ale taky co to stojí (tvrdé kolize držáku
4 → 16 a dvě třísky nad ap). Než se spraví řetěz dobírání u levého čela,
zůstává vypnutý.

### 4. Kde `toolShape` legitimně zůstává

`insertPreview.js`, `toolSlotPreview.js` a `camToolPicker.js` — to je UI
(přepínač tvaru, popisky, chipy). S drahami nemají nic společného.

## Audit polygonálního plátku (10. 9. 2026)

Měřeno na uživatelových souborech, `ap 2,5`, nos R 0,8, režim RADIUS:

| Úhel zanoření | Úběr | Největší tříska | Třísek nad ap | Duplicity | Kolize (syrové/offset) |
|---|---|---|---|---|---|
| 15° | 4 627,6 mm² | 3,053 mm | 2 | 0 | 0 / 0 |
| 10° | 4 507,8 mm² | 3,053 mm | 1 | 0 | 0 / 0 |
| **5°** | 4 358,5 mm² | **10,023 mm** | **7** | 0 | 0 / 0 |

**Co je v pořádku:** žádná dráha se nejede dvakrát (duplicitních dvojic
bodů 0 při všech třech úhlech — u kulaté jsou 4), kolize destičky ani držáku
žádné v obou standardech, zajetí do hotové kontury 0.

**Otevřená vada — malý úhel zanoření rozhodí konec dílu.** Rampa dodělání
(`rampCompletion` v `ops/roughLong.js`) se kontroluje proti HOTOVNÍ KONTUŘE
(`rampClearOfContour`), ale proti ZBÝVAJÍCÍMU MATERIÁLU vůbec. Rozjezd rampy
má strop „nejvýš jedna Hloubka (ap)" jen v ose X; v ose Z je to při 5°
28,6 mm, takže přeletí celý sousední hrb, kterého se žádná mělčí vrstva
nedotkla. Na dílu uživatele: `N2560 G1 X25.257 Z20.914 ; Rampa 5.0°` vede
49 mm v Z a v Z 20,9 zabírá **10,02 mm při ap 2,5** (r 34,48 → 24,46).
Při 15° tatáž rampa měří 16 mm, zůstane ve vykopaném prostoru a nikdo si
toho nevšimne.

**Dvě opravy změřené a ZAMÍTNUTÉ 10. 9. 2026:**

1. *Strop `ap` na rampu proti zbytku* (`rampEngageOk` + přerušení řetězu tam,
   kde se nevejde). Vypadá to jako přímočaré vynucení podmínky, jenže řetěz
   dodělání je právě to, co `ap` jinde HLÍDÁ: jakmile se přeruší, klín vezme
   až hlubší vrstva jedním záběrem. Změřeno — třísek nad ap: 10° z 1 na 5,
   15° z 2 na 6, kulatá z 0 na 5 (7,60 mm). Zhoršení na celé řadě.
2. *`noseLiftX: R` u polygonu* (srovnat s kulatou, kde to první třísku `ap+R`
   vyřešilo). Posune celou hloubkovou mřížku a je ztrátový přesně tak, jak
   varuje komentář v `polygon.js`: třísek nad ap 10° z 1 na 2, 15° z 2 na 3,
   5° ze 7 na 10.

Tříska **3,053 mm** na Z 276,3 (r 21,80 → 18,75, dráha X 19,545) je vidět při
VŠECH třech úhlech, takže s úhlem zanoření nesouvisí: vrstva nad ní
(X 22,045, tedy povrch 21,245) tam nechala 0,56 mm stát a další mřížkový krok
si vzal `ap` i ten zbytek. Souvisí s rádiusem nosu a posazením hloubkové
mřížky — a to je právě věc, kterou `noseLiftX` u kulaté řeší a u polygonu je
měřeně ztrátová (bod 2). **Nedořešeno.**

## Rádius plátku (R) není neutrální parametr — nález 10. 9. 2026

Uživatel změnil jen `Rádius (R)` z 0,8 na 1,3 (týž díl, týž úhel zanoření 10°,
týž ap 2,5) a dráhy se měřitelně zhoršily:

| | R 0,8 | R 1,3 |
|---|---|---|
| úběr | 4 507,8 mm² | 4 584,4 mm² |
| největší tříska | 3,053 mm | **3,553 mm** |
| třísek nad ap 2,5 | 1 | **4** |
| duplicitní dráhy | 0 | **1** |
| kolize syrové/offsetové | 0 / 0 | 0 / 0 |

**Proč R prosakuje do drah na třech místech:**

1. **Délka sjezdu na hloubku je `Vůle X + R`.** Poslední kousek příjezdu se
   dojíždí posuvem; při R 0,8 měří 1,80 mm, při R 1,3 už 2,30 mm. Do 10. 9.
   2026 se u polygonu jel RADIÁLNĚ (90°) — opraveno klíčem `rampedApproach`,
   takže se teď jede pod úhlem zanoření všude, kde couvnutí v Z projde.
2. **První tříska na povrchu polotovaru je `ap` + zbytek po rádiusu nosu.**
   3,053 mm při R 0,8 → 3,553 mm při R 1,3, na témže Z 276…280. Klíč, který
   to řeší u kulaté (`noseLiftX`), je u polygonu měřeně ztrátový (viz níž).
3. **Mění se struktura průchodů.** Při R 1,3 vznikne navíc „Průchod 37 (kapsa
   po kontuře)“, který při R 0,8 neexistuje. Jeho nájezd **doslova znovu
   projede dojezd Průchodu 32** (`X40.043 Z138.972 → X41.818 Z129.028`),
   ujede 40 mm posuvem bez jediného úbytku a pak spadne **6,822 mm radiálně**
   (`N2050 G1 X32.045`) — z toho 3,18 mm do materiálu, tedy nad `ap`.

**Proč to hlídání duplicit nechytí.** `makeChainRegistry`
(`ops/long/cutRegistry.js`) ořezává u nájezdu jen SOUVISLÝ PREFIX
(`duplicatePrefix`), aby v řetězu nevznikla díra. Tady je první úsek nájezdu
nový (výjezd z hloubky na konturu) a duplicitní jsou až úseky za ním, takže
prefix je nulový a neořízne se nic. Suffix se u nájezdu ořezávat nesmí — konec
nájezdu navazuje na začátek průchodu. **Nedořešeno.**

**Proč se ten 6,822 mm sjezd nedá jen zrampovat.** `emitFeedToDepth` couvá
v Z o `dx / tg(úhel)`; při 6,822 mm a 10° je to 38,7 mm a test proti
materiálu/držáku takové couvnutí zamítne. Skutečná příčina je jinde: nájezd po
kontuře skončí 6,8 mm NAD hloubkou průchodu a `emitDescendX` ten rozdíl
dojede jedním radiálním řezem. **Nedořešeno.**

## Jak ověřit, že zásah nepřetekl

```bash
node scripts/cam_fingerprint.mjs --save=pred.json   # PŘED
node scripts/cam_fingerprint.mjs --diff=pred.json   # PO  → OTISK SHODNÝ?
node scripts/cam_sweep.mjs                          # úběr × kolize
```

Otisk 29 fixtures **NESTAČÍ** na důkaz izolace plátku: 9. 9. 2026 byl shodný
a dráhy uživatelova polygonu se přesto přepsaly. Vždy dojeď i uživatelův
`.camprog` s JEHO nastavením (`tests/helpers/camHeadless.mjs` → `runCamProg`)
a porovnej G-kód proti `git worktree` na `HEAD`.
