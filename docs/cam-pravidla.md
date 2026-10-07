# Pravidla generování hrubovacích drah

> **Jediný platný zdroj pravidel.** Každé pravidlo je jedna jednoznačná
> podmínka, kterou jde automaticky ověřit na hotovém programu. Program je
> správně, právě když splní všechna schválená pravidla. Platí stejně pro
> každou destičku; obrábění zleva je zrcadlo zprava.
>
> Pravidla schvaluje uživatel. Neschválené je označené **NÁVRH**.

---

## Pravidlo 1 — Úseky ✅ schváleno

**Díl se rozdělí na úseky. Úsek končí tam, kde čára zanoření vyjede
z materiálu.**

- Čára zanoření vede od kontury šikmo nahoru pod úhlem zanoření.
- Hranice úseku leží na **patě** té čáry (kde začíná na kontuře).
- Čára, která z materiálu nevyjede, díl nedělí.
- Materiál = nakreslený polotovar.
- Jiné dělení neexistuje — **nikdy** uprostřed údolí ani uprostřed hrbu.
- **Upichovák podélně nehrubuje** (rozhodnutí uživatele 25. 9. 2026) —
  hrubuje se jím jen čelně, tvar objede dokončení. Úseky proto nemá.

## Pravidlo 2 — Držák se musí vejít ✅ schváleno

**Nástroj smí být jen tam, kde se vejde držák.**

- Obrys držáku = nakreslený obrys + „Virt. zvětšení držáku" (na straně
  obrábění, nebo dokola podle přepínače).
- V pásu od hrotu po okraj držáku na straně obrábění nesmí nic sahat výš
  než spodek držáku — ani díl, ani materiál, který v tu chvíli stojí.
- Kontroluje se každá poloha: nájezd, řez, dojezd.
- Kde se držák nevejde, dráha začne/skončí dřív a zbytek se nahlásí.

## Pravidlo 3 — Hloubka záběru (ap) ✅ schváleno

**Každá vrstva má přesně ap, jak je zadané. Jediná vrstva, která smí být
tenčí, je ta poslední — a ta se udělá vždy.**

- Na dně ani na schodu nesmí zůstat víc než přídavek.
- Tenčí vrstva mezi dvěma plnými je chyba.
- Rampa ani vjezd nesmí vzít víc než jednu vrstvu naráz.

---

## Pravidlo 4 — Začátek a konec vrstvy ✅ schváleno

**Vrstva začíná a končí jen tam, kde začíná nebo končí její materiál
(u stěny, na hraně polotovaru, na hranici úseku). Nikdy uprostřed hrbu ani
uprostřed rovné plochy.**

## Pravidlo 5 — Posuv jen v materiálu ✅ schváleno

**Posuvem (G1) se jede jen tam, kde se řeže. Přes vzduch a přes už
obrobené místo se jede rychloposuvem nad materiálem.**

## Pravidlo 6 — Zanoření do plného materiálu ✅ schváleno

**Do plného materiálu se zanořuje pod úhlem z nastavení „Úhel zanoření".
Kolmo jen tehdy, když je v nastavení kolmo (90°).**

- **Polygon: plátek nesmí řezat dvěma stranami najednou.** Řeže jen přední
  (hlavní) hrana a špička. Žádný posuv k ose — rampa, zanoření ani sjíždění
  po kontuře dolů — nesmí být strmější než spodní (vedlejší) hrana plátku,
  jinak by řezala i ona. Platí při zanořování i při podélném hrubování, ať
  je v nastavení cokoli. Materiál, kam by musela sáhnout spodní hrana,
  zůstane stát a nahlásí se.
- **Kulatá:** přednastaveno 45°; smí i kolmo, pokud je tak nastaveno.
- **Upichovák:** kolmo (to je jeho normální zanoření).
- Rampa nikdy nevezme víc než jednu vrstvu (ap) — viz pravidlo 3.

## Pravidlo 7 — Vrstva jede až na konec, pravá strana nejdřív ✅ schváleno

**Každá vrstva jede až na konec, dokud nenarazí na hotovní konturu. Když
kontura vystoupí (hrb), vrstva kopíruje její tvar a pokračuje dál až na
konec. Pak se vrátí na začátek a jede další vrstva.**

