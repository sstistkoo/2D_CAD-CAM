# Oprava VK solveru – převod na (Z,X) průměrový prostor

## Problém

Tři funkce ve `vkSolver.js` počítají v prostoru `(Z, R=X/2)`, ale používají
euklidovskou metriku jako pro kruh. Vzhledem k tomu že `X = 2R`, geometrie
v `(Z, R)` je ve skutečnosti elipsa. Kód offsetuje střed o `radius` v R-směru,
ale správný posun v X-směru by měl být `radius` (ne `2*radius`). To posouvá
tečný bod Z o ~0.67 jednotky.

Příkladem:
- `G0 X20 Z20 PA0` → paprsek v X=20, PA0 (vzdálený)
- `G3 X25 Z50 R5 T` → oblouk končí v X=25, Z=50, R=5
- Očekávaný tečný bod: `X20 Z45`
- Aktuální (bug): `X20 Z45.67`

Druhý problém: `insertTangentTransitions` parsuje surové texty bez převodu
`toSolverX`, takže při režimu zadávání v poloměru dostane solver
průměrová data jako raw hodnoty.

## Kořenová příčina

1. `tangentCircleTouchPoints`, `tangentCircleBetweenRays` a `twoTangentArcsBetweenRays`
   pracují v `(Z, R)` prostoru s kruhovou rovnicí `(z-cz)² + (r-cr)² = R²`.
2. Správná rovnice v `(Z, X)` prostoru je `(z-cz)² + (x-cx)² = R²`
   (X = průměr, R = poloměr).
3. `insertTangentTransitions` volá `parseVkLine` bez převodu `toSolverX` —
   solver dostává raw hodnoty z textarea.

## Řešení

### 1. `js/calculators/vkSolver.js` — přepsat na (Z,X) průměrový prostor

Tři funkce sdílejí stejný kořenový problém — přepsat všechny tři najednou.

- **`tangentCircleTouchPoints`**: přepsat tak, aby počítala přímo v
  `(Z, X)` s `X = průměr`. Směrový vektor: `u = {z: cos(a), x: sin(a)}`
  (již jednotkový). Normála: `n = {z: -u.x*s, x: u.z*s}`.
  Střed: `center = A + radius * n`. Kvadratická rovnice v `t`.
  Výstup: body přímo v `{z, x}`.

- **`tangentCircleBetweenRays`**: stejná změna — odstranit `/2` převody,
  počítat v `(Z, X)`, výstup v `{z, x}`.

- **`twoTangentArcsBetweenRays`**: stejná změna. Odstranit `/2` převody
  na řádcích 271, 277. Směrový vektor bez `/2`. Středy offsetovány o
  `radius` v X-směru. Výstup přímo v `{z, x}` (bez `toDiamPt`).

- **`rayDirRadius`**, **`toRadiusPt`**, **`toDiamPt`**, **`normalizeVec`**:
  po přepsání tří funkcí výše již nejsou použity — odstranit.

### 2. `js/calculators/vkContour.js` — opravit X-conversion

- **Přesunout `toSolverX`/`fromSolverX` na module-level** (momentálně jsou
  uvnitř `openVkContour` → nepřístupné pro `insertTangentTransitions`).

  ```js
  function toSolverX(val) {
    return state.xDisplayMode === 'diameter' ? val : val * 2;
  }
  function fromSolverX(val) {
    return state.xDisplayMode === 'diameter' ? val : val / 2;
  }
  ```

- **`insertTangentTransitions`** (řádek 364): převést raw X na solver X
  před voláním `pickTangentArcStart` a zpět na display X pro výstup:

  ```js
  export function insertTangentTransitions(lines) {
    const parsed = lines.map((line) => parseVkLine(line));
    const result = [];
    for (let i = 0; i < lines.length; i += 1) {
      const prev = i > 0 ? parsed[i - 1] : null;
      const cur = parsed[i];
      if (prev && cur) {
        const prevX = prev.x == null ? null : toSolverX(prev.x);
        const curX = cur.x == null ? null : toSolverX(cur.x);
        const prevForRay = prevX != null ? { ...prev, x: prevX } : prev;
        const curForArc = curX != null ? { ...cur, x: curX } : cur;
        const tangent = pickTangentArcStart(prevForRay, curForArc);
        if (tangent && (Math.abs(tangent.x - prevX) > 1e-6 || Math.abs(tangent.z - prev.z) > 1e-6)) {
          result.push(`G1 X${fmt(fromSolverX(tangent.x))} Z${fmt(tangent.z)}`);
        }
      }
      result.push(lines[i]);
    }
    return result;
  }
  ```

  Pozn.: `pickTangentArcStart` očekává hodnoty v solver prostoru (průměr).
  `insertTangentTransitions` parsuje raw hodnoty z textarea, proto je
  potřeba převod. `resolveOne` (řádek 1369) passuje už solver-space
  hodnoty z `pendingQueue` → žádná změna tam.

