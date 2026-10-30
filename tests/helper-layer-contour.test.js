// SKICA – Testy: pomocná vrstva neovlivní konturu (stockTools) ani profil (faceLayer.profileObjects)

import { describe, it, expect, beforeEach, vi } from 'vitest';

// stockTools táhne DOM moduly (ui/render/canvas) — pro čistou geometrii stačí prázdné stuby.
vi.mock('../js/ui.js', () => ({ updateObjectList: () => {} }));
vi.mock('../js/render.js', () => ({ renderAll: () => {} }));
vi.mock('../js/canvas.js', () => ({ fitViewToWorldBounds: () => {} }));
vi.mock('../js/geometry.js', () => ({ calculateAllIntersections: () => {} }));
import { state } from '../js/state.js';
import { findContourBranches, findContourDuplicates } from '../js/stockTools.js';
import { profileObjects } from '../js/faceView/faceLayer.js';

const L = (x1, y1, x2, y2, layer = 0) => ({ type: 'line', x1, y1, x2, y2, layer });
const profile = () => [L(0, 0, 0, 40), L(0, 40, 100, 40), L(100, 40, 100, 0)];

describe('pomocná vrstva × kontura', () => {
  beforeEach(() => {
    state.layers = [{ id: 0, name: 'Kontura', visible: true }, { id: 5, name: 'Pomocné', visible: true, helper: true }];
  });

  it('pomocná čára přes konturu není „zdvojená" (čára kontury nevypadne z CAM)', () => {
    state.objects = [L(0, 40, 100, 40, 5), ...profile()];
    expect(findContourDuplicates()).toEqual([]);
  });

  it('pomocná čára z rohu kontury nehlásí větvení', () => {
    state.objects = [...profile(), L(100, 40, 160, 80, 5)];
    expect(findContourBranches()).toEqual([]);
  });

  it('bez příznaku helper se táž čára počítá (kontrola testu)', () => {
    state.layers[1].helper = false;
    state.objects = [...profile(), L(0, 40, 100, 40, 5)];
    expect(findContourDuplicates()).toHaveLength(1);
  });

  it('profileObjects vynechá pomocnou vrstvu', () => {
    const helper = L(0, 0, 300, 90, 5);
    state.objects = [...profile(), helper];
    expect(profileObjects()).not.toContain(helper);
    expect(profileObjects()).toHaveLength(3);
  });
});