- Nejdřív se dodělá **celá pravá strana** (před hrbem) vrstvu po vrstvě až
  dolů.
- Teprve když je pravá strana hotová, přejede se přes hrb a dodělá se
  zbytek na druhé straně, zase po vrstvách až dolů.
- Přes hrb se nepřejíždí, dokud pravá strana není hotová.

Příklad (díl uživatele 24. 9. 2026, `projekt_2026-09-24 (3).camprog`,
polygon): vrstva, která jede až na konec a kopíruje hrb:

```
N360 G1 Z236.412 F0.25
N370 G1 X51.481 Z236.161 F0.25
N380 G1 X51.481 Z220.925 F0.25
N390 G1 X51.477 Z220.912 F0.25
N400 G1 X50.545 Z217.432 F0.25
N410 G1 X50.545 Z195.278 F0.25
N420 G1 X52.545 Z197.278
```

Pak pravá strana po vrstvách (N450 Z237.082, N560 Z237.751, N690 Z238.421 …)
až úplně dolů, a teprve potom za hrbem (N510 G1 Z195.278 a dál dolů).

### Upřesnění uživatele 29. 9. 2026 — jeden postup, který se opakuje

Pravidlo platí pořád dokola, stejnou logikou, pro celý úsek:

1. Vrstvy jdou shora dolů po ap. Každá jede přes celou oblast až na konec.
2. **První** vrstva, která při jízdě narazí na hotovní konturu (hrb, čelo
   dílu), konturu kopíruje a jede dál **až na konec** oblasti.
3. Pak se vrátí a dodělá se **všechno před tím dotekem** (ze strany, odkud
   se jede — zleva levá, zprava pravá) vrstvu po vrstvě **až dolů**.
4. Pak se přejede za dotek a pokračuje se **stejnou logikou**: vrstvy dolů,
   dokud další vrstva nenarazí na hotovní konturu → ta jede až na konec →
   dodělá se to před ní až dolů → přejede se dál …
5. Vrstva za hrbem začíná tam, kde začíná její materiál — u stěny, kde
   vrstva nad ní ze stěny sjela, a dál jde po stěně dolů (pravidla 4 a 6).

Příklad (díl uživatele 29. 9. 2026, `projekt_2026-09-29 (6).camprog`,
kulatá R 10, zleva, úsek 1):
- vrstva X 39,118 narazí na čelo dílu (bod 27, X 30,566 Z 0) → vyjede po čele,
  jede po plošině, sjede do vybrání a pokračuje až na konec,
- pak se dodělá levá strana před čelem (odlitek Z −8…0) po vrstvách až dolů,
- vrstva X 36,618 narazí na hrb (bod 23, X 27,056 Z 55,47) → kopíruje ho a jede
  až na konec (`N920 G1 Z50.002` … `N1300 G1 Z106.017` jedním průchodem),
- pak se dobere kruhové vybrání až na dno (`N1200 G3 X29.727 Z35.100`),
- pak se přejede za hrb a údolí se dělá po vrstvách od stěny (X 36,618
  Z 72,614, kde vrstva nad ním sjela) až dolů.

Doplněno uživatelem 29. 9. 2026 večer (díly `projekt_2026-09-29 (7)–(9)`):

6. **Plošina na vrcholu hrbu**, přes který vrstva přejede, se nejede zvlášť
   — vrstva, která hrb kopíruje, ji obrobí. (Dřív se napřed jela plošina
   za kruhovým vybráním a teprve pak vrstva od začátku.)
