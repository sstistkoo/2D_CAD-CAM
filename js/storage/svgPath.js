// ╔══════════════════════════════════════════════════════════════╗
// ║  Import SVG: atribut `d` elementu <path> → objekty výkresu     ║
// ╚══════════════════════════════════════════════════════════════╝
// Vyňato ze storage/fileIO.js (kontrola kódu 16. 11. 2026). Osa Y se otáčí
// (SVG má Y dolů, výkres nahoru): world_y = −svg_y.
//
// Opraveno 16. 11. 2026:
//  • číslo s exponentem (`1.2e-4`, běžné z Inkscape) se bralo jako PŘÍKAZ
//    (obsahuje písmeno) a zbytek cesty se rozpadl;
//  • Bézierovy křivky C/S/Q/T se přeskočily BEZ posunu aktuálního bodu, takže
//    všechny další úsečky začínaly jinde. Teď se rozloží na úsečky (kontura);
//  • oblouk `A` s rx = 0 je podle SVG úsečka — dřív v obrysu zůstala díra.

/** Počet úseček na jednu Bézierovu křivku. */
const BEZIER_STEPS = 16;

export function svgArcToCenter(x1, y1, r, largeArc, sweep, x2, y2) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const d2 = dx * dx + dy * dy;
  if (d2 < 1e-12 || r <= 0) return null;
  let r2 = r * r;
  if (r2 < d2) r2 = d2;
  const sign = (largeArc !== sweep) ? 1 : -1;
  const sq = sign * Math.sqrt(Math.max(0, (r2 - d2) / d2));
  const acx = mx + sq * dy;
  const acy = my - sq * dx;
  return {
    cx: acx, cy: acy, r: Math.sqrt(r2),
    startAngle: Math.atan2(y1 - acy, x1 - acx),
    endAngle:   Math.atan2(y2 - acy, x2 - acx),
  };
}

/** Bézierova křivka (2 nebo 3 řídicí body + konec) → otevřená kontura ve světě. */
function bezierPolyline(p0, ctrl, p3) {
  const vertices = [];
  for (let k = 0; k <= BEZIER_STEPS; k++) {
    const t = k / BEZIER_STEPS, u = 1 - t;
    let x, y;
    if (ctrl.length === 1) {               // kvadratická
      const [c] = ctrl;
      x = u * u * p0.x + 2 * u * t * c.x + t * t * p3.x;
      y = u * u * p0.y + 2 * u * t * c.y + t * t * p3.y;
    } else {                               // kubická
      const [c1, c2] = ctrl;
      x = u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x;
      y = u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y;
    }
    vertices.push({ x, y: -y });
  }
  return { type: 'polyline', vertices, bulges: new Array(vertices.length).fill(0), closed: false };
}

export function parseSVGPath(d) {
  const result = [];
  const tokens = d.match(/[MmLlHhVvAaZzCcSsQqTt]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
  let i = 0;
  let px = 0, py = 0, subX = 0, subY = 0;
  let cmd = null, rel = false;
  // Poslední řídicí bod křivky (pro S/T = zrcadlení), jinak null.
  let lastC = null, lastQ = null;

  // Příkaz = jediné písmeno. `1e-5` je číslo, ne příkaz (dřív /[A-Za-z]/).
  const isCmd = (t) => /^[A-Za-z]$/.test(t);
  function num() { return parseFloat(tokens[i++]); }
  function hasNum() { return i < tokens.length && !isCmd(tokens[i]); }
  const pushLine = (nx, ny) => {
    if (Math.hypot(nx - px, ny - py) > 1e-6)
      result.push({ type: 'line', x1: px, y1: -py, x2: nx, y2: -ny });
  };

  while (i < tokens.length) {
    if (isCmd(tokens[i])) {
      cmd = tokens[i].toUpperCase();
      rel = tokens[i] !== tokens[i].toUpperCase();
      i++;
    }
    if (!cmd) { i++; continue; }
    // Příkaz bez (dostatku) čísel — nic k vykonání, čekej na další písmeno.
    if (cmd !== 'Z' && !hasNum()) { cmd = null; continue; }

    const ax = v => rel ? px + v : v;
    const ay = v => rel ? py + v : v;
    const prevC = lastC, prevQ = lastQ;
    lastC = null; lastQ = null;

    switch (cmd) {
      case 'M': {
        px = ax(num()); py = ay(num());
        subX = px; subY = py;
        cmd = 'L'; // subsequent pairs become implicit L
        break;
      }
      case 'L': {
        const nx = ax(num()), ny = ay(num());
        pushLine(nx, ny);
        px = nx; py = ny;
        break;
      }
      case 'H': {
        const nx = rel ? px + num() : num();
        pushLine(nx, py);
        px = nx;
        break;
      }
      case 'V': {
        const ny = rel ? py + num() : num();
        pushLine(px, ny);
        py = ny;
        break;
      }
      case 'C': case 'S': case 'Q': case 'T': {
        const p0 = { x: px, y: py };
        const pt = () => { const x = ax(num()); return { x, y: ay(num()) }; };
        const refl = (c) => (c ? { x: 2 * px - c.x, y: 2 * py - c.y } : { x: px, y: py });
        let ctrl;
        if (cmd === 'C') ctrl = [pt(), pt()];
        else if (cmd === 'S') ctrl = [refl(prevC), pt()];
        else if (cmd === 'Q') ctrl = [pt()];
        else ctrl = [refl(prevQ)];
        const end = pt();
        if (Math.hypot(end.x - px, end.y - py) > 1e-6) result.push(bezierPolyline(p0, ctrl, end));
        if (cmd === 'C' || cmd === 'S') lastC = ctrl[1]; else lastQ = ctrl[0];
        px = end.x; py = end.y;
        break;
      }
      case 'A': {
        const rx = Math.abs(num());
        num(); num(); // ry, x-rotation (ignored — assume circular)
        const la = Math.round(num()), sw = Math.round(num());
        const nx = ax(num()), ny = ay(num());
        const arc = svgArcToCenter(px, py, rx, la, sw, nx, ny);
        if (arc) {
          // Y-flip: world_y = -SVG_y → world angles negated, world center cy = -arc.cy
          result.push({
            type: 'arc',
            cx: arc.cx, cy: -arc.cy, r: arc.r,
            startAngle: -arc.startAngle,
            endAngle: -arc.endAngle,
            // sweep-flag 1 = kladný směr úhlu v SVG (osa Y dolů) = po směru
            // hodin; po otočení osy Y zůstává po směru hodin → ccw:false.
            // (Dřív ccw: sw === 1 → čtvrtoblouk se kreslil jako doplněk 270°.)
            ccw: sw === 0,
          });
        } else {
          pushLine(nx, ny);   // rx = 0 → úsečka (SVG 1.1, F.6.2)
        }
        px = nx; py = ny;
        break;
      }
      case 'Z': {
        pushLine(subX, subY);
        px = subX; py = subY;
        break;
      }
    }

    if (cmd === 'Z') cmd = null;
  }
  return result;
}
