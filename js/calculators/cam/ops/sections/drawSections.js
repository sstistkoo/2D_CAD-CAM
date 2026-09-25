// ╔══════════════════════════════════════════════════════════════╗
// ║  Náhled úseků v simulátoru — čáry hranic + pořadí obrábění      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Kreslí plán z `sectionPlan.js`: každá hranice úseku je čára od paty na
// kontuře nahoru k polotovaru (u stěny upichováku jen po vrchol stěny —
// nad ním hranice neplatí). Nad každým úsekem je jeho číslo a kroky, ve
// kterých se pojede (pravidlo 8), např. „Ú2: 1 → Ø90.0, 3".

const COL = '#cba6f7';   // Catppuccin mauve — odlišná od mezních čar (teal)

/**
 * @param ctx       2D kontext plátna
 * @param plan      `calc.sectionPlan` (už v reálném světě)
 * @param toScreen  (x, z) → { x, y } v pixelech
 */
export function drawSectionPlan(ctx, plan, toScreen) {
  if (!plan || !plan.sections || plan.sections.length === 0) return;
  ctx.save();
  ctx.strokeStyle = COL; ctx.fillStyle = COL; ctx.lineWidth = 2;

  for (const e of plan.edges) {
    if (!Number.isFinite(e.xFoot) || !Number.isFinite(e.xTop)) continue;
    const a = toScreen(e.xFoot, e.z), b = toScreen(Math.max(e.xTop, e.xFoot), e.z);
    ctx.setLineDash(e.kind === 'stena' ? [6, 3] : []);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.beginPath(); ctx.arc(a.x, a.y, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.setLineDash([]);

  // Pořadí: kroky číslované 1…n; úsek může mít víc kroků (přeruší se, když
  // vrstvy dojdou na vrch úseku vpravo).
  const byId = new Map();
  plan.steps.forEach((st, i) => {
    const txt = `${i + 1}` + (Number.isFinite(st.xTo) ? ` → Ø${(2 * st.xTo).toFixed(1)}` : '');
    if (!byId.has(st.id)) byId.set(st.id, []);
    byId.get(st.id).push(txt);
  });
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  for (const s of plan.sections) {
    if (!Number.isFinite(s.top)) continue;
    const zHi = Number.isFinite(s.zHi) ? s.zHi : s.zLo, zLo = Number.isFinite(s.zLo) ? s.zLo : s.zHi;
    const p = toScreen(s.top, (zHi + zLo) / 2);
    const steps = byId.get(s.id) || [];
    ctx.fillText(`Ú${s.id}: ${steps.join(', ')}`, p.x, p.y - 6);
  }
  ctx.restore();
}
