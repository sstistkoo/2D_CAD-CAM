# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
