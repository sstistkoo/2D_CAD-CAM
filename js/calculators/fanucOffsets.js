import { ref, openRefList } from './ctrlRefViewer.js';

// ── Fanuc 0i/31i-T – korekce nástroje (geometrie, opotřebení) ──
// U Fanuca je chování opotřebení u soustruhu ustálené: X se při průměrovém
// programování zadává v PRŮMĚRU a záporné opotřebení posune nůž k menšímu X.
// Přesto: rozhoduje parametr stroje (zápis X v průměru/poloměru) – viz karta Test.
// Pole `syntax` = význam / postup.

export const fanucOffsetGroups = {
  'Opotřebení (hlavní)': ['Co dělá −0,2', 'Opotřebení X', 'Opotřebení Z', 'INPUT × +INPUT', 'Příklad', 'Test'],
  'Korekční tabulka': ['T0101', 'Geometrie', 'R a T', 'Měření (MEASURE)', 'G10']
};

export const fanucOffsetItems = [
  ref('Co dělá −0,2',
    'Opotřebení X (Wear X) −0,2 posune nůž o 0,2 směrem k menšímu X. Při průměrovém programování (běžné) je hodnota v PRŮMĚRU → vnější průměr bude o 0,2 MENŠÍ, díra (vnitřní průměr) také o 0,2 menší.\n' +
    'Opotřebení Z −0,2 posune nůž o 0,2 směrem k −Z (ke sklíčidlu) → čela a osazení se posunou o 0,2 v −Z.\n' +
    'Nic se „neubírá z délky nože" – jen se posune špička.',
    'Odpověď: X = průměr (záporné = menší), Z = poloha v ose Z', ''),
  ref('Opotřebení X',
    'Zápis v průměru (pokud stroj nemá nastaveno zadávání v poloměru – parametr pro korekci v poloměru, ověř).\n' +
    '• Vnější průměr velký → zadej MÍNUS (o rozdíl na průměru).\n' +
    '• Díra malá → zadej PLUS.',
    'Wear X – ladí průměry', ''),
  ref('Opotřebení Z',
    'Zápis v mm, nic se nenásobí. Záporné posune nůž ke −Z.\n' +
    '• Osazení / čelo má být víc v −Z (hlouběji) → MÍNUS.\n' +
    '• Má být méně → PLUS.',
    'Wear Z – ladí délky a čela', ''),
  ref('INPUT × +INPUT',
    'INPUT = zapíše zadané číslo (přepíše původní hodnotu). +INPUT = PŘIČTE zadané číslo k původní hodnotě. Pro dolaďování opotřebení je praktičtější +INPUT (zadáš jen rozdíl).',
    'Přepsat, nebo přičíst', ''),
  ref('Příklad',
    'Kóta Ø50,00, naměřeno Ø50,12 → průměr je o 0,12 větší. Na řádek korekce nože zadej −0.12 a stiskni +INPUT (nebo spočítej nový součet a INPUT).\n' +
    'Délka osazení 30,10 místo 30,00 a osazení má být blíž ke kraji (k +Z) → Wear Z +0.1 (pozor: posune i čelo, které obrábí týž nůž).',
    'Díl o 0,12 větší na průměru', ''),
  ref('Test',
    'Jednou na stroji ověř: změř zkušební stupeň, zadej Wear X −0.2, ujeď stejný stupeň znovu a změř. Ø o 0,2 menší → zápis v průměru (běžné). Ø o 0,4 menší → zápis v poloměru.',
    'Ověření na konkrétním stroji', ''),
  ref('T0101',
    'T + 2 číslice nástroj (pozice revolveru) + 2 číslice číslo korekce. Číslo korekce vybere řádek geometrie I opotřebení. T0100 = nástroj 1 bez korekce (zrušení).',
    'Vyvolání nože s korekcí', 'T0101   (NUZ 1, KOREKCE 1)\nT0313   (NUZ 3, KOREKCE 13)'),
  ref('Geometrie',
    'Řádek Geometry: X, Z = poloha špičky (měří se dotykem), R = poloměr špičky, T = číslo špičky. Geometrie se zadává při seřízení; v běžné výrobě se mění jen opotřebení.',
    'Geometry – základní rozměry nože', ''),
  ref('R a T',
    'R = poloměr špičky, T = imaginární číslo špičky 0–9 (kde leží teoretická špička vůči středu rádiusu). Používá se JEN s G41/G42. Typicky 3 pro vnější a 2 pro vnitřní soustružení u běžného soustruhu – správné číslo ověř obrázkem v manuálu.',
    'Poloměr a číslo špičky', ''),
  ref('Měření (MEASURE)',
    'Offset → Geometry, kurzor na řádek nože. Dotkni se průměru, změř ho, zadej např. X50.12 a stiskni MEASURE – řízení samo spočítá geometrii X. Pro Z dotyk čela, zadej Z0. a MEASURE.',
    'Seřízení nože dotykem', ''),
  ref('G10',
    'G10 P.. X.. Z.. R.. Q.. – zápis korekce programem. P1–P64 = opotřebení, P10000 + n = geometrie n. U / W místo X / Z = přičíst. Rozsah čísel a povolení zápisu závisí na stroji.',
    'Korekce z programu', 'G10 P1 U-0.02   (WEAR 1: X MINUS 0.02)', '')
];

const NOTE = 'Orientační přehled – zápis X v průměru × poloměru a čísla parametrů závisí na stroji. Jednou si to ověř kartou Test.';

export function openFanucOffsets() {
  openRefList({
    type: 'fanuc-offsets', title: '🛠️ Fanuc 0i/31i-T – Korekce nástroje', placeholder: 'Hledat (např. wear, T0101, G10)…',
    groups: fanucOffsetGroups, items: fanucOffsetItems, windowClass: 'gc-window tl-window', syntaxLabel: 'Význam:', note: NOTE
  });
}
