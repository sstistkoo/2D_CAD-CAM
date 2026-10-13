// Popupy okna 🔪 Geometrie: sražení rohu držáku, ↻ natočení destičky,
// natočení celého nože, strana obrysu držáku (kreslení od bodu destičky).
// Vyňato z toolGeometryDialog.js (docs/plan-rozdeleni-cam-simulatoru.md) —
// okno a stav se předávají parametrem.
import { showToast } from '../../../state.js';
import { chamferProfileCorner, wireAngleCompass } from '../insertPreview.js';

/**
 * @param ctx { S, pushHistory, applyChange, geomUi, redrawCanvas }
 * @returns { showChamferPopup, withHistory, showRotateToolPopup, showRotateKnifePopup, showHolderSidePopup }
 */
export function createGeomPopups({ S, pushHistory, applyChange, geomUi, redrawCanvas }) {
  // Popup pro sražení (zkosení) vybraného rohu držáku o zadanou vzdálenost.
  function showChamferPopup(corner) {
    document.querySelector('.geom-side-popup, .geom-rotate-popup')?.remove();
    const popup = document.createElement('div');
    popup.className = 'geom-rotate-popup input-overlay';
    popup.style.zIndex = '320';
    popup.innerHTML = `<div class="input-dialog" style="min-width:220px;width:auto;padding:14px">
      <h3 style="margin:0 0 10px;font-size:14px">🔻 Srazit roh držáku</h3>
      <div class="cam-sim-row">
        <div class="cam-sim-field" style="flex:1">
          <label>Velikost sražení (mm)</label>
          <input type="number" id="geom-chamfer-size" value="${Math.max((parseFloat(S.params.holderWidth) || 20) * 0.5, 1).toFixed(1)}" step="1" min="0.1" style="width:100%">
        </div>
        <div class="cam-sim-field" style="flex:1">
          <label title="Úhel sražení vůči hraně; 45° = symetrické (stejné nohy)">Úhel (°)</label>
          <input type="number" id="geom-chamfer-angle" value="45" step="5" min="1" max="89" style="width:100%">
        </div>
      </div>
      <div style="text-align:right;margin-top:10px;display:flex;gap:8px;justify-content:flex-end">
        <button class="btn-cancel" id="geom-chamfer-cancel">Zrušit</button>
        <button class="cam-sim-btn cam-sim-btn-green" id="geom-chamfer-ok" style="width:auto;padding:4px 12px">Srazit</button>
      </div>
    </div>`;
    document.body.appendChild(popup);
    const inp = popup.querySelector('#geom-chamfer-size');
    const angInp = popup.querySelector('#geom-chamfer-angle');
    const apply = () => {
      const d = parseFloat(inp.value);
      if (!isFinite(d) || d <= 0) { showToast('Zadejte velikost sražení'); return; }
      const ang = parseFloat(angInp.value);
      pushHistory();
      const prof = S.params.holderProfile;
      prof.sideA = chamferProfileCorner(prof.sideA, corner, d, isFinite(ang) ? ang : 45);
      popup.remove();
      applyChange();
      showToast('Roh sražen ✓');
    };
    popup.querySelector('#geom-chamfer-ok').addEventListener('click', apply);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') apply(); });
    angInp.addEventListener('keydown', e => { if (e.key === 'Enter') apply(); });
    popup.querySelector('#geom-chamfer-cancel').addEventListener('click', () => popup.remove());
    popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });
    inp.focus(); inp.select();
  }

  // Sdílený wrapper — před KAŽDOU změnou z tohoto dialogu uloží historii
  // (S.past), aby šla vzít zpět tlačítkem ↩ v hlavičce dialogu.
  function withHistory(fn) { return (...args) => { pushHistory(); fn(...args); }; }

  // Malé samostatné okno pro natočení destičky (polární úhel + ✛ kompas) —
  // otevřené z Držák tabu vedle ⇄ Ruka, ať nemusí uživatel přepínat na
  // Destička tab jen kvůli změně Natočení.
  function showRotateToolPopup() {
    const existing = document.querySelector('.geom-rotate-popup');
    if (existing) { existing.remove(); return; }
    const popup = document.createElement('div');
    popup.className = 'geom-rotate-popup input-overlay';
    popup.style.zIndex = '320';
    popup.innerHTML = `<div class="input-dialog" style="min-width:220px;width:auto;padding:14px">
      <h3 style="margin:0 0 10px;font-size:14px">↻ Natočení destičky</h3>
      <div class="cam-sim-row">
        <div class="cam-sim-field" style="flex:1">
          <label>Polární úhel (°)</label>
          <div style="display:flex;gap:2px">
            <input type="number" id="geom-rotate-angle" value="${S.params.toolAngle}" style="flex:1;min-width:0">
            <button type="button" class="compass-trigger-btn" id="geom-rotate-compass" title="Rychlá volba úhlu" style="flex-shrink:0">✛</button>
          </div>
        </div>
      </div>
      <div style="text-align:right;margin-top:10px">
        <button class="btn-cancel" id="geom-rotate-close">Zavřít</button>
      </div>
    </div>`;
    document.body.appendChild(popup);
    const angInp = popup.querySelector('#geom-rotate-angle');
    angInp.addEventListener('change', withHistory(() => {
      S.params.toolAngle = parseFloat(angInp.value) || 0;
      applyChange();
    }));
    wireAngleCompass(popup.querySelector('#geom-rotate-compass'), angInp, () => {
      pushHistory();
      S.params.toolAngle = parseFloat(angInp.value) || 0;
      applyChange();
    });
    popup.querySelector('#geom-rotate-close').addEventListener('click', () => popup.remove());
    popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });
  }

  // Jako showRotateToolPopup, ale natáčí CELÝ NŮŽ (destička + držák) —
  // knifeAngle se v náhledu aplikuje na obojí najednou (viz
  // drawInsertAndHolderPreview). Otevřeno z Držák tabu.
  function showRotateKnifePopup() {
    const existing = document.querySelector('.geom-rotate-popup');
    if (existing) { existing.remove(); return; }
    const popup = document.createElement('div');
    popup.className = 'geom-rotate-popup input-overlay';
    popup.style.zIndex = '320';
    popup.innerHTML = `<div class="input-dialog" style="min-width:220px;width:auto;padding:14px">
      <h3 style="margin:0 0 10px;font-size:14px">↻ Natočení nože</h3>
      <div style="font-size:10px;color:#6c7086;margin-bottom:6px">Otočí destičku i držák najednou. Šipka míří <b>k destičce</b> (270° = destička dole, držák nahoru).</div>
      <div class="cam-sim-row">
        <div class="cam-sim-field" style="flex:1">
          <label>Směr k destičce (°)</label>
          <div style="display:flex;gap:2px">
            <input type="number" id="geom-knife-angle" value="${S.params.knifeAngle ?? 270}" style="flex:1;min-width:0">
            <button type="button" class="compass-trigger-btn" id="geom-knife-compass" title="Rychlá volba úhlu" style="flex-shrink:0">✛</button>
          </div>
        </div>
      </div>
      <div style="text-align:right;margin-top:10px">
        <button class="btn-cancel" id="geom-knife-close">Zavřít</button>
      </div>
    </div>`;
    document.body.appendChild(popup);
    const angInp = popup.querySelector('#geom-knife-angle');
    angInp.addEventListener('change', withHistory(() => {
      S.params.knifeAngle = parseFloat(angInp.value) || 0;
      applyChange();
    }));
    wireAngleCompass(popup.querySelector('#geom-knife-compass'), angInp, () => {
      pushHistory();
      S.params.knifeAngle = parseFloat(angInp.value) || 0;
      applyChange();
    });
    popup.querySelector('#geom-knife-close').addEventListener('click', () => popup.remove());
    popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });
  }

  // Popup pro přidávání bodů jedné strany obrysu držáku — Délka + Polární
  // úhel (+ ✛ kompas) od POSLEDNÍHO bodu dané strany. "Přidat bod" body
  // ukládá a popup se rovnou znovu otevře pro další segment (bez nutnosti
  // klikat na canvas znovu — jen první bod strany vzniká kliknutím na
  // anchor, viz handleDrawCanvasClick).
  function showHolderSidePopup(side) {
    const existing = document.querySelector('.geom-side-popup');
    if (existing) existing.remove();
    const pts = (S.params.holderProfile && S.params.holderProfile[side]) || [];
    const sideLabel = side === 'sideA' ? 'A' : 'B';
    const popup = document.createElement('div');
    popup.className = 'geom-side-popup input-overlay';
    popup.style.zIndex = '320';
    popup.innerHTML = `<div class="input-dialog" style="min-width:240px;width:auto;padding:14px">
      <h3 style="margin:0 0 10px;font-size:14px">✏️ Obrys držáku — strana ${sideLabel}</h3>
      <div style="font-size:11px;color:#a6adc8;margin-bottom:8px">Bodů: ${pts.length}</div>
      <div class="cam-sim-row">
        <div class="cam-sim-field"><label>Délka (mm)</label><input type="number" id="geom-side-len" step="0.5" min="0"></div>
        <div class="cam-sim-field">
          <label>Polární úhel (°)</label>
          <div style="display:flex;gap:2px">
            <input type="number" id="geom-side-ang" style="flex:1;min-width:0">
            <button type="button" class="compass-trigger-btn" id="geom-side-compass" title="Rychlá volba úhlu" style="flex-shrink:0">✛</button>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
        <button class="cam-sim-btn cam-sim-btn-green" id="geom-side-add" style="width:auto;padding:4px 10px;font-size:12px">➕ Přidat bod</button>
        <button class="cam-sim-btn cam-sim-btn-gray" id="geom-side-undo" style="width:auto;padding:4px 10px;font-size:12px" ${pts.length <= 1 ? 'disabled' : ''}>↩ Zpět o bod</button>
        <button class="cam-sim-btn cam-sim-btn-gray" id="geom-side-clear" style="width:auto;padding:4px 10px;font-size:12px">🗑 Zrušit stranu</button>
      </div>
      <div style="text-align:right;margin-top:10px">
        <button class="btn-cancel" id="geom-side-done">✔ Dokončit stranu</button>
      </div>
    </div>`;
    document.body.appendChild(popup);

    const lenInp = popup.querySelector('#geom-side-len');
    const angInp = popup.querySelector('#geom-side-ang');
    wireAngleCompass(popup.querySelector('#geom-side-compass'), angInp);

    function addPoint() {
      const len = parseFloat(lenInp.value);
      const ang = parseFloat(angInp.value);
      if (!isFinite(len) || len <= 0 || !isFinite(ang)) { showToast('Zadejte délku a úhel'); return; }
      const cur = S.params.holderProfile[side];
      const last = cur[cur.length - 1];
      const rad = ang * Math.PI / 180;
      pushHistory();
      cur.push({ x: last.x + Math.cos(rad) * len, z: last.z + Math.sin(rad) * len });
      applyChange();
      popup.remove();
      showHolderSidePopup(side);
    }
    popup.querySelector('#geom-side-add').addEventListener('click', addPoint);
    [lenInp, angInp].forEach(inp => inp.addEventListener('keydown', e => { if (e.key === 'Enter') addPoint(); }));

    popup.querySelector('#geom-side-undo').addEventListener('click', () => {
      const cur = S.params.holderProfile[side];
      if (cur.length <= 1) return; // anchor bod (první) se nemaže — "Zrušit stranu" místo toho
      pushHistory();
      cur.pop();
      applyChange();
      popup.remove();
      showHolderSidePopup(side);
    });
    popup.querySelector('#geom-side-clear').addEventListener('click', () => {
      pushHistory();
      S.params.holderProfile[side] = [];
      geomUi.currentDrawSide = null;
      applyChange();
      popup.remove();
      redrawCanvas();
    });
    const finishSide = () => { geomUi.currentDrawSide = null; popup.remove(); redrawCanvas(); };
    popup.querySelector('#geom-side-done').addEventListener('click', finishSide);
    popup.addEventListener('click', e => { if (e.target === popup) finishSide(); });
    lenInp.focus();
  }

  return { showChamferPopup, withHistory, showRotateToolPopup, showRotateKnifePopup, showHolderSidePopup };
}
