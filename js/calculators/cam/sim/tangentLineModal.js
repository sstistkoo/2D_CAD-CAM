// Modal „📐 Tečna pod úhlem z oblouku" (CAM obdoba CAD nástroje „Úhel").
// Vyňato z camSimulator.js (blok „Modal: tečná úsečka pod úhlem z oblouku",
// docs/plan-rozdeleni-cam-simulatoru.md) — stav simulátoru a jeho akce se
// předávají parametrem.
import { showToast } from '../../../state.js';
import { getArcParams } from '../camMath.js';
import { resolvePointsToAbsolute } from '../contourBuild.js';
import { camRayIntersection } from '../interferenceGuides.js';

/**
 * Klik na oblouk v "+" módu: oblouk se ukončí (ořízne/prodlouží po své
 * kružnici) v bodě, kde má tečna zadaný úhel — na straně kliknutí — a za
 * tečný bod se vloží G1 úsečka zadané délky pod tímto úhlem. Nebo se jen
 * přidá pomocná čára (S.guideLines).
 * @param ctx   { S, saveState, draw, pushHistory, fullUpdate } simulátoru
 * @param found { idx, isStock, wx, wz } — oblouk pod kurzorem (getArcSegmentAt)
 */
export function openTangentLineModal({ S, saveState, draw, pushHistory, fullUpdate }, found) {
  const ov = document.createElement('div');
  ov.className = 'cam-confirm-overlay';
  ov.style.zIndex = '200000';
  const inpStyle = 'background:#1e1e2e;border:1px solid #45475a;color:#cdd6f4;border-radius:4px;padding:6px;font-size:14px;width:100%;box-sizing:border-box';
  ov.innerHTML = `
    <div class="cam-confirm-box" style="min-width:320px;max-width:95vw">
      <div style="font-weight:bold;font-size:14px;margin-bottom:10px;color:#cba6f7">📐 Tečna pod úhlem z oblouku</div>
      <p style="font-size:11px;color:#a6adc8;margin:0 0 12px">Úsečka tečná k oblouku pod zadaným úhlem (tečný bod na straně kliknutí). Úhel: 0° = +Z (vodorovně vpravo), 90° = +X (nahoru), záporný/+180° = opačný směr.</p>
      <div style="display:flex;gap:10px;margin-bottom:14px">
        <label style="flex:1;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">
          Úhel (°)<input id="tlm-ang" type="number" value="45" step="1" style="${inpStyle}">
        </label>
        <label style="flex:1;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">
          Ukončení<select id="tlm-mode" style="${inpStyle};padding:7px 6px">
            <option value="length" selected>Zadaná délka</option>
            <option value="intersect">Do průsečíku</option>
          </select>
        </label>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:14px" id="tlm-len-row">
        <label style="flex:1;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">
          Délka<input id="tlm-len" type="number" value="10" step="0.5" min="0.001" style="${inpStyle}">
        </label>
      </div>
      ${S.params.toolShape === 'polygon' ? `
      <div style="display:flex;gap:6px;margin-bottom:14px">
        <button id="tlm-preset-front" title="Úhel čelní hrany destičky (natočení + ε − 180) — kontrola dojezdů v Z" style="flex:1;padding:6px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;border:2px solid #45475a;background:#313244;color:#cdd6f4">↘ Hrana dojezdu</button>
        <button id="tlm-preset-bottom" title="Úhel spodní hrany destičky (natočení − 180) — kontrola zanořování" style="flex:1;padding:6px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;border:2px solid #45475a;background:#313244;color:#cdd6f4">↙ Hrana zanoření</button>
      </div>` : ''}
      <div style="display:flex;gap:10px;margin-bottom:6px">
        <label style="flex:1;display:flex;flex-direction:column;gap:4px;font-size:12px;color:#a6adc8">
          Výsledek<select id="tlm-result" style="${inpStyle};padding:7px 6px">
            <option value="guide" selected>Pomocná čára (jen zobrazit)</option>
            <option value="insert">Vložit do kontury (oříznout oblouk)</option>
          </select>
        </label>
      </div>
      <p style="font-size:10px;color:#6c7086;margin:0 0 12px">Pomocná čára konturu nemění — slouží ke kontrole, např. zda destička nezajíždí do kontury.</p>
      ${S.guideLines.length > 0 ? `<div style="margin-bottom:12px"><button id="tlm-clear" style="width:100%;padding:6px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;border:2px solid #45475a;background:#313244;color:#cdd6f4">🧹 Smazat pomocné čáry (${S.guideLines.length})</button></div>` : ''}
      <div class="cam-confirm-btns">
        <button id="tlm-ok" style="padding:7px 22px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;border:none;background:#a6e3a1;color:#1e1e2e">Vložit</button>
        <button id="tlm-cancel" style="padding:7px 22px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;border:none;background:#45475a;color:#cdd6f4">Zrušit</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.querySelector('#tlm-cancel').addEventListener('click', close);
  ov.addEventListener('keydown', e => {
    if (e.key === 'Escape') close();
    else if (e.key === 'Enter') ov.querySelector('#tlm-ok').click();
  });
  const modeSel = ov.querySelector('#tlm-mode');
  modeSel.addEventListener('change', () => {
    ov.querySelector('#tlm-len-row').style.display = modeSel.value === 'length' ? '' : 'none';
  });
  const clearBtn = ov.querySelector('#tlm-clear');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    S.guideLines = [];
    saveState();
    draw();
    clearBtn.parentElement.remove();
    showToast('Pomocné čáry smazány.');
  });
  // Presety: úhel hrany destičky (směr dolů k materiálu) + Do průsečíku.
  const applyPreset = (angDeg) => {
    let a = angDeg;
    while (a <= -180) a += 360;
    while (a > 180) a -= 360;
    ov.querySelector('#tlm-ang').value = Math.round(a * 10) / 10;
    modeSel.value = 'intersect';
    modeSel.dispatchEvent(new Event('change'));
  };
  const presetFront = ov.querySelector('#tlm-preset-front');
  if (presetFront) presetFront.addEventListener('click', () => {
    applyPreset((parseFloat(S.params.toolAngle) || 0) + (parseFloat(S.params.toolTipAngle) || 90) - 180);
  });
  const presetBottom = ov.querySelector('#tlm-preset-bottom');
  if (presetBottom) presetBottom.addEventListener('click', () => {
    applyPreset((parseFloat(S.params.toolAngle) || 0) - 180);
  });
  setTimeout(() => { const i = ov.querySelector('#tlm-ang'); if (i) { i.focus(); i.select(); } }, 50);

  ov.querySelector('#tlm-ok').addEventListener('click', () => {
    const angDeg = parseFloat(ov.querySelector('#tlm-ang').value);
    const termMode = modeSel.value;
    const len = parseFloat(ov.querySelector('#tlm-len').value);
    if (isNaN(angDeg) || (termMode === 'length' && (isNaN(len) || len <= 0))) { showToast('Zkontrolujte úhel a délku.'); return; }
    const list = found.isStock ? S.stockPoints : S.contourPoints;
    const abs = resolvePointsToAbsolute(list);
    const p1 = abs[found.idx - 1], p2 = abs[found.idx];
    if (!p1 || !p2) { close(); return; }
    const isDia = S.params.mode === 'DIAMON';
    const toReal = (p) => ({ x: isDia ? p.xAbs / 2 : p.xAbs, z: p.zAbs });
    const arc = getArcParams(toReal(p1), toReal(p2), p2.rVal, p2.type);
    if (arc.error) { showToast('Oblouk nelze vyhodnotit.'); close(); return; }
    const rad = angDeg * Math.PI / 180;
    const dirZ = Math.cos(rad), dirX = Math.sin(rad);
    // Tečný bod = střed ± r·normála směru (kolmice v rovině ZX);
    // ze dvou kandidátů bereme ten blíž místu kliknutí.
    const t1 = { x: arc.cx + arc.r * dirZ, z: arc.cz - arc.r * dirX };
    const t2 = { x: arc.cx - arc.r * dirZ, z: arc.cz + arc.r * dirX };
    const d1 = Math.hypot(found.wx - t1.x, found.wz - t1.z);
    const d2 = Math.hypot(found.wx - t2.x, found.wz - t2.z);
    const T = d1 <= d2 ? t1 : t2;
    let E;
    if (termMode === 'intersect') {
      // Do průsečíku: prodloužit paprsek z tečného bodu k nejbližšímu
      // prvku kontury/polotovaru (tečnovaný oblouk se vynechá).
      E = camRayIntersection(T.x, T.z, dirX, dirZ, { idx: found.idx, isStock: found.isStock }, S._cachedCalc);
      if (!E) { showToast('Žádný průsečík ve směru úhlu nenalezen.'); return; }
    } else {
      E = { x: T.x + dirX * len, z: T.z + dirZ * len };
    }
    const resultMode = ov.querySelector('#tlm-result').value;
    if (resultMode === 'guide') {
      // Jen pomocná čára — kontura zůstává beze změny.
      S.guideLines.push({ x1: T.x, z1: T.z, x2: E.x, z2: E.z });
      close();
      saveState();
      draw();
      showToast(`Pomocná tečna pod úhlem ${angDeg}° přidána ✓`);
      return;
    }
    pushHistory();
    const tgt = list[found.idx];
    tgt.x = Math.round((isDia ? T.x * 2 : T.x) * 1000) / 1000;
    tgt.z = Math.round(T.z * 1000) / 1000;
    tgt.mode = 'ABS';
    list.splice(found.idx + 1, 0, {
      id: Date.now(), type: 'G1', mode: 'ABS',
      x: Math.round((isDia ? E.x * 2 : E.x) * 1000) / 1000,
      z: Math.round(E.z * 1000) / 1000,
      r: 0
    });
    close();
    fullUpdate();
    showToast(`Tečna pod úhlem ${angDeg}° vložena ✓`);
  });
}
