# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- CAM: **geometrické jádro hrubování z booleanů (migrace Fáze 3, kroky 1–2)** —
  nový modul `js/calculators/cam/booleanRoughing.js` (čisté funkce nad Clipper2):
  zbytkový materiál `= polotovar − oblast dílce` (`buildResidual` /
  `polyDifference`), vrstva `= zbytek ∩ pás [xLo,xHi]` s **regiony zadarmo**
  (`sliceLayer` / `polyIntersect`), řezné Z-intervaly na hloubce paritou
  průsečíků (`layerZIntervalsAtX`) a hloubková posloupnost (`buildLayers`).
  Oblast dílce se staví uzavřením hotového `offsetPath` (dráha středu špičky)
  k ose (`offsetRegionLoop`) — reuse zachová anizotropní offset aX≠aZ. Modul
  zatím **není napojen do generátoru drah**, takže G-kód ani regresní snapshoty
  se nemění; napojení `genLongPasses` za příznakem je další krok. Testy
  `tests/boolean-roughing.test.js`. Viz `docs/geometry-libs-migration.md`.

### Changed
- CAM: **sjednocená kolizní oblast nástroje pro mezní čáry (migrace Fáze 2b/3)** —
  `computeInterferenceGuides` / `buildHolderBoundaryPts` počítají mezní čáru ze
  SJEDNOCENÉ zakázané oblasti špičky `F_all = (dílec ⊕ −držák) ∪ (dílec ⊕ −TĚLO
  destičky)` přes nový `buildToolForbiddenRegion` (`js/calculators/cam/toolEnvelope.js`)
  místo dřívější držák-only oblasti. Obrys destičky staví `insertWorldLoop` nad
  sdíleným `buildInsertProfileSegments` (nově exportováno z `insertPreview.js`).
  **Tělo destičky** přidává kolizi jen u tvarů bez úlevu boku — **upichovák**
  (`parting`, šířka b); obrys se morfologicky otevře o R (odstraní aktivní nos).
  **Polygon a round** zůstávají na analytické hraně (zadní hrany polygonu mají
  úlev, round je celá aktivní nos), takže se u nich chování NEMĚNÍ — F_all je
  u nich bit-identická s dřívější oblastí. Aktivní břit není nikdy v F (bere se
  HRANICE dosažitelné oblasti). Regresní G-kód snapshoty **beze změny** (fixtures
  jsou polygon/round). Nové testy `tests/insert-forbidden-region.test.js` +
  charakterizace `tests/holder-boundary.test.js`. Viz `docs/geometry-libs-migration.md`.
- CAM: **refaktoring `camSimulator.js` (10 321 → 8 432 řádků, Fáze B)** —
  výpočetní jádro vytaženo z `openCamSimulator()` do dvou modulů:
  `js/calculators/cam/calculatePipeline.js` (`computeCalculation(S, …)` —
  bývalé `calculate()` + `roughingKey`/`getRoughingOperations`) a
  `js/calculators/cam/gcodeEmit.js` (`generateAutoGCode(S, calc)` + `generateGCode`,
  `ctrlCmt`, `buildControlHeaderLines`/`Tail`, `controlArcFormatter`,
  `renumberGCodeLines`, `convertGCodeControlSystem`). Funkce dostávají sdílený
  stav `S` explicitním argumentem; v `openCamSimulator()` zůstávají tenké
  wrappery pod původními jmény, takže všechna volající místa i headless
  test-capture (`{ S, calculate, generateAutoGCode }`) fungují beze změny.
  Housekeeping přesun beze změny chování — ověřeno 834 testy + regresní G-kód
  snapshot (`tests/cam-gcode-regression.test.js`) beze změny. Prelude obou
  harnessů (`tests/helpers/camHeadless.mjs`, `camInternals.mjs`) doplněn o nové
  moduly. `draw()` a blok event-handlerů (~2 300 ř.) zůstávají v `camSimulator.js`.
- CAM: **refaktoring `camSimulator.js` (13 435 → 10 321 řádků, Fáze A)** —
  čisté top-level funkce vytaženy do `js/calculators/cam/`:
  `camSimulatorDialogs.js` (camConfirm/camOffsetDialog/…),
  `camSimulatorStyles.js` (injectCSS), `camDefaults.js` (_defaultCamParams),
  `threadHelpers.js` (threadProfileDepth/computeThreadPassCuts/partOffGeom),
  `gcodeParser.js` (parseManualGCodeToPath/buildStockPointsFromCanvas/…),
  `contourBuild.js` (buildMachinableContour a celá pipeline mostů/ořezu
  kontury), `insertPreview.js` (kreslení destičky/držáku + HTML pole tvaru),
  `camToolPicker.js` (knihovna nožů/zásobník). `camMath.js` rozšířen o
  segmentové/obloukové primitivy (dřív duplicitně v camSimulatoru). Čistě
  housekeeping přesun beze změny chování — ověřeno 834 testy + regresní
  G-kód snapshot (`tests/cam-gcode-regression.test.js`) beze změny + vizuálně
  v běžící appce. `openCamSimulator` (dráhy/kreslení/UI, ~10 100 ř.) zůstává
  beze změny — samostatná budoucí Fáze B.
