// KONTROLY OPERACÍ POHÁNĚNÝMI NÁSTROJI proti skutečnému tvaru dílu.
//
// Čisté funkce nad profilem z liveCut.liveProfile(S) (objekty CAD: x = Z,
// y = poloměr). Díl je rotační — materiál v rovině Z jsou mezikruží
// (faceReference.materialAt), takže díru / kapsu / drážku na čele stačí
// porovnat jejím rozsahem poloměrů [lo, hi] („stopa"). Kontroluje se HOTOVÝ
// díl (kontura): blok poháněných nástrojů jede až po soustružení — kromě
// díry skrz vč. polotovaru (op.throughStock), ta se vrtá do polotovaru.
//
// Kontroly (každá = jedna ověřitelná podmínka):
//   1. čelo: stopa leží celá v materiálu čela (řez 0,3 mm za rovinou zTop
//      ve směru vrtání — stejně jako plocha řezu v pohledu, sectionAt),
//   2. čelo: do plné hloubky zůstane stopa celá v materiálu (jinak skrz /
//      náraz do vývrtu / výjezd z obvodu),
//   3. plášť: Ø pláště op.xTop = Ø dílu v Z díry (± 0,1 mm), díra neleží na
//      přechodu průměrů, hloubka nevede do vývrtu (osu hlídá liveOpProblems),
//   4. bezpečná vzdálenost a odjezd nevedou do materiálu (bližší osazení).
// Nález: { sev: 'error' | 'warn', text } — 'warn' = může být záměr (díra
// skrz, radiální díra do vývrtu, díra na přechodu průměrů).
import { materialAt, objectPoints } from '../../../faceView/faceReference.js';
import { livePositions, liveOpProblems, faceOut, isKeyway, keywaySpan, slotWidth } from './liveModel.js';

const LATHE = 'soustruh';
const SECT = 0.3;      // [mm] řez za rovinou čela (jako sectionAt v pohledu)
const TOL = 1e-3;      // [mm] dotyk se za zásah nepočítá
const DIA_TOL = 0.1;   // [mm] shoda Ø pláště s dílem

/**
 * Sonda materiálu: mezikruží v rovině z (cache), Z zlomů profilu.
 * `withStock`: materiál = díl NEBO polotovar (díra skrz vč. polotovaru se
 * vrtá před soustružením — op.throughStock z CAD, faceDepth.holeForCam).
 */
export function materialProbe(prof, withStock = false) {
  const objs = prof.objects.filter(o => !o.isStock);
  const stock = withStock ? [...prof.objects, ...(prof.cylStock || [])].filter(o => o.isStock).map(o => ({ ...o, isStock: false })) : [];
  const breaks = [...new Set([...objs, ...stock].flatMap(o => objectPoints(o).map(p => +(+p.x).toFixed(4))))]
    .filter(Number.isFinite).sort((a, b) => a - b);
  const cache = new Map();
  const at = z => {
    // V rovině zlomu je průsečík dvojznačný (konec úsečky = začátek další).
    if (breaks.some(b => Math.abs(b - z) < 1e-4)) z += 2e-4;
    const k = z.toFixed(5);
    if (!cache.has(k)) cache.set(k, stock.length ? unionIv(materialAt(objs, LATHE, z), materialAt(stock, LATHE, z)) : materialAt(objs, LATHE, z));
    return cache.get(k);
  };
  return { at, breaks };
}

/** Sjednocení mezikruží [[a, b]…] (seřazené, překryvy slité). */
function unionIv(a, b) {
  const out = [];
  [...a, ...b].sort((p, q) => p[0] - q[0]).forEach(([lo, hi]) => {
    const last = out[out.length - 1];
    if (last && lo <= last[1] + TOL) last[1] = Math.max(last[1], hi);
    else out.push([lo, hi]);
  });
  return out;
}

const holding = (iv, lo, hi) => iv.find(([a, b]) => a <= lo + TOL && hi <= b + TOL);
const overlapping = (iv, lo, hi) => iv.filter(([a, b]) => a < hi - TOL && b > lo + TOL);
const around = (iv, r) => iv.find(([a, b]) => r >= a - TOL && r <= b + TOL);

/**
 * První vzdálenost t ∈ [t0, len] od z0 ve směru dir (±1), kde platí
 * pred(mezikruží); null = nikde. Vzorky: jemný krok + obě strany každého
 * zlomu profilu, přechod zpřesněný půlením.
 */
