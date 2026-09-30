// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – topXOnLoopFn = topXOnLoop, jen rychleji                ║
// ╚══════════════════════════════════════════════════════════════╝
// Předpočtený dotaz (přihrádky hran podle Z) nahrazuje topXOnLoop v emisi
// a ve vrstvách pravidla 7. Musí vracet BITOVĚ totéž — jinak by se hnul
// program (hlídá i otisk, tady je to přímo na smyčkách).
import { describe, it, expect } from 'vitest';
import { topXOnLoop, topXOnLoopFn } from '../js/calculators/cam/camMath.js';

// Deterministický generátor (bez Math.random — test musí být opakovatelný).
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

// Silueta dílu: osa, zubatý horní obrys s oblouky a svislými stěnami.
function silhouette(rand, n) {
  const top = [];
  for (let i = 0; i <= n; i++) {
    const z = 200 - 200 * i / n;
    top.push({ x: 20 + 15 * Math.sin(z / 9) + 5 * rand(), z });
    if (rand() < 0.1) top.push({ x: 10 + 30 * rand(), z });   // svislá stěna
  }
  return [...top, { x: 0, z: 0 }, { x: 0, z: 200 }];
}

describe('CAM: topXOnLoopFn', () => {
  it('shoduje se s topXOnLoop na vrcholech, mezi nimi i mimo smyčku', () => {
    for (const seed of [1, 7, 42]) {
      const rand = rng(seed);
      const loop = silhouette(rand, 800);
      const fast = topXOnLoopFn(loop);
      const zs = [-5, 0, 200, 205, NaN, ...loop.map(p => p.z)];
      for (let i = 0; i < 4000; i++) zs.push(-2 + 204 * rand());
      for (const z of zs) expect(Object.is(fast(z), topXOnLoop(loop, z))).toBe(true);
    }
  });

  it('zvládne prázdnou, degenerovanou i malou smyčku', () => {
    expect(topXOnLoopFn(null)(5)).toBe(null);
    const flat = [{ x: 0, z: 5 }, { x: 3, z: 5 }, { x: 1, z: 5 }];
    expect(topXOnLoopFn(flat)(5)).toBe(topXOnLoop(flat, 5));
    const tri = [{ x: 0, z: 0 }, { x: 10, z: 5 }, { x: 0, z: 10 }];
    for (const z of [0, 2.5, 5, 7.5, 10]) expect(topXOnLoopFn(tri)(z)).toBe(topXOnLoop(tri, z));
  });
});
