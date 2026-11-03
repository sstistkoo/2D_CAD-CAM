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
5. **Zbylá porušení (33)** řešit po jednom pravidle (1 sezení = 1 pravidlo,
   `docs/cam-pravidla.md`). Jde o tentýž podélný algoritmus jako na soustruhu,
   takže oprava pomůže oběma. Hlídat otisk soustruhových fixtures.
6. **Meze a rozsahy:** dnes jsou v prohozeném světě vypnuté (varování v ⚠).
   Rozsah X 📐 → rozsah Z' a rozsah Z → X'. Čelisti a koník na karuselu
   rozmyslet s uživatelem.
7. **✂ Po úsecích:** `sectionPlan` se dnes do reálného `calc` nevrací
   (tlačítko ohlásí „Úseky nejsou“). Úseky v Z' jsou úseky po skutečném X,
   a `sectionSteps` (camSimulator.js) by je musel brát z `xLimits`.
8. **Náhled průchodů** (`calc.passes`, kreslí se jen bez G-kódu) se dnes
   vrací prázdný. Prohodit podle tvaru průchodu.
9. **Drobnosti:** komentáře „Výjezd v X/Z“ v prohozeném programu mluví
   o prohozených osách. Na karuselu přejmenovat Zleva/Zprava (spíš „od středu /
   od obvodu“). Prohodit také závit, vrtání, vyvrtávání a upich, nebo je nechat
   postaru (dnes se při nich prohození vypne).
10. **Pravidlo do `docs/cam-pravidla.md`:** připravit NÁVRH „Karusel po X =
    podélné v prohozených osách (x' = z, z' = x), nůž svisle ze smykadla;
    všechna pravidla platí v prohozeném světě“ a dát ho uživateli ke schválení.
11. ✅ **Výchozí zapnutí** — schválil uživatel 3. 11. 2026 večer („na karuselu
    vždy po X“, Cik cak jel na jeho dílu svisle: 218 svislých řezů, 125
    porušení; po X 130 vodorovných, 15 porušení, 0 kolizí). Nový klíč
    `carouselAlongX`, aby se zapnulo i v dnes uložených projektech.
12. ✅ **Hlavička programu** uvádí stroj: `Vygenerovaný kód SINUMERIK 840D -
    KARUSEL` / `- SOUSTRUH` (controlDialect.js; v prohozeném světě opraví
    emitSwapped).
