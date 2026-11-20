// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';

let state, fi;
beforeAll(async () => {
  installUiDom();
  await import('../js/ui.js');
  ({ state } = await import('../js/state.js'));
  fi = await import('../js/dialogs/filletInfo.js');
});

describe('◜ panel Přechod R – body', () => {
  it('ukáže začátek, konec, střed a ★ krajní Ø; 📐 přidá značku', () => {
    state.machineType = 'karusel';
    localStorage.removeItem('skica.filletInfo.auto');
    const arc = { type: 'arc', cx: 100, cy: 20, r: 5, startAngle: -Math.PI / 2, endAngle: 10 * Math.PI / 180, ccw: true };
    fi.showFilletInfo(arc, { auto: true });
    const ov = document.querySelector('.calc-overlay[data-type="filletInfo"]');
    expect(ov).not.toBeNull();
    expect(ov.textContent).toContain('Začátek R');
    expect(ov.textContent).toContain('★ Největší Ø na R');
    const n0 = state.objects.length;
    ov.querySelector('.fi-mark').click();
    expect(state.objects.length).toBeGreaterThan(n0);
    // vypínač „ukazovat po zaoblení"
    const cb = ov.querySelector('#fiAuto');
    cb.checked = false; cb.dispatchEvent(new Event('change'));
    ov.remove();
    fi.showFilletInfo(arc, { auto: true });
    expect(document.querySelector('.calc-overlay[data-type="filletInfo"]')).toBeNull();
    fi.showFilletInfo(arc);                             // z info o oblouku vždy
    expect(document.querySelector('.calc-overlay[data-type="filletInfo"]')).not.toBeNull();
    document.querySelector('.calc-overlay[data-type="filletInfo"]').remove();
  });
});
