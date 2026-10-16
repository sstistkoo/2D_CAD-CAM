// SKICA – geometrie výkresu: Transformace objektů: zrcadlení, lineární a kruhové pole, rotace, překlopení, škálování.
// Vyňato z js/geometry.js (16. 10. 2026); geometry.js je rozcestník se stejnými
// exporty, importuje se dál odtamtud.
import { state } from '../state.js';
import { deepClone } from '../utils.js';

// ── Zrcadlení objektu ──
/**
 * @param {import('../types.js').DrawObject} obj
 * @param {'x'|'z'|'custom'} axis
 * @param {import('../types.js').Point2D} [p1]
 * @param {import('../types.js').Point2D} [p2]
 * @returns {import('../types.js').DrawObject}
 */
export function mirrorObject(obj, axis, p1, p2) {
  // axis: 'x' (vodorovná osa), 'z' (svislá osa), 'custom' (2 body p1,p2)
  const copy = deepClone(obj);
  delete copy.id;

  // Natočení nulového bodu
  const npAngle = (state.nullPointActive && state.nullPointAngle)
    ? (state.nullPointAngle * Math.PI / 180) : 0;

  // Směrový úhel zrcadlící přímky – potřebný pro obdélník (viz 'rect' níže):
  // odraz úhlu natočení A přes přímku se směrem theta je 2*theta - A.
  const axisAngle = axis === 'x' ? npAngle
    : axis === 'z' ? npAngle + Math.PI / 2
    : Math.atan2((p2?.y ?? 0) - (p1?.y ?? 0), (p2?.x ?? 0) - (p1?.x ?? 0));

  function mirrorPoint(px, py) {
    if (axis === 'x') {
      // Zrcadlení přes vodorovnou osu (otočenou o npAngle)
      // Transformace: otočit do lokálního systému, zrcadlit Y, otočit zpět
      const cos = Math.cos(npAngle), sin = Math.sin(npAngle);
      const lx = px * cos + py * sin;
      const ly = -px * sin + py * cos;
      const my = -ly; // zrcadlení Y
      return { x: lx * cos - my * sin, y: lx * sin + my * cos };
    }
    if (axis === 'z') {
      // Zrcadlení přes svislou osu (otočenou o npAngle)
      const cos = Math.cos(npAngle), sin = Math.sin(npAngle);
      const lx = px * cos + py * sin;
      const ly = -px * sin + py * cos;
      const mx = -lx; // zrcadlení X
      return { x: mx * cos - ly * sin, y: mx * sin + ly * cos };
    }
    // Vlastní osa: reflexe přes přímku p1-p2
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-10) return { x: px, y: py };
    const t = ((px - p1.x) * dx + (py - p1.y) * dy) / lenSq;
    const projX = p1.x + t * dx, projY = p1.y + t * dy;
    return { x: 2 * projX - px, y: 2 * projY - py };
  }

  switch (copy.type) {
    case 'point': {
      const m = mirrorPoint(copy.x, copy.y);
      copy.x = m.x; copy.y = m.y;
      break;
    }
    case 'line':
    case 'constr': {
      const m1 = mirrorPoint(copy.x1, copy.y1);
      const m2 = mirrorPoint(copy.x2, copy.y2);
      copy.x1 = m1.x; copy.y1 = m1.y;
      copy.x2 = m2.x; copy.y2 = m2.y;
      break;
    }
    case 'circle': {
      const m = mirrorPoint(copy.cx, copy.cy);
      copy.cx = m.x; copy.cy = m.y;
      break;
    }
    case 'arc': {
      const m = mirrorPoint(copy.cx, copy.cy);
      copy.cx = m.x; copy.cy = m.y;
      // Zrcadlení flipne direction – prohodíme start/end a obrátíme
      const sP = mirrorPoint(
        obj.cx + obj.r * Math.cos(obj.startAngle),
        obj.cy + obj.r * Math.sin(obj.startAngle)
      );
      const eP = mirrorPoint(
        obj.cx + obj.r * Math.cos(obj.endAngle),
        obj.cy + obj.r * Math.sin(obj.endAngle)
      );
      copy.startAngle = Math.atan2(eP.y - m.y, eP.x - m.x);
      copy.endAngle = Math.atan2(sP.y - m.y, sP.x - m.x);
      break;
    }
    case 'rect': {
      // Zrcadlit STŘED (ne rohové body zvlášť) a zachovat půl-rozměry –
      // getRectCorners staví box z x1..y2 kolem jeho vlastního středu a
      // teprve pak ho natáčí o rotation, takže rohy nejsou nezávislé body.
      const cx0 = (copy.x1 + copy.x2) / 2, cy0 = (copy.y1 + copy.y2) / 2;
      const hw = (copy.x2 - copy.x1) / 2, hh = (copy.y2 - copy.y1) / 2;
      const c = mirrorPoint(cx0, cy0);
      copy.x1 = c.x - hw; copy.x2 = c.x + hw;
      copy.y1 = c.y - hh; copy.y2 = c.y + hh;
      copy.rotation = 2 * axisAngle - (obj.rotation || 0);
      break;
    }
    case 'polyline': {
      copy.vertices = copy.vertices.map(v => {
        const m = mirrorPoint(v.x, v.y);
        return { x: m.x, y: m.y };
      });
      // Zrcadlení obrací bulge znaménka
      copy.bulges = copy.bulges.map(b => -b);
      break;
    }
    case 'text': {
      // Poloha se zrcadlí, směr účaří se odrazí přes osu (2·θ − A) jako
      // u obdélníku; zrcadlově převrácené písmo text neumí – zůstane čitelný
      const m = mirrorPoint(copy.x, copy.y);
      copy.x = m.x; copy.y = m.y;
      copy.rotation = 2 * axisAngle - (obj.rotation || 0);
      break;
    }
    case 'fill':
      copy.loops = copy.loops.map(loop => loop.map(v => mirrorPoint(v.x, v.y)));
      break;
  }
  copy.name = `${obj.name || obj.type} (zrcadlo)`;
  return copy;
}