- CAM: **"Dobrat naráz" checkbox removed** — pockets are always finished to
  the bottom (incremental ramp-in per depth cannot reach the floor of a deep
  narrow pocket, so the burst dig is now permanent). Old projects with the
  flag saved either way are normalized in `calculate()`
- CAM (casting): interference-guide lines from insert geometry are now
  **clipped at the stock boundary** — when the reflected tool silhouette
  exits the casting skin into a valley, the guide ends on the stock offset
  (+ vůle X, `downClipped`) instead of continuing through air; the
  machinable-contour bridge below such an anchor replaces the shadowed wall
  and hard-breaks (rapid) to the next segment across the valley, so the void
  is no longer treated as contour and "machined". Fixes valley walls being
  cut as if the valley were solid stock
- CAM (casting): longitudinal roughing **enters the stock skin by ramping**
  from the stock boundary (`stockEntryRamp`, at the plunge angle from the
  tip×boundary intersection) instead of plunging perpendicularly — applies to
  open, flat and pocket passes whose entry lies in the casting crust
- CAM (casting, region roughing): valley split points now only apply **above
  the valley floor** — in the crust depth the neighbouring regions merge, so
  the valley is roughed from the real material edge instead of being halved
  and each half machined toward the split as if solid

### Added
- CAM (simulace): **oranžové varování na kolizi držáku** (🟧) — během simulace
  se podél projeté dráhy navléká stopa obrysu držáku a její průnik se
  zbývajícím materiálem (co destička ještě neodebrala) se AKUMULUJE do jedné
  oblasti, která zůstává oranžová i po přejetí — je vidět, kudy všude se držák
  vnořil do polotovaru/obrobku. Nový akumulátor `HolderGouge`
  (`js/calculators/cam/holderGouge.js`, obdoba `MaterialRemoval`) drží vlastní
  kopii zbytkového polotovaru, takže kanál po destičce nehlásí jako kolizi;
  přepínatelné tlačítko, stav `showHolderCollision` se ukládá do localStorage
  i projektu. Testy `tests/cam-holder-gouge.test.js`
- CAM: dynamic rapid-move planning (Phase 4 core of the geometry-library
  migration) — G-code emission now maintains a live remaining-stock polygon
  (`StockModel`, cut pass-by-pass via `noteCutPass`) and every direct rapid
  is tested by sweeping the insert footprint against the CURRENT remaining
  material; a hit routes the move up over the stock, across in Z, and back
  down (the ordering problem static blockers cannot see). Rapid stop points
  are now measured from the tool EDGE (`clearance + tool radius`) instead
  of the tip centre — with vůle < R the nose used to rub the stock by
  R − vůle on every approach (the ~1 mm² grazes the validator kept
  reporting). Open-ended passes exit the material at working feed for the
  Z clearance distance before retracting (per spec). Isolated validator
  results: six longitudinal fixtures now report 0 rapid collisions and
  holder findings dropped to ordering-class residuals in pockets
