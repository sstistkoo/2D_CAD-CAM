import { getArcParams } from './camMath.js';
import { state } from '../../state.js';
import { bulgeToArc } from '../../utils.js';

// ── G-code parser (manual code → sim path) ─────────────────────
export function parseManualGCodeToPath(code, prms, unflipArc) {
  const lines = code.split('\n');
  const path = [];
  let currentX = parseFloat(prms.safeX) / 2;
  let currentZ = parseFloat(prms.safeZ);
  let lastMoveType = 'G0';
  path.push({ x: currentX, z: currentZ, type: 'G0' });
  lines.forEach((line, idx) => {
    let clean = line.toUpperCase().trim();
    if (!clean || clean.startsWith(';') || clean.startsWith('(') || clean.startsWith('%')) return;
    // Strip inline comments
    const semiIdx = clean.indexOf(';');
    if (semiIdx >= 0) clean = clean.substring(0, semiIdx).trim();
    const parenIdx = clean.indexOf('(');
    if (parenIdx >= 0) clean = clean.substring(0, parenIdx).trim();
    if (!clean) return;
    const gMatch = clean.match(/\bG0?([0-3])\b/);
    // Řezání závitu (G33 Sinumerik/Heidenhain, G32 Fanuc) — pro simulaci
    // přímý řezný pohyb jako G1 (K/F na řádku je stoupání, ne oblouk).
    const thrMatch = !gMatch && /\bG3[23]\b/.test(clean);
    const type = thrMatch ? 'G1' : (gMatch ? 'G' + gMatch[1] : lastMoveType);
    const xMatch = clean.match(/[XU]([-]?\d*\.?\d+)/);
    const zMatch = clean.match(/[ZW]([-]?\d*\.?\d+)/);
    const rMatch = clean.match(/(?:R|CR=)([-]?\d*\.?\d+)/);
    const iMatch = clean.match(/I([-]?\d*\.?\d+)/);
    const kMatch = clean.match(/K([-]?\d*\.?\d+)/);
    let targetX = currentX, targetZ = currentZ, hasMove = false;
    if (xMatch) { targetX = prms.mode === 'DIAMON' ? parseFloat(xMatch[1]) / 2 : parseFloat(xMatch[1]); hasMove = true; }
    if (zMatch) { targetZ = parseFloat(zMatch[1]); hasMove = true; }
    if (gMatch || thrMatch) lastMoveType = type;
    if (hasMove) {
      if (type === 'G0' || type === 'G1') {
        path.push({ x: targetX, z: targetZ, type, originalLineIdx: idx });
      } else if (type === 'G2' || type === 'G3') {
        let arcR = rMatch ? parseFloat(rMatch[1]) : 0;
        if (!arcR && (iMatch || kMatch)) {
          const ci = iMatch ? parseFloat(iMatch[1]) : 0;
          const ck = kMatch ? parseFloat(kMatch[1]) : 0;
          arcR = Math.hypot(ci, ck);
        }
        if (arcR) {
          const p1 = { x: currentX, z: currentZ };
          const p2 = { x: targetX, z: targetZ };
          // Text už může mít G2/G3 prohozené kvůli flipX/flipZ (viz flipArc
          // v generateAutoGCode) — pro správný výpočet středu/směru oblouku
          // ve světových souřadnicích (a tedy správné zrcadlení v draw())
          // se musíme vrátit ke kanonickému smyslu otáčení.
          const effType = unflipArc ? (type === 'G2' ? 'G3' : 'G2') : type;
          const arc = getArcParams(p1, p2, arcR, effType);
          if (!arc.error) {
            let sA = Math.atan2(p1.x - arc.cx, p1.z - arc.cz);
            let eA = Math.atan2(p2.x - arc.cx, p2.z - arc.cz);
            if (effType === 'G2' && eA > sA) eA -= 2 * Math.PI;
            if (effType === 'G3' && eA < sA) eA += 2 * Math.PI;
            // Počet vzorků úměrný délce oblouku (r·|úhel|), ne pevných 10 —
            // jinak by se degenerovaný mikro-oblouk (např. 0,02 mm) rozdělil
            // na 10 bodů a přehrávání simulace by na něm „zamrzlo".
            const arcLen = arc.r * Math.abs(eA - sA);
            const steps = Math.max(1, Math.min(48, Math.ceil(arcLen / 0.4)));
            for (let j = 1; j <= steps; j++) {
              const a = sA + (eA - sA) * (j / steps);
              const pt = { x: arc.cx + Math.sin(a) * arc.r, z: arc.cz + Math.cos(a) * arc.r, type, originalLineIdx: idx };
              if (j === 1) pt.arcParams = { cx: arc.cx, cz: arc.cz, r: arc.r, startAngle: sA, endAngle: eA, dir: type, tessSteps: steps };
              path.push(pt);
            }
          } else {
            path.push({ x: targetX, z: targetZ, type, originalLineIdx: idx });
          }
        } else {
          path.push({ x: targetX, z: targetZ, type, originalLineIdx: idx });
        }
      }
      currentX = targetX; currentZ = targetZ;
    } else if (gMatch) {
      path.push({ x: currentX, z: currentZ, type, originalLineIdx: idx });
    }
  });
  return path;
}

