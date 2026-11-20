import { describe, it, expect } from 'vitest';
import { calibrate, moveTo, transformAbout, imgToWorld, worldToImg, mmPerPx } from '../js/underlay/underlayDraw.js';

const base = { src: '', w: 1000, h: 800, ox: 0, oy: 0, ux: 0.1, uy: 0, vx: 0, vy: -0.1, opacity: 0.5, visible: true };
const close = (a, b) => expect(a).toBeCloseTo(b, 9);

describe('fotka výkresu jako podklad – kalibrace', () => {
  it('obrázek ↔ svět', () => {
    const p = imgToWorld(base, 100, 50);
    close(p.x, 10); close(p.y, -5);
    const q = worldToImg(base, p.x, p.y);
    close(q.px, 100); close(q.py, 50);
  });

  it('měřítko 2 body: vzdálenost sedí, první bod zůstane na místě', () => {
    // kóta na fotce je od px 100 do px 700 (vodorovně) = Ø480
    const p1 = imgToWorld(base, 100, 400), p2 = imgToWorld(base, 700, 400);
    const u = calibrate(base, p1, p2, 480, 'keep');
    const a = imgToWorld(u, 100, 400), b = imgToWorld(u, 700, 400);
    close(Math.hypot(b.x - a.x, b.y - a.y), 480);
    close(a.x, p1.x); close(a.y, p1.y);
    close(mmPerPx(u), 0.8);
  });

  it('nakřivo vyfocený výkres se srovná do osy', () => {
    const tilted = transformAbout(base, { x: 0, y: 0 }, 1, 3 * Math.PI / 180);   // fotka 3° nakřivo
    const p1 = imgToWorld(tilted, 100, 400), p2 = imgToWorld(tilted, 700, 400);
    const u = calibrate(tilted, p1, p2, 480, 'auto');
    const a = imgToWorld(u, 100, 400), b = imgToWorld(u, 700, 400);
    close(b.y - a.y, 0);                                // vodorovně
    close(b.x - a.x, 480);
    // svislá kóta srovnaná na svislou
    const q1 = imgToWorld(tilted, 300, 100), q2 = imgToWorld(tilted, 300, 600);
    const v = calibrate(tilted, q1, q2, 100, 'v');
    const c = imgToWorld(v, 300, 100), d = imgToWorld(v, 300, 600);
    close(d.x - c.x, 0);
    close(Math.abs(d.y - c.y), 100);
  });

  it('umístit: klepnutý bod se přesune na zadané souřadnice', () => {
    const p = imgToWorld(base, 250, 300);
    const u = moveTo(base, p, { x: 0, y: 0 });
    const q = imgToWorld(u, 250, 300);
    close(q.x, 0); close(q.y, 0);
  });

  it('nesmyslná vzdálenost nic nezmění', () => {
    expect(calibrate(base, { x: 0, y: 0 }, { x: 0, y: 0 }, 10)).toBe(base);
    expect(calibrate(base, { x: 0, y: 0 }, { x: 1, y: 0 }, 0)).toBe(base);
  });
});
