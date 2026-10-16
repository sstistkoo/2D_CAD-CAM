// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Výběr barvy (duha, vlastní SV/hue/RGB, kapátko)     ║
// ╚══════════════════════════════════════════════════════════════╝

// Vyňato z js/ui.js beze změny (16. 10. 2026, docs/plan-refaktoringu-ui.md,
// Fáze 1e); jediná úprava je `export` u tří vstupů. Používá se pro barvu
// vrstvy (seznam vrstev), barvu výběru (panel vlastností) a Vybarvit
// (bridge.openFillColorPicker — přiřazuje ho dál js/ui.js). Kód aplikace
// importuje jen z js/ui.js, nikdy z js/ui/* napřímo.

import { COLORS, LINE_WIDTH, RAINBOW_PRESETS } from '../constants.js';
import { state, showToast } from '../state.js';
import { renderAllDebounced, resolveObjectColor } from '../render.js';
import { drawCanvas, screenToWorld } from '../canvas.js';
import { findObjectAt } from '../geometry.js';
import { onOverlayRemoved, closeOnBackdropClick } from '../dialogFactory.js';
import { updateObjectList } from '../ui.js';

// 7 základních barev duhy pro rychlý výběr barvy vrstvy jedním klikem.
const LAYER_RAINBOW_PRESETS = RAINBOW_PRESETS;

// ── HSV/RGB/HEX konverze pro vlastní color picker (barevná plocha + hue) ──
function _hexToRgb(hex) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16) || 0, g: parseInt(h.slice(2, 4), 16) || 0, b: parseInt(h.slice(4, 6), 16) || 0 };
}
function _rgbToHex(r, g, b) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
function _rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}
function _hexToHsv(hex) {
  const { r, g, b } = _hexToRgb(hex);
  return _rgbToHsv(r, g, b);
}
function _hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  let r, g, b;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

/**
 * Aktivuje jednorázový výběr barvy kliknutím na objekt na plátně ("kapátko").
 * Klik na prázdné místo (žádný objekt pod kurzorem) výběr zruší, místo aby
 * vzal barvu pozadí/mřížky — kapátko má smysl jen na skutečně nakreslený
 * objekt. Stejný vzor jako "Vybrat z mapy" jinde v appce (`numericalInput.js`
 * aj.) — dočasný `click`/`touchend` listener přímo na plátně se souřadnicemi
 * z `screenToWorld()`, ne přes `state.tool`/hlavní dispatch (ten je sdílený
 * všemi nástroji a pro jednorázový odběr je zbytečná komplikace navíc).
 * @param {{onPick:(color:string)=>void, onCancel:()=>void}} opts
 */
function pickColorFromCanvas({ onPick, onCancel }) {
  const prevCursor = drawCanvas.style.cursor;
  drawCanvas.style.cursor = 'crosshair';
  showToast('Klikněte na objekt, jehož barvu chcete použít (klik do prázdna = zrušit)');

  let settled = false;
  function cleanup() {
    if (settled) return;
    settled = true;
    drawCanvas.removeEventListener('click', onClick);
    drawCanvas.removeEventListener('touchend', onTouch);
    document.removeEventListener('keydown', onKeydown, true);
    drawCanvas.style.cursor = prevCursor;
  }
  function pick(sx, sy) {
    const [wx, wy] = screenToWorld(sx, sy);
    const idx = findObjectAt(wx, wy);
    cleanup();
    if (idx == null) { onCancel(); return; }
    onPick(resolveObjectColor(state.objects[idx]));
  }
  function onClick(e) {
    const rect = drawCanvas.getBoundingClientRect();
    pick(e.clientX - rect.left, e.clientY - rect.top);
  }
  function onTouch(e) {
    if (e.changedTouches.length !== 1) return;
    e.preventDefault();
    const t = e.changedTouches[0];
    const rect = drawCanvas.getBoundingClientRect();
    pick(t.clientX - rect.left, t.clientY - rect.top);
  }
  function onKeydown(e) {
    if (e.key === 'Escape') { e.stopPropagation(); cleanup(); onCancel(); }
  }
  drawCanvas.addEventListener('click', onClick);
  drawCanvas.addEventListener('touchend', onTouch);
  document.addEventListener('keydown', onKeydown, true);
}

/**
 * Otevře obecný popover pro výběr barvy (7 barev duhy + vlastní + kapátko),
 * volitelně i s ovládáním tloušťky čáry a/nebo průhlednosti. Používá se pro
 * barvu vrstvy, hromadnou změnu barvy vybraných objektů i pro výplně
 * (Vybarvit). Změny se aplikují průběžně (živý náhled); potvrdí je až
 * tlačítko OK, zatímco ✕/Escape/klik mimo dialog vše vrátí zpět (onCancel).
 * @param {{title:string, currentColor:string, onColor:(c:string)=>void,
 *          currentWidth?:number, onWidth?:(w:number)=>void,
 *          currentAlpha?:number, onAlpha?:(a:number)=>void,
 *          onCancel?:()=>void}} opts
 */
