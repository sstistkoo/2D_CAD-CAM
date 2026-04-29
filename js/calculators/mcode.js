import { makeOverlay } from '../dialogFactory.js';

// ── M-kód data (Sinumerik 840D – soustruh) ─────────────────
// Konsolidované kategorie – bez překryvů, bez mrtvých odkazů
const commandGroups = {
  '⭐ Nejčastější': [
    'M0', 'M1', 'M3', 'M4', 'M5', 'M8', 'M9', 'M30'
  ],
  'Řízení programu': [
    'M0', 'M1', 'M2', 'M17', 'M30', 'M32', 'M96', 'M97', 'M98', 'M99'
  ],
  'Vřeteno': [
    'M3', 'M4', 'M5', 'M2=3', 'M2=4', 'M2=5', 'M10', 'M11', 'M19',
    'M39', 'M40', 'M41', 'M42', 'M43', 'M48', 'M49', 'M57', 'M58',
    'M79', 'M85', 'M86', 'M87', 'M89'
  ],
  'Upínání': [
    'M25', 'M26', 'M50', 'M51', 'M52', 'M53'
  ],
  'Koník a lunety': [
    'M54', 'M55', 'M280', 'M281', 'M282', 'M283'
  ],
  'Chlazení a ofuk': [
    'M7', 'M8', 'M9', 'M13', 'M14', 'M60', 'M61', 'M65', 'M66', 'M71', 'M72'
  ],
  'Nástroje': [
    'M6', 'M80', 'M81', 'M230', 'M240', 'M245', 'M250'
  ],
  'Materiál a podavač': [
    'M20', 'M21', 'M23', 'M24', 'M67', 'M68', 'M69'
  ],
  'Synchronizace vřeten': [
    'M100', 'M101', 'M130', 'M160', 'M200'
  ],
  'Měření': [
    'M110', 'M111', 'M140', 'M893', 'M894'
  ],
  'Hydraulika': [
    'M90', 'M91'
  ],
  'Monitoring a bezpečnost': [
    'M94', 'M95', 'M150', 'M151', 'M170', 'M190', 'M195',
    'M840', 'M850', 'M860', 'M870', 'M880'
  ],
  'HSC a adaptivní': [
    'M210', 'M890', 'M891', 'M892', 'M898', 'M899'
  ]
};

