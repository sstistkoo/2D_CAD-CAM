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
import { livePositions, faceOut, liveOpProblems, liveOpOn, liveSettings, isKeyway, keywaySpan, depthLevels } from './liveModel.js';
import { sectBase, sectHeight } from './liveSection.js';

const HEAD = /^[;(]\s*\[(\d+)\] /;   // „; [2] Díry Ø8: …" / „( [2] … )"
const MOVE = /^(N\d+\s+)?G0?[0-3]\b/i;
const CYCLE = /^(N\d+\s+)?(CYCLE8\d|G8[1-9])/i;
/** Řádek pohybu v díře: cyklus, prodleva, nebo G0–G3 s X / Y / Z (ne samotné natočení C). */
function inHole(l) {
  const t = String(l).trim();
  return !/díra/.test(t) && (CYCLE.test(t) || /^(N\d+\s+)?G0?4\b/i.test(t) || (MOVE.test(t) && /\s[XYZ]-?[\d.]/.test(t)));
}

/**
 * Řádek programu (index v `lines`), který odpovídá stavu obrábění, nebo null.
 * Operace jsou v bloku číslované [1]…[n] přes vybrané (liveOpOn). Vrtání:
 * najetí = řádek „díra k"; v díře celé vrtání na řádku CYKLU (i vyjíždění
 * pro odvod třísky — dřív to skákalo mezi řádkem díry a cyklem, uživatel
 * 21. 10. 2026), rozepsaně (G0/G1) řádek po řádku podle pohybu díry
 * (mach.step / holeSteps; řádky navíc na začátku = najetí k plášti).
 * Frézování = poměr času operace na jejích řádcích pohybu.
 * @param mach stav z liveStateAt (tool, active, opSpan, step, holeSteps, t)
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
    let h = -1;
    for (let i = s + 1; i < e && h < 0; i++) if (re.test(lines[i])) h = i;
    if (h < 0) return s;
    if (!(mach.step > 0) || CYCLE.test(String(lines[h]).trim())) return h;   // najetí / Fanuc: cyklus na řádku díry
    const hole = [];
    for (let i = h + 1; i < e && inHole(lines[i]); i++) hole.push(i);
    const cyc = hole.find(i => CYCLE.test(String(lines[i]).trim()));
    if (cyc != null) return cyc;
    if (!hole.length) return h;   // Fanuc: další díry cyklu („X… C… ( díra 2 )")
    const k = hole.length - (mach.holeSteps || hole.length) + mach.step - 1;
    return hole[Math.max(0, Math.min(hole.length - 1, k))];
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
  // Natočení C jen při najetí na další díru (gap), v díře jen rychloposuv.
  if (!mach.tool || !mach.tool.cut) return { text: `${time} · G0 rychloposuv${mach.tool && mach.tool.gap ? ' · natočení C' : ''}`, rapid: true };
  return { text: `${time} · T${op.toolNo} ${op.toolName || ''} · ${Math.round(op.rpm)} ot/min · F ${Math.round(op.feed)} mm/min`, rapid: false };
}

/**
 * Zvýraznit řádek `idx` v editoru G-kódu (třída a posun jako u soustružení)
 * i ve „4 řádcích" na mobilu (dřív tam zůstal G0 X150 Z5 — uživatel
 * 21. 10. 2026). `renderMini` = codeMini.renderCodeMini, předá ho
 * camSimulator (cam/live nesmí importovat cam/sim). Volá se každý snímek —
 * beze změny nic nepřekresluje.
 */
export function showLiveCodeLine(root, idx, lines, renderMini) {
  const mini = renderMini && root.querySelector('.cam-sim-code-mini.cam-sim-mini-on');
  if (mini && (mini.dataset.liveIdx !== String(idx) || !mini.children[1] || mini.children[1].textContent !== lines[idx])) {
    renderMini(mini, lines, idx);
    mini.dataset.liveIdx = String(idx);
  }
  const bd = root.querySelector('.cam-sim-code-backdrop'), el = bd && bd.children[idx];
  if (!el || el.classList.contains('cam-sim-code-active')) return;
  bd.querySelectorAll('.cam-sim-code-active').forEach(x => x.classList.remove('cam-sim-code-active'));
  el.classList.add('cam-sim-code-active');
  const ta = root.querySelector('.cam-sim-manual-ta');
  if (!ta || document.activeElement === ta) return;
  const top = el.offsetTop, bottom = top + el.offsetHeight;
  if (top >= ta.scrollTop && bottom <= ta.scrollTop + ta.clientHeight) return;
  ta.scrollTop = Math.max(0, top - ta.clientHeight / 2);
  bd.scrollTop = ta.scrollTop;
}

/**
 * Dráha středu nástroje v řezu (x = poloměr, z) po operacích jako úseky
 * { a, b, rapid }. Chybné zadání (liveOpProblems) a nevybrané se nekreslí
 * stejně jako v NC bloku. Díra je natočená pod nástroj (toolAt) — výška
 * v řezu jako vrták v liveSection (soustruh nahoře, karusel vpravo = +r).
 */
export function livePathSegments(ops, prms) {
  const k = sectHeight(liveSettings(prms).toolAt, 1, sectBase(prms));   // výška díry pod nástrojem / r
  const sg = k < -1e-9 ? -1 : 1;
  const safeR = sg * (parseFloat(prms.safeX) || 0) * (prms.mode === 'DIAMON' ? 0.5 : 1);
  const safeZ = parseFloat(prms.safeZ) || 0;
  const segs = [];
  let cur = { x: safeR, z: safeZ };
  const go = (x, z, rapid) => {
    if (Math.abs(x - cur.x) > 1e-9 || Math.abs(z - cur.z) > 1e-9) segs.push({ a: cur, b: { x, z }, rapid });
    cur = { x, z };
  };
  ops.forEach(op => {
    if (!liveOpOn(op) || liveOpProblems(op).length) return;
    if (isKeyway(op)) {
      // Drážka pro pero (liveGcode.emitKeyway): na úhlu C k plášti, vrstvy v Z tam a zpět.
      const rX = op.xTop / 2, k = keywaySpan(op);
      go(safeR, cur.z, true); go(safeR, k.za, true);
      livePositions(op).forEach(() => {
        go(sg * (rX + op.retract), k.za, true); go(sg * (rX + op.safe), k.za, true);
        let z = k.za;
        depthLevels(op.depth, op.stepDown).forEach(d => {
          go(sg * (rX - d), z, false);
          z = z === k.za ? k.zb : k.za;
          go(sg * (rX - d), z, false);
        });
        go(sg * (rX + op.retract), z, true);
      });
    } else if (op.side === 'radial') {
      const rX = op.xTop / 2;
      let zPrev = null;
      livePositions(op).forEach(p => {
        // Jako NC: jiná výška = ven na bezpečnou X, Z, k plášti; stejná = jen natočení C.
        if (zPrev == null || Math.abs(p.z - zPrev) > 1e-6) { go(safeR, cur.z, true); go(safeR, p.z, true); go(sg * (rX + op.retract), p.z, true); }
        go(sg * (rX + op.safe), p.z, true); go(sg * (rX - op.depth), p.z, false); go(sg * (rX + op.retract), p.z, true);
        zPrev = p.z;
      });
    } else {
      const out = faceOut(op), rtp = op.zTop + out * op.retract, sdis = op.zTop + out * op.safe, zEnd = op.zTop - out * op.depth;
      go(safeR, rtp, true);
      radiiOf(op).forEach(([r0, r1]) => {
        go(k * r0, rtp, true); go(k * r0, sdis, true); go(k * r0, zEnd, false);
        if (r1 !== r0) { go(k * r1, zEnd, false); go(k * r0, zEnd, false); }   // kapsa / drážka přes poloměry
        go(k * r0, rtp, true);
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
