import { makeOverlay } from '../dialogFactory.js';

// ── G-kód data ──────────────────────────────────────────────
const commandGroups = {
  'Programování': ['G90','G91','G94','G95','G96','G97','G195','G196'],
  'Základní pohyby': ['G0','G1','G2','G3','CIP','G4','G9','G14','G15'],
  'Přesné najetí': ['G60','G601','G602','G603'],
  'Korekce nástroje': ['G40','G41','G42','G43','G44','G45','G46','G47'],
  'Nulové body': ['G53','G54','G55','G56','G57','G500','G54.1','G505','G507'],
  'Limitní hodnoty': ['G25','G26','G927'],
  'Řízení dráhy': ['G64','G641','G642','G643','G644','G808','G915','G961','G973'],
  'Cykly': ['G81','G82','G83','G84','G85','G86','G87','G88','G89'],
  'Transformace': ['G51','G51.1','G52','G68','G69','G50'],
  'Měrové jednotky': ['G70','G71','G700','G710'],
  'Měření a kontrola': ['G990','G995','G993','G994'],
  'Vrtací cykly': ['G971','G974','G975','G977','G979'],
  'Speciální funkce': ['G928','G952','G962','G964','G965'],
  'Závity': ['G33','G331','G332','G63','G932','G335']
};

