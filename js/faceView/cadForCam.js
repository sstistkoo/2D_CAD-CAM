// SKICA – kresby z CAD pro 📥 Z CAD / přenos do CAM samy (cam/live):
// čela (bokorys, faceDepth.faceDrawingsForCam) + díry a drážky pro pero
// v plášti (nárys, shellHoles / shellSlots) jako položka { kind: 'shell' }.
import { faceDrawingsForCam } from './faceDepth.js';
import { shellHolesForCam } from './shellHoles.js';
import { shellSlotsForCam } from './shellSlots.js';

export function cadDrawingsForCam() {
  const out = faceDrawingsForCam();
  const holes = shellHolesForCam();
  const { slots, errors } = shellSlotsForCam();
  if (!holes.length && !slots.length && !errors.length) return out;
  const sh = holes[0] || { kind: 'shell', holes: [], errors: [] };
  return [...out, { ...sh, slots, errors: [...sh.errors, ...errors] }];
}
