# VK + Číselné zadání — sjednocený plán (MASTER)

Nahrazuje: `1785652765314-vk-numerical-unification-step1.md`,
`1785652765315-vk-canvas-integration-steps2-3.md`,
`1785597935256-vk-tangent-integration.md`.

Cíl (podle zadání):
1. Sloučit `📐 VK – Volná kontura` a `🔢 Číselné zadání objektu` do jednoho okna
   se dvěma záložkami, jednotné UI.
2. Zrušit vlastní VK canvas, kreslit náhled přímo na hlavní CAD plátno.
3. Okno udělat plovoucí/pohyblivé, spolupracující s plátnem (klik na plátno
   s otevřeným oknem), na mobilu pevně ukotvené.

---

## ČÁST A — Co bylo v původních plánech špatně

Ověřeno proti kódu. **Tyhle body je nutné respektovat, jinak se rozbije appka.**

### A1. `.calc-overlay-float` už existuje a používá ji plovoucí kalkulačka 🔴

`css/style.css:3018` už tuhle třídu definuje a `js/ui.js:3536` ji přidává
kalkulačce přes `overlay.classList.add("calc-overlay-float")`.
`js/calculators/camSimulator.js:240,248` podle ní skrývá/obnovuje plovoucí okna
při otevření CAM.

Oba plány ji **předefinovávají** (`width: 320px → 700px`, `top: 72px → bottom: 0`)
→ rozbily by vzhled kalkulačky.

**Správně:** třída je *aditivní modifikátor* nad `.calc-overlay`. Použít
`classList.add('calc-overlay-float')` a VK rozměry dát na novou třídu
`.vk-combined-window`, nikdy nepřepisovat `.calc-overlay-float .calc-window`.

### A2. Přepsání `className` rozbije duplicitní pojistku v `makeOverlay` 🔴

`js/dialogFactory.js:14`:
```js
if (document.querySelector(`.calc-overlay[data-type="${CSS.escape(type)}"]`)) return null;
```
Plán navrhuje `overlay.className = float ? "calc-overlay-float" : "calc-overlay"`.
Selektor `.calc-overlay` pak element nenajde → okno půjde otevřít vícekrát
(a `openVkContour` má stav v closure, takže by běžely dvě nezávislé VK relace
nad jedním `localStorage` klíčem).

**Správně:** vždy ponechat `calc-overlay` a float třídu jen přidat.

### A3. `numericalInput.js:14` shodí celou appku 🔴

```js
document.getElementById("btnNumInput").addEventListener("click", showNumericalInputDialog);
```
Bez `?.`. Plán (krok 1, §6) říká přejmenovat `btnNumInput` → `btnOpenVk`.
Jakmile to ID zmizí, tenhle modul při importu hodí `TypeError` a protože
`js/app.js` importuje kvůli side-effectům, **nenaběhne nic**.

**Správně:** veškeré drátování tlačítek přesunout z `numericalInput.js`
do `ui.js`/`touch.js` (kde už zbytek spouštěčů je) — modul má exportovat
jen funkce, ne si sám lovit DOM.

### A4. `mobileVk` neexistuje; chybí tři další spouštěče 🔴

Plán mluví o `<button id="mobileVk">` na `index.html:60` a o
`touch.js:150 → getElementById("mobileVk")`. Takové ID v repu **není**.

Skutečný stav (ověřeno greppem):

| Spouštěč | Kde | Volá |
|---|---|---|
| `btnNumInput` | `index.html:1253` (CAD toolbar) | `numericalInput.js:15` |
| `desktopNumInput` | `index.html:1868` (stavová lišta) | `numericalInput.js:18` |
| `mobileNumInput` | — | `touch.js:150` |
| klávesa `n` | — | `events.js:628` |
| `btnOpenVk` | `index.html:1825` (panel Další kalkulačky) | `ui.js:4062` |

