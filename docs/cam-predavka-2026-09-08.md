# CAM — předávka 8. 9. 2026 (kulatá destička)

Pro pokračování v novém sezení. Díl uživatele: `projekt_2026-09-08 (4).camprog`
(kulatá destička **R 5**, ap 2,5, úhel zanoření 45°, podélně zprava, odlitek).
Fixture v repu: `tests/fixtures/cam/part-22-round-r10.camprog` (táž geometrie,
R 10).

## Jak se tu měří (bez toho nedělej nic)

```bash
node scripts/cam_fingerprint.mjs --save=pred.json   # PŘED zásahem
node scripts/cam_fingerprint.mjs --diff=pred.json   # PO zásahu
node scripts/cam_sweep.mjs                          # úběr × kolize, 29 dílů
```

Otisk shodný → bezpečnostní testy nemají čím spadnout, nepouštět je.
Otisk se hnul → `collision-validator`, `material-removal`,
`cam-traversal-invariants`.

**Měřítka, která na tomhle dílu rozhodují** (skripty jsou jednorázové, napiš si
je znovu — měří se nad `calcSim.simPath` z `tests/helpers/camHeadless.mjs`):

| co | jak |
|---|---|
| tříska nad `ap` | po každém řezném pohybu rozdíl stropu `MaterialRemoval` |
| řezy strmější než úhel zanoření | `atan2(-dx, |dz|)` proti `getEffectivePlungeAngle` |
| duplicitní dráhy | shodné dvojice bodů; + pohyby, po kterých se nezmenší plocha zbytku |
| zajetí do hotové kontury | `ContourGouge` |
| kolize | `validateToolpath` v OBOU standardech (syrový × `planStock`) |

## Stav (commit `8de7665`)

Na dílu uživatele: 78 průchodů, úběr 5 002,3 mm², zajetí do hotové kontury
**0**, tvrdé kolize **4** (pre-existující, viz níž), překročení ap **1**,
řezy strmější než 45° **39**.

### Hotovo v této sérii

