// @vitest-environment happy-dom
// Panel vlastností (updateProperties, ~1100 ř.). Psáno PŘED rozdělením
// z ui.js do js/ui/properties/ (docs/plan-refaktoringu-ui.md, Fáze 4) jako
// charakterizace, GENERATIVNĚ (ruční výčet desítek polí by byl děravý):
//   1. pro každý scénář (typ objektu, režim segmentu, vícenásobný výběr,
//      karusel / průměr) snímek panelu — řádky, hodnoty polí, stav prvků;
//   2. pro KAŽDÝ prvek panelu, který při vykreslení dostal listener
//      click / change / input, na čerstvé kopii výkresu jeho použití →
//      co se změnilo na výkresu a výběru, počet záznamů Zpět, hláška,
//      otevřené okno, první řádky panelu po akci.
// Snímek je v tests/__snapshots__/ui-properties.test.js.snap. Přepsat ho
// (`-u`) jen když je změna chování záměrná — NE při stěhování kódu.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';

vi.mock('../js/dialogs/textDialog.js', async (orig) => ({ ...(await orig()), showTextDialog: vi.fn() }));

let ui, state, textDialog;
const tbody = () => document.querySelector('#propTable tbody');
const toast = () => document.querySelector('.toast')?.textContent ?? null;
const clean = (s) => s.replace(/\s+/g, ' ').trim();

const L1 = { type: 'line', id: 1, name: 'Úsečka 1', x1: 0, y1: 0, x2: 10, y2: 5, layer: 0 };
const POLY = { type: 'polyline', id: 2, name: 'Kontura 2', vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 20, y: 8 }], bulges: [0, 0.4, 0], closed: false, layer: 0 };
const SCENARIOS = {
  none: { objects: [L1], selected: null },
  point: { objects: [{ type: 'point', id: 1, name: 'Bod 1', x: 3, y: 4, layer: 0 }] },
  line: { objects: [L1] },
  'line-karusel-prumer': { objects: [L1], machineType: 'karusel', xDisplayMode: 'diameter' },
  'line-inc': { objects: [L1], coordMode: 'inc', incReference: { x: 2, y: 1 } },
  constr: { objects: [{ ...L1, type: 'constr', name: 'Konstrukční 1' }] },
  circle: { objects: [{ type: 'circle', id: 1, name: 'Kružnice 1', cx: 5, cy: 2, r: 4, layer: 0 }] },
  arc: { objects: [{ type: 'arc', id: 1, name: 'Oblouk 1', cx: 5, cy: 2, r: 4, startAngle: 0, endAngle: Math.PI / 2, layer: 0 }] },
  rect: { objects: [{ type: 'rect', id: 1, name: 'Obdélník 1', x1: 0, y1: 0, x2: 30, y2: 10, layer: 0 }] },
  'rect-strana': { objects: [{ type: 'rect', id: 1, name: 'Obdélník 1', x1: 0, y1: 0, x2: 30, y2: 10, layer: 0 }], segs: [[0, [1]]] },
  polyline: { objects: [POLY] },
  'polyline-uzavrena': { objects: [{ ...POLY, vertices: POLY.vertices.slice(0, 3), bulges: [0, 0, 0.2], closed: true }] },
  'polyline-segment': { objects: [POLY], selectedSegment: 1 },
  'polyline-segmenty': { objects: [POLY], selectedSegment: 2, segs: [[0, [0, 2]]] },
  text: { objects: [{ type: 'text', id: 1, name: 'Text 1', x: 1, y: 2, text: 'Ahoj', fontSize: 14, layer: 0 }] },
  'vice-objektu': { objects: [L1, { ...L1, id: 3, name: 'Úsečka 3', y1: 4, y2: 4, color: '#ff0000', isStock: true }], multi: [0, 1] },
};

function setup(name) {
  const sc = SCENARIOS[name];
  document.querySelectorAll('.input-overlay, .calc-overlay, .color-popover-overlay').forEach(o => o.remove());
  Object.assign(state, { machineType: 'soustruh', xDisplayMode: 'radius', coordMode: 'abs', incReference: { x: 0, y: 0 } });
  for (const k of ['machineType', 'xDisplayMode', 'coordMode', 'incReference']) if (sc[k] !== undefined) state[k] = structuredClone(sc[k]);
  state.objects = structuredClone(sc.objects);
  state.nextId = 10;
  state.selected = 'selected' in sc ? sc.selected : 0;
  state.multiSelected = new Set(sc.multi || []);
  state.selectedSegment = sc.selectedSegment ?? null;
  state._selectedSegmentObjIdx = sc.selectedSegment != null ? 0 : null;
  state.multiSelectedSegments = new Map((sc.segs || []).map(([k, v]) => [k, new Set(v)]));
  state.selectedPoint = null;
  state.anchors.length = 0;
  state.undoStack.length = 0;
  document.querySelector('.toast')?.remove();
  ui.updateProperties();
}

/** Řádky panelu: text buněk + stav ovládacích prvků. */
function panel() {
  return [...tbody().children].map(tr => [...tr.children].map(td => {
    const ctrls = [...td.querySelectorAll('input, select, button, textarea')].map(c => {
      if (c.tagName === 'SELECT') return `<select ${[...c.options].map(o => (o.selected ? '*' : '') + o.textContent).join('|')}>`;
      if (c.tagName === 'BUTTON') return `<button ${clean(c.textContent)}${c.disabled ? ' disabled' : ''}>`;
      if (c.type === 'checkbox' || c.type === 'radio') return `<${c.type}${c.name ? ' ' + c.name + '=' + c.value : ''}${c.checked ? ' ✓' : ''}>`;
      return `<${c.type || 'textarea'} ${c.value}>`;
    });
    const text = clean([...td.childNodes].filter(n => n.nodeType === 3 || (n.nodeType === 1 && !n.matches('input, select, button, textarea') && !n.querySelector('input, select, button, textarea'))).map(n => n.textContent).join(' '));
    return [text, ...ctrls].filter(Boolean).join(' ');
  }).join(' │ '));
}

