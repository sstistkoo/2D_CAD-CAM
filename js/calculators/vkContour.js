// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – VK (Volná kontura) – editor syntaxe volných prvků    ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Pomocník pro zápis konturových prvků se zčásti neznámými rozměry
// (obdoba Heidenhain FK – Free Kontur programming): úsečka/oblouk se
// zadá tím, co je známo (pravoúhle X/Z, polárně PA/PR k pólu VPOL, nebo
// „?" tam, kde je rozměr neznámý a dopočítá se jinde). Vygenerovaný
// zápis (G111/G11/G2/G3 + PA/PR/VPOL/T) je čistě textová pomůcka –
// needituje výkres, pouze pomáhá poskládat/zkontrolovat rozměrový
// řetězec před ručním dopočtem a případnou konverzí na standardní ISO.
//
// Sekce nápovědy (js/calculators/vkHelp.js) se vykresluje líně až při
// prvním rozbalení, aby se zbytečně nebudoval markup při každém otevření.

import { makeOverlay } from '../dialogFactory.js';
import { state, showToast } from '../state.js';
import { renderVkHelp } from './vkHelp.js';
import {
  elementRay, solveCornerLineLine, solveLineArcJunction, pickByVpolTag,
  tangentCircleTouchPoints, tangentCircleBetweenRays, pickBetweenRaysByVpolTag,
  twoTangentArcsBetweenRays, pickTwoArcsByVpolTag,
} from './vkSolver.js';

const DEFAULT_GCODE = '';

function polarDelta(paDeg, pr) {
  const paRad = ((paDeg % 360) + 360) % 360 * (Math.PI / 180);
  return { z: pr * Math.cos(paRad), x: pr * Math.sin(paRad) };
}

export function parseVkLine(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  const cmdMatch = trimmed.match(/^(G0|G111|G11|G2|G3)\b/);
  if (!cmdMatch) return null;
  const data = {
    cmd: cmdMatch[1],
    isArc: cmdMatch[1] === 'G2' || cmdMatch[1] === 'G3',
    x: null,
    z: null,
    pa: null,
    pr: null,
    r: null,
    isT: /\bT\b/.test(trimmed),
  };
  const re = /([A-Z]{1,4})(-?\d+(?:\.\d+)?|\?)/g;
  let match;
  while ((match = re.exec(trimmed)) !== null) {
    const key = match[1].toLowerCase();
    const raw = match[2];
    if (key === 'x' || key === 'z' || key === 'pa' || key === 'pr' || key === 'r') {
      data[key] = raw === '?' ? null : parseFloat(raw);
    }
  }
  if (/\bVPOL1\b/.test(trimmed)) data.vpolTag = 'VPOL1';
  else if (/\bVPOL2\b/.test(trimmed)) data.vpolTag = 'VPOL2';
  return data;
}

export function buildVkPreviewData(lines, draftSegment = null) {
  const rawLines = Array.isArray(lines) ? lines : String(lines || '').split(/\r?\n/);
  const parsed = rawLines.map(parseVkLine).filter(Boolean);
  const vpolEntry = parsed.find(entry => entry.cmd === 'G111') || null;
  const vpol = vpolEntry ? { x: vpolEntry.x ?? 0, z: vpolEntry.z ?? 0 } : null;
  const segments = [];
  let currentPoint = vpol ? { ...vpol } : null;
  let lastPoint = vpol ? { ...vpol } : null;
  let isFirstElement = true;

  for (const entry of parsed) {
    if (!entry || entry.cmd === 'G111') continue;
    let start = currentPoint ? { ...currentPoint } : (vpol ? { ...vpol } : null);
    let end = null;

    if (entry.x != null && entry.z != null && entry.pa != null && entry.pr != null && isFirstElement) {
      start = { x: entry.x, z: entry.z };
      const delta = polarDelta(entry.pa, entry.pr);
      end = { x: start.x + delta.x, z: start.z + delta.z };
    } else if (entry.x != null && entry.z != null && isFirstElement && entry.cmd === 'G0') {
      start = { x: entry.x, z: entry.z };
      end = { x: entry.x, z: entry.z };
    } else if (entry.x != null && entry.z != null) {
      end = { x: entry.x, z: entry.z };
    } else if (entry.pa != null && entry.pr != null && start) {
      const delta = polarDelta(entry.pa, entry.pr);
      end = { x: start.x + delta.x, z: start.z + delta.z };
    }

    if (!start && vpol) start = { ...vpol };
    if (!end && start) end = { ...start };

    if (start && end) {
      segments.push({
        type: entry.isArc ? 'arc' : 'line',
        start,
        end,
        radius: entry.r ?? null,
        direction: entry.cmd || 'G11',
      });
      currentPoint = end;
      lastPoint = end;
      isFirstElement = false;
    }
  }

  const points = [];
  if (vpol) points.push(vpol);
  segments.forEach(segment => {
    points.push(segment.start, segment.end);
  });

  const bounds = points.length > 0
    ? {
        minX: Math.min(...points.map(pt => pt.x)),
        maxX: Math.max(...points.map(pt => pt.x)),
        minZ: Math.min(...points.map(pt => pt.z)),
        maxZ: Math.max(...points.map(pt => pt.z)),
      }
    : {
        minX: -10,
        maxX: 10,
        minZ: -10,
        maxZ: 10,
      };

  if (draftSegment) {
    const start = draftSegment.start || (vpol ? { ...vpol } : null);
    const end = draftSegment.end || start;
    if (start && end) {
      segments.push({
        type: draftSegment.type || 'line',
        start: { ...start },
        end: { ...end },
        radius: draftSegment.radius ?? null,
        direction: draftSegment.direction || 'G11',
        isDraft: true,
      });
    }
  }

  const startPoint = segments.length > 0 ? segments[0].start : (vpol ? { ...vpol } : null);

  return { vpol, segments, bounds, draft: draftSegment || null, lastPoint, startPoint };
}

