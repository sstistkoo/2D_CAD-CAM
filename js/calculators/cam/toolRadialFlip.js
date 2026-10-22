// Nástroj obrácený RADIÁLNĚ (ostřím ven od osy, tělem a tyčí k ose) —
// zápich v díře (Upich + ◎ Vnitřní, ops/grooveInner.js) a vnitřní závit
// (Závit + ◎ Vnitřní, ops/thread.js); doplnění pravidla 13 z 22. 10. 2026.
// Emise jede ve skutečných souřadnicích, takže modely nástroje ve světě (úběr materiálu, validátor, hlídání držáku) musí obrys
// destičky i držáku překlopit v X: profil +z (k držáku) = svět −x (k ose).
// Vyvrtávání to nepotřebuje — simuluje se v zrcadle drah (ops/bore.js),
// kde je tyč obyčejný vnější nůž.

/** Je aktivní zápich v díře (Upich + ◎ Vnitřní)? */
export function grooveInnerActive(prms) {
  return !!(prms && prms.partOffInner === true && prms.partOffZ != null && isFinite(parseFloat(prms.partOffZ)));
}

/** Je aktivní vnitřní závit? (závit má v emisi přednost před upichem) */
export function threadInnerActive(prms) {
  return !!(prms && prms.threadActive && prms.threadExternal === false);
}

/** Obrábí program nástrojem ve světě obráceným radiálně? */
export function radialFlip(prms) {
  if (prms && prms.threadActive) return threadInnerActive(prms);
  return grooveInnerActive(prms);
}

/** Smyčka {x,z} překlopená v X; pořadí se obrátí, ať drží orientaci. */
export function flipLoopX(loop) {
  return loop ? loop.map(p => ({ ...p, x: -p.x })).reverse() : loop;
}

/**
 * Jak daleko sahá nástroj (destička i držák, svět) od špičky ve směru
 * `dirZ` (−1 = do díry k −Z) [mm] — o tolik dál před ústí musí stát špička,
 * aby při radiálním pohybu nad čelem nic nepřečnívalo do polotovaru.
 * @param loops smyčky {x,z} nástroje ve světě (holderWorldLoop, toolFootprint)
 */
export function toolReachAlongZ(loops, dirZ) {
  let m = 0;
  for (const l of loops) for (const p of l || []) m = Math.max(m, dirZ < 0 ? -p.z : p.z);
  return m;
}
