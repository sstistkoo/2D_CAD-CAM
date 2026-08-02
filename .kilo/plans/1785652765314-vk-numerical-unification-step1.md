# Krok 1: Sjednocení VK a Číselného zadání do jednoho modálu se záložkami

## Cíl

Sloučit 📐 VK Kontura a 🔢 Číselné zadání objektu do jednoho okna se dvěma záložkami. VK modal slouží jako základní platforma (větší okno, komplexnější layout). Číselný vstup se přesune jako druhá záložka dovnitř.

## Změny v souborech

### 1. `js/calculators/vkContour.js` – přepsání `openVkContour()`

**Co se mění:**
- Funkce `openVkContour()` se přejmenuje na `openCombinedModal()` (nebo se ponechá název a přidá se nová funkce)
- Odstraní se vlastní VK canvas (`<canvas class="vk-canvas-placeholder">`) a celá sekce `vk-canvas-wrapper`
- Do `calc-body` se vloží záložkový panel s dvěma záložkami:
  - **Záložka 1:** `📐 VK Kontura` – existující VK formulář (bez canvas, bez řešiče preview)
  - **Záložka 2:** `🔢 Číselný vstup` – obsah z `numericalInput.js` (adaptovaný)
- Nad záložkami se zobrazí společný titlebar s tlačítkem zavření

**Co se zachovává:**
- Celá VK logika (solver, parsing, stav řetězce, localStorage)
- VK formulář (VL/VKr/VPOL toggle, PA/PR/X/Z/?, T checkbox, gcode textarea)
- Convert to ISO G-kód, copy, clear
- VK navigační tlačítka (◀ ▶) pro prohlížení nedořešených prvků

**Odstranit z VK obsahu (přesunuto do kroku 2):**
- `<div class="vk-canvas-wrapper">` s canvasem a label
- `<div class="vk-solution-picker">` (řešič variant – přesunout do VK záložky později, krok 2)
- `renderVkCanvas()`, `ensureCanvas()`, `clearCanvas()`, `computeCanvasLayout()` a všechny VK canvas funkce
- Wheel/pan/click listenery na VK canvasu
- `fitViewportToPreview()`, `scheduleRender()`, `renderFrame`

**Poznámka:** Funkce `zoomVkViewport()`, `screenToVkPoint()`, `panVkViewport()`, `pickVkAmbiguousSolution()` se v kroku 1 **nepoužívají** (canvas je odstraněn), ale **zachovávají se v souboru** `vkContour.js` pro použití v kroku 2.

### 2. Nový soubor: `js/dialogs/combinedModal.js`

**Účel:** Společný wrapper pro oba modály. Zde se vytváří overlay s záložkami.

**Struktura:**
```
export function showCombinedModal(initialTab = 'vk') {
  // Vytvoří calc-overlay s calc-window
  // Obsah:
  //   - titlebar: "VK – Volná kontura / Číselný vstup"
  //   - tab-bar: [VK Kontura] [Číselný vstup]
  //   - tab-content: dvě sekce, viditelná pouze aktivní
  // VK sekce: inline HTML z vkContour.js (bez canvas)
  // Číselný vstup sekce: inline HTML z numericalInput.js
}
```

**Klíčové detaily:**
- Overlay typ: `calc-overlay` (z-index 200, backdrop, centered)
- `makeOverlay()` z `dialogFactory.js` se volá pro vytvoření okna
- Záložky se přepínají třídou `.tab-active` na aktivní záložce
- Číselný vstup má svůj vlastní `input-dialog` wrapper uvnitř záložky
- VK záložka má svůj `vk-section` wrapper uvnitř záložky

### 3. `js/dialogs.js` – barrel export

**Změna:** Přidat export nové funkce:
```js
export { showCombinedModal } from './dialogs/combinedModal.js';
```

Zachovat staré exporty pro zpětnou kompatibilitu (zakomentované):
```js
// export { showNumericalInputDialog } from './dialogs/numericalInput.js';
// Pozn.: openVkContour se NEdává do dialogs.js – je importován přímo v ui.js z ../calculators/vkContour.js
```

Staré importy v `events.js`, `touch.js`, `ui.js` se přepíší na `showCombinedModal`.

### 4. `js/ui.js` – spouštěče

**Změna:** Tlačítko `btnOpenVk` (nové, text "VK", nahrazuje `btnNumInput` i starý `btnOpenVk`) volá `showCombinedModal('vk')`.
```js
document.getElementById("btnOpenVk").addEventListener("click", () => showCombinedModal('vk'));
```

