// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Testy: storage/svgCanvasContext.js                  ║
// ║  „canvas", který kreslí kóty do SVG (export SVG)             ║
// ╚══════════════════════════════════════════════════════════════╝

import { describe, it, expect, vi, beforeEach } from 'vitest';

// measureText: 6 px na znak (stačí pro rozsah textu)
vi.stubGlobal('document', {
  createElement: () => ({ getContext: () => ({ font: '', measureText: (t) => ({ width: 6 * t.length }) }) }),
});

import { SvgCanvasContext } from '../js/storage/svgCanvasContext.js';

/** Minimální SVG „dokument": prvky jako objekty s atributy. */
function fakeDoc() {
  const mk = (tag) => ({
    tag, attrs: {}, children: [], textContent: '',
    setAttribute(k, v) { this.attrs[k] = String(v); },
    appendChild(c) { this.children.push(c); return c; },
  });
  return { createElementNS: (_ns, tag) => mk(tag), root: mk('g') };
}

let doc, sc;
beforeEach(() => { doc = fakeDoc(); sc = new SvgCanvasContext(doc, doc.root); });
const last = () => doc.root.children[doc.root.children.length - 1];

describe('cesta a transformace', () => {
  it('moveTo/lineTo + stroke → path se souřadnicemi po transformaci a tloušťkou ve stejném měřítku', () => {
    sc.translate(10, 20);
    sc.scale(2, 2);
    sc.lineWidth = 1.5;
    sc.strokeStyle = '#123456';
    sc.setLineDash([3, 1]);
    sc.beginPath(); sc.moveTo(0, 0); sc.lineTo(5, 0); sc.stroke();
    const p = last();
    expect(p.tag).toBe('path');
    expect(p.attrs.d).toBe('M10 20 L20 20');
    expect(p.attrs['stroke-width']).toBe('3');
    expect(p.attrs['stroke-dasharray']).toBe('6 2');
    expect(p.attrs.stroke).toBe('#123456');
    expect(p.attrs.fill).toBe('none');
  });

  it('save/restore vrací transformaci i styl', () => {
    sc.save(); sc.translate(100, 0); sc.fillStyle = 'red'; sc.restore();
    sc.beginPath(); sc.moveTo(1, 1); sc.lineTo(2, 1); sc.stroke();
    expect(last().attrs.d).toBe('M1 1 L2 1');
    expect(sc.fillStyle).toBe('#000');
  });
});

describe('arc – sémantika canvasu', () => {
  it('čtvrtoblouk ve směru hodin (anticlockwise=false): sweep-flag 1, malý oblouk', () => {
    sc.beginPath(); sc.arc(0, 0, 10, 0, Math.PI / 2); sc.stroke();
    expect(last().attrs.d).toBe('M10 0 A10 10 0 0 1 0 10');
  });

  it('proti směru (anticlockwise=true) 0 → π/2 je velký oblouk 270° se sweep-flag 0', () => {
    sc.beginPath(); sc.arc(0, 0, 10, 0, Math.PI / 2, true); sc.stroke();
    expect(last().attrs.d).toBe('M10 0 A10 10 0 1 0 0 10');
  });

  it('plná kružnice = dva půloblouky', () => {
    sc.beginPath(); sc.arc(0, 0, 5, 0, Math.PI * 2); sc.fill();
    const d = last().attrs.d;
    expect(d.match(/A/g)).toHaveLength(2);
    expect(d.startsWith('M5 0')).toBe(true);
  });

  it('arc po lineTo navazuje úsečkou (jako canvas), poloměr se škáluje', () => {
    sc.scale(2, 2);
    sc.beginPath(); sc.moveTo(0, 0); sc.arc(0, 0, 10, 0, Math.PI / 2); sc.stroke();
    expect(last().attrs.d).toBe('M0 0 L20 0 A20 20 0 0 1 0 20');
  });
});

describe('fillText', () => {
  it('text s natočením, zarovnáním na střed a účaří dole', () => {
    sc.font = 'bold 17px Consolas';
    sc.fillStyle = '#4c4f69';
    sc.textAlign = 'center';
    sc.textBaseline = 'bottom';
    sc.translate(50, 60);
    sc.rotate(Math.PI / 2);
    sc.fillText('R20', 0, -4);
    const t = last();
    expect(t.tag).toBe('text');
    expect(t.textContent).toBe('R20');
    expect(t.attrs['text-anchor']).toBe('middle');
    expect(t.attrs['dominant-baseline']).toBe('text-after-edge');
    expect(t.attrs['font-size']).toBe('17');
    expect(t.attrs['font-weight']).toBe('bold');
    expect(t.attrs['font-family']).toBe('Consolas, monospace');
    expect(t.attrs.fill).toBe('#4c4f69');
    // rotace 90° + posun (0,−4) v natočeném prostoru → (54, 60)
    expect(t.attrs.transform).toBe('matrix(0 1 -1 0 54 60)');
  });

  it('rozsah zahrnuje text (šířka z measureText, výška = velikost písma)', () => {
    sc.font = '10px Consolas';
    sc.textAlign = 'left';
    sc.textBaseline = 'bottom';
    sc.fillText('ABCD', 100, 50);
    expect(sc.bounds).toEqual({ minX: 100, minY: 40, maxX: 124, maxY: 50 });
  });
});
