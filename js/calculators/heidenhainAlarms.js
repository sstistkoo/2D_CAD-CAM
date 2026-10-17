import { ref, openRefList } from './ctrlRefViewer.js';

// ── Heidenhain TNC 640 – chybová hlášení ────────────────────
// Orientační přehled. Řízení vždy zobrazí vlastní text i nápovědu (HELP);
// čísla 0–999 u FN 14 patří výrobci stroje. Znění a čísla ověř na stroji.
// Pole `syntax` = detail alarmu.

export const hhAlarmGroups = {
  'Zobrazení a mazání': ['Chybové hlášení', 'ERR', 'CE', 'HELP', 'Přerušení napájení'],
  'Vlastní chyby (FN 14)': ['FN 14 ERROR', '0–999', '1000–1199', 'Chyba z podmínky'],
  'Interní chyby FN 14 (1000+)': ['1000', '1001', '1002', '1003', '1004', '1005', '1010', '1011', '1017', '1018', '1019', '1020', '1021', '1025', '1027']
};

export const hhAlarmItems = [
  ref('Chybové hlášení', 'Chyba se zobrazí v záhlaví obrazovky a řízení zastaví program. Potvrď ji klávesou CE; pokud příčina trvá, hlášení se vrátí.', 'Jak řízení hlásí chyby', ''),
  ref('ERR', 'Klávesa / tlačítko ERR otevře okno se všemi aktuálními chybami a jejich popisem. Jedna příčina může vyvolat několik hlášení.', 'Seznam chyb', ''),
  ref('CE', 'Klávesa CE smaže hlášení v záhlaví (nemaže příčinu). U chyb, které zastavily program, je po opravě potřeba program znovu spustit.', 'Smazání hlášení', ''),
  ref('HELP', 'U hlášení stiskni HELP – zobrazí podrobnější příčinu a doporučenou nápravu (někdy s odkazem na číslo chyby).', 'Nápověda k chybě', ''),
  ref('Přerušení napájení', 'Po zapnutí řízení: potvrď hlášení o přerušeném napájení klávesou CE, zapni externí napětí (relé) a najeď referenční body.', 'Start řízení', ''),
  ref('FN 14 ERROR', 'FN 14: ERROR = číslo\nVyvolá chybové hlášení s daným číslem; program se zastaví. Používá se pro kontrolu vstupních hodnot.', 'Vlastní chybová hlášení v programu',
    'FN 11: IF +Q1 GT +Q2 GOTO LBL 99\n; ...\nLBL 99\nFN 14: ERROR = 1011', 'Chyba, když je Q1 > Q2'),
  ref('0–999', 'Čísla 0–999 u FN 14 mají texty definované výrobcem stroje (tabulka textů hlášení). Bez tabulky se zobrazí jen číslo – význam zjistíš v dokumentaci stroje.', 'Hlášení výrobce stroje', 'FN 14: ERROR = 100'),
  ref('1000–1199', 'Čísla 1000–1199 jsou interní standardní chybová hlášení řízení (viz seznam níže) – po FN 14 se zobrazí její standardní text.', 'Standardní hlášení řízení', 'FN 14: ERROR = 1001'),
  ref('Chyba z podmínky', 'FN 9–FN 12 s GOTO LBL + FN 14. Typické použití: kontrola tolerance, délky, počtu kusů.', 'Kontrola a chyba',
    'FN 12: IF +Q10 LT +0 GOTO LBL 90\n...\nLBL 90\nFN 14: ERROR = 1011', 'Záporná hodnota Q10 vyvolá hlášení „Nepřípustná zadaná hodnota"'),
  ref('1000', 'Příčina: vřeteno není zapnuté (M3 / M4) před cyklem nebo posuvem. Řešení: přidej M3/M4 nebo TOOL CALL s otáčkami.', 'Vřeteno?', ''),
  ref('1001', 'Příčina: chybí osa nástroje v TOOL CALL. Řešení: doplň osu (Z) a otáčky.', 'Chybí osa nástroje', ''),
  ref('1002', 'Příčina: šířka drážky je větší než dovoluje cyklus nebo nástroj. Řešení: zmenši šířku nebo zvol větší nástroj.', 'Šířka drážky příliš velká', ''),
  ref('1003', 'Příčina: poloměr nástroje neodpovídá cyklu nebo kontuře. Řešení: změň nástroj nebo parametry cyklu.', 'Poloměr nástroje příliš velký', ''),
  ref('1004', 'Příčina: zadaná hodnota nebo dráha je mimo povolený rozsah. Řešení: zkontroluj souřadnice a pracovní prostor.', 'Překročen rozsah', ''),
  ref('1005', 'Příčina: startovní poloha cyklu nebo kontury je nepřípustná. Řešení: zkontroluj nájezd.', 'Chybná startovní poloha', ''),
  ref('1010', 'Příčina: chybí posuv F (v TOOL CALL nebo v bloku). Řešení: zadej F nebo FMAX.', 'Chybí posuv', ''),
  ref('1011', 'Příčina: parametr cyklu nebo funkce má nepřípustnou hodnotu. Řešení: zkontroluj Q-parametry.', 'Nepřípustná zadaná hodnota', ''),
  ref('1017', 'Příčina: cyklus není celý definovaný (chybí CYCL DEF nebo parametr). Řešení: doplň definici cyklu.', 'CYCL nekompletní', ''),
  ref('1018', 'Příčina: obráběcí rovina je definovaná špatně (osa nástroje a rovina nesedí). Řešení: zkontroluj G17/G18/G19 a TOOL CALL.', 'Chybně definovaná rovina', ''),
  ref('1019', 'Příčina: v bloku je osa, která v dané rovině nebo cyklu není povolená. Řešení: oprav osu.', 'Programována chybná osa', ''),
  ref('1020', 'Příčina: otáčky jsou mimo rozsah (0, příliš vysoké). Řešení: zadej platné S.', 'Chybné otáčky', ''),
  ref('1021', 'Příčina: korekce poloměru (RL/RR) je zapnutá v místě, kde nemá platit, nebo chybí. Řešení: zkontroluj R0 / RL / RR.', 'Korekce poloměru není definovaná', ''),
  ref('1025', 'Příčina: podprogramy / cykly jsou vnořené příliš hluboko (rekurze). Řešení: zjednoduš strukturu nebo odstraň rekurzivní volání.', 'Příliš hluboké vnoření', ''),
  ref('1027', 'Příčina: CYCL CALL bez předchozího CYCL DEF. Řešení: nejdříve definuj cyklus.', 'Není definovaný obráběcí cyklus', '')
];

const NOTE = 'Orientační přehled – přesné znění a čísla se liší podle verze SW a stroje, rozhoduje diagnostika a dokumentace výrobce.';

export function openHeidenhainAlarms() {
  openRefList({
    type: 'hh-alarms', title: '🚨 Heidenhain TNC 640 – Chybová hlášení', placeholder: 'Hledat chybu (číslo nebo text)…',
    groups: hhAlarmGroups, items: hhAlarmItems, windowClass: 'gc-window al-window', syntaxLabel: 'Detail:', note: NOTE
  });
}
