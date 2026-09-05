# Odložené patche — hotové, změřené, čekají na sdílený model zbytku

Čtyři změny z 5. 9. 2026. **Všechny jsou dopsané a změřené**, žádná není
rozpracovaná. Neleží v `main` proto, že každá naráží na TÉHOŽ blokátora:
hlídání v emisi a validátor kolizí mají každý svůj model zbytku a rozcházejí
se (viz `docs/cam-architektura-analyza.md`, krok 1).

Nasazují se `git apply docs/odlozene-patche/<soubor>`; k 5. 9. 2026 všechny
sedí na HEAD.

## 01 — Úseky se dělí podle mezní čáry, ne podle hrbů a údolí

Zavádí podmínku **§6.0a** z `docs/cam-pravidla-drah.md` (pravidlo uživatele):
hranici úseku dělá jen mezní čára hlídání destičky, která VYJEDE z polotovaru.
Hrby a údolí hranici nedělají.

Na dílu uživatele: předčasně zastavených průchodů **12 → 3**, nedojeto
**136,6 → 4,0 mm**; na samotném prvním úseku **0**. Vrstvy přestanou končit na
neviditelných čarách Z 4,20 a Z 62,80.

**Blokuje:** `cam-collision-free` padá na `part-20-zleva-parting-taper`
(8 nálezů, 90° zanoření upichováku) a `holder-casting-slanted-face` (2 × 1 mm²
v offsetovém standardu). Přes sadu −3 400 mm² úběru (úseky nechávají materiál
na svých hranicích — vlastnost pravidla, ne vada).

## 02 — Pořadí úseků podle dosažitelnosti

Jeden řádek: úseky se řadí podle blízkosti k nájezdu, průměr až jako tiebreak.

Přes sadu **+145 mm²**; na dílu uživatele **+57 mm²**, a s patchem 01
**+203 mm² a 43 → 51 průchodů**.

**Blokuje:** 2 nálezy po 0,8 mm² (`part-1`, `part-2`) — `rapid @r42.25 Z110.8`.
Šest hypotéz, co to NENÍ, je v analýze; emise tam měří < 0,5 mm², validátor
0,8. Zmizí to, když se vynechá `noteCutPass` — ale to jen udělá model
pesimistickým, nespraví příčinu.

## 03 — Mřížka hloubek je vlastnost dílu, ne zvoleného rozsahu

Kotva posloupnosti hloubek se bere z CELÉHO polotovaru, ne z ořezaného
rozsahem 📐 (podmínka **§6.0c**). Skim zůstává u povrchu v rozsahu, ale dosedne
na globální mřížku.

Bez toho vyjde týž úsek při každém rozsahu jinak: ze 45 různých průchodů
v pásu Z −17,9…98,6 byl shodný ve všech třech programech uživatele **jediný**.
S patchem mají tytéž hloubky a 12 z 17 průchodů je bajt v bajt stejných.

**Blokuje:** `part-22-zleva-deep-ramp` +2 kolize / +138 mm² s nakresleným
nožem (posun mřížky přeskládá průchody a na tom dílu to padne hůř).

## 04 — Strop dojezdu z kapsy

`findPocketExitZ` nemá jinou zarážku než dno okna: šplhá po protilehlé stěně
kapsy, a když se kontura na hloubku průchodu nevrátí, dojede až na konec.
S patchem 01 (bez hranic od hrbů) z toho byl dojezd **100 mm napříč dílem**.

**Blokuje:** `part-18-parting-90-ramp`, 1 nález 1,0 mm² typu `rapid` — zkrácení
dojezdu posune 45° odskok do místa, kde už držák místo nemá. Je to doložená
mez zapsaná v `docs/cam-pravidla-drah.md` §6.2.

---

## Pořadí nasazení, až bude sdílený model

1. sdílený model zbytku (krok 1 analýzy) — **odemyká zbytek**
2. patch 01 (pravidlo uživatele) + patch 02 (pořadí) — patří k sobě
3. patch 04, pak 03

Patch `useky-podle-meznich-car.patch` v kořeni repa je STARŠÍ pokus ze
7. 8. 2026 (náhrada detekce údolí čárami) a s těmito nesouvisí.
