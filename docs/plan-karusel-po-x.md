# Plán: karusel – hrubování po X v prohozených osách

Stav k 3. 11. 2026. Zadání uživatele: na karuselu je díl velký v X (průměr)
a nízký v Z, na soustruhu je to naopak. Vyladěné je podélné hrubování (po Z:
úseky, Cik cak, kapsy, hrby, zanořování, hlídání držáku), na karuselu ale
dlouhé průchody patří po X. Nůž jde **svisle dolů ze smykadla**. Kdo chce nůž
natočit jinak, nastaví si to sám.

## Princip

Prohozený svět (x' = z, z' = x) je přesně úloha soustruhu. Stůl (Z0) je
„osa“, nůž míří shora (+X'), podélné průchody po Z' jedou po skutečném X.
Stejný vzor jako hrubování zleva v Z-zrcadle (`cam/zMirror.js`):

1. `computeCalculation(S)` při `swapsXZ(S)` přepočítá stav do prohozeného
   světa (`swapState`), spočítá ho beze změny a výsledek vrátí do reálného
   světa (`finishSwappedCalc` → `swapCalcOut`). Prohozený svět se uloží do
   `calc._xz`.
2. `generateAutoGCode(S, calc)` vygeneruje program v prohozeném světě
   (`emitSwapped`) a v textu prohodí X ↔ Z, U ↔ W a G2 ↔ G3. U průměrového
   zápisu násobí skutečné X dvěma a převádí DIAMOF na DIAMON. Prohodí i
   komentáře s pohybem (reference kontury) a hlavičku hrubování.
3. Tlačítka drží skutečný význam: ↔ Čelně (po X) = podélný algoritmus
   v prohozeném světě, ↕ Podélně = čelní, ⇅ Cik cak = cik cak po X.

Kód: `js/calculators/cam/xzSwap.js`. Napojení má 2 řádky na začátku
`computeCalculation` (calculatePipeline.js) a `generateAutoGCode`
(gcodeEmit.js). Přepínač ⟲ „Po X jako podélně“ je v Obrábění, jen na
karuselu (`params.carouselAlongX`, **výchozí zapnuto** od 3. 11. 2026 večer;
starý klíč `carouselSwapXZ` se ignoruje). Do otisku `pathInputsKey` se klíč
počítá jen na karuselu, starý nikdy — soustruhové programy se nemění.

## Hotovo a ověřeno

- `cam_fingerprint` (32 fixtures, baseline ve worktree z HEAD): **otisk
  shodný**, soustruh ani karusel bez přepínače se nepohnul.
- Test `tests/cam-carousel-swap-xz.test.js` (6 testů prošlo): prohození
  textu, řetěz bodů, díl uživatele (fixture `cam-cases/carousel-face-swap-xz`),
  řezy převážně po X (105 vodorovných : 4 svislým), nic pod stůl, nanejvýš
  1 mm za střed, varování o bezpečné poloze.
- Měření `cam_rules_check` na dílu uživatele. Prohozený svět jsem měřil jako
  soustruhový `.camprog`, protože je to stejná úloha:

  | Karusel | Porušení | Kolize |
  |---|---|---|
  | dnešní Čelně (bez prohození) | 44 | 10 |
  | Čelně = podélný algoritmus po X | 29 | 0 |
  | Cik cak po X | 26 | 1 |

  Zbývá u Čelně po X: P5 posuv vzduchem 19, P3 zbytek na dně 5, P3 tenká
  vrstva 2, P7 přes hrb 2, P6 zanoření 1.

## Neověřeno

- V aplikaci (prohlížeč) to zatím nikdo nezkoušel.

## Další kroky (pořadí podle důležitosti)

1. ✅ **`npm test`** – 3. 11. 2026 večer celá sada zelená (299 souborů, 3628 testů).
   HEAD byl červený jen v `file-size-budget` (gcodeEmit.js o 1 ř. nad stropem) – opraveno.
2. ✅ **Simulace se svislým držákem** (3. 11. 2026, `cam/sim/xzSim.js`). Úběr,
   ⛔ validátor, start v materiálu, stopa držáku (`HolderGouge`) i zajetí do
   kontury (`ContourGouge`) se při `swapsXZ` počítají v prohozeném světě nad
   `calc._xz` (vzor jako vyvrtávání v zrcadle, `boreSimFor`). Dráha = skutečná
   `calc.simPath` prohozená bod po bodu (shodná s dráhou parsovanou v
   prohozeném světě, hlídá test). Na dílu uživatele: skutečný svět 12 nálezů,
   prohozený 0; zůstává start v materiálu (Bp X150 Z5) a zajetí do dílu
   závěrečným přejezdem do Bp (svislý pruh u X150). Kreslení nože se neměnilo:
   lokální obrys (profil z nahoru) v pohledu karuselu (X vodorovně, Z svisle)
   už odpovídá svislému noži — ověřit okem v aplikaci (krok 3).
3. **Vyzkoušet v aplikaci** na `projekt_2026-11-03 (2)`. Uživatel musí opravit
   **bezpečnou polohu X150 Z5**: leží v materiálu a program na konci sjede
   přes díl. Bez prohození tam jel dokonce rychloposuvem. Nastavit Z nad díl.
4. ✅ **Měření pravidel v prohozeném světě:** `node scripts/cam_swap_xz.mjs
   soubor.camprog` uloží `soubor.swapxz.camprog` (`swapState`), na něj
   `cam_rules_check`. Měření 3. 11. večer (fixture `carousel-face-swap-xz`,
   ↔ Čelně): **33** porušení, 0 kolizí — P5 posuv vzduchem 22, P3 zbytek na
   dně 5, P3 tenká vrstva 2, P3 tříska > ap 1, P7 přes hrb 2, P6 zanoření 1.
   (Odpoledních 29 bylo měřeno jinou cestou; výchozí hodnota pro krok 5 je 33.)
5. **Zbylá porušení** — měří se na dílu uživatele s Cik cak
   (`tests/fixtures/cam-cases/carousel-zigzag-po-x.camprog` → `cam_swap_xz` →
   `cam_rules_check`), 1 sezení = 1 pravidlo, hlídat otisk soustruhu.
   - ✅ 4. 11. 2026: **P3 tříska > ap (4) a P6 svislé zanoření (1)** — Cik cak
     seskupoval obrácené vrstvy na místo poslední z nich, ale podélné kusy pod
     nimi (X117, X107) zůstaly dřív → G1 svisle 10 mm do materiálu, tříska
     8,9 mm. Oprava v `ops/zigzagReverse.js`: závislé kusy (níž, překryv v Z,
     uzávěr) se zařadí do skupiny podle výšky. 15 → 10 porušení, otisk
     soustruhu shodný, testy Cik cak beze změny.
   - ⚠ 4. 11. 2026 v noci: prodloužení obrácené vrstvy přes vršek až ke stěně
     (commit 3771a81) na dílu uživatele s **ap 6** stáhlo k sobě vrstvy pravé
     strany → program skákal mezi svahy, 23× rychloposuvem nad hrb. Vráceno.
     Teď se obrácená vrstva napojí JEN na krátký zbytek u stěny (≤ 2R + 2ap)
     hned za návratem na výšku (do 4R + 4ap) — u ap 6 zmizel klín u paty
     stěny („nedojeto", 4,15 → 0,53 mm). Test `carousel-zigzag-ap6`. U ap 2
     (fixture `carousel-zigzag-po-x`) zůstává P5 27,5 mm a P7 přes hrb jako
     dřív. Kontrola P7 (`camRuleHump.mjs`) uznává i obrácený směr.
     Pravidlo 20 schváleno uživatelem 4. 11. 2026.
   - ✅ 4. 11. 2026: **P7 přes hrb dřív (1)** — planý poplach kontroly:
     hlásila začátek obrácené vrstvy X109 (jede zleva KE stěně, materiál
     u paty stěny ubírá sama a vrstvy pod ní). `cam_rules_check` teď P7/P8
     u obrácených vrstev Cik cak nehodnotí. 7 → 6. (U čistého Podélně je
     tamtéž skutečný klín pod čarou zanoření, 4,1 mm — z pravidla 6 neodstranitelný
     zprava; řeší ho právě Cik cak nebo obrábění zleva.)
   - ✅ 4. 11. 2026: **P3 tenká vrstva (2)** — planý poplach kontroly. Vrstvy
     se UŽ počítají od vrchu (offsetová čára polotovaru − ap, per úsek,
     `buildDepths` v roughLong.js), kontrola ale tloušťku měřila proti
     nakreslenému odlitku → první vrstva o Přídavek X polotovaru (1 mm) tenčí.
     `cam_rules_check` teď měří tenkou vrstvu proti offsetové čáře (pravidlo
     9); celou kontrolu přepnout nejde — nájezdy jedou ve Vůli X/Z jako ve
     vzduchu (41 falešných P6). Generátor beze změny, čas generování dílu
     uživatele 1,0–1,2 s (před dnešními úpravami 1,0–1,1 s). 6 → 4.
   - ✅ 4. 11. 2026 ráno: **posuv po vršku po ubraném** (ap 6: 43,5 mm, ap 2:
     27,5 mm) — obrácená vrstva se zastaví tam, kde v téže výšce už řezal jiný
     kus téže vrstvy (i jeho dojezdem po offsetu); krátký zbytek k napojení
     projede. Díl ap 6: 8 → 7, díl ap 2: P5 0.
   - ✅ 4. 11. 2026 v noci: **úseky na údolí polotovaru** (pravidlo 1, `stockValleys.js`):
     díl `carousel-zigzag-valley` → Ú1 X 556,3–901 (S7), Ú2 zbytek. Ú2 bral jen spodek
     do X'69 — řetěz ramp se u zářezu V přetrhl (vjezd nenalezen v `rule7Layers.js`)
     a s ním zmizelo dno 447–534 i nižší dno. Teď `pocketsBelowZigzag`: kapsy pod
     spodkem, napřed V, pak nižší dno, pak údolí u osy. Zbytek 3866 → 528 mm², 0 kolizí.
   - ✅ 4. 11. 2026 večer: **údolí za hrbem cik cak** (`ops/zigzagValley.js`, pravidlo 20):
     údolí, kde čára zanoření od hrbu skončí na kontuře, jede cik cak od stěny ke
     stěně místo řetězu ramp po čáře zanoření. Díl `carousel-zigzag-valley` (ap 10):
     zbytek 4589 → 770 mm², 0 kolizí. `cam_rules_check` hlásí víc P3 tříska > ap a
     P6 — dojezd ke stěně pod trojúhelníkem rampy a jízdy po stěnách, stejně jako u
     schváleného spodku cik cak.
   - Zbývá 4: **P3 zbytek na dně** 0,16–0,62 mm nad přídavkem v rozích —
     společný kód se soustruhem, dokončení je sebere.

6. ✅ **Rozsahy 📐** (3. 11. 2026, `swapLimits` v xzSwap.js): rozsah X
   (poloměry) → rozsah Z' (pás), rozsah Z (výška) → X' min/max. Strop X' max
   je pravidlo 12 = „nad výškou se neobrábí a pod materiál se nepodjíždí" —
   na noži shora přesně fyzika. Hlášky ⚠ a komentáře programu mají osy
   prohozené zpět (`swapAxisWords`: jen písmeno za předložkou / „Rozsah").
   **Čelisti a koník** (4. 11. 2026, uživatel: „limity jenom otočit o 90°"):
   výšky. Čelisti dole na stole = X' min (pod ně plátek nesjede, pravidlo 16),
   koník = horní mez X' max (nad ní se neobrábí) + varování, když program nad
   ni vyjede (bezpečná poloha, výjezdy).
7. ✅ **✂ Po úsecích a ➕ Operace** (`cam/sim/xzSections.js`): kroky z plánu
   v prohozeném světě (`calc._xz`), do skutečného stavu jako rozsahy (pás =
   rozsah X, dno = Z od výšky), obrobený polotovar = profil od stolu
   v prohozeném světě prohozený zpět, náhled úseků přes prohozený toScreen.
   Tlačítko ✂ se na karuselu schová u ↕ Podélně (to je čelní). Lathe kód
   (rozsahy kroku) jen přesunutý z camSimulator.js beze změny.
   ✅ Ověřeno se 3 úseky (4. 11. 2026): fixture `carousel-sections3` = soustruhový
   `round-r10-section2-parts` s prohozenými osami; programy úseků po prohození
   os řádek po řádku shodné se soustruhem (`tests/sim-ui-carousel-sections`).
8. ✅ **Náhled průchodů** (`swapPasses`, typ 'xz' v drawToolpath.js).
9. ✅ částečně: komentáře „Výjezd v X/Z" prohozené, tlačítka strany na
   karuselu po X „← Od obvodu" / „→ Od středu". Závit, vrtání,
   vyvrtávání a upich dál postaru (prohození se vypne) — zatím bez potřeby.
10. ✅ (pravidlo 21, schváleno 4. 11. 2026) **Pravidlo do `docs/cam-pravidla.md`:** připravit NÁVRH „Karusel po X =
    podélné v prohozených osách (x' = z, z' = x), nůž svisle ze smykadla;
    všechna pravidla platí v prohozeném světě“ a dát ho uživateli ke schválení.
11. ✅ **Výchozí zapnutí** — schválil uživatel 3. 11. 2026 večer („na karuselu
    vždy po X“, Cik cak jel na jeho dílu svisle: 218 svislých řezů, 125
    porušení; po X 130 vodorovných, 15 porušení, 0 kolizí). Nový klíč
    `carouselAlongX`, aby se zapnulo i v dnes uložených projektech.
12. ✅ **Hlavička programu** uvádí stroj: `Vygenerovaný kód SINUMERIK 840D -
    KARUSEL` / `- SOUSTRUH` (controlDialect.js; v prohozeném světě opraví
    emitSwapped).
