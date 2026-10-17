import { ref, openRefList } from './ctrlRefViewer.js';

// ── Fanuc 0i/31i – alarmy a hlášení ─────────────────────────
// Orientační přehled nejčastějších alarmů. Úplný seznam, přesné znění a
// nápravu najdeš v „Operator's manual / Maintenance manual" a v dokumentaci
// stroje (některé alarmy a signály PMC doplňuje výrobce).
// Pole `syntax` = detail alarmu.

export const fanucAlarmGroups = {
  'Typy alarmů': ['PS', 'SW', 'OT', 'SV', 'SP', 'OH', 'APC', 'PW'],
  'Vlastní alarmy a hlášení': ['#3000', '#3006', 'MSG', 'Mazání a historie'],
  'Alarmy programu (PS)': ['PS0003', 'PS0004', 'PS0006', 'PS0007', 'PS0009', 'PS0010', 'PS0011', 'PS0020', 'PS0033', 'PS0034', 'PS0041', 'PS0060', 'PS0070', 'PS0071', 'PS0073', 'PS0078', 'PS0092', 'PS0224'],
  'Makro (PS)': ['PS0112', 'PS0114', 'PS0115', 'PS0116', 'PS0118', 'PS0119', 'PS0124', 'PS0126', 'PS0128'],
  'Přejezd a servo': ['OT0500', 'OT0501', 'OT0506', 'OT0507', 'SV0401', 'SV0410', 'SV0411', 'SV0417', 'SV0430'],
  'Vřeteno': ['SP0749', 'SP0750', 'AL-01', 'AL-02', 'AL-03', 'AL-07', 'AL-09', 'AL-12', 'AL-27', 'AL-29'],
  'Ostatní': ['PW0000', 'SW0100', 'OH0700', 'OH0701', 'APC0300']
};

