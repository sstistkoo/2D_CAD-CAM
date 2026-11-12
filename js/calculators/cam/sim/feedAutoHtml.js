// ╔══════════════════════════════════════════════════════════════╗
// ║  Pravý panel CAM: řádky „Auto" a „Nepřejíždět mezi hrby"       ║
// ╚══════════════════════════════════════════════════════════════╝
// Patří do bloku posuvů (paramsMachiningHtml.js). Události drží
// paramsEventsMachining.js, logiku cam/feedAuto.js a ops/sections/humpFirst.js.

import { humpFirstApplies } from './humpFirstOption.js';

/** Zaškrtávátko Auto nad volbami posuvu. */
export function feedAutoRow(prms) {
  return `<div class="cam-sim-checkbox-row" data-tooltip="Auto: zapne všechny úpravy posuvu níž a nastaví je samo — konstantní posuv na oblouku, F dokončení z Ra 1,6 a rε destičky (strop 2 × F), 50 % ve vnitřním rohu a při zanoření, konstantní tloušťka třísky (strop 2 × F) a Nepřejíždět mezi hrby. Dokud je zapnuté, pole se nedají měnit; po vypnutí zůstanou hodnoty a jdou upravit ručně.">
      <input type="checkbox" id="cam-sim-feedauto" ${prms.feedAuto ? 'checked' : ''}>
      <span>Auto (posuvy nastavit samy)</span>
    </div>`;
}

/** Zaškrtávátko „Nepřejíždět mezi hrby" (jen Hrub., podélně, soustruh). */
export function humpFirstRow(prms) {
  if (!humpFirstApplies(prms)) return '';
  const lock = !!prms.feedAuto;
  return `<div class="cam-sim-checkbox-row" data-tooltip="Platí pro ✂ Po úsecích. Když polotovar nad dílem tvoří dva hrby s údolím mezi nimi, vrstvy jinak jedou přes oba a mezi nimi přejíždějí rychloposuvem. Zapnuto: napřed první hrb do hloubky dna údolí, pak druhý hrb, a teprve potom pod dnem údolí oba vcelku — řetěz zanoření tam pokračuje až dolů. Dokončení jede jednou na konci.">
      <input type="checkbox" id="cam-sim-humpfirst" ${prms.humpFirst ? 'checked' : ''}${lock ? ' disabled' : ''}>
      <span>Nepřejíždět mezi hrby</span>
    </div>`;
}
