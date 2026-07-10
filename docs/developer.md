# Vývojářská dokumentace SKICA

## Obsah
1. [Architektura aplikace](#architektura-aplikace)
2. [Stav aplikace a undo/redo](#stav-aplikace-a-undo-redo)
3. [Datové typy objektů](#datové-typy-objektů)
4. [Přidání nového nástroje](#přidání-nového-nástroje)
5. [CAM pipeline](#cam-pipeline)
6. [DXF import/export](#dxf-importexport)
7. [Ukládání a načítání](#ukládání-a-načítání)
8. [UI a dialogy](#ui-a-dialogy)
9. [Testování](#testování)

---

## Architektura aplikace

SKICA je client-side SPA bez build steps. Všechno je vanilla JS s ES modulemi.

```
index.html
├── css/style.css          # Catppuccin theming
├── js/
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
│   ├── calculators/       # CAM generátory, g-code, perdrtí, ...
│   ├── storage/           # IndexedDB, export obrázku, autoSave
│   └── ai/                # AI panel + nastavení poskytovatelů
├── tests/                 # Vitest testy
└── scripts/               # Build utility (SW generování)
```

### Základní tok
1. Uživatel akce → handler v `tools/*.js`
2. Handler modifikuje `state.objects`
3. Volá `pushUndo()` pro historii
4. `renderAll()` překreslí canvas
5. `calculateAllIntersections()` přepočítá průsečíky

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

Undo ukládá **celý snapshot** `state.objects`. Max. velikost: `state.maxUndo` (default 50).

### Toast notifikace

```js
showToast("Zpráva", 2000);  // 2s default
```

---

## Datové typy objektů

Všechny typy jsou definovány v `js/types.js` jako JSDoc `@typedef`. Nejednoznáčné.

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

### Pattern: Pokročilý nástroj s více kroky

- Ukládej stav do `state.tempPoints` a `state.drawing`
- Používej `startDrawing()` / `finishDrawing()` z `tools/helpers.js`
- Resetuj vnitřní stav při přepnutí toolu (volání `reset*State()`)

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
| `calculators/gcode.js` | Tabulky G/M kódů, dokumentace |
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
