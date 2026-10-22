// Datový model operací POHÁNĚNÝMI NÁSTROJI (vrtání a frézování na čele /
// radiální vrtání do pláště). Čistý modul bez DOM — čte ho NC výstup
// (liveGcode.js), pohled na čelo (liveFaceView.js) i řez (liveSection.js).
//
// Uložení: `S.params.liveOps` (pole operací) a `S.params.live` (nastavení
// výstupu). Klíče `live*` jsou z otisku vstupů drah vyňaté (gcodeSync.js) —
// úprava děr NESMÍ přepočítávat soustružnické dráhy.
//
// Souřadnice na čele: úhel `a` = poloha osy C / SPOS ve stupních (0° = směr
// +X, kde stojí nástroj), `r` = poloměr od osy. Kartézsky (TRANSMIT):
// x = r·cos a, y = r·sin a. Radiální díra: úhel `a` + výška `z`.

export const LIVE_MODES = {
  spos: 'SPOS – natočení vřetena',
  caxis: 'Osa C',
  transmit: 'TRANSMIT / polární interpolace',
};

// M-kódy osy C a poháněného nástroje se liší stroj od stroje — výchozí
// hodnoty jsou jen příklad, uživatel je přepíše v nastavení bloku.
//   Sinumerik: M70 = vřeteno do osy (standardní M-funkce Siemens), SPCOF =
//     zpět do otáčkového režimu; poháněný nástroj = vřeteno č. `spindle`
//     (M<n>=3 / M<n>=5, S<n>=…) — viz liveSettings.
//   Fanuc: M-kódy osy C a poháněného nástroje stanovuje výrobce stroje (žádný
//     není společný) — výchozí jsou jen příklad.
//   Heidenhain: poháněný nástroj M3 / M5 (standard TNC); přepnutí na osu C
//     řeší stroj (FUNCTION MODE) — M45 / M46 je jen zástupný příklad.
export const LIVE_MCODE_DEFAULTS = {
  sinumerik: { cOn: 'M70', cOff: 'SPCOF', toolOn: 'M2=3', toolOff: 'M2=5', toolS: 'S2' },
  fanuc: { cOn: 'M45', cOff: 'M46', toolOn: 'M13', toolOff: 'M15', toolS: 'S' },
  heidenhain: { cOn: 'M45', cOff: 'M46', toolOn: 'M3', toolOff: 'M5', toolS: 'S' },
};

/**
 * Nastavení výstupu (`S.params.live`):
 *   mode, cycles; spindle = číslo vřetena poháněného nástroje (Sinumerik),
 *   cName = jméno osy C v programu (C, C1, C2…), angleDir (+1 / −1) a
 *   angleOffset [°] = kalibrace úhlu stroje: úhel v NC = offset + směr ·
 *   (úhel z výkresu − toolAt); toolAt [°] = kde v pohledu na čelo stojí
 *   poháněný nástroj (k němu se díra natáčí): soustruh NAHOŘE (90°, X+ jako
 *   v nárysu / řezu — revolver nad osou, uživatel 20. 10. 2026), karusel
 *   vpravo (0°); m = přepsané M-kódy podle řídicího systému.
 */
export function liveSettings(prms) {
  const ctrl = prms.controlSystem || 'sinumerik';
  const s = prms.live || {};
  const spindle = Math.min(9, Math.max(1, Math.round(num(s.spindle, 2))));
  const base = { ...(LIVE_MCODE_DEFAULTS[ctrl] || LIVE_MCODE_DEFAULTS.sinumerik) };
  if (ctrl === 'sinumerik') Object.assign(base, { toolOn: `M${spindle}=3`, toolOff: `M${spindle}=5`, toolS: `S${spindle}` });
  // Prázdné pole = výchozí hodnota (jinak by se do programu vydal prázdný řádek).
  const over = {};
  Object.entries((s.m && s.m[ctrl]) || {}).forEach(([k, v]) => { if (String(v).trim()) over[k] = String(v).trim(); });
  return {
    mode: LIVE_MODES[s.mode] ? s.mode : 'spos',
    cycles: s.cycles !== false,
    spindle,
    cName: String(s.cName || 'C').replace(/[^A-Za-z0-9_]/g, '').slice(0, 6) || 'C',
    angleDir: Number(s.angleDir) < 0 ? -1 : 1,
    angleOffset: num(s.angleOffset, 0),
    toolAt: TOOL_AT.includes(Number(s.toolAt)) ? Number(s.toolAt) : (prms.machineStructure === 'carousel' ? 0 : 90),
    m: { ...base, ...over },
  };
}

