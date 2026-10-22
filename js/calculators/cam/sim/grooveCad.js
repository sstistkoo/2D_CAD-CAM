// Zápich v díře Z VÝKRESU (uživatel 22. 10. 2026: „zápich nakreslený ve
// výkresu by se mohl převzít"). Zápich ve stěně díry je v řetězu díry
// (cam/boreContour.js — samostatný řetěz i díra napojená na čelo) vidět jako
//   schod VEN (radiálně) → ROVNÉ DNO (podél osy) → schod ZPĚT k ose.
// Nalezené zápichy nabídne panel Upich + ◎ Vnitřní; klik vyplní Z boku
// u ústí, šířku a dno (paramsGrooveHtml.js). Jen vstup — dráhu dál počítá
// ops/grooveInner.js podle pravidla 13.
import { boreChainFromState } from '../boreContour.js';
import { showToast } from '../../../state.js';
import { groovesInChain } from '../holeGrooves.js';

export { groovesInChain, chainWithoutGrooves } from '../holeGrooves.js';
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
