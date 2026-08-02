# Krok 1: Sjednocení VK a Číselného zadání do jednoho modálu se záložkami

## Cíl

Sloučit 📐 VK Kontura a 🔢 Číselné zadání objektu do jednoho okna se dvěma záložkami.
VK modal slouží jako základní platforma. Číselný vstup se přesune jako druhá záložka dovnitř.

## Rozhodnutí (před implementací)

| Otázka | Rozhodnutí |
|---|---|
| Záložkový design | Společný titlebar s dynamickým názvem podle aktivní záložky |
| Šířka okna | `max-width: 700px` (desktop), `100vw` (mobil) |
| Výška okna | `max-height: 90vh`, `overflow-y: auto` na `.calc-body` |
| Zpětná kompatibilita | Nahradit všechny volače najednou, staré funkce neponechávat |
| VK řešič | Zůstává v VK záložce |
| `makeOverlay` | Rozšířit existující `makeOverlay(type, title, bodyHTML, windowClass, float)` parametrem `float` |

## Architektura: oddělení HTML od listenerů

Oba existující dialogy (`openVkContour`, `showNumericalInputDialog`) mají desítky
event listenerů uvnitř closure. Čistý přístup:

1. Extrahovat **HTML generátor** — funkce vrací `{ html, init(container) }`
2. `init(container)` přijme DOM container a připevní všechny listenery + inicializuje stav
3. `combinedModal.js` vloží HTML do záložky, pak zavolá `init()` na správný container

Tím se oddělí generování HTML od DOM manipulace a udržitelnost se zachová.

## Změny v souborech

### 1. `js/calculators/vkContour.js` – extrakce `showVkTab()`

**Rozdělení `openVkContour()` na dvě části:**

```js
// HTML generátor (čistá funkce, žádné side-effects)
export function showVkTab() {
  const xUnitLabel = state.xDisplayMode === 'diameter' ? 'Průměr' : 'Poloměr';
  return {
    html: `...` // veškerý HTML ze současného bodyHTML BEZ canvas-wrapper a solution-picker
  };
}

// DOM inicializace (nepůvodní overlay, jen listenery)
export function initVkTab(container) {
  const q = (id) => container.querySelector(`[data-id="${id}"]`);
  const gcodeEl = q('gcode');
  // ... veškerá logika z openVkContour() od řádku 521 dále,
  // bez makeOverlay() volání, bez canvas kódu
}
```

**Co se odstraní:**
- `<div class="vk-canvas-wrapper">` s canvasem
- `renderVkCanvas()`, `ensureCanvas()`, `clearCanvas()`, `computeCanvasLayout()`, `drawGrid()`, `drawPlaceholder()`, `drawVkPreview()`
- Wheel/pan/pointer listenery na VK canvasu
- `renderFrame`, `scheduleRender()`, `fitViewportToPreview()`

**Co se zachovává:**
- Všechna solver logika (kategorie 1-4)
- VK formulář a jeho event listenery (přesunuty do `initVkTab()`)
- `parseVkLine()`, `buildVkPreviewData()`, `resolveVkArcGeometry()`, `polarDelta()`, `insertTangentTransitions()`
- `loadVkFieldValues()`, `saveVkFieldValues()`, `vkSave()`
- Řetězec prvků a řešiče (`startPoint`, `vpolPoint`, `pendingQueue`, `resolveOne`, `resolveTwo`, atd.)
- `zoomVkViewport()`, `screenToVkPoint()`, `panVkViewport()` — pro krok 2+3

### 2. `js/dialogs/numericalInput.js` – extrakce `renderNumericalTab()`

**Stejný vzor:**

```js
export function renderNumericalTab() {
  return {
    html: `...` // HTML z makeInputOverlay() volání BEZ overlay obal
  };
}

export function initNumericalTab(container) {
  // veškerá logika z showNumericalInputDialog() od řádku 24 dále,
  // bez makeInputOverlay() volání
}
```

**Co se odstraní:**
- Volání `makeInputOverlay()` — overlay vytváří `combinedModal.js`
- `document.getElementById("btnNumInput")` listener na řádku 14-16 (přesune se do kroku 6)

**Co se zachovává:**
- Veškerá logika formuláře (type select, fields, ok/cancel)
- `pickFromMap()` — funguje na hlavním CAD canvasi
- `addObject()`, výpočty délky/úhlu, chain, polyline

### 3. `js/dialogs/combinedModal.js` – společný overlay

```js
export function showCombinedModal(initialTab = 'vk') {
  const vkTab = showVkTab();
  const numTab = renderNumericalTab();

  const bodyHTML = `
    <div class="tab-bar">
      <button class="tab-btn active" data-tab="vk">📐 VK Kontura</button>
      <button class="tab-btn" data-tab="num">🔢 Číselný vstup</button>
    </div>
    <div class="tab-content active" data-tab-content="vk">${vkTab.html}</div>
    <div class="tab-content" data-tab-content="num">${numTab.html}</div>
  `;

  const overlay = makeOverlay('combined', 'VK – Volná kontura / Číselný vstup', bodyHTML, 'combined-window', true);
  if (!overlay) return;

  const vkContainer = overlay.querySelector('[data-tab-content="vk"]');
  const numContainer = overlay.querySelector('[data-tab-content="num"]');

  initVkTab(vkContainer);
  initNumericalTab(numContainer);

  // tab switching
  overlay.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      overlay.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      overlay.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.dataset.tabContent === tab));
    });
  });

  makeDraggable(overlay.querySelector('.calc-window'), overlay.querySelector('.calc-titlebar'));
  return overlay;
}
```