const commandsList = [
  {name:'M0',syntax:'M0',description:'Programovatelný stop. Zastaví program a čeká na restart.',examples:[
    {title:'Kontrola rozměrů:',code:'G1 X100 F0.2\nM0                  ; Stop pro měření\nMSG("Změřte průměr")\nR10=R10+1          ; Pokračování po startu',description:'Zastavení pro kontrolní měření během obrábění'},
    {title:'Výměna nástroje:',code:'M5                  ; Zastavení vřetene\nM0                  ; Stop pro výměnu nástroje\nM3 S1000           ; Spuštění vřetene',description:'Manuální výměna nástroje během programu'}
  ]},
  {name:'M1',syntax:'M1',description:'Volitelný stop. Program se zastaví pouze pokud je aktivní funkce OPT.STOP.',examples:[
    {title:'Volitelná kontrola:',code:'G1 X50 F0.2\nM1                  ; Volitelné zastavení\nMSG("Kontrola")\nG1 Z-20',description:'Podmíněné zastavení pro kontrolu'}
  ]},
  {name:'M2',syntax:'M2',description:'Konec programu. Zastaví program a vřeteno, resetuje modální funkce.',examples:[
    {title:'Ukončení programu:',code:'G1 X0\nM5                  ; Vypnutí vřetene\nM9                  ; Vypnutí chlazení\nM2                  ; Konec programu',description:'Standardní ukončení programu'}
  ]},
  {name:'M2=3',syntax:'M2=3 S..',description:'Zapnutí poháněného nástroje ve směru hodinových ručiček.',examples:[
    {title:'Frézování drážky:',code:'T2 D1              ; Výběr frézovacího nástroje\nM2=3 S2000         ; Start rotace nástroje\nG1 X100 F100        ; Frézování',description:'Použití poháněného nástroje pro frézování'}
  ]},
  {name:'M2=4',syntax:'M2=4 S..',description:'Zapnutí poháněného nástroje proti směru hodinových ručiček.',examples:[
    {title:'Vrtání mimo osu:',code:'T3 D1              ; Výběr vrtáku\nM2=4 S1500         ; Start rotace proti směru\nCYCLE83            ; Vrtací cyklus',description:'Vrtání s poháněným nástrojem'}
  ]},
  {name:'M2=5',syntax:'M2=5',description:'Vypnutí poháněného nástroje.',examples:[
    {title:'Zastavení nástroje:',code:'M2=5               ; Vypnutí rotace nástroje\nG0 X100 Z100       ; Odjezd do bezpečné pozice',description:'Bezpečné zastavení poháněného nástroje'}
  ]},
  {name:'M3',syntax:'M3 S..',description:'Zapnutí vřetene ve směru hodinových ručiček (CW).',examples:[
    {title:'Základní použití:',code:'M3 S2000           ; Start vřetene 2000 ot/min\nG0 X100 Z2         ; Rychloposuv na pozici\nG1 Z0 F0.2         ; Začátek obrábění',description:'Standardní spuštění vřetene pro soustružení'},
    {title:'S řeznou rychlostí:',code:'G96 S200           ; Konstantní řezná rychlost\nM3                 ; Spuštění vřetene\nLIMS=3000          ; Omezení maximálních otáček',description:'Spuštění s konstantní řeznou rychlostí'}
  ]},
  {name:'M4',syntax:'M4 S..',description:'Zapnutí vřetene proti směru hodinových ručiček (CCW).',examples:[
    {title:'Základní použití:',code:'M4 S1500           ; Start vřetene proti směru\nG1 X50 F0.2        ; Obrábění s opačnými otáčkami',description:'Využití pro speciální operace'}
  ]},
  {name:'M5',syntax:'M5',description:'Zastavení vřetene.',examples:[
    {title:'Bezpečné zastavení:',code:'G1 X100 F0.2       ; Dokončení řezu\nM5                 ; Vypnutí vřetene\nG0 X120 Z100      ; Odjezd do bezpečné pozice',description:'Standardní zastavení na konci operace'}
  ]},
  {name:'M6',syntax:'M6',description:'Výměna nástroje.',examples:[
    {title:'Automatická výměna nástroje:',code:'T2 D1             ; Vyvolání nástroje číslo 2\nM6                ; Provedení výměny nástroje\nG43 H2            ; Aktivace délkové korekce',description:'Standardní sekvence výměny nástroje'}
  ]},
  {name:'M7',syntax:'M7',description:'Mlhové chlazení ZAP.',examples:[
    {title:'Aktivace mlhového chlazení:',code:'M7                ; Zapnutí mlhového chlazení\nG1 X100 F0.2      ; Obrábění s mlhovým chlazením',description:'Použití mlhového chlazení pro jemné operace'}
  ]},
  {name:'M8',syntax:'M8',description:'Zapnutí chlazení.',examples:[
    {title:'Standardní chlazení:',code:'M3 S2000           ; Start vřetene\nM8                 ; Zapnutí chlazení\nG1 X50 F0.2        ; Začátek obrábění',description:'Chlazení při běžném obrábění'}
  ]},
  {name:'M9',syntax:'M9',description:'Vypnutí chlazení.',examples:[
    {title:'Ukončení chlazení:',code:'G1 X100 F0.2       ; Dokončení řezu\nM9                 ; Vypnutí chlazení\nM5                 ; Vypnutí vřetene',description:'Vypnutí chlazení na konci operace'}
  ]},
  {name:'M10',syntax:'M10',description:'Zapnutí brzdy vřetene.',examples:[
    {title:'Použití brzdy:',code:'M5                 ; Zastavení vřetene\nG4 F1              ; Prodleva pro doběh\nM10               ; Aktivace brzdy\nT2 D1              ; Výměna nástroje',description:'Bezpečná výměna nástroje s použitím brzdy'}
  ]},
  {name:'M11',syntax:'M11',description:'Vypnutí brzdy vřetene.',examples:[
    {title:'Uvolnění brzdy:',code:'M11               ; Uvolnění brzdy\nM3 S2000          ; Start vřetene\nG0 X100 Z2        ; Nájezd na pozici',description:'Příprava pro další obrábění'}
  ]},
  {name:'M13',syntax:'M13',description:'Vřeteno CW + chlazení ZAP.',examples:[
    {title:'Start obrábění s chlazením:',code:'M13 S2000        ; Start vřetene ve směru CW a zapnutí chlazení\nG1 X50 F0.2       ; Začátek obrábění',description:'Kombinovaný příkaz pro start obrábění'}
  ]},
  {name:'M14',syntax:'M14',description:'Vřeteno CCW + chlazení ZAP.',examples:[
    {title:'Start obrábění proti směru:',code:'M14 S1500        ; Start vřetene CCW a zapnutí chlazení\nG1 Z-30 F0.15     ; Obrábění s chlazením',description:'Kombinace protisměrného otáčení a chlazení'}
  ]},
  {name:'M17',syntax:'M17',description:'Konec podprogramu.',examples:[
    {title:'Ukončení podprogramu:',code:'PROC DRAZKA       ; Definice podprogramu\nG1 X50 F0.2\nZ-20\nM17               ; Návrat do hlavního programu',description:'Standardní ukončení podprogramu'}
  ]},
  {name:'M19',syntax:'M19 [S..] [R..]',description:'Orientované zastavení vřetene. S určuje úhel, R určuje směr otáčení.',examples:[
    {title:'Polohování vřetene:',code:'M19 S45          ; Natočení vřetene na 45°\nG0 X100           ; Pohyb v polohovaném stavu',description:'Přesné polohování vřetene pro speciální operace'}
  ]},
  {name:'M20',syntax:'M20',description:'Pinola zpět.',examples:[
    {title:'Stažení pinoly:',code:'M20               ; Stažení pinoly\nG4 F1              ; Prodleva pro pohyb\nM26               ; Upnutí obrobku',description:'Příprava pro upnutí nového obrobku'}
  ]},
  {name:'M21',syntax:'M21',description:'Pinola vpřed.',examples:[
    {title:'Vysunutí pinoly:',code:'M25               ; Uvolnění upínání\nM21               ; Vysunutí pinoly\nG4 F1              ; Kontrolní prodleva',description:'Podepření dlouhého obrobku'}
  ]},
  {name:'M23',syntax:'M23',description:'Sběrač obrobků zpět.',examples:[
    {title:'Stažení sběrače:',code:'M23               ; Stažení sběrače\nG4 F1              ; Prodleva\nM26               ; Upnutí nového kusu',description:'Příprava pro další obrábění'}
  ]},
  {name:'M24',syntax:'M24',description:'Sběrač obrobků vpřed.',examples:[
    {title:'Vysunutí sběrače:',code:'M25               ; Uvolnění obrobku\nM24               ; Vysunutí sběrače\nG4 F2              ; Čekání na odebrání',description:'Odebrání hotového obrobku'}
  ]},
  {name:'M25',syntax:'M25',description:'Upínací zařízení otevřít.',examples:[
    {title:'Otevření sklíčidla:',code:'M5                ; Zastavení vřetene\nG4 F2              ; Prodleva pro doběh\nM25               ; Otevření sklíčidla',description:'Bezpečné uvolnění obrobku'}
  ]},
  {name:'M26',syntax:'M26',description:'Upínací zařízení zavřít.',examples:[
    {title:'Upnutí obrobku:',code:'M26               ; Upnutí obrobku\nG4 F1              ; Kontrola upnutí\nM3 S2000          ; Start vřetene',description:'Bezpečné upnutí nového obrobku'}
  ]},
  {name:'M30',syntax:'M30',description:'Konec hlavního programu.',examples:[
    {title:'Ukončení programu:',code:'G0 X200 Z200      ; Odjezd do bezpečné pozice\nM5                ; Zastavení vřetene\nM9                ; Vypnutí chlazení\nM30               ; Konec programu',description:'Kompletní ukončení programu s resetem'}
  ]},
  {name:'M32',syntax:'M32',description:'Konec programu pro režim nakládání.',examples:[
    {title:'Automatické nakládání:',code:'G0 X150 Z100      ; Bezpečná pozice\nM25               ; Otevření sklíčidla\nM32               ; Konec a příprava na další kus',description:'Ukončení s přípravou na další cyklus'}
  ]},
  {name:'M39',syntax:'M39',description:'Automatické vyvážení vřetene. Aktivuje systém pro automatické vyvážení.',examples:[
    {title:'Vyvážení vřetene:',code:'M39               ; Start vyvážení\nG4 F5              ; Čekání na dokončení\nM3 S1000          ; Start vřetene',description:'Automatické vyvážení vřetene pro minimalizaci vibrací'}
  ]},
  {name:'M40',syntax:'M40',description:'Automatická volba převodového stupně.',examples:[
    {title:'Automatická převodovka:',code:'M40              ; Aktivace auto převodovky\nS3000            ; Nastavení požadovaných otáček',description:'Automatická volba optimálního převodu'}
  ]},
  {name:'M41',syntax:'M41',description:'Převodový stupeň 1.',examples:[
    {title:'První převodový stupeň:',code:'M41              ; Zařazení prvního stupně\nS500             ; Nízké otáčky',description:'Použití pro nízké otáčky a vysoký kroutící moment'}
  ]},
  {name:'M42',syntax:'M42',description:'Druhý převodový stupeň.',examples:[
    {title:'Nastavení druhého stupně:',code:'M42              ; Zařazení druhého stupně\nS1000            ; Střední otáčky\nM3               ; Start vřetene',description:'Pro střední rozsah otáček'}
  ]},
  {name:'M43',syntax:'M43',description:'Třetí převodový stupeň.',examples:[
    {title:'Vysoké otáčky:',code:'M43              ; Třetí stupeň\nS2000            ; Vysoké otáčky\nM3               ; Start vřetene',description:'Pro vysokorychlostní obrábění'}
  ]},
  {name:'M48',syntax:'M48',description:'Zapnutí override pro posuv a otáčky.',examples:[
    {title:'Povolení override:',code:'M48              ; Povolení override\nG1 F0.2          ; Posuv lze upravovat potenciometrem',description:'Aktivace možnosti ruční úpravy hodnot'}
  ]},
  {name:'M49',syntax:'M49',description:'Vypnutí override pro posuv a otáčky.',examples:[
    {title:'Zákaz override:',code:'M49              ; Zákaz override\nG1 F0.15         ; Pevný posuv bez možnosti úpravy',description:'Zajištění přesných hodnot posuvu a otáček'}
  ]},
  {name:'M50',syntax:'M50',description:'Upínací kleština otevřít.',examples:[
    {title:'Otevření kleštiny:',code:'M5                ; Stop vřetene\nG4 F1              ; Prodleva\nM50               ; Otevření kleštiny\nG4 F0.5            ; Čekání na otevření',description:'Bezpečné otevření upínací kleštiny'}
  ]},
  {name:'M51',syntax:'M51',description:'Upínací kleština zavřít.',examples:[
    {title:'Upnutí obrobku:',code:'M51               ; Zavření kleštiny\nG4 F1              ; Kontrola upnutí\nM3 S1000          ; Start vřetene',description:'Bezpečné upnutí obrobku v kleštině'}
  ]},
  {name:'M52',syntax:'M52 S..',description:'Upínací deska – upnout definovanou silou.',examples:[
    {title:'Upnutí s definovanou silou:',code:'M52 S80           ; Upnutí čelistí na 80% síly\nG4 F1              ; Kontrola upnutí\nM3 S500           ; Start obrábění',description:'Přesné řízení upínací síly pro citlivé obrobky'}
  ]},
  {name:'M53',syntax:'M53',description:'Upínací deska – uvolnit.',examples:[
    {title:'Uvolnění čelistí:',code:'M5                ; Stop vřetene\nG4 F2              ; Čekání na zastavení\nM53               ; Uvolnění čelistí',description:'Bezpečné uvolnění obrobku'}
  ]},
  {name:'M54',syntax:'M54 P..',description:'Aktivace koníku s definovanou silou přítlaku.',examples:[
    {title:'Použití koníku:',code:'M54 P2000         ; Vysunutí koníku\n; P2000 = síla přítlaku v N\nG4 F1              ; Stabilizace',description:'Podepření dlouhého obrobku koníkem'}
  ]},
  {name:'M55',syntax:'M55',description:'Návrat koníku do výchozí polohy.',examples:[
    {title:'Zasunutí koníku:',code:'M55               ; Zasunutí koníku\nG4 F2              ; Čekání na návrat\nM53               ; Uvolnění čelistí',description:'Příprava pro výměnu obrobku'}
  ]},
  {name:'M57',syntax:'M57',description:'Kývání vřetene zapnuto.',examples:[
    {title:'Aktivace kývání:',code:'M57               ; Start kývání vřetene\nG1 X100 F0.1      ; Pomalý posuv s kýváním\nM58               ; Vypnutí kývání',description:'Speciální operace s kýváním vřetene'}
  ]},
  {name:'M58',syntax:'M58',description:'Kývání vřetene vypnuto.',examples:[
    {title:'Deaktivace kývání:',code:'M58               ; Vypnutí kývání\nM3 S2000          ; Normální rotace vřetene\nG1 X50 F0.2       ; Standardní obrábění',description:'Návrat k normálnímu režimu'}
  ]},
  {name:'M60',syntax:'M60',description:'Vysokotlaké čerpadlo START.',examples:[
    {title:'Aktivace chlazení:',code:'M60               ; Start vysokotlakého čerpadla\nG4 F2              ; Stabilizace tlaku\nG1 X100 F0.2      ; Start obrábění',description:'Použití vysokotlakého chlazení pro lepší odvod třísek'}
  ]},
  {name:'M61',syntax:'M61',description:'Vysokotlaké čerpadlo STOP.',examples:[
    {title:'Vypnutí chlazení:',code:'G1 X200 F0.2      ; Dokončení řezu\nM61               ; Stop vysokotlakého čerpadla\nM9                ; Vypnutí běžného chlazení',description:'Bezpečné vypnutí vysokotlakého chlazení'}
  ]},
  {name:'M65',syntax:'M65 P.. Q..',description:'Řízení externího mazání.',examples:[
    {title:'Aktivace mazání:',code:'M65 P1 Q100     ; Zapnutí mazání vodících ploch\nG4 F2            ; Prodleva pro distribuci\nM66               ; Vypnutí mazání',description:'Mazání důležitých mechanických částí stroje'}
  ]},
  {name:'M66',syntax:'M66',description:'Vypnutí externího mazání.',examples:[
    {title:'Deaktivace mazání:',code:'M66               ; Vypnutí mazacího systému\nM3 S1000          ; Pokračování v obrábění',description:'Bezpečné ukončení mazacího cyklu'}
  ]},
  {name:'M67',syntax:'M67',description:'Tyčový podavač/magazín posuv zapnuto.',examples:[
    {title:'Aktivace podavače:',code:'M67               ; Start podavače\nG4 F2              ; Čekání na podání\nM26               ; Upnutí nové tyče',description:'Automatické podání nového materiálu'}
  ]},
  {name:'M68',syntax:'M68',description:'Tyčový podavač/magazín posuv vypnuto.',examples:[
    {title:'Zastavení podavače:',code:'M68               ; Stop podavače\nM26               ; Upnutí materiálu\nM3 S2000          ; Start obrábění',description:'Ukončení podávání materiálu'}
  ]},
  {name:'M69',syntax:'M69',description:'Výměna tyče.',examples:[
    {title:'Výměna materiálu:',code:'M69               ; Inicializace výměny tyče\nG4 F5              ; Čekání na výměnu\nM26               ; Upnutí nové tyče',description:'Automatická výměna tyčového materiálu'}
  ]},
  {name:'M71',syntax:'M71',description:'Ofukování zapnuto.',examples:[
    {title:'Aktivace ofuku:',code:'M71               ; Start ofukování\nG1 X50 F0.2       ; Obrábění s ofukem\nM72               ; Vypnutí ofuku',description:'Čištění obrobku během obrábění'}
  ]},
  {name:'M72',syntax:'M72',description:'Ofukování vypnuto.',examples:[
    {title:'Deaktivace ofuku:',code:'M72               ; Vypnutí ofukování\nG0 X200 Z200      ; Odjezd do bezpečné pozice\nM30               ; Konec programu',description:'Ukončení ofukování na konci operace'}
  ]},
  {name:'M79',syntax:'M79',description:'Automatické nastavení otáček vřetene podle zatížení.',examples:[
    {title:'Adaptivní otáčky:',code:'M79               ; Aktivace adaptivních otáček\nG1 X100 F0.2      ; Start obrábění\nM5                ; Stop vřetene',description:'Optimalizace otáček vřetene pro zlepšení kvality obrábění'}
  ]},
  {name:'M80',syntax:'M80 [X..] [Y..] [Z..]',description:'Nájezd do pozice výměny nástroje.',examples:[
    {title:'Základní použití:',code:'M80               ; Nájezd do výchozí pozice výměny\nT1 D1            ; Výběr nástroje\nM6                ; Výměna nástroje',description:'Standardní sekvence výměny nástroje'},
    {title:'Programovatelná pozice:',code:'M80 X100 Y200 Z50  ; Nájezd do definované pozice\nT2 D1               ; Výběr nástroje\nM6                  ; Výměna nástroje',description:'Vlastní definice pozice výměny nástroje'}
  ]},
  {name:'M81',syntax:'M81',description:'Vypnutí mazání vodicích ploch.',examples:[
    {title:'Ukončení mazání:',code:'M81              ; Stop mazání\nM30              ; Konec programu',description:'Vypnutí mazání na konci programu'}
  ]},
  {name:'M85',syntax:'M85 S.. P..',description:'Aktivace synchronního režimu vřetene pro ozubení.',examples:[
    {title:'Synchronní režim:',code:'M85 S1 P2       ; Aktivace synchronizace\n; S1 = převodový poměr\n; P2 = režim synchronizace\nG1 X100 F0.2     ; Obrábění ozubení',description:'Přesná synchronizace pro výrobu ozubení'}
  ]},
  {name:'M86',syntax:'M86',description:'Synchronizace vřetene / deaktivace synchronního režimu.',examples:[
    {title:'Synchronizace vřeten:',code:'M86               ; Aktivace synchronizace\nM3 S1000          ; Start hlavního vřetene\n; Protivřeteno se automaticky synchronizuje',description:'Použití pro předání obrobku mezi vřeteny'}
  ]},
  {name:'M87',syntax:'M87',description:'Přesné zastavení vřetene v přesné poloze.',examples:[
    {title:'Přesné zastavení:',code:'M87               ; Přesné zastavení\nM19 S45           ; Orientace na 45°',description:'Pro přesné polohování nástrojů'}
  ]},
  {name:'M89',syntax:'M89',description:'Automatické zastavení vřetene při detekci vibrací.',examples:[
    {title:'Detekce vibrací:',code:'M89               ; Aktivace detekce vibrací\nG1 X50 F0.2       ; Start obrábění\nM5                ; Stop při detekci vibrací',description:'Ochrana vřetene a nástroje před poškozením'}
  ]},
  {name:'M90',syntax:'M90',description:'Hydraulický tlak 1 ZAP.',examples:[
    {title:'Aktivace hydrauliky:',code:'M90               ; Zapnutí hydrauliky\nG4 F2             ; Čekání na tlak\nM25               ; Otevření sklíčidla',description:'Řízení hydraulického systému'}
  ]},
  {name:'M91',syntax:'M91',description:'Hydraulický tlak 2 ZAP.',examples:[
    {title:'Druhý okruh:',code:'M91               ; Zapnutí druhého okruhu\nM26               ; Upnutí s vyšším tlakem',description:'Pro speciální upínací zařízení'}
  ]},
  {name:'M94',syntax:'M94',description:'Kontrola procesu ZAP.',examples:[
    {title:'Monitoring procesu:',code:'M94               ; Start monitorování\nG1 X50 F0.2       ; Kontrolovaný řez\nM95               ; Konec monitorování',description:'Detekce přetížení nebo zlomení nástroje'}
  ]},
  {name:'M95',syntax:'M95',description:'Kontrola procesu VYP.',examples:[
    {title:'Ukončení monitoringu:',code:'M95               ; Vypnutí kontroly\nG0 X100 Z100      ; Rychlý odjezd',description:'Ukončení kontroly procesu'}
  ]},
  {name:'M96',syntax:'M96 P.. Q..',description:'Podmíněný skok na návěští při signálu.',examples:[
    {title:'Kontrola signálu:',code:'M96 P1000 Q1     ; Skok na N1000 při signálu 1\nG1 X100 F0.2\nN1000             ; Cílové návěští',description:'Větvení programu podle externího signálu'}
  ]},
  {name:'M97',syntax:'M97 P..',description:'Lokální volání podprogramu.',examples:[
    {title:'Lokální podprogram:',code:'M97 P1000        ; Skok na N1000\nN1000\nG1 X50 F0.2\nM99              ; Návrat',description:'Volání části programu jako podprogramu'}
  ]},
  {name:'M98',syntax:'M98 P.. L..',description:'Volání podprogramu. P = číslo, L = opakování.',examples:[
    {title:'Volání podprogramu:',code:'M98 P1000 L3     ; Volání podprogramu 1000 třikrát\nM30              ; Konec hlavního programu',description:'Opakované volání podprogramu'}
  ]},
  {name:'M99',syntax:'M99',description:'Návrat z podprogramu nebo opakování hlavního programu.',examples:[
    {title:'Konec podprogramu:',code:'O1000            ; Začátek podprogramu\nG1 X100 F0.2\nM99              ; Návrat do hlavního programu',description:'Standardní ukončení podprogramu'}
  ]},
  {name:'M100',syntax:'M100',description:'Synchronní start vřeten.',examples:[
    {title:'Synchronní obrábění:',code:'M100              ; Synchronní start vřeten\nS2000            ; Otáčky pro obě vřetena\nG1 X100 F0.2     ; Obrábění se synchronizací',description:'Synchronizované obrábění na obou vřetenech'}
  ]},
  {name:'M101',syntax:'M101 Q..',description:'Úhlová synchronizace vřeten.',examples:[
    {title:'Úhlová synchronizace:',code:'M101 Q45         ; Synchronizace s offsetem 45°\nS1500            ; Nastavení otáček\nG1 X50 F0.2      ; Start obrábění',description:'Přesná úhlová synchronizace vřeten'}
  ]},
  {name:'M110',syntax:'M110 P.. Q..',description:'Měřicí cyklus pro průměr.',examples:[
    {title:'Měření průměru:',code:'M110 P50 Q0.01   ; Měření s tolerancí 0.01mm\nIF R100<49.9 GOTOF ERROR\nG0 X100          ; Pokračování při správném rozměru',description:'Automatická kontrola průměru během obrábění'}
  ]},
  {name:'M111',syntax:'M111 P.. Q..',description:'Měřicí cyklus pro délku.',examples:[
    {title:'Měření délky:',code:'M111 P100 Q0.02  ; Měření délky s tolerancí 0.02mm\nIF R101>100.1 GOTOF REWORK\nM30              ; Konec při správném rozměru',description:'Kontrola délkových rozměrů'}
  ]},
  {name:'M130',syntax:'M130 S.. P..',description:'Konfigurace vřetenových vzorů.',examples:[
    {title:'Synchronní vzor:',code:'M130 S1 P2      ; Nastavení vzoru 1:2\nM3 S1000         ; Hlavní vřeteno 1000 ot/min\n; Druhé vřeteno automaticky 2000 ot/min',description:'Vytvoření synchronizovaného vzoru otáček'}
  ]},
  {name:'M140',syntax:'M140 X.. Z.. Q..',description:'Pokročilé měření s automatickou korekcí.',examples:[
    {title:'Adaptivní měření:',code:'M140 X100 Z0 Q0.01  ; Start měření\n; Q0.01 = tolerance\nIF R100<>0 GOTOF ERROR',description:'Měření s automatickou korekcí procesu'}
  ]},
  {name:'M150',syntax:'M150 P.. Q..',description:'Komunikace s externím zařízením.',examples:[
    {title:'Externí komunikace:',code:'M150 P1 Q2      ; Odeslání dat\nG4 F1            ; Čekání na odpověď\nIF R200==1 GOTOF OK',description:'Komunikace s externím měřicím zařízením'}
  ]},
  {name:'M151',syntax:'M151',description:'Diagnostický režim.',examples:[
    {title:'Diagnostika:',code:'M151             ; Start diagnostiky\nG1 X100 F0.2     ; Test pohybu\nMSG("Test OK")',description:'Kontrola parametrů stroje během provozu'}
  ]},
  {name:'M160',syntax:'M160 K.. N..',description:'Synchronizace kanálů.',examples:[
    {title:'Synchronizace dvou kanálů:',code:'M160 K2 N100     ; Čekání na kanál 2\nG1 X100 F0.2     ; Synchronizovaný pohyb\nM161             ; Potvrzení synchronizace',description:'Koordinace operací mezi kanály'}
  ]},
  {name:'M170',syntax:'M170 P.. Q..',description:'Systémová konfigurace.',examples:[
    {title:'Nastavení parametrů:',code:'M170 P1 Q1000    ; Nastavení systémového parametru\n; P1 = číslo parametru\n; Q1000 = hodnota',description:'Úprava systémových nastavení'}
  ]},
  {name:'M190',syntax:'M190 P.. Q.. R..',description:'Automatický výměnný cyklus.',examples:[
    {title:'Automatická výměna:',code:'M190 P1 Q2 R100    ; Start výměnného cyklu\n; P1 = číslo palety\n; Q2 = cílová pozice\n; R100 = čekací pozice',description:'Řízení automatické výměny obrobků'}
  ]},
  {name:'M195',syntax:'M195 S.. P..',description:'Bezpečnostní monitorování.',examples:[
    {title:'Bezpečnostní monitoring:',code:'M195 S1 P500     ; Aktivace monitorování\n; S1 = úroveň kontroly\n; P500 = limit zatížení\nG1 X100 F0.2     ; Kontrolovaný pohyb',description:'Bezpečné obrábění s monitorováním'}
  ]},
  {name:'M200',syntax:'M200 K.. T.. S..',description:'Synchronizace více kanálů.',examples:[
    {title:'Vícenásobná synchronizace:',code:'M200 K1,2,3 T100   ; Synchronizace kanálů\n; K1,2,3 = čísla kanálů\n; T100 = časový limit\nM3 S2000          ; Start po synchronizaci',description:'Koordinace více kanálů stroje'}
  ]},
  {name:'M210',syntax:'M210 S.. F..',description:'Aktivace vysokorychlostního režimu (HSC).',examples:[
    {title:'HSC režim:',code:'M210 S1 F50000  ; Aktivace HSC\n; S1 = úroveň optimalizace\n; F50000 = max rychlost\nG1 X100 F10000   ; Vysokorychlostní pohyb',description:'Nastavení pro vysokorychlostní obrábění'}
  ]},
  {name:'M230',syntax:'M230 T.. P..',description:'Pokročilá správa nástrojů.',examples:[
    {title:'Správa nástrojů:',code:'M230 T1 P2      ; Aktivace inteligentní výměny\n; T1 = hlavní nástroj\n; P2 = záložní nástroj\nM6               ; Automatická výměna',description:'Pokročilý systém výměny nástrojů'}
  ]},
  {name:'M240',syntax:'M240 P.. Q.. R.. F..',description:'Cyklus vícenásobného vrtání.',examples:[
    {title:'Série děr:',code:'M240 P4 Q30 R2 F0.2  ; Vrtací cyklus\n; P4 = počet děr\n; Q30 = rozteč 30mm\n; R2 = hloubka 2mm\n; F0.2 = posuv na otáčku',description:'Automatické vytvoření řady děr s definovanou roztečí'}
  ]},
  {name:'M245',syntax:'M245 X.. Z.. R.. Q.. P..',description:'Automatický odměřovací cyklus s kompenzací.',examples:[
    {title:'Měření průměru s korekcí:',code:'M245 X100 Z0 R0.01 Q1 P1  ; Start měření\n; X100 = měřený průměr\n; R0.01 = tolerance\n; Q1 = číslo korekce\n; P1 = režim měření',description:'Přesné měření s automatickou korekcí nástroje'}
  ]},
  {name:'M250',syntax:'M250 S.. T.. Q.. R..',description:'Pokročilá správa nástrojů s monitoringem životnosti.',examples:[
    {title:'Monitoring nástroje:',code:'M250 S1 T120 Q80 R2  ; Aktivace monitoringu\n; S1 = režim sledování\n; T120 = časový limit [min]\n; Q80 = limit opotřebení [%]\n; R2 = varovná úroveň',description:'Komplexní sledování stavu nástroje'}
  ]},
  {name:'M280',syntax:'M280 P.. Q..',description:'Luneta – pohyblivá – sevřít.',examples:[
    {title:'Použití lunety:',code:'M280 P1 Q80       ; Aktivace lunety\n; P1 = číslo lunety\n; Q80 = upínací síla v %\nG4 F1              ; Čekání na upnutí',description:'Podepření dlouhého obrobku lunetou'}
  ]},
  {name:'M281',syntax:'M281',description:'Luneta – pohyblivá – uvolnit.',examples:[
    {title:'Uvolnění lunety:',code:'M281              ; Uvolnění lunety\nG4 F1              ; Čekání na uvolnění\nG0 X200            ; Odjezd do bezpečné pozice',description:'Bezpečné uvolnění lunety před výměnou obrobku'}
  ]},
  {name:'M282',syntax:'M282 P.. X.. Z..',description:'Nastavení pozice sledování lunetou.',examples:[
    {title:'Nastavení sledování:',code:'M282 P1 X100 Z-500  ; Nastavení dráhy lunety\n; P1 = číslo lunety\n; X,Z = koncová pozice\nG1 X100 F0.2        ; Start obrábění',description:'Automatické sledování obrobku lunetou'}
  ]},
  {name:'M283',syntax:'M283 P.. Q..',description:'Nastavení korekce lunety.',examples:[
    {title:'Korekce lunety:',code:'M283 P1 Q0.02    ; Nastavení korekce\n; P1 = číslo lunety\n; Q0.02 = hodnota korekce v mm',description:'Přesné doladění pozice lunety'}
  ]},
  {name:'M840',syntax:'M840 S.. P.. Q..',description:'Monitorování zátěže vřetene s adaptivním řízením.',examples:[
    {title:'Adaptivní monitoring:',code:'M840 S200 P80 Q120  ; Start monitoringu\n; S200 = referenční zatížení\n; P80 = min. limit\n; Q120 = max. limit',description:'Automatická kontrola zatížení vřetene'}
  ]},
  {name:'M850',syntax:'M850 X.. Z.. F..',description:'Přesné polohování s kompenzací vůlí.',examples:[
    {title:'Přesné polohování:',code:'M850 X100 Z50 F0.1  ; Polohování\n; F0.1 = přesnost v mm',description:'Eliminace vůlí v mechanických částech'}
  ]},
  {name:'M860',syntax:'M860 P.. Q.. R..',description:'Teplotní kompenzace stroje.',examples:[
    {title:'Teplotní kompenzace:',code:'M860 P1 Q30 R0.01  ; Aktivace kompenzace\n; P1 = režim kompenzace\n; Q30 = interval měření\n; R0.01 = přesnost',description:'Automatická kompenzace teplotních deformací'}
  ]},
  {name:'M870',syntax:'M870 S.. P..',description:'Kontrola integrity nástroje pomocí laseru.',examples:[
    {title:'Kontrola zlomení:',code:'M870 S1 P0.01    ; Kontrola nástroje\n; S1 = režim kontroly\n; P0.01 = tolerance',description:'Bezkontaktní kontrola stavu nástroje'}
  ]},
  {name:'M880',syntax:'M880 Q.. R..',description:'Adaptivní řízení posuvu podle zatížení.',examples:[
    {title:'Adaptivní posuv:',code:'M880 Q80 R120    ; Nastavení limitů\n; Q80 = minimální zatížení\n; R120 = maximální zatížení',description:'Optimalizace posuvu během obrábění'}
  ]},
  {name:'M890',syntax:'M890 P.. Q.. R..',description:'Adaptivní kontrola řezných podmínek s automatickou optimalizací.',examples:[
    {title:'Optimalizace řezání:',code:'M890 P80 Q120 R2   ; Adaptivní kontrola\n; P80 = minimální zatížení\n; Q120 = maximální zatížení\n; R2 = rychlost adaptace\nG1 X100 F0.2       ; Řezání s adaptací',description:'Automatická optimalizace řezných podmínek podle zatížení nástroje'}
  ]},
  {name:'M891',syntax:'M891 S.. T.. K..',description:'Pokročilý monitoring vibrací s prediktivní diagnostikou.',examples:[
    {title:'Monitoring vibrací:',code:'M891 S1000 T50 K2  ; Start monitoringu\n; S1000 = vzorkovací frekvence\n; T50 = práh alarmu\n; K2 = citlivost',description:'Detekce abnormálních vibrací během obrábění'}
  ]},
  {name:'M892',syntax:'M892 X.. Z.. D..',description:'Real-time kompenzace tepelné deformace s 3D mapováním.',examples:[
    {title:'Tepelná kompenzace:',code:'M892 X1 Z1 D0.01   ; Aktivace kompenzace\n; X1,Z1 = osy kompenzace\n; D0.01 = přesnost',description:'Průběžná kompenzace tepelných deformací stroje'}
  ]},
  {name:'M893',syntax:'M893 P.. Q.. F..',description:'Automatické měření geometrie obrobku s 3D skenováním.',examples:[
    {title:'3D skenování:',code:'M893 P1 Q0.01 F1000  ; Start skenování\n; P1 = režim skenování\n; Q0.01 = rozlišení\n; F1000 = rychlost',description:'Komplexní měření tvaru obrobku'}
  ]},
  {name:'M894',syntax:'M894 S.. R.. L..',description:'Laserové měření opotřebení nástroje v reálném čase.',examples:[
    {title:'Kontrola nástroje:',code:'M894 S2 R0.005 L1   ; Měření opotřebení\n; S2 = měřicí cyklus\n; R0.005 = tolerance\n; L1 = laser senzor',description:'Průběžné sledování stavu nástroje'}
  ]},
  {name:'M898',syntax:'M898 V.. A.. D..',description:'Vysokorychlostní obrábění s dynamickou kontrolou zrychlení.',examples:[
    {title:'HSC režim:',code:'M898 V200 A5 D0.1  ; HSC nastavení\n; V200 = rychlost\n; A5 = zrychlení\n; D0.1 = přesnost dráhy',description:'Optimalizované HSC obrábění'}
  ]},
  {name:'M899',syntax:'M899 F.. R.. T..',description:'Adaptivní řízení dynamiky stroje pro maximální přesnost.',examples:[
    {title:'Dynamická kontrola:',code:'M899 F100 R0.01 T2  ; Nastavení dynamiky\n; F100 = max rychlost\n; R0.01 = přesnost\n; T2 = časová konstanta',description:'Optimalizace dynamického chování stroje'}
  ]}
];

