// ╔══════════════════════════════════════════════════════════════╗
// ║  Náhled úseků v simulátoru — čáry hranic + pořadí obrábění      ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Kreslí plán z `sectionPlan.js`. Každá hranice úseku je SVISLICE („olovnice")
// z bodu, kde čára zanoření vyjede na offset polotovaru (velká tečka), až NAD
// polotovar — mezi drahami by se ztratila (uživatel 25. 9. 2026: „vytáhnout ty
// čáry nad polotovar … u prostředního úseku od bodu jako olovnici").
// Nad polotovarem je u každého úseku jeho číslo a kroky, ve kterých se pojede
// (pravidlo 8), např. „Ú2: 1 → Ø90.0, 3".

const COL = '#cba6f7';    // Catppuccin mauve — odlišná od mezních čar (teal)
const HALO = '#1e1e2e';   // Catppuccin base — obrys písma, ať je čitelné přes dráhy
const RISE = 12;          // o kolik mm nad nejvyšší polotovar čáry sahají

/**
 * @param ctx       2D kontext plátna
 * @param plan      `calc.sectionPlan` (už v reálném světě)
 * @param toScreen  (x, z) → { x, y } v pixelech
 */
export function drawSectionPlan(ctx, plan, toScreen) {
  if (!plan || !plan.sections || plan.sections.length === 0) return;
  let top = -Infinity;
  for (const s of plan.sections) if (Number.isFinite(s.top)) top = Math.max(top, s.top);
  if (!Number.isFinite(top)) return;
  const xTop = top + RISE;

  ctx.save();
  ctx.strokeStyle = COL; ctx.fillStyle = COL; ctx.lineWidth = 2;
  for (const e of plan.edges) {
    const a = toScreen(e.x, e.z), b = toScreen(xTop, e.z);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.beginPath(); ctx.arc(a.x, a.y, 5, 0, Math.PI * 2); ctx.fill();
  }

  // Pořadí: kroky číslované 1…n; úsek může mít víc kroků (přeruší se, když
  // vrstvy dojdou na vrch úseku vpravo).
  const byId = new Map();
  plan.steps.forEach((st, i) => {
    const txt = `${i + 1}` + (Number.isFinite(st.xTo) ? ` → Ø${(2 * st.xTo).toFixed(1)}` : '');
    if (!byId.has(st.id)) byId.set(st.id, []);
    byId.get(st.id).push(txt);
  });
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.lineWidth = 4; ctx.strokeStyle = HALO; ctx.lineJoin = 'round';
  for (const s of plan.sections) {
    if (!Number.isFinite(s.top)) continue;
    const zHi = Number.isFinite(s.zHi) ? s.zHi : s.zLo, zLo = Number.isFinite(s.zLo) ? s.zLo : s.zHi;
    const p = toScreen(xTop, (zHi + zLo) / 2);
    const txt = `Ú${s.id}: ${(byId.get(s.id) || []).join(', ')}`;
    ctx.strokeText(txt, p.x, p.y - 4);
    ctx.fillText(txt, p.x, p.y - 4);
  }
  ctx.restore();
}
