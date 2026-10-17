import { ref, openRefList } from './ctrlRefViewer.js';

// ── Sinumerik 840D sl – alarmy a hlášení ────────────────────
// Orientační přehled. Přesné texty a čísla závisí na verzi SW a na projektu
// stroje (alarmy PLC a texty cyklů doplňuje výrobce) – rozhodující je
// diagnostika na stroji a „Diagnostics Manual" Siemens.
// Pole `syntax` = detail (popisek se přepíná v openRefList).

export const snAlarmGroups = {
  'Rozsahy čísel': ['10000–19999', '20000–29999', '27000–27999', '60000–64999', '65000–69999', '400000–799999', 'F / A pohony'],
  'Vlastní alarmy a hlášení': ['SETAL', 'MSG', 'MSG()', 'Alarm z podmínky'],
  'Potvrzení a mazání': ['POWER ON', 'RESET', 'CANCEL', 'NC START', 'Kde je vidět'],
  'Časté alarmy (orientačně)': ['12080', '14011', '10720', '21614', '25040', '25050', '61000', '61001', '61003'],
  'Pohony SINAMICS': ['F30001', 'F30002', 'F30003', 'F30004', 'F30005', 'F07011', 'F07900']
};

export const snAlarmItems = [
  ref('10000–19999', 'Alarmy NCK při přípravě bloků: syntaxe, neznámý příkaz, chybějící podprogram, chyby korekce poloměru, konfliktní G kódy. Většinou chyba v programu – oprav blok uvedený v alarmu.', 'Chyby přípravy programu (NCK)', ''),
  ref('20000–29999', 'Alarmy za chodu: kanál, osy, sledování polohy a rychlosti, enkodéry, polohování. Často souvisí s kolizí, koncovým spínačem, zapojením nebo strojními daty – ne s programem.', 'Chyby kanálu a os za chodu', ''),
  ref('27000–27999', 'Safety Integrated (bezpečné funkce, SPL, bezpečné koncové spínače). Zásah jen kvalifikovaný servis; blokace není pro obsluhu.', 'Bezpečnostní funkce', ''),
  ref('60000–64999', 'Alarmy standardních cyklů Siemens. Např. 61xxx = chybně zadaný parametr cyklu (stoupání, posuv, rovina). Oprav parametr v cyklu a spusť znovu.', 'Alarmy cyklů Siemens', ''),
  ref('65000–69999', 'Volný prostor pro uživatelské cykly. Vlastní alarmy se vyvolávají příkazem SETAL (např. SETAL(65010)); text patří do souboru textů alarmů.', 'Vlastní alarmy programu', 'SETAL(65010)'),
  ref('400000–799999', 'Alarmy a hlášení z PLC. Členění (obecné / kanál / osy / uživatelské) a texty určuje výrobce stroje – význam hledej v dokumentaci stroje, ne v Sinumeriku.', 'Hlášení z PLC (výrobce stroje)', ''),
  ref('F / A pohony', 'Alarmy pohonů SINAMICS mají předponu F (porucha) nebo A (výstraha) a pětimístné číslo, např. F30001. Zobrazují se v diagnostice pohonů, často i jako alarm 2xxxxx v NC.', 'Alarmy měničů a motorů', ''),
  ref('SETAL', 'SETAL(číslo)  nebo  SETAL(číslo, "text")\nČíslo 65000–69999 pro vlastní alarmy. Alarm zastaví program (reakce dle projektu), text se bere ze souboru textů alarmů.', 'Programový alarm – zastaví program a zobrazí hlášení.',
    'IF R1>R2\n  SETAL(65010)\nENDIF', 'Alarm, když naměřená hodnota překročí mez'),
  ref('MSG', 'MSG("text")\nSpojování textu a proměnných pomocí <<', 'Zpráva obsluze – zobrazí se v řádku zpráv, program běží dál.',
    'MSG("Pocet kusu: "<<R2)\nG1 Z-10 F0.2', 'Hlášení zůstane do dalšího MSG()'),
  ref('MSG()', 'MSG()', 'Smaže aktuální zprávu v řádku zpráv.', 'MSG()'),
  ref('Alarm z podmínky', 'IF podmínka\n  SETAL(číslo)\nENDIF', 'Typické použití: kontrola vstupní hodnoty nebo počítadla před obráběním; po alarmu program stojí, dokud se neresetuje.',
    'IF R10<=0\n  SETAL(65001)\nENDIF\nIF R11>R12\n  SETAL(65002)\nENDIF', 'Kontrola parametrů programu'),
  ref('POWER ON', 'Alarm zmizí až po vypnutí a zapnutí řízení (restart NCK).', 'Mazání POWER ON', ''),
  ref('RESET', 'Tlačítko RESET smaže alarmy, které to dovolují, a zruší běžící program (vrátí se na začátek).', 'Mazání RESET', ''),
  ref('CANCEL', 'Tlačítko ALARM CANCEL smaže alarmy typu Cancel; program stojí na místě a lze ho znovu spustit.', 'Mazání CANCEL', ''),
  ref('NC START', 'Hlášení a některé výstrahy zmizí startem NC / pokračováním programu, nezastaví ho.', 'Mazání NC START', ''),
  ref('Kde je vidět', 'Tlačítko ALARM → seznam aktivních alarmů, u každého symbol, čím se maže. Historie: Diagnostika → Historie alarmů (CTRL+ALT+H). Detail alarmu: tlačítko HELP / ?.', 'Zobrazení a historie', ''),
  ref('12080', 'Příčina: překlep, neznámé slovo, chybějící znak (např. za G kódem). Řešení: oprav blok uvedený v alarmu.', 'Syntaktická chyba v textu', ''),
  ref('14011', 'Příčina: hlavní nebo podprogram se nenašel, nebo není přístup (špatný název, cesta, chybějící PROC). Řešení: ověř název a umístění podprogramu.', 'Program / podprogram nenalezen', ''),
  ref('10720', 'Příčina: programovaná poloha překračuje softwarový koncový spínač (špatné posunutí nulového bodu, korekce nástroje). Řešení: zkontroluj G54 a polohu.', 'Softwarový koncový spínač', ''),
  ref('21614', 'Příčina: osa najela na hardwarový koncový spínač. Řešení: v ručním režimu (JOG) vyjeď opačným směrem po potvrzení alarmu.', 'Hardwarový koncový spínač', ''),
  ref('25040', 'Příčina: osa ve stání vybočila mimo toleranci (kolize, uvolněná mechanika, špatné nastavení regulace). Řešení: zkontroluj mechaniku a kolizi, řeš s údržbou.', 'Sledování stání osy', ''),
  ref('25050', 'Příčina: odchylka od požadované dráhy je příliš velká (kolize, příliš velký posuv, zadrhávání osy). Řešení: sníž posuv, zkontroluj kolizi a vedení.', 'Sledování obrysu (kontury)', ''),
  ref('61000', 'Příčina: cyklus potřebuje aktivní korekci nástroje (D). Řešení: před voláním cyklu vyvolej nástroj T… D….', 'Není aktivní korekce nástroje', ''),
  ref('61001', 'Příčina: nulové nebo chybné stoupání v cyklu závitu. Řešení: oprav hodnotu stoupání / zvol správnou normu.', 'Chybně zadané stoupání závitu', ''),
  ref('61003', 'Příčina: v cyklu není zadán posuv. Řešení: doplň F v cyklu nebo před jeho voláním.', 'V cyklu není naprogramován posuv', ''),
  ref('F30001', 'Příčina: zkrat motoru nebo kabelu, špatné parametry regulátoru, vadný modul. Řešení: zkontroluj kabeláž a motor, volej servis.', 'Power unit: nadproud', ''),
  ref('F30002', 'Příčina: příliš vysoké napětí meziobvodu (brzdění bez odporu, příliš rychlá decelerace). Řešení: zkontroluj brzdný odpor a časy rampy.', 'Přepětí meziobvodu DC', ''),
  ref('F30003', 'Příčina: nízké napětí meziobvodu (výpadek fáze, napájení, předřazený filtr). Řešení: zkontroluj napájení a pojistky.', 'Podpětí meziobvodu DC', ''),
  ref('F30004', 'Příčina: přehřátý chladič měniče (ucpané filtry, vadný ventilátor, příliš vysoké zatížení). Řešení: vyčisti chlazení, počkej na zchlazení.', 'Přehřátí chladiče měniče', ''),
  ref('F30005', 'Příčina: dlouhodobé přetížení (příliš velký úběr, špatný posuv, mechanika). Řešení: sniž zatížení, zkontroluj mechanické vedení.', 'Přetížení I²t měniče', ''),
  ref('F07011', 'Příčina: přehřátí motoru (zatížení, nefunkční chlazení, vadné čidlo teploty). Řešení: nech motor vychladnout, sniž zatížení.', 'Přehřátí motoru', ''),
  ref('F07900', 'Příčina: motor se netočí podle požadavku (kolize, zablokovaná mechanika, brzda). Řešení: odstraň překážku, zkontroluj brzdu a upnutí.', 'Motor zablokovaný', '')
];

const NOTE = 'Orientační přehled – přesné znění a čísla se liší podle verze SW a stroje, rozhoduje diagnostika a dokumentace výrobce.';

export function openSinumerikAlarms() {
  openRefList({
    type: 'sinumerik-alarms', title: '🚨 Sinumerik 840D – Alarmy a hlášení', placeholder: 'Hledat alarm (číslo nebo text)…',
    groups: snAlarmGroups, items: snAlarmItems, windowClass: 'gc-window al-window', syntaxLabel: 'Detail:', note: NOTE
  });
}
