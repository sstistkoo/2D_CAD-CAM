# Krok 2 a 3: Integrace VK na CAD canvasu

## Krok 2: Modal pohyblivý na canvasu + VK preview na CAD canvasu

### Cíl

- VK modal nepřekrývá celý canvas – uživatel kliká na canvas i s otevřeným modalem
- Modal je pohyblivý (drag za titlebar)
- VK preview se renderuje na hlavním CAD canvasu jako vrstva nad objekty výkresu
- VK klik na canvas vkládá souřadnice do VK formuláře v modalu

### Změny v souborech

#### 2.1 `js/dialogFactory.js` – nový typ overlayu

Přidat funkci `makeFloatOverlay()`:

```js
export function makeFloatOverlay(type, title, bodyHTML, windowClass) {
  // Stejné jako makeOverlay, ale:
  // - calc-overlay-float místo calc-overlay (bez backdrop)
  // - pointer-events: none na overlay
  // - pointer-events: auto na .calc-window
  // - okno je draggable (volá makeDraggable)
}
```

Nebo upravit existující `makeOverlay()` přidat parametr `float = false`.

#### 2.2 `js/calculators/vkContour.js` – přesun canvas logiky

**Odstranit z VK modálu:**
- Všechny VK canvas funkce (`ensureCanvas`, `clearCanvas`, `drawGrid`, `drawVkPreview`, `drawPlaceholder`, `computeCanvasLayout`, `renderVkCanvas`, `scheduleRender`)
- Wheel/pan/pointer listenery na VK canvasu
- `fitViewportToPreview()`
- `scheduleRender()`, `renderFrame`

**Poznámka:** Funkce `zoomVkViewport()`, `screenToVkPoint()`, `panVkViewport()`, `pickVkAmbiguousSolution()` zůstávají v `vkContour.js` – jsou součástí VK logiky a nepřenášejí se do `canvas.js`.

**Přidat:**
- `renderVkPreview(ctx, layout)` – funkce, která kreslí VK preview na CAD canvas
  - Přijímá `canvas 2d context` a `layout` (bounds, scale, project)
  - Kreslí: VPOL bod, segmenty (line/arc/ray), draft segment, ambiguous solutions
  - Používá stejné barvy a styly jako VK canvas
- `handleVkCanvasClick(wx, wy)` – funkce pro klik na CAD canvas z VK režimu
  - Převede world → VK souřadnice
  - Vloží do aktivního pole VK formuláře
  - Spustí `scheduleRender()` pro live preview
- `export function getVkPreviewData()` – vrátí aktuální VK preview data pro render na CAD canvasu
- `export function getVkActive()` – vrátí true/false zda je VK záložka aktivní

**Struktura VK stavu:**
VK interní stav (`pendingQueue`, `firstElement`, `cursor`, `chainStarted`, `viewport`) zůstává v `vkContour.js` uzavřený. Nové exportované funkce ho čtou jen pro render a click handling.

#### 2.3 `js/render.js` – VK preview vrstva

**Změna v `renderAll()`:**
Po vykreslení všech objektů přidat:
```js
if (state.vkPreview?.visible) {
  renderVkPreview(ctx, vkLayout);
}
```

**Nové proměnné v `state.js`:**
```js
vkPreview: {
  visible: false,
  segments: [],
  vpol: null,
  draft: null,
  ambiguousSolutions: [],
  selectedSolutionIndex: 0,
},
vkLayout: null, // aktuální layout pro VK preview na canvasu
```

#### 2.4 `js/canvas.js` – VK click handler

**Změna v `drawCanvas` click handleru:**
Před existující logikou nástrojů přidat:
```js
if (state.vkPreview?.visible && currentTab === 'vk') {
  const [wx, wy] = screenToWorld(sx, sy);
  handleVkCanvasClick(wx, wy);
  // VK klik je obsloužen, ale nástrojový click se NEdále blokuje.
  // Další zpracování nástroje pokračuje normálně.
}
```

**Poznámka:** VK klik na canvasu přidá souřadnice do VK formuláře, ale neblokuje ostatní nástroje. Uživatel může přepínat mezi VK záložkou a nástroji na toolbaru.

#### 2.5 `js/ui.js` – spouštěče

**Změna:** Tlačítko `btnOpenVk` (text "VK", nahrazuje `btnNumInput` i starý `btnOpenVk`) volá `showCombinedModal('vk')`.
```js
document.getElementById("btnOpenVk").addEventListener("click", () => showCombinedModal('vk'));
```

**Poznámka:** ID `btnNumInput` se mění na `btnOpenVk`. Všechny JS reference na `btnNumInput` se aktualizují. Po otevření VK záložky se nastaví `state.vkPreview.visible = true` a spustí se `renderAll()`.

#### 2.6 `css/style.css` – float overlay + drag + mobilní pozicionování

