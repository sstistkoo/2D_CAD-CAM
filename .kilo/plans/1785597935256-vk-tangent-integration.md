Dvě samostatná modalní okna
Vlastnost	🔢 Číselné zadání	📐 VK Kontura
Soubor	js/dialogs/numericalInput.js	js/calculators/vkContour.js
Spouštěč	btnNumInput (v CAD toolbar)	btnOpenVk (v CAM panelu)
Overlay typ	input-overlay (z-index 100)	calc-overlay (z-index 200)
Vlastní canvas	Ne – používá hlavní drawCanvas pro „pick from map"	Ano – <canvas class="vk-canvas-placeholder"> uvnitř modálu (440×120/140px)
Souřadnicový systém	World (wx, wy) ↔ screen přes screenToWorld()	VK (x=průměr, z=hloubka) ↔ pixel přes vlastní computeCanvasLayout()
Zoom/Pan	Žádný (pick z mapy je jeden klik)	Vlastní wheel + drag na svém canvasu
Persistenca	state.numDialogChain	localStorage klíč skica-vk-contour
Rozhraní	Dialog s formulářem + tlačítka „🎯" pro výběr z mapy	Editor syntaxe + náhled canvas + řešič
Canvas systém
Hlavní CAD canvas (drawCanvas v js/canvas.js) má:

worldToScreen(wx, wy) / screenToWorld(sx, sy) – převod mezi world a screen souřadnicemi
renderAll() – překreslení celého výkresu po každé změně stavu
state.drawing, state.tempPoints – dočasný stav pro kreslení
state.mouse – aktuální pozice kurzoru se snap bodmi
VK má vlastní canvas s vlastním projektováním (project() funkce v vkContour.js), který je zcela izolovaný od CAD canvasu.

Striktní názor na plán
Krok 1: Sjednocení modalů do jednoho okna s dvěma záložkami
Problém: Oba modály vypadají fundamentally odlišně – input-overlay vs calc-overlay, odlišná škálování, odlišný layout, odlišné CSS proměnné. Sdílený overlay s dvěma záložkami vyžaduje:

Jednotný wrapper – vytvořit nový overlay typ, nebo přepsat oba modály na společný základ. Nejjednodušší je použít makeOverlay() (calc-overlay) jako základ a do něj vložit oba obsahy jako záložky.
CSS унификace – input-dialog má pevné min-width: 320px; max-width: 480px, zatímco VK okno je širší a obsahuje canvas. Záložkový rozhraní potřebuje flexibilní výšku.
Skrytí canvas v VK – odstranění <canvas class="vk-canvas-placeholder"> z VK obsahu je jednoduché, ale je nutné zajistit, že VK náhled bude renderován někde jinde (viz krok 2).
Barrel export – js/dialogs.js potřebuje novou exportní funkci, např. showCombinedModal() nebo showNumericalInputDialog() a openVkContour() budou volat společný wrapper.
Doporučení: Vytvořit nový soubor js/dialogs/combinedModal.js se společným overlayem a dvěma záložkami. Zde je struktura:

[Overlay calc-overlay]
  └── [calc-window combined-window]
       ├── [titlebar] "🔢 Objekt / 📐 VK Kontura"
       ├── [tab bar]  [Číselný vstup] [VK Kontura]
       └── [tab-content]
            ├── [tab 1] numericalInput.js obsah (bez změn)
            └── [tab 2] vkContour.js obsah (bez canvas, bez řešiče preview)
Krok 2: Modal na CAD canvas – pohyblivý a spolupracující
Toto je nejtěžší krok a zde vidím největší rizika.

Problém A: Blokování canvasu Oba overlay typy (input-overlay, calc-overlay) jsou position: fixed se top:0; left:0; right:0; bottom:0 a z-index: 100/200. Blokují veškeré kliknutí na canvas pod nimi. Řešení:

Nastavit pointer-events: none na overlay a pointer-events: auto na okno modálu. Tím canvas pod modalem zůstane interaktivní.
Riziko: VK náhled (který by se renderoval na CAD canvas) by byl pod modálem a kliknutí na něj by šly přes modal.
Problém B: VK preview na CAD canvasu VK momentálně kreslí na svůj vlastní malý canvas s vlastním zoom/pan. Přesunout VK preview na hlavní CAD canvas znamená:

VK preview se musí vykreslit v renderAll() jako vrstva nad ostatními objekty.
VK má vlastní souřadnicový systém (X=průměr, Z=hloubka) – tento se musí mapovat na CAD world souřadnice.
VK zoom/pan by musel být synchronizován s CAD zoom/pan, nebo by VK musel mít vlastní transformaci (jako teď), ale kreslit na CAD canvas.
Doporučení: Nejdříve oddělit VK logiku (solver, parsing, stav) od jeho prezentace (canvas). VK solver (vkSolver.js) je čistý – žádná vazba na canvas/state. vkContour.js by měl být refaktorován na:

Čistou logiku (parsing, solver, stav řetězce) – bez DOM
Render funkci, která přijímá canvas context a layout a kreslí na něj
Event handler pro klik na canvas
Krok 3: Integrace logiky
Problém C: Znovupoužití logiky z numericalInput.js Numerical input má logiku „pick from map" – dočasné přidání click/touch listenerů na drawCanvas. Tento vzorec lze znovu použít pro VK: uživatel klikne na CAD canvas → souřadnice se převedou na VK souřadnice (x=průměr, z=hloubka) → vloží se do VK formuláře.

Problém D: VK solver vs CAD geometrie VK solver pracuje v souřadnicích X (průměr) a Z (hloubka), což odpovídá CNC osám, ne CAD world souřadnicím (wx, wy). Mapování:

CAD wx → VK x (průměr): x = wx * 2 (pokud je X poloměr) nebo x = wx (pokud je X průměr)
CAD wy → VK z: z = wy (osy se shodují)
Toto mapování je již částečně v vkContour.js přes toSolverX()/fromSolverX().

Konkrétní doporučení a rizika
Velká rizika
Ztráta VK izolovaného canvasu – VK má vlastní zoom/pan, grid a projekci. Přesun na CAD canvas znamená, že VK preview bude ovlivněn CAD zoom/pan a všechny objekty na výkresu. VK prvky by se musely kreslit jako speciální vrstva (např. s state.showVkPreview = true).
Kolize stavu – VK má vlastní interní stav (pendingQueue, firstElement, cursor, viewport). Tento stav musí žít buď v state (globálně), nebo v uzavřeném closure modulu. Pokud se VK modal otevře a uživatel pokračuje v kreslení na CAD canvasu, stav VK nesmí interferovat s CAD kreslením.
Záložkový rozhraní – Záložky v jednom okně mohou vést k tomu, že uživatel má VK formulář otevřený a zároveň kreslí na canvasu. VK click handler na canvasu musí rozlišovat, zda je VK režim aktivní, a pokud ano, zachytit klik a vložit souřadnice do VK formuláře.
Doporučený postup realizace
Nejprve: Vytvořit společný overlay s dvěma záložkami (Krok 1). Nejdříve jen UI – bez změn na canvasu. Oba modály zůstávají nezávislé na sobě, ale jsou v jednom okně.
Poté: Odstranit VK canvas a přidat VK preview do renderAll() jako volitelnou vrstvu (Krok 2 – první část). VK preview se kreslí na CAD canvas, ale VK formulář zůstává v overlay.
Nakonec: Přidat VK click handler na CAD canvas (Krok 2 – druhá část) a propojit VK formulář s CAD canvas kliknutím (Krok 3).
Co je v plánu správně
Oddělení VK solveru (vkSolver.js) od UI (vkContour.js) je správný směr – solver je čistý a znovupoužitelný.
Znovupoužití „pick from map" logiky z numericalInput.js je správné.
Sdílení jednoho okna s dvěma záložkami je rozumné UX rozhodnutí.
Co chybí v plánu
Žádné zmínky o state – jak bude VK stav žít v globálním stavu? Potřebuje nová pole v state (např. state.vkContour = { pendingQueue: [], ... }).
Žádné zmínky o renderAll() – jak VK preview integrovat do existujícího renderovacího cyklu?
Žádné zmínky o CSS – jak sladit vizuální styl obou záložek?
Žádné zmínky o dialogs.js – jak barrel exporty upravit?
Žádné zmínky o events.js – jak canvas click handler koordinovat s otevřeným modalem?

