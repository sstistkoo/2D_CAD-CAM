import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  const mockEl = () => ({
    disabled: false,
    classList: { toggle: () => {}, add: () => {}, remove: () => {}, contains: () => false },
    textContent: '', innerHTML: '', querySelectorAll: () => [],
    appendChild: () => {}, style: {},
    addEventListener: () => {},
    setAttribute: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    querySelector: () => null, closest: () => null, remove: () => {},
    focus: () => {}, select: () => {},
  });
  globalThis.document = {
    getElementById: () => mockEl(),
    createElement: () => mockEl(),
    body: { appendChild: () => {}, classList: { toggle: () => {}, add: () => {}, remove: () => {} } },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
});

vi.mock('../js/render.js', () => ({ renderAll: vi.fn(), renderAllDebounced: vi.fn() }));
vi.mock('../js/ui.js', () => ({ updateObjectList: vi.fn() }));
vi.mock('../js/geometry.js', () => ({ calculateAllIntersections: vi.fn() }));

import { state } from '../js/state.js';
import { generateStockFromAllowance } from '../js/stockTools.js';

// Reprodukce scénáře ze screenshotu: profil (cad_x=Z, cad_y=X/poloměr)
// začíná na ose (0,40)->(0,0)? Ne — dle popisu obrázku: levý konec je
// SVISLÁ úsečka na ose Z=0 od poloměru 0 do 40 (čelo), pak profil doprava,
// na konci (Z=260) SVISLÁ úsečka dolů na osu (poloměr 0). Mezi (0,0) a
// (260,0) NENÍ žádná spojnice (podélná osa) — přesně "nemam konturu
// spojenou na ose Z, X0".
beforeEach(() => {
  state.objects = [
    { id: 1, type: 'line', x1: 0, y1: 0, x2: 0, y2: 40 },   // čelo na Z=0
    { id: 2, type: 'line', x1: 0, y1: 40, x2: 100, y2: 40 }, // profil...
    { id: 3, type: 'line', x1: 100, y1: 40, x2: 100, y2: 10 },
    { id: 4, type: 'line', x1: 100, y1: 10, x2: 260, y2: 10 },
    { id: 5, type: 'line', x1: 260, y1: 10, x2: 260, y2: 0 }, // konec dolů na osu
  ];
  state.nextId = 100;
  state.activeLayer = 'default';
  state.contourGaps = [];
});

describe('generateStockFromAllowance – otevřený profil dotýkající se osy na obou koncích', () => {
  it('nevyžaduje ruční spojení podél osy a vytvoří polotovar', () => {
    const result = generateStockFromAllowance({ allowance: 3, asContour: false });
    expect(result.ok).toBe(true);
    expect(result.count).toBeGreaterThan(0);
  });

  it('zachová konturu beze změny (nesmí offsetovat "podlahovou" úsečku, pokud existuje)', () => {
    // Simulace uživatele, který se pokusil konturu "ručně" uzavřít po ose
    state.objects.push({ id: 6, type: 'line', x1: 260, y1: 0, x2: 0, y2: 0 });
    const result = generateStockFromAllowance({ allowance: 3, asContour: false });
    expect(result.ok).toBe(true);
    // Všechny nově přidané objekty musí mít y (poloměr) >= -0.01 (nesmí spadnout pod osu)
    const added = state.objects.filter(o => o.id >= 100);
    for (const o of added) {
      if (o.type === 'line') {
        expect(o.y1).toBeGreaterThanOrEqual(-0.01);
        expect(o.y2).toBeGreaterThanOrEqual(-0.01);
      }
    }
  });
});

describe('generateStockFromAllowance – skutečně nesouvislá kontura', () => {
  it('odmítne, když existuje samostatný nenapojený fragment', () => {
    state.objects.push({ id: 20, type: 'line', x1: 500, y1: 5, x2: 520, y2: 5 });
    const result = generateStockFromAllowance({ allowance: 3, asContour: false });
    expect(result.ok).toBe(false);
  });
});
