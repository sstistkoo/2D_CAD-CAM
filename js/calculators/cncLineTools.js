/**
 * Akce s celými řádky v editoru G-kódu (uživatel 13. 11. 2026): kopie řádku pod
 * něj, posun nahoru / dolů, smazání, označení celých řádků. Platí pro řádek
 * s kurzorem, nebo pro všechny řádky, kterých se týká výběr.
 * Ovládání: tlačítko ≡ ve spodní liště otevře proužek akcí (data-line-act),
 * na počítači Alt+↑ / Alt+↓ (posun) a Alt+Shift+↓ (kopie).
 * Čisté funkce vrací { value, s, e } = nový text a výběr.
 */

/** Rozsah celých řádků [ls, le) pokrytých výběrem s..e (le = index '\n' nebo konec). */
export function lineBlock(v, s, e = s) {
  if (e > s && v[e - 1] === '\n') e--;                 // výběr končí na začátku řádku → ten už ne
  const ls = v.lastIndexOf('\n', s - 1) + 1;
  let le = v.indexOf('\n', e); if (le < 0) le = v.length;
  return { ls, le };
}

/** Posun řádků o jeden nahoru (dir −1) / dolů (+1); null = už jsou na kraji. */
export function moveLines(v, s, e, dir) {
  const { ls, le } = lineBlock(v, s, e);
  const block = v.slice(ls, le);
  if (dir < 0) {
    if (ls === 0) return null;
    const pls = v.lastIndexOf('\n', ls - 2) + 1;
    const prev = v.slice(pls, ls - 1);
    const d = prev.length + 1;
    return { value: v.slice(0, pls) + block + '\n' + prev + v.slice(le), s: s - d, e: e - d };
  }
  if (le >= v.length) return null;
  let nle = v.indexOf('\n', le + 1); if (nle < 0) nle = v.length;
  const next = v.slice(le + 1, nle);
  const d = next.length + 1;
  return { value: v.slice(0, ls) + next + '\n' + block + v.slice(nle), s: s + d, e: e + d };
}

/** Kopie řádků hned pod ně; kurzor / výběr přejde do kopie. */
export function duplicateLines(v, s, e) {
  const { ls, le } = lineBlock(v, s, e);
  const block = v.slice(ls, le);
  const d = block.length + 1;
  return { value: v.slice(0, le) + '\n' + block + v.slice(le), s: s + d, e: e + d };
}

/** Smazání celých řádků i se zalomením; kurzor na začátek řádku, který přišel na jejich místo. */
export function deleteLines(v, s, e) {
  const { ls, le } = lineBlock(v, s, e);
  if (le < v.length) return { value: v.slice(0, ls) + v.slice(le + 1), s: ls, e: ls };
  const a = Math.max(0, ls - 1);
  return { value: v.slice(0, a) + v.slice(le), s: a ? v.lastIndexOf('\n', a - 1) + 1 : 0, e: a ? v.lastIndexOf('\n', a - 1) + 1 : 0 };
}

/** Označí celé řádky pokryté výběrem (bez koncového zalomení). */
export function selectLines(v, s, e) {
  const { ls, le } = lineBlock(v, s, e);
  return { value: v, s: ls, e: le };
}

const OPS = {
  up: [(v, s, e) => moveLines(v, s, e, -1), 'Řádek nahoru'],
  down: [(v, s, e) => moveLines(v, s, e, 1), 'Řádek dolů'],
  dup: [duplicateLines, 'Kopie řádku'],
  del: [deleteLines, 'Smazat řádek'],
  sel: [selectLines, null],
};

/**
 * @param {HTMLElement} root
 * @param {HTMLTextAreaElement} editor
 * @param {{snapshot?: (label: string, detail?: string) => void, after?: () => void,
 *   reveal?: (ta: HTMLTextAreaElement) => void, toggleSelect?: () => boolean}} hooks
 */
export function wireLineTools(root, editor, { snapshot, after, reveal, toggleSelect } = {}) {
  const bar = root.querySelector('.cne-linebar');
  const barBtn = root.querySelector('[data-line-act="bar"]');
  function run(op) {
    const [fn, label] = OPS[op];
    const r = fn(editor.value, editor.selectionStart ?? 0, editor.selectionEnd ?? 0);
    if (!r) return;
    const { scrollTop, scrollLeft } = editor;
    editor.readOnly = false;
    if (label && r.value !== editor.value) { snapshot?.(label); editor.value = r.value; }
    editor.setSelectionRange(r.s, r.e);
    editor.scrollTop = scrollTop; editor.scrollLeft = scrollLeft;
    editor.focus({ preventScroll: true });
    reveal?.(editor);
    if (label) after?.(); else editor.dispatchEvent(new Event('select'));
  }
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-line-act]');
    if (!b) return;
    const act = b.dataset.lineAct;
    if (act === 'bar') {
      const open = bar?.hidden;
      if (bar) bar.hidden = !open;
      barBtn?.classList.toggle('on', !!open);
    } else if (act === 'selmode') {
      const on = toggleSelect?.();
      b.classList.toggle('on', !!on);
    } else if (OPS[act]) run(act);
  });
  editor.addEventListener('keydown', e => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowUp' && !e.shiftKey) { e.preventDefault(); run('up'); }
    else if (e.key === 'ArrowDown' && !e.shiftKey) { e.preventDefault(); run('down'); }
    else if (e.key === 'ArrowDown' && e.shiftKey) { e.preventDefault(); run('dup'); }
  });
}