const commandsList = [
  {name:'G0',syntax:'G0 X.. Z..',description:'Rychloposuv. Lineární pohyb maximální rychlostí stroje.',examples:[{title:'Základní použití:',code:'G0 X100 Z2     ; Rychlé najetí nad obrobek\nG0 Z0          ; Najetí k čelu',description:'Rychlé polohování nástroje před obráběním'}]},
  {name:'G1',syntax:'G1 X.. Z.. F..',description:'Pracovní posuv pro soustružení.',examples:[{title:'Podélné soustružení:',code:'G1 Z-50 F0.2   ; Podélné soustružení s posuvem 0.2mm/ot',description:'Základní podélné soustružení'},{title:'Čelní soustružení:',code:'G1 X0 F0.15    ; Zarovnání čela s posuvem 0.15mm/ot',description:'Soustružení čela'}]},
  {name:'G2',syntax:'G2 X.. Z.. CR=.. F..\nG2 X.. Z.. I.. K.. F..',description:'Kruhová interpolace ve směru hodinových ručiček (CW).',examples:[{title:'Zadání pomocí poloměru (CR):',code:'G0 X40 Z0\nG2 X60 Z-20 CR=14.14 F0.2',description:'Nejjednodušší způsob – přímo hodnota rádiusu'},{title:'Zadání pomocí středu (I,K):',code:'G0 X40 Z0\nG2 X60 Z-20 I10 K-10 F0.2\n; R = √(I² + K²) = 14.14mm',description:'Rádius se vypočítá z Pythagorovy věty'}]},
  {name:'G3',syntax:'G3 X.. Z.. I.. K.. F..\nG3 X.. Z.. CR=.. F..',description:'Kruhová interpolace proti směru hodinových ručiček (CCW).',examples:[{title:'Zadání pomocí středu:',code:'G0 X60 Z0\nG3 X40 Z-20 I-10 K-10 F0.2',description:'Vnitřní rádius pomocí středu (I,K)'},{title:'Tečné napojení (CT):',code:'G1 X80 Z0 F0.2\nG3 CT X60 Z-20',description:'Automatické tečné napojení'}]},
  {name:'CIP',syntax:'CIP X.. Z.. I1=.. K1=.. F..',description:'Kruhová interpolace přes mezibod.',examples:[{title:'Základní použití:',code:'G0 X50 Z0\nCIP X100 Z-30 I1=70 K1=-10 F0.2',description:'Oblouk přes průchozí bod I1,K1'}]},
  {name:'G4',syntax:'G4 F.. nebo G4 S..',description:'Časová prodleva (dwell). F = sekundy, S = otáčky.',examples:[{title:'Prodleva:',code:'G4 F2.5     ; Prodleva 2.5 sekundy\nG4 S5       ; Čekání 5 otáček vřetene',description:'Pozastaví program na danou dobu'}]},
  {name:'G9',syntax:'G9',description:'Přesné najetí – působí v jedné větě.',examples:[{title:'Použití:',code:'G9 G1 X80 Z40 F0.2  ; Přesné najetí na pozici',description:'Zajistí přesné najetí před pokračováním'}]},
  {name:'G14',syntax:'G14',description:'Automatický nájezd na nulový bod stroje v jedné ose.',examples:[{title:'Použití:',code:'G14 Z0     ; Najetí na nulový bod stroje v Z',description:'Rychlé referencování osy'}]},
  {name:'G15',syntax:'G15',description:'Polární souřadnice vypnout.',examples:[{title:'Použití:',code:'G15        ; Návrat k kartézským souřadnicím',description:'Deaktivace polárního programování'}]},
  {name:'G25',syntax:'G25 X.. Z.. S..',description:'Dolní omezení pracovního pole / min. otáčky.',examples:[{title:'Omezení:',code:'G25 X50 Z10        ; Minimální hodnoty os\nG25 S500           ; Minimální otáčky',description:'Zabránění kolizi'}]},
  {name:'G26',syntax:'G26 X.. Z.. S..',description:'Horní omezení pracovního pole / max. otáčky.',examples:[{title:'Kombinace:',code:'G25 S100   ; Min. otáčky\nG26 S2500  ; Max. otáčky\nG96 S200   ; Konstantní řezná rychlost',description:'Bezpečné limity otáček'}]},
  {name:'G33',syntax:'G33 Z.. K.. SF=..',description:'Řezání závitu s konstantním stoupáním. K = stoupání v mm.',examples:[{title:'Metrický závit:',code:'G0 X22 Z2\nG33 Z-30 K2       ; Stoupání 2mm\nG0 X24',description:'Jednoduchý metrický závit'}]},
  {name:'G331',syntax:'G331 Z.. K.. S..',description:'Vrtání závitu bez vyrovnávací hlavy.',examples:[{title:'Vrtání závitu M10:',code:'SPOS=0\nG331 Z-20 K1.5 S600\nG332 Z2',description:'Vrtání závitu s orientací vřetene'}]},
  {name:'G332',syntax:'G332 Z.. K..',description:'Zpětný pohyb při vrtání závitu (pár s G331).',examples:[{title:'Kompletní cyklus:',code:'G331 Z-25 K1.5 S500  ; Vrtání\nG332 Z2 K1.5        ; Zpět',description:'Kompletní závitovací cyklus'}]},
  {name:'G335',syntax:'G335 Z.. K..',description:'Řezání závitu s proměnnou hloubkou řezu.',examples:[{title:'Optimalizované řezání:',code:'G335 Z-30 K1.5  ; Závit s adaptivní hloubkou',description:'Optimalizuje zatížení nástroje'}]},
  {name:'G40',syntax:'G40',description:'Vypnutí korekce poloměru nástroje.',examples:[{title:'Použití:',code:'G40 G1 X120  ; Vypnutí korekce a odjezd',description:'Zrušení aktivní G41/G42'}]},
  {name:'G41',syntax:'G41 D..',description:'Korekce poloměru nástroje vlevo od kontury.',examples:[{title:'Vnější kontura:',code:'G41 D1\nG1 Z0 F0.2\nX60',description:'Aktivace korekce vlevo'}]},
  {name:'G42',syntax:'G42 D..',description:'Korekce poloměru nástroje vpravo od kontury.',examples:[{title:'Vnitřní kontura:',code:'G42 D1\nG1 Z-30 F0.2\nX60',description:'Aktivace korekce vpravo'}]},
  {name:'G43',syntax:'G43 H..',description:'Kladná korekce délky nástroje.',examples:[{title:'Použití:',code:'G43 H01  ; Aktivace korekce č. 1',description:'Délková korekce v kladném směru'}]},
  {name:'G44',syntax:'G44 H..',description:'Záporná korekce délky nástroje.',examples:[{title:'Použití:',code:'G44 H02  ; Záporná korekce č. 2',description:'Délková korekce v záporném směru'}]},
  {name:'G45',syntax:'G45 D..',description:'Zvětšení poloměru nástroje.',examples:[{title:'Použití:',code:'G45 D1   ; Kompenzace opotřebení',description:'Přičte hodnotu korekce'}]},
  {name:'G46',syntax:'G46 D..',description:'Zmenšení poloměru nástroje.',examples:[{title:'Použití:',code:'G46 D1   ; Jemné doladění rozměrů',description:'Odečte hodnotu korekce'}]},
  {name:'G47',syntax:'G47 D..',description:'Dvojnásobná korekce nástroje.',examples:[{title:'Použití:',code:'G47 D1   ; Speciální kompenzace',description:'Pro speciální případy'}]},
  {name:'G50',syntax:'G50',description:'Zrušení měřítka (scale). Vypíná G51.',examples:[{title:'Použití:',code:'G51 X0 Y0 P2.0  ; Měřítko 2:1\nG50             ; Zrušení',description:'Návrat k původnímu měřítku'}]},
  {name:'G51',syntax:'G51 X.. Y.. P..',description:'Programovatelné měřítko.',examples:[{title:'Použití:',code:'G51 X0 Y0 P2.0  ; Zvětšení 2×\nG50             ; Zrušení',description:'Proporcionální změna velikosti'}]},
  {name:'G51.1',syntax:'G51.1 X.. Y.. Z..',description:'Zrcadlení os.',examples:[{title:'Použití:',code:'G51.1 X100  ; Zrcadlení podle X=100',description:'Vytvoření symetrických tvarů'}]},
  {name:'G52',syntax:'G52 X.. Y.. Z..',description:'Lokální souřadný systém.',examples:[{title:'Použití:',code:'G52 X100  ; Lokální posun v X\nG52 X0    ; Zrušení',description:'Dočasné posunutí nulového bodu'}]},
  {name:'G53',syntax:'G53',description:'Zrušení posunutí – pohyb ke strojnímu nulovému bodu.',examples:[{title:'Výměna nástroje:',code:'G53 G0 X400 Z500  ; Do pozice stroje\nM6                ; Výměna',description:'Bezpečný přejezd'}]},
  {name:'G54',syntax:'G54',description:'První nastavitelné posunutí nulového bodu (Work Offset).',examples:[{title:'Použití:',code:'G54\nG0 X100 Z2  ; Nájezd v G54',description:'Standardní posunutí pro obrábění'}]},
  {name:'G54.1',syntax:'G54.1 P1-48',description:'Rozšířené uživatelské posunutí (až 48 nulových bodů).',examples:[{title:'Použití:',code:'G54.1 P1  ; První rozšířené posunutí',description:'Práce s více nulovými body'}]},
  {name:'G55',syntax:'G55',description:'Druhé nastavitelné posunutí nulového bodu.',examples:[{title:'Použití:',code:'G55\nG0 X100 Z2',description:'Druhý nulový bod obrobku'}]},
  {name:'G56',syntax:'G56',description:'Třetí nastavitelné posunutí nulového bodu.',examples:[{title:'Použití:',code:'G56\nG0 X100 Z2',description:'Třetí nulový bod obrobku'}]},
  {name:'G57',syntax:'G57',description:'Čtvrté nastavitelné posunutí nulového bodu.',examples:[{title:'Použití:',code:'G57\nG0 X100 Z2',description:'Čtvrtý nulový bod obrobku'}]},
  {name:'G60',syntax:'G60',description:'Přesné najetí – zvýšená přesnost polohování.',examples:[{title:'Použití:',code:'G60 G1 X50.000 Z0 F0.1',description:'Pro přesné rozměry'}]},
  {name:'G63',syntax:'G63 Z.. K..',description:'Řezání závitu bez synchronizace.',examples:[{title:'Použití:',code:'G63 Z-30 K1.5\nG0 Z2',description:'Závit bez synchronizace s vřetenem'}]},
  {name:'G64',syntax:'G64',description:'Plynulé řízení dráhy – plynulé přechody mezi bloky.',examples:[{title:'Použití:',code:'G64\nG1 X100 F0.2\nZ-20  ; Plynulý přechod',description:'Standardní režim pro plynulé obrábění'}]},
  {name:'G68',syntax:'G68 X.. Y.. R..',description:'Rotace souřadného systému.',examples:[{title:'Použití:',code:'G68 X0 Y0 R45  ; Rotace o 45°\nG69            ; Zrušení',description:'Obrábění pod úhlem'}]},
  {name:'G69',syntax:'G69',description:'Zrušení rotace souřadného systému.',examples:[{title:'Použití:',code:'G69  ; Zrušení G68',description:'Návrat k původní orientaci'}]},
  {name:'G70',syntax:'G70',description:'Programování v palcích.',examples:[{title:'Použití:',code:'G70\nG0 X1.5 Z0.1',description:'Palcový systém'}]},
  {name:'G71',syntax:'G71',description:'Programování v milimetrech.',examples:[{title:'Použití:',code:'G71\nG0 X40 Z2',description:'Metrický systém'}]},
  {name:'G81',syntax:'G81 X.. Y.. Z.. R.. F..',description:'Vrtací cyklus – základní vrtání bez přerušení.',examples:[{title:'Použití:',code:'G81 X100 Y50 Z-20 R2 F200',description:'Základní vrtací operace'}]},
  {name:'G82',syntax:'G82 X.. Y.. Z.. R.. P.. F..',description:'Vrtací cyklus s prodlevou na dně.',examples:[{title:'Použití:',code:'G82 X100 Y50 Z-15 R2 P0.5 F150',description:'Pro přesné díry a zahlubování'}]},
  {name:'G83',syntax:'G83 X.. Y.. Z.. R.. Q.. F..',description:'Hluboké vrtání s přerušením třísky.',examples:[{title:'Použití:',code:'G83 X100 Y50 Z-50 R2 Q5 F100',description:'Automatické vyjíždění pro odvod třísek'}]},
  {name:'G84',syntax:'G84 X.. Y.. Z.. R.. F..',description:'Závitovací cyklus pro vnitřní závity.',examples:[{title:'Použití:',code:'G84 X100 Y50 Z-20 R2 F1.5',description:'F = stoupání závitu'}]},
  {name:'G85',syntax:'G85 X.. Y.. Z.. R.. F..',description:'Vystružovací cyklus.',examples:[{title:'Použití:',code:'G85 X100 Y50 Z-25 R2 F50',description:'Přesné vystružování děr'}]},
  {name:'G86',syntax:'G86 X.. Y.. Z.. R.. F..',description:'Vrtací cyklus s orientovaným zastavením vřetena.',examples:[{title:'Použití:',code:'G86 X100 Y50 Z-30 R2 F200',description:'Řízené zastavení vřetena na dně'}]},
  {name:'G87',syntax:'G87 X.. Y.. Z.. R.. Q.. F..',description:'Vyvrtávací cyklus se zpětným zahloubením.',examples:[{title:'Použití:',code:'G87 X100 Y50 Z-40 R2 Q5 F100',description:'Zahloubení na zadní straně'}]},
  {name:'G88',syntax:'G88 X.. Y.. Z.. R.. P.. F..',description:'Vrtací cyklus s prodlevou a programovatelným přerušením.',examples:[{title:'Použití:',code:'G88 X100 Y50 Z-25 R2 P1.5 F150',description:'Vrtání s možností kontroly'}]},
  {name:'G89',syntax:'G89 X.. Y.. Z.. R.. P.. F..',description:'Vystružovací cyklus s prodlevou.',examples:[{title:'Použití:',code:'G89 X100 Y50 Z-30 R2 P0.5 F50',description:'Nejvyšší kvalita povrchu'}]},
  {name:'G90',syntax:'G90',description:'Absolutní programování – rozměry od nulového bodu.',examples:[{title:'Použití:',code:'G90\nG0 X100 Z2\nG1 Z0 F0.2\nX80',description:'Standardní absolutní rozměry'}]},
  {name:'G91',syntax:'G91',description:'Přírůstkové (inkrementální) programování.',examples:[{title:'Použití:',code:'G91\nG1 X-20 F0.2  ; O -20mm v X\nZ-30          ; O -30mm v Z',description:'Rozměry od aktuální pozice'}]},
  {name:'G94',syntax:'G94 F..',description:'Posuv v mm/min.',examples:[{title:'Použití:',code:'G94\nG1 X100 F300  ; 300 mm/min',description:'Rychlost nezávislá na otáčkách'}]},
  {name:'G95',syntax:'G95 F..',description:'Posuv v mm/ot – standard pro soustružení.',examples:[{title:'Použití:',code:'G95\nG1 X50 F0.2  ; 0.2 mm/ot',description:'Typické nastavení pro soustružení'}]},
  {name:'G96',syntax:'G96 S.. LIMS=..',description:'Konstantní řezná rychlost m/min. Otáčky se mění s průměrem.',examples:[{title:'Použití:',code:'G96 S200 LIMS=2000  ; 200 m/min, max 2000 ot',description:'Automatická úprava otáček'}]},
  {name:'G97',syntax:'G97 S..',description:'Konstantní otáčky vřetene.',examples:[{title:'Použití:',code:'G97 S1000\nG1 X50 F0.2',description:'Pevné otáčky'}]},
  {name:'G195',syntax:'G195 F..',description:'Posuv v ot/s – pro HSC obrábění.',examples:[{title:'Použití:',code:'G195\nF5.5  ; 5.5 otáček/s',description:'Přesné řízení pro vysokorychlostní obrábění'}]},
  {name:'G196',syntax:'G196 S.. F..',description:'Konstantní obvodová rychlost s posuvem v ot/s.',examples:[{title:'Použití:',code:'G196 S200 F3.5',description:'Kombinace G96 + G195'}]},
  {name:'G500',syntax:'G500',description:'Zrušení všech posunutí nulového bodu.',examples:[{title:'Použití:',code:'G500\nG0 X0 Z0  ; Základní nulový bod',description:'Reset všech posunutí'}]},
  {name:'G505',syntax:'G505',description:'Páté nastavitelné posunutí nulového bodu.',examples:[{title:'Použití:',code:'G505\nG0 X100 Z2',description:'Další nulový bod pro složité obrobky'}]},
  {name:'G507',syntax:'G507',description:'Sedmé nastavitelné posunutí nulového bodu.',examples:[{title:'Použití:',code:'G507\nG0 X100 Z2',description:'Pro vícestranné obrábění'}]},
  {name:'G601',syntax:'G601',description:'Jemné přesné najetí – malé okno tolerance.',examples:[{title:'Použití:',code:'G601\nG60 G1 X30 F0.1',description:'Nejvyšší požadavky na přesnost'}]},
  {name:'G602',syntax:'G602',description:'Hrubé přesné najetí – větší okno tolerance.',examples:[{title:'Použití:',code:'G602\nG60 G1 X100 F0.2',description:'Pro běžné obrábění'}]},
  {name:'G603',syntax:'G603',description:'Najetí bez kontroly okna – maximální rychlost.',examples:[{title:'Použití:',code:'G603\nG0 X200',description:'Důraz na rychlost, ne přesnost'}]},
  {name:'G641',syntax:'G641 ADIS=..',description:'Řízení dráhy s programovatelným přechodem.',examples:[{title:'Použití:',code:'G641 ADIS=0.1\nG1 X100 F0.2\nZ-30',description:'Max. odchylka od kontury'}]},
  {name:'G642',syntax:'G642 [ADIS=..]',description:'Plynulý přechod s omezením trhnutí.',examples:[{title:'Použití:',code:'G642 ADIS=0.1\nG1 X100 F1000',description:'Optimalizované přechody'}]},
  {name:'G643',syntax:'G643 [ADIS=..]',description:'Optimalizace dráhy uvnitř bloku.',examples:[{title:'Použití:',code:'G643 ADIS=0.05\nG1 X100 Y100 F500',description:'Zlepšení přesnosti v rámci bloku'}]},
  {name:'G644',syntax:'G644 [ADIS=..]',description:'Optimální zrychlení – nejlepší dynamika stroje.',examples:[{title:'Použití:',code:'G644 ADIS=0.2\nG1 X200 F2000',description:'Maximální využití dynamiky'}]},
  {name:'G700',syntax:'G700',description:'Palcové zadávání s automatickou konverzí.',examples:[{title:'Použití:',code:'G700\nG1 X1.5 F0.005',description:'Moderní palcové programování'}]},
  {name:'G710',syntax:'G710',description:'Metrické zadávání s automatickou konverzí.',examples:[{title:'Použití:',code:'G710\nG1 X40 F0.2',description:'Moderní metrické programování'}]},
  {name:'G808',syntax:'G808',description:'Zpomalení rychlosti v rozích.',examples:[{title:'Použití:',code:'G808\nG1 X100 Z0 F0.3\nX80 Z-20',description:'Přesnější obrábění rohů'}]},
  {name:'G915',syntax:'G915 X.. Z.. I.. K..',description:'Synchronizovaný pohyb os s časovým řízením.',examples:[{title:'Použití:',code:'G915 X100 Z-50 I2000 K1500',description:'Přesné časování pohybů'}]},
  {name:'G927',syntax:'G927',description:'Omezení zrychlení os.',examples:[{title:'Použití:',code:'G927  ; Snížení dynamického zatížení',description:'Pro těžké obrobky'}]},
  {name:'G928',syntax:'G928 X.. Z.. F..',description:'Referenční najetí s programovatelnou rychlostí.',examples:[{title:'Použití:',code:'G928 Z-200 F1000\nG928 X300 F500',description:'Kontrolované referencování'}]},
  {name:'G932',syntax:'G932 Z.. K.. F..',description:'Kuželový závit s konstantní řeznou rychlostí.',examples:[{title:'Použití:',code:'G96 S200\nG932 Z-50 K1.5 F2',description:'Přesný kuželový závit'}]},
  {name:'G952',syntax:'G952 P.. Q.. I.. K..',description:'Dokončovací cyklus pro kužel.',examples:[{title:'Použití:',code:'G952 P1 Q3 I30 K2',description:'Přesné dokončení kužele'}]},
  {name:'G961',syntax:'G961 X.. Z.. I.. K..',description:'Lineární interpolace s přesným časováním.',examples:[{title:'Použití:',code:'G961 X100 Z-50 I1000 K500',description:'Synchronizace s externími událostmi'}]},
  {name:'G962',syntax:'G962 X.. Z.. F..',description:'Konstantní obvodová rychlost při frézování.',examples:[{title:'Použití:',code:'G962 S150 F0.1\nG1 X100 Z-50',description:'Adaptace otáček při frézování'}]},
  {name:'G964',syntax:'G964 X.. Z.. F..',description:'Přesné polohování s kompenzací vůlí.',examples:[{title:'Použití:',code:'G964 X100 Z0 F0.1',description:'Eliminace vůlí'}]},
  {name:'G965',syntax:'G965 S.. P.. Q..',description:'Adaptivní řízení zrychlení.',examples:[{title:'Použití:',code:'G965 S1000 P70 Q120',description:'Dynamická optimalizace pohybů'}]},
  {name:'G971',syntax:'G971 P.. Q.. F..',description:'Vyvrtávací cyklus s přerušením.',examples:[{title:'Použití:',code:'G971 P30 Q2 F0.2',description:'Kontrolovaný odvod třísek'}]},
  {name:'G973',syntax:'G973 X.. Z.. I.. K..',description:'Synchronizovaný pohyb os.',examples:[{title:'Použití:',code:'G973 X100 Z-50 I1 K1',description:'Koordinace pohybu os'}]},
  {name:'G974',syntax:'G974 S.. D.. F..',description:'Vrtací cyklus s lomem třísky.',examples:[{title:'Použití:',code:'G974 S20 D2 F0.1',description:'Automatické přerušení třísky'}]},
  {name:'G975',syntax:'G975 S.. P.. Q.. F..',description:'Vrtací cyklus s proměnnou hloubkou přísuvu.',examples:[{title:'Použití:',code:'G975 S100 P10 Q15 F0.1',description:'Optimalizace hlubokého vrtání'}]},
  {name:'G977',syntax:'G977 X.. Z.. I.. K.. F..',description:'Hrubovací cyklus s adaptivním řízením.',examples:[{title:'Použití:',code:'G977 X100 Z-50 I2 K1 F0.3',description:'Inteligentní hrubování'}]},
  {name:'G979',syntax:'G979 P.. Q.. F..',description:'Vrtací cyklus s řízeným odvodem třísky.',examples:[{title:'Použití:',code:'G979 P100 Q10 F0.1',description:'Pro hluboké díry'}]},
  {name:'G990',syntax:'G990 X.. Z.. I.. K..',description:'Přesné měření v osách.',examples:[{title:'Použití:',code:'G990 X100 Z0 I0.01',description:'Měření průměru obrobku'}]},
  {name:'G993',syntax:'G993 X.. Z.. I.. K..',description:'Měření s automatickou korekcí nástroje.',examples:[{title:'Použití:',code:'G993 X100 Z0 I0.01 K1',description:'Automatická korekce po měření'}]},
  {name:'G994',syntax:'G994 X.. Z.. Q..',description:'Diferenciální měření.',examples:[{title:'Použití:',code:'G994 X100 Z0 Q2',description:'Měření rozdílu rozměrů'}]},
  {name:'G995',syntax:'G995 S.. P.. Q..',description:'Adaptivní řízení řezné rychlosti.',examples:[{title:'Použití:',code:'G995 S200 P80 Q120',description:'Optimalizace podle zatížení'}]}
];

