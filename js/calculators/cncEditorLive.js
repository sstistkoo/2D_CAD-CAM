// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – CNC Editor z Kalkulaček: zmenšený editor + plátno    ║
// ║  Dvě tlačítka v oranžové liště vedle ✕:                       ║
// ║   ▾  rozbalí / sbalí lišty (☰ panely, 🔍, 🔢… a Údaje)       ║
// ║   ⇕  přepne editor přes celý displej ↔ zmenšený dole, nad     ║
// ║      ním je vidět CAD plátno s živým náhledem psaného kódu    ║
// ║   ⤢  (jen zmenšený) zarámuje náhled nad editor; samo se       ║
// ║      zarámuje i po každé změně nakreslené geometrie            ║
// ║  Klepnutí na čáru náhledu na plátně → kurzor na její řádek    ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Náhled se kreslí na hlavní plátno přes `bridge.renderCncLive` (volá ho
// renderAll v render.js) – výkres se NEMĚNÍ, přepíše se až po zavření
// editoru / 🔄 jako dřív. Geometrie = tentýž rozbor (analyzeDrawCode) jako
// malý náhled v editoru, řádek s kurzorem žlutě.

import { bridge } from '../bridge.js';
import { onOverlayRemoved } from '../dialogFactory.js';
import { storageLoad, storageSave } from './gcodeEditorShared.js';
import { W, movePoints, movesBounds, segDist } from './cncDrawPreview.js';
import { setupLoupe } from './cncLoupe.js';

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
  setupLoupe(overlay);   // podržení prstu na kódu → lupa pro přesné umístění kurzoru
  const barsBtn = mk('cne-sn-bars', 'bars', 'Rozbalit / sbalit lišty (panely ☰, hledání, kalkulačka, Údaje a nápověda)');
  const sizeBtn = mk('cne-sn-size', 'size', 'Přepnout editor: přes celý displej ↔ zmenšený, nad ním plátno s tím, co kreslíš');
  const fitBtn = mk('cne-sn-fit', 'fit', 'Zarámovat – celý náhled se vejde do plátna nad editorem');
  fitBtn.textContent = '⤢';

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
  let lastBounds = '';
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
    if (b.dataset.liveAct === 'fit') { fit(); bridge.renderAll?.(); return; }
    if (b.dataset.liveAct === 'bars') { barsOpen = !barsOpen; storageSave(KEY_BARS, barsOpen); apply(compact); }
    else { compact = !compact; storageSave(KEY_COMPACT, compact); apply(compact); }
  });

  /** Řádek pohybu, jehož čára náhledu leží do `tol` px od bodu plátna (sx, sy), nebo -1. */
  function lineAt(sx, sy, tol = 14) {
    const an = data?.an;
    if (!an || !cv) return -1;
    const kar = !!an.opts?.karusel;
    let best = -1, bestD = tol;
    for (const mv of an.moves) {
      const pts = movePoints(mv, kar).map(p => cv.worldToScreen(p.x, p.y));
      for (let i = 1; i < pts.length; i++) {
        const d = segDist(sx, sy, pts[i - 1], pts[i]);
        // G1/G2/G3 má přednost před G0 se stejnou vzdáleností (G0 je jen nájezd)
        if (d < bestD || (d === bestD && mv.g !== 0)) { bestD = d; best = mv.line; }
      }
    }
    return best;
  }

  /** Kurzor na konec kódu řádku `ln` (před poznámku za středníkem). */
  function caretToLine(ln) {
    const ta = overlay.querySelector('.cne-textarea');
    if (!ta) return;
    const lines = ta.value.split('\n');
    let idx = 0;
    for (let i = 0; i < ln && i < lines.length; i++) idx += lines[i].length + 1;
    const text = lines[ln] || '';
    const semi = text.indexOf(';');
    idx += semi >= 0 ? text.slice(0, semi).replace(/\s+$/, '').length : text.length;
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(idx, idx);
    showCaret();
    ta.dispatchEvent(new Event('keyup'));   // editor přepočte údaje i žlutou čáru
  }

  // Klepnutí (ne tah) na plátno ve zmenšeném režimu: čára náhledu → její řádek v kódu.
  let tap = null;
  const onDown = (e) => { tap = compact ? { x: e.clientX, y: e.clientY, t: Date.now() } : null; };
  const onUp = (e) => {
    if (!tap || !compact || !cv) return;
    const moved = Math.hypot(e.clientX - tap.x, e.clientY - tap.y), dt = Date.now() - tap.t;
    tap = null;
    if (moved > 10 || dt > 500) return;
    const r = cv.drawCanvas.getBoundingClientRect();
    const ln = lineAt(e.clientX - r.left, e.clientY - r.top);
    if (ln >= 0) caretToLine(ln);
  };

  import('../canvas.js').then(m => {
    cv = m;
    cv.drawCanvas?.addEventListener('pointerdown', onDown);
    cv.drawCanvas?.addEventListener('pointerup', onUp);
    apply(compact);
  }).catch(() => apply(false));
  apply(false);

  onOverlayRemoved(overlay, () => {
    if (bridge.renderCncLive === render) bridge.renderCncLive = null;
    cv?.drawCanvas?.removeEventListener('pointerdown', onDown);
    cv?.drawCanvas?.removeEventListener('pointerup', onUp);
    data = null;
    bridge.renderAll?.();
  });

  return {
    update(an, line) {
      if (!compact) return;
      data = { an, line };
      // Změnila se nakreslená geometrie (ne jen kurzor) → náhled znovu zarámovat nad editor.
      const b = movesBounds(an);
      const key = b ? [b.minX, b.maxX, b.minY, b.maxY].map(v => v.toFixed(3)).join() : '';
      if (key && key !== lastBounds) { lastBounds = key; fit(); }
      bridge.renderAll?.();
    },
  };
}
