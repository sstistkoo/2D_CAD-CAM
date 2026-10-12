// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Tlačítka novějších kalkulaček (Další kalkulačky)    ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Načítá se z app.js jako side-effect import: ui.js je na stropu velikosti
// (file-size-budget), proto se nová tlačítka napojují tady.

import { openArcCalc } from './arc.js';
import { openThermalCalc } from './thermal.js';

document.getElementById('btnOpenArc')?.addEventListener('click', openArcCalc);
document.getElementById('btnOpenThermal')?.addEventListener('click', openThermalCalc);
