import { makeOverlay } from '../dialogFactory.js';

// ── Data: Příkazy a Syntax Sinumerik 840D ───────────────────
const commandGroups = {
  'Základní pohybové příkazy': ['AC','ACN','ACP','IC','DC'],
  'Polární souřadnice':        ['AP','RP','AR'],
  'Kruhová interpolace':       ['CIP','CR','I1','J1','K1'],
  'Transformace souřadnic':    ['TRANS','ATRANS','ROT','AROT','MIRROR','AMIRROR','SCALE','ASCALE'],
  'Tvarové prvky':             ['CHF','CHR','RND','RNDM','CONTPRON','KONT','OFFN','NORM'],
  'Programové řízení':         ['IF','ELSE','ENDIF','FOR','ENDFOR','WHILE','ENDWHILE','LOOP','ENDLOOP','CASE','DEFAULT','GOTOB','GOTOF','GOTO'],
  'Logické operátory':         ['AND','OR','NOT','B_AND','B_NOT','B_OR','B_XOR'],
  'Nastavení obrábění':        ['CFC','CFIN','CFTCP','DIAMOF','DIAMON','F','FAD','S','LIMS','D','DISC','DISCL','DISR'],
  'Podprogramy a makra':       ['PROC','RET','MCALL','P','SAVE','DEFINE AS'],
  'Datové typy a proměnné':    ['DEF','AXIS','AX','AXNAME','BOOL','CHAR','FRAME','INT','REAL','STRING'],
  'Vřeteno a polohování':      ['SPCON','SPCOF','SPOS','SPOSA','SETMS','SF'],
  'Systémové příkazy':         ['MSG','SETAL','SET','SBLOF','DISPLOF','SUPA','N']
};

