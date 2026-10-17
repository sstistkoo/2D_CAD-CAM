import { ref, openRefList } from './ctrlRefViewer.js';

// ── Heidenhain TNC 640 – soustružnické nástroje a opotřebení ──
// Soustružnické nože jsou v samostatné tabulce (TOOLTURN.TRN), délky XL/ZL,
// opotřebení DXL/DZL, poloměr RS/DRS, orientace TO. Znaménko a průměr ×
// poloměr se liší podle stroje – proto karta Test.
// Pole `syntax` = význam / postup.

export const hhToolGroups = {
  'Opotřebení (hlavní)': ['Co dělá −0,2', 'DXL a DZL', 'DRS', 'Test'],
  'Tabulka nástrojů': ['TOOLTURN.TRN', 'XL a ZL', 'RS', 'TO', 'TYPE', 'TOOL CALL'],
  'Postupy': ['Nový nůž', 'Měření', 'Nová destička', 'Kontrola TO']
};

export const hhToolItems = [
  ref('Co dělá −0,2',
    'Opotřebení se přičte k rozměru nože: DXL k XL (osa X), DZL k ZL (osa Z). −0,2 v DXL posune špičku o 0,2 v ose X → mění se PRŮMĚR dílu; −0,2 v DZL → mění se DÉLKA / čelo.\n' +
    'Zda je X v průměru nebo v poloměru a kterým směrem „−" posune špičku, závisí na stroji – ověř kartou Test.',
    'Odpověď: DXL ovlivní průměr, DZL délku', ''),
  ref('DXL a DZL', 'Sloupce opotřebení délek v tabulce soustružnických nožů. Ladí se jimi rozměr během výroby; po výměně destičky je vynuluj.', 'Opotřebení délek', ''),
  ref('DRS', 'Opotřebení poloměru břitu. Projeví se jen s korekcí poloměru (RL / RR) a v cyklech; v programu bez korekce poloměru (např. ze SKICA) rozměr nedoladí.', 'Opotřebení poloměru', ''),
  ref('Test',
    'Zkušební stupeň: změř Ø, zadej DXL −0,2, ujeď stejný stupeň znovu a změř. Rozdíl Ø ukáže velikost (0,2 = průměr, 0,4 = poloměr) i směr. Výsledek si zapiš.',
    'Ověření na konkrétním stroji', ''),
  ref('TOOLTURN.TRN', 'Tabulka soustružnických nožů (u TNC 640 s volbou Turning). Frézovací nástroje jsou v TOOL.T; řádek se páruje číslem / jménem nástroje.', 'Tabulka soustružnických nožů', ''),
  ref('XL a ZL', 'Délky nože v X a Z od vztažného bodu – měří se dotykem nebo na seřizovacím přístroji.', 'Délky nože', ''),
  ref('RS', 'Poloměr břitu (špičky destičky).', 'Poloměr břitu', ''),
  ref('TO', 'Orientace nože (1–9) – kde leží špička vůči středu rádiusu; podle ní řízení počítá korekci poloměru. Správné číslo ukáže obrázek v manuálu / na obrazovce.', 'Orientace nože', ''),
  ref('TYPE', 'Typ nože: hrubovací, dokončovací, závitový, zapichovací, kulatý… Cykly podle něj kontrolují, zda nůž smí obrábět.', 'Typ nože', ''),
  ref('TOOL CALL', 'TOOL CALL číslo / "jméno" vyvolá nůž i jeho korekce z tabulky. Změna opotřebení se uplatní při dalším TOOL CALL.', 'Vyvolání nože', 'TOOL CALL "HRUB_T1"'),
  ref('Nový nůž',
    '1) V tabulce soustružnických nožů založ řádek: číslo, NAME, TYPE.\n2) RS (poloměr břitu) a TO (orientace) podle obrázku.\n3) DXL, DZL, DRS na 0.\n4) Změř XL a ZL (karta Měření).\n5) TOOL CALL v ručním / MDI režimu, zkušební řez, doladění opotřebením.',
    'Kontrolní seznam pro nový nůž', ''),
  ref('Měření',
    'XL a ZL se zjistí na seřizovacím přístroji, sondou, nebo dotykem obrobku v ručním režimu (funkce pro nastavení / měření nástroje). Přesný postup na obrazovce závisí na verzi SW a stroji – drž se manuálu stroje.',
    'Délky nože XL a ZL', ''),
  ref('Nová destička',
    'Po výměně destičky vynuluj DXL, DZL, DRS; při jiném poloměru změň RS. Při výměně držáku nebo velké odchylce znovu změř XL a ZL.',
    'Výměna destičky', ''),
  ref('Kontrola TO',
    'S korekcí poloměru (RL / RR) projeď zkušební sražení 45° nebo oblouk: stupeň či podříznutí = špatná orientace TO nebo poloměr RS.',
    'Ověření orientace a poloměru', '')
];

const NOTE = 'Orientační přehled – názvy sloupců a chování závisí na verzi SW a nastavení stroje. Jednou si to ověř kartou Test.';

export function openHeidenhainTools() {
  openRefList({
    type: 'hh-tools', title: '🛠️ Heidenhain TNC 640 – Nástroje a opotřebení', placeholder: 'Hledat (např. DXL, TO)…',
    groups: hhToolGroups, items: hhToolItems, windowClass: 'gc-window tl-window', syntaxLabel: 'Význam:', note: NOTE
  });
}
