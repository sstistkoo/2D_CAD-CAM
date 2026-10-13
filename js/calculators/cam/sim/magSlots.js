// Sloty 🔧 Zásobníku CAM simulátoru — stavba slotu (výchozí, z exportu
// nástroje, z ISO katalogu) a změna tvaru slotu. Čisté funkce bez stavu
// simulátoru; volají se i synchronně při načítání stavu (migrace zásobníku),
// proto obyčejné exporty, ne továrna. Vyňato z camSimulator.js (blok
// „magazine dialog", docs/plan-rozdeleni-cam-simulatoru.md).
import { SHAPE_CUT_DEFAULTS } from '../camDefaults.js';
import { defaultMagazineKnives, presetKnifeForShape } from '../../magazineDefaults.js';
import { upgradeIsoHolderProfile } from '../../isoToolCatalog.js';

export function _defaultMagSlot(num) {
  return {
    slot: num, name: `T${num}`, vbdCode: '',
    shape: 'round', radius: 0.8, tipAngle: 90, toolAngle: 15,
    clearanceAngle: 0, toolLength: 10, tipFlat: 0.1, tipMirror: false,
    vc: 200, f: 0.25, ap: 2.0,
    // Držák — ukládá se spolu s destičkou, aby ✅ Použít obnovilo celý nůž.
    holderLength: 200, holderWidth: 20, holderHand: 'R',
    knifeAngle: 270, holderProfile: null,
    holderInflate: 0, holderInflateAll: false,
  };
}


// Odvodí název slotu z názvu souboru (bez přípony a "_T1" suffixu z exportu).
export function _slotNameFromFilename(filename) {
  const base = String(filename || '').replace(/\.json$/i, '').replace(/_T\d+$/i, '')
    .replace(/[_-]+/g, ' ').trim();
  if (!base) return 'Nůž';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

// Postaví slot zásobníku z exportované geometrie nástroje (viz
// exportToolGeometryFile/CAM_TOOL_KEYS) — pro 📥 Import ze souborů.
export function _buildMagSlotFromTool(tool, num, name) {
  const slot = _defaultMagSlot(num);
  slot.name = name;
  if (tool.toolVbdCode) slot.vbdCode = tool.toolVbdCode;
  if (tool.toolShape) slot.shape = tool.toolShape;
  if (tool.toolRadius !== undefined) slot.radius = tool.toolRadius;
  if (tool.toolTipAngle !== undefined) slot.tipAngle = tool.toolTipAngle;
  if (tool.toolAngle !== undefined) slot.toolAngle = tool.toolAngle;
  if (tool.toolLength !== undefined) slot.toolLength = tool.toolLength;
  if (tool.toolTipFlat !== undefined) slot.tipFlat = tool.toolTipFlat;
  if (tool.toolTipMirror !== undefined) slot.tipMirror = tool.toolTipMirror === true;
  if (tool.toolClearanceAngle !== undefined) slot.clearanceAngle = tool.toolClearanceAngle;
  if (tool.holderLength !== undefined) slot.holderLength = tool.holderLength;
  if (tool.holderWidth !== undefined) slot.holderWidth = tool.holderWidth;
  if (tool.holderHand !== undefined) slot.holderHand = tool.holderHand;
  if (tool.knifeAngle !== undefined) slot.knifeAngle = tool.knifeAngle;
  if (tool.holderInflate !== undefined) slot.holderInflate = tool.holderInflate;
  if (tool.holderInflateAll !== undefined) slot.holderInflateAll = tool.holderInflateAll;
  if (tool.toolInternal !== undefined) slot.internal = tool.toolInternal === true;
  slot.holderProfile = tool.holderProfile ? JSON.parse(JSON.stringify(tool.holderProfile)) : null;
  // Soubory z 💾 Uložit do PC/Zásobník řezné podmínky neobsahují (jen
  // geometrie destička+držák) — doplní se odhad podle tvaru.
  Object.assign(slot, SHAPE_CUT_DEFAULTS[slot.shape] || {});
  return slot;
}

/** Slot zásobníku z nože 📚 ISO katalogu (záznam knihovny) — i s jeho Vc/f/ap. */
export function _isoMagSlot(rec, num) {
  const slot = _buildMagSlotFromTool(rec.tool, num, rec.name);
  if (rec.vc) slot.vc = rec.vc;
  if (rec.f) slot.f = rec.f;
  if (rec.ap) slot.ap = rec.ap;
  return slot;
}

/** Výchozí nože jako sloty T1–T7 — ISO nože + vrták (prázdný zásobník, reset). */
export function _isoDefaultMagSlots() {
  return defaultMagazineKnives().map((rec, i) => _isoMagSlot(rec, i + 1));
}

/** Změna tvaru destičky ve slotu zásobníku = VÝCHOZÍ NŮŽ TOHO TVARU
 *  (presetKnifeForShape, uživatel 7. 10. 2026) — destička, držák i s obrysem
 *  a řezné podmínky, stejně jako tlačítka tvaru v panelu (applyShapeChange).
 *  Dřív se dosazovaly jen předvolby tvaru a obrys držáku se mazal: kulatá
 *  z vrtáku si nesla jeho vyložení 145 mm a pouzdro 40 × 80. Vlastní jméno
 *  slotu zůstává; jméno výchozího nože se přepíše na nový nůž. */
export function _setMagSlotShape(slot, next) {
  if (!slot || slot.shape === next) return;
  const rec = presetKnifeForShape(next);
  if (!rec) { slot.shape = next; return; }
  const keepName = !defaultMagazineKnives().some(d => d.name === slot.name);
  const preset = _isoMagSlot(rec, slot.slot);
  for (const k of Object.keys(preset)) {
    if (k === 'slot' || (k === 'name' && keepName)) continue;
    slot[k] = preset[k];
  }
}

// Volá se i při načítání stavu — S jako parametr (simulátor má obal _upgradeIsoHolders).
/** Starý obrys držáku nožů z 📚 ISO katalogu (verze 1: hlava končila přesně
 *  na břitu) → aktuální — ve slotech `slots`, v S.params i v částech
 *  programu. Nože odjinud a upravené obrysy se nemění. Vrací počet oprav. */
export function upgradeIsoHolders(S, slots) {
  const fix = (obj, nameKey, vbdKey) => {
    const np = obj ? upgradeIsoHolderProfile(obj[nameKey], obj[vbdKey], obj.holderProfile) : null;
    if (np) obj.holderProfile = JSON.parse(JSON.stringify(np));
    return np ? 1 : 0;
  };
  let n = 0;
  for (const sl of slots || []) n += fix(sl, 'name', 'vbdCode');
  n += fix(S.params, 'toolName', 'toolVbdCode');
  for (const part of S.opParts || []) n += fix(part.params, 'toolName', 'toolVbdCode');
  return n;
}
