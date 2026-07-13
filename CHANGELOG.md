# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- CAM Simulator: "⚙️ Geometrie" dialog for insert (VBD) + tool holder geometry
  with a live 2D preview canvas (`drawInsertAndHolderPreview`), bidirectionally
  synced with the "Nástroj" panel
- ISO 5608/5610 reference data (`js/calculators/holderIsoData.js`): holder
  style letters (A–W) with approach angle κr, and typical functional length
  (l1) by shank height — orientational, catalog values vary by manufacturer
- VBD & Držáky dialog: holder code decoder now follows the real 7-position
  ISO 5608 structure (clamping, insert shape, style/κr, insert clearance
  angle, hand, height, width) instead of the previous simplified 6-position
  layout
- "⚙️ Geometrie" dialog: optional holder body back angle (γ) / face angle
  (γf) fields, manually entered (not auto-derived — usually only relevant
  for brazed/solid tools), visualized as dashed guide lines on the preview
- "⚙️ Geometrie" dialog: "🔍 Najít dle destičky" button suggests the closest
  ISO 5608 holder style by matching κr to the insert's Natočení (toolAngle);
  "⇄ Ruka" toggle for holder hand (R/L), auto-derived from the machining
  side (`roughingSide`) each time the dialog opens, mirroring the insert
  shape in the preview
- Holder body preview now reflects κr geometrically: the head near the
  insert is drawn with a chamfered nose (straight side + side angled by κr)
  instead of a plain rectangle; falls back to a plain rectangle when no
  style/κr is selected
- "⚙️ Geometrie" dialog: ↩/↪ undo/redo buttons next to the title (share the
  CAM Simulator's existing history stack — any change made in this dialog
  can be reverted/reapplied); preview canvas is zoomable (mouse wheel or
  ＋/－ buttons) and pannable (drag), with a ⟲ reset button; content split
  into two switchable sub-tabs, "🔩 Destička" and "🗜 Držák", instead of one
  long scrolling form
- Preview canvas now labels ε (vrcholový úhel), natočení and γ/γf directly
  on the drawing (not just in the form); each label is a clickable hotspot
  that switches to the relevant sub-tab (Destička/Držák) and focuses the
  matching input

### Fixed
- Preview canvas proportions: the holder body no longer renders visually
  smaller/narrower than the insert when the shank length (l1) is much
  larger than the insert edge length — the scale is now computed from a
  capped drawn shank length instead of the full l1, and the insert's
  minimum pixel-size clamps were reduced so they no longer override the
  shared scale
- A very long holder shank (large l1) is now drawn shortened with a
  standard technical-drawing break mark (zig-zag) instead of taking up
  most of the canvas height; the true l1 value stays in the label,
  suffixed "(zkráceno)" when the drawing is shortened; the shown shank
  portion was also shortened further so the head/nose detail near the
  insert stays the visual focus
- The gap between the insert tip and the holder's near edge is now sized
  from the insert's actual drawn reach (Délka hrany) instead of a fixed
  small fraction, so the insert body no longer visually overlaps/crosses
  into the holder's chamfered head

### Added
- Polygon insert: "⇄ Přehodit stranu" button — the vertex angle (ε) can
  open to either side of Natočení (two geometrically valid mirror options);
  the button flips which one the preview draws instead of requiring the
  angle to be recalculated by hand (`toolTipMirror`, preview-only — does
  not affect the interference-guard calculation, which uses its own
  Natočení-symmetric model)

### Changed
- Insert shape "Úhel hřbetu (α)" field removed from the polygon shape UI,
  replaced by "Rádius (R)" at the same position (value still used internally
  for flank-interference tolerance)
- "VBD kód" and holder dimension fields ("Tloušťka držáku", "Délka držáku")
  moved from the main "Nástroj" panel into the new "⚙️ Geometrie" dialog

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
