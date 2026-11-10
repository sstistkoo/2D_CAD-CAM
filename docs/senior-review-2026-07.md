# SKICA – Senior Code Review / Tech Debt Audit

>Vytvozeno: 2026-07-27  
>Verze projektu: 1.7.0  
>Stav: nevyresene poznámky k pozdejsi praci

---

## 1. Kriticke / vysoké riziko

### a) `js/events.js` je „spaghetti dispatcher“ (god file)
- **1500+ radku.**
- Obsahuje: globalni `keydown` handler se switchy na tooly, multi-select wrappery (`perpMultiAlign`, `horizontalMultiAlign`, `parallelMultiAlign`), logiku prorotaci, mazani, undo/redo klavesami, kontextove menu.
- Primo vola mnoha `bridge.*` callbacku.

**Riziko:** Kazda uprava toolu musi zasahovat do `events.js` navsic k dedicated handeru v `js/tools/*.js`. Porusuje Single Responsibility.

**Navrh:** Rozdelit na:
- `js/events/mouseEvents.js`
- `js/events/keyboardEvents.js`
- `js/events/selectionEvents.js`
- `js/events/contextMenu.js`

Kazdy tool handler by mel byt registrovan jako listener pri importu svujho modulu (podle `docs/developer.md`).

---

### b) `js/state.js` je „mega-state“ s docasnymi priznaky
`state` obsahuje:
- trvala data (`objects`, `layers`, `undoStack`…),
- docasna UI data (`tempPoints`, `_polylineBulges`, `_profileTraceBulges`, `_parallelRefIdx`, `_rotateObjects`, `_mirrorObj`…),
- UI callbacks skrze `bridge` (`renderAll`, `updateObjectList`…).

`resetDrawingState()` je dlouhy seznam `state.xxx = null`. Pokud nekdo zapomene resetnout priznak, zustane „zombie state“.

**Navrh:**
- Vytvorit `js/state/toolSessionState.js` pro docasny stav toolu (např. `toolSession.polyline = { tempPoints, bulges }`).
- `resetDrawingState()` nahradit `toolSession.clear()`.
- State rozdelen na:
  - `persistentState` (projects, layers, settings)
  - `sessionState` (selection, ui flags)
  - `toolState` (temp drawing data)

---

### c) Undo/Redo: celkove JSON snapshots
```js
state.undoStack.push(JSON.stringify({ objects: state.objects, anchors: state.anchors }));
```

**Problemy:**
- Pametove drahe (cela historie),
- Pomaly (parse/stringify + replace celych poli),
- Zbytecne (vetstina zmen je lokalni – posun 1 body, jedna usecka).

**Navrh:**
- Kratsí mid-term: inverse operations (addObject → removeObject, moveObject → {dx, dy}).
- Dlouhodobe: operational transform / command pattern.

---

### d) Skryty mutace v `geometry.js`
`calculateAllIntersections()` upravuje objekty in-place (např. pri „point-on-object“ presune bod `objs[i].x/y`) a **vola `renderAll()`** uvnitr ciste geometrickefunkce.

**Riziko:** Volajici `calculateAllIntersections()` neocekava, ze se zmeni stav vykresu ci objekty.

**Navrh:** Rozdelit na:
- `computeIntersections()` – cista funkce, vraci pole pruseciku.
- `applyIntersectionSnapping()` – mutuje objekty (presun bodu na objekt).
- `refreshIntersections()` – wrapper pro UI volani (vola render + update list).

---

### e) CSP: hardcodovany SHA256 pro dev SW clear
V `index.html`:
```html
script-src 'self' 'sha256-vvt4KWwuNr51XfE5m+hzeNEGhiOfZzG97ccfqGsPwvE=';
```

Tento hash odpovida inline skriptu, ktery maze SW cache na localhostu. Pokud se ten skript zmeni, hash se rozpadne a **cela aplikace spadne na CSP violation**.

**Navrh:**
- Presunout clear-logic do `sw.js` (detekce dev environmentu), NE do inline scriptu.
- NEBO odstranit inline skript a použít `'unsafe-inline'` jen pro dev, produkcne `'self'` + SW mit externim JS.

---

## 2. Vyznamna technicka dluha

