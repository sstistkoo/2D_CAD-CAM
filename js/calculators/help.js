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
    title: '🛠️ Nástroje',
    desc: 'Nastavení nožů na Sinumeriku 840D: opotřebení, data nástroje (T), data břitu (D), dva suporty.',
    items: [
      {
        name: 'Co obsahuje',
        desc: `• <b>Opotřebení (hlavní)</b> — co udělá zápis −0,2 (radiální osa = průměr, axiální = délka), poloměr × průměr, znaménko, zkouška na stroji, příklady
• <b>Data nástroje / Data břitu</b> — typ, název, ST, místo, stav; délky X/Z, poloměr R, poloha břitu SL, úhly, šířka břitu
• <b>Dva suporty</b> — suport = kanál, společná × oddělená tabulka nástrojů, nulové body, WAITM
• <b>Postupy</b> — nový nůž, měření X/Z, nová destička, kontrola SL
• <b>Hlídání nástroje</b> a proměnné <b>$TC_DP…</b>`
      },
      {
        name: 'Pozor',
        desc: `Jde o orientační přehled. Znaménko opotřebení a zápis v průměru × poloměru se liší podle stroje — ověř je kartou <b>Test −0,2</b> pro každý suport.`
      }
    ]
  },
  {
    title: '🚨 Alarmy',
    desc: 'Alarmy a hlášení Sinumeriku 840D: rozsahy čísel, vlastní alarmy, mazání, časté alarmy.',
    items: [
      {
        name: 'Co obsahuje',
        desc: `• <b>Rozsahy čísel</b> — 10000+ program, 20000+ kanál a osy, 27000+ Safety, 60000+ cykly, 400000+ PLC, F/A pohony
• <b>Vlastní alarmy</b> — SETAL (65000–69999), MSG
• <b>Mazání</b> — RESET, CANCEL, NC START, POWER ON
• <b>Časté alarmy</b> s příčinou a řešením (orientačně) a alarmy pohonů SINAMICS`
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