Plán zná jen dva z pěti. **Všech pět musí ukazovat na `showCombinedModal`.**

### A5. Čísla řádků v obou plánech nesedí

`btnNumInput` 1359→**1253**, `btnOpenVk` 1954→**1825**, `ui.js` 4071→**4062**,
`events.js` 613→**628**, `insertTangentTransitions` 364→**374**.
Neřídit se čísly, řídit se jmény symbolů.

### A6. `render.js` nesmí importovat `vkContour.js` 🟠

`CLAUDE.md`: *„Bridge slouží jako zprostředkovatel mezi moduly – nevytvářet
přímé cyklické importy."* `renderAll()` (`render.js:47`) už přesně takhle volá
`bridge.updatePolylineButtons`, `bridge.updateTraceButtons`, …

**Správně:** `bridge.renderVkPreview` / `bridge.handleVkCanvasPick`.

### A7. Klik na plátno se řeší v `events.js`, ne v `canvas.js` 🟠

Dispatch je `events.js:922 handleCanvasClick(wx, wy)` — `switch (state.tool)`.
`canvas.js` žádný click handler nemá.

Horší je návrh chování: *„VK klik je obsloužen, ale nástrojový click se NEdále
blokuje."* To by při jednom kliknutí **zároveň** vložilo souřadnici do VK
formuláře **a** nakreslilo úsečku aktivním nástrojem.

**Správně:** převzít osvědčený vzor `pickFromMap` z `numericalInput.js:57` —
jednorázově „nabitý" odběr kliku (🎯 tlačítko u pole), klik se spotřebuje
a odběr se odzbrojí. Žádná kolize s nástroji, žádná změna `handleCanvasClick`.

### A8. Mobilní ukotvení překryje `#mobileBottomBar` 🟠

`#mobileBottomBar` má `z-index: 60; bottom: 8px`, tlačítka 48 px vysoká
(`css/style.css:1880`). Okno na `bottom: 0` s `pointer-events: auto` na něm
fyzicky sedí. Plán tvrdí, že to vyřeší `pointer-events` — nevyřeší,
`pointer-events: none` je na *overlayi*, ne na okně.

**Správně:** `bottom: calc(64px + env(safe-area-inset-bottom))`, nebo lištu
po dobu otevřeného VK panelu schovat.

### A9. `window.addEventListener('resize', scheduleRender)` se nikdy neodebírá 🟠

`vkContour.js:1672`. Každé otevření okna přidá další listener, který drží
referenci na zavřený overlay a jeho canvas. Při extrakci je nutné to uklidit
(`MutationObserver` jako v `dialogFactory.js:28`, nebo `AbortController`).

### A10. `makeOverlay` věší globální ESC → `overlay.remove()` 🟠

U plovoucího okna, které má koexistovat s kreslením, je ESC běžně „zruš
rozkreslený nástroj". Teď by navíc zavřel VK okno. Potřeba `closeOnEsc: false`
pro float variantu.

### A11. Plán 2 §2.2 si protiřečí

„Odstranit `fitViewportToPreview()`, `scheduleRender()`" a o pět řádků níž
„Zachovat `fitViewportToPreview()`, `scheduleRender()`".

Navíc `zoomVkViewport` / `screenToVkPoint` / `panVkViewport` **jsou po zrušení
VK canvasu mrtvé** — CAD plátno má vlastní zoom/pan (`canvas.js:91,100`).
Mají testy v `tests/vk-contour-preview.test.js:6-8,132-133`, takže se maže
kód i testy společně.

### A12. Mapování VK ↔ CAD v plánu 3.1 má prohozené osy 🔴

Plán: `CAD wx = VK x / 2`, `CAD wy = VK z`.

Skutečnost (`state.js:527-534`, `storage/fileIO.js:699-702`) — pro **soustruh**
je CNC X svislá (`wy`) a CNC Z vodorovná (`wx`); pro **karusel** obráceně.
Plán to má pro soustruh naopak. Totéž potvrzuje stávající `screenToVkPoint`
přes příznak `isKarusel` (`vkContour.js:188-197`).