**Klíčové body:**
- Volá `makeOverlay` s `float = true` (bez backdrop, pointer-events: none na overlay)
- Vkládá HTML z obou tabů
- Volá `initVkTab()` a `initNumericalTab()` pro připevnění listenerů
- `makeDraggable` pro pohyblivé okno

### 4. `js/dialogFactory.js` – rozšíření `makeOverlay`

```js
export function makeOverlay(type, title, bodyHTML, windowClass, float = false) {
  const overlay = document.createElement("div");
  overlay.className = float ? "calc-overlay-float" : "calc-overlay";
  // ... zbytek stejný
}
```

**CSS pro `.calc-overlay-float`:**
```css
.calc-overlay-float {
  position: fixed;
  inset: 0;
  background: none;
  z-index: 300;
  pointer-events: none;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.calc-overlay-float .calc-window {
  pointer-events: auto;
  position: relative;
  bottom: auto;
  left: auto;
  transform: none;
  width: min(700px, 100vw);
  max-height: 90vh;
  border-radius: 12px 12px 0 0;
  box-shadow: 0 -4px 24px rgba(0,0,0,0.5);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
@media (max-width: 768px) {
  .calc-overlay-float .calc-window {
    width: 100vw;
    max-height: 50vh;
  }
}
```

### 5. `js/dialogs.js` – barrel export

```js
export { showCombinedModal } from './dialogs/combinedModal.js';
```

### 6. `index.html` – tlačítka

**Odstranit z CAM panelu (`calcMorePanel`, line 1954):**
```html
<!-- odstranit: <button id="btnOpenVk" ...>📐 VK Kontura</button> -->
```

**Upravit `btnNumInput` v CAD toolbaru (line 1359) na:**
```html
<button class="tool-btn mobile-hide" id="btnOpenVk" title="VK – Volná kontura / Číselný vstup">VK</button>
```

**Upravit mobilní tlačítko (line 60):**
```html
<button id="mobileVk" aria-label="VK" title="VK – Volná kontura / Číselný vstup">VK</button>
```

**Upravit help overlay (line 4282):**
```html
<summary><span class="tool-icon">VK</span> VK Kontura</summary>
```

### 7. `js/ui.js`, `js/touch.js`, `js/events.js` – spouštěče

```js
// ui.js (line 4071)
document.getElementById("btnOpenVk").addEventListener("click", () => showCombinedModal('vk'));

// touch.js (line 150)
document.getElementById("mobileVk").addEventListener("click", () => showCombinedModal('vk'));

// events.js (řádek 613)
showCombinedModal('num');
```

Aktualizovat importy v `events.js`:
```js
import { showCombinedModal, showPolarDrawingDialog, ... } from './dialogs.js';
```

### 8. `css/style.css` – záložkové styly

```css
.tab-bar {
  display: flex;
  gap: 2px;
  padding: 4px;
  border-bottom: 1px solid var(--ctp-surface1);
  background: var(--ctp-surface0);
}
.tab-btn {
  flex: 1;
  padding: 6px 10px;
  border: none;
  border-radius: 4px 4px 0 0;
  background: transparent;
  color: var(--ctp-subtext0);
  cursor: pointer;
  font-size: 12px;
}
.tab-btn.active {
  background: var(--ctp-surface1);
  color: var(--ctp-text);
}
.tab-content {
  display: none;
  flex: 1;
  overflow-y: auto;
}
.tab-content.active {
  display: block;
}
.combined-window .calc-body {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
```

## Pořadí implementace

1. `js/dialogFactory.js` — rozšířit `makeOverlay` o parametr `float`, přidat CSS
2. `js/calculators/vkContour.js` — extrahovat `showVkTab()` + `initVkTab()`, odstranit canvas
3. `js/dialogs/numericalInput.js` — extrahovat `renderNumericalTab()` + `initNumericalTab()`
4. `js/dialogs/combinedModal.js` — vytvořit společný overlay se záložkami
5. `js/dialogs.js` — přidat export `showCombinedModal`
6. `index.html` — přesunout/přejmenovat tlačítka
7. `js/ui.js`, `js/touch.js`, `js/events.js` — aktualizovat spouštěče
8. `css/style.css` — přidat záložkové styly
9. `npm test` — ověřit, že nic se nezlomilo

## Rizika

- **Event listenery**: `initVkTab()` a `initNumericalTab()` musí správně bindovat na nové DOM elementy (ne na starý overlay). Otestovat obě záložky.
- **Stav VK**: `vkSave()` a `loadVkFieldValues()` používají `localStorage` — musí fungovat i v novém overlay (key `skica-vk-contour` zůstává stejný).
- **pickFromMap**: v `initNumericalTab()` musí `overlay.style.display` správně skrývat/zobrazovat overlay během "pick from map" — overlay je nyní `calc-overlay-float` místo `input-overlay`.
- **Mobilní rozložení**: `calc-overlay-float` má `pointer-events: none` na overlay — zajistit, že `bottomBar` zůstane kliknutelný.