7. **Na mezi úseku** vrstva, jejíž krátké tělo za nájezdem nic neubere,
   končí na konci nájezdu — žádný přejezd k mezi a šikmý návrat zpět
   („taneček" u meze úseku 1).

## Pravidlo 8 — Pořadí úseků ✅ schváleno

**Úseky se obrábějí po řadě od strany, odkud se obrábí — Ú1, Ú2, Ú3, … —
každý celý najednou (po vrstvách ap až dolů), pak další.**

- Změněno uživatelem 25. 9. 2026 (dřív: začínalo se u největšího průměru
  a úsek se přerušoval na výšce sousedního — vznikalo víc částí než úseků,
  „mám 4 úseky, mají být 4 části").
- Číslování úseků: od strany, odkud se obrábí (zprava: Ú1 vpravo; zleva:
  Ú1 vlevo).

- Platí jen mezi úseky, které odděluje čára zanoření vyjíždějící
  z materiálu (pravidlo 1). Kde čára vyjíždí až na konci (údolí, ze kterého
  čára nevyjede uprostřed), se bere vcelku jako teď — dělit tam by rozbilo
  hlídání ap.

---

## Pravidlo 9 — Materiál je skutečný polotovar ✅ schváleno

**Kde vrstva začíná, kde končí a jestli je před ní vzduch, rozhoduje
skutečný (nakreslený) polotovar, ne plánovací obrys s vůlí.**

- Plánovací obrys (polotovar + vůle, tečkovaná čára) určuje jen, kde
  končí rychloposuv a odkud se jede posuvem.
- Kus vrstvy je materiál, jen když z polotovaru opravdu něco ubere.
  Pouhý dotek nosu (vůle, strmá stěna zbytku po sousedním úseku) nestačí.
- Vrstva, která celkově nic neubere, se nevydá — ani krátký kus, ani
  vrstva, která jen setře setiny po vrstvě na schodu.
- Schváleno uživatelem 29. 9. 2026 (díly `projekt_2026-09-29 (7)–(9)`:
  vrstvy začínaly ve vůli zbytku po úseku 1, zanořovaly se do vzduchu
  a pak přejížděly celé údolí rychloposuvem).

## Pravidlo 10 — Vjezd do vrstvy ✅ schváleno

**Do vrstvy se vjíždí jedním postupem, v tomto pořadí — první možnost,
která projde, platí:**

1. **Po stěně** od mělčí vrstvy — sjezd nejvýš pod úhlem zanoření
   (pravidlo 6), sloupec nad začátkem sjezdu už vybraný.
2. **Ze vzduchu vodorovně** — pod nosem ani těsně před začátkem není
   polotovar.
3. **Rampou** pod úhlem zanoření, co nejblíž začátku vrstvy — tam, kde je
   nad začátkem rampy už vybráno (nebo tam polotovar nikdy nebyl) a kam
   se dá dojet rychloposuvem. Na rampu mělčí vrstvy navazuje další rampa
   po téže přímce (řetěz), jen když mělčí vrstva sama vjela rampou.

- Každý vjezd musí projít držákem (pravidlo 2); kde se nevejde nic,
  vrstva se vynechá a nahlásí.
- **Vjezd, který nic neubere, se nepočítá:** když vjezd a cesta až k dalšímu
  materiálu vrstvy nic neuberou, vrstva začne až u dalšího materiálu
  (dřív: rampa u hrbu do vzduchu a přejezd údolím, `G0 Z154.272`).

## Pravidlo 11 — Nic za hranicí úseku ✅ schváleno

**Nástroj se vjezdem nedotkne materiálu za začátkem úseku nebo rozsahu
(hotový sousední úsek, polotovar za hranicí rozsahu).**

- Nos ani zadní půlkou nesmí sáhnout do stěny, kterou nechal sousední
  úsek. Kde by se dotkl, vjíždí se až tam, kde je celý mimo.
- Klín, který tím u hranice zůstane, je klín pod mezní čarou
  (pravidlo 6) — nahlásí se.

## Pravidlo 12 — Strop X max ✅ schváleno

**Nad X max se neobrábí a materiálu, který nad X max stojí, se nástroj
nedotkne — ani podjetím pod něj.**

- Schválil uživatel 30. 9. 2026: *„když je X max, tak u podélného nebo
  čelního nebo jakéhokoliv obrábění určuje výšku, kde nad tu čáru už
  netvoří dráhy"* a na dílu `projekt_2026-09-30` ukázal, že dráhy mají
  zůstat jen tam, kde polotovar pod čarou leží.
- Obrábí se od volného konce (strana, ze které se hrubuje) po první místo,
  kde polotovar vyleze nad X max — **stěna**. Za stěnou se neobrábí nic,
  ani materiál pod X max (podélně by se pod stěnu podjelo, čelně by se jí
  projelo shora). Stěna je hranice rozsahu Z a platí pro ni pravidlo 11.
- Stěna se nahlásí i se svým Z. Polotovar nad X max už na volném konci →
  nevznikne žádná dráha a nahlásí se to.
- Platí pro podélné, čelní, zleva i dokončování. Materiál nad X max o méně
  než 0,05 mm se nepočítá (`XMAX_WALL_TOL`, cam/rangeX.js).
- Test: `tests/cam-xrange.test.js`.

## Pravidlo 13 — Vnitřní obrábění (vyvrtávání) ✅ schváleno

**Vnitřní obrábění je zrcadlo vnějšího v ose X. Platí pravidla 1–12 beze
změny, jen „nahoru" znamená „k ose" a polotovar je předvrtaná díra.
Navíc se tyč musí vejít do díry: ani zadní strana tyče se nedotkne
protější stěny díry. Kde se nevejde, dráha se nevydá a nahlásí se.**

- Schválil uživatel 7. 10. 2026 (operace Vyvrtávání, první verze jen
  podélné hrubování v díře).
- Výpočet: díra se překlopí kolem poloměru R_ref (r' = R_ref − r), spočítá
  se obyčejné vnější hrubování zprava a hotové řádky se překlopí zpátky
  (X, G2↔G3) — `cam/ops/bore.js`, stejně jako „zleva" = zrcadlo v Z.
- Polotovar díry = předvrtání (⌀ a hloubka z operace Vrtání, nebo zadané).

## Pravidlo 14 — Řetěz zanoření jede bez odjezdu až dolů ✅ schváleno

**Když vrstva za rampou nic neubere, nástroj neodjíždí a nevrací se:
další rampa navazuje přímo na konec předchozí, po téže přímce zanoření.
Řetěz pokračuje pod úhlem zanoření až dolů a vezme i zbytek polotovaru,
který po zanořování zůstal — nekončí svisle nad ním.**

- Každý krok řetězu bere nejvýš jednu vrstvu (pravidlo 3). Co leží pod
  mezní čarou hotové kontury, zůstává (pravidlo 6) — dobírá se jen zbytek
  po zanořování na polotovaru, ne kus hotové kontury.
- Zadal a schválil uživatel 7. 10. 2026 (`projekt_2026-10-07 (3)`, kulatá R 10):
  úsek 3 `N3110 G1 X33.666 Z-11.749` (rampa) → `N3120 G0 Z-18.996` →
  `N3130 G1 X35.666 Z-16.996` (odskok) → zpět `N3160 G1 X33.666` a další
  rampa; má to být jeden souvislý sjezd. Úsek 1 u bodů 5–8: řetěz skončil
  svisle nad zbytkem, který měl vzít.
- Hotovo: vrstva, jejíž tělo za rampou ze skutečného polotovaru nic
  neubere, končí na konci rampy (`ops/long/rule7Layers.js`) a další rampa
  navazuje bez odskoku. Test: `tests/cam-plunge-chain-continuous.test.js`.

## Pravidlo 15 — Dokončování nesjíždí strměji než úhel zanoření ✅ schváleno

**Hotovní dráha nikde nesjíždí k ose strměji než „Úhel zanoření".
Dokončí se celý kus kontury před místem, kde kontura začne klesat
strměji; odtud se jede rovně (rovný průměr) na téže výšce, dokud před
nožem stojí materiál, aby na průměru nezůstal schodek. Teprve pak odjezd.**

- Kus kontury strmější než úhel zanoření se nedokončuje (platí „celý,
  nebo vůbec") a nahlásí se; v náhledu se tam hotovní dráha (tečkovaná)
  nekreslí — zůstávají jen dráhy podél mezní čáry zanoření.
- Rovný průměr na konci jede, dokud z materiálu nevyjede — u nože nesmí
  zůstat kousek polotovaru. Odjezd pak vede vzduchem.
- Zadal a schválil uživatel 7. 10. 2026 (`projekt_2026-10-07 (3)`, úhel zanoření 45°):
  úsek 2 `N2360 G3 X36.836 Z106.625 CR=20.000` sjíždí po oblouku strměji
  než 45° — má skončit u S13 a pokračovat rovně; úsek 3 `N3320 G1 X40.566
  Z-1.500 ; Rovný průměr` má dojet v rovině až za polotovar (Z −4,89).
- Implementace: `cam/ops/finishSteep.js` (dělení úseku), rovný průměr
  `finRunOut` v `cam/ops/finishEmit.js`. Test: `tests/cam-finish-plunge-limit.test.js`.
