// @vitest-environment happy-dom
import { describe, it, expect, beforeAll } from 'vitest';

let openInlineEdit, closeInlineEdit;
const vv = { scale: 1, offsetLeft: 0, offsetTop: 0, width: 400, height: 700, addEventListener() {}, removeEventListener() {} };
beforeAll(async () => {
  window.matchMedia = (q) => ({ matches: q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {} });
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
  ({ openInlineEdit, closeInlineEdit } = await import('../js/calculators/svgInlineEdit.js'));
  await import('../js/dialogs/mathKeyBar.js');
});
const wait = () => new Promise(r => setTimeout(r, 5));

describe('zadávání v náčrtu + přiblížení prsty', () => {
  it('klepnutí na lištu + − × ÷ okénko nezavře, klepnutí jinam ano', async () => {
    vv.scale = 1;
    document.body.innerHTML = '<div id="out">mimo</div>';
    openInlineEdit({ clientX: 100, clientY: 100 }, { label: 'R', value: '', onCommit() {} });
    await wait();
    const pop = document.querySelector('.svg-pop');
    const inp = pop.querySelector('input');
    inp.setAttribute('inputmode', 'decimal');
    inp.focus();
    const bar = document.querySelector('.math-key-bar');
    expect(bar).not.toBe(null);
    bar.querySelector('[data-mk="+"]').click();
    expect(document.querySelector('.svg-pop')).not.toBe(null);
    expect(inp.value).toBe('+');
    // pointerdown (posun, pinch) samo nezavírá
    document.getElementById('out').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(document.querySelector('.svg-pop')).not.toBe(null);
    document.getElementById('out').click();
    expect(document.querySelector('.svg-pop')).toBe(null);
  });

  it('při přiblížení 2× se okénko zmenší zpět a zůstane ve viditelné ploše', async () => {
    Object.assign(vv, { scale: 2, offsetLeft: 150, offsetTop: 300, width: 200, height: 350 });
    document.body.innerHTML = '';
    openInlineEdit({ clientX: 340, clientY: 640 }, { label: 'Průsečík – ostrá hrana (vrch)', value: '', onCommit() {} });
    const pop = document.querySelector('.svg-pop');
    expect(pop.style.transform).toBe('scale(0.5)');
    expect(parseFloat(pop.style.left)).toBeGreaterThanOrEqual(150);
    expect(parseFloat(pop.style.top)).toBeGreaterThanOrEqual(300);
    closeInlineEdit();
    Object.assign(vv, { scale: 1, offsetLeft: 0, offsetTop: 0, width: 400, height: 700 });
  });

  it('lišta + − × ÷ se při přiblížení zmenší a roztáhne přes viditelnou šířku', () => {
    Object.assign(vv, { scale: 2, offsetLeft: 150, offsetTop: 300, width: 200, height: 350 });
    document.body.innerHTML = '<input type="text" inputmode="decimal" id="x">';
    document.getElementById('x').focus();
    const bar = document.querySelector('.math-key-bar');
    expect(bar.hidden).toBe(false);
    expect(bar.style.transform).toBe('scale(0.5)');
    expect(bar.style.width).toBe('400px');
    expect(bar.style.left).toBe('150px');
    Object.assign(vv, { scale: 1, offsetLeft: 0, offsetTop: 0, width: 400, height: 700 });
  });
});
