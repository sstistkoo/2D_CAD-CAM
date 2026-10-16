// @vitest-environment happy-dom
// Tolerance → Vlastní úchylky: přepínač mm ↔ µm u zadání rozmezí.
import { it, expect, beforeEach } from 'vitest';
import { installUiDom } from './helpers/uiDom.mjs';

async function open() {
  installUiDom();
  const { openToleranceCalc } = await import('../js/calculators/tolerance.js');
  openToleranceCalc();
  const q = (id) => document.querySelector(`[data-id="${id}"]`);
  document.querySelector('[data-src="custom"]').click();
  return q;
}
const type = (el, v) => { el.value = v; el.dispatchEvent(new Event('input')); };

beforeEach(() => { document.body.innerHTML = ''; try { localStorage.clear(); } catch { /* ok */ } });

it('µm: -668 / -786 dá stejný výsledek jako -0,668 / -0,786 mm', async () => {
  const q = await open();
  type(q('tolDim'), '255'); type(q('tolUp'), '-0,668'); type(q('tolLo'), '-0,786');
  const mmRes = document.getElementById('tolResult').textContent;
  q('tolUnit').click();                       // přepočte zadané hodnoty na µm
  expect(q('tolUp').value).toBe('-668');
  expect(q('tolLo').value).toBe('-786');
  expect(document.getElementById('tolResult').textContent).toBe(mmRes);
  type(q('tolUp'), '567'); type(q('tolLo'), '-234');   // nové hodnoty rovnou v µm
  expect(document.getElementById('tolResult').textContent).toContain('255.567');
});

it('přepnutí zpět na mm vrátí původní hodnoty', async () => {
  const q = await open();
  type(q('tolUp'), '-0,3'); type(q('tolLo'), '-0,4');
  q('tolUnit').click(); q('tolUnit').click();
  expect(q('tolUp').value).toBe('-0.3');
  expect(q('tolUnit').textContent).toBe('mm');
});
