// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – CNC Editor: dialog ⌒ Oblouk (G2 / G3 / tečně / úhel)  ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Nahrazuje klávesy G2, G3 a T v rychlé liště. Dialog vybírá smysl oblouku,
// tečné napojení a údaje (konec X/Z, R, úhel rozevření); výpočet je v
// cncArcTools.js. Stejný princip a vzhled jako dialog „Úsečka úhlem".
// Prvky dialogu používají `data-arc` (ne `data-act`), takže je obecný
// obsluhovač kliků v cncEditor.js nechytá.

import { safeEvalMath } from '../utils.js';
import { arcContext, previewArc } from './cncArcTools.js';
import { f3 } from './cncDrawTools.js';

export const ARC_MODAL_HTML = `<!-- Oblouk -->
  <div class="cne-inner-modal" data-el="arcModal" style="display:none">
    <div class="cne-im-card">
      <div class="cne-im-title">⌒ Oblouk<button class="cne-im-close" data-arc="cancel" title="Zavřít">✕</button></div>
      <div class="cne-ang-from" data-el="arcFrom"></div>
      <div class="cne-ang-modes">
        <button class="cne-ang-mode on" data-arc="g" data-g="2" title="G2 – po směru hodinových ručiček">↻ G2</button>
        <button class="cne-ang-mode" data-arc="g" data-g="3" title="G3 – proti směru hodinových ručiček">↺ G3</button>
      </div>
      <div class="cne-ang-modes" data-el="arcLinkRow">
        <button class="cne-ang-mode on" data-arc="link" data-tangent="0" title="Oblouk bez napojení na předchozí prvek">Netečně</button>
        <button class="cne-ang-mode" data-arc="link" data-tangent="1" title="Tečné napojení na konec předchozí úsečky / oblouku (zapíše T)">⟿ Tečně</button>
      </div>
      <div class="cne-ang-hint" data-el="arcHint"></div>
      <div class="cne-ang-grid cne-arc-grid">
        <label>Konec X<input class="cne-im-input" data-el="arcX" type="text" inputmode="decimal" autocomplete="off"></label>
        <label>Konec Z<input class="cne-im-input" data-el="arcZ" type="text" inputmode="decimal" autocomplete="off"></label>
        <label>R<input class="cne-im-input" data-el="arcR" type="text" inputmode="decimal" autocomplete="off"></label>
        <label>Úhel rozevření °<input class="cne-im-input" data-el="arcA" type="text" inputmode="decimal" autocomplete="off"></label>
      </div>
      <label class="cne-arc-big" data-el="arcBigRow"><input type="checkbox" data-el="arcBig"> velký oblouk (&gt; 180°, zapíše záporné R)</label>
      <div class="cne-ang-res" data-el="arcRes"></div>
      <div class="cne-arc-info" data-el="arcInfo"></div>
      <div class="cne-im-actions">
        <button class="cne-im-btn cancel" data-arc="cancel">Zrušit</button>
        <button class="cne-im-btn ok" data-arc="ok">Vložit oblouk</button>
      </div>
    </div>
  </div>`;

const FIELDS = ['arcX', 'arcZ', 'arcR', 'arcA'];

/**
 * @param {{$: (id: string) => HTMLElement|null, editor: HTMLTextAreaElement,
 *   getOpts: () => object, caretLine: () => number,
 *   insertLines: (text: string, label?: string, detail?: string) => void,
 *   closeOnBackdropClick: (el: HTMLElement, close: () => void) => void}} deps
 * @returns {{open: () => void}}
 */
