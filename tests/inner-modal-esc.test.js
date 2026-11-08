// @vitest-environment happy-dom
// Esc / Zpět v okně s otevřeným vnitřním oknem (číselník, úhel… v CNC editoru)
// zavře nejdřív vnitřní okno, ne celé okno pod ním. Esc obsloužený jinde
// (hledání v editoru volá preventDefault) okno nezavře vůbec.
import { describe, it, expect, afterEach } from 'vitest';
import { makeOverlay } from '../js/dialogFactory.js';
import { closeInnerModal } from '../js/dialogs/innerModal.js';

const BODY = `
  <div class="cne-inner-modal" data-el="numModal" style="display:none">
    <div class="cne-im-card"><div class="cne-im-title"><span>Vstup</span><button class="cne-im-close" data-act="numCancel">✕</button></div></div>
  </div>
  <input class="srch">`;

const esc = (target = document) => {
  const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
};

function open() {
  const ov = makeOverlay('inner-test', 'Test', BODY, 'w');
  // Obsluha křížku jako v editoru (delegace na overlay).
  ov.addEventListener('click', e => {
    if (e.target.closest('[data-act="numCancel"]')) ov.querySelector('[data-el="numModal"]').style.display = 'none';
  });
  return ov;
}

afterEach(() => { document.querySelectorAll('.calc-overlay').forEach(o => o.remove()); });

describe('vnitřní okna a Esc', () => {
  it('Esc s otevřeným číselníkem zavře jen číselník, druhý Esc okno', () => {
    const ov = open();
    const num = ov.querySelector('[data-el="numModal"]');
    num.style.display = 'flex';
    esc();
    expect(num.style.display).toBe('none');
    expect(ov.isConnected).toBe(true);
    esc();
    expect(ov.isConnected).toBe(false);
  });

  it('Esc už obsloužený polem (preventDefault) okno nezavře', () => {
    const ov = open();
    const inp = ov.querySelector('.srch');
    inp.addEventListener('keydown', e => { if (e.key === 'Escape') e.preventDefault(); });
    esc(inp);
    expect(ov.isConnected).toBe(true);
  });

  it('closeInnerModal bez otevřeného vnitřního okna vrátí false', () => {
    const ov = open();
    expect(closeInnerModal(ov)).toBe(false);
    expect(closeInnerModal(null)).toBe(false);
  });
});
