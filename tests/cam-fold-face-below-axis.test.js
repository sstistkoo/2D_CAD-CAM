// Složení kontury na stranu obrábění (cam/contourBuild.js foldContourToMachiningSide):
// čelo nakreslené z bodu KOUSEK POD OSOU (X −0,301) nahoru nesmí vypadnout —
// ořízne se na ose jako úsečka, která osu protíná opačným směrem.
// Nález uživatele 2. 11. 2026: „chybí mi tam jedna čára na kontuře, právě čelo".
import { describe, it, expect } from 'vitest';
import { foldContourToMachiningSide } from '../js/calculators/cam/contourBuild.js';

const P = (type, x, z) => ({ type, x, z, xAbs: x, zAbs: z, xReal: x, zReal: z, r: 0, rVal: 0 });

describe('foldContourToMachiningSide — úsečka vycházející zpod osy', () => {
  it('čelo začínající pod osou se ořízne na ose, nezmizí', () => {
    const pts = [P('G0', -0.301, 255.149), P('G1', 36.276, 255.149), P('G1', 36.276, 205), P('G1', 56, 205), P('G1', 56, 0), P('G1', 0, 0)];
    const out = foldContourToMachiningSide(pts, [P('G0', 65, 0)]);
    expect(out[0]).toMatchObject({ type: 'G0', xReal: 0, zReal: 255.149 });
    expect(out[1]).toMatchObject({ type: 'G1', xReal: 36.276, zReal: 255.149 });
    expect(out.length).toBe(6);
  });

  it('hrot pod osou: obě úsečky se oříznou na ose, mezi nimi přeskok G0', () => {
    const pts = [P('G0', 10, 50), P('G1', -10, 40), P('G1', 10, 30)];
    const out = foldContourToMachiningSide(pts, [P('G0', 20, 0)]);
    expect(out.map(p => [p.type, p.xReal, p.zReal])).toEqual([['G0', 10, 50], ['G1', 0, 45], ['G0', 0, 35], ['G1', 10, 30]]);
  });

  it('svislá úsečka přes osu dolů a zpět nahoru navazuje bez G0', () => {
    const pts = [P('G0', 10, 50), P('G1', 0 - 5, 50), P('G1', 10, 50)];
    const out = foldContourToMachiningSide(pts, [P('G0', 20, 0)]);
    expect(out.map(p => [p.type, p.xReal, p.zReal])).toEqual([['G0', 10, 50], ['G1', 0, 50], ['G1', 10, 50]]);
  });

  it('celý zrcadlený spodek (G0 mezi entitami) se dál zahazuje', () => {
    const pts = [P('G0', 0, 10), P('G1', 20, 10), P('G1', 20, 0), P('G0', 0, 10), P('G1', -20, 10), P('G1', -20, 0)];
    const out = foldContourToMachiningSide(pts, [P('G0', 25, 0)]);
    expect(out.every(p => p.xReal >= 0)).toBe(true);
    expect(out.map(p => [p.xReal, p.zReal])).toEqual([[0, 10], [20, 10], [20, 0], [0, 10]]);
  });
});
