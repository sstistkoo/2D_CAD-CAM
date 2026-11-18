// @vitest-environment happy-dom
// Post-draw dialog: režim průměru patří ose X – na soustruhu svislé (wy),
// na karuselu vodorovné (wx), stejně jako export/import G-kódu.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';

let state, showPostDrawPointDialog;
beforeAll(async () => {
  installUiDom();
  ({ state } = await import('../js/state.js'));
  ({ showPostDrawPointDialog } = await import('../js/dialogs/postDrawDialog.js'));
});
afterEach(() => { document.querySelectorAll('.input-overlay, .overlay').forEach(o => o.remove()); });

function openPoint(machineType) {
  state.machineType = machineType;
  state.xDisplayMode = 'diameter';
  const obj = { type: 'point', x: 30, y: 10 };
  showPostDrawPointDialog(obj);
  const h = document.querySelector('#pdH'), v = document.querySelector('#pdV');
  return { obj, h, v };
}

describe('Post-draw bod: průměr na ose X podle typu stroje', () => {
  it('soustruh: zdvojená svislá (X), vodorovná (Z) beze změny', () => {
    const { obj, h, v } = openPoint('soustruh');
    expect(+h.value).toBe(30);
    expect(+v.value).toBe(20);
    document.querySelector('#pdOk').click();
    expect(obj).toMatchObject({ x: 30, y: 10 });
  });
  it('karusel: zdvojená vodorovná (X), svislá (Z) beze změny', () => {
    const { obj, h, v } = openPoint('karusel');
    expect(+h.value).toBe(60);
    expect(+v.value).toBe(10);
    h.value = '80';
    document.querySelector('#pdOk').click();
    expect(obj).toMatchObject({ x: 40, y: 10 });
  });
});

describe('Číselné zadání a polární kreslení: ⌀ na ose X', () => {
  it('číselné zadání bodu: pole X v průměru, objekt v poloměru (soustruh i karusel)', async () => {
    const { renderNumericalTab, initNumericalTab } = await import('../js/dialogs/numericalInput.js');
    for (const [machine, field, other] of [['soustruh', '#ny', '#nx'], ['karusel', '#nx', '#ny']]) {
      state.machineType = machine; state.xDisplayMode = 'diameter'; state.coordMode = 'abs';
      state.numDialogChain = { x: null, y: null };
      state.lastClickPoint = machine === 'soustruh' ? { x: 30, y: 10 } : { x: 10, y: 30 };
      const box = document.createElement('div');
      box.className = 'input-overlay';
      box.innerHTML = renderNumericalTab().html;
      document.body.appendChild(box);
      const tab = initNumericalTab(box);
      const sel = box.querySelector('#numType'); sel.value = 'point'; sel.dispatchEvent(new Event('change'));
      expect(+box.querySelector(field).value).toBe(20);     // ⌀ 20 = poloměr 10
      expect(+box.querySelector(other).value).toBe(30);
      box.querySelector(field).value = '50';
      const n = state.objects.length;
      box.querySelector('#numOk').click();
      const o = state.objects[n];
      expect(machine === 'soustruh' ? o.y : o.x).toBeCloseTo(25, 9);
      tab.destroy?.(); box.remove();
    }
  });

  it('polární kreslení: ref. bod z vybraného bodu ukazuje ⌀, úsečka začne v poloměru', async () => {
    const { showPolarDrawingDialog } = await import('../js/dialogs/polarDrawing.js');
    state.machineType = 'soustruh'; state.xDisplayMode = 'diameter'; state.coordMode = 'abs';
    state.objects.push({ id: 9001, type: 'point', x: 30, y: 10, layer: 0 });
    state.selected = state.objects.length - 1;
    showPolarDrawingDialog();
    expect(+document.querySelector('#polRefX').value).toBe(30);
    expect(+document.querySelector('#polRefZ').value).toBe(20);
    state.selected = null;
  });
});

describe('Zrcadlit / Překlopit: popisky os podle stroje', () => {
  it('soustruh vodorovně Z, karusel vodorovně X', async () => {
    const { showMirrorDialog, showRotateDialog } = await import('../js/dialogs/objectDialogs.js');
    for (const [machine, h, v] of [['soustruh', 'Z', 'X'], ['karusel', 'X', 'Z']]) {
      state.machineType = machine;
      showMirrorDialog({ type: 'line', name: 'L' }, () => {});
      const [bx, bz] = document.querySelectorAll('.mirror-opt');
      expect(bx.dataset.axis).toBe('x');          // přes vodorovnou přímku
      expect(bx.textContent).toContain(`Osa ${h} (vodorovná`);
      expect(bz.textContent).toContain(`Osa ${v} (svislá`);
      showRotateDialog({ type: 'line', name: 'L' }, () => {}, () => {});
      expect(document.querySelector('#dlgFlipZ').textContent).toBe(`⇔ Překlopit ${h}`);
      expect(document.querySelector('#dlgFlipX').textContent).toBe(`⇕ Překlopit ${v}`);
      document.querySelectorAll('.input-overlay').forEach(o => o.remove());
    }
  });
});

describe('Oblouk segmentu (bulge): oblouk přes 180° se po OK nezkrátí', () => {
  it('|bulge| > 1 → záporné R, OK vrátí stejný bulge; kladné R krátký oblouk', async () => {
    const { showBulgeDialog } = await import('../js/dialogs/bulge.js');
    for (const b0 of [2, -2, 0.5, -0.5]) {
      let got = null;
      showBulgeDialog({ x: 0, y: 0 }, { x: 10, y: 0 }, b0, (b) => { got = b; });
      const r = +document.querySelector('#dlgBulgeR').value;
      expect(Math.sign(r)).toBe(Math.abs(b0) > 1 ? -1 : 1);
      document.querySelector('#dlgBulgeOk').click();
      expect(got).toBeCloseTo(b0, 3);
    }
  });
});

describe('Upravit objekt (mobileEdit): ⌀ na ose X a ochrana proti NaN', () => {
  it('soustruh ⌀: svislé pole v průměru; neplatná hodnota objekt nezmění', async () => {
    const { showEditObjectDialog } = await import('../js/dialogs/mobileEdit.js');
    state.machineType = 'soustruh'; state.xDisplayMode = 'diameter';
    const line = { id: 9101, type: 'line', x1: 0, y1: 10, x2: 20, y2: 15, layer: 0, name: 'L' };
    state.objects.push(line);
    showEditObjectDialog(state.objects.length - 1);
    const q = (s) => document.querySelector(s);
    expect(+q('#editY1').value).toBe(20);
    expect(+q('#editX2').value).toBe(20);
    q('#editY2').value = '1o';            // překlep
    q('#editOk').click();
    expect(line).toMatchObject({ x1: 0, y1: 10, x2: 20, y2: 15 });
    q('#editY2').value = '40';
    q('#editOk').click();
    expect(line.y2).toBe(20);
    document.querySelectorAll('.input-overlay').forEach(o => o.remove());
  });
});