**Poznámka:** ID `btnNumInput` se mění na `btnOpenVk`. Všechny JS reference na `btnNumInput` (v `events.js`, `touch.js`, `ui.js`) se aktualizují na `btnOpenVk`. Staré `btnNumInput` se odstraní z CAD toolbaru – jeho funkce je nahrazena záložkou Číselný vstup uvnitř combined modálu.

### 5. `js/touch.js` – mobilní spouštěč

**Změna:** Mobilní tlačítko `mobileNumInput` (🔢) se přejmenuje na `mobileVk` (text "VK") a volá `showCombinedModal('vk')`.
```js
// Původní:
document.getElementById("mobileNumInput").addEventListener("click", showNumericalInputDialog);
// Nové:
document.getElementById("mobileVk").addEventListener("click", () => showCombinedModal('vk'));
```

**Poznámka:** ID tlačítka v HTML (line 60) se mění z `mobileNumInput` na `mobileVk`.

### 6. `js/events.js` – spouštěč z klávesnice

**Změna:** Zkratka pro číselný vstup (dosud `showNumericalInputDialog()`) se nahradí `showCombinedModal('num')`.
```js
// Původní:
showNumericalInputDialog();
// Nové:
showCombinedModal('num');
```

### 7. `css/style.css` – CSS změny

**Přidat:**
- `.combined-modal` – wrapper pro záložkový layout
- `.tab-bar` – horizontální řádek záložek
- `.tab-btn` – tlačítko záložky (aktivní/inaktivní stav)
- `.tab-content` – obsah záložky (viditelný/skrytý)
- `.tab-content.active` – viditelná záložka
- Adaptace `.input-dialog` pro použití uvnitř `calc-window` (změna max-width, padding)
- `.vk-section` bez canvasu – kompaktní layout

**Mobilní pozicionování modálu:**
- Na mobilu (max-width 768px) se modal nezobrazuje jako centered overlay, ale jako pevný panel na spodní části obrazovky
- Výška: cca 40vh od spodního okraje (nad bottom barem)
- Šířka: 100% viewportu
- `overflow-y: auto` – scrollovatelný obsah, canvas zůstává viditelný nad ním
- `z-index: 250` (nad bottom barem, pod tooltipy)
- `pointer-events: none` na overlay, `pointer-events: auto` na modal okno
- Na desktopu zůstává centered overlay jako v původním `calc-overlay`

**Upravit:**
- `.calc-window` – přidat `max-width: 700px` pro accommodate obě záložky
- `.calc-body` – přidat `overflow-y: auto` a flexbox pro záložkový obsah
- Přidat media query `@media (max-width: 768px)` pro mobilní modal layout

### 8. `js/dialogs/numericalInput.js` – adaptace

**Změny:**
- Funkce `showNumericalInputDialog()` se přejmenuje na `renderNumericalTab()` a vrátí HTML string (ne vytváří overlay)
- Nebude více vytvářet vlastní overlay – vrací HTML string nebo přímo manipuluje DOM uvnitř poskytnutého containeru
- `pickFromMap()` listenery na `drawCanvas` se zachovají (fungují na hlavním CAD canvasi)
- Všechny ostatní logiky (formulář, výpočet délky/úhlu, chain, polyline) zůstávají beze změny

**Odstranit:**
- Volání `makeInputOverlay()` – okno je nyní součástí VK modálu
- Přidání overlay do `document.body` – overlay je již vytvořen v `combinedModal.js`

### 9. `js/calculators/vkContour.js` – čistka

**Odstranit funkce, která nejsou potřeba v kroku 1:**
- `renderVkCanvas()` a všechny pomocné funkce pro canvas (kromě těch potřebných pro VK formulář)
- `zoomVkViewport()`, `screenToVkPoint()`, `panVkViewport()`
- `pickVkAmbiguousSolution()`
- `buildAmbiguousSolutionPreview()`
- `ensureCanvas()`, `clearCanvas()`, `computeCanvasLayout()`, `drawGrid()`, `drawPlaceholder()`, `drawVkPreview()`
- Wheel/pan/pointer listenery na canvasu
- `fitViewportToPreview()`
- `scheduleRender()`, `renderFrame`