**Správně** — nepsat vlastní vzorec, použít kanonické helpery z `state.js`:
```js
// CAD (interní, X = poloměr) → VK (zobrazované jednotky)
const isK = state.machineType === 'karusel';
const vkX = displayX(isK ? wx : wy);
const vkZ = isK ? wy : wx;
// VK → CAD
const r = inputX(vkX);
const [wx, wy] = isK ? [r, vkZ] : [vkZ, r];
```

### A13. VK má vlastní duplicitní převod jednotek 🟠

`vkContour.js:58-62` `toSolverX`/`fromSolverX` vs. kanonické
`state.js:465,474` `displayX`/`inputX`. Jsou konzistentní
(`toSolverX(v) === 2 * inputX(v)`), ale **dvojí konvence** je přesně to,
co způsobilo chybu tečnosti opravenou dnes (`insertTangentTransitions`
je aplikovala na surová čísla z textu a tiše zdvojnásobila `X20`).

**Správně:** před krokem 3 (kdy VK začne zapisovat do `state.objects`)
sjednotit na konvenci zbytku appky: **interně vždy poloměr**, převod
jen na hranici UI přes `displayX`/`inputX`. Řešič `vkSolver.js` počítá
v průměrech → převod ať dělá výhradně `vkContour.js` na jednom místě.

### A14. CSS unifikace je mnohem menší, než plány tvrdí ✅

Pravidla `.input-dialog *` (`css/style.css:1525-1620`) **nejsou zanořená pod
`.input-overlay`**. Když se `<div class="input-dialog">` ponechá jako obal
obsahu záložky, veškeré stylování (labels, inputy, `.btn-row`, `.btn-ok`,
`.btn-cancel`) funguje beze změny. Odpadá skoro celá „CSS унификace"
z plánu tečnosti.

### A15. Co bylo v plánech správně ✅

- Oddělení `{ html, init(container) }` — dobrý a nutný vzor.
- Znovupoužití `pickFromMap` z `numericalInput.js`.
- Jedno okno se dvěma záložkami jako UX rozhodnutí.
- `vkSolver.js` je čistý (bez DOM/state) → beze změny znovupoužitelný.
- Postup „nejdřív UI, pak canvas, pak logika".
- Diagnóza omezení řešiče v plánu tečnosti (body B, C, F) — **ověřeno, sedí**
  (`vkContour.js:1365, 1373`, `vkSolver.js:124`).

---

## ČÁST B — Kroky implementace

### Krok 0 — Příprava (bez rizika, samostatně mergovatelné)

**0.1** `js/dialogFactory.js` — `makeOverlay(type, title, bodyHTML, windowClass, opts = {})`:
```js
export function makeOverlay(type, title, bodyHTML, windowClass, opts = {}) {
  const { float = false, closeOnEsc = true, closeOnBackdrop = true } = opts;
  if (document.querySelector(`.calc-overlay[data-type="${CSS.escape(type)}"]`)) return null;
  const overlay = document.createElement("div");
  overlay.className = float ? "calc-overlay calc-overlay-float" : "calc-overlay";
  // ...
  if (closeOnBackdrop) overlay.addEventListener("click", …);
  if (closeOnEsc) { /* stávající ESC handler */ }
```
Řeší A1, A2, A10. Zpětně kompatibilní — pátý parametr je volitelný.

**0.2** `js/dialogs/numericalInput.js` — smazat řádky 14–19 (module-level DOM).
Přesunout do `ui.js`. Řeší A3.

**0.3** `js/calculators/vkContour.js` — sjednotit jednotky (A13):
`toSolverX`/`fromSolverX` vyjádřit přes `inputX`/`displayX` ze `state.js`
a doplnit k nim JSDoc, že *solver = průměr, zbytek appky = poloměr*.