function scan(probe, z0, dir, t0, len, pred) {
  if (!(len >= t0)) return null;
  const ts = new Set([t0, len]);
  const step = Math.max(0.05, Math.min(0.5, (len - t0) / 40));
  for (let t = t0 + step; t < len; t += step) ts.add(t);
  probe.breaks.forEach(b => {
    const t = (b - z0) * dir;
    if (t > t0 && t < len) { ts.add(t - 1e-3); ts.add(t + 1e-3); }
  });
  const list = [...ts].filter(t => t >= t0 && t <= len).sort((a, b) => a - b);
  const test = t => pred(probe.at(z0 + dir * t));
  for (let i = 0; i < list.length; i++) {
    if (!test(list[i])) continue;
    if (i === 0) return list[0];
    let lo = list[i - 1], hi = list[i];
    for (let k = 0; k < 30 && hi - lo > 1e-4; k++) { const m = (lo + hi) / 2; if (test(m)) hi = m; else lo = m; }
    return hi;
  }
  return null;
}

const fmt = v => String(+(+v).toFixed(2)).replace('.', ',');
const dia = r => `Ø${fmt(2 * r)}`;
const ring = ([a, b]) => (a > 0.05 ? `${dia(a)}–${dia(b)}` : `plné ${dia(b)}`);

/** Vzdálenost bodu (0, 0) od úsečky — nejmenší poloměr drážky. */
function segDist(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, -(x1 * dx + y1 * dy) / L2)) : 0;
  return Math.hypot(x1 + t * dx, y1 + t * dy);
}

/** Stopy na čele: rozsah poloměrů [lo, hi] každé díry / kapsy, drážka celá. */
function faceFootprints(op) {
  if (op.kind === 'mill' && op.millType === 'slot') {
    const { x1, y1, x2, y2 } = op.slot, tr = slotWidth(op) / 2;
    return [{ lo: Math.max(0, segDist(x1, y1, x2, y2) - tr), hi: Math.max(Math.hypot(x1, y1), Math.hypot(x2, y2)) + tr }];
  }
  const h = op.holeD / 2;
  return livePositions(op).map(p => ({ lo: Math.max(0, p.r - h), hi: p.r + h }));
}

/** Kontroly 1, 2 a 4 pro operaci do čela → found.push({ i, sev, text }). */
function faceChecks(probe, prof, op, found) {
  const out = faceOut(op), into = -out;
  const face = `čela Z${fmt(op.zTop)}`, onFace = `čele Z${fmt(op.zTop)}`;
  const iv0 = probe.at(op.zTop + into * SECT);
  const fps = faceFootprints(op);
  if (!iv0.length) {
    const text = `za čelem Z${fmt(op.zTop)} (${out < 0 ? '▶ zleva' : '◀ zprava'}) není materiál dílu – zkontrolujte Z čela a stranu čela.`;
    fps.forEach((_, i) => found.push({ i, sev: 'error', text }));
    return;
  }
  const span = prof.max - prof.min + 1;
  fps.forEach(({ lo, hi }, i) => {
    const err = text => found.push({ i, sev: 'error', text });
    const mid = (lo + hi) / 2;
    // 1. Stopa v materiálu čela.
    if (!holding(iv0, lo, hi)) {
      const m = around(iv0, mid);
      if (!m) { err(`mimo materiál ${face} – stopa ${dia(lo)}–${dia(hi)}, čelo ${iv0.map(ring).join(', ')}.`); return; }
      if (hi > m[1] + TOL) err(m === iv0[iv0.length - 1] ? `přesah přes obvod ${face} – stopa do ${dia(hi)}, čelo ${dia(m[1])}.`
        : `zásah do zápichu na ${onFace} – stopa do ${dia(hi)}, materiál do ${dia(m[1])}.`);
      if (lo < m[0] - TOL) err(m === iv0[0] ? `zásah do vývrtu ${dia(m[0])} na ${onFace} – stopa od ${dia(lo)}.`
        : `zásah do zápichu na ${onFace} – stopa od ${dia(lo)}, materiál od ${dia(m[0])}.`);
      return;
    }
    // 2. Hloubka: stopa celá v materiálu až do plné hloubky.
    const t = scan(probe, op.zTop, into, SECT, op.depth, iv => !holding(iv, lo, hi));
    if (t != null && t < op.depth - TOL) {
      const zz = op.zTop + into * t, iv = probe.at(zz);
      const where = `v hloubce ${fmt(t)} mm (Z${fmt(zz)})`;
      const m = overlapping(iv, lo, hi).length ? (around(iv, mid) || overlapping(iv, lo, hi)[0]) : null;
      if (!m) {
        found.push({ i, sev: 'warn', text: `skrz – materiál končí ${where}, hloubka ${fmt(op.depth)} mm. Ověřte, co je za dílem (upínač).` });
      } else {
        if (lo < m[0] - TOL) err(`náraz do ${m === iv[0] ? 'vývrtu' : 'zápichu'} ${dia(m[0])} ${where}.`);
        if (hi > m[1] + TOL) err(m === iv[iv.length - 1] ? `výjezd z obvodu ${dia(m[1])} ${where}.` : `náraz do zápichu ${dia(m[1])} ${where}.`);
      }
    }
    // 4. Nad čelem (strana nástroje) až po odjezd nesmí být materiál.
    const tf = scan(probe, op.zTop, out, 0.01, Math.max(op.retract, op.safe), iv => overlapping(iv, lo, hi).length > 0);
    if (tf == null) return;
    const zz = op.zTop + out * tf, iv = probe.at(zz);
    if (tf <= SECT && holding(iv, lo, hi)) {
      const ts = scan(probe, op.zTop, out, tf, span, v => !overlapping(v, lo, hi).length);
      err(ts == null ? `Z čela ${fmt(op.zTop)} leží v materiálu.`
        : `Z čela ${fmt(op.zTop)} leží v materiálu – povrch je o ${fmt(ts)} mm dál (Z${fmt(op.zTop + out * ts)}).`);
      return;
    }
    const [a, b] = overlapping(iv, lo, hi)[0];
    const obst = dia(b < hi - TOL ? b : (a > lo + TOL ? a : b));
    if (tf <= SECT) err(`zásah do osazení ${obst} nad čelem Z${fmt(op.zTop)}.`);
    else if (tf <= op.safe + TOL) err(`bezpečná vzdálenost ${fmt(op.safe)} mm narazí do osazení ${obst} – je jen ${fmt(tf)} mm nad čelem (Z${fmt(zz)}).`);
    else err(`odjezd ${fmt(op.retract)} mm narazí do osazení ${obst} – je jen ${fmt(tf)} mm nad čelem (Z${fmt(zz)}).`);
  });
}

