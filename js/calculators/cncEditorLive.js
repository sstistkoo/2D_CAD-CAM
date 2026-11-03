// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – CNC Editor z Kalkulaček: zmenšený editor + plátno    ║
// ║  Dvě tlačítka v oranžové liště vedle ✕:                       ║
// ║   ▾  rozbalí / sbalí lišty (☰ panely, 🔍, 🔢… a Údaje)       ║
// ║   ⇕  přepne editor přes celý displej ↔ zmenšený dole, nad     ║
// ║      ním je vidět CAD plátno s živým náhledem psaného kódu    ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Náhled se kreslí na hlavní plátno přes `bridge.renderCncLive` (volá ho
// renderAll v render.js) – výkres se NEMĚNÍ, přepíše se až po zavření
// editoru / 🔄 jako dřív. Geometrie = tentýž rozbor (analyzeDrawCode) jako
// malý náhled v editoru, řádek s kurzorem žlutě.

import { bridge } from '../bridge.js';
import { onOverlayRemoved } from '../dialogFactory.js';
import { storageLoad, storageSave } from './gcodeEditorShared.js';
import { W, movePoints, movesBounds } from './cncDrawPreview.js';

const KEY_COMPACT = 'skica-cnc-editor-compact';
const KEY_BARS = 'skica-cnc-editor-bars';

/**
 * Napojí zmenšený režim a rozbalovací lištu na otevřený kreslicí editor.
 * @param {HTMLElement} overlay   overlay editoru (.calc-overlay.cne-overlay-draw)
 * @param {{analysis: () => any, caretLine: () => number}} api
 * @returns {{update: (an: any, line: number) => void}}
 */
export function setupLiveView(overlay, { analysis, caretLine }) {
  const bar = overlay.querySelector('.cne-sn-bar');
  const win = overlay.querySelector('.cnc-editor-window');
  let cv = null;                  // canvas.js – načte se až tady (v testech bez DOM plátna)
  let data = null;                // { an, line } pro kreslení
  let compact = storageLoad(KEY_COMPACT) === true;
  let barsOpen = storageLoad(KEY_BARS) === true;

  const mk = (cls, act, title) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cne-sn-tog ' + cls;
    b.dataset.liveAct = act;
    b.title = title;
    bar?.insertBefore(b, bar.querySelector('.cne-sn-close'));
    return b;
  };
  // Číselník 7 8 9 / 4 5 6 / 1 2 3 / − 0 . vpravo vedle kódu (jen telefon na výšku, CSS).
  // data-ins → stejné vkládání jako klávesy dole (číslice bez automatické mezery).
  const main = overlay.querySelector('.cne-main');
  if (main) {
    const pad = document.createElement('div');
    pad.className = 'cne-side-numpad';
    pad.innerHTML = '789456123-0.'.split('').map(c =>
      `<button type="button" class="cne-np-key" data-ins="${c}" title="${c === '-' ? 'Mínus' : c === '.' ? 'Desetinná tečka' : 'Číslice ' + c}">${c === '-' ? '−' : c}</button>`).join('');
    pad.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });   // fokus zůstane v kódu
    main.appendChild(pad);
  }
  const barsBtn = mk('cne-sn-bars', 'bars', 'Rozbalit / sbalit lišty (panely ☰, hledání, kalkulačka, Údaje a nápověda)');
  const sizeBtn = mk('cne-sn-size', 'size', 'Přepnout editor: přes celý displej ↔ zmenšený, nad ním plátno s tím, co kreslíš');

  function render(c) {
    if (!compact || !data || !cv) return;
    const { an, line } = data;
    const kar = !!an.opts?.karusel;
    const css = getComputedStyle(document.documentElement);
    const col = (n, d) => css.getPropertyValue(n).trim() || d;
    const path = (mv) => {
      const pts = movePoints(mv, kar);
      c.beginPath();
      pts.forEach((p, i) => { const [sx, sy] = cv.worldToScreen(p.x, p.y); i ? c.lineTo(sx, sy) : c.moveTo(sx, sy); });
      c.stroke();
    };
    c.save();
    c.lineJoin = 'round'; c.lineCap = 'round';
    for (const mv of an.moves) {
      if (mv.g === 0) { c.strokeStyle = col('--ctp-overlay2', '#999'); c.lineWidth = 1; c.setLineDash([4, 4]); }
      else { c.strokeStyle = mv.stock ? col('--ctp-peach', '#fab387') : col('--ctp-sky', '#89dceb'); c.lineWidth = 2; c.setLineDash(mv.stock ? [6, 4] : []); }
      path(mv);
    }
    c.setLineDash([]);
    const cur = an.moves.find(m => m.line === line);
    if (cur) {
      c.strokeStyle = col('--ctp-yellow', '#f9e2af'); c.lineWidth = 4;
      path(cur);
      const e = W(cur.to, kar);
      const [sx, sy] = cv.worldToScreen(e.x, e.y);
      c.fillStyle = c.strokeStyle;
      c.beginPath(); c.arc(sx, sy, 4.5, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }

  /** Po zmenšení okna posune kód tak, aby byl řádek s kurzorem vidět. */
  function showCaret() {
    const ta = overlay.querySelector('.cne-textarea');
    if (!ta) return;
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 18;
    ta.scrollTop = Math.max(0, (caretLine() + 0.5) * lh - ta.clientHeight / 2);
    ta.dispatchEvent(new Event('scroll'));   // podsvícení (backdrop) jede se scrollem textarea
  }

  /** Zarámuje náhled do plochy plátna nad zmenšeným editorem. */
  function fit() {
    if (!cv) return;
    const b = movesBounds(analysis());
    if (!b) return;
    const r = win?.getBoundingClientRect();
    const above = r && r.top > window.innerHeight * 0.25 ? win : null;
    cv.fitViewToWorldBounds(b, { above, minExtent: 10 });
  }

  function apply(refit) {
    overlay.classList.toggle('cne-compact', compact);
    overlay.classList.toggle('cne-bars-open', barsOpen);
    barsBtn.textContent = barsOpen ? '▴' : '▾';
    barsBtn.classList.toggle('on', barsOpen);
    sizeBtn.textContent = compact ? '⇱' : '⇲';
    sizeBtn.classList.toggle('on', compact);
    sizeBtn.title = compact
      ? 'Zvětšit editor přes celý displej'
      : 'Zmenšit editor – nad ním bude plátno s tím, co kreslíš';
    bridge.renderCncLive = compact ? render : null;
    if (compact) data = { an: analysis(), line: caretLine() };
    // Rozměr okna se změnil až po přepočtu layoutu → rámovat v dalším snímku.
    requestAnimationFrame(() => {
      if (compact && refit) fit();
      if (compact) showCaret();
      bridge.renderAll?.();
      window.dispatchEvent(new Event('resize'));   // textarea / backdrop editoru přepočítá výšku
    });
  }

  bar?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-live-act]');
    if (!b) return;
    e.stopPropagation();
    if (b.dataset.liveAct === 'bars') { barsOpen = !barsOpen; storageSave(KEY_BARS, barsOpen); apply(compact); }
    else { compact = !compact; storageSave(KEY_COMPACT, compact); apply(compact); }
  });

  import('../canvas.js').then(m => { cv = m; apply(compact); }).catch(() => apply(false));
  apply(false);

  onOverlayRemoved(overlay, () => {
    if (bridge.renderCncLive === render) bridge.renderCncLive = null;
    data = null;
    bridge.renderAll?.();
  });

  return {
    update(an, line) {
      if (!compact) return;
      data = { an, line };
      bridge.renderAll?.();
    },
  };
}