**0.4** Opravit únik listeneru (A9).

**Ověření:** `npx vitest run tests/vk-contour-preview.test.js tests/vk-solver.test.js`
+ ruční otevření kalkulačky, VK i číselného vstupu.

---

### Krok 1 — Jedno okno, dvě záložky

**1.1 `js/calculators/vkContour.js` → rozdělit `openVkContour()`**

Soubor má 1904 řádků, `openVkContour()` je od 391 do konce jako jeden closure.
Rozdělit na:
```js
export function renderVkTab()            // → { html }        (čistá funkce)
export function initVkTab(container)     // → { destroy() }    (listenery + stav)
```
`initVkTab` dostane `container` a **všechny** `overlay.querySelector` uvnitř
se přepíšou na `container.querySelector`. Vrácené `destroy()` odebere
globální listenery (A9).

Canvas kód (`ensureCanvas` … `pointerleave`, tj. cca 597–1117) se v tomhle
kroku **jen odpojí od DOM** (canvas z HTML zmizí), funkce zatím nechat —
smažou se až v kroku 2, aby se dal krok 1 samostatně otestovat.

> Pozn.: `openVkContour()` zůstane jako tenký wrapper nad
> `showCombinedModal('vk')`, dokud nejsou přepsané všechny volače.

**1.2 `js/dialogs/numericalInput.js` → stejný rozklad**

`renderNumericalTab()` / `initNumericalTab(container)`.
`<div class="input-dialog">` **ponechat** jako obal (A14) — jen zahodit
`<h3>` (titulek nese titlebar) a `min-width:400px` inline styl.

**1.3 `js/dialogs/combinedModal.js` (nový, ~120 ř.)**

```js
export function showCombinedModal(initialTab = 'vk') {
  const existing = document.querySelector('.calc-overlay[data-type="vk-combined"]');
  if (existing) { switchTab(existing, initialTab); return existing; }   // A2

  const vk = renderVkTab(), num = renderNumericalTab();
  const overlay = makeOverlay('vk-combined', 'Zadání objektu',
    tabsHTML(vk.html, num.html), 'vk-combined-window',
    { float: false });            // float až v kroku 2
  if (!overlay) return null;

  const handles = {
    vk:  initVkTab(overlay.querySelector('[data-tab-content="vk"]')),
    num: initNumericalTab(overlay.querySelector('[data-tab-content="num"]')),
  };
  onOverlayRemoved(overlay, () => Object.values(handles).forEach(h => h?.destroy?.()));
  makeDraggable(overlay.querySelector('.calc-window'), overlay.querySelector('.calc-titlebar'));
  switchTab(overlay, initialTab);
  return overlay;
}
```
Titulek se mění podle aktivní záložky (rozhodnutí z plánu 1).

**1.4 `js/dialogs.js`** — přidat `export { showCombinedModal } from './dialogs/combinedModal.js';`

**1.5 Přepojit všech pět spouštěčů** (A4):

| Soubor | Změna |
|---|---|
| `js/ui.js:4062` | `btnOpenVk` → `showCombinedModal('vk')` |
| `js/ui.js` (nové) | `btnNumInput`, `desktopNumInput` → `showCombinedModal('num')` |
| `js/touch.js:157` | `mobileNumInput` → `showCombinedModal('num')` |
| `js/events.js:628` | klávesa `n` → `showCombinedModal('num')` |

`index.html` — tlačítka zatím **nepřejmenovávat** (jen upravit `title`).
Přejmenování ID je zbytečné riziko; udělat až úplně na konec, pokud vůbec.

**1.6 `css/style.css`** — `.vk-combined-window` (`width: min(700px, 95vw)`),
`.tab-bar`, `.tab-btn`, `.tab-content`. **Nesahat na `.calc-overlay-float`** (A1).

