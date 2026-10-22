// NC blok POHÁNĚNÝCH NÁSTROJŮ — vrtání (čelo / plášť) a frézování na čele.
//
// Režimy výstupu (přepínač v panelu, `S.params.live.mode`):
//   spos      natočení vřetena SPOS=úhel (Fanuc/Heidenhain: polohování osy C),
//             díra se vrtá v poloze, kde stojí nástroj (+X);
//   caxis     vřeteno přepnuté na osu C (M-kód dle stroje), C = úhel;
//   transmit  kartézské X/Y na čele: Sinumerik TRANSMIT, Fanuc G12.1.
// Frézování kapsy/drážky mimo osu potřebuje interpolaci osy C: v režimu
// TRANSMIT jde jako G1/G3 v X/Y, jinak se dráha rozloží na krátké G1 v X + C
// (polární souřadnice). Radiální vrtání TRANSMIT nepotřebuje → jede přes C.
// Heidenhain ISO: vždy rozepsané pohyby v X/Z + C (bez cyklů).
//
// M-kódy osy C a poháněného nástroje jsou strojní — bere se je z nastavení
// (`liveSettings().m`), výchozí hodnoty jsou jen příklad (viz liveModel.js).
import { LIVE_BEGIN, LIVE_END } from './liveMarkers.js';
import { getLiveOps, liveOpOn, liveSettings, livePositions, depthLevels, millMoves, liveOpSummary, liveOpProblems, faceOut, isKeyway, keywaySpan } from './liveModel.js';

const f3 = v => String(+(+v).toFixed(3));
const pad2 = n => String(Math.max(0, Math.round(n))).padStart(2, '0');
const norm360 = a => ((a % 360) + 360) % 360;
const safeText = t => String(t).replace(/\(/g, '[').replace(/\)/g, ']').replace(/[;\r\n]/g, ' ');

/**
 * Úhel na stroji z úhlu z výkresu: offset + směr · (úhel − toolAt) — díra na
 * úhlu toolAt (u soustruhu nahoře, kde stojí poháněný nástroj) je při C0 pod
 * nástrojem; kalibrace osy C (nula, smysl otáčení) jsou strojní údaje, viz
 * liveSettings.
 */
const angOf = (set, a) => norm360(set.angleOffset + set.angleDir * (a - set.toolAt));
/** Totéž pro kartézský bod (TRANSMIT / G12.1): otočení o offset, při směru −1 zrcadlení v Y. */
function xyOf(set, x, y) {
  const r = Math.hypot(x, y);
  if (r < 1e-9) return { x: 0, y: 0 };
  const t = angOf(set, Math.atan2(y, x) * 180 / Math.PI) * Math.PI / 180;
  return { x: r * Math.cos(t), y: r * Math.sin(t) };
}

/**
 * @param prms S.params (controlSystem, mode DIAMON/DIAMOF, safeX/safeZ, liveOps, live)
 * @returns {string[]} řádky bloku včetně značek; prázdné pole, když nejsou operace
 */
