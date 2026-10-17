import { ref } from './ctrlRefViewer.js';

// ── Sinumerik 840D sl – opotřebení nástroje (hlavní téma příručky Nástroje) ──
// Opotřebení = malá korekce, kterou řízení PŘIČTE k danému rozměru nože.
// Směr a násobek (průměr × poloměr) závisí na uložení nože, osách a strojních
// datech – proto je tu zkouška, která to na konkrétním stroji ukáže (karta „Test").
// Pole `syntax` = význam / postup.

export const snWearNames = [
  'Co dělá −0,2', 'ΔX a ΔZ', 'Průměr × poloměr', 'Znaménko', 'Test −0,2', 'Příklad: průměr',
  'Příklad: délka', 'ΔR', 'Kdy se uplatní', 'Součet a přepis', 'Limit a reset', 'Zápis z programu'
];

export const snWearItems = [
  ref('Co dělá −0,2',
    'Zápis do opotřebení nic „neubírá z délky nože". Číslo se jen PŘIČTE k rozměru nože v tom sloupci, takže je špička o tolik jinde:\n' +
    '• sloupec RADIÁLNÍ osy (soustruh X, karusel podle SKICA Z) → špička se posune radiálně → mění se PRŮMĚR dílu,\n' +
    '• sloupec AXIÁLNÍ osy (soustruh Z, karusel podle SKICA X) → špička se posune axiálně → mění se DÉLKA / poloha čela a osazení,\n' +
    '• sloupec poloměru R → mění se rádius špičky (bez G41/G42 se neprojeví).\n' +
    '„Délka X" ve sloupci neznamená délku dílu, ale rozměr nože v ose X. O kolik a kterým směrem se změní průměr, říká karta Průměr × poloměr a Znaménko; ověř zkouškou Test −0,2.',
    'Odpověď: ovlivní průměr (radiální osa), ne délku nože',
    'radiální osa: opotřebení −0,2 → změna průměru dílu\naxiální osa: opotřebení −0,2 → změna délky / čela\nR: −0,2 → jen s G41/G42', ''),
  ref('ΔX a ΔZ',
    'ΔX = opotřebení v ose X, ΔZ = opotřebení v ose Z (sloupce „Opotřebení" u břitu D).\n' +
    'Rozhodující je, která z os stroje je RADIÁLNÍ (od osy otáčení) a která AXIÁLNÍ. U soustruhu je radiální X, u karuselu podle SKICA je radiální Z a axiální X – na tvém stroji to ověř podle pohybu os.\n' +
    'RADIÁLNÍ opotřebení laděš průměry (válce, díry, osazení v radiálním směru). AXIÁLNÍ opotřebení laděš délky, čela a polohy osazení.',
    'Která osa ladí co',
    '; soustruh:  ΔX → průměr,  ΔZ → délky\n; karusel (SKICA): ΔZ → průměr,  ΔX → délky', ''),
  ref('Průměr × poloměr',
    'Rozměry nože jsou fyzické vzdálenosti, tedy v POLOMĚRU, i když program běží s DIAMON (průměr). V tom případě platí:\n' +
    '• hodnota v poloměru: opotřebení 0,2 posune špičku o 0,2 mm → průměr dílu se změní o 0,4,\n' +
    '• hodnota v průměru (pokud ji stroj tak zobrazuje): 0,2 → průměr se změní o 0,2.\n' +
    'Který případ máš, určují strojní data (pravděpodobně MD20360 TOOL_PARAMETER_DEF_MASK – bit pro opotřebení příčné osy v průměru; název z paměti, ověř u servisu). Spolehlivě to ukáže zkouška Test −0,2. U AXIÁLNÍ osy se nic neduplikuje – 0,2 je 0,2 mm.',
    'Je číslo v poloměru, nebo v průměru?',
    'DIAMON; radiální opotřebení 0,2 (poloměr)  → průměr o 0,4\nDIAMON; radiální opotřebení 0,2 (průměr)   → průměr o 0,2', ''),
  ref('Znaménko',
    'Opotřebení se k rozměru nože přičítá s jeho znaménkem. Zda „−" znamená víc, nebo méně materiálu, záleží na směru, ve kterém je rozměr definovaný: uložení nože (vpravo / vlevo, nahoře / dole), zrcadlení osy druhého suportu a nastavení stroje (např. setting data pro znaménko opotřebení – SD42920 WEAR_SIGN a SD42930 WEAR_SIGN_CUTPOS, názvy z paměti, neověřeno).\n' +
    'Nespoléhej na „minus vždy zmenší průměr" jako u Fanucu. Pro každý suport a každé uložení nože si zkouškou zjisti a zapiš, jak se −0,2 chová.',
    'Kterým směrem posune špičku „−"?', ''),
  ref('Test −0,2',
    'A) Zkušební stupeň (nejjistější, bez předpokladů):\n' +
    '1) Poznamenej si stávající radiální opotřebení a pro zkoušku ho dej na 0 (po zkoušce vrať).\n' +
    '2) Zkušební díl: velmi krátký záběr stupně Ø1 (např. 2–3 mm délky). Změř Ø1.\n' +
    '3) Zapiš opotřebení −0,2, vyvolej D znovu, zopakuj stejný záběr vedle (stupeň Ø2). Změř Ø2.\n' +
    '4) Ø2 − Ø1 = skutečný vliv −0,2: velikost (0,4 → poloměr, 0,2 → průměr) a směr (+ = větší, − = menší).\n' +
    'B) Rychlá zkouška bez řezu (orientační): v MDA vyvolej T…D1, v zobrazení poloh WCS si poznamenej radiální osu. Zapiš −0,2, vyvolej D znovu a přečti, o kolik se zobrazení změnilo bez pohybu. Další řez se posune o tolik OPAČNĚ (kladný směr radiální osy míří od osy otáčení). Změna 0,4 → poloměr, 0,2 → průměr.\nVýsledek (pro každý suport) si zapiš, např. do 📝 Poznámek, a pak už jen používej.',
    'Jak zjistit, co −0,2 dělá na tvém stroji',
    'T="NAME" D1\nG0 X52 Z2          ; radiální X (karusel: dle stroje)\nG1 Z-3 F0.15       ; zkušební stupeň\nG0 X52\nM30', 'Stejný záběr před a po změně opotřebení'),
  ref('Příklad: průměr',
    'Kóta Ø50,00, naměřeno Ø50,12 (díl o 0,12 větší). Odebrat je třeba 0,12 z PRŮMĚRU, tj. posunout špičku o 0,06 do řezu (radiálně).\n' +
    'Zapiš: 0,06 (hodnota v poloměru) nebo 0,12 (hodnota v průměru) a znaménko, které ukázal Test. První zásah dej na ~80 % (např. 0,05 / 0,10) a doladi po dalším kusu.',
    'Díl je větší o 0,12 na průměru', ''),
  ref('Příklad: délka',
    'Délka osazení 30,10 místo 30,00 (o 0,10 delší). Zápis do AXIÁLNÍHO opotřebení o velikosti 0,10 (nedělí se ani nenásobí) se znaménkem z testu. U čelního soustružení se tak mění i výška osazení.',
    'Osazení je delší o 0,10', ''),
  ref('ΔR',
    'Opotřebení poloměru mění rádius špičky, který používá korekce G41/G42 a cykly. Program ze SKICA G41/G42 nepoužívá (dráha je už vypočítaná s poloměrem špičky), proto ΔR v něm průměr ani délku nedoladí – používej ΔX / ΔZ.\n' +
    'S G41/G42: +ΔR nechá víc materiálu na všech plochách (řízení počítá s větším nožem), −ΔR ubírá víc; posune válec, čelo i osazení o stejnou hodnotu kolmo ke kontuře.',
    'Opotřebení poloměru špičky', 'G42\nG1 X20 Z0 F0.1\nZ-30\nG40', 'Pouze programy s G41/G42'),
  ref('Kdy se uplatní',
    'Změna opotřebení v seznamu nástrojů se obvykle projeví při příštím vyvolání D (nebo T + D) – v MDA stačí „D1" a NC START. Podle nastavení stroje může u aktivního nože platit i hned; jistota je D vyvolat znovu. Po zápisu opotřebení z programu přes $TC_DP12–15 vždy vyvolej D znovu. Rozpracovaný program bere novou hodnotu až od příštího vyvolání D.',
    'Kdy se hodnota začne používat', 'D1   ; znovu vyvolat břit → uplatní se nové opotřebení', ''),
  ref('Součet a přepis',
    'V poli opotřebení je CELKOVÁ hodnota, ne přírůstek: nové číslo přepíše staré. Chceš-li přidat 0,03 k −0,05, zapiš −0,08. Opotřebení se k geometrii přičítá až při použití; geometrii (Délka X / Z) v běžné výrobě neměň.',
    'Celkově, ne přírůstkově', '', ''),
  ref('Limit a reset',
    'Při větším opotřebení (řádově desetiny mm) nůž znovu přeměř a vyřeš příčinu (upnutí, špatná geometrie, destička). Po výměně destičky opotřebení vynuluj a podle potřeby změř geometrii znovu.',
    'Kdy znovu měřit', ''),
  ref('Zápis z programu',
    'Opotřebení lze číst i zapsat přímo: $TC_DP12 = ΔL1, $TC_DP13 = ΔL2, $TC_DP14 = ΔL3, $TC_DP15 = ΔR (index [T,D]). Používá se pro automatické doladění po měření (měřicí cyklus). Po zápisu vyvolej D znovu.',
    'Programová korekce opotřebení',
    'R10=$TC_DP12[1,1]\n$TC_DP12[1,1]=R10-0.02\nD1', '')
];
