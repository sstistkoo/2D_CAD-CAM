// SKICA – kresby z CAD pro 📥 Z CAD / přenos do CAM samy (cam/live):
// čela (bokorys, faceDepth.faceDrawingsForCam) + díry a drážky pro pero
// v plášti (nárys, shellHoles / shellSlots) jako položka { kind: 'shell' }.
import { faceDrawingsForCam } from './faceDepth.js';
import { shellHolesForCam } from './shellHoles.js';
import { shellSlotsForCam } from './shellSlots.js';
import { faceSlotForCam } from './faceSlots.js';

export function cadDrawingsForCam() {
  // Drážky na čele (stadion, faceSlots.js) → úsečka osy se šířkou slotW.
  const out = faceDrawingsForCam().map(f => ({
    ...f, objects: f.objects.map(o => (o.type === 'polyline' ? faceSlotForCam(o, f.z, f.side) || o : o)),
  }));
  const holes = shellHolesForCam();
  const { slots, errors } = shellSlotsForCam();
  if (!holes.length && !slots.length && !errors.length) return out;
  const sh = holes[0] || { kind: 'shell', holes: [], errors: [] };
  return [...out, { ...sh, slots, errors: [...sh.errors, ...errors] }];
}