export function buildLiveBlock(prms) {
  const ops = getLiveOps(prms).filter(liveOpOn);   // nevybrané skupiny děr se nevrtají
  if (!ops.length) return [];
  const ctrl = ['fanuc', 'heidenhain'].includes(prms.controlSystem) ? prms.controlSystem : 'sinumerik';
  const set = liveSettings(prms);
  // Text od uživatele (název operace / nástroje) nesmí komentář ukončit:
  // Fanuc ho vymezuje závorkami — vnořená `)` by zbytek řádku poslala do kódu.
  const cmt = t => ctrl === 'fanuc' ? `( ${safeText(t)} )` : `; ${safeText(t)}`;
  const note = t => ` ${cmt(t)}`;
  const dia = prms.mode === 'DIAMON';
  const xo = r => f3(dia ? 2 * r : r);          // X ve zápisu programu (Ø / poloměr)
  const m = set.m;
  const sWord = rpm => /\d$/.test(m.toolS) ? `${m.toolS}=${rpm}` : `${m.toolS}${rpm}`;
  const L = [];
  const add = s => L.push(s);
  // Nejdřív radiálně ven, pak v Z (jako ops/drill.js): šikmý G0 X Z naráz by
  // od čela zleva (nástroj vlevo, bezpečná poloha vpravo) vedl skrz díl.
  const safe = () => { add(`G0 X${prms.safeX}`); add(`G0 Z${prms.safeZ}`); };

  add(cmt(`${LIVE_BEGIN} [${ctrl}/${set.mode}] generuje Pohled na čelo, ručně neupravovat`));
  add(cmt(`Nástroj v revolveru na ${set.toolAt} st. pohledu na čelo – díra se k němu natočí osou C`));
  if (set.angleDir < 0 || Math.abs(set.angleOffset) > 1e-9)
    add(cmt(`Kalibrace úhlu: směr ${set.angleDir < 0 ? '−' : '+'}, nula ${f3(set.angleOffset)} st.`));
  safe();
  add(`M5${note('stop hlavního vřetena')}`);

  ops.forEach((op, i) => {
    // Chybné zadání (záporná hloubka, kapsa menší než fréza…) se do NC NEPÍŠE:
    // vrták se zápornou hloubkou by jel z díry ven, rovnou proti čelu.
    const probs = liveOpProblems(op);
    if (probs.length) { add(cmt(`[${i + 1}] ${op.name}: VYNECHÁNO – ${probs.join(' ')}`)); return; }
    // Ne „; ---": tak začíná dělicí řádek hlavičky, podle kterého spojování
    // částí programu (gcodeMerge.splitHeaderBody) dělí hlavičku od těla.
    add(cmt(`[${i + 1}] ${op.name}: ${liveOpSummary(op)}`));
    if (ctrl === 'sinumerik') add(`T="${String(op.toolName).replace(/"/g, '')}" D1 M6`);
    else if (ctrl === 'fanuc') add(`T${pad2(op.toolNo)}${pad2(op.toolNo)}${note(op.toolName)}`);
    else add(`T${op.toolNo} M6${note(op.toolName)}`);
    const ctx = { ctrl, set, m, op, add, cmt, note, xo, dia, sWord, prms };
    if (isKeyway(op)) emitKeyway(ctx);
    else if (op.kind === 'mill') emitMill(ctx);
    else if (op.side === 'radial') emitRadialDrill(ctx);
    else emitFaceDrill(ctx);
    safe();
  });

  add(`G18 ${ctrl === 'fanuc' ? 'G99' : 'G95'}${note('zpět rovina ZX, posuv mm/ot')}`);
  add(cmt('Další soustružení za blokem: znovu zapnout hlavní vřeteno M3/M4'));
  add(cmt(LIVE_END));
  return L;
}

// ── společné: start nástroje, polohování C, prodleva ──────────────
function toolStart({ ctrl, op, add, note, m, sWord }) {
  add(`${ctrl === 'sinumerik' ? 'G94' : (ctrl === 'fanuc' ? 'G98' : 'G94')} F${f3(op.feed)}${note('posuv mm/min')}`);
  add(`${sWord(op.rpm)} ${m.toolOn}${note('poháněný nástroj – dle stroje')}`);
}
function toolStop({ add, note, m }) { add(`${m.toolOff}${note('stop poháněného nástroje')}`); }

