import { makeOverlay } from '../dialogFactory.js';

// ── Sekce nápovědy ─────────────────────────────────────────────
const sections = [
  {
    title: '📘 G kódy',
    desc: 'Kompletní referenční příručka G kódů pro Sinumerik 840D soustruh.',
    items: [
      {
        name: 'Co obsahuje',
        desc: `Přehled všech G kódů rozdělených do 14 kategorií: Programování, Základní pohyby, Přesné najetí, Korekce nástroje, Nulové body, Cykly, Transformace a další.
Každý G kód je uveden se syntaxí, popisem a praktickým příkladem použití.`
      },
      {
        name: 'Hlavní skupiny',
        desc: `• <b>Základní pohyby</b> — G0 (rychloposuv), G1 (lineární interpolace), G2/G3 (kruhová interpolace), CIP, G4 (pauza), G9, G14–G15
• <b>Programování</b> — G90/G91 (absolutní/přírůstkové), G94–G97 (posuvy a otáčky)
• <b>Korekce nástroje</b> — G40–G47 (korekce rádiusu a délky)
• <b>Nulové body</b> — G53–G57, G500, G505, G507, G54.1
• <b>Cykly</b> — G81–G89 (vrtací cykly)
• <b>Transformace</b> — G51, G68–G69 (měřítko, zrcadlení)`
      },
      {
        name: 'Ovládání',
        desc: `Okno obsahuje <b>vyhledávací pole</b> pro rychlé filtrování — stačí zadat číslo kódu (např. „G2") nebo klíčové slovo (např. „kruh").
Kódy jsou seskupeny do záložek podle kategorií.`
      }
    ]
  },
  {
    title: '📕 M kódy',
    desc: 'Referenční příručka M kódů (strojních funkcí) pro Sinumerik 840D.',
    items: [
      {
        name: 'Co obsahuje',
        desc: `Přehled M kódů pro řízení stroje rozdělený do 13 kategorií: Nejčastější, Řízení programu, Vřeteno, Upínání, Chlazení, Nástroje, Měření, Hydraulika a další.
Každý M kód má popis funkce a příklad praktického použití.`
      },
      {
        name: 'Hlavní skupiny',
        desc: `• <b>⭐ Nejčastější</b> — M0 (stop), M1 (podmíněný stop), M3/M4/M5 (vřeteno), M8/M9 (chlazení), M30 (konec)
• <b>Řízení programu</b> — M0, M1, M2, M17, M30–M32, M96–M99
• <b>Vřeteno</b> — M3–M5, M10–M11, M19, M39–M43, M48–M49
• <b>Upínání</b> — M25–M26, M50–M53
• <b>Chlazení a ofuk</b> — M7–M9, M13–M14, M60–M61, M65–M66, M71–M72
• <b>Nástroje</b> — M6, M80–M81, M230, M240, M245, M250`
      },
      {
        name: 'Ovládání',
        desc: `Vyhledávací pole filtruje M kódy podle čísla nebo popisu. Kódy jsou řazeny dle kategorií s barevným zvýrazněním názvů.`
      }
    ]
  },
  {
    title: '📗 Příkazy',
    desc: 'Syntaxe a příkazy programovacího jazyka Sinumerik 840D.',
    items: [
      {
        name: 'Co obsahuje',
        desc: `Kompletní přehled příkazů a syntaxe Sinumerik 840D rozdělený do 12 kategorií: Pohybové příkazy, Polární souřadnice, Kruhová interpolace, Transformace, Tvarové prvky, Programové řízení, Logika, Datové typy a další.
Každý příkaz zahrnuje syntaxi, popis a příklady s komentáři.`
      },
      {
        name: 'Hlavní skupiny',
        desc: `• <b>Pohybové příkazy</b> — AC, ACN, ACP, IC, DC (absolutní/přírůstkové pozicování)
• <b>Polární souřadnice</b> — AP (úhel), RP (rádius), AR (otevírací úhel)
• <b>Kruhová interpolace</b> — CIP, CR, I1, J1, K1 (středové body)
• <b>Transformace</b> — TRANS, ROT, MIRROR, SCALE, ATRANS, AROT
• <b>Tvarové prvky</b> — CHF (zkosení), RND/RNDM (zaoblení), CONTPRON
• <b>Programové řízení</b> — IF/ELSE, FOR/WHILE, LOOP, CASE, GOTO/GOTOF/GOTOB
• <b>Datové typy</b> — DEF AXIS, BOOL, INT, REAL, STRING`
      },
      {
        name: 'Ovládání',
        desc: `Vyhledávací pole filtruje příkazy podle názvu nebo popisu. Příkazy jsou seskupeny do přehledných kategorií s příklady kódu.`
      }
    ]
  },
  {
    title: '📙 Proměnné',
    desc: 'Systémové proměnné ($P_, $A_, $AA_) pro Sinumerik 840D.',
    items: [
      {
        name: 'Co obsahuje',
        desc: `Přehled systémových proměnných Sinumerik 840D rozdělený do 8 kategorií: Geometrické osy, Frame proměnné, Systémové informace, Nástrojové proměnné, Vřeteno a osy, Měrový systém, PLC komunikace.
U každé proměnné je uvedena syntaxe, datový typ, popis a příklad použití v CNC kódu.`
      },
      {
        name: 'Hlavní skupiny',
        desc: `• <b>Geometrické osy</b> — $P_AXN1–$P_AXN3 (aktuální pozice)
• <b>Frame proměnné</b> — $P_IFRAME, $P_PFRAME, $P_BFRAME, $P_ACTFRAME, $P_UIFR[]
• <b>Systémové informace</b> — $P_F (aktuální posuv), $P_DRYRUN, $P_SEARCH
• <b>Nástrojové</b> — $P_TOOLR (rádius nástroje), $P_TOOLNO (číslo nástroje)
• <b>Vřeteno a osy</b> — $AC_MSNUM, $AA_S (otáčky)
• <b>PLC komunikace</b> — $A_IN[], $A_OUT[], $A_INA[], $AA_IW[X] (PLC signály)`
      },
      {
        name: 'Ovládání',
        desc: `Vyhledávací pole filtruje proměnné podle názvu (např. „$P_TOOL") nebo popisu. Proměnné jsou řazeny do logických skupin s příklady podmíněného použití.`
      }
    ]
  },
  {
    title: '⌨️ Zkratky',
    desc: 'Klávesové zkratky a tlačítka displeje Sinumerik 840D.',
    items: [
      {
        name: 'Co obsahuje',
        desc: `Přehled klávesových zkratek a ovládacích tlačítek pro Sinumerik 840D displej, rozdělený do 11 kategorií: Rozšířené zkratky, Zkratky displeje, Tlačítka na displeji, Pohyb v režimech, Ovládání programu, Editor programu, Nástrojové funkce, Simulace, Diagnostika, Rychlé funkce, Ruční ovládání.`
      },
      {
        name: 'Hlavní skupiny',
        desc: `• <b>Rozšířené klávesové zkratky</b> — CTRL+Z, CTRL+G, CTRL+M a další kombinace
• <b>Zkratky displeje</b> — ALT+M, CTRL+P, ALT+B a specifické kombinace pro Sinumerik
• <b>Tlačítka na displeji</b> — SELECT, MENU FORWARD/BACK, CHANNEL, AREA SWITCH, kurzorové šipky
• <b>Režimy</b> — JOG, MDA, AUTO — ovládání v jednotlivých režimech stroje
• <b>Ovládání programu</b> — spuštění, zastavení, krokování, reset
• <b>Editor programu</b> — INSERT, INPUT, ALTER — vkládání a úprava hodnot
• <b>Nástrojové funkce</b> — OFFSET, T/S/M, WO (nulové body)
• <b>Simulace</b> — SIM, ALTER+SIM — spuštění a nastavení simulace
• <b>Diagnostika</b> — ALARM, HELP — alarmy a kontextová nápověda
• <b>Rychlé funkce</b> — PAGE UP/DOWN, RECALL — listování a poslední hodnota
• <b>Ruční ovládání</b> — JOG, INC, REF — ruční režim, krokování, reference`
      },
      {
        name: 'Ovládání',
        desc: `Vyhledávací pole filtruje zkratky podle klávesové kombinace nebo popisu funkce.`
      }
    ]
  },
  {
    title: '📝 Ukázky',
    desc: 'Praktické ukázky CNC kódu s komentáři pro Sinumerik 840D.',
    items: [
      {
        name: 'Co obsahuje',
        desc: `Sbírka 7+ kompletních příkladů CNC programů pro soustruh s podrobným komentářem u každého řádku.
Příklady pokrývají základní i pokročilé techniky programování.`
      },
      {
        name: 'Příklady',
        desc: `• <b>Podložky</b> — jednoduchý díl, základní struktura programu
• <b>Základní vnější soustružení</b> — kompletní program s nástrojem, posuvem, otáčkami
• <b>GOTO</b> — nepodmíněný skok na návěstí
• <b>GOTOB</b> — skok zpět s počítadlem (cyklus s R-parametrem)
• <b>FOR cyklus</b> — opakování s transformací souřadnic
• <b>GOTOF</b> — skok vpřed s podmínkou
• <b>WHILE cyklus</b> — smyčka s výpisem parametrů přes MSG
• <b>Příklady MSG</b> — zobrazení zpráv na displeji stroje`
      },
      {
        name: 'Ovládání',
        desc: `Každý příklad obsahuje kompletní kód s řádkovými komentáři. Kódy lze zkopírovat a použít jako výchozí šablonu pro vlastní programy.`
      }
    ]
  },
  {
    title: '✏️ Editor',
    desc: 'CNC editor se zvýrazňováním syntaxe, validací a správou souborů.',
    items: [
      {
        name: 'Zvýrazňování syntaxe',
        desc: `Editor automaticky barevně zvýrazňuje CNC kód v reálném čase:
• <b class="hl-g">G kódy</b> (G0, G1, G2, G3…) — modře, tučně
• <b class="hl-m">M kódy</b> (M3, M4, M30…) — růžově, tučně
• <b class="hl-coord">Souřadnice</b> (X, Z, I, K, C, R) — zeleně
• <b class="hl-val">Hodnoty</b> (F, S, T, D + číslo) — žlutě
• <b class="hl-feed">Posuvy</b> — tyrkysově, tučně
• <b class="hl-param">R-parametry</b> (R0, R1…) — fialově
• <b class="hl-comment">Komentáře</b> (za středníkem ;) — šedě, kurzívou
• <b class="hl-msg">MSG("…")</b> — oranžově
• <b class="hl-logic">Logika</b> (GOTOF, GOTOB, IF, ELSE, ENDIF, STOPRE) — červeně
• <b class="hl-sub">Podprogramy</b> (L1, L2…) — levandulově
• <b class="hl-block">N-bloky</b> (N10, N20…) — šedě, menší písmo
• <span style="text-decoration:underline wavy var(--ctp-red)">Chyby</span> — červené vlnkové podtržení`
      },
      {
        name: 'Správa souborů',
        desc: `<b>☰ Postranní panel</b> — otevře/zavře seznam souborů a R-parametrů.
• <b>＋ Nový program</b> — vytvoří nový soubor PROG_x.MPF s výchozí šablonou (G54, G90, G95, G97, STOPRE, M30).
• <b>Přejmenování</b> — klikněte na název souboru v toolbaru. Pokud nezadáte příponu, automaticky se doplní .MPF nebo .SPF.
• <b>Smazání</b> — ikona ✕ u souboru v postranním panelu (potvrzení před smazáním).
• Soubory se automaticky ukládají do prohlížeče (localStorage) každé 2 sekundy po úpravě.`
      },
      {
        name: 'Import a export balíčku',
        desc: `<b>📂 Import</b> — načte textový soubor s jedním nebo více programy. Rozpoznává formát s oddělovači (===) a hlavičkami HLAVNÍ PROGRAM / PODPROGRAM.
<b>📦 Export</b> — exportuje všechny otevřené soubory do jednoho .txt balíčku s oddělovači.
<b>⬇ Stáhnout</b> — stáhne aktuální soubor jednotlivě pod jeho názvem.`
      },
      {
        name: 'Kopírování do schránky',
        desc: `<b>📋 Kopírovat</b> (toolbar i quickbar) — zkopíruje celý obsah aktuálního editoru do schránky. Na mobilu dostupné přes menu ⋮ nebo tlačítko 📋 na spodní klávesnici.`
      },
      {
        name: 'Přečíslování N-bloků',
        desc: `<b>🔢 Přečíslovat</b> — otevře dialog s nastavením:
• <b>Start</b> — počáteční číslo bloku (výchozí 10)
• <b>Krok</b> — přírůstek mezi bloky (výchozí 10)
Výsledek: N10, N20, N30… Prázdné řádky a komentáře se přeskakují.
Řádky bez N-bloku dostanou nový, existující bloky se přečíslují.
<b>↩ Vrátit přečíslování</b> — okamžitý návrat k původnímu kódu (jedno undo).`
      },
      {
        name: 'Tlačítko N+ (quickbar)',
        desc: `Přidá číslo bloku na začátek aktuálního řádku (kde je kurzor).
Automaticky najde nejvyšší existující N-číslo v programu a přidá krok (dle nastavení v přečíslování).
Příklad: pokud program obsahuje N10, N20, N30 a krok je 10, vloží N40.
Pokud řádek už N-blok má, nic se nestane.`
      },
      {
        name: 'Převod G90 ↔ G91',
        desc: `<b>ABS</b> — převede celý program na absolutní souřadnice (G90). Všechny přírůstkové hodnoty X, Z se přepočítají na absolutní.
<b>INC</b> — převede na přírůstkové souřadnice (G91). První pohyb zůstane absolutní (referenční bod), další se přepočtou na přírůstky.
Oba převody podporují R-parametry (R0=…) — hodnoty se expandují při výpočtu.
Opětovné kliknutí na aktivní tlačítko vrátí původní kód.`
      },
      {
        name: 'Generátor hlavičky programu',
        desc: `<b>📝 Generovat hlavičku</b> — otevře dialog s nastavením hlavičky:
• <b>Převod (M4x)</b> — číslo převodu vřetena (M41–M45)
• <b>Odjezd do výměny (M80)</b> — M-kód pro pozici výměny
• <b>Nástroj (T/D)</b> — číslo nástroje a korekce
• <b>Souřadný systém</b> — G54, G55, G56, G57, G505, G53
• <b>Posuv</b> — G95 (mm/ot) nebo G94 (mm/min)
• <b>Vřeteno</b> — G97/G96, otáčky S, směr M3/M4, LIMS
Každou položku lze zapnout/vypnout zaškrtávacím polem.
Nastavení se ukládá do prohlížeče. Vloží se na začátek programu (za MSG, pokud existuje).`
      },
      {
        name: 'Validace programu',
        desc: `<b>● Status indikátor</b> (zelené ✓ / červené číslo) — průběžná kontrola v reálném čase (800ms po úpravě).
Kliknutím otevřete detail — seznam všech nalezených problémů s číslem řádku. Kliknutím na řádek v seznamu skočíte na dané místo v kódu.
<b>Kontrolovaná pravidla:</b>
• Chybějící G90/G91 před prvním pohybem
• Chybějící G94/G95 před pracovním posuvem
• G96 bez LIMS/G50 (nebezpečné otáčky)
• Chybějící G96/G97 před M3/M4
• Pracovní posuv bez aktivního vřetene při G95
• Neexistující cíle skoků (GOTOF/GOTOB)
• Nenalezené podprogramy (L1, CALL…)
• Program nekončí M30/M17`
      },
      {
        name: 'Nastavení validace',
        desc: `<b>⚙ Nastavení</b> — zapíná/vypíná jednotlivá pravidla validace:
• Pohyb (G0–G3), Souřadnice (G90/G91), Posuv (G94/G95)
• Otáčky (G96/G97), Vřeteno při G95, Konec programu
• Podprogramy, Parametry (R), Syntaxe
Nastavení se ukládá do prohlížeče.`
      },
      {
        name: 'R-Parametry',
        desc: `Postranní panel zobrazuje všechny R-parametry nalezené v kódu (R0, R1…) s jejich hodnotami a zdrojovým řádkem.
Parser vyhodnocuje i složené výrazy: <code>R1=R0+5</code>, <code>R2=R1*2</code> — výsledky se počítají kaskádově.`
      },
      {
        name: 'Rychlá klávesnice (quickbar)',
        desc: `Čtyři řady CNC tlačítek na spodku obrazovky:
<b>Řada 1:</b> G, M, X, Z, ␣ (mezera), ⌫ (smazat znak)
<b>Řada 2:</b> F, S, T, D, R, 123 (numpad)
<b>Řada 3:</b> ; = G0 G1 M30 M17
<b>Řada 4:</b> ↵ (nový řádek), LIMS, STOP(RE), 📋 (kopie), N+ (blok), ⌨ (klávesnice)

Tlačítka G, M, X, Z, F, S, T, D, R a LIMS otevřou numpad s nápovědou — zobrazí se seznam souvisejících kódů (např. G0=Rychloposuv, M30=Konec programu).
Tlačítko 123 otevře numpad pro zadání libovolného čísla.`
      },
      {
        name: 'Klávesnice na mobilu',
        desc: `Na mobilním zařízení se systémová klávesnice <b>nezobrazí automaticky</b> při klepnutí do editoru — CNC kód se zadává přes quickbar tlačítka.
Pokud potřebujete plnou klávesnici, stiskněte tlačítko <b>⌨</b> v pravém dolním rohu quickbaru.`
      },
      {
        name: 'Menu na mobilu (⋮)',
        desc: `Na mobilních zařízeních jsou tlačítka toolbaru skryta. Všechny funkce jsou dostupné přes tlačítko <b>⋮</b> (tři tečky) v pravém horním rohu, které otevře menu s plnými popisy akcí.
Menu se zavře kliknutím na „Zavřít" nebo klepnutím mimo okno.`
      }
    ]
  }
];

// ── HTML generátor ─────────────────────────────────────────────
function buildHelpHTML() {
  return sections.map(sec => `
    <details class="sn-help-section-details">
      <summary class="sn-help-section-summary">
        <span class="sn-help-sec-title">${sec.title}</span>
        <span class="sn-help-sec-desc">${sec.desc}</span>
      </summary>
      <div class="sn-help-section-body">
        ${sec.items.map(it => `
          <details class="sn-help-details">
            <summary class="sn-help-summary">${it.name}</summary>
            <div class="sn-help-body">${it.desc}</div>
          </details>
        `).join('')}
      </div>
    </details>
  `).join('');
}

// ── Hlavní export ──────────────────────────────────────────────
export function openHelp() {
  const bodyHTML = `
    <div class="sn-help-wrap">
      <div class="sn-help-intro">Rozklikněte sekci pro zobrazení detailního popisu funkcí.</div>
      ${buildHelpHTML()}
    </div>
  `;
  makeOverlay('sn-help', '❓ Nápověda – Sinumerik 840D', bodyHTML, 'sn-help-window');
}
