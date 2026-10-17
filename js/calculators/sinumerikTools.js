import { ref, openRefList } from './ctrlRefViewer.js';
import { snWearNames, snWearItems } from './sinumerikWear.js';

// ── Sinumerik 840D sl – nastavení nástrojů (soustruh / karusel, 2 suporty) ──
// Co znamenají „Data nástroje" a „Data břitu", jak nůž založit a změřit a co
// řešit při dvou suportech. Názvy polí se mírně liší podle verze SW, jazyka
// a projektu stroje – vždy platí, co je na obrazovce a v dokumentaci výrobce.
// Pole `syntax` = význam / popis.

export const snToolGroups = {
  'Opotřebení (hlavní)': snWearNames,
  'Jak to funguje': ['T a D', 'Součet délek', 'Nástroj × břit', 'SKICA ↔ stroj'],
  'Data nástroje (T)': ['Typ nástroje', 'Název nástroje', 'ST', 'Místo', 'Počet břitů', 'Stav nástroje', 'Smysl otáčení'],
  'Typy nástrojů': ['500', '510', '520', '530', '540', '550', '1xx', '2xx'],
  'Data břitu (D)': ['D', 'Délka X', 'Délka Z', 'Délka 3', 'Poloměr R', 'Poloha SL', 'Úhel držáku', 'Úhel destičky', 'Šířka břitu', 'Poloměr 1 / 2', 'Základní rozměr', 'Opotřebení Δ'],
  'Dva suporty': ['Suport = kanál', 'Přepnutí kanálu', 'Společná data?', 'Čísla a názvy', 'Nulové body', 'Směr os', 'WAITM'],
  'Postupy': ['Nový nůž', 'Měření X', 'Měření Z', 'Zápis ručně', 'Nová destička', 'Kontrola SL'],
  'Hlídání nástroje': ['Životnost', 'Počet kusů', 'Limit opotřebení', 'Předvarování'],
  'Proměnné $TC': ['$TC_DP1', '$TC_DP2', '$TC_DP3–5', '$TC_DP6', '$TC_DP12–15', '$TC_DP21–23', '$TC_TP2', '$TC_TP8', '$P_TOOLNO', '$P_TOOL']
};

