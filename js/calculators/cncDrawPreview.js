// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – CNC Editor z Kalkulaček: malý náhled kontury        ║
// ║  Kreslí rozbor z cncDrawTools.analyzeDrawCode do <canvas>;   ║
// ║  řádek s kurzorem je zvýrazněný (editor → „plátno").         ║
// ╚══════════════════════════════════════════════════════════════╝

/**
 * @param {HTMLCanvasElement} cv
 * @param {ReturnType<import('./cncDrawTools.js').analyzeDrawCode>} an
 * @param {{curLine?: number, flipX?: boolean, flipZ?: boolean}} [opts]
 */
export function drawPreview(cv, an, opts = {}) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const css = getComputedStyle(cv);
  const col = name => css.getPropertyValue(name).trim() || '#888';

  // Svět jako na plátně: soustruh (x=Z, y=poloměr), karusel (x=poloměr, y=Z).
  const kar = an.opts.karusel;
  const W = p => kar ? { x: p.x, y: p.z } : { x: p.z, y: p.x };
  const pts = [];
  const segs = an.moves.map(mv => {
    const s = W(mv.from), e = W(mv.to);
    const seg = { mv, s, e };
    if (mv.arc && !mv.arc.err && mv.arc.cx !== undefined) {
      seg.c = W({ x: mv.arc.cx, z: mv.arc.cz });
      // body po obvodu kvůli rozsahu
      const n = 16;
      for (let k = 0; k <= n; k++) {
        const a = mv.arc.a1 + (mv.arc.ccw ? 1 : -1) * mv.arc.sweep * k / n;
        pts.push({ x: seg.c.x + mv.arc.r * Math.cos(a), y: seg.c.y + mv.arc.r * Math.sin(a) });
      }
    }
    pts.push(s, e);
    return seg;
  });
  if (!pts.length) {
    ctx.fillStyle = col('--ctp-subtext0'); ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.fillText('Žádné pohyby k zobrazení', w / 2, h / 2);
    return;
  }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const pad = 12;
  const sc = Math.min((w - 2 * pad) / Math.max(x1 - x0, 1e-6), (h - 2 * pad) / Math.max(y1 - y0, 1e-6));
  const ox = (w - (x1 - x0) * sc) / 2, oy = (h - (y1 - y0) * sc) / 2;
  // Zrcadlení jako na plátně (soustruh: flipZ = Z+ vlevo, flipX = X+ dolů).
  const mx = !kar && opts.flipZ, my = !kar && opts.flipX;
  const S = p => ({
    x: mx ? w - (ox + (p.x - x0) * sc) : ox + (p.x - x0) * sc,
    y: my ? oy + (p.y - y0) * sc : h - (oy + (p.y - y0) * sc),
  });
  const flipSense = (mx ? 1 : 0) ^ (my ? 1 : 0);

  // osa soustružení (poloměr 0), pokud je v záběru
  if (!kar && y0 <= 0 && y1 >= 0) {
    const a = S({ x: x0, y: 0 }), b = S({ x: x1, y: 0 });
    ctx.strokeStyle = col('--ctp-overlay0'); ctx.setLineDash([6, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, a.y); ctx.lineTo(w, b.y); ctx.stroke(); ctx.setLineDash([]);
  }

  const drawSeg = (seg, style, width, dash) => {
    ctx.strokeStyle = style; ctx.lineWidth = width; ctx.setLineDash(dash || []);
    ctx.beginPath();
    const a = S(seg.s);
    ctx.moveTo(a.x, a.y);
    if (seg.c) {
      const c = S(seg.c);
      // úhly v obrazovce: y je otočené (svět nahoru = obrazovka dolů) a případné zrcadlení
      const ang = p => Math.atan2(S(p).y - c.y, S(p).x - c.x);
      // Úhly bereme z obrazovkových bodů (y dolů), takže `anticlockwise` canvasu
      // odpovídá přímo světovému CCW; zrcadlení jedné osy smysl otočí.
      const anticlock = flipSense ? !seg.mv.arc.ccw : seg.mv.arc.ccw;
      ctx.arc(c.x, c.y, seg.mv.arc.r * sc, ang(seg.s), ang(seg.e), anticlock);
    } else {
      const b = S(seg.e);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  };
  for (const seg of segs) {
    if (seg.mv.g === 0) drawSeg(seg, col('--ctp-overlay2'), 1, [3, 3]);
    else drawSeg(seg, seg.mv.stock ? col('--ctp-peach') : col('--ctp-text'), 1.5, seg.mv.stock ? [5, 3] : null);
  }
  const cur = segs.find(s => s.mv.line === opts.curLine);
  if (cur) {
    drawSeg(cur, col('--ctp-yellow'), 3.5, null);
    const e = S(cur.e);
    ctx.fillStyle = col('--ctp-yellow');
    ctx.beginPath(); ctx.arc(e.x, e.y, 3.5, 0, Math.PI * 2); ctx.fill();
  }
}
