// SKICA – sdílený kód CAM Editoru (camEditor.js) a CNC Editoru (cncEditor.js)
// Vyčleněno 16. 10. 2026: oba editory byly téměř shodné kopie (viz paměť
// „CNC Editor = dvojče CAM Editoru"). Co je tu, platí pro OBA editory; rozdíly
// (průměr/karusel/I,K u převodu rohů) se předávají parametry.

import { filletTwoLines, chamferTwoLines } from '../geometry.js';
export const G_CODES = {
  '0':'Rychloposuv','1':'Lineární interpolace','2':'Kruhová int. (CW)',
  '3':'Kruhová int. (CCW)','4':'Časová prodleva','17':'Rovina XY',
  '18':'Rovina ZX','19':'Rovina YZ','40':'Zrušení kompenzace',
  '41':'Komp. vlevo','42':'Komp. vpravo','53':'Strojní souřadnice',
  '54':'Nulový bod 1','55':'Nulový bod 2','56':'Nulový bod 3',
  '57':'Nulový bod 4','90':'Absolutní','91':'Přírůstkové',
  '94':'Posuv mm/min','95':'Posuv mm/ot','96':'Konst. řezná rychlost',
  '97':'Konst. otáčky'
};

export const M_CODES = {
  '0':'Stop programu','1':'Volitelný stop','3':'Vřeteno CW',
  '4':'Vřeteno CCW','5':'Stop vřetena','6':'Výměna nástroje',
  '8':'Chlazení ZAP','9':'Chlazení VYP','17':'Konec podprogramu',
  '30':'Konec programu','80':'Odjezd do pozice výměny'
};

// ── Pre-compiled regex ─────────────────────────────────────────
// Jediný průchod přes kód řádku – každý znak je vypsán právě jednou
// (buď prostý, nebo obalený přesně jedním <span>), takže výstup má
// vždy stejný počet řádků/sloupců jako textarea (žádné vnořené spany).
export const TOKEN_RE = new RegExp(
  '(?<msg>MSG\\s*\\([^)]*\\))' +
  '|(?<block>\\bN\\d+\\b)' +
  '|(?<logic>\\b(?:GOTOF|GOTOB|IF|ELSE|ENDIF|STOPRE)\\b)' +
  '|(?<sub>\\bL\\d+\\b)' +
  '|(?<g>\\bG\\d+\\b)' +
  '|(?<m>\\bM\\d+\\b)' +
  '|(?<param>\\bR\\d+\\b)' +
  '|(?<coord>[XZIKCR]\\s*=?\\s*[-\\d.]+)' +
  '|(?<feed>\\b[FSTD]\\d*\\.?\\d+\\b)',
  'gi'
);

// ── Helpers ────────────────────────────────────────────────────
export function esc(t) { return String(t ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

export function storageSave(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* quota */ }
}

export function storageLoad(key) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch { return null; }
}

// Umožní do fronty pro spojení načíst i uložený projekt (.camprog) – vytáhne
// z něj uložený G-kód (pole manualGCode), místo syrového JSON obsahu souboru.
export function extractGCodeFromFile(name, text) {
  if (/\.camprog$/i.test(name)) {
    try {
      const data = JSON.parse(text);
      if (data && typeof data.manualGCode === 'string' && data.manualGCode.trim()) return data.manualGCode;
    } catch { /* není platný JSON projekt – použije se syrový obsah */ }
  }
  return text;
}

export function defaultHeaderConfig() {
  return {
    gear:    { name: 'Převod (M4x)',       active: true, val: '41' },
    door:    { name: 'Odjezd do výměny',   active: true, val: '80' },
    tool:    { name: 'Nástroj a korekce',  active: true, t: '1', d: '1' },
    coords:  { name: 'Souřadný systém',   active: true, val: 'G54' },
    feed:    { name: 'Posuv',              active: true, mode: 'G95' },
    spindle: { name: 'Vřeteno',            active: true, mode: 'G97', s: '500', m: '4', lims: '2000' }
  };
}

// ── Řídicí systém (sdíleno s CAM Editorem/Simulátorem přes localStorage) ─
export function getControlSystem() {
  try {
    const saved = JSON.parse(localStorage.getItem('skica-cam-simulator') || 'null');
    if (saved && saved.params && saved.params.controlSystem) return saved.params.controlSystem;
  } catch { /* ignore */ }
  return 'sinumerik';
}