// ── contour G-code parser (for initial import) ─────────────────
// ──────────────────────────────────────────────────────────────
// Konverze nakreslených „polotovar" objektů (isStock = true) na
// stockPoints pro CAM. Lines, arcs, polylines, rects → chain.
// ──────────────────────────────────────────────────────────────
export function buildStockPointsFromCanvas(camParams) {
  const stockObjs = state.objects.filter(o =>
    o.isStock && !o.isDimension && !o.isCoordLabel &&
    o.type !== 'constr' && o.type !== 'text' && o.type !== 'point'
  );
  if (stockObjs.length === 0) return [];

  // Rozložit polyline/rect na úsečky a oblouky, sjednotit s lines/arcs.
  /** @type {{p1:{x:number,y:number}, p2:{x:number,y:number}, type:'line'|'arc', cx?:number, cy?:number, r?:number, ccw?:boolean}[]} */
  const segs = [];
  for (const obj of stockObjs) {
    if (obj.type === 'line') {
      segs.push({ p1: { x: obj.x1, y: obj.y1 }, p2: { x: obj.x2, y: obj.y2 }, type: 'line' });
    } else if (obj.type === 'arc') {
      const sa = obj.startAngle, ea = obj.endAngle;
      const p1 = { x: obj.cx + obj.r * Math.cos(sa), y: obj.cy + obj.r * Math.sin(sa) };
      const p2 = { x: obj.cx + obj.r * Math.cos(ea), y: obj.cy + obj.r * Math.sin(ea) };
      segs.push({ p1, p2, type: 'arc', cx: obj.cx, cy: obj.cy, r: obj.r, ccw: true });
    } else if (obj.type === 'polyline') {
      const vs = obj.vertices || [];
      const bs = obj.bulges || [];
      const count = obj.closed ? vs.length : vs.length - 1;
      for (let i = 0; i < count; i++) {
        const v1 = vs[i], v2 = vs[(i + 1) % vs.length];
        const b = bs[i] || 0;
        if (b !== 0) {
          const arc = bulgeToArc(v1, v2, b);
          if (arc) segs.push({ p1: { x: v1.x, y: v1.y }, p2: { x: v2.x, y: v2.y }, type: 'arc', cx: arc.cx, cy: arc.cy, r: arc.r, ccw: b > 0 });
        } else {
          segs.push({ p1: { x: v1.x, y: v1.y }, p2: { x: v2.x, y: v2.y }, type: 'line' });
        }
      }
    } else if (obj.type === 'rect') {
      const x1 = Math.min(obj.x1, obj.x2), x2 = Math.max(obj.x1, obj.x2);
      const y1 = Math.min(obj.y1, obj.y2), y2 = Math.max(obj.y1, obj.y2);
      const c = [{x:x1,y:y1},{x:x2,y:y1},{x:x2,y:y2},{x:x1,y:y2}];
      for (let i = 0; i < 4; i++) segs.push({ p1: c[i], p2: c[(i + 1) % 4], type: 'line' });
    } else if (obj.type === 'circle') {
      // Kružnice → dva půlkruhy (rozdělené vodorovně), aby vznikl uzavřený řetězec.
      const cx = obj.cx, cy = obj.cy, r = obj.r;
      const right = { x: cx + r, y: cy }, left = { x: cx - r, y: cy };
      segs.push({ p1: right, p2: left, type: 'arc', cx, cy, r, ccw: true });
      segs.push({ p1: left,  p2: right, type: 'arc', cx, cy, r, ccw: true });
    }
  }
  if (segs.length === 0) return [];

  // Seřadit do řetězce – propojit segmenty podle koncových bodů.
  // Tolerance 0.01 mm pokrývá výsledky offset+trim (zaokrouhlování v render).
  // Bi-directional walking: chain rozšiřujeme z obou konců, aby se vždy
  // sebraly všechny propojené segmenty bez ohledu na pořadí v state.objects.
  const tol = 0.01;
  const eq = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < tol;
  // Vyber startovní segment s nejvyšším X (pravá strana, blízko sklíčidla)
  // — vhodný startpoint pro polotovar v soustružnické konvenci.
  let bestIdx = 0, bestX = -Infinity;
  for (let i = 0; i < segs.length; i++) {
    const sx = Math.max(segs[i].p1.x, segs[i].p2.x);
    if (sx > bestX) { bestX = sx; bestIdx = i; }
  }
  const chain = [segs.splice(bestIdx, 1)[0]];
  let safety = segs.length * 2 + 5;
  let extended = true;
  while (segs.length > 0 && extended && safety-- > 0) {
    extended = false;
    // 1) Forward: navázat za konec
    const tail = chain[chain.length - 1].p2;
    let fIdx = -1, fRev = false;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (eq(s.p1, tail)) { fIdx = i; break; }
      if (eq(s.p2, tail)) { fIdx = i; fRev = true; break; }
    }
    if (fIdx !== -1) {
      const seg = segs.splice(fIdx, 1)[0];
      if (fRev) {
        const tmp = seg.p1; seg.p1 = seg.p2; seg.p2 = tmp;
        if (seg.type === 'arc') seg.ccw = !seg.ccw;
      }
      chain.push(seg);
      extended = true;
      continue;
    }
    // 2) Backward: navázat před začátek
    const head = chain[0].p1;
    let bIdx = -1, bRev = false;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (eq(s.p2, head)) { bIdx = i; break; }
      if (eq(s.p1, head)) { bIdx = i; bRev = true; break; }
    }
    if (bIdx !== -1) {
      const seg = segs.splice(bIdx, 1)[0];
      if (bRev) {
        const tmp = seg.p1; seg.p1 = seg.p2; seg.p2 = tmp;
        if (seg.type === 'arc') seg.ccw = !seg.ccw;
      }
      chain.unshift(seg);
      extended = true;
    }
  }

  // Inverzní mapování canvas → CNC (zrcadlí transformaci v handleSendToCanvas)
  const isDia = camParams.mode === 'DIAMON';
  const isKarusel = camParams.machineStructure === 'carousel';
  const fromCanvas = (cx, cy) => {
    const xRadius = isKarusel ? cx : cy;
    const z = isKarusel ? cy : cx;
    const X = isDia ? xRadius * 2 : xRadius;
    return { X, Z: z };
  };
  const round3 = v => Math.round(v * 1000) / 1000;

  // První bod = G0 na začátek řetězce.
  const pts = [];
  let id = Date.now() + 1000;
  const startCnc = fromCanvas(chain[0].p1.x, chain[0].p1.y);
  pts.push({ id: id++, type: 'G0', x: round3(startCnc.X), z: round3(startCnc.Z), r: 0, mode: 'ABS' });
  for (const seg of chain) {
    const endCnc = fromCanvas(seg.p2.x, seg.p2.y);
    if (seg.type === 'line') {
      pts.push({ id: id++, type: 'G1', x: round3(endCnc.X), z: round3(endCnc.Z), r: 0, mode: 'ABS' });
    } else if (seg.type === 'arc') {
      // V canvasu: CCW (ccw=true) = kladný smysl. Pro soustruh (Z→x, X→y) se smysl nemění,
      // pro karusel (X→x, Z→y) se prohazují osy (rotace o 90°), což rovněž zachovává znaménko obíhání.
      // V CNC: G3 = CCW, G2 = CW.
      const cnc = seg.ccw ? 'G3' : 'G2';
      pts.push({ id: id++, type: cnc, x: round3(endCnc.X), z: round3(endCnc.Z), r: round3(seg.r), mode: 'ABS' });
    }
  }
  return pts;
}

