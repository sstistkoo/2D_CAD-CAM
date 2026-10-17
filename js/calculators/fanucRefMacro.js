import { ref } from './ctrlRefViewer.js';

// ── Fanuc – Custom Macro B (proměnné, řízení toku, funkce) a ukázky ──

export const fanucMacroGroups = {
  'Typy proměnných': ['#0', '#1–#33', '#100–#199', '#500–#999', '#1000+'],
  'Systémové proměnné': ['#3000', '#3001–#3002', '#3006', '#3011–#3012', '#4001–#4120', '#5001–#5002', '#5021–#5022', '#5041–#5042', '#5221–#5222'],
  'Řízení toku': ['IF GOTO', 'IF THEN', 'WHILE DO', 'GOTO'],
  'Operátory a funkce': ['Porovnání', 'Aritmetika', 'Funkce', 'Zaokrouhlení', 'Závorky'],
  'Volání maker': ['G65 argumenty']
};

export const fanucMacroItems = [
  ref('#0', '#0', 'Vždy prázdná proměnná (<vacant>) – nelze do ní zapisovat.', '#1 = #0', '#1 bude prázdná'),
  ref('#1–#33', '#1 … #33', 'LOKÁLNÍ proměnné – platí jen v daném makru, při volání G65 se do nich naplní argumenty. Po skončení makra zanikají.', '#10 = #1 + #2'),
  ref('#100–#199', '#100 … #199', 'Společné proměnné – po vypnutí stroje se VYMAŽOU.', '#100 = 0'),
  ref('#500–#999', '#500 … #999', 'Společné proměnné – po vypnutí ZŮSTÁVAJÍ (počítadla kusů, naměřené hodnoty).', '#500 = #500 + 1', 'Počítadlo kusů'),
  ref('#1000+', '#1000 …', 'Systémové proměnné – čtou nebo zapisují stav řízení (signály, korekce, polohy, čas).', '#3006 = 1'),
  ref('#3000', '#3000 = n (ZPRÁVA)', 'Vyvolá alarm č. 3000+n se zadanou zprávou v závorkách – program se zastaví.', '#3000 = 1 (CHYBA NASTAVENI)'),
  ref('#3001–#3002', '#3001, #3002', 'Časovače: #3001 v ms (od zapnutí), #3002 v hodinách (běh cyklu). Čtou se i zapisují.', '#3002 = 0\n…\nIF [#3002 GT 8] GOTO 90'),
  ref('#3006', '#3006 = 1 (ZPRÁVA)', 'Zastaví program se zprávou operátorovi (bez alarmu) – po START pokračuje.', '#3006 = 1 (ZMER PRUMER)', 'Zpráva v závorkách, velkými písmeny'),
  ref('#3011–#3012', '#3011, #3012', 'Aktuální datum (RRRRMMDD) a čas (HHMMSS).', '#100 = #3011', 'Např. 20261017'),
  ref('#4001–#4120', '#4001 …', 'Modální informace předchozího bloku (např. #4001 = G z 1. skupiny, #4109 = F, #4119 = S).', 'IF [#4001 EQ 1] GOTO 10', 'Zjištění, zda byl aktivní G01'),
  ref('#5001–#5002', '#5001 (X), #5002 (Z)', 'Koncová poloha předchozího bloku (v souřadnicích obrobku).', '#101 = #5002'),
  ref('#5021–#5022', '#5021 (X), #5022 (Z)', 'Aktuální poloha v souřadnicích stroje.', '#102 = #5021'),
  ref('#5041–#5042', '#5041 (X), #5042 (Z)', 'Aktuální poloha v souřadnicích obrobku (po zohlednění posunutí).', '#103 = #5042'),
  ref('#5221–#5222', '#5221 (X), #5222 (Z)', 'Posunutí nulového bodu G54 (další systémy po 20: G55 = #5241, G56 = #5261 …).', '#5222 = #5222 + 0.05', 'Korekce nulového bodu Z o 0,05'),
  ref('IF GOTO', 'IF [podmínka] GOTO n', 'Podmíněný skok na blok N(n). Podmínka v hranatých závorkách.', 'IF [#1 GT 10.] GOTO 100\nG01 X20.\nN100 G00 X100.'),
  ref('IF THEN', 'IF [podmínka] THEN #n = výraz', 'Podmíněné přiřazení – po THEN smí být jen přiřazení proměnné.', 'IF [#2 EQ #0] THEN #2 = 5.', 'Výchozí hodnota, když parametr nebyl zadán'),
  ref('WHILE DO', 'WHILE [podmínka] DOm … ENDm', 'Cyklus – opakuje bloky, dokud podmínka platí. m = 1–3 (identifikátor, lze vnořovat).', '#1 = 0\nWHILE [#1 LT 5] DO1\n  G01 Z[-2.*#1] F0.2\n  #1 = #1 + 1\nEND1'),
  ref('GOTO', 'GOTO n', 'Nepodmíněný skok na blok N(n).', 'GOTO 50'),
  ref('Porovnání', 'EQ  NE  GT  LT  GE  LE', 'Rovno, nerovno, větší, menší, větší nebo rovno, menší nebo rovno. Vždy v [ ].', 'IF [#1 GE 3] GOTO 20'),
  ref('Aritmetika', '+  −  *  /   AND  OR  XOR', 'Základní operace a bitové logické. Dělení nulou → alarm.', '#5 = #1 * 2 + #2 / 4'),
  ref('Funkce', 'SIN COS TAN ATAN SQRT ABS LN EXP', 'Goniometrické funkce ve STUPNÍCH (SIN[30.]). ATAN[a]/[b] = úhel; SQRT = odmocnina.', '#6 = SQRT[#1*#1 + #2*#2]\n#7 = ATAN[#2]/[#1]'),
  ref('Zaokrouhlení', 'ROUND FIX FUP BIN BCD', 'ROUND = zaokrouhlí, FIX = zahodí desetinnou část dolů, FUP = nahoru. BIN/BCD převody čísel pro PMC.', '#8 = FIX[#1]\n#9 = FUP[2.1]', 'FUP[2.1] = 3'),
  ref('Závorky', '[ ]', 'Ve výrazech Fanuc používá JEN hranaté závorky – kulaté jsou komentář.', 'G01 X[#1+10.] F0.2'),
  ref('G65 argumenty', 'A=#1 B=#2 C=#3 D=#7 E=#8 F=#9 H=#11 I=#4 J=#5 K=#6 M=#13 Q=#17 R=#18 S=#19 T=#20 U=#21 V=#22 W=#23 X=#24 Y=#25 Z=#26', 'Přiřazení písmen argumentů proměnným (zápis I). G, L, N, O, P se jako argument použít nedají.', 'G65 P9010 A5. B10. X20.', '#1 = 5, #2 = 10, #24 = 20')
];