// Sražení a zaoblení hrany se v jednotlivých řídicích systémech zapisují
// odlišnou syntaxí: Sinumerik CHF=/RND= jako přiřazení hodnoty, Fanuc přímo
// písmenem C/R za koncovými souřadnicemi bloku, Heidenhain vlastním
// blokem CHF <hodnota> / RND R<hodnota>.
export function getChamferPrefix() {
  const ctrl = getControlSystem();
  if (ctrl === 'fanuc') return 'C';
  if (ctrl === 'heidenhain') return 'CHF ';
  return 'CHF=';
}

export function getRoundPrefix() {
  const ctrl = getControlSystem();
  if (ctrl === 'fanuc') return 'R';
  if (ctrl === 'heidenhain') return 'RND R';
  return 'RND=';
}

// Regex pro rozpoznání markeru sražení/zaoblení v textu kódu, dle aktuálního
// řídicího systému (musí odpovídat tomu, co vkládají tlačítka Sraž./Zaobl.
// přes getChamferPrefix()/getRoundPrefix()).
export function getCornerMarkerRegex(kind) {
  const ctrl = getControlSystem();
  if (kind === 'chamfer') {
    if (ctrl === 'fanuc') return /\bC([\d.]+)\b/i;
    if (ctrl === 'heidenhain') return /\bCHF\s+([\d.]+)/i;
    return /\bCH[FR]\s*=\s*([\d.]+)/i; // Sinumerik: CHF= nebo CHR=
  }
  if (ctrl === 'fanuc') return /\bR([\d.]+)\b/i;
  if (ctrl === 'heidenhain') return /\bRND\s+R([\d.]+)/i;
  return /\bRND\s*=\s*([\d.]+)/i;
}

// Za vloženým obloukem (G2/G3) by řádek bez G (modální G1 z kompaktního exportu) převzal G2/G3 –
// proto dostane výslovné G1.
export function explicitG1(text) {
  const ci = text.indexOf(';');
  const code = ci >= 0 ? text.slice(0, ci) : text;
  if (/\bG0*[0-3](?!\d)/i.test(code)) return text;
  const n = (code.match(/^\s*N\d+\s*/i) || [''])[0];
  return n + 'G1 ' + text.slice(n.length);
}

// Přepíše (nebo doplní) X/Z na řádku na nové souřadnice; volitelně z řádku
// nejprve odstraní text markeru sražení/zaoblení (pokud byl na stejném
// řádku jako pohyb). Ostatní obsah řádku (N-blok, G-kód, komentář) zachová.
// `fmt` = zápis čísla (CAM Editor 3 desetinná místa, CNC Editor bez zbytečných nul).
function rewriteLineXZ(lineText, newX, newZ, stripRe, fmt) {
  const ci = lineText.indexOf(';');
  let code = ci !== -1 ? lineText.slice(0, ci) : lineText;
  const comment = ci !== -1 ? lineText.slice(ci) : '';

  if (stripRe) code = code.replace(stripRe, '');

  const xStr = 'X' + fmt(newX);
  const zStr = 'Z' + fmt(newZ);
  code = /\bX\s*-?[\d.]+/i.test(code) ? code.replace(/\bX\s*-?[\d.]+/i, xStr) : (code.replace(/\s+$/, '') + ' ' + xStr);
  code = /\bZ\s*-?[\d.]+/i.test(code) ? code.replace(/\bZ\s*-?[\d.]+/i, zStr) : (code.replace(/\s+$/, '') + ' ' + zStr);

  return code.replace(/[ \t]+/g, ' ').replace(/\s+$/, '') + (comment ? ' ' + comment : '');
}

