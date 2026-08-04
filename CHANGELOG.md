# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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

### Fixed
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