export const fanucAlarmItems = [
  ref('PS', 'Alarmy programu / NC (PS, dříve P/S). Nejčastěji chyba zápisu bloku nebo makra – oprav blok, ve kterém řízení zastavilo, a stiskni RESET.', 'Chyby programu a NC', ''),
  ref('SW', 'Alarmy nastavení parametrů (např. SW0100 – zápis parametrů povolen). Řeší seřizovač nebo servis.', 'Nastavení parametrů', ''),
  ref('OT', 'Přejezd zdvihu (overtravel). Osa najela na softwarový (OT0500/0501) nebo hardwarový (OT0506/0507) koncový spínač.', 'Přejezd osy', ''),
  ref('SV', 'Alarmy servosystému (SV0400–SV0460): chyba sledování, přehřátí motoru, parametry zesilovače, enkodér.', 'Servo (osy)', ''),
  ref('SP', 'Alarmy komunikace s digitálním vřetenem (SP0749 a další). Kód poruchy zesilovače vřetena (SPM) je v LED na zesilovači (AL-xx).', 'Vřeteno', ''),
  ref('OH', 'Přehřátí řízení nebo ventilátor (OH0700 řídicí jednotka, OH0701 ventilátor).', 'Přehřátí', ''),
  ref('APC', 'Alarmy absolutního snímače polohy (APC), např. po výpadku baterie – nutné znovu najet referenci.', 'Absolutní snímač', ''),
  ref('PW', 'PW0000 – řízení vyžaduje vypnout a znovu zapnout napájení (např. po změně parametrů).', 'Napájení', ''),
  ref('#3000', '#3000 = n (TEXT ALARMU)\nn = 0–200; zobrazí se alarm MC3000 + n a text v závorkách; program se zastaví.', 'Makro alarm – zastaví program.',
    '#3000 = 1 (CHYBA NASTAVENI)', 'Alarm MC3001 s textem'),
  ref('#3006', '#3006 = 1 (ZPRAVA)\nZastaví program se zprávou obsluze; po START pokračuje.', 'Zpráva obsluze se zastavením (bez alarmu).',
    '#3006 = 1 (KONTROLA MERENI)', ''),
  ref('MSG', '(MSG, text)', 'Zobrazí zprávu v okně zpráv, program běží dál (řízení musí zprávy v komentáři podporovat).',
    '(MSG, VYMENIT PLATEK)', ''),
  ref('Mazání a historie', 'Mazání: oprav příčinu a stiskni RESET. Alarmy PW a některé SV vyžadují vypnutí řízení. Historie: tlačítko MESSAGE → ALM / HISTRY.', 'Jak alarm smazat a kde je historie', ''),
  ref('PS0003', 'Příčina: číslo má víc číslic, než povoluje adresa. Řešení: zkontroluj hodnotu a desetinnou tečku.', 'Příliš mnoho číslic', ''),
  ref('PS0004', 'Příčina: slovo nezačíná písmenem (číslo bez adresy, překlep). Řešení: doplň adresu.', 'Slovo nezačíná písmenem', ''),
  ref('PS0006', 'Příčina: záporné znaménko u adresy, kde není povoleno (např. O, N). Řešení: odstraň minus.', 'Špatné použití znaménka', ''),
  ref('PS0007', 'Příčina: desetinná tečka tam, kde nepatří (např. u N, M, T) nebo dvakrát. Řešení: oprav zápis čísla.', 'Špatné použití desetinné tečky', ''),
  ref('PS0009', 'Příčina: adresa není pro dané řízení povolená (chybný znak, jiný systém G kódů). Řešení: zkontroluj zápis bloku.', 'Neplatná adresa', ''),
  ref('PS0010', 'Příčina: G kód neexistuje nebo ho řízení nepodporuje. Řešení: ověř G kód a systém G kódů (A/B/C).', 'Neplatný G kód', ''),
  ref('PS0011', 'Příčina: pracovní posuv je 0 nebo nebyl zadán (G01/G02/G03). Řešení: zadej F.', 'Není zadán posuv', ''),
  ref('PS0020', 'Příčina: rozdíl poloměrů začátku a konce oblouku je větší než povolená tolerance. Řešení: oprav R nebo I/K.', 'Oblouk mimo toleranci poloměru', ''),
  ref('PS0033', 'Příčina: při korekci poloměru se nedá spočítat průsečík (úzký prostor, malá kontura). Řešení: oprav dráhu nebo poloměr špičky.', 'Řešení korekce poloměru neexistuje', ''),
  ref('PS0034', 'Příčina: nájezd nebo odjezd s korekcí poloměru po oblouku (G02/G03). Řešení: najeď přímkou G01.', 'Oblouk při zapnutí/vypnutí G41/G42', ''),
  ref('PS0041', 'Příčina: dráha při korekci poloměru koliduje (záběr by zasáhl kontura). Řešení: změň dráhu nebo nástroj.', 'Kolize při korekci poloměru', ''),
  ref('PS0060', 'Příčina: číslo bloku zadané v GOTO, M98 nebo G70 nebylo nalezeno. Řešení: zkontroluj čísla N.', 'Nenalezeno číslo bloku', ''),
  ref('PS0070', 'Příčina: plná paměť programů. Řešení: smaž nepotřebné programy.', 'Paměť programů je plná', ''),
  ref('PS0071', 'Příčina: hledaná adresa nebo číslo programu v paměti není. Řešení: ověř číslo programu (O….).', 'Data nenalezena', ''),
  ref('PS0073', 'Příčina: program s tímto číslem už existuje. Řešení: zvol jiné číslo.', 'Číslo programu je již použité', ''),
  ref('PS0078', 'Příčina: volaný podprogram (M98 P…) nebo číslo bloku neexistuje. Řešení: zkontroluj číslo podprogramu.', 'Číslo nenalezeno', ''),
  ref('PS0092', 'Příčina: G27 – osa nedojela na referenční bod. Řešení: zkontroluj polohu a referenční bod.', 'Osa není na referenčním bodě', ''),
  ref('PS0224', 'Příčina: po zapnutí nebyla provedena reference os. Řešení: proveď návrat do referenčního bodu (REF).', 'Chybí návrat do referenčního bodu', ''),
  ref('PS0112', 'Příčina: dělení nulou v makru. Řešení: ošetři podmínku nulového jmenovatele.', 'Dělení nulou', ''),
  ref('PS0114', 'Příčina: chybný zápis výrazu (chybějící ] , špatný operátor). Řešení: zkontroluj závorky a operátory.', 'Chyba formátu makra', ''),
  ref('PS0115', 'Příčina: číslo proměnné není povolené nebo je mimo rozsah. Řešení: zkontroluj #n.', 'Číslo proměnné mimo rozsah', ''),
  ref('PS0116', 'Příčina: zápis do proměnné, která je jen pro čtení. Řešení: zapiš do jiné proměnné.', 'Proměnná chráněná proti zápisu', ''),
  ref('PS0118', 'Příčina: příliš mnoho vnořených závorek [ ]. Řešení: zjednoduš výraz.', 'Chyba vnoření závorek', ''),
  ref('PS0119', 'Příčina: neplatný argument funkce (SQRT záporného čísla, ...). Řešení: ošetři vstup.', 'Neplatný argument', ''),
  ref('PS0124', 'Příčina: WHILE/DO bez odpovídajícího END (nebo opačně). Řešení: doplň END.', 'Chybí ukončení cyklu', ''),
  ref('PS0126', 'Příčina: číslo v DO/END mimo rozsah 1–3. Řešení: oprav číslo cyklu.', 'Neplatné číslo cyklu', ''),
  ref('PS0128', 'Příčina: GOTO n – číslo bloku je mimo rozsah 1–99999 nebo se nenašlo. Řešení: oprav číslo.', 'Neplatné číslo bloku v makru', ''),
  ref('OT0500', 'Příčina: osa překročila softwarový limit v kladném směru (Stored stroke check 1). Řešení: v JOG vyjeď zpět; zkontroluj nulový bod a korekce.', 'Přejezd + (SW limit)', ''),
  ref('OT0501', 'Příčina: totéž v záporném směru. Řešení: v JOG vyjeď zpět.', 'Přejezd − (SW limit)', ''),
  ref('OT0506', 'Příčina: najetí na hardwarový koncový spínač (+). Řešení: tlačítko pro uvolnění koncáku nebo ručně opačným směrem.', 'Přejezd + (HW spínač)', ''),
  ref('OT0507', 'Příčina: totéž pro směr −.', 'Přejezd − (HW spínač)', ''),
  ref('SV0401', 'Příčina: servozesilovač není připraven (V-ready off) – chybí napájení, porucha zesilovače. Řešení: zkontroluj napájení a stavy LED zesilovače.', 'V-ready vypnuto', ''),
  ref('SV0410', 'Příčina: odchylka polohy za klidu je větší než limit (blokace, kolize, špatná mechanika). Řešení: zkontroluj kolizi a mechaniku.', 'Chyba polohy ve stání', ''),
  ref('SV0411', 'Příčina: odchylka polohy při pohybu je příliš velká (příliš velký posuv, zadrhávání). Řešení: sniž posuv, zkontroluj vedení.', 'Chyba polohy za pohybu', ''),
  ref('SV0417', 'Příčina: neplatné digitální parametry serva (po výměně motoru / zesilovače). Řešení: parametry nastaví servis.', 'Neplatné parametry serva', ''),
  ref('SV0430', 'Příčina: přehřátí servomotoru (zatížení, chlazení). Řešení: nech vychladnout, sniž zatížení.', 'Přehřátí servomotoru', ''),
  ref('SP0749', 'Příčina: chyba sériové komunikace s vřetenem (kabel, zesilovač). Řešení: zkontroluj propojení a kód zesilovače.', 'Chyba spojení s vřetenem', ''),
  ref('SP0750', 'Příčina: sériové spojení s vřetenem se nepodařilo spustit (zesilovač, parametry). Řešení: zkontroluj zesilovač a napájení.', 'Spojení s vřetenem se nespustilo', ''),
  ref('AL-01', 'Příčina: přehřátý motor vřetene. Řešení: nech vychladnout, zkontroluj chlazení a zatížení.', 'Přehřátí motoru vřetene', ''),
  ref('AL-02', 'Příčina: skutečné otáčky se liší od požadovaných (přetížení, kolize). Řešení: sniž zatížení / otáčky.', 'Odchylka otáček', ''),
  ref('AL-03', 'Příčina: vadná pojistka meziobvodu (DC link). Řešení: volej servis.', 'Pojistka meziobvodu', ''),
  ref('AL-07', 'Příčina: otáčky vřetene překročily maximum. Řešení: zkontroluj parametry a G50/G96 limity.', 'Přetočení vřetene', ''),
  ref('AL-09', 'Příčina: přetížení hlavního obvodu / přehřátí chladiče zesilovače. Řešení: zkontroluj chlazení, sniž zatížení.', 'Přetížení zesilovače vřetene', ''),
  ref('AL-12', 'Příčina: nadproud v meziobvodu (zkrat, špatné parametry motoru). Řešení: volej servis.', 'Nadproud DC link', ''),
  ref('AL-27', 'Příčina: výpadek signálu pozičního snímače vřetene. Řešení: zkontroluj kabel a snímač.', 'Signál pozičního snímače', ''),
  ref('AL-29', 'Příčina: krátkodobé přetížení motoru (příliš velký úběr). Řešení: sniž posuv nebo hloubku řezu.', 'Krátkodobé přetížení', ''),
  ref('PW0000', 'Příčina: změněné parametry vyžadují restart. Řešení: vypni a zapni napájení.', 'Vypni a zapni napájení', ''),
  ref('SW0100', 'Příčina: zapnutý zápis parametrů (PWE = 1). Řešení: po úpravě vypni PWE v nastavení.', 'Zápis parametrů povolen', ''),
  ref('OH0700', 'Příčina: přehřátí řídicí jednotky. Řešení: vyčisti větrání, zkontroluj okolní teplotu.', 'Přehřátí řídicí jednotky', ''),
  ref('OH0701', 'Příčina: nefunkční ventilátor řízení. Řešení: vyměň ventilátor.', 'Zastavený ventilátor', ''),
  ref('APC0300', 'Příčina: po výpadku baterie / výměně enkodéru se ztratila reference. Řešení: najeď referenční bod (návrat do reference).', 'Nutný návrat do reference osy', '')
];

const NOTE = 'Orientační přehled – přesné znění a čísla se liší podle verze SW a stroje, rozhoduje diagnostika a dokumentace výrobce.';

export function openFanucAlarms() {
  openRefList({
    type: 'fanuc-alarms', title: '🚨 Fanuc 0i/31i – Alarmy a hlášení', placeholder: 'Hledat alarm (např. PS0010, SV…)…',
    groups: fanucAlarmGroups, items: fanucAlarmItems, windowClass: 'gc-window al-window', syntaxLabel: 'Detail:', note: NOTE
  });
}
