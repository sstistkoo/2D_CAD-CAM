// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Trasování profilu (Profile Trace)                 ║
// ║  Multi-click nástroj pro sběr souřadnic po kontuře         ║
// ╚══════════════════════════════════════════════════════════════╝

import { COLORS } from '../constants.js';
import { state, showToast, toDisplayCoords, axisLabels, displayX, inputX, xPrefix, coordHelpers, pushUndo } from '../state.js';
import { renderAll } from '../render.js';
import { vSign } from '../canvas.js';
import { resetHint, setHint, updateObjectList } from '../ui.js';
import { makeOverlay } from '../dialogFactory.js';
import { showBulgeDialog } from '../dialogs/bulge.js';
import { bulgeToArc, radiusToBulge, safeEvalMath } from '../utils.js';
import { calculateAllIntersections } from '../geometry.js';
// Auto profil / krokování znovupoužívá VÝHRADNĚ existující resolveOuterProfile
// z CAM pipeline (contourBuild.js) — stejná logika jako u CAM tlačítek ⊙ Auto/
// ◀ Krok/Krok ▶, nic se tu znovu nepočítá. segStartPoint/segEndPoint jsou
// souřadnicově agnostické (jen čtou .p1/.p2/.cx/.cz/.startAngle/.endAngle).
import { resolveOuterProfile } from '../calculators/cam/contourBuild.js';
import { segStartPoint, segEndPoint } from '../calculators/cam/camMath.js';

// ── Interní stav trasování ──
let _tracePoints = [];
let _traceSegments = [];
let _traceBulges = [];   // bulge pro každý segment (0 = rovný)
let _traceOverlay = null;
let _selectedTraceIdx = -1; // vybraný bod/segment v panelu
let _choosingSegment = false; // true, pokud je otevřen modal s výběrem segmentu

// ── Auto profil / krokování (⊙ Auto, ◀ Ubrat, Přidat ▶) — stejná logika jako CAM ──
let _cadAutoSegs = null;   // resolveOuterProfile výstup, seříznutý od zvoleného startu
let _cadAutoIdx = 0;       // kolik segmentů z _cadAutoSegs je aktuálně navíc za fixním prefixem
// Fixní prefix = stav trasování (body/segmenty/bulge) v okamžiku, kdy byla
// naposledy zahájena auto/krok session (tj. před přidáním _cadAutoSegs).
// Díky tomu Auto/Krok NEPŘEPISUJÍ ručně dokreslenou část trasy, jen na ni
// navazují od jejího POSLEDNÍHO bodu (viz _cadAutoStartIdx).
let _traceFixedPoints = null;
let _traceFixedSegments = null;
let _traceFixedBulges = null;

/** Zruší náhled auto-profilu (bez dopadu na state.objects). */
function _cadAutoClear() {
  _cadAutoSegs = null;
  _cadAutoIdx = 0;
  _traceFixedPoints = null;
  _traceFixedSegments = null;
  _traceFixedBulges = null;
}

/** Je vrstva objektu viditelná a odemčená? */
function _layerUsable(obj) {
  const layer = state.layers.find(l => l.id === obj.layer);
  return !(layer && (layer.locked || !layer.visible));
}

/**
 * resolveOuterProfile (viz cam/contourBuild.js) je napsaná pro CNC rámec, kde
 * „vnější větev" = nejvyšší X = osa RADIÁLNÍ. V CAD je radiální osa buď wy
 * (soustruh), nebo wx (karusel) — viz stejná konvence jako v _calcIK výše.
 * Aby fungovalo VÝBĚR VĚTVE beze změny té funkce, souřadnice se před voláním
 * přehodí (jen přeznačení, ne zrcadlení) a po výběru zase vrátí přes _fromXZ.
 */
function _toXZ(wx, wy, isKarusel) {
  return isKarusel ? { x: wx, z: wy } : { x: wy, z: wx };
}
function _fromXZ(x, z, isKarusel) {
  return isKarusel ? { x, y: z } : { x: z, y: x };
}

/**
 * Sestaví VŠECHNY viditelné objekty (čáry, oblouky, polyline s bulge) jako
 * normalizované segmenty pro resolveOuterProfile. Kromě přehozených X/Z polí
 * nese každý segment i „cargo" (_origP1/_origP2/_bulge) v PŮVODNÍCH wx/wy —
 * pro rekonstrukci výsledku netřeba nic přepočítávat/zrcadlit zpět (viz níže).
 */
function _cadResolvedCandidateSegments() {
  const isKarusel = state.machineType === 'karusel';
  const toXZ = (wx, wy) => _toXZ(wx, wy, isKarusel);
  const segs = [];
  for (const obj of state.objects) {
    if (!_layerUsable(obj)) continue;
    if (obj.type === 'line') {
      const op1 = { x: obj.x1, y: obj.y1 }, op2 = { x: obj.x2, y: obj.y2 };
      segs.push({ type: 'line', p1: toXZ(op1.x, op1.y), p2: toXZ(op2.x, op2.y), _origP1: op1, _origP2: op2, _bulge: 0 });
    } else if (obj.type === 'arc') {
      const op1 = { x: obj.cx + obj.r * Math.cos(obj.startAngle), y: obj.cy + obj.r * Math.sin(obj.startAngle) };
      const op2 = { x: obj.cx + obj.r * Math.cos(obj.endAngle), y: obj.cy + obj.r * Math.sin(obj.endAngle) };
      const p1 = toXZ(op1.x, op1.y), p2 = toXZ(op2.x, op2.y), c = toXZ(obj.cx, obj.cy);
      const startAngle = Math.atan2(p1.x - c.x, p1.z - c.z);
      const endAngle = Math.atan2(p2.x - c.x, p2.z - c.z);
      const cw = _isClockwise(op1, op2, { x: obj.cx, y: obj.cy });
      const bulge = radiusToBulge(op1, op2, obj.r, cw) || 0;
      segs.push({ type: 'arc', cx: c.x, cz: c.z, r: obj.r, startAngle, endAngle, p1, p2, _origP1: op1, _origP2: op2, _bulge: bulge });
    } else if (obj.type === 'polyline' && obj.vertices) {
      const vs = obj.vertices, bs = obj.bulges || [];
      const pairs = vs.length - 1 + (obj.closed && vs.length > 2 ? 1 : 0);
      for (let i = 0; i < pairs; i++) {
        const va = vs[i], vb = vs[(i + 1) % vs.length];
        const b = bs[i] || 0;
        if (b !== 0) {
          const arc = bulgeToArc(va, vb, b);
          if (arc) {
            const p1 = toXZ(va.x, va.y), p2 = toXZ(vb.x, vb.y), c = toXZ(arc.cx, arc.cy);
            const startAngle = Math.atan2(p1.x - c.x, p1.z - c.z);
            const endAngle = Math.atan2(p2.x - c.x, p2.z - c.z);
            segs.push({ type: 'arc', cx: c.x, cz: c.z, r: arc.r, startAngle, endAngle, p1, p2, _origP1: va, _origP2: vb, _bulge: b });
            continue;
          }
        }
        segs.push({ type: 'line', p1: toXZ(va.x, va.y), p2: toXZ(vb.x, vb.y), _origP1: va, _origP2: vb, _bulge: 0 });
      }
    }
  }
  return segs;
}