// Sinumerik: SPOS = polohování vřetena; osa C (M70) potřebuje i TRANSMIT
// (transformace pracuje s vřetenem v režimu osy) a frézování přes C.
const axisMode = set => set.mode === 'caxis' || set.mode === 'transmit';
function cOn({ ctrl, add, note, m, set }) {
  if (ctrl === 'sinumerik') {
    add(`SPOS=0${note('vřeteno do polohové regulace')}`);
    if (axisMode(set)) add(`${m.cOn}${note('vřeteno jako osa C – dle stroje')}`);
  } else add(`${m.cOn}${note('osa C zap – dle stroje')}`);
}
function cOff({ ctrl, add, note, m, set }) {
  // Sinumerik: zpět do otáčkového režimu (SPCOF); v režimu osy podle nastavení.
  if (ctrl === 'sinumerik') add(`${axisMode(set) ? m.cOff : 'SPCOF'}${note('vřeteno zpět do otáčkového režimu')}`);
  else add(`${m.cOff}${note('osa C vyp – dle stroje')}`);
}
/** Natočení dílu na úhel `a` (SPOS nebo C), kalibrovaný (angOf). */
function rotate({ ctrl, set, add }, a) {
  const an = f3(angOf(set, a));
  if (ctrl === 'sinumerik') add(set.mode === 'caxis' ? `G0 ${set.cName}=DC(${an})` : `SPOS=${an}`);
  else add(`G0 ${set.cName}${an}`);
}
function dwell({ ctrl, add }, sec) {
  if (!(sec > 0)) return;
  if (ctrl === 'fanuc') add(`G4 X${f3(sec)}`);
  else add(`G4 F${f3(sec)}`);
}

/**
 * Rozepsané vrtání v ose `ax` (Z nebo X). Hodnoty jsou ve zápisu programu
 * (`w` převádí poloměr → výstup), směr vrtání = klesající hodnota.
 */
function explicitDrill(ctx, ax, w, rfp, op, out = 1) {
  // `out` = směr odjezdu od plochy (+1: do kladných hodnot, vrtá se k záporným).
  const { add } = ctx;
  add(`G0 ${ax}${w(rfp + out * op.safe)}`);
  const lv = depthLevels(op.depth, op.peck);
  lv.forEach((d, k) => {
    add(`G1 ${ax}${w(rfp - out * d)} F${f3(op.feed)}`);
    if (k < lv.length - 1) {
      // Lámání třísky: jen odskok o chipBack; vyjíždění: ven na R rovinu a zpět 0,3 nad dno.
      if (op.chipMode === 'break') add(`G0 ${ax}${w(rfp - out * (d - op.chipBack))}`);
      else {
        add(`G0 ${ax}${w(rfp + out * op.safe)}`);
        add(`G0 ${ax}${w(rfp - out * (d - 0.3))}`);
      }
    }
  });
  dwell(ctx, op.dwell);
  add(`G0 ${ax}${w(rfp + out * op.retract)}`);
}

/**
 * Fanuc G83 / G87 s Q: vyjíždění × lámání třísky v programu nejde zvolit —
 * určuje ho parametr stroje (0i: č. 5101 bit 2 RTR). Poznámka do programu,
 * ať se to ověří (op.chipMode = co chce uživatel).
 */
function fanucChipNote({ add, cmt, op }) {
  add(cmt(`Tříska: ${op.chipMode === 'break' ? 'lámání' : 'vyjíždění'} — u G83/G87 ho volí parametr stroje (Fanuc 0i: 5101 bit 2 RTR) — ověřte, případně Zápis vrtání Rozepsaně`));
}

/** Sinumerik CYCLE82 / CYCLE83 (klasické pořadí parametrů). */
function sinCycle(op, rfp, w, out = 1) {
  // Směr vrtání si cyklus určí z pořadí RTP → RFP → DP (čelo zleva: DP > RFP).
  const rtp = w(rfp + out * op.retract), rf = w(rfp), sd = f3(op.safe), dp = w(rfp - out * op.depth);
  if (op.peck > 0 && op.peck < op.depth)
    // CYCLE83(RTP, RFP, SDIS, DP, DPR, FDEP, FDPR, DAM, DTB, DTS, FRF, VARI):
    // FDEP = 1. záběr (absolutně), DAM = 0 → všechny záběry stejné (DAM > 0
    // by je zkracovalo), VARI = 1 → vyjetí z díry, 0 → lámání třísky (op.chipMode;
    // velikost odskoku u VARI = 0 dává strojní data cyklu).
    return `CYCLE83(${rtp}, ${rf}, ${sd}, ${dp}, , ${w(rfp - out * op.peck)}, , 0, ${f3(op.dwell)}, 0, 1, ${op.chipMode === 'break' ? 0 : 1})`;
  return `CYCLE82(${rtp}, ${rf}, ${sd}, ${dp}, , ${f3(op.dwell)})`;
}

