import { openControlHub, openRefList, openRefExamples } from './ctrlRefViewer.js';
import { fanucGGroups, fanucGItems, fanucMGroups, fanucMItems } from './fanucRefData.js';
import { openFanucAlarms } from './fanucAlarms.js';
import { openFanucOffsets } from './fanucOffsets.js';
import { fanucMacroGroups, fanucMacroItems, fanucExamples } from './fanucRefMacro.js';

const T = 'Fanuc 0i/31i-T';

export function openFanucGcodes() {
  openRefList({
    type: 'fanuc-g', title: `⚙️ ${T} – G kódy`, placeholder: 'Hledat G kód…',
    groups: fanucGGroups, items: fanucGItems
  });
}

export function openFanucMcodes() {
  openRefList({
    type: 'fanuc-m', title: `🔧 ${T} – M kódy`, placeholder: 'Hledat M kód…',
    groups: fanucMGroups, items: fanucMItems, windowClass: 'gc-window mc-window'
  });
}

export function openFanucMacro() {
  openRefList({
    type: 'fanuc-macro', title: `📊 ${T} – Makro B`, placeholder: 'Hledat proměnnou nebo příkaz…',
    groups: fanucMacroGroups, items: fanucMacroItems, windowClass: 'gc-window sv-window'
  });
}

export function openFanucExamples() {
  openRefExamples({ type: 'fanuc-examples', title: `📝 Ukázky – ${T}`, examples: fanucExamples });
}

export function openFanucHub() {
  openControlHub({
    type: 'fanuc', title: '🏭 Fanuc',
    subtitle: `${T} – referenční příručka pro CNC soustruh (ISO 6983)`,
    tiles: [
      { icon: '⚙️', title: 'G kódy',  desc: 'Pohyby, cykly G70–G76, závity, vrtání', action: openFanucGcodes },
      { icon: '🔧', title: 'M kódy',  desc: 'Pomocné funkce a podprogramy',          action: openFanucMcodes },
      { icon: '📊', title: 'Makro B', desc: 'Proměnné #, IF/WHILE, funkce, G65',      action: openFanucMacro },
      { icon: '🛠️', title: 'Nástroje', desc: 'Nastavení nože, korekce, opotřebení', action: openFanucOffsets },
      { icon: '🚨', title: 'Alarmy',  desc: 'Alarmy PS, OT, SV, SP a makro alarmy',  action: openFanucAlarms },
      { icon: '📝', title: 'Ukázky',  desc: 'Hrubování, závit, drážka, podprogram',   action: openFanucExamples }
    ]
  });
}
