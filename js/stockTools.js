// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Generování polotovaru v CAD                         ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Dva režimy generování:
//   • generateStockFromAllowance(allowance, chamfer, fillet)
//       Aplikuje rovnoměrný přídavek na vnější obrys kontury (offset
//       jednotlivých segmentů ven od osy rotace y=0), s volitelným
//       sražením/zaoblením rohů. Uzávěr polotovaru se uzavře krok
//       dolů na osu y=0 a podél osy zpět.
//   • generateCylinderStock(allowanceX, allowanceZ)
//       Najde ohraničení kontury, přidá přídavky a vytvoří obdélník
//       polotovaru kolem ní (válec ve 2D pohledu soustruhu).
//
// Konvence souřadnic:
//   • CAD plátno: (cad_x, cad_y) — cad_x horizontální, cad_y vertikální (osa
//     rotace soustruhu na y=0, kontura nad osou).
//   • Offset algoritmus v contourOffset.js používá (z = cad_x, x = cad_y) —
//     historické CAM značení. Adaptace probíhá v tomto modulu.

import { state, pushUndo, showToast } from './state.js';
import { calculateAllIntersections } from './geometry.js';
import { updateObjectList } from './ui.js';
import { renderAll } from './render.js';
import { bulgeToArc } from './utils.js';
import { offsetContour } from './calculators/contourOffset.js';

// ── Sběr segmentů kontury z plátna ─────────────────────────────
function _objectsToSegments(objs) {
  const segs = [];
  for (const obj of objs) {
    if (obj.type === 'line') {
      segs.push({
        type: 'line',
        p1: { x: obj.x1, y: obj.y1 },
        p2: { x: obj.x2, y: obj.y2 },
      });
    } else if (obj.type === 'arc') {
      const sa = obj.startAngle, ea = obj.endAngle;
      const ccw = obj.ccw !== false;
      const p1 = { x: obj.cx + obj.r * Math.cos(sa), y: obj.cy + obj.r * Math.sin(sa) };
      const p2 = { x: obj.cx + obj.r * Math.cos(ea), y: obj.cy + obj.r * Math.sin(ea) };
      segs.push({
        type: 'arc',
        p1, p2,
        cx: obj.cx, cy: obj.cy, r: obj.r,
        ccw,
      });
    } else if (obj.type === 'polyline') {
      const vs = obj.vertices || [];
      const bs = obj.bulges || [];
      const count = obj.closed ? vs.length : vs.length - 1;
      for (let i = 0; i < count; i++) {
        const v1 = vs[i], v2 = vs[(i + 1) % vs.length];
        const b = bs[i] || 0;
        if (b !== 0) {
          const arc = bulgeToArc(v1, v2, b);
          if (arc) segs.push({
            type: 'arc',
            p1: { x: v1.x, y: v1.y },
            p2: { x: v2.x, y: v2.y },
            cx: arc.cx, cy: arc.cy, r: arc.r,
            ccw: b > 0,
          });
        } else {
          segs.push({
            type: 'line',
            p1: { x: v1.x, y: v1.y },
            p2: { x: v2.x, y: v2.y },
          });
        }
      }
    } else if (obj.type === 'rect') {
      const x1 = Math.min(obj.x1, obj.x2), x2 = Math.max(obj.x1, obj.x2);
      const y1 = Math.min(obj.y1, obj.y2), y2 = Math.max(obj.y1, obj.y2);
      const c = [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }];
      for (let i = 0; i < 4; i++) segs.push({ type: 'line', p1: c[i], p2: c[(i + 1) % 4] });
    } else if (obj.type === 'circle') {
      const cx = obj.cx, cy = obj.cy, r = obj.r;
      const right = { x: cx + r, y: cy }, left = { x: cx - r, y: cy };
      segs.push({ type: 'arc', p1: right, p2: left, cx, cy, r, ccw: true });
      segs.push({ type: 'arc', p1: left, p2: right, cx, cy, r, ccw: true });
    }
  }
  return segs;
}

function _contourObjects() {
  return state.objects.filter(o =>
    !o.isStock && !o.isDimension && !o.isCoordLabel &&
    o.type !== 'constr' && o.type !== 'text' && o.type !== 'point'
  );
}

