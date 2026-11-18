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
