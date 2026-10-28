// @vitest-environment happy-dom
// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Testy: tlačítko Zpět = o jeden krok (backButton.js) ║
// ╚══════════════════════════════════════════════════════════════╝

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSetTool = vi.fn();
const mockToast = vi.fn();

vi.mock('../js/state.js', () => ({
  state: {
    tool: 'select', drawing: false, tempPoints: [], selected: null, selectedSegment: null,
    selectedPoint: null, multiSelected: new Set(), multiSelectedSegments: new Set(),
    _rectSelecting: false, _chainDimCount: 0,
  },
  showToast: (...a) => mockToast(...a),
}));
vi.mock('../js/bridge.js', () => ({ bridge: { setTool: (...a) => mockSetTool(...a) } }));

const { state } = await import('../js/state.js');
const { stepBack, onPopState, initBackButton, EXIT_WINDOW_MS } = await import('../js/backButton.js');

function resetState() {
  Object.assign(state, {
    tool: 'select', drawing: false, tempPoints: [], selected: null, selectedSegment: null,
    selectedPoint: null, _rectSelecting: false, _chainDimCount: 0, _toolCleanup: null,
  });
  state.multiSelected.clear();
  state.multiSelectedSegments.clear();
}

function addOverlay(cls, attrs = {}) {
  const el = document.createElement('div');
  el.className = cls;
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '';
  resetState();
  mockSetTool.mockClear();
  mockToast.mockClear();
});

describe('stepBack – pořadí kroků', () => {
  it('na nejvyšší úrovni nedělá nic a vrací false', () => {
    expect(stepBack()).toBe(false);
  });

  it('zavře JEN nejvyšší modální okno (z-index), ostatní nechá', () => {
    const low = addOverlay('calc-overlay');
    const high = addOverlay('input-overlay');
    low.style.zIndex = '10';
    high.style.zIndex = '20';
    expect(stepBack()).toBe(true);
    expect(document.body.contains(high)).toBe(false);
    expect(document.body.contains(low)).toBe(true);
  });

  it('zavře okno jeho křížkem, aby proběhl vlastní úklid', () => {
    const ov = addOverlay('calc-overlay');
    const btn = document.createElement('button');
    btn.className = 'calc-close-btn';
    const onClose = vi.fn();
    btn.addEventListener('click', onClose);
    ov.appendChild(btn);
    expect(stepBack()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('nápovědu zavře před zrušením kreslení', () => {
    const help = addOverlay('help-overlay visible');
    help.id = 'helpOverlay';
    state.drawing = true;
    expect(stepBack()).toBe(true);
    expect(help.classList.contains('visible')).toBe(false);
    expect(state.drawing).toBe(true);
  });

  it('otevřený boční panel zavře přes jeho křížek', () => {
    const sb = addOverlay('mobile-open');
    sb.id = 'sidebar';
    const btn = document.createElement('button');
    btn.id = 'sidebarCloseBtn';
    const onClose = vi.fn();
    btn.addEventListener('click', onClose);
    document.body.appendChild(btn);
    expect(stepBack()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('rozdělané kreslení zruší klávesou Escape (globální handler)', () => {
    state.drawing = true;
    const onKey = vi.fn();
    document.addEventListener('keydown', onKey);
    expect(stepBack()).toBe(true);
    expect(onKey).toHaveBeenCalledTimes(1);
    expect(onKey.mock.calls[0][0].key).toBe('Escape');
    document.removeEventListener('keydown', onKey);
  });

  it('plovoucí okno (data-keep-on-esc) zavře až po zrušení rozdělané práce', () => {
    const fl = addOverlay('calc-overlay calc-overlay-float', { 'data-keep-on-esc': '1' });
    state.drawing = true;
    stepBack();
    expect(document.body.contains(fl)).toBe(true);
    state.drawing = false;
    expect(stepBack()).toBe(true);
    expect(document.body.contains(fl)).toBe(false);
  });

  it('nástroj jiný než Výběr vrátí na Výběr', () => {
    state.tool = 'line';
    expect(stepBack()).toBe(true);
    expect(mockSetTool).toHaveBeenCalledWith('select');
  });
});

describe('onPopState – ukončení aplikace', () => {
  function armForTest() {
    // simulace první interakce → zarážka v historii
    initBackButton();
    window.dispatchEvent(new Event('pointerdown'));
  }

  it('první Zpět na nejvyšší úrovni jen upozorní, druhé do 2 s opustí stránku', () => {
    const back = vi.spyOn(history, 'back').mockImplementation(() => {});
    const push = vi.spyOn(history, 'pushState');
    armForTest();
    push.mockClear();

    onPopState();
    expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('Zpět'), EXIT_WINDOW_MS);
    expect(push).toHaveBeenCalledTimes(1); // zarážka vrácena, aplikace zůstala
    expect(back).not.toHaveBeenCalled();

    onPopState();
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
    push.mockRestore();
  });
});
