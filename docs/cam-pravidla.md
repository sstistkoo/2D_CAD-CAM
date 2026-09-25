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