const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
/** Možné polohy poháněného nástroje v pohledu na čelo [°]. */
export const TOOL_AT = [90, 0, 270, 180];

/** Nová operace s rozumnými výchozími hodnotami podle dílu. */
export function newLiveOp(kind, geo, n) {
  const faceZ = geo ? geo.faceZ : 0;
  const outerD = geo ? geo.outerD : 100;
  const pcd = Math.round(outerD * 0.6);
  return {
    id: 'L' + Date.now().toString(36) + Math.floor(Math.random() * 1e4),
    name: kind === 'mill' ? `Frézování ${n}` : `Vrtání ${n}`,
    kind,                     // 'drill' | 'mill'
    side: 'face',             // 'face' (axiálně do čela) | 'radial' (do pláště)
    pattern: 'pcd',           // 'pcd' (roztečná kružnice) | 'points'
    pcd, count: 4, startAngle: 0,
    points: '0; ' + (pcd / 2), // řádky „úhel; poloměr" (čelo) / „úhel; Z" (plášť)
    zTop: faceZ,              // Z čela (axiální díry)
    faceDir: 1,               // čelo: 1 = zprava (nástroj z +Z, vrtá k −Z), −1 = zleva
    xTop: outerD,             // Ø pláště (radiální díry)
    zPos: faceZ - 10,         // výška radiálních děr (vzor rozteč)
    holeD: kind === 'mill' ? 20 : 8,
    depth: 10,
    peck: kind === 'mill' ? 0 : 3,   // vrtání: krok (0 = na jeden záběr)
    // Tříska mezi záběry: 'clear' = vyjetí z díry (odvod), 'break' = jen
    // odskok o chipBack mm (lámání) — jako záložka Vrtání (drillChipMode).
    chipMode: 'clear', chipBack: 1,
    dwell: 0,
    safe: 2, retract: 5,
    millType: 'pocket',       // 'pocket' (kruhová kapsa na pozicích) | 'slot' | 'keyway'
    // Drážka pro pero v plášti (millType 'keyway', side 'radial'): kus stojí
    // na úhlu C, fréza (Ø = šířka) zanoří v X a jede v Z mezi konci drážky
    // kz1…kz2 (vnější rozměr vč. zaoblení, uživatel 22. 10. 2026).
    kz1: faceZ - 40, kz2: faceZ - 10,
    toolD: kind === 'mill' ? 10 : 8,
    stepDown: 2,
    slot: { x1: -pcd / 4, y1: 0, x2: pcd / 4, y2: 0 },
    // Šířka drážky na čele (osa slot.x1…x2); chybí = Ø frézy (jeden průjezd).
    // Širší než fréza → víc průjezdů kolem osy (millMoves, uživatel 22. 10. 2026).
    slotW: null,
    toolName: kind === 'mill' ? 'FREZA_D10' : 'VRTAK_D8',
    toolNo: kind === 'mill' ? 6 : 5,
    rpm: kind === 'mill' ? 3000 : 2000,
    feed: kind === 'mill' ? 300 : 120,   // mm/min
  };
}

/** Doplní chybějící pole (starší / ručně upravené uložení). */
export function normalizeLiveOp(op) {
  const d = newLiveOp(op && op.kind === 'mill' ? 'mill' : 'drill');
  const o = { ...d, ...(op || {}) };
  for (const k of ['pcd', 'count', 'startAngle', 'zTop', 'xTop', 'zPos', 'holeD', 'depth', 'peck',
    'dwell', 'safe', 'retract', 'toolD', 'stepDown', 'toolNo', 'rpm', 'feed', 'faceDir', 'chipBack', 'kz1', 'kz2']) o[k] = num(o[k], d[k]);
  o.faceDir = o.faceDir < 0 ? -1 : 1;
  o.chipMode = o.chipMode === 'break' ? 'break' : 'clear';
  o.count = Math.max(1, Math.min(360, Math.round(o.count)));
  o.slot = { ...d.slot, ...(o.slot || {}) };
  o.slotW = Number.isFinite(+o.slotW) && +o.slotW > 0 && o.slotW !== '' && o.slotW !== null ? +o.slotW : null;
  for (const k of ['x1', 'y1', 'x2', 'y2']) o.slot[k] = num(o.slot[k], 0);
  if (o.kind === 'mill' && o.millType === 'keyway') {
    o.side = 'radial';
    o.holeD = o.toolD;   // šířka drážky = Ø frézy (kreslení řezu / pohledu jako radiální díra)
  } else if (o.kind === 'mill') o.side = 'face';   // obecné frézování pláště (TRACYL) zatím není
  return o;
}

