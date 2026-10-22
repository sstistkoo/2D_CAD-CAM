// Nástroj obrácený RADIÁLNĚ (ostřím ven od osy, tělem a tyčí k ose) —
// zápich v díře (Upich + ◎ Vnitřní, ops/grooveInner.js, doplnění pravidla 13
// z 22. 10. 2026). Emise jede ve skutečných souřadnicích, takže modely
// nástroje ve světě (úběr materiálu, validátor, hlídání držáku) musí obrys
// destičky i držáku překlopit v X: profil +z (k držáku) = svět −x (k ose).
// Vyvrtávání to nepotřebuje — simuluje se v zrcadle drah (ops/bore.js),
// kde je tyč obyčejný vnější nůž.

/** Je aktivní zápich v díře (nástroj ve světě obrácený radiálně)? */
export function radialFlip(prms) {
  return !!(prms && prms.partOffInner === true && prms.partOffZ != null && isFinite(parseFloat(prms.partOffZ)));
}

/** Smyčka {x,z} překlopená v X; pořadí se obrátí, ať drží orientaci. */
export function flipLoopX(loop) {
  return loop ? loop.map(p => ({ ...p, x: -p.x })).reverse() : loop;
}