// Degenerovaný (nulové délky) segment — typicky přízrak po operaci
// Zaoblení/Zkosení (starý roh zůstane jako 0-délková úsečka místo smazání).
// Stejná ochrana jako v CAM (camSimulator.js) před stavbou řetězu: takový
// segment se nikam nenapojí (oba konce na stejném bodě) a chain-walk by ho
// mylně vyhodnotil jako nesouvislý kus kontury.
function _isDegenerate(seg) {
  const eps = 1e-4;
  if (seg.type === 'line') return Math.hypot(seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y) < eps;
  return seg.r < eps;
}

// Sestavení řetězce — propojení segmentů podle koncových bodů.
// Bi-directional chain walking: rozšiřujeme z obou konců (head i tail),
// aby chain robustně pohltil i kontury, kde se segmenty nejsou v state.objects
// uloženy v lineárním pořadí (např. po offsetech, fillet/chamfer operacích).
// Tolerance 0.01 mm pokrývá zaokrouhlení v render/storage.
function _chainSegments(segs, leftoverOut) {
  if (segs.length === 0) return [];
  const tol = 0.01;
  const eq = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < tol;
  const pool = segs.slice();
  // Start od segmentu s nejvyšším X (pravá strana, sklíčidlo) — tady typicky
  // začíná soustružnická kontura, takže výsledný chain bude orientovaný
  // přirozeně (zprava doleva).
  let bestIdx = 0, bestX = -Infinity;
  for (let i = 0; i < pool.length; i++) {
    const sx = Math.max(pool[i].p1.x, pool[i].p2.x);
    if (sx > bestX) { bestX = sx; bestIdx = i; }
  }
  const chain = [pool.splice(bestIdx, 1)[0]];
  let safety = pool.length * 2 + 5;
  let extended = true;
  while (pool.length > 0 && extended && safety-- > 0) {
    extended = false;
    // Forward: navázat za tail
    const tail = chain[chain.length - 1].p2;
    let fIdx = -1, fRev = false;
    for (let i = 0; i < pool.length; i++) {
      const s = pool[i];
      if (eq(s.p1, tail)) { fIdx = i; break; }
      if (eq(s.p2, tail)) { fIdx = i; fRev = true; break; }
    }
    if (fIdx !== -1) {
      const seg = pool.splice(fIdx, 1)[0];
      if (fRev) {
        const tmp = seg.p1; seg.p1 = seg.p2; seg.p2 = tmp;
        if (seg.type === 'arc') seg.ccw = !seg.ccw;
      }
      chain.push(seg);
      extended = true;
      continue;
    }
    // Backward: navázat před head
    const head = chain[0].p1;
    let bIdx = -1, bRev = false;
    for (let i = 0; i < pool.length; i++) {
      const s = pool[i];
      if (eq(s.p2, head)) { bIdx = i; break; }
      if (eq(s.p1, head)) { bIdx = i; bRev = true; break; }
    }
    if (bIdx !== -1) {
      const seg = pool.splice(bIdx, 1)[0];
      if (bRev) {
        const tmp = seg.p1; seg.p1 = seg.p2; seg.p2 = tmp;
        if (seg.type === 'arc') seg.ccw = !seg.ccw;
      }
      chain.unshift(seg);
      extended = true;
    }
  }
  if (leftoverOut) leftoverOut.push(...pool);
  return chain;
}

// ── Kontrola uzavřenosti/validity kontury ──────────────────────
// Vrátí pole bodů (cad souřadnice) v místech, kde je kontura přerušená:
//  - konce hlavního řetězu, pokud netvoří uzavřenou smyčku,
//  - koncové body segmentů, které se do hlavního řetězu nepodařilo napojit.
// Prázdné pole = kontura je v pořádku (uzavřená a souvislá).
export function findContourGaps() {
  const objs = _contourObjects();
  if (objs.length === 0) return [];
  const segs = _objectsToSegments(objs);
  if (segs.length === 0) return [];
  const tol = 0.01;
  const eq = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < tol;

  // Sbírej všechny koncové body všech segmentů
  const pts = [];
  for (const s of segs) {
    pts.push({ x: s.p1.x, y: s.p1.y });
    pts.push({ x: s.p2.x, y: s.p2.y });
  }

  // Bod je mezera jen tehdy, pokud u něj končí přesně jeden segment
  // (= volný konec). Spoj dvou segmentů má count=2, větvení count=3 — oboje ok.
  const gaps = [];
  const counted = new Array(pts.length).fill(false);
  for (let i = 0; i < pts.length; i++) {
    if (counted[i]) continue;
    let count = 1;
    for (let j = i + 1; j < pts.length; j++) {
      if (!counted[j] && eq(pts[i], pts[j])) {
        count++;
        counted[j] = true;
      }
    }
    counted[i] = true;
    if (count === 1) gaps.push({ x: pts[i].x, y: pts[i].y });
  }
  return gaps;
}

