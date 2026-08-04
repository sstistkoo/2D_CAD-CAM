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
import { autoCenterView } from '../canvas.js';
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

// Záložky bydlí v LIŠTĚ okna (vedle ✕), ne nad formulářem – na mobilu je
// každý ušetřený řádek nad plátnem znát. Pořadí je dané zvlášť, protože
// v liště je mezi nimi ještě ⤢ (vycentrovat plátno na rozepsaný prvek).
const TITLEBAR_ORDER = ['num', 'fit', 'vk'];

// Handly záložek k danému oknu – drží se stranou DOM, ať se na element
// nelepí stav (to byl přesně problém starého `overlay._polyVerts`).
const tabHandles = new WeakMap();

// Okno, kterému právě patří `state.vkPreview`. Úklid po zavření běží
// asynchronně (MutationObserver v onOverlayRemoved), takže bez téhle
// pojistky by zavření starého okna smazalo náhled tomu novému.
let activeOverlay = null;

function tabsHTML(parts) {
  return TABS
    .map(tab => `<div class="tab-content" data-tab-content="${tab.key}">${parts[tab.key]}</div>`)
    .join('');
}

/** Ovládání do lišty okna – záložky a ⤢, vše před křížkem. */
function titlebarControlsHTML() {
  return TITLEBAR_ORDER
    .map(key => {
      if (key === 'fit') {
        return '<button type="button" class="calc-titlebar-btn" data-act="fit-view"'
          + ' title="Vycentrovat plátno na rozepsaný prvek">⤢</button>';
      }
      const tab = TABS.find(entry => entry.key === key);
      return `<button type="button" class="tab-btn" data-tab="${tab.key}" title="${tab.title}">${tab.label}</button>`;
    })
    .join('');
}

/**
 * Vycentruje plátno podle právě otevřené záložky. Když náhled ještě nemá co
 * ukázat, spadne to na vycentrování celého výkresu – aby tlačítko nikdy
 * „nic neudělalo".
 * @param {HTMLElement} overlay
 */
function fitViewForActiveTab(overlay) {
  const tab = overlay.dataset.activeTab === 'num' ? 'num' : 'vk';
  if (tab === 'vk') {
    // Náhled se přepočítá až při změně pole – před rámováním ho srovnat.
    tabHandles.get(overlay)?.vk?.refreshNow?.();
    if (bridge.fitVkPreviewView?.({ quiet: true })) return;
  } else if (bridge.fitNumPreviewView?.()) {
    return;
  }
  autoCenterView();
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
  overlay.dataset.activeTab = tab.key;
  // Náhled VK patří k jeho záložce – na číselné by jen mátl.
  state.vkPreview.visible = tab.key === 'vk';
  // A obráceně: živý náhled Číselného zadání patří jen jemu.
  state.numPreview.visible = tab.key === 'num';
  // Totéž platí pro kreslení myší: mimo VK záložku nemá klik kam zapsat.
  if (tab.key !== 'vk') tabHandles.get(overlay)?.vk?.stopDrawMode?.();
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

  // Lišta okna nese i záložky a ⤢ – titulek by jen zabíral řádek navíc.
  // Křížek zůstává poslední a se svým listenerem z makeOverlay().
  const titlebar = overlay.querySelector('.calc-titlebar');
  titlebar.classList.add('calc-titlebar-tabs');
  titlebar.querySelector('h3')?.remove();
  titlebar.querySelector('.calc-close-btn').insertAdjacentHTML('beforebegin', titlebarControlsHTML());

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
    state.numPreview.visible = false;
    state.numPreview.data = null;
    bridge.renderAll?.();
  });

  overlay.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(overlay, btn.dataset.tab));
  });
  titlebar.querySelector('[data-act="fit-view"]').addEventListener('click', () => fitViewForActiveTab(overlay));
  makeDraggable(overlay.querySelector('.calc-window'), titlebar);
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
