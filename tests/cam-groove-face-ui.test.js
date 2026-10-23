// Čelní zápich (pravidlo 19) — převzetí z výkresu, přepínač ⊚ Čelní v Upichu,
// pole záložky a náhled obrysu (uživatel 23. 10. 2026: „Udělej 3ku s možností
// ji i nakreslit v CAD").
import { describe, it, expect } from 'vitest';
import { faceGroovesFromDrawing, groovesInFace } from '../js/calculators/cam/sim/grooveCad.js';
import { segmentsFromPoints } from '../js/calculators/cam/boreContour.js';
import { surfaceMode, surfaceInner, programInner } from '../js/calculators/cam/sim/machSurface.js';
import { faceGrooveFieldsHtml, faceGrooveCadRowHtml } from '../js/calculators/cam/sim/paramsGrooveFaceHtml.js';
import { grooveOutline } from '../js/calculators/cam/sim/grooveSim.js';
import { buildIsoFaceGroove } from '../js/calculators/isoFaceGrooves.js';

const P = (pts) => pts.map(([z, x], i) => ({ id: i + 1, type: i ? 'G1' : 'G0', x, z, r: 0, mode: 'ABS' }));
// Čelo Z0 od osy ven, v něm zápich ⌀32–40 × 3, pak válec ⌀60.
const FACE = [[0, 0], [0, 16], [-3, 16], [-3, 20], [0, 20], [0, 30], [-50, 30]];
// Totéž se sražením 0,5 × 45° na obou hranách u čela.
const FACE_CH = [[0, 0], [0, 15.5], [-0.5, 16], [-3, 16], [-3, 20], [-0.5, 20], [0, 20.5], [0, 30], [-50, 30]];

const knife = buildIsoFaceGroove({ range: 1, width: 3 });   // ⌀30–45, š 3, dosah 6
const params = (o = {}) => ({
  mode: 'RADIUS', roughingSide: 'right', controlSystem: 'sinumerik', ...knife.tool, toolName: knife.name,
  partOffFace: true, partOffZ: 0, faceGrooveD1: 32, faceGrooveD2: 40, faceGrooveDepth: 3,
  allowanceX: 0, finishAllowance: 0.2, doFinishing: true, grooveChamfer: 0, stockClearZ: 2, stockClearX: 2, ...o,
});

describe('čelní zápich z výkresu', () => {
  it('najde zápich v čele (zprava)', () => {
    const g = groovesInFace(segmentsFromPoints(P(FACE), 'RADIUS'), 1);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ zFace: 0, d1: 32, d2: 40, t: 3 });
  });
  it('najde sražení 0,5 na hranách u čela', () => {
    const [g] = groovesInFace(segmentsFromPoints(P(FACE_CH), 'RADIUS'), 1);
    expect(g).toMatchObject({ zFace: 0, d1: 32, d2: 40, t: 3 });
    expect(g.s).toBeCloseTo(0.5, 6);
  });
  it('vnější schod obrysu (bez návratu do čela) není čelní zápich', () => {
    expect(groovesInFace(segmentsFromPoints(P([[0, 0], [0, 20], [-3, 20], [-3, 30], [-50, 30]]), 'RADIUS'), 1)).toEqual([]);
  });
  it('faceGroovesFromDrawing čte konturu simulátoru a nabídne tlačítko', () => {
    const S = { contourPoints: P(FACE), params: params() };
    expect(faceGroovesFromDrawing(S)).toHaveLength(1);
    const html = faceGrooveCadRowHtml(S);
    expect(html).toContain('data-act="groove-face-from-cad"');
    expect(html).toContain('cam-sim-btn-green');           // shoduje se s parametry
    expect(faceGrooveCadRowHtml({ contourPoints: P([[0, 0], [0, 30], [-50, 30]]), params: params() })).toBe('');
  });
});

describe('přepínač ⊚ Čelní a pole záložky', () => {
  it('surfaceMode: Upich čelní / vnitřní / vnější; čelní není „uvnitř díry"', () => {
    expect(surfaceMode({ partOffFace: true }, 'upich')).toBe('face');
    expect(surfaceMode({ partOffInner: true }, 'upich')).toBe('inner');
    expect(surfaceMode({}, 'upich')).toBe('outer');
    expect(surfaceMode({ partOffFace: true }, 'hrub')).toBe('outer');
    expect(surfaceInner({ partOffFace: true, partOffInner: true }, 'upich')).toBe(false);
    expect(programInner({ partOffFace: true, partOffInner: true, partOffZ: 0 })).toBe(false);
  });
  it('pole: Z čela, ⌀d1, ⌀d2, hloubka a info o počtu zápichů', () => {
    const html = faceGrooveFieldsHtml(params());
    for (const k of ['partOffZ', 'faceGrooveD1', 'faceGrooveD2', 'faceGrooveDepth', 'allowanceX', 'finishAllowance', 'grooveChamfer']) {
      expect(html).toContain(`data-p="${k}"`);
    }
    expect(html).toMatch(/Zápich ⌀32–40 × 3 mm do čela Z 0: \d+ zápich/);
    expect(faceGrooveFieldsHtml(params({ faceGrooveDepth: 9 }))).toMatch(/⚠ .*hlubší/);
  });
  it('náhled: obrys mezikruží do čela (zprava k −Z, zleva k +Z)', () => {
    expect(grooveOutline({ params: params() }).groove).toEqual([[16, 0], [16, -3], [20, -3], [20, 0]]);
    expect(grooveOutline({ params: params({ roughingSide: 'left', partOffZ: -50 }) }).groove)
      .toEqual([[16, -50], [16, -47], [20, -47], [20, -50]]);
    expect(grooveOutline({ params: params({ faceGrooveD2: 0 }) })).toBeNull();
  });
});