/** Index segmentu, jehož START je nejblíž POSLEDNÍMU bodu rozpracované trasy
 *  (_tracePoints, konec) — aby Auto/Krok navazovaly tam, kde trasa aktuálně
 *  končí (i po ručním doplnění jiné dráhy), ne od jejího úplného začátku.
 *  Bez rozpracovaného bodu = od začátku. */
function _cadAutoStartIdx(resolvedSegs, isKarusel) {
  if (!state.drawing || _tracePoints.length === 0) return 0;
  const p0 = _tracePoints[_tracePoints.length - 1];
  let bestI = 0, bestD = Infinity;
  resolvedSegs.forEach((s, i) => {
    const st = segStartPoint(s);
    const orig = _fromXZ(st.x, st.z, isKarusel);
    const d = Math.hypot(orig.x - p0.x, orig.y - p0.y);
    if (d < bestD) { bestD = d; bestI = i; }
  });
  return bestD < 1 ? bestI : 0;
}

/** Přepočítá vyřešenou konturu (resolveOuterProfile) — jednou za Auto/Krok klik. */
function _cadResolveAndSlice() {
  const isKarusel = state.machineType === 'karusel';
  const resolved = resolveOuterProfile(_cadResolvedCandidateSegments()).segs;
  if (!resolved.length) return null;
  const startIdx = _cadAutoStartIdx(resolved, isKarusel);
  return { segs: resolved.slice(startIdx), isKarusel };
}

/**
 * Přepíše _tracePoints/_traceSegments/_traceBulges jako FIXNÍ PREFIX (stav
 * trasy před zahájením aktuální auto/krok session — viz _ensureAutoSession)
 * NAVÝŠENÝ o _cadAutoSegs.slice(0,_cadAutoIdx). Ručně dokreslená část trasy
 * (fixní prefix) se tedy nikdy nezahazuje, Auto/Krok na ni jen navazují.
 */
function _cadApplyAutoState(isKarusel) {
  const segs = (_cadAutoSegs || []).slice(0, _cadAutoIdx);
  const prefixPoints = _traceFixedPoints || [];
  const prefixSegments = _traceFixedSegments || [];
  const prefixBulges = _traceFixedBulges || [];

  if (!segs.length) {
    // Žádný auto segment navíc → zpět na fixní prefix (může být i prázdný).
    _tracePoints = prefixPoints.slice();
    _traceSegments = prefixSegments.slice();
    _traceBulges = prefixBulges.slice();
    state.drawing = _tracePoints.length > 0;
    state.tempPoints = _tracePoints.map(p => ({ x: p.x, y: p.y }));
    state._profileTraceBulges = _traceBulges;
    renderAll();
    updateTracePanel();
    return;
  }

  let points, segments, bulges;
  if (prefixPoints.length > 0) {
    points = prefixPoints.slice();
    segments = prefixSegments.slice();
    bulges = prefixBulges.slice();
  } else {
    const s0 = segStartPoint(segs[0]);
    const p0 = _fromXZ(s0.x, s0.z, isKarusel);
    points = [{ x: p0.x, y: p0.y }];
    segments = [];
    bulges = [];
  }

  for (const s of segs) {
    const e = segEndPoint(s);
    const p2 = _fromXZ(e.x, e.z, isKarusel);
    const bulge = s._bulge || 0;
    const p1 = points[points.length - 1];
    points.push({ x: p2.x, y: p2.y });
    bulges.push(bulge);
    // Typ (přímka/oblouk) už jednou určil resolveOuterProfile (s.type) — NEHÁDAT
    // ho znovu přes _analyzeSegment/_findSegmentCandidates (ta hledá NEJBLIŽŠÍ
    // objekt v toleranci závislé na zoomu a při volnější toleranci by mohla
    // omylem vybrat blízký oblouk i pro skutečnou přímku).
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const angle = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
    if (s.type === 'arc' && bulge !== 0) {
      const arc = bulgeToArc(p1, { x: p2.x, y: p2.y }, bulge);
      segments.push({
        segType: bulge < 0 ? 'G02' : 'G03', dist, angle,
        radius: arc ? arc.r : s.r, centerX: arc ? arc.cx : null, centerY: arc ? arc.cy : null,
      });
    } else {
      segments.push({ segType: 'G01', dist, angle, radius: null, centerX: null, centerY: null });
    }
  }
  _tracePoints = points;
  _traceSegments = segments;
  _traceBulges = bulges;
  state.drawing = true;
  state.tempPoints = _tracePoints.map(p => ({ x: p.x, y: p.y }));
  state._profileTraceBulges = _traceBulges;
  renderAll();
  updateTracePanel();
}

/**
 * Zajistí aktivní auto/krok session: pokud ještě neběží (_cadAutoSegs je
 * null — např. po ručním doplnění bodu, které session ukončí), zafixuje
 * aktuální trasu jako prefix a dopočítá navazující segmenty od jejího
 * POSLEDNÍHO bodu (viz _cadAutoStartIdx). Vrací false, pokud není co
 * profilovat (žádná kontura).
 */
