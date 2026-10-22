// ╔══════════════════════════════════════════════════════════════╗
// ║  SKICA – metrické závity a závitníky (📚 katalog, díry v CAD)  ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Závity do děr poháněným nástrojem (uživatel 22. 10. 2026): díra se v CAD
// kreslí na Ø PŘEDVRTÁNÍ a nese závit `{ name, pitch }` (holeThreadFields.js);
// CAM ji vyvrtá a pak závitníkem vyřízne závit (cam/live: role 'tap').
// Závitník v 🔧 Zásobníku = slot `shape: 'tap'`, radius = jmenovitý Ø / 2,
// `pitch` = stoupání P [mm], vc [m/min]. Otáčky n = Vc·1000 / (π·Ø),
// posuv F [mm/min] = P · n (závitník jede přesně po stoupání).
// Řada M3–M24 hrubá (ISO 261), předvrtání podle ISO 2306 (≈ Ø − P).
// Rozměry a řezné podmínky (ocel, HSS-E) jsou ORIENTAČNÍ.

const cz = (v) => String(v).replace('.', ',');
const r3 = (v) => Math.round(v * 1000) / 1000;

/** Metrické závity hrubé: Ø, stoupání, předvrtání. */
export const METRIC_THREADS = [
  { name: 'M3', d: 3, pitch: 0.5, drill: 2.5 },
  { name: 'M4', d: 4, pitch: 0.7, drill: 3.3 },
  { name: 'M5', d: 5, pitch: 0.8, drill: 4.2 },
  { name: 'M6', d: 6, pitch: 1, drill: 5 },
  { name: 'M8', d: 8, pitch: 1.25, drill: 6.8 },
  { name: 'M10', d: 10, pitch: 1.5, drill: 8.5 },
  { name: 'M12', d: 12, pitch: 1.75, drill: 10.2 },
  { name: 'M14', d: 14, pitch: 2, drill: 12 },
  { name: 'M16', d: 16, pitch: 2, drill: 14 },
  { name: 'M20', d: 20, pitch: 2.5, drill: 17.5 },
  { name: 'M24', d: 24, pitch: 3, drill: 21 },
];

/** Závit podle jména („M8"), nebo null. */
export function threadByName(name) {
  return METRIC_THREADS.find(t => t.name === String(name || '').trim().toUpperCase()) || null;
}

/** Popisek do výběru: „M8 · P1,25 · předvrtat ⌀6,8". */
export function threadLabel(t) {
  return `${t.name} · P${cz(t.pitch)} · předvrtat ⌀${cz(t.drill)}`;
}

/**
 * Hloubka závitu [mm] k díře: skrz (stěna `thick`) = celá stěna + 2·P
 * (náběh závitníku vyjde ven), slepá díra hloubky `depth` = depth − 2·P
 * (závitník nesmí do špičky díry). null = nejde (příliš mělká díra).
 */
export function tapDepth(pitch, { through = false, thick = 0, depth = 0 } = {}) {
  const v = through ? thick + 2 * pitch : depth - 2 * pitch;
  return v > pitch ? r3(v) : null;
}

/** Druhy závitníků v katalogu. */
export const ISO_TAP_KINDS = [
  { id: 'hsse-b', label: 'HSS-E, průchozí (lomený břit)', vc: 10, name: 'Zavitnik HSSE B',
    desc: 'Strojní závitník HSS-E s lomeným břitem (tvar B) — třísku tlačí před sebe, na průchozí díry. Do plovoucího pouzdra nebo pevně (synchronní závitování).' },
  { id: 'hsse-c', label: 'HSS-E, slepý (šroubovitá drážka)', vc: 8, name: 'Zavitnik HSSE C',
    desc: 'Strojní závitník HSS-E se šroubovitou drážkou 35° (tvar C) — třísku vyvádí ven, na slepé díry.' },
];
const kindOf = (id) => ISO_TAP_KINDS.find(k => k.id === id) || ISO_TAP_KINDS[0];

/** Závitník jako záznam knihovny (tvar jako buildIsoDrill / buildIsoMill). */
export function buildIsoTap(opts = {}) {
  const kind = kindOf(opts.kind);
  const t = threadByName(opts.thread) || threadByName('M8');
  const L = Math.round(5 * t.d + 40);
  const h = t.d <= 8 ? { code: 'ER16-GB', w: 32, l: 60 } : t.d <= 16 ? { code: 'ER25-GB', w: 42, l: 70 } : { code: 'ER32-GB', w: 50, l: 80 };
  const tool = {
    toolShape: 'tap', toolLength: L, toolAngle: 0, toolTipAngle: 90, toolRadius: t.d / 2,
    toolTipFlat: 0, toolTipMirror: false, toolVbdCode: '', toolClearanceAngle: 0,
    holderLength: h.l, holderWidth: h.w, holderHand: 'R', holderProfile: null,
    knifeAngle: 270, holderInflate: 0, holderInflateAll: false, toolInternal: false,
  };
  return {
    name: `${kind.name} ${t.name}`, vbdCode: '', holderCode: h.code,
    desc: kind.desc, iso: { type: 'TP', kind: kind.id, thread: t.name, holder: h.code },
    material: '', tipRadius: t.d / 2, toolAngle: 0, tipAngle: 90, clearanceAngle: 0,
    vc: kind.vc, f: t.pitch, ap: 0, pitch: t.pitch, thread: t.name, tool,
  };
}

/** Kolik závitníků katalog nabízí. */
export function isoTapCount() { return ISO_TAP_KINDS.length * METRIC_THREADS.length; }

/** Náhled závitníku (SVG): stopka, závitová část s rýhováním. */
export function isoTapSvg(rec, px = 68) {
  const d = rec.tool.toolRadius * 2;
  const w = Math.min(36, 8 + d * 1.2), cx = 50, x0 = cx - w / 2, x1 = cx + w / 2;
  const rows = Array.from({ length: 9 }, (_, i) => `<path d="M${x0} ${60 + i * 4} L${x1} ${57 + i * 4}" stroke="#1e1e2e" stroke-width="1.2"/>`).join('');
  return `<svg viewBox="0 0 100 100" width="${px}" height="${px}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${cx - 18}" y="8" width="36" height="16" rx="2" fill="#585b70"/>
    <rect x="${cx - w * 0.35}" y="24" width="${w * 0.7}" height="34" fill="#a6adc8"/>
    <rect x="${x0}" y="58" width="${w}" height="34" fill="#f9e2af"/>
    <path d="M${x0} 92 L${cx} 97 L${x1} 92 Z" fill="#f9e2af"/>${rows}
  </svg>`;
}
