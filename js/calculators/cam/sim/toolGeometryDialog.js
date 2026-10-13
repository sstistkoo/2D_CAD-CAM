// Okno 🔪 Geometrie nástroje v CAM simulátoru: náhled destičky (VBD) a držáku
// s klikatelnými úhly, záložky Destička / Držák, natočení, ruka, ruční obrys
// držáku (body, obdélník se sražením, „📐 Kreslit na CAD plátně"). Vyňato
// z camSimulator.js (blok „Modal ⚙️ Geometrie", docs/plan-rozdeleni-cam-
// simulatoru.md) — stav simulátoru a jeho funkce se předávají parametrem;
// stav okna (zoom, záložka, režimy kreslení) žije v closure jednoho otevření.
import { state, showToast } from '../../../state.js';
import { catalogSizeRowHTML } from '../catalogInsertSize.js';
import { createHolderCadDraw } from './holderCadDraw.js';
import { drawInsertAndHolderPreview, holderRectProfile, translateHolderProfile, holderProfileSegCount,
  holderShapeInfoHTML, chamferProfileCorner, wireAngleCompass, wireAllAngleCompasses, _renderInsertShapeFieldsHTML } from '../insertPreview.js';

/** @param ctx { S, toolUi, overlay, escAttr, pushHistory, applyChange, undo, redo, flushMagSlotEdit, applyParamChange, applyTipMirrorToggle, applyShapeChange, openVbdImportDialog, showMagazineMenu, showMagazineDialog, showSaveCurrentToolDialog, exportToolGeometryFile, importToolGeometryFile } */
export function createToolGeometryDialog({ S, toolUi, overlay, escAttr, pushHistory, applyChange, undo, redo, flushMagSlotEdit, applyParamChange, applyTipMirrorToggle, applyShapeChange, openVbdImportDialog, showMagazineMenu, showMagazineDialog, showSaveCurrentToolDialog, exportToolGeometryFile, importToolGeometryFile }) {
  function showToolGeometryDialog() {
    const dlg = document.createElement('div');
    dlg.className = 'input-overlay cam-geom-overlay';
    dlg.style.zIndex = '300';
    document.body.appendChild(dlg);

    // Stav náhledu (zoom/posun) a aktivní pod-záložka přežívají mezi
    // re-rendery (render() vždy přepíše dlg.innerHTML) — patří proto do
    // vnějšího closure dialogu, ne do S.params (je to jen UI stav náhledu).
    let viewZoom = 1, viewPanX = 0, viewPanY = 0;
    // Záložka a strana kreslení obrysu v objektu — přepisují je i vyňaté části
    // okna (holderCadDraw.js, geomPopups.js), které cizí `let` nezmění.
    const geomUi = { activeGeomTab: 'insert', currentDrawSide: null }; // activeGeomTab: 'insert' | 'holder'
    let isDraggingCanvas = false, dragStartX = 0, dragStartY = 0, panStartX = 0, panStartY = 0, clickMoved = false;
    // Poslední klikatelné popisky úhlů z canvasu (logické souřadnice před
    // zoom/pan), použité k umístění "hotspot" bublin přes canvas.
    let lastLabels = {};
    // Ruční kreslení obrysu držáku — drawModeActive zapíná zobrazení
    // klikatelných anchor bodů na destičce; geomUi.currentDrawSide drží, která
    // strana ('sideA'/'sideB') se právě rozšiřuje (viz handleDrawCanvasClick).
    let drawModeActive = false;
    let lastAnchorHits = [];
    // Editor tvaru držáku (z obdélníku): rectEditActive zapíná spodní klikací
    // body držáku + anchory destičky (vč. Střed R); rectMoveSel = vybraný bod
    // držáku pro přesun; chamferPickMode = čeká na klik rohu k sražení.
    let rectEditActive = false;
    let rectMoveSel = null;
    let chamferPickMode = false;
    let lastHandleHits = [];
    // Rozbalovací výpis obrysu držáku (segmenty holderProfile) — jen UI stav.
    let holderShapeInfoOpen = false;
    // Sledování skutečné velikosti plátna náhledu (viz attachCanvasInteractions).
    let canvasResizeObs = null;

    function closeDialog() {
      if (canvasResizeObs) { canvasResizeObs.disconnect(); canvasResizeObs = null; }
      toolUi.toolGeomModalRefresh = null;
      document.removeEventListener('keydown', onKeyDown);
      dlg.remove();
      flushMagSlotEdit();
    }
    // Escape modal jen zavře, pokud zrovna neběží kreslení obrysu na CAD
    // plátně (modal je pak jen skrytý display:none — viz startHolderDrawOnCad
    // — a Escape má v tu chvíli zrušit KRESLENÍ, ne zahodit skrytý dialog;
    // to řeší state._toolCleanup zaregistrovaný při startu kreslení).
    function onKeyDown(e) { if (e.key === 'Escape' && !state.holderDrawMode) closeDialog(); }
    document.addEventListener('keydown', onKeyDown);
    dlg.addEventListener('click', e => { if (e.target === dlg) closeDialog(); });

    function clampZoom(z) { return Math.max(0.4, Math.min(12, z)); }
    function resetView() { viewZoom = 1; viewPanX = 0; viewPanY = 0; redrawCanvas(); }
    function zoomBy(factor, cx, cy) {
      const oldZoom = viewZoom;
      const newZoom = clampZoom(viewZoom * factor);
      viewPanX = cx - (cx - viewPanX) * (newZoom / oldZoom);
      viewPanY = cy - (cy - viewPanY) * (newZoom / oldZoom);
      viewZoom = newZoom;
      redrawCanvas();
    }

    function redrawCanvas() {
      const cv = dlg.querySelector('#tool-geom-canvas');
      if (!cv) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = cv.getBoundingClientRect();
      const cw = Math.max(Math.round(rect.width), 100), ch = Math.max(Math.round(rect.height), 120);
      if (cv.width !== cw * dpr || cv.height !== ch * dpr) {
        cv.width = cw * dpr; cv.height = ch * dpr;
      }
      const cctx = cv.getContext('2d');
      cctx.setTransform(1, 0, 0, 1, 0, 0);
      cctx.clearRect(0, 0, cv.width, cv.height);
      cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cctx.fillStyle = '#1e1e2e'; cctx.fillRect(0, 0, cw, ch);
      cctx.translate(viewPanX, viewPanY);
      cctx.scale(viewZoom, viewZoom);
      // uiScale = 1/viewZoom → čáry/markery zůstanou po zoomu konstantně tenké.
      const result = drawInsertAndHolderPreview(cctx, cw, ch, S.params,
        { showAnchors: drawModeActive || rectEditActive, activeSide: geomUi.currentDrawSide, uiScale: 1 / viewZoom,
          hideHolder: geomUi.activeGeomTab === 'insert',
          showHolderHandles: rectEditActive, selectedHandle: rectMoveSel });
      lastLabels = (result && result.labels) || {};
      lastAnchorHits = (result && result.anchorHits) || [];
      lastHandleHits = (result && result.handleHits) || [];
      positionTexts((result && result.texts) || []);
      positionHotspots();
    }

    // Popisky (ε, ∠, b, l1…) se kreslí jako HTML spany nad canvasem — vždy
    // ostré a KONSTANTNÍ velikosti bez ohledu na zoom (canvas text by se při
    // zoomu rozmazal). Pozice jsou v logických souř. → přepočet zoom/pan.
    function positionTexts(texts) {
      const wrap = dlg.querySelector('#tool-geom-canvas-wrap');
      if (!wrap) return;
      wrap.querySelectorAll('.geom-canvas-label').forEach(el => el.remove());
      texts.forEach(t => {
        const span = document.createElement('span');
        span.className = 'geom-canvas-label';
        const align = t.align || 'center';
        const tx = t.x * viewZoom + viewPanX, ty = t.y * viewZoom + viewPanY;
        span.textContent = t.text;
        span.style.cssText = `position:absolute;left:${tx}px;top:${ty}px;`
          + `transform:translate(${align === 'center' ? '-50%' : align === 'right' ? '-100%' : '0'},-50%);`
          + `color:${t.color};font:11px sans-serif;white-space:nowrap;pointer-events:none;text-shadow:0 0 3px #1e1e2e,0 0 3px #1e1e2e`;
        wrap.appendChild(span);
      });
    }

    // Mapa klíčů popisků → kam kliknutím přepnout a co zaostřit.
    const HOTSPOT_TARGETS = {
      tipAngle: { tab: 'insert', focusSelector: '[data-p="toolTipAngle"]' },
      toolAngle: { tab: 'insert', focusSelector: '[data-p="toolAngle"]' },
    };

    function onHotspotClick(key) {
      const target = HOTSPOT_TARGETS[key];
      if (!target) return;
      const needTabSwitch = geomUi.activeGeomTab !== target.tab;
      if (needTabSwitch) { geomUi.activeGeomTab = target.tab; render(); }
      setTimeout(() => {
        const el = target.focusId ? dlg.querySelector('#' + target.focusId) : dlg.querySelector(target.focusSelector);
        if (el) { el.focus(); if (el.select) el.select(); }
      }, needTabSwitch ? 30 : 0);
    }

    // Přes canvas se překreslí malé klikací bubliny na místech popisků úhlů
    // (κr, ε, natočení, γ/γf) — klik přepne na příslušnou pod-záložku a
    // zaostří odpovídající pole k úpravě.
    function positionHotspots() {
      const wrap = dlg.querySelector('#tool-geom-canvas-wrap');
      if (!wrap) return;
      wrap.querySelectorAll('.geom-hotspot').forEach(el => el.remove());
      Object.keys(lastLabels).forEach(key => {
        const pos = lastLabels[key];
        if (!pos || !HOTSPOT_TARGETS[key]) return;
        const btn = document.createElement('button');
        btn.className = 'geom-hotspot';
        btn.title = 'Klikněte pro úpravu';
        btn.style.cssText = `position:absolute;left:${pos.x * viewZoom + viewPanX - 12}px;top:${pos.y * viewZoom + viewPanY - 12}px;width:24px;height:24px;border-radius:50%;border:1px dashed rgba(137,180,250,0.65);background:rgba(137,180,250,0.14);cursor:pointer;padding:0`;
        btn.addEventListener('click', (e) => { e.stopPropagation(); onHotspotClick(key); });
        wrap.appendChild(btn);
      });
    }

    // Myš (kolečko = zoom, tažení = posun) + dotyk (tažení = posun) na canvasu.
    function attachCanvasInteractions(cv) {
      // Backing store plátna se počítá z naměřené šířky. Při vkládání dialogu
      // (a při každém render(), který canvas vymění) nemusí být rozložení hotové
      // — první měření pak vyjde pár pixelů, plátno zůstane na minimu 100 px
      // a náhled se roztáhne. Překreslit, jakmile dostane skutečnou velikost.
      if (typeof ResizeObserver !== 'undefined') {
        if (canvasResizeObs) canvasResizeObs.disconnect();
        canvasResizeObs = new ResizeObserver(() => redrawCanvas());
        canvasResizeObs.observe(cv);
      }
      cv.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = cv.getBoundingClientRect();
        zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - rect.left, e.clientY - rect.top);
      }, { passive: false });
      cv.addEventListener('pointerdown', (e) => {
        isDraggingCanvas = true;
        clickMoved = false;
        dragStartX = e.clientX; dragStartY = e.clientY;
        panStartX = viewPanX; panStartY = viewPanY;
        cv.setPointerCapture(e.pointerId);
      });
      cv.addEventListener('pointermove', (e) => {
        if (!isDraggingCanvas) return;
        const dx = e.clientX - dragStartX, dy = e.clientY - dragStartY;
        if (Math.hypot(dx, dy) > 4) clickMoved = true;
        // V kresebním/editovacím režimu se drží krátká "mrtvá zóna" (4px), ať
        // jde odlišit klik na bod od tažení pro posun náhledu.
        if ((!drawModeActive && !rectEditActive) || clickMoved) {
          viewPanX = panStartX + dx;
          viewPanY = panStartY + dy;
          redrawCanvas();
        }
      });
      const endDrag = (e) => {
        isDraggingCanvas = false;
        if ((drawModeActive || rectEditActive) && !clickMoved && e) {
          const rect = cv.getBoundingClientRect();
          handleDrawCanvasClick(e.clientX - rect.left, e.clientY - rect.top);
        }
      };
      cv.addEventListener('pointerup', endDrag);
      cv.addEventListener('pointercancel', () => { isDraggingCanvas = false; });
      cv.addEventListener('pointerleave', () => { isDraggingCanvas = false; });
    }

    // Nejbližší zásah v poli hit bodů (screen-space po zoom/pan). Vrací {hit,dist}.
    function _nearestHit(list, cx, cy) {
      let best = null, bestDist = Infinity;
      list.forEach(a => {
        const sx = a.x * viewZoom + viewPanX, sy = a.y * viewZoom + viewPanY;
        const d = Math.hypot(cx - sx, cy - sy);
        if (d < bestDist) { bestDist = d; best = a; }
      });
      return { hit: best, dist: bestDist };
    }

    // Klik na canvas v editoru tvaru držáku (rectEditActive).
    function handleRectEditClick(cx, cy) {
      const hnd = _nearestHit(lastHandleHits, cx, cy);
      const anc = _nearestHit(lastAnchorHits, cx, cy);
      // Sražení rohu: čeká na klik rohu držáku.
      if (chamferPickMode) {
        if (hnd.hit && hnd.dist <= 16 && hnd.hit.role === 'corner') {
          const corner = { x: hnd.hit.wx, z: hnd.hit.wz };
          chamferPickMode = false;
          showChamferPopup(corner);
        } else { showToast('Klikněte na rohový bod držáku (žlutý čtvereček na kraji)'); }
        return;
      }
      // Přednost má klik na bod držáku (výběr zdroje přesunu).
      if (hnd.hit && hnd.dist <= 16 && (!anc.hit || hnd.dist <= anc.dist)) {
        rectMoveSel = { x: hnd.hit.wx, z: hnd.hit.wz };
        redrawCanvas();
        showToast('Vybráno. Klikněte na bod destičky (zelený) — držák se tam přesune.');
        return;
      }
      // Klik na anchor destičky = cíl přesunu (jen když je vybrán bod držáku).
      if (anc.hit && anc.dist <= 16) {
        if (!rectMoveSel) { showToast('Nejdřív klikněte na bod držáku (žlutý), pak na cíl na destičce.'); return; }
        const dx = anc.hit.wx - rectMoveSel.x, dz = anc.hit.wz - rectMoveSel.z;
        pushHistory();
        S.params.holderProfile = translateHolderProfile(S.params.holderProfile, dx, dz);
        rectMoveSel = null;
        applyChange();
        showToast('Držák přesunut ✓');
        return;
      }
      rectMoveSel = null; redrawCanvas();
    }

    // Klik na canvas v kresebním režimu — hit-test proti anchor bodům
    // (lastAnchorHits). Editor tvaru (rectEditActive) má vlastní obsluhu.
    function handleDrawCanvasClick(cx, cy) {
      if (rectEditActive) { handleRectEditClick(cx, cy); return; }
      const { hit: best, dist: bestDist } = _nearestHit(lastAnchorHits, cx, cy);
      if (!best || bestDist > 16) return;
      if (best.side === 'center') return; // Střed R není strana obrysu
      if (!S.params.holderProfile) S.params.holderProfile = { sideA: [], sideB: [] };
      const cur = S.params.holderProfile[best.side];
      if (!cur || cur.length === 0) {
        pushHistory();
        S.params.holderProfile[best.side] = [{ x: best.wx, z: best.wz }];
      }
      geomUi.currentDrawSide = best.side;
      applyChange();
      showHolderSidePopup(best.side);
    }

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

    // „📐 Kreslit držák na CAD plátně" → holderCadDraw.js
    const { startHolderCadDraw } = createHolderCadDraw({ S, overlay, toolUi, dlg, geomUi });

    function render() {
      const prms = S.params;
      // Editor obdélníku kreslí klikací body JEN k existujícímu obrysu
      // (insertPreview: showHolderHandles && hasProfile). Když obrys mezitím
      // zmizel — 🗑 Smazat obrys, ↩ Zpět, výměna tvaru destičky (ta ho zahazuje
      // schválně) — zůstal editor zapnutý, ale bez jediného bodu, na který jde
      // kliknout. Vypnout ho; obdélník si uživatel zase založí tlačítkem.
      // (Materializovat obrys sám by HLÍDÁNÍ nezměnilo — holderProfileLoop
      // staví bez obrysu týž obdélník — ale NÁHLED ano: bez obrysu se kreslí
      // pás na obě strany, holderRectProfile je jednostranný od x=0. Nechat
      // kresbu skočit bez příčiny je horší než vypnout editor.)
      if (rectEditActive) {
        const _p = prms.holderProfile;
        if (!(_p && ((_p.sideA && _p.sideA.length) || (_p.sideB && _p.sideB.length)))) {
          rectEditActive = false; rectMoveSel = null; chamferPickMode = false;
        }
      }

      // Rozložení (uživatel 1. 10. 2026): hlavička název | ↩ ↪ ☰ · ✕ (jako
      // 🔧 Zásobník — sdílí jeho třídy cam-mag-*), pod náhledem jeden
      // přepínač 🔩 Destička / 🗜 Držák. Celý nůž (zásobník, soubor) je v ☰.
      const insertTab = geomUi.activeGeomTab === 'insert';
      const prof = prms.holderProfile;
      const hasProfileNow = !!(prof && ((prof.sideA && prof.sideA.length) || (prof.sideB && prof.sideB.length)));
      const anchorsSupported = prms.toolShape === 'round' || prms.toolShape === 'polygon';
      const segCount = holderProfileSegCount(prms.holderProfile);
      dlg.innerHTML = `
        <div class="input-dialog cam-mag-dlg cam-geom-dlg" style="min-width:320px;max-width:520px;width:100%;max-height:92vh;display:flex;flex-direction:column;padding:14px">
          <div class="cam-mag-head">
            <h3 class="cam-mag-title">🔪 Geometrie nástroje</h3>
            <span style="flex:1"></span>
            <div class="cam-mag-head-right">
              <button data-act="geom-undo" class="cam-mag-hbtn cam-mag-ibtn" title="Zpět" ${S.past.length === 0 ? 'disabled' : ''}>↩</button>
              <button data-act="geom-redo" class="cam-mag-hbtn cam-mag-ibtn" title="Vpřed" ${S.future.length === 0 ? 'disabled' : ''}>↪</button>
              <button data-act="geom-menu" class="cam-mag-hbtn cam-mag-ibtn" title="Celý nůž — 🔧 Zásobník, 💾 Uložit nůž, 💾 Uložit do PC, 📂 Načíst z PC">☰</button>
              <button data-act="geom-close" class="cam-mag-hbtn cam-mag-ibtn cam-mag-close" title="Zavřít">✕</button>
            </div>
          </div>
          <div id="tool-geom-canvas-wrap" style="position:relative;flex-shrink:0;overflow:hidden">
            <canvas id="tool-geom-canvas" style="width:100%;height:300px;min-height:240px;display:block;border-radius:6px;border:1px solid #313244;touch-action:none;cursor:grab" title="Kolečko = zoom, tažení = posun"></canvas>
            <div style="position:absolute;top:6px;right:6px;display:flex;flex-direction:column;gap:3px">
              <button data-act="geom-zoom-in" class="cam-sim-btn cam-sim-btn-gray" style="width:24px;height:24px;padding:0;font-size:13px" title="Přiblížit">＋</button>
              <button data-act="geom-zoom-out" class="cam-sim-btn cam-sim-btn-gray" style="width:24px;height:24px;padding:0;font-size:13px" title="Oddálit">－</button>
              <button data-act="geom-zoom-reset" class="cam-sim-btn cam-sim-btn-gray" style="width:24px;height:24px;padding:0;font-size:11px" title="Obnovit náhled">⟲</button>
            </div>
          </div>
          <div class="cam-geom-btnrow" style="margin:8px 0 0">
            <button data-act="geom-tab-toggle" class="cam-geom-seg" title="Přepnout nastavení destičky / držáku">
              <span class="${insertTab ? 'on' : ''}">🔩 Destička</span><span class="${insertTab ? '' : 'on'}">🗜 Držák</span>
            </button>
            ${insertTab ? '' : `<button data-act="geom-draw-on-cad" class="cam-geom-btn" title="Kreslit držák na CAD plátně — vyčistí plátno (se zálohou), vygeneruje destičku jako zamčenou geometrii a nechá vás nakreslit držák běžnými CAD nástroji. Dole ✓ Potvrdit / ✕ Zrušit.">📐 Kreslit na CAD</button>`}
          </div>
          <div style="flex:1;overflow-y:auto;min-height:0;margin-top:8px">
            ${insertTab ? `
              <div class="cam-sim-row cam-geom-vbd">
                <label class="cam-geom-inl" title="ISO kód vyměnitelné břitové destičky">VBD</label>
                <div class="cam-sim-field"><input type="text" data-p="toolVbdCode" value="${escAttr(prms.toolVbdCode || '')}" placeholder="CNMG120408-PM" style="font-family:monospace;text-transform:uppercase" maxlength="20" spellcheck="false" autocomplete="off"></div>
                <button data-act="geom-open-vbd" class="cam-geom-btn" title="Rozpoznat rozměry destičky z ISO kódu VBD">🔩 Dekodér</button>
              </div>
              ${_renderInsertShapeFieldsHTML(prms, { sizeRowHTML: catalogSizeRowHTML(prms), tipRowExtraHTML: `<button data-act="geom-open-rotate-insert" class="cam-sim-btn cam-sim-btn-gray" style="width:auto;display:inline-flex;padding:3px 8px;font-size:11px" title="Natočení jen destičky (polární úhel)">↻ Natočení destičky (${prms.toolAngle}°)</button>` })}
            ` : `
              <div class="cam-geom-btnrow">
                <button data-act="geom-toggle-draw" class="cam-geom-btn${drawModeActive ? ' on' : ''}" ${anchorsSupported ? '' : 'disabled'} title="${anchorsSupported ? 'Kreslit obrys držáku úsečkami od zvýrazněného bodu na destičce v náhledu' : 'Ruční obrys je zatím podporovaný jen pro kulatou a čtyřstrannou destičku — použijte 📐 Kreslit na CAD'}">✏️ Kreslit obrys</button>
                ${hasProfileNow ? `<button data-act="geom-clear-profile" class="cam-geom-btn" title="Smazat vlastní obrys — zpět na prostý obdélník (Tloušťka × Délka)">🗑 Smazat obrys</button>` : ''}
                <button data-act="geom-rect-edit" class="cam-geom-btn${rectEditActive ? ' on' : ''}" title="Editor obdélníku — obdélník držáku se 3 body na spodní hraně (2 rohy + střed) a body destičky. Klik na bod držáku → klik na bod destičky = přesun.">🔧 Upravit obdélník</button>
              </div>
              ${drawModeActive ? `<div class="cam-sim-info-box" style="margin-bottom:6px">Klikněte na zvýrazněný bod na destičce v náhledu, pak zadejte délku a úhel jednotlivých úseček.</div>` : ''}
              ${rectEditActive ? `<div class="cam-geom-box">
                <div class="cam-geom-box-title">Editor obdélníku</div>
                <div class="cam-sim-info-box" style="margin-bottom:6px">Přesuňte roh na bod destičky (vč. 🎯 Střed R) a sražte druhý roh přímo v náhledu.</div>
                <div class="cam-geom-btnrow" style="margin-bottom:0">
                  <button data-act="geom-rect-chamfer" class="cam-geom-btn${chamferPickMode ? ' on' : ''}" title="Klikněte, pak vyberte rohový bod držáku ke sražení">🔻 Srazit roh${chamferPickMode ? ' (vyberte roh)' : ''}</button>
                  <button data-act="geom-rect-reset" class="cam-geom-btn" title="Vymaže úpravy a vrátí čistý obdélník podle Délky a Tloušťky">🗑 Vymazat</button>
                </div>
              </div>` : ''}
              <div class="cam-sim-section-title">Rozměry a natočení</div>
              <div class="cam-sim-row">
                <div class="cam-sim-field"><label title="Funkční délka l1 — stejné pole jako Délka držáku dole v panelu Nástroj">Délka držáku (l1)</label><input type="number" step="10" min="0" data-p="holderLength" value="${prms.holderLength ?? 200}"></div>
                <div class="cam-sim-field"><label title="Tloušťka (šířka v ose Z) držáku plátku — používá se pro hlídání geometrie destičky">Tloušťka držáku</label><input type="number" step="1" min="0" data-p="holderWidth" value="${prms.holderWidth ?? 20}"></div>
              </div>
              <div class="cam-geom-btnrow">
                <button data-act="geom-toggle-hand" class="cam-geom-btn" title="Ruka držáku — při otevření odvozena ze směru hrubování, zde lze přepnout ručně">⇄ Ruka: ${prms.holderHand === 'L' ? 'Levá (L)' : 'Pravá (R)'}</button>
                <button data-act="geom-open-rotate-knife" class="cam-geom-btn" title="Natočení celého nože (destička i držák). Šipka ukazuje směrem k destičce. 270° = destička dole / držák nahoru.">↻ Natočení nože (${prms.knifeAngle ?? 270}°)</button>
                <button data-act="geom-toggle-shape-info" class="cam-geom-btn${holderShapeInfoOpen ? ' on' : ''}" title="Vypíše obrys držáku bod po bodu (délka + úhel každého úseku) — stejná data jako 📐 Kreslit na CAD / 🔧 Upravit obdélník">${holderShapeInfoOpen ? '▾' : '▸'} Tvar${segCount > 0 ? ` (${segCount})` : ''}</button>
              </div>
              ${holderShapeInfoOpen ? `<div class="cam-sim-info-box" style="font-style:normal;padding:6px 4px;margin:0 0 8px;overflow-x:auto">${holderShapeInfoHTML(prms)}</div>` : ''}
            `}
          </div>
        </div>`;

      dlg.querySelector('[data-act="geom-close"]').addEventListener('click', closeDialog);
      dlg.querySelector('[data-act="geom-menu"]').addEventListener('click', () => showMagazineMenu('☰ Nůž', [
        { icon: '🔧', label: 'Zásobník', run: () => showMagazineDialog(),
          hint: 'Nože T1, T2… — výběr, úpravy, pořadí' },
        { icon: '💾', label: 'Uložit nůž', run: () => showSaveCurrentToolDialog(() => { if (toolUi.magazineDialogRefresh) toolUi.magazineDialogRefresh(); }),
          hint: 'Destička i držák do zásobníku nebo do knihovny' },
        { icon: '💾', label: 'Uložit do PC', run: () => exportToolGeometryFile(),
          hint: 'Celý nůž jako .json soubor na disk' },
        { icon: '📂', label: 'Načíst z PC', run: () => importToolGeometryFile(),
          hint: 'Nůž (destička + držák) z .json souboru' },
      ]));

      const undoBtn = dlg.querySelector('[data-act="geom-undo"]');
      if (undoBtn) undoBtn.addEventListener('click', () => undo());
      const redoBtn = dlg.querySelector('[data-act="geom-redo"]');
      if (redoBtn) redoBtn.addEventListener('click', () => redo());

      // Přepínač Destička/Držák — jen lokální UI stav, bez historie.
      dlg.querySelector('[data-act="geom-tab-toggle"]').addEventListener('click', () => {
        geomUi.activeGeomTab = geomUi.activeGeomTab === 'insert' ? 'holder' : 'insert';
        render();
      });

      dlg.querySelectorAll('[data-p]').forEach(inp => {
        inp.addEventListener('change', withHistory(() => applyParamChange(inp.dataset.p, inp)));
      });
      wireAllAngleCompasses(dlg);
      const tipMirrorBtn = dlg.querySelector('[data-act="toggle-tip-mirror"]');
      if (tipMirrorBtn) tipMirrorBtn.addEventListener('click', withHistory(() => applyTipMirrorToggle()));
      dlg.querySelectorAll('[data-tshape]').forEach(btn => {
        btn.addEventListener('click', withHistory(() => applyShapeChange(btn.dataset.tshape)));
      });
      const geomVbdBtn = dlg.querySelector('[data-act="geom-open-vbd"]');
      if (geomVbdBtn) geomVbdBtn.addEventListener('click', () => openVbdImportDialog());
      const toggleShapeInfoBtn = dlg.querySelector('[data-act="geom-toggle-shape-info"]');
      if (toggleShapeInfoBtn) toggleShapeInfoBtn.addEventListener('click', () => { holderShapeInfoOpen = !holderShapeInfoOpen; render(); });
      const toggleHandBtn = dlg.querySelector('[data-act="geom-toggle-hand"]');
      if (toggleHandBtn) toggleHandBtn.addEventListener('click', withHistory(() => {
        S.params.holderHand = S.params.holderHand === 'L' ? 'R' : 'L';
        toolUi.magEditHandTouched = true;   // ruční volba — smí se uložit do slotu
        applyChange();
      }));
      const openRotateInsertBtn = dlg.querySelector('[data-act="geom-open-rotate-insert"]');
      if (openRotateInsertBtn) openRotateInsertBtn.addEventListener('click', () => showRotateToolPopup());
      const openRotateKnifeBtn = dlg.querySelector('[data-act="geom-open-rotate-knife"]');
      if (openRotateKnifeBtn) openRotateKnifeBtn.addEventListener('click', () => showRotateKnifePopup());
      const toggleDrawBtn = dlg.querySelector('[data-act="geom-toggle-draw"]');
      if (toggleDrawBtn) toggleDrawBtn.addEventListener('click', () => {
        drawModeActive = !drawModeActive;
        geomUi.currentDrawSide = null;
        document.querySelector('.geom-side-popup')?.remove();
        render();
      });
      const clearProfileBtn = dlg.querySelector('[data-act="geom-clear-profile"]');
      if (clearProfileBtn) clearProfileBtn.addEventListener('click', withHistory(() => {
        S.params.holderProfile = null;
        applyChange();
      }));
      const drawOnCadBtn = dlg.querySelector('[data-act="geom-draw-on-cad"]');
      if (drawOnCadBtn) drawOnCadBtn.addEventListener('click', () => startHolderCadDraw());

      // ── Editor tvaru držáku z obdélníku ──
      const rectEditBtn = dlg.querySelector('[data-act="geom-rect-edit"]');
      if (rectEditBtn) rectEditBtn.addEventListener('click', () => {
        rectEditActive = !rectEditActive;
        rectMoveSel = null; chamferPickMode = false;
        if (rectEditActive) {
          // Vypnout freehand kreslení + materializovat obdélník, pokud není obrys.
          drawModeActive = false; geomUi.currentDrawSide = null;
          const p = S.params.holderProfile;
          const hasP = p && ((p.sideA && p.sideA.length) || (p.sideB && p.sideB.length));
          if (!hasP) { pushHistory(); S.params.holderProfile = { sideA: holderRectProfile(S.params), sideB: [] }; }
        }
        render();
      });
      const rectChamferBtn = dlg.querySelector('[data-act="geom-rect-chamfer"]');
      if (rectChamferBtn) rectChamferBtn.addEventListener('click', () => {
        chamferPickMode = !chamferPickMode;
        rectMoveSel = null;
        showToast(chamferPickMode ? 'Klikněte na rohový bod držáku (žlutý čtvereček na kraji)' : 'Sražení zrušeno');
        render();
      });
      const rectResetBtn = dlg.querySelector('[data-act="geom-rect-reset"]');
      if (rectResetBtn) rectResetBtn.addEventListener('click', withHistory(() => {
        rectMoveSel = null; chamferPickMode = false;
        S.params.holderProfile = { sideA: holderRectProfile(S.params), sideB: [] };
        applyChange();
        showToast('Obdélník obnoven');
      }));

      // Zoom/posun canvasu — čistě UI stav náhledu, nejde do historie.
      const zoomInBtn = dlg.querySelector('[data-act="geom-zoom-in"]');
      if (zoomInBtn) zoomInBtn.addEventListener('click', () => {
        const cv = dlg.querySelector('#tool-geom-canvas');
        zoomBy(1.3, cv.clientWidth / 2, cv.clientHeight / 2);
      });
      const zoomOutBtn = dlg.querySelector('[data-act="geom-zoom-out"]');
      if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => {
        const cv = dlg.querySelector('#tool-geom-canvas');
        zoomBy(1 / 1.3, cv.clientWidth / 2, cv.clientHeight / 2);
      });
      const zoomResetBtn = dlg.querySelector('[data-act="geom-zoom-reset"]');
      if (zoomResetBtn) zoomResetBtn.addEventListener('click', resetView);

      const canvasEl = dlg.querySelector('#tool-geom-canvas');
      if (canvasEl) attachCanvasInteractions(canvasEl);
      redrawCanvas();
    }

    // Ruka držáku se při OTEVŘENÍ dialogu odvodí ze směru hrubování
    // (roughingSide) — poté ji lze tlačítkem "⇄ Ruka" ručně přepnout, aniž by
    // se přepínala zpátky při každém re-renderu (viz toolUi.toolGeomModalRefresh).
    S.params.holderHand = S.params.roughingSide === 'left' ? 'L' : 'R';

    toolUi.toolGeomModalRefresh = render;
    render();
  }
  return { showToolGeometryDialog };
}