- CAM: holder envelope for the finishing pass and contour-following traces
  (Phase 3b of the geometry-library migration) — finishing segments whose
  tip would put the holder inside remaining material are skipped like
  insert-unreachable segments (dotted, rapid over the gap, ⚠ warning);
  pocket lead-in/lead-out contour traces are trimmed against the envelope
  (the part-2 fixture's "face traced from the axis" ~343 mm² crash class);
  pocket intervals are clipped to the component window where the holder
  actually fits between the walls (`clampSpanTowardNegative` — matches the
  guides-v2 bent-boundary semantics; pockets narrower than the holder are
  dropped with a warning) and pocket-cleanup traces are clipped to that
  window. A soft (extra-eroded) forbidden region exists for
  allowance-skin-tolerant checks. Snapshots updated deliberately —
  removed/trimmed motions were validator-confirmed real holder collisions.
  Known remaining gaps (reported by the ⚠ validator, not yet prevented):
  face-strategy roughing, casting region-roughing obstacles, and
  ordering-dependent collisions (a trace running before neighbouring
  material is machined) — Phase 4 scope
- CAM: per-axis stock clearance ("Vůle X/Z (polotovar)", params `stockClearX`
  / `stockClearZ`, `null` inherits the legacy single `rapidClearance`) — the
  boundary where rapids end and working feed (G1) begins is now offset from
  the stock per-axis and drawn as a dashed line around the stock outline
  (cylinder and casting). Approach/retract emission, face-roughing entry,
  thread and part-off clearances all use the split values
- CAM: entering the stock at the Z machining-range boundary now ramps at the
  plunge angle from an anchor at the range-start × stock-boundary
  intersection (shared line across depths, like pocket ramps) instead of
  plunging perpendicularly into material; passes whose ramp doesn't fit are
  skipped. Covered by `tests/range-entry-ramp.test.js`
- CAM: warning in the ⚠ panel when the holder envelope drops passes
  ("Hlídání geometrie (držák): N průchodů vynecháno…")

### Fixed
- CAM: anisotropic contour offset (Přídavek X ≠ Přídavek Z) produced
  triangle artifacts at radius→short line→radius transitions and shifted
  arcs by max(aX, aZ) in both axes — arcs are now offset per-axis as an
  ellipse fitted back to G2/G3 arcs (`fitArcsToPolyline`), so offset ends
  meet adjacent line offsets exactly. Covered by
  `tests/offset-anisotropic.test.js`
- CAM: holder envelope (Phase 3a) reworked after real-path validation:
  `minkowskiSolidSum` orientation bug fixed (holes inside the forbidden
  region), obstacle silhouette is clipped to the stock and morphologically
  opened by the tip reach (thin final-surface skins are finishable and
  don't block the holder), and the staircase rule only records
  holder-clamped pass ends. Regression snapshots updated deliberately:
  the removed passes were verified as genuine holder collisions by the
  Phase 2 validator (e.g. facing to the axis with the holder over the part
  body, ~343 mm² interference on part-2)
- tests: `camHeadless.runCamProg` now returns `calcSim` — a second
  calculate() over the generated G-code, so `simPath` is the real
  simulated path (it was empty before, which silently blinded
  collision-validator assertions); the harness prelude now mirrors all real
  camSimulator imports (`makeHolderClamp` etc. were silently undefined)
- CAM: holder-aware pass clamping (Phase 3a of the geometry-library
  migration, `js/calculators/cam/toolEnvelope.js`) — longitudinal roughing
  pass ends are now limited by a forbidden tip region computed as the
  Minkowski sum of the offset-contour silhouette with the reflected holder
  outline (`geomCore.minkowskiSolidSum`), plus a staircase rule that keeps
  the holder clear of material left standing by shallower clamped passes.
  Active only with "Hlídat geometrii" on and a holder defined; clamped
  pass ends suppress the no-step contour lead-out. Regression snapshots
  are unchanged (fixtures are collision-free so the clamp never fires);
  a new cross-check test (`tests/holder-envelope-demo.test.js`) generates
  the demo part and asserts the Phase 2 collision validator finds no
  holder collisions in the roughing section. Finishing-pass holder
  clearance is a known gap left for Phase 3b
- CAM Simulator: independent collision validation of generated toolpaths
  (Phase 2 of the geometry-library migration,
  `js/calculators/cam/collisionValidator.js`) — walks the whole simPath
  block-by-block over an evolving remaining-stock polygon and reports to the
  "⚠ Nalezeny problémy" panel when (a) the holder outline (custom
  sideA/sideB profile or the width × length rectangle) sweeps through
  remaining material during a cutting move, or (b) a G0 rapid would drive
  the insert or holder through material. Uses Minkowski sweeps + boolean
  intersection (Clipper2) with a Detect-Collisions SAT broad-phase filter
  (manual AABB fallback), runs debounced (600 ms) after each path
  regeneration, gated by the geometry-guard checkbox. Existing
  interference-guide logic is untouched — this is a cross-check ahead of
  Phase 3. Covered by `tests/collision-validator.test.js` (10 tests)
- CAM Simulator: "Hlídat geometrii destičky" checkbox renamed to
  "Hlídat geometrii (destička + držák)" — it now also gates the holder
  collision validation
- CAM Simulator: visual material removal during simulation (Phase 1 of the
  geometry-library migration, `js/calculators/cam/materialRemoval.js`) — the
  stock is kept as a polygon (`StockModel`) and the tool-tip footprint swept
  along completed cutting moves (Minkowski sum, rapids excluded) is
  subtracted from it as the simulation plays. The remaining-stock polygon
  clips the CAD "Vybarvit" fills and the stock fill, so material visually
  disappears where the tool has cut. New ⛏ toolbar toggle (persisted in
  localStorage and project files, default on); incremental cutting with
  periodic simplification keeps playback smooth, rewinding recomputes from
  scratch. Covered by `tests/material-removal.test.js`
- Geometry-library migration groundwork (Clipper2 / Turf.js / Detect-Collisions):
  new adapter `js/geom/geomCore.js` — the single entry point for all geometry
  libs (CAM code never imports `lib/` directly). Wraps Clipper2 boolean ops,
  offsets, point-in-polygon, simplify and Minkowski tool sweep in the CAM
  `{x, z}` mm convention (precision 1e-4 mm), adds a `StockModel` class for
  incremental material removal / collision queries, and lazy loaders
  `ensureTurf()` / `ensureCollisions()`. Covered by `tests/geom-core.test.js`
  (11 tests). Migration plan: `docs/geometry-libs-migration.md`
- CAM Simulator: "⚙️ Geometrie" dialog for insert (VBD) + tool holder geometry,
  opened from the "Nástroj" panel — live 2D preview canvas
  (`drawInsertAndHolderPreview`), bidirectionally synced with the main panel,
  split into two switchable sub-tabs ("🔩 Destička" / "🗜 Držák"); preview is
  zoomable (mouse wheel or ＋/－, up to 12×) and pannable (drag), with a ⟲
  reset button; ↩/↪ undo-redo buttons share the CAM Simulator's existing
  history stack. Angle/dimension labels (ε, ∠, b, l1) render as HTML overlays
  and stroke widths use a `1/zoom` factor, so labels and lines stay crisp and
  constant-size at any zoom instead of ballooning with it
- Manual holder outline drawing (replaces the earlier ISO 5608 style-picker
  approach, which needed too much data entry for the common case of "hand +
  length + thickness"):
  - In-dialog: **✏️ Kreslit obrys** shows clickable anchor points on the
    insert in the preview (corners for square/diamond inserts, every 45° on
    round ones) — click one to start a side ("A"/"B"), then add points via
    Délka (mm) + Polární úhel (with the ✛ quick-angle compass), building up
    to ~6 segments per side (`S.params.holderProfile.sideA/sideB`,
    `getInsertAnchorPoints()`)
  - **📐 Kreslit na CAD plátně** (Držák tab): full CAD drawing of the holder
    outline on the main canvas. Backs up the current drawing (objects, layers,
    view, manual G-code) and restores it on ✕/✓, clears the canvas and creates
    two layers ("Plátek" / "Držák"). The insert is generated as **real, locked,
    red** LINE/ARC/CIRCLE geometry at the origin (round → circle R; polygon →
    2 edges + nose arc; parting → radius-to-edge), so ordinary CAD tools can
    **snap onto it** even though its layer is locked (`isToolInsert` snap
    bypass in `snapPt`/`findIntersectionAt`). The mode lives in
    `state.holderDrawMode` and survives tool switching (it is **not** tied to
    `state._toolCleanup`); it ends only via the bottom bar ✕ Zrušit / ✓ Potvrdit
    (visible on desktop too). Opening/switching to CAM while drawing is blocked
    with a toast. On confirm the holder is saved as a closed `holderProfile`:
    a fully closed contour is used as-is (mode A); an open two-sided sketch is
    auto-closed at 45° to the "Délka držáku (l1)" / "Tloušťka držáku" fields
    (mode B), with a ⇄ Strana button to switch which end is completed. The
    right-side layers panel stays visible during drawing so the two layers can
    be switched, and the holder is mapped screen-consistently — drawing it
    upward in CAD shows it upward in the preview. The auto-45° closing can be
    turned off with an **"Auto-doplnit držák (l1 × tloušťka)"** checkbox; when
    off the exact drawn (even open) shape is stored. Re-entering 📐 when a
    holder is already saved re-imports it as **editable** lines on the Držák
    layer (next to the locked insert), so it can be adjusted instead of redrawn
  - **🔧 Upravit obdélník** (Držák tab): in-preview editor for the default
    rectangular holder. Materializes the rectangle (holderWidth × holderLength,
    lifted above the insert) with three clickable yellow handles on the bottom
    edge (left corner / middle / right corner) and green insert anchors that now
    include a **🎯 Střed R** target at (0,0). Click a holder handle then an
    insert anchor to **move** the holder onto that point (e.g. bottom-left
    corner → insert radius center); **🔻 Srazit roh** chamfers a chosen corner
    by a given **size + angle** (45° = symmetric; other angles derive the second
    leg from the corner's interior angle); **🗑 Vymazat** resets to a clean
    rectangle. Pure geometry
    (`holderRectProfile`, `holderBottomHandles`, `translateHolderProfile`,
    `chamferProfileCorner`) is unit-tested (`tests/cam-holder-editor.test.js`)
  - Rotations split: **↻ Natočení destičky** (just the insert, `toolAngle`)
    moved to the Destička sub-tab; the Držák sub-tab gets **↻ Natočení nože**
    (`knifeAngle`) which rotates the whole tool — insert and holder together —
    in the preview. The knife angle is the direction the **insert points**
    (the compass arrow points toward the insert): 270° = default (insert down,
    holder up), 0° = insert right, etc. (internal preview rotation `R = 270 −
    knifeAngle`). The Destička sub-tab now hides the holder and fits the view
    to the insert
  - Preview draws `holderProfile` as connected polylines (starting at the
    insert edge) instead of the rectangle once it has points; **🗑 Smazat
    obrys** clears it. In drawing mode the preview fits to the insert and
    hides the holder body, so the clickable anchor points sit exactly on the
    insert edge (round: on the circle; square/diamond: at the edge tips)
- Tool library via projects: the project JSON (`_buildProjectData`, bumped to
  version 4) now stores the CAM tool geometry (`camTool`: insert
  shape/length/angle/tip-angle/radius/tip-flat/tip-mirror/VBD code + holder
  length/width/hand/profile). Loading a project transfers the saved tool into
  CAM ("Nůž z projektu přenesen do CAM" — applied to a live CAM session and
  seeded into the next one), so projects double as a knife library
  (`getCamToolGeometry`/`applyCamToolGeometry`, bridged to `projectManager`)
- Polygon insert: "⇄ Přehodit stranu" button — the vertex angle (ε) can open
  to either side of the polar angle (two geometrically valid mirror
  options); flips which one the preview draws instead of requiring the
  angle to be recalculated by hand (`toolTipMirror`, preview-only — does not
  affect the interference-guard calculation, which uses its own
  angle-symmetric model)
- ✛ quick-angle compass next to polar-angle fields (insert polar angle, the
  ↻ rotate popup, the outline-side popup) — same 3×3 popup (0/45/90/…) as the
  CAD's "🔢 Číselné zadání objektu" dialog (`wireAngleCompass`, reuses the
  existing `.angle-compass-popup`/`.compass-grid` CSS); the popup is given a
  high z-index so it opens above the full-screen dialog backdrops instead of
  behind them (previously the compass appeared unresponsive)
- VBD & Držáky dialog: holder code decoder now follows the real 7-position
  ISO 5608 structure (clamping, insert shape, style/κr, insert clearance
  angle, hand, height, width) instead of the previous simplified 6-position
  layout
- 4th default layer "Polotovar" (`STOCK_LAYER_ID = 3`, `js/state.js`) alongside
  Kontura/Konstrukce/Kóty, backfilled into older saved projects on load
  (`ensureStockLayer()`); `isStock` objects (Polotovar drawing mode, "Přídavek
  na plochu" generator, CAM "Odeslat do CADu", CNC-code-to-canvas reparse) are
  now assigned to it instead of silently sharing whatever layer happened to be
  active
- Vrstvy panel: clicking a layer's color dot now opens a small custom popover
  (`openLayerColorPicker()`, built on a shared `openColorPicker()`) with 7
  one-click rainbow presets and an explicit OK/✕ pair — replacing the bare
  `input[type=color]` swatch, whose native OS popup couldn't be styled,
  extended with presets, or reliably positioned: on narrow mobile viewports
  it rendered using desktop-scale coordinates and could open partly or
  entirely off-screen (browser chrome, outside CSS's control). "Vlastní
  barva" now toggles a fully custom, self-contained picker instead
  (saturation/value gradient square + hue slider + R/G/B number fields, HSV
  ⇄ RGB conversion helpers in `ui.js`) that always renders inside the same
  dialog, so it's correctly positioned at any viewport size. It also has its
  own 💧 eyedropper: hides the popover and lets you click an object on the
  canvas to reuse its color (`pickColorFromCanvas()`, same `click`/
  `touchend`-on-`drawCanvas` pattern as the existing "Vybrat z mapy" pickers
  in `numericalInput.js`/`objectDialogs.js`, so it works on touch too) —
  clicking empty canvas cancels the pick instead of grabbing the
  background/grid color, since `findObjectAt()` returns nothing there. The
  resolved color always matches what's actually drawn (shared
  `resolveObjectColor()`, extracted from the main render loop so both places
  can't drift apart). Swatches, the SV square, hue/RGB fields and the
  sliders all live-preview without closing the popover; only **OK** commits,
  while **✕**, Escape, or clicking outside all revert every change made in
  that session and close. The same popover also has a "Tloušťka čáry" slider
  (0.5–5 px, per-layer `layer.lineWidth`, falls back to the existing
  `LINE_WIDTH` constant when unset) — `render.js`'s main draw loop reads it
  per-object via the object's assigned layer
- Vlastnosti panel: the "Barva" row now applies to the *entire current
  selection* at once (reuses the same rainbow-preset popover as the layer
  color, via `openObjectColorPicker()`) instead of only the primary selected
  object — multi-selecting several objects and picking a color now recolors
  all of them in one click, and shows "— smíšené —" when the selection
  currently has mixed colors. Replaces the old inline 5-preset color picker
- New toolbar tool "🎨 Vybarvit" (`data-tool="fill"`, `js/tools/fillClick.js`):
  click into any closed-off area of the drawing to fill it with a translucent
  color — no selection needed. Since a SKICA contour is normally a chain of
  separate line/arc objects rather than one closed polyline
  (`addPolylineAsSegments`), it builds every closed boundary in the drawing
  itself (`buildClosedLoops()`, endpoint chaining; circles/rects/closed
  polylines count as their own loop directly). Turning contours/stock are
  usually drawn as an OPEN profile referenced to the rotation axis (y=0),
  not a closed shape — without accounting for that, clicking the gap
  between Kontura and Polotovar would never find any closed boundary at
  all, so an open chain whose both loose ends sit on the axis is treated
  as closed along the axis too (skipped for `machineType: 'karusel'`,
  where the axis has no such meaning). Point-in-polygon tests the click
  against all loops and picks the smallest one containing the click point.
  Clicking inside the ring between two nested loops (e.g. between
  Kontura and Polotovar) fills only that ring: loops directly nested inside
  the clicked one become holes, and outer+holes become subpaths of one
  `Path2D` drawn with the `evenodd` fill rule. Creates a new `type: 'fill'`
  object (color + opacity, adjustable afterwards via the same rainbow-preset
  popover, opened automatically right after the click) rendered in its own
  pass before all strokes (`drawFills()` in `render.js`) so it sits
  underneath the contour lines; excluded from CNC/DXF export and CAM
  path-sorting since it's a visual annotation, not machinable geometry.
  Cancelling that popover (✕/Escape/outside click) removes the just-created
  fill entirely rather than reverting to its default color, since cancelling
  a fresh "Vybarvit" click means the user didn't want to fill that area at all
- CAM Simulator's own canvas (`draw()` in `camSimulator.js`) now also draws
  "Vybarvit" fills. CAM doesn't keep a live copy of CAD's `state.objects` —
  opening it converts the drawing to G-code once and reparses that into its
  own `S.contourPoints`/`S.stockPoints`, so `'fill'` objects (already
  excluded from that G-code, being a visual annotation and not machinable
  geometry) would otherwise never reach CAM at all. Reads `state.objects`
  directly instead (same as CAD's `drawFills()`), remapping each CAD (x,y)
  point through CAM's own `toScreen()`/machine-axis convention
- CAM Simulator tool magazine (🔧 Zásobník) now stores the full knife, not
  just the insert: each slot gained `holderLength`/`holderWidth`/`holderHand`/
  `knifeAngle`/`holderAutoComplete`/`holderProfile`, saved and restored by
  `_syncParamsToSlot`/`_applyMagSlot` alongside the existing insert fields.
  The "⚙️ Geometrie" dialog's Držák tab gained a **🔧 Zásobník** button (opens
  the magazine without leaving the geometry dialog) and a **💾 Uložit do
  zásobníku** button (`saveCurrentToolToMagazine()`) that captures the
  currently configured insert + holder — including a custom-drawn
  `holderProfile` — as a new numbered slot for later reuse; the magazine
  dialog itself got the same capture action as **💾 Uložit aktuální nástroj**
  next to "＋ Přidat nůž"

### Changed
- Desktop status bar: dropped "Projekt: …", the current click-hint text
  (`#statusHint`, e.g. "Klikněte pro výběr…"), and the "Posun: Prostřední
  tlačítko / Shift+táhnutí" hint; added the same SOU/KAR·ABS/INC·R/⌀ and
  #/∠/📐 indicators the mobile coord bar already had, plus an icon-only
  🔢 button (opens the same "Číselné zadání objektu" dialog as the topbar's
  "🔢 Zadat"). The indicator-update functions (`updateCoordModeBtn`,
  `updateXDisplayBtn`, `updateMachineTypeBtn`, `updateCoordBarIndicators`)
  now target elements by shared class (`.ind-machine`, `.ind-coordmode`,
  `.ind-xdisplay`, `.ind-grid`, `.ind-angle`, `.ind-dims`) instead of a single
  `id`, so the mobile bar and desktop status bar copies stay in sync
  automatically
- Desktop status bar also shows coordinates (`#statusCoords`, same
  `fmtStatusCoords()` text as the mobile coord bar and the floating tooltip)
  — but frozen at the last click rather than following the mouse, set from
  the canvas `mousedown` handler (`js/events.js`) rather than from the
  continuous `mousemove`/`updateMobileCoords()` path
- "🔢 Číselné zadání objektu" dialog (`js/dialogs/numericalInput.js`) now
  pre-fills the first point of a shape (X/Z for Bod/Kontura, X1/Z1 for
  Úsečka/Konstr./Obdélník, Střed X/Z for Kružnice/Oblouk) from the last click
  or tap on the canvas (`state.lastClickPoint`, same value as `#statusCoords`
  on desktop) when there's no active chain from a previously-created object —
  chain still takes priority so multi-step drawing continuation is
  unaffected. Tracked from both the desktop `mousedown` handler
  (`js/events.js`) and every tap-resolving branch of the mobile `touchend`/
  `touchstart` handlers (`recordLastClick()` in `js/touch.js`), so it works
  the same on touch. Also swapped the field order to always show X before Z
  (`axisPair()` helper), matching the rest of the UI — on a lathe
  (`machineType: 'soustruh'`) the fields used to read Z-then-X because
  `axisLabels()` returns `[H, V]` in
  world horizontal/vertical order, which happens to be `[Z, X]` for that
  machine type
- Desktop floating cursor coordinates (`#cursorCoords`, follows the mouse over
  the canvas) gained a 2nd line: the selection counter ("1 obj", "2 obj + 3
  body", …) when something is selected. That counter used to be a separate
  canvas-drawn box centered below the toolbar on desktop; `drawSelectionCounter()`
  (`js/render.js`) now only draws that box on mobile (`getSelectionCounterLabel()`
  extracted so both call sites share the counting logic)
- Renamed "Natočení (°)" to "Polární úhel (°)" on the insert fields
- Insert shape "Úhel hřbetu (α)" field removed from the polygon shape UI,
  replaced by "Rádius (R)" at the same position (value still used internally
  for flank-interference tolerance)
- "VBD kód" and holder dimension fields ("Tloušťka držáku", "Délka držáku")
  moved from the main "Nástroj" panel into the "⚙️ Geometrie" dialog; the
  Držák tab there now holds only ⇄ Ruka (hand, auto-derived from the
  machining side on open, togglable), ↻ Natočení (rotate the insert without
  switching tabs), Délka držáku (l1), Tloušťka držáku, and the outline tools
  above — no ISO style/κr/h/b fields
- Preview canvas proportions: the holder body no longer renders visually
  smaller/narrower than the insert when the shank length (l1) is much
  larger than the insert edge length — scale is computed from a capped
  drawn shank length instead of the full l1
- A very long holder shank (large l1) draws shortened with a standard
  technical-drawing break mark (zig-zag) instead of taking up most of the
  canvas height; the true l1 value stays in the label
- The gap between the insert tip and the holder's near edge is sized from
  the insert's actual drawn reach, so the insert body no longer visually
  overlaps the holder

### Fixed
- Mobile long-press "precision pointer" (offset cursor circle used to tap
  small/tightly-packed controls precisely) was wired up separately for the
  sidebar, the topbar, and `.calc-overlay`/`.input-overlay` dialogs only —
  it silently did nothing on the floating mobile action buttons and any
  other UI outside those three containers. Replaced the three near-duplicate
  implementations with a single delegated listener on `document` (`touch.js`)
  that covers the whole UI, excluding the CAD canvas (`#canvasWrap`, which
  keeps its own dedicated `#precisionCrosshair`) and text-entry fields
  (`input`/`select`/`textarea`). Also flips the pointer to appear below the
  finger instead of above when the target is near the top edge of the
  viewport, so it no longer renders off-screen there.
- Vrstvy panel: the "Skrýt vrstvu" eye icon used the 👁‍🗨 emoji, which some
  systems/browsers render as an unstyled monochrome (black) glyph — invisible
  against the dark panel background. Replaced with inline `currentColor` SVG
  icons (`ICON_EYE_OPEN`/`ICON_EYE_OFF`) so the button is always visible in
  both themes
- Objects created by "🔄 Vykreslit CNC kód na canvas" and "📂 Načíst G-kód ze
  souboru" (`parseGcodeToObjects()` → `state.objects.push()`) bypassed
  `addObject()` entirely and ended up with no `.layer` at all. Since
  `render.js`'s layer lookup (`state.layers.find(l => l.id === obj.layer)`)
  then returned `undefined`, those objects were **immune to every layer's
  show/hide toggle** and always drew in the hardcoded `COLORS.primary` /
  `COLORS.stock` fallback instead of the user's configured Kontura/Polotovar
  layer color. Same issue in the CAM Simulator's "Odeslat do CADu" and SVG
  import. Now explicitly assigned to the Kontura or Polotovar layer (by
  `isStock`) on creation
- `isStock` objects (Polotovar drawing mode, "Přídavek na plochu", the paths
  above) always rendered in the fixed `COLORS.stock` constant regardless of
  their own layer's configured color — the Polotovar layer's color dot had no
  effect. `render.js` now prefers the object's assigned layer color, falling
  back to `COLORS.stock`/`COLORS.primary` only when no layer is found
- Most dimension/measurement creation paths (`dialogs/dimension.js`,
  `dialogs/measure.js`, chain dimensions, the coordinate-label tool) never set
  an explicit `layer`, so new "Kóty" silently landed on whatever layer was
  currently active (typically Kontura) instead of the dedicated Kóty layer —
  making the Vrstvy panel's Kóty visibility toggle hide/show the wrong
  objects, and mixing dimension geometry into Kontura/Konstrukce. All of these
  now explicitly set `layer: 2`
- Výplně (`type: 'fill'`, nástroj "Vybarvit") nešly vybrat kliknutím na
  plátno — `distToObject()` je pro neznámé typy záměrně vylučoval z výběru
  (default: `Infinity`), takže kliknutí na vybarvenou plochu nic nevybralo a
  hlavní tlačítko **Smaž** tak nemělo co smazat. Přidán case `'fill'`
  (evenodd test přes všechny smyčky, stejný jako při vykreslení —
  mezikruží se tedy správně vybírá jen za prstenec, ne za díru uprostřed).

## [1.7.0] - 2026-07-04

### Added
- In-app help overlay (`calculators/help.js`) with G-codes, M-codes, calculators and shortcuts
- Documentation: `README.md` and `docs/developer.md`
- Advanced dimensioning: angular and radial dimensions with leader lines
- Distance measurement between points and coordinate dimensioning with angle visualization and snapping
- Polar angle support for dimensions from Z-axis

### Changed
- Top bar transformed into a floating element with transparent background
- Toolbar buttons can now deactivate the active tool when clicked
- Updated texts in file dialog, added tolerance and toggle for coordinate labels

### Fixed
- Arc geometry calculation logic in CNC editor
- Stabilized CNC editor and improved numpad UX
- Removed confirmation dialog for outdated code
- Automatic CNC code export on geometry change
- Optimized parsing of chamfer/rounding markers

## [1.6.0] - 2026-06-11

### Added
- Separate CAM editor for CNC toolpaths (independent from CAD editor)
- CNC code panel with G90/G91 toggle, save/load and render
- CAM toolbar reorganization with contextual visibility and rich modal for toolpaths
- CAM mobile overlay mode for right panel (width < 700px)
- Tool limits (chuck/collet) clipping toolpaths — no intrusion into forbidden zones
- Z-limit button with 3 states: off / chuck+collet / full range
- Slower simulation with half-feed speed and single-block stepping
- Parting/part-off cycle with selectable grabs (retract X / start X + Peck)
- Face milling strategies with direction control (right-to-left, left-to-right)
- Chamfer/radius markers in CNC code for lathe control system syntax
- Profile trace tool (interactive profile tracing in simulator)
- G-code parser for importing from other systems
- Snap to arc centers (circles, arcs, bulge polyline segments)
- X-axis rotation (X+ down) + G2/G3 swap for bottom machining
- Flip Z support in UI, rendering and G-code generation
- Shared tool library across calculators
- Stock contour closure check before generating stock/G-code
- Mirror contour preview around rotation axis (y=0)
- Rotation axis as construction line + center mark tool (DIN 76/509)
- Batch undo (single Ctrl+Z reverts entire creative action)

### Changed
- Sided roughing: separated type (longitudinal/face) x direction (right/left) toggles
- Face milling retract per-Z according to actual casting, not global stock radius
- Clean rapid moves: 45° retract instead of vertical X
- Rapid descent to stock edge before G1 - elimination of air cuts
- Profile/P relocate swap in toolbar
- Renamed Střed → Centr (distinction from center mark)
- Ctrl+0 centers view, mobile inputmode fixes

### Fixed
- Multiple camSimulator geometry fixes: arc direction detection, loop tolerance, chain breaks for bridge segments
- Toolpath rendering: G1 solid, G0 dashed, hide plan when editing
- Contour/draha ignores G0 gaps and correctly handles loop bridging
- Manhattan corners for smoother transitions between arcs and lines
- Two bugs from code review
- Fillet arc convex (G3) instead of concave (G2) for stock
- Auto center view updates status zoom text
- Construction lines infinite + drag segment end with snap; bigger zoom (200)
- Angle snap tolerance reduced from 3 to 1 degree

## [1.5.0] - 2026-05-28

### Added
- AI panel: drawing analysis to lathe profile (Z/D) + JSON to drawing conversion
- AI provider settings modal (Groq/Gemini/OpenRouter)
- Professional gear generator via Maker.js
- Gear pair tool (two meshing gears)
- Parametric tools: Slot, Polygon, Star (via Maker.js)
- Hershey single-line fonts for CNC engraving (+ 3 additional fonts)
- Vector text via Maker.js with Roboto + bezier paths
- SVG export with vector text
- Undo batch for creative actions
- DXF import: 3DFACE and INSERT/BLOCK entities
- DXF import: full ELLIPSE and SPLINE support
- DXF/SVG export via Maker.js with Y-axis handling

### Changed
- Boolean operations refactored through makerjs.model.combine
- Stock tool: Polotovar button and conversion of drawn objects to CAM
- UI: moved Save/File/History/Library from toolbar to Settings + mobile ⚙️
- Hershey JSON compression: per-char tuple instead of object (-92% size)

### Fixed
- Robust DXF/SVG export with correct Y-axis negation
- Boolean: identical shapes, degeneracy, flag propagation
- Robust G-code parser understands modal G90/G91

## [1.0.0] - 2024-05-24

### Added
- Project initialization: basic 2D CAD with HTML templates, JS modules and test fixtures
- 2D drawing tools: LINE, ARC, CIRCLE, RECT, POLYLINE, TEXT
- Advanced edit tools: FILLET, CHAMFER, TRIM, EXTEND, BREAK, MOVE, COPY, ROTATE, SCALE, MIRROR, ARRAY, CIRCULAR ARRAY
- Boolean operations
- Automatic intersection calculations and associative dimensions
- Thread tool (UI, logic, CAM simulation) with DIN 76 table update
- Parting/part-off cycle in CAM simulator
- Face milling strategies
- Roughing/finishing strategies with toolpath generation
- G-code generation for Sinumerik 840D sl
- Tool library across calculators
- DXF basic import/export
- IndexedDB project storage with autosave
- Image export (PNG)
- Dark/light theme (Catppuccin)
- Mobile touch support with bottom bar
- Unlimited undo/redo
- In-app help overlay

---

_Changelog风格 © 2024-2026 SKICA contributors_
