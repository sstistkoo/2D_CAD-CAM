// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM simulátor – karusel po X: simulace v PROHOZENÝCH osách    ║
// ╚══════════════════════════════════════════════════════════════╝
// Dráhy karuselu „po X" vznikají v prohozeném světě (x' = z, z' = x,
// cam/xzSwap.js), kde je nůž svisle ze smykadla: obrys držáku z
// `holderWorldLoop` míří k +X' = ke skutečnému +Z. Úběr, ⛔ validátor,
// stopa vnoření držáku i zajetí do kontury ale počítaly ve SKUTEČNÉM
// světě s držákem soustruhu (vodorovně, k +X) — v ⚠ panelu se proto
// objevovaly falešné kolize. Stejný vzor jako vyvrtávání v zrcadle
// (boreSimFor v camSimulator.js): vše se počítá v prohozeném světě nad
// `calc._xz` a smyčky/nálezy se pro kreslení prohodí zpátky (x ↔ z).
//
// Kreslení nože na plátně se neměnilo: lokální obrys (profil z nahoru)
// v pohledu karuselu (X vodorovně, Z svisle) už odpovídá svislému nože.
//
// Dráha simulace se bere ze SKUTEČNÉ `calc.simPath` (po ruční úpravě
// G-kódu ji camSimulator obnoví bez přepočtu), prohodí se bod po bodu.

import { swapsXZ } from '../xzSwap.js';
import { MaterialRemoval } from '../materialRemoval.js';
import { ContourGouge } from '../contourGouge.js';
import { HolderGouge } from '../holderGouge.js';
import { validateToolpath } from '../collisionValidator.js';
import { startInMaterial } from '../startCheck.js';

const swPt = (p) => ({ x: p.z, z: p.x });
/** Smyčky {x,z} z prohozeného světa do skutečného (a naopak — involuce). */
export const swapLoops = (loops) => loops.map(l => l.map(swPt));
const flipDir = (d) => (d === 'G2' ? 'G3' : d === 'G3' ? 'G2' : d);

/** Dráha simulace (body {x,z,…}, u oblouků arcParams) do prohozeného světa. */
export function swapSimPath(path) {
  if (!Array.isArray(path)) return path;
  return path.map(p => {
    const q = { ...p, x: p.z, z: p.x, type: flipDir(p.type) };
    const a = p.arcParams;
    if (a) {
      q.arcParams = {
        ...a, cx: a.cz, cz: a.cx, dir: flipDir(a.dir),
        startAngle: Math.PI / 2 - a.startAngle, endAngle: Math.PI / 2 - a.endAngle,
      };
    }
    return q;
  });
}

/** Nález validátoru / startCheck s prohozenými souřadnicemi zpět. */
const swapIssue = (it) => (it ? { ...it, x: it.z, z: it.x } : it);

/**
 * Pohled simulace v prohozených osách. Každá metoda vrací výsledek ve
 * SKUTEČNÉM světě; `active(calc)` říká, zda se vůbec uplatní.
 * @param {{S:object, toolMirrored:() => boolean}} deps
 */
export function createXzSimView({ S, toolMirrored }) {
  let ph = null;   // fáze vázaná na identitu calc a jeho simPath
  function phase(calc) {
    if (!calc || !calc._xz || !calc.simPath || calc.simPath.length < 2 || !swapsXZ(S)) return null;
    if (ph && ph.calc === calc && ph.src === calc.simPath) return ph;
    const c2 = calc._xz.calc;
    ph = {
      calc, src: calc.simPath, params: calc._xz.S.params,
      calcM: { ...c2, simPath: swapSimPath(calc.simPath) },
      removal: null, outer: null, contour: null, holder: null,
    };
    return ph;
  }
  const at = (p) => S.simProgress * (p.calcM.simPath.length - 1);
  function removalIn(p) {
    if (!p.removal) p.removal = new MaterialRemoval(p.params, p.calcM.stockPathSegments);
    if (!p.removal.valid) return null;
    p.removal.advanceTo(p.calcM.simPath, at(p));
    return p.removal;
  }
  const view = (rm) => ({ valid: true, model: { loops: swapLoops(rm.model.loops) }, baseLoop: swapLoops([rm.baseLoop])[0] });

  return {
    active: (calc) => !!phase(calc),

    /** Vizuální úběr (getRemovalModel). */
    removal(calc) {
      const p = phase(calc);
      const rm = p && removalIn(p);
      return rm && rm.model ? view(rm) : null;
    },

    /** Pás k offsetové čáře (getRemovalOuterModel). */
    removalOuter(calc) {
      const p = phase(calc);
      if (!p) return null;
      if (!p.outer) p.outer = new MaterialRemoval(p.params, p.calcM.stockPathSegments, { planningOutline: true });
      if (!p.outer.valid) return null;
      p.outer.advanceTo(p.calcM.simPath, at(p));
      return p.outer.model ? view(p.outer) : null;
    },

    /** Zajetí do hotové kontury (getContourGouge). */
    contourGouge(calc) {
      const p = phase(calc);
      if (!p || S.simProgress <= 0) return null;
      const rm = removalIn(p);
      if (!p.contour) p.contour = new ContourGouge(p.params, p.calcM.contourSegments, p.calcM.stockPathSegments);
      if (!rm || !rm.model || !p.contour.valid) return null;
      const loops = p.contour.update(rm.model.loops);
      return loops.length ? swapLoops(loops) : null;
    },

    /** Akumulovaná stopa vnoření držáku (getHolderGouge). */
    holderGouge(calc) {
      const p = phase(calc);
      if (!p || S.simProgress <= 0) return null;
      if (!p.holder) p.holder = new HolderGouge(p.params, p.calcM.stockPathSegments, toolMirrored(), { band: true });
      if (!p.holder.valid) return null;
      p.holder.advanceTo(p.calcM.simPath, at(p));
      const hard = p.holder.gouge.length ? swapLoops(p.holder.gouge) : null;
      const band = p.holder.gougeBand.length ? swapLoops(p.holder.gougeBand) : null;
      return (hard || band) ? { hard, band } : null;
    },

    /**
     * ⛔ validátor a start v materiálu (runCollisionValidation).
     * @returns {{issues:object[], start:(object|null)}}
     */
    validate(calc) {
      const p = phase(calc);
      if (!p) return { issues: [], start: null };
      const backside = toolMirrored();
      const issues = validateToolpath(p.calcM.simPath, p.params, p.calcM.stockPathSegments, { backside, planStock: true });
      const out = issues.map(swapIssue);
      if (issues.truncated) out.truncated = issues.truncated;
      return { issues: out, start: swapIssue(startInMaterial(p.params, p.calcM, { backside })) };
    },
  };
}