// Segment ležící celý na ose rotace (cad_y ≈ 0 na obou koncích) reprezentuje
// osu/podlahu polotovaru, ne skutečný povrch — offsetováním by se posunul na
// špatnou stranu (pod osu). Uzávěr polotovaru k ose si generateStockFromAllowance
// dopočítá sama (viz caps níže), takže takové úsečky z offsetu vynecháme.
function _isAxisLine(seg) {
  const tol = 0.01;
  return seg.type === 'line' && Math.abs(seg.p1.y) < tol && Math.abs(seg.p2.y) < tol;
}

// ── Konverze CAD canvas ↔ CAM (z = cad_x, x = cad_y) ───────────
function _cadSegmentsToCam(chain) {
  // Pro řetězení segmentů v CAM značení: line a arc segmenty s konvencí:
  //   z = cad_x (horizontální), x = cad_y (vertikální)
  //   atan2(P.x_cam - cx_cam, P.z_cam - cz_cam) ≡ atan2(dy_cad, dx_cad) (standard)
  //   G3 = CCW (= cad ccw=true), G2 = CW (= cad ccw=false)
  return chain.map(s => {
    if (s.type === 'line') {
      return {
        type: 'line',
        p1: { x: s.p1.y, z: s.p1.x },
        p2: { x: s.p2.y, z: s.p2.x },
      };
    }
    // arc
    const cx_cam = s.cy, cz_cam = s.cx;
    const startAngle = Math.atan2(s.p1.y - cx_cam, s.p1.x - cz_cam);
    const endAngle   = Math.atan2(s.p2.y - cx_cam, s.p2.x - cz_cam);
    return {
      type: 'arc',
      p1: { x: s.p1.y, z: s.p1.x },
      p2: { x: s.p2.y, z: s.p2.x },
      cx: cx_cam, cz: cz_cam, r: s.r,
      dir: s.ccw ? 'G3' : 'G2',
      startAngle, endAngle,
    };
  });
}

function _reverseCamChain(chain) {
  const out = [];
  for (let i = chain.length - 1; i >= 0; i--) {
    const s = chain[i];
    if (s.type === 'line') {
      out.push({ type: 'line', p1: s.p2, p2: s.p1 });
    } else {
      out.push({
        type: 'arc',
        p1: s.p2, p2: s.p1,
        cx: s.cx, cz: s.cz, r: s.r,
        dir: s.dir === 'G2' ? 'G3' : 'G2',
        startAngle: s.endAngle,
        endAngle: s.startAngle,
      });
    }
  }
  return out;
}

// Direction check: normála `getNormal` v contourOffset má pravidlo {x:-dz, z:dx}.
// Pro každý LINE segment přidáme do skóre projekci normály do směru ven od osy
// (CAM x = ven od osy rotace). Když je suma kladná, řetězec je orientovaný správně.
function _isOutwardDirection(camChain) {
  let score = 0;
  for (const s of camChain) {
    if (s.type !== 'line') continue;
    const dx = s.p2.x - s.p1.x, dz = s.p2.z - s.p1.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-9) continue;
    const nx = -dz / len; // x-složka normály
    const midX = (s.p1.x + s.p2.x) / 2;
    // Když je midX > 0 (nad osou rotace), chceme normála ven (nx > 0).
    // Když < 0 (pod osou), chceme nx < 0. Skóre = nx * sign(midX) * len.
    score += nx * Math.sign(midX || 1) * len;
  }
  return score >= 0;
}

// ── Konverze CAM výstupu → CAD canvas objekty ──────────────────
function _camSegmentToCadObject(seg) {
  if (seg.type === 'line') {
    return {
      type: 'line',
      x1: seg.p1.z, y1: seg.p1.x,
      x2: seg.p2.z, y2: seg.p2.x,
    };
  }
  // arc: cad cx = cam cz, cad cy = cam cx
  return {
    type: 'arc',
    cx: seg.cz, cy: seg.cx, r: seg.r,
    startAngle: seg.startAngle,
    endAngle: seg.endAngle,
    ccw: seg.dir === 'G3',
  };
}

