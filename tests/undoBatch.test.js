// Testy pro batch undo API – beginUndoBatch / endUndoBatch / withUndoBatch.
// Ověřuje, že několik pushUndo() volání uvnitř batche vygeneruje jen jeden
// snapshot, a že undo vrátí stav před batchem najednou.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock DOM (state.js volá updateUndoButtons → document.getElementById)
vi.stubGlobal('document', {
  getElementById: () => ({
    disabled: false,
    classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
  }),
  querySelector: () => null,
  createElement: () => ({
    className: '', textContent: '', innerHTML: '',
    classList: { add: vi.fn(), remove: vi.fn() },
    appendChild: vi.fn(), setAttribute: vi.fn(), removeAttribute: vi.fn(),
  }),
  body: { appendChild: vi.fn() },
});
vi.stubGlobal('window', { innerWidth: 1024, innerHeight: 768, addEventListener: vi.fn() });

const { state, pushUndo, undo, beginUndoBatch, endUndoBatch, withUndoBatch } = await import('../js/state.js');

function resetState() {
  state.objects = [];
  state.anchors = [];
  state.undoStack = [];
  state.redoStack = [];
}

describe('withUndoBatch – základní chování', () => {
  beforeEach(resetState);

  it('několik pushUndo() uvnitř batche vytvoří jen 1 snapshot', () => {
    expect(state.undoStack).toHaveLength(0);
    withUndoBatch(() => {
      pushUndo(); pushUndo(); pushUndo();
    });
    expect(state.undoStack).toHaveLength(1);
  });

  it('manuální begin/end batch má stejné chování', () => {
    beginUndoBatch();
    pushUndo(); pushUndo();
    endUndoBatch();
    expect(state.undoStack).toHaveLength(1);
  });

  it('po endUndoBatch funguje pushUndo normálně', () => {
    withUndoBatch(() => pushUndo());
    expect(state.undoStack).toHaveLength(1);
    pushUndo();
    expect(state.undoStack).toHaveLength(2);
  });

  it('vnořené batche dělají jen 1 snapshot (vnější batch vede)', () => {
    withUndoBatch(() => {
      withUndoBatch(() => {
        pushUndo();
      });
      pushUndo();
    });
    expect(state.undoStack).toHaveLength(1);
  });

  it('výjimka uvnitř callbacku neporušuje stav (try/finally)', () => {
    expect(() => withUndoBatch(() => { throw new Error('test'); })).toThrow();
    // Batch je uzavřený – další pushUndo() musí fungovat normálně
    pushUndo();
    expect(state.undoStack.length).toBeGreaterThanOrEqual(1);
  });
});

describe('withUndoBatch – integrace s undo()', () => {
  beforeEach(resetState);

  it('undo po batchi vrátí stav před batchem (skupina objektů zmizí najednou)', () => {
    state.objects = [{ id: 1, type: 'point', x: 0, y: 0 }];
    // Simulace gear tool: 7 objektů přidaných v batchi
    withUndoBatch(() => {
      pushUndo(); state.objects.push({ id: 2, type: 'circle', cx: 0, cy: 0, r: 5 });
      pushUndo(); state.objects.push({ id: 3, type: 'circle', cx: 0, cy: 0, r: 10 });
      pushUndo(); state.objects.push({ id: 4, type: 'circle', cx: 0, cy: 0, r: 15 });
    });
    expect(state.objects).toHaveLength(4);
    expect(state.undoStack).toHaveLength(1);
    undo();
    expect(state.objects).toHaveLength(1); // vše zmizelo, zbyl jen původní point
    expect(state.objects[0].id).toBe(1);
  });

  it('po batchi následující pushUndo se ukládá samostatně', () => {
    state.objects = [];
    withUndoBatch(() => {
      pushUndo(); state.objects.push({ id: 1 });
      pushUndo(); state.objects.push({ id: 2 });
    });
    pushUndo(); state.objects.push({ id: 3 });

    expect(state.undoStack).toHaveLength(2);
    undo();
    expect(state.objects).toHaveLength(2); // zmizel jen poslední
    undo();
    expect(state.objects).toHaveLength(0); // zmizela celá batch dvojice
  });
});

describe('withUndoBatch – návratová hodnota', () => {
  beforeEach(resetState);

  it('vrací výsledek callbacku', () => {
    const result = withUndoBatch(() => 42);
    expect(result).toBe(42);
  });

  it('vrací undefined pokud callback nevrací', () => {
    const result = withUndoBatch(() => { /* nic */ });
    expect(result).toBeUndefined();
  });
});