// Parser řádků G-kódu do bodů {type, x, z, r, mode} v daném rozsahu řádků.
// `startLine` inclusive, `endLine` exclusive. Polohu/typ trackujeme lokálně,
// aby polotovarová sekce nebyla ovlivněna posledním bodem kontury.
export function _parseGCodeRange(lines, startLine, endLine, idBase) {
  const pts = [];
  let currentType = 'G1', idCounter = idBase, lastX = 100, lastZ = 0;
  for (let i = startLine; i < endLine; i++) {
    const line = lines[i];
    const clean = (line || '').toUpperCase().trim();
    if (!clean || clean.startsWith(';') || clean.startsWith('(') || clean.startsWith('%')) continue;
    const gMatch = clean.match(/\bG0?([0-3])\b/);
    if (gMatch) currentType = 'G' + gMatch[1];
    const xMatch = clean.match(/X([-]?\d+\.?\d*)/);
    const zMatch = clean.match(/Z([-]?\d+\.?\d*)/);
    const rMatch = clean.match(/(?:R|CR=)([-]?\d+\.?\d*)/);
    const iMatch = clean.match(/I([-]?\d+\.?\d*)/);
    const kMatch = clean.match(/K([-]?\d+\.?\d*)/);
    if (xMatch || zMatch) {
      const newX = xMatch ? parseFloat(xMatch[1]) : lastX;
      const newZ = zMatch ? parseFloat(zMatch[1]) : lastZ;
      let rVal = rMatch ? parseFloat(rMatch[1]) : 0;
      if (!rVal && (iMatch || kMatch) && (currentType === 'G2' || currentType === 'G3')) {
        const ci = iMatch ? parseFloat(iMatch[1]) : 0;
        const ck = kMatch ? parseFloat(kMatch[1]) : 0;
        const cx = lastX + ci, cz = lastZ + ck;
        rVal = Math.hypot(lastX - cx, lastZ - cz);
      }
      pts.push({ id: idCounter++, type: currentType, x: newX, z: newZ, r: rVal, mode: 'ABS' });
      lastX = newX; lastZ = newZ;
    }
  }
  return pts;
}

// Kompatibilní wrapper – jen kontura (žádné STOCK_START/END značky).
export function parseContourGCode(text) {
  const lines = text.split('\n');
  return _parseGCodeRange(lines, 0, lines.length, Date.now());
}

// Rozdělí G-kód podle značek STOCK_START / STOCK_END do dvou sekcí.
// Vrací { contour: pts[], stock: pts[] }. Pokud značky chybí, vrátí jen konturu.
export function parseContourAndStockGCode(text) {
  const lines = text.split('\n');
  let stockStart = -1, stockEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const u = (lines[i] || '').toUpperCase();
    if (u.includes('STOCK_START')) stockStart = i;
    else if (u.includes('STOCK_END') && stockStart !== -1) { stockEnd = i; break; }
  }
  if (stockStart === -1) {
    return { contour: _parseGCodeRange(lines, 0, lines.length, Date.now()), stock: [] };
  }
  const idBase = Date.now();
  const contour = _parseGCodeRange(lines, 0, stockStart, idBase);
  const stock = _parseGCodeRange(lines, stockStart + 1, stockEnd, idBase + 100000);
  return { contour, stock };
}