### a) Duplicitni serializace save payloadu
`js/app.js` ma ~25 raddek identickeho objektu pro auto-save abeforeunload`. Pokud pridas nove pole do `state`, snadno zapomenes prida ho do obou mist.

**Navrh:**
```js
export function serializeProjectState() {
  const s = state;
  return {
    version: 1.7,
    objects: s.objects,
    intersections: s.intersections,
    nextId: s.nextId,
    gridSize: s.gridSize,
    // ... vsechna trvala pole
  };
}
```

---

### b) `js/render.js` je monolith renderer s preview vsech toolu
`renderObjects()` ma vnocene bloky pro preview:
- line / circle / rect / arc / polyline / measure / tangent / parallel / dimension / chain dimension / profile trace / copyPlace / angle dim / snap point…

**Navrh:**
- Vytvorit `js/render/previewRegistry.js` – kazdy tool registruje svou preview funkci.
- `renderObjects()` jen iteruje `previewRegistry.entries()`.

---

### c) `js/bridge.js` je „callback soup“ bez typove bezpecnosti v runtime
`bridge` je prosty objekt s ~40 nullable polozkami. Pokud se inicializace modulu zmeni, nejaky callback zustane `null` a aplikace tichince selze.

**Navrh:**
- `ensureBridge()` funkce, ktera pri inicializaci overi, ze vsechny povinne callbacksou nastaveny.
- NEBO prejit na ES importy tam, kde je to mozne (nejen skrze `bridge`).

---

### d) IndexedDB uklada celu undo historie
Auto-save uklada `undoStack` a `redoStack`. Historie se opakovane serializuje do IDB.

**Navrh:** Ukladat jen `currentProjectData` bez undo/redo. Historie jeinterni UI stav, ne projektova data.

---

### e) Hardcoded mobile breakpoint v `js/objects.js`
```js
if (window.innerWidth <= 900 && state.objects.length === 1) {
  autoCenterView();
}
```

**Navrh:** Presunout do `constants.js` jako `MOBILE_AUTOCENTER_WIDTH_THRESHOLD`.

---

## 3. Drobná vylepšení / hygiene

| # | Problem | Lokalizace | Navrh |
|---|---------|------------|-------|
| 1 | Magic cisla (`1e-9`, `13px Consolas`, `0.35`) rozesiate po kodu | `geometry.js`, `render.js`, `state.js` | Presunout do `constants.js` |
| 2 | Spam `renderAll()` v cyklu (gear, array, boolean) | `objects.js`, tools handlers | Pouzivat `renderAllDebounced()` nebo `requestAnimationFrame` batching |
| 3 | Duplicitni save payload (autosave + beforeunload) | `js/app.js` | Sjednotit do `serializeProjectState()` |
| 4 | `index.html` je >1800 radku, inline SVG ikony se opakuji | `index.html` | Zváz generovani toolbaru z datove struktury |
| 5 | `sw.js` cache strategie neni explicitne definovana | `sw.js` | Pridat komentar, zda je `CacheFirst` ci `StaleWhileRevalidate` |
| 6 | Touch + Mouse mohou volat stejne akce najednou | `events.js` + `touch.js` | Otestovat scénar, kdy se oba triggeruji |
| 7 | `<canvas>` ma `<p>` fallback – nie idealni pro ctecky obrazovky | `index.html` | Presunout fallback text mimo canvas |
| 8 | `state.selectedPoint` je `null` nebo `Array<Point2D>` – nepruznost v typech | `state.js` | Normalizovat na vzdy `[]` nebo prida `isPointMode` flag |

---

## 4. Navrh priorits (roadmap)

| Priorita | Problem | Odhad |
|----------|---------|-------|
| 🔴 Vysoka | God file `events.js` | 2-3 dny |
| 🔴 Vysoka | God file `state.js` + docasna priznaky | 3-4 dny |
| 🔴 Vysoka | Full-state undo snapshots | 3-5 dnu |
| 🔴 Vysoka | `calculateAllIntersections()` mutuje stav + renderuje | 1 den |
| 🟡 Strední | Monolith `render.js` s preview vsech toolu | 2-3 dny |
| 🟡 Strední | Duplicitni serializace save payloadu | 1 hod |
| 🟡 Strední | Bridge jako callback soup bez guardu | 1 den |
| 🟡 Strední | Hardcoded SHA256 CSP hash | 30 min |
| 🟢 Nizka | Magic constants, inline SVG toolbar | 2-3 hod |
| 🟢 Nizka | Souradnicove transformace (test coverage) | 1 den |

---

## 5. Kontext pro praci

- Projekt ma 30+ testovacich souboru (vitest).
- Architektura: vanilla JS + ES moduly, 0 runtime zavislosti.
- Ukladani: IndexedDB + localStorage fallback.
- Offline: PWA se Service Workerem.
- Najdene relevantni soubory:
  - `js/events.js` (god file)
  - `js/state.js` (mega-state)
  - `js/render.js` (monolith renderer)
  - `js/geometry.js` (mutating calculations)
  - `js/app.js` (duplicitni serialization)
  - `js/bridge.js` (callback soup)
  - `index.html` (CSP hash)
  - `js/objects.js` (magic constants)
  - `js/calculators/cam/` (CAM pipeline – oddeleny, ale <=1000 radku)

Pokud bys chtel, mohu navrhnout konretni refactoring pro jednu z techto oblasti (napr. rozdeleni `events.js` na tool handlery, nebo zavedeni diff-based undo).
