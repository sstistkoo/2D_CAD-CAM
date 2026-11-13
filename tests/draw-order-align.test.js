import { describe, it, expect } from 'vitest';
import { alignChainsToDrawOrder } from '../js/storage/drawOrder.js';

const rev = o => ({ ...o, x1: o.x2, y1: o.y2, x2: o.x1, y2: o.y1 });
const L = (id, x1, y1, x2, y2, cont) => ({ type: 'line', x1, y1, x2, y2, _src: { id }, _chainCont: cont });
const pts = list => list.map(o => `${o.x1},${o.y1}>${o.x2},${o.y2}`);

describe('alignChainsToDrawOrder – editor drží pořadí kreslení', () => {
  it('řetěz přerovnaný zprava doleva se otočí zpět do pořadí zápisu', () => {
    // zapsáno od osy: id 1 (0,0→50,0), 2 (50,0→50,100), 3 (50,100→20,150); plátno je seřadilo obráceně
    const list = [L(3, 20, 150, 50, 100), L(2, 50, 100, 50, 0, true), L(1, 50, 0, 0, 0, true)];
    alignChainsToDrawOrder(list, rev);
    expect(pts(list)).toEqual(['0,0>50,0', '50,0>50,100', '50,100>20,150']);
    expect(list.map(o => !!o._chainCont)).toEqual([false, true, true]);
  });
  it('řetěz v pořadí kreslení se nemění, objekty se nemutují', () => {
    const a = L(1, 0, 0, 10, 0), b = L(2, 10, 0, 10, 10, true);
    const list = [a, b];
    alignChainsToDrawOrder(list, rev);
    expect(list[0]).toBe(a); expect(list[1]).toBe(b);
  });
  it('každý řetěz zvlášť; bez id zůstává pořadí', () => {
    const list = [L(5, 0, 0, 1, 0), L(4, 1, 0, 2, 0, true), { type: 'line', x1: 9, y1: 9, x2: 8, y2: 8 }, L(7, 5, 5, 6, 5), L(8, 6, 5, 7, 5, true)];
    alignChainsToDrawOrder(list, rev);
    expect(pts(list)).toEqual(['2,0>1,0', '1,0>0,0', '9,9>8,8', '5,5>6,5', '6,5>7,5']);
  });
});