function _ensureAutoSession() {
  if (_cadAutoSegs) return true;
  const prefixPoints = _tracePoints.slice();
  const prefixSegments = _traceSegments.slice();
  const prefixBulges = _traceBulges.slice();
  const r = _cadResolveAndSlice();
  if (!r) return false;
  _traceFixedPoints = prefixPoints;
  _traceFixedSegments = prefixSegments;
  _traceFixedBulges = prefixBulges;
  _cadAutoSegs = r.segs;
  _cadAutoIdx = 0;
  return true;
}

/** ⊙ Auto: od posledního bodu rozpracované trasy (nebo od začátku, pokud
 *  žádná není) odkryje CELÝ zbývající vyřešený profil — jen náhled,
 *  nepotvrzuje (potvrzení = ✓ Dokončit). */
export function autoTrace() {
  if (!_ensureAutoSession()) { showToast('Žádná kontura k profilování'); return; }
  _cadAutoIdx = _cadAutoSegs.length;
  _cadApplyAutoState(state.machineType === 'karusel');
  showToast('Auto profil – uprav ◀ Ubrat/Přidat ▶, Enter = dokončit, Esc = zrušit');
}

/** Přidat ▶: přidá jeden další úsek vyřešeného profilu za konec trasy. */
export function stepTraceForward() {
  if (!_ensureAutoSession()) { showToast('Žádná kontura k profilování'); return; }
  if (_cadAutoIdx >= _cadAutoSegs.length) { showToast('Konec kontury'); return; }
  _cadAutoIdx++;
  _cadApplyAutoState(state.machineType === 'karusel');
}

/**
 * ◀ Ubrat: univerzální krok zpět. Pokud běží auto/krok session s aspoň
 * jedním přidaným úsekem, ubere ten (fixní prefix nedotčen). Jinak funguje
 * jako undo posledního (ručně i auto přidaného) bodu trasy — lze tak
 * postupně odebírat i ručně klikané body, dokud nezůstane jen počáteční bod.
 */
export function stepTraceBackward() {
  if (_cadAutoSegs && _cadAutoIdx > 0) {
    _cadAutoIdx--;
    _cadApplyAutoState(state.machineType === 'karusel');
    return;
  }
  if (_tracePoints.length <= 1) { showToast('Začátek profilu'); return; }
  _cadAutoClear();
  _tracePoints.pop();
  _traceSegments.pop();
  _traceBulges.pop();
  state.tempPoints = _tracePoints.map(p => ({ x: p.x, y: p.y }));
  state._profileTraceBulges = _traceBulges;
  renderAll();
  updateTracePanel();
}

/**
 * Vypočte I a K pro obloukový segment.
 * I = inkrementální vzdálenost startbod→střed v ose X.
 * K = inkrementální vzdálenost startbod→střed v ose Z.
 * @returns {{I: number, K: number}|null}
 */
function _calcIK(segIdx) {
  if (segIdx < 0 || segIdx >= _traceSegments.length) return null;
  const seg = _traceSegments[segIdx];
  if (seg.centerX == null || seg.centerY == null) return null;
  const start = _tracePoints[segIdx];
  const isKarusel = state.machineType === 'karusel';
  // wx = vodorovná osa, wy = svislá osa v editoru
  // Soustruh: X = wy (svislá), Z = wx (vodorovná) → I je delta wy, K je delta wx
  // Karusel:  X = wx (vodorovná), Z = wy (svislá) → I je delta wx, K je delta wy
  const dcx = seg.centerX - start.x; // delta ve world X (vodorovná)
  const dcy = seg.centerY - start.y; // delta ve world Y (svislá)
  if (isKarusel) {
    return { I: displayX(dcx), K: dcy };
  } else {
    return { I: displayX(dcy), K: dcx };
  }
}

/**
 * Najde všechny možné segmenty (přímka + oblouky existujících objektů),
 * po kterých lze trasovat z p1 do p2. První kandidát je vždy přímka (G01).
 */
function _findSegmentCandidates(p1, p2) {
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const angle = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;

  const candidates = [{ segType: 'G01', dist, angle, radius: null, centerX: null, centerY: null }];

  const tol = Math.max(15 / state.zoom, 2);

  for (let i = 0; i < state.objects.length; i++) {
    const obj = state.objects[i];
    // Skip locked/invisible layers
    const layer = state.layers.find(l => l.id === obj.layer);
    if (layer && (layer.locked || !layer.visible)) continue;

    let arc = null;
    if (obj.type === 'circle' || obj.type === 'arc') {
      const d1 = Math.abs(Math.hypot(p1.x - obj.cx, p1.y - obj.cy) - obj.r);
      const d2 = Math.abs(Math.hypot(p2.x - obj.cx, p2.y - obj.cy) - obj.r);
      if (d1 < tol && d2 < tol) arc = { cx: obj.cx, cy: obj.cy, r: obj.r };
    } else if (obj.type === 'polyline') {
      arc = _findPolylineArcForPoints(obj, p1, p2, tol);
    }

    if (arc) {
      const segType = _isClockwise(p1, p2, { x: arc.cx, y: arc.cy }) ? 'G02' : 'G03';
      const dup = candidates.some(c =>
        c.radius != null &&
        Math.abs(c.radius - arc.r) < 1e-6 &&
        Math.abs(c.centerX - arc.cx) < 1e-6 &&
        Math.abs(c.centerY - arc.cy) < 1e-6
      );
      if (!dup) {
        candidates.push({ segType, dist, angle, radius: arc.r, centerX: arc.cx, centerY: arc.cy });
      }
    }
  }

  return candidates;
}

/**
 * Analyzuje segment mezi dvěma body – pokud leží na objektu (oblouk),
 * vrací info o tom. Respektuje manuální bulge.
 */
function _analyzeSegment(p1, p2, bulge) {
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const angle = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;

  // Pokud je manuální bulge, použít ho
  if (bulge && bulge !== 0) {
    const arc = bulgeToArc(p1, p2, bulge);
    if (arc) {
      return {
        segType: bulge < 0 ? 'G02' : 'G03',
        dist, angle,
        radius: arc.r,
        centerX: arc.cx,
        centerY: arc.cy,
      };
    }
  }

  // Výchozí volba: první nalezený oblouk, jinak přímka
  const candidates = _findSegmentCandidates(p1, p2);
  return candidates.find(c => c.segType !== 'G01') || candidates[0];
}

