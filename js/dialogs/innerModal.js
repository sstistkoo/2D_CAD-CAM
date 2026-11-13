// Vnitřní okna uvnitř jiného okna (číselník, úhel, sražení, nápověda… v CNC/CAM editoru).
// Esc i tlačítko Zpět mají zavřít NEJDŘÍV je – ne celé okno pod nimi (kreslicí editor
// by se zavřel a rovnou vykreslil kód na plátno).

import './innerModalViewport.js';   // okna drží ve viditelné ploše nad klávesnicí

const INNER_SELECTOR = '.cne-inner-modal';
const CLOSE_SELECTOR = '.cne-im-close, [data-act$="Cancel"], [data-act$="Close"]';

/**
 * Zavře nejvrchnější viditelné vnitřní okno v `overlay` jeho vlastním křížkem
 * (aby proběhl úklid, např. uložení nastavení), jinak ho jen skryje.
 * @param {Element} overlay
 * @returns {boolean} `true` = nějaké vnitřní okno se zavřelo
 */
export function closeInnerModal(overlay) {
  if (!overlay) return false;
  const open = [...overlay.querySelectorAll(INNER_SELECTOR)]
    .filter(m => m.style.display !== 'none');
  const top = open[open.length - 1];   // později v DOM = nad ostatními
  if (!top) return false;
  const btn = top.querySelector(CLOSE_SELECTOR);
  if (btn) btn.click();
  if (top.style.display !== 'none') top.style.display = 'none';   // křížek bez obsluhy → aspoň skrýt
  return true;
}
