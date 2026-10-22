// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Rozmístění děr: pole „Hloubka díry" pro ◎ Do čela    ║
// ╚══════════════════════════════════════════════════════════════╝
// Skrz (+ přesah, prázdný = hrot 0,3·Ø + 1 mm; materiálem jen hotové kontury,
// nebo i polotovaru — vrtá se před soustružením) / Do hloubky (od roviny čela)
// / Do Z (absolutní Z konce díry). Hodnotu nese každá díra (`holeDepth`),
// na číslo ji převádí faceView/faceDepth.js až při 📥 Z CAD. Sdílí ho záložky
// Kružnice (boltCircle.js), Řada a Mřížka (holePattern.js) — prefix `p`
// odliší pole (data-id) jednotlivých záložek.
import { numVal as val, numField, selectField } from './calcKit.js';
import { METRIC_THREADS, threadByName } from './isoTaps.js';

// ZÁVIT (uživatel 22. 10. 2026): výběr metrického závitu u díry. Ø díry se
// přepne na Ø PŘEDVRTÁNÍ, díra nese `{ name, pitch }` a CAM ji po vyvrtání
// vyřízne závitníkem (cam/live role 'tap'). Sdílí ho všechna okna děr.
/** HTML výběru závitu (prefix `p` jako u hloubky). */
export function threadFieldHtml(p) {
  return selectField(p + 'thread', 'Závit', [['', 'bez závitu'], ...METRIC_THREADS.map(t => [t.name, `${t.name} × ${t.pitch} (předvrtat ⌀${String(t.drill).replace('.', ',')})`])]);
}

/** Volba závitu → Ø díry = předvrtání (pole `dInput`, i s událostí input). */
export function wireThreadField(root, p, dInput) {
  const sel = root.querySelector('[data-id="' + p + 'thread"]');
  if (!sel || !dInput) return;
  sel.addEventListener('change', () => {
    const t = threadByName(sel.value);
    if (!t) return;
    dInput.value = String(t.drill).replace('.', ',');
    dInput.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Zvolený závit → { name, pitch } nebo null. */
export function readThread(root, p) {
  const sel = root.querySelector('[data-id="' + p + 'thread"]');
  const t = sel && threadByName(sel.value);
  return t ? { name: t.name, pitch: t.pitch } : null;
}

const MODES = [['through', 'Skrz'], ['depth', 'Do hloubky'], ['z', 'Do Z (konec díry)']];
const MATS = [['part', 'Hotová kontura'], ['stock', 'I polotovar']];
const VAL = {
  through: ['Přesah za materiál', '0,3·Ø + 1'],
  depth: ['Hloubka od čela', 'hloubka'],
  z: ['Konec díry Z', 'Z'],
};

/** HTML: výběr druhu + jedno číselné pole (popisek podle druhu) + u Skrz materiál. */
export function depthFieldsHtml(p) {
  return selectField(p + 'depthMode', 'Hloubka díry', MODES) +
    numField(p + 'depthVal', VAL.through[0], 'mm', VAL.through[1]) +
    '<span data-depth-mat>' + selectField(p + 'depthMat', 'Skrz materiálem', MATS) + '</span>' +
    threadFieldHtml(p);
}

const els = (root, p) => ({
  sel: root.querySelector('[data-id="' + p + 'depthMode"]'),
  inp: root.querySelector('[data-id="' + p + 'depthVal"]'),
  mat: root.querySelector('[data-id="' + p + 'depthMat"]'),
});

/** Popisek a nápověda pole podle zvoleného druhu. */
export function wireDepthFields(root, p) {
  const { sel, inp, mat } = els(root, p);
  const upd = () => {
    const box = mat && mat.closest('[data-depth-mat]');
    if (box) box.style.display = sel.value === 'through' ? '' : 'none';
    const [label, ph] = VAL[sel.value] || VAL.through;
    const span = inp.closest('label') && inp.closest('label').querySelector('span');
    if (span) span.innerHTML = label + ' <small>mm</small>';
    inp.placeholder = ph;
    inp.title = sel.value === 'through' ? 'Prázdné = hrot vrtáku 0,3·Ø + 1 mm za materiálem'
      : sel.value === 'z' ? 'Z konce díry v ose profilu (čelo zprava vrtá k −Z)' : 'Hloubka od roviny čela';
  };
  sel.addEventListener('change', upd);
  upd();
  // Závit: Ø díry (pole „<prefix>d", jinak „d") = předvrtání.
  wireThreadField(root, p, root.querySelector('[data-id="' + p + 'd"]') || root.querySelector('[data-id="d"]'));
}

/**
 * Zadaná hloubka → { spec: { mode, value } } nebo { error } (text pro hlášku).
 * Skrz bez přesahu = value null (dopočte se z Ø díry).
 */
export function readDepth(root, p) {
  const { sel, inp, mat } = els(root, p);
  const mode = sel.value, v = val(inp);
  const t = readThread(root, p), th = t ? { thread: t } : {};
  if (Number.isNaN(v)) return { error: 'Neplatná hodnota u hloubky díry' };
  if (mode === 'through') {
    if (v !== null && v < 0) return { error: 'Přesah za materiál musí být ≥ 0' };
    return { spec: { mode, value: v, ...(mat && mat.value === 'stock' ? { stock: true } : {}) }, ...th };
  }
  if (mode === 'depth') return v !== null && v > 0 ? { spec: { mode, value: v }, ...th } : { error: 'Zadej hloubku díry (> 0)' };
  if (mode === 'z') return v !== null ? { spec: { mode, value: v }, ...th } : { error: 'Zadej Z konce díry' };
  return { error: 'Zvol hloubku díry' };
}