**Zachovat:**
- `openVkContour()` → přejmenovat na `showVkTab()` nebo inline do `combinedModal.js`
- `fmt()`, `buildVkVpolLine()`, `upsertVkVpolLine()`, `parseVkLine()`
- `resolveVkArcGeometry()`
- `polarDelta()`
- `insertTangentTransitions()`
- Celá řešič logika (kategorie 1-4)
- `loadVkFieldValues()`, `saveVkFieldValues()`
- Celý řetěz prvků (`startPoint`, `vpolPoint`, `lastPoint`, `pendingQueue`, `firstElement`, `cursor`, `chainStarted`)
- Všechny event listenery pro VK formulář (element btn, nav prev/next, remove, vpol, toggle, convert, clear, copy)
- `resetChain()`, `resetFormToNewEntry()`, `updateFormMode()`, `loadElementIntoForm()`, `setFieldValueOrRestore()`
- `refPoint()`, `pickOrThrow()`, `resolveOne()`, `resolveTwo()`, `resolveThree()`, `firstElementAnchor()`, `patchLine()`, `appendCode()`
- `toSolverX()`, `fromSolverX()`

### 10. `index.html` – přesun tlačítka VK do CAD toolbaru, přejmenování a aktualizace nápovědy

**Změna:** Přesunout `btnOpenVk` z CAM panelu (`calcMorePanel`, line 1954) do CAD toolbaru (topbar), a přejmenovat ikonu na "VK" (bez emoji 🔢 ani 📐). Současně přejmenovat `btnNumInput` na `btnOpenVk` (stejné ID). Aktualizovat help overlay (line 4282). Aktualizovat `mobileBottomBar` (line 60).

**Odstranit** z CAM panelu (v `calcMorePanel`):
```html
<button id="btnOpenVk" class="calc-launch-btn" ...>
  <span class="calc-launch-icon">📐</span>
  <span>VK Kontura</span>
</button>
```

**Upravit** `btnNumInput` v CAD toolbaru (topbar, line 1358) na VK spouštěč:
```html
<button
  class="tool-btn mobile-hide"
  id="btnOpenVk"
  title="VK – Volná kontura / Číselní vstup"
>
  VK
</button>
```

**Upravit** mobilní tlačítko v `mobileBottomBar` (line 60):
```html
<button
  id="mobileVk"
  aria-label="VK"
  title="VK – Volná kontura / Číselní vstup"
>
  VK
</button>
```
(Původní `mobileNumInput` se přejmenuje na `mobileVk`.)

**Upravit** help overlay (line 4282):
```html
<summary><span class="tool-icon">VK</span> VK Kontura</summary>
```

**Poznámka:** Dnešní `btnNumInput` (🔢) a `btnOpenVk` (📐) se sloučí do jednoho tlačítka `btnOpenVk` s textem "VK". Toto tlačítko spouští `showCombinedModal()` s výchozí záložkou `'vk'`. Číselný vstup je pak druhá záložka uvnitř tohoto modálu. Všechny JS reference na `btnNumInput` a `mobileNumInput` se aktualizují na `btnOpenVk` a `mobileVk`.

## Pořadí implementace

1. Vytvořit `js/dialogs/combinedModal.js` – společný overlay a záložkový framework
2. Upravit `js/calculators/vkContour.js` – odstranit canvas, extrahovat VK formulář do funkce vracející HTML
3. Upravit `js/dialogs/numericalInput.js` – extrahovat formulář do funkce vracející HTML, odstranit vlastní overlay
4. Upravit `js/dialogs.js` – přidat export `showCombinedModal`
5. Upravit `js/ui.js`, `js/touch.js`, `js/events.js` – změnit spouštěče
6. Upravit `css/style.css` – přidat záložkové styly, upravit rozměry oken
7. Spustit `npm test` – ověřit, že nic se nezlomilo

## Open otázky

1. **Záložkový design** – má být titlebar společný (s názvem aktivní záložky) nebo každý tab má svůj název v titlebaru?
2. **Šířka okna** – 700px dostatečné pro oba obsahy? Číselný vstup má `min-width: 400px`, VK formulář je širší.
3. **Výška okna** – VK formulář je dlouhý (scrollable). Má být `max-height: 95vh` s `overflow-y: auto` na `calc-body`?
4. **Zpětná kompatibilita** – zda ponechat staré `showNumericalInputDialog()` a `openVkContour()` jako aliasy pro jiné volače (např. `touch.js`, `events.js`), nebo je přepsat všechny najednou?
5. **VK řešič (solver)** – zda se řešič (kategorie 1-4, VPOL1/VPOL2) nachází v VK záložce nebo je zvlášť? V kroku 1 ho umístit do VK záložky.