// ╔══════════════════════════════════════════════════════════════════╗
// ║  Podélné hrubování — ČISTÉ pomocníky nad poli segmentů            ║
// ╚══════════════════════════════════════════════════════════════════╝
// Vyňato z `ops/roughLong.js` (rozdělení generátoru, plán §3.A). Sem patří
// JEN funkce bez jakékoli vazby na stav generátoru — vstup → výstup, nic
// jiného. Cokoli, co potřebuje `prms`, obrys polotovaru nebo obálku držáku,
// do tohohle souboru NEPATŘÍ: takové helpery musí zůstat u svých dat.

/** Klíč hloubky pro Set/Map — hloubky se porovnávají na mikrometr. */
export const depthKey = (x) => Math.round(x * 1000);

// Jemné dělení úseček (~0,4 mm) pro ořez obálkou po částech — dlouhá čára
// dna kapsy se tak zahodí jen v zablokované části, ne celá. Oblouky (krátké
// rohové blendy) se nedělí, ořežou se celé.
export const subdivideLineSegs = (segs, h = 0.4) => {
  const out = [];
  for (const s of segs) {
    if (s.type !== 'line') { out.push(s); continue; }
    const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
    const n = Math.max(1, Math.ceil(len / h));
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      out.push({ ...s,
        x1: s.x1 + (s.x2 - s.x1) * t0, z1: s.z1 + (s.z2 - s.z1) * t0,
        x2: s.x1 + (s.x2 - s.x1) * t1, z2: s.z1 + (s.z2 - s.z1) * t1 });
    }
  }
  return out;
};

// Sloučení navazujících kolineárních úseček po ořezu (jinak sekaný G-kód).
export const mergeCollinearSegs = (segs) => {
  const out = [];
  for (const s of segs) {
    const p = out[out.length - 1];
    if (p && p.type === 'line' && s.type === 'line'
        && Math.hypot(p.x2 - s.x1, p.z2 - s.z1) < 1e-6) {
      const cr = (p.x2 - p.x1) * (s.z2 - s.z1) - (p.z2 - p.z1) * (s.x2 - s.x1);
      const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1) || 1;
      if (Math.abs(cr) / len < 1e-3) { p.x2 = s.x2; p.z2 = s.z2; continue; }
    }
    out.push({ ...s });
  }
  return out;
};

// Dojezd po obrysu se smí použít, jen když NAVAZUJE na aktuální polohu:
// u ZÁPICHU/kapsy má kontura na tomtéž Z víc větví a traceOffsetPath může
// začít na jiné z nich — mezi ně by se emitoval svislý sjezd SKRZ materiál
// (reálný nález na part-10: 6 mm pod hotovní konturu).
export const traceIfContinuous = (segs, x0, z0) => {
  const f = segs[0];
  if (!f) return [];
  return (Math.abs(f.x1 - x0) < 0.1 && Math.abs(f.z1 - z0) < 0.1) ? segs : [];
};

// ── „Hrub. bez schodků | i u čelního" v PODÉLNÉM hrubování ────────────
// Dojezd po ČELNÍ (radiální) stěně je jiná práce než dojezd po kuželu:
// nástroj šplhá v X a v Z se skoro neposune — tedy přesně to, co dělá
// ČELNÍ hrubování. Přepínač „i u čelního" proto platí i tady (dřív se
// vztahoval jen na čelní strategii a v podélné se nedal vypnout jinak než
// vypnutím celého „bez schodků").
// Test: dojezd stoupne v X víc, než ujede v Z (stěna strmější než 45°).
// Rampované dojezdy strmých stěn (roh + rampa pod úhlem zanoření) tím
// NEPROJDOU — ty ujedou v Z podstatně víc a zůstávají zapnuté, protože
// jinak by pod nimi zůstal stát klín materiálu.
// Typicky je takové „čelo" navíc jen MEZNÍ ČÁRA hlídání destičky (stěna má
// přesně úhel plátku, viz buildMachinableContour) — dojezd po ní kopíruje
// limit destičky a nic neubere; schod tam dobere až čelní operace.
export const isFaceLeadOut = (segs) => {
  if (!segs || segs.length === 0) return false;
  const a = segs[0], b = segs[segs.length - 1];
  return Math.abs(b.x2 - a.x1) > Math.abs(b.z2 - a.z1);
};
