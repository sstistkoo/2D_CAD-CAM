// SKICA – nástroj Díra: díra do čela (bokorys) nebo do pláště (nárys)
// Klepnutí do bokorysu (SNAP chytá střed, kružnice podkladu, mřížku) otevře
// okno ◎ Díra do čela s polohou vůči středu čela (calculators/singleHole.js).
// Klepnutí v NÁRYSU na díl (obrys / materiál v místě díry) otevře ⊥ Díra do
// pláště se Z z klepnutí (calculators/shellHole.js, uživatel 22. 10. 2026);
// klepnutí na existující díru v plášti ji otevře k úpravě.
// Bez zapnutého bokorysu a mimo díl se otevře díra do čela s X0 Y0 —
// „◎ Do čela" bokorys zapne.
import { showToast } from '../state.js';
import { setHint } from '../ui.js';
import { faceViewOn, getFaceLayer } from '../faceView/faceLayer.js';
import { inFaceDisc } from '../faceView/faceReference.js';
import { shellHoleZ, shellZAt } from '../faceView/shellHoles.js';
import { shellHoleAt } from '../faceView/shellHoleDraw.js';
import { openSingleHoleCalc } from '../calculators/singleHole.js';
import { openShellHoleCalc } from '../calculators/shellHole.js';

export function handleFaceHoleClick(wx, wy) {
  const face = faceViewOn() ? getFaceLayer() : null;
  if (face && face.origin && inFaceDisc(wx, wy)) {
    openSingleHoleCalc({ x: wx - face.origin.x, y: wy - face.origin.y });
    setHint('Zadejte Ø díry a hloubku → ◎ Do čela');
    return;
  }
  const hit = shellHoleAt(wx, wy);
  if (hit) {
    openShellHoleCalc({ edit: hit, z: shellHoleZ(hit) });
    setHint('Upravte díru v plášti → ✔ Upravit díru');
    return;
  }
  const z = shellZAt(wx, wy);
  if (z !== null) {
    openShellHoleCalc({ z });
    setHint('Zadejte Ø, hloubku a natočení → ⊥ Do pláště');
    return;
  }
  if (face && face.origin) { showToast('Díra: klepněte do bokorysu (díra do čela) nebo v nárysu na díl (díra do pláště)'); return; }
  openSingleHoleCalc();
  setHint('Zadejte Ø díry a hloubku → ◎ Do čela (díra do pláště: klepněte v nárysu na díl)');
}
