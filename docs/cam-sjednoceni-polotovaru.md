# Sjednocení polotovaru na offsetovou čáru

> Rozpracovaný plán. Navazuje na `docs/geometry-libs-migration.md`
> (ÚKLID bod 1, 10. 8. 2026). Stav k 20. 8. 2026.

## Zadání

Uživatel, opakovaně 20. 8. 2026:

> *„Obrobek je celý i s tou offsetovou čarou, neboli polotovar nekončí na čáře
> polotovaru, ale na offsetové čáře — je to přídavek, kdyby byl materiál větší.
> Mělo by to tak být i dělané, že ten polotovar končí až na té offsetové čáře.“*
> A: *„Nebudeme vůbec brát tu červenou čáru od polotovaru, ta přestane pro dráhy
> existovat.“*

Přídavek X/Z (polo.) je v zadání právě proto, že odlitek **může** být větší.
Materiál až k offsetové čáře tedy reálně existovat může → plánuje se
pesimisticky a **náraz do té zóny je náraz**.

---

## Definice HOTOVO (měřitelná)

`validateToolpath` umí dnes odpovědět v obou standardech (`opts.planStock`).
Rozdíl mezi nimi **JE seznam práce** — a je konečný:

| standard | nálezů | celkem |
|---|---|---|
| syrový obrys (`planStock: false`, dnešní default) | **0** | 0 mm² |
| offsetová čára (`planStock: true`) — výchozí stav 20. 8. | **46** | 185,2 mm² |
| **po krocích 2 a 3** | 40 | 104,0 mm² |
| **po kroku 4** | 23 | 91,9 mm² |
| po kroku 5a (`stairAt`) | 18 | 50,5 mm² |
| **po kroku 5b (`stockTopTab`)** | **10** | **9,2 mm²** |

Ze zbylých 10 je **8 mělčích než 0,25 mm** (drift modelu zbytku, ne vada
plánování) a **2 skutečné** — rampa do kapsy na `holder-region-roughing`
(viz krok 5). Naměřeno 20. 8. 2026 na všech
24 fixtures (`tests/fixtures/cam/*.camprog`), `maxIssues: 400`, **jedna fixture =
jeden proces** (ve sdíleném procesu vyjde 44 — singleton `S` kontaminuje).

Fixtures už čisté i v offsetovém standardu (16 z 24): `part-1`, `part-2`,
`part-4`, `part-6`, `part-8`, `part-9`, `part-10`…`part-14`, `part-19`,
`pocket-wall`, `range-chain-steep-face`, `face-casting`, `face-cylinder`,
`holder-casting-slanted-face`.
Čistých je **20 z 24**. Zbylé: `holder-region-roughing` (4 / 4,9 mm²),
`range-end-leadout` (2 / 1,7), `part-15` (2 / 1,3), `part-17` (2 / 1,3).

**HOTOVO = těch 10 je 0 a `tests/cam-collision-free` běží s `planStock: true`.**
Tohle číslo je průběžný ukazatel — po každém kroku se přeměří.

> Pozor: „→ 0“ je metrika KOLIZÍ. Sama o sobě nestačí — viz
> `feedback_measure-removal-not-just-collisions`. Ke každému kroku se měří
> i **odebraná plocha** (mm²), ne jen počet nálezů a `passCount`.

---

## Co UŽ na offsetové čáře je

| co | kde |
|---|---|
| plánování drah | `planLoopRef()` — `cam/gcodeEmit.js:561` |
| vjezd průchodu (horní hrana okna) | `passEntryZ` / `stockCrossingsAt` — `cam/roughingStrategies.js:1809` |
| zastavení rychloposuvu před čarou | param `rapidFeedGap` (`rapidStopXAt`, `rapidStartXAt`) |
| čelní přejezd v Z | `rapidStockPlan` + `rapidHitsPlan` — `cam/gcodeEmit.js:437` |
| hlídání držáku nad SYROVÝM pásem | `stairAt` = `povrch + clrXFC` (`holderGuardFace`) |
| ⛔ panel v aplikaci | `camSimulator.js:1064` posílá `planStock: true` |
| náhled: pás + červený `gougeBand` | `MaterialRemoval(…, {planningOutline})`, `HolderGouge(…, {band})` |
| **dojezd podélného průchodu ven z polotovaru** | `offsetExitZ` — `cam/gcodeEmit.js:581` (viz krok 1) |
| **vrchol hloubkové posloupnosti (skim vrstva)** | `planTopX` — `cam/roughingStrategies.js:1195` (krok 2) |
| **čelo: první vrstva (skim vrstva)** | `planEdgeZ` — `cam/roughingStrategies.js:261` (krok 3) |
| **axiální rychloposuv v těle průchodu** | `hitsStock` — `cam/gcodeEmit.js:1240` a `:1319` (krok 4) |
| **čelní hlídání držáku nad syrovým pásem** | `stairAt` — `cam/roughingStrategies.js:920` (krok 5a) |
| **kotva rampy: povrch u svislého čela** | `stockTopTab` — `cam/roughingStrategies.js:1389` (krok 5b) |