export const snToolItems = [
  ...snWearItems,
  // ── Jak to funguje ──
  ref('T a D', 'T = nástroj (revolver / pozice), D = číslo břitu (korekce). Nůž v programu vyvoláš T a D; teprve D zapne korekční data (délky, poloměr). D0 korekci vypne. Bez D se po výměně nože obvykle zapne D1 (strojní data, např. MD20270 CUTTING_EDGE_DEFAULT – z paměti) – D raději piš vždy.',
    'Vyvolání nástroje v programu',
    'T="ROUGHER_T1" D1   ; podle názvu\nT1 D1               ; podle čísla\nD2                  ; jiný břit stejného nože\nD0                  ; vypnutí korekce',
    'Která varianta T=… / T1 funguje a zda je potřeba M6, určují strojní data (MD22550 TOOL_CHANGE_MODE)'),
  ref('Součet délek', 'Skutečná délka = geometrie + opotřebení + základní rozměr (+ adaptér). Geometrii zadáváš při založení nože, opotřebení při dolaďování rozměru, základní rozměr bývá 0 nebo je to rozměr držáku.',
    'Co se k čemu sčítá', ''),
  ref('Nástroj × břit', 'Data nástroje (T) platí pro celý nůž: typ, název, ST, místo, stav, hlídání. Data břitu (D) platí pro jeden břit: délky, poloměr, poloha břitu, úhly, opotřebení. Nůž s víc břity (D1, D2…) má data nástroje jedna, data břitu pro každý břit zvlášť.',
    'Rozdíl dat nástroje a břitu', ''),
  ref('SKICA ↔ stroj', 'SKICA do Sinumeriku píše T="NÁZEV" D1 M6 (výchozí název např. ROUGHER_T1). NÁZEV musí přesně odpovídat „Názvu nástroje" v seznamu nástrojů na stroji, jinak řízení hlásí neznámý nástroj. Poloměr špičky v SKICA = Poloměr R v datech břitu.',
    'Napojení na program ze SKICA', 'T="ROUGHER_T1" D1 M6'),

  // ── Data nástroje ──
  ref('Typ nástroje', 'Číselný kód určuje, jaká pole se u nože zobrazí (hrubovací 500, dokončovací 510, zapichovací 520, upichovací 530, závitový 540, kulatý 550…). Špatný typ = chybí pole nebo je jiné chování cyklů. Vnitřní nůž (vyvrtávací tyč) nemá vlastní typ – je to 500/510 s jinou polohou břitu. Čísla typů ověř v nabídce „Nový nástroj“ na stroji (u typu je obrázek).',
    'Typ nástroje', ''),
  ref('Název nástroje', 'Textové jméno (doporučeně bez mezer, velkými písmeny, bez diakritiky), podle kterého se nůž vyvolá T="NÁZEV". Musí být jedinečný.',
    'Jméno nástroje', 'T="FINISH_T2" D1'),
  ref('ST', 'Číslo sesterského (náhradního) nástroje: stejný nůž v několika kusech. Při vypršení životnosti řízení přepne na další ST bez zásahu programu (vyžaduje správu nástrojů a hlídání životnosti). U jednoduchého nože je ST = 1.',
    'Sesterský nástroj (Duplo)', ''),
  ref('Místo', 'Číslo pozice v revolveru / zásobníku, kde nůž leží. Při otáčení revolveru řízení najíždí na tuto pozici. Hodnota musí odpovídat skutečnému uložení.',
    'Místo v zásobníku (revolver)', ''),
  ref('Počet břitů', 'Kolik břitů (D1, D2, …) má nůž založeno. Každý břit má vlastní délky, poloměr, polohu SL a opotřebení. Oboustranná destička nebo držák se dvěma destičkami = D1 a D2. Další břit přidáš v seznamu nástrojů (nový břit).',
    'Kolik korekcí D nůž má', 'T="ZAPICH_3" D1   ; levý roh\nT="ZAPICH_3" D2   ; pravý roh'),
  ref('Stav nástroje', 'Příznaky: aktivní, volný (povolený), zablokovaný (nelze vyvolat), změřený, předvarování (blíží se konec životnosti), nutná výměna. Zablokovaný nůž řízení nepřijme – odblokuj ho v seznamu nástrojů.',
    'Stav nástroje', ''),
  ref('Smysl otáčení', 'U některých typů nože lze uložit směr otáčení vřetena (M3 / M4) a chlazení – program je pak přebírá. Jinak se M3/M4 a M8 píší v programu (jako ze SKICA).',
    'Vřeteno a chlazení u nože', ''),

  // ── Typy nástrojů ──
  ref('500', 'Hrubovací nůž (vnější i vnitřní soustružení). Pole: délky X/Z, poloměr R, poloha břitu, úhel držáku, úhel destičky.', 'Hrubovací nůž', ''),
  ref('510', 'Dokončovací nůž. Stejná pole jako u 500; odlišný je jen účel (dokončení konturou).', 'Dokončovací nůž', ''),
  ref('520', 'Zapichovací nůž. Navíc šířka břitu a dva poloměry rohů (levý/pravý).', 'Zapichovací nůž', ''),
  ref('530', 'Upichovací nůž. Pole jako u zapichovacího 520 (šířka břitu, poloměry rohů).', 'Upichovací nůž', ''),
  ref('540', 'Závitový nůž. Poloha břitu a poloměr špičky; parametry závitu (stoupání, hloubka) se zadávají v cyklu nebo v G33.', 'Závitový nůž', ''),
  ref('550', 'Kulatý (button) nůž. Poloměr R = poloměr destičky; poloha břitu se zadává jako střed rádiusu.', 'Kulatý nůž', ''),
  ref('1xx', 'Frézy pro poháněné nástroje (např. stopková fréza). Na karuselu bez poháněných nástrojů je nepotřebuješ.', 'Frézy', ''),
  ref('2xx', 'Vrtáky: 200 šroubovitý, 205 plný, 220 středicí, 230 záhlubník, 240 závitník, 250 výstružník. U vrtáku se zadává délka a průměr; poloměr špičky se neřeší. (Frézy jsou 1xx, vrtáky 2xx – ne naopak.)', 'Vrtací nástroje', ''),

  // ── Data břitu ──
  ref('D', 'Číslo břitu v rámci nože (1, 2, …). Každý D má vlastní délky, poloměr a opotřebení. Typicky D1 = hlavní břit, D2 = druhý roh destičky / druhý nůž.', 'Číslo břitu (D)', ''),
  ref('Délka X', 'Poloha špičky v ose X (radiální u soustruhu; u karuselu podle uložení os – viz Opotřebení → ΔX a ΔZ) od referenčního bodu držáku. Měří se dotykem (Postupy → Měření X).', 'Délka 1 – geometrie (L1)', ''),
  ref('Délka Z', 'Poloha špičky v ose Z (axiální u soustruhu; u karuselu obvykle svislá – vyložení nože ze suportu dolů k materiálu, podle uložení os) od referenčního bodu držáku. Měří se dotykem (Postupy → Měření Z).', 'Délka 2 – geometrie (L2)', ''),
  ref('Délka 3', 'Třetí osa (Y). U soustruhu bez osy Y je 0. Používá se u nožů s osou Y nebo poháněných nástrojů.', 'Délka 3 – geometrie (L3)', ''),
  ref('Poloměr R', 'Poloměr špičky destičky (např. 0,4 / 0,8 / 1,2). Používá korekce poloměru G41/G42 a cykly. Musí být správně, jinak vznikají chyby na kuželech a obloucích.', 'Poloměr špičky (R)', 'T="FINISH_T2" D1\nG42\nG1 X20 Z0 F0.1'),
  ref('Poloha SL', 'Číslo 1–9: kde leží špička vůči středu poloměru. Řízení podle toho počítá G41/G42 (kde je „skutečný" břit). 9 = střed poloměru. Správné číslo vždy ukazuje obrázek v zadávací obrazovce – nehádej, porovnej tvar nože s obrázkem. Pozor na „tabulky“ typu „1 = doleva nahoru, 4 = vnější pravý“: přiřazení čísel závisí na tom, zda je nůž před/za osou a jak je otočený pohled, takže obecná tabulka nemusí platit pro tvůj stroj. Na karuselu se u pravého a levého suportu poloha zrcadlí – SL nastav pro každý suport zvlášť a ověř kartou Kontrola SL.',
    'Poloha břitu (SL)', ''),
  ref('Úhel držáku', 'Natočení držáku vůči ose (např. 93°, 95°, 107°). Používají ho cykly pro výpočet přístupu a kontrolu kolize; s polohou SL nesouvisí.', 'Úhel držáku', ''),
  ref('Úhel destičky', 'Úhel špičky destičky (rohu): 35° (V), 55° (D), 80° (C/W), 90° (S). Používá se u cyklů kontury a při kontrole zbylého materiálu.', 'Úhel destičky', ''),
  ref('Šířka břitu', 'Šířka zapichovacího / upichovacího nože (např. 3 mm). Cykly zápichu a upichu počítají přísuvy a překrytí podle ní.', 'Šířka břitu', ''),
  ref('Poloměr 1 / 2', 'Poloměry levého a pravého rohu zapichovacího nože (např. 0,2 / 0,2). Při asymetrii se zadávají zvlášť.', 'Rohy zapichovacího nože', ''),
  ref('Základní rozměr', 'Pevný rozměr držáku / adaptéru, ke kterému se geometrie váže. Zadává výrobce nebo seřizovač; běžně 0. Při výměně držáku se mění jen on.', 'Base – základ', ''),
  ref('Opotřebení Δ', 'Korekce ΔX, ΔZ, ΔR během výroby; přičítají se k geometrii. Podrobně, včetně otázky „−0,2 = průměr, nebo délka?“ a zkoušky na stroji, je ve skupině Opotřebení (hlavní) nahoře.', 'Opotřebení břitu (Δ) – viz skupinu nahoře', ''),

  // ── Dva suporty ──
  ref('Suport = kanál', 'Každý suport bývá samostatný kanál NC (K1, K2) s vlastním programem, osami a (často) vlastní tabulkou nástrojů (TOA). Nástroje i nulové body je potřeba zadat v obou kanálech.',
    'Dva suporty v 840D', ''),
  ref('Přepnutí kanálu', 'Tlačítko přepnutí kanálu na pultu (nebo záhlaví „CH1 / CH2" na obrazovce). Seznam nástrojů vždy ukazuje kanál, ve kterém jsi. Před zápisem dat zkontroluj, že jsi ve správném.', 'Přepnutí mezi suporty', ''),
  ref('Společná data?', 'Zjištění: v kanálu 1 založ zkušební nůž (např. T99). Přepni na kanál 2: je-li T99 v seznamu, suporty sdílejí data nástrojů; není-li, mají oddělená. Zkušební nůž pak smaž.',
    'Sdílí suporty tabulku nástrojů?', ''),
  ref('Čísla a názvy', 'Při sdílené tabulce musí být T i NÁZEV jedinečné pro oba suporty. I při oddělených tabulkách se hodí předpona: např. R_ROUGH_T1 (pravý suport), L_ROUGH_T1 (levý). SKICA název z katalogu přebírá – změň ho před exportem.',
    'Pojmenování nožů', 'T="R_ROUGH_T1" D1   ; pravý suport\nT="L_ROUGH_T1" D1   ; levý suport'),
  ref('Nulové body', 'G54… a posunutí jsou pro každý kanál zvlášť. Nastav je oběma suportům (jejich vztah k obrobku / ose stolu). Délky nožů se měří vždy vůči nulovému bodu aktuálního kanálu.',
    'Nulové body suportů', ''),
  ref('Směr os', 'Druhý suport může mít osu X nebo Z zrcadlenou (opačný směr) a pracovat na DRUHÉ straně od středu stolu – radiální hodnoty pak mohou být záporné. Zjisti pro každý suport, na které straně středu pracuje a zda měří radiální osu v průměru, nebo v poloměru (symbol Ø). Při měření dotykem to řízení vyřeší samo; při ručním zápisu dej pozor na znaménka. Zrcadlená osa mění i směr G2/G3 (SKICA: příznak otočení osy v exportu).', 'Orientace druhého suportu', ''),
  ref('WAITM', 'WAITM(značka, kanál1, kanál2)\nObě strany vyvolají WAITM se stejnou značkou – kanály na sebe počkají. Používá se, když oba suporty obrábí současně.',
    'Synchronizace kanálů', '; kanál 1\nWAITM(1,1,2)\n; kanál 2\nWAITM(1,1,2)', 'Oba kanály počkají u značky 1'),

  // ── Postupy ──
  ref('Nový nůž', '1) Správný kanál (suport).\n2) Seznam nástrojů → Nový nástroj → typ + název.\n3) Poloha SL, poloměr R, úhly, počet břitů.\n4) Místo v revolveru.\n5) Vyvolej nůž (T…D1).\n6) Změř X a Z.\n7) Zkušební řez a kontrola SL.',
    'Kontrolní seznam pro nový nůž', 'T="ROUGH_T1" D1   ; v MDA vyvolání\nM3 S500\nG0 X100 Z100', 'Před měřením musí být nastaven nulový bod G54'),
  ref('Měření X', 'Nejdřív zadej poloměr R a polohu SL – z nich řízení přepočítá dotyk na špičku nože. JOG: vyvolej nůž (T, D), zadej otáčky a dotkni se průměru obrobku (velmi malý třísek). Změř průměr mikrometrem, v měření nástroje zadej Ø a potvrď „Nastavit délku X". Řízení vypočte Délku X z polohy osy a zadaného průměru.',
    'Měření délky X dotykem', ''),
  ref('Měření Z', 'JOG: dotkni se čela / vybrané plochy. V měření nástroje nastav referenci (Z0, nebo aktuální Z obrobku v G54) a „Nastavit délku Z". Řízení spočítá Délku Z vůči nulovému bodu.', 'Měření délky Z dotykem', ''),
  ref('Zápis ručně', 'Délky se dají zapsat i bez dotyku (z přístroje na seřizování nožů). Pozor na osy: zadávej v osách stroje a se správným znaménkem (zejména u druhého suportu a u karuselu).',
    'Ruční zápis rozměrů', ''),
  ref('Nová destička', 'Po otočení / výměně destičky: opotřebení ΔX, ΔZ, ΔR na 0; podle potřeby znovu změř délky (rozdíl v seřízení držáku). Při nové destičce s jiným R změň i Poloměr R.',
    'Výměna destičky', ''),
  ref('Kontrola SL', 'Zkušební G42/G41 na kuželu 45° nebo oblouku: pokud vychází stupeň nebo zub, je špatná poloha SL nebo poloměr R. Oprav SL podle obrázku v zadávací obrazovce.',
    'Ověření polohy břitu', 'G42\nG1 X20 Z0 F0.1\nX40 Z-10   ; 45°\nG40', 'Kužel musí být hladký bez stupně'),

  // ── Hlídání ──
  ref('Životnost', 'Nůž hlídá čas v řezu (min). Zadáváš zadanou a zbývající hodnotu; při dosažení limitu přejde do stavu „předvarování" a po vypršení se zablokuje (nebo přepne na další ST).', 'Hlídání životnosti', ''),
  ref('Počet kusů', 'Hlídání podle počtu obrobených kusů. Čítač zvyšuje řízení nebo program (podle strojních dat a projektu stroje); po dosažení limitu nůž přejde do předvarování / zablokování.', 'Hlídání počtu kusů', ''),
  ref('Limit opotřebení', 'Hlídání velikosti nasčítaného opotřebení: po překročení limitu hlásí nutnost výměny.', 'Hlídání opotřebení', ''),
  ref('Předvarování', 'Hodnota před koncem životnosti, při které řízení upozorní obsluhu (symbol / stav), ale nůž ještě pracuje.', 'Předvarovací limit', ''),

  // ── $TC ──
  ref('$TC_DP1', '$TC_DP1[T,D] – typ nástroje (500, 510, 520…).', 'Typ nástroje', 'R1=$TC_DP1[1,1]'),
  ref('$TC_DP2', '$TC_DP2[T,D] – poloha břitu SL (1–9).', 'Poloha břitu', 'R2=$TC_DP2[1,1]'),
  ref('$TC_DP3–5', '$TC_DP3 = délka 1 (L1, X)\n$TC_DP4 = délka 2 (L2, Z)\n$TC_DP5 = délka 3 (L3)', 'Geometrie – délky', 'R3=$TC_DP3[1,1]'),
  ref('$TC_DP6', '$TC_DP6[T,D] – poloměr (geometrie).', 'Poloměr špičky', '$TC_DP6[1,1]=0.8'),
  ref('$TC_DP12–15', '$TC_DP12 = opotřebení L1\n$TC_DP13 = opotřebení L2\n$TC_DP14 = opotřebení L3\n$TC_DP15 = opotřebení poloměru', 'Opotřebení',
    '$TC_DP12[1,1]=$TC_DP12[1,1]-0.02\nD1   ; znovu vyvolat D, aby se hodnota uplatnila', 'Po zápisu v programu vyvolej D znovu'),
  ref('$TC_DP21–23', '$TC_DP21 / 22 / 23 – základní rozměry L1 / L2 / L3.', 'Základní rozměry', ''),
  ref('$TC_TP2', '$TC_TP2[T] – název nástroje (řetězec).', 'Název nástroje', ''),
  ref('$TC_TP8', '$TC_TP8[T] – stav nástroje (bitové příznaky: aktivní, povolený, zablokovaný, změřený…).', 'Stav nástroje', ''),
  ref('$P_TOOLNO', 'Číslo aktivního nástroje (T) v kanálu. Čte se v programu.', 'Aktivní T', 'R5=$P_TOOLNO'),
  ref('$P_TOOL', 'Číslo aktivního břitu (D) v kanálu. Čte se v programu.', 'Aktivní D', 'R6=$P_TOOL')
];

const NOTE = 'Orientační přehled – názvy polí a hodnoty se liší podle verze SW, jazyka a projektu stroje. Platí obrazovka a dokumentace výrobce.';

export function openSinumerikTools() {
  openRefList({
    type: 'sinumerik-tools', title: '🛠️ Sinumerik 840D – Nástroje a břity', placeholder: 'Hledat (např. poloměr, SL, suport)…',
    groups: snToolGroups, items: snToolItems, windowClass: 'gc-window tl-window', syntaxLabel: 'Význam:', note: NOTE
  });
}
