// ── Custom confirm dialog ──────────────────────────────────────
export function camConfirm(message) {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'cam-confirm-overlay';
    ov.innerHTML = `
      <div class="cam-confirm-box">
        <div class="cam-confirm-msg">${message}</div>
        <div class="cam-confirm-btns">
          <button class="cam-confirm-ok">OK</button>
          <button class="cam-confirm-cancel">Zrušit</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const cleanup = (val) => { ov.remove(); resolve(val); };
    ov.querySelector('.cam-confirm-ok').addEventListener('click', () => cleanup(true));
    ov.querySelector('.cam-confirm-cancel').addEventListener('click', () => cleanup(false));
    ov.addEventListener('click', e => { if (e.target === ov) cleanup(false); });
    ov.querySelector('.cam-confirm-ok').focus();
  });
}

export function camCloseConfirm() {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'cam-confirm-overlay';
    ov.innerHTML = `
      <div class="cam-confirm-box">
        <div class="cam-confirm-msg"><strong>Neuložené změny v CAM</strong><br><br>Přenést konturu a dráhy do výkresu, nebo zahodit změny?</div>
        <div class="cam-confirm-btns">
          <button class="cam-confirm-cancel" data-r="discard">Zahodit změny</button>
          <button class="cam-confirm-ok" data-r="save">📐 Zachovat a přenést</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const cleanup = (val) => { ov.remove(); resolve(val); };
    ov.querySelector('[data-r="discard"]').addEventListener('click', () => cleanup('discard'));
    ov.querySelector('[data-r="save"]').addEventListener('click', () => cleanup('save'));
    ov.addEventListener('click', e => { if (e.target === ov) cleanup(null); });
    ov.querySelector('[data-r="save"]').focus();
  });
}

// ── Offset dialog ──────────────────────────────────────────────
export function camOffsetDialog(count) {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'cam-confirm-overlay';
    ov.innerHTML = `
      <div class="cam-confirm-box">
        <div class="cam-confirm-msg" style="font-weight:bold;margin-bottom:12px">Posunout ${count} vybraných bodů</div>
        <div style="display:flex;gap:10px;margin-bottom:14px">
          <label style="flex:1;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">
            ΔX<input id="cam-off-x" type="number" value="0" step="0.1"
              style="background:#1e1e2e;border:1px solid #45475a;color:#cdd6f4;border-radius:4px;padding:6px;font-size:14px;width:100%;box-sizing:border-box">
          </label>
          <label style="flex:1;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">
            ΔZ<input id="cam-off-z" type="number" value="0" step="0.1"
              style="background:#1e1e2e;border:1px solid #45475a;color:#cdd6f4;border-radius:4px;padding:6px;font-size:14px;width:100%;box-sizing:border-box">
          </label>
        </div>
        <div class="cam-confirm-btns">
          <button class="cam-confirm-ok">Posunout</button>
          <button class="cam-confirm-cancel">Zrušit</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const cleanup = (val) => { ov.remove(); resolve(val); };
    const doConfirm = () => {
      const dx = parseFloat(ov.querySelector('#cam-off-x').value) || 0;
      const dz = parseFloat(ov.querySelector('#cam-off-z').value) || 0;
      cleanup({ dx, dz });
    };
    ov.querySelector('.cam-confirm-ok').addEventListener('click', doConfirm);
    ov.querySelector('.cam-confirm-cancel').addEventListener('click', () => cleanup(null));
    ov.addEventListener('click', e => { if (e.target === ov) cleanup(null); });
    ov.addEventListener('keydown', e => {
      if (e.key === 'Enter') doConfirm();
      else if (e.key === 'Escape') cleanup(null);
    });
    ov.querySelector('#cam-off-x').focus();
  });
}

// ── Add-move dialog (úprava drah: + → nový pohyb) ──────────────
export function camAddMoveDialog(def) {
  return new Promise(resolve => {
    const d = def || {};
    const inp = 'background:#1e1e2e;border:1px solid #45475a;color:#cdd6f4;border-radius:4px;padding:6px;font-size:14px;width:100%;box-sizing:border-box';
    const lab = 'flex:1;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8';
    const ov = document.createElement('div');
    ov.className = 'cam-confirm-overlay';
    ov.innerHTML = `
      <div class="cam-confirm-box">
        <div class="cam-confirm-msg" style="font-weight:bold;margin-bottom:12px">Přidat pohyb za řádek ${d.afterLabel || ''}</div>
        <label style="${lab};margin-bottom:10px">Typ pohybu
          <select id="cam-mv-type" style="${inp}">
            <option value="G0">G0 — rychloposuv</option>
            <option value="G1" selected>G1 — posuv (řez)</option>
            <option value="G2">G2 — oblouk CW</option>
            <option value="G3">G3 — oblouk CCW</option>
          </select>
        </label>
        <div style="display:flex;gap:10px;margin-bottom:10px">
          <label style="${lab}">X${d.mode === 'DIAMON' ? ' (⌀)' : ''}<input id="cam-mv-x" type="number" step="0.1" value="${d.x != null ? d.x : 0}" style="${inp}"></label>
          <label style="${lab}">Z<input id="cam-mv-z" type="number" step="0.1" value="${d.z != null ? d.z : 0}" style="${inp}"></label>
          <label style="${lab};display:none" id="cam-mv-cr-wrap">CR<input id="cam-mv-cr" type="number" step="0.1" value="${d.cr != null ? d.cr : 0}" style="${inp}"></label>
        </div>
        <div class="cam-confirm-btns">
          <button class="cam-confirm-ok">Přidat</button>
          <button class="cam-confirm-cancel">Zrušit</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const typeSel = ov.querySelector('#cam-mv-type');
    const crWrap = ov.querySelector('#cam-mv-cr-wrap');
    const syncCr = () => { crWrap.style.display = (typeSel.value === 'G2' || typeSel.value === 'G3') ? 'flex' : 'none'; };
    typeSel.addEventListener('change', syncCr); syncCr();
    const cleanup = (val) => { ov.remove(); resolve(val); };
    const doConfirm = () => {
      const type = typeSel.value;
      cleanup({
        type,
        x: parseFloat(ov.querySelector('#cam-mv-x').value) || 0,
        z: parseFloat(ov.querySelector('#cam-mv-z').value) || 0,
        cr: (type === 'G2' || type === 'G3') ? (parseFloat(ov.querySelector('#cam-mv-cr').value) || 0) : 0,
      });
    };
    ov.querySelector('.cam-confirm-ok').addEventListener('click', doConfirm);
    ov.querySelector('.cam-confirm-cancel').addEventListener('click', () => cleanup(null));
    ov.addEventListener('click', e => { if (e.target === ov) cleanup(null); });
    ov.addEventListener('keydown', e => { if (e.key === 'Enter') doConfirm(); else if (e.key === 'Escape') cleanup(null); });
    ov.querySelector('#cam-mv-x').focus();
  });
}