/**
 * Vrtá se tahle operace? Výběr děr (klepnutí v pohledu na čelo, zaškrtávátko
 * v záložce Vrtání) vypíná celé skupiny — `enabled: false`; chybí = ano.
 */
export const liveOpOn = op => !!op && op.enabled !== false;

/**
 * Vrtá operace Vrtání (záložka, nástroj vrták) DÍRY Z VÝKRESU poháněným
 * nástrojem místo díry v ose? Ano, když jsou vybrané operace poháněných
 * nástrojů a uživatel nepřepnul na „V ose" (`drillSource: 'axis'`).
 */
export function liveDrillFromCad(prms) {
  return !!prms && prms.drillSource !== 'axis' && getLiveOps(prms).some(liveOpOn);
}

export function getLiveOps(prms) {
  return Array.isArray(prms.liveOps) ? prms.liveOps.map(normalizeLiveOp) : [];
}

/** Řádky „úhel; hodnota" → [{ a, v }]. Oddělovač ; , mezera nebo tab. */
export function parsePointList(text) {
  const out = [];
  String(text || '').split(/\n/).forEach(line => {
    const p = line.trim().split(/\s*[;\t]\s*|\s+/).filter(Boolean).map(s => parseFloat(s.replace(',', '.')));
    if (p.length >= 2 && p.every(Number.isFinite)) out.push({ a: p[0], v: p[1] });
  });
  return out;
}

/**
 * Pozice operace. Čelo: [{ a, r, x, y }], plášť: [{ a, z }].
 * Úhly normalizované do <0, 360).
 */
export function livePositions(op) {
  const norm = a => ((a % 360) + 360) % 360;
  if (op.side === 'radial') {
    // Drážka pro pero: poloha = úhel C, Z = střed drážky (dráhu dává keywaySpan).
    const kw = isKeyway(op) ? (op.kz1 + op.kz2) / 2 : null;
    if (op.pattern === 'points') return parsePointList(op.points).map(p => ({ a: norm(p.a), z: kw ?? p.v }));
    const step = 360 / op.count;
    return Array.from({ length: op.count }, (_, i) => ({ a: norm(op.startAngle + i * step), z: kw ?? op.zPos }));
  }
  const raw = op.pattern === 'points'
    ? parsePointList(op.points).map(p => ({ a: p.a, r: Math.abs(p.v) }))
    : Array.from({ length: op.count }, (_, i) => ({ a: op.startAngle + i * 360 / op.count, r: op.pcd / 2 }));
  return raw.map(p => {
    const a = norm(p.a), rad = a * Math.PI / 180;
    return { a, r: p.r, x: p.r * Math.cos(rad), y: p.r * Math.sin(rad) };
  });
}

/**
 * Strana nástroje na čele: +1 = čelo zprava (nástroj stojí v +Z, odjezd do +Z,
 * hloubka do −Z), −1 = čelo zleva (opačně). Osazení uprostřed profilu může
 * hledět kterýmkoli směrem (bokorys v CAD, js/faceView/).
 */
export function faceOut(op) { return op.faceDir === -1 ? -1 : 1; }

/** Hloubkové hladiny od čela dolů (krok `step`, poslední = plná hloubka). */
export function depthLevels(depth, step) {
  if (!(step > 0) || step >= depth) return [depth];
  const out = [];
  for (let d = step; d < depth - 1e-6; d += step) out.push(+d.toFixed(4));
  out.push(depth);
  return out;
}

/**
 * Dráha frézy na čele jako abstraktní pohyby (střed nástroje, kartézsky):
 *   { k: 'rapid'|'lin', x, y, z }   { k: 'arc', x, y, z, cx, cy, ccw }
 * Kruh je rozdělený na dva půloblouky (CR=/R neumí celý kruh).
 */
