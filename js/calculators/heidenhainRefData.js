import { ref } from './ctrlRefViewer.js';

// ── Heidenhain TNC 640 – Klartext, ISO G-kódy a M funkce ────────
// TNC 640 umí Klartext (dialog) i ISO (G-kódy). SKICA generuje ISO variantu.
// Soustružení vyžaduje volbu „Turning“ a FUNCTION MODE TURN; značení os,
// průměr × poloměr v X a doplňkové M funkce určuje výrobce stroje.

export const hhKlartextGroups = {
  'Struktura programu': ['BEGIN PGM', 'END PGM', 'BLK FORM', 'TOOL CALL', 'TOOL DEF', 'FUNCTION MODE', 'FUNCTION TURNDATA'],
  'Přímky a oblouky': ['L', 'CC', 'C', 'CR', 'CT', 'CHF', 'RND'],
  'Korekce a posuv': ['R0 / RL / RR', 'F / FMAX', 'M'],
  'Nájezd a odjezd': ['APPR', 'DEP'],
  'Podprogramy': ['LBL', 'CALL LBL', 'CALL PGM', 'STOP']
};

export const hhKlartextItems = [
  ref('BEGIN PGM', '0 BEGIN PGM název MM|INCH', 'Začátek programu: název a jednotky (MM / INCH). Jednotky platí pro celý program.', '0 BEGIN PGM HRIDEL MM'),
  ref('END PGM', 'n END PGM název MM|INCH', 'Konec programu – musí mít stejný název a jednotky jako BEGIN PGM.', '99 END PGM HRIDEL MM'),
  ref('BLK FORM', 'BLK FORM 0.1 Z X.. Y.. Z..\nBLK FORM 0.2 X.. Y.. Z..', 'Definice polotovaru (dva protilehlé rohy kvádru) pro grafickou simulaci. Při soustružení se polotovar zadává i konturou.', '1 BLK FORM 0.1 Z X-30 Y-30 Z-50\n2 BLK FORM 0.2 X+30 Y+30 Z+0'),
  ref('TOOL CALL', 'TOOL CALL číslo Z S.. F..', 'Vyvolání nástroje. Z = osa nástroje, S = otáčky vřetena (nebo řezná rychlost VC), F = posuv.', 'TOOL CALL 1 Z S1500', 'Výměna nástroje + zapnutí otáček přes M3/M4'),
  ref('TOOL DEF', 'TOOL DEF číslo', 'Předvolba dalšího nástroje – zásobník ho připraví předem, výměna při TOOL CALL je pak rychlejší.', 'TOOL DEF 2'),
  ref('FUNCTION MODE', 'FUNCTION MODE TURN "název kinematiky"\nFUNCTION MODE MILL', 'Přepíná řízení mezi soustružnickým a frézovacím režimem. Pro soustružení nutná opce Turning a odpovídající kinematika stroje.', 'FUNCTION MODE TURN "SOUSTRUH"'),
  ref('FUNCTION TURNDATA', 'FUNCTION TURNDATA SPIN VCONST:ON VC.. | VCONST:OFF S..', 'Nastavení otáček při soustružení: VCONST:ON = konstantní řezná rychlost (VC v m/min), OFF = konstantní otáčky. Přesný tvar a mez otáček viz manuál ve vaší SW verzi.', 'FUNCTION TURNDATA SPIN VCONST:ON VC200'),
  ref('L', 'L X.. Z.. R0|RL|RR F.. M..', 'Přímka (Line). Souřadnice absolutně, přírůstkově předponou I (IX, IZ). Posuv F nebo FMAX (rychloposuv).', 'L X+40 Z+2 R0 FMAX\nL Z-30 F0.2', 'Najet rychloposuvem, pak podélný řez'),
  ref('CC', 'CC X.. Z..', 'Střed kružnice (Circle Center) – předchází C a CP. Bez souřadnic = poslední poloha.', 'CC X+30 Z-10'),
  ref('C', 'C X.. Z.. DR+|DR-', 'Kruhová dráha kolem posledního CC. DR- = po směru hodin, DR+ = proti směru hodin.', 'CC X+30 Z-10\nC X+50 Z-20 DR-'),
  ref('CR', 'CR X.. Z.. R+.. DR+|DR-', 'Kruh zadaný poloměrem. R+ = oblouk menší než 180°, R- = větší než 180°. DR- = po směru hodin, DR+ = proti.', 'CR X+50 Z-20 R+10 DR-'),
  ref('CT', 'CT X.. Z..', 'Kruh s tečným napojením na předchozí prvek.', 'L Z-10\nCT X+40 Z-20'),
  ref('CHF', 'CHF délka', 'Sražení rohu mezi dvěma přímkami; zadává se délka sražení.', 'L Z-30\nCHF 1.5\nL X+60'),
  ref('RND', 'RND R..', 'Zaoblení rohu mezi dvěma prvky (tečné napojení).', 'L Z-30\nRND R2\nL X+60'),
  ref('R0 / RL / RR', 'R0 | RL | RR', 'Korekce poloměru: R0 žádná, RL nástroj vlevo od dráhy, RR vpravo (ve směru pohybu).', 'L X+40 Z+2 RR F0.2', 'Zapnutí korekce na nájezdu'),
  ref('F / FMAX', 'F.. | FMAX | F AUTO', 'Posuv: číslo = mm/ot při soustružení (mm/min při frézování), FMAX = rychloposuv, F AUTO = z TOOL CALL.', 'L X+0 F0.15'),
  ref('M', 'M3 | M4 | M5 | M8 | M9 | M30', 'Doplňkové funkce, lze je připsat k libovolné větě (viz záložka M funkce).', 'L Z+2 R0 FMAX M3'),
  ref('APPR', 'APPR LT|LCT|LN|CT X.. Z.. R.. RL|RR F..', 'Měkký nájezd na kontura: LT = přímka tečná, LCT = přímka + oblouk, LN = kolmo, CT = oblouk.', 'APPR LCT X+20 Z+0 R2 RR F0.2'),
  ref('DEP', 'DEP LT|LCT|LN|CT X.. Z.. R.. F..', 'Měkký odjezd od kontury (stejné varianty jako APPR).', 'DEP LCT X+60 Z-45 R2 F0.2'),
  ref('LBL', 'LBL číslo | LBL 0', 'Návěští podprogramu nebo opakované části. LBL 0 uzavírá podprogram.', '10 LBL 1\n…\n20 LBL 0'),
  ref('CALL LBL', 'CALL LBL číslo REP počet', 'Volání podprogramu / opakování části; REP = kolikrát znovu.', 'CALL LBL 1 REP3'),
  ref('CALL PGM', 'CALL PGM "cesta\\soubor.h"', 'Vyvolání jiného programu jako podprogramu.', 'CALL PGM "TNC:\\SOUSTRUH\\UPICH.H"'),
  ref('STOP', 'STOP', 'Programový stop – zastaví program (stejně jako M0).', 'STOP')
];