/**
 * Zobrazí modal s možnostmi segmentu (přímka / oblouk(y)) a vrátí Promise,
 * která se vyřeší vybraným kandidátem. Při zavření bez výběru se vrátí první (přímka).
 */
function _chooseSegmentCandidate(candidates) {
  return new Promise((resolve) => {
    const dec = state.displayDecimals;
    let bodyHTML = '<div class="seg-choice-list" style="display:flex;flex-direction:column;gap:6px;">';
    candidates.forEach((c, i) => {
      const label = c.segType === 'G01'
        ? `Přímka — délka ${c.dist.toFixed(dec)} mm`
        : `Oblouk ${c.segType === 'G02' ? 'CW (G02)' : 'CCW (G03)'} — R${c.radius.toFixed(dec)}`;
      bodyHTML += `<button class="calc-btn seg-choice-btn" data-idx="${i}" style="text-align:left">${label}</button>`;
    });
    bodyHTML += '</div>';

    const overlay = makeOverlay('segmentChoice', 'Výběr segmentu profilu', bodyHTML);
    if (!overlay) { resolve(candidates[0]); return; }

    let resolved = false;
    const finish = (val) => {
      if (resolved) return;
      resolved = true;
      if (document.body.contains(overlay)) overlay.remove();
      resolve(val);
    };

    overlay.querySelectorAll('.seg-choice-btn').forEach(btn => {
      btn.addEventListener('click', () => finish(candidates[parseInt(btn.dataset.idx, 10)]));
    });

    new MutationObserver((_, obs) => {
      if (!document.body.contains(overlay)) { obs.disconnect(); finish(candidates[0]); }
    }).observe(document.body, { childList: true });
  });
}

/**
 * Určí, zda oblouk z p1 do p2 kolem centra je CW (G02).
 */
function _isClockwise(p1, p2, center) {
  const cross = (p1.x - center.x) * (p2.y - center.y) -
                (p1.y - center.y) * (p2.x - center.x);
  return cross < 0;
}

/**
 * Najde obloukový segment polyline, na kterém leží oba body.
 */
function _findPolylineArcForPoints(poly, p1, p2, tol) {
  const verts = poly.vertices || [];
  const bulges = poly.bulges || [];
  for (let i = 0; i < verts.length - 1; i++) {
    const b = bulges[i] || 0;
    if (b === 0) continue;
    const arc = bulgeToArc(verts[i], verts[i + 1], b);
    if (!arc) continue;
    const d1 = Math.abs(Math.hypot(p1.x - arc.cx, p1.y - arc.cy) - arc.r);
    const d2 = Math.abs(Math.hypot(p2.x - arc.cx, p2.y - arc.cy) - arc.r);
    if (d1 < tol && d2 < tol) return arc;
  }
  return null;
}

/**
 * Hlavní click handler pro trasování profilu.
 */
export async function handleProfileTraceClick(wx, wy) {
  // Ruční klik přebíjí případný Auto náhled (jiný start / jiná volba) —
  // stejné chování jako u CAM (_addTracePoint tam dělá totéž).
  if (_cadAutoSegs) _cadAutoClear();
  if (!state.drawing) {
    // První bod – start trasování
    _tracePoints = [{ x: wx, y: wy }];
    _traceSegments = [];
    _traceBulges = [];
    state.drawing = true;
    state.tempPoints = [{ x: wx, y: wy }];
    state._profileTraceBulges = _traceBulges;
    setHint('Trasování: klepněte na další bod (R = radius, Enter = dokončit)');
    showToast('Trasování profilu zahájeno');
    renderAll();
    updateTracePanel();
  } else {
    // Další bod
    if (_choosingSegment) return;
    const prev = _tracePoints[_tracePoints.length - 1];
    const p2 = { x: wx, y: wy };
    const candidates = _findSegmentCandidates(prev, p2);

    let seg;
    if (candidates.length > 1) {
      _choosingSegment = true;
      seg = await _chooseSegmentCandidate(candidates);
      _choosingSegment = false;
      // Pokud uživatel mezitím trasování zrušil/dokončil, nic nepřidávat
      if (!state.drawing) return;
    } else {
      seg = candidates[0];
    }

    _tracePoints.push(p2);
    _traceSegments.push(seg);
    _traceBulges.push(0);
    state.tempPoints.push({ x: wx, y: wy });
    state._profileTraceBulges = _traceBulges;
    setHint(`Trasování: ${_tracePoints.length} bodů (R = radius, Enter = dokončit, Esc = zrušit)`);
    renderAll();
    updateTracePanel();
  }
}

/**
 * Dokončí trasování a zobrazí výslednou tabulku.
 */
export function finishProfileTrace() {
  if (_tracePoints.length < 2) {
    showToast('Je potřeba alespoň 2 body');
    return;
  }
  state.drawing = false;
  state.tempPoints = [];
  resetHint();
  renderAll();
  updateTracePanel();
  // Otevřít pravý panel (sidebar) s profilem
  _openRightPanel();
}

/**
 * Otevře pravý sidebar panel aby byl vidět profil.
 */
function _openRightPanel() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar && !sidebar.classList.contains('mobile-open')) {
    sidebar.classList.add('mobile-open');
    if (overlay) overlay.classList.add('active');
  }
}

/**
 * Nastaví bulge na posledním segmentu trasování.
 * Volá se z events.js po dialogu bulge.
 * @param {number} segIdx - index segmentu
 * @param {number} bulge - hodnota bulge
 */
export function setTraceBulge(segIdx, bulge) {
  if (segIdx < 0 || segIdx >= _traceSegments.length) return;
  _traceBulges[segIdx] = bulge;
  state._profileTraceBulges = _traceBulges;
  // Přepočítat segment
  const p1 = _tracePoints[segIdx];
  const p2 = _tracePoints[segIdx + 1];
  _traceSegments[segIdx] = _analyzeSegment(p1, p2, bulge);
  renderAll();
}

/**
 * Vrátí aktuální data trasování pro bulge dialog.
 */
export function getTraceData() {
  return { points: _tracePoints, segments: _traceSegments, bulges: _traceBulges };
}

/**
 * Zruší trasování.
 */
export function cancelProfileTrace() {
  _tracePoints = [];
  _traceSegments = [];
  _traceBulges = [];
  _cadAutoClear();
  state.drawing = false;
  state.tempPoints = [];
  state._profileTraceBulges = [];
  resetHint();
  renderAll();
  updateTracePanel();
}