// ── vrtání do čela (osa Z) ─────────────────────────────────────
function emitFaceDrill(ctx) {
  const { ctrl, set, op, add, note, xo } = ctx;
  const pos = livePositions(op);
  const zw = v => f3(v);
  const cyc = set.cycles && ctrl !== 'heidenhain';
  const out = faceOut(op);
  const rtp = op.zTop + out * op.retract;
  if (out < 0) add(ctx.cmt('Čelo zleva: nástroj stojí vlevo od čela, vrtá se ve směru +Z'));
  cOn(ctx);
  toolStart(ctx);
  if (ctrl === 'sinumerik' && set.mode === 'transmit') {
    add(`DIAMOF${note('TRANSMIT: X/Y v poloměru')}`);
    add('TRANSMIT');
    add(`G17${note('rovina XY, vrtání v Z')}`);
    pos.forEach((p, k) => {
      // První najetí: nejdřív Z (nástroj je ještě venku na bezpečné X), pak X/Y.
      if (k === 0) add(`G0 Z${zw(rtp)}`);
      const q = xyOf(set, p.x, p.y);
      add(`G0 X${f3(q.x)} Y${f3(q.y)}${note(`díra ${k + 1}: úhel ${f3(angOf(set, p.a))}° R${f3(p.r)}`)}`);
      if (cyc) add(sinCycle(op, op.zTop, zw, out)); else explicitDrill(ctx, 'Z', zw, op.zTop, op, out);
    });
    add('TRAFOOF');
    if (ctx.dia) add('DIAMON');
    add('G18');
  } else if (ctrl === 'fanuc' && cyc) {
    // G83 X C Z R Q P F — R = vzdálenost výchozí roviny → roviny R (poloměrem).
    const q = op.peck > 0 && op.peck < op.depth ? ` Q${Math.round(op.peck * 1000)}` : '';
    if (q) fanucChipNote(ctx);
    const p = op.dwell > 0 ? ` P${Math.round(op.dwell * 1000)}` : '';
    pos.forEach((h, k) => {
      if (k === 0) {
        add(`G0 Z${zw(rtp)}`);
        add(`G0 X${xo(h.r)} ${set.cName}${f3(angOf(set, h.a))}`);
        add(`G83 X${xo(h.r)} ${set.cName}${f3(angOf(set, h.a))} Z${zw(op.zTop - out * op.depth)} R${f3(out * (op.safe - op.retract))}${q}${p} F${f3(op.feed)}${note(`díra 1`)}`);
      } else add(`X${xo(h.r)} ${set.cName}${f3(angOf(set, h.a))}${note(`díra ${k + 1}`)}`);
    });
    add('G80');
  } else {
    if (ctrl === 'sinumerik') add(`G17${note('vrtání v ose Z')}`);
    pos.forEach((h, k) => {
      if (k === 0) add(`G0 Z${zw(rtp)}`);
      rotate(ctx, h.a);
      add(`G0 X${xo(h.r)}${note(`díra ${k + 1}: úhel ${f3(angOf(set, h.a))}°`)}`);
      if (cyc) add(sinCycle(op, op.zTop, zw, out)); else explicitDrill(ctx, 'Z', zw, op.zTop, op, out);
    });
    if (ctrl === 'sinumerik') add('G18');
  }
  toolStop(ctx);
  cOff(ctx);
}

