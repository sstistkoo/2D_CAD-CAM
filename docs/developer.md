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
| `LineObject` / `'constr'` | `x1, y1, x2, y2, dashed, lineStyle, finite, layer` |
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

### Typy čar (ČSN EN ISO 128)

Katalog je v `js/lineStyles.js` (`LINE_STYLES`), dialog nástroje ve
`js/dialogs/lineStyleDialog.js`, aktuální volba v `state.lineStyle`
(perzistence v `localStorage`, klíč `skica-line-style`).

- `obj.lineStyle` – klíč typu čáry; `objDash(obj)` / `objWidthMul(obj)` z něj
  odvodí vzor čárkování a násobek tloušťky. Objekty bez `lineStyle` si drží
  původní chování (`obj.dashed` / typ `'constr'` → `CONSTRUCTION_DASH`).
- **Pomocná čára** = objekt typu `'constr'` s `finite: true`. Typ `'constr'`
  je všude filtrován z kontury i z CAM (`gcodeParser`, `stockTools`,
  `fileIO`), takže osy, zakryté hrany a šrafy se neobrábějí. Bez `finite`
  jde o původní nekonečnou konstrukční čáru.
- Skutečná geometrie (souvislá tlustá) vzniká jako typ `'line'` na aktivní
  vrstvě a do CAM normálně vstupuje.
- DXF export typy čar nepřenáší (chybí tabulka `LTYPE`) – pomocné čáry se
  exportují jako běžné `LINE` ve své vrstvě.

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
| `calculators/vkContour.js` | Editor VK (Volná kontura, FK-styl) – `renderVkTab()` (HTML) + `initVkTab(container, { picker })` (skládání G111/G11/G2/G3 syntaxe + volání vkSolver při vkládání prvku); okno staví `dialogs/combinedModal.js`. Bez DOM závislostí, aby šly čisté funkce testovat ve vitest `environment: 'node'` |
| `calculators/vkPreviewRender.js` | Kreslení VK náhledu na CAD plátno (`bridge.renderVkPreview`) + ⤢ přizpůsobení pohledu (`bridge.fitVkPreviewView`) + čárkovaná nápověda tečného napojení (`drawTangentHint`). Oddělené od vkContour.js kvůli importu `canvas.js` |
| `calculators/vkCommit.js` | „📥 Vložit do výkresu" (`bridge.commitVkToDrawing`) – VK syntaxe → běžné objekty `line`/`arc` v `state.objects`. Čistá část `vkSegmentsToDrawObjects()` je bez DOM i bez `state` zápisu, takže jde testovat samostatně |
| `calculators/vkHelp.js` | Nápověda VK – přehled syntaxe a typových kombinací, líně vykreslená v editoru |
| `calculators/vkSolver.js` | Čistá geometrie pro dopočet „?" ve VK: roh dvou přímek/kuželů (kat. 1), jeden tečný oblouk daného R – 2 i 3prvkový řetězec, plus oblouk jako první prvek fronty přes `tangentArcEndOnRay()` (kat. 2), esíčko – dva tečné oblouky s daným bodem zlomu, nebo bez něj navázané na hotovou geometrii přes `twoTangentArcsFromDirection()` (kat. 3), netečné napojení na kružnici kolem VPOL (kat. 4). Počítá ve skutečné rovině **(Z, poloměr)**, viz níže. `chooseSolution()` je společné pravidlo výběru mezi víc řešeními (VPOL1/VPOL2, nebo auto při rozdílu ≥ `AUTO_PICK_MIN_RATIO`) |

### VK: jednotky osy X (past, na kterou pozor)