📐 VK Kontura – Přehled
1. Otevření a funkce VK modálu
VK Kontura je přístupné z pravého panelu pod ikonou 📐 v sekci "Další kalkulačky". Otevře se jako overlay (VK_editor.html + vkContour.js). Umožňuje:

Zápis prvků ve formátu G111 (VPOL), G11 (VL), G2/G3 (VKr) s neznámými rozměry označenými jako ?
Výběr typu prvku: VL (úsečka), VKr (oblouk), VPOL (pól)
Pro oblouk: volba G2/G3 směr a poloměr R
Pro esíčko (dva tečné oblouky za sebou): zadání bodu zlomu (osa Z/X + hodnota)
VPOL – konstruční bod, kolem kterého se počítají netečné napojení (kategorie 4)
VPOL1/VPOL2 – volba řešení, když existují dva průsečíky
Kontrolka T – tečné napojení na předchozí prvek
Nápověda (lze rozbalit) se seznamem syntaxe a kombinací
Generování VK syntaxe, kopírování, a konverze na ISO G-kód
2. VK Solver (vkSolver.js) – možnosti a kategorie
Solver v js/calculators/vkSolver.js rozpoznává 4 kategorie:

Kategorie	Případy	Popis
1	case 1–4	Roh mezi dvěma přímkami/kužely (line-line intersection)
2	case 5–8	Jeden tečný oblouk daného poloměru R mezi dvěma přímkami/kužely
3	case 9–11	Dva tečné oblouky ("esíčko") mezi dvěma přímkami/kužely, s opačným prohnutím, vyžaduje známou souřadnici bodu zlomu
4	case 12–13	Netečné napojení přímka/kužel ↔ oblouk kolem VPOL (kružnice se středem ve VPOL)
Klíčové funkce solveru:

elementRay() – odvodí paprsek z prvku (úhel PA nebo směr z X/Z)
intersectRays() – průsečík dvou nekonečných paprsků
solveCornerLineLine() – kategorie 1
tangentCircleTouchPoints() – kategorie 2, case 5 (tečný bod na paprsku)
tangentCircleBetweenRays() – kategorie 2, case 6–8 (střed tečné kružnice mezi dvěma paprsky)
twoTangentArcsBetweenRays() – kategorie 3, case 9–11 (esíčko)
solveLineArcJunction() / solveLineArcJunctionCandidates() – kategorie 4
3. Tečnost na canvasu CAD (tangentClick.js)
Nástroj Tečna (📐) na canvasu podporuje tyto operace:

Bod → Kružnice: tečné úsečky z bodu ke kružnici (výběr z dialogu)
Kružnice → Kružnice: tečné úsečky mezi dvěma kružnicemi
Kružnice → Úsečka: přesun kružnice tečně k úsečce (zachování r)
Kružnice → Úsečka + Bod: přesun kružnice tečně k úsečce přes bod
Kružnice → 2 Úsečky: přesun kružnice tečně ke dvěma úsečkám
Kružnice → Kružnice + Úsečka: přesun kružnice tečně ke kružnici a úsečce
Kružnice → Kružnice + Bod: přesun kružnice tečně ke kružnici přes bod
Kružnice → 2 Kružnice: přesun kružnice tečně ke dvěma kružnicím
3 vazby (Apollonius): kružnice tečná ke třem segmentům (změní i r)
3 body: opsaná kružnice
2 body + kružnice: kružnice procházející 2 body tečná ke kružnici
4. Kreslení oblouků na canvasu (arcClick.js)
Nástroj Oblouk na canvasu:

Klik → počáteční bod
Klik → koncový bod (zobrazí se dialog pro poloměr)
Dialog ↻ Směr oblouku – volba CW/CCW s náhledem
Vytvoří objekt typu arc s cx, cy, r, startAngle, endAngle, ccw
Dále existuje nástroj Fillet/Chamfer (filletChamferClick.js):

Zaoblení (fillet) mezi dvěma úsečkami nebo úsečkou a obloukem
Zkosení (chamfer) mezi dvěma úsečkami nebo úsečkou a obloukem
Detekce rohu sdíleným endpointem dvou segmentů
5. Chyby a problémy ve VK Solveru
Na základě analýzy kódu byly nalezeny tyto problémy:

A) insertTangentTransitions – omezená funkce
Funkce insertTangentTransitions v vkContour.js (řádek 364) pouze vkládá G1 transition před obloukem, pokud předchozí prvek je konstrukční paprsek (G0 s PA, bez PR). Nepracuje s případy, kdy by tečné napojení mělo být mezi dvěma existujícími prvky v řetězci. Funkce pickTangentArcStart (řádek 342) vybírá tečný bod na paprsku pomocí tangentCircleTouchPoints, ale:

Vrací pouze jeden bod (nejbližší k směru paprsku), i když může existovat druhý platný tečný bod na druhé straně
Nepočítá s případem, že oblouk začíná na konci předchozího prvku, který není paprsek
B) resolveOne – chybějící podpora pro esíčko jako první prvek
Řádek 1373: throw new Error('tečný oblouk jako první prvek řetězu (bez předchozí přímky) zatím není podporovaný') – pokud je první prvek v řetězci tečný oblouk (kategorie 2, case 5), solver to zamítne.

C) resolveOne – dva oblouky za sebou
Řádek 1364: throw new Error('dva oblouky za sebou zatím nejsou podporované (kategorie 3)') – category 3 (esíčko) vyžaduje, aby první prvek byl přímka/kužel, nikoliv oblouk.

D) twoTangentArcsBetweenRays – degenerace při rovnoběžných osách
Řádek 327: Pokud je zadaná osa zlomu degenerovaná pro oba paprsky (oba paprsky jsou rovnoběžné s osou x nebo z), funkce vrátí prázdné pole bez chyby. Uživatel pak dostane "žádné řešení" místo užitečné zpětné vazby.

E) tangentCircleTouchPoints – duplicita výsledků
Funkce vrací body přes dedupePoints, ale deduplikace používá toleranci 1e-6, což může být příliš úzká pro geometrické výpočty s velkými poloměry, kde se dva tečné body mohou lišit o méně než 1e-6, ale stále být geometricky odlišné.

F) solveLineArcJunction – vyžaduje VPOL tag pro dvě řešení
Řádek 124: Pokud je průsečík paprsku s kružnicí kolem VPOL dvojitý a uživatel nezadá VPOL1/VPOL2, solver vyhodí chybu "Dvě možná řešení – zadejte VPOL1 nebo VPOL2". V praxi to znamená, že uživatel musí vždy zadat VPOL i pro jednoduché případy, kde by solver mohl zvolit logické řešení automaticky (např. blíže k poslednímu známému bodu).

G) buildAmbiguousSolutionPreview – pouze line-to-arc
Funkce buildAmbiguousSolutionPreview (řádek 717) pracuje pouze s případy, kde draft segment je line a předchozí prvek je známý bod. Nepodporuje:

Arc-to-arc přechody
Případy, kde draft segment je sám o sobě oblouk (VKr)
Netečné napojení (kategorie 4)
H) Konverze VK → ISO G-kód – omezená podpora PA/PR
V convertToIsoGcode (vkContour.js, řádek ~1674) je fallback mechanizmus pro PA/PR prvky, který pracuje pouze s lineárními prvky. Pro oblouky s PA/PR (kde je konec definován polárně) nedochází k automatickému dopočtu – uživatel musí ručně zadat X/Z souřadnice.

I) Chybějící validace v tangentCircleBetweenRays
Funkce tangentCircleBetweenRays v vkSolver.js (řádek 206) nekontroluje, zda se střed nalezené tečné kružnice nachází v rozumném rozsahu (např. zda neleží mimo geometrický rozumný prostor). Může vrátit středy velmi vzdálené od obrysu, což vede k nereálným řešením.

J) circlePositionsTangentToCircleAndLine – potenciální dělení nulou
V geometry.js řádek 1061: Funkce nekontroluje případ, kdy přímka prochází středem kružnice (len < 1e-9), což by mohlo vést k nekonečnému počtu řešení nebo chybě.

Shrnutí
Oblast	Stav	Poznámka
VK editor (UI)	Funkční	Podporuje VL, VKr, VPOL, G2/G3, esíčko
VK Solver – kategorie 1	✅ Funguje	Line-line intersection
VK Solver – kategorie 2 (1 oblouk)	✅ Funguje	Tečný oblouk mezi dvěma paprsky
VK Solver – kategorie 3 (esíčko)	⚠️ Částečně	Vyžaduje známou osu zlomu; degradovaná osa se přeskočí
VK Solver – kategorie 4 (VPOL)	✅ Funkční	Netečné napojení kolem VPOL
Tečnost na canvasu	✅ Rozsáhlá	15+ konfigurací (bod, kružnice, úsečka, oblouk)
Kreslení oblouků	✅ Funkční	CW/CCW výběr, 3-body
Fillet/Chamfer line+arc	✅ Funkční	Zaoblení i zkosení
Chyby solveru	⚠️ Vícero	Viz výše – hlavně v edge cases a chybových hláškách



matematika je v podstatě hotová – ale je důležité rozlišit kde co patří:

Co je již v vkSolver.js (pouze pro VK konturu):
Kategorie 1: průsečík dvou přímek/kuželů (roh)
Kategorie 2: jeden tečný oblouk daného R mezi dvěma paprsky
Kategorie 3: esíčko – dva tečné oblouky s daným bodem zlomu
Kategorie 4: netečné napojení oblouku kolem VPOL
Co je v geometry.js (obecná matematika pro canvas):
Tečné úsečky z bodu ke kružnici
Tečné úsečky mezi dvěma kružnicemi
Kružnice tečná k úsečce / ke dvěma úsečkám / ke kružnici+úsečce apod.
Fillet (zaoblení) mezi úsečkami i mezi úsečkou a obloukem
Chamfer (zkosení) mezi úsečkami i mezi úsečkou a obloukem
Klíčový rozdíl:
vkSolver.js má svou vlastní, specializovanou matematiku pro VK případy (práce v průměrech, konverze X↔R, VPOL tagy, esíčko s bodem zlomu). geometry.js má obecnou matematiku pro canvasový nástroj Tečna/Fillet/Chamfer.

Co by šlo doplnit:
Integrace canvasového tečného nástroje s VK – teď je to oddělené: na canvasu kreslíš tečnou kružnici/oblouk, ale do VK solveru to nejspěje jako nový prvek ručně.
Automatické dopočítání tečného oblouku na canvasu – když kreslíš oblouk VKr, solver by mohl na canvasu okamžitě ukázat tečné napojení k předchozímu prvku (nyní se to počítá až při vložení do VK řetězce).
Chybová zpětná vazba – solver vyhodí chybu "dvě možná řešení – zadejte VPOL1 nebo VPOL2" i v jednoduchých případech, kde by šlo logicky vybrat blíže ležící řešení automaticky.
Takže ano – matematika je hotová, ale propojení mezi canvasovými nástroji a VK solverem ještě není úplné.