// ── radiální vrtání do pláště (osa X) ──────────────────────────
function emitRadialDrill(ctx) {
  const { ctrl, set, op, add, note, xo } = ctx;
  const pos = livePositions(op);
  const rX = op.xTop / 2;
  const cyc = set.cycles && ctrl !== 'heidenhain';
  // TRANSMIT na plášti nemá smysl — díry se polohují osou C / SPOS.
  const c2 = { ...ctx, set: { ...set, mode: set.mode === 'transmit' ? 'caxis' : set.mode } };
  cOn(c2);
  toolStart(c2);
  if (ctrl === 'fanuc' && cyc) {
    const q = op.peck > 0 && op.peck < op.depth ? ` Q${Math.round(op.peck * 1000)}` : '';
    if (q) fanucChipNote(ctx);
    const p = op.dwell > 0 ? ` P${Math.round(op.dwell * 1000)}` : '';
    pos.forEach((h, k) => {
      // Jiná výška Z: zrušit cyklus, vyjet na bezpečnou X, přejet a cyklus znovu
      // (v cyklu by se Z přejíždělo jen ve výchozí rovině těsně nad pláštěm).
      const zMove = k > 0 && Math.abs(h.z - pos[k - 1].z) > 1e-6;
      if (k === 0 || zMove) {
        if (zMove) { add('G80'); add(`G0 X${ctx.prms.safeX}`); }
        add(`G0 Z${f3(h.z)} ${set.cName}${f3(angOf(set, h.a))}`);
        add(`G0 X${xo(rX + op.retract)}`);
        add(`G87 Z${f3(h.z)} ${set.cName}${f3(angOf(set, h.a))} X${xo(rX - op.depth)} R${f3(op.safe - op.retract)}${q}${p} F${f3(op.feed)}${note(`díra ${k + 1}`)}`);
      } else add(`Z${f3(h.z)} ${set.cName}${f3(angOf(set, h.a))}${note(`díra ${k + 1}`)}`);
    });
    add('G80');
  } else {
    // Sinumerik: G19 = vrtací osa X; cykly počítají v poloměru → DIAMOF.
    if (ctrl === 'sinumerik') { add(`G19${note('vrtání v ose X')}`); add(`DIAMOF${note('X v poloměru')}`); }
    const xw = ctrl === 'sinumerik' ? (v => f3(v)) : xo;
    pos.forEach((h, k) => {
      // Jiná výška než předchozí díra: přejezd v Z nad pláštěm by mohl narazit
      // do osazení — nejdřív ven na bezpečnou X (pod DIAMOF je to poloměr,
      // tedy ještě dál), pak Z a zpět k plášti.
      const zMove = k > 0 && Math.abs(h.z - pos[k - 1].z) > 1e-6;
      if (zMove) add(`G0 X${ctx.prms.safeX}`);
      rotate(c2, h.a);
      add(`G0 Z${f3(h.z)}${note(`díra ${k + 1}: úhel ${f3(angOf(set, h.a))}°`)}`);
      if (k === 0 || zMove) add(`G0 X${xw(rX + op.retract)}`);
      if (cyc) add(sinCycle(op, rX, xw)); else explicitDrill(c2, 'X', xw, rX, op);
    });
    if (ctrl === 'sinumerik') { if (ctx.dia) add('DIAMON'); add('G18'); }
  }
  toolStop(c2);
  cOff(c2);
}

// ── drážka pro pero v plášti (fréza radiálně, posuv v Z) ────────
// Kus stojí na úhlu C (SPOS / C — jako radiální vrtání), fréza Ø = šířka
// drážky zanoří v X (zmenšeným posuvem, musí řezat středem) a jede v Z mezi
// středy zaoblených konců; vrstvy po stepDown střídavě tam a zpět. X ve
// zápisu programu (Ø / poloměr), rovina ZX — žádná transformace není třeba.
function emitKeyway(ctx) {
  const { set, op, add, note, xo, cmt } = ctx;
  const pos = livePositions(op);
  const rX = op.xTop / 2, k = keywaySpan(op);
  const c2 = { ...ctx, set: { ...set, mode: set.mode === 'transmit' ? 'caxis' : set.mode } };
  add(cmt('Drážka pro pero: kus stojí na úhlu C, fréza zanořuje v X a jede v Z — fréza musí řezat středem'));
  cOn(c2);
  toolStart(c2);
  const plungeF = f3(Math.max(1, op.feed * 0.3));
  const levels = depthLevels(op.depth, op.stepDown);
  pos.forEach((p, i) => {
    rotate(c2, p.a);
    add(`G0 Z${f3(k.za)}${note(`drážka ${i + 1}: úhel ${f3(angOf(set, p.a))}°`)}`);
    add(`G0 X${xo(rX + op.retract)}`);
    add(`G0 X${xo(rX + op.safe)}`);
    let atA = true;
    levels.forEach(d => {
      add(`G1 X${xo(rX - d)} F${plungeF}`);
      add(`G1 Z${f3(atA ? k.zb : k.za)} F${f3(op.feed)}`);
      atA = !atA;
    });
    add(`G0 X${xo(rX + op.retract)}`);
  });
  toolStop(c2);
  cOff(c2);
}

