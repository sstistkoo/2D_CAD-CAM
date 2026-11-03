// ╔══════════════════════════════════════════════════════════════╗
// ║  CAM – karusel: hrubování v PROHOZENÝCH osách X ↔ Z            ║
// ╚══════════════════════════════════════════════════════════════╝
// Uživatel 3. 11. 2026: na karuselu je díl velký v X a nízký v Z, dlouhé
// průchody tedy patří po X (čelně) — jenže vyladěné je podélné hrubování
// (po Z: úseky, Cik cak, kapsy, hrby, hlídání držáku). Nůž jde svisle dolů
// ze smykadla. Prohozený svět (x' = z, z' = x) je přesně úloha soustruhu:
// stůl (Z0) je „osa", nůž míří shora (+X') jako na soustruhu zvenku a
// podélné průchody po Z' jedou po skutečném X. Stejný princip jako
// hrubování zleva v Z-zrcadle (zMirror.js): vstup se překlopí, výpočet i
// emise G-kódu proběhnou beze změny a výsledek se vrátí do reálného světa —
// `calc` pro kreslení geometricky, G-kód prohozením slov X ↔ Z a G2 ↔ G3.
//
// Prohození os je zrcadlení podle úhlopříčky: úhel oblouku a = atan2(x−cx,
// z−cz) přejde na π/2 − a a smysl se obrátí. U polí s pořadím-KONVENCÍ
// (kontura, offsety, polotovar) se navíc obrátí pořadí → smysl zůstává
// (jako mirrorSegPath). Pole s pořadím-ČASEM (contourLeadIn/Out) se
// neobracejí a smysl se prohodí.
//
// Zapíná se přepínačem `carouselSwapXZ` (jen karusel). Tlačítka strategií
// drží skutečný význam: ↔ Čelně (po X) = podélný algoritmus v prohozeném
// světě, ↕ Podélně (po Z) = čelní, ⇅ Cik cak = cik cak po X.
// Zatím se NEprohazuje: závit, vrtání, vyvrtávání, upich (prohození se
// vypne), meze čelistí/koníku a rozsahy 📐 (v prohozeném světě neplatí) a
// plán úseků „✂ Po úsecích" (v reálném calc chybí → tlačítko ohlásí proč).

import { resolvePointsToAbsolute } from './contourBuild.js';

const flipDir = (d) => (d === 'G2' ? 'G3' : d === 'G3' ? 'G2' : d);
const swA = (a) => (typeof a === 'number' ? Math.PI / 2 - a : a);
const swPt = (p) => (p ? { ...p, x: p.z, z: p.x } : p);
const STRATEGY = { face: 'longitudinal', longitudinal: 'face', zigzag: 'zigzag' };

/** Počítá se v prohozených osách? (karusel + přepínač, ne u operací na ose). */
export function swapsXZ(S) {
  const p = S && S.params;
  if (!p || p.machineStructure !== 'carousel' || p.carouselSwapXZ !== true) return false;
  const partOff = p.partOffZ != null && isFinite(parseFloat(p.partOffZ));
  return !p.threadActive && !p.drillActive && !p.boreActive && !partOff;
}

// ── body (řetěz kontury/polotovaru) ────────────────────────────

/**
 * Reálný řetěz (S.contourPoints, x může být průměr) → prohozený řetěz v ABS
 * poloměru. Pořadí se obrací (orientace, viz hlavička); typ pohybu a rádius
 * patří k úseku DO bodu, proto se posouvají o jedna (jako mirrorPointChain).
 */
export function swapPointsIn(pts, dia) {
  if (!Array.isArray(pts) || pts.length === 0) return [];
  const abs = resolvePointsToAbsolute(pts);
  const n = abs.length;
  const out = [];
  for (let j = 0; j < n; j++) {
    const src = abs[n - 1 - j];
    const mv = j === 0 ? abs[0] : abs[n - j];
    const { xAbs, zAbs, rVal, ...rest } = src;
    out.push({ ...rest, type: mv.type, r: mv.r ?? 0, x: zAbs, z: dia ? xAbs / 2 : xAbs, mode: 'ABS' });
  }
  return out;
}