/**
 * Reset stavu trasování (volá se z resetDrawingState).
 */
export function resetProfileTraceState() {
  _tracePoints = [];
  _traceSegments = [];
  _traceBulges = [];
  _traceOverlay = null;
  _selectedTraceIdx = -1;
  _choosingSegment = false;
  _cadAutoClear();
  state._profileTraceBulges = [];
  updateTracePanel();
}

// ── Export CSV do schránky ──

function _exportCSV() {
  const { H, V, Hp, Vp, fH, fV } = coordHelpers();
  const dec = state.displayDecimals;
  let csv = `N;${Hp}${H};${Vp}${V};Typ;Délka;R;I;K;Úhel\n`;

  _tracePoints.forEach((pt, i) => {
    const d = toDisplayCoords(pt.x, pt.y);
    const hVal = fH(d.x).toFixed(dec);
    const vVal = fV(d.y).toFixed(dec);

    if (i === 0) {
      csv += `${i + 1};${hVal};${vVal};G00;–;–;–;–;–\n`;
    } else {
      const seg = _traceSegments[i - 1];
      const rText = seg.radius !== null ? seg.radius.toFixed(dec) : '–';
      const ik = _calcIK(i - 1);
      const iText = ik ? ik.I.toFixed(dec) : '–';
      const kText = ik ? ik.K.toFixed(dec) : '–';
      csv += `${i + 1};${hVal};${vVal};${seg.segType};${seg.dist.toFixed(dec)};${rText};${iText};${kText};${seg.angle.toFixed(1)}°\n`;
    }
  });

  navigator.clipboard.writeText(csv).then(() => {
    showToast('CSV zkopírováno do schránky ✓');
  }).catch(() => {
    showToast('Nelze zapisovat do schránky');
  });
}

function _copyTable() {
  const { H, V, Hp, Vp, fH, fV } = coordHelpers();
  const dec = state.displayDecimals;
  let text = `N\t${Hp}${H}\t${Vp}${V}\tTyp\tDélka\tR\tI\tK\tÚhel\n`;

  _tracePoints.forEach((pt, i) => {
    const d = toDisplayCoords(pt.x, pt.y);
    const hVal = fH(d.x).toFixed(dec);
    const vVal = fV(d.y).toFixed(dec);

    if (i === 0) {
      text += `${i + 1}\t${hVal}\t${vVal}\tG00\t–\t–\t–\t–\t–\n`;
    } else {
      const seg = _traceSegments[i - 1];
      const rText = seg.radius !== null ? seg.radius.toFixed(dec) : '–';
      const ik = _calcIK(i - 1);
      const iText = ik ? ik.I.toFixed(dec) : '–';
      const kText = ik ? ik.K.toFixed(dec) : '–';
      text += `${i + 1}\t${hVal}\t${vVal}\t${seg.segType}\t${seg.dist.toFixed(dec)}\t${rText}\t${iText}\t${kText}\t${seg.angle.toFixed(1)}°\n`;
    }
  });

  navigator.clipboard.writeText(text).then(() => {
    showToast('Tabulka zkopírována do schránky ✓');
  }).catch(() => {
    showToast('Nelze zapisovat do schránky');
  });
}

// ── Vykreslit profil jako objekty na výkrese ──

/**
 * Vytvoří z trasovaného profilu skutečné objekty (úsečky a oblouky) na výkrese.
 */
export function drawTraceToCanvas() {
  if (_tracePoints.length < 2) { showToast('Žádný profil k vykreslení'); return; }
  pushUndo();
  const created = [];
  for (let i = 0; i < _traceSegments.length; i++) {
    const p1 = _tracePoints[i];
    const p2 = _tracePoints[i + 1];
    const seg = _traceSegments[i];
    const bulge = _traceBulges[i] || 0;
    let obj;

    if ((seg.segType === 'G02' || seg.segType === 'G03') && seg.centerX != null && bulge !== 0) {
      const arc = bulgeToArc(p1, p2, bulge);
      if (arc) {
        const id = state.nextId++;
        obj = {
          type: 'arc',
          cx: arc.cx, cy: arc.cy, r: arc.r,
          startAngle: arc.startAngle, endAngle: arc.endAngle,
          name: `Oblouk ${id}`, id,
          layer: state.activeLayer,
        };
      }
    }

    if (!obj) {
      const id = state.nextId++;
      obj = {
        type: 'line',
        x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
        name: `Úsečka ${id}`, id,
        layer: state.activeLayer,
      };
    }

    state.objects.push(obj);
    created.push(obj);
  }
  updateObjectList();
  calculateAllIntersections();
  showToast(`Profil vykreslen (${created.length} obj.) ✓`);
}

// ── Import profilu z G-kódu ──

/**
 * Zobrazí dialog pro zadání G-kódu a vytvoří z něj trasovací body.
 */
export function importTraceFromGcode() {
  const overlay = makeOverlay();
  const dlg = overlay.querySelector('.dialog') || overlay;
  dlg.style.cssText = 'width:min(420px,95vw);max-height:80vh;display:flex;flex-direction:column;';
  dlg.innerHTML = `
    <h3 style="margin:0 0 8px">📥 Import G-kódu</h3>
    <p style="margin:0 0 6px;font-size:12px;color:#aaa">Zadejte G-kód (G00/G01/G02/G03 X… Z… R…/I… K…):</p>
    <textarea id="gcodeImportArea" rows="10" style="width:100%;box-sizing:border-box;font-family:monospace;font-size:13px;background:#1a1a2e;color:#e0e0e0;border:1px solid #444;border-radius:4px;padding:6px;resize:vertical;" placeholder="G00 X100 Z5\nG01 X100 Z-50\nG02 X80 Z-60 R10\nG01 X80 Z-100"></textarea>
    <div style="display:flex;gap:8px;margin-top:8px;justify-content:flex-end;">
      <button id="gcodeImportCancel" class="calc-btn" style="flex:1">Zrušit</button>
      <button id="gcodeImportOk" class="calc-btn" style="flex:1;background:#2563eb">Importovat</button>
    </div>
  `;

  const ta = dlg.querySelector('#gcodeImportArea');
  const cancelBtn = dlg.querySelector('#gcodeImportCancel');
  const okBtn = dlg.querySelector('#gcodeImportOk');

  cancelBtn.addEventListener('click', () => overlay.remove());

  okBtn.addEventListener('click', () => {
    const text = ta.value.trim();
    if (!text) { showToast('Prázdný vstup'); return; }
    const parsed = _parseGcodeToTrace(text);
    if (!parsed || parsed.points.length < 2) {
      showToast('Nelze rozpoznat G-kód (min. 2 body)');
      return;
    }
    // Set trace state
    _tracePoints = parsed.points;
    _traceBulges = parsed.bulges;
    _traceSegments = [];
    for (let i = 0; i < _tracePoints.length - 1; i++) {
      _traceSegments.push(_analyzeSegment(_tracePoints[i], _tracePoints[i + 1], _traceBulges[i]));
    }
    state.tempPoints = _tracePoints.map(p => [p.x, p.y]);
    state._profileTraceBulges = _traceBulges;
    state.drawing = true;
    state.tool = 'profileTrace';
    _selectedTraceIdx = -1;
    overlay.remove();
    updateTracePanel();
    renderAll();
    showToast(`Import: ${_tracePoints.length} bodů ✓`);
  });

  ta.focus();
}