// ── Lineární pole ──
/**
 * @param {import('../types.js').DrawObject} obj
 * @param {number} dx
 * @param {number} dy
 * @param {number} count
 * @param {number} [dx2=0]
 * @param {number} [dy2=0]
 * @param {number} [count2=0]
 * @returns {import('../types.js').DrawObject[]}
 */
export function linearArray(obj, dx, dy, count, dx2 = 0, dy2 = 0, count2 = 0) {
  const copies = [];
  const rows = count2 > 0 ? count2 : 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i <= count; i++) {
      if (i === 0 && j === 0) continue; // skip original
      const copy = deepClone(obj);
      delete copy.id;
      const ox = dx * i + dx2 * j;
      const oy = dy * i + dy2 * j;
      switch (copy.type) {
        case 'point':
          copy.x += ox; copy.y += oy; break;
        case 'line': case 'constr':
          copy.x1 += ox; copy.y1 += oy;
          copy.x2 += ox; copy.y2 += oy; break;
        case 'circle':
          copy.cx += ox; copy.cy += oy; break;
        case 'arc':
          copy.cx += ox; copy.cy += oy; break;
        case 'rect':
          copy.x1 += ox; copy.y1 += oy;
          copy.x2 += ox; copy.y2 += oy; break;
        case 'polyline':
          copy.vertices = copy.vertices.map(v => ({ x: v.x + ox, y: v.y + oy }));
          break;
        case 'text':
          copy.x += ox; copy.y += oy; break;
        case 'fill':
          copy.loops = copy.loops.map(loop => loop.map(v => ({ x: v.x + ox, y: v.y + oy })));
          break;
      }
      const label = count2 > 0 ? `${j + 1},${i + 1}` : `${i + 1}`;
      copy.name = `${obj.name || obj.type} (pole ${label})`;
      copies.push(copy);
    }
  }
  return copies;
}

// ── Rotace objektu ──
/**
 * Otočí objekt kolem bodu [cx,cy] o úhel (radiány).
 * Modifikuje objekt in-place.
 * @param {import('../types.js').DrawObject} obj
 * @param {number} cx  střed rotace X
 * @param {number} cy  střed rotace Y
 * @param {number} angle  úhel v radiánech
 */
export function rotateObject(obj, cx, cy, angle) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  function rp(px, py) {
    const dx = px - cx, dy = py - cy;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  }
  switch (obj.type) {
    case 'point': {
      const m = rp(obj.x, obj.y);
      obj.x = m.x; obj.y = m.y; break;
    }
    case 'line': case 'constr': {
      const m1 = rp(obj.x1, obj.y1), m2 = rp(obj.x2, obj.y2);
      obj.x1 = m1.x; obj.y1 = m1.y; obj.x2 = m2.x; obj.y2 = m2.y; break;
    }
    case 'circle': {
      const m = rp(obj.cx, obj.cy);
      obj.cx = m.x; obj.cy = m.y; break;
    }
    case 'arc': {
      const m = rp(obj.cx, obj.cy);
      obj.cx = m.x; obj.cy = m.y;
      obj.startAngle += angle; obj.endAngle += angle;
      break;
    }
    case 'rect': {
      // Otočit STŘED kolem pivotu a zachovat půl-rozměry – x1..y2 nejsou
      // nezávislé rohové body, ale (spolu s rotation) definice boxu kolem
      // jeho vlastního středu (viz getRectCorners v utils.js).
      const cx0 = (obj.x1 + obj.x2) / 2, cy0 = (obj.y1 + obj.y2) / 2;
      const hw = (obj.x2 - obj.x1) / 2, hh = (obj.y2 - obj.y1) / 2;
      const c = rp(cx0, cy0);
      obj.x1 = c.x - hw; obj.x2 = c.x + hw;
      obj.y1 = c.y - hh; obj.y2 = c.y + hh;
      obj.rotation = (obj.rotation || 0) + angle;
      break;
    }
    case 'polyline': {
      obj.vertices = obj.vertices.map(v => rp(v.x, v.y));
      break;
    }
    case 'text': {
      const m = rp(obj.x, obj.y);
      obj.x = m.x; obj.y = m.y;
      obj.rotation = (obj.rotation || 0) + angle;
      break;
    }
    case 'fill':
      obj.loops = obj.loops.map(loop => loop.map(v => rp(v.x, v.y)));
      break;
  }
}

