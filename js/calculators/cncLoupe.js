// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – CNC Editor: lupa pro umístění kurzoru prstem         ║
// ║  Podržení prstu na kódu → nad prstem okénko se zvětšeným      ║
// ║  textem a kurzorem; tahem se kurzor posouvá, puštěním zůstane ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Textarea i podbarvení (backdrop) mají neproporcionální písmo a pevnou výšku
// řádku, takže pozice v textu se z bodu dotyku spočte přímo (řádek × sloupec),
// bez zjišťování přes DOM. Zvětšený obsah = klon podbarveného textu.

const HOLD_MS = 320;     // jak dlouho držet, než se lupa ukáže
const MOVE_TOL = 9;      // posun prstu (px), který ještě není rolování
const ZOOM = 1.8;
const LW = 230, LH = 74; // rozměr lupy (px)

/**
 * Index znaku v textu podle sloupce na obrazovce (tabulátor = tabSize sloupců).
 * @param {string} text
 * @param {number} line  číslo řádku (od 0)
 * @param {number} col   vizuální sloupec (může být desetinný – zaokrouhlí se na nejbližší hranici znaků)
 * @param {number} [tabSize]
 * @returns {{index: number, line: number, vcol: number}}  vcol = vizuální sloupec vybrané pozice
 */
export function indexAtLineCol(text, line, col, tabSize = 4) {
  const lines = text.split('\n');
  const ln = Math.max(0, Math.min(lines.length - 1, line));
  let index = 0;
  for (let i = 0; i < ln; i++) index += lines[i].length + 1;
  const s = lines[ln];
  let v = 0, k = 0;
  for (; k < s.length; k++) {
    const w = s[k] === '\t' ? tabSize - (v % tabSize) : 1;
    if (col < v + w / 2) break;
    v += w;
  }
  return { index: index + k, line: ln, vcol: v };
}

/**
 * @param {HTMLElement} overlay  overlay editoru
 * @param {{onCaret?: () => void}} [opts]  onCaret = po umístění kurzoru (údaje, náhled…)
 */
export function setupLoupe(overlay, { onCaret } = {}) {
  const ta = overlay.querySelector('.cne-textarea');
  const backdrop = overlay.querySelector('.cne-backdrop');
  if (!ta || !backdrop) return;

  let timer = null, start = null, active = false, pos = null;
  let loupe = null, inner = null, caretEl = null;
  let m = null;   // metrika písma: { lh, cw, pl, pt, tab }

  function metrics() {
    const cs = getComputedStyle(ta);
    const c = document.createElement('canvas').getContext('2d');
    c.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    return {
      cs,
      lh: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4,
      cw: c.measureText('0000000000').width / 10 || parseFloat(cs.fontSize) * 0.6,
      pl: parseFloat(cs.paddingLeft) || 0,
      pt: parseFloat(cs.paddingTop) || 0,
      tab: parseInt(cs.tabSize, 10) || 4,
    };
  }

  /** Pozice v textu pod bodem obrazovky (x, y). */
  function hit(x, y) {
    const r = ta.getBoundingClientRect();
    const cx = x - r.left + ta.scrollLeft - m.pl;
    const cy = y - r.top + ta.scrollTop - m.pt;
    return indexAtLineCol(ta.value, Math.floor(cy / m.lh), cx / m.cw, m.tab);
  }

  function open() {
    m = metrics();
    loupe = document.createElement('div');
    loupe.className = 'cne-loupe';
    loupe.style.width = LW + 'px';
    loupe.style.height = LH + 'px';
    inner = document.createElement('div');
    inner.className = 'cne-loupe-inner';
    const cs = m.cs;
    Object.assign(inner.style, {
      font: `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} / ${cs.lineHeight} ${cs.fontFamily}`,
      padding: `${cs.paddingTop} ${cs.paddingRight} 0 ${cs.paddingLeft}`,
      tabSize: String(m.tab),
      transform: `scale(${ZOOM})`,
    });
    inner.innerHTML = backdrop.innerHTML;
    caretEl = document.createElement('div');
    caretEl.className = 'cne-loupe-caret';
    caretEl.style.height = m.lh + 'px';
    inner.appendChild(caretEl);
    loupe.appendChild(inner);
    document.body.appendChild(loupe);
    active = true;
    navigator.vibrate?.(12);
  }

  function stopTimer() { clearTimeout(timer); timer = null; }

  function close() {
    active = false;
    loupe?.remove();
    loupe = inner = caretEl = null;
  }

  function show(x, y) {
    pos = hit(x, y);
    // Kurzor v souřadnicích obsahu (před zvětšením)
    const kx = m.pl + pos.vcol * m.cw, ky = m.pt + pos.line * m.lh;
    caretEl.style.left = kx + 'px';
    caretEl.style.top = ky + 'px';
    // Lupa nad prstem (u horního okraje pod ním), vodorovně v displeji
    const lx = Math.max(4, Math.min(window.innerWidth - LW - 4, x - LW / 2));
    let ly = y - LH - 56;
    if (ly < 4) ly = y + 40;
    loupe.style.left = lx + 'px';
    loupe.style.top = ly + 'px';
    // Obsah posunout tak, aby kurzor byl uprostřed lupy
    inner.style.left = (LW / 2 - kx * ZOOM) + 'px';
    inner.style.top = (LH / 2 - (ky + m.lh / 2) * ZOOM) + 'px';
  }

  function placeCaret() {
    if (!pos) return;
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(pos.index, pos.index);
    if (onCaret) onCaret(); else ta.dispatchEvent(new Event('keyup'));   // editor přepočte údaje / náhled
  }

  ta.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { stopTimer(); return; }
    const t = e.touches[0];
    start = { x: t.clientX, y: t.clientY };
    stopTimer();
    timer = setTimeout(() => { timer = null; open(); show(start.x, start.y); }, HOLD_MS);
  }, { passive: true });

  ta.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (!active) {
      if (start && Math.hypot(t.clientX - start.x, t.clientY - start.y) > MOVE_TOL) stopTimer();   // rolování
      return;
    }
    e.preventDefault();               // s lupou se nerolije – prst vede kurzor
    show(t.clientX, t.clientY);
  }, { passive: false });

  const end = (e) => {
    stopTimer();
    if (!active) return;
    e.preventDefault();               // žádný klik / výběr slova po puštění
    close();
    placeCaret();
  };
  ta.addEventListener('touchend', end, { passive: false });
  ta.addEventListener('touchcancel', () => { stopTimer(); close(); });
  // Podržení na Androidu jinak otevře kontextovou nabídku / výběr slova
  ta.addEventListener('contextmenu', (e) => { if (active || timer) e.preventDefault(); });

  new MutationObserver((_, obs) => {
    if (!document.body.contains(overlay)) { stopTimer(); close(); obs.disconnect(); }
  }).observe(document.body, { childList: true });
}