const commandsList = [
  { name:'AC',     syntax:'osa=AC(hodnota)',    description:'Absolutní programování polohy. Funguje i v přírůstkovém G91.',
    examples:[{title:'Základní použití:',code:'G0 X=AC(100) Z=AC(50)\nG1 X=AC(80) F0.2',description:'Absolutní polohování v osách X a Z'},{title:'Použití v G91:',code:'G91\nG1 X=IC(10)\nX=AC(50)  ; Absolutní pozice i v G91',description:'AC funguje nezávisle na G90/G91'}]},
  { name:'ACN',    syntax:'osa=ACN(hodnota)',   description:'Absolutní programování s najetím v negativním směru.',
    examples:[{title:'Vnitřní soustružení:',code:'G0 X=AC(50) Z=AC(2)\nG1 X=ACN(80)',description:'Nájezd vždy z menšího rozměru'}]},
  { name:'ACP',    syntax:'osa=ACP(hodnota)',   description:'Absolutní programování s najetím v pozitivním směru.',
    examples:[{title:'Vnější soustružení:',code:'G0 X=AC(100) Z=AC(2)\nG1 X=ACP(80)',description:'Nájezd vždy z většího rozměru'}]},
  { name:'AND',    syntax:'IF (podmínka1 AND podmínka2)', description:'Logická spojka AND pro kombinaci podmínek.',
    examples:[{title:'Použití v podmínce:',code:'R1=5 R2=10\nIF (R1>0 AND R2<20) GOTOF N100',description:'Skok na N100 pokud jsou splněny obě podmínky'}]},
  { name:'AP',     syntax:'AP=hodnota',         description:'Polární úhel při programování v polárních souřadnicích.',
    examples:[{title:'Polární programování:',code:'G111\nRP=50 AP=45  ; Bod 50mm pod úhlem 45°',description:'Definice bodu pomocí vzdálenosti a úhlu'}]},
  { name:'AR',     syntax:'AR=hodnota',         description:'Úhel rozevření u kruhové interpolace.',
    examples:[{title:'Kruhový oblouk:',code:'G2 X100 Z0 AR=90',description:'Vytvoření čtvrtkruhu'}]},
  { name:'AXIS',   syntax:'DEF AXIS název',     description:'Definice proměnné typu osa.',
    examples:[{title:'Definice osy:',code:'DEF AXIS OSA_X\nOSA_X=100',description:'Proměnná typu AXIS'}]},
  { name:'AMIRROR',syntax:'AMIRROR X0 Y0',      description:'Přídavné zrcadlení ke stávajícímu zrcadlení.',
    examples:[{title:'Přídavné zrcadlení:',code:'MIRROR X0\nAMIRROR Y0',description:'Kombinace více zrcadlení'}]},
  { name:'AROT',   syntax:'AROT X=úhel',        description:'Přídavná rotace souřadného systému.',
    examples:[{title:'Přídavná rotace:',code:'ROT X45\nAROT X30  ; Celkem 75°',description:'Celková rotace je součtem'}]},
  { name:'B_AND',  syntax:'IF (B_AND(var1,var2))', description:'Bitový operátor AND.',
    examples:[{title:'Porovnání bitů:',code:'R1=5 R2=3\nIF B_AND(R1,R2) GOTOF N100',description:'5(101) AND 3(011) = 1(001)'}]},
  { name:'CIP',    syntax:'CIP X.. Z.. I1=.. K1=..', description:'Kruhová interpolace přes zadaný mezibod.',
    examples:[{title:'Kruhový oblouk:',code:'G0 X0 Z0\nCIP X50 Z-20 I1=25 K1=-5\nG1 X100 Z-50',description:'Plynulý oblouk přes průchozí bod'}]},
  { name:'CHF',    syntax:'CHF=hodnota',        description:'Vloží sražení hrany mezi dva pohyby.',
    examples:[{title:'Sražení hrany:',code:'G1 X100 Z0\nCHF=2\nZ-30',description:'Automatické sražení 2mm'}]},
  { name:'DIAMOF', syntax:'DIAMOF',             description:'Přepne programování na poloměry (radius).',
    examples:[{title:'Programování v poloměrech:',code:'DIAMOF\nG1 X25 F0.2  ; X25 = průměr 50mm\nDIAMON',description:'Přepínání mezi průměry/poloměry'}]},
  { name:'DIAMON', syntax:'DIAMON',             description:'Přepne programování na průměry.',
    examples:[{title:'Programování v průměrech:',code:'DIAMON\nG1 X50 F0.2  ; X50 = průměr 50mm',description:'Standardní soustružnický režim'}]},
  { name:'GOTOF',  syntax:'IF (podmínka) GOTOF řádek/návěští', description:'Podmíněný skok vpřed v programu.',
    examples:[{title:'Podmíněný skok:',code:'N100 R1=R1+1\nIF R1<5 GOTOF N200\nN150 G1 X50 F0.2\nN200 G1 Z-30',description:'Přeskočení bloků'}]},
  { name:'GOTOB',  syntax:'IF (podmínka) GOTOB řádek/návěští', description:'Podmíněný skok vzad v programu.',
    examples:[{title:'Smyčka s počítadlem:',code:'N100 R1=5\nN110 G1 X50 F0.2\nN120 R1=R1-1\nN130 IF R1>0 GOTOB N110',description:'Programová smyčka'}]},
  { name:'GOTO',   syntax:'GOTO řádek/návěští', description:'Nepodmíněný skok. Hledá cíl v celém programu.',
    examples:[{title:'Základní použití:',code:'N100 G1 X100 F0.2\nGOTO N200\nG1 X50  ; přeskočeno\nN200 G1 Z-30',description:'Nepodmíněný skok'},{title:'Skok na návěští:',code:'_START:\nG1 X100 F0.2\nR1=R1+1\nIF R1<5 GOTO _START\nM30',description:'Smyčka pomocí návěští'}]},
  { name:'MSG',    syntax:'MSG("text zprávy")', description:'Zobrazí text zprávy na obrazovce řídicího systému.',
    examples:[{title:'Základní použití:',code:'MSG("Vyměňte nástroj")\nM0\nMSG("")  ; vymaže zprávu',description:'Komunikace s obsluhou'}]},
  { name:'FOR',    syntax:'FOR prom=start TO konec\n...\nENDFOR', description:'Programová smyčka s počítadlem.',
    examples:[{title:'Základní smyčka:',code:'FOR R1=1 TO 5\n  G1 X=R1 F0.2\n  G1 Z-10\nENDFOR',description:'5 opakování'},{title:'Smyčka s krokem:',code:'FOR R2=0 TO 100 STEP 20\n  G1 X=R2 F0.2\n  G4 F1\nENDFOR',description:'Krok po 20'}]},
  { name:'WHILE',  syntax:'WHILE podmínka\n...\nENDWHILE', description:'Smyčka s podmínkou na začátku.',
    examples:[{title:'Podmíněné opakování:',code:'R1=0\nWHILE R1<5\n  G1 X=R1*10 F0.2\n  R1=R1+1\nENDWHILE',description:'Opakování dokud R1<5'}]},
  { name:'CASE',   syntax:'CASE prom OF konstanty … DEFAULT …', description:'Větvení programu podle hodnoty proměnné.',
    examples:[{title:'Výběr podle hodnoty:',code:'CASE R1 OF 1 GOTOF _m1 2 GOTOF _m2 DEFAULT GOTOF _def\n_m1: G1 X100 GOTOF _end\n_m2: G1 X200 GOTOF _end\n_def: MSG("Neplatná hodnota")\n_end: M30',description:'Větvení'}]},
  { name:'PROC',   syntax:'PROC název(parametry)', description:'Definice podprogramu s parametry.',
    examples:[{title:'Podprogram:',code:'PROC drilling(REAL _depth, INT _count)\n  R1=0\n  WHILE R1<_count\n    G1 Z=_depth F0.1\n    G0 Z2\n    R1=R1+1\n  ENDWHILE\n  RET',description:'Podprogram pro vrtání'}]},
  { name:'SPCON',  syntax:'SPCON',              description:'Zapnutí polohování vřetena.',
    examples:[{title:'Polohování:',code:'SPCON\nSPOS=45\nG0 X100\nSPCOF',description:'Přesné polohování vřetena'}]},
  { name:'SPOS',   syntax:'SPOS=úhel',          description:'Natočení vřetena na zadaný úhel.',
    examples:[{title:'Natočení:',code:'SPCON\nSPOS=180\nG4 F1\nG0 X50',description:'Otočení o 180°'}]},
  { name:'SCALE',  syntax:'SCALE X.. Y.. Z..', description:'Změna měřítka programovaných rozměrů.',
    examples:[{title:'Zvětšení:',code:'SCALE X2 Z2\nG1 X50 Z-30  ; Skutečně X100 Z-60\nSCALE',description:'Dvojnásobné rozměry'}]},
  { name:'RND',    syntax:'RND=hodnota',        description:'Vložení zaoblení mezi dva pohyby.',
    examples:[{title:'Zaoblení rohu:',code:'G1 X100 F0.2\nRND=5\nZ-30',description:'Zaoblení R5'}]},
  { name:'RNDM',   syntax:'RNDM=hodnota',       description:'Modální zaoblení – platí pro všechny následující pohyby.',
    examples:[{title:'Modální:',code:'RNDM=3\nG1 X100\nZ-20\nX70\nRNDM=0  ; vypnutí',description:'Automatické zaoblení R3'}]},
  { name:'S',      syntax:'S hodnota',          description:'Otáčky vřetena nebo řezná rychlost (G96/G97).',
    examples:[{title:'Konstantní otáčky:',code:'G97 S1000 M3\nG1 X50 F0.2\nS1500',description:'Přímé otáčky'},{title:'Konstantní řezná rychlost:',code:'G96 S200 M3\nLIMS=2000\nG1 X20 F0.2',description:'Řízení řezné rychlosti'}]},
  { name:'SETMS',  syntax:'SETMS(číslo)',       description:'Nastavení hlavního vřetena u více-vřetenových strojů.',
    examples:[{title:'Přepínání vřeten:',code:'SETMS(1)\nS1000 M3\nSETMS(2)\nS500 M3',description:'Ovládání více vřeten'}]},
  { name:'SETAL',  syntax:'SETAL(číslo_alarmu)', description:'Vyvolání programovatelného alarmu.',
    examples:[{title:'Kontrola:',code:'IF R1>100\n  SETAL(61000)\nENDIF',description:'Alarm při překročení'}]},
  { name:'BOOL',   syntax:'DEF BOOL prom=hodnota', description:'Logická proměnná (TRUE/FALSE).',
    examples:[{title:'Definice:',code:'DEF BOOL _kontrola=TRUE\nIF _kontrola == TRUE\n  MSG("Test OK")\nENDIF',description:'Boolean v podmínce'}]},
  { name:'CONTPRON', syntax:'CONTPRON',         description:'Příprava kontury pro zpracování.',
    examples:[{title:'Definice kontury:',code:'CONTPRON\nG1 X100 Z0\nX80\nZ-50\nCONTPROF',description:'Příprava konturového profilu'}]},
  { name:'DISC',   syntax:'DISC=hodnota',       description:'Korekce vnějšího rohu při nájezdu/odjezdu.',
    examples:[{title:'Nájezd:',code:'DISC=3\nG1 X100 Z0 F0.2\nG1 X80',description:'Odstup 3mm od kontury'}]},
  { name:'INT',    syntax:'DEF INT prom=hodnota', description:'Celočíselná proměnná.',
    examples:[{title:'Počítadlo:',code:'DEF INT _pocet=5\nN10 G1 X=_pocet*10\n_pocet=_pocet-1\nIF _pocet>0 GOTOB N10',description:'Smyčka s INT'}]},
  { name:'REAL',   syntax:'DEF REAL prom=hodnota', description:'Proměnná s desetinnou čárkou.',
    examples:[{title:'Výpočet:',code:'DEF REAL _prumer=50.5\nDEF REAL _radius=_prumer/2\nG1 X=_radius F0.2',description:'Práce s desetinnými čísly'}]},
  { name:'STRING', syntax:'DEF STRING[délka] prom=hodnota', description:'Textový řetězec.',
    examples:[{title:'Text:',code:'DEF STRING[20] _text="Vyměňte nástroj"\nMSG(_text)',description:'Ukládání zpráv'}]},
  { name:'MCALL',  syntax:'MCALL název_podprogramu', description:'Modální volání podprogramu – volá se v každém bloku.',
    examples:[{title:'Opakované vrtání:',code:'MCALL L10\nX10 Y20  ; volá L10\nX30 Y20  ; volá L10\nMCALL    ; vypnutí',description:'Automatické volání'}]},
  { name:'SAVE',   syntax:'PROC název SAVE',    description:'Uložení nastavení při volání podprogramu.',
    examples:[{title:'Bezpečné volání:',code:'PROC vrtani SAVE\nG17 G90 G54\nG0 Z-10\nRET',description:'Zachování nastavení'}]},
  { name:'CFC',    syntax:'CFC',                description:'Konstantní posuv po kontuře.',
    examples:[{title:'Obrábění kontury:',code:'CFC\nG1 X100 Z0 F0.2\nX80 Z-20\nCFIN',description:'Udržení rychlosti'}]},
  { name:'CFIN',   syntax:'CFIN',               description:'Konstantní posuv ostří nástroje.',
    examples:[{title:'Šikmé plochy:',code:'CFIN\nG1 X100 Z0 F0.15\nX50 Z-25\nCFC',description:'Rovnoměrné zatížení břitu'}]},
  { name:'DISPLOF',syntax:'DISPLOF',            description:'Vypnutí zobrazování bloků během zpracování.',
    examples:[{title:'Rychlé zpracování:',code:'DISPLOF\nFOR R1=1 TO 1000\n  G1 X=R1 F0.2\nENDFOR\nDISPLON',description:'Zrychlení zpracování'}]},
  { name:'SBLOF',  syntax:'SBLOF',              description:'Vypnutí režimu jednotlivých bloků.',
    examples:[{title:'Plynulé obrábění:',code:'SBLOF\nG1 X100 F0.2\nX80 Z-20\nSBLON',description:'Nepřerušovaný běh'}]},
  { name:'DEFINE AS',syntax:'DEFINE název AS text_makra', description:'Definice makra pro opakované sekvence.',
    examples:[{title:'Makro:',code:'DEFINE BEZPECNA AS G0 G90 Z100\nDEFINE CHLAZENI AS M8 G4 F2\nBEZPECNA\nCHLAZENI',description:'Zjednodušení kódu'}]},
  { name:'LIMS',   syntax:'LIMS=hodnota',       description:'Omezení max. otáček vřetena při G96.',
    examples:[{title:'Limit:',code:'G96 S200 M3\nLIMS=2000\nG1 X10 F0.2',description:'Max 2000 ot/min'}]},
  { name:'AX',     syntax:'AX(název_osy)',       description:'Převod názvu osy na proměnnou.',
    examples:[{title:'Dynamické:',code:'DEF AXIS osa=AX("X")\nG1 osa=100 F0.2',description:'Adresování osy'}]},
  { name:'AXNAME', syntax:'AXNAME("název_osy")', description:'Konverze textu na identifikátor osy.',
    examples:[{title:'Konverze:',code:'DEF AXIS osa\nosa=AXNAME("X")\nG1 osa=50 F0.2',description:'Text → osa'}]},
  { name:'NORM',   syntax:'NORM',               description:'Přímý nájezd na konturu.',
    examples:[{title:'Nájezd:',code:'NORM\nG1 X100 Z0 F0.2\nG1 X80 Z-20',description:'Standardní nájezd'}]},
  { name:'SUPA',   syntax:'SUPA',               description:'Vypnutí všech programovatelných posunutí a transformací.',
    examples:[{title:'Reset:',code:'TRANS X100\nROT X45\nSUPA\nG0 X0 Z0',description:'Návrat do základního systému'}]},
  { name:'SF',     syntax:'SF=hodnota',          description:'Počáteční bod pootočení při řezání závitů (G33).',
    examples:[{title:'Závit:',code:'G0 X50 Z2\nSF=180\nG33 Z-30 K2\nG0 X52',description:'Start ve 180°'}]},
  { name:'OFFN',   syntax:'OFFN=hodnota',        description:'Offset kontury v normálovém směru.',
    examples:[{title:'Offset:',code:'OFFN=1\nG1 X100 Z0 F0.2\nOFFN=0',description:'Paralelní kontura'}]},
  { name:'F',      syntax:'F hodnota',           description:'Nastavení posuvu (mm/ot nebo mm/min).',
    examples:[{title:'Posuv:',code:'G95\nF0.2  ; 0.2mm/ot\nG94\nF100  ; 100mm/min',description:'Různé režimy posuvu'}]},
  { name:'FAD',    syntax:'FAD=hodnota',         description:'Posuv pro měkký nájezd a odjezd.',
    examples:[{title:'Měkký nájezd:',code:'FAD=50\nG1 X100 F200',description:'Plynulý přechod'}]},
  { name:'D',      syntax:'D číslo',             description:'Výběr korekce nástroje.',
    examples:[{title:'Korekce:',code:'T1 D1\nG1 X100 F0.2',description:'Nástroj 1, korekce 1'}]},
  { name:'DISCL',  syntax:'DISCL=hodnota',       description:'Vzdálenost koncového bodu od pracovní roviny.',
    examples:[{title:'Bezpečná vzdálenost:',code:'DISCL=2\nG1 X100 Z0 F0.2',description:'2mm od roviny'}]},
  { name:'IC',     syntax:'osa=IC(hodnota)',    description:'Přírůstkové programování polohy. Funguje i v absolutním G90.',
    examples:[{title:'Použití v G90:',code:'G90\nG1 X=IC(10) F0.2  ; Přírůstek +10mm i v G90\nZ=IC(-5)',description:'IC přepíše režim G90 na přírůstkový'}]},
  { name:'DC',     syntax:'osa=DC(hodnota)',    description:'Přímé najetí na pozici (nejkratší cestou) u rotačních os.',
    examples:[{title:'Rotační osa:',code:'G0 C=DC(90)  ; Nejkratší dráha na 90°',description:'Přímé polohování rotační osy'}]},
  { name:'RP',     syntax:'RP=hodnota',         description:'Polární poloměr při programování v polárních souřadnicích.',
    examples:[{title:'Polární souřadnice:',code:'G111\nRP=50 AP=45  ; Bod ve vzdálenosti 50mm pod úhlem 45°',description:'Definice bodu v polárních souřadnicích'}]},
  { name:'CR',     syntax:'CR=hodnota',         description:'Poloměr kruhu pro kruhovou interpolaci G2/G3.',
    examples:[{title:'Kruhový oblouk:',code:'G2 X50 Z-30 CR=25  ; Oblouk s poloměrem 25mm',description:'Alternativa k I/K parametrům'}]},
  { name:'I1',     syntax:'I1=hodnota',         description:'Mezibod pro CIP (kruhová interpolace) – souřadniceX.',
    examples:[{title:'CIP interpolace:',code:'CIP X50 Z-20 I1=25 K1=-10',description:'Průchozí bod v ose X'}]},
  { name:'J1',     syntax:'J1=hodnota',         description:'Mezibod pro CIP – souřadnice Y.',
    examples:[{title:'CIP ve 3D:',code:'CIP X50 Y30 Z-20 I1=25 J1=15 K1=-10',description:'Průchozí bod v ose Y'}]},
  { name:'K1',     syntax:'K1=hodnota',         description:'Mezibod pro CIP (kruhová interpolace) – souřadnice Z.',
    examples:[{title:'CIP interpolace:',code:'CIP X50 Z-20 I1=25 K1=-10',description:'Průchozí bod v ose Z'}]},
  { name:'TRANS',  syntax:'TRANS X.. Y.. Z..', description:'Absolutní posunutí nulového bodu (Work Offset).',
    examples:[{title:'Posunutí:',code:'TRANS X100 Z50\nG1 X0 Z0 F0.2  ; Jede na X100 Z50\nTRANS  ; Zrušení',description:'Absolutní posun souřadnic'}]},
  { name:'ATRANS', syntax:'ATRANS X.. Z..', description:'Přírůstkové posunutí nulového bodu.',
    examples:[{title:'Přídavné posunutí:',code:'TRANS X100\nATRANS X20  ; Celkem X120\nG1 X0 Z0 F0.2',description:'Přídavný offset ke stávajícímu'}]},
  { name:'ROT',    syntax:'ROT X=úhel',        description:'Absolutní rotace souřadného systému.',
    examples:[{title:'Rotace:',code:'ROT X45  ; Otočení o 45°\nG1 X100 Z0 F0.2\nROT  ; Zrušení',description:'Otočení souřadnic'}]},
  { name:'MIRROR', syntax:'MIRROR X0 Y0',      description:'Zrcadlení souřadného systému.',
    examples:[{title:'Zrcadlení:',code:'MIRROR X0  ; Zrcadlení v ose X\nG1 X50 Z-20 F0.2\nMIRROR  ; Zrušení',description:'Vytvoření zrcadlového obrazu'}]},
  { name:'ASCALE', syntax:'ASCALE X.. Z..', description:'Přídavné měřítko ke stávajícímu.',
    examples:[{title:'Přídavné měřítko:',code:'SCALE X2\nASCALE X1.5  ; Celkem X3\nG1 X10 F0.2',description:'Kombinace měřítek'}]},
  { name:'CHR',    syntax:'CHR=hodnota',        description:'Sražení hrany definované délkou zkosení.',
    examples:[{title:'Sražení:',code:'G1 X100 Z0\nCHR=3  ; Sražení 3mm\nZ-30',description:'Automatické sražení hrany'}]},
  { name:'KONT',   syntax:'KONT',               description:'Monitorování kontury – kontrola kolizí nástroje.',
    examples:[{title:'Kontrola kontury:',code:'KONT\nG1 X100 Z0 F0.2\nX80 Z-20',description:'Aktivace sledování kontury'}]},
  { name:'IF',     syntax:'IF podmínka … ENDIF', description:'Podmíněné větvení programu.',
    examples:[{title:'Podmínka:',code:'IF R1>5\n  G1 X100 F0.2\n  MSG("R1 je větší než 5")\nENDIF',description:'Provedení bloku při splnění podmínky'}]},
  { name:'ELSE',   syntax:'IF … ELSE … ENDIF', description:'Alternativní větev podmínky IF.',
    examples:[{title:'Větvení:',code:'IF R1>5\n  G1 X100 F0.2\nELSE\n  G1 X50 F0.2\nENDIF',description:'Dvě alternativní větve'}]},
  { name:'ENDIF',  syntax:'ENDIF',              description:'Ukončení bloku podmínky IF.',
    examples:[{title:'Uzavření:',code:'IF R1==0\n  MSG("Nula")\nENDIF',description:'Vždy párové s IF'}]},
  { name:'ENDFOR', syntax:'ENDFOR',             description:'Ukončení smyčky FOR.',
    examples:[{title:'Konec smyčky:',code:'FOR R1=1 TO 5\n  G1 X=R1*10\nENDFOR',description:'Vždy párové s FOR'}]},
  { name:'ENDWHILE', syntax:'ENDWHILE',         description:'Ukončení smyčky WHILE.',
    examples:[{title:'Konec smyčky:',code:'WHILE R1<10\n  R1=R1+1\nENDWHILE',description:'Vždy párové s WHILE'}]},
  { name:'LOOP',   syntax:'LOOP … ENDLOOP',    description:'Nekonečná smyčka – ukončení jen skokem.',
    examples:[{title:'Nekonečná smyčka:',code:'LOOP\n  G1 X80 F0.2\n  G0 X100\n  IF R1>10 GOTOF _END\n  R1=R1+1\nENDLOOP\n_END: M30',description:'Ukončení pomocí GOTOF'}]},
  { name:'ENDLOOP', syntax:'ENDLOOP',           description:'Ukončení nekonečné smyčky LOOP.',
    examples:[{title:'Konec smyčky:',code:'LOOP\n  G1 X50 F0.2\nENDLOOP',description:'Vždy párové s LOOP'}]},
  { name:'DEFAULT', syntax:'CASE … DEFAULT …', description:'Výchozí větev příkazu CASE pokud žádná konstanta neodpovídá.',
    examples:[{title:'Výchozí hodnota:',code:'CASE R1 OF 1 GOTOF _a 2 GOTOF _b DEFAULT GOTOF _def\n_def: MSG("Neznámá hodnota")',description:'Větev pro neodpovídající hodnoty'}]},
  { name:'OR',     syntax:'IF (a OR b)',        description:'Logický operátor NEBO.',
    examples:[{title:'Použití:',code:'IF (R1>5 OR R2<0) GOTOF _ERR',description:'Skok pokud platí alespoň jedna podmínka'}]},
  { name:'NOT',    syntax:'IF (NOT podmínka)',  description:'Logická negace.',
    examples:[{title:'Negace:',code:'IF (NOT R1==0) GOTOF N100',description:'Skok pokud R1 není nula'}]},
  { name:'B_NOT',  syntax:'B_NOT(hodnota)',     description:'Bitová negace (inverze všech bitů).',
    examples:[{title:'Inverze:',code:'R2=B_NOT(R1)',description:'Bitová inverze hodnoty'}]},
  { name:'B_OR',   syntax:'B_OR(val1,val2)',    description:'Bitový operátor OR.',
    examples:[{title:'Bitový OR:',code:'R3=B_OR(R1,R2)',description:'Bitové sjednocení'}]},
  { name:'B_XOR',  syntax:'B_XOR(val1,val2)',   description:'Bitový operátor XOR (exkluzivní OR).',
    examples:[{title:'Bitový XOR:',code:'R3=B_XOR(R1,R2)',description:'Exkluzivní bitový součet'}]},
  { name:'CFTCP',  syntax:'CFTCP',              description:'Konstantní posuv vztažený ke středu nástroje (Tool Center Point).',
    examples:[{title:'TCP korekce:',code:'CFTCP\nG1 X100 Z0 F0.2\nCFC',description:'Posuv vztažený ke středu nástroje'}]},
  { name:'DISR',   syntax:'DISR=hodnota',       description:'Vzdálenost pro plynulý nájezd/odjezd na konturu.',
    examples:[{title:'Plynulý nájezd:',code:'DISR=2\nG1 X100 Z0 F0.2',description:'Plynulý přechod na konturu'}]},
  { name:'RET',    syntax:'RET',                description:'Návrat z podprogramu.',
    examples:[{title:'Konec podprogramu:',code:'PROC vrtani\n  G1 Z-10 F0.1\n  G0 Z2\nRET',description:'Ukončení a návrat na místo volání'}]},
  { name:'P',      syntax:'P=počet',            description:'Počet opakování volání podprogramu.',
    examples:[{title:'Opakování:',code:'L10 P3  ; Volání L10 třikrát',description:'Opakované volání podprogramu'}]},
  { name:'DEF',    syntax:'DEF typ název=hodnota', description:'Definice uživatelské proměnné.',
    examples:[{title:'Definice:',code:'DEF REAL _prumer=50.5\nDEF INT _pocet=10\nDEF STRING[20] _text="Ahoj"',description:'Podporované typy: INT, REAL, BOOL, STRING, AXIS, CHAR, FRAME'}]},
  { name:'CHAR',   syntax:'DEF CHAR prom=hodnota', description:'Znakový datový typ.',
    examples:[{title:'Znak:',code:'DEF CHAR _znak="A"\nIF _znak=="A"\n  MSG("Je to A")\nENDIF',description:'Práce s jedním znakem'}]},
  { name:'FRAME',  syntax:'DEF FRAME prom',     description:'Proměnná typu souřadnicový systém (Frame).',
    examples:[{title:'Frame proměnná:',code:'DEF FRAME _fr\n_fr=CTRANS(X,100,Z,50)\nG1 X0 Z0 F0.2',description:'Uložení souřadnicové transformace'}]},
  { name:'SPCOF',  syntax:'SPCOF',              description:'Vypnutí polohování vřetena.',
    examples:[{title:'Uvolnění vřetena:',code:'SPCON\nSPOS=90\nG0 X50\nSPCOF  ; Vřeteno volné',description:'Uvolnění vřetena pro otáčení'}]},
  { name:'SPOSA',  syntax:'SPOSA=úhel',         description:'Asynchronní natočení vřetena – nepřerušuje obrábění.',
    examples:[{title:'Asynchronní:',code:'SPOSA=180\nG1 X100 F0.2  ; Pohyb běží souběžně s natočením',description:'Natočení během jiného pohybu'}]},
  { name:'SET',    syntax:'SET[index]=hodnota',  description:'Přiřazení hodnoty na zadaný index pole.',
    examples:[{title:'Pole:',code:'DEF REAL _pole[5]\n_pole[0]=10\n_pole[1]=20',description:'Nastavení hodnot v poli'}]},
  { name:'N',      syntax:'N číslo',             description:'Číslo bloku (řádku) pro organizaci a skoky v programu.',
    examples:[{title:'Číslování:',code:'N10 G0 X100 Z2\nN20 G1 X80 F0.2\nN30 G0 X100\nGOTO N20  ; Skok na blok N20',description:'Odkazy pro GOTO/GOTOF/GOTOB'}]}
];