## Co na ní NENÍ

1. **Čelní `castingOuterAtZ` pořád čte syrovou siluetu** pro `xSurface`
   a doběh — ale symptom pro to zatím není změřený (viz krok 3).
2. **Dva dynamické modely vedle sebe** (`rapidStock` syrový + `rapidStockPlan`).
   Rozhodování už je sjednocené (krok 4), zbývá jen sloučit kód → krok 8.
3. ~~**Validátor má dva standardy**~~ → hlídají se OBA (krok 6).
4. **Náhled kreslí na dvakrát** (světlý pás + jádro), ne jeden odstín.

---

## Proč NE velký třesk (a co s větví `wip/sjednoceni-polotovaru`)

Na větvi leží hotová změna: `buildStockLoop()` vrací offsetovou smyčku,
`buildStockLoopRaw()` zůstává pro nakreslený obrys. Jedna hranice, všech
6 konzumentů naráz.

**Nepoužívat.** Dva doložené důvody:

- **Rozbije 59 testů v 16 souborech** a NENÍ oddělené, co je jen zápis staré
  hranice (`boolean-roughing`, `boolean-layer-components`,
  `boolean-region-roughing` — „mezikruží 500 mm²“ už není 500) a co je
  skutečná regrese (`cam-collision-free`, `cam-finish-holder`,
  `cam-leadout-air-rapid`, `cam-backside-mirror`, `cam-face-insert-reach`).
- **Stojí na starším základu.** Větev nezná dnešní `opts.band` v `HolderGouge`
  ani `opts.planningOutline` v `MaterialRemoval` — merge by sebral práci na
  náhledu z 19. 8. Viz `feedback_dont-rebase-fixes-onto-older-base`.

**Co z ní ale vzít** (samostatně, jako vlastní commity):

- `bd6d85c` — **hardening `airSplitAxial`**: „vzduch“ se rozhodoval jen podle
  toho, že NOS je nad hranicí; netestoval, jestli nad nástrojem nestojí
  materiál. Nově se každý úsek označený jako vzduch ověří dynamickým zbytkem
  a při nárazu se jede posuvem (`part-11` 13 → 11 nálezů). Patří do kroku 4.
- `eb5340e` odhalil skutečnou chybu: `offsetLoopOf` byla identita, ale
  `buildStockLoop` vracel syrový obrys → podélné plánování o offset **přišlo**.
  Na `main` už neplatí, ale je to past, do které se dá spadnout znovu.

---

## Vedoucí myšlenka: hranice je dvouvrstvá — plánovač × emise

Sjednocení NENÍ „přepiš všude `buildStockLoop` na offset". Hranice žije ve
DVOU vrstvách a každá má svou roli:

- **Plánovač** (`roughingStrategies.js`) pracuje se SYROVOU geometrií, protože
  z ní odvozuje TOPOLOGII: kde je stěna kontury, kde končí díl, co je kapsa
  a co otevřený doběh. Ta klasifikace (`blocked`) je nosná — kapsy se zanořují
  rampou a obálka držáku je záměrně neořezává.
- **Emise** (`gcodeEmit.js`) hranici PŘEKLÁDÁ na offsetovou čáru až u konkrétního
  pohybu: `offsetExitZ` (dojezd ven), `trimLeadOutToStock` (dojezd po kontuře),
  `airSplitAxial` (co je vzduch), `findRampOutTarget` (cíl rampy),
  `rapidStopXAt` / `rapidStartXAt` (kde končí rychloposuv).

**Pravidlo, které z toho plyne:** posunout hranici v plánovači znamená
dvojí aplikaci (emise ji posune ještě jednou) NEBO změnu topologie. Krok 1 na
tom padl — obojí najednou. Zbylé kroky proto míří tam, kde plánovač hranici
používá k něčemu, co emise dorovnat NEUMÍ:

- ~~**hloubková posloupnost** (`maxStockX`) — sílu první třísky emise
  neopraví~~ → krok 2, HOTOVO,
