// SKICA – nástroj Díra: jedna díra do čela bokorysu
// Klepnutí do bokorysu (SNAP chytá střed, kružnice podkladu, mřížku) otevře
// okno ◎ Díra do čela s polohou vůči středu čela (calculators/singleHole.js).
// Bez zapnutého bokorysu se okno otevře s X0 Y0 — „◎ Do čela" bokorys zapne.
import { showToast } from '../state.js';
import { setHint } from '../ui.js';
import { faceViewOn, getFaceLayer } from '../faceView/faceLayer.js';
import { inFaceDisc } from '../faceView/faceReference.js';
import { openSingleHoleCalc } from '../calculators/singleHole.js';

export function handleFaceHoleClick(wx, wy) {
  const face = faceViewOn() ? getFaceLayer() : null;
  if (face && face.origin) {
    if (!inFaceDisc(wx, wy)) { showToast('Díra: klepněte do bokorysu (pohled na čelo vpravo) na místo díry'); return; }
    openSingleHoleCalc({ x: wx - face.origin.x, y: wy - face.origin.y });
  } else {
    openSingleHoleCalc();
  }
  setHint('Zadejte Ø díry a hloubku → ◎ Do čela');
}
