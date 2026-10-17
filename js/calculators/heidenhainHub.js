import { openControlHub, openRefList, openRefExamples } from './ctrlRefViewer.js';
import { hhKlartextGroups, hhKlartextItems, hhIsoGroups, hhIsoItems, hhMGroups, hhMItems } from './heidenhainRefData.js';
import { openHeidenhainAlarms } from './heidenhainAlarms.js';
import { openHeidenhainTools } from './heidenhainTools.js';
import { hhQGroups, hhQItems, hhCycleGroups, hhCycleItems, hhExamples } from './heidenhainRefCycles.js';

const T = 'Heidenhain TNC 640';

export function openHeidenhainKlartext() {
  openRefList({
    type: 'hh-klartext', title: `⚙️ ${T} – Klartext`, placeholder: 'Hledat příkaz…',
    groups: hhKlartextGroups, items: hhKlartextItems
  });
}

export function openHeidenhainIso() {
  openRefList({
    type: 'hh-iso', title: `💻 ${T} – ISO G kódy`, placeholder: 'Hledat G kód…',
    groups: hhIsoGroups, items: hhIsoItems, windowClass: 'gc-window cm-window'
  });
}

export function openHeidenhainM() {
  openRefList({
    type: 'hh-m', title: `🔧 ${T} – M funkce`, placeholder: 'Hledat M funkci…',
    groups: hhMGroups, items: hhMItems, windowClass: 'gc-window mc-window'
  });
}

export function openHeidenhainQ() {
  openRefList({
    type: 'hh-q', title: `📊 ${T} – Q-parametry`, placeholder: 'Hledat Q / FN…',
    groups: hhQGroups, items: hhQItems, windowClass: 'gc-window sv-window'
  });
}

export function openHeidenhainCycles() {
  openRefList({
    type: 'hh-cycles', title: `🔩 ${T} – Cykly`, placeholder: 'Hledat číslo cyklu…',
    groups: hhCycleGroups, items: hhCycleItems
  });
}

export function openHeidenhainExamples() {
  openRefExamples({ type: 'hh-examples', title: `📝 Ukázky – ${T}`, examples: hhExamples });
}

export function openHeidenhainHub() {
  openControlHub({
    type: 'heidenhain', title: '🏭 Heidenhain',
    subtitle: `${T} – referenční příručka pro CNC soustruh (Klartext + ISO)`,
    tiles: [
      { icon: '⚙️', title: 'Klartext',    desc: 'L, C, CR, CT, TOOL CALL, APPR/DEP', action: openHeidenhainKlartext },
      { icon: '💻', title: 'ISO G kódy',  desc: 'G-kódy, jak je generuje SKICA',      action: openHeidenhainIso },
      { icon: '🔧', title: 'M funkce',    desc: 'Pomocné funkce',                     action: openHeidenhainM },
      { icon: '📊', title: 'Q-parametry', desc: 'Proměnné Q, FN funkce, skoky',       action: openHeidenhainQ },
      { icon: '🔩', title: 'Cykly',       desc: 'Vrtání a soustružnické cykly 8xx',   action: openHeidenhainCycles },
      { icon: '🛠️', title: 'Nástroje',    desc: 'Tabulka nožů, opotřebení DXL/DZL',   action: openHeidenhainTools },
      { icon: '🚨', title: 'Chyby',       desc: 'Chybová hlášení a FN 14 ERROR',      action: openHeidenhainAlarms },
      { icon: '📝', title: 'Ukázky',      desc: 'Programy s komentáři',               action: openHeidenhainExamples }
    ]
  });
}