- **čelní `castingOuterAtZ`** — povrch, od kterého se odvíjí celý doběh,
- **`rapidStock`** — dynamický model, ze kterého emise sama rozhoduje.

---

## Kroky

Pořadí není libovolné: **nejdřív se hne řezná hranice (2–3, hotovo), pak se
ladí přejezdy (4 hotovo, 5 částečně)**. Obráceně by se přejezdy ladily dvakrát.

**Před KAŽDÝM krokem** ověř probem nad `calcSim.simPath`, že symptom je vidět
ve vygenerovaném G-kódu. Krok 1 se takhle celý rozpadl — viz níž.

### ~~Krok 1 — spodní hrana podélného okna~~ ⛔ ODPADÁ (ověřeno 20. 8. 2026)

**Premisa byla chybná. Nic tu k opravě není — emise to už dělá.**

Tvrzení „podélné průchody končí na syrovém konci polotovaru" vzniklo měřením
`pass.zEnd`, tedy PLÁNOVAČE. Jenže dojezd na offsetovou čáru dělá až EMISE:
`offsetExitZ` (`gcodeEmit.js:581`) u každého NEBLOKOVANÉHO průchodu bez dojezdu
po kontuře prodlouží tělo na `min(bodyEndZ − VůleZ, offsetová hrana)`
(`gcodeEmit.js:1337`). `pass.zEnd` proto zůstává na syrové geometrii
**záměrně** — je to vstup, ne výsledek.

**Důkaz** (probe nad `calcSim.simPath`, tedy nad naparsovaným SKUTEČNÝM
G-kódem, všech 24 fixtures): **žádný** axiální řezný pohyb nekončí na syrové
hraně polotovaru v situaci, kdy je offsetová čára dál. Nula nálezů.
Na `part-1` emise vydá `G1 Z-10.000` → `G1 Z-11.000` při syrovém konci −10
a offsetové čáře −11 — přesně na ní.

**Co udělá změna v plánovači** (zkoušeno, změřeno, zahozeno):
- **Dvojí aplikace.** `pass.zEnd = −11` → emise prodlouží na −12, tedy 1 mm
  ZA offsetovou čáru. Posuv vzduchem navíc, žádný zisk.
- **Prosté posunutí `effZMin` níž rozbije topologii intervalů.** Sken o kus dál
  narazí na ČELO dílu a poslední interval se z „doběhl na konec polotovaru"
  (`blocked: false`) překlopí na KAPSU (`blocked: true`). Kapsy se zanořují
  rampou a obálka držáku je záměrně neořezává (`roughingStrategies.js:2929`
  přijímá jen `blocked`) → na `part-13-zleva-flange` z toho vznikla zanořovací
  kaskáda až na Ø9,8 u čela příruby: **0 → 21 kolizí, 11 100 mm²**, z toho
  5 640 mm² jediným průchodem. Hranice `blocked` je nosná.

**Poučení do dalších kroků:** *měřit vygenerovaný G-kód (`calcSim.simPath`),
ne mezivýsledky plánovače.* Emise má vlastní vrstvu pravidel proti offsetové
čáře (`offsetExitZ`, `trimLeadOutToStock`, `airSplitAxial`, `findRampOutTarget`)
a plánovač jí do toho nesmí mluvit dvakrát. Než se sáhne na kterýkoli další
bod, ověř TÍMTO způsobem, že symptom vůbec existuje.

### Krok 2 — vrchol hloubkové posloupnosti ✅ HOTOVO (20. 8. 2026)

**Co bylo špatně:** `maxStockX` (`roughingStrategies.js:1174`) se bral ze
syrových `stockWorldPoints` (u válce `sRad`) a posloupnost startovala na
`maxStockX − step`. Materiál ale může sahat až na `maxStockX + VůleX`, takže
**první průchod ukousl `ap + Vůle` místo `ap`**. Jediné místo, kde sjednocení
mění SÍLU třísky, ne jen dráhu — a emise to dorovnat neumí.

**Ověření symptomu** (probe nad `calcSim.simPath` proti plánovací smyčce,
`topXOnLoop` — sdílený helper): na **17 fixtures** vyšla tříska prvního
průchodu přesně o Vůli X větší než `ap`, tedy 20–50 % přetížení podle `ap`:

| fixture | ap | tříska syrová | tříska plánovací |
|---|---|---|---|
| `part-11`…`part-15`, `range-chain-*` | 5 | 5,000 | **6,000** |
| `part-1`, `part-2`, `part-17` | 3 | 3,000 | **4,000** |
| `part-4`, `part-6`, `part-8`, `part-9` | 2,5 | 2,500 | **3,500** |
| `holder-*`, `part-10`, `pocket-wall` | 2 | 2,000 | **3,000** |

`range-end-leadout` vyšel „ok" správně — vrch polotovaru je tam níž než `ap`.

**Řešení: SKIM VRSTVA NAD MŘÍŽKU, mřížka se NEPOSOUVÁ.**
```js
const planTopX = maxStockX + clrXPlanL;   // exaktní: Minkowski v X
for (let d = planTopX - step; d > maxStockX - step + 0.005 && d > minPartX + 0.005; d -= step) depths.push(d);
for (let d = maxStockX - step; d > minPartX + 0.005; d -= step) depths.push(d);   // beze změny
```
`planTopX` jde i do obálky zbytku v `getResidualLoops` (booleovská větev by
jinak skim vrstvu zahodila jako „nad polotovarem"). Přičtení Vůle X je tu
EXAKTNÍ, ne antivzor: offset je Minkowského součet s elipsou o poloose `clrX`
v X, takže GLOBÁLNÍ maximum v X roste přesně o `clrX` bez ohledu na tvar.

**ZAMÍTNUTO — posunout celou posloupnost** (`maxStockX += clrX`). Vypadá to
čistěji, ale je to čistá ztráta: každá hloubka padne jinam vůči schodům
a údolím. Změřeno:
- `part-8`: 24 → **19 průchodů**, zbytek +337,6 mm² (o tolik MÍŇ se odebralo),
- `part-17`: `colRaw` **0 → 2** (tvrdá kolize proti nakreslenému odlitku),
- `part-11`/`12`/`14`: `colPlan` 0 → 2,
- celkem 46 → **47** nálezů, 185,2 → 194,1 mm².

**Výsledek skim varianty (změřeno izolovaně, všech 24 fixtures):**
- tříska prvního průchodu **nikde nepřesahuje `ap`**,
- kolize `colRaw` i `colPlan` **beze změny na každé fixture** (46 / 185,2 mm²),
- odebraná plocha (syrová i plánovací) **beze změny na každé fixture** —
  ten pás bral už dřív první průchod, jen jedním hlubším záběrem,
- cena: **+1 průchod (≈ +7 řádků)** na odlitkovou fixture,
- snapshoty: mění se JEN `passCount` (+1), jeden `"long"` v `passTags`
  a přečíslování N. `machinableContour`, `interferenceGuides` i `warnings`
  jsou bitově shodné ve scan-line i booleovské větvi.
- sada **1327/1327**.

### Krok 3 — čelní generátor ✅ HOTOVO v měřitelné části (20. 8. 2026)

**Co bylo špatně:** march čelních vrstev je kotvený na hraně NAKRESLENÉHO
polotovaru (`faceStartZ` = max `stockWorldPoints.zReal`, u válce `stockFace`;
zleva `marchEndZ`). Materiál ale může sahat až na offsetovou čáru, takže první
vrstva ukousla `ap + VůleZ` — přesný protějšek kroku 2, jen v ose Z.

**Ověření symptomu** (probe nad `calcSim.simPath`): `part-16`, `part-18`,
`part-19` při `ap` 3 → tříska **3,999** (o třetinu víc). `face-casting`
i `face-cylinder` vyšly „ok" — jejich mřížka na čelo nepadne, první vrstva je
tenčí než `ap` sama od sebe.

> POZOR na sondu: filtr „radiální řezný pohyb" chytá i pohyby PODÉLNÝCH
> průchodů (zápichy, dojezdy „Rovný průměr"). Čísla jako `range-chain-steep-face`
> 194 mm nebo `pocket-wall` 32 mm jsou artefakt, ne nález. Věrohodné je jen to,
> kde `tříska syrová ≈ ap` a plánovací je o Vůli Z větší.

**Řešení: SKIM VRSTVA, mřížka se NEPOSOUVÁ** (`roughingStrategies.js:261`):
```js
const faceEdgeZ = faceLeft ? marchEndZ : faceStartZ;
const planEdgeZ = faceEdgeZ + (faceLeft ? -clrZPlanF : clrZPlanF);
```
**MEZ:** vrstvy, které by ležely až ZA nakresleným čelem (jen při Vůle Z >
Hloubka záběru), se nepřidávají — `castingOuterAtZ` tam obrys MINE a vrátil by
jmenovitý `sRad`, který u odlitku bývá úplně jinde.

**Změřeno (izolovaně, všech 24 fixtures):**
- první čelní vrstva **nikde nepřesahuje `ap`**,
- **kolize proti offsetové čáře 46 → 40, 185,2 → 104,0 mm² (−44 %)** —
  `face-casting` 2 → **0** (33,4 → 0), `face-cylinder` 3 → **0** (44,0 → 0),
  `part-19` 1 → **0**. Rychloposuvy prvních vrstev přestaly projíždět pásem,
  protože nad nimi teď leží odebraná vrstva,
- `colRaw` 0 všude, odebraná plocha (syrová i plánovací) **beze změny**,
- cena: **+1 průchod (≈ +6 řádků)** na 5 čelních fixtures, ostatní beze změny,
- snapshoty: `passCount` +1, jeden `"face"` v `passTags`, přečíslování a jedno
  hlášení (`part-19`: „40 → 41 dojezdů vynecháno"). Nic jiného.
- sada **1327/1327**.

**CO ZŮSTÁVÁ NEUDĚLANÉ** (a proč to není blokující): `castingOuterAtZ` pořád
čte syrovou siluetu pro `xSurface` (ř. 296) a pro logiku doběhu (ř. 553–888).
Přepsat ho na `planLoopFC` znamená zvednout povrch o vůli → čelní vrstvy
začínají řezat dřív a doběh je citlivý (`project_cam-face-tilted-insert-rules`,
`project_cam-face-tip-radius`). **Symptom pro to zatím není změřený** —
zbývající nálezy na `part-16` (23,5 mm²) a `part-18` (17,9 mm²) NEJSOU z čelního
generátoru, ale z DRŽÁKU nad levým čelem příruby
(`N3570 G1 X19.043 Z175.932`) — to je krok 5. Podle pravidla „nejdřív ověř,
že symptom existuje" se sem sahat nemá, dokud se nenajde díl, kde to vadí.

### Krok 4 — dynamický model ✅ HOTOVO v měřitelné části (20. 8. 2026)

**Co bylo špatně:** tělo průchodu se seká na rychloposuv(vzduch)/posuv(materiál)
(`airSplitAxial`), a ta pojistka se ptala jen SYROVÉHO dynamického zbytku.
`G0` pod offsetovou čarou je přitom na nadměrném kuse náraz.

**Řešení:** obě místa (`gcodeEmit.js` — tělo rampovaného kroku a tělo otevřeného
průchodu) se teď ptají obou modelů:
```js
const hitsStock = s.kind === 'G0'
  && (rapidHitsStock(x, cur.z, x, s.z) || rapidHitsPlan(x, cur.z, x, s.z));
```

**Změřeno (izolovaně, 24 fixtures):**
- **kolize proti offsetové čáře 40 → 23, 104,0 → 91,9 mm²**,
- nově úplně čisté: `part-1`, `part-2`, `part-4`, `part-6`, `part-8`, `part-9`,
  `holder-casting-slanted-face` (celkem 17 nálezů pryč),
- délka programu, počet průchodů ani odebraná plocha **beze změny** — mění se
  jen 32 pohybů z `G0` na `G1`,
- **cena: 29–84 mm posuvu navíc na díl** (2–13 % dráhy posuvu),
- snapshoty: JEN těch 32 řádků, žádná strukturální změna,
- sada **1327/1327**.

**`tests/cam-leadout-air-rapid` upraven** — vynechává pohyby označené
`; Přejezd materiálem posuvem`. Test modeluje nástroj jen DOSAHEM NOSU
(`x − tipR`), kdežto emise se rozhoduje celou STOPOU DESTIČKY: na
`holder-casting-slanted-face` má pohyb 44,1 mm nosového vzduchu, ale jeho stopa
škrtne 0,9 mm² plánovacího materiálu. Ne plýtvání, ale vědomé „safe-but-slow".

**ZAMÍTNUTO — `rapidHitsPlan` do zdvihové podmínky `safeRapidTo`** (ř. 921).
Vypadá jako logické doplnění, ale nezískalo NIC (findings beze změny na všech
dotčených fixtures) a `range-end-leadout` na tom ztratil úběr.

**ZAMÍTNUTO — hardening rampového splitteru.** Rampa se dělí na `G0`/`G1` podle
`planTopXAtZ`, tedy jen podle STATICKÉ siluety; stejná pojistka jako
u `airSplitAxial` by tam logicky patřila. Jenže má **nulový efekt na všech
24 fixtures** — nemám čím doložit, že funguje. Patch je triviální (ověřit každý
`G0` úsek proti `rapidHitsStock || rapidHitsPlan`, pak sloučit sousední úseky
téhož druhu); přidat AŽ s dílem, kde to vadí.

**CO ZŮSTÁVÁ NEUDĚLANÉ: samotné sloučení modelů.** `rapidStock` (syrový)
a `rapidStockPlan` (offsetový) pořád existují vedle sebe
(`gcodeEmit.js:429–477`). Sloučit je = přepsat `rapidStock` na `planLoopRef()`,
což mění EXIT-SPLIT, `descendTo` i strop zdvihu naráz a přepíše všech
24 fixtures. **Zbývajících 23 nálezů to nevyřeší** — jsou to dvojice
(rychloposuv k rampě + držák na rampě) u příruby, tedy krok 5. Sloučení je tedy
čistě úklid kódu → patří ke kroku 8, ne sem.

### Krok 5 — držák ◐ ČÁSTEČNĚ (20. 8. 2026) — dvě opravy, zbývá sweep rampy

#### HOTOVO: `stairAt` četl „povrch + Vůle X“ místo plánovacího obrysu

Čelní hlídání držáku (`holderGuardFace`) aproximovalo offsetovou čáru
SVISLÝM posunem syrového povrchu o Vůli X — týž antivzor, jaký
`offsetStockLoop` v komentáři zakazuje. Před **svislým čelem** je to řádově
vedle: offsetová čára tam leží o Vůli Z PŘED čelem v celé jeho výšce, takže
svislice těsně před přírubou protne plánovací obrys až na jejím VNĚJŠÍM
průměru.

Změřeno na `part-16`: v pásu Z 175,93–195,93 sahá plánovací obrys do Ø130,6,
ale „povrch + Vůle X“ tam vydalo Ø35,5 → vzdálený konec držáku tudy projel.
Oprava (`roughingStrategies.js:920`) čte `topXOnLoop(planLoopFC, zq)`; syrový
odhad zůstal jen jako fallback.

- **23 → 18 nálezů, 91,9 → 50,5 mm²**; `part-16` i `part-18` nově čisté.
- Cena: −1 čelní průchod na obou dílech, **44,6 mm² neodebraného materiálu**.
  ⚠ panel to hlásí („o 1 průchod víc vynecháno“) — není to tiché zahození.
- Snapshoty: `passCount` −1, jeden `face{blocked}` pryč, upravené hlášení. Nic
  jiného. Sada 1327/1327.

#### HOTOVO: `stockTopTab` přehlédla svislé čelo mezi vzorky

**Kdo tu kotvu vyrábí** (zjištěno instrumentací všech 10 míst, kde se nastavuje
`.ramp`): `entryRampAnchor` na **`roughingStrategies.js:2429`**, tedy větev
„vjezd na hranici rozsahu / regionu“ (`entryCapped`) — NE `stockEntryRamp`
a NE pocket/burst větev. Proto předchozí pokus se `stockEntryRamp` nic neudělal.

Ta kotva SE proti držáku kontroluje (`holderEntryCapZ` → `holderFitsAt`), jenže
obojí čte povrch přes `stockTopTab` — vyhledávací tabulku po `DZ_CAP` = 0,25 mm
— a ta brala nejbližší vzorek přes `Math.round`. **U svislého čela se hodnota
přichytí k té PRÁZDNÉ straně.** Změřeno na `part-15`:

| Z | syrový obrys | plánovací obrys |
|---|---|---|
| 195,0 | 16,744 | 17,744 |
| **195,28** | 16,744 | **65,0** ← plánovací čelo příruby |
| 196,0 | 16,744 | 65,318 |
| 197,0 | 64,361 | 65,361 |

Vzorek 195,25 hlásí 17,74 → kotva na Z 175,53 prošla, ačkoli vzdálený konec
držáku (20 mm axiálně) sedí v proužku Z 195,28–195,53, kde obrys sahá na
X(r) 65,0. Sonda nad `holderWorldLoop`: průnik se syrovým obrysem **0,00 mm²**,
s pásem **10,30 mm²**.

**Oprava:** `stockTopTab` bere VYŠŠÍ z obou sousedních vzorků. Zaokrouhlení
„nahoru“ nikdy nejde blíž k materiálu, takže je to bezpečná strana.

**Změřeno (izolovaně, 24 fixtures):**
- **18 → 10 nálezů, 50,5 → 9,2 mm²**,
- **úběr NEKLESL, naopak +6,0 mm² celkem**: `part-15` +10,4, `part-17` +12,1,
  `range-end-leadout` +10,5 (kotva se posune na místo, kde se držák vejde,
  a hloubka se pak vůbec nemusí zahodit). Jediný `holder-region-roughing`
  ztratil 22,9 mm² a jeden průchod — ⚠ panel to hlásí („5 → 20 úseků
  NEOBROBENO“, zato „53 → 51 hloubek se nedá obrobit“),
- `colRaw` 0 všude, čistých **20 z 24** fixtures,
- sada **1327/1327**.

#### ZBÝVÁ: 10 nálezů — z toho 8 je ŠUM MĚŘENÍ, 2 jsou skutečné

Zbylých 9,2 mm² se rozpadá podle HLOUBKY vnoření. Změřeno tak, že se nástroj
ve validátoru postupně zmenšuje (`shrink`) — nález mělčí než zmenšení zmizí:

| fixture | 0,05 mm | 0,10 mm | 0,15 mm | 0,25 mm |
|---|---|---|---|---|
| `part-15-finish-zprava` | 2 / 1,3 | 2 / 1,1 | **0** | 0 |
| `part-17-long-parting` | 2 / 1,3 | 2 / 1,1 | **0** | 0 |
| `range-end-leadout` | 2 / 1,7 | 2 / 1,4 | 2 / 1,2 | **0** |
| `holder-region-roughing` | 4 / 4,9 | 4 / 3,3 | 2 / 1,6 | **2 / 1,3** |

**8 z 10 je mělčích než 0,25 mm** → to není vada plánování, ale DRIFT MODELU
ZBYTKU: emise si vede `rapidStockPlan` po PLÁNOVANÉ geometrii průchodů
(`noteCutPass`), kdežto validátor řeže po SKUTEČNĚ VYGENEROVANÉ dráze
(`simPath`). Táž odchylka je u syrového modelu doložená a hlídaná
(`tests/cam-residual-model`, ≤ 0,035 mm). Příklad: `part-15` `N2240 G0 X19.545`
— radiální sjezd z r 69,217; `emitDescendX` se ptá obou modelů a nic nenajde,
protože jeho model má ten proužek už odříznutý.

**2 skutečné** (hlubší než 0,25 mm), obě na `holder-region-roughing`:
```
N1760 G1 X13.164 Z115.145 ; Rampa 15.0°     holder r14,99 Z122,0 = 0,6 mm²
N1780 G1 X15.164 Z117.095                    holder r13,16 Z115,1 = 0,6 mm²
```
Rampa do kapsy a odskok po ní. Je to SWEEP rampy (držák podél zátahu), ale
NE z větve `entryRampAnchor` — kandidáti jsou `pocketPass.ramp` (ř. 2818/2830)
a burst řetěz. Zjistit instrumentací, jako u kroku 5b.

**ZKOUŠENO A ZAHOZENO — `holderFitsAlong` (kontrola držáku po celém zátahu
rampy)** na větvi `entryRampAnchor`: nálezy se NEZMĚNILY (ty rampy jdou
odjinud) a úběr klesl — `part-15` −24,6 mm², `range-end-leadout` −24,0,
`part-17` −4,4. Patch je jednoduchý (vzorkovat rampu po `DZ_CAP` a volat
`holderFitsAt`); nasadit ho AŽ na tu větev, ze které ty dvě rampy opravdu jdou,
a znovu změřit úběr.

### Krok 6 — zamknout stav testem ✅ HOTOVO (20. 8. 2026)

**Provedeno:** `tests/cam-collision-free` pouští každý program **dvakrát** —
proti nakreslenému odlitku (beze změny: `shrink` 0,05, žádná fixture, žádná
kolize) a nově proti OFFSETOVÉ ČÁŘE (`planStock: true`, `shrink` 0,25).
Syrový standard se nezrušil ani neoslabil; přibyl druhý.

**Proč `shrink` 0,25 a ne 0,05:** plánovací hranice je sama konstrukce
„± vůle“ a obě strany ji diskretizují jinak — emise vede `rapidStockPlan` po
PLÁNOVANÉ geometrii průchodů (`noteCutPass`), validátor řeže po SKUTEČNĚ
vygenerované dráze (`simPath`). Naměřená tabulka hloubek je v hlavičce testu;
nad 0,25 mm zbývají jen skutečné vady. Ověřeno i to, že emise počítá správně:
u `part-15` `N2240 G0 X19.545` vyjde její mez sjezdu 18,38 = zbytek 16,579
+ R + Vůle, tedy přesně.

**Invariant má zuby** (ověřeno na stavu před opravou `stockTopTab`):
`range-end-leadout` by spadl — 2 nálezy / 1,7 mm² i při zmenšení 0,25 mm.
Není to tedy test, který jen potvrzuje sám sebe.

**`EXPECTED_PLAN` obsahuje jedinou položku:** `holder-region-roughing`
(2× 0,6 mm², držák na rampě do kapsy). Není to vada dráhy, ale **mez hlídání**:
`holderFitsAt` modeluje držák skenem povrchu po Z + profilem spodní hrany,
validátor počítá s celým polygonem — první systematicky podceňuje. Srovnat je
znamená nasadit polygonový test (Minkowski, jako `makeHolderClamp`) i na kotvu
a zátah rampy. To je samostatná práce; **čtyři pokusy doladit to prahem nebo
skenem selhaly** (viz krok 5).

### Krok 7 — náhled jedním odstínem ★ DALŠÍ

**Co:** `camSimulator.js` drží `_removal` (syrový) a `_removalOuter`
(offsetový) a kreslí pás světlejším tónem, oříznutý přes `bandClip`.
Cíl: jeden odstín.

**PAST (doložená):** `_removal.baseLoop` je zároveň parita pro mazání
VYBARVENÍ — s pásem jako základem by mazání žralo výplně nad polotovarem.
Dvojice modelů tedy zůstane, mění se jen kreslení.
**Riziko:** kosmetika, žádné dráhy. Dá se pustit kdykoli, nezávisle.

### Krok 8 — úklid API

Teprve teď má smysl `buildStockLoop` → `buildStockLoopRaw` + `stockPlanLoop()`
a zrušit ad-hoc přestavby offsetové smyčky (dnes na 5 místech: `gcodeEmit`,
`roughingStrategies` 2×, `holderGouge`, `camSimulator`). Čistý refaktor
v okamžiku, kdy si každý konzument už vědomě vybírá.

---

## Co ZŮSTÁVÁ syrové (natrvalo)

Sjednocení **neznamená** „všude offset“. Tyhle odpovídají na jinou otázku:

| co | proč |
|---|---|
| `opParts` / `machinedStockModel` (`opParts.js:116`) | co fyzicky zbylo pro další operaci |
| `MaterialRemoval.baseLoop` bez `planningOutline` | parita pro mazání vybarvení v náhledu |
| `castingOuterOrNull` v zóně doběhu | „svislice MINE obrys“ ≠ „materiál je nula“ |
| `buildStockLoopRaw` | kreslení nakresleného obrysu |

Nulový Přídavek X i Z = obě čáry splývají (`stockClearanceIsZero`) → celý
plán je v tom případě no-op.

---

## Pravidla měření (nepřeskakovat)

- **Měřit VYGENEROVANÝ G-KÓD (`calcSim.simPath`), ne mezivýsledky plánovače.**
  `calc.passes[].zEnd` je VSTUP do emise, ne výsledek — emise hranici ještě
  překládá na offsetovou čáru. Krok 1 vznikl z měření `pass.zEnd` a celý
  padl; probe nad `simPath` ho vyvrátil za jeden běh.
- **Měřit IZOLOVANĚ, jedna fixture = jeden proces.** `sweep.mjs` má kontaminaci
  singletonu `S` (`part-1` tam vyšlo 318 vs 233 izolovaně). Slouží jen k detekci
  „která fixture se hnula“.
- **Baseline ve worktree**, ne `git checkout --` — uživatel commituje průběžně
  (`feedback_measure-baseline-in-worktree`).
- **Kvantizace:** každé číslo, které z offsetové smyčky jde do emise, musí projít
  `quantizeUp` na 0,01 mm, jinak padne `cam-backside-mirror` (Clipper dá témuž
  místu zleva a zprava o ~1 µm jinou hodnotu).
- **Bezpečnostní minimum po každém kroku:** `tests/collision-validator`,
  `tests/material-removal`, `tests/cam-traversal-invariants`,
  `tests/cam-collision-free`. Celá sada až na závěr kroku.
- **Testy procházet JEDEN PO DRUHÉM s měřením**, ne hromadné `vitest -u`.
  Sada je deterministická; padající test nejdřív ověřit přes worktree —
  může měřit zastaralý MODEL, ne regresi (`feedback_head-may-be-red`).
- **Žádný debug kód v pracovní kopii** — repo se commituje samo
  (`feedback_no-debug-code-in-worktree`).