/** Kontroly 3 a 4 pro radiální díry → found.push({ i, sev, text }). */
function radialChecks(probe, op, found) {
  const h = op.holeD / 2, R0 = op.xTop / 2;
  // Drážka pro pero: v Z celá délka drážky (zaoblené konce = Ø frézy).
  const kw = isKeyway(op) ? keywaySpan(op) : null;
  livePositions(op).forEach((p, i) => {
    const lo = kw ? kw.zMin : p.z - h, hi = kw ? kw.zMax : p.z + h;
    const err = (text, sev = 'error') => found.push({ i, sev, text });
    const ivc = probe.at(p.z);
    if (!ivc.length) { err(`mimo díl – v Z${fmt(p.z)} není materiál.`); return; }
    const R = ivc[ivc.length - 1][1];
    // 3. Ø pláště odpovídá dílu v Z díry.
    if (Math.abs(2 * R - op.xTop) > DIA_TOL) {
      err(`Ø pláště ${fmt(op.xTop)} neodpovídá dílu – v Z${fmt(p.z)} je ${dia(R)}.`);
      return;
    }
    // Povrch pod celou šířkou díry (Z ± Ø/2): konec dílu, osazení, kužel.
    let rMin = Infinity, rMax = 0, gone = false;
    const zs = new Set([lo + 0.01, hi - 0.01]);
    for (let k = 1; k < 10; k++) zs.add(lo + (hi - lo) * k / 10);
    probe.breaks.forEach(b => { if (b > lo && b < hi) { zs.add(b - 1e-3); zs.add(b + 1e-3); } });
    zs.forEach(z => {
      const iv = probe.at(z);
      if (!iv.length) { gone = true; return; }
      const r = iv[iv.length - 1][1];
      rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
    });
    if (gone) err(`přesah za konec dílu – ${kw ? "drážka" : "díra"} zabírá Z${fmt(lo)} až Z${fmt(hi)}.`);
    else if (rMax - R0 > op.safe + TOL) {
      // 4. Osazení u díry vyšší než bezpečná rovina / odjezd.
      const up = rMax - R0;
      err(up > op.retract + TOL
        ? `bezpečná vzdálenost i odjezd končí v materiálu – osazení ${dia(rMax)} u díry je ${fmt(up)} mm nad pláštěm.`
        : `bezpečná vzdálenost ${fmt(op.safe)} mm končí v materiálu – osazení ${dia(rMax)} u díry je ${fmt(up)} mm nad pláštěm.`);
    } else if (rMax - rMin > DIA_TOL / 2) {
      // Drážka pro pero přes osazení má po délce jinou hloubku / vyjede ze
      // stěny — chyba; díra na přechodu může být záměr.
      if (kw) err(`drážka vede přes osazení – plášť ${dia(rMin)} až ${dia(rMax)}.`);
      else err(`na přechodu průměrů – pod dírou ${dia(rMin)} až ${dia(rMax)}.`, 'warn');
    }
    // 3. Hloubka do vývrtu (přejetí osy hlídá liveOpProblems).
    const m = around(ivc, R0 - 0.01) || ivc[ivc.length - 1];
    // Díra skrz stěnu z výkresu (op.throughWall) má do vývrtu vést.
    if (m[0] > 0.05 && R0 - op.depth < m[0] - TOL && !op.throughWall)
      err(`skrz stěnu do vývrtu ${dia(m[0])} – stěna ${fmt(m[1] - m[0])} mm, hloubka ${fmt(op.depth)} mm.`, 'warn');
  });
}

