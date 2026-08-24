# CAM — plán oprav (zadání uživatele 21. 8. 2026)

Čtyři samostatné body z jedné relace. Každý je **ověřený měřením**, ne odhad.
Berte je po jednom — nesouvisí spolu a každý má vlastní riziko.

---

## Výchozí stav

Základ je commit **`5c06728`** *(fix(cam): opravy detekce kolizí držáku,
vzorkování obálky a dojezdů hrubování)* — plná sada 1331/1331 zelená.
Co v něm je:

| soubor | co obsahuje |
|---|---|
| `js/calculators/cam/roughingStrategies.js` | dodělání vrstvy po dojezdu (+61 ř.) |
| `js/calculators/cam/camMath.js` | zjemnění vzorkování obálky podle tětivy |
| `js/calculators/cam/collisionValidator.js` | odečtení destičky od držáku (řezné bloky) |
| `js/calculators/cam/holderGouge.js` | totéž pro vybarvení |
| oba snapshoty + `CHANGELOG.md` | |

Podrobnosti ke každé z těch změn (včetně naměřených čísel a toho, co bylo
cestou zamítnuto) jsou v `CHANGELOG.md` pod „Unreleased".

Referenční díl: `projekt_2026-08-21 (1).camprog` ve složce Downloads
(upichovák 5 mm, držák 20 × 200, ap 3, hrubování zprava).
Stav: 42 průchodů, úběr 4374,2 mm², oranžová 0, ⛔ 0 v obou standardech.

### Jak měřit

Vše přes headless harness `tests/helpers/camHeadless.mjs` (`runCamProg`) —
pouští REÁLNÝ pipeline, ne rekonstrukci. Užitečné moduly:

- `validateToolpath` (`collisionValidator.js`) — ⛔ nálezy; **dva standardy**:
  syrový obrys (`planStock:false`, shrink 0,05) a offsetová čára
  (`planStock:true`, shrink 0,25). `backside` = `roughingSide === 'left'` —
  **bez toho měříte držák na špatné straně** a dostanete nesmysly.
- `HolderGouge` (`holderGouge.js`) — `gouge` = ORANŽOVÁ (vnoření do materiálu),
  `gougeBand` = ČERVENÁ (vjezd do pásu k offsetové čáře). O `band` se musí
  požádat (`{ band: true }`), jinak se červená vůbec nepočítá.
- `MaterialRemoval` / `StockModel` — úběr. **Vždycky měřte i úběr**, ne jen
  kolize: „0 kolizí" neznamená, že změna neublížila.

Sweep přes `tests/fixtures/cam/*.camprog` je jediný způsob, jak poznat, jestli
oprava neplatí jen na jednom dílu.

---

## Bod 1 — šikmý rychloposuv na další vrstvu — **HOTOVO 21. 8. 2026**

> Opraveno v `safeRapidTo` (`gcodeEmit.js`): sjezd dělí na Z-pak-X, výjezd
> opačně. Napříč 24 fixtures 0,00 % rozdílu v úběru, žádná změna v kolizích.
> Detail v CHANGELOGu. Níže původní zadání pro kontext.

**Příznak:** přejezd na další vrstvu jede diagonálně a přitom protne polotovar.
Uživatel chce **napřed Z, pak teprve X**.

**Doloženo:** v programu jsou přesně dva takové pohyby (mění X i Z zároveň):

```
(X25.350 Z141.189) → (X19.543 Z175.282)   N2250 G0 X19.543 Z175.282
(X24.702 Z76.247)  → (X18.725 Z83.432)    N2820 G0 X18.725 Z83.432
```

