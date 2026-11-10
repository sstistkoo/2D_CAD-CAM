# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Úklid kořene repa:** smazány ladicí zbytky (`gear_debug.html`, `gear_profiles.html`, `internal_gear_test.svg`, `scratch_user.mjs`, `useky-podle-meznich-car.patch`). Ladicí stránky ozubení tím zmizely i z offline cache PWA. Ukázkové DXF (`test.dxf`, `test_fusion.dxf`, `Náčrt1.dxf`) jsou teď v `tests/fixtures/dxf/` a `SENIOR_REVIEW.md` v `docs/senior-review-2026-07.md`.

- **VK: úhel PA na karuselu od vodorovné osy →** (jako CNC editor a CAD; 0° = doprava, 90° = nahoru, proti směru hodin). Dřív se na karuselu měřil od +Z (nahoru) po směru hodin. Soustruh beze změny. Řešič dál počítá ve strojové rovině, převod je jen na hranici textu/formuláře (`js/calculators/vkAngle.js`). **Uložené VK programy na karuselu se čtou jinak** – PA ve starých zápisech přepiš jako 90 − PA.

### Fixed

- **CAM G-kód Fanuc: limit otáček `G50 S` z pole Max. otáčky (LIMS).** Dřív byl natvrdo `G50 S2000` bez ohledu na nastavení. Sinumerik hlavička už nepíše navíc pevné `LIMS=2000`.
- **CAM spojení operací (Fanuc/Heidenhain): další část znovu zapne vřeteno a chlazení.** Závěr předchozí části (`M9 M5`) zůstával v těle a bez výměny nože (stejné T v hlavičce) jela další část se stojícím vřetenem.
- **CAM převod řídicího systému:** závit `G33 … K` ↔ Fanuc `G32 … F`; Sinumerik `LIMS=` uvnitř programu se mimo Sinumerik odstraní; volání nástroje (hlavička i výměny uvnitř) se převede jméno ↔ číslo přes Zásobník.
- **CAM Fanuc/Heidenhain: číslo nástroje ze slotu Zásobníku** (`T0505`, `T5 M6`) místo pevného `T0101`/`T1 M6` — spojený program s více noži (části, předvrtání) teď nástroj opravdu vymění (`js/calculators/cam/toolCall.js`).
- **CAM oblouk nad 180° se zápisem záporného `CR=`/`R`** — dřív by ho stroj projel kratší cestou (`js/calculators/cam/arcSign.js`).
- **CAM rychloposuvy: chyba výpočtu kolize = kolize** (dřív „volno").
- **CAM spojení operací:** Heidenhain se pozná i bez předaného systému (žádný `STOPRE`); u ne-posledních částí odpadne celý závěr `M9 M5 [G28] M30`, takže se stejným nožem vřeteno mezi částmi neběží naprázdno ani nestojí.

### Added

- **CAM hlavička:** poznámka, že dráhy jedou po středu rádiusu destičky (korekce ke středu, poloha břitu 9); u Heidenhainu upozornění na limit otáček. Sinumerik závěr má `M9 M5` před `M30`, komentář `G75` opraven na „Najetí na pevný bod stroje".

- **CNC editor, karusel se zrcadlením os:** řádek `PU` a info ∠ nyní počítají s flipX/flipZ stejně jako dialog „Úsečka úhlem“ (dřív dialog zadaných 0° nakreslil doleva a info řádek ukázal 180°).
- **CAD číselné zadání, kompas ✛:** šipka míří, kam ukazuje, i při zrcadlení os (`js/dialogs/compassAngle.js`).
- **Všechna okna aplikace se vejdou na displej** (`css/modal-fit.css`, kontrola všech oken na 7 velikostech displeje):
  - referenční okna (G/M kódy, alarmy, nástroje, příklady…) a velký CNC editor na telefonu na výšku
    přetékala o 13–20 px pod spodní okraj (horní odsazení podkladu + plná výška okna);
  - běžná okna (kalkulačky, Nastavení, Poznámky, AI…) s plným obsahem přetékala na malém telefonu –
    mobilní strop výšky přebíjelo desktopové 95vh;
  - dialogy (zadání, potvrzení, vrstvy…) na tabletu / desktopu neměly strop výšky – s dlouhým obsahem
    utekly nahoře i dole a tlačítka nešla dosáhnout; teď se v nich roluje;
  - AI okno bylo na úzkém telefonu širší než displej;
  - výšky oken ve `vh` mají i `dvh` (skutečně viditelná výška – na Androidu je 100vh vyšší, když je vidět adresní řádek).
- **Okna v kreslicím editoru se vejdou na displej** (`cnc-compact.css`) – ve zmenšeném editoru se okna (⌒ Oblouk,
  ∠ úsečka, sražení, nápověda…) centrují na celou obrazovku, ne jen do spodní části; žádné okno není vyšší než
  displej (zbytek se roluje). Dřív u Oblouku utekla spodní tlačítka pod okraj.

### Changed

- **Kóta úhlu od osy X** (`dimension.js`) – vedle osy Z jde klepnout i na osu X; úhel se měří od osy, na kterou
  se klepne (jako na technologickém výkrese; na karuselu je X vodorovná). Kóty se při úpravě úsečky přepočítají.
- **Karusel v kreslicím editoru: `PU` v kódu a ∠ v informačním řádku od vodorovné osy →** (`cncDrawTools.js`) –
  stejně jako dialog Úsečka úhlem (`G1 PU-20 L200` = mírně dolů vpravo; info řádek ukáže ∠ −20°). Soustruh beze změny.
- **Úsečka úhlem na karuselu: polární úhel od vodorovné osy obrazovky** (`cncAngleCompass.js`) – → = 0°,
  nahoru 90°, −20° mírně dolů vpravo (dřív od +Z, tj. od svislé osy → −20° šlo skoro nahoru). Šipky ✛ a
  odklon „Od předchozí“ (↺ vlevo / ↻ vpravo) se řídí obrazovkou i na karuselu a se zrcadlením. Soustruh beze změny.
- **Kreslicí CNC editor: podržení ⌫ smaže celý řádek** (`cncLongDelete.js`) – po ½ s zmizí řádek s kurzorem
  (na prázdném řádku po Enter ten nad ním); krátké klepnutí maže znak jako dřív. Tlačítka lišty už při
  podržení neoznačují text ani nevyvolají menu Kopírovat / Vybrat vše. Ctrl+Z / ◀ vrátí smazaný řádek.
- **Zmenšený kreslicí editor: náhled se sám vycentruje** (`cncEditorLive.js`) – po každé změně nakreslené
  geometrie se plátno nad editorem zarámuje na celou kresbu (jako ⤢). Pohyb kurzoru pohled nemění.
- **Kreslicí CNC editor: 123 ZAP skryje boční číselník** (telefon na výšku) – čísla se zadávají v okně
  číselníku, kód má celou šířku a nemá dole rezervu pro číselník. 123 VYP = boční číselník jako dřív.
- **Kreslicí CNC editor: ;👁 (skrýt poznámky) přesunuto do horní lišty vedle AUTO**; tlačítko ↵ vpravo
  dole je přes dva řádky, aby se lépe trefovalo.
- **CNC editor: Enter seřadí osy X před Z** (`gcodeAutoMotion.js`) – řádek `Z5 X10` se po Enter (nebo ↵)
  změní na `X10 Z5`, spolu s doplněním G0/G1 (`Z5 X0` → `G0 X0 Z5`). Ostatní slova a poznámka zůstanou.
- **Kreslicí CNC editor: po otevření kurzor na novém řádku konce kontury** (`cncDrawOpen.js`) – hned se dá
  pokračovat (před `; STOCK_START`, jinak na konci). Výběr jiného objektu na plátně dál skočí na jeho řádek.
- **Přepínač AUTO** v horní liště kreslicího editoru: po zavření překreslí výkres podle kódu bez dotazu
  „Přepsat výkres…?“ (výchozí ZAP; vypnutím se dotaz vrátí, pamatuje se). Prázdné řádky se za změnu kódu nepovažují.
- **CNC kód v pravém panelu** (`js/cncOutputTools.js`): Enter v poznámce ji nerozdělí, klik pod text založí
  nový řádek, podklad s oranžovým proužkem pod řádkem s kurzorem (i po skoku na řádek vybraného objektu).
- **CAM editor převzal úpravy kreslicího editoru** (`camEditor.js`): nový číselník s kalkulačkou, přepínač 123
  v horní liště, ;👁 skrytí poznámek (místo 📋 v liště – kopírování je v menu), Enter v poznámce ji nerozdělí,
  klik pod text = nový řádek, podklad řádku s kurzorem; klávesnice telefonu jen přes ⌨ (dřív readOnly).
- **CNC editor: nový číselník s kalkulačkou** (`cncNumpadCalc.js`): zvlášť + a −, × ÷, závorky, C a ⌫
  v horní řadě, velké OK dole; výraz (např. 100÷2+5) se při OK spočítá a vloží se výsledek, náhled „= 55“ pod polem.
- **CNC editor: zvýrazněný řádek s kurzorem** (`cncCurLine.js`): jemný podklad s oranžovým proužkem vlevo
  pod řádkem, kde se právě píše.
- **CNC editor: přepínač číselníku 123** (horní lišta vedle ◀ ▶, `cncNumpadToggle.js`): VYP = písmeno osy
  se vloží rovnou, ZAP = vyskočí okno s čísly jako dřív. Stav se pamatuje.
- **CNC editor: písmeno osy bez číselníku** (`calculators/cncEditor.js`): tlačítka X, Z, G, M,
  sražení, zaoblení… vloží písmeno rovnou do kódu i na výšku; vyskakovací číselník se už neotevírá.
- **CNC editor: klik pod text = nový řádek** (`calculators/cncTapBelow.js`): klepnutí do prázdného
  místa pod posledním řádkem přesune kurzor na konec a založí nový řádek – netřeba hledat konec poznámky.
- **CNC editor: Enter v poznámce ji nerozdělí** (`calculators/cncCommentTools.js`): s kurzorem v poznámce za
  středníkem založí Enter (i tlačítko ↵) nový řádek až za koncem řádku, poznámka zůstane za kódem.
- **CNC editor: tlačítko ;👁** (kreslicí lišta) skryje / zobrazí poznámky za středníkem – jen zobrazení,
  kód se nemění, stav se pamatuje.
- **Značky kontury a polotovaru vždy vidět** (`cncCommentTools.js`): `; KONTURA_START/END` a
  `; STOCK_START/END` se při ;👁 neskrývají a ;✂ je nevystřihne; v kódu jsou zvýrazněné žlutě.
- **Kreslení z G-kódu normalizované** (`drawColorPrefs.js` → `normalizeDrawnObjects`): kontura i polotovar
  vykreslené z CNC editoru / importu jdou do své vrstvy (Kontura modře, Polotovar červeně) a mají
  jednotnou tloušťku čar z Nastavení. Ručně přebarvená čára si barvu při překreslení zachová.

### Fixed

- **Editory G-kódu: kurzor je po psaní z tlačítek vždy vidět** (`cncCaretVisible.js`): po vložení textu, nového řádku
  nebo mazání se pohled dorovná na kurzor (svisle s rezervou 1 řádku, vodorovně u dlouhých řádků). Platí pro kreslicí
  CNC editor i CAM editor.
- **CNC editor: kód nepíše na řádek značky kontury/polotovaru**: s kurzorem na řádku `; KONTURA_START`,
  `; STOCK_START/END` se vkládaný kód (tlačítka, číselník) dá na nový řádek pod značku (na začátku řádku nad ni).
- **Přepínač 123 má každý editor zvlášť**: CAM editor nemá číslice v liště, proto u něj číselník zůstává
  výchozí ZAP (jinak by na mobilu nešlo zadat číslo); kreslicí editor výchozí VYP.
- **Lupa v editoru** nekopíruje podklad řádku s kurzorem (byl by v ní posunutý).
- **CNC editor na mobilu: klávesnice nevyjíždí po tlačítkách** (`cncNoKeyboard.js`): klepnutí na tlačítka lišty,
  horního pruhu a oken (např. ;👁) nepřesune fokus, takže telefon nevysune klávesnici; rychlé dotazy v Nápovědě
  ji také neotevírají. Klávesnici dál zapíná ⌨, ve vyhledávání a polích pro psaní vyjíždí normálně.
- **Esc / Zpět zavírá nejdřív vnitřní okno** (`dialogs/innerModal.js`, volá se z `dialogFactory.js`,
  `events.js`, `backButton.js`): s otevřeným číselníkem, úhlem, sražením, nápovědou… v CNC/CAM
  editoru zavřel Esc i tlačítko Zpět na Androidu celý editor (kreslicí editor přitom rovnou
  vykreslil kód na plátno). Esc ve vyhledávání editoru zavíral kromě hledání i editor –
  Esc obsloužený polem (`preventDefault`) už okno nezavírá.

### Added

- **CNC editor: číslice naležato i v editoru z pravého panelu, číselník bez automatického
  vyskakování** (`cncDigitKeys.js` digitPadHTML/digitKeysVisible/spacedPrefix, `cncEditor.js`):
  jsou-li v liště vidět číslice, X/Z/R/I/K/G/Sraž./Zaobl. jen vloží písmeno (před ním mezera,
  stojí-li kurzor za slovem); číselník otevře jen „123“. V okně číselníku (CNC i CAM editor)
  je místo „Zrušit“ **⌫ Smazat**; křížek ✕ vpravo nahoře mizel – `openNumpad` přepisoval
  `textContent` titulku i s tlačítkem (nadpis je teď ve vlastním `<span>`).

- **CAM posuv podle plátku, zvlášť hrubování a dokončení** (`insertFeeds.js`, `isoToolCatalog.js`
  cutData, `cam/finishFeed.js` finishBaseFeed, `magazineFeedUpgrade.js`): hrubování polygon
  f = 0,6 · rε · k(ε) (k: S/C/W 1, T 0,85, D 0,75, V 0,5; 0,1–0,8), kulatá f = 0,08 · R (0,15–1,0);
  dokončení z Ra 1,6 f = √(32 · rε · 1,6 / 1000), nejvýš f hrubování (SNMG ..08 0,48 / 0,2,
  DNMG ..04 0,18 / 0,14, RCMT R10 0,8 / 0,5). Nůž v zásobníku má **f hrub.** a **f dok.**; nové pole
  **Posuv dok. (F)** (`finishFeed`, 0 = auto z plátku) pro dokončení týmž nožem — dřív jelo
  F hrubování. Nájezd dokončení (sjezd materiálem) jede F dokončení. Nezměněné výchozí nože
  v uloženém zásobníku dostanou nový posuv jednou (revize zásobníku 6). Vnitřní nože beze změny.
- **CAM dokončení: F podle cílového Ra a snížený posuv ve vnitřních rozích** (`cam/finishFeed.js`,
  výchozí vypnuto): F = √(32 · rε · Ra / 1000) se stropem max F (2 × F); ve vnitřním rohu kontury
  (ostrý zlom dráhy, ověřený proti dílu) posledních/prvních rε sníženým F. Hrubování ani dráha se
  nemění, otisk 32 fixtur shodný.
- **CAM: ladění posuvu** (vše výchozí vypnuto, dráha beze změny, otisk 32 fixtur shodný):
  - konstantní posuv na oblouku dle rε (`cam/arcFeedComp.js`) — F oblouku × r dráhy / r řezu,
    dokončení i hrubování po kontuře; další řezný blok se vrací na F,
  - ☑ posuv při zanoření v % (`cam/feedTuning.js`) — rampy, vjezdy a sjezdy do hloubky ve všech
    hrubovacích strategiích; emise k řádkům připíše odkud/kam a průchod, F se přepočte nad řádky,
  - ☑ posuv u čela v % / Auto v cik caku (`ops/zigzagFeed.js`) — až od skutečného dotyku klínu,
    který po rampě zůstal u čela; Auto = ap / (ap + přebytek klínu),
  - ☑ konstantní tloušťka třísky při hrubování (`feedTuning.js` chipFeedFactor, klíč plátku
    `chipThinning`) — F × sin κ(ap) / sin κ(ap vrstvy), strop Max. F, dokončení beze změny.
- **Cik cak zleva jako zprava** (soustruh, díl uživatele (10)): vrstvy u strmého čela na straně začátku vjíždějí
  rampou ke stěně (`zigzagWallStart.js` — dřív klín u čela 15–14), konec u 1/18 se dojede obrácenými vrstvami
  zprava doleva až dolů (`zigzagReverse.js`), údolí v Ú2 se nedělí uprostřed (kapsa za začátkem úseku se nepřidá,
  když údolí bere spodek cik cak). Zbytek po úsecích zleva 6502 → 623 mm², 0 kolizí; zprava a jiné strategie beze změny.
  Pod S4 jedou vrstvy Ú3 od konce až ke stěně za hranicí najednou (dřív kapsa zvlášť a otočka na hranici Z705.9).
  Karusel Od středu s Rozsahem X min (díl (11)): Ú1 nejede mimo rozsah (materiál za začátkem jen po předchozím
  úseku, `afterPrev`) a kapsa 14–13 se jede celá cik cakem (vrstvy s rampou uprostřed mělčí vrstvy patří do řetězu).
  Karusel ap 10 (díl 6. 11.): hluboká kapsa pod dnem údolí po vrstvách místo jednoho tahu 17 mm (Ú2 N2800), spodní
  vrstva Ú3 po dně až k čelu (N3790). Soustruh zleva díl (10): zbytek 48 → 0 mm².
  Celý program bez úseků (díl 6. 11.): 6 → 0 kolizí (obrácené vrstvy ke vzdálené stěně, kapsa vedle v údolí). Přehled
  27 dílů × zleva/zprava × 2 ap: kolize 1371 → 1268, žádný díl horší.
  Menší ap a obě strany (geometrie dílu (9), ap 1,2–4,8): všechny kolize Cik cak odstraněny — jízda po stěně
  nesjede do nevybrané kapsy, kapsa za začátkem úseku jede první jen bez vysokého materiálu vedle, vrstva po dně
  jen pod ubraným. Přehled 48 běhů (úzký držák): 0 kolizí.

- **Cik cak: kapsa za začátkem úseku** (`cam/ops/zigzagBeyondStart.js`, pravidla 1 a 20): materiál, který za
  hranicí na straně začátku ještě stojí (kapsa ohraničená jen hranicí patří dalšímu úseku), jede úsek jako první
  cik cakem od stěny. Spodek za hranicí na údolí polotovaru hledá stěnu hrbu bez omezení vzdálenosti
  (`valleyStart`), vrstvy jiné kapsy vedle dna do cik caku nepatří a šikmé dno bez podkapsy se jede po dně.
  Karusel Od středu, díl (9): zbytek po úsecích 23 555 → 452 mm², 0 kolizí; Ú3 s polotovarem z aplikace
  10 → 0 kolizí, bez svislého zanoření posuvem (N4400). Testovací `camHeadless` nedědí rozsahy mezi běhy
  (Ú3 zdědil `valleyFloor` z Ú1 a byl prázdný).

- **Cik cak v kapsách pod spodkem** (`zigzagValley.js`, `zigzagFloor.js`): vrstva na dně patří spodku (bez
  samostatné kapsy), mírně šikmé dno se jede zanořením a jízdou po dně, jízda po stěně začíná nahoře na
  stěně (dřív 6 mm svisle). Karusel, díl uživatele: zbytek 515 → 401 mm².

- **Úsek končí i na údolí polotovaru** (`cam/ops/sections/stockValleys.js`, pravidlo 1): karusel po X, odlitek
  s údolím S8–S7 nad konturou → ✂ Po úsecích dá Ú1 od obvodu po S7 (až na dno, jen vlevo
  od hrbu u S7 ne pod výšku S7) a Ú2 zbytek; pravá strana za hrbem se dojede dřív, než vrstvy přejedou přes hrb. Cik cak v údolí pozná i řetěz ramp (soustruh: dřív jel údolím řetězem po čáře zanoření). Pod spodkem cik cak se
  zbylý materiál bere po kapsách, napřed pravá (zářez V), pak levá (`pocketsBelowZigzag`). Díl uživatele:
  zbytek po úsecích 528 mm², 0 kolizí; soustruhové díly beze změny.
- **Cik cak: údolí za hrbem bez hranice úseku** (`cam/ops/zigzagValley.js`, pravidlo 20): místo řetězu
  vrstev zanořených po čáře zanoření (jen doleva, u strmé stěny klín „nedojeto") jede údolí cik cak od stěny
  ke stěně s rampou 45° o ap níž na každém konci. Karusel po X, díl uživatele: zbytek 4589 → 770 mm², 0 kolizí.
  Na tyči beze změny.
- **Výchozí bezpečná poloha X500 Z500** (`cam/camDefaults.js`, dřív X150 Z5). Uložený stav prohlížeče a projekty
  si nesou vlastní hodnotu — tam ji změnit v *Parametry → Bezpečná poloha*.

- **Ikona 📏 schová meze i vypne** (`cam/sim/limitsVisibility.js`): schované čelisti, koník a rozsahy 📐 neplatí
  pro dráhy, souřadnice i zaškrtnutí zůstávají a po zobrazení zase platí (uloží se s projektem).
- **Mobil (karusel i soustruh): čelisti, koník a rozsahy 📐 přes zaměřovadlo** (`cam/sim/limitTouchMark.js`): podržet prst → křížek nad
  prstem, najet na čáru, pustit = čára se označí (zesílí); znovu podržet = čára skočí na křížek a táhne se
  s ním. Krátký tap označení zruší. Začne-li křížek přímo na čáře, chytí se hned.
- **CAM karusel: ⟲ Po X jako podélně** (`cam/xzSwap.js`, přepínač v Obrábění, jen karusel, výchozí vypnuto):
  hrubování v prohozených osách X ↔ Z – ↔ Čelně a ⇅ Cik cak jedou po X vyladěným podélným algoritmem, nůž
  svisle ze smykadla; G-kód se prohodí zpět (X↔Z, G2↔G3). Na dílu uživatele 29 porušení pravidel místo 44,
  0 kolizí místo 10. Zatím bez mezí a Po úsecích – plán v `docs/plan-karusel-po-x.md`.
- **CAM karusel po X: simulace se svislým držákem** (`cam/sim/xzSim.js`): úběr, ⛔ kontrola kolizí, start
  v materiálu, oranžová stopa držáku i zajetí do kontury se počítají v prohozených osách (jako vyvrtávání
  v zrcadle) a výsledek se prohodí zpět – zmizelo 12 falešných kolizí vodorovného držáku soustruhu.
  Skript `scripts/cam_swap_xz.mjs` uloží prohozený `.camprog` pro `cam_rules_check`.
- **CAD: 🛠 Úpravy výkresu** (`dialogs/drawingEditsDialog.js`, `drawingEditOps.js`, `render/straightCheck.js`):
  tlačítko v liště místo *Smaž vše* (to zůstává v Nastavení). Okno: uzavřít konturu po osách X/Z, uzavřít
  polotovar ke kontuře, kontrola a oprava (mezery, nepřesnosti, zdvojení), 📏 zvýraznění vodorovných/svislých
  čar (skoro rovné červeně s odchylkou), normalizace barev, smazání pomocných čar.
- **Nastavení → Zobrazení: výchozí barva kontury a polotovaru** (`drawColorPrefs.js`), pamatuje si zařízení;
  stejný výběr i v okně Úpravy výkresu spolu s tloušťkou (Tenká/Tlustá) — 🎨 Normalizovat sjednotí barvu i
  tloušťku čar kontury a polotovaru.
- **CAD: přichycení k ose X** (`canvas.js`): kurzor se chytá i na osu X (soustruh svisle X = 0, karusel
  vodorovně), stejně jako na osu Z; `state.mouse.onXAxis` hlásí, že bod leží na ose X.

### Changed

- **Karusel: ⟲ Po X jako podélně je výchozí zapnuté** (nový klíč `carouselAlongX`, starý `carouselSwapXZ` se
  ignoruje): ↔ Čelně a ⇋ Cik cak na karuselu jedou vodorovně po X. Na dílu uživatele s Cik cak 15 porušení
  pravidel místo 125, 0 kolizí. Soustruh beze změny.
- **Karusel po X: rozsahy 📐, ✂ Po úsecích, ➕ Operace a náhled průchodů** (`cam/sim/xzSections.js`,
  `swapLimits`, `swapPasses`): rozsah X = pás poloměrů, rozsah Z = výška (strop shora); úseky po X s dnem ve
  výšce; obrobený polotovar od stolu. Hlášky a komentáře programu s osami prohozenými zpět, tlačítka strany
  „← Od obvodu / → Od středu".
- **Karusel po X: čelisti a koník jako výšky** (`swapLimits`, uživatel 4. 11. 2026): limity otočené o 90° proti
  soustruhu. Čelisti dole na stole = pod jejich výšku plátek nesjede; koník = horní mez, nad ní se neobrábí
  a výjezd programu nad ni (bezpečná poloha, výjezdy) se hlásí varováním.
- **Hlavička G-kódu uvádí stroj**: `; Vygenerovaný kód SINUMERIK 840D - KARUSEL` / `- SOUSTRUH`.

- **Typ čáry: barva zvlášť pro konturu a polotovar** (`lineStyles.js`, `lineStyleDialog.js`): barva zvolená pro
  polotovar se po přepnutí na konturu už nepřenese do kontury; starší uložená jediná barva se nepřebírá.
  Výchozí barva polotovaru je červená (dřív oranžová).
- **CAM na karuselu: tlačítka hrubování podle os** (`cam/sim/paramsMachiningHtml.js`): pořadí ↕ Podélně (Z),
  ↔ Čelně (X), ⇅ Cik cak – šipky odpovídají plátnu otočenému o 90°; soustruh beze změny.

### Fixed

- **Cik cak: dno ani odskok při jiné velikosti destičky** (`zigzagReverse.js`, `zigzagFloor.js`, přehled R5–R25 × ap × strany
  na dílech uživatele 6. 11.): obrácená vrstva vystoupala nebo sjela na dno, které už projela jiná vrstva, a projela
  ho podruhé posuvem vzduchem (zleva: díl (3) X209,22 Z−20…77 pro každé R, díl (2) R15 X45,79 u čela a X24,3 Z256–359)
  — teď se zastaví na začátku projetého dna. Odskok na konci cik caku nejede šikmo do stěny pod offset (díl (2) R20
  N1790 o 0,19 mm do přídavku), tam rovně nahoru. 0 kolizí, otisk 32 fixtur shodný.

- **Cik cak pro každou velikost destičky** (`zigzagValley.js`, `zigzagEmit.js`, díl uživatele 6. 11. (3), soustruh ap 8):
  s R5 dráhy v pořádku, s R20 ne („má to jet v celku z jedné strany na druhou"). Opraveno:
  - kapsa pod podélnou vrstvou sahá až ke stěně za jejím začátkem, když vrstva vjíždí rampou odtamtud — zářez V
    přes hranici úseku jede jedním cik cakem od stěny ke stěně (dřív jízda po stěně jedním tahem 14 mm a kousky zprava);
  - kapsa, kterou jiný průchod bere jen zčásti, se rozloží na podkapsy (celý program R5–R15: zářez V pod spodkem
    cik caku zůstal celý; zbytek R10 1208 → 676 mm²);
  - spodní vrstvy ubrané kvůli rampě pod offset se vezmou samostatnou kapsou (R15 zleva po úsecích: kapsa X309–447,
    zbytek 2884 → 340 mm²);
  - navazující obrácená vrstva nejede rychloposuvem přes čelo, když předchozí cestou vystoupala nad odskok (R20 zleva).
  - úsek nad údolím polotovaru nejede vlevo od hrbu pod dno údolí ani kapsami pod spodkem cik caku — údolí pod
    hranicí S7 vezme další úsek celé jedním cik cakem od stěny hrbu k levé stěně (díl (4) R20: dřív Ú1 cik cak mezi
    hrbem a hranicí až na X86 a Ú2 vrstvy od hranice doleva — údolí rozdělené na dva kusy).
  - dno údolí z plánu úseků je výška polotovaru, vrstvy jedou středem nosu — mez je dno + R (s R5 rozdíl nevadil,
    s R20 jel Ú1 ještě vrstvy X142/X134 k hranici, díl (5) N2050 Z556.262);
  - jízda po stěně v úzkém zářezu V odskočí rovně nahoru, ne šikmo do protější stěny (díl (5) N3550 G1 X72.121 Z558.512).
  - kapsa za začátkem úseku nejede vrstvu podruhé, když ji cik cak se vstupem nad stěnou už bere (díl (6) N2060 X144).
  0 kolizí R5–R20 z obou stran, otisk 32 fixtur shodný.

- **Cik cak: kapsa pod podélnou vrstvou** (`zigzagValley.js` `pocketsBelowZigzag` `belowLong`, karusel zprava,
  díl uživatele 6. 11.): v Ú2 jely vrstvy od hranice úseku rovně ke stěně (bez rampy, cik cak nevznikl) a kapsu
  pod poslední z nich (údolí X309–447 pod Z79, klín 18 mm) nebralo nic — kapsy pod spodkem se braly jen pod cik
  cakem. Teď i pod podélnou vrstvou, kterou nebere jiný průchod (mimo úsek nad údolím). Zbytek po úsecích
  3708 → 364 mm², celý program 800 → 348 mm² (zbývají rohy R15), 0 kolizí, otisk 32 fixtur shodný.
- **Cik cak celý program: kapsa odlitku až ke stěně** (`zigzagValley.js` `wedgeAbove`, soustruh, díl uživatele 6. 11.):
  „klín nad pásmem u stěny" byl ve skutečnosti vzduch kapsy odlitku a vrstvy, které už vzaly obrácené vrstvy,
  takže cik cak v kapse S15–S18 skončil na čáře zanoření a pod ní zůstalo 8 mm. Klín se teď počítá jen tam, kde
  nad vrstvou stojí polotovar, který nic nevzalo. Zbytek 124 → 32 mm².
- **Cik cak: jízda po stěně bez schodů** (karusel i soustruh, díly uživatele 6. 11.): „Hrub. bez schodků"
  na šikmé stěně schodkovala — u každé vrstvy 5 mm vodorovně (karusel N1820 X598.001), pod tím klín.
  Mez proti sjetí do neobrobeného V brala výšku vrstvy nad místem; teď smí o vrstvu níž, stěna jede jedním
  blokem / plynule po oblouku. 0 kolizí, ostatní strategie beze změny (otisk shodný).

- **Karusel u osy: zajetí do rohu dílu a výjezd za osu** (`cam/xzSwap.js` `openAtAxis`): uzavřená kontura
  s hranou po ose se pro výpočet otevře na ose — offset měl v bodě, kde kontura začíná i končí, díru, do které
  vjela vrstva pod rohem (X69 Z189), a „čelo" na ose se objíždělo výjezdem pod 45° za osu do dílu
  (`G1 Z191.154 X-5.200`). Tečkované náhledy (přídavek, hotovo) po ose zmizely. Pojistka v Cik cak zahodí
  vrstvu celou pod hrubovacím offsetem (`dropUnderOffset`).
- **Čísla bodů přes sebe** (`cam/sim/drawOverlays.js`): body kontury ve stejném místě jedním popiskem („1/18"),
  popisek polotovaru na bodu kontury pod bodem.
- **Karusel: dokončování jelo po ose otáčení celým obrobkem** (`cam/xzSwap.js`): osa (X = 0) je v prohozeném
  světě „čelo" a dokončovalo se jako čelo soustruhu (`G1 Z0 X-5`). Úsek celý za osou se teď nedokončuje.
- **Návrat z CAM do CAD přepnul karusel na soustruh** (`cam/sim/sendToCanvas.js`): osy výkresu se braly jen
  podle stroje v CAD; liší-li se od CAM, CAD se teď přepne na stroj z CAM.
- **Cik cak, jízda po dně:** roh u stěny na straně, kde jízda po dně začíná, dojede jízda po stěně (dřív zůstal
  nedojetý, N4500).
- **Cik cak až k čelům tam a zpět** (nový `ops/zigzagWallStart.js`, `zigzagValley.js`, `zigzagFloor.js`): u Cik cak
  vrstva u čela na straně začátku vjíždí od stěny (rampa o ap níž od konce mělčí vrstvy), ne z čáry zanoření.
  Karusel Od středu (díl uživatele, ap 8, ✂ Po úsecích): mezi šikmou stěnou S12–S13 a rampami zůstával klín,
  cik cak po dně pod ním začínal svislým zanořením posuvem (`G0 Z170` → `G1 Z145`) — 11 kolizí držáku v Ú1.
  Teď vrstvy dojedou ke stěně, cik cak v kapse jede od stěny ke stěně, 0 kolizí ve všech úsecích, zbytek
  24 274 → 23 555 mm² (celý program 4 111 → 2 088 mm²). Pojistka: pod klínem cik cak nejede přes čáru zanoření.
- **Cik cak: skákání mezi svahy hrbu nad vršek** (`ops/zigzagReverse.js`, regrese z 4. 11.): obrácená vrstva
  zleva se přes vršek napojovala na zbytek téže vrstvy vpravo i tam, kde pravá strana pokračuje další vrstvou níž.
  Celá pravá strana se pak stáhla mezi levé vrstvy a program 24× vyjel rychloposuvem nad hrb (soustruh, ap 2,
  Úsek 2). Teď se v tom případě nenapojí: nejdřív pravá strana, pak levá, 5 výjezdů, stejný úběr, 0 kolizí.
- **Bezpečná poloha natvrdo X500 Z500** (`camDefaults.js` → `CODE_OWNED_PARAMS`): načtený díl nebo autosave
  se starou Bp (např. X150 Z5) ji už nepřepíše. V panelu jde v sezení dál změnit, po načtení platí zas 500/500.
- **Hranice úseku na údolí polotovaru i na soustruhu u Cik cak, zprava i zleva** (`calculatePipeline.js` → `stockValleys`):
  úsek končí na údolí polotovaru jako na karuselu (Ú1/Ú2 místo jednoho úseku se zbytkem za hrbem). Ostatní
  strategie na soustruhu beze změny. Zleva: vrstva už nepřeskakuje rychloposuvem nad kusem do další oblasti
  (díl uživatele, ✂ Po úsecích: přejezdy materiálem posuvem v Úseku 1 ze 7 na 2, 0 kolizí).
- **Hranice úseku na údolí polotovaru jen na karuselu** (`sectionPlan.js`): na soustruhu přidávala úseky
  navíc u 27 fixtures (✂ Po úsecích), zleva i kolize. Soustruh je teď v ✂ Po úsecích i celém programu jako před 4. 11.
- **Spojený program (✂ Po úsecích, stejný nůž) jel rychloposuvem skrz díl** (`cam/gcodeMerge.js`): z koncových
  rychloposuvů části zůstal jen první — když to byl odskok od stěny (`G0 Z137.050`), výjezd nad konturu
  `G0 Z520` zmizel a dokončování najelo `G0 X71` ve výšce Z137 přes díl. Teď odpadne jen poslední (návrat
  druhé osy do startovní polohy).

- **Cik cak: přejezd po vršku po už ubraném místě** (`ops/zigzagReverse.js`): obrácená vrstva jela přes vršek
  hrbu i tam, kde v téže výšce už řezal kus pravé strany (karusel ap 6: 43,5 mm, ap 2: 27,5 mm posuvem
  vzduchem). Teď se tam zastaví; krátký zbytek u stěny, na který se napojí, projede dál.
- **Cik cak: podélný kus pod obrácenou vrstvou jel dřív než ona** (`ops/zigzagReverse.js`): po seskupení
  obrácených vrstev zůstaly kusy vrstev pod nimi na původním místě a zanořovaly se svisle do neubraného
  materiálu (na karuselu G1 10 mm dolů, tříska 8,9 mm při ap 2). Teď se zařadí mezi ně podle výšky.
- **Cik cak: klín u paty stěny** (`ops/zigzagReverse.js`): obrácená vrstva skončila za malým hrbem, zbytek
  vrstvy sjel ke stěně rampou 45° a pod ní zůstal klín (karusel, ap 6: „nedojeto 23 mm²", 4 mm). Teď se
  napojí na KRÁTKÝ zbytek u stěny (≤ 2R + 2ap, hned za návratem na výšku) a dojede k ní. Verze z téže noci,
  která vrstvu prodlužovala i přes dlouhý vršek, stáhla k sobě vrstvy pravé strany a program skákal mezi
  svahy s výjezdy rychloposuvem nad hrb — vráceno. Kontrola pravidla 7 uznává i obrácené vrstvy.
- **CAD mobil: snap na osy** (`canvas.js`): prstem se na osu Z/X skoro nedalo trefit (hrana i osa chytaly
  jen 12 px). Při dotyku je poloměr zachycení větší (body 30 px, hrany a osy 30 px), myš beze změny.
  Úhlový snap navíc konec čáry přichycený na osu z osy neodtáhne – bere průsečík úhlové přímky s osou.
- **Úpravy výkresu → Uzavřít konturu/polotovar**: úsečky uzávěru ležící na ose (osa rotace, rovina Z0) jsou
  pomocné čáry v barvě vrstvy, do CAM nejdou. Dřív se uzavřená smyčka dostala do CAM a hrubování jelo přes celý
  díl až za osu (X−5,2). Opakované uzavření nic nezdvojí.
- **CAD G-kód kreslení (editor z Kalkulaček): zmenšený editor nad plátnem** (`calculators/cncEditorLive.js`,
  `css/cnc-compact.css`): v oranžové liště vedle ✕ přibyly **▾** (rozbalí lištu ☰/🔗/G90/🔍/🔢/🔄 a řádek
  „Údaje a nápověda", jinak sbalené) a **⇲/⇱** (editor přes celý displej ↔ dole na půl displeje, nad ním plátno
  s živým náhledem psaného kódu, řádek s kurzorem žlutě; výkres se nemění, kreslí se přes `bridge.renderCncLive`).
  Na výšku menší tlačítka rychlé lišty.
- **Zmenšený CNC editor: ⤢ zarámovat a klepnutí na čáru** (`cncEditorLive.js`): ⤢ v oranžové liště vejde náhled
  nad editor; klepnutí na čáru náhledu na plátně dá kurzor na její řádek v kódu. Číselné zadání: klávesa **OK** na
  číselníku (`numPadBar.js`).
- **Číselné zadání: číselník pro dotyk** (`dialogs/numPadBar.js`): pod poli 1 2 3 4 5 6 7 8 / 9 0 . − ⌫ ⌨ Další ⇥,
  píše do posledního pole (i do zápisu G-kódu), systémová klávesnice se nevysouvá (⌨ ji vrátí, volba se pamatuje).
- **CAD G-kód kreslení: lupa pro umístění kurzoru** (`calculators/cncLoupe.js`): podržení prstu na kódu ukáže nad
  prstem zvětšený text s kurzorem, tahem se kurzor posouvá, puštěním zůstane (výpočet pozice z řádku × sloupce).
- **CAD G-kód kreslení: číselník vpravo vedle kódu** (telefon na výšku, `cncEditorLive.js`): 7 8 9 / 4 5 6 / 1 2 3 / − 0 .
  V editoru přes celý displej číselník plave vpravo dole přes kód, takže je nad ním vidět celý text.
  Číslice, tečka a mínus se vkládají bez automatické mezery (dřív klávesy číslic naležato psaly „X 1 2").
- **Mobil na výšku: panel nástrojů CAD nižší o ~3 řady** (`css/style.css`): víc vidět plátno, v tlačítkách
  se roluje. Horní řádek Výběr / Kóta / Tl Kon / Smaž / ✕ zůstává při rolování přilepený nahoře.

### Fixed

- **CAM: kontura končí na spodním konci polotovaru** (`cam/offsetStockEnd.js`): karuselový díl na stole (poslední
  bod kontury X846 Z0, polotovar od Z0) — silueta polotovaru rozšířená o R přečnívala pod díl a cik cak tam jel
  425 obrácených vrstev vzduchem (`G0 Z-6 / G1 Z0.5`). Offset hrubování se z konce kontury protáhne svisle pod
  polotovar; dokončování beze změny. Test `cam-contour-ends-on-stock-end`.
- **CAD karusel — přichycení k ose rotace a kóta úhlu od osy Z** (`canvas.js`, `dialogs/dimension.js`): kurzor
  se přichytí i ke svislé ose Z karuselu (X = 0) a klik na ni v nástroji Kóta dá polární úhel od osy Z —
  dřív obojí fungovalo jen pro vodorovnou osu soustruhu.
- **Karusel → CAM: kontura chodila obráceně** (`storage/fileIO.js` přenos do CAM): řetěz začínal na největším
  průměru (zadní konec dílu), protože se start hledal podle vodorovné osy výkresu — u karuselu je to X.
  Hrubování pak vyšlo jinak než u stejného dílu ze soustruhu (jiné průchody i kapsy). Start je teď na čele
  (max Z) i u karuselu; tentýž díl ze SOU i KAR dá v CAM bajt po bajtu stejný program, podélně i čelně, s
  nakresleným polotovarem i s dírou pro vyvrtávání (`tests/karusel-cam-equivalence.test.js`). Poháněné nástroje:
  díra nakreslená pod nástrojem jde na C0 u obou strojů (dřív u karuselu v pohledu Soustruh C270).
- **CAM Cik cak: dokončovací modul se neptá na druh operace** (`ops/zigzagFloor.js`): `zigzagSteepLimit`
  dostává příznak od rozcestníku (`calculatePipeline` `roughingKey`), test oddělení operací zase prochází.
  Program beze změny (otisk 32 fixtures shodný).
- **CAM přebírá typ stroje z CAD** (`cam/camDefaults.js` `syncParamsFromCad`): výkres nakreslený
  pro karusel se v CAM otevíral jako soustruh (výchozí / naposledy zvolený typ v CAM). Při otevření CAM
  se teď Soustruh/Karusel nastaví podle CAD (stejně jako mód X R/⌀), dráhy se rovnou kreslí a upravují
  v orientaci karuselu. G-kód se nemění — X radiální, Z osa vřetena platí u obou strojů.
- **CAD/CAM automatická oprava mezer při přechodu do CAM** (nový `dialogs/leftoverFixes.js`, `contourCheck.js`):
  dialog „čáry mimo profil" nabízí **🔧 Spojit a otevřít CAM**. Kontrola výkresu spojuje jen mezery do 0,5 mm
  mezi úsečkami; tady se ví, které čáry na profil nenavazují, takže se spojí mezera do 5 mm — úsečky do rohu
  (do 1 mm uprostřed, úsečka k oblouku na jeho konec), jinak se doplní spojovací úsečka (i mezi oblouky
  a polyline). Bez možné opravy dialog řekne proč (mezera moc velká / profil se větví).
- **CAD ⇋ Zrcadlit kolem osy na karuselu** (`render/mirrorSnap.js` `mirrorObjectAcrossAxis`, `mirrorEdges.js`,
  `geometry/select.js`): karusel má svislou osu rotace, zrcadlí se proto kolem x = 0 — z pravého horního
  kvadrantu do levého horního (dřív dolů jako soustruh). Hrany přes osu, SNAP, klik na zrcadlo, řádek
  „Hrany přes osu" ve Vrstvách i „◎ Do čela" fungují i na karuselu. Zrcadlo natočeného obdélníku neguje natočení.
- **CAD popisky os u počátku** (`render/axes.js`): záporné popisky vodorovné osy a popisky svislé osy těsně
  pod ní se už nepřekrývají s „0" a navzájem.
- **CAD přepnutí Soustruh ↔ Karusel prohodí i výkres** (nový `machineSwap.js`): výkres se zrcadlí přes
  úhlopříčku (wx ↔ wy), takže díl zůstane na svých souřadnicích X/Z — dřív se prohodily jen osy a kresba stála
  na cizích souřadnicích. Převede se i historie ↩/↪, kotvy, nulový bod, kóty a vazby (vodorovná ↔ svislá);
  kresby čel (bokorys) se jen přestaví. Osa rotace karuselu (svislá) je čerchovaná jako u soustruhu.
- **CAM Po úsecích — přechod mezi úseky** (`gcodeMerge.js`): beze změny nože se mezi částmi nevypíná vřeteno
  ani chlazení (M5/M9 + M3/M8) a nejede se do startovní polohy — po výjezdu od obrobku další úsek najede
  rovnou na svůj první průchod. Při výměně nože beze změny.
- **CAM „Výjezd nad konturu" jen tak vysoko, jak je třeba** (`gcodeEmit.js`, nový `cam/rapidLift.js`): když
  nízký přejezd neprojde (typicky držák opřený o stěnu už v cíli), zkouší se výš po 1 mm místo skoku na vrch
  celého polotovaru (Úsek 2: `G0 X69.017` → `G0 X34.230`). Čistý sjezd v X na stejném Z se nezvedá ani kvůli
  držáku — zdvih by vedl stejným sloupcem, jen delší cestou.
- **CAM Cik cak — obrácená vrstva přes roh offsetu** (`ops/zigzagReverse.js`): výjezd po stěně už nejede
  tětivou nad offsetem (rovná plocha → šikmá stěna, N2470 `X35.545 Z210.134`), ale přes jeho roh — zůstane
  jen přídavek na hotovo.
- **CAM Cik cak — čelo u spodku** (`ops/zigzagFloor.js`): „Hrub. bez schodků" projede i svislé čelo, ke
  kterému spodek cik cak dojíždí (schody mezi vrstvami na přechodu Úsek 1 → Úsek 2).
- **CAM ↺ Reset / Po úsecích s aktivní částí „Na hotovo"** (`sim/sectionFinishAtEnd.js` `baseFinishOnly`):
  „jen dokončovací operace" se z automatické části „Na hotovo" nepřenáší do hrubování.
- **Vyrovnání (Vodor. / Kolm.) nemění barvu úsečky** (`render/constraints.js`): zelené / fialové přetónování
  vyrovnané úsečky zmizelo (polotovar po vyrovnání zešedl); ikona vazby zůstává u vybrané vazby.
- **Kontrola výkresu:** oprava „skoro rovné čáry“ srovná celý řetěz rovných úseček (mikron se nepřenáší dál),
  popisek ukazuje 3 desetinná místa a návrat z CAM srovná mikronové schody polotovaru (`snapStockJitter`).

### Added

- **Kontrola výkresu i pod zvonečkem 🔔** (`contourCheck.js` `notifyDrawingFixes`): po každé úpravě výkresu,
  když přibude nová drobná chyba, přijde hláška pod zvoneček v horní liště; klepnutí otevře okno s opravami.
  Každá chyba se hlásí jednou; nad 800 objektů se po úpravách nekontroluje. Dokud je co opravit, zvoneček
  zůstane červený (`.has-warning`), po opravě zešedne. V panelu zvonečku tlačítka **🔧 Opravit automaticky (N)**
  (vše bez okna, jeden krok Zpět; `autoFixDrawing`, `state.js` `setNotifyActions`) a **☑ Vybrat opravy…**. Test
  `tests/drawing-fix-dialog.test.js`.
- **CAD → CAM – Kontrola výkresu s opravami k zaškrtnutí** (`dialogs/drawingFixes.js`, `axisFix.js`,
  `fixShared.js`; okno `contourCheck.js` `offerDrawingFixes`): při otevření CAM a ručně (⚙ Nastavení →
  🔧 Zkontrolovat výkres) najde drobné chyby s jednoznačnou opravou — konec čáry do 2 mm od osy → na osu,
  pahýl → smazat, přesah za roh → zkrátit, mezera do 0,5 mm → spojit do průsečíku, konec do 0,5 mm u čáry
  → prodloužit / zkrátit, skoro vodorovná / svislá úsečka (do 0,05 mm, delší než 2 mm) → narovnat.
  Okno se seznamem, zaškrtávátko a ⌖ přiblížení u každé opravy, žluté vyznačení, jeden krok Zpět.
  Z výkresu uživatele 2. 11. 2026 (čelo od X −0,301, otevřený polotovar). Testy `tests/axis-fix.test.js`,
  `tests/drawing-fixes.test.js`, `tests/drawing-fix-dialog.test.js`.
- **CAM – strategie ⇋ Cik cak** (kulatá destička v úzkém držáku, `cam/ops/zigzagRough.js`, `zigzagReverse.js`,
  `zigzagEmit.js`): Podélně podle všech pravidel, jen vrstva za hrbolem, která by vyjela do prázdného prostoru
  (bez polotovaru), se vezme obráceně — ze vzduchu ke stěně hrbolu, bez zanoření a bez klínu pod čarou zanoření.
  Spodek pod polotovarem u hranice úseku cik cakem až ke stěně v sousedním úseku (`zigzagFloor.js`) —
  začátek u pravé stěny, rampa nekončí za šikmou stěnou, dno bez návratu po stejné hloubce. Výjezd obrácené
  vrstvy po oblouku stěny bez schodků, nejvyšší vrstva pokračuje po průměru přes vršek hrbolu. Dokončování
  v úseku se spodkem cik cak sjede po pravém čele a dokončí dno až ke stěně. Schody na šikmých stěnách
  spodku dojede jízda po hrubovacím offsetu (s přídavkem) ještě při hrubování — jen s „Hrub. bez schodků".
  „✂ Po úsecích" s dokončováním: úseky jen hrubují, na konci jedna část **Na hotovo** přes všechny úseky
  naráz (`cam/sim/sectionFinishAtEnd.js`); dokončení sjede i po vyhrubovaných svislých stěnách.
- **CAM – spojený program:** referenční blok `; --- KONTURA (Pro referenci) ---` je jednou na konci, ne z každé části
  (`cam/gcodeMerge.js`). Čára přídavku se v náhledu
  kreslí bez napojení na čáru zanoření.
  Pravidlo 20 v `docs/cam-pravidla.md` je NÁVRH. Testy `tests/cam-zigzag-reverse.test.js`,
  `tests/cam-zigzag-sections.test.js` (díl uživatele po úsecích).
- **CAM – úzké držáky v 🔧 Zásobníku** (`calculators/narrowHolders.js`): T8 **SRDPN úzký** (kulatá R5,
  lišta o 0,5 mm/stranu užší než ⌀ destičky) a T9 **Upichovák úzký** (4 mm, rovná lišta o 0,2 mm/stranu užší).
  Kolmé čelo bez drhnutí z obou stran; změna R / šířky destičky lištu přestaví (`holderFollowsInsert.js`,
  nově i pro upichovák). Výchozí sada revize 4 — do uloženého zásobníku se přidají jednou. Test `tests/narrow-holders.test.js`. Hlídání držáku (`toolEnvelope.js`)
  u držáku celého ve stínu destičky bere siluetu zmenšenou o R dokola (ne posunutou dolů) — jinak vrstvy u stěny
  končily o 2,5 mm dřív než se SRSCR téhož R; ostatní držáky beze změny (otisk 32 fixtures shodný).
- **Tolerance ISO 286 nad 500 do 3150 mm** (`calculators/iso286Large.js`) – pro velké průměry na karuselu.
  IT1–IT18 a základní úchylky d–s / D–S opsané z tabulek ISO 286-2:2010 (r, s v jemných podrozsazích),
  každá hodnota zkontrolovaná rozdílem = IT. Nad 500 mm: a, b, c, j nedefinováno, díry K–S bez Δ.
  Test `tests/iso286-large.test.js` (hodnoty přímo z tištěných tabulek normy).
- **Tolerance – značky geometrických tolerancí ISO 1101** (`calculators/toleranceGdt.js`, `css/tolerance-gdt.css`):
  sbalitelná sekce se 14 značkami (SVG – znaky ⌭ ⌯ ⌰ chybí v části písem), tolerančním polem, kontrolou
  u stroje, doplňkovými značkami (Ⓜ, Ⓔ, Ⓟ…), vzorovými rámečky a poznámkou o měření v upnutí. Test `tests/tolerance-gdt.test.js`.
- **PWA přes celý displej** – `manifest.json`: `display: fullscreen` (s `display_override` a zálohou `standalone`); v záložce prohlížeče je v Nastavení tlačítko ⛶ Celá obrazovka (`fullscreen.js`). Nainstalovanou PWA je po změně potřeba odinstalovat a nainstalovat znovu. Dvojklep na mobilní ↩ celou obrazovku ukončí (první klep se vrátí přes redo). V celé obrazovce se naležato nechává pevný okraj (48 px) na straně kamery (`fs-cam-left/right` podle natočení), boční tlačítka a okna se řídí proměnnými `--safe-l/--safe-r`; ⛶ je i v horní liště bočního panelu a ta lišta zůstává nahoře při rolování.
- **CAD – šrafy řezu ve Vybarvit** (`render/hatch.js`): výplň může mít místo barvy šrafy 45° / 135° / křížem
  s roztečí v mm výkresu (výchozí podle velikosti plochy, při malém zoomu se ředí). Kreslí plátno i export PNG.
- **CAD – pomocné vrstvy** (`helperLayer.js`): přepínač v řádku vrstvy; objekty se kreslí tlumeně a nejdou do
  CAM, CNC kódu (`runCncExport`) ani DXF exportu, netvoří hranici pro Vybarvit, nepočítají se do kontroly
  mezer / větvení / zdvojených čar (`stockTools`) ani do profilu pro bokorys (`profileObjects`).
  Testy `tests/hatch-helper-layer.test.js`, `tests/helper-layer-contour.test.js`.

- **CNC Editor – Úsečka úhlem: šipky ✛ u polárního úhlu** (`calculators/cncAngleCompass.js`). Mřížka osmi
  směrů jako v číselném zadání; úhel se počítá podle typu stroje (soustruh / karusel) a zrcadlení os, aby
  šipka odpovídala směru na obrazovce. Test `tests/cnc-angle-compass.test.js`.
- **CNC Editor – dialog ⌒ Oblouk** (`calculators/cncArcModal.js`, `cncArcTools.js`): jedna klávesa místo G2, G3 a T; první řádek lišty má pět kláves R, I, K, G (číselník se seznamem G-kódů) a ⌒ oblouk. Smysl G2/G3,
  Netečně / Tečně, konec X+Z, R a **úhel rozevření** (konec + úhel → R, tečně + R + úhel → konec); velký oblouk záporným R,
  G91 přírůstky, živý výsledek a chyby z analýzy editoru. Testy `tests/cnc-arc-tools.test.js`, `tests/cnc-arc-modal.test.js`.
- **CNC Editor – úsečka úhlem: tlačítko ⟿ Tečně.** Nastaví odklon 0° od předchozí úsečky / oblouku, takže
  nová úsečka tečně naváže na konec oblouku. Tlačítko se ukazuje jen za obloukem a „Od předchozí“ jen za úsečkou. V režimu Tečně je odklon pevně 0° (pole jen pro čtení), komentář řádku „⟿ tečně“; režim „Od předchozí“ z minulého otevření se za obloukem už nepřenese. Test `tests/cnc-tangent-continue.test.js`.
- **CNC Editor – automatické G0/G1 po Enter** (`calculators/gcodeAutoMotion.js`): první řádek se
  souřadnicemi bez G dostane G0, další G1; řádky s G, R/I/K, komentáře a makra se nemění, platí-li už G1,
  holý řádek zůstane. Test `tests/gcode-auto-motion.test.js`.
- **VK – záporné R = oblouk větší než půlkruh** (`G3 X0 Z-10 R-6`, jako v ISO): náhled i 📥 Vložit do výkresu ho kreslí se středem na druhé straně tětivy. U dopočtu (`?`) a u `T` se záporné R opraví na kladné s oznámením (tvar určuje tečnost). `R0` se odmítne.
- **VK – srovnání zápisu a ochrana proti překlepům** (`calculators/vkNormalize.js`): parser VK teď
  rozumí lidskému zápisu (`g01 x10,5 z -3`, `G02`, `.5`, `X10+5`, `X=10`, `G1X10Z-5`, číslo bloku)
  a po opuštění pole ho srovná na kanonický tvar. Řádky, kterým nerozumí (neznámý příkaz, `I/J/K`,
  `X10 -5`, oblouk bez R, záporné/nulové R, dvakrát stejná adresa, `T1`, VPOL3…), se hlásí pod polem
  místo tichého zahození; **📥 Vložit** a **⇄ Konvertovat** s chybou nic neudělají. Test `tests/vk-normalize.test.js`.
- **Drsnost – cílová hodnota → převod:** zvolená nebo zadaná cílová Ra/Rz se rovnou vyplní do převodu Ra ↔ Rz (text v závorce zrušen); pole f max zvětšeno jako hlavní výsledek.
- **Drsnost – popisky:** nad radiusy plátku popisek „Radius plátku“; zpětný výpočet bez nadpisu, pole cílové Ra vlevo a nad tlačítky „Drsnost Ra/Rz“ (stejné uspořádání jako rε), f max pod tím.
- **Drsnost – kompaktnější okno:** přepínač Ra/Rz nahoře, materiály obrobku a nástroje vedle sebe, rε na jednom řádku s běžnými radiusy, odstraněna nápověda „Zadejte posuv a radius“, korekční faktory a třída drsnosti přesunuty dolů pod převod Ra ↔ Rz.
- **Drsnost – Ra ↔ Rz:** sekce převodu Ra ↔ Rz s poměrem ×4 brus. / ×5 fréz. / ×6 soustr. (stejně jako v Převodníku) a u cílové hodnoty v závorce přepočet (Ra 0,8 µm (Rz ≈ 3,2 µm)).
- **Kalkulačky:** Řezné podmínky přesunuty do hlavní mřížky (místo Vrtáku), Vrták je v Další kalkulačky.
- **Drsnost – rychlá volba cíle:** tlačítka základních hodnot Ra (0,2 / 0,4 / 0,8 / 1,6 / 3,2 / 6,3 / 12,5) nad zpětným výpočtem; v režimu Rz řada Rz (0,8–50). Klik vyplní cílovou hodnotu a hned spočítá max posuv.
- **Panel Vlastnosti:** bez vybraného objektu je sbalený a v hlavičce hlásí „Není vybrán objekt"; po výběru se sám rozbalí.
- **Nm – utahovací momenty** (pravý panel → Kalkulačky → 🔧 Nm): vlastní seznam
  nožů s momentem dotažení plátku (uložený v prohlížeči, hledání, úprava),
  orientační tabulka šroubů VBD M2–M8, moment šroubu M4–M36 podle VDI 2230
  (upínky na desce karuselu), nastavení momentového klíče s prodloužením
  a převod jednotek. Moduly `calculators/torque.js`, `torqueMath.js`, test
  `tests/torqueMath.test.js`.
- **Nm – Kenloc:** tabulka čepů Kennametal Kenloc (imbus 2 / 2,5 / 3 mm →
  1,7 / 3,3 / 5,5 Nm) a automatický návrh v Moje nože podle označení plátku
  (ISO i ANSI) nebo zadaného imbusu. Doplněny šrouby upínek shora (imbus
  2 / 2,5 / 3 / 4 mm → 2,1 / 4,0–4,2 / 6–7 / 17 Nm).

### Fixed

- **Vstup do CAM nabídne opravy výkresu pokaždé** (`contourCheck.js` `openCamFromDrawing`) – po „Ponechat vše"
  (i v okně otevřeném ze zvonečku) se okno při dalším vstupu do CAM už neukázalo. Odmítnutí teď tlumí jen
  opakované hlášky zvonečku. Test `tests/drawing-fix-dialog.test.js`.
- **CAM – díry z výkresu se v soustružení nekreslí** (`live/liveModel.js` `liveShownInTurning`) – díry
  a spodní polovina řezu jen na záložce Vrtání / Frézování; dřív se díry z bokorysu ukazovaly i v hrubování,
  kde se nevrtají. Test `tests/face-cam-transfer.test.js`.
- **CAM – čelo začínající kousek pod osou nevypadne z kontury** (`cam/contourBuild.js`
  `foldContourToMachiningSide`) – úsečka, která z bodu pod osou (např. X −0,301) vychází nahoru, se ořízne
  na ose stejně jako úsečka jdoucí osou dolů; dřív se zahodila celá a v CAM chybělo čelo. Otisk CAM shodný.
  Test `tests/cam-fold-face-below-axis.test.js`.
- **CAM – upichovák: dokončování nezačíná ve vzduchu** (`ops/finish.js`) – za úsekem vynechaným kvůli držáku jela obálka
  nejdřív ve výšce hrubování a nic neubírala (3,2 mm posuvem vzduchem); body, jejichž výšku určuje jen vynechaný úsek,
  se odříznou a řetěz začne tam, kde se řeže.
- **CAM simulátor – SBL: ▶ po zastavení nereagoval** (`cam/sim/singleBlock.js`, krokování ⏭/⏮) – zastávka leží
  přesně na i/total a floor(i/total·total) vyšlo u části řádků i − 1 (plovoucí čárka); za aktuální se bral předchozí
  řádek a cíl vyšel na místě (N1160, N1340, N230…). Teď s tolerancí.
- **CAM simulátor – SBL za běhu** (`cam/sim/singleBlock.js`) – zapnutý během přehrávání se nezastavil po dokončeném
  bloku (cíl se počítal jen při ▶); teď dojede aktuální řádek a zastaví. Test `tests/sim-single-block.test.js`.
- **CAM – čelní hrubování: sjezd po kolmé stěně** (`ops/face/wallLayers.js`, pravidlo 3) – mřížka po ap na stěnu
  (čelo dílu, osazení) nesedla a před ní zůstalo až ap navíc (díl uživatele zleva: čelo Z 0 1,2 mm, osazení Z 205
  2,4 mm). Průchod za stěnou teď zabere ap shora, na vršku stěny se posune ke stěně (0,02 mm před svislici offsetu)
  a sjede po ní na dno – bez vrstvy navíc. Konec offsetu (`maxOZ`, `roughFace.js`) bere oblouk jen v jeho skutečném
  rozsahu (celá kružnice tiše přeskakovala vrstvy u čela); pás schodu v hlídání držáku sahá jen k sousední vrstvě
  (`holderGuard.js`).
- **CAM – upichovák: dokončení kolmého čela zhora dolů** (`ops/finish.js`) – čelo na začátku jízdy je samostatný
  řetěz shora k ose s odskokem 45°; dřív nájezd sjel čelem a dráha se vracela posuvem nahoru.
  Totéž u kolmé stěny uprostřed (osazení): dno dojede ke stěně → odskok → stěna shora dolů → odskok → průměr;
  po stěně nahoru by horní strana držáku brala materiál (`wallsTopDown`). Dno se zastaví o přídavek na hotovo
  (+0,02) před stěnou – na stěně ještě stojí přídavek a bok plátku s držákem by do něj vjel po celé výšce.
  Shora dolů se bere i mírně nakloněná stěna, pokud by držák při jízdě zespodu zasáhl přídavek: mez sklonu se
  počítá z obrysu držáku (`climbSlopeMin`; MGEHR ≈ 89,6°), dost odkloněná stěna se jede zespodu po obálce.
- **CAM – dokončování: pahýl řetězu po vyřazeném úseku** (`ops/finishEmit.js`, `dropStubChains`) – když filtr
  vyřadí úsek uprostřed řetězu (držák ve zbytku, tříska nad ap, začátek ve zbytku), zbytek, který po hotovém tvaru
  nejede aspoň 0,2 mm (u upichováku počítá celé dno), odpadá – jinak jen sloupl přídavek a vyjel posuvem vzduchem
  (part-17: 3,9 mm).
- **CAM – upichovák: svislé čelo na konci dílu v obálce** (`ops/finish.js`) – obálka vzorkuje x(z) a svislé čelo
  (zleva k Z 0) z ní vypadlo; na straně těla za koncem celé dráhy se vrací.
- **CAM – upichovák: záložka Hrub./Hot. už nemění plátek** (`cam/sim/machTabTool.js`) – bez bodu upichnutí
  zůstane upichovák (hrubuje čelně, dokončuje); dřív se vyměnil za soustružnický nůž ze zásobníku.
  Test `tests/drill-from-cad.test.js`.
- **CAM – čelně upichovákem bez zbytečného dojezdu „bez schodků"** (`ops/roughEmit.js`) – dojezd po rovině
  v hloubce zápichu, který celý leží pod rovnou částí spodní hrany plátku (`flatSpanZ` = b − 2R), se vynechá:
  zápich ho už vyřízl, jel by vzduchem (pravidlo 5). Delší dojezd než rovná část zůstává.
- **CAM – upichovák: pila v dokončování za vynechaným úsekem** (`camMath.js` `partingEnvelopeAt`) – kde dráha
  začíná uprostřed okna plátku (za úsekem vynechaným kvůli držáku), vzorky obálky přeskakovaly její začátek
  a dráha skákala ±0,2 mm na sražení a ±3,5 mm na čele (zajetí do kontury). Okraj se dohledá půlením.
  Kde dokončovací dráha není (úsek vynechaný kvůli držáku nebo jen zčásti oříznutý), bere obálka výšku po
  hrubování (hrubovací offset = kontura + R + přídavek) – jen v mezerách mezi úseky, za začátkem jízdy.
  Dřív tělo plátku zajelo do vynechané roviny (`N8770 G1 X9.296 Z347.166`), sjelo přídavek „jako na hotovo"
  a rádius ubral roh bodu 10 (`N8620 G1 X9.319 Z167.558`).
  Test `tests/cam-parting-envelope-edge.test.js`, fixture `parting-finish-envelope-edge.camprog`.
- **CAM – čelní doběh jel posuvem od osy ven** (`cam/ops/face/layerDepth.js`): hlídání hloubky vrstev zvedlo
  doběh na konci úseku nad jeho začátek a doběhy z vynechání vyjímalo (nález uživatele: `G0 X37.860` →
  `G1 X38.735` na Z56,932, celý vzduchem). Konec nad začátkem teď vynechá i doběh, stejně jako hlídání držáku.
  Fixture `part-25-face-runout-reversed`, test `tests/cam-face-runout-not-reversed.test.js`.
- **CAM – rychloposuvy hlídají celou destičku a držák** (`cam/faceTransitGuard.js`, `cam/gcodeEmit.js`,
  `cam/collisionValidator.js`): dřív se při G0 hlídal jen nos a břit. Natočená destička má ale zadní roh níž
  než nos — podélně zleva drhla tělem po čele příruby (`G0 Z193.478` → `G0 X60.545`, 21,5 mm² do materiálu,
  part-11/12/14/21), čelně sjela rohem pod offsetovou čáru. Validátor teď měří G0 celou destičkou (⛔ je to
  vidět červeně), emise přejezd zvedne a sjezd zastaví rychloposuvem tam, kde je celá destička volná, zbytek
  dojede posuvem. Řezná rampa vjezdu dál testuje jen držák (destička řeže). Upichovák: jen destička (plánovací
  model má u držáku mezi zápichy fantom). `tests/cam-collision-free` zelený na všech fixtures.
- **CAM – čelně: kužel natočené destičky bez schodů** (`cam/ops/face/holderGuard.js`, `cam/ops/face/layerDepth.js`,
  `cam/ops/roughFace.js`): hlídání držáku bralo pod hotovou vrstvou rovné dno ve výšce středu nosu, ačkoli za
  nosem zůstává kužel spodní hrany (o R/cos φ + t·tan φ níž) → zvedalo každou druhou vrstvu (+1,072/+1,591)
  a na polotovaru zůstaly schody. Vrstvy po kuželu se vynechávají až nad OFFSETOVOU čarou (dotyk obrysu
  nosu), doběh se podle nosu nevynechává (hrana za nosem bere pás) a mez nad neobrobeným pásem je offsetová
  čára + R/cos φ (dřív nakreslený obrys + přídavky dílu → zadní hrana pod offsetovou čarou). Doběh na konci
  úseku se posuzuje k offsetové čáře a doplní se znovu i po posledním hlídání vrstev (konec úseku tam umí
  ustoupit) — jinak pod nosem poslední vrstvy zůstal oblouk místo pokračování kuželu.
  Audit „nakreslený polotovar × offsetová čára“: k offsetové čáře teď rozhoduje i vynechání průchodu jako
  „řez vzduchem“ při generování (`roughFace.js`), v hlídání destičky (`insertGuard.js`), držáku
  (`holderGuard.js`) a zanoření kulaté (`plungeDescent.js`, dno neobrobeného pásu = offsetová čára + R, ne
  nakreslený obrys + přídavky dílu). Např. part-16 dostal u Z108 plnou vrstvu místo doběhu.
  Natočená destička má na konci úseku JEDINÝ doběh, posunutý po kuželu nejdál, kam nos ještě zajede do pásu
  odlitku (nejvýš ap od poslední vrstvy) — dřív 2–3 doběhy těsně za sebou a pod posledním klínek po rádiusu
  špičky (part-25 Z114,5). Upichovák (bez kuželu) beze změny.
- **Podélné hrubování: materiál až po offsetovou čáru** (pravidla 1 a 9, `cam/ops/roughLong.js`,
  `long/realStock.js`, `long/depthTabs.js`, `sections/sectionPlan.js`): dojezd na konci polotovaru jede
  až k offsetové čáře (dřív Z −9,084 u nakresleného čela). Mazání průchodů, které nic neuberou, měří
  materiál k offsetové čáře a proti dřívějším průchodům (podlaha spočtená jednou — opakované skládání
  zpomalilo generování až 7×). Tabulka projetých drah má za oběma čely okraj vzduchu 20 mm a zapisuje
  i vrstvu pravidla 7, ze které zbyla jen rampa. Vrch úseku (kreslení „Po úsecích") je na offsetové čáře.
  Úběr skutečného polotovaru beze změny, dráhy kratší (o 1–6 %). Kulatá destička (`rule7Layers.js`)
  dál měří „skutečný" materiál k nakreslenému polotovaru — s offsetovou čárou tam vznikaly rampy vzduchem
  a vrstvy před čelem. Testy: pravidlo 9 přepsáno na offsetovou čáru (`cam-real-stock-layers`), model
  zbytku se měří mezi vzorky a nad osou (`cam-strategy-residual`).
- **Rampa do prázdna bez srpku po rádiusu** (`cam/ops/long/entryRamp.js`, `findRampOutTarget`):
  uzavírací rampa u strmého čela polotovaru končila, jakmile z offsetové čáry vyjel STŘED nosu —
  přední spodní oblouk nosu materiál ještě bral a zůstal srpek (díl uživatele, úsek 2 u S14:
  `G1 X36.697 Z107.555`, 0,075 mm). Teď jede, dokud nevyjede celý oblouk (konec dopřesněn půlením);
  na dílu uživatele dojede na hranici úseku Z 107,236. Test `cam-ramp-exit-nose`.
- **Opravy po kontrole kódu:** čelní doběh doplněný až po posledním hlídání vrstev projde i omezením
  sjezdu (`limitDescent`) a započte se do varování „Doběh na konci úseku"; podlaha dřívějších průchodů
  v `realStock.js` drží celá pole jen po 16 drahách (paměť ~16× menší, výsledek týž); ochrana čelního
  přejezdu se staví jednou za emisi; odchod ze záložky Vrtání zavře pohled na čelo jen tehdy, když ho
  otevřela ona (ručně otevřený zůstane).
- **CAM – vrtání se neukazuje při jiném obrábění** (`cam/live/liveModel.js`, `liveSection.js`, `liveDrillUi.js`,
  `sim/drawLowerHalf.js`): díry operace Vrtání (a spodní polovina řezu) se v náhledu soustružení kreslí jen na
  záložce Vrtání / Frézování nebo jsou-li z výkresu; při odchodu ze záložky se pohled na čelo zavře.
- **CAM – kontrola pravidel umí čelní hrubování** (`scripts/cam_rules_check.mjs`): měří v prohozených osách
  (hloubka vrstvy v Z), třísku čelně jen podle skutečného úběru; P7/P8 se čelně nehodnotí (pravidla jsou podélná).
- **CAM – kolmý nájezd dokončování po hrubovací rampě** (`cam/ops/roughEmit.js`, `cam/ops/finishEmit.js`):
  hrubovací rampa průchodu s nulovým dnem se nezapisovala do zbytkového modelu emise, takže dokončování
  v koridoru své nájezdové rampy „vidělo“ materiál, rampu zahodilo a sjelo kolmo (nález uživatele, Ú2 zleva:
  `G0 X16.289` → `G1 X14.489`, pravidlo 15). Vydané řezy rampy se teď do modelu zapisují a nájezdová rampa
  smí vzít tolik, kolik by vzal náhradní svislý sjezd (přídavek + 0,2 mm). Výjezdy, které model dřív držel
  „materiálem posuvem“, jdou kde je vzduch rychloposuvem; kolize 0. Fixture `part-24-zleva-finish-ramp`,
  test `tests/cam-finish-ramp-after-rough-ramp.test.js`.
- **CAM – komentáře ve výstupu pro Fanuc** (`cam/controlDialect.js`, `cam/ops/roughEmit.js`): hlavička
  `( --- HRUBOVANI (CELNI) --- )` měla vnořené závorky (první `)` ukončí komentář, zbytek řízení četlo jako kód)
  a přejezd materiálem posuvem psal natvrdo `; …` i do Fanucu. Teď se závorky v textu komentáře u Fanucu vypustí
  a přejezd jde přes `note()`. Sinumerik a Heidenhain beze změny. Test `tests/cam-fanuc-comments.test.js`.
- **Chybějící barvy palety** (`css/style.css`): `--ctp-subtext1`, `--ctp-overlay1`, `--ctp-teal`, `--ctp-flamingo`
  a `--ctp-lavender` se používaly (18 míst), ale nebyly definované – aktivní štítek v Příkazech / Příkladech
  neměl pozadí, zvýraznění syntaxe a nadpisy sekcí neměly barvu. Doplněny hodnoty Catppuccin Mocha a Latte.
- **Mobil naležato – modální okna** (`css/landscape-mobile.css`, nízký displej ≤ 500 px na šířku): okna
  využijí celou výšku a tělo se posouvá. CNC Editor jde přes celý displej, kód je vlevo a klávesnice vpravo
  ve vlastním posuvném sloupci (dřív zabrala celou výšku a kód nebyl vidět). Vnitřní dialogy editoru mají
  strop podle výšky displeje.
- **VK „Zadání objektu“ naležato** – okno je ukotvené vpravo přes celou výšku a plátno zůstává vlevo (`visibleCanvasRect` v `canvas.js` teď umí zúžit výřez i zprava, centrování a „přizpůsobit“ se řídí `centerX`).
- **Tolerance / Kužel** – volné míry a volné geometrické tolerance jsou dole pod výsledkem. Naležato jsou Tolerance i Kužel ve dvou sloupcích vedle sebe (vstupy | výsledek, resp. náčrt | údaje). Tolerance už naležato nenechává prázdný pruh dole (inline `max-height` v `tolerance.js` bral 48 px navíc).
- **Kužel naležato** – velký náčrt vlevo (při rolování zůstává na místě), údaje vpravo; poznámka „Klepni na kótu…“ se naležato skrývá.
- **Základní kalkulačka naležato** – okno začíná u horního okraje a jde až dolů (bez prázdného pruhu nad ní), tlačítka jsou nižší, takže se vejde celá klávesnice; historie dostane zbylé místo.
- **Ostatní kalkulačky naležato** (Závity, Vrtání, Řezné podmínky, Oblouk…) – širší okno, pole ve třech sloupcích a náčrty nejvýš 55 % výšky displeje, takže se míň rolují.
- **Kontrola celé obrazovky a naležato** – zavírání tabulek v Toleranci a přerámování plátna kolem pravého okna VK platí jen na nízkém displeji naležato (na výšku a na počítači beze změny); proměnné `--safe-l/--safe-r` mají v `style.css` záložní hodnotu; test `tests/fullscreen.test.js`.
- **Naležato: přeskládání CNC Editoru a Tolerance** – v editoru je oranžová lišta se ✕ vlevo nahoře, vpravo dole klávesnice s číselnými klávesami 0–9 nad ní (`digitKeysHTML`) a číselník (zadání X, Z…) se otevírá v pravém sloupci místo klávesnice. V Toleranci je vpravo zadání s rozbalovátky Volné míry / Geometrie, vlevo výsledek; po rozbalení je vlevo místo něj tabulka (otevřená vždy jen jedna) a přepnutí „Třída a stupeň ISO / Vlastní úchylky“ tabulky sbalí.
- **CAD – Centr (Ctrl+0 / Home / start)** rámuje při zapnutém bokorysu i jeho kruh, ne jen nárys.
- **CAD – 🗑 Smazat aktuální výkres** vypne bokorys; zůstane prázdný nárys.
- **CAM – úbytek kroku vrtání a kontrola hluboké díry** (`live/liveModel.drillLevels`, `liveChecks.deepHoleIssue`).
  Pole „Úbytek kroku" (0 = stálý): každý další záběr o úbytek kratší, nejméně úbytek. Sinumerik DAM
  v CYCLE83 (dřív pevně 0), Fanuc G83/G87 ho neumí → díra rozepsaně s poznámkou; simulace stejné záběry.
  Kontrola: špička > 3×Ø naráz nebo jen s lámáním třísky ⚠ (tříska nemá kudy ven).
- **CAM – hloubka díry poháněným vrtákem = hloubka plného Ø** (`live/liveModel.drillDepth`). Jako kóta
  na výkrese a nárys v CAD: špička 118° jede o 0,3·Ø dál (Ø8 hl. 100 → NC na 102,4). Dřív jela špička jen
  na hloubku, plný Ø byl o 0,3·Ø mělčí. **Mění G-kód** slepých děr (CYCLE82/83, G83/G87, rozepsaně);
  díra skrz z výkresu (`depthAtTip`, přesah už na špičku), navrtání a závit beze změny. Simulace, řez,
  pohled na čelo i kontroly počítají se špičkou; formulář „Hloubka plného Ø", popis „hl. 100 (špička 102.4)".
  Test `tests/live-drill-depth.test.js`.
- **CAM – kontrola: vrták dosáhne** (`live/liveChecks.drillReachIssue`). Hloubka špičky proti vyložení
  vrtáku ze 🔧 Zásobníku (slot T operace): za vyložením ⛔ upínač narazí do dílu, za šroubovicí
  (vyložení − 5 mm, `isoDrills.DRILL_FLUTE_GAP`) ⚠ tříska nemá kudy ven — dlouhý vrták DIN 340.
- **CAM – úběr vrtání v řezu už nepředbíhá vrták** (`live/liveSection.js`). Úběr kreslí plný Ø do
  hloubky špičky − 0,3·Ø a špičku na ní (tak jede NC i vrták v simulaci); dřív byl plný Ø až do hloubky
  špičky a kužel za ní, vyvrtaný materiál byl o 0,3·Ø před vrtákem.
- **CAM – 🛠 Operace už neschová řez a posuvník řezu nastaví, odkud se vrtá** (`live/livePanel.js`,
  `live/liveCutBar.js`). Editor operací se otevírá v panelu vedle řezu (dřív maximalizoval pohled přes
  celé okno a nárys nebyl vidět). Klepnutí na operaci posune rovinu řezu na její Z čela; nové tlačítko
  **⇥ Vrtat odsud** v liště řezu nastaví Z čela a stranu vybrané operace (jinak zaškrtnutých děr) na
  rovinu řezu. Díry z výkresu mají Z čela z CAD — tlačítko poradí, kde ho změnit.

- **CAM – vrtání děr z výkresu: jedno nastavení místo dvou.** V záložce Vrtání se pod dírami z výkresu
  ukazovala i pole středové díry v ose (jiná hloubka než u děr — např. 20 × 10 mm) a z nich se do děr
  kopírovaly Q, prodleva a bezp. vzdálenost, které přepisovaly hodnoty zadané v 🛠 Operace. Teď má každá
  vybraná skupina děr v záložce vlastní pole Hloubka / Q / tříska / prodleva / bezp. vzdál. (tatáž data
  jako formulář v pohledu na čelo) a pole středové díry jsou vidět, jen když se opravdu vrtá v ose
  (`live/liveDrillUi.js`, `live/liveDrillTools.js`, `sim/paramsMachiningHtml.js`).

- **CAM → CAD: kontura se vracela do aktivní vrstvy** (`cam/sim/sendToCanvas.js`): s aktivní *Konstrukcí*
  skončila kontura v ní (šedě, a 🗑 Konstrukce by ji smazal). Kontura a poznámka s programem jdou teď vždy do
  vrstvy *Kontura*, polotovar do *Polotovar*, konstrukční čáry do *Konstrukce*.
- **CAD: průsečíky skryté vrstvy zmizí** (`geometry/shownIntersections.js`): po skrytí vrstvy (třeba
  *Konstrukce* s vodítky plátku z CAM) se její průsečíky nekreslí, nejsou v seznamu, v CNC Editoru ani pro
  SNAP; ve `state.intersections` zůstávají kvůli exportu CNC. Každý průsečík nese `pairs` (vrstvy dvojice).
  Nově **🗑 v řádku vrstvy** smaže všechny objekty vrstvy (vrstva zůstane, ↩ Zpět). Test
  `tests/shown-intersections.test.js`, `tests/ui-layer-row-actions.test.js`.
- **CAD ⇋ Zrcadlit kolem osy – hrany přes osu jako na výkrese** (`render/mirrorEdges.js`): spojí se i tečné
  přechody zaoblení (konce oblouků R), všechny hrany jednotně tenkou plnou čarou (½ tloušťky vrstvy), zakryté
  tence čárkovaně; dřív měly hrany tloušťku i čárkování objektu, takže se kontura a polotovar lišily.
  Roh na začátku strmého zkosení vycházel jako zakrytý (čárkovaně) — viditelnost se teď bere z nižší strany.
  Ve Vrstvách je při zrcadlení řádek **Hrany přes osu** s okem (`state.mirrorEdges`, ukládá se v nastavení).
- **G-kód → 🔄 Vykreslit na karuselu v G91:** přírůstek se přičítal na prohozenou osu – `G91 G01 Z-10` se
  nepohnul a `X10` posunul Z (podmínka „x ⇔ Z" platí jen pro soustruh). Nalezeno maticovým testem tečných
  oblouků `tests/cnc-arc-tangent-matrix.test.js`.
- **CNC Editor – automatické G0/G1:** první bod polotovaru (za `STOCK_START`) a první bod za `STOCK_END` dostane G0, ne G1 – jinak by vznikla falešná čára od konce kontury.
- **G-kód → 🔄 Vykreslit** (parser vyjmut z `fileIO.js` do `storage/gcodeParse.js`, `fileIO.js` 1988 → 1811 ř.):
  - `G04 X2.5` (prodleva), `G28/G30/G53` a cykly `G70–G76` už nekreslí falešnou úsečku do bodu X/Z;
  - `G50/G52/G92` (posun nulového bodu) a `G20` (palce) se hlásí;
  - desetinná čárka `X10,5` se četla jako `X10` (půlmilimetr se tiše ztratil);
  - přírůstky Fanuc `U`/`W` (`G01 U5 W-5`) se dřív celé zahodily;
  - oblouk bez `R` i `I/K`, `I/K` nesedící ke koncovému bodu a kružnice `G02 I5` bez X/Z se hlásí
    místo tichého zahození/nakreslení špatného oblouku (hláška „pozor" u těch, které se nakreslily).
  Test `tests/gcode-parse-guards.test.js`.
- **VK parser:** řádky `G01/G02/G03/G00`, malými písmeny nebo s desetinnou čárkou se dřív tiše ignorovaly
  (kontura se vykreslila bez nich). Tlačítko ⇄ Konvertovat nově používá stejný parser jako náhled
  (zrušena jeho vlastní kopie).

- **Drsnost:** „f max" (zpětný výpočet) se přepočítá i bez zadaného posuvu při změně rádiusu, Vc, materiálu nebo nástroje; neplatný zápis (NaN) se bere jako nezadaný místo zobrazení „NaN"; Kopírovat skládá čitelný řádek (Ra / Rz / třída) místo slepeného textu tabulky.
- **Kužel – závěrečná kontrola:** hlášení neplatného zápisu i u úchylek,
  hloubky zadaného Ø a měřicích míst (dřív se tiše braly jako 0); úhel α mimo
  0–90° se hlásí; měřicí místo za délkou kužele je v tabulce označené „mimo
  kužel"; kopírování bez dostupné schránky nespadne; hodnota místa se do pole
  zapisuje bezpečně (ne přes HTML).

- **Kužel – tolerance:** prázdná úchylka = 0 a větší hodnota se bere jako horní
  (dřív kladná dolní úchylka bez horní zastavila výpočet); po dopsání se pole
  samo doplní nulou a prohodí.

- **Kužel – nečitelné popisky:** nevyplněné kóty v náčrtu byly černé na černém
  (proměnná `--ctp-overlay1` v paletě neexistuje) – teď šedé. Totéž u legend
  skupin polí (`--ctp-subtext1`).

- **Kužel – tabulka Morse:** klepnutí vyplňovalo špatné hodnoty (atributy
  `data-mD` a `data-md` HTML sloučí, protože převádí na malá písmena).

- **Kužel jen v pravém panelu:** odebrána tlačítka Kužel a Kalkulačka z horní
  lišty a horního pruhu nad plátnem; kalkulačka zůstává v liště okna Kužel.

- **Tolerance ISO 286: j6 pro rozměry do 3 mm** vracelo +2/−4 µm, správně je
  +4/−2 µm (j5 a j6 mají společnou dolní úchylku). Doplněno j8 do 3 mm (+8/−6)
  a regresní test (`js/calculators/iso286.js`).
- **Tolerance: přepnutí Díra ↔ Hřídel si pamatuje zvolenou třídu** pro každý
  režim zvlášť (dřív se vždy vrátila na H/h). Úchylky ±0,75 µm (js2/JS2) se už
  nezaokrouhlují na ±0,8 (`js/calculators/tolerance.js`).

### Added

- **Kužel – výsledky shora dolů:** hrana vrchu, měřicí místa a zadaný Ø podle
  vzdálenosti od vrchu (místa od spodu mají v závorce i vzdálenost od vrchu),
  nakonec hrana spodku; čísla míst v tabulce i náčrtu jdou shora. Nový řádek
  „Na 1 mm délky se Ø změní o …". Úhel α v náčrtu se nepřekrývá s popisky.

- **Kužel:** kuželovitost jde zadat libovolným poměrem (7:24, 3:50; samotné
  číslo = 1:x), tabulka ISO vyplní přesně 7:24. Tlačítko 🗑 Vymazat je v liště
  okna vedle Kalkulačky. Volba názvů stran (Začátek / Konec) odebrána – strany jsou vždy Spodek / Vrch;
  nahoře je místo ní „Větší Ø je" (dole / nahoře, ⇅).

- **Kužel bez záložek:** nahoře Zobrazení (díra / čep, strany), pod ním náčrt,
  výsledky a pole; tabulky Morse / ISO úplně dole jako rozbalovací sekce.

- **Kužel: úhel přímo v náčrtu i v polích.** Kuželovitost se zadává buď jako
  1:x, nebo úhel α (sklon k ose); druhý tvar se dopočítá. V náčrtu je „1:x"
  nahoře a „α" u oblouku na stěně. Tolerance jen ručně dole (horní / dolní
  úchylka), v náčrtu už není.

- **Kužel: sjednocený výpočet.** Záložky „Kužel" a „S tolerancí" jsou spojené
  do jedné: stejný klikací náčrt pro čep i díru; kužel ze 3 údajů {D, d, L,
  kuželovitost} nebo z Ø v hloubce + délky a kuželovitosti; tolerance a
  měřicí místa vždy po ruce (`solveTaper` v `taperBoreMath.js`). Starý
  `taperBasicSketch.js` odstraněn, uložené vstupy se převezmou.

- **Kužel: popisy přímo u kót v náčrtu** (D velký Ø, d malý Ø, L délka kužele,
  α sklon k ose, kuželovitost 1:x, vrchol. 2α; v řezu zadaný Ø, hloubka Ø,
  délka L, kuželovitost). První záložka se jmenuje jen „Kužel".

- **Kalkulačka v horní liště a v okně Kužel.** Tlačítko 🔢 v horní liště
  (desktop i mobilní horní pruh) a v liště okna Kužel; výsledek tlačítkem ↓
  se vloží do posledního aktivního pole. Náčrty kuželu mají vysvětlivky
  (D, d, L, α, 2α, 1:x; Ø, tol, hl., L, šipky měřicích míst) a nápovědy u kót.

### Fixed

- **Kužel:** vložení výsledku z kalkulačky do polí D/d/L/α padalo (pole typu
  number nepodporují pozici kurzoru) – pole jsou teď textová a berou i výrazy.
  Prázdná kuželovitost se v náčrtu ukazovala jako „1 : null". Upozornění,
  když je D menší než d nebo zápis v poli neplatný.

- **Kužel: horní lišta, klikací náčrty, záložky.** Kalkulačka Kužel jde spustit
  z horní lišty (desktop) i z horního pruhu na mobilu. Hodnoty se zadávají
  klepnutím na kóty v náčrtu (okénko u místa klepnutí, `svgInlineEdit.js`);
  v řezu kužele s tolerancí klepnutí do díry přidá měřicí místo. Kalkulačka je
  rozdělená do záložek (Kužel D·d·L·α / S tolerancí / Morse a ISO), pole
  seskupená, výsledky nad poli; nová kopie „Do programu" ve stylu komentáře NC.

- **Kužel: kužel s tolerancí – průměry v hloubce.** Z jednoho průměru
  s tolerancí (ISO nebo ručně) v zadané hloubce, kuželovitosti (1:x, α, 2α, C)
  a délky spočítá průměry v libovolných měřicích místech od obou stran
  (např. pro sondu), průměry na hranách a rozdíl stran; náčrt řezu s popisy.
  Horní kalkulačka má navíc pole 1:x a 2α, tabulky Morse/ISO jsou
  rozbalovací (`js/calculators/taperBore.js`, `taperBoreMath.js`).

- **Tolerance: volné geometrické tolerance ČSN EN ISO 2768-2** — pod volné míry
  rozměrů přibyla stejně sbalitelná lišta s tabulkami tříd H, K, L (přímost
  a rovinnost, kolmost, souměrnost, kruhové házení) a poznámkou k rovnoběžnosti,
  kruhovitosti a souososti (`js/calculators/tolerance.js`).
- **Tlačítko Zpět (mobil i prohlížeč) vrací o jeden krok místo ukončení PWA /
  návratu na jinou stránku** (`js/backButton.js`) — postupně zavře nejvyšší
  dialog → nápovědu → boční panel/lištu → zruší rozdělané kreslení a výběr →
  zavře plovoucí okno → vrátí nástroj Výběr. Na nejvyšší úrovni upozorní
  „Pro ukončení stiskněte Zpět znovu"; teprve druhé Zpět do 2 s aplikaci
  opustí. Test `tests/back-button.test.js`.
- **CAM + CAD: čelní (axiální) zápich, např. pro O-kroužek (Upich + ⊚ Čelní,
  pravidlo 19, schváleno 23. 10. 2026)** — mezikruží ⌀d1–⌀d2 do hloubky
  od čela; osové zápichy vedle sebe, stěny a dno s přídavky, dokončení
  vnitřní stěna → dno → vnější stěna, sražení hran (`cam/ops/grooveFace.js`).
  Čelní zapichovací nože v 📚 katalogu (skupina Čelní zápichy, rozsah ⌀
  čepele a dosah, `isoFaceGrooves.js`); nůž se vybere sám, jinak se přidá
  z katalogu. V CAD nástroj Zápich → typ **Čelní zápich**; nakreslený
  zápich převezme CAM přes ✏ Z výkresu. Testy `tests/cam-groove-face*.test.js`,
  `tests/groove-face-cad.test.js`.
- **CAM: hlášení vyložení tyče** (pravidlo 13, schváleno 22. 10. 2026):
  vyvrtávání, zápich v díře i vnitřní závit upozorní ⚠, leží-li špička
  hlouběji od ústí než 4 × ⌀ ocelové tyče (`cam/ops/barOverhang.js`).

- **CAM: vnější zápich libovolné šířky (Upich + ◯ Vnější, pravidlo 17,
  schváleno 23. 10. 2026)** — pole Šířka zápichu: zápichy vedle sebe
  s krokem ≤ 0,8 × šířka destičky od Z (bok u sklíčidla) k obráběcí
  straně, boky a dno s přídavky, dokončení bok → dno → bok; šířka 0 =
  upichnutí beze změny (`cam/ops/grooveWide.js`, test
  `tests/cam-groove-wide.test.js`).
- **CAM: sražení hran zápichu 45°** (vnější i v díře, pravidlo 17,
  schváleno 23. 10. 2026) — pole Sražení; dokončení jede sražení → bok →
  dno → bok → sražení s korekcí rádiusu destičky; zápich se sraženími se
  pozná i z výkresu (`cam/ops/grooveChamfer.js`).
- **CAM: vnější zápich z výkresu** — zápich nakreslený na obrysu dílu
  nabídne Upich + ◯ Vnější (✏ Z výkresu); klik vyplní Z upich, šířku
  a Dojezd X (`groovesOnOuter` v `cam/holeGrooves.js`).
- **CAM: hlášení náběhu vnitřního závitu ve stěně díry** (pravidlo 13,
  23. 10. 2026) — `threadRunInNote` v `cam/ops/thread.js`.
- **CAM: zápich v díře z výkresu** — nakreslené obdélníkové zápichy ve
  stěně díry nabídne panel Upich + ◎ Vnitřní (✏ Z výkresu); klik vyplní
  Z, šířku a dno. Čárkovaný náhled zápichu na polotovaru
  (`cam/sim/grooveCad.js`, `grooveOutline` v `cam/sim/grooveSim.js`).

### Fixed

- **CAM: kontrola zápichů a vnitřního závitu (23. 10. 2026)**:
  - sražení vnějšího zápichu bralo povrch ze Start X (= surový polotovar)
    — na osoustruženém dílu vznikalo ve vzduchu; teď z obrysu dílu vedle
    každého boku (i se schodem vedle zápichu);
  - zápich v díře bral ústí z výchozího Z vyvrtávání (0) — u dílu s čelem
    jinde falešně hlásil „není díra"; teď z čela polotovaru části;
  - simulace odečítala díru z parametrů i tam, kde ji polotovar části už
    má; výběr zapichovací tyče a předvyplnění dna brali výchozí ⌀30 —
    teď skutečná díra části (`partHoleDiameter`);
  - vnitřní závit: odskok mezi průchody nehlídal protější stranu tyče
    (validátor protější stěnu nevidí) — teď se tyč musí vejít (pravidlo 13),
    jinak se závit nevydá;
  - dokončení se sražením v díře najíždí ke stěně na Vůli X.
- **CAM: zápich v díře — hloubka i s Vůlí X** — tyč smí ke stěně díry jen
  po offsetovou čáru polotovaru (jako validátor); dřív jen 0,2 mm od stěny,
  takže ⛔ hlásil kolizi tyče u hlubších zápichů. Test dočištění vybrání po
  vyvrtávání zápichem z výkresu (`tests/cam-groove-inner.test.js`).
- **CAM: zápich v díře bral díru z výchozích parametrů vyvrtávání**
  (⌀30 × 20 i v části, kde se nevyvrtává) — teď nejdřív z polotovaru
  části (díl obrobený předchozími částmi, `cam/stockHole.js`); kontrola
  náběhu závitu parametry vyvrtávání nebere vůbec.
- **CAM: zápich v díře s dírou z výkresu (✏)** — generátor dostával celý
  výsledek `boreChainFromState` místo seznamu úseků, takže tvar díry tiše
  ignoroval a počítal se starým ⌀ z polí; panel ukazoval totéž. Teď oba
  berou nakreslenou díru.
- **CAM: vnitřní závit — nájezd a výjezd ústím díry** (pravidlo 13,
  schváleno 22. 10. 2026). Dřív šikmý rychloposuv z bezpečné polohy na
  start a z konce závitu zpátky — u závitu v díře projel stěnou. Teď před
  ústí a čelo polotovaru (i o přesah tyče za špičku) → k ose → na Z, ven
  stejně. Simulace kreslí a počítá vnitřní závit s tyčí obrácenou
  radiálně a polotovarem s dírou ⌀(D − 2H) (`toolRadialFlip.js`,
  `sim/grooveSim.js`); vnější obrys se u něj nehrubuje ani nedokončuje.
  Výjezd zápichu v díře taky počítá s přesahem tyče. Test
  `tests/cam-thread-inner.test.js`.

- **CAM: zápich v díře (Upich + ◎ Vnitřní).** Zápich ven od stěny díry
  vnitřní zapichovací tyčí, libovolná šířka: zápichy vedle sebe s krokem
  ≤ 0,8 × šířka destičky, boky a dno s přídavky, dokončení bok → dno →
  bok. Díra z vyvrtávání / předvrtání (nebo ruční ⌀), tyč se musí vejít
  a hloubka ≤ dosah destičky; nájezd i výjezd osou díry. Nový typ
  📚 katalogu **vnitřní zapichovací tyč** (GIR/GIL ⌀16–80, š 1,5–5 mm,
  dosah 2,5–6 mm); přepnutím na ◎ se tyč vybere sama. Doplnění pravidla 13
  schválené 22. 10. 2026. Simulace: úběr, ⛔ validátor i hlídání držáku
  vidí tyč obrácenou radiálně (ostří ven, tyč k ose — `cam/toolRadialFlip.js`)
  a polotovar bez díry (`cam/sim/grooveSim.js`); výjezd z díry jde až za
  čelo polotovaru. Moduly `cam/ops/grooveInner.js`,
  `cam/sim/paramsGrooveHtml.js`, test `tests/cam-groove-inner.test.js`.

- **CAM: jen dokončení v díře (Hot. + ◎ Vnitřní).** Jeden dokončovací
  průchod vyvrtávací tyčí po stěně díry bez hrubování a bez předvrtání
  vrtákem (`finishOnly`, `cam/ops/bore.js` + `cam/ops/boreFinish.js`). Polotovar díry = hotový obrys
  zmenšený o přídavky (díra vyhrubovaná předchozí operací); tyč se musí
  vejít do nejužšího místa vyhrubované díry. Doplnění pravidla 13
  schválené 22. 10. 2026. Test `tests/cam-bore-finish-only.test.js`.

- **CAM: Obrábění ◯ Vnější / ◎ Vnitřní a samostatná záložka Frézování.**
  Pod Zleva / Zprava přepínač Vnější / Vnitřní místo záložky „Vyvrt.":
  Hrub. + ◎ Vnitřní = vyvrtávání tyčí (tyč a předvrtání se vyberou samy,
  ◯ Vnější vrátí naposledy použitý vnější nůž), Závit + ◎ Vnitřní =
  vnitřní závit (přepínač ze záložky Závit se přesunul sem). Přepínač čte
  parametr operace, nemá vlastní stav. Frézování
  z výkresu (kapsy, drážky, pera) má vlastní záložku za Vrtáním a vlastní
  část programu jen s frézami (`liveKind: 'mill'`, `liveModel.liveRunOps`);
  část Vrtání má v bloku jen díry. Moduly `cam/sim/machSurface.js`,
  `cam/sim/paramsBoreHtml.js`, test `tests/mach-surface-mill-tab.test.js`.

- **CAD/CAM: závity do děr závitníkem a navrtání před vrtáním.** Pole Závit
  (M3–M24) v oknech děr do čela i do pláště — Ø díry = předvrtání, díra nese
  závit; v CAM po vrtání operace závitníku (hloubka skrz +2P / slepá −2P,
  F = P·n): Sinumerik SETMS + CYCLE84, Fanuc M29 + G84 / G88, bez cyklů
  plovoucí pouzdro s reverzem nástroje. Závitník ve 🔧 Zásobníku (tvar Ⓜ)
  i v 📚 katalogu; nejde zvolit jako soustružnický nůž. Volitelné navrtání
  navrtávákem (sražení Ø + 2 × 0,5 mm) před všemi vrtáními; navrtávák se
  už nevybírá jako obyčejný vrták. Moduly `isoTaps.js`,
  `cam/live/liveHoleExtras.js`, `cam/live/liveTapTools.js`, test
  `tests/taps-spot.test.js`.

- **CAM: zanoření frézy, která neřeže středem, rampou 3°.** Drážka na čele
  cik-cak po ose, kapsa šroubovicí, drážka pro pero cik-cak v Z (společná
  dráha `liveModel.keywayPath` pro NC, simulaci i řez); po rampě celá délka
  na plné hloubce. Polární rozklad (C + X) teď vede Z po úseku spojitě.
  Kontrola hlásí jen případ, kdy na rampu není místo.

- **CAM: frézy v zásobníku a jejich výběr pro frézování z výkresu.** Tvar
  ✣ fréza ve 🔧 Zásobníku (Ø, z, Vc, fz, krok, řeže středem) a 📚 katalog
  fréz (VHM z3 / z4, HSS z2 / z4, Ø2–25). Kapsa, drážka na čele i drážka
  pro pero si frézu vyberou podle Ø jako vrtáky (otáčky z Vc, posuv fz·z·n,
  T ze zásobníku), chybějící se doplní z 📚. Fréza nejde zvolit jako
  soustružnický nůž. Moduly `isoMills.js`, `cam/live/liveMillTools.js`,
  test `tests/mill-tools.test.js`.

- **CAD → CAM: drážka do čela (ovál) i širší než fréza.** Nástroj Drážka
  v bokorysu otevře ◎ Drážka do čela (střed, délka, šířka, úhel osy
  radiálně / tečně, hloubka jako díry). Kreslí se obrys (stadion) do čela;
  osa a šířka z geometrie (přesun, otočení, Kr.pole). Do CAM frézování
  Drážka s novou šířkou `slotW` — užší fréza jede víc průjezdy kolem osy
  (oblouky kolem konců, TRANSMIT G2/G3 i polárně C + X). Úprava klepnutím.
  Moduly `faceView/faceSlots.js`, `calculators/faceSlot.js`, test
  `tests/face-slots.test.js`.

- **CAD → CAM: drážka pro pero do pláště.** Nástroj Drážka: klepnutí na díl
  v nárysu otevře ⊐ Drážka pro pero (střed Z, délka, šířka = Ø frézy,
  hloubka od pláště / do Ø, počet po obvodu, úhel C nebo natočení podle díry
  v čele). Kreslí se do vrstvy Díry v plášti (úsečka na plášti, obrys podle
  natočení pohledu, v bokorysu na úhlu C); drážka přes osazení se odmítne.
  V CAM nové frézování `millType: keyway` (side radial): NC Sinumerik /
  Fanuc / Heidenhain (natočení C, zanoření v X, vrstvy v Z tam a zpět),
  simulace, řez, pohled na čelo, kontrola proti dílu, ruční formulář.
  Moduly `faceView/shellSlots.js`, `faceView/cadForCam.js`,
  `calculators/shellSlot.js`, test `tests/shell-slots.test.js`.

- **CAD: posuvník natočení pohledu vpravo od bokorysu.** Úhel C nahoře
  v nárysu (výchozí soustruh 90°, karusel 0°), přichycení k dírám a po 45°,
  políčko a ⟲. Nárys ukazuje díry v čele i v plášti podle natočení, bokorys
  průměr „C… nahoře". `faceView/faceRotate.js`, `faceLayer.faceViewC`.

- **CAD → CAM: díry do pláště (radiální vrtání) kreslené v nárysu.** Nástroj
  Díra: klepnutí v nárysu na díl otevře ⊥ Díra do pláště (Z z klepnutí, Ø,
  hloubka do hloubky / do Ø / skrz stěnu do vývrtu, počet po obvodu, úhel C
  nebo „Natočit podle" díry v čele + odsazení). Ve vrstvě Díry v plášti
  (není profil) osa díry + obrys skrytou čarou z aktuálního profilu,
  v bokorysu paprsky na úhlech C (kontrola natočení vůči dírám v čele).
  Klepnutí na díru = úprava, Lin.pole = víc děr podél osy. Do CAM se
  přenesou samy jako vrtání do pláště (rozteč / body „úhel; Z"). Moduly
  `faceView/shellHoles.js`, `shellHoleDraw.js`, `shellHoleView.js`,
  `calculators/shellHole.js`, test `tests/shell-holes.test.js` (vč. NC
  výstupu radiálního vrtání Sinumerik / Fanuc / Heidenhain).

- **CAM: díry z CAD se přenesou samy a vrtají od materiálu.** Při otevření
  CAM se díry a drážky z bokorysu převedou na operace poháněných nástrojů
  jako 📥 Z CAD (nahradí jen dřív načtené z CAD, nástroj a otáčky zůstanou).
  Stojí-li čelo (posuvník) ve vzduchu před přírubou, operace začne vrtat
  na prvním materiálu (Z čela = příruba, hloubka skrz = tloušťka + přesah;
  dřív „za čelem není materiál" a výchozí hloubka). Řez v CAM má s dírami
  i spodní polovinu (kontura a polotovar přes osu), díry 180°…360° se
  sklopí pod osu. Moduly `cam/live/liveCadSync.js`, `cam/sim/drawLowerHalf.js`,
  `faceDepth.holeForCam`, test `tests/face-cam-transfer.test.js`.
  Díry do čela leží v řezu CAM ve výšce jako v nárysu CAD (C 0°/180° na
  ose Z, dřív se sklápěly na poloměr a díra na ose nebyla vidět) a pohled
  na čelo kreslí polotovar jako bokorys CAD (čerchovaně se dvěma tečkami,
  i větší polotovar za řezem) — `liveSection.faceSpans`, `liveCut.liveCutAt`.

- **CAD: díry na roztečné kružnici v bokorysu.** Kr.pole v bokorysu uměl jen
  kopírovat nakreslený objekt — klepnutí na střed čela (kde ještě nic není)
  skončilo hláškou „Klepněte na objekt". Teď klepnutí do prázdna v čele
  (SNAP chytí střed) otevře **◎ Rozmístění děr** se středem v kliknutém
  bodě a nové tlačítko **◎ Do čela** (záložky Kružnice, Řada, Mřížka)
  nakreslí díry do aktuálního čela (vypnutý bokorys zapne), u Kružnice
  i roztečnou kružnici čerchovaně — jedním krokem ↩. Čárkovaná / čerchovaná
  kružnice v čele je pomocná: do CAM (📥 Z CAD) nejde, takže se z roztečné
  kružnice neudělá díra; nedělá ani průsečíky s dírami. Dialog Kr.pole na
  díře v čele má výchozí střed v ose čela místo 0,0 výkresu. Modul
  `faceView/facePattern.js`, test `tests/face-hole-pattern.test.js`.
  Roztečnou kružnici jde z bokorysu rovnou **vytáhnout**: Kr.pole → klik na
  střed čela → tažení nebo 2. klik na obvod (náhled s Ø) → kalkulačka má
  předvyplněný střed i Ø rozteče. Díry mají **hloubku**: Skrz (materiál pod
  dírou + přesah, výchozí hrot 0,3·Ø + 1 mm) / Do hloubky / Do Z (konec díry;
  Z na straně nástroje se odmítne). Hloubka se spočte při 📥 Z CAD
  z aktuálního profilu a Z čela a operace ji dostane (stejné Ø s jinou
  hloubkou = zvlášť operace). Moduly `faceView/faceDepth.js`,
  `calculators/holeDepthFields.js`.
  **Díry v nárysu** se kreslí jako na výkresu: tenkou čárkovanou čarou
  (skrytá hrana) v prvním materiálu za rovinou čela — i když posuvník stojí
  před přírubou (skrz = přes materiál, hloubka / do Z = válec + špička 118°),
  s osou díry čerchovaně. „◎ Do čela" na soustruhu zapne ⇋ Zrcadlit kolem
  osy — nárys se dokreslí pod osu, díry pod osou mají kde ležet, a značka
  řezu i lišta čela jdou pod spodní polovinu. Bokorys ukazuje i **větší
  polotovar za řezem** ve směru pohledu, dřív jen polotovar v rovině čela.
  Modul `faceView/faceFrontView.js`, `faceDepth.materialSpan`, test
  `tests/face-front-view.test.js`.
  **SNAP** chytá dokreslenou spodní polovinu, hrany přes osu i čáry děr
  v nárysu (kótování, kreslení od díry) — `render/mirrorSnap.js`. Hloubka
  **Skrz** má volbu *Hotová kontura* / *I polotovar* (vrtání před
  soustružením; „skrz vč. polotovaru" = samostatná operace v CAM).
  Nový nástroj **Díra** (Více, vedle Kr.pole): klepnutí do bokorysu →
  okno ◎ Díra do čela (X, Y, polárně Ø a C, Ø díry, hloubka) → jedna díra
  do čela. Moduly `tools/faceHoleClick.js`, `calculators/singleHole.js`,
  test `tests/face-single-hole.test.js`.

- **CAD: lišta nástrojů na mobilu na výšku.** Rozbalené Více má pevné
  řádky po čtyřech (Řet.kóta přesunuta k DIN · Závit · Bool, Díra vedle
  Kr.pole) a tlačítko **▴** v řádku s Kr.pole sbalí řádky nad Více —
  zůstane hlavička a nástroje Více. `js/toolbarCollapse.js`.

- **CAM: kontrola poháněných nástrojů proti dílu.** Vrtání a frézování
  (◎ Pohled na čelo → 🛠 Operace) se porovná se skutečným tvarem dílu:
  díra / kapsa / drážka musí ležet celá v materiálu čela (mezi vývrtem
  a obvodem v rovině Z čela ze strany čela), do plné hloubky zůstat
  v materiálu (skrz = upozornění, náraz do vývrtu / výjezd z obvodu =
  chyba), radiální díra musí mít Ø pláště jako díl v Z díry (± 0,1 mm)
  a bezpečná vzdálenost s odjezdem nesmí vést do bližšího osazení. Nálezy
  pod formulářem operace, červená / žlutá tečka u karty, červený obrys
  děr v pohledu na čelo. Modul `cam/live/liveChecks.js`
  (`faceReference.materialAt`), test `tests/live-checks.test.js`.

- **CAD: ◎ bokorys (pohled na čelo) vedle profilu.** Tlačítko ◎ Čelo (desktop
  v horní liště, mobil kulaté nahoře u 🔢) přepíná profil → profil + bokorys →
  jen bokorys (každé přepnutí zarámuje, co je vidět). Bokorys je vpravo vedle
  nárysu jako na výkresu (i na mobilu) na ose vřetena s promítacími čarami.
  Víc čel: lišta dole (výběr, ➕, 🗑, Z políčkem i posuvníkem s přichycením
  k osazením, ◀ zprava / ▶ zleva = směr pohledu), značka řezu v nárysu;
  bokorys jako řez na výkresu (plocha řezu + hrany za ní ve směru pohledu;
  zakryté materiálem čárkovaně), polotovar v barvě své vrstvy, středový kříž
  se stupnicí v mm, kóty Ø;
  SNAP na střed, kružnice a osy bokorysu. CAM vrtá čelo zleva ve směru +Z. Kreslí se do vrstvy Čelo: kružnice = díra,
  úsečka = drážka. Do přenosu profilu do CAM nejde; v CAM ji načte
  🛠 Operace → 📥 Z CAD (stejný Ø = jedna operace, pravidelné rozmístění =
  roztečná kružnice). Operace mají nově volbu Druh (vrtání ↔ frézování).
  Moduly `js/faceView/`, `cam/live/liveFromCad.js`, test `tests/face-view.test.js`.
- **CAM: ◎ Pohled na čelo a poháněné nástroje.** Tlačítko ◎ v liště plátna
  rozdělí plochu na řez a pohled podél osy proti sklíčidlu (karusel: shora na
  upínací desku) s polotovarem, čelistmi a dírami; ▶ přehraje pořadí vrtání.
  Editor 🛠 Operace: vrtání do čela i do pláště (roztečná kružnice / seznam
  bodů), frézování kruhové kapsy a drážky na čele. NC výstup s přepínačem SPOS /
  osa C / TRANSMIT (Fanuc G12.1), cykly CYCLE82/83 a G83/G87 nebo rozepsané
  pohyby, M-kódy stroje nastavitelné. Blok se do programu vkládá mezi značky
  `>>> / <<< POHANENE NASTROJE`, simulace soustružení ho přeskakuje. Moduly v
  `js/calculators/cam/live/`, test `tests/cam-live-tools.test.js`.

- **Referenční příručky Fanuc a Heidenhain v kalkulačkách.** Do sbalené části
  „Další kalkulačky“ přibyla tlačítka **Fanuc** (0i/31i-T: G a M kódy, cykly G70–G76,
  Makro B, ukázky) a **Heidenhain** (TNC 640: Klartext, ISO G kódy, M funkce,
  Q-parametry/FN, cykly vrtání a soustružení, ukázky). Společné okno
  (rozcestník, seznam s hledáním a kategoriemi, ukázky) je v
  `js/calculators/ctrlRefViewer.js`, data v `fanuc*.js` a `heidenhain*.js`.
  Nový test `tests/control-reference.test.js`.
- **Fanuc a Heidenhain: dlaždice „Nástroje“ (🛠️).** Geometrie a opotřebení nože – co udělá zápis −0,2 (Fanuc: Wear X v průměru, záporné = menší průměr; Heidenhain: DXL/DZL/DRS), INPUT × +INPUT, měření, `G10`, tabulka TOOLTURN.TRN, orientace TO. Moduly `fanucOffsets.js`, `heidenhainTools.js`. Nápověda Sinumerik rozcestníku popisuje i dlaždice Nástroje a Alarmy.
- **Poznámky: ✕ u záložky.** Každá záložka poznámkového bloku má křížek pro zavření (smazání). Prázdná se zavře hned, záložka s textem až po potvrzení; poslední záložka křížek nemá. ✕ je samostatné tlačítko, takže ho trefí i přesný křížek na mobilu (`js/ui/notesDialog.js`, test `ui-notes`).
- **Poznámky: ukládají se samy, bez tlačítka Uložit.** Každá změna (text, nová / přejmenovaná / zavřená záložka, vymazání) se uloží po krátké pauze (dřív se změny záložek uložily až při zavření okna); Ctrl+S uloží hned. Spodní lišta má tři stejně velká tlačítka (Vymazat, Kopírovat, 💾 Stáhnout .txt) – „Stáhnout .txt“ se na mobilu zalamovalo a bylo vyšší. Tlačítka, záložky i ukazatel uložení mají popisek pro bublinu pod přesným křížkem.
- **Pravý panel: bubliny s popisem u hlaviček panelů.** Objekty, Průsečíky, Vlastnosti, Vrstvy, Profil, CNC Kód, Kalkulačky a Další kalkulačky mají popisek (title) – na mobilu ho ukáže přesný křížek, kterým jde hlavičku i rozbalit (`.panel-header` v `CLICKABLE_SEL`, `js/touch.js`). Strohé popisky kalkulaček (Tolerance, Závity, Kužel, Hmotnost…) prodlouženy o to, co počítají.
- **Fanuc / Heidenhain: nastavení nože.** Obě příručky mají skupinu Postupy (nový nůž, měření, nová destička, kontrola špičky / TO; Fanuc i dva suporty = dvě dráhy).
- **Sinumerik: nová dlaždice „Nástroje“ (🛠️).** Význam dat nástroje (T) a dat břitu (D) – typ, název, ST, místo, stav, délky X/Z, poloměr, poloha břitu SL, úhly, šířka břitu, základní rozměr, opotřebení, hlídání – dále postupy (nový nůž, měření X/Z, nová destička, kontrola SL), část o dvou suportech (kanály, společná × oddělená tabulka nástrojů, nulové body, `WAITM`) a proměnné `$TC_DP` / `$P_TOOL`. Moduly `js/calculators/sinumerikTools.js` a `sinumerikWear.js`. Nahoře je skupina **Opotřebení (hlavní)**: co dělá zápis −0,2 (radiální osa = průměr, axiální = délka, R jen s G41/G42), poloměr × průměr, znaménko, zkouška na stroji (zkušební stupeň), příklady a programová korekce. Symbol Ø u pole radiální osy = hodnota v průměru, bez Ø = v poloměru (zadává se polovina rozdílu průměru). Karty Počet břitů a Frézy 1xx, výchozí D1, osy karuselu (X = průměr vodorovně, Z = výška svisle – soustruh otočený o 90°), zrcadlení polohy břitu u pravého a levého suportu a strana stolu u druhého suportu. Karty délek v Datech břitu nesou označení přímo v názvu: Délka X (L1), Délka Z (L2), Délka Y (L3).
- **Alarmy a chybová hlášení v příručkách Sinumerik / Fanuc / Heidenhain.** Nová dlaždice *Alarmy* (Sinumerik, Fanuc) a *Chyby* (Heidenhain): rozsahy čísel, vlastní alarmy (`SETAL`, `MSG`, `#3000`, `FN 14`), mazání alarmů a orientační přehled častých alarmů s příčinou a řešením. Moduly `sinumerikAlarms.js`, `fanucAlarms.js`, `heidenhainAlarms.js`; společné okno má volitelný popisek sekce a upozornění (`syntaxLabel`, `note`).

### Removed

- **Nápověda Sinumerik rozcestníku: sekce „Editor“.** CNC Editor se otevírá z plátna, v rozcestníku dlaždici nemá; popis se odstranil (`js/calculators/help.js`).

### Changed

- **G-kód: `I` je vždy poloměr, i v průměrovém režimu** (jako Fanuc / Sinumerik a jako už CAM parser).
  Dřív CNC Editor, 🔄 Vykreslit, převod T → I/K, spojení v průsečíku, sražení/zaoblení → dráha
  i obkreslení profilu brali `I` jako průměr (`I10` = 5 mm). Ručně psaný program s `I` podle stroje se
  teď nakreslí správně. Pozor: starý program psaný v aplikaci s `I` v průměru se nakreslí jinak
  (editor ohlásí „konec neleží na kružnici"). Výstup do stroje z výkresu se nemění (píše `R`).
- **CAM: lámání třísky i u děr z výkresu.** ⇡ Vyjíždění × ↯ Lámání třísky
  a Odskok ze záložky Vrtání (nebo *Tříska mezi záběry* u operace):
  Sinumerik `CYCLE83 … VARI = 0`, rozepsaně jen odskok a další záběr,
  simulace stejně; Fanuc G83 / G87 volí lámání parametrem stroje — v programu
  je poznámka.
- **CAM: Zápis vrtání v záložce Vrtání — Cyklus × Rozepsaně G0 / G1 (ISO).**
  Přepínač je přímo pod seznamem děr (dřív jen zaškrtávátko *Vrtací cykly*
  ve sbaleném Výstupu NC); rozepsaný kód má každý pohyb zvlášť.
- **CAM: Výstup NC poháněných nástrojů jen v pravém panelu.** Polohování
  (SPOS / osa C / TRANSMIT), cykly, vřeteno, jméno osy C, kalibrace úhlu
  a M-kódy jsou v ⚙ Parametry → Obrábění → Vrtání (rozbalovací blok pod
  seznamem děr); pod pohledem na čelo zůstal jen souhrn a tlačítko, které
  blok otevře — nastavení už není na dvou místech.
- **CAM: vrtání děr z výkresu je operace Vrtání — záložka vybere nástroj,
  jedno 🔄 Dráhy.** Klik na záložku obrábění přepne nástroj své operace:
  Vrtání → vrták (podle Ø děr z výkresu ze 🔧 Zásobníku; chybějící se doplní
  z 📚, i Ø mimo katalog), Závit → závitový nůž + závitování, Upich →
  upichovák, Hrub./Hot. → soustružnický nůž. Jedna část = jedna operace: má-li
  část program jiné operace, přidá se po potvrzení nová část (jmenuje se
  podle operace); existující část operace / soustružení se jen přepne, Vyvrt.
  beze změny (`cam/sim/machTabTool.js`). S vybranými dírami z výkresu je
  program operace Vrtání blok poháněných nástrojů (`ops/drill.js` →
  `buildLiveBlock`, díra v ose se nekreslí; otisk CAM shodný) — generuje ho
  jediné 🔄 Dráhy, ✂ Po úsecích jen u soustružení, blok se už nevkládá jako
  ruční úprava (zámek 🔒); úprava výběru děr program části přegeneruje.
  Záložka Vrtání má nahoře *Co vrtat* (díry z výkresu × středová díra v ose),
  zaškrtávátka skupin s vrtákem a řeznými podmínkami (n z Vc, F = f·n; Q,
  prodleva, bezp. vzd. z polí záložky) a otevře pohled na čelo, kde skupinu
  vybere klepnutí na díru (první klepnutí = jen tahle skupina). 🔩 Vyvrtat
  = záložka Vrtání + ▶ simulace. Moduly `cam/live/liveDrillTools.js`,
  `liveDrillUi.js`, `liveProgram.js` (jen ruční 📝 / 🗑), testy
  `drill-from-cad`, `live-drill-tools`, `live-program`.
- **CAM: poháněný nástroj stojí nahoře, kus se natáčí k němu.** Soustruh:
  nástroj v revolveru na X+ (nahoře, jako v řezu / nárysu), karusel vpravo,
  nastavení *Nástroj stojí*; `SPOS` / osa C = posun + směr · (úhel díry −
  úhel nástroje), TRANSMIT natočený stejně. Simulace natáčí kus osou C (přejezd
  mezi dírami polárně), v řezu se soustružení ztlumí, díry jsou ve výšce podle
  natočení a je vidět vrták / fréza na dosažené hloubce; značka C0 i šipka
  nástroje (CAM i bokorys v CAD) nahoře. Test `cam-live-tools` (poloha
  nástroje).
- **CAD: ⇋ Zrcadlit kolem osy jako technologický výkres.** Spodní polovina
  se kreslí čarou originálu (plně, polotovar svou čarou) místo
  poloprůhledné čárkované, hrany a přechody (osazení, sražení, zápich,
  konec polotovaru) se spojí přes osu — viditelné čarou obrysu, zakryté
  tence čárkovaně, tečné přechody zaoblení ne (ISO 128). Kresba čel
  (bokorys) se nezrcadlí. Modul `render/mirrorEdges.js`.

- **CAM: simulace vrtání a frézování v pohledu na čelo.** ▶ / ⏸ v hlavičce
  pohledu: nástroj jede v pořadí NC s reálným časem (posuv F, rychloposuv,
  natočení C, krokové vrtání, prodleva) × rychlost přehrávače; díry se
  prohlubují, fréza nechává stopu, hotové operace zezelenají, v řezu se
  vybarví úběr do dosažené hloubky. Po dojetí soustružení v přehrávači CAM
  obrábění samo naváže (pohled se otevře a sleduje obráběné čelo); ⏹ / posun
  zpět díry vrátí. Moduly `cam/live/liveMachining.js`, `liveOpForm.js`, test
  `tests/live-machining.test.js`.
- **CAD: lišta čela (bokorys) přímo na plátně pod nárysem.** Už neleží
  u spodního okraje přes tlačítka (mobil) — posouvá se s výkresem a mění
  velikost se zoomem. Na soustruhu posuvník Z lícuje s osou nárysu: krajní
  polohy pod konci profilu, jezdec pod značkou řezu. Lišta nástrojů ji
  překryje, kolečko nad ní zoomuje plátno (`js/faceView/faceBar.js`).
  Lišta stojí pod VŠÍ kresbou nárysu — i pod tím, co se dokreslí (v režimu
  čela se kreslí do vrstvy čela, dřív ležela přes dokreslenou úsečku);
  kresba v kruhu bokorysu a skryté vrstvy se nepočítají (`drawnBounds`,
  test `tests/face-bar.test.js`).
- **CAD: lišta čela a značka řezu jdou chytit prstem.** Posuvník lišty čela
  se táhne vlastní obsluhou (myš i prst, chytá se kdekoli na dráze) — nativní
  posuvník prohlížeč při tahu prstem rušil jako posun stránky a jezdcem nešlo
  pohnout. Na dotykovém displeji je jezdec aspoň 1,25× (~20 px, dřív při
  měřítku 0,7 jen 11 px) a plocha pro prst ~37 px vysoká. Značka řezu v nárysu jde chytit i mimo Výběr — po nakreslení
  úsečky zůstal nástroj Úsečka a řez nešel chytit vůbec: v nástrojích
  kreslení za konce přesahující díl (šipky, popisek Z), uvnitř dílu se dál
  kreslí; ve Výběru kdekoli na čáře (`faceReference.cutHit(…, endsOnly)`,
  `faceBar.faceRangeScale`, `faceBar.rangeValueAt`).
- **CAD: lišta čela při tažení neskáče.** Stála pod spodním koncem značky
  řezu, jejíž délka se počítá z průměru v Z — při posunu po profilu lišta
  skákala k ose a od osy. Teď se staví pod řez přes největší průměr dílu
  (`faceCutGeom().spanMax`). Po tažení řezu myší se spolkne následný klik
  (🎯 výběr z plátna by vzal bod puštění) a řez se nechytá během
  rozmisťované kóty.
- **CAD: lišta čela hned pod osou, když pod osou nic není.** Značka řezu
  vedla souměrně i pod osu do prázdna a lišta stála až pod ní. U polovičního
  profilu (pod osou nic nakresleno) jde řez jen přes kreslenou stranu, pod
  osu krátký přesah 10 px bez šipky, promítací čáry jen nad osou — lišta stojí
  22 px pod osou, pořád pevně (nezávisle na Z). S něčím pod osou zůstává řez
  přes obě strany a lišta pod ním.
- **CAM: zmenšený panel G-kódu ukazuje 4 řádky místo 2.** ▼ u přehrávače:
  blok, který právě prošel (ztlumeně), běžící blok a dva, které přijdou
  (`cam/sim/codeMini.js`; `camSimulator.js` se tím zmenšil).
- **CAM: pohled na čelo jde přibližovat a posouvat jako nárys.** Kolečko /
  dva prsty = zoom (kolem kurzoru), tažení = posun, dvojklik / dvojí ťuknutí
  nebo 🎯 v rohu = vycentrovat (`cam/live/liveFaceNav.js`).
- **CAM: Pohled na čelo = řez v rovině Z s lištou, maximalizace, editor
  s místem.** Lišta pod hlavičkou pohledu: Z políčkem, posuvník roviny řezu
  (přichytí se k osazením a čelům operací), ◀ zprava / ▶ zleva; pohled
  kreslí řez jako bokorys v CAD (plocha řezu, hrany za ní plně / zakryté
  čárkovaně), rovina je vidět i v řezu vlevo. Z↔ lištu schová, ⤢ zvětší
  pohled přes celé okno. 🛠 Operace se otevře v maximalizovaném pohledu
  (na výšku náhled nad formulářem, na šířku vedle sebe) — dřív dostal
  editor pár pixelů. Moduly `cam/live/liveCut.js`, `liveCutBar.js`, test
  `tests/live-cut.test.js`.
- **CAM: ◎ Pohled na čelo přepíná jako bokorys v CAD.** Tlačítko ◎ v liště
  plátna: řez → řez + čelo → ◉ jen čelo (přes celou plochu) → řez. Místo
  sklíčidla s čelistmi je na kusu zelený zářez **C0** (nula osy C podle
  kalibrace úhlu) s obloučkem **+C**; měřítko pohledu zahrne i obrys větší
  než polotovar. Lišta čela (posuvník Z) a kulaté ◎ z CAD se nad oknem CAM
  a jinými dialogy neukazují — zakrývaly G-kód a ovládaly výkres pod oknem.
- **Bokorys: značku řezu v nárysu jde tahat.** Čerchovanou čáru řezu se šipkami
  a popiskem Z lze chytit myší (8 px) nebo prstem (22 px) a posouvat po profilu;
  u osazení se přichytí, zvýrazní se a kurzor ukáže ↔. Dělá totéž co posuvník
  (`faceView/faceCutDrag.js`, test v `tests/face-view.test.js`).
- **Poháněné nástroje: kontrola M-kódů a osy C.** Opraveno `CYCLE83` (DAM = 0,
  stálé záběry; dřív se další záběry zkracovaly). TRANSMIT nově zapíná vřeteno
  do osy (M70), na konci operace `SPCOF`. Číslo vřetena poháněného nástroje
  (`M<n>=3`, `S<n>=`), jméno osy C (C1/C2…) a kalibrace úhlu (směr, posun nuly)
  jsou v nastavení; prázdné pole M-kódu = výchozí. Heidenhain: poháněný nástroj
  M3 / M5. V panelu je návod na ověření na stroji; příručka M-kódů má `M70` a
  opravené `S2=…` u `M2=3`/`M2=4`.
- **Mobil: zvoneček 🔔 Hlášky je v horní liště vždy.** Dřív se ukázal jen po
  odložené hlášce a po obnovení stránky „zmizel". Delší nápovědy (bokorys) jdou
  na mobilu rovnou pod něj (`showToast(…, { bell: true })`) místo okénka dole.
  Otevřený seznam hlášek už nezakrývají plovoucí tlačítka; „Pohled vycentrován"
  se při startu stránky nehlásí.
- **CAM: lišta nad plátnem se otevírá sbalená (»«).** Kontura, Dráhy, 🎯, 👁,
  📏, 🧲 a 📈 se ukážou tlačítkem »«.
- **Refaktoring: `render.js` rozdělen do `js/render/*.js`** (11 modulů podle
  témat, největší `objects.js` ~890 ř.). `render.js` zůstal jádrem
  (`renderAll`) a rozcestníkem se stejným seznamem exportů – importy jinde
  se nemění. Chování beze změny.
- **Refaktoring: společný kód CAM Editoru a CNC Editoru v
  `js/calculators/gcodeEditorShared.js`.** Oba editory měly ~300 ř. shodných
  kopií (slovníky G/M kódů, zvýraznění, výchozí hlavička, řídicí systém,
  převod sražení/zaoblení na dráhu). Převod rohů je jedna funkce s volbami;
  výstup obou editorů ověřen proti původnímu kódu (3 řídicí systémy × 16
  stavů). Nový test `tests/gcode-editor-corners.test.js`.

- **Pravý panel: z „Další kalkulačky" zmizelo tlačítko VK Kontura.** Bylo
  to duplikát – VK se otevírá z okna „Zadání objektu" na výkresu (🔢 Zadat /
  ✏️ VK, záložka VK). `index.html`, `js/ui/launchers.js`, testy, dokumentace.
- **Pravý panel: CNC Kód je po načtení sbalený.** Otevře se klepnutím na
  hlavičku (a při otevření se kód přegeneruje). Šipka ▸/▾ u CNC Kódu
  a Objektů se teď při klepnutí správně přepíná (byla ve `<span>`, který
  se přeskakoval). `index.html`, `css/style.css`, `js/ui/intersectionList.js`.
- **Tolerance: úchylky ve „Vlastních úchylkách" jde zadat v mm i µm.**
  Tlačítko mm/µm pod popiskem Rozmezí přepíná jednotku a přepočte už
  zadané hodnoty; výsledek zůstává stejný. Volba se pamatuje.
  `js/calculators/tolerance.js`, `css/style.css`, test `tolerance-units`.
- **Mobil: ve výběru textu by nemělo být „Přeložit".** Stránka je označena
  `translate="no"` (a `notranslate`), takže Chrome na Androidu nemá
  nabízet překlad vybraného textu. Vyjmout/Kopírovat/Vložit zůstává (je to
  systémové menu). `index.html`.
- **Tolerance: okno se nezavře klepnutím mimo ně** (jen křížkem nebo Esc).
  Na mobilu se s otevřenou klávesnicí posune úplně nahoru (přes pravý panel),
  aby byl vidět výsledek. Tlačítka ± u Rozmezí zůstávají (iOS klávesnice
  nemá minus). `js/calculators/tolerance.js`.

### Fixed

- **CAD: posuvník natočení napevno u bokorysu, lišta čela na dva řádky.**
  Svislý posuvník úhlu C se přisouval k pravému okraji plátna — při posunu
  plátna ujížděl po bokorysu a ležel přes něj. Teď stojí napevno vlevo od
  bokorysu (mezi nárysem a bokorysem) a posouvá se s ním; když se tam při
  oddálení nevejde a ležel by přes nárys, přeskočí vpravo. Políčko C s ✔ ⟲
  je pod bokorysem a vyhne se nárysu i liště Z; mělo omylem šířku políčka Z
  (64 px místo 38 px). Řádek pod posuvníkem Z je na dva řádky (výběr čela,
  ➕, 🗑 / Z, ✔, strana) — na mobilu byl moc dlouhý. Test
  `tests/face-rotate-layout.test.js`.

- **CAD: políčka Z čela a úhlu C s výpočtem a tlačítkem ✔.** Do políčka Z
  (lišta čela) i C (natočení pohledu) jde psát výpočet (`90+60`, `76-5,5`);
  při psaní se objeví zelené ✔, potvrdí i Enter nebo odchod z políčka, Esc
  vrátí hodnotu. Po potvrzení je v políčku výsledek — dřív tam zůstal výraz
  a nebylo poznat, jestli se použil. Výběr čela ukazuje pořadí a obsah
  kresby („2: Z76 ◀ · 3 díry"), víc čel ve stejném Z šlo dřív rozlišit jen
  naslepo. Nové čelo převezme natočení pohledu (dřív skočilo na výchozí).
  Modul `js/faceView/exprField.js`.

- **CAD/CAM: opravy po kontrole děr a drážek v plášti a na čele.** Prázdné
  „Do Ø" u díry / drážky v plášti už nevrtá tiše až do osy (`null >= 0` je
  v JS true), hlásí chybu. Drážka pro pero se seznamem bodů bere řádek
  „úhel", jak říká formulář (dřív parser chtěl dvě čísla a seznam vyšel
  prázdný). Okno Drážka do čela už neukazuje výběr Závit, který nic nedělal.
  Dráha širší drážky na čele v řezu přesahuje oba konce ven i u drážky
  nakreslené zvenku dovnitř.

- **CAM: frézovací operace volala T6 = upichovák.** Výchozí číslo nástroje
  frézy bylo T6, ve výchozím zásobníku upichovák — Fanuc `T0606`,
  Heidenhain `T6` by vzaly upichovák. Teď T frézy ze zásobníku, bez ní
  volné T. Fréza, která neřeže středem, hlásí kontrola (zanořuje se kolmo).

- **CAM: výchozí název operace bez čísla** — operace normalizovaná bez
  pořadí (např. načtená ze starého uložení bez názvu) se jmenovala
  „Frézování undefined" i v komentáři NC; teď „Frézování" / „Vrtání".

- **CAD: díry v plášti — opravy po kontrole.** Díra vrácená ↩ po smazání
  vrstvy Díry v plášti už nespadne do profilu (do CAM / CNC kódu): díra se
  pozná podle svých dat i bez vrstvy, další díra ji vrátí do vrstvy. Z díry
  na osazení (SNAP na roh profilu) se odmítne s Ø po obou stranách — plášť
  tam byl dvojznačný. Posuvník natočení se na telefonu přisune k okraji
  plátna (vypadával vpravo z obrazovky). Díra „skrz stěnu do vývrtu"
  z výkresu už v CAM nehlásí varování o vrtání do vývrtu (je to záměr,
  `op.throughWall`); ručně zadaná hloubka do vývrtu ho hlásí dál.

- **CAM: záložka Vrtání se při aktivním vrtáku neotevřela.** S vrtákem už
  nasazeným (panel na Hrub.) klik na Vrtání přepnul záložku jen ve stavu,
  panel se nepřekreslil a „Co vrtat" se ukázalo až po kliku na nástroj.
  `machTabTool.pickDrill` teď panel překreslí, test v `drill-from-cad`.

- **CAM: frézování přes osu C jelo jiným posuvem, než je zadaný.** Kapsa
  a drážka bez TRANSMIT (krátké G1 X… C…) měly F jen na prvním řádku;
  řídicí systém ale v pohybu X + C počítá stupně jako mm, takže na R100
  jela fréza 1,75× rychleji (Sinumerik bez FGROUP dokonce podle samotné X).
  F se teď přepočítá pro každý úsek na skutečný posuv břitu, Sinumerik
  dostane `FGROUP(X, Z, C)` … `FGROUP()`.
- **CAM: změna Q / odskoku / prodlevy v záložce Vrtání se do děr z výkresu
  nepropsala** (jen při kliknutí na záložku nebo výběru děr). Teď hned
  (`liveDrillTools.syncDrillTabParams`).
- **CAM karusel: díry do čela a vrták v řezu na špatném místě.** Řez v CAM
  počítal výšku díry r·sin C i na karuselu, kde rovina řezu leží v pohledu
  na čelo vodorovně (nárys CAD bere vodorovnou souřadnici) — díra C 0° byla
  na ose a poháněný vrták (stojí vpravo, 0°) se kreslil na ose místo na
  poloměru díry. Teď r·cos C (`liveSection.sectBase` / `sectHeight`).
- **CAM: Vrtání se „Středovou dírou v ose" si bralo vrták děr z výkresu.**
  Klik na záložku Vrtání teď při zdroji *V ose* vrták děr nevnucuje.
- **CAM: dráhy radiálních děr stejné výšky v řezu jezdily mezi dírami ven.**
  Jako v NC jen natočení C; údaj nad časem píše „natočení C" jen při najetí
  na další díru.
- **CAM: při vrtání byl v řezu vidět i vrták soustružení.** Nástroj části
  stál na bezpečné poloze vedle poháněného vrtáku; po dobu vrtání ◎ se teď
  nekreslí (`livePanel.liveBusy` → drawToolpath).
- **CAM: „4 řádky" G-kódu na mobilu ukazovaly při vrtání pořád
  G0 X150 Z5.** Teď sledují řádek bloku jako celý panel.
- **CAM: při odvodu třísky skákalo zvýraznění mezi řádkem díry a cyklem.**
  Celé vrtání díry stojí na řádku cyklu (najetí na díru = řádek „díra k");
  rozepsaný kód jde řádek po řádku podle pohybu (G0 R rovina, G1 záběr,
  G0 vyjetí, návrat 0,3 mm nad dno — simulace teď stejně jako NC).
- **CAD/CAM: díra skrz vč. polotovaru začínala uvnitř polotovaru.**
  Posuvník čela (bokorys CAD i lišta řezu v CAM) sahal jen po konec hotové
  kontury, takže úplně vpravo stál v polotovaru a díra *I polotovar* začala
  vrtat na konci kontury. Posuvník teď sahá přes polotovar (přichytí se
  i k jeho koncům) a díra skrz vč. polotovaru začne na povrchu polotovaru na
  straně nástroje, i když čelo stojí uvnitř něj (`faceDepth.stockSpan`,
  nárys CAD stejně). Operace nese `throughStock` a kontrola proti dílu ji
  porovná s dílem i polotovarem (dřív by hlásila „za čelem není materiál").
- **CAM: nástroj nahoře zůstal vrták Ø20, i když díry vrtá T8 Ø10.** Po
  doplnění vrtáku do 🔧 Zásobníku nebo změně výběru děr se teď nástroj části
  přepne na vrták první vybrané skupiny (i T v hlavičce programu); klik na
  záložku Vrtání ho srovná také (`machTabTool.syncLiveDrillTool`).
- **CAM: vrtání nešlo pozastavit, ▶ spustilo program od začátku.** Po dojetí
  programu (u operace Vrtání je to jen najetí G0 X150 Z5) ▶ / ⏸ v přehrávači
  dole teď pozastaví a pustí dál vrtání. Při přehrávání se v G-kódu zvýrazní
  řádek bloku, který se vrtá, nad časem je nástroj, otáčky a posuv a v řezu
  jsou dráhy vrtáku (posuv zeleně, rychloposuv čárkovaně) — dřív to vypadalo,
  že se dráhy vrtání nevygenerovaly (`cam/live/liveNcSync.js`).
- **CAM: drážka z CAD frézovala od roviny čela ve vzduchu.** Stojí-li čelo
  před přírubou, drážka (úsečka v bokorysu) se teď frézuje od prvního
  materiálu pod svou osou jako díry („Drážka 1 · Z280 ◀",
  `faceDepth.slotForCam`).
- **CAM: poháněné nástroje — odjezd od čela zleva vedl skrz díl.** Po každé
  operaci jel blok na bezpečnou polohu šikmo `G0 X… Z…` naráz; od čela
  zleva (nástroj vlevo od příruby, bezpečná poloha vpravo) tak rychloposuvem
  projel materiálem. Teď nejdřív radiálně ven `G0 X`, pak `G0 Z` (jako
  vrtání v ose) — `liveGcode.buildLiveBlock`.
- **CAM: frézování přes osu C (Fanuc, Heidenhain) — skok úhlu přes 0°.**
  Kapsa / drážka rozložená na G1 v X + C psala absolutní úhel 0…360°, takže
  kolem C0 (kapsa pod nástrojem) šlo `C357,677 → C0`: stroj bez nejkratší
  cesty by kus v řezu otočil o −358° a fréza by vyjela celé mezikruží čela.
  Úhel se teď píše spojitě od předchozího bodu (může být < 0 nebo > 360);
  Sinumerik dál `C=DC(…)`.
- **CAM: simulace obráběla operaci, kterou NC blok vynechal.** Operace
  s chybným zadáním (kapsa menší než fréza, hloubka ≤ 0 …) se do programu
  nezapíše, ale ◎ simulace ji vrtala / frézovala — teď ji přeskočí také.
- **CAM: název operace z CAD se po změně hloubky nepřepsal.** Po změně díry
  ze „skrz" na „hl. 12" v CAD zůstal v CAM název „Díry Ø8 skrz". Název
  z výkresu se teď generuje znovu (`autoName`), ručně přejmenovaná operace
  si název nechá.
- **CAM: vrták na Ø, který 📚 katalog nemá (např. 7), se nedal přidat.**
  Postaví se podle nejbližšího katalogového Ø s přesným Ø díry.
- **CAD: tlačítko Kr.pole bez výběru nic nedělalo.** Jen hláška „Nejdříve
  vyberte objekt" a nástroj se nezapnul. Teď se zapne (jako Lin.pole) —
  klepnutím na objekt se otevře dialog kruhového pole.
- **Bokorys (CAD i CAM): v rovině osazení falešný vývrt.** Plocha řezu se
  brala jako mezikruží mezi oběma průměry osazení, takže plný hřídel měl na
  čele osazení díru. Teď je to materiál těsně za rovinou ve směru pohledu
  (`sectionAt` ve `faceView/faceReference.js`).
- **Nulový bod se po obnovení stránky obnoví spolu s INC.** Po „Smazat vše"
  a obnovení stránky zůstal režim INC vůči nulovému bodu, ale bod byl skrytý
  a bez natočení. Nulový bod se teď ukládá a obnovuje spolu s ABS/INC.
  `js/storage/settingsStore.js`, `js/ui/nullPoint.js`.
- **Nastavení z otevřeného projektu se uloží hned.** Dřív až s dalším
  automatickým uložením. Nastavení se také uloží i tehdy, když zápis výkresu
  do IndexedDB selže (plné úložiště). Aplikace naběhne a nastavení obnoví,
  i když IndexedDB nefunguje. `js/storage/projectManager.js`, `js/app.js`.
- **Kalkulačka: historie se nevykresluje do zavřeného okna.** Když se okno
  zavřelo dřív, než se historie načetla z IndexedDB, vykreslovala se do
  zavřeného okna. V testech na GitHubu to po skončení testu shodilo běh
  („document is not defined"). `js/ui/calculator.js`, test
  `ui-calculator-history-race`.
- **Poznámky: hledání se posune na nález i v dlouhých odstavcích.** Posun
  počítal jen řádky textu, ne zalomené řádky na obrazovce, takže nález
  zůstal mimo viditelnou část. `js/ui/notesDialog.js`.

- **Nastavení se po obnovení stránky už neztrácí.** Ukládalo se jen spolu
  s rozkresleným výkresem a obnovilo se jen tehdy, když výkres nebyl prázdný —
  po „Smazat vše" nebo bez výkresu se vrátilo na výchozí. Tolerance úhlového
  snapu, snap k bodům a otočení osy Z se neukládaly vůbec, otočení os
  a náhled zrcadlení se při startu neobnovily a přepnutí klávesou (S, D, N,
  I…) se neuložilo. Teď se nastavení ukládá zvlášť od výkresu (hned po
  změně, při autosave i při zavření nebo obnovení stránky) a při startu se
  obnoví vždy; nastavení ze starší verze se převezme z uloženého výkresu.
  Projekt nově nese i otočení osy Z. `js/storage/settingsStore.js`, test
  `settings-store`.

- **Dolní lišta ukazuje nápovědu k nástroji a název projektu.** Obojí se
  zapisovalo do prvků, které v aplikaci nebyly. Teď jsou na konci dolní lišty
  ve volném místě (ostatní položky se neposunou); když se nevejdou, zkrátí se
  „…“ a celá nápověda je v popisku. `index.html`, `css/style.css`, testy
  `ui-toolbar`, `ui-help-theme`.
- **Tlačítka v dolní liště už nemizí pod pravým panelem.** Při užším okně
  (pod ~1250 px) se ⚙️ Nastavení, při ještě užším i ✏️ Editor a ✏️ VK
  schovaly pod pravý panel a nedaly se použít. Dolní lišta teď končí u okraje
  panelu a co se nevejde, přejde na druhý řádek. `css/style.css`, test
  `statusbar-layout`.
- **Dialogy Velikost mřížky a Krok úhlového snapu jdou zase otevřít.** Šly
  jen pravým klikem na tlačítka snapu, která v aplikaci nejsou. Teď pravý
  klik na indikátor **#** / **∠** v dolní liště (desktop). Po změně se mřížka
  překreslí, indikátor ukáže novou hodnotu a nastavení se uloží (dřív zůstalo
  jen v paměti). `js/ui/statusButtons.js`, `js/ui/gridAngleDialogs.js`,
  testy `ui-status-buttons`, `ui-grid-angle-dialogs`.
- **Okna se nezavřou, když tažení z nich skončí nad pozadím.** Označení
  textu v poli (nebo tažení posuvníku) z okna ven a puštění myši nad tmavým
  pozadím okno zavřelo — Nastavení, kalkulačky, poznámky, vstupní dialogy,
  nápověda, dialogy CAM simulátoru i editorů. Klik na pozadí teď okno zavře
  jen tehdy, když i stisk začal na pozadí. Společný `closeOnBackdropClick()`
  v `js/dialogFactory.js`, test `dialog-backdrop`.
- **Výběr barvy: tažení puštěné mimo okno ho už nezruší.** Po tažení
  v barevné ploše nebo posuvníku (odstín, tloušťka, průhlednost) a puštění
  myši nad pozadím se okno zavřelo a barva se vrátila. Klik mimo okno teď
  zruší výběr jen tehdy, když i stisk začal mimo okno. `js/ui/colorPicker.js`,
  test `ui-color-picker`.
- **Kontura uložená přepnutím nástroje jde vrátit jedním Zpět.** Rozkreslená
  kontura se při přepnutí na jiný nástroj uloží; dřív k tomu vznikly dva
  záznamy Zpět (první konturu vrátil, druhý nic). `js/ui/toolbar.js`, test
  `ui-toolbar`.
- **Nulový bod: hláška ukazuje polohu bodu.** Po nastavení nulového bodu
  hláška vždy psala „Nulový bod: ΔX: 0 ΔZ: 0" (souřadnice se formátovaly až
  vůči právě nastavenému bodu). Teď ukáže absolutní polohu, např.
  „Nulový bod: X: 4 Z: 12 ∠15°". `js/ui/nullPoint.js`, test `ui-null-point`.
- **Výběr barvy: nehromadí listenery při každém otevření.** Každé otevření okna
  výběru barvy (barva vrstvy, objektu, Vybarvit) přidalo na `window` dva
  listenery pro tažení v ploše a už je neodebralo. Teď se odeberou při zavření
  okna. `js/ui/colorPicker.js`, test `ui-color-picker`.
- **Poznámky: hledání už nepřepisuje text poznámky a Escape nezavře okno.**
  Po prvním napsaném znaku v poli Hledat skočil kurzor do poznámky a další
  písmena přepsala označený nález (hledání „ahoj" v „ahoj světe" udělalo
  „hojhoj světe"). Psaní a Enter teď zůstávají v poli hledání (nález se
  v poznámce označí a posune), Escape zavře jen lištu hledání a vrátí kurzor
  na označený nález — dřív zavřel celé okno. `js/ui/notesDialog.js`, test
  `ui-notes`.
- **CAM čelně, kulatá: do plného materiálu pod úhlem zanoření, ne kolmo.**
  Průchod jde do plného materiálu nejvýš o ap·tan(úhel zanoření) pod dno
  předchozí vrstvy (při 45° o ap), další zase o ap níž (pravidlo 6). Dřív pod
  přírubou sjel z X32,3 rovnou na X22,8 a bral plnou šířkou nosu — hrozilo
  vylomení držáku. `ops/face/plungeDescent.js`, klíč `faceDescentAtPlungeAngle`.
  Hlídání držáku bere dno průchodu nejvýš na plánovacím obrysu polotovaru
  (zkrácený průchod nad polotovarem nedělá falešnou stěnu).
- **CAM čelně: odskok nejede po obrobené ploše ani do ní.** Když obrobené dno
  mezi koncem průchodu a další vrstvou na straně odskoku stoupá stejně strmě
  jako odskok (45° odskok po 45° schodišti zanoření) nebo strměji, odjede se
  kolmo „Výjezd v X". Dřív to kontrola viděla jen do vzdálenosti odskoku
  (2 mm), vrstvy jsou ale od sebe ap (`roughEmit.js`).
- **CAM čelně, kulatá: dojezd „bez schodků" vždy.** Vynechá se jen dojezd,
  který je geometricky ve vzduchu (vrstva, ke které stoupá, jela hlouběji);
  dřív rozhodovalo jen měření úběru a na schodu 0,04 mm se dojezd střídal.
- **CAM čelně, kulatá: S25 — 45° až za konec polotovaru.** Mezní čára od konce
  dílu vede dráhu až na svůj konec i za offsetem čela a vrstvy pokračují nejvýš
  o R za konec polotovaru, dokud nos bokem bere jeho roh.
- **CAM čelně, kulatá: 45° průchody před čelem osazení dojedou na konec mezní
  čáry (S5).** Mezní čára zanoření vedla před čelem příruby až na hranu
  polotovaru, ale offset čela ji protnul uprostřed a dráha za průsečíkem
  pokračovala POD mez — průchody skončily u čela a klín polotovaru „od nože"
  zůstal stát. Napojení, za kterým řetěz zajede pod mez, má teď přednost až po
  dojezdu „po čáře na konec a kolmo dolů" (`guideOffsetJoin.js`, jen kulatá).
  Díl uživatele: −166 mm² zbytku, 0 kolizí; uvolnilo to i několik průchodů pod
  přírubou. Přejezd v Z, kterému lokální strop nestačí (nos R sahá do stran),
  hledá nejnižší volnou výšku místo skoku na strop nad konturou (`roughEmit.js`).
- **CAM: planá „KOLIZE: Rádius kontury menší než nástroj".** Kontrola hlásila
  každý oblouk menší než R plátku + přídavky — i vypuklé hrany (plátek je jen
  objede) a dutá zaoblení přesně v R plátku. Nově jen DUTÉ zaoblení menší než
  R plátku (`isOuterArc` v `cam/toolOffset.js`, táž geometrie jako offset).
  Dráhy beze změny (otisk shodný u všech fixtures); mizí 6 hlášení na part-22/23
  a 2 na part-18. Test „oblouk jen z půlky" už nepočítá strmý kus pravidla 15
  (`belowPlunge`) — tam se oblouk dělí záměrně.
- **Text: tlačítko „📝 Otevřít editor textu“ ve vlastnostech** nic nedělalo —
  `ui.js` načítal dialog z `'../dialogs/textDialog.js'` (mimo složku `js/`).
  Našel to nový test importů.
- **CAM: 🔄 Dráhy × ✂ Po úsecích v náhledu Celý program.** U programu z úseků
  je vidět buď jedno, nebo druhé podle hrubování v panelu. Po úsecích se
  čelně neukazuje (úseky nemá, klik končil chybou). Čelně je místo něj
  🔄 Dráhy, které po potvrzení nahradí části jedním programem s nastavením
  z panelu. Dřív se 🔄 Dráhy v Celém programu skrývalo (po načtení nebylo co
  zmáčknout) a po přepnutí na část vrátila část své Podélně. Pravidla
  v `cam/genButtons.js` + test, camSimulator.js se zmenšil.
- **ISO katalog: držák SRGCR/SRGCL má hlavu sraženou 45°.** Výrobce (AKKO) uvádí
  SRGCL 2525 M12 jako ekvivalent SRSCR; styl G se dřív kreslil s rovným čelem
  hlavy. Nyní má stejný obrys jako styl S, a protože by byly dvě karty stejné,
  v katalogu zůstává jen SRSCR/SRSCL (popisek „SRSCR = SRGCR“). Kód SRGCR/SRGCL
  se u uložených nožů dál rozpozná (`alias` v `ISO_HOLDER_TYPES`).
- **CAM: „🎯 Přebrat souřadnice z bodu" v režimu průměru.** Přichycení
  porovnávalo průměr bodu s poloměrem kurzoru (k bodu se nepřichytilo,
  u INC bodů přírůstek místo polohy), modal „➕ Vložit segment" pak dostal
  do pole X poloměr místo průměru. Teď se přichytává k absolutní poloze bodu,
  pole X dostane průměr a režim se přepne na G90 (převzatý bod je absolutní).
  Druhé 🎯 ve stejném modalu dřív nedělalo nic — handler se nastaví při každém
  vstupu (i v modalu „➕ Přidat pohyb" na dráze). Test `sim-ui-insert-segment`.
- **CAM: nesmyslná souřadnice v ⛔ hlášce („X973417795…").** Program uložený
  v .camprog / prohlížeči před opravou generátoru z 27. 8. 2026 (upichovák,
  zanoření 90° → `G0 X486708909.740`) se při otevření nepřegeneroval, protože
  má stejnou verzi logiky drah. Teď se uložený program se souřadnicí mimo
  rozsah stroje (> 10 m) zahodí a dráhy se vygenerují znovu; ručně upravený
  zůstane a aplikace na souřadnici upozorní. `cam/sim/programSanity.js`,
  test `sim-ui-program-sanity`.

### Removed

- **CAM: tlačítko „📐 Kreslit"** (spodní panel G-kódu i záložka ✏ Editor).
  Mazalo výkres v CAD bez dotazu (připravený dotaz se kvůli chybě nikdy
  neukázal) a uživatel ho nepoužíval. Návrat do CAD je křížkem ✕: bez změn
  jen zavře, se změnami se zeptá „Zahodit změny / 📐 Zachovat a přenést".
  Test `sim-ui-send-to-canvas`.

### Added

- **Rozdělení `js/ui.js`** (5 312 ř.) do `js/ui/` (`docs/plan-refaktoringu-ui.md`).
  Kód přesunutý beze změny, `ui.js` zůstává rozcestníkem (156 ř.) se stejnými
  exporty a s kódem při načtení (bridge, listenery) v původním pořadí — moduly
  v `js/ui/` mají `initXxx()`. 16 modulů + balík: poznámky, kalkulačka, Trigonometrie,
  spouštěcí tlačítka, výběr barvy, dialogy mřížky/úhlu, nulový bod, Smazat vše
  a historie, Nastavení, průsečíky, vrstvy, seznam objektů, skok do CNC kódu,
  lišta nástrojů, přepínače stavového řádku, nápověda a motiv a panel vlastností
  (`js/ui/properties/`: kostra + větve podle typu objektu). Pojistky
  `tests/ui-api.test.js` + harness `tests/helpers/uiDom.mjs` (exporty, klíče
  `bridge`, pořadí listenerů při načtení, stráže importů a kódu při načtení)
  a 16 charakterizačních testů `tests/ui-*.test.js` (panel vlastností
  generativně: 16 scénářů, 190 akcí), všechny psané a ověřené na kódu před
  přesunem. Nalezené chyby (neopraveno, zapsáno v plánu): Escape v hledání
  poznámek zavře okno, únik listenerů výběru barvy, tlačítka bez prvků
  v `index.html` (dialogy mřížky/úhlu nedosažitelné, hinty a název projektu se
  nezobrazují), toast nulového bodu „ΔX: 0 ΔZ: 0", dvojí Zpět při auto-uložení
  kontury.
- **Rozdělení `js/geometry.js`** (2 554 ř.) do `js/geometry/` podle témat
  (výběr klikem, hit-test, průsečíky, tečny, tečné kružnice, přímky + offset,
  transformace, zaoblení/sražení). Kód přesunutý beze změny, `geometry.js`
  zůstává rozcestníkem se stejnými exporty. Nový test
  `tests/geometry-api.test.js` (seznam exportů + dosud netestované funkce:
  výběr objektu, tečné kružnice, zaoblení úsečky s obloukem, okamžitý CNC export).
- **Testy okna CAM simulátoru a jeho rozdělení** (`docs/plan-rozdeleni-cam-simulatoru.md`):
  harness `tests/helpers/simUi.mjs` (happy-dom, záznam kreslení) a testy
  `tests/sim-ui-*.test.js`; z `camSimulator.js` (11 716 → ~10 970 ř.) přestěhované
  beze změny chování do `js/calculators/cam/sim/`: Auto-rozměr polotovaru,
  📐 Kreslit, modaly tečny a vložení segmentu, varování kolizí.
- **Viditelné hlášení chyb**: neošetřená chyba dřív skončila jen v konzoli
  (na mobilu neviditelná). Teď se ukáže lišta „⚠ Něco se pokazilo“
  s tlačítkem „📋 Zkopírovat pro Clauda“ (text chyby, místo, verze, prohlížeč;
  nic z výkresu). `js/errorReport.js` + test; verze v `APP_VERSION` (constants.js).
- **Hlídače kódu v testech**: ESLint (`npm run lint`, v `test:cad` jen
  skutečné chyby — neexistující proměnná, zdvojený klíč…; styl jen jako
  varování) a test, že každý relativní import vede na existující soubor
  s přesnou velikostí písmen.
- **GitHub Actions** (`.github/workflows/testy.yml`): po pushi do main běží
  `npm run test:cad`; plná sada ručně (Run workflow → Plná sada).
- **Vývojové nástroje**: vitest 5 (oprava bezpečnostního varování
  `@vitest/mocker`), `npm audit fix` (nanoid), happy-dom, eslint.
  `npm audit`: 0 varování.
- **Trigonometrie: záložka Obecný trojúhelník** vedle původního pravoúhlého
  (přepínač nahoře, volba se pamatuje). Ze 3 hodnot (aspoň jedna strana)
  řeší SSS, SAS, ASA/AAS i SSA včetně dvou řešení; obsah, obvod, výšky,
  poloměry kružnice opsané a vepsané, náčrt, kopírování. `triangleSolver.js`
  + test, záložky `calculators/trigGeneral.js` (do okna v ui.js se napojují
  přes `bridge.extendTrigCalc`, ui.js nevyrostl).
- **Rozteč děr → Rozmístění děr**: k roztečné kružnici přibyly záložky Řada
  (díry na přímce: rozteč + úhel nebo koncový bod) a Mřížka (nx × ny,
  natočení, pořadí po řádcích / meandr). Přejmenováno, nová ikona (kružnice
  + mřížka). `holePatternMath.js` + test, panely `holePattern.js`. SW v478.
- **Kalkulačka ⚖️ Objem z výkresu** v Další kalkulačky – rotační objem,
  hmotnost a těžiště hotového dílu z kontury ve výkresu, polotovar z vrstvy
  Polotovar nebo válec Ø × L a odebraný materiál (kg, cm³, %). Přesný výpočet
  z úseček a oblouků (Pappova věta), soustruh i karusel. `revolveMath.js` + test
  (koule, polokoule, torus, komolý kužel, těžiště), okno `volume.js`, nový export
  `getRevolveProfiles` ve `stockTools.js`. SW v478.
- **Kalkulačka ⌒ Oblouk** v Další kalkulačky – tětiva + výška + rádius
  (libovolné dvě), oblouk přes tři body a oblouk ze startu, konce a R: střed,
  I/K, úhel, délka a řádky G02/G03 podle nastavení stroje (sdílí `arcCode`
  s kalkulačkou Roh R / C). `arcMath.js` + test, okno `arc.js`.
- **Kalkulačka 🌡️ Roztažnost** v Další kalkulačky – rozměr při teplotě ↔ 20 °C,
  teplota ohřevu / chlazení pro nalisování, změna vůle spoje z různých
  materiálů. `thermalMath.js` + test, okno `thermal.js`. Tlačítka obou
  kalkulaček napojuje `calcLaunchers.js` (ui.js je na stropu velikosti). SW v473.
- **📚 Katalog: dřík 40×40** (R200, f1 50) pro karusel — všechny typy držáků,
  zapichovací MGMN 3–8 mm a závitové destičky 16–27ER. Rozměr dříku odvozen
  z řady ISO 5610; jakmile bude znám přesný držák z karuselu, ověřit.
- **📚 Katalog: upichovací lišta s dlouhým dosahem** (`UPICHR2525-5-T40`):
  čepel 32 / 40 / 50 / 65 mm, šířka 3–8 mm, od dříku 20×20. Standardní MGEHR
  sahá jen 16–23 mm.
- **Upichnutí: kontrola dosahu čepele.** Když je polotovar hlubší, než čepel
  nástroje sahá (dosah se čte z obrysu držáku, `cam/partOffReach.js`), CAM
  ukáže varování — v té hloubce by o polotovar zavadila celá hlava držáku.
  Dráhy se neblokují (hlášení je jen informace). Např. výchozí MGEHR 2525-5
  sahá ~20 mm.
- **📚 Katalog: navrtáváky 90° / 120°.** Nová položka ve skupině Vrtáky
  (HSS-Co ⌀3–20, krátké vyložení, bez záběru Q) pro navrtání středu před
  vrtákem. Jméno `Navrtavak 90 D10`. Jde stejnou cestou jako vrták (operace
  Vrtání, tvar ⌀).
- **📚 Katalog: hustší řada vrtáků.** HSS doplněno o ⌀9, 11, 13, 15, 19, 21
  a velké ⌀32–50 (Morse 4 a 5 pouzdro), tvrdokov o ⌀9, 11, 13, 15, 19;
  předvrtání pod M14 (⌀12) a M24 (⌀21) je označené. **Předvrtání v CAM jede
  dál po původní řadě** (`isoPreDrillDiameters`), takže se dráhy nemění.
- **📚 Katalog: těžké vyvrtávací tyče ⌀50, 63 a 80** (S50W…, S63X…, S80Y…;
  Dmin 63 / 80 / 100) pro velké díry na karuselu, všechny typy včetně
  závitového SNR. Při automatickém přidání tyče do zásobníku (Vyvrtávání)
  se u děr nad ⌀63 vybere ⌀50 místo ⌀40.
- **📚 Katalog: zapichováky 6 a 8 mm** (MGMN 600 / 800; 6 mm do dříku 25×25,
  8 mm jen 32×32) a **radiusový zápich MRMN 3–8 mm** s plným rádiusem dna.
- **Velikost plátku podle ISO katalogu.** U nože s katalogovým kódem držáku (SRSCL2525M12,
  PSKNR2525M12…) je v poli plátku (panel Parametry i Geometrie nástroje) výběr „Velikost
  podle katalogu" — RCMT 0803M0 / 1003M0 / 1204M0…, u polygonu CNMG 0903 / 1204 / 1606….
  Nastaví R (kulatá) nebo délku hrany (polygon), VBD kód a název nože a přestaví držák.
  Ručně přepsané R / hrana mimo katalog ukáže „— vlastní velikost —"
  (`cam/catalogInsertSize.js`).
- **Držák z katalogu se přizpůsobí velikosti plátku.** Po přepsání Rádiusu (R) kulaté
  destičky, nebo Délky hrany / R polygonové, se obrys držáku přestaví podle nové
  velikosti (v panelu Parametry, v Geometrii nástroje i v zápisu slotu Zásobníku).
  Jen když je obrys pořád nezměněný katalogový (kód držáku se rozpozná a obrys
  odpovídá původní velikosti); vlastní nebo ručně upravený držák se nemění
  (`cam/holderFollowsInsert.js`, `isoHolderForInsert`).
- **Polygon: držák se mění se strategií hrubování.** Přepnutí Čelně ↔ Podélně
  vymění ze 🔧 Zásobníku celý nůž (čelně PSKNR2525M12, podélně PSBNR2525M12),
  ne jen natočení plátku (`cam/strategyKnife.js`). Vlastní / jiný polygonový
  držák se nemění.
- **Tolerance: vlastní úchylky.** Přepínač „Třída a stupeň ISO / Vlastní úchylky“; ve vlastním režimu se zadá průměr (Ø) a horní/dolní úchylka v mm (např. -0,255 / -0,304) a dopočítá se Ø max, Ø min a tolerance. V liště okna je tlačítko 🔢 pro kalkulačku (kontrola výpočtu).
- **CAD editor: nápověda k zápisu.** Nad lištou s údaji k řádku se vypisuje, co které slovo na
  řádku s kurzorem dělá (G0 = startovní bod, G1 úsečka, G2/G3 oblouk, X/Z, I/K, R, G90/G91…),
  slovo pod kurzorem je první, a tip co dopsat (oblouk bez R / I K, prázdný řádek…). Stisk
  klávesy ukáže její popis na 4 s (na dotyku nejsou tooltipy). Logika: `js/calculators/cncHints.js`.

- **CAD editor: úsečka úhlem – polárně / od předchozí.** Tlačítko ∠ je v řádku s ikonami. Režim
  „Od předchozí" (odklon vlevo/vpravo od směru předchozí úsečky nebo tečny oblouku) se nabídne jen
  tam, kde předchozí pohyb má směr; po G0, na prvním řádku a při změně kontura/polotovar zůstává jen
  polární úhel. V G91 se zapisují přírůstky.

- **CAD editor: polární úsečky a spojení v průsečíku.** Řádek `G1 PU45 L1200` (úhel od +Z + délka,
  místo L jde cílové X/Z; bez G = G1) se počítá v náhledu, údajích i průsečících. Tlačítko **🔗**
  v horní liště (a položka v pravém panelu) pracuje u kurzoru: sražení/zaoblení (CHF/RND) na řádku převede na dráhu, jinak spojí dvě úsečky (kurzor na druhé, před ní G0 na její začátek): ořízne je
  v průsečíku a zapíše jednu navazující konturu (`G1 X50 Z50` / `Z200`). PU/L se před přenosem do
  výkresu přepíšou na X, Z. Úsečka úhlem nově nepíše osu, ve které se nic nemění.

- **CAD editor: tečný oblouk (T).** `G3 X10 Z20 T` = oblouk tečně navazující na předchozí úsečku
  nebo oblouk; střed a poloměr se dopočtou z koncového bodu (stejný princip jako T ve Volné
  kontuře). Nesouhlasí-li G2/G3, editor to ohlásí; po G0 hlásí chybu. Při přenosu do výkresu se T
  přepíše na X Z I K se správným G2/G3.
  Jde i **R + jedna souřadnice** (`G3 X10 R10 T`): G2/G3 určí stranu, R poloměr a druhá souřadnice
  konce se dopočte (první průsečnice po směru oblouku). Opraveno: při opačném G2/G3 u T se výseč
  počítala z G-kódu místo z tečnosti. Klávesa T je v prvním řádku kláves, kopírování celého kódu
  (📋 vše) je v liště údajů.

- **CAD editor: výrazy a R-parametry v kódu.** `X=10+5`, `Z[2*5]`, `X=SIN(30)*40`, `R1=20` / `X=R1*2`
  se vyhodnotí (dřív `X10+5` dalo tiše 10 a `X=R1*2` dalo 0 – náhled i výkres ukazovaly jiný tvar,
  než jaký stroj vyjede). Špatný výraz se ohlásí v údajích o řádku; při přenosu do výkresu se
  výrazy přepíšou na čísla. Převod G90↔G91 už výraz nerozbije. Logika: `js/calculators/cncExpr.js`.
- **CAD editor: spojení v průsečíku i s obloukem / kružnicí** (⌒∩): úsečka × oblouk, oblouk × oblouk,
  plná kružnice (G2/G3 se stejným začátkem a koncem + I, K). Platí první průsečík po první úsečce.
  Nová sražení: **⌐ Sražení úhel × délka** (3×30°; délka po 1. nebo 2. úsečce rohu, jen G90).
  Logika přesunuta do `js/calculators/cncJoin.js`.

- **Editor z plátna: označený bod → kurzor na správném řádku.** Když je na plátně označený roh nebo
  průsečík (ne úsečka), editor se otevře s kurzorem a zvýrazněním na úsečce, která v tom bodě v pořadí
  dráhy KONČÍ – tedy na první úsečce rohu, kam patří sražení úhel × délka a spojení v průsečíku.
  Kurzor stojí na konci řádku (ne označený celý řádek), takže klávesa Sraž. / Zaobl. připíše `CHF=` /
  `RND=` za kód řádku místo přepsání řádku. Po přenosu na plátno se označený bod zruší.

### Fixed
- **CAM čelně: zbytečné zdvihy rychloposuvem a dojezd do neobrobené mezery.** Tři nálezy na dílu
  s přírubou a krčkem (kulatá R10, `part-23-face-neck-round-r10`): (1) přejezd v Z se ověřoval
  ve výšce `xStart` místo skutečné výšky nástroje, hlásil neexistující blokádu a zvedl na
  `G0 X75.545 ; Výjezd nad konturu` (5×); (2) okno nosu za koncem polotovaru bralo jmenovitý Ø
  polotovaru jako stěnu, takže poslední průchody u čela (`G0 X66.422`) vyjížděly nad průměr a jely
  posuvem vzduchem — nově tam materiál není; (3) dojezd „bez schodků“ průchodu před krčkem jel
  do mezery po průchodech, které hlídání plátku vyhodilo (zajel 7,8 mm do plného materiálu
  a „dobíral schodek, který tam není“) — dojezd se teď maže (`ops/face/leadOutOverGap.js`).
  Změnily se i 3 starší fixtures (zmizel zdvih), snapshoty aktualizovány.
  Test: `tests/cam-face-neck-travel.test.js`.
- **CAM: řetěz zanoření od hranice rozsahu drží mřížku hloubek.** Kotva rampy leží spodkem nosu na
  offsetové čáře, mřížka polygonu ve středu nosu — kontrola „jedna vrstva" porovnávala středy a vrstvu
  zahodila; další pak brala ap + rádius (part-11 zleva u čelistí: 5,8 mm při ap 5). Navíc vrstvu, kterou
  vyjel jiný vjezd, vydal uzavírací krok podruhé (40 mm posuvem vzduchem) a vrstvy pod ní vypadly.
  Test: `tests/cam-range-entry-chain.test.js`.
- **CAM: čelisti, koník a meze rozsahu platí pro OBRYS PLÁTKU (pravidlo 16), u všech plátků.**
  Dřív se hlídal jen programovaný bod (střed nosu): kulatá R 10 s čelistmi na Z10 řezala až do
  Z1,35, polygon L15 natočený 15° by zleva sahal tělem 13,9 mm do čelistí a polygon jel o rádius
  nosu pod X min / nad X max. Teď se střed drží o přesah obrysu destičky (`insertExtent`) před
  čelistmi, koníkem, X min, stěnou pod X max a ručním koncem rozsahu Z; podélné hrubování plánuje
  vrstvy rovnou v povoleném pásu (dřív je ořez zahazoval až potom a další vrstva brala víc než ap).
  Kde mez nedovolí tenkou první vrstvu (koník těsně za čelem), program to nahlásí. Na hranici
  úseků zůstávají pravidla 11/14/15. Testy: `cam-xrange-round-nose`, `cam-chuck-traced-leads`,
  `cam-face-first-layer-nose`.
- **CAM: rozsah X (📐) s kulatou destičkou platí pro břit, ne pro střed nosu.** Meze X min / X max
  a stěna pod X max (pravidlo 12) se porovnávaly s programovaným bodem, kulatá ale řeže o R níž
  a dál: R 10 s X min 15 hrubovala i dokončovala až na X 4–5 a s X max 22 sáhla do stěny nad
  stropem (X 24,9). Teď čelní i podélné hrubování, dojezd „bez schodků", dokončování i jeho
  „Rovný průměr" drží břit v mezích. Jen kulatá (`noseLiftX`); ostatní plátky beze změny.
  Test: `tests/cam-xrange-round-nose.test.js`.
- **CAM: čelisti/koník ořezávají i nájezd a dojezd po kontuře.** Ořez zkracoval jen tělo podélného
  průchodu: dojezd „bez schodků" projel čelistmi (čelisti Z10: `G1 Z-4.955`) a průchod celý za
  čelistmi se „zkrátil" naruby a jeho nájezd po kontuře jel za ně. Dojezd se teď utne na mezi,
  průchod za mezí nebo s nájezdem mimo pás se vynechá. Test: `tests/cam-chuck-traced-leads.test.js`.
- **CAM: čelní hrubování kulatou destičkou — první vrstva už nebere víc než ap.** Mřížka vrstev
  byla mřížkou středů nosu, ale kulatá řeže o rádius před středem, takže první vrstva u čela
  vzala ap + R (R 10 / ap 4: `N160 G1 X13.101` = 9,3 mm v ose Z; part-18 R 8 / ap 3: 9,0 mm).
  První vrstvy se teď dělí od místa, kde se čela dotkne břit; se zapnutým koníkem sedne první
  vrstva přímo na něj. Dojezd „bez schodků" končí na předchozí vrstvě a dojezd, který nic
  neubere, se nevydá (part-18: posuv vzduchem 3 → 0). Jen kulatá (klíč `faceLayerNoseLead`);
  polygon, upichovák i podélné hrubování beze změny. Test: `tests/cam-face-first-layer-nose.test.js`.
- **CAM: hrubování už nezajede do dílu za malým vnitřním rádiusem.** Když je vnitřní zaoblení
  kontury menší než rádius destičky (např. R 5 s kulatou R 10) a za ním následuje krátká stěna
  a vypuklý oblouk, ořez offsetu nechal stěnu v dráze pozpátku (smyčka pod konturou). Čelní
  dojezd „bez schodků" po ní sjel o 2,8 mm do hotového dílu (`G2 X15.000 Z30.200`, červená
  oblast v simulátoru). Kontrola obráceného úseku v `trimAndRemoveLoops` teď počítá
  i s navazujícím obloukem, ne jen s úsečkou. Test: `tests/cam-offset-swallowed-wall.test.js`.
- **Přepsání výkresu z editoru už nemaže, co G-kód nenese.** „Přepsat výkres podle zapsaného kódu" /
  „Vykreslit v CAD" dřív smazalo pomocné čáry, texty, výplně a body a zahodilo barvu, typ čáry
  a vazbu (vodorovná/svislá) všech úseček. Teď se zachovají pomocné čáry, texty, výplně a body;
  úsečky a oblouky se shodnou geometrií si nechají barvu, typ čáry a vazbu a kóty se přepojí na
  jejich nové objekty. Změněné prvky (např. sražená hrana) mají nový vzhled i bez kót.
- **Převod sražení/zaoblení (CHF/RND) nereagoval u kódu z plátna.** Kompaktní export píše řádky
  bez G (`X185.785 Z25.65` platí v G1) a převodník je nepovažoval za pohyb, takže roh „neměl
  následující úsečku" a tlačítko mlčelo. Řádek bez G se teď řídí posledním G0–G3. Za vloženým
  obloukem dostane další řádek bez G výslovné `G1` (jinak by převzal G2/G3), komentář za
  přepsaným řádkem má zase mezeru před `;`. Stejná oprava v CAM editoru.
- **Vyrovnaná úsečka se při výběru nezvýraznila.** Barevný tón vazby (vodorovná/svislá/rovnoběžná)
  se kreslil přes výběr a přebil jeho barvu; vybraný objekt/segment se teď netónuje.
- **CAD → CAM: oblouky při zrcadlení os a na karuselu.** S „⇅ X+ dolů" nebo „⇄ Z+ vlevo"
  (jen jedno z nich) a na karuselu přišly oblouky do CAM obráceně — zaoblení R5 se z vypouklého
  stalo vydutým. Přenos do CAM teď posílá čistou geometrii (prohození G2/G3 si CAM dělá sám
  ve výstupu); totéž platí pro „→ CAM" z Trasování profilu.
- **CAM → CAD („📐 Kreslit") na karuselu:** oblouk se kreslil jako doplněk (270° místo 90°)
  a osy výkresu se řídily přepínačem Karusel v CAM místo typu stroje v CAD (při rozdílném
  nastavení se výkres vrátil přetočený). Polotovar čtený přímo z plátna bral každý oblouk
  jako proti směru hodin.
- **Zrcadlení os v CAD:** „Vykreslit" z panelu CNC KÓD, CNC Editor (náhled i kreslení)
  a G-kód z Číselného zadání vracely se zrcadlením oblouky na plátno zrcadlově. CNC Editor
  při převodu rohu na zaoblení psal na karuselu G2/G3 obráceně.
- **Otevření CAM s čarami „mimo profil":** když se na CAM klepne do 300 ms po úpravě
  výkresu (nebo po „Smazat kopii" v nabídce zdvojených čar), odložené obnovení panelu
  CNC KÓD smazalo fialové zvýraznění a dotaz odkazoval na něco, co není vidět. Čekající
  obnovení se teď provede před přenosem (bez vlastní nabídky přes otevíraný CAM).
- **Mobil:** zoom v % v řádku souřadnic zůstával starý po ⊙ vycentrování i po přiblížení
  z dialogů (teď se obnoví při každé změně zoomu).
- **Vyrovnání (vodorovně/svisle/rovnoběžně):** když posun konce porušil vazbu navazující úsečky nebo segmentu polylinie, její zastaralá vazba se zruší (dřív zůstala značka vazby u neplatné geometrie).

### Changed
- **Vazby (vodorovně/svisle/rovnoběžně):** místo ikony u úsečky se vazba ukazuje jemným
  barevným přetónováním úsečky (zelená / fialová / žlutá); ikona zůstane jen u vybrané vazby.
- **Kalkulačka Tolerance:** v tabulce ISO 2768-1 je sloupec **m** zvýrazněn rámečkem;
  řádek `Díra | rozměr | Hřídel` místo malého pole; výsledek přeuspořádán (druh + Ø rozměr
  a třída, vlevo úchylky, vpravo Ø max/min, dole tolerance). Sekce „Uložení" odstraněna.
  Hodnoty ISO 286 a 2768-1 zkontrolovány proti tabulkám (beze změn).
- **Kalkulačka Vrták:** „Základní vrtáky" nahoře ve sbalitelné liště; v sekci záběru
  přibyl řádek „Zvětšení Ø na každých 0,1 mm hloubky" (0,2·tan(σ/2)).

### Fixed
- **Vyvrtávání zleva: Bezpečná poloha ve skutečném Z.** Dřív se číslo Bp bralo v zrcadlovém
  rámci (Bp Z−155 zleva dalo tyči bezpečné Z na opačné straně). Teď: Bp před čelem se zachová,
  Bp za dílem se nahradí bezpečným Z před čelem díry.
- **Fáze dna díry:** nevydá se, když je těleso tyče blíž ke špičce než nejtenčí vrstva (druhá
  polovina díry za osou se v zrcadle nemodeluje); hotová dráha dna se navíc ověří (kolize držáku
  s materiálem, zajetí do kontury) a při nálezu se nevydá, ale nahlásí se.
- **Vnitřní nůž má příznak `toolInternal`** (katalog → zásobník → parametry): náhledy tyče ostřím
  nahoru už nestojí jen na tvaru držáku (starý slot bez příznaku se dál pozná podle tvaru).
- **Vyrovnání (vodorovně/svisle/rovnoběžně) trhalo konturu:** posunutý konec úsečky nechal sousední
  úsečky/polyline na místě → mezera. Navazující konce se teď posunou s ním (oblouky, polotovar a kóty ne).
- **Přenos do CAM: kus za mezerou se tiše stal „dírou":** leží-li oddělený řetěz těsně (do 1 mm) u konce
  profilu, program na to před otevřením CAM upozorní (lze se vrátit a mezeru spojit).
- **Přenos CAD → CAM bral jen označené úsečky:** po „vyrovnat kolmě" zůstala úsečka označená
  a do CAM přišla jen ona. Přenos do CAM teď vždy bere celý profil (označení se ignoruje).
- **Úběr materiálu u vyvrtávání/vrtání s odlitkem nakresleným jen čárou:** polotovar bez plochy
  dal degenerovanou smyčku a celý obrobek byl černý bez výplně i úběru. Základem je
  teď polotovar ∪ nakreslený díl ∪ DÍRA (`boreHoleLoop`): hotový kalíšek díru jako
  materiál nemá, ale obrábí se z plného — bez ní byla oblast díry černá hned od začátku
  (`boreRemovalView`, vrták `bodyStockSegments`).
- **Vyvrtávání s Bezpečnou polohou za dílem (Bp Z5):** program jel `G0 X9 Z5` a pak
  osou skrz plné dno dílu (uživatel 9. 10. 2026, projekt (2)). Vnitřní svět má
  vlastní bezpečné Z PŘED čelem díry, první příjezd je nejdřív v Z po vnější Bp,
  pak radiálně; čelní fáze dna už nedokončuje stěnu znovu.
- **Kolize tyče s dílem se u vyvrtávání nezobrazovala:** zrcadlová simulace zná jen
  díru, ne plné dno ani okolí. Nově se dráha tyče zametá i ve skutečném světě
  proti hotovému dílu (`cam/boreRealCollision.js`) → ⛔ v panelu a červeně na plátně.
- **Simulace vyvrtávání se plazila (64× vypadalo jako 1×):** parser G-kódu četl
  „S16" z názvu nástroje `T="S16Q-SCLCR09"` jako řeznou rychlost 16 → posuv
  ~5 mm/min místo ~60. Text v uvozovkách se už nečte jako adresy.
- **Vyvrtávací tyč v náhledech ostřím nahoru:** miniatura v 🔧 Zásobníku, v 📚 ISO
  katalogu a okno 👁 Ukázat kreslily tyč jako vnější nůž (ostří dolů), kdežto
  simulace ji kreslí správně (ostří nahoru, k stěně díry, tělo k ose). Tyč se
  pozná podle tvaru držáku (dřík podél osy: `isBoringBarLike`, knifeThumb.js).

### Added
- **Vrtání: „Dno Z"** (uživatel 10. 10. 2026) — místo hloubky jde zadat Z, do
  kterého se vrtá (`drillZEnd`, přednost před Hloubkou). **Čárkovaný obrys vrtané
  díry** (válec + špička) ve výkrese a **úběr materiálu při vrtání** i u odlitku
  nakresleného čárou: materiál = díl ∪ dutina z výkresu, vrták ubírá válec,
  zbytek zůstává šedý. `drillHoleLoop` (ops/drill.js), `drillMaterialSegments`.
- **Kontrola počátečního bodu:** když nástroj v Bezpečné poloze (první bod dráhy)
  leží v materiálu — v polotovaru NEBO v nakresleném dílu — vyskočí okno
  „⛔ Nástroj je v materiálu" s tlačítkem **⚙ Nastavit počáteční bod** (otevře
  Bezpečnou polohu a zaostří X) a stejné hlášení je v panelu ⚠. Okno jen při
  přechodu „mimo → v materiálu". Uživatel 9. 10. 2026 (vrták Bp X150 u dílu
  ⌀290). `js/calculators/cam/startCheck.js`, `tests/cam-start-check.test.js`;
  na 46 fixtures žádný falešný poplach.
- **Vyvrtávání — dno díry čelně** (`js/calculators/cam/ops/boreFloor.js`,
  vlastní soubor, uživatel 9. 10. 2026: „nechci aby se to jakkoliv ovlivňovalo
  s jinými plátky a jinými drahami"). Po podélném vyvrtání z plného zbývá
  prstenec dna a kužel po špičce vrtáku; třetí fáze téhož programu je dobere
  ČELNĚ od osy ven, týmž nožem. Spouští se jen z vyvrtávání z plného s kuželem
  špičky a jen s vyvrtávací tyčí — vnější obrábění, vrtání, závity a ruční
  předvrtání tudy neprojdou (otisk 29 fixtures shodný). Vrstvy tenké nejvýš
  na mezeru mezi špičkou a tělesem tyče (u BCL S16 1,1 mm), mřížka dosedne
  přesně na dno (dno + přídavek Z + rε). Simulace má pro fázi vlastní
  zrcadlový svět (úběr, ⛔, držák, zajetí).
- **Vrtání: odlitek nakreslený jen čárou** — záběry Q se měří od čáry (čelo
  odlitku v ose), ne od čela dílu; první záběr už nejede celý odlitek najednou.
- **Vyvrtávání z plného: vrták → vyvrtávací tyč v jednom programu**
  (uživatel 9. 10. 2026: „u vyvrtávání ať je možnost nastavit i vrták a pak
  ten vyvrtávací nůž, ať je to automatizované"). Záložka Vyvrt. →
  ☑ **Předvrtat vrtákem (z plného)** — zapne se samo, když je díra
  v polotovaru plná. Vrták i tyč se vyberou samy (zásobník, jinak se přidají
  z 📚 katalogu), program = vrtání + výměna nástroje + vyvrtávání (slučuje se
  jako části „➕ Operace"). Špička vrtáku skončí na dně díry + Přídavek Z
  (rozhodnutí uživatele) — tyč pak vezme stěnu do hloubky plného ⌀, dno díry
  (prstenec + kužel po špičce) se nahlásí a dobere ho až „dno díry čelně".
  Simulace: během vrtání vrták ve skutečném světě (úběr, ⛔), pak tyč
  v zrcadle. `js/calculators/cam/ops/borePreDrill.js`,
  `tests/cam-bore-predrill.test.js`; otisk 29 fixtures shodný.
- **Vyvrtávání zleva** (od levého čela k +Z, druhé upnutí). K zrcadlu v X
  se přidá zrcadlo v Z — program zleva je přesné zrcadlo programu zprava
  (X stejné, Z opačně, oblouky G2↔G3; hlídá `tests/cam-bore-left.test.js`).
  Díra z výkresu se pozná i u levého čela (napojená i samostatný řetěz).
- **Vyvrtávání — dokončení stěny díry** (☑ Dokončit stěnu díry v záložce
  Vyvrt., výchozí vypnuto). Vnější dokončovací průchod v zrcadle, vždy týmž
  nástrojem (finishingSlot se do díry nepoužije). Končí na dně díry, kde se
  nos dotkne předvrtání (pomocné X max v zrcadle — hrubování se tím nemění,
  změřeno); výjezdy v díře nejdál na vnitřní bezpečný poloměr. Známé: nájezd
  rampou před čelem vzduchem (úhel zanoření plátku) a v rohu u schodu tříska
  ze schodiště po hrubování — dědí se z vnějšího dokončení.
- **Vyvrtávání — tvar díry z výkresu** (✏ Z výkresu v záložce Vyvrt.,
  uživatel 8. 10. 2026: „řetěz z CAD, kde by byla nakreslena"). Díra jde
  nakreslit samostatně (řetěz jedním koncem na čele, celý uvnitř dílu —
  přenos ho pošle v sekci DIRA, už ho nehlásí jako „mimo profil") nebo
  napojenou na čelo (uzavřený řez). Schody, sražení i rádiusy díry jdou do
  zrcadla jako kontura (oblouky G2↔G3); body uvnitř předvrtání se nevrtají.
  `js/calculators/cam/boreContour.js`.
- **CAM: operace Vyvrtávání** (záložka **Vyvrt.**, uživatel 7. 10. 2026).
  Nové **pravidlo 13** (docs/cam-pravidla.md, schválené): vnitřní obrábění je
  zrcadlo vnějšího v ose X — díra se překlopí na hřídel, předvrtání na
  válec, spočítá se TÝŽ vnější hrubovací výpočet (pravidla 1–12) a řádky se
  překlopí zpátky (`cam/ops/bore.js`). První verze: podélné hrubování
  válcové díry ⌀ × délka od Z čela, zprava, z předvrtání (převezme se
  z Vrtání: ⌀ vrtáku, hloubka na plný ⌀) — zapnutí vybere nejtlustší
  vyvrtávací tyč z 📚 katalogu, která se vejde do předvrtání. Tyč, která by
  zadní stranou sáhla na protější stěnu, nejede a nahlásí se. Simulace
  (úběr, ⛔ kolize, zajetí do kontury) počítá ve stejném zrcadle, nůž se
  kreslí k ose, obrys díry a předvrtání čárkovaně. Otisk 29 fixtures shodný.
- **📚 Katalog — vnitřní nože do díry** (uživatel 7. 10. 2026: „přidal jsem
  vrták, takže dokážu vyvrtat díru — přidej i vnitřní nože"). Nová skupina
  **Vnitřní (do díry)**: ocelové vyvrtávací tyče ⌀10–40 (S10K … S40V,
  f a Dmin podle typických katalogů) s destičkami C 95° (PCLNR/SCLCR),
  T 91° (STFCR), D 93° (PDUNR/SDUCR), D 107,5° (PDQNR/SDQCR), V 93°
  (SVUBR) a vnitřní závitový nůž SNR s destičkou 11–27IR (stejná řada jako
  ER: 60°/55°, Tr, Acme). Na kartě se volí tyč (s nejmenší dírou Dmin),
  čip ukazuje Dmin a vyložení 4×⌀. Negativní destička až od ⌀20, destička
  nesmí vyčnívat nad tyč. `js/calculators/isoInternalTools.js`, rozměry
  ORIENTAČNÍ. CAM zatím soustruží jen vnější obrys — vnitřní nože jdou do
  zásobníku a na vnitřní závit; operace Vyvrtávání přijde zvlášť.
- **Automatický výběr závitového nože rozlišuje vnější / vnitřní:** vnější
  závit bere destičku ER, vnitřní IR, a tyč ze zásobníku se musí vejít do
  předvrtané díry ⌀(D − 2H). Rada nabídne jen tyče, které do díry vlezou
  („přidej 11IR A60 (tyč ⌀10)"), nebo řekne, že nejmenší tyč potřebuje
  větší díru. Přepnutí Vnější / Vnitřní při aktivním závitu nůž vymění
  (jeden krok ↩).
- **CAM: vrták jako nástroj a operace Vrtání** (uživatel 7. 10. 2026:
  „přidat do CAM i vrták mezi plátky a možnost pro vrtání"). Nový tvar
  nástroje **⌀ vrták** vedle ⬤ ◼ ▮ ▽ (⌀, vrcholový úhel σ, vyložení; držák =
  pouzdro v ose za vyložením) s vlastními pravidly `cam/inserts/drill.js`.
  Nová záložka **Vrtání**: cyklus v ose X0 s vyjížděním (G83) nebo lámáním
  třísky (G73), záběr Q, odskok, prodleva v dialektu systému, hloubka na
  špičku / na plný ⌀, G97 z Vc a ⌀ — rozepsaně G0/G1 (`cam/ops/drill.js`).
  R rovina nikdy neleží v pásu vůle před polotovarem. Zapnutí vybere vrták
  ze zásobníku a vypne závit/upich. Simulace odebírá přesným obrysem vrtáku
  a hlídá pouzdro (krátké vyložení = ⛔ + ⚠). Výchozí zásobník má nově
  **T7 Vrtak HSS D20** (revize 3 — do uloženého zásobníku se přidá jednou).
  Po přepnutí tvaru z vrtáku zpět na plátek se vrací ap a dřík nože (ap
  vrtáku = doporučený záběr Q, do hrubování nepatří).
  Ostatní plátky mají nové klíče vypnuté — otisk 29 fixtures shodný.
- **📚 Katalog — skupina Vrtáky** (uživatel 7. 10. 2026: „ať ho můžu vybrat,
  kdybych ho chtěl ze zásobníku smazat"). HSS-Co 118° (DIN 338 / 345,
  ⌀3–30) a tvrdokov 140° 5×D (⌀3–20), včetně předvrtání pod závity;
  vyložení podle délky šroubovice, upínač ER16/25/32 nebo redukce MK2/MK3.
  ✅ Použít / 🔧 Do zásobníku / 🧰 Uložit jako u nožů. Výchozí vrták
  zásobníku je týž záznam (`js/calculators/isoDrills.js`).
- **📚 Katalog — závitové destičky 11/16/22/27ER, Tr a Acme** (uživatel
  7. 10. 2026). Dřív jen 16ER AG60/AG55 (P 0,5–3): Tr a Acme závit
  automatický výběr nože hlásil „přidej nůž 30° z katalogu" — a katalog
  ho neměl; M36 a hrubší (P 4–6) neměly destičku vůbec. Teď částečný
  profil 60°/55° v řadách A (11ER, P 0,5–1,5), AG (16ER, P 0,5–3),
  N (22ER, P 3,5–5), Q (27ER, P 5,5–6 · 4,5–4 z/″) a plný profil Tr 30°
  (P 1,5–6) a Acme 29° (16–4 z/″) — destička na jedno stoupání, špička
  = dno závitu. Destička jen do dříku aspoň tak širokého, jako je její
  hrana (27ER jen 32×32). Celá destička se kreslí ve své velikosti
  (`threadingInsertEdgeMM` podle kódu, dřív vždy 16 mm). Tabulka
  v `js/calculators/isoThreadInserts.js`, rozměry ORIENTAČNÍ.
- **Automatický výběr závitového nože hlídá stoupání:** destička z katalogu
  se vezme jen na stoupání ze svého rozsahu (plný profil Tr/Acme jen na
  své), hláška poradí konkrétní destičku („přidej 22ER 4.0TR … (dřík 25×25,
  32×32)") nebo řekne, že ji katalog nemá. Nůž mimo katalog (vlastní ▽) se
  bere jako dřív jen podle úhlu. Destička z katalogu se při výběru jiného
  závitu už nepřetvoří na jiný úhel (AG60 se Tr destičkou nestane).

### Changed
- **Hrubovací nůž zásobníku = PSBNR 2525M12 + SNMG 120408 podle ISO**
  (uživatel 6. 10. 2026: „čtverec natočený na hrubování 15°" — jeho ručně
  kreslený „Šlicht" byl jen od oka). T2 výchozí sady místo PCLNR, táž
  geometrie jako původní „Hrubovaci". Uložený zásobník ho dostane JEDNOU
  na konec (`magazineDefaultsRev` ve stavu CAM); smazaný se nevrací.
- **📚 Katalog — obrys držáku verze 3:** spodek hlavy za vedlejší hranou
  stoupá o 20° víc než hrana (dřív 3°; neutrální beze změny) a f1 se měří
  ke špičce, styl B má f1 13/17/22/27 (Sandvik DSBNR 2525M12 = 22, ostatní
  2525 = 32 — DCLNR, DSKNR, PSSNR, PTGNR, PTFNR). Na dílu uživatele
  (`projekt_2026-10-06 (1)`): PSBNR 0 kolizí a zbytek 1714 mm² (jeho
  nakreslený nůž 1861 mm² a 5 kolizí; v2 katalogu 4 kolize), PSSNR 3 → 0,
  PWLNR 17 → 4, PCLNR 18 → 9. Staré obrysy (v1, v2) se převedou samy.
  SW v400.

### Fixed
- **Dokončování polygonem: nájezdová rampa vzduchem** (pravidlo 5). Rampa
  začínala 2 mm nad cílem — při úhlu zanoření 5° to bylo 22,9 mm posuvu
  skoro celé vzduchem (nájezd na střed čela, návrat za nedosažitelný
  zápich), při 15° 7,7 mm. Teď rampa začne v prvním bodě téže přímky,
  kde má nos pod sebou celou Vůli X a vedle sebe Vůli Z, a k němu se jede
  rychloposuvem (nájezd na čelo 22,9 → 1,5 mm, za zápich 22,9 → 15 mm —
  tam jede nos nad zbytkem jen 0,2–0,3 mm, tedy v pásu Vůle). Žádný svislý
  posuv navíc (svislý dosed = ryska); rampa aspoň průměr nosu. Klíč plátku
  `finishRampFromContact`. Změnilo se 12 polygonových fixtures s
  dokončením — jen body, odkud rampa začíná (kontrola pravidel: posuv
  vzduchem −7 případů, nic nového), `tests/cam-finish-ramp-short.test.js`.
- **Hrubování polygonem: poslední vrstva na plošinách vedle zápichu**, kam
  destička nedosáhne (pravidlo 3, „bez schodků"). Na plošinách zůstávala
  celá poslední vrstva (0,3 mm nad přídavkem):
  - vně (hřídel ⌀30, zápich ⌀24 × 6): rampa dojezdu přejela zápich, dosedla
    na jeho protější stěnu a skončila — teď dojezd pokračuje po obrysu za
    stěnou (klíč plátku `leadOutPastRampWall`);
  - v díře (vyvrtávání ⌀30 s vybráním ⌀36): bisekce poslední vrstvy se
    ptala na volno tolerantněji než sken intervalů a vybrala vrstvu jen ve
    vybrání; teď vede přes obě plošiny (`realStockLayers`) a nad vybráním
    sjede po dosažitelném dně místo rovně přes něj
    (`closingLayerTracesFloor`).
  Kulatá ani ostatní plátky se nemění. Otisk 29 fixtures shodný,
  `tests/cam-floor-past-groove.test.js`.
- **Vnější hrubování: díra napojená na čelo** (uzavřený řez dno → stěna díry
  → čelo → vnější obrys) se brala jako vzduch nad dílem — vrstvy jely skrz
  stěnu dílu až k ose. Pipeline ji teď z vnější kontury vyjme (obrobí ji
  Vyvrtávání). Otisk 29 fixtures shodný.
- **Vyvrtávání „↺ z Vrtání": Z čela jako u vrtání.** Prázdné Z čelo vrtání
  (= čelo dílu) se přebíralo jako Z0 — u dílu nakresleného od Z0 doprava
  (čelo Z346) by vyvrtávání začalo na levém konci. Teď se bere týž výpočet
  jako ve Vrtání (`drillGeom` + `drillAutoFaceZ`).
- **CAM dokončování: dno u čela, Rovný průměr hlídá držák, odskok upichováku
  bez řezu bokem** (díl uživatele `projekt_2026-10-08 (2)`).
  - Hlídání držáku testovalo offset úseku ještě před oříznutím ve vnitřním
    rohu — v přesahu (o rádius za koncem dráhy, kam nástroj nikdy nejede) se
    držák otřel o šikmé čelo a „celý, nebo vůbec" vyřadilo celé dno X 8,743
    mezi body 11 a 12. Přesah, kde by špička byla v kontuře, se nepočítá: dno
    se dokončí až do rohu a dráha jede rovnou nahoru po čele (zmizel sjezd
    podél čela `N9660 G1 X9.661`).
  - **Rovný průměr** na konci i začátku řetězu hlídá držák (hotový díl
    i nevyhrubovaný zbytek) — dřív jel 15 mm po válci, kam se držák nevejde.
  - Šikmý odskok čelního průchodu upichovákem hlídá i rovné dno plátku pod
    MĚLČÍM sousedním průchodem — tělo jinak bokem ujedlo klín až 0,76 mm²
    (`N4390 G1 X16.361 Z196.932`); tam se teď odjede svisle.
  Otisk: hnulo se 5 fixtures s upichovákem, kolize 0. SW v412.
- **CAM upichovák čelně: přejezdy, dokončování a schod u čela** (díl
  uživatele 8. 10. 2026, MGEHR2525-5). Dokončování po obálce plátku spojovalo
  místa, kam se nevejde držák, rovnou čarou posuvem (`N9550 G1 X7.675
  Z166.145` přes údolí, `N9590 G1 X12.077 Z138.970` šikmo přes roh) — teď tam
  dráha skončí, odjede rychloposuvem a najede znovu; u stěny Z 138 kopíruje
  konturu. Tatáž spojka strašila jako překážka a přejezdy čelních průchodů
  v údolí vyskakovaly na `G0 X69.277 ; Výjezd nad konturu` — teď jen nad
  polotovar. Za čelem dílu jel dojezd „bez schodků" ode dna šikmo k čelu
  (`N9300 G1 X31.866 Z-4.468`, pravý roh 0,17 mm v přídavku): průchod teď
  odjede svisle a schod vezme svislý zápich hned vedle. Jen klíče upichováku
  (`finishAlongEnvelope`, `cutsFullWidth`); otisk: hnulo se 5 fixtures
  s upichovákem, kolize 0. SW v411.
- **CAM kulatá: konec řetězu zanoření odjíždí rovnou kolmo nahoru.** Průchod,
  který končí rampou (tělo za ní nic neubralo), odskakoval šikmo zpátky po
  téže rampě (`N3290 G1 X31.666 Z-13.749` za čelem dílu, uživatel 8. 10.
  2026). Když kolmý zdvih nosu ze skutečného polotovaru nic neubere, jede
  se `Výjezd v X` a rychloposuv. Otisk: jen `part-22-round-r10` (tentýž
  konec řetězu za čelem), porušení stejná.
- **CAM: pravidlo 15 — dokončování nesjíždí strměji než úhel zanoření.**
  Úsek dokončovací dráhy se rozdělí tam, kde ve směru jízdy začne klesat
  k ose strměji než „Úhel zanoření" (`ops/finishSteep.js`); kus před tím se
  dokončí celý, dál jede rovný průměr a odjezd vzduchem. Strmý kus se
  nedokončuje, nahlásí se a v náhledu se nekreslí tečkovaně. Díl uživatele
  `projekt_2026-10-07 (3)`, úsek 2 (kulatá R 10, 45°): oblouk `N2360 G3
  X36.836 Z106.625` končí na X 44,136 Z 111,198 a místo „Výjezd materiálem
  posuvem" na X150 se odjíždí rychloposuvem. Otisk 29 fixtures shodný; u 13
  se jen přejmenovala hláška (strmé úseky, které vynechávalo už hlídání
  destičky, se hlásí podle pravidla 15). Test `cam-finish-plunge-limit`.
- **CAM kulatá: pravidlo 14 — řetěz zanoření bez odjezdu.** Tělo vrstvy za
  rampou, které ze skutečného polotovaru nic neubere, odpadne v jakékoli
  délce (dřív jen pod 2 mm a proti plánovacímu obrysu s vůlí); další rampa
  pak navazuje bez odskoku. Úsek 3 téhož dílu: místo `G0 Z-18.996`, odskoku
  a návratu na konec rampy jeden souvislý sjezd. Otisk: hnul se jen
  `part-22-round-r10` (zmizely tytéž odjezdy, úběr shodný, posuv vzduchem
  283,9 → 270,2 mm). Test `cam-plunge-chain-continuous`.
- **CAM kulatá: řetěz zanoření pokračuje i do dalšího úseku** (pravidlo 14,
  uživatel 7. 10. 2026: „pokud bude dobírat v úseku zbytek, může zajet
  i do dalšího úseku"). Z konce posledního průchodu u hranice sjíždí po
  téže přímce o ap níž — jen přes hranici úseku, ne přes ruční konec
  rozsahu 📐 — dokud krok něco ubere, nevezme víc než ap (za hranicí stojí
  neobrobený materiál dalšího úseku), nenarazí na dno ani na držák; pak
  odjede kolmo v X (`retractRadial` — šikmý odskok zpět zavadil o zbytek
  a výjezd jel celý posuvem). Emise i plánovací podlaha zapisují rampy
  těchto kroků (`chainBeyond`) do modelu zbytku. Díl uživatele
  `projekt_2026-10-07 (3)` s nožem SRSCR2525M20: úsek 1 sjede za hranici
  Z 195,28 o dva kroky a blok vlevo od stěny u bodu 7 ubere po obalovou
  čáru 45° (r 29,2 → 26,1 v Z 196,4; úsek 1 +7,3 mm²); co leží pod mezní
  čarou bodu 5, zůstává (pravidlo 6). Úsek 2 stejně pokračuje do úseku 3.
  Otisk: jen `part-22-round-r10` (u obou vnitřních hranic úseků dvě rampy
  navíc, úběr +8,7 mm², porušení stejná). Nové `cutStats` (plocha
  i největší tloušťka třísky) v `ops/long/alreadyCut.js`.
- **Tlačítka tvaru destičky nasadí výchozí nůž i s držákem** (uživatel
  7. 10. 2026: „přednastav kulatý SRSCR2525M20, polygon PSBNR2525M12,
  upichovák MGEHR2525-5, závit SER2525M16 a na vrtání Vrtak D20"). ● ■ ▮ ▽ ⌀
  v panelu i ve slotu 🔧 Zásobníku berou nůž ze zásobníku (jako ✅ Použít);
  chybí-li tam, přidá se tam z 📚 katalogu (`presetKnifeForShape`
  v `magazineDefaults.js`). Tlačítko v panelu si u každého tvaru pamatuje
  naposled nastavený nůž i s držákem (`S.shapeKnives`, ukládá se se stavem;
  „ať si to pamatuje, co tam nastavím") — nůž bez obrysu držáku ne. Oprava
  chyby z úpravy vrtáku: po přepnutí vrták → kulatá zůstalo vyložení vrtáku
  145 mm (náhradní držák kulaté sedí tak vysoko nad destičkou → nehlídal
  se), úhel 118° a pouzdro 40 × 80 bez obrysu — na dílu uživatele pak
  dokončování „vyjíždělo materiálem posuvem". Test `shape-preset-knife`.
- **CAM podélně (polygon): vrstvy a dojezdy ve vůli kolem polotovaru**
  (pravidlo 9 — materiál je nakreslený polotovar, ne plánovací obrys s vůlí).
  Nález 7. 10. 2026 na jednoduchém hřídeli r 5 × 60 s osazením r 10 = r
  polotovaru (CL rε 0,4, Vůle 1): pásmo vůle před čelem (Z 0…1) je širší
  než odsazení čela (Přídavek Z + rε), takže vrstvy X 3,5 / 2 / 0,5 / 0
  jely celé ve vzduchu před čelem a dojezd první vrstvy jel posuvem po
  vršku osazení až za konec polotovaru (`G1 Z-62.712`). S rε 0,8 vznikla
  „poslední kratší vrstva" za koncem polotovaru a k ní rampa 5° přes celý
  díl (tříska 5,6 mm). Průchod, který ze skutečného polotovaru nic neubere,
  se teď nevydá, konec dojezdu ve vůli se ořízne a bisekce poslední vrstvy
  bere jen interval otevřený zprava — hřídel má poslední vrstvu na dně
  (X 5,7 / 6,1). Klíč plátku `realStockLayers` (jen polygon,
  `ops/long/realStock.js`). Otisk: hnulo se 8 z 29 fixtures (polygon) —
  odpadl konec dojezdu nebo krátký průchod ve vůli; úběr shodný, porušení
  pravidel stejná nebo o vzduch méně. Vzorový díl uživatele (polygon
  24. 9.) i kulatá, upichovák a vrták beze změny.
- **Vrtání: vrták hrubovat nesmí, prázdná pole a začátek díry** (nález
  uživatele 7. 10. 2026 na dílu rozděleném na úseky — vrták ⌀5 v úseku 1,
  Vrtání „Neaktivní", 🔄 Dráhy vyrobily HRUBOVÁNÍ vrtákem):
  - **Vrtání určuje nástroj** (`enforceInsertOperation` v
    `calculatePipeline.js`): s vrtákem je program vždy vrtací cyklus (závit,
    upich, vyvrtávání se s ním vypnou), s jiným nástrojem se vrtání vypne.
    Přepnutí tvaru / slotu vrták ↔ nůž dráhy přegeneruje. V záložce Vrtání
    „Zapnout" = vybrat vrták ze zásobníku; u vrtáku je místo přepínače stav.
  - **Části programu dostanou výchozí hodnoty** klíčů, které nemají
    (`applyPartToState`) — část uložená před Vrtáním měla prázdná pole
    Z čelo, Záběr Q, Odskok… (dřív se doplňovaly jen interní příznaky).
  - **Z čelo prázdné = čelo dílu** (zprava nejvyšší Z kontury, zleva
    nejnižší). Výchozí Z0 u dílu nakresleného od Z0 doprava vrtalo od
    levého konce skrz celý kus.
  - **Záběry Q od vjezdu do materiálu:** odlitek před čelem dílu je taky
    materiál — první posuv jel 22 mm odlitku + Q bez výjezdu.
  - **Záložka obrábění podle nástroje** (uživatel: „dal jsem závitový nůž
    a mám tam vrtání"): vrták → Vrtání, závitový nůž → Závit, upichovák →
    Upich, soustružnický nůž z cizí operace zpět na Hrub. (Hot. zůstane) —
    při změně tvaru v panelu, výběru slotu zásobníku i noži z 🧰 knihovny.
    Přegenerování po výměně vrták ↔ nůž jede s ⏳ hodinami (uživatel: „sekne
    se mi to, když chci přehodit plátky" — okno ~1,3 s nereagovalo).
- **Tr závit: hloubka a průměry podle ISO 2904.** Vůle ve dně ac byla
  vždy 0,25 mm; správně 0,15 (P 1,5) / 0,25 (P 2–5) / 0,5 (P 6–12) /
  1 mm (P 14+). Hloubka Tr P 6–12 byla o 0,25 mm mělčí, Tr P 1,5 o 0,1 mm
  hlubší (CAM — auto H při výběru závitu — i kalkulačka Závity). Kalkulačka
  navíc ukazovala vnější ⌀ matice D₄ = D − 2·ac; správně D + 2·ac
  (Tr 20×4: 20,5, ne 19,5). Uložené programy mají H uložené — změní se až
  novým výběrem závitu.
- **Podélné hrubování: poslední vrstva už nepustí držák do stojícího
  zbytku** (nález 6. 10. 2026 na dílu uživatele — PCLNR 9 kolizí držáku
  až 24 mm², PWLNR 4). Údolí za hrbem bylo pro nůž s vedlejší hranou 5°
  nedosažitelné, pás odlitku na kuželi stál. Hloubková smyčka vrstvy
  u levé stěny kvůli držáku nevydala (model zbytku, `entryHolderArea`),
  ale blok „poslední (kratší) vrstva před nedosažitelnou hranicí" je
  bisekcí vrátil — jeho sken zná jen hotovou konturu. Bisekce se teď na
  držák ptá stejně (pravidlo 2). PCLNR 9 → 0, PWLNR 4 → 0 kolizí; zbytek
  u stěny zůstane a ukáže se jako „nedojeto" (PCLNR 1831 → 1940 mm²).
  Otisk všech 29 fixtures shodný. Test `cam-closing-layer-holder`. SW v401.
- **Čelní hrubování nožem PSKNR: průchody na osu a čistý 15° kužel**
  (nález uživatele 6. 10. 2026 — „u každého záběru schodek, každá další
  dráha skončí dřív"). Dvě příčiny, obě změřené na jeho dílu:
  - **Hlídání držáku čelně** (`ops/face/holderGuard.js`) bralo dno
    průchodu, který dojel NA OSU, jako povrch s materiálem pod sebou — nůž,
    jehož hlava sahá pod úroveň špičky, pak nad čelem dílu končil na X 2,14 /
    3,94 / 6,08 / 7,88 místo na ose. Pod osou nic nestojí (pravidlo 2).
    Otisk: změnil se jen `part-17-long-parting` (dva průchody 0,027 / 0,05 →
    přesně na osu, snapshot přepsán).
  - **Obrys držáku z 📚 katalogu** měl roh hlavy přesně v rohu destičky, na
    prodloužení břitu. Zbytek po předchozím průchodu se břitu dotýká, takže
    i držáku → zkrácení se řetězilo do pily (1,07 / 2,87 mm místo 15°) a
    2 kolize rychloposuvem. Hlava teď končí 1 mm za břity (kulatá 0,5 mm
    od kružnice). Staré obrysy z katalogu se v zásobníku, u aktuálního
    nože, v částech programu, u nože z knihovny i v načteném `.camprog`
    převedou samy (`upgradeIsoHolderProfile`); upravené obrysy zůstanou.
  - Test `cam-face-holder-axis` na dílu uživatele (bez opravy padá).
    SW v399.

### Changed
- **🔧 Zásobník: výchozí nože jen do prázdného zásobníku + automatický výběr
  nože podle operace** (uživatel 6. 10. 2026) – smazaný výchozí nůž se už
  sám nevrací; prázdný zásobník (první spuštění, reset) dostane ISO nože
  T1–T6 a u posledního nože se 🗑 nezobrazí, takže nikdy nezůstane prázdný.
  Zapnutí závitu vybere závitový nůž se stejným úhlem profilu, zadání
  upichnutí vybere upichovák (kulatý se nechá); nůž, který sedí, se nemění,
  chybějící ohlásí. Jeden krok ↩ s operací. Ostatní operace nůž nemění.
  SW v398.
- **🔧 Zásobník: výchozí nože T1–T6 = ISO nože s držákem** (uživatel 6. 10.
  2026: místo plátku s obdélníkem skutečné nože) – PSKNR 2525M12 (čelo),
  PCLNR 2525M12 (hrubování), PDJNR 2525M15 (šlicht), SRSCR 2525M20 (kulatý
  R10), SER 2525M16 (závit), MGEHR 2525-5 (upich), každý ve stejné roli jako
  dřívější provizorní nůž. Uložený zásobník se převede: nezměněný starý nůž
  se nahradí na místě (stejné T, dokončovací nůž a části programu jdou za
  ním), upravený zůstane, shodná kopie nového nože se odebere.
  `magazineDefaults.js` + test migrace. Staré `DEFAULT_TOOL_MAGAZINE` beze
  změny (reference pro `cam_sweep` a migraci). ☰ „Přidat doporučené ISO
  nože" zrušeno — výchozí nože to dělají samy. SW v397.

### Added
- **🔧 Zásobník: obrázek nože v řádku + 📚 doporučené ISO nože** (uživatel
  6. 10. 2026) – za číslem T malý náhled (destička + hlava držáku, i u
  vlastních obrysů, natočení a ruky; sdílená kresba `knifeThumb.js`, kterou
  používá i ISO katalog), klik = 👁 Ukázat. Na mobilu se v řádku schová VBD
  a úhly, ať je vidět název. ☰ → **📚 Přidat doporučené ISO nože**: PCLNR,
  PDJNR, MVJNR, SRSCR R10, SER AG60, MGEHR 3 mm (dřík 25×25) za stávající
  nože, jeden krok ↩. Výchozí T1–T6 beze změny (CAM je doplňuje podle jména,
  stojí na nich `cam_sweep`). SW v396.
- **📚 ISO katalog: kulaté držáky SRSCR (hlava 45°) a SRGCR (90°)**
  (uživatel 6. 10. 2026, podle fotky výrobce) – kulatá destička v rohu
  dříku vyčnívá o R, takže dojede k čelu / osazení (na ukázkovém dílu
  nedojeto 43 → 3 mm² proti neutrálnímu SRDCN). Kulaté RCMT 06–32 mm,
  do držáků jdou i o stupeň menší/větší destičky (764 kombinací), velikosti
  v nabídce seřazené podle IC. **Závitový SER** přestavěn podle výkresu:
  rovný dřík šířky b, destička v rohu jeho konce, protější roh sražený
  (dřív hlava širší než dřík — „vypadá šíleně"). SW v395.
- **📚 ISO katalog nožů v 🧰 Knihovně nástrojů** (uživatel 6. 10. 2026) –
  vestavěné vnější soustružnické nože podle ISO 5608 (držák) a ISO 1832
  (destička): PCLNR/SCLCR, PWLNR, PTGNR/STGCR, PCBNR, PSBNR, PSKNR,
  PTFNR/STFCR, PDJNR/SDJCR, PDNNN/SDNCN, MVJNR/SVJBR, MVVNN/SVVBN,
  PSSNR/SSSCR, PSDNN, SRDCN, zapichovací MGEHR (MGMN 2–5 mm) a závitový SER
  (16ER AG60/AG55). Volí se dřík 16×16–32×32, negativní/pozitivní destička,
  velikost a rε — 584 kombinací. Z κr se dopočte natočení destičky v CAM,
  obrys držáku (dřík b × l1 posunutý o f1, hlava za destičkou s úlevou) se
  postaví parametricky — rozměry orientační. ✅ Použít / 🔧 Do zásobníku
  (nový T, okno zůstane otevřené) / 🧰 Uložit. Prázdná knihovna se otevře
  rovnou na katalogu. `isoToolCatalog.js` + `isoCatalogPanel.js`, test
  `iso-tool-catalog` (každá kombinace: uzavřený jednoduchý obrys mimo
  řeznou část, κr → natočení, kódy). SW v394.
- **Kalkulačka ⌐ Roh R / C** v Další kalkulačky (uživatel 6. 10. 2026) –
  zaoblení / sražení obecného rohu: zadání třemi body nebo rohem a směry,
  tečné body, střed, t = R·tan(δ/2), vnitřní úhel, řádky G01/G02/G03 s R
  (směr oblouku podle stroje stejně jako CNC export), kontrola, že se úprava
  vejde do úseků; náčrt přiblížený na roh. `cornerMath.js` + test (střed ve
  vzdálenosti R od obou úseků u kužele, tupého i ostrého rohu), okno
  `corner.js`, vlastní SVG ikona. SW v388.
- **Kalkulačka ⦶ Měření** v Další kalkulačky (uživatel 6. 10. 2026) – měření
  přes drátky a válečky: závit metodou tří drátků (M, optimální drátek
  a nejbližší ze sady, d₂ z naměřeného M), kužel přes dva válečky a měrky
  (úhel, 1:x a Ø z M1/M2 i kontrolní míry z výkresu, kužel na menším i větším
  průměru) a rybina vnější i vnitřní. `wireMeasureMath.js` + test (tabulkové
  tvary vzorců, nezávislá kontrola tečnosti válečků), okno `wireMeasure.js`.
  SW v385.
- **Kalkulačka ◎ Rozteč děr** v Další kalkulačky (uživatel 6. 10. 2026) –
  díry na roztečné kružnici: celý kruh nebo zadaná rozteč, směr, střed;
  tabulka X/Y a úhlu C, vzdálenost sousedních děr, můstek / překrytí, náčrt.
  `boltCircleMath.js` + test, okno `boltCircle.js`. SW v384.
- **Řezné podmínky: 🔁 G96 – konstantní řezná rychlost** (uživatel 6. 10.
  2026) – mezní průměr při omezení otáček (LIMS / G50 S), strojní čas čelení
  i kužele s G96 (integrace přes průměr, část na limitu otáček zvlášť),
  skutečná vc na malém průměru a srovnání s G97. `g96Math.js` + test
  (porovnání s numerickým součtem), sekce `cuttingG96.js`. SW v383.
- **Vrták: ⚙️ Řezné podmínky vrtání** (uživatel 6. 10. 2026) – materiál
  a HSS/SK → doporučená vc a f (f ≈ k·D^0,6), otáčky, posuvová rychlost,
  strojní čas včetně délky špičky L, výkon, krouticí moment a osová síla
  (vzorce Sandvik). `drillCuttingMath.js` + test, sekce `drillCutting.js`.
  SW v382.
- **Kalkulačka ◢ Korekce rε** v Další kalkulačky (uživatel 6. 10. 2026) –
  korekce na rádius špičky nože bez G41/G42: sražení a kužel (ΔZ, ΔX, chyba
  obrysu, programované body sražení + řádky G1, i zpětný kužel) a rádius 90°
  (R ± rε, posunuté body a středy), vnější i vnitřní nůž, náčrt s nožem
  a dráhou teoretické špičky. Výpočet `js/calculators/noseRadiusMath.js`
  (test `tests/noseRadiusMath.test.js` ověřuje tečnost nože k obrysu ve všech
  variantách). Společné pomůcky kalkulaček (pole, náčrt, kóty, výsledek,
  kopírování) přesunuty do `calcKit.js`, styly `.calc-out*` / `.calc-svg`. SW v381.
- **Kalkulačka ⬇️ Vrták** v Další kalkulačky (uživatel 6. 10. 2026) – okno
  s geometrií špičky vrtáku a náčrtem: tabulka základních vrtáků s úhlem
  špičky (ocel 118°, nerez 135°, hliník 140°, navrtáváky…) nebo vlastní úhel;
  z průměru spočítá délku špičky L = D / (2·tan(σ/2)) – vzdálenost od hrotu
  k hraně plného průměru. Navíc hloubka pro menší průměr (navrtání, sražení)
  a obráceně, délka břitu a hloubka hrotu H + L. Výpočet v
  `js/calculators/drillGeometry.js` (test `tests/drillGeometry.test.js`),
  okno v `drill.js`. SW v379.
- **Mobil: popisky tlačítek pod křížkem plátna** (uživatel 5. 10. 2026) –
  přesný křížek (dlouhý stisk na plátně) dojetý nad tlačítko nad plátnem
  (SOU/ABS/R, ↩, 🔢, 🧲…) ukáže místo souřadnic bublinu s popisem tlačítka
  a zvýrazní ho, stejně jako dlouhý stisk mimo plátno; puštění prstu klikne
  na tlačítko místo bodu schovaného pod ním (platí i pro 🎯 bod z plátna).
  SW v364.
- **Mobil: ✏️ CNC Editor ve spodní liště** mezi VK a měřením (uživatel 5. 10.
  2026) – otevře stejný editor jako Kalkulačky → CNC Editor. SW v361.
- **CNC Editor z Kalkulaček – pomůcky pro zjišťování rozměrů** (uživatel
  5. 10. 2026): řádek s údaji k řádku s kurzorem (úsečka: L, úhel, ΔX/ΔZ;
  oblouk: R, střed, I/K, výseč, délka), **∠ úsečka úhlem** (úhel + L / X / Z →
  G1), **📐 náhled kontury** s vyznačeným řádkem, po zavření editoru se objekt
  z řádku s kurzorem označí na plátně, **průsečíky z plátna** v pravém panelu,
  kopírování řádku / koncového bodu, **G90↔G91 jen pro označené řádky**,
  validace geometrie (oblouk nejde sestrojit, G0 uprostřed kontury, X pod osou,
  volitelně netečný přechod). Výpočty v novém `js/calculators/cncDrawTools.js`
  (testy `tests/cncDrawTools.test.js`), náhled v `cncDrawPreview.js`.
  Řádek s údaji má celou šířku na 3 řádky (tlačítka ve sloupci vpravo), údaje se
  nelámou uprostřed. SW v360.
- **Zápich a závit vodorovně i svisle, na karuselu prohozeně** (uživatel
  6. 10. 2026: „na karuselu ať je to prohozené, závity a zápich by měl jít
  jak vodorovně, tak i svisle nakreslit"):
  - **Zápich**: v dialogu volba **Orientace** – vodorovně (hloubka dolů) /
    svisle (hloubka doleva), výchozí podle stroje (soustruh vodorovně,
    karusel svisle). Průměr určuje radiální polohu podle stroje (soustruh
    svět y, karusel svět x). `placeGrooveProfile()` + test
    `tests/groove-place.test.js`.
  - **Závit**: jde na vodorovnou i svislou úsečku – celý výpočet běží
    v rámci (podél osy, od osy) podle kliknuté úsečky; svislý závit dá
    přesně tentýž výsledek s prohozenými osami (sražení, zápich DIN 76,
    d₂/d₃, popisek podél úsečky, `threadInfo` pro CAM). Úsečka se drží jako
    objekt, ne index (Zpět mezi kliknutími ji už nepřehodí). SW v378.

### Fixed
- **Kontrola všech tolerancí proti nezávislým tabulkám** (uživatel 6. 10. 2026):
  - *ISO 286* – porovnáno s CADForum.cz (1 480 hodnot), Mitsubishi Materials
    (863) a Miki Pulley / JIS B 0401 (1 269, shoda 100 %), tabulka IT1–IT18
    s Wikipedií (234/234), a/b/c/s mimo tabulky se vzorci ISO 286-1. Opraveno:
    chyběla normová výjimka **M6 pro 250–315 mm = −9/−41** (bylo −11/−43);
    js7–js11 s lichou IT ukazují ±IT/2 (aktuální tabulky) a poznámku se starším
    zaokrouhlením (ISO 286-2:1988: ±10 místo ±10,5); a, b, A, B do 1 mm hlásí,
    že se nepoužívají. Rozdíly ve zdrojích (CADForum f6 120–180, E7 315–400,
    K6 6–10) jsou jejich překlepy – nesedí šířka pole s IT.
  - *ISO 2768-1* – tabulka volných rozměrů sedí ve všech 32 polích.
  - *ISO 965 (závity)* – vzorce ISO 965-1 + zaokrouhlení R40 normové tabulky
    nereprodukují (M36 6g d min 35,490 místo **35,465**; M3 6H D1 max 2,591
    místo **2,599**; M3 6g d2 min 2,575 místo 2,580 …). Nově `iso965Data.js`
    s tabulkami ISO 965-1 (Td, Td2, TD1, TD2, úchylky e/f/g) ověřenými poměry
    stupňů a proti mezním rozměrům ISO 965-2 (Optimas, 175/180 – zbytek překlepy
    zdroje); vzorec jen mimo tabulky (M1–M1,4) s upozorněním „orientačně".
  - Regresní testy s referenčními daty: `tests/iso286-reference.test.js`
    (1 484 hodnot), `tests/iso965-reference.test.js` (42 závitů). SW v393.
- **VBD & Držáky: dekodér podle ISO 1832 / 5608** (kontrola 6. 10. 2026): chyběla
  3. pozice (třída přesnosti M – nejběžnější), G popsáno jako „utvařeč horní"
  (je oboustranný), T jako „obě strany" (je jednostranný se zahloubením 40–60°),
  N jako „s dírou"; velikost hlášena jako IC = kód (CNMG 12 → „IC 12 mm", VBMT 16
  → „IC 16 mm"; ve skutečnosti délka břitu 12,9 / 16,6 mm a IC 12,7 / 9,525 mm);
  tloušťka 04 = „4 mm" (je 4,76), T3 chyběla; úhly hřbetu A = 25° a M = 15° (ISO:
  A = 3°, D = 15°, F = 25°) – a tyto hodnoty šly i do CAM při „Použít v CAM"; W
  jako šestiúhelník (je trigon 80°); přípona výrobce „-PM" čtena jako ISO poz. 8/9;
  upnutí M/S v nápovědě prohozené; „Vhodné plátky" u držáku vypisovaly držáky.
  Nově `vbdIso.js` (data ISO 1832, IC z délky břitu podle tvaru, tloušťky
  a rádiusy z kódu, přípona výrobce zvlášť, držáky z tvaru + úhlu + typu díry),
  test `tests/vbdIso.test.js`. SW v392.
- **Kužel, Hmotnost, Převodník** (kontrola 6. 10. 2026): posun koníku byl poloviční
  (L·tan(α/2) / 2 → D20/d10/L50 ukazovalo 2,5 místo **5 mm**), nově s poznámkou pro
  delší obrobek; Hmotnost počítala zápornou hmotnost u trubky s vnitřním Ø ≥ vnější
  a u záporných rozměrů (nově hláška); Převodník bral HV = 1,05·HB i u kalených
  ocelí (60 HRC → 644 místo **697 HV**, 65 HRC → 716 místo 832) – nově tabulka
  HRC ↔ HV dle ASTM E140, mimo stupnici 20–68 HRC se HRC nezobrazuje (dřív se
  „přilepila" na 20 / 68). SW v391.
- **Závity: tolerance ISO 965 a vrták pro předvrtání** (kontrola 6. 10. 2026):
  tolerance středního Ø matice TD₂ bez násobku 1,32 (M10 6H D₂ max 9,159 místo
  **9,206**), ve vzorci Td opačný exponent (3,15·√P místo 3,15/√P), jmenovitý
  průměr místo středu rozsahu a bez zaokrouhlení na R40 (6g d min 9,736 místo
  9,732). Předvrtání ukazovalo D₁ (M10 → 8,4) a normový vrták 8,5 značilo jako
  „těžší řezání" (100 % = D₁); nabízelo i Ø 8,0 se „123 % závitu". Nově
  `iso965.js`: tolerance podle ISO 965-1 se zaokrouhlením R40 (shodné s tabulkami
  ISO 965-2 pro M6, M10, M16, M20, M30; stupně 4–8), základní úchylka g z tabulky,
  vrták = normový nejblíž 75 % závitu (D − 0,974·P → M10 8,5, M12 10,2, M30 26,5,
  řada vrtáků od 20 mm po 0,5), podíl závitu ve shodě s dílenskou praxí
  (100 % = 1,299·P) a varování pod D₁ / nad D₁ max 6H. Test `tests/iso965.test.js`.
  SW v390.
- **Tolerance ISO 286 – špatná přechodná a přesahová uložení** (kontrola 6. 10. 2026):
  tabulka hřídelů k, m, n, p, r, s obsahovala horní úchylky pro IT6 místo základních
  (dolních) úchylek → Ø25 n6 dávalo +41/+28 místo **+28/+15**, p6 +48/+35 místo
  **+35/+22**; díry J–S se odvozovaly jen otočením znaménka bez pravidla ES = −ei + Δ
  → K7 −9/−30 místo **+6/−15**, P7 −35/−56 místo **−14/−35**; a, b, c nad 50 mm
  posunuté o podrozsah; js zaokrouhleno (±7 místo **±6,5**). Nově `iso286.js` podle
  ISO 286-2 (podrozsahy a–c, r, s; Δ pro K/M/N do IT8 a P–S do IT7; výjimky do
  3 mm; j5–j7 a J6–J8 z tabulek, ostatní ohlásí „není definováno"), rozsah 0–500 mm,
  test `tests/iso286.test.js` proti tabulkovým hodnotám. SW v389.
- **Závity: rozpis průchodů** (uživatel 6. 10. 2026) – tři chyby:
  M10×1,5 dávalo **38 řezů** (posledních 20 pod 0,02 mm – limit prvního řezu
  0,15 mm vedl na n = (h/0,15)²); **boční přísuv nedojel na hloubku** (přísuv
  se rozkládal jako délka po boku → ΣX = 0,799 místo 0,920, závit o 0,24 mm
  na průměru mělčí); úhel bočního přísuvu natvrdo 30° i pro Tr / Whitworth.
  Nově `threadPassesMath.js`: hloubky ze stejné funkce jako CAM
  (`computeThreadPassCuts` – M10×1,5 → 8 řezů, shodně s generovaným
  programem; nerez +30 %, hliník −20 %), boční přísuv β = α/2 − 0,5°
  (29,5° / Tr 14,5° / BSW 27°) s posunem startu v Z od posledního řezu,
  střídavý přísuv, **Ø X každého řezu** (vnější od d, vnitřní od D1),
  počet řezů ±, varování u přísuvu pod 0,02 mm. Test
  `tests/threadPassesMath.test.js`. SW v387.
- **Drátky/válečky (dřív Měření) – kontrola** (uživatel 6. 10. 2026): závit
  přes drátky bral nejbližší drátek ze sady i mimo použitelný rozsah (např.
  Tr 40×7 → 3,2 mm, rozsah je 3,41–4,59) – mikrometr by dosedl na vrcholy
  a M by neplatilo. Nově `wireRange()` (metrický 0,505·P až 1,01·P)
  a `pickWire()` vybírá jen z rozsahu, jinak optimum s upozorněním; ručně
  zadaný drátek mimo rozsah se ohlásí. Tlačítko má vlastní ikonu (profil
  závitu s drátky) a popisek „Drátky/válečky"; programované body v tabulkách
  Korekce rε označené proužkem místo zeleného textu (světlý režim).
  Kontrola okrajových hodnot všech nových kalkulaček (1023 kombinací) bez
  chyb. SW v386.
- **Kalkulačka Vrták – kontrola** (uživatel 6. 10. 2026): náčrt při neplatném
  úhlu ukazoval čísla z výchozích 118°; hloubka h za špičkou dávala Ø větší
  než vrták (teď plný Ø D); Ø d větší než vrták nechával v poli h nesmyslnou
  hloubku; přepsaný a vrácený úhel už neztratí předvolbu; šipky kót bez
  `orient="auto-start-reverse"` (starší Safari); Kopírovat bere čísla, ne
  text polí, a hlásí nedostupnou schránku; hlášky u neplatných D/d/h a
  vzorec u rovného čela. SW v380.
- **CNC kód: oblouk přes 180° s kladným R** (uživatel 6. 10. 2026) – export
  z výkresu (panel CNC KÓD, Editor i přenos do CAM) psal u oblouku vždy
  kladné R, takže stroj (i zpětné načtení a CAM) ujel KRATŠÍ oblouk mezi
  týmiž body – z oblouku 270° jen 90°. Nově R < 0 pro výseč > 180° (ISO /
  Fanuc / Sinumerik; CAM `getArcParams` i `parseGcodeToObjects` ho čtou).
  Celá sada vč. CAM 1816/1816, test v `cnc-export-chain.test.js`.
- **Trasování profilu – oblouky** (uživatel 6. 10. 2026):
  - směr oblouku převzatého z výkresu se vybíral vždy po kratší cestě → u
    oblouku přes 180° trasa i G-kód vedly druhou (neexistující) stranou;
    nově podle toho, kudy vede objekt;
  - G-kód trasy neprohazoval G2/G3 při zrcadlení pohledu (obrábění zespodu)
    jako CNC export;
  - „Vykreslit profil" udělal z oblouku převzatého z výkresu rovnou úsečku
    (oblouk jen s ručním bulge) a záporný bulge vykreslil jako doplněk.
  SW v377.
- **Měření, přichytávání, válcový polotovar** (uživatel 6. 10. 2026, kontrola
  dalších oblastí):
  - **válcový polotovar** se počítal jen z vrcholů kontury – oblouk (bulge)
    vyboulený nad vrcholy trčel z polotovaru ven (CAM dostal díl větší než
    polotovar); natočený obdélník se bral bez natočení. Nově z úseků kontury
    včetně krajních bodů oblouků (test v `contour-branches.test.js`);
  - **přichytávání na hranu oblouku po směru hodin** hledalo bod na jeho
    neexistujícím doplňku (`getNearestPointOnObject` nepředávala směr);
  - **měření bod ↔ kontura / obdélník** měřilo k „středu", který byl u
    kontury (0, 0) → vzdálenost k počátku; teď k nejbližšímu bodu objektu.
    Totéž u generického měření 2 objektů (kontura, text, výplň) – sdílený
    `objectCenter()`; **bod ↔ oblouk** počítá vzdálenost k oblouku, ne
    k celé kružnici;
  - úprava vzdálenosti / úhlu dvou úseček v Měření posunula i **zakotvenou**
    úsečku a u krátké úsečky nechala prázdný krok Zpět;
  - Rozpoznání prvků: natočený obdélník, jedno dno = nejvýš jeden zápich.
  SW v376.
- **Panel Vlastnosti – úprava souřadnic nepřepočítala průsečíky ani CNC
  kód** (uživatel 6. 10. 2026) – po přepsání X/Z, délky, úhlu, středu nebo
  poloměru v panelu se jen překreslilo: body průsečíků (přichytávání)
  zůstaly na staré poloze a panel CNC KÓD ukazoval starou geometrii.
  Totéž přepínač Kontura/Polotovar. Nově `_afterGeomEdit()` (kóty +
  `calculateAllIntersections`, která obnoví i CNC panel). SW v375.
- **Import projektu a SVG** (uživatel 5. 10. 2026):
  - projekt s **výplní** (Vybarvit) nešel importovat vůbec – typ `fill`
    chyběl v seznamu povolených; nově se kontrolují i body kontur a smyček;
  - export projektu neukládal **flipZ** (import ho čte) → zrcadlení osy Z
    se po exportu/importu ztratilo;
  - soubor bez `nextId` (starší / převedený) začal číslovat od 1 → **nová
    id kolidovala** s uloženými (kóty, kotvy, text na cestě se pak vázaly
    na jiný objekt); `expandPolylineObjects` – společná pro všechna načtení
    – teď navazuje za nejvyšší existující id;
  - **SVG oblouk** (příkaz A) se sweep-flag 1 se importoval s opačným
    směrem → čtvrtoblouk jako doplněk 270°. Testy `tests/svg-import.test.js`.
  SW v374.
- **Import DXF – zrcadlené entity, MTEXT, výška textu, bloky** (uživatel
  5. 10. 2026):
  - entity se **zápornou normálou** (210/220/230 = 0,0,−1 – po zrcadlení
    v AutoCADu) se kreslily na opačné straně: OCS → WCS u ARC, CIRCLE,
    LWPOLYLINE, POLYLINE, ELLIPSE, TEXT a INSERT (`ocsMirrorX`);
  - **MTEXT** s kódem 72 (směr psaní, AutoCAD ho píše běžně) se umístil na
    „bod" 11/21, což je u MTEXT směrový vektor → text u počátku; natočení
    MTEXT se bralo ve stupních (je v radiánech) a směrový vektor se
    ignoroval;
  - **výška textu** se zaokrouhlovala na celé číslo (2,5 → 3, 0,4 → 0 =
    neviditelný text);
  - **zrcadlený blok** (INSERT se záporným měřítkem) prohnul oblouky kontur
    na opačnou stranu (bulge bez změny znaménka); **pole bloků** (řádky ×
    sloupce) ignorovalo natočení bloku.
  Testy v `tests/dxf-import-3dface-insert.test.js`. SW v373.
- **Transformace, kruhové pole, vložení ze schránky** (uživatel 5. 10. 2026,
  „najdeš-li jiné chyby, oprav je"):
  - **překlopení oblouku** bez uvedeného směru (většina oblouků – z kontur,
    zaoblení, DXF) neotočilo směr (`!undefined` = true) → čtvrtoblouk se
    kreslil jako 270°;
  - **kruhové pole** s výchozím „6 kopií, 360°, bez originálu" položilo
    poslední kopii přesně na originál (zdvojený objekt); u části kruhu
    „včetně originálu" poslední pozice nedosáhla zadaného úhlu;
  - **otočení / zrcadlení / překlopení / pole** nehýbaly **textem** a
    **výplní** (zůstaly na místě), záporné **měřítko** neotočilo oblouk;
  - **Ctrl+V zakotveného objektu** vložilo kopii přesně na originál (posun
    odmítla kotva originálu), víc objektů = víc kroků Zpět, odmítnutá
    duplicitní kóta posunula výběr na jiný objekt. Nově `translateObject()`
    v `objects.js` (posun bez kotev) – nahradil i kopie v Kopírovat & umístit
    a v Offsetu; dialog Měřítko odmítne i nekonečný faktor.
  SW v372.
- **Tažení objektů: jedna implementace místo tří** (uživatel 5. 10. 2026) –
  průběh tažení byl zkopírovaný v `events.js` (myš) a 2× v `touch.js` (dotyk,
  precizní režim), rušení ve 3 dalších místech, a kopie se rozešly. Nově
  `applyDragDelta()` / `cancelDrag()` v `tools/moveClick.js`. Opravené chyby:
  - **přepnutí nástroje uprostřed HROMADNÉHO přesunu** vrátilo jen jednotlivý
    objekt – hromadně tažené objekty zůstaly napůl přesunuté;
  - **Esc / ✕ při tažení** vrátil objekt, ale jeho asociativní kóty zůstaly
    posunuté;
  - zrušené tažení nechalo v historii **prázdný krok Zpět**;
  - precizní dotykový režim nemazal vlastnosti přidané během tažení
    (posun textu po cestě), myš ano. SW v371.
- **Export SVG obsahuje kóty** (uživatel 5. 10. 2026) – Maker.js kóty do SVG
  nedával vůbec. Nový `js/storage/svgCanvasContext.js` napodobí podmnožinu
  canvas API (cesty, oblouky, text, transformace, přerušované čáry) a místo
  kreslení zapisuje SVG prvky – kóty tak do SVG kreslí TENTÝŽ kód jako na
  plátno a do PNG (`drawDimensionOn` / `drawAutoDimensionOn`). Skupina
  `kóty` se umístí do souřadnic Maker.js a `viewBox` se rozšíří, aby se
  popisky neořízly. Totéž v záložním SVG (bez Maker.js), kde navíc čáry
  měly tloušťku 1,5 mm místo 0,5 mm. Pravidla viditelnosti a měřítko kót
  mají PNG i SVG společné (`isExportVisible`, `dimPixPerMm`). Testy
  `tests/svgCanvasContext.test.js`. SW v370.
- **Export PNG obsahuje kóty** (uživatel 5. 10. 2026) – kóty se dřív
  exportovaly jako holé čáry bez šipek a hodnot, souřadnicové štítky jako
  body. Teď je kreslí tentýž kód jako plátno (`drawDimensionOn` /
  `drawAutoDimensionOn` v render.js – přepínatelný cíl kreslení rozšířený
  z textu na kóty): lineární, zarovnané, úhlové, R/⌀, odkaz R, souřadnice
  bodu i automatické popisy R/⌀ u kružnic a oblouků, s vyhýbáním popisků.
  Řídí se režimem zobrazení kót. Popisky mají barvu podle POZADÍ obrázku
  (`inkForBackground`) – na bílém tmavé i při tmavém tématu.
  - Rozlišení PNG 1× už není pevně 2 px/mm (díl 60 mm měl 120 px a popisky
    kót ho přerostly), ale ≈ 800 px na delší stranu (2–20 px/mm, strop
    16 000 px); kóty se kreslí v měřítku 1× a zvětší se s rozlišením.
  - Okraj obrázku počítá s popisky kót a souřadnicovými štítky.
  - Skrytá poznámka s CAM G-kódem (`isCamPathNote`) se do PNG nedostane.
  SW v369.
- **Export PNG obsahuje texty a výplně** (uživatel 5. 10. 2026) – dřív se do
  PNG nedostal žádný text (ani natočený, ani po cestě) a žádná výplň
  (Vybarvit). Text kreslí tentýž kód jako plátno (`drawText` v render.js má
  přepínatelný cíl; export volá `drawTextOn()`), bez značek pro výběr;
  výplně pod ostatními objekty s průhledností. Rámeček obrázku počítá i s
  textem a výplněmi, aby nebyly uříznuté. SW v368.
- **Zpět vrací hotový tvar celý najednou** (uživatel 5. 10. 2026: „ať to bere
  naráz a ne po částech") – po polygonu, hvězdě, drážce, ozubení, oříznutí či
  offsetu kontury Ctrl+Z napřed konturu rozpojilo a pak ubíralo body po
  jednom (pozůstatek z doby, kdy nástroj Kontura vytvářel jeden objekt).
  Po bodech se vrací jen ještě ROZKRESLENÁ kontura. SW v367.
- **Kontrola CAD – úpravy kontur, kóty, export** (uživatel 5. 10. 2026),
  regresní testy `tests/polyline-edits.test.js` + `tests/dimension.test.js`:
  - **zaoblení/zkosení rohu UVNITŘ kontury** přepsalo sdílený vrchol dvakrát
    – z `(0,0)-(10,0)-(10,10)` vzniklo `(0,0)-(10,2)-(10,10)` + samostatný
    oblouk; teď se do kontury vloží oblouk (bulge) / zkosení, sousedé se jen
    zkrátí. Nesousední segmenty téže kontury se odmítnou;
  - **zaoblení s příliš velkým poloměrem** úsečku tiše otočilo za její konec
    – teď hláška (`filletTwoLines`);
  - **oříznutí segmentu kontury** posouvalo sdílený vrchol a deformovalo
    sousední segment, u oblouku zmizel zbytek, u uzavřené kontury se ztratil
    uzavírací segment – nově jedna funkce „odstraň úsek kontury"
    (`removePolylineSpan` v `trimClick.js`); průsečíky s vlastní konturou se
    berou i u rovného segmentu. Mrtvé `trimLineSeg`/`trimRectEdge` pryč;
  - **prodloužení** u kontury jen za volný konec otevřené kontury (vnitřní
    konec patří i sousednímu segmentu); konec, který už na objektu leží,
    nehlásí „Prodlouženo ✓" bez změny;
  - **rozdělení obloukového segmentu kontury** dělí na oblouku (dřív bod na
    tětivě a z oblouku dvě úsečky);
  - **✕ segmentu uzavřené kontury v seznamu objektů** mazalo dva segmenty;
    smazání prostředního segmentu z plátna dávalo nové kontuře objekt bez
    `id` – obě místa teď volají `deletePolylineSegment()` (`objects.js`);
  - **rozdělení / spojení / oříznutí / smazání segmentu** ztrácelo vrstvu, typ
    čáry a příznak polotovaru (půlka polotovaru se stala konturou) –
    `inheritedProps()`; Spojit už nespojí polotovar s konturou a nenechá výběr
    ukazovat na jiný objekt; oříznutí pomocné čáry nevyrobí konturu;
  - **hromadný přesun** posouval všechny volné kóty a souřadnicové štítky ve
    výkresu, ne jen vybrané;
  - **kóty oblouku po směru hodin** (úhel i R) ukazovaly doplněk do 360° na
    prázdné straně oblouku;
  - **export PNG / SVG** kreslil oblouk po směru hodin obráceně a obdélník bez
    natočení;
  - **Rozložit konturu** nechávala viset kóty – teď se převážou na nové
    úsečky/oblouky; osiřelé kóty maže jedna `removeOrphanDimensions()`;
  - **text na cestě** odkazoval indexem do pole objektů → po smazání objektu
    před cestou se přichytil jinam; nově `pathObjId` (id), starý formát se
    převede při načtení.
  - Úklid: ~35 nepoužitých importů a mrtvé funkce (`findNearestEndpoint`,
    `chainToPolylines`, `getLineData`/`getCircleData`). SW v366.
- **CNC Editor – druhá kontrola chyb** (uživatel 5. 10. 2026):
  - „Přepsat výkres" (🔄 / zavření editoru) nevynuloval výběr – indexy ukazovaly
    do starého pole objektů a panel CNC KÓD pak exportoval jen „vybraný" kus;
  - kopírování v prohlížeči bez schránky (mimo HTTPS) spadlo – teď hlášení;
  - G90/G91 výběru: samostatné G90/G91 uvnitř výběru přepnulo režim uprostřed
    převodu (test);
  - vkládání do poznámky: středník v `MSG("…;…")` se už nebere jako komentář.
  SW v363.
- **🎯 Bod z plátna** chytá koncové body/průsečíky i s vypnutým přichytáváním
  (dřív bral místo prstu → nepřesné souřadnice).
- Kód vložený klávesnicí s kurzorem v poznámce („Z0 ; Úsečka 3|") skončil
  v komentáři – teď se vloží před středník; bez zdvojených mezer.
- Vložení značky Kontura/Polotovar na konci řádku přidávalo prázdný řádek.
- `parseGcodeToObjects`: karusel v režimu průměr s vynechanou osou X (zhuštěný
  zápis) dostal špatnou polohu (regrese z opravy v SW v357). SW v359.
- **CNC Editor – kontrola chyb** (uživatel 5. 10. 2026):
  - návrat z „🎯 Bod z plátna" v jiném souboru než CNC_PROGRAM přepsal
    CNC_PROGRAM textem toho souboru – editor teď pokračuje v souboru, kde byl;
  - validace R-parametrů (CNC i CAM Editor) počítala přes `Function()`, které
    CSP zakazuje → každý R-parametr vyšel 0; nově `safeEvalMath`;
  - historie Zpět/Vpřed v localStorage má strop 1 MB (dřív mohla zaplnit
    úložiště a zablokovat ukládání programů); smazaný soubor nenese vnořené
    obnovy;
  - smazání / obnovení jiného než otevřeného souboru editor nepřepne;
  - převod sražení/zaoblení píše čísla bez zbytečných nul (Z65 místo Z65.000).
  SW v358.

### Changed
- **Kužel v hlavní sekci Kalkulaček** (uživatel 5. 10. 2026): 🔺 Kužel
  přesunut z „Další kalkulačky" za Sinumerik. SW v365.
- **CNC Editor (kreslení) odebrán z Kalkulaček** (uživatel 5. 10. 2026): otevírá
  se jen z plátna – mobil ✏️ ve spodní liště, desktop **✏️ Editor** ve stavové
  liště (vedle ✏️ VK). SW v362.
- **CNC Editor z Kalkulaček – lišta „CAD G-kód kreslení" + režim X; oprava
  karuselu v průměru** (uživatel 5. 10. 2026): oranžová lišta místo
  „SINUMERIK (CAD kal.) — soubor" ukazuje **CAD G-kód kreslení** a štítek
  **X = ⌀ průměr / X = poloměr** podle nastavení X displej (stejně se zadává
  X i I). Kontrola zadávání podle režimu: oprava `parseGcodeToObjects` – u
  karuselu v režimu průměr se X nepůlilo, takže překreslení z editoru (🔄,
  zavření s přepsáním, import CNC kódu) zdvojnásobilo X a oblouky se ztratily.
  Ověřen round-trip export → překreslení pro soustruh i karusel × poloměr
  i průměr. SW v357.
- **CNC Editor – převod sražení/zaoblení píše u oblouku i I a K** (uživatel
  5. 10. 2026): ⌒ teď zapíše `G2/G3 X… Z… I… K… R…` – I/K = střed oblouku
  relativně k jeho začátku (I v jednotkách osy X, tak jak ho čte kreslicí
  parser). Oprava: v režimu „průměr" se zaoblení i sražení počítalo v rovině
  (průměr, Z) a vycházelo zkreslené – teď ve fyzické rovině (poloměr, Z).
  SW v356.
- **CNC Editor z Kalkulaček – celé plátno + zvýraznění označeného** (uživatel
  5. 10. 2026): když je na plátně něco označené, editor už nedostane jen ten
  objekt, ale celé plátno; řádky označených objektů jsou podbarvené žlutě (bez proužku vlevo, ten překrýval první znak)
  a kurzor/výběr stojí na prvním z nich (`bridge.cncAsDrawnSelection()`).
  Export do panelu CNC KÓD i přenos do CAM beze změny. SW v355.
- **CNC Editor z Kalkulaček – A−/A+ a Vymazat editor v pravém panelu**
  (uživatel 5. 10. 2026): velikost textu (A− / A+) přesunuta z horní lišty
  do pravého panelu (panel po klepnutí zůstává otevřený). Položka „Nový
  program" nahrazena **🗑 Vymazat editor** (smaže celý kód, ◀ Zpět ho vrátí,
  v Historii jako „Vymazání editoru"). Z pravého panelu odebrány Import a Export
  balíčku. SW v353.
- **CNC Editor z Kalkulaček – Historie jen větších změn, zavírání panelů**
  (uživatel 5. 10. 2026): Historie v levém panelu ukazuje jen větší změny
  (smazání kódu ≥ 20 znaků nebo 2 řádků, Načteno z plátna, převody, zkrácení,
  hlavička, přečíslování, vložení ze schránky, smazaný soubor) s datem a časem;
  drobné úpravy vrací šipky ◀ ▶. Levý i pravý panel se zavře klepnutím mimo
  něj. Sekce R-Parametry v editoru z Kalkulaček odstraněna (v obráběcím
  editoru zůstává). SW v351.
- **CNC Editor – Historie změn, sekce Program, Uložit G-kód** (uživatel
  5. 10. 2026): v levém panelu je **Historie** teď seznam provedených změn
  (Psaní, Mazání, Vloženo G1, Zkrácení kódu, Převod na G91, Bod z plátna,
  Načteno z plátna, Smazán soubor… s časem) – nahoře šedě kroky ↪ Vpřed,
  ● Aktuální stav, pod ním kroky ↩ Zpět; klik skočí do stavu před tou změnou.
  Úpravy stejného druhu rychle po sobě jsou jeden krok, jiný druh = nový krok.
  Sekce „Spoj G-kód" přejmenována na **Program**: seznam souborů,
  **💾 Uložit G-kód** (stáhne .MPF), 📂 Načíst program, 🔗 Spojit. Levý panel
  v editoru z Kalkulaček na mobilu 250 px. SW v350.
- **CNC Editor z Kalkulaček – vždy obsah plátna, smazání souboru jde vrátit**
  (uživatel 5. 10. 2026): editor z Kalkulaček při každém otevření načte do
  `CNC_PROGRAM.MPF` to, co je na plátně, a přepne se na něj (dřív zůstal
  v jiném souboru, např. po smazání v Historii na „; Nový program“). Předchozí
  text je krok ◀ Zpět. Smazání souboru ✕ v levém panelu Historie jde vrátit
  šipkou ◀. Prázdný soubor už nezakládá nový program a nový program nepřepíše
  existující PROG_n. SW v349.
- **CNC Editor z Kalkulaček – klávesnice, lišty, historie, validace**
  (uživatel 5. 10. 2026): otevření editoru zavře pravý panel CAD (po výběru
  bodu z plátna už nezakrývá plátno). Na telefonu se systémová klávesnice
  neotvírá ani klepnutím do kódu, ani tlačítky dole – zapíná/vypíná ji jen
  **⌨** (`inputmode`). Oranžová lišta o 20 % nižší. Horní lišta: ☰ soubory |
  ⌒ · G90/G91 (přepočet) · 🔍 · 🔢 · ✓ · **A− / A+** (velikost textu, pamatuje
  si ji) | 🔄 · **☰ vpravo** = pravý panel s položkami bývalého menu ⋮.
  Spodní klávesnice: R I K G2 G3 ⌫ / G0 G1 X Z / G90 G91 Sraž. Zaobl. 123 /
  ;✂ 📋 ; ⌨ ↵ / Kontura · velký ␣ · Bod z plátna (popisek u X
  „poloměr"/„průměr" podle nastavení X displej); dolní **G90/G91** jen zapíše
  značku na začátek řádku (nepřepočítává). **Zpět/Vpřed přežije zavření
  editoru** (30 kroků na soubor, i po 🔄 a novém otevření – předchozí text je
  krok Zpět). Validace: souřadnice bez G po G0 („chybí G1?"), oblouk G2/G3
  bez R/CR/I,K, osa dvakrát v bloku – vše vypínatelné v Nastavení validace.
  SW v348.
- **CNC Editor z Kalkulaček – kontura/polotovar, bod z plátna**
  (uživatel 3. 10. 2026): dole nové tlačítko **✎ Kontura / ✎ Polotovar** –
  ukazuje, co se na kurzoru zadává (podle `STOCK_START`/`STOCK_END` před ním),
  klik vloží příslušnou značku. Tlačítko **🎯 Bod z plátna** zavře editor,
  plátno čeká na jeden klik (nebo „↩ Zpět do editoru"/Esc) a editor se znovu
  otevře s kurzorem na původním místě a vypsanými souřadnicemi (bez klávesnice,
  bez dotazu na přepsání výkresu). U **I** a **K** je malé **(x)** a **(z)**.
  Dlouhý stisk nad kódem v editoru křížek zase NEdělá (vráceno – matl
  označování a zaměřování lupou); ostatní offset-křížek beze změny. SW v345.
- **CNC Editor z Kalkulaček – pořadí nakreslení, stručná hlavička, kurzor
  křížkem** (uživatel 3. 10. 2026): kontura i polotovar jdou v pořadí, jak se
  kreslily (žádné přeřazení); jen segmenty, které na předchozí navazují druhým
  koncem, se otočí, a první segment řetězu podle toho, čím se dotýká dalšího –
  G00 je jen tam, kde kresba skočí. Hlavička (SKICA/Datum/Počet/Průsečíků/Režim)
  se v editoru nepíše, v ABS zůstává jen kód; seznam průsečíků na konci
  zůstal. Dlouhý stisk nad kódem při puštění postaví kurzor na místo křížku
  (bez klávesnice). Ostatní exporty beze změny. SW v344.
- **CNC Editor z Kalkulaček – úpravy z mobilu** (uživatel 3. 10. 2026):
  v liště je „(CAD kal.)", ať jde poznat od dvou dalších editorů; zavření bez
  změny kódu už se neptá na přepsání výkresu; v kódu není `G28`/`M30` (ani
  hláška „Program nekončí M30"); za G0 je poznámka `startovní bod`, za
  úsečkou `Úsečka 1, L=36.577` (čárka mezi pořadím a délkou); okno je přes
  celý displej, horní lišta a ✕ jsou větší, tlačítka dole menší. Dlouhý stisk
  (křížek s offsetem) jde vyvolat i nad kódem v editoru, ne jen na prázdném
  místě. Nové `;@@` v `cncCompact.js` (poznámka k G00). Pravidla testů v
  CLAUDE.md: při práci mimo CAM stačí `npm run test:cad`. SW v343.
- **CNC Editor z Kalkulaček – kontura jako jeden řetěz, značky bloků**
  (uživatel 3. 10. 2026): v editoru měla každá úsečka kontury vlastní
  `G00` + `G01`, protože se tam chain-sort přeskakoval. Teď se kontura řetězí
  i v tomhle režimu → jediné `G90 G00 X.. Z..` na začátku a pak navazující
  `G01` (segmenty nakreslené „pozpátku" se samy otočí). Polotovar už nemá
  prefix `POLOTOVAR —` u každého řádku – kontura začíná značkou
  `; KONTURA_START — kontura (obrobek)`, polotovar zůstává mezi
  `; STOCK_START — polotovar` a `; STOCK_END`. Změna v `runCncExport`
  (`js/storage/fileIO.js`) + nový test `tests/cnc-export-chain.test.js`.
  SW v342.
- **CNC Editor z Kalkulaček – zhuštěný zápis** (uživatel 3. 10. 2026): bez G28
  na začátku, G90 sloučené s prvním pohybem (`G90 G00 X0 Z0`), G0–G3 jen při
  změně, jen měněné osy X/Z, čísla bez zbytečných nul (`R10`), žádné prázdné
  řádky, poznámka objektu za řádkem kódu a zkrácená (`L=9.169`). Souřadnice X
  (zelená) a Z (oranžová) se v editoru barevně liší. Převod G90/G91 píše
  značku jen při změně režimu. Nový `js/storage/cncCompact.js` + test.
  SW v341.
- **Panel Kalkulačky + CNC Editor** (uživatel 2. 10. 2026): Převodník a
  Sinumerik přesunuty z „Další kalkulačky" do hlavní sekce; z hubu Sinumerik
  zmizely dlaždice CAM a Editor, **✏️ Editor** je nově v Kalkulačkách. Editor
  se otevře s kódem z výkresu **v pořadí nakreslení** (nový režim
  `runCncExport({ asDrawn: true })`, nepřepisuje panel CNC KÓD) a po zavření
  se po potvrzení výkres přepíše podle zapsaného kódu. Kreslicí rychlá lišta
  (jen G X Z R I K, velké G0/G1 s popiskem, G2/G3). V editoru místo N+ a LIMS
  tlačítko G90/G91 a `;✂` (zkrátit o poznámky a prázdné řádky / vrátit).
  SW v340.
- **Okno „Zadání objektu" (🔢 Číselné zadání / 📐 Volná kontura) na
  mobilu na výšku** (uživatel 1. 10. 2026): výška polovina displeje
  (50dvh) místo 34vh/44vh — na výšku je výkres stejně menší a formulář
  je takhle vidět celý (🔢 úsečka včetně pole G-kódu bez rolování, 📐
  celý formulář prvku, pole syntaxe se doroluje). Na šířku beze změny.
  SW v338.
- **CAD – horní lišta na mobilu na šířku** (uživatel 1. 10. 2026):
  plovoucí kolečka Dvojklik, ↩/↪, 🔢 (+ schránka), 🧲 a ⊙ jsou naležato
  přímo v horní liště vpravo (výška jako SOU/ABS/R, pevné sloty, mezera
  mezi ↪ a 🔢), „Dvojklik" na jeden řádek. Řádek souřadnic/zoomu je hned
  pod lištou (41 px místo 92 px), takže výkres dostane o ~50 px výšky
  víc — centrování to bere samo (MOBILE_TOP_HUD). Na výšku beze změny.
  SW v338.
- **CAD – panel nástrojů na mobilu na šířku** (uživatel 1. 10. 2026): dva
  pevné řádky — *Výběr, Kóta, Typ čáry, Smaž, Bod … Obdé, ✕* a *Tečna,
  za/zk, Vybarvit, Tužka, Detekce, Profil, př/pl, Oříz, Prodl., ▾*.
  Tlačítka řádku jsou stejně široká a s písmem podle šířky displeje se
  přizpůsobí místo zalamování do dalších řádků (ověřeno 568–900 px).
  Místo dvou rozbalovátek (Úpravy, Více) je na šířku jediné ▾ na konci,
  které rozbalí obě sekce: Přichytit … Rozděl, Spoj vždy na jednom řádku;
  Smaž vše / Kotva / Kóty / ❓ na řádku za Bool, zarovnané vpravo. Na
  výšku a na desktopu beze změny. SW v337.
- **CAM – ▼ spodní panel ve třech krocích** (uživatel 1. 10. 2026): celý →
  **2 řádky** (běžící blok G-kódu + následující, prázdné řádky a komentáře
  se přeskakují) → skrytý → celý. Hlavně pro mobil na šířku. Na mobilu
  (≤ 768 px nebo výška ≤ 520 px) se díl po přepnutí vycentruje — i po
  otočení telefonu (výška ↔ šířka). Klik na dráhu otevírá celý panel jen
  ze skrytého stavu. SW v336.
- **CAM – spodní panel na mobilu** (uživatel 1. 10. 2026). Lišta **Části:**
  je na mobilu (≤ 768 px) rozbalovací pole + ✎/✕ aktivní části místo řad
  chipů — vejde se do jednoho řádku s Část / Celý program / ⛓ Spojit.
  Na výšku zabírá spodní panel (průběh, přehrávač, tlačítka, G-kód)
  polovinu displeje, takže je vidět víc řádků programu (dřív G-kód max.
  200 px). V liště nad G-kódem prohozena tlačítka: 📂 Načíst je před
  ⚙ Nast. Na mobilu má lišta dva řádky (↺ Reset ve druhém) a vpravo přes
  oba vysoké ⚙ Nast. (otvírá pravý panel), pod nimi tlustší čára; na
  desktopu zůstává jedna řada, ↺ Reset je za 🔧 Editor. SW v335.
- **CAM – 🎯 Centrovat podle strany nože.** Volné místo dostane strana,
  odkud jede nůž (radiálně od osy ven podle kvadrantu dílu, axiálně podle
  ▶ zprava / ◀ zleva), v rámečku je i bezpečná poloha (rozšíří ho nejvýš
  o velikost dílu) a nepočítá se plocha pod tlačítky nahoře. Dřív byl díl
  uprostřed — pod osou zbytečné místo a nahoře, kudy jede nůž, nebylo vidět.
  Na mobilu se díl vycentruje i sám po zavření/otevření spodního panelu (▼/▲).
- **CAM – 🔧 Zásobník přehledněji** (uživatel 1. 10. 2026: „udělat pořádek
  ve výběru plátku a držáku"). V panelu Nástroj zůstal jen **🔧 Zásobník**;
  **🧵 Závity** se ukáže jen se závitovým plátkem. **🧰 Knihovna** a
  **🔪 Geometrie** (nová ikona — ⚙️ vypadalo jako nastavení) jsou v hlavičce
  okna zásobníku, nadpis zkrácen na „🔧 Zásobník", vpravo **↩ / ↪**, **☰**
  a odsazený **✕** místo tlačítka Zavřít dole. **📥 Import ze souborů**
  a **🔄 Seřadit dle výchozích** jsou v menu ☰, dole jen 💾 Uložit aktuální
  nástroj a ＋ Přidat nůž. Na úzkém displeji 🧰/🔪 jen ikonou, ať se hlavička vejde do řádku. Nápověda
  „Kliknutím na kartu…" jen nad sbaleným seznamem.
- Změny v zásobníku (pole, tvar, ✅ Použít, smazání, přidání, import,
  seřazení, 💾 uložení) a výběr z 🧰 Knihovny jdou do historie — dřív se
  nedaly vzít zpět. Import více souborů je jeden krok a sloty jdou v pořadí
  výběru (dřív v pořadí dočtení). SW v334.
- **💾 Uložit aktuální nástroj se ptá kam** — okno s názvem a volbou
  🔧 Do zásobníku (celý nůž jako nový aktivní slot; název dostane i aktuální
  nástroj) / 🧰 Do knihovny.
- **🧰 Knihovna ukládá celý nůž** — destičku, držák (i vlastní obrys)
  a řezné podmínky (pole `tool` záznamu = CAM_TOOL_KEYS, jako 💾 Uložit do
  PC). ✅ Použít ho načte celý do aktuálního nástroje i do slotu (🧰 Z
  knihovny); v seznamu značka „⬤/◼/▮/▽ + držák". Starší záznamy a záznamy
  z VBD kalkulačky beze změny (jen VBD, R, úhly, Vc/f/ap).
- **Popisek při dlouhém stisku (mobil)** — žlutá bublina se zarovná na
  střed nad zvýrazněné tlačítko, zalomí celý text a drží se uvnitř
  displeje. Dřív seděla vedle křížku na jednom řádku s „…" a dlouhý popisek
  utekl přes okraj (🔪 Geometrie, 🧰 Knihovna v hlavičce zásobníku).

- **CAM – 🔪 Geometrie nástroje přehledněji** (uživatel 1. 10. 2026).
  Jeden kompaktní přepínač 🔩 Destička | 🗜 Držák místo dvou velkých
  tlačítek; ✕ vpravo nahoře místo Zavřít dole; celý nůž (🔧 Zásobník,
  💾 Uložit nůž — nově se ptá zásobník/knihovna, 💾 Uložit do PC,
  📂 Načíst z PC) v menu ☰. Destička: VBD + 🔩 Dekodér v jednom řádku,
  ↻ Natočení destičky vedle ⇄ Přehodit stranu, užší pole Délka/ε/R
  a širší natočení s ✛. Držák: 📐 Kreslit na CAD vedle přepínače,
  ✏️ Kreslit obrys / 🗑 Smazat obrys / 🔧 Upravit obdélník v jednom řádku,
  Editor obdélníku a nápověda kreslení jen když jsou zapnuté.
  Na mobilu okno nafukovalo obecné „.input-dialog button { min-height:
  40px }" (i ＋/－/⟲ náhledu a bubliny úhlů — byly z nich ovály) a ✛ vedle
  pole přetékalo pod něj (spodní okraj polí 10 px) — obojí srovnáno.

### Added
- **▲ ▼ na kartách zásobníku** (vedle sebe, vlevo) — posun nože o místo
  výš/níž; pozice = T, takže se se sousedem prohodí místo i číslo T.

### Fixed
- **CAD – mobil na šířku, dodělávky po kontrole** (1. 10. 2026): červené
  ✕ Zrušit (při kreslení) je na řádku souřadnic vlevo — na původním místě
  by po posunu souřadnic nahoru viselo nad výkresem. Tlačítka v horní
  liště mají dotykovou plochu přes celou výšku lišty (vidět 26 px).
  Schránka kalkulačky zkrátí dlouhé číslo na „…" místo useknutí. Lišta
  nástrojů a horní lišta respektují výřez kamery na boku (safe-area).
  Po otočení telefonu se sekce Úpravy srovná s jediným ▾. SW v339.
- **CAM – „Hlídat geometrii (destička + držák)" u všech plátků** (uživatel
  1. 10. 2026, mobil). Zaškrtávátko se kreslilo jen u polygonu, ačkoli
  hlídá i DRŽÁK u každého tvaru. S kulatou destičkou na čistém prohlížeči
  (výchozí vypnuto) tak nešlo zapnout a dokončování zprava sjelo po levém
  čele až k ose X0 — držák skrz díl a celých 9 mm nevyhrubovaného
  polotovaru naráz. Teď je vidět u kulaté, polygonu, upichováku i závitového
  a **výchozí je zapnuto** (uložené projekty si drží svou hodnotu; prohlížeč,
  který už má uložené „vypnuto", je potřeba jednou zaškrtnout).
- **CAM – plátek si pamatuje hrubování (Podélně / Čelně)** (uživatel 1. 10.
  2026). Kulatá podélně → upichovák (umí jen čelně) → zpět na kulatou
  nechávalo čelní. Teď si každý tvar plátku drží svou strategii vedle
  geometrie a při návratu ji dostane zpátky; upichovák jede vždy čelně.
- **CAM – odkazy na slot po smazání / seřazení.** Smazání slotu posouvalo
  jen aktivní a rozbalený slot, ne **dokončovací nůž** (`finishingSlot`)
  ani sloty v částech programu — dokončování pak ukazovalo na jiný nůž.
  🔄 Seřadit navíc aktivní slot zahodilo. Teď smazání, seřazení i ▲▼ jdou
  přes `_reorderMagazine`, které odkazy indexem přenese na tytéž nože;
  dráhy hlásí neaktuálnost jen když se dokončovacímu noži změnilo T.
- **CAM – ✏️ Upravit slot po ↩ Zpět.** ↩ nahrazuje zásobník kopií ze
  snímku, takže odkaz na upravovaný slot vedl do starého pole a úpravy
  z 🔪 Geometrie se při zavření do slotu nezapsaly. Odkaz se teď přenese
  na slot na stejném místě. Zásobník ani Geometrie otevřené jedno z druhého
  už nezakládají druhé okno — otevřené se vytáhne nahoru.

### Added
- **CAM – celá závitová destička v simulaci.** Dřív se kreslil jen zub
  (lichoběžník 4 mm). Teď simulace, ⚙️ Geometrie i 📐 kreslení na CAD
  ukazují rovnostranný trojúhelník 16ER/IR (hrana 16 mm,
  `THREADING_INSERT_EDGE_MM`) se zubem v každém ze tří rohů — profil podle
  zvoleného závitu (60°/55°/30°/29°, ploché dno Tr/Acme). Pracovní zub
  plně, zbytek světle. Výpočet beze změny (`buildInsertProfileSegments`
  pro závitový dál `[]`). 📐 CAD má u závitového konečně obrys, ke kterému
  se dá držák kreslit (dřív hláška „nemá obrys").
- **CAM – polygonální destička má rádius ve všech rozích** (uživatel
  1. 10. 2026: „jak vypadá ve skutečnosti plátek"). Celý obrys
  (`buildInsertOutlineSegments`) zaobluje R každý roh — u čtverce/kosočtverce
  čtyři, u trojúhelníku ε 60° tři; dřív jen špičku a protější roh. Řezná část
  pro výpočet beze změny (ostré rohy na koncích hran), kreslí se oříznutá
  celým obrysem, ať z rohů nevyčnívá. Oblouk rohu smí zabrat jen tu část
  hrany, kterou nechal rádius špičky — při velkém R (např. R10 po kulaté) se
  jinak oblouky překryly a obrys se zkřížil (test `velký R`). SW v333.
- **CAM – celá polygonální destička v simulaci.** Simulace, ⚙️ Geometrie
  i 📐 kreslení na CAD ukazují celý kosočtverec/čtverec (s R i v protějším
  rohu), ne jen trojúhelník špičky. Plně řezná část, zadní půlka světle.
  Výpočet zůstává na řezné části (`buildInsertProfileSegments`), celý obrys
  je jen pro kreslení (`buildInsertOutlineSegments`, `drawPolygonInsert`):
  zadní půlka neřeže a sedí v lůžku držáku (uživatel 30. 9. 2026). Změřeno:
  dána do výpočtu by pohnula `part-19-face-tilted-insert` (průchod o 0,8 mm,
  úběr −39 mm²) — obrys tam slouží jako řezná část (dosah hrany, úběr, odečet
  od kolize držáku). Takhle otisk G-kódu shodný u všech 29 fixtures.
  ε 60° (trojúhelník) je celý už sám, kód W (trigon) se nedokresluje.
  Simulace kreslila polygon vlastní kopií vzorců, která **ignorovala ⇄ Přehodit
  stranu** — ukazovala destičku jinak, než se s ní počítalo; teď kreslí ze
  sdílených segmentů (i čárky úhlu hřbetu α se s ⇄ překlápějí).
- **CAM – přednastavený rádius při přepnutí plátku.** Kulatá R10,
  polygonální R1,2, upichovák R0,5 (`SHAPE_PRESET_RADIUS` v camDefaults.js),
  v panelu, okně Geometrie i ve slotu zásobníku. Platí i přes paměť tvaru
  (dřív se kulaté vracelo výchozí R0,8). VBD dekodér R z kódu dál přepíše. SW v332.
  Spolu s rádiusem se dosadí i **posuv F a řezná rychlost Vc** podle tvaru
  (kulatá F0,15/Vc180, polygon F0,25/Vc200, upichovák F0,08/Vc120, závitový
  F1,5/Vc100; ap zůstává) — tabulka `SHAPE_CUT_DEFAULTS` v camDefaults.js,
  kterou dřív měl jen import nožů do zásobníku (`MAG_CUT_DEFAULTS_BY_SHAPE`).
- **CAD – zdvojené čáry: žluté vyznačení a nabídka smazání.** Nález uživatele
  30. 9. 2026: hláška „kontura se větví", ale na výkrese nebylo nic vidět —
  šikmý bok Z243→Z235 byl nakreslený dvakrát přesně přes sebe.
  `findContourDuplicates()` (stockTools.js) najde úsečku/oblouk, který kryje
  jinou čáru kontury (stejné konce i střed oblouku). Plátno ji kreslí žlutě
  „2× přes sebe" a `dialogs/contourCheck.js` na ni přiblíží a nabídne
  **Smazat kopii** (maže se později nakreslená; kóty se přepojí na tu, co
  zůstává; jeden krok Zpět). Okno je průhledné a dole, ať je místo vidět.
  Nabízí se jednou pro každé nové zdvojení, ne po každé úpravě výkresu.
  Kdykoli později stačí v režimu Výběr **kliknout na žlutou čáru nebo popisek
  „2× přes sebe – klikni"** (myš i dotyk) a nabídka smazání té kopie se
  objeví znovu (`offerDuplicateAt()`; zásah se měří na nepřichycené poloze,
  ať klik na sousední čáru u společného vrcholu dál normálně vybírá).

### Changed
- **Do CAM jde jen hlavní souvislý profil** (na přání uživatele 30. 9. 2026:
  *„nemělo by se přenášet jenom jeden profil z CAD do CAM?"*). Dřív CNC export
  poslal do CAM každý nenapojený kus za `G0` jako součást kontury (zdvojenou
  úsečku, osamocené čáry, body). `runCncExport({ forCam: true })` teď vezme
  jen nejdelší řetěz bez zdvojených čar a bodů. Zbude-li mimo něj něco, CAD
  to před otevřením CAM vyznačí fialově „mimo profil" a zeptá se (u profilu
  s mezerou by jinak do CAM potichu odešla jen jeho část). Panel CNC KÓD
  exportuje dál celý výkres.
- **CAM – lišta nad G-kódem ukazuje jen použitelná tlačítka** (na přání
  uživatele 30. 9. 2026: *„někdy mi funguje jedno a podruhé zas to druhé"*).
  **🔄 Dráhy** se skryje v náhledu celého programu (tam jen hlásilo „přepněte na
  Část"), **✂ Po úsecích** je vidět jen když má díl úseky v rozsahu obrábění
  (dřív hlásilo „Úseky nejsou"), **↺ Reset** jen s částmi programu. Podmínka
  viditelnosti je tatáž funkce, kterou tlačítko samo používá
  (`sectionSteps()`, `updateGenButtons()` v camSimulator.js).
- **CAM – ⏳ přesýpací hodiny při generování drah.** „🔄 Dráhy" i „✂ Po úsecích"
  ukážou přes okno simulátoru hodiny s popisem (u úseků i „Úsek 2 (2/3)…")
  a blokují klikání i Ctrl+Z, dokud výpočet neskončí (`withBusy()`).
- **CAM – generování drah ~2× rychlejší, program beze změny.** Dotaz na horní
  hranu smyčky (`topXOnLoop`) se v emisi (`noseFrontClear`) a ve vrstvách
  pravidla 7 (`hasMat`) volal milionkrát nad offsetem kružnice nosu s tisíci
  vrcholy a pokaždé procházel celou smyčku. Nový `topXOnLoopFn()` (camMath.js)
  hrany předem roztřídí podle Z a vrací bitově shodný výsledek. Díl uživatele
  (projekt_2026-09-29 (9)): výpočet 1,12 → 0,55 s, emise 1,46 → 0,58 s.
  Otisk G-kódu shodný u všech 29 fixtures i 60 dílů uživatele.

### Fixed
- **Přepnutí na závitový plátek už nedosazuje posuv F 1,5** (z 30. 9.).
  Pole F je posuv HRUBOVÁNÍ — závit jede F = stoupání (`ops/thread.js`)
  a F nečte, zato hrubování závitovým nožem by jelo F1,5 mm/ot. Dosadí se
  jen Vc 100; F zůstává (panel i slot zásobníku).
- **VBD dekodér: kulatá destička dostane R = IC/2.** Rádius se bral z poz. 7
  (rádius špičky), kterou kulatá nemá (RCMT 1204M0 → „M0" = nic) — R zůstal
  z předchozího tvaru, nově by zůstala předvolba R10. Teď ⌀ z poz. 5 / 2 (R6).
- **Zásobník: přepnutí tvaru ve slotu = stejné výchozí hodnoty jako v panelu.**
  Polygon z upichováku zůstával s hranou 5 mm a natočením 0°, závitový si nesl
  R předchozího tvaru (holderSeatZ z něj posadí držák jinam). Hodnoty dosazuje
  `_setMagSlotShape`, takže platí i pro import z VBD dekodéru do slotu.

- **CAM – kulatá destička: zanoření navazuje a konec dna bez odskoku**
  (nález uživatele 30. 9. 2026, díl (9), R 10 zleva, v „✂ Po úsecích" i v
  „🔄 Dráhy"). Rampa nezačínala na konci předchozího zanoření, ale o 0,5 mm
  dál (`N4370 G1 X38.095 Z262.325`, `N5030 G1 X13.095 Z356.768`): řetěz
  ramp se zakládal jen za RAMPOU, ne za sjezdem po stěně pod týmž úhlem
  (`rule7Layers.js`, `plungeLineEnd`; do vzduchu za koncem polotovaru se
  řetěz nenatahuje). A vrstva na dně (`N4860 G1 Z350.188`) odskočila,
  vrátila se a další vrstva se zanořovala z úrovně nad dnem — v celém
  programu dokonce vjela po stěně přes celé dno znovu (70 mm posuvem). Nový
  `ops/long/rule7FloorJoin.js`: vrstva na dně skončí, kde stěna ze dna
  sjíždí, a bez odskoku po ní sjede na hloubku ap a jede do konce. Pohnul se
  jen `part-22-round-r10` (+2 vrstvy u konce polotovaru, pravidla beze
  změny). Test `cam-round-left-floor-chain`.
- **CAM – kulatá destička: zahlazení schodků a navázání průchodů** (nález
  uživatele 30. 9. 2026, díl (10), „🔄 Dráhy"). (1) Vrstvy u svislé stěny
  (`N3500 G1 Z194.499`) nezahladily schodek nahoru a spodní jen do X 27,744:
  emise ořezávala dojezd na hranu polotovaru podle sloupce pod STŘEDEM nosu,
  kde leží nízký polotovar — bok nosu R 10 přitom bere vysoký za čelem. Nový
  klíč plátku `leadOutTrimNoseCircle` (jen kulatá): ořez podle celé kružnice
  nosu (`gcodeEmit.js` `trimLeadOutToStock`). Totéž teď zahladí schodky
  vrstev u čela dílu na levém konci. (2) Vrstva na schodu X 40,676 dojela
  schodek jen do X 42,020 místo k mělčí vrstvě X 43,045 — okno plošiny
  utínalo stěnu (`rule7Layers.js` `floorWindowRuns`). (3) Mezi dvěma sjezdy
  u meze úseku 1 odjezd a návrat na totéž místo (`N2570 … Výjezd v X`,
  `G0 X47.730`, `G1 X46.618`) — průchod, za kterým další začíná na jeho
  konci, teď jede bez odskoku. Pohnul se jen `part-22-round-r10` (dojezdy na
  stěně u Z 148; zbytek u Z 136–138 z 0,60 na 0,23 mm; kontrola tam nově
  počítá jednu „tenkou vrstvu" — vrstva za zahlazeným schodkem bere 1,96 mm
  místo 2,5). Test `cam-round-left-full-steps`.
- **CAM – „Generovat" celého programu vynechával vrstvy, které „✂ Po úsecích"
  má** (polygon; nález uživatele 30. 9. 2026, podélně zleva). Hlídání spodní
  hrany destičky u pravých stěn kapes (`ops/long/insertFlankGuard.js`) bralo
  za stěnu rampu z KTERÉHOKOLI úseku: rampy X 48,045 / 45,545 v úseku 3
  posunuly kotvy v úsecích 1, 2 i 4 o desítky až stovky mm, průchody
  zdegenerovaly a zmizely — chyběla vrstva X 29,566 v úseku 1 (pod
  `N2520 G1 Z79.311`), vrstva X 39,118 za hrbem v úseku 2 (pod
  `N1620 G1 Z143.635`) a nejhlubší vrstvy u čela v úseku 4. Stěna se teď
  bere jen na dosah hrany (`toolLength · sin(natočení)`) a jen když neleží
  za koncem průchodu; výška stěny se měří od začátku rampy, ne od hloubky
  průchodu (jinak se krok řetězu ramp odsunul o 0,07 mm a nájezd další
  vrstvy svisle řezal). Díl uživatele: třísky > ap 6 → 1, 0 kolizí; fixtures
  part-4/6/8/9, part-21 a pocket-wall-at-plunge-angle dostaly zpět smazané
  průchody (hláška „N průchodů zkráceno" tam hlásila právě tohle). Test
  `cam-polygon-left-foreign-wall`.
- **CAM – „🔄 Dráhy" obrábí úseky po řadě jako „✂ Po úsecích" (pravidlo 8)**
  (nález uživatele 30. 9. 2026, polygon zleva, díl (6) proti (7)).
  `ops/long/regions.js` pořád řadil úseky podle zrušeného pořadí z 27. 8.
  („největší průměr napřed"): Ú3 → Ú2 → Ú1 → Ú4. Úsek 2 se tak obráběl vedle
  ještě stojícího polotovaru úseku 1 — v údolí přibyla zbytečná rampa
  `N1980 G1 X28.981` a chyběla poslední vrstva se zanořením (X 14,94).
  Teď Ú1 → Ú2 → Ú3 → Ú4 od strany, odkud se obrábí. Pohnulo se 11
  polygonových fixtures: P7 a P8 ubyla všude, kolize 0, zbytek stejný nebo
  menší; `pocket-wall-at-plunge-angle` má jedno P6 navíc — otevřené: úsek
  vpravo je hotový dřív, rampa v údolí začne víc vpravo a spodní hrana
  plátku při svislém nájezdu k ní zajede do šikminy polotovaru (začátek
  rampy se proti polotovaru spodní hranou zatím nekontroluje).
- **CAM – vrstva za hrbem vjíždí po stěně, ne rampou (pravidlo 10, bod 1)**
  (týž nález). Vrstva X 39,118 za hrbem úseku 2 vjížděla rampou 15° od
  Z 132, stěna tam ale klesá asi 10° a mezi nimi zůstal klín 0,5 mm.
  Nový `ops/long/wallEntry.js`: v otevřeném intervalu (`pocketPass.js`) se
  napřed zkusí vjezd po stěně od podlahy mělčí vrstvy (10° po kontuře, pak
  15° po čáře spodní hrany na hloubku ap) a teprve potom rampa. Pokračování
  15° čáry pod vrstvou dobere uzavírací rampa (X 38,57 — „Po úsecích" měl
  X 38,485). Použije se jen kde je stěna aspoň kus mírnější než úhel
  zanoření (jinak je to táž rampa) a podlahu dává obyčejná vrstva, ne článek
  řetězu ramp.
- **CAM – X max je strop pro jakékoli obrábění (nové pravidlo 12).** Na přání
  uživatele 30. 9. 2026: nad X max se neobrábí a pod materiál, který nad X max
  stojí, se nepodjíždí. Díl uživatele (X max 27,01): podélné hrubování dřív
  jelo X 20,6…13 až na Z 245 pod sloupem polotovaru vysokým 64,5 a čelní
  (kde se X max vůbec nevynucovalo) bralo celý sloup od X 64,5. Teď se
  obrábí jen od volného konce po místo, kde polotovar vyleze nad X max
  (Z 269,63) — ta „stěna" se stane hranicí rozsahu Z, takže podélné, čelní,
  zleva i dokončování ji respektují stávající logikou (pravidlo 11); 0 kolizí.
  Nový `cam/rangeX.js` (`xMaxWallZ`, `resolveRangeX`), test `cam-xrange`
  (+ fixture `tests/fixtures/cam-xrange/xmax-wall.camprog`). Otisk G-kódu
  shodný u všech 29 fixtures. `cam-face-range` upraven: případy, kde polotovar
  sahá nad X max už na kraji, testují jen dno (X min).
- **CAM – rozsah X: každá mez má vlastní zaškrtávátko** (jako Čelisti Z / Koník
  Z), takže jde vypnout bez mazání hodnoty. Zároveň oprava: samotné X max
  (nebo samotné X min) se dřív tiše ignorovalo — `machiningRangeX` vznikl jen
  s OBĚMA mezemi, čip „X" přitom svítil a čára se kreslila. Starší projekty
  bez přepínačů mezí berou společné `active`.
- **CAM – pravý panel: kontrola 30. 9. 2026.**
  - „Vymazat vše" (meze Z/X) dráhy nepřepočítalo — náhled i ⚠ hlášení zůstaly
    podle smazaných mezí. Teď `applyChange()`; zaškrtávátka čelistí, koníku
    a rozsahu Z jdou stejnou cestou (dřív `fullUpdate`, v cyklu upich/závit
    tedy bez přegenerování programu).
  - Konstrukční čáry z hlídání destičky (`fromInsert`) se mazaly jen při změně
    polí panelu. Výměna tvaru, ⇄ strana, přepnutí strategie (znaménko
    natočení), 🧰 Knihovna ani VBD dekodér je nemazaly, takže dráhy dál omezovaly
    čáry předchozí destičky. Jeden helper `dropInsertGuides()` pro všechny.
    🧰 Knihovna navíc volá `applyChange()` jako pole panelu.
  - Vymazané pole „Z upich" dávalo upichnutí na Z0; teď upichnutí zruší.
  - Název nástroje s uvozovkou rozbil pole (hodnota bez escapování); totéž
    názvy v zásobníku, VBD kód v čipu a název části v potvrzení smazání.
  - Import G-kódu ukazuje, kam importuje (kontura / polotovar dle Editoru);
    import do polotovaru přepne na vlastní tvar (u válce se jinak nepoužil).
  - 🎯 Auto-rozměr polotovaru jde vzít zpět (↩).
  - Náhled drah se při prázdném programu vyprázdnil přímo v keši — po
    ↪ Znovu (Reset → 🔄 Dráhy → Zpět → Znovu) pak dráhy chyběly.
- **CAM – „✂ Po úsecích" už nepřepisuje X max uživatele.** Úseky se dnem si
  nastavovaly X max 1e4 a X min na dno úseku; teď se dno skládá s X min
  uživatele (platí vyšší) a X max zůstává. Rozsah Z dál vyžaduje obě meze.
- **CAM – uzavírací rampa navazuje na konec předchozího zanoření, nebere to
  „zvrchu".** Nález uživatele 30. 9. 2026 (`projekt_2026-09-30.camprog`,
  úsek 2): `N2870 G1 X41.730` na Z 124,404 + `N2880 G1 X37.197 Z107.486 ;
  Rampa 15.0°` — o celou ap výš, než kde skončilo předchozí zanoření
  (X 39,23 Z 115,074), takže 9,3 mm posuvem po už vyříznuté přímce
  (pravidla 5 a 10.3). Rampa dobíracího řetězu se prodlužovala podle
  polotovaru PŘED úsekem, který neví, co z té přímky už sjela mělčí vrstva.
  Nově se na konci plánování srazí na zbývající materiál podle průchodů
  provedených před ní (`ops/long/rampOverCut.js`); teď `G0 Z115.074`,
  `G1 X39.230`, rampa. Na 29 fixtures: úběr i kolize (0/0) beze změny,
  porušení P5 (posuv vzduchem) o 7 méně, žádné nové; test
  `cam-ramp-completion-over-cut`.
- **VK (volná kontura) – dopočet jako Heidenhain FK: zadané údaje se už
  nezahazují.** Na pokyn uživatele 30. 9. 2026 (*„mělo by to být dělané jako
  FK u Heidenhain systému"*):
  - **PA + jedna souřadnice konce** (`G11 X20 Z? PA45`) se dopočte hned při
    vložení – konec je průsečík úhlu se zadaným X (resp. Z), obdoba
    `FL X.. AN..`. Dřív šel prvek do fronty a zadané X se při dopočtu
    ignorovalo: v textu zůstalo `X20 Z-15`, ale počítalo se s bodem X−5.
    Konec proti směru PA se dopočte s upozorněním, rovnoběžný úhel nebo
    nulová délka se odmítne (`solveAngleAndCoordinate()` ve vkSolver.js).
  - **Samotné X (Z?) nebo Z (X?)** je konec prvku, ne poloha kotvy –
    `elementRay()` vede paprsek po zadané hodnotě. Po bodu X10 dával
    `G11 X20 Z?` roh na X10, přestože text říkal X20.
  - **PA + PR bez X/Z** (obdoba `FL AN.. LEN..`) je plně určený prvek:
    konec se dopočte hned a řetěz za ním pokračuje. Dřív zůstal ve frontě
    neznámých a nic za ním se už nedopočítalo.
  - Dopočtený bod se zapisuje do CELÉHO řádku (`replaceVkLine()`), ne do
    prvního výskytu podřetězce – nedořešené `G11 X? Z? PA180` přepsalo
    starší řádek `G11 X? Z? PA180 PR10`, který ho obsahoval.
  - **PR (polární rádius) je vždy skutečná délka**, i když je X zobrazené
    v průměru. Složka PR v ose X se v režimu průměr zdvojnásobí (převod
    přes `displayX()` v jediném `polarDelta()`), takže `PA90 PR10` zvětší
    poloměr o 10 mm. Dřív se přičítala přímo k průměru a poloměr se změnil
    jen o polovinu. Platí pro náhled, dopočet, vložení do výkresu i převod
    na ISO.
  - **Dopočet po prvku X/Z + PA/PR v režimu průměr** (doplněno 30. 9.):
    formulář počítal navazující bod z X v poloměru, ale polární přírůstek
    už v jednotkách textu, takže `G11 X20 Z0 PA90 PR10` posunulo řetěz
    o 20 mm místo 10. Teď týmž výpočtem jako náhled.
  - **Tečný oblouk (T) při převodu na ISO v režimu průměr**: směr úsečky
    a konec oblouku se počítaly z textových X (průměr) jako z poloměru —
    oblouk vyšel jinde, než ho ukazoval náhled. Počítá se v poloměru.

### Changed
- **CAM – kulatá destička: jeden postup pravidla 7 místo oprav po kouscích.**
  Na pokyn uživatele 29. 9. 2026 (*„chce to jednotnou jednoduchou logiku
  a pravidla"*, díl projekt_2026-09-29 (6)) staví podélné hrubování kulaté
  destičky nový modul `ops/long/rule7Layers.js` podle upřesnění pravidla 7
  v docs/cam-pravidla.md: vrstvy shora po ap; první vrstva, která narazí na
  hotovní konturu (čelo, hrb), ji kopíruje a jede až na konec; pak se po
  vrstvách dodělá všechno před dotekem až dolů a stejnou logikou se
  pokračuje za ním. Díl (6): úsek 1 — X 39,118 vyjede po čele a jede do
  konce, levý konec (odlitek Z −8…0) se dodělá po vrstvách (o 233 mm² víc
  než dřív), X 36,618 přejede hrb jedním průchodem, vybrání se dobere až na
  dno a údolí jde od stěny dolů; úsek 2 ubere stejně. Obě části 0 kolizí,
  žádné zanoření strměji než 45°. Vjezd nesmí sáhnout do skutečného
  materiálu za začátkem oblasti (stěna zbytku po úseku 1). Emise: rampa
  kulaté jede rychloposuvem jen tam, kde je kružnice nosu volná až po
  KONEC rampy (materiál pod okamžitým spodkem nosu se nepromíjí). Nájezd po
  vodítku, který na vrstvu nedosedne (uzavírací čelo k ose), dojede pod
  úhlem zanoření, ne svisle. Starý postup: `prms.rule7Layers = false`.
  Kontrola pravidel (scripts/cam_rules_check.mjs) nově měří P7 „vrstva přes
  hrb vcelku", třísku podle skutečného úběru a zbytek i za konci dílu.
  Nálezy uživatele na dílech (7) zleva a (8) zprava (29. 9. večer):
  kde vrstva začíná, jestli je před ní vzduch a jestli je sloupec volný,
  rozhoduje SKUTEČNÝ polotovar — plánovací obrys s vůlí jen o tom, kde
  končí rychloposuv. Vrstvy tak nezačínají ve vůli zbytku po úseku 1
  (rampa vzduchem u hrbu a pak `G0 Z184.183` celým údolím), nerampují
  3,5 mm vzduchem u stěny a vrstva, která jen setře setiny po vrstvě na
  schodu, se nevydá. Plošina na vrcholu hrbu, přes který vrstva přejede, se
  nejede zvlášť (dřív `X37.576` za kruhovým vybráním před vrstvou od
  začátku). Na mezi úseku končí vrstva s krátkým tělem bez úběru na konci
  nájezdu — bez rychloposuvu k mezi a šikmého návratu („taneček"). Začátek
  rampy musí jít dosáhnout rychloposuvem (plánovací obrys nad ním nejvýš
  o vůli). Díl (9) zleva, údolí úseku 2: úsek vrstvy je materiál, jen když
  ze skutečného polotovaru uvnitř úseku opravdu něco ubere (ne pouhý dotek
  strmé stěny zbytku po úseku 1), a když vjezd s tělem až k dalšímu
  materiálu nic neuberou, vrstva začne až u něj — vrstvy X 33,095 … 28,095
  už nevjíždějí rampou u hrbu a nepřejíždějí údolí (`G0 Z154.272`), začínají
  u příruby; první zanoření do dna je X 25,595. Úběr beze změny.
  Otisk: změnil se jen `part-22-round-r10` (pravidla 31 → 26).

### Added
- **Trigonometrie – 🔢 Kalkulačka a ⤓ Vložit výsledek.** Otevře vestavnou
  kalkulačku; poslední výsledek („=" nebo funkce) vloží do vybraného pole
  (bez výběru do prvního prázdného). Výsledek kalkulačky přežije i zavření
  okna (ANS po novém otevření navazuje).

### Fixed
- **CAM – otočená osa X (⇅ X+ dolů) už nemění hlídání geometrie destičky.**
  Kvadranty pod „Řídicí systém" (osa X nahoru/dolů, osa Z vpravo/vlevo) jsou
  pohled a konvence výstupu (G2↔G3); výpočet běží ve světě. Úhlový rozsah
  destičky a mez zanoření kulaté se ale podle `flipX` zrcadlily (pozůstatek
  první verze z 10. 6.), takže s X+ dolů hlídání počítalo s jiným nožem, než
  jaký se kreslí a kontroluje — díl (13) podélně zprava 47 mm² a zleva
  107 mm² zajetí + 11 kolizí, s X+ nahoru nula. Teď všech 16 kombinací
  (4 kvadranty × podélně/čelně × zprava/zleva) dává tytéž dráhy a G-kód se
  liší jen prohozením G2↔G3; komentář „Průchod N (oblouk G3)" se prohazuje
  s ním. Hlídá `tests/cam-quadrants.test.js`.
- **CAM – čelní hrubování ZLEVA hlídá geometrii destičky zleva.** Nález
  uživatele 30. 9. 2026 (polygon R1, −15°, díl (13)): plátek se v náhledu
  otočil, ale hlídání geometrie (úhlový rozsah destičky, mezní čáry,
  obrobitelná kontura) zůstalo pro pravý nůž — mezní čáry zleva byly shodné
  se zprava a nůž zajel do hotového dílu 468 mm². Čelně zleva se teď počítá
  ve stejném Z-zrcadle jako podélně zleva (`mirrorsWorldZ`), v zrcadle je to
  obyčejné čelně zprava. Díl (13) zleva: 0 zajetí, 0 kolizí; zprava beze
  změny. Emise zleva bere zrcadlený držák i obrácené dokončování. Navíc:
  čelní průchod už nesjíždí pod konec řezu, když ho hlídání zvedlo nad
  rychloposuvovou výšku (part-18 zleva, kulatá R8: držák 2 × 56 mm² ve
  stěně). Otisk: pohnul se jen part-20 (upichovák zleva) — levé čelo
  odlitku se zarovná k ose jako zprava, úběr +140 mm², kolize 0.
- **CAM – zbytek po kulaté destičce je oblouk, ne lomená čára.** Model úběru
  (simulace, validátor, obrobený polotovar pro „➕ Operace" / „✂ Po úsecích")
  kreslil nos kulaté destičky 12 úsečkami na půlkruh — u R 10 tětivy 2,6 mm
  s průhybem 0,085 mm. Zbytek v rohu tak byl mnohoúhelník a proložení
  obrobeného polotovaru (tolerance 0,05 mm) ho nechalo jako řadu úseček
  (nález uživatele 30. 9. 2026, body S30–S36). Nový klíč plátku
  `footprintChordTol` (jen kulatá, 0,02 mm) zjemní kružnici nosu v modelu
  úběru; roh vyjde jako jeden `G2 … R9.95`. Plánovací obrys drah zůstal —
  G-kód se nezměnil u žádné z 29 fixtures. Validátor u velkého čelního dílu
  s R 8 počítá o ~0,3 s déle.
- **CAM – poslední (tenčí) vrstva na dno údolí zase vzniká.** Od sjednocení
  generátoru 25. 9. 2026 (7d9cbd6) chyběla u řetězu ramp v údolí poslední
  kratší vrstva na dno (pravidlo 3): uzavírací bisekce v `roughLong.js`
  brala jen interval otevřený přesně od vjezdu nebo prázdný sken, a interval,
  u kterého kousek u hranice úseku ještě bránil offset stěny, zahodila.
  Na `holder-casting-slanted-face` zůstalo na dně 0,19 mm a dokončení tam
  vjelo kolmo. Nově se krok vydá i do intervalu, do kterého přímka zanoření
  z kotvy dosedne (`landWindow`). S tím dvě navazující opravy:
  `unpairOrphanChainSplits` (`ops/long/chainRelink.js`) zruší zkrácení
  uzavíracího kroku, když hlubší průchod, na který měl navázat, z pole
  vypadl (part-21: krok useknutý za čelem, za ním 1,44 mm materiálu); a
  dojezd kroku, který skončil o držák, nezačíná v plánu pod jeho hloubkou
  (model zbytku strategie jinak počítal s dipem, který emise nevydá).
  Změřeno: 6 fixtures, zbytek na dně všude menší, kolize a tříska beze změny;
  díly uživatele 26.–29. 9. bajt po bajtu stejné, ze starších 44/341
  změněno, na všech ubylo zbytku (celkem −17 %).
- **CAM – dokončení se nezanořuje kolmo do zbytku po hrubování.** Když
  koridor nájezdové rampy nebyl volný, dokončení na začátek řetězu sjelo
  svisle — i tehdy, když v cílovém bodě stál klín, kam se při hrubování
  nevešel držák (`holder-casting-slanted-face`: `G1 X11.084` do 1,14 mm při
  přídavku 0). Pravidlo uživatele 30. 9. 2026: *„sjet jenom to, co jde,
  z místa, odkud to jde"*. `finishEmit.js` posune začátek řetězu po přímce na
  první místo, kde zbytek klesne na přídavek + 0,2 mm (oblouk celý, nebo
  vůbec), a vynechané hlásí ⚠. Na dílech uživatele se mění 11 z 356 souborů
  a ve všech vynechaných kusech bral nůž dřív víc než přídavek (0,83–3,40 mm);
  díly 26.–29. 9. beze změny. Průjezd zbytkem UPROSTŘED řetězu (strop ap
  z `finDeepCut`) se tím nemění.
- **Testy: čtyři testy měřily vědomě změněný model.** `cam-guide-to-stock-end`
  (mezní čára končí na offsetové čáře polotovaru, a26d1f7),
  `cam-leadout-step` + `cam-pocket-burst-depth` (první rampa dorampování
  začíná záměrně na povrchu — tříska se teď měří na modelu úběru,
  `tests/helpers/rampChip.mjs`), `cam-finish-holder` zpětné řezy (upichovák
  hrubuje čelně, `enforceInsertStrategy`).
- **CAM – kulatá: nájezd posuvem jen o Vůli Z, vrstva u stěny údolí.**
  Nálezy uživatele 29. 9. 2026 odpoledne (projekt_2026-09-29 (4), úsek 1):
  nájezd před vrstvou jel o Vůli Z + R, přestože začátek vrstvy kulaté už
  R obsahuje (sken kružnicí nosu) — `G0 Z101.617 / G1 Z143.003` 11 mm posuvem
  vzduchem před šikminou odlitku, kdežto rychloposuv uvnitř řezu končil
  přesně na offsetové čáře (`G0 Z97.849 / G1 Z107.050`). Kvůli R navíc padlo
  místo nájezdu vrstvy X 29,118 u pravé stěny údolí o 11 mm vlevo do protější
  stěny a vrstva se vynechala — X 26,618 pak brala dvě vrstvy naráz (38,8 mm²
  na 7 mm; kontrola P3 to neviděla, materiál ležel před nosem, ne pod ním).
  Teď rychloposuv končí Vůli Z před místem, kde se přední půlka kružnice
  nosu dotkne offsetové čáry — na začátku vrstvy i uvnitř řezu; kontroly
  držáku při nájezdu měří totéž místo (`entryApproachDz` v camMath.js, klíč
  plátku `approachFromNoseContact`, jen kulatá). Úběr beze změny, vrstvy
  u stěny údolí po ~19,7 mm², posuv −23 mm. Otisk: změnil se jen
  `part-22-round-r10` (body zastavení rychloposuvu, pravidla 31 → 30).
- **CAM – kulatá R 10 zleva: vjezdy vrstev bez strmých sjezdů a bez
  opakování projeté dráhy.** Nálezy na dílu uživatele 29. 9. 2026
  (projekt_2026-09-29, „✂ Po úsecích"):
  (1) úsek 2 — vrstva X 5,595 jela nájezdem přes celý díl (`G1 X19.243`
  kolmo, 13 mm² do klínu u stěny drážky, pak 23 + 21 + 58 mm posuvem po
  hotovém) a vrstvy u čela sjížděly po offsetu čela 84° (`G1 X13.095
  Z355.532` a další). Nájezd, který by sjel do materiálu strměji než úhel
  zanoření nebo k jehož začátku se musí zapíchnout, se nahradí rampou 45°
  ze začátku vrstvy o ap výš — řetěz ramp podél mezní čáry čela; klín pod
  ní zůstává (pravidlo 6). Vodorovný zasypaný začátek u konce polotovaru se
  nejdřív prodlouží dozadu do vzduchu (úsek 1: `G0 Z-9 / G1 X41.066` →
  začátek na Z −20 jako ostatní vrstvy). Nový `ops/long/leadInChain.js`,
  klíč plátku `leadInSteepToChain`. Vrstvy, které pak nic neuberou (u osy
  za čelem: X 5,595 … 0 — nad řetězem vzala vše kružnice nosu), vypadnou.
  Model „už vyříznuto" (`alreadyCut.js`) přitom počítal pás pod osou
  (spodek nosu R 10 u osy sahá do X < 0) jako materiál — 29 mm² místo 0,15.
  (2) úsek 1, údolí Z 82–104 — kroky řetězu X 24,118 … 18,079 jely nájezd
  po 45° stěně pokaždé od rohu (5 až 11 mm po čáře, kterou předchozí krok
  právě projel); teď začnou na konci předchozího kroku a sjede se k němu
  rychloposuvem (`wallEntryClear`). Dobrání kapsy („kapsa bez schodků")
  jelo znovu celou rampu (15,6 mm) a dno (6 mm): poslední krok dosedl
  0,1 mm za dno a navázání se zamítlo; teď naváže odskokem a začne až na
  konci dna, u stěny (`pocketPass.js`, klíč `pocketRampAlongWall`).
  Po úsecích: kolize 0, strmé sjezdy 7 → 0, porušení pravidel úsek 1
  24 → 20, úsek 2 33 → 22 (posuv vzduchem 8 → 0); posuv −61 / −230 mm.
  Úsek 2 ubere o 60 mm² méně — přesně klíny pod mezními čarami (čelo 38,6,
  stěna drážky 21,6 mm²), pravidlo 6.
  Otisk 29 fixtures beze změny. Test `cam-round-left-valley-chain`.
- **CAM – opravy z 28. 9. obnoveny.** Rozpracované opravy kulaté zleva
  (níž, „kruhové vybrání, údolí za hrbem" a „úsek 2 téhož dílu") se 29. 9.
  před `git pull` automaticky odložily do `git stash`, takže je aplikace
  neměla (`N1470 G1 Z101.584` a rampa 38,7° ve vybrání se vrátily).
- **Kóty kontury jsou asociativní:** kóty úseků a poloměrů polyline se po
  posunu kontury i úpravě vrcholů přepočítají (dřív zůstaly na starém
  místě). Kóty si pamatují index úseku; po vložení/odebrání vrcholu i u
  starších kót bez indexu se úsek dohledá podle tvaru a polohy.
- **Kóta R oblouku kontury** mohla ležet na opačné straně (střed úhlů přes
  ±180°); teď vždy uprostřed oblouku.
- **Úprava vrcholů kontury (dialog) a Přichytit bod** neaktualizovaly
  asociativní kóty; úprava vrcholů dialogem navíc nešla vrátit (Zpět).
- **Kóty – duplicity:** stejnou kótu (táž úsečka/body, týž oblouk, úhel nebo
  bod) už nejde přidat vícekrát – dříve se opakovaným „📐 Přidat kótu" při
  měření vrstvily stejné hodnoty nad sebe. Kontrola je centrálně v
  `addObject` (`js/dimensionDedup.js`), platí pro měření, nástroj Kóta,
  řetězové kóty i „Přidat kóty ke všem".
- **Kóty – krok Zpět:** vytvoření kóty zakládalo dva kroky Zpět (první
  „nic nedělal"); dávkové kótování („ke všem" / z výběru, obdélník, kontura)
  je teď jeden krok. Dočasný popisek 1. bodu měření už nezakládá prázdný
  krok Zpět.
- **Kóty – hlášky:** „Kóta přidána" / „Přidáno N kót" se hlásí jen u
  skutečně přidaných kót (dřív se počítaly i nepřidané).
- **Trigonometrie – automatický výpočet** skutečně běží při psaní (dříve jen
  tlačítkem, přestože to nápověda slibovala). Enter spustí výpočet hned.
- **Trigonometrie – opakovaný výpočet:** dopočtená pole se už neberou jako
  zadání, takže změna jedné strany přepočítá zbytek správně.
- **Trigonometrie – hlášení chyb** místo tichého ignorování: úhel ≥ 90°,
  přepona kratší než odvěsna, jen dva úhly, nula/záporné číslo, neplatný
  výraz a rozporné třetí zadání. Řešič vyčleněn do `js/trigSolver.js`
  (s testy).
- **Trigonometrie – oblouk úhlu β** se kreslil na opačnou stranu (vypouklý
  k vrcholu); nyní je správně uvnitř trojúhelníku.
- **Trigonometrie – mobilní klávesnice:** pole stran a úhlů otevírají
  číselnou klávesnici (`inputmode="decimal"`). Tlačítko **⌨ abc / ⌨ 123**
  přepne na písmena pro výrazy (sqrt, sin…).

### Added
- **CAM simulátor – podržení 📏 otevře nastavení rozsahů.** Dlouhé
  podržení tlačítka Z-limitů otevře pravý panel (Parametry), rozbalí skupinu
  čelisti/koník/rozsah a posune se k „Rozsah Z — aktivovat"; krátký klik dál
  jen zapíná/vypíná zobrazení limitů.
- **CAM – „✂ Po úsecích" (generátor po úsecích).** Pro každý úsek z plánu
  (`ops/sections/sectionRanges.js`, pořadí pravidlo 8) se nastaví rozsah 📐 na
  jeho hranice, vygenerují dráhy stávajícím hrubováním a obrobený polotovar se
  předá dalšímu úseku — automaticky to, co šlo dřív ručně přes „➕ Operace".
  Výsledkem jsou části „Úsek 1, 2, …". Na dílech uživatele stejný nebo menší
  zbytek než najednou, 0 zajetí do dílu, 0 kolizí.
  **↺ Reset** vrátí jednooperační režim na původním polotovaru a rozsahu.
- **CAM simulátor – zbytek po úsecích** (`ops/sections/sectionLeftover.js`):
  broskvově „nedojeto" v mm² nad každým úsekem (měří se proti nakreslené
  kontuře, tedy i klín pod čarou zanoření) a červeně čárkovaně obrys
  polotovaru, který po programu zbyl.

### Changed
- **Kalkulačka – větší okno, displej a čísla.** Okno až 380 px (na mobilu
  téměř přes celou šířku), výsledek písmem 30–32 px; dlouhé číslo se
  automaticky zmenší, aby bylo vidět celé. Na mobilu okno sahá od horního
  okraje až dolů a volnou výšku dostane historie výpočtů; okno je tam
  pevné a nejde přetahovat (na počítači přetahování zůstává).
- **Mobil – pravý panel se při přechodu do CAM zavře**, takže po návratu
  z CAM do CAD už ho není třeba zavírat ručně.
- **CAM simulátor – úběr materiálu vždy zapnutý.** Tlačítko ⛏ v horní liště
  zrušeno; uložené `showRemoval: false` se ignoruje.
- **CAM – pravidlo 8 změněno: úseky po řadě, každý celý.** Na pokyn
  uživatele se úseky obrábějí od strany, odkud se obrábí (Ú1, Ú2, …), každý
  najednou — dřív se začínalo největším průměrem a úsek se přerušoval, takže
  „✂ Po úsecích" vyrábělo víc částí než úseků (4 úseky → 6 částí). Popisek
  úseku je jen „Úx". `docs/cam-pravidla.md` pravidlo 8 přepsáno.
- **CAM – plán úseků pozná čáru zanoření, která končí přesně na offsetu
  polotovaru.** Test bod/mnohoúhelník dával na hraně jednou „na hraně",
  jednou „uvnitř" — zleva tak chyběla hranice u Z 265,4 (4. úsek) i krajní
  čára vpravo. Teď tolerance 0,05 mm (`sectionPlan.js`).
- **CAM – vrstvy s rampou se zbytečně nezahazují.** (1) Pravidlo „rampa
  nevezme víc než jednu vrstvu" se měří MATERIÁLEM (offsetová čára +
  noseLiftX), ne výškou středu nosu — kus rampy nad čarou jede vzduchem.
  (2) Odloženou rampu, kterou zablokoval držák, generátor posune doleva (po
  0,5 mm, horní bod = spodek nosu na offsetové čáře, držák volný ≤ 0,05 mm²)
  místo zahození celé vrstvy. Sweep proti HEAD: úběr +223,5 mm², kolize 0/0.
  (3) Nevejde-li se ani posunutá rampa (držák vpravo + stěna vlevo), sjede
  se z konce rampy mělčí vrstvy pod úhlem zanoření až na offset stěny —
  i když to není celé ap — a schodek se dobere po stěně nahoru na hloubku
  předchozí vrstvy (úsek 3 uživatele: X 17,17 → 15,91 u stěny Z 76,27).
- **CAM – svislý vjezd ze vzduchu se zastaví nad polotovarem a jde rampou.**
  Sjezd na místě nájezdu (začátek + Vůle Z + R) smí skončit jen tam, kde je
  držák ÚPLNĚ volný (0,01 mm² proti zbytku — dřív pouštěl 0,5 mm², úsek 3:
  0,36 mm² do šikminy, v simulaci červeně) a spodek nosu nad offsetovou čarou;
  na hloubku se pak jde rampou pod úhlem zanoření, celou posuvem
  (`rampAllFeed`). Nevejde-li se, vrstva se vynechá a nahlásí.
  Sweep proti HEAD: úběr +9,6 mm², kolize 0/0.
- **CAM – v režimu částí se hlídá držák podle pořadí; údolí se přesto dojede.**
  `applyPartToState` zahazoval interní `orderAwareHolder` (nahrazuje celé
  `S.params`) → v částech hlídání vypnuté a držák vjížděl do šikminy polotovaru
  (úsek 3, 3 kolize). Teď se klíče z `CODE_OWNED_PARAMS` doplní. Aby se tím
  nerozbilo zanořování v údolí úseku 2, posunutý vjezd (`openPass.js`) umí
  navázat na konec rampy předchozí vrstvy v témž intervalu — dřív se vrstva
  zahodila jako „kolmé zanoření". Díl uživatele po úsecích: 0 kolizí, otisk
  fixtures beze změny.
- **CAM – „✂ Po úsecích" / „↺ Reset" berou nastavení z panelu.** Při
  opakovaném spuštění se nahrávala celá první část — úpravy parametrů
  a vypnuté rozsahy se vracely. Teď platí, co je v panelu; z první části jen
  původní polotovar. Rozsahy z náhledu celého programu se ukládají a projekt
  z „Po úsecích" se po obnovení otevře v náhledu celého programu (dřív vždy
  rozsah úseku 1).
- **CAM – rampa z povrchu začíná spodkem nosu na offsetové čáře polotovaru.**
  Kotva rampy (`roughLong.js`, `openPass.js`, `entryRamp.js`) se počítala
  středem nosu na offsetové čáře, takže plátek nejdřív sjel svisle o celé R do
  pásma polotovaru (`N2340 G1 X17.794`, čára na X17,743, R1) a teprve pak
  rampoval. Teď střed = čára + rádius nosu (`cornerR`). U kulaté beze změny
  (cornerR = noseLiftX); pohnulo se 18 polygonových fixtures, bezpečnostní
  testy 134/134.
- **CAM – obrobený polotovar nezahazuje visící kusy.** Kus materiálu, který
  dráha oddělí a který se osy nedotýká, se k polotovaru další části připojí
  i s tím, co je pod ním (`opParts.js` `attachFloatingPieces`) — dřív se
  zahodil a držák další části o něm nevěděl.
- **CAM – upichovák podélně nehrubuje.** Plátek s `longRoughing: false`
  (upichovák) jede vždy čelně (`enforceInsertStrategy` v calculatePipeline.js),
  tlačítko Podélně je u něj zamčené; starý projekt se přepne sám. Smazány
  testy čistě podélného upichováku (`cam-parting-envelope`,
  `cam-shifted-entry-ramp`). Čelní odskok hlídá celé rovné dno plátku
  (`flatSpanZ`), ne jen špičku — part-18 čelně zajížděl dnem do šikminy.
- **CAM – offset kulaté destičky jde po čáře zanoření u každého rádiusu.**
  S malým R (R1) offset čáry zanoření minul roh stěny pod sebou a jediný
  průsečík byl offsetový roh u kotvy — napojení vyšlo 1 mm dlouhé a offset
  dál kopíroval konturu. `guideOffsetJoin.js` teď zkouší: vzdálené napojení
  → po čáře a kolmo dolů → teprve pak krátké napojení u kotvy.
- **CAM – úhel zanoření podle plátku.** Polygon: auto i strop = spodní hrana
  (natočení PU, pravidlo 6); kulatá auto 45°; upichovák vždy kolmo
  (`plungeFixed`, pole zamčené). Přepnutí tvaru plátku vrací Auto — ruční
  úhel se dřív nesl na další plátek.
- **CAM simulátor – plán úseků.** Fialové dělicí čáry po offsetu polotovaru
  (od místa, kde čára zanoření vyjede na offset polotovaru) + pořadí úseků
  (pravidlo 8) — `ops/sections/`. Offsetová čára polotovaru (Vůle X/Z) se
  kreslí vždy; přepínač REF zrušen.
- **CAM – pravidlo 7: pravá strana hrbu celá dřív, než se přes hrb přejede.**
  Průchody úseku se na konci stabilně přeřadí podle hrbů dráhy
  (`ops/long/humpOrder.js`, táž definice hrbu jako kontrola pravidel):
  průchod začínající za hrbem pod jeho vrcholem jde až po všech před ním;
  vrstva, která hrb kopíruje (upichovák, `humpMerge`), zůstává spojená.
  Kapsa za hrbem přes vzduch se dělí na kusy se vjezdem ze vzduchu
  (`ops/long/airPieces.js`) — dřív se zahodila i s bossy dál vlevo.
  Vrchol stěny upichováku (pravidlo 1) = konec STRMÉ části (rozhodnutí
  uživatele). Rampy z povrchu (nový řetěz, uzavírací krok, rampa k posunutému
  vjezdu, kapsa) nesmí vzít víc než jednu vrstvu (pravidlo 3). Odstup
  zápichu upichováku hlídá tělo plátku. Známé: `part-20-zleva-parting-taper`
  4 kolize držáku (bok za hrbem vybíral jen spojený dojezd) — rozpracováno.
- **CAM – úseky jen podle pravidla 1.** Díl se dělí jedině na patě čáry
  zanoření, která vyjede z materiálu (u upichováku na patě strmé stěny,
  nad jejím vrcholem hranice neplatí) — `ops/long/sectionFeet.js`, táž
  funkce jako v kontrole pravidel. Zrušeno dělení uprostřed údolí polotovaru
  a uprostřed hrbu kontury i s dvojím plánováním a výběrem plánu
  (`holderCheck.js`). Aby nové hranice nerozbily dráhy (díl uživatele (4):
  chyběla kapsa u krku i skoro celý úsek pod Z 107), upraveno: vjezd, který
  na hranici úseku leží v nedosažitelném materiálu pod čarou zanoření,
  přeskočí na první místo, kde materiál začíná ze vzduchu; vjezd blokovaný
  stěnou se posune jen k prvnímu volnému místu, ne na kraj okna; rampa na
  vjezdu posunutém držákem může na něm i ZAČÍT (a kotva řetězu pokračuje
  z jejího konce); kapsa začínající na hranici úseku najíždí rampou
  z povrchu, ne od paty čáry; přejezd vzduchem jede posuvem jen tam, kde
  rychloposuv opravdu naráží. Měřeno `cam_rules_check` na 29 fixtures:
  1256 → 1225 porušení, kolize 0 → 0; díly uživatele: polygon 12 → 10,
  upichovák 16 → 8, kulatá 37 → 42 (vzduch v kapse za hrbem — P7).
- **CAM – jeden generátor drah.** Z panelu zmizely přepínače „Nový generátor
  drah (test)", „Booleovské hrubování (exp.)" a „Hrubovat po regionech".
  Podélné hrubování má jedinou cestu: původní generátor s booleovskými
  intervaly (dřív za přepínačem) — regiony platily vždy už od 4cd0d15 a
  přepínač nic nedělal. Pokusný generátor `ops/simpleLong.js` (jen kulatá)
  smazán: na dílech uživatele 24. 9. 2026 vycházel hůř (42 × 37 porušení
  pravidel). Bez booleovské cesty měl díl s kulatou třísku 19,9 mm a polygon
  kolmé zanoření 90°. Díly, které měly booleovskou cestu vypnutou, se
  změnily (10 z 29 fixtures, 7 lépe / 1 stejně / 2 hůř podle
  `cam_rules_check`; `holder-region-roughing` má teď třísku 4,95 mm a
  posuv vzduchem jako `holder-casting-slanted-face`).
- **CAM – pravidla drah na jednom místě:** `docs/cam-pravidla.md` je jediný
  zdroj (schvaluje uživatel). Staré dokumenty (pravidla-drah, plány, předávky)
  smazány. Pokus 23.–24. 9. zavést pravidla 1–2 záplatami do starého generátoru
  dráhy uživatele zhoršil (polygon, upichovák) → kód generátoru vrácen na 2337bf6;
  pravidla se budou plnit přes kontrolní skript.

### Fixed
- **Kalkulačka:** π / ANS / „(" hned za číslem se přilepily (`2`+`π` →
  `23.14…`) – nově implicitní násobení; záporné ANS za mínusem (`5--3`) se
  vkládá v závorce; výsledky se zaokrouhlují na 12 platných číslic místo
  8 desetinných míst (malá čísla už nespadnou na 0, `0.1+0.2` = `0.3`);
  po „=" začne číslice nový výpočet; dva operátory za sebou se nahradí;
  čárka funguje jako desetinná tečka; „Chyba" už nemaže výraz; okno při
  přetažení neposkočí a nejde vytáhnout mimo obrazovku; f(x) se zavře
  klepnutím jinam; na dotykovém zařízení displej neotevírá systémovou
  klávesnici.
- **CSS:** opraveno rozbité kódování (UTF-8 čtené jako CP1252) – mimo jiné
  prázdná historie kalkulačky ukazovala „Historie vÃ½poÄtÅ¯".
- **CNC export – varování na větvení kontury.** Když se v jednom bodě
  stýkají 3 a více čar (typicky dokreslená šikmá úsečka přes starý schod,
  který zůstal ve výkresu), export poslal jednu větev jako samostatný kus za
  G00 a CAM z toho postavil nesmyslný díl („trojúhelník dole" v zbytku
  nedojeto). Export teď uzly větvení vyznačí červeně („Větvení") a ohlásí je
  toastem s odkazem na místo (`findContourBranches` v `stockTools.js`).
- **Mobil – klávesnice při označení objektu.** Klepnutí na objekt v CAD
  zvýrazní jeho řádek v CNC kódu fokusem textarey, a to na telefonu vysouvalo
  klávesnici, i když se nic nezadává. Na dotykových zařízeních se řádek teď
  zvýrazní s `inputmode="none"`; klávesnice vyjede až po klepnutí do pole kódu.
- **CAD → CAM: po překreslení výkresu zůstávaly v CAM dráhy starého výkresu.**
  Když se v CAD smazala kontura a nakreslila nová, CAM převzal novou konturu,
  ale dál ukazoval dráhy (a u částí „✂ Po úsecích" / „➕ Operace" i polotovar
  a rozsahy) uložené k té smazané. Když se kontura z CAD liší od té, ke které
  program patří, a dráhy nebyly ručně upravené, program se zahodí a vygeneruje
  znovu z nové kontury. Ručně upravené dráhy zůstanou a ohlásí se toastem.
- **CAM – zleva: kruhové vybrání, údolí za hrbem a mez úseku.** Nálezy
  uživatele 28. 9. 2026 (kulatá R 10, ap 2,5, „✂ Po úsecích", úsek 1):
  (1) zanořování kapsy „dobrat najednou" hledalo o vrstvu níž „tutéž kapsu"
  jen podle rohu, takže na dně vybrání (X 29,727) skočilo do údolí za hrbem
  a vzalo tam tři vrstvy naráz (`N1470 G1 Z101.584 ; Přejezd materiálem
  posuvem`), mělčí vrstvy pak jely naprázdno — hlubší interval musí teď
  ležet v Z uvnitř kapsy (`pocketPass.js`); (2) u meze úseku jezdilo šest
  shodných zbytků přejezdu přes hrb dokola týž trojúhelník (`G0 Z142.601 /
  G1 X45.68 Z145.25`) — zbytky se stejným koncem se slučují
  (`pocketHumpSplit.js`); (3) kulatá: další krok zanoření po vyduté stěně
  jede po offsetu (G1 45° + G3) místo tětivy 38,7° nad obloukem a dobrání
  dna na konec té rampy naváže i uprostřed oblouku, takže stěnu nejede
  dvakrát (klíč plátku `pocketRampAlongWall`, jen kulatá). Otisk všech 29
  fixtures beze změny; test `cam-round-recess-left`.
- **CAM – zleva, úsek 2 téhož dílu (kulatá R 10).** (1) V údolí za přírubou
  (Z 239–270) jely vrstvy 55,595 … 40,595 dvakrát („kapsa po kontuře" a znovu
  dobírání ramp) a 35,595 / 30,595 potřetí jako odložené vjezdy (98 mm
  vzduchem) — krok řetězu i odložený vjezd se vynechá, když jeho MATERIÁL
  (ne celý rozsah až na konec regionu) už bere průchod téže hloubky
  (`roughLong.js` `sameDepthCovers`, sdílené; otisk polygonu beze změny).
  (2) `G0 X40.656 Z195.228` vjel 0,7 mm² do kůry — rychloposuv uvnitř řezu
  jen tam, kde je volná přední půlka nosu (`gcodeEmit.js`, klíč
  `airSplitFullNose`). (3) Sjezdy 84° po čele konce dílu — pokus opravit to
  v `guideOffsetJoin.js` (krok 2b) rozbil tři testy a byl vrácen; opraveno
  až 29. 9. na úrovni vjezdu vrstev (`leadInChain.js`, viz výš). (4) Kolmý zápich
  `G1 X19.243` pod řetězem ramp — zasypaný začátek nájezdu se nahradí
  řetězem ramp (klíč `leadInStartNoPlunge`). (5) Poslední vrstva u osy
  objížděla nájezdem celý díl (`G1 X19.617 Z280.303` 58 mm posuvem po
  hotovém) — nájezd jen od mělčí vrstvy (klíč `leadInTailBelowPrev`).
  Úsek 2: kolize 1 → 0, strmé sjezdy 6 → 0, posuv vzduchem 28 → 3.
  Otisk: změnil se jen `part-22-round-r10` (rychloposuvy o ~0,5 mm kratší,
  kontrola pravidel beze změny) — snapshot přepsán.
- **CAM – kulatá destička: vrstvy za koncem vrstvy, u osy a poslední vrstva
  ve vybrání.** Nálezy uživatele 26. 9. 2026 (R 10, ap 2,5, „✂ Po úsecích"):
  (1) zleva, úsek 2 — po `N3270 G1 Z194.675` chyběly vrstvy 38,1 … 28,1 u
  stěny drážky. Blok polotovaru Z 196…205 leží za koncem vrstvy, pod spodkem
  nosu je vzduch a bere ho BOK kružnice nosu; sken se ptal jen na sloupec pod
  spodkem nosu a kotva zanoření (`zCap`) utekla za hrb, takže se interval
  u stěny zahodil. Teď se u kulaté rozhoduje podle siluety polotovaru
  rozšířené o R (`stockCrossingsCircleAt`, `airPieces.js` `airLead`) a
  intervaly před `zCap` se nezahazují — obecně, ne jen pro tenhle díl.
  (2) Tamtéž u osy vypadla vrstva X 8,095 (kotva uvnitř intervalu) a další
  vrstva brala 5 mm — kus před kotvou teď zůstane. (3) Zprava, úsek 3 — ve
  vybrání R 24,5 mezi body 25–24 zůstala pod poslední vrstvou čočka 2,4 mm:
  dno v oblouku se nehlídalo a hloubka pod ním řezala v sousedním údolí.
  Poslední vrstva na dně se teď hledá i v nejnižším bodě vydutého oblouku a
  u dna v misce před každou hloubkou (jede jen ve svém okně, jinde by byla
  tenkou vrstvou mezi plnými). (4) Nájezd po kontuře se zkrátí na část pod
  mělčí vrstvou, když je nad ní obrobeno — kolmý sjezd `G1 X37.166` (P6) je
  pryč a ke dnu vybrání se sjíždí po oblouku, ne 3,4 mm posuvem vzduchem.
  Klín vedle klesající stěny strmější než 45° (u bodů 7/6/5 zprava, za hrbem
  zleva) zůstává podle pravidla 6 — vzít ho jde jen kolmým zanořením.
  Otisk: změnil se jen `part-22-round-r10` (vybrání dobráno, úběr +98 mm²,
  kontrola pravidel 33 → 31 porušení), kolize 0. Test
  `tests/cam-round-layers-floor.test.js`.
- **CAM – kulatá destička, „✂ Po úsecích" (úsek 2 na zbytku po úseku 1).**
  Tři nálezy uživatele 26. 9. 2026: (1) `N2620 G1 X27.795` — sjezd na začátek
  rampy do drážky škrábl zadní stranou nosu R 10 stěnu zbytku po úseku 1
  (kontrola pravidel P6 90°): rampa `noseAware` teď začíná až tam, kde je
  volná CELÁ kružnice nosu, ne jen její spodek (`entryRamp.js`; totéž hlídá
  i kotva vjezdu `holderEntryCapZ`). (2) `N2860 G1 X23.388 Z148.391` —
  poslední vrstva o 0,013 mm pod dnem skončila na schodu a emise ji spojila
  se stěnou šikmou čarou „do kuželu": dojezd po dně se už nezahazuje jako
  „kousek pod vrstvou", zahazují se jen krátké kusy (`pocketPass.js`).
  (3) Po `N2340 G1 Z137.565` chyběly vrstvy 46,73 / 44,23 / 41,73 u pravé
  stěny hrbu: vjezd podle kružnice nosu se hledá i tehdy, když sken něco
  našel, ale ne u vjezdu, a okno pro střed nosu sahá o R za konec materiálu
  pod spodkem nosu (`roughLong.js`). Otisk 29 fixtures beze změny; sweep
  `part-22` s nakresleným nožem −23,5 mm² (vrstva, jejíž rampa by sjížděla
  bokem nosu do materiálu), kolize 0. Test
  `tests/cam-round-section2-parts.test.js`.
- **CAM – kulatá destička: úsek 2 — bok hrbu a drážka po vrstvách až na dno,
  zanořování jako u polygonu.** Na dílu uživatele (R 10, úsek Z 101,9…195,3)
  skončily vrstvy u pravé stěny hrbu na X 31,909 a vrstvy 29,409…19,409 se
  zahodily („Zanořování: 8 vrstev vynecháno"). Tři příčiny: (1) vjezd se
  hledal podle kraje materiálu pod spodkem nosu, u stěny tak vyšlo okno
  0,1 mm — teď začíná tam, kde se materiálu dotkne kružnice nosu
  (`roughLong.js`); (2) kapsa bez nájezdu po kontuře neměla rampu z povrchu,
  protože `stockEntryRamp` srovnával střed nosu s povrchem — nově
  `noseAware` a v kapse se vezme rampa z povrchu nebo řetěz z mělčí vrstvy,
  co začne víc vpravo (`entryRamp.js`, `pocketPass.js`); (3) poslední tenčí
  vrstva na rovném dně (zbytek < ap) chyběla — vloží se do žebříku
  (`roughLong.js`, „POSLEDNÍ VRSTVA NA DNĚ", jen kulatá). K takovým rampám
  se sjíždí rychloposuvem podle kružnice nosu (`rampEntryClear`), ne 4–6 mm
  posuvem vzduchem. Polygon beze změny (otisk); `part-22-round-r10` úběr
  +337 / +474 mm², kolize 0. Test `tests/cam-round-section2-groove.test.js`.
- **CAM – poslední vrstva na ose (X 0) už neprojede dílem.** Booleovský sken
  intervalů (`ops/long/intervalScan.js`) na hloubce přesně X 0 vedl čáru po
  spodní hraně obalu zbytku a proužky nulové šířky po zjednodušení/Clipperu
  bral jako materiál. Na dílu uživatele (kulatá R 10, čep r 9,117 v Z 243…345)
  tak „Průchod 31" jel `N1650 G0 X0.000` + `N1660 G1 Z251.767` — středem nosu
  po ose skrz čep. Sken se teď vede o 0,05 mm nad osou a konec u čela se
  dopřesní na skutečnou hloubku (`N1660 G1 Z356.931`). Test
  `tests/cam-axis-layer.test.js`.
- **CAM – kulatá destička: vrstvy v údolí za hrbem sjedou až na dno.**
  Hlídání držáku (`ops/long/holderFit.js`) bralo vyříznutou podlahu ve
  středu nosu jako povrch — vrstva přes vrchol hrbu (`N380 G1 X60.581
  Z216.792`) se zapsala o celé R výš, než kam řezala, a držák hlubších vrstev
  údolí do domnělého materiálu „narazil". U R 10 tak údolí skončilo 4 vrstvy
  pod vrcholem (`N1900 G1 Z195.278`, X50.545) a hlásilo se „Hlídání držáku:
  10 odložené zanoření vynecháno". Podlaha se teď snižuje o `noseLiftX`
  (polygon/upichovák beze změny). Zároveň dobírací řetěz ořízlé rampy
  (`pendingRampCompletions`) vynechá krok, jehož vrstvu už jede hloubková
  smyčka — údolí se už nejezdí podruhé vzduchem („Průchod 36 (oblouk G3)" +
  „zanoření v kapse"). Test `tests/cam-round-valley-holder.test.js`.
- **CAM – vrchol hrbu projetý dojezdem se taky počítá jako „dotčený".**
  První vrstva přes hrb vede dojezdem, ne tělem; `orderByHumps` to nepoznal
  a další vrstvu spároval s kusem za hrbem, takže se za hrb jelo dřív, než
  byla hotová pravá strana (zprava úsek 1: `N540 G1 Z195.278` na X48.045 hned
  po `N390 G1 X51.581 Z220.938`). Test teď bere i nájezdy, dojezdy a rampy
  (`humpRidden` v `humpOrder.js`).
- **CAM – první vrstva, která narazí na hrb, dojede přes něj až na konec**
  (uživatel 25. 9. 2026). Kapsová vrstva, jejíž dojezd vede přes vrchol hrbu,
  který dosud nikdo neprojel, se už nestříhá: kus téže vrstvy za hrbem se
  připojí k dojezdu (zleva úsek 1: X27.066 po `N1040 G2 X28.545 Z55.070`
  pokračuje až na Z80.884, pak odskok). Hlubší vrstvy přijdou k projetému
  vrcholu a přes hrb jedou až po dokončení údolí (`pocketHumpSplit.js`).
- **CAM – dokončení kapsy navazuje na konec řetězu ramp.** Šikmá čára pod
  úhlem zanoření na dně údolí („kapsa bez schodků") jela od vrcholu stěny
  znovu celou přímku, kterou už kus po kusu projely rampy zanořovacích
  vrstev (zleva úsek 1: `N1160 G1 X22.967 Z44.968` od Z12,5, 33,5 mm
  posuvem). Nájezd se teď ořízne na první bod, kudy rampa nejela, a sjede
  se k němu svisle vybraným sloupcem — na úseku 1 zbude 6,3 mm, úběr stejný.
  Dojezd dokončení kapsy navíc končí tam, kde najede na stěnu projetou
  mělčí vrstvou (dřív `N1170 G3`/`N1180 G2` znovu až nahoru), před
  nájezdem po průchodu bez odskoku (`noRetract`) se odskočí (dřív
  `N1130 G0 Z38.860` rychloposuvem 0,3 mm nad obrobenou plochou) a přejezd
  přes hrb se ořízne o plošinu, kterou už projel kus téže vrstvy.- **CAM – přes hrb, jehož vrchol už projela mělčí vrstva, se nepřejíždí hned**
  (rozhodnutí uživatele 25. 9. 2026). Vrstva spojená přes nízký hrb
  (`humpMerge`) jela posuvem znovu po těle mělčí vrstvy (zleva úsek 1:
  `N340 G1 X32.066 Z9.049` po `N260` na X32.066) a přes osazení dřív, než
  byly hotové vrstvy čela. Když dojezd vyjede na výšku, po které už mělčí
  vrstva jela rovně, `orderByHumps` vrstvu přes hrb nespojí: nejdřív strana
  před hrbem, pak vrstva za ním vjede rampou z vrcholu.
- **CAM – vrstva přes vzduchovou mezeru jede dál (pravidlo 7).** Kus vrstvy
  za mezerou v polotovaru (`splitPocketsAtAir`) se dřív vždy vydal jako nový
  průchod — nástroj uprostřed vrstvy odskočil a zbytek dojel až po čele
  (zleva úsek 1: `N370 G1 X29.566 Z28.772` + odskok). Když první kus vyjel
  a skončil ve vzduchu, kus za mezerou se k němu teď připojí (přes vzduch
  rychloposuv), pokud tím nepřibude držák.
- **CAM – dojezd z údolí nepřejíždí hrb dřív, než je údolí hotové
  (pravidlo 7).** Kapsový průchod po zahlazení schodku jel po obrobené
  stěně dál přes hrb a za ním ubíral hlubší vrstvu (`N1150 G1 Z47.780` →
  `G1 X24.851 Z81.881`), údolí se dobíralo až potom a kus vrstvy za hrbem
  jel znovu celý vzduchem. Dojezd teď končí na mělčí vrstvě (nebo vrcholu
  hrbu) odskokem; přejezd se vydá zvlášť za údolím
  (`ops/long/pocketHumpSplit.js`). Dojezd, který za hrbem vede do dalšího
  údolí, zůstává. Fixtures: tříska > ap 7 → 5 (part-4/6/8/9), úběr i kolize
  beze změny.
- **CAM – zleva „✂ Po úsecích" nezanořil úsek 4.** Ručně zadaný rozsah
  (původní polotovar) jel 6 vrstev, po úsecích nic — po úseku 3 zbyla u meze
  nižší šikmina a kotva zanoření sedla na mez nad ní (rampa přes 7 vrstev →
  zamítnuta, vrstvy zmizely). Hledání kotvy (`holderEntryCapZ`,
  `ops/long/entryRamp.js`) teď dodržuje „rampa max 1 vrstva" a měří
  ZBÝVAJÍCÍ materiál; řetěz vrstev (`openPass` candC, `pocketPass`
  `chainFromPrev`) navazuje na začátek průchodu o vrstvu výš. Úsek 4: 6 vrstev,
  0 kolizí; sada fixtures úběr +669 mm², kolize 0/0.
- **CAM – zleva: konec úseku 4 a údolí úseku 2.** Rampa navázaná na mělčí
  vrstvu smí začít kdekoli na její podlaze (dosedla o 0,06 mm před interval
  za čarou zanoření a vrstvy X 7,78/5,28 vypadly). Zakázaný kolmý vjezd
  zkusí ČÁSTEČNÝ KROK ŘETĚZU i v `openPass` (kolmo nad místo vzduchem, rampa
  na offset stěny, schodek nahoru). Rampy posunutého vjezdu hlídají držák
  přísně (0,05 mm² místo 2 mm²) a když se nevejdou, posunou se po průchodu —
  kolize 2,17 mm² v úseku 2 (Z 94,15) zmizela. Po úsecích zleva 0 kolizí;
  sada fixtures úběr +684 mm², kolize 0/0.
- **CAM – obrobený polotovar ztrácel šikmé čelo u osy.** `loopsToStockProfile`
  zahazoval celý osový úsek smyčky i s rohem čela na ose, takže šikmé pravé
  čelo odlitku bylo v dalším úseku svislé a dráhy tam končily kolmo místo na
  offsetové čáře. Krajní body osového úseku se teď zachovají.
- **CAM – kontrola po opravách zleva (25. 9.).** Kotva „do jedné vrstvy"
  má zálohu: nedá-li se na ní řezat, platí původní kotva (part-15 by jinak
  ztratil dobírací krok). Řetěz v `pocketPass` hlídá držák podél rampy přísně
  (0,05 mm²). Částečný krok v `openPass` jen pro nedojetou hloubku. Profil
  polotovaru s jediným bodem na ose se chová jako dřív. Sada fixtures úběr
  +769 mm² proti HEAD, kolize 0/0, žádný díl neubírá méně než o 1,1 mm².
- **CAM – model zbytku zapisoval oblouk dojezdu z plánovaného, ne vydaného
  startu.** Když tělo průchodu skončí o kousek dřív než plánovaný oblouk
  (vzorkovaný booleovský interval), řídicí systém jede oblouk ze skutečné
  polohy; model si ale odebral oblouk o 0,11 mm níž a byl o 0,085 mm pod
  realitou (part-10, `cam-residual-model`). `noteCutArc` teď dopočte střed
  z vydaných koncových bodů. G-kód fixtures beze změny.
- **CAM – kulatá destička bere konec dílu po vrstvách jako polygon.** Na dílu
  uživatele (Z 0…90, R 10) se konec rozpadl na tři úseky, vrstvy X 47 / 44,5 / 42
  se přetrhly v Z 2,5, vrstvy nad hrbem Z 55–67 končily uprostřed jeho plošiny
  a pod plošinou u čela se táž dráha objížděla znovu. Opravy (falešný hrb
  za čelem, test držáku proti povrchu a jen po hranice, které drží, společná
  mřížka hloubek nad hrbem, vynechání „kapsy po kontuře", co nic neuřízne,
  nájezd po projeté dráze rychloposuvem a bez startu uprostřed hrbu, dojezd
  schodu i u kapsových průchodů, vynechání prázdné uzavírací rampy). Díl
  uživatele: průchodů 84 → 73, úběr 77,6 → 77,7 %, kolize 0. **Všechny visí na klíčích
  plátku** (`inserts/round.js`) — polygon, upichovák i závitový plátek bajt po
  bajtu beze změny; otisk se hnul jen u `part-22-round-r10`
  (`docs/cam-pravidla-drah.md` §6.0).

### Changed
- **CAM – plátek nesahá do plátku (audit oddělení).** Výška náhradního držáku
  nad destičkou (`holderSeatZ`), úhly mezních čar (`guideRotDeg`/`guideTipDeg`)
  a vzorec auto úhlu zanoření polygonu se přestěhovaly ze sdíleného kódu do
  `inserts/*.js`; odebrán nečtený klíč `tiltDeg` a mrtvý kód v `partOffGeom`.
  Čistý refaktor — otisk 29 fixtures beze změny. Nový test
  `tests/cam-insert-isolation.test.js` hlídá stejnou sadu klíčů u všech
  plátků, žádné `toolShape` v kódu drah, seznam dovolených čtení parametrů
  tvaru a oddělení podélných/čelních operací
  (`docs/cam-tvar-platku-v-generatoru.md`, „Audit 23. 9. 2026").

### Fixed
- **CAM – v žebříku hloubek už nezůstane díra širší než `ap`.** `passEntryZ`
  umí vjezd stáhnout z kraje Z-okna tam, kde skutečně začíná polotovar, ale
  neptá se, jestli se od toho místa dá vést řez — zastupoval to test
  `blockedAt` na jediném `Z`. Když okno pod posunutým vjezdem vyšlo kratší
  než řezný krok, hloubka nevydala nic a nastoupila uzavírací bisekce
  s degenerovaným průchodem. Na dílu uživatele tak vypadla hloubka X 29,118
  a mezi `N2730 G1 Z148.208` a `N2780 G1 Z148.310` zůstal krok **4,097 mm**
  při `ap` 2,5. Nově se na posunutém vjezdu jednou skenuje a při prázdném
  výsledku platí původní kraj okna. Žebřík úseku je po opravě
  34,118 → 31,618 → **29,118** → 26,618 → … po přesných `ap`; porušení kroku
  na celém dílu 2 → 1 a to zbylé jsou dva průchody v RŮZNÝCH úsecích
  (překryv v Z −29,7 mm), tedy ne díra. Otisk 1 z 29 fixtures
  (`part-22-round-r10`, +1 ř.), úběr i kolize sady beze změny
  (`docs/cam-pravidla-drah.md` §4.2d).
- **CAM – vrstvy po `ap` dojedou až na osu; destička smí přejet střed.**
  Hloubková posloupnost končila `noseLiftX` (u kulaté = R) nad osou: dráha je
  v souřadnicích středu nosu, povrch se z ní počítá odečtením `noseLiftX`, a
  jakmile vyšel záporný, silueta polotovaru (ta žije jen na x ≥ 0) neměla co
  protnout — `stockZRangeAt` vrátilo `null` a hloubka se zahodila i s
  materiálem pod ní. Na dílu uživatele tak u čela na ose zůstal stát sloupec
  r 0–9,5 × Z 22,6 mm (přesah nad dílem 36,3 mm² → po opravě 7,5 mm²),
  ačkoli dalších pět hloubek bylo připravených (žebřík skončil
  na `N1400 G1 Z355.803`). Nově se povrch pod osou čte na ose — pod osou je
  řez pořád platný, destička jde nosem skrz střed a bere celý průřez (pokyn
  uživatele 18. 9. 2026: *„nevadí, že plátek bude z půlky pod osou"*). Ptá se
  jen hloubková smyčka; detekce úseků zůstává bitově stejná. Na dílu
  uživatele 79 → 84 průchodů a úběr 77,2 → 77,6 % bez jediné nové kolize
  (`docs/cam-pravidla-drah.md` §4.2b).
- **CAM – konec zanořovací rampy se u kulaté destičky přestal hledat o R vedle.**
  `cutFloorTab` si zapisuje `p.x`, tedy střed nosu, ale průchod vykope až na
  `p.x − R`; `residTopSafe` proto hlásilo o celé R víc stojícího materiálu.
  `atResidTop` pak tvrdilo „je čím rampovat" i tam, kde je dávno vzduch,
  `stockEntryRamp` vydal rampu dlouhou 0,24 mm a sjezd k jejímu začátku se
  emitoval RADIÁLNĚ — na dílu uživatele sedm 90° sjezdů po ~2 mm místo
  nájezdu po kontuře. Sjezdy strmější než úhel zanoření u kulaté R 10 klesly
  7 → 0 (R 8: 8 → 1, R 2: 8 → 5), úběr i kolize beze změny
  (`docs/cam-pravidla-drah.md` §4.2c).
- **CAM – u kulaté destičky jdou vrstvy po `ap` až dolů, ne jen pár.** Obálka
  držáku (`makeHolderClamp`) se stavěla ze siluety offsetové čáry, tedy
  z dráhy STŘEDU NOSU, kdežto obrys držáku je ve světových souřadnicích.
  U kulaté destičky je mezi tím `noseLiftX` = R, takže se podmínka „spodní
  hrana držáku nad materiálem" zpřísnila na „střed nosu nad materiálem" —
  u R 10 o celých 10 mm. V údolí vedle hrbu Ø 100 proto žebřík hloubek
  skončil přesně na úrovni hrbu (na dílu uživatele `N1620 G1 X52.964`) a ze
  22 hloubek úseku jich 14 vypadlo na jediném `return` v `pocketPass.js`.
  Nově se silueta před stavbou překážky posune o `noseLiftX` dolů
  (`buildObstacleLoops({ dropX })`); polygon, upichovák i závitník mají
  `noseLiftX = 0`, takže se pro ně nezměnilo nic. Na dílu uživatele 4 → 9
  vrstev po přesných `ap` a úběr 75,1 → 77,2 % bez jediné nové kolize; na
  sadě 29 fixtures se hnul otisk jediné fixture (`part-22-round-r10`), úběr
  +135,6 mm² a kolizí o jednu MÍŇ. Varianta „překážka = povrch + přídavek"
  (odečíst celý `tipR`) byla změřena a zamítnuta — 7 kolizí / 1 027 mm²
  na dílech, které kulatou destičku vůbec nemají
  (`docs/cam-pravidla-drah.md` §4.2a).
- **CAM – rampa už nejede desítky mm vyhrubovaným prostorem.** Kotva rampy
  sedí na povrchu polotovaru, takže u hlubší vrstvy začínala vysoko nad
  vlastní hloubkou a neodebrala nic (na dílu uživatele `N1670 … ; Rampa 45.0°`
  15 mm hloubky, 0,00 mm²; v náhledu z toho byla dlouhá čára nad skutečným
  zanořením). `capRampsThroughAir` ji zkrátí na nejvýš jednu Hloubku záběru —
  jen tam, kde nad ní dřívější průchod opravdu vyhruboval, aby se nezkrátila
  rampa vrstvy vjíždějící do plného materiálu. Na dílu uživatele 4 rampy
  (15,0 a 3× 8,6 mm); na sadě 29 fixtures navíc zmizela poslední kolize
  náhradního držáku (1 / 3,0 → 0 / 0,0 mm²). `docs/cam-pravidla-drah.md` §3.2g.
- **CAM – zanoření už nesjede 21 mm naráz.** Krok zanořovacího řetězu
  označený `pocketReposition` slibuje emisi, že nástroj stojí na konci
  předchozího kroku; emise podle toho vydá přesun v aktuální hloubce bez
  výjezdu nad konturu. Řetěz se staví správně (osm kroků po `ap`), jenže ho
  roztrhne ořez podle Z-limitů (čelisti/koník) — a osiřelý krok pak z toho
  přesunu udělal jednu rampu plným materiálem: na dílu uživatele 21 mm
  hloubky a **269 mm² v jedné třísce** při ap 2,5. Nový
  `js/calculators/cam/ops/long/chainRelink.js` běží až za tím ořezem a
  osiřelý krok buď zahodí (když mu zbyl jen nájezd — poslat kvůli němu
  nástroj na hloubku stálo změřených 189 mm² vnoření držáku), nebo přepíše na
  samostatný vjezd s rampou nejvýš o jednu Hloubku záběru. Největší tříska
  nad `ap` klesla z 269,1 na 24,4 mm², součet z 315 na 97 mm²; otisk se hnul
  na jediné fixture, kolize beze změny, `tests/cam-ramp-chain` zezelenal
  (`docs/cam-pravidla-drah.md` §3.2f).
- **CAM – offsetová čára se napojuje na mezní čáru zanoření, místo aby
  kopírovala povrch.** U kulaté destičky sjížděla hrubovací offsetová čára po
  stěně strmější, než jakou plátek pod zadaným úhlem zanoření stihne sjet
  (na dílu uživatele 3 řezy pod 20,5° proti zadaným 45°), a offset samotné
  mezní čáry visel oběma konci ve vzduchu — kolmý posun bez napojení na
  sousední offsetové čáry. Nový `js/calculators/cam/guideOffsetJoin.js`
  ořízne offsetový řetěz offsetem mezní čáry, takže vznikne spojité
  „vodorovně → pod úhlem zanoření → dolů" (pravidlo uživatele 17. 9. 2026,
  `docs/cam-pravidla-drah.md` §3.2e). **Kontura se nemění**, jen dráha středu
  plátku; rozsah drží klíč plátku `plungeGuideJoinsOffset` (`inserts/*.js`),
  dnes `true` jen u kulaté. Napojení se hledá JEN v okolí nakreslené mezní
  čáry; když se tam nenajde, náhrada jde po čáře až na její konec a odtud
  KOLMO DOLŮ k prvnímu segmentu řetězu pod sebou — offsetové čáry pod mezí se
  vyhodí, protože se z nich generovaly dráhy podjíždějící úhel zanoření
  (pravidlo uživatele 17. 9. 2026). Po přímce se za konec čáry nepokračuje:
  u oblouku R10 by to přeřízlo celé údolí. Změřeno na 29 fixtures: otisk se
  hnul jen na obou kulatých dílech, úběr +164,1 mm², **tvrdé kolize beze
  změny**; jediná cena je měkký nález 0,54 mm² na `part-18` (jen proti
  offsetové čáře — neshoda plánovače a validátoru na výšce odskoku), zapsaný
  v `tests/cam-collision-free` i `tests/cam-face-range`.

### Changed
- **CAM – obě offsetové čáry (s přídavkem i na hotovo) se kreslí všude.**
  `finishRefPath` (hotovní offset kontury) byl od 15. 9. pod přepínačem REF,
  takže kolem kontury byla vidět jen jedna čára; REF od teď řídí už jen
  tečkovanou plánovací hranici polotovaru (rozhodnutí uživatele 17. 9. 2026).
- **CAM – offsety mezních čar se kreslí OBA, ale napojené.** Mezní čáry
  hlídání geometrie mají dva offsety (hrubovací R + Přídavek X/Z + na hotovo,
  a hotovní jen R); dřív obě visely KOLMĚ od čáry s konci ve vzduchu. Teď obě
  kopírují napojený průběh (`offRough`/`offFinish`), takže navážou na sousední
  offsetové čáry — stejně, jako to už dělá polygonální plátek, jehož mezní
  čáry mostí konturu. Platí pro všechny tvary plátku, SNAP beze změny.
- **CAM – přepínač REF pro referenční (nejízdné) čáry v náhledu.** V CAM
  simulátoru se dřív bezpodmínečně kreslily i dvě čáry, po kterých se
  nejede: tečkovaná plánovací hranice polotovaru (Vůle X/Z) a `finishRefPath`
  (hotovní offset, jen rádius plátku) – u velkého rádiusu leží jen desetiny
  mm od skutečné hrubovací dráhy a splývaly s ní v „dvojčáru" (rozhodnutí
  uživatele 15. 9. 2026). Nové tlačítko REF (`js/calculators/camSimulator.js`,
  `S.showRefGuides`) je obě sjednotí pod jeden přepínač, výchozí VYPNUTO;
  SNAP na ně funguje i skryté. Čistě vykreslovací změna – G-kód/dráhy
  se nemění (otisk 29 fixtures shodný).
- **Mobil – vycentrování plátna počítá s horní HUD lištou.** `visibleCanvasRect()`
  (`js/canvas.js`) dřív rámovala jen pod ukotvenými panely dole (vysunutý
  panel nástrojů, okno „Zadání objektu"); nahoře na mobilu ale sedí ještě
  `#mobileCoordBar`/`#mobileCanvasCoords` a plovoucí kolečka mezi nimi
  (↩️↪️🧮⊙), do kterých se výkres i popisky bodů/kót mačkaly. Vycentrování
  (⊙, i ⤢ ve VK okně) teď rámuje pod ně, s rezervou navíc pro popisky
  rostoucí nad bodem.
- **Číselné zadání – tlačítko „✓ Přidat" u ručního G-kódu.** Vedle 🔄
  (nahradí konturu) přibylo ✓, které naparsovaný G-kód jen PŘIDÁ k
  existujícím objektům (`renderCncCodeToCanvas(code, {append: true})` v
  `js/storage/fileIO.js`) – pro dokreslení už hotového výkresu bez rizika
  ztráty práce. 🗑 (smazat zapsaný text) se přesunulo úplně doprava s
  odstupem od 🔄/✓, dostalo potvrzovací dialog a stiskem „Zpět" na plátně
  jde smazaný text vrátit (`bridge.consumeGcodeClearUndo`, `js/state.js`).
- **Číselné zadání – „Typ čáry" místo prosté Konstrukční čáry.** Řádek ikon
  typů objektu ztratil samostatnou ikonu Konstrukční čáry (nahradil ji
  přesun Oblouku) a přibylo tlačítko, které otevře stejný dialog „Typ čáry"
  jako hlavní plátno (6 stylů ČSN EN ISO 128 + barva); zvolený styl pak
  určuje vzhled i typ (`line`/`constr`) další číselně zadané úsečky.
- **Navázání kreslení na existující bod přebírá jeho vzhled.** Začne-li se
  kreslení úsečky (nástroj Úsečka i VK volná kontura) kliknutím/snapem na
  bod existujícího objektu, nová geometrie zdědí jeho typ čáry, barvu a –
  jde-li o polotovar – i to, že se má vložit jako polotovar místo kontury
  (`js/lineStyles.js: lineContinuationProps()`, `js/canvas.js:
  state.mouse.snappedObject`, `js/tools/lineClick.js`, `js/calculators/
  vkContour.js` + `vkCommit.js`). Nikdy nesnižuje explicitní volbu
  „Polotovar" zpátky na konturu – jen ji podle potřeby na chvíli zapne.
- **Kontrola „kontura má mezery" bere osu rotace jako uzávěr tvaru.**
  Profil se soustružnicky kreslí jen z jedné strany (od osy k ose) – osu
  samotnou (cad_y=0) uživatel nekreslí jako objekt, ale rotačně kus
  uzavírá stejně, jako kdyby tam ležela úsečka. `findContourGaps()`
  (`js/stockTools.js`) dřív takové dva volné konce na ose hlásila jako
  mezery u KAŽDÉHO běžně nakresleného profilu. Teď se volný konec ležící
  na ose (tolerance 0,01 mm) nepočítá jako mezera; skutečná přerušení
  mimo osu (i jen jeden konec mimo ni) se hlásí beze změny.

  K tomu: hláška „kontura má mezery" (`fileIO.js` export G-kódu i
  `stockTools.js` válcový polotovar) má teď u položky ve frontě
  zvonečku (viz níže) 🎯 akci – klik přiblíží/vycentruje CAD plátno
  přesně na nalezené mezery (`jumpToContourGaps()`), takže je není
  třeba hledat ručně ve výkresu.

- **Mobil – hlášky (toast) při kreslení/otevřeném okně nezasahují do
  formuláře.** Klasický toast dole na obrazovce (`showToast()`) při
  rozdělaném kreslení nebo s otevřeným plovoucím oknem (VK/Číselné
  zadání, kalkulačka…) skákal přes právě používaný formulář/tlačítko OK.
  Na pokyn uživatele: v těchto dvou situacích (a jen na mobilu) se teď
  hláška místo toho jen naznačí zvonečkem 🔔 v horní liště vedle
  SOU/ABS/R/#/∠/📐 (`#mobileNotifyBadge`) – klepnutím se zobrazí
  posledních až 6 hlášek v panelu pod ním (`#mobileNotifyPanel`,
  `js/state.js: shouldDeferToast()/deferToast()`). Mimo tyhle dvě
  situace a na desktopu se nic nemění.

  Doplněno na další nahlášený případ: `shouldDeferToast()` zprvu
  kontrolovalo jen rozdělané kreslení a otevřené okno, ne vysunutý panel
  nástrojů (#topbar.mobile-open) ani boční panel Objekty
  (#sidebar.mobile-open) – toast přes ně skákal úplně stejně, jen se to
  nestihlo odchytit napoprvé. A protože autosave volá „Projekt uložen"
  po KAŽDÉ editaci (3 s debounce), i doručené do zvonečku by frontu
  zbytečně plnilo desítkami nízko-prioritních položek – `showToast()`
  má nový parametr `{quiet: true}`, po kterém jen mihne 💾 vedle
  zvonečku bez nároku na klik (`#mobileSaveFlash`, `flashSaveIndicator()`
  v state.js). Používá ho jen autosave (`storage/autoSave.js`) – ruční
  uložení (Ctrl+S, tlačítko Uložit v Nastavení) zůstává viditelné/ve
  frontě jako dřív.

### Removed
- **Ladicí zbytky z repa.** `debug_crossing.mjs`, `debug_internal_gear.mjs`,
  `scripts/_nobridge.mjs`, `scripts/_cam_face_debug_new.mjs`,
  `scripts/_noबridge.mjs` (rozbitý název souboru – devanágarí znak místo
  „b") a nepoužitá fixture `scripts/user_face_new.camprog` – nikde v repu
  na ně nic neodkazovalo.

### Fixed
- **CAM – vrstvy v úseku nešly od vrchu a kužel polotovaru sebral jeden
  průchod „přes celý plátek".** Vjezd, který zůstal stát na hranici úseku
  proto, že se na nalezené kotvě (`zCap`) nedal vést řez, si dál vynucoval
  rampu; ta kotvu nenašla a hloubka tiše vypadla
  (`js/calculators/cam/ops/roughLong.js`). Na dílu uživatele tak z úseku
  Z 127,6…172,5 zmizely hloubky 46,618 až 31,618 a celý kužel Z 148…159 pak
  vzala uzavírací bisekce na X 30,715 – **78,7 mm² jedním 11mm pohybem,
  tříska 7,0 mm = 2,8× ap** (`N2020 G1 Z148.208`), plus 42,8 mm radiálního
  výjezdu pracovním posuvem. Escape „na hranici úseku je nad břitem vzduch,
  rampa není potřeba" teď pokrývá i tenhle případ (s přísnějším testem:
  povrch musí být pod BŘITEM, ne pod středem nosu) a zároveň ruší odložení
  vjezdu na konec úseku – kvůli němu jely vrstvy AŽ ZA hlubší bisekcí a
  naprázdno. Žebřík jde 49,118 → 46,618 → … → 19,143, každý průchod ukrojí
  0,04–1,79 mm; radiální výjezd posuvem zmizel. Úběr 76,4 → 76,5 %,
  průchodů 63 → 70, kolize 0/0 beze změny. Otisk 29 fixtures se hnul jen
  u `part-22-round-r10`. Podrobnosti `docs/cam-pravidla-drah.md` §3.1.
- **CAM – žebřík vrstev se u kulaté destičky uprostřed úseku tiše utnul.**
  Kotva rampy pro vjezd na hranici úseku se hledala testem `surfX >
  currentX` (`js/calculators/cam/ops/long/openPass.js` a jeho dvojče
  v `ops/roughLong.js`), jenže `surfX` je POVRCH offsetové čáry a
  `currentX` poloha DRÁHY (střed nosu) – u kulaté destičky se liší
  o rádius nosu (`noseLiftX`, u ostatních tvarů 0). Kotva se proto
  zamítla pokaždé, když povrch ležel mezi břitem a středem nosu, a
  `if (!rampOk) return` zahodil celou hloubku i s materiálem pod ní.
  Na dílu uživatele (kulatá R 10, odlitek) žebřík v úseku Z 127,6…172,5
  skončil na `N1930 G1 Z137.603` (X 49,118) a hloubky 26,618 / 24,118 /
  21,618 vypadly – pod nimi zůstal stát celý Ø33,5. Teď vrstvy pokračují
  po `ap` dolů a na každou se zanořuje rampou 45°. Úběr 75,0 → 76,4 %,
  největší tříska 16,5 → 10,0 mm, kolize 0/0 beze změny. Zmizel při tom
  jediný průchod, který ten pás bral celý najednou (tříska 9,6 mm ≈ 4× ap)
  a přejížděl přes hranici svého úseku (porušení
  `docs/cam-pravidla-drah.md` §6.0). Otisk 29 fixtures se hnul jen
  u `part-22-round-r10`; ostatní tvary plátku jsou bajt po bajtu stejné.
  Podrobnosti `docs/cam-pravidla-drah.md` §3.1.
- **CAM – falešná hláška „průchody jedou VZDUCHEM" u kulatých destiček.**
  Kontrola `intervalHasStock()` (`js/calculators/cam/ops/roughLong.js`) se
  ptala siluety polotovaru, jestli materiál sahá až ke STŘEDU NOSU – řeže
  ale břit, který je u kulaté destičky o rádius nosu níž. Průchody, které
  reálně ubíraly (model úběru na nich naměří desítky mm² a emise je sama
  značí „Přejezd materiálem posuvem"), se proto hlásily jako jízda
  naprázdno. Bylo to vidět i z toho, že polygon měl vždy 0 a u kulaté počet
  rostl s rádiusem (R 5 → 4, R 8 → 13, R 10 → 14). Sousední `stockZRangeAt`
  i `stockCrossingsAt` ten člen odečítaly odjakživa; teď i tahle kontrola.
  Dráhy se nemění (otisk 29 fixtures shodný), mizí jen ta hláška.
- **CAM/Heidenhain – spojení programů dopisovalo sinumerikové `STOPRE`.**
  `mergePrograms()` (`js/calculators/cam/gcodeMerge.js`) vynechávala `STOPRE`
  před výměnou nástroje jen u Fanuca (`dialect !== 'fanuc'`), ačkoli
  Heidenhain ho nezná úplně stejně – generátor hlaviček to má v repu správně
  („Heidenhain (ISO dialekt): bez STOPRE"). Dosud to nešlo vyvolat, protože
  automatická detekce dialektu umí jen Fanuc × Sinumerik; dosažitelné to je
  od chvíle, kdy CNC Editor předává skutečný řídicí systém parametrem (viz
  níž). Podmínka teď zní „jen Sinumerik"; hlídá `tests/cam-dialect-parser`.
- **CAM – hloubky u hranice regionu se zahazovaly celé, i když šlo obrobit
  narovinu.** Vjezd, který sedí přesně na hranici mezi dvěma sousedními
  úseky (region roughing, odlitek), procházel hledáním kotvy RAMPY
  (`holderEntryCapZ` v `ops/long/entryRamp.js`) – tá hledá místo, kde nad
  hloubkou řezu ještě STOJÍ materiál, aby se dalo šikmo zajet. Na rovné
  nebo kuželové stěně bez „bosu" (přesně nález uživatele: hloubky
  44,566/42,066/39,566 mm v úseku dlouhém 145 mm) žádné takové místo
  neexistuje, takže hledání selhalo VŽDY – i když byl vjezd samotný
  (bez rampy) pro držák bezpečný – a `ops/roughLong.js` i navazující
  `emitOpenInterval` (`ops/long/openPass.js`) celou vrstvu v CELÉM úseku
  zahodily. Teď se nejdřív zeptá narovinu (`holderFitsAt(entryZ,
  currentX)`); jen když je i tohle nebezpečné, vrstva se vynechá jako dřív.
  Na díle uživatele (kulatá destička R 10/12) úběr materiálu +1,9 procentního
  bodu, kolize beze změny (`scripts/cam_quality.mjs`, `scripts/cam_sweep.mjs`,
  `tests/collision-validator`, `tests/material-removal`).
- **CAM – mezní čára zanoření končila na SYROVÉM polotovaru, ne na
  offsetové čáře.** `computeInterferenceGuides` (`js/calculators/cam/
  interferenceGuides.js`) ořezávala mezní čáry syrovou siluetou odlitku
  a přičítala vůli jen v ose X, ačkoli offsetová čára (Přídavek X/Z
  polotovaru) je anizotropní – čára tak končila dřív, než kde materiál
  doopravdy je. Nově se ořezává o vůlí-posunutou smyčku polotovaru;
  zrušena i výjimka pro zadní čelo, kde platilo totéž. Na díle uživatele
  úběr +2 012 mm², kolize „nakreslený nůž" beze změny (3/5,8 mm²).
- **CAM – vypuklý oblouk s rozvinem 180° a víc se odsazoval na OPAČNOU stranu.**
  `buildRawOffsets()` (`js/calculators/cam/toolOffset.js`) rozlišoval konvexní
  od konkávního porovnáním středu kružnice se středem TĚTIVY. Tětiva ale leží
  mezi středem kružnice a obloukem jen do rozvinu 180°: přesně na 180° splyne
  se středem kružnice a nad 180° se převáží na druhou stranu. Půlkulový hrb
  (konce oblouku i střed kružnice na stejném X – běžný tvar) se proto
  vyhodnotil jako drážka a dráha šla dovnitř materiálu: na r 5 s plátkem
  R 0,8 vyšel offset r 4,200 místo r 5,800, tedy 1,6 mm POD hotovou konturu.
  Rozhoduje teď střed OBLOUKU, který od středu kružnice leží na straně
  vypuklosti v každém rozvinu. Pod 180° je to bitově táž odpověď jako dřív
  (otisk 29 fixtures beze změny), mění se výhradně oblouky ≥ 180°.
- **CAM/Fanuc – `G28 U0 W0` se simulovalo jako přejezd na X0 Z0 skrz obrobek.**
  `parseManualGCodeToPath()` (`js/calculators/cam/gcodeParser.js`) četl
  přírůstkové adresy `U`/`W` jednou třídou znaků s absolutními `X`/`Z`
  (`[XU]`, `[ZW]`), takže nulový PŘÍRŮSTEK bral jako absolutní NULU. Fanucká
  hlavička i závěr programu (`controlDialect.js`) ten blok vydávají, takže
  každý, kdo si přepnul „Řídicí systém" na Fanuc, dostal v simulaci hned na
  začátku rychloposuv do osy a na konci programu dokonce POSUV (dědil se
  modální G1) – tedy falešné zajetí v ⛔ panelu i nesmyslný odhad času
  a délky dráhy. `U`/`W` se teď čtou jako přírůstek k aktuální poloze
  (v režimu DIAMON je `U` průměr, stejně jako `X`).
- **CAM – přepnutí řídicího systému mohlo smazat celý program.**
  `convertGCodeControlSystem()` hledá konec hlavičky podle dělicího
  komentáře, jinak podle prvního G1/G2/G3. Když nenašel ani jedno (program
  bez řezných pohybů – jen rychloposuvy, cykly a M-kódy – a bez dělicího
  komentáře), nastavil začátek těla na konec souboru, tělo vyšlo prázdné
  a z programu zbyla jen nově vygenerovaná hlavička. Teď se v tom případě
  hlavička nevyměňuje a text zůstává celý.
- **CAM – prázdná „Bezpečná poloha Z" dělala v dráze `NaN`.** `safeX` mělo
  `|| 0`, `safeZ` ne; první bod simulované dráhy pak měl `z: NaN` a odtud to
  teklo do délky, času i do kontroly prvního bloku.
- **CAM – import kontury z G-kódu četl souřadnice z komentářů.**
  `_parseGCodeRange()` neodřezával komentář za kódem, takže `G0 Z2 ; najedeme
  nad X50` dalo bod X50 Z2 místo pouhého Z2.
- **CAM – Fanuc/Heidenhain hlavička neřekla, jestli je X průměr, nebo poloměr.**
  Souřadnice X se podle přepínače „Průměr/Poloměr" emitují dvojím způsobem,
  ale DIAMON/DIAMOF je sinumerikové slovo – u Fanuca ani u Heidenhainu ISO na
  to G-kód není (rozhoduje strojní parametr, u Fanuca č. 1006 bit 3). Program
  si režim nemá jak vynutit a při nesouladu by všechny radiální rozměry vyšly
  dvojnásobně jinak. Hlavička to teď aspoň vysloví komentářem, a je-li program
  psaný v POLOMĚRECH, řekne to důrazně. (Není to záruka – tu dá jen správně
  nastavené řízení.)
- **CAM – spojení fanuckých částí vyrobilo nepřeložitelný program.**
  `mergePrograms()` (`js/calculators/cam/gcodeMerge.js`) dopisuje vlastní
  řádky (značka části, M3/M8/M5/M9, `STOPRE` před výměnou nástroje) a měla je
  natvrdo v sinumerikovském zápisu. Fanuc neumí ani `;` komentáře, ani
  `STOPRE`. Dialekt se teď odvodí z kódu první části (lze i předat parametrem).
- **CAM – `camSimulator.js` byl pro git a grep binární soubor.** V klíči keše
  (`calcCacheKey`) byl jako oddělovač zapsaný SUROVÝ NUL bajt místo escape
  sekvence. Git kvůli němu soubor nediffoval, negrepoval a jako jediný
  v repozitáři ho ukládal s CRLF konci řádků. (První commit po téhle opravě
  proto ukáže normalizaci konců řádků přes celý soubor; skutečná změna obsahu
  je jediný řádek – `git diff --ignore-cr-at-eol` to ukáže.)
- **Mobil – vycentrování končilo z poloviny pod oknem „Zadání objektu".**
  `visibleCanvasRect()` (`js/canvas.js`) si ukotvený panel musela nejdřív
  „ověřit" testem, jestli sedí na spodním okraji plátna. Na mobilu ten test
  neplatí: plátno je tam vyšší než displej (`100vh` na Androidu je výška se
  SCHOVANÝM adresním řádkem), kdežto panel je `fixed; bottom: 0`, takže se
  drží spodku VIDITELNÉ plochy – o ten kus výš. Hrany si neodpovídaly, panel
  se vůbec nezapočítal jako překážka a rámovalo se doprostřed celého plátna.
  V emulaci na desktopu se to neprojevilo (tam se plátno s displejem kryje),
  takže to vypadalo jako chyba „jen na mobilu". Test je pryč – měřená HORNÍ
  hrana panelu je rovnou spodní hrana kreslicí plochy (+8 px odstup), což
  platí bez ohledu na adresní řádek, výšku okna i výšku panelu. Výřez se
  navíc ořezává vizuálním viewportem, takže kresba nezaleze pod adresní
  řádek ani bez otevřeného panelu, a `resizeCanvases()` posloucháme i na
  `visualViewport` (posun adresního řádku `resize` okna nevyvolá).
  Když na výšku nezbývá místo (nízký displej naležato), ubírá se NAHOŘE –
  spodní hranice panelu se nikdy neposouvá dolů.
- **⤢ ve VK okně rámovalo podle zastaralého textu G-kódu, ne podle kresby.**
  Pole „Ruční zápis G-kódu" je scratch pad nezávislý na plátně
  (`appendGcodeForObject()` do něj jen PŘIDÁVÁ, Zpět/smazání objektu z něj
  nic neubere), takže po pár úpravách obsahovalo text, který s aktuální
  kresbou nesouvisel – a `fitCadViewToNumPreview()` dávalo přednost jemu.
  Teď má přednost `state.objects` (přes stejné `autoCenterView()` jako běžné
  vycentrování); textarea/živý náhled zůstávají jen pro prázdné plátno.
- **Mobil – písmenková klávesnice místo číselné v Číselném zadání.** Pole
  dostávala `inputmode="decimal"` jen z globálního hlídače v `js/dialogs.js`,
  který sahá na overlay v okamžiku vložení do DOM. Formulář se ale překresluje
  při každé změně typu prvku i po každém OK, takže nově vzniklá pole ho už
  neměla. `updateFields()` ho teď aplikuje sám.
- **Číselné zadání – vyplněné „R / sražení" se potichu zahodilo.** Když roh
  nevznikl (např. po 🎯 výběru se X1/Z1 přepsalo jinam, řádek ale zůstává
  vidět), `applyInlineCornerIfRequested()` skončila bez jediného slova.
  Teď hlásí „Roh se nenašel…" – a `createAnother()` tu hlášku nepřepíše
  hláškou o pokračování řetězu ani „Pohled vycentrován" (`autoCenterView()`
  dostala nepovinný `quiet`), takže si ji uživatel stihne přečíst.
- **Mobil – popisky tlačítek panelu nástrojů se lámaly na dva řádky.**
  `.tool-btn` dostal `white-space: nowrap` a fluidní `font-size` přes
  `clamp()` místo pevných 10 px – řádky po 4 tlačítkách drží na širším
  i užším telefonu, na opravdu úzkém displeji se raději rozdělí řádek,
  než aby se zalomil text.
- **PWA – nasazené opravy se k uživatelům nedostaly.** `sw.js` se od února
  neměnil, a protože prohlížeč hlídá aktualizaci Service Workeru porovnáním
  BYTŮ tohohle jediného souboru, o nových verzích JS/CSS se vůbec nedozvěděl
  a dál servíroval starý cache. Cache verze se teď zvyšuje spolu s nasazením
  (`npm run sw`); do ASSETS zároveň přibyl dřív nezaregistrovaný
  `vitest.cad.config.js`.

- **Mobil – kalkulačka zmizela, když bylo otevřené VK/Číselné zadání.**
  `updateCalcBtnVisibility()` schovávala plovoucí tlačítko 🔢 při JAKÉMKOLI
  otevřeném `.calc-overlay` – včetně nového nemodálního okna „VK/Číselné
  zadání", které (na rozdíl od starých blokujících dialogů) nechává plátno
  pod sebou klikatelné. Teď se schovává jen u BLOKUJÍCÍCH oken (a u
  kalkulačky samotné – druhé otevření by stejně jen narazilo na pojistku
  proti duplicitě), takže zůstává dostupná i s otevřeným VK/Číselným
  zadáním a jde z ní přes ⤓ vložit výsledek přímo do rozepsaného pole
  (X/Z) – ověřeno, kalkulačka se po vložení sama zavře, VK zůstane otevřené.


- **Mobil – dlouhé podržení (precision pointer) nereagovalo na plovoucí
  tlačítka (kalkulačka, centrování…).** Křížek se kvůli offsetu od prstu
  (`GLOBAL_OFFSET_Y`) hledá `elementFromPoint` NAD/POD skutečnou pozicí
  prstu – u hustě natěsnaných indikátorů (SOU/ABS/R) to dává smysl (přesné
  míření mezi malými sousedy), ale u řídce rozmístěných kulatých tlačítek
  (🔢 kalkulačka, ⊙ centrování…) posunutý bod často trefil jen prázdné
  plátno a podržení „nic neudělalo" – žádný rámeček, žádná bublina s
  názvem tlačítka. `highlightGlobalAt()`/`clickGlobalAt()` v `touch.js`
  teď mají fallback: když na posunuté pozici nic klikatelného není, zkusí
  to ještě přímo pod prstem. Přesné míření mezi hustými prvky zůstává
  beze změny.

- **Mobil – počítadlo výběru („N bodů") překrývalo nové souřadnice na
  plátně.** Kreslilo se natvrdo na `y = 90` v canvasu, což je skoro
  přesně tam, kam teď (viz níže) patří `#mobileCanvasCoords` – posunuto
  na `y = 124`, ať jsou čitelné obě.

- **Mobil – indikátory SOU/ABS/R a #/∠/📐 se konečně daly přepínat.**
  `mobileCoordBar` měl vlastní `click` handler, co pro JAKÝKOLI klik v liště
  volal `e.stopPropagation()` (komentář „Tap na coord bar (info pouze)" – z
  doby, kdy lišta byla čistě informativní). Tím ale klik nikdy nedoběhl do
  `document`, kde na něj čeká delegovaný přepínač (`ui.js`) sdílený s
  desktopovým stavovým řádkem – klepnutí na SOU/ABS/R apod. tak na mobilu
  nikdy nic nepřepnulo. Handler teď klik na `.coord-ind` propustí dál.

- **Mobil – klávesnice už nevyskakuje přes dialog.** Po nakreslení úsečky se
  otevře dialog s PŘEDVYPLNĚNÝMI hodnotami, ale `h1.focus()` (a u jiných
  dialogů atribut `autofocus`) hned vytáhl softwarovou klávesnici. Ta zakryla
  dialog včetně tlačítka OK, takže ji uživatel musel pokaždé nejdřív zavřít,
  aby mohl potvrdit.

  Nový helper `focusInput()` v `dialogFactory.js` fokusuje jen tam, kde tím
  klávesnice nevyjede (`isTouchDevice()` = médiový dotaz `(pointer: coarse)`),
  a `makeOverlay()`/`makeInputOverlay()` na dotykovém zařízení strhnou
  `autofocus` před vložením do DOM. Na mobilu tak klávesnice vyjede teprve
  klepnutím na pole, které chce uživatel změnit (klepnutí obsah pole zároveň
  označí, takže ho psaní přepíše); **na desktopu se nemění nic** – první pole
  je dál zaostřené a vybrané.

  Opraveno ve všech dialozích kreslení a úprav: po nakreslení (úsečka, bod,
  kružnice, obdélník, kontura i jednotlivý segment kontury), poloměr kružnice,
  bulge, úsečka pod úhlem, polární kreslení, číselné zadání, tečna, offset,
  pole (řadové i kruhové), rotace, zaoblení/sražení, měřítko, nulový bod,
  velikost mřížky a krok úhlu. Zaostření po klepnutí na tlačítko režimu
  (např. Zaoblení × Sražení) se řídí stejným pravidlem. Nedotčené zůstaly
  dialogy, jejichž jediný smysl je psát text – TEXT nástroj, „Uložit jako",
  import G-kódu.

### Changed
- **CNC Editor – „🔗 Spojit do jednoho" umí i Fanuc/Heidenhain, ne jen
  Sinumerik.** `cncEditor.js` měl vlastní, dřív nezávisle udržovaný fork
  spojování programů (`splitHeaderBody`/`classifyHeaderLine`/
  `renumberLines`/`mergePrograms`) – chybělo mu rozpoznání dialektu,
  vynucený nájezd do referenčního bodu při výměně nástroje
  (`TOOL_CHANGE_FORCED`) a fanucké `( … )` komentáře, které dostal sdílený
  `cam/gcodeMerge.js` (CAM Editor/Simulátor) postupně od 15. 9. 2026. Fork
  smazán, CNC Editor teď importuje `cam/gcodeMerge.js` a předává mu
  aktuální řídicí systém.
- **Číselné zadání – kompaktnější a přehlednější formulář úsečky.**
  Na pokyn uživatele: výchozí typ po otevření okna je teď Úsečka (dřív
  Bod). Sražená ikona rohu (dřív unicode „⌿", vypadala jako přeškrtnutá
  čára) je nahrazená SVG piktogramem – L roh s uříznutou špičkou. Pole
  „Roh s předchozí" ztratilo popisek nad sebou (kontext dávají už tlačítka
  Zaoblit/Zkosit vedle), placeholder je teď „R / sražení" místo obecného
  „R / vzdálenost" (zkrácené na `.num-corner-input-col` pole, ať zabírá
  jen tolik, kolik potřebuje na text – dřív `flex:1` táhlo obdélník přes
  zbytek řádku – a bez zděděného `margin-bottom`, který ho svisle
  vyosoval proti tlačítkům Zaoblit/Zkosit vedle), a celý řádek se
  přesunul AŽ POD Délka/Úhel (dřív mezi X2/Z2 a Délka/Úhel). Souřadnicová
  pole (X1/Z1, X2/Z2 aj.) mají popisek
  vedle pole na stejném řádku místo nad ním (nová třída `.num-coord-field`
  – záměrná výjimka z `.input-dialog label { display:block }`, viz
  komentář v `style.css`) – formulář je o pár řádků nižší, na mobilu je
  vidět víc najednou bez scrollování.

- **Mobil – horní lišta přehledněji.** Indikátory SOU/ABS/R a #/∠/📐 jsou
  teď skutečná dotyková tlačítka (`min-height` ~26 px, viditelné pozadí a
  okraj) místo drobných odznaků, a souřadnice (X/Z) + přiblížení se z lišty
  přesunuly přímo na plátno – bílý text bez podkladu pod plovoucími tlačítky
  (kalkulačka, magnet, centrování…), aby lišta zůstala jen na přepínače.

- **CAM – po už projeté dráze se jede rychloposuvem.** Dojezd „bez schodků"
  se drží kontury, takže kroky zanořovacího řetězu v kapse přelezou týž hrb
  pokaždé znovu: `part-1` vydával **třikrát** `G1 X39.110 Z70.607` (3 × 34,4 mm
  posuvu), přes celou sadu **47 doslovných duplicit a 983 mm**. Zahodit ty
  úseky nejde (ořez dojezdu posune 45° odskok — změřeno a zamítnuto, viz
  `docs/cam-pravidla-drah.md` §5.3b), ale jet je posuvem není třeba.

  Úsek, který podle DYNAMICKÉHO zbytku nemá co ubrat, se teď přejede
  rychloposuvem (`; Po už projeté dráze`). **Geometrie se nemění** — tentýž
  bod A → tentýž bod B, mění se jen druh pohybu, takže nemůže vzniknout žádná
  nová kolize. Podmínky jsou tři: značka z plánovací evidence duplicit
  (výkonová brána — bez ní šel `tests/cam-finish-holder` z 52 s na přes 90 s),
  dotaz na zbytek PLNOU stopou destičky s prahem 0,01 mm² (řádově pod
  0,5 mm² u `rapidHitsStock`) a JEN JEDNOOSÝ pohyb — `G0 X… Z…` může na
  některých řídicích systémech jet nelineárně, čímž by se trasa mezi A a B
  změnila.

  Změřeno: duplicity **47 → 19** pohybů a **983 → 133 mm**, posuv naprázdno
  přes sadu **8 109 → 7 201 mm** (16,9 % → 15,3 %). `cam_sweep` bajt po bajtu
  stejný (úběr 87 757,5 / 90 507,7 mm², kolize 3 / 5,8 a 0 / 0,0) a
  `ContourGouge` 48,91 mm² beze změny — přesně jak vyplývá z nezměněné
  geometrie. Podrobně `docs/cam-pravidla-drah.md` §5.4.


### Changed
- **CAM – hloubková mřížka je PER ÚSEK, ne jedna pro celý díl.** Žebřík byl
  kotvený na největším průměru CELÉHO dílu, takže úsek s nižším vrchem dostal
  první vrstvu tak silnou, jak zrovna padla globální mřížka. Na dílu uživatele
  11. 9. 2026 vyšla vlevo (polotovar r 38,566, offsetová čára 39,566) první
  hloubka 39,545 — **tříska 0,021 mm**: *„lízne kvůli tomu jenom tu vrchní
  dráhu"*. Druhý příznak: shodné hloubky v různých úsecích (`X47.045` v prvním
  i druhém).

  Každý úsek si teď staví vlastní žebřík od vrchu SVÉ offsetové čáry
  (`buildDepths` + `loopTopXIn` v `ops/roughLong.js`), takže první tříska je
  rovnou `ap` a skim vrstva degeneruje na nulu. Globální žebřík zůstal bitově
  stejný pro DETEKCI ÚSEKŮ (`regions.js`) — dělení dílu se měnit nemělo.

  Vedlejší efekt na dílu uživatele: zmizel průchod „kapsa po kontuře“ v Z
  107–124 (`N2010 G1 X39.045 ; Výjezd v X (stěna)`), který z těch 17 mm dráhy
  vyřezal 1,96 mm² a zbytek jel po dráze předchozí rampy.

  Změřeno na 29 fixtures (`cam_sweep`): **kolize 7 / 121,3 mm² → 3 / 5,8 mm²**
  (nakreslený nůž), 0 / 0,0 beze změny (náhradní držák); průchodů 1402 → 1381;
  **zajetí do hotové kontury 84,1 → 48,9 mm²**; úběr −16,2 / −508,9 mm². Ten
  pokles je ve DVOU dílech a oba jsou rozebrané v `docs/cam-pravidla-drah.md`
  §5.3: `part-13-zleva-flange` −220,8 (poslední vrstva nedosedne na dno úseku,
  doložená mez) a `part-20-zleva-parting-taper` −305,3 (přestal vznikat jediný
  zápich 15,2 mm kolmo při ap 3). Otisk se hnul u 23 fixtures; snapshoty
  obnoveny záměrně.

- **CAM – u odlitku četlo sledovací dno pole Délka dřív než siluetu.**
  `cylStockZ` (`ops/roughLong.js`) se ptalo siluety až za podmínkou
  `len !== 0`, takže vyplněná Délka dno OŘÍZLA — `part-1` Délka 5 → dno
  −5,000, ačkoli silueta končí na −10,000. Dojezdy schodů, výjezdy z kapes
  i cíle ramp se opíraly o zeď 5 mm nad koncem materiálu. U odlitku rozměry
  válce neříkají nic, takže se teď silueta ptá PRVNÍ. Roky to nebylo vidět,
  protože se o dno žádná dráha neopřela — odkryl to vlastní žebřík úseku.

- **CAM – výjezd na začátek dojezdu se zahazoval na `1e-6` a emise místo něj
  nakreslila diagonálu skrz konturu.** Konec průchodu je ze SKENU
  (`refineEngageZ`), začátek dojezdu z ANALYTICKÉHO offsetu — na svislém čele
  se liší o setiny (`part-1`: 257,524 proti 257,514, tedy 0,010 mm). Přesná
  podmínka v `leadOutClimb` (`ops/roughEmit.js`) radiální výjezd zahodila
  a `emitLeadOutLine` pak jela z konce průchodu rovnou na konec prvního úseku
  dojezdu: `G1 X31.440 Z238.641` z X 28,940 = **14,4 mm² do hotové kontury**
  r 29,94 (`part-1`, `part-2`). Tolerance je teď `LEADOUT_CLIMB_DZ` 0,05 mm
  a jen na bezpečné straně ve směru řezu. Hlídá `tests/cam-gouge-invariants`.

- **CAM (test) – dojezd proti offsetové čáře se měřil 1-D.**
  `tests/cam-leadout-air-rapid` porovnával X při pevném Z; kde je hranice
  skoro rovnoběžná s osou X, z posunu 0,08 mm KOLMO vyjde 0,405 mm v X
  a test spadl, ačkoli dojezd na čáře stál. Měří se teď kolmá vzdálenost od
  offsetové smyčky — přísnější a bez té pasti.

### Fixed
- **CAM – dráha končila na kůře odlitku, ne na offsetové čáře.** Na otázku
  „kde má průchod skončit" odpovídaly DVĚ nezávislé logiky s různým modelem
  polotovaru: plán (`stockZRangeAt` v `ops/roughLong.js`) četl SYROVÝ řetěz
  obrysu, kdežto emise (`offsetExitZ` v `gcodeEmit.js`) konec dodatečně
  prodlužovala na offsetovou čáru — ale jen v okně **4× Přídavek**. Na hraně
  skoro rovnoběžné s osou Z se kolmý posun o Vůli podél Z natáhne
  1/sin(sklon), okno nestačí a průchod zůstane stát na kůře. Nález uživatele
  11. 9. 2026 (oblouk R18, Vůle 1 mm): `N1580 G1 Z119.340` místo Z 116,835,
  tedy **2,5 mm** neobrobeno; o hloubku vedle, kde vzdálenost vyšla 1,6 mm,
  dráha na čáru dojela — proto to vypadalo nahodile.

  Opraveno na JEDNOM místě, jak zní pravidlo v `docs/cam-pravidla-drah.md`
  §5 („syrová čára polotovaru neexistuje"):
  - `stockZRangeAt` měří na **vůlí-posunuté siluetě** (`stockLoopOffsetFullL`)
    — dno i vjezd průchodu tedy sedí na téže čáře jako všechny výjezdy.
  - Booleovský obal zbytku (`ops/long/intervalScan.js`) bere Z-rozpětí rovněž
    z offsetové smyčky; jeho X-mez (`planTopX`) offsetová už byla, takže obal
    končil o Vůli Z dřív než dno průchodu (levý konec dílu dojel na Z −8,000
    místo Z −9,000).
  - Prodloužení v emisi (`ops/roughEmit.js`) dostalo strop `pass.zEnd`:
    odsazení „ještě o Vůli Z" je jen náhradník pro nenalezenou hranu a bez
    stropu se přičítalo i tam, kde průchod na čáře už stál — výjezd ji pak
    přejel o celou Vůli Z (naměřeno 1,000 mm na každém otevřeném konci).

  Měřeno na 29 fixtures (`scripts/cam_fingerprint.mjs` + `scripts/cam_sweep.mjs`):
  otisk se hnul u **23**, úběr **+349,6 mm²** (nakreslený nůž) a
  **+182,9 mm²** (náhradní držák), **kolize beze změny** — 7 / 121,3 mm²,
  resp. 0 / 0,0 mm². `collision-validator`, `material-removal` i
  `cam-traversal-invariants` 81/81 zeleně; snapshoty `cam-gcode-regression`
  a `cam-boolean-gcode-regression` obnoveny záměrně.

  Filtr v `tests/cam-leadout-air-rapid` („přesun v kapse") dostal podmínku
  `m.z0 > 20`: bral i NÁJEZD dalšího průchodu zvenčí, který teď stojí před
  offsetovou čarou a sjíždí proto celý rychloposuvem (prokazatelně vzduch).
  Tři skutečné přesuny v údolí Z≈29–60 zůstávají beze změny.
- **CAM – polygonální plátek se pořád zanořoval KOLMO.** Pravidlo „poslední
  kousek na hloubku jde šikmo pod úhlem zanoření“ (`rampedApproach`) měla
  zapnuté jen kulatá destička. U polygonu se ten kousek — dlouhý `Vůle X + R` —
  sjížděl radiálně, tedy pod 90°, i když měl uživatel nastavených 10°.
  A protože jeho délka je `Vůle X + R`, **rostl s rádiusem plátku**: 1,80 mm
  při R 0,8, 2,30 mm při R 1,3. Nález uživatele 10. 9. 2026
  (`N2550 G1 X49.525`, `N2390 G1 X17.045`, …).

  Měřeno na obou jeho souborech (polygon, ap 2,5, úhel zanoření 10°):

  | | R 0,8 | R 1,3 |
  |---|---|---|
  | řezy strmější než 10° | 8 → **4** | 9 → **5** |
  | z toho svislých (90°) | 7 → **3** | 9 → **5** |
  | největší tříska | 3,053 mm (beze změny) | 3,553 mm (beze změny) |
  | třísek nad ap | 1 (beze změny) | 4 (beze změny) |
  | duplicitní dráhy | 0 (beze změny) | 1 (beze změny) |
  | kolize syrové/offsetové | 0 / 0 (beze změny) | 0 / 0 (beze změny) |

  Na celé sadě: `cam_sweep` hlásí **kolize 7 / 121,3 mm² beze změny**
  (nakreslený nůž) a **0 / 0,0 mm²** (náhradní držák), úběr +0,7 mm²
  z 87 424 (šum). Otisk se hnul u 19 z 29 fixtures (všechny polygonální);
  `collision-validator`, `material-removal` i `cam-traversal-invariants`
  81/81 zeleně. Snapshot `cam-gcode-regression` obnoven — kromě
  `part-17-long-parting` a `part-22-round-r10`, kterých se změna netýká
  a jejichž starší drift zůstává červený schválně.

  **Zbylé svislé sjezdy jsou doložené:** couvnutí v Z tam neprojde testem
  proti materiálu/držáku, takže zůstává radiální sjezd (týž doložený zbytek
  jako u kulaté).

### Known issues
- **CAM – změna rádiusu plátku zhorší výsledek (polygon).** Týž díl, jen
  R 0,8 → R 1,3: třísek nad `ap` **1 → 4**, největší tříska 3,053 → 3,553 mm,
  duplicitní dráhy **0 → 1**. Konkrétně vzniká navíc „Průchod 37 (kapsa po
  kontuře)“, jehož nájezd **doslova znovu projede dojezd Průchodu 32**
  (`X40.043 Z138.972 → X41.818 Z129.028`) a pak spadne **6,822 mm radiálně**
  (`N2050 G1 X32.045`) — z toho 3,18 mm do materiálu, tedy nad `ap` 2,5.
  `makeChainRegistry` to nezachytí, protože ořezává jen souvislý PREFIX
  nájezdu a duplicitní část leží až za prvním (nepřekrytým) úsekem.
### Changed
- **CAM – tvar plátku už do generátoru drah nezasahuje napřímo.** Audit našel
  **devět rozhodnutí** o tvaru destičky, která žila MIMO `cam/inserts/`
  a sahala do generování drah (`prms.toolShape === '…'` v `camMath.js`,
  `contourBuild.js`, `interferenceGuides.js`, `materialRemoval.js`,
  `toolEnvelope.js`, `calculatePipeline.js`, `ops/finish.js`,
  `threadHelpers.js`). Kvůli nim mohla oprava pro jeden plátek přepsat dráhy
  ostatním — letos se to stalo dvakrát. Nově jsou to klíče v pravidlech plátku
  (`plungeAngleMaxDeg`, `autoPlungeAngleDeg`, `hasFlankGeometry`,
  `faceBodyZFromWidth`, `footprintIsNoseOnly`, `bodyInCollisionEnvelope`,
  `hasGrooveProfile`, `finishAlongEnvelope`, `canPartOff`, `partOffCornerR`)
  a sdílený kód se ptá jen jich.

  **Čistý refaktor, doloženo měřením:** otisk 29 fixtures **SHODNÝ** a G-kód
  tří uživatelových `.camprog` (polygon 5°/10°, kulatá 45°) bajt po bajtu
  stejný proti `HEAD` ve worktree.

  Nový přehled `docs/cam-tvar-platku-v-generatoru.md`: co je vytažené, kdo se
  na která pravidla ptá a **co se ještě může plést** — parametry tvaru
  (`toolAngle`, `toolTipAngle`, `toolLength`) se v osmi sdílených modulech
  pořád čtou napřímo a tři z nich to nemají čím zarazit.

### Known issues
- **CAM – malý úhel zanoření rozhodí konec dílu (polygon).** Rampa dodělání
  se kontroluje proti hotovní kontuře, ale ne proti ZBÝVAJÍCÍMU materiálu,
  a její strop „nejvýš jedna Hloubka (ap)“ platí jen v ose X. Při 5° je to
  v ose Z 28,6 mm, takže rampa přeletí sousední hrb: na dílu uživatele
  `N2560 G1 X25.257 Z20.914 ; Rampa 5.0°` zabírá **10,02 mm při ap 2,5**.
  Při 10°/15° je největší tříska 3,05 mm. Dvě opravy změřeny a zamítnuty
  (obě zhoršily počet třísek nad ap na VŠECH úhlech i u kulaté) — rozbor
  v `docs/cam-tvar-platku-v-generatoru.md`.

### Fixed
- **CAM – pole „Úhel zanoření (°)" neměnilo mezní čáru.** Mez se u polygonu
  brala výhradně z geometrie plátku, takže po přepnutí úhlu na 5° dráhy
  rampovaly pod 5°, ale čára zůstala na 15° — dvě různá čísla pro tutéž mez.
  Nově se bere přísnější z obou (`tightenByPlungeAngle` v `contourBuild.js`)
  a úhel vydané čáry jde přes `plungeBetaDeg`.

  Měřeno na dílu uživatele (polygon R 0,8, ap 2,5, úhel 10°): řezy strmější
  než zadaný úhel **19 → 8**, doslovné duplicity **1 → 0**, řezné pohyby bez
  úbytku 106 → 96 (279 → 243 mm), kolize i zajetí do kontury **0 / 0** beze
  změny, úběr 4 545,3 → 4 507,8 mm². **Otisk celé sady je SHODNÝ** — fixtures
  mají buď `entryAngleAuto`, nebo `entryAngle` = |natočení|, nebo úhel větší.

### Fixed
- **CAM – kulatá destička se pořád zanořovala KOLMO, ne pod úhlem zanoření.**
  Pravidlo „poslední kousek na hloubku jde šikmo“ (`emitFeedToDepth`) sice
  existovalo, ale **`safeRapidTo` si sjezd emitovala sama** — její větev
  „diagonální sjezd k materiálu“ vydávala rovnou `G1 X…` a to pravidlo
  míjela, přitom tudy chodí většina vjezdů do kapsy. Na dílu uživatele to
  bylo pět svislých zápichů, dva z nich po **6,000 mm** (= `Vůle X + R`
  u R 5): `N3340 G1 X22.388`, `N4730 G1 X19.911`.

  Měřeno na dílu uživatele (kulatá R 5, ap 2,5, úhel 45°): řezy strmější než
  zadaný úhel **39 → 32**, z toho hlubší než 1 mm **15 → 8**, svislých (90°)
  řezů **18 → 11** — a šest ze zbylých jedenácti je pod 0,02 mm (doklepnutí
  konce nájezdu, ne zápich). Úběr, největší tříska, zajetí do hotové kontury
  i tvrdé kolize **beze změny**. Na sadě se hne jediná fixture
  (`part-22-round-r10`, +1 řádek) a `cam_sweep` hlásí **0 změn v úběru
  i kolizích**.

  Pět svislých sjezdů zůstává a je to doložené: dva (2,000 mm) proto, že
  šikmá varianta vjede DRŽÁKEM do materiálu, tři (3,495 mm) proto, že
  průchod je na konci dílu dlouhý jen 2,51 mm. Dvě varianty, jak to obejít
  (couvnout na druhou stranu; rampovat dopředu), jsou změřené a zamítnuté —
  první vozí nástroj třikrát přes týž kousek, druhá nechá klín, který
  příští vrstva vezme třískou 3,9 mm při `ap` 2,5. Detail
  v `docs/cam-pravidla-drah.md` §3.2c.

- **CAM – vrstva vypadla celá a další po ní ukrojila 2× `ap`.** Dojezd
  mělčího průchodu („bez schodků“) sleduje konturu za konec svého intervalu
  a kus toho následujícího na téže hloubce už obrobí; `openPass.js` proto
  tomu intervalu posune začátek dolů. Jenže posunutý začátek **už neleží na
  kontuře** — kontura v něm může být hluboko POD hloubkou vrstvy. Nájezd po
  kontuře do takového bodu vede pod vrstvu, ořez na hloubku z něj nenechal
  nic, a protože „prázdný nájezd není nájezd“, celá vrstva se zahodila.

  Na dílu uživatele (kulatá R 5, ap 2,5, podélně zprava, odlitek) tak vrstva
  **r 32,045 v pásu Z 45,5…19,8 nevzala nic** a materiál po ní sebrala až
  r 29,545 — **jedinou třískou 5,00 mm, tedy 2× ap**. Nově se u takto
  posunutého intervalu (a jen u něj — značka `leadOutCoveredTo`) trasa
  nájezdu zkrátí na poslední Z, kde je kontura ještě na hloubce vrstvy;
  nástroj po ní sjede na hloubku a tělo pokračuje odtud dolů. Kolmo se
  nezanořuje nikde, pravidlo §3.1 pravidel drah platí dál.

  Pravidlo platí JEN pro takto posunutý interval a **nikdy u upichováku**:
  `contourTouchZ` hledá bod, kde je na hloubce ŠPIČKA, ale upichovák řeže
  celou spodní hranou, takže jeho tělo tam ještě leží ve stěně (změřeno:
  0,153 mm² v hotovém dílu na `part-20-zleva-parting-taper`).

  Měřeno na dílu uživatele: největší tříska **5,00 → 2,52 mm**, třísky nad
  `ap` **2 → 0**, úběr 5 002,2 → 5 002,3 mm², zajetí do hotové kontury 0,
  tvrdé kolize beze změny (4 syrová / 2 offset, tytéž pre-existující),
  průchody 78 → 80. **Otisk všech 29 fixtures je SHODNÝ** — na sadě se
  nezmění ani bajt.

### Fixed
- **CAM – kulatá destička sjížděla na hloubku KOLMO.** Poslední kousek příjezdu
  se dojíždí posuvem a jeho délka je `Vůle + rádius nosu` — u R 5 tedy 6 mm
  svislého zápichu, u R 10 rovných 11, bez ohledu na nastavený **Úhel zanoření**.
  Nově se ten kousek u kulaté destičky sjíždí ŠIKMO pod úhlem zanoření: nástroj
  couvne v Z o `dx/tg(úhel)` do už obrobeného prostoru a odtud dojede diagonálou
  přesně na cíl (cíl se nemění, mění se jen cesta k němu). Couvnutí je
  rychloposuv a testuje se proti zbytku, plánovacímu obrysu **i držáku** — bez
  té poslední podmínky přibyla tvrdá kolize, protože držák je v Z přes 20 mm
  dlouhý a couvnutí ho odsune na neobrobenou stranu. Když test neprojde, zůstane
  dnešní radiální sjezd.
- **CAM – kotva zanořovací rampy seděla na povrchu polotovaru, ne na dráze.**
  `offsetStockTopXAtZ` vrací povrch, ale odběratelé z ní staví polohu
  programovaného bodu, který leží o rádius nosu výš — sjíždělo se tedy až
  o `R` pod kotvu.

  Měřeno na dílu uživatele (kulatá R 5, ap 2,5, úhel zanoření 45°): řezné
  pohyby strmější než zadaný úhel **57 → 43**, úběr **5 002,3 → 5 232,4 mm²**,
  zajetí do hotové kontury 0, tvrdé kolize beze změny. Obě změny jdou přes
  pravidla plátku (`rampedApproach`, `noseLiftX` v `cam/inserts/`), takže otisk
  ostatních 28 dílů je beze změny.

### Fixed
- **CAM – hrubování jelo tytéž dráhy víckrát.** Průchody „kapsa po kontuře"
  sledují JEDNU sdílenou offsetovou dráhu, takže hlubší průchod měl s mělčím
  vždycky společnou HLAVU nájezdu — a tu projel znovu. Ořez duplicit v repu
  byl, ale jen jako **všechno-nebo-nic** a podmíněný rampou, takže na tyhle
  případy nedosáhl. Nově se nájezd ořezává i ČÁSTEČNĚ: bezpečné to je proto,
  že duplicitní prefix je z definice dráha, kterou už dřívější průchod projel
  (prostor podél ní je vyříznutý), a nový začátek zůstává NA KONTUŘE, takže se
  k němu dojede běžným `safeRapidTo` — na rozdíl od zahození CELÉHO nájezdu,
  kde by vjezd spadl na vlastní hloubku průchodu a byl by z něj kolmý zápich
  (proto tam podmínka rampy zůstává).

  Změřeno na dílu uživatele (kulatá R 5): duplicitní řezné pohyby **65 → 48**,
  pohyby, které nic neuberou, **404 → 373**, posuv naprázdno **730 → 548 mm**
  (−25 %). Úběr na všech 9 dotčených fixtures **beze změny do 0,1 mm²**, tvrdé
  kolize 0 na všech 29 dílech, zajetí do hotové kontury 0.

### Fixed
- **CAM – konec dílu se u kulaté destičky rozpadal na dva úseky.** Pravidlo
  „dělí jen čára hlídání geometrie, která VYJEDE z polotovaru" mělo
  obrácený druhý konec: když v ústí údolí nebyla ŽÁDNÁ čára,
  `guideStaysInStock` hranici ponechal, ačkoli tam nic dosah neomezuje.
  U polygonálních plátků to nebylo vidět (při úhlu zanoření 15° čára
  v ústí skoro vždycky je), kulatá destička při 45° žádnou nevydá — konec
  dílu se jí proto obráběl na dvakrát, místo aby se vzal vcelku a mezera
  přeletěla rychloposuvem, jak to dělá polygon. Zároveň se do rozhodování
  začala počítat i mez zanoření kulaté destičky (dřív se přeskakovala).
  Změřeno na `part-22-round-r10`: úseky 4 → 3, průchodů 61 → 59, zajetí do
  hotové kontury 0, tvrdé kolize 0; otisk ostatních 28 dílů beze změny.

### Fixed
- **CAM – kulatá destička: Hloubka (ap) se počítala od STŘEDU nosu, ne od
  břitu.** Hloubky průchodů jsou v souřadnicích dráhy (střed nosu), silueta
  polotovaru v souřadnicích povrchu — dvě soustavy lišící se přesně o rádius
  nosu. U polygonálních plátků (R 0,4–1,2) to bylo pod rozlišením, u kulaté
  R 10 brala první tříska `ap + R`: na válci r 50 při ap 2,5 vyšel první
  průchod na X 49,25, tedy břit na r 39,25 → **10,75 mm místo 2,5**. Nově se
  kotva posloupnosti zvedá o `noseLiftX` (`js/calculators/cam/inserts/
  round.js`) a oba dotazy „sahá sem polotovar?" — `stockZRangeAt` i strop
  obalu booleovské větve s `stockCrossingsAt` — se ptají na hloubku BŘITU.
  Na dílu z odlitku měřená tloušťka třísky: **10,74 → 0,74 / 1,76 / 2,50 /
  2,50 …** (první dvě jsou skimové vrstvy nad nakreslenou siluetou, ty jsou
  tenčí záměrně) a tříska 9,76 mm přes válec r 21,803 zmizela úplně.
  Ostatní tvary mají `noseLiftX: 0`, takže se jejich mřížka nehnula.
- **CAM – zanořovací rampa mohla projet skrz hotovou konturu.** Uzavírací krok
  zanořovacího řetězu přímku jen dopočítal z kotvy a hloubky; testoval nanejvýš
  dosedací bod, ve větvi s intervalem ze skenu nic. Na dílu s kulatou destičkou
  R 10 tak `Rampa 45,0°` jela celou délkou pod offsetem kontury a ukrojila
  **36,8 mm²** hotového tvaru (celkem 42,0 mm² zajetí). Nově se testuje celá
  úsečka rampy (`rampClearOfContour` v `js/calculators/cam/ops/long/
  entryRamp.js`).

### Added
- **CAM – mezní čáry hlídání geometrie i pro kulatou destičku.** Dosud jí
  nevznikala ani jedna (`getToolClearanceRange` vrací pro nepolygonální tvary
  `null`), přestože omezení má: pod stěnu strmější, než jakou stihne sjet, se
  nedostane. Nově se z pole **„Úhel zanoření (°)"** odvodí táž čára
  `zanoreni`, jakou dostává polygon ze svého natočení — a jen ona: čelní hranu
  („dojezd") kulatý plátek nemá, tak se nehlídá. Čára je HRANICE, ne řez —
  konturu nepřemosťuje ani nedělí na úseky (`getPlungeGuardRange`
  v `js/calculators/cam/contourBuild.js`, pravidla v `cam/inserts/round.js`).
- **CAM – regresní fixture pro kulatou destičku v podélném hrubování**
  (`tests/fixtures/cam/part-22-round-r10.camprog`). Z 28 fixtures byla dosud
  kulatá destička jen v jedné, a ta jede ČELNÍ strategií — podélné hrubování
  kulatým plátkem nehlídalo nic.

  Otisk (`scripts/cam_fingerprint.mjs`) je u všech 28 původních fixtures
  **shodný** — žádná z těchto změn nemění dráhy jiných plátků.
- **Nástroj Offset umí konečně SKUTEČNÝ paralelní offset** (dosud dělal
  navzdory názvu i vlastní dokumentaci jen posun kopie o vzdálenost pod
  úhlem). Dialog má nově dva režimy: **∥ Paralelní** (výchozí – obrys ve
  stále stejné vzdálenosti; po potvrzení se klepnutím určí strana) a
  **↗ Posun o úhel** (původní chování). Kontura si přitom zachová zaoblené
  rohy – obloukový segment se posouvá souosle, nezplošťuje se.

  Feature byla v repu rozestavěná ze dvou třetin a nikdy nezapojená:
  `offsetObject()` (geometrie, `js/geometry.js`) i dialog
  „Offset – paralelní kopie" existovaly, ale nevolal je nikdo – klikací
  vrstva chyběla. Doplněno: `pickOffsetSide()` určí stranu tím, ke které
  z obou variant má klik blíž (funguje stejně pro úsečku, oblouk, obdélník
  i konturu – rozhoduje výsledek, ne typ), oba dialogy se sloučily do
  jednoho s přepínačem, rozdělaný výběr strany se drží v
  `state._offsetPendingSide` (uklidí ho Esc i přepnutí nástroje) a celá
  operace běží ve `withUndoBatch`, takže jedno Zpět vrátí i offset více
  objektů najednou. Spuštění z výběru navíc musí přepnout nástroj
  (`setTool('offset')`) dřív, než uloží stav – tlačítko v liště jinak
  `setTool` obchází a druhý klik by neobsloužil nikdo.

  Při zapojování se opravila i vada, která tím přestala být teoretická:
  offset natočeného obdélníku zahazoval `rotation`, takže z něj vypadl
  osově zarovnaný obdélník.

- **Zásobník nástrojů: tlačítka 👁 Ukázat a ✏️ Upravit** u každého slotu
  (nad *✅ Použít jako aktivní* / *🗑 Smazat*). **👁 Ukázat** otevře náhled nože
  — destička **i s držákem** tak, jak vypadá v simulaci (`showToolSlotPreviewDialog`,
  nový `js/calculators/cam/toolSlotPreview.js`); kreslí ho stejná funkce jako
  náhled v ⚙️ Geometrii (`drawInsertAndHolderPreview`), takže sedí 1:1, ale do
  `S.params` nesahá. Zoom (kolečko / ＋ － ⟲) jde **kolem špičky destičky** —
  `drawInsertAndHolderPreview` nově vrací `origin`, bez toho by při přiblížení
  zůstal v okně jen dřík držáku (břit leží u spodní hrany náhledu).
  **✏️ Upravit** načte nůž jako aktivní a otevře ⚙️ **Geometrii nástroje**
  (ta umí editovat jen `S.params`); po jejím zavření se změny **vrátí zpět do
  slotu** (`flushMagSlotEdit`, drží se reference na slot, ne index — ten se
  posune smazáním nebo 🔄 Seřazením). Když je Geometrie už otevřená, druhý
  modal se nezakládá a rozdělaná úprava jiného slotu se před přepnutím uloží.

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

### Added
- **Závěrečná kontrola plánu drah** (`js/calculators/cam/ops/long/planCheck.js`).
  Pravidla v `docs/cam-pravidla-drah.md` jsou vlastnosti CELÉHO programu, ale
  v kódu je nikdo nevlastnil — vznikaly jako vedlejší produkt hloubkové smyčky
  a pak na hotové průchody sahalo dalších ~36 míst v šesti souborech. Každé
  řešilo svůj problém a žádné nekontrolovalo, jestli tím pravidlo neporušilo.
  Za tři měsíce práce na drahách proto uživatel nacházel vadu za vadou OČIMA
  v G-kódu, přičemž plán byl pokaždé správný.

  Kontrola běží až za všemi zásahy, dráhy NEMĚNÍ a hlásí dvě věci s konkrétním
  r/Z: **průchod jede vzduchem** (na jeho hloubce nad ním nikde nestojí
  materiál; výjimka pro dojezd/nájezd a rampu — ty samy řežou) a **průchod
  přejel hranici svého úseku** (§6.0; jen hranice, která na dané hloubce
  opravdu platí — v kůře dna údolí se úseky spojují).

  Není vakuová: na obou dnešních vadách spadne a obě pojmenuje přesně
  (`r 44.545 Z 186.654…172.532`, resp. všechny tři přejezdy hranice
  `Z 172.532`/`91.932`). Na sadě odkryla **3 dosud neznámé vady** téže
  dvojice tříd — `holder-casting-slanted-face`, `holder-region-roughing`
  (jízda vzduchem) a `part-21-zleva-insert-shadow` (přejezd hranice).
  Po opravách níž jsou první dvě vyřešené, zbývá jedna.

### Fixed
- **Řetěz dorampování zajížděl na kotvu KOLMO do plného materiálu.**
  Uživatelský nález: `N700 G0 X46.345` + `N710 G1 X44.545 F0.25` na
  Z 195,812, kde má plánovací silueta odlitku r 65,2 — tedy 1,8 mm radiálně
  do plného kusu. *„Tohle jede kolmo do materiálu, protože mi tam chybí
  dodělat to zanořování."* §3.1 kolmý zápich u tohohle plátku zakazuje.

  Příčina je popsaná už v poznámce „kotva rampy leží v materiálu":
  `safeRapidTo` je bezpečná jen proti KONTUŘE, ne proti polotovaru, takže
  u odlitku sjede rychloposuvem dovnitř a zbytek na kotvu dojede radiálně.
  Kotva se zvedat nesmí (visí na ní celý řetěz), takže se místo toho
  **prodlouží RAMPA po téže přímce zanoření až na povrch** — nejvýš ale
  o jednu Hloubku záběru, protože výš už materiál sebrala předchozí vrstva
  (bez toho stropu rampa začínala na původním povrchu odlitku a jela 63 mm
  v Z posuvem místem, které je dávno obrobené).
- **Rampa, která nedosáhne na svou hloubku, se vydávala jako průchod.**
  Takový průchod není vrstvou na své hloubce: emise mu rampu ustřihne tam,
  kde vyjede z materiálu, takže uřízne jen pás v hloubkách MĚLČÍCH vrstev,
  které ho už vzaly. Na dílu uživatele „Průchod 11" rampoval X 51,207 →
  46,837 a odjel, aniž by na svou hloubku 44,545 dosáhl — těsně vedle rampy
  „Průchodu 9" (X 51,253 → 47,045). *„N670 tady tohle tu vůbec nemá být."*
  Práci za něj odvede řetěz dorampování, který navazuje o Hloubku záběru výš.

  Obojí změřeno: `cam_fingerprint` 19 z 28 fixtures (všechny KRATŠÍ),
  ale `cam_sweep` **úběr 82 822,0 → 82 823,7 a 86 178,5 → 86 163,1 mm²**
  (−15,4 mm² z 86 000, tedy 0,018 %) a **kolize beze změny** (2/4,9 a 0/0,0
  — ty dva nálezy jsou starý `part-20`). Zkrácení tedy nejsou ubrané řezy,
  ale ubrané přejezdy, nájezdy a duplicitní rampy; závěrečná kontrola plánu
  na sadě spadla z 3 nálezů na 1.
- **Hlídání boční hrany destičky odsunulo průchod mimo materiál a ten pak
  jel vzduchem.** Uživatelský nález: „Průchod 11" na r 44,545 najel
  rychloposuvem nad konturu, sjel rampou 15° šestnáct milimetrů vzduchem,
  uřízl 0,05 mm a přejel údolí — *„nemá to tam co dělat, mají být jenom
  vrstvy"*. Průchod se přitom rodí správně (Z 195,812…172,532, pokrývá
  slupku materiálu na Z 195,3…195,8). Rozbije ho až
  `ops/long/insertFlankGuard.js`: kvůli stínu boční hrany posune kotvu
  rampy Z 220,848 → 211,518 a protože posun **tahá s sebou celou rampu**,
  odjede s ní i `zStart` na Z 186,654 — tedy ZA materiál, do údolí, kde má
  odlitek jen r 17,74.

  Stará pojistka `zStart - zEnd < 0.05` hlídala jen geometrický kolaps
  rozpětí, kterým 14 mm vzduchu prošlo. Rozšířena na „zbylo vůbec co brát":
  nový helper `intervalHasStock` (v `ops/roughLong.js`, předává se do
  hlídání) měří nejdelší souvislý záběr proti PLÁNOVACÍ (vůlí-posunuté)
  siluetě a porovnává ho s `dzScan` — týmž prahem, kterým emise zahazuje
  průchody, co „nic neuříznou". Není to nový práh, jen se přiloží na
  materiál místo na délku okna.

  Změřeno: `cam_fingerprint` **shodný u všech 28 fixtures** (oprava se
  dotkla jen dílu uživatele — 62 → 61 průchodů, 472 → 464 řádků);
  `collision-validator`, `material-removal`, `cam-traversal-invariants`,
  `insert-forbidden-region`, `cam-ramp-chain` a `cam-face-insert-reach`
  zelené; celá sada 1567/1567.
- **Dorampování strmé stěny přejíždělo přes údolí a soustružilo vzduch
  posuvem.** Uživatelský nález: v jeho programu byly tři řádky
  `G1 Z… F0.25 ; Přejezd materiálem posuvem`, které jely desítky milimetrů
  čistým vzduchem — a materiál za údolím pak vzal ještě jednou vlastní
  průchod sousedního úseku. Příčina byla v `ops/roughLong.js`: rovný úsek
  za rampou (`rampCompletion`) se omezoval jen stěnou hotovní kontury a
  „evidencí", kam už na téhle hloubce dojel JINÝ úsek. Úseky ale jedou od
  největšího průměru, takže ten první je naplánovaný dřív, než nějaká
  evidence vůbec vznikne — a nic ho pak nezastavilo. Konkrétně jel
  „Průchod 9" r 47,045 rovnou Z 205,142 → −5,000, tedy **210 mm přes celý
  díl a přes obě hranice úseků**.

  Nově krok řetězu respektuje i **dno okna svého úseku** (`regionFloorZ` —
  totéž pravidlo, kterým se řídí hloubková smyčka, vytažené nad ni, aby na
  ně dosáhly obě). Tím platí podmínka `docs/cam-pravidla-drah.md` §6.0
  („nepřejíždět, dokud není celá pravá strana hotová") i pro dorampování.
  Hranice úseku vzniká tam, kde mezní čára hlídání geometrie destičky
  VYJEDE Z POLOTOVARU — za ní se materiál z téhle strany vzít nedá.

  Dno okna bylo jako mez zamítnuté 2. 9. 2026 kvůli −197 mm² úběru; to
  zamítnutí neplatí, protože úběr tady vetovat nesmí (§6.0, řádek 405
  pravidel: „plán s dělením smí vetovat jen DRŽÁK, nikdy úběr"). Změřeno
  ostatně bez ceny: fingerprint 3 z 28 fixtures (part-15-finish-zprava,
  part-17-long-parting, range-chain-insert-shadow) a všechny změny jsou
  právě mizející řádky „Přejezd materiálem posuvem"; sweep na těch třech
  dílech **úběr 12 595,7 / 13 839,5 mm² beze změny, kolize 0/0, stejný
  počet průchodů**.
- **Popisky os v CAD zasahovaly do výkresu; v CAM simulátoru byly skoro
  nečitelné.** Uživatelský nález (skládá se s předchozím o kontrastu):
  1. **CAD (`renderAxes` v `js/render.js`):** číselné popisky na vodorovné
     ose se kreslily NAD osou a na svislé ose VPRAVO od ní. Kdo kreslí
     hlavně do pravého horního kvadrantu (typický případ), měl popisky
     přímo v cestě výkresu. Přehozeno: vodorovná osa teď popisky kreslí
     POD sebe, svislá osa VLEVO od sebe (stejná strana, na kterou to CAM
     simulátor už dělal správně).
  2. **CAM simulátor (`js/calculators/camSimulator.js:1506`):** popisky
     mřížky používaly natvrdo `#585b70` (Catppuccin `surface2`) — stejná
     barva, která dělala nečitelné popisky i v CSS dialozích výše, tady
     jen zapsaná přímo v JS canvasu, ne přes proměnnou. Nahrazeno
     `#a6adc8` (`subtext0`, ~7:1 kontrastu) a zvětšeno z 10px na 12px, ať
     jsou vizuálně srovnatelné s CAD popisky (13px).

- **Nečitelné popisky na tmavém pozadí (nedostatečný kontrast textu).**
  Uživatelský nález: kategorie „METRICKÉ / TRUBKOVÉ / PALCOVÉ" v kalkulačce
  Závity (`.thr-cat-label`) byly skoro nečitelné. Příčina: barva
  `--ctp-surface2` použitá jako text na tmavém pozadí (`--ctp-mantle` apod.)
  dává kontrastní poměr jen ~2,6:1 — pod hranicí čitelnosti (WCAG AA žádá
  4,5:1 pro běžný text, 3:1 jako úplné minimum). `--ctp-surface2` je barva
  určená pro okraje/rámečky, ne pro text.
  Prošlo se celé `css/style.css` a opraveno všude, kde šlo o skutečný
  popisek/nadpis (ne jen podružná nápověda): nevybraná tlačítka přepínačů
  (`.tol-toggle` — Závity i Tolerance), kategorie v nápovědě závitů
  (`.thr-help-cat`), šipka v Převodníku (`.conv-arrow`), kód třídy drsnosti
  (`.rough-class-val`), název historie kalkulačky (`.calc-hist-title`),
  popisky tabulky CNC kalkuladeček (`.cnc-table-label`), popisky polí
  v Převodníku (`.conv-label`) a popisek náhledu G-kódu ve VK (`.vk-gcode-label`).
  Všude nahrazeno `--ctp-subtext0` (kontrast ~7,9:1), stejný odstín, jaký
  projekt už jinde pro sekundární popisky používá. Ověřeno v obou motivech
  (tmavý i světlý) — `--ctp-subtext0` je definované pro oba.
  Ponecháno beze změny: drobné podružné nápovědy vedle primárního textu
  (`.copy-hint`, `.vbd-rev-header small`) a dekorativní ikony/šipky
  (`::before` u rozbalovacích nadpisů) — tam nízký kontrast slouží k vizuální
  hierarchii, ne k utajení obsahu, který je potřeba přečíst.

- **Audit CAD kódu (geometrie/canvas/render/DXF/nástroje) — devět nálezů.**
  Paralelní průzkum `js/geometry.js`, `js/canvas.js`, `js/render.js`,
  `js/objects.js`, `js/dxf.js` a nástrojů v `js/tools/`; opraveno, co bylo
  potvrzeno konkrétním scénářem, zbytek (viz níže) ponechán.
  1. **Zaoblený/zkosený/posunutý obdélník ztrácel natočení.** `rotateObject`,
     `mirrorObject`, `flipObject` a `scaleObject` u `type:'rect'` počítaly
     jen s `x1/y1/x2/y2` jako s nezávislými rohovými body a `obj.rotation`
     nechávaly být — `getRectCorners` ale staví box kolem VLASTNÍHO STŘEDU
     a teprve pak ho o `rotation` natáčí, takže po rotaci/zrcadlení/škálování
     natočeného obdélníku vznikl úplně jiný, osově zarovnaný tvar. Oprava
     transformuje střed (ne rohy) a dopočítá `rotation` (zrcadlení/překlopení
     odráží úhel jako `2·θ_osy − A`, záporný scale faktor přičte π) —
     ověřeno numericky mimo test i v `tests/geometry.test.js`.
  2. **Offset CW oblouku (`ccw:false`) ztrácel směr.** `offsetObject` u
     `type:'arc'` nekopíroval `obj.ccw` — `isAngleBetween`/vykreslení pak bez
     tohoto příznaku bere výchozí CCW sweep, takže výsledný oblouk mohl mířit
     úplně jinam než originál.
  3. **`chamferLineAndArc` nekontroloval, že zkosení na oblouku (`dist2`)
     nepřesahuje jeho úhlový rozsah** (na rozdíl od `dist1` u úsečky, kde
     kontrola byla) — moc velký `dist2` posunul konec oblouku za druhý
     původní konec a vrátil `ok:true` s poškozenou geometrií.
  4. **`autoCenterView` (canvas.js) počítal bounding box CW oblouku špatně**
     — volání `isAngleBetween` bez 4. parametru `ccw` vždy předpokládá CCW
     sweep, takže se u `ccw:false` oblouku ořízl kus, který ve skutečnosti
     leží na dráze (auto-center pak useknul kus výkresu).
  5. **Text psaný podél oblouku (`pathMode:'arc'`) se při zapnutém otočení
     osy X/Z (`state.flipX`/`flipZ`) kreslil na špatném úhlu** —
     `_drawTextAlongArc` v render.js počítal úhly ručním `-angle` místo
     sdílené `screenAngle()`, která jediná zohledňuje obě otočení.
  6. **Přesun textu po kruhové dráze (`pathMode:'circle'`) skákal, když měl
     bod X nebo Y přesně 0** — `obj.y || pathObj.cy` bere `0` jako
     "nezadáno" (typický `||` na čísle); opraveno na `??`.
  7. **Zaoblení/rozdělení kraje kontury (Trim auto-mód) přehlíželo konce
     oblouků a kružnic jako hranice řezu** — `if (!circ.startAngle !==
     undefined)` je vždy `true` (přednost operátorů), takže se funkce vždy
     vrátila hned na začátku; opraveno na `circ.startAngle === undefined`.
  8. **Spojení (J) a rozdělení (Break) úsečky/oblouku/kontury rozbíjelo
     Zpět.** Obě volaly `pushUndo()` samy a pak i `addObject()`, který
     `pushUndo()` volá znovu — jedno Ctrl+Z tak vrátilo jen mezistav (staré
     objekty smazané, nový ještě nepřidaný), ne původní stav; teprve druhé
     Ctrl+Z vrátilo výkres doopravdy. Opraveno přes `withUndoBatch()`
     (existující mechanismus přesně pro tenhle případ).
  9. **Zakotvené objekty šlo posunout/otočit obchvatem.** Přesun více
     vybraných objektů (`moveClick.js`) anchor vůbec nekontroloval (na
     rozdíl od přesunu jednoho objektu) a nástroj Rovnoběžka
     (`parallelClick.js`) kotvu ignoroval úplně — zakotvený konec se mohl
     tiše posunout. Doplněna stejná kontrola/hlášení jako u Rotace a
     ostatních vazebních nástrojů.

  **Vědomě NEopraveno tehdy** (nález potvrzen, ale riziko/rozsah zásahu na tu
  session moc velké — zůstalo jako TODO): `offsetObject` u kontury s
  obloukovým (bulge) segmentem nabízí jen tětivový offset, oblouk zplošťuje
  na úsečku; DXF import ignoruje zarovnání TEXT/MTEXT (kódy 72/73/11/21) a u
  zrcadleného INSERTu neobrací směr oblouku/bulge; v dialozích (`mobileEdit.js`,
  `objectDialogs.js`, `polarDrawing.js`) je několik úniků event listenerů.
  Barva objektu (kód 62) se v DXF exportu záměrně nezapisuje — potvrzeno
  testem/komentářem jako součást „minimálního AC1009 formátu" pro Fusion 360,
  proto ponecháno beze změny.

- **Doladění nálezů z auditu výše — plán v `docs/` odpracován, dvě položky
  se ukázaly jako planý poplach.**
  1. **Únik posluchačů canvasu (Kruhové pole, Polární kreslení)** – tlačítko
     „🎯 vyber bod z výkresu" schová dialog a pověsí `click`/`touchend` na
     `drawCanvas`; cleanup se volal jen z OK/Zavřít tlačítek, ne při Escape
     nebo kliku mimo (ty jdou přes globální `makeInputOverlay` mechanismus,
     co o pick-listeneru neví). Zaregistrováno do existujícího
     `onOverlayRemoved()` (`js/dialogFactory.js`), který se spustí, ať dialog
     zmizí jakkoliv.
  2. **Zastaralý index při editaci objektu přes globální Zpět.**
     `mobileEdit.js`/`measure.js` si při otevření zapamatují `idx` a Save/
     Delete ho později použijí bez ověření – Ctrl+Z (nebo klik na toolbar
     Zpět) mezitím může `state.objects` vyměnit a mazat/upravit se pak jiný
     objekt, než uživatel vidí otevřený. Ctrl+Z/Y teď respektuje `isEditable`
     (stejně jako sousední Home/Ctrl+0), a hlavně: Save/Delete si těsně před
     zápisem znovu dohledají objekt podle stabilního `id`, ne podle `idx`.
  3. **DXF import: TEXT/MTEXT se zarovnáním jinam než vlevo/baseline** (kódy
     72/73) používal jako kotvu vždy kód 10/20, i když skutečná pozice je
     v kódu 11/21 – text se importoval na úplně jiné místo.
  4. **DXF import: zrcadlený INSERT (`sx*sy<0`, typicky dveře/okno v CAD
     knihovně) neobracel směr oblouku/bulge** – `transformEntity` u ARC jen
     přičítal rotaci k oběma úhlům místo transformace skutečných koncových
     bodů, takže u odstředěného oblouku vyšla i POLOHA špatně, nejen
     křivost. Opraveno stejnou konvencí, jakou `mirrorObject()` v
     `geometry.js` má pro `arc`/`polyline` (transformovat koncové body,
     při reflexi je prohodit / obrátit bulge).

  **Planý poplach (nebylo co opravovat):**
  - „Nekonzistence Celkové délky" u 2D lineárního pole (`objectDialogs.js`)
    – `linearArray()` má `count` (hlavní osa) = počet KOPIÍ (`count+1`
    pozic), `count2` (vedlejší osa) = počet ŘAD CELKEM (`count2` pozic);
    dělení `dx/count` a `dx2/(count2-1)` je pro OBĚ osy matematicky správné
    (ověřeno numericky). Nikdy to nebyla chyba, jen asymetrická konvence
    dvou vstupních polí.
  - Osová vzdálenost páru ozubených kol bez korekce na posunutí profilu –
    `tests/gearPair.test.js` má test s výslovným komentářem, že `axis =
    r1+r2` i s korekcí `x1/x2` je VĚDOMÉ zjednodušení pro CAD/CAM účely
    (přesný pracovní úhel záběru se řeší jinak). Oprava byla naimplementovaná
    a hned zase vrácena, jakmile se ukázal ten test. Stejná past jako u DXF
    barvy o pár řádků výš — nález agenta / rychlá kontrola nestačí, vždycky
    nejdřív zkontrolovat existující testy/komentáře na záměr.

  5. **`offsetObject()` u kontury s obloukovým (bulge) segmentem offsetoval
     tětivou** – oblouk se zplošťoval na úsečku a výstup měl natvrdo
     `bulges: fill(0)`. Nově se obloukový segment posouvá SOUSTŘEDNĚ (mění
     jen poloměr: při jízdě CCW je „vlevo" ke středu → `r−d`, při CW → `r+d`,
     platí i pro reflexní oblouky), rohy se řeší průsečíkem úsečka/oblouk
     v libovolné kombinaci (`joinOffsetElems` nad existujícími
     `intersectLineCircle`/`intersectCircleCircle`) a výsledný bulge se
     dopočítá z OŘEZANÝCH konců, ne z originálu. Offset větší než poloměr
     oblouku segment zahodí místo pádu.
     Pozn.: v době opravy byla `offsetObject()` v aplikaci NEPOUŽITÁ (CAD
     nástroj Offset dělal polární posun, CAM přídavek jde přes
     `offsetContour()` v `js/calculators/contourOffset.js`, který oblouky
     umí odjakživa) – oprava tedy tehdy neměla dopad na běh. Zapojena byla
     vzápětí, viz „Nástroj Offset umí konečně SKUTEČNÝ paralelní offset"
     v sekci Added.

- **Kontrola cesty „vytvoření nože" (destička + držák) — šest nálezů.**
  1. **Úhel hřbetu α se do uloženého nože vůbec nedostal.** `toolClearanceAngle`
     chyběl v `CAM_TOOL_KEYS`, přestože ho čte `buildMachinableContour`
     i výpočet úhlu zanoření — 💾 Uložit do PC / 📂 Načíst z PC, projekt,
     import do zásobníku i obnova nože po zavření CAM ho tiše zahodily
     (nůž se vrátil s α předchozího nože, typicky 0).
  2. **VBD dekodér obcházel pravidlo „obrys držáku patří k tvaru destičky".**
     Zapisoval `toolShape` napřímo, takže po dekódování kulaté destičky
     zůstal viset držák nakreslený pro předchozí čtyřstrannou — přesně vada
     opravená 27. 8. 2026 u tlačítek tvaru, jen jinou cestou. Teď jde přes
     `applyShapeChange` (s `{defer:true}`, aby pipeline neběžel dvakrát).
     Stejné pravidlo dostala i **karta slotu v zásobníku** (tlačítka tvaru
     i dekodér, `_setMagSlotShape`) a **načtení nože bez `holderProfile`**
     ze staršího projektu/souboru (`applyCamToolGeometry`, import z PC).
  3. **`toolTipMirror` (⇄ Přehodit stranu) nebyl „jen kosmetika náhledu".**
     Byl schválně vyňatý z `pathInputsKey`, jenže od migrace na geometrické
     knihovny ho čte `buildInsertProfileSegments` → `insertWorldLoop`, a z toho
     žije úběr, validátor kolizí, hlídání držáku i mezní čáry. Protože na tom
     otisku stojí i `calcCacheKey`, přepnutí plán ani NEPŘEPOČÍTALO — destička
     se v náhledu překlopila, dráhy zůstaly podle staré. Změřeno na fixture
     `part-19-face-tilted-insert`: řezy o 0,2 mm jinde a hlídání destičky
     vynechá 13 průchodů místo 7. Otisk ho teď obsahuje, tlačítko volá
     `applyChange()`; test v `cam-gcode-sync` pinoval starý předpoklad → otočen.
  4. **Editor obdélníku zůstal zapnutý bez obrysu.** Klikací body se kreslí jen
     k existujícímu obrysu, takže po 🗑 Smazat obrys / ↩ Zpět / výměně tvaru
     destičky byl editor „zapnutý", ale nešlo v něm na nic kliknout. Teď se
     sám vypne. (Obrys si nedomýšlí: hlídání by to nezměnilo —
     `holderProfileLoop` staví bez obrysu týž obdélník — ale náhled ano,
     ten bez obrysu kreslí pás na obě strany.)
  5. **Náhled nože se nepřekreslil při změně velikosti okna.** Backing store
     plátna se sáhne jednou podle naměřené šířky; po zvětšení/zmenšení okna
     (nebo když plátno dostane rozměr až po vložení dialogu) zůstal starý
     a nůž se kreslil roztažený z malého plátna. `ResizeObserver` v obou
     náhledech (⚙️ Geometrie i 👁 Ukázat) překreslí, jakmile plátno velikost
     změní.
  6. **Prázdné jméno nástroje přepsalo název slotu** (`_syncParamsToSlot`),
     a **✏️ Upravit tiše měnilo ruku držáku**: Geometrie ji při otevření
     odvozuje ze směru hrubování, takže pouhé otevření a zavření uložilo
     do slotu odvozenou hodnotu. Zpět se zapíše, jen když ji uživatel
     opravdu přepnul tlačítkem ⇄ Ruka.

- **Zásobník ztrácel přehození strany vrcholového úhlu destičky.**
  `toolTipMirror` je součást geometrie nože (`CAM_TOOL_KEYS`), ale slot
  zásobníku ho neměl — uložený nůž se po *✅ Použít* vrátil s destičkou
  otočenou na druhou stranu. Slot ho teď drží jako `tipMirror`
  (`_defaultMagSlot`/`_applyMagSlot`/`_syncParamsToSlot`/`_buildMagSlotFromTool`).

- **Model zbytku „lhal o 5,786 mm" — ve skutečnosti se porovnávaly DVA RŮZNÉ
  BĚHY.** `cam-strategy-residual` bral tracker z `trk[0]` s odůvodněním
  „pipeline běží dvakrát, model z prvního běhu je ten, podle kterého se
  plánovalo". Generátor ale běží v každém `calculate()` VÍCKRÁT a jednotlivé
  běhy se liší: na `part-8` vydaly 44 a 41 průchodů a do `calc` (tedy do
  G-kódu, ze kterého se replayuje realita) šel ten se 41. Rozdíl modelů
  21,565 − 15,779 = **5,786 mm** — přesně to, co test hlásil jako vadu
  materiálového modelu.

  Seamy `__RESIDUAL_TRACKER_DUMP__` i `__FLOOR_TAB_DUMP__` nově nesou `len`
  (délka pole průchodů toho běhu) a test si podle ní vybere běh shodný
  s `calc.passes`. Po opravě je tracker proti reálně projeté dráze na
  0,012–0,046 mm (mez 0,05) na všech měřených dílech — **model nelže**.

- **Akceptační testy kroku 3 přesměrovány — kritérium je splněné.**
  `cam-residual-clamp > part-8: 4 nálezy / 33,4 mm² → 0` padal na vlastní
  pojistce „bez příznaku ta vada JE": `part-8` je dnes čistý s příznakem
  `orderAwareHolder` i bez něj (0 nálezů, 40 průchodů v obou) — ty čtyři
  nálezy odstranily jiné opravy. Přeměřeno na celé sadě: příznak mění program
  na sedmi fixtures, ale kolize nikde. Test nově hlídá, co pravda JE a co by
  regrese porušila — příznak nesmí kolize zhoršit a nesmí být tichý no-op.
  Ze stejného důvodu vypadl `holder-casting-slanted-face` z porovnání
  „tracker je proti výškovému poli měřitelně lepší" (pole tam podřezává
  0,000 mm, tunel v dnešním programu nevzniká); `part-8` ho měří dál a
  pořádně — 9,366 mm proti 0,012 mm.

- **`tests/range-entry-ramp` měřil opuštěný model — 24 commitů červený.**
  Test žádal kotvu rampy `(31, −30)` pro KAŽDOU hloubku, tedy „každá vrstva
  ramuje znovu od povrchu". Ten model opustil `fcc0def` (27. 8. 2026), a
  vědomě: hlubší vrstva by jinak prorampovala i klín, který vyřízla vrstva nad
  ní. Kotva se od té doby ŘETĚZÍ po sdílené přímce zanoření. Dráha je celou
  dobu správná, zastaralá byla zástupná aritmetika v testu.

  Asserty přepsány na to, co hlavička testu odjakživa slibuje: první kotva =
  průsečík hranice rozsahu s povrchem, každá další leží na TÉŽE přímce
  zanoření a navazuje na hloubku i začátek předchozí vrstvy. Ověřeno, že
  nejde o vacuum — s rozbitým řetězem padá 10 assertů. Přibyla i kontrola
  „žádný kolmý zápich" (hlavička ji slibovala, ale nikdy se neměřila):
  radiální posuv smí být jen přísun přes vůli, tady 1,8 mm.

- **Dvě dráhy zajížděly KOLMO do plného materiálu — odložené zanoření
  přeskočilo hlubší vrstvy.** Nález uživatele 2. 9. 2026 (rozsah Z uprostřed
  polotovaru): *„proč mně tam takhle dvě dráhy kolmo zajíždějí"* —
  `N160 G1 X12.783` sjel 11,8 mm radiálně do neobrobeného kusu, `N230
  G1 X9.783` dalších 14,8 mm.

  Pravidlo „co je nahoře, má přednost" odsouvá zanoření na konec regionu
  (`__deferEntry`), aby se nejdřív odebraly větší průměry. Odsouvalo je ale
  BEZ KONTROLY, jestli v `head` nezůstala vrstva HLUBŠÍ — a přesně to se
  stalo: pořadí vyšlo r 9,803 → 6,803 → 18,803 → 15,803 → 12,803, tedy
  nejhlubší napřed. Kotvy ramp se přitom hledají proti modelu zbytku
  v POŘADÍ PLÁNOVÁNÍ (tam bylo pořadí správné), takže kotva první vrstvy
  seděla na r 12,783 = zbytku po vrstvě r 12,803, která jede až potom.
  Sjezd ke kotvě se pak musel prořezat plným materiálem kolmo dolů — u plátku
  s úhlem < 90 ° zakázaný zápich (§3.1 pravidel drah).

  Odložená skupina se nově vkládá tam, kam patří hloubkově — týmž postupem
  (a s toutéž ochranou proti rozříznutí řetězu `noRetract`/`pocketReposition`),
  jakým se řadí dobírací řetěz ramp. Pořadí je r 18,803 → 15,803 → 12,803 →
  9,803 → 6,803 a všechny sjezdy jsou 1,8 mm (Vůle), ne 11–15 mm.
  Úběr i kolize na sadě BEZE ZMĚNY (86 117,7 mm², 0/0 a 2/4,9), hnuly se dvě
  fixtures o jeden řádek. Opravilo to i
  `tests/cam-finish-holder > hrubování nemá zpětné axiální řezy`, který
  obrácené pořadí shazovalo.

- **Hrubování jezdilo po vlastní čerstvé dráze — 85,8 mm z 1 604 mm řezu.**
  Nález uživatele 2. 9. 2026 (*„můžeš se podívat, kde všude mně to tam projíždí
  dvakrát stejnou dráhu"*). Čtyři různé příčiny, změřeno na jeho dílu:
  - **Dojezd, který sjel POD hloubku vrstvy, se nezapočítal jako dobraný.**
    Pojistka „co dojezd už dobral, se nevydá podruhé" (`ops/long/openPass.js`)
    počítala pokrytí jen ze segmentů PŘESNĚ na hloubce vrstvy a zpětnou chůzi
    zastavila na prvním jiném. Dojezd ale běžně sjede po obrysu do prohlubně
    a zase vyleze — vrstvu tam odebral, jen ne na kótě. Interval, který
    v prohlubni začínal, se pak vydal celý znovu („Průchod 27", 24,9 mm).
    Nově se počítá i to, kudy dojezd projel pod hloubkou, a segment, který ji
    protíná, po průsečík.
  - **Dobrání ořízlé rampy přeletělo údolí do sousedního REGIONU** a zastavilo
    se o stěnu, kterou ten region na téže hloubce už obrobil (11,8 mm).
    Nová evidence `ops/long/cutRegistry.js` (`depthCutClampZ`) doběh zastaví —
    ale jen když v cizím úseku KONČÍ; ostrůvek uprostřed jízdy stopku nedělá
    (to stálo 153,7 mm² úběru). Doběh pak končí U OFFSETOVÉ ČÁRY POLOTOVARU
    (`stockRunBackZ` v `ops/long/runScan.js` — poslední hrana materiálu před
    stopkou), ne až za údolím: *„tady to jede zas na druhou stranu, místo aby
    to končilo u offsetové čáry od polotovaru"*. Bez toho zbyl rychloposuv
    přes 24 mm a za ním pahýl řezu 0,29 mm. Mezery po cestě se pořád přeletí
    (pravidlo z 1. 9. 2026) — `stockRunEndZ` by vrstvu vrátil na Z 31,96.
  - **Výjezd z kapsy jel znovu za každý zákrok.** Řetězy po kontuře jsou
    výřezy JEDNÉ `offsetPath`, takže dva s překrytým Z-pásmem vydají doslova
    tutéž dráhu; evidenci měly jen přímky zanoření a rohy. Nový registr
    (`makeChainRegistry`) ořízne duplicitní konec dojezdu u dobrání kapsy
    (28,4 mm) a vypustí nájezd, který celý vede po projeté dráze (19,9 mm).
  - Zbylo 1,1 mm (0,1 %) na hranicích segmentů. Úběr se na sadě 28 fixtures
    NEHNUL (86 114,8 mm²), kolize 0/0 v obou standardech.

- **Vrstva nedojela k offsetové čáře polotovaru.** Výjezd z kapsy končí, jakmile
  offset klesne na hloubku průchodu („zbytek si vezme hlubší vrstva") — jenže
  v tom Z-okně žádná hlubší vrstva nepřijde a vrstva stojí uprostřed materiálu
  (nález uživatele 2. 9. 2026: dojezd r 25,545 skončil na Z 78,17, přestože
  materiál drží nad stopou nástroje až do Z 81,6). Doběh na konec polotovaru
  se nově přidá i tehdy, když offsetová čára před nástrojem sice pokračuje, ale
  LEŽÍ POD hloubkou vrstvy. Přísně jen pro výjezd z kapsy, který se po obrysu
  vrátil na svou hloubku — širší podmínka hnula 21 z 28 fixtures a stála úběr.
  Blok se navíc přesunul AŽ ZA hlídání geometrie destičky: to přeskakuje
  průchody s dojezdem, takže přidání doběhu jim dřív hlídání vypnulo.

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
- **CAM – krok řetězu zanoření se zastavil na první mezeře v odlitku, takže
  materiál za ní vzala až o `ap` hlubší vrstva (dvojnásobný záběr).** Vrstvy
  NAD ním mezeru běžně přeletí — jejich konec sahá na konec regionu a emise
  (`airSplitAxial`) si vzduch sama rozseká na rychloposuv. Jen krok
  `pendingRampCompletions` končil na `stockRunEndZ`, tedy na konci SOUVISLÉHO
  materiálu.

  Nález uživatele 1. 9. 2026 (podélně zleva, `N2510 G1 Z31.957`): vrstva
  r 28,545 skončila na Z 31,96, přestože r 31,545 nad ní jede až na Z 92 —
  silueta odlitku mezi Z 28,6 a 41,5 klesne pod r 28,5, ale za mezerou
  materiál pokračuje do Z 112. Krok teď končí jen na STĚNĚ HOTOVNÍ KONTURY
  (`straightRunEndZ`), tedy na jediné mezi, kterou překročit nesmí:
  **+153,6 mm² úběru** na sadě, kolize 0/0 v obou standardech, zajezd pod
  konturu dál 0.
- **CAM – kapsový průchod bez rampy i bez nájezdu sjížděl na hloubku
  radiálně.** `traceOffsetPath` může vrátit PRÁZDNÉ pole a to se přiřadilo
  jako `contourLeadIn` stejně jako neprázdné — jenže `[]` je v JS pravdivé,
  takže průchod dál vypadal jako „kapsa po kontuře": emise vzala větev
  s nájezdem, nenašla v ní žádný segment, spadla na `{x: pass.x,
  z: pass.zStart}` a sjela na hloubku kolmo. Nález uživatele 1. 9. 2026
  (podélně zleva): `N2020 G1 X31.545 F0.25` — 6,4 mm radiálního záběru, aby
  se uříznul pás 1,45 mm — a `N3010 G1 X19.545 F0.25` (4,2 mm kvůli 0,66 mm).

  Takový průchod se nevydá (a hlásí se), stejně jako vjezd bez rampy podle
  `docs/cam-pravidla-drah.md` §3.1. Na dílu uživatele 52 → 50 průchodů,
  +100 mm² zůstane pro dokončování; na sadě se hnuly tři fixtures, kolize
  beze změny (`part-20-zleva-parting-taper` s náhradním držákem dokonce
  +397,7 mm² úběru při 8 průchodech méně).
- **CAM – odskok pod 45° zajížděl 4,85 mm pod hotovní konturu (podélně
  zleva).** Odskok míří na obrobenou stranu, takže tam obvykle nic není —
  jenže couvne i za ZAČÁTEK průchodu, a tam může stát MEZNÍ ČÁRA plátku (stín
  břitu, který `buildMachinableContour` vkládá místo nedosažitelného rohu).
  Nález uživatele 1. 9. 2026: `N2040 G1 X33.545 Z143.293` a `N3030 G1 X21.545
  Z80.919` — průchod stojí na r 31,5, kontura tam vystoupá na r 38,2.

  Čelní strategie tenhle test má odjakživa (`retractGouges`), podélná ho
  neměla. Teď ho mají obě: když by diagonála podjela konturu, vyjede se
  SVISLE v X, tedy zpátky do vlastní právě vyříznuté stopy. Náprava stojí
  **0 mm²** úběru u nakresleného nože a **−11,0 mm²** u náhradního držáku —
  a to jsou přesně ty odřezky, které diagonála brala z hotové kontury.

  Sada podélné fixtures na zajezd hlídá všechny včetně „zleva", jen žádná
  tuhle geometrii neměla; díl uživatele je proto v sadě jako
  **`part-21-zleva-insert-shadow.camprog`** (bez opravy 4,85 mm, s ní 0).
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

## Starší verze

Verze 1.8.0 (2026-08-26) a starší jsou v [docs/changelog-archiv.md](docs/changelog-archiv.md).

---

_Changelog风格 © 2024-2026 SKICA contributors_
