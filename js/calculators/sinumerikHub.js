import { makeOverlay } from '../dialogFactory.js';
import { openGcodeReference }    from './gcode.js';
import { openMcodeReference }    from './mcode.js';
import { openSysvarReference }   from './sysvar.js';
import { openShortcutsReference } from './shortcuts.js';
import { openCommandsReference } from './commands.js';
import { openCncExamples }       from './cncExamples.js';
import { openCncEditor }         from './cncEditor.js';
import { openHelp }              from './help.js';
import { openCamSimulator }      from './camSimulator.js';

// ── Dlaždice rozcestníku ────────────────────────────────────
const tiles = [
  { icon: '⚙️', title: 'G kódy',      desc: 'Pohybové a přípravné funkce',        action: openGcodeReference },
  { icon: '🔧', title: 'M kódy',      desc: 'Pomocné strojní funkce',              action: openMcodeReference },
  { icon: '💻', title: 'Příkazy',     desc: 'Příkazy & syntax programování',       action: openCommandsReference },
  { icon: '📊', title: 'Proměnné',    desc: 'Systémové proměnné ($P_, $AA_…)',     action: openSysvarReference },
  { icon: '⌨️', title: 'Zkratky',     desc: 'Klávesové zkratky displeje',          action: openShortcutsReference },
  { icon: '📝', title: 'Ukázky',      desc: 'Ukázky CNC kódů s komentáři',        action: openCncExamples },
  { icon: '✏️', title: 'Editor',      desc: 'CNC editor se zvýrazňováním syntaxe', action: openCncEditor },
  { icon: '🔄', title: 'CAM',         desc: 'Simulátor soustružnických drah',      action: openCamSimulator },
  { icon: '❓', title: 'Nápověda',    desc: 'Popis funkcí a ovládání',             action: openHelp }
];

// ── Hlavní funkce ───────────────────────────────────────────
export function openSinumerikHub() {
  const tilesHTML = tiles.map((t, i) => `
    <button class="sn-tile" data-idx="${i}">
      <span class="sn-tile-icon">${t.icon}</span>
      <span class="sn-tile-title">${t.title}</span>
      <span class="sn-tile-desc">${t.desc}</span>
    </button>
  `).join('');

  const bodyHTML = `
    <div class="sn-subtitle">Sinumerik 840D – referenční příručka pro CNC soustruh</div>
    <div class="sn-grid">${tilesHTML}</div>
  `;

  const overlay = makeOverlay('sinumerik', '🏭 Sinumerik 840D', bodyHTML, 'sn-window');
  if (!overlay) return;

  overlay.querySelector('.sn-grid').addEventListener('click', e => {
    const tile = e.target.closest('.sn-tile');
    if (!tile) return;
    const idx = Number(tile.dataset.idx);
    overlay.remove();
    tiles[idx].action();
  });
}