export const hhIsoGroups = {
  'Pohyby': ['G00', 'G01', 'G02', 'G03', 'G04', 'G24', 'G25'],
  'Rovina a režim': ['G17–G19', 'G70', 'G71', 'G90', 'G91'],
  'Korekce': ['G40', 'G41', 'G42'],
  'Struktura': ['G98', 'G99', 'G79', 'T']
};

export const hhIsoItems = [
  ref('G00', 'G00 X.. Z..', 'Rychloposuv.', 'G00 X100 Z2'),
  ref('G01', 'G01 X.. Z.. F..', 'Lineární interpolace pracovním posuvem.', 'G01 Z-30 F0.2'),
  ref('G02', 'G02 X.. Z.. R..\nG02 X.. Z.. I.. K..', 'Kruh po směru hodin. Zadání poloměrem R, nebo středem I, J, K – u Heidenhain ISO je střed jako CC (absolutně, ne přírůstkově od začátku jako u Fanucu); ověř v manuálu.', 'G02 X60 Z-20 R10 F0.15'),
  ref('G03', 'G03 X.. Z.. R..\nG03 X.. Z.. I.. K..', 'Kruh proti směru hodin.', 'G03 X40 Z-20 R10 F0.15'),
  ref('G04', 'G04 F..', 'Prodleva v sekundách (u Heidenhainu značí F čas, ne posuv).', 'G04 F2'),
  ref('G24', 'G24 R..', 'Sražení rohu (Chamfer) mezi dvěma bloky; R = délka sražení.', 'G01 Z-30\nG24 R1.5\nG01 X60'),
  ref('G25', 'G25 R..', 'Zaoblení rohu (Rounding) mezi dvěma bloky.', 'G01 Z-30\nG25 R2\nG01 X60'),
  ref('G17–G19', 'G17 | G18 | G19', 'Volba roviny (G17 XY, G18 ZX, G19 YZ). Soustruh pracuje v rovině ZX = G18.', 'G18'),
  ref('G70', 'G70', 'Palcové jednotky.', 'G70'),
  ref('G71', 'G71', 'Metrické jednotky (mm).', 'G71'),
  ref('G90', 'G90', 'Absolutní programování.', 'G90'),
  ref('G91', 'G91', 'Přírůstkové programování.', 'G91'),
  ref('G40', 'G40', 'Zrušení korekce poloměru.', 'G40 G00 X100'),
  ref('G41', 'G41', 'Korekce poloměru vlevo od dráhy.', 'G41 G01 X20 Z0 F0.1'),
  ref('G42', 'G42', 'Korekce poloměru vpravo od dráhy.', 'G42 G01 X20 Z0 F0.1'),
  ref('G98', 'G98 L číslo', 'Návěští (v Klartextu LBL). G98 L0 uzavírá podprogram. Volání v ISO zápisem L číslo,opakování (např. L1,0) – ověř v manuálu.', 'G98 L1\n…\nG98 L0'),
  ref('G99', 'G99 T.. L.. R..', 'Definice nástroje v programu (ISO ekvivalent TOOL DEF): číslo, délka, poloměr.', 'G99 T1 L+0 R+0.4'),
  ref('G79', 'G79', 'Vyvolání cyklu definovaného G2xx (ISO ekvivalent CYCL CALL).', 'G200 Q200=2 Q201=-20 Q206=150 Q202=5\nG79'),
  ref('T', 'T číslo G17 S..', 'Vyvolání nástroje v ISO: T1 G17 S1500 (ekvivalent TOOL CALL).', 'T1 G17 S1500')
];

