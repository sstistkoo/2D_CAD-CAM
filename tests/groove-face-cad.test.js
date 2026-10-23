// CAD: čelní zápich v nástroji Zápich (pravidlo 19 v CAM) — validace dialogu
// a profil do čela (soustruh / karusel řeší grooveClick mapováním os).
import { describe, it, expect, vi } from 'vitest';

vi.mock('../js/objects.js', () => ({ addObject: vi.fn() }));
vi.mock('../js/render.js', () => ({ renderAll: vi.fn() }));
import { validateGrooveParams } from '../js/dialogs/grooveDialog.js';
import { buildFaceGrooveProfile } from '../js/tools/grooveClick.js';

describe('CAD: čelní zápich', () => {
  it('validace: d2 > d1, t > 0, sražení se vejde', () => {
    expect(validateGrooveParams({ type: 'face', diameter: 32, d2: 40, t: 3, s: 0.5 }).params)
      .toEqual({ type: 'face', diameter: 32, d2: 40, t: 3, s: 0.5, mirror: false });
    expect(validateGrooveParams({ type: 'face', diameter: 40, d2: 32, t: 3 }).error).toMatch(/d2/);
    expect(validateGrooveParams({ type: 'face', diameter: 32, d2: 40, t: 0 }).error).toMatch(/Hloubka/);
    expect(validateGrooveParams({ type: 'face', diameter: 32, d2: 40, t: 3, s: 2 }).error).toMatch(/Sražení/);
  });
  it('profil bez sražení: čelo → dno → čelo (zprava do −Z)', () => {
    expect(buildFaceGrooveProfile({ zFace: 0, d1: 32, d2: 40, t: 3 }))
      .toEqual([{ z: 0, r: 16 }, { z: -3, r: 16 }, { z: -3, r: 20 }, { z: 0, r: 20 }]);
  });
  it('se sražením 0,5 a čelem vlevo (do +Z)', () => {
    expect(buildFaceGrooveProfile({ zFace: -50, d1: 32, d2: 40, t: 3, s: 0.5, dir: -1 })).toEqual([
      { z: -50, r: 15.5 }, { z: -49.5, r: 16 }, { z: -47, r: 16 }, { z: -47, r: 20 }, { z: -49.5, r: 20 }, { z: -50, r: 20.5 }]);
  });
});
