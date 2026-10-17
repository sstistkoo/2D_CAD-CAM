import { ref } from './ctrlRefViewer.js';

// ── Heidenhain TNC 640 – Q-parametry, cykly a ukázky ─────────

export const hhQGroups = {
  'Typy parametrů': ['Q0–Q99', 'Q100–Q199', 'Q200–Q1199', 'QL', 'QR', 'QS'],
  'Matematické FN': ['FN0', 'FN1–FN4', 'FN5', 'FN6–FN7', 'FN8', 'FN13'],
  'Podmínky a skoky': ['FN9', 'FN10', 'FN11', 'FN12'],
  'Systémové a výstupní FN': ['FN14', 'FN16', 'FN18', 'FN20'],
  'Vzorce': ['Vzorec Q']
};

export const hhQItems = [
  ref('Q0–Q99', 'Q0 … Q99', 'Volné uživatelské parametry – platí v celém programu a v podprogramech.', 'Q1 = +25'),
  ref('Q100–Q199', 'Q100 … Q199', 'Rezervované pro řízení a PLC (předávání dat); do vlastních programů je nepoužívej.', 'Q1 = +10   ; použij Q0–Q99, ne Q100+'),
  ref('Q200–Q1199', 'Q200 … Q1199', 'Parametry cyklů (Q200 = bezpečná vzdálenost, Q201 = hloubka, …) – nepřepisuj je mimo definici cyklu.', 'CYCL DEF 200 … Q201=-15'),
  ref('QL', 'QL0 … QL499', 'Lokální parametry – platí jen v daném programu / podprogramu (nepřepíšou hodnoty v jiném).', 'QL1 = +10'),
  ref('QR', 'QR0 … QR499', 'Trvalé parametry – zůstanou i po vypnutí stroje (počítadla kusů, offsety).', 'QR1 = QR1 + 1'),
  ref('QS', 'QS0 …', 'Řetězcové parametry (text) – názvy souborů, zprávy, ID.', 'QS1 = "HRIDEL-01"'),
  ref('FN0', 'FN 0: Qn = hodnota', 'Přiřazení.', 'FN 0: Q5 = +60'),
  ref('FN1–FN4', 'FN 1: Q1 = +Q2 + +Q3\nFN 2: − · FN 3: × · FN 4: ÷', 'Základní operace: sčítání (FN1), odčítání (FN2), násobení (FN3), dělení (FN4).', 'FN 1: Q10 = +Q1 + +Q2\nFN 4: Q11 = +Q10 DIV +2'),
  ref('FN5', 'FN 5: Qn = SQRT hodnota', 'Druhá odmocnina.', 'FN 5: Q4 = SQRT 25'),
  ref('FN6–FN7', 'FN 6: Qn = SIN hodnota\nFN 7: Qn = COS hodnota', 'Sinus a kosinus (úhel ve stupních).', 'FN 6: Q6 = SIN 30'),
  ref('FN8', 'FN 8: Qn = hodnota LEN hodnota', 'Délka přepony: √(a² + b²).', 'FN 8: Q7 = +3 LEN +4   ; 5'),
  ref('FN13', 'FN 13: Qn = hodnota ANG hodnota', 'Úhel z protilehlé a přilehlé odvěsny (ATAN).', 'FN 13: Q8 = +10 ANG +10   ; 45°'),
  ref('FN9', 'FN 9: IF +Q1 EQU +Q2 GOTO LBL n', 'Když se Q1 rovná Q2, skoč na LBL. Jinak pokračuje další věta.', 'FN 9: IF +Q1 EQU +0 GOTO LBL 99'),
  ref('FN10', 'FN 10: IF +Q1 NE +Q2 GOTO LBL n', 'Skok při nerovnosti.', 'FN 10: IF +Q1 NE +0 GOTO LBL 99'),
  ref('FN11', 'FN 11: IF +Q1 GT +Q2 GOTO LBL n', 'Skok, když Q1 > Q2.', 'FN 11: IF +Q1 GT +10 GOTO LBL 5'),
  ref('FN12', 'FN 12: IF +Q1 LT +Q2 GOTO LBL n', 'Skok, když Q1 < Q2.', 'FN 12: IF +Q1 LT +10 GOTO LBL 5'),
  ref('FN14', 'FN 14: ERROR = číslo', 'Vyvolá chybové hlášení s číslem – program se zastaví (texty chyb jsou v tabulce výrobce).', 'FN 14: ERROR = 1000'),
  ref('FN16', 'FN 16: F-PRINT zdroj / cíl', 'Formátovaný výstup do souboru (protokol měření, počítadlo).', 'FN 16: F-PRINT TNC:\\PROT.A / SCREEN:'),
  ref('FN18', 'FN 18: SYSREAD Qn = ID.. NR.. IDX..', 'Čtení systémových dat (poloha, nástroj, čas, stav stroje).', 'FN 18: SYSREAD Q1 = ID.. NR.. IDX..', 'Čísla ID/NR/IDX viz tabulka systémových dat v manuálu'),
  ref('FN20', 'FN 20: WAIT FOR NC|SYNC', 'Synchronizace interpolace se strojní logikou (PLC).', 'FN 20: WAIT FOR SYNC'),
  ref('Vzorec Q', 'Q1 = SQRT (Q2 * Q2 + Q3 * Q3)', 'Zadání výrazem (formule) místo FN: podporuje + − * / závorky a funkce SIN, COS, TAN, ASIN, ACOS, ATAN, SQRT, ABS, INT, FRAC, LN, LOG, EXP, SGN.', 'Q10 = Q1 * 2 + SQRT 16')
];

