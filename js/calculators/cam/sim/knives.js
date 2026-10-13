// Nože v CAM simulátoru = změny parametrů nástroje (paramChanges.js) + sloty
// 🔧 Zásobníku (knifeSlots.js). Obě části se volají navzájem, proto je skládá
// jedna továrna: vzájemná volání se předávají líně (druhá část v okamžiku
// skládání ještě neexistuje). docs/plan-rozdeleni-cam-simulatoru.md.
import { createParamChanges } from './paramChanges.js';
import { createKnifeSlots } from './knifeSlots.js';

/**
 * @param ctx { S, toolUi, applyChange, renderTab, withBusy, gcodeStale, pathInputsKey, fullUpdate, saveState, pushHistory }
 */
export function createKnives({ S, toolUi, applyChange, renderTab, withBusy, gcodeStale, pathInputsKey, fullUpdate, saveState, pushHistory }) {
  let slots = null;
  const params = createParamChanges({
    S, applyChange, renderTab, withBusy,
    _rememberShapeKnife: (...a) => slots._rememberShapeKnife(...a),
    _loadShapeKnife: (...a) => slots._loadShapeKnife(...a),
    _polygonForStrategy: (...a) => slots._polygonForStrategy(...a),
  });
  slots = createKnifeSlots({
    S, toolUi, gcodeStale, pathInputsKey, fullUpdate, saveState, pushHistory,
    dropInsertGuides: params.dropInsertGuides, afterToolChange: params.afterToolChange, applyAfterToolChange: params.applyAfterToolChange,
  });
  return { ...params, ...slots };
}
