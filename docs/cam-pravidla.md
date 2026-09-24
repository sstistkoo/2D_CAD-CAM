# Pravidla generování hrubovacích drah

> Jediný platný soubor pravidel (od 23. 9. 2026). Každé pravidlo je jedna
> jednoznačná podmínka, kterou jde automaticky ověřit na hotovém programu.
> Program je správně, právě když splní všechna pravidla. Pravidla platí
> stejně pro každou destičku, stranu i operaci — destička je jen tvar
> břitu, obrábění zleva je zrcadlo zprava.
>
> Pravidla schvaluje uživatel. Nové pravidlo se sem zapíše až po jeho
> souhlasu. Starý dokument `cam-pravidla-drah.md` je historie (proč co
> vzniklo), ne pravidla.

---

## Pravidlo 1 — Úseky

**Díl se rozdělí na úseky. Úsek končí tam, kde čára zanoření vyjede
z materiálu.**

- *Čára zanoření* vede od kontury šikmo nahoru pod úhlem zanoření
  (nastavení „Úhel zanoření").
- Hranice úseku leží na **patě** té čáry — tam, kde čára začíná na kontuře.
- Čára, která z materiálu **nevyjede** (skončí zase na kontuře uvnitř
  polotovaru), díl **nedělí**.
- *Materiál* = nakreslený polotovar.
- Platí vždy, bez výjimky („podmínka jedna a maximální platnost").
- Hranice úseku **nikdy** neleží uprostřed údolí ani uprostřed hrbu — jiné
  dělení než podle čar zanoření neexistuje.

Příklad (díl uživatele z 23. 9. 2026, kulatá R10): tři úseky s hranicemi
v Z ≈ 195 (u S6) a Z ≈ 100 (u S15/S16).

## Pravidlo 2 — Držák se musí vejít vždy

**Nástroj smí být jen tam, kde se vejde držák.**

- *Obrys držáku* = nakreslený obrys držáku + „Virt. zvětšení držáku"
  (jen na straně obrábění, nebo dokola — podle přepínače vedle).
- V pásu od hrotu po okraj obrysu držáku **na straně obrábění** (při
  obrábění zprava pravý okraj, zleva levý) nesmí nic sahat výš než spodek
  držáku, resp. obrys destičky — **ani díl, ani materiál, který v tu chvíli
  ještě stojí**.
- Kontroluje se **každá poloha nástroje**: nájezd, řez i dojezd.
- Kde se držák nevejde, dráha skončí (nebo začne) dřív o tolik, aby se
  vešel, a zbytek materiálu se nahlásí (kde a kolik).

## Kde to je v kódu

| Pravidlo | Kód |
|---|---|
| 1 — úseky | `ops/long/regions.js` (`guideSplits`) — jediný zdroj hranic |
| 2 — držák | `ops/long/holderGuard.js` — **jediná** kontrola; ptá se jí vjezd, rampa, řez, kapsa i dojezd |

Do 23. 9. 2026 bylo v podélném hrubování 12 kontrol držáku nad třemi modely
materiálu a se třemi tolerancemi (0,5 / 2,0 mm² a statická obálka).
Nahrazeno jednou: obrys držáku (`holderWorldLoop`, i se „Virt. zvětšením")
proti materiálu, který v tu chvíli stojí (`ResidualTracker` nad
`passes`), tolerance 0,5 mm² — stejně jako validátor. Vypínač
„Hlídat geometrii" ji vypne jako dřív. Emise G-kódu hlídá tentýž obrys
proti svému živému zbytku (`holderHitsRapid` v `gcodeEmit.js`).

---

## Otevřené (zatím neschváleno)

- Pořadí úseků: uživatel chce, aby největší průměr šel první. Navrženo:
  nejdřív vrstvy nad vrchem všech ostatních úseků, pak úseky zprava doleva,
  každý celý — čeká na potvrzení.
- Co se děje uvnitř úseku (vrstvy, vjezdy, schody, přejezdy).