export const hhCycleGroups = {
  'Vrtání a závitování': ['200', '201', '202', '203', '205', '206', '207', '209'],
  'Souřadnice a transformace': ['7', '8', '10', '11', '247'],
  'Soustružení – nastavení': ['800', '801'],
  'Soustružení – hrubování a dokončení': ['810', '811', '812', '813', '814', '815', '820', '821', '823'],
  'Soustružení – závity': ['830', '831', '832'],
  'Soustružení – zápichy': ['840', '850', '860', '870']
};

export const hhCycleItems = [
  ref('200', 'CYCL DEF 200 DRILLING', 'Vrtání: Q200 bezpečná vzdálenost, Q201 hloubka, Q206 posuv zanoření, Q202 hloubka přísuvu, Q211 prodleva na dně. Vyvolání: CYCL CALL (ISO G79).', 'CYCL DEF 200 DRILLING\n  Q200=2 ;SET-UP CLEARANCE\n  Q201=-20 ;DEPTH\n  Q206=150 ;FEED RATE FOR PLUNGING\n  Q202=5 ;PLUNGING DEPTH\n  Q210=0 ;DWELL TIME AT TOP\n  Q203=+0 ;SURFACE COORDINATE\n  Q204=50 ;2ND SET-UP CLEARANCE\n  Q211=0.1 ;DWELL TIME AT DEPTH\nCYCL CALL'),
  ref('201', 'CYCL DEF 201 REAMING', 'Vystružení – jede dovnitř posuvem a ven Q208.', 'CYCL DEF 201 REAMING\nCYCL CALL'),
  ref('202', 'CYCL DEF 202 BORING', 'Vyvrtávání s orientovaným zastavením vřetene a odjezdem od stěny (Q214, Q336).', 'CYCL DEF 202 BORING\nCYCL CALL'),
  ref('203', 'CYCL DEF 203 UNIVERSAL DRILLING', 'Univerzální vrtání – lom třísky (Q213), snižování přísuvu (Q212).', 'CYCL DEF 203 UNIVERSAL DRILLING\nCYCL CALL'),
  ref('205', 'CYCL DEF 205 UNIVERSAL PECKING', 'Hluboké vrtání s vyjížděním a odvodem třísek.', 'CYCL DEF 205 UNIVERSAL PECKING\nCYCL CALL'),
  ref('206', 'CYCL DEF 206 TAPPING NEW', 'Vrtání závitů s vyrovnávací hlavou (floating).', 'CYCL DEF 206 TAPPING NEW\nCYCL CALL'),
  ref('207', 'CYCL DEF 207 RIGID TAPPING NEW', 'Tuhé závitování – synchronizace vřetene a osy.', 'CYCL DEF 207 RIGID TAPPING NEW\nCYCL CALL'),
  ref('209', 'CYCL DEF 209 TAPPING W/ CHIP BREAKING', 'Závitování s lomem třísky (tuhé).', 'CYCL DEF 209 TAPPING W/ CHIP BREAKING\nCYCL CALL'),
  ref('7', 'CYCL DEF 7.0 DATUM SHIFT\nCYCL DEF 7.1 Z..', 'Posunutí nulového bodu v daném programu (Cyklus 7). Zrušení: posun o 0.', 'CYCL DEF 7.0 DATUM SHIFT\nCYCL DEF 7.1 Z-50'),
  ref('8', 'CYCL DEF 8.0 MIRROR IMAGE', 'Zrcadlení kontury podle osy.', 'CYCL DEF 8.0 MIRROR IMAGE\nCYCL DEF 8.1 X'),
  ref('10', 'CYCL DEF 10.0 ROTATION', 'Otočení souřadného systému o úhel.', 'CYCL DEF 10.0 ROTATION\nCYCL DEF 10.1 ROT+45'),
  ref('11', 'CYCL DEF 11.0 SCALING', 'Změna měřítka kontury.', 'CYCL DEF 11.0 SCALING\nCYCL DEF 11.1 SCL0.75'),
  ref('247', 'CYCL DEF 247 DATUM SETTING', 'Nastavení vztažného bodu z tabulky Preset.', 'CYCL DEF 247 DATUM SETTING\n  Q339=1 ;DATUM NUMBER'),
  ref('800', 'CYCL DEF 800 ADJUST XZ SYSTEM', 'Soustružení – přizpůsobení souřadného systému (úhel nástroje, orientace, přesun). Zapíná se po FUNCTION MODE TURN.', 'CYCL DEF 800 ADJUST XZ SYSTEM\nCYCL CALL'),
  ref('801', 'CYCL DEF 801 RESET ROTARY COORDINATE SYSTEM', 'Zruší natočení souřadného systému z cyklu 800.', 'CYCL DEF 801 RESET ROTARY COORDINATE SYSTEM'),
  ref('810', 'CYCL DEF 810 TURN CONTOUR LONGITUDINAL', 'Podélné hrubování / dokončení podle kontury (ze souboru nebo CONTOUR TURNING).', 'CYCL DEF 810 TURN CONTOUR LONGITUDINAL\nCYCL CALL'),
  ref('811', 'CYCL DEF 811 SHOULDER, LONGITUDINAL', 'Jednoduchý osazený hřídel – podélné soustružení.', 'CYCL DEF 811 SHOULDER, LONGITUDINAL\nCYCL CALL'),
  ref('812', 'CYCL DEF 812 SHOULDER, LONG. EXT.', 'Rozšířená verze 811 (úkosy, zaoblení, přídavky).', 'CYCL DEF 812 SHOULDER, LONG. EXT.\nCYCL CALL'),
  ref('813', 'CYCL DEF 813 TURN PLUNGE LONGITUDINAL', 'Zapichovací soustružení podélně (rozběhy po hrubování).', 'CYCL DEF 813 TURN PLUNGE LONGITUDINAL\nCYCL CALL'),
  ref('814', 'CYCL DEF 814 TURN PLUNGE LONG. EXT.', 'Rozšířená verze 813.', 'CYCL DEF 814 TURN PLUNGE LONG. EXT.\nCYCL CALL'),
  ref('815', 'CYCL DEF 815 CONTOUR-PARALLEL TURNING', 'Hrubování rovnoběžně s konturou (pro odlitky, výkovky).', 'CYCL DEF 815 CONTOUR-PARALLEL TURNING\nCYCL CALL'),
  ref('820', 'CYCL DEF 820 TURN CONTOUR TRANSVERSE', 'Čelní hrubování / dokončení podle kontury.', 'CYCL DEF 820 TURN CONTOUR TRANSVERSE\nCYCL CALL'),
  ref('821', 'CYCL DEF 821 SHOULDER, TRANSVERSE', 'Jednoduché čelní soustružení osazení.', 'CYCL DEF 821 SHOULDER, TRANSVERSE\nCYCL CALL'),
  ref('823', 'CYCL DEF 823 TURN PLUNGE TRANSVERSE', 'Čelní zapichovací soustružení.', 'CYCL DEF 823 TURN PLUNGE TRANSVERSE\nCYCL CALL'),
  ref('830', 'CYCL DEF 830 THREAD CONTOUR-PARALLEL', 'Závit rovnoběžný s konturou.', 'CYCL DEF 830 THREAD CONTOUR-PARALLEL\nCYCL CALL'),
  ref('831', 'CYCL DEF 831 THREAD LONGITUDINAL', 'Podélný závit (válcový nebo kuželový) – stoupání, hloubka, počet průchodů.', 'CYCL DEF 831 THREAD LONGITUDINAL\nCYCL CALL'),
  ref('832', 'CYCL DEF 832 THREAD EXTENDED', 'Rozšířený závit (výběh, nájezd, zmenšování přísuvu).', 'CYCL DEF 832 THREAD EXTENDED\nCYCL CALL'),
  ref('840', 'CYCL DEF 840 RECESSING RADIAL', 'Radiální zápich (obecný).', 'CYCL DEF 840 RECESSING RADIAL\nCYCL CALL'),
  ref('850', 'CYCL DEF 850 RECESSING AXIAL', 'Axiální (čelní) zápich.', 'CYCL DEF 850 RECESSING AXIAL\nCYCL CALL'),
  ref('860', 'CYCL DEF 860 CONTOUR RECESSING RADIAL', 'Radiální zápich podle kontury.', 'CYCL DEF 860 CONTOUR RECESSING RADIAL\nCYCL CALL'),
  ref('870', 'CYCL DEF 870 CONTOUR RECESSING AXIAL', 'Axiální zápich podle kontury.', 'CYCL DEF 870 CONTOUR RECESSING AXIAL\nCYCL CALL')
];

