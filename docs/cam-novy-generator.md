# Nový generátor hrubovacích drah — jednoduchý soustružnický cyklus

> Plán z 23. 9. 2026 na pokyn uživatele: *„chci úplně nový plán, funkční
> a jednoduchý, tak jak to dělají jiné programy — jednoduché generování drah
> v ISO kódu, kdy dráhy budou dobře. Podívej se, co máme v kódu, co je
> použitelné a co zahodit jako nesmysl. Řešíme to měsíce a pořád dokola:
> vyřeším jeden problém a vyskytne se druhý."*
>
> Tenhle dokument NAHRAZUJE jako směr práce `docs/cam-plan-2026-09-15.md`
> a všechny předchozí plány oprav hrubování. Starý generátor se už
> neopravuje, jen se udržuje v chodu, dokud ho nový nenahradí.

---

## 0. Proč nový generátor (audit v číslech)

| | polovina června | 15. 7. | 1. 8. | 15. 8. | 1. 9. | dnes |
|---|---|---|---|---|---|---|
| řádků CAM kódu (`js/calculators/cam*`) | — | 14 505 | 19 962 | 22 089 | 27 386 | ~31 000 |
| z toho hrubovací strategie | ~500 | | | | | ~8 000 |

- **384 commitů** do CAM od 1. 6. 2026 (červen 121, červenec 113, srpen 94,
  září 56).
- Podélné hrubování dnes tvoří `ops/roughLong.js` (2 236 ř.) + 20 modulů
  v `ops/long/` + `interferenceGuides.js` (646) + `guideOffsetJoin.js` (405)
  + `contourBuild.js` (1 197) + `toolEnvelope.js` (462) + emise
  `roughEmit.js` (745) a `gcodeEmit.js` (1 087).
- Uživatel: *„ze začátku to bylo mnohem lepší, rychlejší a dělalo to aspoň
  jakž takž správně, teď je to spíš extrémní chaos."*

### Pět příčin, proč se opravy točí v kruhu

Doložené jen z jednoho dne (23. 9. 2026) práce na konci jednoho dílu:

1. **Dvě souřadnice najednou.** Dráha je STŘED nosu, polotovar a kontura
   POVRCH. U polygonu (R 0,8) je rozdíl pod rozlišením, u kulaté R 10 je to
   10 mm. Kód psaný pro polygon zapomíná odečíst R — dnes nalezeno SEDMÉ
   takové místo (`holderFitsOverContour`) a falešný „hrb" za čelem dílu,
   který vznikl jen odvalením nosu přes roh.
2. **Umělé hranice úseků uprostřed materiálu.** Díl se dělí na úseky podle
   údolí polotovaru a hrbů kontury; hranice u hrbu leží ve STŘEDU plošiny.
   Odtud „začíná to uprostřed hrbu", rozjeté mřížky hloubek sousedních
   úseků (43,556 × 44,566), mezivrstvy a vrstvy těsně u sebe.
3. **Dva celé plány a výběr jedním číslem.** Pipeline plánuje díl dvakrát
   (s dělením podle hrbů a bez něj) a nechá ten, kde držák méně zajíždí.
   Malá změna kdekoli číslo převáží a PŘEPNE CELÝ PROGRAM — dnes dvakrát
   (zúžený test držáku přepnul polygonu plán, −2,2 % úběru).
4. **Tři modely materiálu.** Plánování (podlaha `cutFloorTab`, offsetová
   čára s vůlí), emise (`rapidStock`) a validátor (`MaterialRemoval`) si
   každý myslí něco jiného. Průchod se naplánuje a pozdější kontrola ho
   jiným modelem zahodí (kapsa za hrbem: 4 hloubky naplánované, pak
   smazané kontrolou odložených vjezdů).
5. **Nic nehlídá požadavky uživatele na jeho dílech.** Pravidla jako
   „nezačínat uprostřed hrbu" nebo „mezi vrstvami nejvýš ap" nejsou test;
   otisk 29 fixtures měří jen ZMĚNU, ne SPRÁVNOST.

Každá nová podmínka přidává větev; každá větev mění, kdy se spustí jiná.
Tohle se neopraví další podmínkou.

---

## 1. Jak to dělají běžné programy — cíl

Sinumerik `CYCLE95`, Fanuc `G71`, Fusion 360 / Mastercam „Profile
Roughing" mají stejné jádro a je krátké:

1. **Materiál k odebrání = polotovar − (díl + přídavek).**
2. **Počítá se v prostoru STŘEDU nástroje.** Zakázaná oblast pro střed =
   (díl + přídavek) ⊕ tvar břitu (Minkowského součet). Kde střed smí být,
   tam je dráha bez podřezu — pro KAŽDÝ tvar destičky stejně. Žádné
   „zvednutí o R", žádné mezní čáry: kam hrot nedosáhne, to vyloučí sám
   tvar břitu v součtu.
3. **Vrstvy po `ap`.** Vodorovná čára na hloubce X protne oblast
   k odebrání → úseky. Každý úsek = jeden řez zprava doleva.
4. **Schody** po vrstvách odebere buď dojezd po obrysu k předchozí vrstvě,
   nebo jeden závěrečný průchod po obrysu (polohrubování) — obojí jednoduchá
   operace nad hotovou oblastí.
5. **Pořadí** plyne z tvaru oblasti, ne z heuristik: vrstvy shora dolů;
   když se oblast pod hrbem ROZPADNE na dvě části, dodělá se celá pravá
   a pak levá (strom zón). Nad hrbem je oblast jedna → vrstva jede vcelku.
6. **Přejezdy** podle JEDNOHO modelu zbytku materiálu: odskok, zdvih nad
   aktuální zbytek, přejezd, sjezd.
7. **Zápichy/kapsy** (materiál za hrbem, kam se zprava nevjede) jen se
   zapnutým zanořováním: rampa pod úhlem zanoření z pravé stěny kapsy.

