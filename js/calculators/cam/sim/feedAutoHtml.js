// ╔══════════════════════════════════════════════════════════════╗
// ║  Pravý panel CAM: řádky „Auto" a „Nepřejíždět mezi hrby"       ║
// ╚══════════════════════════════════════════════════════════════╝
// Patří do bloku posuvů (paramsMachiningHtml.js). Události drží
// paramsEventsMachining.js, logiku cam/feedAuto.js a ops/sections/humpFirst.js.

import { humpFirstApplies } from './humpFirstOption.js';

// Blok posuvů je sbalovací (uživatel 12. 11. 2026: „ať tolik nezabírají").
// Panel se po každé změně kreslí znovu, proto se stav rozbalení drží tady.
let _feedOpen = false;
export const setFeedGroupOpen = (v) => { _feedOpen = !!v; };

/** Sbalovací blok „Posuvy" kolem řádků posuvu; v hlavičce stručný stav. */
export function feedGroup(prms, inner) {
  const n = ['arcFeedComp', 'finRaOn', 'feedCornerOn', 'feedPlungeOn', 'chipThinOn', 'humpFirst']
    .filter((k) => prms[k] === true).length;
  const info = prms.feedAuto ? 'Auto' : (n > 0 ? `zapnuto ${n}` : 'vypnuto');
  return `<details id="cam-sim-feedgroup" style="margin:4px 0;border:1px solid #45475a;border-radius:6px;padding:2px 6px"${_feedOpen ? ' open' : ''}>
      <summary style="cursor:pointer;padding:4px 0;font-size:12px;color:#cdd6f4;user-select:none">Posuvy <span style="color:#a6adc8;font-size:11px">(${info})</span></summary>
      ${inner}
    </details>`;
}

/** Zaškrtávátko Auto nad volbami posuvu. */
export function feedAutoRow(prms) {
  return `<div class="cam-sim-checkbox-row" data-tooltip="Auto: zapne všechny úpravy posuvu níž a nastaví je samo — konstantní posuv na oblouku, F dokončení z Ra 1,6 a rε destičky (strop 2 × F), 50 % ve vnitřním rohu a při zanoření, konstantní tloušťka třísky (strop 2 × F) a Nepřejíždět mezi hrby. Jednotlivé volby jdou i s Auto vypnout zaškrtávátkem; hodnoty v polích ale dopočítává Auto (pole jsou zamčená). Po vypnutí Auto zůstanou hodnoty a jdou upravit ručně.">
      <input type="checkbox" id="cam-sim-feedauto" ${prms.feedAuto ? 'checked' : ''}>
      <span>Auto (posuvy nastavit samy)</span>
    </div>`;
}

/** Zaškrtávátko „Nepřejíždět mezi hrby" (jen Hrub., podélně, soustruh). */
export function humpFirstRow(prms) {
  if (!humpFirstApplies(prms)) return '';
  return `<div class="cam-sim-checkbox-row" data-tooltip="Platí pro ✂ Po úsecích. Když polotovar nad dílem tvoří dva hrby s údolím mezi nimi, vrstvy jinak jedou přes oba a mezi nimi přejíždějí rychloposuvem. Zapnuto: napřed první hrb do hloubky dna údolí, pak druhý hrb, a teprve potom pod dnem údolí oba vcelku — řetěz zanoření tam pokračuje až dolů. Dokončení jede jednou na konci.">
      <input type="checkbox" id="cam-sim-humpfirst" ${prms.humpFirst ? 'checked' : ''}>
      <span>Nepřejíždět mezi hrby</span>
    </div>`;
}
