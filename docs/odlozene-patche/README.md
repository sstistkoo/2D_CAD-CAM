# Odložené patche — hotové, změřené, čekají na svého blokátora

Původně čtyři změny z 5. 9. 2026. **Všechny jsou dopsané a změřené**, žádná
není rozpracovaná. Ležely mimo `main` proto, že každá narážela na TÉHOŽ
blokátora: hlídání v emisi a validátor kolizí měly každý svůj model zbytku
a rozcházely se.

**Ten blokátor padl 5. 9. 2026** — `js/calculators/cam/residualStock.js`
je teď jediná implementace zbytku pro obojí, a rozdíl, který blokoval, se
ukázal jako vada v emisi, ne rozdíl modelů (celý příběh
v `docs/cam-architektura-analyza.md`, „Krok 1 → HOTOVO"). Zbytek téhle
stránky je STAV KAŽDÉHO PATCHE po tom, co blokátor zmizel.

Nasazují se `git apply --3way docs/odlozene-patche/<soubor>`
(`git apply` bez `--3way` na 01 a 02 neprojde — mají hunky bez čísel řádků).

---

## 01 — Úseky se dělí podle mezní čáry, ne podle hrbů a údolí — **STÁLE BLOKOVÁN**

Zavádí podmínku **§6.0a** z `docs/cam-pravidla-drah.md` (pravidlo uživatele):
hranici úseku dělá jen mezní čára hlídání destičky, která VYJEDE z polotovaru.
Hrby a údolí hranici nedělají.

Na dílu uživatele: předčasně zastavených průchodů **12 → 3**, nedojeto
**136,6 → 4,0 mm**; na samotném prvním úseku **0**. Vrstvy přestanou končit na
neviditelných čarách Z 4,20 a Z 62,80.

**Blokuje:** `cam-collision-free` padá na `part-20-zleva-parting-taper`
(8 nálezů, 90° zanoření upichováku) a `holder-casting-slanted-face` (2 × 1 mm²
v offsetovém standardu); k tomu `range-end-leadout` ztratí 71 % úběru (bez
hranic je úsek tak velký, že hlídání zakáže vjezd a vypadnou celé hloubky).
Přes sadu −3 400 mm² úběru (úseky nechávají materiál na svých hranicích —
vlastnost pravidla, ne vada).

**Poznámka po 5. 9.:** dva z těch blokátorů (100mm dojezd z kapsy a rampová
kotva v materiálu) jsou už opravené v `main`, takže čísla výš jsou ke
staršímu základu a chtějí přeměřit.

## 02 — Pořadí úseků podle dosažitelnosti — **ODBLOKOVÁN, čeká na rozhodnutí**

Jeden řádek: úseky se řadí podle blízkosti k nájezdu, průměr až jako tiebreak.

Změřeno na `main` 5. 9. 2026 (30 fixtures, obě varianty držáku):

| | bez patche | s patchem |
|---|---|---|
| úběr (náhradní držák) | 91 089,6 mm² | **91 228,5 (+144,3)** |
| kolize — SYROVÝ standard (hlídá `cam-collision-free`) | 0 / 0,0 | **0 / 0,0** |
| kolize — offsetový standard | 0 / 0,0 | 1 nález / 0,9 mm² |
| díl uživatele (part-21/23) | 3 437,9 mm² | **3 494,7 (+56,8)**, 64 → 66 průchodů |

Dva nálezy `rapid @r42.25 Z110.8 = 0,8 mm²` (`part-1`, `part-2`), které tenhle
patch dřív blokovaly, **zmizely** — byla to vada v `emitDescendX`, ne pořadí
(viz analýza).

**Co zbývá k rozhodnutí:**
1. `holder @r28.55 Z112.9 = 0,9 mm²` na `part-21`/`part-23` (týž díl dvakrát)
   v OFFSETOVÉM standardu. Ten standard není za gatem — je to „seznam práce"
   (viz `validateToolpath`, `opts.planStock`) —, ale nález to je.
2. Patch přeskládá pořadí, takže se mění TEXT programu u většiny fixtures
   (snapshoty `cam-gcode-regression` +/− ~7 000 řádků) při skoro nezměněných
   číslech. Není to regrese, ale je to velká viditelná změna a README plánu
   říká, že 01 a 02 patří k sobě.

## 03 — Mřížka hloubek je vlastnost dílu, ne zvoleného rozsahu — **STÁLE BLOKOVÁN**

Kotva posloupnosti hloubek se bere z CELÉHO polotovaru, ne z ořezaného
rozsahem 📐 (podmínka **§6.0c**). Skim zůstává u povrchu v rozsahu, ale dosedne
na globální mřížku.

Bez toho vyjde týž úsek při každém rozsahu jinak: ze 45 různých průchodů
v pásu Z −17,9…98,6 byl shodný ve všech třech programech uživatele **jediný**.
S patchem mají tytéž hloubky a 12 z 17 průchodů je bajt v bajt stejných.

**Blokuje:** `part-22-zleva-deep-ramp` +2 kolize / +138 mm² s nakresleným
nožem (posun mřížky přeskládá průchody a na tom dílu to padne hůř).

## ~~04 — Strop dojezdu z kapsy~~ — **NASAZENO 5. 9. 2026**

`findPocketExitZ` dostal strop šplhání. Jeho jediný blokátor
(`part-18-parting-90-ramp`, 1 nález 1,0 mm² typu `rapid`) byl opravená vada
v emisi, ne vlastnost patche. Po nasazení: +5,4 mm² úběru přes sadu,
kolize 0 v obou standardech, otisk se hnul na 3 fixtures.

---

## Pořadí nasazení, co zbylo

1. **02** — rozhodnout o těch dvou bodech výš (je to jediný patch, který je
   měřitelně připravený).
2. **01** — potřebuje přeměřit na dnešním `main` a pak dořešit `part-20`
   (90° zanoření upichováku hlídá `plungeHolderFitsAt` výškovým polem, které
   tunel neumí) a `range-end-leadout`.
3. **03** — až po 01, protože oba sahají na skladbu hloubek.

Patch `useky-podle-meznich-car.patch` v kořeni repa je STARŠÍ pokus ze
7. 8. 2026 (náhrada detekce údolí čárami) a s těmito nesouvisí.
