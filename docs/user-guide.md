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
- **Průsečíky** – automaticky vypočítané průsečíky
- **Vrstvy** – správa vrstev
- **Vlastnosti** – barva, tloušťka, styl čáry, čárkovaná
- **Nastavení** – mřížka, úhlové snap, kóty, okraje, autom. středy, číslování, osa Y

### Dolní lišta (status bar)
- Aktuální nástroj
- Indikátory stroje/souřadnic: SOU/KAR (typ stroje), ABS/INC, R/⌀ (zobrazení osy X)
- Přiblížení (zoom)
- Indikátory mřížky/úhlu/kót (# ∠ 📐) – zobrazí se jen když je daná funkce aktivní
- Tlačítka: ⊕ Centr (vycentrovat výkres), 🔢 (zadání objektu – číselně / VK
  kontura), ⚙️ Nastavení

### Mobilní ovládání
- Spodní lišta s hlavními tlačítky
- Tlačítko ☰ boční panel
- Long-press na prázdné místo na CAD plátně → precision křížek (numerický vstup)
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
1. Vyber **Offset**
2. Klikni na objekt
3. Zadej vzdálenost v dialogu
4. Vytvoří se nový paralelní objekt

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
- Smazáním objektu smaž i jeho kóty

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
2. Zadej: průměr, stoupání, forma (A/B/C), délka
3. Zvol metrika / technologický závit
4. Vznikne profil závitu

### Zápich (DIN 76/509)
1. Vyber **Zápich**
2. Klikni na bod osy
3. Zadej průměr a rohový úhel
4. Vytvoří se zápichová geometrie

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

### 3b. Více operací na jednom kuse (➕ Operace)
Jeden díl se často obrábí na několik operací: nejdřív se vyhrubuje jedním
nožem, pak se jiným udělají drážky, zápich nebo závit. V liště nad G-kódem
je na to tlačítko **➕ Operace**.

1. Vygeneruj dráhy první operace (**🔄 Dráhy**) jako obvykle.
2. Klikni na **➕ Operace**. Dosavadní dráhy se uzavřou jako **Část 1** a
   zmizí z plátna. Zůstane kontura a **polotovar obrobený předchozí částí** —
   program si tedy pamatuje, co už se odebralo, a další operace na tom staví.
3. V pravém panelu (**⚙ Nast.**) si vyber jiný nůž a nastav parametry i
   **rozsah obrábění** (📏) jen na tu část dílu, kterou chceš dělat.
4. Klikni **🔄 Dráhy** — vygeneruje se **další část** programu. Kroky 2–4
   opakuj, kolikrát potřebuješ.

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

### 5. Export
- **Stáhnout** – ulož `.MPF` soubor
- **Kopírovat** – zkopíruj do schránky
- **Export CNC kódu** – zpět do panelu

### Geometrie nástroje (destička + držák)
V záložce **Parametry → Nástroj** otevři **⚙️ Geometrie** — modal s živým 2D
náhledem destičky a držáku. Obsah je rozdělený do dvou přepínatelných
pod-záložek (**🔩 Destička** / **🗜 Držák**) pod náhledem:
- **↩ / ↪** vedle nadpisu — vrátí/znovu provede poslední změnu udělanou v
  tomto dialogu (sdílí historii s hlavním CAM Simulátorem).
- **Náhled lze přiblížit/oddálit** kolečkem myši nebo tlačítky **＋ / － / ⟲**
  (reset), a posunout tažením. Popisky ε (vrcholový úhel) a natočení přímo v
  náhledu jsou klikací — klik přepne na pod-záložku Destička a rovnou zaostří
  dané pole k úpravě.
- Dlouhý dřík držáku (velké l1) se v náhledu kreslí zkrácený se standardní
  značkou přerušení (klikatý zlom), ať nezabírá většinu výšky náhledu —
  skutečná hodnota l1 zůstává beze změny v poli i v popisce.
- **Destička (VBD)**: tvar (kulatá/čtyřstranná/zápichová/závitová), délka
  hrany, polární úhel, vrcholový úhel (ε) a rádius (R); dekódování VBD kódu.
  U čtyřstranné (polygon) destičky se úhel ε dá otevřít na dvě strany od
  polárního úhlu — pokud náhled ukáže destičku obráceně, tlačítko **⇄ Přehodit
  stranu** ji překlopí bez nutnosti přepočítávat úhly ručně.
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
  ukončíš ho jen dolní lištou: **✕ Zrušit** / **✓ Potvrdit** (a **⇄ Strana**).
  Během kreslení nelze přepnout do CAM (jen upozornění). Při **✓ Potvrdit** se
  obrys uloží do držáku dvěma způsoby:
  - **Celý uzavřený obrys** kolem destičky → použije se přímo.
  - **Jen dvě strany** (otevřená lomená čára) → automaticky se uzavře pod 45°
    dle polí **Délka držáku (l1)** a **Tloušťka držáku**; tlačítkem **⇄ Strana**
    přepínáš, který konec se doplňuje (auto → A → B).
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

Ruční kreslení v dialogu (✏️) je zatím podporované jen pro kulatou a
čtyřstrannou destičku; kreslení na CAD plátně (📐) zvládá i upichovák.

### Knihovna nožů (nůž v projektu)
Geometrie nástroje (destička + držák) se ukládá do **projektu** (JSON). Při
načtení projektu se nůž automaticky **přenese do CAM** (do živého i příště
otevřeného simulátoru), takže si projekty můžeš ukládat jako knihovnu nožů.

### Obrábění po úsecích (rozsah Z 📐)
**Rozsah obrábění Z** neomezuje jen řezné pohyby — pro podélné hrubování
ořezává i **geometrii polotovaru, ze které se dráhy plánují**. Co je mimo
rozsah, jako by pro plánování neexistovalo: hloubková posloupnost se odvozuje
z vrchu polotovaru **uvnitř** rozsahu a vjezdy míří na povrch, který tam
skutečně je. Díl si tak můžeš rozdělit na úseky a každý odhrubovat zvlášť
stejnou logikou — hotová část vedle už do plánování nemluví.

**Kolize se hlídají dál proti celému polotovaru.** Obálka držáku, validátor
kolizí i model úběru pracují s neořezanou geometrií, takže nástroj do materiálu
za hranicí rozsahu nenarazí (typicky se kvůli němu posune start zanoření — viz
níž).

**U čelního hrubování vybírá rozsah Z přímo VRSTVY** — marchuje se v ose Z,
takže je to přesný protějšek toho, jak rozsah X vybírá hloubky v podélném
hrubování. Krajní vrstva pásu odskakuje **svisle v ose X** místo obvyklé
diagonály: za hranicí pásu tahle operace neobrábí, takže tam materiál pořád
stojí a diagonální odskok by do něj zajel.

**Rozsah obrábění X** drží u čelního hrubování **dno řezu** — nástroj nesjede
pod dolní mez. Horní mez se čelně vynutit nedá: řez jde radiálně od povrchu
k ose, takže materiál nad ní nástroj projede tak jako tak. (Podélně platí obě
meze, protože tam se dá celá hloubka přeskočit.)

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

### CAM tipy
- Používej **Sjednocený směr** pro konzistentní G2/G3
- Pokud se nástroj nevejde do oblouku, zkrať šířku řezu
- Aktivuj **Zrcadlení** pro oboustranné obrábění
- **Kontury** používej pro hrubování, **Profily** pro dokončování

---

## CNC kalkulačky

Přístup: **☰ Nastavení** → **Kalkulačky** nebo přímo z toolbaru.

### Dostupné kalkulačky
- **Řezné podmínky** – otáčky, posuv, výkon
- **Zkrácení / prodleva** – doba obrábění
- **Tolerance** – tolerance dle DIN ISO 286
- **Hmotnost** – hmotnost prutů
- **Taper** – kuželové zkrácení
- **Závity** – převodné tabulky
- **Převody** – jednotky (mm/inch, RPM/SFM)
- **VK Kontura** – editor volné kontury (obdoba Heidenhain FK): zápis prvku
  úsečka/oblouk s neznámými rozměry (`?`), polárně k pólu (VPOL), s přehledem
  syntaxe a převodem doplněného zápisu na ISO G-kód.
  Otevírá se ve **sdíleném okně „Zadání objektu"** – druhá záložka je
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
  nástroje (okno se zavírá **✕**). Na mobilu zabírá spodní polovinu
  displeje, druhá polovina zůstává na plátno.

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

### Uložit jako
1. Klikni **☰** → **Uložit projekt**
2. Zadej název projektu
3. Stáhne `.skica_projekt.json` soubor

### Načíst projekt
1. Klikni **☰** → **Načíst projekt**
2. Vyber `.skica_projekt.json`
3. Nebo přetáhni soubor přímo do okna

### Export PNG
- ☰ → **Export obrázku** – stáhne `.png` aktuálního výkresu

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
