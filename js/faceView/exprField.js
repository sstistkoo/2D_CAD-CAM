// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – číselné políčko s výpočtem a tlačítkem ✔             ║
// ╚══════════════════════════════════════════════════════════════╝
// Lišta čela (Z, faceBar.js) a natočení pohledu (C, faceRotate.js): do
// políčka jde psát i výpočet (90+60, 68,2-5, 2*sin(30)… — safeEvalMath).
// Potvrzení: ✔ vedle políčka (ukáže se, až se v políčku píše), Enter nebo
// odchod z políčka; Esc vrátí původní hodnotu. Po potvrzení je v políčku
// VÝSLEDEK, ne výraz (uživatel 22. 10. 2026: „90+60" tam zůstávalo a nebylo
// poznat, jestli se to použilo).
import { showToast } from '../state.js';
import { safeEvalMath } from '../utils.js';

/**
 * @param input políčko (type=text)
 * @param ok tlačítko ✔ (skryté, dokud se v políčku nepíše)
 * @param apply(v) použít vypočtené číslo
 * @param current() hodnota k zobrazení po potvrzení / Esc
 * @param onToggle() ✔ se ukázalo / skrylo (přeumístit lištu)
 */
export function wireExprField(input, ok, { apply, current, onToggle = () => {} }) {
  let dirty = false;
  const setDirty = on => {
    if (dirty === on) return;
    dirty = on;
    ok.style.display = on ? '' : 'none';
    onToggle();
  };
  const show = () => { input.value = String(current()); };
  const commit = () => {
    if (!dirty) return;
    setDirty(false);
    const v = safeEvalMath(input.value);
    if (!Number.isFinite(v)) { showToast('Neplatné číslo nebo výpočet'); show(); return; }
    apply(v);
    show();
  };
  ok.style.display = 'none';
  input.addEventListener('input', () => setDirty(true));
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); input.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); setDirty(false); show(); input.blur(); }
  });
  input.addEventListener('blur', commit);
  // Stisk ✔ nebere políčku fokus (jinak by potvrdil už blur a klik naprázdno).
  ok.addEventListener('pointerdown', e => e.preventDefault());
  ok.addEventListener('click', () => { commit(); input.blur(); });
}