export function millMoves(op) {
  const moves = [];
  const out = faceOut(op);
  const zTop = op.zTop, rtp = zTop + out * op.retract, sdis = zTop + out * op.safe;
  const levels = depthLevels(op.depth, op.stepDown);
  const tr = op.toolD / 2;
  if (op.millType === 'slot') {
    const { x1, y1, x2, y2 } = op.slot;
    const ext = Math.max(0, slotWidth(op) / 2 - tr);   // o kolik je drážka širší než fréza (na stranu)
    moves.push({ k: 'rapid', x: x1, y: y1, z: rtp }, { k: 'rapid', x: x1, y: y1, z: sdis });
    if (ext <= 1e-6) {
      // Šířka = Ø frézy: jeden průjezd po ose, vrstvy tam a zpět.
      let atStart = true;
      levels.forEach(d => {
        const p = atStart ? { x: x1, y: y1 } : { x: x2, y: y2 };
        const q = atStart ? { x: x2, y: y2 } : { x: x1, y: y1 };
        moves.push({ k: 'lin', x: p.x, y: p.y, z: zTop - out * d, plunge: true });
        moves.push({ k: 'lin', x: q.x, y: q.y, z: zTop - out * d });
        atStart = !atStart;
      });
    } else {
      // Širší drážka: v každé vrstvě zanořit na ose u začátku, projet osu
      // a pak „závodní dráhy" kolem osy s odsazením po ≤ ½ Ø frézy až na
      // okraj (konce drážky = oblouky kolem konců osy, proti směru hodin).
      const L = Math.hypot(x2 - x1, y2 - y1);
      const ux = L > 1e-9 ? (x2 - x1) / L : 1, uy = L > 1e-9 ? (y2 - y1) / L : 0;
      const rx = uy, ry = -ux;   // vpravo od osy
      const offs = [];
      const step = Math.max(0.1, op.toolD * 0.5);
      for (let o = step; o < ext - 1e-6; o += step) offs.push(o);
      offs.push(ext);
      levels.forEach(d => {
        const z = zTop - out * d;
        moves.push({ k: 'lin', x: x1, y: y1, z, plunge: true });
        moves.push({ k: 'lin', x: x2, y: y2, z });
        offs.forEach(o => {
          moves.push({ k: 'lin', x: x2 + rx * o, y: y2 + ry * o, z });
          moves.push({ k: 'arc', x: x2 - rx * o, y: y2 - ry * o, z, cx: x2, cy: y2, ccw: true });
          moves.push({ k: 'lin', x: x1 - rx * o, y: y1 - ry * o, z });
          moves.push({ k: 'arc', x: x1 + rx * o, y: y1 + ry * o, z, cx: x1, cy: y1, ccw: true });
          moves.push({ k: 'lin', x: x2 + rx * o, y: y2 + ry * o, z });
        });
        moves.push({ k: 'lin', x: x1, y: y1, z });   // zpět na osu k dalšímu zanoření (uvnitř drážky)
      });
    }
    const last = moves[moves.length - 1];
    moves.push({ k: 'rapid', x: last.x, y: last.y, z: rtp });
    return moves;
  }
  const rMax = op.holeD / 2 - tr;
  const step = Math.max(0.1, op.toolD * 0.5);
  livePositions(op).forEach(c => {
    moves.push({ k: 'rapid', x: c.x, y: c.y, z: rtp }, { k: 'rapid', x: c.x, y: c.y, z: sdis });
    levels.forEach(d => {
      const z = zTop - out * d;
      moves.push({ k: 'lin', x: c.x, y: c.y, z, plunge: true });
      if (rMax <= 1e-6) return;
      const rings = [];
      for (let r = Math.min(step, rMax); r < rMax - 1e-6; r += step) rings.push(r);
      rings.push(rMax);
      rings.forEach(r => {
        moves.push({ k: 'lin', x: c.x + r, y: c.y, z });
        moves.push({ k: 'arc', x: c.x - r, y: c.y, z, cx: c.x, cy: c.y, ccw: true });
        moves.push({ k: 'arc', x: c.x + r, y: c.y, z, cx: c.x, cy: c.y, ccw: true });
      });
      moves.push({ k: 'lin', x: c.x, y: c.y, z });
    });
    moves.push({ k: 'rapid', x: c.x, y: c.y, z: rtp });
  });
  return moves;
}

/** Šířka drážky na čele (chybí = Ø frézy). */
export function slotWidth(op) {
  return op.slotW > 0 ? op.slotW : op.toolD;
}

