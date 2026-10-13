// Harness pro testy UI simulátoru (js/calculators/camSimulator.js) v happy-dom.
//
// Simulátor je jedna obří funkce bez testů UI; tenhle harness ho otevře nad
// .camprog fixture tak, jak to dělá aplikace (stav z localStorage), aby šlo
// PŘED přestěhováním bloku do vlastního modulu napsat test, který projde na
// starém kódu a po přesunu musí projít beze změny
// (docs/plan-rozdeleni-cam-simulatoru.md).
//
// Použití (test musí mít v hlavičce `// @vitest-environment happy-dom`):
//   installSimDom();
//   const sim = await openSim(loadFixture('cam/part-1.camprog'));
//   sim.S.params …, sim.q('[data-code="refresh"]'), sim.drawCalls() …
//   sim.close();
//
// Co harness nahrazuje (happy-dom nemá layout ani 2D kreslení):
// - <body> z index.html bez <script> — moduly aplikace (js/canvas.js aj.)
//   hledají své prvky už při importu,
// - getContext('2d') → záznamník volání (pro každé plátno zvlášť),
// - clientWidth/clientHeight plátna simulátoru (bez nich draw() nic nenakreslí).
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

export const SIM_STORAGE_KEY = 'skica-cam-simulator';
export const SIM_CANVAS_W = 800;
export const SIM_CANVAS_H = 600;

/** Načte .camprog z tests/fixtures (cesta relativně k té složce). */
export function loadFixture(rel) {
  return JSON.parse(readFileSync(join(root, 'tests', 'fixtures', rel), 'utf8'));
}

// ── Záznamník 2D kontextu ──
// Metody se zapisují jako [jméno, ...argumenty], nastavení vlastnosti jako
// ['=', klíč, hodnota]. Návratové hodnoty jen takové, aby kreslicí kód prošel.
const RETURNS = {
  measureText: (t) => ({ width: String(t ?? '').length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
  getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
  createImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
  createLinearGradient: () => ({ addColorStop() {} }),
  createRadialGradient: () => ({ addColorStop() {} }),
  createConicGradient: () => ({ addColorStop() {} }),
  createPattern: () => ({ setTransform() {} }),
  getLineDash: () => [],
  isPointInPath: () => false,
  isPointInStroke: () => false,
  getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
};

function recordingContext(canvas) {
  const calls = [];
  const props = { canvas, lineWidth: 1, globalAlpha: 1, font: '10px sans-serif', fillStyle: '#000', strokeStyle: '#000' };
  const ctx = new Proxy(props, {
    get(t, k) {
      if (k === '__calls') return calls;
      if (k in t) return t[k];
      if (typeof k === 'symbol') return undefined;
      const ret = RETURNS[k];
      return (...args) => { calls.push([k, ...args]); return ret ? ret(...args) : undefined; };
    },
    set(t, k, v) { calls.push(['=', k, v]); t[k] = v; return true; },
  });
  return ctx;
}

let _installed = false;

/**
 * Připraví DOM jako v aplikaci. Volat jednou na test soubor (beforeAll) —
 * importy aplikace se cachují, takže DOM musí existovat před prvním importem.
 */
export function installSimDom() {
  if (_installed) return;
  _installed = true;
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/gi, '');

  const ctxOf = new WeakMap();
  HTMLCanvasElement.prototype.getContext = function () {
    if (!ctxOf.has(this)) ctxOf.set(this, recordingContext(this));
    return ctxOf.get(this);
  };

  // Rozměr jen pro obal plátna simulátoru; ostatní prvky beze změny (0).
  const isSimWrap = (el) => el.classList?.contains('cam-sim-canvas-wrap');
  for (const [key, val] of [['clientWidth', SIM_CANVAS_W], ['clientHeight', SIM_CANVAS_H]]) {
    const orig = Object.getOwnPropertyDescriptor(HTMLElement.prototype, key);
    Object.defineProperty(HTMLElement.prototype, key, {
      configurable: true,
      get() { return isSimWrap(this) ? val : orig.get.call(this); },
    });
  }
}

/** Počká na časovače / requestAnimationFrame simulátoru. */
export const settle = (ms = 30) => new Promise(r => setTimeout(r, ms));

/**
 * Otevře simulátor nad .camprog (jako by ho aplikace měla uložený
 * v localStorage). Bez `prog` = výchozí stav (vzorová kontura).
 * Vrací { S, close, root, q, qa, canvas, drawCalls, clearDrawCalls }.
 */
export async function openSim(prog, { settleMs = 30 } = {}) {
  installSimDom();
  localStorage.removeItem(SIM_STORAGE_KEY);
  if (prog) localStorage.setItem(SIM_STORAGE_KEY, JSON.stringify(prog));
  const { state } = await import('../../js/state.js');
  // flipX/flipZ simulátor nebere z localStorage, ale ze sdíleného stavu CAD.
  state.flipX = !!prog?.flipX;
  state.flipZ = !!prog?.flipZ;
  const { openCamSimulator } = await import('../../js/calculators/camSimulator.js');
  const h = openCamSimulator();
  if (!h) throw new Error('simUi: openCamSimulator nic nevrátil (overlay už je otevřený?)');
  await settle(settleMs);
  const rootEl = document.querySelector('.cam-sim-root');
  const canvas = rootEl.querySelector('.cam-sim-canvas-wrap canvas');
  const calls = () => canvas.getContext('2d').__calls;
  return {
    S: h.S,
    close: async () => { h.close(); await settle(5); },
    root: rootEl,
    q: (sel) => rootEl.querySelector(sel),
    qa: (sel) => [...rootEl.querySelectorAll(sel)],
    canvas,
    drawCalls: calls,
    clearDrawCalls: () => { calls().length = 0; },
  };
}
