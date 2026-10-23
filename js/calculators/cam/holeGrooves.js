// Zápichy nakreslené ve stěně díry (řetěz díry z cam/boreContour.js, úseky
// od ústí dovnitř): schod VEN (radiálně) → ROVNÉ DNO (podél osy) → schod
// ZPĚT k ose. Používá zápich v díře z výkresu (sim/grooveCad.js) a polotovar
// jeho simulace (sim/grooveSim.js). Vyvrtávání bere nakreslený tvar celý —
// vybrání vyhrubuje, kam destička po mezní čáře dosáhne (8. 10. 2026).

const EPS = 1e-6;
const isLine = (s) => s && s.type !== 'arc' && s.p1 && s.p2;
const radial = (s) => isLine(s) && Math.abs(s.p2.z - s.p1.z) < EPS && Math.abs(s.p2.x - s.p1.x) > EPS;
const axial = (s) => isLine(s) && Math.abs(s.p2.x - s.p1.x) < EPS && Math.abs(s.p2.z - s.p1.z) > EPS;
const r3 = (v) => Math.round(v * 1000) / 1000;
/** Úsečka pod 45° s odvěsnou s (sražení), jinak 0. */
const chamfer45 = (s) => {
  if (!isLine(s)) return 0;
  const dx = Math.abs(s.p2.x - s.p1.x), dz = Math.abs(s.p2.z - s.p1.z);
  return dx > EPS && Math.abs(dx - dz) < 1e-4 ? dx : 0;
};
const same = (p, q) => p && q && Math.abs(p.x - q.x) < 1e-4 && Math.abs(p.z - q.z) < 1e-4;
/** Sražení 45° stejné velikosti před i za zápichem (úseky i−1 a i+3), jinak 0. */
function grooveChamferAt(S, i) {
  const pre = S[i - 1], post = S[i + 3];
  const s1 = chamfer45(pre), s2 = chamfer45(post);
  return s1 > 0 && Math.abs(s1 - s2) < 1e-4 && same(pre.p2, S[i].p1) && same(post.p1, S[i + 2].p2) ? r3(s1) : 0;
}

/**
 * Obdélníkové zápichy v řetězu díry (úseky od ústí dovnitř).
 * @returns {{zA:number, W:number, rBot:number, rWall:number}[]}
 *   zA = Z boku u ústí, W = šířka, rBot = poloměr dna, rWall = užší stěna vedle
 */
export function groovesInChain(segs) {
  const out = [];
  if (!Array.isArray(segs)) return out;
  for (let i = 0; i + 2 < segs.length; i++) {
    const a = segs[i], b = segs[i + 1], c = segs[i + 2];
    if (!radial(a) || !axial(b) || !radial(c)) continue;
    // Ven (poloměr roste), dno, zpátky k ose (poloměr klesá).
    if (!(a.p2.x > a.p1.x + EPS) || !(c.p2.x < c.p1.x - EPS)) continue;
    // Se sražením 45° na obou hranách: stěna = začátek / konec sražení.
    const s = grooveChamferAt(segs, i);
    const rWall = s > 0 ? Math.min(segs[i - 1].p1.x, segs[i + 3].p2.x) : Math.min(a.p1.x, c.p2.x);
    out.push({ zA: r3(a.p1.z), W: r3(Math.abs(c.p1.z - a.p1.z)), rBot: r3(b.p1.x), rWall: r3(rWall), ...(s > 0 ? { s } : {}) });
  }
  return out;
}

/**
 * Řetěz díry BEZ nakreslených zápichů (zápich se nahradí stěnou) — polotovar
 * pro simulaci zápichu v díře: zápich se teprve dělá, v polotovaru není.
 */
export function chainWithoutGrooves(segs) {
  if (!Array.isArray(segs)) return segs;
  const out = [];
  for (let i = 0; i < segs.length; i++) {
    const a = segs[i], b = segs[i + 1], c = segs[i + 2];
    if (radial(a) && axial(b) && radial(c) && a.p2.x > a.p1.x + EPS && c.p2.x < c.p1.x - EPS) {
      // Se sražením: zahodit i sražení před (už v `out`) a za zápichem.
      const ch = grooveChamferAt(segs, i) > 0;
      const from = ch ? out.pop().p1 : a.p1, to = ch ? segs[i + 3].p2 : c.p2;
      const p = { x: from.x, z: to.z };
      out.push({ type: 'line', p1: from, p2: p });
      if (Math.abs(to.x - p.x) > EPS) out.push({ type: 'line', p1: p, p2: to });
      i += ch ? 3 : 2;
    } else out.push(a);
  }
  return out;
}

/**
 * Obdélníkové zápichy na VNĚJŠÍM obrysu (úseky kontury v libovolném směru):
 * schod DOLŮ k ose → ROVNÉ DNO podél osy → schod zpátky NAHORU (pravidlo 17,
 * vnější zápich z výkresu). Zápich ve stěně díry (dno dál od osy než okolí)
 * sem nepatří — ten hledá groovesInChain.
 * @returns {{zLo:number, zHi:number, W:number, rBot:number, rTop:number}[]}
 *   zLo/zHi = boky (menší / větší Z), rBot = poloměr dna, rTop = nižší z okrajů
 */
export function groovesOnOuter(segs) {
  const out = [];
  const S = (segs || []).filter(Boolean);
  for (let i = 0; i + 2 < S.length; i++) {
    const a = S[i], b = S[i + 1], c = S[i + 2];
    if (!radial(a) || !axial(b) || !radial(c)) continue;
    // Dno níž (blíž ose) než oba okraje: a jde dolů, c nahoru.
    if (!(a.p2.x < a.p1.x - EPS) || !(c.p2.x > c.p1.x + EPS)) continue;
    const z1 = a.p1.z, z2 = c.p1.z;
    const s = grooveChamferAt(S, i);
    const rTop = s > 0 ? Math.min(S[i - 1].p1.x, S[i + 3].p2.x) : Math.min(a.p1.x, c.p2.x);
    out.push({ zLo: r3(Math.min(z1, z2)), zHi: r3(Math.max(z1, z2)), W: r3(Math.abs(z2 - z1)), rBot: r3(b.p1.x), rTop: r3(rTop), ...(s > 0 ? { s } : {}) });
  }
  return out;
}
