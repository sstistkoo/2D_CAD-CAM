// Zápich v díře Z VÝKRESU (uživatel 22. 10. 2026: „zápich nakreslený ve
// výkresu by se mohl převzít"). Zápich ve stěně díry je v řetězu díry
// (cam/boreContour.js — samostatný řetěz i díra napojená na čelo) vidět jako
//   schod VEN (radiálně) → ROVNÉ DNO (podél osy) → schod ZPĚT k ose.
// Nalezené zápichy nabídne panel Upich + ◎ Vnitřní; klik vyplní Z boku
// u ústí, šířku a dno (paramsGrooveHtml.js). Jen vstup — dráhu dál počítá
// ops/grooveInner.js podle pravidla 13.
import { boreChainFromState } from '../boreContour.js';
import { showToast } from '../../../state.js';

const EPS = 1e-6;
const isLine = (s) => s && s.type !== 'arc' && s.p1 && s.p2;
const radial = (s) => isLine(s) && Math.abs(s.p2.z - s.p1.z) < EPS && Math.abs(s.p2.x - s.p1.x) > EPS;
const axial = (s) => isLine(s) && Math.abs(s.p2.x - s.p1.x) < EPS && Math.abs(s.p2.z - s.p1.z) > EPS;
const r3 = (v) => Math.round(v * 1000) / 1000;

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
    out.push({ zA: r3(a.p1.z), W: r3(Math.abs(c.p1.z - a.p1.z)), rBot: r3(b.p1.x), rWall: r3(Math.min(a.p1.x, c.p2.x)) });
  }
  return out;
}

/** Zápichy v díře nakreslené ve výkresu (samostatný řetěz, jinak díra v kontuře). */
export function groovesFromDrawing(S) {
  try {
    const src = boreChainFromState({ ...S, params: { ...S.params, boreSource: 'cad' } });
    return src ? groovesInChain(src.segs) : [];
  } catch {
    return [];
  }
}

/** Klik na nalezený zápich → Z boku u ústí, šířka a dno do parametrů. */
export function attachGrooveCadEvents({ tabBody, S, applyChange, pushHistory, autoPickToolFor }) {
  tabBody.querySelectorAll('[data-act="groove-from-cad"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const g = groovesFromDrawing(S)[Number(btn.dataset.i)];
      if (!g) return;
      pushHistory();
      S.params.partOffZ = g.zA;
      S.params.grooveWidth = g.W;
      S.params.grooveBottomX = g.rBot;
      S.partOffPickMode = false;
      const picked = autoPickToolFor ? autoPickToolFor('groovein').msg : '';
      const cz = (v) => String(v).replace('.', ',');
      showToast(`Zápich v díře z výkresu: Z ${cz(g.zA)}, šířka ${cz(g.W)}, dno ⌀${cz(r3(2 * g.rBot))}${picked}`);
      applyChange({ cycle: true });
    });
  });
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
      const p = { x: a.p1.x, z: c.p1.z };
      out.push({ type: 'line', p1: a.p1, p2: p });
      if (Math.abs(c.p2.x - p.x) > EPS) out.push({ type: 'line', p1: p, p2: c.p2 });
      i += 2;
    } else out.push(a);
  }
  return out;
}