/**
 * Parsuje text G-kódu na body a bulge.
 * Podporuje G00/G01/G02/G03 s X, Z, R, I, K parametry.
 */
function _parseGcodeToTrace(text) {
  const lines = text.split(/\n/).map(l => l.trim()).filter(l => l && !l.startsWith('(') && !l.startsWith(';') && !l.startsWith('%'));
  const isKarusel = state.machineType === 'karusel';
  const points = [];
  const bulges = [];
  let curX = 0, curZ = 0;
  let curG = 'G00';

  for (const line of lines) {
    const gMatch = line.match(/G0*([0-3])/i);
    if (gMatch) curG = 'G0' + gMatch[1];

    const xMatch = line.match(/X\s*(-?[\d.]+)/i);
    const zMatch = line.match(/Z\s*(-?[\d.]+)/i);
    const rMatch = line.match(/R\s*(-?[\d.]+)/i);
    const iMatch = line.match(/I\s*(-?[\d.]+)/i);
    const kMatch = line.match(/K\s*(-?[\d.]+)/i);

    if (!xMatch && !zMatch) continue;

    if (xMatch) curX = parseFloat(xMatch[1]);
    if (zMatch) curZ = parseFloat(zMatch[1]);

    // Convert CNC coords (X, Z) to canvas coords (wx, wy)
    const wx = isKarusel ? inputX(curX) : curZ;
    const wy = isKarusel ? curZ : inputX(curX);
    const pt = { x: wx, y: wy };

    if (points.length > 0 && (curG === 'G02' || curG === 'G03')) {
      const prev = points[points.length - 1];
      let bulge = 0;

      if (rMatch) {
        const r = parseFloat(rMatch[1]);
        bulge = radiusToBulge(prev, pt, Math.abs(r), curG === 'G02');
        if (bulge === null) bulge = 0;
        if (r < 0) bulge = -bulge;
      } else if (iMatch && kMatch) {
        const iVal = parseFloat(iMatch[1]);
        const kVal = parseFloat(kMatch[1]);
        let cx, cy;
        if (isKarusel) {
          cx = prev.x + inputX(iVal);
          cy = prev.y + kVal;
        } else {
          cx = prev.x + kVal;
          cy = prev.y + inputX(iVal);
        }
        const r = Math.hypot(prev.x - cx, prev.y - cy);
        bulge = radiusToBulge(prev, pt, r, curG === 'G02');
        if (bulge === null) bulge = 0;
      }

      bulges.push(bulge);
    } else if (points.length > 0) {
      bulges.push(0);
    }

    points.push(pt);
  }

  if (points.length < 2) return null;
  return { points, bulges };
}

// ── G-kód jako string (pro CNC editor i clipboard) ──

/**
 * Vrátí G-kód trasování jako string.
 * @returns {string}
 */
export function getTraceGcode() {
  if (_tracePoints.length < 2) return '';
  const { fH, fV } = coordHelpers();
  const dec = state.displayDecimals;
  const isKarusel = state.machineType === 'karusel';
  let gcode = '';

  _tracePoints.forEach((pt, i) => {
    const d = toDisplayCoords(pt.x, pt.y);
    const xVal = isKarusel ? fH(d.x) : fV(d.y);
    const zVal = isKarusel ? d.y : d.x;

    if (i === 0) {
      gcode += `G00 X${xVal.toFixed(dec)} Z${zVal.toFixed(dec)}\n`;
    } else {
      const seg = _traceSegments[i - 1];
      if (seg.segType === 'G02' || seg.segType === 'G03') {
        const rVal = seg.radius !== null ? seg.radius : 0;
        const ik = _calcIK(i - 1);
        if (ik) {
          gcode += `${seg.segType} X${xVal.toFixed(dec)} Z${zVal.toFixed(dec)} I${ik.I.toFixed(dec)} K${ik.K.toFixed(dec)}\n`;
        } else {
          gcode += `${seg.segType} X${xVal.toFixed(dec)} Z${zVal.toFixed(dec)} R${rVal.toFixed(dec)}\n`;
        }
      } else {
        gcode += `G01 X${xVal.toFixed(dec)} Z${zVal.toFixed(dec)}\n`;
      }
    }
  });
  return gcode;
}

// ── Panel v sidebaru ──

/**
 * Aktualizuje panel trasování v pravém sidebaru.
 * Volá se po každém kliku, dokončení, nebo změně bulge.
 */
