# Projekt: SKICA – 2D CAD/CAM

**SKICA** je offline-first PWA aplikace pro 2D kreslení (CAD) a generování NC
programů (CAM) pro CNC soustruhy a karusely. Běží plně v prohlížeči jako
client-side SPA bez backendu a bez build kroků (vanilla JS + ES moduly, 0 runtime
závislostí).

> Verze: 1.7.0 | Licence: ISC | Jazyk UI/dokumentace: čeština

## Podporované řídicí systémy (CAM výstup)
- **Sinumerik** (Siemens 840D sl a kompatibilní) – subprogramy, hlavičky dle předvoleb
- **Fanuc** (standardní ISO 6983 dialekt)
- **Heidenhain** (TNC 640 a kompatibilní)

## Podporované typy strojů
- **Soustruhy** – osa X radiální, osa Z axiální (standardní konfigurace)
- **Karusely / obráběcí centra** – osa X axiální, osa Z radiální (prohození os)

## Klíčové vlastnosti
- **CAD/CAM integrace:** Kreslení 2D prvků (LINE, ARC, CIRCLE, RECT, POLYLINE, TEXT)
  a pokročilé úpravy (FILLET, CHAMFER, TRIM, EXTEND, BREAK, MOVE, COPY, ROTATE,
  SCALE, MIRROR, ARRAY, BOOLEAN) s asociativními dimenzemi a průsečíky.
- **Generátory:** zubová kola (cylindrická/kuželová), prstové drážky (DIN/VDI),
  závity (metrické i technologické formy A/B/C).
- **G-kód / CAM:** výsekové strategie (čárový, kličkový, koncentrické obrysy),
  vrtací cykly, simulátor drah, přímočaré závity a vrtání.
- **CNC kalkulačky:** tolerance, otáčky, střih, hmotnost, prodlevy, M-kódy.
- **AI panel:** fotka výkresu → LLM analýza → soustružnický profil (Z/D).
  Poskytovatelé: Groq, Gemini, OpenRouter.
- **Online/offline:** statická webová stránka (GitHub Pages) + Service Worker/PWA.
- **UX:** tmavý/světlý režim (Catppuccin), mobilní touch ovládání, IndexedDB
  autosave, neomezené UNDO/REDO.

## Souřadnicový systém
- `wx` (world X) → vodorovně, `wy` (world Y) → svisle.
- Při exportu G-kódu/osách CNC se mapuje na X (radiální/axiální) a Z dle typu stroje.

## Stack
| Vrstva       | Technologie                                  |
|--------------|----------------------------------------------|
| Frontend     | Vanilla JS, ES modules (žádné závislosti)    |
| Ukládání     | IndexedDB, localStorage                      |
| Offline      | PWA: Service Worker + Cache                  |
| DXF          | Custom DXF parser/export (SI formát)         |
| Testování    | Vitest                                       |
| AI           | Groq / Gemini / OpenRouter API               |
| UI paleta    | Catppuccin (dark + light)                    |

## Příkazy
```bash
npm test              # spustit všechny testy (vitest run)
npm run test:watch    # watch mód
npm run test:coverage # coverage
npm run sw            # vygenerovat SW assety (scripts/generate-sw-assets.js)
# lokální běh (ES moduly vyžadují server, ne file://):
npx serve .          # nebo: python -m http.server 8080
```
Testy žijí v `tests/` (unit + integrační: CAM g-code, DXF, gear, tolerance…).

## Struktura (výběr)
```
index.html            # PWA entry point, CSP, manifest
sw.js                 # Service Worker (cache offline)
manifest.json         # PWA manifest
css/style.css         # Catppuccin Mocha/Latte (~5.5k ř.)
js/
  app.js              # vstupní bod (side-effect importy)
  state.js            # globální stav, undo/redo (pushUndo/performUndo), toast
  objects.js          # CRUD nad výkresovými objekty
  types.js            # JSDoc typové definice (registry/typy)
  constants.js        # barvy, prahy, počítadla
  bridge.js           # zprostředkovatel mezi moduly (AutoCenter, store)
  geometry.js         # průsečíky, fillet, chamfer, constraints
  canvas.js           # 2D kontext, transformace
  render.js           # překreslení celého výkresu
  dxf.js              # DXF import/export
  cnc-calcs.js        # CNC kalkulačky
  toolLibrary.js      # správa nástrojů (sdílená)
  tools/              # registry nástrojů – handlery *Click (kreslení/úpravy)
  calculators/        # CAM: gcode, camSimulator, camEditor, thread, taper, ...
  dialogs/            # dialogová okna (gear, thread, M-code, numerický input)
  storage/            # IndexedDB, export PNG, autosave
  ai/                 # AI panel + nastavení poskytovatelů
  lib/                # font loader (DXF text)
tests/                # 30+ testovacích souborů
scripts/              # generate-sw-assets.js
docs/                 # developer.md, user-guide.md
```

## Architektura (co dodržovat)
- **Stav:** jediný sdílený objekt `state` (`js/state.js`). Výkres = `state.objects`
  (pole). Změny obaluj `pushUndo()` před mutací; poté `renderAll()`.
- **Objekty:** typy definované v `js/types.js`, každý má CSS-like vlastnosti
  (stroke, dash, color…). CRUD přes `js/objects.js`.
- **Render:** reaktivní překreslení canvasu po každé změně stavu.
- **Eventy/nástroje:** `events.js` volá handlery v `tools/*.js`; nástroj se
  registruje do registry a přiděluje si canvas handlery.
- **CAM pipeline:** generátory v `js/calculators/` → struktura kontur/drah →
  `gcode.js`/`sinumerikHub.js` produkují NC výstup.
- **Bridge:** `js/bridge.js` slouží jako zprostředkovatel mezi moduly (AutoCenter,
  store) – nevytvářet přímé cyklické importy mezi moduly.

## Konvence pro změny kódu
- Žádné runtime závislosti (vanilla JS, ES modules). Nové knihovny jen po dohodě.
- Dodržovat české UI řetězce a Catppuccin paletu v `css/style.css`.
- Před změnou G-kódu/Sinumeriku ověřit, že výstup sedí pro daný řídicí systém.
- U nových nástrojů postupovat dle `docs/developer.md` § „Přidání nového nástroje“.
- Při změně nebo přidání funkcí vždy aktualizovat příslušnou dokumentaci v docs/ a případně CHANGELOG.md.
- Před PR/push spustit `npm test` – musí projít.

## Odkazy a dokumentace
- `README.md` – přehled funkcí a struktury
- `docs/developer.md` – architektura, přidání nástroje, CAM pipeline, DXF
- `docs/user-guide.md` – uživatelská příručka
- `CONTRIBUTING.md` – pravidla přispívání
- `CHANGELOG.md` – deník změn (Keep a Changelog / SemVer)
- GitHub Pages: statická distribuce aplikace
