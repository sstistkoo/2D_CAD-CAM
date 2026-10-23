// Zápich v díře Z VÝKRESU (uživatel 22. 10. 2026: „zápich nakreslený ve
// výkresu by se mohl převzít"). Zápich ve stěně díry je v řetězu díry
// (cam/boreContour.js — samostatný řetěz i díra napojená na čelo) vidět jako
//   schod VEN (radiálně) → ROVNÉ DNO (podél osy) → schod ZPĚT k ose.
// Nalezené zápichy nabídne panel Upich + ◎ Vnitřní; klik vyplní Z boku
// u ústí, šířku a dno (paramsGrooveHtml.js). Jen vstup — dráhu dál počítá
// ops/grooveInner.js podle pravidla 13.
import { boreChainFromState, segmentsFromPoints, splitBoreFromSegments } from '../boreContour.js';
import { showToast } from '../../../state.js';
import { groovesInChain, groovesOnOuter } from '../holeGrooves.js';

export { groovesInChain, chainWithoutGrooves, groovesOnOuter } from '../holeGrooves.js';
const r3 = (v) => Math.round(v * 1000) / 1000;

/** Zápichy v díře nakreslené ve výkresu (samostatný řetěz, jinak díra v kontuře). */
export function groovesFromDrawing(S) {
  try {
    const src = boreChainFromState({ ...S, params: { ...S.params, boreSource: 'cad' } });
    return src ? groovesInChain(src.segs) : [];
  } catch {
    return [];
  }
}

/**
 * Vnější zápichy nakreslené na obrysu dílu (pravidlo 17) — díra napojená na
 * čelo se z kontury nejdřív oddělí, ať se její stěna nepočítá.
 */
export function outerGroovesFromDrawing(S) {
  try {
    const p = S.params || {};
    const segs = segmentsFromPoints(S.contourPoints, p.mode).filter(Boolean);
    const split = splitBoreFromSegments(segs, p.roughingSide === 'left' ? 'left' : 'right');
    return groovesOnOuter(split ? split.outer : segs);
  } catch {
    return [];
  }
}

/** Z upich vnějšího zápichu = bok na straně sklíčidla (zprava menší Z, zleva větší). */
export function outerGrooveZ(prms, g) {
  return prms.roughingSide === 'left' ? g.zHi : g.zLo;
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
      S.params.grooveChamfer = g.s || 0;
      S.partOffPickMode = false;
      const picked = autoPickToolFor ? autoPickToolFor('groovein').msg : '';
      const cz = (v) => String(v).replace('.', ',');
      showToast(`Zápich v díře z výkresu: Z ${cz(g.zA)}, šířka ${cz(g.W)}, dno ⌀${cz(r3(2 * g.rBot))}${picked}`);
      applyChange({ cycle: true });
    });
  });
  // Vnější zápich z výkresu (Upich + ◯ Vnější): Z = bok u sklíčidla, šířka, Dojezd X = dno.
  tabBody.querySelectorAll('[data-act="groove-outer-from-cad"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const g = outerGroovesFromDrawing(S)[Number(btn.dataset.i)];
      if (!g) return;
      pushHistory();
      S.params.partOffZ = outerGrooveZ(S.params, g);
      S.params.grooveWidth = g.W;
      S.params.allowanceX = g.rBot;
      S.params.grooveChamfer = g.s || 0;
      S.partOffPickMode = false;
      const picked = autoPickToolFor ? autoPickToolFor('partoff').msg : '';
      const cz = (v) => String(v).replace('.', ',');
      showToast(`Zápich z výkresu: Z ${cz(S.params.partOffZ)}, šířka ${cz(g.W)}, dno ⌀${cz(r3(2 * g.rBot))}${picked}`);
      applyChange({ cycle: true });
    });
  });
}