// ── Překlopení objektu (flip) kolem středu výběru ──
/**
 * Překlopí objekt kolem osy procházející bodem [cx,cy].
 * axis='Z' → zrcadlení kolem svislé osy (negace x-složky)
 * axis='X' → zrcadlení kolem vodorovné osy (negace y-složky)
 * Modifikuje objekt in-place.
 * @param {import('../types.js').DrawObject} obj
 * @param {number} cx  střed překlopení X
 * @param {number} cy  střed překlopení Y
 * @param {'Z'|'X'} axis
 */
export function flipObject(obj, cx, cy, axis) {
  function fp(px, py) {
    if (axis === 'Z') return { x: 2 * cx - px, y: py };
    return { x: px, y: 2 * cy - py };
  }
  switch (obj.type) {
    case 'point': { const m = fp(obj.x, obj.y); obj.x = m.x; obj.y = m.y; break; }
    case 'line': case 'constr': {
      const m1 = fp(obj.x1, obj.y1), m2 = fp(obj.x2, obj.y2);
      obj.x1 = m1.x; obj.y1 = m1.y; obj.x2 = m2.x; obj.y2 = m2.y; break;
    }
    case 'circle': { const m = fp(obj.cx, obj.cy); obj.cx = m.x; obj.cy = m.y; break; }
    case 'arc': {
      const m = fp(obj.cx, obj.cy);
      obj.cx = m.x; obj.cy = m.y;
      if (axis === 'Z') {
        obj.startAngle = Math.PI - obj.startAngle;
        obj.endAngle   = Math.PI - obj.endAngle;
      } else {
        obj.startAngle = -obj.startAngle;
        obj.endAngle   = -obj.endAngle;
      }
      // Překlopení obrací směr. `ccw` neuvedeno = proti směru hodin, takže
      // `!obj.ccw` by z undefined udělalo true a směr NEotočilo – čtvrtoblouk
      // se pak kreslil jako doplněk 270°.
      obj.ccw = obj.ccw === false;
      break;
    }
    case 'rect': {
      // Překlopit STŘED a zachovat půl-rozměry (viz stejná poznámka u
      // rotateObject/mirrorObject výše).
      const cx0 = (obj.x1 + obj.x2) / 2, cy0 = (obj.y1 + obj.y2) / 2;
      const hw = (obj.x2 - obj.x1) / 2, hh = (obj.y2 - obj.y1) / 2;
      const c = fp(cx0, cy0);
      obj.x1 = c.x - hw; obj.x2 = c.x + hw;
      obj.y1 = c.y - hh; obj.y2 = c.y + hh;
      // Stejná konvence jako u 'arc' výše: překlopení obrací úhel natočení.
      if (axis === 'Z') {
        obj.rotation = Math.PI - (obj.rotation || 0);
      } else {
        obj.rotation = -(obj.rotation || 0);
      }
      break;
    }
    case 'polyline': {
      obj.vertices = obj.vertices.map(v => fp(v.x, v.y));
      if (obj.bulges) obj.bulges = obj.bulges.map(b => -b);
      break;
    }
    case 'text': {
      // Stejná konvence úhlu jako obdélník výše; písmo zůstane čitelné
      const m = fp(obj.x, obj.y);
      obj.x = m.x; obj.y = m.y;
      obj.rotation = axis === 'Z' ? Math.PI - (obj.rotation || 0) : -(obj.rotation || 0);
      break;
    }
    case 'fill':
      obj.loops = obj.loops.map(loop => loop.map(v => fp(v.x, v.y)));
      break;
  }
}

