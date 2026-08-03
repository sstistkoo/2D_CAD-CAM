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

import { state, showToast, displayX, inputX } from '../state.js';
import { bridge } from '../bridge.js';
import { renderVkHelp } from './vkHelp.js';
import {
  elementRay, solveCornerLineLine, solveLineArcJunction, solveLineArcJunctionCandidates,
  pickByVpolTag, tangentCircleTouchPoints, tangentCircleBetweenRays, pickBetweenRaysByVpolTag,
  twoTangentArcsBetweenRays, pickTwoArcsByVpolTag,
} from './vkSolver.js';

const DEFAULT_GCODE = '';
const VK_STORAGE_KEY = 'skica-vk-contour';
const VK_FIELD_VALUES_KEY = 'skica-vk-contour-field-values';

function loadVkFieldValues() {
  try {
    const raw = localStorage.getItem(VK_FIELD_VALUES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveVkFieldValues(values) {
  try {
    localStorage.setItem(VK_FIELD_VALUES_KEY, JSON.stringify(values));
  } catch {
    /* ignore */
  }
}

function polarDelta(paDeg, pr) {
  const paRad = ((paDeg % 360) + 360) % 360 * (Math.PI / 180);
  return { z: pr * Math.cos(paRad), x: pr * Math.sin(paRad) };
}

export function fmt(n) {
  return String(Math.round(n * 1000) / 1000);
}

// ── Jednotky osy X ──────────────────────────────────────────────
// V appce platí jedna konvence: INTERNĚ je X vždy POLOMĚR, převod na
// průměr se dělá až na hranici UI přes displayX()/inputX() (state.js).
// vkSolver.js je výjimka – počítá v PRŮMĚRECH (kružnice v rovině (Z,X)
// by jinak vyšla eliptická). Tyhle dvě funkce jsou jediné místo, kde se
// ta výjimka překlenuje, a jsou definované přes kanonické helpery, aby
// nevznikla druhá nezávislá konvence.
//
// POZOR: platí jen pro hodnoty ze STRUKTUROVANÉHO formuláře (pole X/Z),
// kde je číslo v zobrazovaných jednotkách. Na surová čísla vytažená
// z textu G-kódu se NEPOUŽÍVAJÍ – tam už X znamená to, co je napsané.
// (Záměna přesně tohohle rozbíjela tečné napojení: X20 se tiše
// zdvojnásobilo na X40 a vyšel degenerovaný dotyk.)

/** Hodnota z formuláře (zobrazované jednotky) → solver prostor (průměr). */
function toSolverX(val) {
  return 2 * inputX(val);
}
/** Solver prostor (průměr) → hodnota do formuláře (zobrazované jednotky). */
function fromSolverX(val) {
  return displayX(val / 2);
}

// ── Osy VK ↔ CAD plátno ─────────────────────────────────────────
// VK bod { x, z } je v ŘÍDICÍCH souřadnicích tak, jak jsou napsané
// v G-kódu (X v zobrazovaných jednotkách). CAD plátno má X vždy jako
// POLOMĚR a osy prohozené podle typu stroje – viz fmtCoordLabel()
// ve state.js:
//   soustruh – CNC Z = wx (vodorovně), CNC X = wy (svisle)
//   karusel  – CNC X = wx,             CNC Z = wy
// Bydlí to tady (a ne v vkPreviewRender.js), aby VK mělo převod os
// i jednotek na jednom místě a modul zůstal bez DOM závislostí.

/**
 * @param {{x: number, z: number}} pt
 * @returns {[number, number]} [wx, wy]
 */
export function vkToWorld(pt) {
  const r = inputX(pt.x);
  return state.machineType === 'karusel' ? [r, pt.z] : [pt.z, r];
}

/**
 * @param {number} wx
 * @param {number} wy
 * @returns {{x: number, z: number}} VK bod v zobrazovaných jednotkách
 */
export function worldToVk(wx, wy) {
  const isK = state.machineType === 'karusel';
  return { x: displayX(isK ? wx : wy), z: isK ? wy : wx };
}

/**
 * Oblouk VK prvku ve WORLD souřadnicích CAD plátna.
 *
 * Záměrně se nepoužívá `resolveVkArcGeometry` – ta počítá v rovině řešiče
 * (X = průměr), kde by oblouk po převodu na plátno vyšel jako elipsa.
 * R je v G-kódu vždy SKUTEČNÝ poloměr, takže se konstrukce dělá až ve
 * world prostoru – stejně jako v `parseGcodeToObjects()` (storage/fileIO.js),
 * aby náhled, vložení do výkresu i naparsovaný G-kód dávaly tentýž oblouk.
 *
 * `ccw` je v CAD konvenci (samostatný objekt `arc` se kreslí startAngle →
 * endAngle proti směru hodinových ručiček, pokud `ccw !== false`).
 *
 * @param {{x: number, z: number}} start
 * @param {{x: number, z: number}} end
 * @param {number} radius
 * @param {'G2'|'G3'|string} direction
 * @returns {{cx: number, cy: number, r: number, startAngle: number, endAngle: number, ccw: boolean}|null}
 */
export function vkArcInWorld(start, end, radius, direction) {
  if (!Number.isFinite(radius) || radius <= 0) return null;
  const [x1, y1] = vkToWorld(start);
  const [x2, y2] = vkToWorld(end);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist2 = dx * dx + dy * dy;
  if (dist2 < 1e-8 || radius * radius < dist2 / 4 - 1e-6) return null;
  const dist = Math.sqrt(dist2);
  const h = Math.sqrt(Math.max(0, radius * radius - dist2 / 4));
  const nx = -dy / dist;
  const ny = dx / dist;
  const sign = direction === 'G2' ? -1 : 1;
  const cx = (x1 + x2) / 2 + sign * h * nx;
  const cy = (y1 + y2) / 2 + sign * h * ny;
  return {
    cx, cy, r: radius,
    startAngle: Math.atan2(y1 - cy, x1 - cx),
    endAngle: Math.atan2(y2 - cy, x2 - cx),
    ccw: direction === 'G3',
  };
}

export function buildVkVpolLine(values = {}) {
  const xRaw = values.x != null ? values.x : values.vx != null ? values.vx : null;
  const zRaw = values.z != null ? values.z : values.vz != null ? values.vz : null;
  const paRaw = values.pa != null ? values.pa : null;
  const arcRaw = values.arc != null ? values.arc : values.r != null ? values.r : null;
  const xValue = xRaw != null && String(xRaw).trim() !== '' ? xRaw : 0;
  const zValue = zRaw != null && String(zRaw).trim() !== '' ? zRaw : 0;
  const hasAnyValue = [xRaw, zRaw, paRaw, arcRaw].some(value => value != null && String(value).trim() !== '');
  if (!hasAnyValue) return null;
  let line = `G111 X${xValue} Z${zValue}`;
  if (paRaw != null && String(paRaw).trim() !== '') line += ` PA${paRaw}`;
  if (arcRaw != null && String(arcRaw).trim() !== '') line += ` R${arcRaw}`;
  return line;
}

export function upsertVkVpolLine(code, values = {}) {
  const line = buildVkVpolLine(values);
  const lines = String(code || '').split(/\r?\n/);
  const remaining = lines.filter(entry => !/^G111\b/.test(entry.trim()));
  if (!line) return remaining.join('\n');
  return [...remaining, line].join('\n');
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

export function resolveVkArcGeometry(start, end, radius, direction) {
  if (!start || !end || !Number.isFinite(radius) || radius <= 0) return null;
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const chordLen = Math.hypot(dx, dz);
  if (chordLen <= 1e-6) return null;
  const halfLen = chordLen / 2;
  const sagitta = Math.sqrt(Math.max(radius * radius - halfLen * halfLen, 0));
  const perpX = -(end.z - start.z) / chordLen;
  const perpZ = (end.x - start.x) / chordLen;
  const sign = direction === 'G3' ? 1 : -1;
  const center = {
    x: (start.x + end.x) / 2 + sign * perpX * sagitta,
    z: (start.z + end.z) / 2 + sign * perpZ * sagitta,
  };
  const startAngle = Math.atan2(start.z - center.z, start.x - center.x);
  let endAngle = Math.atan2(end.z - center.z, end.x - center.x);
  let sweep = endAngle - startAngle;
  if (direction === 'G3') {
    if (sweep < 0) sweep += Math.PI * 2;
  } else if (sweep > 0) {
    sweep -= Math.PI * 2;
  }
  if (Math.abs(sweep) < 1e-9) sweep = direction === 'G3' ? Math.PI * 2 : -Math.PI * 2;
  return { center, startAngle, endAngle, sweep, radius };
}

export function pickVkAmbiguousSolution(previewData, selectedIndex = 0) {
  const ambiguousSolutions = previewData?.ambiguousSolutions || [];
  const safeIndex = Math.max(0, Math.min(selectedIndex, ambiguousSolutions.length - 1));
  const selectedSolution = ambiguousSolutions[safeIndex] || null;
  const draft = previewData?.draft ? { ...previewData.draft } : null;
  if (selectedSolution && draft) {
    draft.end = { ...selectedSolution.end };
  }
  return { selectedSolution, draft };
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
    if (!entry) continue;
    if (entry.cmd === 'G111') {
      const isConstructionRay = entry.pa != null && entry.pr == null && entry.x != null && entry.z != null;
      if (isConstructionRay) {
        segments.push({
          type: 'ray',
          start: { x: entry.x ?? 0, z: entry.z ?? 0 },
          end: { x: entry.x ?? 0, z: entry.z ?? 0 },
          angle: entry.pa,
        });
      }
      continue;
    }
    let start = currentPoint ? { ...currentPoint } : (vpol ? { ...vpol } : null);
    let end = null;

    if (entry.cmd === 'G0' && entry.x != null && entry.z != null && entry.pa != null && entry.pr == null && isFirstElement) {
      start = { x: entry.x, z: entry.z };
      end = { x: entry.x, z: entry.z };
    } else if (entry.x != null && entry.z != null && entry.pa != null && entry.pr != null && isFirstElement) {
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
      const isConstructionRay = entry.cmd === 'G0' && entry.x != null && entry.z != null && entry.pa != null && entry.pr == null && isFirstElement;
      segments.push({
        type: isConstructionRay ? 'ray' : (entry.isArc ? 'arc' : 'line'),
        start,
        end,
        radius: entry.r ?? null,
        direction: entry.cmd || 'G11',
        angle: isConstructionRay ? entry.pa : null,
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

const D2R = Math.PI / 180;

function vectorFromAngle(angleDeg) {
  return { z: Math.cos(angleDeg * D2R), x: Math.sin(angleDeg * D2R) };
}

function pickTangentArcStart(prev, arc) {
  if (!prev || !arc || !arc.isArc || arc.x == null || arc.z == null || arc.r == null) return null;
  if (prev.pa == null || prev.pr != null) return null;
  const ray = { z0: prev.z, x0: prev.x, angleDeg: ((prev.pa % 360) + 360) % 360 };
  const candidates = tangentCircleTouchPoints(ray, { z: arc.z, x: arc.x }, arc.r);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const rayDir = vectorFromAngle(ray.angleDeg);
  let best = null;
  for (const pt of candidates) {
    const geometry = resolveVkArcGeometry(pt, { z: arc.z, x: arc.x }, arc.r, arc.cmd);
    if (!geometry) continue;
    const startAngle = Math.atan2(pt.z - geometry.center.z, pt.x - geometry.center.x);
    const tangent = arc.cmd === 'G2'
      ? { z: -Math.cos(startAngle), x: Math.sin(startAngle) }
      : { z: Math.cos(startAngle), x: -Math.sin(startAngle) };
    const dot = tangent.z * rayDir.z + tangent.x * rayDir.x;
    if (!best || dot > best.dot) best = { pt, dot };
  }
  return best ? best.pt : candidates[0];
}

export function insertTangentTransitions(lines) {
  const parsed = lines.map((line) => parseVkLine(line));
  const result = [];
  for (let i = 0; i < lines.length; i += 1) {
    const prev = i > 0 ? parsed[i - 1] : null;
    const cur = parsed[i];
    if (prev && cur) {
      const tangent = pickTangentArcStart(prev, cur);
      if (tangent && (Math.abs(tangent.x - prev.x) > 1e-6 || Math.abs(tangent.z - prev.z) > 1e-6)) {
        result.push(`G1 X${fmt(tangent.x)} Z${fmt(tangent.z)}`);
      }
    }
    result.push(lines[i]);
  }
  return result;
}

/**
 * Markup záložky VK. Čistá funkce – žádný DOM ani listenery, jen HTML.
 * Okno kolem něj staví js/dialogs/combinedModal.js.
 */
export function renderVkTab() {
  // X může být zadáván v poloměru nebo průměru (☰ Nastavení → 📏 Zobrazení) –
  // popisky se přizpůsobí, ale vkSolver.js (dopočet neznámých – kategorie 1–4)
  // vždy počítá s průměrem, takže se hodnota ze strukturovaného formuláře
  // převádí přes toSolverX/fromSolverX. Náhled z volného textu (insertTangentTransitions,
  // buildVkPreviewData) pracuje přímo s čísly z textu bez konverze – tam už
  // X znamená to, co je v G-kódu napsané.
  const xUnitLabel = state.xDisplayMode === 'diameter' ? 'Průměr' : 'Poloměr';
  const bodyHTML = `
    <div class="vk-preview-bar">
      <span class="vk-preview-hint">Náhled se kreslí přímo na výkres</span>
      <button type="button" class="vk-header-btn" data-act="fit-view" title="Přizpůsobit pohled výkresu kontuře">⤢</button>
    </div>
    <div class="vk-solution-picker" data-id="solution-picker" style="display:none; margin-top:6px; align-items:center; gap:8px; flex-wrap:wrap;">
      <span class="vk-section-title" style="margin:0">Varianty řešení</span>
      <div class="vk-solution-buttons" data-id="solution-buttons"></div>
    </div>

    <details class="sn-help-details vk-section" open>
      <summary class="sn-help-summary vk-summary-with-nav">
        <span class="vk-help-c-orange">🎯 prvek VK</span>
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
          <div class="vk-toggle-row" style="margin-top:6px; align-items:center; gap:8px; flex-wrap:wrap">
            <button class="vk-toggle active" data-dir="G2">G2 ↻</button>
            <button class="vk-toggle" data-dir="G3">G3 ↺</button>
            <label class="cnc-field" style="margin:0">
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

        <div class="vk-section-title vk-title-with-action" data-id="coords-title-row">
          <span data-id="coords-title">Souřadnice počátečního bodu:</span>
          <button type="button" class="vk-header-btn" data-act="pick-xz" title="Vybrat bod z výkresu">🎯</button>
        </div>
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
        <div class="vk-solve-info" data-solve-info></div>
      </div>
    </details>

    <details class="sn-help-details vk-section" data-vk-help-details>
      <summary class="sn-help-summary"><span class="vk-help-c-green">❓ Přehled syntaxe a možností VK</span></summary>
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
    <div class="vk-actions" style="margin-top:8px">
      <button class="vk-btn vk-btn-commit" data-act="commit" title="Vložit konturu do výkresu jako úsečky a oblouky (jedno UNDO)">📥 Vložit do výkresu</button>
    </div>
  `;
  return { html: bodyHTML };
}

/**
 * Naváže logiku VK záložky na už vykreslený `container` (obsah záložky,
 * ne celý overlay – VK sdílí okno s číselným zadáním).
 * @param {HTMLElement} container
 * @returns {{ destroy: () => void }}
 */
export function initVkTab(container, { picker = null } = {}) {
  const xUnitLabel = state.xDisplayMode === 'diameter' ? 'Průměr' : 'Poloměr';

  const q = (id) => container.querySelector(`[data-id="${id}"]`);
  const gcodeEl = q('gcode');
  const fieldValues = loadVkFieldValues();
  try { const _saved = localStorage.getItem('skica-vk-contour'); if (_saved) gcodeEl.value = _saved; } catch { /* ignore */ }

  function rememberVkFieldValue(id, value) {
    if (!id) return;
    if (value == null) return;
    const trimmed = String(value).trim();
    if (trimmed === '' || trimmed === '?') return;
    fieldValues[id] = trimmed;
    saveVkFieldValues(fieldValues);
  }

  function getLastVkFieldValue(id) {
    return id ? (fieldValues[id] || '') : '';
  }

  function populateVpolFormFromCode(code) {
    const lines = String(code || '').split(/\r?\n/);
    const vpolEntry = lines.map(parseVkLine).find(entry => entry?.cmd === 'G111');
    if (!vpolEntry) return;
    q('vpol-x').value = vpolEntry.x == null ? '' : String(vpolEntry.x);
    q('vpol-z').value = vpolEntry.z == null ? '' : String(vpolEntry.z);
    q('vpol-pa').value = vpolEntry.pa == null ? '' : String(vpolEntry.pa);
    q('vpol-arc').value = vpolEntry.r == null ? '' : String(vpolEntry.r);
  }

  function syncVpolLineFromForm() {
    const values = {
      x: q('vpol-x').value.trim() === '' ? null : parseFloat(q('vpol-x').value),
      z: q('vpol-z').value.trim() === '' ? null : parseFloat(q('vpol-z').value),
      pa: q('vpol-pa').value.trim() === '' ? null : parseFloat(q('vpol-pa').value),
      arc: q('vpol-arc').value.trim() === '' ? null : parseFloat(q('vpol-arc').value),
    };
    const nextCode = upsertVkVpolLine(gcodeEl.value, values);
    if (gcodeEl.value !== nextCode) {
      gcodeEl.value = nextCode;
      vkSave();
    }
    updateVkPreview();
  }

  populateVpolFormFromCode(gcodeEl.value);

  function vkSave() {
    try { localStorage.setItem('skica-vk-contour', gcodeEl.value); } catch { /* quota */ }
  }
  function vkClearStorage() {
    try { localStorage.removeItem('skica-vk-contour'); } catch { /* ignore */ }
  }

  function buildAmbiguousSolutionPreview(previewData, draftSegment) {
    if (!previewData?.vpol || !draftSegment?.start || !draftSegment.end) return [];
    const radius = Number.isFinite(draftSegment.radius) ? draftSegment.radius : null;
    if (!radius || radius <= 0) return [];

    const start = draftSegment.start;
    const end = draftSegment.end;
    const dz = end.z - start.z;
    const dx = end.x - start.x;
    if (Math.hypot(dz, dx) < 1e-6) return [];

    const angleDeg = Math.atan2(dx, dz) * (180 / Math.PI);
    const ray = { z0: start.z, x0: start.x, angleDeg };
    try {
      const candidates = solveLineArcJunctionCandidates(ray, previewData.vpol, radius);
      if (candidates.length < 2) return [];
      const palette = ['default', 'cyan', 'green', 'yellow'];
      return candidates.map((candidate, index) => ({
        start: { ...start },
        end: { ...candidate },
        type: draftSegment.type || 'line',
        radius,
        direction: draftSegment.direction || 'G11',
        color: palette[index % palette.length],
      }));
    } catch {
      return [];
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

  function applySelectedAmbiguousSolution(previewData, selectedIndex) {
    const { selectedSolution } = pickVkAmbiguousSolution(previewData, selectedIndex);
    if (!selectedSolution?.end) return false;

    const end = selectedSolution.end;
    const xInput = q('val-x2');
    const zInput = q('val-z2');
    if (xInput) {
      xInput.value = fmt(end.x);
      xInput.classList.remove('vk-input-unknown');
      const xBtn = container.querySelector('[data-toggle="val-x2"]');
      if (xBtn) xBtn.classList.remove('active');
    }
    if (zInput) {
      zInput.value = fmt(end.z);
      zInput.classList.remove('vk-input-unknown');
      const zBtn = container.querySelector('[data-toggle="val-z2"]');
      if (zBtn) zBtn.classList.remove('active');
    }

    const editingItem = cursor === -1 ? firstElement : (cursor !== null ? pendingQueue[cursor] : null);
    if (editingItem?.lineText) {
      let patched = editingItem.lineText;
      if (patched.includes('X?')) patched = patched.replace('X?', `X${fmt(end.x)}`);
      else patched = patched.replace(/X-?\d+(?:\.\d+)?/, `X${fmt(end.x)}`);
      if (patched.includes('Z?')) patched = patched.replace('Z?', `Z${fmt(end.z)}`);
      else patched = patched.replace(/Z-?\d+(?:\.\d+)?/, `Z${fmt(end.z)}`);
      gcodeEl.value = gcodeEl.value.replace(editingItem.lineText, patched);
      editingItem.lineText = patched;
      editingItem.xRaw = end.x;
      editingItem.x = toSolverX(end.x);
      editingItem.z = end.z;
      editingItem.pa = null;
      editingItem.prRaw = null;
      vkSave();
    }

    return true;
  }

  /**
   * Přepočítá náhled z aktuálního textu + rozepsaného prvku, uloží ho do
   * `state.vkPreview.data` a nechá překreslit CAD plátno. Vlastní kreslení
   * dělá calculators/vkPreviewRender.js přes bridge.renderVkPreview.
   */
  function updateVkPreview() {
    const value = gcodeEl ? gcodeEl.value : '';
    const draftSegment = getDraftSegment();
    const previewData = buildVkPreviewData(value, draftSegment);
    previewData.ambiguousSolutions = buildAmbiguousSolutionPreview(previewData, draftSegment);
    if (previewData.ambiguousSolutions?.length) {
      const { draft } = pickVkAmbiguousSolution(previewData, selectedSolutionIndex);
      if (draft) previewData.draft = draft;
      if (selectedSolutionIndex >= previewData.ambiguousSolutions.length) selectedSolutionIndex = 0;
    }
    previewData.selectedSolutionIndex = selectedSolutionIndex;

    // Přepínač variant řešení (dřív se schovával uvnitř kreslení canvasu)
    if (solutionPicker) {
      solutionPicker.style.display = previewData.ambiguousSolutions?.length ? 'flex' : 'none';
    }
    if (solutionButtons) {
      solutionButtons.innerHTML = '';
      previewData.ambiguousSolutions?.forEach((entry, index) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `vk-toggle ${index === selectedSolutionIndex ? 'active' : ''}`;
        btn.textContent = `Varianta ${index + 1}`;
        btn.addEventListener('click', () => {
          selectedSolutionIndex = index;
          const draft = getDraftSegment();
          const data = buildVkPreviewData(gcodeEl ? gcodeEl.value : '', draft);
          data.ambiguousSolutions = buildAmbiguousSolutionPreview(data, draft);
          if (data.ambiguousSolutions?.length) applySelectedAmbiguousSolution(data, selectedSolutionIndex);
          updateVkPreview();
        });
        solutionButtons.appendChild(btn);
      });
    }

    state.vkPreview.data = previewData;
    bridge.renderAll?.();
  }

  let renderFrame = null;

  function scheduleRender() {
    if (renderFrame != null) return;
    renderFrame = window.requestAnimationFrame(() => {
      renderFrame = null;
      updateVkPreview();
    });
  }

  container.querySelector('[data-act="fit-view"]').addEventListener('click', () => {
    updateVkPreview();
    bridge.fitVkPreviewView?.();
  });

  // 🎯 – doplnit X/Z prvku kliknutím do výkresu. Odběr kliku je
  // jednorázový (canvasPick.js), takže nekoliduje s aktivním nástrojem.
  container.querySelector('[data-act="pick-xz"]')?.addEventListener('click', () => {
    if (!picker) return;
    const xInput = q('val-x2');
    const zInput = q('val-z2');
    picker.pick((wx, wy) => {
      const pt = worldToVk(wx, wy);
      setUnknownField('val-x2', fmt(pt.x));
      setUnknownField('val-z2', fmt(pt.z));
      rememberVkFieldValue('val-x2', fmt(pt.x));
      rememberVkFieldValue('val-z2', fmt(pt.z));
      updateVkPreview();
    }, {
      field: [xInput?.closest('.cnc-field'), zInput?.closest('.cnc-field')],
      hint: 'Klikněte do výkresu – doplní se X i Z prvku',
    });
  });

  container.querySelectorAll('input[data-id]').forEach(input => {
    input.addEventListener('focus', () => {
      if (input.classList.contains('vk-input-unknown') && input.value === '?') {
        const previous = getLastVkFieldValue(input.dataset.id);
        input.value = previous || '';
        input.classList.remove('vk-input-unknown');
        const toggleBtn = container.querySelector(`[data-toggle="${input.dataset.id}"]`);
        if (toggleBtn) toggleBtn.classList.remove('active');
      }
    });
    input.addEventListener('input', () => {
      if (!input.classList.contains('vk-input-unknown')) {
        rememberVkFieldValue(input.dataset.id, input.value);
      }
    });
    input.addEventListener('blur', () => {
      if (input.value.trim() === '') {
        input.value = '?';
        input.classList.add('vk-input-unknown');
        const toggleBtn = container.querySelector(`[data-toggle="${input.dataset.id}"]`);
        if (toggleBtn) toggleBtn.classList.add('active');
      } else {
        rememberVkFieldValue(input.dataset.id, input.value);
      }
    });
  });

  let currentType = 'vl';
  let arcDir = 'G2';
  let selectedSolutionIndex = 0;
  const solutionPicker = q('solution-picker');
  const solutionButtons = q('solution-buttons');

  // ── Lazy nápověda ──
  const helpDetails = container.querySelector('[data-vk-help-details]');
  const helpContainer = container.querySelector('[data-vk-help-container]');
  helpDetails.addEventListener('toggle', () => {
    if (helpDetails.open && !helpContainer.dataset.loaded) {
      helpContainer.innerHTML = renderVkHelp();
      helpContainer.dataset.loaded = '1';
    }
  });

  // ── VL / VKr / VPOL přepínač ──
  const arcSettings = container.querySelector('[data-arc-settings]');
  const vpolSettings = container.querySelector('[data-vpol-settings]');
  container.querySelectorAll('[data-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentType = btn.dataset.type;
      container.querySelectorAll('[data-type]').forEach(b => b.classList.toggle('active', b === btn));
      arcSettings.style.display = currentType === 'vkr' ? 'block' : 'none';
      vpolSettings.style.display = currentType === 'vpol' ? 'block' : 'none';
      updateVkPreview();
    });
  });

  // ── G2 / G3 přepínač ──
  container.querySelectorAll('[data-dir]').forEach(btn => {
    btn.addEventListener('click', () => {
      arcDir = btn.dataset.dir;
      container.querySelectorAll('[data-dir]').forEach(b => b.classList.toggle('active', b === btn));
      updateVkPreview();
    });
  });

  // ── ❓ přepínač neznámé hodnoty ──
  container.querySelectorAll('[data-toggle]').forEach(btn => {
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
  const convertBtn = container.querySelector('[data-act="convert"]');
  const solveInfo = container.querySelector('[data-solve-info]');
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
    vkSave();
    return true;
  }

  function appendCode(line) {
    gcodeEl.value = gcodeEl.value.trim() === '' ? line : `${gcodeEl.value}\n${line}`;
    resetConvertState();
    resetConversionBackup();
    vkSave();
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
    const btn = container.querySelector(`[data-toggle="${id}"]`);
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
    container.querySelectorAll('[data-type]').forEach(b => b.classList.toggle('active', b.dataset.type === currentType));
    arcSettings.style.display = currentType === 'vkr' ? 'block' : 'none';
    vpolSettings.style.display = currentType === 'vpol' ? 'block' : 'none';
    if (el.isArc) {
      arcDir = el.dir || 'G2';
      container.querySelectorAll('[data-dir]').forEach(b => b.classList.toggle('active', b.dataset.dir === arcDir));
    }
    setUnknownField('val-x2', el.xRaw);
    setUnknownField('val-z2', el.z);
    setUnknownField('val-pa', el.pa);
    setUnknownField('val-pr', el.prRaw != null ? el.prRaw : null);
    q('val-r').value = el.r;
    q('check-t').checked = el.isT;
    const vpolTagInput = container.querySelector('[data-id="vpol-tag"]');
    if (vpolTagInput) vpolTagInput.value = el.vpolTag || '';
    q('junction-axis').value = el.junction ? el.junction.axis : '';
    q('junction-value').value = el.junction ? el.junction.rawValue : '';
  }

  /** Vrátí formulář na výchozí hodnoty pro zadání nového prvku. */
  function setFieldValueOrRestore(id) {
    const previous = getLastVkFieldValue(id);
    if (previous !== '') {
      const input = q(id);
      input.value = previous;
      input.classList.remove('vk-input-unknown');
      const toggleBtn = container.querySelector(`[data-toggle="${id}"]`);
      if (toggleBtn) toggleBtn.classList.remove('active');
    } else {
      setUnknownField(id, null);
    }
  }

  function resetFormToNewEntry() {
    currentType = 'vl';
    container.querySelectorAll('[data-type]').forEach(b => b.classList.toggle('active', b.dataset.type === 'vl'));
    arcSettings.style.display = 'none';
    vpolSettings.style.display = 'none';
    arcDir = 'G2';
    container.querySelectorAll('[data-dir]').forEach(b => b.classList.toggle('active', b.dataset.dir === 'G2'));
    setFieldValueOrRestore('val-x2');
    setFieldValueOrRestore('val-z2');
    setFieldValueOrRestore('val-pa');
    setFieldValueOrRestore('val-pr');
    q('val-r').value = getLastVkFieldValue('val-r') || '5.0';
    q('check-t').checked = getLastVkFieldValue('check-t') === '1';
    const vpolTagInput = container.querySelector('[data-id="vpol-tag"]');
    if (vpolTagInput) vpolTagInput.value = getLastVkFieldValue('vpol-tag');
    const junctionAxisValue = getLastVkFieldValue('junction-axis');
    q('junction-axis').value = junctionAxisValue || '';
    q('junction-value').value = getLastVkFieldValue('junction-value');
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
    vkSave();
  }

  let nextElId = 1;

  function resetChain() {
    startPoint = null; vpolPoint = null; lastPoint = null; pendingQueue = []; firstElement = null; nextElId = 1;
    chainStarted = false; cursor = null;
    solveInfo.textContent = '';
    updateFormMode();
    updateVkPreview();
  }

  container.querySelector('[data-act="nav-prev"]').addEventListener('click', (e) => {
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

  container.querySelector('[data-act="nav-next"]').addEventListener('click', (e) => {
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
    updateVkPreview();
  });

  container.querySelector('[data-act="remove-element"]').addEventListener('click', () => {
    if (cursor === null && pendingQueue.length === 0) { solveInfo.textContent = 'Není co odebrat.'; return; }
    if (cursor === -1) {
      if (!firstElement) { solveInfo.textContent = 'Není co odebrat.'; return; }
      gcodeEl.value = gcodeEl.value.split('\n').filter(l => l !== firstElement.lineText).join('\n');
      vkSave();
      firstElement = null;
    } else {
      const idx = cursor !== null ? cursor : pendingQueue.length - 1;
      if (idx < 0 || idx >= pendingQueue.length) { solveInfo.textContent = 'Není co odebrat.'; return; }
      const [removed] = pendingQueue.splice(idx, 1);
      gcodeEl.value = gcodeEl.value.split('\n').filter(l => l !== removed.lineText).join('\n');
      vkSave();
      if (removed.wasFirstEver && lastPoint === null) chainStarted = false;
    }
    cursor = null;
    resetFormToNewEntry();
    solveInfo.textContent = 'Odebráno';
    updateFormMode();
    updateVkPreview();
  });

  container.querySelector('[data-act="vpol"]').addEventListener('click', () => {
    const vx = q('vpol-x').value, vz = q('vpol-z').value;
    const vpa = q('vpol-pa').value, varc = q('vpol-arc').value;
    const xValue = vx.trim() === '' ? null : parseFloat(vx);
    const zValue = vz.trim() === '' ? null : parseFloat(vz);
    vpolPoint = { z: (zValue ?? 0), x: toSolverX(xValue ?? 0) };
    syncVpolLineFromForm();
  });

  container.querySelectorAll('.vk-input-vpol, [data-id="vpol-pa"], [data-id="vpol-arc"]').forEach(input => {
    input.addEventListener('input', () => {
      syncVpolLineFromForm();
    });
    input.addEventListener('change', () => {
      syncVpolLineFromForm();
    });
  });

  container.querySelector('[data-act="element"]').addEventListener('click', () => {
    const editingIndex = cursor;
    const isFirstEver = editingIndex === -1
      ? true
      : (editingIndex !== null ? pendingQueue[editingIndex].wasFirstEver : (pendingQueue.length === 0 && lastPoint === null && !/^(G0|G11|G2|G3)\s+/m.test(gcodeEl.value)));
    const xStr = q('val-x2').value, zStr = q('val-z2').value;
    const paStr = q('val-pa').value, prStr = q('val-pr').value;
    const rStr = q('val-r').value;
    const isTChecked = !isFirstEver && q('check-t').checked; // na počátečním bodě není na co se tečně napojit
    const vpolTagInput = container.querySelector('[data-id="vpol-tag"]');
    const vpolTag = vpolTagInput ? (vpolTagInput.value || null) : null;
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
        vkSave();
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
        vkSave();
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
    updateVkPreview();
  });

  container.querySelector('[data-act="clear"]').addEventListener('click', () => {
    gcodeEl.value = '';
    vkClearStorage();
    resetConvertState();
    resetConversionBackup();
    resetChain();
  });

  container.querySelector('[data-act="copy"]').addEventListener('click', () => {
    if (!gcodeEl.value.trim()) return;
    navigator.clipboard.writeText(gcodeEl.value).then(() => showToast('Zkopírováno'));
  });

  // Vložení do výkresu jde přes bridge (calculators/vkCommit.js) – tenhle
  // modul musí zůstat bez DOM/objects závislostí kvůli node testům.
  const commitBtn = container.querySelector('[data-act="commit"]');
  const COMMIT_LABEL = '📥 Vložit do výkresu';
  let commitResetTimer = null;
  commitBtn.addEventListener('click', () => {
    const inserted = bridge.commitVkToDrawing?.(gcodeEl.value) || 0;
    if (!inserted) return;
    // Vložené objekty leží přesně pod náhledem, takže samotné plátno
    // úspěch nepřizná – zpětná vazba musí přijít z tlačítka (jinak by
    // uživatel klikal znovu a vyrobil duplicitní geometrii).
    commitBtn.textContent = `✓ Vloženo (${inserted})`;
    clearTimeout(commitResetTimer);
    commitResetTimer = setTimeout(() => { commitBtn.textContent = COMMIT_LABEL; }, 1800);
  });

  gcodeEl.addEventListener('input', () => {
    scheduleRender();
    vkSave();
  });
  container.addEventListener('input', (event) => {
    if (event.target.matches('input, select, textarea')) {
      scheduleRender();
    }
  });
  // Na resize okna se náhled překreslovat nemusí – žije na CAD plátně,
  // které si vlastní přizpůsobení velikosti řeší samo (canvas.js).
  scheduleRender();

  convertBtn.addEventListener('click', () => {
      if (restoreOriginalVkCode()) {
        showToast('Obnoveno původní VK syntaxe');
        return;
      }
      conversionBackup = gcodeEl.value;
      convertBtn.textContent = 'Obnovit VK syntaxi';

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
    let updated = insertTangentTransitions([...rawLines]);
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
    vkSave();
    convertBtn.classList.remove('vk-error-state');
    convertBtn.classList.add('vk-success-state');
  });

  return {
    /** Zavolat po zobrazení záložky – náhled se přepočte a překreslí. */
    refresh() {
      scheduleRender();
    },
    destroy() {
      if (renderFrame != null) { window.cancelAnimationFrame(renderFrame); renderFrame = null; }
      if (commitResetTimer != null) { clearTimeout(commitResetTimer); commitResetTimer = null; }
      // `state.vkPreview` patří oknu (combinedModal.js) – uklízet ho tady
      // by přepsalo náhled okna, které se mezitím stihlo otevřít znovu.
    },
  };
}
