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
import { safeEvalMath } from '../utils.js';
import { bridge } from '../bridge.js';
import { showVkHelpModal } from './vkHelp.js';
import {
  elementRay, solveCornerLineLine, solveLineArcJunctionCandidates, chooseSolution,
  tangentCircleTouchPoints, tangentCircleBetweenRays, twoTangentArcsBetweenRays,
  tangentArcEndOnRay, twoTangentArcsFromDirection,
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

/**
 * X/Z + PA/PR zadané na jednom prvku zároveň: X/Z je jeho POČÁTEK (ne cíl –
 * přepisuje navazující bod z řetězu), PA/PR pak určí délku a úhel, ze
 * kterých se dopočte konec. Jedno pravidlo sdílené všemi místy, co z VK
 * syntaxe skládají geometrii (náhled na plátně, dopočet směru pro tečné
 * napojení, konverze na ISO, vkládání nového prvku z formuláře) – ať se
 * znovu nerozjedou, jako se to stalo předtím (náhled X/Z+PA/PR mimo první
 * prvek ignoroval, export do ISO zas ignoroval X/Z).
 *
 * Souřadnice jsou v libovolné (ale jednotné pro x/z i délku PR) soustavě
 * volajícího – funkce žádné jednotky nepřevádí, jen sčítá úhlopříčku.
 * @param {number} x
 * @param {number} z
 * @param {number} pa úhel ve stupních
 * @param {number} pr délka
 * @returns {{start: {x:number,z:number}, end: {x:number,z:number}}}
 */
function startAndEndFromXzPaPr(x, z, pa, pr) {
  const start = { x, z };
  const delta = polarDelta(pa, pr);
  return { start, end: { x: start.x + delta.x, z: start.z + delta.z } };
}

/**
 * Text z formulářového pole → číslo, stejně jako všechna ostatní číselná
 * pole appky (desetinná čárka, jednoduché výrazy typu „10+5") – přes
 * `safeEvalMath()`. `null` pro prázdné pole nebo „?" (neznámá hodnota),
 * `NaN` pro neplatný text (volající to musí ošetřit, jinak se do VK
 * syntaxe zapíše doslovné „NaN").
 * @param {string|null|undefined} raw
 * @returns {number|null}
 */
function parseVkField(raw) {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (trimmed === '' || trimmed === '?') return null;
  return safeEvalMath(trimmed);
}

export function fmt(n) {
  return String(Math.round(n * 1000) / 1000);
}

// ── Jednotky osy X ──────────────────────────────────────────────
// V appce platí jedna konvence: INTERNĚ je X vždy POLOMĚR, převod na
// průměr se dělá až na hranici UI přes displayX()/inputX() (state.js).
// vkSolver.js ji dodržuje taky – počítá ve skutečné rovině (Z, poloměr),
// takže R, PR i vzdálenosti v něm znamenají reálné milimetry.
//
// Dřív se solveru posílal PRŮMĚR („pseudo-průměr", toSolverX = 2*inputX)
// a každá funkce s kruhovou geometrií si ho měla sama vydělit dvěma.
// Kategorie 4 to dělala, tečná rodina (kat. 2/3) ne – tečnost proto
// vycházela mimo. Rovina s 2× roztaženou osou X není euklidovská, takže
// se jí tady radši nedržíme vůbec; obě funkce jsou teď jen tenký obal
// nad kanonickými helpery.
//
// POZOR: platí jen pro hodnoty ze STRUKTUROVANÉHO formuláře (pole X/Z),
// kde je číslo v zobrazovaných jednotkách. Na surová čísla vytažená
// z textu G-kódu se NEPOUŽÍVAJÍ automaticky – tam si převod musí udělat
// volající (viz insertTangentTransitions).

/** Hodnota z formuláře (zobrazované jednotky) → solver prostor (poloměr). */
function toSolverX(val) {
  return inputX(val);
}
/** Solver prostor (poloměr) → hodnota do formuláře (zobrazované jednotky). */
function fromSolverX(val) {
  return displayX(val);
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
  // Prázdná syntaxe se rozpadne na [''] – bez tohohle by VPOL do čistého
  // pole spadl až na druhý řádek (`\nG111 …`).
  if (remaining.every(entry => entry.trim() === '')) return line;
  return [...remaining, line].join('\n');
}

/**
 * Příkaz VK řádku pro prvek zadaný ve formuláři.
 *
 * Sdílí ho tlačítko „+" i kreslení myší (`state.tool === 'vkDraw'`), aby
 * obě cesty vyráběly identickou syntaxi. `G0` je vyhrazené pro úplně první
 * prvek řetězu (najetí na počáteční bod), pak už jde všechno přes `G11`.
 *
 * @param {'vl'|'vkr'|'vpol'} type typ prvku ve formuláři
 * @param {boolean} isFirstEver je to počáteční bod kontury?
 * @param {'G2'|'G3'} arcDir směr oblouku
 * @returns {'G0'|'G11'|'G2'|'G3'|'G111'}
 */
export function vkElementCommand(type, isFirstEver, arcDir) {
  if (type === 'vpol') return 'G111';
  if (type === 'vkr') return arcDir === 'G3' ? 'G3' : 'G2';
  return isFirstEver ? 'G0' : 'G11';
}

/**
 * Sestaví text VK řádku z hodnot formuláře.
 *
 * Čísla jdou do textu tak, jak je uživatel napsal (zobrazované jednotky) –
 * převod na poloměr dělá až řešič, viz „Jednotky osy X" nahoře.
 * `null` znamená „pole zůstalo neznámé" a zapíše se jako `?`.
 *
 * @param {{cmd: string, x?: number|string|null, z?: number|string|null,
 *          pa?: number|null, pr?: number|string|null, r?: number|null,
 *          isArc?: boolean, vpolTag?: string|null, isT?: boolean}} values
 * @returns {string}
 */
export function buildVkElementLine(values) {
  const { cmd, x = null, z = null, pa = null, pr = null, r = null, isArc = false, vpolTag = null, isT = false } = values;
  let line = `${cmd} X${x == null ? '?' : x} Z${z == null ? '?' : z}`;
  if (pa != null) line += ` PA${pa}`;
  if (pr != null && String(pr).trim() !== '') line += ` PR${pr}`;
  if (isArc) line += ` R${r ?? 0}`;
  if (vpolTag) line += ` ${vpolTag}`;
  if (isT) line += ' T';
  return line;
}

/**
 * Odebere ze syntaxe POSLEDNÍ geometrický prvek (krok zpět při kreslení).
 *
 * `G111` (VPOL) se přeskakuje – je to definice pólu, ne prvek kontury,
 * a smazat ji krokem zpět by rozhodilo všechny polární zápisy nad ní.
 *
 * @param {string} code
 * @returns {{code: string, removed: string}|null} null = není co odebrat
 */
export function dropLastVkElementLine(code) {
  const lines = String(code || '').split(/\r?\n/);
  let idx = -1;
  lines.forEach((text, i) => {
    const parsedLine = parseVkLine(text);
    if (parsedLine && parsedLine.cmd !== 'G111') idx = i;
  });
  if (idx === -1) return null;
  const [removed] = lines.splice(idx, 1);
  return { code: lines.join('\n'), removed };
}

/**
 * Má daná VK syntaxe už aspoň jeden geometrický prvek?
 *
 * `G111` (definice pólu) se nepočítá – ta sama o sobě konturu nezačíná,
 * takže po ní další prvek pořád smí být počáteční `G0`.
 *
 * @param {string} code obsah pole „Generovaná VK syntaxe"
 * @returns {boolean}
 */
export function vkChainHasElements(code) {
  return /^(G0|G11|G1|G2|G3)\s+/m.test(String(code || ''));
}

export function parseVkLine(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  // `G1` je tu kvůli VÝSTUPU vlastní konverze na ISO (G11→G1, G0→G1) a kvůli
  // přechodovým úsečkám z insertTangentTransitions. Bez něj byl zkonvertovaný
  // program pro parser neviditelný – nešel z něj náhled ani vložení do výkresu.
  // Pořadí v alternaci musí jít od nejdelšího: G111 → G11 → G1.
  const cmdMatch = trimmed.match(/^(G0|G111|G11|G1|G2|G3)\b/);
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
    } else if (entry.x != null && entry.z != null && entry.pa != null && entry.pr != null) {
      ({ start, end } = startAndEndFromXzPaPr(entry.x, entry.z, entry.pa, entry.pr));
    } else if (entry.x != null && entry.z != null && isFirstElement && (entry.cmd === 'G0' || !start)) {
      // `!start` = není VPOL ani předchozí bod, takže první prvek JE počátek.
      // Bez toho by zkonvertovaný program (samé G1, žádné G0/VPOL) neměl kde
      // začít a všechny jeho řádky by se zahodily.
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

/** Oblouk s dostatkem zadaného, aby šlo hledat dotyk (známý konec + R). */
function isResolvableArc(el) {
  return !!el && el.isArc && el.x != null && el.z != null && el.r != null;
}

/** Konstrukční paprsek – úhel bez délky (pomůcka pro hledání průsečíku). */
function isConstructionRay(el) {
  return !!el && el.pa != null && el.pr == null;
}

/**
 * Dotykový bod tečného oblouku na daném paprsku.
 *
 * Vstup i výstup jsou v jednotkách TEXTU G-kódu (co uživatel napsal), samotná
 * geometrie ale běží ve skutečné rovině (Z, poloměr) – v režimu průměr je osa
 * X 2× roztažená, oblouk by v ní byl elipsa a dotyk by vyšel jinde.
 *
 * @param {{x:number, z:number}} anchor bod na paprsku (v jednotkách textu)
 * @param {number} angleDeg směr paprsku ve skutečné rovině
 * @param {object} arc naparsovaný řádek oblouku
 * @returns {{x:number, z:number}|null}
 */
function tangentPointOnRay(anchor, angleDeg, arc) {
  const ray = { z0: anchor.z, x0: inputX(anchor.x), angleDeg: ((angleDeg % 360) + 360) % 360 };
  const arcEnd = { z: arc.z, x: inputX(arc.x) };
  const toTextUnits = (pt) => ({ z: pt.z, x: displayX(pt.x) });
  const candidates = tangentCircleTouchPoints(ray, arcEnd, arc.r);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return toTextUnits(candidates[0]);
  // Rozhoduje shoda směru (tečna oblouku vs. směr paprsku); při shodě se bere
  // bod bližší kotvě, ať se s tím, co uživatel napsal, hýbe co nejmíň.
  const rayDir = vectorFromAngle(ray.angleDeg);
  let best = null;
  for (const pt of candidates) {
    const geometry = resolveVkArcGeometry(pt, arcEnd, arc.r, arc.cmd);
    if (!geometry) continue;
    const startAngle = Math.atan2(pt.z - geometry.center.z, pt.x - geometry.center.x);
    const tangent = arc.cmd === 'G2'
      ? { z: -Math.cos(startAngle), x: Math.sin(startAngle) }
      : { z: Math.cos(startAngle), x: -Math.sin(startAngle) };
    const dot = tangent.z * rayDir.z + tangent.x * rayDir.x;
    const gap = Math.hypot(pt.z - ray.z0, pt.x - ray.x0);
    if (!best || dot > best.dot + 1e-9 || (Math.abs(dot - best.dot) <= 1e-9 && gap < best.gap)) {
      best = { pt, dot, gap };
    }
  }
  return toTextUnits(best ? best.pt : candidates[0]);
}

/** Tečný dotyk po KONSTRUKČNÍM PAPRSKU (G0/G111 s PA, bez PR). */
function pickTangentArcStart(prev, arc) {
  if (!isConstructionRay(prev) || !isResolvableArc(arc)) return null;
  return tangentPointOnRay({ z: prev.z, x: prev.x }, prev.pa, arc);
}

/**
 * Projde řádky a ke každému prvku dopočte začátek/konec v jednotkách textu.
 * `chain[i]` je `null` tam, kde chain nejde uzavřít (neznámé „?", VPOL řádek,
 * první prvek – ten žádný předchozí začátek nemá).
 *
 * Exportováno hlavně kvůli testům – uvnitř appky ho volá `directionEndingAt()`
 * (closure v `initVkTab`, viz vk-solver.test.js pro DOM cestu) a
 * `planTangentTransitions()` níž.
 */
export function buildTextChain(parsed) {
  const chain = [];
  let cur = null;
  for (const el of parsed) {
    if (!el || el.cmd === 'G111') { chain.push(null); continue; }
    let start = cur;
    let end = null;
    if (el.x != null && el.z != null && el.pa != null && el.pr != null) {
      ({ start, end } = startAndEndFromXzPaPr(el.x, el.z, el.pa, el.pr));
    } else if (el.x != null && el.z != null) {
      end = { x: el.x, z: el.z };
    } else if (el.pa != null && el.pr != null && start) {
      const delta = polarDelta(el.pa, el.pr);
      end = { x: start.x + delta.x, z: start.z + delta.z };
    }
    chain.push(start && end ? { start, end } : null);
    cur = end;
  }
  return chain;
}

/** Směr prvku ve skutečné rovině (Z, poloměr), ve stupních – nebo null. */
function segmentDirectionDeg(segment) {
  const dz = segment.end.z - segment.start.z;
  const dx = inputX(segment.end.x) - inputX(segment.start.x);
  if (Math.hypot(dz, dx) < 1e-9) return null;
  return Math.atan2(dx, dz) / D2R;
}

/** Přepíše X a Z v řádku na dopočtené hodnoty (ostatní adresy nechá být). */
function patchLineXZ(text, pt) {
  return text
    .replace(/X-?\d+(?:\.\d+)?/, `X${fmt(pt.x)}`)
    .replace(/Z-?\d+(?:\.\d+)?/, `Z${fmt(pt.z)}`);
}

/**
 * Doplní tečné napojení na oblouky.
 *
 * Dva různé případy, protože si žádají různé řešení:
 *
 * 1. **Po konstrukčním paprsku** (`G0 X.. Z.. PA..` bez PR) se VLOŽÍ přechodová
 *    úsečka `G1` do dotykového bodu. Paprsek je jen pomůcka bez délky, takže
 *    není co posouvat – a dělá se to bez ohledu na příznak T (paprsek žádnou
 *    jinou roli nemá).
 * 2. **Mezi dvěma běžnými prvky** se POSUNE konec předchozího prvku do
 *    dotykového bodu. Vložit další `G1` by tu znamenalo dojet na napsaný roh
 *    a pak couvnout po vlastní čáře zpátky. Tady se to dělá **jen když má
 *    oblouk příznak T** – bez něj uživatel o tečnost nežádal a přepisovat mu
 *    souřadnici, kterou vypsal, by bylo překvapení.
 *
 * @param {string[]} lines
 * @returns {string[]}
 */
export function planTangentTransitions(lines) {
  const parsed = lines.map((line) => parseVkLine(line));
  const chain = buildTextChain(parsed);
  const result = [];
  const touches = [];
  for (let i = 0; i < lines.length; i += 1) {
    const prev = i > 0 ? parsed[i - 1] : null;
    const cur = parsed[i];
    if (prev && cur) {
      const viaRay = pickTangentArcStart(prev, cur);
      if (viaRay && (Math.abs(viaRay.x - prev.x) > 1e-6 || Math.abs(viaRay.z - prev.z) > 1e-6)) {
        result.push(`G1 X${fmt(viaRay.x)} Z${fmt(viaRay.z)}`);
        touches.push({ ...viaRay });
      } else if (
        cur.isT && isResolvableArc(cur)
        && !prev.isArc && !isConstructionRay(prev)
        && prev.x != null && prev.z != null && chain[i - 1]
        // Prvek s X/Z + PA/PR zároveň: X/Z je jeho POČÁTEK (viz
        // startAndEndFromXzPaPr), ne konec – patchLineXZ() by tu ale přepsal
        // právě X/Z a posunul tak omylem začátek úsečky, ne její konec.
        && !(prev.pa != null && prev.pr != null)
      ) {
        const direction = segmentDirectionDeg(chain[i - 1]);
        const touch = direction == null ? null : tangentPointOnRay(chain[i - 1].end, direction, cur);
        if (touch && (Math.abs(touch.x - prev.x) > 1e-6 || Math.abs(touch.z - prev.z) > 1e-6)) {
          result[result.length - 1] = patchLineXZ(result[result.length - 1], touch);
          touches.push({ ...touch });
        }
      }
    }
    result.push(lines[i]);
  }
  return { lines: result, touches };
}

/** Jen upravené řádky – zkratka nad `planTangentTransitions()`. */
export function insertTangentTransitions(lines) {
  return planTangentTransitions(lines).lines;
}

/**
 * Segmenty, které tečné napojení skutečně změní – tedy ty z `hintSegments`,
 * pro které v `baseSegments` není shodný protějšek. Slouží živému náhledu,
 * aby se přes hotovou konturu nekreslila celá její kopie, ale jen ten kousek
 * u napojení, který se posune.
 */
export function diffPreviewSegments(hintSegments, baseSegments) {
  const same = (a, b) =>
    Math.abs(a.start.z - b.start.z) < 1e-6 && Math.abs(a.start.x - b.start.x) < 1e-6 &&
    Math.abs(a.end.z - b.end.z) < 1e-6 && Math.abs(a.end.x - b.end.x) < 1e-6;
  return (hintSegments || []).filter(
    (hint) => hint.type !== 'ray' && !(baseSegments || []).some((base) => same(hint, base)),
  );
}

/**
 * Markup záložky VK. Čistá funkce – žádný DOM ani listenery, jen HTML.
 * Okno kolem něj staví js/dialogs/combinedModal.js.
 */
export function renderVkTab() {
  // X může být zadáván v poloměru nebo průměru (☰ Nastavení → 📏 Zobrazení) –
  // popisky se přizpůsobí, ale vkSolver.js (dopočet neznámých – kategorie 1–4)
  // počítá vždy v poloměru, takže se hodnota ze strukturovaného formuláře
  // převádí přes toSolverX/fromSolverX. Náhled a text G-kódu drží čísla tak,
  // jak je uživatel napsal; kde se z nich počítá geometrie (tangentPointOnRay),
  // si převod udělá volající. Viz „Jednotky osy X" nahoře.
  const xUnitLabel = state.xDisplayMode === 'diameter' ? 'Průměr' : 'Poloměr';
  const bodyHTML = `
    <div class="tab-scroll">
    <div class="vk-solution-picker" data-id="solution-picker" style="display:none; align-items:center; gap:8px; flex-wrap:wrap;">
      <span class="vk-section-title" style="margin:0">Varianty řešení</span>
      <div class="vk-solution-buttons" data-id="solution-buttons"></div>
    </div>

    <details class="sn-help-details vk-section" open>
      <summary class="sn-help-summary vk-summary-with-nav">
        <span class="vk-nav-buttons">
          <button type="button" class="vk-nav-btn" data-act="nav-prev" title="Předchozí nedořešený prvek">◀</button>
          <span class="vk-nav-pos" data-id="nav-pos"></span>
          <button type="button" class="vk-nav-btn" data-act="nav-next" title="Další / nový prvek">▶</button>
        </span>
        <span class="vk-header-actions">
          <button type="button" class="vk-header-btn" data-act="element" data-id="element-btn" title="Vložit VK prvek">+</button>
          <button type="button" class="vk-header-btn vk-header-btn-red" data-act="remove-element" title="Odebrat VK prvek">−</button>
        </span>
        <span class="vk-header-actions vk-code-actions">
          <button type="button" class="vk-header-btn vk-header-btn-red" data-act="clear" title="Smazat celou VK syntaxi">🗑</button>
          <button type="button" class="vk-header-btn" data-act="copy" title="Kopírovat VK syntaxi do schránky">📋</button>
          <button type="button" class="vk-header-btn" data-act="convert" title="Konvertovat na ISO G-kód">⇄</button>
          <button type="button" class="vk-header-btn" data-act="commit" title="Vložit konturu do výkresu jako úsečky a oblouky (jedno UNDO)">📥</button>
        </span>
        <button type="button" class="vk-header-btn vk-help-btn" data-act="help" title="❓ Přehled syntaxe a možností VK">❓</button>
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
            <label class="cnc-field vk-field-inline" style="margin:0" title="Poloměr zaoblení (R)">
              <span>R</span>
              <div class="vk-input-row">
                <input type="text" data-id="val-r" value="5.0">
                <button class="vk-btn-q" data-toggle="val-r">❓</button>
              </div>
            </label>
          </div>
          <div class="cnc-fields" style="margin-top:6px" title="Jen pro esíčko (dva tečné oblouky za sebou) – bez toho by měla soustava o 1 stupeň volnosti víc, než kolik je zadáno">
            <label class="cnc-field">
              <span>Bod zlomu – osa</span>
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
          <label class="cnc-field vk-field-inline vk-ambiguity" data-id="ambiguity-field"
            title="Když má dopočet dvě geometricky platná řešení a jsou podobně daleko od začátku obrysu, appka nehádá – vyber, které chceš.">
            <span>Dvojznačnost</span>
            <select data-id="vpol-tag">
              <option value="">— (rozhodne appka)</option>
              <option value="VPOL1">VPOL1 – bližší začátku obrysu</option>
              <option value="VPOL2">VPOL2 – vzdálenější</option>
            </select>
          </label>
          <span class="vk-header-actions">
            <button type="button" class="vk-header-btn" data-act="pick-xz" title="Vybrat bod z výkresu">🎯</button>
            <button type="button" class="vk-header-btn" data-act="draw-mode" data-id="draw-mode-btn"
              title="Kreslit konturu klikáním do výkresu (každý klik = jeden prvek)">✏️</button>
          </span>
        </div>
        <div class="cnc-fields" data-id="coords-fields">
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

    <div class="vk-gcode-box">
      <span class="vk-gcode-label">Generovaná VK syntaxe (lze upravit nebo smazat ručně):</span>
      <textarea class="vk-gcode-textarea" data-id="gcode">${DEFAULT_GCODE}</textarea>
    </div>
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
    // Živý sync na každý úhoz kláves – NaN (rozepsaný/neplatný výraz) se
    // tiše bere jako „zatím nic", ať appka do syntaxe nezapíše doslovné
    // "NaN" už v půlce psaní.
    const nanToNull = (v) => (Number.isNaN(v) ? null : v);
    const values = {
      x: nanToNull(parseVkField(q('vpol-x').value)),
      z: nanToNull(parseVkField(q('vpol-z').value)),
      pa: nanToNull(parseVkField(q('vpol-pa').value)),
      arc: nanToNull(parseVkField(q('vpol-arc').value)),
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
    const x = parseVkField(xRaw);
    const z = parseVkField(zRaw);
    const value = gcodeEl ? gcodeEl.value : '';
    const previewData = buildVkPreviewData(value);
    const baseStart = previewData.lastPoint || {
      x: parseVkField(q('vpol-x')?.value) || 0,
      z: parseVkField(q('vpol-z')?.value) || 0,
    };
    const hasLiveDraftValues = x != null || z != null || q('val-pa')?.value?.trim() !== '' || q('val-pr')?.value?.trim() !== '';
    if (!hasLiveDraftValues) return null;

    const paRaw = q('val-pa')?.value;
    const prRaw = q('val-pr')?.value;
    const pa = parseVkField(paRaw);
    const pr = parseVkField(prRaw);
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
      radius: parseVkField(q('val-r')?.value),
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
   * Živý náhled tečného napojení: co by s konturou udělalo „Konvertovat na
   * ISO G-kód", ještě než se na něj klikne.
   *
   * Vrací jen ROZDÍL proti hotové kontuře (posunutý kousek u napojení)
   * a dotykové body. Text se schválně nemění – náhled hlavní kontury musí
   * dál odpovídat tomu, co je napsané, protože přesně to vloží
   * „📥 Vložit do výkresu". Kdyby se místo toho překreslila rovnou tečně
   * upravená kontura, náhled a vložená geometrie by si přestaly odpovídat.
   *
   * @returns {{segments: object[], touches: {z:number,x:number}[]}|null}
   */
  function buildTangentHint(code, baseData) {
    const rawLines = String(code || '').split(/\r?\n/);
    const plan = planTangentTransitions(rawLines);
    if (plan.touches.length === 0) return null;
    const segments = diffPreviewSegments(buildVkPreviewData(plan.lines).segments, baseData.segments);
    if (segments.length === 0) return null;
    return { segments, touches: plan.touches };
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
    previewData.tangentHint = buildTangentHint(value, previewData);

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

  // Tlačítka v `<summary>` by jinak sekci sbalila/rozbalila – rozbalování
  // patří jen kliku na plochu lišty mimo ně.
  container.querySelector('.vk-summary-with-nav')?.addEventListener('click', (e) => {
    if (e.target.closest('button')) e.preventDefault();
  });

  container.querySelector('[data-act="help"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    showVkHelpModal();
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

  // ── VL / VKr / VPOL přepínač ──
  const arcSettings = container.querySelector('[data-arc-settings]');
  const vpolSettings = container.querySelector('[data-vpol-settings]');

  /**
   * Ukáže jen to, co k vybranému typu patří. VPOL je definice pólu, ne prvek
   * kontury – souřadnice prvku, tečnost ani dvojznačnost pro něj nedávají
   * smysl a jen zabíraly výšku okna.
   */
  function applyTypeVisibility() {
    arcSettings.style.display = currentType === 'vkr' ? 'block' : 'none';
    vpolSettings.style.display = currentType === 'vpol' ? 'block' : 'none';
    const isElement = currentType !== 'vpol';
    q('coords-title-row').style.display = isElement ? '' : 'none';
    q('coords-fields').style.display = isElement ? '' : 'none';
    updateFormMode();
  }

  container.querySelectorAll('[data-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentType = btn.dataset.type;
      container.querySelectorAll('[data-type]').forEach(b => b.classList.toggle('active', b === btn));
      applyTypeVisibility();
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
  // Tlačítko je v liště jen jako ikona – druhý stav („zpět na VK syntaxi")
  // se pozná podle ikony a tooltipu, popisek na něj nemá místo.
  const CONVERT_STATES = {
    convert: { icon: '⇄', title: 'Konvertovat na ISO G-kód' },
    restore: { icon: '↩', title: 'Obnovit VK syntaxi' },
  };
  let conversionBackup = null;

  function setConvertState(key) {
    convertBtn.textContent = CONVERT_STATES[key].icon;
    convertBtn.title = CONVERT_STATES[key].title;
  }

  function resetConvertState() {
    convertBtn.classList.remove('vk-error-state', 'vk-success-state');
  }

  function resetConversionBackup() {
    conversionBackup = null;
    setConvertState('convert');
  }

  function restoreOriginalVkCode() {
    if (conversionBackup == null) return false;
    gcodeEl.value = conversionBackup;
    conversionBackup = null;
    resetConvertState();
    setConvertState('convert');
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
    applyTypeVisibility();
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
    applyTypeVisibility();
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
    // Popisek řádku („Souřadnice počátečního bodu") zmizel ve prospěch
    // výběru dvojznačnosti – co je to za bod, říkají popisky polí.
    q('coords-title-row').title = first
      ? 'Souřadnice počátečního bodu'
      : 'Cílové souřadnice (X/Z nebo PA/PR k pólu)';
    q('x2-label').textContent = `${first ? 'Start X1' : 'Cíl X2'} (${xUnitLabel})`;
    q('z2-label').textContent = first ? 'Start Z1' : 'Cíl Z2';
    const hideTangent = first || currentType === 'vpol';
    q('tangent-title').style.display = hideTangent ? 'none' : '';
    q('tangent-row').style.display = hideTangent ? 'none' : '';
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
  applyTypeVisibility();

  function refPoint() { return startPoint || lastPoint; }

  /**
   * Směr geometrie, která končí v daném bodě – vytažený z už napsané VK
   * syntaxe.
   *
   * Potřeba pro tečný oblouk, který zůstal ve frontě sám: prvek před ním se
   * mezitím dopočítal a z fronty vypadl, takže jeho směr nikde v paměti
   * není – ale v textu ano.
   *
   * @param {{z:number, x:number}} anchor začátek oblouku (solver prostor = poloměr)
   * @returns {number|null} úhel ve stupních, nebo null když směr nejde určit
   */
  function directionEndingAt(anchor) {
    if (!anchor) return null;
    const parsed = String(gcodeEl.value || '').split(/\r?\n/).map(parseVkLine);
    const chain = buildTextChain(parsed);
    for (let i = chain.length - 1; i >= 0; i -= 1) {
      const segment = chain[i];
      // Z oblouku by tětiva dala jiný směr než jeho tečna v koncovém bodě –
      // oblouk na oblouk je stejně samostatná úloha (esíčko, kategorie 3).
      if (!segment || parsed[i]?.isArc) continue;
      if (Math.abs(segment.end.z - anchor.z) > 1e-6) continue;
      if (Math.abs(inputX(segment.end.x) - anchor.x) > 1e-6) continue;
      return segmentDirectionDeg(segment);
    }
    return null;
  }

  /**
   * Vybere řešení mezi kandidáty. Když je jedno výrazně blíž startu obrysu,
   * vezme ho i bez VPOL1/VPOL2 – ale řekne to (`notes`), aby uživatel věděl,
   * že se rozhodovalo za něj a čím to přebít.
   * @param {Array} candidates
   * @param {'VPOL1'|'VPOL2'|null} tag
   * @param {string[]} notes výstupní kanál pro informaci o auto-výběru
   * @param {(c: any) => {z:number,x:number}} [keyFn] co se u kandidáta měří
   */
  function chooseOrThrow(candidates, tag, notes, keyFn) {
    if (!candidates || candidates.length === 0) throw new Error('žádné řešení (mimo dosah)');
    const choice = chooseSolution(candidates, refPoint(), tag, keyFn);
    if (!choice) throw new Error('dvě možná řešení – zvolte VPOL1 nebo VPOL2');
    if (choice.auto) {
      const ratioText = Number.isFinite(choice.ratio) ? `${fmt(choice.ratio)}×` : 'mnohem';
      notes.push(`bližší řešení zvoleno automaticky (druhé je ${ratioText} dál od startu) – druhou variantu vynutíš zápisem VPOL2`);
    }
    return choice.value;
  }

  /**
   * Dopočet přesně jednoho nedořešeného prvku (kategorie 1, nebo 2/4 se 2 prvky).
   * @returns {{ points: Record<string, {z:number,x:number}>, notes: string[] }}
   */
  function resolveOne(prevEl, currEl) {
    const notes = [];
    if (!prevEl.isArc && !currEl.isArc) {
      return { points: { [prevEl.id]: solveCornerLineLine(prevEl.anchor, prevEl, currEl) }, notes };
    }
    if (prevEl.isArc && currEl.isArc) throw new Error('dva oblouky za sebou zatím nejsou podporované (kategorie 3)');
    // jedna strana je oblouk – T rozlišuje tečné (kat. 2, case 5) od netečného kolem VPOL (kat. 4)
    if (currEl.isArc && currEl.isT) {
      // case 5: přímka/kužel (prevEl, „?") → oblouk (currEl, ZNÁMÝ konec + R), tečně
      const ray = elementRay(prevEl, prevEl.anchor);
      const pts = tangentCircleTouchPoints(ray, { z: currEl.z, x: currEl.x }, currEl.r);
      return { points: { [prevEl.id]: chooseOrThrow(pts, currEl.vpolTag, notes) }, notes };
    }
    if (prevEl.isArc && prevEl.isT) {
      // Oblouk zůstal ve frontě sám: začátek zná (kotva), tečně navazuje na
      // prvek PŘED sebou (ten je už dopočtený, směr se bere z textu) a končí
      // na paprsku následujícího známého prvku.
      const startDirection = directionEndingAt(prevEl.anchor);
      if (startDirection == null) {
        throw new Error('tečný oblouk nemá na co navázat – před ním musí být dopočtená přímka/kužel (oblouk na oblouk zatím nejde)');
      }
      const ends = tangentArcEndOnRay(
        prevEl.anchor, startDirection, prevEl.r, knownElementRay(currEl, startDirection),
      );
      return { points: { [prevEl.id]: chooseOrThrow(ends, currEl.vpolTag, notes) }, notes };
    }
    if (!vpolPoint) throw new Error('nejprve vlož VPOL (netečný oblouk se počítá kolem VPOL)');
    const ray = prevEl.isArc
      ? elementRay(currEl, { z: currEl.z, x: currEl.x })
      : elementRay(prevEl, prevEl.anchor);
    const candidates = solveLineArcJunctionCandidates(ray, vpolPoint, prevEl.isArc ? prevEl.r : currEl.r);
    return { points: { [prevEl.id]: chooseOrThrow(candidates, currEl.vpolTag, notes) }, notes };
  }

  /**
   * Paprsek plně zadaného prvku, kterým se dopočet spouští.
   *
   * Má X i Z, takže sám o sobě směr nenese a `elementRay` by ho odmítl.
   * Platí tu táž konvence jako u kategorie 1 (`solveCornerLineLine`): bez
   * vlastního PA se bere jako KOLMÝ – tady na směr, kterým rozdělaný řetěz
   * začíná. Typický případ válec → rádius → čelo.
   */
  function knownElementRay(currEl, fallbackDirectionDeg) {
    return currEl.pa != null
      ? elementRay(currEl, { z: currEl.z, x: currEl.x })
      : { z0: currEl.z, x0: currEl.x, angleDeg: fallbackDirectionDeg + 90 };
  }

  /** Dopočet dvou nedořešených prvků najednou (kategorie 2, case 6-8: A, oblouk B, pak známý currEl). */
  function resolveTwo(elA, elB, currEl) {
    if (!elB.isArc) throw new Error('prostřední prvek musí být oblouk');
    if (elA.isArc) {
      // Esíčko BEZ úvodní přímky: první oblouk navazuje tečně na už dopočtenou
      // geometrii (její směr se bere z textu), druhý končí na následujícím
      // známém prvku. „Bod zlomu" tu netřeba – tečnost prvního oblouku jeho
      // střed pevně určí, takže soustava vyjde určená sama (viz vkSolver).
      const notes = [];
      const startDirection = directionEndingAt(elA.anchor);
      if (startDirection == null) {
        throw new Error('esíčko nemá na co navázat – před prvním obloukem musí být dopočtená přímka/kužel');
      }
      const candidates = twoTangentArcsFromDirection(
        elA.anchor, startDirection, elA.r, elB.r, knownElementRay(currEl, startDirection),
      );
      if (candidates.length === 0) {
        throw new Error('žádné řešení (s danými poloměry nejde esíčko na tuhle geometrii navázat)');
      }
      const pick = chooseOrThrow(candidates, currEl.vpolTag, notes, (c) => c.junction);
      return { points: { [elA.id]: pick.junction, [elB.id]: pick.foot2 }, notes };
    }
    const notes = [];
    const ray1 = elementRay(elA, elA.anchor);
    const ray2 = elementRay(currEl, { z: currEl.z, x: currEl.x });
    const candidates = tangentCircleBetweenRays(ray1, ray2, elB.r);
    if (candidates.length === 0) throw new Error('žádné řešení (přímky/kužely se s daným R nedají tečně spojit)');
    const pick = chooseOrThrow(candidates, currEl.vpolTag, notes, (c) => c.center);
    return { points: { [elA.id]: pick.foot1, [elB.id]: pick.foot2 }, notes };
  }

  /** Dopočet tří nedořešených prvků najednou (kategorie 3, case 9-11: A, oblouk1, oblouk2, pak známý currEl). */
  function resolveThree(elA, arc1, arc2, currEl) {
    if (!arc1.isArc || !arc2.isArc) throw new Error('prostřední dva prvky musí být oblouky (esíčko)');
    if (elA.isArc) throw new Error('první prvek řetězu musí být přímka/kužel');
    if (!arc2.junction) throw new Error('u druhého oblouku chybí „Bod zlomu" (osa + hodnota) – bez něj má esíčko víc řešení, než kolik je zadáno');
    const notes = [];
    const ray1 = elementRay(elA, elA.anchor);
    const ray2 = elementRay(currEl, { z: currEl.z, x: currEl.x });
    const candidates = twoTangentArcsBetweenRays(ray1, ray2, arc1.r, arc2.r, arc2.junction);
    if (candidates.length === 0) throw new Error('žádné řešení (s danými poloměry a bodem zlomu nejde esíčko sestavit)');
    const pick = chooseOrThrow(candidates, currEl.vpolTag, notes, (c) => c.junction);
    return { points: { [elA.id]: pick.foot1, [arc1.id]: pick.junction, [arc2.id]: pick.foot2 }, notes };
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
    if (cursor === null && pendingQueue.length === 0) {
      // Nic nedořešeného ve frontě – pak je „odebrat prvek" myšleno na
      // poslední hotový řádek syntaxe (typicky naklikaný myší).
      if (!removeLastCodeLine()) { solveInfo.textContent = 'Není co odebrat.'; return; }
      resetFormToNewEntry();
      solveInfo.textContent = 'Odebrán poslední prvek syntaxe';
      updateFormMode();
      updateVkPreview();
      return;
    }
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
    const xValue = parseVkField(vx);
    const zValue = parseVkField(vz);
    if (Number.isNaN(xValue) || Number.isNaN(zValue)) {
      solveInfo.textContent = '⚠ VPOL X/Z – neplatná hodnota, nejde vyhodnotit jako číslo.';
      return;
    }
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

  /**
   * Vloží (nebo při aktivním kurzoru uloží úpravu) prvek podle aktuálního
   * stavu formuláře. Vytažené z obsluhy tlačítka „+", aby stejnou cestou
   * mohlo jít i kreslení myší (`addPointFromCanvas`) – jinak by vznikly dvě
   * mírně odlišné větve generování syntaxe.
   */
  function insertElementFromForm() {
    const editingIndex = cursor;
    const isFirstEver = editingIndex === -1
      ? true
      : (editingIndex !== null ? pendingQueue[editingIndex].wasFirstEver : (pendingQueue.length === 0 && lastPoint === null && !vkChainHasElements(gcodeEl.value)));
    const xStr = q('val-x2').value, zStr = q('val-z2').value;
    const paStr = q('val-pa').value, prStr = q('val-pr').value;
    const rStr = q('val-r').value;
    const isTChecked = !isFirstEver && q('check-t').checked; // na počátečním bodě není na co se tečně napojit
    const vpolTagInput = container.querySelector('[data-id="vpol-tag"]');
    const vpolTag = vpolTagInput ? (vpolTagInput.value || null) : null;
    const cmd = vkElementCommand(currentType, isFirstEver, arcDir);
    const junctionAxis = q('junction-axis').value || null;
    const junctionValStr = q('junction-value').value;

    const xRaw = parseVkField(xStr);
    const zVal = parseVkField(zStr);
    const paVal = parseVkField(paStr);
    const prVal = parseVkField(prStr);
    const rVal = parseVkField(rStr);
    const junctionVal = junctionAxis && junctionValStr.trim() !== '' ? parseVkField(junctionValStr) : null;

    // Neplatný text (překlep, nerozpoznaný výraz) se nesmí propsat do
    // syntaxe jako doslovné "NaN" – radši to appka odmítne a řekne proč.
    if ([xRaw, zVal, paVal, prVal, rVal, junctionVal].some(Number.isNaN)) {
      solveInfo.textContent = '⚠ Některé pole obsahuje text, který nejde vyhodnotit jako číslo.';
      return;
    }

    const el = {
      id: nextElId++,
      isArc: currentType === 'vkr',
      isT: isTChecked,
      dir: currentType === 'vkr' ? arcDir : null,
      xRaw,                                          // pro text (zobrazovaná jednotka)
      x: xRaw == null ? null : toSolverX(xRaw),       // pro geometrii (vkSolver = vždy poloměr)
      z: zVal,
      pa: paVal,
      prRaw: prVal == null ? null : String(prVal),
      r: rVal || 0,
      vpolTag,
      junction: (junctionAxis && junctionValStr.trim() !== '')
        ? {
          axis: junctionAxis,
          rawValue: junctionValStr,
          value: junctionAxis === 'x' ? toSolverX(junctionVal) : junctionVal,
        }
        : null,
      wasFirstEver: isFirstEver,
    };

    const line = buildVkElementLine({
      cmd,
      x: el.xRaw, z: el.z,
      pa: el.pa, pr: el.prRaw,
      r: el.r, isArc: el.isArc,
      vpolTag, isT: isTChecked,
    });

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

    // ── Oblouk se zcela známými souřadnicemi cíle – R vůbec neprojde
    // solverem (ten se volá jen pro nedořešené prvky ve frontě), takže bez
    // tohohle by appka klidně přijala geometricky nemožné R (kratší než
    // půlka tětivy) a náhled by ho tiše nakreslil jako rovnou čáru bez
    // varování. Omezeno na prázdnou frontu – s nedořešenými prvky v ní by
    // `refPoint()` ukazoval na bod PŘED jejich dopočtem, ne na skutečný
    // začátek tohoto oblouku (ten teprve vzejde ze společného řešení).
    if (el.isArc && isKnown && el.r > 0 && pendingQueue.length === 0) {
      // X/Z + PA/PR zároveň: X/Z je počátek oblouku (ne cíl, viz `lastPoint`
      // níž) – tětiva je pak přímo |PR|, ne vzdálenost od předchozího bodu.
      const comboStart = el.pa != null && prVal != null;
      const start = comboStart ? { z: el.z, x: el.x } : refPoint();
      if (start) {
        const chord = comboStart ? Math.abs(prVal) : Math.hypot(el.z - start.z, el.x - start.x);
        const minR = chord / 2;
        if (el.r < minR - 1e-6) {
          solveInfo.textContent = `⚠ Poloměr R${fmt(el.r)} je moc malý pro tuto vzdálenost bodů (${fmt(chord)} mm) – potřeba aspoň R${fmt(minR)}.`;
          return;
        }
      }
    }

    if (isKnown && pendingQueue.length > 0) {
      try {
        let solved;
        if (pendingQueue.length === 1) solved = resolveOne(pendingQueue[0], el);
        else if (pendingQueue.length === 2) solved = resolveTwo(pendingQueue[0], pendingQueue[1], el);
        else solved = resolveThree(pendingQueue[0], pendingQueue[1], pendingQueue[2], el);
        const parts = [];
        for (const item of pendingQueue) {
          const pt = solved.points[item.id];
          patchLine(item, pt);
          parts.push(`Z${fmt(pt.z)} X${fmt(fromSolverX(pt.x))}`);
        }
        lastPoint = solved.points[pendingQueue[pendingQueue.length - 1].id];
        const note = solved.notes?.length ? ` — ${solved.notes.join('; ')}` : '';
        solveInfo.textContent = `✓ Dopočteno: ${parts.join(' | ')}${note}`;
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
      // X/Z + PA/PR zadané zároveň: X/Z je počátek téhle úsečky (ne cíl),
      // PA/PR určí její délku a úhel – skutečný konec (a tedy navazující
      // bod řetězu) se dopočte stejně jako v buildVkPreviewData().
      lastPoint = (el.pa != null && prVal != null)
        ? startAndEndFromXzPaPr(el.x, el.z, el.pa, prVal).end
        : { z: el.z, x: el.x };
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
  }

  container.querySelector('[data-act="element"]').addEventListener('click', insertElementFromForm);

  // ── Režim kreslení myší (state.tool === 'vkDraw') ──────────────
  // Klik do výkresu = doplnit X/Z prvku a rovnou ho vložit. Je to
  // plnohodnotný nástroj CADu (viz `case "vkDraw"` v events.js), takže
  // stejný klik nikdy nekreslí zároveň úsečku jiným nástrojem a funguje
  // i na dotyku (touch.js volá tentýž handleCanvasClick).

  /** @returns {boolean} je právě aktivní VK kreslení? */
  function isDrawMode() {
    return state.tool === 'vkDraw';
  }

  const drawModeBtn = q('draw-mode-btn');

  /**
   * Sesynchronizuje tlačítko ✏️ se skutečným nástrojem a publikuje
   * nastavení prvku pro gumovou čáru. Volá se z `renderAll()`, takže
   * jede s každým pohybem myši – proto se tu jen čtou pole formuláře,
   * nic se nepřepočítává.
   */
  function updateDrawModeButton() {
    const active = isDrawMode();
    if (drawModeBtn) {
      drawModeBtn.classList.toggle('active', active);
      drawModeBtn.title = active
        ? 'Kreslení myší je zapnuté – klikněte pro návrat k výběru'
        : 'Kreslit konturu klikáním do výkresu (každý klik = jeden prvek)';
    }
    state.vkPreview.rubber = active
      ? {
        type: currentType === 'vkr' ? 'arc' : 'line',
        direction: arcDir,
        radius: parseVkField(q('val-r')?.value) || null,
      }
      : null;
  }

  /**
   * Zapíše bod z plátna do formuláře a vloží prvek.
   *
   * PA/PR se schválně vynulují na „?" – `resetFormToNewEntry()` je po
   * každém vložení obnovuje z paměti posledních hodnot a bez toho by se
   * ke kliknutým X/Z přilepil starý polární zápis a prvek by byl
   * přeurčený.
   *
   * @param {number} wx world X (snapnuté už v events.js)
   * @param {number} wy world Y
   */
  function addPointFromCanvas(wx, wy) {
    // Klik do výkresu je vždy NOVÝ prvek. Kdyby kurzor stál na
    // rozeditovaném prvku z fronty (◀ ▶), `insertElementFromForm` by
    // změnu odmítl („prvek by se stal plně známým").
    if (cursor !== null) {
      cursor = null;
      resetFormToNewEntry();
      updateFormMode();
    }
    const pt = worldToVk(wx, wy);
    setUnknownField('val-x2', fmt(pt.x));
    setUnknownField('val-z2', fmt(pt.z));
    setUnknownField('val-pa', null);
    setUnknownField('val-pr', null);
    // VPOL se z plátna neklikají – jeho pole má vlastní sekci.
    if (currentType === 'vpol') {
      const vlBtn = container.querySelector('[data-type="vl"]');
      if (vlBtn) vlBtn.click();
    }
    insertElementFromForm();
    // Po vložení nechat X/Z prázdné. `resetFormToNewEntry()` je jinak
    // obnoví z paměti posledních hodnot a náhled by ke starému bodu
    // kreslil rozepsaný prvek, který uživatel nezadal – vedle gumové
    // čáry k ukazateli by to byla druhá, matoucí čára.
    setUnknownField('val-x2', null);
    setUnknownField('val-z2', null);
    updateVkPreview();
  }

  /**
   * Krok zpět v naklikané kontuře – odebere poslední geometrický řádek
   * syntaxe a dopočte z textu stav řetězu.
   *
   * Klikáním vznikají samé PLNĚ ZNÁMÉ prvky, které do `pendingQueue`
   * nikdy nespadnou, takže ➖ (odebrání nedořešeného prvku) tu nemá co
   * odebírat – tohle je jeho protějšek pro režim kreslení.
   *
   * @returns {boolean} odebralo se něco?
   */
  function removeLastCodeLine() {
    const dropped = dropLastVkElementLine(gcodeEl.value);
    if (!dropped) return false;
    gcodeEl.value = dropped.code;
    vkSave();
    if (firstElement && firstElement.lineText === dropped.removed) firstElement = null;
    // Odebraný řádek může patřit prvku, který čeká ve frontě na dopočet
    // (kombinace ručního zadání s „?" a kreslení myší). Bez tohohle by
    // fronta držela prvek, který v textu už není, a jeho dopočet by pak
    // patchoval řádek, který nikde není.
    pendingQueue = pendingQueue.filter(el => el.lineText !== dropped.removed);
    syncChainFromCode();
    return true;
  }

  /**
   * Dotáhne stav řetězu (poslední/první bod) k tomu, co je v textu.
   * Body z `buildVkPreviewData` jsou v jednotkách textu, závěs řetězu
   * v solver prostoru (poloměr) – viz „Jednotky osy X" nahoře.
   */
  function syncChainFromCode() {
    const data = buildVkPreviewData(gcodeEl.value);
    lastPoint = data.lastPoint ? { z: data.lastPoint.z, x: toSolverX(data.lastPoint.x) } : null;
    startPoint = data.startPoint ? { z: data.startPoint.z, x: toSolverX(data.startPoint.x) } : null;
    chainStarted = lastPoint !== null;
    if (!chainStarted) firstElement = null;
  }

  drawModeBtn?.addEventListener('click', () => {
    if (!bridge.setTool) return;
    const turningOn = !isDrawMode();
    bridge.setTool(turningOn ? 'vkDraw' : 'select');
    // setTool končí renderAll() → updateDrawModeButton() se zavolá samo.
    if (turningOn) showToast('Kreslení VK: každý klik vloží prvek (⌫ zpět, ESC konec)');
  });

  bridge.vkDrawPoint = addPointFromCanvas;
  bridge.vkDrawUndo = () => {
    if (!removeLastCodeLine()) { showToast('VK kontura je prázdná'); return; }
    cursor = null;
    resetFormToNewEntry();
    setUnknownField('val-x2', null);
    setUnknownField('val-z2', null);
    updateFormMode();
    updateVkPreview();
  };
  bridge.updateVkDrawButton = updateDrawModeButton;
  updateDrawModeButton();

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
  const COMMIT_ICON = '📥';
  let commitResetTimer = null;
  commitBtn.addEventListener('click', () => {
    const inserted = bridge.commitVkToDrawing?.(gcodeEl.value) || 0;
    if (!inserted) return;
    // Vložené objekty leží přesně pod náhledem, takže samotné plátno
    // úspěch nepřizná – zpětná vazba musí přijít z tlačítka (jinak by
    // uživatel klikal znovu a vyrobil duplicitní geometrii).
    commitBtn.textContent = '✓';
    showToast(`Vloženo do výkresu: ${inserted} prvků`);
    clearTimeout(commitResetTimer);
    commitResetTimer = setTimeout(() => { commitBtn.textContent = COMMIT_ICON; }, 1800);
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
      setConvertState('restore');

    function parseVkLine(text) {
      // Stejná sada příkazů jako u modulového parseru (viz komentář tam) –
      // `G1` musí projít, jinak by druhá konverze zahodila už převedené řádky.
      const cmdMatch = text.trim().match(/^(G0|G111|G11|G1|G2|G3)\b/);
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
      for (const el of parsed) {
        if (!el || el.cmd === 'G111') continue;

        if (el.isArc) {
          if (cur) {
            el.start = cur;
            cur = null;
          }
          continue;
        }

        if (el.x != null && el.z != null && el.pa != null && el.pr != null) {
          ({ start: el.start, end: el.end } = startAndEndFromXzPaPr(el.x, el.z, el.pa, el.pr));
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
    /** Přepočet náhledu HNED – ⤢ musí rámovat čerstvá data, ne ta z minulého rámce. */
    refreshNow() {
      updateVkPreview();
    },
    /** Vypne kreslení myší (zavření okna / přepnutí na číselnou záložku). */
    stopDrawMode() {
      if (isDrawMode()) bridge.setTool?.('select');
    },
    destroy() {
      if (renderFrame != null) { window.cancelAnimationFrame(renderFrame); renderFrame = null; }
      if (commitResetTimer != null) { clearTimeout(commitResetTimer); commitResetTimer = null; }
      // Bez okna nemá kam bod psát – nástroj by po zavření zůstal viset
      // a klikání do výkresu by nedělalo nic.
      if (isDrawMode()) bridge.setTool?.('select');
      // Odregistrovat jen vlastní zápis; kdyby se mezitím stihlo otevřít
      // nové okno, patří bridge jemu.
      if (bridge.vkDrawPoint === addPointFromCanvas) {
        bridge.vkDrawPoint = null;
        bridge.vkDrawUndo = null;
      }
      if (bridge.updateVkDrawButton === updateDrawModeButton) {
        bridge.updateVkDrawButton = null;
        state.vkPreview.rubber = null;
      }
      // `state.vkPreview` patří oknu (combinedModal.js) – uklízet ho tady
      // by přepsalo náhled okna, které se mezitím stihlo otevřít znovu.
    },
  };
}