// ── Kruhové pole ──
/**
 * Vytvoří kopie objektu rozmístěné po kruhu kolem středu [cx,cy].
 * @param {import('../types.js').DrawObject} obj  zdrojový objekt
 * @param {number} cx  střed rotace X
 * @param {number} cy  střed rotace Y
 * @param {number} count  počet kopií
 * @param {number} totalAngleDeg  celkový úhel ve stupních
 * @param {boolean} includeOriginal  zahrnout originál do počtu pozic
 * @returns {import('../types.js').DrawObject[]}
 */
export function circularArray(obj, cx, cy, count, totalAngleDeg, includeOriginal) {
  if (count < 1) return [];
  const copies = [];
  // Pozic celkem (originál je vždy pozice 0). Plný kruh: N pozic rovnoměrně
  // (rozteč 360/N – poslední NEsmí padnout zpět na originál, což se dřív
  // stalo u výchozího „6 kopií, 360°, bez originálu"). Část kruhu: první
  // pozice na 0°, poslední přesně na zadaném úhlu (rozteč úhel/(N−1)).
  const positions = includeOriginal ? count : count + 1;
  if (positions < 2) return [];
  const fullCircle = Math.abs(totalAngleDeg) >= 360 - 1e-9;
  const stepDeg = totalAngleDeg / (fullCircle ? positions : positions - 1);
  const numCopies = positions - 1;
  for (let i = 1; i <= numCopies; i++) {
    const copy = deepClone(obj);
    delete copy.id;
    const angleRad = (stepDeg * i) * Math.PI / 180;
    rotateObject(copy, cx, cy, angleRad);
    copy.name = `${obj.name || obj.type} (pole ${i})`;
    copies.push(copy);
  }
  return copies;
}

// ── Škálování objektu ──
/**
 * Škáluje objekt kolem bodu [cx,cy] o faktor.
 * Modifikuje objekt in-place.
 * @param {import('../types.js').DrawObject} obj
 * @param {number} cx  střed škálování X
 * @param {number} cy  střed škálování Y
 * @param {number} factor  měřítkový faktor
 */
export function scaleObject(obj, cx, cy, factor) {
  function sp(px, py) {
    return { x: cx + (px - cx) * factor, y: cy + (py - cy) * factor };
  }
  switch (obj.type) {
    case 'point': {
      const m = sp(obj.x, obj.y);
      obj.x = m.x; obj.y = m.y; break;
    }
    case 'line': case 'constr': {
      const m1 = sp(obj.x1, obj.y1), m2 = sp(obj.x2, obj.y2);
      obj.x1 = m1.x; obj.y1 = m1.y; obj.x2 = m2.x; obj.y2 = m2.y; break;
    }
    case 'circle': {
      const m = sp(obj.cx, obj.cy);
      obj.cx = m.x; obj.cy = m.y;
      obj.r *= Math.abs(factor);
      break;
    }
    case 'arc': {
      const m = sp(obj.cx, obj.cy);
      obj.cx = m.x; obj.cy = m.y;
      obj.r *= Math.abs(factor);
      // Záporný faktor = bodová souměrnost (rotace o 180°) – i úhly oblouku
      if (factor < 0) { obj.startAngle += Math.PI; obj.endAngle += Math.PI; }
      break;
    }
    case 'rect': {
      // Škálovat STŘED a půl-rozměry (viz stejná poznámka u rotateObject).
      const cx0 = (obj.x1 + obj.x2) / 2, cy0 = (obj.y1 + obj.y2) / 2;
      const hw = (obj.x2 - obj.x1) / 2 * Math.abs(factor);
      const hh = (obj.y2 - obj.y1) / 2 * Math.abs(factor);
      const c = sp(cx0, cy0);
      obj.x1 = c.x - hw; obj.x2 = c.x + hw;
      obj.y1 = c.y - hh; obj.y2 = c.y + hh;
      // Záporný faktor je bodová souměrnost (rotace o 180°) – promítne se
      // i do úhlu natočení, jinak by se dvojice rohů reinterpretovala jako
      // jiný (axis-aligned) obdélník – viz getRectCorners.
      if (factor < 0) obj.rotation = ((obj.rotation || 0) + Math.PI) % (2 * Math.PI);
      break;
    }
    case 'polyline': {
      obj.vertices = obj.vertices.map(v => sp(v.x, v.y));
      break;
    }
    case 'text': {
      const m = sp(obj.x, obj.y);
      obj.x = m.x; obj.y = m.y;
      if (obj.fontSize) obj.fontSize *= Math.abs(factor);
      if (factor < 0) obj.rotation = (obj.rotation || 0) + Math.PI;
      break;
    }
    case 'fill':
      obj.loops = obj.loops.map(loop => loop.map(v => sp(v.x, v.y)));
      break;
  }
}