// ── Společné: dávkové přidání objektů (polotovar nebo kontura) ──
// asContour=true → bez isStock=true, normální vrstva (přídavek jako kontura
// pro obrobek před tepelným zpracováním).
function _addStockObjects(cadObjLikes, asContour = false) {
  if (cadObjLikes.length === 0) return 0;
  pushUndo();
  const baseLayer = state.activeLayer;
  const prefix = asContour ? 'Přídavek' : 'Polotovar';
  let added = 0;
  for (const o of cadObjLikes) {
    const id = state.nextId++;
    const obj = {
      ...o,
      id,
      layer: baseLayer,
      name: o.type === 'arc' ? `${prefix} oblouk ${id}` : `${prefix} úsečka ${id}`,
    };
    if (!asContour) obj.isStock = true;
    state.objects.push(obj);
    added++;
  }
  updateObjectList();
  calculateAllIntersections();
  renderAll();
  return added;
}

// ══════════════════════════════════════════════════════════════
// ║  PUBLIC: Auto přídavek na plochu (offset kontury)            ║
// ══════════════════════════════════════════════════════════════
export function generateStockFromAllowance({ allowance, chamfer = 0, fillet = 0, asContour = false }) {
  const objs = _contourObjects();
  if (objs.length === 0) {
    showToast('Žádné objekty kontury — nejdřív nakreslete obrys.');
    return { ok: false };
  }
  // Stejně jako CAM (dráhy/offset v camSimulator.js): kontura pro soustružení
  // je jednostranný profil, ne uzavřený polygon. Volné konce, kde profil
  // vychází/vrací se k ose rotace (typicky Z=0 čelo a konec obrobku), jsou
  // OČEKÁVANÉ a uzávěr k ose (caps níže) je dopočítá automaticky — nevyžadujeme
  // ruční uzavření kontury na ose. Blokujeme jen skutečně nesouvislé kusy
  // (víc než jeden řetěz), které by chain-walk nedokázal spojit do jedné dráhy.
  const cadSegs = _objectsToSegments(objs).filter(s => !_isAxisLine(s) && !_isDegenerate(s));
  if (cadSegs.length === 0) {
    showToast('Konturu nelze sestavit z aktuálních objektů.');
    return { ok: false };
  }
  const leftover = [];
  const cadChain = _chainSegments(cadSegs, leftover);
  if (cadChain.length === 0) {
    showToast('Kontura není propojená.');
    return { ok: false };
  }
  if (leftover.length > 0) {
    state.contourGaps = findContourGaps();
    renderAll();
    showToast('Kontura má nesouvislé části — opravte vyznačená místa před generováním polotovaru.');
    return { ok: false };
  }
  state.contourGaps = [];
  let camChain = _cadSegmentsToCam(cadChain);

  // Zajištění správné orientace (normála ven od osy y=0)
  if (!_isOutwardDirection(camChain)) {
    camChain = _reverseCamChain(camChain);
  }

  const offset = offsetContour(camChain, { allowance, chamfer, fillet });
  if (!offset || offset.length === 0) {
    showToast('Offset selhal — zkuste menší přídavek nebo zkontrolujte konturu.');
    return { ok: false };
  }

  // Koncové uzávěry: ze začátku offset chain dolů na osu (x=0 v CAM), podél osy
  // až pod koncový bod offset chain a zpět nahoru — uzavřený polygon polotovaru.
  const startPt = offset[0].type === 'line'
    ? offset[0].p1
    : { x: offset[0].cx + Math.sin(offset[0].startAngle) * offset[0].r,
        z: offset[0].cz + Math.cos(offset[0].startAngle) * offset[0].r };
  const lastSeg = offset[offset.length - 1];
  const endPt = lastSeg.type === 'line'
    ? lastSeg.p2
    : { x: lastSeg.cx + Math.sin(lastSeg.endAngle) * lastSeg.r,
        z: lastSeg.cz + Math.cos(lastSeg.endAngle) * lastSeg.r };

  const caps = [
    { type: 'line', p1: { x: endPt.x, z: endPt.z }, p2: { x: 0, z: endPt.z } },
    { type: 'line', p1: { x: 0, z: endPt.z }, p2: { x: 0, z: startPt.z } },
    { type: 'line', p1: { x: 0, z: startPt.z }, p2: { x: startPt.x, z: startPt.z } },
  ];
  const fullStock = [...offset, ...caps];

  // Filtr degenerovaných (nulové délky) segmentů
  const eps = 1e-3;
  const cleaned = fullStock.filter(s => {
    if (s.type === 'line') return Math.hypot(s.p2.x - s.p1.x, s.p2.z - s.p1.z) > eps;
    return s.r > eps;
  });

  const cadObjs = cleaned.map(_camSegmentToCadObject);
  const n = _addStockObjects(cadObjs, asContour);
  const label = asContour ? 'Přídavek' : 'Polotovar';
  showToast(`${label} vytvořen (${n} segmentů, přídavek ${allowance} mm).`);
  return { ok: true, count: n };
}

