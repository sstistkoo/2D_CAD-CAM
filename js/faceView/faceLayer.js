// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – Bokorys (pohled na čelo): vrstvy čel — data          ║
// ╚══════════════════════════════════════════════════════════════╝
// Kresba pro POHÁNĚNÉ NÁSTROJE (díry, drážky na čele) leží ve vrstvách čel:
// každé čelo = vrstva s příznakem `isFace`, polohou `faceZ` (rovina čela
// v ose Z profilu), stranou `faceSide` ('right' = čelo hledí doprava/+Z,
// nástroj přijíždí zprava; 'left' = zleva) a středem pohledu `origin` (osa
// vřetena v bokorysu, u všech čel stejný — bokorys je vpravo vedle nárysu).
// Kreslí se do AKTUÁLNÍHO čela (`faceCurrent`), ostatní čela jsou skrytá.
// Vrstvy se ukládají, vrací (↩) i exportují jako každé jiné.
//
// Do profilu (přenos do CAM, CNC kód, kontrola kontury) objekty čel NEPATŘÍ —
// vyřazují je stockTools._contourObjects a fileIO.runCncExport (podle isFace).
// Do CAM jdou přes 🛠 Operace → 📥 Z CAD (cam/live/liveFromCad.js) v souřadnicích
// vůči středu čela: vodorovně X (C 0°), svisle Y (C 90°), s Z a stranou čela.
// Čárkovaná / čerchovaná kružnice je POMOCNÁ (roztečná kružnice) — do CAM nejde,
// díra se z ní nedělá (isAuxCircle).
// Modul je bez UI; importuje jen stav a typy čar (čte ho i vykreslování).
import { state } from '../state.js';
import { objDash } from '../lineStyles.js';

export const FACE_LAYER_NAME = 'Čelo (bokorys)';

/** Všechny vrstvy čel. */
export function getFaceLayers() {
  return (state.layers || []).filter(l => l && l.isFace);
}

/** Aktuální čelo (do něj se kreslí), nebo null (bokorys ještě nebyl zapnutý). */
export function getFaceLayer() {
  const all = getFaceLayers();
  return all.find(l => l.faceCurrent) || all[0] || null;
}

/** Je vrstva vrstvou čela? */
export function isFaceLayerId(id) {
  return getFaceLayers().some(l => l.id === id);
}

// UI (faceView.js) si nechá dát vědět, když se zapnutí změní i jinak než
// tlačítkem — načtení projektu, ↩, oko u vrstvy v panelu Vrstvy.
let _uiSync = null, _lastMode = null;
export function onFaceViewChange(fn) { _uiSync = fn; _lastMode = null; }
export function faceUiSync() {
  const l = getFaceLayer();
  const mode = faceViewMode() + (l ? `:${l.id}:${l.faceZ}:${l.faceSide}` : '');
  if (mode !== _lastMode && _uiSync) { _lastMode = mode; _uiSync(faceViewMode() !== 'off'); }
}

/**
 * Stav ◎: 'off' (jen profil) → 'both' (profil + bokorys) → 'solo' (jen bokorys,
 * ostatní vrstvy skryté; které to byly, si aktuální čelo pamatuje v `soloHidden`).
 */
export function faceViewMode() {
  const l = getFaceLayer();
  if (!l || !l.visible || !l.origin) return 'off';
  return l.solo ? 'solo' : 'both';
}

/** Je bokorys zapnutý (aktuální čelo existuje a je viditelné)? */
export function faceViewOn() {
  return faceViewMode() !== 'off';
}

/**
 * NATOČENÍ POHLEDU (posuvník vpravo od bokorysu, faceRotate.js): úhel C,
 * který je v nárysu NAHOŘE (soustruh; karusel vpravo). Výchozí jako dřív:
 * soustruh C 90° (svislá osa bokorysu), karusel C 0°. Nárys pak ukazuje díry
 * čel i děr v plášti tak, jak při tomto natočení dílu leží. Pamatuje se ve
 * vrstvách čel (`viewC`, uloží se s výkresem).
 */
export function faceViewC() {
  const l = getFaceLayer();
  if (l && Number.isFinite(l.viewC)) return l.viewC;
  return state.machineType === 'karusel' ? 0 : 90;
}
export function setFaceViewC(c) {
  const v = +(((c % 360) + 360) % 360).toFixed(3);
  getFaceLayers().forEach(l => { l.viewC = v; });
  return v;
}