export const fanucExamples = [
  {
    title: 'Hlavička a konec programu (podobná, jakou generuje SKICA)',
    code: `O1000 (SOUSTRUH)
G21 (metricky vstup)
G40 (zruseni korekce)
G99 (posuv mm/ot)
G18 (rovina ZX)
G28 U0 W0 (reference)
G50 S2000 (max otacky)
G96 S200 M3 (konst. rezna rychlost)
T0101 (nastroj 1 / korekce 1)
M8 (chlazeni)
...
M9
M5
G28 U0 W0
M30`,
    notes: [
      'O1000 – číslo programu; komentáře jsou v kulatých závorkách bez diakritiky',
      'G50 S – horní mez otáček pro G96',
      'T0101 – nástroj 01, korekce 01 (T + 2 číslice nástroj + 2 číslice korekce)',
      'G28 U0 W0 – odjezd do referenčního bodu (U/W = přírůstkově)'
    ]
  },
  {
    title: 'Hrubování G71 + dokončení G70',
    code: `T0101
G96 S200 M3
G00 X62. Z2.
G71 U2. R0.5
G71 P100 Q200 U0.5 W0.1 F0.25
N100 G00 X20.
G01 Z0. F0.1
X30. Z-5.
Z-30.
X50.
Z-45.
N200 X60.
G70 P100 Q200 F0.1
G28 U0 W0
M30`,
    notes: [
      'G71 U2. – přísuv 2 mm na poloměr, R0.5 – odskok',
      'U0.5 W0.1 – přídavek na dokončení (X na průměr, Z)',
      'F v bloku G71 platí při hrubování; F v blocích kontury se ignoruje',
      'G70 – dokončí stejnou konturu bez přídavků'
    ]
  },
  {
    title: 'Závit M20×2,5 cyklem G76',
    code: `T0303
G97 S600 M3
G00 X24. Z5.
G76 P031060 Q100 R0.05
G76 X16.752 Z-30. P1624 Q400 F2.5
G00 X100. Z100.`,
    notes: [
      'P031060 – 3 dočišťovací průchody, výběh 1,0×stoupání, úhel 60°',
      'Q100 – minimální přísuv 0,1 mm (µm, bez tečky)',
      'X16.752 – průměr dna: 20 − 2 × 1,624',
      'P1624 – výška profilu 1,624 mm, Q400 – 1. přísuv 0,4 mm'
    ]
  },
  {
    title: 'Drážka G75 (více drážek)',
    code: `T0505
G97 S500 M3
G00 X52. Z-20.
G75 R0.5
G75 X40. Z-40. P2000 Q5000 F0.08
G00 X100. Z100.`,
    notes: [
      'Břit 3 mm; P – přísuv v X na poloměr (µm), Q – posun v Z mezi drážkami (µm)',
      'Z Ø52 na Ø40 = 6 mm na poloměr → tři přísuvy po 2 mm',
      'Drážky po 5 mm od Z-20 do Z-40 (pět drážek)'
    ]
  },
  {
    title: 'Podprogram M98 – opakované odběry',
    code: `O1000
G00 X50. Z2.
M98 P1001 L4
G00 X100. Z100.
M30

O1001
G01 U-2. F0.2
W-32.
G00 U1.
W32.
U-1.
M99`,
    notes: [
      'L4 – podprogram proběhne čtyřikrát: Ø48, 46, 44, 42 do Z-30',
      'U/W = přírůstkově; v G-kódovém systému A NENÍ G91 a G90 je soustružnický cyklus',
      'Odjezd U1. a návrat U-1. → každý průchod začíná na průměru, kde skončil předchozí',
      'M99 – návrat do hlavního programu'
    ]
  },
  {
    title: 'Makro: počítadlo kusů a hlášení',
    code: `#500 = #500 + 1
IF [#500 LT 50] GOTO 10
#3006 = 1 (VYMENIT NASTROJ)
#500 = 0
N10 M30`,
    notes: [
      '#500 přežije vypnutí stroje (počítadlo kusů)',
      '#3006 zastaví program se zprávou, po START se pokračuje'
    ]
  }
];