/** Je operace drážka pro pero v plášti? */
export function isKeyway(op) {
  return !!op && op.kind === 'mill' && op.millType === 'keyway';
}

/**
 * Drážka pro pero podél osy Z: vnější rozsah zMin…zMax (vč. zaoblení konců
 * frézou) a dráha středu frézy za…zb (= konce − poloměr frézy). za > zb =
 * drážka kratší než fréza.
 */
export function keywaySpan(op) {
  const zMin = Math.min(op.kz1, op.kz2), zMax = Math.max(op.kz1, op.kz2), r = op.toolD / 2;
  return { zMin, zMax, za: zMax - r, zb: zMin + r };
}

/** Kontrola zadání — pole českých hlášek (prázdné = v pořádku). */
export function liveOpProblems(op) {
  const out = [];
  if (!(op.depth > 0)) out.push('Hloubka musí být větší než 0.');
  if (op.kind === 'drill' && !(op.holeD > 0)) out.push('Zadejte Ø díry.');
  if (op.kind === 'drill' && op.chipMode === 'break' && op.peck > 0 && !(op.chipBack > 0)) out.push('Odskok pro lámání třísky musí být větší než 0.');
  if (op.kind === 'mill') {
    if (!(op.toolD > 0)) out.push('Zadejte Ø frézy.');
    if (op.millType === 'pocket' && op.holeD < op.toolD) out.push('Kapsa je menší než fréza.');
    if (op.millType === 'slot' && slotWidth(op) < op.toolD - 1e-9) out.push('Fréza je širší než drážka.');
    if (!(op.stepDown > 0)) out.push('Zadejte krok do hloubky.');
  }
  if (op.pattern === 'points' && op.millType !== 'slot' && parsePointList(op.points).length === 0)
    out.push('Seznam bodů je prázdný (řádek = „úhel; poloměr").');
  if (isKeyway(op)) {
    const k = keywaySpan(op);
    if (k.za < k.zb - 1e-9) out.push('Drážka je kratší než Ø frézy (šířka).');
    if (op.depth > op.xTop / 2) out.push('Drážka je hlubší než poloměr pláště.');
  }
  if (!(op.rpm > 0) || !(op.feed > 0)) out.push('Zadejte otáčky a posuv.');
  // Rovina R (bezpečná vzdálenost) musí ležet mezi plochou a odjezdem.
  if (!(op.safe >= 0) || !(op.retract >= op.safe)) out.push('Odjezd musí být ≥ bezpečná vzdálenost ≥ 0.');
  if (op.kind === 'drill' && op.side === 'radial' && op.depth > op.xTop / 2)
    out.push('Radiální díra je hlubší než poloměr pláště (vrták by přejel osu).');
  return out;
}

const czCount = (n, one, few, many) => `${n} ${n === 1 ? one : (n >= 2 && n <= 4 ? few : many)}`;

/** Krátký popis operace do seznamu / komentáře v NC. */
export function liveOpSummary(op) {
  const pos = op.pattern === 'pcd'
    ? (op.side === 'radial' ? `${op.count}× po obvodu, Z${op.zPos}` : `rozteč Ø${op.pcd}, ${op.count}×`)
    : czCount(livePositions(op).length, 'bod', 'body', 'bodů');
  if (op.kind === 'mill') {
    if (op.millType === 'slot') return `Drážka š. ${+slotWidth(op).toFixed(3)} hl. ${op.depth}${slotWidth(op) > op.toolD + 1e-9 ? ` (fréza Ø${op.toolD})` : ''}`;
    if (op.millType === 'keyway') {
      const k = keywaySpan(op);
      return `Pero š. ${op.toolD} hl. ${op.depth} · Z${+k.zMax.toFixed(3)}…${+k.zMin.toFixed(3)} – ${op.pattern === 'pcd' ? `${op.count}× po obvodu` : pos}`;
    }
    return `Kapsa Ø${op.holeD} hl. ${op.depth} – ${pos}`;
  }
  const face = op.faceDir === -1 ? 'Čelo zleva' : 'Čelo';
  const chip = op.peck > 0 && op.peck < op.depth && op.chipMode === 'break' ? ', lámání třísky' : '';
  return `${op.side === 'radial' ? 'Radiálně' : face} Ø${op.holeD} hl. ${op.depth}${chip} – ${pos}`;
}