| commit | co | měření |
|---|---|---|
| `e4f4b6b` | konec dílu = jeden úsek (pravidlo „dělí jen čára, co vyjede z polotovaru"; chybějící čára = žádná hranice) | úseky 4 → 3 |
| `b7e53b0` | nájezd se ořezává i ČÁSTEČNĚ (dřív všechno-nebo-nic) | duplicity 65 → 48, posuv naprázdno 730 → 548 mm |
| `61f5566` | sjezd na hloubku šikmo pod úhlem zanoření (ne kolmo) | strmé řezy 57 → 39 |
| `297278f` | mezní čára zanoření se kreslí plně | zobrazení |
| `8de7665` | **zpět** zvednutí kotvy rampy — porušovalo ap | překročení ap 5 → 1 |

## Co zbývá — v pořadí, jak to dává smysl

### 1. Tříska 5,00 mm (2× ap) na r 29,545 v pásu Z 22…48

**Dohledáno až k příčině, oprava nezačata.** Vrstva `r 32,045` ten pás nevezme,
takže ho celý sebere až `r 29,545`.

Co je ověřené:
* sken interval **vrací** (`r32,045: Z 52,4 → 19,8`),
* průchod se **vytvoří** (`passes.push` v `ops/long/pocketPass.js:209`),
* **není** to `noEntrySkips` — ten hlásí 2 vrstvy, ale obě na `r 44,545`
  (Z 113→110), ne tady,
* **není** to `holderDroppedZones` ani `deferredHolderSkips` (žádná hláška),
* v G-kódu ten průchod začíná až na **Z 19,826** místo 52,4 — tedy se cestou
  zkrátil.

**Kde pokračovat:** najít, co zkrátí `zStart` z 52,4 na 19,8. Poslední
neprověřená místa jsou post-processing v `ops/roughLong.js` (řetěz kolem
ř. 1420–1510) a `mergeLayersOverHump`.

**POZOR — zamítnuté řešení:** „když vrstva vypadne, nesmí ten materiál vzít ani
hlubší" (propagace zóny do hlubších vrstev) je ZMĚŘENĚ ŠPATNĚ: vzalo to celý
sloupec, údolí zůstalo neobrobené a přibyla tvrdá kolize
`rapid @r35,54 Z25,8 = 2,32 mm²`. Uživatel to chce naopak — materiál se má dál
brát, jen žádná vrstva nesmí ukrojit 2× ap. Správný směr je vrstvu
**ROZDĚLIT**, ne vynechat.

### 2. Zbylých 39 řezů strmějších než úhel zanoření

Rozpad: **22× 90°**, 6× 60–89°, 15× 46–59°; jen 19 z nich je hlubších než 1 mm.

* **90°** — sjezd, kde šikmou variantu zablokoval materiál nebo držák, takže
  spadla zpátky na radiální (`emitFeedToDepth` v `gcodeEmit.js`). Řešení =
  rampovat DOPŘEDU (do řezu) místo dozadu; mění to ale místo, kde průchod
  dosáhne hloubky, tedy i pokrytí. **Rozhodnutí o strategii, ne úprava.**
* **60–89°** — nájezd sleduje KONTURU a ta je tam sama 69,4° (stěna
  `50,081 → 30,156`). Omezit sklon = přestat sledovat konturu.

### 3. Čtyři tvrdé kolize držáku na dílu uživatele (PRE-EXISTUJÍCÍ)

`holder @r42,05 Z203,8 = 1,04` · `@r39,55 Z201,3 = 0,65` ·
`@r41,55 Z201,3 = 0,65` · `@r39,55 Z201,3 = 1,28 mm²`.
Ověřeno, že tam jsou i před celou touhle sérií. Nikdo je zatím nezkoumal.

### 4. Dojezd (`contourLeadOut`) se pořád jede víckrát — zbylých 48 duplicit

Ořez sufixu je záměrně jen u `pocketClean`: dojezd nejen řeže, ale i VYVÁŽÍ
nástroj ven, a jeho zkrácení posune 45° odskok tam, kde držák nemá místo
(změřeno dřív: `part-18-parting-90-ramp`, 1,0 mm² kolize). Zkracovat se smí
jen s ověřením, že odskok zůstane volný.

### 5. Přejezd vzduchem posuvem

`rapidStopZ = Vůle Z + R`, takže se před každým řezem dojíždí `1 + R` posuvem
(u R 5 šest mm, u R 10 jedenáct). Polygon R 0,8: 26,5 mm za program, kulatá
R 10: 457,7 mm. **Past:** část toho je skutečný záběr (nos se do stěny zavaluje
postupně), ne vzduch — měřítko „dno nosu vs. obrys na Z středu" to
nadhodnocuje. Bezpečná cesta je rozsekat i dojezd přes `airSplitAxial`, ne
zkrátit `rapidStopZ`.

## Zamítnuté pokusy (neopakovat bez nového nápadu)

| pokus | proč padl |
|---|---|
| zvednout kotvu rampy o rádius nosu | +230 mm² úběru, ale 4 řezy nad ap (`8de7665`) |
| vypnout předpověď pásu v `noteCutPass` | kolize beze změny a navíc tříska 47,6 mm — předpověď je nosná |
| `noteCutArc` vzorkovat od skutečné polohy | kolizi neřeší (start na oblouku neleží) a snížila zdvih na `part-20` do nebezpečné strany |
| odmítnout nesouvislý dojezd celý | ubralo úběr na 4 dílech, aniž to řešilo cíl |
| propagovat vynechanou vrstvu do hlubších | údolí zůstalo neobrobené + nová tvrdá kolize |

## Dlouhodobě červené testy (předchází této práci — nezametat)

`cam-gcode-regression`: `part-15-finish-zprava`, `part-17-long-parting`,
`range-chain-insert-shadow`.
`cam-ramp-chain`: `holder-casting-slanted-face`, `part-22-round-r10`.
`cam-collision-free`: `part-22-round-r10` v offsetovém standardu (3 nálezy
rychloposuvu, 3,6 mm²).