### 3. `tests/vk-solver.test.js` — opravit očekávané hodnoty

Všechny testy v tomto souboru kódují buggy `(Z,R)` chování. Po opravě
solveru se X souřadnice halvují (protože se už nepřevádějí R→X×2).

**`tangentCircleTouchPoints` (řádek 160-178):**
- Test "kružnice r=5 tečná k ose Z": očekávaný střed byl `(z=3, r=5)`
  = `(z=3, x=10)` v průměru. Po opravě: střed `(z=8, x=5)`, jeden tečný
  bod `(z=8, x=0)`.
  ```js
  expect(pts.length).toBe(1);
  expect(pts[0].z).toBeCloseTo(8, 6);
  expect(pts[0].x).toBeCloseTo(0, 6);
  ```
- Test "bod mimo dosah": beze změny (stále 0 výsledků).

**`tangentCircleBetweenRays` (řádek 181-202):**
- Test "pravý úhel": středy byly `(15, x=10)`, `(15, x=-10)`, `(25, x=10)`,
  `(25, x=-10)`. Po opravě: `(15, x=5)`, `(15, x=-5)`, `(25, x=5)`,
  `(25, x=-5)`. `foot2.x` mění z 10 na 5.
  ```js
  expect(centers).toEqual(['15.0,-5.0', '15.0,5.0', '25.0,-5.0', '25.0,-5.0'].sort());
  // ...
  expect(c1.foot2.x).toBeCloseTo(5, 6);  // was 10
  ```
- Test "rovnoběžné paprsky": beze změny.

**`pickBetweenRaysByVpolTag` (řádek 205-214):**
- Ref bod `x` mění z 10 na 5 (odpovídá středu `(15, x=5)`).

**`twoTangentArcsBetweenRays` (řádek 217-257):**
- Test "pravoúhlý roh": `center1.x` 10→5, `center2.x` 17.746→8.873,
  `foot2.x` 17.746→8.873. Komentář upravit na `(z=30, x=5)` a `(z=37, x=8.873)`.
- Test "obecné úhly": řádek 241 odstranit `/2` z výpočtu vzdálenosti:
  ```js
  const distCenters = Math.hypot(c.center1.z - c.center2.z, c.center1.x - c.center2.x);
  ```
- Test "degenerovaná osa": hodnota 17.746 je v (Z,X) prostoru stejná
  geometrická pozice → beze změny.

### 4. `tests/vk-contour-preview.test.js` — opravit očekávanou hodnotu

- Řádek 116: `Z45.67` → `Z45`.

## Soubory k úpravě

| Soubor | Změna |
|---|---|
| `js/calculators/vkSolver.js` | Přepsat `tangentCircleTouchPoints`, `tangentCircleBetweenRays`, `twoTangentArcsBetweenRays` na `(Z,X)` prostor; odstranit `toRadiusPt`, `toDiamPt`, `rayDirRadius`, `normalizeVec` |
| `js/calculators/vkContour.js` | Přesunout `toSolverX`/`fromSolverX` na module-level; opravit `insertTangentTransitions` s konverzí X |
| `tests/vk-solver.test.js` | Aktualizovat 4 testy na nová (Z,X) očekávané hodnoty |
| `tests/vk-contour-preview.test.js` | Opravit `Z45.67` → `Z45` |

## Validace

```bash
npx vitest run tests/vk-solver.test.js tests/vk-contour-preview.test.js
```

Očekávaný výstup: všechny testy projdou s upravenými hodnotami.

## Rizika

- **Regrese v kategorii 3 (esíčko)**: `twoTangentArcsBetweenRays` se mění
  stejně — ověřit správnost výpočtu středů a bodů zlomu. Všechny testy
  jsou v `vk-solver.test.js` a budou aktualizovány.
- **Režim poloměr/průměr**: `toSolverX`/`fromSolverX` na module-level
  čtou `state.xDisplayMode`. Otestovat oba režimy (`diameter` a `radius`).
- **Backward compatibility**: `pickTangentArcStart` očekává solver-space
  hodnoty. `resolveOne` (řádek 1369) passuje už solver-space z `pendingQueue`
  → OK. `insertTangentTransitions` teď passuje také solver-space → OK.
- **Smazání helperů**: `toRadiusPt`/`toDiamPt`/`rayDirRadius`/`normalizeVec`
  jsou použity pouze ve třech funkcích, které se přepisují → bezpečné
  odstranit.
