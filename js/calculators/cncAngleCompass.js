// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – CNC Editor: ovladač směrů ✛ u polárního úhlu         ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Stejný vzhled jako rychlá volba úhlu v číselném zadání (třídy compass-*),
// jen úhel je ve smyslu dialogu „Úsečka úhlem": od osy +Z, proti směru hodin
// (na karuselu od vodorovné osy obrazovky →, viz polarInputToDialog).
// Šipka ukazuje směr NA OBRAZOVCE, a ten se k osám stroje váže podle typu
// stroje (soustruh: Z vodorovně, X svisle; karusel: obráceně) a zrcadlení os
// (flipX obrací svislou osu, flipZ vodorovnou – viz vSign/hSign v canvas.js).
// Proto se úhel každé šipky počítá, ne že by byl napevno.

/** [grid-area, znak, směr vpravo (+1) / vlevo (−1), směr nahoru (+1) / dolů (−1)] */
const ARROWS = [
  ['tl', '↖', -1, 1], ['tc', '↑', 0, 1], ['tr', '↗', 1, 1],
  ['ml', '←', -1, 0], ['mr', '→', 1, 0],
  ['bl', '↙', -1, -1], ['bc', '↓', 0, -1], ['br', '↘', 1, -1],
];

/**
 * Směr na obrazovce → polární úhel dialogu (stupně od +Z proti směru hodin, 0 až < 360).
 * @param {number} ex vpravo +, vlevo −
 * @param {number} ey nahoru +, dolů −
 * @param {{karusel?: boolean, flipX?: boolean, flipZ?: boolean}} view
 */
export function screenDirToAngle(ex, ey, { karusel = false, flipX = false, flipZ = false } = {}) {
  const wx = flipZ ? -ex : ex;          // vodorovná osa světa
  const wy = flipX ? -ey : ey;          // svislá osa světa (flipX = kladná dolů)
  const dz = karusel ? wy : wx;
  const dx = karusel ? wx : wy;
  let a = Math.round(Math.atan2(dx, dz) * 180 / Math.PI * 1e6) / 1e6;
  if (a < 0) a += 360;
  return a >= 360 ? 0 : a;
}

const norm360 = (a) => { a = Math.round(a * 1e6) / 1e6 % 360; if (a < 0) a += 360; return a >= 360 ? 0 : a; };

/** Pohled pro převody úhlů ze stavu aplikace. */
export function angleView(st) {
  return { karusel: st.machineType === 'karusel', flipX: !!st.flipX, flipZ: !!st.flipZ };
}

/**
 * Úhel dialogu (od +Z) → úhel na obrazovce (od vodorovné osy →, proti směru hodin, 0 až < 360).
 * @param {number} a
 * @param {{karusel?: boolean, flipX?: boolean, flipZ?: boolean}} view
 */
export function dialogToScreenAngle(a, { karusel = false, flipX = false, flipZ = false } = {}) {
  const r = a * Math.PI / 180, dz = Math.cos(r), dx = Math.sin(r);
  const wx = karusel ? dx : dz, wy = karusel ? dz : dx;
  const ex = flipZ ? -wx : wx, ey = flipX ? -wy : wy;
  return norm360(Math.atan2(ey, ex) * 180 / Math.PI);
}

/** Úhel na obrazovce (od →, proti směru hodin) → úhel dialogu (od +Z). */
export function screenAngleToDialog(s, view) {
  const r = s * Math.PI / 180;
  return screenDirToAngle(Math.cos(r), Math.sin(r), view);
}

/**
 * Polární úhel tak, jak ho zadává uživatel: na karuselu od vodorovné osy obrazovky
 * (→ = 0°, nahoru 90°; uživatel 9. 11. 2026), jinak od osy +Z.
 */
export function polarInputToDialog(A, view) { return view.karusel ? screenAngleToDialog(A, view) : A; }

/** Odklon od předchozího směru podle obrazovky: ↺ vlevo (+1) / ↻ vpravo (−1) platí i na karuselu a se zrcadlením. */
export function relToDialog(prevDir, side, A, view) {
  return screenAngleToDialog(dialogToScreenAngle(prevDir, view) + side * A, view);
}

/** Popis směru pro nápovědu dialogu („110° od →" na karuselu, jinak „20° od +Z"). */
export function dirLabel(a, view, f = String) {
  return view.karusel ? `${f(dialogToScreenAngle(a, view))}° od →` : `${f(a)}° od +Z`;
}

/** Popisek polárního úhlu v dialogu. */
export function polarHint(view) {
  return view.karusel ? '(od vodorovné osy →, proti směru hodin; 90 = nahoru)' : '(od osy +Z, proti směru hodin; 180 = směr −Z)';
}

/**
 * Napojí tlačítko ✛ na pole úhlu. Vyskakovací mřížka se vloží do `host`
 * (podklad dialogu, `position: absolute`) a umístí pod tlačítko.
 * @param {HTMLElement|null} trigger tlačítko ✛
 * @param {HTMLInputElement|null} input pole úhlu
 * @param {HTMLElement|null} host podklad dialogu
 * @param {() => {karusel: boolean, flipX: boolean, flipZ: boolean}} getView
 */
export function wireAngleCompass(trigger, input, host, getView) {
  if (!trigger || !input || !host) return;
  let popup = null;
  const close = () => { if (popup) { popup.remove(); popup = null; } };

  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();                // jinak by ho klik na podklad hned zavřel
    if (popup) { close(); return; }
    const view = getView();
    popup = document.createElement('div');
    popup.className = 'angle-compass-popup cne-ang-compass';
    popup.innerHTML = `<div class="compass-grid">${ARROWS.map(([area, ch, ex, ey]) => {
      const a = view.karusel ? norm360(Math.atan2(ey, ex) * 180 / Math.PI) : screenDirToAngle(ex, ey, view);   // karusel: úhel od →
      return `<button type="button" class="compass-arrow" data-ang="${a}" style="grid-area:${area}" title="${a}°">${ch}</button>`;
    }).join('')}<button type="button" class="compass-close" style="grid-area:mc" title="Zavřít">✕</button></div>`;
    host.appendChild(popup);
    // Pod tlačítko, zarovnat k jeho pravé hraně; když se dolů nevejde, nad něj.
    const hr = host.getBoundingClientRect();
    const tr = trigger.getBoundingClientRect();
    const pw = popup.offsetWidth, ph = popup.offsetHeight;
    let top = tr.bottom - hr.top + 4;
    if (top + ph > hr.height - 4) top = tr.top - hr.top - ph - 4;
    popup.style.left = `${Math.max(4, Math.min(tr.right - hr.left - pw, hr.width - pw - 4))}px`;
    popup.style.top = `${Math.max(4, top)}px`;
  });

  // Volba šipky, ✕, nebo jakýkoli jiný klik v dialogu (OK, Zrušit, přepínače) mřížku zavře.
  host.addEventListener('click', (e) => {
    if (!popup) return;
    const b = e.target.closest('.compass-arrow');
    if (b && popup.contains(b)) {
      input.value = b.dataset.ang;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    close();
  });
  host.addEventListener('keydown', close);   // Enter (potvrzení) / Esc
}
