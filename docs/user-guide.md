# Uživatelská příručka SKICA

## Obsah
1. [Úvod](#úvod)
2. [Rychlý start](#rychlý-start)
3. [Orientace v UI](#orientace-v-ui)
4. [Základní kreslení](#základní-kreslení)
5. [Úpravy geometrie](#úpravy-geometrie)
6. [Kótování](#kótování)
7. [DXF import/export](#dxf-importexport)
8. [Soustružnické generátory](#soustružnické-generátory)
9. [CAM workflow](#cam-workflow)
10. [CNC kalkulačky](#cnc-kalkulačky)
11. [AI panel – fotka výkresu](#ai-panel)
12. [Témata a vzhled](#témata-a-vzhled)
13. [Ukládání a otevírání projektů](#ukládání-a-otevírání-projektů)
14. [Klávesové zkratky](#klávesové-zkratky)
15. [Tipy pro soustružníky](#tipy-pro-soustružníky)

---

## Úvod

**SKICA** je browser-based CAD pro CNC soustruhy. Navrhuješ 2D profil dílce, nastavíš parametry obrábění a vygeneruješ NC program pro **Sinumerik 840D sl**.

Aplikace běží offline jako PWA – žádný server, žádná instalace. Stačí otevřít v prohlížeči (Chrome/Edge/Firefox).

---

## Rychlý start

1. Otevři `index.html` libovolným statickým serverem:
   ```bash
   npx serve .
   # nebo
   python -m http.server 8080
   ```
2. Vyber nástroj v toolbaru
3. Klikni na plátno pro kreslení
4. Pomocný panel napravo: objekty, průsečíky, vrstvy, vlastnosti

---

## Orientace v UI

### Toolbar (horní lišta)
Herní nástroje seskupené do sekcí:
- **Výběr/úpravy** – Vyber, Přesun, Kopírovat, Měřit, Zrcadlit, Otáčet, Měřítko
- **Kreslení** – Úsečka, Typ čáry (ČSN EN ISO 128), Kružnice, Oblouk, Obdélník, Polyline, Tužka, Text
- **Úpravy** – Zaoblení, Zkosení, Ořez, Prodloužit, Zlomit, Tečna, Rovnoběžka, Kolmice, Offset, Rozdělit
- **Kóty** – Lineární kóta, Řetězová kóta, Souřadnice
- **Soustruh** – Závit, Drážka, Ozubení, Par ozubení, Zápich
- **Parametrické** – Slot, Polygon, Hvězda
- **CAM** – Polotovar, Rovnoběžka (šablona), Kontura/Profily, Boolean, Pole

### Boční panel (pravý)
- **Objekty** – seznam všech objektů, výběr, mazání, zobrazení čísel
- **Průsečíky** – automaticky vypočítané průsečíky (průsečíky skryté vrstvy se nezobrazují a SNAP je nechytá)
- **Vrstvy** – správa vrstev; 🗑 v řádku vrstvy smaže všechny její objekty (vrstva zůstane, ↩ Zpět je vrátí),
  třeba konstrukční čáry plátku z CAM ve vrstvě *Konstrukce*; při ⇋ Zrcadlit kolem osy je tu i řádek
  *Hrany přes osu* — okem skryjete čáry přechodů, které spojují obě poloviny dílu
- **Vlastnosti** – barva, tloušťka, styl čáry, čárkovaná
- **Nastavení** – mřížka, úhlové snap, kóty, okraje, autom. středy, číslování, osa Y
- **Bubliny s popisem** – hlavičky panelů (Objekty, Průsečíky, Vlastnosti, Vrstvy, CNC Kód,
  Kalkulačky, Další kalkulačky) i tlačítka kalkulaček mají popisek: na počítači po najetí
  myší, na mobilu pod přesným křížkem (posunutým od prstu). Křížkem jde hlavičku i rozbalit.

### Dolní lišta (status bar)
- Aktuální nástroj
- Indikátory stroje/souřadnic: SOU/KAR (typ stroje), ABS/INC, R/⌀ (zobrazení osy X)
- Přiblížení (zoom)
- Indikátory mřížky/úhlu/kót (# ∠ 📐) – vypnutá funkce je ztlumená, ne skrytá
- Tlačítka: ⊕ Centr (vycentrovat výkres), 🔢 (zadání objektu – číselně / VK
  kontura), ⚙️ Nastavení
- Na konci lišty (do volného místa): nápověda k aktuálnímu nástroji (co
  kliknout) a název projektu. Když se nevejdou, zkrátí se „…“ — celá nápověda
  je v popisku po najetí myší. Na užším okně přejdou tlačítka i tyhle texty na
  druhý řádek lišty.

#### Klikací indikátory
Všechny indikátory (v dolní liště na desktopu i v horní liště na mobilu) jsou
zároveň přepínače – **klik přepne dané nastavení na další hodnotu**, takže se
kvůli přepnutí nemusí otvírat ⚙️ Nastavení:

| Indikátor | Klik přepíná |
|-----------|--------------|
| SOU / KAR | typ stroje – soustruh ↔ karusel |
| ABS / INC | absolutní ↔ inkrementální souřadnice |
| R / ⌀     | osa X jako poloměr ↔ průměr |
| #         | snap na mřížku ON ↔ OFF |
| ∠         | úhlový snap ON ↔ OFF |
| 📐        | režim kót: vše → průsečíky → kóty → skryté → vše |

Indikátor kót nese i písmeno aktuálního režimu: **📐V** vše, **📐P** průsečíky,
**📐K** kóty, **📐–** skryté. Popisek (tooltip, na mobilu i precision pointer)
vždy ukazuje aktuální hodnotu a co klik udělá.

**Pravý klik** na **#** nebo **∠** v dolní liště (desktop) otevře dialog
*Velikost mřížky*, resp. *Krok úhlového snapu* (předvolby 15/30/45/90°, vlastní
krok a tolerance přichycení). Na mobilu je dlouhé podržení vyhrazené přesnému
ukazateli — velikost mřížky a krok úhlu se tam nastaví v ⚙️ Nastavení →
# Mřížka a snap.

### Mobilní ovládání
- Spodní lišta s hlavními tlačítky
- Panel nástrojů CAD **na šířku** má pevné řádky — tlačítka se šířkou
  přizpůsobí displeji, nikdy se nezalomí:
  - Výběr · Kóta · Typ čáry · Smaž · Bod · Úsečka · Kontura · p. uhel ·
    Kruh · Obdé · **✕** (zavřít panel)
  - Tečna · za/zk · Vybarvit · Tužka · Detekce · Profil · př/pl · Oříz ·
    Prodl. · **▾** (rozbalí všechny zbývající nástroje najednou)
  - po rozbalení: Přichytit … Rozděl · Spoj (jeden řádek), Oblouk …
    Drážka · Řet.kóta a Polygon … Bool, vpravo na stejném řádku Smaž vše ·
    Kotva · Kóty · ❓
- Panel nástrojů **na výšku** — rozbalené **Více** má pevné řádky:
  Oblouk · Lin.pole · Kr.pole · **Díra** · **▴** / Text · Nul.bod · Měřítko ·
  Oz.kolo / Pár kol · Drážka · Polygon · Hvězda / Řet.kóta · DIN · Závit ·
  Bool / Smaž vše · Kotva · Kóty · ❓. **▴** sbalí řádky nad Více (zůstane
  hlavička Výběr · Kóta · ✕ a nástroje Více, ať se mezi nimi vybírá bez
  dalších tlačítek okolo); **▾** je zase rozbalí. Naležato se nesbaluje.
- **Na šířku** jsou Dvojklik, ↩ / ↪, 🔢 kalkulačka (a její schránka),
  🧲 přichycení a ⊙ vycentrování přímo v horní liště vpravo vedle
  SOU/ABS/R…, souřadnice hned pod ní (při kreslení vlevo od nich
  červené ✕ Zrušit) — nad výkresem tak nic nevisí a na
  kreslení zbude víc výšky. Na výšku zůstávají kolečka pod lištou.
- Tlačítko ☰ boční panel
- Long-press na prázdné místo na CAD plátně → precision křížek (numerický vstup).
  Když křížek dojede nad tlačítko nad plátnem (SOU/ABS/R, ↩, 🔢, 🧲…), místo
  souřadnic ukáže žlutou bublinu s popisem tlačítka; puštění prstu pak klikne
  na tlačítko (bod pod ním se do výkresu nezapíše)
- Long-press kdekoli jinde v UI (panely, lišty, dialogy, plovoucí tlačítka) →
  precision pointer: nad prstem se ukáže kolečko s offsetem, které funguje jako
  kurzor myši pro přesné zacílení malých/blízko sebe umístěných ovládacích prvků
- Touch zoom: pinch
- Pan: jeden prst

### Klávesové zkratky
| Klávesa | Akce |
|---------|------|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Delete` | Smazat vybraný |
| `Escape` | Zrušit akci / vybrat nástroj |
| `Ctrl+0` | Vycentrovat výkres |
| `Ctrl+A` | Vybrat vše |
| `Ctrl+C` / `Ctrl+V` / `Ctrl+X` | Kopírovat / Vložit / Vyjmout |
| `F2` | Přejmenovat objekt |
| `F5` | Načíst projekt |
| `Space` | Podržený = pan (tažení plátna) |

---

## Základní kreslení

### Úsečka
1. Vyber **Úsečka** v toolbaru
2. Klikni na počáteční bod
3. Klikni na koncový bod (nebo zadej číselně v postranním panelu)
4. Po kreslení se otevře dialog pro přesné zadání délky/úhlu

### Typ čáry (dřívější „Konstr.")
Tlačítko v toolbaru neotevírá rovnou kreslení, ale **dialog s výběrem typu
čáry** podle ČSN EN ISO 128 a barvy. Zvolený typ pak platí pro všechny další
nakreslené čáry, dokud ho nezměníš – popisek tlačítka se přepíše na zkratku
zvoleného typu (`Tlustá`, `Tenká`, `Čárk.`, `Čerch.`, `2čerch`, `Konstr`).

| Typ čáry           | Vzhled        | Použití ve výkrese                     |
|--------------------|---------------|----------------------------------------|
| Souvislá tlustá    | `━━━━━━━━━━`  | Viditelné hrany a obrysy               |
| Souvislá tenká     | `──────────`  | Kótovací a odkazovací čáry, šrafy      |
| Čárkovaná          | `- - - - - -` | Zakryté hrany a obrysy                 |
| Čerchovaná tenká   | `─ ∙ ─ ∙ ─ ∙` | Osy souměrnosti, středy kružnic        |
| Dvoječerchovaná    | `─ ∙ ∙ ─ ∙ ∙` | Sousední díly, krajní polohy           |
| Konstrukční        | `- - - - - -` | Nekonečná pomocná čára (2 body)        |

- **Barva** – sedm základních barev, vlastní barva, nebo `A` = podle vrstvy.
- **Pomocná čára – mimo konturu a CAM** – zaškrtnuté čáry se ukládají jako
  pomocná geometrie do vrstvy *Konstrukce*: nevstupují do kontury ani do
  G-kódu. Přednastavuje se podle typu čáry (souvislá tlustá = skutečná
  geometrie, ostatní pomocné), ale jde to přepnout.
- Postup kreslení je stejný jako u úsečky: klik na počáteční a koncový bod.
- Klávesová zkratka `K` zapne nástroj rovnou s posledním zvoleným typem
  (dialog se neotevře). Klik na již aktivní tlačítko dialog otevře znovu
  a nabídne i **Vypnout**.

### Kružnice
1. Vyber **Kružnice**
2. Klikni do středu
3. Klikni na okraj (nebo zadej průměr)

### Oblouk
1. Vyber **Oblouk**
2. Klikni na střed
3. Nastav poloměr (dialog)
4. Klikni na počáteční bod
5. Klikni na koncový bod

### Obdélník
1. Vyber **Obdélník**
2. Klikni na první roh
3. Klikni naprotilehlý roh

### Polyline
1. Vyber **Polyline**
2. Postupně klikni na vrcholy
3. Klikni na první bod pro uzavření, nebo `Escape` pro ukončení

### Tužka
1. Vyber **Tužka**
2. Táhni myší (nebo prstem na mobilu) po plátně – vzniká náčrt od ruky
3. Puštěním tlačítka/prstu se tah uloží jako jeden objekt (jde ho pak
   rozložit na jednotlivé úsečky přes **💥 Rozložit konturu** v kontextovém
   menu)

### Text
1. Vyber **Text**
2. Klikni na pozici
3. Zadej text v dialogu
4. Volitelně:Text podél cesty (line/arc)

---

## Úpravy geometrie

### Přesun, Kopírovat, Rotace, Měřítko
1. Vyber nástroj (Přesun, Kopírovat, Otáčet, Měřítko)
2. Klikni na objekt
3. Proveď operaci:
   - Přesun: klikni na novou pozici
   - Kopírovat: stejně jako přesun, ale vznikne kopie
   - Rotace: zadej úhel v dialogu
   - Měřítko: zadej faktor

### Zaoblení / Zkosení
1. Vyber **Zaoblení** nebo **Zkosení**
2. Klikni na první objekt (úsečka, oblouk, polyline)
3. Klikni na druhý objekt
4. Zadej parametry (rádius / délka + úhel) v dialogu

### Ořez / Prodloužení
1. Vyber **Ořez** nebo **Prodloužit**
2. Klikni na hranu, kterou chceš odstranit/prodloužit
3. Objekt se přizpůsobí

### Tečna / Rovnoběžka / Kolmice
1. Vyber nástroj
2. Klikni na první objekt
3. Klikni na druhý objekt
4. Tečna se vytvoří automaticky

### Offset (vnější/vnitřní křivka)
Dialog nabízí dva režimy:

**∥ Paralelní** (výchozí) – skutečná paralelní kopie, tedy obrys ve stále
stejné vzdálenosti od originálu:
1. Vyber **Offset**
2. Klikni na objekt (nebo si objekty předvyber a zmáčkni Offset)
3. Zadej vzdálenost a potvrď
4. Klepni na tu stranu, kam má kopie jít – podle kliknutí se určí směr
   (u kružnice tak klik dovnitř zmenší, klik ven zvětší)

Kontura si zachová zaoblené rohy: obloukový segment se posune souosle
(změní se jen poloměr), nezploští se na úsečku. Když je offset větší než
poloměr oblouku, takový segment zanikne.

**↗ Posun o úhel** – kopie posunutá o zadanou vzdálenost pod zadaným úhlem
(0°=vpravo, 90°=nahoru); tvar se nemění, jen se posune.

> Rozdělaný výběr strany zrušíš klávesou **Esc** nebo přepnutím nástroje.

### Pole (Array)
- **Lineární pole**: zadání počtu kusů, vzdálenost X/Y, úhel
- **Kruhové pole**: zadání počtu kusíků, průměr, úhel rotace

### Boolean operace
1. Vyber **Boolean**
2. Vyber první tvar
3. Vyber druhý tvar
4. Zvol operaci: Sjednocení, Průnik, Odečtení

---

## Kótování

### Lineární kóta
1. Vyber **Kóta**
2. Klikni na první bod
3. Klikni na druhý bod
4. Klikni na pozici popisku

### Úhlová kóta
1. Vyber **Úhelová kóta** (dostupná při výběru dvou úseček)
2. Klikni na první úsečku
3. Klikni na druhou úsečku
4. Klikni na pozici popisku

### Souřadnicová kóta
- Zobrazí X/Z souřadnici bodu
- Dostupná v pravém panelu nebo po kliknutí na objekt

### Asociativní kóty
- Kóty zůstanou přirozené i po úpravě objektů
- Platí i pro kóty kontury (polyline): po posunu kontury nebo úpravě vrcholů
  se kóty úseků i poloměrů oblouků přepočítají; po vložení/odebrání vrcholu
  zůstane kóta u svého úseku
- Smazáním objektu smaž i jeho kóty

### Duplicitní kóty
- Kóta, která měří totéž co kóta už ve výkresu (stejná úsečka/body, stejný
  směr měření, stejný oblouk či úhel), se znovu nepřidá – zobrazí se hláška
  „Tato kóta už ve výkresu je“. Na odsazení ani umístění popisku nezáleží.
- Různé prvky se stejnou hodnotou (např. dva stejné průměry na různých
  osazeních) se okótují normálně.

### Režimy zobrazení kót
Přepínají se tlačítkem **📐 Kóty**, klávesou `D`, klikem na indikátor 📐 ve
stavovém řádku nebo v ⚙️ Nastavení → 📐 Kóty:

| Režim | Explicitní kóty | Automatické popisy (R/⌀ u oblouků a kružnic, rozměr obdélníku, délka polyline) | Průsečíky |
|-------|-----------------|-------------------------------------------------------------------------------|-----------|
| **Vše** (📐V)       | ano | ano | ano |
| **Průsečíky** (📐P) | ne  | ne  | ano |
| **Kóty** (📐K)      | ano | ano | ne  |
| **Skryté** (📐–)    | ne  | ne  | ne  |

Automatické popisy R/⌀ jsou kóty, proto se v režimu **Průsečíky** nezobrazují –
tam zůstanou na plátně jen samotné průsečíky. Stejné pravidlo platí i pro export
do SVG.

---

## DXF import/export

### Import DXF
1. Klikni na ☰ → **Načíst DXF**
2. Vyber soubor `.dxf`
3. SKICA parsuje:
   - LINE, CIRCLE, ARC, LWPOLYLINE, POLYLINE, TEXT
   - INSERT, BLOCK (včetně vnořených bloků)
   - 3DFACE, ELLIPSE, SPLINE
4. Objekty se přidají do výkresu

### Export DXF
1. Klikni na ☰ → **Export DXF**
2. Stáhneš `.dxf` soubor s aktuálním výkresem
3. Použitelné v AutoCAD, LibreCAD, Fusion 360

### Omezení
- Max 10 000 entit
- Některé pokročilé DXF vlastnosti nemusí být přeneseny

---

## Soustružnické generátory

### Zubové kolo
1. Vyber **Ozubení**
2. Zadej parametry:
   - Počet zubů, modul, tloušťka
   - Typ: Cylindrické / Kuželové (zobáčkové) / Vnitřní / Řetězové kolo
3. Klikni na pozici středu ve výkresu
4. Vznikne generovaný profil s roztečnými / hlavovými / patními kružnicemi

### Pár ozubených kol
- Automaticky vygeneruje dvě za sebou zapojená kola
- Zadej parametry prvního kola, druhý se dopočítá

### Drážka (DIN 374 / VDI)
1. Vyber **Drážka**
2. Zadej: šířku, hloubku, úhel, DIN tabulka
3. Klikni na osu Z (umístění)
4. Vznikne geometrie drážky

### Závit
1. Vyber **Závit**
2. Klikni na úsečku kontury rovnoběžnou s osou rotace (válcovou plochu) –
   **vodorovnou** (soustruh) i **svislou** (karusel, osy prohozené); začátek
   závitu je u konce, ke kterému klikneš
3. V dialogu zvol typ a velikost (předvybraná podle ⌀ úsečky), délku,
   sražení, zápich DIN 76 a konstrukční čáry d₂/d₃
4. Nástroj upraví konturu (sražení, zápich, ⌀) a uloží údaje pro CAM;
   u svislého závitu se popisek kreslí podél úsečky

### Zápich (DIN 76/509)
1. Vyber **Zápich** a klikni na místo vstupní hrany
2. Zadej typ, průměr, rozměry a **orientaci**:
   - **Vodorovně ↔** – plocha vodorovně, hloubka jde dolů (soustruh: zápich
     na válci, karusel: na čele)
   - **Svisle ↕** – plocha svisle, hloubka jde doleva (karusel: na válci,
     soustruh: na čele)
   Výchozí orientace je podle typu stroje. **Průměr** určuje radiální polohu
   (soustruh: výška, karusel: vodorovná poloha), druhou souřadnici dá klik.
3. Vytvoří se zápichová geometrie

**Čelní zápich (O-kroužek).** Typ **Čelní zápich — do čela**: klikni na
čelo, zadej vnitřní **⌀d1**, vnější **⌀d2**, **hloubku** a případně
**sražení** hran u čela. Orientace říká, kterým směrem zápich jde (čelo
vpravo → zápich doleva, čelo vlevo → doprava). Vznikne otevřená křivka
čelo → vnitřní stěna → dno → vnější stěna → čelo; CAM ji v Upich + ⊚ Čelní
pozná (✏ Z výkresu).

---

## CAM workflow

CAM část ti umožní generovat NC programy pro obrábění.

### 1. Polotovar
1. Vyber **Polotovar**
2. Zadej průměr (např. 50 mm)
3. Klikni na plátno – vytvoří se kružnice polotovaru

### 2. Kontura / Profil
- Profil obráběného kusu: linií, oblouky, polyline
- Pro CAM použij **Kontura** šablonu nebo nakresli vlastní
- **Do CAM jde jen jeden souvislý profil** (nejdelší napojený řetěz čar).
  Zbude-li mimo něj něco (osamocená čára, kus odtržený mezerou, kružnice),
  aplikace to před otevřením CAM přiblíží, vyznačí **fialově „mimo profil"**
  a zeptá se: **Otevřít CAM bez nich**, nebo **Zpět do výkresu** (typicky
  spojit mezeru). Body (nástroj Bod) se do CAM neposílají nikdy.
- **Zdvojené čáry** – dvě stejné čáry přesně přes sebe (dvakrát nakreslená
  nebo zkopírovaná úsečka) na výkrese nejsou vidět, ale kontura se kvůli nim
  hlásí jako rozvětvená. Aplikace je vyznačí **žlutě „2× přes sebe – klikni"**,
  přiblíží na ně a nabídne **Smazat kopii** (Zpět ji vrátí). Nabídka přijde
  jednou, když zdvojení vznikne (nebo při otevření CAM); po **Ponechat**
  zůstane žluté vyznačení a **kliknutím na žlutou čáru nebo její popisek**
  (nástroj Výběr, myš i prst) se nabídka smazání objeví znovu. Do CAM se
  přebytečná kopie neposílá ani tak.

### 3. CAM Simulátor
1. Klikni na **CAM** v Sinumerik rozcestníku
2. Vyber operaci:
   - **Hrubování** – podélné nebo čelné
   - **Dokončování** – objezd kontury
   - **Upichování** – parting/part-off
3. Nastav parametry:
   - Rychlosti, posuv, otáčky
   - Šířka řezu, směr, zanoření
4. Klikni **Spustit** – uvidíš simulaci dráhy nástroje
5. Červená destička = aktuální pozice

**Návrat do CAD = křížek ✕** v liště nahoře. Bez změn v CAM jen zavře (výkres
zůstane, jak byl). Se změnami se zeptá: **Zahodit změny**, nebo **📐 Zachovat
a přenést** — výkres v CAD se pak nahradí konturou, polotovarem a konstrukčními
čarami z CAM (s tvými úpravami) a program drah se uloží do výkresu, takže se
při dalším otevření CAM obnoví. Co do CAM nešlo (kóty, texty, kresba mimo
profil), po přenosu ve výkresu není — vrátíš to v CAD přes ↩ Zpět.

**🎯 Centrovat** vejde díl, polotovar i bezpečnou polohu do plátna, ale volné
místo nedělí rovnoměrně: víc ho nechá na straně, odkud jede nůž — radiálně
od osy ven (podle toho, nad nebo pod osou díl leží), axiálně podle strany
obrábění (▶ zprava / ◀ zleva). Plocha pod tlačítky nahoře se nepočítá.
**▼ vlevo od přehrávače** přepíná spodní panel ve třech krocích: celý panel →
**4 řádky** (blok, který právě prošel, ztlumeně; běžící blok zvýrazněný
a pod ním dva, které přijdou; prázdné řádky a komentáře se přeskakují) →
skrytý (▲) → zpět
celý. Na mobilu (i na šířku) se díl po každém přepnutí sám vycentruje —
stejně jako po otočení telefonu z výšky na šířku a zpět.
Klik na dráhu otevře celý panel jen ze skrytého stavu; ve 4 řádcích se
kliknutý blok ukáže v nich.

**Lišta nad plátnem se otevírá sbalená** (»«): vidět je jen ◎, »«, ↩/↪, číslování
a ✕. Tlačítkem **»«** se rozbalí Kontura, Dráhy, 🎯, 👁, 📏, 🧲 a 📈 (a **«»** je
zase schová).

#### ◎ Pohled na čelo a poháněné nástroje
Tlačítko **◎** v liště plátna přepíná jako ◎ Čelo v CAD ve třech krocích:
**řez → řez + pohled na čelo → ◉ jen pohled na čelo** (fialové, přes celou
plochu) → řez. Vedle řezu je pohled vpravo, na mobilu na výšku pod ním. Je to
**pohled podél osy proti sklíčidlu** (na karuselu shora na upínací desku)
jako **řez v rovině Z** — stejně jako bokorys v CAD: vyplněná plocha řezu
(materiál těsně za rovinou ve směru pohledu; v rovině osazení celý větší
průměr), za ní hrany profilu plně a zakryté materiálem čárkovaně, polotovar
a díry / kapsy / drážky poháněných nástrojů s čísly v pořadí NC (díry do
jiného čela než v rovině řezu jsou ztlumené). Sklíčidlo s čelistmi se
nekreslí (jako v bokorysu CAD).

**Lišta řezu** pod hlavičkou pohledu: **Z** (políčko, lze i výraz),
**posuvník** roviny řezu po dílu i polotovaru (přichytí se k osazením,
koncům polotovaru a k čelům operací)
a **◀ zprava / ▶ zleva** (šipka = směr pohledu; dokud ji nepřepnete ručně,
volí se podle osazení). Výchozí rovina je pravý konec dílu. V řezu vlevo je
rovina vidět jako čerchovaná čára se šipkou a popiskem Z. Tlačítko **Z↔**
lištu schová / ukáže (pamatuje si to), **⤢** zvětší pohled přes celé okno
simulátoru (i přes G-kód), **⤡** ho vrátí. Pohled se ovládá jako nárys:
**kolečko** myši / **dva prsty** = zoom, **tažení** myší / jedním prstem =
posun; **dvojklik** / dvojí ťuknutí nebo **🎯** v rohu (ukáže se jen
u přiblíženého či posunutého pohledu) ho vycentruje. **🛠 Operace** otevře editor
v maximalizovaném pohledu — na výšku náhled nahoře a formulář pod ním, na
šířku vedle sebe; po zavření editoru se pohled zase zmenší.

Poháněný nástroj stojí v revolveru **nahoře (X+, jako v řezu / nárysu)** —
žlutá šipka „nástroj"; u karuselu vpravo, jinak v nastavení NC výstupu
*Nástroj stojí*. Při obrábění se k němu **natáčí kus** osou C (díra, na
které se vrtá, je nahoře pod nástrojem) — nástroj kus neobjíždí. Zelený zářez
**C0** na obvodu kusu je bod pod nástrojem při C0 (podle kalibrace úhlu;
bez kalibrace nahoře) a oblouček **+C** ukazuje, kterým směrem úhel roste.
Úhel v NC = posun + směr · (úhel díry − úhel nástroje), tj. u soustruhu
`SPOS = úhel díry − 90°`. Lišta a ◎ bokorysu
z CAD se nad oknem CAM neukazují (ovládaly by výkres pod ním). Díry se
kreslí i do řezu (sklopené do roviny řezu jako na výkrese, čárkovaně), úběr
soustružení neovlivní.

**Simulace vrtání a frézování.** **▶** v hlavičce pohledu spustí obrábění
poháněnými nástroji (**⏸** pozastaví, další ▶ pokračuje): nástroj jede
v pořadí NC, díry se do materiálu prohlubují (tmavé = odebraný materiál,
sytost podle dosažené hloubky), fréza za sebou nechává stopu, hotová operace
má zelený okraj a neobrobené díry jsou čárkovaně. V řezu vlevo se sklopené
díry a kapsy vybarví jako úběr do dosažené hloubky i se špičkou vrtáku.
Nahoře vlevo je operace, díra / kapsa, hloubka, čas a nástroj. Čas je
skutečný (posuv F, rychloposuv stroje, natočení osy C, krokové vrtání,
prodleva) a běží stejnou rychlostí jako přehrávač soustružení (▼ 1× ▲).
Kus se přitom **natáčí k nástroji** (přejezd mezi dírami = natočení osy C)
a v řezu se soustružení ztlumí a je vidět vrták / fréza na dosažené hloubce
ve výšce díry pod nástrojem. Když přehrávač CAM **dojede program, ve kterém
je vrtání** (operace Vrtání nebo 📝 blok), vrtání a frézování **plynule
naváže** (pohled na čelo se sám otevře a sleduje čelo, na kterém se
právě vrtá). ⏹ nebo posun přehrávače zpět vrátí díry do neobrobeného
stavu; ⏭ na konec ukáže díl rovnou obrobený. Dojel-li program a vrtá se,
**▶ / ⏸ v přehrávači dole vrtání pozastaví a pustí dál** (neskočí na začátek
programu). Při přehrávání se v G-kódu **zvýrazní řádek bloku**, který se
právě vrtá / frézuje — najetí na díru (řádek „díra k"), pak celé vrtání
díry na řádku **cyklu** (i vyjíždění pro odvod třísky); rozepsaný kód jde
řádek po řádku (G0 na R rovinu, G1 záběr, G0 vyjetí, návrat, prodleva,
odjezd). Totéž ukazují i **4 řádky** G-kódu na mobilu. Nad časem je
nástroj, otáčky a posuv (nebo G0 / natočení C), v řezu jsou **dráhy
vrtáku** jako dráhy soustružení — posuv plně zeleně, rychloposuv čárkovaně
(bezpečná X → Z odjezdu → poloměr díry → do hloubky; přepínač drah platí
i pro ně) — a nástroj soustružení (např. vrták části na bezpečné poloze)
se po dobu vrtání nekreslí, vidět je jen nástroj, který vrtá.

**Kontrola proti dílu.** Každá operace se porovná se skutečným tvarem dílu
(hotová kontura — vrtá se až po soustružení; díra skrz vč. polotovaru i proti
polotovaru). Nálezy jsou v editoru
🛠 Operace pod formulářem operace (**⛔ chyba** červeně, **⚠ upozornění**
žlutě), u karty operace je červená / žlutá **tečka** (najetím myší ukáže
nálezy) a v pohledu na čelo mají problémové díry, kapsy a drážky **červený**
(upozornění žlutý) obrys a dole je počet nálezů. Kontroluje se:

- **Díra / kapsa / drážka do čela leží celá v materiálu čela** — v rovině
  Z čela při pohledu ze strany čela (◀ zprava / ▶ zleva) mezi vývrtem
  a obvodem (r − Ø/2 ≥ vývrt, r + Ø/2 ≤ obvod; drážka celá i s šířkou
  frézy). Hlášky: *mimo materiál čela*, *přesah přes obvod*, *zásah do
  vývrtu* (do zápichu); bez materiálu za čelem *zkontrolujte Z čela a stranu
  čela*.
- **Hloubka do čela** — díra zůstane do plné hloubky v materiálu: *skrz –
  materiál končí v hloubce …* (upozornění: za dílem může být upínač),
  *náraz do vývrtu Ø…*, *výjezd z obvodu Ø…* (chyba).
- **Radiální díra** — Ø pláště musí odpovídat dílu v Z díry (± 0,1 mm),
  jinak hláška s nalezeným Ø; díra přes konec dílu je chyba, díra na
  přechodu průměrů (osazení, kužel pod dírou) a díra skrz stěnu do vývrtu
  jsou upozornění. Hloubku přes osu hlídá kontrola zadání.
- **Bezpečná vzdálenost a odjezd** nesmí vést do materiálu: u čela osazení
  nad dírou blíž, než je odjezd (*odjezd 5 mm narazí do osazení Ø80 – je jen
  3 mm nad čelem*), u pláště osazení vedle díry vyšší než bezpečná rovina;
  Z čela uvnitř materiálu ukáže, kde je skutečný povrch.

Kontrola NC program nemění — operace s nálezem se do bloku zapíše dál, opravte
ji podle hlášky.

**Bokorys v CAD (◎).** Tlačítko **◎ Čelo** (desktop: horní lišta; mobil:
kulaté ◎ nahoře u 🔢) přepíná ve třech krocích: **profil → profil + bokorys
→ jen bokorys** (◉, ostatní vrstvy dočasně skryté) → profil; každé přepnutí
zarámuje to, co je vidět. Bokorys = pohled na čelo **vpravo vedle nárysu**
(i na mobilu) na ose vřetena; od průměrů profilu v rovině čela k němu vedou
čárkované promítací čáry. Bokorys je **řez jako na výkresu**: vyplněná
plocha řezu v rovině vybraného čela a za ní (ve směru pohledu) hrany
profilu — hrana je **plná**, když ji mezi ní a řezem nezakrývá materiál,
jinak **tenká čárkovaná** (skrytá hrana); co leží před řezem, se nekreslí,
téměř totožné kružnice (konce zaoblení) se sloučí. Kontura je modrá,
**polotovar v barvě vrstvy Polotovar** čerchovaně se dvěma tečkami — v rovině
čela i **větší polotovar za ní** (ve směru pohledu; menší, který zakrývá,
ne), středový kříž se **stupnicí v mm od středu čela** a kóty Ø (jen náhled;
sklíčidlo se nekreslí). Čísla hlavních os se
v bokorysu a za ním nekreslí, v „jen bokorysu" ani průsečíky profilu.
**SNAP** chytá střed bokorysu, kvadranty a obvod kružnic podkladu i osy
kříže; střed bokorysu leží na celých desítkách, takže i mřížka měří od něj.

**Čela.** Díry mohou být na kterémkoli osazení, zprava i zleva. Lišta čela
leží přímo na plátně pod nárysem — posouvá se s výkresem a mění velikost se
zoomem, a když do nárysu něco dokreslíte níž, sama se posune pod to; na soustruhu je posuvník stejně dlouhý jako profil a jezdec stojí
přesně pod značkou řezu. Pod posuvníkem jsou dva řádky: výběr čela, ➕, 🗑
a pod nimi Z s ✔ a stranou. Obsahuje výběr čela (položka = pořadí, Z se stranou
a obsah kresby, např. „2: Z76 ◀ · 3 díry" — víc čel ve stejném Z jde rozlišit),
**➕** nové čelo (vlastní kresba), **🗑** smazat
čelo i s kresbou (po potvrzení, nejde vrátit; stejně tak smazání vrstvy čela
v panelu Vrstvy — objekty se nepřesouvají na Konturu),
**Z** roviny čela (políčko, lze i výpočet, např. `76-5,5`; jakmile do něj
píšete, objeví se zelené **✔** — potvrdí ho, stejně jako Enter nebo odchod
z políčka, Esc vrátí původní hodnotu; po potvrzení je v políčku výsledek)
a **posuvník**, který se přichytává
k osazením profilu a ke koncům polotovaru (sahá i přes polotovar — úplně
vpravo = před polotovarem, ne jen před hotovou konturou), a **◀ zprava / ▶ zleva** — odkud se na čelo díváte a
odkud nástroj přijíždí; šipka ukazuje směr pohledu (podle osazení se strana
nastaví sama, dokud ji nepřepnete). V nárysu je
značka řezu s popiskem Z a šipkami ve směru pohledu (je-li pod osou prázdno,
jen nad osou a lišta čela stojí hned pod osou) — **řez lze chytit myší
nebo prstem a táhnout po profilu** (bokorys zapnutý; ve Výběru kdekoli na
čáře, v nástrojích kreslení za konce přesahující díl — šipky, popisek Z —
uvnitř dílu se kreslí; najetí = kurzor ↔ a zvýraznění čáry, u osazení se
přichytí, prst chytá do 22 px od čáry, myš do 8 px). Posuvník lišty
čela jde chytit kdekoli na dráze (myší i prstem), jezdec skočí pod prst. Čelo se při tažení přepočítává průběžně. Kreslí se do aktuálního
čela: **kružnice = díra** (střed = poloha, Ø kružnice = Ø díry), **úsečka =
drážka**. Kružnice **čárkovaná nebo čerchovaná** (Typ čáry) je **pomocná** —
roztečná kružnice, díra se z ní nedělá a do CAM nejde. Žlutá šipka nahoře
(u karuselu vpravo) ukazuje, kde stojí poháněný nástroj — k němu se díra při
vrtání natočí osou C; popisky C0° / C90° jsou úhly výkresu.

**Díry na roztečné kružnici.** Nástroj **Kr.pole** v bokorysu: klepněte do
prázdna (typicky na **střed** — SNAP ho chytí) a **vytáhněte roztečnou
kružnici** — tažením se stisknutým tlačítkem, nebo druhým klepnutím na obvod
(náhled ukazuje Ø; SNAP chytá i kružnice podkladu a mřížku). Otevře se
kalkulačka **◎ Rozmístění děr** se středem (X0 Y0 = osa vřetena) a Ø rozteče;
druhé klepnutí znovu do středu = Ø zadáte číslem. Doplňte počet děr, Ø díry,
**hloubku díry** (případně θ₀) a **◎ Do čela** — do aktuálního čela se
nakreslí roztečná kružnice čerchovaně a díry plnou čarou, vše jedním krokem ↩.
**Hloubka díry:** *Skrz* — skrz materiál pod dírou až tam, kde z něj vyjde
(stěna příruby, ne náboj za ní) + přesah (prázdný = hrot 0,3·Ø + 1 mm);
**Skrz materiálem** *Hotová kontura* (výchozí) nebo *I polotovar* — počítá
i přídavek polotovaru (vrtá se před soustružením; díra „skrz vč. polotovaru"
je v CAM samostatná operace a kontroluje se i proti polotovaru). Stojí-li
čelo uvnitř polotovaru (např. na konci hotové kontury), díra *I polotovar*
začne na **povrchu polotovaru** na straně nástroje, ne v něm;
*Do hloubky* — od roviny čela; *Do Z* — absolutní Z konce díry (Z na straně
nástroje se odmítne). Hloubka se počítá až při 📥 Z CAD z aktuálního profilu
a Z čela, takže po posunu čela sedí; hláška po nakreslení ji ukáže hned. Klepnutí na už nakreslenou díru otevře dialog
kruhového pole se středem v **ose čela** (ne v 0,0 výkresu).
**Jedna díra:** nástroj **Díra** (Více, vedle Kr.pole) — klepněte do
bokorysu na místo díry (SNAP chytá střed, kružnice podkladu, mřížku);
otevře se okno **◎ Díra do čela** s polohou X, Y vůči ose vřetena (vidět
i polárně: Ø a úhel C), Ø díry a hloubkou jako výše → **◎ Do čela**. Ø
a hloubku si okno pamatuje pro další díru. Bez zapnutého bokorysu se okno
otevře s X0 Y0 a ◎ Do čela bokorys zapne.
**Díra do pláště (radiální):** nástrojem **Díra** klepněte v **nárysu** na
díl v místě díry (na obrys nebo do materiálu) — otevře se okno **⊥ Díra do
pláště** se Z z klepnutí: Ø díry, hloubka (*Do hloubky* od pláště / *Do Ø* /
*Skrz stěnu* do vývrtu + přesah, prázdný = 0,3·Ø + 1), **počet po obvodu**
(rovnoměrně) a **úhel C** první díry (C 0° = X bokorysu, C 90° = Y — jako
díry v čele). **Natočit podle** nabídne díry v čele: úhel = jejich C +
**odsazení**, takže radiální díra sedí vůči díře v čele. Okno hned ukáže
Ø pláště v Z díry, radiální hloubku (dno na Ø) a úhly. → **⊥ Do pláště**
nakreslí do vrstvy **Díry v plášti** osu díry napříč osou vřetena a obrys
skrytou čarou se špičkou 118° (díra natočená do roviny nárysu); v bokorysu
se každá díra ukáže jako **paprsek** od pláště na svém úhlu — natočení vůči
dírám v čele je vidět. Ø pláště a hloubka se počítají z aktuálního profilu
(po úpravě kontury díra sedí sama; nejde-li určit, osa je přeškrtnutá
červeně). Klepnutí nástrojem Díra na osu díry ji otevře k **úpravě**. Víc
děr podél osy: **Lin.pole** (kopie nesou data díry). Smazání vrstvy Díry
v plášti smaže i díry (↩ vrátí). V CAM se přenesou samy jako **vrtání do
pláště (osa X)** — jedna výška po obvodu = rozteč, víc výšek = seznam bodů
„úhel; Z"; jiný Ø pláště = samostatná operace.
**Drážka do čela (ovál):** nástrojem **Drážka** klepněte do **bokorysu** —
otevře se **◎ Drážka do čela** se středem v místě klepnutí (X, Y vůči ose
vřetena): délka (vnější), šířka, úhel osy (**↻ Radiálně** ke středu /
**⟂ Tečně**, výchozí radiálně) a hloubka jako u děr (*Skrz* / *Do
hloubky* / *Do Z*, u skrz i polotovar). → **◎ Do čela** nakreslí obrys
drážky do aktuálního čela; osa a šířka se čtou z obrysu, takže drážku jde
přesunout, otočit i rozkopírovat Kr.pole. Klepnutí nástrojem Drážka na
drážku v bokorysu ji otevře k úpravě. V CAM se přenese sama jako
frézování **Drážka** s šířkou drážky: fréza užší než drážka jede po ose
a pak kolem ní odsazením po ½ Ø frézy až na okraj (víc průjezdů); fréza
širší než drážka je chyba zadání (z výkresu se fréza zúží na šířku).
V 🛠 Operace má drážka pole **Šířka drážky** (prázdné = Ø frézy).
Úsečka v čele dál znamená drážku šířky frézy.

**Drážka pro pero do pláště:** nástrojem **Drážka** klepněte v **nárysu**
na díl v místě drážky — otevře se **⊐ Drážka pro pero** se Z klepnutí jako
středem: délka (vnější, vč. zaoblení), šířka (= Ø frézy), hloubka *od
pláště* nebo *do Ø* dna, počet drážek po obvodu a úhel C (i **Natočit
podle** díry v čele + odsazení). Okno ukáže Ø pláště, radiální hloubku a Z
konců; plášť musí být po celé délce stejný (drážka přes osazení se
odmítne). → **⊐ Do pláště** nakreslí do vrstvy Díry v plášti úsečku na
plášti mezi konci drážky; obrys se v nárysu ukáže skrytou čarou podle
natočení pohledu (k nám = zaoblený obrys shora), v bokorysu jako obdélník
na úhlu C. Klepnutí nástrojem Drážka na ni otevře úpravu; tlačítko
**Ovál (obecně)** nakreslí dřívější oválnou drážku (2D, do CAM nejde).
V CAM se přenese sama jako frézování **Drážka pro pero** (🛠 Operace →
Frézování → Drážka pro pero (plášť)): kus stojí na úhlu C, fréza Ø =
šířka zanoří v X (0,3·F, musí řezat středem) a jede v Z mezi středy konců,
vrstvy po kroku do hloubky tam a zpět; simulace, řez, pohled na čelo
i kontrola proti dílu (drážka přes osazení = chyba).

**Frézy (poháněné nástroje).** Fréza patří do 🔧 Zásobníku jako tvar **✣**
(Ø, počet zubů z, vyložení, **řeže / neřeže středem**, Vc, **fz** posuv na
zub, krok do hloubky) nebo z 🧰 Knihovna → 📚 → **Frézy (poháněné)**
(tvrdokov 3 / 4 zuby, HSS-Co 2 zuby řežou středem, HSS-Co 4 zuby neřeže;
Ø2–25) tlačítkem **🔧 Do zásobníku**. Soustružit s frézou nejde — jako
aktivní nůž ji vybrat nelze. CAM ji pro frézování z výkresu vybere sám
(záložka **Frézování**, jako vrtáky v záložce Vrtání): kapsa = největší fréza, která se vejde;
drážka na čele se šířkou = největší Ø ≤ šířka (užší jede víc průjezdů);
drážka šířky frézy a drážka pro pero = fréza přesně na šířku. Otáčky
n = Vc·1000/(π·Ø), posuv F = fz·z·n, krok do hloubky ze slotu, číslo T ze
zásobníku. Chybí-li vhodná fréza, při přepnutí na záložku Frézování se doplní
VHM z 📚 (jako vrták), u operace je i **➕ Přidat frézu z 📚**. Bez frézy
v zásobníku dostane operace volné T (dřív výchozí T6 = upichovák). Fréza,
která **neřeže středem**, se nezanořuje kolmo: drážka na čele **rampou** cik-cak
po ose drážky, kapsa **šroubovicí** (poloměr ≤ ¼ Ø frézy, 24 kroků na otáčku),
drážka pro pero cik-cak v Z — vše se sklonem 3°; po rampě se na plné hloubce
projede celá délka. Kde na rampu není místo (kapsa ≈ Ø frézy), zanoří kolmo
a kontrola proti dílu to hlásí.

**Závit do díry (závitník).** V oknech děr do čela (Jedna díra, Kružnice,
Řada, Mřížka) i v okně ⊥ Díra do pláště je pole **Závit** (M3–M24 hrubé).
Volba závitu přepne Ø díry na **Ø předvrtání** (M8 → ⌀6,8); díra nese závit
a v CAM po vrtání přibude operace **Závit M8 → …** se stejnými pozicemi.
Hloubka závitu: skrz = tloušťka materiálu + 2·P (náběh vyjde ven), slepá
díra = hloubka díry − 2·P (závitník nesmí do špičky). Závitník patří do
🔧 Zásobníku jako tvar **Ⓜ** (závit, stoupání P, Vc) nebo z 📚 →
**Závitníky (poháněné)** (HSS-E B průchozí, HSS-E C slepé); CAM ho vybere
podle Ø a stoupání, chybějící doplní z 📚. Otáčky n = Vc·1000/(π·Ø), posuv
**F = P · n** (mm/min). NC: Sinumerik `SETMS(n)` + `CYCLE84` (synchronně,
čelo G17 / plášť G19), Fanuc `M29 S…` + `G84` (čelo) / `G88` (plášť);
s vypnutými cykly a na Heidenhainu rozepsaně do plovoucího pouzdra — G1 na
hloubku, **reverz nástroje** (M-kód „Nástroj reverz" ve Výstupu NC), G1 ven.

**Navrtání před vrtáním.** V záložce Vrtání → **Navrtání** → *Navrtat před
vrtáním*: ke každé díře z výkresu přibude operace **Navrtání** navrtávákem
(nejmenší s Ø ≥ Ø sražení; navrtávák = vrták s „navrt" v názvu nebo vrcholem
≤ 100°, obyčejné vrtání ho nevybere). Ø sražení = Ø díry (u závitu Ø závitu)
+ 2 × **Sražení navrtáním** (Výstup NC, výchozí 0,5 mm), hloubka = Ø/2 ÷
tan(σ/2) podle vrcholu navrtáváku, na jeden zátah s prodlevou 0,3 s.
Pořadí programu: všechna navrtání → vrtání → závity. Navrtání i závit se
vybírají spolu se svou dírou (klepnutí v pohledu na čelo / zaškrtávátko).

**Natočení pohledu (posuvník u bokorysu):** svislý posuvník vedle
bokorysu nastavuje, který úhel C je v nárysu **nahoře** (výchozí soustruh
C 90°, karusel C 0°; tažením nahoru úhel roste, přichytí se k úhlům děr
v čele i v plášti a po 45°; pod bokorysem políčko pro přesný úhel — i výpočet,
např. `90+60`, potvrdí ho **✔** nebo Enter — a ⟲ zpět; natočení platí pro
všechna čela, nové čelo ho převezme). Posuvník stojí napevno **vlevo**
od bokorysu (mezi nárysem a bokorysem) a posouvá se s ním; když se tam
při oddálení nevejde a ležel by přes nárys, přeskočí **vpravo**.
Nárys pak ukáže díry v čele i v plášti tak, jak při tomto natočení dílu
leží — díra v plášti mířící k nám / od nás jako kružnice na ose; v bokorysu
je natočení vidět jako průměr s trojúhelníkem „C… nahoře". Značka díry
v plášti (osa) zůstává nahoře. Natočení se uloží s výkresem.
**Díry v nárysu:** díry všech čel se v nárysu kreslí jako na výkresu —
**tenkou čárkovanou čarou** (skrytá hrana) v materiálu, kterým díra vede:
od prvního materiálu za rovinou čela (stojí-li posuvník před přírubou, díra
začne až na přírubě) — *Skrz* po místo, kde z materiálu vyjde (bez
přesahu; díra bez hloubky je průchozí), *Do hloubky* / *Do Z* (měřeno od
roviny čela) po dno se špičkou vrtáku 118°; osa díry čerchovaně. Výška díry
v nárysu = její svislá poloha v bokorysu (karusel: vodorovná). Díry pod osou
leží ve spodní polovině nárysu: **◎ Do čela** proto na soustruhu zapne
**☰ Nastavení → ⇋ Zrcadlit kolem osy** a značka řezu i lišta čela se
posunou pod spodní polovinu.

**⇋ Zrcadlit kolem osy** (☰ Nastavení) dokreslí nárys pod osu jako
technologický výkres — hotová kontura i polotovar dokola, **plnou čarou**
jako originál (jen zobrazení, objekty nevznikají; kresba čel se nezrcadlí).
Hrany a přechody (osazení, sražení, zápich, konec polotovaru) se spojí
**přes osu**: viditelná hrana čarou obrysu, zakrytá (např. hrana vývrtu
uvnitř dílu) tenkou čárkovanou, tečný přechod zaoblení se nekreslí (ISO 128).
Jen soustruh (zrcadlí se kolem y = 0). **SNAP** chytá i dokreslenou spodní
polovinu, hrany přes osu a čáry děr v nárysu (rohy, hrany, osu díry) —
jde od nich kótovat i kreslit dál.
Kresby čel se ukládají s projektem; do CAM ani CNC kódu profilu nejdou —
načtou se zvlášť:

**🛠 Operace** otevře editor:
- **📥 Z CAD** — načte díry a drážky z bokorysu (souřadnice vůči středu
  čela): kružnice stejného Ø = jedna operace (pravidelně rozmístěné se
  poznají jako roztečná kružnice), úsečka = drážka. Díry z ◎ Rozmístění
  děr nesou hloubku (skrz / hloubka / do Z) — operace ji dostane a díry
  stejného Ø s jinou hloubkou jsou zvlášť (např. „Díry Ø10 skrz"). Opakované načtení
  nahradí jen operace dřív načtené z CAD (značka 📐) a převezme jim
  hloubku, nástroj i otáčky; ručně přidané zůstanou. **Druh** u operace
  přepne vrtání ↔ frézování (např. kružnice jako kruhová kapsa).
  **Při otevření CAM se díry a drážky z bokorysu přenesou samy** (stejně
  jako 📥 Z CAD, hláška řekne kolik) — tlačítko je potřeba jen po změně
  výkresu s otevřeným CAM. Stojí-li čelo (posuvník) ve vzduchu před
  přírubou, díra začne vrtat na **prvním materiálu** pod ní (např.
  „Díry Ø7 skrz · Z280 ◀" — Z čela 280, hloubka od něj); hloubka *Do
  hloubky* / *Do Z* drží stejný konec díry. **Drážka** (úsečka) se stejně
  frézuje od prvního materiálu pod svou osou („Drážka 1 · Z280 ◀"). Změní-li
  se v CAD hloubka díry, přepíše se i název operace (ručně přejmenovaná
  operace si název nechá).
- **Řez s dírami** — jsou-li operace poháněných nástrojů, řez vlevo má
  i **spodní polovinu** (kontura a polotovar zrcadlené přes osu) a díry
  do čela leží ve výšce jako v nárysu CAD (svislá poloha v pohledu na
  čelo: C 0° a 180° **na ose Z**, C 90° nahoře, C 270° dole); díry do
  pláště se sklopí od pláště — C 0°…180° nad osu, 180°…360° pod osu.
  Na **karuselu** leží rovina řezu v pohledu na čelo vodorovně (jako nárys
  CAD): C 0° = +X, C 90° a 270° na ose, C 180° na druhé straně.
- **Polotovar v pohledu na čelo** jako v bokorysu CAD: čerchovaně se
  dvěma tečkami v rovině řezu i větší polotovar za ní (ve směru pohledu).
- **➕ Vrtání** — do čela (osa Z) nebo do pláště (osa X); rozmístění po
  roztečné kružnici (Ø, počet, počáteční úhel) nebo seznam bodů (řádek
  „úhel; poloměr", u pláště „úhel; Z"). Ø díry, hloubka, krok vrtání
  (0 = naráz), prodleva, nástroj, otáčky, posuv v mm/min.
- **➕ Frézování** — kruhová kapsa na pozicích vzoru nebo přímá drážka z X1/Y1
  do X2/Y2 (šířka = Ø frézy), krok do hloubky. Frézuje se jen na čele.
- **Výstup NC** (všechno níž až po *Jak ověřit na stroji*) se nastavuje jen
  v pravém panelu **⚙ Parametry → Obrábění → Vrtání** — rozbalovací blok
  *Výstup NC (…)* pod seznamem děr. Pod pohledem na čelo je jen souhrn
  a tlačítko **⚙ Parametry → Vrtání**, které blok otevře.
- **Polohování / interpolace** (přepínač NC výstupu): **SPOS** (vřeteno se
  natočí na úhel díry, vrtá se v poloze nástroje), **Osa C** (C = úhel) nebo
  **TRANSMIT** (Sinumerik kartézsky X/Y, Fanuc polární interpolace G12.1).
  Frézování mimo osu bez TRANSMIT se rozloží na krátké G1 v X + C a **posuv
  F se přepočítá pro každý úsek** tak, aby břit jel zadanou rychlostí:
  řídicí systém v pohybu X + C počítá stupně osy C jako milimetry (na R100
  je ale 1° = 1,75 mm — bez přepočtu by fréza jela 1,75× rychleji).
  Sinumerik k tomu dostane `FGROUP(X, Z, C)` (na konci `FGROUP()`).
  Ověřte na stroji (poznámka je i v programu).
  **Vrtací cykly** zap = CYCLE82/83 (Fanuc G83/G87), vyp = rozepsané G0/G1.
  Heidenhain vždy rozepsané pohyby.
- **M-kódy stroje** (osa C zap/vyp, start/stop poháněného nástroje, adresa
  otáček) se liší stroj od stroje — výchozí hodnoty jsou jen příklad,
  **ověřte je v příručce stroje**; prázdné pole = výchozí hodnota. Sinumerik:
  poháněný nástroj je vřeteno č. **n** (výchozí 2 → `M2=3`, `M2=5`, `S2=…`),
  osa C = `M70` (SPOS ji nepotřebuje, TRANSMIT i „Osa C" ano), na konci
  `SPCOF`. Fanuc a Heidenhain nemají společné M-kódy osy C — doplňte z příručky.
- **Jméno osy C** (C, C1, C2…) a **kalibrace úhlu**: *Směr úhlu* (+/−) a
  *Posun nuly* [°] — úhel v NC = posun + směr · úhel z bokorysu. Platí pro
  SPOS, osu C, TRANSMIT i Fanuc; zrcadlený směr obrací i smysl oblouků.
- **Jak ověřit na stroji (nasucho)** — návod je přímo v panelu: (1) M-kódy
  každý zvlášť v MDA, (2) `SPOS=0` → díra č. 1 má stát u nástroje (+X),
  (3) `SPOS=90` → díl se má otočit tak, aby díra z bokorysu C90° (nahoře)
  přišla k nástroji, jinak zvolte směr −, (4) první díru zkontrolujte v SBL
  s nástrojem mimo řez.
- **🔩 Vyvrtat** (v hlavičce pohledu na čelo i v záložce Vrtání) = totéž
  jako klik na záložku **Vrtání** (vrták, případně nová operace — viz
  *Díry z výkresu* níž) a pak ▶ simulace.
- **📝 Zapsat do programu** (ruční cesta) vloží blok mezi komentáře `>>> /
  <<< POHANENE NASTROJE` před konec programu soustružení (M30) jako ruční
  úpravu. Dokud blok v programu je, každá úprava operací ho přepíše sama; po
  🔄 Dráhy ho zapište znovu. Běžně ho není potřeba — vrtání je samostatná
  operace Vrtání, kterou generuje 🔄 Dráhy. **🗑 Z programu** blok odebere. Po přepnutí řídicího systému hlásí stav
  bloku „pro jiný systém" — stačí znovu 📝 Zapsat.

Lišta nad G-kódem má na mobilu **dva řádky** (🔄 Dráhy, ✂ Úseky, ➕ Ope.,
🔧 Editor / ↺ Reset, 📐 Kreslit, 💾 Uložit, 📂 Načíst) a vpravo přes oba
vysoké **⚙ Nast.**, které otevírá pravý panel; od zbytku je oddělená
tlustší čarou.

**Barvy varování při simulaci** (obojí se hlídá **vždy**, nedá se to vypnout —
vybarvená oblast navíc **zůstane** i po odjetí nástroje, ať je vidět, že se to
stalo):

| Barva | Význam |
|-------|--------|
| 🟠 oranžová | **držák se vnořil do materiálu** – projel polotovarem/obrobkem tam, kde má řezat jen destička |
| 🔴 červená (uvnitř dílu) | **nůž zajel do hotové kontury** – simulace odebrala materiál pod hotovým tvarem, díl by byl zmetek |
| 🔴 červená (u okraje polotovaru) | držák vjel do **pásu k offsetové čáře** – na nadměrném odlitku by narazil |

Červené zajetí do kontury se počítá ze **stejného modelu, jaký kreslí úběr**:
vybarví se přesně ta část dílu, kterou simulace ubrala. Dotyk kontury (třeba
dokončovací průchod, který po ní jede) se nepočítá — teprve řez hlubší než
0,05 mm.

**Rychlost přehrávání = rychlost stroje.** Při **1×** jede simulace přesně
tak rychle, jak by to jelo na stroji: rychloposuvem tam, kde je `G0`, a
řezným posuvem tam, kde se obrábí. Posuv se počítá z **Posuvu (F)**
[mm/ot] a otáček v tom průměru, kde nástroj právě je (`n = Vc·1000/π⌀`,
shora omezeno **Max. otáčky (LIMS)**) — v malém průměru u osy je tedy
posuv v mm/min menší, přesně jako na stroji. Nad plátnem se během
přehrávání ukazuje **ubíhající čas programu** (stopky) a k němu **aktuální
otáčky a posuv**, pod tím pak celkový **odhad času programu ⏱**. Rychlost rychloposuvu se nastavuje v
**Parametry → Rychloposuv (G0)** (výchozí 6000 mm/min; do G-kódu se
nezapisuje, `G0` rychlost neuvádí — slouží pro odhad času a simulaci).
Tlačítky **−/+** u rychlosti se dá přehrávání zrychlit až 64× (dlouhý
program nemusíš sledovat v reálném čase).

### 3a. Kdy se přepíše program (🔄 Dráhy, ● a 🔒)
V simulátoru jsou vidět **dvě dráhy najednou** a je dobré vědět, která je
která:

- **Náhled na plátně** (šrafování průchodů, offsetové čáry) se překreslí po
  **každé** změně v panelu — hned vidíš, co nastavení udělá.
- **Program v editoru** (G-kód, který se exportuje, přehrává v simulaci a
  kontroluje na kolize) se **sám nepřepočítává**. Vygeneruje ho tlačítko
  **🔄 Dráhy**.

Změna nastavení proto program NEPŘEPÍŠE — jen se u tlačítka rozsvítí
**● (dráhy neaktuální)**: náhled už ukazuje něco jiného, než co je
v programu. Klikni na **🔄 Dráhy** a dráhy se vygenerují.

Jakmile do programu **ručně sáhneš** (píšeš do editoru, vrátíš ho z CAM
Editoru, táhneš uzel dráhy, použiješ Prodl/Ořez), objeví se **🔒**. Takový
program už automatika nepřepíše vůbec a **🔄 Dráhy** se před přepsáním
zeptá. Zámek se ukládá spolu s programem, takže platí i po restartu appky
a po cestě přes CAD.

Výjimka, kde se program přegeneruje sám: **závit** a **upichnutí**. Ty
program celý nahrazují svým cyklem a nemají vlastní náhled — bez
přegenerování by po jejich zapnutí nebylo na plátně vidět nic. I tady ale
platí zámek: je‑li v programu ruční úprava, cyklus se nevygeneruje sám a
počká na **🔄 Dráhy**.

**„Jen dokončovací operace" potřebuje polotovar PO hrubování.** Počítá s tím,
že díl už někdo vyhrubil — kde na dráze stojí víc materiálu než hloubka třísky
(ap), se dokončovací úsek zahodí, protože by ho nůž bral naráz. Nad syrovým
odlitkem tak vypadnou úseky všechny a vznikne program, který nic neobrobí;
panel ⚠ to hlásí větou **„Program NEOBSAHUJE ŽÁDNÝ ŘEZNÝ POHYB"**. Řešení:
nastav polotovar na tvar po hrubování, nebo použij **➕ Operace** (další část
si obrobený polotovar spočítá sama).

**Dokončení nezačíná ve zbytku.** Kde hrubování nechalo víc než přídavek
(typicky klín u stěny, kam se nevešel držák), dokončovací nůž se do něj na
začátku řetězu nezanoří kolmo. Začátek se posune po kontuře tam, kde zůstal
jen přídavek, a najede se odtud rampou; oblouk se objede celý, nebo vůbec.
Vynechaný kus hlásí panel ⚠ větou **„Dokončování: … řetěz(ů) začíná dál"**.

**Vnější / vnitřní obrábění.** Pod **Zleva / Zprava** je přepínač
**◯ Vnější / ◎ Vnitřní** — říká, kde se obrábí, a patří k záložce operace:
**Hrub. + ◎ Vnitřní** = vyvrtávání díry vyvrtávací tyčí (dřív samostatná
záložka Vyvrt.; tyč a předvrtání se vyberou samy, viz *Vyvrtávání* níž),
**Hot. + ◎ Vnitřní** = jen dokončení stěny díry (viz níž),
**Upich + ◎ Vnitřní** = zápich v díře (viz níž),
**Upich + ⊚ Čelní** = čelní (axiální) zápich do čela, např. pro O-kroužek (viz níž),
**Závit + ◎ Vnitřní** = vnitřní závit (destička IR v tyči). Přepínač čte
přímo nastavení operace, takže ukazuje vždy to, co program opravdu dělá
(i závit načtený z výkresu jako vnitřní). **◯ Vnější** vyvrtávání vypne
a vrátí naposledy použitý vnější nůž (u Upich upichovák). U **Vrtání**
a **Frézování** přepínač nemá smysl.

**Jen dokončení v díře (Hot. + ◎ Vnitřní).** Jeden dokončovací průchod
po stěně díry (sražení, schody, dno) bez hrubování a bez předvrtání
vrtákem — jako vnější Hot., jen v zrcadle (pravidlo 13). Počítá s dírou
**vyhrubovanou předchozí operací s přídavky**: stěna je o Ph + Přídavek X
a dno o Ph + Přídavek Z menší než hotový obrys. Dokončovací tyč se musí
vejít do nejužšího místa vyhrubované díry (ne do předvrtání), jinak se
dráha nevydá a ⚠ to nahlásí. Typický postup: část 1 Hrub. + ◎ Vnitřní,
část 2 Hot. + ◎ Vnitřní s jemnější tyčí. Pole díry (tvar, ⌀, délka) jsou
stejná jako u vyvrtávání.

**Zápich v díře (Upich + ◎ Vnitřní).** Zápich **ven** od stěny díry
vnitřní zapichovací tyčí (📚 katalog → Vnitřní (do díry) → vnitřní
zapichovací; přepnutím na ◎ se vybere sama — ze 🔧 Zásobníku, jinak
nejtlustší tyč z katalogu, která se do díry vejde). Pravidlo 13: vnější
Upich v zrcadle.

1. **✂️ Ukázat bod** → klik na **bok zápichu u ústí díry** (Z bok u ústí).
2. **Šířka zápichu** vede od boku hlouběji do díry; 0 = šířka destičky
   (jeden zápich). Širší zápich = víc zápichů vedle sebe s krokem nejvýš
   0,8 × šířka destičky.
3. **Dno X** = poloměr vnější hrany destičky na dně (za stěnou díry).
   Hloubka zápichu smí být nejvýš **dosah** destičky v tyči (čip na kartě)
   **minus Vůle X** — polotovar (i stěna díry) končí až na offsetové čáře,
   tyč přes ni nesmí. Tyč ⌀16 s dosahem 2,5 tak s Vůlí X 1 zvládne 1,5 mm;
   u už obrobené díry stačí menší Vůle X (např. 0,3 → 2,2 mm).
4. **⌀ díry** 0 = automaticky: díra v polotovaru části (v programu po
   částech díl obrobený předchozími částmi — skutečná díra i vybrání),
   u díry z výkresu ✏ její tvar, jinak ⌀ z vyvrtávání / předvrtání.

**Dočištění vybrání po vyvrtávání.** Vybrání ve stěně díry (schod ven →
rovné dno → schod zpět) vyvrtávání hrubuje jen tam, kam destička po mezní
čáře dosáhne — v rozích u svislých stěn zůstane materiál. Dočistí ho další
část programu: Upich + ◎ Vnitřní → **✏ Z výkresu** nabídne vybrání jako
zápich a zapichovací tyč ho vyřeže celé (zůstanou jen rádiusy rohů
destičky).

**Zápich z výkresu.** Je-li zápich nakreslený ve stěně díry (samostatný
řetěz díry i díra napojená na čelo — schod ven, rovné dno, schod zpět),
ukáže se nad poli řádek **✏ Z výkresu** s tlačítkem pro každý zápich
(Z boku u ústí · šířka · ⌀ dna). Klik vyplní Z, šířku i dno a vybere
zapichovací tyč; tlačítko vyplněného zápichu svítí zeleně. Na polotovaru
se zápich ukáže čárkovaně (obrys zápichu a stěna díry k němu), stejně
jako díra u vrtání a vyvrtávání; simulace bere polotovar ještě bez
nakresleného zápichu.

Boky nechají Přídavek Z + Přídavek na hotovo, dno Přídavek na hotovo.
S **Dokončovací operací** jede tyč po prvním boku na dno, po dně ke
druhému boku a po něm zpátky ke stěně. Plynulý zápich / peckování jako
u upichu (výjezdy jen ke stěně díry). Do díry i ven jede tyč osou díry
(před ústí → k ose → na Z), nikdy šikmo přes stěnu. Když se tyč do díry
nevejde nebo zápich přesáhne dosah, dráha se nevydá a pod poli i v ⚠ je
důvod.

**Čelní zápich (Upich + ⊚ Čelní, pravidlo 19).** Mezikruží ⌀d1–⌀d2 do
čela dílu čelním zapichovacím nožem (📚 katalog → **Čelní zápichy**:
destička natočená do čela, zakřivená čepel pro **rozsah průměrů**
⌀Dmin–Dmax a **dosah** = největší hloubka). Nůž se vybere sám ze
🔧 Zásobníku, jinak se vhodný přidá z katalogu.
1. **✂️ Ukázat bod** → klik na **čelo** (Z čela), nebo **✏ Z výkresu** —
   zápich nakreslený nástrojem Zápich (typ Čelní) vyplní Z čela, ⌀d1, ⌀d2,
   hloubku i sražení.
2. **⌀d1 / ⌀d2** = vnitřní / vnější stěna, **Hloubka** od čela (nejvýš
   dosah čepele). Zápich musí ležet v rozsahu čepele a být aspoň tak
   široký jako destička.
3. Osové zápichy vedle sebe od vnitřní stěny ven s krokem nejvýš 0,8 ×
   šířka destičky; stěny nechají Přídavek X + Přídavek na hotovo, dno
   Přídavek na hotovo. **Dokončovací operace** jede vnitřní stěna → dno →
   vnější stěna (se Sražením i sražení hran).
4. Pohyb: před čelo (vůle + rádius), radiálně nad zápich, osově do čela,
   zpět před čelo. Na polotovaru se zápich ukáže čárkovaně.

**Vnější zápich libovolné šířky (Upich + ◯ Vnější, pravidlo 17).** Pole
**Šířka zápichu** u upichu: 0 = upichnutí / jeden zápich šířkou destičky
jako dřív. Širší zápich se dělá zápichy vedle sebe (krok nejvýš 0,8 ×
šířka destičky) od **Z upich** — boku na straně sklíčidla — k obráběcí
straně (zprava doprava, zleva doleva), na **Dojezd X**. Boky nechají
Přídavek Z + Přídavek na hotovo, dno Přídavek na hotovo; s Dokončovací
operací jede destička po prvním boku na dno, po dně ke druhému boku a po
něm nahoru. Umí to jen zapichovací destička (kulatá jen jeden zápich).
**Sražení** s (45°, vnější i v díře): hrubovací zápichy se nemění, sražení
udělá dokončení — sražení z povrchu na bok → bok → dno → druhý bok →
sražení zpět (i bez Přídavku na hotovo). 2s musí být menší než šířka a s
menší než hloubka; bez Dokončovací operace se sražení neudělá (⚠).
Zápich nakreslený na obrysu dílu (schod dolů → rovné dno → schod nahoru)
nabídne řádek **✏ Z výkresu** nad poli upichu; klik vyplní Z upich (bok
u sklíčidla), šířku i Dojezd X.

**Vnitřní závit (Závit + ◎ Vnitřní)** jede do díry stejně: rychloposuvem
před ústí a čelo polotovaru (o vůli X + 1 mm a ještě o to, kam tyč SNR
sahá za špičku — destička IR je široká), k ose na odskok průchodů, teprve
pak na Z startu; po posledním průchodu zpět před ústí a teprve odtud do
bezpečné polohy. Leží-li náběh v díře užší než ⌀D (závit hlouběji
v hladké díře), ⚠ upozorní, že nůž v náběhu najede do stěny — před
závitem musí být vybrání aspoň ⌀D, nebo závit začni na ústí.
Dřív jel šikmo z bezpečné polohy na start a zpátky —
z konce závitu by tyč projela stěnou díry. Uložený program s vnitřním
závitem se přepočítá při další změně parametrů nebo přes 🔄 Dráhy.

**Simulace v díře.** U zápichu v díře a vnitřního závitu kreslí i počítá
simulace (úběr, ⛔ kolize, zajetí držáku) tyč tak, jak v díře leží —
ostřím ven, tyčí k ose — a polotovar s dírou (⌀ z vyvrtávání / předvrtání,
u závitu ⌀(D − 2H)), i když samostatná část programu díru ještě nemá.
Zajetí do kontury se u zápichu nehlídá (zápich na výkrese být nemusí).

**Vyložení tyče.** Leží-li špička hlouběji od ústí než 4 × ⌀ ocelové
tyče (vyvrtávání, zápich v díře, vnitřní závit), program se vydá, ale ⚠
upozorní na chvění — zvol tlustší nebo tvrdokovovou tyč, případně zmenši
posuv a záběr.

**Proč se negenerují hrubovací dráhy?** Pět nastavení hrubování přebíjí, a
každé sedí v jiné záložce: **Závit** (aktivní závitování), **Upich**
(naklikané upichnutí), **Vrtání / Frézování** (aktivní nástroj je vrták),
**Hrub. + ◎ Vnitřní** (aktivní vyvrtávání) a **Hot.** („jen dokončovací
operace"). Když je některé
z nich zapnuté, ukáže se v ostatních záložkách oranžové varování s tlačítkem
na jeho rychlé vypnutí (u vrtání **🔧 Jiný nůž** — vrták umí jen vrtat). Ukazuje se vždy jen ten režim, který program opravdu řídí —
mají mezi sebou pořadí: závit přebíjí upichnutí, upichnutí vrtání, vrtání
vyvrtávání a vyvrtávání „jen dokončení". Zapnutí závitu, upichu, vrtání nebo
vyvrtávání ostatní cykly vypne (program je vždy jen jeden cyklus) — vrtání
a vyvrtávání patří do dvou operací za sebou (➕ Operace).

**Záložka obrábění vybere nástroj své operace.** Klik na **Vrtání** přepne
nástroj na vrták, **Frézování** udělá z části frézování z výkresu (viz níž),
**Závit** na závitový nůž (a závitování zapne), **Upich** na
upichovák (kulatý nůž zůstane jen, když upichovák v zásobníku není) a **Hrub. / Hot.** z vrtání,
závitu či upichu zpět na soustružnický nůž (naposled použitý). Jedna část
programu = jedna operace: má-li část už program jiné operace (soustružení,
závit, upich…), Vrtání / Frézování / Závit / Upich se po potvrzení přidá jako **nová
část** na konec programu (➕ Operace, jmenuje se podle operace) — dosavadní
program se nepřepíše. Má-li operace už svou část, klik na záložku se na ni
jen přepne; Hrub./Hot. v části s vrtáním přepne na část se soustružením.
V náhledu *Celý program* se nejdřív přepne na část. Vyvrtávací tyč vybere
přepínač **◎ Vnitřní** (Hrub.). Dráhy každé části generuje jediné
**🔄 Dráhy** — „✂ Po úsecích" je vidět jen u soustružení.

**Díry z výkresu (záložka Vrtání nahoře).** Díry nakreslené v CAD do
bokorysu (nástroj Díra, Kr.pole) i do pláště v nárysu (nástroj Díra,
Lin.pole) se do CAM přenesou samy jako skupiny
(stejný Ø na roztečné kružnici = jedna skupina). Přepnutím na záložku
**Vrtání** se otevře ◎ pohled na čelo a nahoře v záložce je **Co vrtat**:
**Díry z výkresu** (poháněný vrták, kus se natáčí osou C) nebo **Středová
díra v ose** (revolverový vrták, vřeteno se točí). S dírami z výkresu je
program části Vrtání **vrtání vybraných děr** (blok poháněných nástrojů,
SPOS / osa C) — žádné dráhy hrubování ani díra v ose:
- **Výběr děr:** zaškrtávátko u skupiny, nebo **klepnutí na díru** v pohledu
  na čelo. Když se vrtá všechno, první klepnutí vybere *jen* tuhle skupinu
  (např. 6 stejných děr na rozteči), další klepnutí skupiny přidávají /
  ubírají; **Vybrat vše** vrátí všechny. Nevybrané díry jsou v pohledu
  ztlumené a nevrtají se (nejsou v kódu ani v simulaci).
- **Vrták se vybere sám:** ze 🔧 Zásobníku vrták na Ø díry (první v pořadí T),
  otáčky n = Vc·1000/(π·Ø) a posuv F = f·n z jeho Vc a f; záběr Q, prodleva,
  bezpečná vzdálenost a **tříska** (⇡ Vyjíždění × ↯ Lámání + Odskok) z polí
  záložky níž — jejich změna se do vybraných děr propíše hned. Lámání
  třísky: cyklus `CYCLE83 … VARI = 0`, rozepsaně jen odskok o *Odskok*
  a další záběr; Fanuc G83 / G87 volí lámání parametrem stroje (0i: 5101
  bit 2 RTR — poznámka v programu). Jde nastavit i u operace v 🛠 Operace
  (*Tříska mezi záběry*). Chybí-li vrták na Ø díry,
  **➕ Přidat vrták Ø… z 📚 do Zásobníku** (HSS 118°; Ø, který katalog nemá,
  např. 7, se postaví podle nejbližšího) — záložka Vrtání ho doplní sama.
  Co v 🛠 Operace přepíšete ručně (T, nástroj, otáčky, posuv), už se
  nepředvyplňuje. **Nástroj části** (⚙ Parametry → Nástroj nahoře i T
  v hlavičce programu) je vrták **první vybrané skupiny** — po doplnění
  vrtáku nebo změně výběru se přepne sám (dřív zůstal např. Ø20, i když
  díry vrtal T8 Ø10).
- **Zápis vrtání:** **Cyklus** (Sinumerik CYCLE82 / 83, Fanuc G83 / G87 —
  celé vrtání díry jedním řádkem) nebo **Rozepsaně G0 / G1 (ISO)** — každý
  pohyb zvlášť (R rovina, záběr, vyjetí pro odvod třísky, návrat 0,3 mm nad
  dno, prodleva, odjezd). Totéž jako *Vrtací cykly* ve Výstupu NC;
  Heidenhain jen rozepsaně.
- **Kód:** vygeneruje ho 🔄 Dráhy (po změně výběru děr se program části
  přegeneruje sám); **🔩 Vyvrtat vybrané** přepne na operaci Vrtání a pustí
  ▶ simulaci (po dojetí programu se díry vrtají v pohledu na čelo i v řezu).
- **Skrz materiálem:** díra „skrz" v CAD má výchozí *Hotová kontura* — vrtá
  jen přes hotový díl (vrtá se po soustružení). Má-li jít i přes polotovar,
  zvolte u díry v CAD *I polotovar* (operace pak má v názvu „vč. polotovaru").

**Frézování z výkresu (záložka Frézování).** Kapsy, drážky na čele
a drážky pro pero (CAD: ◎ bokorys, úsečka = drážka; drážka pro pero do
pláště v nárysu, nebo ◎ 🛠 Operace → ➕ Frézování) mají **vlastní záložku**
za Vrtáním — dřív byly v seznamu záložky Vrtání spolu s dírami. Nahoře je
**Co frézovat**: seznam frézovacích operací se zaškrtávátkem, frézou ze
🔧 Zásobníku (vybere se sama podle kapsy / drážky; chybějící nabídne
**➕ Přidat frézu z 📚**), tlačítka **✣ Frézovat vybrané** a **Vybrat vše**
a Výstup NC (osa C, M-kódy, kalibrace — sdílí ho s vrtáním).
- **Samostatná operace:** ✣ Frézovat (nebo klik na záložku, když je co
  frézovat) udělá z frézování **vlastní část programu** jen s frézami — díry
  v ní nejsou (vrtají se v části Vrtání) a část Vrtání zase nemá frézování.
  Je-li v části soustružení nebo vrtání, přidá se po potvrzení jako nová část;
  má-li frézování už svou část, klik na záložku se na ni přepne. Bez
  frézování z výkresu záložka jen ukáže, jak ho přidat (část nezaloží).
- **Pohled na čelo** v části Frézování ukazuje díry ztlumeně (nejsou v jejím
  programu) a klepnutí na díru jen poradí, že se vybírá v záložce Vrtání —
  a naopak. První klepnutí „jen tahle skupina" se týká jen operací téhož
  druhu (díry × frézování).
- Část nese vrták jako u vrtání (fréza aktivním nožem být nemůže); v
  🔧 Zásobníku proto musí být aspoň jeden vrták. Starší projekty, kde byla
  část Vrtání i s frézováním, zůstanou, dokud se v nich neklikne na Vrtání.

**Vrtání v ose (záložka Vrtání, pod sekcí děr).** Vrtací cyklus v ose (X0) vrtákem — nástroj
tvaru **⌀ vrták** (v Nástroj → Tvar destičky i ve 🔧 Zásobníku vedle ⬤ ◼ ▮ ▽).
Vrták má **⌀**, **vrcholový úhel σ** (HSS 118°, tvrdokov 140°) a **vyložení**
(od špičky ke sklíčidlu); jeho držák je **pouzdro v ose** za vyložením
(Tloušťka = ⌀ pouzdra, Délka = jeho délka). Výchozí vrták (T7 a přepnutí
tvaru na ⌀): HSS ⌀20, 118°, vyložení 145, redukční pouzdro MK2 ⌀40 × 80.
Další vrtáky (HSS / tvrdokov, ⌀3–30, i předvrtání pod závity) jsou
v 🧰 Knihovna → 📚 ISO katalog → **Vrtáky** — odtud jde vrták vrátit i po
smazání ze zásobníku.

**Vrtání určuje nástroj:** když je aktivní nástroj vrták, program je vždy
vrtací cyklus (vrták nesoustruží) — i když vrták vybereš ze zásobníku nebo
přepneš tvar na ⌀. S jiným nástrojem se vrtání vypne a hrubuje se.

**Záložka obrábění se přepne podle nástroje:** vrták → **Vrtání**, závitový
nůž → **Závit**, upichovák → **Upich**; soustružnický nůž vrátí z těchto
záložek na **Hrub.** (Hot. nechá). Platí pro tvar v panelu, výběr ze 🔧
Zásobníku i nůž z 🧰 Knihovny. Závit a upichnutí se pak zapnou v záložce
(potřebují závit / bod upichnutí), vrtání běží s vrtákem samo.

1. Záložka **Vrtání** → **Zapnout** vybere vrták ze zásobníku (první ⌀
   v pořadí T); když tam žádný není, hláška řekne, kde ho vzít. S vrtákem
   je místo tlačítka stav **✅ Aktivní** — vrtání vypneš výběrem jiného nože.
   Vrtání jako další operaci za hrubováním přidej přes **➕ Operace** (v části
   s hrubovacím nožem by vrták hrubování nahradil).
2. **Z čelo** (kde díra začíná; **prázdné = čelo dílu** — zprava nejvyšší Z
   kontury, zleva nejnižší) a **Hloubka** (od čela). Zaškrtnutá
   **Hloubka na plný ⌀** přidá délku špičky ⌀/2 / tan(σ/2) — dno je válcové
   v zadané hloubce; jinak se měří na špičku. Místo hloubky jde zadat **Dno Z**
   — hodnotu Z, do které se vrtá (prázdné = platí Hloubka; s „na plný ⌀" je to Z
   dna plného ⌀). Po vygenerování drah je ve výkrese **čárkovaně** vidět, co se
   odvrtá (válec + špička); šedý materiál kolem zůstává. U dílu nakresleného jako
   hotový kalíšek je materiál i dutina (vrtá se z plného).
3. **Odvod třísky:** **⇡ Vyjíždění** (jako G83 — po každém záběru Q
   z díry ven a rychloposuvem zpět až „Odskok" nad dno) nebo **↯ Lámání
   třísky** (jako G73 — jen odskok). **Záběr Q** 0 = celá díra na jeden zátah.
   Záběry se počítají od místa, kde vrták v ose **vjede do materiálu** —
   u neobrobeného odlitku před čelem dílu od odlitku, ne od čela.
4. **Bezp. vzdál.** = R rovina před čelem (odtud posuv, sem výjezdy). Když
   polotovar přesahuje (neobrobené čelo, odlitek), R rovina se posune ven za
   jeho vůli — rychloposuv do pásu před polotovarem nevjede.
5. **Prodleva (s)** na dně: Sinumerik `G4 F…`, Fanuc `G04 P…` (ms),
   Heidenhain `G04 F…`.

Otáčky jsou konstantní **G97 S = Vc·1000 / (π·⌀)** (omezené LIMS) — v ose by
G96 vyhnal vřeteno na maximum; na konci se vrátí G96. Cyklus se píše
**rozepsaně** (G0/G1), ne jako CYCLE83/G83 — jede stejně na všech řídicích
systémech a simulace ho přehraje. Strana obrábění (**Zleva/Zprava**) určuje
směr: zprava se vrtá k −Z, zleva k +Z. Simulace díru odebere obrysem vrtáku;
když kontura dílu díru nemá, ukáže vrtání červeně jako zajetí do hotové
kontury. Když je díra pod čelem polotovaru hlubší než vyložení, panel ⚠ hlásí,
že do čela narazí pouzdro (a ⛔ ukáže kolizi držáku).

**Vyvrtávání (Hrub. + ◎ Vnitřní).** Podélné hrubování díry vyvrtávací tyčí
(🧰 Knihovna → 📚 ISO katalog → **Vnitřní (do díry)**). Podle **pravidla 13**
(docs/cam-pravidla.md) je vnitřní obrábění zrcadlo vnějšího v ose X: díra se
překlopí na hřídel, předvrtání na válcový polotovar, spočítá se obyčejné
vnější hrubování zprava (úseky, vrstvy po ap, hlídání držáku, vjezdy — všechna
pravidla 1–12) a řádky se překlopí zpátky. „Nahoru" je tu „k ose": odskok
a rychloposuvy jdou do volného předvrtání, ne do stěny.

1. Záložka **Hrub.** → **◎ Vnitřní** (pod Zleva / Zprava). Předvrtání se převezme z **Vrtání**
   (⌀ vrtáku ze 🔧 Zásobníku, hloubka na plný ⌀ bez špičky, Z čela) a ze
   zásobníku se vybere **nejtlustší vyvrtávací tyč, která se do předvrtání
   vejde** (Dmin). Tlačítko **↺ z Vrtání** předvrtání převezme znovu.
2. **Tvar díry:** **⌀ Válec** — Z čelo, ⌀ díry (hotový — na stěně zůstane
   Přídavek X) a Délka; nebo **✏ Z výkresu** — díra nakreslená v CAD (schody,
   sražení, rádiusy). Ve výkresu jde nakreslit dvěma způsoby:
   - **samostatně** — řetěz čar, který jedním koncem leží na čele dílu a celý
     vede uvnitř (pod vnějším obrysem k ose). Přenos do CAM ho pošle zvlášť
     (sekce DIRA) a nehlásí ho fialově jako „mimo profil";
   - **napojenou na čelo** (uzavřený řez) — čelo jde od vnějšího průměru dolů
     na průměr díry a pokračuje stěnou díry. CAM díru z kontury vyjme: vnější
     hrubování ji vynechá (dřív by jelo skrz stěnu dílu až k ose) a dostane ji
     vyvrtávání.

   Záložka ukáže, co ve výkresu našla (⌀ × délka, samostatně / napojená).
   Body díry uvnitř předvrtání (dno vrtané díry) se nevrtají.
   **Strana** se bere ze Zprava/Zleva jako u ostatního obrábění: zprava se
   vrtá od pravého čela k −Z, **zleva od levého čela k +Z** (druhé upnutí) —
   program zleva je přesné zrcadlo programu zprava. Díru z výkresu pozná
   u pravého i levého čela.
3. **Předvrtat vrtákem (z plného)** — když je díra v polotovaru plná,
   zapne se samo při **✅ Aktivní**. Program pak nejdřív vrtá **vrtákem** a po
   výměně nástroje vyvrtá díru **tyčí** — jeden program, obě části
   v simulaci (během vrtání se kreslí vrták, pak tyč; úběr i ⛔ hlídání
   zvlášť pro každý nástroj).
   - **Vrták** se vybere sám: největší ze 🔧 Zásobníku, který nechá na stěně
     přídavek + 1 mm a dosáhne na dno; jde ho změnit v nabídce **Vrták**.
     Když v zásobníku žádný není, přidá se z 📚 katalogu (HSS 118°).
   - **Tyč** se vybere sama — nejtlustší, která se vejde do díry po vrtáku;
     když v zásobníku žádná není, přidá se z 📚 katalogu (95°, BCL).
   - **Hloubka vrtání:** špička skončí na **dně díry + Přídavek Z** (do dna
     nezajede). Plný ⌀ je proto o délku špičky výš a tyč z takového
     předvrtání vezme stěnu jen do hloubky plného ⌀ — níž by se tělem opřela
     o kužel po vrtáku. **Dno díry** (prstenec + kužel, u ⌀20 asi 6,5 mm)
     dobere třetí část programu (`DNO DIRY`) — téže tyčí ČELNĚ od osy ven,
     po tenkých vrstvách (nejvýš mezera mezi špičkou a tělesem tyče), až na
     přídavek Z. Funguje u dna k ose (rovné i s rádiusem v rohu); jinak ⚠
     napíše, co zůstává.

   Bez zaškrtnutí: **⌀ předvrtání** a **Hloubka předvrt.** se zadají ručně
   (aspoň délka díry — tyč nevrtá do plného). Záběr ap, posuv, Vc a přídavky
   sdílí s hrubováním.
4. **Dokončit stěnu díry** (výchozí vypnuto) — po hrubování jeden dokončovací
   průchod po stěně (sražení, schody, dno až k předvrtání) **týmž nástrojem**;
   dokončovací nůž vnějšího obrábění se do díry nepošle. Na stěně zůstane jen
   Přídavek na dokončení (Ph). Nájezd jde jako u vnějšího dokončení rampou pod
   úhlem zanoření před čelem (u PCLNR 5° → dlouhá rampa vzduchem); v rohu u
   schodu dokončení dobere schodiště po hrubování.

Program: nájezd v Z před čelo, radiálně do předvrtání (o Vůli X od stěny),
vrstvy od předvrtání ke stěně, poslední na dně (stěna − přídavek − rε),
odskok k ose, ven rychloposuvem; na konci radiálně v díře, ven v Z a na
bezpečnou polohu. **Tyč se musí vejít do díry** (pravidlo 13): ani zadní
strana tyče se nesmí dotknout protější stěny předvrtání — jinak se dráha
nevydá a panel ⚠ to nahlásí (třeba S20S do předvrtání ⌀20: Dmin 25).
Simulace počítá úběr, ⛔ kolize i zajetí do kontury ve stejném zrcadle jako
dráhy: předvrtání je prázdné, nůž je otočený k ose a čárkovaně je vidět obrys
díry (oranžově) a předvrtání (žlutě).

### 3b. Více operací na jednom kuse (➕ Operace)
Jeden díl se často obrábí na několik operací: nejdřív se vyhrubuje jedním
nožem, pak se jiným udělají drážky, zápich nebo závit. V liště nad G-kódem
je na to tlačítko **➕ Operace**.

1. Vygeneruj dráhy první operace (**🔄 Dráhy**) jako obvykle.
2. Klikni na **➕ Operace**. Dosavadní dráhy se uzavřou jako **Část 1** a
   zmizí z plátna. Zůstane kontura a **polotovar obrobený předchozí částí** —
   program si tedy pamatuje, co už se odebralo, a další operace na tom staví.
3. V pravém panelu (**⚙ Nast.**) si vyber jiný nůž a nastav parametry i
   **rozsah obrábění** (📏) jen na tu část dílu, kterou chceš dělat. *Tip: podržením tlačítka 📏
   se pravý panel otevře rovnou u nastavení rozsahů.*
4. Klikni **🔄 Dráhy** — vygeneruje se **další část** programu. Kroky 2–4
   opakuj, kolikrát potřebuješ.

**✂ Po úsecích** udělá kroky 2–4 automaticky pro podélné hrubování (kulatá,
polygon). Díl se rozdělí na úseky podle fialových čar (tam, kde čára zanoření
vyjede na offset polotovaru), úseky se seřadí od největšího průměru a každý
dostane vlastní část programu (**Úsek 1, 2, …**) s rozsahem 📐 na své hranice.
Polotovar každého úseku je to, co zbylo po předchozích úsecích — hlídání držáku
tak ví, kde je už obrobeno. Tvůj rozsah 📐 (je‑li zapnutý) se respektuje.
Nad každým úsekem je vidět **zbytek** („nedojeto" v mm², broskvově) a
červeně čárkovaně obrys polotovaru, který po programu zůstal. Kus materiálu,
který dráha oddělí a který visí nad dílem, se do dalšího polotovaru počítá
i s tím, co je pod ním (nezahazuje se).
**↺ Reset** zruší rozdělení na části (po „✂ Po úsecích“ i „➕ Operace“):
vrátí původní polotovar a rozsah, dráhy částí smaže (jde vzít zpět přes ↩ Zpět).

**V liště jsou vidět jen tlačítka, která teď jdou použít:**
- U programu z **✂ Po úsecích** je v náhledu **Celý program** vidět **buď
  ✂ Po úsecích, nebo 🔄 Dráhy** — podle hrubování nastaveného v panelu:
  podélně přegeneruje úseky od začátku **✂ Po úsecích**; čelně (to úseky
  nemá) je místo něj **🔄 Dráhy**, které po potvrzení **nahradí části jedním
  programem** s nastavením z panelu nad původním polotovarem a rozsahem
  (jako ↺ Reset + 🔄 Dráhy, jde vzít zpět přes ↩ Zpět).
- V **části** (klik na chip) **🔄 Dráhy** přegeneruje jen tu část. U částí
  z **➕ Operace** se v náhledu Celý program negeneruje — přepni na část.
- **✂ Po úsecích** je vidět jen tam, kde díl má úseky (fialové čáry) v rozsahu
  obrábění — tedy u podélného hrubování kulatou/polygonem, **nikdy čelně**.
- **↺ Reset** je vidět jen tehdy, když má program části.

Generování drah trvá na složitém dílu i několik sekund. Po dobu výpočtu je přes
okno simulátoru **⏳ přesýpací hodiny** s popisem, co se děje (u „Po úsecích“
i který úsek zrovna běží); do té doby okno nepřijímá kliknutí.

Pod lištou tlačítek se objeví **lišta částí**:
- **Chip s číslem a nožem** – klik přepne na tu část (načte se její nůž,
  parametry, rozsahy i polotovar), **dvojklik** ji přejmenuje.
- **✕** na chipu – smaže **celou část** programu (jde vzít zpět přes ↩ Zpět).
- **Část / Celý program** – přepínač náhledu. „Celý program" ukáže složený
  program všech operací od původního polotovaru (jen ke čtení) a odsimuluje
  ho celý; „Část" se vrátí k editaci aktivní operace.
- **⛓ Spojit** – vloží všechny části do fronty **SPOJ G-KÓD** v CAM Editoru
  a otevře tam spojený program (tam se dá část ještě upravit nebo z fronty
  vyhodit).
- **Na mobilu** jsou místo chipů **rozbalovací pole** (výběr = přepnutí na
  část) a vedle něj **✎** (přejmenovat) a **✕** (smazat) aktivní části —
  celá lišta se vejde do jednoho řádku. Na výšku zabírá spodní panel
  (přehrávač, tlačítka a G-kód) polovinu displeje.

Poznámky:
- Rozdělení na části **přežije obnovení stránky** i cestu přes CAD. Když se
  mezitím změní kontura, části zůstanou a jen se objeví upozornění, že
  polotovary nemusí sedět — přegeneruj dráhy (🔄 Dráhy).
- Máš‑li na výkrese **vybarvené** oblasti (CAD nástroj Vybarvit), zmizí i tam,
  kde materiál odebraly předchozí operace — nejen po dobu přehrávání simulace.
- Obrobený polotovar se prokládá **oblouky**, ne stovkami úseček, takže
  zaoblení zůstanou zaoblení a výpočet dalších drah je rychlý.

Ven jde vždy **celý program**: 💾 Uložit, stažení `.MPF`, kopie do schránky
i 🔧 Editor pracují se všemi částmi za sebou. Hlavička se u dalších částí
vypisuje jen v tom, co se opravdu mění (nůž, otáčky, posuv…), `M30` zůstane
jen na konci a **při výměně nože** se vypíše nájezd do referenčního bodu
(`G75`/`G28`) i vypnutí a znovuzapnutí vřetena a chlazení.

### 4. CNC Editor
- Po vygenerování dráhy se otevře CNC editor
- Zobrazí se G-kód s barevným zvýrazněním
- Mohouš upravit kód ručně
- G90/G91 přepínač (absolutní/přírůstkové)
- Přečíslování N-bloků
- Validace kódu v reálném čase

**CNC Editor – kreslení** (✏️ ve spodní liště plátna mezi VK a měřením, na počítači
**✏️ Editor** ve stavové liště; v Kalkulačkách už není): při otevření se zavře pravý panel.
Na telefonu se systémová klávesnice sama neotvírá (ani klepnutím do kódu) –
zapíná/vypíná ji tlačítko **⌨** dole. Horní lišta: **☰** vlevo soubory,
**⌒** sražení/zaoblení → dráha, **G90/G91** přepočet celého kódu, 🔍, 🔢,
✓ validace, **A− / A+** velikost textu, 🔄 vykreslit, **☰** vpravo nástroje
editoru (nový, stáhnout, import/export, přečíslování, hlavička, nastavení
validace…). Spodní **G90 / G91** jen zapíše značku na začátek řádku. Šipky
**◀ ▶** v oranžové liště vrací/opakují úpravy i po zavření editoru a vykreslení
(30 kroků). Validace navíc hlásí souřadnice bez G po G0 („chybí G1?"), oblouk
bez R/I,K a osu dvakrát v bloku – každé pravidlo jde vypnout v Nastavení validace.

**Automatické G0 / G1 po Enter (CNC Editor – kreslení):** stačí psát jen
souřadnice. Po stisku **Enter** (nebo tlačítka **↵**) se řádek nad kurzorem
dokončí: **první** řádek se souřadnicemi bez G dostane **G0** (najetí na
start), **další** řádky bez G dostanou **G1** (přímka). `X0 Z346` → `G0 X0 Z346`,
potom `X10 Z-5` → `G1 X10 Z-5`. Řádek, který už nějaké G má (G0–G3, G4, G28,
G33…), řádek s `R`/`I`/`K` (oblouk se nehádá), řádky bez souřadnic, komentáře
a Sinumerik příkazy (`IF`, `DEF`, `R1=…`) se nemění. Když už platí G1
(předchozí pohyb byl G1), zůstane holý řádek `Z-20` beze změny – je to platný
modální zápis. Enter uprostřed řádku nic nedopisuje a **Ctrl+Z** vrátí zalomení
i doplněné G jedním krokem. Jen CNC Editor – CAM Editor (úprava vygenerovaných
programů) to nedělá.

**Údaje a pomůcky pro zjišťování rozměrů (CNC Editor – kreslení):**
- **Řádek s údaji** nad klávesnicí ukazuje k řádku s kurzorem: u úsečky délku L,
  úhel od osy +Z, ΔX/ΔZ a konec; u oblouku R, absolutní střed, I/K, úhel výseče
  a délku oblouku. **`I` je vždy poloměr** (posun středu v X od začátku oblouku),
  i když je X zobrazené v průměru – stejně jako na stroji (Fanuc, Sinumerik). Tlačítka **∠** (úsečka úhlem), **📋ř** (kopírovat řádek)
  a **📋XZ** (kopírovat koncový bod).
- **∠ Úsečka úhlem:** úhel (od osy +Z proti směru hodin, 180° = směr −Z) a k tomu
  délka L, nebo cílové X, nebo cílové Z → vloží `G1 X… Z…` za řádek s kurzorem.
  Tlačítko **✛** za polem úhlu otevře mřížku osmi šipek (jako rychlá volba úhlu
  v číselném zadání): šipka ukazuje směr **na obrazovce** a úhel se dopočte podle typu
  stroje a zrcadlení os (u soustruhu → = 0°, ↑ = 90°; u karuselu ↑ = 0°, → = 90°).
  V režimu Od předchozí / Tečně se ✛ schová (tam se zadává odklon, ne směr).
  Za předchozí **úsečkou** (G1) jde úhel zadat i **Od předchozí** (odklon vlevo ↺ /
  vpravo ↻ od jejího směru). Za **obloukem** (G2/G3) se nabízí jen **Polární**
  a **⟿ Tečně** – odklon 0°, úsečka plynule navazuje na konec oblouku ve směru
  tečny (úhel od oblouku nedává smysl). Po G0, na prvním řádku a před prvním
  pohybem nejsou ani jedno (není směr, ke kterému by se vztahovaly).
- **⌒ Oblouk** (tlačítko v rychlé liště místo kláves G2, G3 a T): dialog vloží řádek
  `G2/G3` za řádek s kurzorem. Volíš **↻ G2 / ↺ G3** a **Netečně / ⟿ Tečně**
  (Tečně jen za G1 nebo obloukem, stejně jako u úsečky úhlem). Zadáváš:
  - netečně: **konec X+Z a R** (zaškrtávátko „velký oblouk" zapíše záporné R),
    nebo **konec X+Z a úhel rozevření** (R se dopočte);
  - tečně: **konec X+Z** (smysl G2/G3 určí napojení), nebo **R + X či Z**, nebo
    **R + úhel rozevření** (konec se dopočte); do kódu se zapíše `T`.

  Pod poli je živý výsledek (`→ G3 X10 Z-30 T`) a údaje R, úhel a konec; chybu
  (třeba R menší než půlka tětivy, oblouk „nedosáhne") ohlásí hned. V G91 se zapisují
  přírůstky, v průměrovém režimu je X průměr. V prvním řádku rychlé lišty je vedle
  **R**, **I**, **K** a **⌒ oblouk** i klávesa **G**: otevře číselník se seznamem G-kódů, takže jde
  ručně napsat třeba G2/G3 při úpravě stávajícího oblouku nebo G4, G33 apod.
- **📐 Náhled kontury** (pravý panel): malý náhled nad kódem, řádek s kurzorem
  žlutě. Po zavření editoru se objekt z řádku s kurzorem označí na plátně.
- **Průsečíky na plátně** (pravý panel): klepnutím se souřadnice vloží na kurzor.
- **🎯 Bod z plátna** chytá koncové body a průsečíky vždy (i s vypnutým
  přichytáváním) – vkládá přesné souřadnice.
- **G90/G91 v horní liště s označeným textem** převede jen vybrané řádky (za
  výběrem vrátí původní režim); bez výběru celý kód.
- Validace kreslení navíc: oblouk, který nejde sestrojit (malé R, nesouhlasné
  I/K), G0 uprostřed kontury, X pod osou, volitelně netečný přechod.
- Kód vkládaný klávesnicí s kurzorem v poznámce se vloží před středník.

### 5. Export
- **Stáhnout** – ulož `.MPF` soubor
- **Kopírovat** – zkopíruj do schránky
- **Export CNC kódu** – zpět do panelu

### Geometrie nástroje (destička + držák)
Aby se geometrie nástroje při generování drah brala v úvahu, musí být
zaškrtnuté **Hlídat geometrii (destička + držák)** (pod záložkami Hrub./Hot.,
u všech tvarů plátku; výchozí **zapnuto**). Bez něj dokončování nehlídá
držák — zprava by sjelo i po levém čele k ose skrz díl.

V záložce **Parametry → Nástroj** otevři **🔧 Zásobník** a v jeho hlavičce
**🔪 Geometrie** — modal s živým 2D
náhledem destičky a držáku. Pod náhledem je jeden přepínač
**🔩 Destička | 🗜 Držák** (klik kamkoli přepne, svítí aktivní půlka):
- Hlavička: **↩ / ↪** — vrátí/znovu provede poslední změnu (sdílí historii
  s hlavním CAM Simulátorem); **☰** — akce s celým nožem: 🔧 Zásobník,
  💾 Uložit nůž (zeptá se: zásobník / knihovna), 💾 Uložit do PC, 📂 Načíst
  z PC; **✕** zavře okno (také Esc nebo klik mimo okno).
- **Destička:** v jednom řádku **VBD** kód a **🔩 Dekodér**, pod tím tvar
  plátku a pole (Délka hrany, natočeni PU s ✛, Vrch. úhel, Rádius) a řádek
  **⇄ Přehodit stranu** + **↻ Natočení destičky**.
- **Držák:** vedle přepínače **📐 Kreslit na CAD**, pod tím **✏️ Kreslit
  obrys**, **🗑 Smazat obrys** (jen když obrys existuje) a **🔧 Upravit
  obdélník** — ten teprve ukáže **Editor obdélníku** (🔻 Srazit roh,
  🗑 Vymazat). Pod nimi Rozměry (l1, tloušťka), **⇄ Ruka**, **↻ Natočení
  nože** a **▸ Tvar** (výpis obrysu bod po bodu).
- **Náhled lze přiblížit/oddálit** kolečkem myši nebo tlačítky **＋ / － / ⟲**
  (reset), a posunout tažením. Popisky ε (vrcholový úhel) a natočení přímo v
  náhledu jsou klikací — klik přepne na pod-záložku Destička a rovnou zaostří
  dané pole k úpravě.
- Dlouhý dřík držáku (velké l1) se v náhledu kreslí zkrácený se standardní
  značkou přerušení (klikatý zlom), ať nezabírá většinu výšky náhledu —
  skutečná hodnota l1 zůstává beze změny v poli i v popisce.
- **Destička (VBD)**: tvar (kulatá/čtyřstranná/zápichová/závitová), délka
  hrany, polární úhel, vrcholový úhel (ε) a rádius (R); dekódování VBD kódu.
  **Při přepnutí tvaru se rádius přednastaví:** kulatá R10, čtyřstranná
  R1,2, zápichová (upichovák) R0,5 — i ve slotu zásobníku. Spolu s ním
  i **posuv F a řezná rychlost Vc**: kulatá F0,15 / Vc180, čtyřstranná
  F0,25 / Vc200, upichovák F0,08 / Vc120, závitová jen Vc100 (posuv
  závitu je stoupání; hloubka třísky ap zůstává). Jinou hodnotu stačí přepsat v poli; VBD dekodér
  dosadí R z kódu (u kulaté polovinu průměru z velikosti: RCMT 1204M0 → R6).
  **Hrubování (Podélně / Čelně) si každý plátek pamatuje:** kulatá podélně →
  upichovák (ten umí jen čelně) → zpět na kulatou vrátí podélně.
  U čtyřstranné (polygon) destičky se úhel ε dá otevřít na dvě strany od
  polárního úhlu — pokud náhled ukáže destičku obráceně, tlačítko **⇄ Přehodit
  stranu** ji překlopí bez nutnosti přepočítávat úhly ručně. **Není to jen
  obrázek:** přehozená strana mění obrys destičky, ze kterého se počítá úběr,
  kolize, hlídání držáku i mezní čáry — dráhy se proto přepočítají a program
  se označí jako neaktuální.
  **Celá destička:** simulace, náhled i 📐 kreslení na CAD ukazují u polygonu
  celý kosočtverec (čtverec) s rádiusem R ve všech rozích jako skutečná
  destička. Plně je jen řezná část u špičky (dvě hrany
  a spojnice jejich konců), zadní půlka světle — neřeže a sedí v lůžku držáku,
  takže se s ní nepočítá a dráhy se tím nemění. Trojúhelníková destička
  (ε 60°) je celá už sama; u VBD kódu W (trigon) se zadní půlka nedokresluje.
  **Závitová destička** se kreslí taky celá: rovnostranný trojúhelník
  se zubem v každém rohu, hrana podle kódu destičky (11/16/22/27ER/IR =
  11/16/22/27 mm; bez kódu 16 mm). Zub má profil zvoleného
  závitu (60° M/UNC/UNF/NPT, 55° G/BSPT/BSW, 30° Tr, 29° Acme), pracovní
  zub je plně, zbytek destičky světle. Výpočet ji nebere, dráhy se nemění.
- **natočeni PU(°)** (polární úhel; dřív "Natočení") má vedle sebe tlačítko **✛** — otevře
  kompas 3×3 pro rychlou volbu po 45° (stejná komponenta jako v CAD dialogu
  🔢 Číselné zadání objektu).
- **Držák**: zjednodušeno jen na to, co je pro hlídání geometrie potřeba —
  **⇄ Ruka (R/L)** (při otevření odvozena ze směru hrubování, jde ručně
  přepnout; náhled destičky se podle ruky zrcadlí), **↻ Natočení** (otevře
  malé okno pro otočení destičky polárním úhlem i s ✛ kompasem, bez nutnosti
  přepínat na Destička tab), **Délka držáku (l1)** a **Tloušťka držáku**.

Pole tvaru destičky (Délka hrany, Polární úhel, Vrch. úhel, Rádius) jsou
synchronizovaná mezi hlavním panelem a tímto modalem obousměrně.

#### Vlastní obrys držáku
Místo automatické ISO geometrie se obrys držáku kreslí ručně, dvěma způsoby
(dají se kombinovat):
- **✏️ Kreslit obrys** (v Držák tabu) — v náhledu nahoře se zvýrazní klikací
  body na destičce (rohy u hranaté, po 45° na kulaté). Klikni na jeden →
  otevře se okénko se **stranou A**: zadej Délku (mm) a Polární úhel (s ✛
  kompasem) a **➕ Přidat bod** — okénko se znovu otevře pro další segment.
  **↩ Zpět o bod** vrátí poslední bod, **🗑 Zrušit stranu** smaže celou
  stranu, **✔ Dokončit stranu** zavře okénko. Stejným postupem (klik na
  druhý bod) se nakreslí **strana B**. Náhled pak místo obdélníku kreslí
  skutečný nakreslený obrys.
- **📐 Kreslit na CAD plátně** (v Držák tabu) — plnohodnotné kreslení držáku
  běžnými CAD nástroji. Aktuální výkres se **zazálohuje** (vrátí se při ✕ i ✓),
  plátno se vyčistí a založí se dvě vrstvy — **Plátek** (zamčená, červená
  destička jako reálná geometrie, jde na ni snapovat) a **Držák** (kreslíš na
  ni). Destička je uprostřed (počátek 0,0). Režim přežije přepnutí nástroje a
  ukončíš ho jen dolní lištou: **✕ Zrušit** / **✓ Potvrdit**.
  Během kreslení nelze přepnout do CAM (jen upozornění). Při **✓ Potvrdit** se
  uloží **PŘESNĚ to, co je nakreslené** — nic se nedoplňuje, neuzavírá ani
  netvaruje, ať je obrys uzavřený nebo otevřený. (Do 27. 8. 2026 se otevřený
  obrys „auto-doplnil“ pod 45° na Délku držáku l1 — přikreslovalo to držák,
  který uživatel nenakreslil; funkce byla zrušena i s přepínači **Auto**
  a **⇄ Strana**.) Nespojené části kresby se nezahazují: první řetěz je
  strana A, druhý strana B; když jich je víc, aplikace to řekne toastem.

  Když už držák uložený máš a klikneš **📐** znovu, načte se zpět na vrstvu
  Držák jako **editovatelné** čáry (vedle zamčené destičky) — můžeš ho tak
  doupravit místo kreslení od nuly.
- **🔧 Upravit obdélník** (v Držák tabu) — úprava výchozího obdélníku držáku
  přímo v náhledu. Objeví se obdélník (šířka × délka) se třemi žlutými body na
  spodní hraně (levý roh / střed / pravý roh) a zelené body na destičce, teď
  navíc **🎯 Střed R** v počátku. **Přesun:** klikni na bod držáku (žlutý), pak
  na bod destičky (zelený) — držák se tam přesune (např. levý spodní roh →
  střed rádiusu destičky). **🔻 Srazit roh:** klikni, pak vyber rohový bod a
  zadej **velikost + úhel** sražení (45° = symetrické; jiný úhel dopočte druhou
  nohu z úhlu rohu). **🗑 Vymazat:** vrátí čistý obdélník.
- **🗑 Smazat obrys** vrátí zpět na prostý obdélník (holderWidth × holderLength).

> **Obrys držáku patří k TVARU destičky.** Profil se ukládá v souřadnicích
> špičky, takže po výměně tvaru plátku by seděl jinam, než kde destička
> doopravdy je (a hlídání by bylo volnější, než má být). Při každé změně
> tvaru — tlačítky tvaru, **VBD dekodérem**, kartou v zásobníku i načtením
> staršího nože z projektu/souboru bez uloženého obrysu — se proto obrys
> zahodí a aplikace to řekne toastem. Každý tvar si přitom pamatuje svůj
> vlastní obrys: při návratu k němu se vrátí i držák.

Když obrys zmizí (🗑 Smazat obrys, ↩ Zpět, výměna tvaru), **🔧 Upravit
obdélník se sám vypne** — jeho klikací body se kreslí jen k existujícímu
obrysu, jinak by tlačítko svítilo a nešlo by na nic kliknout. Na hlídání to
nic nemění: bez vlastního obrysu se počítá stejný obdélník, jaký editor
zakládá.

Ruční kreslení v dialogu (✏️) je zatím podporované jen pro kulatou a
čtyřstrannou destičku; kreslení na CAD plátně (📐) zvládá i upichovák.

### Knihovna nožů (nůž v projektu)
Geometrie nástroje (destička + držák) se ukládá do **projektu** (JSON). Při
načtení projektu se nůž automaticky **přenese do CAM** (do živého i příště
otevřeného simulátoru), takže si projekty můžeš ukládat jako knihovnu nožů.

#### Zásobník nástrojů (🔧)
Vedle knihovny je **zásobník** — seznam nožů T1, T2… V panelu **Parametry →
Nástroj** je jediné tlačítko **🔧 Zásobník** (najdeš ho i v Geometrii, Držák
tab); **🧵 Závity** (databáze závitů) se vedle něj ukáže jen tehdy, když je
nastavený **závitový plátek** (▽).

Hlavička okna je v jednom řádku:

- **🧰 Knihovna** a **🔪 Geometrie** uprostřed — pracují s **aktuálním**
  nástrojem (jako dřív tlačítka v panelu). Na úzkém displeji jen ikony.
- **↩ / ↪** — vrátí/znovu provede změnu (sdílí historii s celým CAM
  Simulátorem). Do historie jde každá změna slotu: pole, tvar, ✅ Použít,
  smazání, přidání, uložení aktuálního nástroje, import i seřazení.
  Rozbalení karty ne.
- **☰** — menu s méně častou správou: **📥 Import ze souborů** (jeden nebo
  víc `.json` z 💾 Uložit do PC, každý jako nový slot — celý import je jeden
  krok ↩) a **🔄 Seřadit dle výchozích** (výchozí nože zpět na T1–T7).
- **✕** — zavření, odsazené od ☰, ať se okno omylem nezavře.

**Výchozí nože T1–T6** jsou skutečné nože z 📚 ISO katalogu (dřík 25×25),
v pořadí obrábění, za nimi **T7 Vrtak HSS D20** (vrták ⌀20 HSS 118°, vyložení 145
v pouzdře MK2 ⌀40 — operace Vrtání; týž vrták je v 📚 katalogu → Vrtáky;
do uloženého zásobníku se přidal jednou na
konec, 7. 10. 2026):

| T | Nůž | Destička | Nahradil (do 6. 10. 2026) |
|---|---|---|---|
| T1 | PSKNR 2525M12 | SNMG 120408 | Hrub čelo — čtverec κr 75° k čelu, táž geometrie |
| T2 | PSBNR 2525M12 | SNMG 120408 | Hrubovaci — čtverec natočený 15° (κr 75°), táž geometrie |
| T3 | PDJNR 2525M15 | DNMG 150604 | Šlicht — dokončení a profil |
| T4 | SRSCR 2525M20 | RCMT 2006M0 | Kulaty — R10 jako dřív, dojede k čelu |
| T5 | SER 2525M16 | 16ER AG60 | Zavit |
| T6 | MGEHR 2525-5 | MGMN 500-M | Upichovak — š 5, R 0,8 jako dřív |

**Tlačítka tvaru destičky (● ■ ▮ ▽ ⌀) nasadí celý nůž** i s držákem a jeho
obrysem (7. 10. 2026): ● kulatá → **SRSCR2525M20**, ■ polygon →
**PSBNR2525M12**, ▮ upichovák → **MGEHR2525-5**, ▽ závit → **SER2525M16**,
⌀ vrtání → **Vrtak HSS D20**. Když ten nůž je ve 🔧 Zásobníku, vezme se
odtud (jako ✅ Použít — i s jeho Vc, f a ap); když tam není, **přidá se
tam** z 📚 ISO katalogu i s držákem. **Pamatuje si to:** u každého tvaru se
uloží nůž, který jste u něj naposled měli (i s držákem a řeznými
podmínkami), a tlačítko ho příště vrátí — i po obnovení stránky. Nůž bez
nakresleného obrysu držáku (náhradní obdélník) se nepamatuje; místo něj
přijde výchozí nůž s držákem. Tlačítka tvaru ve slotu zásobníku nasadí
výchozí nůž; vlastní jméno slotu zůstává. Dřív tlačítko měnilo jen tvar a po vrtáku si kulatá nesla jeho
vyložení 145 mm a pouzdro 40 × 80 bez obrysu — držák se pak nehlídal.

Výchozí nože se dají jen do **prázdného** zásobníku (první spuštění, ⟲ reset
parametrů) — smazaný nůž se už sám nevrací. Zásobník ale nikdy nezůstane
prázdný: u **posledního** nože se 🗑 Smazat nezobrazí.

**Automatický výběr nože podle operace:** když se zapne **závit** (Závit →
✅ Aktivní, nebo výběr jiného závitu při aktivním), vybere se ze zásobníku
závitový nůž (▽) se **stejným úhlem profilu** jako závit (60° M/UN, 55° G/BSW…),
první v pořadí T. Nůž z 📚 ISO katalogu musí sedět i **stoupáním** (16ER AG60
jen P 0,5–3, Tr destička jen na své jedno stoupání); když v zásobníku není,
hláška řekne, kterou destičku z katalogu přidat (např. „22ER 4.0TR (dřík
25×25, 32×32, 40×40)"), nebo že ji katalog nemá. U **vnitřního** závitu se bere
vnitřní destička (IR v tyči SNR) a tyč se musí vejít do předvrtané díry
⌀(D − 2H) — rada pak nabídne jen tyče, které do díry vlezou, nebo řekne,
že nejmenší tyč potřebuje větší díru. Přepnutí ◯ Vnější / ◎ Vnitřní (pod
Zleva / Zprava) při aktivním závitu nůž vymění taky. Vlastní ▽ nůž bez kódu z katalogu
se bere jako dřív jen podle úhlu. Když se zadá **upichnutí** (Upich → ✂️ Ukázat bod a klik do
výkresu), vybere se **upichovák** (▮); kulatý nůž, který upichnutí umí, se
nechá. Když se zapne **vrtání** (Vrtání → ✅ Aktivní), vybere se první
**vrták** (⌀). Když se zapne **vyvrtávání** (Hrub. → ◎ Vnitřní), vybere se
nejtlustší **vyvrtávací tyč** z 📚 katalogu (S20S-…), která se vejde do
předvrtání. Nůž, který už sedí, se nemění. Když vhodný nůž v zásobníku není,
nástroj zůstane a hláška poradí přidat ho z 🧰 Knihovna → 📚 ISO katalog.
Výměna je s operací jeden krok ↩. Ostatní operace (hrubování, dokončení)
nůž nemění — ten si vybíráš sám.

Uložený zásobník se starými provizorními noži se při prvním otevření převede:
**nezměněný** starý nůž se nahradí ISO nožem na **stejném místě a T**;
nůž, který sis upravil, zůstane. Dokončovací nůž a části programu ukazují
dál na totéž T (tedy na náhradu — „🔄 Dráhy ●" pak ukáže, že je potřeba
dráhy přegenerovat). Aktivní nástroj (panel Parametry) se sám nemění —
nový nůž vybereš ✅ Použít.

Dole zůstávají jen **💾 Uložit aktuální nástroj** a **＋ Přidat nůž**. Když
je zásobník otevřený z Geometrie (a naopak), druhé okno se nezakládá — to
otevřené se jen vytáhne nahoru.

**💾 Uložit aktuální nástroj** se zeptá na **název** (předvyplněný Názvem
nástroje) a **kam**:
- **🔧 Do zásobníku** — nový slot (další volné T) s celým nožem: destička,
  držák i řezné podmínky. Slot se stane aktivním, takže zadaný název dostane
  i aktuální nástroj (Název nástroje v panelu, `T="…"` v programu).
- **🧰 Do knihovny** — **celý nůž** (destička, držák i vlastní obrys, řezné
  podmínky); knihovna je sdílená mezi projekty. V seznamu knihovny ho poznáš
  podle značky tvaru „⬤/◼/▮/▽ + držák". **✅ Použít** ho načte celý — do
  aktuálního nástroje (🧰 Knihovna v hlavičce) i do slotu (🧰 Z knihovny na
  kartě). Starší záznamy a záznamy z VBD kalkulačky drží jen VBD kód, rádius,
  úhly a Vc/f/ap — u nich se tvar plátku ani držák nemění.

#### 📚 ISO katalog nožů
Okno **🧰 Knihovna** má dvě záložky: **🧰 Moje nože** (uložené) a **📚 ISO
katalog** — vestavěné běžné vnější soustružnické nože podle **ISO 5608**
(držák) a **ISO 1832** (destička). Prázdná knihovna se otevře rovnou na
katalogu. Nahoře se volí **dřík** (16×16, 20×20, 25×25, 32×32, 40×40 — podle něj
f1, l1 a velikosti destiček, které do držáku patří), **ruka R/L** (jen název
a náhled — v CAM se strana řídí směrem hrubování) a skupina (podélné, čelní,
kopírovací, srážecí, zapichovací, závitové, **vrtáky**).

| Typ | Destička | κr | Použití |
|---|---|---|---|
| PCLNR / SCLCR | C 80° (CNMG / CCMT) | 95° | podélně i čelně do osazení — univerzál |
| PWLNR | W 80° (WNMG) | 95° | podélně i čelně, 6 břitů |
| PTGNR / STGCR | T 60° (TNMG / TCMT) | 90° | podélně do osazení |
| PCBNR, PSBNR | C 80°, S 90° | 75° | podélné hrubování |
| PSKNR | S 90° (SNMG) | 75° čelně | čelní hrubování |
| PTFNR / STFCR | T 60° | 90° čelně | zarovnání čela |
| PDJNR / SDJCR | D 55° (DNMG / DCMT) | 93° | kopírování, zanoření ~30° |
| PDNNN / SDNCN | D 55° | 62,5° | kopírování oběma směry (neutrální) |
| MVJNR / SVJBR | V 35° (VNMG / VBMT) | 93° | jemné kopírování, zanoření ~50° |
| MVVNN / SVVBN | V 35° | 72,5° | jemné kopírování oběma směry |
| PSSNR / SSSCR, PSDNN | S 90° | 45° | srážení hran |
| SRDCN | R (RCMT) | — | kulatá neutrální — kopírování oběma směry, k čelu nedojede (dřík je souměrně nad destičkou) |
| SRSCR (= SRGCR) | R (RCMT) | — | kulatá v rohu dříku, hlava sražená 45° — destička vyčnívá o R, **dojede k čelu / osazení**; SRGCR/SRGCL je totéž (výrobce uvádí ekvivalent), v katalogu je jedna karta |
| MGEHR | MGMN 2–8 mm (6 mm od dříku 25×25, 8 mm od 32×32) | — | zapichování, upichování; dosah čepele jen 16–23 mm |
| UPICH (lišta) | MGMN 3–8 mm na dlouhé čepeli, **dosah 32 / 40 / 50 / 65 mm** (do 13× šířka; od dříku 20×20) | — | upichování velkých průměrů (karusel). Jméno `UPICHR2525-5-T40` (T = dosah). Orientační — kód destičky bere z MGMN, ověřte v katalogu výrobce lišty |
| MGEHR (radiusový) | MRMN 3–8 mm, plný rádius dna R = šířka / 2 | — | radiusové zápichy (O-kroužky, ložiska); na upichování ne. Jméno `MGEHR2525-4-R2` |
| SER | 11–27ER: A/AG/N/Q 60° a 55°, Tr, Acme | — | vnější závit — rovný dřík, destička v rohu jeho konce (viz tabulka níž) |

U každé karty se vybere **negativní / pozitivní** destička (kde existují
obě), **velikost** (např. CNMG 0904 / 1204 / 1606) a **rádius rε**. Do
držáku jdou i o stupeň menší/větší destičky než nejběžnější řada (hlava se
postaví podle destičky); kulaté RCMT 06–32 mm v rozsahu průměru 0,3·b až b.
Katalog takhle umí přes 800 kombinací. Klik na náhled ho zvětší.

**Velikost plátku jde změnit i potom** — u nože z katalogu je v poli plátku
(panel Parametry a 🔪 Geometrie) výběr **Velikost podle katalogu** (např. RCMT
0803M0 / 1204M0 / 2006M0). Nastaví R, nebo délku hrany, VBD kód a název nože
a přestaví držák. Přepsání R / délky hrany ručně držák taky přestaví, dokud je
to pořád katalogový obrys (ručně upravený držák se nemění).

**Vrtáky a navrtáváky** (operace Vrtání) — karta s výběrem **druhu** a **⌀**;
dřík a ruka se jí netýkají. Jako u nožů: ✅ Použít, 🔧 Do zásobníku, 🧰 Uložit.

| Druh | σ | ⌀ | Vyložení | Upínač | Vc / f (ocel) |
|---|---|---|---|---|---|
| HSS-Co (DIN 338 / DIN 345) | 118° | 3–16 / 17,5–50 | šroubovice + 5 mm | ER16 ⌀32 (do ⌀10), ER25 ⌀42 (do ⌀16), MK2 ⌀40 (do ⌀23), MK3 ⌀50 (do ⌀31,5), MK4 ⌀63 (do ⌀44), MK5 ⌀80 | 25 m/min · f ≈ 0,012·⌀ + 0,02 |
| tvrdokov 5×D, vnitřní chlazení | 140° | 3–20 | 5,5·⌀ + 12 | ER16 / ER25 / ER32 ⌀50 | 80 m/min · f ≈ 0,015·⌀ + 0,03 |
| **navrtávák** HSS-Co | 90° / 120° | 3–20 | 2·⌀ + 11 (krátký, tuhý) | ER16 / ER25 / ER32 | 30 m/min · f ≈ 0,008·⌀ + 0,02 |

**Navrtávák** se zařadí před vrták: navrtá střed a sražení, takže vrták
nesjede po čele. Je bez záběru Q (celá hloubka na jeden zátah) — v záložce
Vrtání dejte **Záběr Q = 0** a hloubku jen na důlek (≈ 0,3·⌀). Vrchol 90°
se hodí před HSS 118°, 120° před vrtáky 118–140° a tvrdokov.

Ve výběru ⌀ jsou označené průměry pro předvrtání pod závit (⌀6,8 pod M8,
⌀8,5 pod M10, ⌀10,2 pod M12, ⌀14 pod M16, ⌀17,5 pod M20, ⌀21 pod M24…). Rozměry
a řezné podmínky jsou **orientační** — data v `js/calculators/isoDrills.js`.

**Závitové destičky (SER/SEL)** — výběr podle dříku:

| Destička | Profil | Stoupání | Dřík |
|---|---|---|---|
| 11ER A60 / A55 | částečný 60° / 55° | P 0,5–1,5 · 48–16 z/″ | 16×16, 20×20 |
| 16ER AG60 / AG55 | částečný 60° / 55° | P 0,5–3 · 48–8 z/″ | všechny |
| 22ER N60 / N55 | částečný 60° / 55° | P 3,5–5 · 7–5 z/″ | 25×25, 32×32 |
| 27ER Q60 / Q55 | částečný 60° / 55° | P 5,5–6 · 4,5–4 z/″ | 32×32 |
| 16 / 22 / 27ER …TR | plný Tr 30° | P 1,5–3 / 4–5 / 6 | jako řádky nad |
| 16 / 22 / 27ER …ACME | plný Acme 29° | 16–8 / 6–5 / 4 z/″ | jako řádky nad |

Částečný profil řeže celý rozsah stoupání, ale vrchol závitu nedělá. Plný
profil je destička na **jedno** stoupání, šířka špičky = dno závitu. Tr nad
P 6 a Acme hrubší než 4 z/″ katalog nemá. Rozsahy jsou běžné řady výrobců
— orientační.

**Vnitřní (do díry)** — ocelové vyvrtávací tyče a vnitřní závitový nůž.
Místo dříku nahoře se na kartě volí **tyč ⌀** (10–80 mm; ⌀50, 63 a 80 jsou těžké tyče pro velké díry na karuselu); u každé je
napsaná nejmenší díra, do které se tyč se špičkou vejde (**Dmin**), a čip
s rozumným vyložením ocelové tyče (4×⌀). Ruka R/L nahoře platí.

| Tyč | Destička | κr | Na co |
|---|---|---|---|
| S..-PCLNR / SCLCR | C 80° (CNMG od ⌀20 / CCMT) | 95° | vyvrtávání do osazení i dna díry |
| S..-STFCR | T 60° (TCMT) | 91° | malé díry, malé řezné síly |
| S..-PDUNR / SDUCR | D 55° (DNMG od ⌀20 / DCMT) | 93° | kopírování v díře, zanoření do ~30° |
| S..-PDQNR / SDQCR | D 55° | 107,5° | kopírování se zpětným záběrem |
| S..-SVUBR | V 35° (VBMT, od ⌀16) | 93° | jemné kopírování, úzká vybrání |
| GIR / GIL | zapichovací š 1,5–5 mm | — | zápich v díře (dosah 2,5–6 mm, od ⌀16) |
| SNR / SNL | 11–27IR (stejná řada jako ER) | — | vnitřní závit |

| Tyč ⌀ | 10 | 12 | 16 | 20 | 25 | 32 | 40 | 50 | 63 | 80 |
|---|---|---|---|---|---|---|---|---|---|---|
| délka l1 | 125 (K) | 150 (M) | 180 (Q) | 250 (S) | 300 (T) | 350 (U) | 400 (V) | 450 (W) | 500 (X) | 600 (Y) |
| f (špička → osa tyče) | 7 | 9 | 11 | 13 | 17 | 22 | 27 | 34 | 43 | 54 |
| Dmin (nejmenší díra) | 13 | 16 | 20 | 25 | 32 | 40 | 50 | 63 | 80 | 100 |

Negativní destička (upnutí páčkou) se do hlavy vejde až od tyče ⌀20;
destička nesmí vyčnívat nad tyč víc než 1,5 mm (proto V16 až od ⌀25).
Náhled kreslí tyč tak, jak jde v díře podél osy (destička u stěny díry,
tyč vede ven z díry). Vnitřní nože jdou do zásobníku a použije je
**Hrub. / Hot. + ◎ Vnitřní** (vyvrtávání), **Upich + ◎ Vnitřní** (zápich v díře)
a **Závit + ◎ Vnitřní** (vnitřní závit). Zapichovací tyč: ⌀16 dosah 2,5 mm
(š 1,5–2), ⌀20 → 3 (š 1,5–3), ⌀25 → 4 (š 2–4), ⌀32 → 5 (š 2–5), ⌀40–80 → 6 (š 3–5).
Rozměry jsou **orientační** — data
v `js/calculators/isoInternalTools.js`.

Tlačítka:

- **✅ Použít** — nůž se nastaví jako aktuální (destička, držák s obrysem
  hlavy, Vc/f/ap), okno se zavře.
- **🔧 Do zásobníku** (jen z 🧰 Knihovny v hlavičce zásobníku) — přidá nůž
  jako další T; okno zůstane otevřené, takže jde zásobník naplnit víc noži
  za sebou.
- **🧰 Uložit** — uloží nůž do Moje nože.

Z typu se dopočítá i natočení destičky v CAM (vedlejší hrana: podélně
180° − ε − κr, čelně κr − 90°) a obrys držáku: dřík b × l1 posunutý o f1
(od zadní strany dříku ke **špičce**: 20/25/32/40 mm podle dříku, styl B —
PSBNR, PCBNR — 13/17/22/27, podle katalogů Sandvik/Indexa),
hlava za destičkou s úlevou 3° od hran (u κr ≥ 90° nevyčnívá přes
prodloužení hlavní hrany, takže nevadí v osazení); spodek hlavy na straně
obrobené plochy stoupá o 20° víc než vedlejší hrana (s +3° se hlava dotýkala
schodů po zanořování — kolize). Hlava končí **1 mm za
břity** (kulatá 0,5 mm od kružnice) — destička přesahuje lůžko jako
u skutečného držáku; kdyby hlava končila přesně na břitu, dotkla by se
zbytku po předchozím průchodu a CAM by průchody zkracoval (do 6. 10. 2026
to tak bylo — staré obrysy se samy převedou, viz CHANGELOG). Název nože je kód
držáku (`PCLNR2525M12`), kód destičky jde do pole VBD. **Rozměry držáků
a tvar hlavy jsou orientační** (typické řady ISO 5610 a katalogů) — konkrétní
držák ověř v katalogu výrobce, obrys jde po použití upravit v 🔪 Geometrii.
Řezné podmínky jsou jen startovní odhad podle destičky.

**▲ ▼ vlevo na kartě** (vedle sebe) posunou nůž v zásobníku o místo výš/níž. Pozice
= číslo T, takže si nůž se sousedem vymění místo **i T**. Aktivní nůž,
rozbalená karta i **dokončovací nůž** (Dokončování → nástroj ze zásobníku)
zůstanou u týchž nožů — v živém nastavení i ve všech částech programu.
Program na pořadí závisí jen přes dokončovací nůž (jeho T v `M6`): když se
posunem nezměnil, dráhy zůstanou aktuální; když ano, „🔄 Dráhy ●" ukáže, že
je potřeba je přegenerovat. Totéž platí pro 🗑 Smazat a 🔄 Seřadit.

Každý slot drží celý nůž: destičku, držák (i vlastní obrys) a řezné
podmínky. Hned za číslem T je **malý obrázek nože** (destička + hlava
držáku, kreslený ze stejných dat jako simulace, i s natočením a rukou) —
nůž je poznat bez rozbalování; klik na obrázek otevře **👁 Ukázat**. Na
úzkém displeji se v řádku schová kód VBD a úhly (jsou v rozbalené kartě),
ať zůstane vidět celý název. Klik na kartu ji rozbalí a pod poli jsou
tlačítka:

- **👁 Ukázat** — okno s náhledem nože, **destička i s držákem**, přesně jak
  vypadá v simulaci. Jen na koukání — aktivní nástroj se nemění. Kolečko nebo
  **＋ / － / ⟲** zoomují **kolem špičky destičky** (aby ti břit z okna
  neutekl), tažením se posouvá. Pod náhledem je souhrn: tvar, R, l1, tloušťka,
  ruka, natočení nože, jestli má vlastní obrys, a Vc/f/ap.
- **✏️ Upravit** — otevře **🔪 Geometrii nástroje** s tímhle nožem, takže se dá
  upravit stejně jako aktivní nástroj (včetně kreslení obrysu držáku). Nůž se
  tím **stane aktivním** (Geometrie umí editovat jen aktivní nastavení) a po
  zavření Geometrie se **změny uloží zpět do slotu**. Když je Geometrie už
  otevřená, druhé okno se nezakládá — jen se do ní načte vybraný nůž.
- **✅ Použít jako aktivní** / **🗑 Smazat** — jako dřív.

### Obrábění po úsecích (rozsah Z 📐)
**Rozsah obrábění Z** neomezuje jen řezné pohyby — pro podélné hrubování
ořezává i **geometrii polotovaru, ze které se dráhy plánují**. Co je mimo
rozsah, jako by pro plánování neexistovalo: hloubková posloupnost se odvozuje
z vrchu polotovaru **uvnitř** rozsahu a vjezdy míří na povrch, který tam
skutečně je. Díl si tak můžeš rozdělit na úseky a každý odhrubovat zvlášť
stejnou logikou — hotová část vedle už do plánování nemluví.

> ⚠ **Za hranicí rozsahu si držák musíš pohlídat sám.** Dřív tu stálo, že
> nástroj do materiálu za hranicí nenarazí — **to není pravda** a bylo to
> ověřeno měřením (25. 8. 2026).
>
> Jak to je: **validátor kolizí (⛔ panel) i model úběru** pracují s celým,
> neořezaným polotovarem, takže náraz **uvidíš**. **Obálka držáku, která dráhy
> plánuje, ale ne** — ta si překážku staví z *hotového dílu*, takže materiál,
> který tahle operace za hranicí záměrně nechává stát, pro ni neexistuje.
> Generátor se mu proto nevyhne.
>
> Naměřené příklady (držák 20 mm za špičkou): `part-14` s pásem Z 100–200 vjede
> do materiálu pod dolní hranicí **401 mm²** (rampa z hranice dolů), s rozsahem
> X 20–40 je to **222 mm²**, se zapnutými čelistmi Z=100 **60 mm²**.
>
> **Co s tím prakticky:**
> - Úseky obráběj v **pořadí, kdy sousední úsek na obrobené straně už je hotový**
>   — pravým nožem tedy zprava doleva. Držák míří za špičku k obrobené straně,
>   takže tam pak žádný materiál nestojí a hlášení je bezpředmětné.
> - **Po každé změně rozsahu se podívej do ⛔ panelu.** Ten měří proti celému
>   polotovaru a nálezy u hranice pásu jsou skutečné, pokud sousední úsek ještě
>   není odebraný.
> - **Rozsah X max** tohle řeší sám (pravidlo 12, níž): pod materiál nad
>   X max se nepodjíždí, takže tam dráhy končí.
>
> Zkoušená oprava (přidat materiál za pásem do obálky držáku) je **změřená
> a zamítnutá**: jeden díl spravila (401 → 5 mm²), dva jiné rozbila
> (0 → 213 mm²) a úběrem házela o ±30 %. Detaily v CHANGELOGu.

**U čelního hrubování vybírá rozsah Z přímo VRSTVY** — marchuje se v ose Z,
takže je to přesný protějšek toho, jak rozsah X vybírá hloubky v podélném
hrubování. Krajní vrstva pásu odskakuje **svisle v ose X** místo obvyklé
diagonály: za hranicí pásu tahle operace neobrábí, takže tam materiál pořád
stojí a diagonální odskok by do něj zajel.

**Rozsah obrábění X** má dvě meze a **každá má vlastní zaškrtávátko** (jako
Čelisti Z / Koník Z) — vypnutím se mez zruší, hodnota zůstane na příště.
Zapnout jde i jen jednu z nich.

- **▼ X min = dno.** Pod tenhle poloměr se nejede (podélně ani čelně). Mez platí pro
  **obrys plátku** (pravidlo 16): střed nosu jede o to, kam plátek sahá pod něj,
  výš — u kulaté o rádius, u polygonu o rádius nosu (totéž u stěny pod X max
  i u dokončování). X min na ose či pod ní se neposouvá.
- **X max ▲ = strop** (pravidlo 12). Nad čarou se neobrábí **nic** a pod
  materiál, který nad ní stojí, se ani nepodjíždí — podélně ani čelně.
  Obrábí se proto jen od volného konce (strany, ze které hrubuješ) po místo,
  kde polotovar poprvé vyleze nad X max; tam dráhy končí a ⚠ panel napíše
  Z té hranice. Platí to pro hrubování i dokončování.
  Když polotovar sahá nad X max hned na volném konci (třeba tyč větší než
  X max), nevznikne žádná dráha — materiál nad čarou pak odeber jinou
  operací (➕ Operace) a teprve na zbytku polotovaru použij X max.

**Hranice pásu vymezuje OBROBENOU PLOCHU, ne programovaný bod.** Destička má
šířku: řez sahá o *rádius nosu* před programovaný bod a o tělo destičky za něj
(u upichováku celá šířka plátku bez rádiusu, jinak *Hloubka záběru*). Průchod
postavený přesně na čáru by proto ještě kus za ní řezal — do sousedního úseku,
který je buď hotový, nebo přijde na řadu s vlastním nastavením. Čelní vrstvy se
proto **posadí tak, aby na čáru dosedl řez**:

- na **konci marche** jeho čelo (nos) — a to i tehdy, když tam mřížka žádnou
  vrstvu nemá: mřížka je kotvená na kraji polotovaru a krok drží ap, takže na
  hranici sama nesedne a zůstával za ní proužek až `ap` široký. Vrstva navíc
  ho sebere (poslední tříska je tenčí než ap, nic se nepřetěžuje).
- na **začátku marche** jeho záď (tělo destičky) — první vrstva se posune
  dovnitř pásu. Příklad z praxe: upichovák 5 mm, pás od Z311,76 → první průchod
  na Z308,932 řezal až na Z313,932, tedy 2,17 mm za čárou; teď stojí na
  Z307,560 a plátek končí přesně na Z311,76.

**Podélně** platí totéž na dolní mezi rozsahu X (dno pásu) — průchod dojede
přesně na ni. Horní mez to nepotřebuje: hloubky nad ní se v tomhle úseku
neobrábí a dělá je sousední úsek, jehož dnem je právě ona.

Nasadí se to jen tam, kde pás opravdu ukrajuje (konec: za hranicí leží vrstva,
kterou operace nedělá; start: hranice leží uvnitř materiálu). Pás, který díl
celý obsáhne — typicky ten uložený s výkresem — dráhy nemění.

> **Pozor u velkého rádiusu nosu.** Čím širší stopa, tím víc musí vrstvy
> ustoupit dovnitř pásu — a schodiště natočené destičky se tím zkrátí, takže
> úsek vyjde mělčí. Změřeno na `part-18` (nos R8, ap 3, pás Z 100…150): dno
> řezu r17,2 → r36,2 a v pásu zůstane o 221 mm² materiálu víc. Když je sousední
> úsek už hotový (řeže se tam do vzduchu), posuň si hranici o rádius nosu ven.
> U běžných destiček je to naopak čistý zisk: u čtyř z pěti měřených pásů
> zbytek v pásu **klesl** (−5 až −40 mm²) a úběr povyrostl.

**Tažení mezních čar snapuje.** Čáry (čelisti, koník, rozsah Z i X) se při
tažení po plátně chytají na souřadnice snapovatelných bodů — vrcholů kontury
i polotovaru, středů úseček, středů a vrcholů oblouků, konců konstrukčních čar
a počátku. Chytne se **jen bod, u kterého zrovna jsi myší**: čára na něj dosedne
souřadnicí v ose tažení (svislá na Z bodu, vodorovná na jeho X), ale musí být
zároveň blízko kurzoru i kolmo na tu osu. Body, kolem kterých čára jen projede
o kus dál, ji tedy nepřitáhnou. Přichycený bod ukáže obvyklý SNAP indikátor.
Vypíná se týmž magnetem 🧲 jako snap při kreslení — s vypnutým se čára jako
dřív posouvá volně po 0,01 mm. Po puštění čáry se dráhy hned přepočítají.

**Dokončování se ořezává taky** — obojím rozsahem, Z i X. Rozsah je **pás**:
může uříznout oba konce a nechat kus uprostřed, případně jeden úsek kontury
rozdělit na dva. Dráha se **zkracuje, ne zahazuje** — hranice pásu je tvoje
volba („tady končí tenhle úsek“), ne mez dosažitelnosti nástroje, takže se tu
neuplatní pravidlo *celý, nebo vůbec*. Zbytek kontury dodělá operace pro
sousední úsek; kolik se ořezalo, hlásí ⚠ panel.

**Čelisti a koník** ořezávají dokončování stejným způsobem — dovolená zóna
`[čelisti, koník]` je taky pás. Dráha se u limitu **zkrátí a pokračuje dál**,
včetně oblouku, který hranici přetíná (ten se ořízne na výseku, ne zahodí).
Když ti po zapnutí koníku zmizí dokončování celé, není to limitem: podívej se,
jestli vůbec něco z kontury leží uvnitř zóny.

### Zanořování za odlitkovým hrbem
Když u odlitku stojí **napravo** od obráběné zóny hrb (velký průměr), do kterého
se v této operaci nezajíždí, nedá se na menší průměry vjet od jeho povrchu —
rampa by odtud vyšla delší než celé Z-okno a nástroj by se tam navíc nevešel
držákem. Se zapnutým **Zanořováním** najde hrubování takové místo samo: vjezd
posune doleva na nejpravější
polohu, kde nástroj stojí na **offsetové čáře polotovaru** (*Přídavek X/Z
(polo.)*), rampa odtud na hloubku dosáhne a vedle se ještě **vejde držák** —
v celém svém dosahu od špičky a s 1 mm volného prostoru od té čáry. Odtud se
pak zanořuje rampou pod *Úhlem zanoření* stejně jako na hranici rozsahu 📐.

Takové zanoření přijde na řadu **až po průchodech na větších průměrech** —
hrubuje se odshora dolů, ne od zanoření. Ruční **Start rozsahu Z** už proto pro
tento případ nastavovat nemusíš; nastav ho jen tehdy, když chceš obrábění
záměrně omezit na kratší úsek.

**Co zanořování zatím NEudělá:** do kapes **za bossem** (materiál ohraničený
stěnou kontury z obou stran uprostřed dílu) podélné hrubování nezajíždí — ani se
zapnutým Zanořováním. Ten materiál se musí obrobit jiným nástrojem/upnutím nebo
zápichem.

**Úhel zanoření 90° a hranice rozsahu.** Vjezd na hranici (rozsah 📐 nebo
hranice úseku u odlitku) se dělá právě proto rampou, že napravo od ní materiál
dál stojí. Se svislým zanořením (90° — u upichováku to dá **Auto**) žádná rampa
neexistuje, takže se rozhoduje podle **držáku**: se zapnutým *Hlídáním držáku
dle pořadí* se projede obrys držáku podél svislého sjezdu proti tomu, co v tu
chvíli opravdu stojí (materiál odebraný předchozími průchody se odečte). Kde
držák projde, **kolmý zápich se povolí** — upichovák tak upichuje a je to jeho
normální provoz. Kde neprojde, hloubka se vynechá a materiál u hranice zůstane
stát: kolmý zápich by tam zavezl držák do neobrobeného polotovaru. Potřebuješ‑li ten materiál dostat pryč, posuň hranici rozsahu ven
z polotovaru (pak se najíždí přes hranu, ne přes umělou mez), nebo ho nech
jiné operaci / jinému nástroji.

**Úhel zanoření podle plátku.** Po přepnutí tvaru plátku se úhel vrátí na
**Auto**: polygon = natočení PU (spodní hrana plátku — strměji zanořit
nesmí ani ručně), kulatá 45° (ručně jde změnit), upichovák vždy kolmo 90°
(pole je zamčené). **Upichovákem se podélně nehrubuje** — hrubuje se čelně
a tvar objede dokončení; tlačítko *Podélně* je u něj zamčené.

### Hrubování bez schodků a „i u čelního"
**Hrub. bez schodků** = po dojezdu vrstvy na offset nástroj místo okamžitého
odskoku dál sleduje konturu (G1/G2/G3) až na hloubku dalšího průchodu, takže se
schod mezi vrstvami obrobí rovnou po obrysu.

Vedlejší přepínač **i u čelního** rozhoduje, jestli se tohle dělá i na **čelních
(radiálních) stěnách** — tedy tam, kde dojezd stoupá v X víc, než ujede v Z:

- **zaškrtnuto** – dojíždí se i po čele/osazení (schod se obrobí hned);
- **nezaškrtnuto** – u takové stěny průchod skončí a odskočí; schod dobere až
  čelní operace. Hodí se hlavně tam, kde „čelo" vzniklo **mezní čárou hlídání
  destičky** (stěna má přesně úhel plátku) — dojezd po ní jen kopíruje limit
  destičky a nic neubere.

Dojezdy po **kuželových a válcových** stěnách a dokončení ramp/kapes tenhle
přepínač neovlivňuje — ty patří k podélnému hrubování a jedou vždy, jinak by
pod nimi zůstal stát klín materiálu.

**Kulatá destička čelně — první vrstvy u čela.** Programovaný bod je střed
nosu, ale břit řeže o celý rádius před ním. První vrstvy se proto dělí od
polohy středu, ve které se čela polotovaru dotkne břit (střed o R za čelem),
a každá vezme v ose Z nejvýš *Hloubku záběru*. Je-li zapnutý **koník**, první
vrstva sedne přímo na něj (průchod se středem za koníkem se nevydá) a zbytek se
rozdělí rovnoměrně. Dojezd „bez schodků", který by ze zbytku nic neubral (schod
už vybrala vrstva jedoucí až k ose), se vynechá a průchod rovnou odskočí.

### Offsetové čáry v náhledu

Kolem kontury i kolem **mezních čar hlídání geometrie destičky** se kreslí dvě
tenké tečkované čáry — kam dojede **střed rádiusu plátku**:

- **hrubovací** – kontura + rádius plátku + *Přídavek X/Z* + *Přídavek na hotovo*;
- **hotovní** – kontura + samotný **rádius plátku** (bez přídavků).

Hotovní čára je jen **geometrická reference**, ne dráha: kreslí se i s vypnutým
**Dokončováním** a do G-kódu nevstupuje. Dá se na ni snapovat stejně jako na
ostatní čáry. Když nejsou zadané žádné přídavky, kreslí se jen jedna čára —
obě by splynuly.

Mezní čára hlídání geometrie destičky je vždycky **rovná úsečka** podél hrany
plátku (žádné oblouky ani zlomy).

### Virtuální zvětšení držáku

Pole **Virt. zvětšení držáku** (v *Parametry → Bezpečná poloha*, vedle *Stop
rychlop. před čarou*) zvětší obrys držáku o zadaný počet mm — ale **jen pro
výpočet**. Nakreslený nůž se nemění; zvětšený obrys vezmou všechna hlídání
(kolize, mezní čáry i plánování drah), takže se nástroj drží od obrobku dál.

K čemu to je: když dojezd končí těsně vedle čela, stačí házivost nebo otřep
a držák se ho dotkne. Zvětšením si tu mezeru vynutíš, aniž bys překresloval
nůž nebo zvětšoval přídavky polotovaru.

**Tlačítko vedle hodnoty** ukazuje i přepíná, kam se přídavek dává:

- **▶ zprava / ◀ zleva (výchozí)** — přídavek jen ze strany, kam se obrábí.
  Odsune se **boční čelo**; spodní šikmá hrana se jen **prodlouží pod svým
  úhlem**, takže zůstane na téže přímce — špička, přední strana ani spodek
  držáku se nemění a **hloubka zanoření se tím neochudí**. Při přepnutí
  strany hrubování se přídavek překlopí s ní, nenastavuješ ho znovu.
- **⭘ dokola** — kolem celého držáku. Pozor: pak přídavek vzniká
  i **u špičky**, a navazuje-li držák přímo na destičku, zakáže jí zajet níž
  než ona sama (typicky vadí při upichování). Používej, jen když opravdu
  potřebuješ mezeru ze všech stran.

**Pod úroveň hrotu se držák nenafoukne nikdy** — tam řeže destička.

Nenulová hodnota se ukazuje jako oranžový štítek **Držák +N** v souhrnu
sekce (i když je sbalená), se šipkou ◀ / ▶ podle strany. Ukládá se do
projektu i k noži v knihovně a zásobníku.

**Co uvidíš v panelu ⛔:** hlídá se proti ZVĚTŠENÉMU obrysu, takže nález
znamená „tady se požadovaná mezera nedala udržet". Je to záměr — jinak by
nešlo poznat, jestli se nastavení vůbec projevilo. Dráhy samy jsou proti
nule vždycky opatrnější, ne horší.

### Držák u čelního hrubování

Se zapnutým **Hlídat geometrii (destička + držák)** se u čelního hrubování
hlídá i **držák**: ten se veze na už obrobené straně (při hrubování zprava
za nástrojem v +Z) a jeho spodní hrana stoupá od špičky pod úhlem hřbetu.
Průchod proto smí jít jen tak hluboko, aby držák minul konturu i dna
sousedních, dřív hotových průchodů — prakticky se **nástroj může zanořovat
nejvýš pod úhlem hřbetu držáku**. Kde kontura klesá strměji (stěna, kužel,
hrana odlitku), se průchody zkrátí, případně vynechají, a panel ⚠ to hlásí:

> Hlídání držáku (čelně): N průchodů zkráceno, M vynecháno…

Materiál pod touto mezí se čelně z té strany daným nožem obrobit **nedá** —
nabízí se podélné hrubování, obrábění z druhé strany (Zleva) nebo štíhlejší
nůž. S vypnutým hlídáním se dráhy vygenerují jako dřív, ale simulátor je
oranžově označí jako vnoření držáku do materiálu.

**Hlídá se i odskok.** Hloubku průchodu vyměří hlídání tak, aby se držák vešel
**na poloze průchodu** — jenže odskok pod 45° pak posune celý držák o *Vyjezd*
dál na obrobenou stranu a jen o tolikéž ven. U stěny strmější než úhel odskoku
tím právě vyměřenou rezervu sní, a protože držák je v Z přes 20 mm tlustý,
otře se o materiál desítky mm daleko od špičky. Takový odskok se proto vydá
**svisle v ose X** — zpátky do vlastní, právě vyříznuté stopy:

    N4740 G1 X16.641 F0.25
    N4750 G1 X18.641 ; Výjezd v X (stěna)

**Hloubku průchodu to nestojí nic** a v ⚠ panelu se to nehlásí — mění se jen
posledních pár mm dráhy. Když nevíš, jestli se to na tvém dílu uplatnilo,
hledej v programu komentář `Výjezd v X (stěna)`.

### CAM tipy
- Používej **Sjednocený směr** pro konzistentní G2/G3
- Pokud se nástroj nevejde do oblouku, zkrať šířku řezu
- Aktivuj **Zrcadlení** pro oboustranné obrábění
- **Kontury** používej pro hrubování, **Profily** pro dokončování

---

## CNC kalkulačky

Přístup: **☰ Nastavení** → **Kalkulačky** nebo přímo z toolbaru.

### Dostupné kalkulačky
- **Řezné podmínky** – otáčky, posuv, výkon. Sekce **🔁 G96 – konstantní
  řezná rychlost**: z Vc a f nahoře, Ø od/do, osové délky L (0 = čelení)
  a omezení otáček n max (Sinumerik LIMS, Fanuc G50 S) spočítá mezní průměr
  D = 1000·vc / (π·n max), pod kterým jedou otáčky na limitu (a vc klesá),
  strojní čas s G96 (u čelení bez omezení t = π·(D₁² − D₂²) / (4000·vc·f))
  a srovnání s G97 při stálých otáčkách z většího průměru.
- **Zkrácení / prodleva** – doba obrábění
- **Tolerance** – tolerance dle DIN ISO 286 (třída + stupeň, nebo vlastní horní/dolní úchylka v mm)
- **Hmotnost** – hmotnost prutů
- **Vrták** (Další kalkulačky) – geometrie špičky vrtáku s náčrtem: tabulka
  základních vrtáků a úhlů špičky σ (ocel 118°, legovaná ocel 130°, nerez 135°,
  hliník/měď 140°, plasty 90°, plexi 60°, navrtáváky 90°/120°, rovné čelo 180°)
  nebo vlastní úhel. Z průměru D spočítá **délku špičky L = D / (2·tan(σ/2))**
  – vzdálenost od hrotu k hraně, kde vrták zabírá na plný průměr (118° → L ≈ 0,3·D).
  Dál: hloubka od hrotu pro menší průměr d (navrtání, sražení hrany) i obráceně
  (zadá se jedno, druhé se dopočítá žlutě), délka hlavního břitu a hloubka hrotu
  H + L, když má díra mít plný průměr do hloubky H. Výpočet počítá s teoretickou
  špičkou (bez příčného břitu).
  Sekce **⚙️ Řezné podmínky vrtání**: materiál a vrták (HSS / SK) → doporučená
  řezná rychlost vc a posuv f ≈ k·D^0,6 (prázdné pole = doporučená hodnota),
  otáčky n, posuvová rychlost vf, strojní čas po dráze nájezd + H + L + přejezd,
  řezný výkon Pc = f·vc·D·kc / 240 000, krouticí moment Mc = f·D²·kc / 8 000
  a osová síla Ff ≈ 0,5·kc·(D/2)·f·sin(σ/2). Hodnoty jsou orientační.
- **Korekce rε** (Další kalkulačky) – korekce na rádius špičky nože, když se
  programuje bez G41/G42 (řídicí systém pak vede teoretickou špičku P):
  - *Sražení / kužel*: úhel α od osy Z → posun bodů ležících na válci
    ΔZ = rε·(1 − tan(α/2)) a bodů na čele ΔX = rε·(1 − tan(45° − α/2))
    (na průměr 2·ΔX), kolmá chyba bez korekce a zda zůstane materiál nebo nůž
    podřízne. Se zadaným Ø D a délkou sražení c vypíše programované body a dva
    řádky `G1`. Volba *Zpětný kužel* počítá opačný sklon.
  - *Rádius 90°*: vypouklý (zaoblení hrany) → R' = R + rε, vydutý (rádius
    v osazení) → R' = R − rε; bod na čele se posune o 2·rε na průměru, bod na
    válci o rε v Z. Se zadaným Ø D vypíše body i středy oblouků.
  - Vnější i vnitřní (vyvrtávací) nůž, soustružení ke sklíčidlu; náčrt ukazuje
    obrys, nůž a dráhu teoretické špičky.
- **Roh R / C** (Další kalkulačky) – zaoblení nebo sražení obecného rohu pro
  ruční programování (kužel → válec, kužel → čelo, dva kužely… pod libovolným
  úhlem). Zadání *třemi body* (předchozí bod P1, roh, další bod P2 – Z a Ø X)
  nebo *rohem a směry úseků* φ1 (do rohu) a φ2 (z rohu), 0° = +Z, 90° = +X,
  rychlá tlačítka ±Z/±X. Zaoblení R: tečné body T1, T2 ve vzdálenosti
  t = R·tan(δ/2) od rohu, střed, vnitřní úhel a řádky `G01` + `G02/G03 … R`;
  směr oblouku podle nastavení stroje (soustruh/karusel, zrcadlení os) stejně
  jako CNC export výkresu. Sražení C: body A, B ve vzdálenosti C po obou
  úsecích a délka sražení. Upozorní, když se úprava nevejde do úseku.
  (Sinumerik umí totéž přímo na řádku rohu: `RND=` / `CHR=`.)
- **Rozmístění děr** (Další kalkulačky, dříve Rozteč děr) – tři záložky:
  - *Kružnice*: díry na roztečné kružnici: počet děr, roztečný průměr, úhel
    první díry θ₀, celý kruh nebo zadaná úhlová rozteč Δθ, směr (proti / po
    směru hodin) a střed X/Y. Vypíše tabulku X, Y a úhlu C (soustruh s osou C:
    X = roztečný průměr, C = úhel), vzdálenost středů sousedních děr a se
    zadaným Ø díry i můstek (nebo upozorní na překrytí).
  - *Řada*: díry na přímce – počet n, začátek (X, Y) a buď rozteč s úhlem, nebo
    koncový bod (rozteč se dopočte, díry jsou rovnoměrně včetně obou krajních).
    Tabulka X, Y, délka řady, můstek, náčrt s pořadím vrtání.
  - *Mřížka*: nx × ny děr s roztečemi px, py, natočená o θ kolem první díry;
    pořadí po řádcích, nebo meandrem (každý druhý řádek opačně → kratší
    pojezdy). Tabulka X, Y, rozměr mřížky, můstky v řadě a mezi řadami.
  - **◎ Do čela** (všechny tři záložky): nakreslí díry do aktuálního čela
    bokorysu — X, Y vůči ose vřetena (vypnutý bokorys se zapne); záložka
    Kružnice přidá i roztečnou kružnici čerchovaně (pomocná, do CAM nejde).
    Potřebuje Ø díry a **hloubku díry**: Skrz (+ přesah) / Do hloubky / Do Z.
    Z bokorysu ji otevře i Kr.pole (klepnutí na střed, vytažení roztečné
    kružnice — předvyplní střed i Ø rozteče).
- **Drátky/válečky** (Další kalkulačky, ikona profilu závitu s drátky) – měření
  přes drátky a válečky:
  - *Závit – 3 drátky*: metrický ISO, UNC/UNF, Whitworth, Tr nebo vlastní úhel;
    z d a P (nebo přímo d₂) míra M = d₂ + d_w·(1 + 1/sin(α/2)) − (P/2)·cot(α/2),
    optimální drátek P / (2·cos(α/2)) a použitelný rozsah drátků (drátek musí
    vyčnívat nad vrcholy a dotýkat se boků; metrický 0,505·P až 1,01·P).
    Prázdné pole = nejbližší drátek z běžné sady, ale jen z použitelného
    rozsahu; když sada vhodný nemá (velká stoupání), počítá s optimem a řekne
    to. Ručně zadaný drátek mimo rozsah ohlásí. S naměřeným M skutečný d₂
    a odchylka v µm. UN: d i P v mm (P = 25,4 / TPI jde zadat výrazem).
  - *Kužel*: kužel stojí na desce, válečky Ø d_v na desce (M1) a na měrkách
    výšky h (M2) → vrcholový úhel, kuželovitost 1:x a průměr u desky (kužel
    může stát na menším i větším průměru); nebo opačně kontrolní M1, M2
    z průměru a úhlu (či 1:x).
  - *Rybina*: vnější (čep) M = B + d_v·(1 + cot(α/2)), vnitřní (drážka)
    X = A − d_v·(1 + cot(α/2)); zadá se šířka nebo naměřená míra, druhá se
    dopočítá.
- **Nm – utahovací momenty** – v pravém panelu Kalkulačky (🔧 Nm). Čtyři záložky:
  - *Moje nože* – vlastní seznam (nůž / držák, plátek, šroub, klíč, moment Nm,
    poznámka) uložený v prohlížeči (localStorage `skica-torque-tools`). Klepnutí
    na řádek záznam načte k úpravě, ✕ smaže, pole Hledat filtruje. U zadaného
    šroubu (např. „M5") se ukáže orientační rozsah a varování, je-li moment
    daleko mimo. 📋 Kopírovat zkopíruje celý seznam jako text.
  - *Šrouby VBD* – orientační momenty upínacích šroubů destiček M2–M8 (Torx)
    podle katalogů Kennametal a Denitool; klepnutí převezme šroub a klíč do
    Moje nože. Rozhoduje hodnota výrobce na držáku / obalu šroubu.
    Pod ní Kennametal Kenloc (čep negativních VBD s otvorem, dotahuje se
    imbusem): imbus 2 → KLM-33/34 1,7 Nm, 2,5 → KLM-44/46 3,3 Nm (CNMG 12),
    3 → KLM-56/58 5,5 Nm. V Moje nože se podle zadaného plátku (ISO i ANSI,
    např. CNMG120412 / CNMG433) nebo imbusu čep a moment navrhne sám.
    Další tabulka: šrouby upínek shora Kennametal (imbus 2 → 2,1 Nm,
    2,5 → 4,0–4,2 Nm, 3 → 6–7 Nm, 4 → 17 Nm); u imbusu se ukážou obě možnosti.
  - *Šroub M* – moment a předpětí metrického šroubu M4–M36 (8.8, 10.9, 12.9,
    A2-70, A4-80) podle VDI 2230 (90 % meze kluzu, μ 0,10–0,16), např. upínky
    a čelisti na desce karuselu.
  - *Klíč* – nastavení momentového klíče s prodloužením M·L/(L+a) a převod
    jednotek (Nm, cNm, kgf·m, kgf·cm, lbf·ft, lbf·in).
- **Kužel** (Taper) – v pravém panelu Kalkulačky. V liště okna je 🔢 Kalkulačka:
  klepni do pole, spočítej a tlačítkem ↓ se výsledek vloží do pole; 🗑 Vymazat
  (také v liště) smaže všechny zadané hodnoty a měřicí místa. Bez záložek:
  nahoře Zobrazení (díra / čep a kde je větší Ø – dole / nahoře, ⇅ prohodí),
  pak náčrt, výsledky a pole;
  úplně dole rozbalovací tabulky Morse / ISO.
  - *Kužel* – jeden výpočet pro čep i díru. Náčrt řezu je klikací: klepni na
    kótu a zadej hodnotu – D velký Ø, d malý Ø, délka L, kuželovitost
    „1:x" (nahoře; zadat jde 300 = 1:300 i libovolný poměr, např. 7:24) nebo úhel „α" (oblouk u stěny = sklon k ose, náklon
    suportu); „⇅ větší" prohodí stranu většího Ø. Stačí 3 údaje z D, d, L
    a kuželovitosti (1:x nebo α); zadaný údaj je bílý, dopočítaný žlutý,
    chybějící „?". Při zadání čtvrtého se nejstarší zadání uvolní.
    Když výkres udává průměr v hloubce (např. Ø211 v hl. 22,5 od spodu),
    klepni na „+ Ø v hloubce" – pak stačí ještě délka a kuželovitost (nebo
    D či d). Tolerance se zadává jen dole ručně (horní / dolní úchylka) a
    platí pro všechny průměry; prázdné pole = 0 a větší hodnota se vezme jako
    horní úchylka. Klepnutí do díry přidá měřicí místo (od spodu
    / od vrchu / z obou), klepnutí na místo ho upraví nebo smaže. Výsledky:
    jmenovitý, min. a max. Ø v měřicích místech a na hranách, rozdíl
    vrch − spodek, náklon suportu a přísuv na stranu. *Kopírovat* = čitelný
    přehled, *Do programu* = text velkými písmeny bez diakritiky jako komentář
    do NC programu. Pole pod výsledky: Kužel, Ø z výkresu v hloubce,
    Tolerance, Měřicí místa.
  - *Morse / ISO* (dole, rozbalovací) – klepnutím na řádek se kužel vyplní.
- **Závity** – převodné tabulky. U vybraného závitu **rozpis průchodů**:
  hloubky řezů stejné jako v CAM (ubývající přísuv a_k = h·√(k/n), počet řezů
  automaticky jako CAM, nerez +30 %, hliník −20 %, tlačítka − / + mění počet),
  Ø X každého řezu (vnější od d, vnitřní od D1), přísuv radiální, boční
  (β = α/2 − 0,5°, posun startu v Z od polohy posledního řezu) nebo střídavý
  (posun střídá strany) a jiskřicí řez; varuje u přísuvu pod 0,02 mm.
- **Převody** – jednotky (mm/inch, RPM/SFM)
- **VK Kontura** – editor volné kontury (obdoba Heidenhain FK): zápis prvku
  úsečka/oblouk s neznámými rozměry (`?`), polárně k pólu (VPOL), s přehledem
  syntaxe a převodem doplněného zápisu na ISO G-kód.
  Otevírá se ve **sdíleném okně „Zadání objektu"** (tlačítko 🔢 Zadat /
  ✏️ VK na výkresu; z pravého panelu už ne) – druhá záložka je
  🔢 Číselné zadání objektu, takže se dá mezi oběma způsoby zadání
  přepínat bez zavírání okna (a naopak: 🔢 kdekoli v appce otevře totéž
  okno rovnou na číselné záložce). Obě záložky, ⤢ i ✕ sedí v jedné
  **liště okna** – okno jde přesunout tažením za ni.

  **Náhled se kreslí přímo na výkres** – zadávaná kontura je vidět ve
  stejném měřítku a poloze jako to, co už je nakreslené. Tlačítko **⤢**
  v liště vycentruje plátno na to, co je právě rozepsané (na záložce 📐
  kontura, na 🔢 zadávaný objekt; když ještě není co ukázat, vycentruje
  celý výkres). Rámuje se přitom jen do **viditelné části plátna** – na
  mobilu tedy nad okno, ne pod něj. Okno je plovoucí, takže se s ním
  dá dál kreslit nástrojem; **ESC** proto zruší rozkreslený prvek
  nástroje (okno se zavírá **✕**). Na mobilu **na výšku** zabírá spodní
  polovinu displeje (formulář je vidět celý), horní polovina zůstává na
  plátno; **na šířku** jen třetinu, ať zbude víc místa na výkres.

  **Lišta prvku VK** (řádek s ◀ ▶ ➕ ➖) nese vpravo i akce nad celou
  syntaxí – **🗑** smazat, **📋** kopírovat, **⇄** konvertovat na ISO
  G-kód (druhý klik ↩ vrátí VK zápis) a **📥** vložit do výkresu.
  Úplně vpravo je **❓**, které otevře přehled syntaxe a možností VK
  ve vlastním okně.

  **Záložka 🔢 Číselné zadání** – typ objektu se vybírá řádkem ikon
  (**/** úsečka, **○** kružnice, **·** bod, čárkovaná diagonála =
  konstrukční čára, **⌒** oblouk); pole podporují matematické výrazy
  (`123+56`, `200/3`, `(10+5)*2`). **Oblouk** se dá zadat dvěma způsoby
  (přepínač nad poli): *Start + konec* (začátek, konec, poloměr a smysl —
  stejně jako `G02/G03 X.. Z.. R..`; navazuje na konec předchozího prvku)
  nebo *Střed + úhly* (střed, Start (°) + Konec (°), poloměr a smysl).
  Když je poloměr kratší než půlka vzdálenosti obou bodů, oblouk nejde
  sestrojit a formulář napíše, jaké minimum je potřeba.
  Potvrzuje se tlačítkem **OK** přímo v posledním řádku polí –
  objekt se vloží a formulář rovnou navazuje na jeho konec, takže se
  kontura skládá úsečka po úsečce.

  **Zaoblení/zkosení rohu jde zadat rovnou s navazující úsečkou** – když
  existuje předchozí úsečka, přibude nepovinný řádek **Roh s předchozí**
  s přepínačem **⌒**/**⌿** a polem na hodnotu (poloměr/vzdálenost). Vyplň
  ho spolu s cílovým bodem a jedno **OK** vytvoří úsečku a rovnou zaoblí/
  zkosí roh s tou předchozí – stejná operace jako nástroj Zaoblení/Zkosení
  na plátně, jen jedním krokem místo dvou. Když pole necháš prázdné, po
  vytvoření úsečky se místo něj objeví záložní řádek **Roh s předchozí
  úsečkou** s **⌒**/**⌿** tlačítky (otevřou stejný dialog jako nástroj na
  plátně) – roh jde doplnit i dodatečně. Okno se zavírá **✕** v liště.

  Zaoblený/zkosený roh se do **ručního zápisu G-kódu** (viz níž) zapíše
  rovnou jako **skutečná dráha** – řádek úsečky, která do rohu dojíždí,
  se přepíše na oříznutý bod a hned za něj přibude `G02`/`G03 … R`
  (zaoblení) nebo `G01` (zkosení) na druhý oříznutý bod. Je to přesně to,
  co by appka napsala po stisku tlačítka **⌒ Sražení/zaoblení → dráha**
  přímo v **💻 CNC Editoru** – jen bez toho, že by se tam zápis musel
  posílat ručně.

  Pod formulářem je pole na **ruční zápis G-kódu**. Píše se do něj ručně,
  ale **plní se i samo** – co vytvoříš přes formulář (**OK**), se rovnou
  připíše jako G-kód ve stejném formátu, jaký appka vypisuje jinde: úsečka
  jako `G01`, oblouk jako `G02/G03 … R`, navazující prvky bez zbytečného
  `G00` (jen když nástroj skočí jinam, než kde právě „stojí"). Bod a
  kružnice nejsou pohyb nástroje, takže se zapíšou jako komentář
  (`; Bod …`, `; Kružnice …`) – appka je při zpětném vykreslení jen
  přeskočí. Tlačítko **🔄** (plovoucí v pravém horním rohu pole, nebo
  klávesová zkratka **Ctrl+Enter** – obyčejný Enter dělá normální nový
  řádek) kód vykreslí na plátno (nahradí objekty výkresu, vrací se jedním
  **Ctrl+Z**) a pravý panel **CNC** si ho pak vygeneruje sám. Vedle něj
  **🗑** pole smaže. Rozepsaný text zůstane i po zavření okna.

  Tlačítko **⤢** (v liště okna) rámuje přednostně **obsah tohohle pole**
  – i před tím, než se vůbec vykreslí přes 🔄. Teprve když je pole
  prázdné, spadne na živý náhled formuláře.

  **Psát se nemusí úhledně.** Před vykreslením se zápis srovná, takže projde:

  | Co napíšeš | Jak se to srovná |
  |---|---|
  | `g1 x10 z-5` | `G01 X10.000 Z-5.000` |
  | `X 10   Z 20` | `X10.000 Z20.000` |
  | `x10,5` | `X10.500` |
  | `X10+5`, `Z200/3`, `X(10+5)*2` | `X15.000`, `Z66.667`, `X30.000` |
  | `x=10`, `z: -5` | `X10.000 Z-5.000` |
  | `n10g1x20z-30` | `N10 G01 X20.000 Z-30.000` |

  Komentáře `; …` a `( … )` zůstanou. Srovnaný text se zapíše zpátky do pole,
  takže je vidět, jak appka zápis pochopila; čemu neporozumí, nechá být.

  **Geometricky nemožný oblouk appka nezahodí potichu.** Když má `G02/G03`
  poloměr kratší než půlka vzdálenosti mezi body, ten řádek se přeskočí a
  po **🔄** to appka řekne – s číslem řádku, důvodem i tím, jaké R by
  stačilo (zbytek programu se vykreslí normálně). Totéž hlídá i **📐 VK**
  na sousední záložce u prvku se zcela známými souřadnicemi cíle.

  Stejně se po **🔄** hlásí i další řádky, které by jinak zmizely nebo
  nakreslily špatnou geometrii: oblouk bez `R` i `I/K`, `I/K` nesedící ke
  koncovému bodu, kružnice `G02 I5` bez `X/Z`, posun nulového bodu
  (`G50/G52/G92`) a `G20` (palce). **Nekreslí se** prodleva `G04 X..`,
  reference `G28/G30`, strojní souřadnice `G53` ani cykly `G70–G76`
  (nejsou pohybem po kontuře). Rozumí i desetinné čárce (`X10,5`)
  a přírůstkům Fanuc **`U`/`W`** (`G01 U5 W-5`).

  Okno se otevírá na této záložce s typem **Bod** – má nejmíň polí, takže je
  pole na zápis kódu vidět celé. Po každém **OK** se navíc plátno
  automaticky vycentruje na celý výkres, takže při řetězení „bod za bodem"
  neuteče mimo viditelnou plochu.

  Obě záložky mají **stejnou, pevnou výšku okna** – nemění se podle toho,
  kolik polí má vybraný typ objektu. Obsah se roluje jako celek: k poli na
  zápis kódu se doroluje dolů, a když nad ním zbyde místo, pole se zvětší.

  **🎯** u souřadnic prvku doplní X i Z jedním kliknutím do výkresu
  (stejné tlačítko má i číselné zadání u jednotlivých polí) – klik se
  spotřebuje jen na výběr bodu, nic nenakreslí. Na dotyku platí poloha
  **přesného zaměřovače** (dlouhý stisk), ne prstu – křížek je schválně
  posunutý nad prst, aby byl vidět.

  **✏️ Kreslení myší** – vedle 🎯. Zapne režim, ve kterém **každý klik do
  výkresu rovnou vloží prvek** (jako by ses klikl na 🎯 a pak na ➕), takže
  se kontura naklikává jako polyčára a syntaxe se píše sama. Je to
  plnohodnotný nástroj CADu (ve stavové liště *Nástroj: VK – kreslení
  kontury*), takže klik nikdy nekreslí zároveň něco jiného a funguje
  i na dotyku. Platí přitom nastavení ve formuláři:
  - **VL / VKr** – klikáš úsečky, nebo oblouky (oblouk si vezme směr
    **G2/G3** a **poloměr R** z formuláře),
  - **Tečné napojení (T)** – zaškrtnuté se přidá každému kliknutému prvku,
  - **přichycení k bodům** funguje jako u ostatních nástrojů.

  Prvek, který by kliknutím vznikl, je vidět jako **gumová čára** od konce
  kontury k ukazateli – u VKr rovnou jako oblouk daného R a směru. Když se
  místo oblouku ukáže úsečka, je poloměr na tu vzdálenost krátký.

  **Krok zpět: ⌫** (nebo tlačítko **➖**) odebere poslední prvek kontury.
  Definice pólu `G111` (VPOL) se krokem zpět nemaže.

  Režim se vypíná dalším klikem na **✏️**, klávesou **ESC**, přepnutím na
  jiný nástroj, přepnutím na záložku 🔢 nebo zavřením okna. Naklikaná
  kontura je pořád jen VK syntaxe – do výkresu se dostane až přes
  **📥 Vložit do výkresu**.

  **📥 Vložit do výkresu** změní hotovou konturu na skutečné úsečky
  a oblouky výkresu. Od té chvíle jsou to **normální objekty** – dají se
  trimovat, zaoblovat, kótovat, exportovat do DXF i použít v CAM.
  Celé vložení se vrací jedním **Ctrl+Z**. Konstrukční paprsky (VPOL/PA)
  se nevkládají, jsou to jen pomůcky pro hledání průsečíku. Zpět do VK
  zápisu už objekty nejdou – VK syntaxe ale v okně zůstává, takže se dá
  upravit a vložit znovu (pozor, vloží se další kopie).

  > Když je v syntaxi ještě `?`, vložení se odmítne – nejdřív použij
  > **Konvertovat na ISO G-kód**, který neznámé dopočítá.

  **Psaní VK syntaxe ručně:** nemusí být úhledné – `g01 x10,5 z -3`, `G02`,
  `X.5`, `X10+5`, `X=10` i `G1X10Z-5` projde a po opuštění pole se zápis
  srovná (`G1 X10.5 Z-3`). Řádek, kterému VK nerozumí, se **nezahodí
  potichu**: pod polem se objeví ⛔ chyba (červeně) nebo ⚠️ varování (žlutě)
  s číslem řádku a řádek se nepřepíše. Hlídá se neznámý příkaz (`G90`),
  chybějící příkaz, `I/J/K` (střed oblouku – použij `R`), číslo s mezerou
  (`X10 -5` – nejednoznačné), oblouk bez `R`, `R0`, dvakrát stejná adresa,
  `T` s číslem a `VPOL` jiný než 1/2. Varování (hodnota nad 100 000 mm, `PA`
  mimo ±360°, `PR` bez `PA`) nic neblokují. Dokud je v zápisu **chyba**,
  **📥 Vložit do výkresu** i **⇄ Konvertovat** nic neudělají a řeknou proč.

  **Velký oblouk (záporné R):** `G3 X0 Z-10 R-6` je oblouk **větší než půlkruh** (stejně jako v ISO). Kladné `R` dá kratší oblouk mezi dvěma body, záporné ten delší, střed je na druhé straně tětivy. Smysl má jen u oblouku se zadaným `X` i `Z` bez tečnosti `T`. U dopočtu (`?`) a u `T` tvar oblouku určuje tečnost a směr G2/G3, takže se záporné R po opuštění pole opraví na kladné a VK to oznámí.

  **Tečné napojení (T)** – u oblouku s příznakem `T` dotáhne VK předchozí
  úsečku nebo kužel přesně do bodu dotyku, takže přechod je hladký.
  Kam se kontura posune, je vidět **na výkrese už při psaní** – fialově
  čárkovaně, s kroužkem v dotykovém bodě. Je to jen nápověda; do syntaxe
  (a tím i do výkresu) se úprava zapíše až tlačítkem **Konvertovat na ISO
  G-kód**, po kterém nápověda zmizí.
  Konec předchozího prvku se přitom **posune** (napsaný roh byl jen
  nominální) – proto se to dělá jen s `T`. Po konstrukčním paprsku
  (úhel bez délky) se místo toho vloží přechodová úsečka `G1`.

  Funguje i obráceně: oblouk může mít **neznámý konec** (`X? Z?`) a dopočítá
  se z prvku, který za ním následuje – klasické **válec → rádius → čelo**
  se zadá jako válec, pak oblouk `R` s `T` a `?`, a pak čelo. Kam se oblouk
  zahne (ven k osazení, nebo dovnitř k ose), rozhoduje **Dvojznačnost
  řešení** níže.

  Stejně se zadá i **esíčko** (dva tečné oblouky za sebou): válec, pak dva
  oblouky s `T` a `?`, pak čelo. Když esíčko takhle navazuje na už hotovou
  geometrii, **nemusíš vyplňovat „Bod zlomu"** – poloha vyjde ze samotné
  tečnosti. Pole „Bod zlomu" je potřeba jen tehdy, když esíčko začíná
  rozdělanou přímkou (i ta má `?`), protože pak má úloha o jedno zadání míň.

  **Dvojznačná řešení** – když má dopočet dvě geometricky platná řešení
  a jedno z nich je aspoň 3× dál od začátku obrysu než druhé, vezme se
  automaticky to bližší a informační řádek to oznámí (včetně poměru).
  Když jsou obě podobně daleko, VK se zeptá – vyber ve formuláři
  **Dvojznačnost** (v řádku s 🎯 ✏️) `VPOL1` (bližší) nebo `VPOL2` (vzdálenější),
  nebo dopiš značku rovnou do řádku v syntaxi. Volba patří k tomu
  **plně zadanému prvku, kterým se dopočet spouští**, a po vložení se
  přepínač vrací na „—", aby se tiše nepřenesla na další prvek.
  Přebít se dá i řešení, které appka vybrala sama.

---

### Referenční příručky řídicích systémů (Sinumerik, Fanuc, Heidenhain)

V pravém panelu je v **Kalkulačkách** tlačítko **Sinumerik** a ve sbalené části
**Další kalkulačky** tlačítka **Fanuc** a **Heidenhain**. Každé otevře rozcestník s dlaždicemi; v seznamech
je vyhledávání, filtr podle kategorií a po klepnutí na kartu syntaxe s příklady.

- **Sinumerik 840D** – G kódy, M kódy, příkazy, proměnné, zkratky, ukázky, nápověda,
  **Nástroje** (🛠️: nahoře **Opotřebení** – co dělá zápis −0,2 (průměr / délka, poloměr × průměr, znaménko, zkouška na stroji); data nástroje T a data břitu D – typ, název, ST, délky X/Z, poloměr,
  poloha břitu SL, úhly, opotřebení, hlídání životnosti; postupy založení a změření nože;
  dva suporty = dva kanály, společná × oddělená data, nulové body, `WAITM`; proměnné `$TC_DP`)
  a **Alarmy**.
- **Fanuc 0i/31i-T** – G kódy (pohyby, cykly G70–G76, G90/G92/G94, závity,
  vrtání s osou C), M kódy, Makro B (proměnné `#`, `IF`/`WHILE`, funkce,
  argumenty `G65`) a ukázky (hrubování G71+G70, závit G76, drážka G75,
  podprogram M98, makro s počítadlem). Ukázky s tlačítkem 📋 se kopírují. Dlaždice
  🛠️ **Nástroje** – nastavení nože (nový nůž, měření X/Z tlačítkem MEASURE, nová destička,
  kontrola čísla špičky, dva suporty = dvě dráhy), geometrie a opotřebení (Wear X −0,2 = průměr o 0,2 menší
  při zápisu v průměru, INPUT × +INPUT, měření MEASURE, `G10`).
- **Heidenhain TNC 640** – Klartext (`L`, `CC`, `C`, `CR`, `CT`, `CHF`, `RND`,
  `APPR`/`DEP`, `TOOL CALL`, `FUNCTION MODE TURN`), ISO G kódy (tak, jak je
  generuje SKICA), M funkce, Q-parametry a FN funkce, cykly (vrtání,
  transformace a soustružnické cykly 8xx), 🛠️ **Nástroje** (tabulka soustružnických nožů,
  opotřebení DXL/DZL/DRS, orientace TO, postupy nastavení nože) a ukázky.

**Alarmy a chybová hlášení** (dlaždice 🚨 *Alarmy* u Sinumeriku a Fanucu, *Chyby* u Heidenhainu): jak vyvolat vlastní alarm (`SETAL` / `MSG`, `#3000` / `#3006`, `FN 14: ERROR`), jak se alarmy mažou (RESET, CANCEL, POWER ON, CE), číselné rozsahy a přehled častých alarmů s příčinou a řešením (Sinumerik 12080, 25040, 61xxx a SINAMICS F30xxx; Fanuc PS, OT, SV, SP, alarmy vřetena AL-xx; Heidenhain interní chyby 1000–1027). Jde o orientační přehled – přesné znění a čísla se liší podle verze SW a stroje.

> Jde o stručný přehled, ne o náhradu manuálu výrobce. Číslování M funkcí,
> průměr/poloměr v X a přesné parametry soustružnických cyklů Heidenhainu
> závisí na stroji a verzi software – ověřte je v dokumentaci svého stroje.

## AI panel

AI panel ti umožňuje převést fotku strojírenského výkresu na CAD profil.

### Postup
1. Klikni na **AI** tlačítko (vyžaduje API klíč)
2. **Fotopanel**: vyfoť nebo nahraj fotku výkresu
3. AI analyzuje obrys a vrátí JSON souřadnic (Z, ⌀)
4. Klikni **Vykreslit** – profil se převede na polylinii ve SKICA
5. Uprav podle potřeby

### AI poskytovatelé
- **Groq** – rychlé modely (Llama, Gemma)
- **Gemini** – Google vision modely
- **OpenRouter** – více modelů (Claude, GPT-4, ...)

Nastavení API klíčů: ☰ → **Nastavení** → **AI nastavení**

---

## Témata a vzhled

### Změna tématu
1. Klikni na **☰** → **Nastavení**
2. Vyber **Téma**: Tmavé / Světlé

### Dostupné palety
- **Catppuccin Mocha** (tmavá, výchozí)
- **Catppuccin Latte** (světlá)
- Barevné rozlišení všech prvků: mřížka, osy, konstrukční čáry, výběr, snap body

---

## Ukládání a otevírání projektů

### Automatické ukládání
- Projekt se ukládá do **IndexedDB** každých 2 sekundy po změně
- Při zavření/znovu otevření se obnoví automaticky
- **Nastavení** (mřížka, snapy, krok a tolerance úhlu, kóty, motiv, R/⌀,
  ABS/INC s nulovým bodem, typ stroje, otočení os, desetinná místa…) se ukládá **zvlášť od
  výkresu** — hned po změně i při zavření stránky — a po znovuotevření se
  obnoví vždy, i když je výkres prázdný. Otevřený projekt přinese svoje
  nastavení (typ stroje, osy, snapy) a to pak platí dál.

### Uložit jako
1. Klikni **☰** → **Uložit projekt**
2. Zadej název projektu
3. Stáhne `.skica_projekt.json` soubor

### Načíst projekt
1. Klikni **☰** → **Načíst projekt**
2. Vyber `.skica_projekt.json`
3. Nebo přetáhni soubor přímo do okna

### Export PNG / SVG
- ☰ → **Export obrázku** – stáhne `.png` nebo `.svg` aktuálního výkresu
- Obrázek (PNG i SVG) obsahuje i **kóty** (šipky, hodnoty, úhly, R/⌀, souřadnice bodů),
  **texty** a **výplně** – stejně jako na plátně. Kóty se řídí přepínačem
  zobrazení kót (skryté kóty se neexportují).
- Rozlišení **1×** ≈ 800 px na delší stranu výkresu, 2× a 4× jsou ostřejší
  (vzhled kót se nemění, jen roste rozlišení).
- Na **bílém / průhledném** pozadí mají popisky kót tmavou barvu, aby byly
  čitelné i při tmavém tématu aplikace.
- **SVG** je vektorové v mm (geometrie 1:1); kóty jsou ve skupině `kóty`, popisky
  jako text (písmo Consolas, náhradní monospace).

### Souborové typy
| Přípona | Obsah |
|---------|-------|
| `.skica_projekt.json` | Projeky SKICA (JSON) |
| `.dxf` | DXF import/export |
| `.png` | Obrázek výkresu |
| `.camprog` | CAM program |

---

## Klávesové zkratky

### Globální
| Zkratka | Funkce |
|---------|--------|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+A` | Vybrat vše |
| `Delete` / `Backspace` | Smazat vybraný |
| `Escape` | Zrušit akci |
| `Ctrl+0` | Vycentrovat výkres |
| `Ctrl+C/V/X` | Kopírovat / Vložit / Vyjmout |
| `F2` | Přejmenovat objekt |
| `Space` (držený) | Pan plátna |

### CNC Editor
| Zkratka | Funkce |
|---------|--------|
| `Ctrl+S` | Uložit |
| `Ctrl+Z` | Undo v editoru |
| `Tab` | Odsazení |
| `Ctrl+F` | Najít v kódu |

---

## Tipy pro soustružníky

### Osy
- **Souřadnicový systém**: X = průměr (Z čas. osa), Z = délka (osa vzdálenosti)
- **Směr**: Z0 je vlevo (strana sklíčidla), Z roste doprava
- **X displej**: můžeš volit Radius nebo Průměr ( Nastavení )

### Kontura vs Polotovar
- **Kontura** = obrábený obrys (co kam pojede nástroj)
- **Polotovar** = kružnice hrubého prutu (z čeho se začne obrábět)
- CAM simulator potřebuje obojí pro správný výpočet dráhy

### G-kódy
- SKICA generuje pro **Sinumerik 840D sl**
- Pokud používáš jiný systém, použij **G-kód parser** pro import zpět
- Validace v editoru kontroluje: chybějící G90/G91, G96 bez LIMS, neukončený program, ...

### Zubové kola
- Pokud generuješ ozubení pro soustruh, použij **kuželové ozubení** (zobáčkové) pro šikmé osy
- Po generování použij **Offset** pro vytvoření praktického obrázku

### AI panel
- Pro přesnější výsledek použij čistý černobílý výkres bez stínů
- AI vrací rohový bod profilu – program dopočítá tečné oblouky
- Můžeš upravit JSON před vložením do výkresu

### Pointer Events
- Kolečko myši = zoom
- Prostřední tlačítko / prostor + myš = pan
- Dvojité kliknutí na objekt = dialog vlastností
- Klik + drag na prázdno = výběr větvím

---

## Řešení problémů

### Plátno se nezobrazuje
- Zkontroluj, zda používáš statický server (nelze `file://`)
- Zkontroluj konzoli prohlížeče na chyby

### CAM simulátor nefunguje
- Ujisti se, že máš definovanou **konturu** a **polotovar**
- Kontura musí být uzavřená
- Polotovar musí být kružnice

### DXF se nenačte
- Zkontroluj velikost souboru (max 10 MB, max 10 000 entit)
- Některé DXF prvky nemusí být podporovány

### AI panel neodpovídá
- Zkontroluj API klíč v Nastavení → AI nastavení
- Pro Groq/Gemini potřebuješ vlastní API klíč
- Fotka musí být dostatečně kvalitní

---

_Vytvořeno pro soustružníky, algoritmizéry a CAD nadšence._
