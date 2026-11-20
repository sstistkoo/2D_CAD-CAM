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
    state.xDisplayMode = 'radius';
    localStorage.removeItem('skica.filletInfo.auto');
    const arc = { type: 'arc', cx: 100, cy: 20, r: 5, startAngle: -Math.PI / 2, endAngle: 10 * Math.PI / 180, ccw: true };
    fi.showFilletInfo(arc, { auto: true });
    const ov = document.querySelector('.calc-overlay[data-type="filletInfo"]');
    expect(ov).not.toBeNull();
    expect(ov.textContent).toContain('Začátek R');
    expect(ov.textContent).toContain('★ Největší Ø na R');
    state.xDisplayMode = 'radius';
    expect(ov.textContent).toContain('(Ø210.000)');      // X105 → Ø210 v závorce
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

describe('⊹ Krajní body – průměr v závorce', () => {
  it('nejvzdálenější bod má (Ø…) v režimu poloměr, (R…) v režimu průměr', async () => {
    const ep = await import('../js/dialogs/extremePoints.js');
    state.machineType = 'karusel';
    state.xDisplayMode = 'radius';
    ep.showExtremePointsDialog({ type: 'arc', cx: 162.92, cy: 178, r: 5, startAngle: -Math.PI / 2, endAngle: 10 * Math.PI / 180, ccw: true });
    let dlg = document.querySelector('.input-overlay');
    expect(dlg.textContent).toContain('(Ø335.840)');
    dlg.remove();
    state.xDisplayMode = 'diameter';
    ep.showExtremePointsDialog({ type: 'arc', cx: 162.92, cy: 178, r: 5, startAngle: -Math.PI / 2, endAngle: 10 * Math.PI / 180, ccw: true });
    dlg = document.querySelector('.input-overlay');
    expect(dlg.textContent).toContain('(R167.920)');
    dlg.remove();
    state.xDisplayMode = 'radius';
  });
});