export function openVkContour() {
  // X může být zadáván v poloměru nebo průměru (☰ Nastavení → 📏 Zobrazení) –
  // popisky se přizpůsobí, ale vkSolver.js vždy počítá s poloměrem, takže se
  // hodnota při zadání/výstupu převádí přes toSolverX/fromSolverX níže.
  const xUnitLabel = state.xDisplayMode === 'diameter' ? 'Průměr' : 'Poloměr';
  const bodyHTML = `
    <div class="vk-canvas-wrapper">
      <canvas class="vk-canvas-placeholder" data-id="vk-canvas" width="440" height="120"></canvas>
      <div class="vk-canvas-label">Grafický náhled VK (připravujeme)</div>
    </div>

    <details class="sn-help-details vk-section" open>
      <summary class="sn-help-summary vk-summary-with-nav">
        <span class="vk-help-c-orange">🎯 2. Nový VK prvek</span>
        <span class="vk-summary-right">
          <span class="vk-nav-buttons">
            <button type="button" class="vk-nav-btn" data-act="nav-prev" title="Předchozí nedořešený prvek">◀</button>
            <span class="vk-nav-pos" data-id="nav-pos"></span>
            <button type="button" class="vk-nav-btn" data-act="nav-next" title="Další / nový prvek">▶</button>
          </span>
          <span class="vk-header-actions">
            <button type="button" class="vk-header-btn" data-act="element" data-id="element-btn" title="Vložit VK prvek">+</button>
            <button type="button" class="vk-header-btn vk-header-btn-red" data-act="remove-element" title="Odebrat VK prvek">−</button>
          </span>
        </span>
      </summary>
      <div class="sn-help-body vk-section-body">
        <div class="vk-section-title">Geometrie prvku:</div>
        <div class="vk-toggle-row">
          <button class="vk-toggle active" data-type="vl">VL (Úsečka)</button>
          <button class="vk-toggle" data-type="vkr">VKr (Oblouk)</button>
          <button class="vk-toggle" data-type="vpol">VPOL</button>
        </div>

        <div class="vk-arc-settings" data-arc-settings style="display:none">
          <div class="vk-toggle-row" style="margin-top:6px">
            <button class="vk-toggle active" data-dir="G2">G2 (po směru)</button>
            <button class="vk-toggle" data-dir="G3">G3 (proti směru)</button>
          </div>
          <div class="cnc-fields" style="margin-top:6px">
            <label class="cnc-field">
              <span>Poloměr zaoblení (R)</span>
              <div class="vk-input-row">
                <input type="text" data-id="val-r" value="5.0">
                <button class="vk-btn-q" data-toggle="val-r">❓</button>
              </div>
            </label>
          </div>
          <div class="cnc-fields" style="margin-top:6px" title="Jen pro esíčko (dva tečné oblouky za sebou) – bez toho by měla soustava o 1 stupeň volnosti víc, než kolik je zadáno">
            <label class="cnc-field">
              <span>Bod zlomu k dalšímu oblouku – osa</span>
              <select data-id="junction-axis">
                <option value="">— (netřeba)</option>
                <option value="z">Z</option>
                <option value="x">X (${xUnitLabel.toLowerCase()})</option>
              </select>
            </label>
            <label class="cnc-field">
              <span>Bod zlomu – hodnota</span>
              <input type="text" data-id="junction-value" placeholder="Např. 12.0">
            </label>
          </div>
        </div>

        <div class="vk-vpol-settings" data-vpol-settings style="display:none">
          <div class="vk-section-title vk-red">Definice pólu:</div>
          <div class="cnc-fields">
            <label class="cnc-field"><span class="vk-red">VPOL X (${xUnitLabel})</span><input type="text" class="vk-input-vpol" data-id="vpol-x" value="0.0"></label>
            <label class="cnc-field"><span class="vk-red">VPOL Z</span><input type="text" class="vk-input-vpol" data-id="vpol-z" value="40.0"></label>
          </div>

          <div class="vk-section-title vk-red">Konstrukční nástroje vyhledání průsečíku:</div>
          <div class="cnc-fields">
            <label class="cnc-field"><span>Konstrukční úhel (PA)</span><input type="text" data-id="vpol-pa" placeholder="Např. 45°"></label>
            <label class="cnc-field"><span>Hledat na rádiusu (R)</span><input type="text" data-id="vpol-arc" placeholder="Poloměr kružnice"></label>
          </div>
          <button class="vk-insert-btn vk-insert-red" data-act="vpol">Vložit VPOL</button>
        </div>

        <div class="vk-section-title" data-id="coords-title">Souřadnice počátečního bodu:</div>
        <div class="cnc-fields">
          <label class="cnc-field">
            <span data-id="x2-label">Start X1 (${xUnitLabel})</span>
            <div class="vk-input-row">
              <input type="text" data-id="val-x2" value="?" class="vk-input-unknown">
              <button class="vk-btn-q active" data-toggle="val-x2">❓</button>
            </div>
          </label>
          <label class="cnc-field">
            <span data-id="z2-label">Start Z1</span>
            <div class="vk-input-row">
              <input type="text" data-id="val-z2" value="?" class="vk-input-unknown">
              <button class="vk-btn-q active" data-toggle="val-z2">❓</button>
            </div>
          </label>
          <label class="cnc-field">
            <span>Polární úhel (PA)</span>
            <div class="vk-input-row">
              <input type="text" data-id="val-pa" value="?" class="vk-input-unknown">
              <button class="vk-btn-q active" data-toggle="val-pa">❓</button>
            </div>
          </label>
          <label class="cnc-field">
            <span>Délka (PR)</span>
            <div class="vk-input-row">
              <input type="text" data-id="val-pr" value="?" class="vk-input-unknown">
              <button class="vk-btn-q active" data-toggle="val-pr">❓</button>
            </div>
          </label>
        </div>

        <div class="vk-section-title" data-id="tangent-title">Návaznost drah:</div>
        <label class="vk-checkbox-row" data-id="tangent-row">
          <input type="checkbox" data-id="check-t">
          Tečné napojení na předchozí prvek (T)
        </label>
        <label class="cnc-field" title="Pokud má dopočet dvě řešení (např. netečné napojení na kružnici kolem VPOL), vyberte které se použije">
          <span>Dvojznačnost řešení</span>
          <select data-id="vpol-tag">
            <option value="">— (jednoznačné / nepočítat)</option>
            <option value="VPOL1">VPOL1 (blíž startu obrysu)</option>
            <option value="VPOL2">VPOL2 (dál od startu obrysu)</option>
          </select>
        </label>

        <div class="vk-solve-info" data-solve-info></div>
      </div>
    </details>

    <details class="sn-help-details vk-section" data-vk-help-details>
      <summary class="sn-help-summary"><span class="vk-help-c-green">❓ 3. Přehled syntaxe a možností VK</span></summary>
      <div class="sn-help-body vk-section-body" data-vk-help-container></div>
    </details>

    <div class="vk-gcode-box">
      <span>Generovaná VK syntaxe (lze upravit nebo smazat ručně):</span>
      <textarea class="vk-gcode-textarea" data-id="gcode">${DEFAULT_GCODE}</textarea>
    </div>

    <div class="vk-actions">
      <button class="vk-btn vk-btn-clear" data-act="clear">Smazat</button>
      <button class="vk-btn vk-btn-copy" data-act="copy">📋 Kopírovat</button>
      <button class="vk-btn vk-btn-convert" data-act="convert">Konvertovat na ISO G-kód</button>
    </div>
  `;

  const overlay = makeOverlay('vkcontour', '📐 VK – Volná kontura', bodyHTML, 'vk-window');
  if (!overlay) return;

  const q = (id) => overlay.querySelector(`[data-id="${id}"]`);
  const canvas = q('vk-canvas');
  const canvasLabel = overlay.querySelector('.vk-canvas-label');
  const gcodeEl = q('gcode');
  let canvasContext = null;
  let canvasSize = { width: 440, height: 140 };

  function ensureCanvas() {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, Math.round(rect.width || 440));
    const height = Math.max(140, Math.round(rect.height || 160));
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    canvasSize = { width, height };
    canvasContext = canvas.getContext('2d');
    canvasContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    return canvasContext;
  }

  function clearCanvas() {
    if (!canvasContext) return;
    canvasContext.clearRect(0, 0, canvasSize.width, canvasSize.height);
  }

  /**
   * Vypočítá layout VK canvasu: hranice (vždy obsahující [0,0]), měřítko,
   * pozici původku os a funkci projekce bodu do canvas pixelů.
   * Pro soustruh jsou osy prohozené (Z→vodorovně, X→svisle).
   */
  function computeCanvasLayout(previewData) {
    const { width, height } = canvasSize;
    const padding = 24;
    const isKarusel = state.machineType === 'karusel';
    const points = [];
    if (previewData.vpol) points.push(previewData.vpol);
    previewData.segments.forEach(segment => {
      points.push(segment.start, segment.end);
    });
    points.push({ x: 0, z: 0 });

    const bounds = points.length > 0 ? {
      minX: Math.min(...points.map(pt => pt.x)),
      maxX: Math.max(...points.map(pt => pt.x)),
      minZ: Math.min(...points.map(pt => pt.z)),
      maxZ: Math.max(...points.map(pt => pt.z)),
    } : { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };

    const spanX = Math.max(bounds.maxX - bounds.minX, 1);
    const spanZ = Math.max(bounds.maxZ - bounds.minZ, 1);
    const hSpan = isKarusel ? spanX : spanZ;
    const vSpan = isKarusel ? spanZ : spanX;
    const scale = Math.min((width - padding * 2) / hSpan, (height - padding * 2) / vSpan);

    let originCanvasX, originCanvasY;
    if (isKarusel) {
      originCanvasX = padding + (0 - bounds.minX) * scale;
      originCanvasY = height - padding;
    } else {
      originCanvasX = padding + (0 - bounds.minZ) * scale;
      originCanvasY = height - padding;
    }

    function project(point) {
      if (isKarusel) {
        return { x: originCanvasX + point.x * scale, z: originCanvasY - point.z * scale };
      }
      return { x: originCanvasX + point.z * scale, z: originCanvasY - point.x * scale };
    }

    return { isKarusel, scale, originCanvasX, originCanvasY, project, bounds };
  }

  function drawGrid(layout) {
    if (!canvasContext) return;
    const { width, height } = canvasSize;
    const isKarusel = state.machineType === 'karusel';
    const originX = layout ? layout.originCanvasX : 24;
    const originY = layout ? layout.originCanvasY : height - 24;
    canvasContext.save();
    canvasContext.strokeStyle = 'rgba(255,255,255,0.08)';
    canvasContext.lineWidth = 1;
    const step = 20;
    for (let x = 0; x <= width; x += step) {
      canvasContext.beginPath();
      canvasContext.moveTo(x, 0);
      canvasContext.lineTo(x, height);
      canvasContext.stroke();
    }
    for (let y = 0; y <= height; y += step) {
      canvasContext.beginPath();
      canvasContext.moveTo(0, y);
      canvasContext.lineTo(width, y);
      canvasContext.stroke();
    }

    canvasContext.strokeStyle = 'rgba(255,255,255,0.24)';
    canvasContext.lineWidth = 1.4;
    canvasContext.setLineDash([6, 6]);
    canvasContext.beginPath();
    canvasContext.moveTo(originX, 0);
    canvasContext.lineTo(originX, height);
    canvasContext.moveTo(0, originY);
    canvasContext.lineTo(width, originY);
    canvasContext.stroke();
    canvasContext.setLineDash([]);

    canvasContext.fillStyle = 'rgba(255,255,255,0.68)';
    canvasContext.font = '10px sans-serif';
    if (isKarusel) {
      canvasContext.fillText('Z', 8, 14);
      canvasContext.fillText('X', width - 14, height - 6);
    } else {
      canvasContext.fillText('X', 8, 14);
      canvasContext.fillText('Z', width - 14, height - 6);
    }
    canvasContext.restore();
  }

  function drawPlaceholder() {
    if (!canvasContext) return;
    const { width, height } = canvasSize;
    canvasContext.save();
    canvasContext.fillStyle = 'rgba(255,255,255,0.06)';
    canvasContext.beginPath();
    canvasContext.roundRect(18, 18, width - 36, height - 36, 12);
    canvasContext.fill();
    canvasContext.strokeStyle = 'rgba(255,255,255,0.16)';
    canvasContext.setLineDash([6, 6]);
    canvasContext.stroke();
    canvasContext.setLineDash([]);
    canvasContext.fillStyle = 'rgba(255,255,255,0.65)';
    canvasContext.font = '12px sans-serif';
    canvasContext.textAlign = 'center';
    canvasContext.fillText('Připraveno pro prototyp VK náhledu', width / 2, height / 2);
    canvasContext.restore();
  }
  function drawVkPreview(previewData, layout) {
    if (!canvasContext || !previewData || !layout) return;
    const { scale, isKarusel, project } = layout;

    canvasContext.save();
    canvasContext.strokeStyle = 'rgba(255,255,255,0.85)';
    canvasContext.lineWidth = 2.2;
    canvasContext.lineJoin = 'round';
    canvasContext.lineCap = 'round';

    if (previewData.vpol) {
      const p = project(previewData.vpol);
      canvasContext.beginPath();
      canvasContext.arc(p.x, p.z, 4.5, 0, Math.PI * 2);
      canvasContext.fillStyle = '#f38ba8';
      canvasContext.fill();
    }

    if (previewData.startPoint) {
      const sp = project(previewData.startPoint);
      canvasContext.beginPath();
      canvasContext.arc(sp.x, sp.z, 3.5, 0, Math.PI * 2);
      canvasContext.fillStyle = 'rgba(255,255,255,0.9)';
      canvasContext.fill();
      canvasContext.strokeStyle = 'rgba(255,255,255,0.5)';
      canvasContext.lineWidth = 1;
      canvasContext.stroke();
    }

    const draftSegment = previewData.draft;
    const hasDraft = Boolean(draftSegment && draftSegment.end);

    previewData.segments.forEach(segment => {
      const start = project(segment.start);
      const end = project(segment.end);
      if (segment.isDraft) {
        canvasContext.strokeStyle = 'rgba(245, 194, 231, 0.95)';
        canvasContext.setLineDash([6, 4]);
      } else {
        canvasContext.strokeStyle = 'rgba(255,255,255,0.85)';
        canvasContext.setLineDash([]);
      }
      if (segment.type === 'arc' && segment.radius) {
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const chordLen = Math.hypot(dx, dz);
        if (chordLen > 1e-3) {
          const radiusPx = Math.max(4, segment.radius * scale);
          const halfLen = chordLen / 2;
          const sagitta = Math.sqrt(Math.max(radiusPx * radiusPx - halfLen * halfLen, 0));
          const perpX = -dz / chordLen;
          const perpZ = dx / chordLen;
          const sign = (segment.direction === 'G3') === isKarusel ? 1 : -1;
          const centerX = (start.x + end.x) / 2 + sign * perpX * sagitta;
          const centerZ = (start.z + end.z) / 2 + sign * perpZ * sagitta;
          const startAngle = Math.atan2(start.z - centerZ, start.x - centerX);
          let endAngle = Math.atan2(end.z - centerZ, end.x - centerX);
          let delta = endAngle - startAngle;
          if (segment.direction === 'G3' && delta < 0) delta += Math.PI * 2;
          if (segment.direction !== 'G3' && delta > 0) delta -= Math.PI * 2;
          if (delta === 0) delta = Math.PI * 2;
          canvasContext.beginPath();
          canvasContext.arc(centerX, centerZ, radiusPx, startAngle, startAngle + delta);
          canvasContext.stroke();
        }
      } else {
        canvasContext.beginPath();
        canvasContext.moveTo(start.x, start.z);
        canvasContext.lineTo(end.x, end.z);
        canvasContext.stroke();
      }
      canvasContext.setLineDash([]);
    });
    canvasContext.restore();
  }

  function setCanvasLabelVisible(visible) {
    if (canvasLabel) {
      canvasLabel.style.opacity = visible ? '1' : '0';
      canvasLabel.style.visibility = visible ? 'visible' : 'hidden';
    }
  }

  function getDraftSegment() {
    const xRaw = q('val-x2')?.value;
    const zRaw = q('val-z2')?.value;
    const x = xRaw != null && xRaw !== '?' && xRaw.trim() !== '' ? parseFloat(xRaw) : null;
    const z = zRaw != null && zRaw !== '?' && zRaw.trim() !== '' ? parseFloat(zRaw) : null;
    const value = gcodeEl ? gcodeEl.value : '';
    const previewData = buildVkPreviewData(value);
    const baseStart = previewData.lastPoint || {
      x: q('vpol-x')?.value ? parseFloat(q('vpol-x').value) || 0 : 0,
      z: q('vpol-z')?.value ? parseFloat(q('vpol-z').value) || 0 : 0,
    };
    const hasLiveDraftValues = x != null || z != null || q('val-pa')?.value?.trim() !== '' || q('val-pr')?.value?.trim() !== '';
    if (!hasLiveDraftValues) return null;

    const paRaw = q('val-pa')?.value;
    const prRaw = q('val-pr')?.value;
    const pa = paRaw != null && paRaw !== '?' && paRaw.trim() !== '' ? parseFloat(paRaw) : null;
    const pr = prRaw != null && prRaw !== '?' && prRaw.trim() !== '' ? parseFloat(prRaw) : null;
    const end = pa != null && pr != null
      ? {
          x: baseStart.x + pr * Math.sin((pa * Math.PI) / 180),
          z: baseStart.z + pr * Math.cos((pa * Math.PI) / 180),
        }
      : { x: x ?? baseStart.x, z: z ?? baseStart.z };

    return {
      type: currentType === 'vkr' ? 'arc' : 'line',
      start: { x: baseStart.x, z: baseStart.z },
      end,
      direction: arcDir,
      radius: q('val-r')?.value ? parseFloat(q('val-r').value) : null,
    };
  }

  function renderVkCanvas() {
    ensureCanvas();
    clearCanvas();
    const value = gcodeEl ? gcodeEl.value : '';
    const draftSegment = getDraftSegment();
    const previewData = buildVkPreviewData(value, draftSegment);
    const hasData = Boolean(previewData.vpol || previewData.segments.length);
    if (!hasData) {
      drawGrid(null);
      drawPlaceholder();
      setCanvasLabelVisible(true);
      return;
    }
    const layout = computeCanvasLayout(previewData);
    drawGrid(layout);
    drawVkPreview(previewData, layout);
    setCanvasLabelVisible(false);
    canvasContext.save();
    canvasContext.fillStyle = 'rgba(255,255,255,0.55)';
    canvasContext.font = '10px sans-serif';
    canvasContext.fillText('náhled: VK / draft', 12, canvasSize.height - 8);
    if (draftSegment) {
      canvasContext.fillStyle = 'rgba(245, 194, 231, 0.95)';
      canvasContext.fillText('● live draft', canvasSize.width - 80, canvasSize.height - 8);
      canvasContext.beginPath();
      canvasContext.arc(canvasSize.width - 88, canvasSize.height - 10, 3, 0, Math.PI * 2);
      canvasContext.fill();
    } else {
      canvasContext.fillStyle = 'rgba(255,255,255,0.55)';
      canvasContext.fillText('● ready', canvasSize.width - 64, canvasSize.height - 8);
    }
    canvasContext.restore();
  }

  let renderFrame = null;

  function scheduleRender() {
    if (renderFrame != null) return;
    renderFrame = window.requestAnimationFrame(() => {
      renderFrame = null;
      renderVkCanvas();
    });
  }

  overlay.querySelectorAll('.vk-input-row input').forEach(input => {
    input.addEventListener('focus', () => {
      if (input.classList.contains('vk-input-unknown') && input.value === '?') {
        input.value = '';
        input.classList.remove('vk-input-unknown');
      }
    });
    input.addEventListener('blur', () => {
      if (input.value.trim() === '') {
        input.value = '?';
        input.classList.add('vk-input-unknown');
      }
    });
  });

  let currentType = 'vl';
  let arcDir = 'G2';

  // ── Lazy nápověda ──
  const helpDetails = overlay.querySelector('[data-vk-help-details]');
  const helpContainer = overlay.querySelector('[data-vk-help-container]');
  helpDetails.addEventListener('toggle', () => {
    if (helpDetails.open && !helpContainer.dataset.loaded) {
      helpContainer.innerHTML = renderVkHelp();
      helpContainer.dataset.loaded = '1';
    }
  });

  // ── VL / VKr / VPOL přepínač ──
  const arcSettings = overlay.querySelector('[data-arc-settings]');
  const vpolSettings = overlay.querySelector('[data-vpol-settings]');
  overlay.querySelectorAll('[data-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentType = btn.dataset.type;
      overlay.querySelectorAll('[data-type]').forEach(b => b.classList.toggle('active', b === btn));
      arcSettings.style.display = currentType === 'vkr' ? 'block' : 'none';
      vpolSettings.style.display = currentType === 'vpol' ? 'block' : 'none';
      renderVkCanvas();
    });
  });

  // ── G2 / G3 přepínač ──
  overlay.querySelectorAll('[data-dir]').forEach(btn => {
    btn.addEventListener('click', () => {
      arcDir = btn.dataset.dir;
      overlay.querySelectorAll('[data-dir]').forEach(b => b.classList.toggle('active', b === btn));
      renderVkCanvas();
    });
  });

  // ── ❓ přepínač neznámé hodnoty ──
  overlay.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = q(btn.dataset.toggle);
      const isUnknown = input.value === '?';
      if (isUnknown) {
        input.value = '';
        input.classList.remove('vk-input-unknown');
        btn.classList.remove('active');
        input.focus();
      } else {
        input.value = '?';
        input.classList.add('vk-input-unknown');
        btn.classList.add('active');
      }
      scheduleRender();
    });
  });

  // ── Generovaná syntaxe ──
  const convertBtn = overlay.querySelector('[data-act="convert"]');
  const solveInfo = overlay.querySelector('[data-solve-info]');
  const ORIGINAL_CONVERT_LABEL = 'Konvertovat na ISO G-kód';
  let conversionBackup = null;

  function resetConvertState() {
    convertBtn.classList.remove('vk-error-state', 'vk-success-state');
  }

  function resetConversionBackup() {
    conversionBackup = null;
    convertBtn.textContent = ORIGINAL_CONVERT_LABEL;
  }

  function restoreOriginalVkCode() {
    if (conversionBackup == null) return false;
    gcodeEl.value = conversionBackup;
    conversionBackup = null;
    resetConvertState();
    convertBtn.textContent = ORIGINAL_CONVERT_LABEL;
    return true;
  }

  function appendCode(line) {
    gcodeEl.value = gcodeEl.value.trim() === '' ? line : `${gcodeEl.value}\n${line}`;
    resetConvertState();
    resetConversionBackup();
  }

  function fmt(n) {
    return String(Math.round(n * 1000) / 1000);
  }

  // vkSolver.js vždy počítá s X jako průměrem (uvnitř dělí /2 na poloměr).
  // Appka ale může mít aktuálně nastavený režim zadávání na poloměr
  // (☰ Nastavení → 📏 Zobrazení, `state.xDisplayMode`) – v tom případě
  // je zadaná hodnota už poloměr a je potřeba ji před voláním solveru
  // vynásobit 2 (a výsledek zpět vydělit), aby geometrie seděla.
  function toSolverX(val) {
    return state.xDisplayMode === 'diameter' ? val : val * 2;
  }
  function fromSolverX(val) {
    return state.xDisplayMode === 'diameter' ? val : val / 2;
  }

  // ── Řetězec prvků pro dopočet neznámých (kategorie 1, 2, 3 a 4) ──
  // startPoint/vpolPoint/lastPoint/anchor a el.x jsou VŽDY v solver-
  // prostoru (X jako průměr, viz toSolverX výše) – el.xRaw drží
  // originální zobrazovanou hodnotu jen pro sestavení textu řádku.
  // pendingQueue drží 0–3 nedořešené prvky čekající na dopočet:
  //   [] – vše vyřešeno
  //   [A]      – kategorie 1 (A i nový prvek přímka/kužel) nebo kategorie 2
  //              case 5 (A přímka/kužel, nový prvek oblouk s T) / kategorie 4
  //              case 12-13 (A nebo nový prvek oblouk bez T, kolem VPOL)
  //   [A, B]   – B musí být oblouk s T (kategorie 2, case 6-8: A i nový
  //              prvek jsou přímka/kužel, B mezi nimi tečný o poloměru B.r)
  //   [A, B, C] – B i C musí být oblouky s T (kategorie 3, case 9-11:
  //              esíčko – vyžaduje na C znalost bodu zlomu, viz `junction`)
  let startPoint = null;
  let vpolPoint = null;
  let lastPoint = null;   // konec posledního VYŘEŠENÉHO prvku
  let pendingQueue = [];  // prvky { isArc, isT, x,z,pa,r, vpolTag, anchor, lineText, wasFirstEver, dir, prRaw }
  let firstElement = null; // první vložený prvek (počáteční bod), viditelný v navigaci
  let chainStarted = false; // false, dokud nebyl vložen počáteční bod (i jako "?")
  let cursor = null;      // index do pendingQueue, nebo -1 = firstElement, null = nové zadání

  /** Nastaví pole na „?" (neznámé) nebo na konkrétní hodnotu – sdíleno mezi ❓ přepínačem a načtením prvku. */
  function setUnknownField(id, val) {
    const input = q(id);
    const btn = overlay.querySelector(`[data-toggle="${id}"]`);
    if (val == null) {
      input.value = '?';
      input.classList.add('vk-input-unknown');
      btn.classList.add('active');
    } else {
      input.value = val;
      input.classList.remove('vk-input-unknown');
      btn.classList.remove('active');
    }
  }

  /** Načte uložený nedořešený prvek zpět do formuláře (pro prohlížení/úpravu přes ◀ ▶). */
  function loadElementIntoForm(el) {
    currentType = el.isArc ? 'vkr' : 'vl';
    overlay.querySelectorAll('[data-type]').forEach(b => b.classList.toggle('active', b.dataset.type === currentType));
    arcSettings.style.display = currentType === 'vkr' ? 'block' : 'none';
    vpolSettings.style.display = currentType === 'vpol' ? 'block' : 'none';
    if (el.isArc) {
      arcDir = el.dir || 'G2';
      overlay.querySelectorAll('[data-dir]').forEach(b => b.classList.toggle('active', b.dataset.dir === arcDir));
    }
    setUnknownField('val-x2', el.xRaw);
    setUnknownField('val-z2', el.z);
    setUnknownField('val-pa', el.pa);
    setUnknownField('val-pr', el.prRaw != null ? el.prRaw : null);
    q('val-r').value = el.r;
    q('check-t').checked = el.isT;
    q('vpol-tag').value = el.vpolTag || '';
    q('junction-axis').value = el.junction ? el.junction.axis : '';
    q('junction-value').value = el.junction ? el.junction.rawValue : '';
  }

  /** Vrátí formulář na výchozí hodnoty pro zadání nového prvku. */
  function resetFormToNewEntry() {
    currentType = 'vl';
    overlay.querySelectorAll('[data-type]').forEach(b => b.classList.toggle('active', b.dataset.type === 'vl'));
    arcSettings.style.display = 'none';
    vpolSettings.style.display = 'none';
    arcDir = 'G2';
    overlay.querySelectorAll('[data-dir]').forEach(b => b.classList.toggle('active', b.dataset.dir === 'G2'));
    setUnknownField('val-x2', null);
    setUnknownField('val-z2', null);
    setUnknownField('val-pa', null);
    setUnknownField('val-pr', null);
    q('val-r').value = '5.0';
    q('check-t').checked = false;
    q('vpol-tag').value = '';
    q('junction-axis').value = '';
    q('junction-value').value = '';
  }

  function updateFormMode() {
    const editingItem = cursor === -1 ? firstElement : (cursor !== null ? pendingQueue[cursor] : null);
    const first = editingItem ? editingItem.wasFirstEver : !chainStarted;
    q('coords-title').textContent = first
      ? 'Souřadnice počátečního bodu:'
      : 'Cílové souřadnice (X/Z nebo PA/PR k pólu):';
    q('x2-label').textContent = `${first ? 'Start X1' : 'Cíl X2'} (${xUnitLabel})`;
    q('z2-label').textContent = first ? 'Start Z1' : 'Cíl Z2';
    q('tangent-title').style.display = first ? 'none' : '';
    q('tangent-row').style.display = first ? 'none' : '';
    const elementBtn = q('element-btn');
    if (elementBtn) {
      elementBtn.textContent = editingItem ? '✓' : '+';
      elementBtn.title = editingItem ? 'Uložit úpravu VK prvku' : (first ? 'Vložit počáteční bod' : 'Přidat VK prvek');
    }
    const totalCount = pendingQueue.length + (firstElement ? 1 : 0);
    if (editingItem) {
      const position = cursor === -1 ? 1 : cursor + (firstElement ? 2 : 1);
      q('nav-pos').textContent = `${position}/${totalCount}`;
    } else {
      q('nav-pos').textContent = pendingQueue.length || firstElement ? 'nový' : '';
    }
  }
  updateFormMode();

  function refPoint() { return startPoint || lastPoint; }

  function pickOrThrow(points, tag) {
    if (points.length === 0) throw new Error('žádné řešení (mimo dosah)');
    if (points.length === 1) return points[0];
    if (!tag) throw new Error('dvě možná řešení – zvolte VPOL1 nebo VPOL2');
    return pickByVpolTag(points, refPoint(), tag);
  }

  /** Dopočet přesně jednoho nedořešeného prvku (kategorie 1, nebo 2/4 se 2 prvky). */
  function resolveOne(prevEl, currEl) {
    if (!prevEl.isArc && !currEl.isArc) {
      return { [prevEl.id]: solveCornerLineLine(prevEl.anchor, prevEl, currEl) };
    }
    if (prevEl.isArc && currEl.isArc) throw new Error('dva oblouky za sebou zatím nejsou podporované (kategorie 3)');
    // jedna strana je oblouk – T rozlišuje tečné (kat. 2, case 5) od netečného kolem VPOL (kat. 4)
    if (currEl.isArc && currEl.isT) {
      // case 5: přímka/kužel (prevEl, „?") → oblouk (currEl, ZNÁMÝ konec + R), tečně
      const ray = elementRay(prevEl, prevEl.anchor);
      const pts = tangentCircleTouchPoints(ray, { z: currEl.z, x: currEl.x }, currEl.r);
      return { [prevEl.id]: pickOrThrow(pts, currEl.vpolTag) };
    }
    if (prevEl.isArc && prevEl.isT) {
      throw new Error('tečný oblouk jako první prvek řetězu (bez předchozí přímky) zatím není podporovaný');
    }
    if (!vpolPoint) throw new Error('nejprve vlož VPOL (netečný oblouk se počítá kolem VPOL)');
    if (prevEl.isArc) {
      const ray = elementRay(currEl, { z: currEl.z, x: currEl.x });
      return { [prevEl.id]: solveLineArcJunction(ray, vpolPoint, prevEl.r, refPoint(), currEl.vpolTag) };
    }
    const ray = elementRay(prevEl, prevEl.anchor);
    return { [prevEl.id]: solveLineArcJunction(ray, vpolPoint, currEl.r, refPoint(), currEl.vpolTag) };
  }

  /** Dopočet dvou nedořešených prvků najednou (kategorie 2, case 6-8: A, oblouk B, pak známý currEl). */
  function resolveTwo(elA, elB, currEl) {
    if (!elB.isArc) throw new Error('prostřední prvek musí být oblouk');
    if (elA.isArc) throw new Error('dva oblouky za sebou zatím nejsou podporované (kategorie 3)');
    const ray1 = elementRay(elA, elA.anchor);
    const ray2 = elementRay(currEl, { z: currEl.z, x: currEl.x });
    const candidates = tangentCircleBetweenRays(ray1, ray2, elB.r);
    if (candidates.length === 0) throw new Error('žádné řešení (přímky/kužely se s daným R nedají tečně spojit)');
    const pick = candidates.length === 1 ? candidates[0]
      : (currEl.vpolTag ? pickBetweenRaysByVpolTag(candidates, refPoint(), currEl.vpolTag)
        : (() => { throw new Error('dvě možná řešení – zvolte VPOL1 nebo VPOL2'); })());
    return { [elA.id]: pick.foot1, [elB.id]: pick.foot2 };
  }

  /** Dopočet tří nedořešených prvků najednou (kategorie 3, case 9-11: A, oblouk1, oblouk2, pak známý currEl). */
  function resolveThree(elA, arc1, arc2, currEl) {
    if (!arc1.isArc || !arc2.isArc) throw new Error('prostřední dva prvky musí být oblouky (esíčko)');
    if (elA.isArc) throw new Error('první prvek řetězu musí být přímka/kužel');
    if (!arc2.junction) throw new Error('u druhého oblouku chybí „Bod zlomu" (osa + hodnota) – bez něj má esíčko víc řešení, než kolik je zadáno');
    const ray1 = elementRay(elA, elA.anchor);
    const ray2 = elementRay(currEl, { z: currEl.z, x: currEl.x });
    const candidates = twoTangentArcsBetweenRays(ray1, ray2, arc1.r, arc2.r, arc2.junction);
    if (candidates.length === 0) throw new Error('žádné řešení (s danými poloměry a bodem zlomu nejde esíčko sestavit)');
    const pick = candidates.length === 1 ? candidates[0]
      : (currEl.vpolTag ? pickTwoArcsByVpolTag(candidates, refPoint(), currEl.vpolTag)
        : (() => { throw new Error('víc možných řešení – zvolte VPOL1 nebo VPOL2'); })());
    return { [elA.id]: pick.foot1, [arc1.id]: pick.junction, [arc2.id]: pick.foot2 };
  }

  // Kotva paprsku počátečního bodu (žádný předchozí prvek neexistuje):
  // elementRay bere pro rovnoběžný-s-osou směr POZICI z kotvy, ne z
  // el.x/z samotného, takže se kotva musí poskládat z toho, co je na
  // SAMOTNÉM počátečním bodě známé – chybějící souřadnici (relevantní
  // jen když je navíc zadané PA, jinak nezáleží) doplní VPOL.
  function firstElementAnchor(el) {
    return {
      z: el.z != null ? el.z : (vpolPoint ? vpolPoint.z : 0),
      x: el.x != null ? el.x : (vpolPoint ? vpolPoint.x : 0),
    };
  }

  function patchLine(el, pt) {
    let patched = el.lineText;
    if (patched.includes('X?')) patched = patched.replace('X?', `X${fmt(fromSolverX(pt.x))}`);
    if (patched.includes('Z?')) patched = patched.replace('Z?', `Z${fmt(pt.z)}`);
    gcodeEl.value = gcodeEl.value.replace(el.lineText, patched);
    el.lineText = patched;
    resetConversionBackup();
  }

  let nextElId = 1;

  function resetChain() {
    startPoint = null; vpolPoint = null; lastPoint = null; pendingQueue = []; firstElement = null; nextElId = 1;
    chainStarted = false; cursor = null;
    solveInfo.textContent = '';
    updateFormMode();
    renderVkCanvas();
  }

  overlay.querySelector('[data-act="nav-prev"]').addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (pendingQueue.length === 0 && !firstElement) return;
    if (cursor === null) {
      cursor = pendingQueue.length > 0 ? pendingQueue.length - 1 : -1;
    } else if (cursor > 0) {
      cursor -= 1;
    } else if (cursor === 0) {
      cursor = firstElement ? -1 : 0;
    }
    if (cursor === -1) loadElementIntoForm(firstElement);
    else loadElementIntoForm(pendingQueue[cursor]);
    solveInfo.textContent = '';
    updateFormMode();
  });

  overlay.querySelector('[data-act="nav-next"]').addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (cursor === null) return;
    if (cursor === -1) {
      cursor = pendingQueue.length > 0 ? 0 : null;
      if (cursor === null) { resetFormToNewEntry(); updateFormMode(); return; }
      loadElementIntoForm(pendingQueue[cursor]);
    } else {
      cursor += 1;
      if (cursor >= pendingQueue.length) { cursor = null; resetFormToNewEntry(); }
      else loadElementIntoForm(pendingQueue[cursor]);
    }
    solveInfo.textContent = '';
    updateFormMode();
    renderVkCanvas();
  });

  overlay.querySelector('[data-act="remove-element"]').addEventListener('click', () => {
    if (cursor === null && pendingQueue.length === 0) { solveInfo.textContent = 'Není co odebrat.'; return; }
    if (cursor === -1) {
      if (!firstElement) { solveInfo.textContent = 'Není co odebrat.'; return; }
      gcodeEl.value = gcodeEl.value.split('\n').filter(l => l !== firstElement.lineText).join('\n');
      firstElement = null;
    } else {
      const idx = cursor !== null ? cursor : pendingQueue.length - 1;
      if (idx < 0 || idx >= pendingQueue.length) { solveInfo.textContent = 'Není co odebrat.'; return; }
      const [removed] = pendingQueue.splice(idx, 1);
      gcodeEl.value = gcodeEl.value.split('\n').filter(l => l !== removed.lineText).join('\n');
      if (removed.wasFirstEver && lastPoint === null) chainStarted = false;
    }
    cursor = null;
    resetFormToNewEntry();
    solveInfo.textContent = 'Odebráno';
    updateFormMode();
    renderVkCanvas();
  });

  overlay.querySelector('[data-act="vpol"]').addEventListener('click', () => {
    const vx = q('vpol-x').value, vz = q('vpol-z').value;
    const vpa = q('vpol-pa').value, varc = q('vpol-arc').value;
    vpolPoint = { z: parseFloat(vz) || 0, x: toSolverX(parseFloat(vx) || 0) };
    let line = `G111 X${vx} Z${vz}`;
    if (vpa) line += ` PA${vpa}`;
    if (varc) line += ` R${varc}`;
    appendCode(line);
    renderVkCanvas();
  });

  overlay.querySelector('[data-act="element"]').addEventListener('click', () => {
    const editingIndex = cursor;
    const isFirstEver = editingIndex === -1
      ? true
      : (editingIndex !== null ? pendingQueue[editingIndex].wasFirstEver : (pendingQueue.length === 0 && lastPoint === null));
    const xStr = q('val-x2').value, zStr = q('val-z2').value;
    const paStr = q('val-pa').value, prStr = q('val-pr').value;
    const rStr = q('val-r').value;
    const isTChecked = !isFirstEver && q('check-t').checked; // na počátečním bodě není na co se tečně napojit
    const vpolTag = q('vpol-tag').value || null;
    const cmd = currentType === 'vpol' ? 'G111' : (isFirstEver && currentType === 'vl' ? 'G0' : (currentType === 'vl' ? 'G11' : arcDir));
    const junctionAxis = q('junction-axis').value || null;
    const junctionValStr = q('junction-value').value;

    const xRaw = xStr === '?' || xStr.trim() === '' ? null : parseFloat(xStr);
    const el = {
      id: nextElId++,
      isArc: currentType === 'vkr',
      isT: isTChecked,
      dir: currentType === 'vkr' ? arcDir : null,
      xRaw,                                          // pro text (zobrazovaná jednotka)
      x: xRaw == null ? null : toSolverX(xRaw),       // pro geometrii (vkSolver = vždy průměr)
      z: zStr === '?' || zStr.trim() === '' ? null : parseFloat(zStr),
      pa: (paStr === '?' || paStr.trim() === '') ? null : parseFloat(paStr),
      prRaw: prStr === '?' || prStr.trim() === '' ? null : prStr,
      r: parseFloat(rStr) || 0,
      vpolTag,
      junction: (junctionAxis && junctionValStr.trim() !== '')
        ? {
          axis: junctionAxis,
          rawValue: junctionValStr,
          value: junctionAxis === 'x' ? toSolverX(parseFloat(junctionValStr)) : parseFloat(junctionValStr),
        }
        : null,
      wasFirstEver: isFirstEver,
    };

    let line = `${cmd} X${xStr === '?' ? '?' : xRaw} Z${zStr === '?' ? '?' : el.z}`;
    if (el.pa != null) line += ` PA${el.pa}`;
    if (prStr !== '?' && prStr.trim() !== '') line += ` PR${prStr}`;
    if (el.isArc) line += ` R${el.r}`;
    if (vpolTag) line += ` ${vpolTag}`;
    if (isTChecked) line += ' T';

    solveInfo.textContent = '';
    const isKnown = el.x != null && el.z != null;

    if (isFirstEver && !isKnown && el.pa != null && !vpolPoint) {
      solveInfo.textContent = '⚠ Pro počáteční bod se zadaným úhlem (PA) nejdřív vlož VPOL – jinak nemá úhel od čeho měřit.';
      return;
    }

    // ── Úprava existujícího nedořešeného prvku (přes ◀ ▶) ──
    if (editingIndex !== null) {
      if (isKnown) {
        solveInfo.textContent = '⚠ Úpravou by se prvek stal plně známým – k tomu ho nejdřív odeberte (➖) a vložte znovu jako nový.';
        return;
      }
      if (editingIndex === -1) {
        const old = firstElement;
        el.id = old.id;
        el.anchor = firstElementAnchor(el);
        el.lineText = line;
        gcodeEl.value = gcodeEl.value.replace(old.lineText, line);
        firstElement = el;
        cursor = null;
        resetFormToNewEntry();
        solveInfo.textContent = '✓ Prvek upraven.';
        updateFormMode();
        return;
      }
      const old = pendingQueue[editingIndex];
      el.id = old.id;
      el.anchor = el.wasFirstEver ? firstElementAnchor(el) : old.anchor;
      el.lineText = line;
      gcodeEl.value = gcodeEl.value.replace(old.lineText, line);
      pendingQueue[editingIndex] = el;
      cursor = null;
      resetFormToNewEntry();
      solveInfo.textContent = '✓ Prvek upraven.';
      updateFormMode();
      return;
    }

    if (isKnown && pendingQueue.length > 0) {
      try {
        let solved;
        if (pendingQueue.length === 1) solved = resolveOne(pendingQueue[0], el);
        else if (pendingQueue.length === 2) solved = resolveTwo(pendingQueue[0], pendingQueue[1], el);
        else solved = resolveThree(pendingQueue[0], pendingQueue[1], pendingQueue[2], el);
        const parts = [];
        for (const item of pendingQueue) {
          const pt = solved[item.id];
          patchLine(item, pt);
          parts.push(`Z${fmt(pt.z)} X${fmt(fromSolverX(pt.x))}`);
        }
        lastPoint = solved[pendingQueue[pendingQueue.length - 1].id];
        solveInfo.textContent = `✓ Dopočteno: ${parts.join(' | ')}`;
        pendingQueue = [];
      } catch (err) {
        solveInfo.textContent = `⚠ Nelze dopočítat: ${err.message}`;
      }
    }

    el.lineText = line;
    appendCode(line);

    if (isFirstEver) {
      firstElement = el;
    }

    if (isKnown) {
      lastPoint = { z: el.z, x: el.x };
      pendingQueue = [];
    } else {
      el.anchor = lastPoint ? { ...lastPoint } : firstElementAnchor(el);
      pendingQueue.push(el);
      if (pendingQueue.length > 3) pendingQueue.shift(); // jen poslední 3 se dopočítávají (kat. 3 = A + 2 oblouky)
    }

    if (startPoint === null && lastPoint !== null) startPoint = { ...lastPoint };
    chainStarted = true;
    cursor = null;
    resetFormToNewEntry();
    updateFormMode();
    renderVkCanvas();
  });

  overlay.querySelector('[data-act="clear"]').addEventListener('click', () => {
    gcodeEl.value = '';
    resetConvertState();
    resetConversionBackup();
    resetChain();
  });

  overlay.querySelector('[data-act="copy"]').addEventListener('click', () => {
    if (!gcodeEl.value.trim()) return;
    navigator.clipboard.writeText(gcodeEl.value).then(() => showToast('Zkopírováno'));
  });

  gcodeEl.addEventListener('input', scheduleRender);
  overlay.addEventListener('input', (event) => {
    if (event.target.matches('input, select, textarea')) {
      scheduleRender();
    }
  });
  window.addEventListener('resize', scheduleRender);
  scheduleRender();

  convertBtn.addEventListener('click', () => {
      if (restoreOriginalVkCode()) {
        showToast('Obnoveno původní VK syntaxe');
        return;
      }
      conversionBackup = gcodeEl.value;
      convertBtn.textContent = 'Obnovit VK syntaxi';
      const D2R = Math.PI / 180;

    function parseVkLine(text) {
      const cmdMatch = text.trim().match(/^(G0|G111|G11|G2|G3)\b/);
      if (!cmdMatch) return null;
      const data = { cmd: cmdMatch[1], text, isArc: cmdMatch[1] === 'G2' || cmdMatch[1] === 'G3' };
      const re = /([A-Z]{1,4})(-?\d+(?:\.\d+)?|\?)/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        const key = m[1].toLowerCase();
        const val = m[2];
        data[key] = val === '?' ? null : parseFloat(val);
      }
      data.isT = /\bT\b/.test(text);
      if (/\bVPOL1\b/.test(text)) data.vpolTag = 'VPOL1';
      else if (/\bVPOL2\b/.test(text)) data.vpolTag = 'VPOL2';
      return data;
    }

    function normalizeAngle(deg) {
      return ((deg % 360) + 360) % 360;
    }

    function polarDelta(paDeg, pr) {
      const paRad = normalizeAngle(paDeg) * D2R;
      return { z: pr * Math.cos(paRad), x: pr * Math.sin(paRad) };
    }

    function lineDirection(el) {
      if (el.pa != null) return normalizeAngle(el.pa);
      if (el.start && el.end) {
        const dz = el.end.z - el.start.z;
        const dx = el.end.x - el.start.x;
        if (Math.hypot(dz, dx) < 1e-9) return null;
        return normalizeAngle(Math.atan2(dx, dz) / D2R);
      }
      return null;
    }

    function vectorFromAngle(angleDeg) {
      return { z: Math.cos(angleDeg * D2R), x: Math.sin(angleDeg * D2R) };
    }

    function arcNormal(angleDeg, cmd) {
      const v = vectorFromAngle(angleDeg);
      return cmd === 'G2' ? { z: -v.x, x: v.z } : { z: v.x, x: -v.z };
    }

    function computeArcEnd(start, dirStart, dirEnd, radius, cmd) {
      const n1 = arcNormal(dirStart, cmd);
      const n2 = arcNormal(dirEnd, cmd);
      return {
        z: start.z + n1.z * radius - n2.z * radius,
        x: start.x + n1.x * radius - n2.x * radius,
      };
    }

    function replaceUnknownXY(text, point) {
      return text.replace(/X\?/, `X${fmt(point.x)}`).replace(/Z\?/, `Z${fmt(point.z)}`);
    }

    function resolvePAprLine(text, fromPoint) {
      if (!/X\?/.test(text) || !/Z\?/.test(text)) return null;
      const paMatch = text.match(/PA(-?\d+(?:\.\d+)?)/);
      const prMatch = text.match(/PR(-?\d+(?:\.\d+)?)/);
      if (!paMatch || !prMatch || fromPoint == null) return null;
      const delta = polarDelta(parseFloat(paMatch[1]), parseFloat(prMatch[1]));
      const pt = { z: fromPoint.z + delta.z, x: fromPoint.x + delta.x };
      return {
        resolved: text.replace(/X\?/, `X${fmt(pt.x)}`).replace(/Z\?/, `Z${fmt(pt.z)}`),
        pt,
      };
    }

    function buildElementChain(lines) {
      const parsed = lines.map((line) => parseVkLine(line));
      let cur = null;
      let elementIndex = 0;
      for (const el of parsed) {
        if (!el || el.cmd === 'G111') continue;
        const isFirstElement = elementIndex === 0;
        elementIndex += 1;

        if (el.isArc) {
          if (cur) {
            el.start = cur;
            cur = null;
          }
          continue;
        }

        if (!cur && isFirstElement && el.x != null && el.z != null && el.pa != null && el.pr != null) {
          el.start = { z: el.z, x: el.x };
          const delta = polarDelta(el.pa, el.pr);
          el.end = { z: el.start.z + delta.z, x: el.start.x + delta.x };
          cur = el.end;
          continue;
        }

        if (cur && el.pa != null && el.pr != null) {
          el.start = cur;
          const delta = polarDelta(el.pa, el.pr);
          el.end = { z: cur.z + delta.z, x: cur.x + delta.x };
          cur = el.end;
          continue;
        }

        if (el.x != null && el.z != null) {
          if (cur) {
            el.start = cur;
          } else if (el.pa != null && el.pr != null) {
            const delta = polarDelta(el.pa, el.pr);
            el.start = { z: el.z - delta.z, x: el.x - delta.x };
          }
          el.end = { z: el.z, x: el.x };
          cur = el.end;
          continue;
        }

        el.start = cur;
        cur = null;
      }
      return parsed;
    }

    const rawLines = gcodeEl.value.split('\n');
    let updated = [...rawLines];
    let progress = true;
    while (progress) {
      progress = false;
      const parsedCurrent = buildElementChain(updated);
      for (let i = 1; i + 1 < parsedCurrent.length; i++) {
        const prev = parsedCurrent[i - 1];
        const arc = parsedCurrent[i];
        const next = parsedCurrent[i + 1];
        if (
          prev && !prev.isArc && prev.end &&
          arc && arc.isArc && arc.x == null && arc.z == null && arc.r != null && arc.isT &&
          next && !next.isArc && next.x == null && next.z == null && next.pa != null && next.pr != null && next.isT
        ) {
          const dir1 = lineDirection(prev);
          const dir2 = normalizeAngle(next.pa);
          if (dir1 == null) continue;
          const arcEnd = computeArcEnd(prev.end, dir1, dir2, arc.r, arc.cmd);
          const nextEndDelta = polarDelta(dir2, next.pr);
          const nextEnd = { z: arcEnd.z + nextEndDelta.z, x: arcEnd.x + nextEndDelta.x };
          const newArcLine = replaceUnknownXY(updated[i], arcEnd);
          const newNextLine = replaceUnknownXY(updated[i + 1], nextEnd);
          if (newArcLine !== updated[i] || newNextLine !== updated[i + 1]) {
            updated[i] = newArcLine;
            updated[i + 1] = newNextLine;
            progress = true;
            break;
          }
        }
      }
    }

    let cur = null;
    let fallbackCount = 0;
    const out = [];
    for (const raw of updated) {
      const parsedLine = parseVkLine(raw);
      if (parsedLine && parsedLine.cmd !== 'G111' && parsedLine.x == null && parsedLine.z == null && parsedLine.pa != null && parsedLine.pr != null) {
        const resolved = resolvePAprLine(raw, cur);
        if (resolved) {
          out.push(resolved.resolved);
          cur = resolved.pt;
          fallbackCount++;
          continue;
        }
      }
      if (parsedLine && parsedLine.cmd !== 'G111' && parsedLine.x != null && parsedLine.z != null && parsedLine.pa != null && parsedLine.pr != null && !parsedLine.isArc) {
        const delta = polarDelta(parsedLine.pa, parsedLine.pr);
        cur = { z: parsedLine.z + delta.z, x: parsedLine.x + delta.x };
        out.push(raw);
        continue;
      }
      const m = raw.match(/X(-?\d+(?:\.\d+)?)\s+Z(-?\d+(?:\.\d+)?)/);
      if (m) cur = { z: parseFloat(m[2]), x: parseFloat(m[1]) };
      out.push(raw);
    }

    if (fallbackCount > 0) {
      showToast(`Dopočteno ${fallbackCount} prvků (PA+PR) → pokračuji konverzí`);
    }

    const convertedLines = [];
    let firstElementConverted = false;
    for (const line of out) {
      const parsedLine = parseVkLine(line);
      if (!firstElementConverted && parsedLine && (parsedLine.cmd === 'G11' || parsedLine.cmd === 'G0') && !parsedLine.isArc && parsedLine.x != null && parsedLine.z != null && parsedLine.pa != null && parsedLine.pr != null) {
        const start = { z: parsedLine.z, x: parsedLine.x };
        const delta = polarDelta(parsedLine.pa, parsedLine.pr);
        const end = { z: start.z + delta.z, x: start.x + delta.x };
        convertedLines.push(`G0 X${fmt(start.x)} Z${fmt(start.z)}`);
        convertedLines.push(`G1 X${fmt(end.x)} Z${fmt(end.z)}`);
        firstElementConverted = true;
        continue;
      }
      let clean = line.trim();
      if (parsedLine && parsedLine.cmd !== 'G111') {
        firstElementConverted = true;
      }
      if (clean.startsWith('G111')) {
        convertedLines.push(`( ${clean} - POZNÁMKA VPOL )`);
        continue;
      }
      clean = clean.replace(/^G0\b/, 'G1');
      clean = clean.replace(/G11/g, 'G1');
      clean = clean.replace(/PA\d+(?:\.\d+)?/g, '');
      clean = clean.replace(/PR\d+(?:\.\d+)?/g, '');
      clean = clean.replace(/\s*VPOL[12]/g, '');
      clean = clean.replace(/\s+T\b/g, '');
      convertedLines.push(clean.replace(/\s+/g, ' ').trim());
    }
    const converted = convertedLines.join('\n');

    gcodeEl.value = converted;
    convertBtn.classList.remove('vk-error-state');
    convertBtn.classList.add('vk-success-state');
  });
}
