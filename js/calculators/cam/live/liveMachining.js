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
//
// Nástroj NEOBJÍŽDÍ kus jako nůž (uživatel 20. 10. 2026): poháněný nástroj
// stojí v revolveru (liveSettings.toolAt — u soustruhu nahoře, X+) a kus se
// k němu natáčí osou C. Stav proto nese `rot` = natočení kusu [°] tak, aby
// bod pod nástrojem ležel na úhlu toolAt; přejezd mezi dírami je natočení C
// (polární interpolace), ne přímka napříč čelem.
import { livePositions, millMoves, depthLevels, faceOut, liveSettings, liveOpProblems } from './liveModel.js';
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
    // Nevybraná skupina děr se nevrtá (indexy operací zůstávají); chybné
    // zadání NC blok vynechá (liveGcode.js) — simulace ho nesmí obrobit.
    if (op.enabled === false || liveOpProblems(op).length) { opEnd[oi] = t; return; }
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
          // Jako NC (liveGcode.explicitDrill): lámání = odskok o chipBack,
          // vyjíždění = ven na R rovinu a zpět 0,3 mm nad dno.
          if (i < levels.length - 1) {
            if (op.chipMode === 'break') at(P(Math.max(0, L - op.chipBack)), rapid);
            else { at(P(-op.safe), rapid); at(P(Math.max(0, L - 0.3)), rapid); }
          }
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
  return { pts, total: t, opEnd, toolAt: liveSettings(prms || {}).toolAt };
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
  let tool = null, line = null, lastOp = -1, rot = 0;
  const DEG = 180 / Math.PI, toolAt = Number.isFinite(tl.toolAt) ? tl.toolAt : 90;
  // Natočení kusu, při kterém je bod q pod nástrojem (u osy beze změny).
  const turn = q => { if (Math.hypot(q.x, q.y) > 0.3) rot = wrap180(toolAt - Math.atan2(q.y, q.x) * DEG); };
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
  let target = pts.length - 1;   // bod, ke kterému nástroj právě jede
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.t > T) {
      target = i;
      const a = pts[i - 1];
      if (a && p.gap && p.t > a.t) {
        // Polohování: osa C natáčí kus a nástroj jede po poloměru (polárně).
        const f = (T - a.t) / (p.t - a.t);
        const ra = Math.hypot(a.x, a.y), rp = Math.hypot(p.x, p.y);
        const aa = Math.atan2(a.y, a.x), dl = wrapPi(Math.atan2(p.y, p.x) - aa);
        const ang = ra < 0.3 ? Math.atan2(p.y, p.x) : (rp < 0.3 ? aa : aa + dl * f), rr = ra + (rp - ra) * f;
        tool = { ...p, x: rr * Math.cos(ang), y: rr * Math.sin(ang), z: a.z + (p.z - a.z) * f, d: Math.min(a.d, p.d), cut: false };
        line = null; turn(tool);
      } else if (a && p.t > a.t) {
        const f = (T - a.t) / (p.t - a.t);
        const c = { ...p, x: a.x + (p.x - a.x) * f, y: a.y + (p.y - a.y) * f, z: a.z + (p.z - a.z) * f, d: a.d + (p.d - a.d) * f };
        c.cut = p.cut && c.d > 1e-9;
        note(c); stroke(a, c); tool = c; turn(c);
      } else tool = a || null;
      break;
    }
    note(p);
    if (i > 0 && !p.gap) stroke(pts[i - 1], p); else line = null;
    tool = p; turn(p);
  }
  const active = tool && T < tl.total ? { op: tool.op, hole: tool.hole } : null;
  // Čas operace [od, do] — poloha v jejím bloku G-kódu (liveNcSync.liveCodeLine).
  const opSpan = active ? [active.op > 0 ? (tl.opEnd[active.op - 1] || 0) : 0, tl.opEnd[active.op]] : null;
  // Pohyb díry: 0 = najetí na ni (natočení C, X), 1… = pohyby v díře v pořadí
  // NC (R rovina, záběry, vyjetí, prodleva, odjezd) — řádek rozepsaného kódu.
  let g = target, n = target + 1;
  while (g > 0 && !pts[g].gap) g--;
  while (n < pts.length && !pts[n].gap) n++;
  const step = active ? target - g : null, holeSteps = active ? n - g - 1 : null;
  return { t: T, total: tl.total, tool, rot, active, opSpan, step, holeSteps, depth, sweeps, done };
}

const wrapPi = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const wrap180 = a => { while (a > 180) a -= 360; while (a <= -180) a += 360; return a; };

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
