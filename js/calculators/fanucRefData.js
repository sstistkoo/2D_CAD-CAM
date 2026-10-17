import { ref } from './ctrlRefViewer.js';

// ── Fanuc 0i/31i-T (soustruh) – G a M kódy ──────────────────
// G-kódový systém A (výchozí u soustruhů): absolutní/přírůstkově se rozlišuje
// adresou (X/Z = absolutně, U/W = přírůstkově), G90/G92/G94 jsou CYKLY.
// Systémy B/C mají G90/G91 a jiná čísla – záleží na parametru 3401/3402.
// X se programuje v PRŮMĚRU (parametr 1006 bit 3), I v oblouku v POLOMĚRU.

export const fanucGGroups = {
  'Pohyby a interpolace': ['G00', 'G01', 'G02', 'G03', 'G04', 'G09', ',C / ,R', 'G12.1', 'G13.1', 'G107'],
  'Rovina a jednotky': ['G18', 'G20', 'G21'],
  'Posuv a otáčky': ['G96', 'G97', 'G98', 'G99'],
  'Referenční body': ['G27', 'G28', 'G30'],
  'Souřadné systémy': ['G50', 'G52', 'G53', 'G54–G59'],
  'Korekce poloměru': ['G40', 'G41', 'G42'],
  'Závity': ['G32', 'G34', 'G92', 'G76'],
  'Cykly obrábění': ['G90', 'G94', 'G70', 'G71', 'G72', 'G73', 'G74', 'G75'],
  'Vrtací cykly': ['G80', 'G83', 'G84', 'G85', 'G87', 'G88', 'G89'],
  'Makra': ['G65', 'G66', 'G67']
};