// ── Escape HTML ─────────────────────────────────────────────
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ── Počet reálných příkazů v kategorii ──────────────────────
function countReal(codeNames) {
  const names = new Set(commandsList.map(c => c.name));
  return codeNames.filter(n => names.has(n)).length;
}

// ── Hlavní funkce ───────────────────────────────────────────
export function openMcodeReference() {
  const categoryChips = Object.keys(commandGroups).map(cat => {
    const cnt = countReal(commandGroups[cat]);
    return `<button class="gc-chip" data-cat="${esc(cat)}">${esc(cat)} <span class="mc-chip-count">${cnt}</span></button>`;
  }).join('');

  const bodyHTML = `
    <div class="gc-search-wrap">
      <input type="search" class="gc-search mc-search" id="mcSearch" placeholder="Hledat M kód…" autocomplete="off">
    </div>
    <div class="gc-chips" id="mcChips">
      <button class="gc-chip gc-chip-active" data-cat="__all__">Vše <span class="mc-chip-count">${commandsList.length}</span></button>
      ${categoryChips}
    </div>
    <div class="gc-list" id="mcList"></div>
  `;

  const overlay = makeOverlay('mcode', '🔧 Sinumerik 840D – M kódy', bodyHTML, 'gc-window mc-window');
  if (!overlay) return;

  const searchInput = overlay.querySelector('#mcSearch');
  const listEl = overlay.querySelector('#mcList');
  const chipsEl = overlay.querySelector('#mcChips');
  let activeCategory = '__all__';

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

    if (activeCategory !== '__all__') {
      listEl.innerHTML = cmds.map(cmd => cardHTML(cmd)).join('');
    } else {
      let html = '';
      const rendered = new Set();
      for (const [groupName, codeNames] of Object.entries(commandGroups)) {
        const groupCmds = cmds.filter(c => codeNames.includes(c.name) && !rendered.has(c.name));
        if (groupCmds.length === 0) continue;
        html += `<div class="gc-group-title">${esc(groupName)}</div>`;
        html += groupCmds.map(cmd => { rendered.add(cmd.name); return cardHTML(cmd); }).join('');
      }
      const ungrouped = cmds.filter(c => !rendered.has(c.name));
      if (ungrouped.length) {
        html += `<div class="gc-group-title">Ostatní</div>`;
        html += ungrouped.map(cmd => cardHTML(cmd)).join('');
      }
      listEl.innerHTML = html;
    }

    // klik na kartu (detail)
    listEl.querySelectorAll('.gc-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.mc-copy-btn')) return;
        const isOpen = card.classList.contains('gc-card-open');
        listEl.querySelectorAll('.gc-card-open').forEach(c => c.classList.remove('gc-card-open'));
        if (!isOpen) card.classList.add('gc-card-open');
      });
    });

    // tlačítko kopírovat
    listEl.querySelectorAll('.mc-copy-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const code = btn.dataset.code;
        navigator.clipboard.writeText(code).then(() => {
          btn.textContent = '✓';
          setTimeout(() => { btn.textContent = '📋'; }, 1200);
        });
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
          <span class="gc-card-name mc-card-name">${esc(cmd.name)}</span>
          <span class="gc-card-desc">${esc(cmd.description)}</span>
          <span class="gc-card-arrow">▾</span>
        </div>
        <div class="gc-card-detail">
          <div class="gc-syntax">
            <span class="gc-syntax-label">Syntax:</span> <code>${esc(cmd.syntax)}</code>
            <button class="mc-copy-btn" data-code="${esc(cmd.syntax)}" title="Kopírovat syntax">📋</button>
          </div>
          ${examplesHTML}
        </div>
      </div>
    `;
  }

  searchInput.addEventListener('input', renderList);

  chipsEl.addEventListener('click', e => {
    const chip = e.target.closest('.gc-chip');
    if (!chip) return;
    chipsEl.querySelectorAll('.gc-chip').forEach(c => c.classList.remove('gc-chip-active'));
    chip.classList.add('gc-chip-active');
    activeCategory = chip.dataset.cat;
    renderList();
  });

  renderList();
  searchInput.focus();
}
