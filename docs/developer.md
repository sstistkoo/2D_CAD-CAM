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
| `calculators/vkContour.js` | Editor VK (Volná kontura, FK-styl) – `renderVkTab()` (HTML) + `initVkTab(container, { picker })` (skládání G111/G11/G2/G3 syntaxe + volání vkSolver při vkládání prvku); okno staví `dialogs/combinedModal.js`. Bez DOM závislostí, aby šly čisté funkce testovat ve vitest `environment: 'node'`. `insertElementFromForm()` (uvnitř `initVkTab`) hlídá R vs. tětivu i pro oblouk se ZCELA známými souřadnicemi cíle (ten neprojde solverem – ten se volá jen na nedořešené prvky ve `pendingQueue`) – bez toho by `vkArcInWorld()` nesestrojitelný oblouk potichu nakreslil jako rovnou čáru. Kontrola je omezená na `pendingQueue.length === 0`, protože s nedořešenými prvky ve frontě `refPoint()` ukazuje na bod PŘED jejich dopočtem, ne na skutečný start tohoto oblouku |
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
| `cam/gcodeParser.js` | Parsování ručního/importovaného G-kódu zpět na dráhu/konturu (včetně modálního F/S a G94…G99 do bodů dráhy) |
| `cam/feedRates.js` | Reálné rychlosti pohybu [mm/min] — otáčky v daném ⌀, posuv, rychloposuv, odhad času (`pathTimeSeconds`), ubíhající čas (`buildTimeProfile`/`elapsedAtProgress`) a posun přehrávání strojním časem (`advanceAlongPath`) |
| `cam/insertPreview.js` | Kreslení destičky + držáku (dialog "⚙️ Geometrie") a HTML pole tvaru nástroje |
| `cam/camToolPicker.js` | Sdílená geometrie nástroje pro knihovnu nožů/zásobník (`getCamToolGeometry`/`applyCamToolGeometry`) |
| `cam/camDefaults.js` | Výchozí CAM parametry (`_defaultCamParams`) |
| `cam/threadHelpers.js` | Závitování a upichnutí — sdílená geometrie |
| `cam/camSimulatorDialogs.js` | Vlastní confirm/offset/add-move dialogy |
| `cam/camSimulatorStyles.js` | CSS simulátoru (injektováno přes `<style>`) |
| `cam/roughingStrategies.js` | Registr hrubovacích strategií (podélně/čelně/zleva) |
| `cam/passHelpers.js` | Dotazy nad offsetem kontury pro strategie (`offsetXAt`, `traceOffsetPath`, `findLeadOutEndZ`, `findPocketExitZ`) — továrna `makePassHelpers(offsetPath)` |
| `cam/zMirror.js` | Zrcadlení CAM světa v ose Z (hrubování „zleva" = zrcadlo pravé strany) |
| `cam/toolOffset.js` | Offset kontury o rádius plátku + přídavky (`buildRawOffsets`) — hrubovací (`offsetPath`) i hotovní referenční (`finishRefPath`). Nezaměňovat s `calculators/contourOffset.js` (CAD: polotovar z kontury) |
| `cam/interferenceGuides.js` | Mezní čáry hlídání geometrie destičky (VŽDY rovná úsečka) |
| `cam/toolEnvelope.js` | Obálka držáku (kolizní zóna): `makeHolderClamp` = mez v ose Z pro PODÉLNÉ průchody, `holderBottomProfile` = spodní hrana držáku pro ČELNÍ (mez v hloubce X) |
| `cam/materialRemoval.js` | Vizuální úběr materiálu při simulaci |
| `cam/collisionValidator.js` | Validace kolizí držáku na hotové dráze |
| `cam/holderGouge.js` | Akumulátor kolizí držáku (oranžové varování) |
| `cam/opParts.js` | Skládání programu z více operací (částí) — záznam části, obrobený polotovar pro další operaci, složení celého programu |
| `cam/gcodeMerge.js` | Spojení programů do jednoho (`mergePrograms`) — sdíleno s frontou „SPOJ G-KÓD" v CAM Editoru |

#### Přehrávání v reálném čase (`cam/feedRates.js`)

Simulace při rychlosti **1× jede reálnou rychlostí stroje**, ne po bodech
dráhy. `S.simProgress` zůstává podílem 0..1 v INDEXECH `simPath` (na tom
stojí progress bar, krokování i zvýrazňování řádků), ale animační smyčka
ho posouvá funkcí `advanceAlongPath(simPath, progress, dtSec × simSpeed,
params)`, která spotřebovává skutečný čas segment po segmentu:

- `G0` → **Rychloposuv (G0)** z parametrů (`rapidFeed`, výchozí 6000 mm/min);
  do G-kódu se nezapisuje, slouží jen pro čas a přehrávání,
- `G95`/`G99` (mm/ot) → `F × n`, kde `n = Vc·1000/(π·⌀)` omezené `LIMS`
  (u osy tedy limit otáček stroje), `G97` bere `S` rovnou jako otáčky,
- `G94`/`G98` → `F` přímo v mm/min; řezný posuv je shora omezen rychloposuvem.

Modální `F`, `S`, `G94…G99` a `LIMS` sbírá do bodů dráhy
`parseManualGCodeToPath` — počítá se tedy z toho, co v kódu **opravdu je**
(včetně ručních úprav), ne z parametrů panelu. Stejná funkce
(`pathTimeSeconds`) pohání odhad ⏱ nad plátnem, takže čas programu a doba
přehrávání při 1× sedí. Ubíhající čas v živém overlayi se čte z
`buildTimeProfile` (kumulativní časy dráhy, cachované na referenci
`simPath`) + `elapsedAtProgress` — ne přepočtem celé dráhy každý snímek. Vedlejší efekt návrhu: hustě vzorkovaný oblouk už
simulaci nezpomalí — rozhoduje délka a rychlost, ne počet bodů.

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

#### Čelní hrubování: střed nosu × povrch polotovaru

Dráha je vždy **střed rádiusové kružnice** špičky, ne řezný bod. Nos proto
sahá o `R` níž, než kam ukazuje souřadnice, a **stranou v ose Z také až o `R`**
(o `√(R²−dz²)` níž ve vzdálenosti `dz`). V `genFacePasses` z toho plynou tři
meze, které se nesmí zaměňovat za „povrch v tomhle Z":

| helper | co vrací | k čemu |
|---|---|---|
| `castingOuterOrNull(z)` | povrch odlitku, `null` mimo obrys | podklad pro ostatní |
| `xTouchAt(z)` | mez pro střed, nad níž nos **nic neodebere** (max `povrch+√(R²−dz²)` přes ±R) | filtr průsečíků + „řez vzduchem" |
| `rapidStartXAt(z,…)` | totéž + vůle, okno jen do **neobrobené** strany | výška nájezdu `pass.xStart` |

Pravidla, která z toho platí (každé z nich stálo reálnou vadu):

- Konec řezu (`xEnd`) se porovnává s `xTouchAt`, **nikdy** s `sRad` — jmenovitý
  průměr polotovaru je u odlitku jen jmenovka a bývá menší než skutečný obrys.
- Sjezd „na povrch" v emisi (`gcodeEmit.js`, větev `face`) jde na
  `max(xSurface, xEnd)` — pod cíl průchodu se **nesjíždí nikdy**; jinak nos
  sebere přídavek až na hotovou konturu.
- Okno pro nájezd se bere jen do neobrobené strany. Na obrobené straně už
  syrový obrys neplatí a clearance nad ním by hnala rychloposuv zbytečně nahoru.
- Evidence schodů pro hlídání držáku musí obsahovat i **pásy bez průchodu**
  (vypadlé už v generování) jako `raw` — jinak clamp pod nimi vidí vzduch,
  ačkoli tam stojí plná výška odlitku.

#### Dosah destičky × dosah držáku (čelně)

Dvě hlídání navazují a **každé platí jen na svém úseku**:

| úsek od špičky (osa Z) | co hlídá | sklon |
|---|---|---|
| 0 … `insertReachZ(prms)` | spodní hrana DESTIČKY | úhel natočení (např. 15°) |
| `insertBodyZ` … `hb.reach` | spodní hrana DRŽÁKU (`holderBottomProfile`) | dle nakresleného obrysu (typ. 20°) |

`insertReachZ` je povinná mez — hrana destičky za koncem břitu neexistuje.
Extrapolace „donekonečna" zvedla průchod o `dz·tan φ` i pro `dz` desítky mm
a přestala se obrábět celá levá polovina dílu.

Důsledek, který NENÍ chyba: u plochy rovnoběžné s osou Z (válec) nakloněná
destička nedojede na konturu — zadní hrana by pod ni zajela o `b·sin φ`.
Zůstane kužel a ⚠ panel to hlásí. Ta plocha patří podélnému hrubování.

#### Rychloposuv se ptá na DVĚ tělesa, ne na jedno

`safeRapidTo` (jediné hrdlo, kterým teče každý přejezd v emisi) testuje proti
živému modelu zbytku `rapidStock` **obojí**:

| co | funkce | proč nestačí to druhé |
|---|---|---|
| stopa DESTIČKY | `rapidHitsStock(x1,z1,x2,z2)` | špička může minout a držák přesto orat |
| obrys DRŽÁKU | `holderHitsRapid(x1,z1,x2,z2)` | držák je v Z tlustý a radiálně sahá stovky mm |

Práh je u obou 0,5 mm² — **týž, jaký používá `validateToolpath`**, a to je
záměr: generátor se musí ptát na totéž, na co se ptá kontrola, jinak
aplikace kolizi *najde*, ale generátor ji *neumí obejít*. Přesně tak vznikla
vada nalezená 13. 8. 2026 (`holder-region-roughing`: destička 0,0 mm², držák
135,3 mm²) — emise se řídila jen destičkou, nástroj po zanoření přejel v Z
napříč dílem v hloubce a teprve pak se zvedl. Správné pořadí je
**zvednout → přejet → sjet**; o to se stará větev `forceUp`.

Nezaměňovat s tím, co bylo 18. 7. 2026 zamítnuto: paralelní detekce nad
`passCutPts` (předemisní geometrie průchodu) se rozcházela se skutečně
vydaným `simPath` a dávala false positives. Ptát se smí jen na **konkrétní
právě emitovaný pohyb** — tedy na týž vstup, jaký uvidí validátor.

Hlídá to `tests/cam-collision-free.test.js` (plošně přes všechny fixtures).

#### Hloubka vrstev u natočené destičky (čelně)

Spodní hrana klesá od špičky k obrobené straně pod úhlem natočení, takže
**průchod nesmí jít hlouběji než předchozí vrstva**: ve vzdálenosti `dz` za ním
leží hrana o `dz·tan φ` níž. `enforceLayerDepth()` v `genFacePasses` to hlídá
nad HOTOVÝM seznamem průchodů a volá se **dvakrát** — před hlídáním držáku
(aby si držák počítal schody z konečných hloubek) a po něm (držák zvedá po
svém sklonu a pravidlo tím poruší). Obě hlídání smí hloubku jen zvedat, takže
se střídavým voláním nerozhoupou.

Dvě pravidla, bez kterých to hlásí stěnu tam, kde je vzduch:
- **osa není materiál** — dno pod ~0,5 mm znamená „za destičkou nic nezbylo",
  další vrstva smí taky až na X0;
- **pás bez průchodu je stojící materiál** — jde se po celé marche mřížce
  (`zList`), ne jen po existujících průchodech.

Syrový (neobrobený) pás se přitom měří jinak než hotová vrstva:
- **po celé šířce kroku**, ne jen ve svém mřížkovém Z — krok 3 mm mine dosah
  břitu (8,68 mm u b10/−15°) a zadní hrana pak plave až 0,7 mm POD povrchem;
- **proti OFFSETOVÉ ČÁŘE polotovaru** (`povrch + faceOffsetOut`), ne proti
  holému povrchu: programovaný bod je střed nosu, tělo destičky leží o offset
  níž a reálný nůž má hned za destičkou držák.
Hotová vrstva zůstává měřená svým `xEnd` — tam žádný offset nepatří.

Důsledek, který NENÍ chyba: na ploše rovnoběžné s osou vzniká kužel pod úhlem
destičky a po pár vrstvách hrubování vyjede nad polotovar. Tam už čelně není co
brát — ta plocha patří podélnému hrubování.

**Kužel se ale musí nechat DOJET ven.** Dřív march končil přesně na hraně
polotovaru (`marchEndZ`), takže kužel neměl kam dojet a na jeho konci zůstal
schodek, který by ještě jedna vrstva vzala. `faceRunOut` proto prodlouží marche
mřížku (`zList`) o offsetovou čáru polotovaru (rádius nosu + přídavek +
dokončovací přídavek) za konec polotovaru — vrstvy pokračují po kuželu až ven.

Dojezd se úplně vynechá tam, kde kontura stoupá pod ÚHLEM NATOČENÍ DESTIČKY:
schod tam nevzniká, spodní hrana ten tvar udělala už řezem, a dojezd by jen
třel po hotovém povrchu (na dílu uživatele 39 ze 45 dojezdů; úběr shodný na
0,01 mm²). Podmínka je „CELÝ na tom kuželu" — stačí jeden oblouk nebo úsek
s jiným sklonem a dojezd jede, protože tam schod zůstává.

Pravidlo „nikdy hlouběji než předchozí vrstva" platí i pro DOJEZD „bez
schodků": ten jede po kontuře k obrobené straně, takže by pod kužel spodní
hrany sjel úplně stejně (nález uživatele 19. 8. 2026: dojezd na X21,62, kužel
z předchozích vrstev na X22,32). Ořezává se proto proti dvěma limitům — kuželu
destičky a mezi držáku — a rozhoduje ten VYŠŠÍ. Obojí se ořezává USEKNUTÍM
úsečky v místě průsečíku, ne zahozením celého úseku: na strmém čele jde o jeden
úsek přes 23 mm v X a zahození celku tam nechávalo schodek. Oblouk se dál řeší
celý (ořez oblouku by změnil jeho střed i poloměr).

Dvě věci, které se přitom NEmění:
- **hloubka** — pravidlo „nikdy hlouběji než předchozí vrstva" platí dál, doběh
  jen přidává vrstvy dál v Z (každá o `ap·tan φ` mělčí);
- **„neobrábět vzduch"** — průchod, jehož konec vyjde nad mez dotyku nosu
  (`xTouchAt`), se pořád zahodí. Doběh tím sám přestane, jakmile kužel vyjede.

V zóně doběhu svislice obrys polotovaru MINE, takže `castingOuterAtZ` tam vrací
povrch na nejbližším Z, kde polotovar ještě je — ne jmenovitý `sRad` (ten u
odlitku bývá úplně jinde a nájezd i mez dotyku by skákaly o desítky mm). Jen
v zóně doběhu: bez něj se `sRad` chová přesně jako dřív.

Totéž platí na konci KAŽDÉHO ÚSEKU, ne jen celé marche — za stěnou nebo u čela
příruby úsek skončí a schodek zůstane stejně. `appendRegionRunOut()` přidá na
konec úseku **právě jednu** vrstvu s `xEnd = předchozí + krok·tan φ`.

**POŘADÍ hlídání je součástí algoritmu.** Doběh se rozhoduje podle toho, jestli
na dalším Z ještě průchod JE („úsek pokračuje sám“) — a právě ty průchody
zahazuje hlídání držáku. Proto se `holderGuardFace()` volá **dvakrát**, doběh
běží mezi těmi voláními:

```
enforceLayerDepth()  →  holderGuardFace(false)  →  appendRegionRunOut()
                     →  holderGuardFace(true)   →  enforceLayerDepth()
```

Když doběh běžel jako první, viděl konce úseků o vrstvu (i o několik) dál, než
kam se reálně dojede, a na skutečné konce se už nikdo nevrátil. U natočené
destičky to vycházelo náhodou — `enforceLayerDepth()` je polygon-only a ty
průchody zahodilo dřív; u **upichováku** hloubka vrstev neběží vůbec, takže
zůstaly tři nedojeté konce (čelo příruby, konec úseku, levý konec — nález
uživatele 19. 8. 2026). Druhé volání není kosmetika: průchod přidaný za
držákem bez jeho kontroly jsou změřené 3 kolize (rapid@X66,2 Z195,0;
holder@X62,0 Z195,0; rapid@X64,0 Z197,0). Opakování je bezpečné ze stejného
důvodu jako u `enforceLayerDepth()` — clamp hloubku jen ZVEDÁ. Počítadla
varování (`holderAdjusted`/`holderDropped`/`holderTrimmed`) proto leží MIMO
funkci: druhé volání už obvykle nemá co zvedat, a s počítadly vevnitř by
⚠ z prvního volání zmizelo úplně (30 zkrácených + 16 vynechaných průchodů
přestalo být hlášeno).
Dvě pravidla, bez kterých to škodí:
- **kdy se nepřidá na mřížkové Z** — když `xEnd − povrch > délka břitu · tan φ`,
  destička nad materiálem VISÍ; hrana tam nedosáhne a jako první se materiálu
  dotkne druhá strana plátku a držák (změřeno na čele příruby: konec řezu 45 mm
  nad povrchem → validátor hlásil kolizi držáku i rychloposuvu). Tehdy se ale
  hledá **hrana materiálu** mezi mřížkovými Z (krok 0,05 mm) a vrstva se posadí
  za ni — co nejdál, ale ne dál než `2 · R nosu` od předchozího průchodu, aby se
  stopy nosů překryly. Bez toho zůstal na čele příruby nedojetý proužek 1,65 mm.
  Dvě meze, obě změřené: dál než `2 R` proužek jen podjede a zůstane tam celý;
  a posadit nos STŘEDEM rovnou na offsetovou čáru polotovaru nejde — validátor
  hlásí 3 kolize (destička i rychloposuv), o 0,5 mm blíž ještě jednu, protože
  držák jede nad ještě neodříznutým proužkem. Proto se za průchodem na hraně
  materiálu přidá DRUHÝ, jehož střed nosu po offsetové čáře sjede: pořadí to
  vyřeší (proužek je do té doby pryč) a offsetová čára je mez, kam až smí sahat
  skutečný odlitek — na jmenovitém kuse tedy neubere nic (změřeno: shodný úběr
  na 0,05 mm), na nadměrném ano;
- **co po sobě nechá** — do `done` (hloubka vrstev) i do `stair` (držák) patří
  jako SYROVÝ povrch, ne jako rovné dno na `xEnd`. Jeho konec leží na kuželu
  předchozího průchodu, tedy NAD povrchem; zapsat ho jako dno udělá falešnou
  stěnu a ta srazí začátek dalšího úseku (změřeno: úsek od Z29,932 celý vypadl).

Doběh platí pro **natočenou polygonovou destičku** i pro **upichovák**; u kulaté
nenatočené hrana za nosem netáhne, `faceRunOut` je 0 a výstup je bajtově shodný.
U upichováku je `toolAngle` 0, tedy `tanR` = 0 a vrstva navíc leží ve **stejné**
hloubce — přesto něco vezme, protože dojede dál v Z, kam se při marchování po
`ap` žádná mřížková vrstva nedostala. `tanR` se počítá jako
`max(0, −toolAngle)`: bez toho by kladný úhel (a u upichováku nula) dal
záporný tangens, tedy vrstvu HLOUBĚJI — pravidlo „nikdy hlouběji“ naruby.

#### Dojezd v ROHU a obálka upichováku

Dvě vady, které se u čelního hrubování upichovákem sčítaly do jedné divně
vypadající dráhy v rozích (nález uživatele 19. 8. 2026):

1. **Obálka plátku převzorkovávala rovné úsečky na tětivy.** U upichováku se
   dojezd nenahrazuje offsetem, ale `samplePartingEnvelope()` — dráhou bodu tak,
   aby prošlo CELÉ tělo plátku. Vzorkovalo se po 0,4 mm a **zlomy předlohy na
   mřížku nepadly**: rovné čelo Z138,785→139,523 (29,6 mm v X) vyšlo jako tři
   tětivy a poslední měla 4× větší sklon než čelo (`X9.943 Z139.807` místo
   Z139,523) — dráha z rovné offsetové čáry vyjela na stranu vzduchu. Funkce
   proto přijímá `breakZ`: vzorkovací mřížku doplní o Z zlomů vystopovaného
   dojezdu (`traceOffsetPath`) a kolineární redukce zbytek slije zpátky do jedné
   úsečky. Vzorků nemůže ubýt, takže se obálka nikde nesníží — jen zpřesní.
2. **Dojezd pokračoval po plášti, kde už schod nebyl.** Když po sloupnutí schodu
   kontura zahne do stěny ROVNOBĚŽNÉ S OSOU (konstantní X, pohyb jen v Z), nůž
   tam už jen tře. Dojezd se v tom rohu utne — ale **s přesahem 0,4 mm**, ne
   přesně v rohu: to není obráběcí pravidlo, ale numerická rezerva pro dynamický
   model polotovaru (`rapidStock`). Když dráha skončí přesně na rohu, stopy
   sousedních průchodů se jen DOTKNOU a v modelu zůstane JEHLA — na `part-16`
   zbytek na Z243,5 vyskočí z 10,41 na 16,17 mm (sousedí 11,06 a 9,67) a
   `finDeepCut` na ni zahodí CELÝ dokončovací úsek po kuželu: 19 mm²
   neobrobeného a falešné ⚠.

   Utne se **jen roh za sloupnutým schodem** (osový úsek na indexu ≥ 1). Dojezd,
   který je osový už od začátku, je jiný případ — tam žádný schod sloupnutý
   není a běh po plášti materiál ODEBÍRÁ: zahození všech = **+75 mm²** zbytku
   na `part-16` (včetně výjezdu po kuželu, který na osový úsek navazuje).
   Přesah se NEVÁŽE na rádius nosu: u kulaté destičky R8 by spolkl celý osový
   úsek a ořez by na `part-18` nikdy nenastal.

#### Dva modely nástroje pro úběr

`toolFootprint` (plánování + validace kolizí) je aproximace „stadion";
`toolFootprintVisual` (simulace úběru) je skutečný obrys destičky. Rozdělené
zůstávají schválně: skutečný obrys nakloněné destičky visí až `b·sin φ` POD
programovaným bodem, což `rapidStopX` (vůle + rádius nosu) neumí — výměna
obrysu i pro plánování jen vyrobí hlášení kolizí, která plánovač neobejde.
Sjednotit je až s hlídáním spodní hrany v rychloposuvech.

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
    Pole na ruční zápis G-kódu **není zrcadlo `#cncOutput`** (obsah drží
    localStorage, 🔄/Ctrl+Enter ho pouští přes `bridge.renderCncCodeToCanvas`
    – sdílená `applyGcodeText()`, ať tlačítko a zkratka nedělají dvě mírně
    odlišné věci), ale `createAnother()` do něj po každém **OK** připíše
    `appendGcodeForObject()` – řádek(y) pro právě vytvořený objekt ve
    stejném formátu, jaký appka vypisuje jinde (`bridge.formatAbsCoord()`,
    nová exportovaná funkce ve `storage/fileIO.js` – stejná konvence
    os/jednotek jako `runCncExport()`, ale bez vazby na INC režim).
    Bod/kružnice nejsou pohyb → zapíšou se jako komentář. Navazující
    `G00` se vynechává, když nový začátek sedí
    s koncem posledně připsaného řádku (closure `lastAppendedGcodeEnd`) –
    jinak by chain-kreslení „bod za bodem" bylo plné zbytečných rapidů.
    Shoda se počítá s tolerancí `1e-3`, ne `1e-6` – počáteční pole se
    přednaplňuje ze `state.numDialogChain` zaokrouhleně na 3 desetinná
    místa, takže i beze změny uživatelem vznikne při odeslání formuláře
    (zaokrouhlení tam a zpátky přes `safeEvalMath()`) rozdíl řádu `1e-4`;
    s `1e-6` řetěz „vypadával" už od druhé navazující úsečky (stejná
    tolerance a stejný důvod i u `joinsPrevious` v `createObject()`, kde
    se z tohohle stejného rozdílu nepoznával roh k zaoblení).
    **Past:** `lastAppendedGcodeEnd` (a `prevLineEnd` o kus níž) je
    closure proměnná – při KAŽDÉM otevření okna se zakládá znovu jako
    `null`, ale text v `#num-gcode` je z localStorage a zavření okna
    přežívá. Po načtení textu se proto obě OBNOVUJÍ přes
    `bridge.gcodeTextLastPoint(gcodeEl.value)` (stejný parser jako 🔄),
    ať appka po zavření/znovuotevření nezapomene, kam zápis dojíždí
    (jinak: zbytečné `G00` navíc + zaoblení/zkosení rohu nenajde roh
    k připojení).
    `createAnother()` po úspěšném vytvoření taky volá `autoCenterView()`
    (`canvas.js`) – bez toho při řetězení snadno vyjede kresba mimo výřez.
    **Zaoblení/zkosení rohu jedním krokem, rovnou jako G1+G2/G3:** u
    úsečky s existující `prevLineEnd` se v `cornerInlineFieldHTML()`
    zobrazí nepovinný řádek (přepínač `cornerInlineMode` + pole
    `#ncorner`). `createAnother()` po vytvoření volá
    `applyInlineCornerIfRequested(g)` – pokud je pole vyplněné a nová
    úsečka fakt naváže (`lastLineCorner` se nastaví v `createObject()`),
    zavolá `bridge.filletChamferAtCorner()` (skutečná trimovaná geometrie
    na plátně, stejná jako nástroj na plátně) a výsledek pošle do
    `applyCornerGcode()`. Když pole zůstane prázdné, `cornerToolsHTML()`
    (❌ NENÍ totéž jako `cornerInlineFieldHTML()` – ta druhá se ukazuje
    PŘED vytvořením, tahle AŽ PO) nabídne stejnou operaci jako záložní
    krok navíc (`applyCornerTool()`) – volá tytéž dvě funkce.

    `bridge.filletChamferAtCorner()` (a `applyFilletChamfer()`/
    `_applyTwoLines()`/`_applyLineAndArc()` pod ním, `tools/filletChamferClick.js`)
    teď VRACÍ geometrii spojovacího prvku (`{arc}` nebo `{line}` – stejný
    tvar jako `filletTwoLines()`/`chamferTwoLines()` v `geometry.js`), ne
    jen `true`/`false` (funkce dřív nic nevracely; `handleFilletChamferClick()`
    kontroluje jen truthiness, takže je to zpětně kompatibilní).
    `applyCornerGcode()` v `numericalInput.js` z ní zapíše PŘÍMO skutečnou
    G1+G2/G3 dráhu do ručního zápisu G-kódu – přesně to, co by appka
    napsala po stisku „⌒ Sražení/zaoblení → dráha" (`convertCornersToPaths()`)
    přímo v CNC Editoru, jen bez mezikroku s CHF=/RND= markerem (ten se
    v dřívější verzi téhle funkce psal – zavrženo, protože uživatel chtěl
    rovnou hotovou dráhu).

    Řádek, na který se dráha zapisuje, se hledá přes
    `findLineIndexEndingAt(wx, wy)` – porovná text řádku s
    `bridge.formatAbsCoord()` naformátovanou souřadnicí rohu, ne podle
    pořadí/indexu (to jednou způsobilo bug: zápis skončil na ŠPATNÉM
    řádku, protože `appendGcodeForObject()` mezitím pro DALŠÍ prvek
    přepsala „poslední připsaný index" na jednoduchém čítači) – spolehlivé
    bez ohledu na to, kolik řádků mezitím přibylo.

    **Past s pořadím bodů:** `filletTwoLines()` interně PŘEHAZUJE
    start/end úhel oblouku, aby zůstal MENŠÍ (minor arc, viz komentář „Ensure
    CCW sweep... is the minor arc" v `geometry.js`) – po tomhle přehození
    už nejde spolehnout na to, který z obou konců spojovacího prvku patří
    „straně před rohem" a který „za rohem". `applyCornerGcode()` to řeší
    porovnáním vzdálenosti k `line2FarPoint` (neořezaný vzdálený konec
    úsečky za rohem, dodá volající) – blíž k němu je vždycky strana ZA
    rohem, bez ohledu na interní pořadí. Stejná past a stejné řešení jako
    `convertCornersToPaths()` v CNC Editoru (`js/calculators/cncEditor.js`).
    Ověřeno round-tripem: výstup `applyCornerGcode()` porovnaný ručně
    s výstupem `convertCornersToPaths()` pro tentýž roh – identická dráha.

    **Past se směrem G2/G3:** `filletTwoLines()` u výsledného oblouku
    VŮBEC nenastavuje `.ccw` (vrací jen `{type:'arc', cx, cy, r,
    startAngle, endAngle}`) – spoléhat na `arc.ccw !== false` proto vyjde
    vždycky `true` (žádná hodnota `!== false`), a appka by psala pořád
    stejné písmeno bez ohledu na skutečnou geometrii. Směr se počítá
    NEZÁVISLE křížovým součinem bodů před/za rohem kolem středu, přímo
    VE WORLD ROVINĚ (x,y) – stejná role, jakou má `parseGcodeToObjects()`
    (`storage/fileIO.js`) při zpětném čtení R-formátu oblouku (`ccw:
    thisMotion === 3` bráno přímo po `toCanvas()` – ta je jen přejmenování
    os podle machineType, ne zrcadlení, takže world ccw/cw sedí s G2/G3
    stejně pro soustruh i karusel).

    **Past č. 2 (odhalena až dodatečně, na karuselu):** první verze téhle
    opravy počítala křížový součin V G-KÓD ROVINĚ přes `toGcodePlane()`
    (world→G-kód osy), vzorcem okopírovaným z `convertCornersToPaths()`
    v CNC Editoru. Ten vzorec ale implicitně předpokládá roli Z=vodorovná
    osa/X=svislá osa – sedí to na soustruh (kde `toGcodePlane` osy
    PROHAZUJE, `gz=world x, gx=world y`), ale ne na karusel (kde
    `toGcodePlane` je 1:1, `gx=world x, gz=world y` – role gx/gz jsou
    OPAČNÉ než co vzorec čeká). Výsledek: u karuselu vyšel křížový součin
    s opačným znaménkem → G2/G3 obráceně, jen u karuselu (soustruh round-trip
    testem procházel, protože tam se role náhodou shodovaly). Počítáním
    přímo ve world rovině (bez převodu do G-kód roviny vůbec) odpadl důvod
    k případu-po-případu rozlišování a platí to pro oba typy stroje stejně.
    Ověřeno round-tripem (`originalArc` z `filletChamferAtCorner()` před
    zápisem vs. `reparsedArc` zpětně naparsovaný z vlastního zápisu přes
    🔄, přes `bridge.renderCncCodeToCanvas()`) – identické cx/cy/r na
    milimetry přesně, pro soustruh i karusel, včetně obou směrů (G02 i G03)
    a víc než jedné orientace rohu.

    `fitCadViewToNumPreview()` (⤢, přes `bridge.fitNumPreviewView`) dává
    přednost OBSAHU editoru před `state.numPreview` (živý náhled
    formuláře) – ten se tím, co se píše do editoru, vůbec nemění, takže
    slepé použití by po napsání/vykreslení G-kódu odskočilo na zastaralý
    bod z polí. Bounds editoru počítá `bridge.gcodeTextBounds()`
    (`storage/fileIO.js`) – stejný parser jako `parseGcodeToObjects()`
    (co používá 🔄), ale bez vedlejších účinků na plátno, takže jde rámovat
    i PŘED odesláním.

    Oblouk zadaný začátkem/koncem/R staví `arcFromEndpointsRadius()`
    (`js/utils.js`) – tutéž funkci používá i `parseGcodeToObjects()` pro
    `G02/G03 … R`, takže formulář a G-kód dají identický oblouk.
    Ručně psaný kód projde `normalizeGcodeText()` (`js/gcodeNormalize.js`) –
    parser tak nemusí znát lidské varianty zápisu (malá písmena, mezery,
    desetinná čárka, výrazy) a normalizace se dá testovat samostatně.
    `parseGcodeToObjects()` (`storage/fileIO.js`) vrací `{ objs, warnings }`
    (dřív jen pole `objs`) – `warnings` sbírá `G02/G03 … R` řádky, kde je R
    kratší než půlka vzdálenosti bodů (geometricky nesestrojitelné, dřív se
    tiše přeskočily beze stopy). Oba volající (`renderCncCodeToCanvas`,
    `importCncFile`) je hlásí toastem s číslem řádku a `console.warn` se
    všemi detaily naráz.
  - **Flexbox past: `.sn-help-details` má `overflow: hidden`** (kvůli
    zaobleným rohům jinde v appce). Ve flex sloupci to podle specifikace
    mění automatickou minimální výšku prvku na `0` – bez `flex-shrink: 0`
    by ho flexbox v tísni s klidem smrskl a OŘÍZL, místo aby nechal
    scrollovat obal. `.tab-scroll > * { flex-shrink: 0; }`
    (`css/style.css`) tohle plošně vypíná pro všechny přímé děti – platí
    pro obě záložky okna „Zadání objektu". Kdyby se `.tab-scroll` použil
    jinde s dítětem, které má vlastní `overflow`, hlídat totéž.
  - **`pointer-events` past: cokoli připojené přímo do `.calc-overlay`
    (sourozenec `.calc-window`, ne jeho potomek) zdědí
    `.calc-overlay-float { pointer-events: none }`** (schválně – plovoucí
    okno má nechat klikat na plátno pod sebou) a NEDOSTANE zpátky `auto`,
    protože ten přepíná jen `.calc-window`. Přesně tohle rozbilo popup
    kompasu rychlé volby úhlu (`wireAngleCompass()` v `numericalInput.js`
    ho appenduje do `root` = `.calc-overlay`) – byl neklikatelný a
    kompletně mimo hit-test (`elementsFromPoint` ho přeskakovalo, klik
    propadl na to, co bylo pod ním). Cokoli nového takhle připojovaného
    potřebuje vlastní `pointer-events: auto`.
  - **Z-index vrstvy plovoucích oken:** `.calc-overlay` (obyčejný modal)
    200, `.calc-overlay-float` (VK/Číselné zadání) 300, `.input-overlay`
    (`makeInputOverlay()` – offset/mirror/rotate/fillet…) 350. Skutečné
    rozhodovací dialogy s neprůhledným pozadím (`.input-overlay`) mají být
    NAD plovoucím oknem, i když ho vyvolá tlačítko UVNITŘ něj (např.
    ⌒/⌿ v číselném zadání) – jinak se dialog schová pod oknem, ze kterého
    vznikl.
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