/** Body výsledku (calc.worldPoints…) z prohozeného světa zpět — involuce pořadí. */
export function swapPointsOut(pts, dia) {
  if (!Array.isArray(pts)) return pts;
  const n = pts.length;
  const out = [];
  for (let j = 0; j < n; j++) {
    const s = pts[n - 1 - j];
    const mv = j === 0 ? pts[0] : pts[n - j];
    const q = { ...s, type: mv.type };
    if ('r' in mv) q.r = mv.r;
    if ('rVal' in mv) q.rVal = mv.rVal;
    if (typeof s.xReal === 'number') { q.xReal = s.zReal; q.zReal = s.xReal; }
    if (typeof s.xAbs === 'number') { q.xAbs = dia ? s.zAbs * 2 : s.zAbs; q.zAbs = s.xAbs; }
    q.x = q.xAbs ?? s.z; q.z = q.zAbs ?? s.x; q.mode = 'ABS';
    out.push(q);
  }
  return out;
}

// ── segmenty ───────────────────────────────────────────────────

function _segRev(seg) {
  const out = { ...seg };
  if (seg.p1 && seg.p2) { out.p1 = swPt(seg.p2); out.p2 = swPt(seg.p1); }
  if (seg.refP1 && seg.refP2) { out.refP1 = swPt(seg.refP2); out.refP2 = swPt(seg.refP1); }
  if (seg.type === 'arc') {
    out.cx = seg.cz; out.cz = seg.cx;
    out.startAngle = swA(seg.endAngle); out.endAngle = swA(seg.startAngle);
  }
  return out;
}

/** Pole s pořadím-konvencí: prohodit a obrátit (smysl oblouku zůstává). */
export function swapSegPath(segs) {
  if (!Array.isArray(segs)) return segs;
  const out = [];
  for (let i = segs.length - 1; i >= 0; i--) out.push(_segRev(segs[i]));
  return out;
}

/** Trace segmenty (x1/z1 → x2/z2, pořadí = čas): prohodit, smysl obrátit. */
export function swapTraceSegs(segs) {
  if (!Array.isArray(segs)) return segs;
  return segs.map(s => {
    const o = { ...s, x1: s.z1, z1: s.x1, x2: s.z2, z2: s.x2 };
    if (s.type === 'arc') Object.assign(o, { cx: s.cz, cz: s.cx, dir: flipDir(s.dir), startAngle: swA(s.startAngle), endAngle: swA(s.endAngle) });
    return o;
  });
}

function _swapGuides(guides) {
  if (!Array.isArray(guides)) return guides;
  const line = (l) => (l ? { ...l, p1: swPt(l.p1), p2: swPt(l.p2) } : l);
  return guides.map(g => ({
    ...g, x1: g.z1, z1: g.x1, x2: g.z2, z2: g.x2,
    via: Array.isArray(g.via) ? g.via.map(swPt) : g.via,
    ...(g.offRough ? { offRough: line(g.offRough) } : {}),
    ...(g.offFinish ? { offFinish: line(g.offFinish) } : {}),
  }));
}

// ── parametry a stav ───────────────────────────────────────────

/** Válcový polotovar (x 0…D/2, z −délka…čelo) jako řetěz bodů odlitku. */
function _cylinderStockPoints(p) {
  const R = (parseFloat(p.stockDiameter) || 0) / 2;
  const zF = parseFloat(p.stockFace) || 0, zL = -(parseFloat(p.stockLength) || 0);
  const dia = p.mode === 'DIAMON';
  const X = (v) => (dia ? v * 2 : v);
  return [
    { id: 1, type: 'G0', x: X(R), z: zL, r: 0, mode: 'ABS' },
    { id: 2, type: 'G1', x: X(R), z: zF, r: 0, mode: 'ABS' },
    { id: 3, type: 'G1', x: 0, z: zF, r: 0, mode: 'ABS' },
  ];
}

/** Parametry prohozeného světa (soustruh, poloměr, prohozené přídavky a bezpečná poloha). */
export function swapParams(p) {
  const dia = p.mode === 'DIAMON';
  const safeXr = (parseFloat(p.safeX) || 0) / (dia ? 2 : 1);
  return {
    ...p,
    machineStructure: 'lathe', mode: 'RADIUS',
    roughingStrategy: STRATEGY[p.roughingStrategy] || 'longitudinal',
    allowanceX: p.allowanceZ, allowanceZ: p.allowanceX,
    safeX: p.safeZ, safeZ: safeXr,
    stockMode: 'casting',
  };
}

