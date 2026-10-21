// Blok poháněných nástrojů při PŘEHRÁVÁNÍ (uživatel 21. 10. 2026: „nevygenerovaly
// se mi dráhy na to vrtání, mám tam v G kódu jenom G0 X150 Z5"). Program
// operace Vrtání je pro simulaci soustružení jen najetí na bezpečnou polohu —
// blok mezi značkami přeskakuje (gcodeParser.js) a vrtání jede přehrávač ◎
// (liveMachining.js). Tenhle modul k přehrávači:
//  • najde v G-kódu řádek bloku, který se právě obrábí (zvýraznění jako
//    u soustružení),
//  • složí údaj nad časem (nástroj, otáčky, posuv / rychloposuv),
//  • nakreslí v řezu dráhu středu nástroje jako dráhy soustružení (posuv
//    plně zeleně, rychloposuv čárkovaně růžově) — pořadí pohybů jako
//    liveGcode.buildLiveBlock: bezpečná X → Z odjezdu → X díry → do hloubky.
// Poháněný nástroj stojí nahoře (X+, liveSettings.toolAt) a díry se k němu
// natáčejí osou C — dráha v řezu proto leží na poloměru díry nad osou.
import { findLiveBlock } from './liveMarkers.js';
import { livePositions, faceOut, liveOpProblems, liveOpOn } from './liveModel.js';

