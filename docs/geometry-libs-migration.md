# Plán přechodu CAM na geometrické knihovny

> Clipper2 (booleovské operace, offsety) · Turf.js (prostorová analýza) ·
> Detect-Collisions (rychlý broad-phase filtr kolizí)
>
> Stav: Fáze 0 hotová (15. 7. 2026) · adaptér `js/geom/geomCore.js`

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
| Detect-Collisions | `lib/detect-collisions.js` (1,2 kB) | ❌ CommonJS `index.js` s `require()` | **ROZBITÉ** — je to jen rozcestník z npm balíčku, ne bundle. V prohlížeči nepoběží. Stáhnout browser bundle, např. `https://cdn.jsdelivr.net/npm/detect-collisions/+esm` (~50 kB), a nahradit. |

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

### Fáze 0 — základ (HOTOVO)
Adaptér + testy, úklid přímého importu Clipperu z `js/app.js`,
odstranění rozbité source-map reference. Zbývá: nahradit
`lib/detect-collisions.js` skutečným bundlem.

### Fáze 1 — vizuální odebírání polotovaru v simulaci
*Nízké riziko, nemění G-kód ani snapshoty.*

1. Při startu simulace postavit `StockModel` z `stockWorldPoints`
   (resp. z CAD vybarvení polotovaru — červený `fill` objekt).
2. Obrys plátku (z `buildInsertProfileSegments` / geometrie destičky)
   převést na uzavřenou smyčku relativně ke špičce.
3. Po každém odsimulovaném bloku posuvu: `stock.cut(toolSweep(insertLoop, úsek))`.
   Kvůli výkonu dávkovat (např. po celých průchodech, ne po mikrokrocích)
   a výsledek kreslit v `draw()` místo/přes statické vybarvení.
4. Přepínač v panelu „Zobrazit úběr materiálu“.

### Fáze 2 — hlídání kolizí (destička + držák) jako VALIDACE
*Stará logika dál generuje dráhy; nová je nezávisle kontroluje.*

1. Složit polygon nástroje = plátek ∪ držák (`holderProfile`, nebo obdélník
   holderWidth × holderLength) relativně ke špičce.
2. Po vygenerování drah: pro každý posuvový úsek `toolSweep(nástroj, úsek)`
   × `StockModel` aktuálního zbytku → průnik nad toleranci = kolize →
   zápis do „⚠ Nalezeny problémy“ s číslem bloku.
3. Broad-phase: Detect-Collisions `System` s bounding-boxy zbytkového
   polotovaru; přesný `polyIntersect` až při kontaktu boxů (po dodání bundle;
   do té doby rovnou Clipper2 — pro validaci po průchodech stačí).
4. Přejmenovat checkbox „Hlídat geometrii destičky“ → **„Hlídat geometrii“**
   (`respectInsertGeometry`) a vztáhnout i na držák.
5. Až se validace usadí, teprve nahrazovat `computeInterferenceGuides` /
   `buildHolderBoundaryPts`: mezní čáru zanoření odvodit z
   `polyOffset(dosažitelná oblast nástroje)` místo ručních via-bodů.

### Fáze 3 — hrubovací dráhy z booleovské geometrie
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

### Fáze 4 — plánování přejezdů (rychloposuvy)
Cíl chování (zadání):

- Z **Bezpečné polohy** (`safeX`/`safeZ`) rychloposuvem; **Vůle nad
  polotovarem** (`rapidClearance`) před materiálem → přepnout na posuv.
- Po výjezdu z materiálu do vzduchu jet posuvem ještě `rapidClearance`,
  pak teprve rychloposuv.
- Mezi záběry na téže vrstvě: **Odskok** (`retractDistance` + `retractAngle`)
  a rychloposuv vzduchem k dalšímu regionu.
- **Nikdy nejezdit posuvem po už projeté dráze**: má-li dráha dojíždět dál
  v Z, vyjet rychloposuvem nad polotovar (`rapidClearance`), přejet v Z nad
  místo záběru a sjet tam.

Implementace: každý bod přejezdu klasifikovat proti **aktuálnímu**
`StockModel` (`pointInLoop` / průnik úseku se zbytkem) — „vzduch“ je vše mimo
zbytkový materiál, včetně už obrobených kapes. Z-limity / X-limity
(`S.zLimits`, `S.xLimits`) vstupují jako ořezový obdélník (`rectClip`)
povolené oblasti přejezdů i záběrů.

### Fáze 5 — sjednocení UI zanořování
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