export function updateTracePanel() {
  const header = document.getElementById('tracePanelHeader');
  const panel = document.getElementById('tracePanel');
  const content = document.getElementById('tracePanelContent');
  if (!header || !panel || !content) return;

  const hasData = _tracePoints.length >= 2;
  header.style.display = hasData ? '' : 'none';
  panel.style.display = hasData ? 'block' : 'none';

  if (!hasData) { content.innerHTML = ''; return; }

  const { H, V, Hp, Vp, fH, fV } = coordHelpers();
  const dec = state.displayDecimals;

  let totalLen = 0;
  _traceSegments.forEach(s => totalLen += s.dist);

  // Kompaktní seznam segmentů
  let html = `<div class="trace-panel-info">Bodů: <b>${_tracePoints.length}</b> · Délka: <b>${totalLen.toFixed(dec)}</b></div>`;
  html += '<ul class="trace-panel-list">';

  _tracePoints.forEach((pt, i) => {
    const d = toDisplayCoords(pt.x, pt.y);
    const hVal = fH(d.x).toFixed(dec);
    const vVal = fV(d.y).toFixed(dec);

    if (i === 0) {
      html += `<li class="trace-panel-item trace-panel-rapid" data-idx="0">
        <span class="trace-panel-n">${i + 1}</span>
        <span class="trace-panel-gcode trace-rapid">G00</span>
        <span class="trace-panel-coords">${Hp}${H}${hVal} ${Vp}${V}${vVal}</span>
      </li>`;
    } else {
      const seg = _traceSegments[i - 1];
      const isArc = seg.segType === 'G02' || seg.segType === 'G03';
      const rText = seg.radius !== null ? ' R' + seg.radius.toFixed(dec) : '';
      const ik = _calcIK(i - 1);
      const ikText = ik ? ` I${ik.I.toFixed(dec)} K${ik.K.toFixed(dec)}` : '';
      const gcClass = isArc ? 'trace-arc-code' : '';

      html += `<li class="trace-panel-item${isArc ? ' trace-panel-arc' : ''}" data-idx="${i}">
        <span class="trace-panel-n">${i + 1}</span>
        <span class="trace-panel-gcode ${gcClass}">${seg.segType}</span>
        <span class="trace-panel-coords">${Hp}${H}${hVal} ${Vp}${V}${vVal}${rText}${ikText}</span>
        <button class="trace-panel-r-btn" data-seg="${i - 1}" title="Radius">⌒</button>
      </li>`;
    }
  });

  html += '</ul>';
  html += `<div class="trace-panel-actions">
    <button id="tracePanelToCnc" class="calc-btn trace-panel-btn" title="Odeslat do CNC editoru">⚙ Do CNC</button>
    <button id="tracePanelToCam" class="calc-btn trace-panel-btn" title="Otevřít v CAM simulátoru">🔄 CAM</button>
    <button id="tracePanelCopy" class="calc-btn trace-panel-btn" title="Kopírovat G-kód">📋 G-kód</button>
    <button id="tracePanelDraw" class="calc-btn trace-panel-btn" title="Vykreslit profil na výkrese">✏ Vykreslit</button>
    <button id="tracePanelImport" class="calc-btn trace-panel-btn" title="Import profilu z G-kódu">📥 G→Profil</button>
    <button id="tracePanelCSV" class="calc-btn trace-panel-btn" title="Kopírovat jako CSV">📊 CSV</button>
    <button id="tracePanelCopyTable" class="calc-btn trace-panel-btn" title="Kopírovat tabulku">📋 Tabulka</button>
  </div>`;

  content.innerHTML = html;

  // Click handlers — segmenty
  content.querySelectorAll('.trace-panel-item').forEach(li => {
    const idx = parseInt(li.dataset.idx, 10);
    // Zvýraznění vybraného
    if (idx === _selectedTraceIdx) li.classList.add('selected');
    li.addEventListener('click', (e) => {
      if (e.target.closest('.trace-panel-r-btn')) return;
      _selectedTraceIdx = idx;
      // Zvýraznit v UI
      content.querySelectorAll('.trace-panel-item').forEach(el => el.classList.remove('selected'));
      li.classList.add('selected');
      // Posunout pohled na bod
      if (idx >= 0 && idx < _tracePoints.length) {
        const pt = _tracePoints[idx];
        state.panX = -pt.x * state.zoom + (state.canvasW || 400) / 2;
        state.panY = -vSign() * pt.y * state.zoom + (state.canvasH || 400) / 2;
        renderAll();
      }
      // Zobrazit vlastnosti
      _showTraceProperties(idx);
    });
  });

  // Radius buttons
  content.querySelectorAll('.trace-panel-r-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const segIdx = parseInt(btn.dataset.seg, 10);
      const p1 = _tracePoints[segIdx];
      const p2 = _tracePoints[segIdx + 1];
      showBulgeDialog(p1, p2, _traceBulges[segIdx] || 0, (newBulge) => {
        setTraceBulge(segIdx, newBulge);
        updateTracePanel();
      });
    });
  });

  // CNC editor button
  const cncBtn = content.querySelector('#tracePanelToCnc');
  if (cncBtn) {
    cncBtn.addEventListener('click', () => {
      const gcode = getTraceGcode();
      if (!gcode) { showToast('Žádná data k exportu'); return; }
      import('../calculators/cncEditor.js').then(m => {
        m.openCncEditor(gcode);
      });
    });
  }

  // CAM simulator button
  const camBtn = content.querySelector('#tracePanelToCam');
  if (camBtn) {
    camBtn.addEventListener('click', () => {
      const gcode = getTraceGcode();
      if (!gcode) { showToast('Žádná data k exportu'); return; }
      import('../calculators/camSimulator.js').then(m => {
        m.openCamSimulator(gcode);
      });
    });
  }

  // Copy G-code button
  const copyBtn = content.querySelector('#tracePanelCopy');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const gcode = getTraceGcode();
      navigator.clipboard.writeText(gcode).then(() => {
        showToast('G-kód zkopírován ✓');
      }).catch(() => {
        showToast('Nelze zapisovat do schránky');
      });
    });
  }

  // Draw to canvas button
  const drawBtn = content.querySelector('#tracePanelDraw');
  if (drawBtn) {
    drawBtn.addEventListener('click', () => drawTraceToCanvas());
  }

  // Import G-code button
  const importBtn = content.querySelector('#tracePanelImport');
  if (importBtn) {
    importBtn.addEventListener('click', () => importTraceFromGcode());
  }

  // CSV button
  const csvBtn = content.querySelector('#tracePanelCSV');
  if (csvBtn) {
    csvBtn.addEventListener('click', () => _exportCSV());
  }

  // Copy table button
  const copyTblBtn = content.querySelector('#tracePanelCopyTable');
  if (copyTblBtn) {
    copyTblBtn.addEventListener('click', () => _copyTable());
  }
}