const HEAD = /^[;(]\s*\[(\d+)\] /;   // „; [2] Díry Ø8: …" / „( [2] … )"
const MOVE = /^(N\d+\s+)?G0?[0-3]\b/i;
const DRILL = /^(N\d+\s+)?(CYCLE8\d|G8[0-9]|G0?1\b)/i;

/**
 * Řádek programu (index v `lines`), který odpovídá stavu obrábění, nebo null.
 * Operace jsou v bloku číslované [1]…[n] přes vybrané (liveOpOn); vrtání =
 * řádek „díra k" (při řezu první vrtací řádek za ním), frézování = poměr
 * času operace na jejích řádcích pohybu.
 * @param mach stav z liveStateAt (tool, active, opSpan, t)
 */
export function liveCodeLine(lines, ops, mach) {
  if (!mach || !mach.active || !mach.tool) return null;
  const b = findLiveBlock(lines);
  const oi = mach.active.op;
  if (!b || !liveOpOn(ops[oi])) return null;
  const k = ops.slice(0, oi + 1).filter(liveOpOn).length;
  let s = -1, e = b.end;
  for (let i = b.start + 1; i < b.end; i++) {
    const m = String(lines[i]).trim().match(HEAD);
    if (!m) continue;
    if (s >= 0) { e = i; break; }
    if (+m[1] === k) s = i;
  }
  if (s < 0) return null;
  const op = ops[oi];
  if (op.kind !== 'mill') {
    const re = new RegExp(`díra ${mach.active.hole + 1}(?!\\d)`);
    for (let i = s + 1; i < e; i++) {
      if (!re.test(lines[i])) continue;
      if (mach.tool.cut && !DRILL.test(String(lines[i]).trim())) {
        for (let j = i + 1; j < Math.min(e, i + 4); j++) if (DRILL.test(String(lines[j]).trim())) return j;
      }
      return i;
    }
    return s;
  }
  const moves = [];
  for (let i = s + 1; i < e; i++) if (MOVE.test(String(lines[i]).trim())) moves.push(i);
  if (!moves.length) return s;
  const [t0, t1] = mach.opSpan || [0, 0];
  const f = t1 > t0 ? Math.max(0, Math.min(1, (mach.t - t0) / (t1 - t0))) : 0;
  return moves[Math.round(f * (moves.length - 1))];
}

const clock = sec => { const s = Math.max(0, Math.round(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** Údaj nad časem: { text, rapid } — nástroj, otáčky a posuv, nebo G0 / natočení C. */
export function liveMotionText(ops, mach) {
  const op = mach && mach.active ? ops[mach.active.op] : null;
  if (!op) return null;
  const time = `⏱ ${clock(mach.t)} / ${clock(mach.total)}`;
  if (!mach.tool || !mach.tool.cut) return { text: `${time} · G0 rychloposuv · natočení C`, rapid: true };
  return { text: `${time} · T${op.toolNo} ${op.toolName || ''} · ${Math.round(op.rpm)} ot/min · F ${Math.round(op.feed)} mm/min`, rapid: false };
}

/** Zvýraznit řádek `idx` v editoru G-kódu (třída a posun jako u soustružení). */
export function showLiveCodeLine(root, idx) {
  const els = root.querySelectorAll('.cam-sim-code-bd-line');
  els.forEach((el, i) => el.classList.toggle('cam-sim-code-active', i === idx));
  const ta = root.querySelector('.cam-sim-manual-ta'), el = els[idx];
  if (!ta || !el || document.activeElement === ta) return;
  const top = el.offsetTop, bottom = top + el.offsetHeight;
  if (top >= ta.scrollTop && bottom <= ta.scrollTop + ta.clientHeight) return;
  ta.scrollTop = Math.max(0, top - ta.clientHeight / 2);
  const bd = root.querySelector('.cam-sim-code-backdrop');
  if (bd) bd.scrollTop = ta.scrollTop;
}

/**
 * Dráha středu nástroje v řezu (x = poloměr, z) po operacích jako úseky
 * { a, b, rapid }. Chybné zadání (liveOpProblems) a nevybrané se nekreslí
 * stejně jako v NC bloku.
 */
export function livePathSegments(ops, prms) {
  const safeR = (parseFloat(prms.safeX) || 0) * (prms.mode === 'DIAMON' ? 0.5 : 1);
  const safeZ = parseFloat(prms.safeZ) || 0;
  const segs = [];
  let cur = { x: safeR, z: safeZ };
  const go = (x, z, rapid) => {
    if (Math.abs(x - cur.x) > 1e-9 || Math.abs(z - cur.z) > 1e-9) segs.push({ a: cur, b: { x, z }, rapid });
    cur = { x, z };
  };
  ops.forEach(op => {
    if (!liveOpOn(op) || liveOpProblems(op).length) return;
    if (op.side === 'radial') {
      const rX = op.xTop / 2;
      livePositions(op).forEach(p => {
        go(safeR, cur.z, true); go(safeR, p.z, true); go(rX + op.retract, p.z, true);
        go(rX + op.safe, p.z, true); go(rX - op.depth, p.z, false); go(rX + op.retract, p.z, true);
      });
    } else {
      const out = faceOut(op), rtp = op.zTop + out * op.retract, sdis = op.zTop + out * op.safe, zEnd = op.zTop - out * op.depth;
      go(safeR, rtp, true);
      radiiOf(op).forEach(([r0, r1]) => {
        go(r0, rtp, true); go(r0, sdis, true); go(r0, zEnd, false);
        if (r1 !== r0) { go(r1, zEnd, false); go(r0, zEnd, false); }   // kapsa / drážka přes poloměry
        go(r0, rtp, true);
      });
    }
    go(safeR, cur.z, true); go(safeR, safeZ, true);
  });
  return segs;
}

/** Poloměry, na kterých operace jede: [začátek, konec] (kapsa / drážka přes rozsah). */
function radiiOf(op) {
  if (op.kind === 'mill' && op.millType === 'slot') {
    const { x1, y1, x2, y2 } = op.slot;
    return [[Math.hypot(x1, y1), Math.hypot(x2, y2)]];
  }
  const ext = op.kind === 'mill' ? Math.max(0, op.holeD / 2 - op.toolD / 2) : 0;
  const rs = [...new Set(livePositions(op).map(p => +p.r.toFixed(4)))];
  return rs.map(r => [Math.max(0, r - ext), r + ext]);
}

/**
 * Nakreslit dráhy (plně posuv, čárkovaně rychloposuv) jako drawToolpath.js;
 * `mode` = S.showSimPath ('all' | 'cut' | 'none').
 */
export function drawLivePaths(ctx, toScreen, segs, mode = 'all') {
  if (mode === 'none' || !segs.length) return;
  [false, true].forEach(rapid => {
    if (rapid && mode === 'cut') return;
    ctx.beginPath();
    segs.forEach(s => {
      if (s.rapid !== rapid) return;
      const a = toScreen(s.a.x, s.a.z), b = toScreen(s.b.x, s.b.z);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    });
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = rapid ? '#f38ba8' : '#a6e3a1';
    ctx.setLineDash(rapid ? [6, 6] : []);
    ctx.stroke(); ctx.setLineDash([]);
  });
}
