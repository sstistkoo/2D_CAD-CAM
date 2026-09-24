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
- **Upichovák:** čáry zanoření nemá, bere se **svislá čára** z paty strmé
  stěny. Pozvolné (kruhové) údolí stěnu nemá a díl nedělí. Nad vrcholem
  stěny hranice neplatí a vrstva jde vcelku.

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

## Pravidlo 4 — Začátek a konec vrstvy — NÁVRH

**Vrstva začíná a končí jen tam, kde začíná nebo končí její materiál
(u stěny, na hraně polotovaru, na hranici úseku). Nikdy uprostřed hrbu ani
uprostřed rovné plochy.**

## Pravidlo 5 — Posuv jen v materiálu — NÁVRH

**Posuvem (G1) se jede jen tam, kde se řeže. Přes vzduch a přes už
obrobené místo se jede rychloposuvem nad materiálem.**

## Pravidlo 6 — Zanoření — NÁVRH

**Kolmo (radiálně) do materiálu smí jen upichovák. Ostatní destičky
vjíždějí rampou pod úhlem zanoření, nejvýš o jednu vrstvu (ap).**

## Pravidlo 7 — Konec dílu — NÁVRH

**Konec dílu se obrobí celý: každá vrstva dojede až na konec polotovaru
nebo ke stěně dílu. Na konci nesmí zůstat víc než přídavek.**

## Pravidlo 8 — Pořadí úseků — NÁVRH

**Největší průměr se obrábí první.** (Nevyjasněno: co když se pak držák
nevejde k sousednímu, ještě neobrobenému úseku.)