// ── Přepočet po editaci bodu ──

function _refreshTraceAfterEdit(idx) {
  // Recalculate affected segments (before and after the point)
  if (idx > 0) {
    const segIdx = idx - 1;
    _traceSegments[segIdx] = _analyzeSegment(
      _tracePoints[segIdx], _tracePoints[segIdx + 1], _traceBulges[segIdx]
    );
  }
  if (idx < _traceSegments.length) {
    _traceSegments[idx] = _analyzeSegment(
      _tracePoints[idx], _tracePoints[idx + 1], _traceBulges[idx]
    );
  }
  // Sync state
  state.tempPoints = _tracePoints.map(p => [p.x, p.y]);
  updateTracePanel();
  renderAll();
  // Refresh properties panel with updated computed values
  _showTraceProperties(idx);
}

// ── Zobrazení detailů segmentu ve Vlastnostech ──

function _showTraceProperties(idx) {
  const tbody = document.querySelector('#propTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const { H, V, Hp, Vp, fH, fV } = coordHelpers();
  const isK = state.machineType === 'karusel';
  const dec = state.displayDecimals;

  // Inverse functions for coordinate input (reverse of fH/fV)
  const invH = v => isK ? inputX(v) : v;
  const invV = v => isK ? v : inputX(v);

  function addRow(label, value) {
    const tr = document.createElement('tr');
    const tdL = document.createElement('td');
    tdL.textContent = label;
    const tdV = document.createElement('td');
    tdV.className = 'prop-readonly';
    tdV.textContent = value;
    tr.appendChild(tdL);
    tr.appendChild(tdV);
    tbody.appendChild(tr);
  }

  function addEditRow(label, value, onChange) {
    const tr = document.createElement('tr');
    const tdL = document.createElement('td');
    tdL.textContent = label;
    const tdV = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.className = 'prop-input';
    input.value = parseFloat(value).toFixed(dec);
    input.addEventListener('change', () => {
      const v = safeEvalMath(input.value);
      if (!isNaN(v)) {
        onChange(v);
        _refreshTraceAfterEdit(idx);
      }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      e.stopPropagation();
    });
    input.addEventListener('focus', () => input.select());
    tdV.appendChild(input);
    tr.appendChild(tdL);
    tr.appendChild(tdV);
    tbody.appendChild(tr);
  }

  if (idx < 0 || idx >= _tracePoints.length) return;

  const pt = _tracePoints[idx];
  const d = toDisplayCoords(pt.x, pt.y);
  const hVal = fH(d.x).toFixed(dec);
  const vVal = fV(d.y).toFixed(dec);

  addRow('Bod', `${idx + 1} / ${_tracePoints.length}`);

  // Editable end point coordinates
  addEditRow(`${Hp}${H}`, hVal, (v) => {
    const raw = invH(v);
    _tracePoints[idx].x = state.coordMode === 'inc' ? raw + state.incReference.x : raw;
  });
  addEditRow(`${Vp}${V}`, vVal, (v) => {
    const raw = invV(v);
    _tracePoints[idx].y = state.coordMode === 'inc' ? raw + state.incReference.y : raw;
  });

  if (idx === 0) {
    addRow('Typ', 'G00 – Nájezd');
  } else {
    const seg = _traceSegments[idx - 1];
    const isArc = seg.segType === 'G02' || seg.segType === 'G03';

    // Editable start point coordinates
    const sp = _tracePoints[idx - 1];
    const sd = toDisplayCoords(sp.x, sp.y);
    addEditRow('Start ' + Hp + H, fH(sd.x).toFixed(dec), (v) => {
      const raw = invH(v);
      _tracePoints[idx - 1].x = state.coordMode === 'inc' ? raw + state.incReference.x : raw;
    });
    addEditRow('Start ' + Vp + V, fV(sd.y).toFixed(dec), (v) => {
      const raw = invV(v);
      _tracePoints[idx - 1].y = state.coordMode === 'inc' ? raw + state.incReference.y : raw;
    });

    const typeLabel = seg.segType === 'G01' ? 'G01 – Lineární' :
                      seg.segType === 'G02' ? 'G02 – CW oblouk' :
                      seg.segType === 'G03' ? 'G03 – CCW oblouk' : seg.segType;
    addRow('Typ', typeLabel);
    addRow('Délka', seg.dist.toFixed(dec) + ' mm');
    addRow('Úhel', seg.angle.toFixed(1) + '°');

    if (isArc && seg.radius !== null) {
      // Editable radius
      addEditRow('R', seg.radius.toFixed(dec), (v) => {
        if (v <= 0) return;
        const segIdx = idx - 1;
        const p1 = _tracePoints[segIdx];
        const p2 = _tracePoints[segIdx + 1];
        const newBulge = radiusToBulge(p1, p2, v, seg.segType === 'G02');
        if (newBulge !== null) {
          setTraceBulge(segIdx, newBulge);
        }
      });

      // Read-only center coordinates
      if (seg.centerX != null && seg.centerY != null) {
        const cd = toDisplayCoords(seg.centerX, seg.centerY);
        addRow('Střed ' + Hp + H, fH(cd.x).toFixed(dec));
        addRow('Střed ' + Vp + V, fV(cd.y).toFixed(dec));
      }

      // I / K
      const ik = _calcIK(idx - 1);
      if (ik) {
        addRow('I (inkr.)', ik.I.toFixed(dec));
        addRow('K (inkr.)', ik.K.toFixed(dec));
      }
    }

    // Bulge
    const bulge = _traceBulges[idx - 1] || 0;
    if (bulge !== 0) {
      addRow('Bulge', bulge.toFixed(6));
    }
  }

  // Otevřít panel vlastností, pokud je zavřený
  const propPanel = document.getElementById('propPanel');
  if (propPanel && getComputedStyle(propPanel).display === 'none') {
    propPanel.style.display = 'block';
    const propHeader = propPanel.previousElementSibling;
    if (propHeader) {
      for (const n of propHeader.childNodes) {
        if (n.nodeType === 3) {
          n.textContent = n.textContent.replace(/[▾▸]/, '▾');
          break;
        }
      }
    }
  }

  // Zrušit výběr objektu, aby se Vlastnosti nepřepsaly
  state.selected = null;
  state.selectedSegment = null;
}
