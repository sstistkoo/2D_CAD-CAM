// Modal „➕ Vložit segment za bod" (CAM simulátor, „+" režim — klik na bod).
// Vyňato z camSimulator.js (blok „Modal pro vložení segmentu",
// docs/plan-rozdeleni-cam-simulatoru.md) — stav simulátoru se předává
// parametrem; 🎯 Přebrat souřadnice nastaví `canvasPick.handler`, který
// zavolá obsluha myši simulátoru.
import { showToast } from '../../../state.js';
import { camRayIntersection } from '../interferenceGuides.js';

/**
 * @param ctx           { S, canvas, canvasPick } simulátoru
 * @param fromPt        bod, za který se vkládá (jeho X je výchozí hodnota)
 * @param onConfirm     (bod, 'contour' | 'stock') po „Vložit"
 * @param defaultTarget 'contour' | 'stock'
 * @param fromAbs       absolutní souřadnice výchozího bodu (↘ X/Z z úhlu)
 */
export function openInsertSegmentModal({ S, canvas, canvasPick }, fromPt, onConfirm, defaultTarget, fromAbs) {
  let pickMode = false;

  const ov = document.createElement('div');
  ov.className = 'cam-confirm-overlay';
  ov.style.zIndex = '200000';

  // pick hint banner – zobrazí se místo modalu při pick módu
  const hint = document.createElement('div');
  hint.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:200001;background:#f9e2af;color:#1e1e2e;font-weight:700;font-size:13px;padding:8px 20px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.4);pointer-events:none;display:none';
  hint.textContent = '🎯 Klikněte na bod kontury nebo polotovaru…  (Esc = zpět)';
  document.body.appendChild(hint);

  const syncValues = () => {
    const xEl = ov.querySelector('#ism-x');
    const zEl = ov.querySelector('#ism-z');
    const rEl = ov.querySelector('#ism-r');
    if (xEl) ov._x = parseFloat(xEl.value) || 0;
    if (zEl) ov._z = parseFloat(zEl.value) || 0;
    if (rEl) ov._r = parseFloat(rEl.value) || 0;
    const aEl = ov.querySelector('#ism-ang');
    const alEl = ov.querySelector('#ism-anglen');
    const amEl = ov.querySelector('#ism-angmode');
    if (aEl) ov._ang = parseFloat(aEl.value);
    if (alEl) ov._angLen = parseFloat(alEl.value);
    if (amEl) ov._angMode = amEl.value;
  };

  const enterPickMode = () => {
    syncValues();
    pickMode = true;
    // Nastražit při KAŽDÉM vstupu — po převzetí se handler maže a druhé
    // 🎯 ve stejném modalu dřív nedělalo nic (ani Esc).
    canvasPick.handler = onPick;
    document.addEventListener('keydown', handlePickEsc);
    ov.style.display = 'none';
    hint.style.display = 'block';
    canvas.style.cursor = 'crosshair';
  };

  const exitPickMode = () => {
    pickMode = false;
    ov.style.display = '';
    hint.style.display = 'none';
    canvas.style.cursor = 'crosshair';
    renderModal();
    setTimeout(() => ov.querySelector('#ism-x') && ov.querySelector('#ism-x').focus(), 30);
  };

  const renderModal = () => {
    const mode = ov._mode || fromPt.mode || 'ABS';
    const type = ov._type || 'G1';
    const x = ov._x !== undefined ? ov._x : fromPt.x;
    const z = ov._z !== undefined ? ov._z : (parseFloat(fromPt.z) - 5);
    const r = ov._r !== undefined ? ov._r : (fromPt.r || 0);
    const target = ov._target || defaultTarget || S.editMode || 'contour';
    const isArc = type === 'G2' || type === 'G3';

    ov.innerHTML = `
      <div class="cam-confirm-box" style="min-width:340px;max-width:95vw">
        <div style="font-weight:bold;font-size:14px;margin-bottom:14px;color:#cba6f7">➕ Vložit segment za bod</div>
        <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center;flex-wrap:wrap">
          <span style="font-size:12px;color:#a6adc8;min-width:36px">Kam</span>
          <button data-tgt="contour" style="padding:5px 14px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;border:2px solid ${target==='contour'?'#cba6f7':'#45475a'};background:${target==='contour'?'#cba6f7':'#313244'};color:${target==='contour'?'#1e1e2e':'#cdd6f4'}">Kontura</button>
          <button data-tgt="stock" style="padding:5px 14px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;border:2px solid ${target==='stock'?'#a6e3a1':'#45475a'};background:${target==='stock'?'#a6e3a1':'#313244'};color:${target==='stock'?'#1e1e2e':'#cdd6f4'}">Polotovar</button>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center">
          <span style="font-size:12px;color:#a6adc8;min-width:36px">Režim</span>
          <button id="ism-mode" style="padding:5px 14px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;border:none;background:${mode==='ABS'?'#89b4fa':'#a6e3a1'};color:#1e1e2e">
            ${mode==='ABS'?'G90 ABS':'G91 INC'}
          </button>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:14px">
          ${['G1','G2','G3'].map(t => `
            <button data-type="${t}" style="flex:1;padding:6px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;border:2px solid ${t===type?'#cba6f7':'#45475a'};background:${t===type?'#cba6f7':'#313244'};color:${t===type?'#1e1e2e':'#cdd6f4'}">${t}</button>
          `).join('')}
        </div>
        <div style="display:flex;gap:10px;margin-bottom:${isArc?'10px':'14px'}">
          <label style="flex:1;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">
            X<input id="ism-x" type="number" value="${x}" step="0.1"
              style="background:#1e1e2e;border:1px solid #45475a;color:#cdd6f4;border-radius:4px;padding:6px;font-size:14px;width:100%;box-sizing:border-box">
          </label>
          <label style="flex:1;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">
            Z<input id="ism-z" type="number" value="${z}" step="0.1"
              style="background:#1e1e2e;border:1px solid #45475a;color:#cdd6f4;border-radius:4px;padding:6px;font-size:14px;width:100%;box-sizing:border-box">
          </label>
        </div>
        ${isArc ? `
        <div style="margin-bottom:14px">
          <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">
            R (poloměr)<input id="ism-r" type="number" value="${r}" step="0.1" min="0"
              style="background:#1e1e2e;border:1px solid #45475a;color:#cdd6f4;border-radius:4px;padding:6px;font-size:14px;width:100%;box-sizing:border-box">
          </label>
        </div>` : ''}
        ${fromAbs ? `
        <div style="display:flex;gap:10px;margin-bottom:14px;align-items:flex-end;flex-wrap:wrap">
          <label style="flex:1;min-width:70px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">
            📐 Úhel (°)<input id="ism-ang" type="number" value="${ov._ang !== undefined && !isNaN(ov._ang) ? ov._ang : 45}" step="1"
              style="background:#1e1e2e;border:1px solid #45475a;color:#cdd6f4;border-radius:4px;padding:6px;font-size:14px;width:100%;box-sizing:border-box">
          </label>
          <label style="flex:1;min-width:100px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">
            Ukončení<select id="ism-angmode"
              style="background:#1e1e2e;border:1px solid #45475a;color:#cdd6f4;border-radius:4px;padding:7px 4px;font-size:13px;width:100%;box-sizing:border-box">
              <option value="length" ${ov._angMode !== 'intersect' ? 'selected' : ''}>Zadaná délka</option>
              <option value="intersect" ${ov._angMode === 'intersect' ? 'selected' : ''}>Do průsečíku</option>
            </select>
          </label>
          <label id="ism-anglen-wrap" style="flex:1;min-width:60px;display:${ov._angMode === 'intersect' ? 'none' : 'flex'};flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">
            Délka<input id="ism-anglen" type="number" value="${ov._angLen !== undefined && !isNaN(ov._angLen) ? ov._angLen : 10}" step="0.5" min="0.001"
              style="background:#1e1e2e;border:1px solid #45475a;color:#cdd6f4;border-radius:4px;padding:6px;font-size:14px;width:100%;box-sizing:border-box">
          </label>
          <button id="ism-angcalc" title="Dopočítat X/Z od výchozího bodu: pod úhlem na zadanou délku, nebo do průsečíku s konturou/polotovarem (0° = +Z vodorovně, 90° = +X nahoru)"
            style="padding:7px 12px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;border:2px solid #45475a;background:#313244;color:#cdd6f4;white-space:nowrap">↘ X/Z</button>
        </div>` : ''}
        <div style="margin-bottom:14px">
          <button id="ism-pick" style="width:100%;padding:7px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;border:2px solid #45475a;background:#313244;color:#cdd6f4">
            🎯 Přebrat souřadnice z bodu
          </button>
        </div>
        <div class="cam-confirm-btns">
          <button id="ism-ok" style="padding:7px 22px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;border:none;background:#a6e3a1;color:#1e1e2e">Vložit</button>
          <button id="ism-cancel" style="padding:7px 22px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;border:none;background:#45475a;color:#cdd6f4">Zrušit</button>
        </div>
      </div>`;

    ov._mode = mode;
    ov._type = type;
    ov._x = x;
    ov._z = z;
    ov._r = r;
    ov._target = target;

    ov.querySelectorAll('[data-tgt]').forEach(btn => {
      btn.addEventListener('click', () => {
        syncValues();
        ov._target = btn.dataset.tgt;
        renderModal();
      });
    });

    ov.querySelector('#ism-mode').addEventListener('click', () => {
      syncValues();
      ov._mode = ov._mode === 'ABS' ? 'INC' : 'ABS';
      renderModal();
    });

    ov.querySelectorAll('[data-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        syncValues();
        ov._type = btn.dataset.type;
        renderModal();
      });
    });

    ov.querySelector('#ism-pick').addEventListener('click', enterPickMode);

    // Dopočet X/Z z úhlu od výchozího bodu (CAD nástroj „Úhel") —
    // ukončení zadanou délkou, nebo do průsečíku s konturou/polotovarem.
    const angModeSel = ov.querySelector('#ism-angmode');
    if (angModeSel) angModeSel.addEventListener('change', () => {
      ov._angMode = angModeSel.value;
      const lenWrap = ov.querySelector('#ism-anglen-wrap');
      if (lenWrap) lenWrap.style.display = angModeSel.value === 'intersect' ? 'none' : 'flex';
    });
    const angCalcBtn = ov.querySelector('#ism-angcalc');
    if (angCalcBtn) angCalcBtn.addEventListener('click', () => {
      syncValues();
      const a = ov._ang, l = ov._angLen;
      const toIntersect = ov._angMode === 'intersect';
      if (isNaN(a) || (!toIntersect && (isNaN(l) || l <= 0))) { showToast('Zkontrolujte úhel a délku.'); return; }
      const isDia = S.params.mode === 'DIAMON';
      const fx = isDia ? fromAbs.xAbs / 2 : fromAbs.xAbs;
      const rad = a * Math.PI / 180;
      let ex, ez;
      if (toIntersect) {
        const hit = camRayIntersection(fx, fromAbs.zAbs, Math.sin(rad), Math.cos(rad), null, S._cachedCalc);
        if (!hit) { showToast('Žádný průsečík ve směru úhlu nenalezen.'); return; }
        ex = hit.x; ez = hit.z;
      } else {
        ex = fx + Math.sin(rad) * l;
        ez = fromAbs.zAbs + Math.cos(rad) * l;
      }
      ov._x = Math.round((isDia ? ex * 2 : ex) * 1000) / 1000;
      ov._z = Math.round(ez * 1000) / 1000;
      ov._mode = 'ABS';
      renderModal();
    });

    ov.querySelector('#ism-ok').addEventListener('click', () => {
      syncValues();
      const pt = { type: ov._type, x: ov._x, z: ov._z, r: ov._r || 0, mode: ov._mode };
      const tgt = ov._target;
      ov.remove(); hint.remove();
      canvasPick.handler = null;
      canvas.style.cursor = 'crosshair';
      onConfirm(pt, tgt);
    });

    ov.querySelector('#ism-cancel').addEventListener('click', () => {
      document.removeEventListener('keydown', handlePickEsc);
      ov.remove(); hint.remove(); canvasPick.handler = null; canvas.style.cursor = 'crosshair';
    });

    ov.addEventListener('keydown', e => {
      if (e.key === 'Enter') ov.querySelector('#ism-ok').click();
      else if (e.key === 'Escape') ov.querySelector('#ism-cancel').click();
    });
  };

  // Escape při pick módu vrátí modal zpět
  const handlePickEsc = (e) => {
    if (e.key === 'Escape' && pickMode) { exitPickMode(); }
  };
  document.addEventListener('keydown', handlePickEsc);

  renderModal();
  document.body.appendChild(ov);
  setTimeout(() => ov.querySelector('#ism-x') && ov.querySelector('#ism-x').focus(), 50);

  // pick handler – kliknutí na canvas přebere souřadnice bodu
  const onPick = (wx, wz) => {
    if (!pickMode) { canvasPick.handler = null; return; }
    // wx = poloměr ve světě → do pole X v jednotkách bodů (Ø režim = průměr);
    // převzatý bod je absolutní, takže i režim G90.
    ov._x = Math.round((S.params.mode === 'DIAMON' ? wx * 2 : wx) * 100) / 100;
    ov._z = Math.round(wz * 100) / 100;
    ov._mode = 'ABS';
    document.removeEventListener('keydown', handlePickEsc);
    canvasPick.handler = null;
    exitPickMode();
  };
}