**Přidat:**
```css
.calc-overlay-float {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: none;
  z-index: 300;
  pointer-events: none;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.calc-overlay-float .calc-window {
  pointer-events: auto;
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: min(400px, 100vw);
  max-height: 40vh;
  border-radius: 12px 12px 0 0;
  box-shadow: 0 -4px 24px rgba(0,0,0,0.5);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.calc-overlay-float .calc-body {
  overflow-y: auto;
  flex: 1;
}
```

**Zajištění `mobileBottomBar`:**
Na mobilu má `#mobileBottomBar` `z-index` kolem 50–100. Modal overlay má `z-index: 300`, takže je nad bottom barem. Bottom bar musí zůstat kliknutelný – `pointer-events: auto` na `#mobileBottomBar` a `pointer-events: none` na `.calc-overlay-float`.

**Media query pro přepnutí mezi desktop a mobil:**
```css
@media (max-width: 768px) {
  .calc-overlay-float .calc-window {
    top: auto;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 100vw;
    max-height: 40vh;
    border-radius: 12px 12px 0 0;
  }
}
```

**Na desktopu:** modal je centered jako v původním `calc-overlay` (overridden media query).

#### 2.7 `js/dialogs/combinedModal.js` – záložkový přepínač

**Změna:** Při přepnutí na VK záložku:
1. Nastavit `state.vkPreview.visible = true`
2. Nastavit `state.vkPreview.segments` z aktuálního VK kódu
3. Spustit `renderAll()`

Při přepnutí na Číselný vstup:
1. Nastavit `state.vkPreview.visible = false`
2. Spustit `renderAll()`

#### 2.8 `js/state.js` – nový stav

Přidat:
```js
vkPreview: {
  visible: false,
  segments: [],
  vpol: null,
  draft: null,
  ambiguousSolutions: [],
  selectedSolutionIndex: 0,
},
activeModalTab: null, // 'vk' | 'num' | null
```

### Open otázky kroku 2

1. **VK klik vs. normální nástrojový klik** – má VK klik na canvasu aktivovat VK režim (vkládání bodů) i když je vybraný jiný nástroj? Nebo se VK režim aktivuje jen když je VK záložka otevřená?
2. **VK preview rozlišení** – VK preview na CAD canvasu se kreslí stejně jako ostatní objekty. Má být viditelný i při zoom/pan? Ano – stejně jako pomocné prvky (dimenze, konstrukční body).
3. **Více VK oken** – zda povolit více VK modalů najednou? Doporučeno: NE, jedno okno.
4. **Záložkový přepnutí** – zda se VK preview skryje při přepnutí na Číselný vstup? Ano.

---

## Krok 3: Plná integrace VK logiky na CAD canvasu

### Cíl

- VK prvky se kreslí přímo na CAD canvasu jako objekty výkresu
- VK solver pracuje na CAD world souřadnicích
- VK kontura se stane součástí výkresu (exportovatelná do G-kódu)
- Zrušení VK canvasu je kompletní – VK žije jen na CAD canvasu

### Změny v souborech

#### 3.1 `js/calculators/vkContour.js` – VK jako objekt výkresu

**Nová funkce `commitVkToDrawing()`:**
- Přečte aktuální VK kód z formuláře
- Parzuje segmenty (použít `buildVkPreviewData()`)
- Pro každý segment vytvoří objekt v `state.objects`:
  - Line segment → `{ type: 'line', x1, y1, x2, y2, name: 'VK-L${n}', layer: 'kontura' }`
  - Arc segment → `{ type: 'arc', cx, cy, r, startAngle, endAngle, ccw, name: 'VK-A${n}', layer: 'kontura' }`
  - Ray (G0) → `{ type: 'line', x1, y1, x2, y2, name: 'VK-G0-${n}', layer: 'kontura', dashed: true }`
- Přidá `pushUndo()` před commitem
- Spustí `calculateAllIntersections(); renderAll();`
- Vyčistí VK formulář a stav

**Mapování VK → CAD souřadnice:**
VK souřadnice (X = průměr, Z = hloubka) se převádějí na CAD world (wx, wy) přes existující transformace v `canvas.js`:
- CAD wx = VK x / 2 (pokud je X průměr) nebo VK x (pokud je X poloměr), s ohledem na `state.xDisplayMode`
- CAD wy = VK z
- Pozor na `state.flipX`, `state.flipZ`, `state.machineType` (soustruh vs. karusel) – použít existující `worldToScreen()` / `screenToWorld()` z `canvas.js` pro konzistentní mapování.

#### 3.2 `js/calculators/vkSolver.js` – rozšíření o CAD souřadnice

**Změna:** `vkSolver.js` pracuje interně s X jako průměrem. Přidat wrapper funkce:
- `toCAD(wx, wz)` → `{ x: wx * 2, z: wz }` (CAD → VK)
- `fromCAD(vx, vz)` → `{ wx: vx / 2, wz: vz }` (VK → CAD)

Nebo: `vkContour.js` spravuje konverzi, `vkSolver.js` zůstává čistý.

