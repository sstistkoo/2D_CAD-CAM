// @vitest-environment happy-dom
// Kalkulačka: historie z IDB dorazí až po zavření okna. Dřív ji zpětné volání
// vykreslilo do zavřeného okna přes `document` — po skončení testu (prostředí
// happy-dom už pryč) to v CI shodilo běh „document is not defined"
// (tests/ui-trig.test.js otevírá kalkulačku na konci). Teď se zavřené okno
// nevykresluje.
import 'fake-indexeddb/auto';
import { it, expect, vi } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';

vi.mock('../js/idb.js', async (orig) => {
  const real = await orig();
  return {
    ...real,
    getMeta: (k) => k === 'calcHistory'
      ? new Promise(r => setTimeout(() => r([{ expr: '1+1', result: 2 }]), 100))
      : real.getMeta(k),
  };
});

it('okno zavřené před načtením historie: nic se nevykresluje (ani bez document)', async () => {
  installUiDom();
  const ui = await import('../js/ui.js');
  ui.openCalculator();
  document.querySelector('.calc-overlay').remove();
  await new Promise(r => setTimeout(r, 20));   // mikroúlohy (MutationObserver) proběhnou jako v testu
  // jako konec prostředí happy-dom: globální document zmizí, než historie dorazí
  const d = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { value: undefined, configurable: true, writable: true });
  const errs = [];
  const onErr = (e) => { errs.push(String(e)); };
  process.on('unhandledRejection', onErr);
  try {
    await new Promise(r => setTimeout(r, 200));
  } finally {
    process.off('unhandledRejection', onErr);
    Object.defineProperty(globalThis, 'document', d);
  }
  expect(errs).toEqual([]);
});
