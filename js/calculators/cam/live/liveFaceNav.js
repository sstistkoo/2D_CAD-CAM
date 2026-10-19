// Zoom a posun POHLEDU NA ČELO (CAM) — ovládání jako nárys simulátoru:
// kolečko = zoom o 15 % kolem kurzoru, tažení myší / jedním prstem = posun,
// dva prsty = zoom (pinch) i posun, dvojklik / dvojí ťuknutí = vycentrovat.
// Stav `nav` = { zoom, panX, panY } (px od středu plátna) čte drawFaceView.

const ZMIN = 0.3, ZMAX = 40;

export function defaultNav() { return { zoom: 1, panX: 0, panY: 0 }; }
export function isDefaultNav(n) { return n.zoom === 1 && n.panX === 0 && n.panY === 0; }

/** Zoom o `k` tak, aby bod (mx, my) [px na plátně w × h] zůstal na místě. */
export function zoomAt(n, k, mx, my, w, h) {
  const z = Math.max(ZMIN, Math.min(ZMAX, n.zoom * k));
  const r = z / n.zoom;
  const ox = w / 2 + n.panX, oy = h / 2 + n.panY;
  n.panX = mx - (mx - ox) * r - w / 2;
  n.panY = my - (my - oy) * r - h / 2;
  n.zoom = z;
}

/**
 * @param el plátno pohledu (canvas)
 * @param nav stav { zoom, panX, panY } — mění se na místě
 * @param onChange překreslit (volá se nejvýš jednou za snímek)
 */
export function attachFaceNav(el, nav, onChange) {
  let queued = false;
  const changed = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; onChange(); });
  };
  const local = e => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const reset = () => { Object.assign(nav, defaultNav()); changed(); };

  el.addEventListener('wheel', e => {
    e.preventDefault();
    const [mx, my] = local(e);
    zoomAt(nav, 1 - Math.sign(e.deltaY) * 0.15, mx, my, el.width, el.height);
    changed();
  }, { passive: false });

  const pts = new Map();   // pointerId → [x, y]
  let pinch = null;        // { d, mx, my } při dvou prstech
  let lastTap = 0, moved = 0;
  const two = () => { const [a, b] = [...pts.values()]; return { d: Math.hypot(a[0] - b[0], a[1] - b[1]), mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 }; };

  el.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
    try { el.setPointerCapture(e.pointerId); } catch (_) { /* ukazatel už neaktivní */ }
    pts.set(e.pointerId, local(e));
    if (pts.size === 1) moved = 0;
    pinch = pts.size === 2 ? two() : null;
    e.preventDefault();
  });
  el.addEventListener('pointermove', e => {
    const prev = pts.get(e.pointerId);
    if (!prev) return;
    const cur = local(e);
    if (pts.size === 1) {
      nav.panX += cur[0] - prev[0]; nav.panY += cur[1] - prev[1];
      moved += Math.abs(cur[0] - prev[0]) + Math.abs(cur[1] - prev[1]);
      pts.set(e.pointerId, cur);
      changed();
    } else if (pts.size === 2 && pinch) {
      pts.set(e.pointerId, cur);
      const p = two();
      nav.panX += p.mx - pinch.mx; nav.panY += p.my - pinch.my;
      if (pinch.d > 0) zoomAt(nav, p.d / pinch.d, p.mx, p.my, el.width, el.height);
      pinch = p; moved = 99;
      changed();
    }
  });
  const up = e => {
    if (!pts.delete(e.pointerId)) return;
    pinch = pts.size === 2 ? two() : null;
    // Dvojí ťuknutí bez posunu (dotyk) = vycentrovat; myš má dblclick.
    if (e.type === 'pointerup' && e.pointerType !== 'mouse' && !pts.size && moved < 8) {
      const t = performance.now();
      if (t - lastTap < 320) { lastTap = 0; reset(); } else lastTap = t;
    }
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('dblclick', e => { e.preventDefault(); reset(); });
  return { reset };
}
