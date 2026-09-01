# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Simulace: zajetí do hotové kontury se vybarví ČERVENĚ** (`ContourGouge`,
  `js/calculators/cam/contourGouge.js`). Když nůž ukousl kus hotového tvaru,
  vypadalo to na plátně stejně jako legitimní řez — materiál prostě zmizel
  (nález uživatele: *„simulace odebere materiál, ale není zobrazeno, že to
  zajelo do hotovní kontury"*). Nově se ta část dílu obarví červeně a
  **zůstane** obarvená i po odjetí nástroje.
  Počítá se ze STEJNÉHO modelu, jaký kreslí úběr — díl (`offsetSilhouetteLoop`
  kontury) MÍNUS zbývající materiál — takže se vybarví přesně to, co je na
  plátně vidět jako odebrané. Silueta dílu se zmenší o 0,05 mm (dokončovací
  průchod jede PO kontuře a z definice se jí dotýká) a ořízne na syrový
  polotovar (kontura vyčnívající před polotovar nikdy materiálem nebyla);
  slivery pod 0,02 mm² se zahazují. Pokrývá `tests/cam-contour-gouge.test.js`.

- **`docs/cam-pravidla-drah.md` — podmínky, které musí dráha splňovat.**
  Pravidla generování byla dosud jen v komentářích u kódu (`ops/` má 45 %
  řádků komentář a 70 odkazů na konkrétní nález na díle) — dobré pro údržbu,
  ale nedalo se podle nich zkontrolovat změna. Nový dokument je sbírá na jedno
  místo: pořadí obrábění, podmínky vjezdu a zanoření (úhel podle tvaru
  plátku), prahy hlídání destičky a držáku i s odůvodněním jejich hodnot,
  „polotovar končí na offsetové čáře", pravidla vyslovená uživatelem („celý,
  nebo vůbec", „napřed se dojede to, co je ve směru dráhy", …) a doložené
  meze, které se nemají znovu otevírat. Každé pravidlo má odkaz na místo
  v kódu, kde skutečně žije; autorita zůstává kód.
- **`scripts/cam_fingerprint.mjs` — „koho všeho se moje oprava dotkla?"**
  Moduly v `cam/ops/` sdílejí DATA, ne jen soubory (`offsetXAt` čte 12 modulů,
  do `passes` zapisuje 12, obálku držáku vidí 6), takže se oprava může
  projevit na dílu, o který vůbec nešlo. Skript vezme otisk G-kódu všech
  26 fixtures (~35 s, jeden proces na fixture kvůli singletonu `S`) a po
  změně vypíše, u kterých se program změnil — u každé i první odlišný řádek:

  ```bash
  node scripts/cam_fingerprint.mjs --save=pred.json
  node scripts/cam_fingerprint.mjs --diff=pred.json
  ```

  Doplňuje `cam_sweep.mjs`, nenahrazuje ho: sweep měří ÚBĚR a KOLIZE (jestli
  je výsledek dobrý), fingerprint SHODU PROGRAMU (jestli se vůbec něco
  změnilo) — stejný úběr může vzniknout z jiné dráhy. U refaktoringu musí být
  otisk shodný bajt po bajtu; takhle se ověřilo všech patnáct řezů při
  rozdělení generátoru.
- **CAM – navazující přímé bloky se slévají do jednoho (program o 13 % kratší).**
  Generátor skládá jeden rovný pohyb ze tří etap, které o sobě nevědí —
  nájezd posuvem k materiálu, vlastní řez a doběh za hranu polotovaru — a ve
  výstupu z toho byly tři bloky po JEDNÉ PŘÍMCE (nález uživatele 27. 8. 2026):

  ```
  N280 G1 Z258.373 F0.25          N280 G1 Z195.278 F0.25
  N290 G1 Z196.278 F0.25    →
  N300 G1 Z195.278 F0.25
  ```

  Nový `cam/gcodeCollapse.js` je POST-ÚPRAVA TEXTU na konci emise: nesahá na
  geometrii, jen slévá bloky, jejichž spojením vznikne doslova stejná dráha.
  Neslučuje se nic s komentářem (`; Rampa 90.0°`, `; Výjezd nad konturu`),
  oblouky, různý (modálně platný) posuv, G0 s G1 ani obrat směru; každé
  sloučení se navíc ověří dopočtem polohy a při nesouhlasu se běh nechá
  rozepsaný.

  Změřeno na 27 dílech: **8 058 → 6 991 pohybových bloků (−1 067, −13,2 %)**,
  na dílu uživatele 495 → 430. Dráha je prokazatelně TOTOŽNÁ — nová je
  podposloupností staré a každý vypuštěný bod leží na spojnici sousedů
  (nejhorší odchylka 1 µm, což je hranice tisku souřadnic). `cam_sweep`
  nehlásí ANI JEDNU změněnou fixture: úběr i kolize sedí na milimetr
  v obou standardech polotovaru. Samo slévání stojí 0,9 ms.

  Na dobu výpočtu drah to nemá vliv — běží až za plánováním. Zkrátí se
  program, blokové krokování simulace odpovídá tomu, co stroj opravdu jede,
  a o něco zlevní parsování programu na simulovanou stopu.
- **CAM – díl se dělí na úseky i podle HRBŮ KONTURY, ne jen podle údolí
  polotovaru.** Vrstvu přeruší schod, osazení nebo obloukové údolí na hotovní
  kontuře stejně dobře jako údolí odlitku — jenže z toho dosud žádný úsek
  nevznikal a průchody se v každé hloubce střídaly zprava doleva a zpátky
  (nález uživatele 27. 8. 2026). Je to ZRCADLO údolí: nad hrbem vrstva projede
  vcelku, trhá se až pod ním — zlom si proto nese `kind` a testy se podle něj
  otočí (`contourPeakSplits` v `ops/long/regions.js`, práh = jedna Hloubka záběru).

  **ROZHODUJE SE MĚŘENÍM, NE PRAVIDLEM.** Rozdělením se každý úsek obrobí jen do
  své hloubky, vedle zůstane stát stěna a do té může vjet držák. Jestli k tomu
  dojde, se staticky rozhodnout NELZE — zkoušeny čtyři testy (schodová evidence,
  `orderAwareHolder`, pořadí zprava doleva, držák nad konturou u hranice) a žádný
  neodělil díly s čistým výsledkem od těch s kolizemi. Plánuje se proto DVAKRÁT
  (s dělením i bez) a porovná se kvalita: vnoření držáku do zbytku a zbylý
  materiál pro dokončování (`ops/long/holderCheck.js`). Dělení se nechá, jen když
  není horší ani v jednom.

  Změřeno na díle uživatele: levá část se teď jede po částech (Z 61–95 celá,
  pak prohlubeň Z 4–61, pak konec Z −8–4) místo střídání; kolize 0, zajezd do
  hotového dílu 0, výjezdů nad konturu 39 → 37. Cena: na dílech s hrbem se
  plánuje dvakrát (4,2 s → 9,5 s na dílu uživatele); díly bez hrbu se nemění
  ani časem (`part-1` 869 ms).

- **CAD – indikátory ve stavovém řádku jsou klikací přepínače.** Indikátory
  `SOU/KAR`, `ABS/INC`, `R/⌀`, `#`, `∠` a `📐` jen zrcadlily hodnoty z ⚙️ Nastavení;
  přepnout se daly výhradně tlačítkem v toolbaru, klávesovou zkratkou nebo
  otevřením dialogu Nastavení (přání uživatele 27. 8. 2026). Klik na indikátor
  teď posune dané nastavení na další hodnotu — u 📐 projde celý cyklus
  *vše → průsečíky → kóty → skryté*. Platí pro dolní statusbar na desktopu
  i horní coord bar na mobilu (společná delegovaná obsluha nad `.coord-ind`
  v `js/ui.js`), včetně long-press precision pointeru (`.coord-ind` přibylo do
  `CLICKABLE_SEL` v `js/touch.js`).

  Vypnutý indikátor se proto už **neskrývá**, jen ztlumí (`opacity: .4`) —
  s `display: none` by po vypnutí nebylo na co kliknout zpátky. Indikátor kót
  má 4 stavy, takže nese i písmeno režimu: **📐V / 📐P / 📐K / 📐–**; tooltip
  u všech indikátorů hlásí aktuální hodnotu i to, co klik udělá.

  Při té příležitosti se sjednotily trojmo opsané přepínače do
  `toggleSnapGrid()`, `toggleAngleSnap()` a `cycleDimsMode()` (`js/ui.js`),
  které teď volá toolbar, klávesy `G`/`Shift+G`/`D` i dialog Nastavení. Klávesy
  `G` a `D` tím konečně aktualizují i indikátory ve stavovém řádku a `D`
  zobrazí toast s novým režimem. `openProject()` nově dorovná i tlačítko a
  indikátor kót (režim kót je součástí uloženého projektu).

### Changed
- **Kolizní vybarvení v simulaci se už nedá vypnout.** Tlačítka 🟧 (kolize
  držáku) i 🟥 (zajetí do kontury) jsou z panelu pryč a obě hlídání běží
  natvrdo (rozhodnutí uživatele 1. 9. 2026: kolize se nemá dát omylem
  vypnout). Zmizel tím i stav `showHolderCollision` z localStorage a
  z `.camprog` — starší soubory s `showHolderCollision: false` se prostě
  ignorují. Vizuální úběr materiálu (⛏) přepínač má dál; hlídání zajetí do
  kontury na něm nezávisí (s vypnutým úběrem si vede vlastní model).
- **Testy – booleovský snapshot ukládal třetinu G-kódu dvakrát.**
  `cam-boolean-gcode-regression` pouštěl VŠECHNY fixtures s vynuceným
  `booleanRoughing = true`, jenže **15 z 27 ho má zapnutý už ve svém
  `.camprog`** — u nich se tedy ukládal bajt po bajtu týž program jako
  v `cam-gcode-regression` a celý CAM pipeline se kvůli tomu proháněl
  dvakrát. Změřeno: 17 z 27 snapshotů bylo shodných v obou souborech,
  tj. **6 363 z 19 976 řádků G-kódu (32 %) leželo v gitu dvakrát**.

  Test teď iteruje jen fixtures, které příznak zapnutý NEMAJÍ (12 z 27) —
  tam booleovská větev opravdu měří něco jiného. Snapshot spadl
  z 11 381 na 4 959 řádků (−56 %) a soubor běží 40 → 24 s. Pokrytí
  neklesá: u zapnutých fixtures je booleovská cesta ta jediná, kterou
  jedou, takže ji pinuje už běžný snapshot.

  Přibyla POJISTKA proti návratu: test hlásí osiřelé snapshoty fixtures,
  které příznak mezitím dostaly do zadání (`vitest -u` je sám nemaže,
  jen je přestane obnovovat).
- **CAM – úklid po dekompozici: šest mrtvých parametrů pryč.** Kontrola
  vyňatých modulů našla destrukturovaná jména, která se v tělech vůbec
  nepoužívají a jen matou čtenáře (ze signatury to vypadá, že se volají):
  `enforceLayerDepth` v `ops/face/holderGuard.js`, `holderShallowBodies`
  v `ops/finishEmit.js`, `S` a `entryRadGc` v `ops/roughEmit.js`,
  `stockCrossingsAt` a `holderEntryReachZ` v `ops/long/regions.js`. Odstraněno
  i z volajících stran. Otisk G-kódu beze změny, sada 1525/1525.
- **CAM – hlavní smyčka vrstev rozříznuta na dvě větve.** `ops/roughLong.js`
  2 060 → **1 256 ř.** Šev vede po dvou větvích `intervals.forEach`, které
  dělají opravdu jinou práci: `cam/ops/long/openPass.js` (293 ř., otevřený
  vjezd zprava) a `cam/ops/long/pocketPass.js` (583 ř., kapsa za bossem se
  zanořením rampou).

  Mutovaný stav jde dovnitř v objektu, ne návratovou hodnotou: obě těla jsou
  plná `return;` (dohromady čtrnáct), takže se předává `rampSt` (kotva rampy)
  a `cnt` (tři počítadla). `iv` je v kapsové větvi `let`, protože se přepisuje
  při postupu do další kapsy.

  Otisk G-kódu beze změny, sada 1525/1525.
- **CAM – emise hrubování má vlastní soubor.** `gcodeEmit.js` 1 494 → **906 ř.**;
  smyčka přes `calc.passes` je v `cam/ops/roughEmit.js` (643 ř.) a dostává
  totéž sdílené emisní prostředí `E` jako `finishEmit`. Vrací `simCounter`
  a `holderShallowBodies` — obojí musí přetéct do dokončování. V `gcodeEmit.js`
  zbyla jen infrastruktura: hlavička, dva modely „kde je materiál", bezpečné
  rychloposuvy a závěrečné slučování bloků. Otisk G-kódu beze změny,
  sada 1525/1525.
- **CAM – čelní hrubování rozděleno do modulů.** `ops/roughFace.js`
  1 251 → **566 ř.**; čtyři post-procesy nad hotovým polem průchodů jdou do
  `cam/ops/face/`: `insertGuard.js` (182 ř., hlídání geometrie destičky),
  `layerDepth.js` (176 ř., vrstva nikdy hlouběji než předchozí),
  `regionRunOut.js` (176 ř., doběh na konci úseku) a `holderGuard.js`
  (237 ř., hlídání držáku). Pořadí jejich volání je závazné — `regionRunOut`
  i `holderGuard` samy volají `enforceLayerDepth`, takže ho dostávají
  parametrem. Otisk G-kódu beze změny, sada 1525/1525.
- **CAM – každá obráběcí operace má vlastní soubor.** Závitování a upichnutí
  byly early-return větve uvnitř `gcodeEmit.js`, dokončování bylo rozeseté
  v `calculatePipeline.js` a `gcodeEmit.js`. Nově:

  | nový soubor | ř. | co |
  |---|---|---|
  | `cam/ops/thread.js` | 116 | `emitThread()` — závitování |
  | `cam/ops/partOff.js` | 95 | `emitPartOff()` — upichnutí |
  | `cam/ops/finish.js` | 461 | dokončovací DRÁHA (`buildFinishPath`, `finishPartingEnvelope`, `clipFinishBand`) |
  | `cam/ops/finishEmit.js` | 389 | dokončovací PRŮCHOD v G-kódu (`emitFinish`) |
  | `cam/controlDialect.js` | 144 | hlavička/závěr/převod řídicího systému |

  `gcodeEmit.js` 2 134 → 1 494 ř., `calculatePipeline.js` 1 028 → 627 ř.
  `controlDialect.js` musel vzniknout kvůli cyklu: moduly operací potřebují
  `buildControlTailLines`, který byl v `gcodeEmit.js`. Nemá vlastní importy,
  takže z něj smí čerpat kdokoli; `gcodeEmit.js` ho reexportuje.

  Chování se nezměnilo: otisk G-kódu všech 26 fixtures je bajt po bajtu
  stejný a sada je 1525/1525.
- **CAM – podélné hrubování rozděleno do modulů (bez jakékoli změny dráhy).**
  `ops/roughLong.js` měl 2 954 řádků a rostl dál. Vyňato osm soudržných celků:

  | nový soubor | ř. | co dělá |
  |---|---|---|
  | `cam/ops/long/segUtils.js` | 74 | čisté funkce nad poli segmentů (dělení, slučování kolineárních, test navazujícího dojezdu) |
  | `cam/ops/long/runScan.js` | 81 | `makeRunScan()` — „stojí tam překážka?" a „kam až se dá jet rovně?" |
  | `cam/ops/long/depthTabs.js` | 180 | `makeDepthTabs()` — výškové tabulky vzorkované po 0,25 mm: povrch offsetové čáry, spodní hrana držáku, podlaha už vyříznutá průchody |
  | `cam/ops/long/residualGuard.js` | 145 | `makeResidualGuard()` — polygonový model zbytku pro order-aware hlídání držáku |
  | `cam/ops/long/holderFit.js` | 123 | `makeHolderFit()` — „vejde se držák?" plošně nad těmi tabulkami |
  | `cam/ops/long/entryRamp.js` | 197 | `makeEntryRamp()` — kde smí začít a kam smí dojet zanořovací rampa |
  | `cam/ops/long/intervalScan.js` | 250 | `makeIntervalScan()` — hledání intervalů na hloubce, obě souběžné cesty |
  | `cam/ops/long/holderTrim.js` | 53 | `makeHolderTrim()` — ořez leadIn/leadOut obálkou držáku |
  | `cam/ops/long/plungeLines.js` | 52 | `makePlungeLines()` — paměť přímek zanoření |

  Generátor je po řezech **2 060 řádků (−30 %)** a všechno kolem hlavní smyčky
  vrstev je venku. Chování se nezměnilo o jediný bajt: každý z osmi řezů byl
  zvlášť ověřen otiskem G-kódu (sha1 výstupu všech 26 fixtures bez řádku
  `Datum:`) a celá sada je 1525/1525.

  Shluky se stavem se vyjmuly jako **továrny** (`makeX(deps)` → objekt), ne
  jako volné funkce, a skládají se v pevném pořadí `runScan` → `depthTabs` →
  `residualGuard` → `holderFit` → `entryRamp` → `intervalScan`. Mutované členy
  (`activeFloorTab`, `cutFloorTab`, `cutFloorSynced`) přitom musely zůstat NA
  vráceném objektu a číst se přes něj — destrukturací by zamrzly na `null`
  a hlídání by přestalo vidět podlahu, kterou mu podstrkuje kontrola
  odložených vjezdů.
- **CAM – plán dráh se počítá, až když je potřeba (panel přestal sekat).**
  Každá obnova panelu (`fullUpdate()`, volá ji čtyřicítka míst) spouštěla CELÝ
  výpočet — i tam, kde se žádný vstup nezměnil: přechod z CAD do CAM,
  přepnutí části programu, obnova UI. Na reálném díle to bylo přes sekundu
  za každý takový klik (nahlášeno uživatelem 27. 8. 2026). Nově se náhled
  počítá ve třech úrovních:

  | situace | co se počítá | měřeno (part-11) |
  |---|---|---|
  | vstupy beze změny | nic, použije se keš | **0,3 ms** × 786 ms |
  | změna v panelu, dráhy ještě nepřepočítané | vše kromě hrubování | **49 ms** × 786 ms |
  | „🔄 Dráhy“ / potvrzená změna | celý plán (jednou, ne dvakrát) | 786 ms |

  Keš (`S._cachedCalc` + otisk vstupů) má vlastní klíč, ne `pathInputsKey`:
  do něj patří navíc `operations`, a naopak do něj NEPATŘÍ text programu —
  plán na něm nezávisí (vzniká z něj jen simulovaná stopa, nově samostatná
  `computeSimPath()`), takže přegenerování programu už nespouští druhý běh
  téhož výpočtu. Dokud si uživatel dráhy nepřepočítá, kreslí se kontura,
  polotovar, offsety, mezní čáry i stopa stávajícího programu (a běží nad ní
  hlídání kolize) — zmizí jen šrafování průchodů, které by stejně ukázalo
  něco jiného, než co je v poli.

  ZKOUŠENO A ZAMÍTNUTO: memoizace uvnitř `calculate()` přes `pathInputsKey`.
  Rozbila 9 souborů testů — otisk nepokrývá všechny vstupy plánu a diagnostické
  seamy se plní až za běhu. Keš, která může vrátit zastaralé dráhy, je horší
  než pomalý výpočet; proto žije v panelu, ne v pipeline.

- **CAM – úseky se jedou od NEJVĚTŠÍHO PRůMĚRU, ne shora dolů podle Z.**
  Region (Z-okno, které se vyhrubuje samostatně) se dosud bral v pořadí, jak
  leží v ose Z. Na díle, kde největší průměr leží na opačném konci, se tak
  začínalo od nejmenšího. Nové pravidlo (zadání uživatele 27. 8. 2026):
  **větší průměr má přednost**, při shodě má přednost **pravá strana** (vyšší Z).

  Zleva se neřeší zvlášť — hrubování zleva je zrcadlo téže cesty (`mirZ`),
  takže „vyšší Z“ v zrcadleném světě je levá strana reálného dílu a pravidlo
  se otočí samo. Změřeno na `part-11-zleva-casting` (obrábění zleva): úseky
  teď jedou v pořadí průměrů **64,5 → 48,1 → 38,6 mm**, dřív obráceně.

  Dotčené tři fixtures (`part-11-zleva-casting`, `part-12-zleva-step`,
  `part-14-finish-holder`): úběr beze změny, počet průchodů beze změny,
  všechny invarianty (kolize, zrcadlení, zajezd, regiony) procházejí.
  Pravidlo bydlí v `ops/long/regions.js` (`orderRegions`).

- **CAM – generátor drah rozdělen podle PLÁTKU a podle OPERACE.** Jeden soubor
  `roughingStrategies.js` měl 4 670 řádků a tvar destičky se v něm řešil na
  23 místech jako `prms.toolShape === '…'`. Znamenalo to, že zásah kvůli jednomu
  plátku může změnit dráhy jinému — což se 27. 8. 2026 též stalo (úprava pro
  upichovák rozvedla obe větve na dílu s POLYGONÁLNÍ destičkou).

  Nově:
  - `cam/inserts/` — **každý plátek má svůj soubor** s pravidly (`parting.js`,
    `polygon.js`, `round.js`, `threading.js` + rozcestník; 163 ř. celkem).
    Generátor se jich ptá — dotazů na tvar v něm zůstalo **0**.
  - `cam/ops/` — **každá operace má svůj soubor**: `roughFace.js` (čelně),
    `roughLong.js` (podélně), `shared.js` (společné meze).
  - `roughingStrategies.js` zbyl jako **rozcestník (30 řádků)**.

  Čistý refaktor: G-kód všech 26 fixtures je **bit po bitu shodný**.

  Dál rozdělené z `roughLong.js` (každý krok ověřen na shodu G-kódu):
  `ops/long/regions.js` (200 ř.) — **kde se díl trhá na úseky a v jakém pořadí
  jedou** (tady se bude měnit pravidlo „nejdřív celá pravá strana“),
  `ops/long/humpMerge.js` (110 ř.) a `ops/long/partingEnvelope.js` (87 ř.).
  Zprava/zleva se nedělí záměrně — „zleva“ není algoritmus, ale ZRCADLO téže
  cesty (`mirZ` v `calculatePipeline.js`, `zMirror.js`); vlastní soubor by
  znamenal duplikát celého generátoru a každou budoucí opravu dvakrát.

- **CAD – automatické popisy R/⌀ se v režimu kót „Průsečíky“ už nezobrazují.**
  Poloměry u oblouků a kružnic, rozměry obdélníku a délka polyline se kreslily
  ve všech režimech kromě „Skryté“, takže v režimu „Průsečíky“ zůstávaly na
  plátně přes celý výkres, i když explicitní kóty byly schované (nález
  uživatele 27. 8. 2026). Jsou to kóty, takže patří jen do režimů **Vše** a
  **Kóty** — `js/render.js` i SVG export (`js/storage/exportImage.js`) je teď
  testují stejnou podmínkou. Ověřeno na oblouku R14, kružnici R10 a obdélníku
  30×20: *vše* → `R14, R10, ⌀20` + rozměry + průsečík, *průsečíky* → jen
  průsečík, *kóty* → popisy bez průsečíku, *skryté* → nic.

### Fixed
- **Simulátor – klik na OBLOUK dráhy (G2/G3) nenašel svůj řádek G-kódu.**
  U úseček klik označí a v panelu zvýrazní odpovídající řádek; oblouk je ale
  v `simPath` ŘETĚZ bodů se stejným `originalLineIdx`, takže ho hit-test
  (`getGSegmentAt`) minul dvakrát — filtrem na G0/G1 i podmínkou „ne vnitřek
  oblouku" (nález uživatele 1. 9. 2026: *„na klik to nereaguje a v G-CODE to
  nevyhledá příslušný řádek"*). Nově se oblouk testuje jako lomená čára celého
  řetězu. Změřeno kliknutím doprostřed každého oblouku: `part-1` 17 oblouků —
  dřív 13× nic a 4× označený CIZÍ (sousední) řádek, teď 17/17 správně;
  `part-4` 20/20, `part-15` 7/7. Tažením se oblouk hýbat pořád nedá (musel by
  se s ním přepočítat i poloměr), proto se vrací bez `p1`/`p2` a s `isArc`.
  Pokrývá `tests/cam-path-pick-arc.test.js`.
- **CAM – hrubování vydávalo doslovné KOPIE právě provedeného řezu a najíždělo
  na ně desítkami milimetrů „rampy" ze surového odlitku.** Nález uživatele
  1. 9. 2026 na dílu ⌀129 × 355 (podélně zprava, polygon 15°, odlitek).
  Čtyři nezávislé příčiny, všechny se sešly na jednom programu:

  1. **Dojezd „bez schodků" dobral NÁSLEDUJÍCÍ interval a ten se vydal ještě
     jednou.** Dorampování strmé stěny i „dodělat vrstvu" protahují dojezd
     rovně na hloubce vrstvy dál doleva — tedy skrz další interval téže
     hloubky. `intervals.forEach` ho ale hned nato zpracoval jako vlastní
     průchod: `Průchod 7` (X49,545 Z214,472→196,278) byl znak po znaku konec
     dojezdu `Průchodu 6`, totéž na X40,545 a X31,545. Dojezd teď svůj dosah
     na hloubce vrstvy zaznamená a pokryté intervaly ořízne
     (`ops/long/openPass.js`).
  2. **Kotva zanořovací rampy se hledala na SYROVÉ siluetě odlitku.**
     `stockEntryRamp` nevěděl nic o pořadí, takže se šplhal na povrch
     odlitku i tam, kde mělčí vrstvy dávno odebraly materiál — `N450 G1
     X49.545 Z214.472 ; Rampa 15.0°` startoval na Z 258,4 (44 mm pracovním
     posuvem vzduchem). Kotva se nově zastaví na povrchu ZBYTKU
     (`ops/long/entryRamp.js`, tabulka `cutFloorTab` jako u hlídání držáku).
  3. **Otevřený vjezd s rampou nehlásil sjetou přímku zanoření**, takže týž
     klín sjelo znovu dokončení ořízlé rampy (`ops/long/pocketPass.js`
     → `notePlungeRun`).
  4. **Krátký sjezd v X se vydával i s celým přejezdem v Z pracovním
     posuvem.** „Zbytek kratší než vůle" se měří jen v X; v Z to bylo
     `N3520 G1 X16.925 Z83.432 F0.25`, tedy 1,79 mm sjezdu a k tomu 5,6 mm
     cesty posuvem 0,25 mm/ot. (`gcodeEmit.js`).

  Dohromady o **12 průchodů méně na sadě fixtures při NEZMĚNĚNÉM úběru**
  (88 232,1 → 88 232,1 mm², kolize 0/0 v obou standardech; na dílu uživatele
  59 → 54 průchodů a zbytek 7 645,6 mm² beze změny).
- **CAM – kolmé zanoření je u plátku s úhlem < 90° zakázané; vrstva se místo
  něj vynechá.** Rozhodnutí uživatele 1. 9. 2026: *„ať to nezajíždí kolmo, to
  je zakázané při takovém plátku; když tak ať to vynechá tu dráhu… když to
  nejde, tak to nemůže dělat, jako by to byl upichovák."* Vjezd stojící na
  umělé hranici (rozsah 📐, hranice úseku, posunutý start zanoření), pro který
  se nenajde rampa, se proto nevydá — je to táž větev, jakou vjezd na hranici
  rozsahu má odjakživa, jen se dosud nevztahovala na vjezd posunutý obálkou
  držáku. Na dílu uživatele zmizel `N3210 G1 X13.545 F0.25`, tedy 3 mm
  radiálního záběru polygonem natočeným o 15°.

  Cena je změřená a zvolená vědomě: **−183,8 / −200,5 mm² úběru** na sadě
  (0,2 %) při **nezměněných kolizích** (0/0 v obou standardech). Materiál si
  vezme dokončování — a **⚠ panel to hlásí** („Zanořování: N vrstev
  vynecháno…"), protože tiché zahazování průchodů je v tomhle generátoru
  opakovaná past. Svislého zanoření (90°, upichovák) se pravidlo netýká: tam
  rampa neexistuje a kolmý zápich je vlastní provoz plátku. Otisky počtů průchodů v `cam-stock-span-depths`
  a `cam-residual-clamp` jsou k tomu datu upravené — u druhého jmenovaného
  přestal být `orderAwareHolder` inertní mimo `part-8` (polygonový model
  najde konflikty, které výškové pole nevidí; podrobně
  v `docs/cam-pravidla-drah.md` §3.1).
- **CAM – vjezd posunutý obálkou držáku se zanořoval KOLMO, i když je
  Zanořování zapnuté.** Bránu rampy tvořilo `iv.zStart >= entryZ`, tedy „vjezd
  sedí přesně na umělé hranici". Hlídání držáku ale posune začátek prvního
  intervalu doleva (`iv0.zStart = zTry`), takže brána propadla a průchod sjel
  na hloubku radiálně — na dílu uživatele `N3190 G0 X20.550 / N3200 G1 X13.545
  F0.25`, tedy 3 mm zápichu polygonem natočeným o 15° (nález 1. 9. 2026:
  *„jede mi tam plátek přímo dolů v ose X a mám zanořování 15 stupňů"*).

  Posunutý vjezd si teď hledá **vlastní kotvu** `stockEntryRamp` — přímku
  zanoření skrz skutečný vjezd, ne zpátky na hranici, odkud ho držák odsunul —
  takže `zStart` zůstává a úhel rampy je přesně úhel zanoření. Kotva je
  ZÁMĚRNĚ lokální (nevstupuje do řetězu `rampSt`), při nezdaru se vrstva
  nevynechává a rampa musí projít hlídáním držáku PODÉL sebe, a to oběma
  modely (`holderFitAreaAlong` + `residEntryArea` s prahem `ENTRY_FIT_TOL`).
  Bez kterékoli z těch tří podmínek to stálo 255–291 mm² úběru nebo přidalo
  4 nálezy držáku — čísla a měření v `docs/cam-pravidla-drah.md` §3.1.

  Takhle je to **na celé sadě zdarma**: úběr 80 307,5 / 83 265,7 mm² beze
  změny, kolize beze změny, mění se jen ZPŮSOB vjezdu (`part-17-long-parting`
  a díl uživatele). Hlídá `tests/cam-shifted-entry-ramp.test.js`.
- **CAM – vizuální úběr odebíral i prostor pod břitem, kde nástroj není.**
  `toolFootprintVisual` sjednocoval obrys destičky s OBDÉLNÍKEM přes celý její
  Z-rozsah. U nakloněné destičky (natočení 15°, hrana 10 mm → Z-rozsah 12,2 mm)
  tím vyplnil klín hřbetu: 2 mm vlevo od špičky sahá skutečný obrys na
  r + 4,4 mm, obdélník tam „odebral" všechno od úrovně špičky. Nález uživatele
  1. 9. 2026 („odebírání v simulaci nesouhlasí tvaru plátku, dole to vypadá,
  jako by tam byl nějaký obdélník"). Nešlo jen o obrázek — týmž obrysem odečítá
  materiál i `residualHolder`, `HolderGouge` a validátor, takže model tvrdil,
  že je pryč materiál, který stojí. Tělo nad břitem se teď ZAMETÁ v ose X
  (`toolSweep`), takže drží spodní hranu i hřbet destičky. G-kód se nezměnil
  ani na jedné fixture, zbytek na dílu uživatele 7 645,6 → 8 022,0 mm²
  (o tolik model dosud lhal), kolize 0/0.
- **CAM – pravidlo „nepřejíždět, dokud není celá strana hotová" (§6.0)
  se zahazovalo měřením.** Od 27. 8. 2026 se hrubování plánovalo dvakrát —
  s dělením podle hrbů kontury a bez něj — a `planQuality` rozhodla, který
  plán se nechá. Na dílu uživatele (⌀111 × 350, upichovák, podélně zleva)
  padalo pravidlo pokaždé: dělení se spočítalo (8 úseků) a pak vyhodilo,
  takže se vrstvy kolem každého hrbu střídaly vlevo–vpravo–vlevo. Uživatel to
  hlásil opakovaně; **24 takových návratů** v jednom programu.

  Příčiny byly tři a všechny na straně toho měření:

  1. **Duplicitní okna úseků.** Rozpuštěná DOLNÍ hranice regionu sahala rovnou
     na −∞, takže okno přeskočilo i hranice, které drží, a týž interval vydal
     ještě jeden region níž. Z 112 průchodů bylo **6 duplicitních** — `X63.545
     Z196.3…256.6` vydaly dva různé regiony. Nově se jde po sousedech dolů
     jen po PRVNÍ hranici, která drží (`ops/roughLong.js`).
  2. **Metrika neuměla plány rozlišit.** `planQuality` brala MAXIMUM přes
     průchody, takže jeden velký zákrok společný oběma plánům ji nasytil:
     na `part-1` vyšlo 272,84 mm² pro plán s dělením i bez něj, ačkoli
     validátor jednomu napočítal 20 nálezů / 103,7 mm² a druhému nulu.
     Nově se plochy SČÍTAJÍ (`ops/long/holderCheck.js`).
  3. **Vetovala i cena.** Plán s dělením je z principu o něco dražší (každý
     úsek se dodělá do své hloubky a u hranic zůstane materiál pro jinou
     operaci), takže ho kritérium `residual` zamítalo, i když byl čistý —
     na dílu uživatele −399 mm² proti NULE kolizí. Vetovat smí nově jen
     DRŽÁK, tedy proveditelnost (`calculatePipeline.js`).

  Změřeno (sweep, 27 fixtures × 2 držáky):

  | | úběr | kolize |
  |---|---|---|
  | náhradní držák | 88 726,1 → **88 232,1** mm² (−494) | **47 / 207,9 → 0 / 0,0** |
  | nakreslený nůž | 85 235,9 → **85 235,9** mm² (0) | **9 / 15,8 → 2 / 4,9** |

  Na dílu uživatele alternace **24 → 0** při nule kolizí (průchodů 69 → 75,
  úběr −399 mm², které ⚠ panel hlásí jako pět vynechaných odložených
  zanoření). `tests/cam-collision-free` je poprvé zelený s PRÁZDNÝM seznamem
  výjimek — odtud zmizel `holder-casting-slanted-face` i `part-8`.

  Pořadí úseků se neměnilo: seřadit je po směru jízdy místo „největší průměr
  první" bylo změřeno a ZAMÍTNUTO (samo o sobě 122 nálezů, po opravě metriky
  0 / 0,0 → 2 / 1,5).
- **CAM – upichovák zajel tělem do hotového dílu na mírném kuželu.** Hlídání
  šířky plátku u stěny (`clampPartingBody` v `ops/long/intervalScan.js`)
  testovalo překážku JEDINÝM bodem 0,05 mm nad začátkem intervalu. Na kuželu
  ~10° od osy tam offset stoupne o 0,009 mm, tedy pod řeznou tolerancí
  0,01 mm — stěna se minula **o 1,1 µm** (40,5539 proti prahu 40,555)
  a odsun se nespustil, ačkoli obrys plátku o 4,2 mm dál ležel 0,33 mm
  v kontuře.

  Nález uživatele 1. 9. 2026 (⌀111 × 350, upichovák b = 5, podélně zleva):
  `N1770 G1 X40.545 Z133.314 ; Rampa 90.0°` — špička seděla na offsetu na
  tisícinu přesně (40,545 = 40,545) a plátek přitom ukrojil **0,18 mm²**
  z hotového dílu na Z 129,1. ⛔ panel to neukáže: validátor hlídá polotovar
  a držák, tedy „narazil jsem do něčeho, co tam stojí" — zajezd do HOTOVÉHO
  tvaru je opačná otázka.

  Test se ptá **celého okna těla** (−R … b−R od špičky), jak zní pravidlo
  v `inserts/parting.js`: „maximum předlohy přes celé to okno, ne jen bod
  špičky". Detekce se jen rozšiřuje (bod 0,05 mm v okně zůstává) a velikost
  odsunu se nemění, takže dosud chytané případy jedou stejně. Změřeno:
  **otisk všech 26 fixtures bajt po bajtu shodný**, sweep beze změny
  (úběr i kolize), na dílu uživatele 1 → **0** zásahů plátku do dílu za
  cenu 2,4 mm² úběru.

  Nová fixture `part-20-zleva-parting-taper` (díl uživatele) a plošný
  invariant `tests/cam-parting-body-gouge.test.js` nad všemi upichovacími
  fixtures: obrys plátku nesmí zasáhnout do hotového dílu (< 0,05 mm²;
  nález, kvůli kterému test vznikl, byl o dva řády vyšší).
- **PWA – offline cache neobsahovala CAM generátory hrubování.** Seznam
  `ASSETS` v `sw.js` se od rozdělení strategií do `cam/ops/` a `cam/inserts/`
  neregeneroval, takže v něm **19 souborů chybělo** — celý strom `ops/`
  (včetně obou generátorů průchodů), všech pět `inserts/` a `gcodeCollapse.js`.
  Online se nic neprojevilo (nekešované moduly se prostě stáhly ze sítě),
  offline by se ale CAM hrubování nenačetlo. Opraveno `npm run sw` (cache
  `skica-v236` → `v238`; seznam teď sedí i na všech 14 souborů
  v `cam/ops/long/`). Pro příště: **po přidání JS souboru spustit
  `npm run sw`.**
- **CAM – zvýrazněný řádek G-kódu šel o BLOK POZADU za nástrojem.**
  `getActiveCodeLineIdx()` zaokrouhlovala polohu simulace DOLŮ, jenže bod
  `simPath` nese číslo řádku, který ho VYROBIL — bod pod aktuální pozicí tedy
  patří bloku, který už dojel. Svítilo `N130 G0 X150 Z5`, když nástroj už jel
  `N140 G0 Z258.386` (nález uživatele 27. 8. 2026); pruh pod plátnem přitom
  ukazoval správný pohyb, protože `showMotionInfo` bere `pNext`. Zaokrouhluje
  se nahoru, takže stojí-li simulace PŘESNĚ na uzlu (krok po blocích), svítí
  pořád blok, který tam dojel.

### Added
- **CAM – klik na řádek v G-kódu přesune simulaci na ten blok** (přání
  uživatele 27. 8. 2026). Nástroj se postaví na KONEC bloku — stejně jako po
  kroku šipkami, takže obojí nechá program i nástroj ve stejném stavu.
  Řádky bez pohybu (komentář, M-kód, `G96`…) v dráze žádný bod nemají, na ty
  se simulace nehne (`seekToLine` vrátí `false`).
- **CAM – práh vnoření držáku při VJEZDU byl přísnější než kterékoli měřítko
  (čtyři díly přišly o celý průchod).** `ENTRY_FIT_TOL` zůstal na hodnotě 0,1 mm²
  z měření, kdežto validátor i zbytek pipeline pracují s 0,5 mm²
  (`RESIDUAL_FIT_TOL`). Vjezdy s vnořením mezi těmi dvěma čísly se proto
  zamítaly, ačkoli je žádné hlídání nehlásí.

  Změřeno sadou 25 fixtures v obou standardech polotovaru (`cam_sweep`):
  návrat na 0,5 mm² dá **+103,6 mm² úběru** s nakresleným nožem a **+29,7 mm²**
  s náhradním držákem, **kolize se nezměnily vůbec** (0 / 0,0 mm², resp.
  2 / 2,3 mm² před i po). Po dílech: `part-18` +58,5 mm² (43 → 44 průchodů),
  `range-end-leadout` +23,7, `part-15` +20,4 (32 → 33), `part-10` +0,3;
  `holder-region-roughing` s náhradním držákem −14,6 mm² (40 → 39) při nule
  nálezů. Tím jsou zase zelené `cam-pocket-lift` a `cam-stock-span-depths`,
  které na tenhle úbytek narazily už 27. 8. (33 → 32 průchodů, odstup
  83,518 → 83,018) — nebyla to zastaralá čísla testů, ale skutečný úbytek.
  Přepsané snapshoty: 8 fixtures (posun vjezdu o 0,25 mm, jinde průchod navíc).
- **CAM – vrstva pokračuje přes nízký hrb místo odskoku a nového zápichu.**
  Vrstva rozdělená hrbem se vždycky přerušila: průchod dojel k hrbu, odskočil,
  vyjel nad konturu a ZA hrbem se znovu zapíchl. Když ale dojezd „bez schodků“
  na vrchol hrbu stejně vyjede, nemá se otáčet — sjede po obrysu na druhou
  stranu a pokračuje v téže vrstvě (přání uživatele 27. 8. 2026: „napřed se
  dojede to, co je ve směru dráhy“; jeho příklad `N500 G1 X51.281 Z218.418`).

  Tři věci, které to muselo splnit, všechny vzešly z měření: sjezd jde PO OBRYSU
  (kolmý udělá schod tam, kde je stěna šikmá nebo oblouková); u upichováku po
  OBÁLCE plátku, ne po holem offsetu (jinak tělo vjede do stěny — 19 mm²
  zajezdu do hotového dílu); a řez od dosednutí dolů musí být celý otevřený
  (bez té kontroly projela rovná dráha stojícím dílem — 428 vzorků zajezdu).

  Změřeno na díle uživatele: úběr **beze změny** (5 407 mm²), kolize 0, zajezd
  do hotového dílu 0, o jeden zápich a jeden výjezd nad konturu míně. Platí
  zatím jen pro UPICHOVÁK: první verze se u ostatních tvarů spouštěla na drobných
  rozdílech hranic intervalů a rozvedla booleovskou a scan-line větev na
  `part-1` (polygon) o 22 mm² úběru — chytil to `boolean-roughing-wiring`.

- **CAM – upichovací plátek zajížděl TĚLEM do hotovní kontury.** Sken řezných
  intervalů zná jen bod špičky, jenže upichovák řeže CELOU spodní hranou šířky b.
  Když průchod začal těsně pod stoupající stěnou, jeho zadní část (b − R za
  špičkou) ležela UŽ V TÉ STĚNĚ, tedy v hotovém díle. Nález uživatele
  27. 8. 2026 (`N2710 G1 X34.545 Z115.088 ; Rampa 90.0°` a všechny podobné
  pod ní) — a Čelní strategie na to guard už měla („Hlídání upichováku:
  22 čelních průchodů zkráceno“), podélná ne.

  Začátek intervalu se nově odsune o šířku těla, ale JEN když ho shora
  ohraničuje kontura (`blockedAt` těsně nad ním); když interval začíná ve
  vzduchu (konec polotovaru, hranice rozsahu), nemění se nic. Změřeno na díle
  uživatele: zajezd do dílu **190 vzorků (největší 33,6 mm²) → 0**, úběr
  5835 → 5407 mm² (materiál u stěny, na který široký plátek fyzicky
  nedosáhne), kolize zůstávají 0. Na `part-17-long-parting` úběr BEZE ZMĚNY
  (4920,3 mm², +1 průchod), na `range-parting-plunge` také beze změny.
  Vynechané vrstvy hlásí varování, ne ticho.

- **CAM – „Výjezd nad konturu“ jezdil skoro vždy až nad vrch polotovaru.**
  `safeRapidTo` zvedalo nástroj natvrdo na `rapidTopX + vůle`, tedy nad
  NEJVYŠŠÍ místo dílu, i když přejezd v Z potřeboval překonat jen nízký schod
  (nález uživatele 27. 8. 2026: „skoro pořád to vyjíždí až nahoru, i když
  nemusí“). Čelní strategie už správný vzor měla: navzorkovat strop
  (`travelTopXAtZ`) po celém rozpětí přejezdu a zvednout jen tam — podélná
  cesta ho teď používá také, včetně OVĚŘENÍ týmiž predikáty (destička,
  plánovací obrys, držák); když nižší zdvih neprojde, platí dál vrch polotovaru.

  Změřeno na díle uživatele: z 37 výjezdů jich **36 jelo na X68,5**; nově
  6× ~30 mm, 14× ~40, 11× ~50, 8× ~70 a jeden závěrečný na X150. Program
  615 → 588 řádků, úběr i kolize beze změny.

  Výška se KVANTIZUJE na 0,01 mm: `travelTopXAtZ` vzorkuje offsetovou smyčku
  a při zrcadlení (hrubování zleva) padnou vzorky na zrcadlená Z, takže bez
  kvantizace vyšla výška o 1 µm jinak a padla parita (`X46.170` × `X46.169`).

- **CAM – nesmyslný výjezd `G0 X486708894.740` při úhlu zanoření 90°.** Kotva
  rampy (`stockEntryRamp`, zrcadlově `findRampOutTarget`) se krokovala po Δz
  a X dopočítávala jako `t × tan(úhel)`. U upichováku je Auto = **90°**,
  a tan(90°) = 1,6·10¹⁶ — „krok 0,5 mm v Z“ tedy znamenal skok 8·10¹⁵ mm v X
  a přesně to se vydalo do NC programu (nález uživatele 27. 8. 2026, 21 tako-
  vých řádků v jednom programu).

  Nově se přímka zanoření krokuje **jednotkovým směrovým vektorem** podle
  dominantní osy: do 45° vyjde krok přesně 0,5 mm v Z (bod po bodu totéž co
  dřív, takže stávající díly se nehnuly), nad 45° se skenuje po 0,5 mm v X
  a při 90° vyjde čistý svíslý zápich. Na díle uživatele vychází místo
  `X486708909.740` správných `X65.435` (povrch polotovaru v daném Z),
  kolize zůstávají na nule. Zamčeno plošným invariantem
  `tests/cam-gcode-sane-coords.test.js` (žádná souřadnice nad 10 m) nad všemi
  fixtures včetně nové `part-18-parting-90-ramp` — díl uživatele.

  Nová fixture rovnou ukázala, že invariant `cam-ramp-chain` neznal řetězení
  UPICHOVÁKU (přesun jde v úrovni předchozího dna rovnou na nové zápichové Z
  a odtud svísle dolů — šikmý přejezd po sdílené rampě by tělem plátku
  hobloval pravou stěnu). Doplněn model TESTU, generátor se neměnil.

- **CAM – plátek měnil při oddálení velikost i tvar a držák neseděl na jeho
  hranu.** Destička se kreslila s pixelovými PODLAHAMI na jednotlivé rozměry
  (v náhledu „⚙️ Geometrie“ R ≥ 2,5 px a šířka ≥ 8 px, na simulačním plátně
  R ≥ 6 px a šířka ≥ 20 px). Každá podlaha se zapínala při jiném zoomu, takže
  se plátek při oddálení nafukoval a měnil poměry — a hlavně se rozcházel
  s obrysem DRŽÁKU, který se kreslí v pravém měřítku: nakreslený držák pak
  nezačínal na hraně plátku, ale kus uvnitř něj (naměřeno 1,58 a 1,75 px
  při šířce plátku 5 mm; nález uživatele 27. 8. 2026).

  Plátek se teď kreslí **v měřítku výkresu, bez podlah** — drží velikost,
  tvar i návaznost na držák při jakémkoli zoomu; polohu nástroje na
  simulačním plátně drží křížek s minimální pixelovou velikostí. Zamčeno
  testem v `tests/cam-holder-editor.test.js` (konce obrysu držáku musí ležet
  na horních rozích plátku s přesností 0,01 px).

- **CAM – „📐 Kreslit na CAD plátně“ uloží přesně to, co nakreslíte.**
  Auto-doplnění otevřeného obrysu pod 45° (přepínače **Auto** a **⇄ Strana**)
  bylo **zrušeno** — přikreslovalo držák, který uživatel nenakreslil, a nedal
  se ho zbavit. Zrušen také parametr `holderAutoComplete` (staré projekty se
  načtou dál, klíč se ignoruje).

  Současně se přestalo TICHE ZAHAZOVAT to, co se nespojilo: `chainHolderPoints`
  brál jen první řetězec a zbytek kresby zmizel. Teď vrací všechny řetězce
  (první = strana A, druhý = strana B) a při více částech to řekne toastem.

- **CAD – v panelu nástrojů chyběla tlačítka Oříz, Prodl. a Obdélník.** Refaktor
  toolbaru (`47e7606`, 3. 8. 2026) vypustil z `index.html` tlačítka
  `data-tool="trim"`, `data-tool="extend"` a `data-tool="rect"`. Samotné
  nástroje zůstaly plně funkční (`js/tools/trimClick.js`, `extendClick.js`,
  `rectClick.js`, včetně `trimFromSelection` / `extendFromSelection` a větve
  ve `switch` v `js/events.js`) — šlo se k nim dostat už jen klávesovou
  zkratkou **X**, **E** a **R**, což na mobilu/dotykově nejde vůbec
  (nález uživatele 27. 8. 2026).

  Tlačítka jsou zpět: **Oříz** a **Prodl.** hned za **Vybarvit**, tedy na řádku
  s rozbalovacím **▾ Úpravy** — a hlavně opět jako PŘÍMÝ potomek `#topbar`.
  Na tom závisí mobilní rozložení: `css/style.css` má v
  `@media (max-width: 900px) and (orientation: landscape)` pravidla
  `[data-tool="trim"] { order: 3 }` / `[data-tool="extend"] { order: 4 }`,
  která od refaktoru neměla na co působit (`order` platí jen mezi sourozenci
  v témže flex kontejneru). Naležatu teď zase vychází dokumentovaný řádek
  **Výběr | Kóta | Tl.Kon | Smaž | Oříz | Prodl. | ▾ Více**.
  **Obdélník** je v kreslicí řadě za **Kružnicí**. Ikony i popisky odpovídají
  původním, tooltip navíc nese
  zkratku. Audit všech větví `setTool` proti `data-tool` v `index.html`
  potvrdil, že další nástroj bez ovládacího prvku již není (`deleteObj`,
  `measure` mají vlastní tlačítka podle `id`, `vkDraw` se zapíná z okna VK).

  Na mobilu na výšku navíc toolbar drží **pevné řádky** – dřív se tlačítka
  přelévala podle šířky displeje, takže návrat Obdélníku a Oříz/Prodl. posunul
  celé rozvržení a Tužka se vecpala ke skupině Vybarvit. `.toolbar-row-break`
  (dosud jen naležato) má teď základní stav `display: none` a zapíná se zvlášť
  v `@media (max-width: 900px) and (orientation: portrait)`; dva nové zlomy
  `.toolbar-row-break-p` (naležato skryté, aby nerozbily řazení přes `order`)
  dělí kreslicí tlačítka. Rozvržení je pak stejné na 375 i 780 px:

  ```
  Bod | Úsečka | Kontura | p. uhel
  Kruh | Obdélník | Tečna | za/zk
  Vybarvit | Oříz | Prodl. | ▾ Úpravy
  Tužka | Detekce | Profil | př/pl | ▾ Více
  ```

- **CAM – auto-doplnění držáku přikreslilo „druhý držák“ do strany.** Když se
  v „📐 Kreslit na CAD plátně“ potvrdí OTEVŘENÝ obrys a je zaškrtnuté **Auto**,
  `completeTwoSidedProfile()` ho uzavře pod 45° na **Délku držáku (l1)** a
  **Tloušťku**. Délku ale měřil natvrdo v ose x — u držáku nakresleného SVISLE
  (kanonická orientace: destička dole, tělo nahoru = +z, „Natočení nože 270°“)
  z toho vyšel 45° roh o celé rozpětí obrysu a doplněná noha odjela o l1 mm do
  strany — v náhledu to vypadalo jako druhý držák zprava doleva, kterého se
  nedalo zbavit (nález uživatele 27. 8. 2026, panel hlásil „Tvar držáku (8 úseků)“).

  Nově se osa bere **z nakresleného tvaru** — délka jde tam, kam obrys nejdál
  sahá od referenčního bodu destičky, tloušťka napříč. Změřeno na svislém
  držáku (x −6…6 mm, z 0…210 mm, l1 200 / tl. 20): dřív doplnění skončilo na
  x −200 mm, teď nejdál na x 14 mm a délka jde nahoru na z 200 mm. Vodorovně
  nakreslený držák se doplňuje **beze změny** (bod po bodu shodně s původním
  kódem). „Natočení nože“ se tím nemění — profil se ukládá v kanonické
  orientaci a úhel se na něj aplikuje až při použití.

  Funkce se zároveň přestěhovala z uzavření `openCamSimulator()` do
  `cam/insertPreview.js` k ostatním profilovým pomocníkům (`holderRectProfile`
  aj.), aby šla testovat přímo — viz `tests/cam-holder-editor.test.js`.

- **CAM – nakreslený upichovací plátek neměl pravou plochu.** Obrys destičky pro
  „📐 Kreslit na CAD plátně“ (a s ním i kolizní obálka nástroje) vedl u upichováku
  pravý rádius rovnou na horní roh těla — jenže ten na kružnici neleží, takže
  z pravé strany plátku vyšel půlkruh místo rovného boku a obrys zůstal otevřený.
  Nález uživatele 27. 8. 2026 při dokreslování držáku — v náhledu („⚙️ Geometrie“
  i simulaci) byl plátek přitom celý správně.

  Nově je obrys SOUMĚRNÝ a shodný s náhledem: levý bok → čtvrtoblouk R → rovné
  dno → čtvrtoblouk R → **pravý bok** → vrch. Změřeno na plátku š. 5 mm / R0,8:
  plocha obrysu 73,18 → 78,71 mm² (přesně 5 × 15,8 mm bez dvou rohů). G-kód
  fixtures s upichovákem (`part-17-long-parting`, `face-parting-retract-holder`,
  `part-16-face-holder`, `part-10-zapich-casting`) zůstal **beze změny** — oprava
  se týká kreslení a hlídání, ne plánování drah.

  Zároveň zmizela KOPIE `buildInsertProfileSegments()` v `camSimulator.js` —
  právě rozejítí obou verzí tuhle vadu vyrobilo; kreslení do CADu teď používá
  sdílenou funkci z `cam/insertPreview.js` (jak to popisuje
  `docs/geometry-libs-migration.md`).

- **CAM – zbytečný „Výjezd nad konturu" před sjezdem na hloubku.** `safeRapidTo`
  se ptal, jestli přejezd narazí, na bodě `cíl + Vůle` (`rTx`) — jenže sjezd v X
  dojede `emitDescendX`, a ten při náraze na zbytek zastaví rychloposuv už na
  povrchu plus **Stop rychloposuvu před čarou** a zbytek dojede posuvem. Guard
  se tedy ptal na místo, kam se nikdy nejede, a kvůli „kolizi" v něm posílal
  nástroj nahoru nad konturu a hned zpátky dolů.

  Nález uživatele 27. 8. 2026 (`N2340 G0 X68.478 ; Výjezd nad konturu`):
  rychloposuv, který se opravdu vydá, končí na X 21,150 a je čistý (0,00 mm²
  proti syrové siluetě i offsetové čáře), zatímco testovaný bod X 18,345 hlásil
  1,27 mm². Nově se testuje skutečný konec rychloposuvu (`rapidStopXAt`).

  **Držák se přitom dál testuje na CELÝ sjezd** až na cílovou hloubku —
  `emitDescendX` ho neřeší vůbec. Bez toho zmizel i zdvih, který na `part-8`
  s náhradním držákem opravdu chránil (změřeno: 56,6 mm² rychloposuvu a
  121,9 mm² držáku v materiálu).

  Změřeno: na dílu uživatele zdvihy 4 → 3 a program o 2 řádky kratší, oranžová
  stopa držáku i ⛔ panel zůstávají na nule; `holder-region-roughing` přišel
  o dva takové zdvihy (přepsané snapshoty). Sada 25 fixtures: kolize beze
  změny (0 / 0,0 nakreslený nůž, 2 / 2,3 náhradní držák), úběr +67,2 mm².

### Changed
- **CAM – jednotné pravidlo, kdy se přepíše G-kód programu.** Doteď se každý
  ovládací prvek panelu choval jinak: „Booleovské hrubování" a „Hrubovat po
  regionech" přegenerovaly `manualGCode` bez ptaní (a tím zahodily ruční
  úpravy — regenerace nešla vzít Zpět a `saveState()` ji hned uložila),
  zatímco stejně strategické „Čelně/Podélně", „Hrub. bez schodků" nebo
  „Hlídat geometrii" měnily jen náhled a program v editoru zůstal starý.

  Nově platí jedno pravidlo (`js/calculators/cam/gcodeSync.js`,
  `decideChange`): **program se přegeneruje sám jen tehdy, když (a) by změna
  jinak nebyla vidět — běží nebo se mění cyklový režim (závit / upich, které
  nemají vlastní náhled drah) — a zároveň (b) v programu nejsou ruční
  úpravy.** Jinak se překreslí jen náhled a program počká na „🔄 Dráhy".

  - **Ruční zásah je chráněný.** `S.gcodeDirty` se zapne psaním do editoru,
    návratem z CAM Editoru, tažením uzlů dráhy, Prodl/Ořez i poznámkou z CAD;
    ukládá se spolu s programem (localStorage, `.camprog`, záznam části,
    poznámka na výkrese), takže přežije restart i cestu přes CAD. Automatika
    takový program nepřepíše vůbec; „🔄 Dráhy" se předtím zeptá a přepis
    zapíše do historie (Zpět ho vrátí).
  - **Na dotaz se ptá jen když je co ztratit.** V automaticky vygenerovaném
    programu ruční úpravy nejsou, takže „🔄 Dráhy" jede rovnou.
  - **Vidět, že náhled ≠ program.** Tlačítko „🔄 Dráhy" se rozsvítí a dostane
    puntík, jakmile se od poslední regenerace změní cokoli, co ovlivňuje dráhy
    (otisk `pathInputsKey`: parametry, kontura, polotovar, meze, konstrukční
    čáry, flip os, nůž ze zásobníku); zámek 🔒 hlásí ruční úpravy. Bez téhle
    značky by změna nastavení vypadala jako hotová věc, ačkoli simulovaná
    dráha i hlídání kolizí pořád běží nad starým programem.

### Fixed
- **CAM – bezpečnostní příznak `orderAwareHolder` byl ve všech starších
  projektech tiše vypnutý.** Nemá (a nikdy neměl) ovládací prvek v UI — je to
  interní příznak, jehož výchozí hodnota se 26. 8. 2026 překlopila na `true`.
  Jenže `S.params` se ukládá CELÉ (localStorage, `.camprog`, záznam části),
  takže každý projekt uložený před tím datem si v sobě veze `false` a
  `Object.assign` s ním při načtení novou výchozí hodnotu přepsal.

  Výsledek: hlídání držáku podle pořadí obrábění — a s ním i obě opravy nad ním
  postavené — v žádném existujícím projektu neběželo. Uživatel dál viděl
  oranžovou stopu držáku a neměl jak ji zapnout.

  Nově se takové klíče z načtených parametrů vyhazují (`stripCodeOwnedParams`
  v `camDefaults.js`, aplikováno na localStorage, `.camprog` i záznam části) a
  platí výchozí hodnota z kódu — stejný vzor jako flipX/flipZ. Ověřeno na
  projektu uživatele: po načtení `orderAwareHolder = true`, oranžová stopa
  držáku **0,42 → 0,00 mm²**, ⛔ panel **0 / 0,0**.

### Changed
- **CAM – nájezd průchodu se hlídá proti držáku (order-aware).** Poloha, ze
  které podélný průchod sjíždí na hloubku, se proti držáku nekontrolovala vůbec
  — `holderEntryCapZ` běží jen v zanořovací větvi. I „normální" vjezd do údolí
  má ale 20 mm držáku nad sebou v +Z a tam může stoupat kůra odlitku: na dílu
  uživatele od toho zůstávala **oranžová stopa 0,42 mm² na Z≈105** (sjezd na
  Z≈84). Kolizní je **sama poloha, ne cesta k ní** — zdvih nad konturu ji
  změřeně nechal beze změny, takže to nešlo spravit přejezdem.

  Nájezd (`zStart + Vůle Z + R`) se proto testuje proti polygonovému zbytku se
  znalostí pořadí (`entryHolderArea`) a posune se doleva, dokud se držák vejde.
  Posun je **omezený na 3 mm** (`ENTRY_SHIFT_MAX`): daleký posun mění i
  příjezdovou cestu a bez stropu vyrobil na `range-end-leadout` sedm nových
  průchodů na Z≈173 i se zdvihem skrz kůru — 1 100 mm² kolizí, které tam
  předtím nebyly. Nenajde-li se v okně místo, vjezd zůstane, jak byl.

  Změřeno na dílu uživatele: oranžová **0,42 → 0,00 mm²**, ⛔ panel **2 / 5,1 →
  0 / 0,0**, a přitom úběr **2 555 → 2 633 mm²** (+78) a o dva průchody víc.
  Sada 25 fixtures: kolize **0 / 0,0 beze změny** a úběr **+67,2 mm²**
  (náhradní držák +54,8) — je to tedy zisk na obou stranách, ne výměna.
  Přepsané snapshoty (5 dílů): dvěma průchodům zmizel příznak `ramp`
  / `pocketReposition`, protože posunutý vjezd rampu už nepotřebuje.

  Bez `orderAwareHolder` se nic nemění: statická obálka na tuhle otázku
  spolehlivě neodpoví a se STATICKÝM modelem tatáž oprava změřeně stála
  −3 948 mm² úběru a vyrobila nové kolize.

- **CAM – kolmé zanoření na hranici rozsahu 📐 se povolí tam, kde držák projde.**
  Upichovák zapichuje kolmo — to je jeho normální provoz, ne vada. Plošný zákaz
  na každé umělé hranici (rozsah 📐 / hranice úseku), zavedený předchozí opravou,
  byl jen náhradou za chybějící model: statická obálka (výškové pole
  `holderFitsAt`) neumí tunel a její tolerance 2 mm² je kompenzace vlastní
  hrubosti, takže na otázku „vejde se tam držák?" spolehlivě odpovědět nešlo.

  Nově se ptá **polygonový model zbytku se znalostí pořadí obrábění**
  (`orderAwareHolder`, `docs/cam-order-aware-holder.md`): `plungeHolderFitsAt`
  projede držák podél svislého sjezdu proti tomu, co v tu chvíli opravdu stojí,
  s prahem `RESIDUAL_FIT_TOL` (0,5 mm²) jako validátor. Kde projde, vjezd se
  povolí a rampa není potřeba; kde ne, platí dál „rampa, nebo vrstvu vynechat".

  Změřeno na dílu uživatele (podélně, upichovák, Start rozsahu uvnitř odlitku):
  úběr **2 555 → 2 610 mm²** (+55) a o průchod víc, **kolize beze změny**
  (5,1 mm², a to je graze proti offsetové čáře u údolí, ne na hranici).
  Sada 25 fixtures: `cam_sweep --diff` **Δ +0,0 mm², 0 nálezů** — žádná z nich
  tuhle kombinaci nemá. Bez `orderAwareHolder` (starší uložené projekty) se
  chování nemění: statická obálka na to nestačí, takže se vjezd dál nepovolí.

### Fixed
- **CAM – vjezd na hranici rozsahu 📐 už není kolmý zápich (kolize držáku).**
  Když rozsah obrábění začíná uvnitř polotovaru, stojí napravo od hranice dál
  materiál, a proto se tam podélné hrubování nezapichuje kolmo, ale zanořuje
  **rampou** pod úhlem zanoření. Při úhlu 90° (upichovák + Auto) ale rampa na
  kolmý zápich degeneruje: `tan(90°)` je 1,6e16, posun v Z vyjde nula a vydá se
  `G1 X… Z<hranice> ; Rampa 90.0°`, které na hranici jen zapíchne — držák pak
  sjede do stojícího materiálu. Guard byl sám proti sobě.

  Svislý vjezd na UMĚLOU hranici (rozsah 📐 i hranice regionu) proto neplatí za
  rampu: kotva se nezaloží, hloubka se řeší stejně jako „rampa se sem nevejde“
  (dál se zanořuje jen po vrstvách, kam rampa doopravdy dosáhne).

  Změřeno na dílu uživatele (podélné hrubování, upichovák, Start rozsahu
  Z=333,06 uvnitř odlitku): **kolize 403,5 → 7,4 mm²** (−98 %), 5 svislých
  „ramp“ na hranici a 2 na hranicích regionů → **0**. Cenou je 1 201 mm²
  materiálu, který u hranice zůstane stát (vrstvy, na které se rampa nevejde) —
  tam nástroj s 90° zanořením prostě vjet nemůže. Celá sada 25 fixtures se
  **nezměnila ani o 0,1 mm²** (`scripts/cam_sweep.mjs --diff`: Δ +0,0 mm²,
  0 nálezů) — žádná z nich tuhle kombinaci nemá. Regrese:
  `tests/cam-range-parting-plunge.test.js` nad `tests/fixtures/cam-cases/`.

- **CAM – program bez jediného řezného pohybu se teď ohlásí.** „Jen
  dokončovací operace" (záložka Hot.) nad **neobrobeným odlitkem** vynechá
  všechny dokončovací úseky — na dráze stojí víc materiálu než hloubka třísky,
  takže je strop hloubky dokončovacího řezu zahodí. Rozhodnutí je správné
  (jedním průchodem by to nešlo uříznout) a emise hlásila „17 úsek(ů)
  zkráceno/vynecháno", jenže že jich bylo VŠECHNO poznat nešlo: vznikl
  program s hlavičkou, sekcí `--- DOKONCOVANI ---` a `M30`, který vypadá hotově
  a nic neobrobí. Nově se v takovém případě přidá hlášení „Program NEOBSAHUJE
  ŽÁDNÝ ŘEZNÝ POHYB" — u „jen dokončení" i s návodem (nastavit polotovar na
  tvar po hrubování, nebo použít ➕ Operace). Ověřeno na všech 25 fixtures, že
  u normálních programů nehlásí nic (`tests/cam-empty-program.test.js`).

- **CAM panel – varování, že hrubování přebíjí jiný režim.** Že program
  obsahuje jen závitovací cyklus, hlásil panel od dřívějška; **upichnutí**
  (aktivní `partOffZ`) a **„jen dokončovací operace"** ze záložky Hot.
  (`finishOnly`) přitom hrubování ruší úplně stejně — v emisi má upichnutí
  vlastní early-return a `finishOnly` hrubovací průchody přeskočí (změřeno na
  `part-1`: 297 → 39 řádků, hlavička `--- HRUBOVANI ---` zmizí) — a v záložce
  Hrub. o tom nebylo ani slovo. Nově se varování ukazuje pro všechny tři
  režimy, včetně tlačítka na rychlé vypnutí. Zobrazí se vždy jen ten režim,
  který program **opravdu** řídí: pořadí kopíruje pořadí early-returnů v emisi
  (závit → upich → jen dokončení), ověřeno headless během se dvěma režimy
  zapnutými naráz.

- **CAM panel – „Booleovské hrubování" a „Hrubovat po regionech" v čelním
  režimu.** Oba příznaky čte výhradně `genLongPasses`; čelní strategie je
  nikde nesahá (změřeno: G-kód `part-16-face-holder`, `part-18-face-big-radius`
  je se zapnutým i vypnutým příznakem bajt po bajtu identický). V panelu ale
  vypadaly jako plnohodnotně zapnuté — uživatel je měl zaškrtnuté a ony nic
  nedělaly. Nově se při čelním hrubování zašedí, zamknou a doplní „(jen
  podélně)", stejně jako to od dřívějška dělá Zanořování.

- **CAM panel – falešné varování „⚠ α" u úhlu zanoření.** UI si neořízlý úhel
  počítalo vlastním vzorcem (pro nepolygonální destičku napevno 45°), jenže
  `getEffectivePlungeAngle` úhel hřbetu α uplatňuje jen u polygonální destičky
  (upichovák vrací 90°, kulatá a závitová 45°). S nastaveným α tak u upichováku
  svítilo „Omezeno úhlem hřbetu α" vedle hodnoty, kterou nic neomezilo. Podmínka
  se teď ptá přímo `getEffectivePlungeAngle` (kolik by auto vydalo bez α) a
  varování svítí jen při skutečném oříznutí. Tooltipy doplněny o to, že se α
  do úhlu zanoření u kulaté, upichovací a závitové destičky nepromítá.

## [1.8.0] - 2026-08-26

### Added
- **CAM – snap při tažení mezních čar (rozsah 📐, čelisti, koník).** Čára se
  na plátně chytá na souřadnice týchž bodů jako kreslení: vrcholy kontury
  i polotovaru, středy úseček, středy a vrcholy oblouků, konce konstrukčních
  čar a počátek. Mezní čára je nekonečná přímka, takže na bod dosedá jen jeho
  souřadnicí v ose tažení (svislá na Z, vodorovná na X) — chytá se ale **jen na
  bod u kurzoru**: v ose tažení do 10 px, kolmo na ni do 18 px (tytéž tolerance
  jako hrany a body v `camSnap`). Bez té druhé podmínky přitáhl čáru každý bod
  se správnou souřadnicí, i když ležel přes celé plátno jinde — táhls s čárou
  dole a skočila na bod nahoře (nález uživatele 26. 8. 2026). Ve shluku (rozdíl
  v ose do 1 px) vyhraje bod blíž ke kurzoru. Přichycený bod ukáže obvyklý SNAP
  indikátor, vypíná se týmž magnetem 🧲.

  Tažení se přitom sčítá do **nezaokrouhlené** polohy — jinak by se čára po
  přichycení posouvala od snapnuté hodnoty a snap by nešel „pustit“. Bez snapu
  zůstává původní krok 0,01 mm.

  Zároveň se po přetažení **rozsahu** přepočítají dráhy (dosud jen po čelisti
  a koníku): od 25. 8. 2026 rozsah ořezává hrubování i dokončování, takže čára
  skočila jinam, ale dráhy zůstaly podle staré polohy.

- **CAM – `scripts/cam_sweep.mjs --set=klíč=hodnota`.** Přepíše parametr
  ve všech fixtures, takže se dá změřit dopad příznaku (`--set=orderAwareHolder=true`)
  jedním během. Se `--set` se netiskne porovnání se zapsanou baseline — ta
  platí pro výchozí parametry.

  `--diff` nově porovnává i **počet průchodů**. Bez toho přehlédl změnu, která
  nehne ani úběrem, ani nálezy: zapnutí `orderAwareHolder` vypadalo jako
  „mění se jediný díl", ale snapshoty ukázaly, že se na šesti dalších změnil
  počet zanořovacích pokusů.

- **CAM – `residualHolder.js`: hlídání držáku dotazem nad zbytkem místo
  Minkowského obálky.** Krok 2 plánu `docs/cam-order-aware-holder.md`. Modul
  zatím nikdo neimportuje — zapojení do `applyHolderClamp` je krok 3.

  `makeResidualClamp(loops, holderLoop)` vrací `clamp(X, zStart, zEnd)` se
  **shodným rozhraním** jako `clamp` z `makeHolderClamp` (`null` = zakázaný
  start, jinak posunutý `zEnd`), takže se dá vyměnit za sebe. K tomu bodové
  `holderFitsInResidual` / `holderAreaInResidual` a `residualHolderLoop`
  (obrys držáku bez prostoru destičky, zeštíhlený o 0,05 mm — vzor
  `holderCutShrunkLoop` v gcodeEmit.js; bez odečtení destičky by test narazil
  do drážky, kterou týž průchod právě vyřízl).

  **Sken po krocích nahrazen ZAMETENÝM držákem.** Zadání psalo „hrubý sken po
  0,2 mm + půlení", jenže sken po krocích může přeskočit překážku užší než
  krok — nebezpečný směr. Testuje se proto stopa držáku přes celý zbývající
  interval (`toolSweep`), a ta predikce je MONOTÓNNÍ (kratší interval má stopu
  podmnožinou delší), takže půlení je přesné a nemá díry. Hlídá to test
  s žebrem 0,4 mm. Vedle bezpečnosti je to i rychlejší: volný interval stojí
  JEDEN dotaz místo stovek, zkrácený ~13.

  Tolerance je validátorových `0,5 mm²`, ne `2,0` jako `HOLDER_FIT_TOL`
  v roughingStrategies — ta dvojka je kompenzace hrubého skenového modelu
  (`part-13` sken 0,63 mm² → polygon 0), a nad polygonovým průnikem by se
  dědila jen ta chyba, kterou kompenzuje.

  Akceptace (`tests/cam-residual-clamp`, 17 testů): proti
  `clampZTowardNegative` na umělé geometrii dávají obě varianty totéž
  **±0,2 mm** všude, kde je zbytek roven překážce. Cena na reálných dílech:
  4–31 ms za celý sešup dotazů (0,21–1,94 ms na dotaz) proti 42–72 ms za
  JEDEN rebuild obálky, který by při hlídání po hloubkách musel proběhnout
  20–26×.
- **CAM – `ResidualTracker`: polygonový model zbytku se znalostí pořadí
  obrábění.** Krok 1 plánu `docs/cam-order-aware-holder.md`. Za příznakem
  `orderAwareHolder` (výchozí vypnuto); zatím se ho nikdo neptá, takže G-kód
  je bit po bitu týž — ověřeno `cam_sweep --diff` (Δ 0,0 mm², žádná změněná
  fixture) i přímým porovnáním se zapnutým příznakem na `part-8`, `part-13`
  a `holder-region-roughing`.

  **Krok 1 se přitom přerámoval: akumulátor zbytku UŽ V REPU BYL.**
  `genLongPasses` si vede `cutFloorTab` — výškové pole po 0,25 mm v ose Z,
  plněné z prefixu `passes[]` — a ptá se ho hlídání zanoření
  (`holderFitArea`/`holderFitAreaAlong`) i kontrola odložených vjezdů.
  Order-aware model tedy existuje; nemá ho jen `applyHolderClamp`, který pořád
  jede na statické obálce z hotového dílu.

  Jenže jedno číslo na sloupec **neumí tunel**: když zanoření nebo dojezd po
  kontuře podjede pod stojícím materiálem, srazí celý sloupec na hloubku
  tunelu. Nový test `tests/cam-strategy-residual` to změřil proti reálně
  projeté dráze:

  | fixture | výškové pole | ResidualTracker |
  |---|---|---|
  | `part-8` | **−11,2 mm** (pás Z 117,5–183) | ≤ 0,05 mm |
  | `holder-casting-slanted-face` | **−13,6 mm** (pás Z 68,8–100,3) | ≤ 0,05 mm |

  To jsou přesně ty dva díly se zbylými doloženými kolizemi držáku (4 / 33,4
  a 2 / 2,3 mm²), a chyba je v NEBEZPEČNÉM směru — model tvrdí, že je
  vykopáno, tak tam hlídání držák pustí. Dosavadní vysvětlení („mez modelu
  `holderFitsAt`", zapsané v `EXPECTED` u `cam-collision-free`) tedy není
  celé: vedle modelu DRŽÁKU je vedle i model MATERIÁLU.

  Tracker seedu je OFFSETOVÁ čára (syrová silueta by byla méně přísná než
  dnešní výškové pole), oblouky se vzorkují místo tětivy (bez toho 0,30–0,74
  mm pod realitou — táž oprava, jakou dostal `noteCutArc` v emisi) a průchod
  s nulovým dnem se nezapisuje. Zbývá jedna doložená mez: `part-13-zleva-flange`
  0,30 mm na dojezdech po kontuře, protože tracker zná PLÁN, ne EMISI (mezi
  nimi je `envify`, prokládání oblouků, ořezy držáku, `emitBodyX`).

  Cena `noteAll`: 90–223 ms na díl (1,0–6,4 ms na průchod). Plán počítal
  s 0,36 ms na řez, jenže tam je řez krátký pohyb, kdežto tady celý průchod
  s navzorkovanými oblouky. Cenu nese `toolSweep`, ne velikost modelu
  (`polySimplify` po 1 / 4 / 8 / 24 řezech vyšel na týž čas).

- **CAM – `scripts/cam_sweep.mjs`: úběr × kolize přes celou sadu fixtures.**
  Krok 0 plánu `docs/cam-order-aware-holder.md`. Pro každou fixture vydá
  ODEBRANOU PLOCHU a NÁLEZY VALIDÁTORU ve dvou variantách držáku
  (`magazine` = nakreslený nůž ze slotu 2 `DEFAULT_TOOL_MAGAZINE` vnucený
  všem × `own` = sada, jak je) a ve dvou standardech polotovaru (syrová
  silueta × offsetová čára, `planStock` + `shrink` 0,25).

  Proč nástroj, a ne další test: order-aware model držáku je
  `zbytek ⊇ hotový díl`, tedy vždy alespoň tak přísný jako dnešní statická
  obálka — sám o sobě může úběr jen UBRAT. Rozhodnout se dá jedině z dvojice
  „kolik se odebralo" × „kolik zbylo kolizí" napříč celou sadou. Tři ze čtyř
  dosud zamítnutých nápadů padly právě na úběru, ne na kolizích, a validátor
  ani počet průchodů to neukážou.

  Baseline z plánu se reprodukuje do posledního místa: nakreslený nůž
  **76 663,8 mm² / 4 nálezy / 33,4 mm²**, náhradní držák
  **76 849,6 mm² / 2 / 2,3 mm²**. Nově je změřený i offsetový standard
  (84 682,4 / 4 / 41,6 a 84 889,3 / 11 / 76,6); těch 11 nálezů je přesně
  `EXPECTED_PLAN` v `tests/cam-collision-free`, takže nástroj a sada měří totéž.

  Měřením se přitom vyjasnilo, co „náhradní držák" v baseline znamená: je to
  sada **jak je** (vlastní obrys u 14 z 25 fixtures, obdélník jinde), NE
  obdélník vnucený všem. Ta varianta je dostupná jako `--holder=all` (klíč
  `rect`) a dá 85 457,9 mm² / 22 / 9 355,2 — na `part-13-zleva-flange` je to
  jiná úloha, ne jiný držák (15 nálezů / 9 273 mm², úběr 11 777 → 17 757).

  Pasti zapracované dovnitř: jeden PROCES na (fixture × varianta), protože
  singleton `S` v harnessu kontaminuje; plná sada `zLimits`/`xLimits`, protože
  je harness MERGUJE; `maxIssues` 64 místo výchozích 12, aby propad
  v pozdějších krocích nezůstal zamaskovaný stropem. `--save`/`--diff`
  porovnávají naměřená ČÍSLA, takže odpadá past „baseline přes
  `git checkout --`"; soubory `.cam-sweep-*.json` jsou v `.gitignore`.
- **CAM – virtuální zvětšení držáku (nové pole „Virt. zvětšení držáku").**
  V pravém panelu vedle „Stop rychlop. před čarou" (obojí je teď na vlastním
  řádku). Obrys držáku se o zadanou hodnotu zvětší pro VŠECHNA hlídání —
  kolize, mezní čáry i plánování drah — takže nůž drží od obrobku větší
  mezeru, aniž by se překresloval. Zadání uživatele 21. 8. 2026: *„při záběru
  nové vrstvy je to těsně vedle toho čela, co je z pravé strany držáku"*;
  smysl je pokrýt házivost a otřepy. 0 (výchozí) = dosavadní chování,
  snapshoty bit po bitu shodné.

  Proč zvětšení OBRYSU a ne vůle uvnitř algoritmu: vůle byla vyzkoušená a
  selhala obojím směrem — jako tvrdé zamítnutí smazala celý krček pod přírubou
  (−79 mm²), jako preference byla úplný no-op (0,00 % napříč 24 fixtures),
  protože kotva, o kterou šlo, je vjezd regionu a hlídáním s vůlí vůbec
  neprochází. Obrys je naproti tomu reálný geometrický vstup, takže ho
  `holderFitsAt`, `makeHolderClamp`, `HolderGouge`, `validateToolpath` i mezní
  čáry vezmou konzistentně — všechny čtou tentýž `holderWorldLoop`.

  **Výchozí je JEDNOSTRANNÉ zvětšení — jen k obráběné straně** (záškrt „vše"
  před názvem pole přepne na zvětšení kolem celého držáku). Spodní šikmá hrana
  se pod SVÝM úhlem prodlouží a boční čelo se odsune; špička, přední strana i
  délka držáku zůstávají přesně na svém. Důvod je věcný, ne opatrnost: přídavek
  u špičky a před ní překáží — když držák navazuje na destičku bez mezery,
  zakázal by jí zajet níž, a upichovat by pak nešlo vůbec. Název pole se podle
  strany hrubování sám přepisuje na „(zprava)" / „(zleva)"; **překlápí se i sám
  přídavek**, protože obrys se staví v kanonickém rámu (+z = obráběná strana) a
  `backside` ho zrcadlí až nakonec. Ověřeno paritním testem zleva/zprava
  s nenulovou hodnotou.

  Kam se nafouknout NESMÍ, je změřená hranice:

  - **pod úroveň hrotu** (x < 0) — tam už řeže jen destička. U upichováku leží
    spodní hrana držáku přímo na hrotu (profil (0,0)–(2,0)), takže by hlásil
    kolizi na každém běžném řezu.
  - **na neobráběnou stranu** — tam se kolize NEDÁ vyřešit zkrácením průchodu
    (materiál stojí po celé délce řezu nezávisle na hloubce) a `makeHolderClamp`
    ji proto vědomě nemodeluje. Nafouknutí o 1 mm na tu stranu z toho udělalo
    katastrofu: ⛔ 0 → 12 a úběr 4381 → 10310 mm², protože průchody u osy
    přestaly končit na čele (Z 346,9) a projely celý díl až na Z −9. Ruční
    kontrola oddělila příčinu: samotná tloušťka 20 → 21 mm dá úběr 4380,8
    (beze změny), tatáž tloušťka i s přesahem na z = −1 dá 10310,9.

  Napříč 24 fixtures při hodnotě 1 mm: úběr jen KLESÁ (0 až −5 %, nikde
  neroste) a **skutečný držák nikde nepřibral ani jednu kolizi** — dráhy jsou
  proti dnešku výhradně opatrnější (`holder-region-roughing` ⛔ 4 → 2). Panel
  ⛔ hlásí proti ZVĚTŠENÉMU obrysu, takže nález = „tady se požadovaná mezera
  nedala udržet"; to je záměr, jinak by nešlo poznat, jestli se nastavení
  vůbec projevilo. Ukládá se do `.camprog` i do knihovny nožů a zásobníku.

### Changed
- **CAM – rozsah 📐 vymezuje OBROBENOU PLOCHU, ne programovaný bod.** Dvě věci
  o tomtéž:

  **1) Dojezd.** Mřížka průchodů je kotvená na kraji polotovaru a krok drží
  `ap`, takže na hranici pásu nesedne — mezi posledním průchodem a čarou
  zůstával stát neobrobený proužek až `ap` široký (`face-cylinder`, pás Z 25…45:
  marche končila na Z26). Nově se přidá vrstva navíc; poslední tříska je tenčí
  než `ap`. Podélně totéž na dolní mezi rozsahu X (dno pásu); horní mez to
  nepotřebuje, hloubky nad ní dělá sousední úsek, jehož dnem je právě ona.

  **2) Šířka destičky** (nález uživatele 26. 8. 2026). Řez sahá o rádius nosu
  PŘED programovaný bod a o tělo destičky ZA něj (`insertBodyZ`: u upichováku
  šířka plátku bez rádiusu, jinak `ap`) — přesně stopa `toolFootprint`, takže
  plánování drží týž model jako úběr i validátor. Průchod postavený na hranici
  proto řezal ještě kus za ní: upichovák 5 mm, pás od Z311,76 → první průchod
  na Z308,932 řezal až na Z313,932, tedy 2,17 mm do sousedního úseku. Čelní
  vrstvy se nově posadí tak, aby na hranici dosedl ŘEZ — na konci marche jeho
  čelo, na začátku jeho záď (týž průchod teď stojí na Z307,560 a plátek končí
  přesně na Z311,76).

  Nasadí se jen tam, kde pás opravdu ukrajuje (konec: za hranicí leží vrstva,
  kterou operace nedělá; start: hranice leží uvnitř materiálu — a tou hranou je
  `faceEdgeZ`, tedy ZLEVA druhý konec dílu; s `faceStartZ` se klamp startu zleva
  vůbec nenasadil a řez přetekl 3 mm pod pás, hlídá to nový případ v testu),
  takže pás přes
  celý díl nemění nic — na tom stojí stabilita snapshotů, všechny prošly beze
  změny.

  Měřeno na 16 kombinacích dílu × pásu proti HEAD, nově i **zbytkem UVNITŘ
  pásu** (samotný úběr nestačí: přestat řezat za hranicí se v něm tváří jako
  ztráta). Čelně u čtyř z pěti pásů zbytek v pásu KLESL — `part-16` −26,7,
  `part-19` −40,1, `face-cylinder` −5,3, `face-casting` −20,5 mm² — a úběr
  povyrostl. Podélně +8,3 / +142,7 / +485,0 mm² úběru. Kolize 0 u všech čelních
  pásů, u `part-1` a `part-8` dokonce o nález méně (hlubší průchod odebere
  materiál, o který se dřív otíral držák). U `part-15` přibudou 4 hlášení
  držáku (30,5 mm² z 1 189) — tentýž, už dřív zdokumentovaný případ „za hranicí
  pásu stojí materiál a držák do něj najede“, jen o hloubku níž.

  **Změřená cena u velkého rádiusu nosu:** čím širší stopa, tím dál musí vrstvy
  ustoupit dovnitř pásu a schodiště natočené destičky se zkrátí. `part-18`
  (nos R8, ap 3, pás Z 100…150): dno řezu r17,2 → r36,2 a v pásu zůstane
  o 220,7 mm² víc. Je to fyzika sekání po úsecích, ne vada — kdo má sousední
  úsek hotový, posune si hranici o rádius nosu ven. Menší dosah (jen tělo
  destičky bez nosu) by tu sice ušetřil, ale u R8 by se pořád 5 mm řezalo za
  čárou, což je přesně to, co se opravuje.

### Measured and rejected
- **CAM – order-aware zbytek při OŘEZU Z-INTERVALŮ (`applyHolderClamp`) je
  změřeně špatný obchod ve všech třech zkoušených variantách.** Plán chtěl
  zbytkem nahradit statickou obálku právě tam; napříč celou sadou vyšlo:

  | varianta | úběr | kolize |
  |---|---|---|
  | dnes, nakreslený nůž | 76 663,8 mm² | 4 / 33,4 mm² |
  | zbytek NAHRAZUJE obálku | 65 979 (−14 %) | **67 / 31 138 mm²** |
  | zbytek se s obálkou SKLÁDÁ | prakticky totéž (zbytek je dominantní) | |
  | + smí jen ZKRÁTIT, ne zrušit | 78 146 (+1 482) | 7 / 2 611 — `part-8` **beze změny**, `part-10` **+3 nálezy / 2 578 mm²** |

  Společná příčina: **zkrácený ani zahozený interval materiál NEODEBERE, jen
  ho nechá stát** — a další, hlubší průchod ho vezme najednou a projede
  držákem skrz. Na `part-17` průchodů 53 → 44, ale úběr 4 933 → 10 183 mm²
  a 26 nálezů. Obálka si zahození dovolit může (modeluje HOTOVÝ DÍL, tedy
  překážku, která nezmizí), zbytek je PŘECHODNÝ — správná odpověď na
  „nevejde se teď" je přeplánovat POŘADÍ, což je mimo rozsah.

  Ořez i na KAPSOVÉ intervaly (`k > 0`), který plán žádal, je po odečtení
  vlastního řezu **inertní** — identický výsledek na všech 25 fixtures.

  Vada nálezu 09 tam totiž vůbec nebyla: `part-8` krvácí na VJEZDU do kapsy.
  Nasazené řešení je proto u vjezdu (viz *Fixed*).
- **CAM – rozšířit obálku držáku i na KAPSY (zanoření) je změřeně špatný obchod.**
  Zbytek nálezu 09 (hlídání zná jen hotový díl, ne syrový zbytek) se projeví
  jedině s NAKRESLENÝM nožem, a jen na `part-8`: 4 nálezy / 33,4 mm², všechny
  na jednom průchodu — hlubokém vjezdu do úzké drážky (`#24`, r 17,649, rampa
  na Z 184,5, pak sledování kontury přes celý díl).

  Příčina je lokalizovaná: se skutečným nožem obálka **smaže mezilehlé
  průchody** (r 26,978 a 24,478 v pásu Z 188–219, které s náhradním obdélníkem
  vzniknou), ale **hluboký vjezd nechá projít** — kapsy `applyHolderClamp`
  vědomě neořezává. Rameno na r 20–31 / Z 183–189 proto stojí a držák do něj
  vjede tělem 0–4,4 mm za špičkou.

  Doplnění obálky i na kapsy bylo změřeno na všech 25 fixtures:

  | | úběr | kolize |
  |---|---|---|
  | dnes, nakreslený nůž | 76 663,8 mm² | 4 / 33,4 mm² |
  | + clamp kapes | 72 471,3 mm² | 3 / 6,3 mm² |
  | dnes, náhradní držák | 76 849,6 mm² | 2 / 2,3 mm² |
  | + clamp kapes | 72 741,5 mm² | **3 / 3,0 mm²** |

  Tedy **−4 192 mm² (−5,5 %) úběru za −27 mm² kolize**, a s náhradním držákem
  dokonce o JEDEN NÁLEZ VÍC při téže ztrátě. Celou cenu přitom nese pravidlo
  „zahoď interval se zakázaným startem" — samotné zkracování hlubokého konce
  nestojí nic a nic nepřinese (obě varianty vyšly na tentýž řádek).

  Zbytek nálezu 09 tedy **nejde spravit zpřísněním statické obálky**. Chce to
  model zbytku, který zná POŘADÍ obrábění: obálka se staví z hotového dílu
  (`buildObstacleLoops` = silueta offsetu ∩ polotovar), takže o materiálu,
  který v tu chvíli ještě stojí, neví nic. Stav hlídá
  `tests/cam-stock-span-depths.test.js` (part-8 s nožem z magazínu, max < 20 mm²).

  **Plán, jak na to, je v repu:** `docs/cam-order-aware-holder.md` — 6 kroků
  s vlastními akceptačními čísly, změřeným rozpočtem (rebuild obálky 157–382 ms
  proti přímému dotazu 0,142 ms, tedy ~1000×) a seznamem statických proxy
  (`stair`, mezní čáry `fromInsert`, `isForbiddenSoft`), jejichž zrušením se
  ztráta úběru splácí. Bez toho je nový model čistá ztráta — `zbytek ⊇ hotový
  díl`, takže sám o sobě může jen ubrat.

### Fixed
- **PWA – generátor SW assetů bral i tečkové soubory.** `npm run sw` zapsal do
  cache `./.cam-sweep-baseline.json` — lokální měřicí soubor, který není
  verzovaný ani nasazovaný (GitHub Pages ho přes Jekyll vynechá tak jako tak).
  `cache.addAll` je ATOMICKÉ, takže jediný 404 shodí instalaci Service Workeru
  a s ní celý offline režim. Generátor teď tečkové soubory i složky přeskakuje.
  Při té příležitosti se do cache dostaly `residualHolder.js`
  a `residualTracker.js`, které v ní od svého přidání chyběly (SW v233).

- **CAM – kontrola order-aware hlídání držáku: dvě vady nalezené revizí.**
  Ani jedna se na fixtures neprojevila (`cam_sweep --diff` je před opravou
  i po ní na nule), obě ale byly reálné.

  1. **Model zbytku se stavěl DVAKRÁT.** Blok na konci `genLongPasses`, který
     ho staví celý znovu pro měřicí seam, běžel při `prms.orderAwareHolder` —
     tedy od zapnutí výchozího příznaku při KAŽDÉM přepočtu, a jeho výsledek
     nikdo nečetl (`ctx.residualTracker` nemá konzumenta). Hlídání přitom jede
     nad líně plněným `residTracker`. Blok je nově vázaný jen na seam:
     `part-13` +25 % → **+15 %**, `part-15` +17 % → **+7 %**.
  2. **Detekce rozejití modelu s `passes` byla děravá.** Test
     `passes.length < residSynced` odhalí zkrácení pole, ale NE zkrácení,
     po kterém pole zase naroste, ani vložení `splice` doprostřed. Model si
     pak nese řezy zákroků, které nakonec nikdo neudělá → tvrdí, že je
     vykopáno → nebezpečný směr. Nově se porovnává IDENTITA objektů v prefixu
     (O(n) referencí u hrstky volání, nic proti jednomu `polyDifference`).

  Doladěno i vzorkování dotazu na vjezd: strop 24 vzorků mohl u DLOUHÉHO
  nájezdu zředit vzorky RAMPY, na které to celé stojí (`n = min(strop,
  délka/krok)`, takže u 70mm dráhy by se krok protáhl na 3 mm). Strop je
  nově 128, tedy plné rozlišení do dráhy 256 mm. Krok 2 mm zůstává —
  ověřeno, že se `step: 0,5` a stropem 256 vyjde na všech 25 fixtures TENTÝŽ
  výsledek, a jednomilimetrový krok stojí dvojnásobek režie.
- **CAM – hluboký vjezd do úzké drážky zavezl DRŽÁK do materiálu, který tam
  ještě stál (zbytek nálezu 09).** Opraveno a **výchozí ZAPNUTO**
  (`orderAwareHolder`); vypnutím se vrátí dosavadní chování.

  Kapsový vjezd hlídá `holderFitArea` u `buildPocketPass` — a ten čte VÝŠKOVÉ
  POLE `cutFloorTab`, jedno číslo na svislici Z. To neumí popsat TUNEL: když
  zanoření nebo dojezd po kontuře podjede pod stojícím materiálem, srazí celý
  sloupec na hloubku tunelu. Na `part-8` je to změřeně až **11,2 mm pod
  realitou**, a to přesně v pásu Z 117,5–183, kde ten problémový vjezd je
  (`#23`, `pocketEntry`, r 17,65, rampa na Z 184,5). Sken ho proto pustil.

  Se zapnutým příznakem se u kapsového vjezdu ptá i POLYGONOVÝ zbytek, a to
  podél celého vjezdu (`residEntryArea` → `holderAreaAlongResidual`, práh
  `RESIDUAL_FIT_TOL` 0,5 mm²). Ten v něm najde **30,1 mm²** vnoření držáku
  a zákrok zahodí:

  | | úběr | kolize |
  |---|---|---|
  | nakreslený nůž, dnes | 76 663,8 mm² | 4 / 33,4 mm² |
  | nakreslený nůž, zapnuto | 76 335,8 (−328,0; −0,43 %) | **0 / 0,0** |
  | náhradní držák, zapnuto | 76 518,4 (−331,2) | 2 / 2,3 (beze změny) |

  Mění se **jediný díl — `part-8`**; ostatních 24 fixtures je bit po bitu
  shodných. Cena je jeden zahozený zákrok, ne rozpadlý program. Zbylé 2 nálezy
  u náhradního držáku jsou `holder-casting-slanted-face`, tedy jiná, dávno
  doložená mez (`holderFitsAt` na rampě).

  Nutné k tomu byly dvě věci: odečíst zákroku VLASTNÍ ŘEZ (držák se táhne
  v drážce, kterou ten zákrok právě řeže — bez toho `part-17` +5 287 mm²
  a 36 nálezů), a to jen tu ČÁST dráhy, kterou má nástroj už za sebou; a stavět
  model znovu, když se `passes` ZKRÁTÍ (`tail.length = dropFrom`,
  `passes.splice(pi, 1)`) — jinak si připisuje řezy zákroků, které nakonec
  nikdo neudělá.

  Přepočet se se zapnutým příznakem prodlouží o **0 až 25 %** (`part-13`
  306 → 382 ms), `part-8` je dokonce o 12 % RYCHLEJŠÍ, protože zahodí jeden
  zákrok. Původně to bylo +6 až +124 %; zlevnily to dvě věci ve vzorkování:

  - **Oblouky se vzorkují SAGITTOU, ne pevnou délkou tětivy.** Emise vzorkuje
    po 0,1 mm bez ohledu na rádius, takže na velkém oblouku sype vzorky, které
    nic nepřinesou (sagitta 0,1mm tětivy na r 50 je 0,000025 mm). Z `L²/(8r) ≤ tol`
    plyne `L ≤ √(8·r·tol)` — chyba je shora omezená a počet vzorků klesá
    s odmocninou rádiusu. Na `noteAll`: `part-8` 459 bodů / 82 ms → 249 / 30 ms,
    `part-13` 163 / 18 → 88 / 7. Tolerance 0,01 mm je nejhrubší, která drží mez
    `tests/cam-strategy-residual` (0,05 mm): při 0,04 by `part-15` vyjel
    na 0,057.
  - **Dotaz na vjezd vzorkuje po 2 mm místo 1** — držák je v ose Z přes 20 mm
    široký, sousední polohy se překrývají z 90 %. Výsledek se nezměnil vůbec.

  Zkoušeno a ZAMÍTNUTO: hromadit vlastní řez přírůstkově místo odečítání
  celého prefixu. Vypadá to jako odstranění kvadratické složitosti, ale je to
  horší — postupné `polyDifference` nabaluje modelu vrcholy (`part-13`
  10,4 → 30,8 ms na dotaz).

  **Výchozí zapnuto.** Zákrok, který na `part-8` vjížděl 30,1 mm² držáku do
  stojícího materiálu, se už neudělá; uživatel se to dozví z existujícího
  hlášení „Hlídání geometrie (držák): N úsek(ů) polotovaru zůstalo NEOBROBENO",
  takže materiál nemizí tiše. Cena je 0,43 % úběru.

  Snapshoty `cam-gcode-regression` a `cam-boolean-gcode-regression` přepsány
  vědomě a zkontrolovány položku po položce: na `part-8` ubyl přesně jeden
  průchod (`long{pocketEntry,ramp,contourLeadIn,contourLeadOut,blocked}`,
  `passCount` 35 → 34), na šesti dalších dílech je G-kód BIT PO BITU shodný
  a mění se jen počet v poznámce „Zanořování — N průchodů do kapsy nedosáhlo
  plné cílové hloubky" (2 → 1), protože kapsová smyčka končí o jeden zamítnutý
  pokus dřív.

- **CAM – broad-phase validátoru kolizí TIŠE ZAHAZOVAL kolize na složitém
  obrysu.** Nález uživatele: konzole aplikace se plnila hláškami
  `quickDecomp: max level (100) reached.` se stackem
  `mayHit → checkAgainstStock → validateToolpath`.

  `validateToolpath` uměl volitelně použít Detect-Collisions (`opts.collisions`)
  jako rychlý filtr před přesným Clipper průnikem. Ta knihovna si konkávní
  polygon rozloží `quickDecomp`em na konvexní kusy, a když narazí na strop
  rekurze, **vrátí jen to, co stihla** — zbytek polygonu zahodí:

  ```js
  if (o++ > maxlevel) { console.warn("quickDecomp: max level (" + r + ") reached."); return t; }
  ```

  SAT pak testuje proti méně dílům, než polygon má, takže filtr odpoví
  „kontakt vyloučen" na skutečném překryvu. Ve validátoru to znamená dvě věci
  a obě špatně: `checkAgainstStock` vrátí nulu, takže se **KOLIZE NEOHLÁSÍ**,
  a přeskočí se `stock.cut()`, takže v modelu zůstane materiál, který dráha
  odvezla → fantomové nálezy na dalších blocích.

  Změřeno na hřebenu (zuby po 2 mm): při 82 vrcholech ještě `mayHit=true`,
  při **242 vrcholech `mayHit=false`** na čtverci, který uvnitř nesporně leží.

  Filtr přitom nic nepřinášel — napříč pěti fixtures byl SAT **pomalejší** než
  prosté AABB při shodných nálezech: part-8 271 × 151 ms, part-15 167 × 132,
  part-13 77 × 58, holder-casting 46 × 35, face-casting 62 × 43. Konvexní
  obálka by ho spravila, jenže u soustružnického polotovaru se obálka od AABB
  skoro neliší, takže by zbyla jen režie. **Odstraněn**; zůstává AABB.

  Proč to sada nechytila: `opts.collisions` nikdo nepředával kromě jednoho
  testu s VÁLCEM, tedy čtyřvrcholovým obrysem. Nový test v
  `collision-validator.test.js` drží obojí — důkaz, že knihovna na 242
  vrcholech podhlásí, i to, že AABB cesta kolizi na témž obrysu najde.

- **CAM – model zbytku ve strategii si připisoval rampu průchodu S NULOVÝM
  DNEM.** `notePassInto` (výškové pole `cutFloorTab`) zapisovala rampu každého
  průchodu, i degenerovaného — takového, kde `zStart == zEnd`, tedy bez dna.
  Emise tutéž výjimku má od 12. 8. 2026 (`noteCutPass`) a ze stejného důvodu:
  k degenerovanému průchodu se najíždí úplně jinudy, než kudy vede plánovaná
  rampa, takže model „odebere" klín, který ve skutečnosti stojí.

  Na `part-8` to bylo zanoření #27 (dno 184,37 = 184,37): model srazilo na
  r 17,99 v pásu Z 183–192,5, kde dráha nechala stát až r 30,78. Podle toho
  modelu se přitom pouští zanoření a odložené zákroky, takže směr byl
  nebezpečný.

  Oprava stála **nulu** — `cam_sweep --diff` napříč 25 fixtures × 2 variantami
  držáku: Δ 0,0 mm² úběru, 0 změněných nálezů, žádná změněná fixture. Na
  dnešních dílech na tom tedy nikdy žádné rozhodnutí nestálo; do modelu to
  patří kvůli krokům 2–4.
- **CAM – odstup rychloposuvu v Z posouval i DRŽÁK, takže nájezd narazil 20 mm
  za špičkou.** Rychloposuv se před nájezdem zastaví `rapidStopZ` (Vůle + R)
  před hranou materiálu, aby sjezd v X proběhl ve vzduchu. Tím se ale o tentýž
  kus posune na neobrobenou stranu **celý držák**, a ten je v Z přes 20 mm
  dlouhý: průchod, který se svou vlastní polohou vejde, narazí tělem o 20 mm
  dál.

  Změřeno na `range-end-leadout` při ap 2,5 — držák **2,47 mm²** v materiálu na
  Z 103,8–105,2 už **staticky** na cíli (16,881; 85,268), kdežto na vlastním
  `firstCutZ` 83,468 nula. Na `part-15-finish-zprava` totéž, 1,78 mm².

  Že je kolize **polohová, ne trasová**, je i důvod, proč to vypadalo jako
  neřešitelné: `safeRapidTo` ji pozná (`holderHitsRapid`), ale odpoví jediným,
  co umí — zdvihem nad konturu. Ten s polohovou kolizí nehne, takže vznikla
  zbytečná dvojice „nahoru na X68 a hned zpátky dolů" a sjezd do ní vjel
  stejně (`emitDescendX` držák netestuje — a testovat by ho tam nemělo smysl,
  kolizi držáku nejde vyřešit tím, že se pojede pomaleji).

  Odstup se proto **zkrátí**, dokud se držák nevejde, nejvýš na `firstCutZ` —
  tam, kde stejně bude tělo průchodu. Nájezd tím nikdy nepostaví držák nikam,
  kam průchod sám nejde. Když ani na `firstCutZ` místo není, nemá zkracování
  co získat a odstup zůstává.

      dřív:  N1920 G0 Z85.268                        ← odstup 1,8 mm
             N1930 G0 X68.046 ; Výjezd nad konturu   ← marný zdvih …
             N1940 G0 X16.881                        ← … a sjezd do téže kolize
      teď:   N1920 G0 Z84.368                        ← odstup 0,9 mm
             N1930 G0 X16.881

  **Cena nula, program je i kratší:** při výchozím ap se nezměnil ani řádek
  (všech 51 snapshotů prošlo bez přepsání) a úběr zůstal na 76 849,6 mm².
  Tím padly poslední dva díly nálezu *„poloviční ap vyráběl rychloposuv
  materiálem"* — `tests/cam-pocket-lift.test.js` je teď hlídá spolu se
  zbylými čtyřmi.

  POZNÁMKA K DIAGNÓZE: první hypotéza zněla „rozdíl dvou modelů zbytku" (emise
  po plánované geometrii × validátor po skutečné dráze) a **byla mylná** —
  model emise tam říká přesně totéž co syrový polotovar (na Z 85,268 oba
  r 15,58) a nález nebyl destička, ale držák. Že měl `kind: 'rapid'`, mate:
  u rychloposuvu se hlásí `Math.max` z destičky a držáku pod jedním jménem.
- **CAM – čelní skim nechával na styku mřížek tenkou vrstvu.** Podélné
  hrubování dostalo 21. 8. opravu, která skim nad nakresleným vrcholem rozdělí
  **rovnoměrně** tak, aby dosedl přesně na první hloubku hlavní mřížky. Čelní
  varianta zůstala u pevného kroku od plánovací hrany, takže se obě mřížky
  o Vůli Z rozešly a mezi nimi zbyl průchod, který skoro nic nevzal:

      part-18, ap 3:  369,932 → 366,932 (3,0) → 365,932 (jen 1,0) → 362,932 (3,0)

  Rovnoměrné dělení dá 2 × 2,0 mm. Naměřené první rozteče:

  | fixture | ap | dřív | teď |
  |---|---|---|---|
  | `part-16` / `part-18` / `part-19` | 3 | 1,000 | **2,000** |
  | `face-cylinder` | 2 | 1,000 | **1,500** |
  | `face-casting` | 2,5 | 1,000 | **1,750** |

  **Nic to nestojí:** počet vrstev se nemění, jen se posunou — úběr vyšel na
  všech 25 fixtures na **76 849,6 mm²** před i po, pass counts beze změny.
  Zapíná se na TÉŽE hranici jako dřív (`SKIM_MIN_LAYER`), takže při Vůli Z
  menší než desetina *ap* se dál nic nedělí a první vrstva mřížky vezme
  `ap + zbytek` najednou; při nulové Vůli nevzniká skim vůbec.

  Levá strana neměla mezi fixtures **žádné** zastoupení (všechny čelní jedou
  zprava) — `tests/cam-face-skim-layer.test.js` ji testuje překlopením strany.
  Ten test má i poznámku o pasti, na kterou při psaní narazil: harness si
  Z/X-limity v singletonu `S` **merguje**, takže fixture bez některého klíče
  podědí hodnotu po předchozím běhu v témže souboru — levá strana kvůli tomu
  vyšla na 2,5 mm místo 1,75, a izolovaně přitom prošla.
- **CAM – Čelo polotovaru v Z 0 při hrubování zleva plánovalo dráhy 100 mm za
  materiálem.** Dno pro sledování obrysu (dojezdy schodů, výjezdy z kapes, cíle
  ramp) se v `genLongPasses` bralo z `(parseFloat(prms.stockLength) || 100) * -1`.
  Nula je ale u obou rozměrů polotovaru **legitimní volba** — Čelo v Z 0 je
  nejběžnější — a `||` ji spolkne stejně jako prázdné pole, které UI ukládá
  právě jako nulu (`applyParamChange`).

  Hrubování zleva to trefí naplno: `mirrorParamsZ` Čelo a Délku **prohodí**,
  takže Čelo 0 se v zrcadle stane Délkou 0 → dno spadlo na −100.

  Změřeno na válci Ø60 × 60, Čelo 0, zleva: **7 průchodů a G-kód až na Z 100**
  (plus 4 hlášky hlídání držáku navíc), proti 3 průchodům a Z 0,01 při Čele
  0,01 — tedy celý výsledek závisel na setině milimetru. Po opravě jsou obě
  varianty shodné.

  U odlitku rozměry válce neříkají nic, takže když Délka chybí, vezme se
  nejlevější Z **siluety**, ne konstanta. Na reálných dílech to vychází na
  totéž jako zadaná Délka (`part-1` i `part-11` mají G-kód bitově shodný).

  Pokrytí tu nebylo žádné: mezi fixtures je jediná válcová (`face-cylinder`)
  a ta jede čelní strategií, kde `cylStockZ` nefiguruje — kombinace
  válec + podélně + zleva nebyla otestovaná vůbec.
  `tests/cam-stock-zero-dimension.test.js`.
- **CAM – odskok čelního průchodu zavezl DRŽÁK dál, než kam ho hlídání pustilo.**
  Hlídání držáku sesadí hloubku čelního průchodu tak, aby se držák vešel **na
  poloze průchodu**. Odskok pod 45° pak posune celý držák o *Vyjezd* dál na
  obrobenou stranu a jen o tolikéž ven — u stěny strmější než úhel odskoku
  (na nahlášeném dílu dx/dz ≈ 2,8) tím tu právě vyměřenou rezervu sní.

  Kontrola odskoku ([gcodeEmit.js](js/calculators/cam/gcodeEmit.js)) přitom
  znala jen ŠPIČKU: hotovou konturu pod diagonálou (`gcOffsetXAt`) a zbytek na
  sousedních čelních rovinách do *Vyjezdu*, tedy 2 mm. Držák je ale v Z přes
  20 mm tlustý a radiálně sahá stovky mm ven, takže stěna, o kterou jde, leží
  desítky mm daleko — mimo dosah obojího.

  Nahlášeno uživatelem na `N4750 G1 X18.641 Z82.932`: vnější zadní roh držáku
  se otřel o přídavkovou slupku na stěně v pásu Z ≈ 100–108, kterou hlídání
  nechalo stát (17 průchodů vynecháno). Náhled to vybarvil červeně, ⛔ panel
  mlčel — 0,09 mm² je pod jeho prahem 0,5 mm².

  Odskok se teď ptá na **přírůstek**: kolik zbytku drží držák na konci odskoku
  proti tomu, kolik ho držel na schválené poloze průchodu. Absolutní dotyk se
  testovat nedá — plánovací zbytek se ubírá `toolFootprint` po úsečce průchodu,
  takže mezi vrstvami zůstávají fantomy, kterých se držák „dotýká" běžně
  (změřeno: práh 0,02 mm² proti nule překlopil na svislý výjezd **všechny**
  čelní odskoky na pěti fixtures). Při přírůstku se fantom vykrátí.

  Náprava stojí **nula materiálu**: hloubka i počet průchodů zůstávají, jen se
  místo diagonály vyjede svisle v X — zpátky do vlastní, právě vyříznuté stopy.
  Na nahlášeném dílu se překlopil **1 odskok ze 112**, vnoření 0,09 → 0,00 mm²;
  žádná z 24 stávajících fixtures nezměnila ani řádek G-kódu.

  PAST PŘI MĚŘENÍ: chová se to **nemonotónně** ve *Virt. zvětšení držáku*. Při
  0 a 2 mm je táž dráha čistá, při 1 mm ne — hlídání nechá pokaždé jinou
  rezervu a odskok ji sní jen někdy. `tests/cam-face-retract-holder.test.js`
  proto měří všechny tři, a měří je `HolderGouge` (tím se náhled **vybarvuje**),
  ne validátorem, který má práh 0,5 mm².
- **CAM – odlitek nakreslený jako uzavřená smyčka přišel o celé hloubky průchodů.**
  `stockZRangeAt` hledá Z-pás, kde na dané hloubce stojí polotovar, skenem
  **otevřeného** řetězu siluety: průsečíky vodorovnice + konce řetězu, ale ty jen
  tehdy, když samy leží *nad* hloubkou. Odlitek, jehož obrys se uzavírá na ose,
  tím o svou levou hranici přijde — vyjde jediné Z, vrátí se `null` a hloubka se
  **přeskočí celá**.

  Na `part-8` (silueta se v krčku propadá na r 17,9) takhle vypadlo sedm hloubek
  16,978 … 1,978, ačkoli v pásu Z 258–266 stojí materiál od osy až na r 39,94.
  Posloupnost pak skočila z 21,978 rovnou na vynucený průchod na `minPartX`, takže
  **jeden záběr vzal 21,98 mm při ap 2,5**. S nakresleným nožem to znamenalo
  121,8 mm² držáku v materiálu.

  Když bodový sken nedá použitelný pás, dopočítají se průsečíky z **uzavřené**
  smyčky (`buildStockLoopRaw`). Musí to být *všechny* průchody hranou, ne jen
  krajní Z: u siluety, která hloubky dosáhne ve dvou oddělených místech, by pás
  `[zHi, zLo]` přemostil mezeru mezi nimi.

  Výsledek na part-8: **27 → 35 průchodů, úběr +332 mm²**, největší skok hloubek
  21,98 → 5,00 mm, největší kolize s nakresleným nožem 121,8 → 15,3 mm².
  Ostatních 23 dílů beze změny. `tests/cam-stock-span-depths.test.js`.
- **CAM – model pro rychloposuvy si „odebíral" klín, který ve skutečnosti stál.**
  `noteCutPass` zapisuje do zbytkového modelu geometrii z PLÁNU (rampa → dno),
  aby model znal odebraný pás dřív, než se rozhodne o navazujícím rychloposuvu.
  U průchodu s **nulovým dnem** (`zStart == zEnd`, vzniká dobráním zbytku menšího
  než ap) ale žádné dno není a emise k němu najíždí úplně jinudy, než kudy vede
  plánovaná rampa: na `part-8` plán tvrdil úsečku (20,12; 193,70) → (17,622;
  184,37), kdežto program přijel od Z 220 a zapíchl se radiálně až dole.

  Model tím „odebral" klín, který stojí — na Z 189 o **6,13 mm** víc, než kolik
  dráha ubrala (`tests/cam-residual-model`, mez 0,05 mm). Degenerovaný průchod se
  proto z plánu nezapisuje; skutečně projeté řezy si model zaznamená sám
  (`noteCutMove`/`noteCutArc` u každého emitovaného pohybu).

  Vedlejším ziskem se prodloužily dokončovací **rovné průměry**, které kvůli tomu
  fantomu končily dřív: `part-1` `N2410 G1 X43.178` z `Z−2.500` na `Z−10.500`,
  tedy o 8 mm blíž ke skutečnému konci materiálu.
- **CAM – výchozí (nenakreslený) držák byl vystředěný na špičku.** Bez vlastního
  obrysu se používá náhradní obdélník `holderWidth × holderLength`, a ten měl
  v profilu `x ∈ [−hw/2, +hw/2]` — půlka držáku (u výchozích 20 mm celých 10)
  tedy trčela na **neobrobenou** stranu břitu, přesně tam, kde stojí materiál.
  Plánování to navíc ani nevidělo: `holderBottomProfile` prohledává jen `d ≥ 0`,
  takže ta polovina byla pro hlídání neviditelná, zatímco ⛔ validátor (celý
  polygon) ji hlásil. Generátor tedy uměl kolizi ukázat, ale ne se jí vyhnout.

  Není to jen záplata na hlídání — takhle vypadá **každý skutečný nůž**: všechny
  nakreslené obrysy i všech šest nožů v `DEFAULT_TOOL_MAGAZINE` mají `x ∈ [0, hw]`
  (destička sedí v rohu držáku, ne uprostřed). Obdélník teď leží celý na obrobené
  straně, v hlídání i v náhledu.

  | fixture | průchodů | úběr mm² | kolize (silueta/offsetová čára) |
  |---|---|---|---|
  | face-casting | 43 | beze změny | **12/12 → 0/0** |
  | face-cylinder | 29 | beze změny | **12/12 → 0/0** |
  | holder-region-roughing | 36 → 40 | +118,2 | **0/5 → 0/0** |
  | part-1 · part-2 | 20 → 27 | +205,7 | 0/0 |
  | part-4 · part-6 | 24 → 33 | +218,9 | 0/0 |
  | part-9 | 22 → 31 | +218,9 | 0/0 |
  | pocket-wall-at-plunge-angle | 27 → 37 | +93,8 | 0/0 |
  | part-8 | 25 → 27 | +148,9 | 0/0 → 0/9 |
  | holder-casting-slanted-face | 15 → 19 | +35,0 | 0/0 → 2/3 |

  **Celkem úběr +1464 mm² (+2,3 %)** a doložená mez u `holder-region-roughing`
  z 20. 8. zmizela úplně. Dvě položky zbývají a obě jsou v `EXPECTED`
  s naměřenými čísly: `holder-casting-slanted-face` (2 nálezy 0,6 a 1,6 mm² na
  rampě — táž mez modelu `holderFitsAt`, jaká právě zmizela jinde) a `part-8`
  proti offsetové čáře (9 nálezů do 13,1 mm² v přídavkové slupce nad pahýlem
  polotovaru; proti nakreslené siluetě je čistý).
- **CAM – vjezdová rampa na hranici úseku jela dnem až na konec okna.** Když sken
  intervalů nevrátí nic, vyrobí se rampový vjezd z povrchu polotovaru — a jeho
  dno mělo natvrdo `zEnd = effZMin`, tedy až na dno celého Z-okna, **aniž by se
  kdokoli zeptal, kde kontura blokuje**. Dokud se sem chodilo jen tehdy, když pod
  vjezdem opravdu bylo volno, sedělo to; jenže „žádné intervaly“ znamená i
  *„jediný interval zahodila obálka držáku“* — a tam pod rampou kontura stoupá.

  Odkryla to oprava tvaru držáku výš (mění, které intervaly obálka zahodí):
  na `part-1` se zapnutým Zanořováním po regionech dosedla rampa na Z 194,83
  a dno jelo až na Z −10, přestože offset je od Z 183,98 dolů nad 43 — tedy
  **27,2 mm pod hotovní konturou**, a totéž na `part-2/4/6/9`. Dno se teď hledá
  týmž krokem a týmž `blockedAt`/`refineEngageZ` jako v `scanIntervals`, takže
  konec sedí na kontuře přesně jako u běžného průchodu. Hlídá to
  `tests/cam-gouge-invariants` (bez téhle opravy padá na 5 dílech).
- **CAM – ⛔ validátor hlásil kolize se stínem vlastního modelu.** Zbytkový
  polotovar si ubíral `toolFootprint` — *plánovací* aproximací destičky
  (rádius nosu + rovné tělo do výšky 2×ap). U nekulaté destičky po ní v modelu
  zůstávaly rádiusy i tam, kde reálně řeže rovná hrana (je to popsané přímo
  v hlavičce `toolFootprintVisual`), a držák pak „narážel“ do materiálu, který
  destička ve skutečnosti odvezla.

  Validátor ale nic neplánuje, jen hlásí — tuhle nepřesnost si dovolit nemůže.
  Odebírá se teď **skutečným obrysem destičky** (`toolFootprintVisual`).
  Změřeno na dílech s aktivním omezením (tam vzniká nejvíc stojícího materiálu):

  | případ | před | po |
  |---|---|---|
  | part-15 + koník Z200 | 74 nálezů / 2073,7 mm² | 39 / 1381,7 |
  | part-1 + rozsah X 20–40 | 32 / 36,3 | 15 / 18,9 |
  | part-15 + čelisti Z100 | 13 / 199,4 | 13 / 97,3 |
  | part-15 + rozsah Z 150–240 | 3 / 39,0 | 2 / 7,8 |

  Zhruba **polovina hlášení byl stín modelu, ne dráha.** Směr je bezpečný:
  přesnější obrys odebere víc, takže hlášení může jen ubýt, nikdy přibýt — bez
  omezení vycházejí obě varianty na nulu, takže se plošný invariant nemění.
  Do **plánování** ten obrys pořád nepatří (viz tamtéž): tam by jen vyrobil
  hlášení, která plánovač neumí obejít, dokud `rapidStopX` neumí spodní hranu
  destičky.
- **Dokumentace – příručka slibovala u rozsahu 📐 něco, co se nekoná.** Stálo
  tam, že *„nástroj do materiálu za hranicí rozsahu nenarazí“*. Není to pravda:
  ⛔ validátor i model úběru s celým polotovarem opravdu pracují, ale **obálka
  držáku, podle které se dráhy plánují, ne** — ta si překážku staví z hotového
  dílu, takže materiál, který operace za hranicí záměrně nechává stát, pro ni
  neexistuje. Naměřeno: `part-14` s pásem Z 100–200 vjede držákem 401 mm² pod
  dolní hranici, rozsah X 20–40 dá 222 mm², čelisti Z=100 dá 60 mm².

  Sekce *Obrábění po úsecích* teď popisuje skutečný stav i to, co s tím dělat
  (obrábět úseky v pořadí, kdy je sousední úsek na obrobené straně už hotový,
  a po změně rozsahu se dívat do ⛔ panelu).

  **Oprava byla zkoušena a zamítnuta:** přidat materiál za pásem do překážky
  `makeHolderClamp` spraví `part-14` (401,7 → 4,8 mm²), ale `part-15` s pásem
  Z 100–200 rozbije (0 → 213,3 mm²) a s pásem Z 0–120 taky (1,2 → 10,8);
  úběr přitom skáče o ±30 % (part-14 1120,9 → 714,7, part-15 460,6 → 687,6).
  Větší překážka totiž mění, které intervaly přežijí, a zanořování si pak najde
  jiné vjezdy. Bez order-aware modelu zbytku to nejde spravit lokálně.
- **CAM – zdvih při návratu v kapse jel rychloposuvem skrz její stěnu.** Při
  `pocketReposition` se nástroj zvedá po úrovních vrstev, dokud není volný
  *přejezd v ose Z*. Sám **zdvih** na tu výšku se ale netestoval proti ničemu —
  a to je vlastní stěna kapsy: po odskoku o „Odskok“ v ní nástroj pořád stojí.

  Při hloubce záběru uložené ve fixture zdvih náhodou vycházel do vzduchu, takže
  to vypadalo čistě. **Stačilo `ap` zmenšit na polovinu** a šest z dvaceti čtyř
  dílů začalo generovat rychloposuv stojícím materiálem:

  | díl | ap | nález |
  |---|---|---|
  | part-4 · part-6 · part-9 | 2 → 1 | 3,0 mm² |
  | pocket-wall-at-plunge-angle | 2 → 1 | 1,8 mm² |
  | part-15-finish-zprava | 5 → 2,5 | 1,8 mm² *(jiné místo)* |
  | range-end-leadout | 5 → 2,5 | 2,5 mm² *(jiné místo)* |

  Důkaz (part-4, ap 1): `N2580 G1 X33.977 Z42.434` je odskok 45°, pořád v kapse,
  a hned za ním `N2590 G0 X39.977` jel skrz stěnu. Nálezy přežily i zmenšení
  nástroje o 0,5 mm, takže to nebyl drift modelu.

  Opraveno zrcadlem `emitDescendX` — novým `emitLiftX`: když zdvih na zbytek
  naráží, jede se posuvem až nad jeho povrch a teprve zbytek rychloposuvem.
  Týž kód teď obsluhuje i „Výjezd nad konturu“ v `safeRapidTo`, kde tahle logika
  už byla (jen zvlášť). Při výchozím `ap` se změnil **jediný řádek** (part-8,
  rozdělený zdvih) a úběr je identický. Vedlejším ziskem zmizely obě `rapid`
  kolize (4,1 a 2,1 mm²) i na part-8 s nakresleným nožem.

  `tests/cam-pocket-lift.test.js` (na původním kódu padá 5 ze 6 případů) hlídá
  i třetinové a pětinové `ap`, ne jen půlku.

  **Poslední dva díly zůstávají a je to jiná příčina:** ne zdvih v kapse, ale
  sjezd na hloubku průchodu (`G0 X…` po „Výjezd nad konturu“), který emise
  vlastním modelem zbytku neuvidí — ta si ho vede po *plánované* geometrii
  průchodů, kdežto validátor po skutečně vygenerované dráze. Nálezy 1,8 a
  2,5 mm² mizí při zmenšení nástroje o 0,5 mm, tedy přesně na hranici toho
  rozdílu; srovnat oba modely je samostatná práce.
- **Testy – plošný invariant kolizí hlídal jiným nástrojem, než jakým se řezalo.**
  `cam-collision-free` předával validátoru `prog.params` (syrový obsah `.camprog`),
  kdežto pipeline běžela nad `S.params` (chybějící klíče doplněné výchozími).
  Devět z dvaceti čtyř fixtures nemá v `.camprog` `holderWidth` ani `holderLength`,
  takže `holderProfileLoop` vrátila `null` a **kontrola držáku u nich tiše nedělala
  nic**. Invariant „žádná fixture, žádná kolize“ tedy u třetiny dílů neplatil —
  jen to nebylo vidět. Postižené: `part-1/2/4/6/8/9`, `pocket-wall-at-plunge-angle`,
  `face-casting`, `face-cylinder`.

  Harness (`tests/helpers/camHeadless.mjs`) teď vrací `params` — kopii sady, se
  kterou se opravdu generovalo — a test validuje ji.

  **Druhá polovina téhož: `S` je singleton, takže fixture dědila každý klíč,
  který sama neuvádí, od té PŘEDCHOZÍ.** Soubory se berou abecedně, takže
  `part-19-face-tilted-insert` nastavil nakreslený `holderProfile` a
  `part-2/4/6/8` ho pak zdědily, ačkoli žádný držák nemají. Výsledek závisel na
  pořadí a aplikace se tak nikdy nechová (tam je vždy plná sada). Dřív se takhle
  bodově izoloval jen `booleanRoughing`; teď se před každým během slije celá
  výchozí sada. Následkem se přepsalo 35 snapshotů u sedmi dílů — ty staré
  zamrazily G-kód vyrobený nástrojem, který fixture nedeklaruje.

  Co pod tím leželo: `face-casting` a `face-cylinder` mají **12 nálezů do
  195,8 mm²**. Příčina je jedna a je doložená — náhradní obdélníkový držák je
  vystředěný na špičku (`x ∈ [−hw/2, +hw/2]`), takže půlka trčí na neobrobenou
  stranu břitu; každý skutečný obrys (nakreslený i všech šest nožů
  v `DEFAULT_TOOL_MAGAZINE`) má `x ∈ [0, hw]`. Posunutí téhož obdélníku na jednu
  stranu srazí u obou dílů nálezy z 12 na 0. Zatím jsou proto v `EXPECTED`
  s naměřenými čísly; oprava čeká na to, až se doplní hlídání vjezdů do
  nevyhrubovaného polotovaru (`buildObstacleLoops` staví překážku z hotového
  dílu, takže je z principu nevidí — na `part-8` je to 103,9 mm²).
- **CAM – aktivní koník uvnitř dílu mazal CELÉ dokončování.** Ořez dokončovací
  dráhy na `[čelisti, koník]` zvedal na PRVNÍM ořezaném segmentu příznak
  „pastLimit“ a všechno za ním zahodil — ať už byl na vině kterýkoli z limitů.
  To dává smysl jen pro limit na KONCI jízdy: dokončování jede od velkého Z
  k malému, takže čelisti (levý konec) potká naposled, kdežto koník hned na
  začátku. Naměřeno na part-15 (bez limitů Z 0,0…235,0):

  | limity | před | po |
  |---|---|---|
  | koník Z200 | **0 úseků** | 7 úseků, Z 0,0…166,5 |
  | koník Z120 | **0 úseků** | 3 úseky, Z 0,0…67,1 |
  | čelisti Z100 | 5 úseků ✓ | 5 úseků ✓ |
  | čelisti 100 + koník 200 | **0 úseků** | 4 úseky, Z 125,5…166,5 |

  Na part-14 to shodilo dokončování i u samotných čelistí (0 místo 8): segment,
  který se nedal ořezat „čistě“, strhl zbytek s sebou. Uživatel přitom dostal
  jen obecné *„Z-limity: dokončování ořezáno“*, takže zmizení celé operace
  vypadalo jako normální ořez.

  Opraveno přechodem na PÁSOVÝ ořez, sdílený s rozsahem obrábění (`clipFinishBand`
  — zápis níž): `[čelisti, koník]` je taky pás, jen z jiných čísel. Pásový ořez
  pojem „za hranicí“ nezná, ptá se jen „uvnitř, nebo venku?“, takže na pořadí
  limitů ani na směru jízdy nezáleží. Navíc oblouk na hranici TRIMUJE místo
  zahození (dřív padl celý, i když z něj uvnitř zůstávala většina).

  Ověřeno proti stavu před opravou: **nepřidává to ani jednu kolizi** — počty
  nálezů jsou v každé z 20 měřených konfigurací shodné. Nálezy, které u limitů
  jsou, pocházejí z hrubování ořezaného limity (materiál zůstane stát vedle),
  ne z dokončování. `tests/cam-finish-limits.test.js` (na původním kódu padá
  6 z 9 případů).
- **CAM – Rozsah obrábění Z i X (📐) ořezává i DOKONČOVACÍ dráhu.** Hrubování
  pás respektuje (obě strategie), dokončování jelo pořád přes celý díl —
  a mimo pás tedy po neohrubovaném materiálu. Měřeno na part-15: pás Z 100…200
  nechal dokončování na Z −1…235, teď je 125,5…166,5.

  Na rozdíl od čelistí a koníku není rozsah polorovina, ale **pás**: může
  uříznout oba konce, nechat kus uprostřed, nebo z jednoho úseku kontury udělat
  dva. Nešel proto použít dosavadní ořez (ten jede „všechno za první hranicí“);
  ořezává se segment po segmentu, oblouky se trimují na výseku (ne zahazují),
  a nový začátek úseku dostane přejezd.

  **Ořezává se, nezahazuje** — pravidlo „celý, nebo vůbec“ (11. 8. 2026) tu
  neplatí: to řeší úseky *nedosažitelné pro nástroj*, kde by zkrácení nechalo
  schod uprostřed hotové plochy. Hranice pásu je proti tomu volba uživatele
  a hrubování se na ní ořezává úplně stejně.

  Ověřeno proti stavu bez ořezu: **nepřidává to ani jednu kolizi** (shodné počty
  nálezů na 4 dílech × 4 pásech). Pozor — u některých pásů nálezy jsou, ale
  pocházejí z hrubování omezeného pásem: vedle zůstane stát materiál a držák do
  něj najede. Existuje to na HEAD i beze změny (part-14, pás Z 100…200: 6 nálezů;
  part-1, pás X 20…40: 6 nálezů do 28,9 mm²) a je to samostatná věc k opravě.
  Nové případy v `tests/cam-face-range.test.js` (na původním kódu padá 8 z 8).
- **CAM – čelní hrubování ignorovalo Rozsah obrábění Z i X (📐).** Uživatel
  viděl v náhledu čáry „Start / Konec rozsahu“ a dráhy si jich nevšímaly:
  výstup byl se zapnutým i vypnutým rozsahem **bitově stejný** (part-16:
  112 průchodů, Z −9,1…366,9, ať byl pás 250–320, 100–150, nebo X 20–40).
  `genFacePasses` si `machiningRange` ani `machiningRangeX` z kontextu vůbec
  nevyzvedlo — `calculatePipeline` je do `passCtx` předává, ale četl je jen
  `genLongPasses`. Čelisti a koník fungovaly, protože ty se aplikují až
  dodatečně na hotové pole průchodů.

  Rozsah **Z** teď vybírá VRSTVY (marchovací osa čelního hrubování je Z —
  přesný protějšek toho, jak rozsah X vybírá hloubky v podélném hrubování).
  Rozsah **X** drží dno řezu (`xEnd ≥ xLo`).

  Tři věci, které z toho vypadly jako změřená rozhodnutí, ne jako volba:

  - **Horní mez rozsahu X se čelně vynutit nedá** a nepokoušíme se o to.
    Podélně jde hloubku přeskočit (řez jede v konstantním X), čelně ne — řez
    jde radiálně od povrchu. Vynechávat vrstvy, jejichž řez celý leží nad
    pásem, bylo zkoušeno a zamítnuto: nechá uprostřed dílu stát neobrobené
    plátky a nos je při nájezdu ořízne (part-18 s R8: 11,8 mm² kolize
    rychloposuvu na `N2810 G0 X46.450`, kde bez toho byla nula).
  - **Krajní vrstva pásu odskakuje svisle v X**, ne 45° k obrobené straně:
    za pásem tahle operace neobrábí, takže materiál tam stojí v plné výšce
    a diagonála do něj zajede (face-cylinder, pás Z 10…30: odskok na Z32
    a navazující výjezd 5,7 mm² skrz polotovar). Mez je krajní VRSTVA, ne
    hranice pásu — mřížka na hranici většinou nesedí a mezi poslední vrstvou
    a hranicí zůstává neobrobený proužek (pás 25…45: vrstvy končí na Z44,
    na Z45 stojí polotovar, 2,8 mm²). Nasadí se jen tam, kde rozsah mřížku
    opravdu ořízl, takže rozsah přes celý díl dává bitově týž G-kód.
  - **Hlídání držáku vidí dál CELOU marchovací mřížku** (`zListAll`), protože
    za hranicí pásu stojí polotovar v plné výšce. Hlídání destičky
    („nikdy hlouběji než předchozí vrstva“) naopak čte jen pás: popisuje
    schodiště, které vyrábí tahle operace, a se syrovým povrchem za hranicí
    jako „hotovou vrstvou“ se pás s natočenou destičkou skoro celý zahodil
    (part-19, pás 300–360 → 0 průchodů; face-casting → 0 v každém pásu).
    Táž dělba jako u podélného hrubování: rozsah ořezává PLÁNOVÁNÍ, kolize
    se hlídají proti celému polotovaru.

  Ověřeno validátorem na 25 kombinacích díl × pás (zprava i zleva): nula
  nálezů proti nakreslené siluetě i proti offsetové čáře. Nový plošný test
  `tests/cam-face-range.test.js` (na původním kódu padá 9 z 10 případů).
- **CAM – jednostranné zvětšení držáku srazilo jeho spodní hranu.** Zápis
  o něm níž slibuje, že *„spodní šikmá hrana se pod svým úhlem prodlouží"* —
  implementace ji ale POSUNULA (zametení obrysu ve směru `+z`). Posunutá hrana
  má sice týž sklon, jenže na každé vzdálenosti od špičky leží o `d · sklon`
  níž: na noži uživatele 0,365 mm (1 × 6,5515/18) po celé délce.

  `holderBottomProfile` z té hrany počítá, jak hluboko smí ČELNÍ průchod, takže
  se každý průchod o tolik ochudil — nález uživatele 24. 8. 2026: *„podívej se,
  kolik je místa u toho upichovacího nože a kolik to zajíždí; prostor pro
  zanoření je mnohem větší, je tam nejspíš nějaká chyba, co to blbě počítá."*

  Vrcholy na obráběné straně se nově posouvají PO SVÉ HRANĚ (té, která k nim
  přichází z menšího z), takže zůstanou na TÉŽE přímce a spodní profil je bod
  po bodu shodný — jen delší. Dvě pojistky: vrchol nesmí klesnout pod svou
  původní výšku ani přelézt nejvyšší bod držáku.

  Na čelním programu uživatele jdou průchody v průměru o **0,64 mm hlouběji**
  (`X50.944` → `X50.580`, `X49.934` → `X48.478`) a kolize zůstávají na nule.
  Na podélném (`projekt_2026-08-21 (4)`) je to ještě lepší: úběr 4340,7 →
  4380,8 mm², ⛔ proti syrovému obrysu **2 → 0**, oranžová 0,68 → 0,42 a
  červená 6,3 → 4,97 — správný model držáku znamená i míň falešných nálezů.
  Napříč 24 fixtures **nulový rozdíl** (mají zvětšení 0, takže se jich to
  netýká). Vedle toho odpadla i závislost na `minkowskiSolidSum` a s ní
  štěrbina, kterou obrys po zametení míval.

### Changed
- **CAM – přepínač strany zvětšení držáku je tlačítko, ne zaškrtávátko.**
  V úzkém sloupci panelu se název „Virt. zvětšení držáku (zprava)" zalamoval do
  tří řádků a ze zaškrtávátka nešlo poznat, co je vlastně zapnuté (nález
  uživatele 24. 8. 2026: *„ať jde jasně poznat, jestli to je jenom z té jedné
  strany, nebo kolem celého"*). Vedle hodnoty je teď tlačítko, které stav rovnou
  píše — **▶ zprava** / **◀ zleva** / **⭘ dokola** — a klepnutím se přepíná;
  v režimu „dokola" navíc svítí fialově. Tooltip na něm vysvětluje, co která
  volba dělá, včetně varování, že „dokola" přidává i u špičky.

### Fixed
- **CAM – `toolSweep` zametal jen po obrysu, ne obrysem.** Minkowského suma
  s otevřenou dráhou (`minkowskiSumD(…, false)`) vydá stopu HRANICE, ne
  zametené TĚLESO — chyběl jí člen `A + b₀`, tentýž, jaký o kus níž v témž
  souboru přidává `minkowskiSolidSum`. Na dlouhém úseku to nebylo vidět,
  protože hranice cestou projde celým vnitřkem; na krátkém kroku ale zůstal
  uprostřed neodebraný ostrůvek:

  ```
  obrys 17,0 mm²,  krok 0,2 mm →  4,3 mm²   (MÍŇ než obrys sám)
  obrys 17,0 mm²,  krok 1,0 mm → 21,5 mm²   (má být 27,8)
  těleso 194,5 mm², krok 0,2 mm →  5,7 mm² ve 4 kusech
  ```

  Ostrůvek pak v modelu vypadá jako materiál. Nejdřív se to projevilo na
  vybarvování kolizí držáku (bod 4 plánu: přesnější model materiálu vyrobil
  na `part-11-zleva-casting` 6,8 mm² oranžové z čisté nuly), ale netýkalo se
  to jen jeho — `toolSweep` pohání úběr v CELÉ aplikaci: `MaterialRemoval`,
  `validateToolpath` i `rapidStock` v emisi.

  Doplňuje se obrys posazený na OBA konce úseku, orientovaný kladně (`NonZero`
  by opačně orientovaný překryv vyrušil a udělal z něj díru — táž úvaha jako
  v `minkowskiSolidSum`). Degenerovaná jednobodová dráha nově vrátí obrys
  stojící na místě, dřív nevrátila nic.

  Napříč 24 fixtures a třemi programy uživatele: **G-kód se změnil na jediné
  fixture a na jediném řádku** (`holder-region-roughing`, `N840 G0 X52.690` →
  `X52.689`, tedy 1 µm; počet průchodů, řádků i varování beze změny). Úběr
  vzrostl na dvou dílech o 0,42 % (`part-11-zleva-casting` 3431,4 → 3445,7,
  `part-12-zleva-step` 3249,7 → 3263,7) — to je právě ten dřív minutý materiál.
  Ostatních 20 programů je bit po bitu shodných. Stopa DRŽÁKU je teď taky
  úplná, takže se `holder-region-roughing` doměřila jeho známá mez:
  5 nálezů 0,79–0,92 mm² místo 4 nálezů 0,61–0,92 na týchž dvou místech —
  přesnější měření staré meze, ne nová vada.

### Removed
- **CAM – obchůzka `sweepSolid` v `holderGouge.js`.** Doplňovala zametenou
  plochu lokálně, aby oprava vybarvování nesahala na dráhy. `toolSweep` to
  teď dělá sám, takže obchůzka padla bez náhrady.

### Fixed
- **CAM – červená kolize pod plátkem, která se odkryla po odjetí nože.**
  `HolderGouge` je ZÁZNAM (jednou vybarvené místo tam zůstane i po přejetí —
  je to úmysl), takže cokoli se vybarví omylem, se dřív nebo později odkryje.
  Nález uživatele 21. 8. 2026: *„po odjetí nože se objeví červený lichoběžník
  od kolize, který by tam neměl být."* Chyba byla v modelu MATERIÁLU, ne
  v detekci — držák se testoval proti materiálu, který tam už dávno nebyl:

  - **Ubíralo se tenkým PLÁNOVACÍM profilem, ne tělem destičky.**
    `toolFootprint` je aproximace pro plánování (stadion kolem nosu, u nože
    uživatele 10,6 mm²); materiál ve skutečnosti odebírá celé těleso plátku —
    týž obrys, jaký simulátor KRESLÍ jako odebraný (`MaterialRemoval` bere
    právě ten, 76,6 mm², tedy 7× víc). Rozdíl zůstával v modelu stát jako
    materiál a držák se do něj „vnořoval".
  - **`toolSweep` vrací jen stopu HRANICE** (Minkowski bez členu `A + b₀`,
    na rozdíl od `minkowskiSolidSum`). Na dlouhém úseku to nevadí, na krátkém
    kroku zbude uprostřed neodebraný ostrůvek: změřeno na tělese destičky
    194,5 mm² a kroku 0,2 mm → zameteno 5,7 mm² ve 4 kusech. Bez doplnění
    vyrobila oprava výš na `part-11-zleva-casting` 6,8 mm² oranžové z čistého
    nulového stavu. Doplňuje se JEN v tomhle modelu (`sweepSolid`) — táž
    oprava přímo v `toolSweep` je správná, ale sahá na úběr v CELÉ aplikaci
    včetně emise a měřitelně hýbe vygenerovaným G-kódem, takže se dělala
    samostatně — viz zápis výš; obchůzka `sweepSolid` tím padla.

  Na dílu uživatele červená **2,46 → 1,36 mm²** (největší z pěti oblastí,
  `N2290 G1 Z139.365`, spadla z 1,12 na 0,02) a s virtuálním zvětšením držáku
  8,61 → 6,28. Napříč 24 fixtures se zlepšily dvě (`part-16-face-holder`
  0,09 → 0, `part-17-long-parting` oranžová 0,21 → 0 a červená 1,3 → 1,01),
  ostatní beze změny. **Nálezy `validateToolpath` (⛔ panel) se nezměnily
  nikde** — tvrdá pojistka zůstává přesně tam, kde byla; mění se jen to, co se
  VYBARVUJE.
- **CAM – prostor destičky se neodečítá jen u řezu, ale i u rychloposuvu.**
  Držák se u G0 bral CELÝ, tedy včetně části, která se u hrotu překrývá
  s destičkou (u nože uživatele pás X 0–15 × Z 0–4,2 mm) — u řezných bloků se
  přitom odečítá od 21. 8. 2026. `HolderGouge` odpovídá na otázku „kudy se
  vnořil DRŽÁK", a prostor destičky do té odpovědi nepatří ani při
  rychloposuvu. Slepé místo to nedělá: rychloposuv tělem destičky skrz
  materiál hlásí `validateToolpath`, a ten si u G0 držák schválně bere celý
  právě proto, aby tělo destičky pokryl.

  Poctivě: napříč 24 fixtures i na třech programech uživatele je tahle změna
  sama o sobě **0,00 — nikde nevystřelí**. Je to oprava asymetrie, ne příčina
  nálezu výš; ta byla v modelu materiálu.

### Fixed
- **CAM – skim vrstvy už nenechají na styku s mřížkou tenký zbytek.** Skim
  posloupnost byla kotvená na `planTopX` (povrch + Vůle X) a hlavní mřížka na
  `maxStockX`, obě krokovaly po `ap` — takže se o tu Vůli **rozešly** a na
  jejich styku zbyla vrstva mimo záběr. Na dílu uživatele (ap 3, vůle 1):
  65,545 → 62,545 (3,0) → 61,545 (**jen 1,0**) → 58,545 (3,0) — nález 21. 8. 2026
  *„jedna vrstva zvrchu nedodržuje ap“* (`N230 G1 Z196.278`).

  Skim pás se teď dělí ROVNOMĚRNĚ tak, aby dosedl PŘESNĚ na první hloubku
  hlavní mřížky: `ceil(pás / ap)` stejných kroků. Na tom dílu 2 × 2,0 mm místo
  3,0 + 1,0 — žádná vrstva ne přetěžuje `ap` a žádná není degenerovaný zbytek.
  Hlavní mřížka zůstává kotvená dál na `maxStockX`, tedy bitově stejná — to je
  podmínka z původního zápisu skim vrstev (posunutí celé posloupnosti bylo
  změřeno a zahozeno: `part-8` −5 průchodů / −337 mm²).

  Napříč 24 fixtures **0,00 % rozdílu v úběru**, žádná změna v kolizích a žádná
  fixture nezměnila počet průchodů, řádků ani zanoření — posunuly se jen
  souřadnice prvních dvou hloubek.
- **CAM – rychloposuv na další vrstvu už nejede zešikma.** `safeRapidTo`
  měla dvě větve, které vydávaly jeden diagonální `G0 X… Z…`. Diagonála je
  bezpečná jen podle testu ÚSEČKY (`rapidHitsStock` / `holderHitsRapid`), jenže
  mezi hloubkami umí projít polotovarem — nález uživatele 21. 8. 2026 na
  `G0 X19.543 Z175.282` (*„jede zešikma na další vrstvu a protne polotovar“*).

  Nově se dělí podle směru: při SJEZDU do menšího průměru **nejdřív Z, pak X**,
  při výjezdu ven opačně. U sjezdu je to vždycky BEZPEČNĚJŠÍ, ne jen jiné:
  přejezd v Z se udělá na původní, tedy větší hloubce, takže leží celý nad
  diagonálou. Krátký diagonální POSUV (zbytek kratší než Vůle) zůstává — ten
  materiál odebírá a dělit ho by změnilo řez.

  Čistě změna trasy: napříč 24 fixtures **0,00 % rozdílu v úběru**, žádná změna
  v kolizích ani v počtu průchodů — jen o 1–5 řádků víc na ty rozdělené pohyby.
- **CAM – obálka upichováku už nepíše začátek oblouku úsečkou.** Vzorkovač
  obálky (`samplePartingEnvelope`) měl mřížku rovnoměrnou v OSE Z, jenže tam,
  kde předloha stoupá strmě v X, je tětiva mezi vzorky mnohem delší než krok:
  na oblouku r 7,276 vyšla z kroku 0,36 mm v Z tětiva 1,2 mm. Její průhyb
  0,025 mm přelezl toleranci zpětného proložení (`fitArcsToPolyline`, 0,02),
  takže první kus oblouku se vydal ÚSEČKOU a teprve zbytek obloukem (nález
  uživatele 21. 8. 2026: *„místo jednoho oblouku dvě úsečky a pak teprve
  oblouk"*). Ironií je, že ta úsečka se od pravého oblouku odchýlí přesně
  o těch 0,025 mm, které se tolerance snažila uhlídat.

  Mřížka se proto půlí, dokud tětiva nespadne pod krok. Vzorků může jen
  PŘIBÝT, takže obálka se nikde nesníží; na rovných úsecích je zpátky slije
  kolineární redukce. Svislý skok (konstantní Z) se nepůlí.

  `N2720 G1 X23.736 Z73.911` + `N2730 G3 …` → jediné `G3 X25.569 Z72.824
  CR=7.276`. Napříč 24 fixtures −0,01 % úběru, mění se dvě
  (`part-16-face-holder` −4 mm², `part-17-long-parting` −2 mm²), nikde kolize.

- **CAM – prostor destičky se už nehlásí jako kolize držáku.** Obrys držáku
  začíná ve ŠPIČCE (`holderWorldLoop`), takže se u hrotu překrývá s destičkou —
  u nože uživatele v pásu Z 0–4,2 × X 0–15 mm. Materiál, který tam je, ale
  ŘEŽE DESTIČKA; `HolderGouge` i `validateToolpath` ho přesto počítaly jako
  náraz držáku (nález uživatele 21. 8. 2026: *„vidím tam kolizi červenou, ale
  ten držák je za plátkem"*). Na jeho dílu to dělalo polovinu zbylých nálezů
  proti offsetové čáře (9,1 → 4,9 mm²); po opravě je oranžová 0,28 → 0 mm²
  a ⛔ 2 → 0.

  Odečítá se `toolFootprintVisual` — TÝŽ obrys, jaký simulátor KRESLÍ. Se
  samotným `insertWorldLoop` zůstal u špičky výřez ve tvaru rohového rádiusu
  destičky (r 0,8): 3,3 mm² mezi obloukem a hranou tělesa, které do obrysu
  nepatří, ale uvnitř nakresleného plátku leží — a přesně ty se pak vybarvily
  červeně UVNITŘ destičky (nález uživatele: *„vidím výřez, jako bych udělal
  kružnici toho radiusu"*). Skutečné oblasti zůstávají: na dílu uživatele
  červená 2,94 → 2,46 mm² ve stejných třech místech.

  Odečítá se JEN u ŘEZNÝCH bloků. Při rychloposuvu nemá v materiálu co dělat
  ani tělo destičky, a dnes to hlídá právě ta překrývající se část — stopa
  `toolFootprint` je jen tenký řezný profil (X −0,8…6 × Z −0,8…0,8), kdežto
  tělo destičky sahá na X 15 × Z 4,2. Plošné odečtení by tam udělalo slepé
  místo, takže u G0 se dál bere držák CELÝ.

  Mění se jen to, co se HLÁSÍ a KRESLÍ — plánovač (`makeHolderClamp`,
  `holderFitsAt`, mezní čáry) zůstává schválně pesimistický, takže žádná dráha
  se nemění: napříč 24 fixtures nulový rozdíl v úběru i v počtu průchodů,
  jediná změna je `part-17-long-parting` 0,12 → 0,08 mm² oranžové.
  (V hlídání drah tenhle pás vyňatý už je — přes `insertReachZ`.)

### Added
- **CAM – hrubování dodělá vrstvu, než odskočí.** Dojezd „bez schodků" končil,
  jakmile offset klesl na hloubku DALŠÍHO průchodu — s tím, že ten si zbytek
  vezme. Na STRMÉM BOKU ale offset propadne pod tu hloubku hned na prvním
  milimetru a žádná hlubší vrstva se tam nedostane: kapsová větev ten interval
  zahodí, protože na jeho ZAČÁTKU (těsně za hrbem) se nevejde držák,
  a `holderClampZEnd` umí zkrátit jen KONEC, ne posunout začátek. Vrstva pak
  skončila uprostřed úseku materiálu (na dílu uživatele 7,5 mm z 11,8 mm
  dlouhého úseku, `N1760 G3 X40.118 Z116.970`).

  Nově se po dojezdu jede rovně doleva, dokud v TOM ÚSEKU na hloubce vrstvy
  materiál sahá. Není to nový vjezd — nástroj na hloubce už je a stojí za
  hrbem, takže odpadá problém, na kterém 10. 8. 2026 třikrát selhalo
  „posunout vjezd dál do úseku" (10 kolizí / 1034 mm²). Dvě meze, obě
  vynucené měřením:
  - **jen ten jeden úsek** — bez omezení dojezd na X 25,5 dojel až na Z −9
    přes celý díl a bral práci jiným vrstvám i regionům (dojezdy narostly
    z 1–3 na 10–13 segmentů),
  - **na hloubce vrstvy**, ne na X, kde skončilo sledování kontury: to sjede
    po obrysu i pod hloubku průchodu (tady 37,5 proti vrstvě 40,5), kde by
    šlo o dvojnásobný záběr a kde držák o hrb drhne 0,5 mm (na 40,5 je čistý).

  Před přidáním se každá taková jízda prověří stopou držáku proti zbytku,
  s tím, že si destička po cestě řeže vlastní stopu. Na dílu uživatele úběr
  4359,8 → 4374,2 mm² (+14,4) beze změny kolizí; napříč 24 fixtures +0,01 %
  a mění se jediná (`part-10-zapich-casting`, +10 mm²).

### Fixed
- **CAM – zanoření už nesází držák do neobrobeného materiálu.** Hlídání držáku
  u kotev zanoření (`holderFitsAt`) se ptalo, jestli se držák vejde, když
  špička stojí na POVRCHU — jenže rampa hned nato sjede o celou vrstvu níž
  a materiál vedle se tím stane vyšším než nástroj. Na dílu uživatele
  (krček Z 165,9–196,3 pod přírubou) vycházelo na povrchu 0,5 mm² vnoření,
  na dně 117 mm². Kapsový roh (`buildPocketPass`) přitom neměl hlídání držáku
  ŽÁDNÉ. Nově se testuje HLOUBKA, na které špička skončí, a to:
  - proti ZBYTKU, ne proti syrovému obrysu (podlaha po Z, srážená rampami
    i sledováním kontury — bez toho zmizely všechny rampované zákroky na
    `part-11-zleva` a `part-13-zleva-flange`),
  - PODÉL celé rampy, ne jen v dosednutí (na `part-11-zleva` má rampa 57 mm
    diagonály a kolize začínala už na nájezdovém G0: v koncovém bodě 0 mm²,
    přesný model 131,67 mm²),
  - u ODLOŽENÝCH vjezdů (`__deferEntry`) až ZA smyčkou regionu, proti tomu,
    co po regionu zbude. Hlídat to při hledání kotvy nejde — tam je zapsaná
    jen hrstka průchodů a model zamítá vjezdy do prostoru, který v době
    provedení dávno nestojí (na `range-end-leadout` to stálo 21 % úběru).

  Na dílu uživatele: oranžová 162,74 → 0,28 mm², ⛔ proti nakreslenému obrysu
  20 → 0. Napříč 24 fixtures −0,25 % úběru a žádná nemá kolizi; `part-17`,
  `range-end-leadout`, `part-11` i `part-15` jsou nad původním úběrem.
  Zbývá doložená mez skenového modelu proti polygonovému (2× 2,32 mm² na
  plánovacím standardu) — táž třída, jaká je už v `EXPECTED_PLAN` přijatá
  pro `holder-region-roughing`.

### Changed
- **CAM – malý Přídavek polotovaru už nevyrobí průchod naprázdno.** Skim vrstva
  nad nakresleným vrcholem/čelem se přidává proto, že materiál může sahat až na
  offsetovou čáru. Při malém Přídavku pod ní ale zbyla tenoučká vrstva, která
  jela jako plný průchod skoro nic (Přídavek 0,05 mm při ap 3 → vrstva
  0,05 mm, změřeno na `part-1`: 20 průchodů / 243 řádků). Zbytek tenčí než
  **10 % Hloubky záběru** se teď neodděluje a sebere ho sousední průchod
  najednou — vědomé, ohraničené přetížení na nejvýš 1,1 × ap (hloubka záběru
  není tvrdý strop, ale cíl s tolerancí). Na tomtéž dílu 19 průchodů /
  236 řádků. Při běžném Přídavku (1 mm) se nemění NIC — poměr 0,2–0,5 je nad
  prahem, snapshoty obou regresních sad zůstaly bit po bitu shodné.
  Záměr hlídá nový `tests/cam-skim-layer`.
- **CAM – `buildStockLoop` přejmenován na `buildStockLoopRaw`, přibyl
  `stockPlanLoop`.** Starý název četl jako „obrys polotovaru", jenže pro
  PLÁNOVÁNÍ drah polotovar končí až na offsetové čáře — bylo tedy snadné sáhnout
  po syrovém obrysu omylem. `Raw` je teď v názvu jako varování a plánovací obrys
  má vlastní helper. Ten navíc nahradil dvojici `offsetStockLoop(buildStockLoop(…))`,
  která se psala ad hoc na čtyřech místech (čelní `planLoopFC`, validátor,
  tečkovaná čára v náhledu, `MaterialRemoval`) a pokaždé si znovu ošetřovala
  null. Čistý refaktor: snapshoty obou regresních sad zůstaly bit po bitu
  shodné.
- **CAM náhled – polotovar se vybarvuje JEDNÍM odstínem až po offsetovou
  čáru.** Pás mezi nakresleným odlitkem a offsetovou čarou se dosud kreslil
  zvlášť světlejším tónem přes clip „mimo syrový obrys“, takže díl vypadal jako
  dva různé materiály. Polotovar tam ale prostě končí (zadání uživatele
  20. 8. 2026: *„obrobek je celý i s tou offsetovou čarou“*), takže se vykreslí
  jedna výplň — zbytek OFFSETOVÉHO modelu. Drží to na vlastnosti, že offsetový
  zbytek obsahuje ten syrový (obě smyčky řeže tatáž dráha, jen začínají na
  jiném základu); nově to hlídá `tests/cam-removal-offset-band` ve třech bodech
  simulace (mimo offsetový zbytek zůstává < 0,05 mm² syrového). Modely zůstávají
  dva — `_removal` je pořád parita pro mazání VYBARVENÍ, mění se jen kreslení.

### Added
- **Invariant „generátor nevyrábí kolize“ hlídá i OFFSETOVOU ČÁRU.**
  `tests/cam-collision-free` dosud měřil jen proti nakreslenému odlitku.
  Nově pouští každý program ještě jednou proti plánovací hranici
  (`planStock: true`) — tedy proti tomu, co uživatel vidí v ⛔ panelu a co
  platí, když je odlitek nadměrný. Syrový standard zůstává beze změny
  (`shrink` 0,05, žádná fixture, žádná kolize); tenhle blok nic neoslabuje,
  jen přidává. Plánovací standard běží se `shrink` 0,25 mm, protože obě strany
  diskretizují hranici jinak (emise vede model zbytku po plánované geometrii
  průchodů, validátor po skutečně vygenerované dráze) — v hlavičce testu je
  naměřená tabulka, nad kterou zbývají jen skutečné vady. Ověřeno, že invariant
  má zuby: na stavu před opravou `stockTopTab` by `range-end-leadout` spadl
  (2 nálezy / 1,7 mm² i při zmenšení 0,25 mm).

### Fixed
- **CAM – hlídání držáku přehlédlo SVISLÉ ČELO ležící mezi vzorky tabulky.**
  `stockTopTab` (vyhledávací tabulka povrchu po 0,25 mm, ze které se rozhoduje,
  kde smí začít zanořovací rampa) brala nejbližší vzorek přes `Math.round`.
  U svislého čela to znamená, že se hodnota přichytí k té PRÁZDNÉ straně:
  na `part-15` leží plánovací čelo příruby na Z 195,28, ale vzorek 195,25
  hlásí povrch X(r) 17,74 — takže kotva rampy pustila vzdálený konec držáku
  (20 mm axiálně) do proužku Z 195,28–195,53, kde obrys sahá až na X(r) 65,0
  (10,3 mm² vnoření). Nově se bere vyšší z obou sousedních vzorků; „nahoru“
  nikdy nejde blíž k materiálu.
  Změřeno: kolize proti offsetové čáře 18 → 10 nálezů, 50,5 → 9,2 mm², a to
  BEZ ztráty úběru — naopak se celkem odebere o 6,0 mm² VÍC (`part-15` +10,4,
  `part-17` +12,1, `range-end-leadout` +10,5; jediný `holder-region-roughing`
  ztratil 22,9 mm² a jeden průchod, ⚠ panel to hlásí). `colRaw` zůstává 0.
  Čistých je teď 20 z 24 fixtures.
- **CAM – hlídání držáku čte plánovací obrys PŘÍMO, ne „povrch + Vůle X“.**
  `stairAt` v čelním hlídání držáku aproximovalo offsetovou čáru svislým
  posunem syrového povrchu o Vůli X. Před SVISLÝM ČELEM je to řádově vedle:
  offsetová čára tam leží o Vůli Z PŘED čelem v celé jeho výšce, takže
  svislice těsně před přírubou protne plánovací obrys až na jejím vnějším
  průměru. Změřeno na `part-16`: v pásu Z 175,93–195,93 sahá plánovací obrys
  do Ø130,6, ale „povrch + Vůle X“ tam vydalo Ø35,5 — vzdálený konec držáku
  (20 mm axiálně) tudy projel. Čte se teď `topXOnLoop(planLoopFC, …)`; syrový
  odhad zůstal jen jako fallback, když plánovací smyčka chybí.
  Změřeno: kolize proti offsetové čáře 23 → 18 nálezů, 91,9 → 50,5 mm²
  (`part-16` i `part-18` nově čisté). Cena: o 1 čelní průchod méně na obou
  dílech, dohromady 44,6 mm² neodebraného materiálu — ⚠ panel to hlásí
  („o 1 průchod víc vynecháno“).
- **CAM – axiální rychloposuv nejede pásem mezi polotovarem a offsetovou
  čarou.** Tělo průchodu se seká na rychloposuv(vzduch)/posuv(materiál) a ta
  pojistka se dosud ptala jen SYROVÉHO dynamického zbytku. Přídavek X/Z (polo.)
  je přitom v zadání proto, že odlitek MŮŽE být větší, takže `G0` pod offsetovou
  čarou je na nadměrném kuse náraz. Nově se ptá obou modelů a při nárazu jede
  posuvem (`; Přejezd materiálem posuvem`) — týž práh 0,5 mm² jako descendTo,
  exit-split i validátor. Změřeno: kolize proti offsetové čáře 40 → 23 nálezů,
  104,0 → 91,9 mm²; nově úplně čisté jsou `part-1`, `part-2`, `part-4`,
  `part-6`, `part-8`, `part-9` a `holder-casting-slanted-face`. Délka programu,
  počet průchodů ani odebraná plocha se nezměnily — mění se jen 32 pohybů
  z `G0` na `G1`; cena 29–84 mm posuvu navíc na díl.
  `tests/cam-leadout-air-rapid` takové pohyby nově vynechává: modeluje nástroj
  jen dosahem NOSU, kdežto emise se rozhoduje celou stopou destičky.
- **CAM – první ČELNÍ vrstva už nebere `ap + Vůle Z`.** Táž oprava jako
  u hloubkové posloupnosti podélného hrubování, jen v ose Z: march byl kotvený
  na hraně NAKRESLENÉHO polotovaru, takže první vrstva ukousla o Vůli Z víc,
  než je nastavená Hloubka záběru (změřeno: `part-16`, `part-18`, `part-19`
  při ap 3 → tříska 3,999). Nad mřížku se přidá skim vrstva; mřížka se
  neposouvá. Vedlejší, změřený efekt: rychloposuvy prvních čelních vrstev
  přestaly projíždět pásem mezi polotovarem a offsetovou čarou —
  `face-casting` (2 nálezy / 33,4 mm²) a `face-cylinder` (3 / 44,0 mm²) jsou
  proti offsetové čáře nově úplně čisté, `part-19` taky. Celkem přes všech
  24 fixtures 46 → 40 nálezů, 185,2 → 104,0 mm². Odebraná plocha ani kolize
  proti nakreslenému odlitku se nezměnily; cena +1 průchod (≈ +6 řádků) na
  čelní fixture.
- **CAM – první hrubovací průchod už nebere `ap + Vůle X`.** Posloupnost hloubek
  podélného hrubování byla kotvená na NAKRESLENÉM vrcholu polotovaru, jenže
  materiál může sahat až na offsetovou čáru (přídavek X/Z polotovaru je
  v zadání právě proto). První průchod proto ukousl o Vůli X víc, než je
  nastavená Hloubka záběru — změřeno na 17 fixtures přesně o Vůli X, tedy
  20–50 % přetížení podle `ap` (part-11: ap 5 → tříska 6,0 mm; pocket-wall:
  ap 2 → 3,0 mm). Nad stávající mřížku hloubek se teď přidá SKIM vrstva, takže
  žádný záběr nepřesáhne `ap`. Mřížka se záměrně NEPOSOUVÁ: posunutí celé
  posloupnosti o Vůli X (změřeno a zahozeno) je čistá ztráta — každá hloubka
  padne jinam vůči schodům a údolím, `part-8` kvůli tomu přišel o 5 průchodů
  a 337 mm² úběru a `part-17` dostal 2 tvrdé kolize proti nakreslenému
  odlitku. Cena přidané vrstvy: +1 průchod (≈ +7 řádků) na odlitkovou
  fixture; kolize, odebraná plocha, obrobitelná kontura ani mezní čáry se
  nezměnily na žádné z 24 fixtures.

### Added
- **CAM – vjezd DRŽÁKU za offsetovou čaru se vybarví ČERVENĚ.** Oranžové
  varování (`HolderGouge`) hlídalo jen vnoření do SYROVÉHO obrysu, takže držák
  stojící za offsetovou čarou se nevybarvil nijak (nález uživatele: „držák mám
  za offsetovou čarou a nic se nevybarvilo jako kolize“). Na nakresleném odlitku
  tam nic není, na nadměrném ale ano — a přídavek polotovaru je v zadání právě
  proto. `HolderGouge` proto s `{ band: true }` vede DRUHÝ, disjunktní záznam
  (`gougeBand`) pro pás mezi oběma čarami; simulátor ho kreslí červeně, tvrdé
  vnoření do materiálu zůstává oranžové. Pouhý DOTEK hranice se nepočítá
  (držák zmenšený o 0,05 mm + zahození sliverů pod 0,02 mm²) — bez toho hlásil
  každý přejezd na rapid-safe X 94 oblastí, z toho většinu s nulovou plochou.
  Na dílu uživatele: 18 oblastí, 26,3 mm².
- **CAM – náhled úběru vybarvuje i pás mezi polotovarem a offsetovou čarou.**
  Přídavek X/Z (polo.) je v zadání proto, že odlitek MŮŽE být větší — materiál
  až k té čáře reálně existovat může a dráhy se podle toho plánují
  (`planLoopRef`). Náhled ale kreslil jen tečkovanou čaru, takže rychloposuv,
  který za ni skočí, vypadal neškodně (nález uživatele: „odskok mi skočí za tu
  offsetovou čáru“). Pás se teď vybarvuje světlejším tečkovaným tónem
  a ubírá se stejně jako polotovar. `MaterialRemoval` k tomu má příznak
  `{ planningOutline: true }`; odpověď na „narazil jsem FYZICKY?“
  (`validateToolpath`) a úběr pro další část programu (`opParts`) zůstávají
  na SYROVÉM obrysu — stejně jako mazání vybarvení, aby náhled nemazal
  výplně nad nakresleným odlitkem.

### Added
- **CAM – nový parametr „Stop rychlop. před čarou“ (`rapidFeedGap`, výchozní
  1 mm).** Rychloposuv se zastaví tuhle vzdálenost PŘED offsetovou (tečkovanou)
  čarou a zbytek se dojede pracovním posuvem — pro VŠECHNY příjezdy. Dosud
  platilo `rapidStopX` = Vůle + R nad SYROVÝM povrchem, takže spodek nosu
  dosedl PŘESNĚ na offsetovou čaru a příjezd končil již v ní (nález uživatele
  20. 8. 2026: `N2160 G0 X46.344` na šikmé stěně, kde je čára v X ještě výš než
  povrch + Vůle, skončil 0,43 mm POD ní). Nově se měří přímo proti plánovací
  smyčce, takže to platí i na šikminách. 0 = dosavadní chování.
  Změřeno izolovaně (gap 0 vs 1) na 8 fixtures: **úběr shodný** (part-19
  a part-8 dokonce o 0,2 a 3,6 mm² víc), **kolize bez změny**, program stejně
  dlouhý nebo kratší (uživatelův díl 806 → 798 řádků).

### Fixed
- **CAM – držák vjížděl do levého čela: hlídání měřilo syrový povrch, ne
  offsetovou čaru.** Schodiště `stairAt` bralo u SYROVÝCH pásů (Z bez průchodu)
  povrch odlitku tak, jak je nakreslený — držák tedy „prošel“ těsně nad ním
  a přitom byl 1 mm v pásu. Na dojezdu prvního průchodu nového úseku
  (`N3530 G1 X18.043 Z175.932`) vycházel spodek držáku X16,85 proti povrchu
  16,743 — tedy 0,1 mm nad ním, ale offsetová čára je 17,74 (nález uživatele
  20. 8. 2026: „vjíždí mi to držákem do toho levého čela“). Syrový pás se nově
  měří na offsetové čáře (`povrch + Přídavek X`); HOTOVÉ dno průchodu zůstává
  svým `x` — to je skutečný povrch (táž dělba jako u `enforceLayerDepth`).
  **Cena, změřeno:** průchody se v těch místech zvednou, takže se ubere
  **o ~38 mm² míň** (uživatelův díl 7854,20 → 7892,84; part-16 7742,61 →
  7780,63; part-18 7542,04 → 7572,42). Držák v pásu: 15,03 → 12,45 mm²,
  z toho zmíněný dojezd (13,07 mm² v per-segment měření) zmizel úplně.
  Kolize validátoru 0, mění se jen čelní fixtures (part-16, part-18).
- **CAM – zdvih přejezdu padal na globální bezpečné X.** Lokální strop se
  počítal jen ze SYROVÉHO zbytku, ale `travelBlocked` už testuje i plánovací
  model — strop pod ním zůstal a přejezd padal na `capX` (nález uživatele:
  „N5680 G0 X30.523 — vyjíždí někde do bezpečné polohy v X, i když by to mělo
  brát normálně nad polotovarem“). Nově `travelTopXAtZ` = vyšší z obou stropů;
  přejezdy zase jdou těsně nad polotovarem (např. `G0 X30.989`), počet řádků
  beze změny.
- **CAM – `topXOnLoop` byl zkopírovaný dvakrát** (gcodeEmit + roughingStrategies);
  sloučeno do `camMath.js`, kde ho používá i čelní generátor.
- **CAM – čelní přejezd v Z se vedl POD offsetovou čarou.** Rozhodnutí, jestli
  rychloposuv smí jít přímo, se testovalo proti dynamickému zbytku SYROVÉ
  siluety — takže přejezd, který syrový odlitek minul, ale offsetovou čaru
  projížděl, se povolil (uživatel 20. 8. 2026: „udělej to, ať to vyjede nad tu
  offsetovou čaru“). Přídavek X/Z (polo.) je v zadání právě proto, že odlitek
  MŮŽE být až u té čáry. Emise proto vede DRUHÝ dynamický model nad
  plánovací (vůlí-posunutou) siluetou (`rapidStockPlan`, ubíraný týžě řezem)
  a čelní přejezd se testuje i proti němu. Změřeno na dílu uživatele:
  rychloposuvů v Z skrz pás **18 (22,2 mm²) → 0**, úběr beze změny, kolize 0.
  Záměrně JEN čelní přejezd: přepnutí celého `rapidHitsStock` (EXIT-SPLIT,
  výjezd posuvem, strop zdvihu) přepsalo všech 24 fixtures.
- **CAM – doběh na konci úseku dělal dvě vrstvy tam, kde plátek zvládne jednu.**
  Konec úseku potrebuje odříznout proužek na hraně materiálu a sjet po
  offsetové čáře. Nos (2R = 1,6 mm) na to musí dvakrát, ale UPICHOVÁK šířky
  5 mm obojí vezme najednou — nová šířka záběru `insCover` o tom rozhoduje
  (uživatel 20. 8. 2026: „udělej to jako ten levý konec, vezme to najednou když
  to jde“; ty dvě vrstvy byly od sebe 2,95 mm, tedy do jednoho ap).
  Zároveň se nájezd počítá z povrchu pod CELÝM záběrem, ne jen na
  programovaném Z — u čela příruby je tam za schodem povrch 16,7, ale plátek
  leží tělem nad velkým čelem s povrchem 64,4, takže nájezd dřív vyšel jen 1 mm
  nad koncem řezu (`G0 X47.376` → `G1 X46.376`) místo sjezdu z povrchu.
  Uživatelův díl: −9 řádků, zbytek −0,47 mm² (bere víc), kolize 0; part-19
  (natočená destička) si dvě vrstvy drží a má shodný úběr.
- **CAM – čelní hrubování UPICHOVÁKEM nedojíždělo konce úseků.** Doběh na konci
  úseku (`appendRegionRunOut`) se rozhoduje podle toho, jestli na dalším Z ještě
  průchod JE — a právě ty průchody zahazuje hlídání držáku, které běželo AZ ZA
  doběhem. U natočené destičky to vycházelo náhodou (`enforceLayerDepth` je
  polygon-only a ty průchody zahodilo dřív), u upichováku hloubka vrstev neběží
  vůbec, takže zůstaly tři nedojeté konce: čelo příruby (Z197,932), konec úseku
  (Z110,932) a levý konec (Z−6,068). Hlídání držáku se nově volá **dvakrát**
  a doběh běží mezi těmi voláními — druhé volání není kosmetika, průchod
  přidaný za držákem bez jeho kontroly jsou změřené 3 kolize. Doběh se zároveň
  povolil pro `toolShape: 'parting'` (`tanR` = `max(0, −toolAngle)`, tedy 0 —
  vrstva navíc leží ve stejné hloubce a bere tím, že dojede dál v Z).
  Úběr +29 mm² na dvou čelních fixtures, validator kolizií čistý.
- **CAM – obálka upichováku převzorkovávala rovné úsečky na tětivy.**
  `samplePartingEnvelope()` vzorkovala po 0,4 mm a zlomy předlohy na mřížku
  nepadly: rovné čelo Z138,785→139,523 (29,6 mm v X) vyšlo jako tři tětivy
  a poslední měla 4× větší sklon než čelo (`X9.943 Z139.807` místo Z139,523) —
  dráha z rovné offsetové čáry vyjela na stranu vzduchu (nález uživatele:
  „offsetová čára je rovná, ale dráha od ní utíká doprava"). Funkce nově bere
  `breakZ` — mřížku doplní o Z zlomů vystopovaného dojezdu, kolineární redukce
  zbytek slije zpátky do jedné úsečky. Vzorků nemůže ubýt, obálka se tedy
  nikde nesníží.
- **CAM – dojezd „bez schodků“ pokračoval po plášti, kde už schod nebyl.** Když
  po sloupnutí schodu kontura zahne do stěny rovnoběžné s osou (konstantní X,
  pohyb jen v Z), nůž tam už jen tře. Dojezd se v tom rohu utne — s přesahem
  0,4 mm, který je numerická rezerva pro dynamický model polotovaru: při ořezu
  přesně v rohu se stopy sousedních průchodů jen dotknou a v modelu zůstane
  jehla, na kterou `finDeepCut` zahodí celý dokončovací úsek po kuželu
  (19 mm² neobrobeného + falešné ⚠). Utíná se jen roh ZA sloupnutým schodem;
  dojezd, který je osový už od začátku, materiál odebírá (zahození všech =
  +75 mm² zbytku) a nechává se.
- **CAM – ořez dojezdu se tiše zahazoval, když se ořízl POSLEDNÍ úsek.**
  `trimLeadOut` poznával změnu porovnáním POČTU úseků. Když se ořízl poslední
  a žádný nevypadl, počet zůstal stejný — funkce ohlásila „beze změny" a ořez
  se zahodil, takže dojezd jel dál, než mez držáku dovoluje (`part-16`:
  Z149,932 místo Z147,382). Změna se teď hlídá vlastním příznakem.
- **CAM – dojezd „bez schodků" na vlastním kuželu destičky byl jalový.** Kde
  kontura stoupá přesně pod úhlem natočení destičky, žádný schod nevzniká —
  spodní hrana ten tvar udělala už samotným řezem — a dojezd tam jen třel po
  hotovém povrchu. Na dílu uživatele šlo o **39 ze 45** dojezdů. Zahodí se, jen
  když je dojezd CELÝ na tom kuželu; jakmile v něm je oblouk nebo úsek s jiným
  sklonem, schod tam zůstává a dojezd jede dál. Ověřeno modelem úběru v pěti
  oknech přes celý díl: zbylý materiál shodný na 0,01 mm² (program −39 řádků).
- **CAM – dojezd „bez schodků" se zahazoval celý, i když projede z větší části.**
  Ořez dojezdu proti mezi držáku (`trimLeadOut`) bral úseky jako celek: jakmile
  konec úseku pod mez spadl, zahodil se celý. Na strmém čele, kde jeden úsek
  vede přes 23 mm v X, tím dojezd skončil hned na začátku (X39,48), ačkoli
  držák brání až dole (mez X21,60) — a mezi tím zůstal schodek. Nově se úsečka
  v místě, kde mez protne, USEKNE (oblouk se dál řeší celý; ořez oblouku by
  změnil jeho střed i poloměr). Tři čelní fixtures tím získaly po jednom
  dojezdu navíc, validátor kolizí hlásí čistotu.
- **CAM – dojezd „bez schodků" sjížděl pod předchozí vrstvu.** Pravidlo „nikdy
  hlouběji než předchozí vrstva" platilo jen pro KONEC ŘEZU, ne pro dojezd —
  ten pak u natočené destičky sjel pod kužel spodní hrany (nález uživatele:
  dojezd na X21,62, kužel z předchozích vrstev na X22,32). Dojezd se nově
  ořezává i proti tomuto kuželu, stejným způsobem jako proti mezi držáku.

### Removed
- **Mezní čára ZAVALENÍ destičky (`cam/stockEntryGuides.js`) odstraněna.**
  Byla to dřívější, nedokončená podoba téhož problému („zadní hrana destičky
  se opře o polotovar"): podle vlastního komentáře se jen KRESLILA a hloubku
  čelních průchodů měla omezit „příště" — jediný konzument mezních čar
  (`guideStaysInStock`) filtruje na `kind === 'zanoreni'`, takže na dráhy
  neměla vliv žádný. Totéž teď řeší hlídání hloubky vrstev (syrový pás se měří
  proti offsetové čáře polotovaru po celé šířce kroku) a doběh úseku. Výstup
  G-kódu se odstraněním nemění, ubyly jen dvě přerušované čáry v náhledu.
- **CAM – čelní hrubování natočenou destičkou: nedojetý proužek na hraně
  materiálu.** Doběh úseku uměl přidat vrstvu jen na MŘÍŽKOVÉ Z (po `ap`), takže
  když materiál skončil mezi dvěma vrstvami, zůstal na jeho hraně proužek —
  u čela příruby 1,65 mm (poslední vrstva Z197,932, hrana polotovaru Z196,278).
  Vrstva na další mřížkové Z tam přidat nejde (destička by nad materiálem
  visela), a tak se poslední vrstva nově posadí **za hranu materiálu** — co
  nejdál, ale ne dál než `2 × rádius nosu` od předchozího průchodu, aby se
  stopy nosů překryly. Dál už proužek jen podjede a zůstane tam celý; a
  posadit nos středem rovnou na offsetovou čáru polotovaru nejde (změřeno:
  3 kolize destičky i rychloposuvu — držák by jel nad tím ještě neodříznutým
  proužkem). Hned ZA ním se ale přidá druhý průchod, jehož střed nosu po té
  **offsetové čáře polotovaru** sjede: offsetová čára je mez, kam až může sahat
  skutečný odlitek, takže na jmenovitém kuse neubere nic a na nadměrném ano.
- **CAM – čelní hrubování natočenou destičkou: zadní strana plátku pod offsetovou
  čárou polotovaru.** Hlídání „nikdy hlouběji než předchozí vrstva" bralo syrové
  (neobrobené) pásy jen v jejich mřížkovém Z a měřilo je proti holému povrchu
  odlitku. Obojí bylo málo: krok vrstev 3 mm **mine dosah břitu** (8,68 mm u
  destičky b10/−15°), takže zadní hrana plavala až 0,7 mm POD povrchem, a mez
  má být **offsetová čára polotovaru**, ne povrch — programovaný bod je střed
  nosu, tělo destičky leží o offset níž a reálný nůž má hned za ní držák.
  Syrové pásy se proto vzorkují po celé šířce kroku a proti offsetové čáře.
  Průchody sousedící se syrovým pásem se tím posunou o ~1,9 mm výš.
- **CAM – čelní hrubování natočenou destičkou: schodek na konci ÚSEKU.**
  Doběh kužele (viz níž) řešil jen konec celé marche. Stejný schodek ale zůstával
  na konci KAŽDÉHO úseku (za stěnou, u čela příruby): poslední průchod dosedne na
  kužel spodní hrany, další se zahodí jako „řez vzduchem", protože se nos už
  polotovaru nedotkne — jenže řeže hrana ZA nosem a ta by schodek ještě sebrala.
  Nově se na konec každého úseku přidá **právě jedna** vrstva, o `krok·tan φ`
  mělčeji než předchozí (pravidlo „nikdy hlouběji" tím platí z definice); druhá
  už ne. Průchod se nepřidá, když by destička nad materiálem VISELA — hrana
  dosáhne jen `délka břitu · tan φ` pod nos, takže výš už by se materiálu dotkla
  jako první druhá strana plátku a držák (změřeno na čele příruby: konec řezu
  45 mm nad povrchem = kolize držáku i rychloposuvu). Doběhový průchod se navíc
  do evidence materiálu zapisuje jako SYROVÝ povrch, ne jako rovné dno na svém
  konci — jinak z něj vznikla falešná stěna, která srazila začátek dalšího úseku.
- **CAM – čelní hrubování natočenou destičkou: schodek na konci kužele.**
  Spodní hrana natočené destičky se táhne `dz·tan(natočení)` za nosem, takže
  poslední vrstva za sebou nechá kužel pod úhlem natočení. Marchování ale
  končilo přesně na hraně polotovaru, takže kužel neměl kam „dojet" ven a na
  jeho konci zůstal schodek, který by ještě jedna vrstva vzala. Nově marche
  pokračuje o offsetovou čáru polotovaru dál (rádius nosu + přídavek +
  dokončovací přídavek) a vrstvy jedou po kuželu až ven. **Hloubka se nemění** –
  pravidlo „nikdy hlouběji než předchozí vrstva" platí dál a průchod, který by
  jel vzduchem, se pořád zahodí. V zóně doběhu se navíc povrch bere z nejbližší
  hrany polotovaru místo jmenovitého poloměru (jinak by nájezd i mez dotyku
  skákaly o desítky mm). Platí jen pro natočenou polygonovou destičku;
  kulatá/nenatočená dává bajtově shodný výstup.
- **VK – desetinná čárka a výrazy v číselných polích.** Formulářová pole
  (Start X1/Z1, PA, PR, R, VPOL, bod zlomu) parsovala hodnoty přes syrový
  `parseFloat()` místo sdíleného `safeEvalMath()` – zápis `12,5` se tiše
  ořízl na `12` (bez chyby, bez varování) a neplatný text mohl do syntaxe
  zapsat doslovné `XNaN`. Nově všechna pole projdou `safeEvalMath()` (čárka
  i jednoduché výrazy jako `10+5`) a neplatný text appka odmítne s hláškou
  místo tichého zápisu. Stejná oprava i pro poloměr nové tečné kružnice
  (`tangentDialogs.js`), který měl ruční a neúplný `.replace(',', '.')`.
- **VK – X/Z + PA/PR zadané zároveň na libovolném prvku.** X/Z teď vždy
  určuje POČÁTEK dané úsečky (přepíše navazující bod z řetězu), PA/PR pak
  její délku a úhel – dřív to platilo jen pro úplně první prvek kontury,
  u dalších se PA/PR tiše ignorovalo (náhled) nebo se naopak ignorovalo
  zadané X/Z (export do ISO G-kódu) – dvě různé, vzájemně nekonzistentní
  interpretace téhož zápisu. Sjednoceno do jedné sdílené funkce
  (`startAndEndFromXzPaPr`), kterou teď volají všechna 4 místa (náhled,
  dopočet směru pro tečné napojení, konverze na ISO, navazující bod řetězu
  po vložení prvku) + doprovodná oprava kontroly poloměru u oblouku v tomto
  režimu (dřív měřila tětivu od špatného bodu). Doplněna i regrese: dopočet
  tečného napojení (`planTangentTransitions`) uměl takový řádek omylem
  přepsat na dotykový bod, jako by X/Z bylo pořád konec úsečky – teď se
  kombo řádků nedotýká.
- **📐 Volná kontura / 🔢 Číselné zadání – úchyt pro přesun okna (⠿).**
  Lišta okna byla celá plná tlačítek/záložek, takže nebylo za co okno
  chytit a přetáhnout jinam (`makeDraggable()` klik na tlačítko ignoruje).
  Nový úchyt vedle ⤢, jen na desktopu (na mobilu je okno ukotvené dole).

### Added
- **Simulace obrábění jede reálnou rychlostí stroje (1× = skutečný čas).**
  Přehrávání se dřív posouvalo po BODECH dráhy pevným krokem, takže dlouhá
  úsečka (jeden bod) prosvištěla a hustě vzorkovaný oblouk (desítky bodů)
  se plazil — s reálným obráběním to nemělo nic společného. Nově se dráha
  ujíždí strojním časem: `G0` **Rychloposuvem** a řezné pohyby posuvem
  `F [mm/ot] × otáčky` v tom průměru, kde nástroj právě je
  (`n = Vc·1000/π⌀`, omezeno `LIMS`; `G97` bere `S` rovnou jako otáčky,
  `G94`/`G98` `F` rovnou v mm/min). Bere se **modální F/S přímo z G-kódu**
  (i z ručních úprav), ne jen z polí panelu — a stejný výpočet
  (`cam/feedRates.js`) pohání i odhad ⏱ nad plátnem, takže čas programu a
  doba přehrávání sedí. Rozsah násobičů rychlosti rozšířen na 0,1×–64×.
- **Živý údaj nad plátnem: ubíhající čas, otáčky a posuv** – během simulace
  se nad odhadem ⏱ ukazuje **ubíhající čas programu** (stopky m:ss podle
  strojního času, ne podle délky přehrávání) a k němu aktuální **otáčky
  [ot/min] a posuv [mm/min]** (v závorce mm/ot); u rychloposuvu
  „G0 rychloposuv … mm/min".
- **Parametry → Rychloposuv (G0)** [mm/min], předvolba **6000**. Do G-kódu
  se nezapisuje (`G0` rychlost neuvádí) — slouží pro odhad času programu a
  pro přehrávání simulace v reálném čase.
- **Ctrl+Enter v poli „Ruční zápis G-kódu" vykreslí zapsané na plátno** –
  stejná akce jako klik na 🔄. Obyčejný Enter zůstává normální nový
  řádek (program má typicky víc řádků, se samotným Enter = odeslat by se
  nedalo psát).
- **🗑 Smazat vedle 🔄 v poli „Ruční zápis G-kódu"** (číselné zadání) –
  plovoucí tlačítko v pravém horním rohu textarea, vedle tlačítka pro
  vykreslení. Vyprázdní pole i localStorage a zruší rozjetý řetěz
  navazování (`lastAppendedGcodeEnd`), aby další úsečka po smazání
  nezačala nesmyslným „pokračováním" odnikud.
- **Zaoblení/zkosení rohu jedním krokem, rovnou při zadávání navazující
  úsečky.** V číselném zadání se u úsečky (když existuje předchozí, se
  kterou by mohla navázat) objeví nepovinný řádek **Roh s předchozí**
  (přepínač ⌒/⌿ + hodnota) – vyplní se zároveň s cílovým bodem a jedno
  **OK** rovnou vytvoří úsečku A zaoblí/zkosí roh s tou předchozí (dřív to
  šlo jen na dva kroky: úsečka, pak zvlášť tlačítko v samostatném řádku,
  které pořád zůstává jako záložní cesta, když se pole nevyplní předem).
  Do **ručního zápisu G-kódu** se rovnou zapíše **skutečná G1+G2/G3
  dráha** – přesně to, co by appka napsala PO stisku „⌒ Sražení/zaoblení
  → dráha" v CNC Editoru, jen bez mezikroku s CHF=/RND= markerem. Řádek
  úsečky dojíždějící do rohu se přepíše na oříznutý bod a hned za něj
  přibude `G02`/`G03 … R` (zaoblení) nebo `G01` (zkosení) na druhý
  oříznutý bod – přesměr G2/G3 respektuje zrcadlení os (flipX/flipZ),
  stejné pravidlo jako `runCncExport()`. Použitá geometrie je ta SAMÁ,
  kterou appka právě napsala na plátno (`filletChamferAtCorner()` v
  `tools/filletChamferClick.js` teď vrací i `{arc}`/`{line}` výsledek
  zaoblení/zkosení, ne jen `true`/`false`) – žádný druhý, potenciálně
  odlišný výpočet nazvlášť pro text.
- **Ruční zápis G-kódu se plní i tím, co nakreslíš přes formulář.** Po
  **OK** se nově vytvořený objekt hned připíše do pole jako G-kód
  (`bridge.formatAbsCoord()` – nová sdílená funkce z `storage/fileIO.js`,
  stejná konvence os/jednotek jako pravý CNC panel). Navazující úsečky/
  oblouky nedostanou zbytečný `G00` na bod, kde nástroj podle předchozího
  zápisu už stojí; bod a kružnice, které nejsou pohyb, se zapíšou jako
  komentář (`; Bod X.. Z..`), takže je zápis čitelný a 🔄 je bez problému
  přeskočí. Editor je teď i vizuálně větší – popisek „Ruční zápis G-kódu:"
  zmizel, **🔄** sedí jako plovoucí tlačítko v pravém horním rohu přímo nad
  textarea.
- **Automatické vycentrování výkresu po každém prvku z číselného zadání**
  (`autoCenterView()`) – při řetězení „bod za bodem" jinak snadno vyjede
  mimo viditelnou plochu.
- **Zaoblení / zkosení rovnou z číselného zadání.** Když dvě úsečky za sebou
  navážou, přibude řádek **Roh s předchozí úsečkou** s **⌒** a **⌿** –
  spustí tutéž operaci jako nástroj Zaoblení/Zkosení na plátně (sdílená
  `filletChamferAtCorner()` v `tools/filletChamferClick.js`, zpřístupněná
  přes `bridge`), jen se na roh nemusí trefovat myší.
- **⤢ funguje pro obě záložky okna „Zadání objektu"** – na 📐 rámuje VK
  konturu, na 🔢 rozepsaný objekt (`bridge.fitNumPreviewView`), se záchranou
  na vycentrování celého výkresu.
- **Pole na zápis G-kódu bere „lidský" zápis.** Nový `js/gcodeNormalize.js`
  srovná ručně psaný kód do kanonického tvaru dřív, než ho dostane parser:
  malá písmena (`g1 x10`), mezery za adresou (`X 10`), desetinná čárka
  (`X10,5`), matematické výrazy (`X10+5`, `Z200/3`, `X(10+5)*2`),
  přiřazovací zápis (`X=10`, `X: 10`) i bloky bez mezer (`n10g1x20z-30`).
  Komentáře `;…` a `(…)` zůstávají; závorka se samými čísly se počítá jako
  výraz, ne jako poznámka. Po stisku **🔄** se srovnaný text zapíše zpátky
  do pole, takže je vidět, jak byl zápis pochopen.
- **Oblouk jde v číselném zadání zadat začátkem, koncem, R a smyslem** –
  tedy stejně jako `G02/G03 X.. Z.. R..` (přepínač *Start + konec* /
  *Střed + úhly*, výchozí je start+konec, protože navazuje na konec
  předchozího prvku). Konstrukce oblouku z „R formátu" se přesunula do
  sdílené `arcFromEndpointsRadius()` v `js/utils.js`, kterou teď používá
  i parser G-kódu (`parseGcodeToObjects`), aby obě cesty daly týž oblouk.
  Když je R kratší než půlka tětivy, formulář to napíše místo tichého
  zmizení náhledu.
- **Ruční zápis G-kódu v číselném zadání.** Pod formulářem přibylo prázdné pole
  na psaní G-kódu; **🔄** ho vykreslí na plátno
  (`bridge.renderCncCodeToCanvas`, stejně jako 🔄 v CNC panelu) a pravý
  panel si pak kód vygeneruje sám. Placeholder ukazuje formát, ve kterém
  panel vypisuje, aby se ručně psaný kód s ním rovnou potkal. Obsah přežije
  zavření okna (localStorage, stejně jako VK syntaxe na sousední záložce).
- **Číselné zadání: živý náhled na plátně.** Zadávaný objekt (bod, úsečka/
  konstr. čára, kružnice, oblouk) se čárkovaně kreslí přímo na výkres při
  psaní do formuláře – **OK** pak jen potvrdí to, co je vidět. Sdílenou
  geometrii pro náhled i skutečné vložení počítá jedna funkce
  (`readFormGeometry()`), aby se nerozjely dvě mírně odlišné cesty výpočtu
  (přesně tenhle vzorec je zdroj opravy níž). Nový `state.numPreview` +
  `bridge.renderNumPreview` (stejný vzor jako VK náhled).

### Added
- **Appka teď řekne, když je zadaná geometrie neproveditelná**, místo aby
  ji tiše zahodila nebo nakreslila jinak, než co bylo zadáno:
  - **VK – oblouk se zcela známými souřadnicemi cíle** (mimo dopočet
    solverem): když je R kratší než půlka vzdálenosti od předchozího bodu,
    appka prvek nevloží a napíše do informačního řádku, jaké R by stačilo
    (`⚠ Poloměr R5 je moc malý pro tuto vzdálenost bodů (40 mm) – potřeba
    aspoň R20.`). Dřív se takový prvek klidně vložil do syntaxe a náhled
    ho tiše nakreslil jako rovnou čáru (protože `vkArcInWorld` na
    nesestrojitelný oblouk vrací `null`) beze stopy po chybě.
  - **Ruční zápis G-kódu (🔄) i import souboru s G-kódem**: řádek `G02/G03`
    s R kratším než půlka vzdálenosti bodů se dřív tiše přeskočil a poloha
    se „teleportovala" na cíl bez viditelné čáry. Teď `parseGcodeToObjects`
    (`storage/fileIO.js`) takové řádky sbírá a vykreslení je oznámí
    tlačítko po tlačítku – toast s číslem řádku, důvodem a minimálním R
    (`Vykresleno 1 objektů – řádek 3 přeskočen: R5.000 je moc malý…`),
    detaily všech přeskočených řádků navíc v konzoli.

### Added
- **Hotovní offsetová čára i kolem kontury.** Mezní čáry hlídání geometrie
  destičky měly odjakživa DVĚ tečkované offsetové čáry (hrubovací =
  R + Přídavek X/Z + Přídavek na hotovo, a hotovní = jen rádius plátku),
  kolem samotné kontury se ale kreslila jen ta hrubovací. Nově se kreslí
  obě – nový `calc.finishRefPath` (`js/calculators/cam/toolOffset.js`,
  vytaženo z `calculatePipeline.js`, aby šel offset spočítat víckrát
  s různými přídavky). Je to čistě GEOMETRICKÁ reference „kam dojede střed
  plátku na hotovo“: kreslí se i s vypnutým **Dokončováním** (skutečná dráha
  `finishOffsetPath` bez něj vůbec nevzniká), do G-kódu nevstupuje a dá se
  na ni snapovat stejně jako na ostatní offsety. Když nejsou zadané žádné
  přídavky, čára se nekreslí – splynula by s hrubovacím offsetem.

### Added
- **Podélné hrubování se zanoří do kapsy za stěnou/bossem.** Větev byla od
  23. 7. 2026 vypnutá nepodmíněným `return` (nahradila původní
  `if (!prms.plungeRoughing) return`), takže průchody vznikaly jen pro
  otevřený vjezd zprava. Na díle, kde vjezd zprava neexistuje – typicky
  hrubování **zleva za přírubou u čela** – tím vypadly všechny hloubky pod ní
  (reálný nález na díle uživatele: příruba Ø170 na Z 0–38 zahodila celý
  zbytek dílu, 4 průchody místo desítek; sken přitom materiál v údolí
  NAŠEL, jen se s ním nic nedělo). Podmínkou zůstává zaškrtnuté
  **Zanořování**.
  - **Kapsu hlídá obálka DRŽÁKU** (`clamp.span`, `cam/toolEnvelope.js`) –
    okno, kam se držák mezi stěny vejde; do užší kapsy se nástroj nepustí.
    Ten ořez byl napsaný ve Fázi 3b, ale **nikdo ho nevolal** – při vypnutí
    větve osiřel. Bez něj zapnutí vyrobilo **11 kolizí držáku / 500–670 mm²**
    na dílech, kde bylo čisto (`range-chain-*`, `range-end-leadout`).
  - **Rampa nesmí v jednom průchodu sebrat víc než Hloubka (ap).** Kotva
    zvednutá až na kůru leží u kapsy za bossem klidně 2× ap nad dnem
    (naměřeno 9,8 mm při ap 5) – spustí se po téže přímce na ap nad dno.
  - **Přesun uvnitř kapsy jen s doloženým předchůdcem** (`chainTipIs`):
    `pocketReposition` emituje přejezd z aktuální polohy, ne nájezd zvenčí.
    Když se mezi kroky řetězu vklíní zanoření odjinud, kotva osiří a týž
    rychloposuv vede skrz materiál – krok se pak vydá jako normální vjezd.
  - **Kapsa se dobírá po Hloubce (ap) až na dno.** Dobírání „najednou" hledá
    tutéž kapsu na každé nové hloubce znovu — a hledalo ji až od DRUHÉHO
    intervalu. Kapsa, která je intervalem PRVNÍM (`firstOpen === false`, tedy
    přesně hrubování zleva za přírubou), se tak na nové hloubce nenašla, burst
    hned skončil a celý zbytek kapsy zůstal na jediném dokončovacím průchodu:
    ten ji projel **diagonálou přes celé údolí** (reálný nález na díle
    uživatele: `G1 X50.915 Z171.500` ze Ø171 dolů — 985 mm² kolize držáku
    a dalších 570 mm² na navazujících úsecích). Nově sjede rampovanými kroky
    ap po ap: na díle uživatele **6 → 12 průchodů a 1555 → 0 mm² kolizí**.
  - **Každý zanořovací krok si dojede svůj schod.** Kroky dobírání dostávaly
    `withLeadOut: false` — dojezd měla obstarat až závěrečná fáze. Ta ale jede
    JEDINOU trasou po nejhlubší stěně, takže konce jednotlivých kroků (druhá
    stěna kapsy, každý o ap jinde) zůstávaly nedojeté a mezi nimi stály schodky
    (reálný nález na díle uživatele: `N420 G1 Z262.425` a další konce bez
    dojezdu). Se zapnutým „Hrub. bez schodků" teď každý krok dojede po kontuře
    sám, stejně jako otevřený průchod — na díle uživatele **−321 mm²** stojícího
    materiálu, holder-casting-slanted-face −3,4; jinde beze změny.
  - Ořez obálkou držáku (`clamp.span`) platí i uvnitř dobírání — burst si
    intervaly na každé hloubce skenuje znovu, takže by jinak sjel ap po ap do
    kapsy, do které se držák mezi stěny už nevejde.
  - Měřeno izolovaně: **méně stojícího materiálu, nikde ne víc**
    (holder-casting-slanted-face −36,2 mm², holder-region-roughing −7,7;
    ostatní beze změny), žádná nová kolize držáku.

### Changed
- **Dokončování najíždí rampou ze strany, odkud řeže — ne svislým
  dosednutím.** Navazující řetězy (druhý a další, po přeskočeném
  nedosažitelném kusu) dosedaly na hotovou plochu kolmo v ose X a teprve
  pak se rozjely v Z; na dílu to nechá rysku v místě dotyku. Rampu pod
  úhlem zanoření měl dosud jen úplně první řetěz — teď ji dostávají
  všechny, a to ze strany, ODKUD se řeže (u hrubování zleva tedy od −Z,
  aby nástroj do materiálu vjel po směru řezu). Koridor rampy se prověří
  proti zbytkovému polotovaru i proti hotovní kontuře; kde volný není
  (kraj nedosažitelné oblasti, nevyhrubovaný klín, hotová plocha
  předchozího řetězu), zůstává svislý dojezd — bezpečnost má přednost
  před povrchem. Odjezd na konci dokončování jde nově vždy nejdřív ven
  v X a pak v Z, ne diagonálou přes díl (stejné pravidlo jako u konce
  hrubování).
- **Dokončování vjíždí do dílu rovným průměrem, ne rampou** (kde to jde).
  Zrcadlo rovného průměru na konci řetězu: začíná-li řetěz válcovým úsekem
  a před ním ještě stojí materiál, dráha se natáhne PROTI směru řezu na
  téže hloubce, dokud z materiálu nevyjede — nástroj pak do dílu vjede jeho
  hranou a rovným průměrem, jak se soustruží ručně. Jen u válcového úseku
  (přímka rovnoběžná se Z): u oblouku nebo čela by rovný pohyb v Z vyrobil
  cizí válcový pahýl, tam zůstává rampa. Strop záběru (jedna hloubka
  třísky) a hlídání hotovní kontury platí stejně jako u výjezdu.
- **Hrubování: rovný úsek po dosednutí rampy už nejede proti směru řezu.**
  `straightRunEndZ` vracel dno okna i tehdy, když rampa dosedla už ZA ním
  (na dílu uživatele dosedla na Z−8,473, zatímco dno okna je Z−8,000 =
  konec polotovaru). Z toho vznikl řez `G1 Z−8.473` a hned zpátky
  `G1 Z−8.000` — hrubuje se zprava doleva, takže Z smí jen klesat. Konec
  rovného úseku se proto nikdy nevrátí před jeho začátek; když už není kam
  pokračovat, úsek se zahodí úplně. Zásah je chirurgický: G-kód všech 18
  původních fixtures zůstal bajt po bajtu shodný (chování se mění jen tam,
  kde rampa dosedne za koncem polotovaru).
- **Dokončování respektuje mezní čáry hlídání destičky.** Mezní čára
  neomezuje jen CELÉ úseky: stín nedosažitelné strmé stěny zkrátí i
  sousední, jinak dosažitelný válec. Hrubování to zná (jede po obrobitelné
  kontuře), dokončování ale jelo po syrové kontuře až do rohu a poslední
  milimetry bralo naráz materiál, který tam hrubování nechalo stát —
  naměřeno 29 mm² na posledních 2,9 mm válce, **tříska až 14 mm
  dokončovacím nožem**, a odjezd z takového konce musel ven skrz materiál
  posuvem. Úsek, na který se kvůli mezní čáře nedá dojet celý, se teď
  neobrábí vůbec (pravidlo „celý, nebo vůbec" nově i pro úsečky, nejen pro
  oblouky) a v náhledu zůstává tečkovaně jako nedosažitelný. Týká se JEN
  dokončovací dráhy — hrubování se nemění. Jako druhá pojistka platí strop
  hloubky třísky: kde by dokončovací úsek bral víc než jednu hloubku
  třísky (ap), zkrátí se nebo vynechá a v ⚠ panelu se řekne proč. Měřeno
  přehráním emitovaných drah do modelu polotovaru: nejhlubší dokončovací
  tříska se na všech fixtures rovná zadanému přídavku (0,30 mm při
  přídavku 0,3; 1,00 při 1,0; na dílu uživatele 0,40 při 0,5).
- **Dokončování: „celý, nebo vůbec".** Oblouk, na který destička dosáhne
  jen zčásti, se dosud ořízl na dosažitelnou část a ta se obrobila.
  Geometricky to bezpečné je, technologicky ne: uprostřed rádiusu vznikne
  přechod mezi dokončenou a nedokončenou plochou = viditelný schod přesně
  tam, kde je díl vidět. Kus, který nejde udělat celý, se teď vynechá
  celý (v náhledu zůstává tečkovaně jako nedosažitelný). Navazující
  materiál se místo něj dobere **rovným průměrem** — přímým pohybem v ose
  Z na téže hloubce, dokud nástroj z materiálu nevyjede. I ten platí celý,
  nebo vůbec: kdyby se cestou zastavil o strop záběru (jedna hloubka
  třísky) nebo o limit rozsahu, zůstal by po něm pahýl uprostřed
  materiálu, takže se v takovém případě nedělá vůbec. Trasa se hlídá proti
  hotovní kontuře, aby přímý pohyb nezajel do dílu, který se za koncem
  řetězu zvedá. Měřeno: na 5 fixtures mizí 2 rozpůlené oblouky na každé,
  kolize drah zůstávají nulové.

### Added
- **Hlídání držáku i u ČELNÍHO hrubování.** Obálku držáku (`holderClampZEnd`)
  respektovalo dosud jen podélné hrubování — čelní průchod šel na hloubku
  danou konturou a vlevo od stoupající stěny (kužel, osazení, hrana odlitku)
  jel držák v materiálu. Nově se pro každý čelní průchod počítá nejmenší
  hloubka, při které SPODNÍ HRANA držáku (nový `holderBottomProfile`
  v `cam/toolEnvelope.js`) mine všechno, co na obrobené straně stojí:
  konturu i **dna sousedních, dřív hotových průchodů** (schodiště — clamp
  jen proti statické kontuře si schody sám vyrábí a kolize po zkrácení
  rostou). Do meze se počítá i **odskok** (posouvá okno držáku o Odskok Z)
  a **vynechané průchody** (tam stojí syrový odlitek). Průchod, který by
  tím ztratil smysl, se vynechá; dojezdy „bez schodků" se ořezávají tam,
  kde by držák narazil do stoupající kontury. Hlásí se do ⚠ panelu
  („N průchodů zkráceno, M vynecháno"). Platí jen se zapnutým **Hlídat
  geometrii (destička + držák)**; pás, který si vyčistí sama destička, se
  přeskakuje. Na dílu uživatele (⌀111 × 350 odlitek, upichovák v držáku
  20 × 200): **126 kolizních nálezů → 0**, cena je 22 % méně odebraného
  materiálu (materiál pod mezí se čelně zprava tímhle nožem obrobit nedá).
  Nová fixture `part-16-face-holder` + `tests/cam-face-holder.test.js`.

### Added
- **Mezní čára ZAVALENÍ destičky (`cam/stockEntryGuides.js`).** Hlídání
  geometrie destičky mělo dosud jediný zdroj — konturu („kam hrot nedosáhne").
  Při čelním hrubování ale nastane mez dřív: destička jede shora a opře se
  ZADNÍ hranou o polotovar. U natočení −15° leží zadní roh **2,38 mm POD
  hrotem** (a 8,9 mm k obrobené straně), takže hrot NENÍ nejnižší bod nástroje.
  Nová čára ukazuje mezní polohu zadní hrany: dotyk na OFFSETOVÉ ČÁŘE
  polotovaru → pod úhlem natočení až na konturu, v poloze, kde je destička
  právě celá zabraná. Čára se jen kreslí — konturu NEpřemosťuje (nese
  `kind: 'polotovar'` a přidává se až za `buildMachinableContour`), takže
  dráhy ani G-kód se jí nemění.

### Fixed
- **Za levým koncem kontury zůstávaly poslední vrstvy neobrobené.** Marche
  sice už jela až k nejnižšímu Z POLOTOVARU, ale v zóně `Z < konec offsetu` se
  každý průchod přeskočil („chuck-stub, nesmíme řezat do držáku"). Ten odhad je
  zbytečný — uživatel má nastavené **čelisti a rozsah Z**, které říkají, kam se
  smí. Nově se tam pokračuje **posledním průměrem kontury** (pahýl zůstane
  stejně silný jako díl; k ose se nejede, tím by se obrobek uřízl). Na dílu
  uživatele přibyly 2 chybějící vrstvy vlevo (Z −3 a −6), bez kolizí.
- **Pás bez průchodu se do hlídání hloubky vrstev zapisoval o rádius nosu výš,
  než je skutečný povrch** (`xTouchAt` je mez pro STŘED nosu, ne materiál).
  Požadavek se tím nafoukl a jakmile jedna vrstva vypadla, strhla celou sérii
  za sebou — proto chyběl celý pás Ø16,7 a vrstva u Z 140,9.
- **Natočená destička jela do větší hloubky než předchozí vrstva.** Spodní hrana
  klesá od špičky k obrobené straně pod úhlem natočení, takže hlubší řez ji
  zavezl do už hotové vrstvy. Hlídání to sice řešilo, jenže běželo **před**
  hlídáním držáku — cokoli držák potom zvedl (a zvedá po svém sklonu), už nikdo
  nekontroloval. Tak vznikaly sestupné série „škrábanců", kde každý další
  průchod jel o 0,26 mm HLOUB (nález uživatele: N1730 X20,219 → N1780 X19,955
  na Ø21,8). Pravidlo se teď vyhodnocuje jako poslední slovo nad hotovým
  seznamem průchodů (a ještě jednou před držákem, aby si schody počítal
  z konečných hloubek). Kroky vrstev sedí na `ap · tan(natočení)` — u ap 3 mm
  a −15° přesně 0,804 mm.
  - **Osa se nebere jako materiál:** když předchozí vrstva dojela až k X0, za
    destičkou nic nezbylo a další vrstva smí taky na X0 (jinak si pravidlo
    vyrábělo schodiště i na čistě obrobeném čele).
  - **Pás bez průchodu = stojící materiál**, ne vzduch — jde se po celé marche
    mřížce, ne jen po existujících průchodech.
  Na dílu uživatele: sedm „škrábanců" na Ø21,8 zmizelo, 0 kolizí, 0 mm² zajezdu
  těla destičky.
- **Čelní hrubování: Z0 nebyl konec obrobku.** March se zastavoval na
  nejnižším Z KONTURY, jenže konec dílce není konec MATERIÁLU — polotovar
  za čelem pokračuje (přídavek, upínací zbytek). U dílu končícího na Z0 nad
  polotovarem sahajícím na Z−8 tak zůstalo posledních 8 mm neobrobených.
  Nově se marchuje po nejnižší Z POLOTOVARU; co se v konkrétním Z ubere,
  rozhoduje dál blokáda offsetem, takže se v zóně za dílem do OSY nezajíždí
  (obrobek by se uřízl).
- **Hlídání geometrie destičky: chyběla mezní čára u čela.** Dvě příčiny:
  (1) na celou souvislou skupinu interferenčních segmentů se vydávala jediná
  čára, kotvená v jediném nejvyšším bodě — u dílu, kde jedna skupina sahá od
  Z73 až po čelo na Z0, tím celý levý konec zůstal bez hlídání. Kotvu teď
  hledá KAŽDÝ interferující segment sám. (2) Horní konec čáry se protahoval
  bez omezení, takže tečna u čela přeskočila 34 mm vzduchem na sousední
  oblouk a čára pak spadla do stínu cizí čáry — konec se nově neprotahuje za
  dosah břitu destičky (jen polygonální destička; DOLNÍ konec se neořezává,
  ten drží most obrobitelné kontury).
- **Profilový režim zahazoval mezní čáry končící na polotovaru.** U kontur
  s větvením (výběr vnější větve) se guides počítají z outer profilu a filtr
  tam — na rozdíl od hlavní větve — neuznával `downOnStock`/`downClipped`.
  Zmizelo tím hlídání všude, kde čára končí až na hraně materiálu.
- **Rychloposuv mezi průchody hlídal jen destičku, ne DRŽÁK — a jezdil jím
  materiálem.** Emise pouštěla přejezd, když stopa **destičky** minula zbytek
  polotovaru; držák (v ose Z tlustý na šířku a radiálně sahající stovky mm)
  se přitom neptal nikdo. Nástroj tak po zanoření zůstal stát hluboko v kapse,
  **přejel v Z napříč dílem** a teprve pak se zvedl — špička vzduchem, držák
  skrz stojící materiál. Validátor (`validateToolpath`) to hlásil jako ⛔
  „Rychloposuv materiálem" už od 16. 7. 2026, takže aplikace uměla kolizi
  **najít, ale generátor ji neuměl obejít**. `safeRapidTo` se teď ptá i na
  držák (`holderHitsRapid`, týž živý model zbytku a týž práh 0,5 mm² jako
  destička) a přejezd se poskládá správně: **zvednout → přejet → sjet**.
  Naměřeno na `holder-region-roughing` (destička 0,0 mm², držák 135,3 mm²
  na dvou po sobě jdoucích `G0`); přes všech 24 fixtures **2 → 0 kolizí** za
  cenu jediného řádku G-kódu navíc. Regresi zavedl `e538e66` (kotva zanoření
  se posunula za hranici úseku s předpokladem „materiál za ní je už
  obrobený" — což platí pro dráhu špičky, ne pro obálku držáku).
  Pozn.: nejde o dřív zamítnutou paralelní detekci nad `passCutPts` (ta se
  rozcházela se skutečně vydaným simPath a dávala false positives) — tady se
  testuje konkrétní právě emitovaný pohyb, tedy týž vstup, jaký vidí validátor.
- **Obrobitelná kontura obsahovala čáru, kterou žádná hrana destičky neumí.**
  Za koncem „náběhového stínu" (mezní čára oříznutá na hraně polotovaru) se
  profil uzavíral **spojnicí zpět na konturu**, označenou `fromInsert` — takže
  vypadala i chovala se jako mezní čára z geometrie destičky. Měla ale úhel,
  který na destičce vůbec není (jen „co padne", aby trefila konturu), a vedla
  **skrz polotovar**: aby po ní nástroj jel, musel by do materiálu vjet celým
  plátkem shora. Komentář nad tou větví přitom správně říkal, že mezi koncem
  stínu a pokračováním kontury je VZDUCH a má se navázat přes `chainBreak` —
  kód dělal opak. Na dílu uživatele zmizely 4 z 10 mostů; zbylých 6 leží
  přesně pod natočením destičky (−15°).
- **„Historicky nestabilní" testy byly ve skutečnosti TIMEOUT.** Vitest má
  výchozí limit 5 s na test; CAM testy pouští celý pipeline nad .camprog
  fixtures (jednotky až desítky sekund) a při plné sadě běží soubory
  paralelně — takže padaly podle vytížení stroje, izolovaně prošly. Část
  testů si limit obcházela třetím argumentem `it(..., 120000)`, nové na to
  zapomněly. `vitest.config.js` má teď `testTimeout`/`hookTimeout` 120 s;
  sada je od té doby **1285/1285 opakovaně**, včetně
  `boolean-roughing-wiring`, který se týdny považoval za nedeterministický.
- **Čelní hrubování NAKLONĚNOU destičkou obrábělo jen polovinu dílu.** Hlídání
  spodní hrany destičky (klesá od špičky pod úhlem natočení) extrapolovalo hranu
  DONEKONEČNA: stěna vzdálená 33 mm zvedla průchod o 8,8 mm, další ještě víc,
  a program skončil v půlce dílu — 76 průchodů zahozeno, levá polovina
  neobrobená (nález uživatele: destička b 10 mm, natočení −15°). Hrana existuje
  jen po **délku břitu** (`insertReachZ`); za ní přebírá hlídání držáku, které
  má vlastní, mnohem mírnější sklon. Na dílu uživatele **42 → 84 průchodů**
  (hrubování dojede z Z 198 až na Z 3), program 327 → 609 řádků, bez kolizí.
- **Průchod zvednutý hlídáním nad povrch polotovaru se hlásil jako „zkrácený",
  ale jel vzduchem.** Zvednutí nad mez dotyku je vynechání — teď se průchod
  zahodí a ⚠ panel to tak i pojmenuje („X zkráceno, Y vynecháno").
- **Vizuální úběr kreslil rádius i u nekulaté destičky.** Simulace odebírá
  materiál novým `toolFootprintVisual` — skutečným obrysem destičky
  (klín z vrcholového úhlu, natočení a délky b), takže čtvercová destička
  po sobě nechává čtvercovou stopu. Plánování a validace kolizí zůstávají
  na dosavadní aproximaci: skutečný obrys nakloněné destičky visí až
  3,2 mm POD programovaným bodem a rychloposuvy s tím zatím neumí počítat
  (změřeno: samotná výměna obrysu vyrobí 12 nových hlášení kolizí).
- **Čelní hrubování s velkým rádiusem nosu: chybějící úsek drah, řez do hotové
  kontury a rychloposuvy materiálem.** Programovaný bod je STŘED nosu, materiál
  pod ním leží o rádius níž — na čtyřech místech se ale porovnával rovnou
  s povrchem polotovaru. U R 0,8 mm to byla desetina milimetru, u R 8 mm celá
  série vad (nález uživatele, odlitek odsazený zhruba o rádius nosu):
  - konec řezu se zahazoval podle **jmenovitého** `sRad` (Ø polotovaru) místo
    lokálního povrchu odlitku — u odlitku většího než jmenovka vypadl celý
    úsek průchodů (30 mm neobrobené stěny) **a bez varování**;
  - `G1` „sjezd na povrch" mohl vést **hlouběji než cíl průchodu**: nos sjel
    o rádius pod povrch, tj. přes celý přídavek až na hotovou konturu, a pak
    couval ven. Nově se nikdy nesjíždí pod plánovanou hloubku;
  - nájezdová výška se brala z povrchu **v jediném Z**, ačkoli nos je kruh
    a sahá i ±R stranou — rychloposuv na ni projel kuželem polotovaru
    (7 kolizí) a když se to zjistilo až testem, vyjelo se pro jistotu nad
    celý polotovar (poskakování „Výjezd nad konturu"). Nově se hledá dotyk
    nosu v okně ±R do neobrobené strany;
  - hlídání držáku nevidělo pásy **bez** průchodu (vypadly už v generování),
    takže pod nimi počítalo se vzduchem místo syrového polotovaru — první
    průchod pod takovým pásem zavezl držák do 30mm stěny.
  Na dílu uživatele: **12 kolizí → 0**, 98 → 109 průchodů. Malé rádiusy beze
  změny řezné geometrie (mění se jen výšky nájezdů).
- **„Zanořování" v panelu vypadalo aktivně i u čelního hrubování**, kde rampa
  neexistuje (jede se radiálně na dané Z) — nastavený úhel se zdánlivě
  ignoroval. Přepínač je v čelním režimu zašedlý a popsaný „(jen podélně)".
- **Vrstva se nikdy neodebrala, protože chyběl sjezd na hloubku.** Průchod
  typu „kapsa po kontuře" najíždí po obrysu; leží-li kontura v místě vjezdu
  výš než plánovaná vrstva, nájezd skončí NAD ní. Tělo se pak emitovalo jako
  `G1 Z…` bez X, tedy modálně o ten rozdíl mělčeji — na jednom dílu přesně
  o celou Hloubku (ap). Materiál zůstal stát, model si ho přesto odečetl
  a odskok se počítal ze lživé polohy (vyjel 0,5 mm POD nástroj). Nově se na
  hloubku sjede, ale jen když se tam **vejde držák** (testuje se týmž obrysem
  jako ve validátoru); jinak průchod zůstane na hloubce nájezdu a ⚠ panel to
  ohlásí. Odebráno o 3–8 mm² víc na třech dílech, žádné nové kolize.
- **Model zbytkového polotovaru si „odebíral" materiál, který stál — oblouky
  se do něj psaly tětivou.** Podle tohohle modelu se rozhoduje, jestli smí
  jet rychloposuv. Oblouky trasovaných nájezdů a dojezdů se do něj
  registrovaly jen dvěma koncovými body, a tětiva leží u vypuklého tvaru
  hlouběji v materiálu než skutečná dráha — model tak spolkl pásek o výšce
  sagitty a myslel si, že je tam vzduch. Změřeno proti reálně projeté dráze:
  povrch v modelu ležel o **0,30–0,47 mm** níž, než po hrubování zůstal.
  Nově se oblouk vzorkuje po ~0,1 mm a trasované leady se do modelu zapisují
  až v místě emise (tedy po ořezu na hranu materiálu a po rozsekání na
  rychloposuv/posuv). Odchylka klesla na ≤ 0,035 mm. **Vygenerovaný G-kód se
  nezměnil na žádné ze 17 fixtures** — vada byla latentní, ale na dílu, kde
  by rychloposuv přes takový pásek vedl, znamenala `G0` materiálem.
  (V experimentální booleovské větvi se u jedné fixture změnil tvar přísunu:
  místo diagonálního posuvu jde svislý, protože model teď o materiálu ví —
  o 1,9 mm² méně odebráno, kolizní nálezy stejné.)
  Pojistka `tests/cam-residual-model.test.js`.
- **Dobírání kapsy lezlo do prohlubně, kam se držák nevejde.** Dočišťovací
  trasy kapes hlídá záměrně jen MĚKKÁ obálka držáku (podél stěn se drhnutí
  o přídavkovou slupku toleruje, jinak by dno široké kapsy bylo
  nedosažitelné) — jenže tím propadlo i DNO prohlubně, které leží
  v TVRDÉ obálce. Na dílu uživatele (vyduté údolí R24,5 hluboké 8 mm)
  hrubování na dno sjelo (X20,43 = kontura + přídavek, tedy „správně"),
  ale držák drhnul o přídavek na protilehlé stěně. Dokončování takovou
  prohlubeň přitom **přeskakuje** (`finishUnreachablePath` → přemostí ji
  rovným průměrem), takže se dobíralo dno, které stejně nikdo nedokončí.
  Nově se dobrání vynechá, když je dno v tvrdé obálce, a ⚠ panel to hlásí.
  Měřeno: kolizí **3 → 0** (78 → 0 mm²) za cenu 11 mm² neodebraného
  materiálu; na ostatních fixtures (part-10/11, holder-casting-slanted-face)
  se odebraný materiál nezměnil **vůbec** — ta dobrání byla redundantní.
- **Dráhy končily na konci PROFILU, ne na konci POLOTOVARU.** Kontura končí
  čelem, takže offsetová čára skončí v jeho rohu (na dílu uživatele Z−1,3),
  jenže polotovar pokračuje dál (odřezek ve sklíčidle) — a tam zůstal stát
  prstenec. Držel i dokončování: jeho doběh (`finRunOut`) couvne, když nad
  hotovní čarou stojí víc než jedna tříska. Průchod, který dojel na konec
  profilu a pod nímž ještě je materiál, teď pokračuje rovným průměrem až na
  vůlí-posunutou siluetu polotovaru (`stockRunEndZ`, táž funkce jako
  u doběhu mezikroků rampy). Na dílu uživatele: hrubování `Z−1.261 → Z−9.000`,
  a dokončování se hned samo protáhlo na `Z−8.299`.
- **Upichovák podélně: obálka plátku přepisovala dojezd sjezdem po kontuře.**
  Sjezdy/dojezdy se u upichováku přepočítávají na obálku `x(z)` (max offsetu
  pod rovnou částí dna plátku), aby tělo za aktivním rohem neřezalo do tvaru.
  Obálka se ale počítala ze **syrového** `offsetXAt`, kdežto původní trasa už
  prošla podlahou hloubky vrstvy, ořezem na sousední průchod i obálkou
  držáku — takže se z rovného dojezdu ve výšce vrstvy stal **sjezd po
  kontuře až na dno dílu** (na dílu uživatele z X49,5 na X7,9, tj. 41 mm pod
  svou vrstvu) a držák pak jel 20 mm v bossu. Hlídání držáku to přitom
  hlásilo jako čisté — testovalo tu původní, rovnou trasu, ne obálku.
  Obálka teď smí dráhu jen **zvednout** (původní X je závazné minimum),
  a podlaha se u **oblouku vyhodnocuje přesně** (průsečík kružnice se
  svislicí, jen úhlově platná větev) — „konzervativně vyšším koncem" by
  podlahu zvedla na maximum přes celé rozpětí oblouku, obálka nad ním by
  vyšla vodorovná a v G-kódu by z oblouku zbyla **úsečka**
  (`G1 X31.766 Z−1.261` místo `G3 … CR=11.344`); s narovnanými oblouky se
  navíc trhalo i dokončování (místo `G3 … CR=6.803` výjezd z materiálu
  a nový nájezd přes průměr).
  Na dílu uživatele (upichovák š. 3, podélně): kolizních nálezů **22 → 2**,
  plocha vnoření držáku **2589 → 77 mm²**. Nová fixture
  `part-17-long-parting` + `tests/cam-parting-envelope.test.js`.
- **Čelní hrubování: výška přejezdu se rozhodovala dvakrát** (a někdy
  nahoru–dolů–nahoru po téže svislici). Přejezd na další průchod se skládal
  ze dvou `safeRapidTo` — první zvedla nástroj na `xStart`, druhá ho hned
  poslala nad konturu, protože v `xStart` se v ose Z přejet nedalo. Nově se
  výška volí JEDNOU a stropem je **lokální** povrch zbytku mezi výchozím a
  cílovým Z, ne globální vršek kontury: u dílu s velkým osazením se nástroj
  zvedal přes celý polotovar, i když stačilo přejet nad Ø33. Na dílu
  uživatele výjezdů nad konturu 15 → 7 (a ty zbylé jsou nutné).
- **Čelní hrubování: falešná kolize držáku přes celý díl + výjezd nad
  polotovar před KAŽDÝM průchodem.** Model stopy nástroje (`toolFootprint`)
  prodlužoval tělo destičky jen radiálně (+X) — to kryje hřebínky mezi
  podélnými průchody (skládají se v X), ale u čelního hrubování se
  průchody skládají v Z s roztečí ap, takže mezi nimi v modelu zůstával
  stát hřebínek `ap − 2R` (u ap 3 a R 0,8 celých 1,4 mm), který ve
  skutečnosti odřízne tělo plátku. Důsledky: (1) držák těmi hřebínky
  „projížděl" → oranžová stopa vnoření přes celý obrobek, (2) model
  zbytku je bral jako materiál → přejezd na další průchod pokaždé vyjel
  až nad polotovar a hned zase sjel zpátky na stejném Z. Stopa se nově
  čelně protahuje i v ose Z k obrobené straně (zprava +Z, zleva −Z):
  u upichováku o šířku břitu (`Šířka − R`, tatáž geometrie, jakou už
  používá hlídání upichováku), u ostatních tvarů o hloubku záběru.
  Na dílu uživatele (⌀111 × 350 odlitek, 122 čelních průchodů): výjezdů
  nad polotovar 143 → 36, řádků programu 1065 → 972, plocha vnoření
  držáku 4007 → 1056 mm² (zbytek jsou skutečné kolize u stěn, viz níž).
  Podélné hrubování je beze změny.
- **Čelní hrubování: první průchod zapíchl do polotovaru na bezpečném Z.**
  Před přejezdem v Z se najíždělo v ose X na „rapid-safe" průměr na
  AKTUÁLNÍM Z. Když nástroj přijel z bezpečné polohy nad polotovarem
  (a bezpečné Z leží nad dílem, např. u sklíčidla), nebyl to výjezd, ale
  SJEZD — a ten skončil pracovním posuvem v odlitku (na dílu uživatele
  138 mm² hned v 1. průchodu). Výjezd v X se teď dělá jen tehdy, když
  nástroj skutečně zvedá; jinak se přejede v Z ve vyšší poloze.
- **Čelní dojezdy „bez schodků" chyběly v modelu zbytku polotovaru**
  (`noteCutPass` je u čelních průchodů nezapočítával, na rozdíl od
  podélných) — model držel materiál, který je dávno pryč, a další
  průchod kvůli němu zbytečně vyjížděl nad polotovar.
- **Simulace s upichovacím plátkem padala při každém překreslení**
  (`ReferenceError: PARTING_BODY_MIN_H_MM is not defined`) — plátno CAM
  simulátoru zůstalo prázdné/zamrzlé. Konstanta se při dekompozici
  `camSimulator.js` přesunula do `cam/insertPreview.js`, ale zůstala tam
  neexportovaná, zatímco `camSimulator.js` ji dál používá (vykreslení
  nástroje během simulace i profil pro „📐 Kreslit na CAD plátně").
  Nyní je exportovaná a importovaná.
- **Nájezd dokončování už neprojede klínem po zanoření hrubování.**
  Koridor rampy se prověřoval se stropem záběru „jedna hloubka třísky"
  (ap = 5 mm), což je strop pro rovný průměr, ne pro jemné dosednutí do
  plochy. Rampa tak legálně projela klínem, který po sobě nechala rampa
  zanoření hrubování (na dílu uživatele přes 1,2 mm třísky po celé délce
  nájezdu, `N2460 G1 X9.543 Z149.544`). Nájezd teď smí ukrojit jen
  přídavkovou slupku, kterou dokončování stejně sundává; kde by bral víc,
  se vrací ke svislému dojezdu.
- **Osiřelý nulový úsek dokončování (nájezd + odjezd kvůli ničemu).**
  Ořez dvou kolineárních segmentů (kontura z CADu mívá na přímce navíc
  bod) vyrábí úsek s p1 ≡ p2. Neobrábí nic, ale projde všemi filtry — a
  když jeho skutečné sousedy vyřadilo hlídání držáku, zůstal v programu
  sám: nástroj kvůli němu sjel rampou do materiálu, neudělal nic a vyjel
  ven skrz materiál posuvem. Nulové úseky se teď z dokončovací dráhy
  zahazují (`chainBreak` se dědí jen tehdy, když ho úsek skutečně měl).
- **„Dokončovací operace" už z programu nemizí.** Zaškrtnuté dokončování
  se při zapnutém „Hlídat geometrii (destička + držák)" nevygenerovalo
  vůbec: obálka držáku se pro něj počítala ze siluety HRUBOVACÍHO offsetu
  (kontura + R + přídavek), což je dráha STŘEDU špičky, ne materiál.
  Dokončovací dráha ale z definice leží UVNITŘ té siluety (o celý
  přídavek) a protože obrys držáku obsahuje počátek (špičku), vycházel
  jako kolize KAŽDÝ úsek — na dílu uživatele 18 z 18, ve fixtures
  part-2/4/6/8/9 po 13. Dokončování teď hlídá vlastní obálka
  (`makeFinishTipGuard` v `cam/toolEnvelope.js`), jejíž překážkou je
  SKUTEČNÝ materiál v době dokončování: silueta finální kontury ∩
  polotovar. Špička na dokončovací dráze je od ní vzdálená přesně o
  rádius destičky, takže projde vše, kde se držák reálně nevejde (čelo
  u osy, klín za bossem) — a jen to. Hrubování se nemění (G-kód všech 18
  fixtures bajt po bajtu shodný).
- **Dokončování nevjede do NEVYHRUBOVANÉHO zbytku polotovaru.** Kontrola
  proti finální kontuře nezná pořadí obrábění — co po hrubování zůstalo
  stát (klín za bossem, kam se destička nedostane), ví až dynamický model
  zbytku (`rapidStock`). Úseky, kde by v něm jel držák, se zahodí ještě
  před emisí a v ⚠ panelu se řekne proč (nová hlášení z emise, `S.genNotes`
  — `calculate()` přepisuje `S.errors` od nuly, takže je `fullUpdate()`
  po přepočtu připojí zpět). Testuje se JEN materiál nad hotovým tvarem
  (zbytek − kontura rozšířená o přídavek), aby se nepřidávaly falešné
  poplachy inherentní kolize modelu držáku u čela k ose. Změřeno
  validátorem drah: face-casting 4 → 0 a face-cylinder 8 → 0 nálezů
  v dokončovacím bloku; nová pojistka `tests/cam-finish-holder.test.js`
  (fixture `part-14-finish-holder`).
- **Tečkovaná hranice kolem polotovaru se kreslí z TÉŽE smyčky, se kterou
  plánují dráhy** (`offsetStockLoop` nad `buildStockLoop` — týž helper, co
  stojí za `planLoopRef` v `gcodeEmit.js`). Náhled si dřív offset dopočítával
  ZVLÁŠŤ: obrys navzorkoval a každý bod posunul po jeho vlastní normále, což
  není offset polygonu — v rozích normála půlí úhel (chybí prodloužení hrany)
  a v prvním/posledním vzorku se počítala jen z poloviny intervalu. Na konci
  polotovaru se tak čára přitahovala k obrysu: naměřeno na úseku S26→S27
  odstup **0,747 → 0,152 mm** místo konstantní 1,000 mm (plánovací smyčka má
  správně 1,000 mm po celé délce). Reálný nález uživatele („offsetová čára se
  na konci zužuje"). Jen náhled, dráhy se nemění.
- **Zanoření se už nedělá dvakrát.** Ořízlá rampa dojezdu strmé stěny
  (`pendingRampCompletions`) a kapsa za bossem sjíždějí po TÉŽE přímce
  zanoření — roh stěny je pro obě týž bod. Kapsa ho ale bere UVNITŘ hloubkové
  smyčky (na hlubší vrstvě), zatímco dokončení rampy až po ní, takže se stejný
  klín vyřízl dvakrát: „Průchod 9/10" byl doslovná kopie „Průchodu 4/5"
  a začínal znovu od vršku zanoření místo aby pokračoval tam, kde zanoření
  skončilo. Nově se evidují X-ÚSEKY, které už po které přímce zanoření někdo
  sjel (`plungeLineRuns` v `cam/roughingStrategies.js`), a dokončení rampy je
  přeskočí. Úseky, ne jen „nejhlubší dosah": po jedné nekonečné přímce mohou
  ležet dva nesouvislé útvary. Změřeno: zbývající materiál se nezvětšil
  (part-11 9849,0 → 9846,3 mm²), kolize držáku beze změny.
- **Hrubování jde po vrstvách dolů, „dodělávky" nejsou až na konci.** Dobírací
  řetěz ořízlé rampy se ROZHODUJE až po celé hloubkové smyčce regionu (dřív
  není jisté, že klín nevezme některá hlubší vrstva sama), ale vydával se taky
  až tam — mělký dobírák (Ø44,5) skočil až za nejhlubší vrstvy (Ø19,5). Nově
  se blok vloží hned za poslední průchod, který je stejně hluboký nebo mělčí.
  Řetěz se nikdy nerozřízne: kdyby vložení padlo před průchod, který počítá
  s polohou nástroje z předchozího (`pocketReposition`/`noRetract`/
  `cleanApproach`), zůstane dobírák na konci regionu.
- **Chybějící poslední vrstva u nedosažitelné hranice.** Hloubková posloupnost
  jde po celé Hloubce (ap), takže poslední krok přestřelí hranici, za kterou
  geometrie nepustí (u čela se mezní čára „dojezd" s hloubkou vzdaluje od zdi,
  až okno vyjde nulové). Ta hloubka pak nevydala NIC a zůstal stát celý schod
  ap. Nově bisekce najde nejhlubší X s použitelným vjezdem a vrstvu tam
  dokončí. Jen u nezakrytého vjezdu zprava — na umělé hranici (rozsah 📐 /
  hranice úseku) patří rampa a obyčejná vrstva by se zapíchla svisle.
- **Rampa zanoření drží nastavený úhel, když je to bezpečné.** Zplošťovala se
  vždy, když by přímka pod plným úhlem podjela offsetovou (hrubovací) čáru
  o víc než 0,05 mm. Jenže offset = hotovní kontura + PŘÍDAVEK, takže mělké
  zajetí do přídavku dílu neublíží. Práh je teď POLOVINA přídavku (na hotovní
  konturu se tím nedá dojet, s nulovým přídavkem vyjde jako dřív). Leží-li
  stěna údolí sama těsně pod úhlem zanoření (14,6° proti nastaveným 15°),
  jede rampa konečně opravdu 15° — reálný požadavek uživatele („mělo by to
  jet Z37.951").
- **Přisunutí uvnitř kapsy nesmí projet hotovní konturou.** Dokončení kapsy
  navazuje odskokem + přejezdem v Z místo výjezdu nad boss — ale přejezd jde
  v úrovni odskoku, takže v údolí s vyšší protistěnou (kontura Ø27 na Z 55–68
  proti přejezdu na Ø26,5) vedl rychloposuv HOTOVNÍ KONTUROU. Nově se ta
  úroveň prověří (`approachTraverseFree`) a když by kolidovala, najede
  dokončení klasicky výjezdem nad konturu.
- **Popisek „Rampa …°" říká skutečný sklon dráhy**, ne nastavený úhel
  zanoření. U zploštěné rampy výstup tvrdil „Rampa 15,0°" u dráhy, která jela
  13,6°. Dráhy se nezměnily, jen popisek.
- **⚠ panel hlásí úseky, které obálka držáku zahodila celé.** Počítání po
  HLOUBKÁCH tuhle ztrátu neuvidělo: stačilo, aby táž hloubka vydala průchod
  někde jinde, a zóna zmizela bez jediného slova — tak se potichu vypařila
  celá pravá strana dílu (102 mm). Nově se zahozené Z-zóny porovnají se
  skutečně vydanými průchody (včetně sledování obrysu, které většinu z nich
  dobere) a co zůstane, se ohlásí i s délkou nejdelšího úseku.
- **Simulace už nezačíná uvnitř materiálu.** Startovní poloha dráhy se
  v `parseManualGCodeToPath` (`cam/gcodeParser.js`) počítala jako
  `safeX / 2` **bezpodmínečně** — jenže `safeX` se do G-kódu zapisuje doslova
  (`G0 X150`) a na poloměr se přepočítává jen v režimu **DIAMON**. V režimu
  **Poloměr** tak simulace startovala na polovičním rádiusu (R75 místo R150),
  u velkého polotovaru rovnou uvnitř odlitku — a hned první přejezd do
  bezpečné polohy „prořízl" materiál (reálný nález na díle uživatele:
  oranžové zajetí u levého čela, **53 mm²**, ačkoli program začíná `G0 X150`
  nad polotovarem Ø219,8). Nově stejná konvence jako `setPos(...)` na začátku
  `generateAutoGCode`. G-kód se nemění, jen jeho simulace.
- **Rychloposuv „vzduchem" se přepne na posuv, když naráží do materiálu.**
  Dělení řezu na rapid(vzduch)/posuv(materiál) (`airSplitAxial`) rozhoduje
  podle PŮVODNÍ siluety odlitku a prahu „dosah nosu" (`x − tipR`) – jenže
  silueta nezná materiál, který v tom místě nechal stát dřívější průchod,
  a práh nepočítá s tělem destičky za nosem. Takový `G0` se teď testuje
  proti AKTUÁLNÍMU zbytku (`rapidHitsStock`, týž práh 0,5 mm² jako jinde)
  a při nárazu jede posuvem – stejná politika „safe-but-slow" jako
  u `descendTo` a výjezdu skrz kůru. Práh siluety se **nemění** (dosah nosu
  je zvolený vědomě kvůli materiálu grazovanému nosem).
  - Opravilo to i nálezy, které tam byly **dávno před zanořováním do kapes**:
    part-1 a part-2 0,8 → **0 mm²**, part-4/6/9 5,7 → **4,4**, part-8
    51,4 → **50,1**. Po sadě 17 dílů nezůstal jediný `rapid` nález mimo
    inherentní čelní hrubování.
  - Řezná geometrie beze změny (zbytkový materiál identický) – mění se jen
    JAK se přes to místo přejede. Nový typ řádku:
    `; Přejezd materiálem posuvem`.

### Changed
- **Obsah panelu ⚠ je nově pod regresní pojistkou — a kontrola „bez chyb
  výpočtu" už není prázdná.** Čtyři CAM testy četly hlášení jako
  `calc.foundErrors`, jenže ta vlastnost NEEXISTUJE (výpočet je ukládá do
  `S.errors`), takže kontrola hard errors roky procházela na prázdném poli.
  Headless runner teď hlášení vydává jako `errors`/`errorsSim` a regresní
  snapshot obsahuje i seznam varování. Přesně tahle díra umožnila, aby se
  counter vynechaných kapes týdny plnil, aniž by ho kdokoli hlásil. Ověřeno
  negativním testem: zmizelé hlášení shodí 14 fixtures.
- **Konec tichého zahazování hloubek obálkou držáku.** Když se držák někam
  nevešel, mohla zmizet celá zóna bez jediného slova v panelu ⚠ — na
  `part-13-zleva-flange` takhle vypadlo 17 průchodů celé pravé strany (držák
  20 mm radiálně by musel přes přírubu Ø199,7) a vypadalo to jako chyba
  geometrie. Jeden z counterů se dokonce plnil, ale nikdo ho nehlásil. Nově se
  hlásí **hloubky, na kterých nakonec nevznikl žádný průchod**. Počítat pokusy
  nešlo: dávalo to „17 vynechaných průchodů" tam, kde reálně chyběly 4 (tentýž
  interval bývá obsloužen jinou větví). Dráhy ani G-kód se nemění.
- **Průchod „dokončení kapsy" se v G-kódu jmenuje „kapsa bez schodků".**
  Nebylo to chování, ale popisek: průchod visí na „Hrub. bez schodků", ne na
  Dokončování, a to správně — jeho vypnutí nechá stát 64 mm², protože dobírá
  hřebínky ~0,5 mm po rampách krokovaných po ap. Je to hrubovací dobrání
  schodku, jen se jmenovalo jako dokončování.
- **Polotovar pro PLÁNOVÁNÍ drah = offsetová („tečkovaná") čára, syrový obrys
  se ignoruje.** Dosud existovaly tři paralelní modely „kde je materiál" a
  záplata dopadla vždy jen na jeden z nich: o vzduchu se rozhodovalo proti
  SYROVÉ kůře odlitku, ale vyjíždělo se na OFFSETOVOU čáru. Přídavek X/Z
  (polotovar) je přitom v zadání právě proto, že odlitek MŮŽE být větší —
  materiál až k té čáře tedy reálně existovat může a plánovat se musí
  pesimisticky. Nově je plánovací obrys jeden (`planLoopRef` v `cam/gcodeEmit.js`,
  sdílený `offsetStockLoop` v `cam/materialRemoval.js`); syrový obrys zůstává
  jen pro otázky „narazil jsem FYZICKY?" (validátor kolizí) a „co je vidět"
  (vizuální úběr). Rampa vjezdu od polotovaru (`stockEntryRamp`) navíc přestala
  ručně přičítat vůli na konci nalezené přímky — na diagonále to není totéž co
  posun KOLMO k hranici — a dosedá půlením přesně na čáru.
  Měřeno izolovaně per fixture: **part-11/12-zleva `rapid` kolize 101,3 → 91,6 mm²**,
  pocket-wall −4 řádky G-kódu, holder-region +0,85 mm² (0,02 %) z přesnější
  kotvy rampy, ostatních 15 fixtures beze změny. G-kód se hnul na 14 fixtures
  jednotným vzorem „posuv jde dál, rychloposuv vzduchem se krátí"; snapshoty
  obou regresních sad vědomě přegenerovány.
- **Přídavek X i Z (polo.) = 0 → offsetová čára se vůbec nehledá.** Hranicí je
  pak přímo polotovar tak, jak je nakreslený. Dřív se i při nulovém zadání
  posunul obrys o 0,05 mm (spodní mez pro zastavení rychloposuvu) a Clipper ho
  navíc přetesseloval. Prázdné pole nulou NENÍ — dědí se „Vůle nad polotovarem".
- **Detekce údolí (hranic úseků) je jedna funkce místo dvou.** Ruční
  (`manualRegionSplits`, chůze po vrcholech obrysu) a booleovská
  (`computeResidualRegions`, vzorkování horní hrany siluety) cesta počítaly
  totéž dvakrát — a měly identickou chybu, takže záplata by dopadla jen na
  jednu kopii. Zůstala vzorkovaná verze, protože přesněji určuje ÚSTÍ údolí:
  vrcholová heuristika za ústí brala sousední vrchol obrysu, což je na dlouhé
  šikmé stěně až její druhý konec. Naměřeno, jak moc na tom záleží: na
  part-11/12 si obě cesty našly totéž údolí, ale rozhodnutí „dělí to úsek?"
  vyšlo opačně — **23 vs 31 průchodů**. Po sloučení se počty průchodů ani řádků
  nikde nezměnily (materiál ±0,5 mm²).
- **Obrys nástroje: plný odebírá, zúžený testuje dotyk.** Zúžení o 0,05 mm se
  počítalo zvlášť v emisi a zvlášť ve validátoru, což vypadalo jako dva různé
  modely nástroje; nově je to jedna `toolFootprintSlim(prms, shrink)`
  s explicitním parametrem „bezpečnostní zúžení". Bez dopadu na výstup.
- **Mezní čára hlídání geometrie dojede až na hranu MATERIÁLU, ne na konec
  dílce.** Volný konec čáry hledá paprsek podél hrany destičky; když minul
  konturu a dopadl až na obrys polotovaru, ořezával se zpátky na konec
  kontury (`minPartZG`) – čára pak viditelně nedojela k obrysu polotovaru
  (reálný nález na díle uživatele, hrubování zleva: stín kužele Ø199,7
  skončil na čele dílce Z449,81, ačkoli polotovar sahá na Z482 – **chybělo
  32 mm**). Polotovar za koncem dílce je pořád materiál (přídavek na čelo),
  kam nástroj nedosáhne, takže tam čára patří. Dopad ZA konturou navíc
  vždycky leží na polotovaru (kontura tam z definice není), takže ten ořez
  nedělal nic jiného, než že tuhle informaci zahazoval. Dopad na **osu**
  (X≈0) se dál zahazuje beze změny – to řezná plocha není.
  - **Dráhy ani G-kód se nemění** – ověřeno na všech 17 regresních dílech
    (snapshoty obou sad se hnuly jen v souřadnicích čar, žádný řádek
    G-kódu). Čáry kotvené uprostřed kontury jsou jen vizualizace; u part-11/
    12-zleva se prodloužil i mostový úsek obrobitelné kontury (`{ins}`),
    ale leží v přídavku za dílcem, takže na něj žádný průchod nesahá.
  - Pojistka `tests/cam-guide-to-stock-end.test.js` (na starém kódu padá).
- **Mezní čára „Hlídat geometrii (destička + držák)" je zase ROVNÁ ÚSEČKA.**
  Čára se od dotykového bodu táhne výhradně podél hrany destičky – žádné
  oblouky, žádné zlomy. Dřív se mohla lámat podél *dosažitelné hranice
  držáku* (`buildHolderBoundaryPts`, `via` vrcholy) a protože ta hranice
  kopíruje zakřivenou konturu, „mezní čára" na plátně vycházela jako
  křivka s několika vrcholy podél oblouku dílu.
  `computeInterferenceGuides` (`js/calculators/cam/interferenceGuides.js`)
  proto zakázanou oblast špičky F vůbec nepočítá, jede jediným přímým
  paprskem podél hrany a před zápisem oba konce promítne na tuhle přímku,
  takže ani numerika nemůže vyrobit lom. Invariant hlídají testy
  (`cam-gcode-regression`, `cam-boolean-gcode-regression`, `cam-holder`).
  **Důsledek:** do kapsy širší než držák se hrubování mezní čárou nepustí
  (kapsa se přemostí „V" stejně jako s vypnutým držákem) – obrobitelná
  kontura teď na `holderWidth` vůbec nezávisí. Kolizní ochrana držáku tím
  nezmizela, dál ji dělá obálka držáku v `roughingStrategies.js`
  (`holderLoopL`) a `validateToolpath` (`collisionValidator.js`).

### Fixed
- CAM (podélné hrubování): **se zapnutým „Zanořováním" se hrubuje i pod dnem
  vybrání — bez ručního Rozsahu Z.** Hranice úseku se dosud v „kůře dna" údolí
  rozpouštěla a hloubky pod povrchem dna přebíral úsek NAD hranicí; ten na ně
  ale dosáhne jen svým prvním intervalem, takže materiál za hranicí zůstal
  stát (reálný nález na díle uživatele: pod vrstvou Ø19,5 se ve vybrání už nic
  nevzalo, jediná cesta k němu bylo ruční nastavení Rozsahu Z). Nově hranice
  DRŽÍ a vjezd na ni se řeší RAMPOU pod úhlem zanoření — přesně jako na
  hranici rozsahu 📐. Zanoření se přitom odkládá za všechny větší průměry
  svého místa („co je nahoře, má přednost" — `__deferEntry`). Bez zaškrtnutého
  Zanořování zůstává rozpouštění beze změny (kolmo do kůry dna se sjet nedá).
  Zanoření vzniká jen tam, kde se vedle vjezdu prokazatelně **vejde DRŽÁK**
  (`holderEntryCapZ`); jinak se hloubka v tom úseku vynechá jako dřív —
  hranice leží uprostřed materiálu, takže bez místa pro držák by rampa vjela
  bokem do neobrobeného odlitku (na díle uživatele oranžová kolize 87 mm²
  uprostřed vybrání; s podmínkou 5 → 0 hlášených kolizí).
  Měřeno izolovaně: **méně stojícího materiálu, nikde ne víc** — part-11 −168 mm²,
  range-chain-insert-shadow −107, díl uživatele −106, part-12 −104,
  holder-region −40, part-10 −26; ostatní fixtures beze změny.
  Pojistka `tests/cam-region-plunge.test.js`.
- CAM (podélné hrubování): **odložené zanoření se řadí na konec SVÉHO úseku**,
  ne až za celý program. Úsek je samostatná Z-zóna dílu — materiál nad
  zanořeným nástrojem vzaly vrstvy téhož úseku, takže odsouvat ho až za
  všechny ostatní úseky nemá důvod a jen tříští pořadí (reálný nález na díle
  uživatele: zanoření se dělalo úplně nakonec programu místo hned po vrstvě,
  ke které patří). Podmínka „co je nahoře, má přednost" platí dál — měří se
  ale v Z-okně zanoření (`tests/range-entry-ramp`, `tests/cam-region-plunge`).
- CAM: **odjezd do bezpečné polohy jde nejdřív v X a teprve pak v Z**, nikdy
  diagonálou. Kontrola kolize sice diagonálu pustí jen tam, kde v tu chvíli nic
  nestojí, ale poslední pohyb programu přes celý díl je zbytečné riziko.
- CAM (podélné hrubování): **krok dorampování nepokračuje rychloposuvem přes
  celý zbytek dílu.** Rovné dno za rampou končilo koncovým „vzduchovým"
  rychloposuvem až na cíl kroku (reálný nález na díle uživatele: `G0 Z349`
  na čelo polotovaru). Koncový vzduch se teď zahodí stejně jako u otevřeného
  průchodu — krok skončí na vůlí-posunuté siluetě.
- CAM (podélné hrubování): **přesun v kapse se zvedne nad materiál a nesjíždí
  rychloposuvem až na něj.** Odskok o „Odskok" (2 mm) nestačí, když je Hloubka
  (ap) větší (5 mm) — nástroj zůstal pod úrovní předchozí vrstvy a přejezd
  v ose Z zpátky na pokračování rampy vedl stojícím odlitkem (reálný nález na
  díle uživatele: `G0 Z37.951` skrz materiál). Nově se před přejezdem zvedne
  po ÚROVNÍCH PŘEDCHOZÍCH VRSTEV (krok = ap), dokud přejezd nevede volně
  (strop = výjezd nad konturu). Sjezd zpátky navíc končí pracovním posuvem
  (rychloposuv zastaví o Vůli nad materiálem) — stejné pravidlo jako u
  ostatních sjezdů, sdílený helper `emitDescendX`.
- CAM (podélné hrubování): **dojezd po kontuře dojede až na offsetovou čáru
  polotovaru.** `trimLeadOutToStock` ořezával dojezd na HOLOU kůru odlitku,
  takže proti sousedním drahám končil o vůli dřív a viditelně nedotažený.
  Vůle je přídavek, který se má taky obrobit — ořez teď měří na vůlí-posunuté
  siluetě (tečkovaná čára z náhledu), stejně jako všechny ostatní výjezdy.
  Na strmé hraně to není „hodnota + vůle": vůle je KOLMÁ vzdálenost, takže
  podél X ji hrana natáhne (na díle uživatele 1 mm vůle = 5 mm v X).
- CAM (podélné hrubování): **dojezd „bez schodků" nepřejíždí vzduch posuvem.**
  Rovné pokračování vrstvy (konstantní hloubka) se teď stejně jako tělo
  průchodu seká na rychloposuv(vzduch)/posuv(materiál) podle siluety odlitku —
  nad údolím, kam nástroj nedosáhne, není co řezat (dřív tam jel posuv
  desítky mm naprázdno; reálný nález na díle uživatele: `G1 X29.545 Z78.840`
  přes celé údolí). Platí i pro dno za rampou. Přechod řez→vzduch navíc dojede
  až na vůlí-posunutou siluetu („tečkovaná" čára z náhledu), stejně jako konec
  otevřeného průchodu. Sdílený helper `airSplitAxial` (`cam/gcodeEmit.js`).
- CAM (podélné hrubování): **mezikrok dorampování strmé stěny si dobere svůj
  schod.** Rovný doběh kroku se už neomezuje společným cílem řetězu — jede až
  na stěnu kontury a odtud (při zapnutém „Hrubování bez schodků") pokračuje
  po obrysu, stejně jako běžný průchod. Dřív dojížděl jen POSLEDNÍ krok
  řetězu, mezikroky končily nasucho uprostřed materiálu, přestože vrstva nad
  nimi byla obrobená daleko za tím bodem. Dojezd se přitom ořízne na hranu
  materiálu (`trimLeadOutToStock` nově i v rampové větvi emise), aby po
  kontuře nepokračoval do prázdna. Měřeno izolovaně: **méně stojícího
  materiálu** (part-8 −189 mm², part-4/6 −80, part-11/12 a díl uživatele −67,
  part-1/2 −21), počty průchodů beze změny, čas dílu uživatele +3 %.
  Pojistka `tests/cam-leadout-air-rapid.test.js`.
- CAM (podélné hrubování): **údolí, ze kterého mezní čára nevyjede ven, už
  nedělí díl na dva úseky.** Hranici úseku dělá až DOSAH DESTIČKY — mezní
  čára hlídání geometrie (`zanoreni`) musí volným koncem vyjet Z POLOTOVARU
  do vzduchu. Čára, která končí uvnitř materiálu (na hotovní kontuře),
  úsek nedělí: vrstva pokračuje přes celé údolí a vzduch nad ním přeletí
  rychloposuvem (přesně jako to už dělal směr zprava doleva na TÉMŽE dílu —
  asymetrie vznikala jen tím, jestli sweep narazí na stěnu kontury před
  údolím, nebo až za ním). Bez toho se nejdřív dokončila celá jedna strana
  údolí až na dno; protože se hranice úseku v kůře dna rozpouští, zajely
  hluboké průchody do Z-zóny té druhé strany, kde nad nimi ještě stál
  neodebraný materiál → **rampa i navazující oblouk braly víc než Hloubku
  (ap)** (reálný nález na díle uživatele: `G1 X22.658 Z44.994` +
  `G3 X24.550 Z48.244` po vrstvě na Ø29,5, která tam vůbec nedojela).
  Implementace `guideStaysInStock` (`cam/roughingStrategies.js`), údolí si
  k tomu nese své ústí (`zHi`/`zLo` z `computeResidualRegions`). Bez
  hlídání geometrie destičky se nic nemění (pole mezních čar je prázdné).
  Měřeno izolovaně per fixture: **odebraný materiál shodný** (part-11/12
  i díl uživatele na 0,1 mm², part-4/6/8/9 s regiony+boolean shodně),
  průchodů méně (28→26, resp. 38→30), čas +0,7 %. Nová pojistka
  `tests/cam-region-guide-split.test.js` (hlídá i opačný extrém: údolí BEZ
  mezní čáry si hranici drží — jinak vypadnou celé průchody). Vědomě
  přegenerované snapshoty obou regresních sad.
- **Zaoblení rohu v číselném zadání zapisovalo VŽDY `G03`, i když šlo
  geometricky o `G02`.** `applyCornerGcode()` (`dialogs/numericalInput.js`)
  bral směr z `arc.ccw` – ale `filletTwoLines()` (`geometry.js`) tuhle
  vlastnost u výsledného oblouku vůbec nenastavuje (`undefined !== false`
  vyjde vždycky pravda), takže se skutečná geometrie ignorovala a psalo
  se pořád stejné písmeno. Směr se teď počítá NEZÁVISLE křížovým součinem
  přímo ve WORLD rovině (x,y) – ověřeno round-tripem, že zpětně
  naparsovaný oblouk z opraveného zápisu sedí se skutečně nakreslenou
  geometrií na milimetr/stupeň přesně, pro soustruh i karusel.
  Mezikrok, který se ukázal jako navíc chybný jen u karuselu: první
  oprava počítala křížový součin v „G-kód rovině" vzorcem okopírovaným
  z `convertCornersToPaths()` (CNC Editor) – ten ale předpokládá roli
  Z=vodorovná osa/X=svislá osa (sedí na soustruh), takže pro karusel
  (X=vodorovná/Z=svislá, beze změny) vyšel opačný křížový součin a G2/G3
  bylo obráceně. Počítáním přímo ve world souřadnicích (stejná role,
  kterou má `parseGcodeToObjects()` při zpětném čtení – `toCanvas()` je
  jen přejmenování os, ne zrcadlení, u obou typů stroje) odpadl důvod
  k mezikroku úplně a oprava platí pro oba stroje stejně.
- **Navazování úsečka-na-úsečku (a tím i zaoblení/zkosení rohu) přestalo
  fungovat od druhé navazující úsečky v řadě.** Kontrola „navazuje nová
  úsečka na konec předchozí?" používala toleranci `1e-6` – ale počáteční
  pole se přednaplňuje ze `state.numDialogChain` zaokrouhleně na 3
  desetinná místa (`.toFixed(3)`), takže i beze změny uživatelem vznikl
  při odeslání formuláře rozdíl řádu `1e-4` (zaokrouhlení tam a zpátky
  přes `safeEvalMath()`). To je o dva řády víc, než `1e-6` tolerovala –
  roh se přestal poznávat přesně od druhého kroku dál (řetěz „vypadl" a
  appka místo zaoblení jen přidala další samostatnou úsečku). Tolerance
  zvednuta na `1e-3` na obou místech, kde na tohle appka spoléhá
  (`appendGcodeForObject()`, `createObject()`) – stejná hodnota, jakou už
  pro endpoint-matching používá `chainToPolylines()` jinde v appce.
- **Zavření a znovuotevření okna „Zadání objektu" rozbilo navazování
  úseček i zaoblení/zkosení rohu v ručním zápisu G-kódu** – po
  zavření/znovuotevření (nebo po F5) appka zapomněla, kam zápis dojíždí,
  a projevovalo se to trojmo: (1) každá další navazující úsečka dostala
  zbytečný `G00` na bod, kde už fakticky je (opakovaný vzor
  `G01 X.. Z..` hned následovaný `G00` na STEJNÉ souřadnice), (2) řádek
  „Roh s předchozí" (⌒/⌿) se u další úsečky vůbec neobjevil, takže se
  zaoblení/zkosení nedalo přidat jedním krokem, a (3) ani záložní
  tlačítko po vytvoření nenašlo roh k zaoblení – „misto pokračování jen
  dvě úsečky". Příčina: `lastAppendedGcodeEnd`/`prevLineEnd`
  (`dialogs/numericalInput.js`) jsou closure proměnné, které se při
  KAŽDÉM otevření okna zakládají znovu jako `null` – ale text v poli se
  načítá z localStorage a zavření okna přežívá beze změny. Nová
  `bridge.gcodeTextLastPoint()` (`storage/fileIO.js`, stejný parser jako
  🔄) obě proměnné po otevření okna obnoví z toho, kam ZAPSANÝ text
  skutečně dojíždí, takže navazování i zaoblení fungují správně i po
  zavření/znovuotevření.
- **⤢ v číselném zadání ignorovalo ruční zápis G-kódu a centrovalo na
  zastaralou hodnotu z formulářových polí.** `fitCadViewToNumPreview()`
  rámovala vždy `state.numPreview` (živý náhled formuláře) – ten se ale
  nemění tím, co se píše do editoru, takže po napsání/vykreslení G-kódu
  přes 🔄 (to samo správně vycentruje) druhý klik na ⤢ pohled ODSKOČIL na
  bod zbylý ve formuláři z předchozího zadávání. Teď má přednost obsah
  editoru – nová `bridge.gcodeTextBounds()` (`storage/fileIO.js`) ho
  parsuje stejně jako 🔄, ale bez vedlejších účinků na plátno, takže jde
  rámovat i PŘED odesláním. Živý náhled formuláře i běžné vycentrování
  výkresu zůstávají jako záložní kroky, když je editor prázdný.
- **Ikonová tlačítka (🔄/🗑/🎯/…) v okně „Zadání objektu" byla na mobilu
  40 px vysoká místo 28 px** (viditelně roztažená, ne čtvercová).
  `.input-dialog .vk-header-btn` přebíjelo `height`, ale ne `min-height` –
  ta je samostatná vlastnost a jako spodní hranice vyhrává i nad vyšší
  specificitou `height`. `.input-dialog button` v mobilní media query
  (`max-width: 900px`) nastavuje `min-height: 40px` pro VŠECHNA tlačítka
  v dialogu, takže se to bez výslovného přebití `min-height: 28px`
  neprojevilo, dokud nepřibylo druhé tlačítko vedle prvního.
- **Kompas rychlé volby úhlu (✛) v číselném zadání nereagoval na klik.**
  Popup se šipkami se připojuje přímo do `.calc-overlay`, sourozenci
  `.calc-window`, ne jeho potomkovi. Plovoucí okno má schválně
  `.calc-overlay-float { pointer-events: none }` (ať jde klikat na plátno
  pod ním) a zpátky na `auto` to přepíná jen `.calc-window` – na popup se
  to nevztahovalo, takže byl (i jeho vlastní pozadí) úplně mimo hit-test:
  klik propadl skrz na formulářové pole pod ním. `.angle-compass-popup`
  má teď vlastní `pointer-events: auto`.
- **Zaoblení/Zkosení vyvolané z číselného zadání (⌒/⌿) se objevovalo POD
  oknem „Zadání objektu".** `.input-overlay` (`makeInputOverlay()` – sdílí
  ho spousta jednoduchých dialogů) mělo `z-index: 100`, plovoucí okno
  `.calc-overlay-float` má `300`. Přebito na `350` – `.input-overlay` má
  neprůhledné pozadí a je to skutečné rozhodovací okno (OK/Zrušit), takže
  patří nad cokoli otevřeného, ne pod.
- **Editor G-kódu v okně „Zadání objektu" ořezával pole formuláře nad
  sebou** (na VK záložce viditelně u typu Oblouk – po „Geometrie prvku"
  a přepínači VL/VKr/VPOL zbytek polí zmizel). Příčina: `.sn-help-details`
  (sdílená třída pro rozbalovací sekce) má `overflow: hidden` kvůli
  zaobleným rohům jinde v appce; ve flex sloupci to podle specifikace mění
  automatickou minimální výšku na `0`, takže flexbox tenhle konkrétní prvek
  smrskl, aby uvolnil místo pro `.vk-gcode-box` (ten má `flex-shrink: 0` –
  nesmí zmizet), místo aby nechal scrollovat celý `.tab-scroll`. Oprava:
  `.tab-scroll > * { flex-shrink: 0; }` – žádné dítě se nesmí smrsknout pod
  přirozenou výšku, takže při nedostatku místa scrolluje obal, ne že by se
  obsah tiše ořízl.
- **Ikonová tlačítka (🔄 u zápisu kódu) se v číselné záložce kreslila
  malá a mimo střed** – `.input-dialog button` (padding 6/16 px, font-size
  13 px) má vyšší specificitu než `.vk-header-btn` a přebíjelo mu rozměry.
  `.vk-header-btn` je teď vycentrovaný `inline-flex` a uvnitř `.input-dialog`
  se přebíjí stejně specifickým pravidlem.
- **Přesný zaměřovač (dlouhý stisk) se respektuje i při 🎯 výběru bodu.**
  Křížek je schválně posunutý nad prst, aby byl vidět – `canvasPick.js` ale
  bral souřadnice PRSTU, takže se ve VK modalu bod zapsal o offset vedle
  toho, co bylo vidět. Poloha křížku se publikuje do `state.touchPrecision`
  a odběr kliku ji čte (zachytávací `touchend` na `document`, jinak by ji
  obsluha plátna stihla smazat). Kreslení nástrojem bylo správně už dřív.
- **Centrování pohledu už kresbu nestrká pod okno.** `visibleCanvasRect()`
  v `canvas.js` počítá viditelnou část plátna bez ukotvených panelů
  (vysunutý `#topbar`, okno „Zadání objektu") a rámuje do ní jak
  `autoCenterView()`, tak ⤢ v okně.

### Changed
- **Okno „Zadání objektu" je na mobilu nižší a přehlednější** – cílem je
  nechat plátnu polovinu displeje:
  - záložky 📐/🔢 a ⤢ se přesunuly do **lišty okna** vedle ✕ (titulek zmizel,
    nesou ho záložky), pořadí 🔢 · ⤢ · 📐 · ✕;
  - akce nad VK syntaxí (Smazat, Kopírovat, Konvertovat, Vložit do výkresu)
    jsou **ikony 🗑 📋 ⇄ 📥 v liště prvku VK** místo dvou řad tlačítek dole;
    název „🎯 prvek VK" ustoupil, aby se vešly;
  - přehled syntaxe VK se otevírá tlačítkem **❓** ve **vlastním okně**
    místo rozbalovací sekce v záložce;
  - **Dvojznačnost řešení** se přesunula na řádek s 🎯 ✏️ místo popisku
    „Souřadnice počátečního bodu"; u VPOL se souřadnice prvku, tečnost
    ani dvojznačnost už nezobrazují (k definici pólu nepatří);
  - u oblouku je „Poloměr zaoblení (R)" jen **R** vedle pole (řádek s G2/G3)
    a „Bod zlomu k dalšímu oblouku – osa" se zkrátil na **Bod zlomu – osa**;
  - vysvětlivka „Náhled se kreslí přímo na výkres…" se odstranila;
  - **pevná výška okna** (mobil 50vh, desktop `min(600px, 100vh - 96px)`)
    místo `max-height` – okno už neposkakuje podle toho, kolik polí má zrovna
    vybraný typ objektu. Roluje se celý obsah záložky *včetně* pole na kód
    (`.tab-scroll`) – ukotvené dole by formuláři nad sebou ubíralo výšku;
    když naopak zbyde místo, pole se roztáhne.
- **Číselné zadání: typ objektu jako řádek ikon** (**/** úsečka, **○**
  kružnice, **·** bod, čárkovaná diagonála = konstrukční čára, **⌒** oblouk) místo
  rozbalovacího seznamu; **Obdélník a Kontura se odsud odstranily**
  (obdélník se číselně nekreslí, kontura vzniká řetězením úseček).
  Zmizel i řádek s režimem ABS/INC, nápověda k matematickým výrazům,
  popisek „Nebo: Délka a polární úhel" a tlačítko **Zrušit** (okno zavírá
  ✕ v liště); **✓ Potvrdit** se změnilo na **OK** v posledním řádku polí.
- **Mobilní spodní lišta: tlačítko „Zadání objektu" je popsané `VK`** místo
  ikony ✏️ (kolidovala s tužkou i s ✏️ kreslením kontury ve VK).
- **Okno „Zadání objektu" se otevírá na záložce 🔢 a typu Bod** – ten má
  nejmíň polí, takže je pole na zápis G-kódu vidět celé bez rolování.
  (Tlačítko VK/`btnOpenVk` dál otevírá rovnou záložku 📐.)
- **Číselné zadání – oblouk na třech řádcích:** střed X/Z, pod tím vedle sebe
  Start (°) / Konec (°) a pod tím Poloměr, Směr a OK (dřív pět řádků pod
  sebou). Obsluha 🎯/📏/📐 tlačítek přitom přestala záviset na **pořadí
  v DOM** (`data-pick` role místo indexu) – jinak by přeskládání řádků tiše
  přehodilo, které pole klik do výkresu naplní.
- **Mobil: okno „Zadání objektu" (VK / Číselné zadání) teď sahá až na spodní
  okraj obrazovky**, stejně jako výsuvný panel nástrojů (`#topbar`) – větší
  (60vh místo 45vh) a `#mobileBottomBar` je pod ním schválně schovaný, dokud
  je okno otevřené.
- **Odstraněno duplicitní tlačítko „Měření" z hlavního panelu nástrojů**
  (`data-tool="measure"` vedle Výběr/Kóta/Konstr). Měření zůstává na svém
  vlastním místě – 📏 ve stavové liště (desktop) i ve spodní liště (mobil).
- **Číselné zadání: „Vytvořit" (teď „✓ Potvrdit") už okno nezavírá.**
  Objekt se vloží a formulář se rovnou vrátí na start = konec právě
  vytvořeného prvku (stejné pole jako dosavadní řetězení), takže jde
  psát rovnou další prvek bez opětovného otevírání. Cílový bod (X2/Z2)
  i Délka/Úhel zůstávají po vložení PRÁZDNÉ (dřív `value="0"` u X2/Z2
  dělalo fantomovou výchozí hodnotu, ze které se navíc přes auto-fill
  dopočítávalo nesmyslné Délka/Úhel z předchozího zadání). Kontura
  (Kontura/polyline) po vložení vyprázdní nasbírané body. Zavírá už jen
  **Zrušit** nebo ✕ v liště.
- **Ikony tlačítek „Zadání objektu" (desktop stavová lišta, mobilní spodní
  lišta) přestaly vypadat jako Kalkulačka.** Obě dřív ukazovaly jen `🔢` –
  identicky s `🔢 Kalkulačka` v panelu Kalkulačky. Teď `✏️ VK` (desktop) /
  `✏️` (mobil, kulaté tlačítko nemá na text místo).

### Fixed
- **Číselné zadání: přesně napsané souřadnice úsečky se tiše zaokrouhlily.**
  Pole „Délka a polární úhel" se auto-plní z X1/Z1/X2/Z2 jen jako INFORMACE
  (zobrazit délku/úhel), ale `createObject()` je bralo jako AUTORITATIVNÍ,
  kdykoli nebyla prázdná – takže se každá úsečka ve skutečnosti vytvořila
  rekonstrukcí z délky a úhlu zaokrouhleného na 2 desetinná místa, ne
  z napsaných X/Z. U delší úsečky to znamenalo odchylku v řádu desetin mm
  (např. X50 Z20 vyšlo jako X50.0008 Z19.9989). Teď se Délka/Úhel použije
  jen tehdy, když do nich uživatel fakt psal (`lineUsesLenAng`), jinak mají
  přednost přesná X/Z.
- **Tlačítko „Kopie" v toolbaru nedělalo nic.** Při přestavbě toolbaru
- **VK: kreslení kontury klikáním (✏️).** Vedle 🎯 přibyl přepínač, po kterém
  **každý klik do výkresu rovnou vloží prvek** – kontura se naklikává jako
  polyčára a VK syntaxe se píše sama. Bere přitom nastavení formuláře
  (VL/VKr, směr G2/G3, poloměr R, tečné napojení T) a přichycení k bodům.
  Je to **plnohodnotný nástroj CADu** (`state.tool === 'vkDraw'`,
  ve stavové liště *Nástroj: VK – kreslení kontury*), ne druhý „nabitý"
  odběr kliku jako 🎯: odběr běží na `click`, nástroje na `mousedown`,
  takže by jeden klik zapsal bod do VK **a zároveň** nakreslil aktivním
  nástrojem. Jako nástroj zároveň zadarmo funguje dotyk, ESC i přepnutí
  z toolbaru. Režim se vypíná ✏️, ESC, jiným nástrojem, přepnutím na
  záložku 🔢 nebo zavřením okna (nesmí okno přežít – neměl by kam psát).
  Syntaxi teď obě cesty (✏️ i ➕) skládají společné čisté funkce
  `vkElementCommand()` / `vkChainHasElements()` / `buildVkElementLine()`.
  Součástí režimu je **gumová čára** – prvek, který by kliknutím vznikl,
  je vidět od konce kontury k ukazateli (u VKr rovnou jako oblouk daného
  R a směru; když je R na tu vzdálenost krátké, ukáže se úsečka).
  Krok zpět je **⌫**, případně **➖** – to dřív umělo odebrat jen
  *nedořešený* prvek z fronty, jenže klikáním vznikají samé plně známé
  prvky, takže na naklikanou konturu nešlo sáhnout jinak než ručně
  v textu. `G111` (VPOL) krok zpět nikdy nesmaže – není to prvek kontury.

### Added
- **VK: „📥 Vložit do výkresu".** Volná kontura byla do teď jen textová
  pomůcka – hotový zápis teď jde jedním tlačítkem změnit na skutečné
  objekty výkresu (`line` / `arc`). Vkládají se jako **obyčejné objekty
  bez jakéhokoli VK příznaku**, takže průsečíky, trim/fillet, kóty, DXF,
  CAM i export G-kódu fungují bez dalšího zásahu; celé vložení se vrací
  jedním Ctrl+Z. Konstrukční paprsky (VPOL/PA) a rozepsaný prvek
  z formuláře se nekomitují. Syntaxi s nedopočtenými rozměry (`?`)
  tlačítko odmítne a pošle na „Konvertovat na ISO G-kód" – jinak by
  `buildVkPreviewData()` takový prvek sbalilo na nulový segment a ten by
  z výkresu tiše zmizel. V režimu kreslení polotovaru jdou objekty do
  vrstvy Polotovar s `isStock`.
  Nový `js/calculators/vkCommit.js`; konstrukce oblouku ve world
  souřadnicích (`vkArcInWorld()`) je nově sdílená s náhledem místo
  druhé kopie ve `vkPreviewRender.js`.

### Added
- **VK: živý náhled tečného napojení.** Kam konturu posune „Konvertovat na
  ISO G-kód" je vidět **na výkrese už při psaní** – fialově čárkovaně, plus
  kroužek v dotykovém bodě. Kreslí se jen ROZDÍL proti hotové kontuře
  (ten kousek u napojení, který se posune), ne její celá druhá kopie.
  Text se přitom **nemění**: náhled hlavní kontury musí dál odpovídat tomu,
  co je napsané, protože přesně to vloží „📥 Vložit do výkresu" – jinak by
  si náhled a vložená geometrie přestaly odpovídat. Po konverzi nápověda
  zmizí (už není co napovídat).
- **VK: esíčko bez úvodní přímky (dva oblouky za sebou).** Dřív „dva oblouky
  za sebou zatím nejsou podporované". Kategorie 3 uměla jen řetěz
  *přímka → oblouk → oblouk → známý prvek* a vyžadovala navíc **bod zlomu**,
  protože oba oblouky byly volné (4 neznámé na 3 rovnice). Když esíčko
  navazuje tečně na **už dopočtenou geometrii**, je jeho první střed pevně
  daný a zbývají 2 neznámé na 2 rovnice – soustava vyjde určená sama, takže
  **bod zlomu se tu zadávat nemusí**. Nová `twoTangentArcsFromDirection()`
  ve `vkSolver.js`: střed druhého oblouku = průnik rovnoběžky s paprskem
  (ve vzdálenosti R2) s kružnicí R1+R2 kolem prvního středu.
- **VK: tečný oblouk jako první nedořešený prvek fronty.** Dřív to skončilo
  hláškou „zatím není podporovaný". Případ: prvek před obloukem je už
  dopočtený, takže se ví, kde oblouk začíná i pod jakým úhlem tam tečně
  navazuje – hledá se jeho konec na následujícím plně zadaném prvku
  (typicky válec → rádius → čelo). Tečnost na začátku posadí střed kolmo
  ve vzdálenosti R; strana se **nevybírá podle G2/G3** (jeho smysl je
  svázaný s konfigurací stroje), obě se nabídnou jako varianty a rozhodne
  VPOL1/VPOL2 nebo auto-výběr. Následující prvek bez vlastního PA se bere
  jako kolmý – táž konvence jako u kategorie 1. Nová čistá funkce
  `tangentArcEndOnRay()` ve `vkSolver.js`. Směr už dopočtené geometrie se
  bere z napsané VK syntaxe (z fronty ten prvek mezitím vypadl).

### Fixed
- **Tlačítko „Kopie" v toolbaru nedělalo nic.** Při přestavbě toolbaru
  dostalo `data-tool="copy"`, jenže nástroj se jmenuje `copyPlace` –
  `handleCanvasClick` pro `copy` žádnou větev nemá, ve stavové liště
  svítilo holé „Nástroj: copy" a zkratka „je vybráno → rovnou umísti"
  se taky neuplatnila. Kopírování šlo jen přes Shift+C / kontextové menu.
- **Psaní do textového pole už nepřepíná nástroj.** Klávesová zkratka
  jednoho písmene se odbavovala i tehdy, když měl fokus `<textarea>` –
  napsat `l` do VK syntaxe (nebo do CAM/CNC editoru) znamenalo přepnout
  nástroj na Úsečku, `n` otevřít číselné zadání atd. Stráž v `events.js`
  hlídala jen `INPUT`/`SELECT`; u modálních dialogů to nevadilo, ale
  plovoucí okna koexistují s plátnem, takže se to začalo dít při běžném
  psaní. Ctrl+Z, ESC ani F1 se změna netýká (jsou nad stráží).
- **VK: vrátilo se pole „Dvojznačnost řešení" (VPOL1/VPOL2).** Kód ho na
  třech místech četl (vkládání prvku, reset formuláře, načtení prvku přes
  ◀ ▶), ale samotné pole se ztratilo při rozdělení okna na záložky –
  z formuláře tedy nešlo zvolit vůbec nic a hláška „zvolte VPOL1 nebo
  VPOL2" posílala uživatele na něco, co v UI nebylo (šlo to jen dopsat
  ručně do textu). Po vložení prvku se přepínač vrací na „— (rozhodne
  appka)", aby se volba tiše nepřenášela na další prvek.
- **VK: tečné napojení počítalo v roztažené ose X.** `vkSolver.js` dostával
  X jako **průměr** a každá funkce s kruhovou geometrií si ho měla sama
  vydělit dvěma. Kategorie 4 (netečné napojení kolem VPOL) to dělala, tečná
  rodina (kategorie 2 a 3, přidaná později) ne – osa X tam byla proti Z
  i proti R roztažená 2×, takže oblouk byl v té rovině elipsa a dotykové
  body vycházely jinde. Na zadání ⌀20 → tečný oblouk R10 → ⌀40 to hlásilo
  jediný degenerovaný dotyk místo dvou správných. Solver teď počítá ve
  **skutečné rovině (Z, poloměr)** jako zbytek appky (CLAUDE.md: „interně
  vždy poloměr, převod jen na hranici UI") – `toSolverX`/`fromSolverX` jsou
  tenký obal nad `inputX`/`displayX` a `intersectRayCircle` už nic nepůlí.
  Rovina s neeuklidovskou osou X byla past, na kterou musela pamatovat
  každá nová funkce; teď žádná není. Kategorie 1 a 4 dávají stejné výsledky
  jako dřív, kategorie 2 a 3 správné.
- **VK: zkonvertovaný program byl pro appku neviditelný.** „Konvertovat na
  ISO G-kód" vyrábí `G1` (z `G11` i `G0`), jenže `parseVkLine()` `G1`
  neznal – po konverzi tedy zmizel náhled a nešlo nic vložit do výkresu,
  přesně na cestě, kam uživatele posílá hláška o nedopočtených `?`.
  Totéž potkávalo přechodové úsečky z `insertTangentTransitions`. Parser
  teď `G1` bere a `buildVkPreviewData()` použije první prvek jako počátek,
  když není VPOL ani `G0` (zkonvertovaný program nemá ani jedno).

### Changed
- **VK: tečné napojení i mezi dvěma běžnými prvky.** Dřív se řešilo jen po
  konstrukčním paprsku (PA bez PR). Teď u oblouku s příznakem **T** doveze
  VK předchozí úsečku/kužel přesně do dotykového bodu – **posunutím jeho
  konce**, ne vloženou úsečkou navíc (ta by znamenala dojet na napsaný roh
  a couvnout po vlastní čáře zpátky). Bez `T` se nic nepřepisuje, protože
  uživatel o tečnost nežádal. Po konstrukčním paprsku zůstává chování
  původní (paprsek nemá délku, takže se přechodová `G1` pořád vkládá).
- **VK: dvě možná řešení se místo chyby rozhodnou sama, když je to
  jednoznačné.** Dřív každá dvojznačnost skončila hláškou „zvolte VPOL1
  nebo VPOL2", i když jedno řešení leželo na druhé straně dílu. Nově se
  bere bližší k začátku obrysu, pokud je to druhé aspoň **3× dál** –
  a řekne se to v informačním řádku i s poměrem, takže je vidět, že se
  rozhodovalo za uživatele (druhou variantu pořád vynutí zápis VPOL2).
  Při menším rozdílu se jako dřív ptá. Pravidlo je nově jedno sdílené
  (`chooseSolution()` ve `vkSolver.js`) pro všechny kategorie – dřív ho
  měla každá zvlášť a měřila jinou veličinu (bod / střed oblouku / bod
  zlomu) vlastním kódem.
- **VK: srozumitelná hláška u degenerované osy bodu zlomu.** Když jsou
  u esíčka (kategorie 3) obě přímky kolmé na osu zadaného bodu zlomu,
  ta osa o poloze zlomu nic neříká a soustava zůstane nedourčená. Dřív
  to skončilo jako „žádné řešení (s danými poloměry a bodem zlomu nejde
  esíčko sestavit)", což svádělo hledat chybu v poloměrech; teď se řekne
  rovnou, že má bod zlomu zadat v druhé ose.
- **VK náhled se kreslí přímo na výkres a okno je plovoucí.** Vlastní
  mini-canvas VK (s vlastním zoomem a panem) je zrušený – kontura se
  vykresluje rovnou na CAD plátno, takže sdílí měřítko i polohu s tím,
  co je nakreslené, a jde to porovnat. Tlačítko **⤢** teď přizpůsobí
  pohled výkresu kontuře. Okno „Zadání objektu" je plovoucí (bez tmavého
  pozadí), takže **jde kreslit nástrojem, aniž by se muselo zavírat**;
  ESC proto patří nástroji (zrušit rozkreslený prvek) a okno se zavírá
  křížkem. Na mobilu je ukotvené dole nad spodní lištou.
  Nové **🎯 u souřadnic VK prvku** doplní X i Z kliknutím do výkresu –
  stejný jednorázový odběr kliku, jaký měl číselný vstup (nově sdílený,
  `js/dialogs/canvasPick.js`), takže nekoliduje s aktivním nástrojem.
  Číselné zadání se při výběru bodu z výkresu už neschovává – jen se
  zvýrazní cílové pole.
  Oblouky náhledu se konstruují ve world souřadnicích stejným postupem
  jako `parseGcodeToObjects()`, takže náhled a G-kód po naparsování dávají
  tentýž oblouk (ověřeno v poloměrovém i průměrovém režimu). Osy se
  převádějí kanonicky přes `displayX`/`inputX` a typ stroje – u karuselu
  jsou X/Z prohozené.
- **📐 VK – Volná kontura a 🔢 Číselné zadání objektu jsou teď jedno okno**
  se dvěma záložkami („Zadání objektu"). Všech pět dosavadních spouštěčů
  (tlačítko 🔢 Zadat v CAD toolbaru, 🔢 ve stavové liště, 🔢 v mobilní
  liště, klávesa `n` a 📐 VK Kontura v panelu Další kalkulačky) otevírá
  totéž okno – liší se jen výchozí záložkou, takže se dá mezi číselným
  zadáním a VK přepnout bez zavírání. Titulek okna se mění podle aktivní
  záložky, okno jde táhnout za lištu. Chování obou nástrojů zůstává
  stejné (řešič, `localStorage`, 🎯 výběr z mapy, řetězení).
  Interně: `vkContour.js` a `numericalInput.js` nově exportují dvojici
  `render*Tab()` / `init*Tab(container)` a okno kolem nich staví nový
  `js/dialogs/combinedModal.js`. Při zavření se volá `destroy()`, takže
  se uklidí i rozdělaný odběr kliku na plátno (dřív přežíval zavření
  dialogu) a `resize` listener VK náhledu.
- VK Kontura: sekce „2. Parametry nového VK prvku" přejmenována na
  „2. Nový VK prvek" a doplněna o **navigaci ◀ ▶** mezi nedořešenými
  prvky (max. 3, přesně to, co drží `pendingQueue`) přímo v záhlaví
  sekce – umožňuje se vrátit k dřív vloženému nedořešenému prvku,
  doplnit/upravit jeho pole (PA, PR, R, VPOL tag, bod zlomu…) a uložit.
  Úprava, která by prvek udělala plně známým, se odmítne s návodem
  (nejdřív odebrat ➖, vložit znovu jako nový) – jinak by se musel řešit
  přepočet celého zbytku řetězce, což by výrazně rozšířilo rozsah.
  Tlačítko „Přidat VK prvek" nahrazeno dvojicí **➕ (vložit/uložit)** a
  **➖ (odebrat)** – druhé umožňuje smazat naposledy vložený nebo právě
  prohlížený nedořešený prvek. Oprava odhalená testováním: kotva paprsku
  počátečního bodu (odvozená ze SAMOTNÉHO X/Z, ne z předchozího prvku)
  se při úpravě přes ◀ ▶ musela přepočítat znovu (`firstElementAnchor`)
  – jinak by se paprsek po editaci X/Z tiše nepohnul a dopočet by vyšel
  podle staré (needitované) polohy.
- VK Kontura: **počáteční bod přesunut** ze samostatné sekce „1." přímo do
  „2. Parametry nového VK prvku" jako úplně první zadání (sekce „1." teď
  obsahuje jen VPOL). Počáteční bod se zadává úplně stejným formulářem
  jako každý další prvek – včetně „?" u X/Z a PA/PR – takže i on může
  zůstat částečně neznámý a dopočítat se z dalšího vloženého prvku (např.
  Start X=30, Z=„?", a Z se doplní, jakmile se přidá navazující prvek).
  Popisky se automaticky přepínají „Start X1/Z1" ↔ „Cíl X2/Z2" a řádek
  „Tečné napojení na předchozí prvek (T)" se u počátečního bodu schová
  (na začátku není na co navazovat). Oprava-při-vývoji: `elementRay()`
  bere pro směr rovnoběžný s osou POZICI z kotvy (anchor), ne z
  el.x/el.z – u počátečního bodu (bez předchozího prvku) se proto kotva
  musí poskládat z toho, co je na SAMOTNÉM počátečním bodě známé (a jen
  když navíc chybí i to, doplní VPOL) – jinak by paprsek „X=30" ztratil
  svou polohu a dopočet by tiše vyšel špatně. Pokud počáteční bod udává
  jen úhel (PA) bez X/Z a VPOL ještě není vložený, appka to teď odmítne
  s jasnou hláškou (nemá se od čeho měřit) místo tichého špatného čísla.
- VK Kontura: popisky polí sjednoceny s konvencemi appky – zbytečné
  „(Délka)" u všech Z polí (Start Z1, VPOL Z, Cíl Z2) odstraněno (Z
  jednoznačně délka, nehrozí záměna); „Polární rádius (PR)" přejmenováno
  na „Délka (PR)" (PR je vzdálenost od pólu, ne rozměr obrobku); popisek
  u X polí (Start X1, VPOL X, Cíl X2, osa bodu zlomu) teď reaguje na
  aktuální nastavení **☰ Nastavení → 📏 Zobrazení** (Poloměr/Průměr)
  místo pevného „(Průměr)". Zásadní oprava: `vkSolver.js` uvnitř vždy
  počítá s X jako průměrem (dělí /2 na skutečný poloměr pro kruhovou
  geometrii) – dřív se to bralo doslova i když appka byla v režimu
  Poloměr (výchozí nastavení!), takže by se poloměr omylem půlil znovu.
  `vkContour.js` teď před voláním solveru hodnotu X převede na
  „pseudo-průměr" (`toSolverX` – v režimu Poloměr ×2, v režimu Průměr
  beze změny) a výsledek zpět (`fromSolverX`) při zápisu do textu/hlášky
  – text řádku (`X40.0` apod.) zůstává vždy v jednotce, jakou uživatel
  zadal. Ověřeno end-to-end v obou režimech (přepnutím ☰ Nastavení →
  Zobrazení a zopakováním stejného výpočtu).

### Added
- VK Kontura: **dopočet neznámých souřadnic** (kategorie 1 – roh dvou
  přímek/kuželů; kategorie 4 – netečné napojení přímky/kužele na kružnici
  kolem VPOL). Nový čistě matematický modul `js/calculators/vkSolver.js`
  (žádná vazba na canvas/state): `elementRay`/`intersectRays` řeší roh mezi
  neznámým prvkem a následujícím plně zadaným (přímka rovnoběžná s osou Z,
  pokud je dáno jen X, s osou X pokud jen Z; jinak explicitní PA; známý
  navazující prvek bez PA se bere jako kolmý na předchozí – schod na
  hřídeli); `intersectRayCircle`/`solveLineArcJunction` řeší průsečík s
  kružnicí o daném poloměru se středem ve VPOL (netečné napojení), se
  správným převodem průměr↔poloměr (X/2) pro kruhovou geometrii;
  `pickByVpolTag` rozlišuje dvě řešení podle značky VPOL1/VPOL2 (blíž/dál
  od startu obrysu). `vkContour.js` teď při vkládání nového (plně
  zadaného) prvku automaticky dopočte a v textu doplní „?" u
  bezprostředně předchozího nedořešeného prvku (přidáno pole „Dvojznačnost
  řešení" VPOL1/VPOL2 pro kategorii 4). Pokryto 19 testy
  (`tests/vk-solver.test.js`), včetně ověření na 5-12-13 trojúhelníku.
  Kategorie 3 (esíčka – dva oblouky za sebou) zatím není řešena.
- VK Kontura: **kategorie 2** (jeden tečný oblouk daného poloměru R,
  case 5–8). `vkSolver.js` doplněn o `tangentCircleTouchPoints` (2 prvky:
  přímka/kužel „?" → oblouk se ZNÁMÝM koncem, tečně) a
  `tangentCircleBetweenRays` (3 prvky: přímka/kužel „?" → oblouk „?"
  tečný → přímka/kužel známá – klasický řetězec válec→zaoblení→kužel).
  Rozlišení od kategorie 4 je přes příznak **T** na oblouku (T = tečné,
  bez T = netečné kolem VPOL). Záměrně se NEPOUŽÍVÁ G2/G3 k výběru
  strany tečné kružnice (smysl G2/G3 je v appce svázaný s konfigurací
  stroje flipX/flipZ, viz `fileIO.js` – hádání by riskovalo tichou
  chybu), místo toho se mezi geometricky platnými řešeními vybírá stejně
  jako v kategorii 4 – přes VPOL1/VPOL2 (blíž/dál od startu obrysu).
  `vkContour.js` teď drží frontu až 2 nedořešených prvků (ne jen 1) a při
  3prvkovém řetězci dopočte a doplní „?" v OBOU předchozích řádcích
  najednou. Ověřeno na ručně sestrojeném „rohu" (kolmé přímky r=0/z=20,
  R=5 → 4 tečné kružnice v rozích) – `tests/vk-solver.test.js`, 24 testů
  celkem.
- VK Kontura: **kategorie 3** (esíčko – dva tečné oblouky za sebou,
  case 9–11). Před implementací ověřen stupeň volnosti: 2 neznámé
  středy oblouků = 4 neznámé, ale tečnost k oběma přímkám + tečnost
  oblouků navzájem dává jen 3 rovnice – o 1 stupeň volnosti méně, než
  je potřeba (nekonečně mnoho platných esíček lišících se polohou bodu
  zlomu). Doplněno proto nové nepovinné pole **„Bod zlomu"** (osa Z/X +
  hodnota) u oblouku – právě ta chybějící rovnice. `vkSolver.js`
  doplněn o `twoTangentArcsBetweenRays` (uzavřené řešení: lineární
  rovnice z dané souřadnice bodu zlomu + kvadratická rovnice z tečnosti
  mezi oblouky, vyřešeno dosazením) a `pickTwoArcsByVpolTag`. Ověřeno
  nezávisle přes brute-force kontrolu geometrických invariantů
  (vzdálenost středů = R1+R2, vzdálenost středu od paprsku = R,
  souřadnice bodu zlomu sedí) na obecných (nekolmých) úhlech, plus
  ručně sestrojeným pravoúhlým rohem – `tests/vk-solver.test.js`, 32
  testů celkem. `vkContour.js` teď drží frontu až 3 nedořešených prvků
  a při 4prvkovém řetězci (přímka→oblouk→oblouk→přímka) dopočte a
  doplní „?" ve všech třech předchozích řádcích najednou.
- Kalkulačky: nový nástroj **„VK Kontura"** (📐) v sekci „Další kalkulačky" –
  editor volné kontury (obdoba Heidenhain FK – Free Kontur programming) pro
  zápis prvku úsečka/oblouk pomocí toho, co je zrovna známo: pravoúhle X/Z,
  polárně PA/PR k definovanému pólu (VPOL/G111), nebo „?" tam, kde je rozměr
  zatím neznámý a dopočítá se ručně jinde. Obsahuje přehled syntaxe a
  typových kombinací (lineární/obloukové/esíčkové/netečné napojení) a převod
  doplněného zápisu na standardní ISO G-kód (G111→komentář, G11→G1, PA/PR/T/
  VPOL se odstraní). Čistě textová pomůcka pro rozměrový řetězec – needituje
  výkres. Implementace `js/calculators/vkContour.js` (dialog) +
  `js/calculators/vkHelp.js` (nápověda, líně vykreslená při rozbalení).
- CAD: nové tlačítko **„Tužka"** (✏️) v liště nástrojů za „Profil" (`data-tool="pencil"`).
  Kreslení od ruky – tažením myší/prstem po plátně vzniká náčrt, který se po
  puštění tlačítka/prstu uloží jako jeden objekt typu polyline (rovné
  mikro-segmenty mezi nasbíranými body, lze později rozložit přes „💥 Rozložit
  konturu"). Implementace `js/tools/pencilClick.js`.
  - Nová polyline se značí `isPencilStroke: true`, aby ji **„Zpět" smazal
    najednou celou** – bez tohoto příznaku by ji zachytilo krokové undo pro
    právě vytvořenou konturu (`js/state.js` `undo()`) a mazalo by ji bod po
    bodu (desítky kliknutí na dlouhý náčrt).
- Mobil: v liště nástrojů zkrácené popisky **„Kruh"** (Kružnice) a **„Obde"**
  (Obdélník), aby se řádek vešel na jeden řádek i s novým tlačítkem Tužka.
- CAD: nové tlačítko **„Spoj"** vedle „Rozděl" v liště nástrojů (`data-tool="join"`).
  Opak rozdělení – klepnutím na bod, kde se stýkají dvě stejnosměrné úsečky
  (kolineární, tvořící přímé prodloužení, ne roh ani přehyb), se obě sloučí
  do jedné úsečky. Implementace `js/tools/joinClick.js`.
- CAM/CNC Editor: **oranžová lišta s řídicím systémem** (🔄 CAM Editor,
  💻 CNC Editor) teď nese i ovládání, které se na mobilu na výšku jinam
  nevešlo. Vlevo přibyly šipky **◀ Zpět / ▶ Vpřed** (i Ctrl+Z/Ctrl+Y) pro
  vlastní historii úprav editoru (přímé přiřazení `editor.value` z quickbaru,
  hlavičky, přečíslování apod. by nativní undo textarey stejně zahodilo).
  Text lišty je zkrácený na jen název systému (`SINUMERIK`/`FANUC`/
  `HEIDENHAIN`, bez „840D sl") + `(CAM)`/`(CAD)` + název programu. Vpravo je
  zavírací **✕** — na mobilu totiž titulková lišta okna (`.calc-titlebar`)
  zůstává skrytá a křížek by jinak nešel vidět/kliknout.
  - Na mobilu se z lišty nad kódem odstranil název souboru (ten už je vidět
    v oranžové liště) a uvolněné místo vedle ☰ zabraly často používané akce
    **⌒ (sražení/zaoblení→dráha), G90/G91, 🔍 Hledat a ＋ Nový program**
    (`.cne-show-m`, opak `.cne-hide-m` — mimo mobil zůstávají skryté, na
    desktopu beze změny). Tlačítko G90/G91 teď existuje 2× v DOM (desktop
    i mobil), `updateModeBtn()` proto aktualizuje obě instance přes
    `querySelectorAll`, ne jen `$()`.
  - Otevřený boční panel (☰ Historie/Soubory) na mobilu schová i spodní
    klávesnici (quickbar) — `.cne-main` (flex:1) se roztáhne do
    uvolněného místa a panel s ním, není to tak našup na sobě.
- CAD: **výběr typu čáry dle ČSN EN ISO 128** — tlačítko „Konstr." v liště
  nástrojů už nekreslí rovnou konstrukční čáru, ale otevře dialog **Typ čáry**.
  Na výběr je souvislá tlustá (viditelné hrany a obrysy), souvislá tenká
  (kótovací a odkazovací čáry, šrafy), čárkovaná (zakryté hrany), čerchovaná
  tenká (osy souměrnosti, středy kružnic), dvoječerchovaná (sousední díly,
  krajní polohy) a původní konstrukční (nekonečná pomocná čára). Každý typ má
  v dialogu náhled vzoru i popis použití.
  - **Barva** se volí zvlášť (7 základních, vlastní, nebo „A" = podle vrstvy).
  - Zvolený typ platí pro všechny další nakreslené čáry a **popisek tlačítka
    se přepíše na zkratku** (`Tlustá`, `Tenká`, `Čárk.`, `Čerch.`, `2čerch`,
    `Konstr`) — max. 6 znaků, aby lišta nástrojů na mobilu nepřibrala řádek.
    Ikona tlačítka ukazuje zvolený vzor i barvu.
  - Přepínač **„Pomocná čára – mimo konturu a CAM"**: zaškrtnuté čáry se
    ukládají jako typ `constr` (vrstva Konstrukce) a nevstupují do kontury ani
    do G-kódu. Přednastavuje se podle typu čáry (souvislá tlustá = skutečná
    geometrie, ostatní pomocné), lze přepnout ručně.
  - Volba přežívá restart aplikace (`localStorage`), zkratka `K` zapne nástroj
    rovnou s posledním typem, klik na aktivní tlačítko dialog otevře znovu
    a nabídne i **Vypnout**.

- CAM: **skládání programu z více operací — tlačítko „➕ Operace"** v liště nad
  G-kódem. Jeden díl se často obrábí na několik operací (vyhrubovat jedním
  nožem, pak jiným udělat drážky/zápich/závit). Po kliknutí se dosavadní dráhy
  uzavřou jako hotová **část programu**, plátno se vyčistí a zůstane kontura
  s **polotovarem obrobeným předchozími částmi** — další operace tedy staví na
  tom, co už se odebralo. Uživatel si přenastaví nůž, parametry i rozsah
  obrábění a „🔄 Dráhy" vygeneruje další část.
  - Nová **lišta částí**: chip = jedna operace (klik přepne včetně nože,
    parametrů, rozsahů i polotovaru; dvojklik přejmenuje; ✕ smaže celou část
    — vše s ↩ Zpět), přepínač náhledu **Část / Celý program** a **⛓ Spojit**.
  - „Celý program" ukáže i **odsimuluje** složený program všech operací od
    původního polotovaru (jen ke čtení).
  - Ven (💾 Uložit, stažení `.MPF`, kopie do schránky, 🔧 Editor, `.camprog`)
    jde vždy celý program: hlavička se u dalších částí vypisuje jen v tom, co
    se opravdu mění, `M30` zůstane jen na konci a **při výměně nože** se
    doplní nájezd do referenčního bodu (`G75`/`G28`/`G74`), `STOPRE` a vypnutí
    i znovuzapnutí vřetena a chlazení.
  - **⛓ Spojit** vloží všechny části do fronty **SPOJ G-KÓD** v CAM Editoru a
    otevře spojený program — část tam jde ještě upravit nebo z fronty vyhodit.
  - Obrobený polotovar se prokládá **oblouky** (`fitArcsToPolyline`), ne
    stovkami drobných úseček z booleovského zbytku — zaoblení dílu zůstanou
    zaoblení a scan hrubování nejede přes tisíce segmentů (na testovacím dílu
    34 → 15 bodů, z toho 4 oblouky). Široké oblouky se přitom dělí na
    **max. 90°**: zápis „koncový bod + poloměr" je u skoro-180° oblouku
    numericky prekérní (tětiva se blíží 2R), takže i zaokrouhlení souřadnic
    na µm posune dopočítaný střed o řád víc a v krajním případě `getArcParams`
    ohlásí chybu a dokreslí půlkruh — na plátně to vypadalo, jako by se
    oblouk polotovaru obrátil z G3 na G2. Každý oblouk se navíc po zaokrouhlení
    ověří a při neshodě degraduje na úsečku.
  - **Vybarvení** (CAD nástroj „Vybarvit") zůstane odebrané i v dalších
    operacích, ne jen po dobu přehrávání simulace: ořez se počítá proti
    obrysu **původního** polotovaru uloženému u první části, takže materiál
    odebraný předchozí operací se na plátno nevrací ani při nulovém postupu
    simulace.
  - Rozdělení na části **přežije obnovení stránky** i cestu přes CAD — kontura
    přicházející z CAD části nezahazuje (do CAM se chodí právě odtud). Při
    skutečné změně kontury se jen upozorní, že polotovary nemusí sedět;
    polotovar překreslený v CAD se propíše do první části.
  - Nové moduly `js/calculators/cam/opParts.js` (záznam části, odvození
    obrobeného polotovaru, složení programu) a `js/calculators/cam/gcodeMerge.js`
    (spojování programů — vytaženo z `camEditor.js`, teď sdílené oběma místy).

### Changed
- CAM (Parametry): pole **„Vůle X/Z (polotovar)" se jmenují „Přídavek X (polo.)"
  a „Přídavek Z (polo.)"** (a stejně i shrnující chip nad panelem) — je to
  přídavek kolem polotovaru, na jehož čáru (tečkovaná hranice v náhledu) má
  dráha dojíždět, ne jen odstup rychloposuvu.

### Changed
- CAM (podélné hrubování): **rozsah obrábění 📐 ořezává i geometrii, ze které
  se dráhy plánují** — ne jen samotné řezné pohyby. Díl se obrábí po úsecích;
  co je mimo rozsah, se v dané operaci neobrábí a nesmí tedy ovlivňovat
  plánování. Dřív odlitkový hrb ZA hranicí rozsahu protahoval hloubkovou
  posloupnost (počítala se z vrchu celého polotovaru) a vjezdy mířily na
  povrch, který v rozsahu vůbec není (reálný nález na díle uživatele: rozsah
  Z 108–195,6, kde polotovar sahá do X≈48, vygeneroval průchody na X≈65
  a X≈59 — řez vzduchem). Kolize se dál hlídají proti **celému** polotovaru:
  obálka držáku, validátor i model úběru pracují s neořezanou geometrií.
- CAM (podélné hrubování): přepínač **„Hrub. bez schodků | i u čelního" platí
  i v podélném hrubování.** Dosud ovládal jen čelní strategii a v podélné se
  dojezdy po čele nedaly vypnout jinak než vypnutím celého „bez schodků".
  Nezaškrtnuté „i u čelního" teď vynechá dojezd po **čelní (radiální) stěně** —
  tedy tam, kde dojezd stoupá v X víc, než ujede v Z; průchod u takové stěny
  skončí a odskočí a schod dobere čelní operace. Typicky jde navíc o „čelo",
  které vzniklo **mezní čárou hlídání destičky** (stěna má přesně úhel plátku),
  takže dojezd po ní jen kopíroval limit plátku a nic neubral. Dojezdy po
  kuželových a válcových stěnách i dokončení ramp/kapes zůstávají beze změny
  (jinak by pod ořízlou rampou zůstal stát klín materiálu).

### Fixed
- CAM (podélné hrubování): **rychloposuv už neprojíždí polotovarem mezi
  zanořovacími kroky.** Krok dorampování strmé stěny se řetězí — druhý a další
  krok se jen odskočí a rychloposuvem se v aktuální hloubce vrátí na konec
  rampy toho předchozího. Heuristika „pravých stěn kapes" (Hlídání geometrie
  destičky) ale brala kroky řetězu jako samostatné bossy, a to **napříč celým
  dílem**: krok v jednom údolí posunul začátek kroku v údolí o 120 mm dál tak,
  že mu `zStart` spadl pod `zEnd` a průchod se celý smazal. Osiřelý návrat pak
  jel z místa, kde nástroj právě skončil, skrz neobrobený materiál (na dílu
  uživatele `G0 Z` přes 430 mm² odlitku, ⛔ oranžová kolize v náhledu). Kroky
  řetězu jsou nově z heuristiky vyňaté — stejně jako dřív vjezd na hranici
  rozsahu Z. Na regresních fixtures tím zmizely i všechny ostatní kolize téhož
  původu (part-11/12: 501 mm² → 0, pocket-wall-at-plunge-angle: 163 → 0) a
  vrátily se smazané průchody, tedy i materiál, který dosud zůstával stát.
  Pojistka: `tests/cam-ramp-chain.test.js` (žádný `pocketReposition` bez
  předchůdce).
- CAM (náhled): **na plátně nezůstávají „duchové" drah.** Průchody z
  `calc.passes` jsou jen před-emisní odhad — skutečnou dráhu (segmentace podle
  siluety odlitku, ořez konců na hranici materiálu, zkrácené rampy) zná až
  emise a kreslí se ze `simPath`. Dojezdy a náběhy se přitom kreslily z passes
  vždycky, takže po ořezu konců visely za dráhou čáry, které v programu vůbec
  nejsou. Nově se passes kreslí jen dokud `simPath` neexistuje (před
  vygenerováním drah).
- CAM (podélné hrubování): **průchod končí na hraně materiálu, ne až na konci
  okna.** Řezný interval se plánuje z obdélníkového obalu, takže mohl sahat
  desítky mm za skutečný polotovar — nástroj pak po posledním řezu ještě
  přejel prázdnem na konec intervalu, tam pustil posuv o Vůli Z a teprve pak
  odskočil (na dílu uživatele odjížděl až za osazení Ø47,6 na Z 172,5, ačkoli
  materiál končí na Z 142). Koncový vzduch se nově zahazuje: průchod dojede na
  hranu odlitku a navazující dojezd ho posune na **vůlí-posunutou siluetu** —
  „tečkovanou" čáru z náhledu. Totéž platí pro dojezd „bez schodků": sledování
  kontury se ořeže tam, kde nad nástrojem přestává být polotovar (úseky celé
  ve vzduchu se zahodí, ten hraniční se zkrátí interpolací).
  - Odebraný materiál se nemění — ověřeno na všech 17 regresních dílech
    (zbytková plocha po projetí dráhy ± 0,0 mm²); mizí jen jízda vzduchem.
    Na dílu uživatele 3,90 → 3,70 min a 2,44 → 2,25 m dráhy.
  - Platí pro obě strany hrubování; snapshoty 10 dílů se proto změnily.
- CAM: **hrubování „→ Zleva" nyní umí přesně to samé co „← Zprava",
  jen z druhé strany.** Druhá strana dosud jela zjednodušenou v1 strategií:
  počítala s **válcovým** polotovarem (u odlitku tedy hrubovala vzduch),
  ignorovala siluetu polotovaru, neuměla kapsy, zanořovací rampy, dojezdy
  „bez schodků" ani obálku držáku, a hlídání geometrie destičky se navíc
  počítalo pro **pravý** nůž, takže i obrobitelná kontura vycházela pro
  špatnou orientaci. Na testovacím dílu z toho vzniklo 41 průchodů táhnoucích
  se přes celý díl.
  - Řešení: „zleva" **není vlastní algoritmus** — je to zrcadlo. Celý CAM
    svět se na vstupu výpočtu překlopí v ose Z (`cam/zMirror.js`), spočítá se
    obyčejné hrubování zprava se standardním nožem a výsledek se překlopí
    zpět. Zleva tak platí beze zbytku všechno, co umí pravá strana — včetně
    dosažitelnosti destičky, mezních čar, kapes, ramp a booleovského
    hrubování. Emise G-kódu obrací nájezd, dojezd i odskok podle jediné
    proměnné směru řezu.
  - Na témže dílu: 25 průchodů po regionech se zanořovacími rampami a dojezdy
    po kontuře, počet hlášených problémů 13 → 2 (obě jen informativní
    o dosahu destičky).
  - **Hrubovací offset zleva leží zase VNĚ kontury.** Offset úsečky se počítá
    z levé normály směru jízdy, takže vychází ven jen u kontury kreslené od
    pravého čela doleva. Po překlopení běžel řetěz bodů obráceně, a offsety
    ÚSEČEK proto spadly dovnitř dílu — venku zůstaly jen oblouky, které si
    stranu detekují z geometrie (odtud „offsetová čára sedí jen u rádiusů").
    Dráhy pak zajížděly do hotové kontury a rozházené byly i mezní čáry
    hlídání destičky. Zrcadlení teď řetěz bodů i **obrací** (typ pohybu
    a rádius patří k úseku DO bodu, takže se posouvají o jedna).
  - Paritu hlídá nový test `tests/cam-backside-mirror.test.js` (týž díl zleva
    == geometricky zrcadlený díl zprava, průchody i G-kód, s dokončováním
    i bez; k tomu kontrola, že hrubovací offset na obou stranách leží vně
    kontury) a regresní fixtures `part-11-zleva-casting.camprog`
    a `part-12-zleva-step.camprog`. Pravá strana zůstává bit za bit stejná —
    žádný existující snapshot se nezměnil.
- CAM (podélné hrubování): **zablokovaný průchod dojede až na offsetovou
  čáru.** Obálka držáku si drží bezpečnostní rezervu 0,1 mm od zakázané
  oblasti — jenže tou oblastí je i silueta offsetu, takže se rezerva
  uplatnila i tam, kde průchod prostě končí na stěně kontury: **každá vrstva
  stála 0,1 mm před offsetovou čárou** a nechávala tam materiál navíc (reálný
  nález na díle uživatele — nejvíc vidět na čele vzniklém mezní čárou
  destičky). Rezerva nově platí jen pro **překážku za koncem průchodu**
  (držák), ne pro špičku na offsetu; přídavek na stěně tak odpovídá přesně
  zadaným přídavkům X/Z.
- CAM (podélné hrubování): **za odlitkovým hrbem se nástroj zanoří sám** — dřív
  se takové hloubky celé zahodily a menší průměry zůstaly nehrubované. Kotva
  zanořovací rampy sedí na povrchu nad vjezdem; když napravo od obráběné zóny
  stojí hrb (velký průměr), vyšla rampa od jeho povrchu desítky mm dlouhá,
  nevešla se do Z-okna a průchod vypadl (i sken intervalů ho u hrbu zavrhl
  kvůli mezním čarám držáku). Obejít se to dalo jen ručním posunutím **Startu
  rozsahu Z** doleva až za hrb. Nově — kdykoli je zapnuté **Zanořování**, ne
  jen na hranici rozsahu 📐 — se vjezd posune sám na nejpravější místo,
  kde nástroj stojí na offsetové čáře polotovaru (Přídavek X/Z polo.), rampa
  odtud na hloubku dosáhne a vedle se **vejde držák** — v celém svém axiálním
  dosahu od špičky s 1 mm volného prostoru od té čáry (reálný nález na díle
  uživatele: dráha vygenerovaná automaticky se kryje s tou, kterou uživatel
  dostal ručním Startem rozsahu Z 174,6). Takové zanoření se navíc v pořadí
  odloží až za průchody na větších průměrech, aby se hrubovalo odshora dolů
  a nezačínalo zanořením.
- CAM (podélné hrubování): **konec rozsahu obrábění 📐 platí i pro dojezdy
  a rampy, nejen pro samotný řez.** Řez vrstvy hranici držel (`effZMin`), ale
  sledování obrysu (`findLeadOutEndZ`, `findPocketExitZ`) i cíl rampy
  (`findRampOutTarget`) si za dno braly polotovar / siluetu odlitku — dojezd
  schodu a dokončení ořízlé rampy proto rozsah přejely o desítky mm (reálný
  nález na díle uživatele: konec rozsahu Z 61,1, dojezd na Z 42,1 a rampa až
  na Z 21,4). Nově je konec rozsahu tvrdé dno (`traceFloorL`) a rampa se na
  něm zastaví stejně jako na stěně kontury.
- CAM (podélné hrubování): **výjezd z materiálu končí na offsetové čáře
  polotovaru, ne na holé kůře.** Dojezd se odsazoval jen podél OSY Z
  (`zEnd − Přídavek Z`), jenže offsetová (tečkovaná) čára je posunutá KOLMO
  k hranici — na šikmé/obloukové hraně odlitku proto dráha viditelně stála
  uvnitř přídavkového pásma (reálný díl uživatele: na oblouku R18 chybělo
  0,6 mm) a u dojezdu „bez schodků" se neodsazovalo vůbec (chybělo 1,2 mm).
  Konec řezu se teď hledá jako průsečík vůlí-posunuté siluety s hloubkou
  průchodu (`offsetExitZ`, strop 4× přídavek pro hrany skoro rovnoběžné s osou
  Z) — a nově dojíždí i „bez schodků" dojezd, pokud končí AXIÁLNÍM úsekem
  (šikmý/obloukový konec leží na stěně kontury, tam by pokračování řezalo do
  dílu). Materiálu se tím neubere víc — jde o pohyb v přídavkovém pásmu.
- CAM (podélné hrubování): **poslední krok řetězu ramp na STRMÉ stěně přišel
  o dojezd schodu.** Napojení dojezdu se testovalo `traceIfContinuous` s pevnou
  tolerancí 0,1 mm, jenže konec průchodu bere booleovská větev ze VZORKOVANÉ
  geometrie — na stěně se sklonem ~3,7 je desetina mm v Z skoro půl mm v X, tak
  se dojezd zahodil celý (reálný nález na díle uživatele: „dojelo to přímo pod
  zanořováním k čelu a odskok"). Kontrolu přebírá existující ořez podle hloubky
  průchodu; emise stejně jede jen KONCOVÉ body segmentů, takže rozhoduje první
  koncový bod a ten musí ležet nad hloubkou průchodu.
- CAM (podélné hrubování): **dojezd „bez schodků" sjížděl mezní čáru plátku
  jedním úsekem hluboko pod hloubku vlastní vrstvy.** Mezní čáru „stínu" břitu
  (`buildMachinableContour` ji vkládá místo oblouku, na který plátek nedosáhne)
  klesá PŘESNĚ pod úhlem zanoření — u automatického úhlu je totiž
  `effPlungeDeg = |Natočení|` plátku, tedy TÝŽ úhel, pod kterým se mezní čára
  konstruuje. Ostré porovnání v `findSteepCorner` na ní kvůli zaokrouhlení
  dopadalo o ~1e-5 relativně pod mez, takže se roh strmé stěny nenašel NIKDY a
  rampa ořízlá na Hloubku (ap) se vůbec nespustila: dojezd sjel celou stěnu
  naráz (reálný díl uživatele: 4,5 mm v X pod hloubku vrstvy, záběr proti
  polotovaru přes ap). Mez se teď porovnává s tolerancí 0,1 % tangenty (≈0,06°
  při 15°). Vrstva díky tomu zůstane na své hloubce, dojede rovně na stěnu
  kontury a klín pod mezní čárou dobere samostatný průchod rampou ≤ ap.
- CAM (podélné hrubování): **poslední krok řetězu ramp na hranici rozsahu Z
  nedojel schodek.** Krok kratší než Hloubka (ap), který řetěz uzavírá (vzniká
  bisekcí pod poslední plnou hloubkou), dosedl na konturu a hned odskočil —
  schod vůči kroku nad ním zůstal stát. Teď ho dobere sledováním obrysu stejně
  jako běžný průchod „bez schodků" a poslední krok dokončení ořízlé rampy.
- CAM (podélné hrubování): **rampa dojezdu „bez schodků" podjížděla hotovní konturu.**
  `findRampOutTarget` hledala konec rampy jen podle SILUETY POLOTOVARU — hotovní
  konturu netestovala vůbec, takže na dílu, kde za údolím kontura zase stoupá,
  vedla rampa (a navazující dokončovací kroky ap) přímkou SKRZ díl. Rozsah:
  **6 z 12 fixtures mělo zajezd 42–44 mm** (rampa dojela až na X≈−1, tj. za osu),
  reálný díl uživatele 18 mm. Rampa se teď zastaví na offsetu hotovní kontury
  (konec dopřesněn půlením); stejné omezení dostaly i rovné úseky dokončovacích
  kroků. Nová pojistka `tests/cam-gouge-invariants.test.js` (model-free nad
  emitovanou dráhou) tuhle třídu chyb zamyká — na starém kódu padá na 8 z 10
  podélných fixtures. Zbytkový materiál na fixtures tím ROSTE: šlo o materiál
  HOTOVÉHO DÍLU, který se nikdy odebírat neměl.
- CAM (podélné hrubování): **dojezd po dosednutí rampy dobere schodek přes celé
  údolí a dojede po hotovní kontuře.** Rovné pokračování na hloubce průchodu
  mířilo jen k Z, kam mířila rampa (rampa je přitom jen VJEZD do vrstvy, ne její
  konec); po dosednutí navíc vrstva končila nasucho a mezi ní a hotovní konturou
  zůstal stát klín. Teď jede rovně až na stěnu kontury a odtud dobere schod
  sledováním obrysu — jak vrstva s rampou, tak poslední krok dokončení rampy.
  Dojezd se použije jen když NAVAZUJE na aktuální polohu: u zápichu/kapsy má
  kontura na tomtéž Z víc větví a `traceOffsetPath` může začít na jiné, což by
  emitovalo svislý sjezd skrz materiál (chyceno na part-10).
- CAM (podélné hrubování odlitku): **vrstvy se berou od největšího průměru, dělení
  podle kontury — ne podle středu údolí polotovaru.** Dvě příčiny:
  (1) **Vjezd průchodu ve vzduchu** — okno regionu / rozsahu 📐 mohlo začínat nad
  údolím odlitku, takže se vjezd posuzoval desítky mm mimo materiál: obálka držáku
  tam zahodila i fyzicky bezpečný průchod (vypadla celá vrstva u NEJVĚTŠÍHO
  průměru) a region bez materiálu vydával prázdný průchod, ze kterého v G-kódu
  zbyl jen dojezd („trojúhelník" uprostřed údolí). Vjezd se teď ořízne na hranici
  reálného materiálu podle **vůlí-posunuté siluety** (tečkovaná hranice, `passEntryZ`).
  (2) **Zbytečné dělení na regiony** — údolí odlitku dělilo dráhy i tam, kde je mezi
  hrby jen vzduch, takže se nejdřív udělala celá PRAVÁ strana a teprve pak levá,
  i když vlevo byl větší průměr. `splitIsNeeded` teď hranici zahodí, když sloučený
  zátah dojede stejně hluboko jako samostatný region: vrstva jde odshora dolů přes
  obě strany, vzduch přeletí rychloposuvem a doleva pokračuje jen tam, kam pustí
  offset hotovní kontury. Zbytkový materiál shodný nebo lepší na všech fixtures
  (izolovaně měřeno, `regionRoughing` ON i OFF), průchodů méně; snapshoty obou
  regresních sad vědomě přegenerovány. Viz `docs/geometry-libs-migration.md` (Fáze 4).

### Added
- CAM: **rozklad vrstvy na komponenty + G-kód pojistka booleovské větve (migrace
  Fáze 3, krok 3A)** — `extractLayerComponents` v `booleanRoughing.js` rozloží
  hloubkovou vrstvu na KOMPONENTY (smyčky pásu `[xLo,xHi]∩zbytek`) a per komponentu
  vydá Z-rozpětí, `floorIntervals` (ploché řezné intervaly na dně = dnešní emise) a
  `bottomEdge` (min-X hrana = řezná dráha z HRAN pro krok 3C; přepínač `withEdge`);
  helper `loopBottomXAtZ`. Testy `tests/boolean-layer-components.test.js`. Nový
  `tests/cam-boolean-gcode-regression.test.js` přišpendlí PŘESNÝ výstup booleovské
  větve (dosud ji hlídala jen material-parita) — nutná síť pro restrukturaci.
  **Nález měření:** booleovská cesta dnes odebírá materiál identicky jako scan-line
  na všech fixtures (Δ ≤ 1,5 mm²); scan-line má úplné pokrytí dosažitelného
  materiálu → přínos kroku 3C je kvalita PŘEJEZDŮ, ne pokrytí (per-hloubka
  komponenty ověřeně NEjsou output-ekvivalentní s plochými intervaly — mění G-kód 2
  fixtures, patří do 3C). Nemění G-kód ani snapshoty. Viz
  `docs/geometry-libs-migration.md`.
- CAM: **hrubovací dráhy z booleovské geometrie za příznakem (migrace Fáze 3)** —
  nový modul `js/calculators/cam/booleanRoughing.js` (čisté funkce nad Clipper2):
  zbytkový materiál `= obal polotovaru − oblast dílce` (`buildResidual` /
  `polyDifference`), vrstva `= zbytek ∩ pás [xLo,xHi]` s **regiony zadarmo**
  (`sliceLayer` / `polyIntersect`), řezné Z-intervaly na hloubce paritou
  průsečíků (`layerZIntervalsAtX`). Oblast dílce vzorkuje `offsetXAt(z)`
  (`sampleOffsetRegion` — věrně jako scan-line, robustní k chainBreakům
  offsetPath). **Napojeno do `genLongPasses` za příznakem `booleanRoughing`**
  (default false = scan-line, kryté snapshoty): zapnuto odvozuje řezné intervaly
  podélných průchodů z booleanů; obálka držáku (`applyHolderClamp`) sdílená oběma
  cestami. Ověřeno na 6 podélných fixtures, že booleovská cesta odebere STEJNÝ
  materiál jako scan-line (part-1 Δ<5 mm²), dojede na stejnou hloubku, bez
  hard-error (`tests/boolean-roughing.test.js`, `tests/boolean-roughing-wiring.test.js`).
  G-kód default cesty ani regresní snapshoty se **nemění**. Příznak lze zapnout
  v panelu CAM simulátoru (tab Hrubování → „Booleovské hrubování (exp.)"). Viz
  `docs/geometry-libs-migration.md`.
- CAM: **regiony hrubování z geometrie (migrace Fáze 3, krok 2)** — nová funkce
  `computeResidualRegions` v `booleanRoughing.js` detekuje „údolí" (odlitkové hrby
  / stěny) jako lokální minima horní hrany siluety polotovaru a vrací splity
  `[{z, xSurf}]` ve stejném formátu jako ruční detekce. Napojeno do
  `genLongPasses.computeRegions` za příznakem `booleanRoughing` (jen s
  `regionRoughing` + odlitek); ruční detekce (`manualRegionSplits`) i booleovská
  (`booleanRegionSplits`) sdílejí `assembleRegions`. Ověřeno
  `tests/boolean-region-roughing.test.js` (part-10-zapich-casting: booleovské
  splity ≈ ruční, materiál-parita StockModel sweepem). Test-izolace: headless
  harness (`camHeadless`) resetuje experimentální příznak `booleanRoughing` na
  každý běh (jinak prosákl singletonem `S` mezi fixtures → flaky snapshot drift).
  Detekce bere signál ze SILUETY polotovaru (ne ze zbytku `stock−dílec`):
  komponenty zbytku mají i opačný směr splynutí (kapsa dílu — oddělena hluboko,
  splyne mělko), který legacy region model (zHiSurf/zLoSurf) neumí a nechal by
  stát materiál (na holder-region-roughing +121 mm² pod z≈22,9). Silueta =
  stejný signál jako ruční detekce → bez regrese pokrytí (holder i part-10:
  splity i Z-obálka/hloubka identické s ruční cestou). Obecné residual-
  komponentové regiony (kapsy dílu, obousměrné splynutí) patří až do
  restrukturace emisní smyčky (samostatná budoucí iterace).

### Fixed
- CAD: **"Vybarvit" nedokázalo poskládat otevřenou konturu/polotovar dotažené
  k ose rotace, když segmenty nebyly ve `state.objects` v topologickém
  pořadí** (`js/tools/fillClick.js`) — `buildClosedLoops` řetězila segmenty
  jen dopředu (na konec); od "prostředního" segmentu tak doroste jen k
  jednomu konci a druhý (i osu dotýkající) zůstane nenapojený → nahlášeno
  jako "Klikněte dovnitř uzavřeného obrysu" i u vizuálně uzavřeného profilu.
  Řetězec teď roste OBOUSMĚRNĚ (i na začátek), stejný vzor jako už měl
  `_chainSegments` v `stockTools.js`. Když se konturu i tak nepodaří uzavřít
  (skutečná mezera mimo toleranci), nově se vyznačí existujícím indikátorem
  „Mezera" (`⊗ Mezery v kontuře`) místo jen obecné hlášky. Zpevněn i test
  vnoření děr (mezikruží kontura/polotovar): používal bod `l[0]` smyčky, což
  je u profilu dotaženého k ose typicky bod NA ose — přesně na hraně
  obalové smyčky, kde je ray-casting numericky nespolehlivý; nahrazeno
  bodem nejdál od osy. `tests/fillClick.test.js` (24 testů).
- CAM: **schod bez dojezdu u „Hrub. bez schodků" — sada oprav podélného
  hrubování strmé stěny/bossu** — reálný nález na díle uživatele: jedna
  vrstva u strmé stěny (boss) uměla skončit úplně bez dojezdu (viditelný
  neobrobený schod), protože otevřený řez vynechal svůj dojezd s tím, že
  navázání dokončí samostatný blok „dobrat kapsu najednou" za bossem — ten
  ale uměl tiše selhat (`cornerAlreadyRampedOut` mylně bral roh za „už
  hotový" po velkém skoku hloubek, nebo obálka držáku zablokovala
  dočišťovací průchod). Postupně opraveno (`roughingStrategies.js`,
  `gcodeEmit.js`):
  - **Podélné hrubování se za stěnu/boss v rámci jedné hloubkové vrstvy
    už vůbec nedívá.** Celý blok „kapsa za bossem" (`idx≥1` v
    `intervals.forEach`, `pocketFollowsNow`/`pendingPocketFallback`,
    nepoužívaný helper `findOffsetXCrossing`) byl odstraněn — otevřený
    řez vždy jen dojede svůj vlastní krátký/lokální schod po obrysu.
    **Vedlejší efekt (vědomý, potvrzený uživatelem):** kapsy/zápichy
    ohraničené stěnami z OBOU stran uprostřed polotovaru už podélné
    hrubování nedokopává (`tests/cam-holder.test.js` upraven) — patří
    jiné operaci/nástroji.
  - **Rampa u strmé stěny (`findSteepCorner`/`findRampOutTarget`) nesmí
    v jednom souvislém záběru sebrat víc materiálu, než je nastavená
    Hloubka (ap).** Cíl rampy se ořízne na `currentX` a odtud pokračuje
    ROVNĚ (jako běžný řez vrstvy) až na původní (neořízlý) cíl — dojezd
    tak pokryje stejný Z-rozsah, jen hlubší část nechá na následující
    vrstvě.
  - **Dokončení ořízlé rampy** — po skončení hloubkové smyčky regionu se
    doplní samostatný dokončovací zákrok, rozdělený na kroky ≤ Hloubka
    (ap) s odskokem/rychloposuvem mezi kroky (`pocketReposition`, stejný
    vzor jako dřívější „dobrat kapsu najednou"), aby se klín materiálu
    pod ořízlou rampou nenechal navždy neobrobený.
  - **`findRampOutTarget` cílí na vůlí-posunutou (offsetovou) siluetu
    odlitku** (`polyOffset` nad `stockLoopL`, stejná offsetová čára jako
    `castingTopXAtZOffset` v `gcodeEmit.js`), ne na syrovou siluetu se
    skalárně odečtenou vůlí na konci — to na diagonále není totéž co
    posun kolmo k hranici a systematicky to minulo offsetovou čáru.
  - **`noteCutPass(pass)` (odečtení odřezaného materiálu z dynamického
    modelu zbytku) se u podélného hrubování volá PŘED kontrolou kolize
    pro dojezd o Vůli Z**, ne až na konci zpracování průchodu — jinak
    kontrola narazila na fantomový zbytek vlastního, ještě „nenote'ovaného"
    záběru a zbytečně netiskla bezpečný dojezd, i když za koncem řezu byl
    prokazatelně vzduch.
  Vědomě přegenerované snapshoty (scan-line i booleovská větev).
- CAM: **sjezd na hloubku v solidním odlitku posuvem místo rychloposuvu (migrace
  Fáze 4)** — nájezdová vůle `zApprox` je „vzduch" jen vůči kontuře, ale obal
  odlitku tam může být ještě plný, takže rychloposuv na cílovou hloubku vjížděl
  do materiálu. `descendTo` v `safeRapidTo` (`gcodeEmit.js`): když sjezd reálně
  naráží na zbytkový polotovar (gate `rapidHitsStock` — stejný práh 0,5 mm² jako
  jinde, skin-grazing pod prahem se nechytá → cylindry beze změny), rychloposuv
  se zastaví na povrchu zbytku + vůle (nový helper `residualTopXAtZ`) a zbytek
  dojede pracovním posuvem. **Endpointy řezu beze změny** (žádný materiál navíc);
  nejvíc pomohlo holder-region-roughing (descend do odlitku → posuv), snapshoty
  4 fixtures vědomě přegenerovány. Zbývající part-10 grazing je RETRACT nahoru
  (výjezd skrz kůru nad zápichem) — jiný směr, patří k odloženému dynamickému
  plánování. Viz `docs/geometry-libs-migration.md` (Fáze 4).
- CAM: **marný a nebezpečný descend-back v nájezdu hrubování (migrace Fáze 4)** —
  dvoufázový nájezd podélného hrubování (`safeRapidTo(cur.x, zApprox)` = přejezd
  v Z, pak `safeRapidTo(pass.x, zApprox)` = sjezd na hloubku) u čistě-Z fáze,
  která se musela kvůli materiálu zvednout nad konturu, sjížděl rychloposuvem
  ZPĚT na původní hluboké X — a druhý nájezd ho hned zase zvedl. Na odlitku
  (part-10-zapich) to znamenalo rychloposuv skrz ~25 mm² stojícího materiálu za
  zápichem. Opraveno v `gcodeEmit.js` (`safeRapidTo`): čistě-Z přejezd, který
  zvedl nad konturu, už NEsjíždí zpět — nástroj zůstane nahoře a navazující
  nájezd sjede rovnou na skutečnou hloubku (přesně „vyjet rychloposuvem nad
  polotovar, přejet v Z, sjet tam"). **Řezná geometrie beze změny** — diff je
  jen odebrané `G0 X…` rychloposuvy, žádný přidaný ani změněný řezný pohyb;
  vědomě přegenerované snapshoty 9 fixtures. Nový semantický test
  `tests/cam-traversal-invariants.test.js` (X-profil běhu rychloposuvů musí být
  unimodální — nikdy „údolí" sjezd-a-znovu-výjezd) padá na 9 fixtures před fixem.
  Viz `docs/geometry-libs-migration.md` (Fáze 4).
- CAM: **hang booleovského hrubování na dlouhém odlitku s držákem** —
  `buildResidual` (`booleanRoughing.js`) volal Clipper2 `polyDifference` na
  hustě vzorkované smyčce oblasti dílce (offset po 0,2 mm přes velký Z-rozsah →
  ~850 téměř-kolineárních bodů), na které Clipper2 u některých tvarů
  (holder-region-roughing) degeneroval do zacyklení/extrémně pomalého běhu.
  Přidáno lehké zjednodušení vstupu (`polySimplify`, ε 0,01 mm — hluboko pod
  řeznou tolerancí, plocha beze změny): difference doběhne v jednotkách ms.
  Latentní od napojení intervalové cesty (příznak `booleanRoughing`), odhaleno
  až regiony z geometrie (krok 2), které holder plně provedou intervalovou
  cestou.

### Changed
- CAM: **sjednocená kolizní oblast nástroje pro mezní čáry (migrace Fáze 2b/3)** —
  `computeInterferenceGuides` / `buildHolderBoundaryPts` počítají mezní čáru ze
  SJEDNOCENÉ zakázané oblasti špičky `F_all = (dílec ⊕ −držák) ∪ (dílec ⊕ −TĚLO
  destičky)` přes nový `buildToolForbiddenRegion` (`js/calculators/cam/toolEnvelope.js`)
  místo dřívější držák-only oblasti. Obrys destičky staví `insertWorldLoop` nad
  sdíleným `buildInsertProfileSegments` (nově exportováno z `insertPreview.js`).
  **Tělo destičky** přidává kolizi jen u tvarů bez úlevu boku — **upichovák**
  (`parting`, šířka b); obrys se morfologicky otevře o R (odstraní aktivní nos).
  **Polygon a round** zůstávají na analytické hraně (zadní hrany polygonu mají
  úlev, round je celá aktivní nos), takže se u nich chování NEMĚNÍ — F_all je
  u nich bit-identická s dřívější oblastí. Aktivní břit není nikdy v F (bere se
  HRANICE dosažitelné oblasti). Regresní G-kód snapshoty **beze změny** (fixtures
  jsou polygon/round). Nové testy `tests/insert-forbidden-region.test.js` +
  charakterizace `tests/holder-boundary.test.js`. Viz `docs/geometry-libs-migration.md`.
- CAM: **refaktoring `camSimulator.js` (10 321 → 8 432 řádků, Fáze B)** —
  výpočetní jádro vytaženo z `openCamSimulator()` do dvou modulů:
  `js/calculators/cam/calculatePipeline.js` (`computeCalculation(S, …)` —
  bývalé `calculate()` + `roughingKey`/`getRoughingOperations`) a
  `js/calculators/cam/gcodeEmit.js` (`generateAutoGCode(S, calc)` + `generateGCode`,
  `ctrlCmt`, `buildControlHeaderLines`/`Tail`, `controlArcFormatter`,
  `renumberGCodeLines`, `convertGCodeControlSystem`). Funkce dostávají sdílený
  stav `S` explicitním argumentem; v `openCamSimulator()` zůstávají tenké
  wrappery pod původními jmény, takže všechna volající místa i headless
  test-capture (`{ S, calculate, generateAutoGCode }`) fungují beze změny.
  Housekeeping přesun beze změny chování — ověřeno 834 testy + regresní G-kód
  snapshot (`tests/cam-gcode-regression.test.js`) beze změny. Prelude obou
  harnessů (`tests/helpers/camHeadless.mjs`, `camInternals.mjs`) doplněn o nové
  moduly. `draw()` a blok event-handlerů (~2 300 ř.) zůstávají v `camSimulator.js`.
- CAM: **refaktoring `camSimulator.js` (13 435 → 10 321 řádků, Fáze A)** —
  čisté top-level funkce vytaženy do `js/calculators/cam/`:
  `camSimulatorDialogs.js` (camConfirm/camOffsetDialog/…),
  `camSimulatorStyles.js` (injectCSS), `camDefaults.js` (_defaultCamParams),
  `threadHelpers.js` (threadProfileDepth/computeThreadPassCuts/partOffGeom),
  `gcodeParser.js` (parseManualGCodeToPath/buildStockPointsFromCanvas/…),
  `contourBuild.js` (buildMachinableContour a celá pipeline mostů/ořezu
  kontury), `insertPreview.js` (kreslení destičky/držáku + HTML pole tvaru),
  `camToolPicker.js` (knihovna nožů/zásobník). `camMath.js` rozšířen o
  segmentové/obloukové primitivy (dřív duplicitně v camSimulatoru). Čistě
  housekeeping přesun beze změny chování — ověřeno 834 testy + regresní
  G-kód snapshot (`tests/cam-gcode-regression.test.js`) beze změny + vizuálně
  v běžící appce. `openCamSimulator` (dráhy/kreslení/UI, ~10 100 ř.) zůstává
  beze změny — samostatná budoucí Fáze B.
- CAM: **"Dobrat naráz" checkbox removed** — pockets are always finished to
  the bottom (incremental ramp-in per depth cannot reach the floor of a deep
  narrow pocket, so the burst dig is now permanent). Old projects with the
  flag saved either way are normalized in `calculate()`
- CAM (casting): interference-guide lines from insert geometry are now
  **clipped at the stock boundary** — when the reflected tool silhouette
  exits the casting skin into a valley, the guide ends on the stock offset
  (+ vůle X, `downClipped`) instead of continuing through air; the
  machinable-contour bridge below such an anchor replaces the shadowed wall
  and hard-breaks (rapid) to the next segment across the valley, so the void
  is no longer treated as contour and "machined". Fixes valley walls being
  cut as if the valley were solid stock
- CAM (casting): longitudinal roughing **enters the stock skin by ramping**
  from the stock boundary (`stockEntryRamp`, at the plunge angle from the
  tip×boundary intersection) instead of plunging perpendicularly — applies to
  open, flat and pocket passes whose entry lies in the casting crust
- CAM (casting, region roughing): valley split points now only apply **above
  the valley floor** — in the crust depth the neighbouring regions merge, so
  the valley is roughed from the real material edge instead of being halved
  and each half machined toward the split as if solid

### Added
- CAM (simulace): **oranžové varování na kolizi držáku** (🟧) — během simulace
  se podél projeté dráhy navléká stopa obrysu držáku a její průnik se
  zbývajícím materiálem (co destička ještě neodebrala) se AKUMULUJE do jedné
  oblasti, která zůstává oranžová i po přejetí — je vidět, kudy všude se držák
  vnořil do polotovaru/obrobku. Nový akumulátor `HolderGouge`
  (`js/calculators/cam/holderGouge.js`, obdoba `MaterialRemoval`) drží vlastní
  kopii zbytkového polotovaru, takže kanál po destičce nehlásí jako kolizi;
  přepínatelné tlačítko, stav `showHolderCollision` se ukládá do localStorage
  i projektu. Testy `tests/cam-holder-gouge.test.js`
- CAM: dynamic rapid-move planning (Phase 4 core of the geometry-library
  migration) — G-code emission now maintains a live remaining-stock polygon
  (`StockModel`, cut pass-by-pass via `noteCutPass`) and every direct rapid
  is tested by sweeping the insert footprint against the CURRENT remaining
  material; a hit routes the move up over the stock, across in Z, and back
  down (the ordering problem static blockers cannot see). Rapid stop points
  are now measured from the tool EDGE (`clearance + tool radius`) instead
  of the tip centre — with vůle < R the nose used to rub the stock by
  R − vůle on every approach (the ~1 mm² grazes the validator kept
  reporting). Open-ended passes exit the material at working feed for the
  Z clearance distance before retracting (per spec). Isolated validator
  results: six longitudinal fixtures now report 0 rapid collisions and
  holder findings dropped to ordering-class residuals in pockets
- CAM: holder envelope for the finishing pass and contour-following traces
  (Phase 3b of the geometry-library migration) — finishing segments whose
  tip would put the holder inside remaining material are skipped like
  insert-unreachable segments (dotted, rapid over the gap, ⚠ warning);
  pocket lead-in/lead-out contour traces are trimmed against the envelope
  (the part-2 fixture's "face traced from the axis" ~343 mm² crash class);
  pocket intervals are clipped to the component window where the holder
  actually fits between the walls (`clampSpanTowardNegative` — matches the
  guides-v2 bent-boundary semantics; pockets narrower than the holder are
  dropped with a warning) and pocket-cleanup traces are clipped to that
  window. A soft (extra-eroded) forbidden region exists for
  allowance-skin-tolerant checks. Snapshots updated deliberately —
  removed/trimmed motions were validator-confirmed real holder collisions.
  Known remaining gaps (reported by the ⚠ validator, not yet prevented):
  face-strategy roughing, casting region-roughing obstacles, and
  ordering-dependent collisions (a trace running before neighbouring
  material is machined) — Phase 4 scope
- CAM: per-axis stock clearance ("Vůle X/Z (polotovar)", params `stockClearX`
  / `stockClearZ`, `null` inherits the legacy single `rapidClearance`) — the
  boundary where rapids end and working feed (G1) begins is now offset from
  the stock per-axis and drawn as a dashed line around the stock outline
  (cylinder and casting). Approach/retract emission, face-roughing entry,
  thread and part-off clearances all use the split values
- CAM: entering the stock at the Z machining-range boundary now ramps at the
  plunge angle from an anchor at the range-start × stock-boundary
  intersection (shared line across depths, like pocket ramps) instead of
  plunging perpendicularly into material; passes whose ramp doesn't fit are
  skipped. Covered by `tests/range-entry-ramp.test.js`
- CAM: warning in the ⚠ panel when the holder envelope drops passes
  ("Hlídání geometrie (držák): N průchodů vynecháno…")

### Fixed
- CAM: anisotropic contour offset (Přídavek X ≠ Přídavek Z) produced
  triangle artifacts at radius→short line→radius transitions and shifted
  arcs by max(aX, aZ) in both axes — arcs are now offset per-axis as an
  ellipse fitted back to G2/G3 arcs (`fitArcsToPolyline`), so offset ends
  meet adjacent line offsets exactly. Covered by
  `tests/offset-anisotropic.test.js`
- CAM: holder envelope (Phase 3a) reworked after real-path validation:
  `minkowskiSolidSum` orientation bug fixed (holes inside the forbidden
  region), obstacle silhouette is clipped to the stock and morphologically
  opened by the tip reach (thin final-surface skins are finishable and
  don't block the holder), and the staircase rule only records
  holder-clamped pass ends. Regression snapshots updated deliberately:
  the removed passes were verified as genuine holder collisions by the
  Phase 2 validator (e.g. facing to the axis with the holder over the part
  body, ~343 mm² interference on part-2)
- tests: `camHeadless.runCamProg` now returns `calcSim` — a second
  calculate() over the generated G-code, so `simPath` is the real
  simulated path (it was empty before, which silently blinded
  collision-validator assertions); the harness prelude now mirrors all real
  camSimulator imports (`makeHolderClamp` etc. were silently undefined)
- CAM: holder-aware pass clamping (Phase 3a of the geometry-library
  migration, `js/calculators/cam/toolEnvelope.js`) — longitudinal roughing
  pass ends are now limited by a forbidden tip region computed as the
  Minkowski sum of the offset-contour silhouette with the reflected holder
  outline (`geomCore.minkowskiSolidSum`), plus a staircase rule that keeps
  the holder clear of material left standing by shallower clamped passes.
  Active only with "Hlídat geometrii" on and a holder defined; clamped
  pass ends suppress the no-step contour lead-out. Regression snapshots
  are unchanged (fixtures are collision-free so the clamp never fires);
  a new cross-check test (`tests/holder-envelope-demo.test.js`) generates
  the demo part and asserts the Phase 2 collision validator finds no
  holder collisions in the roughing section. Finishing-pass holder
  clearance is a known gap left for Phase 3b
- CAM Simulator: independent collision validation of generated toolpaths
  (Phase 2 of the geometry-library migration,
  `js/calculators/cam/collisionValidator.js`) — walks the whole simPath
  block-by-block over an evolving remaining-stock polygon and reports to the
  "⚠ Nalezeny problémy" panel when (a) the holder outline (custom
  sideA/sideB profile or the width × length rectangle) sweeps through
  remaining material during a cutting move, or (b) a G0 rapid would drive
  the insert or holder through material. Uses Minkowski sweeps + boolean
  intersection (Clipper2) with a Detect-Collisions SAT broad-phase filter
  (manual AABB fallback), runs debounced (600 ms) after each path
  regeneration, gated by the geometry-guard checkbox. Existing
  interference-guide logic is untouched — this is a cross-check ahead of
  Phase 3. Covered by `tests/collision-validator.test.js` (10 tests)
- CAM Simulator: "Hlídat geometrii destičky" checkbox renamed to
  "Hlídat geometrii (destička + držák)" — it now also gates the holder
  collision validation
- CAM Simulator: visual material removal during simulation (Phase 1 of the
  geometry-library migration, `js/calculators/cam/materialRemoval.js`) — the
  stock is kept as a polygon (`StockModel`) and the tool-tip footprint swept
  along completed cutting moves (Minkowski sum, rapids excluded) is
  subtracted from it as the simulation plays. The remaining-stock polygon
  clips the CAD "Vybarvit" fills and the stock fill, so material visually
  disappears where the tool has cut. New ⛏ toolbar toggle (persisted in
  localStorage and project files, default on); incremental cutting with
  periodic simplification keeps playback smooth, rewinding recomputes from
  scratch. Covered by `tests/material-removal.test.js`
- Geometry-library migration groundwork (Clipper2 / Turf.js / Detect-Collisions):
  new adapter `js/geom/geomCore.js` — the single entry point for all geometry
  libs (CAM code never imports `lib/` directly). Wraps Clipper2 boolean ops,
  offsets, point-in-polygon, simplify and Minkowski tool sweep in the CAM
  `{x, z}` mm convention (precision 1e-4 mm), adds a `StockModel` class for
  incremental material removal / collision queries, and lazy loaders
  `ensureTurf()` / `ensureCollisions()`. Covered by `tests/geom-core.test.js`
  (11 tests). Migration plan: `docs/geometry-libs-migration.md`
- CAM Simulator: "⚙️ Geometrie" dialog for insert (VBD) + tool holder geometry,
  opened from the "Nástroj" panel — live 2D preview canvas
  (`drawInsertAndHolderPreview`), bidirectionally synced with the main panel,
  split into two switchable sub-tabs ("🔩 Destička" / "🗜 Držák"); preview is
  zoomable (mouse wheel or ＋/－, up to 12×) and pannable (drag), with a ⟲
  reset button; ↩/↪ undo-redo buttons share the CAM Simulator's existing
  history stack. Angle/dimension labels (ε, ∠, b, l1) render as HTML overlays
  and stroke widths use a `1/zoom` factor, so labels and lines stay crisp and
  constant-size at any zoom instead of ballooning with it
- Manual holder outline drawing (replaces the earlier ISO 5608 style-picker
  approach, which needed too much data entry for the common case of "hand +
  length + thickness"):
  - In-dialog: **✏️ Kreslit obrys** shows clickable anchor points on the
    insert in the preview (corners for square/diamond inserts, every 45° on
    round ones) — click one to start a side ("A"/"B"), then add points via
    Délka (mm) + Polární úhel (with the ✛ quick-angle compass), building up
    to ~6 segments per side (`S.params.holderProfile.sideA/sideB`,
    `getInsertAnchorPoints()`)
  - **📐 Kreslit na CAD plátně** (Držák tab): full CAD drawing of the holder
    outline on the main canvas. Backs up the current drawing (objects, layers,
    view, manual G-code) and restores it on ✕/✓, clears the canvas and creates
    two layers ("Plátek" / "Držák"). The insert is generated as **real, locked,
    red** LINE/ARC/CIRCLE geometry at the origin (round → circle R; polygon →
    2 edges + nose arc; parting → radius-to-edge), so ordinary CAD tools can
    **snap onto it** even though its layer is locked (`isToolInsert` snap
    bypass in `snapPt`/`findIntersectionAt`). The mode lives in
    `state.holderDrawMode` and survives tool switching (it is **not** tied to
    `state._toolCleanup`); it ends only via the bottom bar ✕ Zrušit / ✓ Potvrdit
    (visible on desktop too). Opening/switching to CAM while drawing is blocked
    with a toast. On confirm the holder is saved as a closed `holderProfile`:
    a fully closed contour is used as-is (mode A); an open two-sided sketch is
    auto-closed at 45° to the "Délka držáku (l1)" / "Tloušťka držáku" fields
    (mode B), with a ⇄ Strana button to switch which end is completed. The
    right-side layers panel stays visible during drawing so the two layers can
    be switched, and the holder is mapped screen-consistently — drawing it
    upward in CAD shows it upward in the preview. The auto-45° closing can be
    turned off with an **"Auto-doplnit držák (l1 × tloušťka)"** checkbox; when
    off the exact drawn (even open) shape is stored. Re-entering 📐 when a
    holder is already saved re-imports it as **editable** lines on the Držák
    layer (next to the locked insert), so it can be adjusted instead of redrawn
  - **🔧 Upravit obdélník** (Držák tab): in-preview editor for the default
    rectangular holder. Materializes the rectangle (holderWidth × holderLength,
    lifted above the insert) with three clickable yellow handles on the bottom
    edge (left corner / middle / right corner) and green insert anchors that now
    include a **🎯 Střed R** target at (0,0). Click a holder handle then an
    insert anchor to **move** the holder onto that point (e.g. bottom-left
    corner → insert radius center); **🔻 Srazit roh** chamfers a chosen corner
    by a given **size + angle** (45° = symmetric; other angles derive the second
    leg from the corner's interior angle); **🗑 Vymazat** resets to a clean
    rectangle. Pure geometry
    (`holderRectProfile`, `holderBottomHandles`, `translateHolderProfile`,
    `chamferProfileCorner`) is unit-tested (`tests/cam-holder-editor.test.js`)
  - Rotations split: **↻ Natočení destičky** (just the insert, `toolAngle`)
    moved to the Destička sub-tab; the Držák sub-tab gets **↻ Natočení nože**
    (`knifeAngle`) which rotates the whole tool — insert and holder together —
    in the preview. The knife angle is the direction the **insert points**
    (the compass arrow points toward the insert): 270° = default (insert down,
    holder up), 0° = insert right, etc. (internal preview rotation `R = 270 −
    knifeAngle`). The Destička sub-tab now hides the holder and fits the view
    to the insert
  - Preview draws `holderProfile` as connected polylines (starting at the
    insert edge) instead of the rectangle once it has points; **🗑 Smazat
    obrys** clears it. In drawing mode the preview fits to the insert and
    hides the holder body, so the clickable anchor points sit exactly on the
    insert edge (round: on the circle; square/diamond: at the edge tips)
- Tool library via projects: the project JSON (`_buildProjectData`, bumped to
  version 4) now stores the CAM tool geometry (`camTool`: insert
  shape/length/angle/tip-angle/radius/tip-flat/tip-mirror/VBD code + holder
  length/width/hand/profile). Loading a project transfers the saved tool into
  CAM ("Nůž z projektu přenesen do CAM" — applied to a live CAM session and
  seeded into the next one), so projects double as a knife library
  (`getCamToolGeometry`/`applyCamToolGeometry`, bridged to `projectManager`)
- Polygon insert: "⇄ Přehodit stranu" button — the vertex angle (ε) can open
  to either side of the polar angle (two geometrically valid mirror
  options); flips which one the preview draws instead of requiring the
  angle to be recalculated by hand (`toolTipMirror`, preview-only — does not
  affect the interference-guard calculation, which uses its own
  angle-symmetric model)
- ✛ quick-angle compass next to polar-angle fields (insert polar angle, the
  ↻ rotate popup, the outline-side popup) — same 3×3 popup (0/45/90/…) as the
  CAD's "🔢 Číselné zadání objektu" dialog (`wireAngleCompass`, reuses the
  existing `.angle-compass-popup`/`.compass-grid` CSS); the popup is given a
  high z-index so it opens above the full-screen dialog backdrops instead of
  behind them (previously the compass appeared unresponsive)
- VBD & Držáky dialog: holder code decoder now follows the real 7-position
  ISO 5608 structure (clamping, insert shape, style/κr, insert clearance
  angle, hand, height, width) instead of the previous simplified 6-position
  layout
- 4th default layer "Polotovar" (`STOCK_LAYER_ID = 3`, `js/state.js`) alongside
  Kontura/Konstrukce/Kóty, backfilled into older saved projects on load
  (`ensureStockLayer()`); `isStock` objects (Polotovar drawing mode, "Přídavek
  na plochu" generator, CAM "Odeslat do CADu", CNC-code-to-canvas reparse) are
  now assigned to it instead of silently sharing whatever layer happened to be
  active
- Vrstvy panel: clicking a layer's color dot now opens a small custom popover
  (`openLayerColorPicker()`, built on a shared `openColorPicker()`) with 7
  one-click rainbow presets and an explicit OK/✕ pair — replacing the bare
  `input[type=color]` swatch, whose native OS popup couldn't be styled,
  extended with presets, or reliably positioned: on narrow mobile viewports
  it rendered using desktop-scale coordinates and could open partly or
  entirely off-screen (browser chrome, outside CSS's control). "Vlastní
  barva" now toggles a fully custom, self-contained picker instead
  (saturation/value gradient square + hue slider + R/G/B number fields, HSV
  ⇄ RGB conversion helpers in `ui.js`) that always renders inside the same
  dialog, so it's correctly positioned at any viewport size. It also has its
  own 💧 eyedropper: hides the popover and lets you click an object on the
  canvas to reuse its color (`pickColorFromCanvas()`, same `click`/
  `touchend`-on-`drawCanvas` pattern as the existing "Vybrat z mapy" pickers
  in `numericalInput.js`/`objectDialogs.js`, so it works on touch too) —
  clicking empty canvas cancels the pick instead of grabbing the
  background/grid color, since `findObjectAt()` returns nothing there. The
  resolved color always matches what's actually drawn (shared
  `resolveObjectColor()`, extracted from the main render loop so both places
  can't drift apart). Swatches, the SV square, hue/RGB fields and the
  sliders all live-preview without closing the popover; only **OK** commits,
  while **✕**, Escape, or clicking outside all revert every change made in
  that session and close. The same popover also has a "Tloušťka čáry" slider
  (0.5–5 px, per-layer `layer.lineWidth`, falls back to the existing
  `LINE_WIDTH` constant when unset) — `render.js`'s main draw loop reads it
  per-object via the object's assigned layer
- Vlastnosti panel: the "Barva" row now applies to the *entire current
  selection* at once (reuses the same rainbow-preset popover as the layer
  color, via `openObjectColorPicker()`) instead of only the primary selected
  object — multi-selecting several objects and picking a color now recolors
  all of them in one click, and shows "— smíšené —" when the selection
  currently has mixed colors. Replaces the old inline 5-preset color picker
- New toolbar tool "🎨 Vybarvit" (`data-tool="fill"`, `js/tools/fillClick.js`):
  click into any closed-off area of the drawing to fill it with a translucent
  color — no selection needed. Since a SKICA contour is normally a chain of
  separate line/arc objects rather than one closed polyline
  (`addPolylineAsSegments`), it builds every closed boundary in the drawing
  itself (`buildClosedLoops()`, endpoint chaining; circles/rects/closed
  polylines count as their own loop directly). Turning contours/stock are
  usually drawn as an OPEN profile referenced to the rotation axis (y=0),
  not a closed shape — without accounting for that, clicking the gap
  between Kontura and Polotovar would never find any closed boundary at
  all, so an open chain whose both loose ends sit on the axis is treated
  as closed along the axis too (skipped for `machineType: 'karusel'`,
  where the axis has no such meaning). Point-in-polygon tests the click
  against all loops and picks the smallest one containing the click point.
  Clicking inside the ring between two nested loops (e.g. between
  Kontura and Polotovar) fills only that ring: loops directly nested inside
  the clicked one become holes, and outer+holes become subpaths of one
  `Path2D` drawn with the `evenodd` fill rule. Creates a new `type: 'fill'`
  object (color + opacity, adjustable afterwards via the same rainbow-preset
  popover, opened automatically right after the click) rendered in its own
  pass before all strokes (`drawFills()` in `render.js`) so it sits
  underneath the contour lines; excluded from CNC/DXF export and CAM
  path-sorting since it's a visual annotation, not machinable geometry.
  Cancelling that popover (✕/Escape/outside click) removes the just-created
  fill entirely rather than reverting to its default color, since cancelling
  a fresh "Vybarvit" click means the user didn't want to fill that area at all
- CAM Simulator's own canvas (`draw()` in `camSimulator.js`) now also draws
  "Vybarvit" fills. CAM doesn't keep a live copy of CAD's `state.objects` —
  opening it converts the drawing to G-code once and reparses that into its
  own `S.contourPoints`/`S.stockPoints`, so `'fill'` objects (already
  excluded from that G-code, being a visual annotation and not machinable
  geometry) would otherwise never reach CAM at all. Reads `state.objects`
  directly instead (same as CAD's `drawFills()`), remapping each CAD (x,y)
  point through CAM's own `toScreen()`/machine-axis convention
- CAM Simulator tool magazine (🔧 Zásobník) now stores the full knife, not
  just the insert: each slot gained `holderLength`/`holderWidth`/`holderHand`/
  `knifeAngle`/`holderAutoComplete`/`holderProfile`, saved and restored by
  `_syncParamsToSlot`/`_applyMagSlot` alongside the existing insert fields.
  The "⚙️ Geometrie" dialog's Držák tab gained a **🔧 Zásobník** button (opens
  the magazine without leaving the geometry dialog) and a **💾 Uložit do
  zásobníku** button (`saveCurrentToolToMagazine()`) that captures the
  currently configured insert + holder — including a custom-drawn
  `holderProfile` — as a new numbered slot for later reuse; the magazine
  dialog itself got the same capture action as **💾 Uložit aktuální nástroj**
  next to "＋ Přidat nůž"

### Changed
- Desktop status bar: dropped "Projekt: …", the current click-hint text
  (`#statusHint`, e.g. "Klikněte pro výběr…"), and the "Posun: Prostřední
  tlačítko / Shift+táhnutí" hint; added the same SOU/KAR·ABS/INC·R/⌀ and
  #/∠/📐 indicators the mobile coord bar already had, plus an icon-only
  🔢 button (opens the same "Číselné zadání objektu" dialog as the topbar's
  "🔢 Zadat"). The indicator-update functions (`updateCoordModeBtn`,
  `updateXDisplayBtn`, `updateMachineTypeBtn`, `updateCoordBarIndicators`)
  now target elements by shared class (`.ind-machine`, `.ind-coordmode`,
  `.ind-xdisplay`, `.ind-grid`, `.ind-angle`, `.ind-dims`) instead of a single
  `id`, so the mobile bar and desktop status bar copies stay in sync
  automatically
- Desktop status bar also shows coordinates (`#statusCoords`, same
  `fmtStatusCoords()` text as the mobile coord bar and the floating tooltip)
  — but frozen at the last click rather than following the mouse, set from
  the canvas `mousedown` handler (`js/events.js`) rather than from the
  continuous `mousemove`/`updateMobileCoords()` path
- "🔢 Číselné zadání objektu" dialog (`js/dialogs/numericalInput.js`) now
  pre-fills the first point of a shape (X/Z for Bod/Kontura, X1/Z1 for
  Úsečka/Konstr./Obdélník, Střed X/Z for Kružnice/Oblouk) from the last click
  or tap on the canvas (`state.lastClickPoint`, same value as `#statusCoords`
  on desktop) when there's no active chain from a previously-created object —
  chain still takes priority so multi-step drawing continuation is
  unaffected. Tracked from both the desktop `mousedown` handler
  (`js/events.js`) and every tap-resolving branch of the mobile `touchend`/
  `touchstart` handlers (`recordLastClick()` in `js/touch.js`), so it works
  the same on touch. Also swapped the field order to always show X before Z
  (`axisPair()` helper), matching the rest of the UI — on a lathe
  (`machineType: 'soustruh'`) the fields used to read Z-then-X because
  `axisLabels()` returns `[H, V]` in
  world horizontal/vertical order, which happens to be `[Z, X]` for that
  machine type
- Desktop floating cursor coordinates (`#cursorCoords`, follows the mouse over
  the canvas) gained a 2nd line: the selection counter ("1 obj", "2 obj + 3
  body", …) when something is selected. That counter used to be a separate
  canvas-drawn box centered below the toolbar on desktop; `drawSelectionCounter()`
  (`js/render.js`) now only draws that box on mobile (`getSelectionCounterLabel()`
  extracted so both call sites share the counting logic)
- Renamed "Natočení (°)" to "Polární úhel (°)" on the insert fields
- Insert shape "Úhel hřbetu (α)" field removed from the polygon shape UI,
  replaced by "Rádius (R)" at the same position (value still used internally
  for flank-interference tolerance)
- "VBD kód" and holder dimension fields ("Tloušťka držáku", "Délka držáku")
  moved from the main "Nástroj" panel into the "⚙️ Geometrie" dialog; the
  Držák tab there now holds only ⇄ Ruka (hand, auto-derived from the
  machining side on open, togglable), ↻ Natočení (rotate the insert without
  switching tabs), Délka držáku (l1), Tloušťka držáku, and the outline tools
  above — no ISO style/κr/h/b fields
- Preview canvas proportions: the holder body no longer renders visually
  smaller/narrower than the insert when the shank length (l1) is much
  larger than the insert edge length — scale is computed from a capped
  drawn shank length instead of the full l1
- A very long holder shank (large l1) draws shortened with a standard
  technical-drawing break mark (zig-zag) instead of taking up most of the
  canvas height; the true l1 value stays in the label
- The gap between the insert tip and the holder's near edge is sized from
  the insert's actual drawn reach, so the insert body no longer visually
  overlaps the holder

### Fixed
- Mobile long-press "precision pointer" (offset cursor circle used to tap
  small/tightly-packed controls precisely) was wired up separately for the
  sidebar, the topbar, and `.calc-overlay`/`.input-overlay` dialogs only —
  it silently did nothing on the floating mobile action buttons and any
  other UI outside those three containers. Replaced the three near-duplicate
  implementations with a single delegated listener on `document` (`touch.js`)
  that covers the whole UI, excluding the CAD canvas (`#canvasWrap`, which
  keeps its own dedicated `#precisionCrosshair`) and text-entry fields
  (`input`/`select`/`textarea`). Also flips the pointer to appear below the
  finger instead of above when the target is near the top edge of the
  viewport, so it no longer renders off-screen there.
- Vrstvy panel: the "Skrýt vrstvu" eye icon used the 👁‍🗨 emoji, which some
  systems/browsers render as an unstyled monochrome (black) glyph — invisible
  against the dark panel background. Replaced with inline `currentColor` SVG
  icons (`ICON_EYE_OPEN`/`ICON_EYE_OFF`) so the button is always visible in
  both themes
- Objects created by "🔄 Vykreslit CNC kód na canvas" and "📂 Načíst G-kód ze
  souboru" (`parseGcodeToObjects()` → `state.objects.push()`) bypassed
  `addObject()` entirely and ended up with no `.layer` at all. Since
  `render.js`'s layer lookup (`state.layers.find(l => l.id === obj.layer)`)
  then returned `undefined`, those objects were **immune to every layer's
  show/hide toggle** and always drew in the hardcoded `COLORS.primary` /
  `COLORS.stock` fallback instead of the user's configured Kontura/Polotovar
  layer color. Same issue in the CAM Simulator's "Odeslat do CADu" and SVG
  import. Now explicitly assigned to the Kontura or Polotovar layer (by
  `isStock`) on creation
- `isStock` objects (Polotovar drawing mode, "Přídavek na plochu", the paths
  above) always rendered in the fixed `COLORS.stock` constant regardless of
  their own layer's configured color — the Polotovar layer's color dot had no
  effect. `render.js` now prefers the object's assigned layer color, falling
  back to `COLORS.stock`/`COLORS.primary` only when no layer is found
- Most dimension/measurement creation paths (`dialogs/dimension.js`,
  `dialogs/measure.js`, chain dimensions, the coordinate-label tool) never set
  an explicit `layer`, so new "Kóty" silently landed on whatever layer was
  currently active (typically Kontura) instead of the dedicated Kóty layer —
  making the Vrstvy panel's Kóty visibility toggle hide/show the wrong
  objects, and mixing dimension geometry into Kontura/Konstrukce. All of these
  now explicitly set `layer: 2`
- Výplně (`type: 'fill'`, nástroj "Vybarvit") nešly vybrat kliknutím na
  plátno — `distToObject()` je pro neznámé typy záměrně vylučoval z výběru
  (default: `Infinity`), takže kliknutí na vybarvenou plochu nic nevybralo a
  hlavní tlačítko **Smaž** tak nemělo co smazat. Přidán case `'fill'`
  (evenodd test přes všechny smyčky, stejný jako při vykreslení —
   mezikruží se tedy správně vybírá jen za prstenec, ne za díru uprostřed).
- VK Kontura: náhled na první canvasu teď respektuje typ stroje (soustruh/karusel)
  — pro soustruh jsou osy prohozené (Z vodorovně, X svisle), takže se PA
  úhel vykresluje správně (dřív platilo pevně karuselové zobrazení, PA=4°
  tedy vypadalo jako ~86°). Oblouky (G2/G3) mají pro soustruh obrácený znak
  kvůli prohození os. První prvek řetězce se nyní označuje G0 (počáteční bod)
   místo G11; v ISO konverzi se G0 rozdělí na pozicování (G0) + první řez (G1)
   při PA/PR, nebo se převede na G1. VK náhled nyní zahrnuje (0,0) do hranic —
   osy X=0/Z=0 jsou vždy viditelné a body leží na skutečných souřadnicích.
   Oprava: první prvek s X/Z + PA/PR (např. `G0 X40 Z20 PA10 PR100`) nyní
   správně bere X/Z jako start a PA/PR jako směr (dřív se X/Z bralo jako konec
   a PA/PR byly ignorovány — vizel jako `G0 X0 Z20`). Osy jsou čárkované a
   popisky X/Z přesunuté do rohů canvasu, aby neléhaly přes geometrii.

## [1.7.0] - 2026-07-04

### Added
- In-app help overlay (`calculators/help.js`) with G-codes, M-codes, calculators and shortcuts
- Documentation: `README.md` and `docs/developer.md`
- Advanced dimensioning: angular and radial dimensions with leader lines
- Distance measurement between points and coordinate dimensioning with angle visualization and snapping
- Polar angle support for dimensions from Z-axis

### Changed
- Top bar transformed into a floating element with transparent background
- Toolbar buttons can now deactivate the active tool when clicked
- Updated texts in file dialog, added tolerance and toggle for coordinate labels

### Fixed
- Arc geometry calculation logic in CNC editor
- Stabilized CNC editor and improved numpad UX
- Removed confirmation dialog for outdated code
- Automatic CNC code export on geometry change
- Optimized parsing of chamfer/rounding markers

## [1.6.0] - 2026-06-11

### Added
- Separate CAM editor for CNC toolpaths (independent from CAD editor)
- CNC code panel with G90/G91 toggle, save/load and render
- CAM toolbar reorganization with contextual visibility and rich modal for toolpaths
- CAM mobile overlay mode for right panel (width < 700px)
- Tool limits (chuck/collet) clipping toolpaths — no intrusion into forbidden zones
- Z-limit button with 3 states: off / chuck+collet / full range
- Slower simulation with half-feed speed and single-block stepping
- Parting/part-off cycle with selectable grabs (retract X / start X + Peck)
- Face milling strategies with direction control (right-to-left, left-to-right)
- Chamfer/radius markers in CNC code for lathe control system syntax
- Profile trace tool (interactive profile tracing in simulator)
- G-code parser for importing from other systems
- Snap to arc centers (circles, arcs, bulge polyline segments)
- X-axis rotation (X+ down) + G2/G3 swap for bottom machining
- Flip Z support in UI, rendering and G-code generation
- Shared tool library across calculators
- Stock contour closure check before generating stock/G-code
- Mirror contour preview around rotation axis (y=0)
- Rotation axis as construction line + center mark tool (DIN 76/509)
- Batch undo (single Ctrl+Z reverts entire creative action)

### Changed
- Sided roughing: separated type (longitudinal/face) x direction (right/left) toggles
- Face milling retract per-Z according to actual casting, not global stock radius
- Clean rapid moves: 45° retract instead of vertical X
- Rapid descent to stock edge before G1 - elimination of air cuts
- Profile/P relocate swap in toolbar
- Renamed Střed → Centr (distinction from center mark)
- Ctrl+0 centers view, mobile inputmode fixes

### Fixed
- Multiple camSimulator geometry fixes: arc direction detection, loop tolerance, chain breaks for bridge segments
- Toolpath rendering: G1 solid, G0 dashed, hide plan when editing
- Contour/draha ignores G0 gaps and correctly handles loop bridging
- Manhattan corners for smoother transitions between arcs and lines
- Two bugs from code review
- Fillet arc convex (G3) instead of concave (G2) for stock
- Auto center view updates status zoom text
- Construction lines infinite + drag segment end with snap; bigger zoom (200)
- Angle snap tolerance reduced from 3 to 1 degree

## [1.5.0] - 2026-05-28

### Added
- AI panel: drawing analysis to lathe profile (Z/D) + JSON to drawing conversion
- AI provider settings modal (Groq/Gemini/OpenRouter)
- Professional gear generator via Maker.js
- Gear pair tool (two meshing gears)
- Parametric tools: Slot, Polygon, Star (via Maker.js)
- Hershey single-line fonts for CNC engraving (+ 3 additional fonts)
- Vector text via Maker.js with Roboto + bezier paths
- SVG export with vector text
- Undo batch for creative actions
- DXF import: 3DFACE and INSERT/BLOCK entities
- DXF import: full ELLIPSE and SPLINE support
- DXF/SVG export via Maker.js with Y-axis handling

### Changed
- Boolean operations refactored through makerjs.model.combine
- Stock tool: Polotovar button and conversion of drawn objects to CAM
- UI: moved Save/File/History/Library from toolbar to Settings + mobile ⚙️
- Hershey JSON compression: per-char tuple instead of object (-92% size)

### Fixed
- Robust DXF/SVG export with correct Y-axis negation
- Boolean: identical shapes, degeneracy, flag propagation
- Robust G-code parser understands modal G90/G91

## [1.0.0] - 2024-05-24

### Added
- Project initialization: basic 2D CAD with HTML templates, JS modules and test fixtures
- 2D drawing tools: LINE, ARC, CIRCLE, RECT, POLYLINE, TEXT
- Advanced edit tools: FILLET, CHAMFER, TRIM, EXTEND, BREAK, MOVE, COPY, ROTATE, SCALE, MIRROR, ARRAY, CIRCULAR ARRAY
- Boolean operations
- Automatic intersection calculations and associative dimensions
- Thread tool (UI, logic, CAM simulation) with DIN 76 table update
- Parting/part-off cycle in CAM simulator
- Face milling strategies
- Roughing/finishing strategies with toolpath generation
- G-code generation for Sinumerik 840D sl
- Tool library across calculators
- DXF basic import/export
- IndexedDB project storage with autosave
- Image export (PNG)
- Dark/light theme (Catppuccin)
- Mobile touch support with bottom bar
- Unlimited undo/redo
- In-app help overlay

---

_Changelog风格 © 2024-2026 SKICA contributors_