/** Patří objekt do kresby některého čela? */
export function isFaceObject(o) {
  return !!o && isFaceLayerId(o.layer);
}

// DÍRY V PLÁŠTI (radiální, faceView/shellHoles.js) leží v nárysu ve vlastní
// vrstvě s příznakem `isShell` — stejně jako čela to NENÍ profil (CAM, CNC
// kód, kontrola kontury, zrcadlení je vynechávají).
export const SHELL_LAYER_NAME = 'Díry v plášti';

/** Vrstva děr v plášti, nebo null (ještě nebyla díra do pláště). */
export function getShellLayer() {
  return (state.layers || []).find(l => l && l.isShell) || null;
}

/** Vrstva kresby pro poháněné nástroje (čelo nebo plášť) — není profil. */
export function isFeatureLayerId(id) {
  return (state.layers || []).some(l => l && l.id === id && (l.isFace || l.isShell));
}

/** Objekt kresby pro poháněné nástroje (díra / drážka čela, díra v plášti). */
export function isFeatureObject(o) {
  return !!o && isFeatureLayerId(o.layer);
}

/** Objekty profilu (vše kromě vrstev čel a děr v plášti). */
export function profileObjects() {
  const ids = new Set((state.layers || []).filter(l => l && (l.isFace || l.isShell)).map(l => l.id));
  return ids.size ? state.objects.filter(o => !ids.has(o.layer)) : state.objects;
}

/**
 * Pomocná kružnice čela (roztečná) — kreslená čárkovaně / čerchovaně (typ čáry
 * s čárkováním). Díra je kružnice plnou čarou.
 */
export function isAuxCircle(o) {
  return !!o && o.type === 'circle' && objDash(o).length > 0;
}

/**
 * Díry všech čel (kružnice plnou čarou, ne pomocné roztečné): [{ face, o }].
 * Čte je dokreslení nárysu (faceFrontView.js) — i u skrytých čel, výkres
 * ukazuje všechny díry dílu.
 */
export function faceHoles() {
  const out = [];
  getFaceLayers().forEach(l => {
    if (!l.origin) return;
    state.objects.forEach(o => {
      if (o.layer === l.id && o.type === 'circle' && o.r > 0 && !isAuxCircle(o)) out.push({ face: l, o });
    });
  });
  return out;
}

/** Kopie objektu posunutá o (−ox, −oy); jen typy, které převod do CAM čte. */
function toLocal(o, ox, oy) {
  if (o.type === 'circle' || o.type === 'arc') return { ...o, cx: o.cx - ox, cy: o.cy - oy };
  if (o.type === 'line' || o.type === 'constr')
    return { ...o, x1: o.x1 - ox, y1: o.y1 - oy, x2: o.x2 - ox, y2: o.y2 - oy };
  return { ...o };
}

/**
 * Kresby všech čel v souřadnicích vůči středu čela (kopie, výkres se nemění):
 * [{ id, name, z, side: 'right'|'left', objects }]. Pomocné (roztečné)
 * kružnice se vynechají — nejsou to díry.
 */
export function faceDrawingsLocal() {
  return getFaceLayers().filter(l => l.origin).map(l => ({
    id: l.id, name: l.name,
    z: Number.isFinite(l.faceZ) ? l.faceZ : 0,
    side: l.faceSide === 'left' ? 'left' : 'right',
    objects: state.objects.filter(o => o.layer === l.id && !isAuxCircle(o)).map(o => toLocal(o, l.origin.x, l.origin.y)),
  }));
}

/** Kresba aktuálního čela vůči středu čela (zpětná kompatibilita, testy). */
export function faceObjectsLocal() {
  const l = getFaceLayer();
  const d = l ? faceDrawingsLocal().find(f => f.id === l.id) : null;
  return d ? d.objects : [];
}

/**
 * Popisek čela pro seznamy: „Z0 ◀" / „Z-150 ▶". Šipka = SMĚR POHLEDU jako na
 * výkresu: čelo zprava = díváme se zprava doleva (◀), zleva = doprava (▶).
 */
export function faceLabel(l) {
  const z = Number.isFinite(l.faceZ) ? +(+l.faceZ).toFixed(2) : 0;
  return `Z${z} ${l.faceSide === 'left' ? '▶' : '◀'}`;
}