function openColorPicker(opts) {
  const { title, currentColor, onColor, currentWidth, onWidth, currentAlpha, onAlpha, onCancel } = opts;
  document.querySelector('.color-popover-overlay')?.remove();

  // Sleduje aktuální (živě už aplikovanou) hodnotu — potřeba při znovuotevření
  // dialogu po kapátku, aby se předchozí volby (barva/tloušťka/průhlednost)
  // z téže relace neztratily.
  let liveColor = currentColor;
  let liveWidth = currentWidth;
  let liveAlpha = currentAlpha;
  const reopen = () => openColorPicker({ ...opts, currentColor: liveColor, currentWidth: liveWidth, currentAlpha: liveAlpha });

  const overlay = document.createElement('div');
  overlay.className = 'input-overlay color-popover-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'input-dialog color-popover-dialog';

  let settled = false;
  function finish(confirmed) {
    if (settled) return;
    settled = true;
    if (!confirmed && onCancel) onCancel();
    document.removeEventListener('keydown', onKeydown, true);
    overlay.remove();
  }
  function onKeydown(e) {
    if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
  }
  document.addEventListener('keydown', onKeydown, true);

  const header = document.createElement('div');
  header.className = 'color-popover-header';
  const titleEl = document.createElement('h3');
  titleEl.textContent = title;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'color-popover-close';
  closeBtn.innerHTML = '✕';
  closeBtn.title = 'Zrušit';
  closeBtn.addEventListener('click', () => finish(false));
  header.appendChild(titleEl);
  header.appendChild(closeBtn);

  const swatchRow = document.createElement('div');
  swatchRow.className = 'color-swatch-row';
  const swatchBtns = [];
  const setActiveSwatch = (c) => {
    swatchBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.color.toLowerCase() === c.toLowerCase()));
  };
  LAYER_RAINBOW_PRESETS.forEach((c) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.color = c;
    btn.className = 'color-swatch-btn' + (c.toLowerCase() === currentColor.toLowerCase() ? ' active' : '');
    btn.style.background = c;
    btn.title = c;
    btn.addEventListener('click', () => {
      liveColor = c;
      onColor(c);
      hsv = _hexToHsv(c);
      applyFromHsv(false);
      setActiveSwatch(c);
    });
    swatchBtns.push(btn);
    swatchRow.appendChild(btn);
  });

  // ── Vlastní barva: vlastní SV plocha + hue pruh + RGB pole + kapátko ──
  // Žádný nativní input[type=color] — jeho popup je OS/prohlížečem umístěný
  // mimo naši kontrolu a na úzkých mobilních viewportech se vykresloval
  // úplně mimo obrazovku. Tohle se vždy vejde do stejného dialogu.
  const customRow = document.createElement('div');
  customRow.className = 'color-popover-custom';
  const customLabel = document.createElement('label');
  customLabel.textContent = 'Vlastní barva';
  const customToggle = document.createElement('button');
  customToggle.type = 'button';
  customToggle.className = 'color-popover-swatch-toggle';
  customToggle.style.background = currentColor;
  customToggle.title = 'Vlastní barva';
  customRow.appendChild(customLabel);
  customRow.appendChild(customToggle);

  const customPanel = document.createElement('div');
  customPanel.className = 'custom-picker-panel';
  customPanel.hidden = true;

  let hsv = _hexToHsv(currentColor);

  const svArea = document.createElement('div');
  svArea.className = 'custom-picker-sv';
  const svWhite = document.createElement('div');
  svWhite.className = 'custom-picker-sv-white';
  const svBlack = document.createElement('div');
  svBlack.className = 'custom-picker-sv-black';
  const svCursor = document.createElement('div');
  svCursor.className = 'custom-picker-sv-cursor';
  svArea.appendChild(svWhite);
  svArea.appendChild(svBlack);
  svArea.appendChild(svCursor);

  const ctrlRow = document.createElement('div');
  ctrlRow.className = 'custom-picker-row';
  const pickerEyedrop = document.createElement('button');
  pickerEyedrop.type = 'button';
  pickerEyedrop.className = 'color-popover-eyedrop';
  pickerEyedrop.innerHTML = '💧';
  pickerEyedrop.title = 'Vzít barvu z plátna';
  const preview = document.createElement('div');
  preview.className = 'custom-picker-preview';
  const hueInput = document.createElement('input');
  hueInput.type = 'range';
  hueInput.className = 'custom-picker-hue';
  hueInput.min = '0';
  hueInput.max = '359';
  ctrlRow.appendChild(pickerEyedrop);
  ctrlRow.appendChild(preview);
  ctrlRow.appendChild(hueInput);

  const rgbRow = document.createElement('div');
  rgbRow.className = 'custom-picker-rgb';
  const mkNum = (labelText) => {
    const wrap = document.createElement('div');
    wrap.className = 'custom-picker-num';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = '255';
    const lbl = document.createElement('span');
    lbl.textContent = labelText;
    wrap.appendChild(input);
    wrap.appendChild(lbl);
    rgbRow.appendChild(wrap);
    return input;
  };
  const rInput = mkNum('R');
  const gInput = mkNum('G');
  const bInput = mkNum('B');

  customPanel.appendChild(svArea);
  customPanel.appendChild(ctrlRow);
  customPanel.appendChild(rgbRow);

  function applyFromHsv(commit) {
    const { r, g, b } = _hsvToRgb(hsv.h, hsv.s, hsv.v);
    const hex = _rgbToHex(r, g, b);
    svArea.style.background = `hsl(${hsv.h}, 100%, 50%)`;
    svCursor.style.left = `${hsv.s * 100}%`;
    svCursor.style.top = `${(1 - hsv.v) * 100}%`;
    hueInput.value = String(Math.round(hsv.h));
    preview.style.background = hex;
    customToggle.style.background = hex;
    rInput.value = String(Math.round(r));
    gInput.value = String(Math.round(g));
    bInput.value = String(Math.round(b));
    if (commit) {
      liveColor = hex;
      onColor(hex);
      setActiveSwatch(hex);
    }
  }
  applyFromHsv(false);

  function svPointerHandler(e) {
    const rect = svArea.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    hsv.s = Math.max(0, Math.min(1, cx / rect.width));
    hsv.v = Math.max(0, Math.min(1, 1 - cy / rect.height));
    applyFromHsv(true);
  }
  let svDragging = false;
  svArea.addEventListener('mousedown', (e) => { svDragging = true; svPointerHandler(e); });
  // Tažení pokračuje i mimo plochu → listenery na window. Odebrat, jakmile
  // okno zmizí (OK, ✕, Escape, klik mimo, kapátko) — dřív zůstávaly a každé
  // otevření pickeru přidalo další dva.
  const onWinMouseMove = (e) => { if (svDragging) svPointerHandler(e); };
  const onWinMouseUp = () => { svDragging = false; };
  window.addEventListener('mousemove', onWinMouseMove);
  window.addEventListener('mouseup', onWinMouseUp);
  onOverlayRemoved(overlay, () => {
    window.removeEventListener('mousemove', onWinMouseMove);
    window.removeEventListener('mouseup', onWinMouseUp);
  });
  svArea.addEventListener('touchstart', (e) => { svDragging = true; svPointerHandler(e); e.preventDefault(); }, { passive: false });
  svArea.addEventListener('touchmove', (e) => { if (svDragging) { svPointerHandler(e); e.preventDefault(); } }, { passive: false });
  svArea.addEventListener('touchend', () => { svDragging = false; });

  hueInput.addEventListener('input', () => {
    hsv.h = parseFloat(hueInput.value);
    applyFromHsv(true);
  });

  function onRgbInput() {
    const r = Math.max(0, Math.min(255, parseInt(rInput.value, 10) || 0));
    const g = Math.max(0, Math.min(255, parseInt(gInput.value, 10) || 0));
    const b = Math.max(0, Math.min(255, parseInt(bInput.value, 10) || 0));
    hsv = _rgbToHsv(r, g, b);
    applyFromHsv(true);
  }
  rInput.addEventListener('input', onRgbInput);
  gInput.addEventListener('input', onRgbInput);
  bInput.addEventListener('input', onRgbInput);

  customToggle.addEventListener('click', () => {
    customPanel.hidden = !customPanel.hidden;
  });

  pickerEyedrop.addEventListener('click', () => {
    overlay.remove();
    document.removeEventListener('keydown', onKeydown, true);
    pickColorFromCanvas({
      onPick: (c) => {
        hsv = _hexToHsv(c);
        liveColor = c;
        onColor(c);
        reopen();
      },
      onCancel: () => reopen(),
    });
  });

  dialog.appendChild(header);
  dialog.appendChild(swatchRow);
  dialog.appendChild(customRow);
  dialog.appendChild(customPanel);

  if (onWidth) {
    const widthRow = document.createElement('div');
    widthRow.className = 'color-popover-width';
    const widthLabel = document.createElement('label');
    widthLabel.textContent = 'Tloušťka čáry';
    const widthInput = document.createElement('input');
    widthInput.type = 'range';
    widthInput.min = '0.5';
    widthInput.max = '5';
    widthInput.step = '0.25';
    widthInput.value = String(currentWidth);
    const widthVal = document.createElement('span');
    widthVal.className = 'color-popover-width-val';
    widthVal.textContent = `${currentWidth} px`;
    widthInput.addEventListener('input', () => {
      const w = parseFloat(widthInput.value);
      liveWidth = w;
      widthVal.textContent = `${w} px`;
      onWidth(w);
    });
    widthRow.appendChild(widthLabel);
    widthRow.appendChild(widthInput);
    widthRow.appendChild(widthVal);
    dialog.appendChild(widthRow);
  }

  if (onAlpha) {
    const alphaRow = document.createElement('div');
    alphaRow.className = 'color-popover-width';
    const alphaLabel = document.createElement('label');
    alphaLabel.textContent = 'Průhlednost';
    const alphaInput = document.createElement('input');
    alphaInput.type = 'range';
    alphaInput.min = '0.05';
    alphaInput.max = '1';
    alphaInput.step = '0.05';
    alphaInput.value = String(currentAlpha);
    const alphaVal = document.createElement('span');
    alphaVal.className = 'color-popover-width-val';
    alphaVal.textContent = `${Math.round(currentAlpha * 100)} %`;
    alphaInput.addEventListener('input', () => {
      const a = parseFloat(alphaInput.value);
      liveAlpha = a;
      alphaVal.textContent = `${Math.round(a * 100)} %`;
      onAlpha(a);
    });
    alphaRow.appendChild(alphaLabel);
    alphaRow.appendChild(alphaInput);
    alphaRow.appendChild(alphaVal);
    dialog.appendChild(alphaRow);
  }

  const okRow = document.createElement('div');
  okRow.className = 'color-popover-actions';
  const okBtn = document.createElement('button');
  okBtn.type = 'button';
  okBtn.className = 'color-popover-ok';
  okBtn.textContent = 'OK';
  okBtn.addEventListener('click', () => finish(true));
  okRow.appendChild(okBtn);
  dialog.appendChild(okRow);

  overlay.appendChild(dialog);
  // Klik mimo dialog zruší výběr jen se stiskem na pozadí — tažení z dialogu
  // (SV plocha, posuvníky) puštěné nad pozadím picker nezruší.
  closeOnBackdropClick(overlay, () => finish(false));
  document.body.appendChild(overlay);
}