Tohle přesně odpovídá pravidlům, která uživatel vyslovil (§6.0 v
`cam-pravidla-drah.md`: „dojet vrstvu, pak celou jednu stranu, pak druhou")
— jen bez jediné heuristiky: strom zón je vlastnost geometrie.

---

## 2. Nový algoritmus krok po kroku

Každý krok je čistá funkce v samostatném modulu (cíl ≤ 300 řádků),
vstupem jsou polygony, výstupem polygony nebo seznam pohybů.

| # | Krok | Vstup → výstup | Poznámka |
|---|---|---|---|
| 1 | **Geometrie** | kontura, polotovar, přídavky → `partLoop`, `stockLoop` (svět X/Z) | existuje (`resolvePointsToAbsolute`, `buildStockLoopRaw`), jen se přepojí |
| 2 | **Tvar břitu** | parametry plátku → `insertLoop` (polygon kolem programovaného bodu) | kulatá = kruh R; polygon = roh s úhly ε a natočení + R; upichovák = obdélník šířky b s rádiusy. Existuje základ (`insertWorldLoop`, `toolFootprint`) |
| 3 | **Prostor středu** | `forbidden = partLoop ⊕ insertLoop` (+ čelisti/koník jako zakázané pásy); `reachable = (stockLoop ⊕ insertLoop) − forbidden` | `minkowskiSolidSum`/`polyOffset` v `geomCore.js` už jsou |
| 4 | **Vrstvy** | `reachable`, `ap` → pro každou hloubku X úseky `[zStart, zEnd]` | hloubky od vrchu `reachable` po `ap`, poslední vrstva na dně |
| 5 | **Strom zón** | úseky všech vrstev → strom (úsek je dítě úseku o vrstvu výš, se kterým se v Z překrývá) | rozpad na víc dětí = hrb; pořadí dětí zprava doleva |
| 6 | **Průchody** | strom → posloupnost řezů: DFS, v uzlu shora dolů, pak děti zprava | kapsa (dítě, do kterého se nevjede zprava) → rampa pod úhlem zanoření, jinak se vynechá a nahlásí |
| 7 | **Schody** | řez končící na stěně → dojezd po hranici `forbidden` nahoru k předchozí vrstvě | jedna funkce, stejná pro otevřený řez i kapsu |
| 8 | **Přejezdy** | posloupnost řezů + model zbytku → odskok, zdvih, přejezd, sjezd | jeden model zbytku (`StockModel`/`MaterialRemoval`) aktualizovaný po každém řezu |
| 9 | **Držák** | každý pohyb × obrys držáku × aktuální zbytek | NEJDŘÍV jen hlásit (⚠), zkracovat až ve druhé fázi |
| 10 | **Emise** | pohyby → ISO (Sinumerik/Fanuc/Heidenhain) | existuje (`controlDialect.js`, hlavička/patička) — emise se zjednoduší, protože plán už obsahuje hotové pohyby |

**Čelní hrubování** = týž algoritmus s prohozenými osami (vrstvy po Z místo
po X). **Zleva** = zrcadlení v Z (`zMirror.js`, funguje). **Upichovák** = jiný
`insertLoop` (obdélník), algoritmus stejný.

---

## 3. Co ze současného kódu použít, přepsat, zahodit

### POUŽÍT beze změny (funguje, je obecné)

| Modul | Proč |
|---|---|
| `js/geom/geomCore.js` + Clipper2 | offset, průnik, rozdíl, Minkowski, `toolSweep`, `StockModel` — jádro nového generátoru |
| `materialRemoval.js` (`MaterialRemoval`, `buildStockLoopRaw`) | model úběru pro simulaci a testy |
| `collisionValidator.js` (`validateToolpath`, `holderWorldLoop`) | nezávislá kontrola kolizí — rozhodčí v testech |
| `controlDialect.js`, `gcodeParser.js`, `gcodeSync.js`, `gcodeCollapse.js`, `gcodeMerge.js` | dialekty, čtení programu zpět, převod řídicích systémů |
| `zMirror.js` | hrubování zleva zrcadlením |
| `inserts/*.js` + test `cam-insert-isolation` | princip „každý plátek svůj soubor" zůstává; nový generátor se ptá jen na `insertLoop`, R a úhel zanoření |
| `ops/thread.js`, `threadHelpers.js`, `ops/partOff.js` | závit a upichnutí jsou samostatné operace, s hrubováním nesouvisí |
| `camSimulator.js` (UI), `insertPreview.js`, `toolSlotPreview.js`, `camToolPicker.js`, `cncEditor`/`camEditor` | UI, náhled, knihovna nožů |
| `scripts/cam_quality.mjs`, `cam_sweep.mjs`, `tests/helpers/camHeadless.mjs` | měření — z nich se staví akceptační testy |

### PŘEPSAT (nápad dobrý, provedení zamotané)

| Modul | Co z něj zůstane |
|---|---|
| `contourBuild.js` (1 197 ř.) | jen sestavení kontury a obrobitelného rozsahu; hlídání hran plátku nahradí Minkowski |
| `ops/finish.js` + `finishEmit.js` | dokončování = jedna dráha po hranici `forbidden` s přídavkem na hotovo |
| `gcodeEmit.js` / `ops/roughEmit.js` | emise pohybů z hotového plánu; bez rozhodování o dráze uvnitř emise |
| `calculatePipeline.js` | pipeline bez dvojího plánování a bez „pojistky" |
| `materialRemoval.toolFootprint` / `insertWorldLoop` | základ pro `insertLoop` (krok 2) |

### ZAHODIT (po přepnutí na nový generátor)

| Modul / mechanismus | Proč je navíc |
|---|---|
| `ops/roughLong.js` a celé `ops/long/*` (regiony, `humpMerge`, `intervalScan`, `entryRamp`, `holderFit`, `residualGuard`, `depthTabs`, `alreadyCut`, `chainRelink`, `cutRegistry`, `planCheck`, `plungeLines`, `pocketPass`, `openPass`, `runScan`, `holderTrim`, `holderCheck`, `partingEnvelope`, `insertFlankGuard`, `segUtils`) | nahradí kroky 4–7; strom zón místo regionů, rozpouštění hranic a odložených vjezdů |
| dvojí plánování a „pojistka" v `calculatePipeline.js` | pořadí plyne ze stromu zón, není co vybírat |
| `interferenceGuides.js`, `guideOffsetJoin.js`, `plungeContourBridge.js` (mezní čáry) | co hrot nedosáhne, vyloučí Minkowski s tvarem břitu |
| `booleanRoughing.js` (dvojí cesta scan × boolean) | jedna cesta: průnik vodorovné čáry s `reachable` |
| `ops/roughFace.js` + `ops/face/*` | čelní = krok 4 s prohozenými osami |
| `toolEnvelope.js` (holder clamp, forbidden-region triky), `residualTracker.js`, `residualHolder.js`, `holderGouge.js` | držák = jedna kontrola pohybu proti jednomu modelu zbytku |
| klíče plátků, které existují jen kvůli záplatám (`noseLiftX`, `peakSearchWithinPart`, `sharedLadderAbovePeak`, `holderFitPeakGroupWindow`, `skipPocketsCuttingNothing`, `leadInRapidOverCut`, `pocketLeadOutNoStep`, `plungeGuide*`, `mergesOverHump`, …) | v prostoru středu nemají smysl |

Odhad: z ~8 000 řádků hrubování zůstane kolem 1 500–2 000.

---

## 4. Co MUSÍ platit — akceptační testy (dřív než kód)

Každý požadavek je MĚŘITELNÁ kontrola nad vygenerovaným programem, puštěná
na OBOU dílech uživatele (polygon i kulatá R 10, soubory z 23. 9. 2026
přidat do `tests/fixtures/cam/`) a na stávajících fixtures.

| # | Požadavek (slovy uživatele) | Kontrola |
|---|---|---|
| A1 | vrstvy postupně shora dolů po `ap` | sousední hloubky v téže zóně od sebe ≤ ap; žádná tříska > ap (model úběru) |
| A2 | vrstva nad hrbem jede vcelku | úsek nad vrcholem hrbu není rozdělený |
| A3 | nezačínat ani nekončit uprostřed hrbu | žádný začátek/konec řezu uvnitř plošiny hrbu |
| A4 | dojet schody | po hrubování nezůstane schod vyšší než ap (model úběru proti offsetu) |
| A5 | nepřejíždět, dokud není celá pravá strana hotová | žádný návrat do zóny, kterou už průchod opustil nedodělanou |
| A6 | nezanořovat se strměji, než dovolí plátek | žádný sjezd do materiálu strmější než úhel zanoření |
| A7 | bez kolizí | `validateToolpath` 0 nálezů (syrový i offsetový standard), nakreslený i náhradní držák |
| A8 | nejezdit dvakrát totéž posuvem | žádný řezný pohyb, který nic neubere, delší než X mm |
| A9 | co jde vzít, vzít | úběr ≥ dnešní polygon na témže dílu (85,7 %) |
| A10 | změna pro jeden plátek nesmí pohnout druhým | test `cam-insert-isolation` + otisk jen u fixtures daného tvaru |

**Nejdřív se tyhle testy pustí na STARÝ generátor** — výsledek je výchozí
stav (kolik požadavků dnes neplatí a kde). Nový generátor musí projít
všechny, než se přepne.

---

## 5. Postup — fáze

| Fáze | Obsah | Hotovo, když |
|---|---|---|
| **F0** | akceptační testy A1–A10 + oba díly uživatele jako fixtures; zpráva o starém generátoru | testy běží, víme, co dnes neplatí |
| **F1** | nový generátor: kroky 1–4, 6 (bez kapes), 8, 10; podélně zprava; polygon i kulatá přes `insertLoop`; přepínač v parametrech („Generátor drah: nový / původní"), výchozí původní | na obou dílech uživatele A1–A3, A6–A8 zelené |
| **F2** | strom zón (krok 5), kapsy s rampou, schody (krok 7) | A4, A5 zelené; úběr ≥ starý na dílech uživatele |
| **F3** | držák (krok 9): hlásit, pak zkracovat | A7 zelené s nakresleným i náhradním držákem |
| **F4** | čelní (prohozené osy), zleva (zrcadlo), upichovák (obdélník), dokončování po hranici | všechny fixtures A1–A10 |
| **F5** | nový generátor výchozí; smazat moduly ze seznamu „ZAHODIT" | `npm test` zelené, uživatel potvrdí na svých dílech |

Po celou dobu F1–F4 zůstává starý generátor beze změn v chodu (jen
nezbytné opravy havárií), takže uživatel má čím pracovat.

---

## 6. Co se vědomě NEDĚLÁ

- Žádné mezní čáry, žádné „zvednutí o R", žádné klíče plátku kvůli dráhám
  — rozdíl plátků je JEN v `insertLoop` a úhlu zanoření.
- Žádné dělení na úseky podle údolí polotovaru a hrbů kontury — zóny plynou
  ze stromu průniků.
- Žádné dvojí plánování s výběrem, žádné odložené vjezdy, žádné přeskupování
  průchodů po plánování.
- Žádné rozhodování o dráze v emisi.
- Držák se v první verzi jen HLÁSÍ; chytré obcházení až po F3, pokud bude
  potřeba.

---

## 7. Otázky na uživatele, než začne F1

1. **Schody:** dojezd po obrysu hned v každé vrstvě (jako dnes „Hrub. bez
   schodků"), nebo jeden závěrečný průchod po obrysu po všech vrstvách
   (jako `CYCLE95` s polohrubováním)? Doporučení: závěrečný průchod — je
   nejjednodušší a schody zmizí vždy.
2. **Pořadí u hrbu:** strom zón = dodělat pravou stranu, pak levou (§6.0).
   Polygon na tvém dílu dnes pod hrbem střídá strany — který z těch dvou
   chceš jako pravidlo?
3. **Kapsy za hrbem:** vždy rampou pod úhlem zanoření, nebo vynechat
   a nechat na dokončení / jinou operaci?
4. **Starý generátor:** nechat v přepínači i po F5 jako záložní, nebo
   smazat úplně?

---

## 7a. STAV 23. 9. 2026 (večer) — nový generátor existuje, ale NENÍ VÝCHOZÍ

> **Vráceno:** přepnout ho na výchozí před kontrolou požadavků uživatele
> byla chyba — na dílu uživatele jel posuvem přes údolí polotovaru
> (vzduch) a dojezd schodu udělal šikmý tah přes celé údolí. Výchozí je
> zase původní generátor s opravami z 23. 9.; nový se zapíná jen
> `pathGenerator: 'simple'`. Výchozím se stane, až projde kontrolami A1–A10
> (§4) včetně „žádný posuv vzduchem" na dílech uživatele A uživatel ho
> odsouhlasí.

Uživatel: *„oprav to, aby to fungovalo bez problému a okamžitě"*. Místo fází
vznikl rovnou funkční generátor `js/calculators/cam/ops/simpleLong.js`
(~370 ř.) podle §2, zapojený v `roughingStrategies.js` jako VÝCHOZÍ pro
plátky s klíčem `simpleLongGenerator` (dnes jen kulatá). `pathGenerator:
'legacy'` v parametrech vrací původní generátor.

Co umí: prostor středu (F = offsetová dráha + držák nad dílem, S = polotovar
⊕ nos), vrstvy po ap, strom zón (pravá strana celá, pak levá), vjezd do
kapsy obálkou max(stěna, rampa) — u kulaté cik-cak tam i zpět (klíč
`rampBothWays`), u jednosměrných plátků neúplná rampa; dojezd schodu po
stěně; 1D model zbytku materiálu, proti kterému se v pořadí obrábění
kontroluje držák (co by narazilo, se vynechá a nahlásí).

**Změřeno na dílu uživatele** (`cam_quality`, stejný díl, kulatá):

| R | nový: úběr / třísek>ap (max) / strmé / kolize rychlop. / držák | původní |
|---|---|---|
| 0,8 | 71,7 % / 4 (2,7) / 0 / 0 / 0 | 79,4 % / 28 (4,5) / 4 / 120 mm² / 518 mm² |
| 2 | 72,0 % / 23 (3,6) / 0 / 0 / 0 | 76,4 % / 49 (5,5) / 5 / 26 mm² / 262 mm² |
| 5 | 73,9 % / 30 (5,8) / 0 / 0 / 0 | 80,1 % / 72 (13,0) / 6 / 0 / 15 mm² |
| 8 | 81,0 % / 39 (8,3) / 0 / 0 / 0 | 79,0 % / 75 (9,0) / 1 / 0 / 0 |
| 10 | 81,1 % / 40 (7,5) / 0 / 0 / 0 | 77,7 % / 77 (11,6) / 0 / 0 / 0 |
| 12 | 81,1 % / 40 (10,5) / 0 / 0 / 0 | 75,4 % / 62 (7,8) / 0 / 10 mm² / 0 |
| 10 zleva | 74,8 % / 68 (8,0) / 0 / 0 / 0 | 51,8 % / 158 (18,0) / 6 / 5 mm² / 0 |

U malých R je úběr nižší proto, že nový generátor vynechá, kam by držák
narazil do klínu u stěny (mez úhlu zanoření) — původní tam narážel.
`part-22-round-r10`: nakreslený nůž 5 120,8 → 5 224,3 mm², náhradní držák
5 094,0 → 5 324,1 mm², kolize 0 (dřív 2 nálezy). Ostatních 28 fixtures
(polygon, upichovák, čelní) beze změny.

**Polygon zatím na původním:** nový na dílu uživatele 79,5 % bez kolizí
proti 85,7 % původního — chybí dobírání kapes za hrby pod 15° rampou.
Zapnout `simpleLongGenerator` v `inserts/polygon.js`, až ho dožene.

## 8. Stav k 23. 9. 2026 (před F0)

- Pracovní kopie obsahuje necommitnuté opravy konce dílu pro kulatou
  (klíče v `inserts/round.js`) a audit oddělení plátků s testem
  `tests/cam-insert-isolation.test.js`. Polygon je vůči začátku dne bajt po
  bajtu beze změny, otisk se hnul jen u `part-22-round-r10`.
- Plná sada: 1605/1609; čtyři červené testy byly červené už předtím
  (`cam-finish-holder`, `cam-guide-to-stock-end`, `cam-leadout-step`,
  `cam-pocket-burst-depth`).
- Tyto opravy se v novém generátoru nepřenášejí — patří k modulům ze
  seznamu „ZAHODIT".
