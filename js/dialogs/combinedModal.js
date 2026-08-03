// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Sloučené okno „Zadání objektu" (VK + číselné zadání) ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Jedno okno se dvěma záložkami místo dvou samostatných dialogů:
//   📐 VK – Volná kontura      (js/calculators/vkContour.js)
//   🔢 Číselné zadání objektu  (js/dialogs/numericalInput.js)
//
// Oba moduly exportují dvojici `render*Tab()` (čisté HTML) a
// `init*Tab(container)` (listenery + stav, vrací `{ destroy, refresh }`).
// Okno je staví vedle sebe, přepíná mezi nimi a při zavření zavolá
// `destroy()`, aby se neuchovaly globální listenery ani rozdělaný odběr
// kliku na plátno.

import { makeOverlay, onOverlayRemoved, makeDraggable } from '../dialogFactory.js';
import { state } from '../state.js';
import { bridge } from '../bridge.js';
import { renderVkTab, initVkTab } from '../calculators/vkContour.js';
import { renderNumericalTab, initNumericalTab } from './numericalInput.js';
import { createCanvasPicker } from './canvasPick.js';
// Side-effect: zaregistruje bridge.renderVkPreview / bridge.fitVkPreviewView,
// aby renderAll() uměl VK náhled nakreslit na CAD plátno.
import '../calculators/vkPreviewRender.js';
// Side-effect: zaregistruje bridge.commitVkToDrawing („Vložit do výkresu").
import '../calculators/vkCommit.js';

const OVERLAY_TYPE = 'vk-combined';

/** @type {{ key: string, label: string, title: string }[]} */
const TABS = [
  { key: 'vk', label: '📐 Volná kontura', title: '📐 VK – Volná kontura' },
  { key: 'num', label: '🔢 Číselné zadání', title: '🔢 Číselné zadání objektu' },
];

// Handly záložek k danému oknu – drží se stranou DOM, ať se na element
// nelepí stav (to byl přesně problém starého `overlay._polyVerts`).
const tabHandles = new WeakMap();

// Okno, kterému právě patří `state.vkPreview`. Úklid po zavření běží
// asynchronně (MutationObserver v onOverlayRemoved), takže bez téhle
// pojistky by zavření starého okna smazalo náhled tomu novému.
let activeOverlay = null;

function tabsHTML(parts) {
  const bar = TABS
    .map(tab => `<button type="button" class="tab-btn" data-tab="${tab.key}">${tab.label}</button>`)
    .join('');
  const bodies = TABS
    .map(tab => `<div class="tab-content" data-tab-content="${tab.key}">${parts[tab.key]}</div>`)
    .join('');
  return `<div class="tab-bar">${bar}</div>${bodies}`;
}

/** Přepne aktivní záložku, přepíše titulek okna a dá záložce šanci se překreslit. */
function switchTab(overlay, requested) {
  const tab = TABS.find(entry => entry.key === requested) || TABS[0];
  overlay.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab.key);
  });
  overlay.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.dataset.tabContent === tab.key);
  });
  const heading = overlay.querySelector('.calc-titlebar h3');
  if (heading) heading.textContent = tab.title;
  overlay.dataset.activeTab = tab.key;
  // Náhled VK patří k jeho záložce – na číselné by jen mátl.
  state.vkPreview.visible = tab.key === 'vk';
  tabHandles.get(overlay)?.[tab.key]?.refresh?.();
  bridge.renderAll?.();
}

/**
 * Otevře (nebo jen přepne) sloučené okno zadání objektu.
 * @param {'vk'|'num'} [initialTab]
 * @returns {HTMLElement|null} overlay, nebo null když ho nešlo vytvořit
 */
export function showCombinedModal(initialTab = 'vk') {
  // Okno už otevřené → jen přepnout záložku (nikdy neotevírat podruhé,
  // obě záložky mají stav v closure a sdílený localStorage klíč).
  const existing = document.querySelector(`.calc-overlay[data-type="${CSS.escape(OVERLAY_TYPE)}"]`);
  if (existing) {
    switchTab(existing, initialTab);
    return existing;
  }

  const parts = { vk: renderVkTab().html, num: renderNumericalTab().html };
  const overlay = makeOverlay(
    OVERLAY_TYPE,
    TABS[0].title,
    tabsHTML(parts),
    'vk-combined-window',
    // Plovoucí okno bez tmavého pozadí – plátno pod ním zůstává klikatelné,
    // takže jde kreslit s otevřeným oknem. ESC proto patří nástroji
    // (zrušit rozkreslený prvek), okno se zavírá křížkem.
    { float: true, closeOnEsc: false, closeOnBackdrop: false },
  );
  if (!overlay) return null;

  // Jeden sdílený odběr kliku na plátno pro obě záložky – nikdy nemůžou
  // být nabité dva naráz.
  const picker = createCanvasPicker();
  const handles = {
    vk: initVkTab(overlay.querySelector('[data-tab-content="vk"]'), { picker }),
    num: initNumericalTab(overlay.querySelector('[data-tab-content="num"]'), { picker }),
  };
  tabHandles.set(overlay, handles);
  activeOverlay = overlay;
  onOverlayRemoved(overlay, () => {
    picker.cancel();
    Object.values(handles).forEach(handle => handle?.destroy?.());
    tabHandles.delete(overlay);
    if (activeOverlay !== overlay) return;   // mezitím se otevřelo nové okno
    activeOverlay = null;
    state.vkPreview.visible = false;
    state.vkPreview.data = null;
    bridge.renderAll?.();
  });

  overlay.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(overlay, btn.dataset.tab));
  });
  makeDraggable(overlay.querySelector('.calc-window'), overlay.querySelector('.calc-titlebar'));
  switchTab(overlay, initialTab);
  return overlay;
}

/** Zpětně kompatibilní vstupy – obě staré funkce teď otevírají totéž okno. */
export function openVkContour() {
  return showCombinedModal('vk');
}

export function showNumericalInputDialog() {
  return showCombinedModal('num');
}
