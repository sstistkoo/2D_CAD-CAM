// OBRÁBĚNÍ POHÁNĚNÝMI NÁSTROJI v čase — simulace úběru v pohledu na čelo
// a v řezu (přání uživatele 19. 10. 2026).
//
// Z operací (liveModel.js) se sestaví časová osa bodů dráhy středu nástroje
// s reálným časem stroje: posuv F [mm/min], rychloposuv stroje (feedRates.js),
// natočení osy C mezi dírami, prodleva dole. `liveStateAt(tl, t)` říká, kde
// je nástroj a kam už která díra / kapsa / drážka dosáhla. Přehrávač
// (createLivePlayer) posouvá čas × rychlost přehrávače simulátoru (1×, 2×…);
// spouští ho ▶ v pohledu na čelo i konec soustružení (livePanel.js).
// Kreslí liveFaceView.js (bokorys) a liveSection.js (řez).
import { livePositions, millMoves, depthLevels, faceOut } from './liveModel.js';
import { rapidFeedMmMin } from '../feedRates.js';

const C_POS_SEC = 0.4;        // natočení osy C / přejezd mezi dírami (orientačně)
const ARC_STEP = Math.PI / 12; // vzorkování oblouků frézy (15°)

/**
 * Časová osa: body { t, op, hole, x, y, z, d, cut, gap } — x, y = poloha
 * středu nástroje v pohledu na čelo (radiální díra: bod na ose vrtáku),
 * d = hloubka pod povrchem (záporná = nad ním), cut = posuv v materiálu,
 * gap = první bod po přejezdu (nekreslí se k němu stopa).
 * @returns {{ pts, total, opEnd: number[] }}
 */
export function buildLiveTimeline(ops, prms) {
  const rapid = rapidFeedMmMin(prms) / 60;
  const pts = [];
  const opEnd = [];
  let t = 0, last = null;
  const at = (p, speed, gap = false) => {
    if (last) {
      const dist = Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z);
      t += gap ? Math.max(C_POS_SEC, dist / rapid) : dist / speed;
    }
    last = { ...p, t, gap: gap || !last, cut: !gap && speed !== rapid && p.d > 1e-9 };
    pts.push(last);
  };
  const dwell = sec => { if (sec > 0 && last) { t += sec; last = { ...last, t, gap: false, cut: false }; pts.push(last); } };

  ops.forEach((op, oi) => {
    const feed = Math.max(1, op.feed || 100) / 60;
    if (op.kind === 'drill') {
      const radial = op.side === 'radial';
      const out = faceOut(op), R = op.xTop / 2;
      livePositions(op).forEach((p, hole) => {
        // Bod osy vrtáku v hloubce d (radiálně od pláště, axiálně od čela).
        const P = d => {
          if (!radial) return { op: oi, hole, x: p.x, y: p.y, z: op.zTop - out * d, d };
          const rad = p.a * Math.PI / 180, r = R - d;
          return { op: oi, hole, x: r * Math.cos(rad), y: r * Math.sin(rad), z: p.z, d };
        };
        at(P(-op.retract), rapid, true);
        at(P(-op.safe), rapid);
        const levels = depthLevels(op.depth, op.peck > 0 ? op.peck : op.depth);
        levels.forEach((L, i) => {
          at(P(L), feed);
          if (i < levels.length - 1) { at(P(-op.safe), rapid); at(P(Math.max(0, L - 0.5)), rapid); }
        });
        dwell(op.dwell);
        at(P(-op.retract), rapid);
      });
    } else {
      const out = faceOut(op), cs = livePositions(op);
      const holeOf = m => {
        if (op.millType === 'slot' || cs.length < 2) return 0;
        let best = 0, bd = Infinity;
        cs.forEach((c, i) => { const dd = Math.hypot(m.x - c.x, m.y - c.y); if (dd < bd) { bd = dd; best = i; } });
        return best;
      };
      let prev = null;
      millMoves(op).forEach(m => {
        const hole = holeOf(m), d = out * (op.zTop - m.z);
        const mk = (x, y) => ({ op: oi, hole, x, y, z: m.z, d });
        if (m.k === 'arc' && prev) {
          let a0 = Math.atan2(prev.y - m.cy, prev.x - m.cx), a1 = Math.atan2(m.y - m.cy, m.x - m.cx);
          if (m.ccw && a1 <= a0) a1 += 2 * Math.PI;
          if (!m.ccw && a1 >= a0) a1 -= 2 * Math.PI;
          const r = Math.hypot(prev.x - m.cx, prev.y - m.cy), n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / ARC_STEP));
          for (let j = 1; j <= n; j++) {
            const a = a0 + (a1 - a0) * j / n;
            at(mk(m.cx + r * Math.cos(a), m.cy + r * Math.sin(a)), feed);
          }
        } else if (m.k === 'rapid') at(mk(m.x, m.y), rapid, !prev || Math.hypot(m.x - prev.x, m.y - prev.y) > 1e-6);
        else at(mk(m.x, m.y), feed);
        prev = m;
      });
    }
    opEnd[oi] = t;
  });
  return { pts, total: t, opEnd };
}