/** Stav simulátoru v prohozeném světě (mělká kopie; meze vypnuté). */
export function swapState(S) {
  const p = S.params;
  const dia = p.mode === 'DIAMON';
  const stockSrc = p.stockMode === 'casting' ? S.stockPoints : _cylinderStockPoints(p);
  return {
    ...S,
    params: swapParams(p),
    contourPoints: swapPointsIn(S.contourPoints, dia),
    stockPoints: swapPointsIn(stockSrc, dia),
    borePoints: [],
    guideLines: [],
    opParts: [],
    flipX: S.flipZ, flipZ: S.flipX,
    zLimits: { ...(S.zLimits || {}), chuckActive: false, tailActive: false, rangeActive: false },
    xLimits: { ...(S.xLimits || {}), active: false },
    manualGCode: swapGCodeText(S.manualGCode || '', { toReal: false, dia }),
  };
}

/** Výsledek výpočtu z prohozeného světa zpět do reálného (kreslení simulátoru). */
export function swapCalcOut(calc, dia) {
  const out = { ...calc };
  for (const key of ['worldPoints', 'stockWorldPoints']) if (calc[key]) out[key] = swapPointsOut(calc[key], dia);
  for (const key of ['contourSegments', 'machinableContour', 'offsetPath', 'finishOffsetPath',
    'finishRefPath', 'finishUnreachablePath', 'stockPathSegments', 'interferenceSegments',
    'flankSegments', 'rawContourForProfile', 'partSegments', 'offsetPathNoGuide']) {
    if (calc[key]) out[key] = swapSegPath(calc[key]);
  }
  if (calc.interferenceGuides) out.interferenceGuides = _swapGuides(calc.interferenceGuides);
  // Průchody jsou jen před-emisní náhled (drawToolpath.js, kreslí se bez G-kódu)
  // ve tvaru konkrétní strategie — reálná dráha je ze simPath prohozeného G-kódu.
  out.passes = [];
  out.sectionPlan = null;
  out.rangeEndZ = null;
  const xs = (out.stockWorldPoints || []).map(q => q.xReal).filter(Number.isFinite);
  if (xs.length) out.stockTopX = Math.max(...xs);
  return out;
}

// ── G-kód ──────────────────────────────────────────────────────

const _num = (v) => {
  const s = (Math.round(v * 1000) / 1000).toFixed(3);
  return s === '-0.000' ? '0.000' : s;
};

/** Kódová část řádku (mimo komentáře `;…` a `(…)`): X ↔ Z, U ↔ W, G2 ↔ G3. */
function _swapCode(code, toReal, dia) {
  const scaleZtoX = toReal && dia ? 2 : 1;    // prohozené Z' (= skutečné X poloměrem) → X průměrem
  const scaleXtoZ = !toReal && dia ? 0.5 : 1;
  return code
    .replace(/\b([XZUW])(=?)([+-]?\d*\.?\d+)/g, (m, ax, eq, v) => {
      const val = parseFloat(v);
      if (ax === 'Z' || ax === 'W') {
        const k = scaleZtoX;
        return `${ax === 'Z' ? 'X' : 'U'}${eq}${k === 1 ? v : _num(val * k)}`;
      }
      const k = scaleXtoZ;
      return `${ax === 'X' ? 'Z' : 'W'}${eq}${k === 1 ? v : _num(val * k)}`;
    })
    .replace(/\bG0?([23])(?!\d)/g, (m, d) => m.replace(d, d === '2' ? '3' : '2'));
}

/**
 * Prohodí osy v textu programu. `toReal` = z prohozeného světa do reálného
 * (u průměrového zápisu se skutečné X násobí 2 a hlavička DIAMOF → DIAMON).
 */
