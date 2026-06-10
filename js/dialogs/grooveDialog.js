// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Dialog pro zápich (DIN 76 / DIN 509 / vlastní)      ║
// ╚══════════════════════════════════════════════════════════════╝

import { makeOverlay } from '../dialogFactory.js';
import { lookupDin76, lookupDin509 } from '../calculators/dinGrooves.js';

/**
 * Pure validace parametrů zápichu.
 * @returns {{error:string}|{params:object}}
 */
export function validateGrooveParams(raw) {
  const diameter = Number(raw?.diameter);
  const f = Number(raw?.f);
  const t = Number(raw?.t);
  const r = Number(raw?.r);
  const alpha = Number(raw?.alpha);
  if (!Number.isFinite(diameter) || diameter <= 0) {
    return { error: 'Průměr musí být > 0' };
  }
  if (!Number.isFinite(f) || f <= 0) {
    return { error: 'Šířka zápichu f musí být > 0' };
  }
  if (!Number.isFinite(t) || t <= 0) {
    return { error: 'Hloubka t musí být > 0' };
  }
  if (!Number.isFinite(r) || r < 0) {
    return { error: 'Poloměr r musí být >= 0' };
  }
  return {
    params: {
      diameter, f, t, r,
      alpha: Number.isFinite(alpha) ? alpha : 45,
      type: raw.type || 'din76',
      mirror: !!raw.mirror,
    },
  };
}

/**
 * Otevře dialog pro zadání parametrů zápichu (DIN 76 / DIN 509 / vlastní).
 * @param {(params: object|null) => void} onConfirm
 */
export function showGrooveDialog(onConfirm) {
  const body = `
    <div class="cnc-fields">
      <label class="cnc-field" title="Typ zápichu dle normy">
        <span>Typ zápichu</span>
        <select data-id="type">
          <option value="din76">DIN 76 – výběh závitu (45°)</option>
          <option value="din509e">DIN 509 E – výběh broušení (15°)</option>
          <option value="din509f">DIN 509 F – výběh broušení (8°)</option>
          <option value="custom">Vlastní</option>
        </select>
      </label>
      <label class="cnc-field" title="Průměr válcové plochy, na které zápich leží">
        <span>Průměr d [mm]</span>
        <input data-id="diameter" type="number" value="20" min="0.1" step="0.5">
      </label>
      <label class="cnc-field din76-only" title="Stoupání závitu – určuje rozměry dle DIN 76">
        <span>Stoupání P [mm]</span>
        <input data-id="pitch" type="number" value="1.5" min="0.1" step="0.05">
      </label>
      <label class="cnc-field" title="Šířka zápichu (axiální)">
        <span>Šířka f [mm]</span>
        <input data-id="f" type="number" value="4" min="0.1" step="0.1">
      </label>
      <label class="cnc-field" title="Radiální hloubka zápichu">
        <span>Hloubka t [mm]</span>
        <input data-id="t" type="number" value="0.8" min="0.01" step="0.05">
      </label>
      <label class="cnc-field" title="Poloměr přechodu na dně zápichu">
        <span>Poloměr r [mm]</span>
        <input data-id="r" type="number" value="0.8" min="0" step="0.05">
      </label>
      <label class="cnc-field custom-only" title="Úhel šikmé stěny od osy (DIN76 = 45°, DIN509 E = 15°, F = 8°)">
        <span>Úhel stěny [°]</span>
        <input data-id="alpha" type="number" value="45" min="1" max="89" step="1">
      </label>
      <label class="cnc-field" title="Směr náběhu zápichu (orientace podél osy Z)">
        <span>Směr</span>
        <select data-id="mirror">
          <option value="0">Šikmá stěna vlevo →</option>
          <option value="1">Šikmá stěna vpravo ←</option>
        </select>
      </label>
      <div class="cnc-actions" style="margin-top:10px">
        <button class="groove-btn-draw" style="background:var(--ctp-green);color:var(--ctp-base);padding:8px 20px;border:none;border-radius:4px;cursor:pointer;font-weight:bold;font-size:14px">
          ✏️ Nakreslit
        </button>
        <button class="groove-btn-cancel" style="background:var(--ctp-surface1);color:var(--ctp-text);padding:8px 16px;border:none;border-radius:4px;cursor:pointer">
          Zrušit
        </button>
      </div>
    </div>
  `;

  const overlay = makeOverlay('groove', '⏚ Zápich (DIN 76 / DIN 509)', body, 'cnc-window');
  if (!overlay) return;

  const typeSel = overlay.querySelector('[data-id="type"]');
  const diameterInp = overlay.querySelector('[data-id="diameter"]');
  const pitchInp = overlay.querySelector('[data-id="pitch"]');
  const fInp = overlay.querySelector('[data-id="f"]');
  const tInp = overlay.querySelector('[data-id="t"]');
  const rInp = overlay.querySelector('[data-id="r"]');
  const alphaInp = overlay.querySelector('[data-id="alpha"]');
  const din76Fields = overlay.querySelectorAll('.din76-only');
  const customFields = overlay.querySelectorAll('.custom-only');

  function applyPreset() {
    const type = typeSel.value;
    din76Fields.forEach(el => el.style.display = (type === 'din76') ? '' : 'none');
    customFields.forEach(el => el.style.display = (type === 'custom') ? '' : 'none');
    if (type === 'din76') {
      const dims = lookupDin76(parseFloat(pitchInp.value));
      fInp.value = dims.f; rInp.value = dims.r; tInp.value = dims.t;
      alphaInp.value = 45;
    } else if (type === 'din509e' || type === 'din509f') {
      const dims = lookupDin509(parseFloat(diameterInp.value), type === 'din509f' ? 'F' : 'E');
      fInp.value = dims.f; rInp.value = dims.r; tInp.value = dims.t;
      alphaInp.value = dims.alpha;
    }
  }

  typeSel.addEventListener('change', applyPreset);
  pitchInp.addEventListener('input', () => { if (typeSel.value === 'din76') applyPreset(); });
  diameterInp.addEventListener('input', () => {
    if (typeSel.value === 'din509e' || typeSel.value === 'din509f') applyPreset();
  });
  applyPreset();

  overlay.querySelector('.groove-btn-draw').addEventListener('click', () => {
    const type = typeSel.value;
    let alpha;
    if (type === 'din76') alpha = 45;
    else if (type === 'din509e') alpha = 15;
    else if (type === 'din509f') alpha = 8;
    else alpha = parseFloat(alphaInp.value);

    const raw = {
      type,
      diameter: parseFloat(diameterInp.value),
      f: parseFloat(fInp.value),
      t: parseFloat(tInp.value),
      r: parseFloat(rInp.value),
      alpha,
      mirror: overlay.querySelector('[data-id="mirror"]').value === '1',
    };
    const validated = validateGrooveParams(raw);
    if (validated.error) {
      alert(validated.error);
      return;
    }
    overlay.remove();
    onConfirm(validated.params);
  });
  overlay.querySelector('.groove-btn-cancel').addEventListener('click', () => {
    overlay.remove();
    onConfirm(null);
  });
}
