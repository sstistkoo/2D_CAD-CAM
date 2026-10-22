// SKICA – nástroj Díra: díra do čela (bokorys) nebo do pláště (nárys)
// Klepnutí do bokorysu (SNAP chytá střed, kružnice podkladu, mřížku) otevře
// okno ◎ Díra do čela s polohou vůči středu čela (calculators/singleHole.js).
// Klepnutí v NÁRYSU na díl (obrys / materiál v místě díry) otevře ⊥ Díra do
// pláště se Z z klepnutí (calculators/shellHole.js, uživatel 22. 10. 2026);
// klepnutí na existující díru v plášti ji otevře k úpravě.
// Bez zapnutého bokorysu a mimo díl se otevře díra do čela s X0 Y0 —
// „◎ Do čela" bokorys zapne.
import { state, showToast } from '../state.js';
import { setHint } from '../ui.js';
import { faceViewOn, getFaceLayer, profileObjects } from '../faceView/faceLayer.js';
import { inFaceDisc, materialAt } from '../faceView/faceReference.js';
import { zrOfWorld, shellHoleZ } from '../faceView/shellHoles.js';
import { shellHoleAt } from '../faceView/shellHoleDraw.js';
import { openSingleHoleCalc } from '../calculators/singleHole.js';
import { openShellHoleCalc } from '../calculators/shellHole.js';

const TOL_PX = 15;   // klepnutí kousek nad obrys se ještě počítá na plášť

/** Klepnutí v nárysu na díl (do materiálu nebo těsně nad plášť)? → Z, jinak null. */
function shellZAt(wx, wy) {
  const { z, r } = zrOfWorld(wx, wy);
  const iv = materialAt(profileObjects(), state.machineType, z);
  if (!iv.length) return null;
  const R = iv[iv.length - 1][1];
  return r <= R + TOL_PX / (state.zoom || 1) ? +z.toFixed(3) : null;
}

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
