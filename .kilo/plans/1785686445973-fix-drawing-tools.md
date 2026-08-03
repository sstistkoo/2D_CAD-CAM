# Oprava kreslicích tlačítek – plán

## Shrnutí zjištění

| # | Problém | Snížený dopad | Soubor / řádky |
|---|---------|---------------|----------------|
| 1 | `linearArray` tlačítko: bridge vrací `true` bez výběru → `setTool()` se nevolá → nástroj nelze aktivovat bez předchozího výběru. Chybí `case "linearArray"` v `handleCanvasClick()`. | Uživatel se musí vybrat objekt PŘED klikem na tlačítko. | `index.html` 1136, `js/events.js` 907–1120, `js/ui.js` 2752–2757, `js/events.js` bridge 91–98 |
| 2 | `mirror` tlačítko: bridge vrací `false` bez výběru → `setTool('mirror')` se volá → nástroj se aktivuje, ale chybí `case "mirror"` v `handleCanvasClick()` → klik na plátno nedělá nic. | Nástroj je "mrtvý" po aktivaci bez výběru. Navíc bridge bez výběru nedává žádnou zpětnou vazbu (žádný toast). | `index.html` 1019, `js/events.js` 907–1120, `js/ui.js` 2748–2757, `js/events.js` bridge 50–80 |
| 3 | Chybí desktopové tlačítko `measure` v topbaru. Na mobilu existuje `#mobileMeasure`, na desktopu chybí. | Na desktopu lze měřit jen klávesou `m` nebo kontextovým menu. | `index.html` topbar (ř. 244+), `js/touch.js` 161–174, `js/ui.js` 2839–2840 |
| 4 | Dead code: `handleFilletClick`, `handleChamferClick` a odpovídající `case` bloky v `events.js` nejsou z UI dostupné (nahrazeno `filletChamfer`). | Žádný běhový dopad, jen zbytečný kód. | `js/events.js` 975–981, import v `events.js` 18 |

## Klíčové rozhodnutí: pattern pro `linearArray` a `mirror`

Porovnání s existujícími nástroji:

| Nástroj | Bridge bez výběru | Tool aktivuje? | Canvas handler |
|---------|------------------|----------------|----------------|
| `tangent` | vrací `false` (žádný toast) | ✅ | ✅ – spustí tangent workflow |
| `dimension` | vrací `false` (žádný toast) | ✅ | ✅ – spustí kótování |
| `rotate` | vrací `true` + toast | ❌ | ✅ – ale nedosažitelný bez výběru |
| `linearArray` | vrací `true` + toast | ❌ | ❌ |
| `mirror` | vrací `false` (žádný toast) | ✅ | ❌ |

**Zvolený pattern:** `linearArray` a `mirror` budou aktivovatelné nástroje jako `tangent` a `dimension`:
- Bridge vrací `false` bez výběru (může dát toast jako zpětnou vazbu)
- Tool se aktivuje
- Canvas handler vybere objekt pod kurzorem a otevře dialog

Tím uživatel získá dva workflow:
1. Pre-select objekt → klik na tlačítko → dialog okamžitě
2. Klik na tlačítko → klik na objekt na plátně → výběr + dialog

## Plán oprav

### 1. Opravit `linearArray` – bridge + canvas handler

**Soubor:** `js/events.js`

**1a. Upravit bridge funkci (ř. ~91–98):**
```javascript
bridge.linearArrayFromSelection = () => {
  const indices = state.multiSelected.size > 0
    ? [...state.multiSelected]
    : state.selected !== null ? [state.selected] : [];
  if (indices.length === 0) {
    showToast("Nejdříve vyberte objekt");
    return false;  // allow tool activation
  }
  startLinearArrayAction();
  return true;
};
```

**1b. Přidat `case "linearArray"` do `handleCanvasClick()` (do `switch` bloku cca ř. 1070):**
```javascript
case "linearArray": {
  const idx = findObjectAt(wx, wy);
  if (idx === null) { showToast("Nejdříve vyberte objekt"); break; }
  state.selected = idx;
  state.multiSelected.clear();
  renderAll();
  startLinearArrayAction();
  break;
}
```

### 2. Opravit `mirror` – bridge + canvas handler

**Soubor:** `js/events.js`

