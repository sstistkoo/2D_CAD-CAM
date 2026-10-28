// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Tlačítka novějších kalkulaček (Další kalkulačky)    ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Načítá se z app.js jako side-effect import: ui.js je na stropu velikosti
// (file-size-budget), proto se nová tlačítka napojují tady.

import { openArcCalc } from './arc.js';
import { openThermalCalc } from './thermal.js';
import { openVolumeCalc } from './volume.js';
import { openTorqueCalc } from './torque.js';
import './trigGeneral.js';                       // bridge.extendTrigCalc – záložka Obecný trojúhelník

document.getElementById('btnOpenArc')?.addEventListener('click', openArcCalc);
document.getElementById('btnOpenThermal')?.addEventListener('click', openThermalCalc);
document.getElementById('btnOpenVolume')?.addEventListener('click', openVolumeCalc);
document.getElementById('btnOpenTorque')?.addEventListener('click', openTorqueCalc);