export const hhMGroups = {
  'Program': ['M0', 'M1', 'M2', 'M30', 'M99'],
  'Vřeteno': ['M3', 'M4', 'M5', 'M19'],
  'Chlazení': ['M8', 'M9'],
  'Souřadnice a dráha': ['M91', 'M92', 'M89', 'M126', 'M140']
};

export const hhMItems = [
  ref('M0', 'M0', 'Zastavení programu (vřeteno a chlazení se vypnou, pokračuje se tlačítkem START).', 'L Z+100 R0 FMAX M0'),
  ref('M1', 'M1', 'Podmíněné zastavení – jen při zapnutém „Optional Stop“.', 'M1'),
  ref('M2', 'M2', 'Zastavení programu + vypnutí vřetene a chlazení, bez návratu na začátek.', 'M2'),
  ref('M30', 'M30', 'Konec programu s návratem na začátek (vypne vřeteno i chlazení).', 'M30'),
  ref('M99', 'M99', 'Vyvolání cyklu po bloku (cyklus se provede v této větě). Dnes nahrazeno CYCL CALL / G79.', 'L X+20 Z+2 R0 FMAX M99'),
  ref('M3', 'M3', 'Vřeteno po směru hodin.', 'TOOL CALL 1 Z S1500\nL Z+2 R0 FMAX M3'),
  ref('M4', 'M4', 'Vřeteno proti směru hodin.', 'M4'),
  ref('M5', 'M5', 'Zastavení vřetene.', 'M5'),
  ref('M19', 'M19', 'Orientace vřetene (polohování na zadaný úhel).', 'M19'),
  ref('M8', 'M8', 'Chlazení zapnout.', 'M8'),
  ref('M9', 'M9', 'Chlazení vypnout.', 'M9'),
  ref('M91', 'M91', 'Souřadnice se vztahují k nulovému bodu STROJE (v této větě).', 'L X+0 Z+0 R0 FMAX M91'),
  ref('M92', 'M92', 'Souřadnice se vztahují k pevné pozici stanovené výrobcem (např. výměna nástroje).', 'L Z+0 R0 FMAX M92'),
  ref('M89', 'M89', 'Volitelná funkce výrobce stroje; v zápisu CYCL CALL M89 = cyklus se vyvolá po každém pohybu.', 'CYCL CALL M89'),
  ref('M126', 'M126', 'Rotační osy se pohybují po nejkratší dráze (reduce 360°).', 'M126'),
  ref('M140', 'M140 MB..', 'Odjezd od kontury ve směru osy nástroje o MB mm.', 'L Z+0 R0 F500 M140 MB50')
];
