// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – na kterou stranu se odsadí OBLOUK (nález auditu 15. 9.) ║
// ╚══════════════════════════════════════════════════════════════╝
// `buildRawOffsets` rozhoduje konvexní/konkávní porovnáním středu kružnice
// se středem oblouku. Do 15. 9. 2026 se srovnávalo se středem TĚTIVY, a ta
// leží mezi středem kružnice a obloukem jen do rozvinu 180°: přesně na 180°
// splyne se středem kružnice a nad 180° se převáží na druhou stranu.
// Vypuklý půlkulový hrb se tak vyhodnotil jako drážka a dráha šla POD
// hotovou konturu.
import { describe, it, expect } from 'vitest';
import { buildRawOffsets } from '../js/calculators/cam/toolOffset.js';

const R_TIP = 0.8;
const R_ARC = 5;
const CX = 20, CZ = -5;

// Oblouk o zadaném rozvinu, symetrický kolem vrcholu. Jede se od `apex+půl`
// k `apex−půl`, tedy s KLESAJÍCÍM úhlem = 'G2' (konvence camMath: úhel
// a = atan2(x−cx, z−cz), 'G3' = rostoucí). Vrchol oblouku je tak vždy `apex`:
//   +90° → vrchol na x = cx + r (vypuklý hrb)
//   −90° → vrchol na x = cx − r (vydutá drážka)
function arc(sweepDeg, apexRad) {
  const half = (sweepDeg / 2) * Math.PI / 180;
  const a1 = apexRad + half, a2 = apexRad - half;
  const p = (a) => ({ x: CX + Math.sin(a) * R_ARC, z: CZ + Math.cos(a) * R_ARC });
  return { type: 'arc', cx: CX, cz: CZ, r: R_ARC, dir: 'G2', p1: p(a1), p2: p(a2), startAngle: a1, endAngle: a2 };
}
const offR = (seg) => {
  const { rawOffsets } = buildRawOffsets([seg], R_TIP, 0, 0, 0);
  return rawOffsets[0] ? rawOffsets[0].r : null;
};

describe('buildRawOffsets – strana odsazení oblouku', () => {
  it('vypuklý oblouk jde VEN i při rozvinu 180° a víc', () => {
    for (const sweep of [90, 179, 180, 181, 240]) {
      expect(offR(arc(sweep, Math.PI / 2))).toBeCloseTo(R_ARC + R_TIP, 6);
    }
  });

  it('vydutý oblouk jde DOVNITŘ ve všech rozvinech', () => {
    for (const sweep of [90, 179, 180, 181, 240]) {
      expect(offR(arc(sweep, -Math.PI / 2))).toBeCloseTo(R_ARC - R_TIP, 6);
    }
  });

  it('rozviny pod 180° dávají TOTÉŽ co dřívější test středem tětivy', () => {
    // Regrese naopak: na těchhle rozvinech se nesmělo nic pohnout, protože
    // střed tětivy i střed oblouku leží na téže polopřímce ze středu kružnice.
    for (const sweep of [10, 45, 90, 120, 170]) {
      for (const apex of [Math.PI / 2, -Math.PI / 2, 0, Math.PI]) {
        const seg = arc(sweep, apex);
        const chordOuter = Math.abs(seg.cx) < Math.abs((seg.p1.x + seg.p2.x) / 2);
        const got = offR(seg);
        if (got !== null) expect(got).toBeCloseTo(chordOuter ? R_ARC + R_TIP : R_ARC - R_TIP, 6);
      }
    }
  });

  it('úsečky se odsazují beze změny (levá normála směru jízdy)', () => {
    const seg = { type: 'line', p1: { x: 20, z: 0 }, p2: { x: 20, z: -30 } };
    const { rawOffsets } = buildRawOffsets([seg], R_TIP, 0, 0, 0);
    expect(rawOffsets[0].p1.x).toBeCloseTo(20 + R_TIP, 6);
  });
});
