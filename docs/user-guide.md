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
- **Kreslení** – Úsečka, Konstr. čára, Kružnice, Oblouk, Obdélník, Polyline, Text
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
- Souřadnice kurzoru
- Přiblížení (zoom)
- Nápověda (aktuální nástroj)
- Tlačítka: Undo, Redo, Nápověda, Nastavení, Sinumerik 840D

### Mobilní ovládání
- Spodní lišta s hlavními tlačítky
- Tlačítko ☰ boční panel
- Long-press na prázdné místo → precision křížek (numerický vstup)
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
