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
export const LIVE_MCODE_DEFAULTS = {
  sinumerik: { cOn: 'M70', cOff: 'M5', toolOn: 'M2=3', toolOff: 'M2=5', toolS: 'S2' },
  fanuc: { cOn: 'M45', cOff: 'M46', toolOn: 'M13', toolOff: 'M15', toolS: 'S' },
  heidenhain: { cOn: 'M45', cOff: 'M46', toolOn: 'M13', toolOff: 'M15', toolS: 'S' },
};

export function liveSettings(prms) {
  const ctrl = prms.controlSystem || 'sinumerik';
  const s = prms.live || {};
  return {
    mode: LIVE_MODES[s.mode] ? s.mode : 'spos',
    cycles: s.cycles !== false,
    m: { ...LIVE_MCODE_DEFAULTS[ctrl] || LIVE_MCODE_DEFAULTS.sinumerik, ...(s.m && s.m[ctrl]) },
  };
}

const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };

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
    xTop: outerD,             // Ø pláště (radiální díry)
    zPos: faceZ - 10,         // výška radiálních děr (vzor rozteč)
    holeD: kind === 'mill' ? 20 : 8,
    depth: 10,
    peck: kind === 'mill' ? 0 : 3,   // vrtání: krok (0 = na jeden záběr)
    dwell: 0,
    safe: 2, retract: 5,
    millType: 'pocket',       // 'pocket' (kruhová kapsa na pozicích) | 'slot'
    toolD: kind === 'mill' ? 10 : 8,
    stepDown: 2,
    slot: { x1: -pcd / 4, y1: 0, x2: pcd / 4, y2: 0 },
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
    'dwell', 'safe', 'retract', 'toolD', 'stepDown', 'toolNo', 'rpm', 'feed']) o[k] = num(o[k], d[k]);
  o.count = Math.max(1, Math.min(360, Math.round(o.count)));
  o.slot = { ...d.slot, ...(o.slot || {}) };
  for (const k of ['x1', 'y1', 'x2', 'y2']) o.slot[k] = num(o.slot[k], 0);
  if (o.kind === 'mill') o.side = 'face';   // frézování pláště (TRACYL) zatím není
  return o;
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
    if (op.pattern === 'points') return parsePointList(op.points).map(p => ({ a: norm(p.a), z: p.v }));
    const step = 360 / op.count;
    return Array.from({ length: op.count }, (_, i) => ({ a: norm(op.startAngle + i * step), z: op.zPos }));
  }
  const raw = op.pattern === 'points'
    ? parsePointList(op.points).map(p => ({ a: p.a, r: Math.abs(p.v) }))
    : Array.from({ length: op.count }, (_, i) => ({ a: op.startAngle + i * 360 / op.count, r: op.pcd / 2 }));
  return raw.map(p => {
    const a = norm(p.a), rad = a * Math.PI / 180;
    return { a, r: p.r, x: p.r * Math.cos(rad), y: p.r * Math.sin(rad) };
  });
}

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
  const zTop = op.zTop, rtp = zTop + op.retract, sdis = zTop + op.safe;
  const levels = depthLevels(op.depth, op.stepDown);
  const tr = op.toolD / 2;
  if (op.millType === 'slot') {
    const { x1, y1, x2, y2 } = op.slot;
    moves.push({ k: 'rapid', x: x1, y: y1, z: rtp }, { k: 'rapid', x: x1, y: y1, z: sdis });
    let atStart = true;
    levels.forEach(d => {
      const p = atStart ? { x: x1, y: y1 } : { x: x2, y: y2 };
      const q = atStart ? { x: x2, y: y2 } : { x: x1, y: y1 };
      moves.push({ k: 'lin', x: p.x, y: p.y, z: zTop - d, plunge: true });
      moves.push({ k: 'lin', x: q.x, y: q.y, z: zTop - d });
      atStart = !atStart;
    });
    const last = moves[moves.length - 1];
    moves.push({ k: 'rapid', x: last.x, y: last.y, z: rtp });
    return moves;
  }
  const rMax = op.holeD / 2 - tr;
  const step = Math.max(0.1, op.toolD * 0.5);
  livePositions(op).forEach(c => {
    moves.push({ k: 'rapid', x: c.x, y: c.y, z: rtp }, { k: 'rapid', x: c.x, y: c.y, z: sdis });
    levels.forEach(d => {
      const z = zTop - d;
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

/** Kontrola zadání — pole českých hlášek (prázdné = v pořádku). */
export function liveOpProblems(op) {
  const out = [];
  if (!(op.depth > 0)) out.push('Hloubka musí být větší než 0.');
  if (op.kind === 'drill' && !(op.holeD > 0)) out.push('Zadejte Ø díry.');
  if (op.kind === 'mill') {
    if (!(op.toolD > 0)) out.push('Zadejte Ø frézy.');
    if (op.millType === 'pocket' && op.holeD < op.toolD) out.push('Kapsa je menší než fréza.');
    if (!(op.stepDown > 0)) out.push('Zadejte krok do hloubky.');
  }
  if (op.pattern === 'points' && op.millType !== 'slot' && parsePointList(op.points).length === 0)
    out.push('Seznam bodů je prázdný (řádek = „úhel; poloměr").');
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
    if (op.millType === 'slot') return `Drážka š. ${op.toolD} hl. ${op.depth}`;
    return `Kapsa Ø${op.holeD} hl. ${op.depth} – ${pos}`;
  }
  return `${op.side === 'radial' ? 'Radiálně' : 'Čelo'} Ø${op.holeD} hl. ${op.depth} – ${pos}`;
}