**1.7 Testy** — `tests/events.test.js:99`, `tests/integration.test.js:81`,
`tests/rectSelection.test.js:112` mockují `showNumericalInputDialog`.
Přidat do mocků `showCombinedModal: vi.fn()`.

**Ověření:** `npm test` + ruční průchod obou záložek (řešič, `localStorage`,
🎯 pick from map, chaining).

---

### Krok 2 — Plovoucí okno + VK náhled na CAD plátně

**2.1** V `showCombinedModal` přepnout na `{ float: true, closeOnEsc: false }`.

**2.2 CSS** — nová pravidla pod `.calc-overlay-float.vk-float`, aby se
nepřebila kalkulačka (A1):
```css
.calc-overlay-float .vk-combined-window {
  position: fixed; top: 64px; right: 16px; left: auto; transform: none;
  width: min(420px, 92vw); max-height: calc(100vh - 96px);
}
@media (max-width: 768px) {
  .calc-overlay-float .vk-combined-window {
    top: auto; right: 0; left: 0;
    bottom: calc(64px + env(safe-area-inset-bottom));   /* A8 */
    width: 100vw; max-height: 45vh; border-radius: 12px 12px 0 0;
  }
}
```

**2.3 `js/state.js`** — přidat:
```js
vkPreview: { visible: false, data: null },
```
(`segments`/`vpol`/`draft` už `buildVkPreviewData()` vrací pohromadě — není
důvod je v state rozbalovat, jak navrhoval plán.)

**2.4 `js/calculators/vkContour.js`** — místo `drawVkPreview(previewData, layout)`
na vlastní canvas nová **exportovaná** `renderVkPreviewOnCad(ctx)`, která
kreslí přes `worldToScreen()` z `canvas.js`. Mapování osy podle A12.
Registrovat `bridge.renderVkPreview = renderVkPreviewOnCad` v `initVkTab`,
v `destroy()` odregistrovat.

**Smazat** (A11): `ensureCanvas`, `clearCanvas`, `computeCanvasLayout`,
`drawGrid`, `drawPlaceholder`, `drawVkPreview`, `renderVkCanvas`,
`fitViewportToPreview`, `updateViewportFromPan`, wheel/pointer listenery,
`zoomVkViewport`, `screenToVkPoint`, `panVkViewport`
+ jejich testy v `tests/vk-contour-preview.test.js`.

**Zachovat:** `buildVkPreviewData`, `resolveVkArcGeometry`,
`buildAmbiguousSolutionPreview`, `pickVkAmbiguousSolution`,
`insertTangentTransitions` a celý řešič.

**2.5 `js/render.js`** — v `renderAll()` za `renderObjects()`:
```js
if (state.vkPreview?.visible && bridge.renderVkPreview) bridge.renderVkPreview(ctx);
```
Přes bridge (A6). Přidat `renderVkPreview: null` do `js/bridge.js`.

**2.6 Klik na plátno** — rozšířit `pickFromMap` z `numericalInput.js` do
sdíleného `js/dialogs/canvasPick.js` (~60 ř.) a použít v obou záložkách (A7).
U float okna už není potřeba `overlay.style.display = 'none'` — okno může
zůstat viditelné, jen zvýraznit cílové pole.
**Žádná změna `handleCanvasClick`.**

**2.7 Přepnutí záložky** nastaví `state.vkPreview.visible` a zavolá `renderAll()`.

**Ověření:** kreslení nástrojem s otevřeným oknem, drag okna, mobilní ukotvení
nad `#mobileBottomBar`, CAM otevření (camSimulator okno schová/obnoví).

---

### Krok 3 — VK jako geometrie výkresu (osekaný rozsah)

Původní plán 3 sahal až do DXF, CAM pipeline a `isVk` flagu — to je několik
samostatných epik. Doporučení: **udělat jen 3.1 a zbytek neplánovat dopředu.**