// ── Sražení/zaoblení → skutečná G-kód dráha ─────────────────────
// Najde markery CHF=/RND= (resp. C/R, CHF/RND R dle řídicího systému)
// vložené tlačítky Sraž./Zaobl. a nahradí je reálnou drahou: zkrácenou
// úsečkou před rohem + G2/G3 obloukem (zaoblení) nebo G1 spojovací
// úsečkou (sražení). Používá stejnou geometrii jako CAD nástroj Zaob./Zkos.
// (filletTwoLines/chamferTwoLines z geometry.js).
//
// Volby (výchozí = chování CAM Editoru):
//   onlyLine – převést jen marker(y) na tomto řádku (null = všechny),
//   xs       – měřítko X v kódu (2 = X je průměr; geometrie se počítá v poloměru),
//   ik       – zapsat u oblouku i I/K (střed relativně k začátku oblouku),
//   fmt      – zápis čísla,
//   gWord    – G2/G3 ze znaménka vektorového součinu (viz níž).
export function convertCornersToPaths(code, {
  onlyLine = null,
  xs = 1,
  ik = false,
  fmt = v => v.toFixed(3),
  gWord = cross => (cross > 0 ? 'G3' : 'G2'),
} = {}) {
  const lines = code.split('\n');
  const n = lines.length;
  const ctrl = getControlSystem();
  const chamferRe = getCornerMarkerRegex('chamfer');
  const roundRe   = getCornerMarkerRegex('round');

  // ── Pass 1: modální sledování polohy + seznam pohybových bodů a markerů ──
  const points = []; // { lineIdx, x, z, isFeed }
  let markers = []; // { lineIdx, kind, value, hasOwnXZ, pointIdx }
  let x = null, z = null, mode = 90, modalG = null;   // modalG = poslední G0–G3 (řádky bez G se řídí jím)

  for (let i = 0; i < n; i++) {
    const raw = lines[i];
    const ci = raw.indexOf(';');
    const clean = (ci !== -1 ? raw.slice(0, ci) : raw).trim().toUpperCase();
    if (!clean) continue;

    if (/\bG90\b/.test(clean)) mode = 90;
    if (/\bG91\b/.test(clean)) mode = 91;

    // Řádek bez G (např. „X185 Z25" z kompaktního exportu) platí v naposledy zadaném modálním pohybu.
    const gm = [...clean.matchAll(/\bG0*([0-3])(?!\d)/g)].map(m => +m[1]);
    if (gm.length) modalG = gm[gm.length - 1];
    const isFeed    = modalG === 1;
    const isRapid   = modalG === 0;
    const isArcMove = modalG === 2 || modalG === 3;

    const xm = clean.match(/\bX\s*(-?[\d.]+)/);
    const zm = clean.match(/\bZ\s*(-?[\d.]+)/);
    const hasXZ = !!(xm || zm);

    let curX = x, curZ = z;
    if (hasXZ) {
      const xv = xm ? parseFloat(xm[1]) : null;
      const zv = zm ? parseFloat(zm[1]) : null;
      curX = xv === null ? x : (mode === 91 ? (x ?? 0) + xv : xv);
      curZ = zv === null ? z : (mode === 91 ? (z ?? 0) + zv : zv);
    }

    // Fanuc: holé C/R jsou nejednoznačné na řádku s G2/G3 (tam R = poloměr
    // oblouku) – takové řádky pro marker přeskočíme.
    const skipMarkerOnLine = ctrl === 'fanuc' && isArcMove;
    const cm = !skipMarkerOnLine ? clean.match(chamferRe) : null;
    const rm = !skipMarkerOnLine ? clean.match(roundRe)   : null;
    const markerKind = cm ? 'chamfer' : (rm ? 'round' : null);
    const markerVal  = cm ? parseFloat(cm[1]) : (rm ? parseFloat(rm[1]) : null);

    if (hasXZ && (isFeed || isRapid)) {
      x = curX; z = curZ;
      const pointIdx = points.length;
      points.push({ lineIdx: i, x, z, isFeed });
      if (markerKind) markers.push({ lineIdx: i, kind: markerKind, value: markerVal, hasOwnXZ: true, pointIdx });
    } else if (markerKind) {
      markers.push({ lineIdx: i, kind: markerKind, value: markerVal, hasOwnXZ: false, pointIdx: points.length - 1 });
    }
  }

  if (onlyLine !== null) markers = markers.filter(m => m.lineIdx === onlyLine);
  if (!markers.length) return { code, converted: 0, skipped: 0 };

  // ── Pass 2: pro každý marker spočti geometrii korekce rohu ──
  const lineEdits = new Map();  // lineIdx -> nový text řádku (null = smazat)
  const needG1 = new Set();     // řádky za vloženým obloukem, které potřebují výslovné G1
  const insertions = new Map(); // lineIdx -> pole řádků k vložení ZA tento řádek
  let converted = 0, skipped = 0;
  // Geometrie se počítá ve fyzické rovině (poloměr, Z): v režimu „průměr" je X
  // v kódu dvojnásobné – bez přepočtu by zaoblení/sražení vyšlo zkreslené.
  // Zpět do kódu (X i I) se píše ve stejných jednotkách jako X.

  for (const mk of markers) {
    const cornerPtIdx = mk.pointIdx;
    const beforePtIdx = cornerPtIdx - 1;
    const afterPtIdx  = cornerPtIdx + 1;
    if (cornerPtIdx < 0 || beforePtIdx < 0 || afterPtIdx >= points.length) { skipped++; continue; }

    const beforePt = points[beforePtIdx];
    const cornerPt = points[cornerPtIdx];
    const afterPt  = points[afterPtIdx];
    if (!cornerPt.isFeed || !afterPt.isFeed) { skipped++; continue; } // jen mezi G1 pohyby

    const lineA = { x1: beforePt.x / xs, y1: beforePt.z, x2: cornerPt.x / xs, y2: cornerPt.z };
    const lineB = { x1: cornerPt.x / xs, y1: cornerPt.z, x2: afterPt.x / xs,  y2: afterPt.z };

    let tp1, tp2, connectorLine;
    if (mk.kind === 'round') {
      const res = filletTwoLines(lineA, lineB, mk.value);
      if (!res.ok) { skipped++; continue; }
      tp1 = { x: lineA.x2, z: lineA.y2 };
      tp2 = { x: lineB.x1, z: lineB.y1 };
      const cx = res.arc.cx, cz = res.arc.cy, r = res.arc.r;
      // Směr G2 (CW) / G3 (CCW) dopočítaný z reálné geometrie oblouku
      // (nespoléhá na startAngle/endAngle – ty po interní normalizaci ve
      // filletTwoLines nemusí odpovídat pořadí tp1→tp2). G3/ccw je (jak ho
      // čte parseGcodeToObjects i vykresluje drawArc) definován ve SKUTEČNÉM
      // světovém (X,Z) systému, kde světové X = G-kód Z pole a světové Y =
      // G-kód X pole (soustružnická konvence) – proto se v cross productu
      // musí prohodit .x/.z oproti tomu, jak jsou pojmenované v G-kódu.
      const cross = (tp1.z - cz) * (tp2.x - cx) - (tp1.x - cx) * (tp2.z - cz);
      // I/K = střed oblouku relativně k jeho začátku (tp1): I v ose X, K v ose Z.
      const ikStr = ik ? ` I${fmt(cx - tp1.x)} K${fmt(cz - tp1.z)}` : '';   // I v poloměru i v průměrovém režimu
      connectorLine = `${gWord(cross)} X${fmt(tp2.x * xs)} Z${fmt(tp2.z)}${ikStr} R${fmt(r)}`;
    } else {
      const res = chamferTwoLines(lineA, lineB, mk.value, mk.value);
      if (!res.ok) { skipped++; continue; }
      tp1 = { x: lineA.x2, z: lineA.y2 };
      tp2 = { x: lineB.x1, z: lineB.y1 };
      connectorLine = `G1 X${fmt(tp2.x * xs)} Z${fmt(tp2.z)}`;
    }

    if (mk.kind === 'round') needG1.add(afterPt.lineIdx);
    const cornerLineIdx = cornerPt.lineIdx;
    const stripRe = mk.hasOwnXZ ? (mk.kind === 'chamfer' ? chamferRe : roundRe) : null;
    lineEdits.set(cornerLineIdx, rewriteLineXZ(lines[cornerLineIdx], tp1.x * xs, tp1.z, stripRe, fmt));

    const ins = insertions.get(cornerLineIdx) || [];
    ins.push(connectorLine);
    insertions.set(cornerLineIdx, ins);

    // Samostatný řádek jen s markerem (bez vlastních X/Z) se po převodu smaže.
    if (!mk.hasOwnXZ && mk.lineIdx !== cornerLineIdx) lineEdits.set(mk.lineIdx, null);

    converted++;
  }

  if (!converted) return { code, converted: 0, skipped };

  // ── Pass 3: sestav výsledný kód ──
  const out = [];
  for (let i = 0; i < n; i++) {
    if (lineEdits.has(i)) {
      const v = lineEdits.get(i);
      if (v !== null) out.push(needG1.has(i) ? explicitG1(v) : v);
    } else {
      out.push(needG1.has(i) ? explicitG1(lines[i]) : lines[i]);
    }
    if (insertions.has(i)) out.push(...insertions.get(i));
  }

  return { code: out.join('\n'), converted, skipped };
}

// Automatické G0/G1 po Enter (CNC Editor) – viz gcodeAutoMotion.js
export { autoCompleteMotionG } from "./gcodeAutoMotion.js";
// Šipky ✛ u polárního úhlu (CNC Editor, Úsečka úhlem) – viz cncAngleCompass.js
export { wireAngleCompass } from "./cncAngleCompass.js";
export { digitKeysHTML } from './cncDigitKeys.js';