**2a. Upravit bridge funkci (ř. 50–80) – přidat toast bez výběru:**
```javascript
bridge.mirrorFromSelection = () => {
  if (state.selected === null && state.multiSelected.size === 0) {
    showToast("Nejdříve vyberte objekt");
    return false;  // allow tool activation (currently returns false silently)
  }
  // ... rest unchanged
};
```

**2b. Přidat `case "mirror"` do `handleCanvasClick()` (do `switch` bloku cca ř. 1070):**
```javascript
case "mirror": {
  const idx = findObjectAt(wx, wy);
  if (idx === null) { showToast("Nejdříve vyberte objekt"); break; }
  state.selected = idx;
  state.multiSelected.clear();
  renderAll();
  startMirrorAction();
  break;
}
```

### 3. Přidat desktopové tlačítko `measure` do topbaru

**Soubor:** `index.html`

Vložit nové tlačítko do `#topbar` hned za tlačítko `Dimension` (ř. 315, za `</button>` kóty):

```html
<button
  class="tool-btn"
  data-tool="measure"
  title="Měření vzdálenosti a úhlu"
  aria-label="Měření"
>
  <svg viewBox="0 0 24 24">
    <line x1="4" y1="18" x2="20" y2="18" stroke="currentColor" stroke-width="2" />
    <line x1="4" y1="6" x2="4" y2="18" stroke="currentColor" stroke-width="1.5" />
    <line x1="20" y1="6" x2="20" y2="18" stroke="currentColor" stroke-width="1.5" />
    <line x1="4" y1="10" x2="20" y2="10" stroke="currentColor" stroke-width="1.5" />
    <text x="12" y="8" text-anchor="middle" font-size="7" fill="currentColor">m</text>
  </svg>
  Měření
</button>
```

**Poznámka:** `data-tool="measure"` zapojí tlačítko do existujícího toolbar event listeneru. `setTool()` správně nastavuje `.active` třídu. Klávesová zkratka `m` zůstává zachována. `handleCanvasClick` už má `case "measure":` a volá `handleMeasureClick`.

### 4. (Volitelné) Vyčistit dead code pro `fillet` a `chamfer`

**Soubor:** `js/events.js`

- Odebrat `case "fillet":` a `case "chamfer":` z `handleCanvasClick()` (ř. 975–981)
- Odebrat `handleFilletClick`, `handleChamferClick` z importu z `'./tools/index.js'` (ř. 18)

**Poznámka:** Tento krok není kritický. Může být proveden jako samostatný refaktoring po ověření, že `filletChamfer` plně nahrazuje starší nástroje.

## Závislosti a pořadí

- Kroky 1a a 1b jsou návazné (nejprve bridge, pak handler)
- Kroky 2a a 2b jsou návazné
- Kroky 1 a 2 jsou nezávislé na sobě
- Krok 3 je zcela nezávislý
- Krok 4 může být proveden kdykoli

## Validace po opravě

1. **linearArray:**
   - Klik na tlačítko bez výběru → toast "Nejdříve vyberte objekt", nástroj se aktivuje
   - Klik na plátno na prázdné místo → stejný toast
   - Klik na objekt na plátno → výběr + otevření dialogu lineárního pole
   - S předvybraným objektem → klik na tlačítko → dialog okamžitě

2. **mirror:**
   - Klik na tlačítko bez výběru → toast "Nejdříve vyberte objekt", nástroj se aktivuje
   - Klik na plátno na prázdné místo → stejný toast
   - Klik na objekt na plátno → výběr + otevření dialogu zrcadlení
   - S předvybraným objektem → klik na tlačítko → dialog okamžitě

3. **measure:**
   - Na desktopu se zobrazí nové tlačítko "Měření" v topbaru hned za "Kóta"
   - Kliknutí spustí měření (2-click workflow)
   - Opětovné kliknutí vrátí na Výběr
   - Klávesa `m` stále funguje

4. **Zkoušky:**
   - Spustit `npm test` – všechny existující testy musí projít
   - Přidat do `tests/events.test.js` testy pro nové `case` bloky (`linearArray`, `mirror`)

## Riotrizace

- Žádné změny v API nebo datových strukturách.
- Žádné nové závislosti.
- Zpětná kompatibilita se stávajícím UI i klávesovými zkratkami je zachována.
- Změny jsou minimální – úprava bridge funkcí, doplnění case bloků, přidání jednoho HTML tlačítka.
- Pattern aktivovatelných nástrojů (`tangent`, `dimension`) je dodorován.
