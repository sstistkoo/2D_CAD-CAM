# Kontribuční příručka SKICA

## Vývojové prostředí

```bash
git clone https://github.com/tvuj-user/2D_CAD-CAM.git
cd 2D_CAD-CAM
npm install
```

Spusť lokální server:
```bash
npx serve .
# nebo
python -m http.server 8080
```

> POZOR: ES module importy nefungují přes `file://` – vždy potřebuješ HTTP server.

## Testování

```bash
npm test              # Vitest (run once)
npm run test:watch    # Watch mode
npm run test:coverage # s coverage
```

Testy jsou v `tests/`. Pridavej test pro každou novou feature nebo bugfix.

---

## Pravidla kódu

### Základní
- **Vanilla JS** – žádné frameworky, žádný build step
- **ES moduly** – vždy `export`/`import`, žádné globální proměnné
- **JSDoc typy** – přidávej `@param` a `@returns` do nových funkcí
- **Čeština** – UI texty a komentáře v kódu jsou v češtině
- **No console.log** – používej `showToast()` pro uživatelské zprávy, `console.warn/error` pro debug

### Důležité patterns

1. **Bridge pattern** – nepoužívej přímé importy mezi moduly, které by mohly vytvořit cyklus. Více v [docs/developer.md](docs/developer.md).

2. **Undo/Redo** – `pushUndo()` ukládá snapshot `state.objects`. Pro batch operace použij `withUndoBatch(() => { ... })`.

3. **Přidání objektu** – vždy přes `addObject()`, nepřímo `state.objects.push()`. `addObject()` přidělí ID, vrstvu a přepočítá průsečíky.

4. **Render** – volá se automaticky po změnách. Pokud potřebuješ vynutit překreslení, použij `bridge.renderAll()` nebo `renderAll()`.

5. **Event handlery** – registruj v `js/events.js` (desktop) a `js/touch.js` (mobil). Nástroje jsou v `js/tools/`.

---

## Přidání nové feature

1. **Projdi** [docs/developer.md](docs/developer.md) pro přehled architektury
2. **Přidej typ** do `js/types.js` (pokud potřebuješ nový objekt)
3. **Implementuj** v odpovídajícím modulu (`tools/`, `calculators/`, `dialogs/`)
4. **Zaregistruj** v `tools/index.js` nebo přímo v UI
5. **Přidej test** do `tests/`
6. **Spusť** `npm test` – všechny testy musí projít

### Příklad commitu

```
feat(cam): přidání zanořovacího úhlu podle sklonu kontury
fix(ui): oprava zoomu od kurzoru na desktopu
refactor(cam): sloučení hrubovacích strategií do ROUGHING_STRATEGIES
docs(help): doplnění M-kódů pro chlazení
chore(deps): update Vitest na v4.1.2
```

---

## Formát commitů

Používej **conventional commits**:

- `feat(scope):` – nová funkce
- `fix(scope):` – oprava chyby
- `refactor(scope):` – refaktoring bez změny chování
- `docs(scope):` – dokumentace
- `test(scope):` – testy
- `chore(scope):` – maintenance, závislosti
- `perf(scope):` – optimalizace výkonu

`scope` je volitelný název modulu (např. `cam`, `ui`, `dxf`, `calc`). Popis v češtině, bez diakritiky v angličtině pokud je to technický termín.

PR otevřením issue s popisem změny. Zeptej se na review pokud nejsi jistý/a.