// Zaznamenat prvky panelu, které dostaly listener při vykreslení.
const ACT_TYPES = new Set(['click', 'change', 'input']);
function recordListeners(fn) {
  const owners = new Set();
  for (const o of [document, window, document.createElement('div')]) {
    let p = o; while (p && !Object.prototype.hasOwnProperty.call(p, 'addEventListener')) p = Object.getPrototypeOf(p);
    owners.add(p);
  }
  const rec = [];
  const restore = [];
  for (const proto of owners) {
    const orig = proto.addEventListener;
    proto.addEventListener = function (type, f, o) { if (ACT_TYPES.has(type)) rec.push([this, type]); return orig.call(this, type, f, o); };
    restore.push(() => { proto.addEventListener = orig; });
  }
  try { fn(); } finally { restore.forEach(r => r()); }
  return rec;
}

function actions(name) {
  const rec = recordListeners(() => setup(name));
  const all = [...tbody().querySelectorAll('*')];
  const seen = new Set();
  const out = [];
  for (const [el, type] of rec) {
    const i = all.indexOf(el);
    if (i < 0 || seen.has(i + type)) continue;
    seen.add(i + type);
    out.push({ i, type, desc: `${el.tagName.toLowerCase()}${el.type ? '[' + el.type + ']' : ''} „${clean(el.closest('tr')?.firstElementChild?.textContent || '').slice(0, 30)}"` });
  }
  // happy-dom volá addEventListener u <select> s jiným `this` (identita
  // nesedí) — selecty panelu (všechny mají change) se doplní zvlášť.
  all.forEach((el, i) => {
    if (el.tagName === 'SELECT' && !seen.has(i + 'change')) {
      out.push({ i, type: 'change', desc: `select „${clean(el.closest('tr')?.firstElementChild?.textContent || '').slice(0, 30)}"` });
    }
  });
  return out.sort((a, b) => a.i - b.i || a.type.localeCompare(b.type));
}

function act(el, type) {
  if (type === 'click') { el.click(); return 'klik'; }
  if (el.tagName === 'SELECT') {
    // happy-dom: selectedIndex po vytvoření voleb nesedí — další volba za označenou
    const opts = [...el.options];
    const cur = Math.max(0, opts.findIndex(o => o.selected));
    const next = opts[(cur + 1) % opts.length];
    el.value = next.value;
    el.dispatchEvent(new Event(type, { bubbles: true }));
    return `výběr ${next.textContent}`;
  }
  if (el.type === 'checkbox' || el.type === 'radio') { el.checked = !el.checked; el.dispatchEvent(new Event(type, { bubbles: true })); return `zaškrtnout ${el.checked}`; }
  const v = el.type === 'color' ? '#123456' : (el.classList.contains('prop-name-input') || el.tagName === 'TEXTAREA' ? 'Nové jméno' : '7');
  el.value = v;
  el.dispatchEvent(new Event(type, { bubbles: true }));
  return `hodnota ${v}`;
}

const r6 = (v) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'number' ? Math.round(x * 1e6) / 1e6 : x instanceof Set ? [...x] : x instanceof Map ? [...x] : x)));
function diff(before, after) {
  if (before.length !== after.length) return { objekty: r6(after) };
  const d = {};
  after.forEach((o, i) => {
    for (const k of new Set([...Object.keys(before[i] || {}), ...Object.keys(o)])) {
      if (JSON.stringify(before[i]?.[k]) !== JSON.stringify(o[k])) d[`${i}.${k}`] = r6(o[k] ?? null);
    }
  });
  return d;
}

beforeAll(async () => {
  installUiDom();
  ui = await import('../js/ui.js');
  ({ state } = await import('../js/state.js'));
  textDialog = await import('../js/dialogs/textDialog.js');
  vi.stubGlobal('prompt', vi.fn(() => '5'));
  vi.stubGlobal('confirm', vi.fn(() => true));
});
afterEach(() => { state.objects = []; state.selected = null; });

describe('panel vlastností', () => {
  for (const name of Object.keys(SCENARIOS)) {
    it(`${name}: snímek panelu a účinek každého prvku`, () => {
      setup(name);
      const snap = { panel: panel(), akce: [] };
      for (const { i, type, desc } of actions(name)) {
        setup(name);
        const before = structuredClone(state.objects);
        const el = [...tbody().querySelectorAll('*')][i];
        const how = act(el, type);
        const ov = document.querySelector('.input-overlay, .calc-overlay, .color-popover-overlay');
        snap.akce.push({
          prvek: `${desc} ${type}: ${how}`,
          vykres: diff(before, state.objects),
          vyber: r6([state.selected, state.multiSelected, state.selectedSegment, state.multiSelectedSegments]),
          zpet: state.undoStack.length,
          hlaska: toast(),
          okno: ov ? clean(ov.querySelector('h3')?.textContent || ov.className) : null,
          textDialog: textDialog.showTextDialog.mock.calls.length || undefined,
          panelPo: panel().slice(0, 3),
        });
        textDialog.showTextDialog.mockClear();
      }
      expect(snap).toMatchSnapshot();
    });
  }
});
