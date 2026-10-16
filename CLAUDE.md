# Projekt: SKICA – 2D CAD/CAM

Offline-first PWA pro 2D kreslení (CAD) a generování NC programů (CAM) pro CNC
soustruhy a karusely. Client-side SPA, bez backendu a build kroků (vanilla JS +
ES moduly, 0 runtime závislostí). UI i dokumentace česky. Verze 1.8.0, ISC.

- **Řídicí systémy (CAM výstup):** Sinumerik 840D sl, Fanuc (ISO 6983), Heidenhain TNC 640.
- **Stroje:** soustruh (X radiální, Z axiální); karusel (osy prohozené: X axiální, Z radiální).
- **Souřadnice:** `wx` vodorovně, `wy` svisle; při exportu G-kódu se mapují na X/Z dle typu stroje.
- **Funkce:** CAD (LINE, ARC, CIRCLE, RECT, POLYLINE, TEXT + úpravy FILLET…BOOLEAN),
  generátory (ozubení, drážky, závity), CAM (hrubování, vrtání, vyvrtávání, simulátor),
  CNC kalkulačky, AI panel (foto → profil; Groq/Gemini/OpenRouter), PWA, Catppuccin
  dark/light, IndexedDB autosave, UNDO/REDO.
- **Stack:** vanilla JS, IndexedDB/localStorage, Service Worker, vlastní DXF parser, Vitest.

## Příkazy
```bash
npm run test:cad      # VÝCHOZÍ mimo js/calculators/cam/** (~10 s); běží i lint
npm test              # plná sada vč. CAM (~13 min) — jen při zásahu do cam/**
npx vitest run tests/nazev.test.js   # cílený test při ladění
npm run lint          # ESLint (jen chyby)
npm run sw            # PO PŘIDÁNÍ JS SOUBORU — jinak chybí v offline cache
npm run test:coverage # POZOR: zpomalí CAM ~4×, šest testů spadne na vlastní timeout (není regrese)
npx serve .           # lokální běh (ES moduly vyžadují server, ne file://)

# CAM nástroje
node scripts/cam_rules_check.mjs soubor.camprog [--generator=simple] [--all]  # porušení pravidel
node scripts/cam_fingerprint.mjs --save=pred.json    # otisk PŘED zásahem
node scripts/cam_fingerprint.mjs --diff=pred.json    # PO zásahu → změněné díly (~35 s)
node scripts/cam_sweep.mjs                           # úběr × kolize
```

## Struktura (výběr)
`index.html` (entry, CSP) · `sw.js` · `css/style.css` · `js/app.js` (vstup) ·
`state.js` (stav, undo) · `objects.js` · `types.js` · `bridge.js` · `geometry.js` +
`geometry/` · `render.js` · `dxf.js` · `tools/` (handlery `*Click`) ·
`calculators/` (CAM: gcode, camSimulator, camEditor, cncEditor, thread…) ·
`calculators/cam/` (pipeline, ops/) · `dialogs/` · `ui.js` + `ui/` · `storage/` ·
`ai/` · `lib/` · `tests/` · `scripts/` · `docs/`.

## Architektura
- **Stav:** jediný objekt `state` (`js/state.js`); výkres = `state.objects`.
  Před mutací `pushUndo()`, potom `renderAll()`.
- **Objekty:** typy v `js/types.js`, CRUD přes `js/objects.js`.
- **Nástroje:** `events.js` volá handlery z `tools/*.js` (registry).
- **CAM pipeline:** generátory → kontury/dráhy → `gcode.js`/`sinumerikHub.js` → NC výstup.
- **Bridge:** `js/bridge.js` zprostředkuje moduly; nevytvářej cyklické importy.

## Konvence
- Žádné runtime závislosti (nové knihovny jen po dohodě).
- České UI řetězce, Catppuccin paleta v `css/style.css`.
- Před změnou G-kódu/Sinumeriku ověř výstup pro daný řídicí systém.
- Nový nástroj dle `docs/developer.md` § „Přidání nového nástroje".
- Změna/přidání funkce → aktualizuj `docs/` a `CHANGELOG.md`.
- Před PR/push: `npm run test:cad` (mimo CAM) nebo `npm test` (zásah do CAM) — musí projít.

## Efektivní práce
- **Testy:** celou sadu jen na závěr a před PR/push, při ladění cílený test.
  Mimo `js/calculators/cam/**` stačí `test:cad` (pokyn uživatele 12. 9. a 3. 10. 2026).
  `npm test` jen při změně `cam/**` nebo kódu, který CAM přímo čte (např. větev `forCam` v `runCncExport`).
- **Bezpečnostní CAM testy podle DŮKAZU (7. 9. 2026), ne preventivně.** Při zásahu do
  hrubování/kolizí/materiálu: `cam_fingerprint --save` → změna → `--diff`.
  - Otisk SHODNÝ → `collision-validator`, `material-removal`, `cam-traversal-invariants`
    se nepouští (nemají čím spadnout). Pustit jen test, na který změna reálně sahá.
  - Otisk se HNUL → pustit `tests/collision-validator.test.js` a
    `tests/material-removal.test.js` (případně `cam-traversal-invariants`).
  - Bez otisku (nelze pořídit) → testy pustit.
- **Test padá jen v celé sadě?** Nejdřív zkontroluj timeout (výchozí 5 s vitestu; teď 120 s),
  neodepisuj jako flake. Sada je deterministická, stačí jeden běh.
- **Velikost souborů:** nové soubory ~300–500 ř. Neexistující velké soubory se kvůli
  vedlejší opravě nedělí (scope-creep); rozdělení je samostatné vědomé rozhodnutí.
- **⛔ Zákaz růstu obřích souborů (12. 10. 2026):** do souborů nad ~2000 ř. se NEPŘIDÁVÁ
  nový kód; nová funkčnost jde do nového souboru, ze starého se jen zavolá. Dovoleny jsou
  malé opravy a odebírání kódu. Stropy hlídá `tests/file-size-budget.test.js` (běží v
  `test:cad`; žádný jiný soubor v `js/` nad 1500 ř.). Po zmenšení souboru strop SNIŽ.
  Dotčeno: `camSimulator.js` (5432; zbylé jádro se dál nedělí, nový kód do `cam/sim/`,
  vzory v `docs/plan-rozdeleni-cam-simulatoru.md`), `render.js`, `cam/ops/roughLong.js`,
  `cncEditor.js`, `vkContour.js`, `fileIO.js`, `camEditor.js`, `events.js`. `ui.js` a
  `geometry.js` jsou rozcestníky (kód nepřidávat). Nelze-li kód umístit, zeptej se.
- **Tokeny:** stručně, nečti opakovaně stejné soubory, nevypisuj velké výstupy. Obří soubory
  (`css/style.css`, `js/lib/browser.maker.js`, velké `js/**`) čti přes grep + `offset/limit`,
  nikdy celé. Test výstupy ořezávej (`| tail`).

## Odkazy
- `docs/cam-pravidla.md` — **JEDINÝ zdroj pravidel CAM drah** (schvaluje uživatel,
  1 pravidlo = 1 ověřitelná podmínka). Číst PŘED každým zásahem do generování drah.
  Co tam není, neplatí.
- `docs/developer.md` (architektura, nový nástroj, CAM pipeline, DXF) ·
  `docs/user-guide.md` · `README.md` · `CONTRIBUTING.md` · `CHANGELOG.md`
