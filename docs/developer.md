# Vývojářská dokumentace SKICA

## Obsah
1. [Architektura aplikace](#architektura-aplikace)
2. [Bridge pattern – zprostředkovatel modulů](#bridge-pattern)
3. [Stav aplikace a undo/redo](#stav-aplikace-a-undo-redo)
4. [Renderování](#renderování)
5. [Datové typy objektů](#datové-typy-objektů)
6. [Přidání nového nástroje](#přidání-nového-nástroje)
7. [CAM pipeline](#cam-pipeline)
8. [DXF import/export](#dxf-importexport)
9. [Ukládání a načítání](#ukládání-a-načítání)
10. [UI a dialogy](#ui-a-dialogy)
11. [Testování](#testování)

---

## Architektura aplikace

SKICA je client-side SPA bez build steps. Všechno je vanilla JS s ES modulemi.

```
index.html
├── css/style.css          # Catppuccin theming
├── sw.js                  # Service Worker
├── manifest.json          # PWA manifest
├── js/
│   ├── app.js             # Vstupní bod aplikace (importuje side-effect moduly)
│   ├── state.js           # Globální stav, undo/redo, toast
│   ├── objects.js         # CRUD nad výkresovými objekty
│   ├── types.js           # JSDoc typové definice (neexportuje kód)
│   ├── constants.js       # Barvy, prahy, stavy
│   ├── bridge.js          # Zprostředkovatel mezi moduly (AutoCenter, store)
│   ├── geometry.js        # Průsečíky, fillet, chamfer, constraints
│   ├── canvas.js          # Canvas 2D kontext, transformace
│   ├── render.js          # Překreslování celého výkresu
│   ├── dxf.js             # DXF import + export
│   ├── cnc-calcs.js       # CNC kalkulačky (otáčky, střih, tolerance)
│   ├── toolLibrary.js     # Správa toolů
│   ├── stockTools.js      # Pomocné nástroje pro soustruh
│   ├── touch.js           # Touch ovládání
│   ├── ui.js              # Panely, seznamy, property panel
│   ├── dialogs/           # Ovládací prvky
│   ├── tools/             # Registry nástrojů (handle*Click)
│   ├── calculators/       # CAM generátory, g-code, nápověda, ... │   ├── lib/                # Font loader (DXF text)
│   ├── storage/           # IndexedDB, export obrázku, autoSave
│   └── ai/                # AI panel + nastavení poskytovatelů
│   └── lib/                # Font loader (DXF text)
├── tests/                 # Vitest testy
└── scripts/               # Build utility (SW generování)
```

### Základní tok
1. `index.html` načte `js/app.js` jako ES module entry point
2. `app.js` importuje side-effect moduly: `render.js`, `objects.js`, `events.js`, `touch.js`, `dialogs.js` – tyto moduly se spustí hned při načtení a zaregistrují event listenery + bridge callbacks
3. Uživatel akce → handler v `tools/*.js` (volán z `events.js`)
4. Handler modifikuje `state.objects`
5. Volá `pushUndo()` pro historii
6. `renderAll()` překreslí canvas
7. `calculateAllIntersections()` přepočítá průsečíky

### Bridge pattern (`js/bridge.js`)

Problém: moduly jsou navzájem závislé (`state.js` → `objects.js` → `render.js` → `state.js`). ES modules nepovolují cykly v importech.

Řešení: `bridge.js` exportuje prázdný objekt s callbacky. Moduly se na sobě neimportují přímo, ale zapisují do `bridge` během inicializace:

```js
// js/events.js, js/ui.js, js/geometry.js, ...
import { bridge } from './bridge.js';
bridge.renderAll = renderAll;
bridge.calculateAllIntersections = () => calculateAllIntersections();
bridge.updateObjectList = () => updateObjectList();
// ...
```

`bridge.js` tedy slouží jako **dependency injection container**. Když potřebuješ zavolat `calculateAllIntersections()` z `objects.js`, nepoužij import, ale `bridge.calculateAllIntersections()`.

**Pravidlo:** Nikdy neimportuj přímo modul, který by vytvořil cyklus. Vždycky použij `bridge.XXX`.

Bridge se inicializuje při startu v:
- `js/events.js` – nástroje (`handleLineClick`, `measureSelection`, ...)
- `js/ui.js` – UI aktualizace (`updateObjectList`, `renderAll`, ...)
- `js/geometry.js` – geometrické operace (`calculateAllIntersections`)
- `js/touch.js` – mobilní tlačítka
- `js/storage/fileIO.js` a `js/storage/projectManager.js` – souborové dialogy

---

## Stav aplikace a undo/redo

### `state.js` – jádro aplikace

```js
import { state, pushUndo, showToast } from './state.js';
```

- `state.objects` – pole všech výkresových objektů
- `state.selected` – index vybraného objektu (`null` = nic)
- `state.tool` – aktuálně aktivní nástroj (`'select'`, `'line'`, `'arc'`, ...)
- `state.tempPoints` – dočasné body během kreslení (např. 1. bod úsečky)
- `state.undoStack` / `state.redoStack` – historie změn
- `state.nextId` – automatické ID pro nové objekty

### Undo/Redo API

```js
pushUndo();                              // Uloží snapshot do undoStack
state.undoStack;                         // Pole předchozích stavů
state.redoStack;                         // Pole pro redo
performUndo();                           // Vrátí zpět
```

Undo ukládá **celý snapshot** `state.objects` pomocí `deepClone()`. Max. velikost: `state.maxUndo` (default 50).

### Batch operace – `withUndoBatch`

```js
withUndoBatch(() => {
  addObject({...});
  addObject({...});
  // ...
});
```

Všechny změny uvnitř callbacku se zapíší jako **jeden** krok undo/red

### Toast notifikace

```js
showToast("Zpráva", 2000);  // 2s default
```

### Renderování (`js/render.js`)

```js
import { renderAll, renderAllDebounced } from './render.js';
```

- `renderAll()` – naplánuje překreslení přes `requestAnimationFrame` (debouncing).
- `renderAllDebounced(delay = 32)` – explicitní debounce pro rychlé UI změny.
- Volá se po každé změně `state.objects` (např. po `addObject`, `moveObject`, `calculateAllIntersections`).

`canvas.js` poskytuje transformace mezi world a screen souřadnicemi:
- `worldToScreen(wx, wy)` → `{sx, sy}`
- `screenToWorld(sx, sy)` → `{wx, wy}`
- `applyZoomPan()` – aktuální zoom/pan

V rámci `renderAll()` dochází k:
1. `renderObjects()` – vykreslení všech objektů, dimenzí, snap bodů
2. `renderAxes()` – osy soustavy
3. `renderAngleSnapGuide()` – úhlové snap vodicí čáry
4. Volání bridge callbacků pro mobile (`updateMobileCancelBtn`, `updatePolylineButtons`, ...)

### Viewport culling

`getObjectBounds(obj)` vrací AABB objektu ve world souřadnicích. `render.js` používá to k vynechání objektů mimo canvas.

`calculateAllIntersections()` ze `geometry.js` přepočítává průsečíky a **zároveň volá** `bridge.renderAll()`, takže po její volání není potřeba další `renderAll()`.

---

## Datové typy objektů

Všechny typy jsou definovány v `js/types.js` jako JSDoc `@typedef` (neexportuje kód).

### Základní typy

| Typ | Vlastnosti |
|-----|------------|
| `LineObject` / `'constr'` | `x1, y1, x2, y2, dashed, layer` |
| `CircleObject` | `cx, cy, r, layer` |
| `ArcObject` | `cx, cy, r, startAngle, endAngle, ccw, layer` |
| `RectObject` | `x1, y1, x2, y2, layer` |
| `PolylineObject` | `vertices: Point2D[], bulges: number[], closed, layer` |
| `TextObject` | `x, y, text, fontSize, fontFamily, rotation, pathMode, layer` |
| `PointObject` | `x, y, layer` |

### Speciální flagy
- `isDimension` – kótový objekt
- `isCoordLabel` – souřadnicové označení
- `isStock` – prut hrubý
- `isMeasureTemp` – dočasný měřicí objekt

### Sjednocený typ

```js
/** @typedef {PointObject|LineObject|CircleObject|ArcObject|RectObject|PolylineObject|DimensionObject|TextObject} DrawObject */
```

Každý objekt má také:
- `id` – unikátní ID (přiřazeno `addObject`)
- `name` – zobrazený název
- `color` – CSS barva (volitelné)
- `layer` – index vrstvy
- `skipIntersections` – (volitelné) pokud je `true`, objekt se nezapočítává do průsečíků (užitečné pro pomocné konstrukce)

---

## Přidání nového nástroje

Nástroje jsou moduly ve `js/tools/`. Každý exportuje handler funkci.

### 1. Vytvoř soubor

```js
// js/tools/myToolClick.js
import { state, showToast, pushUndo } from '../state.js';
import { addObject } from '../objects.js';

export function handleMyToolClick(wx, wy) {
  // 1. Zkontroluj stav
  // 2. Přidej objekt pomocí addObject()
  // 3. Volitelně volej showToast()
}
```

### 2. Zaregistruj v `js/tools/index.js`

```js
export { handleMyToolClick } from './myToolClick.js';
```

### 3. Přidej do ToolType v `js/types.js`

```js
'myTool'
```

### 4. Oblast UI

Toolbar tlačítka jsou definována v `index.html` nebo generována v `js/ui.js`.

### Příklad – jednoduchý nástroj (Line)

```js
// js/tools/lineClick.js
import { state, showToast } from '../state.js';
import { addObject } from '../objects.js';
import { startDrawing, finishDrawing } from './helpers.js';
import { showPostDrawLineDialog } from '../dialogs/postDrawDialog.js';

export function handleLineClick(wx, wy) {
  if (!state.drawing) {
    startDrawing(wx, wy, "Klepněte na koncový bod");
  } else {
    const tp = state.tempPoints[0];
    const lineObj = addObject({
      type: state.tool === "constr" ? "constr" : "line",
      x1: tp.x, y1: tp.y, x2: wx, y2: wy,
      name: `Úsečka ${state.nextId}`,
    });
    finishDrawing();
    if (lineObj) showPostDrawLineDialog(lineObj);
  }
}
```

### Pattern: Akční tlačítko nad výběrem (bez `data-tool`)

Ne každý nástroj kreslí klikáním po plátně — některé jen zpracují aktuální
`state.selected`/`state.multiSelected` a vytvoří/upraví výsledek rovnou
(žádný `state.tool`, žádný `handleCanvasClick` case). Příklady: "Přídavek na
plochu" (`#btnAllowance` → `stockTools.js`), "Seřadit podle dráhy"
(`#btnSortContour`). Wiring je prosté tlačítko v `index.html` +
`element.addEventListener('click', …)` v `js/ui.js`, bez kroků 3–4 výše
(žádný `ToolType`/`data-tool`).

### Pattern: Pokročilý nástroj s více kroky

- Ukládej stav do `state.tempPoints` a `state.drawing`
- Používej `startDrawing()` / `finishDrawing()` z `tools/helpers.js` pro více-krokové nástroje
- Resetuj vnitřní stav při přepnutí toolu (volání `reset*State()`)
- Nevolej `calculateAllIntersections()` ručně z handleru – `addObject` ho volá automaticky. Pokud potřebuješ přepočítat průsečíky po skupinové operaci, použij `withUndoBatch()` nebo volání přímo.

### Příklad – pokročilý nástroj (Gear)

```js
// js/tools/gearClick.js
export function handleGearClick(wx, wy) {
  showGearDialog((params) => {
    const profile = generateFullGearProfile(params);
    profile.forEach(seg => addObject({
      ...seg,
      layer: state.activeLayer,
    }));
    showToast(`Zubové kolo z ${params.teeth} zuby přidáno`);
  });
}

export function resetGearState() {
  // žádný persistentní stav – dialog je modální
}
```

`bridge` callbacks pro toto tlačítko jsou registrované v `js/events.js`:
```js
bridge.gearFromSelection = gearFromSelection;
```

---

## CAM pipeline

CAM generátory jsou v `js/calculators/`.

### Základní struktura

```
User selects CAM tool
    → js/tools/*Click.js volá calculator
    → js/calculators/*.js vygeneruje NC data
    → zobrazí se v overlaye (dialogFactory.js)
    → uživatel může exportovat / simulovat
```

### Klíčové moduly

| Modul | Účel |
|-------|------|
| `calculators/help.js` | In-app nápověda (G/M kódy, kalkulačky) – text je čistě český, příklady kódů. |
| `calculators/gcode.js` | Tabulky G/M kódů, dokumentace, příklady (používá i help overlay) |
| `calculators/sinumerikHub.js` | Hlavní hub pro generování Sinumerik 840D |
| `calculators/camEditor.js` | Editor CAM strategií |
| `calculators/camSimulator.js` | Náhled obrysů obrábění |
| `calculators/contourOffset.js` | Offset kontur pro obrábění |
| `calculators/thread.js` | Parametry závitů |
| `calculators/threadData.js` | Data pro generování závitů |
| `calculators/roughness.js` | Povrchová kvalita |
| `calculators/cutting.js` | Řezné podmínky |
| `calculators/tolerance.js` | Mezní údaje |

### CAM pipeline: Roughing/Finishing

1. Vyber profil (polyline) nebo definuj geometrii
2. `buildMachinableContour()` – připraví obráběný obrys
3. `calculateAllIntersections()` – přepočítá průsečíky
4. CAM strategie (`calculateRoughing()`, `calculateFinishing()`):
   - Rozdělí na úsečky/oblouky
   - Vytvoří traversy a řezné dráhy
   - Vrátí `contours: Contour[]` s `segments: Segment[]`
5. `gcode.js` / `sinumerikHub.js` – převede na NC program (subprogramy, hlavičky)

`calculators/contourOffset.js` – offset kontury pro zajištění rozměrů.
`calculators/camEditor.js` – editor CAM strategií.
`calculators/camSimulator.js` – simulátor obrysů obrábění.
`calculators/gcode.js` – databáze G/M kódů (syntaxe, příklady), používá se v help overlay i CAM generátorech.
`calculators/sinumerikHub.js` – hlavní hub pro generování Sinumerik 840D programů (subprogramy, hlavičky).
`calculators/thread.js` a `calculators/threadData.js` – parametry závitů.
`calculators/cutting.js` – řezné podmínky.

### Formát segmentu

```js
Segment {
  type: 'line' | 'arc',
  x, y, z,           // koncové pozice
  cx, cy,            // střed oblouku (pro arc)
  r,                 // poloměr
  startAngle, endAngle,
  feed: number,      // posuv
  speed: number,     // otáčky / řezná rychlost
  tool: number,      // číslo nástroje
  rapid: boolean,    // G0 vs G1
}
```

---

## DXF import/export

`js/dxf.js` (~1088 řádek).

### DXF Import

- Načítá textový DXF soubor
- Parsuje entity: `LINE`, `CIRCLE`, `ARC`, `LWPOLYLINE`, `POLYLINE`, `TEXT`, `INSERT`, `BLOCK`, `3DFACE`, `ELLIPSE`, `SPLINE`
- Mapuje DXF color index → CSS barvy (`ACI_COLORS`)
- Transformuje do `DrawObject[]`

### DXF Export

- Serializuje `state.objects` do DXF formátu
- Podpora základních 2D entit

### Omezení

- Ne všechny DXF prvky jsou podporovány
- Velký DXF může být pomalý (`MAX_ENTITIES = 10000`)

---

## Ukládání a načítání

| Modul | Účel |
|-------|------|
| `storage/autoSave.js` | Automatické ukládání do IndexedDB |
| `storage/projectManager.js` | CRUD projektů, seznamy |
| `storage/fileIO.js` | Import/export souborů |
| `storage/exportImage.js` | Export PNG |
| `idb.js` | Abstrakce nad IndexedDB (`getMeta`, `setMeta`, `migrateFromLocalStorage`) |

### IndexedDB

- Databáze: `skica-db`
| Store | Klíč | Hodnota |
|-------|------|---------|
| `projects` | projectName | `ProjectData` |
| `autosave` | `autosave` | `DrawObject[]` |

### `ProjectData` struktura

```js
{
  version: number,
  objects: DrawObject[],
  intersections: Point2D[],
  nextId: number,
  gridSize: number,
  coordMode: 'abs' | 'inc',
  layers: Layer[],
  activeLayer: number,
}
```

---

## UI a dialogy

### Panely

- `js/ui.js` – hlavní UI logika, panely, seznamy objektů
- `js/dialogs/` – jednotlivá dialogová okna
  - `numericalInput.js` – numerický vstup souřadnic
  - `postDrawDialog.js` – dialog po kreslení
  - `gearPairDialog.js`, `threadDialog.js`, `grooveDialog.js` – specifické dialogy
  - `measure.js` – měření

### Dialogy pattern

```js
import { makeOverlay } from '../dialogFactory.js';

const overlay = makeOverlay({
  title: "Nadpis",
  content: "<div>...</div>",
  onClose: () => { /* cleanup */ },
});
```

`dialogFactory.js` vytvoří overlay + close button + drag logic.

---

## Testování

```bash
npm test              # Vitest (run once)
npm run test:watch    # Watch mode
npm run test:coverage # s coverage
```

### Struktura testů

```
tests/
├── geometry.test.js           # Geometrické operace
├── objects.test.js            # Správa objektů
├── dxf.test.js                # DXF import/export
├── cam-*.test.js              # CAM strategie a g-code regresní
├── gearPair.test.js           # Ozubení
├── state.test.js              # Stav aplikace
├── undoBatch.test.js          # Undo/Redo
├── ...
```

### Příklad testu

```js
import { describe, it, expect } from 'vitest';
import { addObject } from '../js/objects.js';
import { state } from '../js/state.js';

describe('objects', () => {
  it('adds line with id', () => {
    const obj = addObject({
      type: 'line', x1: 0, y1: 0, x2: 10, y2: 10,
    });
    expect(obj).not.toBeNull();
    expect(obj.id).toBeGreaterThan(0);
    expect(state.objects.length).toBe(1);
  });
});
```

> Poznámka: v testech používáme `fake-indexeddb` pro simulaci IndexedDB.

---

## Checklist pro přidání feature

1. [ ] Přidej typ do `types.js`
2. [ ] Implementuj v `tools/<name>Click.js` nebo `calculators/<name>.js`
3. [ ] Zaregistruj export v `tools/index.js` nebo přímo v UI
4. [ ] Přidej UI tlačítko do `index.html` / `ui.js`
5. [ ] Přidej test do `tests/`
6. [ ] Spusť `npm test`