export const hhExamples = [
  {
    title: 'ISO program – hlavička a konec (podobně jako generuje SKICA)',
    code: `G18 ; Rovina ZX
G90 ; Absolutní
G71 ; Metrický systém
G54 ; Nulový bod
G96 S200 M3 ; Řezná rychlost
T1 M6 ; Nástroj
M8
G00 X100 Z2
...
M9
M5
M30`,
    notes: [
      'G18 – rovina ZX pro soustruh',
      'G96 S200 – konstantní řezná rychlost 200 m/min',
      'Směr X (průměr / poloměr) určuje strojní parametr'
    ]
  },
  {
    title: 'Klartext – podélné soustružení s obloukem',
    code: `0 BEGIN PGM HRIDEL MM
1 FUNCTION MODE TURN "SOUSTRUH"
2 TOOL CALL 1 Z S1500
3 L X+62 Z+2 R0 FMAX M3
4 L X+0 Z+0 RR F0.15
5 L X+30
6 L Z-20
7 CR X+46 Z-30 R+10 DR-
8 L Z-45
9 L X+62 R0 FMAX
10 L X+100 Z+100 R0 FMAX M30
11 END PGM HRIDEL MM`,
    notes: [
      'FUNCTION MODE TURN – přepnutí do soustružnického režimu',
      'RR – korekce poloměru vpravo, R0 ji vypíná',
      'CR … DR- – oblouk po směru hodin o poloměru 10 mm (DR+ = proti)',
      'Hodnoty X jsou ve zvoleném zápisu průměr/poloměr podle stroje'
    ]
  },
  {
    title: 'Vrtání – cyklus 200 a vyvolání',
    code: `5 TOOL CALL 2 Z S800
6 L X+0 Z+5 R0 FMAX M3
7 CYCL DEF 200 DRILLING
  Q200=2 ;SET-UP CLEARANCE
  Q201=-30 ;DEPTH
  Q206=100 ;FEED RATE FOR PLUNGING
  Q202=5 ;PLUNGING DEPTH
  Q210=0 ;DWELL TIME AT TOP
  Q203=+0 ;SURFACE COORDINATE
  Q204=50 ;2ND SET-UP CLEARANCE
  Q211=0.2 ;DWELL TIME AT DEPTH
8 CYCL CALL`,
    notes: [
      'Q201 – hloubka (záporná, měřeno od povrchu Q203)',
      'Q206 – posuv při zanoření, Q202 – hloubka jednoho přísuvu',
      'Vyvolání cyklu: CYCL CALL (v ISO G79)'
    ]
  },
  {
    title: 'Q-parametry – počítadlo a podmínka',
    code: `FN 0: Q1 = +0
LBL 1
; ... obrobení jednoho kusu ...
FN 1: Q1 = +Q1 + +1
FN 12: IF +Q1 LT +5 GOTO LBL 1
M30`,
    notes: [
      'FN 0 – přiřazení počáteční hodnoty',
      'FN 1 – přičtení 1',
      'FN 12 – skok zpět na LBL 1, dokud je Q1 < 5'
    ]
  },
  {
    title: 'Opakování části programu – odběry (LBL + REP)',
    code: `3 L X+50 Z+2 R0 FMAX
4 LBL 1
5 L IX-2 F0.2
6 L Z-30
7 L IX+1 FMAX
8 L Z+2 FMAX
9 L IX-1 FMAX
10 CALL LBL 1 REP4
11 L X+100 Z+100 R0 FMAX M30`,
    notes: [
      'Část mezi LBL 1 a CALL LBL 1 proběhne 1× + 4× opakování = 5×',
      'IX – přírůstková souřadnice; odjezd IX+1 a návrat IX-1 → každý průchod začne o 2 níž',
      'Průchody na X48, 46, 44, 42, 40 (hodnoty X dle zápisu průměr/poloměr stroje)'
    ]
  }
];
