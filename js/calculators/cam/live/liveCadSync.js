// Díry a drážky z CAD (◎ bokorys) do operací poháněných nástrojů SAMY při
// otevření CAM — dřív jen ručně 🛠 Operace → 📥 Z CAD a uživatel čekal, že
// se díry přenesou (uživatel 20. 10. 2026). Stejná cesta jako 📥 Z CAD
// (liveOpsFromCad): nahradí jen operace dřív načtené z CAD, ručně přidané
// zůstanou a převezme se jim nástroj, otáčky i hloubka. Když v CAD nic
// nakreslené není, nic se nemění (smazání načtených operací je dál ruční).
import { liveOpsFromCad } from './liveFromCad.js';
import { getLiveOps, liveSettings } from './liveModel.js';
import { cadDrawingsForCam } from '../../../faceView/cadForCam.js';

// Co z operace pochází z výkresu — porovnává se jen to (nástroj, otáčky,
// posuvy zůstávají z dřívější operace).
const GEO = ['kind', 'millType', 'side', 'holeD', 'zTop', 'faceDir', 'pattern', 'pcd', 'count',
  'startAngle', 'points', 'depth', 'slot', 'throughStock', 'xTop', 'zPos', 'throughWall', 'kz1', 'kz2', 'slotW',
  'role', 'pitch', 'spotD', 'thread'];

/** Otisk operací načtených z CAD (jen geometrie z výkresu). */
export function cadOpsSignature(ops) {
  return JSON.stringify((ops || []).filter(o => o.fromCad).map(o => GEO.map(k => o[k] ?? null)));
}

/**
 * Operace po přenosu z CAD, nebo null (v CAD nic / beze změny).
 * @param params S.params (liveOps)
 * @param geo livePartGeometry(S)
 * @param [drawings] kresby čel a díry v plášti (výchozí cadDrawingsForCam() — testy podstrčí)
 * @returns {{ ops, holes, slots, skipped }|null}
 */
export function cadSyncOps(params, geo, drawings = cadDrawingsForCam()) {
  const cur = getLiveOps(params);
  const res = liveOpsFromCad(drawings, geo, cur, liveSettings(params));
  if (!res.holes && !res.slots) return null;
  return cadOpsSignature(res.ops) === cadOpsSignature(cur) ? null : res;
}