// ── Helpers ─────────────────────────────────────────────────
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function countReal(codeNames) { const names = new Set(commandsList.map(c => c.name)); return codeNames.filter(n => names.has(n)).length; }

// ── Hlavní funkce ───────────────────────────────────────────
export function openCommandsReference() {
  const chipHTML = Object.keys(commandGroups).map(cat => {
    const cnt = countReal(commandGroups[cat]);
    return `<button class="gc-chip" data-cat="${esc(cat)}">${esc(cat)} <span class="mc-chip-count">${cnt}</span></button>`;
  }).join('');

  const bodyHTML = `
    <div class="gc-search-wrap">
      <input type="search" class="gc-search cm-search" id="cmSearch" placeholder="Hledat příkaz…" autocomplete="off">
    </div>
    <div class="gc-chips" id="cmChips">
      <button class="gc-chip gc-chip-active" data-cat="__all__">Vše <span class="mc-chip-count">${commandsList.length}</span></button>
      ${chipHTML}
    </div>
    <div class="gc-list" id="cmList"></div>
  `;

  const overlay = makeOverlay('commands', '💻 Příkazy & Syntax – Sinumerik 840D', bodyHTML, 'gc-window cm-window');
  if (!overlay) return;

  const searchEl = overlay.querySelector('#cmSearch');
  const listEl   = overlay.querySelector('#cmList');
  const chipsEl  = overlay.querySelector('#cmChips');
  let activeCat  = '__all__';

  function getFiltered() {
    const q = searchEl.value.trim().toLowerCase();
    let cmds = commandsList;
    if (activeCat !== '__all__') {
      const allowed = commandGroups[activeCat] || [];
      cmds = cmds.filter(c => allowed.includes(c.name));
    }
    if (q) cmds = cmds.filter(c =>
      c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.syntax.toLowerCase().includes(q)
    );
    return cmds;
  }

  function render() {
    const cmds = getFiltered();
    if (!cmds.length) { listEl.innerHTML = '<div class="gc-empty">Žádné výsledky</div>'; return; }

    if (activeCat !== '__all__') {
      listEl.innerHTML = cmds.map(cardHTML).join('');
    } else {
      let html = '';
      const rendered = new Set();
      for (const [gn, cn] of Object.entries(commandGroups)) {
        const gc = cmds.filter(c => cn.includes(c.name) && !rendered.has(c.name));
        if (!gc.length) continue;
        html += `<div class="gc-group-title">${esc(gn)}</div>`;
        html += gc.map(c => { rendered.add(c.name); return cardHTML(c); }).join('');
      }
      const rest = cmds.filter(c => !rendered.has(c.name));
      if (rest.length) { html += `<div class="gc-group-title">Ostatní</div>` + rest.map(cardHTML).join(''); }
      listEl.innerHTML = html;
    }

    listEl.querySelectorAll('.gc-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.mc-copy-btn')) return;
        const isOpen = card.classList.contains('gc-card-open');
        listEl.querySelectorAll('.gc-card-open').forEach(c => c.classList.remove('gc-card-open'));
        if (!isOpen) card.classList.add('gc-card-open');
      });
    });
    listEl.querySelectorAll('.mc-copy-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        navigator.clipboard.writeText(btn.dataset.code).then(() => {
          btn.textContent = '✓'; setTimeout(() => { btn.textContent = '📋'; }, 1200);
        });
      });
    });
  }

  function cardHTML(cmd) {
    const ex = (cmd.examples || []).map(x => `
      <div class="gc-example">
        <div class="gc-ex-title">${esc(x.title)}</div>
        <pre class="gc-ex-code">${esc(x.code)}</pre>
        <div class="gc-ex-desc">${esc(x.description)}</div>
      </div>`).join('');
    return `
      <div class="gc-card" data-name="${esc(cmd.name)}">
        <div class="gc-card-header">
          <span class="gc-card-name cm-card-name">${esc(cmd.name)}</span>
          <span class="gc-card-desc">${esc(cmd.description)}</span>
          <span class="gc-card-arrow">▾</span>
        </div>
        <div class="gc-card-detail">
          <div class="gc-syntax">
            <span class="gc-syntax-label">Syntax:</span> <code>${esc(cmd.syntax)}</code>
            <button class="mc-copy-btn" data-code="${esc(cmd.syntax)}" title="Kopírovat syntax">📋</button>
          </div>
          ${ex}
        </div>
      </div>`;
  }

  searchEl.addEventListener('input', render);
  chipsEl.addEventListener('click', e => {
    const chip = e.target.closest('.gc-chip');
    if (!chip) return;
    chipsEl.querySelectorAll('.gc-chip').forEach(c => c.classList.remove('gc-chip-active'));
    chip.classList.add('gc-chip-active');
    activeCat = chip.dataset.cat;
    render();
  });
  render();
  searchEl.focus();
}