/** Otevře popover pro výběr barvy a tloušťky čáry vrstvy. */
export function openLayerColorPicker(layer, anchorBtn) {
  const originalColor = layer.color;
  const originalWidth = layer.lineWidth;
  openColorPicker({
    title: `Barva vrstvy „${layer.name}“`,
    currentColor: layer.color,
    onColor: (c) => {
      layer.color = c;
      anchorBtn.style.background = c;
      renderAllDebounced();
    },
    currentWidth: layer.lineWidth ?? LINE_WIDTH,
    onWidth: (w) => {
      layer.lineWidth = w;
      renderAllDebounced();
    },
    onCancel: () => {
      layer.color = originalColor;
      layer.lineWidth = originalWidth;
      anchorBtn.style.background = originalColor;
      renderAllDebounced();
    },
  });
}

/** Otevře popover pro hromadnou změnu barvy všech vybraných objektů. */
export function openObjectColorPicker(objs, anchorBtn) {
  const first = objs[0];
  const originalColors = objs.map((o) => o.color);
  openColorPicker({
    title: objs.length > 1 ? `Barva (${objs.length} objektů)` : 'Barva objektu',
    currentColor: first.color || COLORS.primary,
    onColor: (c) => {
      objs.forEach((o) => { o.color = c; });
      if (anchorBtn) anchorBtn.style.background = c;
      renderAllDebounced();
    },
    onCancel: () => {
      objs.forEach((o, i) => { o.color = originalColors[i]; });
      if (anchorBtn) anchorBtn.style.background = originalColors[0] || COLORS.primary;
      renderAllDebounced();
    },
  });
}

/** Otevře popover pro barvu a průhlednost nově vytvořené výplně (nástroj Vybarvit). */
export function openFillColorPicker(fillObj) {
  openColorPicker({
    title: 'Vybarvit',
    currentColor: fillObj.color,
    onColor: (c) => { fillObj.color = c; renderAllDebounced(); },
    currentAlpha: fillObj.alpha,
    onAlpha: (a) => { fillObj.alpha = a; renderAllDebounced(); },
    onCancel: () => {
      // Zrušit celé vybarvení — smazat nově vytvořenou výplň úplně,
      // ne jen vrátit barvu (uživatel si rozmyslel vyplnit tuhle plochu).
      const idx = state.objects.indexOf(fillObj);
      if (idx !== -1) state.objects.splice(idx, 1);
      updateObjectList();
      renderAllDebounced();
    },
  });
}
