// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Dialog pro pár zabírajících ozubených kol         ║
// ╚══════════════════════════════════════════════════════════════╝

import { makeOverlay } from '../dialogFactory.js';

/**
 * Pure validace parametrů gear pair.
 * Vrací error pokud:
 *   - modul ≤ 0,
 *   - jeden z počtů zubů < 6,
 *   - korekce mimo rozumný rozsah.
 *
 * @param {{m:number, z1:number, z2:number, alpha:number, x1?:number, x2?:number,
 *          orientation?:number, addRefCircles?:boolean, addAxisLine?:boolean,
 *          steps?:number}} raw
 * @returns {{error:string}|{params:object}}
 */
export function validateGearPairParams(raw) {
  const m = Number(raw?.m);
  const z1 = parseInt(raw?.z1, 10);
  const z2 = parseInt(raw?.z2, 10);
  const alpha = Number(raw?.alpha) || 20;
  const x1 = Number(raw?.x1) || 0;
  const x2 = Number(raw?.x2) || 0;
  const orientation = Number(raw?.orientation) || 0;
  const steps = parseInt(raw?.steps, 10) || 16;

  if (!Number.isFinite(m) || m <= 0) return { error: 'Modul musí být > 0' };
  if (!Number.isFinite(z1) || z1 < 6) return { error: 'Počet zubů kola 1 musí být ≥ 6' };
  if (!Number.isFinite(z2) || z2 < 6) return { error: 'Počet zubů kola 2 musí být ≥ 6' };
  if (Math.abs(x1) > 1) return { error: 'Korekce x1 mimo rozsah −1..+1' };
  if (Math.abs(x2) > 1) return { error: 'Korekce x2 mimo rozsah −1..+1' };

  return {
    params: {
      m, z1, z2, alpha, x1, x2,
      orientation, steps,
      addRefCircles: !!raw?.addRefCircles,
      addAxisLine: !!raw?.addAxisLine,
    },
  };
}

/**
 * Otevře dialog pro páry kol.
 * @param {(params: object|null) => void} onConfirm
 */