Oba jsou nájezd na zanořovací průchod („Rampa 90°").

**Kde:** emise, `gcodeEmit.js` — hledejte `safeRapidTo`. Ta už umí bezpečné
pořadí (zvednout v X → přejet v Z → sjet), takže jde nejspíš o cestu, která ji
obchází a vydá jeden diagonální `G0`.

**Postup:** najít, který blok ten `G0` vydává (nejrychleji: dočasný tag
u `addN` a dohledat volajícího), a rozdělit ho na Z-pak-X. Pozor na pořadí: při
**zanořování** je bezpečné pořadí opačné než při výjezdu — řiďte se
`rapidHitsStock` / `holderHitsRapid`, které v emisi už existují, ne intuicí.

**Ověření:** znovu spustit sondu na šikmé G0 (nesmí zbýt žádný, který protíná
plánovací obrys) + sweep, že nikde nepřibyla kolize.

---

## Bod 2 — jedna vrstva zvrchu nedodržuje ap — **HOTOVO 21. 8. 2026**

> Příčina byla jinde, než říkalo podezření níže: nebyl to práh `SKIM_MIN_LAYER`,
> ale to, že skim mřížka je kotvená na `planTopX` a hlavní na `maxStockX` — o Vůli X
> se rozešly. Skim pás se teď dělí rovnoměrně tak, aby dosedl na hlavní mřížku
> (2 × 2,0 mm místo 3,0 + 1,0). Napříč 24 fixtures 0,00 % rozdílu v úběru,
> žádná změna struktury. Detail v CHANGELOGu; níže původní zadání pro kontext.

**Příznak:** `N230 G1 Z196.278` — vrstva, která nemá záběr ap.

**Doloženo:** žebřík hloubek při ap = 3:

```
X62.545
X61.545   krok 1.000   ← není ap
X58.545   krok 3.000
X55.545   krok 3.000   … dál už všechno 3,000
```

Takže **jen ten jeden krok** (62,545 → 61,545) je 1 mm; zbytek žebříku je
v pořádku. Polotovar má v tom místě X 64,545.

**Kde:** hloubkový žebřík v `roughingStrategies.js` (`depths`), a hlavně
`SKIM_MIN_LAYER` — skim vrstva nad nakresleným vrcholem se přidává proto, že
materiál může sahat až na offsetovou čáru (commit `55c42d6`). Podezření: skim
vrstva se vloží na 62,545 a **zbytek pod ní** (1 mm) se nesloučí, protože práh
je 10 % ap = 0,3 mm a 1,0 mm je nad ním.

**Postup:** nejdřív ZJISTIT, jestli je 62,545 opravdu skim vrstva (vypsat
`depths` a označit, která je skim). Teprve pak řešit slučování. **Nezvedat práh
naslepo** — při běžném Přídavku se dnes nemění nic a snapshoty jsou na to
odladěné.

**Riziko:** nízké, ale dotýká se čerstvého commitu — přečtěte si jeho zápis
v CHANGELOGu, ať nevrátíte, co řešil.

---

## Bod 3 — virtuální zvětšení tloušťky držáku — **HOTOVO 24. 8. 2026**

> Nový parametr `holderInflate` + pole v pravém panelu vedle „Stop rychlop.
> před čarou". Zvětšení je **jednostranné** (jen k obráběné straně), záškrt
> „vše" přepne na celý obvod — nafouknutí na NEOBRÁBĚNOU stranu je
> katastrofa (⛔ 0 → 12, úběr 4381 → 10310 mm²) a pod hrot se nafouknout
> nesmí vůbec. Překlápí se se stranou hrubování samo. Napříč 24 fixtures
> při 1 mm úběr jen klesá a skutečný držák nikde nepřibral kolizi.
> Detail v CHANGELOGu; níže původní zadání pro kontext.

**Zadání:** v pravém panelu dát „Stop rychlop. před čarou" na nový řádek a
vedle přidat pole pro **virtuální zvětšení tloušťky držáku**; dráhy se počítají
z něj.

**Proč je to dobrý nápad a proč to řešit takhle:** v téhle relaci jsem zkoušel
udělat vůli držáku od polotovaru jako vnitřní konstantu (`HOLDER_STOCK_CLEARANCE`)
a **selhalo to obojím směrem**:

- jako **tvrdé zamítnutí** smazala celý krček pod přírubou („teď tam nemám vůbec
  žádnou dráhu") — 7 odložených zanoření vynecháno, −79 mm² na dílu,
- jako **preference** byla naprostý no-op (0,00 % napříč 24 fixtures), protože
  kotva, o kterou šlo, je vjezd regionu a hlídáním s vůlí vůbec neprochází.

Vůle uvnitř algoritmu je tedy slepá ulička. **Nafouknutí OBRYSU je jiná věc** —
to není preference, ale reálný geometrický vstup, takže ho **všechny** hlídací
mechanismy vezmou konzistentně: `holderFitsAt`, `makeHolderClamp`,
`HolderGouge`, `validateToolpath` i mezní čáry čtou tentýž `holderWorldLoop`.

**Kde:** `holderProfileLoop` / `holderWorldLoop` v `collisionValidator.js`.
Nový parametr (např. `holderInflate`, default **0** = dnešní chování) a v
`holderWorldLoop` `polyOffset([loop], holderInflate, 'miter')`.

**Na co si dát pozor (naběhl jsem na to):**

- `holderWorldLoop` vrací **null**, když držák není (`holderWidth 0` bez
  vlastního obrysu). `polyOffset([null], …)` spadne v `toClipperLoop`.
  Hlídá to `tests/cam-holder.test.js`.
- Klíč cache validátoru v `camSimulator.js` (`_validatedKey`) obsahuje
  `holderWidth`, `holderLength`, `holderProfile` — **přidat i nový parametr**,
  jinak se po jeho změně ⛔ panel nepřepočítá.
- Uložit do `.camprog` (params) a do knihovny nožů.

**Ověření:** s `holderInflate = 0` musí být snapshoty **bit po bitu shodné**.
Teprve pak zkoušet nenulovou hodnotu na dílu uživatele.

---

## Bod 4 — červená pod plátkem se po odjetí zase objeví — **HOTOVO 24. 8. 2026**

> Postup níže (rozdělit hlídání na dvě tělesa) je provedený, ale sám o sobě
> je **měřitelně no-op** — asymetrie u G0 nikde nevystřelí. Skutečná příčina
> byla v MODELU MATERIÁLU: `HolderGouge` ubíral tenkým plánovacím profilem
> (10,6 mm²) místo tělem destičky (76,6 mm²), takže držák narážel do
> materiálu, který je na plátně dávno pryč. Navrch `toolSweep` vrací jen
> stopu HRANICE a na krátkém kroku nechává uprostřed ostrůvek. Červená na
> dílu uživatele 2,46 → 1,36 mm², nálezy ⛔ beze změny. Detail v CHANGELOGu.

> **ZBÝVÁ (nové zjištění, samostatná práce):** `toolSweep` v `geomCore.js`
> je děravý pro CELOU aplikaci — chybí mu člen `A + b₀`, takže stopa
> 17 mm² zamete při kroku 0,2 mm jen 4,3 mm². Oprava je jednoduchá
> (sjednotit s obrysem na obou koncích úseku), ale hýbe úběrem i emisí:
> změřeno `part-4` `N840 G0 X52.690` → `X52.689`. Tady je obejitá lokálně
> (`sweepSolid` v holderGouge.js), aby bod 4 nesahal na dráhy.

**Příznak:** když nástroj do místa najede, je to dobře; když odjede, něco se tam
zase objeví.

**Kontext:** v předchozí relaci se opravilo, že se prostor destičky hlásil jako
kolize držáku — od obrysu držáku se odečítá `toolFootprintVisual` (týž obrys,
jaký simulátor kreslí). **Ale jen u ŘEZNÝCH bloků**; u rychloposuvu se schválně
bere držák CELÝ, protože tam nemá v materiálu co dělat ani tělo destičky a
`toolFootprint` (tenký řezný profil, X −0,8…6 × Z −0,8…0,8) ho nepokrývá —
tělo sahá na X 15 × Z 4,2.

**Doloženo** — kdo dnes vyrábí červenou (pás):

```
ŘEZ  1.61 mm²  N2280 G1 Z139.365
G0   0.80 mm²  N2770 G0 X19.545     ← tady se bere držák CELÝ
ŘEZ  0.80 mm²  N2780 G1 Z82.756
ŘEZ  0.42 mm²  N2830 G1 X16.925
ŘEZ  0.67 mm²  N2850 G1 Z75.510
```

Takže část je z rychloposuvu (ta asymetrie) a část z řezu.

**Druhá půlka vysvětlení:** `HolderGouge` je **záznam** — jednou vybarvené
místo tam zůstane i po přejetí (je to úmysl, viz hlavička souboru). Dokud přes
něj stojí nakreslená destička, není vidět; jakmile nástroj odjede, odkryje se.
Uživatel tedy nejspíš vidí obojí: skutečný záznam a k němu ten kus z G0.

**Postup:** rozdělit hlídání na dvě tělesa místo jednoho:

- **DRŽÁK** = `holder − toolFootprintVisual`, a to **i u rychloposuvu**,
- **DESTIČKA** = `toolFootprintVisual` (ne jen tenký `toolFootprint`), testovaná
  u rychloposuvu zvlášť a hlášená jako „rychloposuv materiálem", ne jako držák.

Tím zmizí asymetrie i falešné obarvení, a přitom se **nic neztratí** — dnešní
pokrytí těla destičky u G0 převezme ta druhá větev.

**Ověření:** `tests/cam-collision-free.test.js` musí zůstat zelený (je to tvrdý
plošný invariant) a sweep nesmí nikde ztratit nález. Pozor: tahle změna umí
kolize jen UBRAT, takže zelené testy samy o sobě nic nedokazují — porovnejte
seznam nálezů před/po kus po kuse.

---

## Otevřené, vědomě odložené

- **Prostor za přírubou** (Z 172–216, 1660,9 mm² zbytku): změřeno jako
  **skutečná mez**, ne vada. Bezpečně by šla jediná vrstva ze třinácti
  (73,8 mm²) a i na tu je potřeba vjezd za boss. Kolize roste lineárně
  s hloubkou (~1,5 mm²/vrstvu) — čelo příruby je 47,6 mm vysoké. Zrcadlený
  držák (zleva) je 9–268 mm². **Neotvírat bez nového zadání.**
- **Kolmé zanoření upichovákem** místo rychloposuvu (nápad uživatele: při −90°
  by mohl sjet posuvem a cestou něco sebrat). Nová funkce, ne oprava.

---

## Obecné pasti (stálo mě to dnes několik slepých uliček)

1. **Vůle je preference, ne kolize.** Nesmí prosáknout do míst, která práci
   zahazují (kapsa, odložené vjezdy) — tam patří holá geometrie.
2. **Neměřte držák proti materiálu, který týž pohyb odebírá.** Destička si po
   cestě řeže stopu; test musí simulovat řez souběžně, jinak vyjde kolize tam,
   kde žádná není. Tohle mě dnes dvakrát svedlo na špatnou diagnózu.
3. **U špičky je vůle geometricky nemožná** — spodní hrana držáku tam leží na
   úrovni hrotu. Počítá se jen tělo za destičkou (`insertReachZ`).
4. **Sken NADHODNOCUJE proti polygonu** (proto `HOLDER_FIT_TOL` 2,0, ne 0,5) —
   měřené artefakty 0,61–1,09 mm² proti skutečným vadám 6,58 a 26,16 mm².
5. **Pořadí průchodů není pořadí plánování** — `__deferEntry` posouvá zanoření
   na konec regionu. Kdo měří „co už je odebráno", musí to vzít v potaz.