// ── Escape HTML ─────────────────────────────────────────────
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ── Hlavní funkce ───────────────────────────────────────────
export function openGcodeReference() {
  // kategorie chips HTML
  const categoryChips = Object.keys(commandGroups).map(cat =>
    `<button class="gc-chip" data-cat="${esc(cat)}">${esc(cat)}</button>`
  ).join('');

  const bodyHTML = `
    <div class="gc-search-wrap">
      <input type="search" class="gc-search" id="gcSearch" placeholder="Hledat G kód…" autocomplete="off">
    </div>
    <div class="gc-chips" id="gcChips">
      <button class="gc-chip gc-chip-active" data-cat="__all__">Vše</button>
      ${categoryChips}
    </div>
    <div class="gc-list" id="gcList"></div>
  `;

  const overlay = makeOverlay('gcode', '⚙️ Sinumerik 840D – G kódy', bodyHTML, 'gc-window');
  if (!overlay) return;

  const searchInput = overlay.querySelector('#gcSearch');
  const listEl = overlay.querySelector('#gcList');
  const chipsEl = overlay.querySelector('#gcChips');
  let activeCategory = '__all__';

  // ── Filtrování & render ─────────────────────────────────
  function getFilteredCommands() {
    const q = searchInput.value.trim().toLowerCase();
    let cmds = commandsList;

    if (activeCategory !== '__all__') {
      const allowed = commandGroups[activeCategory] || [];
      cmds = cmds.filter(c => allowed.includes(c.name));
    }
    if (q) {
      cmds = cmds.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.syntax.toLowerCase().includes(q)
      );
    }
    return cmds;
  }

  function renderList() {
    const cmds = getFilteredCommands();
    if (cmds.length === 0) {
      listEl.innerHTML = '<div class="gc-empty">Žádné výsledky</div>';
      return;
    }

    // Pokud je vybraná kategorie, zobrazíme plochý seznam; jinak seskupený
    if (activeCategory !== '__all__') {
      listEl.innerHTML = cmds.map(cmd => cardHTML(cmd)).join('');
    } else {
      let html = '';
      for (const [groupName, codeNames] of Object.entries(commandGroups)) {
        const groupCmds = cmds.filter(c => codeNames.includes(c.name));
        if (groupCmds.length === 0) continue;
        html += `<div class="gc-group-title">${esc(groupName)}</div>`;
        html += groupCmds.map(cmd => cardHTML(cmd)).join('');
      }
      // příkazy bez skupiny
      const allGrouped = new Set(Object.values(commandGroups).flat());
      const ungrouped = cmds.filter(c => !allGrouped.has(c.name));
      if (ungrouped.length) {
        html += `<div class="gc-group-title">Ostatní</div>`;
        html += ungrouped.map(cmd => cardHTML(cmd)).join('');
      }
      listEl.innerHTML = html;
    }

    // klik na kartu
    listEl.querySelectorAll('.gc-card').forEach(card => {
      card.addEventListener('click', () => {
        const name = card.dataset.name;
        const isOpen = card.classList.contains('gc-card-open');
        // zavřít ostatní
        listEl.querySelectorAll('.gc-card-open').forEach(c => c.classList.remove('gc-card-open'));
        if (!isOpen) card.classList.add('gc-card-open');
      });
    });
  }

  function cardHTML(cmd) {
    const examplesHTML = (cmd.examples || []).map(ex => `
      <div class="gc-example">
        <div class="gc-ex-title">${esc(ex.title)}</div>
        <pre class="gc-ex-code">${esc(ex.code)}</pre>
        <div class="gc-ex-desc">${esc(ex.description)}</div>
      </div>
    `).join('');

    return `
      <div class="gc-card" data-name="${esc(cmd.name)}">
        <div class="gc-card-header">
          <span class="gc-card-name">${esc(cmd.name)}</span>
          <span class="gc-card-desc">${esc(cmd.description)}</span>
          <span class="gc-card-arrow">▾</span>
        </div>
        <div class="gc-card-detail">
          <div class="gc-syntax"><span class="gc-syntax-label">Syntax:</span> <code>${esc(cmd.syntax)}</code></div>
          ${examplesHTML}
        </div>
      </div>
    `;
  }

  // ── Eventy ──────────────────────────────────────────────
  searchInput.addEventListener('input', renderList);

  chipsEl.addEventListener('click', e => {
    const chip = e.target.closest('.gc-chip');
    if (!chip) return;
    chipsEl.querySelectorAll('.gc-chip').forEach(c => c.classList.remove('gc-chip-active'));
    chip.classList.add('gc-chip-active');
    activeCategory = chip.dataset.cat;
    renderList();
  });

  // počáteční render
  renderList();
  searchInput.focus();
}