**3.1 `commitVkToDrawing()`** — jediná nová schopnost:
```
buildVkPreviewData() → segmenty → pushUndo() → addObject() per segment
                     → calculateAllIntersections() → renderAll()
```
- převod souřadnic **výhradně** přes helpery z A12/A13,
- `type: 'line'` / `'arc'` — obyčejné objekty, **žádný `isVk` flag**
  (jakmile jsou ve výkresu, jsou to normální objekty; DXF, CAM i export
  fungují zadarmo a odpadají kroky 3.4–3.7 původního plánu),
- konstrukční paprsky (`G0 … PA`) se **nekomitují** (jsou to pomůcky).

**Neřešit teď:** režim „kreslení VK klikáním" (plán 3.3). Nejdřív ať se
osvědčí commit; kreslicí režim je samostatné rozhodnutí.

---

### Krok 4 — Rozšíření tečnosti (až po kroku 2)

Priorita podle poměru užitek/riziko:

| # | Věc | Kde | Náročnost |
|---|---|---|---|
| 4.1 | Auto-výběr řešení místo chyby „zadejte VPOL1/VPOL2" — když je jedno řešení výrazně blíž `refPoint()`, vzít ho a jen informovat | `vkSolver.js:124`, `vkContour.js:1353` | malá |
| 4.2 | Srozumitelná hláška u degenerované osy zlomu místo prázdného pole | `vkSolver.js:318` | malá |
| 4.3 | `insertTangentTransitions` i mezi dvěma normálními prvky (teď jen po konstrukčním paprsku, `vkContour.js:354`) | `vkContour.js` | střední |
| 4.4 | Tečný oblouk jako **první** prvek řetězu | `vkContour.js:1373` | střední |
| 4.5 | Dva oblouky za sebou (esíčko bez úvodní přímky) | `vkContour.js:1365` | velká |
| 4.6 | Živý náhled tečného napojení na CAD plátně při psaní | závisí na 2.4 | střední |

Body 4.4/4.5 jsou dnes explicitní `throw` — nejde o chyby, ale o nepokrytou
matematiku. Řešit **až** bude UI stabilní, každý jako samostatná změna
s vlastním testem v `tests/vk-solver.test.js`.

**Nedělat** položky E, I, J z plánu tečnosti — `dedupePoints` s `1e-6`
je pro tenhle rozsah v pořádku a „rozumný rozsah středu" je subjektivní
heuristika, která by nadělala víc škody než užitku.

---

## ČÁST C — Testy

| Krok | Co spustit |
|---|---|
| 0, 1 | `npx vitest run tests/vk-contour-preview.test.js tests/vk-solver.test.js tests/events.test.js` |
| 2 | výše + `tests/integration.test.js`, `tests/rectSelection.test.js` |
| 3 | `npm test` (dotýká se `state.objects`) |
| 4 | cílené `tests/vk-solver.test.js` + nový test na každou položku |

Před PR/push `npm test` (CLAUDE.md).

> **Stav k dnešku:** `tests/cam-backside-mirror.test.js` a
> `tests/cam-traversal-invariants.test.js` padají na 5s timeoutu a
> `tests/events.test.js` má padající „fillet click" — **předchozí, nesouvisí
> s VK.** Nezaměňovat s regresí z těchto kroků.

---

## ČÁST D — Otevřené otázky (rozhodnout před krokem 2)

1. **Chování ESC** u plovoucího okna — zavřít okno, nebo nechat pro zrušení
   nástroje? Doporučení: nechat nástroji, okno zavírat jen křížkem.
2. **Zoom/pan VK náhledu** — po zrušení VK canvasu náhled sdílí zoom CAD
   plátna. Chceš tlačítko „přizpůsobit pohled kontuře" (fit na VK data)?
3. **Kdy commitovat** (krok 3) — tlačítkem „Vložit do výkresu", nebo živě?
   Doporučení: tlačítko, kvůli `pushUndo()`.
4. **Přejmenování ID tlačítek** v `index.html` — potřebné vůbec? Doporučení: ne.