// ── frézování na čele (kapsa / drážka) ─────────────────────────
function emitMill(ctx) {
  const { ctrl, set, op, add, note, xo } = ctx;
  const moves = millMoves(op);
  const transmit = set.mode === 'transmit' && ctrl !== 'heidenhain';
  const c2 = { ...ctx, set: { ...set, mode: transmit ? 'transmit' : 'caxis' } };
  if (!transmit) add(ctx.cmt('Frézování mimo osu: rozloženo na krátké G1 v X + C (interpolace osy C)'));
  if (ctrl === 'sinumerik' && !transmit) add(ctx.cmt('Nástroj musí umět zanořit středem (kapsa se zanořuje kolmo)'));
  cOn(c2);
  toolStart(c2);
  const plungeF = f3(Math.max(1, op.feed * 0.3));
  let cur = null;
  if (transmit) {
    if (ctrl === 'sinumerik') { add(`DIAMOF${note('TRANSMIT: X/Y v poloměru')}`); add('TRANSMIT'); add('G17'); }
    else {
      add(ctx.cmt('Rovinu a osy polární interpolace určují parametry stroje'));
      add(`G12.1${note('polární interpolace: X = Ø, C = Y v mm')}`);
    }
    const xy = (x, y) => {
      const q = xyOf(set, x, y);
      return ctrl === 'sinumerik' ? `X${f3(q.x)} Y${f3(q.y)}` : `X${xo(q.x)} ${set.cName}${f3(q.y)}`;
    };
    // Zrcadlený směr úhlu (−) obrací i smysl oblouku: G3 ↔ G2.
    const arcG = set.angleDir < 0 ? 'G2' : 'G3';
    moves.forEach(mv => {
      if (!cur) add(`G0 Z${f3(mv.z)}`);   // první najetí: nejdřív Z (venku na bezpečné X)
      if (mv.k === 'rapid') add(`G0 ${xy(mv.x, mv.y)} Z${f3(mv.z)}`);
      else if (mv.k === 'lin') add(`G1 ${xy(mv.x, mv.y)} Z${f3(mv.z)} F${mv.plunge ? plungeF : f3(op.feed)}`);
      else {
        const r = Math.hypot(cur.x - mv.cx, cur.y - mv.cy);
        const c0 = xyOf(set, cur.x, cur.y), cc = xyOf(set, mv.cx, mv.cy);
        add(ctrl === 'sinumerik'
          ? `${arcG} ${xy(mv.x, mv.y)} I${f3(cc.x - c0.x)} J${f3(cc.y - c0.y)}`
          : `${arcG} ${xy(mv.x, mv.y)} R${f3(r)}`);
      }
      cur = mv;
    });
    if (ctrl === 'sinumerik') { add('TRAFOOF'); if (ctx.dia) add('DIAMON'); add('G18'); }
    else add('G13.1');
  } else {
    // Polární rozklad: kartézský bod → X (poloměr/Ø) + C (úhel). U osy nemá
    // úhel smysl — drží se předchozí.
    let lastA = 0;
    const polar = (x, y) => {
      const r = Math.hypot(x, y);
      if (r > 1e-6) lastA = norm360(Math.atan2(y, x) * 180 / Math.PI);
      return { r, a: lastA };
    };
    // Úhel C: Fanuc / Heidenhain absolutně bez nejkratší cesty by v G1 přes
    // 0°/360° (C357,7 → C0) otočil kus o −358° s frézou v materiálu → úhel
    // spojitě od předchozího bodu (může vyjít < 0 nebo > 360). Sinumerik: DC().
    // POSUV (uživatel 21. 10. 2026): v G1 X… C… řídicí systém počítá dráhu se
    // stupni osy C jako s milimetry (Fanuc, Heidenhain; Sinumerik s FGROUP
    // X, Z, C a výchozím FGREF 57,296 mm = 1° ~ 1 mm), břit ale jede r·Δφ —
    // na R100 je 1° = 1,75 mm, fréza by jela 1,75× rychleji. F se proto
    // přepočítá pro každý úsek: F · L(ΔX poloměrem, ΔC°, ΔZ) / L(skutečně, mm).
    if (ctrl === 'sinumerik') add(`FGROUP(X, Z, ${set.cName})${note('posuv po dráze X, Z i C (FGREF: 1° = 1 mm)')}`);
    add(ctx.cmt('F přepočten pro každý úsek X + C na skutečný posuv břitu — ověřte na stroji'));
    const plungeN = Math.max(1, op.feed * 0.3);
    let last = null;   // poslední bod { x, y, z } kartézsky a { r, c } na stroji
    const emitPt = (type, x, y, z, fBase) => {
      const p = polar(x, y);
      const an = angOf(set, p.a);
      const c = last ? an + 360 * Math.round((last.c - an) / 360) : an;
      let fw = '';
      if (type === 'G1' && fBase > 0) {
        const la = last ? Math.hypot(x - last.x, y - last.y, z - last.z) : 0;
        const lc = last ? Math.hypot(p.r - last.r, c - last.c, z - last.z) : 0;
        fw = ` F${f3(la > 1e-9 ? fBase * lc / la : fBase)}`;
      }
      add(`${type} X${xo(p.r)} ${ctrl === 'sinumerik' ? `${set.cName}=DC(${f3(an)})` : `${set.cName}${f3(c)}`} Z${f3(z)}${fw}`);
      last = { x, y, z, r: p.r, c };
    };
    moves.forEach(mv => {
      if (!cur) add(`G0 Z${f3(mv.z)}`);   // první najetí: nejdřív Z (venku na bezpečné X)
      if (mv.k === 'rapid') emitPt('G0', mv.x, mv.y, mv.z);
      else if (mv.k === 'lin') {
        // Dlouhý přímý úsek se v polárních souřadnicích ohne → rozdělit.
        const from = cur || mv;
        const n = Math.max(1, Math.ceil(Math.hypot(mv.x - from.x, mv.y - from.y) / 1));
        for (let j = 1; j <= n; j++) {
          const t = j / n;
          emitPt('G1', from.x + (mv.x - from.x) * t, from.y + (mv.y - from.y) * t, mv.z, mv.plunge ? plungeN : op.feed);
        }
      } else {
        const r = Math.hypot(cur.x - mv.cx, cur.y - mv.cy);
        let a0 = Math.atan2(cur.y - mv.cy, cur.x - mv.cx), a1 = Math.atan2(mv.y - mv.cy, mv.x - mv.cx);
        if (a1 <= a0) a1 += 2 * Math.PI;
        const n = Math.max(8, Math.ceil(r * (a1 - a0) / 1));
        for (let j = 1; j <= n; j++) {
          const a = a0 + (a1 - a0) * j / n;
          emitPt('G1', mv.cx + r * Math.cos(a), mv.cy + r * Math.sin(a), mv.z, op.feed);
        }
      }
      cur = mv;
    });
    if (ctrl === 'sinumerik') add(`FGROUP()${note('posuv zpět jen po geometrických osách')}`);
  }
  toolStop(c2);
  cOff(c2);
}