export const fanucGItems = [
  ref('G00', 'G00 X(U).. Z(W)..', 'Rychloposuv. Nepřímka – každá osa jede svou rychlostí (záleží na parametru 1401 bit 1).', 'G00 X100. Z2.', 'Najetí nad obrobek'),
  ref('G01', 'G01 X(U).. Z(W).. F..', 'Lineární interpolace pracovním posuvem.', 'G99\nG01 Z-50. F0.2', 'Podélné soustružení, 0.2 mm/ot'),
  ref('G02', 'G02 X(U).. Z(W).. R.. F..\nG02 X(U).. Z(W).. I.. K.. F..', 'Kruhová interpolace po směru hodin. I je ve směru X v POLOMĚRU (nikoliv průměru), K ve směru Z.', 'G00 X40. Z0.\nG02 X60. Z-10. R10. F0.15', 'Oblouk R10 po směru hodin'),
  ref('G03', 'G03 X(U).. Z(W).. R.. F..\nG03 X(U).. Z(W).. I.. K.. F..', 'Kruhová interpolace proti směru hodin.', 'G03 X40. Z-10. R10. F0.15', 'Oblouk proti směru hodin'),
  ref('G04', 'G04 X.. | G04 U.. | G04 P..', 'Prodleva. X nebo U v sekundách (desetinná tečka), P v milisekundách (celé číslo).', 'G04 X1.5\nG04 P1500', 'Obě řádky dělají totéž – 1,5 s'),
  ref('G09', 'G09 G01 X.. Z..', 'Přesné zastavení na konci bloku (jednorázové, jen v tomto bloku).', 'G09 G01 Z-30. F0.1', 'Přesné dojetí do rohu'),
  ref(',C / ,R', 'G01 X.. Z.. ,C..\nG01 X.. Z.. ,R..', 'Automatické sražení (,C) nebo zaoblení (,R) rohu mezi dvěma bloky. Čárka před písmenem je povinná.', 'G01 Z-30. ,C1.5 F0.2\nX60.', 'Sražení 1,5 mm v rohu mezi Z-30 a X60'),
  ref('G12.1', 'G12.1', 'Zapnutí polární interpolace (frézování na čele soustruhu osami X a C). Zrušení G13.1.', 'G12.1\nG01 X40. C0. F100.\nG13.1', 'Vyžaduje volbu polární interpolace'),
  ref('G13.1', 'G13.1', 'Zrušení polární interpolace.', 'G13.1'),
  ref('G107', 'G107 C.. | G07.1 C..', 'Válcová interpolace (frézování drážek na plášti – osa C se rozvine do roviny). Zrušení G107 C0.', 'G107 C25.\nG01 Z-10. C30. F100.\nG107 C0', 'C = poloměr válce'),
  ref('G18', 'G18', 'Rovina ZX – základní rovina soustruhu. (G17 = XY, G19 = YZ pro frézovací osy.)', 'G18'),
  ref('G20', 'G20', 'Palcový vstup.', 'G20'),
  ref('G21', 'G21', 'Metrický vstup (mm). Program má G21 mít vždy v hlavičce.', 'G21'),
  ref('G96', 'G96 S..', 'Konstantní řezná rychlost v m/min. Otáčky se mění s průměrem; horní mez zadává G50 S.', 'G50 S2000\nG96 S200 M3', '200 m/min, max. 2000 ot/min'),
  ref('G97', 'G97 S..', 'Konstantní otáčky vřetene (ot/min). Zrušení G96.', 'G97 S800 M3'),
  ref('G98', 'G98 F..', 'Posuv v mm/min. (Platí u G-kódového systému A.)', 'G98\nG01 X10. F120.'),
  ref('G99', 'G99 F..', 'Posuv v mm/ot – standard pro soustružení.', 'G99\nG01 Z-20. F0.2'),
  ref('G27', 'G27 X.. Z..', 'Kontrola návratu do referenčního bodu. Dojede na zadanou polohu a ověří, že je to referenční bod.', 'G27 X0. Z0.'),
  ref('G28', 'G28 U0 W0', 'Návrat do referenčního bodu přes mezibod. U0 W0 = mezibod je aktuální poloha, tedy jede přímo.', 'G28 U0\nG28 W0', 'Nejdřív X (aby nenarazil), pak Z'),
  ref('G30', 'G30 P2 U0 W0', 'Návrat do 2.–4. referenčního bodu (P2, P3, P4) – typicky bod pro výměnu nástroje.', 'G30 U0\nG30 W0'),
  ref('G50', 'G50 X.. Z..\nG50 S..', 'Nastavení souřadného systému (pozice nástroje = zadané hodnoty) NEBO horní mez otáček při G96 (ot/min).', 'G50 S2500\nG50 X200. Z100.', 'Na novějších řízeních se místo toho používá G54'),
  ref('G52', 'G52 X.. Z..', 'Lokální souřadný systém posunutý vůči pracovnímu. Zrušení G52 X0 Z0.', 'G52 Z-100.\nG52 Z0'),
  ref('G53', 'G53 X.. Z..', 'Najetí v souřadnicích stroje (nemodální, jen v tomto bloku).', 'G53 X300. Z300.'),
  ref('G54–G59', 'G54 … G59', 'Šest nastavitelných posunutí nulového bodu obrobku (hodnoty v tabulce Work). Více: G54.1 P1–P48.', 'G54\nG00 X100. Z2.'),
  ref('G40', 'G40', 'Zrušení korekce poloměru špičky nástroje (TNR).', 'G40 G00 X100.'),
  ref('G41', 'G41', 'Korekce poloměru vlevo od programované dráhy (ve směru pohybu). Typ špičky 0–9 v tabulce korekcí.', 'G41 G01 X20. Z0. F0.1', 'Nájezd s korekcí musí být delší než poloměr špičky'),
  ref('G42', 'G42', 'Korekce poloměru vpravo od dráhy – obvyklá pro vnější soustružení k ose Z−.', 'G42 G01 X20. Z0. F0.1'),
  ref('G32', 'G32 X(U).. Z(W).. F..', 'Řezání závitu s konstantním stoupáním; F = stoupání v mm. Každý průchod se programuje ručně (odjezd, zpět, nový X).', 'G00 X19.2 Z5.\nG32 Z-30. F2.5\nG00 X22.\nZ5.', 'První průchod M20×2,5'),
  ref('G34', 'G34 X(U).. Z(W).. F.. K..', 'Závit s proměnným stoupáním; K = přírůstek stoupání na otáčku.', 'G34 Z-40. F4. K0.1'),
  ref('G92', 'G92 X(U).. Z(W).. R.. F..', 'Cyklus závitu. X = průměr daného průchodu, Z = konec závitu, F = stoupání, R = kužel (0 = válcový). Opakuje se s menším X.', 'G00 X22. Z5.\nG92 X19.2 Z-30. F2.5\nX18.6\nX18.2', 'Tři průchody M20×2,5'),
  ref('G76', 'G76 P(m)(r)(a) Q.. R..\nG76 X.. Z.. R.. P.. Q.. F..', 'Víceprůchodový závitový cyklus. Dvě věty. m = počet dočišťovacích průchodů, r = výběh (×0,1 stoupání), a = úhel profilu závitu (80/60/55/30/29/0).', 'G76 P031060 Q100 R0.05\nG76 X16.752 Z-30. P1624 Q400 F2.5', 'M20×2,5: P1624 = hloubka závitu (µm), Q400 = první přísuv (µm)'),
  ref('G90', 'G90 X(U).. Z(W).. R.. F..', 'Cyklus podélného soustružení (válec/kužel). R = rozdíl poloměrů začátek–konec kuželu, R0 = válec.', 'G90 X48. Z-30. F0.2\nX46.\nX44.', 'Tři přísuvy po 1 mm na poloměr'),
  ref('G94', 'G94 X(U).. Z(W).. R.. F..', 'Cyklus čelního soustružení (plochý/kuželový záběr).', 'G94 X0. Z-2. F0.15\nZ-4.'),
  ref('G70', 'G70 P(ns) Q(nf)', 'Dokončovací cyklus po G71/G72/G73 – obrobí kontura mezi bloky N(ns) a N(nf) bez přídavků.', 'G70 P100 Q200 F0.1'),
  ref('G71', 'G71 U(Δd) R(e)\nG71 P(ns) Q(nf) U(Δu) W(Δw) F..', 'Podélný hrubovací cyklus. Δd = přísuv na poloměr, e = odskok, Δu = přídavek v X (průměr), Δw = přídavek v Z. Kontura mezi N(ns) a N(nf).', 'G71 U2. R0.5\nG71 P100 Q200 U0.5 W0.1 F0.25\nN100 G00 X20.\nG01 Z-30. F0.1\nX40. Z-40.\nN200 X60.', 'První blok kontury obsahuje jen X (typ I)'),
  ref('G72', 'G72 W(Δd) R(e)\nG72 P(ns) Q(nf) U.. W.. F..', 'Čelní hrubovací cyklus (řezy rovnoběžné s osou X).', 'G72 W2. R0.5\nG72 P100 Q200 U0.5 W0.1 F0.25'),
  ref('G73', 'G73 U(Δi) W(Δk) R(d)\nG73 P(ns) Q(nf) U.. W.. F..', 'Hrubování po obrysu (odlitky, výkovky). Δi, Δk = celkový přídavek v X (radiálně) a Z, d = počet průchodů.', 'G73 U5. W3. R3\nG73 P100 Q200 U0.5 W0.1 F0.25'),
  ref('G74', 'G74 R(e)\nG74 X(U).. Z(W).. P(Δi) Q(Δk) R(Δd) F..', 'Čelní zapichovací / hluboké vrtací cyklus s lomem třísky. Q = hloubka kroku v Z (µm, celé číslo).', 'G74 R1.\nG74 Z-40. Q5000 F0.1', 'Vrtání do hloubky 40 mm po 5 mm'),
  ref('G75', 'G75 R(e)\nG75 X(U).. Z(W).. P(Δi) Q(Δk) R(Δd) F..', 'Radiální zapichovací cyklus (drážky). P = krok v X (µm), Q = posun mezi drážkami v Z (µm).', 'G75 R0.5\nG75 X20. Z-30. P3000 Q4000 F0.08', 'Více drážek s roztečí 4 mm'),
  ref('G80', 'G80', 'Zrušení vrtacího cyklu.', 'G80'),
  ref('G83', 'G83 Z.. C.. R.. Q.. P.. F.. K.. M..', 'Čelní hluboké vrtání s vyjížděním (osa C). Z = hloubka, R = rovina, Q = krok, P = prodleva.', 'G83 Z-30. C0. R3. Q5000 F0.1\nG80'),
  ref('G84', 'G84 Z.. C.. R.. P.. F.. K.. M..', 'Čelní závitování. F = stoupání při G99.', 'G99\nG84 Z-20. C0. R5. F1.5\nG80'),
  ref('G85', 'G85 Z.. C.. R.. P.. F.. K.. M..', 'Čelní vystružování / vyvrtávání.', 'G85 Z-20. C0. R3. F0.1\nG80'),
  ref('G87', 'G87 X.. C.. R.. Q.. P.. F.. K.. M..', 'Boční (radiální) hluboké vrtání – nástroj na plášti obrobku, osa C.', 'G87 X20. C90. R3. Q3000 F0.05\nG80'),
  ref('G88', 'G88 X.. C.. R.. P.. F.. K.. M..', 'Boční závitování.', 'G88 X20. C90. R3. F1.5\nG80'),
  ref('G89', 'G89 X.. C.. R.. P.. F.. K.. M..', 'Boční vystružování / vyvrtávání.', 'G89 X20. C90. R3. F0.1\nG80'),
  ref('G65', 'G65 P(číslo) L(opakování) <argumenty>', 'Jednorázové volání makra O(P). Argumenty A–Z se předají do lokálních proměnných #1–#26.', 'G65 P9010 A5. B10. C2.', 'A5 → #1, B10 → #2, C2 → #3'),
  ref('G66', 'G66 P(číslo) <argumenty>', 'Modální volání makra – vyvolá se po každém pohybovém bloku, dokud se nezruší G67.', 'G66 P9020 Z-10.\nX30.\nX40.\nG67'),
  ref('G67', 'G67', 'Zrušení modálního volání makra (G66).', 'G67')
];