export function showGearPairDialog(onConfirm) {
  const body = `
    <div class="cnc-fields">
      <label class="cnc-field" title="Modul (společný pro oba kola, jinak nezapadají)">
        <span>Modul (m)</span>
        <input data-id="gp-m" type="number" value="2" min="0.1" step="0.5">
      </label>
      <label class="cnc-field" title="Úhel záběru – standard 20°">
        <span>Úhel záběru α [°]</span>
        <select data-id="gp-alpha">
          <option value="14.5">14.5°</option>
          <option value="20" selected>20° (standard)</option>
          <option value="25">25°</option>
        </select>
      </label>

      <fieldset style="border:1px solid var(--ctp-surface1);border-radius:4px;padding:6px 8px;margin:6px 0">
        <legend style="font-size:12px;color:var(--ctp-text)">Kolo A (pastorek)</legend>
        <label class="cnc-field">
          <span>Počet zubů z₁</span>
          <input data-id="gp-z1" type="number" value="20" min="6" max="300" step="1">
        </label>
        <label class="cnc-field">
          <span>Korekce x₁</span>
          <input data-id="gp-x1" type="number" value="0" min="-1" max="1" step="0.1">
        </label>
      </fieldset>

      <fieldset style="border:1px solid var(--ctp-surface1);border-radius:4px;padding:6px 8px;margin:6px 0">
        <legend style="font-size:12px;color:var(--ctp-text)">Kolo B (kolo)</legend>
        <label class="cnc-field">
          <span>Počet zubů z₂</span>
          <input data-id="gp-z2" type="number" value="40" min="6" max="300" step="1">
        </label>
        <label class="cnc-field">
          <span>Korekce x₂</span>
          <input data-id="gp-x2" type="number" value="0" min="-1" max="1" step="0.1">
        </label>
      </fieldset>

      <label class="cnc-field" title="Úhel spojnice středů – 0° = kolo B vpravo, 90° = nahoře">
        <span>Orientace os [°]</span>
        <input data-id="gp-orient" type="number" value="0" step="5">
      </label>
      <label class="cnc-field" title="Počet úseček na bok evolventy">
        <span>Body na involutu</span>
        <input data-id="gp-steps" type="number" value="16" min="5" max="60" step="5">
      </label>

      <div class="gear-computed" style="margin:8px 0;padding:8px;background:var(--ctp-surface0);border-radius:6px;font-size:12px">
        <strong>📐 Vypočtené:</strong>
        <div data-id="gp-results" style="margin-top:4px;display:grid;grid-template-columns:1fr 1fr;gap:2px 12px"></div>
      </div>

      <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
        <input data-id="gp-refcircles" type="checkbox" checked>
        <span>Přidat referenční kružnice (roztečné u obou kol)</span>
      </label>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;margin-top:4px">
        <input data-id="gp-axisline" type="checkbox" checked>
        <span>Přidat osu spojnice středů</span>
      </label>

      <div class="cnc-actions" style="margin-top:10px">
        <button class="gp-btn-draw" style="background:var(--ctp-green);color:var(--ctp-base);padding:8px 20px;border:none;border-radius:4px;cursor:pointer;font-weight:bold;font-size:14px">✏️ Nakreslit</button>
        <button class="gp-btn-cancel" style="background:var(--ctp-surface1);color:var(--ctp-text);padding:8px 16px;border:none;border-radius:4px;cursor:pointer">Zrušit</button>
      </div>
    </div>
  `;

  const overlay = makeOverlay('gearpair', '⚙️⚙️ Pár ozubených kol', body, 'cnc-window');
  if (!overlay) return;

  const elM = overlay.querySelector('[data-id="gp-m"]');
  const elA = overlay.querySelector('[data-id="gp-alpha"]');
  const elZ1 = overlay.querySelector('[data-id="gp-z1"]');
  const elZ2 = overlay.querySelector('[data-id="gp-z2"]');
  const elResults = overlay.querySelector('[data-id="gp-results"]');

  function recalc() {
    const m = parseFloat(elM.value) || 0;
    const z1 = parseInt(elZ1.value, 10) || 0;
    const z2 = parseInt(elZ2.value, 10) || 0;
    const rp1 = m * z1 / 2;
    const rp2 = m * z2 / 2;
    const axis = m * (z1 + z2) / 2;
    const ratio = z2 > 0 ? (z1 / z2) : 0;
    elResults.innerHTML = `
      <span>Roztečný ⌀ kola A: <strong>${(rp1 * 2).toFixed(2)} mm</strong></span>
      <span>Roztečný ⌀ kola B: <strong>${(rp2 * 2).toFixed(2)} mm</strong></span>
      <span>Osová vzdálenost: <strong>${axis.toFixed(2)} mm</strong></span>
      <span>Převodový poměr: <strong>${ratio.toFixed(3)} (A→B)</strong></span>
    `;
  }
  [elM, elZ1, elZ2].forEach(el => el.addEventListener('input', recalc));
  recalc();

  overlay.querySelector('.gp-btn-draw').addEventListener('click', () => {
    const raw = {
      m: parseFloat(elM.value),
      z1: parseInt(elZ1.value, 10),
      z2: parseInt(elZ2.value, 10),
      alpha: parseFloat(elA.value),
      x1: parseFloat(overlay.querySelector('[data-id="gp-x1"]').value),
      x2: parseFloat(overlay.querySelector('[data-id="gp-x2"]').value),
      orientation: parseFloat(overlay.querySelector('[data-id="gp-orient"]').value),
      steps: parseInt(overlay.querySelector('[data-id="gp-steps"]').value, 10),
      addRefCircles: overlay.querySelector('[data-id="gp-refcircles"]').checked,
      addAxisLine: overlay.querySelector('[data-id="gp-axisline"]').checked,
    };
    const v = validateGearPairParams(raw);
    if (v.error) { alert(v.error); return; }
    overlay.remove();
    onConfirm(v.params);
  });
  overlay.querySelector('.gp-btn-cancel').addEventListener('click', () => {
    overlay.remove();
    onConfirm(null);
  });
}