export function swapGCodeText(text, { toReal = true, dia = false } = {}) {
  if (!text) return text;
  return text.split('\n').map(line => {
    // Komentář s pohybem („; G1 X… Z…" v bloku KONTURA pro referenci) i
    // hlavička hrubování: v prohozeném světě podélné = ve skutečnosti čelní.
    const ref = line.match(/^(\s*;\s*|\s*\(\s*)(G0?[0-3]\b.*?)(\)?\s*)$/);
    if (ref) return ref[1] + _swapCode(ref[2], toReal, dia) + ref[3];
    if (/HRUBOVANI \(/.test(line)) {
      return line.replace(/HRUBOVANI \(([^)]*)\)/, (m, lab) => `HRUBOVANI (${lab.replace(/^PODELNE/, '§').replace(/^CELNI/, 'PODELNE').replace('§', 'CELNI')}, OSY X-Z PROHOZENE)`);
    }
    let out = '', i = 0, code = '';
    const flush = () => { out += _swapCode(code, toReal, dia); code = ''; };
    while (i < line.length) {
      const ch = line[i];
      if (ch === ';') { flush(); out += line.slice(i); i = line.length; break; }
      if (ch === '(' || ch === '"') {   // komentář Fanuc/Heidenhain, název nástroje T="…"
        flush();
        const j = line.indexOf(ch === '(' ? ')' : '"', i + 1);
        const end = j < 0 ? line.length : j + 1;
        out += line.slice(i, end); i = end; continue;
      }
      code += ch; i++;
    }
    flush();
    if (toReal && dia) {
      out = out.replace(/\bDIAMOF\b/, 'DIAMON').replace('Programování poloměru', 'Programování průměru')
        .replace(/POZOR: X = POLOMĚR, řízení musí být v radiálním režimu, [^)]*?(?=\)|$)/, 'X = PRŮMĚR, diametrální zápis');
    }
    return out;
  }).join('\n');
}

const SWAP_NOTE = 'Karusel - hrubování po X v prohozených osách, nůž svisle ze smykadla';

/**
 * Hotový `calc` z prohozeného světa → reálný. `simOf(S)` = computeSimPath
 * (dráha z reálného G-kódu); prohozený svět se schová do `calc._xz` pro emisi.
 */
export function finishSwappedCalc(S, S2, calc2, lightOnly, simOf) {
  const out = swapCalcOut(calc2, S.params.mode === 'DIAMON');
  const zl = S.zLimits || {}, xl = S.xLimits || {};
  S.errors = [...(S2.errors || [])];
  if (zl.chuckActive || zl.tailActive || zl.rangeActive || xl.active) {
    S.errors.push({ type: 'warning', msg: 'Karusel v prohozených osách: meze čelistí/koníku a rozsahy 📐 se zatím neuplatní.' });
  }
  // Bezpečná poloha uvnitř obrysu polotovaru: program by do ní na konci
  // sjel přes díl (na karuselu typicky Z pod vrchem dílu).
  const sp = out.stockWorldPoints || [];
  const sx = (parseFloat(S.params.safeX) || 0) / (S.params.mode === 'DIAMON' ? 2 : 1), sz = parseFloat(S.params.safeZ) || 0;
  if (sp.length && sx < Math.max(...sp.map(q => q.xReal)) && sz < Math.max(...sp.map(q => q.zReal))) {
    S.errors.push({ type: 'warning', msg: `Bezpečná poloha X${S.params.safeX} Z${S.params.safeZ} leží v obrysu polotovaru — nastavte Z nad díl (nebo X za polotovar), jinak program na konci sjede přes díl.` });
  }
  if (!lightOnly) Object.assign(out, simOf(S));
  Object.defineProperty(out, '_xz', { value: { S: S2, calc: calc2 }, enumerable: false });
  return out;
}

/**
 * G-kód: vygenerovat v prohozeném světě a prohodit zpět. `emit(S2, calc2)` =
 * generateAutoGCode, `calcOf(S2)` = computeCalculation (když `calc._xz` chybí).
 * @returns {{text:string, simIdx:(number|null)}[]}
 */
export function emitSwapped(S, calc, emit, calcOf, cmt) {
  const xz = (calc && calc._xz) || (() => { const S2 = swapState(S); return { S: S2, calc: calcOf(S2) }; })();
  const lines = emit(xz.S, xz.calc);
  S.genNotes = xz.S.genNotes || [];
  const dia = S.params.mode === 'DIAMON';
  const out = lines.map(l => ({ ...l, text: swapGCodeText(l.text, { toReal: true, dia }) }));
  const at = out.findIndex(l => !/^\s*[;(]/.test(l.text));
  out.splice(at < 0 ? 0 : at, 0, { text: cmt(SWAP_NOTE), simIdx: null });
  return out;
}
