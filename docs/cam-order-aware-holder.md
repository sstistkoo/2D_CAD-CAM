# Hlídání držáku podle POŘADÍ obrábění — plán

> Stav: **návrh**, nic z toho není nasazené. Poslední aktualizace 25. 8. 2026.
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

### Krok 0 — měřicí nástroj

`scripts/cam_sweep.mjs`: přes všechny fixtures vydá **úběr** a **nálezy validátoru**
ve dvou variantách držáku (nakreslený nůž z `DEFAULT_TOOL_MAGAZINE` × náhradní
obdélník) a ve dvou standardech (syrová silueta × offsetová čára).

Bez tohohle nástroje nejde žádný další krok posoudit. Dnešní baseline, kterou
musí vytisknout:

```
nakreslený nůž  úběr 76 663,8 mm²   kolize 4 / 33,4 mm²
náhradní držák  úběr 76 849,6 mm²   kolize 2 /  2,3 mm²
```

**Past:** singleton `S` v harnessu kontaminuje — jeden proces na fixture, a
`zLimits`/`xLimits` doplnit na plnou sadu (harness je MERGUJE, ne přepisuje).

### Krok 1 — akumulátor zbytku ve strategii

Nová třída (nový soubor, `js/calculators/cam/residualTracker.js`):

```js
new ResidualTracker(prms, stockPathSegments)   // seed = buildStockLoopRaw
tracker.notePass(pass)                         // cut(toolSweep(toolFootprint, ptsOf(pass)))
tracker.loops                                  // aktuální zbytek
```

Body průchodu se berou **stejnou konvencí jako `noteCutPass` v `gcodeEmit`**
(rampová kotva → dno), včetně výjimky pro průchod s nulovým dnem — jinak se
model rozejde s emisí. Volá se z `genLongPasses` na místě, kde se průchod
push-uje do `passes`, protože **`passes[]` JE pořadí obrábění** (ověřeno na
part-8: `#1..#32` odpovídá pořadí v G-kódu, ramp/kapsové průchody se do něj
zařazují mezi hloubkové).

**Akceptace:** `tests/cam-residual-model` musí platit i pro nový tracker —
model nesmí být NÍŽ než realita (mez 0,05 mm). Úběr ani G-kód se v tomhle kroku
nesmí změnit ani o řádek (tracker jen počítá, nikdo se ho neptá).

### Krok 2 — dotaz místo obálky

```js
holderFitsInResidual(prms, loops, x, z, backside)   // 1× polyIntersect, ~0,14 ms
clampZByResidual(loops, X, zStart, zEnd, margin)    // hrubý sken + půlení
```

`clampZByResidual` má vrátit **totéž rozhraní** jako dnešní `clamp(X, zStart, zEnd)`:
`null` = start je zakázaný, jinak posunutý `zEnd`. Tím se dá vyměnit za sebe.

Obrys držáku se testuje **zeštíhlený o 0,05 mm** a **s odečtenou destičkou**
u řezných dotazů (`holderCutShrunkLoop` v `gcodeEmit` je vzor) — bez toho test
narazí do drážky, kterou týž průchod právě vyřízl.

**Akceptace:** jednotkový test proti `clampZTowardNegative` na umělé geometrii —
tam, kde je zbytek roven hotovému dílu, musí obě varianty dát totéž ±0,2 mm.

### Krok 3 — zapojit za příznakem

`orderAwareHolder` (výchozí `false`), stejným vzorem jako `regionRoughing` /
`booleanRoughing`. Zapnutý nahrazuje `holderClampZEnd` v `applyHolderClamp` —
**a nově ořezává i kapsové intervaly** (`k > 0`), protože právě tam dnes díra je.

**Akceptace (měřit oběma variantami držáku):** nálezy s nakresleným nožem
4 / 33,4 → **0**, ostatní fixtures beze změny. Úběr se v tomhle kroku
očekávaně PROPADNE (viz tabulka zamítnutých nápadů) — to je v pořádku, splácí
ho krok 4.

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

### Krok 5 — rozhodnout

Zapnout výchozí **jen** při splnění kroku 4. Jinak nechat příznak vypnutý a
naměřená čísla zapsat sem — přesně jako `regionRoughing` a `booleanRoughing`,
které jsou dodnes výchozí vypnuté.

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