/**
 * Stav obrábění v čase t: { t, total, tool, active, depth: Map('op:díra' →
 * největší hloubka), sweeps: Map(op → [[{x,y}…]…]) = stopy frézy v materiálu,
 * done: Set(op) hotových operací }.
 */
export function liveStateAt(tl, t) {
  const depth = new Map(), sweeps = new Map(), done = new Set();
  const T = Math.max(0, Math.min(t, tl.total));
  tl.opEnd.forEach((e, oi) => { if (e <= T + 1e-9) done.add(oi); });
  let tool = null, line = null, lastOp = -1;
  const note = p => {
    const k = `${p.op}:${p.hole}`;
    if (p.d > (depth.get(k) ?? 0)) depth.set(k, p.d);
  };
  const stroke = (a, b) => {
    if (!b.cut) { line = null; return; }
    if (!sweeps.has(b.op)) sweeps.set(b.op, []);
    if (!line || b.op !== lastOp) { line = [{ x: a.x, y: a.y }]; sweeps.get(b.op).push(line); }
    line.push({ x: b.x, y: b.y });
    lastOp = b.op;
  };
  const pts = tl.pts;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.t > T) {
      const a = pts[i - 1];
      if (a && !p.gap && p.t > a.t) {
        const f = (T - a.t) / (p.t - a.t);
        const c = { ...p, x: a.x + (p.x - a.x) * f, y: a.y + (p.y - a.y) * f, z: a.z + (p.z - a.z) * f, d: a.d + (p.d - a.d) * f };
        c.cut = p.cut && c.d > 1e-9;
        note(c); stroke(a, c); tool = c;
      } else tool = a || null;
      break;
    }
    note(p);
    if (i > 0 && !p.gap) stroke(pts[i - 1], p); else line = null;
    tool = p;
  }
  return { t: T, total: tl.total, tool, active: tool && T < tl.total ? { op: tool.op, hole: tool.hole } : null, depth, sweeps, done };
}

/**
 * Přehrávač: čas × rychlost (`getSpeed`), snímek přes requestAnimationFrame.
 * @param o { getOps(), getPrms(), getSpeed(), onFrame(), onEnd() }
 */
export function createLivePlayer(o) {
  let tl = null, t = 0, running = false, raf = 0, lastTs = null, serial = 0;
  const loop = ts => {
    if (!running) { raf = 0; return; }
    const dt = lastTs == null ? 1 / 60 : Math.min(0.1, (ts - lastTs) / 1000);
    lastTs = ts;
    t = Math.min(tl.total, t + dt * (o.getSpeed() || 1));
    if (t >= tl.total) { running = false; raf = 0; o.onFrame(); o.onEnd(); return; }
    o.onFrame();
    raf = requestAnimationFrame(loop);
  };
  const run = () => { running = true; lastTs = null; if (!raf) raf = requestAnimationFrame(loop); };
  return {
    /** Od začátku; false = žádná operace. */
    start() {
      tl = buildLiveTimeline(o.getOps(), o.getPrms());
      if (!tl.pts.length) { tl = null; return false; }
      serial++;
      t = 0; run(); o.onFrame();
      return true;
    },
    pause() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; o.onFrame(); },
    resume() { if (tl && t < tl.total) run(); },
    stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; tl = null; t = 0; },
    get active() { return !!tl; },
    get running() { return running; },
    get finished() { return !!tl && t >= tl.total; },
    get t() { return t; },
    get serial() { return serial; },
    state() { return tl ? liveStateAt(tl, t) : null; },
  };
}