export function createArcModal({ $, editor, getOpts, caretLine, insertLines, closeOnBackdropClick }) {
  const modal = $('arcModal');
  if (!modal) return { open() {} };

  let ctx = null;
  let g = 2;
  let tangent = false;
  let last = { err: '' };

  const val = (id) => {
    const s = $(id).value.trim();
    if (!s) return null;
    const n = safeEvalMath(s);
    return Number.isFinite(n) ? n : NaN;
  };
  const close = () => { modal.style.display = 'none'; };

  function evaluate() {
    const nums = FIELDS.map(val);
    if (nums.some(Number.isNaN)) return { err: 'Neplatné číslo.' };
    const [X, Z, R, sweep] = nums;
    return previewArc(ctx, { g, tangent, X, Z, R, sweep, big: $('arcBig').checked });
  }

  function sync() {
    const res = evaluate();
    last = res;
    if (res.info && res.info.autoDir) g = res.g;      // smysl určilo napojení, ne volba
    modal.querySelectorAll('[data-arc="g"]').forEach((b) => b.classList.toggle('on', Number(b.dataset.g) === g));
    modal.querySelectorAll('[data-arc="link"]').forEach((b) => b.classList.toggle('on', (b.dataset.tangent === '1') === tangent));
    $('arcLinkRow').hidden = !ctx.tangentOk;
    $('arcBigRow').hidden = tangent;
    $('arcHint').textContent = tangent
      ? 'Zadej: konec X+Z, nebo R + X či Z, nebo R + úhel rozevření.'
      : 'Zadej: konec X+Z a R, nebo konec X+Z a úhel rozevření.' + (ctx.tangentOk ? '' : ` Tečně nejde: ${ctx.why}.`);
    const any = FIELDS.some((id) => $(id).value.trim() !== '');
    const info = $('arcInfo');
    info.classList.toggle('cne-arc-err', !!res.err && any);
    if (res.err) {
      $('arcRes').textContent = '';
      info.textContent = any ? `⚠ ${res.err}` : '';
      return;
    }
    $('arcRes').textContent = `→ ${res.line}` + (ctx.incr ? ' (G91 – přírůstky)' : '');
    info.textContent = `R ${f3(res.info.r)} · úhel ${f3(res.info.sweepDeg)}° · konec X${f3(res.info.end.x)} Z${f3(res.info.end.z)}`
      + (res.info.autoDir ? ' · smysl určen napojením' : '');
  }

  function confirm() {
    sync();
    if (last.err) { $('arcInfo').textContent = `⚠ ${last.err}`; $('arcInfo').classList.add('cne-arc-err'); return; }
    close();
    // Nový řádek hned za řádek, ze kterého oblouk vychází.
    const v = editor.value;
    let pos = 0;
    v.split('\n').slice(0, ctx.idx + 1).forEach((l) => { pos += l.length + 1; });
    editor.selectionStart = editor.selectionEnd = Math.max(0, Math.min(v.length, pos - 1));
    insertLines(`${last.line} ; ${last.comment}`, 'Oblouk', `G${last.g}`);
  }

  function open() {
    ctx = arcContext(editor.value, caretLine(), getOpts());
    tangent = false;
    FIELDS.forEach((id) => { $(id).value = ''; });
    $('arcBig').checked = false;
    $('arcFrom').textContent = `Z bodu X${f3(ctx.from.x * ctx.xs)} Z${f3(ctx.from.z)}`
      + (ctx.prevLine !== null ? ` (konec řádku ${ctx.prevLine + 1})` : ' (počátek)')
      + (ctx.incr ? ' – G91, zapíše přírůstky' : '');
    modal.style.display = 'flex';
    sync();
  }

  modal.addEventListener('click', (e) => {
    const b = e.target.closest('[data-arc]');
    if (!b) return;
    switch (b.dataset.arc) {
      case 'g': g = Number(b.dataset.g); break;
      case 'link': tangent = b.dataset.tangent === '1' && ctx.tangentOk; break;
      case 'ok': confirm(); return;
      case 'cancel': close(); return;
      default: return;
    }
    sync();
  });
  modal.addEventListener('input', sync);
  modal.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); confirm(); } });
  closeOnBackdropClick(modal, close);

  return { open };
}
