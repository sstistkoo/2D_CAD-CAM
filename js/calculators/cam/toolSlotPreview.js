// Náhled nože ze zásobníku (👁 Ukázat) — jen ke koukání: nakreslí destičku
// I DRŽÁK přesně tak, jak nůž vypadá v simulaci (stejná kresba jako ⚙️
// Geometrie nástroje, viz drawInsertAndHolderPreview), aniž by se do S.params
// cokoli zapsalo. Úprava nože patří tlačítku ✏️ Upravit (otevře Geometrii).
//
// Slot zásobníku má vlastní názvy polí (shape/radius/tipAngle…), kresba čte
// jména z S.params (toolShape/toolRadius/…) → převod přes paramsFromMagSlot().
import { drawInsertAndHolderPreview } from './insertPreview.js';

const SHAPE_LABEL = {
  round: '⬤ Kulatá', polygon: '◼ Čtyřstranná / polygon',
  parting: '▮ Upichovací', threading: '▽ Závitová',
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function num(v, fallback) {
  const n = parseFloat(v);
  return isFinite(n) ? n : fallback;
}

/** Slot zásobníku → objekt ve tvaru S.params (jen pole, která kresba nože
 *  potřebuje). Pořadí a významy polí drží krok s _applyMagSlot v camSimulator. */
export function paramsFromMagSlot(slot) {
  const s = slot || {};
  return {
    toolName: s.name || '',
    toolVbdCode: s.vbdCode || '',
    toolShape: s.shape || 'round',
    toolRadius: num(s.radius, 0.8),
    toolTipAngle: num(s.tipAngle, 90),
    toolAngle: num(s.toolAngle, 0),
    toolClearanceAngle: num(s.clearanceAngle, 0),
    toolLength: num(s.toolLength, 10),
    toolTipFlat: num(s.tipFlat, 0.1),
    toolTipMirror: s.tipMirror === true,
    holderLength: num(s.holderLength, 200),
    holderWidth: num(s.holderWidth, 20),
    holderHand: s.holderHand === 'L' ? 'L' : 'R',
    knifeAngle: num(s.knifeAngle, 270),
    holderProfile: s.holderProfile || null,
    holderInflate: num(s.holderInflate, 0),
    holderInflateAll: s.holderInflateAll === true,
  };
}

/** Shrnutí geometrie slotu do jednoho řádku pod náhled. */
function summaryHTML(slot, prms) {
  const prof = prms.holderProfile;
  const hasProfile = !!(prof && ((prof.sideA && prof.sideA.length) || (prof.sideB && prof.sideB.length)));
  const chip = (txt, title) => `<span class="cam-sim-machine-chip"${title ? ` title="${esc(title)}"` : ''}>${esc(txt)}</span>`;
  const parts = [
    chip(SHAPE_LABEL[prms.toolShape] || prms.toolShape),
    chip(`R${prms.toolRadius}`, 'Rádius špičky'),
  ];
  if (prms.toolShape === 'polygon') {
    parts.push(chip(`${prms.toolAngle}°`, 'Natočení destičky'));
    parts.push(chip(`ε${prms.toolTipAngle}°`, 'Vrcholový úhel'));
    if (prms.toolClearanceAngle) parts.push(chip(`α${prms.toolClearanceAngle}°`, 'Úhel hřbetu'));
  }
  if (prms.toolShape === 'parting') parts.push(chip(`š${prms.toolLength}`, 'Šířka plátku'));
  if (prms.toolShape === 'threading') parts.push(chip(`ε${prms.toolTipAngle}°`, 'Úhel profilu'));
  parts.push(chip(`l1=${prms.holderLength}`, 'Délka držáku'));
  parts.push(chip(`b=${prms.holderWidth}`, 'Tloušťka držáku'));
  parts.push(chip(prms.holderHand === 'L' ? 'Levá (L)' : 'Pravá (R)', 'Ruka držáku'));
  parts.push(chip(`↻ ${prms.knifeAngle}°`, 'Natočení nože — směr, kterým míří destička'));
  parts.push(chip(hasProfile ? '📐 vlastní obrys' : '▭ obdélník', 'Tvar držáku'));
  if (slot && (slot.vc || slot.f || slot.ap)) {
    parts.push(chip(`Vc ${slot.vc} · f ${slot.f} · ap ${slot.ap}`, 'Řezné podmínky'));
  }
  return parts.join(' ');
}

/** Read-only okno „👁 Ukázat" — nůž (destička + držák) ze slotu zásobníku.
 *  Kolečko/± = zoom, tažení = posun; stejné ovládání jako náhled v Geometrii. */
export function showToolSlotPreviewDialog(slot) {
  const prms = paramsFromMagSlot(slot);
  const title = `T${slot && slot.slot != null ? slot.slot : '?'} — ${slot && slot.name ? slot.name : 'Nůž'}`;

  const dlg = document.createElement('div');
  dlg.className = 'input-overlay';
  // Nad zásobníkem (z-index 300), ze kterého se okno otevírá.
  dlg.style.zIndex = '320';
  dlg.innerHTML = `
    <div class="input-dialog" style="min-width:320px;max-width:480px;width:100%;display:flex;flex-direction:column;padding:14px">
      <h3 style="margin:0 0 8px">👁 ${esc(title)}</h3>
      <div id="mag-prev-wrap" style="position:relative;flex-shrink:0;overflow:hidden">
        <canvas id="mag-prev-canvas" style="width:100%;height:300px;min-height:240px;display:block;border-radius:6px;border:1px solid #313244;touch-action:none;cursor:grab" title="Kolečko = zoom, tažení = posun"></canvas>
        <div style="position:absolute;top:6px;right:6px;display:flex;flex-direction:column;gap:3px">
          <button data-act="prev-zoom-in" class="cam-sim-btn cam-sim-btn-gray" style="width:24px;height:24px;padding:0;font-size:13px" title="Přiblížit">＋</button>
          <button data-act="prev-zoom-out" class="cam-sim-btn cam-sim-btn-gray" style="width:24px;height:24px;padding:0;font-size:13px" title="Oddálit">－</button>
          <button data-act="prev-zoom-reset" class="cam-sim-btn cam-sim-btn-gray" style="width:24px;height:24px;padding:0;font-size:11px" title="Obnovit náhled">⟲</button>
        </div>
      </div>
      <div class="cam-sim-info-box" style="font-style:normal;display:flex;flex-wrap:wrap;gap:4px;margin-top:8px">${summaryHTML(slot, prms)}</div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;border-top:1px solid #313244;padding-top:10px">
        <button class="btn-cancel" data-act="prev-close">Zavřít</button>
      </div>
    </div>`;
  document.body.appendChild(dlg);

  let zoom = 1, panX = 0, panY = 0;
  // Referenční bod nože (špička destičky) ve screen souřadnicích poslední
  // kresby — kolem něj zoomují tlačítka ± (viz zoomCenter).
  let lastOrigin = null;
  let dragging = false, dragX = 0, dragY = 0, panStartX = 0, panStartY = 0;

  // Plátno se měří přes getBoundingClientRect a podle toho dostane backing
  // store. Při vkládání dialogu ale rozložení ještě nemusí být hotové — první
  // měření vyjde pár pixelů, plátno zůstane 100 px široké a náhled se roztáhne
  // (nůž vyjde maličký, popisky mimo). ResizeObserver překreslí, jakmile plátno
  // dostane skutečnou velikost — a taky při změně velikosti okna. Zápis do
  // cv.width/height mění jen backing store, ne rozložení, takže se nezacyklí.
  let ro = null;

  function close() {
    if (ro) { ro.disconnect(); ro = null; }
    document.removeEventListener('keydown', onKeyDown);
    dlg.remove();
  }
  function onKeyDown(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKeyDown);
  dlg.addEventListener('click', e => { if (e.target === dlg) close(); });
  dlg.querySelector('[data-act="prev-close"]').addEventListener('click', close);

  // Popisky (b, l1, ε…) jako HTML spany nad canvasem — ostré a konstantně
  // velké bez ohledu na zoom (canvasový text by se zoomem rozmazal).
  function positionTexts(texts) {
    const wrap = dlg.querySelector('#mag-prev-wrap');
    if (!wrap) return;
    wrap.querySelectorAll('.geom-canvas-label').forEach(el => el.remove());
    texts.forEach(t => {
      const span = document.createElement('span');
      span.className = 'geom-canvas-label';
      const align = t.align || 'center';
      span.textContent = t.text;
      span.style.cssText = `position:absolute;left:${t.x * zoom + panX}px;top:${t.y * zoom + panY}px;`
        + `transform:translate(${align === 'center' ? '-50%' : align === 'right' ? '-100%' : '0'},-50%);`
        + `color:${t.color};font:11px sans-serif;white-space:nowrap;pointer-events:none;text-shadow:0 0 3px #1e1e2e,0 0 3px #1e1e2e`;
      wrap.appendChild(span);
    });
  }

  function redraw() {
    const cv = dlg.querySelector('#mag-prev-canvas');
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = cv.getBoundingClientRect();
    const cw = Math.max(Math.round(rect.width), 100), ch = Math.max(Math.round(rect.height), 120);
    if (cv.width !== cw * dpr || cv.height !== ch * dpr) { cv.width = cw * dpr; cv.height = ch * dpr; }
    const c = cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#1e1e2e'; c.fillRect(0, 0, cw, ch);
    c.translate(panX, panY); c.scale(zoom, zoom);
    // uiScale = 1/zoom → čáry zůstanou po přiblížení konstantně tenké.
    const res = drawInsertAndHolderPreview(c, cw, ch, prms, { uiScale: 1 / zoom });
    lastOrigin = (res && res.origin) || { x: cw / 2, y: ch / 2 };
    positionTexts((res && res.texts) || []);
  }

  function zoomBy(factor, cx, cy) {
    const old = zoom;
    zoom = Math.max(0.4, Math.min(12, zoom * factor));
    panX = cx - (cx - panX) * (zoom / old);
    panY = cy - (cy - panY) * (zoom / old);
    redraw();
  }

  // Tlačítka zoomují kolem ŠPIČKY DESTIČKY (origin z kresby), ne kolem středu
  // plátna: břit leží dole u kraje náhledu a při zoomu od středu by hned vyjel
  // z okna — zůstal by vidět jen dřík držáku.
  const zoomCenter = (factor) => {
    const c = dlg.querySelector('#mag-prev-canvas');
    const o = lastOrigin || { x: c.clientWidth / 2, y: c.clientHeight / 2 };
    zoomBy(factor, o.x * zoom + panX, o.y * zoom + panY);
  };
  dlg.querySelector('[data-act="prev-zoom-in"]').addEventListener('click', () => zoomCenter(1.3));
  dlg.querySelector('[data-act="prev-zoom-out"]').addEventListener('click', () => zoomCenter(1 / 1.3));
  dlg.querySelector('[data-act="prev-zoom-reset"]').addEventListener('click', () => { zoom = 1; panX = 0; panY = 0; redraw(); });

  const cv = dlg.querySelector('#mag-prev-canvas');
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  cv.addEventListener('pointerdown', (e) => {
    dragging = true; dragX = e.clientX; dragY = e.clientY;
    panStartX = panX; panStartY = panY;
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    panX = panStartX + (e.clientX - dragX);
    panY = panStartY + (e.clientY - dragY);
    redraw();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev =>
    cv.addEventListener(ev, () => { dragging = false; }));

  redraw();
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => redraw());
    ro.observe(cv);
  } else {
    requestAnimationFrame(redraw);   // fallback pro prohlížeč bez ResizeObserver
  }
}