export const fanucMGroups = {
  'Program': ['M00', 'M01', 'M02', 'M30', 'M98', 'M99'],
  'Vřeteno': ['M03', 'M04', 'M05', 'M19', 'M29', 'M41–M44'],
  'Chlazení': ['M08', 'M09'],
  'Podle stroje': ['M10–M11', 'M12–M13']
};

export const fanucMItems = [
  ref('M00', 'M00', 'Programový stop. Zastaví program i vřeteno a chlazení (podle stroje); pokračuje se tlačítkem START.', 'M00'),
  ref('M01', 'M01', 'Podmíněný stop – platí jen při zapnutém přepínači OPT. STOP na pultu.', 'M01'),
  ref('M02', 'M02', 'Konec programu (bez návratu na začátek).', 'M02'),
  ref('M30', 'M30', 'Konec programu s návratem na začátek – další kus se spustí znovu.', 'G28 U0 W0\nM30'),
  ref('M98', 'M98 P(číslo) L(opakování)\nM98 Pnnnnoooo', 'Volání podprogramu. P = číslo podprogramu O…, L = počet opakování (1 = výchozí). Zkráceně: nnnn opakování + oooo číslo.', 'M98 P1001 L3\nM98 P31001', 'Obě volání provedou podprogram O1001 třikrát'),
  ref('M99', 'M99', 'Konec podprogramu – návrat do hlavního programu. V hlavním programu = skok na jeho začátek (nekonečná smyčka).', 'O1001\nG01 W-5. F0.1\nM99'),
  ref('M03', 'M03 S..', 'Vřeteno po směru hodin (CW).', 'G97 S800 M03'),
  ref('M04', 'M04 S..', 'Vřeteno proti směru hodin (CCW).', 'G97 S800 M04'),
  ref('M05', 'M05', 'Zastavení vřetene.', 'M05'),
  ref('M19', 'M19 S..', 'Orientace (polohování) vřetene na úhel; zadání úhlu (např. S) určuje výrobce stroje.', 'M19 S90'),
  ref('M29', 'M29 S..', 'Režim tuhého závitování (rigid tapping) – před G84/G88.', 'M29 S500\nG84 Z-20. F1.5'),
  ref('M41–M44', 'M41 … M44', 'Převodové stupně vřetena (nízký … vysoký). Čísla a význam určuje výrobce stroje.', 'G97 S800 M41 M03'),
  ref('M08', 'M08', 'Chlazení zapnout.', 'M08'),
  ref('M09', 'M09', 'Chlazení vypnout.', 'M09'),
  ref('M10–M11', 'M10 / M11', 'Typicky upnout / uvolnit sklíčidlo nebo koník – ZÁVISÍ NA STROJI, ověř v dokumentaci výrobce.', 'M11'),
  ref('M12–M13', 'M12 / M13', 'Typicky koník / pinola vpřed / zpět – ZÁVISÍ NA STROJI.', 'M12')
];