/** Čísla děr 0,1,2,4 → „1–3, 5". */
function idxList(ix) {
  const s = [...new Set(ix)].sort((a, b) => a - b), parts = [];
  for (let k = 0; k < s.length; k++) {
    let j = k;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    parts.push(j - k >= 2 ? `${s[k] + 1}–${s[j] + 1}` : (j > k ? `${s[k] + 1}, ${s[j] + 1}` : `${s[k] + 1}`));
    k = j;
  }
  return parts.join(', ');
}

function label(op, ix) {
  if (op.kind === 'mill' && op.millType === 'slot') return 'Drážka';
  if (isKeyway(op)) return `${ix.length > 1 ? 'Drážky' : 'Drážka'} ${idxList(ix)}`;
  const [one, many] = op.kind === 'mill' ? ['Kapsa', 'Kapsy'] : ['Díra', 'Díry'];
  return `${ix.length > 1 ? many : one} ${idxList(ix)}`;
}

/**
 * Kontrola jedné operace proti dílu.
 * @returns {{ issues: {sev, text}[], marks: Map<number, 'error'|'warn'>, sev: 'error'|'warn'|null }}
 *   marks = index díry (drážka 0) → nejhorší nález
 */
export function checkLiveOp(prof, op, probe) {
  const res = { issues: [], marks: new Map(), sev: null };
  // Bez kontury není s čím porovnat; chybné zadání hlásí liveOpProblems.
  if (!prof || prof.empty || liveOpProblems(op).length) return res;
  const pr = probe || materialProbe(prof, !!op.throughStock);
  const found = [];
  if (op.side === 'radial') radialChecks(pr, op, found);   // radiální díra i drážka pro pero
  else faceChecks(pr, prof, op, found);
  const groups = new Map();
  found.forEach(f => {
    const k = f.sev + '|' + f.text;
    if (!groups.has(k)) groups.set(k, { sev: f.sev, text: f.text, ix: [] });
    groups.get(k).ix.push(f.i);
    if (f.sev === 'error' || !res.marks.has(f.i)) res.marks.set(f.i, f.sev);
  });
  // Chyby před upozorněními, v rámci druhu podle první díry.
  res.issues = [...groups.values()]
    .sort((a, b) => (a.sev === b.sev ? Math.min(...a.ix) - Math.min(...b.ix) : (a.sev === 'error' ? -1 : 1)))
    .map(g => ({ sev: g.sev, text: `${label(op, g.ix)}: ${g.text}` }));
  res.sev = res.issues.some(x => x.sev === 'error') ? 'error' : (res.issues.length ? 'warn' : null);
  return res;
}

let _memo = { prof: null, key: '', v: null };
/**
 * Kontroly všech operací (pole jako `ops`), null = bez kontury dílu.
 * Pamatuje si poslední výsledek (profil se porovná identitou, operace
 * obsahem) — pohled se překresluje při každém snímku obrábění.
 */
export function checkLiveOps(prof, ops) {
  if (!prof || prof.empty) return null;
  const key = JSON.stringify(ops);
  if (_memo.prof === prof && _memo.key === key) return _memo.v;
  const probe = materialProbe(prof);
  let probeS = null;   // díl + polotovar, jen když je potřeba
  const v = ops.map(op => checkLiveOp(prof, op, op.throughStock ? (probeS || (probeS = materialProbe(prof, true))) : probe));
  _memo = { prof, key, v };
  return v;
}
