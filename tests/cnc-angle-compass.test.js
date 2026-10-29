// CNC Editor – Úsečka úhlem: šipky ✛ (cncAngleCompass.js). Šipka = směr na
// obrazovce; úhel dialogu je od +Z proti směru hodin, takže závisí na typu
// stroje a zrcadlení os. Ověřuje se i to, že vypočtený úhel opravdu vede tam,
// kam šipka ukazuje (přes angleLineEnd, kterým dialog úsečku počítá).
import { describe, it, expect } from 'vitest';
import { screenDirToAngle } from '../js/calculators/cncAngleCompass.js';
import { angleLineEnd } from '../js/calculators/cncDrawTools.js';

const A = (ex, ey, v) => screenDirToAngle(ex, ey, v);

describe('screenDirToAngle', () => {
  it('soustruh: → 0°, ↑ 90°, ← 180°, ↓ 270°, úhlopříčky po 45°', () => {
    const v = { karusel: false };
    expect([A(1, 0, v), A(0, 1, v), A(-1, 0, v), A(0, -1, v)]).toEqual([0, 90, 180, 270]);
    expect([A(1, 1, v), A(-1, 1, v), A(-1, -1, v), A(1, -1, v)]).toEqual([45, 135, 225, 315]);
  });
  it('karusel (Z svisle, X vodorovně): ↑ 0°, → 90°, ↓ 180°, ← 270°', () => {
    const v = { karusel: true };
    expect([A(0, 1, v), A(1, 0, v), A(0, -1, v), A(-1, 0, v)]).toEqual([0, 90, 180, 270]);
    expect(A(1, 1, v)).toBe(45);
  });
  it('zrcadlení svislé osy (flipX) / vodorovné (flipZ) obrátí příslušnou složku', () => {
    expect(A(0, 1, { flipX: true })).toBe(270);      // nahoře je −X
    expect(A(1, 0, { flipZ: true })).toBe(180);      // vpravo je −Z
    expect(A(1, 1, { flipX: true, flipZ: true })).toBe(225);
  });

  // Šipka → úhel → konec úsečky: posun ve světě musí mířit stejně jako šipka na obrazovce.
  for (const karusel of [false, true]) for (const flipX of [false, true]) for (const flipZ of [false, true]) {
    it(`úhel vede ve směru šipky (${karusel ? 'karusel' : 'soustruh'}${flipX ? ' flipX' : ''}${flipZ ? ' flipZ' : ''})`, () => {
      const v = { karusel, flipX, flipZ };
      for (const [ex, ey] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]]) {
        const end = angleLineEnd({ z: 0, x: 0 }, A(ex, ey, v), { L: 10 }, 1);   // {x, z} ve stroji
        // stroj → svět (karusel: x = X, y = Z; soustruh: x = Z, y = X) → obrazovka (zrcadlení)
        const wx = karusel ? end.x : end.z, wy = karusel ? end.z : end.x;
        const sx = flipZ ? -wx : wx, sy = flipX ? -wy : wy;
        const len = Math.hypot(ex, ey);
        expect(sx / 10).toBeCloseTo(ex / len, 9);
        expect(sy / 10).toBeCloseTo(ey / len, 9);
      }
    });
  }
});

describe('wireAngleCompass (obsluha mřížky)', () => {
  function fake(tag = 'div') {
    const h = {};
    return {
      tag, style: {}, dataset: {}, innerHTML: '', removed: false, children: [],
      offsetWidth: 120, offsetHeight: 120,
      addEventListener(t, fn) { (h[t] ||= []).push(fn); },
      fire(t, ev) { (h[t] || []).forEach((fn) => fn(ev)); },
      appendChild(c) { this.children.push(c); c.parent = this; },
      remove() { this.removed = true; },
      contains(x) { return x === this || (x && x.inPopup === this); },
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 300, bottom: 400, width: 300, height: 400 }),
      dispatchEvent(ev) { (this.events ||= []).push(ev.type); },
    };
  }

  it('✛ otevře mřížku s úhly podle stroje, šipka vyplní pole a mřížku zavře', async () => {
    const { vi } = await import('vitest');
    vi.stubGlobal('document', { createElement: () => fake() });
    const { wireAngleCompass } = await import('../js/calculators/cncAngleCompass.js');
    const trigger = fake('button');
    trigger.getBoundingClientRect = () => ({ left: 200, top: 50, right: 240, bottom: 80 });
    const input = fake('input');
    const host = fake();
    wireAngleCompass(trigger, input, host, () => ({ karusel: true, flipX: false, flipZ: false }));

    trigger.fire('click', { preventDefault() {}, stopPropagation() {} });
    const popup = host.children[0];
    expect(popup).toBeTruthy();
    const angs = [...popup.innerHTML.matchAll(/data-ang="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(angs).toEqual([315, 0, 45, 270, 90, 225, 180, 135]);   // karusel: ↑ = 0°
    expect(popup.style.left).toBe('120px');                        // pravá hrana pod tlačítkem
    expect(popup.style.top).toBe('84px');

    const arrow = { dataset: { ang: '90' }, inPopup: popup, closest: (sel) => (sel === '.compass-arrow' ? arrow : null) };
    host.fire('click', { target: arrow });
    expect(input.value).toBe('90');
    expect(input.events).toEqual(['input']);
    expect(popup.removed).toBe(true);

    // druhé otevření a klik jinam v dialogu (OK / Zrušit) mřížku jen zavře
    trigger.fire('click', { preventDefault() {}, stopPropagation() {} });
    const p2 = host.children[1];
    host.fire('click', { target: { closest: () => null } });
    expect(p2.removed).toBe(true);
    expect(input.value).toBe('90');
    vi.unstubAllGlobals();
  });
});