`vkSolver.js` počítá ve **skutečné rovině (Z, poloměr)** – R, PR i vzdálenosti
v něm znamenají reálné milimetry. Je to táž konvence jako ve zbytku appky
(CLAUDE.md: *„interně vždy poloměr, převod jen na hranici UI"*).

Převod dělá výhradně `vkContour.js`:

| kde | co | čím |
|---|---|---|
| formulář → solver | zobrazované jednotky → poloměr | `toSolverX()` = `inputX()` |
| solver → text/hláška | poloměr → zobrazované jednotky | `fromSolverX()` = `displayX()` |
| surový text G-kódu | uvnitř funkce si převod udělá volající | `inputX()` / `displayX()` na místě (`tangentPointOnRay`) |

**Historie:** solver dřív dostával X jako *průměr* a každá funkce s kruhovou
geometrií si ho měla sama vydělit dvěma. `intersectRayCircle` (kat. 4) to
dělala, tečná rodina (kat. 2/3) ne – osa X tam byla proti Z a R roztažená 2×,
oblouk tedy elipsa a dotykové body mimo. Rovina s neeuklidovskou osou X je
past, na kterou musí pamatovat každá nová funkce, takže se v solveru žádná
nepoužívá. Pokud přidáváš do `vkSolver.js` cokoli s poloměry nebo délkami,
**nic nepůlíš** – čísla už jsou fyzická.

### VK → geometrie výkresu

```
VK syntaxe → buildVkPreviewData() → segmenty { start, end, radius, direction }
           → vkSegmentsToDrawObjects()   (vkCommit.js – převod os a jednotek)
           → pushUndo() 1× → state.objects.push() → calculateAllIntersections()
```

Pravidla, na kterých ta cesta stojí:

- **Žádný `isVk` příznak.** Jakmile je prvek ve výkresu, je to obyčejný
  objekt `line`/`arc` – průsečíky, trim/fillet, DXF, CAM i export G-kódu
  fungují bez dalšího zásahu. Zpětná cesta „objekt → VK zápis" neexistuje.
- **Jeden `pushUndo()` na celou konturu** (jako `addPolylineAsSegments()`).
  `addObject()` se schválně nepoužívá – dělalo by undo snapshot a přepočet
  průsečíků pro každý segment zvlášť.
- **Nekomituje se** `type: 'ray'` (konstrukční paprsky G111/G0 s PA jsou
  pomůcka, ne geometrie), rozepsaný `isDraft` prvek z formuláře a nulové
  segmenty (úvodní `G0` = najetí na start).
- **Syntaxe s `?` se odmítne.** `buildVkPreviewData()` by nedopočtený prvek
  sbalilo na nulový segment a ten by z výkresu tiše zmizel – uživatel se
  místo toho pošle na „Konvertovat na ISO G-kód".
- **Oblouk se konstruuje až ve world souřadnicích** (`vkArcInWorld()` ve
  `vkContour.js`, sdílené s náhledem). R je v G-kódu skutečný poloměr;
  v rovině řešiče (X = průměr) by po převodu vyšla elipsa. `G2 → ccw:false`,
  `G3 → ccw:true` – stejně jako `parseGcodeToObjects()` v `storage/fileIO.js`.

### VK: kreslení klikáním (`state.tool === 'vkDraw'`)

Tlačítko **✏️** v záložce VK zapíná režim, kde klik do výkresu rovnou vloží
prvek. Je to **plnohodnotný nástroj CADu**, ne paralelní odběr kliku:

```
mousedown / tap → handleCanvasClick()  (events.js, resp. touch.js)
                → case 'vkDraw' → bridge.vkDrawPoint(wx, wy)
                → addPointFromCanvas() (vkContour.js, uvnitř initVkTab)
                → worldToVk() → pole X/Z → insertElementFromForm()
```

Proč nástroj, a ne druhý „nabitý" odběr jako 🎯 (`dialogs/canvasPick.js`):

- odběr kliku běží na události `click`, kdežto nástroje na `mousedown` –
  jeden klik by tedy zapsal bod do VK **a zároveň** nakreslil aktivním
  nástrojem. Jako nástroj je VK kreslení s ostatními vzájemně vylučující.
- dotyk, snap, ESC, přepínání z toolbaru i stavová lišta fungují zadarmo
  (`touch.js` volá tentýž `handleCanvasClick`).

Drátování a úklid – režim nesmí přežít okno, jinak by klikání nemělo kam psát:

| kdo | co dělá |
|---|---|
| `bridge.vkDrawPoint` | zapíše bod; registruje `initVkTab`, ruší `destroy()` |
| `bridge.vkDrawUndo` | krok zpět (⌫ v `events.js`, ➖ v okně) – `dropLastVkElementLine()` + resync řetězu z textu |
| `bridge.updateVkDrawButton` | sync tlačítka ✏️ se skutečným nástrojem; volá se z `renderAll()` (a `setTool()` končí `renderAll()`, takže tlačítko drží krok i při přepnutí z toolbaru) |
| `bridge.setTool` | `ui.js` – `vkContour.js` nemůže `ui.js` importovat (cyklus přes `combinedModal.js`) |
| `combinedModal.js` | přepnutí na záložku 🔢 → `stopDrawMode()` |
| `initVkTab().destroy()` | zavření okna → zpět na `select` + odregistrování bridge |
| `events.js` (ESC) | `vkDraw` → `select`, stejně jako `deleteObj`/`copyPlace` |

Syntaxi obou cest (✏️ i tlačítko ➕) skládají společné čisté funkce
`vkElementCommand()` (G0 pro první prvek, pak G11 / G2 / G3),
`vkChainHasElements()`, `buildVkElementLine()` a pro krok zpět
`dropLastVkElementLine()` – testy `tests/vk-draw-mode.test.js`.

**Gumová čára** je schválně rozdělená na dva kusy: `vkContour.js` publikuje
do `state.vkPreview.rubber` jen *nastavení* prvku (typ / směr / R) a dělá to
v `updateVkDrawButton()`, které volá `renderAll()`. Konec čáry si bere
`vkPreviewRender.js` ze `state.mouse` až při kreslení – `renderAll()` běží
při každém pohybu myši, takže čára jede s kurzorem, aniž by se kvůli ní
přepočítával celý náhled kontury (`buildVkPreviewData()`).

Krok zpět **nesmí sáhnout na `Ctrl+Z`**: globální UNDO patří výkresu
(`state.objects`), kde VK před „📥 Vložit do výkresu" nic nemá. Po odebrání
řádku se stav řetězu (`lastPoint`/`startPoint`/`chainStarted`) dopočítá
zpátky z textu (`syncChainFromCode()`), jinak by další klik navázal na bod,
který už v syntaxi není.

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
`calculators/camSimulator.js` – simulátor obrysů obrábění (`openCamSimulator`,
~8 400 ř. — orchestrace: `draw()`, event-handlery, UI editoru/parametrů/
zásobníku nástrojů + tenké wrappery `calculate()`/`generateAutoGCode()`/
`roughingKey()`/`convertGCodeControlSystem()` delegující do modulů níže).
Výpočetní jádro i čisté helpery jsou vytažené do `calculators/cam/`:

| Modul | Účel |
|-------|------|
| `cam/calculatePipeline.js` | Výpočetní jádro `computeCalculation(S, …)` (bývalé `calculate()`) + `roughingKey`/`getRoughingOperations` — z kontury/parametrů staví dráhy, offsety, hrubovací průchody a simPath |
| `cam/gcodeEmit.js` | Emise G-kódu `generateAutoGCode(S, calc)` + hlavička/závěr dle řídicího systému (`buildControlHeaderLines`/`Tail`, `ctrlCmt`, `controlArcFormatter`, `renumberGCodeLines`) a rychlý převod mezi systémy (`convertGCodeControlSystem`) |
| `cam/camMath.js` | Základní geometrické primitivy (úsečka/oblouk, průsečíky, segmentové helpery) sdílené napříč CAM |
| `cam/contourBuild.js` | Pipeline "obráběné kontury" — `buildMachinableContour`, mosty/ořez smyček, `normalizeContourDirection`, `trimAndRemoveLoops` |
| `cam/gcodeParser.js` | Parsování ručního/importovaného G-kódu zpět na dráhu/konturu |
| `cam/insertPreview.js` | Kreslení destičky + držáku (dialog "⚙️ Geometrie") a HTML pole tvaru nástroje |
| `cam/camToolPicker.js` | Sdílená geometrie nástroje pro knihovnu nožů/zásobník (`getCamToolGeometry`/`applyCamToolGeometry`) |
| `cam/camDefaults.js` | Výchozí CAM parametry (`_defaultCamParams`) |
| `cam/threadHelpers.js` | Závitování a upichnutí — sdílená geometrie |
| `cam/camSimulatorDialogs.js` | Vlastní confirm/offset/add-move dialogy |
| `cam/camSimulatorStyles.js` | CSS simulátoru (injektováno přes `<style>`) |
| `cam/roughingStrategies.js` | Registr hrubovacích strategií (podélně/čelně/zleva) |
| `cam/passHelpers.js` | Dotazy nad offsetem kontury pro strategie (`offsetXAt`, `traceOffsetPath`, `findLeadOutEndZ`, `findPocketExitZ`) — továrna `makePassHelpers(offsetPath)` |
| `cam/zMirror.js` | Zrcadlení CAM světa v ose Z (hrubování „zleva" = zrcadlo pravé strany) |
| `cam/interferenceGuides.js` | Mezní čáry hlídání geometrie destičky |
| `cam/toolEnvelope.js` | Obálka držáku (kolizní zóna) |
| `cam/materialRemoval.js` | Vizuální úběr materiálu při simulaci |
| `cam/collisionValidator.js` | Validace kolizí držáku na hotové dráze |
| `cam/holderGouge.js` | Akumulátor kolizí držáku (oranžové varování) |
| `cam/opParts.js` | Skládání programu z více operací (částí) — záznam části, obrobený polotovar pro další operaci, složení celého programu |
| `cam/gcodeMerge.js` | Spojení programů do jednoho (`mergePrograms`) — sdíleno s frontou „SPOJ G-KÓD" v CAM Editoru |

#### Hrubování zleva = zrcadlo (`cam/zMirror.js`)

„↔ Podélně (Z)" + „→ Zleva" (`roughingSide: 'left'`, klíč strategie
`backside`) **nemá vlastní algoritmus**. Je to přesné zrcadlo hrubování
zprava, takže se místo druhé implementace překlopí celý svět:

1. `computeCalculation()` hned na vstupu zrcadlí `z → −z` — konturu,
   polotovar, parametry polotovaru (`stockFace` ↔ `stockLength`) i Z-limity
   (čelisti ↔ koník, rozsah obrábění). Strana se přepne na `'right'`.
   Řetěz bodů se přitom i **obrací** (`mirrorPointChain`): offset úsečky se
   počítá z LEVÉ normály směru jízdy (`getNormal` = `{−dz, dx}`), takže leží
   vně jen u kontury kreslené od pravého čela doleva — a na téže konvenci
   stojí `normalizeContourDirection`. Bez obrácení by offsety ÚSEČEK spadly
   dovnitř dílu, zatímco oblouky (ty si stranu detekují z geometrie) by
   zůstaly venku. Typ pohybu a rádius patří k úseku DO bodu, proto se
   při obrácení posouvají o jedna; funkce je involuce, takže se stejnou
   funkcí i vrací (na tom stojí párování `calc.worldPoints[i]` ↔
   `S.contourPoints[i]` při tažení bodů v simulátoru).
2. Celý zbytek výpočtu běží **beze změny** — v zrcadle je to obyčejné
   hrubování zprava se standardním pravým nožem. Platí tedy i dosažitelnost
   destičky, mezní čáry, obálka držáku, kapsy, rampy a dojezdy bez schodků.
3. Před `return` se výsledek překlopí zpátky (`mirrorCalcZ`) a průchody
   dostanou `backside: true`. `simPath` se nezrcadlí — vzniká parsováním
   skutečného (reálného) G-kódu.

V emisi (`gcodeEmit.js`) drží směr jediná proměnná `zDir` (−1 zprava, +1
zleva): nájezd a odskok jdou proti směru řezu, dojezd „do vzduchu" po směru.
Spotřebitelé, kteří pracují v reálném světě (kreslení plátku, `validateToolpath`,
`HolderGouge`), si nástroj zrcadlí sami přes vlastní příznak `backside`.

Konvence, na které to stojí (podrobně v hlavičce `zMirror.js`): úhel oblouku
`a = atan2(x − cx, z − cz)`, překlopení mapuje `a → π − a` a obrací smysl
(G2↔G3). Pole, jejichž pořadí je **konvence** (offsetPath v jízdním pořadí,
uzavřené smyčky), se navíc obracejí — smysl oblouku pak zůstává. Pole,
jejichž pořadí je **čas** (dráha nástroje: `contourLeadIn`/`contourLeadOut`),
se neobracejí a smysl oblouku se prohodí.

Paritu hlídá `tests/cam-backside-mirror.test.js`: týž díl „zleva" musí dát
identické průchody i G-kód jako geometricky zrcadlený díl „zprava" (až na
bezpečnou polohu, což je parametr stroje, ne geometrie dílu).

#### Části programu (operace)

Jedna kontura se dá obrobit na několik operací (hrubování → drážky → závit),
každou jiným nožem. Model v `camSimulator.js`:

- `S.opParts: Part[]` — pole částí, `S.activePart` = index té, které patří
  **živý stav** (`S.params`, `S.zLimits`, `S.xLimits`, `S.stockPoints`,
  `S.manualGCode`). Prázdné pole = klasický jednooperační režim, nic se
  nechová jinak než dřív.
- `Part = { id, name, gcode, params, zLimits, xLimits, stockPoints,
  selectedMaterial, activeMagazineSlot }` — `stockPoints` je polotovar
  **před** touto částí. Kontura (`S.contourPoints`) i konstrukční čáry jsou
  společné všem částem.
- `syncActivePart()` zapisuje živý stav do záznamu (volá se z `saveState()`
  i `pushHistory()`), `applyPartToState()` naopak. Parametry stroje/výkresu
  (`SHARED_PARAM_KEYS`: `machineStructure`, `controlSystem`, `mode`,
  `safeX`, `safeZ`) si část **nenese** — přebírají se z aktuálního stavu.
- `S.opView`: `'part'` = editace aktivní části, `'all'` = náhled celého
  složeného programu nad **původním** polotovarem z první části (G-kód jen
  ke čtení, `🔄 Dráhy` je zablokované).

Obrobený polotovar pro další operaci: `machinedStockPoints()` pustí
`MaterialRemoval` přes celou `calc.simPath` části a výslednou smyčku převede
`loopsToStockProfile()` zpět na otevřený profil (`stockPoints`, `stockMode:
'casting'`). Profil se nejdřív odsadí **ven** o `SIMPLIFY_EPS`, aby chyba
padla na stranu „víc materiálu" (nástroj pak nanejvýš řeže vzduch), a pak se
přes `fitArcsToPolyline()` proloží zpět **oblouky a delšími úsečkami** —
zbytek z Clipperu je mnohoúhelník, takže zaoblení by jinak skončila jako
stovky drobných G1. Body vycházejí rovnou s typem `G1`/`G2`/`G3`; rádius se
píše vždy jako **skutečný poloměr** (tak ho čte `resolvePointsToAbsolute` →
`rVal`), i v režimu DIAMON. Počet bodů je stropovaný (`MAX_STOCK_POINTS`) —
při překročení se tolerance fitu stupňuje.

**Pozor na ploché oblouky:** fit povoluje rozvin až ~169°, jenže profil se
ukládá jako body a znovu se z nich dopočítává střed (`getArcParams`). U
skoro-180° oblouku je tětiva blízko 2R, takže i zaokrouhlení souřadnic na µm
posune střed o řád víc, a spadne-li R pod polovinu tětivy, `getArcParams`
vrátí `error` a dokreslí půlkruh — vypadá to jako obrácený směr G2/G3. Proto
`splitWideArcs()` dělí oblouky na ≤ 90° (poloviny leží na téže kružnici, tvar
se nemění) a `arcSurvivesRounding()` každý oblouk po zaokrouhlení ověří; při
neshodě degraduje na úsečku (po rozdělení je tětiva jen setiny mm od
kružnice). Hlídá to `tests/cam-op-parts.test.js` → „oblouky odvozeného
polotovaru se nesmí obrátit".

Vazba na vykreslení: první část si drží `baseStockLoop` = obrys **původního**
polotovaru. `draw()` z něj staví `fillClipPath` i při `simProgress === 0`,
takže vybarvení z CAD nástroje „Vybarvit" zůstane odebrané i v dalších
operacích — materiál, který odjel v předchozí části, se na plátno nevrací.

Části přežívají cestu přes CAD: kontura přicházející z CAD je **nezahazuje**
(do CAM se chodí právě odtud, takže by rozdělení nepřežilo obnovení stránky).
Místo toho se porovná `S.opContourKey` (otisk kontury, se kterou části
vznikly, aktualizovaný v `saveState()`) a při neshodě se jen upozorní.
Polotovar překreslený v CAD se propíše do **první** části — ostatní se
odvozují z předchozí operace, ne z výkresu.

Ven (schránka, soubor, CAM Editor, `.camprog`) jde vždy `outputGCode()` =
celý složený program; `buildCombinedProgram()` používá `mergePrograms()`
z `cam/gcodeMerge.js`, který při **výměně nože** vypíše i nájezd do
referenčního bodu (`G75`/`G28`/`G74`) a startovní polohu, i když se oproti
předchozí části nemění (`TOOL_CHANGE_FORCED`).

#### Konec hrubovacího průchodu: stěna vs. obálka držáku

`makeHolderClamp()` (`cam/toolEnvelope.js`) vrací **první vstup do zakázané
oblasti + `HOLDER_CLAMP_MARGIN` (0,1 mm)**. Zakázaná oblast je ale
`silueta offsetu ⊕ (−držák)`, takže obsahuje i samotnou siluetu — clamp proto
„najde překážku" i tam, kde průchod prostě končí **na stěně kontury**.
Rezerva patří DRŽÁKU, ne špičce (přídavek je už v offsetu), takže
`applyHolderClamp()` v `roughingStrategies.js` zkracuje interval jen tehdy,
když **místo překážky** (`nz − HOLDER_CLAMP_MARGIN`) leží za koncem intervalu
o víc než řezná tolerance 0,01 mm (hranice po Clipperu a offsetová silueta se
liší v řádu 1e-3 mm). Bez toho končila každá vrstva 0,1 mm před offsetovou
čárou. Invariant hlídá `tests/cam-leadout-step.test.js`.

Dojezd „bez schodků" po **čelní (radiální) stěně** — dojezd stoupne v X víc,
než ujede v Z — se dělá jen se zapnutým `noStepRoughingFace` („i u čelního").
Rampované dojezdy strmých stěn a dokončení kapes tím neprochází (ujedou v Z
podstatně víc), takže pod ořízlou rampou nezůstane klín materiálu.

Testy nad neexportovanými helpery jdou přes `tests/helpers/camInternals.mjs`
(text-surgery + přímé importy z `cam/*.js`); plný pipeline (`calculate()` +
`generateAutoGCode()`) přes `tests/helpers/camHeadless.mjs` — viz
`tests/cam-gcode-regression.test.js`.
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
  - `combinedModal.js` – sloučené okno „Zadání objektu": záložky 📐 VK a
    🔢 Číselné zadání. Otevírá se přes `showCombinedModal('vk' | 'num')` a
    je to **jediný** vstup – všech pět spouštěčů (`btnOpenVk`, `btnNumInput`,
    `desktopNumInput`, `mobileNumInput`, klávesa `n`) míří sem.
    Záložky i ⤢ sedí v **liště okna** (`titlebarControlsHTML()`), ne nad
    formulářem – okno je na mobilu ukotvené dole a každý řádek navíc ubírá
    plochu plátnu. ⤢ řeší `fitViewForActiveTab()`: podle aktivní záložky
    volá `bridge.fitVkPreviewView` / `bridge.fitNumPreviewView`, se
    záchranou na `autoCenterView()`.
  - `numericalInput.js` – numerický vstup souřadnic: `renderNumericalTab()`
    (HTML) + `initNumericalTab(container, { picker })` (logika, vrací `{ destroy }`).
    Pole na ruční zápis G-kódu je **záměrně prázdné** (ne zrcadlo `#cncOutput`) –
    obsah drží localStorage a 🔄 ho pouští přes `bridge.renderCncCodeToCanvas`.
    Oblouk zadaný začátkem/koncem/R staví `arcFromEndpointsRadius()`
    (`js/utils.js`) – tutéž funkci používá i `parseGcodeToObjects()` pro
    `G02/G03 … R`, takže formulář a G-kód dají identický oblouk.
    Ručně psaný kód projde `normalizeGcodeText()` (`js/gcodeNormalize.js`) –
    parser tak nemusí znát lidské varianty zápisu (malá písmena, mezery,
    desetinná čárka, výrazy) a normalizace se dá testovat samostatně.
  - `canvasPick.js` – sdílený jednorázový odběr kliku na CAD plátno (🎯
    „vybrat bod z výkresu"). Vědomě **mimo** `handleCanvasClick()`
    v `events.js`: tam by jeden klik zároveň zapsal souřadnici do
    formuláře a nakreslil aktivním nástrojem. Tlačítko odběr „nabije",
    další klik ho spotřebuje a odzbrojí – nástroje o ničem neví.
    Dotykový `touchend` visí na `document` v **zachytávací** fázi a čte
    `state.touchPrecision` (přesný zaměřovač z `touch.js`), aby se bod bral
    z křížku, ne z prstu – ve fázi AT_TARGET by obsluha plátna stihla
    zaměřovač schovat dřív.
  - `postDrawDialog.js` – dialog po kreslení
  - `gearPairDialog.js`, `threadDialog.js`, `grooveDialog.js` – specifické dialogy
  - `measure.js` – měření

### Dialogy pattern

```js
import { makeOverlay, onOverlayRemoved, makeDraggable } from '../dialogFactory.js';

const overlay = makeOverlay('typ', 'Nadpis', '<div>...</div>', 'moje-okno', {
  float: false,        // true = plovoucí okno bez tmavého pozadí
  closeOnEsc: true,    // u plovoucích oken dává smysl false (ESC patří nástroji)
  closeOnBackdrop: true,
});
if (!overlay) return;   // okno daného typu už je otevřené
onOverlayRemoved(overlay, () => { /* cleanup globálních listenerů */ });
```

`dialogFactory.js` vytvoří overlay + close button; `makeDraggable(win, handle)`
přidá tažení za lištu. `data-type` je zároveň **pojistka proti duplicitě** –
proto se třída `calc-overlay-float` jen PŘIDÁVÁ k `calc-overlay`, nikdy ji
nenahrazuje (jinak přestane fungovat i skrývání plovoucích oken
v `camSimulator.js`).

`closeOnEsc: false` nestačí samo o sobě – `events.js` má vlastní globální
ESC, který zavírá nejvyšší otevřený overlay. `makeOverlay` proto na takové
okno pověsí `data-keep-on-esc` a ten selektor v `events.js` vyřazuje.
Rozměry plovoucího okna patří na jeho vlastní třídu
(`.calc-overlay-float .moje-okno`), NIKDY se nepřepisuje
`.calc-overlay-float .calc-window` – ta patří plovoucí kalkulačce.

#### Dialog jako záložka sdíleného okna

Když má dialog žít vedle jiného v jednom okně (viz `combinedModal.js`),
rozdělí se na dvojici:

```js
export function renderMojeTab()          { return { html: '<div>…</div>' }; }
export function initMojeTab(container)   { /* listenery nad `container` */
  return { destroy() { /* odhlásit globální listenery */ }, refresh() {} };
}
```

Pravidla: `render*` je čistá funkce (žádný DOM, žádný stav), `init*` sahá
**jen** do předaného `container` (ne do `document`), stav drží v closure
(ne na elementu okna) a `destroy()` uklidí všechno, co viselo na
`window`/`document`/plátně. `refresh()` je volitelný – volá se po zobrazení
záložky (canvas má schovaný nulové rozměry). Celé okno (pro zavření nebo
dočasné skrytí) se hledá přes `container.closest('.calc-overlay')`.

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