// ══════════════════════════════════════════════════════════════
// ║  PUBLIC: Polotovar tvaru válce (obdélník kolem kontury)      ║
// ══════════════════════════════════════════════════════════════
export function generateCylinderStock({ allowanceX, allowanceZ, asContour = false }) {
  const objs = _contourObjects();
  if (objs.length === 0) {
    showToast('Žádné objekty kontury — nejdřív nakreslete obrys.');
    return { ok: false };
  }
  const gaps = findContourGaps();
  state.contourGaps = gaps;
  if (gaps.length > 0) {
    renderAll();
    showToast('Pozor: kontura má mezery (vyznačeno červeně) — válcový polotovar bude vytvořen, ale obrys zkontrolujte.');
  }

  // Bbox: xMin, xMax (osa Z), yMax (max poloměr). Osu rotace bereme jako y=0.
  let xMin = Infinity, xMax = -Infinity, yMax = 0;
  for (const o of objs) {
    if (o.type === 'line') {
      xMin = Math.min(xMin, o.x1, o.x2);
      xMax = Math.max(xMax, o.x1, o.x2);
      yMax = Math.max(yMax, o.y1, o.y2);
    } else if (o.type === 'arc') {
      // Extrémy oblouku v X i Y (přibližné — vezmeme endpoints + center extrémy
      // pokud leží v zametaném úseku)
      const sa = o.startAngle, ea = o.endAngle;
      const ccw = o.ccw !== false;
      const x1 = o.cx + o.r * Math.cos(sa), y1 = o.cy + o.r * Math.sin(sa);
      const x2 = o.cx + o.r * Math.cos(ea), y2 = o.cy + o.r * Math.sin(ea);
      xMin = Math.min(xMin, x1, x2); xMax = Math.max(xMax, x1, x2);
      yMax = Math.max(yMax, y1, y2);
      // Extremes only if arc passes through them
      const passes = (target) => {
        let s = sa, e = ea;
        const norm = (a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const t = norm(target), ns = norm(s), ne = norm(e);
        if (ccw) {
          if (ne >= ns) return t >= ns && t <= ne;
          return t >= ns || t <= ne;
        }
        if (ns >= ne) return t <= ns && t >= ne;
        return t <= ns || t >= ne;
      };
      if (passes(0)) xMax = Math.max(xMax, o.cx + o.r);
      if (passes(Math.PI)) xMin = Math.min(xMin, o.cx - o.r);
      if (passes(Math.PI / 2)) yMax = Math.max(yMax, o.cy + o.r);
    } else if (o.type === 'circle') {
      xMin = Math.min(xMin, o.cx - o.r);
      xMax = Math.max(xMax, o.cx + o.r);
      yMax = Math.max(yMax, o.cy + o.r);
    } else if (o.type === 'rect') {
      xMin = Math.min(xMin, o.x1, o.x2);
      xMax = Math.max(xMax, o.x1, o.x2);
      yMax = Math.max(yMax, o.y1, o.y2);
    } else if (o.type === 'polyline') {
      for (const v of (o.vertices || [])) {
        xMin = Math.min(xMin, v.x);
        xMax = Math.max(xMax, v.x);
        yMax = Math.max(yMax, v.y);
      }
    }
  }
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) {
    showToast('Konturu nelze vyhodnotit.');
    return { ok: false };
  }

  const x1 = xMin - allowanceZ;
  const x2 = xMax + allowanceZ;
  const y1 = 0;
  const y2 = yMax + allowanceX;

  const corners = [
    { x: x1, y: y1 }, { x: x2, y: y1 },
    { x: x2, y: y2 }, { x: x1, y: y2 },
  ];
  const objLikes = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    objLikes.push({ type: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }
  const n = _addStockObjects(objLikes, asContour);
  const d = (y2 - y1) * 2; // průměr v DIAMON (kontura je polovina nad osou)
  const label = asContour ? 'Přídavek (válec)' : 'Polotovar (válec)';
  showToast(`${label} ${(x2 - x1).toFixed(1)} × ⌀${d.toFixed(1)} mm vytvořen.`);
  return { ok: true, count: n };
}
