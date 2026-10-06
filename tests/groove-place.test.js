// Zápich – orientace vodorovně / svisle (placeGrooveProfile, grooveClick.js).
// Na pokyn uživatele 6. 10. 2026: na karuselu (osy prohozené) má jít zápich
// svisle a obecně má jít nakreslit vodorovně i svisle.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../js/objects.js', () => ({ addObject: vi.fn() }));
vi.mock('../js/render.js', () => ({ renderAll: vi.fn() }));
vi.mock('../js/dialogs/grooveDialog.js', () => ({ showGrooveDialog: vi.fn() }));

import { buildGrooveProfile, placeGrooveProfile } from '../js/tools/grooveClick.js';
import { bulgeToArc } from '../js/utils.js';

const profile = () => buildGrooveProfile({ f: 4, t: 1, r: 0.5, alpha: 45, entryStyle: 'chamfer', exitStyle: 'radius' });
const r3 = v => Math.round(v * 1000) / 1000;
const pts = (vs) => vs.map(p => [r3(p.x), r3(p.y)]);

/** Bod v polovině oblouku segmentu i (podle znaménka bulge). */
function arcMid(vs, bs, i) {
  const a = bulgeToArc(vs[i], vs[i + 1], bs[i]);
  const TAU = 2 * Math.PI;
  const sweep = ((((a.ccw ? a.endAngle - a.startAngle : a.startAngle - a.endAngle) % TAU) + TAU) % TAU);
  const m = a.startAngle + (a.ccw ? sweep : -sweep) / 2;
  return { x: a.cx + a.r * Math.cos(m), y: a.cy + a.r * Math.sin(m) };
}

describe('placeGrooveProfile', () => {
  it('vodorovně = dosavadní tvar (plocha y, hloubka dolů)', () => {
    const { vertices, bulges } = placeGrooveProfile(profile(), { orient: 'h', mirror: false, anchor: { x: 50, y: 20 } });
    expect(pts(vertices)).toEqual([[50, 20], [51, 19], [55, 19], [55.5, 19.5], [55.5, 20]]);
    expect(bulges[2]).toBeGreaterThan(0);
  });

  it('svisle = vodorovný tvar s prohozenými osami (hloubka doleva)', () => {
    const h = placeGrooveProfile(profile(), { orient: 'h', anchor: { x: 0, y: 0 } });
    const v = placeGrooveProfile(profile(), { orient: 'v', anchor: { x: 0, y: 0 } });
    expect(pts(v.vertices)).toEqual(pts(h.vertices).map(([x, y]) => [y, x]));
    // oblouk dna se musí vyboulit do stejného (prohozeného) rohu
    const mh = arcMid(h.vertices, h.bulges, 2), mv = arcMid(v.vertices, v.bulges, 2);
    expect(mv.x).toBeCloseTo(mh.y, 9);
    expect(mv.y).toBeCloseTo(mh.x, 9);
  });

  it('zrcadlení obrátí směr podél plochy v obou orientacích', () => {
    for (const orient of ['h', 'v']) {
      const a = placeGrooveProfile(profile(), { orient, mirror: false, anchor: { x: 0, y: 0 } });
      const b = placeGrooveProfile(profile(), { orient, mirror: true, anchor: { x: 0, y: 0 } });
      const k = orient === 'v' ? 'y' : 'x';
      // `+ 0` srovná −0 a +0 (toEqual je rozlišuje)
      expect(b.vertices.map(p => r3(p[k]) + 0)).toEqual(a.vertices.map(p => r3(-p[k]) + 0));
      const ma = arcMid(a.vertices, a.bulges, 2), mb = arcMid(b.vertices, b.bulges, 2);
      expect(mb[k]).toBeCloseTo(-ma[k], 9);
    }
  });
});