#### 3.3 `js/calculators/vkContour.js` – VK jako nástroj kreslení

**Nový režim – přepínání mezi VK editací a normálním nástrojem:**
VK záložka v modálu má dva režimy:
- **Režim A (výchozí):** VK klik na canvasu vloží souřadnice do VK formuláře (stejný vzorec jako "pick from map" v numericalInput.js). Ostatní nástroje přesto fungují.
- **Režim B (kreslení):** VK klik na canvasu přidává body do VK kontury. Po dokončení kontury se VK prvky commitují jako objekty výkresu.

Režim se přepíná v záložce VK (tlačítko "Kreslit" / "Vložit do formuláře").

**Implementace:**
- Nový stav `state.vkInputMode = 'form' | 'draw'` (výchozí: `'form'`)
- VK klik handler zkontroluje `state.vkInputMode`:
  - `'form'` → vloží souřadnice do VK formuláře (stejně jako v kroku 2)
  - `'draw'` → přidá bod do VK kontury (nový bod do `pendingQueue`)
- Režim `'draw'` **nepoužívá** `state.drawing` – používá vlastní `state.vkInputMode`
- Po dokončení kontury: `commitVkToDrawing()` vytvoří objekty v `state.objects`

**Tento krok je volitelný a závisí na rozhodnutí z kroku 2.** Pokud se VK zachovává jen jako editor syntaxe (ne kreslicí nástroj), krok 3 se přesouvá na pozadu.

#### 3.4 `js/render.js` – VK prvky jako součást výkresu

**Změna:** VK prvky se kreslí stejně jako ostatní objekty (`renderAll()` je volá `renderObjects()`). VK objekty mají `isVk = true` flag pro vizuální odlišení (např. jemnější šedá, tečkovaný okraj).

#### 3.5 `js/objects.js` – VK objekty

**Změna:** `addObject()` akceptuje `isVk: true` flag. VK objekty se chovají jako normální objekty výkresu (klik, výběr, mazání, dimenze).

#### 3.6 `js/dxf.js` – VK export do DXF

**Změna:** VK objekty se exportují jako normální LINE/ARC do DXF.

#### 3.7 `js/calculators/camSimulator.js` – VK v CAM

**Změna:** VK objekty na výkresu se berou jako součást kontury pro CAM generování. VK syntaxe se konvertuje na standardní G-kód pro CAM pipeline.

### Open otázky kroku 3

1. **VK jako editor vs. kreslicí nástroj** – VK má být stále editor syntaxe (FK-styl) nebo se stane kreslicím nástrojem na canvasu? Doporučeno: zůstat editor syntaxe (krok 3a), kreslicí nástroj je samostatná epická úprava.
2. **VK objekty vs. G-kód export** – VK objekty na výkresu se exportují jako G-kód přímo, nebo se VK syntaxe konvertuje na ISO G-kód a ten se exportuje? Doporučeno: zachovat VK syntaxe jako mezičlánek, convert na ISO G-kód jako výstup.
3. **VK a CAM pipeline** – VK objekty na výkresu se berou jako kontura pro CAM? Nebo VK zůstává samostatný a CAM bere jen normální objekty? Doporučeno: VK objekty se berou jako kontura, CAM je rozšíří o VK specifické kódy (G111, PA, PR, T).
4. **Zpětná kompatibilita** – existující VK kód v localStorage se přenese do nového systému? Ano, `loadVkFieldValues()` a `localStorage.getItem('skica-vk-contour')` se zachovají.

---

## Shrnutí pořadí

| Krok | Popis | Závislosti |
|---|---|---|
| **2.1** | `makeFloatOverlay()` / `calc-overlay-float` | Krok 1 hotov |
| **2.2** | `vkContour.js` – přesun canvas logiky, export `renderVkPreview()` | 2.1 |
| **2.3** | `render.js` – VK preview vrstva | 2.2 |
| **2.4** | `canvas.js` – VK click handler | 2.2 |
| **2.5** | `state.js` – `vkPreview` stav | 2.3, 2.4 |
| **2.6** | `css/style.css` – float overlay + drag | 2.1 |
| **2.7** | `combinedModal.js` – záložkový přepínač s render control | 2.5, 2.6 |
| **2.8** | Test: VK preview na CAD canvasu, klik, drag | 2.7 |
| **3.1** | `vkContour.js` – `commitVkToDrawing()` | Krok 2 hotov |
| **3.2** | `vkSolver.js` – wrapper CAD↔VK konverze | 3.1 |
| **3.3** | `render.js` – VK objekty jako součást výkresu | 3.1 |
| **3.4** | `objects.js` – `isVk` flag | 3.3 |
| **3.5** | `dxf.js` – VK export | 3.4 |
| **3.6** | CAM pipeline – VK v kontuře | 3.5 |
| **3.7** | Test: VK objekty na výkresu, export, CAM | 3.6 |